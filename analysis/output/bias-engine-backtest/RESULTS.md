# bias-engine-backtest — results

Prereg: `forge/BIAS_ENGINE_BACKTEST_PREREG.md` (committed in `c72e8bc6`, 2026-11-16, before any engine call was joined
to an outcome). Run 2026-11-16, seed 20261116, B = 2000 (cluster bootstrap over 21-session date blocks), block-permutation
placebo 500. Branch `claude/bias-engine-backtest`. Ledger ids: `bias-engine-backtest-sameday`, `bias-engine-backtest-5d`,
`bias-engine-backtest-20d`, `bias-engine-backtest-components`.

## Verdict: UNDERPOWERED on all three horizons (by the registered power rule), leaning the WRONG way at 5 and 20 days

The registered gate (Holm p < 0.05 across 9 cells, net R CI > 0, above the 97.5th placebo percentile, both halves,
holdout) held in **0 of 9** cells. Every cell was UNDERPOWERED by design (MDE above the useful bar, prereg §5), so the
word is UNDERPOWERED, never NULL. That word hides the shape, so here it is plainly: **the engine (rebuilt without data
momentum) shows no direction skill on the same day, none at 5 days, and at 20 days its FX calls are right less often
than the base rate (47.9% vs ~51%, hit excess −3.1 pp [−6.5, +0.1]); pooled across every market its 20-day calls lose
−0.27 R per call net [−0.51, −0.01].** The useful positive effect (+3 pp at 5 d, +5 pp at 20 d) is excluded for FX by
the intervals; for gold and the indices the intervals are too wide to exclude it.

## Scored cells (discovery 2010-01-04 → 2024-08-21; same day 2016-10-24 →)

Hit excess = hit − point-in-time B0 expected hit. R = signed move in trailing-60-day daily σ; net = after real spread.

| Cell | Called rows | Hit | Hit excess (95% CI) | MDE | Bar | Holm p | Block-placebo pct | Net R / call (95% CI) | Net R / day | Halves | Holdout hit excess | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sameday · fx | 9,268 | 50.9% | +0.9 pp [−0.8, +2.6] | 2.9 pp | 2 pp | 1.00 | 78 | −0.036 [−0.062, −0.010] | −0.036 | +1.0 / +0.8 | +0.8 pp | UNDERPOWERED |
| sameday · gold | 791 | 54.4% | +4.0 pp [+0.3, +7.3] | 6.7 pp | 2 pp | 0.24 | 98 | +0.028 [−0.053, +0.098] | +0.028 | +7.4 / +1.2 | +1.4 pp | UNDERPOWERED |
| sameday · idx | 6,767 | 51.8% | +0.2 pp [−1.5, +2.1] | 3.5 pp | 2 pp | 1.00 | 62 | +0.005 [−0.031, +0.041] | +0.005 | +0.1 / +0.4 | −0.8 pp | UNDERPOWERED |
| 5d · fx | 20,552 | 49.9% | −0.7 pp [−2.7, +1.4] | 3.6 pp | 3 pp | 1.00 | 21 | −0.082 [−0.198, +0.039] | −0.016 | −1.9 / +0.8 | **−4.8 pp [−9.2, −0.8]** | UNDERPOWERED |
| 5d · gold | 1,416 | 52.9% | +1.9 pp [−2.2, +5.8] | 8.5 pp | 3 pp | 1.00 | 76 | +0.048 [−0.185, +0.275] | +0.010 | +0.0 / +3.5 | +2.9 pp | UNDERPOWERED |
| 5d · idx | 9,176 | 53.0% | −0.2 pp [−3.1, +2.6] | 6.3 pp | 3 pp | 1.00 | 46 | −0.003 [−0.154, +0.146] | −0.001 | −0.8 / +0.2 | −3.6 pp | UNDERPOWERED |
| 20d · fx | 20,553 | 47.9% | **−3.1 pp [−6.5, +0.1]** | 5.5 pp | 5 pp | 0.52 | 3 | **−0.373 [−0.744, −0.036]** | −0.019 | −4.9 / −1.1 | −3.7 pp | UNDERPOWERED (wrong-sign lean) |
| 20d · gold | 1,416 | 52.2% | −0.1 pp [−6.3, +6.6] | 11.5 pp | 5 pp | 1.00 | 51 | −0.001 [−0.72, +0.77] | −0.000 | −2.4 / +2.0 | +12.6 pp (n 197) | UNDERPOWERED |
| 20d · idx | 9,186 | 54.3% | −1.1 pp [−5.8, +3.7] | 8.2 pp | 5 pp | 1.00 | 28 | −0.032 [−0.60, +0.49] | −0.002 | +0.1 / −2.2 | −1.1 pp | UNDERPOWERED |

Raw hit rates of 53-54% on the indices are the indices' up-drift (the engine is Bullish on 69% of its index calls); B0
already expects that, which is why the excess is ~0.

