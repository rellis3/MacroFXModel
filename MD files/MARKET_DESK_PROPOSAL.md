# The Desk — one-page market read (proposal)

> **Status: proposal, not built.** This doc is the suggested design for a single
> page that answers "what is happening in the markets and what should I care
> about today" — consolidating the information currently spread across ~25 live
> pages. Every panel below maps to an **existing** API endpoint; the page needs
> no new signal computation to ship its first version.
>
> Written 2026-07-24 after a full survey of all 122 HTML pages, the live API
> surface in `server.js`/`_worker.js`, and the platform's own evidence docs
> (`PROJECT_STATUS.md`, `TRADABILITY_REVIEW.md`, `SYSTEM_ASSESSMENT.md`,
> `BACKTEST_INDEX.md`).

---

## 1. The problem this page solves

The platform's live information is real and mostly warm (cron loops keep it
fresh), but reading it requires a tour:

| To answer… | You currently open… |
|---|---|
| What kind of day is it? | `today.html` (AI brief), `credit-stress.html`, `liquidity-pulse.html`, index.html macro tiers, `/api/risk-flags` (no page shows it directly) |
| What does the model expect today? | `vol-forecast-v2.html` (σ bands, hit rates), `forecast-path.html` (cone, vol left) |
| Where would I act? | `range-zones.html`, `oi-zones.html`, `levels.html`, `telegram-v2.html`, `gold-zones.html` |
| What are the bots doing? | `bot-config.html` (18 tabs), `performance.html`, `giveback.html` |
| Is the edge still working? | `forward-track.html`, `journal.html`, `/api/range-line-bot/oi-audit` |
| Anything unusual? | `cot-extremes.html`, `correlations.html`/hedge alerts, calendar in index.html |

Six questions, ~15 pages. `index.html` tries to be everything and has become a
per-pair *terminal* plus a nav hub; `indexv2.html` was the right instinct
(market-state-first) but stalled. Meanwhile the honest-evidence docs say most
of what those pages display is **context, not signal** — and nothing in the UI
tells you which is which.

**The Desk** is one page, scannable top-to-bottom in ~2 minutes, ordered by the
questions above, with a trust label on every panel.

---

## 2. Design principles

1. **Question-ordered, not feature-ordered.** Sections follow the morning
   sequence: *weather → expectations → action zones → my book → exceptions →
   context.* Not "here is every widget we own."
2. **Exception-driven, not exhaustive.** The per-instrument board is compact
   (one row each). Everything else surfaces only what is *notable today*
   (stretched cone, COT extreme, credit flip, bot heartbeat missing). A calm
   day should look calm — `indexv2.html`'s "no notable signals" feed idea,
   kept.
3. **Trust labels everywhere.** Every panel carries a badge from the
   `BACKTEST_INDEX.md` taxonomy: **✅ validated** (range-line book, σ range
   estimate), **📈 forward record** (accruing evidence), **🧪 context** (macro,
   COT, liquidity, sentiment — explicitly not signals), **⛔ null** (never
   shown, linked only). This makes the page honest by construction — the UI
   itself stops overselling.
4. **Read-only.** No configs, no Telegram setup, no backtest runners, no
   journal entry forms. Those stay on their existing pages; The Desk deep-links
   to them. One purpose: *understand the markets today.*
5. **Reuse only.** Phase 1 consumes existing endpoints verbatim. Rendering
   reuses the existing bricks (`levelChart` for any chart with levels,
   `instrumentRegistry` for pips/digits). No vol math, no level math, no
   scoring is re-implemented client-side (Lego Principle 1).
6. **Self-contained HTML, dark theme, vanilla JS** — house convention, served
   from repo root, linked from `index.html` (not `hub.html`).

---

## 3. The page — `desk.html`, section by section

