import type { FilmSummary } from "@/lib/rbac";

// Deliberately a plain <a>, not next/link — a Link (even with router.push +
// router.refresh) left the active-tile highlight one navigation behind the
// actual data on this page, a client-component-prop-staleness quirk that
// didn't resolve via next.config's staleTimes either. A real full-page
// navigation sidesteps it entirely and is the right tradeoff for a
// temporary Phase 0 verification page — Step 4's real nav rail should
// revisit client-side transitions on their own terms rather than inherit
// this workaround.
export function FilmSwitcher({
  films,
  selectedFilmId,
}: {
  films: FilmSummary[];
  selectedFilmId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {films.map((f) => (
        <a
          key={f.filmId}
          href={`/me?film=${f.filmId}`}
          className={`rounded-sm border px-3 py-2 text-left text-sm transition-colors ${
            f.filmId === selectedFilmId
              ? "border-verdigris bg-slate text-ink"
              : "border-line text-ink-soft hover:border-ink-soft"
          }`}
        >
          <div className="font-medium">{f.filmTitle}</div>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
            {f.roleLabel} · {f.filmStatus}
          </div>
        </a>
      ))}
    </div>
  );
}
