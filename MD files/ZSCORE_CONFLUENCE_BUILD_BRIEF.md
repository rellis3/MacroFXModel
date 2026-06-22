# Build: Yield-Spread Z-Score as a Confluence Factor, Not a Hard Gate

## The Idea

The Yield Spread Z-Score Backtester (`js/zscoreSpreadEngine.js`) currently treats the
yield-spread Z-score as a hard binary gate: if `|z| >= threshold`, trade a fixed
direction; if not, do nothing. Fibonacci extension levels off the Asia session
range are the entry trigger within that day.

The user's proposed reframe: **the Fib levels are the entry zone (structure);
yield-spread Z-score and macro data are confluence/confidence factors that score
how much conviction a setup at that level deserves** — not a standalone trigger.
A trade fires when the *composite* score clears a bar, not when Z-score alone
crosses a threshold.

This isn't a new idea in this codebase — it's already how the live, production
confluence engine (`levels.js`) works for the main dashboard. It combines HMM
regime, ADX, swing structure, TWAP slope, EMA/RSI, Hurst exponent, and FRED macro
alignment into one weighted score (0-100) and a letter grade (A+/A/B/C/SKIP). The
ask here is essentially: **fold yield-spread Z-score into that scoring system as
one more weighted input, and use `levels.js`'s Fib confluence zones as the entry
structure instead of `zscoreSpreadEngine.js`'s own simplified extension levels.**

## Why This Looks Right (evidence, not just intuition)

A real production backtest run (6 pairs, 6-year window, real FRED data, current
`main` as of 2026-06-22) produced this Z-tier breakdown:

| Tier | Trades | Win% | Total Pips | Profit Factor |
|---|---|---|---|---|
| 2.0-2.5σ | 272 | 39.0% | +30.3 | **1.03** (only profitable tier) |
| 2.5-3.0σ | 322 | 31.4% | -102.2 | 0.92 |
| 3.0+σ | 324 | 34.0% | -242.6 | 0.82 (worst) |

Overall: 918 trades, win rate 34.5%, PF 0.88, Sharpe -0.96, max drawdown -398.7,
total pips -314.5.

Performance **decays monotonically as Z gets more extreme** — the opposite of what
you'd expect if Z-score magnitude alone reliably predicted reversion strength.
That's a classic signature of a signal that's *contextual* (useful in combination
with other confirming factors) rather than *standalone* (reliable on its own past
a threshold). Treating it as one weighted confluence input rather than a hard gate
directly targets this.

## What's Already Been Tried This Session (don't redo this)

All of this happened on the existing `zscoreSpreadEngine.js` binary-gate model,
**without** touching the entry-zone mechanism — only the touch-detection and
SL/TP formulas were varied:

