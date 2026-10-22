# EURUSD Range Book — results

Rule: forge/RANGE_BOOK_EURUSD_PREREG.md. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. BSS = Brier skill score (0 = no better than the reference, 1 = perfect). A variable is informative only if its whole 95% interval is above 0.


### Book A — reach: does price reach the line today, from the checkpoint?

Train 98,760 rows, test 54,839 rows. Base cells: checkpoint hour × line (Close/OHOL rung, or Range rung) × distance in σ × range used. Unconditional train rate 24.1%.

Base model vs the unconditional rate: BSS **+0.188** (95% CI +0.174 to +0.200).

| added to base | test BSS vs base | 95% CI | informative? |
|---|---|---|---|
| sigmaReg | +0.0016 | -0.0026 to +0.0060 | no |
| hmm | +0.0003 | -0.0013 to +0.0018 | no |
| yRange | -0.0025 | -0.0039 to -0.0013 | no |
| event | +0.0074 | +0.0039 to +0.0112 | **YES** |
| sigmaReg + hmm + yRange + event | -0.0003 | -0.0054 to +0.0045 | no |

Reliability of the base model on test (predicted vs observed):

| predicted bin | mean predicted | observed | n |
|---|---|---|---|
| 0.0-0.1 | 5.7% | 5.3% | 18,519 |
| 0.1-0.2 | 14.5% | 13.8% | 10,239 |
| 0.2-0.3 | 23.5% | 22.5% | 7,301 |
| 0.3-0.4 | 34.1% | 32.3% | 6,323 |
| 0.4-0.5 | 44.5% | 40.2% | 7,026 |
| 0.5-0.6 | 54.5% | 51.5% | 1,688 |
| 0.6-0.7 | 64.9% | 60.2% | 2,563 |
| 0.7-0.8 | 73.8% | 72.5% | 527 |
| 0.8-0.9 | 84.3% | 80.4% | 653 |

### Book C — is the running extreme the day's?

Train 17,050 rows, test 9,370 rows. Base cells: checkpoint hour × range used × distance to the running extreme in σ. Unconditional train rate 60.2%.

Base model vs the unconditional rate: BSS **+0.331** (95% CI +0.315 to +0.348).

| added to base | test BSS vs base | 95% CI | informative? |
|---|---|---|---|
| sigmaReg | -0.0001 | -0.0027 to +0.0025 | no |
| hmm | -0.0016 | -0.0030 to -0.0001 | no |
| yRange | -0.0038 | -0.0069 to -0.0007 | no |
| event | -0.0003 | -0.0037 to +0.0032 | no |
| sigmaReg + hmm + yRange + event | -0.0048 | -0.0082 to -0.0011 | no |

Reliability of the base model on test (predicted vs observed):

| predicted bin | mean predicted | observed | n |
|---|---|---|---|
| 0.0-0.1 | 6.2% | 6.2% | 868 |
| 0.1-0.2 | 13.8% | 18.2% | 214 |
| 0.2-0.3 | 25.8% | 24.5% | 952 |
| 0.3-0.4 | 31.1% | 31.4% | 331 |
| 0.4-0.5 | 46.0% | 50.4% | 532 |
| 0.5-0.6 | 54.6% | 56.1% | 939 |
| 0.6-0.7 | 65.9% | 64.8% | 1,097 |
| 0.7-0.8 | 76.1% | 75.9% | 729 |
| 0.8-0.9 | 83.3% | 82.8% | 2,351 |
| 0.9-1.0 | 93.7% | 93.8% | 1,357 |

### Book B — after the forecast range completes: range extends to hl p75

Train 904 rows, test 435 rows. Base cells: completion direction × completion time (London). Unconditional train rate 50.2%.

Base model vs the unconditional rate: BSS **+0.044** (95% CI -0.004 to +0.096).

| added to base | test BSS vs base | 95% CI | informative? |
|---|---|---|---|
| drive | +0.0005 | -0.0084 to +0.0091 | no |
| sigmaReg | -0.0020 | -0.0153 to +0.0111 | no |
| hmm | +0.0009 | -0.0029 to +0.0044 | no |
| yRange | -0.0124 | -0.0321 to +0.0054 | no |
| event | +0.0026 | -0.0038 to +0.0089 | no |
| drive + sigmaReg + hmm + yRange + event | +0.0021 | -0.0097 to +0.0133 | no |

