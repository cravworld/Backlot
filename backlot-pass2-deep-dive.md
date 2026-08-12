# Backlot — Pass 2 Deep Dive

**Internal AI product opportunities across the production company**
Eight selected candidates, full treatment, scored and ranked, with a 90-day build recommendation.

*"Backlot" is a placeholder name for the shared platform. Rename freely.*

---

## How to read this document

Each product gets the fifteen-point treatment agreed in the prompt. Scores appear at the end of each section; the consolidated ranked table and buckets follow all eight. The 90-day plan is the last section and is the part you'd actually act on next week.

Three things I've assumed throughout, from the architecture decision we made before this pass:

- **One platform, modular build.** Shared identity/RBAC, film registry, people registry, document store, script ingestion, notification dispatch, model gateway (OrchaLLM), audit log. Modules own their own tables and talk through shared services.
- **No module calls a model provider directly.** Everything routes through OrchaLLM, which enforces zero-retention provider selection and logs every prompt. This is what makes the privacy posture auditable rather than aspirational.
- **Item 15 for every product below is therefore "module on the Backlot platform" unless stated otherwise.** Where I've flagged an exception, it's for a real isolation reason, not an architectural preference.

A note on the legal references: DPDP Act 2023 and the Rules notified in 2025 have phased compliance timelines, and the specifics should be confirmed with counsel rather than taken from this document. Same for CBFC certification categories and any authority-specific lead times — I've written what's broadly true, but PermitTrack in particular depends on data that must be gathered first-hand and verified, not assumed.

---

# 1. SceneSpine

**Structured script breakdown**

### 1. Product name and primary users

**SceneSpine.** Primary users: line producer, 1st AD, production manager. Secondary: art department, costume, VFX supervisor, production accountant.

### 2. The bottleneck, in detail

Breakdown is the act of reading a screenplay and extracting every physical thing needed to shoot it: which characters appear in which scene, INT/EXT, day/night, location, props, vehicles, animals, children, stunts, crowd/junior artist counts, wardrobe changes, special equipment, VFX flags, weather dependency.

Today this is done by the line producer or 1st AD with a printed script and coloured highlighters, transferred by hand into Excel. It takes days. It is redone — partially, inconsistently, and usually under time pressure — every time the script changes, which on a Malayalam production is many times, including during shoot.

What breaks: the art department works off breakdown v2 while the AD schedules off v4. A scene that quietly acquired a car in the rewrite gets no car booked. Junior artist counts are guessed, then negotiated at the location on the day. The budget is costed against a breakdown nobody can reproduce three weeks later. And when a scene is cut, the props and cast attached to it stay in the plan because nothing propagates.

Ownership is ambiguous, which is part of the problem — the line producer owns the numbers, the 1st AD owns the shooting logic, and neither owns the artefact.

### 3. The decision or workflow it improves

Turns "read the script and write down what you see" into "review and correct a generated structured breakdown, then diff it against the last one." The improved decision is downstream: what to book, what to buy, what to build, how many days, how many junior artists, which scenes are weather-exposed.

### 4. Why a generic tool fails here

A chatbot given a screenplay produces a plausible prose summary of requirements. What's needed is a **stable, diffable object model** — every scene with a persistent identity that survives renumbering, every element normalised to a controlled vocabulary so "auto", "car", "Innova" and "vehicle" resolve to one entity, and every extraction traceable to a line in the script. Prose output cannot be scheduled against, costed against, or diffed. Also: Malayalam screenplays are frequently written in Malayalam Unicode, in Manglish transliteration, or code-switched — often in Word rather than Final Draft — which breaks off-the-shelf breakdown tools built for FDX.

### 5. Domain data, rules, relationships and workflows to model

- **Scene** as first-class entity: stable UUID, scene number (mutable), slugline, INT/EXT, D/N, location reference, page eighths, synopsis.
- **Elements** typed and normalised: cast, junior artists, props, set dressing, vehicles, animals, wardrobe, makeup/prosthetics, stunts, SFX, VFX, sound, special equipment, minors, weather dependency.
- **Element registry per film** — the controlled vocabulary, editable by the user, learned across the film.
- **Character ↔ actor mapping**, once casting is set.
- **Scene → location** link, resolving to a LocationBank record where available.
- **Version lineage**: which draft this breakdown came from, what changed since the last one, what a human overrode.
- **Override precedence rule**: a human correction always wins and must survive re-ingestion of a new draft. This is the single most important rule in the product. If a re-parse wipes someone's manual fixes, the product is dead on first contact.

### 6. Malayalam / regional specifics

- **Script formats in the wild**: FDX and Fountain are the minority. Expect Word documents, PDFs of scanned pages, Malayalam Unicode, Manglish, and mixed-script scripts where sluglines are English and dialogue is Malayalam. The parser must handle this or the product never starts.
- **Slugline conventions are inconsistent** — Malayalam productions often don't follow strict INT./EXT. formatting. The parser needs tolerant heuristics plus a human confirmation pass.
- **Weather dependency is a first-class flag, not a nice-to-have.** The southwest monsoon (roughly June–September) and the retreating monsoon (October–November) make exteriors genuinely unshootable for long stretches. Every EXT scene carries scheduling risk that a Mumbai- or LA-built tool doesn't model.
- **Junior artist counts** matter more than in a studio system because they're negotiated locally and paid daily.
- **Minors, stunts and animals** carry specific compliance obligations and should be flagged loudly for downstream sign-off.

### 7. Technical shape

**Data pipeline + rules engine, with a narrow LLM extraction layer under a strict schema.** Order of operations: deterministic parse (scene segmentation, slugline parsing, character cue detection) → LLM extraction only for ambiguous element identification, constrained to a JSON schema and a per-film vocabulary → normalisation against the element registry → human review queue → committed breakdown object.

The LLM is the smallest part. Resist the temptation to make it the whole thing.

### 8. Required data sources and integrations

Script ingestion service (shared). Element vocabulary seeded from past productions. LocationBank for location resolution. OrchaLLM for the extraction call. Export to XLSX (non-negotiable — everyone will want the spreadsheet) and eventually stripboard-compatible formats.

### 9. Solo-developer MVP scope

Ingest one script (PDF/DOCX/FDX/Fountain) → scene list with stable IDs → extraction of cast, INT/EXT, D/N, location, and four element types (props, vehicles, wardrobe, junior artists) → review UI where a human confirms or corrects each scene → element registry that learns corrections → breakdown export to XLSX → re-ingest a new draft and produce a scene-level diff with overrides preserved.

### 10. Explicit MVP boundary — do NOT build

No scheduling or stripboard. No budgeting or costing. No auto-generated shooting order. No handwriting/scan OCR. No multi-language script support beyond Malayalam/English. No "AI suggestions" about the script's quality — that's the screenplay diagnostic tool's job and mixing them will confuse users about what this product is for.

### 11. Success metrics

- Time from final draft to usable breakdown: target from days to under half a day.
- Extraction precision on cast and location ≥ 95% pre-correction; element types ≥ 80%.
- Corrections per scene declining across the first three films (the registry is learning).
- Re-breakdown after a script change: target under 30 minutes, versus a full manual redo.
- Business proxy: reduction in day-of-shoot "we didn't book that" incidents, tracked via DPR.

### 12. Adoption risks

The line producer may read this as a claim that their judgement is replaceable. It isn't — the product does the transcription, they do the judgement — but the framing has to be explicit from the first demo. Position it as "you stop typing, you keep deciding." Second risk: if the first extraction is visibly bad on their script, they won't come back. Pilot on a completed, released film first so you tune against ground truth before touching a live production.

### 13. Privacy, security, DPDP

Unreleased scripts are the most commercially sensitive asset the company holds. Requirements: zero-retention provider only, routed through OrchaLLM with per-call logging; no script content in prompt/response logs beyond hashes and scene IDs; per-film project isolation with explicit user grants; encryption at rest; script text never in error logs or analytics. Strong case for a self-hosted model for extraction on high-sensitivity projects — the extraction task is narrow enough that a smaller local model is viable, which is not true of most LLM uses.

Minors flagged in breakdown are personal-data adjacent once cast is attached; keep character-level flags separate from person-level records.

**Never leaves for a third-party provider:** nothing, ideally. If a hosted model is used, it's zero-retention only and the decision is logged per film.

### 14. Overlap with existing products

Shares the script ingestion service with the screenplay diagnostic tool, ScriptLens, and (later) DraftLedger. This is the largest reuse win in the whole portfolio — build the parser once, properly. No functional overlap; the diagnostic tool asks "is this script good," SceneSpine asks "what does this script cost to shoot."

### 15. Product form

