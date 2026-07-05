# v2 Adaptive-Selector A/B — post-fix re-run (2026-07-05)

**Why this exists.** The 2026-07-02 fix (`60ece89`) closed two defects in the v2
core: `walkBars`/`resolveDynOrder` booked a limit-entry TP on the fill bar
(phantom fade wins on D1 window bars — weekly/monthly horizons and the daily
D1-fallback), and `walkDynamicHL` anchored trailing levels on the extremes of
the bar it was fill-testing (BUG_LIST #8 re-minted, with `dynamicHL` ON by
default). Those defects contaminated exactly the adaptive-vs-fixed A/B cards
used to evaluate the selector (`PLATFORM_REVIEW_2026-07.md` §1.1/§1.2, P0
roadmap item 1). This is the re-run — the second half of that P0 item.

**Pre-registered outcomes** (before running): the selector earns its keep only
if adaptive beats the best fixed leg on **OOS Sharpe** with **≥30 OOS trades**;
otherwise the pre-fix verdict ("selector adds nothing OOS") stands. The re-run
could also have *upgraded* the selector (if the defects had flattered the fixed
fade legs more than adaptive) — it did not.

## Verdict

1. **The selector still adds nothing OOS.** Post-fix, adaptive beats the best
   fixed leg on 1/9 instruments daily (GBPJPY, +0.16 vs −0.25 — winning a race
   where every leg is negative), 1/9 weekly (GBPJPY again, all legs negative),
   0/9 monthly. One "winner" among 27 instrument×horizon cells, never with a
   positive-and-tradable number, is what noise does. Same conclusion as the
   contaminated cards, now on honest fills.
2. **The pre-fix *weekly* fade "edge" was an artifact.** The contaminated core
   showed weekly fade75/fadeMed OOS Sharpe of +0.9…+1.5 on several majors
   (mean +0.49/+0.42 across 9 instruments) — numbers that looked like a real
   positive. Post-fix they collapse to −0.14/−0.34. That was the fill-bar
   phantom TP booking fade wins on D1 window bars, precisely the failure mode
   the fix targeted. **Nobody should cite the old weekly card.**
3. **Nothing tradable survives anywhere in the v2 family on this data.** Daily:
   every mode negative OOS on every instrument (mean adaptive −1.08, best-leg
   means −0.64…−0.76). Weekly: mean ≤ +0.10 for the best leg. Monthly: some
   positive cells but 13–28 OOS trades — below the ≥30 pre-registered floor,
   so not evidence. "Built" ≠ "has edge": the harness is sound, the strategies
   on it are null after honest fills and costs.
4. **Direction of the contamination confirmed.** Fade legs (limit entries, and
   the biggest dynamicHL exposure) got materially worse post-fix at every
   horizon; follow (stop entries, whose fill-bar TP is causal and stays) was
   roughly unchanged or slightly better. The defects flattered fades — i.e.
   they flattered the very legs the old cards said were "best".

## How it was run

- **Harness:** `scripts/run_v2_ab_offline.mjs` (committed with this doc) —
  the same `compareV2` / `runForecastV2` / `summarizeSplit` path as the hosted
  suite, no OANDA needed. Sandbox has no OANDA access (403), so D1 sessions
  are resampled from the local M1 parquets using OANDA's broker-day convention
  (22:00→22:00 UTC, labelled with the ending calendar day); `m1ByDate` is keyed
  identically, so every daily window walks exactly the M1 bars its D1 bar
  summarises — **no daily D1-fallback rows**.
- **Pre/post isolation:** the pre-fix core (`60ece89^:js/forecastCore.js`) was
  run through identical orchestration on the *same* resampled data, so the
  pre→post deltas below are the effect of the fix alone, not of data sourcing.
  (The pre-fix shims were session-local and are not committed.)
- **Params:** the `vol-backtest-v2.html` card defaults — OOS 0.4, SL 1.5×band,
  T thresholds 0.30/0.55, ER window 14, costs auto (`DEFAULT_COST_PCT`),
  `dynamicHL` on (engine default).
