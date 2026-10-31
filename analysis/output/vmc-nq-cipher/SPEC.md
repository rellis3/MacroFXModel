# VuManChu Cipher B: the indicator as implemented (Stage 0, deliverable A)

Study `vmc-nq-cipher`. This document records the implementation this research uses. It does not reopen which
definitions are correct: the repo's Pine-checked versions are taken as settled and cited.

## Sources of truth in the repo

| What | Where | Status |
|---|---|---|
| WaveTrend, Money Flow, price-VWAP maths | `js/vumanchuCore.js`; Python twin `pylego/indicators/vumanchu.py` | Python golden-tested bit-for-bit against the JS (`vumanchu_vectors.json`) |
| Operator's Cipher B settings and the yellow "VWAP" | `js/vumanchuChart.js` (DEFAULTS, `resolveVwapSeries`) | reviewed against the operator's Pine 2026-07-30 |
| Divergences (Pine `f_findDivs`) | `js/divergenceCore.js` | validated bit-for-bit against the operator's Pine (per `vumanchuChart.js` header); unit-tested |
| Research feature panel | `vmcResearch/vmcfeat.py` (`tf_state`) | causal; truncation-tested in `vmcResearch/validate.py` |
| This study's dataset | `scripts/vmc-nq-cipher/s0_dataset.py`, loader `vmcds.py` | this stage |

## Components and calculations

All are computed on each timeframe's own bars (close-stamped availability: a value exists at the bar's close).

| Component | Calculation (operator setup) | Inputs | Column(s) |
|---|---|---|---|
| WaveTrend | hlc3 → esa = EMA(9) → d = EMA(\|hlc3 − esa\|, 9) → ci = (hlc3 − esa)/(0.015·d) → wt1 = EMA(ci, 12) → wt2 = SMA(wt1, 3) | H, L, C | `wt1`, `wt2` |
| **WT spread = the Cipher B "VWAP"** | wt1 − wt2 (Pine `wtVwap`, the yellow area) | H, L, C | `wt_spread` |
| WT cross ("dots") | sign change of wt1 − wt2, on the bar it completes | H, L, C | `cross_dir`, `bars_since_cross`, `last_cross_dir`, `cross_above_zero` |
| Momentum (rate of change of WT) | first and second differences of wt1 / wt2 / spread | H, L, C | `wt1_slope`, `wt1_accel`, `wt2_slope`, `spread_slope` |
| Zones | wt1 vs ±53 (drawn OB/OS) and ±60 | H, L, C | `wt_zone`, `bars_since_zero`, `wt_shape` |
| Money Flow | Pine `f_rsimfi`: SMA(60) of (C − O)/(H − L) × 150 − 2.5 | O, H, L, C (**no volume**) | `mf`, `mf_slope`, `mf_accel`, `mf_run`, `mf_zero_cross` |
| RSI, Stoch RSI | RSI(14), Stoch RSI(14, 14, 3, 3) | C | `rsi`, `stoch_k`, `stoch_d` |
| **Price-VWAP distance** (a separate oscillator, NOT the Cipher B "VWAP") | close − rolling 20-bar volume-weighted VWAP, in trailing 500-bar return σ | H, L, C, **V** (real futures volume) | `vwap_dist` |
| Divergences | `f_findDivs`: strict 5-bar fractal (2 bars each side) on the oscillator; price high/low at the oscillator pivots; regular pairs consecutive **gated** pivots (bear ≥ 45, bull ≤ −65), hidden pairs consecutive ungated pivots; stamped at the **confirmation bar** (pivot + 2) | as the oscillator + H, L | `div_wt2` (gated, the Cipher B WT divergence), `div_spread`, `div_mf`, `div_vwapd` (ungated); each with `_gap` (bars between pivots), `_dpx` (price change, σ), `_dosc` |

Naming used in every output of this study: **"VWAP oscillator" means WT spread** (`wt_spread`, wt1 − wt2). The
price-VWAP oscillator is always called **"price-VWAP distance"** (`vwap_dist`). Earlier work used both under mixed
names; for this brief, VuManChu "VWAP oscillator" findings are WT spread findings.

## Dependencies: what is shared, and what that implies

- **WaveTrend, WT spread, WT crosses, momentum (slopes), zones, RSI and Stoch RSI are all functions of the same price
  path** (hlc3 or close, through EMAs). The WT cross is literally the zero-crossing of WT spread, so "WT cross" and
  "VWAP oscillator flips sign" are the **same event**. They can't count as two confirmations.
- Measured overlap (`MD files/VUMANCHU_DIRECTION_FINDINGS.md` §3, EUR/USD M15): RSI vs −wt1 0.90, rolling price-VWAP
  distance 0.87, session-VWAP distance 0.73; WaveTrend histogram −0.18.
- **Money Flow is the only Cipher B component built from a different transform**: candle body as a fraction of range,
  averaged over 60 bars. It correlates 0.46 with wt1 and about 0.01 with wt1 − wt2. It does not use volume.
- **Price-VWAP distance is the only component here that uses volume.** On futures that's real traded contracts, not
  CFD tick counts.
