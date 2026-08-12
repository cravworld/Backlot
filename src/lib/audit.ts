import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type RecordAuditEventInput = {
  orgId: string;
  filmId?: string | null;
  actorUserId?: string | null;
  actorType?: "USER" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/**
 * The single place every write — and the select reads flagged sensitive in
 * phase-0-findings.md open question 3 — funnels through to land in
 * audit_event. Deliberately NOT wrapped in a try/catch that swallows
 * failures: if this throws, the caller's action fails too, so the audit
 * trail can never silently have gaps. Call it after the mutation succeeds,
 * not before — an audited action that never actually happened is worse
 * than an unaudited one that did.
 */
export async function recordAuditEvent(input: RecordAuditEventInput) {
  const hdrs = headers();
  const forwardedFor = hdrs.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null;
  const userAgent = hdrs.get("user-agent");

  await prisma.auditEvent.create({
    data: {
      orgId: input.orgId,
      filmId: input.filmId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? "USER",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: toJson(input.before),
      afterJson: toJson(input.after),
      ipAddress,
      userAgent,
    },
  });
}

// Prisma's Json input can't take a value containing Date instances (or
// `undefined`) directly — round-trip through JSON to get a plain,
// serializable value it'll accept.
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Re-saving a form with nothing actually changed (a repeated click while
 * waiting for a slow response, most commonly) shouldn't produce a new
 * audit row — that's noise, not a change worth recording. Compares
 * everything except id/orgId/createdAt/updatedAt, which are either
 * identifiers or always-different bookkeeping fields. `before` being
 * null/undefined (nothing existed yet) always counts as changed — this
 * is only meant to catch true no-op re-saves of an existing record.
 */
export function isUnchanged(before: unknown, after: unknown): boolean {
  if (before === null || before === undefined) return false;
  const strip = (obj: unknown) => {
    if (obj === null || typeof obj !== "object") return obj;
    const { id: _id, orgId: _orgId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } =
      obj as Record<string, unknown>;
    return rest;
  };
  return JSON.stringify(strip(before)) === JSON.stringify(strip(after));
}
