# vol-layer-stops-confirm — results

Prereg: `forge/VOL_LAYER_STOPS_CONFIRM_PREREG.md` (committed in `93478dc9`, 2026-11-16; PRE-RESULTS amendment dated 2026-11-16, written before scoring). Run 2026-11-16, seed 20261116, B = 2000.
Branch `main` (run in a worktree off origin/main). Ledger ids: `vol-layer-stops-confirm-cal`, `-skill`, `-steady`, `-noise` (scored); `-weekend` (CONTEXT by design).
Script: `scripts/vol-layer-stops-confirm/score.py` (control, build, score). Proof pack: `scripts/vol-layer-stops-confirm/proof.py`.

## Verdict: split by cell

- **`-skill` VALIDATED.** The frozen stop-odds model beats σ alone on unseen 2023-26 bid/ask data: Brier skill +4.73% [+4.46, +4.98]. Every check holds.
- **`-steady` VALIDATED.** A σ stop's hit rate is steadier month to month than a fixed-width stop's: Δ SD +3.86pp [+1.85, +5.78]. Every check holds. The prereg expected this cell to be underpowered. It passed anyway.
- **`-cal` UNDERPOWERED.** The model quotes hit odds about 0.9pp too high on 2023-26: CITL −0.87pp, 90% CI [−1.22, −0.53]. That interval straddles the −1pp margin, so the cell is neither proven calibrated nor proven off. The slope is fine (1.018, 90% CI [1.013, 1.023]). The miss grows by year (−0.36pp in 2023, −1.47pp in 2026).
- **`-noise` CONTEXT.** The pooled test passes: at 0.25σ and 0.5σ the excess is within ±0.016σ (−0.0027σ and −0.0032σ, Holm p 0.017). But the 2026 year check fails: −0.019σ at 0.5σ, just past the margin.
- **`-weekend` CONTEXT (described).** A 1σ stop hit at a weekend open costs 1.38R [1.26, 1.51], the same as discovery (1.38R).

Holm over the four scored cells: cal 0.27, skill < 0.001, steady < 0.001, noise 0.017.

## Scored cells

| Cell | n | Estimate | 95% CI | 90% CI | MDE (realised; prereg) | Pass bar | Holm p | Gate parts | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| `-cal` CITL | 943 dates, 13.80M rows | −0.874pp | [−1.281, −0.453] | [−1.224, −0.531] | 0.61pp; 0.67pp | 90% CI in ±1.0pp | 0.271 | d, class, year, lag: all pass | **UNDERPOWERED** |
| `-cal` MZ slope | same | 1.0182 | [1.0118, 1.0244] | [1.0128, 1.0232] | 0.0094; 0.011 | 90% CI in [0.90, 1.10] | (in the cal p) | — | (inside) |
| `-skill` | same | +4.73% | [+4.46, +4.98] | | 0.37%; 0.25% | ≥ +2.0%, CI > 0 | < 0.001 | each d > 0; 4/4 years > 0; lag 4.76% | **VALIDATED** |
| `-steady` Δ SD at 1σ | 44 months | +3.86pp | [+1.85, +5.78] | | 2.84pp; 4.9pp | ≥ +2.0pp, CI > 0 | < 0.001 | 0.5σ +4.31; 1.5σ +2.49; lag +3.58 | **VALIDATED** |
| `-noise` 0.25σ | 943 dates, 176,509 hits | −0.0027σ | [−0.0088, +0.0038] | [−0.0078, +0.0027] | 0.0079σ; 0.0080σ | 90% CI in ±0.016σ | 0.017 | neighbours pass; lag pass; **2026 fails** | **CONTEXT** |
| `-noise` 0.5σ | 115,071 hits | −0.0032σ | [−0.0136, +0.0077] | [−0.0118, +0.0058] | 0.0134σ; 0.0140σ | same | (in the noise p) | | |

Cal p is the TOST p (largest one-sided p of the four). Noise p is the larger TOST p of the two sizes. Skill and steady p are two-sided against 0 from the bootstrap SE.

### Gate parts in full

