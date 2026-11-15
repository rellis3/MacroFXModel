# Evidence grader fix: before / after

2026-11-15. `js/evidenceGrade.js` regraded over all 395 Evidence Book entries (`js/deskEvidence.js`, audit `js/evidenceAudit.js`).

## What changed in the grader

1. **Headline, not first, interval.** Every "estimate [lo, hi]" is read; an interval whose own sentence names it the headline/primary wins, else the first that is not a side arm (placebo, mirror, shifted, shuffled, planted, neighbour-year, described/descriptive, post-hoc, secondary). A cue used as the baseline of the headline comparison ("hold minus coin-flip placebo", "against a matched control") does not count as a side arm. If every interval is a side arm the entry is graded from its verdict.
2. **Direction.** The interval is turned into "the claimed way" (`eff`, `effLo`, `effHi`). An entry can carry `headline: { sign: -1 }` (claim points negative); a validated entry whose interval is wholly below zero is read as a negative claim. Clear of zero the *other* way is now graded **against** for any verdict (flag `wrongWay`), unless the code audit marked the test reopened/unverified.
3. **Formats.** Up to four words between estimate and bracket ("% per trade", "ATR against the crowd", "vs control", "per sigma"), units R, log, x (ratios read against 1), K, and a trailing note inside the bracket. "log-loss" no longer trips the "worse"-framing flag.
4. **Overrides on the entry.** `headline: { est, lo, hi, sign, unit, note }` and `grade` + `gradeWhy` (hand grade). Added `headline` to 10 entries: cot-crowding-va1, hedge-finder-book, stress-filter-hold-direction, wall-dte-style-h1, bank-credit-dollar-dxy, bank-credit-panel-equity, quarter-end-funding-spike, basis-yearend-jpy (sign -1), nq-forecast-target-ev, stir-residual-catchup (numbers). No hand `grade` was needed.

Grade counts before: strong 23 · leaning 36 · faint 53 · untested 165 · against 62 · context 56

Grade counts after: strong 25 · leaning 36 · faint 56 · untested 152 · against 70 · context 56

## Every grade that changed (20), largest weight move first

