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
import { LogoutButton } from "./logout-button";
import { FilmSwitcher } from "./film-switcher";

// This page exists to make RBAC resolution visible and clickable, per the
// Phase 0 process: verify a spine component in the browser before it's
// considered done, not just by reading code. It intentionally renders raw
// resolved data rather than a polished UI — the nav rail shell with this
// same data behind it is Step 4.

export default async function MePage({
  searchParams,
}: {
  searchParams: { film?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [orgRole, films] = await Promise.all([
    getOrgRole(session.user.id, session.user.orgId),
    listUserFilms(session.user.id),
  ]);

  const selectedFilmId = searchParams.film ?? films[0]?.filmId;
  const selectedFilm = films.find((f) => f.filmId === selectedFilmId);

  const [capabilities, navModules, fieldAccess] = selectedFilmId
    ? await Promise.all([
        getEffectiveCapabilities(session.user.id, selectedFilmId),
        getNavModules(session.user.id, selectedFilmId),
        getFieldAccess(session.user.id, selectedFilmId),
      ])
    : [new Map<string, Set<string>>(), [] as string[], new Set<string>()];

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="h-5 w-5 flex-shrink-0 rounded-[3px]"
              style={{
                background:
                  "linear-gradient(135deg, var(--verdigris) 0 50%, var(--ochre) 50% 100%)",
              }}
            />
            <span className="font-display text-xl font-bold tracking-wide">BACKLOT</span>
            <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              RBAC verification
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(orgRole === "OWNER" || orgRole === "ADMIN") && (
              <>
                <Link href="/films" className="text-sm text-verdigris hover:underline">
                  Film registry
                </Link>
                <Link href="/people" className="text-sm text-verdigris hover:underline">
                  People
                </Link>
              </>
            )}
            <LogoutButton />
          </div>
        </div>

        {/* Identity */}
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Signed in as
          </h2>
          <div className="rounded-md border border-line bg-paper-raised p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm">
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
            <p className="text-sm text-ink-soft">
              No active film assignments — nothing to switch between yet.
            </p>
          ) : (
            <FilmSwitcher films={films} selectedFilmId={selectedFilmId} />
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
                <p className="text-sm text-ink-soft">
                  No modules with a "view" capability for this role — nav rail would be empty.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {navModules.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-line bg-paper-raised px-3 py-1 font-mono text-xs uppercase tracking-wide"
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
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-4">Module</th>
                    <th className="py-2">Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {[...capabilities.entries()].map(([moduleKey, caps]) => (
                    <tr key={moduleKey} className="border-b border-line">
                      <td className="py-2.5 pr-4 font-medium">{moduleKey}</td>
                      <td className="py-2.5 font-mono text-xs text-ink-soft">
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
                <p className="text-sm text-ink-soft">
                  None granted — restricted fields (e.g. contact info) render as "—" for this role.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[...fieldAccess].map((g) => (
                    <span
                      key={g}
                      className="rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide text-ochre"
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