- Consequence for interaction tests: alignment counts use only components that are not definitionally the same
  (spread sign, wt1 sign, MF sign, price-VWAP sign). Any "agreement" gain is judged against the single strongest
  component, not against chance.

## Known differences from the published Cipher B and from earlier research code

1. **WaveTrend parameters**: the operator's 9/12/3, not the library default 10/21/4 (`LIBRARY_WT`). Earlier repo work
   (`vumanchuLab`) partly used 10/21/4.
2. **Money Flow**: the faithful Pine version is used. The earlier volume-weighted EMA(14), peak-normalised series
   (`parity_money_flow`) is a different series (Spearman ≈ 0.39 with the faithful one). Every "Money Flow adds
   nothing" conclusion in `vumanchuLab/FINDINGS.md` §4 was measured on that other series.
3. **Look-ahead in the live/parity versions**: `parity_money_flow` and `parity_vwap_osc` (`computeVWAP`) normalise by
   the maximum over the whole array, and the price VWAP is anchored at bar 0 of whatever window is drawn. That's
   harmless live, but it looks ahead when replayed on history. Research uses causal versions only (no normalisation for
   MF; rolling window and trailing σ for price-VWAP distance).
4. **Divergences**: this study uses the `divergenceCore.js` port of `f_findDivs` (fractal reach 2 on WT2, gates
   45/−65, price highs/lows). `vmcResearch/vmcfeat.divergence` differs: reach 5, WT1, closes, no gate. Results from
   that function are about a different definition.
5. **Display-only items not modelled**: Sommi flags and diamonds, the Schaff Trend Cycle and the "gold" buy dot. All
   were tested earlier (`project_vmc_research_verdict`: Sommi, Schaff null) and are outside this brief.

## Repainting and timing risks, and how the dataset handles them

- A fractal pivot at bar i is only known at **i + 2**. Divergence and wave events are stamped there, never at the
  pivot. Measuring from the pivot would back-date the signal by 2 bars.
- A higher-timeframe value is attached to a lower-timeframe row only when the HTF bar's close ≤ the row's close
  (`vmcds.align`, asserted). The in-progress HTF bar is never used. Using it would show what a TradingView chart
  shows intrabar, which repaints until the bar closes.
- Trailing quantiles only (the `wt_shape` steep threshold is a rolling 5,000-bar quantile). A whole-array percentile
  was a real leak in an earlier study.
- Timestamps: NinjaTrader stamps bars at their close, so they're restamped to bar open. Microsecond-stamped parquet
  files misaligned every timeframe in an earlier pipeline. Here all times are integer epoch seconds, and the loader in
  `vmcResearch/panel.py` now forces nanoseconds.
- Truncation test: features computed on history cut at a point must equal the full-history features on the prefix
  (`leak_tests.json`).

## The dataset (Stage 0 build, `data_quality.json`, `leak_tests.json`)

| | |
|---|---|
| Source | NinjaTrader NQ 1-minute, 44 contracts (NQ_03-16 to NQ_12-26), 43 rolls, ratio back-adjusted for indicators; raw contract close kept as `raw_close`, contract id on every row |
| Timestamps | NT8 stamps bars at their close; restamped to bar open. Check against the owner's open-stamped file: 1-minute return correlation 0.96 at zero shift, 0.002 at +-1 minute |
| Holes | NT8's backfill failed in month-long chunks (2018, 2024-2026: 291 business days, plus 18 dates truncated mid-session). Whole trade dates where the owner's file has > 1.2x NT8's bars are taken from the owner's file (282 dates, 385,717 bars, 19 blocks), each block anchored to the last NT8 price before it; `owner_share` marks them on every row. Where NT8 resumes the levels agree to median 0.000%, max 0.13%. 38 feed joins, all at session breaks; their opening moves are somewhat larger than ordinary session opens (median 4.4 vs 2.6 typical 1-minute moves) |
| Coverage after fill | 2,796 trade dates, 2015-12-14 to 2026-10-08; the remaining missing business days are exchange holidays (2-3 a year) |
| Other checks | no duplicate bars, no OHLC inconsistencies, 2.3% zero-range minutes |
| Timeframes | 1, 3, 5, 15, 30, 60, 240 minutes (UTC clock bins) and D (CME trade date, 17:00 Chicago boundary) |
| Leak tests | features rebuilt on history cut part-way agree bit-for-bit with the full build on every column, on 1m, 5m, 60m and D; every higher-timeframe value attached to a 5m row comes from a bar closed by then (max lag 0 s) |

**The lockbox boundary.** Rows with trade date on or after **2026-08-21** are written to `data/lockbox/` (48,075 1-minute
rows, 36 trade dates). Exploration, validation, feature and threshold choices use `data/explore/` only: trade dates
to 2026-08-20, with discovery to 2022-12-31 and validation from 2023-01-01. The loader (`vmcds.load`) refuses the
lockbox without the owner's explicit approval and asserts that no exploratory table holds a lockbox date. Because
every feature is causal (truncation-tested), lockbox rows were computed with history but carry no information backwards.
The repo's lockbox protocol needs >= 60 sessions before an evaluation; there are 36 so far.
