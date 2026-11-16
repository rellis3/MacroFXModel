# vol-layer-features-confirm — results

Prereg: `forge/VOL_LAYER_FEATURES_CONFIRM_PREREG.md` (amendment A1, PRE-RESULTS, pushed in `b7f4a8cd` before any 2023+ read).
Run 2026-11-16, seed 20261116, B = 2000 (stationary date-block bootstrap, block 20, over sessions).
Branch `main` (worktree). Ledger ids: `vol-layer-features-confirm-tod`, `-sig`, `-fr`, `-eq`.
Script: `scripts/vol-layer-features-confirm/run.py` (step0, then confirm, run once). Proof: `scripts/vol-layer-features-confirm/proof.py` → `checks.json`.

## Verdict: split. TOD VALIDATED · SIG NULL · FR VALIDATED · EQ VALIDATED

The confirm window is 2023-01-02 → 2026-08-20: 949 weekdays, of which 942 sessions are complete (2023 258, 2024 260, 2025 259, 2026 165). The lockbox was not touched.

- **TOD replicates.** The dollar share is higher in the 13–16 London overlap than in Asia (USDCAD reversed): +0.183 [+0.155, +0.215] against a +0.10 bar. Discovery was +0.163. Every gate part holds.
- **SIG does not replicate at the size that matters.** High-σ minus low-σ dollar share is +0.045 [−0.009, +0.096]. That is under half of discovery's +0.118. The whole interval is below the +0.10 bar, so an effect of that size is ruled out.
- **FR replicates.** After the Forbes-Rigobon correction, loud days are less correlated than quiet days: −0.150 [−0.203, −0.093] against a −0.05 bar. Discovery was −0.100. Every gate part holds.
- **EQ replicates.** Dollar-led and own-led big moves follow through the same, within the margins at both horizons. 1h: +0.0013σ [−0.0072, +0.0096] (margin ±0.018). Rest of session: −0.0023σ [−0.0210, +0.0179] (margin ±0.042). TOST p < 0.0005.

## Step 0 (before the 2023+ read)

- **Discovery reproduction:** all five §2 values match to 3 dp: TOD +0.16339, SIG +0.11824, FR −0.10027, EQ 1h −0.00061σ, EQ rest −0.01012σ.
- **Planted control:** share by bucket max error 0.008; TOD error 0.0003; SIG error −0.005; EQ 90% coverage 88/100 (1h) and 86/100 (rest).
- **FR control:** the pipeline recovers its own population value (error −0.004). The prereg's literal FR claim failed. A1 replaced it; see `STEP0_FAILED.md`.
- Raw output: `discovery/step0.json`.

## Scored cells

p is the two-sided bootstrap p (B = 2000; 0 replicates on the far side is shown as < 0.0005). MDE is `mdeFromCI` at 80% power, two-sided α = 0.0125, from the realised interval. For EQ it is the smallest margin TOST could confirm.

| Cell | n (sessions) | Estimate | 95% CI | MDE (α 0.0125) | Pass bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| TOD | 942 | +0.183 | [+0.155, +0.215] | 0.051 | +0.10 | < 0.0005 | **VALIDATED** |
| SIG | 942 | +0.045 | [−0.009, +0.096] | 0.089 | +0.10 | 0.107 | **NULL** |
| FR | 942 | −0.150 | [−0.203, −0.093] | 0.093 | −0.05 | < 0.0005 | **VALIDATED** |
| EQ 1h | 942 (26,142 dollar-led / 20,454 own-led) | +0.0013σ | [−0.0072, +0.0096] | 0.0151σ | ±0.018σ | < 0.0005 (TOST) | **VALIDATED** (both horizons) |
| EQ rest | 942 (26,096 / 20,540) | −0.0023σ | [−0.0210, +0.0179] | 0.0350σ | ±0.042σ | (same cell) | |

### Gate parts