1. **Removed `fibProx` tolerance** (PR #391, merged) — entries previously could
   "touch" a Fib level via a 5-pip proximity buffer without the bar's actual
   high/low reaching it. This inflated win rate via same-bar instant-fills
   (35.8% of trades, 94.6% win rate pre-fix vs 27.1% post-fix). Now requires a
   literal `lows[i] <= level <= highs[i]` touch.
2. **Fixed blank-date-range bug** (PR #393, merged) — unrelated input-validation
   bug, not a strategy issue.
3. **Full ATR-based SL/TP swap** (tested, discarded, not pushed) — replaced both
   `SL = entry - 0.25*asia.range` and `TP = asia.lo/hi` with `levels.js`'s
   `SL = ATR(30m)*1.25`, `TP = SL*2.2` (fixed R:R). Result: worse on every metric
   in an apples-to-apples synthetic test (840 trades both runs): total pips
   -210.5 → -992.4, Sharpe -0.71 → -1.6, max DD -591.3 → -1459.3. The old fixed
   TP anchor (`asia.lo`/`asia.hi`) gave deeper Fib levels (1.25/1.5/2.0) a much
   bigger reward for the same fixed risk (RR up to 8:1) — an asymmetry that was
   apparently load-bearing. Flattening every entry to RR=2.2 destroyed it.
4. **Hybrid: ATR-based SL only, kept `asia.lo`/`asia.hi` TP** (tested, discarded,
   not pushed) — recovered most of the damage from #3 but still underperformed
   the unmodified baseline (529 trades after the R:R≥0.8 filter rejected more
   shallow entries, total pips -279.7, Sharpe -0.81, max DD -679.4 vs baseline
   -210.5 / -0.71 / -591.3).
5. **Local synthetic-data testing turned out to be unreliable for this kind of
   change.** The synthetic FRED stub used for local iteration produces a Z-tier
   pattern that's the *inverse* of the real one (3.0+σ was the best tier
   synthetically, worst in real production). Any further SL/TP-formula tuning
   needs a real `FRED_KEY` test, not local synthetic data — that's a hard
   constraint discovered this session, not a guess.

**Conclusion driving this brief:** two iterations of "tweak the SL/TP formula
inside the existing binary-gate model" both failed. That's mild evidence the gate
model itself — not just its risk formula — is the wrong shape, which is what
motivated taking the user's reframe seriously instead of continuing to tune SL/TP
in isolation.

## Cross-Referencing a Live Signal Bot (ground truth, partially reconciled)

A third-party Telegram bot ("Bennetts EURUSD/USDJPY Dual...") appears to run a
similar strategy live and was the original inspiration for this backtester. Real
trade data points captured this session:

- USDJPY: z=2.4784, threshold shown as "±2.0" → exactly matches our
  `defaultThreshold: 2.0` for USDJPY. Order: entry 161.346, TP 162.475, SL
  160.701, lots 1.86.
- USDJPY (separate day): entry 161.658 (target 161.667, slip +0.9p), TP 162.790,
  SL 161.011.
- EURUSD: z=2.57, tag "x1.5 lvl" (an explicit Fib-level multiplier tag), entry
  1.14460, SL 1.14370, TP 1.14580, lots 14.39.
- Daily summary % readouts let threshold be backed out the same way as the
  confirmed USDJPY case: EURUSD showed Z=2.275 as "83% of threshold" →
  implied threshold ≈ 2.74, **not** our current default of 2.5. Worth
  revisiting if this build changes how thresholds are used/weighted.
- **Could not reconcile** the bot's exact SL/TP/Fib-multiple relationship
  against either the old formula or the ATR-based one — implied risk:reward
  varied trade-to-trade in a way neither tested formula reproduced. This is
  circumstantial support for the bot running a multi-factor scored system
  rather than a single deterministic formula, i.e. consistent with this brief's
  premise, but not conclusive (small sample, possibly different ATR/range
  window than guessed).

## Current State — Two Parallel Systems

**`js/zscoreSpreadEngine.js`** (research backtester, the thing tuned all session):
- Entry structure: `asia.lo - mult*asia.range` for LONG (mults `[0.25, 0.75, 1.25,
  1.5, 2.0]`), mirrored for SHORT. Single Asia session (00:00-05:59 UTC) per day,
  no cross-session clustering.
- Gate: binary `|z| >= threshold` on yield-spread Z-score only.
- No regime/macro confirmation factors at all.
- Has a full historical backtest harness (`runZScoreBacktest`/
  `runFullZScoreBacktest`) reading M1 parquet cache + historical FRED fetch.
  This is the **only** piece of existing infra that can replay history.

**`levels.js`** (live production confluence engine, drives the real dashboard):
- Entry structure: cross-session Fib *retracement* confluence detection
  (`detectConfluencesCore`/`mergeCrossSessionConfs` in `js/confluence-core.js`),
  comparing today vs. yesterday Asia session AND current vs. previous Monday
  session, with configurable confluence/cluster-merge pip thresholds per
  instrument class (FX/gold/NAS100).
- Scoring: `computeServerSignalScore()` blends HMM regime
  (`hmm.js: fitHMM`/`hmmSignalScore`), 5 server-side range-bias features (ADX,
  swing CHoCH/BOS, TWAP slope, EMA20/50+RSI14, Hurst exponent — all in
  `levels.js`), a structural star rating, and (if `FRED_KEY` set)
  `computeMacroScore()` — VIX, HY spread, NFCI, and 10Y-2Y curve steepening,
  weighted 25% when present.
- SL/TP: `SL = ATR(30m)*1.25`, `TP = SL*2.2` (already tested against the OLD
  entry zones this session and found worse — needs re-testing once entries
  themselves change, since the formula and the entry structure interact).
  - `gradeEntry()` (`js/trade-grade.js`) turns the score into A+/A/B/C/SKIP.
- **No historical backtester exists for this system.** It only runs live,
  every 30 minutes, writing to KV. Building one is the main lift here — it
  needs historical OANDA M5/M30/D bars (or equivalent from the M1 parquet
  cache, aggregated) PLUS historical HMM/ADX/Hurst/macro feature computation
  at each historical decision point, not just current snapshots.

## What This Build Needs to Decide

These are open design questions, not yet answered — the next session should
resolve them deliberately, ideally with the user, before writing the bulk of the
implementation:

1. **Whose entry zones win?** Use `levels.js`'s cross-session Fib confluence
   zones (richer, already-validated against a live TradingView indicator per
   `project_range_levels_issue` memory) instead of `zscoreSpreadEngine.js`'s
   own simple Asia-extension levels? Or keep the simpler zones and just add
   Z-score as a new weighted factor on top of them?
2. **Weight of the yield-spread Z-score factor.** `computeServerSignalScore`
   currently weights macro 25% (when FRED present), HMM 25%, range-bias 20%,
   momentum 20%, structure 10% (with vs. without macro, weights shift —
   see the two branches in `computeServerSignalScore`). Where does
   yield-spread Z-score fit — does it replace/merge with the existing
   `computeMacroScore` curve-steepening term, or is it an entirely separate
   weighted input?
3. **Replace the gate or add to it?** Does crossing the Z-threshold still gate
   trade *direction* (LONG/SHORT bias), with the composite score only gating
   whether to *take* the trade — or does Z-score become purely one more score
   input with no special gating role at all?
4. **Backtest infra:** Build a new historical version of `computeServerSignalScore`
   and its five range-bias features (most can be computed from M1/M30/D
   aggregates we already have cached — see `aggregateToM30`-style helpers added
   to `zscoreSpreadEngine.js` this session for a worked example pattern), or
   find a lighter-weight proxy for backtesting purposes only?
5. **SL/TP**, once entries change: re-test `levels.js`'s ATR*1.25/2.2R formula
   against the *new* entry structure — this session's negative result was
   measured against the *old* entry zones and may not transfer.
6. **Where does this live?** New page/dashboard, or evolve `zscore-backtest.html`
   in place? Given the scope of change, probably a new page reusing the
   existing chart/trade-viewer UI patterns from `zscore-backtest.html` and
   `backtest-viewer.html`.

## Suggested First Step

Don't build the full multi-factor historical backtester on the first pass — it's
a lot of new historical-feature-computation infra and easy to get wrong
silently. Scope a v1 that:
1. Keeps `zscoreSpreadEngine.js`'s existing Asia-extension Fib levels and entry
   timing (cheapest path, no new entry-zone code).
2. Adds exactly **one** new confluence input — yield-spread Z-score *magnitude
   bucket* (already computed, already in the trade record as `zTier`) — as a
   confidence multiplier or a position-size/selectivity filter, not a full
   multi-factor score yet.
3. Validates against real `FRED_KEY` production data (local synthetic data is
   *not* trustworthy for this — see "What's Already Been Tried," point 5)
   before investing in HMM/ADX/Hurst historical backtesting infra.

This gives a real signal on whether the "confluence not gate" framing pays off at
all before committing to the much larger lift of a full historical
`levels.js`-style backtester.

## Key Files

| File | Role |
|---|---|
| `js/zscoreSpreadEngine.js` | Current Z-score backtester (binary gate model) |
| `levels.js` | Live multi-factor confluence engine (no backtester) |
| `js/confluence-core.js` | Fib confluence/clustering math used by `levels.js` |
| `js/trade-grade.js` | `gradeEntry()` — score → letter grade |
| `hmm.js` | `fitHMM`/`hmmSignalScore`/`compute30mSwingRegime` |
| `js/volBacktestM1Engine.js` | `loadM1ForPair()` — M1 parquet cache loader, shared infra |
| `zscore-backtest.html` / `backtest-viewer.html` | Existing backtester UI to extend or mirror |
| `server.js` (~line 5760-5915) | `/api/zscore-backtest/*` routes |