- `-cal` |CITL| by stop size: 0.25σ −1.45, 0.5σ −0.26, 0.75σ −0.33, 1σ −0.66, 1.5σ −1.17, 2σ −1.37 (all within ±2pp). By class: crosses −1.04, majors −1.13, gold −0.26, indices −0.13. By year: 2023 −0.36, 2024 −0.77, 2025 −1.12, 2026 −1.47. Lag (σ one session late): CITL −0.85, slope 1.016. All inside the ±2pp checks. The cell fails only on the pooled TOST.
- `-skill` by stop size: +8.2, +6.9, +4.3, +2.5, +1.2, +1.1%. By year: +5.5, +4.9, +4.3, +3.9%. Lag +4.76% (base +4.73%).
- `-steady` SD by month, plain vs fixed: 0.5σ 2.70 vs 7.01pp; 1σ 2.32 vs 6.18pp; 1.5σ 1.58 vs 4.06pp. With σ one session late in the plain stop: Δ +3.58pp at 1σ. By quarter (described): 1.34 vs 4.96pp.
- `-noise` neighbours: 0.2σ −0.0027, 0.3σ −0.0022, 0.4σ −0.0025, 0.75σ −0.0056 (all inside). Years at 0.25σ / 0.5σ: 2023 −0.0033 / −0.0034; 2024 −0.0024 / +0.0016; 2025 +0.0015 / +0.0020; **2026 −0.0090 / −0.0188**. Lag unit: −0.0032 / −0.0060.

## Controls

- **Step 0, reproduction.** On discovery data, `score.py` reproduced the frozen numbers exactly: 22,733,496 rows; CITL +0.0122pp, slope 1.0280, skill +4.470%; 1σ steadiness Δ +5.613pp; noise −0.00207σ and −0.00253σ. Pass.
- **Positive control, known zero.** Random-walk M1 on the real confirm timestamps for all 34 instruments, through the same builder and scoring code. M_rw: CITL +0.009pp [−0.044, +0.059], slope 1.0007. Hit vs M_rw by horizon within 0.07pp. Noise excess −0.0002σ (0.25σ) and +0.0027σ (0.5σ). Pass.
- **Positive control, planted.** Path σ × 1.10: M_rw CITL +2.03pp [+1.98, +2.07], outside ±1pp. Noise +0.03σ planted: read +0.030σ and +0.033σ, 90% CIs wholly above the margin. Pass.
- **Mirror.** M_σ and M_rw on the same rows: CITL −0.80pp and −0.74pp. All three models over-quote the hit rate by a similar amount. So the 2023-26 miss is a level shift in how often stops are hit (27.5% hit vs 28.3% quoted), not something the fit added. M_rw's slope is 0.978 (tails too flat), M_full's 1.018.
- **Ablations** (frozen discovery refits, scored here): dropping the vol clock costs +33.3% Brier; dropping the spread +0.85%; dropping the weekend term −0.01% (it adds nothing, as in discovery).
- **Proof pack** (`proof.py`, `forge/verdict_gate.py`): see the last section.

## Deviations from the prereg

One PRE-RESULTS amendment (2026-11-16). It says how the code meets §3 where the text left a choice: the 22:00 London cut through a pandas proxy with `execution_wide.build_one` unchanged; the noise builder copied with its discovery guard moved to the confirm end; no error-scaled overshoot rows; the control's constant σ and spread and trading clock; the step 0 tolerances; gate details (lag check form, steadiness p, σ tercile within instrument); the weekend open-bar definition. No gate changed. No POST-HOC amendment.

Drops: holds that would end after 2026-08-20 were dropped. That was 192 "next" and 1,008 "5 sessions" holds, all in the last 6 sessions. Another 10-14 entries per intraday horizon had no bar at the horizon (data gaps). No entry lacked σ inputs. Nothing at or after 2026-08-20 22:00 London was read (asserted).

## Descriptive (not part of the verdict)

