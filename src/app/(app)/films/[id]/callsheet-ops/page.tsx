import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { ErrorBanner } from "@/components/error-banner";
import { SubmitButton } from "@/components/submit-button";
import { createShootingDay } from "./actions";

export default async function CallSheetOpsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const film = await prisma.film.findFirst({ where: { id: params.id, orgId: session.user.orgId } });
  if (!film) notFound();

  const canView = await hasCapability(session.user.id, film.id, "callsheet_ops", "view");
  if (!canView) {
    return (
      <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Restricted" backHref="/me" backLabel="Back to my profile" />
          <p className="text-base text-ink-soft">
            Your role doesn&apos;t have view access to CallSheet Ops on {film.title}.
          </p>
        </div>
      </main>
    );
  }

  const canEdit = await hasCapability(session.user.id, film.id, "callsheet_ops", "edit");

  const days = await prisma.shootingDay.findMany({
    where: { filmId: film.id },
    include: {
      _count: { select: { scenes: true, callSheetVersions: true } },
    },
    orderBy: { shootDate: "desc" },
  });

  const boundCreate = createShootingDay.bind(null, film.id);

  return (
    <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`${film.title} — CallSheet Ops`} backHref={`/films/${film.id}`} backLabel="Back to film" />

        <SavedBanner show={searchParams.saved === "1"} label="Saved." />
        <ErrorBanner message={searchParams.error} />

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Shooting days ({days.length})
          </h2>
          {days.length === 0 ? (
            <p className="text-base text-ink-soft">No shooting days created for this film yet.</p>
          ) : (
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Scenes</th>
                  <th className="py-2 pr-4">Call sheet</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.id} className="border-b border-line hover:bg-slate">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/films/${film.id}/callsheet-ops/${day.id}`}
                        className="font-medium text-verdigris hover:underline"
                      >
                        {day.shootDate.toISOString().slice(0, 10)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">{day.locationLabel ?? "—"}</td>
                    <td className="py-3 pr-4 text-ink-soft">{day._count.scenes}</td>
                    <td className="py-3 pr-4 text-ink-soft">
                      {day._count.callSheetVersions > 0
                        ? `v${day._count.callSheetVersions}`
                        : "Not published"}
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">{day.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canEdit && (
          <section>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
              New shooting day
            </h2>
            <form
              action={boundCreate}
              className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Shoot date
                </label>
                <input
                  type="date"
                  name="shootDate"
                  required
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Unit call time
                </label>
                <input
                  type="time"
                  name="unitCallTime"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Location
                </label>
                <input
                  name="locationLabel"
                  placeholder="e.g. Kumarakom backwater set"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Location note
                </label>
                <input
                  name="locationNote"
                  placeholder="Travel/access notes"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Weather note
                </label>
                <input
                  name="weatherNote"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Hospital / emergency contact
                </label>
                <input
                  name="hospitalContact"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Safety &amp; grievance contact block
                </label>
                <p className="text-sm text-ink-soft">
                  Mandatory before a call sheet can be published — printed on every version.
                </p>
                <textarea
                  name="safetyNote"
                  rows={3}
                  placeholder="ICC contact, emergency line, grievance channel…"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <SubmitButton
                pendingText="Creating…"
                className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-3 text-base font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
              >
                Create shooting day
              </SubmitButton>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
