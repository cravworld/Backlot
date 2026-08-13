import Link from "next/link";

// Minimal shared chrome for pre-nav-rail pages. The real nav rail (module
// tabs, role-filtered, strip-spine active state) is Step 4 of the Phase 0
// process and lands once there's more than one module behind it — this is
// intentionally not that.
//
// `title` is the actual page identity — what a user reads to confirm
// "yes, I'm on the film I meant to open" — so it gets the design
// system's real heading treatment (font-display, ~26px, per
// backlot-style-guide.html's .rc-title), not a 12px mono breadcrumb
// label. The constant "BACKLOT" wordmark, which never changes and
// appears on every page, is deliberately smaller than the thing that
// actually varies and that the user needs to read.
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
    <div className="mb-8 border-b border-line pb-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/me" className="flex items-center gap-2">
          <div
            className="h-4 w-4 flex-shrink-0 rounded-[3px]"
            style={{
              background:
                "linear-gradient(135deg, var(--verdigris) 0 50%, var(--ochre) 50% 100%)",
            }}
          />
          <span className="font-display text-sm font-bold tracking-wide text-ink-soft">
            BACKLOT
          </span>
        </Link>
        {backHref && (
          <Link
            href={backHref}
            className="text-base text-ink-soft transition-colors hover:text-ink"
          >
            ← {backLabel ?? "Back"}
          </Link>
        )}
      </div>
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-ink">
        {title}
      </h1>
    </div>
  );
}
