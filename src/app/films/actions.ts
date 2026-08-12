"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";

// Film creation, editing, and staffing are org-level actions (per
// phase-0-findings.md §2): who tells the crew this film exists and who's
// on it is an org-admin decision, not something gated by a per-film role
// grid — a role on a film can't exist before the film does.

async function requireOrgAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    throw new Error("Org admin access required.");
  }
  return session;
}

export async function createFilm(formData: FormData) {
  const session = await requireOrgAdminSession();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");

  const workingTitle = String(formData.get("workingTitle") ?? "").trim() || null;
  const primaryLanguage = String(formData.get("primaryLanguage") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "PREP") as
    | "PREP"
    | "SHOOT"
    | "POST"
    | "WRAPPED"
    | "ARCHIVED";
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");

  const film = await prisma.film.create({
    data: {
      orgId: session.user.orgId,
      title,
      workingTitle,
      primaryLanguage,
      status,
      startDate: startDateRaw ? new Date(startDateRaw) : null,
      endDate: endDateRaw ? new Date(endDateRaw) : null,
    },
  });

  revalidatePath("/films");
  redirect(`/films/${film.id}`);
}

export async function updateFilm(filmId: string, formData: FormData) {
  const session = await requireOrgAdminSession();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");

  const workingTitle = String(formData.get("workingTitle") ?? "").trim() || null;
  const primaryLanguage = String(formData.get("primaryLanguage") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "PREP") as
    | "PREP"
    | "SHOOT"
    | "POST"
    | "WRAPPED"
    | "ARCHIVED";
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");

  await prisma.film.update({
    where: { id: filmId, orgId: session.user.orgId },
    data: {
      title,
      workingTitle,
      primaryLanguage,
      status,
      startDate: startDateRaw ? new Date(startDateRaw) : null,
      endDate: endDateRaw ? new Date(endDateRaw) : null,
    },
  });

  revalidatePath(`/films/${filmId}`);
  revalidatePath("/films");
}

export async function createAssignment(filmId: string, formData: FormData) {
  const session = await requireOrgAdminSession();

  const userId = String(formData.get("userId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const department = String(formData.get("department") ?? "").trim() || null;

  if (!userId || !roleId) throw new Error("User and role are required.");

  // Defensive: both must belong to this org, since the <select> options
  // are org-scoped but nothing stops a tampered request otherwise.
  const [user, role, film] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, orgId: session.user.orgId } }),
    prisma.role.findFirst({ where: { id: roleId, orgId: session.user.orgId } }),
    prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } }),
  ]);
  if (!user || !role || !film) throw new Error("Invalid user, role, or film for this org.");

  await prisma.filmAssignment.upsert({
    where: { filmId_userId_roleId: { filmId, userId, roleId } },
    update: { status: "ACTIVE", department },
    create: { filmId, userId, roleId, department },
  });

  revalidatePath(`/films/${filmId}/assignments`);
}

export async function setAssignmentStatus(
  assignmentId: string,
  filmId: string,
  status: "ACTIVE" | "INACTIVE"
) {
  const session = await requireOrgAdminSession();

  await prisma.filmAssignment.updateMany({
    where: { id: assignmentId, film: { orgId: session.user.orgId } },
    data: { status },
  });

  revalidatePath(`/films/${filmId}/assignments`);
}
