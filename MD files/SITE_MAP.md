# MacroFX Site Map — full page inventory

> **Generated 2026-08-14** from a page-by-page review of every root HTML page plus the
> subdirectory apps. Companion to `BACKTEST_INDEX.md` (per-backtest evidence detail),
> `LEGO_MODULES.md` (module wiring) and `PROJECT_STATUS.md` (banked findings).
> The in-app version of this map is the 🗺 Site Map overlay on `index.html`;
> the **Archived** section below mirrors the "🗄 Archived ▾" nav group added to
> `index.html` — the Command Centre and THE Dashboard per `CLAUDE.md` — in both its
> Command Hub dropdown bar and its Site Map overlay. `hub.html` is only a secondary
> link index (its dead cards were removed; nothing was added to it, per the CLAUDE.md rule).

**Totals: 167 root pages** — 50 live tools · 57 open research · 30 reference · 19 banked
nulls · 9 superseded · 1 stub · 1 unclear. **29 pages moved to Archived.**

## About the dates ("last accessed")

There is **no access-date data anywhere in the repo** — pages are static HTML served by
`server.js` with no per-page hit logging, so "date last accessed" is not recoverable.
The honest proxy used here is **git last-modified**. One caveat: the git history was
squashed/imported on **2026-08-09**, so most files show that date as a floor —
**"≤2026-08-09" means "not touched since the import"** (could be much older).
Pages with a later date have genuinely been worked on since.

## Status legend

| Status | Meaning |
|---|---|
| 🟢 Live | A live tool/dashboard meant for regular use |
| 🔬 Research | An active backtest/research question still worth running |
| 📚 Reference | Read-only record or infrastructure — keep, don't develop |
| ⛔ Null (banked) | The study answered NO — recorded, do not re-litigate |
| 🔁 Superseded | A newer page replaces it (successor named in notes) |
| ➡️ Stub | Redirect/placeholder only |

## Live Trading

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `bot-config.html` | Bot control centre: config, live pair monitor, journal, backtest bot | 🟢 Live | 2026-08-12 | 📚 infrastructure; redirect target of backtest-monitor |
| `brief-config.html` | Configure what the Morning Brief auto-generates each day | 🟢 Live | ≤2026-08-09 | Server-side auto-generation config |
| `cog-replay.html` | Read-only replay of COG forecast reference data vs price | 📚 Reference | ≤2026-08-09 | Reference data; standalone deploy copy exists in cog-standalone/ |
| `cog-v2-engine.html` | Persistent-state COG day workflow with Setup/Risk/Trigger gates | 🔬 Research | ≤2026-08-09 | 🧪 same family, same bar (Q8) |
| `continuation-fade-ticker.html` | Live decision-zone ticker: continuation vs fade re-scored on ticks | 🟢 Live | 2026-08-11 | Manual harness: trade-decision-engine.html |
| `desk.html` | One-page daily market read: weather→expectations→zones→book→exceptions | 🟢 Live | ≤2026-08-09 | Primary daily read |
| `estimator-ab.html` | A/B two vol estimators (YZ vs RV+HAR) feeding identical band geometry | 🔬 Research | ≤2026-08-09 | Runtime verdict card |
| `forecast-replay.html` | Replay archived vol-forecast v2 bands over candles | 📚 Reference | ≤2026-08-09 | Thinner original; forecast-reversion is the fuller successor |
| `forecast-reversion.html` | Tally fade vs follow at each armed forecast line | 🔬 Research | ≤2026-08-09 | ✅ divergence detector validated vs Pine |
| `giveback.html` | MFE vs realized exit per bot — profit handed back | 🟢 Live | ≤2026-08-09 | ✅ built |
| `global-liquidity.html` | GLI level/impulse/cycle regime + FX liquidity ranking | 🟢 Live | ≤2026-08-09 | 🔁 re-run GLI backtests post-WALCL fix (Q6) |
| `gold-zones.html` | Live gold zone verifier — armed zones, confirmations, multiday trades | 🟢 Live | 2026-08-11 | OI Gamma moved to oi-zones.html |
| `gold.html` | Two-layer adaptive-regime XAU/USD macro model dashboard | 🟢 Live | ≤2026-08-09 | Hub for gold pages |
| `index.html` | THE Dashboard (Command Centre) — main page; all shortcuts structured under the banner dropdowns, plus Site Map + API Map overlays | 🟢 Live | 2026-08-14 | Canonical per CLAUDE.md — new user-facing links belong here |
| `journal.html` | Log, tag and review trade entries by pair/session/setup, Pine export | 🟢 Live | ≤2026-08-09 |  |
| `levels.html` | All-pairs Entry Lens: ACT/WATCH/WAIT/AVOID | 🟢 Live | ≤2026-08-09 |  |
| `liquidity-pulse.html` | Diagnostic: daily TGA/RRP flows vs next-day NAS100 moves | 🔬 Research | ≤2026-08-09 | Diagnostic, not a trading signal |
| `nasdaq-threshold-engine.html` | Live monitor of the 4-gate NQ macro threshold system | 🟢 Live | ≤2026-08-09 | Phase 1: synthetic dataset — not yet real data |
| `oi-dashboard.html` | Open-interest analytics: OI levels, walls, COT positioning | 🟢 Live | 2026-08-11 |  |
| `oi-zones.html` | Live view of OI bot dealer-gamma zones and running multiday trades | 🟢 Live | 2026-08-11 | Python executor trades same plan |
| `pattern-lab.html` | Scans candles for classical chart patterns; drives live pattern bot | 🟢 Live | ≤2026-08-09 | Audited 2026-08-12: zero cost model/IS-OOS — scanner, not evidence |
| `performance.html` | Live bot heartbeats, gold P&L, ML signal and divergence monitor | 🟢 Live | ≤2026-08-09 |  |
| `range-zones.html` | Show today's Asia/Monday range zones the live bot is watching | 🟢 Live | ≤2026-08-09 | Levels the bot would trade live |
| `sigma-fade-ab.html` | A/B pooled fade under platform σ vs HAR-RV σ | 🔬 Research | ≤2026-08-09 | No result recorded |
| `telegram-v2.html` | Live graded zone alerts from a frozen per-cell confidence policy | 🟢 Live | ≤2026-08-09 | Active v3 corrections |
| `today.html` | Daily trading brief aggregating macro, levels, vol and risk flags | 🟢 Live | 2026-08-13 |  |
| `trade-cards.html` | Per-pair card board: nearest zone, TP/SL, confidence, live chart | 🟢 Live | 2026-08-14 | UNCALIBRATED PRIOR banner; alert board, not execution |
| `trade-decision-engine.html` | Test harness scoring per-event go/skip decisions at zones | 🔬 Research | 2026-08-11 | OOS calibration collapses to one ~55% bucket |
| `upcoming-trades.html` | Ranked watchlist of every live zone by distance to price | 🟢 Live | 2026-08-14 | UNCALIBRATED PRIOR banner |
| `vol-forecast-v2.html` | Live daily volatility/range forecast dashboard (current) | 🟢 Live | 2026-08-14 | Successor of vol-forecast.html |
| `vol-horse-race.html` | Race 8 σ forecasters per instrument | 🔬 Research | ≤2026-08-09 | No verdict recorded |

