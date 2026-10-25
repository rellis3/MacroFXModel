# dax-ifo-lookahead — results

Prereg: `forge/DAX_IFO_LOOKAHEAD_PREREG.md` (committed in `0a240275`, 2026-10-25). Run 2026-10-25, seed 20261025,
B = 10,000, mean block 6 months. Branch `claude/overnight-hold-dax-ifo-retro`. Ledger id: `dax-ifo-lookahead`.
Script: `scripts/dax-ifo-lookahead/check.py` → `results.json`.

## Verdict: NULL

The original result is lookahead. `02_base_ifo_strategy.py` gives month M the IFO reading for month M, which is
published around the 24th–25th of M, and credits it with the whole month's DAX return. Once the trade only uses a
reading that has been published, the rule loses money. The gate (both honest timings positive, CI above 0, both
halves) fails. Timing (B)'s 95% interval, [−0.84, +0.21]% a month, lies below the +0.5% bar, so it's NULL rather than
underpowered.

## Scored cells

| Cell | n (months) | Mean / month | 95% CI | CAGR | Max DD | t | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| (B) signal → next month | 246 | −0.31% | [−0.84, +0.21] | −5.25% | −70.0% | −0.95 | 0.39 | NULL |
| (C) from release (~25th) to next release | 245 | −0.44% | [−1.09, +0.22] | −6.96% | −81.9% | −1.21 | 0.39 | NULL |

Halves: (B) −0.09 / −0.54; (C) −0.35 / −0.52. Negative in all four.

## Controls

| | CAGR | Max DD | Sharpe (rf 3.8%) | Sharpe (rf 0) |
|---|---|---|---|---|
| (A) original, same month (reproduction) | **+9.42%** | −27.4% | 0.32 | 0.53 |
| DAX buy & hold, same months | +7.53% | −52.4% | 0.21 | 0.42 |

(A) reproduces the claim exactly, so the code being tested is the code that produced it.

## Descriptive

- Long/flat (only the "IFO up" signal): (B) +1.88% CAGR, (C) +1.15%, against buy & hold +7.5%. Being out of the
  market half the time costs more than the signal adds.
- Release-day sensitivity: day 22 −6.38% CAGR, day 27 −6.33%. The result doesn't depend on the release-date
  approximation.
- With 0.10% per position flip: (B) −5.74% CAGR.
- The original also had no costs, a flat 3.8% risk-free rate through years of ~0% euro rates, an OLS
  (`04_regression_analysis.py`) of the same same-month relationship, and a Monte Carlo that resampled only the
  strategy's own (lookahead) returns, so none of its robustness checks could have caught the timing.

## What this changes

- "august analysis.md": "Dax IFO (decayed 2020+)" → "lookahead, never tradable".
- `Dax Base IFO System/System/README.md` gets a warning header.
- IFO's same-month co-movement with the DAX is real (that's why (A) looks good); it just isn't known in time. An
  IFO *surprise vs consensus* on release day is a different, untested question.