```
┌─────────────────────────────────────────────────────────────────────┐
│ A. WEATHER STRIP   risk light · session clock · calendar · data age │
├─────────────────────────────────────────────────────────────────────┤
│ B. THE STORY       AI morning brief TL;DR (collapsible full text)   │
├─────────────────────────────────────────────────────────────────────┤
│ C. MARKET BOARD    one row per instrument:                          │
│    price · Δ · range used vs forecast · cone state · regime · bias  │
│    → click row = drill-in drawer (chart + bands + zones + brief)    │
├─────────────────────────────────────────────────────────────────────┤
│ D. TODAY'S ZONES ✅  range-line zones (+OI agree tag) · OI gamma    │
├─────────────────────────────────────────────────────────────────────┤
│ E. MY BOOK 📈      bot heartbeats · open positions · forward track  │
├─────────────────────────────────────────────────────────────────────┤
│ F. EXCEPTIONS      only-if-notable feed: stretched/quiet cones,     │
│                    COT extremes, credit-gate flip, hedge alerts,    │
│                    event blackouts, stale-data warnings             │
├─────────────────────────────────────────────────────────────────────┤
│ G. CONTEXT DRAWER 🧪 (collapsed) macro tiers · liquidity · rates ·  │
│                    COT table · sentiment — labelled "context only"  │
└─────────────────────────────────────────────────────────────────────┘
```

### A. Weather strip (always visible, one line)

*"What kind of day is it?"* — answered before any prices.

- **Risk light** — `GET /api/risk-flags` → CALM / CAUTION / RISK_OFF with the
  5 flags (VIX level, VIX term structure, HY speed, JPY bid, EVZ percentile)
  on hover. This composite already exists and **no page currently displays
  it** — it's the single best "weather" number in the codebase. 🧪
- **Session clock** — Asia / London / NY with time-to-next-open, and today's
  position in the vol day (from `/api/vol-forecast/intraday-profile` peak
  hours: "London open — historically the highest-vol hour for FX").
