import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { whatsAppAdapter } from "./whatsapp-adapter";
import { emailAdapter } from "./email-adapter";
import type { NotificationChannel, NotificationProvider, WebhookStatusEvent } from "./types";

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
  if (!recipient) throw new Error("Recipient not found in this org.");

  if (recipient.isMinor && !input.allowMinorRecipient) {
    throw new Error(
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
    throw new Error(`${recipient.fullName} has no ${kind} on file.`);
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
