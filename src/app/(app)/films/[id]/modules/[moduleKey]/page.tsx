import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { MODULE_CATALOG } from "@/components/nav-rail/module-catalog";

// Placeholder destination for every module tab the nav rail resolves via
// getNavModules() — none of callsheet_ops / scenespine / locationbank /
// rightsledger have a real screen yet (that's Phase 1+). A tab that
// 404s, or that silently gets left off the rail because there's nowhere
// to send it, would defeat the point of Step 4: proving role-filtered
// visibility resolves correctly. This re-checks the same "view"
// capability the rail used to decide whether to show the tab at all —
// the same defense-in-depth posture as every other page in the app —
// so reaching this URL directly without access still gets refused.
export default async function ModulePlaceholderPage({
  params,
}: {
  params: { id: string; moduleKey: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const film = await prisma.film.findFirst({
    where: { id: params.id, orgId: session.user.orgId },
  });
  if (!film) notFound();

  const canView = await hasCapability(session.user.id, film.id, params.moduleKey, "view");
  const meta = MODULE_CATALOG[params.moduleKey];
  const label = meta?.label ?? params.moduleKey;

  if (!canView) {
    return (
      <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Restricted" backHref="/me" backLabel="Back to my profile" />
          <p className="text-base text-ink-soft">
            Your role doesn&apos;t have view access to {label} on {film.title}.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex-1 bg-paper px-6 py-10 text-ink">
      <div className="mx-auto max-w-3xl">
        <PageHeader title={label} backHref="/me" backLabel="Back to my profile" />
        <p className="text-base text-ink-soft">
          {meta?.restricted
            ? `${label} is a Restricted module — access is gated correctly, but the screen itself hasn't been built yet. It lands in a later phase, isolated per the Pass 2 requirement in backlot-design-system.md.`
            : `${label} hasn't been built yet. This placeholder exists so Step 4's nav rail has a real, permission-checked destination to prove role-filtered visibility against — the actual screen lands in a later phase.`}
        </p>
        <p className="mt-4 font-mono text-xs uppercase tracking-wide text-ink-soft">
          Film: {film.title} · Module key: {params.moduleKey}
        </p>
      </div>
    </main>
  );
}
