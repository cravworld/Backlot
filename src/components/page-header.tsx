import Link from "next/link";

// `title` is the page identity — what a user reads to confirm "yes, I'm
// on the film I meant to open" — so it gets the design system's real
// heading treatment (font-display, ~26px, per backlot-style-guide.html's
// .rc-title). The constant "BACKLOT" wordmark used to live here too, but
// Step 4's nav rail (src/components/nav-rail/top-bar.tsx) now renders it
// once, persistently, above every page — keeping a second copy here
// would just stack two identical wordmarks on load.
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
      {backHref && (
        <div className="mb-3">
          <Link
            href={backHref}
            className="text-base text-ink-soft transition-colors hover:text-ink"
          >
            ← {backLabel ?? "Back"}
          </Link>
        </div>
      )}
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-ink">
        {title}
      </h1>
    </div>
  );
}
