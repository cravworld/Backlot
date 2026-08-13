"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { orchaLlmComplete } from "@/lib/orchallm/gateway";
import { ActionError } from "@/lib/action-error";

// Org-admin only, same rationale as the notifications test screen: this
// exists to prove the gateway is real and clickable (per the interface
// contract note that Phase 0 wires this end-to-end even though no module
// calls it yet), not to be a general-purpose prompt console.

async function requireOrgAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) throw new ActionError("Org admin access required.");
  return session;
}

export async function sendTestCompletion(formData: FormData) {
  try {
    const session = await requireOrgAdminSession();

    const moduleKey = String(formData.get("moduleKey") ?? "").trim();
    const purpose = String(formData.get("purpose") ?? "").trim();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const filmIdRaw = String(formData.get("filmId") ?? "").trim();
    const filmId = filmIdRaw || null;
    const sensitive = formData.get("sensitive") === "on";

    if (filmId) {
      const film = await prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } });
      if (!film) throw new ActionError("Invalid film for this org.");
    }

    // orchaLlmComplete does not throw for a refused or failed call — those
    // are logged and returned as a status, same as dispatchNotification's
    // provider failures, so this always redirects to the request log to
    // show what actually happened rather than crashing. It only throws
    // (ActionError) for missing required fields, which the try/catch
    // below turns into a banner like everything else.
    await orchaLlmComplete({
      orgId: session.user.orgId,
      filmId,
      requestedByUserId: session.user.id,
      moduleKey: moduleKey || "phase0_test",
      purpose: purpose || "smoke_test",
      prompt,
      sensitive,
    });

    revalidatePath("/orchallm");
    redirect("/orchallm?saved=1");
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/orchallm?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}
