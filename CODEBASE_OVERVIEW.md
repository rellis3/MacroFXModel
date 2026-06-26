# MacroFXModel — Codebase Overview

> A single-page map of everything in this repository: the live trading bots, the
> backtesting suite, the volatility/range forecasting stack, the regime and QMR
> engines, the range-extension/Fibonacci confluence system, and the web
> infrastructure that ties it together.
>
> Generated as a codebase review. Figures (win rates, Sharpe, CAGR) are
> self-reported from the repo's own docs/backtests and are **in-sample unless
> noted** — treat them as design targets, not verified live results.

---

## 1. What This Project Is

MacroFXModel is a **personal quantitative trading research platform** spanning
FX, gold, equity indices (NQ/SPX/DAX/FTSE/DOW) and volatility products. It is
built around a few recurring ideas:

1. **Macro context first** — a multi-tier macro score (rates, vol, USD, credit,
   carry, financial conditions) gates and sizes everything.
2. **Regime detection** — Hidden Markov Models classify markets as
   BULL / BEAR / RANGE / CHOP at multiple timeframes.
3. **Volatility & range forecasting** — EWMA/GARCH vol feeds Brownian-motion
   range percentiles that produce daily/weekly/monthly expected ranges.
4. **Structural confluence** — Fibonacci levels off the Asia session and Monday
   range, clustered with pivots/POC/VWAP/round numbers into star-rated zones.
5. **Systematic portfolio strategies** — slower macro-driven allocation models
   (carry, momentum, yield curve, credit-equity, gold macro, macro equity).

The platform has three layers:

| Layer | Tech | Role |
|---|---|---|
| **Live bots** | Python + MetaTrader 5 (MT5) | Execute trades on a broker |
| **Web app** | Node/Express (`server.js`) + Cloudflare Worker (`_worker.js`) | Data feeds, dashboards, KV state, alerts |
| **Research** | HTML single-page backtesters + Python optimizers | Strategy design & validation |

**Deployment:** Railway runs `start.sh`, which supervises three Python bots
(RegimeV2, Level, Gold) plus the Node server. A Cloudflare Pages deployment of
`_worker.js` + a cron worker provides a serverless mirror and minute-level
price-proximity Telegram alerts.

---

## 2. Live Trading Bots

All bots connect to **MetaTrader 5** for execution, poll the dashboard **KV
store** for config/state, and default to **paper mode** (a `--live` flag enables
real orders). Each uses a distinct MT5 magic number.

### Deployed in production (`start.sh`)

| Bot | Dir | Instruments | Strategy in one line | Magic |
|---|---|---|---|---|
| **RegimeV2** | `RegimeV2/` | 13 FX pairs | M1 HMM regime-follower, 30s poll, multi-gate entry + cascade exit, Telegram alerts | 20260005 |
| **Level Bot** | `bot/` | 9 FX + 5 indices + gold | HMM regime + structural confluence entries with 5-factor macro beta rebalancing | 20260001 |
| **Gold Bot** | `Gold/` | XAU/USD | Top-down HTF bias + Fib zones + volume-profile/VWAP confluence + VuManChu confirmation | 20260004 |

**RegimeV2** (`RegimeV2/regime_bot_v2.py`) — the flagship. A 4-state HMM
(BULL/BEAR/RANGE/CHOP) on 5-min bars drives a strict **entry gate stack**
(regime directional, confidence × session multiplier ≥ threshold, confidence
rising, vol z-score gate, candle-hold debounce, regime-decay check, 1H HTF
agreement, cross-pair consensus, FOMC/news/VIX-backwardation avoidance, volume
exhaustion). Exits are an ordered cascade: regime flip → confidence floor →
confidence slope/velocity → SL → BOCPD change-point → HTF flip → consensus
collapse → MFE-retrace. Pulls VIX from Yahoo, FX/gold vol indices from FRED,
high-impact news from Forex Factory, and fires rich Telegram alerts.

**Level Bot** (`bot/main.py`) — a two-speed orchestrator (120s state refresh,
3s price tick) running ~8 cascading modules: vol gate → regime confidence →
gold macro → macro regime → confluence → OI walls → COT filter → news risk. It
also estimates portfolio **beta** against a 5-factor FRED macro model and
rebalances toward a target.

**Gold Bot** (`Gold/main.py`) — XAU/USD specialist. Daily/4H EMA structure + BOS
for bias, multi-TF Fibonacci impulse zones, a 12-day age-weighted naked-POC
stack, session/VWAP anchors, trendline touches, and VuManChu Cipher B
(WaveTrend + Money Flow + VWAP slope) confirmation, with a multi-TP ladder.