## Macro Data & Sentiment

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `beige-book.html` | Fed Beige Book release viewer with sentiment scoring | 🟢 Live | ≤2026-08-09 | Macro context dashboard |
| `boe-sentiment.html` | Bank of England statement/minutes sentiment tracker | 🟢 Live | ≤2026-08-09 | Central-bank context |
| `boj-sentiment.html` | Bank of Japan statement sentiment tracker | 🟢 Live | ≤2026-08-09 | Central-bank context |
| `consumer-confidence.html` | US consumer confidence indicator dashboard | 🟢 Live | ≤2026-08-09 | Macro context |
| `cpi.html` | US CPI / inflation release dashboard | 🟢 Live | ≤2026-08-09 | Macro context |
| `ecb-sentiment.html` | ECB statement/press-conference sentiment tracker | 🟢 Live | ≤2026-08-09 | Central-bank context |
| `fomc-sentiment.html` | Track FOMC statement hawkish/dovish wording changes | 🟢 Live | ≤2026-08-09 | Meeting-cycle monitor |
| `gdp.html` | Per-currency growth read | 🟢 Live | ≤2026-08-09 | Macro context |
| `ism.html` | Per-currency business-activity (ISM/PMI) read for FX bias | 🟢 Live | ≤2026-08-09 | Macro-scorecard tile family |
| `labor-market.html` | Per-currency labor-market strength read for FX bias | 🟢 Live | ≤2026-08-09 | Macro-scorecard family |
| `macro-scorecard.html` | Aggregated per-currency macro scorecard across indicator tiles | 🟢 Live | ≤2026-08-09 | Hub for sentiment/data tiles |
| `ppi.html` | US pipeline inflation (PPI) read | 🟢 Live | ≤2026-08-09 | Macro context |
| `rate-matrix.html` | Cross-currency rate-differential matrix | 🟢 Live | ≤2026-08-09 | Static reference grid |
| `real-yield.html` | Per-currency real yields for macro context | 🟢 Live | ≤2026-08-09 | Macro context |
| `retail-sales.html` | Per-currency consumer spending read | 🟢 Live | ≤2026-08-09 | Macro context |
| `trade-balance.html` | Trade-balance data per currency | 🟢 Live | ≤2026-08-09 | Macro context |
| `yield-curve.html` | Yield curve macro dashboard | 🟢 Live | ≤2026-08-09 | Distinct from P3 panel |

