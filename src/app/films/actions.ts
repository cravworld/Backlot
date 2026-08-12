"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { recordAuditEvent, isUnchanged } from "@/lib/audit";

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

  await recordAuditEvent({
    orgId: session.user.orgId,
    filmId: film.id,
    actorUserId: session.user.id,
    action: "create",
    entityType: "film",
    entityId: film.id,
    after: film,
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

  const before = await prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } });

  const after = await prisma.film.update({
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

  if (!isUnchanged(before, after)) {
    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "update",
      entityType: "film",
      entityId: filmId,
      before,
      after,
    });
  }

  revalidatePath(`/films/${filmId}`);
  revalidatePath("/films");
  // Redirect even on a no-op save — the URL change is what makes "yes,
  // that went through" visible, since the form otherwise looks identical
  // before and after a successful save.
  redirect(`/films/${filmId}?saved=1`);
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

  const before = await prisma.filmAssignment.findUnique({
    where: { filmId_userId_roleId: { filmId, userId, roleId } },
  });

  const after = await prisma.filmAssignment.upsert({
    where: { filmId_userId_roleId: { filmId, userId, roleId } },
    update: { status: "ACTIVE", department },
    create: { filmId, userId, roleId, department },
  });

  if (!before || !isUnchanged(before, after)) {
    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: before ? "update" : "create",
      entityType: "film_assignment",
      entityId: after.id,
      before,
      after,
    });
  }

  revalidatePath(`/films/${filmId}/assignments`);
}

// --- Crew (PersonFilmRole) — distinct from FilmAssignment above. This is
// the domain-level "who's on this film" record CallSheet Ops will read
// for its recipient list; it has nothing to do with platform login.
// Same org-admin gating as FilmAssignment for now — see
// phase-0-findings.md's People registry component notes for why a finer
// "who can staff a film" capability is deferred rather than built here.

export async function createCrewRole(filmId: string, formData: FormData) {
  const session = await requireOrgAdminSession();

  const personId = String(formData.get("personId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const department = String(formData.get("department") ?? "").trim() || null;
  const contactChannelPref = String(formData.get("contactChannelPref") ?? "").trim() || null;
  const languagePref = String(formData.get("languagePref") ?? "").trim() || null;

  if (!personId || !roleId) throw new Error("Person and role are required.");

  const [person, role, film] = await Promise.all([
    prisma.person.findFirst({ where: { id: personId, orgId: session.user.orgId } }),
    prisma.role.findFirst({ where: { id: roleId, orgId: session.user.orgId } }),
    prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } }),
  ]);
  if (!person || !role || !film) throw new Error("Invalid person, role, or film for this org.");

  const before = await prisma.personFilmRole.findUnique({
    where: { personId_filmId_roleId: { personId, filmId, roleId } },
  });

  const after = await prisma.personFilmRole.upsert({
    where: { personId_filmId_roleId: { personId, filmId, roleId } },
    update: { department, contactChannelPref, languagePref },
    create: { personId, filmId, roleId, department, contactChannelPref, languagePref },
  });

  if (!before || !isUnchanged(before, after)) {
    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: before ? "update" : "create",
      entityType: "person_film_role",
      entityId: after.id,
      before,
      after,
    });
  }

  revalidatePath(`/films/${filmId}/crew`);
}

export async function removeCrewRole(crewRoleId: string, filmId: string) {
  const session = await requireOrgAdminSession();

  const before = await prisma.personFilmRole.findFirst({
    where: { id: crewRoleId, film: { orgId: session.user.orgId } },
  });

  await prisma.personFilmRole.deleteMany({
    where: { id: crewRoleId, film: { orgId: session.user.orgId } },
  });

  if (before) {
    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "delete",
      entityType: "person_film_role",
      entityId: crewRoleId,
      before,
    });
  }

  revalidatePath(`/films/${filmId}/crew`);
}

export async function setAssignmentStatus(
  assignmentId: string,
  filmId: string,
  status: "ACTIVE" | "INACTIVE"
) {
  const session = await requireOrgAdminSession();

  const before = await prisma.filmAssignment.findFirst({
    where: { id: assignmentId, film: { orgId: session.user.orgId } },
  });

  await prisma.filmAssignment.updateMany({
    where: { id: assignmentId, film: { orgId: session.user.orgId } },
    data: { status },
  });

  if (before && before.status !== status) {
    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "update",
      entityType: "film_assignment",
      entityId: assignmentId,
      before,
      after: { ...before, status },
    });
  }

  revalidatePath(`/films/${filmId}/assignments`);
}
