import { RailFilmSwitcher } from "./film-switcher-rail";
import { RailTabs } from "./rail-tabs";
import type { NavRailData } from "./data";

// The binder-tab rail itself, per backlot-design-system.md: "persistent
// left module rail (binder-tab metaphor), role-filtered per user."
// Below the `rail` breakpoint (860px) it collapses to a horizontal
// scroll strip — see the `rail:` responsive classes here and in the
// child tab components, matching backlot-style-guide.html's
// `@media (max-width: 860px)` rule for `.rail`.
export function NavRailAside({ films, currentFilmId, currentFilmTitle, moduleTabs, adminTabs }: NavRailData) {
  return (
    <aside className="flex flex-shrink-0 overflow-x-auto border-b border-line bg-paper-raised rail:w-[220px] rail:flex-col rail:overflow-visible rail:border-b-0 rail:border-r rail:py-[18px]">
      <RailFilmSwitcher films={films} currentFilmId={currentFilmId} />

      {films.length === 0 ? (
        <p className="flex-shrink-0 whitespace-nowrap px-6 py-3 text-sm text-ink-soft rail:whitespace-normal">
          No active film assignment — nothing to show here yet.
        </p>
      ) : moduleTabs.length === 0 ? (
        <p className="flex-shrink-0 whitespace-nowrap px-6 py-3 text-sm text-ink-soft rail:whitespace-normal">
          No modules with view access on {currentFilmTitle}.
        </p>
      ) : (
        <RailTabs tabs={moduleTabs} />
      )}

      {adminTabs.length > 0 && <RailTabs heading="Admin" tabs={adminTabs} />}
    </aside>
  );
}
