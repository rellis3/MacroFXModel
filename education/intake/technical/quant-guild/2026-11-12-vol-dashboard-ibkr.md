# How to Build a Volatility Trading Dashboard in Python with Interactive Brokers

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=19-rFVgJVkg |
| ReelScribe id | j573cm009y5zkgxcfyrv7kfg2d8j3k0j · ~2.5 h (~110k chars) |
| Notebook | `2025 Video Lectures/41. How to Build a Volatility Trading Dashboard in Python with Interactive Brokers/` (`dashboard.py` = the video build, `option_trading_dashboard.py` = extended version with logged "insights"; no notebook) |
| Recorded | unknown (2025 lecture series) |
| Processed | 2026-11-12 |

## Lesson
A Tkinter app that pulls two years of IBKR daily `OPTION_IMPLIED_VOLATILITY` for one stock or ETF and asks one question:
does today's implied vol predict the average implied vol over the next 30 trading days? It regresses forward-30-day mean
IV on current IV and draws the line against y = x. Where the line crosses y = x it splits the sample into "high" and
"low" vol regimes and fits each side again, using the forward-minus-current change. It also shows a 252-day rolling IV
percentile with fixed bands (>80% "expect mean reversion down", <20% "up"). He frames it as "a statistical basis" for
long or short vol and a "starting point". Costs, delta hedging and the position's own carry "can eat away at any
potential profits". About 80% of the video is GUI code. The plea to code without AI is the stated purpose.

## Approach
- **Question / framing**: prediction of a *level* (future IV), not of a P&L. The null is y = x ("no change"). (QG)
- **Model choice and why**: single-variable OLS (`scipy.stats.linregress`), R² as the measure: "the higher the R squared
  value, the more profound this effect". (QG) Consistent with his tier list (linear regression S-tier).
- **Validation**: none out of sample. The regime split, both regressions and the percentile bands are all fitted on the
  same two years that are then plotted. He notes non-stationarity well: "This regime split is not a stationary value…
  even if I change this window, this value is going to change… Nothing is converging." (QG)
- **Statistics**: R² per regime (NVDA low 0.057, high 0.387) read as effect strength; no CI, no p-value shown, no
  overlap correction.
- **Costs**: named as the main reason it may fail, not modelled. (QG)
- **Failure modes he names**: fixed thresholds (0.40 / 0.15 IV) are wrong per ticker; use the ticker's own percentiles
  (left as an exercise). Also "the model is wrong, the expectation is wrong… But that does not preclude us from making
  money." (QG)

## What the code actually does
- `reqHistoricalData(..., whatToShow="OPTION_IMPLIED_VOLATILITY", barSizeSetting="1 day")`, then
  `implied_vol = close * sqrt(252)`. On our account IBKR returns this series **already annualised** (QQQ close ~0.21 in
  `analysis/output/rates-vol-gap/ibkr_iv/QQQ_OPTION_IMPLIED_VOLATILITY.csv`). With default settings, ×√252 would show
  QQQ at ~330%. His screen shows NVDA at 44%, so either his TWS is set to daily units or the scaling is wrong. It
  contradicts his own warning in video 84 (annualised units, "don't scale twice").
- Forward target: `rolling(30, min_periods=1).mean().shift(-30)` = the mean of days t+1…t+30. Correct direction, but each
  day's target overlaps the next 29 days' targets, so the ~470 rows carry about 16 independent 30-day windows. `linregress`
  p-values and the R² "strength" reading assume independence.
- Regime split = `intercept/(1−slope)` from the full-sample fit, then each side is regressed again on the same data.
  The threshold is chosen in sample. Regressing (forward − current) on current builds in a negative slope through
  regression to the mean and noise in the current reading, so "high regime all negative, low regime all positive" is
  partly true by construction.
- Percentile: `rolling(252).rank(pct=True)` (point-in-time, fine); the 25/75 bands on the chart are full-sample quantiles.
- "Edge" is judged on IV changes, which are not a tradeable P&L. A straddle or variance position earns realised minus
  implied, minus hedging costs. No realised vol appears anywhere.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | High IV tends to be followed by lower forward IV, low by higher: "volatility is a mean reverting process" (QG) | mechanism | PARTLY: our forecasts already use mean-reverting σ (weekly/monthly reverting lines, `forecast-pick`); IV level → forward IV itself never tested as a signal. `short-vx-rule` prereg tests a ratio flag for shorting VX against random entry (it earns the roll anyway) |
