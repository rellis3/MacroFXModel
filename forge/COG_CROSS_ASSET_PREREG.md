# COG-CROSS-ASSET: does the SOFR-Euribor / SOFR-ESTR information relate to, or lead, gold, EURUSD, USDJPY, the Russell, the Dow, the S&P 500 and the DAX?

*Pre-registered 2026-10-16, before any rate line was compared with any of these assets. The owner asked for the same analysis against other assets. Every earlier study used Nasdaq only. Rates are a more natural driver of some of these (EURUSD and USDJPY respond to rate differentials; gold to real rates and the dollar), so the question is open for them, and it must be answered with the same discipline: same data rules, same horizons, same controls, same gates, and a correction for the much larger set of comparisons.*

## Assets (OANDA 1-minute research cache, `VolRangeForecaster/data/m1/<asset>_m1.parquet`, close, resampled with the registered 15-minute convention)
`xauusd` (gold), `eurusd`, `usdjpy`, `us2000` (Russell), `us30` (Dow), `spx500`, `de30` (DAX; the cache only holds the cash session, about 07:00-19:59 UTC, so DAX comparisons exist only in those hours). Nasdaq is the reference and keeps its earlier results.
**Window.** 2024-04-15 to **2026-08-20 only**. The research cache ends 2026-08-20; the forward block after that date is reserved for the lockbox in `forge/LOCKBOX_PROTOCOL.md` (H-A) and forge/INTRADAY_EXTREME_PATHS_PREREG.md, and **nothing after 2026-08-20 is read for any asset here** (the rate lines are cut at the same date). Splits: in-sample 2024-04-15 to 2025-03-31, validation 2025-04-01 to 2025-12-31, out-of-sample 2026-01-01 to 2026-08-20 (7.7 months, shorter than Nasdaq's, so out-of-sample power is lower; the power statement is printed).

## Rate lines (three, fixed now; raw rate calculations only, no display scale, offset, inversion, smoothing or plot lead)
**P0** C.OG's pair (SR3U6 minus IH7); **P3** the cleanest matched pair (SR3Z6 minus ER3Z6: SOFR vs ESTR, same period, same expiry convention); **L-US** the US leg alone (SR3Z6). P3 stands for "matched, and ESTR as C.OG's Discord note said"; L-US because the US front end is the classic driver of gold and the dollar pairs. Same day screen (3 distinct prices per leg per day).

## Tests, per asset x line (identical code and gates to COG-MATCHED-PAIRS; nothing retuned per asset)
- **T1 same-hour link** (descriptive, not in the correction): correlation of the line's 1-hour change with the asset's 1-hour return, R-squared and the rolling-20-day sign instability per half. The sign of the link is reported; for FX the quote direction (EURUSD up = euro up) is stated.
- **T2 lead grid** (W 15 m / 1 h / 4 h by H 15 m ... 48 h, day-clustered t, BH-FDR 10% in-sample, confirm same sign one-sided p < 0.05 in validation and out of sample) with the Addendum A leg decomposition for the spread lines.
- **T3 turn events**: primary k = 0.75, families A0 / A1 / A2, matched controls (own-event exclusion, Amendment B), shifted-line placebo (**100 draws**, mean near zero), Nasdaq-only analogue = asset-only baseline regression, day-block bootstrap, release-bar exclusion, validation and out-of-sample gates of COG-TURN-EVENTS.
- **T4 interpretable sequence**: the a-priori primary spec (trigger 0.5 theta, second push 0.5 theta, window 16 bars), its gates and its volatility gates; plain placebo **100 draws**; no 36-spec grid (not run).
- **T5 flexible model**: the walk-forward boosted trees of COG-SHAPE-AGNOSTIC with identical hyper-parameters, M0 asset-only versus M1 with the line's shape, 4 h direction and 2 h volatility, **30** shifted-line placebo draws (the placebo is a gate: the real gain must beat the placebo's 95th percentile), economic gate included in the verdict.
"Asset-only baseline" replaces "Nasdaq-only baseline" everywhere: the asset's own previous returns, ranges, volatility, zig-zag state and hour of day.

## Costs for the economic gate (fixed now)
The registered gate uses a round-trip cost of 1.0 bp of price for every asset, with 0.5 and 2.0 bp reported. This is lenient for gold (typical cost nearer 2 bp) and conservative for EURUSD / USDJPY (nearer 0.3-0.5 bp). It is kept uniform on purpose, so that no asset gets a cost chosen after its result. If a candidate passes everything else, its asset-specific cost is then applied as a further check, not as a replacement.

## The family and the correction
Candidates: 7 assets x 3 lines = 21. Each contributes **five** p-values (T2, T3, T4, T5 direction, T5 volatility), so the family is **21 x 5 = 105**. p-value definitions:
- **T2**: if no cell passes in-sample FDR, p = 1; otherwise the smallest over passing cells (and, for spread lines, only cells attributed to a spread effect) of the larger of the validation and out-of-sample one-sided p-values.
- **T3**: the smallest over A0, A1, A2 of the larger of the validation and out-of-sample matched-control one-sided p-values on the 2 h signed return.
- **T4**: the larger of the validation and out-of-sample matched one-sided p-values on the primary spec's 2 h signed return.
- **T5 (direction, volatility)**: the larger of the validation and out-of-sample **day-block bootstrap one-sided p-values** of the IC gain (the placebo with 30 draws cannot resolve p below 0.03 and is a gate, not a p-value, in this study).
Benjamini-Hochberg at 10% across the 105 p-values. **Consistency rule**: a result must pass the same test's registered gates on **at least two different assets with the same sign** (one asset alone is exploratory, because index and FX candidates are strongly related and a real effect should not be unique). A candidate that passes the correction but fails any gate (placebo, economic, volatility regression, release exclusion, consistency) is exploratory.

## Staged reporting (fixed now, so the order cannot depend on results)
Stage 1 (minutes): T1 and T2 for every asset and line, with leg decomposition. Reported first and in full, including negatives. Stage 2: T3, T4, T5 for all 21 candidates, whatever stage 1 showed (nothing is dropped or added on the basis of stage 1). One final report with the correction.

## Not changed after results
Assets, lines, window, splits, gates, costs, p-value definitions, the correction and the consistency rule are as written here. A promising-but-failing result goes in the exploratory table with the gate it failed. Contract-month robustness is still untestable before the December roll; the forward record is the untouched test.