- **Data:** local M1 2016-01 → 2026-05 (~3.7M bars/instrument, ~2 970
  sessions), OOS from ~2022-05. **Caveats:** shorter history than the hosted
  OANDA card (~2007→), session opens are first-M1-tick not OANDA D1 mids, and
  **NQ is absent** (no local parquet — re-run NQ on Railway for completeness).
  Absolute levels are therefore not bit-comparable to the hosted card; the
  pre-vs-post comparison and the post-fix verdicts are the results here.

## Daily — OOS Sharpe (OOS trades), pre-fix → post-fix

| Instrument | adaptive | fade75 | fadeMed | follow | best fixed (post) |
|---|---|---|---|---|---|
| EURUSD | −0.64 → −1.05 (374) | −0.22 → −0.53 (286) | −0.46 → −0.97 (481) | −1.09 → −1.02 (343) | fade75 −0.53 |
| GBPUSD | −0.90 → −1.27 (376) | −0.65 → −0.72 (298) | −0.55 → −1.27 (499) | −0.47 → −0.30 (341) | follow −0.30 |
| USDJPY | −0.86 → −1.26 (320) | −0.84 → −1.07 (250) | −0.97 → −1.72 (437) | −0.52 → −0.42 (300) | follow −0.42 |
| AUDUSD | +0.12 → −0.78 (385) | +0.12 → −0.24 (275) | +0.22 → −0.65 (499) | −0.66 → −0.49 (335) | fade75 −0.24 |
| NZDUSD | −0.79 → −1.13 (369) | −0.36 → −0.61 (292) | −0.42 → −1.03 (495) | −0.83 → −0.69 (335) | fade75 −0.61 |
| USDCAD | −1.21 → −1.52 (379) | −0.56 → −0.75 (295) | −1.46 → −1.85 (490) | −1.39 → −1.30 (364) | fade75 −0.75 |
| USDCHF | −1.09 → −1.61 (343) | −0.83 → −1.22 (268) | −0.80 → −1.45 (469) | −1.03 → −0.63 (322) | follow −0.63 |
| GBPJPY | +0.26 → **+0.16** (351) | −0.26 → −0.40 (270) | −0.39 → −0.83 (448) | −0.37 → −0.25 (320) | follow −0.25 |
| GOLD | −1.11 → −1.29 (343) | −1.15 → −1.32 (275) | −1.10 → −1.22 (419) | −0.64 → −0.64 (261) | follow −0.64 |

GBPJPY is the only instrument where adaptive tops the table post-fix, and it
was already the pre-fix "winner" (+0.26) — the fix didn't create it. +0.16 on
351 trades, one instrument out of nine, is inside the multiple-testing chance
baseline and is not tradable on its own.

## Weekly — OOS Sharpe (OOS trades), pre-fix → post-fix

| Instrument | adaptive | fade75 | fadeMed | follow | best fixed (post) |
|---|---|---|---|---|---|
| EURUSD | +0.49 → −0.66 (62) | **+0.88 → −0.13** (48) | +0.62 → −0.44 (92) | −0.44 → +0.10 (68) | follow +0.10 |
| GBPUSD | **+1.81 → −0.07** (70) | +0.32 → −0.19 (53) | **+1.36 → −0.10** (97) | −0.38 → +0.24 (70) | follow +0.24 |
| USDJPY | −0.28 → −0.56 (74) | −0.06 → +0.20 (59) | −0.41 → −0.58 (100) | +0.28 → −0.25 (68) | fade75 +0.20 |
| AUDUSD | **+1.28 → +0.28** (74) | **+1.09 → +0.41** (50) | +1.01 → +0.52 (94) | +0.04 → +0.25 (66) | fadeMed +0.52 |
| NZDUSD | +0.84 → −0.17 (73) | **+1.45 → +0.12** (53) | +0.94 → −0.17 (100) | −0.47 → +0.21 (69) | follow +0.21 |
| USDCAD | +0.57 → +0.21 (85) | +1.21 → +0.74 (60) | **+1.29 → −0.01** (108) | −0.49 → +0.08 (82) | fade75 +0.74 |
| USDCHF | −0.22 → −1.01 (75) | +0.52 → −1.25 (50) | −0.01 → −0.89 (101) | −1.64 → −0.64 (66) | follow −0.64 |
| GBPJPY | −0.53 → −0.21 (68) | −0.68 → −0.39 (50) | −0.66 → −0.39 (90) | −0.92 → −0.66 (62) | fade75 −0.39 |
| GOLD | −0.09 → −0.33 (70) | −0.34 → −0.76 (60) | −0.38 → −0.98 (92) | −0.09 → +0.15 (64) | follow +0.15 |