## Vol-Level Research

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `backtest-exit-study.html` | Replays bot trades under alternative exits (TP grid/trail/BE/time-stop) | 🔬 Research | ≤2026-08-09 | 🔬 exploratory (one window, gross R) |
| `backtest-vmc.html` | Tests whether VuManChu exhaustion at entry separates winning fades | 🔬 Research | ≤2026-08-09 | 🔬 exploratory n≈279, one window — a steer, not proof |
| `cog-fade.html` | Tests whether fading at COG's reproduced line clears cost OOS | 🔬 Research | ≤2026-08-09 | Sitemap notes result: null on FX |
| `cog-level-poc.html` | POC: did price actually revert at COG's published levels | 🔬 Research | ≤2026-08-09 | POC framing, no recorded verdict |
| `cog-reverse-engineer.html` | Back-solves COG's vol calculation and daily anchor | 📚 Reference | ≤2026-08-09 | Feeds COG_CONST used by js/cogBands.js; writeup in cog/lessons |
| `cog-signal-log.html` | Manual log of COG's daily signals for forward testing | 🟢 Live | ≤2026-08-09 | Forward paper-trail input |
| `cross-pair-research.html` | Cross-pair trend/edge spotter with placebo gates | 🔬 Research | ≤2026-08-09 | ✅ built (Phase 1+2+2b+2c); analysis, not a strategy |
| `exhaustion-forecast.html` | Forecast where price fades back (k_fade×σ) + range-budget fade test | 🔬 Research | ≤2026-08-09 | Panel 3 pre-registered falsification |
| `expected-moves.html` | Per-pair expected-move cone board (Cone A + Cone B blend) | 🟢 Live | ≤2026-08-09 | Decision-support readout, not validated edge |
| `fade-viewer.html` | Inspect one day's forecast levels and the engine's fade read/exit | 🔬 Research | ≤2026-08-09 | The trust tool; byte-identical brick to validated backtest |
| `fill-realism.html` | Test whether per-line tearsheet Sharpe is a coarse-bar fill artifact | 🔬 Research | ≤2026-08-09 | Falsification of the ~3.1 Sharpe; ~44% zero-duration trades |
| `forecast-accuracy.html` | Grade range accuracy and exhaustion location per σ calibration | 🔬 Research | 2026-08-14 | Two-lens study |
| `forecast-blend.html` | Compare Cone A vs Cone B vs blended cone | 🔬 Research | ≤2026-08-09 | 🟡 view-only, unverified; OOS win/loss not yet measured |
| `forecast-path.html` | Draw the model's cone intraday/daily and grade it | 🟢 Live | ≤2026-08-09 | A calibration viewer, not a strategy |
| `forecast-style-fade.html` | Rank 6 forecasters × 4 line types for fade/follow expectancy | 🔬 Research | ≤2026-08-09 | Greenest cell wins; no verdict banked |
| `forward-track.html` | Live post-research record of the confirmed fade | 🟢 Live | ≤2026-08-09 | The test a backtest can't fake; KV-persisted |
| `honest-policy.html` | Reproduce COG's per-cell selection under honest 1-min fills | 🔬 Research | ≤2026-08-09 | Pre-registered; verdict at runtime, not banked |
| `news-exhaustion.html` | Tests whether calendar news buckets predict session fade vs follow | 🔬 Research | ≤2026-08-09 | No verdict recorded |
| `pooled-fade.html` | Validate full VuManChu WT+VWAP fade as one pooled equity curve | 🔬 Research | ≤2026-08-09 | Pre-registered bar; no verdict recorded |
| `position-sizer.html` | Turn calibrated vol forecast into vol-based position sizes | 🟢 Live | ≤2026-08-09 | The RISK LAYER |
| `price-slowdown-lab.html` | Visual explainer: range vs displacement volatility budgets | 📚 Reference | ≤2026-08-09 | Descriptive diagnostic, EURUSD data baked in |
| `reversal-fade.html` | A/B fading at k×median vs median line, OOS after costs | 🔬 Research | ≤2026-08-09 | Pre-registered; no result recorded |
| `reversal-study.html` | Diagnostic: where price actually reverses intraday | 🔬 Research | ≤2026-08-09 | Motivated reversal-fade.html |
| `reversion-proof.html` | Per-day transparent check of median line vs actual reversion | 🔬 Research | ≤2026-08-09 | Verification tool |
| `vol-forecast-research.html` | Walk-forward evaluation of the daily forecast itself | 🔬 Research | ≤2026-08-09 | Evaluates the forecast, not a strategy |
| `vol-research-book.html` | Chaptered answers to forecast-quality questions | 🔬 Research | ≤2026-08-09 | Walk-forward, no lookahead |
| `vumanchu-chart.html` | Render the VuManChu WaveTrend pane as an image | 📚 Reference | ≤2026-08-09 | Render brick — no edge claim |
| `vumanchu-state.html` | Live MTF VuManChu state + forward-validation scoring | 🟢 Live | ≤2026-08-09 | Frozen 10-year table; fade/follow edge itself null |