**Module on Backlot**, and the anchor of the production-planning chain.

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 5 |
| Visible company impact | 4 |
| MVP feasibility | 4 |
| Data availability | 5 |
| Adoption ease | 4 |
| Strategic defensibility *(unweighted)* | 3 |
| **Weighted priority** | **4.40** |

---

# 2. CallSheet Ops

**Daily production coordination**

### 1. Product name and primary users

**CallSheet Ops.** Primary users: production coordinator, 2nd AD, 1st AD. Secondary: every crew member and cast member as a recipient; producer as a consumer of variance reporting.

### 2. The bottleneck, in detail

The call sheet is made in Word each evening for the next day, exported to PDF or a screenshot, and pushed into four or five WhatsApp groups plus a spray of individual messages. Nobody knows who has read it. Changes after distribution — a location swap, a cast member running late, a rain call — propagate by phone calls made one at a time by the coordinator, at night.

Coming back the other way, the daily production report is a paper form photographed on a phone: scenes completed, setups, call/wrap times, overtime, junior artist headcount, catering numbers, incidents. It reaches the producer days later, in a form nobody can aggregate. By the time anyone notices the unit is running two days behind, it's four.

Ownership: the production coordinator, who is typically the most overloaded person on the unit and the one whose evening this eats.

### 3. The decision or workflow it improves

Two things. **Distribution with acknowledgment** — the coordinator stops chasing and starts seeing who hasn't confirmed. And **same-evening variance** — the producer sees "we planned six scenes, we shot four, we're 1.5 days behind" on the night it happens, not in the weekly.

### 4. Why a generic tool fails here

There's nothing to generate. The failure is operational: no acknowledgment tracking, no structured return path, no binding of the day's plan to the day's actual. A chatbot that writes a nice call sheet solves the least difficult part. The product is the dispatch loop and the state it captures.

### 5. Domain data, rules, relationships and workflows to model

- **Shooting day** → scenes planned (referencing SceneSpine scene IDs where available), location, unit call, cast call times per actor, department calls, meal times, sunrise/sunset, weather note, hospital/emergency contacts, safety notes.
- **Recipient model**: person → role → department → contact channel → language preference → what they should and shouldn't see (cast contact numbers are not for general distribution).
- **Dispatch record**: sent, delivered, read/acknowledged, per recipient, per version.
- **Amendment rule**: a revised call sheet supersedes and must re-trigger acknowledgment; version number visible on the artefact.
- **DPR**: scenes completed with partials, setups, call/wrap, overtime by department, junior artist actual vs planned, catering counts, incidents/accidents, equipment issues.
- **Variance calculation**: planned vs actual scenes and pages, cumulative schedule position.
- **Safety and grievance contact block** as a mandatory, non-removable field on every call sheet.

### 6. Malayalam / regional specifics

- **WhatsApp is the distribution channel.** Not email. Any design that assumes email adoption fails immediately. Build to the WhatsApp Business API and treat email as fallback.
- **Bilingual output.** Call sheets should render key fields in Malayalam for crew who prefer it, with the same underlying record. Junior artist and support crew comprehension is a practical safety matter, not a nicety.
- **Travel time across Kerala districts is underestimated constantly.** Distances look short and take three hours. Call time calculation should surface travel assumptions explicitly.
- **Monsoon rain calls** are a routine event that needs a first-class amendment flow, not an exception path.
- **Post-Hema-Committee compliance context**: the Malayalam industry is under real and continuing scrutiny on workplace safety, working hours, and grievance mechanisms. A call sheet that carries a standing ICC/grievance contact block and a system that produces an auditable record of actual working hours is genuinely valuable to the company's compliance position — and is a strong argument for building this product first. Treat this as a feature, not a footnote, and have it reviewed by whoever handles the company's compliance obligations.

### 7. Technical shape

**Agent workflow + monitoring-alerting.** Template rendering, scheduled dispatch, acknowledgment webhook handling, structured form capture, variance computation, threshold alerts. Almost no LLM involvement — possibly translation assistance for the bilingual render, human-verified. That's fine. Not every product in an AI portfolio needs a model in it, and this one earns its place on adoption value.

### 8. Required data sources and integrations

WhatsApp Business API (dispatch + acknowledgment). Notification service (shared). SceneSpine for scene references, with manual entry fallback so it can ship independently. People registry (shared). Sunrise/sunset and weather API. PDF generation.

### 9. Solo-developer MVP scope

Create a shooting day from a manually-entered or SceneSpine-derived scene list → generate a call sheet PDF with the standard block layout → dispatch via WhatsApp to a role-filtered recipient list → track acknowledgment → mobile-friendly DPR form for the 2nd AD to fill at wrap → producer view showing planned vs actual by day and cumulative variance → amendment flow that re-dispatches and resets acknowledgment.

### 10. Explicit MVP boundary — do NOT build

No scheduling engine. No payroll, no timesheet-to-payment. No cast contact directory exposed to general crew. No in-app chat — you will not beat WhatsApp and you shouldn't try. No location maps beyond a link. No approval chains.

### 11. Success metrics

- Acknowledgment rate within 2 hours of dispatch: target > 80% by film three.
- Coordinator time spent on distribution and chasing: target 60% reduction, measured by self-report at baseline and week six.
- DPR submitted same night: target > 90% of shoot days.
- Days between a schedule slip occurring and the producer knowing: target from ~7 to same-day.

### 12. Adoption risks

Lowest of the eight, but not zero. The coordinator adopts happily — it removes their worst task. The risk is crew-side: another app to check. Mitigation is that crew don't get an app; they get a WhatsApp message exactly as today, with a tap to acknowledge. The other risk is that same-evening variance reporting makes the AD's slippage visible to the producer faster than the AD would like. Frame it as protecting the unit — early visibility means resources arrive in time to recover — and make sure the producer's first reaction to a variance alert isn't punitive, or the DPRs will start arriving optimistic.

### 13. Privacy, security, DPDP

This module handles more personal data than any other on the list: names, phone numbers, call times, location, overtime, and effectively daily attendance for every crew member and cast member.

Requirements: personal contact data minimised per recipient (a junior technician's call sheet does not carry the lead actor's mobile number); role-based field-level visibility; retention policy on DPRs and dispatch logs with a defined deletion schedule; encryption at rest; audit log on every access to contact data. Working-hours data is sensitive in the employment sense and should be access-restricted to production leadership and compliance, not the general producer pool.

Consent and notice for processing crew personal data under DPDP needs to be handled at crew onboarding, not retrofitted. Minors on set require separate handling and should never appear in a broadly-distributed document with personal details.

**Never leaves for a third-party provider:** all personal contact and attendance data. If translation uses a hosted model, send template strings only — never a populated call sheet.

### 14. Overlap with existing products

None with StarAnalytics or OrchaLLM. Consumes SceneSpine; feeds BurnWatch later. Ships standalone against manual entry, which is why it can go first.

### 15. Product form

**Module on Backlot.** Likely the first module users actually log into daily, which makes it the de facto front door — design the shell around it.

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 4 |
| Visible company impact | 5 |
| MVP feasibility | 4 |
| Data availability | 4 |
| Adoption ease | 5 |
| Strategic defensibility *(unweighted)* | 2 |
| **Weighted priority** | **4.40** |

---

# 3. LocationBank

**Institutional location memory**

### 1. Product name and primary users

**LocationBank.** Primary users: location manager, production designer. Secondary: director and DOP during prep, production manager for logistics, PermitTrack for authority linkage.

### 2. The bottleneck, in detail

Scouting produces two artefacts: several hundred phone photos, and knowledge held in one person's head — the owner's name and number, what he charged last time and whether he'll do it again, whether a unit truck can reach the gate, whether there's three-phase power or you're bringing a genset, where the sun sits at 4pm, whether the neighbours objected, whether the panchayat was cooperative, whether there's a toilet, whether mobile signal exists.

None of it is written down. When the location manager leaves, or is on another film, it's gone. The company re-scouts locations it has already shot in. Directors ask "what about that house we saw in Kottayam" and nobody can find it.

Owner: the location manager, informally and personally.

### 3. The decision or workflow it improves

Turns location selection from "who do we know" into a query. "Traditional tharavadu, Kottayam or Alappuzha district, courtyard, morning light, unit access for a truck, under ₹50k/day, available in January." And critically, it makes prior experience retrievable — including negative experience, which is the part institutional memory usually loses.

### 4. Why a generic tool fails here

A general image search knows nothing about your scouts. The entire value is that this is a proprietary corpus of places the company has actually been, with commercial and logistical attributes attached that exist nowhere on the internet. A chatbot can describe a Kerala tharavadu; it cannot tell you the owner in Changanassery wants ₹60k and won't allow night shoots.

