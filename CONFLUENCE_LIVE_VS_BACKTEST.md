# Confluence Engine — Live vs Backtest Gap Analysis

> Companion to `LEGO_MODULES.md` known-drift **#8**. The index.html level cards
> and the Telegram bot run on a **different confluence engine** than the
> Asia-range backtest. This documents *exactly* how they differ, so the gap can
> be closed deliberately (one shared brick, equivalence-first, A/B'd on data)
> rather than assumed away. **Read this before "unifying" or deleting either side.**

Generated from a read-only trace (file:line evidence inline). Nothing was changed.

---

## 0. TL;DR

| | **LIVE** (cards + Telegram) | **BACKTEST** (asia-range) |
|---|---|---|
| Entry point | `levels.js` → `ai_entries_{PAIR}` (KV) | `asiaRangeEngine.js` → `/api/asia-range-backtest` |
| Confluence matcher | `js/confluence-core.js` `detectConfluencesCore` | `asiaRangeEngine.js` **local** `detectConfluence` (does *not* import confluence-core) |
| What "confluence" means | today's fib ≈ **prior-session** fib, **clustered** (density), + **cross-session** Asia↔Monday merge | today's fib ≈ prior-session fib (no clustering), cross-align flagged separately |
| What ranks a level | `signalScore` = **HMM + macro + range-bias + structural** blend → stars + A/B/C grade | **16 structural modules** hit-score (volume profile, swing S&R, naked POC, PDH/PDL…), optional WT gates |
| Consumers | `cron-worker.js:51`, `bot/main.py:1005`, `bot/modules/macro_regime.py` | the backtest UI/report only |

**The punchline:** the live grade is driven mostly by **HMM + macro + range-bias**
(which the backtest never scores), while the backtest selection is driven by a
**16-module structural stack** (which the live path never computes, beyond a few
overlapping range-bias factors). They share only the fib-vs-prior-fib core,
Monday cross-align, and pivots/PDH-PDL. **So the Asia-range backtest is not a
faithful test of what fires on your phone.**

---

## 1. The two pipelines

### Live (`levels.js` → `ai_entries` → Telegram)
1. Fetch OANDA M5/M30/D1 (`levels.js:770-774`).
2. HMM daily regime (`hmm.js fitHMM`) + 30m swing regime (`compute30mSwingRegime`).
3. Extract Asia (5m bodies, 00:00–06:00 London) + Monday (30m) sessions; project 45 fibs.
4. **Confluence:** `detectConfluencesCore` (today vs yesterday fibs) →
   `mergeCrossSessionConfs` (Asia↔Monday) — `confluence-core.js:25-181`.
5. **Range-bias features:** 5 server-side (`levels.js:401-510`: ADX, swing CHoCH/BOS,
   TWAP slope, EMA20/50+RSI, Hurst); browser shows the full **15-factor** suite
   from `js/range-bias.js` (Range Position, COT, Wick Rejection, WaveTrend+MF,
   Order Block, H1 EMA, Retail Sentiment, Weekly Pivots, FVG, WTI, Ichimoku…).
6. **signalScore (0–100)** = weighted blend (`levels.js:583-607`):
   HMM 38% · momentum 25% · range-bias 25% · structural 12%
   (with FRED: HMM 25 · macro 25 · rb 20 · mom 20 · struct 10).
7. **Stars (1–5)** = 1 + isTight + density≥2 + density≥3 + crossSessionMatch +
   pivotMatch (`levels.js:661-674`).
8. **Grade** A+/A/B/C/SKIP via `trade-grade.js gradeEntry` (score thresholds
   72/60/46/30 + range-bias conviction + R:R gates).
9. SL = ATR×1.25, TP = 2.2R. Write `ai_entries_{PAIR}` (`levels.js:838`).

### Backtest (`asiaRangeEngine.js` → `/api/asia-range-backtest`)
1. Load packed M1 (`loadM1ForPair`); build per-pair caches.
2. Asia (5m bodies) + Monday (15m) ranges; project fibs (`calcFibs`).
3. **Confluence:** local `detectConfluence(currFibs, prevFibs, threshold, tight)`
   — `asiaRangeEngine.js:135-148`. Cross-session via a separate `crossAligned`
   flag, **not** the live merge.
4. **levelSource** (asia/monday/both) × **levelFilter** (tight/confluence/asia_monday/all)
   select candidates; zone gate (outside Asia range).
5. **Score:** `runModuleChecks` over **16 modules** → `score = Σ(weight·hit)/Σweight`
   (`confluenceModules.js:1157-1181`); `minConfluenceScore` gate or priority top-N.
6. **WT gates:** optional WaveTrend OB/OS and/or divergence (`asiaRangeEngine.js:479-519`).
7. Simulate limit fill (`walkLimitOrder`, SL-before-TP pessimistic); record ~50 fields.

---

## 2. Where they actually diverge

| Dimension | Live (`confluence-core`) | Backtest (`asiaRangeEngine`/`confluenceModules`) | Impact |
|---|---|---|---|
| **Fib match distance** | `min(normalDist, sessionRange×0.25×0.5)` — capped by range | ✅ **ALIGNED** — backtest now calls `confluence-core.detectConfluencesCore` with `sessionRange` (was: `confluenceThreshPips×pip`, no cap) | closed |
| **Clustering / density** | clusters raw pairs (`mergeFactor 0.30`) → `density` feeds stars | ✅ **ALIGNED** — same clusterer; each fib now carries `density` (was: none) | closed |
| **Cross-session** | `mergeCrossSessionConfs` → `crossSessionMatch` (a star) | ✅ **ALIGNED** — Monday is now its own strategy (Monday vs prev-Monday); cross-merge is an opt-in `crossSessionMerge` overlay flagging `crossAligned` | closed |
| **What scores the level** | HMM + macro + range-bias + structural blend | ✅ **ALIGNED (recorded)** — backtest now computes `live_stars` / `live_signal_score` / `live_grade` per trade via the SAME shared code (hmm.js, rangeBiasCore, entryGradeCore, trade-grade.js); the 16 module score remains as an extra structural layer | closed* |
| **Structural sources** | a few via range-bias (pivots, FVG, Ichimoku…) | 16 dedicated modules incl. **naked POC, VAH/VAL, swing S&R, vol-forecast HL75, SMI** — richer | backtest still *has more* structural detail; live grade is now also recorded |
| **Regime/macro** | HMM regime + FRED macro drive the grade | ✅ HMM now computed in the backtest (shared `hmm.js`); ⚠ **macro/COT/retail-book omitted** (no history) | mostly closed |
| **Round numbers** | range-bias / pivots | module: 1000-pip major / 100-pip minor grid | (a third grid exists in `levelSources` — 100/50-pip) |
| **Confirmation** | none (grade is the filter) | WaveTrend OB/OS + divergence gates | Backtest adds a timing gate the live cards don't |
| **Fills** | live limit at level | `walkLimitOrder`, SL-before-TP, MFE/MAE | n/a (live is forward) |

**Net:** related lineage (both fade Asia fibs that repeat vs the prior session),
but the **selection function differs enough that backtest win-rate / edge does not
transfer to the live alerts.** Closing this is known-drift #8's job: one shared
confluence brick both call, validated equivalence-first on M1 + the live KV path.

---

## 3. Asia / range backtest inventory (which is which + cleanup)

The one referred to in known-drift #8 is **`asia-range-backtest.html` →
`asiaRangeEngine.js` → `confluenceModules.js`**.

| Page | Engine | Confluence | What it is | Route | Status |
|---|---|---|---|---|---|
| `asia-range-backtest.html` | `asiaRangeEngine.js` | `confluenceModules.js` (16 modules) | The full confluence-stacked Asia backtest | `/api/asia-range-backtest/*` | **CURRENT** (the one in #8) |
| `asia-range-analysis.html` | reads its trades | — | Companion analysis viewer (heatmaps, MFE/MAE, module audit) | reads `/trades` | **CURRENT** |
| `range-fib-backtest.html` | `rangeFibEngine.js` | none (inline, stripped) | Honest **baseline** — fib fade with NO confluence, to measure base edge | `/api/range-fib/*` | **CURRENT** (keep — it's the control) |
| `zscore-backtest.html` | `zscoreSpreadEngine.js` | none (yield-spread z gate) | Different strategy — yield-spread mean reversion at fib extensions | `/api/zscore-backtest/*` | **CURRENT** (distinct system) |
| `MD files/Range_Extension_Backtester_v5_2_ZSCORE.html` | — | — | Old manual export of a z-score range backtester | none | **STALE — archive candidate** |
| `Zoo/asia_range_backtest.py` | — | inline (pre-module) | Old deviation-based Asia backtest (EURUSD only) | none | **STALE — archive candidate** |

**Cleanup verdict:** keep the four live `.html` backtests (they serve distinct
purposes — full-confluence, analysis, baseline control, z-score system). Only two
files are genuinely stale: the `MD files/…ZSCORE.html` export and `Zoo/asia_range_backtest.py`.

> ⚠ **Correction to an earlier automated scan:** `confluence-core.js`,
> `range-bias.js`, `structural-fibs.js` and `ranges.js` are **NOT dead code** —
> they're loaded live by `levels.js` / `js/main.js` (index.html) / dashboards.
> Do not delete them. (They're referenced via `<script>`/imports across
> `levels.js`, `signal.js`, `main.js`, `confluences.js`, `analysis.html`, etc.)

---

## 4. Progress & next steps

**Done (this branch):**
- ✅ **Confluence detection unified.** `asiaRangeEngine` now calls
  `confluence-core.detectConfluencesCore` (the live matcher) via a thin
  `markConfluence` adapter — bringing the **session-range distance cap** and
  **cluster density** the backtest lacked. Each fib now carries
  `hasConfluence / isTight / density`. Verified in `js/asiaRangeConfluence.test.mjs`.
  ⚠ This **changes the backtest's confluence counts** (by design — it now matches
  live); re-run with M1 data to see the new edge.

- ✅ **Independent strategies + cross overlay.** Monday is now scored Monday-vs-
  prev-Monday (its own confluence, not borrowed from Asia); `crossSessionMerge` is
  an opt-in zone-strength overlay. Asia and Monday are usable separately.
- ✅ **Live grade recorded in the backtest.** Every trade now carries `live_stars`,
  `live_signal_score`, `live_grade`, `live_verdict` from the SAME shared code the
  bot grades on: `hmm.js` (regime), `rangeBiasCore` (the 5 features), `entryGradeCore`
  (stars + signalScore weighting), `trade-grade.js` (A/B/C). Computed once per day,
  strictly no-lookahead; additive (doesn't change which trades simulate) and
  toggleable via `liveGrade`. ⚠ **Macro/COT/retail-sentiment factors are omitted**
  (no historical data) — the recorded grade is a faithful *approximation* of the
  live grade, not a 100% match. Re-run on M1 to compare grade vs outcome.

**Remaining:**
1. Wire a UI filter on `live_grade` (e.g. A+/A only) so backtest selectivity can be
   set to the live grade — and compare its OOS edge to the module-score selection.
2. Source COT history + (optionally) FRED macro so the few omitted factors can be
   added for fuller parity.
3. **Keep the baseline** (`range-fib-backtest`) as the honest control.