| Part | TOD | SIG | FR | EQ |
|---|---|---|---|---|
| Holm p < 0.05, predicted sign | yes | no (0.107) | yes | yes |
| Estimate at or beyond the bar | yes | no | yes | n/a (TOST) |
| Plateau | yes. β10 +0.183, β40 +0.183, edges −1h +0.180, edges +1h +0.136 | yes. Quartiles +0.049, quintiles +0.049, β10 +0.045, β40 +0.044 | yes. Top2/bottom2 −0.189, top4/bottom4 −0.130 | yes: all 26 neighbours inside ±0.018σ (largest 0.0040σ) |
| +1 lag | yes, +0.183 | **no**, +0.018 (under half of base) | yes, −0.141 [−0.205, −0.072] | yes. 1h +0.0031σ, rest +0.0074σ |
| Years, same sign / inside margins | 4 of 4. 2023 +0.227, 2024 +0.243, 2025 +0.127, 2026 +0.093 | 4 of 4 positive. +0.088, +0.065, +0.002, +0.051 | 4 of 4. −0.072, −0.122, −0.213, −0.174 | 4 of 4 inside both margins. Worst: 2026 1h −0.0149, rest −0.0338 |
| Per pair | 7 of 7 predicted sign (+0.10 to +0.26) | 7 of 7 positive (+0.019 to +0.077) | n/a | n/a |

**Why SIG is NULL, not UNDERPOWERED.** The §5 note says "a miss reads UNDERPOWERED, never NULL". That note covers an estimate near discovery's +0.12 that misses the bar. Here the estimate is +0.045. The whole 95% interval sits below +0.10, which is §4's NULL rule ("CI wholly on the near side of the bar"). The realised MDE (0.089) is below the bar, so the test could have found a +0.10 effect. The verdict gate agrees (NULL). **Graded read:** the dollar share still rises a little with σ. It is positive in all 7 pairs and all 4 years. But the rise is about +0.05, not the +0.10 a book-risk note would need, and it is fragile:
- with yesterday's σ it is +0.018;
- ranked against σ's own trailing 252 sessions (point in time) it is −0.004;
- so most of the window-cut effect is a slow sort between calmer and busier stretches, not a day-by-day signal.

## Controls and mirrors

- **TOD mirror (wrong-day factor).** In-sample r² 0.006 for every pair, against discovery's 0.005. The out-of-sample share is −0.29 to −0.69. Pooled real shares are 0.28 (USDJPY) to 0.68 (NZDUSD).
- **SIG mirror (low third).** The mean share by σ third is 0.514 / 0.559 / 0.559. By quintile it is 0.501 / 0.539 / 0.551 / 0.578 / 0.551. The rise is all between the first and second third.
- **FR mirror (forward map, a description after A1).** Quiet-day ρ is 0.546. Loud-day raw ρ is 0.612. A dollar-only rise via the forward map would give 0.764; the correction gives 0.396. The mean δ is 2.66. The raw rise is +0.066 [+0.017, +0.115]. Across the decile ladder, corrected ρ falls from 0.539 (decile 1) to 0.303 (decile 10), while the forward map climbs to 0.847.
- **EQ mirror (all big moves).** 1h −0.0022σ [−0.0063, +0.0021]; rest −0.0028σ [−0.0118, +0.0048]. The round trip is 0.0365σ (1h) and 0.0533σ (rest). Neither label, nor the pool, follows through by more than a fraction of the spread.
- **EQ fade stop-through at 0.25σ (descriptive):** dollar-led 57.2%, own-led 57.6%, all 57.3%. Discovery was 58.4% / 58.5%.
- **Proof pack** (`checks.json`; every gate word equals the banked word):
  - each cell reproduces `results.json` exactly;
  - planted effects at the large size and at the bar are recovered in full (TOD 0.20 / 0.10, SIG 0.20 / 0.10, FR 0.10 / 0.05, EQ break 2 / 1 margins);
  - all four shuffles include 0 (TOD [−0.025, +0.020], SIG [−0.013, +0.020], FR [−0.044, +0.038], EQ raw 1h [−0.0056, +0.0055]).

## Deviations from the prereg

- **A1 (2026-11-16, PRE-RESULTS)** replaced the literal FR positive-control check. It changed no scored statistic. The prereg was amended and pushed before the confirm run.
- No post-hoc amendments.
- Implementation choices within the prereg's wording:
  - **Warm-up:** the window starts at the 60th-last complete session of 2022 (2022-10-07). Incomplete weekdays inside the warm-up stay in the rolling β and threshold windows, as in discovery.
  - **SIG per-year values** use the window's thirds, restricted to the year.
  - **FR deciles** are cut within each scored calendar year only.
  - **EQ event counts** are events with a finite outcome at that horizon.
  - **TOD mirror permutation:** the wrong-day permutation is among scored complete sessions.

