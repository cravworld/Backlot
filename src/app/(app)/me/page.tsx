import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import {
  getEffectiveCapabilities,
  getFieldAccess,
  getNavModules,
  getOrgRole,
  listUserFilms,
} from "@/lib/rbac";
import { getCurrentFilm } from "@/lib/current-film";
import { FilmSwitcher } from "./film-switcher";

// This page exists to make RBAC resolution visible and clickable, per the
// Phase 0 process: verify a spine component in the browser before it's
// considered done, not just by reading code. Step 4's nav rail now owns
// global navigation, branding, and the theme toggle — this page keeps
// the raw resolved-permission detail (capabilities table, field-group
// visibility) that's still useful spelled out, and shares the SAME
// current-film selection as the rail (lib/current-film.ts, the
// backlot_film cookie): switching film here moves the rail's module
// tabs too, and switching it in the rail updates what's shown here.
export default async function MePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [orgRole, films] = await Promise.all([
    getOrgRole(session.user.id, session.user.orgId),
    listUserFilms(session.user.id),
  ]);

  const selectedFilm = films.length > 0 ? await getCurrentFilm(session.user.id, films) : null;

  const [capabilities, navModules, fieldAccess] = selectedFilm
    ? await Promise.all([
        getEffectiveCapabilities(session.user.id, selectedFilm.filmId),
        getNavModules(session.user.id, selectedFilm.filmId),
        getFieldAccess(session.user.id, selectedFilm.filmId),
      ])
    : [new Map<string, Set<string>>(), [] as string[], new Set<string>()];

  return (
    <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 border-b border-line pb-5">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-ink">
            My profile
          </h1>
        </div>

        {/* Identity */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Signed in as
          </h2>
          <div className="rounded-md border border-line bg-paper-raised p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-base">
              <span><span className="text-ink-soft">Name</span> {session.user.name}</span>
              <span><span className="text-ink-soft">Email</span> {session.user.email}</span>
              <span><span className="text-ink-soft">User ID</span> {session.user.id}</span>
              <span>
                <span className="text-ink-soft">Org role</span>{" "}
                {orgRole ?? "— (no org membership)"}
              </span>
            </div>
          </div>
        </section>

        {/* Film switcher — first-class, not an edge case: a user can hold
            active assignments on more than one film at once. */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Films ({films.length})
          </h2>
          {films.length === 0 ? (
            <p className="text-base text-ink-soft">
              No active film assignments — the nav rail is empty until you&apos;re assigned to
              a film.
            </p>
          ) : (
            <FilmSwitcher films={films} selectedFilmId={selectedFilm?.filmId} />
          )}
          {selectedFilm && (
            <p className="mt-3">
              <Link
                href={`/films/${selectedFilm.filmId}`}
                className="text-base text-verdigris hover:underline"
              >
                Open {selectedFilm.filmTitle} →
              </Link>
            </p>
          )}
        </section>

        {selectedFilm && (
          <>
            {/* Resolved nav rail modules */}
            <section className="mb-10">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
                Nav rail modules resolved for {selectedFilm.filmTitle}
              </h2>
              {navModules.length === 0 ? (
                <p className="text-base text-ink-soft">
                  No modules with a "view" capability for this role — nav rail is empty for
                  this film.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {navModules.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-line bg-paper-raised px-3 py-1.5 font-mono text-sm uppercase tracking-wide"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Full capability grid */}
            <section className="mb-10">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
                Effective capabilities
              </h2>
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-4">Module</th>
                    <th className="py-2">Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {[...capabilities.entries()].map(([moduleKey, caps]) => (
                    <tr key={moduleKey} className="border-b border-line">
                      <td className="py-2.5 pr-4 font-medium">{moduleKey}</td>
                      <td className="py-2.5 font-mono text-sm text-ink-soft">
                        {[...caps].join(", ")}
                      </td>
                    </tr>
                  ))}
                  {capabilities.size === 0 && (
                    <tr>
                      <td colSpan={2} className="py-2.5 text-ink-soft">
                        No capabilities resolved for this film.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* Field-level visibility */}
            <section>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
                Restricted field groups visible
              </h2>
              {fieldAccess.size === 0 ? (
                <p className="text-base text-ink-soft">
                  None granted — restricted fields (e.g. contact info) render as "—" for this
                  role.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[...fieldAccess].map((g) => (
                    <span
                      key={g}
                      className="rounded-full px-3 py-1.5 font-mono text-sm uppercase tracking-wide text-ochre"
                      style={{
                        border: "1px solid color-mix(in srgb, var(--ochre) 40%, transparent)",
                        background: "color-mix(in srgb, var(--ochre) 10%, transparent)",
                      }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
