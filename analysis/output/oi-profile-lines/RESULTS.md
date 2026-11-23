# oi-profile-lines — results

Prereg: `forge/OI_PROFILE_LINES_PREREG.md` (committed in `a6ce5ff4`, 2026-11-23; amendments A1/A2 PRE-RESULTS in `66ab79e4`, A3 POST-HOC below). Run 2026-11-23, seed 20261123, B = 2000.
Branch `claude/oi-profile-lines`. Ledger ids: `oi-profile-lines-s1`, `-s2`, `-s3`, `-s4`.

## Verdict: NULL (S1, S2, S3) · UNDERPOWERED (S4)

On our own capture (96 nightly keys, 66 usable London dates 2026-08-20 → 2026-11-23, 707 instrument-sessions, 11 instruments), replayed through the live OI Profile build, the profile's lines hold on a first touch exactly as often as the same lines shifted by 0.25–0.5σ: **48.7% vs 48.5%, +0.2pp [−2.7, +3.1]**. That interval rules out the 5pp bar both ways, so this is a NULL, not a power problem. The same holds on PIN vs BREAKOUT days (+0.65pp [−5.8, +7.2] vs an 8pp bar) and for later touches vs the first (−0.15pp [−4.6, +4.1]). Stacked lines did not hold better than single ones: −4.15pp [−9.6, +1.3], the wrong sign for the claim, but the interval still reaches −5pp, so UNDERPOWERED.

## Scored cells

| Cell | n (first touches) | Estimate | 95% CI | MDE | Pass bar | p (Holm α) | Halves | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| S1 lines − placebo | 1,706 | +0.16pp | [−2.67, +3.12] | 5.5pp | 5pp | 0.885 (0.0125) | +1.84 / −1.49 | NULL |
| S2 (PIN − BREAKOUT) excess | 722 / 984 | +0.65pp | [−5.78, +7.23] | ~11pp | 8pp | 0.812 (0.0167) | +0.00 / +1.17 | NULL |
| S3 (touch 2+ − touch 1) excess | 1,759 / 1,706 | −0.15pp | [−4.57, +4.13] | ~7.7pp | 5pp | 0.930 (0.05) | −2.80 / +2.79 | NULL |
| S4 (stacked − single) excess | 784 / 922 | −4.15pp | [−9.63, +1.27] | ~11pp | 5pp | 0.125 (0.0125) | −0.93 / −7.27 | UNDERPOWERED |

Parts: PIN lines 47.0% vs placebo 46.3%; BREAKOUT 50.0% vs 50.0%. Touch 2+ 49.2% vs 49.2%. Stacked 47.4% vs 49.5%; single 49.8% vs 47.7%.

## Controls

- **Positive control (A1/A2, before the real run).** Random walk, real session lengths and real line prices: the zero case gives E = +1.25pp [−1.8, +4.3]; a planted bounce at real lines (P = 0.3) gives +10.9pp [9.3, 12.8]. The detector finds a real effect of this size and returns ~0 when there is none. Raw b sits 1–3pp under 50% from discretisation (46.5/47.6/49.0% at 1/10/100 sub-steps per bar), and real and placebo lines share it.
- **Mirror** (+0.25σ copies scored as "real" against the other copies): −1.04pp [−4.43, +2.38]. Not void.
- **±0.5σ placebos only (A2 sensitivity):** S1 +1.22 [−2.0, +4.6]; S2 −1.38 [−8.7, +5.9]; S3 −1.71 [−7.1, +3.3]; S4 −3.44 [−10.1, +3.0]. Same reading.
- **Replay fidelity (before registering).** Spot vs OANDA mid at capture: median 0.00σ on all 11 instruments. Against the live frozen `forward/hedging_plan_oi` records: regime 217/228, wall prices 320/351 within 0.05σ where the book matched. The misses are the days the capture landed after the live 07:00 snapshot.
- **Atlas (≈150 descriptive cells, BH q = 0.10):** 1 survivor, against a label-permutation chance baseline of median 0, max 4 (9 of 20 permutations had ≥ 1). One survivor is what chance delivers as a count.
- Resolution: real 1,696 back / 1,769 through / 5 both / 320 unresolved; placebo 4,890 / 5,116 / 10 / 800.

## Deviations from the prereg

- A1 (PRE-RESULTS): positive control rebuilt (sub-steps; touch-then-drift plant).
- A2 (PRE-RESULTS): known-zero b rule replaced by the sub-step convergence check; ±0.5σ sensitivity added; mirror void rule made sign-aware (a real effect contaminates the ±0.25σ copies).
- A3 (POST-HOC, results seen): the atlas chance baseline was broken in the first scoring pass. `events.py` did not write each placebo's parent line, so all placebos of a session formed one family and the real lines were never relabelled; every permutation reproduced the real atlas (median 1 = the real count). Fixed: parent written through (outcomes byte-identical), and the permuted "real" slot drawn from all five slots of a family. Only the chance baseline changed (1 → median 0, max 4). No scored number moved. Post-hoc, so it can only demote: the one survivor stays a candidate.

## Descriptive (not part of the verdict)

