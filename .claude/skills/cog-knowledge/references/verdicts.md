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
| Gamma-regime trades on NQ (2026-10-19): fade p75 on long gamma / follow on short gamma; follow a zero-gamma break (the playbook his ES example shows) | **NULL** | interaction +0.06 R [−0.30, +0.44], switch −0.03 R/trade, break −0.01 R (n 61); CME book only (~5% of Nasdaq gamma) | `forge/GAMMA_REGIME_TRADES_PREREG.md` |
| Distance to textbook zero gamma (re-priced book) vs NQ next-day range, beyond the G2 sign (2026-10-18) | **NULL, underpowered** | ΔDR +0.023 (p 0.69), robustness signs disagree; placebo and positive-control gates failed (s.e. ~0.06), so ±0.15 not ruled out; long-gamma days within 0.5σ of Z ranged ~Brownian (1.04, n 21) — hypothesis only | `oi_research_book/ZERO_GAMMA_DISTANCE_RESULTS.md` |

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
| His two described setups on the identified line + continuous lead, 15 min–48 h (direction + vol) | **null** (2026-10-14) | 0/24 + 0/21 lead cells, Friday swing-confirm 0 confirmed, Monday divergence 0/18; same-window link +0.17…+0.23 stable; weak consistent divergence→8 h drift +0.12 in both halves, below the bar; trap: open-labelled line = one-bar look-ahead | `analysis/output/cog_video_0918/VIDEO_CLAIMS.md`, `forge/COG_VIDEO_CLAIMS_PREREG.md` |
| Trend-state turns of the identified line vs Nasdaq's trend shifts, 1–48 h, direct and forward (fuzzy causal zig-zag, 3 scales) | **null** (2026-10-14) | same-time state corr +0.15/+0.23; no lead beats the scramble band; event version 9/36 pass explore, 0 confirm (pooled +10.6 → +4.1 pp) | `analysis/output/cog_video_0918/TREND_STATE.md`, `forge/COG_TREND_STATE_PREREG.md` |
| The two weak patterns on 504 unseen days (2024-04 → 2026-04, pinned SR3U6 − IH7) | **divergence: does not replicate; trend-turn coincidence: real but not predictive** (2026-10-15) | same-hour +0.152 (t 5.4); divergence→8 h rho −0.002 (MDE 0.049); line turn → Nasdaq trend turn within 1–8 h +6.7 pp (z 7.3) but forward price move after a line turn ≈ 0 (|z| < 1); lead grid |rho| ≤ 0.03 | `analysis/output/cog_video_0918/PINNED_HISTORY.md`, `forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md` |
| Matched-contract pairs (SOFR/Euribor/ESTR, same reference period), each leg alone, 8 contracts, 105/33 p-value families | **null** (2026-10-16) | 0/33 survive; C.OG's pair (periods 91 days apart) has the strongest Nasdaq same-hour link; `analysis/output/cog_video_0918/MATCHED_PAIRS_RESULTS.md` |
| Interpretable sequence (direction change, confirmation, lagged Nasdaq; 36 specs, selection-aware placebo) + flexible tree model | **null; small 4 h rank-IC gain with ~0 gross** (2026-10-16) | `SEQUENCE_EVENTS.md`, `SHAPE_AGNOSTIC.md` |
| Fed funds meeting strip, legs by session, indicator options (range position / z-score / EMA slope) | **null** (2026-10-16) | `MEETING_PATH.md`, `LEGS_SESSION.md`, `INDICATOR_OPTIONS.md` |
| Same framing on 34 assets (27 FX, gold, 6 indices), US leg / C.OG pair / SOFR-ESTR pair | **same-day link real and sign-stable for USDJPY +, EURUSD −, gold −; no lead anywhere; volatility gain explained by scheduled-news timing** (2026-10-17) | `CROSS_ASSET_RESULTS.md`, `CROSS_ASSET_ADDENDUM_B_RESULTS.md` |
| Dynamic framing: rolling real-time gate, divergence, intraday futures spreads, daily and intraday spread-move episodes with asset-follow confirmation (28 yield spreads, 17 futures lines, 34 assets, ~44,000 cells) | **null; follow-through only in 2016 and 2020; relationship state anti-persists, not recognisable in advance** (2026-10-18) | `analysis/output/dynlead/DYNAMIC_LEAD_RESULTS.md` |

