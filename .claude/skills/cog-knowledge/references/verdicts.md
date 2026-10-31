# COG verdict ledger

One row per question tested. Newest additions at the bottom of each table. Every row cites the file that holds the
full result; check it before quoting numbers.

## The NQ alert system (replication attempt)

| Question | Verdict | Key numbers | Source |
|---|---|---|---|
| V1 hard 4-way gate conjunction | broken by design | zero trades in a 2-year synthetic backtest → replaced by a blended score (`cogThreshold1Gate.js`), then the V2 state machine | `cog/lessons/cog-gate-system.html` |
| QMR price-based gates | **DEAD** (2026-07-29) | edge was a free-hour artifact; honest Sharpe 0.36 at 46% DD | `cog-replication/DECISIONS.md` |
| Net liquidity as standalone daily direction | null | dirAlpha −0.011, t −0.14, n 521 | `cog-replication/README.md` (this result is current; other parts of that README are stale) |
| **G2**: GEX → next-day NQ range | **REAL on NQ and ES** (range only, no direction); ledger `gex-range-es` validated, `gex-range` re-run banked underpowered (placebo design, not the effect) | 2026-10-21 re-run with honest OI timing + NY-close bars: ES vm +0.377 [+0.24, +0.52], NQ +0.288 [+0.18, +0.40]; ~half is short gamma following market falls, return-controlled ~+0.15 (ES t 2.0, NQ t 3.3); ES/NQ same sign 82.5% of days. Long gamma = quiet is the reliable side. FX still does not carry it | `oi_research_book/GEX_RANGE_BROWNIAN_RESULTS.md`, `G3_AND_EVENTDAY_RESULTS.md`, `GEX_FX_CROSSMATCH_RESULTS.md` |
| **G3**: OI wall magnet direction | **NULL** | 48.8% OOS on 615 days, IC +0.061 (p 0.34), placebo 49.9% | `oi_research_book/G3_AND_EVENTDAY_RESULTS.md` |
| **G1**: net-liquidity tide (2026-09-25) | **NULL** | 448 episodes; OOS hit 51.9/49.5/51.5% at 1/5/20d; 20d IC +0.194 IS → −0.026 OOS (sign flip, QE-era artifact); both buckets positive fwd returns; credit veto adds nothing; FLOW IS-trap 54.2% → 50.5% | `cog-replication/G1_RESULTS.md`, `g1_results.json` |
| Overall | **no validated directional layer**; stop calling it a replication | — | `cog-replication/DECISIONS.md` 2026-09-25 |
| Gamma-regime trades on NQ (2026-10-19): fade p75 on long gamma / follow on short gamma; follow a zero-gamma break (the playbook his ES example shows) | **NULL** | interaction +0.06 R [−0.30, +0.44], switch −0.03 R/trade, break −0.01 R (n 61); CME book only (~5% of Nasdaq gamma) | `forge/GAMMA_REGIME_TRADES_PREREG.md` |
| Same hedge plan on EUR/USD, GBP/USD, AUD/USD (2026-10-20) | **NULL** | −0.081 R/trade [−0.124, −0.039], 1,963 trades, all 3 pairs and both halves negative | `forge/GAMMA_REGIME_TRADES_FX_PREREG.md` |
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

Plain-English cards of every row below (and the wider rates tests) are on the chart page, `js/cogFindings.js` → cog-chart.html "Analysis findings" (2026-10-21). Add new results there too.

| Question | Verdict | Key numbers | Source |
|---|---|---|---|
| Rates lead Nasdaq (12+ tests, 1m to 1M) | **no lead replicates** | same-bar only | `plans/RATES_NASDAQ_WORKLOG.md` |
| Reconstruct "C.OG's blue line" | **REPRODUCED 2026-10-14** | plot = (SOFR Sep26 − Euribor Mar27, bp, trade prices, 15m, close) → EMA 2 → ×0.1 + 1.445, plotted at bar-OPEN time; zero fitted constants; RMSE 0.060 units, level 0.96 (0.98–0.99 within periods), 15-min Δ corr 0.61 (Mon–Tue 0.84 = noise floor of the digitised target), 2 h Δ 0.98; 7.5→8.0 = +5 bp; lead offset 0 (the one-day lead was not used) | `analysis/output/cog_video_0918/RECONSTRUCTION.md` §10–12 |
| Once identified, the exact line leads NQ 1-24 h (2026-10-14) | **null** | 0/8 reach t 2.5; same-hour +0.22 (t 3.8) explore, +0.16 (t 3.1) confirm | `js/deskEvidence.js` cog-exact-pair-lead; `plans/RATES_NASDAQ_WORKLOG.md` |
| His trade days vs our rates gap | descriptive only | n = 8 | `analysis/output/rates_residual/COG_DAYS.md` |

