# day-type-expansion — results

Prereg: `forge/DAY_TYPE_EXPANSION_PREREG.md` (committed in `unknown`). Run 2026-11-15, seed 20261114, B = 2000. Branch `claude/signal-bot-bias-analysis-bwr1qv`. Ledger ids: `day-type-expansion-fx`, `day-type-expansion-gold`, `day-type-expansion-idx`.

## Verdict: fx NULL · gold NULL · idx UNDERPOWERED

Registered gate per family × k cell: G1 BSS vs σ-only (B1) 95% CI lower > 0 and Holm p < 0.05 over 9 cells; G2 BSS vs B0 CI lower > 0; G3 BSS_B1 > 0 in both halves; G4 above the 95th percentile of the shift placebo (P1) and month-block label permutation (P2); G5 calibration slope ≥ 0.5. Useful effect U = +2.0% BSS_B1.

## Scored cells

| Cell | n dates | base rate | BSS vs B1 | 95% CI | BSS vs B0 | MDE | Pass bar | Holm p | G1 G2 G3 G4 G5 | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| fx k=0.5 | 991 | 0.335 | +0.06% | [-0.53%, +0.76%] | -0.33% | +1.8% | +2.0% | 1.000 | - - - Y - | NULL |
| fx k=0.75 | 991 | 0.253 | +0.17% | [-0.51%, +0.95%] | -0.23% | +1.8% | +2.0% | 1.000 | - - - Y Y | NULL |
| fx k=1.0 | 991 | 0.182 | +0.31% | [-0.59%, +1.25%] | +0.07% | +1.8% | +2.0% | 1.000 | - - - Y Y | NULL |
| gold k=0.5 | 953 | 0.325 | -0.36% | [-1.23%, +0.56%] | +0.04% | +5.4% | +2.0% | 1.000 | - - - - Y | NULL |
| gold k=0.75 | 953 | 0.268 | -0.43% | [-1.18%, +0.31%] | +0.22% | +5.4% | +2.0% | 1.000 | - - - - Y | NULL |
| gold k=1.0 | 953 | 0.198 | -0.69% | [-1.83%, +0.16%] | -0.07% | +5.4% | +2.0% | 1.000 | - - - - - | NULL |
| idx k=0.5 | 949 | 0.392 | -0.35% | [-1.75%, +1.10%] | -1.61% | +5.1% | +2.0% | 1.000 | - - - - - | NULL |
| idx k=0.75 | 949 | 0.317 | +1.36% | [-0.18%, +2.91%] | +0.42% | +5.1% | +2.0% | 0.721 | - - - Y Y | UNDERPOWERED |
| idx k=1.0 | 949 | 0.237 | +1.88% | [+0.39%, +3.43%] | +1.61% | +5.1% | +2.0% | 0.147 | - - - Y Y | UNDERPOWERED |

## Controls (placebo, halves, calibration)