## Vol & Forecast

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `analytics-desk.html` | Per-instrument institutional-question desk (Hurst, rank-IC, OI walls) | 🟢 Live | ≤2026-08-09 | ✅ built; cards badge validated vs context |
| `book-stress.html` | Tests whether book diversification survives a liquidity contraction | 🔬 Research | ≤2026-08-09 | ✅ built; crisis replay |
| `credit-leadlag.html` | Tests whether HY-OAS credit delta leads NQ forward realized vol | 🔬 Research | ≤2026-08-09 | 🧪 verdict computed at runtime, never recorded (Q4) |
| `forecast-analysis.html` | Analyse what price does at each vol-forecast line | 📚 Reference | ≤2026-08-09 | 📚 research infra; forward paper-trail lives here |
| `forecast-book-report.html` | Tearsheet for the per-line vol mean-reversion book | 📚 Reference | ≤2026-08-09 | 📚 headline Sharpe is what fill-realism falsifies |
| `forecast-coverage.html` | Check band coverage — does HL75 contain 75% of days | 🔬 Research | ≤2026-08-09 | ✅ built, no-lookahead |
| `forecast-range-timeline.html` | Forecast range vs realized, day by day sequential | 📚 Reference | 2026-08-14 | Static walk-forward OOS export; Panel A of forecast-accuracy made sequential |
| `forecast-refresh.html` | Admin utility to regenerate the level-interaction dataset | 🟢 Live | ≤2026-08-09 | Admin infrastructure |
| `forecaster-backtest.html` | M1 per-line vol backtest (8 static + 4 dynamic levels) | 📚 Reference | ≤2026-08-09 | 📚→🔧 read-only production reference; costs default OFF at route layer |
| `honest-forecast-harness.html` | Honest fills/costs/IS-OOS harness for band strategies | 🔬 Research | ≤2026-08-09 | 📚→🔧 discipline template; breachReclaim defect open |
| `macrofx-decision-backtest.html` | Backtests assembled MacroFX decision engine vs naked zone skeleton | 🔬 Research | ≤2026-08-09 | Built, not yet run OOS |
| `macrofx-zone-backtest.html` | Tests whether confluence Decision Zones beat isolated levels OOS | 🔬 Research | ≤2026-08-09 | No verdict recorded yet |
| `rank-ic.html` | Measure Spearman rank-IC of stack scores vs forward outcome | 🔬 Research | ≤2026-08-09 | Falsification tool, not an edge finder |
| `trend-flip-backtest.html` | HTF-bias-gated flip entry with ATR stop, honest fills | 🔬 Research | ≤2026-08-09 | Not validated OOS; no edge claim |
| `vol-backtest-v2.html` | Adaptive strategy selector vs fixed legs, A/B, all horizons | 🔬 Research | ≤2026-08-09 | 🔁 re-run post causality fix (Q2) |
| `vol-backtest.html` | Original touch-fill daily band fade per EMA regime | 📚 Reference | ≤2026-08-09 | 📚 read-only; single source of truth for the vol math |
| `vol-forecast-bench.html` | Scores σ estimators on OOS QLIKE | 📚 Reference | ≤2026-08-09 | 📚 infrastructure |
| `weekly-vol-backtest.html` | Monday-anchored weekly band fade with maeCalib stops | 🔬 Research | ≤2026-08-09 | 🔧 defects open (Q3) |
| `yield-coupling-real.html` | Coupling/lead-lag study on real FRED+ECB yields | 📚 Reference | ≤2026-08-09 | 📚 context features, inert by design |
| `yield-coupling.html` | FX vs bond-CFD yield spread coupling measure | 📚 Reference | ≤2026-08-09 | 📚 context feature |

