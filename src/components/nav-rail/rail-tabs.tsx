"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type RailTab = {
  href: string;
  label: string;
  sub?: string;
  restricted?: boolean;
  // "module": highlight for the tab's own route and anything nested
  // under it. "admin": same, but excludes /films/[id]/modules/* so a
  // film's module placeholder page doesn't also light up the unrelated
  // "Film registry" admin tab.
  kind: "module" | "admin";
};

function isActive(pathname: string, tab: RailTab): boolean {
  if (pathname === tab.href) return true;
  if (!pathname.startsWith(tab.href + "/")) return false;
  if (tab.kind === "admin" && pathname.includes("/modules/")) return false;
  return true;
}

// Client component so it can read the current pathname for active-state
// highlighting — the "same 3px spine treatment as strip cards, in
// verdigris" per backlot-design-system.md — which a server component
// can't do on its own. Data (which tabs exist at all) is resolved
// server-side against live role_permission reads and passed in as props.
export function RailTabs({ heading, tabs }: { heading?: string; tabs: RailTab[] }) {
  const pathname = usePathname();
  if (tabs.length === 0) return null;

  return (
    <div className="flex flex-shrink-0 flex-col rail:mb-1">
      {heading && (
        <div className="hidden px-6 pb-1 pt-4 font-mono text-xs uppercase tracking-wide text-ink-soft rail:block">
          {heading}
        </div>
      )}
      {tabs.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-shrink-0 flex-col gap-0.5 whitespace-nowrap border-l-[3px] px-5 py-3 pl-[21px] text-sm font-medium transition-colors ${
              active
                ? "border-l-verdigris bg-slate text-ink"
                : "border-l-transparent text-ink-soft hover:text-ink"
            }`}
          >
            <span>{tab.label}</span>
            {tab.sub && (
              <span
                className="font-mono text-xs uppercase tracking-wide text-ink-soft opacity-70"
                style={tab.restricted ? { color: "var(--clay)", opacity: 1 } : undefined}
              >
                {tab.sub}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
