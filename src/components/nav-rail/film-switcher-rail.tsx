"use client";

import { usePathname } from "next/navigation";
import type { FilmSummary } from "@/lib/rbac";

// A plain <a> to /api/current-film, not a client-state selector — the
// same "real navigation" tradeoff as the original me/film-switcher.tsx.
// `next` is the page the user is already on, so switching film from,
// say, a film's crew page returns you there with the new film's
// resolution rather than bouncing to /me.
export function RailFilmSwitcher({
  films,
  currentFilmId,
}: {
  films: FilmSummary[];
  currentFilmId?: string;
}) {
  const pathname = usePathname();
  if (films.length === 0) return null;

  return (
    <div className="flex flex-shrink-0 flex-col rail:mb-1">
      {films.length > 1 && (
        <div className="hidden px-6 pb-1 pt-4 font-mono text-xs uppercase tracking-wide text-ink-soft rail:block">
          Film
        </div>
      )}
      {films.map((f) => {
        const active = f.filmId === currentFilmId;
        return (
          <a
            key={f.filmId}
            href={`/api/current-film?filmId=${f.filmId}&next=${encodeURIComponent(pathname)}`}
            className={`flex flex-shrink-0 flex-col gap-0.5 whitespace-nowrap border-l-[3px] px-5 py-3 pl-[21px] text-sm font-medium transition-colors ${
              active
                ? "border-l-verdigris bg-slate text-ink"
                : "border-l-transparent text-ink-soft hover:text-ink"
            }`}
          >
            <span>{f.filmTitle}</span>
            <span className="font-mono text-xs uppercase tracking-wide text-ink-soft opacity-70">
              {f.roleLabel}
            </span>
          </a>
        );
      })}
    </div>
  );
}
