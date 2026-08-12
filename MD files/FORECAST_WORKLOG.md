# Forecast Family — Worklog & Resume Point

> Running log of the forecast-family work so any session can resume at the exact
> spot. Newest state at the top. Reads alongside `CLAUDE.md` (the rules),
> `REVERSION_CONTINUATION_CONCEPT.md` (the design basis) and
> `TRADABILITY_REVIEW.md` (what's real vs in-sample).

---

## CURRENT STATE — paused at two open threads

### Thread A (paused): v2 backtester has a stop-loss artifact — DO NOT trust its numbers

We shipped the lego core (`js/forecastCore.js`) and `vol-backtest-v2.html`
(adaptive selector vs fixed fade75 / fadeMed / follow, IS/OOS split). First
real-data run (10 instruments, daily) gave:

- **Selector result:** `adaptive` loses to the best fixed leg on OOS Sharpe in
  **all 10** instruments. As built, the day-type selector adds nothing.
- **BUT the numbers are not real:** OOS Sharpe **10–15**, win rates **95–99%**,
  PF **12–55**. Impossible in liquid FX → backtest artifact, not edge.

**Root cause — the SL sits where price never goes.** In `simulateEntry`
(`forecastCore.js`):
```
entry = open + HL75            (≈ +1.9σ)
slD   = slMult × HL75          (slMult 1.5)
SL    = entry + slD            (≈ open + 2.5×HL75 ≈ +4.7σ)
```
A stop at ~**+4.7σ** essentially never triggers, so fades book ~98% tiny wins and
almost no losses → fantasy Sharpe. Classic short-vol / "pennies in front of a
steamroller." `follow` is the mirror (tight stop inside the move → stopped on
every false break → loses everywhere). IS ≈ OOS confirms it's structural, not
period edge. (Same SL convention is inherited from v1 and is in
`honestForecastEngine.js` too.)

**Pending fix (NOT yet applied) — resume here for Thread A:**
1. Realistic stop: `SL distance = slMult × ocMed` (≈0.3–0.5σ), tied to the same
   vol that sets the bands; horizon-agnostic. So trend days actually stop fades.
2. Honest win accounting: a "win" should require the reversion target (Close
   median) to actually trade, not just "closed below entry."
3. Re-run; expect Sharpe to fall to a believable **<2**, win rate ~55–65%, and
   only THEN is the fade/follow/adaptive comparison meaningful (trend days now
   cost you, which is exactly what the selector is meant to avoid).

First real-data run snapshot (OOS Sharpe, adaptive vs best fixed):
| Pair | adaptive | best fixed | Pair | adaptive | best fixed |
|---|---|---|---|---|---|
| EURUSD | 10.16 | fade75 12.35 | USDCAD | 7.35 | fade75 11.73 |
| GBPUSD | 5.96 | fadeMed 8.32 | USDCHF | 8.07 | fadeMed 10.02 |
| USDJPY | 4.44 | fadeMed 6.25 | GBPJPY | 6.13 | fade75 7.93 |
| AUDUSD | 9.51 | fadeMed 11.25 | GOLD | 5.31 | fade75 7.29 |
| NZDUSD | 9.52 | fadeMed 15.48 | NQ | 8.44 | fadeMed 8.82 |
(All numbers artifact-inflated — see root cause above.)

### Thread B (NEW DIRECTION — chosen next): the Forecast Level Analyser

Deliberate pivot: **measure, don't trade.** Before fixing the trade sim, build an
analyser that ignores entries/exits/stops entirely and just measures what price
actually does relative to the forecast levels. This sidesteps the whole
stop/fill/cost artifact (Thread A) and produces the empirical ground truth the
selector needs.

**Concept (like the existing `asia-range-analysis.html`, but for the vol/range
forecast levels):** for every pair on R2 (FX + NASDAQ + DAX + GOLD …), each day:
1. Compute the forecast levels (reuse `computeBands`): Proj H/L med (HL50), Proj
   H/L 75p (HL75), Close med/75p (OC).
2. Record, per level, the empirical outcome:
   - **Hit rate** — did price reach the level?
   - **Reverted vs continued** — after touching, did it revert toward open or
     push through?
   - **Average retracement** to the level / average extension beyond (in % and
     pips), and time-to-hit.
   - **Where the day closed** relative to each level.
3. Aggregate the conditional stats by **day-of-week, session, regime, asset
   class, month, year** — to see structure (e.g. "Mondays revert from HL75 78%
   of the time"; "trend regime → HL50 continues").

**Why it's the better next move:** it's non-overfittable (no trade assumptions),
it directly answers the reversion-vs-continuation question with measured base
rates, and those base rates ARE the calibration for the selector and the honest
expectation for any future strategy. Reuses the lego core (`computeBands`,
`volSigmaSeries`, `classifyRegime`) — pure connect-a-piece.

**Status:** discussed, agreed as the next build. Spec to be written
(`FORECAST_LEVEL_ANALYSER` concept), then engine + page following house
conventions (async-job, R2 data via `loadM1ForPair`, analysis card layout).

---

## DONE THIS ARC (all merged to main)

- `CODEBASE_OVERVIEW.md` — repo map.
- `SYSTEM_ASSESSMENT.md` — engineering/methodology critique.
- `TRADABILITY_REVIEW.md` — range extension / forecasting / QMR verdicts.
- `REVERSION_CONTINUATION_CONCEPT.md` — fade/follow design basis + literature.
- Honest forecast harness (`js/honestForecastEngine.js`, `honest-forecast-harness.html`).
- Forecast core + v2 (`js/forecastCore.js`, `js/volBacktestV2Engine.js`,
  `/api/vol-backtest-v2/*`, `vol-backtest-v2.html`).
- `CLAUDE.md` — lego-principle project memory.

## KEY LESSONS (carry forward)

- Execution artifacts (stops/fills) can swamp signal — a believable Sharpe (<2)
  is a prerequisite for trusting any leg comparison.
- Measure base rates before simulating trades; the analyser (Thread B) is the
  honest foundation the backtester (Thread A) should be calibrated against.
- Everything stays lego: import the core, never copy; selector not knobs;
  validate OOS with ≥30 trades.
