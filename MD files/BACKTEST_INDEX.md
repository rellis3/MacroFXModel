# Backtest Index — every backtest, where it lives, what it tests, what we know

> One page to find any backtest: its **shortcut on `index.html`** (the dropdown
> hub at the top of THE Dashboard), the **strategy it tests**, the **honest
> analysis** of where it stands (from the July 2026 review), and the **open
> question** to answer later where one run would settle it. Companion to
> `SYSTEM_ASSESSMENT.md`, `TRADABILITY_REVIEW.md`, `PLATFORM_REVIEW_2026-07.md`,
> `PROJECT_STATUS.md`. Last updated: **2026-07-05**.

**Status legend**

| Icon | Meaning |
|---|---|
| ✅ | Proven edge (honest OOS, costs on) — build on it |
| 🔁 | Evidence contaminated by a since-fixed bug — **re-run needed** before trusting |
| 🔧 | Known honesty defect still open — fix first, then re-run |
| 🧪 | Question pending — one honest run would answer it (see Questions Queue) |
| 📚 | Legacy / reference / infrastructure — keep, don't trust its PnL |
| ⛔ | Banked null — answered, do not re-litigate (see `PROJECT_STATUS.md` Findings) |

The `index.html` shortcut hub groups are: **Live ▾ · Vol ▾ · FX BT ▾ ·
Research ▾ · Equity ▾ · Gold ▾ · Systems ▾ · WIP ▾**.

---

## 1. FX BT ▾ — session-range / level backtests

