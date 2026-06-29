# Telegram Alerts, Levels, Confluence & Entry Grading — How It Works

> The live decision pipeline that turns Fibonacci/session levels into a **graded
> trade** and pushes it to Telegram (and to the MT5 bot). This is the *production*
> companion to `ENTRY_ZONE_CONFIDENCE.md` (which documents the OOS-validated
> *research* engine for the same three questions). Read this to understand what
> the bot is actually trading on today, where the bodies are buried, and how to
> bring it onto the Lego baseplate.
>
> Scope: `alerts.js`, `signal.js`, `confluences.js`, `confluence-core.js`,
> `trade-grade.js`, `entryGradeCore.js`, `rangeBiasCore.js`, `range-bias.js`,
> root `levels.js` (server), `js/levels.js` (dashboard), `cron-worker/cron-worker.js`,
> `bot/main.py`. Companions: `CONFLUENCE_LIVE_VS_BACKTEST.md`, `LEGO_MODULES.md §3`.

---

## 0. TL;DR — the one thing to know

The same trade is graded by **two independent code paths with different formulas**,
both of which write the **same KV key** (`ai_entries_<PAIR>`) that the Telegram
bot trades from:

| | **Server path** (root `levels.js`) | **Browser path** (`alerts.js` → `signal.js`) |
|---|---|---|
| Runs | Railway, every 30 min, always-on | Only while a dashboard tab is open, every ~5 min |
| Confluence | `confluence-core.detectConfluencesCore` | `confluences.enhanceConfluences` (richer) |
| Star count | `entryGradeCore.computeStars` (1 + 5 flags) | `enhanceConfluences` structural+confirmation stack |
| Range bias | `rangeBiasCore` — **5** features | `range-bias.js` — **7** features |
| Signal score | `entryGradeCore.computeSignalScore` (**38/25/25/12**) | `signal.js computeSignalScore` (**Bayes 30 / HMM 20 / Tier 25 / RB 15 / Struct 10**) |
| Grade | `trade-grade.gradeEntry` ✅ same | `trade-grade.gradeEntry` ✅ same |
| Entry gate | any directional confluence (no quality floor) | `totalStars ≥ 2` **and** `rr ≥ 0.8` |
| `signalAligned` means | `signalScore ≥ 50` | macro bias == direction |

Only the **final grader** (`gradeEntry`) is genuinely shared. Everything that
*feeds* it — the levels, the stars, the range-bias conviction, the 0–100 signal
score — is computed by **different, drifted code** depending on which path last
wrote the key. This is the central finding and the main thing the Lego refactor
should fix (it is the live half of `LEGO_MODULES.md §3 drift #8`).

---

## 1. The three surfaces

There are three distinct pieces of code in this area; do not confuse them.

```
                    ┌─────────────────────────────────────────────┐
                    │  SERVER  root levels.js  (Node, Railway)      │
  OANDA M5/M30/D ──►│  refreshAllPairs() every 30 min               │
                    │  confluence-core → bricks → gradeEntry        │──┐
                    └─────────────────────────────────────────────┘  │
                                                                       ├──► KV  ai_entries_<PAIR>
                    ┌─────────────────────────────────────────────┐  │     (whoever wrote last wins)
  SSE price ticks ─►│  BROWSER alerts.js → signal.js (dashboard)    │  │
                    │  checkAndSendAlerts() every ~5s (throttled)   │──┘
                    │  enhanceConfluences → runEntryScanner →       │
                    │  gradeEntry → KV + browser proximity Telegram │
                    └─────────────────────────────────────────────┘
                                          │ reads KV
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                              ▼
        cron-worker/cron-worker.js                      bot/main.py
        (server-side proximity → Telegram)              evaluate_pair_telegram
        minGrade / proxPips / cooldown                  grade≥min, stars≥min,
                                                        signalScore≥thr, prox → MT5 order

        js/levels.js  ── "Entry Lens" dashboard page. Display ONLY: renders
                         zones + ACT/WATCH/WAIT/AVOID verdicts. No KV, no grade,
                         not read by the bot.
```

**Why two writers of one key?** On Railway the browser's `/api/kv/set` for
`ai_entries_*` is routed to a *local file* that the server `levels.js` then
overwrites (see the comment at `alerts.js:359-361`). So in production the
**server `levels.js` is effectively authoritative** for what the Python bot
trades, while the browser path drives the **browser-tab proximity alerts** and the
`ai_decision_meta_*` / `arima_price_*` side-channels. That this is decided by
*deploy plumbing* rather than by design is itself a smell (§7).

