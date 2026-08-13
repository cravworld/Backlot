import { getOrgRole, listUserFilms, getNavModules, type FilmSummary } from "@/lib/rbac";
import { getCurrentFilm } from "@/lib/current-film";
import { MODULE_CATALOG } from "./module-catalog";
import type { RailTab } from "./rail-tabs";

export type NavRailData = {
  films: FilmSummary[];
  currentFilmId?: string;
  currentFilmTitle?: string;
  moduleTabs: RailTab[];
  adminTabs: RailTab[];
};

// Single place that resolves everything the shell (topbar + rail) needs
// to render, fetched once per request in the (app) layout and passed
// down as plain props — TopBar/NavRailAside stay presentational.
export async function getNavRailData(userId: string, orgId: string): Promise<NavRailData> {
  const [orgRole, films] = await Promise.all([getOrgRole(userId, orgId), listUserFilms(userId)]);
  const admin = orgRole === "OWNER" || orgRole === "ADMIN";
  const currentFilm = films.length > 0 ? await getCurrentFilm(userId, films) : null;
  const navModules = currentFilm ? await getNavModules(userId, currentFilm.filmId) : [];

  const moduleTabs: RailTab[] = currentFilm
    ? navModules.map((key) => {
        const meta = MODULE_CATALOG[key];
        return {
          href: `/films/${currentFilm.filmId}/modules/${key}`,
          label: meta?.label ?? key,
          sub: meta?.restricted ? "Restricted" : "Not built yet",
          restricted: meta?.restricted,
          kind: "module" as const,
        };
      })
    : [];

  const adminTabs: RailTab[] = admin
    ? [
        { href: "/films", label: "Film registry", kind: "admin" as const },
        { href: "/people", label: "People", kind: "admin" as const },
        { href: "/audit", label: "Audit log", kind: "admin" as const },
        { href: "/notifications", label: "Notifications", kind: "admin" as const },
        { href: "/orchallm", label: "OrchaLLM gateway", kind: "admin" as const },
      ]
    : [];

  return {
    films,
    currentFilmId: currentFilm?.filmId,
    currentFilmTitle: currentFilm?.filmTitle,
    moduleTabs,
    adminTabs,
  };
}