| id | verdict | old grade / weight | new grade / weight | interval read: old → new | why |
|---|---|---|---|---|---|
| hedge-finder-book | underpowered | untested / 20 | leaning / 75 | -9.2 [-11.4, -7] % → -9.2 [-11.4, -7] % | Claim is a CUT in expected shortfall (headline.sign -1). ES5 -9.2% [-11.4, -7.0] is the claimed way, clear of zero; drawdown leg underpowered. |
| overnight-hold-nq | underpowered | untested / 28 | leaning / 75 | — → 0.034 [0.001, 0.066] % | "% per trade [..]" was unparseable, so it was graded from the verdict alone. Now reads +0.034% [+0.001, +0.066]: clear of zero, study underpowered for its own bar. |
| basis-yearend-premium | validated | leaning / 55 | strong / 95 | -14.4 [-24.2, -4.8] bp → -14.4 [-24.2, -4.8] bp | Validated with a wholly negative interval: the claim (year-end costs more) is negative in this sign convention, so sign inferred and the passed, audited test is now strong. |
| cot-crowding-va1 | null | faint / 42 | against / 8 | 0.0024 [-0.0185, 0.0297] % → 0.0024 [-0.0185, 0.0297] % | Claim is "do WORSE" (headline.sign -1 on the entry); the +0.0024% pnl/trade was being counted as the claimed way. In the claimed direction it is -0.0024 [-0.030, +0.019]: a sound null at zero. |
| positioning-into-release-direction | validated | leaning / 63 | strong / 95 | -0.009 [-0.053, 0.032] → 0.064 [0.019, 0.111] ATR | Was read from the PLACEBO interval (-0.009 [-0.053, +0.032]); "+0.064 ATR against the crowd [..]" was unparseable (words between estimate and bracket). Now reads the headline +0.064 ATR [+0.019, +0.111]. |
| basis-yearend-jpy | underpowered | untested / 20 | faint / 49 | -12.4 [-24.1, 0.8] bp → -12.4 [-24.1, 0.8] bp | Same sign convention as basis-yearend-premium (headline.sign -1): -12.4bp [-24.1, +0.8] is the claimed way, straddles zero. |
| overnight-hold-gbpusd | null | untested / 28 | against / 3 | — → -0.026 [-0.044, -0.009] % | "% per trade [..]" now parsed: -0.026% [-0.044, -0.009], clear of zero the wrong way (loses net). |
| nq-forecast-target-ev | underpowered | untested / 20 | faint / 45 | -0.026 [-0.05, -0.003] % → 0.027 [-0.029, 0.086] % | Was read from a side comparison (P1 - no-target -0.026%); the headline "P1 +0.027%/trade (+$86 ..) [-0.029, +0.086]" has a parenthesis before its bracket, so set via headline on the entry. |
| wall-dte-style-h1 | underpowered | untested / 24 | faint / 44 | -2.8 [-8.9, 3.8] pp → -2.8 [-8.9, 3.8] pp | Claim is walls break LESS (headline.sign -1). -2.8pp [-8.9, +3.8] in the claimed direction is +2.8 [-3.8, +8.9]: points the claimed way. |
| opex-cycle-range | underpowered | untested / 28 | faint / 48 | — → 0.055 [-0.014, 0.124] log | "+0.055 log [..]" now parsed (log unit): points the claimed way, straddles zero. |
| overnight-hold-gold | underpowered | untested / 28 | faint / 47 | — → 0.022 [-0.009, 0.054] % | "% per trade [..]" now parsed: +0.022% [-0.009, +0.054], points the claimed way. |
| stress-filter-hold-direction | underpowered | faint / 43 | untested / 25 | 0.022 [-0.051, 0.089] sigma → 0.022 [-0.051, 0.089] sigma | Claim is stressed days LOWER than calm (headline.sign -1). Stressed minus calm +0.022 sigma is the wrong way, inside zero: no longer "faint". |
| hedge-residual-mr | null | untested / 20 | against / 3 | -1.19 [-1.76, -0.6] → -1.19 [-1.76, -0.6] | Net Sharpe -1.19 [-1.76, -0.60] is clear of zero against the claim; now "against" even though the test is unaudited. |
| hedge-residual-mom | null | untested / 20 | against / 3 | -1.78 [-2.45, -1.08] → -1.78 [-2.45, -1.08] | Net Sharpe -1.78 [-2.45, -1.08] is clear of zero against the claim; now "against" even though unaudited. |
| vwap-stretch-line-touch | underpowered | untested / 20 | against / 3 | -0.154 [-0.339, -0.02] → -0.154 [-0.339, -0.02] | Top-minus-bottom tercile -0.154 [-0.339, -0.020] is clear of zero against the claimed fade edge. |
| fiscal-reaction-uk-size | underpowered | untested / 28 | faint / 45 | — → 1.19 [0.72, 1.76] x | "1.19x [0.72, 1.76]" ratio now parsed and read against 1: +0.19 [-0.28, +0.76], points the claimed way. |
| fiscal-reaction-uk-direction | underpowered | faint / 45 | untested / 28 | 0.42 [-0.31, 0.91] → — | Its only interval is labelled "Described" (below the registered floor of events); a description is not the scored test, so it is graded from the verdict. |
| vol-layer-round-numbers | null | untested / 20 | against / 3 | -1.28 [-1.87, -0.68] pp → -1.28 [-1.87, -0.68] pp | P(reject) at 00 -1.28pp [-1.87, -0.68] is clear of zero against the claim (round numbers reject LESS); now "against" though unaudited. |
| failed-auction-volume | underpowered | untested / 20 | against / 3 | -0.31 [-0.59, -0.02] R → -0.31 [-0.59, -0.02] R | S1 V-low -0.31R [-0.59, -0.02] is clear of zero against the claim; significant the wrong way outranks "underpowered". |
| value-migration-nq-strategy | null | untested / 20 | against / 3 | -0.084 [-0.107, -0.062] R → -0.084 [-0.107, -0.062] R | Busy cells -0.084R [-0.107, -0.062] clear of zero against the claim; now "against" though unaudited. |

