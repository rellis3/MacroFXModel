# Comprehensive Backtest Systems Review — July 2026

> **Executive Summary:** After reviewing all backtest systems in the repository, I've identified **systemic issues preventing tradeable results**. The problems are NOT random bugs — they follow **three consistent patterns** across every system: (1) **optimistic fills** (touch-fill instead of realistic execution), (2) **missing or zero transaction costs**, and (3) **lookahead/causality defects** that let backtests see future data. These issues compound to create an **in-sample mirage** where strategies appear profitable but fail out-of-sample or live.

**Status:** Based on the existing documentation ([`BACKTEST_INDEX.md`](BACKTEST_INDEX.md:1), [`PLATFORM_REVIEW_2026-07.md`](PLATFORM_REVIEW_2026-07.md:1), [`TRADABILITY_REVIEW.md`](TRADABILITY_REVIEW.md:1), [`BUG_LIST.md`](BUG_LIST.md:1)), the project team is **already aware** of most critical issues. Many fixes are documented but **not yet implemented**.

---

## 1. Backtest Systems Inventory

### 1.1 Volatility/Forecasting Systems

| System             | File                                                                         | Strategy                             | Status                                               |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| **Vol BT v1**      | [`js/volBacktestEngine.js`](js/volBacktestEngine.js:1)                       | Daily fade at HL_75 band, EMA regime | 📚 Reference (read-only)                             |
| **Vol BT v2**      | [`js/volBacktestV2Engine.js`](js/volBacktestV2Engine.js:1)                   | Adaptive selector vs fixed legs      | 🔁 **Contaminated** — fixed 2026-07-02, needs re-run |
| **Honest Harness** | [`js/honestForecastEngine.js`](js/honestForecastEngine.js:1)                 | Fade/follow/regime with costs        | 🔧 **breachReclaim bug** (§1.3)                      |
| **Weekly Vol**     | [`js/weeklyVolBacktestEngine.js`](js/weeklyVolBacktestEngine.js:1)           | Monday-anchored weekly bands         | 🔧 D1-fallback + filter lookahead                    |
| **Forecaster M1**  | [`js/volBacktestM1Engine.js`](js/volBacktestM1Engine.js:1)                   | 8 static + 4 dynamic levels, M1 walk | 📚→🔧 **Costs default OFF**                          |
| **Python Vol**     | [`VolRangeForecaster/vol_backtest.py`](VolRangeForecaster/vol_backtest.py:1) | Dynamic-anchor fade                  | 🔧 **BUG #8** — uses full-day extreme                |

### 1.2 Regime Systems

| System               | File                                                       | Strategy                     | Status                                |
| -------------------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------------- |
| **Regime BT**        | [`regime-backtest.html`](regime-backtest.html:1) + JS      | HMM regime V1-V7 replay      | 🔧 **ADX one-bar-future shift**       |
| **RegimeV7 Bot**     | [`RegimeV7/regime_bot_v7.py`](RegimeV7/regime_bot_v7.py:1) | Live M30 HMM with debounce   | ✅ Production (paper costs on)        |
| **RegimeV2 BT**      | [`RegimeV2/backtest_v3.py`](RegimeV2/backtest_v3.py:1)     | Python HMM backtest          | 🔧 Consensus mismatch vs live         |
| **Regime Optimizer** | [`RegimeOptimizer/`](RegimeOptimizer/:1)                   | V1/V2/V4/V6 parameter search | 🔧 Spread% uses split-dependent price |

### 1.3 Range/Level Systems

| System          | File                                                                                                     | Strategy                       | Status                               |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| **Range-Line**  | [`js/rangeLineAnalyser.js`](js/rangeLineAnalyser.js:1) + [`perLineStrategy.js`](js/perLineStrategy.js:1) | Fade+follow Asia/Monday ladder | ✅ **PROVEN EDGE** (Sharpe 4.7-6)    |
| **Asia Range**  | [`js/asiaRangeEngine.js`](js/asiaRangeEngine.js:1)                                                       | Fib confluence + HMM + gates   | 🔧 **Zero costs**, WT gate lookahead |
| **Range-Fib**   | [`js/rangeFibEngine.js`](js/rangeFibEngine.js:1)                                                         | Base Asia/Monday fib fade      | 📚 Honest control (costs on)         |
| **Pivot Spike** | [`js/pivotSpikeEngine.js`](js/pivotSpikeEngine.js:1)                                                     | Daily pivot mean-reversion     | 🧪 Verdict never recorded            |