### 5. Domain data, rules, relationships and workflows to model

- **Location**: name, district, panchayat/municipality, geo coordinates, type taxonomy (house/tharavadu/church/temple/mosque/school/hospital/beach/backwater/paddy/forest/urban street/office/shop/industrial), period suitability, photos (with capture time and compass direction where available).
- **Logistics attributes**: vehicle access class, unit parking, generator access, power availability, water, toilets, mobile signal, nearest hospital, distance to Kochi/Trivandrum, monsoon accessibility.
- **Commercial**: owner/contact (restricted field), last quoted rate, last paid rate, negotiation notes, restrictions (no night, no crowd, no cooking, no drone).
- **Permission linkage**: which authority governs it — Devaswom board, Forest Department, Railways, panchayat, private owner — resolving to PermitTrack.
- **Usage history**: which films shot here, which scenes, what went wrong, would-we-return flag.
- **Rule**: shot-here history is visible to all; owner contact and rate history are restricted. Location managers guard commercial relationships and will not contribute if their contacts are broadcast.

### 6. Malayalam / regional specifics

- **The taxonomy has to be Kerala's.** Tharavadu, nalukettu, kettuvallam, kayal/backwater, paddy field, rubber estate, tea estate (Munnar/Vagamon), church/temple/mosque with their distinct permission regimes, coastal fishing village, Fort Kochi colonial, Kochi high-rise/Infopark modern.
- **Authority mapping is location-intrinsic**: Travancore, Cochin, Malabar and Guruvayur Devaswom boards govern different temples; reserve forests fall under the Forest Department; anything near track falls to Southern Railway; KSEB governs power line proximity and any tapping.
- **Monsoon accessibility is a genuine attribute** — a location that's a two-hour drive in February is unreachable in July.
- **District travel realities**: Idukki and Wayanad locations carry ghat-road travel costs that dwarf the location fee. Model travel time, not distance.
- **Overtourism and local sentiment** at heavily-shot locations is real; the "would we return" flag should capture whether the neighbourhood has soured on film units.

### 7. Technical shape

**Search-retrieval, geo- and attribute-indexed, with visual embedding search as a second-phase layer.** Postgres + PostGIS for geo and attribute filtering does 80% of the work. Vector search over photo embeddings for "looks like this" queries is a strong addition once the corpus is a few hundred locations — not before, because it's useless on thin data.

### 8. Required data sources and integrations

Document/media store (shared) for photos. PostGIS. Mobile capture path — the location manager should be able to submit from a phone at the location, or they will never contribute. Map tiles. PermitTrack for authority linkage. SceneSpine for scene-to-location assignment.

### 9. Solo-developer MVP scope

Mobile-friendly capture form: photos + geo + type + logistics checklist + contact + rate + notes, submittable in under three minutes standing at the gate. Web search interface with district/type/attribute/rate filters and map view. Location detail page with photo gallery and usage history. Restricted-field RBAC for contact and rate. Bulk import path for existing photo archives, with a lightweight tagging queue.

### 10. Explicit MVP boundary — do NOT build

No visual similarity search until the corpus justifies it. No sun-position modelling (link to an existing app). No permission workflow — that's PermitTrack. No budgeting. No 360°/drone capture pipeline. No public or vendor-facing access.

### 11. Success metrics

- Locations captured in the first six months: target 150+.
- Percentage of a new film's locations sourced from the bank rather than fresh scouting: target 25% by film three.
- Scouting days per film: measure baseline, target 20% reduction by film three.
- Qualitative but decisive: does the director start asking to search it during prep?

### 12. Adoption risks

The real one: **the location manager's contact book is their professional leverage.** Asking them to upload it is asking them to make themselves replaceable. This must be addressed directly rather than engineered around. Options — restrict contact fields to the location team only, credit contributions visibly, and be honest with the location manager about why the company wants this and what it does and doesn't mean for their role. If they aren't persuaded, you'll get photos with no attributes, which is worthless.

Second risk: capture friction. If the form takes ten minutes it won't be filled. Three minutes or it fails.

### 13. Privacy, security, DPDP

Location owners are private individuals whose personal data (name, phone, address, negotiated rates) you are storing without them being your customer. This needs: a lawful basis under DPDP, a notice mechanism at the point of collection (a simple consent line the location manager reads or shows), restricted access, retention limits, and a deletion path on request.

Photographs may incidentally capture residents and bystanders. Avoid storing identifiable photos of people who are not part of the location record; the subject is the place.

**Never leaves for a third-party provider:** owner contact details, negotiated rates, and negotiation notes. If visual embedding is added later, generate embeddings with a self-hosted model rather than shipping photos of private homes to an external API.

### 14. Overlap with existing products

None. Feeds SceneSpine and PermitTrack. Independent of StarAnalytics, OrchaLLM, ScriptLens and the diagnostic tool — which makes it a clean parallel workstream.

### 15. Product form

**Module on Backlot**, but genuinely standalone in function. Of the eight, this is the one that would most plausibly become a product sold to other production houses in future — noted, not recommended yet.

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 4 |
| Visible company impact | 4 |
| MVP feasibility | 5 |
| Data availability | 3 |
| Adoption ease | 4 |
| Strategic defensibility *(unweighted)* | 5 |
| **Weighted priority** | **4.10** |

---

# 4. PermitTrack

**Permissions and clearance management**

### 1. Product name and primary users

**PermitTrack.** Primary users: production manager, unit production coordinator, location manager. Secondary: line producer for cost, 1st AD for schedule feasibility.

### 2. The bottleneck, in detail

Shooting in Kerala requires clearance from a patchwork of unrelated authorities, each with its own application route, document checklist, fee structure, lead time, validity period, and institutional temperament. Forest Department for reserve forest and wildlife areas. Southern Railway for anything near track or station. Police for public roads, crowd control and traffic. Panchayat or municipality for local body permission. Devaswom boards for temples, differing by board. KSEB for power line proximity and tapping. Port and harbour authorities for coastal and dock locations. Airport authorities for aerial work, plus separate drone clearance. And the state's single-window route, which helps for some categories and not others.

Today this lives in the production manager's memory and a WhatsApp thread. The failure mode is not gradual — you either have the permission on the day or you lose the day, with the full unit standing at the gate. Expiries are the second failure: a permit obtained for a schedule that then slipped.

### 3. The decision or workflow it improves

Two decisions. **Prep**: given this location list and this shoot window, what permissions are required, what's the latest safe date to apply for each, and what documents do we need to assemble? **In-flight**: what's pending, what's at risk, what expires before we get to it.

### 4. Why a generic tool fails here

An LLM asked "what permissions do I need to shoot at Athirappilly" will produce a confident, partly-invented answer. This information is not reliably in any model's training data, it changes, and being wrong costs a shoot day. The product is a **curated, maintained rules base** built from the company's own experience plus first-hand verification — with deadline monitoring on top. The value is the accuracy of the checklist, and accuracy comes from your data, not from generation.

### 5. Domain data, rules, relationships and workflows to model

- **Authority**: name, jurisdiction (geographic and categorical), application route, contact, typical lead time, typical fee basis, documents required, validity period, renewal rules, known quirks.
- **Permission requirement rule**: location attributes + activity attributes (drone, crowd size, fire/SFX, animals, night shoot, road closure, minors, weapons/props resembling weapons) → required permission set. This is a rules engine, deterministic and auditable.
- **Application**: status lifecycle (identified → documents assembling → submitted → follow-up → granted → active → expired), assignee, fee paid, document attachments, granted date, valid-from/valid-to.
- **Deadline computation**: shoot date minus lead time minus buffer = apply-by date, with alerting at intervals before it.
- **Schedule linkage**: if a shoot date moves past a permit's validity, raise a conflict.
- **Learning loop**: actual lead times recorded per authority per application, feeding back to improve the estimate. After three films, your lead-time data is better than anyone's published figure.

### 6. Malayalam / regional specifics

Essentially the entire product is regional. The authority set, the Devaswom board distinctions, the single-window route's actual coverage, the difference between a cooperative panchayat and an obstructive one, the monsoon effect on Forest Department access, drone rules layered on top of national regulations — none of this generalises outside Kerala, which is exactly why it's defensible and exactly why the data must be gathered first-hand.

**Important caveat:** the initial rules base must be built by interviewing the company's production managers and verifying against current authority requirements. Do not seed it from model output. A confidently wrong checklist is worse than no product, because people will trust it.

### 7. Technical shape

**Rules engine + monitoring-alerting + document management.** No LLM required in the core. Optional narrow use: extracting fields from a granted permit PDF into structured form, human-verified.

### 8. Required data sources and integrations

