# vmc-nq-vol-increment: results

**Is VuManChu identifying volatility transitions, or simply describing price?** On NQ futures, 2023-01 to 2026-07,
it is describing price. A price-and-calendar forecast of the next 12 bars' range already holds what Cipher B knows.
Adding all of Cipher B improves that forecast by **0.08% / 0.14% / 0.09%** of squared error at 1 / 3 / 5m. The
registered bar was 1%, and the upper ends of the 95% intervals are 0.14% / 0.26% / 0.26%, so a material increment is
ruled out at the powered timeframes. Cipher B does not forecast compression turning into expansion beyond price either.
The banked "mid-range WaveTrend cross → wider next hour" effect is real against the old simple baseline. Against a
proper price model it is gone, and the WaveTrend level was the part carrying it.

| | |
|---|---|
| Prereg | `forge/VMC_NQ_VOL_INCREMENT_PREREG.md` (registered 2026-10-31, v3 owner-approved, amendment A1 pre-results, A2 post-hoc describe-only) |
| Seed | 20261031 |
| Data | `vmc-nq-cipher` NQ futures dataset; fit 2016-01-04 → 2022-12-31; **test 2023-01-01 → 2026-07-01** (A1: calendar file ends 2026-07-02) |
| Lockbox | trade dates ≥ 2026-08-21: **not read** |
| Code | `scripts/vmc-nq-vol-increment/` (`features.py`, `seams.py`, `s4ref.py`, `common.py`, `run.py`, `synth.py`, `test_seams.py`, `prereg_measure.py`) |
| Outputs | `results.json` (gated verdicts and context), `runs/tf{1,3,5,30}.json` (every number), `seam_test_full.json`, `prereg_measure.json` |
| Labels | Stage 2: **reassessment on a previously explored period**. Stages 3-5: **pre-specified; test period previously used in related research; not independent confirmation** |

## Verdicts

| Ledger id | Hypothesis | Verdict | Why |
|---|---|---|---|
| `vmc-nq-vol-increment` | **H3 (primary)**: C+P+K+V beats C+P+K by ≥ 1% | **NULL** | upper bounds 0.14 / 0.26 / 0.26% at 1/3/5m, all below 1% |
| | H3-noK: C+P+V beats C+P | **NULL** | upper bounds 0.31 / 0.23% at 3/5m (1m not read: see A2) |
| | H3-blocks: any one of 6 blocks ≥ 1% under Holm (24 tests) | **UNDERPOWERED** | at 1/3/5m every block's upper bound is ≤ 0.30% (null there). Only at 30m, which is underpowered by design, do 4 blocks' intervals still reach 1% |
| `vmc-nq-vol-transition` | H4a: V improves onset forecasts (Brier skill ≥ 1%) | **NULL** | upper bounds 0.13 / 0.40 / 0.44% |
| | H4b: onset out of compression | **NULL** (see note) | upper bounds 0.52 / 0.27 / 1.35%: 1m and 3m cannot reach 1%; 5m still can |
| `vmc-nq-vol-decomposition` | H2a-d, reassessment against the C+P+K model | **NULL** (all four) | every 1m and 3m interval lies inside ±0.02 log units |
| | H4c, S1, ablation, PVD, h = 48 | **CONTEXT** | descriptive |

Note on H4b. The frozen rule in `synth.py` calls a multi-timeframe gate NULL when it can't be passed: here 1m and 3m
cannot reach 1%. One timeframe (5m, n = 19,298) still admits a material effect. The verdict word is the registered
NULL, but read it as "not passable on the powered timeframes", not "ruled out everywhere".

## Stage 1: the price-only forecast (CONTEXT)

Test period, eligible bars only. y = log of the next 12 bars' high-low range. "% error" = exp(RMSE) − 1, the typical
multiplicative miss on the range.

| Model | 1m R² | 1m RMSE | 1m % error | 3m R² | 5m R² | 30m R² |
|---|---|---|---|---|---|---|
| naive (last 12-bar range) | 0.541 | 0.509 | 66.3% | 0.461 | 0.435 | −0.465 |
| C (clock: NY half-hour, weekday, session) | 0.405 | 0.579 | 78.5% | 0.406 | 0.403 | 0.389 |
| C+P (+ recent range, vol, expansion, displacement, efficiency, gaps) | 0.744 | 0.380 | 46.2% | 0.720 | 0.705 | 0.599 |
| **C+P+K** (+ scheduled releases) | **0.747** | **0.3777** | **45.89%** | **0.725** | **0.710** | **0.603** |
| C+P+K+V (+ all of Cipher B) | 0.747 | 0.3775 | 45.87% | 0.725 | 0.711 | 0.607 |