### 1.4 Equity/Macro Systems

| System            | File                                                   | Strategy                            | Status                                    |
| ----------------- | ------------------------------------------------------ | ----------------------------------- | ----------------------------------------- |
| **QMR (NQ)**      | [`server.js`](server.js:2254) `_computeNqQmr()`        | Overnight→London→NY continuation    | ✅→🧪 **Honest run committed 2026-07-28** |
| **Macro Equity**  | [`js/macroEquityEngine.js`](js/macroEquityEngine.js:1) | Macro composite → equity allocation | 🔁 **WALCL units bug** — re-run needed    |
| **NASDAQ Liq**    | [`js/nasdaq*.js`](js/nasdaqBacktest.js:1)              | 4-gate liquidity continuation       | 🧪 No committed OOS verdict               |
| **COG v2**        | [`js/cogStateEngine.js`](js/cogStateEngine.js:1)       | Setup/Risk/Trigger gates            | 🧪 Same (Q8 in queue)                     |
| **VIX Vol-Carry** | [`vix-vol-carry/`](vix-vol-carry/:1)                   | Short-VXX gated by term structure   | 🧪 Needs verification                     |

### 1.5 Other Systems

| System               | File                                                       | Strategy                              | Status                                |
| -------------------- | ---------------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| **Strategy Lab**     | [`js/strategyLabEngine.js`](js/strategyLabEngine.js:1)     | 12 famous retail strategies           | ⛔ **Banked null** — 0/12 survive     |
| **Hedge Signals v2** | [`js/hedgeSignalV2Engine.js`](js/hedgeSignalV2Engine.js:1) | Cointegration pairs mean-reversion    | 🔧 IS/OOS split by bar index not date |
| **Econ Trend**       | [`js/econTrendEngine.js`](js/econTrendEngine.js:1)         | Cross-sectional fundamentals momentum | ⛔ **Banked null** (OOS Sharpe 0.09)  |
| **Credit Stress**    | [`js/creditStressEngine.js`](js/creditStressEngine.js:1)   | CSI risk overlay                      | ⛔ **Banked null** (no-gate)          |
| **Trend Basket**     | [`js/trendBasketEngine.js`](js/trendBasketEngine.js:1)     | G10 12-mo trend, inverse-vol sized    | 🧪 New (2026-07-05), needs recording  |

---

## 2. Critical Bugs Preventing Tradeable Results

### 2.1 **Optimistic Fills (The Biggest Issue)**

**Problem:** Most backtests fill limit orders the instant price _touches_ a level, at the exact level price, with no slippage.

**Why This Matters:** Live, you don't get filled on every touch. The touches you miss are disproportionately the ones that would have lost (price blew through and kept going). Touch-fill **counts the winners and silently drops the losers**.

**Affected Systems:**

- ✗ [`volBacktestEngine.js:277-297`](js/volBacktestEngine.js:277) — `if (high >= entry)` instant fill
- ✗ [`asiaRangeEngine.js`](js/asiaRangeEngine.js:1) — fills first time `low ≤ level ≤ high`
- ✗ [`weeklyVolBacktestEngine.js:378-414`](js/weeklyVolBacktestEngine.js:378) — D1 fallback books Monday wins by construction
- ✗ [`VolRangeForecaster/vol_backtest.py:298-355`](VolRangeForecaster/vol_backtest.py:298) — **BUG #8**: dynamic anchor uses completed day's extreme
- ✓ [`rangeFibEngine.js`](js/rangeFibEngine.js:1) — honest (pessimistic ties)
- ✓ [`honestForecastEngine.js`](js/honestForecastEngine.js:1) — has breach-reclaim option (but see §2.4)