| Cell | H1 / H2 | P1 95th (pct of real) | P2 95th (pct of real) | SE used | AUC M [CI] | AUC B1 | cal. slope | capture M / B1 (20% chance) |
|---|---|---|---|---|---|---|---|---|
| fx k=0.5 | +0.28% / -0.19% | +0.06% (95) | +0.01% (98) | +0.33% | 0.525 [0.503, 0.548] | 0.516 | 0.42 | 27.1% / 32.0% |
| fx k=0.75 | +0.67% / -0.40% | +0.09% (98) | +0.01% (100) | +0.38% | 0.544 [0.521, 0.569] | 0.528 | 0.57 | 26.2% / 30.9% |
| fx k=1.0 | +1.32% / -0.89% | +0.08% (100) | +0.01% (100) | +0.47% | 0.562 [0.534, 0.593] | 0.545 | 0.68 | 23.5% / 29.5% |
| gold k=0.5 | -0.66% / +0.00% | +0.20% (69) | +0.08% (76) | +0.58% | 0.544 [0.498, 0.584] | 0.545 | 0.53 | 16.2% / 14.2% |
| gold k=0.75 | -0.55% / -0.29% | +0.21% (61) | +0.01% (70) | +0.59% | 0.556 [0.508, 0.603] | 0.557 | 0.59 | 16.3% / 15.1% |
| gold k=1.0 | -0.41% / -1.04% | +0.14% (38) | +0.11% (47) | +0.63% | 0.549 [0.502, 0.588] | 0.567 | 0.42 | 15.3% / 14.1% |
| idx k=0.5 | -2.10% / +1.72% | +0.23% (68) | +0.08% (68) | +0.74% | 0.524 [0.492, 0.559] | 0.495 | 0.20 | 21.3% / 23.9% |
| idx k=0.75 | -0.88% / +4.29% | +0.22% (100) | +0.08% (100) | +0.80% | 0.561 [0.529, 0.598] | 0.505 | 0.55 | 21.2% / 26.2% |
| idx k=1.0 | -0.28% / +4.93% | +0.20% (100) | +0.14% (100) | +0.78% | 0.585 [0.550, 0.626] | 0.513 | 0.77 | 21.7% / 16.8% |

Positive control (run before any M1 was read): planted BSS_B1 +1.94% CI [+0.70%, +3.04%], null -0.27%: PASSED.

Label drops (coverage, half-days): EURUSD 3/1520, GBPUSD 3/1520, USDJPY 3/1520, AUDUSD 19/1520, USDCAD 7/1520, USDCHF 38/1520, GOLD 4/1464, NQ 4/1459, SPX500 7/1459.

## Deviations from the prereg

None.

## Descriptive (not part of the verdict)

- **fx_k0.5**: B1 vs B0 -0.40%; HAR-800 label -0.11%; 07-16 window -0.28%; rolling 3y -0.02%; event days +0.08%, no-event +0.04%; without top 1% |move| -0.05%; by year T1 +0.15%, T2 +0.42%, T3 -0.09%, T4 -0.30%
- **fx_k0.75**: B1 vs B0 -0.40%; HAR-800 label -0.12%; 07-16 window +0.14%; rolling 3y +0.16%; event days -0.07%, no-event +0.50%; without top 1% |move| +0.05%; by year T1 +0.07%, T2 +1.31%, T3 -0.39%, T4 -0.41%
- **fx_k1.0**: B1 vs B0 -0.25%; HAR-800 label -0.00%; 07-16 window +0.43%; rolling 3y +0.21%; event days -0.14%, no-event +1.00%; without top 1% |move| +0.20%; by year T1 +0.42%, T2 +2.30%, T3 -1.04%, T4 -0.70%
- **gold_k0.5**: B1 vs B0 +0.40%; HAR-800 label -0.17%; 07-16 window -0.07%; rolling 3y -0.59%; event days -0.92%, no-event +0.33%; without top 1% |move| -0.41%; by year T1 +1.01%, T2 -2.44%, T3 -0.06%, T4 +0.08%
- **gold_k0.75**: B1 vs B0 +0.65%; HAR-800 label -0.41%; 07-16 window -0.10%; rolling 3y -0.63%; event days -0.70%, no-event -0.09%; without top 1% |move| -0.51%; by year T1 +0.34%, T2 -1.58%, T3 -0.05%, T4 -0.67%
- **gold_k1.0**: B1 vs B0 +0.61%; HAR-800 label -0.37%; 07-16 window -0.20%; rolling 3y -0.81%; event days -1.01%, no-event -0.26%; without top 1% |move| -0.66%; by year T1 +0.36%, T2 -1.32%, T3 -1.53%, T4 -0.36%
- **idx_k0.5**: B1 vs B0 -1.25%; HAR-800 label -0.18%; 07-16 window -0.40%; rolling 3y -0.49%; event days -1.33%, no-event +0.90%; without top 1% |move| -0.09%; by year T1 -3.99%, T2 -0.06%, T3 +1.86%, T4 +1.55%; gamma sign on top of M (covered subset, 499 dates) +0.16%
- **idx_k0.75**: B1 vs B0 -0.95%; HAR-800 label +0.10%; 07-16 window +1.82%; rolling 3y +1.31%; event days +0.73%, no-event +2.22%; without top 1% |move| +1.57%; by year T1 -2.28%, T2 +0.65%, T3 +5.02%, T4 +3.40%; gamma sign on top of M (covered subset, 499 dates) +0.14%
- **idx_k1.0**: B1 vs B0 -0.28%; HAR-800 label +0.47%; 07-16 window +1.84%; rolling 3y +1.63%; event days +1.67%, no-event +2.18%; without top 1% |move| +1.95%; by year T1 -1.12%, T2 +0.66%, T3 +6.46%, T4 +3.10%; gamma sign on top of M (covered subset, 499 dates) +0.53%

