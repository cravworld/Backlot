import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getNavRailData } from "@/components/nav-rail/data";
import { TopBar } from "@/components/nav-rail/top-bar";
import { NavRailAside } from "@/components/nav-rail/nav-rail-aside";

// Step 4: the nav rail shell. A route group (no URL change — /me, /films,
// etc. keep their paths) so every authenticated page gets the same
// persistent topbar + module rail, while /login stays outside it (no
// user to resolve a rail for yet).
//
// Deliberately re-fetches RBAC/current-film state on every request
// rather than caching it — same posture as lib/rbac.ts itself, so a
// permission or film-assignment change is visible on the very next
// navigation.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const rail = await getNavRailData(session.user.id, session.user.orgId);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <TopBar name={session.user.name} />
      <div className="flex flex-1 items-stretch">
        <NavRailAside {...rail} />
        {children}
      </div>
    </div>
  );
}