## Forward log (live agreement with COG)

| As of | n | Result | Source |
|---|---|---|---|
| 2026-07-31 | 2 | 07-30 both stood aside; 07-31 we disagreed and were right (he stopped, −76.1). Pre-registered bar: real if ≥ 70% agreement at n ≥ 30, null if ≤ 60% | `cog-replication/FORWARD_LOG.md` |

## His research tasks (Bank micro-education)

| Question | Verdict | Key numbers | Source |
|---|---|---|---|
| Overnight Hold vs Buy & Hold (2026-10-25): long 20:00 → 14:30 UK, NAS100 and XAUUSD | **UNDERPOWERED** both (`overnight-hold-nq`, `overnight-hold-gold`) | net of real bid/ask + OANDA financing: NQ +0.034%/trade [+0.001, +0.066], +6.0%/yr, Holm p 0.085, decaying; gold +4.0%/yr, t 1.4. CFD buy & hold +14.3% / +9.5%. Prop pass 2–3% of starts at 1×. The page's earlier "net negative" was placeholder costs 2.5–4× too high. His prediction (NQ something, gold weaker) roughly held gross; gold's move is almost all overnight | `analysis/output/overnight-hold/RESULTS.md`, `forge/OVERNIGHT_HOLD_PREREG.md` |
| Overnight Hold through his Prop Firm Toolkit (2026-10-25; our replica, FTMO 2-step, intraday equity) | **CONTEXT** (`overnight-hold-toolkit`) | 1× net funded NQ 39%, gold 42%, combined 56%, vs a zero-edge copy 21–24%; 8–10 months to fund; ~0 edge contribution at the low end of the edge CI. Real-account swaps (`cost-verification`): NQ financing verified, gold 4.5× too high on one account; re-costed net NQ +5.6%, gold +4.7–6.3%/yr | `analysis/output/overnight-hold-toolkit/RESULTS.md`, `analysis/output/cost-verification/RESULTS.md` |

| Micro bank q1 follow-ups (2026-10-31): the PCA residual-reversion model on FX8 + gold + silver, on 6 index CFDs, and FX8 filtered by news days / month-end / COT crowding | **NULL** (`residual-pca-wide10`, the one scored cell) / **UNDERPOWERED by design** (`residual-pca-idx6`, `-news`, `-monthend`, `-cot`, described) | wide10 IC +0.0075 [-0.010, +0.025], IS +0.006 / OOS +0.009, net Sharpe IS -0.49 / OOS +0.05; metals' residuals trend; no filter clears its gate (news D wrong sign -0.018, COT +0.003); line now at 6 trials; only q1 forward record left | `analysis/output/residual-pca-family/RESULTS.md`, `forge/RESIDUAL_PCA_FAMILY_PREREG.md` |

## Jordan / Colez mechanisations (adjacent, not C.OG's system)