---

## 2. Levels — where a line comes from

A "level" is a price where **today's Fibonacci grid agrees with yesterday's**
(Asia session) or **this Monday's agrees with last Monday's** (Monday range).

### 2a. The shared detector — `confluence-core.js` (Tier-1 brick ✅)
`detectConfluencesCore(todayLevels, yesterdayLevels, opts)`:
1. Cross-product every today-fib × yesterday-fib; keep pairs within
   `effectiveDist` (Pine-faithful cap: `min(normalDistance, range × 0.25 × 0.5)`).
2. `isTight` if the pair is within `tightDistance` **or** both sides are the same
   fib ratio.
3. Cluster pairs within `mergeDistance` → one level at the average price, carrying
   `density` (how many pairs collapsed) and `isTight`.

`mergeCrossSessionConfs(asia, monday, opts)` then merges Asia + Monday lists;
overlaps become `source:'cross'` with `crossSessionMatch:true`.

This brick is imported by the dashboard, the Pine export, the backtest **and** the
server `levels.js` — it is the one genuinely-shared piece of level math.

### 2b. The browser enhancer — `confluences.js` (NOT shared, much richer)
`enhanceConfluences(confluences, price, bias, pivots, volRegime, macroScore, keyLevels)`
takes the raw cluster list and, **per level**, computes:
- **Direction** via `directionFromPrice` + **polarity-flip** override
  (`detectPolarityFlip` → "🔄 Role Reversal" when N candles close through it).
- **Matches**: pivot, OI call/put wall / max-pain / gamma-flip (strength-weighted),
  retail clusters (Myfxbook), daily opens, daily-Fib, structural-Fib, **PDH/PDL**,
  **PWH/PWL**, oscillator **divergences** (RSI daily + WaveTrend 5m).
- **`structuralStars`** (level quality) and **`confirmationStars`** (alignment),
  plus crowding adjustment, summed and **capped at 5**.
- **SL** = nearest adverse confluence + buffer, capped at `slMaxAtrMult × ATR`;
  **TP** = next confluence in-path or `2.2R` (session levels) / `volRegime.tpMult`;
  `rrRaw`, `poorRR`, `tpFibRisk`.

The server `levels.js` does **none** of this — it uses `computeStars` (5 flags) and
ATR-multiple SL/TP only. So a "4★" alert from the server and a "4★" alert from the
browser are not the same object.

---

## 3. The confidence stack — stars, range-bias, signal score

Three layers feed the grade. Each exists in **two drifted variants**.

### 3a. Stars (structural quality)
- **Server** `entryGradeCore.computeStars` — `1 + isTight + density≥2 + density≥3 +
  crossSessionMatch + pivotMatch` (max 6, capped 5).
- **Browser** `enhanceConfluences` — the rich `structuralStars + confirmationStars`
  stack above (OI, PDH/PWH, divergences, daily-open count, retail, …), then
  `runEntryScanner` layers **more** on top (signal alignment, OI walls, range
  boundaries, EMA21, WaveTrend, range-bias) into `totalStars` (capped 5).

### 3b. Range-bias conviction (intraday regime agreement)
Both compute `conviction = (confirm − conflict) / total ∈ [-1,1]`, but from
**different feature sets**:
- **Server** `rangeBiasCore.computeRangeBiasServer` — **5** features: `ADX`,
  swing CHoCH/BOS, TWAP slope, EMA20/50+RSI14, Hurst. (Shared with the
  Asia-range backtest ✅ — this is the one feature-brick that is genuinely
  reused live↔backtest.)
- **Browser** `range-bias.js computeRangeBias` — **7** features (the 5 above plus
  more), returning `{confirmCount, conflictCount, conviction, maxPts, results}`.

### 3c. Signal score (0–100) — **the biggest drift**
| | Server `entryGradeCore.computeSignalScore` | Browser `signal.js computeSignalScore` |
|---|---|---|
| HMM regime | 0.38 (no-FRED) / 0.25 (FRED) | 0.20 |
| Bayesian bounce | — *(not used)* | **0.30** |
| Macro tier | 0.25 (FRED only) | 0.25 |
| Momentum (EMA/RSI) | 0.25 / 0.20 | — *(folded into stars)* |
| Range bias | 0.25 / 0.20 | 0.15 |
| Structural | 0.12 / 0.10 | 0.10 |

