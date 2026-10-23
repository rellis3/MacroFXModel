# basis-stress-jpychf — results

Prereg: `forge/BASIS_STRESS_JPYCHF_PREREG.md` (committed 2026-10-23, before the run). Run 2026-10-23, seed 20261023, B = 2000.
Branch `main`. Ledger ids: `basis-stress-jpy-usd`, `basis-stress-jpy-fxvol`, `basis-stress-chf-usd`, `basis-stress-chf-fxvol`, `basis-yearend-jpy`, `basis-yearend-chf`.

## Verdict

| Cell | n | Estimate | 95% CI | Halves | Placebo 95% | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| jpy-usd (widening → USD basket, 5d) | 1,833 days | r −0.002 | [−0.050, +0.045] | −0.060 / +0.047 | [−0.038, +0.037] | 1.0 | NULL |
| jpy-fxvol (→ FX vol beyond persistence) | 1,838 | r +0.010 | [−0.024, +0.050] | −0.010 / +0.026 | [−0.037, +0.035] | 1.0 | NULL |
| chf-usd | 1,811 | r +0.040 | [−0.019, +0.104] | +0.057 / +0.021 | [−0.035, +0.034] | 0.81 | UNDERPOWERED |
| chf-fxvol | 1,816 | r +0.007 | [−0.032, +0.046] | +0.010 / +0.004 | [−0.031, +0.035] | 1.0 | NULL |
| yearend-jpy (Mar contracts − others) | 10 vs 32 | −12.4 bp | [−24.1, +0.8] | −12.7 / −14.2 | — | 0.25 | UNDERPOWERED |
| yearend-chf | 10 vs 32 | **−19.3 bp** | [−32.4, −6.1] | −25.9 / −16.4 | — | 0.024 | **VALIDATED** |

**The stress rule.** Across all four bases now tested (EUR, GBP here and in `basis-stress-rules`, plus JPY and CHF), a one-day widening is **not** followed by USD strength or busier FX in a way this data can see. The CHF → USD cell points the right way and survives the halves and the placebo, but its CI includes 0 (UNDERPOWERED). It is a weak lead at most.

**The year-end premium.**
- **CHF: clear.** −19bp more than an ordinary quarter-end, in both halves. It has shrunk since 2024 (−4 to −7bp), like EUR/GBP.
- **JPY: the March contracts are wide every year** (−53, −39, −19, −25, −25, −11, −16, −28, −15, −14bp). But the JPY basis also widens at its **other** quarter-ends (mean −12bp), and the Japanese fiscal year-end on 31 March adds its own premium (June contracts −14bp against Sep/Dec, descriptive). So the year-end turn stands out less against the yen's own quarter-ends, and the cell can't call it.

## Descriptive (not part of the verdict)

- Literal ≥ 20bp widening days: JPY 12 (incl. 2020-03-19/23/24 and 2022-06-14), with the USD basket over the next 5 days averaging −1.37%; CHF 12, +0.37%. With 12 events each, there is nothing to read.
- Own-pair outcome (USDJPY or USDCHF alone, 5d): r +0.008 (JPY) and −0.007 (CHF).
- JPY fiscal year-end (June contracts against Sep/Dec): −13.7bp.

## Deviations from the prereg

None.

## What this changes

- **C.OG's "20–30bp in a day signals funding stress emerging" is now tested on all four majors' bases, and in none does the basis move first.** The basis is a same-day record of what dollar funding costs, not an early warning, in 2016–2026.
- **Validated year-end premia: EUR/GBP (−14bp) and CHF (−19bp).** JPY widens at every quarter-end and at its fiscal year-end, so the calendar matters for the yen too, but not as a December-specific premium. All of these have shrunk since 2024.
- No live basis feed is built, because nothing here needs to be watched for timing. The basis stays in the research store, and the year-end premium is calendar context.