**The candidate.** Gamma peak, first touch, PIN days: 70.3% held vs 48.5% at its placebos, +21.7pp [13.6, 29.6], 74 touches over 45 dates, at most 4 on any date, both halves (75.6% / 63.6% vs 50.9% / 45.7%), 9 of 11 instruments above 50% (SPX500 at 50%, US2000 below on 3 touches). On BREAKOUT days the same line held 44.8% vs 50.7%. Later touches of the gamma peak (all regimes): touch 2 45.9% vs 52.9%, touch 3+ 43.1% vs 47.1%. It has a mechanism (dealers long gamma hedge against moves at their biggest gamma) and was a pre-listed atlas cell, but it is 1 of ~150 cells and the count is at chance. **Candidate for its own prereg on forward data (`oi-gamma-peak-pin`), never a result.**

First-touch hold % (real / placebo / n), all instruments:

| type | touch 1 | touch 2 | touch 3+ | PIN (t1) | BREAKOUT (t1) |
|---|---|---|---|---|---|
| put wall | 46.6 / 49.7 / 382 | 47.5 / 51.3 / 223 | 43.4 / 48.0 / 198 | 48.9 / 46.4 / 141 | 45.2 / 51.4 / 241 |
| call wall | 51.0 / 50.2 / 310 | 51.2 / 48.5 / 164 | 50.4 / 47.4 / 135 | 49.6 / 50.0 / 133 | 52.0 / 50.3 / 177 |
| gamma peak | 54.3 / 49.9 / 199 | 45.9 / 52.9 / 109 | 43.1 / 47.1 / 109 | **70.3 / 48.5 / 74** | 44.8 / 50.7 / 125 |
| zero gamma | 44.4 / 44.8 / 189 | 50.5 / 53.5 / 103 | 53.7 / 53.4 / 95 | 38.0 / 42.9 / 100 | 51.7 / 46.6 / 89 |
| GEX flip | 51.2 / 50.5 / 84 | 53.3 / 46.8 / 45 | 40.6 / 47.4 / 32 | 40.5 / 50.9 / 42 | 61.9 / 50.0 / 42 |
| max pain | 41.7 / 51.8 / 115 | 43.6 / 50.3 / 55 | 44.1 / 47.6 / 59 | 43.5 / 48.9 / 62 | 39.6 / 54.5 / 53 |
| vanna/charm flip | 51.3 / 51.8 / 271 | 46.5 / 48.8 / 172 | 49.6 / 46.8 / 139 | 50.4 / 48.8 / 113 | 51.9 / 54.0 / 158 |
| volume | 43.8 / 48.9 / 217 | 56.5 / 52.6 / 124 | 49.6 / 48.5 / 113 | 46.3 / 48.5 / 95 | 41.8 / 49.2 / 122 |
| short-gamma node | 54.4 / 44.0 / 114 | 54.4 / 51.0 / 57 | 46.3 / 47.1 / 41 | 50.0 / 45.3 / 24 | 55.6 / 43.7 / 90 |
| long-gamma node | 48.2 / 48.6 / 56 | 53.8 / 59.0 / 26 | 50.0 / 44.8 / 20 | 41.9 / 47.0 / 43 | 69.2 / 55.6 / 13 |
| exp move ↑ | 48.9 / 45.7 / 139 | 56.6 / 50.8 / 76 | 51.7 / 50.8 / 60 | 54.0 / 40.2 / 50 | 46.1 / 49.0 / 89 |
| exp move ↓ | 47.6 / 46.2 / 168 | 52.0 / 51.3 / 98 | 52.9 / 44.3 / 85 | 49.3 / 43.8 / 73 | 46.3 / 47.6 / 95 |

Per-type MDE is 11–29pp; read the table as a map, not as findings.

**"Do lines get blown through on volatile days?"** Everything breaks more on high-vol days, lines and fake lines alike: forecast-vol tercile low 51.6 / 51.5, mid 44.5 / 48.4, high 47.8 / 44.0 (real / placebo). Event days resolve twice as fast (median 18 vs 37 bars) with bigger 60-minute excursions (0.21σ vs 0.16σ), and the line effect is still zero (48.3 / 47.6). It is a volatility property, not a property of OI lines.

**Gamma × volume at the line (terciles, first touch, real / placebo / n):** high gamma + low volume 59.0 / 47.4 / 61; high + mid 52.4 / 47.4 / 187; high + high 50.0 / 49.7 / 318; mid gamma + high volume 41.0 / 48.9 / 195. The owner's "big gamma, no volume" corner leans the right way on 61 touches, nowhere near judgeable.

**Typical reaction size:** median 60-minute excursion after a first touch is 0.18σ back and 0.18σ through, for real and placebo lines alike. Median time to settle the 0.25σ race is ~31 minutes.

Full atlas: `atlas.csv`. Page data: `page.json`.

## What this changes

- The OI Profile is a picture of the book. Its lines are not, as a set, places where price holds or breaks. The indicator's "Break / Hold"-style expectation words have no support from this data, and the bots should not fade or follow profile lines on that basis.
- Touch number and line stacking get no weight.
- One open lead: **the gamma peak on PIN days, first touch.** Next step is its own prereg, scored only on sessions after 2026-11-23 (forward), with the bar set from this estimate's lower bound, plus a cost-gated trade version only if it confirms.
- Re-score S1–S4 unchanged at ≥ 132 usable dates (about March 2027).