Disaggregation (instrument × k, BH q 0.10): 0 of 27 survive (expected at 5%: 1.4; P(≥ that many) 1.000). Survivors are candidates for their own prereg, never results.

| inst | k | BSS vs B1 | 95% CI | BH |
|---|---|---|---|---|
| EURUSD | 0.5 | +0.01% | [-0.95%, +1.05%] | - |
| GBPUSD | 0.5 | -0.29% | [-1.39%, +0.85%] | - |
| USDJPY | 0.5 | +0.54% | [-0.47%, +1.80%] | - |
| AUDUSD | 0.5 | -0.25% | [-1.26%, +0.78%] | - |
| USDCAD | 0.5 | -0.20% | [-1.08%, +0.77%] | - |
| USDCHF | 0.5 | +0.59% | [-0.25%, +1.49%] | - |
| EURUSD | 0.75 | +0.71% | [-0.39%, +2.03%] | - |
| GBPUSD | 0.75 | +0.02% | [-1.04%, +1.02%] | - |
| USDJPY | 0.75 | +0.97% | [-0.17%, +2.32%] | - |
| AUDUSD | 0.75 | -0.82% | [-1.81%, +0.40%] | - |
| USDCAD | 0.75 | -0.01% | [-1.13%, +1.03%] | - |
| USDCHF | 0.75 | +0.21% | [-0.79%, +1.30%] | - |
| EURUSD | 1.0 | +1.14% | [-0.15%, +2.60%] | - |
| GBPUSD | 1.0 | -0.11% | [-1.42%, +0.98%] | - |
| USDJPY | 1.0 | +1.05% | [-0.15%, +2.67%] | - |
| AUDUSD | 1.0 | -0.55% | [-2.03%, +1.05%] | - |
| USDCAD | 1.0 | -0.28% | [-1.93%, +1.20%] | - |
| USDCHF | 1.0 | +0.70% | [-0.62%, +2.08%] | - |
| GOLD | 0.5 | -0.36% | [-1.19%, +0.58%] | - |
| GOLD | 0.75 | -0.43% | [-1.17%, +0.29%] | - |
| GOLD | 1.0 | -0.69% | [-1.88%, +0.11%] | - |
| NQ | 0.5 | -0.22% | [-1.78%, +1.56%] | - |
| SPX500 | 0.5 | -0.49% | [-1.97%, +1.00%] | - |
| NQ | 0.75 | +2.03% | [+0.05%, +3.61%] | - |
| SPX500 | 0.75 | +0.67% | [-1.01%, +2.83%] | - |
| NQ | 1.0 | +1.62% | [-0.12%, +3.37%] | - |
| SPX500 | 1.0 | +2.16% | [+0.51%, +4.10%] | - |

## Calibration by decile (pooled family test rows)

