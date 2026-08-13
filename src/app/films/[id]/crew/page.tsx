import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewFieldGroup, isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/error-banner";
import { recordAuditEvent } from "@/lib/audit";
import { createCrewRole, removeCrewRole } from "../../actions";

export default async function FilmCrewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const film = await prisma.film.findFirst({
    where: { id: params.id, orgId: session.user.orgId },
  });
  if (!film) notFound();

  const [admin, assignment] = await Promise.all([
    isOrgAdmin(session.user.id, session.user.orgId),
    prisma.filmAssignment.findFirst({
      where: { filmId: film.id, userId: session.user.id, status: "ACTIVE" },
    }),
  ]);

  if (!admin && !assignment) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title={`${film.title} — crew`} backHref="/me" backLabel="Back to my profile" />
          <p className="text-base text-ink-soft">
            You don&apos;t have an assignment on this film — nothing to show.
          </p>
        </div>
      </main>
    );
  }

  // Field-level visibility, resolved for THIS user on THIS film — not
  // whether they're an org admin. Deliberate: /people (admin-only) is the
  // unrestricted source of truth; this operational view respects the same
  // role_field_access grants every other module will, admin or not.
  const canSeeContact = await canViewFieldGroup(session.user.id, film.id, "CONTACT_RESTRICTED");

  const crew = await prisma.personFilmRole.findMany({
    where: { filmId: film.id },
    include: { person: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  // Sensitive read: contact fields for this film's crew were just
  // rendered to this viewer. Logged once per page view, scoped to the
  // film rather than one event per crew row — the compliance question is
  // "who saw contact info for this film's crew, when," not a row-level
  // audit of a list render.
  if (canSeeContact && crew.length > 0) {
    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId: film.id,
      actorUserId: session.user.id,
      action: "view",
      entityType: "film_crew_contact",
      entityId: film.id,
      after: { crewCount: crew.length },
    });
  }

  const [people, roles] = admin
    ? await Promise.all([
        prisma.person.findMany({ where: { orgId: session.user.orgId }, orderBy: { fullName: "asc" } }),
        prisma.role.findMany({ where: { orgId: session.user.orgId }, orderBy: { label: "asc" } }),
      ])
    : [[], []];

  const boundCreate = createCrewRole.bind(null, film.id);

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={`${film.title} — crew`}
          backHref={`/films/${film.id}`}
          backLabel="Back to film"
        />

        <ErrorBanner message={searchParams.error} />

        {!canSeeContact && (
          <p className="mb-4 text-sm text-ink-soft">
            Contact info is restricted for your role on this film — shown as "—" below.
          </p>
        )}

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Crew ({crew.length})
          </h2>
          {crew.length === 0 ? (
            <p className="text-base text-ink-soft">No one on this film yet.</p>
          ) : (
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Contact</th>
                  <th className="py-2 pr-4">Language pref</th>
                  {admin && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {crew.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-slate">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2 font-medium">
                        {c.person.fullName}
                        {c.person.isMinor && (
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wide"
                            style={{
                              color: "var(--clay)",
                              background: "color-mix(in srgb, var(--clay) 12%, transparent)",
                            }}
                          >
                            Minor
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{c.role.label}</td>
                    <td className="py-3 pr-4 text-ink-soft">{c.department ?? "—"}</td>
                    <td className="py-3 pr-4 text-ink-soft">
                      {canSeeContact
                        ? c.person.phone ?? c.person.email ?? c.person.whatsappNumber ?? "—"
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">{c.languagePref ?? "—"}</td>
                    {admin && (
                      <td className="py-3 text-right">
                        <form action={removeCrewRole.bind(null, c.id, film.id)}>
                          <SubmitButton pendingText="Removing…" className="text-base text-clay hover:underline">
                            Remove
                          </SubmitButton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {admin && (
          <section>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
              Add crew
            </h2>
            <form
              action={boundCreate}
              className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                    Person
                  </label>
                  <select
                    name="personId"
                    required
                    className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                  >
                    <option value="">Select a person…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                        {p.isMinor ? " (minor)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                    Role
                  </label>
                  <select
                    name="roleId"
                    required
                    className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                  >
                    <option value="">Select a role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <TextField label="Department" name="department" />
                <TextField label="Contact channel pref" name="contactChannelPref" placeholder="WhatsApp" />
                <TextField label="Language pref" name="languagePref" placeholder="Malayalam" />
              </div>
              {people.length === 0 && (
                <p className="text-sm text-ochre">
                  No one in the people registry yet — add someone on the{" "}
                  <a href="/people" className="underline">
                    people page
                  </a>{" "}
                  first.
                </p>
              )}
              <SubmitButton
                pendingText="Adding…"
                className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-3 text-base font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
              >
                Add to crew
              </SubmitButton>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

function TextField({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="text-sm font-medium uppercase tracking-wide text-ink-soft"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        placeholder={placeholder}
        className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
      />
    </div>
  );
}