### Per horizon, every market pooled (descriptive headline)

| Horizon | Sample | Called rows | Hit | Hit excess vs B0 | Net R / call | Net R / day |
|---|---|---|---|---|---|---|
| same day | discovery | 16,826 | 51.4% | +0.8 pp [−0.5, +2.1] | −0.017 [−0.037, +0.004] | −0.017 |
| same day | holdout 2024-08 → 2026-08 | 4,225 | 50.1% | +0.3 pp [−1.4, +1.8] | −0.047 [−0.088, −0.012] | −0.047 |
| same day | all | 21,051 | 51.1% | +0.7 pp [−0.4, +1.7] | −0.023 [−0.041, −0.006] | −0.023 |
| 5 days | discovery | 31,144 | 51.0% | −0.4 pp [−2.0, +1.2] | −0.053 [−0.139, +0.037] | −0.011 |
| 5 days | holdout | 4,319 | 46.0% | −4.0 pp [−7.6, −0.6] | −0.226 [−0.382, −0.071] | −0.045 |
| 5 days | all | 35,463 | 50.4% | −0.9 pp [−2.4, +0.6] | −0.074 [−0.154, +0.008] | −0.015 |
| 20 days | discovery | 31,155 | 50.0% | −2.4 pp [−5.1, +0.3] | −0.256 [−0.538, +0.011] | −0.013 |
| 20 days | holdout | 4,125 | 47.6% | −2.0 pp [−8.1, +3.9] | −0.362 [−0.961, +0.233] | −0.018 |
| 20 days | all | 35,280 | 49.7% | −2.4 pp [−4.7, +0.2] | −0.268 [−0.508, −0.012] | −0.013 |

## Controls

- **Selftest (known answers from outside the pipeline):** synthetic persistent sides, zero world → hit excess
  −0.5 pp [−1.2, +0.1] (truth 0); planted k = 0.10 σ → +3.4 pp [+2.7, +4.0] (truth Φ(0.1) − 0.5 = +4.0 pp, inside);
  block placebo centred at −0.04 pp in the zero world; leaked sides give > 40 pp. `run_engine.mjs --selftest`: publication
  lags, open-bar exclusion, proxy policy reaches the engine, coverage adjustment. `node js/biasEngine.test.mjs`: 9 pass.
- **Block-permutation placebo** (calls moved in 21-session blocks, same move for every market): placebo means
  −0.2 to +0.3 pp (unbiased). Real estimates sit at the 3rd-98th percentiles; only gold same day reaches the 98th.
- **Evidence packs** (`evidence/<horizon>/evidence/EVIDENCE.md`, all called rows 2010→2026-08, outcome = move − B0
  drift): positive control on the real rows with the real effect removed: a bar-sized plant found 100% at 1×
  (same day 0.04 σ, 5 d 0.17 σ, 20 d 0.56 σ); 0.5× found 100% / 80% / 90%. Lookahead canary: leaking the outcome sign
  lifts the estimate from +0.011 / −0.067 / −0.340 σ to +0.69 / +1.74 / +3.52 σ. Pack diagnoses: same day FLAT
  (+0.011 σ [−0.007, +0.028], useful 0.04 σ ruled out), 5 d FLAT (−0.067 [−0.146, +0.011]), 20 d WRONG SIGN
  (−0.340 [−0.589, −0.076]); removing the top 1% of rows leaves +0.010 / −0.067 / −0.265. The pack's row-level shuffle
  is biased at 5 d / 20 d (mean −0.012 / −0.080: drift + persistence), which is why the gate uses the block placebo.
- **Concentration:** by instrument and year in the packs' `breakdown.png`; FX 20 d is negative in both discovery halves
  (−4.9 / −1.1 pp) and the holdout (−3.7 pp).
- **Unresolved same-day rows:** 19-128 days per market had no bar in a window (holidays, index breaks); counted in
  `outcome_meta.json`, not silently dropped.

## Components (disaggregation, BH q = 0.10; candidates only, never results)

**S1 strength ladder: higher strength does NOT mean more right.** Pooled hit excess by strength 3-4 / 5-6 / 7-10:
same day +0.5 / +0.3 / +6.6 pp (n 806 at 7+; slope +0.7 pp per point [−0.2, +1.5], q 0.55); 5 d −0.8 / −1.2 / +1.2;
20 d −2.2 / −3.2 / −0.6. FX at 20 d gets WORSE as strength rises (−3.0 / −4.3 / −10.8 pp). Only indices same day has a
positive slope (+1.4 pp/point [+0.3, +2.4], q 0.12, not below 0.10).

**S2 Neutral abstention: worth nothing.** Neutral covers 75% of market-days. Scoring Neutral days on sign(score) gives
−0.0 / −0.4 / −1.2 pp; called days minus Neutral-signed days = +0.7 [−0.3, +1.7] / −0.4 [−1.8, +0.9] /
−1.2 [−3.2, +0.8] pp (q 0.36-0.54). The Neutral line does not separate better calls from worse ones.