| Study | Verdict | Source |
|---|---|---|
| Colez POI backtest, 26 pairs | Sharpe −3.43 | `education/coleztrades_poi_backtest/` |
| Jordan impulse range, ATR band, VWAP session reversion | null | `education/jordan_*_backtest/` |
| Jordan impulse 4h range levels | two correlations survive OOS: impulse size vs exhaustion (−), VWAP distance vs reversal size (+, all 7 instruments) | `education/jordan_impulse_4h_range_levels_backtest/` |
| His two described setups on the identified line + continuous lead, 15 min–48 h (direction + vol) | **null** (2026-10-14) | 0/24 + 0/21 lead cells, Friday swing-confirm 0 confirmed, Monday divergence 0/18; same-window link +0.17…+0.23 stable; weak consistent divergence→8 h drift +0.12 in both halves, below the bar; trap: open-labelled line = one-bar look-ahead | `analysis/output/cog_video_0918/VIDEO_CLAIMS.md`, `forge/COG_VIDEO_CLAIMS_PREREG.md` |
| Trend-state turns of the identified line vs Nasdaq's trend shifts, 1–48 h, direct and forward (fuzzy causal zig-zag, 3 scales) | **null** (2026-10-14) | same-time state corr +0.15/+0.23; no lead beats the scramble band; event version 9/36 pass explore, 0 confirm (pooled +10.6 → +4.1 pp is from `plans/RATES_NASDAQ_WORKLOG.md`, not TREND_STATE.md) | `analysis/output/cog_video_0918/TREND_STATE.md`, `forge/COG_TREND_STATE_PREREG.md` |
| The two weak patterns on 504 unseen days (2024-04 → 2026-04, pinned SR3U6 − IH7) | **divergence: does not replicate; trend-turn coincidence: real but not predictive** (2026-10-15) | same-hour +0.152 (t 5.4); divergence→8 h rho −0.002 (MDE 0.049); line turn → Nasdaq trend turn within 1–8 h +6.7 pp (z 7.3) but forward price move after a line turn ≈ 0 (|z| < 1); lead grid |rho| ≤ 0.03 | `analysis/output/cog_video_0918/PINNED_HISTORY.md`, `forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md` |
| Matched-contract pairs (SOFR/Euribor/ESTR, same reference period), each leg alone, 8 contracts, 105/33 p-value families | **null** (2026-10-16) | 0/33 survive (family 33; the 105 family is the cross-asset study); C.OG's pair (Sep-Dec26 vs Mar-Jun27, no overlap) has the strongest Nasdaq same-hour link (OOS 0.313 vs ~0.20); `analysis/output/cog_video_0918/MATCHED_PAIRS_RESULTS.md` |
| Interpretable sequence (direction change, confirmation, lagged Nasdaq; 36 specs, selection-aware placebo) + flexible tree model | **null; small 4 h rank-IC gain with ~0 gross** (2026-10-16) | `SEQUENCE_EVENTS.md`, `SHAPE_AGNOSTIC.md` |
| Fed funds meeting strip, legs by session, indicator options (range position / z-score / EMA slope) | **null** (2026-10-16) | `MEETING_PATH.md`, `LEGS_SESSION.md`, `INDICATOR_OPTIONS.md` |
| Same framing on 7 assets (gold, EURUSD, USDJPY, Russell, Dow, S&P, DAX), US leg / C.OG pair / SOFR-ESTR pair (corrected 2026-10-21: was '34 assets', which is the dynamic-lead panel) | **same-HOUR link real and sign-stable for the US leg: USDJPY +, EURUSD −, gold − (C.OG's pair flips sign OOS); no lead anywhere; volatility gain explained by scheduled-news timing** (2026-10-17) | `CROSS_ASSET_RESULTS.md`, `CROSS_ASSET_ADDENDUM_B_RESULTS.md` |
| Dynamic framing: rolling real-time gate, divergence, intraday futures spreads, daily and intraday spread-move episodes with asset-follow confirmation (28 yield spreads, 17 futures lines, 34 assets, ~44,000 cells) | **null; follow-through only in 2016 and 2020; relationship state anti-persists, not recognisable in advance** (2026-10-18) | `analysis/output/dynlead/DYNAMIC_LEAD_RESULTS.md` |

| Owner's spread-turn episodes: adaptive zig-zag turn vs confirm time, 9 episode types x horizons, matched-bar / shifted-spread / price-only controls, 3-way split (SR3U6-IH7 vs NAS100 15m; US 2Y/10Y vs EURUSD daily, separately; 5,298 cells) | **null** both (2026-10-20): coupling varies between sessions beyond chance but is not persistent beyond rate-vol clustering; no follow after confirmed turns; EURUSD leans revert (underpowered side) | `analysis/output/spread-episodes/RESULTS.md`, ledger `spread-episodes-nq`, `spread-episodes-eurusd` |

| Cross-Asset Volatility lesson (Issue 07, 2026-10-20 education): does rates implied vol (MOVE pct) add to next-session NQ realised vol beyond VXN, realised vol and the FOMC/CPI/NFP calendar; and his "rates rich, NQ asleep" state | **null** (`rates-vol-gap-move`: +0.057 pooled but Confirm −0.012, all from 2020) / **underpowered, wrong sign** (`rates-vol-gap-state`); descriptive mirror: equity-vol spike unconfirmed by MOVE over-prices the next week (−0.27 log), candidate prereg (2026-10-21) | `analysis/output/rates-vol-gap/RESULTS.md` || Owner's institutional yield-to-asset brief, Phase D: decomposed rates (2y, real, breakeven, term premium, slope, US-DE 2y/10y) in a nested walk-forward ridge ladder vs EURUSD / NDX at 1-20 days, regimes, costed, 2005-2026 | **EURUSD null** (5/20d rate forecasts anti-predictive OOS), **NQ underpowered** (ladder collapsed to always-long; positive control finds only rho >= 0.10); equities lead rates, not the reverse (2026-10-21) | `analysis/output/yield-predictive-ladder/RESULTS.md`, `SYNTHESIS.md`, ledger `yield-ladder-eurusd`, `yield-ladder-nq` |
| Owner rates brief phase 2: market rate surprise (US 2y CFD in the release window) and data surprise at FOMC / core CPI / payrolls -> EURUSD / NAS100 after the signal, beyond the asset's own reaction, net of real spread, 526 events 2010-26 | **underpowered** both (0/16 cells; EURUSD rate surprise = its own move, corr -0.83; data surprise null at 1h / close / next day for EURUSD, at 1h for NAS100); exploratory: Nasdaq 5-day fade of the data-surprise direction (2026-10-21) | `analysis/output/rate-surprise-events/RESULTS.md`, ledger `rate-surprise-eurusd`, `rate-surprise-nq` |
| C.OG 2026-10-23: VVIX-vs-Nasdaq pricing ratio at extremes (realised VVIX/NDX, VIX/NDX, implied VVIX/VXN), daily 2009-26, VIX-state controls | **VALIDATED (vol):** top decile -> VIX -7% over the next month (t -3.1/-3.2, all periods, placebo, robust); **Nasdaq direction underpowered** (+1.2%/20d, t 2.2-2.4, not Holm) (2026-10-23) | `analysis/output/vvix-nasdaq-ratio/RESULTS.md`, ledger `vvix-ratio-range`, `vvix-ratio-direction` |
| C.OG 2026-10-23 clarified: R = signed % VIX / % Nasdaq and dR/dt, daily 2009-26 | **VALIDATED (research-only):** dR/dt bottom decile -> Nasdaq next 5 sessions +0.57% (t 3.0, all periods, placebo; all-controls t 2.91); the R level adds nothing beyond `vvix-ratio-range` (2026-10-23) | `analysis/output/vix-nasdaq-beta/RESULTS.md`, ledger `vix-beta-change`, `vix-beta-level` |
| C.OG 2026-10-23 calculus framing + Garin's points: Brownian scaling, integrals (VRP), second derivatives, Garin's intraday rule OOS, VX futures | A CONTEXT (realised Nasdaq moves ~16% smaller than VXN prices at every horizon; VVIX*sqrt(dt) over-prices 20d VIX moves; Jordan's VVIX/VXN right only on average). B UNDERPOWERED. C **VALIDATED (research only)**: VVIX/VXN 5d rise top decile -> Nasdaq +1.2%/20d. D UNDERPOWERED (Garin's ES lean 2021-26). E **VALIDATED (research only)**: VIX give-back holds on VX futures at ~60% of spot (2026-10-23) | `analysis/output/vix-calculus/RESULTS.md`, `vix-calculus.html`, ledger `vix-brownian-scaling`, `vix-integral-gaps`, `vix-second-derivative`, `garin-vix-intraday-oos`, `vix-ratio-vx-futures` |
| Garin's tradeability point, costed: short VX on the ratio flag, +25% stop, 20-session hold, 1% risk, vs random-entry shorting, 2013-26 | **UNDERPOWERED:** +0.22R/trade (77% winners) but random-entry shorting makes +0.12R (the roll); flag edge +0.10R, p 0.096; the one stop hit gapped to -2.2R (2026-10-23) | `analysis/output/short-vx-rule/RESULTS.md`, ledger `short-vx-rule` |
