# Backlot — Phase 0 Findings

**Scope:** shared spine only (Identity/RBAC, Film registry, People registry, Document/media store, Notification/dispatch, OrchaLLM gateway stub, Audit log). No module logic. Written against `backlot-pass2-deep-dive.md` (CallSheet Ops, LocationBank, SceneSpine sections) and the design system docs.

---

## 1. Data model — table list

All tables carry `org_id` even though there's one org today, so nothing has to be retrofitted if a second production company ever runs on this platform. Naming is snake_case to match the Prisma/Postgres convention already used in the deep-dive's own "first data model" sketches.

### 1.1 Identity & RBAC

| Table | Key fields | Notes |
|---|---|---|
| `organization` | id, name, created_at | Single row for now. |
| `user` | id, org_id, email, phone, name, status, created_at | NextAuth-backed login identity. |
| `org_membership` | id, org_id, user_id, org_role (`owner`\|`admin`\|`member`) | Org-level admin power: create films, manage the role catalog, manage `role_permission`. Independent of any film. |
| `role` | id, org_id, key, label, description, created_at | Catalog of role types: "1st AD", "Location Manager", "Producer", "Production Coordinator", etc. Org-scoped and user-editable — not hardcoded, since a company will have idiosyncratic titles. |
| `role_permission` | id, role_id, module_key, capability, created_at | The permission grid. `capability` is a free string per module (e.g. `view`, `edit`, `dispatch`, `view_restricted_fields`) rather than a fixed enum, so a module can add a new action without a schema migration. `view` on a module is what makes it appear in the nav rail. |
| `film_assignment` | id, film_id, user_id, role_id, department, start_date, end_date, status, created_at | Binds a **logged-in user** to a film with a role. This is what RBAC actually reads. A person can hold more than one row (e.g. producer *and* uncredited 2nd unit AD on a small crew) — permissions union. |
| `role_field_access` | id, role_id, field_group, can_view (bool) | Generic field-level visibility grant, keyed to a `field_group` tag (see §1.3) rather than one row per field. Powers "contact info restricted to certain roles" everywhere it recurs (People, LocationBank, later RightsLedger) without a bespoke mechanism per module. |

**Permission resolution (used for both API guards and nav rail):**

1. Resolve `user` + current film context (see open question 2 on how "current film" is chosen).
2. `role_ids` = all `role_id` from `film_assignment` where `user_id` + `film_id` match and `status = active`.
3. Effective capabilities = union of `role_permission` rows for those `role_ids`.
4. Nav rail modules = distinct `module_key` where the user has a `view` capability, plus any org-admin-only modules if `org_membership.org_role ∈ {owner, admin}`.
5. Field visibility = union of `role_field_access.field_group` across the same `role_ids`.
6. Every check is a data lookup, not a code branch — adding a role or regrading a permission never needs a deploy.

### 1.2 Film / project registry

| Table | Key fields | Notes |
|---|---|---|
| `film` | id, org_id, title, working_title, status (`prep`\|`shoot`\|`post`\|`wrapped`\|`archived`), start_date, end_date, primary_language, created_at, updated_at | The central entity every module's data hangs off (`film_id`). |
| `film_settings` | film_id, key, value (jsonb) | Small escape hatch for module-agnostic per-film config (e.g. bilingual toggle default) so Phase 1+ modules don't force a schema migration for every new setting. Flagged as an assumption below — happy to make this explicit columns instead if you'd rather not have a jsonb bag this early. |

### 1.3 People registry

| Table | Key fields | Notes |
|---|---|---|
| `person` | id, org_id, full_name, preferred_name, phone, email, whatsapp_number, languages (text[]), is_minor (bool), notes, user_id (nullable FK → user), photo_media_id (nullable FK → media_asset), created_at, updated_at | One record per human — crew, cast, vendors. `user_id` is nullable and links to a login only when that person also has platform access (e.g. the 1st AD is both a `person` for distribution purposes and a `user` for RBAC purposes — these are deliberately separate concepts; a junior artist needs a `person` row to appear on a call sheet distribution list but will never have a `user` row). |
| `person_film_role` | id, person_id, film_id, role_id, department, contact_channel_pref, language_pref, start_date, end_date, created_at | The domain-level crew assignment ("who is on this film, in what capacity") — distinct from `film_assignment`, which governs login/RBAC. This is what CallSheet Ops' recipient model reads. |

