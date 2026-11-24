# hedge-today — results

Prereg: `forge/HEDGE_TODAY_PREREG.md` (registered 24286de2, A1 pre-results e5980769). Seed 20261123, B = 1000, 21-session blocks.
Scripts: `scripts/hedge-today/build.mjs` (panel), `scripts/hedge-today/run.mjs` (control + scoring). Numbers: `results.json`.
Sample: London sessions 08:00–17:00, evaluation 2017-01-02 → 2026-07-02, about 2,440 sessions per problem.

## Verdicts

| Ledger id | Question | Verdict | Headline |
|---|---|---|---|
| `hedge-today` | Session sizing (S3, EWMA on in-session hourly returns) vs the tab's daily 60d OLS (B1) | **UNDERPOWERED** (as registered; see below) | +5.03pp session variance removed [+3.29, +6.67], better on 12 of 12, both halves (+6.53 / +3.88). Failed only the placebo clause, which every method fails, B1 included |
| `hedge-today-pick` | Picking the partner by in-session co-movement (P-S) vs the tab's daily pick (P-D) | **VALIDATED** | +2.20pp [+1.10, +3.50], better on 7 of 8 targets, both halves (+3.47 / +1.36) |
| `hedge-today-daytype` | Conditioning the session ratio on US/EU/UK tier-1 release days (C1) vs not (S2) | **UNDERPOWERED** | −0.71pp [−1.57, +0.13], worse on 10 of 12, both halves negative; interval not inside ±1pp |

## Positive control (passed before scoring)
Synthetic target on the real EURUSD path, session beta 1.0, out-of-session beta 0.2. S2 median weight **0.997** (known 1.0); the tab's daily ratio B1 gave **0.685**, which mixes the overnight beta in. S2 removed 47.7% of session variance against B1's 42.3%. This is the mechanism the study is about.

## H1: sizing a session hedge

Pooled session variance removed (mean of 12 problems): B1 21.2%, B2 22.5%, S1 22.5%, S2 25.4%, **S3 26.2%**, C1 24.7%.

| Method vs B1 | ΔVR pp | 95% CI | halves | better / 12 | BH |
|---|---|---|---|---|---|
| B2 daily EWMA | +1.34 | [+0.82, +2.09] | +1.55 / +1.22 | 12 | holds |
| S1 session returns, 60 | +1.35 | [−0.03, +2.93] | +2.55 / +0.35 | 9 | holds |
| S2 hourly, 20 sessions | +4.24 | [+2.36, +6.12] | +5.74 / +3.07 | 11 | holds |
| **S3 hourly EWMA, 120 sessions** | **+5.03** | **[+3.29, +6.67]** | +6.53 / +3.88 | **12** | holds |
| C1 hourly, same day type | +3.52 | [+1.77, +5.26] | +5.42 / +2.01 | 11 | holds |

Every method cleared the size, interval, halves, count and BH clauses. **All failed the placebo clause**: the median random partner (sized with S2) removed 27.4% pooled, more than any method on the registered partners, the benchmark B1 (21.2%) included. Under the registered verdict rule each method is therefore UNDERPOWERED. See amendment A2: the clause measures the fixed problem list, not the sizing method.

Per problem (session VR %, B1 → S3):

