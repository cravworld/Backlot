import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { ErrorBanner } from "@/components/error-banner";
import { SubmitButton } from "@/components/submit-button";
import { sendTestMessage } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  QUEUED: "var(--ochre)",
  SENT: "var(--sky)",
  DELIVERED: "var(--verdigris)",
  READ: "var(--verdigris)",
  FAILED: "var(--clay)",
};

const PAGE_SIZE = 50;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Notifications" backHref="/me" backLabel="Back to my profile" />
          <p className="text-sm text-ink-soft">Dispatch is an org-admin area.</p>
        </div>
      </main>
    );
  }

  const [people, films, templates, messages] = await Promise.all([
    prisma.person.findMany({ where: { orgId: session.user.orgId }, orderBy: { fullName: "asc" } }),
    prisma.film.findMany({ where: { orgId: session.user.orgId }, orderBy: { title: "asc" } }),
    prisma.notificationTemplate.findMany({ where: { orgId: session.user.orgId } }),
    prisma.notificationMessage.findMany({
      where: { orgId: session.user.orgId },
      include: { recipientPerson: true, film: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Notifications" backHref="/me" backLabel="Back to my profile" />

        <SavedBanner show={searchParams.saved === "1"} label="Message dispatched — see result below." />
        <ErrorBanner message={searchParams.error} />

        <p className="mb-4 text-xs text-ink-soft">
          Every send goes through the shared dispatch service (lib/notifications/dispatch.ts) —
          no module talks to WhatsApp or email directly. Without real provider credentials
          configured, a send will legitimately fail and log a FAILED row rather than fake
          success; that failure is real behavior worth seeing, not a bug.
          {templates.length === 0 && " No templates are seeded for this org yet."}
        </p>

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Send test message
          </h2>
          <form
            action={sendTestMessage}
            className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Recipient
                </label>
                <select
                  name="personId"
                  required
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
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
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Channel
                </label>
                <select
                  name="channel"
                  required
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                >
                  <option value="">Select a channel…</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Film context (optional)
                </label>
                <select
                  name="filmId"
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
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

            <label className="flex w-fit items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="allowMinorRecipient" className="h-4 w-4" />
              Allow sending to a minor (normally blocked — sign-off open question 9)
            </label>

            {people.length === 0 && (
              <p className="text-xs text-ochre">
                No one in the people registry yet — add someone on the{" "}
                <a href="/people" className="underline">
                  people page
                </a>{" "}
                first.
              </p>
            )}

            <SubmitButton
              pendingText="Sending…"
              className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
            >
              Send
            </SubmitButton>
          </form>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Message log ({messages.length})
          </h2>
          {messages.length === 0 ? (
            <p className="text-sm text-ink-soft">No messages dispatched yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Recipient</th>
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Film</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-b border-line align-top hover:bg-slate">
                    <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-ink-soft">
                      {m.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-2.5 pr-4">{m.recipientPerson?.fullName ?? "—"}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink-soft">{m.channel}</td>
                    <td className="py-2.5 pr-4 text-ink-soft">{m.film?.title ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="font-mono text-xs uppercase tracking-wide"
                        style={{ color: STATUS_COLOR[m.status] ?? "var(--ink-soft)" }}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2.5 max-w-xs">
                      {m.status === "FAILED" ? (
                        <span className="text-xs text-clay">{m.failedReason ?? "—"}</span>
                      ) : (
                        <span className="font-mono text-[10px] text-ink-soft">
                          {m.providerMessageId ?? "—"}
                        </span>
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
