import type { FilmSummary } from "@/lib/rbac";

// Deliberately a plain <a>, not next/link — a Link (even with router.push +
// router.refresh) left the active-tile highlight one navigation behind the
// actual data on this page, a client-component-prop-staleness quirk that
// didn't resolve via next.config's staleTimes either. A real full-page
// navigation sidesteps it entirely.
//
// Step 4: now routes through /api/current-film (the same cookie-based
// selection the nav rail's own film switcher uses) instead of a
// /me-local ?film= query param, so picking a film here also moves the
// rail's module tabs elsewhere in the app.
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
          href={`/api/current-film?filmId=${f.filmId}&next=/me`}
          className={`rounded-sm border px-3 py-2.5 text-left text-base transition-colors ${
            f.filmId === selectedFilmId
              ? "border-verdigris bg-slate text-ink"
              : "border-line text-ink-soft hover:border-ink-soft"
          }`}
        >
          <div className="font-medium">{f.filmTitle}</div>
          <div className="font-mono text-xs uppercase tracking-wide text-ink-soft">
            {f.roleLabel} · {f.filmStatus}
          </div>
        </a>
      ))}
    </div>
  );
}