Reliability of the base model on test (predicted vs observed):

| predicted bin | mean predicted | observed | n |
|---|---|---|---|
| 0.2-0.3 | 23.4% | 28.6% | 84 |
| 0.4-0.5 | 47.3% | 50.0% | 124 |
| 0.5-0.6 | 51.5% | 45.6% | 125 |
| 0.6-0.7 | 66.7% | 60.8% | 102 |

### Book B — after the forecast range completes: range extends to hl p90

Train 906 rows, test 442 rows. Base cells: completion direction × completion time (London). Unconditional train rate 20.3%.

Base model vs the unconditional rate: BSS **+0.023** (95% CI -0.010 to +0.054).

| added to base | test BSS vs base | 95% CI | informative? |
|---|---|---|---|
| drive | +0.0013 | -0.0111 to +0.0149 | no |
| sigmaReg | -0.0064 | -0.0164 to +0.0032 | no |
| hmm | -0.0001 | -0.0063 to +0.0058 | no |
| yRange | -0.0154 | -0.0269 to -0.0044 | no |
| event | -0.0024 | -0.0116 to +0.0067 | no |
| drive + sigmaReg + hmm + yRange + event | -0.0001 | -0.0137 to +0.0157 | no |

Reliability of the base model on test (predicted vs observed):

| predicted bin | mean predicted | observed | n |
|---|---|---|---|
| 0.0-0.1 | 5.1% | 9.8% | 41 |
| 0.1-0.2 | 17.3% | 16.7% | 281 |
| 0.2-0.3 | 20.3% | 64.7% | 17 |
| 0.3-0.4 | 30.8% | 29.1% | 103 |

### Book B — after the forecast range completes: price returns to the open

Train 896 rows, test 437 rows. Base cells: completion direction × completion time (London). Unconditional train rate 16.3%.

Base model vs the unconditional rate: BSS **+0.014** (95% CI -0.016 to +0.044).

| added to base | test BSS vs base | 95% CI | informative? |
|---|---|---|---|
| drive | +0.0002 | -0.0120 to +0.0143 | no |
| sigmaReg | -0.0028 | -0.0161 to +0.0120 | no |
| hmm | -0.0003 | -0.0044 to +0.0038 | no |
| yRange | -0.0067 | -0.0155 to +0.0021 | no |
| event | -0.0026 | -0.0076 to +0.0026 | no |
| drive + sigmaReg + hmm + yRange + event | -0.0012 | -0.0143 to +0.0129 | no |

Reliability of the base model on test (predicted vs observed):

| predicted bin | mean predicted | observed | n |
|---|---|---|---|
| 0.0-0.1 | 4.9% | 9.6% | 83 |
| 0.1-0.2 | 15.6% | 17.5% | 252 |
| 0.2-0.3 | 24.2% | 25.5% | 102 |

### Book B — after the forecast range completes: price returns to the middle of the range

Train 906 rows, test 443 rows. Base cells: completion direction × completion time (London). Unconditional train rate 26.6%.

Base model vs the unconditional rate: BSS **+0.069** (95% CI +0.040 to +0.099).

| added to base | test BSS vs base | 95% CI | informative? |
|---|---|---|---|
| drive | -0.0033 | -0.0067 to +0.0002 | no |
| sigmaReg | +0.0017 | -0.0056 to +0.0089 | no |
| hmm | -0.0008 | -0.0022 to +0.0007 | no |
| yRange | -0.0027 | -0.0141 to +0.0090 | no |
| event | -0.0036 | -0.0130 to +0.0059 | no |
| drive + sigmaReg + hmm + yRange + event | +0.0009 | -0.0047 to +0.0065 | no |

Reliability of the base model on test (predicted vs observed):

| predicted bin | mean predicted | observed | n |
|---|---|---|---|
| 0.0-0.1 | 8.5% | 8.3% | 84 |
| 0.2-0.3 | 26.1% | 27.7% | 256 |
| 0.3-0.4 | 37.1% | 48.5% | 103 |

## The book, as tables (train rate → test rate)

### A. 07:00 London: chance of reaching each line by the end of the day

