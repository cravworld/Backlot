# Backlot — Phase 1 Findings (CallSheet Ops)

Scope source: `backlot-pass2-deep-dive.md` §2 (CallSheet Ops, six-week MVP, pp. 926–). Same process as Phase 0 — this is the sign-off gate before any code.

**Storage backend is settled, not an open question here**: Supabase Storage, via the `S3` branch of the existing `StorageProvider` enum (`prisma/schema.prisma`). It's S3-compatible, lives on the same Supabase project as the DB (one credential set, not a new account), and the envelope encryption in `lib/media.ts` (encrypt-then-upload, per-file DEK wrapped by `MEDIA_MASTER_KEY`) carries over unchanged — only the ciphertext's destination changes, from local disk to a Supabase Storage bucket over the S3 API. `lib/media.ts` currently only implements the `LOCAL` path (`storeMediaFile`/`readMediaFile` always hit `storage/media/` on disk, ignoring `storageProvider`); Phase 1 adds the `S3` branch and this module — the first real consumer of the document store beyond the Phase 0 test screen — writes call sheet PDFs through it. Needed env vars: a Supabase Storage S3-compatible endpoint, access key, secret key, bucket name (added to `.env.example` and Vercel alongside the existing set, once the schema below is signed off).

---

## 1. Data model — new tables

### 1.1 Shooting day & plan

- **`shooting_day`**: `id`, `filmId`, `shootDate`, `unitCallTime`, `locationLabel` (free text — LocationBank doesn't exist yet, so no FK), `locationNote`, `sunriseTime`, `sunsetTime`, `weatherNote`, `hospitalContact`, `safetyNote` (the mandatory, non-removable grievance/ICC contact block per the deep-dive's Hema Committee point — rendered on every call sheet regardless of role), `status` (`DRAFT` | `PUBLISHED`), `createdByUserId`, timestamps.
- **`shooting_day_scene`**: `id`, `shootingDayId`, `sceneSpineId` (nullable string — see open question g), `sceneLabel` (manual entry, the fallback the deep-dive requires so this ships without SceneSpine), `plannedPages` (stored as eighths, the industry unit, not a float), `sortOrder`.
- **`shooting_day_call_time`**: `id`, `shootingDayId`, `personId` (nullable), `departmentLabel` (nullable — exactly one of the two set, enforced app-side), `callTime`. Covers both "cast call times per actor" and "department calls" from the deep-dive's §5 with one table rather than two near-identical ones.

### 1.2 Call sheet artifact & dispatch

