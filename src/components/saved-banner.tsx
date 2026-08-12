// Verdigris = confirmed/positive in the design system's four-color status
// vocabulary — reusing it here rather than inventing a new signal for
// "that save went through." Shown once, driven by a ?saved=1 redirect
// from the server action — not a client-side toast/timer, so it survives
// a page refresh and needs no JS state to manage.
export function SavedBanner({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <p
      className="mb-4 w-fit rounded-sm px-3 py-2 text-sm"
      style={{
        color: "var(--verdigris)",
        background: "color-mix(in srgb, var(--verdigris) 12%, transparent)",
      }}
    >
      {label}
    </p>
  );
}