**Evidence from TRADABILITY_REVIEW.md:**

> "Sharpe degrades ~56% in-sample → out-of-sample (mean ~0.75 IS → ~0.33 OOS). 9 of 26 pairs go negative out-of-sample despite positive in-sample."

### 2.2 **Missing Transaction Costs**

**Problem:** Spread, slippage, and commission are set to **zero** or omitted entirely.

**Why This Matters:** On thin-edge mean-reversion, costs alone flip the sign of P&L. A 1.5-pip spread over 500 trades costs ~0.25-0.4 Sharpe.

**Affected Systems:**

- ✗ [`asiaRangeEngine.js`](js/asiaRangeEngine.js:1) — **zero costs anywhere in file** (PLATFORM_REVIEW §2.3)
- ✗ [`volBacktestM1Engine.js:792`](js/volBacktestM1Engine.js:792) — `spreadPct=0` default, costs OFF
- ✗ [`zscoreSpreadEngine.js`](js/zscoreSpreadEngine.js:1) — zero costs (TRADABILITY_REVIEW §3)
- ✗ QMR — costs exist but **never applied** to equity curve (TRADABILITY_REVIEW §4, now fixed per update)
- ✓ [`rangeFibEngine.js:176-177`](js/rangeFibEngine.js:176) — 0.8 pip spread + 0.5 slip = 1.3 pips
- ✓ [`honestForecastEngine.js:40-43`](js/honestForecastEngine.js:40) — costs on by default

**Search Results:** Found 81 instances of `cost.*=.*0` or `spreadPct.*=.*0` in JS files.

### 2.3 **Lookahead / Causality Defects**

**Problem:** Backtests use data from bars they couldn't have known at decision time.

**Critical Issues from PLATFORM_REVIEW_2026-07.md:**

#### §1.1 — Fill-bar TP on D1 paths

[`js/forecastCore.js:83-89`](js/forecastCore.js:83) checks TP against the fill bar's full range. For a fade, TP lies between open and entry, so the path necessarily traversed TP **before** the fill. **Structurally wrong on weekly/monthly/daily D1-fallback.**

#### §1.2 — Dynamic-HL same-bar anchor

[`js/forecastCore.js:169-238`](js/forecastCore.js:169) — `runLo[k]/runHi[k]` include bar `k` itself; fade level computed from the day's final low, filled at the day's high. **Self-fulfilling.** Defaults ON.

#### §1.3 — breachReclaim guarantees wins

[`js/honestForecastEngine.js:102-116`](js/honestForecastEngine.js:102) — fill accepted only when close is back through the band, entry at extreme touch, PnL = entry − close. **Filter guarantees positive by construction.**

#### §1.4 — ADX one-bar-future shift

[`js/indicatorCore.js:106-113`](js/indicatorCore.js:106) — `out[i]` incorporates data through bar `i+1`. Every ADX-gated regime backtest sees tomorrow. **Live doesn't.**

#### §1.5 — Yield z-score trades future yields

[`js/zscoreSpreadEngine.js:91-123`](js/zscoreSpreadEngine.js:91) — monthly-average yields forward-filled from observation date (1st of month), but these are finalized at month-end. Signal embeds future yields.

#### §1.6 — Weekly D1-fallback Monday wins

[`js/weeklyVolBacktestEngine.js:378-414`](js/weeklyVolBacktestEngine.js:378) — TP defaults to `mondayOpen`; if band touched on Monday's D1 bar, `low ≤ open` is true by construction → instant win.

**Additional from BUG_LIST.md:**

- **#5** — Candle-confirmation peeks at future bars ([`js/backtest-worker.js:639-650`](js/backtest-worker.js:639))
- **#6** — Gold M1 scan starts before entry ([`js/gold-backtest-worker.js:677`](js/gold-backtest-worker.js:677))
- **#7** — Same-bar TP-before-SL booked as win (gold + Asia)
- **#8** — Dynamic-anchor uses full-session extreme (Python vol_backtest.py)
- **#25** — WaveTrend gate reads touch bar's own close ([`js/asiaRangeEngine.js:579-612`](js/asiaRangeEngine.js:579))

