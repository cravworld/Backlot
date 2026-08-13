"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { dispatchNotification, renderTemplate } from "@/lib/notifications/dispatch";
import type { NotificationChannel } from "@/lib/notifications/types";

// Org-admin only, same rationale as advisor guidance on the document
// store: keeps this pass from having to solve "which contact can this
// dispatcher see" through role_field_access. Template *content* authoring
// is explicitly out of Phase 0 scope (phase-0-findings.md "not building"
// list) — templates are seeded (prisma/seed.ts), not managed here. This
// screen exists to prove the dispatch service is real and clickable, the
// same role the document upload screen played for lib/media.ts.

async function requireOrgAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) throw new Error("Org admin access required.");
  return session;
}

export async function sendTestMessage(formData: FormData) {
  const session = await requireOrgAdminSession();

  const personId = String(formData.get("personId") ?? "");
  const channel = String(formData.get("channel") ?? "") as NotificationChannel;
  const filmIdRaw = String(formData.get("filmId") ?? "").trim();
  const filmId = filmIdRaw || null;
  const allowMinorRecipient = formData.get("allowMinorRecipient") === "on";

  if (!personId) throw new Error("Choose a recipient.");
  if (channel !== "WHATSAPP" && channel !== "EMAIL") throw new Error("Choose a channel.");

  const [recipient, film] = await Promise.all([
    prisma.person.findFirst({ where: { id: personId, orgId: session.user.orgId } }),
    filmId ? prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } }) : null,
  ]);
  if (!recipient) throw new Error("Invalid recipient for this org.");
  if (filmId && !film) throw new Error("Invalid film for this org.");

  const template = await prisma.notificationTemplate.findFirst({
    where: { orgId: session.user.orgId, channel, language: "en" },
  });

  const vars = { name: recipient.fullName, filmTitle: film?.title ?? "your production" };
  const bodyRendered = template
    ? renderTemplate(template.bodyTemplate, vars)
    : `Hi ${recipient.fullName}, this is a test notification from Backlot for ${vars.filmTitle}. (No template configured for this channel.)`;

  // dispatchNotification itself throws for validation problems (no
  // recipient, minor without opt-in, no contact info on file) — those
  // surface as a real error page, same as every other action's
  // `throw new Error(...)`. A provider-side failure (no API key
  // configured, the API call itself rejecting) is caught inside
  // dispatchNotification and recorded as a FAILED row instead, so this
  // action still redirects to the message log to show it.
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
}