### Experimental / not in production

| Bot | Dir | Note |
|---|---|---|
| **RegimeV4** | `RegimeV4/` | Adds a `RANGE_HOLD` state machine — holds through consolidation instead of exiting on flip |
| **RegimeV7** | `RegimeV7/` | M30 bars, HTF (4×) confirmation gate, per-trade config-hash audit log |
| **MacroEquityBot** | `MacroEquityBot/` | Monthly-rebalanced 5-factor macro equity allocation (QQQ/SPY/IWM/TLT/DAX); see `MACRO_BOT_DESIGN.md` |
| **DynAnchorBot** | `DynAnchorBot/` | EWMA-vol + EMA-slope counter-regime mean reversion on XAU/NAS100; Brownian-percentile anchors (backtest Calmar ~9.97) |
| **TradingBot** | `TradingBot/` | OANDA-API paper version of the dynamic-anchor strategy |
| **DecisionEngine** | `DecisionEngine/` | JS framework (not a bot): blends regime + vol forecast + COT into trade mode / participation / risk multiplier |

---

## 3. Regime Detection (V1 → V7)

A **regime** is the current market structure state. Detection uses a **Hidden
Markov Model** over rolling features — trend slope, volatility z-score, ADX, and
a session-quality multiplier — emitting a regime label, a confidence (0–100%),
and a decay/freshness score. Supporting signals: **BOCPD** (Bayesian Online
Change-Point Detection) for structural breaks, slope-direction agreement, and a
weighted composite score.

### Version evolution

| Ver | Timeframe | States | Key change | Status |
|---|---|---|---|---|
| V1 | M1 | 3 | Original regime follower | historical |
| **V2** | M1 | 4 (+CHOP) | 6-component composite score + BOCPD; **deployed** | LIVE |
| V4 | M1/MTF | 4 | `RANGE_HOLD` state machine, MFE trailing | lab |
| V5 | MTF (15–240m) | 4 | V4 logic on multi-timeframe bars | lab |
| V6 | MTF (30m) | 4 | Simplified exits (drops RANGE_HOLD) | experiment |
| V7 | M30 | 4 | HTF confirmation gate + audit logging | lab |

Regime output drives go/no-go (entries only in BULL/BEAR above a confidence
floor), exits (flip → close; degradation → early exit), and sizing (VIX-z and
session-quality multipliers, cross-pair consensus).

**Tooling:** `regime-backtest.html` (browser simulator for all versions),
`RegimeOptimizer/` (Optuna Bayesian parameter search, ~1000 trials/pair),
`regime-viewer.html`, and the `/api/hmm5m-v2` + `/api/hmm1h-v2` live endpoints.
See `regimev2-fixes.md` and `RegimeV2/README.md`.

---

## 4. QMR — Nasdaq Two-Gate Continuation

**QMR** is the pre-market continuation system for NASDAQ (NQ), backtested in
`nq-qmr-backtest.html` and served via `/api/nq-qmr/backtest` in `server.js`. It
is a **two-gate momentum filter**:

- **Gate 1 — Overnight (Asia) momentum (~09:00 UTC):** where price sits inside
  the overnight Globex range. Top 40% → LONG bias, bottom 40% → SHORT bias
  (threshold + minimum-range filters).
- **Gate 2 — London confirmation (~12:00 UTC):** London must move ≥0.10% in the
  same direction. On confirmation, a trade fires at the ~13:00 UTC bar (NY
  open). Dynamic SL (overnight range × multiplier), fixed-% TP (~3R), EOD exit.

Optional sub-systems: **System 2** (rejection fade — Gate 1 passes but Gate 2
fails → trade London direction), **System 3** (extension fade — fade when the
move is already extreme), **System 4** (chop fade — fade inefficient/choppy
paths). Runs on US/EU indices, gold, and several FX pairs.

> Note: the QMR acronym is referenced differently in different docs
> ("Qualitative Momentum Rank" / "Quantile Momentum Regime"); operationally it
> is the overnight→London two-gate continuation engine described above.

---

## 5. Volatility & Range Forecasting

The forecasting stack predicts **expected price ranges** over daily, weekly and
monthly horizons and feeds them into sizing, stops, and level placement. Docs:
`DAILY_VOL_RANGE_FORECAST_GUIDE.md`, `WEEKLY_VOL_RANGE_FORECAST_GUIDE.md`,
`VOLATILITY_IMPLEMENTATION_GUIDE.md`, `VOL_FORECASTER_REFERENCE.md`,
`VOL_CALIBRATION_TRACKER.md`, `FORECAST_MARKUP_TRADING_GUIDE.md`.

