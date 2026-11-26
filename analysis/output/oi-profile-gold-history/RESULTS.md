# oi-profile-gold-history — results

Prereg: `forge/OI_PROFILE_GOLD_HISTORY_PREREG.md` (amendment A1 pre-results). Seed 20261126, date-clustered bootstrap B = 2000. Scored 2026-11-26.

**In short: on 3½ years of gold, the OI Profile's walls, gamma peak and max pain held a first touch no more often than the same lines moved 0.25–0.5σ (G1 NULL). The gamma-peak-on-PIN candidate did not replicate: on gold it held *less* than its placebos (G3 NULL, point estimate −11.7pp, the opposite sign).**

## Data and build

- Databento OG monthlies, 877 sessions built (2022-11-08 .. 2026-04-16), OI from two business days before the session (T-2). 833 sessions had at least one touch.
- Each session ran through the unchanged live path (`buildOIEntry` → hedging map → `buildOiProfile`). Lines: 1,754 call walls, 1,754 put walls, 877 gamma peaks, 347 max pains.
- Build check (§3.5 as amended): **20 / 20 passed**. Matrix sums were exact, the parity F agreed within 0.3%, and walls sat on real strikes on the correct side of spot. Parity disagreement was 0 of 877 sessions. Basis median $12.2. σ median 0.94% a day.
- Regime proxy (net-GEX sign, strongest book): PIN on 83% of sessions. The ≤3-DTE hedging map existed on only 103 of 877.

## Positive control (run before the real outcome)

| | E (real − placebo) | 95% CI | bar | |
|---|---|---|---|---|
| random walk, nothing planted | −0.18pp | [−4.1, +3.5] | within ±2pp | pass |
| planted bounce P = 0.3 | +17.97pp | [+14.6, +21.3] | > +5pp | pass |

## Scored cells (T-2)

| Cell | real held | placebo held | E | 95% CI | halves | n real (resolved) | Verdict |
|---|---|---|---|---|---|---|---|
| **G1** all lines, touch 1 | 48.0% | 49.0% | **−0.97pp** | [−4.75, +2.74] | +1.0 / −3.2 | 844 (622 dates) | **NULL** |
| G2 call wall | 46.8% | 48.7% | −1.89 | [−7.6, +3.5] | -2.1 / -1.6 | 404 | **NULL** |
| G2 put wall | 49.3% | 48.7% | +0.60 | [−4.8, +6.4] | +5.1 / -4.8 | 383 | **NULL** |
| G2 gamma peak | 42.6% | 51.0% | −8.40 | [−15.8, −0.8] | -5.7 / -11.1 | 235 | **NULL** (CI below the +8 bar; sign is negative) |
| G2 max pain | 50.9% | 50.7% | +0.19 | [−13.7, +13.5] | -2.8 / +8.3 | 55 | **UNDERPOWERED** |
| **G3** gamma peak × PIN, touch 1 | 39.7% | 51.4% | **−11.69pp** | [−20.2, −3.3] | −10.9 / −11.9 | 189 (189 dates) | **NULL**, against the candidate |
| G4 touch 3 after held → broke | 60.0% | 53.7% | +6.29 | [−9.6, +22.0] | +2.8 / +10.5 | 45 | **UNDERPOWERED** (point estimate the wrong sign for "keeps breaking") |

No G2 type passed BH q = 0.10 in the positive direction.

G1's n was 844 resolved first touches, not the ~2,000 in the power table. The MDE is about 7pp, but the CI sits inside ±5pp, so G1 is NULL as defined. G3 had 189 touches, not ~25: the proxy calls PIN far more often than the live hedging map.

## Controls

- **Mirror** (+0.25σ copies as "real"): −1.99pp [−5.6, +1.7]. It does not clear G1's bar, so there is no design bias.
- **Concentration**: the largest year (2023) holds 32% of G1's touches, under the 40% cap. Per-year G1 runs from −8.0 (2022, n 35) to +1.8 (2026, n 63), all inside noise.
- **Unresolved**: 7.5% of real first touches and 5.7% of placebo (counted, not dropped). "Both on one bar": 2 real, 7 placebo.

## Reported, not gated

| Cell | E | 95% CI | n |
|---|---|---|---|
| ±0.5σ placebos only: G1 | −2.97 | [−6.9, +1.2] | 844 |
| ±0.5σ only: G3 | −14.59 | [−24.0, −5.5] | 189 |
| touch 2 after held | −2.84 | [−10.8, +5.1] | 196 |
| retest after a break (other side) | +2.42 | [−4.8, +10.2] | 227 |
| touch 3 HH / BH / BB | +6.0 / +7.8 / +3.2 | all span 0 | 40 / 52 / 51 |
| gamma peak touch 1 on BREAKOUT days | +5.37 | [−11.8, +22.7] | 46 |
| gamma peak 2nd+ touches, PIN | +0.61 | [−7.6, +8.6] | 162 |
| all lines PIN / BREAKOUT, touch 1 | −2.28 / +4.72 | span 0 | 686 / 158 |
| **T-1 OI** sensitivity: G1 | −5.26 | [−9.2, −1.5] | 836 |
| T-1: call wall / gamma peak / G3 | −9.4 / −12.0 / −14.6 | all CIs below 0 | 404 / 226 / 184 |

HAR-σ sensitivity was not run (A1.3): σ only sets the 0.25σ unit, and the T-1 run already moves every line.

## What it means

- **Gold OI Profile lines are not reaction levels** on 3½ years of history, matching the 66-day capture. The S/R zones and OI Profile reads stay 50/50 on gold.
- **If there is a lean on gold, it is toward breaking, not holding.** The gamma peak broke more than its placebos (−8 to −15pp across T-2, T-1 and the ±0.5σ check). This is NULL against its pre-registered positive bar, not a validated break signal. It would need its own prereg, and the sign was not predicted.
- **The ★ (gamma peak × PIN, first touch) does not replicate on gold.** Per §8, the ★ stays governed by the forward prereg `oi-gamma-peak-pin` F1, and this result is recorded against it. Caveats:
  - the regime here is the net-GEX proxy, not the live ≤3-DTE hedging map;
  - the capture's 70% cell had only 2 gold touches, so this is gold-specific evidence against, not a refutation of the pooled cell.
- **G4 (held → broke → 3rd touch keeps breaking) gets no support**: +6pp, the wrong sign, n 45.

Files: `results.json` (every cell). Scripts: `scripts/oi-profile-gold-history/` (prep.py, build.mjs, events.py, score.py). Data (gitignored): `data/oi_gold_history/`.