| Page | Shortcut | Engine | Strategy | Status & analysis |
|---|---|---|---|---|
| `range-line-strategy.html` | FX BT ▾ → 🎯 Range-Line | `js/rangeLineAnalyser.js` → `perLineStrategy.js` | §13 spec: fade+follow across the full Asia/Monday range ladder, one held position per side/day, chandelier trail on both | ✅ **The proven edge.** Single-pair Sharpe ≈4.7–6 @2–3× cost, every year + every fold green, DSR 100%, OOS≥IS. Indices transfer even stronger (NASDAQ +7.34 @3×). Remaining: live wiring (`RANGE_EXTENSION_GUIDE.md` §11) + the one open angle (§14: live read as non-fragmenting filter/sizer). |
| `range-fib-backtest.html` | FX BT ▾ → 📏 Range-Fib BT | `js/rangeFibEngine.js` | Stripped base edge: limit-fade Asia/Monday fib extensions, costs on, M1 fills, no confluence layers | 📚 Honest base-edge validator — did its job; superseded as a *strategy* by Range-Line. Keep as the control. |
| `asia-range-backtest.html` | FX BT ▾ → 📐 Asia Range BT | `js/asiaRangeEngine.js` | Full live-stack replica: fib confluence + HMM + range-bias + stars/grades at Asia/Monday levels | 🔧 Zero costs anywhere in the file; WT gate reads the touch bar's own close. Its real job now is **live-parity comparison**, not edge discovery. ⛔ for gates: no spatial gate rescued the fade (banked). |
| `asia-range-analysis.html` | FX BT ▾ → 📊 Asia Analysis | (reads Asia BT results) | Per-cell win-rate explorer over the Asia book | 📚 Analysis UI. Remember its own rule: cells with <3 trades are noise — the eye-catching filtered win rates were selection bias (`TRADABILITY_REVIEW.md` §3). |
| `pivot-spike-backtest.html` | FX BT ▾ → 📍 Pivot Spike BT | `js/pivotSpikeEngine.js` | Go/no-go spike: do daily pivots (PP/R1/S1…) mean-revert on M1 after costs? | 🧪 Honest harness (costs, `summarizeTrades`, pessimistic fills) but **the verdict was never recorded**. One run answers whether a Sniper-style system is worth building — Q1 in the queue. |
| `regime-backtest.html` | FX BT ▾ → ⚡ Regime BT | regime bot replay (V1–V5) | Replays the live regime bots' logic with regime-colored candles | 🔧 Contaminated by the ADX one-bar-future shift in `indicatorCore.js`/`hmm5m.js` (`PLATFORM_REVIEW_2026-07.md` §1.4 — still unfixed). Fix, then re-run, before reading any regime card. |
| `backtest.html` | FX BT ▾ → 📈 Backtest Engine | `js/backtest.js` / `backtest-engine.js` | Browser CSV confluence backtester (the original) | 📚 Legacy exploratory; no IS/OOS, no cost bricks. |
| `strategy-lab.html` | FX BT ▾ → 🥊 Strategy Lab | `js/strategyLabEngine.js` | The 12-strategy gauntlet: famous retail strategies (EMA cross, RSI mean-rev, Turtle, Ichimoku…) as specs through one honest path — close-only signals, costs on turnover, ONE shared chronological split date, DSR across every variant tried, buy&hold + tsmom pinned | ⛔ **Banked null for the 12 famous strategies (first honest run, Railway, 2026-07-18)** — the pre-registered outcome landed exactly: **0/12 survive** the gate (48 variants tried, long/flat, 2bp, default 10-instrument universe, split 2020-04-03). The pattern was ONE pattern: every spec IS Sharpe ≈0.0–0.4 (dead for ~15 years of history), OOS 0.6–1.0 (long-bias catching the post-COVID window), none beat b&h OOS (1.13), and the video-famous EMA Cross 9/21 posted **IS 0.00, DSR 0.39** — its Bitcoin fame was beta, not edge. Most-consistent non-survivors: Golden Cross (DSR 0.86), RSI-2 (DSR 0.85) — still below b&h, still modest. **Caveat on the gate, not the verdict:** the b&h OOS bar was flattered by the split landing at the COVID bottom with NAS100/SPX500/XAU in the universe; an FX-only run would set a fairer bar (the DSR + dead-IS evidence kills the specs regardless). Do not re-litigate the 12; the Lab's standing job is gatekeeping NEW spec ideas. |
| `claude-backtest.html` | FX BT ▾ → 🔬 Claude BT | (AI-generated strategy sandbox) | Ad-hoc AI strategy experiments | 📚 Sandbox, not evidence — superseded for rule-based specs by Strategy Lab. |
| `backtest-viewer.html` | FX BT ▾ → ▶ | viewer | Trade replay | 📚 Infrastructure. |
| `bot-config.html#tab-backtest` | FX BT ▾ → 🖥 | Live Pair Monitor + Trade Journal | Live bot status (`backtest-monitor.html` is now a redirect — folded in) | 📚 Infrastructure. |

## 2. Vol ▾ — the σ-forecast family