## FX Range Backtests

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `asia-range-analysis.html` | Per-cell win-rate explorer over the Asia range backtest book | 📚 Reference | ≤2026-08-09 | 📚 cells <3 trades are noise — filtered win rates were selection bias |
| `asia-range-backtest.html` | Full live-stack replica backtest of Asia/Monday fib confluence levels | 🔬 Research | ≤2026-08-09 | 🔧 zero costs; real job is live-parity comparison, not edge discovery |
| `backtest-viewer.html` | Trade replay viewer for vol/gold backtest results | 📚 Reference | ≤2026-08-09 | 📚 infrastructure |
| `liquidity-backtest.html` | A/B tests whether liquidity levels add edge over the range-line fib ladder | 🔬 Research | ≤2026-08-09 | Pre-registered, verdict not yet recorded |
| `pivot-spike-backtest.html` | Test whether daily pivots mean-revert on M1 after costs | 🔬 Research | ≤2026-08-09 | 🧪 honest harness, verdict never recorded (Q1) |
| `range-fib-backtest.html` | Stripped base-edge validator: limit-fade fib extensions, costs on | 🔁 Superseded | ≤2026-08-09 | 📚 did its job; superseded as strategy by Range-Line; keep as control |
| `range-line-strategy.html` | Backtest per-line fade+follow range ladder with chandelier trail | 🔬 Research | ≤2026-08-09 | ✅ THE proven edge (Sharpe ~4.7-6 @2-3× cost); remaining: live wiring |
| `regime-backtest.html` | Replay live regime bots (V1-V5) with regime-colored candles | 🔬 Research | ≤2026-08-09 | 🔧 contaminated by ADX one-bar-future shift — still unfixed |
| `strategy-lab.html` | 12-strategy famous-retail gauntlet through one honest path | 🔬 Research | ≤2026-08-09 | ⛔ banked null for the 12; standing job = gatekeeping NEW specs |

## Macro Research

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `analysis.html` | Confluence-level touch analysis engine over historical price | 📚 Reference | ≤2026-08-09 | Pre-Range-Line confluence stack; no IS/OOS or cost discipline |
| `correlations.html` | Rolling correlation and Kalman-OLS beta lab | 🟢 Live | ≤2026-08-09 | ✅ betas exist; COT cross-reference |
| `cot-extremes.html` | COT futures positioning percentiles/z-scores + dealer options flow | 🟢 Live | 2026-08-12 | Deliberately not combined into one verdict |
| `diversification.html` | Combined-book explorer: blend stats, factor correlations, effective bets | 📚 Reference | ≤2026-08-09 | 📚 combined-book views |
| `gold-miner-arb.html` | Backtest GDX-vs-gold stat-arb spec | 🔬 Research | ≤2026-08-09 | Runtime verdict badge; R≈%Return degeneracy flagged |
| `hedge-signals-v2.html` | Cointegration-gated pairs mean-reversion signals | 🔬 Research | ≤2026-08-09 | 🔧 IS/OOS split by bar index not calendar (Q10) |
| `macro-conditioner.html` | Tests if VIX+HY risk regime moves day character beyond forecast σ | 🔬 Research | ≤2026-08-09 | Pre-registered; HY series short — re-run needed |
| `motif-combined-backtest.html` | Results card for Python motif adaptive-SL/TP + HTF-sizing combo | 📚 Reference | 2026-08-14 | Reads pre-computed AnalogML export JSON; Python-only signal |
| `mve.html` | Standalone sandbox demo of the Market Valuation Engine pipeline | 📚 Reference | ≤2026-08-09 | Self-contained synthetic sandbox; no server route |
| `range-level-edge.html` | Test whether 5m Asia range levels beat a shifted-level placebo | 🔬 Research | ≤2026-08-09 | 🟡 built, not yet run (needs M1 on Railway) |
| `regime-viewer.html` | Overlay V1 HMM and V2 Baum-Welch regime on price | 🟢 Live | ≤2026-08-09 | Classifier inspection UI |
| `touches-backtest.html` | Results card for the N-touches structural-motif signal | 📚 Reference | 2026-08-14 | Reads pre-computed JSON; replaced retired k-NN analog signal |
| `trend-basket.html` | Diversified G10 12-mo trend basket, inverse-vol sized, IS/OOS | 🔬 Research | ≤2026-08-09 | 🧪 pending (Q5) |
| `trend-v2.html` | A/B: sizing trend positions by forecast σ vs trailing vol | 🔬 Research | ≤2026-08-09 | Pre-registered; no result recorded |
| `yield-spread.html` | Yield-spread z-score mean-reversion bot test (the validated spread-reversion book) | 🔬 Research | ≤2026-08-09 | Validated OOS: 109 trades, PF 2.19, Sharpe ~1.14, every OOS year 2022-2026 positive (YIELD_SPREAD_STRATEGY.md) |

