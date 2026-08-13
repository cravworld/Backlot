import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { whatsAppAdapter } from "./whatsapp-adapter";
import { emailAdapter } from "./email-adapter";
import type { NotificationChannel, NotificationProvider, WebhookStatusEvent } from "./types";
import { ActionError } from "@/lib/action-error";

const PROVIDERS: Record<NotificationChannel, NotificationProvider> = {
  WHATSAPP: whatsAppAdapter,
  EMAIL: emailAdapter,
};

/** Small pure {{var}} substitution — template *content* authoring is out of Phase 0 scope, this is just the mechanism. */
export function renderTemplate(bodyTemplate: string, vars: Record<string, string>): string {
  return bodyTemplate.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

type DispatchInput = {
  orgId: string;
  filmId?: string | null;
  actorUserId: string;
  templateId?: string | null;
  channel: NotificationChannel;
  recipientPersonId: string;
  subject?: string | null;
  bodyRendered: string;
  /**
   * Per sign-off open question 9: minors are excluded from broad-
   * distribution recipient lists by default and must be explicitly added
   * by someone with the right capability — opt-in, not opt-out. This is
   * enforced here, in the one place every module's dispatch funnels
   * through, rather than in any individual screen, so no future caller
   * can bypass it by mistake.
   */
  allowMinorRecipient?: boolean;
};

/**
 * The single place every module sends a WhatsApp/email message through —
 * nothing else in the codebase is allowed to import an adapter directly.
 * Per phase-0-findings.md §1.5: a module (e.g. CallSheet Ops in Phase 1)
 * references the resulting NotificationMessage.id for delivery status and
 * layers its own module-specific state on top (e.g. acknowledged_at).
 */
export async function dispatchNotification(input: DispatchInput) {
  const recipient = await prisma.person.findFirst({
    where: { id: input.recipientPersonId, orgId: input.orgId },
  });
  if (!recipient) throw new ActionError("Recipient not found in this org.");

  if (recipient.isMinor && !input.allowMinorRecipient) {
    // Per sign-off open question 9, the safe default should exist "from
    // the moment the flag does" — that includes leaving a compliance
    // trail. No NotificationMessage row exists to attach this to (the
    // whole point is nothing was sent), so it's recorded against the
    // recipient directly with a distinct "blocked" action, not "create"
    // or "update", so it reads unambiguously as a rejected attempt rather
    // than a message that went out.
    await recordAuditEvent({
      orgId: input.orgId,
      filmId: input.filmId,
      actorUserId: input.actorUserId,
      action: "blocked",
      entityType: "notification_message",
      entityId: recipient.id,
      after: {
        channel: input.channel,
        recipientPersonId: recipient.id,
        reason: "minor_recipient_not_opted_in",
      },
    });
    throw new ActionError(
      `${recipient.fullName} is flagged as a minor and is excluded from distribution by ` +
        "default (sign-off open question 9). Pass allowMinorRecipient explicitly to override."
    );
  }

  const recipientContact =
    input.channel === "WHATSAPP"
      ? recipient.whatsappNumber ?? recipient.phone
      : recipient.email;
  if (!recipientContact) {
    const kind = input.channel === "WHATSAPP" ? "WhatsApp number or phone" : "email address";
    throw new ActionError(`${recipient.fullName} has no ${kind} on file.`);
  }

  const message = await prisma.notificationMessage.create({
    data: {
      orgId: input.orgId,
      filmId: input.filmId ?? null,
      templateId: input.templateId ?? null,
      channel: input.channel,
      recipientPersonId: recipient.id,
      recipientContact,
      bodyRendered: input.bodyRendered,
      status: "QUEUED",
    },
  });

  // Excludes recipientContact (PII — a phone number or email address) from
  // the audit payload, same discipline as media.ts excluding storage keys.
  await recordAuditEvent({
    orgId: input.orgId,
    filmId: input.filmId,
    actorUserId: input.actorUserId,
    action: "create",
    entityType: "notification_message",
    entityId: message.id,
    after: { channel: message.channel, recipientPersonId: recipient.id, status: "QUEUED" },
  });

  const provider = PROVIDERS[input.channel];
  try {
    const result = await provider.send({
      to: recipientContact,
      subject: input.subject ?? undefined,
      body: input.bodyRendered,
    });

    // Update the row BEFORE the audit call: the message has already gone
    // out over the wire at this point, so the record of that (sentAt,
    // providerMessageId) must land even if recordAuditEvent — which
    // deliberately propagates its own failures — has a problem.
    const sent = await prisma.notificationMessage.update({
      where: { id: message.id },
      data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date() },
    });

    await recordAuditEvent({
      orgId: input.orgId,
      filmId: input.filmId,
      actorUserId: input.actorUserId,
      action: "update",
      entityType: "notification_message",
      entityId: message.id,
      before: { status: "QUEUED" },
      after: { status: "SENT", channel: message.channel },
    });

    return sent;
  } catch (err) {
    const failedReason = err instanceof Error ? err.message : "Unknown dispatch error";

    const failed = await prisma.notificationMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", failedReason },
    });

    await recordAuditEvent({
      orgId: input.orgId,
      filmId: input.filmId,
      actorUserId: input.actorUserId,
      action: "update",
      entityType: "notification_message",
      entityId: message.id,
      before: { status: "QUEUED" },
      after: { status: "FAILED", channel: message.channel, failedReason },
    });

    return failed;
  }
}

/**
 * Applies provider webhook delivery-status events to their matching
 * NotificationMessage rows. Called only from a route handler that has
 * already checked verifyWebhookSignature() itself — this function trusts
 * its input. actorType SYSTEM here is the audit log's first real use of
 * that enum value: these updates are provider-triggered, not a logged-in
 * user's action.
 *
 * KNOWN LIMITATION, not fixed here: this matches by providerMessageId +
 * channel with no orgId scope. It's inert today (org_id is modelled
 * everywhere per sign-off open question 1, but there is genuinely one
 * org, and — separately — WHATSAPP_ACCESS_TOKEN/RESEND_API_KEY are single
 * global env vars shared by the whole deployment, not per-org). A
 * providerMessageId is attacker-supplyable on this unauthenticated route;
 * once a second org exists, this needs either per-org provider
 * credentials (so each org's webhook stream is actually separable) or
 * per-org webhook URLs — an orgId filter alone on this query can't fix
 * it, because nothing here currently knows which org a raw webhook POST
 * belongs to. Flagging explicitly rather than leaving it silent.
 */
export async function applyWebhookEvents(
  channel: NotificationChannel,
  events: WebhookStatusEvent[]
): Promise<{ matched: number; unmatched: number }> {
  let matched = 0;
  let unmatched = 0;

  for (const event of events) {
    const message = await prisma.notificationMessage.findFirst({
      where: { providerMessageId: event.providerMessageId, channel },
    });
    if (!message) {
      unmatched++;
      continue;
    }

    const before = { status: message.status };
    const updated = await prisma.notificationMessage.update({
      where: { id: message.id },
      data: {
        status: event.status,
        deliveredAt: event.status === "DELIVERED" ? event.occurredAt : message.deliveredAt,
        readAt: event.status === "READ" ? event.occurredAt : message.readAt,
        failedReason: event.status === "FAILED" ? event.failedReason ?? message.failedReason : message.failedReason,
      },
    });

    await recordAuditEvent({
      orgId: message.orgId,
      filmId: message.filmId,
      actorType: "SYSTEM",
      action: "update",
      entityType: "notification_message",
      entityId: message.id,
      before,
      after: { status: updated.status },
    });
    matched++;
  }

  return { matched, unmatched };
}