| Page | Shortcut | Engine | Strategy | Status & analysis |
|---|---|---|---|---|
| `honest-forecast-harness.html` | Vol ▾ → 🔬 Honest Harness | `js/honestForecastEngine.js` | Daily band fade/follow/regime/regime_fade under honest fills, costs, IS/OOS | 📚→🔧 The discipline template (mark-to-close, costs on, real split) — **except** `breachReclaim`, which guarantees wins by construction (§1.3 of the platform review, still open). Fix fill-at-close, then it's clean. |
| `vol-backtest.html` | Vol ▾ → 📊 Vol BT | `js/volBacktestEngine.js` (v1, D1) | Original touch-fill band fade per EMA regime | 📚 **Read-only reference.** The optimistic engine the honest harness exists to correct; its PnL is not evidence. It remains the single source of truth for the vol math. |
| `vol-backtest-v2.html` | Vol ▾ → 📊 Vol BT v2 | `js/volBacktestV2Engine.js` → `forecastCore.js` | Adaptive selector (`dayTypeScore → selectStrategy`) vs fixed legs, A/B, all horizons | 🔁 The fill-bar-TP + `dynamicHL` causality bugs were **fixed 2026-07-02** (`60ece89`) — but those bugs contaminated exactly the adaptive-vs-fixed A/B cards. **Re-run the A/B suite** — Q2. |
| `weekly-vol-backtest.html` | Vol ▾ → 📅 Weekly Vol BT | `js/weeklyVolBacktestEngine.js` | Monday-anchored weekly band fade (HL50/75, OC levels), maeCalib stops | 🔧 D1-fallback books near-guaranteed Monday wins (§1.6) and z/SMI filters read the fill bar's close — both still open. Fix, then re-run — Q3. |
| `forecaster-backtest.html` | Vol ▾ → 📈 Forecaster BT | `js/volBacktestM1Engine.js` (v1 M1) | 8 static + 4 dynamic per-line levels, M1 walk, MFE trail — the per-line book the vol bot trades | 📚→🔧 The mature production reference (read-only by doctrine), but **costs default OFF at the route layer** (`spreadPct=0`) — gross reported as net. Fix at the server/reporting layer, not in v1. |
| `vol-forecast-bench.html` | Vol ▾ → 📐 σ Benchmark | bench route over `forecastCore` legs | σ-estimator / leg benchmark | 📚 Infrastructure. |
| `forecast-analysis.html` / `forecast-book-report.html` | Vol ▾ → 📊 / 📄 | analyser routes + R2 dataset | Level hit-rate analytics over the live forecast book | 📚 Research infra; the forward paper-trail that `SYSTEM_ASSESSMENT.md` P1 asks for effectively lives here. |
| `credit-leadlag.html` | Vol ▾ → 🚨 Credit Lead-Lag | `js/creditLeadLagEngine.js` | Does HY-OAS credit Δ lead NQ forward realized vol *beyond* vol's own persistence? (IC study, not PnL) | 🧪 Honest framing (IS/OOS IC vs the vol-predicts-vol benchmark). Verdict is computed at runtime and **not recorded anywhere** — Q4. A method, not a strategy: at best it gates/sizes something else. |
| `yield-coupling.html` / `yield-coupling-real.html` | Vol ▾ → 🧲 / 🏦 | yield-coupling studies | Rates-context lens feeding the daily brief | 📚 Context features, logged-but-inert by design (TDE candidates). |
| `trend-basket.html` | Vol ▾ → 📈 Trend Basket | `js/trendBasketEngine.js` | Diversified G10-vs-USD 12-mo trend basket, inverse-vol sized, weekly rebalance, costs on, IS/OOS | 🧪 New (2026-07-05). The first strategy here with replicated academic evidence *before* testing. Deliberately modest — a diversifier sleeve, not a wealth engine. Record the first IS/OOS run + its correlation to the range-line book — Q5. |
| `econ-trend.html` | Dashboard → 🌍 Econ Trend | `js/econTrendCore.js` + `js/econTrendEngine.js` | Cross-sectional ECONOMIC trend: fundamentals momentum vs USD (rate/10Y/unemp, pub-lagged) ranks ccys, long top-2 short bottom-2, monthly, vs a seeded random-ranking placebo | ⛔ **Banked null (2026-07-18, the one pre-registered run):** OOS Sharpe 0.09 at the 78th placebo pctl (bar: 90th), 4/9 OOS years positive. Machinery honest, signal empty. Recorded in `ECON_TREND_TEST.md` §Result; page stays as a read-only fundamentals-ranking viewer. No factor/window/K iteration (Q11 answered). |
| `credit-stress.html` | Dashboard → 🚦 Credit Stress | `js/creditStressCore.js` + `js/creditStressEngine.js` | CSI risk overlay: equal-weight z of (BBB−AAA, HY OAS, VIX) gates exposure ×1/×0.5/×0 at frozen 1σ/2σ tiers; benchmark = same gate on VIX alone; primary target = equal-weight long-ccy basket | ⛔ **Banked null (2026-07-18, the valid post-amendment run, full 2004+ history):** `no-gate` — CSI-gated OOS Sharpe −0.15 vs ungated −0.08 (and = VIX-gate). Gate helped IS (GFC era) and hurt OOS (fast V-crashes de-risk after the hit, miss the snapback). Page stays a read-only stress dashboard; wired into nothing (Q12 answered). Run 1 had been invalidated for data (ICE OAS restricted); legs are Moody's `BAA10Y`/`AAA10Y`. |