### Volatility models
- **EWMA (λ=0.94)** on daily log returns (RiskMetrics standard) — primary.
- **GARCH(1,1)** per asset class (FX α=0.06/β=0.91; index variant; commodity uses
  Rogers-Satchell EWMA) — dashboard/backtester.
- **Yang-Zhang** intraday estimator, **HV20/HV30** historical fallbacks.

### Range percentiles (Brownian motion)
Daily σ is converted to expected range using analytical multipliers:
- **High-Low:** `HL_median = 1.572·σ`, `HL_75 = 2.049·σ` (Feller BM range pctls)
- **Open-Close drift:** `OC_median = 0.6745·σ`, `OC_75 = 1.1503·σ` (half-normal)
- **Asset-class correction factors** (FX/index/commodity) adjust for overnight
  gaps; an optional **news multiplier** (×1.15–1.35 for FOMC/NFP/CPI/PCE/GDP)
  widens ranges around events.
- **Weekly = daily × √5**, **monthly = daily × √20.**

### HMM overlay
`hmm.js` (2-state daily RANGE-vs-TREND) and `hmm5m.js` / `hmm5m-v2.js` (3-state
intraday BULL/BEAR/RANGE off z-scored slope/ATR/ADX) classify regime to set
trade bias; `hmm5m-train.js` is the Baum-Welch trainer.

### Validation & optimization
Walk-forward, no-lookahead backtesters (`vol-backtest.html`,
`weekly-vol-backtest.html`, `forecaster-backtest.html` + their JS engines and
`VolRangeForecaster/vol_backtest.py`) fade limit orders at forecast levels and
score win%/Sharpe/PF/DD. **`ForecasterOptimizer/`** is a numba-jitted Python
port that random-searches ~600 configs/pair across 26 pairs, ranks by Calmar
with a real-stop filter, and validates on a 2024–2026 holdout.

**Open calibration item** (`VOL_CALIBRATION_TRACKER.md`): index/NQ GARCH has a
slow decay (α+β=0.97 → ~23-day half-life) versus reference vol that mean-reverts
in ~1 session, producing oscillating over/under-estimates — under active tuning.

---

## 6. Range Extension, Asia Range & Fibonacci Confluence

The structural intraday engine. Core idea: price mean-reverts toward
**Fibonacci extension levels derived from the Asia session range**
(00:00–06:00 UTC, body closes only), validated by **confluence** with other
structural sources.

- **Range & projection:** Asia high/low from 5m body extremes; **45 Fib levels**
  projected as multiples of the range (negative = LONG zones below, >1.0 = SHORT
  zones above; 0/0.25/0.5/0.75/1.0 are the high-awareness anchors).
- **Confluence (`confluence-core.js`):** today's Fibs vs yesterday's; a match
  within ≤2 pips (FX) is a confluence, ≤1 pip is "tight." Seven source types are
  clustered — Fib, swing S/R, daily opens, POC/naked-POC, weekly pivots, vol
  forecast levels, round numbers — and rated by **star count** (⭐ watch →
  ⭐⭐⭐⭐ size up). Cross-session merges (Asia vs Monday range) are highest
  conviction.
- **Z-score gate:** yield-spread z-score is **contextual** — 2.0–2.5σ is
  profitable (~39% WR, PF ~1.03) but edge decays at 3σ+ (`ZSCORE_CONFLUENCE_BUILD_BRIEF.md`).
- **Jay Pivot method** (`jay_pivot_method.md`): multi-layer markup combining
  pivots (PP/R/S), Fibs, volume profile (VAH/VAL), VWAP side, and momentum
  divergence; untapped pivots are highest-probability.

**Live engine:** `levels.js` refreshes every 30 min — fetches OANDA bars,
computes the Asia range + 45 Fibs, scores entries (HMM regime + range-bias
features + macro), grades A+/A/B/C/SKIP, and writes to KV.

**Backtesters:** `asia-range-backtest.html` (confluence, 26 pairs + gold,
2600+ trades), `zscore-backtest.html` (yield-spread gate), `range-fib-backtest.html`
(baseline, no confluence), plus `asia-range-analysis.html`. Pine indicators:
`Confluence Zones Indicator.pine`, `sniper-suite-v7.2.pine`, and others in
`pine/` `pinescript/`. The claimed edge is **layering** (structure + confluence
+ macro filter + intraday confirmation), not any single signal.