**S3 driver decomposition (each driver alone, signed as the engine signs it).** Four cells survive BH
(q < 0.10): three are the WRONG sign at the slow horizons on FX, one is a small right-sign same-day index cell:
- **Risk role × R on FX:** 20 d −4.4 pp [−6.3, −2.4] (q 0.001), 5 d −2.0 pp [−3.3, −0.7] (q 0.04). Leaning the
  risk-on currencies (AUD, NZD, CAD) up when VIX is low / curve in contango / SPX up loses at 1-4 weeks: these risk
  readings mean-revert.
- **Trend on FX:** 20 d −2.7 pp [−4.3, −1.1] (q 0.04), 5 d −1.2 pp (q 0.39): the D1/H4 EMA slope reverses at weeks
  scale (consistent with `trend-following-fx` NULL).
- Policy (2y proxy) 0.0 to +0.5 pp, rate differential −0.1 to +0.5 pp, COT contrarian +0.5 to +1.6 pp at FX (best
  20 d +1.6 pp [−0.3, +3.6], q 0.62).
- **Fed path (2y proxy, dovish = up) on the indices, same day:** +2.6 pp [+0.7, +4.6] (q 0.099), +1.2 pp at 5 d and
  +2.2 pp at 20 d (not significant). The one right-sign candidate.

So the engine's 20-day FX miss comes from its two smallest-weight price-based drivers (risk .10, trend .05) pointing the
wrong way while its heavy macro drivers (policy .25, rates .20) are coin flips.

**S4 labels as built** (data momentum counted missing: FX calls 9% of days instead of 19%): same picture: FX hit
excess +0.9 / −0.1 / −2.5 pp, gold +4.0 / +1.9 / −0.1, indices +0.2 / −0.2 / −1.1.

## Deviations from the prereg

- **A1 (POST-HOC, results seen): S3 code fix.** The first run named FX and asset driver sides with the same column
  names, so the asset loop overwrote the FX risk / positioning / trend sides with NaN and those three FX cells were
  silently skipped; a missing leg was NaN rather than 0. Fixed (own prefix; a missing leg contributes 0, as in the
  engine) and S3 recomputed with `run.py --drivers-only`. Primary cells, S1, S2, S4 and the packs were not touched by
  the bug. Descriptive only; demotes nothing and promotes nothing.
- NZDCHF has no bid/ask file: its 5 / 20 d spread is charged at NZDCAD's measured median (not in the prereg; a cost
  assumption on 1 of 35 markets).

## Coverage: what carried history and what was dropped

| Driver (weight) | Rebuilt? | Notes |
|---|---|---|
| Policy path (.25) | yes, via the spec's 2y proxy for every currency | USD/GBP/CAD 100%, EUR 99.7%, JPY 98.7%, AUD 98.2%, CHF 20.7% (monthly SNB publication vs the 10-day budget, as live), NZD 0% (RBNZ 403). Futures never; stance nudge never |
| Rate differential (.20) | yes | ALFRED first prints of the live series, 85-100% |
| Data momentum (.20) | **dropped** | no point-in-time scorecard history; taken out of the coverage base for the primary labels |
| Real yield (.10) | USD only | EUR/CHF CPI vintages not held |
| Risk role × R (.10) | yes | VIX, VIX/VIX3M full; HY credit only 2023-11 → (17%) |
| Commodity (.05) | partly | CAD (WTI) 100%, AUD (copper) from 2016 (64%), NZD dairy never |
| Positioning (.05/.10) | yes | CFTC leveraged / managed money, Friday release |
| Trend (.05/.15) | yes | D1 throughout; H4 from 2016 |

## What this changes

- **Desk terminal: HIDE the engine's Bullish / Bearish word and its strength number** under the Desk Call. No horizon
  earns a direction claim; at 20 days the FX calls lean the wrong way and strength does not grade them. The driver
  table (what policy, rates, risk, COT read today) may stay as **context only, with no direction word and no
  strength**, labelled "Rule-based macro readings; back-test 2010-2026: no direction skill at 1, 5 or 20 days".
- The forward record (`bias-scoreboard`, forecaster `bias-engine`) continues: it is the only test of the engine WITH
  data momentum. Re-open the display question only if that record, at its registered 60 / 120-day judgement, shows a
  positive hit excess, or after a data-momentum history is built.
- Candidates for their own preregs (not results): (a) FX risk-role sign at 1-4 weeks (wrong sign, q 0.001): should
  the risk driver be dropped or inverted for FX? (b) FX 20-day trend reversal; (c) index same-day Fed-path (2y) +2.6 pp.
  Any weight change to the live engine is the owner's call and must be scored forward, not fitted on this history.