## 3. Equity ▾ — macro / NASDAQ backtests

| Page | Shortcut | Engine | Strategy | Status & analysis |
|---|---|---|---|---|
| `macro-equity-backtest.html` | Equity ▾ → 📊 Macro Eq BT | `js/macroEquityEngine.js` (v3) | Macro composite z (netLiq/curve/credit/realYield/ISM) → banded 100/75/50/25% equity allocation, 200-DMA filter, walk-forward, costs | 🔁 The WALCL millions-vs-billions bug (net liquidity ≈ raw Fed balance sheet) was **fixed 2026-07-02** (`bf5df25`) — every earlier result used a degenerate composite. Re-run; the engine's own pass gate is OOS Sharpe ≥ 0.5 — Q6. |
| `global-liquidity.html` (backtest tab) | Live ▾ → 🌊 Global Liq | `js/globalLiquidityEngine.js` | GLI level/impulse/cycle regime + cross-sectional FX liquidity ranking | 🔁 Same WALCL unit fix applies — re-run the GLI backtests post-fix (part of Q6). |
| `zscore-backtest.html` | Equity ▾ → ⚡ Yield Z-Score | `js/zscoreSpreadEngine.js` | Fade price back into the Asia range when the US-vs-local yield-spread z overshoots and price hits a fib extension | 🔧 Monthly-**average** yields forward-filled from observation date = the signal knows future yields for most of each month (§1.5), plus zero costs; only USDJPY's sign ever validated live. Apply the `PUB_LAG` pattern + costs, then re-run — Q7. Until then the z-tier edge may be an artifact. |
| `nasdaq-liquidity-continuation.html` | Equity ▾ → 📈 NQ Liq BT | `js/nasdaq*` 4-gate family (`nasdaqBacktest.js`) | Liquidity score → trend score → NY confirmation → continuation-exit, daily 2014-present, MC bootstrap + WF + OOS layer | 🧪 Well-engineered and causal, but **no honest OOS verdict has ever been committed**. One recorded run decides whether the family earns more work — Q8. |
| `nasdaq-threshold-backtest.html` | Equity ▾ → 🧮 NQ Threshold BT | `js/cogBacktestEngine.js` + gates | COG Threshold-1 daily gate system (the Gate1A+1B conjunction produced zero trades; Threshold-1 is the rewrite) | 🧪 Same as above — needs one committed, costed OOS run (part of Q8). |
| `cog-v2-engine.html` | Live ▾ → ⚙ COG v2 | `js/cogStateEngine.js` / `cogEventBacktestEngine.js` | Persistent-state COG day workflow (Setup/Risk/Trigger gates, NY-open deadline) | 🧪 Same family, same bar (Q8). |
| `nq-qmr-backtest.html` | Equity ▾ → ⚡ NQ-QMR BT | `server.js _computeNqQmr()` | Overnight→London→NY session continuation with 3 fade patches, 5,250-config optimizer | ✅→🧪 **Honest run committed 2026-07-28** (`QMR_WALKFORWARD_RESULT.md`): 4 contiguous years non-overlapping walk-forward, after costs — 433 OOS trades, mean OOS Sharpe 1.18, 6/8 windows positive, 36% CAGR at ~3.4× leverage. Costs and the gate lookahead were fixed since `TRADABILITY_REVIEW.md` §4 was written. Open: cost-critical (dead by 4bp), direction-vs-geometry control unrun (`PREREGISTERED_EVALUATIONS.md` §5b), S2/S4 measure as noise, SPX/DOW/DAX still have no backtest at all. |
| `liquidity-gate-backtest.html` | Equity ▾ → 💧 Liq Gate BT | net-liquidity + coherence gate | Does the net-liquidity gate improve equity exposure timing? | 🔁 Downstream of the same WALCL unit fix — re-run post-fix (part of Q6). |
| `vix-vol-carry-backtest.html` | Equity ▾ → 🌋 VIX Vol-Carry | P8 vol-carry harness | Short-VXX vol carry gated by vol cone + term-structure regime, circuit breaker, walk-forward | 🧪 Vol premium is one of the *replicated* premia (unlike most folklore here) — but this engine wasn't deep-reviewed in July. Verify costs/OOS discipline, then record the verdict — Q9. |