These are **structurally different models** (the browser leans on a Bayesian
continuation probability the server never computes; the server leans on a
momentum component the browser doesn't score). The same setup can be "68%" on one
path and "55%" on the other — and the grade thresholds in §4 are calibrated to a
single number.

---

## 4. Grading — `trade-grade.js gradeEntry` (the one shared grader ✅)

Inputs: `signalScore`, `rangeBias` conviction, `tags` (Dense/Cross/Tight), HMM
regime, 30m swing regime, `rrRatio`. Output: `{grade, verdict, reasons, warnings,
hardStop}`.

**Hard stops (→ SKIP):** HMM trend opposing with `trendProb > 0.82`; range-bias
`conviction < -0.45`.

**Grade ladder (after warnings/reasons are tallied):**
| Grade | Condition | Verdict |
|---|---|---|
| `A+` | `score ≥ 72` **and** `conviction ≥ 0.10` **and** `warnings == 0` | TAKE |
| `A`  | `score ≥ 60` **and** `warnings ≤ 1` | TAKE |
| `B`  | `score ≥ 46` | WATCH |
| `C`  | `score ≥ 30` | CAUTION |
| `D`  | `score < 30` | SKIP |
| `SKIP` | any hard stop | SKIP |

**R:R gate (post-hoc):** `rr < 1.0` demotes A/A+ → B (+"below breakeven" warning);
`rr < 1.5` demotes A+ → A. (A+ therefore *requires* ≥1.5R.)

Warnings come from: opposing HMM/30m structure, weak signal (`<38`), range-bias
conflict (`conviction < -0.25`), "Dense zone — absorption risk". Reasons from:
aligned trend, strong/moderate signal, range-bias confirm, Cross-session, Tight
Fib, "Dense zone — reversal".

This is the correct Lego shape: a pure `score → choice` selector, no data fetch,
golden-tested. The problem is not the grader — it is that its **input `score` is
not computed the same way by its two callers** (§3c).

---

## 5. Entry vs non-entry

| | Server `levels.js buildEntries` | Browser `signal.js runEntryScanner` |
|---|---|---|
| Direction | price vs current ± half-pip; else **dropped** | inherited from `enhanceConfluences` direction |
| Quality floor | **none** — every directional confluence is emitted | `totalStars ≥ 2` |
| R:R floor | none (fixed 2.2R always) | `rr ≥ 0.8` unless `tpCapped`; `rr < 1.0` → size capped 25% |
| Result | a *superset* of weak + strong levels | pre-filtered to tradable quality |

So the server emits everything and pushes all selectivity **downstream** to the
consumers (§6), whereas the browser pre-filters. Net effect: the bot's selectivity
depends on which producer wrote the key **and** on the consumer's config — two
knobs where there should be one.

---

## 6. Telegram alerts & trading-on-config

### 6a. Browser alert engine — `alerts.js checkAndSendAlerts()`
Per tick (5s throttle): for each watched pair, rebuild entries (5-min cache),
KV-sync (5-min throttle), then proximity-check each cached entry:
- skip if `GRADE_ORDER[grade] < GRADE_ORDER[minGrade]` (default `B`),
- skip if `cfg.onlyAligned && !signalAligned`, or `direction == null`,
- skip if `dist > proxPips` (default 5p; gold 8; NAS 30),
- skip if within `cooldownMin` (default 60) for that `sym_price_dir` key,
- **DecisionEngine gate**: compute PERMITTED/NOT-PERMITTED for the direction;
  if `suppressBlocked` and not permitted → log + skip; else fire.
- `sendTelegramAlert` formats price/dir/grade/SL/TP/R:R + Bayesian %, tier
  agreement, 5m Kalman σ, ARIMA stability, range-bias, opposing-1m-HMM, decision line.

It also fires **macro-context** alerts (separate cooldown stores): gold macro
regime/signal/transition/uncertainty (`checkGoldMacroAlerts`), FX structural
regime flips (`checkFXMacroAlerts`), FX daily-tone shifts (`checkFXDailyToneAlerts`),
and a "snapshot all" combined message (`sendAllMacroSnapshotsNow`). Config is
browser-local in `localStorage['tg_alert_cfg']`, mirrored to KV `ai_alert_cfg`.

### 6b. Server alerter — `cron-worker/cron-worker.js`
Reads `ai_entries_<PAIR>` from KV, applies the **same** grade/proximity/cooldown
filters (`minGrade` default B, `proxPips`) and fires Telegram server-side — this is
what runs when no browser tab is open.

### 6c. The MT5 bot — `bot/main.py evaluate_pair_telegram`
"Telegram mode" bypasses the module pipeline and trades the graded entries
directly. Gate (`resolve_grade_thresholds(exec_cfg)`):
`grade ≥ min_grade` **and** `totalStars ≥ min_stars` **and** `signalScore ≥
min_signal` **and** `direction` set **and** `price within ATR proximity`. Best
candidate = highest stars, then highest `signalScore`; order comment carries the
grade + stars. So **the grade and signalScore directly size and select live MT5
orders** — which makes the §3c score drift a real-money correctness issue, not a
cosmetic one.

---

## 7. Findings — the drift to retire (live half of `LEGO_MODULES.md §3 #8`)

1. **Two `ai_entries` producers, one key.** Server `levels.js` and browser
   `alerts.js` both write it with different math; "last writer wins" is decided by
   deploy plumbing, not design. ⇒ The bot can trade a server-graded entry while
   the browser shows a browser-graded one for the same level.
2. **Two signal-score models** (§3c) feeding one set of grade thresholds. This is
   the highest-leverage bug: `signalScore` selects and sizes live orders (§6c).
3. **Two range-bias feature sets** (5 vs 7) → different conviction → different
   A+/hard-stop decisions.
4. **Two star formulas** → "★★★★" is not comparable across paths.
5. **Two confluence engines** (rich `enhanceConfluences` vs lean `computeStars`)
   → different level lists and SL/TP for the same pair.
6. **`signalAligned` overloaded** — `score ≥ 50` (server) vs `bias == direction`
   (browser). The `onlyAligned` alert filter and the bot's reads therefore mean
   different things per path.
7. **None of the live `score`/`stars`/`conviction` is OOS-validated** the way
   `ENTRY_ZONE_CONFIDENCE.md`'s engine is. Confidence is a hand-weighted 0–100
   heuristic; the research engine measures confidence in **after-cost expectancy**.

---

## 8. Suggestions — bring it onto the Lego baseplate

Ordered by leverage. Every step is **equivalence-first then A/B on the KV path**,
per `CLAUDE.md` (it changes live behaviour, so highest caution; ship the A/B card,
not just the new curve).

### S1 — One signal-score brick (kills finding #2). *P0.*
`entryGradeCore.computeSignalScore` already exists and is the shared brick the
registry *claims* is live. Make `signal.js computeSignalScore` a **thin caller of
it**: map the browser's Bayes/HMM/tier/RB/struct inputs onto the brick's
`{hmmScore, momScore, rbScore, structScore, macroScore}` contract (decide where
the Bayesian term lives — either add it as a named component to the brick, or feed
it as `momScore`). Golden-test that the chosen blend reproduces the *intended*
number, then A/B the grade distribution on stored `ai_entries`. Outcome: one
0–100 definition, both paths identical.

### S2 — One range-bias brick (kills #3). *P0.*
Collapse `range-bias.js computeRangeBias` (7) and `rangeBiasCore.computeRangeBiasServer`
(5) to a **single parameterised brick**: `computeRangeBias(ctx, {features:[…]})`.
The extra two browser features become opt-in entries in the feature registry, not a
fork. `rangeBiasCore` is already shared with the backtest, so promote *it* and
retire the browser copy. Per Lego Principle 2 (one primitive, parameterised).

### S3 — One star/structural brick (kills #4). *P1.*
The rich `enhanceConfluences` star logic is a Tier-2 concern (it consumes level
sources). Express both star formulas as one selector over a **`Level[]`** from
`levelSources.js`: `computeStars(level, {sources})` where the server simply passes
fewer sources. This also lets the chart viewer and the scorer read the same stars
(the `levelSources` contract is built for exactly this — `LEGO_MODULES.md §1c`).

### S4 — One confluence path (kills #5, the core of drift #8). *P0, highest care.*
Make the browser's `enhanceConfluences` *consume* the shared
`confluence-core.detectConfluencesCore` output (it already does, indirectly via
`S.asiaRangeData`); the real work is making the **server** `levels.js` reuse the
enhancement layer (PDH/PWH/OI/divergence/SL-TP) rather than its lean stand-in — or
explicitly deciding the lean set is the canonical one and deleting the rich
divergence. Either way: one level→entry function, parameterised by "rich vs lean
context", not two files.

### S5 — Collapse the two producers to one (kills #1, #6). *P1.*
Pick **one** authoritative `ai_entries` writer (the always-on server `levels.js` is
the natural choice) and have the browser path *render from the same computed
entries* instead of recomputing them. The browser keeps only what is genuinely
browser-local (DecisionEngine permission, proximity timing, the side-channel KV
writes). Define `signalAligned` once. This removes the "last writer wins" hazard
entirely.

### S6 — Make the **confidence** decision honest, per `ENTRY_ZONE_CONFIDENCE.md`. *P1, the real prize.*
The research engine answers the *same three questions* (zone / direction /
confidence) but gates on **after-cost expectancy** with a true IS/OOS split and a
≥30-trade floor — and found that the **pre-day** score is dead while the
**approach velocity at the touch** is the live edge. The live grader currently
ignores both lessons: it has no expectancy gate and no approach feature.
Concretely:
  - **Add an expectancy gate to `gradeEntry`** (or a wrapper selector): keep a
    grade only if the *historical* after-cost expectancy of that
    `grade × pair × condition` cell clears the spread by a margin — the exact fix
    that turned the research book from −818% to profitable. `winrate.js`/
    `touchFeatures.js` already hold the raw material.
  - **Feed `approachVel`** (from `touchFeatures.js`, the OOS winner) into the live
    score as a first-class component — it is computable at the moment the proximity
    alert fires.
  - **Validate the live grade the same way**: run the stored `ai_entries` through
    `gateAnalysis.compareGates` to prove the grade actually adds OOS edge before
    trusting it to size MT5 orders. Today it is asserted, not measured.

### S7 — Registry hygiene. *P2.*
Update `LEGO_MODULES.md`: the claim that `entryGradeCore`/`rangeBiasCore` are
"wired into `levels.js` ✅" is true for the **root** server `levels.js` but the
**browser** path (`signal.js`/`range-bias.js`) still runs forked copies — record
that as an open drift in §2/§3 so the next person doesn't assume it's closed.

---

## 9. Appendix — file & function map

| File | Role | Key exports |
|---|---|---|
| `confluence-core.js` | Tier-1 shared level detector | `detectConfluencesCore`, `mergeCrossSessionConfs` |
| `confluences.js` | browser level enhancer (rich) | `mergeCrossSources`, `filterConfluences`, `enhanceConfluences`, `detectCrossSessionClusters` |
| `signal.js` | browser macro bias + entry scanner | `runSignalEngine`, `runEntryScanner`, `computeSignalScore` |
| `range-bias.js` | browser range-bias (7 features) | `computeRangeBias` |
| `rangeBiasCore.js` | shared range-bias (5 features) ✅ | `computeRangeBiasServer`, `feature*`, `computeWeeklyPivots` |
| `entryGradeCore.js` | shared stars + signal-score brick ✅ | `computeStars`, `computeStructScore`, `computeSignalScore` |
| `trade-grade.js` | the one shared grader ✅ | `gradeEntry` |
| `levels.js` (root) | **server** 30-min grader → KV | `refreshAllPairs`, `refreshPair`, `buildEntries` |
| `js/levels.js` | "Entry Lens" dashboard (display only) | `buildZones`, `boot` |
| `alerts.js` | browser alert engine + KV sync | `checkAndSendAlerts`, `sendTelegramAlert`, macro/gold/FX alerts |
| `cron-worker/cron-worker.js` | server-side proximity Telegram | proximity loop over `ai_entries_*` |
| `bot/main.py` | MT5 execution from graded entries | `evaluate_pair_telegram` |

**KV keys:** `ai_entries_<PAIR>` (entries + meta), `ai_decision_meta_<PAIR>`,
`arima_price_<PAIR>`, `ai_goldmodel`, `ai_alert_cfg`, `caps`, `fred_data_v3`.
