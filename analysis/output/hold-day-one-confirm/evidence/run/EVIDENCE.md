# Evidence pack: hold-day-one-confirm:run

Unit: sigma per sqrt-day (P-bar). Useful bar: +0.1. 9790 scored rows, 898 independent clusters, 13 instruments, 2020-08-24 → 2026-08-19. Prereg verdict: **NULL**.

## Diagnosis: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown

| Check | Result |
|---|---|
| ci excludes zero | False |
| ci excludes bar | True |
| beats placebo 97 5 | False |
| pipeline finds planted bar | False |
| same sign both halves | True |
| share instruments same sign | 85% |
| survives top1pct removed | True |
| survives costs | None |

**Headline:** -0.03816 [-0.09864, +0.02741]. Shuffled-signal 95% band [-0.02363, +0.02085]; the real estimate sits at the 0th percentile of the shuffles.

## Positive control (a known effect planted in the real data)

| Planted | Detected | Mean recovered |
|---|---|---|
| 0.5× bar (+0.05) | 0% | +0.01184 |
| 1.0× bar (+0.1) | 33% | +0.06184 |
| 2.0× bar (+0.2) | 100% | +0.1618 |

**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes +0.8778 (clean -0.03816). A test that cannot see a leak this large would be broken.

## By instrument

| inst | n | estimate | 95% CI |
|---|---|---|---|
| AUDUSD | 629 | -0.06728 | [-0.2061, +0.07606] |
| EURJPY | 652 | -0.04861 | [-0.1958, +0.1371] |
| EURUSD | 757 | -0.02169 | [-0.1369, +0.1279] |
| GBPJPY | 624 | -0.04634 | [-0.2063, +0.1226] |
| GBPUSD | 836 | -0.03643 | [-0.1637, +0.08462] |
| GOLD | 725 | +0.07007 | [-0.08165, +0.2337] |
| NQ | 908 | -0.02209 | [-0.1641, +0.09001] |
| NZDUSD | 697 | -0.05007 | [-0.1875, +0.0582] |
| SPX500 | 875 | -0.0779 | [-0.2028, +0.05217] |
| US30 | 880 | -0.1103 | [-0.2381, +0.02421] |
| USDCAD | 857 | +0.003542 | [-0.1281, +0.1371] |
| USDCHF | 785 | -0.008764 | [-0.1601, +0.1295] |
| USDJPY | 565 | -0.08945 | [-0.253, +0.08751] |

## By year

| year | n | estimate | 95% CI |
|---|---|---|---|
| 2020 | 472 | -0.1722 | [-0.3973, +0.07125] |
| 2021 | 1864 | -0.08436 | [-0.2174, +0.06678] |
| 2022 | 1892 | +0.05112 | [-0.1114, +0.2291] |
| 2023 | 1776 | -0.01739 | [-0.1619, +0.1263] |
| 2024 | 1460 | -0.03951 | [-0.1756, +0.09777] |
| 2025 | 1464 | -0.1228 | [-0.2394, +0.02927] |
| 2026 | 862 | +0.04306 | [-0.2173, +0.3264] |

## By half

| half | n | estimate | 95% CI |
|---|---|---|---|
| H1 | 4900 | -0.04237 | [-0.131, +0.04534] |
| H2 | 4890 | -0.03386 | [-0.1181, +0.0433] |

Without the largest 1% of rows: -0.0324.

## Signal buckets

| bucket | n | mean outcome | 95% CI |
|---|---|---|---|
| D1 | 979 | -0.115 | [-0.227, -0.003029] |
| D2 | 979 | +0.1783 | [+0.06591, +0.2907] |
| D3 | 979 | -0.03251 | [-0.1394, +0.07439] |
| D4 | 979 | -0.1082 | [-0.2154, -0.0009023] |
| D5 | 979 | +0.0153 | [-0.1124, +0.143] |
| D6 | 979 | -0.08195 | [-0.2043, +0.04038] |
| D7 | 979 | +0.04154 | [-0.08703, +0.1701] |
| D8 | 979 | -0.02104 | [-0.1439, +0.1018] |
| D9 | 979 | -0.05446 | [-0.18, +0.07109] |
| D10 | 979 | +0.03402 | [-0.103, +0.1711] |

Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.

## Notes

Rows rebuilt with the runner's own run() (hooks capture its outcome arrays). The pack bootstraps dates iid; the runner used 21-day moving blocks widened to a Monte-Carlo SE floor, so the runner's CI is the binding one. Halves split at the median row date (runner: 2023-08-18). The pack's placebo shuffles each row's side within instrument (the runner's placebo shifted the label grid in time). Registered P-bar -0.0382. 
