import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { ErrorBanner } from "@/components/error-banner";
import { SubmitButton } from "@/components/submit-button";
import { sendTestCompletion } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--verdigris)",
  refused: "var(--ochre)",
  failed: "var(--clay)",
};

const PAGE_SIZE = 50;

export default async function OrchaLlmPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="OrchaLLM gateway" backHref="/me" backLabel="Back to my profile" />
          <p className="text-base text-ink-soft">The model gateway is an org-admin area.</p>
        </div>
      </main>
    );
  }

  const [films, providers, logs] = await Promise.all([
    prisma.film.findMany({ where: { orgId: session.user.orgId }, orderBy: { title: "asc" } }),
    prisma.llmProvider.findMany({ orderBy: { key: "asc" } }),
    prisma.llmRequestLog.findMany({
      where: { orgId: session.user.orgId },
      include: { requestedByUser: true, film: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-4xl">
        <PageHeader title="OrchaLLM gateway" backHref="/me" backLabel="Back to my profile" />

        <SavedBanner show={searchParams.saved === "1"} label="Request logged — see below." />
        <ErrorBanner message={searchParams.error} />

        <p className="mb-4 text-sm text-ink-soft">
          No module calls this yet (per phase-0-findings.md §1.6) — this screen exists to prove
          the gateway is real and clickable. Raw prompt/response text is never stored, and isn't
          shown here either, even for this test screen: only hashes and metadata persist, and a
          successful completion's actual text is returned only to the caller in-memory, the same
          way a real module would consume it.
        </p>

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Registered providers
          </h2>
          {providers.length === 0 ? (
            <p className="text-base text-ink-soft">None seeded.</p>
          ) : (
            <table className="mb-2 w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Key</th>
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-4">Zero-retention</th>
                  <th className="py-2">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-b border-line">
                    <td className="py-2.5 pr-4 font-mono text-sm">{p.key}</td>
                    <td className="py-2.5 pr-4">{p.label}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="font-mono text-sm uppercase tracking-wide"
                        style={{ color: p.zeroRetention ? "var(--verdigris)" : "var(--ink-soft)" }}
                      >
                        {p.zeroRetention ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-sm text-ink-soft">{p.enabled ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Send test completion
          </h2>
          <form
            action={sendTestCompletion}
            className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Module key
                </label>
                <input
                  name="moduleKey"
                  placeholder="phase0_test"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Purpose
                </label>
                <input
                  name="purpose"
                  placeholder="smoke_test"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Film context (optional)
                </label>
                <select
                  name="filmId"
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                >
                  <option value="">None</option>
                  {films.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="prompt"
                className="text-sm font-medium uppercase tracking-wide text-ink-soft"
              >
                Prompt
              </label>
              <textarea
                id="prompt"
                name="prompt"
                required
                rows={3}
                placeholder="e.g. Summarize this scene in one sentence."
                className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
              />
            </div>
            <label className="flex w-fit items-center gap-2 text-base text-ink">
              <input type="checkbox" name="sensitive" className="h-4 w-4" />
              Sensitivity-tagged (only routes to a zero-retention provider)
            </label>

            <SubmitButton
              pendingText="Sending…"
              className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-3 text-base font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
            >
              Send
            </SubmitButton>
          </form>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Request log ({logs.length})
          </h2>
          {logs.length === 0 ? (
            <p className="text-base text-ink-soft">No requests logged yet.</p>
          ) : (
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Module / purpose</th>
                  <th className="py-2 pr-4">Provider / model</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">ZDR</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-line align-top hover:bg-slate">
                    <td className="py-3 pr-4 whitespace-nowrap font-mono text-sm text-ink-soft">
                      {l.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{l.moduleKey}</div>
                      <div className="text-sm text-ink-soft">{l.purpose}</div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm text-ink-soft">
                      {l.providerKey}
                      <br />
                      {l.model}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="font-mono text-sm uppercase tracking-wide"
                        style={{ color: STATUS_COLOR[l.status] ?? "var(--ink-soft)" }}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm text-ink-soft">
                      {l.zeroRetentionUsed ? "Yes" : "No"}
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm text-ink-soft">
                      {l.tokenCountIn ?? "—"} / {l.tokenCountOut ?? "—"}
                    </td>
                    <td className="py-3 max-w-xs">
                      {l.status === "ok" ? (
                        <span className="font-mono text-xs text-ink-soft">
                          hash {l.responseHash?.slice(0, 12)}…
                        </span>
                      ) : (
                        <span className="text-sm text-clay">{l.failedReason ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
