# COG-CROSS-ASSET, Addendum B: is the 2-hour volatility information just scheduled-news timing?

*Registered 2026-10-17 **after** the stage-2 results of COG-CROSS-ASSET were read. Those results showed that the flexible model's 2 h volatility IC gain passes its registered gates (CI above zero in validation and out of sample, beats the shifted-line placebo's 95th percentile, bootstrap p small) and survives the family-wise correction and the consistency rule for EURUSD (three lines), the Dow (P0) and the Russell (P3). The registered volatility gates do not control for a common reaction to scheduled news: rates and the asset both become volatile at the same scheduled releases, so rate activity could be telling the model "a release just happened" rather than anything the rate line adds. This addendum tests that. Because it is registered after the result it **can only demote a finding; it cannot add one**, and it is not counted in any family.*

## Candidates
Every asset-line whose registered T5 volatility gate passed: EURUSD (P0, P3, L-US), Dow (P0, P3 is excluded because its gate failed, L-US), Russell (P3), USDJPY (P3), S&P 500 (L-US). Stage-2 outputs are not rerun; the same walk-forward models are refit (identical hyper-parameters, seeds, splits, window to 2026-08-20).

## Variants (target: log |asset return over the next 2 h|, i.e. the registered `vol_8`)
- **V1 replicate**: the registered M0 (asset-only) versus M1 (asset-only + line shape): must reproduce the stage-2 IC gain.
- **V2 news-calendar baseline**: M0n = M0 + scheduled-release features, M1n = M0n + the same line features. Release features, all from a fixed calendar: minutes since and until the nearest scheduled release (08:30 ET and 10:00 ET on every weekday, 14:00 ET on FOMC decision days, the list in `cog_sequence_events.py`), each capped at 600 minutes; indicator for within 60 minutes after a release; day of week; FOMC-day flag; minutes since the 09:30 ET US open (capped 600). The ECB, BoE and BoJ decision dates and the unscheduled-news hours are **not** in the calendar (not available in a form fixed before looking); stated as a limitation, not hidden.
- **V3 quiet-of-scheduled-news subset**: the V1 predictions scored only on bars with no scheduled release in the 2 hours before or the 2 hours after the bar.
Gain = IC(M1 variant) - IC(M0 variant), day-level Spearman, 2 000-draw day-block bootstrap CI (the registered `gain` function), per half (validation, out of sample) and pooled.

## Pass rule (fixed now)
A volatility finding **survives scheduled-news control** only if V2 **and** V3 each have a positive IC gain with the bootstrap CI above zero in **both** validation and out of sample. If either variant fails in either half, the finding is reclassified **"explained by scheduled-news timing (not shown to add information beyond it)"** and is removed from the result list. If it survives, it stays "volatility context (no trade)", with the uncontrolled-news limitation attached. Nothing in this addendum changes the registered verdicts of COG-CROSS-ASSET; it adds a qualifier.

## Still not tested after this
Unscheduled news and non-US central-bank dates; contract-month robustness for each line before the December roll; any untouched sample (the forward record from 2026-10-15 and the lockbox block after 2026-08-20 remain untouched).
