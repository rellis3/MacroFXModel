# basis-stress-rules — results

Prereg: `forge/BASIS_STRESS_RULES_PREREG.md` (committed in `96aa353d`, 2026-10-22). Run 2026-10-22, seed 20261022, B = 2000.
Branch `main`. Ledger ids: `basis-stress-usd`, `basis-stress-fxvol`, `basis-yearend-premium`.

## Verdict: NULL (usd) · NULL (fxvol) · VALIDATED (yearend)

C.OG's two cross-currency basis rules were tested on the EUR and GBP basis built from CME futures (2016-01 → 2026-08).

**"Basis moving 20–30bps in a day signals funding stress emerging" (R1).** A widening day was **not** followed by a stronger dollar or by busier FX:
- usd: r **+0.018** [−0.030, +0.071].
- fxvol: r **−0.003** [−0.036, +0.032].

Both CIs lie inside ±0.10, so a useful effect is ruled out (1,830 days, powered at r 0.075). The basis barely moves with the dollar even on the same day (r 0.017). Only 5 days met the literal ≥ 20bp threshold.

**"Basis typically widens at quarter-end due to bank balance sheet management" (R2), tested as year-end against other quarter-ends.** It holds:
- The year-end turn costs **−14.4bp [−24.2, −4.8]** more than an ordinary quarter-end.
- Holm p 0.011; EUR −15.7bp, GBP −13.1bp.
- 9 of 10 year-ends sit below the ordinary-quarter-end average.

## Scored cells

| Cell | n | Estimate | 95% CI | Bar | Holm p | Verdict |
|---|---|---|---|---|---|---|
| usd (W → next-5-day USD basket) | 1,830 days | r +0.018 | [−0.030, +0.071] | 0.10 | 0.99 | NULL |
| fxvol (W → next-5-day FX vol beyond persistence) | 1,835 days | r −0.003 | [−0.036, +0.032] | 0.10 | 0.99 | NULL |
| yearend (year-end span premium − other quarter-ends) | 10 vs 32 contracts | −14.4 bp | [−24.2, −4.8] | −10 bp | 0.011 | **VALIDATED** |

## The year-end turn, contract by contract

D = realised basis on days whose tenor spans the quarter-end, minus days that don't (EUR/GBP mean, bp).

| March contract | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|
| D (spans 31 Dec) | −39.3 | −45.8 | −6.1 | −19.9 | −23.3 | −14.2 | −21.3 | −4.0 | −7.3 | −0.5 |

Ordinary quarter-ends: mean D −3.8, median −1.8, SD 13.9 (32 contracts). **The premium has shrunk a lot since 2023**, along with the basis itself (yearly median EUR basis about 0 in 2025–26).

## Controls

- R1 shift placebo: usd [−0.035, +0.033]; fxvol [−0.031, +0.028]. The observed values are inside.
- R1 halves (split 2021-04): usd +0.014 / +0.021; fxvol −0.001 / −0.006.
- R2 tenor: span days average 87 days to delivery against 54 for no-span days. The comparison is **year-end against other quarter-ends**, so this structure (the same in every contract) cancels. The generic span − no-span average of −7.2bp mixes the quarter-end effect with the term structure, so it is reported only as a description.

## Deviations from the prereg

None.

## Descriptive (not part of the verdict)

- Literal ≥ 20bp widening days (2016-02-03, 2016-11-23, 2017-09-15, 2017-12-15, 2022-06-14): the USD basket over the next 5 days was −0.46% (against +0.01% on all days), and FX vol was +4% above persistence. With n = 5 this is nothing to read.
- Horizons: usd 1-day r −0.01; 20-day r +0.03.
- EUR alone: usd r +0.005, fxvol −0.001. GBP alone: usd +0.025, fxvol −0.003.
- "VIX low, basis widening" (top-decile widening with VIX below its 1-year median, n 93): fxvol +0.6%, usd −0.05%. Nothing.

## What this changes

- **The year-end turn is real and validated as a calendar description of funding cost.** Dollars borrowed across 31 December via EUR/GBP swaps have cost about 14bp more than across other quarter-ends (2016–2026), and much less since 2024. The funding page can show it as a known seasonal; it is not a market-direction signal.
- **The "20–30bp in a day = stress emerging" rule does not come before dollar or FX-vol moves** at EUR/GBP, 2016–2026. The basis is a description of funding cost, not an early warning, in this sample. JPY and CHF (phase 2), where March 2020 was most extreme, remain untested.