| 2 | High-vol-regime R² 0.387 ⇒ "maybe there's a statistical basis for us to trade… going short vol" (QG) | trading | UNTESTED here; the R² is in sample on overlapping targets, see above |
| 3 | IV percentile >80% ⇒ "expect mean reversion down" (QG) | trading | PARTLY: `iv-over-rv-wider` and `vol-curve-front` show level/shape set *range width*, not a tradeable vol direction; `vix-calculus` B (VRP integrals) UNDERPOWERED |
| 4 | Thresholds must be per ticker (own percentiles), not fixed levels (QG) | method | ALREADY DO: σ-percentile splits, 252-day ranks (`vvix-ratio-range` flags) |

## What we could learn
- **Overlapping forward windows inflate the fit**: his dashboard is the textbook case. REPEAT of method lesson #11
  (DON'T DO as a written rule; `data-rules/references/lookahead-and-oos.md` has no line). Second QG source for #11, but
  this time he commits the error rather than teaching the rule.
- **Regime threshold chosen on the data it is then tested on**: ALREADY DO the opposite. Cut-offs are fixed in advance
  (`vol-curve-front` "cut-offs fixed in advance"; prereg §3; lockbox in data-rules).
- **Benchmark = y = x (no change)**: DO BETTER, and the gap is worth naming. For IV the honest benchmark is what the
  market already prices for the future IV: the VX futures curve / VIX term structure. Mean reversion of spot IV is the
  very reason the curve sits in contango. We already use that benchmark (`vix-ratio-vx-futures`; `short-vx-rule`
  random-entry and roll).
- **Judge "edge" on a tradeable P&L, not on the forecast variable**: ALREADY DO (vix-ratio moved from spot VIX to VX
  futures at Garin's prompt; the execution feasibility gate).
- **Annualisation unit check**: DO WORSE only in that there is no written rule. Proposed: one line in `data-rules`:
  "vendor vol series: record units; assert a plausible annualised range (e.g. 0.02–2.0) on load".
- **Writing code yourself / reading AI code critically** (owner's learning): his "somebody has to go in and fix
  everything" is the Learning bucket.

## Engineering lessons for our pipeline
- IBKR daily `OPTION_IMPLIED_VOLATILITY` history is a free IV series for **stocks/ETFs** (QQQ works; futures "junk" on
  our account, per `scripts/rates-vol-gap/ibkr_iv_probe.py` and the IV-from-settlements memory). It is IBKR's own blended
  ~30-day IV, model unknown. Treat it as a proxy and check it against Cboe VXN/VIX before use (QQQ vs VXN is the natural
  check).
- Don't copy the ×√252. Our stored series is already annualised.
- Connection pattern (`nextValidId` as the "connected" signal, error-code allowlist 2104/2106/2158/2176, client-id
  collisions across apps). We already handle this in `ib_insync` (`refresh_options_skew.py` retries with a fresh
  clientId; fixed clientIds per script, e.g. 77 for the probe). Nothing new.

## Research ideas
- **IV level → forward IV vs what the curve priced** · variable: VXN (or VIX) 252-session percentile at the close of d ·
  condition: top / bottom quintile vs middle · horizons: 5 / 10 / 21 sessions · outcome: change in the front VX
  settlement held to horizon (roll included), i.e. a short-vol P&L, not spot IV · noise threshold: 2,000 random-entry
  sets matched on month (the `short-vx-rule` machinery) · benchmark: short VX on any day (the roll premium) · what it
  changes: whether a plain IV-level filter adds anything over the roll and over the banked ratio flag. If not, QG's
  dashboard rule is just the roll with crash risk. Screen: `evidence_map` "IV"/"VRP"/"mean reversion": no IV-level→VX
  test; nearest are `short-vx-rule` (prereg, ratio flag) and `vix-calculus` B (UNDERPOWERED). Data:
  `analysis/output/vix-calculus/data/vx_settle.parquet` + `panel_daily.parquet` (2013-05 → 2026-08). Agenda: none of
  model-audits / portfolio-construction / rough-volatility fits. Suggest a follow-up row under `vix-calculus` /
  `short-vx-rule` (not carded in an agenda file).

## Quotes
- "All of trading is about finding a statistical basis for your decision making." (QG)
- "This regime split is not a stationary value… Everything is time variant here… Nothing is converging." (QG)
- "The model is wrong, the expectation is wrong… But that does not preclude us from making money." (QG)
- "Transaction costs, delta hedging, the position cost itself can eat away at any potential profits." (QG)
- "You can write a lot of code with AI very quickly, sure, but somebody has to go in and fix everything." (QG)