| # | Problem | B1 | S3 | Δ | ES5 cut B1 → S3 |
|---|---|---|---|---|---|
| 1 | GOLD ← DXY | 18.1 | 20.6 | +2.5 | 10.6 → 11.8 |
| 2 | GOLD ← DXY, NQ | 20.1 | 24.7 | +4.6 | 10.0 → 13.1 |
| 3 | NQ ← GOLD, USDJPY | −3.3 | 8.0 | +11.3 | −2.6 → 2.6 |
| 4 | NQ ← US2000 | 44.4 | 49.1 | +4.7 | 29.1 → 32.2 |
| 5 | US2000 ← GOLD | −0.2 | 5.1 | +5.3 | −0.7 → 1.8 |
| 6 | US30 ← GOLD, USDJPY | −4.3 | 9.3 | +13.6 | −3.7 → 3.9 |
| 7 | EURUSD ← USDCHF | 56.0 | 56.1 | +0.2 | 31.3 → 31.2 |
| 8 | GBPUSD ← EURUSD, USDJPY | 41.3 | 42.9 | +1.5 | 22.2 → 23.4 |
| 9 | AUDUSD ← NQ | 15.6 | 18.6 | +3.0 | 6.3 → 7.5 |
| 10 | AUDUSD ← NQ, GOLD | 29.6 | 34.2 | +4.6 | 14.6 → 18.2 |
| 11 | USDJPY ← NQ | 1.5 | 5.6 | +4.1 | 0.7 → 3.9 |
| 12 | DE30 ← NQ, EURUSD | 34.9 | 40.0 | +5.1 | 22.0 → 26.6 |

- **Where it comes from:** the gain is largest where the daily ratio applies an overnight relationship to the session (indices against gold/yen, 3, 5, 6: B1 *adds* risk there) and about zero FX-in-FX (7, 8: FX closes and sessions line up). Without the two largest, the mean is still +3.6pp.
- **The worst 5% of sessions:** mean ES5 cut B1 11.6%, S2 14.1%, S3 14.7% (descriptive).
- **Size:** session ratios are smaller than daily ones on every problem (mean |w| e.g. US30 0.45 → 0.33), so the hedge leg costs less, not more.
- **Release days vs quiet:** S3 beats B1 on both (descriptive split).

## H2: picking the partner (8 targets, one leg, point in time)

| Target | P-D (tab) | P-S (session) | pick D, size S2 | pick S, size B1 | ES5 cut P-D → P-S |
|---|---|---|---|---|---|
| EURUSD | 93.3 | 93.3 | 93.3 | 93.4 | 73.5 → 74.1 |
| GBPUSD | 56.6 | 57.0 | 56.6 | 57.0 | 34.4 → 32.9 |
| AUDUSD | 80.1 | 81.8 | 80.8 | 81.0 | 55.9 → 57.5 |
| USDJPY | 36.9 | 42.5 | 40.0 | 39.2 | 20.9 → 26.2 |
| GOLD | 21.8 | 24.1 | 24.5 | 22.2 | 13.2 → 13.5 |
| NQ | 50.1 | 52.4 | 52.2 | 49.7 | 31.9 → 32.6 |
| US30 | 61.0 | 63.5 | 62.4 | 62.3 | 40.8 → 42.7 |
| DE30 | 49.4 | 52.1 | 51.3 | 50.4 | 30.4 → 34.4 |

Most of the gain is the sizing (pick D, size S2), plus a partner change for USDJPY and DE30. **Caution for the page:** for EURUSD and GBPUSD both pipelines pick DXY almost every session, and for AUDUSD NZDUSD. DXY is 58% EUR. "Hedging" a EUR/USD short with DXY mostly cancels the trade, and with it a USD view. That is cutting the position, not hedging it (registered as untested in §7: "keeping the view").

## H3: release days
C1 (same day type) removed 0.71pp **less** than S2 [−1.57, +0.13], worse on 10 of 12. Halving the sample costs more than the conditioning gains. Release days are not a reason to switch ratios, at least for US/EU/UK tier-1 days (A1: the calendar has no other currencies).

## What it does not show
Variance and tail of the session, not P&L; no costs netted; 08:00–17:00 London only; nothing about whether a bias call is right.

## What changes (prereg §8)
- H1 UNDERPOWERED → the Today mode shows **both** the daily ratio and the session ratio (S3), labelled with these numbers.
- H2 VALIDATED → the Today mode ranks partners by in-session co-movement.
- H3 → no switch to event-day ratios; the mode may say a release is scheduled, as context only.