Key docs: `asia fib.md`, `asia_range_extension_lesson.md`,
`fibonacci_retracement_guide.md`, `Fib_STRATEGY_DOCUMENTATION.md`,
`MASTER_STRATEGY_DOCUMENTATION.md`, `ZONE_TRADE_DECISION_FRAMEWORK.md`.

---

## 7. The Backtesting Suite

The repo's research lives mostly in **self-contained HTML single-page
backtesters** (embedded JS engines, Chart.js / Lightweight-Charts, M1 data via
parquet/TypedArray caches, walk-forward & Monte-Carlo helpers in
`js/sys-backtest-shared.js`) plus a set of **Python backtesters**.

| Group | Tools | What it tests |
|---|---|---|
| **Regime multi-signal** | `regime-backtest.html`, `RegimeV2/backtest_v3.py`, `backtestSystem/` | HMM regime + feature-score FX entries |
| **Range / Fib confluence** | `asia-range-backtest.html`, `range-fib-backtest.html`, `zscore-backtest.html` | Asia-range Fib extensions + confluence |
| **Vol forecasting** | `vol-backtest.html`, `weekly-vol-backtest.html`, `forecaster-backtest.html`, `VolRangeForecaster/vol_backtest.py` | Forecast-level fade, daily/weekly |
| **Stat-arb / pairs** | `portfolioBacktest/portfolio_backtest.py` | Cointegration spread z-score, beta-neutral, 28+ pairs |
| **Macro-conditional equity** | `macro-equity-backtest.html`, `nasdaq-threshold-backtest.html`, `macro-regime-conditional/` | NQ/SPX long-or-flat gated by macro z-scores + VIX |
| **Vol carry / derivatives** | `vix-vol-carry-backtest.html`, `vix-vol-carry/` | Short-VXX carry with term-structure + circuit breaker |
| **QMR** | `nq-qmr-backtest.html` | NQ overnight→London two-gate continuation |
| **Single-instrument** | `gold-backtest.html` | XAU multi-gate Fib/pivot/VWAP/VMU |
| **Gated / hedge** | `liquidity-gate-backtest.html`, `hedge-backtest.html`, `claude-backtest.html` | Net-liquidity windows, equity+VIX hedge |
| **Viewers / monitors** | `backtest-viewer.html`, `backtest-monitor.html` | Trade replay & live bot status |

Most engines are walk-forward and no-lookahead (limit orders, chronological,
ATR-validated, slippage/commission configurable). Standalone Python validators
(e.g. `analysis/trade_analyzer.py`) enrich closed MT5 trades with signal context.

---

## 8. Systematic Portfolio Strategies (P-series)

Slower, macro-driven allocation models, each with a `system-*.html` backtest
dashboard (walk-forward KPIs + Monte-Carlo) and navigated from `hub.html`.

| ID | System | File | Signal | Cadence |
|---|---|---|---|---|
| P2 | Credit-Equity divergence | `system-credit-equity.html` | HY spread vs equity pricing | 6–10/yr |
| P3 | Yield-curve rotation | `system-yield-curve.html` | 10Y–2Y + NFCI regimes | 4–8/yr |
| P4 | FX carry | `system-fx-carry.html` | Rate differentials + AUD/JPY carry | 20–30/yr |
| P5 | FX momentum | `system-fx-momentum.html` | EMA/RSI cross-sectional rank | 12–18/yr |
| P6 | Gold macro | `system-gold-macro.html` | Real yield + VIX + DXY | 4–8/yr |
| — | Macro equity | `MacroEquityBot/`, `MACRO_BOT_DESIGN.md` | 5-factor FRED z-score allocation | monthly |

The docs sketch a combined-book base case of ~20–28% CAGR / ~-16% max DD (a
design target, not verified). See `P1_MACRO_EQUITY.md`, `P2_P7_PORTFOLIO_STRATEGIES.md`,
`P8_VIX_VOL_CARRY.md`, `STRATEGY_INDEX.md`, `plans/PROFITABILITY_IMPROVEMENTS.md`.

---

## 9. Web Infrastructure & Data

### Components
- **`server.js`** (~460 KB Node/Express) — persistent monitoring (OANDA prices
  every 3s), level/macro/correlation refresh loops, Kalman-OLS beta estimator,
  hedge-signal generator, and ~30 `/api/*` routes. Serves all dashboards.
- **`_worker.js`** (~120 KB Cloudflare Worker) — the same API logic for a
  serverless Pages deployment: FRED proxy, OHLC, OANDA stream/book, COT parser
  (CFTC TFF + disaggregated), regime candles, Claude AI analysis, KV get/set.
  Reused by `server.js` via a `callWorker` adapter. (Must stay ASCII-only.)
