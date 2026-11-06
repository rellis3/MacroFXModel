# jump-next-day-miss — results

Prereg: `forge/JUMP_NEXT_DAY_MISS_PREREG.md` (committed in `393d0351`, 2026-11-06). Run 2026-11-06, once, seed
20261106, B = 2000 (moving-block, 21 sessions), placebo 1,000 draws. Branch `worktree-agent-a61efe43e11706b8d`.
Ledger id: `jump-next-day-miss`. Script `scripts/jump-next-day-miss/run.py`; mechanics check `check.py`.

## Verdict: CONTEXT

The registered question was whether a BNS jump day widens the *next* session beyond its forecast. It does not, in
any class. What survives is the mirror: holding the previous day's own miss, σ tercile and the stress conditions
fixed, the session after a jump day is **narrower** than its forecast: −3.2% FX crosses [−5.1, −1.5], −3.8% indices
[−6.6, −0.8] (both Holm p < 0.05, placebo percentile 0.0 and 0.3, crosses negative in both halves). That is
significant but below the +5% bar and of the reversed sign, so CONTEXT by the frozen rule. FX majors NULL (−2.5%
[−5.4, +0.6], powered, CI excludes +5%). Gold UNDERPOWERED.

## Scored cells

Estimate = primary β on ln(realised H→L ÷ PIT p50) of session t+1, shown as % (exp β − 1).

| Cell | n rows (jump) | Estimate | 95% CI | MDE | Pass bar | Holm p | Placebo pctile | Halves | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| fx_majors | 10,886 (1,579) | −2.5% | [−5.4, +0.6] | 4.3% | +5% | 0.256 | 7.8 | +0.2 / −4.2 | NULL |
| fx_crosses | 31,098 (4,018) | −3.2% | [−5.1, −1.5] | 2.9% | +5% | 0.002 | 0.0 | −3.2 / −3.0 | CONTEXT |
| indices | 8,782 (977) | −3.8% | [−6.6, −0.8] | 5.2% | +5% | 0.045 | 0.3 | −1.4 / −5.1 | CONTEXT |
| gold | 1,454 (155) | −0.7% | [−7.3, +6.9] | 11.9% | +5% | 0.862 | 45.8 | +8.8 / −8.3 | UNDERPOWERED |

## Does the jump add beyond the previous day's miss?

| Class | Raw jump − other | σ-tercile matched | β, σ tercile only | β, σ + previous miss | β, all controls |
|---|---|---|---|---|---|
| fx_majors | −1.3% | −1.3% | −0.9% [−3.8, +2.3] | −3.1% [−5.9, +0.1] | −2.5% |
| fx_crosses | −0.8% | −0.5% | −0.4% [−2.6, +1.6] | −3.7% [−5.6, −2.1] | −3.2% |
| indices | −3.3% | −2.9% | −3.0% [−6.2, +0.1] | −5.5% [−8.4, −2.2] | −3.8% |
| gold | −0.5% | −0.1% | −0.1% [−7.3, +7.3] | −0.4% [−7.5, +7.0] | −0.7% |

Raw, the forecast already handles the day after a jump (within ~1% on FX). The previous day's miss is much larger on
jump days (mean ln ratio +0.12 to +0.13 vs −0.02 on FX), and on ordinary days a big miss carries into tomorrow. A jump
day's miss carries **less**: adding the previous miss turns the jump coefficient negative. Read: variance from a jump
is less persistent than diffusive variance (the HAR-RV-J result of Andersen, Bollerslev & Diebold 2007), so the
forecast's persistence slightly over-reacts to jump-driven big days.

## Secondary (descriptive)

| Class | p75 exceed (pp, adj.) | p90 exceed (pp, adj.) | Raw p75 jump / other | Raw p90 jump / other | J5 per jump day | J5 placebo pctile |
|---|---|---|---|---|---|---|
| fx_majors | −1.3 [−4.3, +1.8] | −0.3 [−2.2, +1.9] | 24.1 / 24.5% | 10.1 / 9.9% | −2.1% [−3.4, −0.7] | 0.1 |
| fx_crosses | −3.2 [−5.1, −1.5] | −1.7 [−3.0, −0.5] | 22.8 / 24.1% | 9.0 / 9.6% | −0.8% [−1.8, +0.2] | 0.0 |
| indices | −1.5 [−4.3, +2.0] | −2.6 [−4.6, −0.1] | 25.9 / 27.0% | 8.1 / 10.6% | −2.1% [−3.6, −0.6] | 0.2 |
| gold | +0.8 [−6.4, +8.7] | −2.0 [−6.0, +3.0] | 28.4 / 27.6% | 8.4 / 10.2% | −2.2% [−5.1, +1.1] | 10.6 |

A run of jump days (J5) points the same way: each extra jump day in the last five takes ~1–2% off the next session's
ratio. No cell anywhere has the registered (positive) sign with an interval above zero.

## Controls and mechanics

- Placebo: J shuffled within instrument × calendar quarter, 1,000 draws; the real β sits at the 0.0–0.3 percentile
  for crosses/indices (outside the placebo's 95% band of about ±1–2.5%), 7.8 for majors, 45.8 gold.
- `check.py`: EURUSD rebuilt independently (pairs by row index merge, not `shift`): 1,555 pairs both ways, raw
  difference −0.0562 and β(J | m_prev) −0.07716 identical to the run's loader. Every row's predictor date is before
  its target date; target dates 2020-08-20 → 2026-08-20 (nothing after the lockbox); stress controls 0% missing.
- Jump-day rates 10.7–14.5% of sessions, matching `jump-structure` (~12%).

## Deviations from the prereg

None. `results.json` had its metadata (`ranAt`, `prereg`, `preregCommit`, `cells`) added after the run; no number
changed.

## What this changes

- **Not a line-widening input.** "Expect a wider day after a jump" is wrong; the desk must not say it.
- The mirror is a small (~3–4%) over-reaction of the forecast's persistence to jump-driven days, i.e. a
  **jump-discounted persistence term** (feed tomorrow's σ with bipower/continuous variance rather than RV on a BNS day)
  is the candidate, not a widening. Below the 5% bar and research-only; it needs its own prereg on pinball loss
  (HAR-RV-CJ vs the shipped forecast) before any shadow.
- Gold reopens only with a longer sample (2016–2020 backcast rows).
