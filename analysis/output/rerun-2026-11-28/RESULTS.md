# Re-runs after the 2026-10-31 data fixes (2026-11-28)

Branch `wf2/rerun-b`. Six register rows marked `RE-RUN` (DATA_SPEC §5 #9, #14, #15, #16, #18). Each re-run uses the
study's own prereg and seed and changes only the faulty input. Scripts: `scripts/rerun-2026-11-28/`, plus
`analysis/outcome_loop.mjs` (env options added, defaults unchanged). Raw outputs sit beside this file.

| Ledger id | Fault | Old verdict | New verdict | Headline |
|---|---|---|---|---|
| `mv-dispersion-range` | §5 #14 bootstrap | validated | **underpowered** | +0.48 SPX / +0.53 NQ, same size as before, but the intervals now reach zero; neither half clears. **The live chip rests on this** |
| `mv-dislocation-forward` | §5 #14 bootstrap | null | **underpowered** | +0.12 [-0.26, +0.59]; the halves still flip sign; the interval can't rule out an effect as big as dispersion's |
| `residual-pca-cot` | §5 #16 COT sign | underpowered | underpowered (by design), **now a candidate** | D +0.044 (z 2.17), passes all five candidate-gate checks; it used to be D +0.003 |
| `yields-to-fx-direction` | §5 #18 FX dates + lag | null | **null** (exploratory) | FX forward survivors 3/378 and 8/378, against ~19 expected by luck. US indices show a next-day 2y effect (exploratory) |
| `ladder-event-multipliers` | §5 #15 BST tag shift | live params | refit side by side, **not shipped** | holiday 0.92 → 0.82, FOMC 1.14 → 1.08; OOS pinball better on 31/36 |
| `harness-weekend-rows` (`ys-long-confirm`, `cot-positioning-factor`) | §5 #9 weekend rows | context / null | unchanged | scale-only changes, as expected |

## 1. mv-dispersion-range and mv-dislocation-forward (O1, `MD files/OUTCOME_LOOP.md`)

**Fault:** the copied `drawBlock` resampled the event arm in blocks of min(10, n). With n ≤ 10 there was one start
position, so every replicate was the original sample. **Fix:** `analysis/lib/eventBootstrap.mjs` (de-clustered
firings resampled one at a time, control by circular block of 10). `outcome_loop.mjs` already imported it. This run
only adds `MV_BUNDLE`/`MV_END`/`MV_OUT`. Prereg constants are unchanged: horizon 20, apart 20, warm-up 800, floor 8
firings, 1000 reps, seed 20260923. Pass bar: the interval excludes zero.

**Bundle:** `/api/drill-series` fetched 2026-11-28 (1,582 sessions, 2020-11-27 → 2026-11-27). The API serves six
years back from today, so the replay starts two months later than the original (2020-09-22 start). After warm-up that
removes one dispersion firing (9 → 8). The primary run is cut at the lockbox (`MV_END=2026-08-21`). A second run cut at
2026-09-22 matches the original's end date.

| kind | firings | SPX range diff [95%] | NQ range diff [95%] | early half | late half | SPX up vs control |
|---|---|---|---|---|---|---|
| dispersion (to 08-21) | 8 | +0.482 [+0.007, +1.024] | +0.530 [-0.070, +1.062] | +0.73 [-0.14, +1.67] | +0.24 [-0.19, +0.61] | 63% vs 84% |
| dispersion (to 09-22) | 8 | +0.482 [-0.002, +1.040] | +0.547 [-0.027, +1.101] | +0.73 [-0.12, +1.66] | +0.24 [-0.16, +0.62] | 63% vs 82% |
| *banked 2026-09-23* | 9 | +0.52 [0.37, 0.64] | +0.55 [0.37, 0.69] | +0.73 | +0.35 | |
| dislocation (to 08-21) | 17 | +0.115 [-0.257, +0.590] | +0.061 [-0.312, +0.438] | +0.42 [-0.18, +1.30] | -0.16 [-0.44, +0.11] | 71% vs 79% |
| dislocation (to 09-22) | 17 | +0.141 [-0.216, +0.658] | +0.142 [-0.207, +0.530] | +0.45 | -0.13 | 71% vs 75% |
| *banked* | 17 | +0.01 [-0.11, 0.34] | +0.12 [-0.11, 0.40] | +0.29 | -0.24 | 71% vs 80% |

**Reading.** The dispersion point estimates barely moved, but the intervals roughly tripled once the event arm was
really resampled. On the lockbox-cut sample, SPX clears zero by 0.007. NQ does not. On the original end date neither
clears. Neither half clears on its own. An effect that passes on one market by less than the bootstrap's own seed noise,
on 8 firings, has not reached its pass bar. **Verdict: UNDERPOWERED** (was validated). The direction read is
unchanged: no direction (63% up against an 84% control).

Dislocation: **UNDERPOWERED**. It was banked null. The interval is too wide to rule out a dispersion-sized effect, so
"null" claimed more than the data can show. The halves still flip sign, so nothing here points to an effect either.

Not in this row set, read for free from the same run: `mv-vixterm-range` SPX +0.337 [+0.001, +0.726], NQ +0.07
[-0.26, +0.45]. Neither half clears. It is another session's re-run row, so it is not re-banked here.

**Live impact:** `js/rangePressure.js:42` counts `dispersion` among the "validated range signals" (`pressureWords`).
On this re-run it is not validated. That chip should be dropped from the validated count, or shown separately as
"underpowered, watch only". This branch does not change it (owner rule).

## 2. residual-pca-cot (T3, `forge/RESIDUAL_PCA_FAMILY_PREREG.md`)

**Fault:** `cot_weekly.csv` stores JPY/CAD/CHF in USD/xxx pair terms. `tags.py` read them as currency strength, which
inverted the crowd sign for those three. Fixed in 93dd2952. **Re-run:** `scripts/rerun-2026-11-28/residual_pca_cot.py`
runs the family's own `run_universe("fx8")`, `contrast_test`, `tag_shift_placebo` and masked book, unchanged, with seed
20261031. It runs only fx8 + T3, so the rng stream differs from a full-family run. The bootstrap SE is the only number
that depends on it. It reproduces the D +0.0437 the fix commit recorded.

| | old (inverted sign) | re-run (fixed) |
|---|---|---|
| nA / nB | 2,119 / 15,422 | 2,135 / 15,422 |
| D full [se] | +0.003 [CI -0.037, +0.042] | **+0.0437 (se 0.020, z 2.17, one-sided p 0.015)** |
| D IS / OOS (OOS from 2021-06-30) | -0.003 / +0.012 | +0.030 / +0.057 |
| mean s in A, IS / OOS | | +0.043 / +0.078 (neutral B +0.009 / +0.021; mirror -0.028 / -0.041) |
| tag-shift placebo (200) | +0.003 sd 0.021 | +0.003 sd 0.019 (real D at about +2.2 sd) |
| per instrument, BH q 0.10 | | none passes (JPY +0.154 p 0.08, AUD +0.094 p 0.07) |
| crowd-aligned book, net Sharpe IS / OOS | -0.32 / -0.17 | -0.38 / +0.35 |

**Verdict: UNDERPOWERED** (by design: MDE 0.089 against a bar of 0.05, so the prereg banks T3 `underpowered` whatever it
shows). Unlike the banked run, it now **passes the candidate gate**: D > 0 in both halves, p ≤ 0.05, and mean s in A > 0 in
both halves. The mirror carries the opposite sign. Under §8 of the prereg a candidate goes to a forward pre-registration,
never to a result. The old use text ("No sign of extra reversion against a crowd") is wrong on fixed data and has to go.
The family's chance baseline is about 0.2 false candidates across 4 described cells.

## 3. yields-to-fx-direction (`analysis/yield_asset_coupling.py`, exploratory, never pre-registered)

**Faults:** (a) Yahoo FX daily bars are stamped at the bar end, London midnight. The old "UTC date" was a day late every
winter. Fixed in `pull_prices()` (8f22b24d). The price files were re-pulled 2026-11-28 with the fixed code, and a check
shows winter rows shifted one day while summer rows are identical. (b) The over-applied lag: the yield change was shifted
one more day for **every** asset, so "yield change through day t → return t..t+h" was never scored, even where the
asset closes after the ~15:30 ET Treasury print. The re-run keeps everything else of the original (universe, 6 drivers ×
3 lookbacks × 3 horizons, circular-shift null 2,000, seed 7, the survivor definition "sign-stable halves and p_null <
0.05"). Yields come from the original `yields.csv` and the sample is cut at 2026-08-21. Two designs:

- **A** original lag 1 everywhere, fixed dates (fix a alone);
- **B** per-asset lag: 0 for closes after the print (US cash indices, Yahoo FX at London midnight, TLT/IEF), 1 for
  closes before it (DAX/FTSE/STOXX/NIKKEI, GC=F settle).

| | original (2026-08-23 memory note) | A | B |
|---|---|---|---|
| contemporaneous median abs IC | 0.170 | 0.175 | 0.175 |
| USDJPY vs 10y, same 5-day window | +0.49 | +0.50 | +0.50 |
| forward survivors / 972 (luck ≈ 49) | 77 | 82 | 125 |
| **FX** survivors / 378 (luck ≈ 19) | | **3** | **8** |
| US indices / 216 (luck ≈ 11) | | 16 | **51** |
| EU indices / 162 (luck ≈ 8) | | 38 | 37 |

**Verdict for the ledger claim (FX direction): NULL, exploratory, not pre-registered.** The FX cells are below chance
under both designs. The scored lead (lag 0) doesn't help them: the best FX cell, y2 1-day → USDJPY next day, has IC
-0.030 and NW t -1.3. **For indices** the lead the old design never scored is there: 1-day change in 2y → next-day SPX
IC -0.037 (NW t -3.0), NDX t -2.7, DJI t -3.2, RUT t -2.8 (rising 2y, weaker next day). That repeats the repo review's
reading. It comes from a ~1,000-cell exploratory family, so it's a question for a prereg, not a result. Under the owner's
rule a direction claim never becomes a signal. The ledger's "relationship is real only in the same bar" needs a
qualifier for US indices.

## 4. harness-weekend-rows (`ys-long-confirm`, `cot-positioning-factor`)

**Fault:** OANDA D candles 2002-2013 in `px_d1_*` carry Saturday rows (a copy of Friday) and Sunday rows (a short
evening stub). **Fix:** `analysis/features/build_features.py` `drop_weekend_rows()` is applied in `build_oanda_d1`.
The data are closes, so dropping a weekend date folds its move into Monday. The local store was **not** rebuilt from
OANDA: `scripts/rerun-2026-11-28/fix_store_weekends.py` copies the main checkout's store into this worktree's
`features/` and applies the same function. Dropped rows: FX 738-822 per pair, gold 361, and **SPX500 45 / NAS100 43**.
DATA_SPEC said indices had none, and that was wrong. The rebuild of the real store happens the next time the builder
runs. Re-runs: `SAMPLE=long node analysis/harness/repro_ys.mjs` and `node analysis/harness/repro_cot.mjs`, unchanged.

| cell | before (2026-10-17) | after |
|---|---|---|
| ys-long honest US, OOS Sharpe / PF / p / trades | -0.053 / 0.935 / 0.873 / 275 | +0.138 / 1.107 / 0.641 / 255 |
| ys-long original lags, OOS Sharpe / PF / p | +0.25 / 1.26 / 0.33 | +0.42 / 1.43 / 0.15 |
| cot-positioning z156-fade OOS IC [95%] p | -0.0574 [-0.117, +0.004] p 0.066 | -0.0581 [-0.121, +0.007] p 0.078 |

Scale-only, as the register row expected. Neither cell clears its own bar, so the verdicts are **unchanged**
(`ys-long-confirm` context/deflated, `cot-positioning-factor` null). The honest-US yield-spread cell moves from slightly
negative to slightly positive and is still nowhere near significant.

## 5. ladder-event-multipliers (`js/forecastLadderParams.js`, live parameters)

**Fault:** `forge/vol.py tag_column` looked tags up by the naive-UTC session stamp. In BST every event tag landed one
session late (FOMC on the day after, Friday NFP dropped), and `load_daily` emitted 1-hour Sunday stubs in the weeks
when the US and UK clocks differ. Fixed in 87eb5d90. **Re-run:** `scripts/rerun-2026-11-28/ladder_refit.py` repeats
the walk-forward behind the live file (`forge/out_vol_lon`, commit cf266651: london22, 10 years, 6 folds, FF calendar
2007-2025, M1 to 2026-08-20, the same cache) on the fixed code, then runs `forge.export_ladder_params` into
`ladder/forecastLadderParams_refit.js`. **`js/forecastLadderParams.js` is not touched.**

One input had to be pinned. `har_rv_log` joined forge's estimator candidates on 2026-09-15 (cdd63ddd), after the live
fit. Left in, it wins every instrument and confounds the tag fix. The primary refit drops it, so it uses the live
fit's estimator set: 32 of 34 instruments keep their estimator. The HAR version is in `ladder_with_har/` for
information only. Its event shifts are about the same, but its last-fold p50 exceedance is 0.474.

Event multipliers, live → refit, mean over 34 instruments (`ladder/compare_vs_live.txt` has every pair):

| tag | live mean | refit mean | mean abs change | max abs change |
|---|---|---|---|---|
| FOMC | 1.137 | 1.082 | 5.1% | 15.1% |
| NFP | 1.058 | 1.058 | 2.6% | 6.3% |
| CPI | 1.037 | 1.037 | 2.5% | 7.0% |
| high | 1.034 | 1.035 | 0.9% | 2.9% |
| **holiday** | 0.920 | **0.817** | 11.2% | 22.9% |
| none | 0.949 | 0.960 | 1.5% | 3.5% |

Examples: EURUSD FOMC 1.244 → 1.209, CPI 1.024 → 1.070, holiday 0.909 → 0.770. NQ FOMC 1.197 → 1.111, holiday 0.891
→ 0.687. GOLD holiday 0.953 → 0.757. The width multipliers barely move (median 0.2%, max 5.5%).

**The main change:** holidays now land on the holiday, so the holiday discount roughly doubles. FOMC's premium was
inflated by the day-after tag and shrinks. NFP and CPI are flat on average.

OOS walk-forward, 36 instruments × 6 folds: combined HL pinball 0.1342 → 0.1330 (refit better on 31/36). p50 exceedance
0.501 → 0.500 and p75 0.250 → 0.247, both on target. Last fold: p50 0.466 / 0.467, p90 0.094 / 0.095. One caveat:
the live fit's OOS numbers were scored with the same shifted tags, while the live tagger uses correct dates. So the
live file's real OOS behaviour is somewhat worse than its own report says, and the refit's score is the one that
matches live use.

**Verdict:** these are live parameters, not a ledger entry, so no verdict word. The refit is a small but consistent
improvement (pinball better on 31/36) with calibration unchanged. **Recommended live change (owner's call, not made
here):** replace `js/forecastLadderParams.js` with `analysis/output/rerun-2026-11-28/ladder/forecastLadderParams_refit.js`
(same generator, same keys, `generated` 2026-11-28). The biggest visible effect is narrower ladders on holidays
(about −11%) and slightly narrower FOMC days (about −5%).

## Not done / caveats

- The O1 bundle is not point-in-time (FRED revises) and starts two months later than the original. Seeds as
  registered. No seed sweep was run.
- residual-pca-cot ran T3 alone, so its rng stream differs from a full-family run (the SE only).
- yields-to-fx: no costed stage 2 (`yield_asset_trade.py`) was re-run, because the FX cells already fail stage 1. The
  per-asset lag assumes FRED DGS (~15:30 ET quotes) is observable before the 16:00 ET cash close.
- The real feature store (main checkout `features/`) has not been rebuilt. Only this worktree's copy is fixed.
