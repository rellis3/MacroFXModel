# COG-DYNAMIC-LEAD: final report

Registered in `forge/COG_DYNAMIC_LEAD_PREREG.md` and Addenda C and D (C and D registered after earlier families returned negative, disclosed there). Every number below is in a file next to this one. Window to 2026-08-20; the reserved forward block was not read.

## The question, in the owner's terms
Does a yield or futures spread start moving first, in identifiable periods, and does the asset then follow (after a measurable delay) so that the following itself confirms the relationship and can be traded? Can those periods be recognised before they pay? Is it usable after costs?

## What was tested
| Study | Data | Cells / specs | Result under the registered rules |
|---|---|---|---|
| Family M: rolling, real-time-gated lead (state from completed pairs only) | 28 yield / curve / outright series (US, DE, JP, UK; 1Y to 30Y) x 34 assets (27 FX, gold, 6 indices), daily 2016-2026-08 | 28 560 | no cell survives Discovery after correction; 40 placebo draws also zero; at zero cost still noise (0.6% of cells at p<0.05, median gross Sharpe -0.22) |
| Family D: divergence as catch-up vs breakdown, by relationship strength | same | 9 384 | no survivors; placebo zero |
| Stage B: intraday SOFR / Euribor / ESTR futures spreads (rolling gate) | 6 lines x 34 assets, 15-min, 2024-26 | 4 896 | no survivors; placebo zero |
| Addendum C: daily episodes (spread move, asset follows = confirmation, trade) incl. coupling state | same panels | 608 | no survivors; placebo 0 (95th pct 0) |
| Addendum D: the same episodes on 17 intraday lines (7 legs incl. the `I2!` stand-ins IH7 / IZ6 and ESTR, 5 SOFR/Euribor/ESTR calendar spreads, 5 cross-curve spreads) | 17 lines x 34 assets, 15-min | 896 | no survivors; placebo 0 |
| Nonlinear check (boosted trees, 5 assets, walk-forward by year) | daily | 5 assets | gains positive on all five but every shifted-spread placebo gains as much; none beats its 95th percentile; best net Sharpe 0.36 |

## Strongest combinations, conditions, delay, failure, real-time recognition
- **Strongest real relationship (same-day, not forward):** the US leg against USDJPY (+0.54 / +0.52 / +0.32 across the three periods), EURUSD (-0.30 / -0.34 / -0.46) and gold (-0.20 / -0.17 / -0.33): sign-stable and economically sensible; equities flip sign. It explains the same hour or day, it does not lead.
- **Strongest forward-looking combinations found, all exploratory and none surviving:** daily episodes with z0 2, k 1, m 1, c 1, h 5 (+33 bp net per trade in Discovery, p 0.001, placebo -2 bp) which then went to -15 bp in Validation and -16 bp out of sample; intraday euro-leg lines on small samples (IZ6 -> DE30, 19 episodes, Holm p 0.39; ER3Z6 -> EURGBP, 9 episodes, Holm p 0.45).
- **When it "worked":** the confirmed-episode excess over the shifted-spread baseline is large in **2016 (+117 bp at day 20)** and **2020 (+314 bp)** and small in 2022 (+15), and zero or negative in every other year including all three out-of-sample years (-40, -30, -32 bp at day 20). Discovery had 223 of 608 specs above the placebo by 2 standard deviations (14 expected by chance); Validation 14 and out of sample 17 (14 expected). Intraday: 149 and 120 specs above placebo in Discovery and Validation (20 expected), 27 out of sample, with 84 *below* placebo. The periods existed; they were not recognisable in advance.
- **Typical delay and its consistency:** pooled across all confirmed daily episodes the excess response builds from about +10 bp at day 2 to +19 to +20 bp by days 5 to 20 (a delay of about 2 to 5 days). By year the half-time is about 5 days in 2016 and 2020 and 1 to 10 days in the few other positive years, and undefined in most (there is no positive response to time). Intraday, across all 17 lines, the excess response is about +0.4 bp after 1 hour and about +1.1 bp after 8 to 24 hours: economically nothing.
- **How often it fails:** confirmed daily episodes lose in 51% to 60% of trades out of sample (coupled state 60%), against about 50% for chance; intraday the primary spec loses on 51% to 62% by line.
- **Can the state be recognised in real time?** No. (1) Regime persistence is negative: the trailing relationship state against the next 125 days correlates -0.04 to -0.07 (placebo mean about 0, sd 0.015): relationships anti-persist. (2) The 60-day coupled state does not help: coupled episodes returned -32 bp out of sample (n 631, 60% losing), worse than the all-episode result. (3) The asset-follow confirmation does not help out of sample: confirmed episodes returned -21 bp against the placebo's -6.5 bp (4.1 placebo standard deviations *worse*), and the registered selection procedure, run on the real data, finds exactly what it finds on shifted data: nothing.
- **Divergence (catch-up vs breakdown):** no survivors in Family D or in the 32 divergence specs of the episode families.

## Is there a practical trading application?
**No.** No frozen cell survives, so no practical-application gate could be reached, and the practical gate's other conditions (positive in most out-of-sample years, positive at twice the cost) fail on the real numbers. The data support only context: the US front-end move explains a large part of the same-day USDJPY, EURUSD and gold move.

## One thing to be careful with (not a finding)
Out of sample the confirmed episodes did *worse* than random-confirmation ones (excess about -15 bp, 4 placebo SDs) and in Discovery they did better (+15 bp). A fade would have "worked" out of sample, but this sign was seen only after the fact, flips between periods, and is of the kind the selection-aware placebo exists to stop; it is not registered, not frozen and not a result. If it is ever worth anything, only a forward record registered now could say so.

## Limits
Contract-month robustness for the futures lines is untestable before the December roll; the daily European curve is the Bundesbank's, not Euribor / ESTR; no financing or swap points are in the FX returns (a spread signal can be a carry proxy); the literal stitched `I2!` history before April 2026 does not exist in our data; out-of-sample is 2.6 years daily and 7.7 months intraday; episodes on the same date are one cluster, so effective samples are far smaller than event counts.

## Files
`EPISODES_RESULTS.md`, `EPISODES_INTRADAY_RESULTS.md`, `DESCRIBE_DYNAMICS.md`, `NONLINEAR_CHECK.md`, `familyM_cells.parquet`, `familyD_cells.parquet`, `familyB_cells.parquet`, `episodes_cells.parquet`, `episodesB_cells.parquet` and the placebo files; scripts in `scripts/dynlead/`.