## Same grade, different reading or weight (21)

| id | grade | old → new weight | interval read: old → new |
|---|---|---|---|
| rates-pivot-lead | against | 9 → 7 | — → -0.005 [-0.021, 0.012] % |
| cot-crowding-p9 | against | 9 → 3 | -0.00142 [-0.00248, -0.00052] → -0.00142 [-0.00248, -0.00052] |
| cot-crowding-p10 | against | 9 → 4 | -0.00172 [-0.0037, 0.0002] → -0.00172 [-0.0037, 0.0002] |
| news-asymmetry | untested | 28 → 22 | — → -0.1 [-0.23, 0.04] |
| overnight-hold-usdjpy | untested | 28 → 26 | — → -0.005 [-0.026, 0.016] % |
| hedge-finder-book-es | leaning | 55 → 75 | -9.2 [-11.4, -7] % → -9.2 [-11.4, -7] % |
| live-range-confluence-book | against | 5 → 3 | -0.012 [-0.031, 0.008] → -0.21 [-0.37, 0] |
| rule-a-late-entry | against | 3 → 5 | -0.185 [-0.292, -0.093] R → -0.1 [-0.26, 0.063] R |
| fiscal-reaction-us-size | untested | 28 → 26 | — → 0.94 [0.72, 1.21] x |
| gamma-regime-trades-fx | against | 8 → 3 | -0.02 [-0.17, 0.14] → -0.081 [-0.124, -0.039] R |
| vol-crush-drift | untested | 28 → 28 | — → 0.03 [-0.23, 0.28] % |
| range-ladder-placebo | untested | 20 → 35 | -0.09 [-0.16, -0.02] pp → 0.91 [0.82, 1.01] pp |
| ys-long-breadth | untested | 28 → 34 | — → 0.229 [-0.05, 0.492] % |
| credit-leads-equities | untested | 35 → 28 | 0.26 [0.1, 0.39] → — |
| bank-credit-dollar-dxy | untested | 21 → 34 | -0.1 [-0.24, 0.02] → -0.1 [-0.24, 0.02] |
| bank-credit-panel-equity | untested | 23 → 32 | -0.028 [-0.089, 0.027] → -0.028 [-0.089, 0.027] |
| rates-vol-gap-state | untested | 28 → 24 | — → -0.07 [-0.197, 0.069] log |
| quarter-end-funding-spike | untested | 21 → 34 | -0.32 [-0.65, 0.07] → -0.32 [-0.65, 0.07] |
| basis-yearend-chf | leaning | 55 → 75 | -19.3 [-32.4, -6.1] bp → -19.3 [-32.4, -6.1] bp |
| post-release-drift-pooled | untested | 22 → 21 | -0.024 [-0.059, 0.01] → -0.049 [-0.111, 0.012] |
| post-release-momentum-pooled | untested | 21 → 23 | -0.026 [-0.056, 0.002] → -0.031 [-0.082, 0.019] |

Notes: bank-credit-dollar-dxy, bank-credit-panel-equity and quarter-end-funding-spike got `headline.sign -1` but stay "untested" because the code audit marks them suspect. stir-residual-catchup's headline (+0.186 [+0.037, +0.342], "FAIL on its placebo rule only") is now set on the entry; it stays "untested" because the code audit marks it reopened. credit-leads-equities now has no headline interval (its only one is "Descriptive only") and stays untested (also reopened in the audit).
