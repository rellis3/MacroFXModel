# Layer 7 sizing rule (compliance action A4)

Code: `forge/sizing.py` (`python -m forge.sizing` prints the table). Evidence: `forge/VOL_TARGET_PREREG.md` (σ sizing),
`forge/STOP_RISK_PREREG.md` + `stop-risk.json` (loss given stop). Lesson 3 §03: size for both diffusive and jump risk.

1. **Exposure** follows the forecast σ: weight = median σ ÷ today's σ, capped at 2× normal. Steadies risk (month-to-month
   swing 0.63 → 0.25) at the same return; which σ is used hardly matters.
2. **Position size** = risk budget ÷ (stop distance × **loss given stop**), where loss given stop is the p99 loss in R
   for the stop's distance (in σ) and its conditions — not 1R.

| 1σ stop, condition | p99 loss given stop | mean |
|---|---|---|
| within the week, intraday, off release minutes | 1.03R | 1.005R |
| held over a weekend | 2.08R | 1.047R |
| hit on a :00/:30 release minute | 1.58R | 1.021R |
| held overnight | 1.30R | 1.010R |
| tier-1 event day | 1.32R | 1.010R |
| indices | 1.28R | 1.011R |

Conditions overlap, so the rule takes the largest applicable p99 (an upper bound). Tighter stops gap worse in R
(0.5σ over a weekend: 2.82R), so distances round down to the nearest mapped one. Mid prices, M1 resolution, no
spread: real losses are at least this large.

Expectancy uses the mean column; sizing uses p99.