- **Calendar ribbon** — next 24h high-impact events from `GET /api/events`
  (ForexFactory brick), with the event-impact multiplier from
  `/api/vol-forecast/event-impact` ("CPI 13:30 — EURUSD ranges historically
  ×1.3 on CPI days"). Red highlight when inside a blackout window
  (`event_windows_v1` — same windows the bots respect).
- **Data-age pill** — worst-case staleness across the feeds this page uses
  (forecast date, FRED age from `/api/monitor/status`, KV health from
  `/api/kv-health`). Grey/amber/red. A dashboard that silently shows stale
  data is worse than no dashboard.

### B. The story (2 lines + expand)

`GET /api/morning-brief` → show `tldr` + `headline` only; expand for the full
column (regime/theme/dollar/rates/risk/complex/watch). Regenerate button posts
to the existing route. Labelled **AI narrative — colour, not signal**. 🧪

### C. Market board (the core — one row per instrument)

The consolidation of `vol-forecast-v2` overview + `forecast-path` +
`levels.html` + index.html's per-pair tabs into a *scan*, driven mainly by the
already-joined `GET /api/daily-brief` (forecast levels + hit rates + HMM regime
+ sizing + live price in one payload) plus `GET /api/forecast-path/summary` and
`GET /api/vol-forecast/live`.

Columns (per instrument — the ~14 range-line pairs + NQ/SPX/DAX + gold,
grouped FX / indices / metals):

| Col | Content | Source |
|---|---|---|
| Instrument + price | live mid, day Δ% coloured | `daily-brief` / `oanda_stream` for favourites |
| **Range used** | bar: consumed range vs forecast HL-median and HL-75 (e.g. `72% of median`) — the validated σ estimate doing its real job ✅ | `/api/vol-forecast/live` |
| **Cone state** | STRETCHED / NORMAL / QUIET percentile chip (4h cone) | `/api/forecast-path/summary` |
| Regime | HMM chip (5m v2 + 1h agree/disagree marker) | `/api/hmm5m-v2`, `/api/hmm1h-v2` |
| Day shape | bias/outlook word from session read (trend-day vs range-day) | `/api/vol-forecast/live` |
| **Nearest level** | closest forecast/zone level, distance in pips, historical hit% for that level | `daily-brief` + `/api/vol-forecast/hit-rates` |
| Position | dot if a bot holds it (links to §E) | trade-history/status KV |

Sort default: most-notable-first (stretched cones, >100% range used, near-zone
instruments float up; quiet pairs sink). This is what makes 20 rows scannable.

**Row click → drill-in drawer** (no page navigation): M5 chart via the
`levelChart` brick with today's forecast bands + range-line zones + OI walls
drawn as `Level[]`/zones; the instrument's `daily-brief` text; link out to
`today.html?pair=X` for the full brief and `/api/analysis` deep-dive. One
chart component, levels passed in — exactly what `levelSources`/`levelChart`
were built for.

### D. Today's zones ✅ (the only "act here" section)

Only the *validated* edge and the live forward tests appear here — this is
deliberately **not** a merge of every level source.

- **Range-line zones** — `GET /api/range-line-bot/zones?confluenceMin=…`:
  today's fade/follow ladder per pair with confluence stars and the OI
  agree/disagree tag it already carries. Badge: **✅ the proven book**
  (single-pair OOS Sharpe ≈4.7–6 at 2–3× cost, per `PROJECT_STATUS.md`).
- **OI gamma zones** — `GET /api/oi-bot/zones`: PIN/BREAKOUT regime, planned
  zones, gamma-flip distance. Badge: **📈 forward test** (the OI audit tally
  from `/api/range-line-bot/oi-audit` shown inline: tagged-vs-untagged
  expectancy so far — evidence accrues in view).
- Compact "distance to nearest zone" is already in the board (§C); this
  section is the full ladder for instruments within striking distance only
  (zone within today's remaining expected range — computable client-side from
  the same payloads).

Explicitly **excluded**: the 45-fib raw ladder, star-rated confluence from
`levels.js`, COG bands as signals — they're either inputs to the above or
unvalidated. Linked, not shown.

### E. My book 📈 (is the machine on, and is it working?)

- **Bot heartbeats** — one chip per production bot (RegimeV2, Level, Gold,
  volatility, range-line, OI, QMR×4…) from the `bot_status` KV keys /
  `GET /api/state` — green/amber/red on last-seen (the `performance.html`
  heartbeat card, generalised beyond gold).
- **Open positions** — from `GET /api/trade-history` + status keys: pair,
  direction, age, unrealised R; shadow-book score chip where TDE has scored it
  (`/api/trade-decision/shadow-book`).
- **Forward track strip** — the flagship evidence line: forward Sharpe at
  ×2/×3 cost + trade count from `GET /api/forward-track`, and the cone's
  forward calibration tally from `/api/forecast-path/forward`. This is the
  panel that answers "is the edge still real *out of sample, live*" — the
  platform's own docs say this is the evidence that matters, so it belongs on
  the front page, not buried in `forward-track.html`.
- **Give-back sparkline** — kept-vs-gave-back from `GET /api/giveback`
  (exit quality at a glance).

### F. Exceptions feed (empty on a calm day — that's the point)

A single chronological list, each item one line + deep link, generated
client-side from feeds already polled:

- Cone **STRETCHED/QUIET** flips (`forecast-path/summary` — same condition the
  surprise-alert Telegram scan uses).
- **Range >100%** of forecast median (from §C data).
- **COT extreme** flags this week (`/api/cot-extremes` — only the "Extreme
  Signals This Week" subset, not the whole table).
- **Credit-gate regime flip** (`/api/credit-stress` tier change — the server
  already Telegram-alerts this; mirror it here).
- **Hedge alerts** (`/api/hedge-alerts` — the banner index.html already
  shows).
- **Event blackout entered** (calendar windows).
- **Data staleness / bot heartbeat lost** (from §A/§E inputs).

This replaces "check five monitor pages in case something moved" with "the
page tells you."

### G. Context drawer 🧪 (collapsed by default, labelled "context — not signals")

The macro furniture, deliberately demoted below the fold, one compact card
each, every card badged 🧪 and carrying its evidence verdict where one exists:

- **Macro dashboard** — VIX/US10Y/DXY/HY/TIPS snapshot (`/api/fred`) + rate
  differential mini-matrix (`rate-matrix.html` content).
- **Liquidity** — GLI phase + net-liquidity gate state
  (`/api/liquidity-gate/live` composite; `liquidity-pulse` daily bar). Caption:
  *"gate backtests: context only — see liquidity-gate page."*
- **COT positioning** — percentile heat strip across instruments
  (`/api/cot-extremes`).
- **Retail sentiment** — OANDA book + Myfxbook (`/api/oanda_book`,
  `/api/sentiment`).
- **Correlation/beta** — avg pair correlation + current risk clusters
  (`/api/hedge-alerts` summary; link to Correlation Lab).

Nulls (MVE, econ-trend, credit-stress-as-gate, strategy-lab strategies) do
**not** get cards. A footer line links to `BACKTEST_INDEX.md`'s legend —
"why isn't X shown here?" has a documented answer.

---

## 4. What this page deliberately is not

- **Not a replacement for `index.html`** — the per-pair terminal (AI analyse,
  OI paste modal, journal save, alert config) stays. The Desk becomes the
  *landing* read; index.html becomes the *workbench* you jump into. Suggested
  nav: The Desk link first in Live; optionally make it the landing page later
  once it's earned it.
- **Not a config surface** — zero settings beyond favourite instruments +
  collapsed/expanded state (persisted via the existing `/api/nav-layout`-style
  KV pattern, but a `desk_layout` key must be added to the KV allowlists per
  the CLAUDE.md three-gate rule if persistence beyond 48h is wanted).
- **Not another signal.** It computes nothing new. If a panel needs new math,
  that math is a brick with its own test first — not page JS.
- **Not `indexv2.html` resurrected wholesale** — but §C/§F adopt its two good
  ideas (state-first matrix, notable-signals feed). `indexv2.html` should be
  retired/redirected once The Desk ships, so there aren't three landings.

## 5. Implementation sketch (for when/if approved)

**Phase 1 — pure composition (1 page, 0 server changes).**
`desk.html` + `js/deskApp.js`, fetching the ~12 endpoints above directly
(they're all warm; total payload is modest). Charts via `levelChart`. Refresh:
board 60s (favourites via SSE stream), weather/context 5 min, forward-track on
load. Ship, link from `index.html` Live nav.

**Phase 2 — one aggregator (optional, cuts ~12 fetches to 2).**
`GET /api/desk` on server.js composing the §A–§F payload server-side from the
same in-memory state/KV the individual routes read (pattern: `daily-brief`,
which already joins four sources). Client falls back to individual routes if
absent — keeps the worker deployment working unchanged.

**Phase 3 — earn the front door.** After a few weeks' use, decide whether The
Desk replaces `index.html` as the landing page and which of the ~10 single-
purpose monitor pages (`liquidity-pulse`, `rate-matrix`, `credit-stress`
reading card, heartbeats in `performance.html`…) can become redirects.

Checklist per house rules: new page linked from `index.html` (not hub);
`node --check` on any JS; no vol/level math duplicated; if `desk_layout` KV
persistence is added → `_CF_EXACT` + `isAllowedKVKey` + `PERMANENT_KEYS`;
LEGO_MODULES.md updated only if a brick is added (Phase 1 adds none).

## 6. Panel → replaces map (quick reference)

| Desk section | Consolidates (page stays, but you stop needing it daily) |
|---|---|
| A Weather | risk-flags (nowhere today), calendar in index.html, session stats in vol-forecast-v2 |
| B Story | today.html "The story" |
| C Board | vol-forecast-v2 overview, forecast-path summary, levels.html table, indexv2 matrix |
| D Zones | range-zones.html, oi-zones.html (live halves) |
| E Book | bot-config Positions tab, performance.html heartbeats, forward-track.html, giveback.html |
| F Exceptions | cot-extremes "this week", hedge banner, surprise-alert scan, credit flip alert |
| G Context | fred snapshot, rate-matrix, liquidity-pulse/global-liquidity reading, cot table, sentiment |