- Price features are the forecast: C → C+P skill +57.0% / +52.9% / +50.6% / +34.4%.
- The calendar adds +1.26% [1.06, 1.45] / +1.69% / +1.69% / +0.86% (CP → CPK). That alone is ten times Cipher B's
  increment.
- Calibration (both models, deciles of ŷ): Mincer-Zarnowitz slopes 0.995 / 0.985 / 0.980 / 1.007 (CPK) and
  0.996 / 0.986 / 0.981 / 1.020 (CPKV). Bias −0.004 to −0.006 log units at 1-5m and −0.04 at 30m. The decile tables
  are in `results.json → context.<tf>.calibration`.
- n test: 1,195,862 / 396,730 / 231,755 / 25,815 bars over 874 / 874 / 871 / 578 trade dates.

## Stage 3: baseline vs augmented (H3)

Skill = 1 − MSE(augmented) / MSE(base), on the same bars, with a paired 20-date block bootstrap (B = 2000).

| Pair | 1m | 3m | 5m | 30m (descriptive) |
|---|---|---|---|---|
| **CPK → CPK+V (H3)** | **+0.08% [+0.01, +0.14]** | **+0.14% [+0.01, +0.26]** | **+0.09% [−0.07, +0.26]** | +1.07% [−0.05, +2.25] |
| CP → CP+V (H3-noK) | +0.06% [−0.00, +0.12] *(not read)* | +0.20% [+0.09, +0.31] | +0.08% [−0.08, +0.23] | +0.32% [−0.65, +1.30] |
| CPK → CPK + stale V (+12 bars) | −0.05% [−0.09, +0.00] | −0.02% [−0.13, +0.08] | +0.04% [−0.12, +0.20] | +0.48% [−0.45, +1.41] |
| skill(V) − skill(stale V) | +0.12% [+0.07, +0.17] | +0.16% [+0.03, +0.28] | +0.05% [−0.16, +0.25] | +0.59% [−0.44, +1.61] |
| CPK → CPK + price-VWAP distance (descriptive) | +0.03% [−0.01, +0.07] | +0.08% [−0.03, +0.18] | +0.04% [−0.11, +0.19] | +0.09% [−0.79, +0.89] |
| Shuffled target (H3 pair) | −0.01% [−0.05, +0.03] | −0.00% [−0.06, +0.06] | +0.02% [−0.07, +0.11] | +0.14% [−0.14, +0.44] |

What 0.08-0.14% means. The 1m RMSE of the log range goes from 0.37767 to 0.37753, and the typical range miss from
45.89% to 45.87%. The 1% bar would have been about a 0.5% cut in RMSE. This is about a tenth of that.

**Gate conditions** (all must hold at each of 1, 3 and 5m):

| Condition | 1m | 3m | 5m |
|---|---|---|---|
| skill ≥ 1% and lower bound > 0 | no (0.08%) | no (0.14%) | no (0.09%) |
| ≥ 0.5% in ≥ 3 of 4 walk-forward years | no: 0.07 / −0.00 / 0.13 / 0.15% | no: 0.21 / −0.03 / 0.14 / 0.22% | no: 0.02 / −0.08 / 0.41 / 0.18% |
| ≥ 0.5% without the top 1% of base \|error\| | no (0.04%) | no (0.15%) | no (0.04%) |
| V beats stale V | yes | yes | no |
| shuffled target includes 0 | yes | yes | yes |

The increment that does exist at 1m and 3m is timely: the live V beats a 12-bar-old copy of itself. It is about a
tenth of the size that matters. The pipeline control is clean on the primary pair.

**Robustness (fixed 2016-22 model, CPK → CPKV)**:

