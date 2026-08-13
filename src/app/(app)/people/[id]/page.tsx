import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { ErrorBanner } from "@/components/error-banner";
import { SubmitButton } from "@/components/submit-button";
import { recordAuditEvent } from "@/lib/audit";
import { updatePerson } from "../actions";

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Person" backHref="/me" backLabel="Back to my profile" />
          <p className="text-base text-ink-soft">
            The people registry is an org-admin area.
          </p>
        </div>
      </main>
    );
  }

  const person = await prisma.person.findFirst({
    where: { id: params.id, orgId: session.user.orgId },
    include: {
      filmRoles: { include: { film: true, role: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!person) notFound();

  // Sensitive read, per phase-0-findings.md open question 3: this page is
  // the one place a person's full contact info is always rendered, so
  // every view of it is logged — not every /people list render, which
  // would be noise, but this detail page specifically.
  await recordAuditEvent({
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    action: "view",
    entityType: "person",
    entityId: person.id,
  });

  const boundUpdate = updatePerson.bind(null, person.id);

  return (
    <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader title={person.fullName} backHref="/people" backLabel="Back to people" />

        <SavedBanner show={searchParams.saved === "1"} label="Person saved." />
        <ErrorBanner message={searchParams.error} />

        <form
          action={boundUpdate}
          className="mb-10 flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" name="fullName" defaultValue={person.fullName} required />
            <Field
              label="Preferred name"
              name="preferredName"
              defaultValue={person.preferredName ?? ""}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Phone" name="phone" defaultValue={person.phone ?? ""} />
            <Field label="Email" name="email" type="email" defaultValue={person.email ?? ""} />
            <Field
              label="WhatsApp number"
              name="whatsappNumber"
              defaultValue={person.whatsappNumber ?? ""}
            />
          </div>
          <Field
            label="Languages (comma-separated)"
            name="languages"
            defaultValue={person.languages.join(", ")}
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="notes"
              className="text-sm font-medium uppercase tracking-wide text-ink-soft"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={person.notes ?? ""}
              className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            />
          </div>
          <label className="flex w-fit items-center gap-2 text-base text-ink">
            <input type="checkbox" name="isMinor" defaultChecked={person.isMinor} className="h-4 w-4" />
            This person is a minor
          </label>
          {person.isMinor && (
            <p
              className="w-fit rounded-sm px-3 py-2.5 text-sm"
              style={{
                color: "var(--clay)",
                background: "color-mix(in srgb, var(--clay) 10%, transparent)",
              }}
            >
              Flagged as a minor — verify appropriate handling before this person appears on
              any broadly-distributed document (call sheets, etc).
            </p>
          )}

          <SubmitButton
            pendingText="Saving…"
            className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-3 text-base font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
          >
            Save changes
          </SubmitButton>
        </form>

        <section>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Film roles ({person.filmRoles.length})
          </h2>
          {person.filmRoles.length === 0 ? (
            <p className="text-base text-ink-soft">
              Not attached to any film yet — add them from a film&apos;s crew page.
            </p>
          ) : (
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Film</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Department</th>
                </tr>
              </thead>
              <tbody>
                {person.filmRoles.map((fr) => (
                  <tr key={fr.id} className="border-b border-line">
                    <td className="py-3 pr-4">{fr.film.title}</td>
                    <td className="py-3 pr-4">{fr.role.label}</td>
                    <td className="py-3 pr-4 text-ink-soft">{fr.department ?? "—"}</td>
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

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
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
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
      />
    </div>
  );
}
