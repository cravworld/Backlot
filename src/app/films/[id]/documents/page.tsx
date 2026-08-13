import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { SavedBanner } from "@/components/saved-banner";
import { SubmitButton } from "@/components/submit-button";
import { uploadDocument, uploadNewVersion, deleteDocument } from "./actions";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FilmDocumentsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
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
          <PageHeader title={`${film.title} — documents`} backHref="/me" backLabel="Back to my profile" />
          <p className="text-sm text-ink-soft">
            You don&apos;t have an assignment on this film — nothing to show.
          </p>
        </div>
      </main>
    );
  }

  const documents = await prisma.mediaAsset.findMany({
    where: { filmId: film.id },
    include: {
      currentVersion: true,
      uploadedByUser: true,
      versions: { include: { uploadedByUser: true }, orderBy: { versionNumber: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const boundUpload = uploadDocument.bind(null, film.id);

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={`${film.title} — documents`}
          backHref={`/films/${film.id}`}
          backLabel="Back to film"
        />

        <SavedBanner show={searchParams.saved === "1"} label="Document saved." />

        <p className="mb-4 text-xs text-ink-soft">
          Every file is encrypted at rest with a per-file key. Every upload and download is
          recorded in the audit log.
        </p>

        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
            Documents ({documents.length})
          </h2>
          {documents.length === 0 ? (
            <p className="text-sm text-ink-soft">No documents uploaded for this film yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Size</th>
                  <th className="py-2 pr-4">Uploaded</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-line align-top hover:bg-slate">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{doc.filename}</div>
                      <div className="text-xs text-ink-soft">{doc.mimeType}</div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-ink-soft">
                      v{doc.currentVersion?.versionNumber ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-soft">
                      {doc.currentVersion ? formatBytes(doc.currentVersion.byteSize) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-soft">
                      {doc.uploadedByUser.name}
                      <br />
                      <span className="text-xs">
                        {doc.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-col items-end gap-1.5">
                        {doc.currentVersion && (
                          <a
                            href={`/api/media/${doc.currentVersion.id}`}
                            className="text-sm text-verdigris hover:underline"
                          >
                            Download
                          </a>
                        )}
                        {admin && (
                          <>
                            <details>
                              <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                                Versions ({doc.versions.length})
                              </summary>
                              <div className="mt-2 flex w-64 flex-col gap-3 text-left">
                                <ul className="flex flex-col gap-1">
                                  {doc.versions.map((v) => (
                                    <li key={v.id} className="text-xs">
                                      <a
                                        href={`/api/media/${v.id}`}
                                        className="text-verdigris hover:underline"
                                      >
                                        v{v.versionNumber}
                                      </a>{" "}
                                      <span className="text-ink-soft">
                                        · {formatBytes(v.byteSize)} · {v.uploadedByUser.name}
                                        {v.changeNote ? ` · ${v.changeNote}` : ""}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                <form
                                  action={uploadNewVersion.bind(null, doc.id, film.id)}
                                  className="flex flex-col gap-2 rounded-sm border border-line bg-paper-raised p-3"
                                >
                                  <input
                                    type="file"
                                    name="file"
                                    required
                                    className="text-xs"
                                  />
                                  <input
                                    type="text"
                                    name="changeNote"
                                    placeholder="What changed? (optional)"
                                    className="rounded-sm border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                                  />
                                  <SubmitButton
                                    pendingText="Uploading…"
                                    className="w-fit rounded-sm bg-verdigris px-3 py-1.5 text-xs font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
                                  >
                                    Upload new version
                                  </SubmitButton>
                                </form>
                              </div>
                            </details>
                            <form action={deleteDocument.bind(null, doc.id, film.id)}>
                              <SubmitButton
                                pendingText="Deleting…"
                                className="text-xs text-clay hover:underline"
                              >
                                Delete
                              </SubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {admin && (
          <section>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-verdigris">
              Upload document
            </h2>
            <form
              action={boundUpload}
              className="flex flex-col gap-4 rounded-md border border-line bg-paper-raised p-5 shadow-card"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  File
                </label>
                <input
                  type="file"
                  name="file"
                  required
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="changeNote"
                  className="text-xs font-medium uppercase tracking-wide text-ink-soft"
                >
                  Note (optional)
                </label>
                <input
                  id="changeNote"
                  name="changeNote"
                  placeholder="e.g. Signed location agreement"
                  className="rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                />
              </div>
              <SubmitButton
                pendingText="Uploading…"
                className="mt-2 w-fit rounded-sm bg-verdigris px-5 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-verdigris-ink"
              >
                Upload
              </SubmitButton>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