This is the headline of the re-run: the weekly fade rows that looked like edge
were phantom-TP artifacts. Weekly windows are walked on D1 bars, exactly where
the fill-bar TP was unknowable. USDCAD fade75 (+0.74 on 60 trades) is the best
surviving cell; one cell at +0.74 among 27, IS-inconsistent with its own
pre-fix flattery, is noted — not promoted.

## Monthly (20-day) — OOS Sharpe (OOS trades), pre-fix → post-fix

| Instrument | adaptive | fade75 | fadeMed | follow |
|---|---|---|---|---|
| EURUSD | +1.15 → +0.50 (22) | +1.50 → +0.73 (13) | +0.81 → +0.28 (27) | +1.06 → +1.06 (21) |
| GBPUSD | +0.92 → +0.56 (21) | +0.84 → +0.84 (14) | −0.10 → −0.39 (28) | +0.26 → +0.26 (16) |
| USDJPY | −0.22 → −0.11 (19) | −0.01 → −0.15 (17) | +0.32 → −0.13 (26) | −0.13 → +0.18 (14) |
| AUDUSD | +1.29 → +2.43 (15) | +0.49 → +1.08 (10) | +0.47 → +0.87 (21) | +1.34 → +1.34 (14) |
| NZDUSD | +0.29 → +0.34 (21) | +0.89 → +0.76 (18) | +0.39 → +0.17 (28) | +0.45 → +0.45 (17) |
| USDCAD | +0.08 → +0.09 (19) | +0.31 → +0.24 (13) | +0.07 → −0.04 (27) | −0.37 → −0.37 (21) |
| USDCHF | +0.48 → +0.28 (17) | +0.37 → +0.17 (15) | +0.06 → −0.13 (23) | +1.62 → +1.62 (17) |
| GBPJPY | −0.34 → −0.11 (17) | −0.03 → −0.54 (11) | +0.00 → −0.04 (22) | −0.82 → −0.77 (17) |
| GOLD | +0.29 → +0.18 (22) | +0.26 → +0.09 (19) | −0.07 → −0.17 (23) | +0.85 → +0.85 (20) |

Every monthly OOS cell is under the ≥30-trade floor (13–28 trades on this
2016→2026 history): pre-registered as **not evidence** in either direction.
Follow rows barely move (stop-entry TP is causal on the fill bar and was never
contaminated); fades soften — same direction as the other horizons.

## Cross-instrument mean OOS Sharpe

| horizon | adaptive | fade75 | fadeMed | follow |
|---|---|---|---|---|
| daily | −0.69 → −1.08 | −0.53 → −0.76 | −0.66 → −1.22 | −0.78 → −0.64 |
| weekly | +0.43 → −0.28 | +0.49 → −0.14 | +0.42 → −0.34 | −0.46 → −0.06 |
| monthly | +0.44 → +0.46 | +0.51 → +0.36 | +0.22 → +0.05 | +0.47 → +0.51 |

## What follows

- The v2 selector stays a **research selector, not a trading signal** — same
  status as before, now on uncontaminated evidence. Don't route capital or
  bot behaviour through `selectStrategy` on the strength of any existing card.
- Any historical citation of the **weekly fade** numbers (Sharpe ≈ +1 on
  majors) should be considered retracted.
- If the hosted `vol-backtest-v2.html` card is re-run on Railway (full OANDA
  history + NQ), expect the same shape: it runs the same fixed engine. This
  doc's Railway follow-up is optional confirmation, not a dependency.
- To reproduce offline: `node scripts/run_v2_ab_offline.mjs` (add
  `--horizon daily --pairs eurusd` to scope; needs the local M1 parquets).