- **Calibration by horizon:** m15 −0.43, h1 −1.15, h4 −1.35, to 22:00 −1.94, next −0.79, 5 sessions +0.42pp. **By σ tercile** (within instrument): low +0.25, mid −0.65, high −2.22pp. High-σ sessions touch stops less often than quoted. **By hour:** −0.1 to −1.4pp everywhere. There is no single broken hour, so the miss is not from changed index session hours.
- **By instrument** (BH q = 0.10): 22 of 34 instruments have CITL clear of 0, all FX crosses and majors except a few, from −0.67 (AUDUSD) to −2.43pp (USDJPY). DOW is the only one clear on the positive side (+0.77). US indices and gold sit near 0. Skill is positive in all 48 slices (instrument, horizon, hour bucket, σ tercile). 34 of 48 CITL slices pass p < 0.05 against 2.4 expected by chance. That shows how consistent the level shift is, not a new effect.
- **Reliability (frozen bins):** M_full over-quotes in the middle (quoted 0.13-0.37, hit 0.10-0.32) and under-quotes at the top (quoted 0.80-0.89, hit 0.82-0.91).
- **Noise by side:** long +0.020σ, short −0.024σ at 0.25σ. The pooled excess cancels a 2023-26 drift. A one-sided book would see a lean of about 0.02σ either way. By class, no excess beats its own class's median spread (BH: none).
- **1σ noise (described, underpowered):** −0.0060σ [−0.026, +0.014].
- **Weekend.** Plain σ stops hit on the bar after a gap > 36 h:

  | stop | hits | gap rate | loss, R net [95%] | p99 overshoot | GPD ξ | discovery loss |
  |---|---|---|---|---|---|---|
  | 0.5σ | 4,553 | 95.4% | 1.62 [1.47, 1.77] | 2.16σ | 0.13 | 1.55 |
  | 1σ | 3,860 | 95.6% | 1.38 [1.26, 1.51] | 2.60σ | −0.04 | 1.38 |
  | 2σ | 2,329 | 95.8% | 1.21 [1.14, 1.30] | 2.76σ | −0.22 | 1.24 |
  | 1σ weekday | 253,569 | 4.2% | 1.002 | 0.42σ | 0.21 | 1.002 |

  The gap rate is 95% against 81% in discovery. The loss is the same. The tail is thinner (p99 2.6σ vs 3.9σ at 1σ). P(a 1σ stop still open at Friday's close is hit on the weekend open bar) = 1.89% (3,824 of 202,520) against 1.60% in discovery.

## What this changes

- **`-skill` VALIDATED:** the vol clock and spread terms do improve stop odds over σ alone, on unseen data. The frozen model may be shown as the stop-odds read-out on `vol-layer-system.html` (layer 7). Because `-cal` did not pass, quote it with the 2023-26 miss beside it: it over-quotes by about 0.9pp on average, about 1.5pp in 2026 and about 2pp on high-σ sessions and the to-22:00 horizon. Bots may get it as a shadow field only. It is not a sizing input (|t| ≥ 3 needed, and calibration is unproven).
- **`-cal` UNDERPOWERED:** a refit is not allowed from this data. What would settle it: the forward record, or a model that tracks the level of hit rates over time. Do not say the model is calibrated.
- **`-steady` VALIDATED:** "set stops in σ units, not fixed widths" is a validated rule. The fixed-width stop's hit rate swings about 2.7 times as much month to month.
- **`-noise` CONTEXT:** there is no market-wide noise threshold at 0.25-0.5σ pooled over 2023-26, but 2026 alone leaned to continuation at 0.5σ (−0.019σ). Stop placement still has to come from a system's own MAE/MFE. Don't bank "no threshold" as a rule. The 2026 lean is a candidate for the forward record.
- **`-weekend`:** the page can show 1.38R (2023-26) beside 1.38R (discovery) at 1σ, and a 1.9% chance that an open 1σ stop is taken out at the weekend open.

## Proof pack (forge/verdict_gate.py)

`proof.py` re-ran the scoring on the confirm build and reproduced results.json (CITL, slope, skill, steadiness Δ, noise at 0.25σ and 0.5σ). Then it gave the gate one question per cell:

| Cell | Gate effect [95%] | Planted large / min (shift vs injected) | Shuffle (raw statistic) | Gate word | Study word |
|---|---|---|---|---|---|
| `-cal` | headroom inside the margins +0.13pp [−0.28, +0.55] | 2.00 / 0.67pp, both recovered | CITL sign-flipped by date includes 0 | UNDERPOWERED | UNDERPOWERED |
| `-skill` | +4.73% [+4.46, +4.98], min +2% | +5.00 / +2.00%, recovered | M_full/M_σ swapped by date: −0.08% [−0.41, +0.27] | VALIDATED | VALIDATED |
| `-steady` | +3.86pp [+1.85, +5.78], min +2pp | +5.00 / +2.00pp, recovered | plain/fixed swapped by month: [−3.64, +1.08] | VALIDATED (power 0.65) | VALIDATED |
| `-noise` | headroom +0.0128σ, interval above 0 | 0.030 / 0.008σ, recovered | excess sign-flipped by date includes 0 | VALIDATED | **CONTEXT** |

**Mismatch on `-noise`, so `proof.py` wrote `checks_MISMATCH_do_not_commit.json` and no `checks.json`.** The reason is known: the gate only sees the pooled interval, which passes. The prereg's CONTEXT comes from a conjunctive check the gate cannot see (2026 at 0.5σ is −0.019σ, outside ±0.016σ). The study word stays CONTEXT; the proof never rewrites a verdict. For `-cal` and `-noise` the gate's "power" reads 0.05 because their minimum effect is 0 (equivalence cells); the power that matters for them is the TOST MDE in the table above (0.61pp, 0.0079σ). To bank `-noise` under the CI test, the gate needs a way to carry gate-part failures (for example a `gate_parts` field that demotes VALIDATED to CONTEXT). That is the coordinator's call.