### 2.4 **In-Sample Selection Bias**

**Problem:** Picking the best of N configs/filters on the same data that reports the result.

**Evidence:**

- **Asia Range:** Starting from ~90 zones/day, filters remove 95%+, leaving **2-3 trades per Fib level** over 60 days. The analyzer **hides cells with <3 trades** as "statistically unreliable." Eye-catching win rates are **noise, not edge**.
- **QMR (original review):** ~375 trades over 5 years, optimizer grid is **5,250 configs** → ~14 configs per trade. Rule of thumb wants ≤1 parameter per 30-50 trades; this is **~50× looser**.
- **Forecasting:** 96% of pairs show positive in-sample Sharpe — suspiciously high, signature of selection fitted to 2018-2023 window.

---

## 3. System-by-System Analysis

### 3.1 Volatility Bot / Forecasting Systems

**Core Issue:** The strategy **always fades** at the forecast extreme. But at an exhaustion point, price does one of two opposite things:

1. **Mean-revert** — fade works ✓
2. **Continue/break out** — fade is standing in front of a train ✗

**A single always-fade rule has to be wrong roughly half the time by construction.**

**Findings:**

- ✗ **Vol estimate unstable:** NQ/index range error ~−36% and widening ([`VOL_CALIBRATION_TRACKER.md`](VOL_CALIBRATION_TRACKER.md:1))
- ✗ **Live bot trades different strategy than validated:**
  - σ off-by-one (uses `sig[len-1]` predicting yesterday)
  - GMT-season stale open (23:05 UTC vs midnight London)
  - No plan-staleness gate
  - First-line-only subset (broker one-position-per-symbol + acted-burn-before-order)
  - No drawdown lockout
- ✓ **Core math is sound:** Feller/half-normal constants correct, no lookahead in σ/regime path
- ✓ **Range estimate is useful** independent of fade/follow decision

**Verdict (TRADABILITY_REVIEW §2):**

- As a fade strategy: **not tradable** — fails OOS, before costs
- As an input: **genuinely useful** for sizing/level-setting
- **Salvage value: HIGH** — keep the estimate, rebuild entry around exhaustion-vs-continuation classifier

### 3.2 Regime Systems

**Core Issue:** ADX one-bar-future shift contaminates all HMM regime backtests.

**Findings:**

- ✗ **ADX shift** ([`js/indicatorCore.js:106-113`](js/indicatorCore.js:106)) — backtest sees tomorrow, live doesn't
- ✗ **RegimeV2 consensus mismatch** — live counts self, backtest doesn't
- ✗ **V2/V4 paper-mode SL never simulated** — paper P&L overstates protection
- ✗ **RegimeV7 `sl==0` instant-close for shorts** — orphan adoption bug
- ✓ **RegimeV7 paper costs on** — mirrors backtest (1.2bp + 0.4bp slip on stops)
- ✓ **Audit log with config hash** — can group live trades by exact config version

**Verdict:**

- Fix ADX shift + re-run all regime backtests before trusting any regime card
- RegimeV7 is the most mature (paper costs, audit trail, event blackout)

### 3.3 Range-Line System (Asia/Monday Ladder)

**Status:** ✅ **THE PROVEN EDGE** — the only system with honest, validated OOS results.

**Evidence (BACKTEST_INDEX §1):**

- Single-pair Sharpe ≈4.7–6 @2–3× cost
- Every year + every fold green
- DSR 100%
- OOS ≥ IS
- Indices transfer even stronger (NASDAQ +7.34 @3×)

**Why It Works:**

- ✓ Costs on (0.8 pip spread + 0.5 slip)
- ✓ Pessimistic fills (ties resolved conservatively)
- ✓ True walk-forward with chronological IS/OOS split
- ✓ Chandelier trail matches validated book's exit
- ✓ One-shot per line per session (no re-entry gaming)