LocationBank for location attributes and authority linkage. SceneSpine for activity attributes (crowd, animals, stunts, minors, drone). Schedule dates. Notification service for deadline alerts. Document store for applications and granted permits. Calendar export.

### 9. Solo-developer MVP scope

Authority registry, hand-curated, covering the 8–12 authorities that account for most applications. Rules engine mapping location + activity attributes to required permissions. Per-film permission checklist generated from the location list. Application tracker with status, assignee, documents, and dates. Deadline alerting at T-minus intervals. Expiry-versus-shoot-date conflict detection. Document repository per application.

### 10. Explicit MVP boundary — do NOT build

No integration with any government portal — none of them offer usable APIs and attempting it will consume the project. No automated form filling. No fee estimation or payment. No legal advice generation. No coverage of authorities outside Kerala until Kerala is complete and correct.

### 11. Success metrics

- Permission-related lost shoot days: target zero, and this is measurable and attributable.
- Applications submitted after their computed apply-by date: track and drive down.
- Percentage of required permissions identified at prep rather than discovered late: target > 90% by film two.
- Accuracy of the lead-time model versus actuals, improving across films.

### 12. Adoption risks

Moderate. Production managers may see the checklist as an implicit audit of their work, and there's a real risk of "the system said we didn't need it" blame-shifting. Make provenance explicit — every rule shows who added it and when it was last verified — and keep the human accountable for the submission, not the system. Also expect resistance to logging fees paid, for reasons that may be uncomfortable; scope the MVP to exclude fee amounts if that's what gets it adopted, and revisit later.

### 13. Privacy, security, DPDP

Moderate. Contains authority contact persons (personal data, restricted), fee records (financially sensitive), and granted permits which may carry identifying details of company officers. Document store must be encrypted with access logging. Retention aligned to statutory record-keeping requirements — permits may need to be retained for a defined period after production, so a blanket deletion policy is wrong here; get the retention period from counsel.

**Never leaves for a third-party provider:** authority contact details, fee records, and any permit document. If PDF field extraction is used, self-hosted or zero-retention only.

### 14. Overlap with existing products

None. Tight coupling to LocationBank; useful without it but much better with it.

### 15. Product form

**Module on Backlot.**

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 4 |
| Visible company impact | 4 |
| MVP feasibility | 4 |
| Data availability | 3 |
| Adoption ease | 4 |
| Strategic defensibility *(unweighted)* | 4 |
| **Weighted priority** | **3.90** |

---

# 5. RightsLedger

**Rights, contracts and obligations**

### 1. Product name and primary users

**RightsLedger.** Primary users: producer, business affairs / legal. Secondary: finance for milestone tracking, distribution head for availability checks. Deliberately narrow user set.

### 2. The bottleneck, in detail

A film's revenue comes from a stack of separately negotiated rights: theatrical by territory, satellite, OTT (often split by window and language), music and publishing, dubbing rights by language, remake rights, overseas theatrical by region, in-flight, and increasingly AI/derivative-use clauses. Each is a separate agreement, executed as a PDF, stored in a Drive folder or a physical file.

The obligations inside those agreements — holdback windows before OTT, exclusivity periods, first-refusal clauses, delivery milestones tied to payment, reversion dates, audit rights, credit obligations — are tracked in the producer's and the lawyer's memory.

What breaks, and this is the serious part: selling a right that conflicts with one already sold; releasing on OTT inside a satellite holdback; missing a delivery milestone that voids a payment; letting a reversion window pass unnoticed; failing to honour a credit obligation. These are contract-breach events with real financial and reputational cost, and they are entirely preventable with a ledger.

### 3. The decision or workflow it improves

"Can we sell this?" answered in seconds against a conflict-checked model rather than in days by re-reading agreements. Plus continuous obligation monitoring — the calendar of what's due, what expires, what reverts.

### 4. Why a generic tool fails here

"Upload your contracts and ask questions" is precisely the wrong architecture for this problem. An LLM answering "do we have Tamil dubbing rights free for the Gulf" from retrieved contract text will sometimes be wrong, and a sometimes-wrong answer on a rights question is worse than no system, because it will be trusted. The correct design extracts clauses into a **structured rights model** that a human verifies once, then answers all future questions from **deterministic rules over verified structured data**. The model helps populate; it never answers.

### 5. Domain data, rights model, rules

The core model is a grant:

**`right_type × territory × language × window(start, end) × exclusivity × counterparty × consideration × conditions`**

- **Right types**: theatrical, satellite, OTT/digital, music (sync, publishing, master), dubbing, remake, in-flight/non-theatrical, AV/home video, merchandising, derivative/AI use.
- **Territory**: Kerala, Rest of India, GCC (per country), UK, US/Canada, Australia/NZ, Singapore/Malaysia, Rest of World — modelled as a hierarchy so "Rest of World" conflicts correctly with "Australia."
- **Conflict rule**: two grants conflict if right type, territory, language and window overlap and either is exclusive. This is the engine's whole job and it must be exhaustively tested.
- **Obligations**: delivery milestones, payment milestones, holdbacks, credit requirements, marketing commitments, audit windows, reversion triggers — each with a date and an owner.
- **Provenance rule**: every field carries a source (agreement, clause, page) and a verification status. Nothing is trusted until a human has confirmed it against the document.
- **Amendments and side letters** must attach to the parent grant and modify it, not exist as separate documents.

### 6. Malayalam / regional specifics

- **GCC is the dominant overseas market** for Malayalam cinema and is frequently sold as a bundle that then needs country-level resolution for censorship and release timing. The territory hierarchy has to handle Gulf-as-a-bundle cleanly.
- **Dubbing rights into Tamil, Telugu, Hindi and Kannada** are a routine and material revenue line, and are precisely where language-dimension conflicts arise.
- **Remake rights** are a live commercial category for Malayalam films to an unusual degree, with their own holdback structures.
- **Satellite versus OTT holdbacks** are the highest-frequency conflict risk in the current market.
- **Mid-scale budgets mean smaller legal teams** — often external counsel engaged per deal rather than in-house business affairs. That's the reason the institutional memory gap exists, and the reason this product matters more here than at a large studio.
- **Agreements are frequently in English but negotiated in Malayalam**, with terms agreed verbally ahead of documentation. Side letters and WhatsApp-confirmed variations are a real risk category. The product should have a place to record a variation even before it's papered — flagged as unpapered.

### 7. Technical shape

**Search-retrieval (for clause location) + rules engine (for conflict and obligation logic) + monitoring-alerting (for the obligation calendar).** LLM used only for assisted extraction into the structured model, always into a human verification queue, never as an answer layer.

### 8. Required data sources and integrations

Encrypted document store. Extraction via OrchaLLM with strict provider constraints. Calendar and notification for obligations. Optional later: finance system for payment milestone reconciliation.

### 9. Solo-developer MVP scope

Deliberately narrow. Manual structured entry of rights grants for the last three to five films — done sitting with business affairs, which is also the requirements-gathering exercise. Conflict detection engine with a hard test suite. Obligation calendar with alerting. Document store linking each grant to its source agreement with clause references. Assisted extraction as a **phase two** convenience, only after the manual model has proven correct.

Starting manual is the right call here even though it feels unambitious. It gets the model right, builds trust with the one user group that must trust it, and avoids the failure mode where an extraction error becomes a ledger error.

### 10. Explicit MVP boundary — do NOT build

No contract drafting or generation. No legal advice. No natural-language Q&A over contracts — this is the single most important boundary in the document, and it will be requested. No automated extraction as the primary path in v1. No e-signature. No royalty calculation. No integration with accounting until the rights model is stable.

### 11. Success metrics

- Time to answer "is this right available": target from days to under a minute.
- Conflicts detected before execution: any single catch pays for the product.
- Obligation deadlines missed: target zero.
- Coverage: percentage of active rights modelled — target 100% for the last three films within the first quarter.
- Extraction verification rate once phase two ships (fields corrected per contract, declining).

### 12. Adoption risks

The highest-trust, lowest-tolerance user group in the company. Business affairs and external counsel will not use a system they consider unreliable, and they are correct to hold that standard. Two mitigations: build it manual-first so the data is theirs and verified, and make every answer show its source clause. If the first conflict check produces a false result, adoption ends there.

Second risk: the producer may not want rights positions visible even internally. Accept a very narrow user list; this product does not need scale.

### 13. Privacy, security, DPDP

**Highest sensitivity of the eight.** Contains deal terms, consideration amounts, counterparty relationships, and executed agreements. A leak is a commercial catastrophe and potentially a breach of confidentiality obligations inside those very agreements.

Requirements: separate schema at minimum; its own permission tier not inheritable from any production role; its own audit stream with alerting on unusual access; encryption at rest and in transit; no contract text in any shared log, cache, or analytics path; MFA required for access. A separate deployment is defensible and I'd argue for it.

