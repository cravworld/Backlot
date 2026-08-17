import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";

// Public, unauthenticated acknowledgment page — the entire point of
// sign-off answer (a): a crew member taps a link in a plain-text WhatsApp
// message, no login, no app. The tap itself IS the confirmation, so this
// page performs the write on render rather than requiring a second button
// press — matching "a single 'I've seen this' tap" from the findings doc.
//
// Idempotent by design, per the follow-up sign-off: re-opening an
// already-acknowledged link (two taps, two devices) redisplays the
// original confirmation and re-derives nothing — never an error. Actual
// errors are reserved for the cases that are real problems: token not
// found, or a token superseded by a newer call sheet version's dispatch
// for the same recipient (the old link genuinely shouldn't be treated as
// current anymore).
//
// KNOWN LIMITATION, explicit: this has only been exercised by visiting a
// manually-constructed /ack/<token> URL directly — not by a real WhatsApp
// send-and-tap, since WHATSAPP_ACCESS_TOKEN isn't configured yet
// (phase-1-findings.md open question b, still pending). The mechanism is
// verified; a real end-to-end WhatsApp round trip is not, and shouldn't be
// read as such until that approval lands.

export const dynamic = "force-dynamic";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
      <div className="w-full max-w-md rounded-md border border-line bg-paper-raised p-8 text-center shadow-card">
        <h1 className="mb-3 font-display text-xl font-bold uppercase tracking-wide text-ink">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

export default async function AckPage({ params }: { params: { token: string } }) {
  const dispatch = await prisma.callSheetDispatch.findUnique({
    where: { ackToken: params.token },
    include: {
      person: true,
      callSheetVersion: { include: { shootingDay: { include: { film: true } } } },
    },
  });

  if (!dispatch) {
    return (
      <Shell title="Link not found">
        <p className="text-base text-ink-soft">
          This acknowledgment link isn&apos;t valid. If you received this in error, contact your
          production coordinator.
        </p>
      </Shell>
    );
  }

  const { shootingDay } = dispatch.callSheetVersion;
  const film = shootingDay.film;
  const shootDateLabel = shootingDay.shootDate.toISOString().slice(0, 10);

  // Superseded check: a newer version of this same shooting day has its
  // own dispatch to this same person — the old link is stale, not current.
  const supersededBy = await prisma.callSheetVersion.findFirst({
    where: {
      shootingDayId: shootingDay.id,
      versionNumber: { gt: dispatch.callSheetVersion.versionNumber },
      dispatches: { some: { personId: dispatch.personId } },
    },
    orderBy: { versionNumber: "desc" },
  });

  if (supersededBy) {
    return (
      <Shell title="This call sheet was updated">
        <p className="text-base text-ink-soft">
          A newer version (v{supersededBy.versionNumber}) of the {shootDateLabel} call sheet for{" "}
          {film.title} was sent after this link. Check WhatsApp for the latest message and use
          that link instead.
        </p>
      </Shell>
    );
  }

  if (!dispatch.acknowledgedAt) {
    const acknowledgedAt = new Date();
    await prisma.callSheetDispatch.update({
      where: { id: dispatch.id },
      data: { acknowledgedAt },
    });
    await recordAuditEvent({
      orgId: film.orgId,
      filmId: film.id,
      actorType: "SYSTEM",
      action: "update",
      entityType: "call_sheet_dispatch",
      entityId: dispatch.id,
      before: { acknowledgedAt: null },
      after: { acknowledgedAt, personId: dispatch.personId },
    });
    dispatch.acknowledgedAt = acknowledgedAt;
  }

  return (
    <Shell title="Confirmed">
      <p className="mb-2 text-base text-ink">
        {film.title} — {shootDateLabel} call sheet (v{dispatch.callSheetVersion.versionNumber})
      </p>
      <p className="text-base text-ink-soft">
        Thanks, {dispatch.person.fullName.split(" ")[0]} — confirmed seen at{" "}
        {dispatch.acknowledgedAt.toISOString().replace("T", " ").slice(0, 16)}.
      </p>
    </Shell>
  );
}