## 4. Research ▾ / Systems ▾ — pairs, hedging, portfolio panels

| Page | Shortcut | Engine | Strategy | Status & analysis |
|---|---|---|---|---|
| `hedge-signals-v2.html` | Research ▾ → ⚡ Signals v2 | `js/hedgeSignalV2Engine.js` | Cointegration-gated pairs mean-reversion (OU half-life, rolling β, money-matched legs, costs, OOS fraction) | 🔧 Honest construction, one code path for live+backtest — but the IS/OOS split is by **bar index, not calendar date** (§2.3), so the pooled OOS card isn't one chronological holdout. Cheap fix, then evaluate — Q10. |
| `hedge-signals.html` / `hedge-backtest.html` | Research ▾ → ⚡ Signals v1 / Systems ▾ → 📊 Hedge BT | v1 hedge overlay (inline in server.js) | Correlation-sized hedge bolted onto a directional trade | ⛔ **Banked null** — bleeds by construction (`HEDGING_VS_SPREAD.md`: a hedge overlay is a cost with no edge). v2 (spread-as-the-trade) is the successor. |
| `system-credit-equity/-yield-curve/-fx-carry/-fx-momentum/-gold-macro.html` | Systems ▾ → P2–P6 | display panels | Portfolio-system dashboards | 📚 Display layer — these terminate in HTML (`MACRO_DEEP_DIVE_2026-07.md`); the tested version of FX momentum is now **Trend Basket**. Carry stays deferred until swap-inclusive data exists (data-limits rule). |
| `results.html` / `diversification.html` | Systems ▾ → 📄 Tearsheet / Research ▾ → 🔗 Book Explorer | tearsheet + book explorer | Combined-book views | 📚 Remember `SYSTEM_ASSESSMENT.md` §2.4: the book's strategies share the Fed-liquidity factor; compute effective-number-of-bets before trusting combined DD. |

## 5. Gold ▾

| Page | Shortcut | Engine | Strategy | Status & analysis |
|---|---|---|---|---|
| `gold-backtest.html` | Gold ▾ → 📊 Gold BT | `js/gold-backtest-worker.js` | Browser-worker VuManChu confluence on uploaded CSV M1/M5/M30 | 📚 Legacy exploratory; no IS/OOS or cost bricks. Gold's *tested* strategy is the range-line book (gold is one of the 14 strong pairs). |
| `gold-lab.html` | Gold ▾ → 🔬 Gold Lab | gold-lab worker | Historical reconstruction / ML dataset builder | 📚 Research infra. |

---

## 6. The Questions Queue — one run each, answer later

Ordered by expected payoff per hour. Each is pre-registered: what "worked" and
"didn't" look like, so the answer can't be re-narrated.

