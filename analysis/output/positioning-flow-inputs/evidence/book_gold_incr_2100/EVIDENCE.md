# Evidence pack: positioning-flow-inputs:book|gold|incr|21:00

Unit: Brier skill gain over the bias-learner base, as a fraction of B0 error. Useful bar: +0.002458. 1900 scored rows, 1900 independent clusters, 1 instruments, 2019-01-02 → 2026-08-20. Prereg verdict: **UNDERPOWERED**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | False |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | False |
| share instruments same sign | 100% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** +6.76e-05 [-0.002945, +0.00303]. Shuffled-signal 95% band [-0.004694, +0.00149]; the real estimate sits at the 86th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.001229) | 0% | +0.001362 |
| 1.0× bar (+0.002458) | 15% | +0.002594 |
| 2.0× bar (+0.004916) | 100% | +0.005063 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.9994 (clean +6.76e-05). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| GOLD | 1900 | +6.76e-05 | [-0.00322, +0.002976] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2019 | 246 | -5.395e-05 | [-0.001597, +0.001218] |
| 2020 | 249 | +1.209e-05 | [+3.683e-06, +2.105e-05] |
| 2021 | 251 | +0.001037 | [-0.0003589, +0.002516] |
| 2022 | 247 | +0.00627 | [-0.01173, +0.02282] |
| 2023 | 249 | -0.001212 | [-0.009042, +0.004183] |
| 2024 | 250 | -0.002761 | [-0.01616, +0.006549] |
| 2025 | 249 | -0.001573 | [-0.008611, +0.005806] |
| 2026 | 159 | -0.001856 | [-0.008068, +0.006255] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 951 | +0.002 | [-0.002645, +0.006544] |
| H2 | 949 | -0.001876 | [-0.006474, +0.002532] |

Without the largest 1% of rows: +0.0005123.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 190 | +0.002759 | [-0.003359, +0.008878] |
| D2 | 190 | -0.0009334 | [-0.00346, +0.001593] |
| D3 | 190 | -0.001033 | [-0.002128, +6.134e-05] |
| D4 | 190 | +4.852e-05 | [-0.0004528, +0.0005499] |
| D5 | 190 | +4.898e-05 | [-7.723e-05, +0.0001752] |
| D6 | 190 | +2.189e-06 | [+3.502e-07, +4.028e-06] |
| D7 | 190 | +2.051e-05 | [-8.674e-05, +0.0001277] |
| D8 | 190 | -0.0001317 | [-0.0005396, +0.0002762] |
| D9 | 190 | +4.896e-05 | [-0.001142, +0.001239] |
| D10 | 190 | -0.0006609 | [-0.004278, +0.002956] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Runner: est +0.00007 [-0.00270, +0.00300] (21-date moving-block bootstrap); 200-refit block-shuffled-input placebo 95th pct +0.00063. The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, so the runner's numbers are the binding ones. Plant = labels flipped toward the lean until the statistic rises by the bar; canary = lean set to the realised direction.
