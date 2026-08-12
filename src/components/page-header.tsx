import Link from "next/link";

// Minimal shared chrome for pre-nav-rail pages. The real nav rail (module
// tabs, role-filtered, strip-spine active state) is Step 4 of the Phase 0
// process and lands once there's more than one module behind it — this is
// intentionally not that.
export function PageHeader({
  title,
  backHref,
  backLabel,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-8 flex items-center justify-between border-b border-line pb-4">
      <div className="flex items-center gap-3">
        <Link href="/me" className="flex items-center gap-2.5">
          <div
            className="h-5 w-5 flex-shrink-0 rounded-[3px]"
            style={{
              background:
                "linear-gradient(135deg, var(--verdigris) 0 50%, var(--ochre) 50% 100%)",
            }}
          />
          <span className="font-display text-xl font-bold tracking-wide text-ink">
            BACKLOT
          </span>
        </Link>
        <span className="text-line">/</span>
        <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">
          {title}
        </span>
      </div>
      {backHref && (
        <Link
          href={backHref}
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          ← {backLabel ?? "Back"}
        </Link>
      )}
    </div>
  );
}