Counterparty signatories are identified individuals — personal data. Retention must align with statutory and contractual record-keeping obligations, not a default policy.

**Never leaves for a third-party provider:** everything. If assisted extraction is built in phase two, it must run on a self-hosted model. Confidentiality clauses in the underlying agreements may make sending contract text to a third-party API a breach regardless of that provider's retention policy — this is a question for counsel before any hosted call is made, and my recommendation is simply not to.

### 14. Overlap with existing products

None. Deliberately isolated from everything else.

### 15. Product form

**Separate deployment**, or at minimum a hard-isolated module with its own schema, permission tier, audit stream and access controls. The one exception to the single-platform pattern.

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 5 |
| Visible company impact | 5 |
| MVP feasibility | 3 |
| Data availability | 4 |
| Adoption ease | 3 |
| Strategic defensibility *(unweighted)* | 4 |
| **Weighted priority** | **4.30** |

---

# 6. SubQC

**Subtitle and localisation quality control**

### 1. Product name and primary users

**SubQC.** Primary users: post supervisor, localisation lead. Secondary: subtitling vendors as submitters, producer for delivery confidence.

### 2. The bottleneck, in detail

Malayalam-to-English subtitling is outsourced, delivered as an SRT, and reviewed by whoever on the post team has hours to spare — often nobody, thoroughly. Problems surface at OTT platform QC, where a rejection costs days against a locked delivery date, or worse, at release, where a bad subtitle becomes a social media story about the film.

The failure modes are specific and repetitive: reading speed above platform limits; line breaks that split a grammatical unit; subtitles crossing shot changes; dialect idiom flattened into nothing or translated literally into nonsense; honorifics and kinship terms (chettan, chechi, achacha, ammaayi) rendered wrongly or dropped, losing the relationship information the line carries; proper nouns romanised three different ways across a 150-minute film; code-switched English dialogue re-translated into different English; songs subtitled inconsistently or not at all; forced narratives missing; character limits and platform spec violations.

Owner: nominally the post supervisor, practically nobody.

### 3. The decision or workflow it improves

Turns "someone should check this" into a prioritised, evidence-backed defect list — deterministic violations flagged with certainty, semantic concerns flagged for human judgement, everything routed into a review queue with the video timecode attached.

### 4. Why a generic tool fails here

Most of the actual defects are **deterministic** — reading speed, line length, duration, gap, shot-change collision, proper-noun consistency — and a chatbot is the wrong instrument for arithmetic. The parts that do need language judgement need Malayalam-specific judgement: kinship terms, dialect idiom, honorific register, Manglish code-switching. A general translation-quality tool has no model of Malayalam kinship terminology and will not notice that "chettan" was rendered as "brother" when the speaker's brother is a different character in the scene.

### 5. Domain data, rules, relationships and workflows to model

- **Subtitle event**: index, in/out timecode, duration, text lines, character counts, computed reading speed, gap to next.
- **Deterministic rule set**, parameterised per delivery target: max chars per line, max lines, min/max duration, min gap, max reading speed (chars or words per second), shot-change proximity.
- **Shot change list** from the edit, or detected from the video.
- **Proper noun registry** per film: character names, place names, and their approved romanisation — with consistency checking across the whole file.
- **Kinship and honorific lexicon**: Malayalam terms mapped to relationship semantics, flagged when the English rendering loses or contradicts the relationship.
- **Code-switch detection**: source lines already in English, flagged when the subtitle diverges from the spoken words.
- **Dialect markers**: regional lexical items flagged for review when rendered generically.
- **Song handling policy**: subtitled or not, italicised, per platform.
- **Defect object**: type, severity, timecode, source line, subtitle line, suggested fix, review status, resolution.

### 6. Malayalam / regional specifics

This is the most language-specific product in the portfolio, and the specifics *are* the product:

- **Kinship terms carry plot information.** Chettan/chechi denote both relation and respect, and are used for non-relatives. A flattening translation loses information the scene depends on.
- **Dialect variation is wide** — Thrissur, Central Travancore, Malabar, Thiruvananthapuram, Kasaragod — and a lot of Malayalam cinema's humour and characterisation is dialect-carried. A subtitle that erases dialect erases character.
- **Code-switching is constant.** Educated urban characters speak Malayalam-English hybrid naturally. Subtitles that re-render already-English dialogue into different English are a common, jarring defect.
- **Romanisation of Malayalam names is unstandardised.** The same character's name can appear three ways in one file. Deterministic consistency checking catches this completely and cheaply — probably the highest value-per-line-of-code feature in the whole document.
- **Religious and caste-inflected registers** in address forms need careful handling and human review, not automated rewriting.
- **Multiple delivery targets**: Kerala theatrical, GCC theatrical (with its own censorship-driven edits), and OTT platforms each with different specs. One source, several conformed outputs.

### 7. Technical shape

**Scoring-ranking engine + human-in-the-loop review, with a deterministic core and a narrow LLM layer.** Pipeline: parse SRT/TTML → compute all deterministic metrics → run rule set for the target spec → consistency analysis across the file → LLM pass only on flagged semantic categories (kinship, dialect, code-switch divergence), constrained and with the source line attached → merge into a severity-ranked defect queue → review UI with video sync.

### 8. Required data sources and integrations

Subtitle files (SRT, TTML/IMSC). Reference video with timecode. Shot change list (from edit EDL, or detected). Platform spec profiles, maintained by hand. Character/proper-noun registry, seeded from the script via the shared script ingestion service — a nice reuse of SceneSpine's parser output. OrchaLLM for the semantic pass.

### 9. Solo-developer MVP scope

SRT ingest → full deterministic rule check against two configurable spec profiles → proper-noun consistency detection with clustering of variant spellings → kinship/honorific flagging using a hand-built lexicon → code-switch divergence flagging → severity-ranked defect list with timecode → review UI with video playback synced to the defect → export corrected SRT and a QC report for the vendor.

### 10. Explicit MVP boundary — do NOT build

No machine translation. No automatic correction — flag and suggest, never rewrite. This product's credibility depends on it never silently changing a creative choice. No audio/ASR alignment. No burn-in or encoding. No dubbing script generation. No languages beyond Malayalam→English in v1.

### 11. Success metrics

- Platform QC rejections: target zero after adoption, measured against baseline.
- Defects caught pre-delivery versus post-delivery.
- Review time per film: target under 4 hours for a feature versus a full manual pass.
- False positive rate on semantic flags: must stay low or reviewers will start dismissing everything — track it explicitly and tune.
- Proper-noun inconsistencies reaching delivery: target zero (this one should be absolute).

### 12. Adoption risks

Low internally, moderate with vendors. The post supervisor gains time and risk reduction. Subtitling vendors may resist a system that itemises their defects — though the better ones will prefer a clear spec to vague rejection. Frame the QC report as a shared standard rather than a scorecard, and give vendors the rule set upfront so they can self-check before delivering.

Timing risk is the real constraint: this product is only exercised when a film is in post. Build it against a completed film's subtitle files rather than waiting.

### 13. Privacy, security, DPDP

Moderate-high on confidentiality, low on personal data. Subtitle files of an unreleased film are a complete dialogue transcript — a leak is a plot leak. Reference video is the highest-value leak target the company has.

Requirements: video never leaves the platform; short-lived signed URLs; no video to any external service; subtitle text through zero-retention providers only, or self-hosted; vendor access scoped to their own submissions with watermarked or restricted playback; audit logging on video access.

**Never leaves for a third-party provider:** video, ever. Subtitle text only under zero-retention terms, and a self-hosted model is preferable given the semantic pass is a narrow task.

### 14. Overlap with existing products

Reuses the script ingestion service for the character/proper-noun registry. Otherwise independent. No overlap with StarAnalytics, ScriptLens, or the diagnostic tool.

### 15. Product form

**Module on Backlot.** Of the eight, the most plausible eventual external product alongside LocationBank — a Malayalam subtitle QC tool has an obvious market among other Kerala production houses and OTT localisation vendors. Noted for later, not now.

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 4 |
| Visible company impact | 3 |
| MVP feasibility | 4 |
| Data availability | 4 |
| Adoption ease | 4 |
| Strategic defensibility *(unweighted)* | 5 |
| **Weighted priority** | **3.70** |

---

# 7. BoxTrack

**Theatrical performance tracking**

### 1. Product name and primary users

**BoxTrack.** Primary users: producer, distribution head. Secondary: marketing head for spend reallocation, actor's team for release-week visibility.

### 2. The bottleneck, in detail

