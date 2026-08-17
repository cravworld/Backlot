import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { ErrorBanner } from "@/components/error-banner";
import { SubmitButton } from "@/components/submit-button";
import {
  addScene,
  addCallTime,
  publishCallSheet,
  dispatchCallSheet,
  submitDpr,
  addOvertimeEntry,
} from "../actions";

function eighthsToPages(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (rem === 0) return `${whole}`;
  return whole > 0 ? `${whole} ${rem}/8` : `${rem}/8`;
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(11, 16);
}

export default async function ShootingDayPage({
  params,
  searchParams,
}: {
  params: { id: string; dayId: string };
  searchParams: { saved?: string; error?: string; sent?: string; failed?: string; skipped?: string };
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

  const [canEdit, canDispatch, canDprSubmit, canViewVariance] = await Promise.all([
    hasCapability(session.user.id, film.id, "callsheet_ops", "edit"),
    hasCapability(session.user.id, film.id, "callsheet_ops", "dispatch"),
    hasCapability(session.user.id, film.id, "callsheet_ops", "dpr_submit"),
    hasCapability(session.user.id, film.id, "callsheet_ops", "view_variance"),
  ]);

  const day = await prisma.shootingDay.findFirst({
    where: { id: params.dayId, filmId: film.id },
    include: {
      scenes: { orderBy: { sortOrder: "asc" } },
      callTimes: { include: { person: true }, orderBy: { callTime: "asc" } },
      callSheetVersions: {
        orderBy: { versionNumber: "desc" },
        include: {
          pdfMediaAsset: { include: { currentVersion: true } },
          dispatches: { include: { person: true, notificationMessage: true } },
        },
      },
      dprs: {
        include: { sceneResults: true, overtimeEntries: true },
      },
    },
  });
  if (!day) notFound();

  const dpr = day.dprs[0] ?? null;
  const latestVersion = day.callSheetVersions[0] ?? null;

  const crew = await prisma.personFilmRole.findMany({
    where: { filmId: film.id },
    include: { person: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  // Variance: planned vs. completed scene count/pages across every
  // shooting day on this film to date — a live query, never a stored
  // column, per phase-1-findings.md.
  let variance: {
    totalPlannedScenes: number;
    totalCompletedScenes: number;
    totalPlannedEighths: number;
    totalShotEighths: number;
  } | null = null;
  if (canViewVariance) {
    const allScenes = await prisma.shootingDayScene.findMany({
      where: { shootingDay: { filmId: film.id } },
      include: { dprResults: true },
    });
    let totalPlannedEighths = 0;
    let totalShotEighths = 0;
    let totalCompletedScenes = 0;
    for (const scene of allScenes) {
      totalPlannedEighths += scene.plannedEighths;
      const result = scene.dprResults[0];
      if (result) {
        totalShotEighths += result.pagesShotEighths ?? 0;
        if (result.status === "COMPLETED") totalCompletedScenes++;
      }
    }
    variance = {
      totalPlannedScenes: allScenes.length,
      totalCompletedScenes,
      totalPlannedEighths,
      totalShotEighths,
    };
  }

  const boundAddScene = addScene.bind(null, day.id, film.id);
  const boundAddCallTime = addCallTime.bind(null, day.id, film.id);
  const boundPublish = publishCallSheet.bind(null, day.id, film.id);
  const boundSubmitDpr = submitDpr.bind(null, day.id, film.id);
  const boundAddOvertime = addOvertimeEntry.bind(null, day.id, film.id);

  const inputClass =
    "rounded-sm border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky";
  const labelClass = "text-sm font-medium uppercase tracking-wide text-ink-soft";
  const buttonClass =
    "mt-1 w-fit rounded-sm bg-verdigris px-4 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink";

  return (
    <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={`${film.title} — ${day.shootDate.toISOString().slice(0, 10)}`}
          backHref={`/films/${film.id}/callsheet-ops`}
          backLabel="Back to CallSheet Ops"
        />

        <SavedBanner show={searchParams.saved === "1" && !searchParams.sent} label="Saved." />
        {searchParams.sent && (
          <SavedBanner
            show
            label={`Dispatch complete — sent ${searchParams.sent}, failed ${searchParams.failed}, already dispatched ${searchParams.skipped}.`}
          />
        )}
        <ErrorBanner message={searchParams.error} />

        {!day.safetyNote && (
          <p className="mb-6 w-fit rounded-sm bg-slate px-3 py-2.5 text-base text-ink-soft">
            No safety/grievance contact block set yet — a call sheet can&apos;t be published until
            one is added.
          </p>
        )}

        {/* Scenes */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Scene plan ({day.scenes.length})
          </h2>
          {day.scenes.length > 0 && (
            <table className="mb-4 w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Scene</th>
                  <th className="py-2">Pages</th>
                </tr>
              </thead>
              <tbody>
                {day.scenes.map((s, i) => (
                  <tr key={s.id} className="border-b border-line">
                    <td className="py-2 pr-4 text-ink-soft">{i + 1}</td>
                    <td className="py-2 pr-4">{s.sceneLabel}</td>
                    <td className="py-2 text-ink-soft">{eighthsToPages(s.plannedEighths)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && (
            <form action={boundAddScene} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Scene label</label>
                <input name="sceneLabel" required placeholder="Scene 47 — INT. VEEDU - DAY" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Pages (whole)</label>
                <input type="number" min={0} name="pagesWhole" defaultValue={0} className={`${inputClass} w-20`} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Eighths</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  name="pagesEighths"
                  defaultValue={0}
                  className={`${inputClass} w-20`}
                />
              </div>
              <SubmitButton pendingText="Adding…" className={buttonClass}>
                Add scene
              </SubmitButton>
            </form>
          )}
        </section>

        {/* Call times */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Call times ({day.callTimes.length})
          </h2>
          {day.callTimes.length > 0 && (
            <table className="mb-4 w-full border-collapse text-base">
              <tbody>
                {day.callTimes.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className="py-2 pr-4">{c.person?.fullName ?? c.departmentLabel}</td>
                    <td className="py-2 font-mono text-ink-soft">{fmtTime(c.callTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && (
            <form action={boundAddCallTime} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Person</label>
                <select name="personId" className={inputClass}>
                  <option value="">— none (use department instead) —</option>
                  {crew.map((c) => (
                    <option key={c.personId} value={c.personId}>
                      {c.person.fullName} ({c.role.label})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>or Department</label>
                <input name="departmentLabel" placeholder="e.g. Makeup" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Call time</label>
                <input type="time" name="callTime" required className={inputClass} />
              </div>
              <SubmitButton pendingText="Adding…" className={buttonClass}>
                Add call time
              </SubmitButton>
            </form>
          )}
        </section>

        {/* Call sheet versions + dispatch */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Call sheet versions ({day.callSheetVersions.length})
          </h2>
          {day.callSheetVersions.length === 0 ? (
            <p className="mb-4 text-base text-ink-soft">No call sheet published yet.</p>
          ) : (
            <div className="mb-4 flex flex-col gap-4">
              {day.callSheetVersions.map((v) => (
                <div key={v.id} className="rounded-md border border-line bg-paper-raised p-4 shadow-card">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">
                      Version {v.versionNumber}
                      {v.changeNote ? ` — ${v.changeNote}` : ""}
                    </span>
                    {v.pdfMediaAsset.currentVersion && (
                      <a
                        href={`/api/media/${v.pdfMediaAsset.currentVersion.id}`}
                        className="text-base text-verdigris hover:underline"
                      >
                        Download PDF
                      </a>
                    )}
                  </div>
                  <p className="mb-2 text-sm text-ink-soft">
                    Published {v.publishedAt.toISOString().replace("T", " ").slice(0, 16)}
                  </p>
                  {v.dispatches.length > 0 && (
                    <table className="mb-3 w-full border-collapse text-sm">
                      <tbody>
                        {v.dispatches.map((d) => (
                          <tr key={d.id} className="border-b border-line">
                            <td className="py-1.5 pr-4">{d.person.fullName}</td>
                            <td className="py-1.5 pr-4 text-ink-soft">
                              {d.notificationMessage?.status ?? "—"}
                            </td>
                            <td className="py-1.5 text-ink-soft">
                              {d.acknowledgedAt
                                ? `Acknowledged ${d.acknowledgedAt.toISOString().replace("T", " ").slice(0, 16)}`
                                : "Not yet acknowledged"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {canDispatch && (
                    <form action={dispatchCallSheet.bind(null, v.id, film.id)} className="flex flex-col gap-2">
                      <span className={labelClass}>Send to</span>
                      <div className="flex flex-wrap gap-3">
                        {crew.map((c) => (
                          <label key={c.personId} className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" name="personIds" value={c.personId} />
                            {c.person.fullName}
                          </label>
                        ))}
                      </div>
                      <SubmitButton pendingText="Sending…" className={buttonClass}>
                        Dispatch via WhatsApp
                      </SubmitButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <form action={boundPublish} className="flex flex-wrap items-end gap-3">
              {day.callSheetVersions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Change note (required for amendments)</label>
                  <input name="changeNote" placeholder="e.g. Rain call — location moved" className={inputClass} />
                </div>
              )}
              <SubmitButton pendingText="Generating…" className={buttonClass}>
                {latestVersion ? "Publish amended call sheet" : "Publish call sheet"}
              </SubmitButton>
            </form>
          )}
        </section>

        {/* DPR */}
        {canDprSubmit && (
          <section className="mb-10">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
              Daily Production Report {dpr ? "(submitted)" : ""}
            </h2>
            <form
              action={boundSubmitDpr}
              className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
            >
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Actual call</label>
                  <input
                    type="time"
                    name="actualCallTime"
                    defaultValue={fmtTime(dpr?.actualCallTime ?? null) === "—" ? "" : fmtTime(dpr?.actualCallTime ?? null)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Actual wrap</label>
                  <input
                    type="time"
                    name="actualWrapTime"
                    defaultValue={fmtTime(dpr?.actualWrapTime ?? null) === "—" ? "" : fmtTime(dpr?.actualWrapTime ?? null)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Catering — breakfast</label>
                  <input type="number" min={0} name="cateringBreakfast" defaultValue={dpr?.cateringBreakfast ?? ""} className={`${inputClass} w-28`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Catering — lunch</label>
                  <input type="number" min={0} name="cateringLunch" defaultValue={dpr?.cateringLunch ?? ""} className={`${inputClass} w-28`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Catering — dinner</label>
                  <input type="number" min={0} name="cateringDinner" defaultValue={dpr?.cateringDinner ?? ""} className={`${inputClass} w-28`} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Junior artists — planned</label>
                  <input type="number" min={0} name="juniorArtistPlanned" defaultValue={dpr?.juniorArtistPlanned ?? ""} className={`${inputClass} w-28`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Junior artists — actual</label>
                  <input type="number" min={0} name="juniorArtistActual" defaultValue={dpr?.juniorArtistActual ?? ""} className={`${inputClass} w-28`} />
                </div>
              </div>

              {day.scenes.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className={labelClass}>Scene results</span>
                  {day.scenes.map((s) => {
                    const existing = dpr?.sceneResults.find((r) => r.shootingDaySceneId === s.id);
                    return (
                      <div key={s.id} className="flex flex-wrap items-end gap-3 border-b border-line pb-2">
                        <span className="w-48 text-sm">{s.sceneLabel}</span>
                        <select name={`sceneStatus_${s.id}`} defaultValue={existing?.status ?? ""} className={inputClass}>
                          <option value="">— not reported —</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="PARTIAL">Partial</option>
                          <option value="DROPPED">Dropped</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          name={`scenePagesWhole_${s.id}`}
                          placeholder="pages"
                          defaultValue={existing ? Math.floor((existing.pagesShotEighths ?? 0) / 8) : ""}
                          className={`${inputClass} w-20`}
                        />
                        <input
                          type="number"
                          min={0}
                          max={7}
                          name={`scenePagesEighths_${s.id}`}
                          placeholder="/8"
                          defaultValue={existing ? (existing.pagesShotEighths ?? 0) % 8 : ""}
                          className={`${inputClass} w-20`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Incidents</label>
                <textarea name="incidentsNote" rows={2} defaultValue={dpr?.incidentsNote ?? ""} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Equipment issues</label>
                <textarea name="equipmentIssuesNote" rows={2} defaultValue={dpr?.equipmentIssuesNote ?? ""} className={inputClass} />
              </div>

              <SubmitButton pendingText="Saving…" className={buttonClass}>
                {dpr ? "Update DPR" : "Submit DPR"}
              </SubmitButton>
            </form>

            {dpr && (
              <div className="mt-4">
                <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
                  Overtime ({dpr.overtimeEntries.length})
                </h3>
                {dpr.overtimeEntries.length > 0 && (
                  <table className="mb-3 w-full border-collapse text-sm">
                    <tbody>
                      {dpr.overtimeEntries.map((o) => (
                        <tr key={o.id} className="border-b border-line">
                          <td className="py-1.5 pr-4">{o.departmentLabel}</td>
                          <td className="py-1.5 text-ink-soft">{o.overtimeMinutes} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <form action={boundAddOvertime} className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>Department</label>
                    <input name="departmentLabel" required className={inputClass} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>Overtime (minutes)</label>
                    <input type="number" min={1} name="overtimeMinutes" required className={`${inputClass} w-28`} />
                  </div>
                  <SubmitButton pendingText="Adding…" className={buttonClass}>
                    Add overtime entry
                  </SubmitButton>
                </form>
              </div>
            )}
          </section>
        )}

        {/* Variance — restricted to view_variance, per the Hema Committee
            reasoning in phase-1-findings.md §6(e): this is working-hours-
            adjacent data, gated tighter than the module's general view. */}
        {canViewVariance && variance && (
          <section>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
              Variance (film-wide, to date)
            </h2>
            <div className="rounded-md border border-line bg-paper-raised p-4 shadow-card">
              <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-base">
                <span>
                  <span className="text-ink-soft">Scenes completed</span>{" "}
                  {variance.totalCompletedScenes} / {variance.totalPlannedScenes}
                </span>
                <span>
                  <span className="text-ink-soft">Pages shot</span>{" "}
                  {eighthsToPages(variance.totalShotEighths)} / {eighthsToPages(variance.totalPlannedEighths)}
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