**Remaining Work:**

- Live wiring ([`RANGE_EXTENSION_GUIDE.md`](RANGE_EXTENSION_GUIDE.md:1) §11)
- Live read as non-fragmenting filter/sizer (§14)

### 3.4 Asia Range / Fib Confluence

**Core Issue:** Zero costs + sample collapses under filters + no committed OOS run.

**Findings:**

- ✗ **Zero costs anywhere in file** (PLATFORM_REVIEW §2.3)
- ✗ **WaveTrend gate reads touch bar's own close** (lookahead)
- ✗ **Sample collapse:** tight confluence + high score → 2-3 trades per level over 60 days
- ✗ **No stored OOS evidence** — UI has IS/OOS buttons but nothing committed
- ✗ **Z-score overlay:** only USDJPY directionally validated
- ✓ **Base range-fib:** plausibly breakeven-to-marginal after realistic fills

**Verdict (TRADABILITY_REVIEW §3):**

- Base: marginal
- Filtered "tight confluence": **selection bias on tiny samples**
- **Salvage value: MEDIUM** — needs realistic fills, full costs, hard sample-size floor, real OOS split

### 3.5 QMR (NASDAQ Continuation)

**Status:** ✅→🧪 **Honest run committed 2026-07-28** (see [`QMR_WALKFORWARD_RESULT.md`](QMR_WALKFORWARD_RESULT.md:1))

**Results:**

- 433 OOS trades
- Mean OOS Sharpe 1.18
- 6/8 windows positive
- 36% CAGR at ~3.4× leverage
- **Cost-critical:** dead by 4bp round-trip

**Corrections Since Original Review:**

- ✓ Costs ARE applied now
- ✓ One-hour gate lookahead fixed
- ✓ Optimizer's trade-count-inflating Sharpe replaced with daily-calendar Sharpe

**Still Open:**

- 5,250-config optimizer still too dense per trade
- Systems 2/4 measure as noise against counterfactuals
- Direction call vs coin flip unanswered ([`PREREGISTERED_EVALUATIONS.md`](PREREGISTERED_EVALUATIONS.md:1) §5b)

### 3.6 Macro/Equity Systems

**Core Issue:** WALCL units bug (millions vs billions) + macro is decoration, not a judge.

**Findings:**

- ✗ **WALCL/TGA/RRP unit mismatch** — TGA/RRP swing is ~0.01% of WALCL, so "net liquidity" degenerates to raw Fed balance sheet
- ✗ **Safe-haven sign inversion** — VIX 30 + HY gapping **boosts** long GBP/JPY score (backwards)
- ✗ **Macro touches decisions at 4 paths, 3 are broken:**
  1. `computeMacroScore` → Level Bot: sign-inverted for JPY/CHF
  2. Level Bot gates: 0-12 vs 0-100 scale mismatch, `fred` vs `fred2` key
  3. HMM confidence scaling: works, but falls back to CALM on FRED outage
  4. RegimeV2 FOMC/VIX gates: **the single healthy integration**
- ✗ **Vol bot consumes zero macro/COT/liquidity/event input** — will sit on fade limits through NFP/CPI/FOMC

**Verdict (PLATFORM_REVIEW §2.2):**

- Macro is **decoration, not a judge**
- Everything else terminates in HTML/Telegram/AI-briefing prose
- Fix WALCL units + safe-haven sign + make macro a 3-state selector (ALIGNED/NEUTRAL/OPPOSED)

### 3.7 Strategy Lab (12 Famous Retail Strategies)

**Status:** ⛔ **Banked null** — honest run committed 2026-07-18.

**Results:**

- **0/12 survive** the gate
- 48 variants tried (long/flat, 2bp cost, 10-instrument universe, split 2020-04-03)
- Pattern: every spec IS Sharpe ≈0.0–0.4 (dead for ~15 years), OOS 0.6–1.0 (long-bias catching post-COVID), none beat b&h OOS (1.13)
- **EMA Cross 9/21:** IS 0.00, DSR 0.39 — its Bitcoin fame was beta, not edge