## NASDAQ / Equity

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `liquidity-gate-backtest.html` | Backtests a Fed net-liquidity + coherence gate on index entries | 🔬 Research | ≤2026-08-09 | 🔁 re-run post-WALCL fix (Q6) |
| `macro-equity-backtest.html` | Macro composite z → banded equity allocation, walk-forward | 🔬 Research | ≤2026-08-09 | 🔁 WALCL bug fixed 2026-07-02; re-run (Q6) |
| `nasdaq-liquidity-continuation.html` | 4-gate NASDAQ liquidity continuation backtest 2014-present | 🔬 Research | ≤2026-08-09 | 🧪 no honest OOS verdict ever committed (Q8) |
| `nasdaq-threshold-backtest.html` | COG Threshold-1 4-gate macro backtest lab for NQ | 🔬 Research | ≤2026-08-09 | 🧪 needs one committed costed OOS run (Q8) |
| `qmr-tearsheet.html` | Standard NQ-QMR results card using shared metricsCore | 📚 Reference | ≤2026-08-09 | Companion to retired NQ-QMR; honest v2 evidence lives here |
| `vix-vol-carry-backtest.html` | Short-VXX vol-carry gated by vol cone and term structure | 🔬 Research | ≤2026-08-09 | 🧪 pending (Q9) |
| `zscore-backtest.html` | Fade into Asia range when yield-spread z overshoots at a fib | 🔬 Research | ≤2026-08-09 | 🔧 lookahead + zero costs (Q7); z-tier edge may be artifact |

## Gold

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `gold-backtest.html` | Browser-worker VuManChu confluence backtest on gold | 📚 Reference | ≤2026-08-09 | 📚 legacy exploratory |
| `gold-lab.html` | Rebuild gold history and build ML feature datasets | 📚 Reference | ≤2026-08-09 | 📚 research infra |
| `system-gold-macro.html` | P6 gold macro divergence panel | 📚 Reference | ≤2026-08-09 | 📚 display layer |

## Portfolio Systems

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `hub.html` | Risk Hub — secondary link index + portfolio risk-gate design (NOT the main nav) | 📚 Reference | 2026-08-14 | CLAUDE.md: index.html is THE Dashboard; do not add to hub.html unless asked; gate table is unwired design spec |
| `multi-factor-book.html` | Blends trend + FX carry into one vol-targeted diversified book | 🔬 Research | ≤2026-08-09 | Read-only research; blend only as real as its legs |
| `system-credit-equity.html` | P2 credit-equity divergence panel | 📚 Reference | ≤2026-08-09 | 📚 display layer |
| `system-fx-carry-factor.html` | Backtest rate-differential FX carry with real financing | 🔬 Research | ≤2026-08-09 | ✅ built; honest successor to system-fx-carry.html |
| `system-yield-curve.html` | P3 panel — content is VIX regime rotation, not yield curve | 📚 Reference | ≤2026-08-09 | 📚 display layer; filename/title mismatch |

## Learn

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `repo-brick-map.html` | Map Theory Lab lesson concepts to real internal repo modules | 📚 Reference | ≤2026-08-09 | Internal — dashboard only |

## WIP

| Page | Intended purpose | Status | Last modified | Notes |
|---|---|---|---|---|
| `discipline-map.html` | Maps system coverage and honest gaps by trading discipline | 📚 Reference | ≤2026-08-09 | Records banked nulls; same status legend as BACKTEST_INDEX |
| `level-chart-demo.html` | Dev demo wiring levelSources.js modules into the levelChart renderer | 📚 Reference | ≤2026-08-09 | Dev brick demo, synthetic data |
| `entry-trigger-lab.html` | Visual scanner for 5 discretionary entry ideas from `education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md` (wick+engulf, midpoint pullback, session-extreme anchor, VWAP tap, ADX regime switch), walked day-by-day over the Asia/Monday range-extension ladder (reused from `ranges.js`/`confluence-core.js`) with SL/TP-simulated win/loss/open counts per test | 🔬 Research | 2026-08-21 | Eyeball-first triage, not a Sharpe/IS-OOS backtest — see the page's own banner |
| `trade-lab.html` | Impulse/retracement visual research on Gold & NQ — real candles (frozen R2 archive + live OANDA/Yahoo proxy for anything past it, Railway-only), Fib pulled-from/to readout, browse other real historical trades with the same shape via `/api/trade-lab/similar-trades` | 🔬 Research | 2026-08-17 | Live OANDA/Yahoo fetch untestable in this sandbox (403) — needs a real check once deployed |
| `live-validation.html` | Runs `js/impulseEmaRangeV2Engine.js` (baseline + 3 follow-up variants) against the R2 archive gap-filled to NOW via real OANDA M1 (`/api/live-validation/run`+`/status`, Railway-only), checks whether any generated signal lines up with Jordan's 4 known reconstructed trades on timing/direction/price | 🔬 Research | 2026-08-17 | Live OANDA fetch untestable in this sandbox (403) — needs a real check once deployed |

