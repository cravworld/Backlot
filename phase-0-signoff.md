# Backlot — Phase 0 Sign-off Summary

**Scope:** closes out the shared spine (Identity/RBAC, Film registry, People registry, Audit log, Document/media store, Notification/dispatch, OrchaLLM gateway stub) per the Phase 0 kickoff prompt's Step 5. Written against `phase-0-findings.md` and everything built since your sign-off on it.

---

## 1. What's built

All 7 spine components, built in order, each verified end-to-end (by you, by me, or both) before the next one started.

| # | Component | Verification surface |
|---|---|---|
| 1 | Identity & RBAC | `/login`, `/me` |
| 2 | Film registry | `/films`, `/films/[id]` |
| 3 | People registry | `/people`, `/people/[id]`, `/films/[id]/crew` |
| 4 | Audit log | `/audit` |
| 5 | Document/media store | `/films/[id]/documents`, `/api/media/[versionId]` |
| 6 | Notification/dispatch service | `/notifications`, `/api/webhooks/whatsapp`, `/api/webhooks/email` |
| 7 | OrchaLLM gateway stub | `/orchallm` |

Two cross-cutting fixes landed along the way, both found by real click-through, not code review:

- **Submit feedback + duplicate-write fix** — every mutating form now shows a pending state (`SubmitButton`) and a save confirmation; `isUnchanged()` dedup stops repeated identical saves from producing duplicate audit rows.
- **Validation/authorization UX** — every `throw`-based rejection (minor-recipient block, "title required," non-admin access, etc.) now redirects back to the page with an inline message (`ActionError` / `ErrorBanner`) instead of crashing to a raw dev error overlay. Applied consistently across all four action files, not patched only where it was first noticed.
- **`/me` navigation gap** — non-admin users had no click-path into a film's own pages (crew, documents) at all; the film switcher only ever changed which film's RBAC data `/me` displayed. Fixed with an "Open \<film\> →" link.

---

## 2. Production-ready vs. stubbed

This is the column that matters most for a go/no-go call — being direct about it.

**Genuinely production-ready today, works with real data, no shortcuts:**
- RBAC permission resolution — org → film → role → capability → field-access. Every check is a live DB lookup; nothing is a hardcoded role branch.
- Audit logging — every write funnels through `recordAuditEvent()`; selective sensitive-read logging (Person contact fields, media downloads); dedup on no-op saves.
- Envelope encryption for documents — real AES-256-GCM, fresh per-file key wrapped by an org master key. Verified: round-trips correctly, old versions independently readable after a new upload, wrong-key decrypt correctly rejected, on-disk blob confirmed not plaintext.
- Film and People registries — full CRUD, org-scoped everywhere, field-level contact visibility gated by `role_field_access`.
- The `ActionError`/`ErrorBanner` pattern — consistent across every mutating action in the app.

**Real code, but unusable until credentials arrive** — these are correct implementations against each provider's documented API shape, not placeholders; they just have nothing configured to call yet:
- WhatsApp Cloud API adapter — needs `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_APP_SECRET`, and a real WhatsApp Business API application (sign-off open question 6 — still on you).
- Resend email adapter — needs `RESEND_API_KEY`.
- Anthropic OrchaLLM adapter — needs `ANTHROPIC_API_KEY`.

**Deliberately thin for Phase 0**, per the findings doc's own "not building" scope:
- `LlmProvider` routing is "first eligible provider" — no real cost/quality routing strategy. Moot today with one provider registered; matters once a second one is.
- No template-authoring UI for notifications — templates are seeded (`prisma/seed.ts`), not editable in-app.
- `Person.photoMediaId` FK exists (landed with the document store, as planned) but has no photo-upload UI wired to it.
- Media storage is local-disk only — the schema's `StorageProvider` enum has an `S3` value, but no S3 adapter is built.
- `/me` is a raw RBAC-verification page, not a real product UI — it's what Step 4's nav rail is meant to replace, not a finished screen.

---

## 3. Known gaps — and whether they block Phase 1

| Gap | Blocks Phase 1 (CallSheet Ops)? |
|---|---|
| Notification webhook (`applyWebhookEvents`) matches by `providerMessageId` with no org scope. Inert with one org and one shared set of provider credentials; needs per-org credentials or per-org webhook URLs before a second org exists. | No — single-org today. Must be revisited before a second org goes live. |
| OrchaLLM's `schema` param is now explicitly rejected rather than silently ignored (fixed this pass) — but structured output itself still isn't implemented. | Only if SceneSpine needs it before other Phase 1 work — flagged, not a landmine. |
| Minors safe-default (`Person.isMinor` → excluded from distribution) is enforced at the dispatch layer, but nothing calls dispatch for a real feature yet. | No — but CallSheet Ops is exactly where this becomes load-bearing. Worth a specific test the moment real recipient lists exist. |
| No pagination anywhere (`/audit`, `/notifications`, `/orchallm` all cap at a fixed page size with no next-page control). | No at current data volume. Will need addressing before real usage volume. |
| `/me` is a placeholder verification surface, not a real nav. | No — deferred to Step 4 on purpose. |

---

## 4. Still on you, not code

Three items from your own sign-off answers, none blocked by anything built:

1. **WhatsApp Business API application** (open question 6) — start now if not already, template approval has real calendar lead time.
2. **DPDP counsel engagement** (open question 10) — doesn't block Phase 1 development, does block any pilot with real crew data.
3. **Real first named users** (open question 7) — seed data is still demo fixtures; you need to supply actual coordinator/AD/producer/location-manager names before a real pilot.

---

## 5. Deviations from the signed-off data model

Flagged individually in commit messages at the time; collected here for the record. None of these are gaps — they're places the implementation diverged from `phase-0-findings.md`'s exact column list or interface signature, each for a stated reason.

- **`MediaAsset.filename` / `MediaAssetVersion.originalFilename`** — added. The signed-off schema had no human-readable name column anywhere on either table, which isn't usable for a UI list or a download's `Content-Disposition` header.
- **`sensitive` boolean on `OrchaLlmClient.complete()`** — added. The findings doc's interface signature (`module_key, purpose, film_id, prompt, schema?`) didn't include a sensitivity flag, but the zero-retention gate needed something concrete to check against.
- **Resend as the email adapter vendor** — the kickoff prompt specified "email fallback" generically, not a vendor. Resend was picked for being a single-API-key HTTP call requiring no new dependency; the `NotificationProvider` interface is generic enough that swapping vendors later is a one-file change.
- **`StorageProvider` / `NotificationChannel` / `NotificationStatus` as Prisma enums** rather than the findings doc's free strings — matches the `FilmStatus`/`UserStatus` convention already in the schema. `AuditEvent.action` and `LlmRequestLog.status` deliberately stayed free strings, matching the findings doc's own reasoning for those two columns.

---

## 6. Go / no-go

**Go — begin Phase 1 (CallSheet Ops) development against this spine.** All 7 components are real, each verified in the browser (by you and by me), consistently org-scoped, and consistently audited.

**No-go — any pilot with real crew data, or any real WhatsApp dispatch,** until both (a) DPDP counsel signs off on lawful basis and notice, and (b) the WhatsApp Business API application is approved and real credentials are in place. Neither is blocked by code; both are your open items.

**Open question for you, not a code decision:** Step 4 (nav rail shell + day/night theme toggle) — build it now, before CallSheet Ops, so Phase 1's screens land in a real shell from day one? Or build CallSheet Ops's first screens first and shape the nav around what actually exists? Both are defensible; flagging so you pick rather than me deciding silently.
