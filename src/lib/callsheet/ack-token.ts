import { randomBytes } from "crypto";

// Per phase-1-findings.md sign-off answer (a): acknowledgment ships as a
// tokenized web link in a plain-text WhatsApp message, not an interactive
// button. This token is the entire security boundary on a public,
// unauthenticated URL (/ack/[token]) — 256 bits of randomness, matching
// the entropy convention already established for DEKs in lib/media.ts
// rather than inventing something weaker for this one column.
// base64url (not plain base64) so the token is directly URL-safe with no
// encoding step needed when it's dropped into a WhatsApp message.
export function generateAckToken(): string {
  return randomBytes(32).toString("base64url");
}
