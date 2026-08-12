import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createAssignment, setAssignmentStatus } from "../../actions";

export default async function FilmAssignmentsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Crew assignments" backHref="/me" backLabel="Back to my profile" />
          <p className="text-sm text-ink-soft">
            Managing crew assignments is an org-admin action.
          </p>
        </div>
      </main>
    );
  }

  const film = await prisma.film.findFirst({
    where: { id: params.id, orgId: session.user.orgId },
  });
  if (!film) notFound();

  const [assignments, users, roles] = await Promise.all([
    prisma.filmAssignment.findMany({
      where: { filmId: film.id },
      include: { user: true, role: true },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    prisma.user.findMany({ where: { orgId: session.user.orgId }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ where: { orgId: session.user.orgId }, orderBy: { label: "asc" } }),
  ]);

  const boundCreate = createAssignment.bind(null, film.id);

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={`${film.title} — login access`}
          backHref={`/films/${film.id}`}
          backLabel="Back to film"
        />

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Assignments ({assignments.length})
          </h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-ink-soft">No one assigned to this film yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-line hover:bg-slate">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{a.user.name}</div>
                      <div className="text-xs text-ink-soft">{a.user.email}</div>
                    </td>
                    <td className="py-2.5 pr-4">{a.role.label}</td>
                    <td className="py-2.5 pr-4 text-ink-soft">{a.department ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="font-mono text-xs uppercase tracking-wide"
                        style={{
                          color: a.status === "ACTIVE" ? "var(--verdigris)" : "var(--ink-soft)",
                        }}
                      >
                        {a.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <form
                        action={setAssignmentStatus.bind(
                          null,
                          a.id,
                          film.id,
                          a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                        )}
                      >
                        <SubmitButton
                          pendingText="Updating…"
                          className="text-sm text-verdigris hover:underline"
                        >
                          {a.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Add assignment
          </h2>
          <form
            action={boundCreate}
            className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  User
                </label>
                <select
                  name="userId"
                  required
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                >
                  <option value="">Select a user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Role
                </label>
                <select
                  name="roleId"
                  required
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                >
                  <option value="">Select a role…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="department"
                  className="text-xs font-medium uppercase tracking-wide text-ink-soft"
                >
                  Department
                </label>
                <input
                  id="department"
                  name="department"
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
            </div>
            {roles.length === 0 && (
              <p className="text-xs text-ochre">
                No roles exist in the org role catalog yet — none to assign. (Role catalog
                management UI isn&apos;t built yet; roles currently come from seed data.)
              </p>
            )}
            <SubmitButton
              pendingText="Adding…"
              className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
            >
              Add to film
            </SubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}
