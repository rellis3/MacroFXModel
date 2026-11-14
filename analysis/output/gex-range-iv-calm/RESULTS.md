# gex-range-iv-calm — results

Prereg: `forge/GEX_RANGE_IV_CALM_PREREG.md` (committed in `1e468058`, 2026-11-14; A1 PRE-RESULTS in `8c6af604`). Run 2026-11-14, seed 20261114, B = 4000 (the parent's block bootstrap).
Branch `main`. Ledger ids: `gex-range-iv-calm-es` and `gex-range-iv-calm-nq` (the two scored cells carry different verdict words under the registered rule). Scripts `scripts/gex-range-iv-calm/` (`run.py`, `finish.py`).

## Verdict: ES-calm NULL (marginal), NQ-calm UNDERPOWERED

Calm = the Cboe IV (VIX for ES, VXN for NQ) at or below its trailing 252-session median on the label date of S(D+1): 475 / 461 of 770 sessions, of which only 59 (ES) / 87 (NQ) are short-gamma. In the calm sessions, with the IV ratio in the baseline, the short-gamma coefficient is **ES -0.033 [-0.212, +0.099]** (t -0.42) and **NQ +0.083 [-0.041, +0.195]** (t 1.37); the Holm-adjusted p are 0.67 and 0.34. The registered gate (b ≥ +0.05, interval lower end > 0, Holm p < 0.05, above 95% of shift placebos) fails in both. By the verdict rule ES is `NULL` (the interval's upper end, 0.0986, sits just under the +0.10 operational bar: a marginal null) and NQ is `UNDERPOWERED` (the interval spans both 0 and the +0.10 bar; MDE 0.19). Calm sessions do not rescue the CME gamma sign once implied vol is controlled, but the arm is thin and a small calm-only remainder is not ruled out for NQ.

## Scored cells

| Cell | n calm (short) | b_IV,calm | 95% CI | SE | t | Holm p | MDE (design) | Placebo share below real | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| ES-calm | 475 (59) | -0.033 | [-0.212, +0.099] | 0.078 | -0.42 | 0.67 | 0.26 | 0.46 | NULL (marginal) |
| NQ-calm | 461 (87) | +0.083 | [-0.041, +0.195] | 0.060 | 1.37 | 0.34 | 0.19 | 0.86 | UNDERPOWERED |

Whole-sample B0 reproduces the banked coefficients (ES +0.147, NQ +0.165; check passed for both) and B1 reproduces the parent (ES +0.054, NQ +0.044).

## Controls (THE MIRROR and the contrast the paper claims)

| | ES | NQ |
|---|---|---|
| b_IV in **stress** sessions (B1) | +0.032 [-0.124, +0.190] | -0.028 [-0.211, +0.141] |
| B0 (no IV): calm / stress | +0.076 / +0.104 | +0.201 / +0.072 |
| calm − stress, B1 (paired bootstrap) | -0.065 [-0.301, +0.136] | +0.111 [-0.110, +0.331] |
| calm − stress, B0 | -0.028 [-0.286, +0.194] | +0.128 [-0.096, +0.352] |
| pooled interaction short × calm (B1 + calm) | +0.145 [-0.022, +0.298] | +0.141 [-0.023, +0.321] |
| IV-absorbed share in calm (Δb = B0 − B1) | +0.109 [+0.025, +0.196] | +0.118 [+0.056, +0.188] |

Reading: in calm sessions IV absorbs more than half of the range widening on both instruments (the paired interval of the absorbed amount excludes 0 for both). The calm-versus-stress contrast is not established: every difference interval spans zero. For NQ, calm (B0 +0.201) is larger than stress (+0.072), the paper's direction; for ES it is not (+0.076 vs +0.104). The pooled interaction coefficient is positive on both (+0.145 and +0.141) with lower ends just under zero, but it disagrees in sign with the split ES estimate (calm − stress −0.065), so the answer depends on whether the controls are allowed to differ by regime.

## Deviations from the prereg

A1 (PRE-RESULTS): sample sizes and design SEs; nothing else changed. **A2 (POST-HOC, results seen, bookkeeping only):** the prereg planned one ledger id; the two cells came out with different registered verdict words, so they are banked as `gex-range-iv-calm-es` (null) and `gex-range-iv-calm-nq` (underpowered) with the same prereg as `doc`. The calm-from-D variant listed in §3 was not run (the parent frame carries no separate OI-date IV column); the fixed-cut, tercile and half-sample variants were.

## Descriptive (never scored; sensitivities to the calm definition)

- Fixed cut (VIX < 20 / VXN < 25), B1 calm / stress: ES +0.080 / -0.013; NQ +0.113 / -0.034.
- Lowest-tercile calm, B1: ES +0.003; NQ +0.070.
- Halves (B1 calm): ES -0.085 then -0.004; NQ +0.068 then +0.096. NQ's calm estimate is positive in both halves; ES's is not.
- **The ES null depends on the calm definition:** the fixed cut gives ES +0.080 where the registered median cut gives -0.033. Report the registered cell; do not quote either as a calm-regime effect.
- Seen-data family: the sixth analysis of this window. Any pass would have needed |t| ≥ 3 and unseen data.

## What this changes

Nothing live. The terminal's dealer-gamma board and Replay may say "implied vol already prices most of the gamma widening, in calm sessions too" and may not say "gamma is informative in calm regimes". The CME-book calm-regime question is closed for ES (marginal null) and stays open as underpowered for NQ; the next test would need the Cboe full book or more sessions (about 4-6 times the calm short-gamma sessions to reach a 0.05 effect).