**Verdict:**

- Do not re-litigate the 12
- Lab's standing job is gatekeeping NEW spec ideas

---

## 4. Common Patterns Across All Systems

### 4.1 The Three Failure Modes

Every non-tradeable system shares the same pattern:

1. **Optimistic fills** — touch-fill counts winners, drops losers
2. **Missing costs** — spread/slippage/commission set to zero
3. **In-sample selection** — picking best of N configs on same data

**A real edge survives all three. None of these (except Range-Line) has been shown to.**

### 4.2 Backtest Honesty Gaps (PLATFORM_REVIEW §2.3)

- v1 M1 engine costs default OFF
- v1 dynamic-anchor D1 fallback anchors on completed day's extremes
- asiaRangeEngine: zero costs
- Weekly engine z-score/SMI filters index fill bar's own close
- M1 session window ≠ D1 session (2h of session never walked)
- hedgeSignalV2 IS/OOS split by bar index, not calendar date
- Per-trade Sharpe pooled across 26 concurrent pairs (inflates under clustering)

### 4.3 Live vs Backtest Divergence

**Volatility Bot:**

- σ off-by-one
- GMT-season stale open
- No plan-staleness gate
- First-line-only subset
- No drawdown lockout
- Range bot: default `max_spread_pips: 1e9` (spread guard off)

**Regime Systems:**

- ADX one-bar-future shift
- Consensus convention mismatch
- Paper-mode SL never simulated

**Macro:**

- Two divergent `signalScore` formulas (server vs browser)
- Different macro engines write same KV key
- COT percentiles on raw contracts (not OI-normalized)
- Rate differentials pit monthly-average 2y vs overnight/3M (term premium baked in)

---

## 5. What Would Make Each System Believable

The cheap, decisive move is the same for all: **stop trusting live dashboards and re-test honestly**.

### 5.1 Minimum Requirements

1. **Realistic fills** — require breach-and-reclaim (or add adverse slippage), not touch-fill
2. **Full costs** — real spread + entry and exit slippage + commission per instrument
3. **True walk-forward** — config/filter selection window must never touch test window
4. **Sample-size floor** — no filter combination yielding <30 trades/year counts as "validated"

### 5.2 Specific Fixes by System

**Volatility/Forecasting:**

- Replace always-fade with explicit exhaustion-vs-continuation decision
- Fix producer σ off-by-one + 23:05-UTC/London-midnight anchor
- Add plan-staleness fail-closed gate
- Wire drawdown lockout

**Regime:**

- Fix ADX one-bar shift ([`indicatorCore.js`](js/indicatorCore.js:106) + [`hmm5m.js`](hmm5m.js:88))
- Re-run all regime backtests
- Fix V7 `sl==0` instant-close
- Add paper-mode SL simulation to V2/V4

**Asia Range:**

- Add costs (1.3+ pips)
- Lag WT/z-score/SMI gates to pre-touch bar
- Require breach-and-reclaim
- Hard sample-size floor (≥30 trades)
- Commit real OOS split

**Macro:**

- Fix WALCL/TGA/RRP units at FRED source
- Fix safe-haven sign inversion
- Make macro a 3-state selector (ALIGNED/NEUTRAL/OPPOSED)
- Event gate as brick consumed by vol bot

---

## 6. Priority Roadmap

### P0 — Before Trusting Any Current Number

1. ✅ **Fix `walkBars` fill-bar TP + `dynamicHL` same-bar anchor** — DONE 2026-07-02
2. **Fix producer σ off-by-one + London-midnight anchor** (§2.1)
3. **De-collide MT5 magics** + add positions_get reconciliation (§1.9)
4. **Fix safe-haven sign inversion** + never-firing Level-Bot gates (§1.8, §2.2)
5. **WALCL/TGA/RRP unit fix** at FRED source (§1.7)

### P1 — Restore Backtest Honesty