## Descriptive (not part of the verdict)

**Share by pair and London bucket** (5-minute returns, point-in-time β, 2023–26):

| Pair | Pooled | Asia 00–07 | Open 07–10 | Mid 10–13 | Overlap 13–16 | NY pm 16–22 |
|---|---|---|---|---|---|---|
| EURUSD | 0.67 | 0.59 | 0.56 | 0.60 | 0.75 | 0.73 |
| GBPUSD | 0.63 | 0.60 | 0.53 | 0.50 | 0.72 | 0.70 |
| AUDUSD | 0.62 | 0.50 | 0.58 | 0.62 | 0.74 | 0.65 |
| NZDUSD | 0.68 | 0.54 | 0.63 | 0.67 | 0.80 | 0.70 |
| USDCAD | 0.46 | 0.54 | 0.48 | 0.41 | 0.44 | 0.44 |
| USDCHF | 0.51 | 0.46 | 0.38 | 0.43 | 0.61 | 0.53 |
| USDJPY | 0.28 | 0.18 | 0.19 | 0.24 | 0.42 | 0.29 |

The dollar share runs higher in 2023–26 than in discovery; for example, GBPUSD averaged 0.19–0.56 by year in discovery and is 0.63 pooled here. The 15-minute proxy gives the same picture: TOD on 15-minute returns is +0.182 [+0.149, +0.217], and the bucket shares agree within about 0.03.

**(d) Joint worst days** (2,000 shuffles, BH q = 0.10 over 28 counts: 9 pass, 1.4 expected by chance at α 0.05):
- Discovery's two standouts only partly carry over.
  - USDCAD abs: 6 vs 2.4 at the 5% tail (p 0.047, not BH); 17 vs 9.3 at 10% (BH).
  - GBPUSD same-direction: does not repeat (1 vs 1.2).
- New this window:
  - USDJPY: abs 5% 7 vs 2.4, same-direction 5% 6 vs 1.2, abs 10% 18 vs 9.3.
  - USDCHF: abs 5% 7 vs 2.2, same-direction 5% 5 vs 1.1, same-direction 10% 10 vs 4.5.
  - NZDUSD abs 5%: 8 vs 2.4.
  - EURUSD abs 10%: 18 vs 9.4.
- So joint dollar-and-own tails are common in 2023–26, and which pairs show them changes between windows.

**(e) Absorption ratio** (rolling 63 complete sessions ending t−1):
- The top PC share averages 0.668 (range 0.552–0.744). The shuffled benchmark is 0.149.
- The participation ratio is 2.13 (shuffled 6.99). By year the top PC share is 0.680, 0.651, 0.653 and 0.698.
- PC1 loadings are very stable: the median angle between back-to-back windows is 2.9°.
- The majors moved as one dollar block more in 2023–26 than in discovery (discovery mean 0.56).

**Disaggregation** (75 slice cells, BH q = 0.10: 49 pass; 3.75 of 47 raw p < 0.05 expected by chance). These are candidates, not results.
- All 7 TOD pairs, the TOD 15-minute pairs and all 4 FR years pass.
- No SIG pair passes.
- 1 EQ slice passes: NZDUSD 1h, +0.012σ [−0.000, +0.025], still inside the margin.

## What this changes

- **TOD VALIDATED.** The Book risk slot may say "the dollar share by hour (peak 13–16 London, lowest in Asia; USDCAD reversed) is confirmed out of sample". An hourly dollar-cluster budget can be proposed as a shadow arm beside the live book. It cannot size live money without |t| ≥ 3 and its own shadow record. Here |t| ≈ 12.
- **SIG NULL.** Drop "the dollar share rises with σ" as a book-risk note. At most say "a small rise (+0.05) between calm and busy stretches; it does not hold day by day".
- **FR VALIDATED.** "Loud days are own-move days, not dollar takeovers" is confirmed. A cluster cap need not tighten on loud days. Per A1, the bar is conservative: a dollar-only rise would push F positive.
- **EQ VALIDATED.** "Dollar-led and own-led big moves trade the same" is banked. The dollar / own label is closed as an entry, stop or filter input for big 15-minute moves.
- **What would reopen these:**
  - SIG: a point-in-time σ-rank effect of at least 0.10 on the lockbox or a forward record.
  - EQ: a label effect outside the margins in a new geometry, such as line touches. That needs its own prereg.