| Cut | 1m | 3m | 5m | 30m |
|---|---|---|---|---|
| 2023 / 2024 / 2025 / 2026 | +0.07 / +0.10 / −0.02 / +0.23% | +0.21 / +0.23 / −0.06 / +0.19% | +0.02 / −0.03 / +0.19 / +0.25% | +1.71 / +1.68 / +0.35 / −0.70% |
| RTH / Europe / post / Asia | +0.16 / −0.03 / +0.24 / +0.06% | +0.13 / +0.24 / −0.83 / +0.26% | +0.14 / +0.07 / −0.07 / +0.10% | −0.35 / +2.19 / −1.28 / +1.75% |
| NinjaTrader bars only (owner file excluded) | +0.09% | +0.23% | +0.10% | +1.28% |
| OLS instead of GBM | +0.18% [+0.15, +0.21] | +0.23% | +0.20% | +0.13% |
| h = 48 bars (CONTEXT) | +0.09% [−0.03, +0.21] | +0.20% | +0.18% | +1.78% [+0.02, +3.44] |

No cut reaches 1% at 1-5m. At 30m some cuts do (2023, 2024, Europe, Asia, h = 48), and others reverse (2026, RTH,
post). That is what an underpowered timeframe looks like. It is not a stable effect.

## Contribution breakdown (H3-blocks and ablation)

Each block is added to C+P+K on its own (Holm across 24 tests). Ablation = how much CPK+V loses when one block is
removed (CONTEXT).

| Block | What it is | Added alone 1m | 3m | 5m | 30m | Ablation 1m / 3m / 5m / 30m |
|---|---|---|---|---|---|---|
| WTL | WaveTrend level, \|wt1\|, near-zero, slope, acceleration | **+0.11% [+0.06, +0.16]** Holm ✓ | **+0.20% [+0.09, +0.30]** Holm ✓ (not read, A2) | +0.15% | +0.22% | +0.00 / +0.06 / +0.09 / +0.40% |
| WTC | the cross, bars since, level at the cross | −0.01% | −0.12% | +0.11% | +0.66% | −0.02 / +0.10 / +0.12 / −0.23% |
| SPR | WT spread (the Cipher B "VWAP") | +0.01% | +0.01% | +0.04% | +0.44% | −0.03 / +0.00 / −0.02 / +0.11% |
| MF | Money Flow | +0.05% | +0.07% | −0.11% | +0.44% | −0.01 / +0.09 / −0.03 / +0.69% |
| ALN | alignment of components | +0.00% | +0.03% | +0.08% | +0.01% | −0.03 / +0.09 / −0.01 / +0.05% |
| DIV | regular and hidden divergences | −0.05% | −0.07% | −0.01% | +0.51% | −0.03 / +0.06 / −0.01 / +0.14% |

- **The WaveTrend level is the only block that is reliably non-zero**, as the prereg expected. It reaches 0.1-0.2%,
  and the bar was 1%.
- **The cross itself adds nothing** on top of price: −0.01% at 1m, −0.12% at 3m.
- No block is ≥ 1% anywhere it could be measured. The blocks' combined ablations are near zero because they share
  what little they carry.
- The 1m-5m upper bounds are all ≤ 0.30%. "UNDERPOWERED" comes only from 30m, where WTC, SPR, MF and DIV have
  intervals that still reach 1% (for example WTC +0.66% [−0.21, +1.50]).

## Stage 2: level vs cross vs interaction (reassessment)

**Label: reassessment on a previously explored period.** Groups: A = mid-range (|wt1| < 20) with a cross, B =
mid-range without, C = away from zero with a cross, D = neither. Contrasts are differences in mean residual
(log units, ≈ %) of the next-12-bar log range. MDE = 2.8 × bootstrap SE.

n per group (A / B / C / D): 1m 54,127 / 236,854 / 186,629 / 718,252; 3m 17,414 / 78,089 / 61,105 / 240,122;
5m 10,282 / 45,576 / 35,497 / 140,400; 30m 1,110 / 5,164 / 3,787 / 15,754.