During release week, the most important numbers in the company arrive as WhatsApp messages and photographs of printed statements from distributors and exhibitors, in inconsistent formats, at inconsistent times, with inconsistent completeness. Someone — usually the producer or an assistant — retypes some of it into a spreadsheet. Overseas numbers arrive separately and later, in different currencies.

Decisions that depend on these numbers are made in hours: whether to add or cut shows, where to push spend, whether the second-weekend hold justifies extending screens. They are currently made on impression and partial data.

What breaks: show-count drops in a specific area go unnoticed for two days; occupancy collapse in one territory is masked by strength in another; the marketing team keeps spending against a region that has already gone quiet; and post-release, nobody has a clean dataset to learn from, so the next film's projections are guesswork again.

### 3. The decision or workflow it improves

Same-day visibility on shows, occupancy and gross by theatre and territory, with alerting on show-count drops and occupancy collapse. And a permanent structured record that makes the next release's planning quantitative.

### 4. Why a generic tool fails here

There is no API. There is no reliable public Kerala box office data source. The product is a **capture discipline** — a structured intake path that fits how distributors actually report — plus rollup and alerting. An LLM adds value in exactly one narrow place: normalising the messy inbound formats (a photographed statement, a pasted WhatsApp text block) into structured rows, human-confirmed. That's a real use, but it's a component, not the product.

### 5. Domain data, rules, relationships and workflows to model

- **Theatre**: name, chain/independent, district, screens, seat capacity per screen, class (single screen / multiplex), territory.
- **Territory model**: Kerala sub-territories as the distribution trade actually divides them, plus Rest of India and overseas by country.
- **Show record**: date, theatre, screen, showtime, seats sold, capacity, gross, currency.
- **Daily rollup**: shows, admissions, occupancy percentage, gross, by theatre / district / territory / total, with cumulative.
- **Alert rules**: show count down more than X% day-on-day; occupancy below threshold for two consecutive days; a theatre dropping the film entirely; weekend-to-weekday drop outside expected range.
- **Comparison set**: prior company releases at the same day-of-run, normalised by screen count — this is what makes day 3 interpretable.
- **Currency and FX** for overseas, with the rate recorded at the time.

### 6. Malayalam / regional specifics

- **Kerala's exhibition mix is distinctive** — a large single-screen base alongside multiplexes, with different reporting behaviour from each. Single screens report less consistently and later.
- **Territory division follows trade convention**, not administrative districts. Model what distributors actually use.
- **GCC is the critical overseas market** and reports on its own rhythm; UK, US, Australia and Singapore/Malaysia follow. Release timing overseas is often not the same day as Kerala, so day-of-run must be tracked per territory, not globally.
- **Festival releases behave completely differently.** An Onam release's day-3 number means something entirely different from a non-festival release's day 3. The comparison set must be festival-aware or it will mislead.
- **Word of mouth moves faster and matters more in Kerala** than in most markets — the first-Monday number is unusually predictive, which makes fast capture disproportionately valuable.

### 7. Technical shape

**Data pipeline + monitoring-alerting**, with LLM-assisted intake normalisation as a narrow, human-confirmed component.

### 8. Required data sources and integrations

Distributor and exhibitor reports — WhatsApp intake as the primary path, because that's reality. Manual entry UI as the reliable fallback. Online ticketing platform data where accessible, subject to terms. FX rates. Notification service for alerts.

### 9. Solo-developer MVP scope

Theatre and territory registry, hand-built for the release's actual theatre list. Fast manual entry UI optimised for someone typing from a WhatsApp message at 11pm — this UI is the product's success or failure. WhatsApp intake with LLM-assisted parsing into a confirmation screen. Daily rollup dashboard by territory and theatre. Alert rules on show drop and occupancy. Comparison against prior releases at the same day-of-run. Export.

### 10. Explicit MVP boundary — do NOT build

No box office prediction or forecasting — this is the same discipline boundary you drew for ScriptLens, and for the same reason. No scraping of ticketing platforms in violation of terms. No public-facing numbers. No revenue-share or settlement calculation. No integration with StarAnalytics in v1 beyond a shared date axis.

### 11. Success metrics

- Percentage of the theatre list reporting by 11pm daily: target > 70% by day 3 of a release.
- Time from a show-count drop to someone acting on it: target from days to hours.
- Producer self-report on decision confidence during release week.
- A complete structured dataset for at least one full release — which is itself the deliverable that makes the next film's planning better.

### 12. Adoption risks

Low internally — the producer wants these numbers more than anything else on this list. The risk is on the supply side: distributors and exhibitors have no obligation to report in your format and some prefer opacity. Do not attempt to change their behaviour. Accept whatever they send in whatever form and do the normalisation on your side. That principle is the difference between this working and not.

Second risk: incomplete data presented as complete. Always show coverage — "42 of 61 theatres reporting" — on every view.

### 13. Privacy, security, DPDP

Low personal data, high commercial sensitivity. Box office figures are market-moving information within the trade, and distributor-supplied data may carry confidentiality expectations. Restrict access tightly; watermark exports; never expose externally.

**Never leaves for a third-party provider:** theatre-level and territory-level revenue figures. If LLM intake parsing is used, it must be zero-retention, and consider self-hosted — the parsing task is simple enough for a small local model.

### 14. Overlap with existing products

The quantitative counterpart to StarAnalytics. Keep them separate products with a shared time axis so a sentiment spike and an occupancy move can be looked at together — but do not merge them. Different users, different cadence, different data domain.

### 15. Product form

**Module on Backlot**, with a comparison view that can sit alongside StarAnalytics later.

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 4 |
| Visible company impact | 5 |
| MVP feasibility | 4 |
| Data availability | 3 |
| Adoption ease | 4 |
| Strategic defensibility *(unweighted)* | 2 |
| **Weighted priority** | **4.20** |

---

# 8. CastGraph

**Talent and casting knowledge graph**

### 1. Product name and primary users

**CastGraph.** Primary users: casting director, line producer. Secondary: director during prep, producer for cost modelling.

### 2. The bottleneck, in detail

Casting a Malayalam film runs almost entirely on the personal knowledge of one or two people: who is available in a given window, who is in what fee band right now, who can carry Malabar dialect convincingly versus Central Travancore, who has already played this exact register twice this year, who works well with this director, which pairings the audience has seen too recently, and the relationships and frictions that determine who will actually say yes.

When that person is on another film, casting stalls. When they leave, the knowledge leaves. For supporting and character roles — where a mid-scale Malayalam film has thirty to sixty speaking parts — the process is slow and repetitive, and options outside the usual circle rarely get considered.

### 3. The decision or workflow it improves

Shortlist generation for supporting and character roles, filtered on availability, fee band, dialect capability, physical description, and recent-role saturation. Not lead casting — that's a relationship and creative decision and always will be.

### 4. Why a generic tool fails here

An LLM asked about Malayalam supporting actors will produce a mixture of real credits, misattributed credits, and inventions, with no information about availability, current fee expectations, or who is willing to work with whom. The value is a maintained proprietary graph, and the graph does not exist yet — which is the core problem with this product, not an implementation detail.

### 5. Domain data, relationships and rules

- **Person**: name, contact, agent/manager, age range playable, physical attributes, languages, dialect capabilities, union/association status.
- **Credit**: person → film → role type → director → year, with role register tagged.
- **Availability window**: current and committed engagements, with confidence level — this is the hardest data to keep fresh and the most valuable.
- **Fee band**: ranged, not exact, with recency and restricted visibility.
- **Working relationships**: prior collaborations, director preferences, known conflicts — extremely sensitive, and arguably shouldn't be in a database at all in written form.
- **Saturation rule**: flag actors who have appeared in a similar register or a similar pairing within a recent window.
- **Role requirement**: from SceneSpine's character extraction — scene count, dialogue volume, dialect, age, physical requirements.

### 6. Malayalam / regional specifics

- **Dialect capability is a genuine casting criterion**, not a nice-to-have, and it's not captured in any existing database.
- **The talent pool is small and highly interconnected**; the same character actors work across most productions, and recency saturation is a real audience-perception issue.
- **Association and union relationships** (AMMA, FEFKA and related bodies) affect availability and engagement in ways that must be modelled carefully and neutrally.
- **Theatre and television crossover** is a major source of supporting talent that no film database covers.
- **The industry is in a period of scrutiny** following the Hema Committee report, and any system recording judgements about individuals in this industry must be designed with that context in front of mind, not as an afterthought.

### 7. Technical shape

**Graph store + scoring-ranking engine + human-in-the-loop.** Human decision mandatory and structurally enforced — the system produces candidate lists, never recommendations with a score presented as a verdict.

### 8. Required data sources and integrations

Company's own casting history — the only trustworthy seed. Public filmography sources, subject to terms and heavy verification. Manual entry by the casting team, which is the real data source and the real problem. TapeTriage later, if built.

