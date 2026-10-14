# COG verdict ledger

One row per question tested. Newest additions at the bottom of each table. Every row cites the file that holds the
full result; check it before quoting numbers.

## The NQ alert system (replication attempt)

| Question | Verdict | Key numbers | Source |
|---|---|---|---|
| V1 hard 4-way gate conjunction | broken by design | zero trades in a 2-year synthetic backtest → replaced by a blended score (`cogThreshold1Gate.js`), then the V2 state machine | `cog/lessons/cog-gate-system.html` |
| QMR price-based gates | **DEAD** (2026-07-29) | edge was a free-hour artifact; honest Sharpe 0.36 at 46% DD | `cog-replication/DECISIONS.md` |
| Net liquidity as standalone daily direction | null | dirAlpha −0.011, t −0.14, n 521 | `cog-replication/README.md` (this result is current; other parts of that README are stale) |
| **G2**: GEX → next-day NQ range | **REAL** (range only, no direction) | +0.176 (p 0.0008), +0.315 vol-matched; 4/4 specs, 6/6 years; survives event-day confound; long gamma = quiet is the reliable side. FX cross-match mixed → NQ only | `oi_research_book/GEX_RANGE_BROWNIAN_RESULTS.md`, `G3_AND_EVENTDAY_RESULTS.md`, `GEX_FX_CROSSMATCH_RESULTS.md` |
| **G3**: OI wall magnet direction | **NULL** | 48.8% OOS on 615 days, IC +0.061 (p 0.34), placebo 49.9% | `oi_research_book/G3_AND_EVENTDAY_RESULTS.md` |
| **G1**: net-liquidity tide (2026-09-25) | **NULL** | 448 episodes; OOS hit 51.9/49.5/51.5% at 1/5/20d; 20d IC +0.194 IS → −0.026 OOS (sign flip, QE-era artifact); both buckets positive fwd returns; credit veto adds nothing; FLOW IS-trap 54.2% → 50.5% | `cog-replication/G1_RESULTS.md`, `g1_results.json` |
| Overall | **no validated directional layer**; stop calling it a replication | — | `cog-replication/DECISIONS.md` 2026-09-25 |

## His forecast lines

| Question | Verdict | Key numbers | Source |
|---|---|---|---|
| Can we reproduce his lines? | **yes** | HL p50 = raw Feller; p75 and OC ~5–7% tighter than theory | `cog/lessons/cog-reverse-engineering.html`, `js/cogReverseEngineer.js` |
| Can we rebuild his σ from price? | **no** | scale his/ours EURUSD 1.25, GOLD 1.15, NQ 0.98; day-to-day corr ~0.5 FX/gold, ~0.1 NQ; level tracks CME CVOL | `MD files/COG_GAP_FINDINGS.md` |
| Fade at his line vs our Feller bands (paired, costed, OOS) | **NULL** | not a better tradeable fade than our bands, OOS (no standalone results doc; the record is the lesson's takeaway) | engines `js/cogFadeEngine.js`, `js/cogLevelPoc.js`; record `cog/lessons/cog-reverse-engineering.html` (red takeaway) |
| Setups A/B × 5 direction rules (10y, Holm) | **nothing passes** | A mean R −0.066 (best rule −0.047); B −0.201, 86.7% stopped | `analysis/output/cog_setups/RESULTS.md` |
| 12 FRED spreads × 4 reads × sign × setup (192 choices) | **FAIL** | OOS −0.033R = no filter; beats placebo only 63% | `forge/COG_SPREAD_DIRECTION_PREREG.md`, `analysis/output/cog_yield_dir/RESULTS.md` |
| Direction study book S1–S7 | thin information | vote ladder −0.019R (all agree) to −0.082R (all disagree): a veto, not an entry; bond CFDs are the wrong rates instrument | `plans/STUDY_BOOK_2026-10-08.md` |

## Rates / the blue line

| Question | Verdict | Key numbers | Source |
|---|---|---|---|
| Rates lead Nasdaq (12+ tests, 1m to 1M) | **no lead replicates** | same-bar only | `plans/RATES_NASDAQ_WORKLOG.md` |
| Reconstruct "C.OG's blue line" | **REPRODUCED 2026-10-14** | plot = (SOFR Sep26 − Euribor Mar27, bp, trade prices, 15m, close) → EMA 2 → ×0.1 + 1.445, plotted at bar-OPEN time; zero fitted constants; RMSE 0.060 units, level 0.96 (0.98–0.99 within periods), 15-min Δ corr 0.61 (Mon–Tue 0.84 = noise floor of the digitised target), 2 h Δ 0.98; 7.5→8.0 = +5 bp; lead offset 0 (the one-day lead was not used) | `analysis/output/cog_video_0918/RECONSTRUCTION.md` §10–12 |
| His trade days vs our rates gap | descriptive only | n = 8 | `analysis/output/rates_residual/COG_DAYS.md` |

## Forward log (live agreement with COG)

| As of | n | Result | Source |
|---|---|---|---|
| 2026-07-31 | 2 | 07-30 both stood aside; 07-31 we disagreed and were right (he stopped, −76.1). Pre-registered bar: real if ≥ 70% agreement at n ≥ 30, null if ≤ 60% | `cog-replication/FORWARD_LOG.md` |

## Jordan / Colez mechanisations (adjacent, not C.OG's system)

| Study | Verdict | Source |
|---|---|---|
| Colez POI backtest, 26 pairs | Sharpe −3.43 | `education/coleztrades_poi_backtest/` |
| Jordan impulse range, ATR band, VWAP session reversion | null | `education/jordan_*_backtest/` |
| Jordan impulse 4h range levels | two correlations survive OOS: impulse size vs exhaustion (−), VWAP distance vs reversal size (+, all 7 instruments) | `education/jordan_impulse_4h_range_levels_backtest/` |
