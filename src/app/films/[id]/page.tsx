import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { FilmStatusBadge } from "@/components/film-status-badge";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { ErrorBanner } from "@/components/error-banner";
import { SubmitButton } from "@/components/submit-button";
import { updateFilm } from "../actions";

export default async function FilmDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const film = await prisma.film.findFirst({
    where: { id: params.id, orgId: session.user.orgId },
  });

  if (!film) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Film not found" backHref="/films" backLabel="Back to films" />
          <p className="text-base text-ink-soft">
            No film with that ID in your org — it may have been removed, or the link is wrong.
          </p>
        </div>
      </main>
    );
  }

  const [admin, assignment] = await Promise.all([
    isOrgAdmin(session.user.id, session.user.orgId),
    prisma.filmAssignment.findFirst({
      where: { filmId: film.id, userId: session.user.id },
      include: { role: true },
    }),
  ]);

  if (!admin && !assignment) {
    return (
      <main className="min-h-screen bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title={film.title} backHref="/me" backLabel="Back to my profile" />
          <p className="text-base text-ink-soft">
            You don&apos;t have an assignment on this film — nothing to show.
          </p>
        </div>
      </main>
    );
  }

  const boundUpdate = updateFilm.bind(null, film.id);
  const dateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader title={film.title} backHref="/films" backLabel="Back to films" />

        <div className="mb-6 flex items-center gap-3">
          <FilmStatusBadge status={film.status} />
          <Link
            href={`/films/${film.id}/crew`}
            className="text-base text-verdigris hover:underline"
          >
            Crew →
          </Link>
          <Link
            href={`/films/${film.id}/documents`}
            className="text-base text-verdigris hover:underline"
          >
            Documents →
          </Link>
          {admin && (
            <Link
              href={`/films/${film.id}/assignments`}
              className="text-base text-verdigris hover:underline"
            >
              Manage login access →
            </Link>
          )}
        </div>

        <SavedBanner show={searchParams.saved === "1"} label="Film saved." />
        <ErrorBanner message={searchParams.error} />

        {admin ? (
          <form
            action={boundUpdate}
            className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Title" name="title" defaultValue={film.title} required />
              <Field
                label="Working title"
                name="workingTitle"
                defaultValue={film.workingTitle ?? ""}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium uppercase tracking-wide text-ink-soft">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={film.status}
                  className="rounded-sm border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                >
                  <option value="PREP">Prep</option>
                  <option value="SHOOT">Shoot</option>
                  <option value="POST">Post</option>
                  <option value="WRAPPED">Wrapped</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <Field
                label="Start date"
                name="startDate"
                type="date"
                defaultValue={dateInput(film.startDate)}
              />
              <Field
                label="End date"
                name="endDate"
                type="date"
                defaultValue={dateInput(film.endDate)}
              />
            </div>
            <Field
              label="Primary language"
              name="primaryLanguage"
              defaultValue={film.primaryLanguage ?? ""}
            />

            <SubmitButton
              pendingText="Saving…"
              className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-3 text-base font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
            >
              Save changes
            </SubmitButton>
          </form>
        ) : (
          <div className="rounded-md border border-line bg-paper-raised p-5 shadow-card">
            <dl className="grid grid-cols-2 gap-4 font-mono text-base">
              <div>
                <dt className="text-ink-soft">Your role</dt>
                <dd>{assignment?.role.label ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Department</dt>
                <dd>{assignment?.department ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Primary language</dt>
                <dd>{film.primaryLanguage ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Dates</dt>
                <dd>
                  {dateInput(film.startDate) || "—"} → {dateInput(film.endDate) || "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-ink-soft">
              Read-only — editing film details requires org-admin access.
            </p>
          </div>
        )}
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