### 9. Solo-developer MVP scope — *see caveat below*

Person registry seeded from the company's last five films' cast lists. Credit graph. Availability tracking with manual update. Attribute-based search and filtering. Role requirement import from SceneSpine. Shortlist builder with export. **No scoring in v1** — search and filter only.

### 10. Explicit MVP boundary — do NOT build

No performance evaluation or rating of individuals. No "suitability score." No face or voice analysis of any kind. No scraped personal data. No inference about personal characteristics. No conflict/friction field in v1 — the risk of a written record of interpersonal judgements about named individuals outweighs the convenience, particularly in this industry at this moment. No lead casting support.

### 11. Success metrics

- Time to produce a supporting-role shortlist.
- Percentage of roles cast from outside the habitual circle — the real strategic goal.
- Data freshness: percentage of availability records updated in the last 30 days. If this falls below about 50%, the product is dead and should be retired honestly rather than maintained as a stale directory.

### 12. Adoption risks — the highest in this document

The casting director's value to the company *is* this knowledge. A system that externalises it is, from their perspective, a system that reduces their leverage. Unlike the LocationBank version of this problem, there's no clean mitigation, because in casting the relationships are the job rather than an adjunct to it.

Compounding this: the data has to be entered and maintained by exactly the person with the least incentive to do it, and availability data decays in weeks. A stale CastGraph is worse than none, because someone will call an actor who's been on another shoot for a month.

### 13. Privacy, security, DPDP — the highest-risk profile here

This is a database of personal data about identified individuals, including physical attributes, professional evaluations, fee information and availability, held without those individuals being customers or employees of the company.

Under DPDP this needs a clear lawful basis, notice to data principals, purpose limitation, and a rights mechanism for access, correction and erasure. Fee information is commercially sensitive to the individual. Any evaluative content is a serious exposure. Minors in the registry require verifiable parental consent and should probably be excluded from the MVP entirely.

The correct posture: collect only what is necessary, record only factual and professional attributes, exclude subjective judgements, restrict access to a very small group, log every access, and get counsel involved **before** building rather than before launching.

**Never leaves for a third-party provider:** all of it. No personal data of talent should reach any external model under any circumstance.

### 14. Overlap with existing products

Consumes SceneSpine character data. No overlap with StarAnalytics, ScriptLens, or the diagnostic tool. Would feed TapeTriage if that's built later.

### 15. Product form

**Module on Backlot**, with restricted access — *if built at all in this form.*

### Scores

| Criterion | Score |
|---|---|
| Pain severity | 4 |
| Visible company impact | 4 |
| MVP feasibility | 3 |
| Data availability | 2 |
| Adoption ease | 2 |
| Strategic defensibility *(unweighted)* | 5 |
| **Weighted priority** | **3.40** |

### A revision to my Pass 1 recommendation

I put CastGraph forward as the deliberate strategic bet, on the reasoning that Pass 2 would properly interrogate its adoption and privacy risk. Having done that, my honest conclusion is that it should not be built now, and I'd rather say so than defend the earlier pick.

The reasons compound rather than sitting independently: the data doesn't exist, the only person who can create it has a structural disincentive to do so, the data decays faster than a reluctant contributor will refresh it, and the privacy profile is the heaviest of the eight in an industry currently under significant and warranted scrutiny on exactly the subject of how it treats the people in it.

There's a narrower version worth keeping alive: **a factual credit-and-availability registry**, seeded from the company's own production records, with no evaluative content and no scoring. That has real value, costs little, and avoids nearly all of the risk. It's a byproduct of CallSheet Ops and SceneSpine rather than a product — every film you run through those two modules produces a verified cast record for free. Let it accumulate for a year, then reconsider whether the graph is worth building on top of data you already have.

I've placed CastGraph in bucket C accordingly.

---

# Scoring summary

Weights as specified: Pain severity 30%, Visible company impact 30%, MVP feasibility 20%, Data availability 10%, Adoption ease 10%. Strategic defensibility scored but excluded from the weighted total.

| Product | Pain (30%) | Impact (30%) | Feasibility (20%) | Data (10%) | Adoption (10%) | **Weighted** | Defensibility *(unweighted)* |
|---|---|---|---|---|---|---|---|
| CallSheet Ops | 4 | 5 | 4 | 4 | 5 | **4.40** | 2 |
| SceneSpine | 5 | 4 | 4 | 5 | 4 | **4.40** | 3 |
| RightsLedger | 5 | 5 | 3 | 4 | 3 | **4.30** | 4 |
| BoxTrack | 4 | 5 | 4 | 3 | 4 | **4.20** | 2 |
| LocationBank | 4 | 4 | 5 | 3 | 4 | **4.10** | 5 |
| PermitTrack | 4 | 4 | 4 | 3 | 4 | **3.90** | 4 |
| SubQC | 4 | 3 | 4 | 4 | 4 | **3.70** | 5 |
| CastGraph | 4 | 4 | 3 | 2 | 2 | **3.40** | 5 |

CallSheet Ops and SceneSpine tie at 4.40. I've broken the tie in favour of CallSheet Ops for build order, on two grounds: it has no upstream dependency and can ship against manual entry, and its adoption ease is the highest in the set, which matters disproportionately for the first module the company ever logs into. SceneSpine is the more structurally important product; CallSheet Ops is the better first one.

---

# Master ranked table

| # | Product | Function | Primary user | Core bottleneck | Product type | MVP feas. | Expected impact | Privacy risk | Overlap | Defensibility | **Score** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CallSheet Ops | Production coordination | Production coordinator / 2nd AD | Manual nightly distribution, no acknowledgment, DPRs lost | Agent workflow + monitoring | 4 | Daily, visible, company-wide | **High** (crew personal + attendance data) | Consumes SceneSpine | 2 | **4.40** |
| 2 | SceneSpine | Production planning | Line producer / 1st AD | Manual breakdown, redone per draft, never reconciled | Pipeline + rules engine | 4 | Days saved per film; foundation layer | **High** (unreleased script) | Shares parser with diagnostic tool, ScriptLens | 3 | **4.40** |
| 3 | RightsLedger | Finance / legal | Producer / business affairs | Rights + obligations tracked in memory | Retrieval + rules + alerting | 3 | Prevents breach-level errors | **Critical** (contracts, deal terms) | None — isolated | 4 | **4.30** |
| 4 | BoxTrack | Distribution | Producer / distribution head | Release data arrives as WhatsApp screenshots | Pipeline + monitoring | 4 | Highest release-week visibility | Medium (commercial) | StarAnalytics counterpart | 2 | **4.20** |
| 5 | LocationBank | Locations | Location manager / designer | Scouting knowledge lives in one head | Search-retrieval (geo/visual) | 5 | Compounds every film | Medium (owner personal data) | Feeds SceneSpine, PermitTrack | 5 | **4.10** |
| 6 | PermitTrack | Locations / logistics | Production manager | Fragmented authorities, no deadline tracking | Rules engine + alerting | 4 | Prevents lost shoot days | Medium | Couples to LocationBank | 4 | **3.90** |
| 7 | SubQC | Post-production | Post supervisor / localisation | Subtitle QC unowned until platform rejection | Scoring + human-in-loop | 4 | Delivery risk + reputation | **High** (video, unreleased dialogue) | Reuses script parser | 5 | **3.70** |
| 8 | CastGraph | Casting | Casting director | Casting knowledge personal and volatile | Graph + ranking + human-in-loop | 3 | High if data existed | **Critical** (talent personal data) | Consumes SceneSpine | 5 | **3.40** |

---

# Buckets

### A. Build first — high pain, high impact, feasible for one developer

**CallSheet Ops · SceneSpine · LocationBank · BoxTrack**

These four share a profile: the data either already exists or is generated as a byproduct of work people already do, adoption resistance is low to moderate, and each delivers something visible within weeks rather than quarters. CallSheet Ops and SceneSpine chain together and should be built in that order. LocationBank is fully independent and can run in parallel. BoxTrack is the odd one — it ranks fourth but its usefulness is gated on a release date rather than on your priorities, which I address below.

### B. Strategic bets — high impact, but need more data, integration, or organisational change

**RightsLedger · PermitTrack · SubQC**

RightsLedger scores third overall and is arguably the highest-stakes product in the document, but it needs sustained access to business affairs, an isolated deployment, counsel involvement, and a manual-first data build that is slow by design. That's an organisational commitment, not a sprint. PermitTrack needs a hand-curated authority rules base gathered by interview before a line of product code matters. SubQC is technically ready to build tomorrow but only exercises when a film is in post, so its pilot is calendar-gated.

None of these are lower value than bucket A. They're on a different clock.

