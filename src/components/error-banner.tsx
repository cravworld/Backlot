// Clay = at-risk/destructive in the design system's four-color status
// vocabulary — the rejection counterpart to SavedBanner's verdigris.
// Driven by a ?error=<message> redirect from an ActionError catch, same
// mechanism as SavedBanner's ?saved=1: survives a page refresh, needs no
// client JS state.
export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      className="mb-4 w-fit max-w-xl rounded-sm px-3 py-2.5 text-base"
      style={{
        color: "var(--clay)",
        background: "color-mix(in srgb, var(--clay) 12%, transparent)",
      }}
    >
      {message}
    </p>
  );
}
