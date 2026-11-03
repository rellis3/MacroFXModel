# Desk Analyst Pipeline: design

*Started 2026-11-03 on branch `ccr-4824155b-3im5ze`. Register row: `desk-analyst-pipeline`. Status: Phases 0, 1 and 2 built.*

## 1. What this is

Every morning, one run turns the desk's own data into a set of professional outputs: the newsletter, a directional
analysis, a forecast of the day, trade ideas, and a risk & events briefing. The run is a chain of **skills** (role
prompts). Each skill reads a defined slice of the data, writes a short typed report, and hands it on.

The structure is borrowed from [TauricResearch/TradingAgents](https://github.com/tauricresearch/tradingagents)
(analysts → bull/bear researchers → research manager → trader → aggressive/conservative/neutral risk desk →
portfolio manager → memory). Their data (equities, SEC filings, Reddit) is not used. Neither is their central idea that
the LLM *is* the trading signal (see §3).

The home is **Atlas** (`atlas.html`): it already reads most of the feeds below and carries the newsletter.

## 2. The owner's method: top-down

All analysis runs **global market → currency impacts → assets (FX, indices, commodities)**. The pipeline follows
that order at every layer:

1. **Global.** What is the world doing? Risk tone, credit, funding, liquidity, cross-asset regime, what's on the calendar.
2. **Currency.** Given that, what happens to each of the eight currencies (USD EUR GBP JPY AUD NZD CAD CHF)? Rates,
   central banks, yields, macro prints, positioning.
3. **Asset.** Given the currency views, what does each instrument do today? Vol and implied vol, options open
   interest, levels and structure. Pair views come from the two currency views; indices and gold from the global
   view plus USD and rates.

## 3. Rules the design holds to

1. **The LLM layers add context; they never create a signal.** Trade permissions come from the engines that have been
   tested (`DecisionEngine/`, `Trade_Decision_Engine/`). A skill may say "the bear case is strong, size down". It may
   never turn "no shorts" into "short".
2. **Evidence first.** An Evidence Clerk skill hands every debater only the Evidence Book entries (`js/deskEvidence.js`)
   relevant to its claims, so nobody argues from a banked null. Long-context obedience is where cheaper models fail
   silently (`js/modelRouter.js` header), so each skill gets **only the entries that matter to it**, not the whole
   ledger.
3. **One pack per day.** Every skill reads the same Desk Pack (Phase 0). Nothing fetches its own data mid-run, so what
   each skill saw is known and can be graded.
4. **Gaps are stated.** A missing, empty or stale feed reaches the skill as a gap with its reason ("Fed path odds not
   loaded; last read 2026-10-28"). It is never read as "nothing happened".
5. **Typed outputs.** Every skill returns JSON against a schema. A decision with no readable rating is `REVIEW`, never
   a silent Hold (TradingAgents' `rating.py` rule).
6. **Judges must commit.** Managers weigh the cases and choose the stronger side, sized by how clearly it wins.
   Neutral only when the evidence really is balanced or too thin. This is their prompt rule, kept.
7. **Measured, not assumed.** Day forecasts and directional calls are logged and scored. Whether the pipeline beats
   the current single prompt (`/api/analysis`) and the engines alone is a pre-registered question (§8), not a belief.

## 4. Architecture

```
Layer 0  Desk Pack (no LLM)            one dated snapshot of ~107 feeds, gaps marked          ← BUILT (Phase 0)
Layer 1  Analysts (parallel, cheap)    11 skills, one typed report each
Layer 2  Top-down debate               2a Global: risk-on vs risk-off → Global Manager
                                       2b Currency: strengthen vs weaken, per currency → Currency Manager
                                       2c Asset: Research Manager per instrument (pair = ccy A vs ccy B)
Layer 3  Trader + risk desk            plan per instrument; Aggressive / Conservative / Neutral → Head of Desk
Layer 4  Writers                       newsletter · directional · day forecast · trade ideas · risk & events
Layer 5  Memory                        log every call, grade it, feed lessons back to the managers and writers
```

### Layer 1: analyst skills and their feeds

The feed registry is `js/deskPack.js` (`DESK_FEEDS`, `DESK_INSTRUMENT_FEEDS`). `GET /api/desk-pack/feeds` lists it live.

| Layer | Skill id | Reads (`/api/…`) | Pages it stands for |
|---|---|---|---|
| global | `global_market` | global-read, wider-market, risk-flags, regime, hmm/regimes, macro-regime-fx, gpr, crack, gold-etf-flow, desk-watch, spread-episodes/live, trend-basket, daily-snapshot, market-sense/last | Market View, Terminal, Surface Lab, Market State, Regime, Spread-turn episodes, Market-Sense |
| global | `credit_funding` | credit-stress, credit-quality, bank-credit, funding-read, liquidity-pulse/data, liquidity-gate/live | Stocks/bonds & credit, Bank credit & funding, Book Stress, Global Liquidity |
| global | `events_news` | calendar-ahead, events, event-day, release-calls, news-outcome, earnings-ahead, fiscal/events | Event Book, Release why/reaction, Labour market due, The Feed, Fiscal Events |
| currency | `rates_cb` | rates, rate-diff, rates-regime, fed-path, fed-speakers, {fomc,ecb,boe,boj,boc,rba,rbnz,snb}/latest, beigebook/latest, treasury-auctions | Rates & Policy, Fed Path Odds, 8 CB Sentiment pages, Rate Matrix, Beige Book |
| currency | `yields_curve` | yield-curve, intl-yields, real-yield, yield-context, yield-coupling, yield-spread/plan | Yield Curve, Real Yield, Yield-Shape Regime, Rate legs vs price, Rates vs Nasdaq |
| currency | `macro_economy` | cpi, ppi, gdp, ism, labor-market, retail-sales, trade-balance, consumer-confidence, econ-surprise, econ-trend, nowcast, macro-scorecard, macro-changes | CPI … Consumer Confidence, Macro Scorecard, The Economies, The Week Scored |
| currency | `cot_positioning` | cot-state, cot-extremes, oanda-book/history | COT Extremes |
| asset | `vol_iv` | vol-forecast (+ /session, /weekly, /intelligence), cvol, forecast-path/summary, forecast-path/iv, exhaustion-ladder, daily-read, today-reads | Vol Forecast v2/v3, Expected Moves, Daily Read, Exhaustion research, Forecast Path, Live Range |
| asset | `options_oi` | oi-today, oi-levels, chain-read, swing-map × 11 instruments | OI Analytics, OI Lab (v2), Open interest, Swing Map |
| asset | `levels_structure` | levels, asia-today, weekmap, range-calls, daily-open-fib, trade-decision/state × 8 FX pairs | Level Scenarios, Level/Fib Atlas vote portfolios, Asia Fib Atlas Live, Daily Plan, Trade Decision |
| evidence | `evidence_memory` | ledger, direction-ledger, forward-track, data-health, morning-brief, eod-review (+ `js/deskEvidence.js` read directly) | Evidence Book, Chapters, yesterday's brief and review |

The research and backtest pages (Vol BT, Decision-Zone BT, Forecast Line Backtest, Portfolio Book, Rich-Vol Break
Record, Bot Audit, Honest Harness …) are **not daily feeds**. Their verdicts reach the pipeline through the Evidence
Book, via the Evidence Clerk.

Universe (owner, 2026-11-03): **every instrument the vol forecast covers**, 41 names (`DESK_UNIVERSE`, kept equal
to `js/volForecastScheduler.js` INSTRUMENTS by a test):

| Group | Instruments | Read from (legs) |
|---|---|---|
| FX majors | EURUSD GBPUSD USDJPY AUDUSD NZDUSD USDCAD USDCHF | base and quote currency views |
| FX crosses | GBPJPY EURGBP EURJPY EURCHF GBPCHF AUDJPY CADJPY EURAUD EURCAD EURNZD GBPAUD GBPCAD AUDCAD NZDCAD NZDJPY | base and quote currency views |
| Indices | NQ SPX500 US30 US2000 DE30 UK100 | home currency (USD, EUR for DE30, GBP for UK100) + global view |
| Metals | GOLD SILVER COPPER PLATINUM PALLADIUM | USD + global view |
| Energy | WTI BRENT NATGAS | USD + global view |
| Ags | SOYBEAN WHEAT CORN SUGAR | USD + global view |
| Crypto | BTCUSD | USD + global view |

Every leg is one of the eight currencies, so the currency layer stays at eight debates however wide the asset layer
gets. Swing map and trade-decision state exist only for a subset (`DESK_SUBSETS`); the other instruments are read
from the vol forecast, levels and the currency views.

### Layer 2: top-down debate

| Step | Roles | Reads | Writes |
|---|---|---|---|
| 2a Global | Risk-On advocate vs Risk-Off advocate, 1–2 rounds → **Global Manager** | global analyst reports + evidence | `global_view`: regime, risk tone, conviction, drivers, what would flip it |
| 2b Currency | per currency: Strengthen vs Weaken advocate, 1 round → **Currency Manager** (one call ranks all eight) | `global_view` + currency-layer reports + evidence | `currency_views[8]`: bias, conviction, drivers, flip conditions; a strength ranking |
| 2c Asset | **Research Manager**, one call per group (FX majors, FX crosses, indices, metals, energy, ags, crypto); no separate debate, which already happened at currency level | `currency_views` of each instrument's legs (`instrumentLegs`) + the global view + asset-layer reports + DecisionEngine permissions where they exist | `instrument_views`: direction, conviction, held to the permissions |

This is 8 currency debates rather than one per pair. It matches how the macro pages think (The Economies, one CB per
currency), and it keeps cost flat as the universe grows: about 2 + 16 + 1 + 7 calls for all 41 instruments.

### Layer 3: trader and risk desk

- **Trader** (per instrument): zones, entry, stop, target in σ from the forecast bands and levels; session timing.
- **Aggressive / Conservative / Neutral** (one call each, covering all instruments): argue size and timing against the
  calendar, the vol regime and correlation between ideas.
- **Head of Desk**: final per-instrument card: rating on the **five-step scale** (owner, 2026-11-03): `STRONG_LONG`,
  `LONG`, `FLAT`, `SHORT`, `STRONG_SHORT`, or `REVIEW` when no rating can be read. Plus size multiplier,
  invalidation, and "what would change my mind". The tested engines' permissions bound the rating: where shorts
  aren't permitted, the floor is `FLAT`.

### Layer 4: writers (one skill each, same inputs, different jobs)

1. **Newsletter**: **runs side by side with the current issue** (owner, 2026-11-03). The current newsletter is
   untouched: same code, same prompt, same style, still the one that's sent. The pipeline writer is given the
   current newsletter's style rules and recent issues as examples, so it writes in the same voice, and its issue is
   archived beside the current one (a separate `kind` in `newsletter_archive_v1`). Atlas shows the two for the
   same day next to each other so the owner can check the content. It replaces nothing until the owner decides.
2. **Directional analysis**: per instrument bias, conviction, the evidence behind it, what would flip it.
3. **Day forecast**: per instrument the expected range (bucket against the session σ), **trend day vs range day**,
   continue vs exhaust, which session carries the move. This is the "predict the day" output, and the most gradable one.
4. **Trade ideas**: within permissions and levels only.
5. **Risk & events briefing**: what is on, size multipliers, when to stand aside.

### Layer 5: memory

Every Layer 2–4 call is saved with the pack date. Next day it is graded against what happened (realised range and
direction from the same bars the Daily Read scores). The graded lessons go back to the managers and writers ("last 20
days: range-day calls right 13/20; we called USD strength 4 times into NFP and were wrong 3"). `direction-ledger` and
`forward-track` already do part of this and are reused.

## 5. How skills are written

Each role is a file in `desk/roles/<id>.md`, so it can be tuned like a Claude Code skill without editing `server.js`:

```markdown
---
id: rates_cb
layer: currency
model_tier: quick          # quick | deep (modelRouter task)
reads: [rates_cb]          # Desk Pack skill slices
evidence: [rates, fomc, curve]   # Evidence Book domains the clerk pulls from
output: analyst_report     # schema name in js/deskSchemas.js
---
You are the desk's central-bank and rates analyst ...
```

Schemas live in one module (`js/deskSchemas.js`) and are validated on every reply. A reply that fails validation is
retried once, then recorded as `REVIEW`.

Analyst report (all Layer 1 skills):

```json
{ "skill": "rates_cb", "asOf": "2026-11-03", "headline": "...", "points": [{ "claim": "...", "evidence": "feed or ledger id", "impact": { "USD": +1 } }],
  "gaps": ["fed-path: empty"], "confidence": "low|medium|high" }
```

## 6. Models and cost

- `quick` tier (analysts, advocates, risk desk): the cheaper provider via `modelRouter.js` tasks.
- `deep` tier (Global, Currency, Research Managers, Head of Desk, writers): the strongest model.
- About 45 calls per morning for the whole universe. It runs once at ~06:50 London after the pack and is cached; the
  pages read the cached result. A button reruns one instrument on demand.
- Token counts are logged per run (the router reports tokens, not prices, by design).

**Model, for now (owner, 2026-11-03):** both desk tasks run on **Claude Sonnet 5** (`models` on the task in
`js/modelRouter.js`), estimated at about $0.80 a run, roughly half of Opus 5. To move one back without a deploy, set
`AI_TASK_MODEL_DESK_HEAD=claude-opus-5-5` (or `_DESK_ANALYST`) on Railway. A task pin applies only on the provider it
names, so a task routed to DeepSeek never receives an Anthropic model id.

## 6b. The desk as a hedge fund: the data flow (2026-11-03)

![The desk's data flow](desk-data-flow.jpg)

Raw data goes through each agent and comes out as the next stage's input: the Desk Pack, 11 analyst reports, the
rulings, draft ratings, size changes, the book, then the evening score and lessons, which loop back to the next
morning's evidence clerk. Planned agents (dotted amber) sit beside the step they will join. An interactive version
with what each agent reads is the Desk Agent Map artifact.

## 7. Phases

| Phase | Builds | Done when |
|---|---|---|
| **0** | Desk Pack: feed registry, daily build 06:40 London, gaps and freshness, saved per day | **built**: `js/deskPack.js`, `/api/desk-pack*`, service `deskPack` |
| 1 | Role files + schemas; Layer 1 analysts; Head of Desk reading analysts only; desk-run page | **built** (§9b); hand-written slicers and an Atlas panel follow the first Railway runs |
| 2 | Layer 2 top-down debate + Layer 3 asset desks and risk desk; debate visible on the page | **built** (§9d) |
| 3 | Layer 4 writers (newsletter first, then day forecast, directional, ideas, risk) | newsletter desk edition **built** (§9g); day forecast next |
| 4 | Layer 5 memory + grading; the pre-registered comparison (§8) starts counting | **built** (§9k); counting from 2026-11-04; judged at 120+ counted days (§9k) |
| 5+ | The roadmap in §11: session updates, event agent, red team, journal coach, theory desk, and the build items | owner picks the order |

## 8. How it gets judged

Before Phase 4's numbers count, a prereg (`forge/DESK_ANALYST_PIPELINE_PREREG.md`) fixes:

- **What is scored.** Day forecast: range bucket vs realised range in session σ; trend/range day; direction sign at
  the London close and the NY close. Directional view: 1-day and 5-day sign, conviction-weighted.
- **Against what.** (a) the current single-prompt `/api/analysis`, run on the same pack; (b) the engines alone (the
  DecisionEngine mode and Global Read with no LLM); (c) drift / always-flat.
- **How long.** A fixed forward window (proposal: 60 London sessions), lockbox rules from `data-rules`, one seed.

Until then everything the pipeline says is labelled **context, untested**.

## 9. Phase 0 as built

- `js/deskPack.js` (pure) holds the skill list, feed registry, instrument expansion, as-of detection, the empty and
  stale rules, slimming, pack assembly, the index and the schedule rule. Tested in `js/deskPack.test.mjs`, including a
  check that every feed path is a route the server actually serves.
- `server.js`, section "Desk Pack":
  - `POST /api/desk-pack/build` starts a build in the background (202; 409 if one is running).
  - `GET /api/desk-pack/status` shows the job and the latest health.
  - `GET /api/desk-pack` returns today's pack; `?date=YYYY-MM-DD` a saved day; `?skill=<id>` one skill's slice;
    `?summary=1` health and per-feed status only.
  - `GET /api/desk-pack/index` lists the days saved; `GET /api/desk-pack/feeds` lists the registry.
- Schedule: service `deskPack` (`js/serviceFlags.js`) checks every 10 minutes and builds once per London weekday from
  06:40. Switch it off with `SVC_DESKPACK=0`.
- Storage: `desk_pack_<date>` (gzipped JSON, base64) and `desk_pack_index`, both routed to CF KV by the `desk_pack_`
  prefix in `kv.js`.
- Statuses: `ok`, `stale` (older than the feed's `maxAgeH`), `empty`, `error`, `timeout`, `oversize`. See the
  module header.
- Per-feed options: `maxAgeH` (freshness), `keep: 'first'` (calendars keep their nearest items), `maxBytes` (size
  allowance; `vol-forecast` has 400 KB), `timeoutMs` (`calendar-ahead` has 150 s because a cold cache makes nine
  upstream calls).
- Smoke test, 2026-11-03, local server with no API keys: 107 feeds in 46 s, about 94 KB gzipped. The pack reloads from
  KV after a restart, and a second build while one is running is refused (409). Most gaps were missing keys in the
  sandbox (OANDA, FRED, R2) and stores that had never been built. **The first Railway build is the real feed audit.**
  Read it with `GET /api/desk-pack?summary=1` and fix or drop every feed that is still a gap there before Phase 1
  relies on it.
- Known limitations, for Phase 1: as-of detection is generic (`vol-forecast` reads as undated), and the slimming cut
  is generic. Both are replaced by hand-written slicers per skill.

## 9b. Phase 1 as built (2026-11-03)

- **Role files** in `desk/roles/`: eleven analysts (one per Desk Pack skill, in the owner's order) and
  `head_of_desk.md`. Front matter says what each reads, which Evidence Book domains it gets, its model tier and its
  output schema (format in `js/deskRoles.js`). Edit the prose to tune a role; a test checks every pack skill has
  exactly one analyst and every domain exists.
- **Schemas** in `js/deskSchemas.js`: `analyst_report` and `head_book`. Replies are repaired where small (scores
  clamped to −2..+2, ratings normalised to the five steps) with every repair noted; an unreadable rating is `REVIEW`,
  never `FLAT`. A reply that can't be used is retried once with its errors, then the skill is recorded as failed.
- **Run** in `js/deskRun.js`: analysts four at a time, then the Head of Desk. Phase 1's Head reads the analysts'
  reports directly (the debate layers come in Phase 2). It writes the global tone, a bias for each of the eight
  currencies, and a card for every one of the 41 instruments, read from its legs. If fewer than half the analysts
  succeed, the Head does not run.
- **Model tasks** `desk-analyst` and `desk-head` (`js/modelRouter.js`). Both carry a ledger slice, so neither is
  sent to a cheap provider unless the owner chooses it on the AI config screen.
- **Server:** `POST /api/desk-run` (runs in the background; builds today's pack first if there isn't one),
  `GET /api/desk-run` (`?date=`, `?summary=1`), `/index`, `/status`, `/roles`. Saved to `desk_run_<date>`.
  Service `deskRun` is **off by default** because each run is paid: about 12 calls. `SVC_DESKRUN=1` runs it at 06:55
  London on weekdays.
- **Page** `desk-run.html`: the Head's book (headline, tone, currencies, every instrument by group with its
  rating), then each analyst's report with its points, impacts and gaps. "Run now" starts a run.
- **Limits:** the data each analyst sees is still the pack's generic cut (§9). Hand-written slicers follow the first
  Railway pack audit. Nothing here is scored yet (§8).

## 9c. First Railway run, 2026-11-03 04:43 London

- **Pack:** 84 of 107 feeds usable, built in 171 s. Real gaps: fed-path 4 days old ("odds not loaded"), eod-review
  from Friday, rate-diff / rates-regime / RBNZ never fetched, trade-decision state empty for 7 of 8 pairs,
  gold-etf-flow and hmm/regimes empty, funding-read not built. **forward-track stopped on 2026-07-15** (zero forward
  signals since): the forward record is dead, not mis-dated. Eight feeds timed out at 45 s under load, so the
  timeout is now 90 s. `econ-surprise` was oversize; it now has a 400 KB allowance.
- **Run:** all 11 analysts failed. Sonnet 5 thinks before answering, thinking counts against `max_tokens`, and the
  3,000 cap ran out before any JSON was written; the retry repeated the same cap. Cost about $1.60, nothing usable.
  Fixed: caps of 16k (analysts) to 32k (Head), a cut-off reply is retried with twice the cap, and a per-task
  `effort` (medium for analysts, high for the Head) bounds the thinking.
- **Slices:** `js/deskSlices.js`, written from that pack's real payloads, cuts the analysts' data from 1.69 MB to
  0.38 MB (vol-forecast 210 KB → 15 KB with all 41 instruments). The budget inside each analyst is now shared fairly,
  so a big feed is not cut to an even split with a tiny one. Expected cost per Phase 1 run: about $1.

## 9d. Phase 2 as built (2026-11-03)

A full run (`POST /api/desk-run`, the page's **Run now**) is now: 11 analysts → **global debate** (Risk-On vs
Risk-Off: openings side by side, then each rebuts the other) → **Global Manager** ruling → **currency debate**
(Strengthen vs Weaken, each arguing all eight currencies, opening + rebuttal) → **Currency Manager** (bias per
currency and a strongest-to-weakest ranking) → **7 asset desks**, one per group, each given its instruments' own vol
lines, session, implied vol, swing map and trade-decision state, rating every instrument with a plan (zone,
invalidation, timing) → **risk desk** (Aggressive, Conservative and Neutral voices size the whole book, with vetoes)
→ **Head of Desk**, who adopts the rulings unless the evidence contradicts them and sets each card's size (0 to 1.5).

- About **32 calls** a full run (11 + 4 + 1 + 4 + 1 + 7 + 3 + 1); `?mode=quick` (the page's **Quick run**) is
  the Phase 1 path, about 12 calls. `rounds: 1` drops the rebuttals (4 fewer calls).
- **Deviation from §4, for cost:** the currency debate is 2 advocates arguing all eight currencies, not 16 separate
  advocates; the research manager and trader are one "asset desk" call per group, not two per instrument.
- **Failure rules:** each stage reads the stage above; a failed stage is recorded in `debate.failed` and the next
  stage falls back to the analysts' reports for that area. A failed rebuttal falls back to its opening.
- Roles: `risk_on`, `risk_off`, `global_manager`, `ccy_strengthen`, `ccy_weaken`, `currency_manager`, `asset_desk`,
  `risk_aggressive`, `risk_conservative`, `risk_neutral` in `desk/roles/`; schemas in `js/deskSchemas.js`.
- The page shows the debate: global ruling with both cases and the rebuttals, currency ranking with each
  currency's strengthen and weaken arguments, each asset desk's summary, and the three risk voices' adjustments.
- Estimated cost on Sonnet 5 at medium/high effort: about $1.50–2 a full run. Measure it from the first real run
  (the page footer and `/api/desk-run/index` show tokens and calls).

## 9e. First full run, 2026-11-03 06:55 London

- **Worked end to end:** 32 calls in 11.7 minutes, every debate stage succeeded, Head OK. Global ruling risk-off
  (liquidity gate BLOCKED on six indices, creditZ -2.85, HY wider); currency ranking USD > JPY > CAD > CHF > GBP >
  EUR > NZD > AUD; book 30 SHORT, 2 STRONG_SHORT, 3 LONG, 6 FLAT, with levels in the plans. The risk desk named the
  concentration ("one trade wearing twenty tickers"), vetoed AUDUSD (range spent) and trimmed for the US midterms.
  The Global Manager rejected a rebuttal that leaned on a tested null, which is what the evidence rules are for.
- **Cost:** 513,717 tokens in, 123,035 out, about $2.25 on Sonnet 5 (medium/high effort). Output was higher than
  estimated because of thinking.
- **Faults found:** the evidence clerk was lost to one dropped connection ("fetch failed"), so transient provider
  errors (network, timeout, 429, 5xx) now get one retry after a short wait; a 4xx does not. The page froze on a phone
  that had paused it, so it now re-checks when it becomes visible again. The level feeds had timed out in that
  morning's pack, which was built before the 90 s timeout shipped.

## 9f. Fixes after the first full run (2026-11-03)

- **RBNZ:** the RBNZ firewall blocks the server from its statement pages (HTTP 403 on every statement since July). The
  code does not work around that: the fix for full statements is an allowlist request to Servicedesk@rbnz.govt.nz.
  The news RSS does answer, and its titles carry each decision, so `/api/rbnz/decisions` gives the OCR path
  headline-only (Apr hold 2.25%, May hold 2.25%, Jul hike to 2.50%, Sep +25bp to 2.75%, Oct hold 2.75%). It is in the
  rates analyst's slice. Before this, the desk read NZD as "no catalyst".
- **Rate differentials:** not broken. The store is wiped on each deploy and refills within about two minutes; the
  04:43 pack ran just after a deploy.
- **Fed path:** not broken. The Atlanta Fed tracker publishes about two business days late; the fed funds futures leg
  (zq) is fresh nightly. Freshness allowance raised to 6 days.
- **Forward track:** the live record of the Pooled VuManChu Fade only refreshes when someone presses Refresh on
  forward-track.html; it was pressed once on 2026-07-15. Dropped from the pack, because a dead record misleads the
  evidence clerk. Scheduling it is the owner's call.
- **Price levels for every instrument:** `priceLadder` turns the vol forecast's lines (percent from the open) into
  prices: open, then up and down at p50/p75/p90. The asset desks are told to use them when no options wall,
  swing-map barrier or trade-decision zone exists. On the first run, 9 instruments had "no level in the reports".
- **Session open precision:** `anchor_open` was rounded to 2 decimals for every instrument (EURUSD 1.12 for
  1.11799, about 20 pips off), and js/levels.js builds its forecast levels from it too. It is now full precision.
- **Per-currency exposure cap** (`js/deskExposure.js`): plain arithmetic after the Head. Each card's signed size goes
  on the currencies it touches (a pair is long its base and short its quote; commodities and crypto count against
  USD; indices are left out). Over the cap (default 4 normal-size units, `DESK_EXPOSURE_CAP`), the cards on that side
  shrink in proportion. On the first run's book, USD was 8.95: the 16 USD-long cards would have been roughly halved.
  The page shows net exposure before and after, and each cut card shows its old size.

## 9g. Phase 3 as built: the desk edition of the newsletter (2026-11-03)

- **Side by side, never instead** (owner): the regular issue is untouched (still built on Atlas from measured rows,
  still the one sent). A full run now ends with a **newsletter writer** (`desk/roles/newsletter_writer.md`, deep tier)
  that writes the desk edition of The Chain from the desk book.
- **The voice is taken from the real issues:** the role holds the house rules (plain English, numbers with units and
  windows, a short "X, but Y" headline, a 3-5 sentence opening with UK times, one house label per section), and the
  run passes the headline and opening of the three latest regular dailies as examples (`styleExamples`).
- **The desk's views are labelled:** sections carry the house labels (an unknown label is read as "Untested
  interpretation"); views are the desk's untested reads; forecasting wording in the opening is flagged in the
  writer notes on the page. At most 8 ideas, each with view, size after the exposure cap, level and invalidation.
- **Saved beside the daily:** rendered in The Chain's look (`js/deskNewsletter.js`) and saved to
  `newsletter_archive_v1` as kind `desk`, id `desk-<date>`. It is never scored as a daily (scoring reads
  `kind === 'daily'` only), and the archive keeps 60 issues (was 40) so desk editions do not push dailies out.
  Atlas lists it as "Desk edition"; Desk Run shows the headline and opening with **Open the desk edition**, **Open
  today's regular issue** and **Compare side by side**.
- One more deep call per full run (about 33 calls in all).

## 9h. The desk edition, rebuilt as a full issue (2026-11-03)

The owner compared the first desk edition (one page of text) with the regular 24-page issue and rejected it: a desk
edition has to be a professional issue with charts, or it is not worth the run. So the desk edition is now **the
regular V3 issue with the desk's pages added**, built by the same builder from the same data:

- `js/newsletterDesk.js` draws four pages with the magazine's own parts (`barFigure` dark charts, `flatTable`,
  `guide` boxes, `tileRow`, evidence badges, flags): **D1** the global ruling, the case for and against with
  rebuttals, the desk's reading; **D2** the currencies ranked (a bias chart, then the ruling with the strongest case
  each way); **D3** where the desk leans (counts, a net-exposure-by-currency chart before and after the cap, the
  clearest ideas with size bars, and a **price-ladder chart** for each top idea: the open and today's p50/p75/p90 lines
  in price, the lean shaded); **D4** the risk desk's three voices, what could break the day, what the desk could not see.
- The cover takes the desk writer's headline and opening; the masthead says "Desk edition". The pages sit after
  Today by level.
- **The regular issue is byte-identical**: the builder only changes with `n.desk`. Checked by hashing the released V3,
  the previous layout and the weekly before and after the change.
- **Print hygiene:** model prose is cleaned for print (`prose`): source tags such as "(credit_funding: …)" removed,
  analyst ids and ledger shorthand turned into plain words, text cut at whole sentences, never mid-word.
- **Where it is built:** on Atlas, "Build daily newsletter" builds the daily and, when today's desk run exists, the
  desk edition beside it (saved as kind `desk`; the compare button becomes "Compare with the desk edition"). The run
  attaches each card's price levels so the ladders have real numbers. The server's text-only edition stays as a
  fallback and never overwrites the Atlas one.

## 9i. Runs survive a server restart (2026-11-03)

The owner pressed Run now at about 10:00 London. Merges to main at 10:14 and 10:35 redeployed Railway, which
killed the in-memory job. Nothing was saved, and the page still showed the 07:06 run.

- `js/deskRun.js` `checkpointed`: each stage that succeeds is saved as it finishes, under its label plus a hash of
  its exact task, system and prompt. A run started again finds a stage it has already finished and uses the saved
  result without a model call. Later stages read the earlier ones' outputs, so their prompts, and so their keys,
  come out the same. A changed role file or changed data misses the store and is asked again. Saved attempts keep
  their usage, because it was paid for. The run record carries `resumed: { stages }`.
- `server.js`: stages are saved to `desk_run_ckpt_<date>` (gzipped, whole store per save, saves in order).
  `desk_run_job` marks a run in progress. On boot (after 20s), a marked run for today is started again, at most 3
  times. A marker from another day, or one with no model key, is cleared. A checkpoint older than 6 hours is not
  reused. The checkpoint is cleared once the whole run is saved. A failed run keeps its checkpoint, so the next
  Run now pays only for what is left.
- `desk-run.html`: while running it says the run was picked up after a restart and how many stages were kept. The
  footer of a finished run says the same.
- Tested: `js/deskRun.test.mjs` cuts a run off after 15 calls, then restarts it on the same store. It asks only the
  remaining calls and produces the same book. A local server boot with a planted marker resumed the run and
  cleared the marker and the checkpoint.

## 9j. Two desk formats: the magazine and the brief (2026-11-03)

The owner read the 33-page desk edition (the regular issue with nine desk pages added) and asked for both a full and
a short format, under two buttons. The edition repeated the regular issue's own currency ranking (CHF first) beside
the desk's (JPY first), and a forced page break after every section left half-blank pages.

- **Desk magazine** (`deskMode: 'magazine'`, archived as kind `desk`). The cover with the writer's headline,
  then top down: the global ruling, the backdrop table, the currencies ranked, one page per asset group
  (`groupPages`: the asset desk's reading, every card with view, size, why, plan and wrong-if, and a price ladder
  for each card with a lean), the book, the risk desk, releases to come, what happened. It leaves out the regular
  currency table and the pair-by-pair page, which would contradict the desk. 17 A4 pages on the 13:08 run.
- **Desk brief** (`deskMode: 'brief'`, archived as kind `desk-brief`). The cover, then one read (`deskBrief`):
  the tone and the strongest and weakest currencies, the ruling, the currency bars, the six clearest ideas with
  four ladders, what could break the day, and what the desk could not see. 4 pages.
- Desk pages flow on in print (`.pg.pgflow`: no forced break, cards and boxes kept whole, a table header kept with
  its first row). Ladders sit in an inline grid that breaks between rows.
- Atlas: "Desk magazine" and "Desk brief" buttons, each with a PDF button. The compare view shows the magazine
  beside the regular issue. Neither format is scored.

## 9k. Phase 4 as built: scoring and memory (2026-11-03)

The prereg is `forge/DESK_ANALYST_PIPELINE_PREREG.md`, pushed before any scoring code existed. Amendment A1 fixes the
entry and exit windows. §8's first sketch is narrowed to what can be scored honestly every day:

- **What is scored** (`js/deskScore.js`). Each live card (LONG or SHORT, either strength) from 08:00 to 21:00 London
  on OANDA M1. The unit is the day's own forecast p50 distance (u). The scored cell, H1, is the size-weighted day
  score against a within-day shuffle placebo, with a both-halves gate.
  - Eligible days: books written before 08:00 London. A manual run later in the day is scored but does not count.
  - Secondary cells, BH q 0.10:
    - H2: a **single-prompt control**, one analyst on the same pack (`desk/roles/control_single.md`), which runs
      in every full run after the book and never sees it.
    - H3: conviction.
    - H4: the p50 race.
    - H5: long-everything drift.
- **Against what.** The single-prompt control is §8's "current single prompt", run on the same pack so the inputs
  match. "Engines alone" was dropped: no engine rates all 41 instruments.
- **Keeping the right book.** The first eligible run of each day is kept in `desk_run_elig_<date>`, so a later manual
  run cannot replace it. Every run records `rolesHash`, so results can be read by role-file version. The desk is
  scored as operated.
- **Memory (layer 5)** (`js/deskReflect.js`, `desk/roles/reflection.md`).
  - After the score, a reviewer writes the post-mortem: what worked, what failed, up to five lessons and what to
    watch.
  - The next mornings' evidence clerk reads the last five through the Desk Pack feed `desk-memory`.
  - Every lesson is labelled a one-day anecdote; none is evidence.
- **Server.** Service `deskScore` (on) scores after 21:10 London on weekdays, makes ~41 M1 fetches and one small
  model call, and writes `desk_run_score_<date>`, `desk_run_score_index` and `desk_run_reflect_<date>`. Routes:
  `/api/desk-score`, `/api/desk-score/record`, `/api/desk-memory`, `POST /api/desk-score/run?date=`.
- **Page.** desk-run.html shows a "Track record · interim, not judged" panel: the running mean with its interval,
  vs the control, vs drift, the race share, the day's movers and the evening review.
- **Judging.** At day 20, amendment A2 records the placebo's SD, the MDE and N_req. The test is judged at
  max(120, N_req) counted days, or closes UNDERPOWERED on 2027-12-31.

## 9l. The review in the issues: "Yesterday, reviewed" and the evening edition (2026-11-03)

The owner asked for the evening review to reach the reader, in both forms.

- **"Yesterday, reviewed"** (`reviewPage` in `js/newsletterDesk.js`) is the first page after the cover in the
  desk magazine and the desk brief. It shows:
  - last night's day score, beside the single analyst and the race
  - a bar figure of the cards that moved the day (size × score)
  - what the book got right and wrong
  - the lessons, labelled as one-day anecdotes
  - what was carried into today
  - the interim running record

  Atlas reads `/api/desk-score` and `/api/desk-score/record` when it builds the issue, and only uses a day before
  today.
- **The evening edition** (`js/newsletterEvening.js`, `desk/roles/evening_writer.md`). After the score and the
  review (21:10 London), one more model call (task desk-head) writes the day top down: the global picture against
  the morning ruling, the currencies, what moved, the book against the day, and into tomorrow. It writes only from
  the day's measured moves (08:00 to 21:00 London, % and u, every market), the morning's rulings and risks, the
  score and the review. It never invents a cause.
  - Rendered in the issue's look: a cover with tiles; every market in a table plus a figure per asset group with
    the book's view on each bar; then "The book against the day".
  - Saved to the archive as kind `desk-evening` (`desk-evening-<date>`), never scored. The archive keeps 100
    issues now.
  - The Desk Run track-record panel links to it, and the Atlas archive labels it "Desk evening".

## 11. Roadmap: Phase 5 onwards (owner, 2026-11-03: "love them all")

Not built yet. The order is the owner's call; each item names what it needs first.

**Agents**
- **Phase 5 · Session updates.** A cheap quick run at the London open (08:00) and the New York open (14:30). It
  reads what changed since the morning book (prices against the lines, new releases, the risk flags) and updates
  only the cards it must, saying why. Never scored as a new book; logged against the morning one.
- **Phase 6 · Event agent.** A short brief before each high-impact release, from the desk's own history of how that
  release moves each market (the event-window and release-history feeds). It covers what is priced, how big a
  surprise usually moves things and how fast. It never gives a direction for the surprise. It feeds the newsletter's
  "releases to come".
- **Phase 7 · Red team.** A reviewer that attacks the Head's book before it is published: crowding (one bet across
  many names), stories that contradict each other, leaning on tested-null ideas, cards that ignore an event inside
  the window. The Head answers or changes the card. Logged, so the record shows whether the red team helps.
- **Phase 8 · Journal coach.** Reads the owner's actual MT5 trades (the bot trade logs) against the book: where they
  followed it, where they went against it, and how each did. Private, weekly.
- **Phase 9 · Theory desk (quant theory agent).**
  - Reads the Evidence Book, the research register (including dead hypotheses), the Theory Lab lessons,
    `education/quantconnect_strategies.md` and `quantconnect_blogs.md`, *151 Trading Strategies*, the SSRN reading
    list (`education/papers/open/READING_LIST.md`), and the desk's own scored history from Phase 4.
  - Proposes testable theories about the system's output in the research-director's form: construct a variable,
    condition on it, sweep the horizons, and read the outcome against a benchmark and a placebo.
  - Screens each one against what has already been tested, and hands it to the research protocol for a prereg.
  - It proposes and designs; it never declares a result.
  - Weekly, not daily. It works best once Phase 4 has some months of scored days.

**Built since this list was written:** the evening edition (§9l).

**Build items**
- **Daily schedule.** The owner sets `SVC_DESKRUN=1` for the 06:55 run once a fresh-pack run has been read. Without
  it, only books written before 08:00 count in the test.
- **Day-forecast writer** (Phase 3's remaining writer): the day as a range bucket, a trend or range day, and the
  session shape, beside the newsletter.
- **Prompt caching** on the shared pack slices, which could cut the cost of a run by roughly a third.
- **Slow feeds:** asia-today, daily-open-fib, weekmap, forecast-path and three swing maps time out in the pack build.
  Each needs a cache or a cheaper route.
- **Forward-track refresh:** schedule it, or keep it out of the pack (§9f).
- **RBNZ full statements:** ask the RBNZ service desk (Servicedesk@rbnz.govt.nz) to allowlist the server.

## 10. Owner decisions (2026-11-03)

1. **Rating scale:** the five-step scale (§4, Layer 3).
2. **Newsletter:** side by side with the current one, keeping its style; the owner checks the content before anything
   is replaced (§4, Layer 4).
3. **Instruments:** all 41 instruments in the vol forecast (§4, Layer 1).