- fx k=0.5: d1 p 0.28 / real 0.31 (n 594); d2 p 0.31 / real 0.36 (n 594); d3 p 0.32 / real 0.31 (n 594); d4 p 0.33 / real 0.31 (n 594); d5 p 0.34 / real 0.32 (n 594); d6 p 0.35 / real 0.31 (n 594); d7 p 0.36 / real 0.32 (n 594); d8 p 0.37 / real 0.34 (n 594); d9 p 0.40 / real 0.37 (n 594); d10 p 0.47 / real 0.40 (n 594)
- fx k=0.75: d1 p 0.20 / real 0.20 (n 594); d2 p 0.23 / real 0.26 (n 594); d3 p 0.25 / real 0.23 (n 594); d4 p 0.26 / real 0.22 (n 594); d5 p 0.27 / real 0.22 (n 594); d6 p 0.28 / real 0.25 (n 594); d7 p 0.29 / real 0.29 (n 594); d8 p 0.31 / real 0.28 (n 594); d9 p 0.33 / real 0.29 (n 594); d10 p 0.39 / real 0.30 (n 594)
- fx k=1.0: d1 p 0.13 / real 0.14 (n 594); d2 p 0.16 / real 0.14 (n 594); d3 p 0.17 / real 0.17 (n 594); d4 p 0.19 / real 0.15 (n 594); d5 p 0.20 / real 0.18 (n 594); d6 p 0.21 / real 0.17 (n 594); d7 p 0.22 / real 0.20 (n 594); d8 p 0.24 / real 0.20 (n 594); d9 p 0.26 / real 0.21 (n 594); d10 p 0.32 / real 0.26 (n 594)
- gold k=0.5: d1 p 0.23 / real 0.23 (n 96); d2 p 0.28 / real 0.31 (n 95); d3 p 0.30 / real 0.38 (n 95); d4 p 0.32 / real 0.28 (n 95); d5 p 0.33 / real 0.28 (n 96); d6 p 0.34 / real 0.32 (n 95); d7 p 0.36 / real 0.37 (n 95); d8 p 0.38 / real 0.38 (n 95); d9 p 0.41 / real 0.35 (n 95); d10 p 0.46 / real 0.36 (n 96)
- gold k=0.75: d1 p 0.17 / real 0.17 (n 96); d2 p 0.21 / real 0.23 (n 95); d3 p 0.23 / real 0.29 (n 95); d4 p 0.24 / real 0.20 (n 95); d5 p 0.26 / real 0.29 (n 96); d6 p 0.27 / real 0.24 (n 95); d7 p 0.29 / real 0.28 (n 95); d8 p 0.31 / real 0.34 (n 95); d9 p 0.33 / real 0.37 (n 95); d10 p 0.39 / real 0.26 (n 96)
- gold k=1.0: d1 p 0.09 / real 0.16 (n 96); d2 p 0.13 / real 0.16 (n 95); d3 p 0.15 / real 0.24 (n 95); d4 p 0.16 / real 0.18 (n 95); d5 p 0.18 / real 0.17 (n 96); d6 p 0.19 / real 0.21 (n 95); d7 p 0.21 / real 0.14 (n 95); d8 p 0.23 / real 0.19 (n 95); d9 p 0.26 / real 0.27 (n 95); d10 p 0.31 / real 0.27 (n 96)
- idx k=0.5: d1 p 0.26 / real 0.37 (n 190); d2 p 0.32 / real 0.39 (n 189); d3 p 0.35 / real 0.32 (n 189); d4 p 0.37 / real 0.38 (n 190); d5 p 0.39 / real 0.40 (n 189); d6 p 0.41 / real 0.46 (n 189); d7 p 0.44 / real 0.33 (n 190); d8 p 0.46 / real 0.44 (n 189); d9 p 0.49 / real 0.42 (n 189); d10 p 0.56 / real 0.43 (n 190)
- idx k=0.75: d1 p 0.20 / real 0.25 (n 190); d2 p 0.24 / real 0.26 (n 189); d3 p 0.27 / real 0.27 (n 189); d4 p 0.29 / real 0.35 (n 190); d5 p 0.31 / real 0.27 (n 189); d6 p 0.34 / real 0.34 (n 189); d7 p 0.36 / real 0.28 (n 190); d8 p 0.39 / real 0.34 (n 189); d9 p 0.42 / real 0.39 (n 189); d10 p 0.50 / real 0.42 (n 190)
- idx k=1.0: d1 p 0.14 / real 0.16 (n 190); d2 p 0.17 / real 0.20 (n 189); d3 p 0.19 / real 0.25 (n 189); d4 p 0.21 / real 0.19 (n 190); d5 p 0.23 / real 0.18 (n 189); d6 p 0.25 / real 0.20 (n 189); d7 p 0.27 / real 0.25 (n 190); d8 p 0.29 / real 0.28 (n 189); d9 p 0.32 / real 0.32 (n 189); d10 p 0.39 / real 0.35 (n 190)