6. breachReclaim fill-at-close; weekly D1-fallback pessimistic resolution; default costs on for v1 + asiaRangeEngine; lag WT/z-score/SMI gates; zscoreSpreadEngine release-date lags + costs; hedgeV2 calendar-date split
7. **Fix ADX one-bar shift** ([`indicatorCore`](js/indicatorCore.js:106) + [`hmm5m`](hmm5m.js:88)), re-run regime backtests
8. One Sharpe methodology in server.js (daily returns × √252)

### P2 — Make Macro the Judge

9. Extract one `macroCore` brick with sign driven by `PAIR_DRIVERS.riskSens`
10. Layer as 3-state selector (ALIGNED/NEUTRAL/OPPOSED), not tunable weights
11. Event gate as brick consumed by vol bot
12. Carry FRED observation dates end-to-end
13. Backtest exact live blend with historical FRED (PUB_LAG)

### P3 — Consolidation

14. Single σ-dispatch export; kill `||1e-6` fallback; settle gold pip; golden vectors for `rangeline.py`; wire `pylego.risk_guard` into both new bots

---

## 7. Key Insights

### 7.1 What's Actually Working

**Range-Line System** is the **only proven edge**:

- Honest costs, pessimistic fills, true walk-forward
- Sharpe 4.7-6 @2-3× cost, DSR 100%, OOS ≥ IS
- Indices transfer even stronger

**Why:** It's the only system that survived all three tests (realistic fills, full costs, true OOS).

### 7.2 What's Salvageable

**High Salvage Value:**

- **Vol estimate** (range forecast) — useful for sizing/level-setting independent of fade/follow
- **QMR** — honest run shows promise, but cost-critical

**Medium Salvage Value:**

- **Asia Range base** — plausibly breakeven-to-marginal after realistic fills
- **Regime systems** — fix ADX shift, then re-evaluate

**Low Salvage Value:**

- **Strategy Lab 12** — banked null, do not re-litigate
- **Econ Trend** — banked null (OOS Sharpe 0.09)
- **Credit Stress** — banked null (no-gate)

### 7.3 The Central Question

For volatility/forecasting systems, the edge is NOT "fade the extreme" — it's **knowing which regime you're in when price reaches the extreme**.

**The hard part:** exhaustion vs breakout classification (trend day vs range day). This is the thing most worth building.

---

## 8. Recommendations

### 8.1 Focus Order (by Expected Payoff per Hour)

1. **Range-Line first** — wire it live (it's already proven)
2. **Forecasting second** — reframe from "fade the extreme" to "fade or follow, decided by regime"
3. **Regime third** — fix ADX shift, re-run, then evaluate
4. **Asia Range fourth** — re-test with realistic fills + sample floor
5. **QMR last** — already has honest run; monitor cost sensitivity

### 8.2 Next Deliverable

**Web-based "honest harness"** built into dashboard:

- Realistic fills (breach-reclaim or adverse slippage)
- Full costs (spread + entry/exit slippage + commission)
- True walk-forward split
- For forecaster: toggle mean-reversion vs continuation + measure classifier

### 8.3 Cross-Cutting Fixes

- **Pick one bar-execution convention** and apply across every backtest
- **Centralize pip/point/contract values** from `mt5.symbol_info`
- **One Sharpe methodology** (daily portfolio returns × √252)
- **Standardize journal event contract** (`TRADE_CLOSED` + `reason`)
- **Authenticate `/api/kv/set`** and remove credential keys from public write whitelist
- **De-duplicate** `getYesterdayLevels`/`getPrevWeekLevels` and ATR/EMA implementations

---

## 9. Conclusion

**Why No System Shows Tradeable Results:**

The issue is NOT random bugs. It's **three systemic patterns** that compound:

1. **Optimistic fills** — touch-fill counts winners, drops losers
2. **Missing costs** — thin edges flip sign after realistic friction
3. **Lookahead defects** — backtests see future data live can't access

**These create an in-sample mirage where strategies appear profitable but fail OOS or live.**

**The Good News:**

- The project team