**Field-level visibility, applied generically:** sensitive columns on `person` (`phone`, `email`, `whatsapp_number`) are tagged with `field_group = 'contact_restricted'` at the application layer. Any screen rendering a `person` record filters those fields through `role_field_access` for the viewer's current-film roles. Same mechanism will cover LocationBank's owner contact/rate fields in Phase 1 — no new visibility system needed per module.

### 1.4 Document / media store

| Table | Key fields | Notes |
|---|---|---|
| `media_asset` | id, org_id, film_id (nullable), uploaded_by_user_id, current_version_id, mime_type, created_at | The logical, stable document identity. |
| `media_asset_version` | id, media_asset_id, version_number, storage_provider (`local`\|`s3`), storage_key, byte_size, checksum_sha256, encryption_key_ref, uploaded_by_user_id, change_note, created_at | Immutable per-version blob record. `encryption_key_ref` points at a per-file data-encryption key, itself wrapped by an org-level master key (envelope encryption — see open question 4). |

Access events (view/download/upload/delete) are **not** a separate table — they write into the shared `audit_event` log (§1.6) rather than duplicating an audit mechanism. Flagged as a decision, not a given — see open question 5.

### 1.5 Notification / dispatch service

Schema-level, provider-agnostic — no module ever imports a WhatsApp or email SDK directly:

| Table | Key fields | Notes |
|---|---|---|
| `notification_template` | id, org_id, key, channel (`whatsapp`\|`email`), language, subject, body_template, created_at | |
| `notification_message` | id, org_id, film_id (nullable), template_id (nullable), channel, recipient_person_id, recipient_contact, body_rendered, status (`queued`\|`sent`\|`delivered`\|`read`\|`failed`), provider_message_id, sent_at, delivered_at, read_at, failed_reason, created_at | The generic delivery record. A module (e.g. CallSheet Ops' `call_sheet_recipient` table, built in Phase 1) references `notification_message.id` for underlying delivery status and adds its own module-specific state (e.g. `acknowledged_at`) on top — the generic layer tracks *delivery*, the module tracks *meaning*. |

**Interface contract** (service layer, not schema): `NotificationProvider.send(message) → {provider_message_id}`, `.handleWebhook(payload) → status update`. `WhatsAppBusinessAdapter` and `EmailAdapter` both implement this; nothing else in the codebase touches the WhatsApp or email API surface directly.

### 1.6 Model gateway (OrchaLLM stub)

| Table | Key fields | Notes |
|---|---|---|
| `llm_provider` | id, key, zero_retention (bool), allowed_for (text[]), enabled | Registry of usable providers. The gateway refuses to route a sensitivity-tagged call to a non-zero-retention provider — enforced in code, driven by this table. |
| `llm_request_log` | id, org_id, film_id (nullable), requested_by_user_id (nullable), module_key, purpose, provider_key, model, prompt_hash, response_hash, token_count_in, token_count_out, zero_retention_used (bool), status, created_at | Never stores raw prompt/response text — hashes only, plus enough metadata to reconstruct "who asked what kind of question, when, against which provider" for an audit without holding the sensitive content itself. |

**Interface contract:** `OrchaLlmClient.complete({module_key, purpose, film_id, prompt, schema?}) → result`. Phase 0 wires this to wrap a single provider call end-to-end (including logging) even though no module calls it yet — the point is that the plumbing exists so Phase 1's SceneSpine extraction calls don't require touching this layer's shape.

### 1.7 Audit log

| Table | Key fields | Notes |
|---|---|---|
| `audit_event` | id, org_id, film_id (nullable), actor_user_id (nullable), actor_type (`user`\|`system`), action, entity_type, entity_id, before_json (nullable), after_json (nullable), ip_address, user_agent, created_at | Applies from day one, not bolted on. Populated from the shared service layer (not DB triggers) so actor/IP context — which only exists at the request level — is captured correctly. |

Every write to every spine table goes through this. Reads are audited selectively — see open question 6.

---

## 2. RBAC permission model — summary

**Chain:** `org → film → role (via film_assignment) → role_permission (module + capability)`.

- **Org-level** (`org_membership`): controls who can create films, edit the role catalog, and edit the permission grid itself. Not film-scoped.
- **Film-level** (`film_assignment`): controls what a user can do *on a given film*. A user with no assignment on a film sees nothing about it, full stop — including its existence in their nav, unless they're an org admin.
- **Module + capability** (`role_permission`): what a role can do within a module — `view` (nav visibility), `edit`, `admin`, and module-specific verbs (`dispatch`, `delete`) as modules are built. Adding a capability is a data insert, not a migration.
- **Field-level** (`role_field_access`): orthogonal to module capability — governs *which fields* of a record a role can see, keyed by `field_group` tag on sensitive columns. Built now, populated with real grants once a module (People registry) actually has restricted fields to gate.

This gives the nav rail, every API guard, and every restricted-field render the same data-driven source of truth — matching the design system's requirement that a 1st AD sees CallSheet Ops + SceneSpine, a location manager sees LocationBank + PermitTrack, and business affairs sees RightsLedger and nothing else, without any of that being a hardcoded `if (role === 'x')` anywhere in the app.

**Deliberately deferred to Phase 1+:** RightsLedger's requirement for a permission tier that does *not* inherit from any production role (per the deep-dive's isolation call-out) — `role_permission` and `role_field_access` are structured generically enough to support a fully separate role catalog per module if needed later, but Phase 0 doesn't build that isolation path since no Phase 0/1 module needs it yet.