## What this changes

- **FX and gold (NULL):** the morning card does not add a separate range-day / expansion-day call. The validated inputs
  (IV vs RV, VIX curve, stress, event size, month-end, the prior day's speed) add nothing beyond the σ already in the
  shipped lines. The range lines remain the day-type read.
- **Indices (UNDERPOWERED):** k = 1.0 BSS vs σ-only is +1.88% [+0.39%, +3.43%] but fails Holm and the halves (all of
  it in the second half). Nothing ships. The candidate is a forward record of the index score, on fresh data only.
- **Reopen** with an input the σ lines do not already hold, or with more index years after the lockbox evaluation.


## Evidence pack (2026-11-15)

Diagnostics only (register row `evidence-pack-retrofit`, EXPLORATORY); the verdict above does not change. Built by `scripts/day-type-expansion/evidence.py` with the shared `scripts/evidence_pack/pack.py`.

The registered runner did not save its out-of-sample predictions; `evidence.py` rebuilds them with the runner's own functions and the rebuilt BSS_B1 matches every registered cell to 4 dp (predictions in `evidence/oos_predictions.parquet`). Statistic = BSS vs σ-only (B1), bar +2.0%. How to read it: (1) fx and gold are FLAT — a planted +2% BSS is found 87-100% of the time on the real rows, and every fx/gold interval stops below +1.2%. (2) idx k=1.0 has an interval above zero (+1.9% [+0.1%, +3.7%], close to the runner's [+0.4%, +3.4%]) but H1 is −0.3% and H2 +4.7%, so the pack labels it UNSTABLE; the banked UNDERPOWERED (Holm p 0.147, G3 halves failed) stands. (3) The shuffle placebo here moves the model's lift (pm − p1) to other dates within instrument; a misplaced lift adds Brier error, so the shuffled band is centred below zero and 'beats placebo' only means the lift is better than a randomly placed lift of the same size (fx and idx do; gold does not, 35th-59th pct). The runner's shift and month-block placebos are the binding ones. (4) Bootstrap is iid by date here (runner: 21-day blocks), so these CIs are slightly narrower than the registered ones. Canary: leaking the label gives BSS +1.0 in every cell.