| # | Question | How to answer | "Worked" looks like | "Didn't" looks like |
|---|---|---|---|---|
| **Q1** | Do daily pivots have any raw mean-reversion expectancy after costs? | Run `pivot-spike-backtest` across the pair set, record the card in this doc | OOS-positive expectancy, ≥30 OOS trades on ≥3 pairs | Flat/negative → close the Sniper idea for good |
| **Q2** | Does the adaptive selector still beat fixed legs after the 07-02 causality fix? | Re-run the `vol-backtest-v2` A/B suite (all horizons) | Adaptive ≥ best fixed leg on OOS `portfolioStats`, ≥30 OOS trades | Adaptive ≤ fixed → the selector story was the bug |
| **Q3** | Does the weekly fade survive once the D1-fallback and fill-bar filters are fixed? | Fix §1.6 + lag the filters, re-run `weekly-vol-backtest` | revHL50/75 OOS-positive after costs | Negative → weekly joins the banked nulls |
| **Q4** | Does credit-Δ beat vol-predicts-vol for NQ forward vol OOS? | Run `credit-leadlag`, record the IC verdict | OOS IC > benchmark IC with decent hit-rate → promote to a TDE gate | ≤ benchmark → keep credit as context only |
| **Q5** | What does the trend basket actually deliver, and does it diversify the range-line book? | Run `trend-basket`, record IS/OOS + correlation of daily returns vs the range-line book | OOS Sharpe ≈0.3–0.6 with low correlation → real sleeve | Negative OOS or high correlation → drop |
| **Q6** | Post-WALCL-fix, does the macro-equity allocator (and GLI/liq-gate) clear its own bar? | Re-run `macro-equity-backtest` + GLI/liq-gate backtests | Engine's own gate: OOS Sharpe ≥ 0.5 | Below → macro stays a dashboard, not an allocator |
| **Q7** | Is the yield z-spread edge real once publication lags + costs are applied? | Add `PUB_LAG` + costs to `zscoreSpreadEngine`, re-run | USDJPY (the one validated sign) survives OOS | Edge vanishes → it was the lookahead |
| **Q8** | Does the NASDAQ 4-gate / COG family produce a single honest, costed OOS number? | One committed run through its own MC/WF/OOS layer, verdict written down | OOS-positive after costs on the daily 2014– test | Not → archive the family (it's the biggest maintenance surface with the least evidence) |
| **Q9** | Is the VIX vol-carry harness honest (costs, OOS), and what does it show? | Review engine + one recorded run | Honest harness + OOS-positive → a second evidence-backed premium | Either fails → note and shelve |
| **Q10** | After a calendar-date IS/OOS split, do any cointegration pairs pass? | Fix `hedgeSignalV2Engine` split, re-run | ≥1 pair OOS-positive after 4bp/leg with ≥30 OOS trades | None → banked null beside hedge v1 |
| **Q11** | ~~Does cross-sectional fundamentals momentum (econ-trend) beat the random-ranking placebo OOS?~~ **Answered 2026-07-18: NO — banked null** (OOS Sharpe 0.09, placebo pctl 78%<90%, OOS years 4/9). See `ECON_TREND_TEST.md` §Result. | — | — | ⛔ |
| **Q12** | ~~Does the credit-stress composite (CSI) beat a VIX-only gate as a sizing overlay OOS?~~ **Answered 2026-07-18: NO — `no-gate`, banked null** (valid full-history run: CSI OOS −0.15 vs ungated −0.08; helped IS/GFC era, hurt OOS/fast-crash era). See `CREDIT_STRESS_TEST.md` §Result. | — | — | ⛔ |
| **Q13** | ~~Does FOMC-statement hawkishness (Δ vs prior meeting) predict the post-release daily dollar move?~~ **Answered 2026-08-20: NO — banked null, twice over** (pre-registered 3-stage test, 82–84 scheduled meetings 2016–2026: initial-reaction drift null t=0.32; Δlexicon-score vs next-day dollar t=−0.75, halves agree; LLM scorer concurs t=0.15). The scorers themselves are VALID — hawkish surprise is priced within 30 min (t≈2.0–2.6 concurrent) — there is just nothing left at any tradable horizon. CB sentiment engines formally **context-only** (the yield-coupling class). See `CB_SENTIMENT_PRICE_TEST.md`. | — | — | ⛔ |
| **Q14** | ~~Does the SIZE of the hawkishness surprise (\|Δscore\|) predict the SIZE of the post-release move?~~ **Answered 2026-08-20: NO — banked null** (\|R1\|~\|Δscore\| t=0.54, halves flip sign, Spearman 0.045; even \|R0\| size unrelated, t=−0.46; LLM concurs; zero-surprise meetings moved slightly MORE). The FOMC *day* is the vol event; the text delta adds nothing to magnitude. Any event-day forecaster widening should be calendar-based, not score-based. See `FOMC_SURPRISE_MAGNITUDE_TEST.md`. | — | — | ⛔ |
| **Q15** | ~~Is the +26bp post-FOMC 5-day USD drift FOMC-specific, or just the sample's USD trend?~~ **Answered 2026-08-20: FOMC-SPECIFIC — registered cell PASS** (event mean +26.3bp vs baseline −3.2bp on 2,094 non-adjacent same-shape windows; 99.8th placebo pctl vs a 95th bar; halves +26.3/+26.4bp across opposite dollar regimes). **Finding, not signal** — earns the harness test with per-leg costs + overnight financing. See `POST_FOMC_DRIFT_TEST.md`. | — | — | ✅ finding |
| **Q16** | ~~Does a "long USD basket 5 days post-FOMC" spec survive the harness (costs, financing, IS/OOS)?~~ **Answered 2026-08-20: NO — FAIL on the OOS bar, banked.** Costs did NOT kill it (net 24.7bp full-sample vs 1.6bp spread; breakeven financing 4.1bp/night); OOS 2022→ came in +19.7bp/59% win but **t=1.11 vs the ≥2 bar** on 34 events — statistical power, not economics. Not tradable; the honest path is a pre-registered zero-parameter forward paper track (~8 events/yr, decision size ≈ late 2029). See `POST_FOMC_HOLD_HARNESS_TEST.md`. | — | — | ⛔ |
| **Q17** | ~~Does OI-normalised speculative positioning (COT) predict forward 4-week returns?~~ **Answered 2026-08-22: NO — banked null.** Pre-registered two-sided test (book 9.2 says follow specs, DF-01 says fade them — the sign was left to the data), 8/8 instruments, 20y history, publication-lagged (report Tue → tradable following Mon open), 3,576 OOS rows 2018→. Pooled OOS rank-IC **−0.0317, block-bootstrap p=0.094** vs a p<0.05 bar. Halves agree in sign (−0.025/−0.041) and 8/8 qualify, but significance misses → FAIL, `no supported direction`. Two method errors found on reading (block resampling hit cross-sectional not time neighbours; 7 FX legs are ~one USD trade) BOTH flatter the signal, so the null is robust. GBP −0.23 vs GOLD +0.12 is an observation needing its own registration, not a claim. COT stays positioning **context**; `cot_filter` stays off. See `COT_POSITIONING_FACTOR_TEST.md`. | — | — | ⛔ |

**Not questions (already answered — do not reopen):** spatial gates on the Asia
fade, approachVel on range fibs, all six approach-read cell keys, the zone-walk
exit, the v1 hedge overlay, pooled cross-pair/cross-instrument Sharpe as an
acceptance number. See `PROJECT_STATUS.md` → *Findings already banked*.

---

*Analysis column sources: `PLATFORM_REVIEW_2026-07.md` (defect references §1.x/§2.x),
`TRADABILITY_REVIEW.md`, `RANGE_EXTENSION_GUIDE.md` §13–§15, `PROJECT_STATUS.md`,
and the July 2026 engine sweep. Fix commits referenced: `60ece89` (forecastCore
causality), `bf5df25` (WALCL units / safe-haven sign / fred KV key).*
