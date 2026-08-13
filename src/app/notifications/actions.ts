"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { dispatchNotification, renderTemplate } from "@/lib/notifications/dispatch";
import type { NotificationChannel } from "@/lib/notifications/types";
import { ActionError } from "@/lib/action-error";

// Org-admin only, same rationale as advisor guidance on the document
// store: keeps this pass from having to solve "which contact can this
// dispatcher see" through role_field_access. Template *content* authoring
// is explicitly out of Phase 0 scope (phase-0-findings.md "not building"
// list) — templates are seeded (prisma/seed.ts), not managed here. This
// screen exists to prove the dispatch service is real and clickable, the
// same role the document upload screen played for lib/media.ts.
//
// Wrapped in try/catch: an ActionError (including ones thrown deep inside
// dispatchNotification, e.g. the minor-recipient block) redirects back to
// the page with the message in the query string instead of crashing to a
// raw dev overlay.

async function requireOrgAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) throw new ActionError("Org admin access required.");
  return session;
}

export async function sendTestMessage(formData: FormData) {
  try {
    const session = await requireOrgAdminSession();

    const personId = String(formData.get("personId") ?? "");
    const channel = String(formData.get("channel") ?? "") as NotificationChannel;
    const filmIdRaw = String(formData.get("filmId") ?? "").trim();
    const filmId = filmIdRaw || null;
    const allowMinorRecipient = formData.get("allowMinorRecipient") === "on";

    if (!personId) throw new ActionError("Choose a recipient.");
    if (channel !== "WHATSAPP" && channel !== "EMAIL") throw new ActionError("Choose a channel.");

    const [recipient, film] = await Promise.all([
      prisma.person.findFirst({ where: { id: personId, orgId: session.user.orgId } }),
      filmId ? prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } }) : null,
    ]);
    if (!recipient) throw new ActionError("Invalid recipient for this org.");
    if (filmId && !film) throw new ActionError("Invalid film for this org.");

    const template = await prisma.notificationTemplate.findFirst({
      where: { orgId: session.user.orgId, channel, language: "en" },
    });

    const vars = { name: recipient.fullName, filmTitle: film?.title ?? "your production" };
    const bodyRendered = template
      ? renderTemplate(template.bodyTemplate, vars)
      : `Hi ${recipient.fullName}, this is a test notification from Backlot for ${vars.filmTitle}. (No template configured for this channel.)`;

    // dispatchNotification itself throws ActionError for validation
    // problems (no recipient, minor without opt-in, no contact info on
    // file) — caught below like any other. A provider-side failure (no
    // API key configured, the API call itself rejecting) is caught
    // *inside* dispatchNotification and recorded as a FAILED row instead
    // of thrown, so this action still redirects to the message log to
    // show it.
    await dispatchNotification({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      templateId: template?.id ?? null,
      channel,
      recipientPersonId: recipient.id,
      subject: template?.subject ?? (channel === "EMAIL" ? "Backlot test notification" : undefined),
      bodyRendered,
      allowMinorRecipient,
    });

    revalidatePath("/notifications");
    redirect("/notifications?saved=1");
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/notifications?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}