| line | distance (σ) | train | test | n test |
|---|---|---|---|---|
| Close_p50 | <0.25 | 86% | 77% | 98 |
| Close_p50 | 0.25-0.5 | 66% | 61% | 417 |
| Close_p50 | 0.5-1 | 42% | 39% | 1023 |
| Close_p50 | >1 | 21% | 20% | 204 |
| OHOL_p50 | <0.25 | 86% | 76% | 107 |
| OHOL_p50 | 0.25-0.5 | 65% | 62% | 430 |
| OHOL_p50 | 0.5-1 | 43% | 39% | 1007 |
| OHOL_p50 | >1 | 21% | 18% | 192 |
| Close_p75 | 0.25-0.5 | 76% | 45% | 31 |
| Close_p75 | 0.5-1 | 35% | 33% | 578 |
| Close_p75 | >1 | 18% | 18% | 1242 |
| OHOL_p75 | 0.25-0.5 | 71% | 49% | 35 |
| OHOL_p75 | 0.5-1 | 35% | 35% | 632 |
| OHOL_p75 | >1 | 19% | 18% | 1184 |
| OHOL_p90 | 0.5-1 | 44% | 32% | 38 |
| OHOL_p90 | >1 | 10% | 9% | 1830 |
| Range_p50 | 0.25-0.5 | 75% | 70% | 27 |
| Range_p50 | 0.5-1 | 57% | 50% | 472 |
| Range_p50 | >1 | 44% | 40% | 416 |
| Range_p75 | 0.5-1 | 50% | 36% | 53 |
| Range_p75 | >1 | 25% | 21% | 873 |
| Range_p90 | >1 | 10% | 9% | 926 |

### B. After the forecast range completes

| completion | time (London) | days train/test | → p75 range | → p90 range | back to open | back to mid |
|---|---|---|---|---|---|---|
| down-drive (Proj L) | <08 | 17/12 | – | – | – | – |
| down-drive (Proj L) | 08-13 | 125/55 | 67% → 62% | 30% → 25% | 23% → 25% | 36% → 40% |
| down-drive (Proj L) | 13-17 | 228/115 | 52% → 42% | 18% → 15% | 15% → 18% | 24% → 29% |
| down-drive (Proj L) | 17+ | 76/41 | 20% → 17% | 4% → 10% | 3% → 10% | 8% → 5% |
| up-drive (Proj H) | <08 | 12/5 | – | – | – | – |
| up-drive (Proj H) | 08-13 | 111/48 | 67% → 60% | 31% → 33% | 24% → 26% | 38% → 58% |
| up-drive (Proj H) | 13-17 | 251/124 | 47% → 48% | 18% → 20% | 16% → 16% | 27% → 27% |
| up-drive (Proj H) | 17+ | 86/43 | 26% → 40% | 12% → 12% | 5% → 9% | 7% → 12% |

### B. Down-drive (high set first, then the predicted low): the next line touched

| next line | train | test |
|---|---|---|
| OL_p75 | 46% | 51% |
| none | 29% | 23% |
| multi | 19% | 17% |
| Open | 5% | 7% |
| OL_p50 | 0% | 2% |
| CloseDn_p50 | 0% | 1% |

### C. Is the running high/low the day's? Chance it gets exceeded later

| checkpoint | range used | train | test | n test |
|---|---|---|---|---|
| 07:00 | <0.4 | 81% | 79% | 1322 |
| 07:00 | 0.4-0.7 | 72% | 72% | 476 |
| 07:00 | 0.7-1 | 64% | 63% | 60 |
| 07:00 | >1 | 37% | 56% | 16 |
| 10:00 | <0.4 | 72% | 70% | 446 |
| 10:00 | 0.4-0.7 | 62% | 62% | 1032 |
| 10:00 | 0.7-1 | 54% | 52% | 278 |
| 10:00 | >1 | 44% | 44% | 118 |
| 13:00 | <0.4 | 66% | 64% | 194 |
| 13:00 | 0.4-0.7 | 55% | 58% | 982 |
| 13:00 | 0.7-1 | 46% | 48% | 458 |
| 13:00 | >1 | 39% | 38% | 240 |
| 16:00 | <0.4 | 50% | 29% | 24 |
| 16:00 | 0.4-0.7 | 32% | 36% | 532 |
| 16:00 | 0.7-1 | 27% | 28% | 640 |
| 16:00 | >1 | 26% | 23% | 678 |