- **`cron-worker/`** — Cloudflare cron (1-min) that checks live prices against
  stored entry levels and fires Telegram proximity alerts.
- **`kv.js` / `levels.js` / `hmm*.js`** — in-memory KV mock, live level engine,
  HMM classifiers.

### Data feeds
| Source | Use |
|---|---|
| **OANDA** | FX/index prices & candles (3s monitor) |
| **TwelveData** | OHLC fallback / exotic FX |
| **FRED** | ~18 macro series (yields, VIX, DXY, HY spreads, NFCI, TIPS, liquidity) |
| **Finnhub** | Economic calendar / news (surprise index, news multiplier) |
| **CFTC / CME** | COT (TFF + disaggregated), OI/GEX proxies |
| **Treasury Daily Statement** | TGA / RRP net-liquidity flows |
| **Anthropic Claude API** | AI narrative briefings |
| **Telegram** | Alert delivery |

### Macro tier score (T1–T8)
A composite from −16 to +16 (±1 coherence bonus): T1 rate differential, T2 VIX
level+direction, T3 DXY, T4 HY credit spreads, T5 AUD/JPY carry proxy, T6 NFCI
financial conditions, T7 momentum (EMA/RSI), T8 session flow. The score maps to
a position-sizing band (10→100%) and gates the bots. (`FUTURE_BUILD.md` covers
the planned `assetClass` refactor and DOW/FTSE/index expansion.)

### Key dashboards
`index.html` (primary regime+confluence terminal), `indexv2.html` (market state
at a glance), `hub.html` (portfolio navigation), `bot-config.html` (bot config &
status), `journal.html`, `performance.html`, `correlations.html`,
`diversification.html`, `cot-extremes.html`, `liquidity-pulse.html`,
`hedge-signals.html`, `gold.html` / `gold-zones.html`, the `nasdaq-*` and
`vol-forecast*` tools.

---

## 10. Repository Map

```
Live bots (Python + MT5)
  bot/                Level Bot — HMM + confluence + beta rebalance (deployed)
  Gold/               Gold Bot — Fib zones + VuManChu (deployed)
  RegimeV2/           Regime follower — flagship (deployed)
  RegimeV4 V7/        Regime experiments (lab)
  MacroEquityBot/     Monthly macro equity allocation
  DynAnchorBot/ TradingBot/  Dynamic-anchor mean reversion
  DecisionEngine/     JS decision-permission framework
  backtestSystem/     Live MT5 trading loop (also backtestable)

Research / backtesters
  *-backtest.html     Self-contained HTML backtesters (see §7)
  system-*.html       P-series systematic strategies (§8)
  portfolioBacktest/  Cointegration stat-arb (Python)
  VolRangeForecaster/ ForecasterOptimizer/  Vol forecasting + optimizer
  RegimeOptimizer/    Optuna regime parameter search
  vix-vol-carry/ macro-regime-conditional/  Strategy-specific Python
  analysis/           Post-trade analytics
  Zoo/                Misc experiments

Infrastructure
  server.js           Node/Express server + monitoring + API
  _worker.js          Cloudflare Worker (API/COT/FRED/AI)
  cron-worker/        Minute-level proximity alerts
  levels.js hmm*.js kv.js   Live engines / helpers
  js/ css/ pine/ pinescript/  Front-end engines, styles, TradingView indicators

Docs
  MD files/           ~60 strategy & handover docs (master references)
  *.md (root)         Design docs, lessons, calibration trackers, roadmaps
  plans/ docs/        Improvement plans, integration notes
```

---

## 11. Where to Start Reading

- **Big picture:** this file, then `MD files/PROJECT_MASTER_STATUS.md` and
  `MD files/STRATEGY_INDEX.md`.
- **A live bot:** `RegimeV2/README.md` + `RegimeV2/regime_bot_v2.py`.
- **Macro equity model:** `MACRO_BOT_DESIGN.md`.
- **Forecasting:** `MD files/DAILY_VOL_RANGE_FORECAST_GUIDE.md` +
  `MD files/VOL_CALIBRATION_TRACKER.md`.
- **Confluence/Fib system:** `asia fib.md` +
  `MD files/ZONE_TRADE_DECISION_FRAMEWORK.md`.
- **Roadmap:** `FUTURE_BUILD.md` and `plans/PROFITABILITY_IMPROVEMENTS.md`.

---

*This overview was generated from a structured review of the repository. Verify
performance numbers against the underlying backtests before acting on them; most
are in-sample.*