| Contrast | Against | 1m | 3m | 5m | 30m |
|---|---|---|---|---|---|
| **Level** B − D | simple baseline (banked) | +4.90% [+4.32, +5.45] | +5.52% [+4.82, +6.12] | +5.65% [+4.69, +6.60] | +5.11% [+2.35, +7.76] |
| | **C+P+K model** | **−0.63% [−1.01, −0.24]** (MDE 0.56%) | **−0.51% [−1.04, −0.02]** (0.71%) | −0.30% [−0.91, +0.32] (0.91%) | −0.71% [−3.26, +1.94] (3.7%) |
| **Cross** C − D | simple baseline | +0.63% [+0.38, +0.86] | +0.87% [+0.43, +1.28] | +0.37% | +1.16% |
| | **C+P+K model** | −0.27% [−0.44, −0.11] (0.24%) | −0.17% [−0.49, +0.13] (0.44%) | −0.74% [−1.17, −0.28] (0.64%) | +0.54% [−0.96, +2.10] (2.2%) |
| **Cross given level** A − B | simple baseline | +0.15% [−0.35, +0.64] | +0.03% | +0.22% | +0.81% |
| | **C+P+K model** | +0.12% [−0.19, +0.43] (0.44%) | −0.38% [−0.94, +0.19] (0.81%) | −0.76% [−1.38, −0.14] (0.88%) | +1.23% [−1.04, +3.66] (3.4%) |
| **Interaction** (A−B) − (C−D) | simple baseline | −0.48% | −0.83% | −0.15% | −0.35% |
| | **C+P+K model** | +0.39% [+0.07, +0.71] (0.45%) | −0.21% [−0.79, +0.38] (0.86%) | −0.01% (1.0%) | +0.69% (3.9%) |

How to read it:
- **Against the simple baseline, the banked pattern reappears**: mid-range bars run about +5% wider. The
  owner's main question was whether the cross adds anything beyond the level, and the answer is that it adds about
  0%, even there.
- **Against the price model, the level effect disappears and even turns slightly negative**: −0.6% at 1m, with an
  interval excluding 0 but well inside the ±2% bar. |wt1| < 20 means WaveTrend is flat, which means price has been
  quiet. The simple baseline didn't know how quiet. The price model does, and once it does, the WaveTrend level has
  nothing left to say.