## 🗄 Archived — null results, superseded versions, stubs

These stay in the repo (a banked null is evidence — the doctrine is "answered, do not
re-litigate", not "delete") but are moved out of the main nav into the **Archived**
group so the working nav only shows what is in use.

| Page | Was intended for | Why archived | Last modified |
|---|---|---|---|
| `analogml-backtest.html` | Results card for the historical-analog shape-matching k-NN direction signal | ⛔ Null (banked) — Null banked 2026-08-12; signal retired; successor touches-backtest.html | 2026-08-11 |
| `backtest-monitor.html` | Redirect placeholder for the old backtest bot monitor | ➡️ Stub — Meta-refresh → bot-config.html#tab-backtest | ≤2026-08-09 |
| `backtest.html` | Original browser CSV confluence backtester | 🔁 Superseded — 📚 legacy exploratory; superseded by range-line-strategy + strategy-lab | ≤2026-08-09 |
| `claude-backtest.html` | Ad-hoc AI-generated strategy sandbox backtester | 🔁 Superseded — 📚 sandbox, not evidence — superseded by strategy-lab.html | ≤2026-08-09 |
| `credit-stress.html` | CSI risk overlay gating exposure off credit spreads and VIX | ⛔ Null (banked) — ⛔ banked null 2026-07-18 (Q12); page stays read-only stress dashboard | ≤2026-08-09 |
| `econ-trend.html` | Rank currencies by fundamentals momentum vs USD, monthly | ⛔ Null (banked) — ⛔ banked null 2026-07-18 (OOS Sharpe 0.09, placebo 78th<90th); kept as read-only viewer | ≤2026-08-09 |
| `hedge-backtest.html` | Backtest the v1 correlation-sized hedge overlay | ⛔ Null (banked) — ⛔ banked null — bleeds by construction; v2 is successor | ≤2026-08-09 |
| `hedge-signals.html` | v1 hedge overlay signals (Telegram, scoreboard) | ⛔ Null (banked) — ⛔ banked null; superseded by hedge-signals-v2.html | ≤2026-08-09 |
| `hurst-bench.html` | A/B Hurst estimators — is the range-bias feature informative? | ⛔ Null (banked) — RESOLVED 2026-07-25: DROP — featureHurst removed; neither estimator predicts | ≤2026-08-09 |
| `indexv2.html` | Experimental cross-asset "Board" rework of the main dashboard | 🔁 Superseded — index.html canonical; ideas folded into MARKET_DESK_PROPOSAL; banked-null shape-match diagnostic 2026-08-12 | 2026-08-14 |
| `layer2-vol-audit.html` | Replays vol system entries at fixed SL/TP on real M1 to find a stable exit | ⛔ Null (banked) — Verdict: net-negative every pair, no stable SL/TP (in-sample noise) | ≤2026-08-09 |
| `macro-direction.html` | Falsification test: does a macro direction call lead forward FX drift? | ⛔ Null (banked) — Weak/null per YIELD_SPREAD_STRATEGY.md; only carry weakly led | ≤2026-08-09 |
| `max-copier-backtest.html` | Mechanical proxy of a discretionary impulse-continuation basket | ⛔ Null (banked) — Honest prior null; autopsy proves root cause; thresholds overfit folklore | ≤2026-08-09 |
| `nq-qmr-backtest.html` | Retirement notice recording falsification of the NQ-QMR system | ⛔ Null (banked) — RETIRED 2026-07-29 — system falsified (stops not live until 14:00; honest Sharpe 0.06 vs claimed 1.56) | ≤2026-08-09 |
| `nq-qmr-backtest.legacy.html` | Original NQ-QMR pre-open momentum backtest, 5250-config optimizer | 🔁 Superseded — Void per retirement notice; honest engine js/qmrV2Engine.js, evidence in qmr-tearsheet.html | ≤2026-08-09 |
| `overnight-hold-backtest.html` | Overnight-hold vs buy&hold on NAS100/XAUUSD + prop-firm rule check | ⛔ Null (banked) — Gross effect exists, net slightly negative after costs on both | 2026-08-12 |
| `poi-reaction-backtest.html` | Backtest ColezTrades POI-reaction entries across pairs | ⛔ Null (banked) — NULL at both stages (2026-07): pooled Sharpe −3.4, positive 1/26 pairs | ≤2026-08-09 |
| `range-ext-backtest.html` | Backtest Asia range extensions with state-conditioned confidence brain | ⛔ Null (banked) — On-page banner: honest result NULL for tradeable edge, intraday and swing | ≤2026-08-09 |
| `results.html` | v1 portfolio hedge backtest tearsheet (777 trades, 18 pairs) | ⛔ Null (banked) — Baked-in: Sharpe −0.58, PF 0.90; hedge v1 banked null | ≤2026-08-09 |
| `sltp-distribution.html` | Map fixed SL/TP outcomes for signal-agnostic H4 entries | ⛔ Null (banked) — Headline: best hindsight SL/TP still ≈zero edge everywhere | ≤2026-08-09 |
| `system-fx-carry.html` | P4 JPY-cross spot proxy panel (explicitly NOT carry) | 🔁 Superseded — Superseded by system-fx-carry-factor.html | ≤2026-08-09 |
| `system-fx-momentum.html` | P5 FX cross-sectional momentum panel | 🔁 Superseded — Tested version of FX momentum is now Trend Basket | ≤2026-08-09 |
| `trend-ema-ab.html` | A/B of EMA-crossover vs momentum in one trend primitive | ⛔ Null (banked) — NULL 2026-07: cross adds nothing; beaten by buy&hold 7/8 markets | ≤2026-08-09 |
| `trend.html` | Diversified time-series-momentum backtest | 🔁 Superseded — Superseded-but-live pair: trend→trend-v2 | ≤2026-08-09 |
| `vol-forecast.html` | Prior-generation vol & range forecast dashboard | 🔁 Superseded — Superseded-but-live pair: →v2; still golden-tested | ≤2026-08-09 |
| `volatility-classifier-standalone.html` | Offline exhaustion-vs-continuation classifier backtest on local M1 | ❔ Unclear — Orphan; needs local VolRangeForecaster data; no recorded outcome | ≤2026-08-09 |
| `vumanchu-fade.html` | Test whether WT-confirmed band fade beats the blind fade | ⛔ Null (banked) — Blind fade null; confirmed fade tested ~null | ≤2026-08-09 |
| `vwap-reversion.html` | Test whether session VWAP is a tradeable level or folklore | ⛔ Null (banked) — NULL/negative 2026-07 — every mode loses ≈ cost per trade | ≤2026-08-09 |
| `zscore-v2.html` | Demote yield-spread z from hard gate to confidence score | ⛔ Null (banked) — Null — scoring a zero-edge entry can't create one | ≤2026-08-09 |

## Subdirectory apps

| Path | What it is | Pages | Status |
|---|---|---|---|
| `theory-lab/` | From-scratch quant curriculum (hub + glossary + 114 lessons, difficulty filter) | 116 | 🟢 Most active collection in the repo (30 commits in 90d) |
| `cog/` | COG Hub — 12 styled course-note lessons incl. the COG case-study writeups | 13 | 📚 Finished content, linked from Learn ▾ |
| `education/` | Raw `.md` study notes the cog lessons were converted from + `LESSON_STYLE_GUIDE.md` + the ColezTrades POI backtest evidence pack (⛔ null: Sharpe −3.43 after costs) | 0 html | 📚 Source material |
| `volatilityExhaustion/analysis-book.html` | Vol-exhaustion analysis book (does expected vol predict intraday exhaustion?) | 1 | 🔬 Active work — was orphaned, now linked from Macro Research ▾ |
| `cog-standalone/` | Railway-deployable public copy of `cog-replay.html` + 4 API routes | 1 | 📚 Keep only while the public replay URL is in use; the HTML is a copy that can drift |
| `portfolioBacktest/results.html` | Output artifact of the portfolio hedge backtest | 1 | 📚 Results artifact, not a page |
| `archive/` | Deliberate dead-file graveyard with README | 1 | 🗄 Already correctly archived |
| `RegimeOptimizer/results/` | Generated optimizer result exports | 4 | 📚 Output artifacts, not pages |

## Follow-ups this review surfaced

- `system-yield-curve.html` title says "VIX Regime Rotation" — filename/content mismatch.
- `cog-standalone/cog-replay.html` duplicates root `cog-replay.html` and will drift.
- The stray third-party guide that sat in `.claude/COG_OIdashboard/` has been moved to `archive/`.
- `volatility-classifier-standalone.html` needs local `VolRangeForecaster/data/m1/` files; it never records a verdict — candidate for deletion or a proper run.
