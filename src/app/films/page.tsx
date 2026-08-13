import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { FilmStatusBadge } from "@/components/film-status-badge";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/error-banner";
import { createFilm } from "./actions";

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Film registry" backHref="/me" backLabel="Back to my films" />
          <p className="text-sm text-ink-soft">
            Film registry management is an org-admin area — your account doesn&apos;t hold
            that permission. Your assigned films are listed on{" "}
            <Link href="/me" className="text-verdigris underline">
              your profile page
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const films = await prisma.film.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { filmAssignments: true } } },
  });

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Film registry" backHref="/me" backLabel="Back to my profile" />

        <ErrorBanner message={searchParams.error} />

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Films ({films.length})
          </h2>
          {films.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No films yet — create the first one below.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Language</th>
                  <th className="py-2 pr-4">Login access</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {films.map((film) => (
                  <tr key={film.id} className="border-b border-line hover:bg-slate">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{film.title}</div>
                      {film.workingTitle && (
                        <div className="text-xs text-ink-soft">{film.workingTitle}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <FilmStatusBadge status={film.status} />
                    </td>
                    <td className="py-2.5 pr-4 text-ink-soft">
                      {film.primaryLanguage ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-ink-soft">
                      {film._count.filmAssignments}
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/films/${film.id}`}
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
            New film
          </h2>
          <form
            action={createFilm}
            className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Title" name="title" required />
              <Field label="Working title" name="workingTitle" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue="PREP"
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                >
                  <option value="PREP">Prep</option>
                  <option value="SHOOT">Shoot</option>
                  <option value="POST">Post</option>
                  <option value="WRAPPED">Wrapped</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <Field label="Start date" name="startDate" type="date" />
              <Field label="End date" name="endDate" type="date" />
            </div>
            <Field label="Primary language" name="primaryLanguage" placeholder="Malayalam" />

            <SubmitButton
              pendingText="Creating…"
              className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
            >
              Create film
            </SubmitButton>
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
