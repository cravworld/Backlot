# Backlot — Design System v1

Handoff spec for implementation. Pair this with `backlot-style-guide.html` — that file is the visual reference; this document is the rationale and the rules, written so Claude Code can implement consistently without re-deriving decisions.

---

## Design thesis

Backlot is a working tool, not a marketing surface. It's read in a production office under fluorescent light, on a phone at a 4am unit call, and on a lit screen during a night exterior. Every decision below is in service of staying legible and calm under those conditions — not toward looking impressive in a screenshot.

**Rejected directions, on purpose:** warm cream background with serif display and terracotta accent (the current AI-design default — avoided specifically so this doesn't read as generated); near-black background with a single neon accent; zero-radius broadsheet/newspaper layout. None of these were right for a dense, bilingual, operational tool used in bright and dark conditions by people under time pressure.

**The signature element** is the **strip** — a colored left-edge spine on cards and rows, drawn from stripboard scheduling, where physical breakdown strips are color-coded so a whole shooting day is scannable at a glance. The four strip colors below are used identically everywhere in the product: a call sheet row, a permit, a rights obligation, and a scene all use the same four-color vocabulary. This is structure encoding real status, not decoration.

---

## Color tokens

### Day theme (default)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#191D22` | Primary text, headers, icons |
| `--ink-soft` | `#4A5058` | Secondary text, captions, metadata |
| `--paper` | `#F2F0E9` | App background |
| `--paper-raised` | `#FBFAF6` | Card and surface background |
| `--line` | `#DAD6C9` | Hairline dividers, borders |
| `--slate` | `#E4E1D6` | Secondary surface, row hover |
| `--verdigris` | `#1E6E60` | Brand / primary action / confirmed status |
| `--verdigris-ink` | `#16554A` | Primary button hover/active |
| `--ochre` | `#B8842E` | Pending / needs-attention status |
| `--clay` | `#A8452F` | At-risk / overdue status / destructive actions |
| `--sky` | `#3C6E92` | Informational / scheduled status |

### Night theme (on-set / low-light mode)

Same token names, tuned for dark-surface contrast — this is not a separate design language, just the same system re-expressed:

| Token | Hex |
|---|---|
| `--ink` | `#EDEAE0` |
| `--ink-soft` | `#A8ADB4` |
| `--paper` | `#14171B` |
| `--paper-raised` | `#1B1F24` |
| `--line` | `#2B2F34` |
| `--slate` | `#20242A` |
| `--verdigris` | `#3FAF9A` |
| `--verdigris-ink` | `#8FE0CD` |
| `--ochre` | `#D9A24B` |
| `--clay` | `#D2694F` |
| `--sky` | `#6FA6C9` |

**Rule:** never hardcode a hex in a component. Reference the CSS variable so the theme toggle works everywhere without per-component overrides. Default to day theme; let the user switch, and remember the choice per device (this is a genuinely useful setting for night-exterior shoot days, not a novelty).

### The four-color status vocabulary

This is the one piece of color logic that must stay consistent across every module:

- **Verdigris = confirmed / on track / positive.** Acknowledged call sheets, granted permits, cleared rights.
- **Ochre = pending / needs action.** Awaiting acknowledgment, permit application in progress, unresolved review item.
- **Clay = at risk / overdue / destructive.** Conflict detected, deadline missed, delete/remove actions.
- **Sky = informational / scheduled / neutral future state.** Upcoming, not yet due, FYI.

Do not introduce a fifth status color without updating this table — the whole value of the system is that a color means one thing everywhere.

---

## Typography

| Role | Face | Weight(s) | Used for |
|---|---|---|---|
| Display | Big Shoulders Display | 700–800 | Module titles, section headers, hero statements. Uppercase, condensed, industrial — evokes stencilled case and slate lettering. Never for body text. |
| Body | IBM Plex Sans | 400 / 500 / 600 | Interface copy, descriptions, table content — anywhere read at length. |
| Malayalam | Noto Sans Malayalam | 400 / 500 / 600 | Bilingual fields (call sheets, DPRs). Set at the same optical size as body text so the two scripts read as one system, not two. |
| Mono | IBM Plex Mono | 400 / 500 | Scene numbers, page-eighths, timecodes, dates, IDs — anything counted or measured. Use `font-variant-numeric: tabular-nums` in tables. |

Google Fonts import (already wired in the reference file):
```
https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;600;700;800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+Malayalam:wght@400;500;600;700&display=swap
```

---

## Layout

**Structure:** persistent left module rail (binder-tab metaphor), role-filtered per user — a 1st AD sees Call Sheet Ops and SceneSpine, a location manager sees LocationBank and PermitTrack, business affairs sees RightsLedger and nothing else. Active tab marked with the same 3px spine treatment as strip cards, in verdigris.

**Content density:** this is an operational tool — prefer dense, scannable rows over generously-padded cards. Hairline dividers (`--line`) between table rows rather than full borders, evoking a ruled ledger without going full broadsheet.

**Radius:** small and consistent — 4px for tight elements (badges, buttons), 8px for cards and containers. No large rounded corners; this isn't a consumer app.

**Shadow:** one shadow token, used sparingly, only to lift a card off the page — not for every element:
```css
--shadow-card: 0 1px 2px rgba(25,29,34,0.06), 0 1px 1px rgba(25,29,34,0.04);
/* night theme: 0 1px 2px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3); */
```

**Mobile:** the rail collapses to a horizontal scroll strip below ~860px. CallSheet Ops and the DPR form in particular must be fully usable one-handed on a phone — that's the real usage condition for a 2nd AD at wrap.

---

## Components

- **Strip / card:** colored 6px left spine (one of the four status colors) + content. Used for call sheet rows, permit rows, rights obligations, scene list rows. See reference file, section 03.
- **Buttons:** primary (verdigris fill), secondary (outline), ghost (text only), danger (clay outline, used only for destructive actions — delete, revoke). Active action names stay consistent through a flow: a button that says "Send call sheet" produces a confirmation that says "Call sheet sent," never "Submitted successfully."
- **Badges:** small pill with a colored dot + label, using the four-status vocabulary. Used inline in tables and lists where a full strip would be too heavy.
- **Data tables:** mono tabular numbers, hairline row dividers, row hover in `--slate`. This is where most of the actual work in this product happens — keep it fast and dense, not decorative.
- **Motion:** one signature moment — a small "stamp" animation (scale + slight rotation settle) on confirmation actions like call sheet acknowledgment, referencing the physical act of stamping paperwork. Everything else should be near-instant with no animation. Respect `prefers-reduced-motion` — disable the stamp animation entirely when set.

---

## Writing and voice

- Name things by what the person controls, not by system internals: "Send call sheet," not "Trigger dispatch." "Pending permits," not "Unresolved records."
- Active voice, consistent verb through a flow: the button says "Publish call sheet," the resulting toast says "Call sheet published" — not "Submitted," not "Success."
- Errors state what happened and what to do, without apologizing or hedging: "Call sheet couldn't be sent — WhatsApp delivery failed for 3 recipients. Retry or edit recipients." Not "Oops, something went wrong."
- Empty states are an invitation to act, not a dead end: an empty LocationBank search says "No locations match yet — try a wider radius or fewer filters," not "No results."

---

## Accessibility floor (non-negotiable)

- Visible keyboard focus on every interactive element — the reference file uses a 2px `--sky` outline with offset; carry this through.
- Color is never the only signal — every status badge and strip pairs its color with a text label, for colorblind users and for anyone reading a black-and-white printout of a call sheet (this happens on real sets).
- Contrast: body text against `--paper`/`--paper-raised` and against `--ink`/`--paper` in night mode both meet WCAG AA at minimum — verify Plex Sans at the sizes actually shipped, not just the tokens in isolation.
- `prefers-reduced-motion` respected everywhere, not just on the stamp animation.
- Malayalam text fields get the same focus, error, and validation treatment as English fields — no second-class script.

---

## What not to do

- Don't add a fifth accent color. If a module seems to need one, it's a sign the status vocabulary needs rethinking, not extending.
- Don't use the display face below ~20px or for anything a person needs to read quickly under pressure — it's for headers, not data.
- Don't build a second visual language for "the marketing site" or "the login page" — if Backlot ever gets a public-facing surface, it should look like Backlot, not like a different, friendlier product wearing the same name.
- Don't let RightsLedger's UI look identical to everything else — per the Pass 2 isolation requirement, give it a subtle but real visual marker (a persistent "Restricted" treatment in the rail, per the reference file) so anyone using it is always aware of the sensitivity, without changing the underlying token system.

---

*Reference implementation: `backlot-style-guide.html` — open it, toggle Day/Night, and treat it as the source of truth for exact values. This document explains why; that file shows how.*