| Cell | Diagnosis | Estimate [95% CI] | Bar | Planted 0.5×/1×/2× found | Shuffle pct | Halves H1 / H2 | Inst. same sign | Top-1% removed | Canary (leaked) | Charts |
|---|---|---|---|---|---|---|---|---|---|---|
| fx_k0.5 | **FLAT** | +0.000636 [-0.00551, +0.00752] | +0.02 | 100%/100%/100% | 100 | +0.00424 / -0.0031 | 50% | ✓ | +1 | [placebo](evidence/fx_k0.5/placebo.png) · [buckets](evidence/fx_k0.5/buckets.png) · [breakdown](evidence/fx_k0.5/breakdown.png) · [plants](evidence/fx_k0.5/plants.png) · [pack](evidence/fx_k0.5/EVIDENCE.md) |
| fx_k0.75 | **FLAT** | +0.0017 [-0.00481, +0.00832] | +0.02 | 100%/100%/100% | 100 | +0.00764 / -0.00449 | 67% | ✓ | +1 | [placebo](evidence/fx_k0.75/placebo.png) · [buckets](evidence/fx_k0.75/buckets.png) · [breakdown](evidence/fx_k0.75/breakdown.png) · [plants](evidence/fx_k0.75/plants.png) · [pack](evidence/fx_k0.75/EVIDENCE.md) |
| fx_k1.0 | **FLAT** | +0.00315 [-0.00506, +0.0116] | +0.02 | 100%/100%/100% | 100 | +0.0145 / -0.00925 | 50% | ✓ | +1 | [placebo](evidence/fx_k1.0/placebo.png) · [buckets](evidence/fx_k1.0/buckets.png) · [breakdown](evidence/fx_k1.0/breakdown.png) · [plants](evidence/fx_k1.0/plants.png) · [pack](evidence/fx_k1.0/EVIDENCE.md) |
| gold_k0.5 | **FLAT** | -0.00361 [-0.0117, +0.00499] | +0.02 | 0%/100%/100% | 59 | -0.0077 / +0.000935 | 100% | ✓ | +1 | [placebo](evidence/gold_k0.5/placebo.png) · [buckets](evidence/gold_k0.5/buckets.png) · [breakdown](evidence/gold_k0.5/breakdown.png) · [plants](evidence/gold_k0.5/plants.png) · [pack](evidence/gold_k0.5/EVIDENCE.md) |
| gold_k0.75 | **FLAT** | -0.00433 [-0.0112, +0.00277] | +0.02 | 3%/100%/100% | 35 | -0.00649 / -0.00193 | 100% | ✓ | +1 | [placebo](evidence/gold_k0.75/placebo.png) · [buckets](evidence/gold_k0.75/buckets.png) · [breakdown](evidence/gold_k0.75/breakdown.png) · [plants](evidence/gold_k0.75/plants.png) · [pack](evidence/gold_k0.75/EVIDENCE.md) |
| gold_k1.0 | **FLAT** | -0.0069 [-0.0193, +0.00523] | +0.02 | 0%/93%/100% | 49 | -0.00398 / -0.0104 | 100% | ✓ | +1 | [placebo](evidence/gold_k1.0/placebo.png) · [buckets](evidence/gold_k1.0/buckets.png) · [breakdown](evidence/gold_k1.0/breakdown.png) · [plants](evidence/gold_k1.0/plants.png) · [pack](evidence/gold_k1.0/EVIDENCE.md) |
| idx_k0.5 | **FLAT** | -0.00353 [-0.0184, +0.013] | +0.02 | 0%/87%/100% | 98 | -0.0232 / +0.0179 | 100% | ✓ | +1 | [placebo](evidence/idx_k0.5/placebo.png) · [buckets](evidence/idx_k0.5/buckets.png) · [breakdown](evidence/idx_k0.5/breakdown.png) · [plants](evidence/idx_k0.5/plants.png) · [pack](evidence/idx_k0.5/EVIDENCE.md) |
| idx_k0.75 | **INCONCLUSIVE** | +0.0136 [-0.00331, +0.0315] | +0.02 | 100%/100%/100% | 100 | -0.0109 / +0.0428 | 100% | ✓ | +1 | [placebo](evidence/idx_k0.75/placebo.png) · [buckets](evidence/idx_k0.75/buckets.png) · [breakdown](evidence/idx_k0.75/breakdown.png) · [plants](evidence/idx_k0.75/plants.png) · [pack](evidence/idx_k0.75/EVIDENCE.md) |
| idx_k1.0 | **UNSTABLE** | +0.0188 [+0.00143, +0.0366] | +0.02 | 100%/100%/100% | 100 | -0.00276 / +0.0472 | 100% | ✓ | +1 | [placebo](evidence/idx_k1.0/placebo.png) · [buckets](evidence/idx_k1.0/buckets.png) · [breakdown](evidence/idx_k1.0/breakdown.png) · [plants](evidence/idx_k1.0/plants.png) · [pack](evidence/idx_k1.0/EVIDENCE.md) |
