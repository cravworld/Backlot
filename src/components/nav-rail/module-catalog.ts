export type ModuleMeta = { label: string; restricted?: boolean };

// Static display metadata only — NEVER a source of what's visible. What
// actually shows up in the rail always comes from getNavModules()'s live
// role_permission read (src/lib/rbac.ts); this just maps a moduleKey to a
// human label once that key is already known to be visible. Any
// moduleKey not listed here still renders, using the raw key as its
// label — a missing catalog entry should never hide a module a
// permission grant says the user can see.
export const MODULE_CATALOG: Record<string, ModuleMeta> = {
  callsheet_ops: { label: "Call Sheet Ops" },
  scenespine: { label: "SceneSpine" },
  locationbank: { label: "LocationBank" },
  permittrack: { label: "PermitTrack" },
  // Restricted per the Pass 2 isolation requirement in
  // backlot-design-system.md: "give it a subtle but real visual marker
  // (a persistent 'Restricted' treatment in the rail...)".
  rightsledger: { label: "RightsLedger", restricted: true },
};
