# Desk Analyst Pipeline: design

*Started 2026-11-03 on branch `ccr-4824155b-3im5ze`. Register row: `desk-analyst-pipeline`. Status: Phase 0 built.*

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

## 7. Phases

| Phase | Builds | Done when |
|---|---|---|
| **0** | Desk Pack: feed registry, daily build 06:40 London, gaps and freshness, saved per day | **built**: `js/deskPack.js`, `/api/desk-pack*`, service `deskPack` |
| 1 | Role files + schemas; Layer 1 analysts on real slices (hand-written slicers replace the generic cut); Head of Desk reading analysts only; Atlas panel | a full morning runs end to end; every report validates; gaps quoted |
| 2 | Layer 2 top-down debate + Layer 3 trader and risk desk; debate visible as expandable sections | currency views and instrument cards produced daily |
| 3 | Layer 4 writers (newsletter first, then day forecast, directional, ideas, risk) | the newsletter is written from the pipeline |
| 4 | Layer 5 memory + grading; the pre-registered comparison (§8) starts counting | first graded month |

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

## 10. Owner decisions (2026-11-03)

1. **Rating scale:** the five-step scale (§4, Layer 3).
2. **Newsletter:** side by side with the current one, keeping its style; the owner checks the content before anything
   is replaced (§4, Layer 4).
3. **Instruments:** all 41 instruments in the vol forecast (§4, Layer 1).