---

## 3. Open questions

1. **Single org, confirmed?** Modelling `org_id` everywhere on the assumption this stays one production company for the foreseeable future, but isn't hardcoded to one row. Confirm that's the right amount of future-proofing (vs. not bothering with `org_id` at all).
2. **"Current film" context.** The nav rail and most screens need a selected film in session. Default assumption: if a user has exactly one active `film_assignment`, auto-select it; if more than one, show a film switcher. Confirm this matches how people will actually use it (e.g. is anyone crewed on two live films at once?).
3. **Read auditing scope.** Auditing every write is unambiguous. Auditing every *read* of every table is expensive and mostly noise. Proposal: audit reads only for designated sensitive entity types — `person` restricted fields, `media_asset`, and (later) RightsLedger — everything else audits writes only. Confirm or adjust the sensitive list.
4. **Encryption approach.** "Real, not placeholder" encryption at rest for local/S3-compatible storage — proposing application-layer envelope encryption (per-file DEK wrapped by an org master key) so it's identical regardless of backend, rather than leaning on S3 SSE (which wouldn't cover local disk). Confirm this is the right call versus, e.g., requiring S3-compatible storage only and using provider-side encryption.
5. **Media access log vs. generic audit log.** Proposing access events feed the shared `audit_event` table rather than a bespoke `media_access_log`, to avoid two audit mechanisms. If media access needs a different retention period than general audit (plausible, given DPDP retention questions), a separate table might be right after all — flag if you know that answer already.
6. **WhatsApp Business API status.** The deep-dive calls this out as the one dependency that can block week one — template registration/approval takes real calendar time. Has an application been started, or does that need to happen before any dispatch-service code is useful to test?
7. **NextAuth login method.** Only `user` rows (not all `person` rows) log in. Assuming email/password or magic-link to start, for a small set of named users (coordinators, ADs, producers, location managers) — not SSO, not self-serve signup. Confirm, and confirm who the first handful of real users are so seed data is realistic.
8. **`film_settings` as jsonb vs. explicit columns.** Used a small key/value escape hatch for per-film config that doesn't obviously belong to a specific module yet. If you'd rather keep the schema fully explicit even at the cost of a migration per new setting, say so now — easy to change before anything's built on it.
9. **Minors handling, operationally.** `person.is_minor` is modelled as a flag now per the deep-dive's instruction to flag it loudly, but Phase 0 doesn't yet define what the flag *does* (restrict from broad distribution? require a specific role to view at all?). That's really a Phase 1 CallSheet Ops decision, but flagging now since the field exists starting today.
10. **DPDP counsel engagement.** The deep-dive's own open question #4 — has counsel been engaged on lawful basis / notice for crew personal data? Doesn't block Phase 0 schema work, but does block anything resembling a real pilot with real crew data.

---

**Not building in Phase 0**, per your scope: any module UI beyond the nav rail shell, WhatsApp template content, script parsing, PostGIS/location search, rights conflict logic — all Phase 1+.

Waiting on your sign-off before writing any code.
