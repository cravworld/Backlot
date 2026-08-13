/**
 * A rejection meant to be shown to the user inline — "you can't do that,
 * here's why" — never a crash screen. Server Actions catch this
 * specifically (never a blanket catch-all) and redirect back to the
 * originating page with the message in the query string, rendered by
 * <ErrorBanner>. Anything that isn't an ActionError is a real bug and is
 * left to propagate and surface loudly, same as before this existed.
 *
 * Introduced after a real click-through: the minor-recipient block in
 * notifications (a correct, expected rejection) was surfacing as a raw
 * Next.js dev error overlay with a full stack trace — indistinguishable
 * from an actual crash. Every `throw new Error(...)` used for validation
 * or authorization across the app had the same problem; this is the fix
 * applied consistently, not just to the one place it was noticed.
 */
export class ActionError extends Error {}
