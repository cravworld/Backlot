import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";

const PAGE_SIZE = 100;

const ACTION_COLOR: Record<string, string> = {
  create: "var(--verdigris)",
  update: "var(--ochre)",
  delete: "var(--clay)",
  view: "var(--sky)",
};

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-4xl">
          <PageHeader title="Audit log" backHref="/me" backLabel="Back to my profile" />
          <p className="text-sm text-ink-soft">The audit log is an org-admin area.</p>
        </div>
      </main>
    );
  }

  const [events, totalCount] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { orgId: session.user.orgId },
      include: { actorUser: true, film: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where: { orgId: session.user.orgId } }),
  ]);

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Audit log" backHref="/me" backLabel="Back to my profile" />

        <p className="mb-4 text-xs text-ink-soft">
          Every write across the spine is logged here, plus reads of Person contact fields
          (per phase-0-findings.md open question 3). Showing the {Math.min(PAGE_SIZE, totalCount)}{" "}
          most recent of {totalCount} total event{totalCount === 1 ? "" : "s"}
          {totalCount > PAGE_SIZE ? " — older events aren't shown yet, no pagination in Phase 0" : ""}.
        </p>

        {events.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No audit events yet — they'll appear here as soon as anyone creates, edits, or
            views something covered by the log.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">Film</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-line align-top hover:bg-slate">
                  <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-ink-soft">
                    {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="py-2.5 pr-4">
                    {e.actorUser ? e.actorUser.name : e.actorType === "SYSTEM" ? "System" : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className="font-mono text-xs uppercase tracking-wide"
                      style={{ color: ACTION_COLOR[e.action] ?? "var(--ink-soft)" }}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-ink-soft">
                    {e.entityType}
                    <br />
                    <span className="text-[10px]">{e.entityId}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-ink-soft">{e.film?.title ?? "—"}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-ink-soft">
                    {e.ipAddress ?? "—"}
                  </td>
                  <td className="py-2.5 max-w-xs">
                    <ChangeSummary before={e.beforeJson} after={e.afterJson} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function ChangeSummary({ before, after }: { before: unknown; after: unknown }) {
  if (before === null && after === null) {
    return <span className="text-xs text-ink-soft">—</span>;
  }
  return (
    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-tight text-ink-soft">
      {before !== null ? `before: ${JSON.stringify(before)}\n` : ""}
      {after !== null ? `after: ${JSON.stringify(after)}` : ""}
    </pre>
  );
}
