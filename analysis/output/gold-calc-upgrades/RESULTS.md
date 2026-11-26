# gold-calc-upgrades: results (corrected 2026-11-26)

> **Fault fixed 2026-11-26 (prereg A3).** The first banked run (10876283) floored the pre-open feature at
> 1% of the realised variance of the **day being forecast**. That floor applied on 46% of days and leaked the
> target into the forecast. FRESH was reported at −6.9% and the all-in arm at −8.8%. Corrected, with the floor at
> 0.1% of the previous day's RV (it now applies on 0.7% of days): FRESH −1.16%, all-in −4.26%. Arms without the
> pre-open feature are unchanged. The buggy numbers are kept for the record below.

**Setup**
- Prereg: `forge/GOLD_CALC_UPGRADES_PREREG.md` (005ccfba). Script: `scripts/gold-calc-upgrades/score.py`. Seed 20261126.
- Gold futures (GC, NT8) is the primary sample; OANDA XAU_USD is the replication.
- Test period: 2020 → 2026-08-21. Each test year is fitted only on the years before it.
- Common sample: 1,659 futures sessions and 1,699 CFD sessions.
- Scoring: per-line QLIKE, scaled exactly as in the export race.
- Baseline: the calc each line uses in the live QLIKE export.
- **Nothing live changed.**

**Controls**
- HARCJ is reproduced exactly (max relative difference 2e-15).
- A noise regressor scores +0.02% (futures) and +0.04% (CFD).

## Verdicts (corrected)

% change in QLIKE on HL + Close+ + Close−, arm vs export calc. Negative means better.

| Arm | What it adds | Futures [90% CI] | Halves 2020–22 / 2023–26 | BH | CFD | Verdict |
|---|---|---|---|---|---|---|
| **N7 ALL** | everything below, fitted by QLIKE | **−4.26%** [−6.82, −1.91] | −2.42 / −5.86 | yes | −2.64% | **VALIDATED** |
| **N6 HARCJ+IV** | GVZ (gold implied vol) as a regressor | **−2.81%** [−4.38, −1.33] | −1.70 / −3.77 | yes | −2.13% | **VALIDATED** |
| **V3** | existing scaled-GVZ arm | −1.76% [−3.46, −0.14] | −1.02 / −2.41 | yes | −0.62% | **VALIDATED** (weak) |
| **N4 FRESH** | variance of the hour before London opens | **−1.16%** [−1.98, −0.38] | −0.39 / −1.83 | yes | −0.90% | **VALIDATED** (small, concentrated) |
| **N1 HARQ** | trust yesterday less when it was noisy | −0.42% [−0.73, −0.08] | −0.17 / −0.64 | yes | −0.53% | **VALIDATED** (tiny) |
| N3 SESS | yesterday split into Asia / London / NY | −0.78% [−2.13, +0.20] | +0.15 / −1.60 | no | +0.17% | UNDERPOWERED |
| N5 RR | realized range | −0.21% [−0.58, +0.16] | −0.34 / −0.10 | no | −0.55% | UNDERPOWERED |
| V4 | raw GVZ | −1.62% [−3.49, +0.21] | −0.88 / −2.26 | no | −0.32% | UNDERPOWERED |
| B_har_iv | 50/50 HAR + GVZ | −0.32% [−1.74, +1.19] | +0.28 / −0.85 | no | +0.14% | UNDERPOWERED |
| N2 QL-HARCJ | same features, fitted by QLIKE | +0.29% [−0.00, +0.59] | +0.29 / +0.29 | no | −0.09% | **NULL** |

## What did the work

**1. Gold implied vol as a regressor (N6, −2.8%): the steadiest gain.**
- GVZ's coefficient is about 0.70.
- It beats the older GVZ arms. Those were left out of the export as not site-computable, not because they scored
  worse.

**2. The pre-open hour (N4 FRESH, −1.2%): small and concentrated.**
- More than all of the gain (110%) comes from the top 1% of days. On ordinary days it is very slightly worse.
- Those days are wild Asian opens, mostly Mondays (the Sunday reopen after weekend news; Monday −3.5%, other weekdays
  about 0): 2023-12-04, 2025-12-29, 2021-08-09, 2026-01-29.
- By year: −2.9% to +0.6%.
- Lookahead audit: the window is always 22:00–24:00 London before the session, and the floor now uses only the
  previous day. Changing the target alone gives +0.15%.

**3. Combined (N7, −4.3%).**
- IV plus FRESH (OLS) gives −3.6%. Everything QLIKE-fitted gives −4.3%.

**4. Didn't help:** QLIKE fitting (NULL); the session split and realized range (too small to tell).

## Descriptive (corrected)

| | Export calc (HARCJ) | N7 ALL |
|---|---|---|
| Futures hit rate HL P50 / P75 / P90 | 53.3 / 26.1 / 9.8% | 50.6 / 23.9 / 8.5% |
| Futures Close+ | 53.6 / 28.5 / 10.9% | 51.2 / 27.5 / 9.9% |
| Futures Close− | 51.1 / 27.5 / 10.6% | 48.6 / 25.7 / 9.5% |
| Close− median → P75 gap ($), all years / 2025–26 | 8.82 / 23.60 | 9.16 / 23.87 |

- By regime (futures): quiet −4.5%, middle −3.4%, busy −4.8%.
- The dollar gap is essentially unchanged.

## MAE at the lines, export vs shadow (exploratory, `mae_compare.py`, gold futures)

- Every Jordan line (Close±, HL projections, P50/75/90), first touch, faded.
- Over all lines, 2020–26:

| | MAE60 median | MAE60 p75 | Jordan-way MAE (75-tick stop) | 1R win rate |
|---|---|---|---|---|
| Export calc | 41.9 ticks | 92.9 ticks | 58.4 ticks | 49.6% |
| Shadow N7 | 41.4 ticks | 91.9 ticks | 59.3 ticks | 49.4% |

- **No difference.** A better forecast doesn't change how far price runs against you after a touch.
- Single-cell gaps (e.g. HL lower P90) rest on 70–170 touches and go both ways.
- In 2025–26 the median Jordan-way MAE hits his 75-tick cap on most lines: his stop is now inside the typical
  adverse move on gold.

## Answer (corrected)

Gold's implied vol (GVZ) is the useful upgrade, at about −3%. The pre-open hour adds about −1%, almost all of it on
wild Monday and Asian opens. Together they give about −4% QLIKE on Jordan's lines, on both feeds and in both halves.
None of it changes MAE at the lines.

**Graded weight:**
- moderate for IV and for all-in;
- weak-to-moderate for the pre-open hour (it's a rare-day detector);
- against QLIKE fitting.

**Next:** a shadow export beside the live one with a forward score. The QLIKE export stays unchanged.

## Record: the first (faulty) run

FRESH −6.92% [−8.69, −5.30], N7 −8.84% [−11.34, −6.36] (futures). Inflated by the floor leak above; superseded.
