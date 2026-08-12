import { prisma } from "@/lib/prisma";
import type { FieldGroup } from "@prisma/client";

// Permission resolution — the single source of truth referenced by
// phase-0-findings.md section 2. Every nav rail, API guard, and
// restricted-field render reads through here. Nothing about "what can
// this user do" is a hardcoded role check in application code; it's
// always a lookup against role_permission / role_field_access.
//
// Deliberately does fresh DB reads rather than caching resolved
// permissions in the session/JWT: a permission change (or someone being
// removed from a film) should take effect on the next request, not wait
// for a token refresh. Revisit if this becomes a real perf bottleneck —
// it isn't one at Phase 0 scale.

export type FilmSummary = {
  filmId: string;
  filmTitle: string;
  filmStatus: string;
  roleId: string;
  roleLabel: string;
  department: string | null;
};

/** Org-level role, independent of any film. Null if the user isn't a member of this org at all. */
export async function getOrgRole(
  userId: string,
  orgId: string
): Promise<"OWNER" | "ADMIN" | "MEMBER" | null> {
  const membership = await prisma.orgMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  return membership?.orgRole ?? null;
}

export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const role = await getOrgRole(userId, orgId);
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Every active film a user is assigned to, with their role on each —
 * this is the film switcher's data source. Built as first-class per
 * sign-off: a producer or business-affairs person plausibly has one
 * film in post and another in prep simultaneously, so this list is not
 * expected to usually have zero or one entry.
 */
export async function listUserFilms(userId: string): Promise<FilmSummary[]> {
  const assignments = await prisma.filmAssignment.findMany({
    where: { userId, status: "ACTIVE" },
    include: { film: true, role: true },
    orderBy: { film: { updatedAt: "desc" } },
  });

  return assignments.map((a) => ({
    filmId: a.filmId,
    filmTitle: a.film.title,
    filmStatus: a.film.status,
    roleId: a.roleId,
    roleLabel: a.role.label,
    department: a.department,
  }));
}

/** All role IDs a user holds on a specific film (can be more than one). */
async function getFilmRoleIds(userId: string, filmId: string): Promise<string[]> {
  const assignments = await prisma.filmAssignment.findMany({
    where: { userId, filmId, status: "ACTIVE" },
    select: { roleId: true },
  });
  return assignments.map((a) => a.roleId);
}

/** moduleKey -> Set<capability>, unioned across every role the user holds on this film. */
export async function getEffectiveCapabilities(
  userId: string,
  filmId: string
): Promise<Map<string, Set<string>>> {
  const roleIds = await getFilmRoleIds(userId, filmId);
  const map = new Map<string, Set<string>>();
  if (roleIds.length === 0) return map;

  const permissions = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
  });

  for (const p of permissions) {
    if (!map.has(p.moduleKey)) map.set(p.moduleKey, new Set());
    map.get(p.moduleKey)!.add(p.capability);
  }
  return map;
}

export async function hasCapability(
  userId: string,
  filmId: string,
  moduleKey: string,
  capability: string
): Promise<boolean> {
  const caps = await getEffectiveCapabilities(userId, filmId);
  return caps.get(moduleKey)?.has(capability) ?? false;
}

/** Modules that should appear in the nav rail for this user on this film. */
export async function getNavModules(userId: string, filmId: string): Promise<string[]> {
  const caps = await getEffectiveCapabilities(userId, filmId);
  const modules: string[] = [];
  for (const [moduleKey, capabilities] of caps.entries()) {
    if (capabilities.has("view")) modules.push(moduleKey);
  }
  return modules;
}

/** Field groups this user is allowed to see, unioned across their roles on this film. */
export async function getFieldAccess(
  userId: string,
  filmId: string
): Promise<Set<FieldGroup>> {
  const roleIds = await getFilmRoleIds(userId, filmId);
  const result = new Set<FieldGroup>();
  if (roleIds.length === 0) return result;

  const grants = await prisma.roleFieldAccess.findMany({
    where: { roleId: { in: roleIds }, canView: true },
  });
  for (const g of grants) result.add(g.fieldGroup);
  return result;
}

export async function canViewFieldGroup(
  userId: string,
  filmId: string,
  fieldGroup: FieldGroup
): Promise<boolean> {
  const groups = await getFieldAccess(userId, filmId);
  return groups.has(fieldGroup);
}