### C. Avoid for now — weak data, high privacy risk, or adoption resistance

**CastGraph**

Reasoning in full above. The narrow factual credit-and-availability registry survives as a byproduct of bucket A rather than a product. Revisit in a year with a year of real data in hand.

---

# The three to prototype in the next 90 days

**CallSheet Ops, LocationBank, SceneSpine.**

BoxTrack ranks above LocationBank and is nearly as easy to build, but its pilot depends on a film releasing inside the window. If one is releasing, build it — it's roughly a two-to-three week build and I'd slot it ahead of SceneSpine on opportunity grounds. If not, it waits, because a box office tracker with no box office is untestable. Treat it as schedule-driven rather than priority-driven, and check the release calendar before you commit the quarter.

## Sequencing reality

Three six-week MVPs is eighteen weeks, and you have thirteen. They have to overlap, and the shared spine has to come first.

| Weeks | Work |
|---|---|
| 1–2 | Platform spine: auth/RBAC, film registry, people registry, document store, notification service, OrchaLLM gateway wiring, audit log |
| 3–8 | **CallSheet Ops** MVP → pilot on a live shoot |
| 6–10 | **LocationBank** MVP, overlapping (low complexity, different subsystems, minimal context-switching cost) |
| 8–13 | **SceneSpine** MVP → validated against a completed film, then a live one |

CallSheet Ops goes first because it needs a live production to pilot against, and production schedules won't wait for you. LocationBank overlaps cleanly because it touches almost nothing CallSheet Ops touches. SceneSpine is last because it's the most technically demanding and benefits from the spine being settled.

---

## 1. CallSheet Ops — six-week MVP

**Weeks 1–2 — dispatch spine.** WhatsApp Business API integration, template registration and approval (start this on day one; approval takes time and will block you), recipient model with role-based field visibility, acknowledgment webhook. Prove end-to-end delivery and acknowledgment before building any UI.

**Weeks 3–4 — the call sheet.** Shooting-day entry, PDF rendering matching the company's existing layout closely enough that it looks familiar, bilingual field rendering, amendment flow with version numbering and acknowledgment reset, standing safety/grievance contact block.

**Week 5 — the return path.** Mobile DPR form, structured capture, planned-vs-actual variance computation, producer view with cumulative schedule position.

**Week 6 — pilot and harden.** Run on a live shoot, sit with the coordinator, fix what breaks.

**First data model:** `film`, `shooting_day`, `day_scene` (scene ref, planned order), `person`, `film_role` (person + department + role + contact + language pref), `call_sheet` (day, version, published_at), `call_sheet_recipient` (person, sent_at, delivered_at, acknowledged_at), `dpr` (day, scenes completed, setups, call/wrap, overtime by dept, JA actual, incidents), `variance` (derived).

**Interfaces:** coordinator web UI for day construction and dispatch; WhatsApp message + PDF for recipients with a single acknowledgment tap; mobile web DPR form for the 2nd AD; producer variance dashboard.

**Integrations:** WhatsApp Business API, PDF generation, sunrise/sunset + weather API, notification service.

**Evaluation:** measure baseline first — time the coordinator currently spends on distribution and chasing, and days between a slip and the producer learning of it. Compare at week six. Track acknowledgment rate and same-night DPR submission rate as leading indicators.

**Pilot users:** one production coordinator, one 2nd AD, one 1st AD, one producer — on a single live production. Do not roll out to a second unit until the first is stable.

**Go/no-go at week 6:** the coordinator chooses to use it for a second week without being asked, acknowledgment rate exceeds 60%, and DPRs are submitted same-night on more than half of shoot days. If the coordinator reverts to Word, stop and find out why before building anything else — that answer is worth more than the product.

---

## 2. LocationBank — six-week MVP

**Weeks 1–2 — capture.** Mobile-first submission form: photos, auto-geo, type taxonomy, logistics checklist, contact and rate under restricted fields, notes. Optimise ruthlessly for the three-minute standing-at-the-gate case. Test it by actually going somewhere and filling it in on a phone.

**Weeks 3–4 — retrieval.** PostGIS-backed search with district, type, attribute and rate filters; map view; location detail page with gallery, logistics, usage history, and would-we-return flag.

**Week 5 — backfill.** Bulk import for existing photo archives with a fast tagging queue. This is what gets the corpus past the threshold where the product is useful at all.

**Week 6 — pilot.** Location manager uses it on a live scout. Fix the capture form based on what they actually do.

**First data model:** `location` (name, district, LBU, geo point, type, period suitability), `location_photo` (file ref, captured_at, bearing), `location_attribute` (logistics checklist as typed key-values), `location_contact` (restricted), `location_rate` (quoted, paid, date, restricted), `location_authority` (authority type, ref for PermitTrack), `location_usage` (film, scenes, notes, would_return).

**Interfaces:** mobile capture form; web search with map and grid views; detail page; restricted-field admin.

**Integrations:** media store, PostGIS, map tiles. Nothing external. This is the lowest-integration product of the three, which is part of why it fits the overlap slot.

**Evaluation:** count of locations captured; time-to-capture per location measured directly; whether a search returns a usable result for a real prep query. The honest test at week six is a live one — ask the director or designer to find something during prep and watch what happens.

**Pilot users:** one location manager, one production designer, one director during a prep phase.

**Go/no-go at week 6:** 50+ locations captured, median capture time under four minutes, and at least one instance of a location being selected from the bank rather than scouted fresh. If capture time exceeds six minutes, the form is wrong and no amount of search quality will save it.

---

## 3. SceneSpine — six-week MVP

**Weeks 1–2 — the parser.** Shared script ingestion service: PDF, DOCX, FDX, Fountain in; scene-segmented output with stable UUIDs, slugline parsing, character cue detection, Malayalam Unicode and Manglish handling. Test against at least five real scripts from the company's archive spanning different formats and eras. This layer serves three other products, so build it as a service with its own tests, not as part of SceneSpine.

**Weeks 3–4 — extraction.** Schema-constrained element extraction via OrchaLLM (cast, INT/EXT, D/N, location, props, vehicles, wardrobe, junior artists), normalisation against a per-film element registry, confidence surfacing.

**Week 5 — review and override.** Scene-by-scene review UI, correction capture, registry learning from corrections, override persistence rules. Then XLSX export, because that's what people will actually use in week one.

**Week 6 — diffing.** Re-ingest a revised draft, produce a scene-level diff with stable identity across renumbering, preserve human overrides through re-parse. Validate on a real revision.

**First data model:** `script_version` (film, draft label, source file, parsed_at), `scene` (stable UUID, version, number, slugline, int_ext, day_night, location_text, location_ref, page_eighths, synopsis), `element` (film-scoped registry: type, canonical name, aliases), `scene_element` (scene, element, source, confidence, human_verified, override_flag), `breakdown_export`, `scene_diff` (from version, to version, change type).

**Interfaces:** upload and parse; scene review queue with source-text highlighting; element registry manager; breakdown grid; XLSX export; version diff view.

**Integrations:** shared script ingestion service, OrchaLLM (zero-retention or self-hosted), LocationBank for location resolution, document store.

**Evaluation:** hand-label breakdowns for two completed films as ground truth, then measure precision and recall per element type against them. Track corrections per scene across the pilot to confirm the registry is learning. Time a manual breakdown against a system-assisted one on the same script.

**Pilot users:** one line producer, one 1st AD — ideally on a completed film first so errors cost nothing, then on a live prep.

**Go/no-go at week 6:** cast and location precision above 90%, element precision above 70%, a full breakdown reviewed and corrected in under four hours for a feature, and human overrides surviving a re-parse with zero loss. That last one is not negotiable — if overrides don't survive, the product cannot be trusted with a live production and the diffing model needs rework before anything else proceeds.

---

# Open questions for you

Four things I'd want answered before week one, because they change the plan rather than just detailing it:

1. **Is a film releasing in the next 90 days?** If yes, BoxTrack displaces SceneSpine in the quarter and I'd rewrite the sequencing.
2. **Is a film in prep or shoot in the next 90 days?** CallSheet Ops and SceneSpine both need a live production to pilot against. If nothing is shooting until Q4, the whole order changes and LocationBank plus SubQC become the sensible pair.
3. **Who is the executive sponsor?** Not who approves the budget — who tells the 1st AD to use it. Internal tools without a sponsor die at pilot regardless of quality, and this is more predictive of success than anything in the technical plan.
4. **Has counsel been engaged on DPDP for crew and talent personal data?** CallSheet Ops processes crew personal data from day one. That needs a lawful basis and a notice mechanism established at crew onboarding, not retrofitted after the first film. It's the one dependency in this plan that you can't unblock yourself.