- All four contrasts have 1m and 3m intervals inside ±0.02, so the registered verdict is **NULL** ("adds nothing
  material"). Under §3.8's reading rule, 30m is inconclusive (the interval extends beyond ±0.02).

## Stage 4: transitions (H4a, H4b, H4c)

States use only past price: the percentile p of the current 12-bar range among the same NY half-hour on the previous
20 trade dates. Onset = the next 12 bars' range reaches p ≥ 0.8.

| | 1m | 3m | 5m | 30m (descriptive) |
|---|---|---|---|---|
| **H4a** onset among bars with p ≤ 0.5 | +0.00% [−0.12, +0.13] | +0.20% [+0.01, +0.40] | +0.09% [−0.25, +0.44] | +1.08% [−0.40, +2.57] |
| n / base rate | 468,887 / 10.0% | 156,119 / 11.0% | 93,073 / 11.6% | 12,889 / 15.6% |
| Brier: climatology / C+P+K / +V | 0.0898 / 0.0867 / 0.0867 | 0.0980 / 0.0951 / 0.0949 | 0.1025 / 0.1003 / 0.1002 | 0.1318 / 0.1338 / 0.1323 |
| AUC C+P+K / +V | 0.645 / 0.646 | 0.627 / 0.631 | 0.608 / 0.614 | 0.623 / 0.628 |
| V − stale V | −0.08% | −0.03% | +0.14% | +0.11% |
| shuffled target | +0.07% ✓ | +0.05% ✓ | +0.08% ✓ | **+1.47% [+0.46, +2.50] ✗** |
| **H4b** onset out of compression | +0.19% [−0.14, +0.52] | −0.44% [−1.14, +0.27] | +0.18% [−0.97, +1.35] | −0.18% [−1.50, +0.94] |
| n / base rate | 95,753 / 4.0% | 32,343 / 5.2% | 19,298 / 5.6% | 2,416 / 11.0% |
| Brier: climatology / C+P+K / +V | 0.0380 / 0.0381 / 0.0380 | 0.0497 / 0.0500 / 0.0502 | 0.0525 / 0.0513 / 0.0512 | 0.0981 / 0.1030 / 0.1032 |
| "Earlier" (expansion in bars t+13..t+24), V skill | +0.05% [−0.07, +0.16] | +0.04% | +0.01% | +0.89% [−0.87, +2.49] |

- **V does not forecast expansion beyond price.** It adds 0.0-0.2% Brier skill, against a bar of 1%.
- The 30m H4a figure can't be read: a within-date shuffled target produces +1.47% too, which is more than the real
  +1.08%.
- Compression → expansion is hard for everyone. The price model barely beats the base rate on H4b (at 3m it is
  slightly worse than climatology). Cipher B doesn't change that.

**H4c, recognising the current state (CONTEXT).** Is bar t's own 12-bar window already in the top 20%?

| AUC | 1m | 3m | 5m | 30m |
|---|---|---|---|---|
| Cipher B alone | 0.746 | 0.742 | 0.740 | 0.732 |
| price features alone | 0.876 | 0.876 | 0.870 | 0.914 |

Cipher B recognises the state it is in. Price recognises it better, because Cipher B is a function of that price.
This is the "merely recognising" pattern the prereg described: association with the present, no lead on the future.

## Controls and integrity

- **Seams** (owner's point 2): features are built per segment between contract rolls and feed joins. The perturbation
  test replaces everything outside a bar's segment with arbitrary prices, and it changed 0 of about 384 million
  eligible cells. The negative control (seams ignored) changed about 109 million, so the test has teeth
  (`seam_test_full.json`). Share of bars eligible: 97.1 / 96.7 / 94.7 / 70.5% at 1/3/5/30m. Owner-file bars are 22% of
  the test bars and 4% of the fit bars. With NinjaTrader bars only, the results are unchanged in substance (table above).
- **Shuffled target**: clean on every primary pair (H3, H4a, H4b) at 1-5m. It is flagged on 8 cells, none of them
  decisive (amendment A2):
  - H3-noK 1m: −0.06%;
  - the block screen: WTC 1m −0.05%, WTL/WTC/SPR 3m +0.05 to +0.06%, WTL/ALN 30m +0.19 to +0.21%;
  - H4a 30m: +1.47%.
  Under the registered rule those cells are not read. The 1-5m deviations are ≤ 0.06% of skill. That sets a noise
  floor about the same size as the 1-5m increments themselves, which is another reason not to read anything into
  the +0.1% level.
- **Lockbox**: not read. **Data truncation**: the test period ends 2026-07-01 because the release calendar ends
  there (A1). The "Major" release tag is about 2.6x more frequent in 2023-25 than in 2016-19. H3-noK (no calendar)
  is the check, and it tells the same story.

## Limitations

1. **Not independent confirmation.** 2023-26 was used in `vmc-nq-cipher` (validation, sequencing, post-hoc A1).
   Stages 3-5 are new pre-specified comparisons on that period. Stage 2 is a reassessment. For a null, this matters
   less than it would for a pass, because research-selection bias on a reused period would tend to favour Cipher B.
2. **30m is underpowered by design** (half-width 5.8%, measured on the fit period before registration). Its point
   estimates (H3 +1.07%, H4a +1.08%) are near the bar. Its intervals include 0, its years flip sign, and its H4a
   shuffled control fails. Nothing at 30m is ruled out or ruled in.
3. **One instrument.** ES and gold were not run, as the owner instructed.
4. **The price model is strong but not exhaustive.** A better price model would only shrink V's increment further.
   §7: a more elaborate VuManChu model is not a reason to reopen.
5. **Range, not direction.** Nothing here concerns direction, which the earlier study found null.

## Recommendation

1. **Record H3 NULL.** Cipher B adds under 0.3% to a price-and-calendar forecast of NQ's next-12-bar range at 1-5m.
   Per §8, the banked `vmc-nq-cipher-volatility` entry stays as run, with a note that its effect is captured as well
   or better by price features (done in the Evidence Book).
2. **Don't spend the lockbox on this question.** Nothing at 1-5m passed that confirmation could confirm. The lockbox
   is still sealed and stays your decision.
3. **Don't run ES/gold replications of the Cipher B volatility effect.** At 1-5m the increment is ruled out on NQ,
   so a replication would be testing a small number for its own sake.
4. **What carries the information is price.** The C+P+K model (R² 0.75 at 1m, calibrated) is the useful by-product.
   Using it anywhere would be a separate decision with its own forward test. Nothing here changes stops, sizing or
   any live calculation.
5. **30m is the only open corner.** If it ever matters, it needs a longer test window, not a richer Cipher B model.
   It is UNDERPOWERED, not a lead.

## Reproduce

```bash
python -I scripts/vmc-nq-vol-increment/features.py              # tables -> data/tf{1,3,5,30}.parquet (gitignored)
python -I scripts/vmc-nq-vol-increment/test_seams.py --real     # seam test (must PASS)
python -I scripts/vmc-nq-vol-increment/prereg_measure.py        # fit-period-only power measurement
for tf in 30 5 3 1; do python -I scripts/vmc-nq-vol-increment/run.py $tf; done   # ~1h at 1m
python -I scripts/vmc-nq-vol-increment/synth.py                 # gates -> results.json
```
