# Codebase Bug & Issue List

A correctness-focused review of the entire codebase (Python bots/backtests, Node `server.js`/`_worker.js`, browser JS engines, DecisionEngine, scripts). Findings are grouped by severity. Each item cites `file:line`, what's wrong, and a suggested fix. This is a **review list** — nothing here has been changed.

> Theme: the most damaging class of issue is **backtest lookahead / fill optimism** (multiple engines enter on bars they couldn't have known, or resolve same-bar SL+TP favorably). The second is **live-trading safety/math** (unauthenticated credential writes, cross-bot stop clobbering, pip-value sizing errors, an event-type mismatch that silently kills the Gold feedback loop). Fix those first.

---

## 🔴 CRITICAL — fix before trusting results or trading live

### Live trading / runtime crashes
1. **`server.js:855` — Null deref crashes hedge-signal generation on cold start.** `computeHedgeSignals` falls back to `entryZ = z` when `spreadResult === null` (Welford spread z not warmed up), but the Telegram block reads `spreadResult.dev` unconditionally → `TypeError`, caught by outer try, aborts the whole run. Every qualifying new hedge signal fails until 10 observations accumulate. Fix: `const bullet = (spreadResult ? spreadResult.dev : z) > 0 ? '📈' : '📉';`.
2. **`bot/main.py:346` — `requests` undefined (NameError) in beta-rebalance Telegram alert.** `requests` is never imported at module level (only `import requests as _req` locally elsewhere). Every HIGH-urgency beta rebalance alert raises `NameError`, swallowed by `try/except`, so the alert is silently lost. Fix: `import requests` at top, or use `_ur.urlopen`.
3. **`bot/main.py:787,793 — `_mt5_move_sl_to_be()` / `_mt5_close_all()` operate on ALL positions with no magic filter.** Iterates every position on the account and clobbers SLs to entry / emergency-closes everything — including positions owned by the other bots sharing the terminal. Cross-bot interference. Fix: filter `pos.magic == MAGIC`.

### Security
4. **`_worker.js:849-888 / 36 — `/api/kv/set` lets any unauthenticated caller overwrite bot credentials.** The write whitelist (`isAllowedKVKey`) includes `bot_credentials`, `regime_bot_v7_credentials`, `gold_bot_credentials`, etc.; the endpoint is `POST` with `Access-Control-Allow-Origin: *` and no auth. Anyone can overwrite stored broker credentials/config. Fix: require a shared-secret/auth header for `/api/kv/set` (at least for `*_credentials`/`*_config` keys).

### Backtest lookahead / fill optimism (results not reproducible live)
5. **`js/backtest-worker.js:639-650,703 — Candle-confirmation peeks at future bars.** With `candleConfirmN>0` the entry decision reads `entryBars.slice(_bi+1, _bi+1+N)` (bars that close *after* the touch) but still fills at the touch bar's `conf.price`/`barCloseTs`. Future-data leakage. Fix: advance `entryTs` and the fill to bar `_bi+N`.
6. **`js/gold-backtest-worker.js:677-693 — M1 management scan starts before entry.** `m1Start = lowerBound(m1, bar.ts)` begins at the *open* of the signal M5 bar, but entry is on `bar.c` (its close). Positions can be stopped/TP'd on price action that preceded entry. Fix: start the M1 scan at `bar.ts + 300000`.
7. **`js/gold-backtest-worker.js:256-269` + **`js/asiaRangeEngine.js:271-305` — Same-bar TP-before-SL booked as a win.** TP1/TP2 is checked before the SL test on a bar whose range spans both; a bar that hit both is recorded as a win/partial instead of a loss. asiaRangeEngine also resolves SL/TP on the *fill bar itself* (intrabar lookahead) and always tests SL before TP. Fix: resolve same-bar both-hit pessimistically; start SL/TP evaluation on the bar *after* fill.
8. **`VolRangeForecaster/vol_backtest.py:298-355,454-502 — Dynamic-anchor strategy uses the full-session extreme as entry anchor.** SELL `entry = low*(1+hl_median%)`, BUY `entry = high*(1-hl_median%)` where `low`/`high` are the *completed day's* extremes — unknowable at order time, and self-fulfilling (TP=open sits in the zone price already traversed). Produces fake win rate. Fix: anchor off a *prior* bar's extreme or simulate intrabar with the running extreme.
9. **`portfolioBacktest/portfolio_backtest.py:1091-1118 — Cointegration screen runs over the entire backtest window (in-sample selection bias).** Pairs are admitted for the whole period because they were cointegrated when measured *through the end*. Headline P&L is inflated. Fix: roll the cointegration test on a trailing window / screen only on data prior to each rebalance.

### Data-pipeline correctness
10. **`Gold/journal.py:133` vs `Gold/optimiser.py:110-127`, `Gold/ml_model.py:132-147`, `Gold/replay.py:183-195` — Event-type mismatch silently kills the entire Gold feedback loop.** The journal writes closed trades as `type:'TRADE_CLOSED'` (with `reason` = `TP2_HIT`/`SL_HIT`), but all three consumers match `etype == 'TP2_HIT'/'SL_HIT'/'CLOSE'` and never `'TRADE_CLOSED'`. Result: optimiser always says "too few trades," ML never sees a label, replay shows 0 wins/losses. Fix: branch on `etype == 'TRADE_CLOSED'` + `ev['reason']`, or emit discrete events.

### Live allocation math (sign/scale)
11. **`GlobalLiquidity/data.py`/`config.py` — CNY block double-converts a USD series.** `TRESEGCNM052N` is already USD but gets `fx_inverted` (×1/USDCNY), dividing the second-largest GLI weight (0.25) by ~7. Fix: `fx: None` for the CNY block.
12. **`MacroEquityBot/macro_equity_bot.py:530` vs `:55` — GOLD `inverted` flag contradicts itself.** Active-instrument dict sets GOLD `inverted:True` while `INSTRUMENT_DEFS` says `False`; `fred_signal.py:304` negates the score for inverted instruments, so bullish macro *reduces* gold. Backwards. Fix: reconcile to `inverted=False`.

### Live/backtest convention mismatch (invalidates tuning)
13. **RegimeV2 consensus convention mismatch (live vs backtest).** `regime_bot_v2.py:723-729` counts the pair itself and divides by `consensus_total-1`; `backtest_v3.py:484-528,1235` builds consensus on an "others" basis but passes `len(signals)` as the total. The two paths compute the consensus gate/score on different bases, so backtest results don't reflect live behavior. Fix: standardize on "exclude self" everywhere and pass a matching total.

---

## 🟠 HIGH — material correctness or safety

### Live trading
14. **`bot/position_hedge_bot.py:454 — Unguarded `mt5.account_info().login` can crash startup, and the bot never logs in / pins to an expected account.** In `--live` it trades on whatever account the terminal happens to be on. Fix: guard `None`, and verify the account matches expected (as `hedge_bot.py`/`regime_bot.py` do).
15. **`bot/hedge_bot.py:347-352`, `position_hedge_bot.py:345-350` — IOC filling-mode branch dropped.** Only `&1` (FOK) and `&4` (RETURN) are checked; the `&2` (IOC) branch is missing (the main bot checks all three). On a broker that supports only IOC the order may be rejected. Fix: 3-way bit check.
16. **`RegimeV7/regime_bot_v7.py:1177 — Orphan/adopted position with no SL (`sl==0`) → instant erroneous close for shorts.** The price-based SL check treats `pos['sl']=0` as SHORT `price_now >= 0` (always true). Fix: guard `pos['sl'] > 0` before the comparison.
17. **`RegimeV2/regime_bot_v2.py:1132-1143`, `RegimeV4:1036-1050` — Paper-mode SL is never simulated.** The X5 SL check is gated by `if HAS_MT5 and not paper_mode`, so paper V2/V4 positions never honor the stop (unlike V7). Paper P&L overstates protection / unbounded paper losses. Fix: add a price-based SL check that also runs in paper mode.
18. **`bot/modules/cot_filter.py:54 — `:+d` format crashes on float COT values.** `f'{lev_net:+d}'` raises `ValueError` when `lev_net` is a float (common from JSON/deltas), breaking the module for that pair. Fix: `int(lev_net)` or `:+.0f`.
19. **`backtestSystem/risk.py:86-112 — JPY pip-value sizing is wrong (~40-60% over-risk).** JPY pairs use `1000*0.01 = $10/pip` but the true value is ~$6-7/lot (1000 JPY ÷ USDJPY). Over-sizes every JPY position. Fix: divide by the quote rate or pull contract specs from `mt5.symbol_info`.
20. **`DynAnchorBot/dyn_anchor_mt5_bot.py:970,1109 — Index/commodity CFDs fall back to FX pip value 10.0.** US2000/SP500/DAX/FTSE/US30 have no `_PIP_VALUES` entry, so journaled `pnl_pct` magnitude is wrong. Fix: use `mt5.symbol_info` tick value/contract size.
21. **`TradingBot/dyn_anchor_bot.py:121-122 — Incomplete trailing daily candle leaks into σ_d/regime.** `get_d1_candles` checks `complete` against `data["candles"][-1]` (raw) while iterating the parsed list (different length), so the unfinished current-day candle can enter `closes`. Lookahead. Fix: filter completeness per-candle.

### Backtest lookahead / parity
22. **`js/analysis-worker.js:631-639,204-214 — Parameter sweep uses truncated MFE/MAE.** MFE/MAE tracking stops at the first SL/TP exit, then the sweep re-classifies at wider stops using that truncated path → under-reports stop-outs for wider stops. Fix: track full-path MFE/MAE independent of the original exit.
23. **`js/analysis-worker.js:478-479 — Index-space mismatch substitutes the wrong bar.** On `simBi < 0` it passes `bi` (index into a differently-filtered array) into `simulateTrade(simBars,…)`. Fix: skip the touch instead.
24. **`js/analysis-worker.js:472 — Inverted monthly-bias alignment.** `((dir==='short') === (bar.c > monthOpen))` marks a short "aligned" when price is *above* the open (bullish). Fix: compare against `bar.c < monthOpen`.
25. **`js/asiaRangeEngine.js:579-612 — WaveTrend gate uses the touch bar's own closed data (intrabar lookahead).** Fix: evaluate WT/divergence on the last fully-closed bar before the touch.
26. **`js/signal.js:895-904 (get5mEMAAlignment) — EMA computed on newest-first data (backwards).** Everywhere else `bars5m` is newest-first and the WT path reverses; this function seeds on the newest bar and treats the oldest as "last." The `last > ema` alignment test is inverted. Fix: reverse to oldest-first (drop the forming bar) before computing.
27. **`js/macroEquityEngine.js:265-266 — Month return drops the month-to-month gap.** `monthRet = (monClose-monOpen)/monOpen` measures intramonth only; non-tradeable. Fix: use `close[i-1]→close[i]`.
28. **`js/gold-backtest-worker.js:894-900,728 — Entry filled at the signal bar's own close.** Gates evaluated on bar `i`'s completed data, fill on the same `bar.c`. Fix: fill at `m5[i+1].o`.
29. **`scripts/build_corr_history.py:305-307 — Walrus + `or 0.0` conflates degenerate/insufficient correlations with a true 0.0.** The dangling `pearsonCorr := …` is unused, and zero-variance/`None` results are coerced to a real `0.0` and averaged into the matrix. Fix: handle `None` explicitly, don't average degenerate zeros.

### RegimeOptimizer (parameter selection driven by wrong metrics)
30. **`RegimeOptimizer/backtester_v4.py:378-379`, `backtester_v1v2v6.py:405-406,525-526,712-713` — Spread→% uses a split-dependent reference price.** `spread_pct = spread_pips*pip/ref_price*100` with `ref_price` = first close of the slice; same config costs differ on train/val/test, and XAU is badly mispriced. Fix: convert per trade using `pos["ep"]`.
31. **`RegimeOptimizer/backtester_v4.py:264-265 — V5/V6 decay constants are M1-calibrated but run on 30m bars.** `decay = 1-exp(-regime_bars/180)` saturates ~30× too slowly in MTF mode → `decay_exit` gate effectively dead. Fix: scale by `mtf_minutes` or compute in real time units.

### DecisionEngine
32. **`DecisionEngine/decisionEngine.js:259 — "High-confidence" risk multiplier actually shrinks size.** `Math.min(state.riskMult*(0.75+conf*0.25), 1.25)`; for `conf∈[0.7,1.0)` the factor is `<1.0`, so it scales *down* despite the comment saying scale up. Fix: use a factor ≥1 floored at `state.riskMult`.
33. **`DecisionEngine/decisionBacktest.js:87-97 — Backtest `volState` diverges from live.** `backtestVolState(0, atrPct)` hard-codes `atrPips=0` (dead param) and returns EXTREME at `atrPct>=90` alone, while live requires `pct>=90 && impulse>30`. Backtest tags far more bars vol-gated than live → backtest↔live parity broken. Fix: align the thresholds.
34. **`DecisionEngine/decisionInputs.js:139-140 — Event label/timing mismatch + brittle impact string match.** `label` is from `inNext4h[0]` (any impact) while `minutesUntil` is from the nearest *high*-impact event — can be different events; exact `=== 'high'` string match is fragile. Fix: derive label from the timing event, normalize impact comparison.

---

## 🟡 MEDIUM — real but lower impact / analytics distortion

35. **`bot/backtest.py:180-189 — MFE/MAE uses the full exit-bar high/low**, inflating `mfe_r`/`exit_leak_r` (which drive strategy conclusions).
36. **`bot/hedge_bot.py:300-304 — Leg-B sizing multiplies pip-value normalization by `abs(corr)`**, which is not a standard dollar-neutral hedge ratio; systematically under-hedges leg B. Confirm intended pairs math.
37. **`bot/modules/beta_estimator.py:241-242 — Kalman re-feeds the last 5 bars every 120s cycle** (H4 bars close every 4h), driving the posterior toward those bars and shrinking variance (overconfident beta). Fix: feed only genuinely new bars.
38. **`bot/regime_bot.py:1028 — vol-spike gate uses signed `vol_z`** (`> vol_z_max`), letting large *negative* (anomalous) z through. Confirm intent vs `abs(vol_z)`.
39. **`RegimeV2/regime_bot_v2.py:1168-1175 — X3 multi-bar slope exit can fire on a single bar** (`slope_bars=2` yields 1 diff), defeating multi-bar confirmation. Fix: require `len(recent_slopes) >= slope_bars`.
40. **`RegimeV2/bocpd.py:129-141 — Change-point mass dropped when `cp_norm <= 1e-300`**, understating `change_prob` exactly at a true changepoint. Add a unit test.
41. **`RegimeV2/macro_overlay.py:99-109 — VIX backwardation gates are dead code** (`_vix3m`/`_ratio` always `None` → `is_backwardation` always False), silently disabling V2 E10/X9. (V4 uses `is_stress`.)
42. **`RegimeV2/backtest_v3.py:175,201,637 — Backtest loop starts at `i=30` but indicators need ≥252 bars** (1H EMA span, 100-bar vol window) → early traded bars use unreliable regime/vol_z. Fix: start after the longest window.
43. **`RegimeV4/regime_bot_v4.py:1100-1101,1162-1167 — RANGE timeout counts poll ticks, not regime bars.** "30 bars" = 15 min wall-clock regardless of the 5m regime cadence (V7 buckets correctly). Mislabeled unit.
44. **`portfolio_backtest.py:271-293 — Combined pair P&L `/(1+hr)` is not a coherent capital model**, and the compounded equity curve (`r_combined`, line 539) doesn't correspond to any real allocation. Define the capital base explicitly.
45. **`portfolio_backtest.py:168-193 — Spread uses a time-varying rolling beta but z-scores it against an expanding mean**, so the "mean-reversion" signal partly tracks beta drift. Use a consistent beta for spread and its mean/std.
46. **`portfolio_backtest.py:553-559 + 539 — Sharpe uses `sqrt(n_trades/years)` and compounding over *overlapping* concurrent trades** (up to `max_positions` simultaneous), violating IID → inflated Sharpe. 
47. **`backtestSystem/engine.py:196-197 — H1 aggregation takes every 12th 5m bar's close with no gap handling**; missing bars desync the stride from real hour boundaries.
48. **`backtestSystem/indicators.py:26-39` vs `RegimeOptimizer/engine.py:143-152 — Two inconsistent ATR implementations** (different seeding; the optimizer freezes ATR on `tr==0` flat bars → upward bias in quiet periods). Optimized SL multipliers won't map to live.
49. **`macro-regime-conditional/macro_equity_backtest.py:466-489 — Weekly `W-FRI` resample `.first()` can take Tuesday's open on Monday-holiday weeks** while labeling it a full-week return.
50. **`macro_equity_backtest.py:343-352 — Same `WEEKLY_LAG=5` applied to daily FRED series over-lags daily macro inputs by a week.** Conservative (no lookahead) but degrades signal.
51. **`macro_equity_backtest.py:548,560 — Trade-log open detection via `'entry' in dir()`** is a fragile sentinel; a second open without an intervening close overwrites `entry`. Fix: `entry = None` before the loop, test `is not None`.
52. **`backtestSystem/journal.py:168-177 — Exit-type inference can mislabel BE/SL/TP** when `tol = max(sl_dist*0.1, pip*2)` is wide; BE check is last. Affects journal analytics.
53. **`Gold/main.py:934-937 — Live outcome classification is biased to TP2 / mislabels TP1-then-BE exits as `SL_HIT`**, skewing win-rate stats the optimiser relies on.
54. **`Gold/main.py:406-414 — `_calc_sl_tp` ATR-floor can move SL past the structural anchor** and recompute TP off an inflated distance; displayed R:R no longer reflects structural invalidation.
55. **`Gold/optimiser.py:80-127`, `ml_model.py:124-147 — Zone-entry matching by `zone_id` collides on reused IDs.** Deterministic `zone_id` (TF+dir+rounded swings) means re-traded zones share a key; interleaved entries/closes pair the wrong SL/TP → corrupt `pnl_r` labels. Fix: key by `zone_id + entry timestamp` / FIFO queue.
56. **`GlobalLiquidity/sizer.py:66-72 — Vol-target sizing drops genuine zero-return weeks** (`seg = seg[seg != 0]`), biasing the realized-vol estimate. Fix: filter NaNs only.
57. **`GlobalLiquidity/backtest.py:70-74 — Turnover cost booked in the same period as the prior book's P&L** (misaligned by one period), distorting Sharpe/vol. Fix: align cost with the position that earns the return.
58. **`GlobalLiquidity/gli.py:99-102,140-147 — Aggregate GLI z adds weight for NaN→0 blocks**, diluting the headline toward neutral. Fix: accumulate `wsum` only for valid-z blocks.
59. **`MacroEquityBot/macro_equity_bot.py:337-340 — Rebalance threshold compares rounded-lot deltas**, causing churn / stuck positions and blocking legitimate trims. Fix: compare target vs current allocation fractions.
60. **`MacroEquityBot/macro_equity_bot.py:403 — `is_last_trading_day_of_month()` fires one day early** (returns True for last *and* penultimate weekday), so the dedupe skips the true last day.
61. **`MacroEquityBot/fred_signal.py:186-205 — INDPRO substituted for discontinued NAPM without rescaling**; a trending level run through a ~50-centered z-score becomes persistently bullish. Fix: use INDPRO YoY% or drop the factor and renormalize.
62. **`Zoo/asia_range_backtest.py:236,331-334` & `TradingBot/dyn_anchor_bot.py:382-405 — Backtest fills at the level ignoring gaps; the two engines disagree on same-bar SL+TP tie-break.** Fix: fill at `max/min(price, bar_open)`, use the same precedence in both.
63. **`server.js:9534-9557,9851-9872 — QMR schedulers trigger on exact `M===5`/`M===0`** with an unaligned 60s interval; event-loop drift can skip a gate for the day (self-heals next day). Fix: widen to a window gated by the `sent*` flags.
64. **`server.js:9007-9053 — `computeSessionStats` auto-warm checks in-memory state (always empty after restart), not KV freshness**, re-triggering a 3-5 min 5-year H1 pull on every redeploy. Fix: check KV freshness like the other two warm blocks.
65. **`server.js:5346,5351 / 2269,2271 / 3768,3770 — Per-trade Sharpe annualized by `sqrt(tpy)`** is inconsistent with the daily-returns Sharpe at 5346 and biases the optimizer toward high trade counts. Standardize on daily-return Sharpe.
66. **`server.js:2204-2220 — D1 date bucketing shifts the 20:00+ candle to next day, but pagination `from` uses the raw time**, so a distinct trading day at a page boundary can be dropped by the `b.date`-keyed dedup.
67. **`scripts/fetch_m1_oanda.py:129-150 — Pagination can stall/loop** (no guard that `cursor` strictly advances) and the 7-day empty-chunk skip can jump over real bars after a gap. Fix: track previous cursor, smaller gap-skip.
68. **`DecisionEngine/decisionInputs.js:115-117 — COT percentile divides by `length` (not `length-1`) with `findIndex(>=)`**, so an all-time-high reading never cleanly crosses the `>0.9` extreme thresholds in `decisionEngine.js:217-219`.
69. **`js/oi.js:101-103,444,462-465 — `pair.includes('JPY')` over-broadly marks JPY *crosses* (GBP/JPY, EUR/JPY…) as inverted CME futures**, corrupting their strikes/basis; `futuresIsInverted` and `processOIData`'s `isJpy` use *different* JPY logic within the same flow.
70. **`js/gold-app.js:277-283 — Wrong bias token breaks all gold confluence alignment.** Passes `'bullish'/'bearish'/'neutral'` but `confluences.js:152-160` only matches `'LONG'/'SHORT'/'NEUTRAL'`, so every gold level is flagged `opposing` and `sizeAdj` is mis-derived. Fix: map to canonical tokens.
71. **`js/main.js:736-739 — Unguarded `S.asiaRangeData[_statusSym].confluences`** (no `?.`) throws when a pair's range data is empty, rendering the whole dashboard as a "Load error" card. Fix: optional chaining.
72. **`levels.js` (root) `computeWeeklyPivots:514-523 — `slice(-7,-2)` discards two *completed* days** (the partial bar was already filtered out), so weekly pivots use ~3-day-stale H/L/C. Skews server-computed R1/R2/S1/S2.
73. **`js/macro.js:760-765,850 — Kalman loop `i < chron.length-1` excludes an extra close** beyond the intended one-step hold-out, measuring deviation against a staler estimate.
74. **`js/gold-backtest-worker.js:518-543 — `buildWfoWindows` overlapping IS windows** (advances by `oosMonths` from the IS end), weakening walk-forward independence.
75. **`js/macroEquityEngine.js:451 — OOS walk-forward seeds with the last *training* month's signal**, biasing OOS Sharpe.
76. **`js/volForecastScheduler.js:612-625 — Daily-run gating uses in-memory `_lastRunDate`**; restart re-runs the same day or skips a day. Fix: persist to KV.

---

## 🟢 LOW — robustness, consistency, cosmetics

77. **`bot/main.py:1304 — `hash(str(exec_cfg))` is key-order sensitive**, can thrash RiskGuard rebuilds (harmless, carries state).
78. **`hmm.js:170-171 — Dead O(T²) `den` computation** in Baum-Welch (result discarded; `denI` is the real denominator).
79. **`js/confluenceModules.js:893 — `sd === 0` float guard** won't catch near-zero sd → huge/Inf z. Use an epsilon.
80. **`js/levels.js:301`, `js/oi.js:335 — `Math.sign(0)` zero-crossing detection** registers spurious/missed GEX flips; `renderGammaChart` does it correctly — match that.
81. **`js/oi.js:235-237 — Change-table heuristic discards OI changes ≥10,000** (too tight for index futures / active strikes) → flow reads flat.
82. **`js/oi.js:759 — `wallRow` "active" proximity band reconstructs ≈price**, so it's true whenever price is below a call wall / above a put wall, not "near" it (display only).
83. **`js/levels.js:340-343 — Breakout-prob day fraction uses UTC calendar midnight, not the session/anchor open** → mis-estimated `timeLeft` for non-00:00-anchored instruments.
84. **Duplicate `getYesterdayLevels`/`getPrevWeekLevels` copy-pasted across `js/levels.js:103-138`, `js/render.js:62-101`, `js/alerts.js:214-240`** — the alerts copy already diverges (inline weekend filter vs `filterTradingDays`), so the alert star rating can differ from the dashboard.
85. **`js/alerts.js:382` vs server `levels.js:838 — `ai_entries_*` KV key written with two different shapes** (`{entries,meta}` vs `{data,timestamp,...}`); consumers reading the wrong shape get `undefined`. Confirm the Python bot reads both.
86. **`Gold/ml_model.py:280 — Train/serve feature skew**: at predict time `vu_components` defaults to 2 and composition flags differ from the entry-time values used in training.
87. **`DynAnchorBot/dyn_anchor_mt5_bot.py:343` vs OANDA sibling — EWMA variance seed differs** (`rets[0]**2` vs 20-sample variance), so "exact-match" bots produce different hl50/hl75 levels.
88. **`vol_range_forecast.py:109`, `vol_backtest.py:160 — EWMA variance seed `log_returns[0]**2`** can latch a huge first/gap return as the seed (decays under λ=0.94, but first forecast can be wild).
89. **`RegimeOptimizer/backtester_v4.py:711-755 — Win-rate and profit-factor use different trade populations** (BE excluded from losses but counted in the WR denominator); these gate pruning. Also `t_span:747-749` mixes last-exit with first-entry after sorting by exit_ts → wrong trades/year.
90. **`RegimeOptimizer/optimizer.py:488,501` & `reporter.py:226-234 — Optuna `seed=42` with `n_jobs>1` gives false reproducibility; the `--equity` report tab references a flag that doesn't exist** (dead tab).
91. **`analysis/trade_analyzer.py:759-767`, `asia_range_backtest.py:331-333 — Win-rate excludes BE/EOD from the denominator while expectancy/net include them** → side-by-side numbers describe different samples.
92. **`Gold/modules/confluence_scorer.py:176 — Flat `-1.0` HTF counter-trend penalty** can drive `score` negative and sort a zone below empty zones. Confirm intended.
93. **`scripts/fetch_m1_oanda.py:125-127 — Naive/aware datetime mixing** (`365*years` ignores leap years; `.replace(tzinfo=None)`); whole chain depends on never introducing a tz-aware value.
94. **`scripts/parse_regime_logs.py:531 — Upload failures swallowed with no retry/backoff**; one transient timeout permanently marks a pair FAIL.
95. **`server.js:6972-6983 — `nlcJobs.get(jobId).phase = …` without re-checking existence** (theoretical null-deref after stale-purge).
96. **Many `kv.put(...).catch(()=>{})` sites (`server.js:8136`, `_worker.js:461,1099,1127) — silent KV write-error swallowing** makes outages invisible. Log at warn.
97. **`_worker.js:675 — `/api/fred` freshness check is dead** (destructures `t` but never uses it; returns KV regardless of age despite the comment).
98. **`js/volForecastScheduler.js:616,73 — `parseInt` without radix/NaN guard** → `NaN` hour gate; `:218 — hard `lnHL>0.15` GK filter drops legitimately volatile 15-min bars; `:399-404 — session tracking anchored to `now` not the forecast `session_date` (one-day mismatch 22:00-24:00 UTC).
99. **`js/macro.js:308,372,403 — Falsy-zero `prev` guards** convert missing prior data into a fake flat "0" reading. Use `!= null`.
100. **`js/macroEquityEngine.js:90,348-349 — `round4(Infinity)` returns 0**, so an all-winning subset reports profitFactor/calmar = 0 (best rendered as worst). Map non-finite to null.
101. **`js/backtest-worker.js:447-449,480 — Level keys use `toFixed(5)`** (wrong precision for JPY/XAU 3/2 digits) → mis-keyed re-entry/sweep tracking.
102. **`js/analysis-worker.js:54 — `if (!isFinite(o) || h<l)` doesn't `isFinite`-check h/l/c**; NaN OHLC passes and propagates into stats.
103. **`js/compass.js:223,589-590,663,673,678 — "5-day" momentum applied to monthly/weekly series** (wrong horizon label); `null < 2`-style color ternaries misclassify missing data.
104. **Requirements: no upper bounds anywhere** (`numpy`, `pandas`, `yfinance`) — no current conflict, but future numpy 2.x can break silently. Consider caps.

---

## Cross-cutting recommendations
- **Pick one bar-execution convention** (enter at next-bar open; resolve same-bar both-hit pessimistically; never read bars after the decision bar) and apply it across *every* JS/Python backtest engine. Most Critical/High lookahead items are the same mistake repeated.
- **Centralize pip/point/contract values** from `mt5.symbol_info` instead of hand-coded tables (fixes JPY sizing, index CFD pnl, XAU spread%).
- **One Sharpe methodology** (daily portfolio returns × √252) everywhere; the per-trade-annualized variants are not comparable and bias optimizers.
- **Standardize the journal event contract** (`TRADE_CLOSED` + `reason`) and update all consumers; add a smoke test that round-trips a closed trade through optimiser/ml/replay.
- **Authenticate `/api/kv/set`** and remove credential keys from the public write whitelist.
- **De-duplicate** the `getYesterdayLevels`/`getPrevWeekLevels` and ATR/EMA implementations into shared modules to stop drift.