- **`call_sheet_version`**: `id`, `shootingDayId`, `versionNumber`, `pdfMediaAssetId` (FK → `media_asset`, the PDF itself lives in the document store, not a bespoke path), `changeNote` (required on amendments — "rain call", "location moved" — the version number is visible on the artefact per the deep-dive's amendment rule), `publishedByUserId`, `publishedAt`.
- **`call_sheet_dispatch`**: `id`, `callSheetVersionId`, `personId`, `notificationMessageId` (FK → the existing `notification_message` row — per `dispatch.ts`'s own comment, a module references that id for delivery status rather than duplicating it), `acknowledgedAt`, `acknowledgedVia` (free string, e.g. `whatsapp_button`). A new `call_sheet_version` (amendment) means a fresh row per recipient, re-triggering acknowledgment — nothing carries over from the prior version, matching "must re-trigger acknowledgment."

### 1.3 Daily production report

- **`daily_production_report`**: `id`, `shootingDayId`, `submittedByUserId`, `submittedAt`, `actualCallTime`, `actualWrapTime`, `cateringBreakfast`/`cateringLunch`/`cateringDinner` (int counts), `juniorArtistPlanned`, `juniorArtistActual`, `incidentsNote`, `equipmentIssuesNote`.
- **`dpr_scene_result`**: `id`, `dprId`, `shootingDaySceneId`, `status` (`COMPLETED` | `PARTIAL` | `DROPPED`), `pagesShot` (eighths).
- **`dpr_overtime_entry`**: `id`, `dprId`, `departmentLabel`, `overtimeMinutes`.

Variance (planned vs. actual scenes/pages, cumulative schedule position) is a **computed query** against `shooting_day_scene` + `dpr_scene_result` across a film's shooting days — not a stored column, matching how `getNavModules`/capabilities are resolved live rather than cached.

---

## 2. RBAC — module additions

`callsheet_ops` is already registered in `MODULE_CATALOG` (Step 4) with a placeholder destination. New capabilities under it, following the existing `role_permission` free-string pattern (no migration to add one later):

- `view` — see shooting days, call sheets, DPRs for the film (nav visibility, same as every other module).
- `edit` — create/amend a shooting day, generate and publish a call sheet version.
- `dispatch` — send a published version to the recipient list. Kept separate from `edit` because a coordinator drafting a call sheet and a 1st AD approving/sending it may legitimately be different people.
- `dpr_submit` — fill and submit the DPR (the 2nd AD's capability at wrap).

**Working-hours/variance access** needs its own answer — see open question (e) below, since the deep-dive explicitly restricts this data more tightly than general `view`.

**Recipient-side contact minimization** ("a junior technician's call sheet does not carry the lead actor's mobile number") reuses the existing `role_field_access` / `FieldGroup.CONTACT_RESTRICTED` mechanism, but repurposed: at render time, a recipient's *own* film role determines what's baked into *their* personalized PDF, not the sender's privilege. This is a new consumer of an existing mechanism, not a new one — flagged as an assumption to confirm in open question (f).

---

## 3. Integration with what Phase 0 already built

- **Dispatch**: `dispatchNotification()` is called once per recipient per `call_sheet_version`; `call_sheet_dispatch.notificationMessageId` links to the result. The minors safe-default (sign-off open question 9, enforced in `dispatch.ts` since Phase 0) is now exercised for real for the first time — no new code needed, just a real caller.
- **Document store**: call sheet PDFs are `MediaAsset`/`MediaAssetVersion` rows like any other document, uploaded through `storeMediaFile` (once the `S3` branch exists).
- **Audit log**: every `shooting_day`/`call_sheet_version`/`daily_production_report` write goes through `lib/audit.ts` like every table before it. DPR access likely belongs on the "sensitive reads get audited" list from Phase 0 open question 3, alongside `person` contact fields and `media_asset` — flagged, not yet decided (see open question e).

---

## 4. Open questions

**a. Acknowledgment mechanism — this is the one that actually needs new adapter work.** The current `whatsapp-adapter.ts` only sends plain text and parses delivery-*status* webhooks (`sent`/`delivered`/`read`/`failed`). "Tap to acknowledge" needs (i) sending an interactive button message, which requires an approved WhatsApp template with a button component, and (ii) parsing a *different* inbound webhook shape (`messages`, not `statuses`) and matching the replying phone number back to a `Person` + open `call_sheet_dispatch` row to set `acknowledgedAt`. Confirm this is in scope for the six-week build (it has to be — it's the headline feature) and not something you expected already covered by Phase 0's `read` receipt (native WhatsApp "read" ≠ a real acknowledgment tap, per the deep-dive's own distinction).

**b. WhatsApp Business API status.** Standing blocker carried over from Phase 0 open question 6 — has the template application (including the acknowledgment button, per (a)) been submitted? This has real calendar lead time and gates any live dispatch testing, independent of code progress.

**c. Bilingual rendering.** Propose a static, human-verified Malayalam template per `notification_template` row (the `language` column already exists on that table) rather than live translation at send time — call sheets are structurally repetitive, so pre-authoring both language versions once is cheap and avoids ever sending populated personal data through a translation model. OrchaLLM-assisted translation, if used at all, would only ever touch the empty template *shell*, never a populated call sheet (per the deep-dive's own instruction). Confirm this is the right default vs. wanting live per-call-sheet translation.

**d. PDF generation library.** Nothing chosen yet. Recommend `@react-pdf/renderer` (pure JS, no native binary) over a headless-Chromium approach (Puppeteer) — Vercel's serverless functions handle the former far more cleanly. Confirm before it's added as a dependency.

**e. Variance/working-hours access tier.** The deep-dive explicitly says working-hours data should be "access-restricted to production leadership and compliance, not the general producer pool" — tighter than the module's general `view` capability. Proposing a distinct capability (e.g. `view_workinghours`) rather than reusing `role_field_access`, since that mechanism is column-level on `person`/future modules, not report-level. Confirm.

**f. Recipient-side contact minimization, confirmed as recipient's-own-role-gated** (see §2) — flagging explicitly since it's a repurposing of an existing mechanism, not a straightforward reuse.

**g. SceneSpine placeholder.** `shooting_day_scene.sceneSpineId` is a nullable string with no real FK (SceneSpine doesn't exist yet), per the deep-dive's manual-entry fallback. When SceneSpine is eventually built, this becomes a real foreign key — a migration, not a redesign, but flagging now so it isn't a surprise.

**h. Retention/deletion schedule.** The deep-dive calls for "retention policy on DPRs and dispatch logs with a defined deletion schedule." Phase 0 built no retention/deletion tooling anywhere in the app. Proposing this stays out of the six-week MVP itself but needs an explicit owner before real crew data accumulates for months on a live pilot — this is a real DPDP gap, not a nice-to-have.

**i. Minors on the document itself.** Phase 0's dispatch-layer exclusion (opt-in only) stops a minor from being sent messages by default. Separately: does the call sheet PDF need to omit a minor cast member's name/details entirely when generated for broad distribution, or just their contact info (already covered by contact minimization)? The deep-dive says minors "should never appear in a broadly-distributed document with personal details" — confirm what counts as "personal details" here (name alone, or name + any identifying detail).

---

## 5. Not building in Phase 1 (explicit MVP boundary, per the deep-dive)

No scheduling engine. No payroll or timesheet-to-payment. No cast contact directory exposed to general crew. No in-app chat. No location maps beyond a link. No approval chains.

---

## 6. Sign-off (2026-08-17)

**a. Acknowledgment mechanism — decided: no interactive buttons in v1.** Ships as a plain-text WhatsApp message containing a unique tokenized link to a lightweight, no-login web acknowledgment page ("I've seen this," one tap). Reuses the existing adapter's plain-text send and delivery-status webhook as-is — zero new inbound webhook parsing. Reasoning: interactive buttons need their own separate template approval on top of the one already pending for (b), so building that path now means nothing can go live until *two* Meta approvals land instead of one. The link works the moment basic WhatsApp send works; interactive buttons are a real phase-2 upgrade once the link flow's real-world performance is known, not a guess made now. Schema implication: `call_sheet_dispatch.ackToken` is that token — unique, unguessable, scoped to exactly one recipient's one version so it can't be replayed against anyone else's acknowledgment.

**b. WhatsApp Business API status.** Confirmed standing blocker — application stays in motion in parallel with everything else, independent of code progress.

**c. Bilingual rendering — confirmed:** static, pre-authored Malayalam templates, not live translation. Call times and locations are exactly the field type where a translation error is a safety issue, not a UX rough edge — not a place to spend OrchaLLM cycles.

**d. PDF library — confirmed:** `@react-pdf/renderer` over Puppeteer, the right call for a serverless deploy target.

**e. Variance/working-hours access tier — confirmed, as a distinct capability:** `callsheet_ops:view_variance`, separate from the module's general `view`, granted to the producer, production leadership, and whichever compliance role exists — not something every CallSheet Ops viewer gets by default. **This is the direct product consequence of the Hema Committee compliance point** flagged in `backlot-pass2-deep-dive.md` §2.6 — a system that produces an auditable record of *actual* working hours (call/wrap times, overtime by department) is genuinely valuable to the company's compliance position specifically because that record is restricted from casual/general access, not broadcast alongside the ordinary "did we finish our scenes today" view. Recording that connection here so it isn't lost if someone revisits the permission grid later without this context.

**Built against this sign-off:** `prisma/schema.prisma` (ShootingDay/ShootingDayScene/ShootingDayCallTime, CallSheetVersion/CallSheetDispatch with `ackToken`, DailyProductionReport/DprSceneResult/DprOvertimeEntry — migration `20260817060353_callsheet_ops`), the S3 branch of `lib/media.ts` (Supabase Storage, `@aws-sdk/client-s3`, auto-selected when `SUPABASE_S3_*` env vars are configured, local disk otherwise), and `callsheet_ops:view_variance` seeded onto a new `producer` role plus the existing `first_ad` role in `prisma/seed.ts`. Not yet built: the acknowledgment web page itself, call sheet generation/PDF rendering, the DPR form, and the variance summary view — those are the next slices.

---

## 7. Open question (i) resolved — minors omitted from the call sheet PDF by default (2026-08-17)

**Decided:** minors are omitted from the call sheet PDF entirely by default, with the same opt-in-not-opt-out posture as the dispatch-layer minor block (Phase 0 sign-off open question 9) — not a second, differently-shaped judgment call.

**Reasoning:** dispatch-exclusion and document-exclusion are genuinely different exposures. Dispatch-exclusion controls who *receives* the document; if a minor's name, role, and call time are still printed inside a PDF that then gets forwarded, photographed, or left on a dashboard, the dispatch safe-default hasn't protected anything — it's just changed which door the information walks out of. Keeping both behind the same opt-in rule, rather than inventing a second mechanism, is deliberate: one thing to reason about, not two.

**Built:** `publishCallSheet` (in `callsheet-ops/actions.ts`) filters `ShootingDayCallTime` rows by `person.isMinor` before they ever reach the PDF renderer, unless the publishing user explicitly checks an "include this minor in this version" box per entry (per-publish, not sticky — a new amendment starts from the same default). The omission count is recorded on the `call_sheet_version` audit event (`omittedMinorCount`, `includedMinorCallTimeIds`) so an override is traceable, not silent. Answers the deep-dive's "personal details" question narrowly for now: name + call time (the two fields actually rendered) are covered; there's no cast/crew roster section elsewhere in the PDF yet for the question to extend to.
