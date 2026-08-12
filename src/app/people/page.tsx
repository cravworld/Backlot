import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { createPerson } from "./actions";

export default async function PeoplePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="People registry" backHref="/me" backLabel="Back to my profile" />
          <p className="text-sm text-ink-soft">
            The people registry is an org-admin area — your account doesn&apos;t hold that
            permission. Crew for your films is listed on each film&apos;s crew page.
          </p>
        </div>
      </main>
    );
  }

  const people = await prisma.person.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { fullName: "asc" },
    include: { _count: { select: { filmRoles: true } } },
  });

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="People registry" backHref="/me" backLabel="Back to my profile" />

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            People ({people.length})
          </h2>
          <p className="mb-4 text-xs text-ink-soft">
            This is the master directory — contact fields shown here are always visible to
            org admins as the data-entry source of truth. Per-film crew views elsewhere
            filter contact info by role, and won&apos;t show what this screen shows.
          </p>
          {people.length === 0 ? (
            <p className="text-sm text-ink-soft">No one in the registry yet — add someone below.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Contact</th>
                  <th className="py-2 pr-4">Languages</th>
                  <th className="py-2 pr-4">Films</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-line hover:bg-slate">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2 font-medium">
                        {p.fullName}
                        {p.isMinor && (
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
                            style={{
                              color: "var(--clay)",
                              background: "color-mix(in srgb, var(--clay) 12%, transparent)",
                            }}
                          >
                            Minor
                          </span>
                        )}
                      </div>
                      {p.preferredName && (
                        <div className="text-xs text-ink-soft">{p.preferredName}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-soft">
                      {p.phone ?? p.email ?? p.whatsappNumber ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-soft">
                      {p.languages.length ? p.languages.join(", ") : "—"}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-ink-soft">{p._count.filmRoles}</td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/people/${p.id}`}
                        className="text-sm text-verdigris hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            New person
          </h2>
          <form
            action={createPerson}
            className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full name" name="fullName" required />
              <Field label="Preferred name" name="preferredName" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Phone" name="phone" />
              <Field label="Email" name="email" type="email" />
              <Field label="WhatsApp number" name="whatsappNumber" />
            </div>
            <Field label="Languages (comma-separated)" name="languages" placeholder="Malayalam, English" />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="notes"
                className="text-xs font-medium uppercase tracking-wide text-ink-soft"
              >
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
              />
            </div>
            <label className="flex w-fit items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="isMinor" className="h-4 w-4" />
              This person is a minor
            </label>

            <button
              type="submit"
              className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
            >
              Add to registry
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide text-ink-soft"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
      />
    </div>
  );
}
