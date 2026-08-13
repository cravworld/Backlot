"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { recordAuditEvent, isUnchanged } from "@/lib/audit";
import { ActionError } from "@/lib/action-error";

// Person CRUD is the master-data entry surface (per phase-0-findings.md
// §1.3) — org-admin only, same reasoning as film creation: this is
// foundational registry data, not a per-film operational action.
//
// Each action wraps its body in try/catch: an ActionError redirects back
// with the message in the query string (rendered by <ErrorBanner>)
// instead of crashing to a raw dev overlay. Anything else rethrows.

async function requireOrgAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    throw new ActionError("Org admin access required.");
  }
  return session;
}

function parseLanguages(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createPerson(formData: FormData) {
  try {
    const session = await requireOrgAdminSession();

    const fullName = String(formData.get("fullName") ?? "").trim();
    if (!fullName) throw new ActionError("Full name is required.");

    const person = await prisma.person.create({
      data: {
        orgId: session.user.orgId,
        fullName,
        preferredName: String(formData.get("preferredName") ?? "").trim() || null,
        phone: String(formData.get("phone") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim() || null,
        whatsappNumber: String(formData.get("whatsappNumber") ?? "").trim() || null,
        languages: parseLanguages(String(formData.get("languages") ?? "")),
        isMinor: formData.get("isMinor") === "on",
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });

    // Person rows carry contact fields (phone/email/whatsapp) from the
    // moment they're created — the write audit here doubles as the record
    // of who first entered that data, not just who changed it later.
    await recordAuditEvent({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "person",
      entityId: person.id,
      after: person,
    });

    revalidatePath("/people");
    redirect(`/people/${person.id}`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/people?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function updatePerson(personId: string, formData: FormData) {
  try {
    const session = await requireOrgAdminSession();

    const fullName = String(formData.get("fullName") ?? "").trim();
    if (!fullName) throw new ActionError("Full name is required.");

    const before = await prisma.person.findFirst({
      where: { id: personId, orgId: session.user.orgId },
    });

    const after = await prisma.person.update({
      where: { id: personId, orgId: session.user.orgId },
      data: {
        fullName,
        preferredName: String(formData.get("preferredName") ?? "").trim() || null,
        phone: String(formData.get("phone") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim() || null,
        whatsappNumber: String(formData.get("whatsappNumber") ?? "").trim() || null,
        languages: parseLanguages(String(formData.get("languages") ?? "")),
        isMinor: formData.get("isMinor") === "on",
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });

    if (!isUnchanged(before, after)) {
      await recordAuditEvent({
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "update",
        entityType: "person",
        entityId: personId,
        before,
        after,
      });
    }

    revalidatePath(`/people/${personId}`);
    revalidatePath("/people");
    redirect(`/people/${personId}?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/people/${personId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}
