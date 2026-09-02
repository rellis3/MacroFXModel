# Lego Module Registry — MacroFXModel

> **The central list of every reusable "lego brick" module**: what it owns, where
> it's used, and its build status. This is the durable index referenced by
> `CLAUDE.md` ("The Lego Principle"). The goal of the brick architecture is that
> **backtests, systems and live bots all import the same piece**, so the research
> number and the live behaviour can never silently disagree (the "bit-identical
> port" failure documented in `TRADABILITY_REVIEW.md` / `SYSTEM_ASSESSMENT.md §2.3`).
>
> **How to use this doc**
> - Building something new? Find the brick here and **import it** — never copy.
> - Found duplicated logic? Add it to the *Candidate* tables with file:line
>   evidence, then promote it to *Built* when extracted + tested.
> - Every brick must be **pure, horizon-agnostic where applicable, no-lookahead,
>   and unit-tested on synthetic data** (no network) — see `CLAUDE.md`.
>
> Status legend: ✅ Built & wired · 🟡 Built, adoption in progress · 🔲 Candidate
> (mapped, not yet extracted) · 📄 Documentation-only brick (a contract, not code).
> Risk = damage if the duplicate copies drift apart.

Last updated: 2026-07-10. Maintained as bricks are built.

---

## 1. Built bricks (the baseplate — import these)

### 1a. Pre-existing core (the original baseplate)

| Brick | File | Owns | Imported by | Status |
|---|---|---|---|---|
| Vol/range engine | `js/volBacktestEngine.js` | vol-σ series (HV20/GARCH/Yang-Zhang), `ASSET_PARAMS`, `classifyRegime`, BM/HN band constants (`BM_P50/75`, `HN_P50/75`), `fetchD1`, `fetchSessionOpenLondon` (today's open from the FIRST M1 bar at 00:00 Europe/London — deterministic, matches the forecaster; not the 22:00-UTC D1 open) + `londonMidnightSec` (DST-safe London-midnight epoch, the single anchor definition) | `forecastCore`, `honestForecastEngine`, `weeklyVolBacktestEngine`, `volBacktestM1Engine`, `server.js` | ✅ |
| Day-type classifier | `js/dayTypeCore.js` | reversion-vs-continuation score (`ESTIMATORS`, `DAYTYPE_PRESETS`, `classifyDayType`, `dayTypeScore`) **+ realized-outcome labeler** (`OUTCOME_LABELERS`, `labelOutcome` — the ground-truth CONTINUATION/REVERSION tag the score is graded against; default `closeVsOcMed` ~50/50) | `forecastCore` (re-exported), `forecastAnalyser`, `weeklyVolBacktestEngine` (opt-in regime fade/follow gate) | ✅ |
| Forecast primitive | `js/forecastCore.js` | `computeBands`, `walkBars` (fill walker), `simulateEntry` (the one entry primitive), `selectStrategy`, `volSigmaSeries`, **`nextSigma`** (one-step-ahead σ for TODAY's session — the plan producer's contract; golden-tested `nextSigma(bars[0..n-1]) === volSigmaSeries(bars[0..n])[n]`), `HORIZONS`. **2026-07 honesty fixes** (tested in `js/forecastCore.test.mjs`): limit-entry TP is no longer resolvable on the fill bar (the TP region is traversed on the way TO the band — was fatal on D1 window bars: weekly/monthly + daily D1-fallback); `walkDynamicHL` anchors on extremes STRICTLY BEFORE the tested bar, seeded with the open (was self-anchoring = BUG_LIST #8's defect in the v2 core). Re-run any A/B built on the old numbers before citing them. | `volBacktestV2Engine`, forecast family, `volatilityBotProducer` (via `nextSigma`) | ✅ |
| Honest metrics | `js/honestForecastEngine.js` | `summarize`, `summarizeSplit` (metrics + IS/OOS split) | forecast family | ✅ |
| EMA-cross A/B engine | `js/trendFollowEmaEngine.js` | tests the "standard" MA-crossover strategy vs the principled momentum signal — `emaCrossSignal` (graded 3-EMA stack score in [-1,1], causal), `withEmaSignal`, `compareTrendSignals` (momentum vs EMA-cross basket + single-pair + `buyHoldStats` floor), `emaIsOosSplit`. Expresses the crossover as an injected **signal** into the SAME `backtestMarket`/`backtestBasket` primitive (Lego — not a fork), via a new behavior-preserving **`signalSeries` injection point** added to `trendFollowEngine.js` (mirrors the existing `volSeries` injection; omitted ⇒ bit-identical to the original momentum path, golden-tested). **Result (2026-07, real M1 daily 2016–2026, 8-market FX+gold, costed): NULL — the cross adds nothing over momentum, is beaten by buy-and-hold on 7/8 markets, churns 3–4× turnover, dies OOS; both signals confounded by the post-2011 trend drought + thin FX-only breadth. See `TREND_EMA_AB_FINDINGS.md`.** Tested `js/trendFollowEma.test.mjs`. | `server.js` (`/api/trend-ema-ab/*`); imports `trendFollowEngine`, `indicatorCore`, `statsCore` | ✅ (null result) |
| VWAP reversion engine | `js/vwapReversionEngine.js` | tests whether session VWAP is a tradeable intraday fair-value level or folklore — `computeSessionVwap` (session-anchored VWAP + volume-weighted σ-bands from tick-weighted hlc3; pure, unit-tested), `simulateVwapSession` (ONE entry primitive parameterised by `{mode: band_fade | vwap_bounce | band_follow}` — fade-to-VWAP vs bounce-off-VWAP vs break-through; no bespoke legs), `runVwapReversion` (packed M1 → dated trade records), `compareVwapModes`. Reuses `walkBars` + `summarizeSplit` (imported, not copied); costs ON; horizon-agnostic session anchor (day/week/month). **Result (2026-07, real OANDA M1 2016–2026, costed OOS): NULL/negative — every mode loses ≈ the cost per trade; see `VWAP_REVERSION_FINDINGS.md`.** Kept as a costed harness + `vwap-reversion.html`. Tested `js/vwapReversionEngine.test.mjs`. **Known drift:** three VWAP definitions now exist (continuous-cumulative `vumanchuCore.computeVWAP`, per-day session-reset `levelSources.vwapAnchorLevels`, and this per-session+σ-band `computeSessionVwap`) — candidate to unify into one VWAP brick (§2). **`computeSessionVwap` is now reused a second time** by `js/vwapSessionReversionV1Engine.js` (the London→NY session-transition fade from `JORDAN_VIDEO_INSIGHTS.md` — a mechanically different hypothesis: fades the session HANDOFF, not a σ-band touch; no fourth VWAP definition added). **Result (2026-08, real OANDA M1 2016–2026, 26 pairs, costed OOS): NULL — pooled OOS t=−9.9, 1/26 pairs OOS-positive, pooled gross ≈ 0.00002%/trade (indistinguishable from zero, same shape as this row's own null).** See `education/jordan_vwap_session_reversion_backtest/RESULTS.md`. **§20 addendum (2026-08-30, `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §20) — a FOURTH mode, `vwap_trend_cross`:** the owner pushed back on "never trade VWAP" — correctly, since every VWAP idea tested anywhere in this codebase so far (this row, the fixed-sigma studies, the extension atlases) is some flavor of mean-reversion, all anchored to a σ-band. Asked to test the opposite standalone bet — trade WITH VWAP's own directional read ("only go long while price is above VWAP") — as its own system, not confluence on another one. Added as a fourth `mode` on this file's existing ONE VWAP entry primitive (Lego Principle #2, not a new engine): first fresh close-based cross of session VWAP each day enters in that direction, exits on the opposite cross or session end, no σ-band, no stop/target (the minimal-DOF version — nothing to overfit). Its exit is a moving level, not a static price, so it computes its own fill directly instead of routing through `walkBars` (a different fill contract, not a duplicate). +4 tests. New runner `scripts/run_vwap_trend_cross.mjs`. **Result: NULL, decisively, all 4 instruments (gold/EURUSD/GBPUSD/USDJPY), all 3 direction variants — but for a different reason than every prior null in this row or the fixed-sigma study.** Gross P&L is essentially ZERO everywhere (a coin flip, not a wrong-direction bet); win rate 9-12% because a bare cross fires on 96-99% of ALL sessions and whipsaws immediately most of the time; the extreme OOS t-stats (down to −25, the most negative anywhere in this codebase's VWAP work) come from trade COUNT on a near-daily-frequency signal, not effect size. Diagnosed structural mutation this points at, not built: a confirmation filter (hold N bars, or clear VWAP by a minimum distance) to separate real trend days from the ~97% that are just noise. **§21 addendum (2026-08-30) — built all four candidate filters:** `confirmTfMinutes` (day-aligned bucket-close confirmation — extracted the shared logic to `barUtils.isBucketCloseAt` since this became its THIRD independent caller, per Lego Principle 1's own "two copies already qualifies" rule; `stackedFadeV1Engine.js` migrated its private copy to the shared version too, behavior byte-identical, regression-tested), `minCrossSigma` (reuses `computeSessionVwap`'s own `sd[]`, no new vol math — a thin band, honestly named as one), `requireTrendRegime` (new `indicatorCore.adxWilder` import, causal ADX(14) on the session's own bars), `excludeSession` (a 7th local `sessionOf` copy — matches the existing, documented 6-file tolerance). +7 tests. New runner `scripts/run_vwap_trend_cross_filters.mjs`. **Result: none cross the pre-registered bar on any instrument, but the filters are informative, not just null.** `confirmTfMinutes` barely reduces trade count even at 15 minutes (fill rate still 93-97%) — falsifies the "1-bar wick noise" half of §20's own diagnosis; most crosses hold for well over 15 minutes before eventually reversing unprofitably, on a longer horizon than any bucket-close window filters. `minCrossSigma` is the one filter that moves EVERY instrument the same direction (less negative, not mixed) — at 1.0σ: EURUSD OOS t −12.01→−0.72, GBPUSD −14.68→−2.48, USDJPY −8.08→−0.54, gold −3.05→−2.84 — a real, cross-instrument, still-null mechanism: a lot of the whipsaw is trivial near-VWAP noise a σ-threshold correctly screens out. `requireTrendRegime` (ADX) makes gold WORSE while modestly helping the FX majors — mixed, not promoted. `excludeSession='London'` does almost nothing. Two single-instrument near-zero OOS results (gold at confirm=15m: t+0.28, the first positive OOS mean in this whole VWAP study; USDJPY at minCrossSigma=0.5: t−0.02) do NOT replicate on the other 3 instruments each — flagged honestly, not sold, matching the standing gold-only-findings discipline (§7b, §13). Eleventh null, again narrowing down why rather than just re-confirming it. **§22 addendum (2026-08-30) — pushed `minCrossSigma` further, and tested a stop-loss:** added real MAE tracking (`maePrice`/`maeSigma`, walked off the actual OHLC path entry→exit) and a `stopSigma` opt-in param to `vwap_trend_cross` (+2 tests, 46 total) and two new runners (`scripts/run_vwap_trend_cross_sigma_sweep.mjs`, `scripts/run_vwap_trend_cross_mae_diagnostic.mjs`). Pushing `minCrossSigma` to 1.5-3.0σ produces EURUSD/USDJPY OOS numbers that superficially look like a real, improving finding across multiple consecutive σ-steps (up to USDJPY OOS t+1.24 at 2.5σ) — but EVERY one of those cells is a negative-IS/positive-OOS sign flip, the exact noise signature this codebase's VWAP work has repeatedly flagged as disqualifying; gold moves the opposite, more-negative direction at the same thresholds. Twelfth null. Separately: `vwap_trend_cross` never had a stop, unlike every other mode in this row — losers do show larger MAE than winners (real, cross-instrument, but close to tautological), so tested whether a real stop recovers an edge. A first attempt retroactively capped realized pnl at each trade's own MAE and was caught as mathematically invalid before being reported (MAE is measured off intrabar wicks, the natural exit off closes, so a cap can only make pnl same-or-worse by construction — it can never show a stop helping). Fixed with a real forward-walked `stopSigma` exit in the engine itself, the same convention every stop-based mode elsewhere in this codebase uses. Result at `minCrossSigma=1.0` (§21's cleanest, non-sign-flipped threshold): no `stopSigma` level (1 through 5) rescues any instrument — gold/GBPUSD stay significantly negative at every level, EURUSD/USDJPY's already-near-zero OOS stays near-zero-to-negative. Thirteenth null: a slow-bleed/weak-signal problem, not a fat-tail one a stop can fix — confirms §20's original diagnosis. | `server.js` (`/api/vwap-reversion/*`); imports `forecastCore`, `honestForecastEngine`. Also consumed by `js/vwapSessionReversionV1Engine.js` | ✅ (null result; §20's trend-cross mode also null, diagnosed as a whipsaw/frequency problem, not a wrong-direction one; §21's confirmation filters also null but falsify half the §20 diagnosis and isolate `minCrossSigma` as the one consistently-directional, still-null mechanism; §22 pushes `minCrossSigma` further — superficially-improving OOS on 2 instruments fails the pre-registered same-sign-both-halves check on every cell — and a real forward-walked stop-loss also null, ruling out fat-tail risk as the cause) |
| POI-reaction engine | `js/poiReactionV1Engine.js` | mechanises the ColezTrades discretionary strategy (`docs/ColezTrades_*`) as a COMPOSITION of existing bricks (no new brick): `collectLevels`/`clusterLevels` build the confluence "POI" zones (≥2 distinct level sources), the nearest zone to the day open is **faded** via the shared `walkBars` fill primitive (limit entry, stop-first/TP intrabar, no-lookahead), vol-scaled stop = 0.5×D1 ATR(14), fixed 1:1 RR, costs ON. `runPoiReaction(packed, cfg) → { trades, records, meta }`. Stages 1–2 = levels + confluence; **Stage 3** = the opt-in VuManChu confirmation gate (`cfg.gate`, default OFF ⇒ Stage 1–2 byte-identical) — WaveTrend regular divergence via `divergenceCore.reversalDecision` + VWAP + Money-Flow slope via `vumanchuCore`, m-of-3, read STRICTLY BEFORE the touch bar (an intrabar-peek lookahead was caught and removed — it had faked a +2.2 OOS Sharpe); **Stage 4** = `orderMode` fade / breakout / selector (the last uses `dayTypeCore.dayTypeScore` T, no lookahead, to fade range days / follow trend days). **Interactive tool:** `server.js` `/api/poi-reaction/run` + `/status` (async-job, config-driven over any pair subset) → `poi-reaction-backtest.html` (config panel + IS/OOS card + equity/per-pair-Sharpe canvases + trade-proof lightweight-chart + 3 CSV exports), linked from `index.html`. **Result (2026-07, real OANDA M1 2016–2026, 26 pairs, costed OOS): NULL at both stages.** Stage 1–2: 46,677 trades, pooled Sharpe −3.4 (IS −3.6 → OOS −3.1), expectancy −0.016 R, positive on 1/26 pairs, beaten by buy-and-hold. Stage 3: the gate filters volume not losers — trades ~4× fewer, per-trade expectancy −0.016→−0.018 (flat/worse), win rate ~49% unchanged, pooled OOS still −2.7; the apparent Sharpe lift is a trade-frequency annualisation artifact. See `education/coleztrades_poi_backtest/{COLEZTRADES_POI_BACKTEST,STAGE3_VUMANCHU_GATE}.md`. First strategy consumer of the `levelSources` Tier-2 bricks and of `divergenceCore` in a strategy gate. Imports `levelSources`, `barUtils`, `forecastCore.walkBars`, `instrumentRegistry`, `vumanchuCore`, `divergenceCore`. Kept as a costed harness (not wired into a live page). Tested `js/poiReactionV1Engine.test.mjs` (ungated regression + gate-only-filters invariants). | first `levelSources` strategy consumer; imports `levelSources`, `barUtils`, `forecastCore`, `instrumentRegistry`, `vumanchuCore`, `divergenceCore` | ✅ (null result) |
| MacroFX Decision-Zone engine | `js/macroFxZoneEngine.js` | the 20-doc **"MacroFXModel"** spec (`Chatgpt/*.md`) reduced to its ONE falsifiable, price-only claim (Ch 1 & 5): *turning points cluster where several INDEPENDENT models name the same price* → build **Decision Zones** from clustered evidence, let a **Market-State selector** decide fade-vs-follow. A COMPOSITION of existing bricks (no new primitive): `computeBands`/`volSigmaSeries` (Ch 3 vol/forecast → σ-exhaustion levels as 2 evidence families), `collectLevels`/`clusterLevels` over the D1 level sources (Ch 4/5 zone builder → distinct-source count = "independent evidence"), `dayTypeScore`+`classifyRegime` (Ch 6 market state), `walkBars` (the ONE fill primitive; limit-fade→fair-value / stop-follow→RR target, no-lookahead, costs ON), `summarizeSplit`+`metricsCore` (Ch 16 IS/OOS). Real-path MAE (`maeFromPath`), vol-scaled per-trade stop so R≠%Return. **Asia Range Extensions (Ch 4, opt-in `asiaAnchor`)** are built the ONLY honest way — from the session's own **M1** (00:00–06:00 UTC high/low via `barUtils.bodyRange` + `fibProjection.calcFibs`, never D1, which has no intraday structure); with it on each session anchors at Asia close and only the **post-06:00** path is traded (no lookahead onto the Asia window), the `asia_ext` fib ladder joining the confluence as an independent evidence family. **Regression fair-value bands (Ch 10, opt-in `regrBands`, on by default)** — D1 OLS of close on time over `regrLookback` days via shared `statsCore.linregSlope`, projected one step forward + ±1σ/±2σ residual bands as the `regr_band` evidence family (no lookahead). **Diagnostics (Ch 16, `zoneDiagnostics`)** — per-calendar-year stability table (the mandated concentration check; NOT parameter walk-forward — the selector has no fitted params) + the repo's canonical `backtestStats` Monte-Carlo (bootstrap CI + shuffle-drawdown) on the OOS book, explicitly labelled expectation-setting not OOS evidence. **The A/B IS the test** (`compareZones` → 4 modes on one split): `zone` (≥minSources confluence, adaptive) vs **`isolated`** (gate dropped — *Claim A: does confluence add edge?*) vs `zone_fade`/`zone_follow` (fixed direction — *Claim B: does the state selector beat a coin?*). Pre-registered win bar: zone beats isolated AND best fixed on OOS Sharpe, >0, ≥30 OOS trades. **Deferred honestly** (OANDA mids only): Options/Gamma (Ch 9), Macro (Ch 11), order-book Liquidity (Ch 8), plus the intraday-only level sources (volume_profile/vwap) — not faked in. `runZoneMode`/`compareZones`/`buildZones` pure & offline-testable (`loadM1ForPair` lazy-imported only in the suite). **Status: BUILT, not yet run OOS** — the sandbox can't reach OANDA (403), so the edge verdict comes from running the suite on Railway; engine validated on synthetic data incl. a no-lookahead causality guard. `server.js` `/api/macrofx-zone/run`+`/status` (async job) → `macrofx-zone-backtest.html` (IS/OOS card, two-claim verdict, 3 CSV exports), linked from `index.html`. Imports `forecastCore`, `levelSources`, `dayTypeCore`, `metricsCore`, `instrumentRegistry`, `volBacktestEngine`. Tested `js/macroFxZoneEngine.test.mjs` (14 checks). | second `levelSources` strategy consumer; imports `forecastCore`, `levelSources`, `instrumentRegistry`, `volBacktestEngine` | ✅ built (unrun) |
| MacroFX Decision engine (assembled) | `js/macroFxDecisionEngine.js` | the ASSEMBLED MacroFXModel — the "engine monitored process" on top of the v1 zones, built because v1 only tested the skeleton (fade every zone daily) and mistook that for the whole concept. Three layers over `buildZones` (reused wholesale): **(1) market-state read** `readState` (Ch 6) — blends trend-strength (`indicatorCore.adxWilder`, prior bars only) + trend-day-ness (`dayTypeCore`) + directional regime + vol-regime into trendiness `S∈[0,1]` that DIRECTS each zone (S high→follow, low→fade, **mid→stand aside** — the no-trade band v1 lacked); **(2) confidence gate** `confidenceFor` (Ch 7) — independent-evidence count + state-alignment + location → `[0,1]`, only trades above `confThresh` fire, so the book is SELECTIVE (dozens/yr, not one/day), and `calibrationByConfidence` tests whether higher-confidence buckets actually pay; **(3) trade management** `manageTrade` (Ch 15, the one genuinely NEW brick here) — finds the fill (walkBars causal rules), takes a partial at +`beAtR`·R, moves stop to break-even, trails the runner by `trailR`·R behind the favourable extreme (lagged one bar, no lookahead), else time-exits at the window close; returns net %/R + exitReason + real-path MAE, aimed at the fat left tail that sank the v1 fade book. `compareDecision` runs the assembled book **head-to-head vs the v1 naked skeleton** (`runZoneMode 'zone'`) on the same split, plus confidence calibration + exit mix. Costs on (incl. the extra partial-exit leg + stop/breakout slip), no lookahead. `runDecision`/`compareDecision`/`readState`/`confidenceFor`/`manageTrade`/`calibrationByConfidence` pure & offline-testable. **Status: BUILT, not yet run OOS** (sandbox can't reach OANDA). `server.js` `/api/macrofx-decision/run`+`/status` → `macrofx-decision-backtest.html` (A/B card + calibration + exit-mix + 3 CSV exports), linked from `index.html`. Imports `macroFxZoneEngine` (zones), `forecastCore`, `dayTypeCore`, `indicatorCore`, `metricsCore`, `backtestStats`, `volBacktestEngine`. Tested `js/macroFxDecisionEngine.test.mjs` (17 checks incl. manageTrade partial/BE/stop accounting, selectivity, no-lookahead). | third `levelSources`/zone consumer; imports `macroFxZoneEngine`, `forecastCore`, `dayTypeCore`, `indicatorCore`, `metricsCore`, `backtestStats` | ✅ built (unrun) |
| Touch features | `js/touchFeatures.js` | at-the-moment fade-vs-continuation features (`createTouchFeatures(cfg)` factory + `TOUCH_FEATURES`: approach efficiency/velocity, WaveTrend, **volume climax, candle rejection, round-number proximity**); price + tick-volume proxies, no order-book; config set on import | `forecastAnalyser`, `rangeLineAnalyser`, **`confluenceFeatures`** (wraps it — the six base features are re-exported through the wider pack, never re-implemented); imports `vumanchuCore` | ✅ |
| **Confluence features** | `js/confluenceFeatures.js` | the at-a-touch CONTEXT stack for a forecast-line touch, as a drop-in `tf` FEATURE PACK (`createConfluenceFeatures({htf})` → `{KEYS, wtSeries, compute}`) — so new features flow into the Drivers tab, the Conditioning tab and `perLineStrategy`'s cell policy without touching any of them. Adds six bucketed features to `touchFeatures`' six: **`confluence`** (distinct structural sources at the line — delegates to `rangeLineAnalyser.confluenceBucketAt`/`intradayConfluenceAt`, the SAME bucketer the range-line book was validated on, so the two pipelines can't disagree; tolerance is **σ-relative** (`confTolFrac × σ × open`) not a pip count, because a pip window generous on EURUSD is invisible on Nasdaq), **`vwapSide`** (the line's extension beyond session VWAP in daily-σ units), **`wtMtf`** (15m/1h/4h WaveTrend agreement vs the touch), **`wtSlow`** (1h WaveTrend stretch), **`momAdx`** (1h ADX trend-vs-range), **`htfTrend`** (4h EMA slope vs the touch). `createHtfContext(packed)` builds each timeframe's WT/ADX/EMA **once per pair over the whole M1 history** (a 4h WaveTrend needs weeks of prior bars — a per-session resample would be both cold and quadratic). **Causality:** `htfIdxAt` takes the last HTF bar whose CLOSE is at or before the touch bar's START — strictly one notch more conservative than `vumanchuMtf.alignHtfCausal`, because a touch can land anywhere inside its M1 bar; this is the `request.security` repaint bug, which manufactures edge and still renders a plausible chart. **Orientation:** every directional bucket is folded by touch side into `with`/`against`, `3·…` always the continuation-leaning end, so pooling up and dn lines in one aggregate is legitimate. **Injected by the store, never imported by `forecastAnalyser`** — it reaches `rangeLineAnalyser`, which imports `forecastAnalyser`, so the dependency must point one way. Tested `js/confluenceFeatures.test.mjs` (17 asserts, synthetic bars: causality, truncation-invariance, up/dn mirror, σ-relative tolerance, `resamplePacked ≡ resampleTo`). **First-round result (2026-08, local M1, EURUSD/Gold/NQ, 3y, daily): no new feature clears the bar** — structural confluence flips sign IS→OOS on all three; `wtMtf`/`wtSlow` lean the right way on EURUSD (stack against the touch → reversion) but on n=7–26 OOS and invert on Gold/NQ; `momAdx`/`htfTrend` null. Base reversion rate differs sharply by market (EURUSD 51% / Gold 48% / NQ 44%), and the known `approachVel` spike effect **reproduces on FX+Gold (+13…+18pp) and INVERTS on NQ (−4…−5pp)** — pooling asset classes would blur both. | `forecastAnalyserStore` (`opts.confluence`, opt-in per refresh) → `forecast-analysis.html` Drivers/Conditioning; imports `touchFeatures`, `vumanchuCore`, `indicatorCore`, `barUtils`, `rangeLineAnalyser` | ✅ built (features null so far) |
| **Ladder path stats** | `js/ladderPathStats.js` | answers "price just tagged the p50 line — does it carry on, or stall here?" as the CONDITIONAL chain `reach p50 → X% go on to p75 → Y% go on to p90`, per instrument and per side. `ladderPathChain(instrument, {horizon})` + `describeSide()` (plain-English sentences, naming today's actual price when levels are passed) + `nominalChain()`. **It is a re-expression, not a second measurement** — `forecastLadderParams.oos_exceed` already holds the walk-forward OOS exceedance per rung, and because the rungs are NESTED (a high clearing p90 necessarily cleared p75 and p50) the conditional `P(p75|p50) = P(p75)/P(p50)` is exact arithmetic on the fit, so it can never drift from the lines drawn on the chart. Guards a non-monotone fit to `null` rather than emitting a >100% conditional; degrades to a labelled nominal chain for an unfitted instrument. **Finding (2026-08): the chain sits near its nominal 50%→40% on all 21 fitted instruments — getting further out does NOT make the next leg less likely, so there is no "each band is harder to break" effect.** Independently corroborated by a symmetric-barrier σ-ladder walk over M1 (EURUSD/Gold/NQ), where the advance rate was flat across depth (56–69% at every rung). What IS real is the per-instrument UP/DOWN asymmetry — EURUSD's down-side p75 stalls before p90 72% of the time vs 57% up-side; DE30 down 72%; Gold down 64%. Deliberately UNCONDITIONED on the event calendar (the live ladder widens σ on FOMC/NFP but the fit pools all days) — the UI says so. Tested `js/ladderPathStats.test.mjs` (8 asserts) + a stub-DOM render check of the page panel. | `server.js` `GET /api/vol-forecast/ladder/path-stats` → `vol-forecast-v2.html` **Path Odds** panel; imports `forecastLadder` | ✅ built |
| **Level Atlas** | `js/levelAtlasEngine.js` + `js/levelAtlasReport.js` + `js/levelAtlasRoutes.js` + `js/cvolLoader.js` | the comprehensive per-touch QUANT REFERENCE engine for the fitted ladder — deliberately NOT a signal search (no after-cost gate, no p-value filter; a 38%-of-the-time cell is a complete entry, not a rejected hypothesis). `atlasWalk(packed, {instrument, assetClass, ivByDate?})` emits ONE record per touch of every rung/side/re-arm-sweep, ~25 context dimensions: time/session/day-of-week/session-position, day+session realized-vol regime, gap, approach speed/efficiency/volume-climax/round-number, VuManChu single-TF+MTF+1h-stretch+4h-trend, VWAP, ADX, structural confluence (all reused, never copied), **churn** (one-sided vs two-sided travel — the single largest effect found, 1.2-1.8x vs 0.16-0.43x vs a speed-matched base), `otherSideTouchedBefore`, **`prevOutcomeSameDay`/`prevOutcomeCrossDay`** (split from a single conflated `prevOutcome` after the same-day 'neither' bucket was found to be near-tautological — see the field's own comment; same-day is the cleanest effect in the whole book, +45-54pp holding OOS on every cell, cross-day is null), **`prevCloseLoc`** (yesterday's close vs its OWN forecast bands — zero lookahead risk, complete before today opens), and **CVOL** (`js/cvolLoader.js` parses `cme_cvol_eod_available_history.parquet` — CME's EOD implied-vol settle, the ONE forward-looking signal in the book; `ivRegime`/`vrp`/`ivSkewDir`, one-day settle lag throughout). **`vrp` — implied vol vs realized — is the standout CVOL finding**: consistent sign across 3 cells and all 3 re-arm sweeps, OOS effect usually AS STRONG OR STRONGER than IS (+13.5pp OOS vs +5.1pp IS on one cell) — rare for this to not decay, worth the most trust of any single finding here. **Closed as null, each tested multiple independent ways**: EMA-slope regime, the real 2-state Gaussian HMM (label/confidence/freshness, `hmm.js`'s `fitHMM` refit on a rolling 100-day window, same convention `asiaRangeEngine.js` already uses), the 4h EMA trend read fresh per touch, and an ex-EUR synthetic USD-strength composite (built from the 6 other majors' D1 caches, deliberately excluding EURUSD to avoid testing it against itself) — none show a directional edge on EURUSD's own level-touch behaviour; slow/macro/label signals consistently don't reach this microstructure phenomenon, only path-states do. Every dimension bucket carries `holdsOOS` (`annotateHolds` — same-sign delta ≥3pp in BOTH halves, n≥30 both halves) so a UI can never surface an unconfirmed bucket as a "reason"; `extractHeldFindings` pulls only held cells across the whole book, sorted by effect size — this IS "read the book for real findings" made mechanical instead of eyeballed. **`atlasLiveToday`** — the live evaluator: a THIN WRAPPER around `atlasWalk` (a live in-progress touch is just `outcome:'neither'` because the resolution loop runs out of bars — no second implementation, zero drift risk), returning only the most recent date's touches. **`matchLiveContext`** (report layer) intersects one live touch against the stored book, producing the drawer's own supports/challenges/context shape (`today.html`'s `drThesisSec`/`.th-row` — reused, not reinvented) — verified end-to-end on real EURUSD: a touch's OWN `prevOutcomeSameDay` correctly flips from support to challenge as the day's earlier touches resolve. Fixed en route: `sessionSpanMins`/`minsRemaining` were silently derived from `bars[bars.length-1].time` — correct by coincidence on a complete historical day, wrong on ANY early-closed session and critically wrong for a live/in-progress day; now a fixed 1440-min calendar constant. Tested `js/levelAtlasEngine.test.mjs` (22 asserts) + `js/levelAtlasReport.test.mjs` (23 asserts) — causality and the OOS-holding gate are the load-bearing categories; several tests caught real bugs in their OWN first draft too (bar-index-vs-date-index mismatches, a session-boundary artifact), each fixed and left as a comment explaining why. First EURUSD run (2026-08, real M1 2016-2026): 34,175+ touch-records across 3 re-arm sweeps; most DIMENSIONS rows now read through — see the finding notes above and `MEMORY.md` project notes for the fuller narrative. | `server.js` mounts `js/levelAtlasRoutes.js` (`POST /api/level-atlas/run` async-job — ONE walk produces books+cards+the live snapshot together, no second M1 pass; `GET /card`, `/book`, `/book/text`, `/live`, `/manifest`; persisted to R2 under `level-atlas/{pair}.json`). Card/live JSON contracts slot into `today.html`'s `drAtlasSec` (below the AI Analysis section, `loadDrawerAtlas`) reusing `drThesisSec`'s `.th-row`/`.th-grp` styling. Imports `touchFeatures`, `confluenceFeatures`, `rangeLineAnalyser`, `forecastLadder`/`forecastLadderParams`/`forecastSigma`, `instrumentRegistry`, `r2Store`, `hyparquet` (new dependency use, already in package.json), `hmm.js` (probe only, not wired into the permanent engine — regime tested null). **Gap-fill (2026-08-25)**: the R2 M1 parquet is a static, periodically-uploaded snapshot with no automated refresh — `/run` was silently building "today" off whatever date each pair's archive last synced to (found 4 days stale). `runOne` now tops `packed` up to "now" via `gapFillPacked`/`fetchM1Range` (the same brick `forecastAnalyserStore.refreshPair` already uses) before walking, whenever `OANDA_KEY` is set. **Pending/live ticker (2026-08-25)**: `atlasWalk`'s new `pendingRearmFrac` option emits a synthetic record for each rung NOT yet touched on the live day — same context computation as a real touch (day-level fields literally shared, pinned by test), just captured at the current bar instead of at a crossing. `matchLiveContext` runs on these exactly like a real touch (it only reads dimension fields, never outcome), so the drawer can show "if price reaches here next, history says X" before it happens, not only after — `today.html`'s "Approaching" block, nearest untouched rung per side, with `distancePips` re-derived client-side on every SSE price tick (`updateAtlasDistances`, zero server round-trip). Full pair sweep run 2026-08-25: 29/30 `daily-brief` instruments built (BTCUSD has no M1 archive anywhere — R2/disk/Drive — a data gap, not a bug); caught and fixed a real bug en route, NZDCAD missing from `instrumentRegistry.js` entirely (silently broke its gap-fill only). **Fast live-context poll (2026-08-25)**: the book (a pre-analyzed, cross-referenced JSON — read from R2, always instant) was never the bottleneck; what was slow was deriving WHICH row of it applies right now from raw M1. Profiled on real EURUSD: the full 3.8M-bar file costs 40-160s to load+process; every context input (`forecastSigma`, `sessionConfluenceLevels`, etc.) is a rolling-window function that only ever reads its own trailing slice (widest is `swing_fib`'s 60 trading days) — so a ~180-calendar-day bounded window (`levelAtlasRoutes.js`'s `boundPacked`) produces IDENTICAL context (verified: `atlasWalk`'s new `liveWindowDays` option, tested field-for-field equal to the full walk) at ~3s instead of 100s+. `getFastLive` keeps that bounded window warm in an in-memory cache per instrument (seeded once via a backgrounded cold load — `{warming:true}` while it's running, never blocks the request thread), topped up each call via a cheap incremental `gapFillPacked` (short-circuits with no network call when nothing's new), and only actually recomputes when that top-up moves the newest bar — M1 only advances once a minute, so there's nothing new to derive more often than that anyway. Measured: warm calls return in ~0ms. New route `GET /api/level-atlas/fastlive/:instrument`; `today.html` polls it every 5s while the drawer's atlas section is open (`_startAtlasPolling`/`_stopAtlasPolling`, wired into `openDrawer`/`closeDrawer`), re-reading the book from R2 on every call so a fresh `/run` reaches an open drawer without any extra plumbing. In-memory cache, like `jobs` above — wiped by a Railway restart; cold after one, warms itself on the next poll. Tested `js/levelAtlasRoutes.test.mjs` (7 asserts, `boundPacked` synthetic + `getFastLive` end-to-end against real EURUSD — cold-start non-blocking, eventual warm result, second-call latency). One-line headline (`_atlasHeadline`) picks whichever level shown has the clearest historical read (non-neutral lean, more supports than challenges) and states it first; refuses to force a pick when nothing clears the bar. `updateAtlasDistances` also flags "at the level — confirming…" instead of a stuck "0.0 away" in the seconds between polls. **Plain-English rewrite (2026-08-25)**: the Read-tab section was quant-dense (raw Δpp/n, "supports/challenges" jargon) for a user explicitly learning to read this — `DIM_PLAIN` translates every bucket value to a sentence fragment, a new "Right now" panel (`_rightNowPanel`) shows ALL current readings (VWAP/VuManChu/session-vol/etc.) as plain facts regardless of whether they're currently proven to matter (deliberately no verdict language — it's there to build the reader's own intuition), the verdict collapsed to `_verdictChip` ("🪙 Toss-up" / "↗/↘ Leans/Strong lean continuing/reversing"), and the old per-row stat block moved behind a native `<details>` "Why?" toggle so the detail is there without being the default view. **VuManChu visual (2026-08-25)**: reused the EXISTING ready-made API (`GET /api/vumanchu/chart?format=png`, same one `vumanchu-chart.html` and the Telegram alerts already use — `js/vumanchuChart.js` composing `vumanchuCore`+`divergenceCore`, rasterised via `js/pngCanvas.js`) rather than building a second chart renderer; `loadDrawerVumanchu` drops it into a new `drVmSec` in the drawer's Vol & Path tab (`today.html`'s `drPane-vol`, alongside the Volatility Cone and Forecast Path). Agreed split: Read tab stays the tactical/live engine (this one); the whole-session question ("given how today has started, what's the odds the full session reaches p75/p90") moved to its own engine — see the **Session Path** entry below. | ✅ live — 29/30 `today.html` pairs built (BTCUSD has no M1 history), drawer wired, pending-level ticker + fast (~5s) live-context poll + plain-English rewrite + VuManChu visual all deployed; daily automated `/run` scheduling for the BOOK itself, and the session-level engine, still open. **Cross-reference dimension (2026-08-26, #3)**: `prevSessionVol` — the vol regime of WHATEVER session most recently closed (via the new shared `prevSessionVolBucket`/`PREV_SESSION` in this file, also used by Session Path and Session Handoff — one canonical "what closed before this" answer, not three), fills the gap `asiaVol`/`londonVol` leave for an Asia-session touch (neither is available yet — Asia hasn't closed, London/NY haven't happened). Checked against real EURUSD/GOLD touch-level continue/reverse: **a clean null, 0 held findings on both instruments** — the immediately-prior session's vol regime doesn't predict a SPECIFIC touch's outcome, a much more local/microstructure question than the aggregate clustering effect reaches (see Session Path's own entry for where this SAME dimension holds strongly). Reported as a null, not hidden. **Live-cache R2 snapshotting (2026-08-28) — fixes a real thundering-herd/OOM risk found building volatility_bot_v2.** `getFastLive`'s `liveCache` (the bar-close-driven live-context cache `/fastlive`, the portfolio page, and the new bot's plan producer all share) is in-memory only — wiped on every Railway restart. On a cold cache, `coldStartLiveCache` calls `loadM1ForPair`, which reads the FULL multi-year M1 parquet just to immediately discard most of it via `boundPacked` down to a 180-day window — expensive per pair, and genuinely dangerous when many pairs cold-start at once (a bot polling its whole `enabled_pairs` list right after a redeploy fires N concurrent full-parquet loads on the same tick). This is exactly what drove `volatility_bot_v2`'s plan producer to a real out-of-memory server crash in testing (see that entry's own note) — a per-tick concurrency throttle there caps the BLAST RADIUS, but the actual root cost (re-loading years of data just to keep a 180-day window) was still being paid every restart. Fixed at the SHARED cache, not the caller: `saveAllLiveSnapshots()` (new, exported) periodically (`server.js`, every 15min) mirrors every currently-warm pair's ALREADY-BOUNDED packed M1 window to R2 (`level-atlas/live-snapshot/<pair>.json`, via the SAME `putJSON`/`getJSON` helpers the book/votetrades artifacts already use — no new persistence pattern) — mirrors `AnalogML/refresh_m1.py`'s own R2 mirror for the identical "deploy wipes local disk" problem (CLAUDE.md). `coldStartLiveCache` now tries that snapshot FIRST (skipped if older than `MAX_SNAPSHOT_AGE_HOURS=72` — beyond that the gap-fill catch-up isn't meaningfully cheaper than a fresh load): a snapshot hit means a small R2 read + JSON parse instead of a full parquet load, then the SAME small `gapFillPacked` catch-up `getFastLive` already does on every warm poll. Falls through to the original `loadM1ForPair` path unchanged if no snapshot exists, it fails to parse, or it's stale — never worse than before this existed. New pure `packToJSON`/`packFromJSON` (typed-array <-> plain-array round-trip for JSON storage) exported + unit-tested (3 new tests in `levelAtlasRoutes.test.mjs`: exact round-trip, malformed-snapshot rejection, missing-volumes-column tolerance) — full suite (13 tests) still passes. R2 chosen over KV deliberately: this is large-blob data (~180 days of M1 x up to 17 pairs), R2 already owns Level Atlas's other persisted artifacts, R2 has no per-write-quota concern the way CF KV does here (documented elsewhere in this file), and `getJSON`/`putJSON` are confirmed fail-FAST (return null/false immediately, no network attempt) when R2 creds are absent — verified safe to no-op in the credential-less sandbox this was built in, confirming the earlier crashes were from local parquet loading, not R2 access. Added `VOLATILITY_V2_PLAN_REFRESH=0` env opt-out for `_refreshVolatilityV2Plan`'s scheduler (`server.js`, mirrors `REFERENCE_ENGINE_REBUILD`'s exact convention) — needed for real reasons beyond convenience: in a sandbox/dev env with no OANDA_KEY/R2 creds, every cold-start pays the full local-parquet-load cost on EVERY 45s tick (nothing to persist a snapshot TO without R2 creds), so the scheduler genuinely needs to be disableable for local UI work without touching the shared cache's own behavior. |
| **Session Path** | `js/sessionPathEngine.js` + `js/sessionPathReport.js` + `js/sessionPathRoutes.js` (2026-08-25) | the WHOLE-SESSION companion to Level Atlas — different question, same fitted ladder/M1 archive/OOS-holding discipline, never re-derived. Level Atlas cell = (side, rung), asks "just touched this line — continue or reverse?"; Session Path cell = (side, rung, checkpointHour, progress, shape), asks "given how far TODAY has already got toward a band, does the FULL SESSION go on to reach it?" — one row per day × checkpoint hour (`CHECKPOINT_HOURS` = 4,5,6,...,20, hours since session start ≈ London local time), not per touch. **The reversal trap this exists to avoid** (flagged by a user's colleague from a similar tool they'd built, and confirmed for real on this data): a naive version buckets days by "% of the way to the band at hour H" alone — that conflates a day still extending with a day that raced most of the way there and then gave most of it back, which are OPPOSITE setups. Every checkpoint tracks `progressFrac` (now) AND `peakFrac` (the best it got, a causal running max) so `shapeBucket` can split `2·extending` / `3·pulled-back` / `4·deep-reversal` by RELATIVE giveback (`reversalFrac/peakFrac`), not absolute distance — an absolute-threshold first draft showed "faded" at ABOVE-baseline odds (wrong direction, checked against real EURUSD); the relative version shows `4·deep-reversal` at a real, OOS-held NEGATIVE effect across nearly every rung/hour (e.g. down/p75@10h: 23.9%→12.7%, holds n=597/426) while `2·extending` shows large POSITIVE lift (up to +66pp OOS) — exactly the split the trap required. `SESSION_DIMENSIONS` (report layer) are tested AGAINST each cell's own base rate, mirroring Level Atlas's dimension-vs-cell architecture exactly: day of week, overnight gap, today's/Asia's/London's vol regime, yesterday's close location (all reusing the LITERAL SAME formulas as `levelAtlasEngine.js` — `sessionVolBucket` exported from there for this, not re-derived), and **`otherSideProgress`** (has the OPPOSITE side also moved today — the session-level analog of Level Atlas's `churn`, its single biggest touch-level effect) — validated for real: 96 held findings on EURUSD alone. Same fast-live-poll design as `levelAtlasRoutes.js` (`boundPacked`/`getFastLive`, ~180-day warm window, recomputes only on a new M1 bar, warm calls ~0ms) — `GET /api/session-path/fastlive/:instrument`, polled every 15s from `today.html`'s Vol & Path tab (`drSessPathSec`, `loadDrawerSessionPath`/`_startSessPathPolling`) since a whole day's shape moves slower than a price tick. Plain-English throughout, reusing the Level Atlas drawer's own `DIM_PLAIN`/`_plainVal` translator (the shared bucket values are computed by the identical formulas, so a shared label function is correct, not just convenient) plus new entries for `progress`/`shape`/`otherSideProgress`. Tested `js/sessionPathEngine.test.mjs` (12 asserts — causality, the reversal-trap split, session-gating, cross-side causality, momentum/VWAP population + causality) + `js/sessionPathReport.test.mjs` (7 asserts) + `js/sessionPathRoutes.test.mjs` (4 asserts, real EURUSD). **Momentum/VWAP-at-checkpoint (2026-08-25)**: `wtState`/`wtMtf`/`wtSlow`/`momAdx`/`htfTrend`/`vwapSide`/`confluence` added as `SESSION_DIMENSIONS`, computed the IDENTICAL way Level Atlas computes them at a touch (`createHtfContext`+`createConfluenceFeatures` from `confluenceFeatures.js`, one `htf`/`tf` per instrument, one WaveTrend series per day cached) — just called with `touchIdx` pinned to the checkpoint bar instead of a touch bar. Verified on real EURUSD: all 7 fields populate on every one of 184,155 rows (no silent-null wiring bug) with genuine spread across buckets (e.g. `wtState` splits 149k/17.5k/17k, not degenerate), and a dedicated causality test (perturb bars strictly after a checkpoint) confirms none of the 7 leak future information into an earlier checkpoint's reading — same technique as the existing progress/peak/otherSideProgress causality tests. Cost: the full EURUSD walk rose to ~103s (was cheaper before — checkpoints call `tf.compute` far more densely than Level Atlas's touch-only call sites, since a checkpoint fires every day/rung/hour regardless of whether price ever gets near it), acceptable for a nightly-scheduled background job. Deliberately NOT yet built: the options/gamma-regime dimension (data availability unchecked), and the cross-reference dimension (feeding "what does Session Path say about this rung" into Level Atlas as one more testable context field, so agreement/disagreement between the two engines gets evaluated empirically rather than assumed or blended) — explicitly kept "in the pocket" per owner instruction, not started. Full pair sweep run 2026-08-25: 29/30 `daily-brief` instruments built (BTCUSD has no M1 archive, same gap as Level Atlas) — the first attempt died 24/30 in from an unrelated deploy's server restart (in-memory job state, no trace left), caught via the manifest and resumed for the missing 5. **Visual polish + typical-day comparison (2026-08-25)**: the drawer card now shows a genuine "typical day" bar (`js/ladderPathStats.js`'s `ladderPathChain` — the fitted, unconditional walk-forward reach rate, previously unused in any UI) against "given today's shape" (the cell's own conditioned rate), in a highlighted callout box — the lift between the two (e.g. +22.8pp on a real EURUSD check) is what makes the conditional number mean anything; a bare percentage alone can't say whether today's setup is helping or hurting. **Nightly scheduling (2026-08-25)**: both this book and Level Atlas's were manual-`/run`-only, which is exactly what caused the silent mid-sweep deaths above — `server.js` now arms a `_scheduleDailyLondon(0, 30, ...)` nightly tick (London-anchored, not fixed-UTC, since both books' own `coverage.to` is a London calendar day — same DST-correctness reasoning as the existing vol-plan schedule) that fires both `startRunJob` functions (exported from `levelAtlasRoutes.js`/`sessionPathRoutes.js`) sequentially over the full `daily-brief` instrument list. Defaults ON (`Caps.referenceEngineRebuild` or `REFERENCE_ENGINE_REBUILD=0` env var to disable) — deliberately the opposite default of the existing vol-book-rebuild's opt-in convention, because these two books had no other freshness mechanism at all. **Card redesign + peak-time attribution fix (2026-08-26)**: two real bugs a user caught by cross-checking the live card against a real chart and a colleague's dashboard. (1) `checkpointHour` was rendered as `HH:00` — reads as a real clock time, but it's hours-elapsed-since-session-start, and worse, a checkpoint is a SAMPLE of the day's progress, not the moment the thing it describes happened (on real GOLD data, the checkpoint reporting "already reversing" fired 2+ hours after the actual peak). Fixed at the SOURCE: the engine now tracks `peakElapsedHrs` (when its running peak was actually set — causal, tested) instead of only `peakFrac`; the UI phrases it as "spiked around the 1.7h mark" using the real value, never the checkpoint's own hour. (2) Every band rendered the IDENTICAL shape sentence in its own full-size box, because they describe the same underlying price action against different target distances — five near-duplicate walls of text. Redesigned to one hero card per SIDE (real target price/distance from new `level`/`open`/`currentPrice`/`pip` row fields, the typical-vs-given-today bars, earlier-vs-now numbers) plus compact one-line rows for the other bands, which only grow their own sentence if their shape genuinely differs from the primary's. | ✅ live — 29/30 pairs built, nightly auto-rebuild armed, momentum/VWAP-at-checkpoint dimensions added, card redesigned with real price targets and peak-time attribution fixed after user validation against live data. **Cross-reference dimension landed here (2026-08-26, #3)**: `prevSessionVol` (shared `prevSessionVolBucket` from `levelAtlasEngine.js` — see that entry) checked against real EURUSD/GOLD `reachedLater`: a REAL, strong, cross-asset effect — **151 held findings on EURUSD, 174 on GOLD**, IS/OOS tracking closely (e.g. EURUSD up/p75@4h: prevSessionVol=3·wild → +23.9pp/+17.8pp, n=58/33). A wild prior session boosts reach-odds for EVERY remaining band by 20-30pp; a quiet one cuts them by a similar margin — consistent with Session Handoff's own vol-clustering finding (a wild session tends to hand off into another wild one, which naturally makes any given band easier to reach). This is where the cross-reference hypothesis actually paid off, unlike Level Atlas's own null on the same dimension for its more local touch-level question. | ✅ live — 29/30 pairs built, nightly auto-rebuild armed, momentum/VWAP-at-checkpoint dimensions added, card redesigned with real price targets, peak-time attribution fixed, and the cross-reference dimension validated as a real (not null) finding; options-regime dimension unchecked |
| **Session Handoff** | `js/sessionHandoffEngine.js` + `js/sessionHandoffReport.js` + `js/sessionHandoffRoutes.js` (2026-08-25) | the SESSION-BOUNDARY companion to Level Atlas/Session Path — neither of those has a ladder-free question; this one is purely session-to-session (Asia/London/NY handoffs), no sigma/rungs/ladder at all. One row per (day, transition), reusing `sessionRangeSeries`/`sessionVolBucket` from `levelAtlasEngine.js` (extended to also carry `open`/`close`, not just hi/lo — additive, backward compatible, re-verified against `levelAtlasEngine.test.mjs`'s full 29-assert suite). **The chronological mapping was checked empirically before writing the walk, not assumed from key naming** — a real risk this codebase has been bitten by before (see `sessionRangeSeries`' own header): actual session start times show the order is London(D)→NY(D)→Asia(D)→London(D+1), i.e. **Asia is the one that crosses the date boundary**, not NY→Asia as the "Asia→London/London→NY/NY→Asia" naming might suggest — a dedicated test locks this in with a hand-placed step-price fixture across all three hops. Every closing session gets a **shape** read carried over from Session Path's own reversal-trap lesson, one level up: `side` (which direction it tried to go — whichever of high-open/open-low is bigger), `giveback` (`1·held`/`2·partial-giveback`/`3·full-reversal` — how much of that extent it surrendered by its own close), `travel` (this session's version of Level Atlas's `churn`: `1·churned`/`2·mixed`/`3·driven`, one-sidedness within its own range). **Two SEPARATE outcomes, tested separately, because they got two separate answers**: `continued` (does the NEXT session's close end up further in `side`'s direction, close-to-close so an index's real overnight gap counts) — checked on real EURUSD/GOLD/GBPUSD/US30/NQ: a clean, honest **48-53% coin-flip on every cut** (side/giveback/travel/vol, every instrument) — reported as a null, not hidden; and `nextVol` (is the NEXT session's own realized-range regime `3·wild`) — a real, strong, MONOTONIC, cross-asset effect: a `3·wild` closing session roughly **2-4x** more likely to hand off into another wild session than a `1·quiet` one (EURUSD 16.5%→32.7%, GOLD 14.6%→33.8%, US30 10.8%→40.5%), with IS/OOS rates tracking closely (e.g. EURUSD London→NY wild: 39.0%/39.4% — almost no decay) — consistent with the established GARCH/vol-clustering literature, unlike session-to-session directional persistence which efficient-market theory gives no reason to expect. `sessionHandoffReport.js` builds **two books from the same rows** via one generic `buildBook` (cell-key + outcome-predicate parameterised, not two copies of the IS/OOS-split logic): `buildContinuationBook` (cell = transition|side|giveback) and `buildVolClusterBook` (cell = transition|vol) — **the continuation book's own "held" dow-dimension findings show NO cross-instrument consistency** (a different day-of-week clears the bar for almost every instrument/cell) — flagged explicitly as very likely multiple-testing noise sitting on top of an already-null primary outcome (CLAUDE.md's "count the cells, state the chance-baseline" guidance), NOT presented as a real finding; the vol-cluster book's PRIMARY CELL rates themselves, needing no secondary dimension at all, are the actual headline result here. Same fast-live-poll pattern as the sibling engines (`boundPacked`/`getFastLive`, 180-day warm window) — `GET /api/session-handoff/fastlive/:instrument` returns the most recently CLOSED handoff per transition (of up to 3), matched against both books; `today.html`'s `drHandoffSec` (Vol & Path tab, `loadDrawerHandoff`/`_startHandoffPolling`, 30s poll — a session closes only every few hours) shows both reads side by side per transition, the continuation chip's arrow/colour reflecting the EFFECTIVE expected direction (side, flipped when continuation itself is the LESS likely outcome — a raw "41% continuation on the down side" needs exactly this translation to read as "more likely to bounce"), with a plain `🪙 Toss-up` when the continuation read is within 5pp of 50%. `DIM_PLAIN` (shared with the sibling engines) gained `travel`/`giveback` entries. Tested `js/sessionHandoffEngine.test.mjs` (9 asserts — the chronological-mapping fixture, shape bucketing, no-lookahead, `nextVol`'s own prior-history correctness) + `js/sessionHandoffReport.test.mjs` (5 asserts) + `js/sessionHandoffRoutes.test.mjs` (4 asserts, real EURUSD). Wired into the same nightly `_scheduleDailyLondon(0,30,...)` tick as Level Atlas/Session Path (`server.js`, `REFERENCE_ENGINE_PAIRS`), and into `js/siteApiMap.js`'s API Map (which also picked up Session Path's own long-missing entries here). | ✅ live — engine/report/routes/UI built, validated, and deployed 2026-08-25; nightly auto-rebuild armed; full pair sweep run same day: **29/30** `daily-brief` instruments built in ~7 minutes total (BTCUSD failed — no M1 archive anywhere, the same known gap as Level Atlas/Session Path, not a bug) — spot-checked EURUSD's live card post-sweep: both books present with real cells matching the local validation exactly (e.g. `London→NY|2·normal` base 24%/22.9%, n=1033/647). **Persistence + continuous magnitude (2026-08-26, #4)**: `prevVol` — the session BEFORE the one that just closed (shared `prevSessionVolBucket`, one hop further back than `vol`), added to `VOL_CLUSTER_DIMENSIONS` — tests whether the clustering effect has memory beyond a single handoff. Checked on real EURUSD/GOLD: **it does** — 7 held findings on EURUSD, 9 on GOLD, and notably `prevVol=3·wild` adds FURTHER lift even on cells already conditioned on the immediate predecessor (e.g. GOLD `London→NY|3·wild :: prevVol=3·wild` → +14.2pp/+14.7pp on top of the cell's own already-elevated base rate). Also added `meanNextRatio` (IS/OOS mean of the continuous `nextRatio`, not just the `3·wild` threshold) to every `buildVolClusterBook` cell — descriptive, not holds-gated, since a mean needs no pp-delta test to be meaningful the way a rate does. Shows a clean, monotonic, cross-asset, IS/OOS-STABLE pattern: a wild closing session precedes a next session running ~1.28-1.4x its own typical range on both instruments (e.g. EURUSD `London→NY\|3·wild`: 1.38/1.369; GOLD same cell: 1.371/1.386 — almost no IS→OOS decay). | ✅ live — engine/report/routes/UI built, validated, deployed, and full pair sweep run 2026-08-25; persistence dimension + continuous magnitude stat validated as real findings 2026-08-26; cross-reference dimension (#3) still parked, was built into the SIBLING engines instead (see their own entries) |
| **VWAP Extension Atlas** | `js/vwapExtensionAtlasEngine.js` + `education/vwap_extension_atlas/scripts/run_one.mjs` (2026-08-25) | a FOURTH reference-book sibling to Level Atlas/Session Path/Session Handoff (`MD files/REFERENCE_ENGINE_PLAYBOOK.md`) — built at the owner's request to answer "when price extends away from session VWAP, what does history say happens next, and does session/time/vol/range/regime matter" as a reference question, deliberately NOT a fifth VWAP trading engine (three standalone VWAP mechanisms are already tested null — see `VWAP_REVERSION_FINDINGS.md`, `jordan_vwap_session_reversion_backtest/RESULTS.md`; this book doesn't re-test a rule, no after-cost gate anywhere). Unit: one row = one bar where cumulative distance from that UTC-day's own VWAP (session anchor kept IDENTICAL to the two null engines, for direct comparability), in that day's own Wilder ATR-14 units, first crosses a fixed threshold (1.0/1.5/2.0/2.5×ATR) on one side — first crossing per side/threshold/day only (re-arm not built, logged as a deliberate gap in the engine file's own footer). Outcome scanned forward, capped at day-end: `touchedVwapAfter`, `barsToVwapTouch`, `peakExtAtr` (causal running max — the same reversal-trap-safe pattern Session Path uses, verified by a dedicated causality test engineering an "immediate fade" vs "extend-further-then-fade" pair of synthetic days and asserting they're told apart), `didExtendFurtherFirst`, `pctRetraced`, `wentToOppositeSide` (continues through VWAP to the other side's own threshold — the ICT "VWAP as pivot" case). Context dimensions REUSE existing bricks, never re-derived: `computeSessionVwap` (`vwapReversionEngine.js`), `atrWilder` (`indicatorCore.js`), `classifyDayType`/`dayTypeScore` (`dayTypeCore.js`), and `featWtMtf`/`featWtSlow`/`featMomAdx`/`featHtfTrend` called directly from `confluenceFeatures.js` (skipping `vwapSide`/`confluence`, which need a rung `level` this engine's unit doesn't have — calling `createConfluenceFeatures().compute()` with `level:null` would silently mis-bucket via a NaN comparison, so the four causal exported feature functions are called directly instead); `session`/`sessionPos`/`dow`/`dayVolRegime`/`rangeConsumedBucket` are small local calcs (the UTC-hour `sessionOf` bucketer is ALREADY duplicated privately in `levelAtlasEngine.js` and `sessionPathEngine.js` — a third local copy documented as consistent with that existing, tolerated pattern, not a new one). Tested `js/vwapExtensionAtlasEngine.test.mjs` (5 asserts: end-to-end shape, §6.1 perturb-the-future causality, §6.4 tautology-immunity — a day's own huge range must not leak into that SAME day's `dayAtr`/`dayVolRegime` — §6.3 reversal-trap split via the immediate-fade/extend-further synthetic pair, and an unresolved-day censoring check). **First run, 4 instruments (gold/NAS100/EURUSD/GBPUSD, real OANDA M1 2016-2026, 60/40 IS/OOS, holds gate n≥30 both halves same sign both halves |Δ|≥3pp both halves)**: headline base rate — only 12-30% of ≥1×ATR VWAP extensions touch VWAP again the same UTC day across all 8 (instrument×side) cells, 80-90% extend further before ever touching it if they touch it at all; `session=NY` holds OOS on 7/8 cells (same dimension, same direction, every time — extensions that first clear the threshold during NY persist more than the all-session base rate, the one miss (NAS100-up, sign flip OOS) reported not hidden); `approachSpeed=grind` holds on 4/8 cells same direction; a handful of single-instrument momentum/regime hits reported but explicitly NOT promoted alongside the two cross-instrument findings (765 total buckets tested, 19 held — the chance-baseline caveat is stated directly in RESULTS.md). **Pooled-across-instruments follow-up**: Asia/London were originally excluded per-instrument for insufficient n (9-23 per half), not tested null — pooling threshold=1.0 rows across all 4 instruments gives `session=London` its own real, OOS-held, n≥30-both-halves finding in the OPPOSITE direction from NY (both sides positive delta, e.g. up +18.9pp IS/+44.4pp OOS) — London extensions fade back MORE than average, NY LESS; Asia stays inconclusive even pooled (up-side sign flips OOS). **Confirmation-timeframe sweep (`confirmTfMinutes` param, new script `scripts/confirm_tf_sweep.mjs`)**: added to test whether "touch" means something different depending on whether an M1 wick or an actual Nm-close confirms it (this group's own "closes not wicks" convention) — VWAP itself still computed from every M1 bar, only the crossing/touch/peak signal is resampled to bucket-closes at 5/15/30/60/240min; default `confirmTfMinutes:1` is byte-identical to the original wick-based reading (regression-tested). Swept 1m/5m/15m/30m/1h/4h on all 4 instruments: the base fade-back rate declines close to monotonically in all 8 cells as confirmation gets stricter (e.g. gold-up 18.7%→14.2%→10.0%→7.4%→3.4%→1.8%), making the headline "extensions mostly don't fade back" finding stronger under a more realistic reading, not weaker; the NY<London session ordering never flips across any of 24 independent (instrument×side×timeframe) comparisons checked, though 1h/4h cells are directional only (n too thin to gate-test). Full detail: `education/vwap_extension_atlas/RESULTS.md`. Only threshold=1.0×ATR is usably sampled at the base confirmation timeframe (higher thresholds: 2-40 rows/cell, kept in `data/<pair>.rows.json`, not reported as findings) — extending to more instruments is a cheap follow-up (~30s/instrument incl. M1 load). | none yet — reference-book layer only, no Route/UI built (playbook §4: optional, not needed to answer the question asked) | ✅ (reference book; not a trading rule) |
| **VWAP Fixed-Sigma Atlas** | `js/vwapFixedSigmaAtlasEngine.js` + `education/vwap_fixed_sigma_atlas/scripts/run_one.mjs` (2026-08-26) | a FIFTH reference-book sibling, but unlike the other four this one is a faithful 1:1 port of the OWNER'S OWN Pine Script indicator ("VWAP Fixed Sigma + MFE MAE" — owner-authored, not reverse-engineered), crossed against the owner's actual stated hypothesis: session vol × VWAP-sigma-band-touch × multi-timeframe VuManChu divergence agreement → historically repeatable setup? Genuinely different band mechanism from every VWAP construction already in this repo: `fixedSigma` = mean of the trailing 20 SESSIONS' own RMS-distance-from-VWAP (`sqrt(mean((hlc3−sessionVWAP)²))` per completed session), LOCKED for the entire next session — never recomputed intraday. This is the key difference from `js/vwapReversionEngine.js`'s already-tested-null ±2σ band, whose σ grows CONTINUOUSLY within the same day (tiny/unstable early, wide by the close) — a real mechanism difference, not a relabelling. Bands = session VWAP ± fixedSigma × {2,2.5,3}σ (the Pine's only measured levels; 1/1.5σ are touch-plotted only in the source, never tracked). Fresh-touch definition ported exactly including the Pine's own off-by-one repaint-avoidance (close[k-1] vs level[k-2], wick[k] vs level[k-1]); direction fixed by band side (upper=hypothetical SHORT, lower=LONG, always a fade); one active MFE/MAE event per (side,level) slot, CAN re-arm multiple times per day unlike the sibling engines' first-crossing-only design — 22,897 events on gold alone vs ~150-400 for the ATR-threshold sibling. MFE/MAE run a fixed 20-bar window (owner's own default), in price AND normalised by `fixedSigma` at touch time. **Added beyond the Pine** (the owner's actual ask, not in the source): context dimensions crossed against the same outcome — session/dow/HTF-trend/ADX/dayType/sigmaPctile (all reused bricks) and, the new piece, **`divAgree`** (0-4: how many of {1m,15m,1h,4h} WaveTrends show a real `divergenceCore.reversalDecision`-confirmed regular divergence at the touch — reuses `createHtfContext`'s already-computed 15m/1h/4h WaveTrend + one fresh M1 pass; `reversalDecision`'s own side convention maps directly onto the Pine's upper=short/lower=long fade direction, zero re-derivation needed). Perf fix applied before running for real: `divergenceCore.reversalDecision` rescans bar-0-to-touchIdx on every call by design (fine for occasional calls) — bounded to a 200-bar trailing window per call (`boundedReversalDecision`) since this engine fires thousands of events over millions of M1 bars, well beyond the default reach(2)/window(5) so no real pivot pair is ever clipped. Also fixed en route (caught by its own test): an initial stateful forward-only day-index cursor broke when queried backward for k-1/k-2 within the same loop iteration — replaced with a precomputed O(1) per-bar day-index lookup table, eliminating the whole bug class rather than reordering calls around it. Tested `js/vwapFixedSigmaAtlasEngine.test.mjs` (4 asserts: end-to-end shape, §6.1 perturb-the-future causality, fixedSigma genuinely constant within a session — not the growing-σ shape of the already-null sibling, and hand-verified MFE/MAE arithmetic on an engineered path). **First run, gold only (real OANDA M1 2016-2026, 60/40 IS/OOS, holds gate n≥30 both halves same sign both halves \|Δnet-σ\|≥0.10 both halves)**: a real, honest null on the actual hypothesis tested — every cell's MFE/MAE-in-σ sit close to balanced (~0.47-0.6σ each), net-σ consistently slightly negative (-0.03 to -0.07), "MFE reached before MAE" 48-52% (coin flip), same shape as `VWAP_REVERSION_FINDINGS.md`'s already-null σ-band fade on a genuinely different band construction. `divAgree`≥2 cells have n=2-18 (too rare to trust — 2+ of 4 timeframes agreeing in the same ~5-bar window is a strict conjunction); divAgree=0-vs-1 doesn't move net-σ in a consistent direction. **0/138 dimension buckets held OOS** — the 4 closest (session=Asia ×2 cells, dayType=TREND, divAgree=1 on long\|3) all showed a real-looking IS delta that collapsed/flipped OOS, this repo's own recurring illusory-effect signature (same pattern already documented in `FADE_EXTENSION_TRADE.md`). Full detail: `education/vwap_fixed_sigma_atlas/RESULTS.md`. One instrument only so far (walk itself ~10s on top of ~18s M1 load — extending is cheap); one divergence definition/window and one MFE/MAE horizon, both the owner's own indicator defaults, not swept. **`resolutionMode:'returnToVwap'` addition (2026-08-26, same file, default `'fixedWindow'` unchanged/regression-tested)**: a second outcome mode answering the pure trend question — does price get back to VWAP, when, does it extend further first — session-capped, censored not discarded at session end (2 new tests). Gold run: 6,979 events, 39/136 dimension buckets held OOS, headline `session` holding on all 6 cells (Asia>London>NY reversion ordering). **Process note, caught late: this substantially duplicates the row-50 `js/vwapFixedSigmaEngine.js`'s own return-to-VWAP book (`GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §7), not checked for before building this second engine.** That book is strictly more rigorous on this exact question — it reads every rate against a random-walk control (this engine has none, so its raw base rates can't be told apart from the well-documented "VWAP mechanically converges toward price" artifact) and uses a fixed-240min horizon specifically because a session-capped outcome (which is what this engine still uses) produced a spurious late-session-touches-have-less-time-left finding in their first draft. Since NY sits later in the UTC day, this engine's own NY-reverts-least reading is likely partly that same confound, not independent evidence — §7 already proved the same direction is real (random-walk-controlled, cross-instrument replicated), so the conclusion holds, just not because of this run. The one dimension genuinely not in row 50: `divAgree` (multi-TF divergence agreement, vs their WT-state buckets) — held on 1/6 cells near-threshold, consistent with (not adding to) §7b's own "momentum/WaveTrend conditioning is thin, gold-only" finding. Recommendation for whoever picks this up next: either retrofit the fixed-horizon + random-walk control onto this engine before trusting its own session finding, or fold `divAgree` into row 50's engine instead of maintaining two near-duplicate bricks. Caveat written up in `education/vwap_fixed_sigma_atlas/TREND_ANALYSIS.md`'s own header box. | none yet — reference-book layer only, no Route/UI built (playbook §4) | ⚠️ (reference book; divAgree null/thin, session finding unvalidated on its own — see row 50 for the validated version of this question) |
| **VMC Triple-TF Circle v1** | `js/vmcTripleTfEntryV1Engine.js` (2026-08-26) | tests the trading-group pattern from the owner's screenshots — the Cipher B circle (WT 9/12/3 cross while beyond ±53) printed on 1m/3m/5m within 15min → buy, mirrored sells (`MD files/VMC_TRIPLE_TF_FINDINGS.md`, pre-registered with `vumanchuLab/`'s results as priors). Composes `vumanchuCore.computeWaveTrend`, `barUtils`, `causalAtr`, `walkBars`, `syntheticRandomWalkPacked` (control); exports `circleTimes` + pure `alignmentEpisodes` for unit-testability. **Result: the pattern fires 5–6×/day/side (comparable rate on a random walk — not selective); buys carry a whisper of drift (+0.2–0.5bp/h, win +2–4pp, direction matching the Lab's zone finding; overlap-inflated t caveat stated; part is gold's own decade drift); sells nothing; trade test NULL both sides all 4 instruments (OOS n≈5k/cell, t −5.6…−8.3, gross ≈ +0.001% vs 0.012–0.02% cost — the whisper is ~10× below cost).** Confirms the Lab's verdict at the exact circle-event level: VuManChu reads state usefully (context), it does not time entries profitably on its own. Tested `js/vmcTripleTfEntryV1Engine.test.mjs`. Runner `scripts/run_vmc_triple_tf.mjs`. | offline script only | ✅ (null as entry, pre-registered; event-level confirmation of vumanchuLab) |
| Per-line strategy | `js/perLineStrategy.js` | per-line confidence engine — `extractTouches`, `buildPolicy` (fade/follow/skip per cell, IS-learned, **after-cost expectancy gate**, pluggable `pricer` — Lego Principle 2, one primitive parameterised; **Batch 7: opt-in `tStat` significance gate** — the chosen side's mean/SE over per-touch after-cost PnLs must clear `tStat`, else `skip` with `reason:'notSignificant'`; default 0 = exact prior behaviour, `levelsV2Learn.learnAndFreeze` alone defaults 1.5 (a mild noise filter, NOT HLZ |t|>3 discovery-grade — per-cell 3.0 would nuke the book); plumbed through `runPerLine`/`runRigor`/`runSensitivity` (opt-in `grids.tStat` sweep) so the analyser can sweep it), `pnlFor` (triple-barrier + honest mark-to-close — the DEFAULT pricer), `pnlHeld` (prices a touch under the **§13 held-chandelier trail** instead, reusing the analyser's precomputed `fChand`/`fChandFade` — pass as `buildPolicy`'s `pricer` to gate/grade on the proven exit; used by `levelsV2Learn.js`'s v3 per-instrument learner and available to `runPerLine`), `runPerLine` (pooled-IS → per-pair OOS book + equity + trade log + **portfolio** stats + **`survivors`** live-universe block), **`buildSurvivors`** (keep pairs whose OOS net expectancy clears their own spread by a margin, re-aggregate just their daily PnL into an honest portfolio), **`runRigor`** (walk-forward / per-year / cost-sensitivity / IS-vs-OOS), **`runSensitivity`** (OAT parameter grid → per-combo Sharpe/breadth + per-obs trial Sharpes for deflation), **`runExitStudy`** (OOS A/B/C/D/E of the exit RULE — fixed triple-barrier vs chandelier trail vs walk-forward breakeven stop vs **ride** (chandelier, NO TP cap, session-close fallback) vs **ridehold** (ride that holds past session close into the next day[s]) — holding the IS-learned entry policy fixed and swapping only the exit; aggregates each rule overall/fade-only/follow-only via `portfolioStats`+`summarizeTrades`, prices from the analyser's pre-simulated `ex*` gross PnLs, nets **cost + follow entry-slip + ride exit-slip** (the rides exit ~99% on a trailing/disaster STOP → charged a market-exit slip leg the fixed TP is not, via each ride trade's `why`), counts records missing the fields, marks the best-Sharpe rule per group at n≥30; also emits **`costStress`** (overall Sharpe re-netted at 1×/2×/3× cost — the make-or-break for a thin-expectancy edge) and, for the two rides, **`composition`** (% of taken OOS trades exiting on the trail / disaster-stop / session-or-horizon **close** — a high close% ⇒ really "hold-to-close", needs a live EOD close)); **`runExitGateSweep`** (re-learns the entry policy at several `marginPct` gates and reports the ride/ridehold overall Sharpe + its 2×/3× cost-stress + trade count at each — tests whether concentrating on fewer, higher-expectancy fade cells makes the thin ride edge survive 2× cost, i.e. whether a tradeable subset exists); **`runRideRigor`** (walk-forward folds + per-year + per-pair **breadth** + IS→OOS retention on the STRICT-GATE ride, pricing the ride exit via `priceRideTrades` with the honest cost — the guard against single-split luck / gate-overfit before the ride goes to paper; `buildExitStudy` attaches it as `rideRigor` at the gate-sweep's cost-robust winner, default marginPct 0.05); **`extractTouches` supports a `dayType` condition** — a SIGNED **ex-ante** trend-day bucket (`tU`/`rng`/`tD`) derived from the window's `signedT` (`|signedT|≥dtThresh`, default 0.33), attached to every touch and usable in the cell key (window-level, no lookahead: `signedT` is `classifyDayType`'s pre-session forecast); **`runDayTypeStudy`** (OOS A/B — velocity-only vs velocity×day-type — runs `runPerLine` twice on the SAME data/split/costs, reports each book's OOS Sharpe/CAGR/maxDD/expectancy + fade/follow/skip breadth, marks `gatedWinsOos` at Sharpe≥baseline ∧ n≥30, plus the **fade-into-trend diagnostic**: the OOS touches the baseline FADES against the forecast trend — the "selling into a rally" losers — with baseline vs gated net PnL and the gate's skip/flip/fade counts); **`runStopStudy`** + **`pnlAtSL`** (per-pair STOP-LOSS study — the fade stop is currently the outer band line; re-prices every OOS fade under a TIGHTER candidate SL off the stored `extPct` adverse excursion with **no M1 re-sim**: `extPct>s`→stopped `−s`, else keeps its original outcome; **tightening-only** — candidate clamped per-touch to `min(s,distOut)`, wider stops need M1 re-simulation (follow-up); **conservative** ordering; grounds the grid in each pair's **winners'-MAE** percentiles + σ-fractions of the median band; picks `bestSL`=argmax OOS Sharpe (tie-break expectancy) among candidates at n≥30 else falls back to the band SL; returns per-pair {winners-MAE p50/75/90/95, bandSL, bestSL, exp/Sharpe band vs best} + a portfolio A/B **band vs per-pair-optimal vs asset-class-optimal** with deltas; `pnlAtSL(t,distOut)` reconciles with `pnlFor`'s fade result); `runPerLine` also emits a **`missed`** summary (skipped OOS touches by reason: unseen-in-IS / low-N / edge-below-cost); the touch also carries an optional **`sigmaPct`** passthrough (the session's ex-ante σ from the range-line analyser — `volSizeWeights`/`runVolSizing`'s input; null on records built before it shipped → the overlay degrades to weight 1) | `forecastAnalyserStore` (orchestrator + routes; `buildDayTypeStudy` → `/api/forecast-analysis/daytype-study/:horizon`, Day-Type tab §(d); `buildStopStudy` → `/api/forecast-analysis/stop-study/:horizon`, **Stops** tab); imports `metricsCore`, `backtestStats`; tested `js/dayTypeGate.test.mjs`, `js/stopStudy.test.mjs`. **prevSessionVol cross-reference test (2026-08-26)**: does folding Session Handoff's own validated dimension (vol regime of whatever session most recently closed — see that engine's LEGO entry) into the fade/follow policy improve THIS strategy's actual OOS book, rather than assuming a touch-level edge carries over from a different outcome. Wired the SAME `prevSessionVolBucket` brick into `forecastAnalyser.js`'s `analyseWindow`/`runAnalyser` via a **callback** (`prevSessionVolFor`), not a direct import — `levelAtlasEngine.js` already imports `bucketM1IntoSessions` FROM `forecastAnalyser.js`, so the dependency can only point one way (same reasoning already established for the `tf`/`confLevelsFor` packs). `forecastAnalyserStore.js`'s `refreshPair` builds the callback from `sessionRangeSeries(packed)` once per pair, unconditionally (cheap — the fastest of the three reference engines already runs this exact walk). New `runPrevSessionVolStudy` (`perLineStrategy.js`) mirrors `runDayTypeStudy`'s exact OOS A/B architecture. **Result, run on 5 real pairs (EURUSD/GBPUSD/GOLD/USDJPY/AUDUSD), 14,555 OOS touches, 99.7% coverage**: baseline Sharpe 4.74 / expectancy 0.317% / 6,630 trades vs gated (+prevSessionVol) Sharpe 4.62 / expectancy 0.329% / 5,025 trades — `gatedWinsOos: false` (Sharpe went slightly DOWN; the marginal expectancy gain came with 1,605 fewer trades from cell fragmentation, not a clean win). **An honest null, consistent with Level Atlas's own touch-level finding** (0-1 marginal held findings for the same dimension) — a session's just-closed vol regime predicts that SESSION's own upcoming volatility (Session Path: strong; Session Handoff: strong) but says little about the DIRECTIONAL fade-vs-follow call at one specific line touch, a much more local question. Kept as reusable infrastructure (the callback wiring + `runPrevSessionVolStudy`) for testing this or other cross-reference dimensions against different strategies later — not deployed to any live route/UI, this was a research question, not a shipped feature. Tested `js/prevSessionVolGate.test.mjs` (13 asserts — callback threading, cell-key folding, a constructed real-edge scenario the gate correctly captures, a noise scenario that doesn't fabricate a win). | ✅ |
| **Level Atlas vote review** | `js/levelAtlasVoteReview.js` (2026-08-26) | MFE/MAE magnitude check on a fade/follow decision built from Level Atlas's OWN per-touch context (`matchLiveContext`'s `supports`/`challenges`/`context` dimension votes), NOT the live `volatility_bot`'s own policy (that bot has lost ~$2.7k live on 71 trades, 42% win rate, trading the LEGACY 8-line OC/HL geometry — a different, less-validated line family than Level Atlas's fitted O-H/O-L ladder; see `pylego/strategy/volatility.py`'s `line_levels`). `voteDecision(book, touch)` counts how many of a touch's OWN held dimensions favour continuation ('out') vs reversal ('back') — **must sum `supports`+`challenges`+`context`, not just the first two**: `matchLiveContext` only splits into supports/challenges when the cell's own coarse `(side,rung)` lean is non-neutral; on a neutral-lean cell every matched dimension lands in `context` instead, and an early draft that summed only supports+challenges silently returned "no decision" on every one of those touches (caught by a synthetic unit test before any real-data run, not after). `reorientExcursion(touch, decision)` re-labels the ALREADY-COMPUTED, decision-agnostic `fadePips`/`runPips` (causal, from `atlasWalk`'s own path walk) into MFE/MAE for whichever side was picked — same re-labelling convention `perLineStrategy.pnlFor` already uses, not a second simulation. `reviewVoteBacktest` reports win rate + mean/median MFE/MAE (% of price) + E-ratio (MFE÷MAE), broken out overall/by rung/by vote margin, `p90` excluded by default (its ladder has no further rung, so a 'follow' decision there can mechanically never win — a structural artifact of the ladder, not signal, caught before reporting the raw number). **Real bug found and fixed en route**: `atlasWalk`'s touch record never carried the day's `open` price under that name (only `level`/`pip`/`fadePips`/`runPips`/etc.), so every `mfePct`/`maePct`/`eRatio` silently computed to `null` on real data despite the module's own 14 synthetic unit tests passing (the tests' hand-built fixtures happened to set `open` explicitly). Fixed by adding `open` (already in scope in `atlasWalk`, used for other fields) to both the real-touch and pending-touch records in `levelAtlasEngine.js` — re-verified against that file's own 32-assert regression suite (no other field's behaviour changed) before re-running. **First real-data pass (initial, later found wrong — see correction below)**: the module's own 14 synthetic unit tests all passed, but real 5-pair MFE/MAE numbers came back with E-ratio well below 1 in almost every bucket (overall 0.17-0.37) — average MAE looked like it ran 2-6x average MFE, making the win-rate dose-response look economically worthless after cost. **This was itself a bug, not a finding — caught by the owner asking for the fade/follow decision mix before accepting the null.** Root cause, found by splitting `reviewVoteBacktest`'s rows by `decision` (new `byDecision`/`byMarginDecision` breakdown, tested via a T4 fixture that gives fade and follow the SAME underlying pips on purpose, so the only way their E-ratios can differ is a labelling bug): every `fade`-decision touch showed NEGATIVE mean MFE, including inside 90%+-win-rate subgroups — impossible if `fadePips` meant what its own inline comment claimed. Traced to `atlasWalk`'s `fadePips = (here - deepest) / pip * sgn * -1` (`levelAtlasEngine.js`) — `deepest` is bounded so `(here-deepest)` is already correctly signed by `sgn` alone (verified algebraically both sides); the extra `* -1` flipped it, making `fadePips` ≤0 on BOTH sides instead of "+ve = gave back distance" as documented. A real, previously-undiscovered sign bug, silently present in every `avgFadePips` the book/text export has ever shown. **Fixed** (dropped the stray `* -1`); re-verified against `levelAtlasEngine.test.mjs`'s 32 asserts and `levelAtlasReport.test.mjs`'s 24 asserts — untouched, nothing else depended on the broken sign — before re-running. **Corrected result, same 5 pairs, same split**: the picture reverses. At vote margin ≥3, after-cost net edge is **consistently positive for both fade and follow, in every pair, at real sample sizes (n=100-400+)** — e.g. EURUSD margin=4 fade +0.078%/follow +0.078% (n=111/287), GBPUSD margin=5 fade +0.114%/follow +0.102% (n=96/175), USDJPY margin=5 fade +0.122%/follow +0.092% (n=83/232) — and the edge **increases with margin monotonically in every pair**, not just the win rate. Margin=1-2 (most of the raw touch volume) stays near breakeven, so a tradeable version would need a margin≥3 filter, cutting opportunity count substantially. One real inconsistency, not smoothed over: GOLD's fade decisions specifically stay flat-to-slightly-negative through margin=3 even though GOLD's follow decisions are solidly positive there. **Still not a claim of a tradeable edge**: MFE/MAE are the best/worst points the path actually reached, not what a real fixed take-profit/stop order would have captured — the honest next step is pricing this with an actual barrier exit (`perLineStrategy.pnlFor`'s own convention) and walk-forward/cost-stress testing it, per this project's standard backtest discipline, before anything gets called tradeable. **Honest barrier pricing + walk-forward (2026-08-26, same day)**: MFE/MAE is still the best/worst point the path reached, not what a real bracket order pays — `priceBarrierTrade(touch, decision, cost)` prices the ACTUAL fixed target/stop instead, using two new `atlasWalk` fields (`innerDistPips`/`outerDistPips` — the real rung distances, known at the moment of touch, before outcome resolves; plus `time`/`resolveTime`, the entry/exit timestamps, added for the visualizer below). A 'fade' targets the inner rung and stops at the outer; a 'follow' is the mirror — win pays the FIXED target distance, loss costs the FIXED stop distance, no path-dependence at all. `buildBarrierTrades(touches, book, opts)` builds the real trade list (`minMargin` gate); `runBarrierWalkForward` reuses `metricsCore.summarizeTrades` (no new metrics invented — Sharpe+its own error bar, profit factor, min track record, skew/kurtosis-adjusted, max DD) per year and at 1x/2x/3x cost. **Result, same 5 pairs, same OOS split**: at vote margin≥3-4, walk-forward Sharpe runs 2.3-4.7 (annualized, error bar ±0.48-0.5), **positive expectancy in 24 of 25 pair-years tested** (the one exception: GOLD 2022 at margin≥1 only, Sharpe -0.08, essentially flat — recovers by margin≥2), profit factor 1.5-2.3, survives 3x cost stress everywhere (e.g. EURUSD margin≥4: 0.084%→0.068%/trade at 3x cost), and `minTrackYears` (0.2-0.7) says very little history is needed to trust Sharpe>0 at 95% — a symptom of how stable the effect is, not an assumption. This is the strongest, most rigorously checked positive result of this whole session's work. **Two real caveats, not smoothed over**: (1) touches aren't strictly independent trades — the same instrument can have multiple overlapping/same-day touches across rungs, and `summarizeTrades`' Sharpe annualization assumes IID per-trade returns, so the TRUE achievable Sharpe is likely lower than reported (direction and profitability are still credible — magnitude isn't guaranteed); (2) no concurrent-position sizing policy exists yet for when multiple rungs are live on one instrument at once — a real implementation needs one before this is actually tradeable, not just directionally validated. Tested `js/levelAtlasVoteReview.test.mjs` (26 asserts total — T5 prices win/loss/cost correctly for both decisions and returns null on an unpriceable p90-follow or missing open, T6/T7 check `buildBarrierTrades`/`runBarrierWalkForward` end-to-end incl. `minMargin` filtering, byYear splitting, and cost-stress ordering). `levelAtlasEngine.test.mjs`'s 32 asserts and `levelAtlasReport.test.mjs`'s 24 re-verified untouched after the new fields were added. **Visualization**: `level-atlas-vote-backtest.html` (new page, registered in `js/siteApiMap.js`/`SITE_MAP.md`'s WIP group) — pair + min-margin + decision/outcome filters, a sortable/filterable trade table, and a real M1 candle chart (`js/levelChart.js`'s `createLevelChart`, reused not copied; three new `KIND_STYLE` entries — `voteEntry`/`voteTarget`/`voteStop` — added there for this) with entry/exit markers (win=green arrow, loss=red) and the trade's actual target/stop price lines, computed client-side from `side`/`decision`/`targetPips`/`stopPips` rather than persisted redundantly. Data path: `js/levelAtlasRoutes.js`'s `runOne` now also builds the barrier trade list right after the book (same touches, no second M1 walk) and persists it to R2 as `level-atlas/{pair}-votetrades.json` (separate from the main book blob, which deliberately excludes raw touches for size); `GET /api/level-atlas/vote-trades/:instrument[?minMargin=N]` serves it, filtering server-side. Candles come from the ALREADY-EXISTING `GET /api/vol-backtest/candles/:pair` (reused, not a new endpoint). **Sandbox constraint**: this dev environment has M1 read access but no R2 write credentials, so the 5 validated pairs' trade lists were precomputed locally to `analysis/output/level-atlas-vote-trades/{pair}.json` via a one-off script and are served from there first — same precomputed-local-file-with-fallback convention `server.js` already uses for Pattern Lab; the route tries the local file, then R2, so the real Railway deploy (which has R2 creds) will populate and read the same way once `/run` executes there. Full page verified end-to-end with a headless Playwright smoke test against a locally-running server: summary stats render, all trades render in the table, sorting/filtering both work, clicking different rows loads distinct real candle windows with correct markers/lines, pair/margin switching reloads correctly, zero JS console errors. **Full tearsheet (2026-08-26, same day)**: `level-atlas-vote-backtest.html` rebuilt into a standard backtest results page matching this site's `regime-backtest.html` layout/conventions — KPI grid (win rate/PF/Sharpe±SE/max DD/total P&L/CAGR/Sortino/Calmar/reward:risk + secondary trades/wins/losses/expectancy/avg-win/avg-loss/max-consecutive-W-L/min-track-years), cumulative P&L chart (net + gross-pre-spread), Edge & Cost Diagnostics (gross vs net, spread drag, trades/day, projected-net-at-hurdle, break-even trade budget, adjustable spread-hurdle slider, bucketed by UTC hour/session/vote-margin/decision/side/day-of-week with a tradeable-subset readout per bucket), performance-by-decision and performance-by-session tables, win-rate-by-day-of-week and win-rate-by-hour bar charts, monthly P&L bar chart, and the 3-CSV-export convention from `CLAUDE.md` (`% Returns`/`R-Multiples`/`Currency P&L`, with account size and risk% stated as adjustable inputs next to the buttons — R uses each trade's OWN stop distance as the risk unit, a genuinely per-trade-varying denominator, avoiding the "R redundant with % return" degenerate case that same doc warns about). **Reused, not duplicated**: `js/metricsCore.js`'s `summarizeTrades`/`sortinoRatio`/`calmar` (imported client-side — that module chain is pure ES/browser-safe, verified) supply the core stats; CAGR/avg-win/avg-loss/consecutive-streaks/the cost-diagnostic bucketing are page-specific aggregation, not shared math, so are written directly rather than pulled from a brick that doesn't exist yet — deliberately NOT copying `regime-backtest.html`'s own hand-rolled `computeAnalytics` (that page pre-dates this project's `metricsCore.js` brick and duplicates Sharpe/Sortino/PF math the Lego Principle says shouldn't be re-implemented per page). Two small server-side additions to support this, both additive (re-verified against the engine's 32-assert and vote-review's now-29-assert suites): `session` (reused verbatim from the touch's own already-correct Asia/London/NY bucketing — NOT a second `getSession(hour)` implementation, unlike `regime-backtest.html`'s own copy, avoiding the exact kind of session-boundary drift this project has been bitten by before) and `mfePct`/`maePct` (the real path-based excursion via `reorientExcursion`, for the CSV's MAE column — per CLAUDE.md's rule that MAE must come from the real intra-trade path, not be approximated from the fixed stop distance) added to each `buildBarrierTrades` row. One real bug caught by an end-to-end Playwright pass, not by the unit tests (which use synthetic fixtures untouched by a browser chart library): a Chart.js `scales` option had `grid` nested one level too shallow (a sibling of `y` instead of inside it), which didn't throw at chart construction but crashed later in Chart.js's internals — silently aborting the rest of the render chain and leaving the trade table permanently empty despite every stat and chart ABOVE it in the render order looking correct; found by watching for the exact point live rendering diverged from the unit-tested logic, not by reading the code a second time. Verified after the fix: GOLD at margin≥4 in the BROWSER reproduces the server-side walk-forward numbers exactly (Sharpe 3.48±0.51, PF 1.70, win rate 62.5%, matching the earlier `runBarrierWalkForward` validation run to 2 decimal places) — the client-side stats path and the server-side validation path agree, not just both compile. | `level-atlas-vote-backtest.html` (full tearsheet); `js/levelAtlasRoutes.js` (`runOne` persists trades, `/vote-trades/:instrument` route); otherwise research-only — not wired into any live bot | ✅ built + validated; sign bug found and fixed; corrected finding is a real, walk-forward-positive, cost-net edge on an HONEST fixed-barrier P&L (not just best-case excursion) at vote margin≥3-4 across all 5 pairs, now a full standard-backtest tearsheet with real candles — not yet deployed as a live strategy (no position-sizing policy, trade-independence caveat on the reported Sharpe); other Level Atlas pairs not yet rolled out/validated. **Exit-rule exploration (2026-08-27, overnight, autonomous — none of this touches the shipped fixed-barrier pipeline; all three are new, additive, unit-tested exports)**: (1) **`priceAtTighterStop`/`runStopStudy`** — grids a TIGHTER candidate stop off the trade list's OWN winners'-real-MAE percentiles, sliced by session, same tightening-only discipline `perLineStrategy.js`'s own `pnlAtSL` already established (widening needs a fresh M1 re-walk, which decision-agnostic MAE can't safely support). **Result, all 5 pairs, margin≥3**: blanket tightening does NOT help pooled — the best candidate is essentially always the loosest one tested (~p95, near-identical to the current stop) or outright worse. But a real, cross-instrument pattern held: the **NY session specifically** benefits from a materially tighter stop in GOLD (Sharpe 0.72→1.49, n=558), USDJPY (1.01→1.72, n=392), and AUDUSD (1.78→2.87, n=533) — not EURUSD/GBPUSD, where NY's best matched the band. Caveat, not hidden: the improved-Sharpe candidates carry a much lower win rate (e.g. GOLD NY drops to 26%), a real behaviour change worth weighing before adopting, not just a free upgrade. (2) **`runExitVariantStudy`** — reuses `forecastAnalyser.js`'s ALREADY-VALIDATED `simulateExitVariants` (the same exit walker `perLineStrategy.js`'s own exit study trusts) to re-walk real M1 bars past the original fixed-barrier resolution point, A/B'ing the current fixed target against a chandelier trail and a no-TP-cap ride. Ships a `crossCheck` self-test (replays the SAME fixed rule and diffs it against the already-shipped `pnlPct`) — this CAUGHT a real, since-explained discrepancy before anything got reported as a finding: 8 of 1189 EURUSD trades (0.7%) disagree because the touch resolved on the SAME bar it entered on (once a genuine ~70-pip news-spike bar) and `atlasWalk`'s own resolution checks the outer/continuation barrier first while `simulateExitVariants` always checks the stop first — two ALREADY-EXISTING engines with opposite, equally-defensible tie-break conventions for an ambiguity a single OHLC bar genuinely cannot resolve; not a bug, now documented in the function's own header so it doesn't get re-investigated as one. Also caught: the DEFAULT `trailFrac=0.5` (inherited from `simulateExitVariants`, tuned for a different engine's geometry) activates the trail from bar ZERO, not after a real favourable move — 98.3% of EURUSD trades exited via the trail almost immediately at that setting, collapsing total P&L to ~25% of the fixed rule's ~73%; re-tested at `trailFrac=1.5`/`2.0` for a fair comparison. **Result, all 5 pairs**: the chandelier/ride exit has a WORSE Sharpe than the current fixed target on EVERY pair tested, both trail settings, no exceptions. On raw total return it's also worse for EURUSD/GBPUSD/AUDUSD, but GOLD and USDJPY show a HIGHER total return at `trailFrac=2.0` (GOLD 135.9% vs 129.2%; USDJPY 117.8% vs 90.1%) bought with win rate collapsing to ~45-48% and a materially bumpier path (Sharpe 2.2-3.0 vs 3.2-3.5 fixed) — a real, honest, mostly-negative finding for "let winners run" as tested here, not the hoped-for upgrade. (3) **Same-direction trade extension** (the idea that a same-direction re-signal while a position is open should extend/update that position instead of stacking a separate concurrent one — the sharpest answer yet to the concurrent-position-sizing gap flagged earlier) was DESIGNED but NOT built tonight: its natural implementation reuses the SAME 'ride' mechanism just shown to underperform on Sharpe, so building it on an unexamined default risked repeating the same trailFrac mistake. Left for a deliberate follow-up once a properly-tuned trail (or a different extension rule entirely) is chosen — not because it's a bad idea, but because it depends on a piece just shown to need more work first. Tested `js/levelAtlasVoteReview.test.mjs` T9/T10/T11 (21 new asserts — tightening-only pricing incl. the never-widen clamp, the stop-study grid/slice/best-selection machinery, and the exit-variant reconstruction hand-verified against a controlled synthetic M1 path before ever touching real data). **Concurrent-position cap (2026-08-27, same day, after an explicit `git tag level-atlas-vote-pre-concurrency-2026-08-27` checkpoint since this changes trade SELECTION, not just adds a new derived stat)**: `applyConcurrencyCap(trades, {maxConcurrent, perDirection})` finally puts a real number on the "trades aren't independent" caveat every result above has carried — walks the already-built trade list chronologically and SKIPS a signal that would exceed the cap rather than assuming unlimited simultaneous capital; `perDirection` tracks long/short on separate budgets (a same-instrument long+short pair isn't the same capital conflict as two same-direction trades stacking) but barely changes the answer since most real overlaps are same-direction anyway. **Result, all 5 pairs, margin≥3**: at `maxConcurrent=1` (the strictest possible — never more than one position on this instrument at a time), Sharpe drops to 38-57% of the uncapped number everywhere (EURUSD 4.49→2.42, GBPUSD 3.76→1.92-2.02, GOLD 3.25→1.27-1.30, USDJPY 3.48→1.31-1.50, AUDUSD 3.50→1.95-2.01) — a real, substantial, consistent haircut, but NOT a null: every pair keeps a credible Sharpe of 1.3-2.4 under the single most conservative capital assumption there is. At `maxConcurrent=2`, the haircut is much smaller — Sharpe retains 77-93% of the uncapped value across all 5 pairs. This is the most reassuring result of the whole vote-margin exploration: the earlier "upper bound" caveat was real and is now quantified, but the edge survives it. Genuinely lower-risk than the stop/exit-rule studies above (it only filters WHICH already-validated trades get taken, never re-derives a pnl or re-walks M1), reused the pure-function-first discipline throughout: pricing/selection logic is a small, fully unit-tested function (T12, 6 new asserts, hand-verified overlap timeline) operating only on `buildBarrierTrades`'s own output — zero changes to that function or to the live tearsheet. **Cross-pair portfolio backtest (2026-08-27, same day — the owner's original long-term ask, unblocked once concurrency had a real number on it)**: `buildPortfolioDailySeries({pair: trades, ...}, {weights})` combines MULTIPLE pairs' own (already `applyConcurrencyCap`-selected) trade lists into ONE portfolio daily return series — sums each pair's own day first (same convention every daily series in this module already uses), scales by that pair's weight, merges by calendar date. Doesn't decide the weighting policy itself; `inverseVolWeights` supplies the risk-parity option (same $-risk-per-pair convention this project's own Multi-Factor Book/Position Sizer already use, not invented here) as an alternative to the default equal-weight (1/n each). Feeds straight into `js/backtestStats.js`'s `portfolioStats` — no new metric. **Result, all 5 pairs, margin≥3, cap=1 (the most conservative per-pair selection already validated)**: real, substantial diversification benefit — the simple average of the 5 pairs' OWN individual Sharpes is 1.78; the EQUAL-WEIGHT combined portfolio scores **Sharpe 3.11, max drawdown -1.39%**; the INVERSE-VOL (risk-parity) weighted version does even better, **Sharpe 3.47, max drawdown -1%, Calmar 8.46**. Not free money, stated plainly: total return is more modest (~35% over ~3 years) than any single pair alone, since each only gets a 20-27% capital slice — the benefit is a MUCH smoother ride, not a bigger one, unless deliberately levered to a target vol afterward (a real, separate choice, not decided here). Tested `js/levelAtlasVoteReview.test.mjs` T13 (13 new asserts — equal/custom/missing-weight combination incl. same-pair-same-day-summed-first, and inverse-vol weighting incl. the divide-by-zero guard for a near-flat pair), all hand-verified before running on real data. **CSV export + Sharpe-methodology bug (2026-08-27, same day)**: `level-atlas-vote-portfolio.html` got the same 3-CSV-export convention as the single-pair tearsheet (`/api/level-atlas/vote-portfolio` now also returns a flat `trades[]` tagged with each trade's `pair` + portfolio `weight`; % Returns/Currency P&L are weighted by pair, R stays unweighted since it's a ratio). While wiring the export, a real inconsistency surfaced and was fixed, not just noted: the "Diversification benefit" callout's "naive average Sharpe" (`perPair[sym].ownSharpe`) was computed via `metricsCore.summarizeTrades` (per-trade pnl, annualized by trades/year), while the "combined portfolio Sharpe" it's compared against comes from `backtestStats.portfolioStats` (daily-return series, annualized by √252) — two DIFFERENT Sharpe formulas on the same page's headline comparison. Verified concretely: running each of the 5 pairs SOLO through this same route (weight=1, zero diversification possible) still showed `portfolioStats` Sharpe running 25-35% above `summarizeTrades` Sharpe on every pair (EURUSD 3.19 vs 2.42, GBPUSD 2.41 vs 1.92, GOLD 1.62 vs 1.27, USDJPY 1.63 vs 1.31, AUDUSD 2.67 vs 1.95) — proof the gap is a methodology artifact, not signal, since a solo pair can't diversify against itself. This meant roughly HALF of the previously-reported "1.78→3.45" diversification lift was actually a formula switch. **Fixed**: `ownSharpe` per pair is now computed the same way as the combined figure (`portfolioStats` on that pair's own solo daily series via `buildPortfolioDailySeries({[pair]: trades})`), so `naiveAvgSharpe` and the combined Sharpe are apples-to-apples everywhere on this page. **Corrected, real diversification effect** (5 pairs, margin≥3, cap=1): naive average 2.30 → equal-weight combined 3.11, inverse-vol combined 3.47 — still a genuine ~35-50% lift, just honestly smaller than first reported. Page also now plots a non-compounded (arithmetic sum of daily %) line alongside the compounded equity curve, so compounding's own contribution is visible rather than implied. **Fixed-fractional per-trade risk sizing (2026-08-27, same day)**: `riskAdjustTrades(trades, riskPct)` re-expresses each trade's `pnlPct` as `rMultiple × riskPct`, where `rMultiple = pnlPct ÷ (stopPips×pip÷entry×100)` — the SAME R-multiple formula both tearsheets' Currency CSV already used, now a proper brick. `/api/level-atlas/vote-portfolio` gained `sizing=fixed-risk|nav` (default now `fixed-risk`) + `riskPct`: fixed-risk risks the SAME % of account on every trade, every pair, off that trade's own real stop — no NAV split, no need to know trade count/frequency in advance (directly answers the owner's "you don't know how many trades will happen in a year, so how do you set volatility" objection — you don't pre-set it; you fix risk/trade and let realized vol be an OUTPUT you check against a target after the fact, same as real CTA/risk-parity practice). `rMultiple` is now attached to every trade regardless of mode (invariant to sizing, so the CSV R-multiples button no longer recomputes it from raw fields — fixes what would otherwise be a real bug: recomputing R from `pnlPct÷stopRiskPct` in fixed-risk mode double-applies the scaling since `pnlPct` is already risk-scaled there). **Real, unflattering finding, reported not hidden**: naive uncapped 1%-risk-per-trade across 5 pairs (only WITHIN-pair concurrency is capped at 1; CROSS-pair concurrency has no budget yet — a known, already-documented gap) realizes **37.25% annualized vol and -17.65% max drawdown** — dramatically higher than the NAV-split model's 2.3-3.24% vol / -1 to -2.3% DD, because NAV-splitting capital 1/n per pair had been implicitly UNDER-risking relative to a real "1% per trade" (up to 5 pairs can have a live position simultaneously, each independently risking 1%, so realized simultaneous exposure can reach ~5% during overlaps — the NAV model never showed this because its weight fractions capped TOTAL exposure at 100% by construction, masking the stacking). Sharpe is close either way (3.45 fixed-risk vs 3.11-3.47 NAV) since Sharpe is scale-invariant to uniform leverage but NOT to how risk is shaped across pairs/time — a materially different, more honest drawdown number came from sizing it for real rather than assuming a NAV split. Consequently the "hit 10% target vol" per-trade-risk readout (added as a new levered KPI card, computed client-side as `riskPct × (targetVol÷annVol)`) comes out much SMALLER than the earlier NAV-based estimate implied — ~0.27%/trade from a 1%/trade fixed-risk baseline, not ~4.3%/trade as a naive NAV-based back-of-envelope suggested — because the fixed-risk baseline was already running much hotter. Per-pair table now also reports `tradeShare` (kept-trade-count ÷ total kept) — the honest meaning of "weight" once every trade already risks the same fixed %, shown instead of the now-always-1 NAV weight in this mode; UI dynamically relabels the column and hides the NAV-only Weighting dropdown when fixed-risk is selected. Tested `js/levelAtlasVoteReview.test.mjs` T14 (8 new asserts — 2R-winner/1R-loser exact R-multiple + linear risk-% scaling, non-pnlPct fields pass through, zero-stop-distance guard, empty/null input, default riskPct=1), hand-verified before running on real data; full page re-verified end-to-end via headless Playwright across BOTH sizing modes (control visibility toggles, all 3 CSVs, R-multiple identical across modes as expected since it's mode-invariant) before pushing. **Investigated, not yet built**: a follow-up ask (dynamically vary per-trade risk by volatility/session/day/news, capped at some max) surfaced that Level Atlas's `atlasWalk` touches already carry rich, causal vol context (`dayVol`/`asiaVol`/`londonVol`/`prevSessionVol`/`ivRegime`/`vrp` — see `js/levelAtlasEngine.js`) and the ladder's own target/stop distances are ALREADY vol-scaled (built from `forecastSigma`, not a fixed geometric ladder) — but `buildBarrierTrades` currently drops every one of those fields when building its trade objects, keeping only `session`. A real economic-calendar brick (`js/calendarLoader.js`'s `majorEventEpochs()`, already used by `asiaFibAtlasEngine.js`/`volForecastScheduler.js`) exists but isn't wired into Level Atlas at all. Building dynamic risk sizing needs (1) `buildBarrierTrades` extended to pass the vol-context fields through, then (2) an OOS-validated conditioning rule (not just "seems reasonable") — deferred pending that, and pending the owner's steer on which conditioners to prioritize. **Portfolio heat cap — built, tested, honest negative-ish result (2026-08-27, same day)**: `applyConcurrencyCap` gained a `heatOf(trade)` option (default `()=>1`, fully backward-compatible with every existing caller/test) that generalizes its budget from a plain position COUNT to a summed HEAT; `applyPortfolioHeatCap(perPairTrades, {maxHeatPct})` merges every pair's ALREADY per-pair-capped trades into one chronological list and re-applies the cap using each trade's real `riskPctUsed` (from `riskAdjustTrades`, now also attached to every trade) as its heat — `maxHeatPct` means "never risk more than X% of account across every open position at once, regardless of pair," closing the gap the per-pair cap alone leaves open (5 pairs each independently risking 1% can silently stack to ~5% simultaneous exposure). `/api/level-atlas/vote-portfolio` gained `maxHeatPct` (fixed-risk mode only) and, whenever set, also returns `statsUncapped` — the identical combined series without the cross-pair budget — so impact is a direct side-by-side number, not an assumption; UI shows this as a comparison table plus a `tradeShare`-style per-pair `keptAfterHeat` count. Also made `targetVol` a real adjustable query param/UI input (was hardcoded to 10 — the owner correctly flagged this as looking like an arbitrary cap on upside when it's actually just a dial: setting it above realized vol levers UP, not down; a new KPI card shows the literal per-trade risk% needed to hit whatever target is chosen). **Tested on real data across maxHeatPct=1/1.5/2/3 vs uncapped, all 5 pairs, margin≥3, riskPct=1%**: the cap does what it says (618 of 5020 trades skipped at 2%, dropping annVol 37.3%→33.4%, CAGR 236%→178%) but max drawdown barely moves (-17.65%→-16.62% at 2%; only -17.65%→-16.18% even at the STRICTEST possible cap of 1, i.e. never more than one position open across the WHOLE portfolio) — and at that strictest setting Sharpe actually gets WORSE (3.45→2.64), because it discards real diversifying trades on other pairs, not just risk. **Root-caused, not just observed**: the actual worst drawdown (2024-08-29 to 2024-09-17, -17.65%) is a 19-day, 66-trade stretch with win rate 45.5% vs 58.9% overall — a sustained, correlated bad patch across pairs over TIME, not a pile-up of simultaneously-open positions at one moment. A simultaneous-exposure cap structurally cannot fix a sequential losing-streak problem, which is exactly what happened here — a real, useful negative result per this project's "Pivot or Pivot" rule, not a dead end: it points at a DIFFERENT next tool (a drawdown throttle — cut risk-per-trade after the strategy's own equity curve breaches a threshold, restore after recovery — responds to realized pain over time, which heat capping by construction cannot) rather than "the cap doesn't work so drop the idea." Tested `js/levelAtlasVoteReview.test.mjs` T15 (`heatOf` backward-compat + a hand-verified weighted-overlap timeline) and T16 (`applyPortfolioHeatCap` cross-pair stacking scenario, missing-`riskPctUsed` fallback, empty/null input) — 9 new asserts, hand-verified before running on real data; full page re-verified end-to-end via headless Playwright (heat-cap toggle enables/disables the input and shows the comparison card, target-vol dial relabels and rescales live) before pushing. **Drawdown throttle — built, tested, a genuinely POSITIVE result this time (2026-08-27, same day)**: `applyDrawdownThrottle(dailyReturns, dates, {triggerDD, restoreDD, throttleMult})` walks the ALREADY-COMBINED portfolio daily series chronologically and scales each day's return by `throttleMult` once the strategy's OWN realized equity (built from the already-throttled path, not the raw one — the equity a real account would actually have) breaches `triggerDD` from its peak, restoring to full size only once it recovers to `restoreDD` (a less-negative hysteresis threshold, avoiding flip-flop on ordinary noise near the boundary). Strictly causal: day `i`'s own return can never influence its own multiplier, decided from days `0..i-1` only. Scaling the daily AGGREGATE is mathematically identical to having risk-adjusted every trade that day at `riskPct×multiplier` in the first place (since `riskAdjustTrades`' pnlPct already scales linearly with risk%), so no per-trade re-touching is needed. `/api/level-atlas/vote-portfolio` gained `throttle`/`triggerDD`/`restoreDD`/`throttleMult`, applied AFTER the heat cap (the two compose), and — same discipline as the heat cap — returns `statsNoThrottle` (heat cap held constant, throttle isolated) and holds throttle constant inside the heat-cap `statsUncapped` comparison, so either toggle's marginal effect is directly readable, not conflated with the other. **Result, real data, all 5 pairs, margin≥3, riskPct=1%, no heat cap**: at a lightly-tuned `triggerDD=-8%, restoreDD=-2%, throttleMult=0.5×` (a few hand-picked configs compared, not a grid search — still exploratory, needs OOS validation before trusting the specific numbers), Sharpe is essentially UNCHANGED (3.45→3.43), CAGR gives up real ground (236%→185%, expected — de-risking during the recovery costs some of the rebound), but max drawdown drops a real **-17.65%→-12.51%** (~29% reduction) and Calmar actually IMPROVES (13.40→14.82) — a materially better risk shape at negligible Sharpe cost, unlike the heat cap's mostly-flat result. Confirms the earlier root-cause diagnosis: something that responds to the strategy's OWN realized pain over time succeeds where a purely structural cap on simultaneous exposure didn't. An initial, tighter attempt (`-5%/0%/0.5×`) throttled 54% of all days (too trigger-happy given ~37% baseline annualized vol) and gave up more CAGR for a smaller DD improvement — reported plainly rather than hidden, since it's what motivated trying the looser config. Tested `js/levelAtlasVoteReview.test.mjs` T17 (10 new asserts — a fully hand-derived 6-day trigger/restore/recovery timeline with an equity self-consistency cross-check, a never-triggers scenario, custom-params honoring, empty/null input) before running on real data; full page re-verified end-to-end via headless Playwright (toggle enables inputs and the comparison card, real numbers match the CLI validation run exactly) before pushing. **Three CSV/reporting bugs, owner-caught (2026-08-27, same day)**: (1) the portfolio page's CSV exports put `Pair` in COLUMN 2 (`Date,Pair,Return %,MAE %`), shifting every column after it out of position — a real, silent import-breaking bug for any positional importer expecting the house convention's exact 3 leading columns (`Date,Return %,MAE %` / `date,R,MAE (R)` / `Trade Date,PnL ($),Risk ($)`, confirmed against an external reference tool's own published format examples). Fixed by moving `Pair` to a TRAILING 4th column on all 3 buttons — safe for both name-based and positional-first-3 readers. (2) MAE was exported as a positive magnitude on both tearsheets' % Returns and R-Multiples CSVs. The engine's `maePct`/`rMultiple`-derived MAE is DELIBERATELY unsigned internally (`Math.abs()` in `buildBarrierTrades` — `eRatio = meanMfe/meanMae` in `reviewVoteBacktest` needs both positive, and flipping the engine's own sign would ripple through ~20 already-passing tests), so the fix is a display-only negation at the CSV-writing boundary only (`-Math.abs(maePct)`), leaving the core engine's contract untouched — MAE now reads as a drawdown, negative like a loss, matching the reference format's own convention. (3) The portfolio page's TWO equity-curve lines (compounded vs non-compounded) had no matching pair of drawdown STATS — only the compounded `maxDD` was ever shown, so there was no way to see the max drawdown a trader who does NOT reinvest profit into growing position size would actually experience. Fixed by reusing the ALREADY-EXISTING `metricsCore.maxDrawdownFromPnls` (additive/non-reinvested peak-to-trough — a Tier-1 brick, not a new metric) alongside `portfolioStats`' own compounded `maxDD`, both now shown side by side (`Max DD (compounded)` / `Max DD (fixed risk)`) everywhere a drawdown number appears on the page (raw KPI grid, heat-cap comparison, throttle comparison). Real, honest, slightly counter-intuitive finding once both were visible: on the default 5-pair run they're close but NOT the same direction one might assume (-17.6% compounded vs -18.9% fixed-risk) — a fixed-risk trader can experience a WORSE percentage drawdown than the compounded view suggests, if the worst stretch lands after the compounded curve has already grown its peak (a % drawdown off an inflated compounded peak understates the same dollar pain relative to original capital). Confirmed no changes needed to `js/levelAtlasVoteReview.test.mjs`'s existing suite (this touched only the routes layer + display code, reusing already-tested bricks); full re-verification via headless Playwright on both pages (CSV column order, MAE sign, both DD stats) before pushing. **Dual-axis equity chart (2026-08-27, same day)**: the owner correctly flagged the non-compounded line as "flat" after the DD fix above shipped — checked the real numbers rather than assuming a rendering bug: on the default 5-pair fixed-risk run the compounded curve ends at **+18,832%**, the non-compounded curve at **+555%** (a genuine 34x gap — the compounding effect itself, not an error). On a SHARED 0-20,000% axis, +555% is visually indistinguishable from 0%, so the real data was there but unreadable. Fixed by giving the non-compounded line its own right-hand Y axis (Chart.js `yAxisID`) scaled to its own range, with each dataset's final value now in its own legend label — both curves are independently readable at their own scale, same underlying data, no change to the calculation. **Log-scale toggle, investigated a real question honestly (2026-08-27, same day)**: the owner asked why the compounded curve barely grows 2022-2024 then "escalates massive" after — checked rather than assumed. Broke the equity curve down by CALENDAR YEAR and found the underlying AVERAGE DAILY return is stable across the whole period (0.51%/0.54%/0.35%/0.58%/0.61% for 2022-2026 respectively — 2024 was actually the WEAKEST year, not evidence of acceleration). The hockey-stick shape is the mathematically-expected signature of a CONSTANT compounding rate viewed on a LINEAR axis (the same relative yearly multiplier produces a tiny absolute move on a $1 base and a huge one on a $135 base) — exactly why professional tearsheets plot long equity curves on a log scale. Added a "Log scale (compounded)" toggle: switches the primary Y axis to Chart.js `logarithmic` and re-plots the compounded series as an equity INDEX (`eq×100`, always positive — required since log(0)/log(negative) is undefined, unlike the linear view's `(eq-1)×100` % framing which can be 0 or negative) while the non-compounded line stays linear on its own axis. Verified via Playwright screenshot: on log scale the curve draws as a genuinely straight, consistent-slope line across the whole period — visual confirmation the growth rate really is stable, matching the year-by-year numbers, not just an assertion. Re-render on toggle reuses the already-fetched response (no re-fetch needed) via a new `lastResponse` cache. **OOS validation of the throttle/heat-cap tunings — a real, humbling negative result (2026-08-27, same day, `scripts/oos_validate_throttle.mjs`)**: both overlays were tuned by eyeballing the FULL sample (Lego Principle 5 violation, caught before it got trusted further) — this script fixes that by chronologically splitting the 5-pair fixed-risk combined series 70/30 (IS ends 2025-04-25), grid-searching a small set of candidate configs on IS ONLY (selected by Calmar), then applying the WINNER unchanged to the untouched OOS slice. **Result: neither overlay's tuned parameters generalize.** Throttle: IS improvement was real (baseline Calmar 13.25→14.88 at the IS-winning `-10%/-3%/0.3×`), but applied unchanged to OOS it makes things WORSE (baseline Sharpe 3.53→3.08, Calmar 20.37→12.71) — because the OOS slice's own baseline max drawdown (-11.91%) was already much smaller than IS's (-17.65%, the same Aug-Sep-2024 event this whole feature was built around), so a threshold tuned around that one specific event has nothing comparable to protect against OOS and just costs return on ordinary noise instead. Heat cap: same pattern, milder — OOS baseline Calmar 20.37 vs heat-capped 16.99, also worse. **The underlying portfolio edge itself is NOT in question** — baseline (no overlay) Sharpe is consistent both sides (3.42 IS, 3.53 OOS) and Calmar is even BETTER OOS (20.37 vs 13.25) — this is specifically an overfitting finding about the RISK-OVERLAY PARAMETERS, not the trading edge. Conclusion, stated plainly rather than smoothed over: a single ~19-day drawdown event is not enough history to reliably calibrate a drawdown-threshold rule against — this needs either a much larger dataset (the 26-pair rollout, see below, gives more independent drawdown episodes to tune against) or a deliberately un-optimized, round-number default chosen BEFORE looking at performance (this project's "start with the minimal-DOF version" rule), not a grid search on one sample. Both overlays remain live on the portfolio page as OPTIONAL, user-controlled toggles (never silently defaulted on) — this finding is about not trusting today's specific tuned numbers as validated, not about removing the mechanism. **26-pair rollout — the edge generalizes, but a severe new risk surfaced (2026-08-27, same day)**: `scripts/build_level_atlas_vote_trades.mjs` generates `analysis/output/level-atlas-vote-trades/{pair}-votetrades.json` for any pair with local M1 data, reusing `runOne`'s exact pipeline (`atlasWalk`→`buildAtlasBook`→`buildBarrierTrades`) minus the OANDA gap-fill (unavailable in this sandbox, unneeded for a historical backtest) and the full book's R2 persistence (out of scope for the vote-portfolio). Generated all 21 missing pairs from the SAME `ALL_26_PAIRS` universe `scripts/run_asia_fib_atlas.mjs` already established — confirmed local M1 parquet exists for all 26, no OANDA/R2 needed. **Real positive finding**: EVERY one of the 26 pairs shows a genuine edge — 59-68% win rate and positive expectancy on all of them, at margin≥3, with the SAME pipeline that validated the original 5. **Real negative finding, audited before trusting it (cost vs Sharpe checked pair-by-pair, confirmed monotonic — not a bug)**: Sharpe ranges from 4.49 (EURUSD) down to 0.016 (EURNZD) almost entirely tracking each pair's own spread cost — `cost` field 0.008 (EURUSD) to 0.045 (GBPNZD) — meaning 5 pairs (EURNZD, GBPNZD, AUDNZD, AUDCHF, GBPCAD) have real but economically-worthless edge after their own wide spread. **A much bigger, genuinely severe finding**: naively combining all 26 pairs at 1% fixed risk/trade (no cross-pair budget) produces a **-97.8% max drawdown** — an effective account wipeout — traced to a SINGLE real day (2024-09-06) where 72 trades resolved simultaneously across pairs sharing currency legs (EUR/GBP/USD/AUD/NZD/CAD/CHF/JPY crosses are NOT independent bets), realizing a single-day -27% loss. Confirmed this isn't a leverage artifact: Sharpe is scale-invariant to a uniform risk% change (stayed flat at 0.8 for the full 26 from 1% down to 0.05% risk/trade — only the absolute CAGR/DD numbers shrank), so the poor risk-adjusted SHAPE is real, not fixable by just sizing down. Excluding the 5 weak/high-cost pairs helps meaningfully (naive-26 Sharpe 0.8 → curated-21 Sharpe 2.08) but does NOT fix the tail risk (curated-21 max DD is STILL -70.65% at 1%/trade) — the correlated-stacking exposure comes from shared currency legs across the SURVIVING pairs too, not just the weak ones. **Tested whether the existing portfolio heat cap (built + validated useful at 5-pair scale, see above) fixes this at 26-pair scale — it does NOT**: every threshold tried (2-10% max simultaneous risk) stayed catastrophic (-70% to -98% max DD), several actually WORSE than uncapped. Root-caused: `applyPortfolioHeatCap`'s selection rule keeps whichever trade arrives chronologically FIRST each day — at 5-pair scale skips are the rare exception so this barely matters, but at 26-pair scale the shared budget is exhausted constantly, so which trades survive becomes close to arbitrary (an accident of entry timing, not vote-margin quality), destroying the edge's own selectivity rather than just trimming volume. **Conclusion, not yet built**: a genuinely CURRENCY-EXPOSURE-aware risk model (cap net risk per underlying currency — total EUR-net exposure, USD-net exposure, etc. — not just per-trade count) is the real fix for correlated FX-cross stacking; simple position-count heat caps don't generalize past a handful of pairs. Until that exists, the portfolio page now exposes all 26 pairs as selectable (checkboxes, `PAIR_COLORS` generated programmatically) but keeps only the original 5 pre-checked by default, flags the 5 weak/high-cost pairs with a ⚠ in the picker, and carries a prominent red-bordered warning card explaining this exact finding — so exploring more pairs is possible but not silently presented as safe. Also fixed, while stress-testing with many pairs selected: a real (if minor, and only realistic under near-simultaneous rapid toggling) stale-response race — `loadData()` now tags each call with a sequence number and discards any response that isn't from the most-recently-STARTED request, verified via Playwright network-log inspection (confirmed the underlying cause was request-queueing latency under a synthetic 26-simultaneous-request stress test, not a hang — a realistic one-at-a-time toggle sequence resolves cleanly and quickly). **Weak-pair curation, owner-directed (2026-08-27, same day)**: acted on the finding above rather than just flagging it. `level-atlas-vote-portfolio.html`'s selectable `PAIRS` list now REMOVES the 5 weak/high-cost pairs (EURNZD/GBPNZD/AUDNZD/AUDCHF/GBPCAD) entirely (21 selectable, not 26) — a deliberate curation edit, not just an unchecked default, per explicit direction. `level-atlas-vote-backtest.html` (the single-pair tearsheet) gained a DYNAMIC quality-warning banner instead of a second hardcoded list — computed client-side from the ALREADY-FETCHED `j.summary.sharpe` (that endpoint's existing trade-based `summarizeTrades` field) at whatever margin the user has selected, so it automatically covers any pair (including future ones) without a second list to keep in sync with the portfolio page's. Threshold: Sharpe < 1.0 (trade-basis) — chosen from the real, visible gap in the 26-pair data (weak cluster 0.02-0.68, everything else 1.3+), not an arbitrary round number. Also expanded that page's own pair selector from 5 to all 26 (previously only the original 5 were viewable there at all) so every pair's own tearsheet — including the weak ones, with their warning — is actually reachable. Verified via Playwright: EURNZD shows the warning with its real Sharpe/win-rate/cost inline, EURUSD shows none, and the portfolio picker now lists exactly 21 checkboxes with neither EURNZD nor GBPCAD present. **Indices added, owner-directed (2026-08-27, same day)**: extended `scripts/build_level_atlas_vote_trades.mjs` to 6 equity indices (NQ/SPX/DOW/US2000/DE30/UK100) — `js/perLineStrategy.js`'s `PAIR_COST_PCT`/`assetClassFor` already had real entries for all 6 (no guessing), and `js/instrumentRegistry.js` confirms canonical naming (picked `nq`/`spx`/`dow` over the duplicate parquet aliases `nas100_usd`/`spx500`/`us30` per `dedupePairsByInstrument`'s own preference). **Real positive finding, same pipeline, no changes needed for indices to work**: all 6 clear the Sharpe>1.0 quality bar comfortably — DE30 lowest at 2.24, SPX/DOW highest at 5.67/5.62 (60-68% win rate, n=462-1470 at margin≥3). **Real caveat, audited not glossed over**: SPX/DOW's local M1 cache only goes back to 2024-07 (vs ~2022 for NQ/US2000/DE30/UK100 and every FX pair), so their OOS window is roughly HALF the length (n=462-507 vs 1000+) — their headline Sharpe is real by the identical methodology, just tested on notably less independent history than everything else on this page; flagged via a new amber (not red) informational banner on the single-pair tearsheet distinct from the weak-pair red warning, computed from `splitDate` rather than hardcoded. All 6 added to the portfolio page's selectable list (27 total) and the tearsheet's pair selector; the correlated-risk warning card updated to cover equity-index correlation too (NQ/SPX/DOW/US2000/DE30/UK100 are all "risk assets" that can move together on a risk-off day, on top of the existing FX currency-leg correlation) — the not-yet-built exposure-aware risk model needs to eventually cap BOTH currency exposure and correlated-asset-cluster exposure, not just currency. Verified via Playwright: SPX shows the amber shorter-history note with its real Sharpe/n/splitDate inline, NQ shows neither banner, portfolio picker lists exactly 27 checkboxes including nq/spx, and combining EURUSD+GBPUSD+USDJPY+AUDUSD+GOLD+NQ+SPX loads correctly. **Fade-stop tightening — a real, OOS-validated win, built after a real methodology bug was caught and fixed first (2026-08-27, same day)**: the owner noticed avg loss running bigger than avg win despite a healthy win rate and asked for a better SL-sizing validation than the earlier session-only pass. Re-ran `runStopStudy` (already-validated) across the full 32-pair universe sliced PER PAIR first — **caught a real bug in the first attempt before trusting it**: pooling raw pip thresholds across instruments with different pip sizes (EURUSD pip=0.0001 vs GOLD/index pip=1) compares apples to oranges, so an initial pooled-across-pairs "fade" slice overstated the effect (Sharpe 8.8→12.2) using a threshold meaningless for non-FX-major pip scales. Redid it correctly (`scripts/stop_study_full_universe.mjs`, slice key always includes `instrument` first): **fade decisions specifically** show a real, wide effect — 25 of 27 pairs improved, avg Sharpe lift +1.17, avg win/loss ratio 0.94→2.33; follow decisions barely move (0.76→1.01, smaller lift) — the ladder's own geometry (`follow` mirrors `fade`, but the two aren't symmetric in practice) means fade's current stop is oversized relative to what winning fades need, follow's already isn't. **Before wiring this into anything, OOS-validated it the same way the throttle/heat-cap SHOULD have been from the start** (`scripts/oos_validate_fade_stop.mjs`, chronological 70/30 split PER PAIR, stop percentile chosen from IS only, applied unchanged to OOS): **30 of 32 pairs (94%) improved OOS Sharpe**, average lift +1.14 — the only 2 exceptions are SPX/DOW, the SAME two pairs already flagged as having a much shorter track record, a consistent explanation not a new mystery. This is qualitatively different from the throttle's earlier OOS failure — a pattern replicated independently across 30 different instruments generalizes far more credibly than one config fit to one 19-day event. Also surfaced and fixed a stale-schema issue along the way: the ORIGINAL 5 pairs' stored vote-trades (generated 2026-08-26) predate `mfePips`/`maePips` being added to `buildBarrierTrades`'s output, so every MAE-dependent analysis (this one, and any future one) silently skipped them entirely — regenerated all 5 via `scripts/build_level_atlas_vote_trades.mjs` (identical win/loss outcomes reproduced exactly, confirming no drift — just the missing fields added), bringing all 32 pairs onto one current schema. **Shipped**: `applyFadeStopTightening(trades, {cost, minN, percentiles})` — reuses `runStopStudy`+`priceAtTighterStop` entirely (zero new pricing logic), scoped to ONE pair's own trades always (never pools pips across pairs), re-prices FADE trades only via each pair's own fade-winners' MAE grid, leaves FOLLOW untouched, returns the original trades unchanged if there's not enough data to trust a candidate. Wired into `/api/level-atlas/vote-portfolio` as `fadeStopTighten=true` (opt-in, off by default — not silently changing the baseline pricing everything else on this page was already validated against), applied per-pair right after the margin filter and before the concurrency cap (matching exactly how it was validated), composes with the heat cap and throttle (each holds the others constant for its own comparison, same discipline as `statsUncapped`/`statsNoThrottle`). **Real portfolio-level impact, default 5 pairs, margin≥3, riskPct=1%, no heat cap/throttle**: Sharpe 3.45→**4.45**, Calmar 13.4→**32.24**, CAGR 236%→**579%**, max drawdown essentially unchanged (-17.65%→-17.95%, as expected — this fixes trade-level win/loss size, not the correlated-macro-shock drawdown driver identified earlier). Tested `js/levelAtlasVoteReview.test.mjs` T18 (9 new asserts — finds a real candidate and reports it, follow trades completely untouched, fade stopPips shrinks correctly, at least one former winner flips under the tighter stop, a former loser never becomes a win, too-little-data returns the ORIGINAL trades unchanged not a degraded guess, empty/null input) before running on real data; full page re-verified end-to-end via Playwright (toggle shows the comparison card with real numbers matching the CLI validation exactly, composes correctly with throttle, zero console errors) before pushing. **"Select recommended" button — leave-one-out contributor analysis, OOS-validated (2026-08-28, same day)**: the owner asked for a button that ticks all pairs but excludes the ones bad for the OVERALL portfolio — a genuinely different question from "is this pair's own edge weak" (the 5 already-removed pairs). Built `scripts/leave_one_out_portfolio.mjs` to actually measure it instead of guessing: for each of the 27 currently-selectable pairs, rebuild the combined portfolio WITHOUT it and see how much max DD improves. **Honest first finding**: single-pair removal barely helps ANYTHING — even the single best candidate (GBPAUD) only moves maxDD from -64.74% to -61.02%, still catastrophic. This confirms the correlated-stacking problem found earlier is systemic (many pairs stacking together), not a few bad-apple pairs. **But greedy sequential removal compounds well**: iteratively removing the current worst contributor and RE-RANKING each time (since the residual correlation structure shifts after each removal) took 27 pairs → 17 pairs, Sharpe 2.79→3.63, maxDD -64.74%→-26.38%, Calmar 17.12→37.90 — a real, substantial improvement, though nowhere near the 5-pair or 21-pair portfolios' own much smaller drawdowns. **Caught the obvious next risk before shipping it**: this greedy selection is itself chosen by minimizing max DD on the FULL sample — the exact in-sample-optimization trap that broke the drawdown throttle earlier today. OOS-validated it the same way (`scripts/oos_validate_pair_selection.mjs`): ran the SAME greedy elimination using ONLY the first 70% of history to pick the 10-pair exclusion set (GBPAUD/GBPCHF/USDCAD/AUDCAD/NZDJPY/EURGBP/GBPJPY/NZDUSD/EURJPY/EURCAD — mostly non-USD crosses whose currency exposure overlaps heavily with other selected pairs), then applied that FROZEN set, unchanged, to the untouched last 30%: max DD improved from -42.74% to -25.11% and Sharpe from 2.36 to 3.65 — the pattern holds on data it wasn't chosen from, unlike the throttle. Shipped as two buttons on `level-atlas-vote-portfolio.html`: "Select all" (all 27) and "Select recommended (excl. 10 correlated-risk pairs)" (the OOS-validated 17-pair set) — both just toggle checkboxes and call the existing `loadData()`, no new backend needed. The warning card was updated with the full methodology and the honest caveat: this is a real improvement, not a fix — -25% max DD beats -65-98%, but the actual fix is still the not-yet-built exposure-aware risk model. Verified via Playwright: Select all checks 27 and matches the earlier full-sample numbers exactly; Select recommended checks exactly 17 (confirmed none of the 10 excluded pairs are checked) and the resulting Sharpe/maxDD/Calmar (3.63/-26.4%/37.90) match the CLI validation run exactly. **Full quant analytics battery on `portfolioStats` — a real gap, closed by reuse not invention (2026-08-28, same day)**: the owner asked for real headline analytics (Sortino etc.) on the portfolio page — a genuine gap: `js/backtestStats.js`'s per-trade `backtestStats()` already returns Sortino/profit factor (used by the single-pair tearsheet), but `portfolioStats()` (the daily-series function the PORTFOLIO page uses) never did. Closed by importing the SAME already-tested `metricsCore.js` bricks (`sortinoRatio`, `winRate`, `histVaR`, `histCVaR` — `profitFactor` was already imported) and applying them to the daily series exactly the way `sharpe`/`annVol` already are in that function — zero new metric math. Added: `sortino`, `profitFactor` (day-level: gross positive-day-sum ÷ gross negative-day-sum), `winRate` (% of positive trading days — a real, different-and-usually-higher number than a per-trade win rate, since several trades can net to one positive day), `excessKurt` (reusing the function's own already-computed raw `kurt` from `skewKurt`, minus 3 — confirmed the fallback path returns `kurt:3` for a degenerate series, i.e. genuinely RAW not excess, so the `-3` is correct), `var95`/`cvar95` (historical VaR/CVaR on the daily series). All wired into the portfolio page's main KPI grid plus a `Sortino` row added to the heat-cap/throttle/fade-stop comparison tables (parallels the existing Sharpe row in each — the stat was already present in the underlying objects since they all flow through the same `portfolioStats()`, just not previously surfaced in those three tables). Sanity-checked the real numbers before shipping: Sortino (3.96) > Sharpe (3.45) as expected for a positively-skewed series (skew 0.20 — downside deviation is smaller than total deviation), CVaR (-4.29%) more extreme than VaR (-3.16%) as required by definition. Confirmed a pre-existing, unrelated test failure (`legoBricks.test.mjs`'s "volatility plan: band fractions match canonical computeBands") is NOT caused by this change — reproduced identically with the edit stashed out before proceeding. **Compounded vs non-compounded split, applied to the WHOLE KPI grid not just drawdown (2026-08-28, same day)**: the owner asked to see which numbers ARE and AREN'T compounded — worth actually checking which ones differ rather than duplicating everything. Real finding: Sharpe/Sortino/profit factor/win rate/annVol/skew/kurtosis/VaR/CVaR are ALL computed straight off the raw daily-return DISTRIBUTION (mean/stdev/percentiles) — identical either way, reinvesting or not. Only CAGR, max drawdown, and Calmar genuinely differ, since those alone depend on how the return SERIES compounds into an equity path. Added the missing non-compounded halves of the two that didn't have one yet: `cagrNonCompounded` (arithmetic — sum of daily % ÷ years, the annualized equivalent of the equity chart's own existing non-compounded line, NOT invented fresh) and `calmarNonCompounded` (that ÷ the already-existing `maxDDNonCompounded`), added to the SAME `withNonCompoundedDD` wrapper `maxDDNonCompounded` already lived in — propagates to `stats`/`statsUncapped`/`statsNoThrottle`/`statsNoFadeTighten` automatically since they all already funnel through it, no new code path. UI restructured into 3 explicit sections instead of one flat grid: "Distribution & risk-adjusted (same either way)" (the 10 invariant metrics), "If you reinvest (compounded)" (CAGR/max DD/Calmar), "If you don't reinvest (fixed risk)" (their arithmetic twins) — plus matching compounded/fixed-risk row pairs added to all three comparison tables (heat cap/throttle/fade-stop). Sanity-checked before shipping: non-compounded annualized return (128.5%) came out LOWER than compounded CAGR (236.5%) as expected (compounding always looks better than the arithmetic sum for a volatile positive-return series — the same relationship already established for the equity chart's two lines), Calmar dropped correspondingly (13.40→6.81) since both its numerator and denominator moved the same direction. Verified via Playwright: all three new sections render with correct values, the heat-cap comparison table shows the 3 new compounded/fixed-risk row pairs with sensible before/after numbers, zero console errors. **Performance Summary report — a printable, single-page tearsheet reusing the page's own already-computed stats (2026-08-28, same day)**: owner asked for a report matching a reference "Performance Summary" layout (RETURNS/RISK/RISK-ADJUSTED PERFORMANCE/TRADE STATISTICS sections, light-themed, navy section headers). Built as a modal on `level-atlas-vote-portfolio.html`, deliberately reusing what's ALREADY on the page (`s.cagrNonCompounded`/`s.maxDDNonCompounded`/`s.sharpe`/`s.sortino`/`s.var95`/`s.cvar95` — the "no compounding" framing matches the compounded-vs-non-compounded split built earlier today) plus a small number of GENUINELY NEW derived numbers nothing else on the page shows: monthly buckets (best/worst/average month, positive/negative month counts, from the same additive daily series the equity chart's non-compounded line already sums), max drawdown DURATION in trading days (distinct from drawdown SIZE, which already existed — longest run below the running peak before a new one), and PER-TRADE win rate/avg win/avg loss/profit factor computed from `trades[]` — deliberately DIFFERENT from the page's existing DAY-level win rate/profit factor (several trades can net to one positive day), the same per-trade-vs-daily distinction the single-pair tearsheet already draws. Added `var99` to `portfolioStats` (one-line addition reusing the already-imported `histVaR` brick, matching the existing `var95`/`cvar95` pattern exactly) rather than reimplementing percentile math client-side, keeping ONE canonical VaR definition. Verified via Playwright + screenshot: Total Return (+555.37%) and Max Drawdown (-18.88%) in the report match the already-validated non-compounded figures from earlier in the session exactly; visual layout closely matches the reference (navy section headers, alternating rows, same 4 sections in the same order); close button and click-outside-to-close both work; zero console errors. **Tail-risk audit of the fixed-risk-sizing headline numbers (2026-08-28, same day)** — owner flagged the "Select recommended" 17-pair portfolio's 73.6% annVol / -2.2pp CVaR-VaR gap / +1.17 excess kurtosis as suspicious relative to its 3.63 Sharpe, correctly, before trusting it. Traced to TWO compounding, non-random causes, both verified against real trade data, not asserted: (1) the worst single days are genuinely crowded, not random draws — every one of the 15 worst days has 60-90% of that day's active pairs losing simultaneously (e.g. 2025-04-09: 30/45 trades across 15 pairs; 2024-09-06: 32/53 across 17), and the worst 20 days average 11.6 simultaneously-active pairs vs 8.7 on a typical trading day, consistent with the correlated-stacking finding above but now shown to hold across the whole tail, not just one flagged event; (2) `sizing=fixed-risk` (the page's default) risks a flat riskPct off EVERY trade's own stop with NO cross-pair damping, so simultaneous-fire days stack additively — confirmed by holding trades fixed and only swapping sizing mode: the SAME 17-pair trades under `sizing=nav` collapse annVol 73.6%→1.75% and the CVaR-VaR gap -2.2pp→-0.06pp, and the SAME swap on the unrelated 5-pair default portfolio inflates its annVol 2.66%→37.25% too (fixed-risk sizing does this at any pair count once multiple positions can share a day, not a 17-pairs-specific artifact). The route already has a cross-pair `maxHeatPct` budget built for exactly this gap (see doc comment above) but it was OFF in the "Select recommended" default; swept 2/3/5/8% caps — each trims annVol and CVaR (2%: 73.6%→46.8% annVol, CVaR -8.4%→-5.8%) but costs Sharpe (3.63→2.01 at 2%) and, counter-intuitively, makes max DD WORSE at every cap tested (-26.4%→-33.3% at 2%) rather than better — a heat cap trims day-to-day tail contribution but does not fix the deep-drawdown problem, which is a which-pairs-move-together question the still-unbuilt exposure-aware risk model (noted above) would actually need to answer. Conclusion given to the owner: the 3.63 Sharpe is honestly priced (real trades, real costs) but is the Sharpe of a specific, aggressive, currently-uncapped sizing choice, not a clean like-for-like read on "the edge" — the 5-pair default's 3.11 Sharpe is not on the same risk footing and the two shouldn't be compared at face value. Minor doc/code drift also found in passing (not fixed, low-stakes): the route's own code defaults `sizing` to `nav` when the query param is absent, contradicting its own comment that fixed-risk is the default — harmless today only because the page's dropdown always sends the param explicitly. **Per-currency daily loss gate (2026-08-28, same day) — built, OOS-validated, shipped.** Owner asked directly, after the tail-risk audit above: on the worst days, do losses concentrate in the same PAIR or the same CURRENCY, and would a same-day stop-trading gate help? Checked the worst 20 portfolio days: worst single PAIR never accounts for more than ~30% of a bad day's loss (median ~20%) — too diffuse for a per-pair gate to matter much — but the worst single CURRENCY (JPY on 9/20 worst days, USD on 8/20 — the two most heavily-referenced legs in the traded pair set: JPY in 4/10 pairs, USD in 5/10) typically accounts for 35-80% of that day's loss. Checked WHY a same-day gate could plausibly help before building it: on 18 of the 20 worst days losses trickle in across Asia->London->NY over hours (real per-trade timestamps confirm this), but on 2 of the 20 (2024-09-06, 2023-10-06) 10-14 trades open within the SAME 5-minute window — almost certainly a scheduled US data release (12:30 UTC = 08:30 ET) — and a same-day loss-reactive gate mechanically cannot help there since every trade in the burst is already open before any of them resolves. Built `applyCurrencyLossGate` (`js/levelAtlasVoteReview.js`) accordingly: strictly causal per trade — a candidate is blocked only if one of ITS OWN currency legs already has REALIZED (resolveTime <= this trade's own open time) cumulative loss beyond the threshold for that date; a still-open sibling trade never counts (no lookahead), tallies reset each date. 5 unit tests (T19, `levelAtlasVoteReview.test.mjs`) cover the block/no-block cases, the no-lookahead guarantee, the per-date reset, and empty input. **OOS-validated BEFORE wiring in** (`scripts/oos_validate_currency_loss_gate.mjs`, same 70/30 chronological-split discipline as the fade-stop/pair-selection checks): swept maxDailyLossPct 1-10% on IS ONLY, picked the tightest cap costing no more than 10% of uncapped IS Sharpe (a pre-stated rule, not best-IS-Sharpe — the objective here is risk reduction, not return-chasing, the same trap that burned the drawdown throttle) — landed on 1%. Applied that SAME frozen 1% unchanged to the untouched OOS slice: Sharpe 3.65->3.88 (improved, not just held), annVol 75.2%->66.6% (-8.7pp), maxDD -25.11%->-20.42% (+4.69pp, shallower), CVaR95 -8.33%->-6.25% (+2.08pp, less severe tail) — every headline metric improved simultaneously, a rare and clean result. Wired into `/api/level-atlas/vote-portfolio` as `ccyLossGate=true&maxDailyLossPct=1` (off by default, same convention as fade-stop tightening — composes with the heat cap by applying to the SAME merged cross-pair chronological list, layered after it), with a `statsNoCcyGate` comparison series (heat cap/throttle/fade-stop held constant) mirroring the existing statsUncapped/statsNoThrottle/statsNoFadeTighten pattern, and a UI toggle + comparison card on `level-atlas-vote-portfolio.html` (`ccyGateChk`/`maxDailyLossPctInput`/`#ccyGateCard`). Verified live via curl (ccyGateInfo/statsNoCcyGate populate correctly, full-sample: Sharpe 3.63->3.52, annVol 73.6%->63.8%, CVaR95 -8.42%->-6.32%) and Playwright (card hidden by default, appears on toggle, comparison table renders, input enables, zero console errors). Explicit, stated limitation carried into the UI copy: does NOT help on scheduled-news-release burst days — that needs a pre-trade block on entries near known release times, a DIFFERENT and not-yet-built mechanism. **News-calendar overlap check (2026-08-28, same day) — the not-yet-built news mechanism above, investigated with existing bricks, no new engine.** Owner asked directly whether the worst-day clustering traces to scheduled news, and whether closing/downsizing near a release would help. Reused the ALREADY-BUILT bricks rather than writing new calendar logic: `js/calendarLoader.js`'s `majorEventEpochs()` (the local historical ForexFactory archive, `calendar_events.csv`, 2014-2026, Major-impact-filtered — already used live by `asiaFibAtlasEngine.js`) + `js/eventGateCore.js`'s `buildEventWindows`/`pairCcys`/`eventGate` (the SAME blackout-window brick the live bots already gate entries on). `scripts/check_news_overlap.mjs`. Confirmed the 2024-09-06 burst IS a real scheduled print (September NFP, "Payroll Jobs Growth" tagged Major at 12:30:00 UTC in the calendar, exactly matching the observed 12:30-12:36 entry cluster) — but a CURRENCY-SCOPED gate (`pairCcys(pair)` must match the event's own currency, the way the live gate actually works) badly under-covers this portfolio: `pairCcys` returns `[]` for GOLD and all 6 equity indices (33.3% of all 16,363 trades get ZERO currency-based news coverage, structurally, regardless of threshold), and even FX crosses without a literal USD leg (AUDJPY/CADJPY/CHFJPY/EURAUD/EURCHF) aren't flagged by a USD print despite visibly moving with it. A CURRENCY-BLIND proximity check (within 30min of ANY Major event, any pair) catches the actual burst far better (14/14 of the 12:25-12:40 cluster vs 11/14 currency-scoped) — the shock transmits via broad risk sentiment, not literal FX-pair currency mechanics. But the DIRECT mean-return hypothesis is a clean NULL either way: trades opened near a Major event do NOT perform worse on average — currency-scoped 58.2% win / +0.112 avg pnlPct near vs 57.8% / +0.074 far; currency-blind 57.8% / +0.105 near vs 57.8% / +0.070 far — both slightly BETTER near news, not worse. Conclusion given to the owner: this is a variance/tail story, not a mean-edge story — individual trades near news aren't bad bets, but on the rare day a big print moves many correlated positions the same losing direction at once, ALL of them lose together (exactly the correlated-stacking mechanism already documented above), so an EV-based per-trade avoidance/downsizing rule isn't supported by the evidence. The more promising, not-yet-built next step would be a BROAD, currency-blind, SCHEDULED pre-emptive exposure reduction (tighten the portfolio heat cap specifically around a small set of known Major-impact release windows — NFP/CPI/FOMC — across ALL pairs at once, gold and indices included) rather than a per-instrument currency-keyed gate, which this check shows would miss a third of the portfolio entirely. **Scheduled news-proximity throttle (2026-08-28, same day) — built, OOS-tested, does NOT clear the bar the currency loss gate cleared.** Owner asked to try the broad/scheduled gate the news-overlap check pointed toward. Built `mergeMajorEventWindows` (merges overlapping event epochs — NFP alone tags 2+ simultaneous "Major" rows — into clean non-overlapping windows) + `applyNewsProximityThrottle` (`js/levelAtlasVoteReview.js`, 8 new T20 unit tests): CURRENCY-BLIND by design (applies to every pair, gold/indices included, unlike `eventGateCore.js`'s per-currency windows), scales BOTH `pnlPct` and `riskPctUsed` together (so a downstream heat cap sees the real reduced risk), `mult=0` degenerates to a block (documented as an approximation — doesn't free the concurrency slot a true block would). OOS-tested with the SAME 70/30-split, no-Sharpe-chasing discipline as the currency gate (`scripts/oos_validate_news_throttle.mjs`): swept window width (15-90min) x risk multiplier (0-0.75) on IS only, selected via a pre-stated rule (best IS CVaR95 among combos with IS Sharpe >= 90% of baseline — CVaR since that's the tail metric this mechanism specifically targets), landed on width=90min/mult=0.25 (throttles ~27% of IS trades). Applied that frozen choice unchanged to OOS: Sharpe 3.65->2.99 (-0.66, a MUCH bigger hit than the currency gate's +0.23), annVol 75.2%->67.2% (-8.0pp, comparable), maxDD -25.1%->-21.9% (+3.17pp, comparable), CVaR95 -8.33%->-7.97% (+0.36pp, MUCH smaller than the currency gate's +2.08pp). Honest read given to the owner: this is a real, mixed tradeoff, clearly WORSE than the currency loss gate on every axis that matters — a much steeper Sharpe cost for a much smaller tail benefit — consistent with the earlier finding that near-news trades aren't individually bad bets, so throttling a broad ~27% of ALL trades mostly just cuts ordinary, non-toxic ones rather than isolating the rare correlated-stacking days. NOT wired into the route/page (unlike the currency gate) pending the owner's call on whether it's still worth exposing as an explicitly-experimental, off-by-default toggle given the weaker result, or shelving as a documented negative finding. **Surgical NFP/CPI/FOMC-only follow-up (2026-08-28, same day) — narrower, still doesn't beat the currency gate.** Owner asked to try a more targeted version before deciding whether to keep the news throttle at all: restrict from ALL 158 distinct 'Major'-tagged event types down to just the well-known US "big three" (`scripts/oos_validate_news_throttle_surgical.mjs` — reads `calendar_events.csv` directly for event NAMES, which `calendarLoader.js`'s `majorEventEpochs()` deliberately strips; whitelist: Payroll Jobs Growth + Headline Unemployment Rate [NFP, same 12:30 UTC print], Inflation Rate/Core Inflation Rate Year-over-Year [CPI], Fed Interest Rate Decision + Fed Press Conference + FOMC Meeting Minutes [FOMC], USD-only — 1,210 epochs vs 5,189 for the broad version). Same 70/30 split, same pre-stated selection rule (best IS CVaR95 among IS Sharpe >= 90% of baseline), same frozen-to-OOS discipline. Result: genuinely gentler (width=90min/mult=0, only 5.9% of trades touched vs 27% broad) and a smaller Sharpe cost (OOS -0.14 vs -0.66 broad) — but also a smaller tail benefit (CVaR95 +0.27pp vs +0.36pp broad), both still far short of the currency loss gate's +2.08pp. maxDD improved +2.45pp, annVol -3.5pp. Conclusion given to the owner: narrowing the event set made the tradeoff LESS BAD but not GOOD — still a net-negative Sharpe-for-tail swap, an order of magnitude weaker than the currency gate on the metric (CVaR) this mechanism specifically targets. Three separate news-timing angles now tested on this data (mean-return null, broad Major-event throttle, surgical NFP/CPI/FOMC throttle) and none of them clear the bar the currency loss gate already cleared — the currency gate appears to already be capturing most of the achievable tail-risk reduction available from this general family of "pre-emptively shrink risk around a known bad-day driver" mechanisms. Not wired into the route/page; recommended to the owner as a documented negative/marginal finding rather than shipped surface, pending their call. **Re-checked the pair-exclusion set now that the currency gate exists (2026-08-28, same day) — the stale pre-gate selection still wins OOS.** The shipped "Select recommended" 10-pair exclusion set was chosen BEFORE the currency loss gate existed; owner asked whether it should be refreshed now that the gate changes the correlated-drawdown picture. Re-ran the exact leave-one-out + greedy forward-elimination methodology (`scripts/leave_one_out_with_ccygate.mjs`) with the gate applied FIRST (gated full-27-pair baseline: Sharpe 2.43, maxDD -60.18% vs ungated 2.79/-64.74% — the gate helps some even at full scale, nowhere near enough alone). The gate-aware greedy elimination found a GENUINELY DIFFERENT 10-pair removal list (AUDCAD/GBPAUD/GBPCHF/AUDJPY/NZDJPY/NZDUSD/CHFJPY/USDCHF/EURCAD/EURJPY — keeps USDCAD/EURGBP/GBPJPY that the old selection excluded, newly excludes AUDJPY/CHFJPY/USDCHF instead) that looked clearly better IN-SAMPLE at the same 17-pair count (Sharpe 3.52 vs 3.19, maxDD -20.27% vs -25.68%). Applied the SAME OOS discipline as every other selection this session (`scripts/oos_validate_pair_selection_with_ccygate.mjs`, 70/30 split, gate applied independently within each stream so no leakage) — and the new selection FAILED OOS: Sharpe 2.66 vs the old set's 3.89 (a full -1.23 gap) and maxDD -22.91% vs the old set's -19.75% (worse, not better), on a substantial 350-day OOS slice. Conclusion: this is the SAME in-sample-overfitting trap the drawdown throttle got caught by earlier — the new exclusion set fit the IS period's specific correlated-loss pattern, which didn't recur the same way OOS. The stale, pre-gate 10-pair exclusion set remains the better, more robust choice and was NOT changed. A genuine value of doing the check: confirms the currently-shipped selection isn't just "good enough," it's specifically MORE robust than the tempting-looking refresh — a real reason to leave it alone, not just an absence of a reason to change it. **Pre-trade net exposure cap — the "real fix" investigated, built, and walk-forward tested; the hoped-for standout win did NOT materialize (2026-08-28, same day).** Every risk lever shipped so far either caps GROSS % regardless of direction (`applyPortfolioHeatCap`) or reacts to a REALIZED loss (`applyCurrencyLossGate`) — nothing caps NET SIGNED exposure pre-trade, so two trades that HEDGE (long EURUSD + long USDCHF: net USD ~0) get budgeted identically to two that STACK (long USDJPY + long USDCHF: net USD doubles). Built `tradeFactors` (decomposes a trade into signed per-factor weight: FX legs via `currencyLegs`+`betDirection` [exported, was private], gold its OWN 'XAU' factor, all 6 equity indices sharing ONE 'EQUITY_RISK' factor — gold deliberately NOT lumped with equities since its historical risk-off beta is often the OPPOSITE sign) + `applyExposureCap` (tracks RUNNING net exposure per factor across currently-OPEN positions, global chronological order, releases on `resolveTime` — genuinely different causal shape from the currency gate's per-DATE reset, since exposure is a live position not a daily tally). 12 new T21 unit tests confirm the hedge-survives/stack-blocks/no-lookahead/release-on-resolve behavior precisely. First OOS pass (`scripts/oos_validate_exposure_cap.mjs`, standard 70/30 split, same pre-stated 90%-Sharpe-floor rule as the currency gate) landed on a LOOSE cap (3, allows 3 same-direction stacked trades per factor) that barely bit OOS: Sharpe +0.01, CVaR95 +0.16pp, maxDD +2.23pp — weak, nowhere near the currency gate's result. Printing the OOS curve at OTHER grid points afterward (purely descriptive, NOT a re-selection — would be data-snooping) showed cap=1 had a MUCH bigger effect on that one slice (CVaR +2.71pp, maxDD +9.6pp) but at real Sharpe cost (-0.53) — since that was seen only after freezing the real result, it couldn't honestly be adopted without contaminating the test. Resolved properly with a WALK-FORWARD validation instead (`scripts/walkforward_validate_exposure_cap.mjs`, 4 equal blocks -> 3 independent forward folds, each fold selecting its OWN cap from its OWN training slice only, never touching its own test data): fold 1 (train ending 2023-04-03) picked cap=1 and got hammered OOS (Sharpe 1.95->0.64, a -1.31 collapse) for a CVaR gain (+2.35pp) but ZERO drawdown improvement (maxDD -0.06pp, i.e. flat-to-worse); folds 2 and 3 picked the looser cap=3 and showed near-nothing both ways (Sharpe -0.07/+0.04, CVaR +0.63pp/+0.09pp, maxDD -0.94pp/+1.74pp — 2 of 3 folds show maxDD getting WORSE, not better, with the cap ON). Conclusion given to the owner: across 3 genuinely independent folds, this mechanism does NOT reliably improve drawdown, and its one real effect (fold 1's tight cap) cost nearly all the strategy's Sharpe for no drawdown benefit at all — a bad trade, not a good one. Working hypothesis for WHY: the worst days (documented earlier — 11-17 pairs losing simultaneously) are driven by a BROAD, systemic risk-off/liquidity shock spanning MULTIPLE currencies/clusters at once, not a same-single-currency stack — a per-factor cap has no notion of "several different factors each modestly loaded, all moving together on the same bad day," which is structurally what actually happens. A real fix for that would need a covariance/stress-scenario-aware AGGREGATE cap across factors, not a per-factor one — a substantially bigger undertaking, not attempted here. NOT wired into the route/page. Net effect of today's exposure-model investigation: it does NOT beat the currency loss gate, and the currency gate + 10-pair exclusion set remain the best-validated levers actually shipped. **Stacked-levers OOS check (2026-08-28, same day) — a genuinely POSITIVE finding, unlike the two negative ones above.** Fade-stop tightening and the currency loss gate were each OOS-validated INDIVIDUALLY against the plain baseline, never together — they could interact, since fade-stop tightening changes a trade's OWN loss size, which changes the DAILY per-currency loss total the gate's tally reacts to. `scripts/oos_validate_stacked_levers.mjs` reproduces the LIVE route's exact composition order (fade-stop tighten -> per-pair concurrency cap -> risk-adjust -> cross-pair currency gate), each lever keeping its ALREADY-validated parameters (fade-stop: per-pair stop re-chosen from IS-only each config, same discipline as its own OOS script; currency gate: frozen 1%) -- not re-deriving anything new, just checking the validated combination doesn't cancel out. OOS deltas vs baseline: fade-stop ALONE (Sharpe +1.87, annVol +15.6pp WORSE, maxDD +2.01pp, CVaR95 -1.00pp WORSE -- a real, previously-unstated cost: it boosts mean return a lot but does NOT help, and slightly hurts, tail risk); currency gate ALONE (Sharpe +0.23, annVol -8.7pp, maxDD +4.69pp, CVaR95 +2.08pp -- as already known); BOTH STACKED (Sharpe +1.29, annVol +0.5pp ~neutral, maxDD +4.56pp, CVaR95 +1.68pp). Naive additivity check: summed individual Sharpe deltas = 2.10 vs actual stacked = 1.29 (a real negative interaction, -0.81 lost) but summed individual CVaR95 deltas = 1.07pp vs actual stacked = 1.68pp (a POSITIVE synergy — better than naive addition, because the gate now reacts to fade-stop-adjusted, smaller individual losses). Net picture: the stacked config is the best-ROUNDED result tested — it keeps almost all of the currency gate's drawdown/tail benefit while ALSO getting a healthy chunk of fade-stop's Sharpe lift, WITHOUT fade-stop-alone's real cost (the 15.6pp vol blowup and worse CVaR are both gone once the gate is layered on top). Verified live via the actual route (`fadeStopTighten=true&ccyLossGate=true` together) — both toggles already compose correctly with zero code changes needed, since they were built as independent, order-respecting steps from the start. Recommendation: running BOTH together (already possible today by checking both boxes on the portfolio page) is a better-balanced choice than either alone, not just a redundant combination. **volatility_bot_v2 build complete (2026-08-28, same day) — the forward/paper-validation milestone this whole session was building toward.** Full stack shipped, all pieces tested: server-side plan producer (`_refreshVolatilityV2Plan`, `server.js`) turning `getFastLive`'s live touches + the OOS-validated vote/pricing math into a frozen, pollable plan; Python executor + engine (`volatility_bot_v2/`, mirrors `oi_bot/`'s proven architecture — `VoteSession`/`bet_direction`/`should_fire`/`stack_conflict`, 27 unit tests) with a bot-side `CurrencyLossGate` (11 unit tests) porting the OOS-validated JS gate's tally logic for live use; all 5 KV gate lists registered; a `bot-config.html` tab (`#tab-volatilityv2`) with a checkbox-array pair picker (matching `level-atlas-vote-portfolio.html`'s own picker, NOT the other bots' free-text convention — deliberate), a per-zone "Today's Levels & Live Decisions" table, config/credentials forms, and `_POS_BOTS`/`TAB_BOT_KEY_MAP` registration (a SIXTH hand-maintained sync point beyond the five KV gates, found while wiring this in — `bot-config.html`'s own archive-tab feature). Verified end-to-end via Playwright against a live local server: pair picker renders all 27, "Select recommended" correctly selects the 17-pair OOS-validated set, "Select all" all 27, config save/load round-trips through real KV and survives a page reload, zero console errors traceable to anything built here (the few 403/404s present on the page are pre-existing, unrelated gaps in OTHER bots' own KV registration — position_hedge_bot's keys missing from `isAllowedKVKey`, not touched here). Two real infrastructure bugs found and fixed ALONG THE WAY, not just the bot itself: the SPX/DOW/CHFJPY stale-data pipeline bug (Step 0) and the `getFastLive` cold-start thundering-herd/OOM risk (throttle + R2 snapshot persistence, both documented in this file's main Level Atlas entry above) — both benefit every Level Atlas consumer, not just this bot. Paper-mode only, MT5-live and real forward P&amp;L are the explicit next milestone, deliberately NOT attempted this session (zero live track record — backtest + OOS only, per this project's own "never fake the forward step" discipline). |
| **VWAP Fixed-Sigma Band Atlas** | `js/vwapFixedSigmaEngine.js` + `js/vwapFixedSigmaReport.js` (2026-08-25) | per-touch REFERENCE book for integer σ bands (±1σ…±7σ) around the UTC-day session VWAP where **1σ is FROZEN at session open** (median of the prior 20 sessions' RMS deviation from their own running VWAP — the owner's Pine study's construction, integer bands replacing the 0.5 steps). One row per fresh (close-inside re-arm) band touch: outcome = symmetric next-band-out vs one-band-back race on moving barriers + fade-oriented 60-min MFE/MAE (σ units) + reached-VWAP + re-entry; ~23 context dims. **Composes, copies nothing**: `computeSessionVwap` (vwapReversionEngine — still no fourth VWAP definition), the full `confluenceFeatures` pack (WaveTrend M1/MTF/1h, ADX, 4h trend, approach, climax, reject, round number), `pipSize`; report imports the SHARED `annotateHolds` OOS gate (now exported from `levelAtlasReport.js`, per playbook §3.2 — one gate function everywhere). **Result (gold M1 2016–2026, 2,734 sessions, OOS split 2022-03-21; `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md`)**: band-tag ladder ~halves per σ (82/48/24/11/6/3/1.5% of days); the headline "~2:1 reversion from every band" is a **definitional tautology** — a seeded random-walk control through the identical engine reproduces it (the deviation coordinate shrinks because VWAP converges toward price), and the same control KILLED `vwapDrift`/`churn`/`otherSideMaxBand`/`sessionPos` as mechanical; permutation baseline: 85 held findings vs 41.5±(20–53) by chance, so only cross-cell themes count. Survivors: Asia touches revert more / NY+overlap continue more; touch-bar accept-vs-reject reads honestly; grind-approach dies (sign-FLIPPED vs the control — the cleanest genuinely-gold finding); WaveTrend/ADX/4h-trend conditioning **not found**. No standalone fade edge (MAE>MFE every band) — re-confirms `VWAP_REVERSION_FINDINGS.md` from a second geometry. Tested `js/vwapFixedSigmaEngine.test.mjs` (perturb-the-future, fixed-σ-not-widened, session isolation, crafted race paths). Runner `scripts/run_gold_vwap_sigma.mjs`; controls `scripts/run_gold_vwap_sigma_controls.mjs` (both offline, local parquet). No routes/UI yet — rows+book are the deliverable (playbook §4). **Return-to-VWAP book (2026-08-25, same session)**: `buildVwapReturnBook` — the owner's actual question ("price hits kσ and returns to VWAP — trend it by vol/session/momentum layers") as a second gated outcome over the same rows. Two traps caught and baked in: the outcome is *returned within 240min among touches with ≥240min left* (a raw before-session-end outcome produced fake Δ−40pp sessionPos findings — pure clock truncation), and every rate reads against the random-walk control. Headline: at ±1σ the "always returns" impression is mostly the coordinate artifact (61% vs control 53.5%), **at 3σ/4σ it is overwhelmingly real (≈28%/≈20% vs control 4.8%/0%)**; conditioning: NY deep stretches don't return (Asia/London do), WaveTrend-neutral touches return far more than WT-extended on gold (control flat ⇒ not mechanical) **but WT does not replicate on FX majors — gold-only, medium confidence**; 108 held findings vs permutation baseline 38.2 (≈3× noise floor, the strongest structure in the study). Cross-instrument sweep `scripts/run_vwap_sigma_sweep.mjs` (pre-named checks): deep-band return excess, NY-least, grind-dies, reject/accept all replicate on EURUSD/GBPUSD/USDJPY. Open: remaining 22 pairs, session-anchor sweep, σ-definition A/B. **§11 addendum (2026-08-30)**: owner asked for a research-not-indicator pass adding VWAP slope, range-consumed-vs-expected, and a momentum×range-consumed combined dimension (`vwapSlope`/`rangeConsumed`/`momRangeMatrix`, all causal, all read through the same random-walk control) — reusing this engine/report/controls script (not a new one). `vwapSlope` turned out MECHANICAL (control reproduces gold's Δ almost exactly, e.g. −15.2 control vs −15.8/−14.3 gold at ±1σ) — tested and explained away, not promoted. `rangeConsumed`/`momRangeMatrix` show a real, non-mechanical excess specifically at deep (2-3σ) bands in the CONTINUATION direction — e.g. `rangeConsumed=3·high` dn|2 OOS+6.5 vs control −0.1; `momRangeMatrix=3·trend×3·high` dn|2 OOS+9.5 vs control −6.8 (sign-flipped, the strongest kind of finding here) — directly the OPPOSITE of the "exhaustion → mean reversion" hypothesis it was built to test, real cell-by-cell not as a blanket rule (one matrix cell, `3·trend×2·mid` at up|1, IS itself matched by the control and not real). Full writeup `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §11. **§12 addendum (2026-08-30)**: owner's screenshot-driven follow-up ("is -3σ a mean-reversion location or part of an expanding trend distribution") — adds `bandSlope` (short causal ATR(14) rate-of-change over 30min, reusing `indicatorCore.js`'s `atrWilder`, NOT the frozen or cumulative-developing σ already in the engine), `regimeState` (momAdx×bandSlope combo — deliberately the raw combo, not a named 4-state classifier), `wtRegimeState` (regimeState×wtState, VuManChu layered last per the owner's instruction), and `bandWalk` — a NEW forward-scan OUTCOME (not a context dim) measuring literal band-walking (consecutive bars beyond a lenient in-band threshold post-touch), with a new `buildBandWalkBook` in the report layer mirroring `buildVwapReturnBook`'s exact shape. Checked against the same random-walk control (extended to cover all 4). Result: `bandSlope` is real (control near-zero throughout) and runs OPPOSITE to naive intuition — expanding volatility correlates with MORE return-to-VWAP, stable/contracting with LESS; `regimeState=3·trend×3·expanding` is the one cell that behaves like real, gold-specific continuation matching the owner's own hypothesis (sign-flipped vs a control that shows the opposite at the same cell); `wtRegimeState` (VuManChu-last) shows more nominal held findings but that's largely an artifact of testing ~2× the cells, not clean evidence of incremental value — reported as honestly inconclusive, consistent with the standing "WaveTrend conditioning is thin" finding elsewhere in this study. `bandWalk` itself passed an internal-coherence check (`candleReject=3·reject` predicts less walking, as it should) before anything was built on it. Full writeup §12; explicitly NOT built: a named validated regime classifier, an earlier-than-touch leading indicator, the joint bandSlope×rangeConsumed interaction, or a real statistical (AUC/information-gain) incremental-value test. **§13 cross-instrument replication (2026-08-30)**: checked §11/§12's two headline findings on EURUSD/GBPUSD/USDJPY via 3 new pre-named checks in `scripts/run_vwap_sigma_sweep.mjs` (T4/T5/R4). `bandSlope` REPLICATES cleanly on all 3 majors, same direction, similar-to-larger magnitude (+8.6 to +11.2pp expanding-vs-stable gap vs gold's own +7 to +11pp) — now the best-corroborated new finding, real on 4 instruments. `regimeState=3·trend×3·expanding` (the cell that matched the owner's screenshot hypothesis) does NOT replicate — flat/negative on EURUSD/GBPUSD, small-positive-but-far-under-gold on USDJPY — the same gold-only pattern already seen for the WT-neutral-returns finding; explicitly flagged as unvalidated going forward. `rangeConsumed` high-vs-low couldn't be checked this way — the "low" bucket is essentially unpopulated on FX majors at deep bands (n=3), a data-coverage limit not a failed test. **§15 addendum (2026-08-30) — the OTHER band unit, momentum vs reversion:** owner shared a screenshot of self-widening bands and asked which construction this whole study tests (answer: fixedRms, §1-14b, throughout) then asked to run the same race/return/band-walk books under `sigmaMode:'developing'` (the classic self-widening unit, already wired through the engine but never control-matched before). Added `--sigma-mode` to both `run_gold_vwap_sigma.mjs` and `run_gold_vwap_sigma_controls.mjs` (default `fixedRms`, byte-identical prior behavior) — the random-walk control previously had no way to run in developing mode, so a matched apples-to-apples comparison didn't exist. No engine/report changes (`sigmaMode` and the book builders were already unit-agnostic). **Result: two clean regimes by depth.** Near VWAP (±1-2σ), gold's race/return rates match the matched random-walk control almost exactly — mechanical, not market, confirming §10's "developing mostly measures itself" depth-by-depth. Past ±2-3σ gold decisively diverges from the control **toward continuation, not reversion**: the control's out-rate decays monotonically with depth (40.6%→4.0%) while gold's rises (bottoms ~20% at ±3σ, reaches 30-58% by ±5-7σ, 2-10× the control) — real, non-mechanical momentum once a session has built genuinely unusual range. The return book shows the same non-mechanical excess in the other direction (gold's return-to-VWAP rate running +7 to +15pp ABOVE the control at ±2-4σ) — not contradictory, real sessions produce more of both full round-trips and breakouts than a driftless unclustered walk. Cross-validated theme (return-book suppression + band-walk-book increase, same cells, OOS, n=30-140): NY session / London-NY overlap touches on days that haven't yet consumed their typical range show substantially LESS reversion and MORE continuation — the opposite of a naive "fade the extension" read, in exactly the session where it's most tempting. 107/334/98 held findings (race/return/walk) vs permutation noise ceilings of 80/56/17 — real structure, not chance. Still descriptive only — no trade-level test has been run under developing bands (all 5 prior trade tests, §6/§9/§14/§14a/§14b, used fixedRms). Full writeup `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §15. | offline scripts only (no server routes) | ✅ built (reference book; null on the fade, context themes held; return book replicated cross-market; §11: vwapSlope mechanical, rangeConsumed/momRangeMatrix real at depth; §12: bandSlope real and counter-intuitive, regimeState's trend×expanding cell matches the owner's hypothesis, VuManChu-last inconclusive; §13: bandSlope replicates on 3 FX majors, regimeState's headline cell does NOT — gold-only; §15: developing/self-widening band unit control-matched for the first time — near-VWAP reversion mechanical, deep-band and NY/overlap-session behavior real and momentum-favoring, not yet trade-tested) |
| **VWAP Impulse-Entry v1** | `js/vwapImpulseEntryV1Engine.js` (2026-08-25) | the TRADE-LEVEL stage-2 test on top of the fixed-sigma atlas: an HTF impulse (30m/1h/4h, reusing `impulseRangeEngine.detectH4Impulses` — timeframe-agnostic despite the name) UNLOCKS an entry zone for 240min; two opposite hypotheses through one flow: `pullback_continuation` (with-impulse limit at session VWAP, TP=impulse extreme, SL=1.5×ATR15m) and `band_reentry_fade` (impulse close beyond fixed ±2σ, first M1 close back inside fires an entry toward VWAP — the reference Pine study's own re-entry event). Reuses `computeSessionVwap`, `groupUtcDays`/`computeFixedSigmaByDate` (exported from `vwapFixedSigmaEngine.js` for exactly this, equivalence-tested so the trade layer and the atlas can never band-drift), `walkBars`, `atrWilder`, `summarizeSplit`; costs ON (0.020% commodity). **Result (gold M1 2016–2026, pre-registered in `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §6): NULL both modes, every trigger TF** — best OOS t +0.37 (4h continuation, n=202, noise); the fade loses consistently (OOS t −2.5 to −3.4), matching the atlas's descriptive MFE<MAE; the overlap-only sensitivity does not rescue it (a held descriptive context ≠ an after-cost entry edge — demonstrated, not assumed). Tested `js/vwapImpulseEntryV1Engine.test.mjs` (crafted impulse/pullback/fade paths, trigger-close causality, quiet control). Runner `scripts/run_gold_vwap_impulse.mjs`. Pivot 1 (asymmetric exit) run 2026-08-25: `exitMode:'time'` (60-bar mark-to-close, SL live) — also null (OOS t −1.3/−3.7/+0.02), the exit geometry was not the missing piece. Kept as a costed harness for the remaining pivot angles (touch-bar-theme gates, impulse-range levels as the zone, cross-instrument). | offline script only | ✅ (null result, pre-registered; time-exit pivot also null) |
| **Range-Fib × VWAP Entry v1** | `js/rangeFibVwapEntryV1Engine.js` (2026-08-25) | the owner's stated rules tested as-worded, pre-registered (`GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §8b): A) a range-fib level lying within 0.5×fixed-σ of session VWAP is touched → trade the ladder direction to the next level out; B) a level ≥2σ from VWAP is touched → fade to VWAP. Composes `rangeFibEngine`'s Asia/Monday range builders (now exported: `_buildAsiaSessions`/`_buildMondayRanges`/`dayStartEpoch`), `fibProjection.calcFibs`, the atlas σ (`computeFixedSigmaByDate`), `causalAtr` (exported from `vwapImpulseEntryV1Engine`), `walkBars`, `summarizeSplit`; costs on, 30-bar VWAP warmup, one trade/day/rule. **Result: NULL both rules on gold+EURUSD+GBPUSD+USDJPY** (extension OOS t −2.9…−4.7, gross ≈ 0 — a coin flip paying the spread; fade t −1.0…−3.0). Companion descriptive check: the atlas gained a `rangeConf` dimension (touch within 0.15σ of an Asia/Monday fib level, causally gated) — **no coherent effect on either book** (signs flip across bands/sides; return outcome flat/negative), consistent with §1m's S/R falsification; one footnote-grade cross-consistent lean (±1σ asia-level touches +1.5…+4.6pp continuation on all 4 instruments). Tested `js/rangeFibVwapEntryV1Engine.test.mjs` (crafted extension/fade paths, Asia-close causality, quiet control; `_fsOverride` test hook documented in the engine). Runner `scripts/run_rangefib_vwap.mjs`. | offline script only | ✅ (null result, pre-registered) |
| **Stacked Fade v1** | `js/stackedFadeV1Engine.js` (2026-08-25) | the ONE entry the fixed-sigma books themselves pointed at, run pre-registered with the multiple-selection risk stated up front (`GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §9): fade a ±2/3σ FIRST touch toward VWAP (entry next bar open, TP=VWAP at touch, SL 1.5×ATR15m, 240min cap, ≥240min session left), gated V0 none / V1 not-NY×reject-candle / V2 +WT-neutral (gold). Consumes `fixedSigmaWalk`'s touch rows directly (never re-detects or re-reads context); `causalAtr`+`walkBars` reused. **Result: NULL every variant, all 4 instruments — the fully-stacked V2 was the WORST cell OOS (t −1.52 at n=30)**, the signature of over-selection on mined data. Third independent demonstration (after §6, §8b) that the books' descriptive structure does not convert to an after-cost entry by gating touches. Runner `scripts/run_stacked_fade.mjs`. **Addendum (2026-08-27, §9a)**: owner's follow-up — gold only, ±3σ band alone (not pooled with 2σ), new `requireMomentumAgree` gate (fade only when raw wt1 is still on the SAME side of zero as the extension at touch — the opposite bet from V2's `wtState=2·neutral`). Touch rows gained `wtStateValue` (raw wt1, alongside the existing bucket) in `vwapFixedSigmaEngine.js` for this. **Result: NULL both variants** (V0 band-3 OOS t −1.68, V-momentum OOS t −1.72) — and the gate barely filters the pool (1,260→1,243, ~1.3%) since a genuine 3σ extension almost always already has momentum on the same side, so it isn't really a distinguishing condition here. Band-3-alone is gross-negative even before costs (−0.012 to −0.013%), worse than the pooled 2σ+3σ V0 (gross +0.012%). New tests `js/stackedFadeV1Engine.test.mjs` (7 asserts on the gate's filtering logic). Runner `scripts/run_third_band_momentum_fade.mjs`. **§14 addendum (2026-08-30) — "test a with-trend entry not fade":** engine gained `action:'fade'|'follow'` as a parameter of the SAME entry primitive (Lego Principle #2, not a new engine) — `action:'follow'` enters WITH the touch direction (opposite of fade's mapping), TP=(band+1)σ as of touch (frozen), SL=(band−1)σ as of touch (frozen) — the exact symmetric race `fixedSigmaWalk`'s own out/back outcome already measures descriptively, now costed. New `requireBandSlopeExpanding` gate (§12/§13's cross-market-real dimension). **Result: NULL, every variant, gold + all 3 FX majors — the fifth trade-level test in this study to come back null.** V0-follow (regardless) clearly negative everywhere (OOS t −1.37 to −3.75). The `bandSlope=expanding` gate moves EVERY instrument toward breakeven vs its own V0 (win rate +1.5-4pp on 3/4, gross flips positive on 3/4) — the descriptive finding shows up honestly in the trade data — but not enough to clear a ~1:1 R:R geometry plus costs anywhere; the exit geometry, not necessarily the entry signal, is the likely limiter (same conclusion §6 reached). 5 new tests. Runner `scripts/run_trend_follow.mjs`. **§14a addendum (2026-08-30) — "if this works it reacts to the band very quick, so the SL should be small":** new `followSlSigma` config (default 1.0 = §14's baseline) tightens the stop only, TP unchanged — swept 1.0σ/0.75σ/0.5σ/0.25σ (~1:1 to ~4:1 R:R) × both gates × gold+3 FX majors = 32 pre-registered cells, all printed not cherry-picked. **Result: NULL, all 32 cells** — no cell clears OOS t>2. Diagnosed mechanism: R:R improves exactly as the geometry implies, but win rate collapses FASTER at every step (e.g. gold 48.3%→33.6%→23.9% as R:R goes 1:1→2:1→4:1) — the continuation this study found is real but doesn't confirm fast enough for a tight stop to avoid getting clipped by noise first. 2 new tests. Runner `scripts/run_trend_follow_sl_sweep.mjs`. **§14b addendum (2026-08-30) — "let's look at the 1m closed candle... 1m/3m":** new `confirmTfMinutes` config reuses `vwapExtensionAtlasEngine.js`'s own closes-not-wicks day-aligned bucket-close convention (not reinvented) — at the new default 1, the touch bar's OWN close (not just its wick) must already be beyond the band; at 3, wait for the enclosing 3-minute bucket's close. TP/SL geometry unchanged from §14/§14a. **Result: still NULL — gold (the bar-defining instrument) does not clear it in any variant (OOS t −2.38 to −3.19)** — but win rate jumps meaningfully everywhere (53-66%, up from 48-53% pre-confirmation), confirming the "closes not wicks" filter genuinely removes noise touches. Two secondary instruments (GBPUSD, USDJPY) turn OOS-positive on the `bandSlope=expanding` gate at confirm=1m, but both show the classic IS/OOS sign-flip (e.g. GBPUSD IS t −2.12 → OOS t +0.45) this study has learned to read as chance resolving differently in two halves, not a stable effect — flagged as noise, not promoted. 2 new tests. Runner `scripts/run_trend_follow_confirm.mjs`. **§16 addendum (2026-08-30) — "build a tradable system... vwap out and then band back to vwap":** owner asked to build a tradable version of §15's developing-band descriptive work. That's literally the existing `action:'fade'` trade, never run under `sigmaMode:'developing'` before. New `excludeOverlap` gate (drops `overlapWindow===true` touches — §15's own cross-validated real theme, distinct from the existing session-bucketed `excludeNY`), +2 tests. `run_stacked_fade.mjs` gained `--sigma-mode`/`--bands` flags (default `fixedRms`/`[2,3]`, unchanged prior behavior) plus a developing-mode variant set (V0-dev pooled 2σ+3σ, V0-dev band-3-only, V1-dev with excludeNY+excludeOverlap, V1-dev band-3-only). **Result: NULL, every variant, all 4 instruments — the worst (most negative) OOS t-stats of any trade test in this study** (t −2.0 to −8.3 across 16/16 cells, all significantly negative, not just non-significant). Win rate is actually decent (51-61%) but gross P&L is negative or negligible even before costs on most cells. The `excludeOverlap`+`excludeNY` gate barely moves any cell. Bug-hunted before accepting the null (per house discipline): the fixed 1.5×ATR15m stop is NOT obviously mis-scaled against developing bands' larger σ — sampled at gold ±3σ, it runs a median 3.24× that touch's own developing σ, comparable to or wider than a genuine winning fade's own median MAE (1.88σ). Leading unproven explanation: when a developing-band fade loses, the adverse move is drawn from the same fat, still-expanding realized-range tail that makes the touch deep in the first place — a stop/target sized for the normal case doesn't respect how much worse the tail gets exactly on the days this signal is deepest. Not yet isolated — would need a volatility-scaled or MAE-triggered exit, not built. Sixth independent null on this idea shape across both band units and multiple exit constructions. Full writeup `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §16. **§17 addendum (2026-08-30) — PMO momentum-agree gate + a 1m-ATR 2026 walkthrough:** owner's two follow-ups — "let's just play" (walk the exact §16 system through 2026 gold, but with the stop's ATR computed **on the 1m chart**, `atrTfMin:1`, not §16's 15m), then "add momentum high/low to correspond to the +3/-3 touch." New `requirePmoAgree` gate (+4 tests), same sign-vs-zero shape as `requireMomentumAgree` but reading a NEW indicator, `pmo` (Price Momentum Oscillator, Carl Swenlin — not previously in this codebase; built in `js/indicatorCore.js`, +3 tests incl. a frozen bit-for-bit reference; wired causally into `vwapFixedSigmaEngine.js` as `pmoValue`/`pmoSignal`/`pmoState`, +2 tests, same per-session-reset convention as `wt1`/`atr14`; `pmoState` registered in `DIMENSIONS`). **Result, both null.** 2026 gold, 1m-ATR stop: −7.0% cumulative, 153 trades, win 25.5% — WORSE than §16's 15m-ATR version (win 51%) because a 1-minute ATR is a much tighter number, so the stop clips ordinary pre-reversion noise before the move plays out (same mechanism §14a diagnosed on a different trade). The PMO gate: barely filters the pool (~7-9% removed, both on the 2026 sample and the full pre-registered cross-instrument structure) and moves results slightly WORSE, not better, everywhere it was tested — statistically indistinguishable from no gate on all 4 instruments, full history (gold OOS t −6.70→−6.27, EURUSD −4.74→−4.64, GBPUSD −2.43→−2.20, USDJPY −3.73→−3.78). Same conclusion §9a already reached with WaveTrend's own momentum-agree gate: a genuine deep-band touch is already almost always momentum-aligned by construction, so "is momentum still extended the same way" doesn't distinguish much at this depth, regardless of which named oscillator asks. Seventh null on this idea shape. Full writeup `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §17. **§18 addendum (2026-08-30) — "how would a colleague actually be trading this":** owner asked to bring in outside trading knowledge, then test it. Two mechanisms, both new ground: `requireApproachSpike` (Crabel's "the stretch" — `approachVel==='3·spike'`, a fast overextended drive INTO the level, paired with the existing `requireReject` for a real discretionary exhaustion read, not just a touch) and `tpRetraceFrac` (fade TP = `entry + frac×(vwapAtTouch−entry)`; 1.0 unchanged, 0.5 = halfway back — the first test in this whole study to touch the TP construction rather than only the stop). +4 tests — a sign/algebra bug in the first draft of the `tpRetraceFrac` formula (an unneeded `sgn` multiplier) was caught by its own unit test before touching real data. Runner gained V3 (band-3 + exhaustion: reject×spike), V4/V5 (band-3 + tpRetrace 0.75/0.5), V6 (exhaustion × tpRetrace 0.5). **Result: both null, on the full pre-registered cross-instrument structure.** Exhaustion filter (V3): pool shrinks ~85-90% (both conditions must co-occur), OOS t less negative on 3/4 instruments (gold −6.70→−3.31, EURUSD −4.74→−3.81, USDJPY −3.73→−2.48) but WORSE on GBPUSD (−2.43→−3.42) — no instrument near positive, same sign both halves everywhere (a real if weak effect, not a fluke). Partial-retracement target (V4/V5): win rate rises cleanly and monotonically as the target shrinks (e.g. gold 51%→55%→61% at frac 1.0→0.75→0.5) but expectancy does NOT follow — on 3/4 instruments (all but gold) OOS t gets WORSE, not better, as the target shrinks (e.g. GBPUSD −2.43→−3.03→−4.16) — the mirror image of §14a's stop-tightness finding, this time shrinking the TP leg with the SL held fixed instead of the reverse. Combined (V6): gold's least-negative OOS t of the whole study (−2.96, still solidly null, IS t −2.76) — reported honestly as the closest cell, not as a lead; the other 3 instruments do not improve the same way. Eighth/ninth independent null on this idea shape. Full writeup `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §18. **§19 addendum (2026-08-30) — "analyse every touch... cull the bad trades":** owner asked for an open scan of the REALIZED trade's own win/loss (not the touch race/return proxy) against every context dimension built so far, plus RSI specifically. New `rsiValue`/`rsiState` in `vwapFixedSigmaEngine.js` (RSI(14) Wilder, per-session-reset, same convention as `pmo`/`atr14`/`wt1`, +2 tests). New `buildTradeWinBook` in `vwapFixedSigmaReport.js` — reuses the SAME `annotateHolds` gate and `DIMENSIONS` list as every other book, reading a joined trade's `win` boolean instead of touch outcome (+4 synthetic tests). Two new runners: `run_fade_trade_conditions.mjs` (the open scan, permutation-baselined, cross-instrument-checked) and `run_fade_trade_cull.mjs` (turns survivors into an actual gated trade). **Result: real, non-mechanical structure — 49/39/27/31 held findings vs a permutation floor of ~8 on each of gold/EURUSD/GBPUSD/USDJPY.** Five themes replicate on ALL 4 instruments, same sign, OOS: avoid `session=London` (win% −12 to −18pp), avoid `sessionPos=2·mid` (−8 to −19pp), avoid `rangeConsumed=2·mid` (−11 to −20pp), avoid `rangeConf=1·asia` (−11 to −31pp), prefer `approachER=1·choppy` (+8 to +11pp). `rsiState=3·extended` (the owner's own ask) is real but only 3/4 (not GBPUSD). **Turning these into an actual trade: win rate rises substantially and consistently everywhere, and gold's OOS t roughly halves (−6.70→−3.2/−3.4) — the closest ANY configuration in this whole study has come to the pre-registered bar — but every variant on every instrument stays negative.** Losers still outsize winners even in the filtered pool. Explicitly flagged: the filter's own discovery reused the same chronological period later tested as its OOS half, not a fully independent third sample. Tenth null on this idea shape, the most informative one — if anything in this whole study deserves a genuinely independent forward check once more data exists, it's this filter (`approachER=1·choppy` + the 4 avoids), not any of the nine before it. Full writeup `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §19. | offline script only | ✅ (null, pre-registered; §9a addendum also null; §14 with-trend addendum also null though directionally consistent with §12/§13; §14a stop-tightness sweep also null, 0/32 cells, with a diagnosed win-rate-vs-R:R mechanism; §14b closed-candle confirmation also null on gold, though it demonstrably improves trade quality — higher win rate — everywhere; §16 developing-band fade-to-VWAP also null, the worst t-stats in the study, ATR stop checked and ruled out as the obvious cause; §17 a 1m-ATR variant is null and worse than §16, and a new PMO-based momentum-agree gate is statistically indistinguishable from no gate; §18 an exhaustion-confirmation gate and a partial-retracement target are both null — the latter raises win rate cleanly but not expectancy, the mirror image of §14a from the TP side; §19 an open scan of realized trade win/loss found 5 cross-instrument-replicated themes and cut gold's OOS t roughly in half when gated — still null everywhere, but the closest result in the study, flagged for a genuinely independent forward check) |
| **σ-definition A/B + synthetic-walk brick** | `js/syntheticWalk.js` + `vwapFixedSigmaEngine` `sigmaMode`/`liteContext` (2026-08-25) | `syntheticRandomWalkPacked` extracts the controls script's seeded driftless generator into a Tier-1 brick (controls script now imports it). The atlas engine gained `sigmaMode: 'fixedRms'|'developing'|'forecast'` (frozen RMS vs `computeSessionVwap`'s self-widening sd vs `forecastSigma` daily) and `liteContext` (skips feature pack/HTF/range sources for comparison runs) — default path pinned byte-identical by the test suite incl. a lite-vs-full outcome-invariance test. **§10 result: the frozen-RMS unit (the owner's Pine construction) carries by far the largest non-mechanical excess vs its own control (return≤240 excess +22/+24/+19pp at 2-4σ vs +3/+4/+4 for the developing band, which mostly measures itself — retrospectively explaining the original developing-band trade null); daily forecast σ is too coarse for an intraday ladder.** Runner `scripts/run_sigma_definition_ab.mjs`. | controls script, A/B runner | ✅ (fixedRms wins) |
| Backtest stats | `js/backtestStats.js` | the standard battery for a trade-PnL series — Sharpe/Sortino/Calmar/CAGR/PF/payoff/win-rate/expectancy/max-DD+duration, **bootstrap CIs**, **Monte-Carlo** drawdown (**IID reshuffle + stationary block bootstrap** — `blockResample`, Politis–Romano, preserves regime clustering so it doesn't understate tails; `portfolioStats({mc:true})` returns both `volTarget.mcMaxDD` and `volTarget.mcMaxDDBlock`, plus **raw 1× (unscaled)** MC under `raw.*` and the daily lag-1 autocorr **`acf1`** whose sign explains block ≶ IID), **`portfolioStats`** (honest daily-aggregated Sharpe ×√252 + vol-targeted CAGR/DD + **Probabilistic Sharpe**), **`deflatedSharpe`** (López de Prado DSR — discounts Sharpe for the number of trials/search, via inverse-normal expected-max-Sharpe); deterministic seeded PRNG. **2026-07-28: `mulberry32`/`blockResample` promoted to `statsCore.js`** (generic, reusable beyond PnL series — `blockBootstrapIC` needed them too) — this file now imports both instead of carrying its own copy, verbatim-extraction proven bit-identical in `legoBricks.test.mjs`. | `perLineStrategy`, `forecastAnalyserStore`; imports `metricsCore`, `statsCore` | ✅ |
| Volatility-bot plan | `js/volatilityBotPlan.js` | `buildVolatilityPlan(book, volByPair)` — turns the frozen per-line book + today's live per-pair σ/open into the compact artifact the live `volatility_bot` consumes (survivor universe, fade/follow policy cells, per-pair band fractions via canonical `computeBands`). Category-A "ship it a file" contract (PYTHON_LEGO.md §0) — the bot never re-implements the vol math. Pure, tested in `legoBricks.test.mjs`. | `volatilityBotProducer`; imports `forecastCore` | ✅ |
| Volatility-bot producer | `js/volatilityBotProducer.js` | `refreshVolatilityPlan({getBook,fetchD1,sigmaSeries,kvPut})` — assembles the plan from the locked book + live D1 σ + the **London-midnight session open** (`fetchSessionOpen`, the anchor the bands hang off — D1's 22:00-UTC open is only a fallback) (σ computed via `volSigmaSeries`, the SAME path the book learned on — not the drifted `volForecast.js`) and writes KV `volatility_bot_plan`. Network injected → offline-tested. Wired in `server.js` (`POST /api/volatility-bot/refresh-plan`, `GET /api/volatility-bot/plan`, daily scheduler). | `server.js`; imports `volatilityBotPlan`, `instrumentRegistry` | ✅ |
| Confluence core | `js/confluence-core.js` | `detectConfluencesCore`, `mergeCrossSessionConfs` (already shared by dashboard + Pine export) | dashboards, Pine export, backtests | ✅ |
| Walk-forward / MC | `js/sys-backtest-shared.js` | walk-forward & Monte-Carlo helpers, `sharpe`, `maxDD` (P-series) | `system-*.html` | ✅ |
| M1 data loader (ref) | `js/volBacktestM1Engine.js` | `loadM1ForPair`, `BT_M1_DIR`, R2/Drive/parquet pipeline — **v1, read-only production** | session-range engines | ✅ (ref) |

### 1b. New bricks extracted in this pass (2026-06-27)

All six are pure, dependency-free, and covered by `js/legoBricks.test.mjs`
(28 synthetic checks, including a **golden test** that proves the metrics brick
reproduces `honestForecastEngine.summarize` bit-for-bit).

| Brick | File | Owns | Replaces copies in | Status |
|---|---|---|---|---|
| **Bar utils** | `js/barUtils.js` | `bisect`, `extractBars`, `resampleTo`, **`resamplePacked`** (2026-08 — the packed twin of `resampleTo`: lifts a whole multi-year packed M1 history straight to 15m/1h/4h in one pass, carrying summed tick volume, without materialising millions of per-bar objects; the object route OOMs on the 5M-row index/metals parquets), `bodyRange`, `calcATR` (resampled true-range mean), `groupByDate` — the M1 packed-array hot path | `asiaRangeEngine` ✅, `rangeFibEngine` ✅, `confluenceModules` ✅, `bot-config.html` trade-chart modal (`resampleTo` + `bisect` for marker snapping) ✅, `confluenceFeatures` (`resamplePacked`) ✅ | ✅ |
| **Stats core** | `js/statsCore.js` | `mean`, `variance`/`stdev` (ddof), `rollingZScore` (array, faithful to nasdaqTransforms), `rollingZAt` (scalar, faithful to hmm5m), `rollingPercentile`, `linregSlope`, `ewma`, `rankData`/`spearman`/`rankIC` (Spearman rank correlation + rank-IC with t-stat vs ρ=0; tie-robust, pairwise-finite — **caveat added 2026-07-28**: this t-test assumes i.i.d. pairs, too liberal when either series is autocorrelated, use `blockBootstrapIC` instead). **2026-07-28 additions:** `mulberry32` (deterministic seeded PRNG) + `blockResample` (stationary Politis–Romano block bootstrap — both promoted verbatim from `backtestStats.js`'s private helpers, which now import these) + `blockBootstrapIC` (block-bootstrap significance test for a Spearman IC between two autocorrelated series — holds one series fixed, block-resamples the other to build a null, two-sided p-value w/ Davison–Hinkley +1 correction; built to finish `volReversionCore`'s dropped third claim, see that row) | `nasdaqTransforms`, `globalLiquidityEngine`, `macroEquityEngine`, `zscoreSpreadEngine`, `hmm5m*` 🔲; `rankICEngine` ✅; `gold-model.calcZScore` ✅ (2026-07-18: moments via `mean`/`stdev`, guards kept local); `backtestStats.js` ✅ (mulberry32/blockResample, 2026-07-28); `volReversionCore.js` ✅ (blockBootstrapIC, 2026-07-28); **known copy:** `creditLeadLagEngine.spearman` (inline) 🔲; `rangeLevelCore.js` carries its own separate `mulberry32` (seeded placebo shifts, not block bootstrap) — candidate to point at the shared one, not yet done 🔲 | 🟡 |
| **Indicator core** | `js/indicatorCore.js` | `ema`, `trueRange`, `atrWilder` (faithful to hmm5m), `atrEma` (alpha variant), `adxWilder` (faithful to hmm5m), `rsiWilder`. **2026-07-18 ADX alignment fix:** `adxWilder` wrote the smoothed DX one slot early (`out[i+n]` for data through bar `i+n+1`) — a one-bar FUTURE shift every ADX-gated backtest read; the `out[L-1]=out[L-2]` patch only papered over it (live latest-bar read was coincidentally right, so live behaviour is unchanged). Fixed in lockstep in all five copies (`indicatorCore`, `hmm5m.js`, `hmm5m-v2.js`, `regime-backtest.html`, `RegimeOptimizer/backtester_v4.py`); verified causal (truncation-invariant) + final-bar bit-parity on synthetic bars. **Regime backtests need a re-run before their historical numbers are cited.** | `hmm5m`, `hmm5m-v2`, regime backtests, `range-bias`, `backtest-engine`, `weeklyVolBacktestEngine` (ADX regime source) 🔲 | 🟡 |
| **Metrics core** | `js/metricsCore.js` | `sharpeRatio`, `sortinoRatio`, `calmar`, `maxDrawdownFromPnls`/`FromEquity`, `profitFactor`, `winRate`, `expectancy`, `summarizeTrades` (== honestForecast.summarize); **2026-07-17:** `sharpeStdError` + `minTrackRecordLength` (the Sharpe-honesty pair — see §1r). **2026-07-18:** `summarizeTrades` now EMITS the pair (`sharpeSE`, `minTrackYears`) on every summary — every `summarize`/`summarizeSplit` IS/OOS card carries its error bar (additive fields; golden test unchanged). `server.js` `_qmrStats` (+`_liqGateStats`, now an alias — was a verbatim copy) switched to calendar-daily √252 Sharpe and consumes the pair. **2026-07-21:** distribution-shape / tail set — `skewness` (Fisher g1), `excessKurtosis` (normal=0, explicitly named), `histVaR` / `histCVaR` (empirical type-7 quantile ES, no parametric assumption). Pure population moments; hand-checked in `legoBricks.test.mjs`. `summarizeTrades` EMITS `skew`/`excessKurt`/`var95`/`cvar95` (additive; golden unchanged) AND feeds the real skew/kurt into `minTrackRecordLength` so `minTrackYears` is now fat-tail-adjusted, not Gaussian. **Units caveat:** VaR/CVaR here are PER-TRADE-pnl tail stats, not portfolio VaR over a horizon. | `honestForecastEngine` ✅, `trendFollowV2Engine` ✅, `gold-backtest-worker` ✅ (2026-07-18: Sharpe/winRate/PF via `summarizeTrades`); still inline 🔲: `nasdaqPerformance`, `zscoreSpreadEngine`, `macroEquityEngine`, `rangeFibEngine`, `backtest.js` | 🟡 |
| **Fib projection** | `js/fibProjection.js` | `FIB_LEVELS` (45-level grid), `KEY_LEVELS`, `calcFibs` (`low + range × level`) | `asiaRangeEngine` ✅, `rangeFibEngine` ✅, `confluenceModules` ✅ | ✅ |
| **Stream blend** | `js/streamBlend.js` | combine two independent daily-return streams and measure whether **diversification** lifts risk-adjusted return (the "risk is the edge" test): `alignByDate` (common trading days only, accepts date→ret maps or `{date,ret\|pnl}[]`), `blendReport` (return **correlation** — the crux, scale-invariant · per-stream annualised Sharpe · blend Sharpe over a weight grid · `maxSharpe` [in-sample-optimistic] · `riskParity` weight · `diversificationRatio` at equal weight · `equalWeight`), `blendStreams` (align+report). Pure, no deps; creates **no** edge — measures whether two existing ones cover each other's drawdowns. Unit-tested `js/streamBlend.test.mjs` (15 cases: recovers a planted ρ, negatively-correlated legs → blend beats both, identical legs → no benefit, date alignment). | `server.js` `/api/combine/mom-rev` (trend-momentum × per-line-fade blend, vol-normalised → risk weights) → `trend.html` blend card ✅ | ✅ |
| **M1 gap-fill** | `js/m1GapFill.js` | `computeGap`/`lastPackedEpoch`/`toEpochSec`, `chunkMinuteRange` (≤5000-bar OANDA pages), `fetchM1Gap` (paginated, injected `fetchCandles`, skips a failing chunk), `mergeBarsIntoPacked` (append-only, deduped, non-mutating), `gapFillPacked` — tops a frozen R2 M1 `packed` series up to "now" at book-rebuild time (no parquet writer) | `forecastAnalyserStore.refreshPair`/`runRefresh` (opt-in `gapFill`) ✅; OANDA M1 fetcher = `volBacktestEngine.fetchM1Range`. Test `js/m1GapFill.test.mjs` | ✅ |
| **Instrument registry** | `js/instrumentRegistry.js` | canonical pip size, price digits, asset class, symbol aliases (display/OANDA/Yahoo/MT5/code) + accessors (`pipSize`, `instrument`, `resolveKey`…). 2026-07-18: `US100` broker alias added to `EXTRA_ALIASES` (→ nq), `instruments.json` regenerated | server.js `PIP_SIZE`, `js/config.js`, `volBacktestEngine` `INSTRUMENTS`, `js/deskApp.js` (`pipSize`/`resolveKey`/`priceDigits` for board distances) ✅, `asiaRangeEngine`/`rangeFibEngine` `PIP_SIZE` 🔲; **Python `_PIP_SIZES` ✅ retired 2026-07-18** — all 11 remaining inline pip dicts (RegimeV7/V4/V2 + backtest_v3, DynAnchorBot, bot/{hedge_bot,backtest}, bot/utils/sl_tp_engine, bot/modules/{confluence,oi_walls}, backtestSystem/mt5_utils) now call `pip_sizes_for` with their original keys; verified entry-by-entry against the HEAD literals (217/217 match). `scripts/grade_v7_audit.py` keeps its documented replicated copy. `_PIP_VALUES` (pip VALUE, not size) remains un-bridged — sizing change behind risk review | 🟡 |
| **London session clock** | `js/londonSession.js` | the pure, browser-safe London clock: `SESSIONS` (asia/london/ny windows in London wall-clock hours) + `_londonParts(date)` -> `{date:'YYYY-MM-DD', hour}`, DST-correct via `Intl` (never a hardcoded +/-1). **Extracted 2026-08-27 from `js/sessionStats.js` to fix a dead page, not for tidiness.** `sessionStats.js` also fetches Oanda, reads `process.env` and writes JSON with `fs`; `js/volEstimatorAB.js` imported ONLY these 7 pure lines from it, and `volEstimatorAB` is the base of `buildLondonDaily`, which ~14 engines compose. When `forecast-reversion.html` imported one of those engines (`exhaustionLadderEngine`, for `dayTurns`), the chain reached `import fs from 'fs'` and the browser discarded the page's ENTIRE entry module -- blank controls, no chart, no visible error. The rule this encodes: **a pure helper must not live behind an I/O import.** `sessionStats.js` re-exports both names, so its six existing importers are unchanged. Guarded by `js/browserModuleGraph.contract.test.mjs`, which walks every page's import graph and fails on any bare specifier -- the ordinary suite cannot catch this, since Node resolves `fs` happily and stayed green while the page was dead. | `js/volEstimatorAB.js` (direct); `js/sessionStats.js` re-exports for `forecastSessionResearch`, `intradayForecastResearch`, `reversalPointResearch`, `volResearchBook.test.mjs` | OK live |
| **Credit core** | `js/creditCore.js` | the corporate-credit-spread ("credit-Greeks") feature set + risk-appetite gate from an HY OAS series (oldest→newest, pct-points): `creditFeatures` (position percentile · velocity 1d/5d/20d Δbps · acceleration sign · persistence days-in-regime · CCC−BB quality) + `creditGateFromFeatures`/`creditGate` (→ RISK-ON/NEUTRAL/CAUTION/RISK-OFF). Pure; imports `statsCore` (`rollingPercentile`); change/percentile-based so the liquidity-premium level washes out. Design: `docs/CREDIT_SIGNAL_SPEC.md`. Unit-tested `js/creditCore.test.mjs` (28 cases). | `today.html` credit gate (module → `window.creditBrick`) ✅; `creditLeadLagEngine` (predictor) ✅; **TDE** — `server.js` `_tdeCreditContext` → `buildSnapshot({credit})` → logged-inert `credit_*` features + Telegram flip alert ✅; intended: `macroCore` (its own inline HY rule) 🔲 | 🟡 |
| **Credit HMM** | `js/creditHmm.js` | standalone 2-state Gaussian HMM for a 1-D series (spread level or ΔOAS): `fitGaussianHMM2` (log-space Baum-Welch EM + Viterbi, deterministic init) + `creditRegime` (→ current regime, stress posterior, self-transition persistence, expected duration = 1/(1−p_stay) — the principled "theta"). Pure, no deps. Unit-tested `js/creditHmm.test.mjs` (18 cases, recovers planted regimes). **Known related copy:** repo-root `hmm.js` has a scaling-based 2-state Gaussian EM (`baumWelch`/`viterbi`, unexported, log-return observable) — candidate to unify onto this log-space brick. | `creditLeadLagEngine` (persistence predictor) ✅; intended: `today.html` credit persistence term 🔲 | 🟡 |
| **Credit lead-lag engine** | `js/creditLeadLagEngine.js` | the honest study — does credit-Δ lead NQ realized vol, beyond vol's own persistence? `creditPredictors` (features + HMM stress prob, causal), `forwardRealizedVol`/`trailingRealizedVol`, `leadLagTable` (corr by lag, lag>0 = credit leads), `pearson`/`spearman`, `runCreditLeadLag` (IS/OOS information-coefficient + hit-rate vs the past-vol benchmark), `alignByDate`. Pure/injected (offline-testable). Imports `creditCore` + `creditHmm`. Unit-tested `js/creditLeadLagEngine.test.mjs` (17 cases, recovers a planted lead + beats benchmark). **Note:** its inline `spearman` predates and duplicates `statsCore.spearman` — candidate to unify onto the brick. | `server.js` `/api/credit-leadlag/*` (async job; fetches FRED `BAMLH0A0HYM2` full history + OANDA `NAS100_USD` D1) → `credit-leadlag.html` ✅ | 🟡 |
| **Vol reversion engine** | `js/volReversionCore.js` | the institutional VRP/OU claim tested directly on an instrument's OWN realized vol (not price vs a fair value — both `js/mve/*` price branches are NULL for NQ, see MVE_RUN_GUIDE.md): `volRichnessZ` (causal z-score of trailing realized vol vs its own history), `volOuDiagnostic` (does it mean-revert at all — κ/half-life via `ouCore.ouFit`), `scoreVolPredictsForwardVol` (does the standardized reading beat vol's own raw-level persistence at predicting forward realized vol — benchmark discipline mirrors `creditLeadLagEngine`'s `pastVol` benchmark). **Interpretation note (found while validating on synthetic data, see file header):** z-scoring structurally strips out slow regime-level information, so raw level tends to beat it at predicting future raw level whenever the vol regime itself is persistent — a negative/null result here means "standardizing doesn't help forecast forward vol beyond the raw level", NOT "vol doesn't mean-revert" (`volOuDiagnostic` answers that separately). **Third claim completed 2026-07-28** (`scoreVolPredictsForwardReturn` — vol-richness → forward PRICE return, the "vol spike → bounce" idea): a first attempt was dropped in the PR that introduced this file (circular-shift/block-permuted surrogate didn't calibrate — mean \|icEdge\| 0.06–0.30 on a pure random walk). Root cause found on re-examination: that diagnostic (mean \|icEdge\|) isn't the right calibration check — a correctly-centered null still has nonzero E[\|X\|] by construction. Rebuilt on `statsCore.blockBootstrapIC` (new shared brick, see that row) with the actual right check — FALSE-POSITIVE RATE across ~60 repeated independent pure-random-walk simulations, measured directly in `volReversionCore.test.mjs`, not asserted from theory. That measurement also surfaced a real multiple-testing problem (picking the best of 4 horizons runs the false-positive rate to ~14% raw, confirming CLAUDE.md's "count the cells" warning) — fixed with a Bonferroni correction across the horizons actually tested (`best.pAdjusted`, the number the verdict uses), which the same test proves brings the false-positive rate back near nominal. Reuses `forwardRealizedVol`/`trailingRealizedVol`/`spearman` from `creditLeadLagEngine.js`, `forwardReturns` from `nasdaqResearch.js`, `rollingZScore`+`blockBootstrapIC` from `statsCore.js`, `ouFit` from `ouCore.js` — no re-implementation. Unit-tested `js/volReversionCore.test.mjs` (24 cases: the original 16 + a runs-and-returns smoke test + the false-positive-rate/null-bias calibration proof). | `server.js` `/api/vol-reversion/:sym` (OANDA-only via `mve/liveAdapter.fetchPriceOnly`, no FRED_KEY, returns `{diagnostic, forecast, priceReturn}`) — not yet run on real NQ data | 🟡 |
| **Rank-IC diagnostic (D1)** | `js/rankICEngine.js` | the honest "does a score sort the outcome?" study — `SCORES` registry (day-type composite `T` + its component estimators + regime/momentum directional call, all no-lookahead), `runRankIC` (score→forward-window rank-IC per score with a true IS/OOS split), `runRankICSuite` (fetch D1 + loop + pooled per-score OOS summary with significant-cell count for multiple testing). Grades ONLY D1-reproducible scores. Imports `dayTypeCore`, `volBacktestEngine`, `statsCore.rankIC`, `forecastCore.HORIZONS` — no copies. `rankData`/`spearman`/`rankIC` unit-tested in `js/legoBricks.test.mjs`. | `server.js` `/api/rank-ic/*` (async job; fetches OANDA D1) → `rank-ic.html`; linked from `index.html` (Vol ▾ + sitemap) ✅ | ✅ |
| **Rank-IC (live scores)** | `js/rankICLiveEngine.js` | grades the ACTUAL live entry scores (`live_signal_score`, `live_stars`, `day_type_T`, `vol_pos`, `approach_vel`) vs realized trade `pnl_pct` — the M1 counterpart to the D1 engine. Drives `asiaRangeEngine` (opt-in gap-fill) over M1 so the score graded is the one the bot really computes via the shared `entryGradeCore`/`rangeBiasCore`/`hmm.js` bricks — no D1 fake, no re-implementation. `runRankICLive` (per pair) + `runRankICLiveSuite` (loop + pooled OOS summary). Feeds pairs into `statsCore.rankIC`. Scope: Asia-range candidates, no-macro blend; small-n aware (shows trade count). | `server.js` `/api/rank-ic-live/*` (async job; M1 parquet + OANDA gap-fill) → `rank-ic.html` "Live entry scores" section ✅ | ✅ |
| **Asia-range engine** *(gap-fill add-on)* | `js/asiaRangeEngine.js` | existing M1 Asia-range backtest gained an **opt-in gap-fill**: `runAsiaRangeBacktest(pair, { gapFill, fetchCandles, nowSec })` tops the frozen R2/parquet M1 snapshot up to now from OANDA live via the `m1GapFill` brick (`gapFillPacked`) before building sessions. Default OFF ⇒ existing callers byte-identical; gap-filled runs bypass the shared pair cache so topped-up and frozen series never mix. Resolves the OANDA symbol via `instrumentRegistry.oandaSymbol`. | `rankICLiveEngine` (gap-fill on) ✅; all other callers default-off ✅ | ✅ |

> **Wired:** `asiaRangeEngine.js`, `rangeFibEngine.js` and `confluenceModules.js`
> all import `barUtils` + `fibProjection` instead of their private copies, and
> `honestForecastEngine.summarize` delegates to `metricsCore` (verified
> `node --check` + brick tests; full backtest re-run needs M1 data/network not
> available in the sandbox). Remaining adoption is tracked in §2 and §5.

### 1c. Tier-2 level-source bricks (2026-06-28)

These are the **strategy-building** bricks: pluggable modules that each EMIT a
list of price levels, built ON the Tier-1 primitives above. The repo already
proved the pluggable pattern in `confluenceModules.js` ({`buildPairCache`,
`buildDayState`, `check`}) — but that interface only answers "is this price near
a level?", so the levels stay trapped in the Asia-range engine. The level-source
contract instead **emits** the levels so one list feeds three consumers: a
confluence scorer (cluster), the chart viewer (render), a strategy (trade).

**Contract**

```
LevelSource = { id, label, kind, defaultParams, levels(ctx) → Level[] }
Level       = { price, kind, label, weight, meta }       // + `source` when via collectLevels
ctx         = { dailyBars, instrument, price?, intraday?, params? }
```

`dailyBars` = chronological completed D1 bars; the LAST element is the most
recent completed day, so "over past x days" = the last x. No lookahead — a
module only reads what it's given. Pip size comes from `instrumentRegistry`.

| Brick | File | Owns | Status |
|---|---|---|---|
| **Level sources** | `js/levelSources.js` | `LEVEL_SOURCES` registry + `collectLevels` (aggregate to one tagged list) + `clusterLevels` (merge to scored zones). **Eight** sources: `daily_open`, `prior_hilo` (PDH/PDL, PWH/PWL, N-day extremes), `pivots` (classic + camarilla), `volume_profile` (POC/VAH/VAL over x days), `swing_sr` (N-bar pivots, clustered), `swing_fib` (multi-swing fib projections incl. golden pocket 0.618/0.65; emits a level only where ≥`minConfluence` **distinct** swing pairs agree — distinct-pair guard kills the density confound), `round_number` (big/half figures), `vwap` (session VWAP anchors over x days). Tested in `js/levelSources.test.mjs` + `js/telegramV2.test.mjs` (swing_fib distinct-pair confluence). | ✅ built |
| **Render brick** | `js/levelChart.js` | reusable Lightweight-Charts viewer — `createLevelChart(el).setCandles().setLevels(Level[]).setZones(zones)`; pure `styleForKind` / `levelToPriceLineOptions` / `zoneToPriceLineOptions` (colour keyed by `Level.kind`). Lifted from `gold-zones.html`. Demo: `level-chart-demo.html`. Consumers: `level-chart-demo.html` ✅, **`forecast-analysis.html` Book-tab trade viewer** ✅ (click a trade → its M1 session with Close/Proj-H/L forecast lines + entry/TP/SL marked, fed by `getSessionChart`), **`telegram-v2.html` zone chart** ✅ (click a v2 zone → M5 candles + entry/SL/TP price lines, fed by `/api/oanda_ohlc5m`), **`bot-config.html` volatility-bot live-lines modal** ✅ (click a pair → today's M1 session + the 8 forecast lines colour-coded by live trade state, fed by `GET /api/volatility-bot/session-m1/:pair`), **`desk.html` market-board drill-in** ✅ (`js/deskApp.js`: click a board row → M15 candles + forecast-band levels (`daily-brief` prices, hit% in the label) + range-line zones + OI walls/max-pain, all passed in as a `Level[]`; degrades to a level table if the chart lib is unavailable). `KIND_STYLE` gained a documented vol-bot state family — `vbBuy`/`vbSell`/`vbMixed`/`vbActed`/`vbIdle`/`vbOpen`/`vbPrice` — kept generic so any bot page can render the same key. Pure helpers + factory wiring tested headless against a mock in `js/levelChart.test.mjs`. | ✅ built |
| **VuManChu core** | `js/vumanchuCore.js` | ONE WaveTrend / Money-Flow / VWAP compute, consumed two ways: `waveTrendSeries` (raw WT1[] for backtest gating) and `waveTrendReading` (latest-bar OB/OS/cross signal) — same compute, mode selects the shape. Standardizes the divide-by-zero guard on `WT_EPS = 1e-10`. Wired into `js/vumanchu.js` ✅ (re-exports `computeWT`/`computeMF`/`computeVWAP`/`ema`/`sma`) and `asiaRangeEngine._computeWT1Series` ✅. Golden test (`js/vumanchuCore.test.mjs`) proves it reproduces BOTH former copies bit-for-bit. | ✅ built |
| **Range-bias core** | `js/rangeBiasCore.js` | the live entry-bias features — `computeADX`, `computeHurst`, `ema`, `featureADX`/`SwingRegime`/`Twap`/`EmaRsi`/`Hurst`, `computeRangeBiasServer`, `computeWeeklyPivots`. Extracted verbatim from `levels.js`; wired into `levels.js` ✅ (live) + `asiaRangeEngine` ✅ (backtest). Golden test (`js/rangeBiasCore.test.mjs`) proves bit-for-bit equality. | ✅ built |
| **Entry-grade core** | `js/entryGradeCore.js` | the live star rating + `signalScore` weighting — `computeStars`, `computeStructScore`, `momScoreFrom`, `rbScoreFrom`, `computeSignalScore` (38/25/25/12 + FRED 25/25/20/20/10). A/B/C grade stays in `trade-grade.js`. Wired into `levels.js` ✅ + `asiaRangeEngine` ✅. Golden test (`js/entryGradeCore.test.mjs`, 108 combos). | ✅ built |
| **COT positioning (crowding)** | `_worker.js` (`/api/cot-extremes`) · `cot-extremes.html` | CFTC Commitments of Traders for **35 markets x 200 weeks**: spec + commercial net, percentiles, z-scores, gross L/S, open interest and its percentile, weekly change. **OI-NORMALISED (2026-07-28):** crowding was ranked on RAW contract counts, which conflates "more crowded" with "bigger market". ES is the proof — the largest absolute short on the board (-322,865) with open interest at the **9th percentile** of its own range, so the position is -16.7% of a thin market while the raw rank calls it a middling 64th; MXN is the mirror (raw 78th, net 27% of an OI at the 46th). Both blocks (TFF + disaggregated) now also emit `specShare`/`commShare` (signed net as % of OI), `specSharePct`/`commSharePct` (that share's percentile over the same window) and `specShareZ`; raw percentiles stay for continuity and the dashboard can toggle between the two bases. **History (opt-in):** the 200-week series was computed to rank the current value then discarded — `?history=SYM` now returns one instrument's weekly `specNet`/`commNet`/`oi`/`specShare`, stripped from the default response since 35 x 200 x 4 would be a ~2MB poll. **Brief, both levels:** the per-pair block gains the normalised percentile and share, **flipped into pair terms** for JPY/CAD/CHF (the futures are the foreign leg — without the flip the brief describes specs as long the pair when they are long the foreign currency), plus an explicit note that COT is a Tuesday snapshot released Friday and is a positioning conditioner not a timing signal; and a new `snap.cotMarket` gives the 8 most stretched markets board-wide plus median crowding BY GROUP, which answers whether one crowded pair is idiosyncratic or part of a broad stretch. **Dashboard rebuilt** on the OI-dashboard system (legible type, body-level help tooltips so panels cannot clip them, per-panel Enlarge): crowding leaderboard, crowded-trades table, specs-vs-commercials scatter (they should sit on a downward diagonal — off-diagonal means the mirror broke), median by asset class, 200-week history per market, a raw-vs-normalised disagreement table, and the full grid. Cross-linked with `oi-dashboard.html`. Verified headless on the live 35-market payload incl. the graceful fallback before the normalised fields exist. **Downstream propagation fixed 2026-08-21:** the worker had emitted the normalised fields since 2026-07-28, but `js/cot.js`'s `extremesToCotData` adapter — the ONLY path from the API into `S.cotData` — dropped every one of them, so the browser consumers (`js/levels.js`'s ACT→WATCH downgrade, the COT card, pair-composite) and the live `bot/modules/cot_filter.py` were still ranking RAW contract counts; i.e. the §4.3 "COT percentiles on raw contracts" defect was only half-closed. The adapter now carries `specShare`/`specSharePct`/`specShareZ`/`specShareChg`/`commSharePct`/`oiPct`/`histLen` through, and `cot_filter` prefers the share rank with the raw rank as fallback (reporting which basis it used in `metadata.oi_basis`; 4 new tests cover prefer/fallback/mirror cases). Cache keys are now the single exported `COT_KV` constant in `_worker.js` — see the key-drift note in the OI-walls-export row. | ✅ built (positioning/crowding context — weekly and lagged, NOT a timing signal; no edge claim) |
| **OI-wall reachability** | `js/oiReachability.js` | P(price TOUCHES each option wall) inside a horizon, built on `forecastPathCore`'s existing intraday cone + seeded MC (`intradaySamplePaths`) — one path set answers everything, no second simulator, and it inherits the intrabar wick budget so a wick touch counts. **The calibration is the whole point.** Raw `intradayReachability` pTouch is systematically OVER-CONFIDENT: measured over 24,000 predictions on 36,486 EUR/USD M5 bars (2026-02→07, H=12), a predicted 94% touches **68%** of the time and 74% touches 59%, mean |error| **9.0pp** (11.6pp at H=48). Realised outcomes compress into ~11–68% while predictions span 5–94%. It is monotonic though, so it ranks correctly and is recalibratable: fitting a piecewise-linear reliability map on Feb–Apr and testing on the untouched May–Jul gives **OOS mean error 9.4pp → 1.7pp** (worst bin 25pp → 4pp). `REACH_CALIB` + `calibrateTouch(p)` apply that map; `wallReachability(ctx,i,walls,H)` returns per-wall `{calibrated, raw, medBarsToTouch, side, distFrac, calibSource}` nearest-first — **`calibrated` is the headline, `raw` is kept only for transparency**. `firstTouchRace(ctx,i,up,down,H)` answers which bracketing wall is reached FIRST (order, which two independent touch probabilities cannot give — they can sum past 1); returned UNCORRECTED and labelled as such, since a single-barrier calibration does not transfer to a race. `visitDensity(ctx,i,H)` is where paths DWELL — the well-posed version of "most touched path", which is degenerate under a driftless diffusion (the modal path is flat, always). Caveats in the header and on the record: the map was fitted on EUR/USD M5 at H=12 only, so it is a correction of known SHAPE not a per-pair guarantee (`calibSource` says which curve was used); and it never promises more than the ~69% observed ceiling. Says nothing about whether a touched wall HOLDS — separate, unproven. **C+Z export wiring (P(touch) per level):** `reachLabel(row, barMin)` → the compact `"82%~2h"` string (`calibrated` %, `~` + `fmtReachEta(medBarsToTouch, barMin)` median ETA; `~?` when the touch never happened in the MC, `''` when there's no probability) — the pure formatter both the export and any label share. `GET /api/vol-forecast/zones?reach=1` (opt-in — one live OANDA M5 fetch + MC per pair, fail-safe + 25s-bounded, keyed by `price.toFixed(6)`) builds `reachByPair` and hands it to `buildOILevelText`, which appends P(touch) as a THIRD ` . ` segment (parse index 3, AFTER heat at index 2, with heat `-` as a placeholder so touch keeps its slot when heat is absent). Un-updated indicators drop the trailing segment → byte-identical to before; the OI dashboard's export button is the sole caller that sets `?reach=1` (vol-forecast pages stay fast). The `Confluence Zones Indicator.pine` parses `oiTouch` and renders it additively in the level label + table. Pure/offline-tested (`js/oiReachability.test.mjs`, 35 cases incl. the over-confidence correction, the no-extrapolation ceiling, and the `reachLabel`/`fmtReachEta` strings; export wiring asserted in `js/legoBricks.test.mjs`). **Not smoke-tested against live OANDA** (sandbox 403s) — the `?reach=1` path needs one Railway check. | ✅ built · calibrated OOS (touch probability real; wall-hold behaviour NOT tested; live `?reach=1` path unverified) |
| **Gamma-flow core** | `js/gammaFlow.js` | the "connecting info" around the gamma flip (COG's dealer-positioning lens), all **no-new-data** (derived from the OI analyser's existing per-strike GEX profile + per-expiry term structure): `gammaFlip(gexProfile)` (zero-GEX crossing = regime boundary — one source, replaces the inline loops), `distanceToFlip(spot, flip, {atr})` (the vol read — %/ATR + which side of the flip + `near` flag), `flipDrift(series)` (is the flip migrating TOWARD spot = regime change loading, from `oi_history`), `rolloffSummary(termStructure, {rollDTE})` (OpEx roll-off — near-expiry OI share + next-expiry pin shift). Pure/offline-tested (`js/gammaFlow.test.mjs`). Wired across **all four surfaces**: OI bot (`buildOIZones` `nearFlip` size haircut + `regimeWarning` note; producer computes per-instrument `gammaFlow` into `oi_bot_zones`), dashboard (`oi-zones.html` flip line + gamma-flow readout + term-structure table), daily brief (`_injectServerContext → s.oiGamma` → distance/drift/roll-off lines, ATR-normalised via `s.atr`), and export (`oiLevelExport` flip+distance row + per-expiry block). `inst.gammaFlip` now emitted by `processOIData` + archived in `_oiHistorySummary`. **Charm/vanna (2026-07, now wired):** `js/gammaGreeks.js` — closed-form BS `bsCharm` (∂Δ/∂time), `bsVanna` (∂Δ/∂vol) + `charmVannaExposure` (GEX-style aggregate CEX/VEX + charm/vanna flip levels, per-strike `sigmaFn` hook). Fed by a real IV surface: `parseIVSettlement` (`js/oi.js`) reads the **CME QuikStrike Option Settlement Tool** paste (14-col tab table, col3=Strike col7=VolSettle; tested vs the real paste in `js/oiIV.test.mjs`), a 4th optional textarea on the OI modal (`oiIVData`, DTE from `oiDTE`). `processOIData` computes `inst.greeksFlow` (source `iv`); surfaced across dashboard (charm/vanna chips + flips), brief (CEX/VEX line), export (charm/vanna row), and passed through `oi_bot_zones`. Tested `js/gammaGreeks.test.mjs`. Positioning context, folklore-tier edge, partial on FX — not a validated signal; charm decent, vanna needs the real smile (which this now supplies). | ✅ built (data-honest layer + charm/vanna on real IV) |
| **Level expectation** | `js/levelExpectation.js` | `levelExpectation(level, ctx)` -> `{band, short, mid, long, tag}` — what to expect price to do AT a level, from the gamma band that level sits in. Five words reused everywhere: **Reject** (turns away) · **Break** (goes through) · **Magnet** (drifts to) · **Pin** (sticks here) · **Edge** (changes here), plus `far` when the level is beyond ~2.5x `refMove`. One rule decides Reject vs Break: in a **calm** (long-gamma) band hedging fights the move so levels hold; in a **jumpy** (short-gamma) band hedging feeds the move so the same level gives way — which is why one call wall can read Reject and another Break on the same instrument. **The band is resolved AT THE LEVEL, not at spot**, which is the point: the export previously stamped one regime per pair from spot's side of the flip, so every level inherited it even when it sat in a different band. Depends on `gexFlipCrossings` (`js/gammaGreeks.js`, added alongside) returning EVERY zero crossing with its direction rather than only the nearest — a one-sided book (USD/CAD, P/C 0.34, 24 strikes) crosses **three** times and is really a set of alternating bands with a short-gamma pocket, and reporting one edge of that pocket as 'the' flip is what made `gexFlip` look 9.4% unstable between two runs over an identical book (different root chosen, not a root moving). `gexFlipPrice` still returns the nearest and is byte-identical for every existing caller; `inst.gexFlips` carries the array. Wired to the C+Z export (`oiLevelExport`, appended after a ` . ` marker) and the Pine indicator (`oiNotes`, shown in the existing type cell) — the Pine parser reads token 0 as the type and a `t`-prefixed token 1 as the tier and IGNORES the rest, so an un-updated indicator is unaffected. **These are the textbook readings, NOT measured ones** — every result carries a stable `tag` (`call_wall:short:far`) so each expectation can be logged against what price actually did and scored later; until that exists, treat them as a hypothesis printed on a chart. Pure/offline-tested (`js/levelExpectation.test.mjs` — band alternation asserted against the real three-crossing USD/CAD set, label lengths bounded so the chart stays readable). | 🔬 built · unvalidated (mechanism only, no outcome scoring yet) |
| **IV-surface metrics** | `js/ivMetrics.js` | the tradeable reads off the pasted CME QuikStrike IV settlement, beyond charm/vanna (`parseIVSettlement` now also emits `callPx`/`putPx`/`ivPrior`): `expectedMove` (ATM straddle → option-implied ± range to expiry — **real/definitional**, a cross-check vs the vol cone), `ivDynamics` (ATM IV change + skew steepening = tail-hedge demand), `riskReversal` (OTM put−call IV skew = directional sentiment tilt), `vannaState` (VEX sign × IV direction → the classic vanna tailwind/headwind read — descriptive). **Second paste shape (2026-07-27):** `parseSettlementTermStructure` (`js/oi.js`) reads the CME **"Settlements"** table — the per-EXPIRY ATM summary (one row per expiry: Symbol·DTE·Strike·Future·Straddle·Vol·OI, 17 cols) — distinct from the per-strike chain `parseIVSettlement` handles. `processOIData` **auto-detects** shape (a dd/mm/yyyy date in col 2 ⇒ term-structure table): the term-structure table yields `expectedMove` straight from the straddle settle (`expectedMoveFromStraddle`, picking the expiry nearest the bot's primary-expiry DTE) + `ivTermStructure` (ATM IV front→back, upward/inverted) but **no smile → no charm/vanna/skew**; the per-strike chain gives the full smile as before. **Two boxes (2026-07-27):** because the two tables are complementary (per-strike = smile/charm-vanna for ONE expiry; Settlements = IV term structure across ALL expiries), the OI modal has a dedicated second textarea `oiIVTermData` alongside `oiIVData`, so both can be pasted together — box 1's per-strike ATM straddle is the more precise expected move, box 2 only FILLS what box 1 lacks (term structure, or expected move if box 1 is empty). Box 1 still auto-detects either shape (back-compat). `rawIVTerm` persisted/restored like `rawIV`. `inst.ivTermStructure` surfaced in the brief + today.html card + the analyser card (new `_oiIVReads` block: expected move + term structure + charm/vanna + RR). **Smile-box expiry hint (`inst.ivPasteHint`):** the walls come from the primary expiry (a DTE); matching that DTE to the nearest Settlements-table row yields the exact **QuikStrike code + date** to grab for the per-strike smile box — shown in the save toast + analyser card + today.html card so there's no expiry to decode by eye (falls back to naming the DTE when no Settlements table is present). **Keep-open two-stage flow (2026-07-27):** when Analyse produces a coded hint but the smile box is still empty, `processOIData` leaves the modal OPEN (skips the input-clear/close), shows the exact expiry inline by the smile box (`#oiSmileHint`) and focuses it — so the smile paste is one more Analyse, not a close/reopen. The next Analyse (smile present) closes normally. Pure/offline-tested (`js/ivMetrics.test.mjs`, `js/oiIV.test.mjs` incl. the owner's real NQ paste). `processOIData` attaches `inst.{expectedMove,ivDynamics,riskReversal}` + `greeksFlow.vanna`; surfaced across **daily brief** (AI prompt: expected-move + implied-vs-ATR rich/cheap, IV dynamics, risk reversal, vanna read), **today.html** OI card, **dashboard** (`oi-zones`: expected-move band on the chart + chips), **export** (`exp_move_hi/lo` levels + RR tilt for the live indicator), and **bot** (`buildOIZones`: a TP beyond the implied move is flagged low-prob; vanna note). Expected move is real; IV-change/RR/vanna are positioning context, folklore-tier for direction, strongest on indices, weak on gold/FX. **Viz + forecast (2026-07):** `renderSmileChart` (IV-smile SVG, today vs prior, in the analyser `renderOICard`); `forecast-path.html` "OI exp-move" toggle overlays the implied-move band on the cone (model vs market); `forecastPathCore.coneFromContext`/`samplePaths` gain `sigmaOverride` so the cone/MC can run on option-implied vol (a labelled risk-neutral scenario — variance-risk-premium caveat). | ✅ built (expected move real; rest = context) |
| **Gate analysis** | `js/gateAnalysis.js` | `compareGates` / `bestGate` — compares candidate trade gates (entry grade vs vol-forecast HL75 stretch vs day-type T vs approachVel) on a true IS/OOS split with thin-sample flags; honest "no gate adds OOS edge" result. Renders as Panel 0 in `asia-range-analysis.html`. Test `js/gateAnalysis.test.mjs`. | ✅ built |
| **Profile-shape core** | `js/profileShapeCore.js` | the Market-Profile **day-SHAPE selector** (`b`/`p`/`D`/`B`) layered on the existing volume-profile output — `buildHistogram` (zero-filled volume-at-price from OHLC, body-midpoint proxy faithful to `volumeProfileLevels`), `valueArea` (histogram → POC/VAH/VAL greedy walk), `classifyProfileShape` (POC position + bimodality/LVN-waist detection → `P` low-base/bullish, `b` high-cap/bearish, `D` balance, `B` double-distribution, with `pocPos`/`skew`/`confidence`/`lvn`/`peaks`), `profileShapeBias` (shape → **fade/follow** entry bias: follow long/short on P/b, fade both edges to POC on D, follow the LVN break on B — parallels `dayTypeScore → selectStrategy`), `classifyBars`. Pure, no DOM/network; test `js/profileShapeCore.test.mjs` (synthetic P/b/D/B histograms, 26 assertions). Not yet wired into a live strategy — the selector brick to A/B on the OOS card next. | ✅ built |
| **Range-line analyser** | `js/rangeLineAnalyser.js` | the Forecast-Level per-line strategy applied to RANGE levels, **modules stripped** — `analyseRangeWindow` (emits perLineStrategy-shaped line records off Asia/Monday fib ladders, triple-barrier), `runRangeLineAnalyser`, `runRangeLineBook` (packed M1 → records → pooled-IS policy → per-pair OOS), `recordsForPair`/`touchesForPair` (split so the route caches the expensive records and re-derives touches per `conditions`), **no-lookahead `validFrom` gate** (Asia levels tradeable only after the formation window closes; Monday levels never on Monday itself), plus exported `buildRangeLadder` / `LADDER_LEVELS` (shared with the v2 live producer so live & offline build the identical ladder). `analyseRangeWindow` also records **MFE/MAE excursion to session close** (`excMid`/`excAway`) and **`eRatioByCell`** computes the per-cell E-ratio (does price run past the level → trailing-exit study), plus **path-simulated follow trail PnLs** (`fStruct` structural ratchet / `fChand` chandelier, via the now-EXPORTED `walkChandelierExit` — reused by `js/entryLedgerV2.js` to resolve live v2 ledger records against the SAME trail, never a second implementation), **`runExitAB`** (same learned policy, four exits — fixed / structural / chandelier / scale-out — each scored on OOS daily-portfolio Sharpe + cost-stress; fade keeps the fixed barrier; prices each touch independently so trades/day is unchanged), **`runHeldPosition`** (the HONEST model — one held position per day/direction/source, re-entry suppressed while open → collapses the per-touch over-count so trades/day and the Sharpe become tradeable), **`runBadLevelScan`** (per-(pair × level) IS/OOS expectancy scan + an IS-learned, OOS-applied veto of reliably-losing pair-levels the pooled gate hides), and **`runZoneWalk`** (the policy used as the live exit oracle at EVERY zone — full ladder, fade+follow, continuation→hold / reversal→close, re-entry after flat; a fade can flip into a multi-zone runner). Re-exports the forecast rigor battery (`runRigor`/`runSensitivity`/`deflatedSharpe`) so the route judges robustness the same honest way. Also emits a **structural-confluence condition** — `confluenceBucketAt` + `CONFLUENCE_SOURCES` tag each line by how many DISTINCT sources (pivots / PDH-PDL / POC-VAH-VAL / swing-S&R / swing-fib / round / VWAP via the `levelSources` brick) sit within a range-fraction tolerance (`1·none`/`2·single`/`3·multi`), computed **no-lookahead** from completed prior days and gated behind `opts.confluence.enabled` — so the per-line policy can learn to trade confluence-backed lines and skip bare ones (`conditions:['confluence']`), scored OOS through the same rigor. Includes a **15-minute swing-fib source** (`fib15` — resamples the prior sessions' M1 to 15m and projects swing-fib clusters, the trader's actual tool) and an optional **naked-levels source** (`naked` param — imports the `nakedLevels` brick to add UNTESTED prior highs/lows, i.e. virgin extremes no later session traded through, as one extra distinct `naked_hilo` source over a ~30-session scan; nPOC deferred — needs per-session volume profiles the daily path doesn't load. Off by default; A/B via the `confNaked` toggle. **Validated 2026-07 (FX book): naked DILUTES — keep OFF.** Strong (≥2) @2× +12.19 vs +12.56 off, @3× +9.42 vs +9.93, trades/day 26.9→29.3 (LESS selective), expectancy +0.1390 vs +0.1477, multi-bucket expectancy +0.0995→+0.0902 with win% inverting below single — worse every year and every walk-forward fold. Same failure mode as touch: virgin extremes coincide with `prior_hilo`, so `naked_hilo` mostly duplicates it and inflates the bucket without an independent signal. nPOC not pursued — if the cleaner virgin-H/L half dilutes, the age-weighted variant won't rescue it. Lever stays for the record; live never ships it.). **`runConfluenceFilter`** applies confluence as a pure QUALITY GATE (hold the direction policy, trade all → confluent≥1 → strong≥2 levels) priced on the honest held-position chandelier and split by fade/follow — answers "do stronger levels trade better?" WITHOUT the per-bucket policy fragmentation of the condition, and carries **per-year + anchored walk-forward rigor on the filtered (≥2) book** (retrains the direction policy each fold, applies the filter at trade time — the last stability check before it goes live) (route `confluenceFilter:true`; UI checkbox + card). The touch carries a `confluence` field even when it isn't the cell key (`perLineStrategy.extractTouches`) so the filter can read it. (Distinct from the read-only `confluenceTest` reaction study — this conditions/filters the actual fade/follow policy.) **Vol-sizing overlay (2026-07):** `analyseRangeWindow` stamps each line with the session's **ex-ante σ** (`sigmaPct`, % of price, from `volSigmaSeries` — data < today, no lookahead); **`volSizeWeights`** (pure, exported — any live sizing consumer must import THIS, never re-derive) turns it into an inverse-σ weight per (pair, session): `clamp(median(prior-60-session σ) ÷ σ_today, 0.25…4)`, weight 1 until 20 σ-observations; **`runVolSizing`** prices the SAME held-chandelier trades twice — unit vs σ-weighted (constants FIXED, no tuning; sizing never touches entries) — and reports per-pair OOS Sharpe @1/2/3× cost + DD@10%-vol + `improved2x`-of-`eligiblePairs` (≥30-trade floor); pooled book secondary. Tests the replicated vol-targeting risk effect on the §13 book. **Validated 2026-07 (14 strong pairs, route defaults): NULL — do not wire into the live bot.** Only 5/14 pairs improved @2× (pre-registered bar: majority), every delta within ±0.3 Sharpe, pooled book flat-to-worse (13.64→13.54 @2×), weights genuinely varied (0.30–2.64). Why: the chandelier's stop/rung already scales with the session range (≈ σ), so per-trade % risk is largely pre-normalized — inverse-σ weighting is redundant on this book. The overlay + card stay for re-testing other books/exits; sizing constants stay FIXED. Reuses `touchFeatures` + `perLineStrategy` + `barUtils` + `fibProjection` + `levelSources.collectLevels`/`swingFibLevels` + `forecastAnalyser.bucketM1IntoSessions`. Route `/api/range-line/run` (params `confTolFrac`/`confLookbackDays`/`confSources`/`confluenceFilter`; result now carries `volSizing`); UI `range-line-strategy.html` (Vol-sizing A/B card). Test `js/rangeLineAnalyser.test.mjs`. | ✅ built |
| **Level-confidence core (v2)** | `js/levelConfidenceCore.js` | the Telegram-v2 confidence decision — `decide` (frozen per-cell **after-cost expectancy**, priced on the §13 held-chandelier trail via `pnlHeld` → grade/verdict), `cellKey` (reproduces `perLineStrategy.extractTouches`' key), `directionFor`/`exitsFor` (fade/follow→long/short + **chandelier-trail exit** — `sl`/`rung`/`trailFrac`, no fixed tp/rr — matching `pnlHeld`), `DEFAULT_GRADE_BANDS`. `decide` labels a `notSignificant` policy skip honestly ("edge within noise (t-gate)" — Batch 7). Pure; the heart of v2. Test `js/telegramV2.test.mjs`. **v3 correction (see `TELEGRAM_V2.md`): dropped the fixed adjacent-line exit + `rr` gate — RANGE_EXTENSION_GUIDE.md §12 found it loses to the chandelier.** | ✅ built |
| **Grade-level v2** | `js/gradeLevelV2.js` | the single LIVE grader — ladder + intraday path → graded entries, rebuilding the IDENTICAL offline cell key (same `buildRangeLadder`, `condFields` defaults to `[]` — §14 found no live touch-read beats the unconditioned cell) → `levelConfidenceCore.decide`. Live==backtest by construction. Test `js/telegramV2.test.mjs` (incl. live↔offline cell-parity check, both conditioned and unconditioned). | ✅ built |
| **Alert formatter v2** | `js/alertFormatterV2.js` | pure `formatV2Entry` — expectancy-first Telegram HTML message; initial-SL + chandelier-trail description (no fixed TP/RR line). Test `js/telegramV2.test.mjs`. | ✅ built |
| **Levels-v2 offline learner** | `js/levelsV2Learn.js` | `learnAndFreeze` / `freezePolicy` / `flattenPolicy` / `isUsablePolicy` — **v3: learns PER INSTRUMENT** (injected `getTouches` loader, no cross-pair pooling — §15) via `perLineStrategy.buildPolicy({pricer:pnlHeld})`, the SAME bricks `js/rangeLineBotProducer.js` freezes for the live `range_line_bot`. `freezePolicy` snapshots `{perInstrument:{instr:{policy,splitDate,...}}}` + bands fit over the flattened union of every instrument's cells. Previously (v2) ran the pooled `runRangeLineBook`/`runPerLine` book conditioned on `approachVel` with a fixed-barrier pricer — closes the split this file and `rangeLineBotProducer` had drifted into (both learned the SAME Asia/Monday touches with DIFFERENT policies). **Batch 7 (2026-07):** `learnAndFreeze` defaults `buildPolicy`'s `tStat` to **1.5** (per-cell mean/SE noise gate; `tStat:0` = escape hatch; the frozen LIVE policy only changes on the next refit) and the frozen artifact now carries **`chanceBaseline`** (new export: C cells tested vs the gate, pNull ≈ one-sided P(Z>tStat) — stated as a LOWER bound given the fade/follow best-of-two pick — expected false-positive count + honest note string; rendered by `telegram-v2.html`; server pass-through of the summary field is a FIX_TRACKER server-owner item). | ✅ built |
| **Range-line bot plan** | `js/rangeLineBotPlan.js` | pure `buildRangeLineBotPlan` — assembles the frozen `range_line_bot_plan` artifact from per-instrument policies + ladder meta (sources/ladderFibs/boundaryHour/asiaHrs/chandFrac). Drops skip cells + zero-cell instruments. Mirrors `volatilityBotPlan`. Tested `js/rangeLineBot.test.mjs`. | ✅ built |
| **Range-line bot producer** | `js/rangeLineBotProducer.js` | `refreshRangeLineBotPlan` — freezes the §13/§15 policy PER INSTRUMENT (each learns on its own M1 via `recordsForPair`→`extractTouches`(none)→`buildPolicy`), writes `range_line_bot_plan` to KV. Injected I/O (offline-testable); refuses to publish an empty plan. Mirrors `volatilityBotProducer`. Routes `/api/range-line-bot/{refresh-plan,plan}`, daily schedule ~06:15 UTC. The Python `range_line_bot` consumes the artifact (PYTHON_LEGO "ship it a file"). Tested `js/rangeLineBot.test.mjs`. | ✅ built |
| **Range-line zones view-model** | `js/rangeLineZones.js` | pure `buildRangeZones({status,plan,confluence})` — joins the live bot status (today's Asia/Monday ladders + price), the frozen plan (fade/follow/skip per cell) and the confluence artifact (which sources back each level) into the per-pair "tradeable zones" the `range-zones.html` page renders: per zone → decision, confluence bucket + source list, SL (protective stop) + trail target, `gated` (would the live ≥N gate take it), taken flag, distance-in-pips. No network; tested `js/rangeLineZones.test.mjs`. Route `/api/range-line-bot/zones`; page `range-zones.html` (chart + per-zone cards, linked from index + the bot-config Range-Line tab). | ✅ built |
| **Range-line confluence producer** | `js/rangeLineConfluenceProducer.js` | `refreshRangeLineConfluence` — ships TODAY's structural-confluence level PRICES per instrument (via `rangeLineAnalyser.sessionConfluenceLevels`, the SAME validated code the OOS confluence quality-filter used — no drift) to KV `range_line_confluence`, so the bot's optional confluence entry-gate is checked against the exact levels the backtest validated. Ships level prices (not a source port): the bot does only the trivial proximity count. No-lookahead (prior D1 + prior M1). Plus `packLiveM1`/`sessionStartEpoch` (pure, tested) — pack FRESH OANDA M1 into the store's identical packed shape and DROP the still-forming session, so the server's 6am-London daily refresh runs the validated path on current data instead of the weeks-stale M1 store (static/session confluence only — the touch/intraday-dynamic mode validated worse and was dropped). Pure, injected I/O; tested `js/rangeLineConfluenceProducer.test.mjs`. Consumed by the ≥N confluence gate in `range_line_bot` (default OFF). | ✅ built |
| **OI forward-test tagging** | `js/oiConfluence.js` | `parseOILevels` (pasted `price type` lines → `[{price,type}]`, `normOIType` slugs put/call-wall/max-pain/gamma-flip/hvl), `tagTradeOI` (is an OI level within tol of an entry), `tradePctReturn` (size-independent %), `nearRoundNumber` (the independence flag), `oiBias` (OI-implied buy/sell at a level — call-wall→sell/put-wall→buy/max-pain gravity/gamma-flip regime), `oiAudit` (join accumulated trade log × per-date OI artifact → tagged-vs-untagged expectancy, per type, the **not-at-round-#** slice that guards against the naked-levels redundancy trap, **and OI-direction agree-vs-against** scoring that validates the live override). `oiStoreToLevels` (reuse the index.html OI analyser's computed output — KV `oi_store` per pair: max pain / call+put walls / gamma-flip / HVL / volume-magnets — as `[{price,type}]`, so no second manual entry), `oiDeltas` (day-over-day dynamics: max-pain shift, P/C change, positioning building/unwinding, per-strike wall firming/fading/appeared/faded — Lesson-4 §dynamic) — **wall matching is by TOLERANCE across the overnight futures-basis drift, not exact float equality (fixed 2026-07-29, two bugs)**. Archived strikes are stored SPOT-converted (`strike − basis`) and the basis moves overnight, so the identical CME strike is filed under a different number each day (EUR/USD 1.157605 → 1.158050). The original `new Map(prev).get(w.strike)` therefore matched NOTHING: `strengthening`/`weakening` were permanently empty, every wall read `appeared`, and `classifyOIChange` told the brief "fresh positioning building" for 9 of 11 unrelated instruments on the same day — a confidently-WRONG output, worse than the null it replaced. Now two-pass: (1) estimate the rigid shift by **consensus** (every strike pair proposes an offset; the one aligning the most strikes wins — proximity pairing can't be used because the ladder shifts rigidly, so near one strike-step "nearest" pairs each strike with its NEIGHBOUR); (2) subtract it and match on a tight residual, greedy-nearest, each prior wall consumed once. **The first version of that estimator then locked onto a ladder-step ALIAS** — gold's true +0.635 drift lost 8-to-10 to the −99.365 offset one 100-point step away, which mis-pairs every wall; candidates are now bounded by the tighter of 0.9× strike spacing (beyond one step the shift is aliased, not measured) and 0.5% of price (an overnight basis move is a carry adjustment: gold 0.016%, NQ 0.29%, EUR/USD 0.04%; the alias was 2.5%). **Known limit, stated not hidden:** drift is only identifiable up to roughly HALF the strike spacing — at 26 pips on a 25-pip ladder it selects the 1-pip alias. Past the bound it fails safe toward "no drift" rather than inventing a large one, mis-alignment stays visible as incomplete matching, and `driftAmbiguous` fires when a genuinely different offset scores within one match (the brief then warns per-wall detail may be pairing against the wrong prior strike, while whole-book totals stay usable). Real drifts run 0.02–0.3% of price against 0.2–1.2% spacing, so they sit inside the reliable band. New fields `basisDrift`/`matchedWalls`/`strikeTol`/`driftAmbiguous`/`driftSupport` and `maxPainShiftNet`/`callWallShiftNet`/`putWallShiftNet` (a level that only moved with the basis now nets to 0; raw `*Shift` kept for back-compat). Verified against the four pairs whose true drift is independently readable off the strike suffixes (gold +0.635, EUR/USD +0.000445, GBP/USD +0.000715, NQ +81.25). `oiWallStability` was unaffected throughout — it already took a tolerance. 21 regression tests incl. the real gold alias, `wallStrengthTier` (the 3× rule — OI as a multiple of surrounding strikes, weak/moderate/strong), `oiSkew` (where positioning sits vs spot — downside-hedged/upside-tilted), `oiBias` hold-vs-break (a wall broken by >breakPips flips fade→squeeze/follow — Lesson 5, parity vs `rangeline.py`), `classifyOIChange` (day-over-day labels: fresh_wall / fresh_positioning / liquidation + headline read), `oiConcentration` (top-5 % of total OI — concentrated vs dispersed), `clusterStrikes` (merge nearby strikes into institutional zones → emitted as `oi_cluster` levels), `oiWallStability` (days each current wall has persisted across `oi_history` — established vs overnight), `wallFreshness` (today's option VOLUME ÷ resting OI at a wall → fresh/active/stale — a wall built TODAY vs stale positioning), `volumePCRatio` (today's put/call VOLUME flow, distinct from the resting OI P/C — a divergence is the directional tell), `oiPriceConfirmation` (the classic OI-change × price-direction matrix: +OI with the move = new longs/shorts BACKED (confirmed); −OI = short-covering-up / long-liquidation-down = weak/unsustainable — wired into `oiZones` breakout grading + the brief + the OI card). Pure/offline-tested (`js/oiConfluence.test.mjs`). **Forward test, not backtest** — no historical options-OI exists for spot FX. A 10-min server tick **snapshots `oi_store` into today's dated slot** of `range_line_oi` (no lookahead — captured in the morning; analyser pairs auto-refresh, manual-entry pairs preserved) and rolls the bot's transient `today_closed_trades` into `range_line_trade_log` (canonical `resolveKey` join key). Endpoints `/api/range-line-bot/{oi (manual override), oi/sync, oi-audit}`; the tick also ships a bot-consumable `range_line_oi_live` (source=type, allowlisted in `_worker.js`). **Range-line live gate (opt-in, default OFF):** `rangeline.py oi_bias`/`oi_distinct_sources` (parity-tested vs JS) + `engine.decide(oi_confluence, oi_override, oi_gamma_regime, oi_hold_break)` let OI **strengthen** a level (distinct source in the `confluence_min` gate), **override** its direction (call-wall→sell etc.), set fade/follow from the **gamma regime** (PIN→fade/BREAKOUT→follow, shipped in `range_line_oi_live.regimes`), and apply **hold-vs-break** (broken wall→squeeze/follow); config flags `oi_confluence`/`oi_override`/`oi_gamma_regime`/`oi_hold_break`/`oi_break_pips` on `bot-config.html`. UI on `range-zones.html` (auto-sourced levels + "Sync from OI analyser" + running tally incl. the direction rows). **Second consumer (2026-07):** `oiStoreToLevels` also backs `GET /api/oi-levels` (live, per-instrument, keyed by `resolveKey`), which the **`ConfluenceBot`** reads each state refresh (`_refresh_oi`) to add OI as a **scored confluence source** in `level_matrix.score_zones` (`oi_magnet` credit for wall/max-pain/HVL, smaller `oi_gamma_flip` for the boundary; one credit at the strongest type, round-number-tagged). One JS conversion brick, three readers (range-line gate, ConfluenceBot, forward test) — the Python bots never re-port it. **OI history (2026-07):** a server tick archives a compact per-pair summary of `oi_store` into KV `oi_history` (dated, ~60d — CME serves no history, so it's self-collected and can't be back-filled); `GET /api/oi-history` returns one pair's history+deltas or all pairs' latest delta; **⚠ it had never actually accumulated (fixed 2026-07-28):** `oi_history` was missing from `kv.js` `_CF_EXACT` and matched no persistent prefix, so every write landed in the ephemeral file store that a Railway redeploy wipes — live `/api/oi-history` showed `days:1, prevDate:null` for all 11 pairs. Since `oi_store` only holds the LATEST paste, everything needing a prior day silently read null with no error anywhere: the brief's OI CHANGE block, `oiWallStability` days-present, gamma flip-drift, and the card deltas. Now in `_CF_EXACT`; `_snapshotOIHistory` writes **only when the summary changed** (it runs on a 30-min timer but the paste changes ~once a day — 48 identical re-puts/day would spend ~5% of the CF KV free write quota storing nothing) and returns `{n, wrote, day}` so the manual endpoint can force a write rather than report 0 while the data is stored; the brief now prints `OI CHANGE: UNAVAILABLE — only N day(s) archived` instead of dropping the block, because an omitted section read identically to a quiet market (unmeasured ≠ unchanged). `oi_store` + `oi_history` are now both checked by `/api/kv-health`. The 60-day depth can only be re-accumulated by waiting 60 days — CME serves no history. `_injectServerContext` feeds `s.oiChange` into the daily-brief AI prompt (walls firming/fading, positioning building/unwinding) and `today.html`'s per-pair OI card shows a "Δ vs {date}" line. | 🔬 forward-testing / opt-in live |
| **OI bot planner (gamma-regime switch)** | `js/oiZones.js` | `buildOIZones(inst, price, cfg) → zones[]` — the OI bot's strategy as ONE pure planner. Reads an instrument's OI picture (from the shared `oi_store`/`oiConfluence` bricks: `exposures.gex`, `callWalls`/`putWalls` with `tier`/`mult`, `maxPain`, `concentration`, `expiries[].dte`) + live price + config, and emits the trade **zones** it would take: `{mode, side, level, entry, sl, tp1, tp2, sizeFactor, rationale, regime}`. The gamma master-switch (course Lessons 4–6): **PIN** (+GEX, long dealer gamma) → FADE strong walls toward max pain (F1 wall-to-wall — sell call wall / buy put wall, TP1 = max pain, TP2 = opposite wall); **BREAKOUT** (−GEX, short gamma) → FOLLOW a decisive wall break past ±`breakPips` (F3 squeeze); **near expiry** (≤`nearExpiryDTE`) + price extended from pin → MAX-PAIN REVERSION (F2), any regime. Filters: only walls ≥ `minTier` (the 3× rule); skip **liquidating** walls (from `classifyOIChange`, injected as `change`); optionally require **established** walls (from `oiWallStability`, injected as `stability`). Size = wall strength × concentration. **Breakout OI-flow confirmation (2026-07-26):** a `−GEX` follow-break is only "backed" when OI is BUILDING at the wall (new money forcing through); a break on FALLING OI is short-covering/liquidation — the wall is dissolving, not being overpowered — so `oiPriceConfirmation` grades each break from the injected `change` events and appends the read to the rationale + trims size ×0.85 on a `weak` (unwinding) break (never zeroes a zone). **Path-blocking wall (2026-07-26):** the bot trades the STRONGEST wall (OI×durability), which can sit further from spot than a weaker wall — but price hits the nearer level first and may reject/stall before reaching the traded wall. `nearestBlocker` scans the FULL wall list (all tiers, **including the sub-`minTier` walls the selector dropped**, ≥ `blockMinTier`='moderate') for one strictly between spot and a zone's entry; when found it appends "⚠ {tier} {kind} wall {strike} in the path (price hits it first)" to the rationale, trims entry size ×`blockTrim` (0.9), and carries a `blocker` object on the zone. Execution-realism only (`pathBlockCheck` default on; not validated edge). **PIN nearest-primary + reachability (2026-07-27):** two changes so the bot stops arming strong-but-unreachable walls (the "levels so far apart they never fill" report). (1) **PIN fade selection is now distance-anchored, not strength-first** — the active pin boundary is the NEAREST strong wall bracketing price, so PIN picks the K NEAREST strong walls per side: the nearest is the **primary** (full size), each further wall is **secondary** and sized ×`secondaryTrim` (0.6). Durability still boosts size via `sizeFactor()`; BREAKOUT is unchanged (still strength-ranked by OI×durability — the squeeze targets the strongest wall). (2) **Reachability gate** — an entry more than `reachMult`×(1.0) the **option-implied move** from spot (the market's own read of how far price travels by expiry, from `inst.expectedMove`, passed as `expMove`) is flagged "⚠ ~N× implied move — unlikely to fill by expiry" and trimmed ×`reachTrim` (0.7), kept armed (house flag-don't-block, same as the TP-beyond-move flag it complements). Falls back to a pip cap `maxReachPips` (0 = off) when no IV was pasted; `maxpain` mode enters at spot so it always passes. **Empty-plan diagnostics (2026-07-27):** `explainNoZones(inst, price, cfg)` (exported, pure) says WHY an in-universe instrument produced 0 zones in one line — flat GEX, no walls ≥ minTier, or walls that don't bracket price — mirroring the planner's gates and returning null only when zones SHOULD exist (a test asserts `reason===null ⇔ buildOIZones produced zones`). The producer attaches it as `instruments[key].diag`, and records **out-of-universe pairs that were pasted anyway** in a new `skipped` map (`{key: reason}` — e.g. USD/JPY → "FX not traded by default — enable FX on the OI Gamma tab") so a blank reads as a setting, not a fault; `gold-zones.html` surfaces both (empty-state uses `diag`/`stale`; a "Pasted but not traded" line lists `skipped`). **Level-ladder TP (2026-07-28, opt-in `levelLadderTP`, default OFF):** instead of defaulting TP1 to (a far, weak-until-expiry) max pain, TP the trade to the NEAREST structural level in its profit direction — all walls (any tier — a wall the bot won't ENTER is still a level price stalls at), max pain, the **gamma flip** (regime boundary, passed as `gammaFlipLevel`), the **vanna flip** (`vannaFlipLevel`, present when an IV smile was pasted), and today's **volume magnets** (`inst.volumeMagnets`). TP1 = first node ahead (bank there), TP2 = the next (runner) — trade level-to-level, max pain demoted to one node among many. Answers the "why always to max pain / should we trade to the flips" question and wires the new greeks (gamma/vanna flips, volume magnets) into the *trade decision* rather than display-only. Gated so it A/Bs against the classic max-pain/next-wall targets on the live tape; the producer passes the flip levels + `levelLadderTP` from `oi_bot_config` (toggle on the OI Gamma tab). Executor unchanged — `engine._tp(z)` already reads `tp1` (→ `tp2` → SL-only), so the ladder flows through the frozen artifact with no Python change. **React-at-levels + greek conditioners (2026-07-29, opt-in `reactAtLevels`, default OFF — Mode D):** the bot now ENTERS at the structural nodes *between* the strong walls — gamma flip · GEX flip · vanna flip · volume magnets · intermediate walls ≥ `reactMinTier` — not just strong-wall fades/breaks (answers "the bot did nothing while price reacted beautifully at the flip/volume levels all day"). Treated BY REGIME per dealer-gamma theory: **PIN** (long gamma) fades a node toward the next node full-size; **BREAKOUT** (short gamma) still fades nodes as intraday S/R (the flip capping a rip is the classic short-gamma rejection) but trims ×`reactBreakoutTrim` (0.6) because fading is counter-trend there — the Mode-B breaks carry the continuation ("trade between the levels, *unless it's in the same direction*"). A node already traded by Modes A/B on the same side isn't duplicated; the opposite side is allowed so a wall is bracketed (buy the bounce / sell the break). TP is the next node (level-to-level). Two greek conditioners wired the theory-correct way: **vanna** (`vannaState` from the pasted smile) sizes by MODE — a `tailwind` state (dealer vega-hedging amplifies the move) boosts FOLLOW-breaks and trims mean-reversion fades, `headwind` mirrors, only when firing; **charm** (`charmActive` = nonzero `cex`) amplifies the near-expiry max-pain PIN (Mode C) since charm flows pin price toward strikes into expiry. Producer derives `gexFlipLevel`/`vannaState`/`charmActive` per-instrument from `greeksFlow`; config on the OI Gamma tab (`reactAtLevels` + `reactMinTier` + `reactBreakoutTrim`). Still forward-test-only mechanism, not validated edge — the reaction-logger (next) gathers the touch-vs-outcome evidence. Tested in `js/oiZones.test.mjs` (Mode D per-regime + vanna/charm blocks). **Multi-expiry (2026-07):** the CME paste is a strike×expiry matrix — `js/oi.js` parses it ONCE (`_matrixRows`) into views instead of throwing 21/22 columns away: **primary** (`parseOIMatrix` mode `'primary'`, the DEFAULT for the bot's OI/change), **near** (mode `'near'` — the literal first column, back-compat/tests), **aggregate** (mode `'aggregate'` — summed across expiries, used for **volume** where activity is spread across expiries and there's no tail-hedge distortion), and per-expiry **term structure** (`oiMatrixTermStructure` → `{dte,maxPain,callWall,putWall,totalOI}[]` for the daily brief). **Primary-expiry auto-select (2026-07-24, `pickPrimaryExpiry`):** the old default literally grabbed column 0, which on a full-matrix paste is often the near-EMPTY 0-DTE weekly while the real OI (the wall the user eyeballs) sits in the front MONTHLY — so the walls were computed off the wrong column. `pickPrimaryExpiry(rows, dtes, anchor)` now picks the education's **"nearest expiry with significant liquidity"** (Lesson 5) by scoring each expiry's **near-the-money** OI (within `bandFrac`=3% of the anchor) and taking the max (nearest-DTE tiebreak). Near-money — NOT total — OI is scored on purpose: a far-dated column stuffed with deep-OTM **tail hedges** would win a total-OI contest (the Lesson-6 pitfall-4 distortion), so tail hedges are excluded from the selection. The chosen expiry's DTE + near-money OI are surfaced on `inst.primaryExpiry`, in the save toast, and auto-fill the DTE tag field when blank. Tested `js/oiMatrix.test.mjs` (screenshot-shape monthly-selection + tail-hedge-robustness + `pickPrimaryExpiry` near-beats-total). **FX anchor fix + paste-contract oracle (2026-07-27):** `pickPrimaryExpiry` had never actually run on FX. `_matrixRows` required a header number `> 50` to be the futures price (sized for indices/gold), so on EUR/USD it skipped `1.13965` and scavenged **74** out of the text "74 DTE"; that anchor put the 3% near-money band in empty space, every expiry scored `nearOI: 0`, and the `nearOI → totOI` fallback silently switched to biggest-total-OI — selecting the 39-DTE September monthly, i.e. **exactly the tail-hedge distortion near-money scoring exists to prevent**. Four prior reviews passed it because every fixture in `oiMatrix.test.mjs` is an index/gold price above 50, and the failure produced plausible-looking levels. Fixes: (a) header numbers are matched by SHAPE (`/^-?\d+(\.\d+)?$/`, no magnitude floor) so FX rates qualify and `74 DTE`/`6EU6` (`parseFloat('6EU6')===6`) are rejected; (b) `pickPrimaryExpiry` validates the anchor against the strike ladder, falls back to the **median strike** (a real ATM proxy) rather than to a different scoring rule, and reports `anchorValid`/`scoredOn` so degradation is never silent; (c) `parseIVSettlement` also reads the QuikStrike title's `vs <price>` = the **LIVE** futures price (the heatmap header only carries the SETTLE — 32 pips stale on 2026-07-24) plus the expiry code, and `processOIData` prefers manual → IV-title-live → header-settle, recording `futuresSource`/`futuresStale`/`basisAt`; (d) `dataWarning` gained SEMANTIC checks (bad anchor, total-OI fallback, settle-derived basis, unresolved DTE) — the old order-of-magnitude range check could never catch a wrong-expiry paste; (e) a multi-expiry matrix is now **stored whole** instead of compacted to the selected column, which had been discarding 17/18 expiries of every daily capture (the OI history the course's wall-decay research depends on, and unrecoverable since CME serves no history). **Downstream adoption + a duplicate retired (2026-07-28):** `gexFlipPrice` was added to the record and the dashboard but reached nothing else for a commit — now emitted by `oiStoreToLevels` as `gex_flip`, carried in `TYPE_ORDER` for the C+Z export, coloured/dotted in `Confluence Zones Indicator.pine`, and weighted as a BOUNDARY (not a magnet) in `ConfluenceBot/modules/level_matrix.py` — whose `else oi_magnet` default would otherwise have silently credited it 1.5 and inflated every zone near the flip. `inst.refMove` now also reaches `buildOIZones` from the producer and backs the reachability gate: with `expectedMove` correctly rejected on all four indices and `maxReachPips` defaulting to 0, that gate had been falling through to no check at all. **And `oiStoreToLevels` kept a PRIVATE COPY of the old first-sign-change flip scan**, so the export and `/api/oi-levels` went on emitting the tail-latched, strike-snapped value after `gammaFlip` was fixed — the exact two-copies-diverge failure Lego Principle 1 exists to prevent. It now uses `inst.gammaFlip` (computed once at save) and falls back to the shared brick. **DTE-aware greeks (2026-07-30):** `oiGreeks`/`oiCalcExposures` gained an optional `T` param and `processOIData` now passes the ACTUAL selected-expiry DTE (`greekT` = `dteEff` floored 1d / capped 1y ÷ 365) into the GEX profile, `exposures.gex`, and `gexFlipPrice` — replacing the old fixed `OI_GREEK_T` (14/365) assumption that every greek silently used regardless of the expiry being analysed. Gamma ∝ 1/√T, so this sharpens GEX magnitude and both flip levels to the real horizon (a 2-DTE weekly carries ~2.6× the ATM gamma of the assumed 14-DTE). **This shifts `exposures.gex` — and therefore the OI bot's PIN/BREAKOUT regime and the flip react-nodes — while wall / max-pain LEVELS (raw OI) are unaffected.** The `T` param DEFAULTS to `OI_GREEK_T`, so every other caller is byte-identical until it opts in (asserted in `js/oiGreeks.test.mjs`: gamma 1/√T scaling + default==14-DTE back-compat). Charm/vanna already used the real DTE (`dteYrs` from the IV paste); this brings gamma/GEX/flip onto the same basis. **Greek-vol v1/v2 toggle (2026-07-30):** `oiGreeks`/`oiCalcExposures` also gained an optional per-strike `sigma`/`sigmaFn`; `processOIData` builds a `sigmaFor(strike)` and feeds the GEX profile, `exposures`, and `gexFlipPrice` — so gamma/GEX/flip can use the **pasted IV smile** instead of the fixed per-class flat vol. Since gamma ∝ 1/σ, the old flat 12% (FX) / 20% (index) guess vs a real ~7% IV mis-scaled gamma ~1.7× and moved the flip — and charm/vanna already used the real smile, so gamma/GEX were the odd ones out. A UI `oiGreekVol` select (`bot-config`/OI panel on `index.html`) picks **v1 'flat'** (default, behaviour unchanged) or **v2 'smile'**; v2 uses the per-strike smile nearest-matched, falls back to the picked expiry's ATM IV (from the settlements term structure, percent→decimal) for strikes outside the smile, then flat vol as the last resort — recorded as `inst.greekVolMode`/`greekVolSource` (`smile`/`atm-iv`/`flat`) and shown as a `γ vol` chip in the dashboard diagnostics. Only differs when IV was actually pasted; **shifts `exposures.gex` → the bot's PIN/BREAKOUT regime** like the DTE change (wall/max-pain levels untouched). Tested in `js/oiGreeks.test.mjs` (γ ∝ 1/σ, `sigmaFn` changes GEX, `sigmaFn:null`==flat back-compat). **Full-book GEX v3 (2026-07-30, `js/fullBookGex.js`):** `fullBookGex(legs, spot, {mult, flatSigma})` aggregates net dealer gamma across **every** expiry and strike — each option weighted by its own gamma (which embeds its DTE + IV) — the SpotGamma/SqueezeMetrics whole-book view, versus the single-expiry `exposures.gex` above. Returns net GEX + regime, the whole-book zero-gamma **flip** (root-found across all expiries as spot moves), and a **`byExpiry` breakdown** (each expiry's GEX + share of |total|, sorted) — so "which expiry is driving the book?" (a near-dated contract counts far more per unit OI) is answerable, which one column can't. Reuses `bsGamma` (no copy); pure/offline-tested (`js/fullBookGex.test.mjs` — single-expiry matches the direct formula, near-dated leg dominates an equal-OI far one, cross-expiry regime tension, flip root-find, guards). `oi.js` exports `oiMatrixExpiryLegs(raw, {basis, inverted, minOI})` (per-expiry basis-shifted legs from the whole matrix, reusing `_matrixRows`); `processOIData` builds them, assigns each expiry its ATM IV from the settlements term structure (percent→decimal, matched by DTE; flat when absent), computes `inst.fullBook`, and the dashboard renders a **"Full-book GEX — all expiries"** panel (regime + flip + the byExpiry bars + a `⚠ DISAGREE` flag when the full-book regime differs from the single-expiry one). **ANALYSIS-ONLY** — NOT wired to the bot; the traded PIN/BREAKOUT regime stays on the validated single-expiry number until the full-book flip is shown to read the tape better (most likely to matter on indices, where 0-DTE gamma is large, not FX). Per-strike skew per expiry is deferred (gamma is ATM-led; the ATM level is the first-order correction). Multi-expiry matrix pastes only. **Live smile hint + code matching (2026-07-27):** the expiry hint used to cost a full Analyse-save-Analyse round trip whose only purpose was to learn a code. Extracted to pure `resolveSmileExpiry(rawOI, rawIVTerm, {dte, rawIV})` and fired from `updateSmileHint()` on `input`/`paste` over the OI / Settlements / smile / DTE fields — so the code appears WHILE you paste and Analyse is genuinely the last step (`_keepOpen` two-stage flow removed). Analyse calls the same function, so the live hint can never disagree with what it reports. Matching is now by **expiry CODE**, not DTE: `_matrixRows` also harvests the heatmap header's codes (`TU4N6`, `EUUQ6` — shape `/^[A-Z]{2}[A-Z0-9][A-Z]\d$/`, which excludes the 4-char underlying `6EU6`) and `pickPrimaryExpiry` returns `code`. DTE is relative to each paste's own date, so if the heatmap and the Settlements table are copied on different days a DTE match silently resolves to the wrong contract (11 DTE → `TU1Q6` instead of `EUUQ6` in the shipped fixtures, which are 3 days apart); code matching is absolute, and a DTE disagreement on the same code now sets `staleMatch` → an inline "these two tables are from different sessions" warning. New oracle `js/oiPasteContract.test.mjs` + `js/fixtures/` asserts against an EXTERNAL reference — real EUR/USD pastes and the levels the C.OG vendor card showed for the same data (call wall / put wall / max pain all 1.1450 on MO4N6) — because every previous review checked the code against itself. Within the chosen expiry the wall-ranking is unchanged (still `wallStrengthTier`'s 3× rule); C/P is still mapped by column position (strict C,P,C,P — the standard CME export), not by re-reading the header labels. `oiMatrixPersistence` counts how many expiries carry a real position at each strike → attached to walls as `persistence`; `buildOIZones` **ranks walls by OI×durability** (`persistenceWeight`) and **size-bumps** walls present in ≥`persistentDTE` expiries (durable = structural, not a one-day pin). **Fallback TP (2026-07):** a trade with no wall-based target (a breakout past the OUTERMOST wall — common on FX, where CME OI is partial and there's no next wall ahead) would go to the broker SL-only; `fallbackTpR` gives it a measured-move TP at that R-multiple of the stop. The producer sets it for FX (`fxFallbackTpR`, default 2.0) and leaves gold/indices off (`fallbackTpR` default 0 — they usually have a wall ahead). **ONE plan artifact, no drift** (the range-line pattern): a 10-min server producer `_refreshOIBotZones` runs the planner per instrument (universe = gold + indices; FX only when `fx_enabled`) and writes KV `oi_bot_zones`; **both** `gold-zones.html` (the `OI Gamma` bot tab — per-pair chart with entry/SL/TP lines, direction, size, rationale) **and** the Stage-2 Python executor read that same artifact. Endpoints `GET /api/oi-bot/zones`, `POST /api/oi-bot/zones/refresh`. **Stage 2 — the live/paper executor** (`oi_bot/oi_bot.py` on the pylego baseplate, engine `oi_bot/engine.py`): reads `oi_bot_zones`, watches live price per instrument and on a touch of a zone's entry (fade → reach the wall, break → clear it, max-pain → next tick) opens ONE broker-enforced SL+TP bracket (PaperBroker default, Mt5Broker `--live`), risk-sized ×`sizeFactor`, one-shot per zone, priming away overnight crossings. **Primed-zone visibility (2026-07-28):** `OISession.primed` is now a timestamped DICT (`{zone_id: {at, price, entry, plan_spot, side, mode, past}}`) instead of a bare set — priming was silent before (the #1 "the zone was hit but nothing traded" confusion, because a break can be primed-away when the plan is adopted *after* price already broke the level). Each newly primed zone is logged (`PRIMED nq … @ price — already N past entry`) and carried in the status snapshot (`_instr_lines` → `oi_bot_status`), and the OI Gamma live table shows a **Skipped** count with a hover of when + how far past entry — so a no-trade is legible and you can see whether it was primed on the level or after price left it. Priming is a plan-adoption-timing artifact, NOT a tick-speed one (a break still fires on `price ≤ entry`, so a fast drop yields a late fill, not a miss). **Stack guard (2026-08-07, `stack_guard` default ON, `stack_guard_pips` default 10):** with react-at-levels the wall fade + max-pain reversion + a react-at-levels long all cluster near the pin, so the bot was opening two same-direction positions on ONE instrument minutes apart (dedup is per-zone_id, and there was no per-instrument/per-direction/proximity cap — only a global `max_open`). Pure `engine.stack_conflict(symbols, dir_up, entry, open_positions, min_dist)` returns the open position that would make a new entry a redundant stack (same instrument — matched on canonical OR venue symbol — same direction, within `min_dist` price units of the entry); the executor **defers** (never burns) the second zone, so it can still fire once the conflicting position is gone. Matches the Effective-Bets panel's "one bet, not two" — one adverse tick otherwise hit both. Config on the OI Gamma tab. It NEVER recomputes a level/direction — the plan does (no drift). Pure engine offline-tested (`oi_bot/engine_test.py` 30 + `oi_bot/smoke_test.py`). **Telegram entry alerts** (`entry_alert_text` — instrument/mode/direction/entry/SL/TP/R:R/size + the plan's rationale, sent on fill; `tg_enabled`/`tg_token`/`tg_chat_id` in `oi_bot_config`, blank → shared `tg_config`, same convention as the regime bots). Config on `bot-config.html` **OI Gamma tab** (strategy = producer keys camelCase + execution = bot keys snake, one `oi_bot_config`; MT5 creds; Telegram; broker symbols). KV registered: `oi_bot_{config,credentials,zones,trades}` in `kv.js` `_CF_EXACT` + `_worker.js` PERMANENT_KEYS + allowlist; `oi_bot_status` in STATUS_KEYS/BOT_KEYS + `_TDE_SHADOW_STATUS_KEYS` + `_POS_BOTS` (positions tab + trade audit filter). **Quant-review build (2026-08-11 — full detail in `MD files/OI_BOT_QUANT_REVIEW_2026-08.md` §6):** planner: refMove-scaled structural distances (`slBufferRefFrac`/`breakRefFrac`/`extendedRefFrac`, pip counts stay as the floor — pip=1.0 on gold AND every index made one global pip setting 0.03% of Dow but 0.63% of Russell); `minRR` gate (too-near TP1 ladder-promoted else dropped, drops reported via `collectDrops` → plan `droppedZones`); GEX neutral band + conviction sizing vs the trailing median |GEX| (producer `_oiGexMedianAbs` from `oi_history`); **`wallHoldScore(w, kind, {gexProfile, change, tol, weights})`** (NEW export — 0–1 react-vs-blow-through from per-strike net GEX + OI flow + persistence + continuous multiple; missing components renormalise out; sizes FADES ×(0.7+0.6·hold), annotates breaks — flow already sizes breaks via `oiPriceConfirmation`, no double-count); sub-tier walls graded in WITH confluence (`subTierTrade`/`subTierSize` — magnet/flip/persistence agreement required); same-side zone spacing dedupe (`minZoneSpacing`×refMove); react-node per-type weights + volume-magnet quality floor (`reactNodes`, `volMagnetMinShare` — magnets/ladder both). **Hold-score auto-calibration** (`server.js` `_refreshOIHoldCalibration` → KV `oi_hold_calibration`, API `/api/oi-bot/hold-calibration`): executor stamps entry-time features (`zone_features` in status, incl. hold parts/conviction/touches/approach), the trade-log rollup joins them onto resolved trades, and at ≥30 resolved wall trades per-component win-rate separation fits weights that the producer auto-injects as `holdWeights` — banner on `oi-dashboard.html`/`oi-zones.html` shows collecting-progress/active state. Executor: portfolio risk budget `max_open_risk_pct` (sum of open risk-to-SL, defer-don't-burn), correlated `max_group_positions` per asset class (indices are one macro bet), fail-CLOSED `plan_max_age_hours` gate, KV-persisted one-shot state `oi_bot_state` (restart double-entry protection — saved on fill only, CF write quota), engine-side maxpain fire-time re-validation (`minDist` stamped on the zone), `break_hold_ticks` dwell (wick filter) + touch counting, approach-velocity fade trim, opt-in `scale_out`/`be_at_tp1` TP1+TP2 two-ticket split (TP2 was published-but-never-traded). Export/indicator: wall lines carry an `hNN` hold token (segment 4, '-' placeholders; `oiLevelExport` computes it via the same `wallHoldScore`) and `Confluence Zones Indicator.pine` parses/labels it. KV added to all three gates: `oi_bot_state`, `oi_hold_calibration`. Tests extended: `js/oiZones.test.mjs` (refMove/minRR/band/hold/sub-tier/spacing/node-weights), `oi_bot/engine_test.py` (maxpain revalidation, dwell, touches, spec features). **Follow-up (2026-08-11 #2):** per-mode TIME EXITS (`max_hold_hours` — the traded mechanism expires: pin/charm ≤2 DTE, faded books roll off; mode parsed from the position's own comment tag via new pure `engine.position_mode`, so it survives plan rolls/restarts; closes at market reason `time`, MT5 clock offset corrected); scale-out `runners` persisted in `oi_bot_state` (restart-safe BE-at-TP1); all previously KV-only planner knobs surfaced on the OI tab "Advanced" section (secondaryTrim/reach*/persistence*/pathBlock*/fallbackTp*/vanna*/charm) + time-exit hours. **Local-regime fade/follow gate (2026-08-20, opt-in `localRegime`, default OFF, PR #1296):** the PIN/BREAKOUT master switch above is a single net-GEX read taken AT SPOT, but a traded wall can sit in a different gamma band than spot — the regime flips at each zero-gamma crossing (`gexFlips`), so a wall on the far side of a flip is being judged by the wrong regime. When `localRegime` is on and the instrument carries `gexFlips`, each fade/break zone is re-graded by the LOCAL regime at the wall's own price (reusing the shared `oiRegimeBands` brick from `js/oi.js` — no second copy of the crossing-scan logic) instead of the spot-level regime: a fade of a wall sitting in a short-gamma band is trimmed ×`localRegimeTrim` (0.5) and annotated `⚠ wall in short-gamma zone (may break, not hold)` (it may break through rather than hold as support/resistance); a wall confirmed in the same-regime band as spot is left unchanged. Degrades to today's spot-only regime behaviour when off, or when the instrument has no `gexFlips` (e.g. the producer hasn't wired the day-expiry's own flips through yet — see the TODO below). A correctness fix to the existing PIN/BREAKOUT judgment, not a new signal; flag-gated because it changes live sizing. Tested in `js/oiZones.test.mjs` (OFF = zero behaviour change; short-gamma fade trimmed + annotated; PIN-band wall confirmed not trimmed). **TODO — not yet wired:** the producer currently passes the BASE book's `gexFlips` into `buildOIZones`, not the day-expiry's own (DTE-specific gamma differs from the base book — see `js/oiGreeks.test.mjs`'s DTE-aware greeks note above); until that plumbing lands, `localRegime` should stay OFF in production even after this PR merges. **Also not yet done:** a real forward-test plan (paper-only observation window, what "the gate helped" looks like vs a null) before flipping the flag on for any instrument. | 🔬 forward-testing / paper (executor built, no proven edge) |
| **Level heat (hot/cold)** | `js/levelHeat.js` | `levelHeat(gexProfile, levels)` → each level tagged `heat` (0..1 of the peak), `heatBucket` (`hot`/`warm`/`cold`), `gammaExposure`; `hotZones(gexProfile)` → contiguous high-gamma price bands. The magnitude sibling to `levelExpectation`'s sign: heat = the gamma-weighted OI (`|callGex|+|putGex|`) sitting AT the level, read off the now DTE+IV-aware `gexProfile` — so it's the **price-proximity + DTE** weighting the raw wall list lacks (gamma peaks at spot and decays with distance, so a big wall far from spot reads **cold** — small gamma today — even though it's a big OI wall). Interpolates between strikes for off-grid levels (flips, exp-move). **Distinct from probability-of-touch** (`oiReachability`): heat = how hard a level is *defended* if reached; P(touch) = whether price *gets* there — a far level can be cold yet high-P(touch) over a long horizon. Wired into the C+Z export as a SECOND ` . ` segment (parse index 2, AFTER the expectation at index 1) so an un-updated indicator is unaffected; the `Confluence Zones Indicator.pine` parses `oiHeats` and renders it **additively** — hot = a touch thicker + full colour, cold = thinner + faded (paper price passes through) — plus a heat word in the label/table. Empty heat (older pastes / no gexProfile) = byte-identical to before. **Self-heal (2026-08):** the `gexProfile` heat reads off is the FIRST thing `_saveLocalCache` sheds when the ~5MB localStorage cap is hit (marked "rebuildable"), which is why a pair captured hours earlier (e.g. EUR/USD) could show no heat / no P(touch) / a blank OI-by-strike chart. `rebuildGexProfile(inst)` (`js/oi.js`) reconstructs it — pure + network-free — by re-parsing the stored raw matrix and re-applying the entry's OWN stored basis / call-put swap / DTE, so the ladder lands exactly where the original did (the trimmed per-strike IV smile falls back to flat vol — a uniform gamma shift that leaves the RELATIVE hot/cold shape intact). It shares the extracted `buildGexProfile` + `oiContractSize` bricks with the analyse path (one definition, so a rebuild is byte-identical when the smile survives). Wired into `buildOILevelText` (export + `/api/oi-levels` + the zones export all self-heal → indicator + bots) and `GET /api/oi-store` (the OI dashboard reads this healed view instead of raw KV). So a quota-trim can no longer silently cost a pair its heat + P(touch). Pure/offline-tested (`js/levelHeat.test.mjs`; export wiring + the self-heal-from-rawOI asserted in `js/legoBricks.test.mjs`). | 🔬 built · unvalidated (mechanism/visualisation only) |
| **OI walls export block** | `js/oiLevelExport.js` | pure `buildOILevelText(store, {topWalls, generated, cot})` — formats the KV `oi_store` into the **"OI WALLS & MAX PAIN"** section **appended to the C+Z paste block** and drawn by the merged `Confluence Zones Indicator.pine` (one paste, one overlay; the earlier standalone indicator/export/buttons were retired 2026-07 in favour of this fold-in). Level extraction is NOT re-implemented — it **reuses `oiStoreToLevels`** (js/oiConfluence.js), the SAME converter `/api/oi-levels` + the bots use, filtered to `call_wall`/`put_wall`/`max_pain`/`gamma_flip`/`oi_volume`; emits `OI {price} : {type} t{tier}` under a canonical chart-ticker header (EUR/USD→EURUSD, XAU/USD→GOLD, NAS100_USD→NQ…), decimals per instrument class, and a per-pair `· saved … · spot … · DTE … · regime PIN|BREAKOUT` line. **COT context line (2026-07-28):** optional `cot` adds a per-pair `· cot {n}th pct — CROWDED SHORT · net -12.3% of OI · report {date} ({n}d old) · positioning only, NOT a level` line. COT is deliberately NOT emitted as an `OI {price}` level: it has **no price coordinate**, so any line drawn for it would invent a price the data doesn't contain — it rides on the context line the indicator ignores. The report date + age are mandatory because COT is a *Tuesday* snapshot published *Friday*, i.e. 3–8 days stale whenever it's read. Fed by `server.js` `_cotForExport`, which reads `COT_KV.extremes` (the shared constant exported from `_worker.js` — it read a hard-coded `cot_extremes_v2` until 2026-08-21, nine days after the worker bumped to `v3`, so this line silently vanished from the export once the old key's TTL lapsed) and keys by the same canonical chart names `_COT_MAP` already uses (no second name table), preferring the **OI-normalised** percentile (`specSharePct`) since that survives open interest itself growing over the lookback. Pair-terms normalisation is shared, not copied: `_cotPairView` is now the ONE definition (net / share / z / percentile ALL flipped together for the inverted USD-quoted pairs — flip some and not others and a crowded-short JPY reads as a crowded-short USD/JPY), read by both this export and the daily brief's `snap.cot`. Note `specShare` arrives from `_worker.js` **already in percent** (×100, 2dp) — asserted in-test, never re-scaled. **Gamma regime** = SIGN of net dealer GEX (`inst.exposures.gex`) only — positive→PIN, negative→BREAKOUT (the fuller gravity-weighted classifier needs live ATR, absent from the paste, so it's labelled GEX-sign, not overstated). Levels are only as fresh as the last option-chain paste — never a live feed; crosses with no CME chain simply have no entry. Consumed by `GET /api/vol-forecast/zones` (appends this after the CZ text). The Pine indicator draws OI levels by type colour (call=red/put=green/max_pain=yellow/gamma_flip=purple/oi_volume=blue), width by tier, tints the background by regime, and has a **"Show ONLY OI levels"** toggle. Pure/offline-tested (`js/legoBricks.test.mjs`). | ✅ built (visualiser — reuses the OI stack, no new edge claim) |
| **Near-dated "day" expiry level set** | `js/oi.js` (`computeExpiryLevels`, `pickNearExpiry`, `inst.dayExpiry`) | The fix for "the walls are a 2-week move away, so the bot never trades." `pickPrimaryExpiry` picks the expiry with the most **near-money OI** — often the liquid monthly (~14 DTE for gold), whose walls can be multi-σ from spot and unreachable in a day. Now `buildOIEntry` ALSO computes a **near-dated** set: `pickNearExpiry(legs, spot, {belowDte, minNearFrac, minNearOI})` finds the **shortest-DTE** expiry that still carries real near-money OI — qualifying on **EITHER** a relative fraction (6% of the strongest leg's) **OR** an absolute lots floor (500), so a tradeable daily **dwarfed by a huge monthly** (gold, where a relative-only 15% floor silently rejected every daily) still surfaces. Returns `{ leg, dte, reason }` and `buildOIEntry` stores `inst.dayExpiryReason` so a missing day set **explains itself** (e.g. "nearest expiries too thin near spot — best is 1DTE at N lots (X% of the primary book)"); the export prints it on a `· no day levels: …` context line, and `computeExpiryLevels(strikes, calls, puts, spot, pair, {dte, minOI, sigmaFn})` builds its walls/max-pain/exposures/gexProfile/gammaFlip/regime **with the SAME bricks the primary path uses** (`wallStrengthTier`, `oiCalcMaxPain`, `buildGexProfile`, `oiCalcExposures`, `gammaFlip`) so a near-dated wall matches a primary one by construction — no second copy of the wall/greek math. Stored as `inst.dayExpiry` (its own DTE + ATM IV from the term structure; the quota-trim sheds only its heavy `gexProfile`, like the primary). **Shown in all three surfaces, the far set DTE-tagged (user's ask "show both, mark the 14-day"):** `oiStoreToLevels` emits BOTH sets, each level carrying its `dte`, and the far levels get the primary DTE tag (single-expiry pastes → no `dayExpiry`, no `dte`, byte-identical output); `oiLevelExport` renders `OI {price} : {type} {n}dte …`, heats each level off ITS OWN expiry's profile (near-dated γ is stronger, ∝1/√T), and puts the **near-dated regime** on the tinted `regime` line while the far book shows as "long/short-gamma" (deliberately not PIN/BREAKOUT, so the Pine tint parse can't pick up the far regime); `Confluence Zones Indicator.pine` parses the `{n}dte` token, tracks the nearest DTE as the "day" set, and draws longer-dated levels **dashed + faded + thin** so the day levels stand out (label + table show `{n}d`). **Bot trades the near-dated expiry** (user chose near-dated regime): the `_refreshOIBotZones` producer feeds `buildOIZones` a `tradeInst` overlaid with `inst.dayExpiry`'s walls/max-pain/exposures/gammaFlip, keeps the far book on the plan as `instruments[key].farExpiry` context, and falls back to the primary untouched when there's no day expiry. **Re-analyse without re-pasting (2026-08):** stored entries keep their old shape until re-analysed, so a compute change (like `dayExpiry`) doesn't reach old pastes on its own. `POST /api/oi/reanalyse` re-runs `buildOIEntry` per stored pair from the saved raw chain — the SAME derivation the modal's Analyse does, headless — and union-merges the fresh insts back into `oi_store`, then refreshes the OI-bot plan. Default **pins the stored futures/spot** (new `skipLiveQuote` option on `buildOIEntry` → no live re-fetch, levels reproduced exactly + enriched, saved-at preserved so stale data doesn't look fresh); `?live=1` re-fetches the paired quote to refresh the basis to current price; `?pair=…` limits scope. This is also the automated-upload shape (push raw chains into `oi_store`, POST to derive every level in one place). A **↻ Re-analyse all** button on `oi-dashboard.html` calls it then reloads. **Per-expiry breakdown (2026-08):** `inst.perExpiry` = SPOT-terms `{dte, maxPain, callWall, putWall}` for EVERY expiry (basis-shifted from the raw `termStructure`, which stays raw for its own consumers), rendered in the export as a `· per-expiry (mp · cw/pw)` block. So a user can line ANY single expiry up against another desk's OI panel and **verify the raw-OI calc** — max pain is deterministic, so the same expiry + same chain gives the same number; a longer expiry whose OI is centred below a rallied spot correctly shows max-pain/walls below spot (the "their max pain is under our spot ⇒ they're on a longer expiry" diagnosis). **Day-band level selection (2026-08):** the default no longer shows just primary+day — it shows every expiry's walls **within the day's trading band** + a **catch** level beyond it each side, so an expiry pick can never hide a level price can reach today and a blowout always has the next level ahead. `oiDayBandFrac(volAnnualPct, pair, {k})` = the band half-width from the forecast's annualised vol (`σ_daily = σ_annual/√252`, `k=3` ≈ beyond the 99th-pct day; flat-vol fallback). `oiBandSelect(levels, spot, bandFrac)` → `{inBand, catch}` (catch = nearest wall beyond the band each side). The server computes `bandByPair` from `forecastState…vol_annual` (`?bandK=` overrides) and `buildOILevelText` emits the band-bounded per-expiry union (deduped against the detailed lines, so a far primary wall the near-money selector dropped becomes the catch). **Live basis control (2026-08, COG):** the futures→spot basis is usually ~2 pips stable but drifts further on rate/roll/expiry days (amplified on the inverted 6J/6C/6S pairs), stale-converting every level a few pips off. `oiReprojectBasis(inst, {newBasis, newSpot, newFutures})` re-projects EVERY stored spot-equivalent level by −Δbasis (linear even for inverted pairs — only the strike is inverted, not the basis; distances like `expectedMove.move` untouched) WITHOUT recomputing greeks/regime (OI is a daily snapshot; no intraday flicker). `oiRefreshBasis(inst)` re-fetches the paired quote, guards `basisImplausible`, and calls it. Server `_refreshOIBasis` runs every 15 min, re-projects `oi_store`, then refreshes `oi_bot_zones` so the **bot trades the drifted lines** too. Pure parts tested in `js/legoBricks.test.mjs`. **Day-anchor drift readout (2026-08):** `buildOIEntry` stamps `inst.daySpot`/`daySpotAt` = the spot when today's levels were set, preserved across the intraday re-projections AND same-day re-analyses (only resets on the first analyse of a new UTC day) so it is a stable reference; `oiReprojectBasis` freshens `inst.spot` live but leaves `daySpot` fixed. The dashboard `priceBar` renders a **drift badge** on the CFD-spot tile (`▲ +18p · 0.12% since 07:07` — how far price has walked from where the levels anchored, coloured by direction, flat < 0.5p) and an **updated HH:MM** stamp on the Basis tile (from `inst.basisAt`, the last paired-quote refresh), so the live basis control is visible instead of silent. **oi_store cache freshness + IV-smile staleness (2026-08):** `oiLoadStoreFromKV` (the KV→localStorage sync `index.html`'s OI card reads through) was **gap-fill only** (`if (!localStore[sym])`) — once a symbol was cached in a browser it was NEVER refreshed from the server, so `index.html` could show a stale OI/spot AND a stale charm/vanna smile indefinitely while `oi-dashboard` (which reads `/api/oi-store` directly) had moved on. Now it's **freshness-aware**: take the KV entry when it's newer by `savedAtMs` (or local is missing), keep local only when strictly newer (the brief post-paste, pre-push window). Separately, charm/vanna are only as fresh as the IV surface they were computed from, and `rawIV` PERSISTS across OI re-analyses — so `buildOIEntry` now stamps `inst.ivSavedAtMs` (reused when the `rawIV` text is unchanged, re-stamped on a new paste) and `_oiIVReads` renders "IV from Xh ago" + a "⚠ smile older than the OI" flag when the smile lags the OI by >6h; CEX/VEX are abbreviated (they reach 1e10 and are flat-sigma "indicative only" — sign/firing is the read, not the magnitude). **GEX regime bands (2026-08):** the net-GEX SIGN everything keys off is a whole-book average, but the regime is actually LOCAL — long dealer gamma (PIN, fade extremes) vs short gamma (BREAKOUT, don't fade) flips at each zero-gamma crossing. `oiRegimeBands(inst, {lo, hi})` (`js/oi.js`) turns the stored `inst.gexFlips` (already basis-shifted) into contiguous PIN/BREAKOUT bands over a price window, each band's regime read from the crossing's OWN `dir` (`long->short` = long gamma below it), falling back to the net-GEX sign when no crossing is in range. The OI-dashboard `chartGEX` shades them behind the net-GEX bars (green = PIN, red = BREAKOUT) and the note calls out **which zone spot is currently in** — so a book that is net +GEX but has spot sitting in a short-gamma pocket (where fading is exactly wrong) is now visible. Shown in THREE surfaces now: the OI-dashboard `chartGEX` shading (browser mirror since it renders from stored fields), the **main price chart** as translucent horizontal PIN/BREAKOUT zones (a `#pxBands` overlay positioned via `priceToCoordinate`, "Regime bands" toggle, repositioned on poll + pan/zoom), and the **Pine indicator** — `buildOILevelText` emits a `· gex-bands base=<r> <price>=<r> …` line (base regime below the lowest crossing, each crossing price with the regime ABOVE it, px-converted in futures mode), which the `Confluence Zones Indicator.pine` parses into `box.new` price-zoned shading (new `regime_bands` toggle; falls back to the single whole-chart tint when no band data). The bot's local-regime fade/follow switch remains the intended later consumer of the same brick. Tested in `js/legoBricks.test.mjs` (brick units + the `· gex-bands` export format). **Raw ladder archive — strike-over-time (2026-08):** the `oi_history` summary keeps only the top-8 walls, so a strike quietly BUILDING from deep in the book is invisible until it cracks the top 8. `_snapshotOIHistory` now ALSO writes a separate durable `oi_history_raw` key (registered in `kv.js` `_CF_EXACT`) holding the FULL per-strike ladder (`rawOI`/`rawChg`/`rawVol` + spot/basis/futures/dte context) per pair per day, ~90-day window, deduped independently of the summary (side-by-side, so nothing reading the lean summary breaks). CME serves no OI history so this can only be captured **forward, never back-filled** — the strike-over-time map + early wall-building signal. `GET /api/oi-history-raw` (index without `?pair=`, day-keyed ladders with) exposes it for verification + the future strike-over-time viz. **All-expiries-as-lines (opt-in, `?allExpiry=1` + dashboard checkbox):** the FULL unbounded term structure (cross-desk compare) instead of the band selection. **Futures-terms toggle (2026-08):** our lines are converted FROM CME strikes TO spot (`Spot Level = CME Strike − Basis`), so they overlay an OANDA-spot chart, not a futures one. `oiFuturesTermsPrice(price, inst)` (`js/oi.js`) is the exact inverse (non-inverted: `+basis`; inverted 6J/6C/6S: `1/(price+basis)`; identity when the basis was 0/clamped). `buildOILevelText({terms:'futures'})` runs every drawn price through it (P(touch) still keyed off the spot price) and adds a `· prices in FUTURES/CME terms` note; `GET /api/vol-forecast/zones?terms=futures` and a **futures terms** checkbox on the dashboard export expose it. Default stays spot. **Inverted-pair C/P flip now defaults ON (2026-08):** on 6J/6C/6S the CME quotes the foreign ccy in USD, so a 6J CALL (JPY strengthening) is a USD/JPY **put** (a floor). Un-flipped, every USD/JPY put wall sat ABOVE spot — backwards; an external CME OI dashboard (Bennett's) + the dealer-hedging economics both read it flipped. `buildOIEntry` now sets `cpSwapped = futuresIsInverted(pair) && (swapCP !== false)` — flip ON by default for the three inverted pairs, `swapCP:false` the per-pair escape hatch. The swap happens BEFORE max-pain/walls/GEX, so ONE flag flips the export, indicator AND bot together (the bot trades the flipped labels). Re-analyse passes `swapCP:undefined` so it migrates old un-flipped entries; the modal box defaults ticked for a new inverted pair. Non-inverted pairs never flip. Tested in `js/legoBricks.test.mjs`. Pure/offline-tested (`js/legoBricks.test.mjs`: `computeExpiryLevels`/`pickNearExpiry` units + dual-expiry export tags both sets + tints the near-dated regime + single-expiry stays untagged + `buildOIEntry` populates `dayExpiry` headless via `skipLiveQuote`). | 🔬 built · unvalidated (reachability/visualisation; the near-dated *edge* is unproven — forward-test via the OI bot) |
| **Levels-v2 live producer** | `levelsV2Engine.js` (root) | `refreshAllPairsV2` / `refreshPairV2` / `loadPolicy` — fetch OANDA M1 (approach path)/M5/M30/D, build the shared ladders, look up **this symbol's own `frozen.perInstrument[instr]` policy** (no pooling) via `gradeLevelV2`, write `ai_entries_v2_*`, and record+resolve the ledger. A symbol outside the learned universe (e.g. an index) correctly finds no policy rather than falling back to a pool it was never part of. One producer, one KV namespace. Auto-runs inside the Railway `runLevelsRefresh` loop (not the Cloudflare cron-worker). Routes `/api/levels-v2/{learn,refresh,entries,ledger,status}`; UI `telegram-v2.html`. Full design: `TELEGRAM_V2.md`. | ✅ built |
| **Entry ledger v2** | `js/entryLedgerV2.js` | the daily-learning loop — `recordEntries` (append live signals, dedup standing levels, stores `sl`/`rung`/`trailFrac`), `resolvePair` (honest **limit-fill + held-chandelier trail walk**, reusing `rangeLineAnalyser.walkChandelierExit` — never a second trail implementation — → win/loss/expired/timeout + after-cost `realizedPct`; still-open positions stay unresolved rather than force-closing at a fixed barrier that no longer exists), `ledgerStats` (realized vs policy expectancy per grade; **Batch 7:** exports `MIN_CONCLUSION_N`=30 and flags per-grade rows `insufficient` below it + top-level `minConclusionN` — raw numbers stay in the payload, `telegram-v2.html` suppresses the verdict at the DISPLAY layer as "insufficient sample (n=X)" and labels the aggregate with its n), `refitFromLedger` (review-only candidate from realized fills; never auto-overwrites the frozen policy). Pure; tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Confluence count** | `js/confluenceCount.js` | pure `countWithin` (partners within a pip tolerance of a price) + `confluenceBucket` (0·solo / 1·pair / 2·triple+) — tests the "confluence amplifies probability" hypothesis. Tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Confluence test** | `js/confluenceTest.js` | `runConfluenceTest` / `confluenceForPair` / `mergeConfluence` — backtest of "does multi-source S/R make price react?". v2 methodology (un-confounded): confluence = **distinct external source kinds** within tol (`levelSources` PDH/PWH/pivots/round/daily-open/**swing_sr**/**swing_fib**) — **fib ladder excluded** (its density was the confound), and `swing_fib` itself counts distinct swing pairs so it can't re-introduce density; **three-way split** isolates the multi-swing-fib thesis — `fib(cluster)` (a swing_fib cluster aligns) vs `confluent(no fib)` (≥2 other kinds, the generic control) vs `plain(<2)` — so the golden-pocket signal can't be diluted into a generic count; **location-controlled** by fib band (core/mid/outer); reaction measured by **bounce toward mid** (`excMid`) alongside reversion% + after-cost fade edge. Read-only research (does NOT change the live policy). Reuses `runRangeLineAnalyser` (untouched) + `pnlFor` + `collectLevels`. Route `/api/levels-v2/confluence-test`; panel on `telegram-v2.html`. | ✅ built |
| **Alert-v2 core** | `js/alertV2Core.js` | the pure "should this v2 zone alert now?" decision — `selectAlerts` (proximity + min-grade + per-pair filter + **absolute after-cost expectancy floor** (Batch 7: `minExpectancyCostMult`, default 1.0 — entry `expectancy` must clear that multiple of the pair's `PAIR_COST_PCT` round-trip cost, resolved via `instrumentRegistry`/`costForPair` or an explicit `pairCost` arg; fails closed on missing expectancy; grades stay RELATIVE for display, an ALERT must clear its own cost in absolute terms) + per-level cooldown → alerts to send + updated cooldowns), `alertKey`, `pruneCooldowns`, `DEFAULT_V2_ALERT_CFG`. Now imports `perLineStrategy.costForPair` + the instrument registry (pure lookups). v2's OWN alert config, separate from v1 `ai_alert_cfg`; transport/formatting stay out. Wired into `levelsV2Engine` (sends via Telegram using shared `tg_config`, alerts-only). Routes `/api/levels-v2/alert-config`; config panel in `telegram-v2.html`. Pure; tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Hedge-signal v2 engine** | `js/hedgeSignalV2Engine.js` | the honest rebuild of the v1 correlation hedge — a market-neutral **cointegration** pairs engine. `olsFit`/`halfLife` (Ornstein-Uhlenbeck λ + t-stat), `cointegrationTest` (Engle-Granger: static logA=α+β·logB regression → residual stationarity gate, returns the cointegrating β for money-matching), `rollingSpread`, `residualZAt` (2026-07-26, exported alias of the previously-private no-lookahead rolling-residual-z helper — so other pairs-style engines can reuse the exact pattern instead of re-deriving it), `backtestPair` (static-residual z, β LOCKED at entry, exits on revert / z-stop / **half-life time-stop**, costs on), `backtestBaseline` (the v1-style plain-spread/all-history-mean/z-only-exit comparator), `runComparison` (per-pair cointegration table + **IS/OOS A/B** v2-vs-baseline), `liveSignal` (latest-bar reading: z, β, half-life, money-match notional ratio, direction). One code path for live + backtest (Lego Principle 1). Reuses `metricsCore`. Pure; tested on synthetic cointegrated/random-walk series in `js/hedgeSignalV2Engine.test.mjs` (9 tests). Server: live producer `computeHedgeSignalsV2` + routes `/api/hedge-signals-v2{,/check,/config,/backtest/run,/backtest/status/:id}`; UI `hedge-signals-v2.html`; index ⚡ Signals dropdown (v1/v2). Rationale: `HEDGING_VS_SPREAD.md`. **Second consumer (2026-07-26):** `goldMinerArbEngine.js` imports `olsFit`/`halfLife`/`passesCointegration`/`V2_DEFAULTS` directly (raw-price regression, not log) rather than re-deriving an ADF test — see that row below. | ✅ built |
| **Gold-miner-arb engine** | `js/goldMinerArbEngine.js` | mechanises an owner-supplied GDX-vs-Gold pairs stat-arb spec as a COMPOSITION of existing bricks (no new primitive) — same pattern as `macroFxZoneEngine.js`/`poiReactionV1Engine.js`. Reuses `hedgeSignalV2Engine`'s `olsFit`/`halfLife`/`passesCointegration` for the rolling hedge-ratio regression and the cointegration gate (the honest equivalent of the spec's "ADF p-value>0.05" rule — an OU λ t-stat vs the documented Engle-Granger 5% critical value, not a hand-approximated p-value); fits the cointegration-gate regression STATICALLY over its own test window (textbook Engle-Granger — reusing the z-score's own rolling beta for the gate was tried first and mechanically flattered apparent stationarity via self-fit bias, caught by the synthetic-data tests before shipping). `runGoldMinerArb(dates, gdx, gold, vix, opts)` is the ONE entry primitive (Lego Principle 2) — the full spec policy (scale-in tranches at ±1.5/±2.5/±3.5σ, §6 VIX filter + vol-percentile size cut, §7 two-stage take-profit + disaster/time/macro stop, §4 $ risk sizing) and a naive single-tranche `GMA_BASELINE_OPTS` baseline are both just different `opts` bundles through the same walk-forward loop, IS/OOS via `honestForecastEngine.summarizeSplit`. `crossCheckHedgeV2` runs the platform's existing, unmodified, already-live FX-pairs engine (`hedgeSignalV2Engine.runComparison`) on the same GDX/Gold pair as an independent sanity check. Data: `fetchGoldMinerArbData` — gold leg is **OANDA XAU_USD spot**, not CME GC futures (avoids Yahoo's unadjusted-continuous-contract roll jumps corrupting the cointegration gate, at the cost of ignoring the futures basis — labelled, not hidden); GDX + VIX are **Yahoo daily** bars via `nasdaqDataSources.fetchYahooChart`/`fetchYahooDaily` (now also extracting `adjclose`, added for this — see below), reused by import rather than re-implemented, despite that module's docstring framing it as NASDAQ-system-private; a genuine 15-minute version (the spec's original primary timeframe) needs a paid feed, since free Yahoo intraday only covers ~60 days — nowhere near a real OOS split. Costs (round-trip bps on every close) are a deliberate ADDITION beyond the original spec, which had none, per `CLAUDE.md`'s "costs on by default." Pure math except the fetch; no-lookahead verified in tests via truncation-invariance. Tested `js/goldMinerArbEngine.test.mjs` (9 checks: cointegrated-vs-random-walk gate discrimination, VIX entry filter + macro stop, no-lookahead, $ risk-budget/R-multiple sanity, CSV field presence, baseline-vs-policy divergence on non-cointegrated data). Server: async job `/api/gold-miner-arb/{run,status/:jobId}`; UI `gold-miner-arb.html` (policy-vs-baseline IS/OOS card, cointegration diagnostics, cross-check card, 3 CSV exports — explicitly flags the R≈%Return degeneracy from the spec's fixed 1%-of-equity risk sizing, per `CLAUDE.md`'s house-conventions warning on that exact case); linked from `index.html`. **Status: BUILT, not yet run OOS** — sandbox network policy blocks both OANDA and Yahoo; the edge verdict needs a run on Railway. | ✅ built (unrun) |
| **Trade-decision fast loop** | `Trade_Decision_Engine/decisionCore.js` | the per-event go/skip scorer (meta-labeling shape): `decide(snapshot, request)` — hard gates (staleness/news/no-zone, fail-closed) → `buildEventFeatures` (bounded 0..1, **relative units** — level type / σ-distance / confluence count, never absolute price; SHARED by live scoring and any future training fit so they can't drift) → `scoreLogistic` → `{decision, direction, probability, size_multiplier, top_factors}`. Action/direction defaulting reuses `selectStrategy` (forecastCore). **Macro socket (platform-review #7, TDE half):** `macroState(riskSens, regime, direction) → ±1|0` resolves the snapshot's direction-agnostic macro context per-direction inside `buildEventFeatures` → ONE signed `macro_align ∈ {−1,0,+1}` feature (sign convention + `MACRO_RISK_SENS_MIN=0.4` frozen pre-registration; `riskSens` must derive from `fx-macro-model` `PAIR_DRIVERS`, never a hand copy; v0 carries NO macro weight — it enters scoring only via a promoted fit). **`htf_align` (HTF_FEATURES) — the research-arc SURVIVOR:** signed ±1/0 trend-alignment (does the trade direction agree with the pair's trailing-20d trend, `snapshot.htfTrend`) — the one feature that beat the chance baseline on honest OOS+cost testing (aligned−opposed ≈ +0.05%/touch IS & OOS; improved the fit's OOS Brier ~10× more than the intraday block). Zero-weighted in v0 like the rest; it's a directional FILTER (separation), net-positive only pooled-OOS — not a standalone signal (ARCHITECTURE §8b). Model weights live in `modelV0.js` (hand-set prior, `calibrated:false` in every response — v1 = fit on the decision log, walk-forward + calibration proof). Pure, deterministic given (snapshot, request, nowMs); tested `Trade_Decision_Engine/decisionCore.test.mjs` (114 assertions, incl. prior monotonicity + macro + htf resolution). Design: `Trade_Decision_Engine/ARCHITECTURE.md` (§7c macro contract, §8b research findings). | ✅ built |
| **News gate** | `Trade_Decision_Engine/newsGate.js` | pure hard/soft news decision over a supplied calendar — `newsGate(events, now, currencies, cfg)` (high-impact within 45m-before/15m-after → hard block; within 4h → soft `news_soon` feature) + `pairCurrencies` (fx base/quote via instrumentRegistry). No fetching in the brick; the slow loop supplies events (Finnhub mapper in `featureState.fetchCalendar`). Candidate consumers to unify later: `nqFetchNewsRisk` (server.js), DecisionEngine event gate. | ✅ built |
| **Trade-decision backfill** | `Trade_Decision_Engine/backfill.js` | day-one training data + candidate fit — `deriveD1Packed` (packed M1 → D1, one typed pass), `backfillPair` (walk-forward replay: per-day `buildSnapshot` on D1 < i → first M1 touch per top zone → the SAME `decide()` the live API serves → `labelOutcome` triple-barrier: SL-first intrabar, TP, else honest mark-to-day-close, after-cost), `fitLogistic` (time-ordered split + embargo → per-decile OOS calibration + Brier, fitted vs v0 prior; **`features` param = ablation socket** — e.g. ±`macro_align` with `embargoDays:30` and `l2ExemptFeatures` for rare features, since L2 shrinkage biases a rare feature toward "it fails"; candidate NEVER self-promotes — `calibrated:false` until a human reads the evidence), **`macroBucketReport` + `MACRO_BUCKET_BAR`** (the PRIMARY macro evidence: per-bucket win/expectancy/per-year + **episode count** — ≤7-day-gap runs; events inside one macro episode are ONE observation; pre-registered bar n≥30 ∧ ≥8 episodes ∧ ≥3 years), **`contextByDate` socket** on `backfillPair`/`runBackfill` (per-day `{macro, calendar}` — how obs-dated FRED history, and later a historical calendar, reach the replay), `runBackfill` (incremental orchestrator: `backfill_state.json` last-date per pair, events JSONL, report JSON; **gap-fills the stored parquet from live OANDA M1 first** via `m1GapFill`+`fetchM1Range`, so the nightly run never waits on the R2 refresh). Reuses `loadM1ForPair`, `gapFillPacked`, `bisect`, `DEFAULT_COST_PCT`. Routes `/api/trade-decision/backfill/{run,status/:jobId,report}` (async-job pattern); nightly top-up ON by default, schedule in KV runtime config `trade_decision_cfg` (`GET/POST /api/trade-decision/config`, caps pattern — env `TDE_BACKFILL_*` = defaults only); UI section on `trade-decision-engine.html`. Pure core tested `Trade_Decision_Engine/backfill.test.mjs` (38 assertions). | ✅ built |
| **Trade-decision slow loop** | `Trade_Decision_Engine/featureState.js` | per-pair `FeatureSnapshot` maintainer — `buildSnapshot` (PURE: D1 bars + calendar → σ via `volSigmaSeries`, regime via `classifyRegime`, T via `dayTypeScore`, σ-percentile via `rollingPercentile`, zone map via `collectLevels`+`clusterLevels` with σ-scaled tolerance; all imported bricks, zero copies), `syntheticSnapshot` (deterministic, no-network demo/test path), `refreshPair` (OANDA `fetchD1` + today's M1 since London midnight (`fetchM1Range`+`londonMidnightSec`) + Finnhub; `macro` passthrough for the KV-`fred`-resolved context — fail-NEUTRAL + `stale:true` when the mirror is old, macro is a modifier never a gate), `startRefresher` (opt-in via `TDE_PAIRS`). `buildSnapshot` accepts an optional pre-resolved `macro` context object (`{regime, riskSens, asOf, stale?}` — never raw FRED; malformed ⇒ null, not a wrong sign), optional `intradayBars`/`sessionOpen` (→ TRUE session open replaces the last-close dayOpen approximation), and **`computeIntradayState`** (pure: today's bars → range-used vs the forecaster's median expected range (`computeBands.hl50` — one source of truth), position-in-range, session VWAP distance in σ, approach speed; live = snapshot block ≤ staleness gate old, backfill = exact per-touch via the decide request; the four `intraday_*` features are ZERO-WEIGHTED in v0, promoted only via ablation fit — the macro discipline). **`computeSessionLadders`** (pure): the RANGE-LINE BOT's Asia/Monday fib ladders via the bot's own `buildRangeLadder`+`bodyRange` bricks (Asia first-6h 5m-bodies with the analyser's validFrom no-lookahead gate; Monday 15m-bodies, never on Monday itself; reach-filtered to ±1.5σ; ≥5-pip min range) **+ the previous session's Asia ladder (`prevAsia`, valid all day) and the today-vs-yesterday 2-pip ALIGNMENT (`asiaAlign`) via `detectConfluencesCore` — the same brick the dashboard/Asia backtest/Pine export share, at the live defaults (2.0 pips, tight 10%, merge 0.3×, session-range cap); aligned clusters carry count 2 and subsume their constituents** → `snapshot.ladders`, merged as time-valid DYNAMIC zones in `decisionCore.dynamicZones` alongside today's developing `session_hilo` extremes (per-source consolidation within ~2 pips — a grid cannot confirm itself), with cross-boundary confluence merge; ladder lines double as backfill touch candidates (0 validFrom violations over a 12y replay). Zone map also carries the `vol_band` source (the volatility bot's six plan lines off the same `computeBands`). D1-only level sources for now (volume_profile/vwap need an intraday feed — flagged, not faked). Routes `/api/trade-decision/{decide,state/:pair,refresh,log,health}`; UI `trade-decision-engine.html`; decisions logged to JSONL (`decisionLog.js`) as the future training set. | ✅ built |

**Where each source consolidates existing copies** (extract / unify targets):

| Level source | Existing JS (confluenceModules) | Existing Python (Gold bot) — unify later |
|---|---|---|
| `daily_open` | `daily_opens`, partial `session_open_range` | `session_engine.py` |
| `prior_hilo` | `pdh_pdl`, `pwh_pwl`, `ath_52wk`, `monday_range` | `session_engine.py` |
| `pivots` | *(none in JS)* | `session_engine.py:_pivots` (Camarilla variant — formulas differ; document before unifying) |
| `volume_profile` | `vah_val`, `naked_poc` (no nPOC-age in JS) | `volume_profile.py` (age-weighted nPOC stack — port into JS as a param) |
| `swing_sr` | `sr_level` (N=5 on 30m) | `fib_engine.py` swing pivots |
| `round_number` | `round_number` | — |
| `vwap` | *(none in JS — backtests omit VWAP anchors entirely)* | `session_engine.py` `compute_vwap_anchors` |
| VuManChu WT/MF/VWAP | `js/vumanchu.js` `computeWT`, `asiaRangeEngine._computeWT1Series` → **both now share `js/vumanchuCore.js`** ✅ | **`pylego/indicators/vumanchu.py` built 2026-07-30** — golden-tested bit-for-bit vs the JS via `scripts/gen_vumanchu_vectors.mjs`. Still to retire into it: `Gold/modules/vumanchu.py`, `GoldV2/modules/vumanchu.py`, `ConfluenceBot/modules/vumanchu.py`, `volatilityExhaustion/mtf_divergence.py`, `backtestSystem/indicators.py`, `bot/utils/indicators.py` |

> **VuManChu / WaveTrend — done (JS).** The two JS copies (`js/vumanchu.js`
> `computeWT` and `asiaRangeEngine._computeWT1Series`) now share
> `js/vumanchuCore.js`. They had drifted only on the channel-index divide guard
> (`d > 0` vs `d > 1e-10`); the core standardizes on `1e-10`, which is not just a
> merge but an **improvement** — on a flat/dead market float rounding leaves `d`
> at ~1e-16, and the old `d > 0` guard divided by that noise to emit spurious
> ±66 oscillator spikes, while `1e-10` suppresses them (proven in
> `js/vumanchuCore.test.mjs`). `asiaRangeEngine` is bit-identical (it already
> used `1e-10`). The Python copies remain a later unification target.

### 1d. Python baseplate bricks (`pylego/`) — 2026-06-29

The Python sibling of the JS bricks: a shared `pylego/` package the bots import
from instead of copy-pasting tables/plumbing into every island. **Full plan +
the two-category strategy (generate-don't-port for math/data, consolidate for
execution) is in `PYTHON_LEGO.md`.** Key rule: for **Category-A** (math/data)
bricks the data has ONE source — the JS registry — serialized to JSON and read by
both languages; we do **not** hand-port JS math into Python (that mints copy #7,
the drift bug). **Category-B** (MT5 connect / enter / stop / risk / sizing) are
inherently Python, duplicated across bots, and get consolidated here as new code.

| Brick | File | Owns | Status |
|---|---|---|---|
| **Instruments (Python)** | `pylego/instruments.py` + `pylego/instruments.json` | pip size / digits / asset class / venue symbols / alias resolution, mirroring the JS accessor API (`pip_size`, `resolve_key`, `instrument`, `mt5_symbol`, …); fail-loud on unknown. JSON is **generated** from `js/instrumentRegistry.js` by `scripts/gen_instruments_json.mjs` (one source of truth, both languages). Adopted by `bot/main.py` ✅ (its inline `_PIP_SIZES` now built from the brick); golden-tested in `pylego/instruments_test.py`. | 🟡 built, adoption in progress |
| **JS→JSON bridge** | `scripts/gen_instruments_json.mjs` | serializes the JS registry → `pylego/instruments.json`; `--check` mode guards staleness in CI. The mechanism for every future Category-A bridge (`asset_params.json`, GARCH, regime score). | ✅ built |
| **Point values (Python)** | `pylego/point_values.py` + `pylego/point_values.json` | approximate cash value per pip per lot (sizing input). **Python-owned, NOT JS-sourced** — account-currency dependent, so it's not instrument identity and stays out of the price registry. Canonical = regime_bot == RegimeV2 set. `point_value`/`point_values_for` with explicit default. Adopted by `bot/regime_bot.py` ✅ (non-live). ⚠ DynAnchorBot's values differ → live adoption behind a sizing review. Golden-tested in `pylego/instruments_test.py`. | 🟡 built, adoption in progress |
| **Sizing (Python)** | `pylego/sizing.py` | the `position_size` primitive (risk% → lots, decay discount, min/max clamp). Pure: caller passes pip + pip_value (no globals/MT5). Replaces the per-bot copies. Adopted by `bot/regime_bot.py` ✅; tested in `pylego/sizing_test.py` (incl. golden vs old formula). | 🟡 built, adoption in progress |
| **RiskGuard (Python)** | `pylego/risk_guard.py` | daily/monthly DD lockout + per-pair cooldown state machine, lifted verbatim from `bot/regime_bot.py` (logger injected). Consolidates 4 copies + unwired `safety/risk_gate.py`. Adopted by `bot/regime_bot.py` ✅; tested in `pylego/risk_guard_test.py`. | 🟡 built, adoption in progress |
| **Volatility strategy (Python)** | `pylego/strategy/volatility.py` | the ONLY Category-A logic the Volatility Bot runs: `approach_velocity` (policy cell-key bucket), `line_levels` (OC static / HL dynamic, mirrors `analyseWindow.levelAt`), `neighbours` (inner/outer), `trade_spec` (fade/follow triple-barrier), `cell_key`. **Golden-tested** vs JS vectors generated by `scripts/gen_volatility_vectors.mjs` → `volatility_vectors.json`, so it can't drift from `touchFeatures.approachVelocity`. Everything else is read from the frozen `volatility_bot_plan`. | `volatility_bot` (next slice); `pylego/strategy/volatility_test.py` | ✅ built |
| **Range-line strategy (Python)** | `pylego/strategy/rangeline.py` | the ONLY Category-A logic the Range-Line Bot runs: `body_range`/`resample_to` (session range, == `barUtils.bodyRange`), `build_ladder` (== `rangeLineAnalyser.buildRangeLadder` — same labels → same cell keys), `ladder_side` (above/below mid), `neighbours` (inner toward mid / outer away), `trade_spec` (fade/follow → entry/protect-stop/rung, no fixed TP), `chandelier_stop` (peak ∓ ½·rung floored at protect, == the `c`-path of `_trailExits`), `cell_key`. Everything else read from the frozen `range_line_bot_plan`. Offline-tested in `range_line_bot/engine_test.py`. | `range_line_bot`; `range_line_bot/engine_test.py` | ✅ built |
| **Range-line bot (Python)** | `range_line_bot/` | `engine.py` (`RangeSession` — builds the Asia/Monday ladders, one-shot touches, held-position one-per-(src,side) suppression; `session_anchor_epoch` fixed-UTC window matching the freeze) + `range_line_bot.py` (the live loop: three cadences, reuses pylego `KvClient`/`PaperBroker`/`Mt5Broker`/`position_size`/`instruments`/`point_values`, publishes `range_line_bot_status`). **Exit = the chandelier trailed on the BROKER'S native SL** (`broker.modify` ratchets it through break-even and beyond, no TP) so it survives the bot going offline; **no entries during the 00:00–06:00 formation window**; **skips closed markets** (`broker.tradable`) and **only burns a held-slot on a filled order**. `single_position_per_pair` config flag (default **True**, matches today's live behaviour: the broker blocks a 2nd position on a pair regardless of which ladder slot wants it) — set **False** to pass a per-(src,side) `dedupe_tag` through to the broker instead, so an Asia-ladder and Monday-ladder position can be held concurrently on the same pair, matching the offline held-position backtest (`js/rangeLineAnalyser.js runHeldPosition`, keyed per slot not per instrument — see 2026-07 divergence note). Paper by default, `--live` for MT5. Tested `engine_test.py` (28) + `smoke_test.py` (19: entry→native-SL-trail→broker-exit→journal). | consumes `range_line_bot_plan`; imports the rangeline brick + pylego | ✅ built |
| **MT5 broker (Python)** | `pylego/broker/mt5.py` | `Mt5Broker` — connect/login/account-check, price/ATR/balance, `serialize_open_positions`/`serialize_closed_trades` (the dashboard positions-tab payload, §7), and order `enter`/`stop`/`modify` (trailing-SL, `TRADE_ACTION_SLTP`)/`tradable` (market-hours guard, avoids retcode-10017)/`filling_mode`. Lifted from `bot/regime_bot.py` with magic / symbol-resolver / pip-resolver / MT5 module injected. `enter()` takes an optional `dedupe_tag` (2026-07): unset (every existing caller) blocks on ANY open position for the pair with this magic, unchanged; a caller that passes it narrows the duplicate guard to positions whose comment contains `[{dedupe_tag}]`, so several concurrent positions per pair are possible when each comes from a distinct tag — `range_line_bot` is the first consumer (its `single_position_per_pair` config flag). Adopted by `bot/regime_bot.py` ✅ **and `volatility_bot` + `range_line_bot`** (live path); 12 offline tests against a fake MT5 in `pylego/broker/mt5_test.py`. **MFE/MAE (2026-07-21):** `serialize_closed_trades` now attaches `mfe_pips`/`mae_pips` per closed position, reconstructed from the M1 high/low path (`copy_rates_range` between open/close, cached by `position_id`, pip derived from `symbol_info` digits) — the give-back inputs for `analysis/bot_giveback.py`. Wrapped fail-safe (`_excursion_pips` never raises → the closed-trades payload the dashboard + `_rlAccumulateTradeLog`/`_oiAccumulateTradeLog` rollups read can't be blanked). | `bot/regime_bot.py`, `volatility_bot`, `range_line_bot`, `oi_bot` | 🟡 built, adoption in progress |
| **Broker clock (Python)** | `pylego/broker/clock.py` | `ServerClock` — the measured offset between the BROKER's wall clock and UTC, and the single place allowed to know that MT5's `.time` fields (positions, deals, bars, ticks) are stamped on that broker clock rather than UTC (+3h on the live account in summer). Measured, never hardcoded: the freshest tick across several majors vs `time.time()`, rounded to the quarter-hour, cached with an hourly re-measure so a broker EET/EEST switch is picked up. Stale weekend quotes (outside a −12h…+14h plausibility band) return `None` = "unknown" — never `0`, which would assert "this stamp is UTC". `mt5` module + clock injected → 10 offline tests in `pylego/broker/clock_test.py`. `to_utc()` normalises a stamp on the way OUT (published per row as `tz_offset_sec`, PYTHON_LEGO §7); `to_server()` converts back on the way IN to `copy_rates_range` / `history_deals_get`, which compare against the broker's own epochs. Symptoms it exists to kill: the Trade History chart drawn 3h away from the trade (exit marker floating off every candle), session/hour analytics filed a full bucket late, and paper (real-UTC) + MT5 (broker-clock) rows silently mixed in one table. | `pylego/broker/mt5.py`, `pylego/broker/paper.py` (declares 0), all 12 MT5 bot serialisers, `bot-config.html` (`_tradeUtc`) | 🟢 built |
| **Paper broker (Python)** | `pylego/broker/paper.py` | `PaperBroker` — in-memory broker exposing the SAME surface as `Mt5Broker` (`enter`/`stop`/`serialize_open_positions`/`serialize_closed_trades`/`account_balance`/`price`) so a bot swaps live↔paper with no code change, plus `modify`/`tradable` (mirror `Mt5Broker`) and `check_barriers` which executes the SL/TP (a falsy TP = none, so the trailed SL is the sole exit). `enter()` mirrors `Mt5Broker`'s optional `dedupe_tag` (2026-07, unset = no duplicate check at all, same as before). **MFE/MAE (2026-07-21):** `set_price` moves per-position favourable/adverse water-marks (seeded at the fill; additive only, never touches fills/exits) and `serialize_closed_trades` emits `mfe_pips`/`mae_pips` — same give-back fields as `Mt5Broker`, so paper and live agree. Fully offline-tested (`paper_test.py`) incl. LONG/SHORT excursion. | `volatility_bot`, `range_line_bot` (paper mode) | ✅ built |
| **KV client (Python)** | `pylego/kv.py` | `KvClient.get_json` / `put_json` / `put_status` — dashboard KV reads/writes + the `{data,timestamp}` status envelope; HTTP injected → offline-tested (`pylego/kv_test.py`). | `volatility_bot`; (regime bots later) | ✅ built |
| **Telegram alerts (Python)** | `pylego/telegram.py` | `send_telegram(token, chat_id, text)` + `load_tg_config(kv, own_cfg=None, fallback_key='tg_config')` — extracted 2026-08-13 from a `send_telegram`/`load_tg_config` pattern found copy-pasted near-identically across **7+ bots already** (`RegimeV2/regime_bot_v2.py`, `RegimeV4`, `RegimeV7`, `DynAnchorBot/dyn_anchor_mt5_bot.py`, `YieldSpreadBot/yield_spread_bot.py`, `oi_bot/oi_bot.py`, `bot/main.py`) with no `pylego/` brick behind any of them — CLAUDE.md's own stated threshold ("if two copies already exist, that alone qualifies") had already been crossed several times over before this. `load_tg_config` reads a bot's OWN `tg_token`/`tg_chat_id` if both set, else the SHARED `tg_config` key (fields `token`/`chatId` — the dashboard Alerts modal's key every existing bot ultimately falls back to). 8/8 offline tests (`pylego/telegram_test.py`, HTTP + KV both injected — no network). **The existing 7 copies are NOT migrated to this brick** — out of scope for adding its first new caller (`AnalogML/motif_track.py`), a real follow-up if anyone touches those bots next. | `AnalogML/motif_track.py` (`--telegram`) | ✅ built, first caller only |
| **Shape matching (Python)** | `pylego/shape_match.py` | historical-analog / motif search: `normalize_window` (log-return path, divided by the window's own realized vol, cumsum'd — price level gone, vol scaled to 1, time spacing unchanged), `rolling_shapes` (vectorized shape build for every window ending at each bar), `find_analogs` (nearest-neighbour Euclidean search with a causal `exclude_after` guard + `min_gap_bars` de-overlap; returns `(idx, dist, percentile)` — percentile is each match's rank among ALL eligible candidates, a real computed stat, not a fabricated similarity score). Brute-force, not matrix-profile/DTW scale — deliberately the minimal-DOF version first (CLAUDE.md). **Bug fixed 2026-08-12:** `min_gap_bars` only checked new candidates against already-chosen neighbours, never against the query's own position (`exclude_after`) — the single closest "neighbour" was routinely the window ending ~1 bar before the query itself (near-total overlap, not an independent repeat). Now seeds the gap-check with `exclude_after`. Affected every consumer below; see `AnalogML/README.md`'s honesty notes for the re-validation status. Offline-tested incl. a planted-repeat recovery test + a percentile monotonicity/boundedness check (`pylego/shape_match_test.py`, 10 cases). | `AnalogML/pattern_scan.py` | ✅ built |
| **Walk-forward folds (Python)** | `pylego/walkforward.py` | `expanding_folds` / `rolling_folds` — calendar-aligned (quarterly by default) OOS fold builder, the walk-forward discipline CLAUDE.md rule 5 requires, generalised so any Python study can reuse it instead of hand-rolling `TimeSeriesSplit` per script. Pure function of a datetime index + freq/window params; offline-tested (`pylego/walkforward_test.py`, 6 cases). | `AnalogML/ml_walkforward.py` | ✅ built |
| **Trade stats (Python)** | `pylego/trade_stats.py` | `summarize_r` — n / total R / win rate / profit factor / avg R from a pooled R-multiple array, one definition shared by new Python studies instead of the ad hoc copy this calc already has in ≥6 places (`RegimeV2/backtest_v3.py`, `VolRangeForecaster/vol_backtest.py`, `portfolioBacktest/portfolio_backtest.py`, …) — flagged as a P2 consolidation candidate below, not yet retired. Offline-tested (`pylego/trade_stats_test.py`, 5 cases). | `AnalogML/pattern_scan.py`, `AnalogML/ml_walkforward.py` | ✅ built |
| **Swing structure (Python, NEW 2026-08-12)** | `pylego/swing_structure.py` | `pivot_highs`/`pivot_lows` (local-extrema detection, vectorized numpy, tie-inclusive — a bar counts unless a STRICTLY greater/lesser neighbour disqualifies it), `atr` (Wilder's, same recursion as `js/patternEngine.js`'s `computeATR`), `classify_swing_structure`/`regime_at` (HH+HL/LH+LL/mixed regime classification off the pivot sequence). Regenerated (not ported — PYTHON_LEGO.md's rule) from `js/patternEngine.js`'s `pivotHighs`/`pivotLows`/`classifySwingStructure`, using that algorithm as the validated spec, fresh Python implementation with its own tests. Phase 2 of the AnalogML structural-motif build (see the AnalogML row below, "null banked 2026-08-12" — the fixed-window k-NN method tested null, this is a genuinely different idea: recognize a NAMED structural event instead of raw window-vs-window distance). Offline-tested incl. planted-peak/trough recovery, tie-inclusive semantics, boundary exclusion, and ATR convergence (`pylego/swing_structure_test.py`, 9 cases); sanity-checked against real GBPJPY 1h data (plausible pivot density, ATR magnitude, regime transitions). | `pylego/motif_touch.py` | ✅ built |
| **Motif touch detector (Python, NEW 2026-08-12)** | `pylego/motif_touch.py` | `detect_touch_motifs` — finds runs of 2-3 pivot highs/lows clustered within an ATR-scaled tolerance (the "touches"), each separated by a genuine intervening retracement (re-detected at a finer pivotN on the segment between touches, not just filtered from the global pivot list — a real pullback, not a shallow noise wiggle), then confirms a breakout direction (or the "failure" case: price makes a new extreme instead) within a bar horizon. Regenerated (not ported) from `js/patternEngine.js`'s `detectExtremesOneSide` (the double/triple top/bottom detector), same validated-spec-not-code discipline as `swing_structure.py`. Deliberately does NOT compute its own measured-move target/stop the way the JS original's `computeOutcome` does — that's Phase 1 (adaptive per-cluster SL/TP), deliberately deferred until this detector proves it has something worth sizing risk around; a first honest read races detected entries through the SAME frozen SL-pips/TP-R grid every other AnalogML check uses. **Lookahead bug found and fixed before any number was trusted (2026-08-12):** a touch isn't actually KNOWABLE as a genuine pivot until `pivot_n` bars have passed after it (pivot detection needs a centered window) — the breakout scan originally started checking for confirmation immediately after the last touch, crediting ~15.3% of "confirmed" motifs (measured on real GBPJPY data) with signals that couldn't have fired in real time. Fixed by delaying the scan start to `last_touch.idx + pivot_n`; a regression test now asserts this invariant on every call. Offline-tested incl. hand-verified double-top reversal/failure/unconfirmed/shallow-retracement cases + the mirrored double-bottom + the lookahead-lag regression guard (`pylego/motif_touch_test.py`, 8 cases); real-data smoke test confirms well-formed, causally-sorted output on GBPJPY 1h. | `AnalogML/motif_scan.py` | ✅ built |
| **Pattern lifecycle scoring (Python, NEW 2026-08-13)** | `pylego/pattern_lifecycle.py` | `compute_acceptance` (does a confirmed breakout actually hold for a few bars, or snap back — a false-breakout tell) + `compute_confidence` (0-100 score blending a detector's own 3 raw sub-scores — impulse/shape/retracement quality, already computed differently by each detector's own geometry — with two shape-agnostic checks computed HERE: volatility compression during formation vs a slower ATR, and breakout strength in ATR units). Regenerated (not ported) from `js/patternEngine.js`'s `computeAcceptance`/`computeConfidence`, using that algorithm as the validated spec. Built as a SHARED Tier-1 brick — operates on any detector's own already-computed geometry (raw_scores dict + start/confirm idx + direction + breakout level), not tied to one shape family, so touches/flags-pennants/future detectors (head & shoulders, triangles/wedges/channels) get "was this shape tracking standard geometry, or did it deviate" scoring without each carrying its own copy. This is the DURING-quality layer of the owner's full shape-prediction lifecycle ask (before/during/after — see the AnalogML row below); trend alignment is deliberately kept OUT of this score (own- vs higher-timeframe context is a different question from "is this a well-formed shape"), same design reasoning as the JS original, not simplified away. Offline-tested, 7 cases incl. a hand-verified weighted-sum check and a vol-compression-vs-expansion ordering check (`pylego/pattern_lifecycle_test.py`). Not yet wired into `flag_pennant.py`/`motif_touch.py`'s own output (both detectors would need `raw_scores` fields added to their dataclasses first — queued, not done this pass). | (not yet consumed — brick built ahead of its first caller) | ✅ built |
| **Flag/pennant detector (Python, NEW 2026-08-12)** | `pylego/flag_pennant.py` | `detect_flags_pennants` — the first additional shape family beyond N-touches-of-a-level in the owner's full "shape prediction" ask (see the AnalogML row below): finds an efficient, ATR-sized impulse ("pole"), then grows a window right after it looking for the first bar-length whose own pivot highs/lows fit two trendlines that (a) haven't given back more than `max_retrace_pct` of the pole, (b) drift flat-to-against the pole's direction, (c) classify as converging (pennant) or parallel (flag) by trendline-slope sign/gap, and (d) have at least `min_touches_total` pivots resting on them beyond the 4 anchor points: then scans forward for the first close beyond EITHER boundary (so a failed flag — breaks the wrong way — is a possible, counted outcome, not silently dropped). Regenerated (not ported) from `js/patternEngine.js`'s `detectFlagsPennants` (+ its `findPole`/`findConsolidation`/`findBreakout` helpers), same validated-spec-not-code discipline as `swing_structure.py`/`motif_touch.py`, reusing `pylego.swing_structure.pivot_highs`/`pivot_lows` rather than a third copy of pivot detection. Same causality discipline as `motif_touch.py` but the confirmability lag (pivot detection needs bars on both sides) falls out of the window-slice-then-pivot-detect construction for free here — no separate lag-delay fix was needed, and a regression test (`test_causal_ordering_invariant_on_all_synthetic_scenarios`) plus the real-data smoke test assert `pole_start_idx < pole_end_idx < consol_end_idx < confirm_idx` holds on every instance. Deliberately does NOT compute its own measured-move target/stop (same Phase-1-deferred reasoning as `motif_touch.py`) — a first honest read races detected entries through the SAME frozen SL-pips/TP-R grid every other AnalogML check uses. Offline-tested incl. hand-verified bull-flag/bull-pennant/failed-breakout/mirrored-bear-flag/no-consolidation/no-pole cases, each cross-checked against the already-tested `pivot_highs`/`pivot_lows` bricks before being baked into an assertion (`pylego/flag_pennant_test.py`, 8 cases); real-data smoke test on GBPJPY 1h (51 instances/5000 bars, 62.7% played out) plus a manual spot-check of one instance's actual OHLC path (a clean 108-pip pole, 43-bar consolidation retracing 33.5%, confirmed continuation breakout) confirmed plausible geometry before any aggregate number was trusted. | `AnalogML/flag_scan.py`, `AnalogML/flag_scan_sweep.py` | ⛔ **null — see the AnalogML row below** |
| **Trendline fitting (Python, NEW 2026-08-13)** | `pylego/trendline.py` | `line_at` (two-point line evaluated at any bar index) + `line_touches` (counts how many pivots beyond the 2 anchors sit within tolerance of the fitted line — NOTE: only counts a touch when the line's projected price is `>0`, a guard sensible for real always-positive price data but one that silently zeroes out touch-counting under literal price negation, discovered while writing `triangle_channel_test.py`'s mirror scenarios — use a positive-affine reflection `2*C - price`, not negation, for any future mirror test that needs more than the 2 anchor touches) + `sign` (JS `Math.sign` semantics). Regenerated from `js/patternEngine.js`'s `lineAt`/`lineTouches`. Extracted as a shared Tier-1 brick once `head_shoulders.py` needed the identical formula `flag_pennant.py` already had as a private copy — CLAUDE.md's brick rule: a second copy is the signal to extract, before a third (`triangle_channel.py`) turns it into real drift. `flag_pennant.py` refactored to import from here (regression-checked: byte-identical output before/after). | `pylego/flag_pennant.py`, `pylego/head_shoulders.py`, `pylego/triangle_channel.py` | ✅ built |
| **Head & shoulders detector (Python, NEW 2026-08-13)** | `pylego/head_shoulders.py` | `detect_head_shoulders` — regular (bearish, off pivot highs) and inverse (bullish, off pivot lows) head & shoulders. Finds consecutive pivot triples (L, H, R) where the head clears both shoulders by `head_min_atr_mult` ATRs and the shoulders sit within `shoulder_tol_atr_mult` of each other; the neckline anchors are the deepest intervening pivot between L-H and H-R (segment-locally re-detected, same convention as `motif_touch`/`flag_pennant`); each shoulder must show a genuine pullback (`shoulder_prominence_atr_mult`) toward its own neckline point. Confirms on either a neckline break (textbook reversal) or a new extreme beyond the right shoulder (the correct failure boundary — the neckline itself sits too far from current price for a same-bar failure check to mean anything). Regenerated from `js/patternEngine.js`'s `detectHeadShouldersOneSide`/`detectHeadShoulders`. **A real lookahead bug was found and fixed before any number was trusted (2026-08-13) — the SAME bug class that hit `motif_touch.py`, but bigger:** L/H/R come from a single global `pivot_highs`/`pivot_lows(bars, pivot_n)` call over the WHOLE array (unlike `flag_pennant`/`triangle_channel`, which re-slice-then-detect pivots inside a window and get the confirmability lag for free) — R isn't actually knowable as a genuine pivot until `pivot_n` bars have passed after it, so scanning for confirmation starting at `R.idx+1` credited signals a live system couldn't have had yet. Measured directly by diffing the old vs fixed confirm-scan on real data (not estimated): **92/225 GBPJPY instances (40.9%) had a different confirm_idx/direction after the fix** — pooled across 5 pairs, 487/1144 (42.6%). Fixed by delaying the scan start to `R.idx + pivot_n`, same fix shape as `motif_touch`'s; a regression test (`test_confirm_idx_never_precedes_pivot_confirmability`) proves the fix actually skips a premature one-bar-early confirmation and resolves one bar later, not just that the invariant holds post-hoc. Offline-tested incl. hand-verified regular-reversal/failure-beyond-right-shoulder/mirrored-inverse (via positive-affine reflection, not negation — see the `trendline.py` row)/uneven-shoulders/head-not-tall-enough/shallow-prominence cases (`pylego/head_shoulders_test.py`, 9 cases); real-data spot-check on GBPJPY (one instance's actual OHLC path, internally consistent: breakout_level matched the failed pattern's own right-shoulder price exactly, as the formula requires) confirmed plausible geometry before any aggregate number was trusted. | `AnalogML/head_shoulders_scan.py`, `AnalogML/head_shoulders_scan_sweep.py` | ⛔ **null — see the AnalogML row below** |
| **Triangle/wedge/channel detector (Python, NEW 2026-08-13)** | `pylego/triangle_channel.py` | `detect_triangles_channels` — ONE detector, SEVEN shape types (ascending/descending/symmetrical triangle, rising/falling wedge, channel up/down), classified purely by how two fitted trendlines' slopes relate: flat+rising=ascending triangle, flat+falling=descending triangle, opposite-sign converging=symmetrical triangle (genuinely no forced directional expectation — `None`, not a fabricated 50/50), same-sign converging=wedge (rising wedge expects DOWN, the classic exhaustion read), same-sign parallel=channel (expects continuation). Unlike the other detectors' greedy left-to-right advance, this is a FIXED-SIZE sliding window (`window_bars`, default 120) that slides by HALF its size when nothing confirms — matches the JS original's search strategy exactly. Regenerated from `js/patternEngine.js`'s `detectTrianglesChannels`. No lookahead bug — same window-slice-then-pivot-detect construction as `flag_pennant.py` that gets the confirmability lag for free (checked explicitly, not assumed clean just because `flag_pennant` was). Offline-tested incl. hand-verified ascending-triangle/channel-up/symmetrical-triangle/rising-wedge/insufficient-touches cases plus descending-triangle and channel-down via POSITIVE-AFFINE reflection (not negation — see `trendline.py`'s row for why negation silently broke the touch count) (`pylego/triangle_channel_test.py`, 9 cases); real-data smoke test on GBPJPY found all 7 shape types represented (none degenerate/zero), plus a manual OHLC spot-check of one real ascending-triangle instance (a genuine range-bound consolidation with a rising lower support that, in this instance, failed to break up as expected — a legitimate real outcome, not every instance should succeed). | `AnalogML/triangle_channel_scan.py`, `AnalogML/triangle_channel_scan_sweep.py` | ⛔ **null — see the AnalogML row below** |
| **Pattern sweep core (Python, NEW 2026-08-13)** | `AnalogML/pattern_sweep.py` | `run_sweep` — the shared 26-pair-sweep-plus-pooled-calendar-IS/OOS-split harness, extracted once `flag_scan_sweep.py`'s copy was about to get a second near-identical twin (`head_shoulders_scan_sweep.py`) and a third (`triangle_channel_scan_sweep.py`). Needs no per-detector adapter — every AnalogML detector instance (`TouchMotif`, `FlagPennant`, `HeadShoulders`, `TriangleChannel`) already shares the same `confirm_idx`/`direction` field convention, so `run_sweep` just takes the raw `detect_fn`. `flag_scan_sweep.py` refactored to a thin wrapper (regression-checked: identical per-pair numbers before/after). | `AnalogML/flag_scan_sweep.py`, `AnalogML/head_shoulders_scan_sweep.py`, `AnalogML/triangle_channel_scan_sweep.py` | ✅ built |
| **Analog consensus (Python)** | `pylego/analog_signal.py` | `neighbor_consensus` — the "find k causal shape-matched analogs, race both directions from each via `barrier_race.race_trades`, vote on whichever side did better" logic, extracted out of `pattern_scan.py`'s inline loop so `ml_walkforward.py`'s `analog_margin` feature calls the SAME function instead of a second copy (the exact drift PYTHON_LEGO.md exists to prevent). Sits on `shape_match` + `barrier_race`, no third walker. **Extended 2026-08-12:** `AnalogConsensus` now always carries `long_win_rate`/`short_win_rate` (fraction of the k neighbours that were net-profitable in that direction — the honest "probability" a shape-match method can offer; there's no separate "did the pattern complete" concept the way rule-based chart patterns have). `detail=True` additionally populates `.neighbours` — one row per analog (nearest-first): its own historical entry date, `find_analogs` closeness percentile, and its own realized long_r/short_r. Off by default (only `AnalogML/paper_track.py`'s live diagnostic passes it — the per-bar backtest/walk-forward callers don't need the extra list-of-dicts). Offline-tested (`pylego/analog_signal_test.py`, 6 cases incl. a directional-pick check + a detail-mode per-neighbour-row check on synthetic bars). | `AnalogML/pattern_scan.py`, `AnalogML/pattern_scan_sweep.py`, `AnalogML/ml_walkforward.py` (`--with-analog`), `AnalogML/paper_track.py` (`detail=True`) | ✅ built |
| **Strategy-discovery engine (Python, NEW 2026-08-13)** | `forge/` | Candles in → analysis + a frozen, human-readable `StrategySpec` out. Six layers, each importable alone: `bars.py` (causal substrate — HTF resample that DROPS empty weekend bins rather than inventing NaN candles that read as fake FVGs, session/day keys with the trading-day roll as a PARAMETER not a constant, ATR + a `atr_prior` variant for decision-time scaling), `levels.py` (**the level zoo** — 60 kinds / 9 families: PDH/PDL/PDC/daily+weekly opens, classic AND Camarilla pivots on both D1 and W1, volume-profile POC/VAH/VAL plus **naked POCs** carried until traded through, Asia/London session ranges, FVGs, order blocks, confirmed swing liquidity, round numbers — each stamped with when it became KNOWABLE), `events.py` (level interactions as discrete decision points + a causal context vector — the discretisation that makes the problem tractable: ~306k events over 10y gold instead of 3.6M mostly-null bars), `label.py` (per-event ATR-scaled barriers resolved on the real M1 path via `pylego.barrier_race`, net of cost), `discover.py` (~40,000 conditional cells scored with day-clustered robust SEs, Benjamini-Hochberg FDR over EVERY cell examined, and the **random-level null control**), `validate.py` (walk-forwards **the designer** — refits cuts, rescans all cells, reapplies FDR and freezes a spec per fold, then scores it on the next unseen block; testing the procedure, not a strategy). The design bet: a model cannot 'understand' candles and invent a system, but a machine CAN enumerate every named structure + interaction and falsify all of them at once — the intelligence is in the vocabulary and the statistics, and `levels.py` IS the honest ceiling on what can be discovered. **Three lookahead bugs found and fixed before any number was trusted (2026-08-13), each of which produced a BETTER backtest, not a failing one:** (1) `resample` is left-labelled, so an H1 FVG confirmed by the 03:00–04:00 bar was stamped `born=03:00` while its own boundary IS that bar's low — an M15 event fired at 03:15 holding 45 minutes of future price. Same bug in order blocks and swing levels; fixed via `next_open(tf, i)`. (2) swing-structure trend shifted by `pivot_n` instead of `pivot_n + 1`, handing over the open of the confirming bar while that bar's own high/low were part of what confirmed it — worst possible place for it, since `trend` was the most-selected split in the entire search. (3) `pd.merge_asof` result assigned back into a frame still in level-construction order, pairing every event with some OTHER event's trend label. Together these fabricated **+0.37R/trade OOS, t=11.3 over 1,497 trades**; after fixing, the same window gives **+0.010R, t=0.12**. Exposed by the random-level null (random lines scored +0.29R — impossible), then a label-permutation test (which PASSED, correctly localising the leak upstream of the search), then hand-replaying six trades against raw M1. A fourth, non-lookahead bug: naked POCs expired at the END of the period they were tagged in, so events fired on 'naked' POCs already traded through hours earlier — a silent redefinition of the concept being measured. Guarded by `levels_test.py::test_prefix_invariance` (build levels from full history AND from a truncated prefix; any level born inside the prefix must be IDENTICAL — catches lookahead in every family at once, including families added later that nobody wrote a test for) and the same idea over the whole context vector in `events_test.py`. 10 offline tests, synthetic data only. | reads `VolRangeForecaster/data/m1/*.parquet`; imports `pylego.barrier_race`, `pylego.costs`, `pylego.instruments`, `pylego.swing_structure` | ✅ built — **first gold result is a NULL** (see `forge/README.md`) |
| **Analog + walk-forward-ML research (Python, NEW)** | `AnalogML/` | **CORRECTED 2026-08-12: every positive PF/Sharpe/AUC number in this cell was `find_analogs`'s self-adjacency bug (see the `pylego/shape_match.py` row above), not real edge. Full re-validation post-fix, all against real data: 4-pair sweep 46%/50% positive (was 96%/83%), full 26-pair sweep 31%/38% positive (was 100%/96%), `portfolio_sim.py --all-pairs` final equity 0.638x/Sharpe −0.14/max DD −62.9% (was 15.5x/1.39/−26.2%), full `backtest_export.py` (19,815 trades) IS PF=0.94 OOS PF=0.95 cost-off PF=1.01 (was consistently >1), `ml_walkforward.py --with-analog` AUC/IC delta now flat-to-mixed with no consistent direction (was a consistent same-direction improvement on every model/scheme). This specific method (fixed-window k-NN shape matching, frozen window=64/k=20) shows no real repeatable edge — treat everything below as the historical record of what the bug made it look like, not current fact. Honest next move: a structurally different approach (motif/structural-event matching — e.g. N-touches-of-a-level, entry-on-Nth, live partial-pattern matching, per-cluster adaptive SL/TP from that cluster's own MAE/breakout distribution), scoped separately, not further tuning of this null method.** `pattern_scan.py` — walks a sample of historical bars, at each one causally finds its k nearest shape-matched analogs (`shape_match` + `analog_signal`), takes the direction the analogs did better on, scores it with `pylego.barrier_race` (same walker as every SL/TP study), and reports it against a mechanical-both-directions baseline; `scan()` also usable programmatically. `pattern_scan_sweep.py` — robustness sweep across pairs/window/k, plus a non-overlapping-window (stride==window, independent trials) check. `ml_walkforward.py` — trains XGBoost/LightGBM classifiers (`tp_hit` framing, same as `bot/scripts/train_gold_model.py`) + an sklearn `StackingRegressor` on price/vol-derived features, walked forward with `pylego.walkforward` (expanding AND rolling); `--with-analog` adds the `analog_margin` feature and runs a real with/without ablation; `--macro-csv` is the (unfilled) plumbing to merge real macro columns in by date. **`pattern_scan.py` / sweep (gbpjpy/eurusd/audjpy/usdjpy H1, sl=20p, cost on):** mechanical baseline flat (PF≈0.83–1.07) throughout; the analog-consensus direction had **profit factor > 1.0 in 23/24 overlapping-window sweep cells (96%) AND 10/12 independent non-overlapping-window cells (83%)**, across every pair and every window(32/64/96)/k(10/20) combination tried — not one lucky setting. Neighbour-margin-vs-outcome AUC still only ≈0.50–0.57 (weak discrimination), so the win reads as DIRECTION SELECTION, not confidence calibration. **Full 26-pair universe check (window=64/k=20, the same setting, every locally-available pair):** **26/26 (100%) positive on the overlapping check, 25/26 (96%) positive on the independent non-overlapping check** — only eurnzd negative (PF 0.84). Under a true-null baseline (flat PF≈1.0) this many pairs landing the same side is not a chance outcome — real evidence the edge isn't an artifact of the original 4-pair selection. Gold stood out (PF 2.37, n=165, independent check) but is flagged, not led with — smallest sample of the 26 and the multiple-comparisons "best of 26" trap. **`ml_walkforward.py` (gbpjpy H1, 2016→2026, sl=20p, tp_r=1.5, cost on, 38 OOS quarters/scheme):** price-only features are close to null (AUC≈0.51, essentially no discrimination). Adding `analog_margin` (`--with-analog --analog-sample-every 4`) moved AUC/IC in the SAME direction on every model and every scheme — expanding xgboost 0.510→0.532, lightgbm 0.510→0.531, stack IC 0.023→0.069; rolling xgboost 0.512→0.521, lightgbm 0.510→0.520, stack IC 0.013→0.044 — with PF and trade count rising too (expanding xgboost PF 1.09→1.19, n 2,520→4,275). Cadence-sensitive: a coarse `--analog-sample-every 24` smoke test moved AUC by only ~0.001–0.002 (noise), so the effect needs the feature computed reasonably fresh. `portfolio_sim.py` (new) — combines every pair's dated trades into ONE event-driven account (fixed risk-% sized at entry, a hard concurrent-open-risk cap, refusals counted not dropped), the "does the per-trade edge survive being a portfolio" gate. Tracks TIME-WEIGHTED average concurrent-risk utilization and reports TWO benchmarks: A) same risk_pct as the portfolio, uncontrolled utilization (the original, confounded comparison — a single pair almost never nears the concurrency cap, so it under-deploys capital relative to the portfolio); B) risk_pct scaled per pair so its OWN average utilization matches the portfolio's exactly — the fair comparison. **Result (26 pairs, 3yr, 1% risk/trade, 5% cap): portfolio avg utilization 0.5%, Sharpe 1.39, max DD −26.2%.** Three single pairs matched to that same 0.5% utilization (benchmark B): audcad Sharpe 0.29/DD −38.6%, audchf Sharpe 1.28/DD −22.7%, audjpy Sharpe 0.74/DD −45.8% — **the portfolio beats every matched single pair on Sharpe and has a shallower drawdown than two of three: a real, controlled diversification effect**, not the capital-deployed illusion benchmark A showed. (Raw headline number for context, not a return forecast: final equity 15.5x, a mechanical artifact of ~1,953 trades compounding at fixed 1% risk over 3yr; the concurrency cap also skipped 3,975/5,928 raw signals — 67% — so this tests only the signal that fit the cap.) Everything here is still: unoptimised hyperparameters, a handful of pairs tuned in detail (not the full 29), one sl/tp cell, no realistic execution/slippage/swap modelling — real first reads, strengthened by the sweep/ablation/portfolio sim but not validated edges. `paper_track.py` (new) — the one gap every result above still shares: window/k were chosen looking at aggregate performance over roughly the period being reported, so nothing here is a genuinely blind forward test. Logs what the FROZEN signal calls on each new bar (`AnalogML/data/paper_trades.json`, append-only) and re-races still-`open` trades against newly-arrived bars on later runs to mark `tp`/`sl`/genuine-`timeout`, via the same `pylego.barrier_race` walker — never touching the frozen params based on what comes back. **This sandbox cannot reach live data (confirmed, not assumed — a direct `curl` to OANDA gets a 403 policy denial from the outbound proxy)**, so it currently reads the same static local parquet snapshot as everything else. The scan→resolve→scan mechanism is verified via `--as-of` historical replay (logs an open trade using only data up to a cutoff, then a second run with fuller data correctly resolves it using genuinely-later bars — proven with a real GBPJPY SELL: logged open as-of 2026-04-01, resolved as an SL hit −1.05R once 2026-05-21 data was visible) — a correctness proof, not a forward result. Seeded `paper_trades.json` with 25/26 pairs' genuinely-open signals as of the snapshot's end. **Wired for Railway (2026-08-11):** `refresh_m1.py` (new) incrementally tops up each pair's local parquet from OANDA (reuses `fetch_m1_oanda.py`'s `fetch_chunk` + `pylego.instruments.oanda_symbol`, writes back in the exact schema every AnalogML script already reads); `--refresh-data` runs it before scanning; the trade log now persists to Cloudflare R2 (`R2_ACCESS_KEY`/`R2_SECRET_KEY`) instead of local disk when configured, since Railway wipes local disk on redeploy; `AnalogML/paper_track_loop.sh` (hourly, wrapped by `restart_bot` in `start.sh`) is the new supervised process. Still needed before this is a trustworthy live loop: the R2/OANDA credentials found hardcoded in 4 files (fixed separately, see the security-fix commit) need rotating and Railway's env vars updated to match. **Surfaced on the dashboard (2026-08-12):** `compute_shape_state`/`save_shape_state` (new) export the CURRENT window's shape + neighbour-consensus (incl. `detail=True`'s top-3 closest analogs) to `AnalogML/data/shape_state.json` (local + R2, same pattern as the trade log) each run; `server.js` serves it + the trade log at `GET /api/analogml/shape-state` / `GET /api/analogml/paper-trades`. `today.html`/`indexv2.html` pair cards show a live sparkline + LONG/SHORT/FLAT lean chip + win rate, with an expandable "closest historical analogs" table (date, closeness percentile, that occurrence's own R in the lean direction) — clearly labelled research/not-a-validated-signal. `bot-config.html` gets a new AnalogML tab (open/closed paper trades) as the landing spot if this is ever promoted to a real bot. `backtest_export.py` (new) — the house-standard results card, exported: runs the FROZEN window=64/k=20 setting across all 26 pairs, full history, and writes `AnalogML/data/backtest_export.json` with per-trade R **and MAE from the real bar path** (capped at the fixed SL — the exit bar's full H1 range can overshoot the SL price on a big wick, but the position closes exactly at the touch, so uncapped MAE would overstate real risk), a calendar IS/OOS split (cutoff 2023-01-01, honestly flagged on the page as a stability check across two periods, NOT a blind holdout — window/k were chosen by the sweep looking at roughly this same OOS window), and cost-on-vs-off. Consumed by **`analogml-backtest.html`** (repo root, self-contained, dark theme, no live backend — Python-only signal, no JS port yet) — IS/OOS + cost-sensitivity cards, per-pair table, and the 3 house-standard CSV export buttons in the exact schemas (`Date,Return %,MAE %` / `date,R,MAE (R)` / `Trade Date,PnL ($),Risk ($)`), account size ($10,000) and R-unit (fixed 20-pip stop, not vol-scaled) stated next to the buttons per convention. Linked from `hub.html`'s Macro Research group. | reads `VolRangeForecaster/data/m1/*.parquet`; imports `pylego.shape_match`, `pylego.analog_signal`, `pylego.walkforward`, `pylego.trade_stats`, `pylego.barrier_race`, `pylego.costs`, `pylego.instruments`; served by `server.js` (`/api/analogml/shape-state`, `/api/analogml/paper-trades`) to `today.html`, `indexv2.html`, `bot-config.html` | ⛔ **null banked 2026-08-12** (fixed-window k-NN shape matching, window=64/k=20, self-adjacency-bug-corrected: full 26-pair sweep 8/26 positive, portfolio Sharpe −0.14, backtest OOS PF=0.95 — see correction note above). Bricks stay (`shape_match`/`analog_signal` are pure, tested, and the fix is real); dashboard cards/tab kept as infrastructure, relabelled research-not-signal; structural-motif alternative scoped, not yet built. **Phase 2/3 built 2026-08-12:** `pylego/swing_structure.py` + `pylego/motif_touch.py` (rows above) + `AnalogML/motif_scan.py` (the evaluation CLI, same baseline/signal/race_grid pattern as `pattern_scan.py`). First read (4 pairs — gbpjpy/eurusd/audjpy/usdjpy H1, 3yr, sl=20p, cost on, AFTER the lookahead-lag bug above was found and fixed): signal profit factor beat the mechanical both-directions-at-the-same-opportunities baseline on every pair at tp_r=1.5 — gbpjpy 1.00→1.04, eurusd 0.95→1.40, audjpy 0.99→1.32, usdjpy 0.92→1.19 — and held up across every tp_r cell tested (1.0/1.5/2.0/3.0), not just one. **Explicitly NOT yet a validated edge** — this is the same single-slice stage `pattern_scan.py`'s original "first read" was at before the 4-pair sweep, 26-pair universe check, portfolio sim, and (critically) the bug that turned out to explain almost the whole thing. Next honest steps before trusting this: a non-overlapping/independent-trial check, the full pair universe, a real bug-hunt pass beyond the one lag issue already caught (CLAUDE.md's "Mandatory Bug Review" — assume more bugs, don't assume this is clean because one was found and fixed), and only then a portfolio simulation. **Full 26-pair sweep + calendar IS/OOS split (2026-08-12, same day):** window=64/k=20-equivalent frozen params (`pivot_n=5, tol=1.2xATR, min_retrace=2.5xATR, min_gap=10 bars` — the JS engine's untouched defaults, not tuned on this data) run across all 26 pairs, 3yr: **20/26 pairs (77%) signal PF>1.0, 25/26 (96%) beat the mechanical baseline** — a materially broader/stronger first read than the k-NN method ever showed even before ITS bug was found. Six pairs negative (eurgbp, gbpchf, audcad, usdcad, gbpcad, euraud), named not hidden. Calendar IS/OOS (cutoff 2023-01-01, all 26 pairs pooled): **IS n=19,240 PF=1.18 → OOS n=9,183 PF=1.16** — minimal decay, the opposite signature of an overfit result; OOS cost-off PF=1.24 (survives real costs). Still not portfolio-tested (task pending) and still just one sl/tp-r cell — genuinely promising, not yet validated. **Live tracking built (2026-08-12):** `AnalogML/motif_track.py` (new) — forward-tracks the frozen signal the same way `paper_track.py` did for the retired k-NN method (same R2+disk persistence, `--as-of`/`--refresh-data` flags, `resolve_open_trades` via the shared barrier walker) PLUS a new live "what's forming right now" diagnostic (`compute_motif_state`): whichever touch-run is currently in-progress per pair, distance to the level, a `provisional` flag when the last touch is still within `pivot_n` bars of "now" (not yet actually confirmable — a live system that skipped this would show phantom setups), and "confidence" = the REAL historical played-out-rate/PF/avg-R for that exact (n_touches, is_top) category on that pair (never a fabricated per-instance probability). **Bug found and fixed before shipping (2026-08-12):** the first version logged every motif in the pair's ENTIRE history as "new" on the first run (28,524 signals in one run) because it re-scans full history each call with no cadence bookkeeping; fixed with a per-pair watermark (seeded at "now" with nothing logged on a fresh pair, same never-backfill contract as `paper_track.py`) — verified with a 3-step `--as-of` replay (0 signals / 0 signals / 83 signals-in-the-gap, then resolve+continue). Separate log/state files (`motif_trades.json`/`motif_state.json`, R2 keys `analogml/motif_trades.json`/`analogml/motif_state.json`) — does NOT touch the retired method's `paper_trades.json`/`shape_state.json`, which stay as its historical record. `server.js` serves both at `/api/analogml/motif-state`/`/api/analogml/motif-trades`. **Dashboard swapped, not duplicated:** `today.html`/`indexv2.html` pair cards now show the motif diagnostic (touch count, side, distance-to-level, provisional flag, historical confidence) in place of the retired shape-match sparkline; `bot-config.html`'s AnalogML tab now reads the motif trade log (added a Pattern column) instead of the k-NN one. `AnalogML/motif_track_loop.sh` (hourly, wrapped by `restart_bot` in `start.sh` alongside the still-running `paper_track_loop.sh`) is the new supervised process. **`flag_scan.py`/`flag_scan_sweep.py` — flags/pennants, the first additional shape family beyond touches, banked null 2026-08-12 (same day, own branch):** the owner's full "shape prediction" ask (every geometrically-defined shape family in `js/patternEngine.js`, each with a before/during/after lifecycle, multi-timeframe agreement study, and adaptive per-cluster SL/TP) names flags/pennants as the first family to try after touches, per its own suggested minimal-DOF-first build order. `pylego/flag_pennant.py` (row above) regenerates `detectFlagsPennants` fresh from the JS spec, reusing `pivot_highs`/`pivot_lows` rather than a third pivot-detection copy; `AnalogML/flag_scan.py` is the single-pair evaluation CLI (same baseline/signal/race_grid harness as `motif_scan.py`); `AnalogML/flag_scan_sweep.py` (new) is a committed 26-pair-sweep-plus-pooled-calendar-IS/OOS-split script, since motif's own sweep wasn't checked in as a script — filling that gap for reproducibility. **Explicit bug-hunt before trusting any number (CLAUDE.md's mandatory review):** the confirmability-lag class of bug that hit `motif_touch.py` does NOT apply here by construction — each consolidation-window candidate re-slices bars and re-runs `pivot_highs`/`pivot_lows` on just that slice, so a window's last pivot is always at least `consol_pivot_n` bars before the window's own end (the same lag `motif_touch.py` had to add a manual fix for falls out of this construction for free); a regression test plus the real-data smoke test assert `pole_start_idx < pole_end_idx < consol_end_idx < confirm_idx` on every instance found. 8/8 offline tests pass (hand-verified bull-flag/bull-pennant/failure/mirrored-bear-flag/no-consolidation/no-pole cases, each cross-checked against the already-tested pivot bricks before being baked into an assertion); a real-data spot-check on GBPJPY (one instance's actual OHLC path: a clean 108-pip pole, 43-bar consolidation retracing 33.5%, confirmed continuation breakout) confirmed plausible geometry before any aggregate number was trusted. **Result: null, and it stayed null under every variant tried.** Full 26-pair sweep (H1, JS-engine-untouched default params, sl=20p, tp_r=1.5, cost on): **6/26 pairs (23.1%) signal PF>1.0, 9/26 (34.6%) beat the mechanical baseline** — named losers: audcad, audchf, audjpy, audnzd, audusd, chfjpy, euraud, eurcad, eurchf, eurgbp, eurnzd, eurusd, gbpaud, gbpchf, gbpjpy, nzdjpy, nzdusd, usdcad, usdchf, usdjpy (20/26); winners were cadjpy (1.01), eurjpy (1.09), gbpcad (1.02), gbpnzd (1.19), gbpusd (1.02), gold (1.06) — no consistent direction, reads like the scatter a true-null baseline produces. Pooled calendar IS/OOS split (cutoff 2023-01-01, all 26 pairs, same cell): **IS n=11,721 PF=0.94 → OOS n=5,362 PF=0.92** — both sides at or below the coin-flip baseline, not a decay pattern, a flat null throughout. Checked whether costs were manufacturing the null: cost-off, same cell, **IS PF=1.00, OOS PF=0.98** — dead flat even with zero cost, ruling out "it's a real edge too small to survive spread." Checked the `tp_r=1.0` cell too: 8/26 (30.8%) PF>1.0, IS PF=0.93/OOS PF=0.94 — same story. Checked whether filtering to ONLY the pole's textbook-expected breakout direction (`played_out=True`, discarding the "failed flag" entries) rescues it, since that's a materially different entry rule, not more tuning of the same one: pooled, sl=20p tp_r=1.5 cost on, **n=9,503, PF=0.95, WR=40.5%** — still null. Four independent checks (raw signal, cost-off, a second tp_r cell, the played_out filter), all converging on the same flat-to-negative number, is itself evidence this is a real null and not a fragile artifact of one setting. **Per CLAUDE.md's "Pivot or Pivot" rule:** flags/pennants (this shape family, H1, these frozen params) show no real edge — stating that plainly, not softening it. Bricks stay (`flag_pennant.py` is pure, tested, and reusable regardless); the honest next move for the broader "shape prediction" ask is NOT tuning this method's thresholds further (the same lesson the k-NN method's retirement already taught) but either a different shape family (head & shoulders / triangles-channels are next in `js/patternEngine.js`, both already geometrically defined and un-tried) or a different timeframe (everything AnalogML has built so far, touches included, is H1-only — flags/pennants may behave differently on H4/D1, genuinely untested, not a prediction either way) — owner's call on which, not pre-decided here. **Lifecycle disaggregation (2026-08-13, same branch):** built `pylego/pattern_lifecycle.py` (row above) as the shared DURING-quality scoring brick the owner's fuller ask calls for, then ran the specific cross-tab the owner asked for directly — does touch/bounce COUNT predict breakout direction/magnitude — pooled across all 26 pairs for BOTH existing detectors. **Touches: yes, and it's a real, IS/OOS-confirmed split, not a subset-mining artifact.** n_touches=2 (double top/bottom, n=21,623 pooled): PF=1.24, avg_R=0.133 — n_touches=3 (triple, n=6,800): PF=0.98, avg_R≈0. Checked the standout cell against a genuine calendar IS/OOS split (cutoff 2023-01-01, sl=20p/tp_r=1.5/cost-on, same as every other AnalogML check): doubles IS PF=1.25 (n=14,646) → OOS PF=1.23 (n=6,977) — minimal decay, well past the ≥30-OOS-trade bar; triples IS PF=1.00 (n=4,594) → OOS PF=0.95 (n=2,206) — flat-to-negative both sides. **The touches motif's edge concentrates almost entirely in double tops/bottoms; triples are close to a coin flip.** This sharpens, not overturns, the existing "promising, not yet validated" status — portfolio test and a second full bug-hunt pass are still outstanding — but it's a real, useful refinement `motif_track.py`'s existing per-(n_touches, is_top)-category confidence design already anticipated (see that entry below) even though this is the first time the pooled cross-pair number was actually computed and checked OOS. Also checked (exploratory, NOT yet OOS-confirmed, flagging rather than overclaiming per CLAUDE.md's multiple-testing rule — roughly 20 cells were sliced across both families this pass): shorter-duration touch formations (15-27 bars) show PF=1.30 vs 1.03 for longer ones (41-127 bars) — a real lead, not yet checked against a calendar split. Formation volatility (candle range vs local ATR during the shape) showed no meaningful effect on touches (PF 1.15/1.18/1.19 across terciles — flat). **Flags/pennants: slicing did not rescue the null.** Touch-count buckets from 5 (the minimum) through 9 stay in the same 0.91-1.00 PF band the pooled null already showed (n=532-11,096, real sample sizes); buckets above 9 touches get too sparse to trust (n<40, one cell literally n=8 showing PF=0.20 — noise, not signal, named here so it's not mistaken for one later). Duration and formation-volatility terciles were both flat (PF 0.92-0.94 throughout, no ordering). Retrace depth showed a mild monotonic lean (shallow retrace PF=0.89 → deep retrace PF=0.97) but every cell stayed below 1.0 — a lead worth a real IS/OOS check if this family is ever revisited, not a rescue of the current null. **Head & shoulders + triangles/wedges/channels built and evaluated (2026-08-13, same branch):** `pylego/head_shoulders.py` and `pylego/triangle_channel.py` (rows above) — the second and third additional shape families beyond touches, both regenerated from already-validated JS specs (`detectHeadShoulders`, `detectTrianglesChannels`), completing every named pattern in the owner's retail reference image except cup & handle (no existing spec anywhere in this repo — flagged, not invented). **Head & shoulders: a real lookahead bug was caught and fixed BEFORE the first sweep was trusted** — the same bug class that hit `motif_touch.py`, but bigger (42.6% of pooled confirmed instances changed confirm_idx/direction after the fix, vs `motif_touch`'s 15.3%). The UNFIXED sweep read 21/26 pairs (80.8%) PF>1.0, IS PF=1.13→OOS PF=1.14 — a strong-looking result that was **entirely the bug**, the same shape of false positive the k-NN method's self-adjacency bug produced. **After the fix: null.** 8/26 pairs (30.8%) PF>1.0, 13/26 (50.0%) beat baseline; pooled IS PF=0.98→OOS PF=0.95 (cost on), cost-off IS PF=1.06→OOS PF=1.01 — flat-to-negative both ways, both cost settings. **Triangles/wedges/channels: null from the first sweep**, no bug found (checked explicitly — this detector's construction is immune to the confirmability-lag class by design, see its row above). 7/26 pairs (26.9%) PF>1.0, 13/26 (50.0%) beat baseline; pooled IS PF=0.97→OOS PF=0.90. Disaggregated by shape type before accepting the pooled null (CLAUDE.md: "pooled nulls hide subset edges — disaggregate before declaring null"): all 7 types read at or below breakeven except symmetrical_triangle (PF=1.07, n=212 — small sample, and the one type with no directional expectation to begin with, so a mild positive read here isn't a coherent "textbook direction predicts outcome" edge the way the others would be) — no hidden winner. **Three shape families now built (touches, flags/pennants, head & shoulders) plus triangles/wedges/channels; touches remains the only one with a real (not yet portfolio-validated) positive first read** — everything else tried since is null, reported as plainly as touches' positive read was. **Flags/pennants, a fifth check (2026-08-13):** owner asked why a pattern this widely used by retail traders would show no edge — raced every eligible instance through its OWN pattern-derived stop/target (0.5x/1.0x the pole's measured move, `js/patternEngine.js`'s own `computeOutcome` default, not the flat 20-pip stop every check above used) instead of a fixed stop: pooled 26 pairs, n=17,083, PF=0.96, WR=33.3% — still null, ruling out "the fixed stop specifically killed a real edge." Multi-timeframe confluence, other timeframes, and fuzzy/discretionary pattern recognition remain untested, not proven null. **Sixth/seventh checks — the exact mechanics of a retail reference image the owner supplied (2026-08-13):** retest-of-breakout entry (wait up to 20 bars for price to pull back to the broken trendline before entering, not chase the breakout bar) — 57.1% of instances retested; measured-move stop/target on those: n=9,724, PF=0.97, still null. Trend-context filter (`classify_swing_structure` — only count flags whose pole continues an ALREADY-established trend, the "impulsive wave, flag=corrective wave" framing the image showed): trend-aligned n=2,470 PF=0.95 vs not-aligned n=7,254 PF=0.97 — aligned subset was marginally WORSE, no rescue. Four honest entry variants now tested (fixed stop, measured-move, measured-move+retest, measured-move+retest+trend-context), all null. **H4 check (2026-08-13):** owner's reference images specifically showed H4/H8, so re-ran `flag_scan_sweep.py --timeframe 4h`, same frozen params. First read looked real — 20/26 pairs (76.9%) PF>1.0, IS PF=1.10→OOS PF=1.07 — but only 15/26 (57.7%) actually beat the mechanical baseline, because a flat 20-pip stop is a much tighter relative risk unit on H4 bars than H1, inflating BOTH signal and baseline (gbpjpy's zero-signal baseline alone read PF=1.23). This is a live example of exactly the timeframe-normalization problem the owner's original ask named ("MAE/TP need to be normalized... so this shape on H4 and the same shape on M15 are comparable"). Re-tested with the timeframe-scaling measured-move stop/target (proportional to each pattern's own size, not a fixed pip count): signal PF=1.02 vs baseline PF=1.00, IS PF=1.02→OOS PF=1.04 — flat both sides. **Flags/pennants on H4: also null**, same conclusion as H1, once measured with a risk unit that doesn't accidentally favor the timeframe. **Touches portfolio-level test (2026-08-13) — the outstanding validation debt flagged since the first read, now closed:** extracted `pylego/portfolio_sim.py` (row above) as a shared Tier-1 brick from the k-NN method's `AnalogML/portfolio_sim.py` (9 new hand-verified tests; that engine had none before, only exercised indirectly) and built `AnalogML/motif_portfolio_sim.py` on top of it — same event-driven single-account simulator, same two-benchmark methodology (A: uncontrolled utilization, confounded; B: matched utilization, the fair comparison), zero second implementation. **Full touches signal, 26 pairs, 1% risk/trade, 5% concurrent-risk cap: Sharpe 1.61, max DD −55.1%, avg utilization 2.7%** (37.2% of raw signals refused by the risk cap, reported not dropped); avg pairwise weekly-return correlation +0.012 — close to independent, a genuinely favorable diversification starting point for FX pairs that share currency legs. **Doubles-only (n_touches=2, the disaggregation-confirmed sharper subset): Sharpe 2.27, max DD −31.8%** — BOTH higher Sharpe and shallower drawdown than the diluted full signal, consistent with the earlier finding that triples add noise, not value. Benchmark B (3 sample pairs matched to the portfolio's own utilization): audchf survives at Sharpe 1.08–1.28; audcad and audjpy, scaled to the SAME total risk a single pair would need to match the portfolio's utilization, go to **−100%/−99.4% drawdown (ruin)** — the portfolio, spreading that identical total risk across 26 pairs, does not. That gap is the real, controlled diversification effect, not a capital-deployed illusion. (Headline equity multiples — 46,274x / 2,548,954x — are mechanical compounding artifacts over ~10.5 years at fixed 1% risk with 1,000+ trades/pair, same caveat the k-NN method's own headline number needed; not a return forecast.) **Still outstanding before this is a validated edge:** only one bug-hunt pass has been done on `motif_touch.py` (CLAUDE.md: assume more bugs exist, don't assume clean because one was caught — flags/pennants and head & shoulders both got adversarial variant-testing this session that touches hasn't yet had); sizing here is fixed-%, not vol-scaled per pair; mark-to-close only, no intra-trade floating equity; risk-pct/cap parameters (1%/5%) are inherited unoptimised from the k-NN method's original defaults, not tuned for touches specifically (deliberately — avoids a new overfit risk, but also means they aren't validated as good choices for this signal). Genuinely the strongest result so far in this build, and still not the finish line. **Second bug-hunt pass on `motif_touch.py` (2026-08-13):** re-read the full detector source fresh; empirically verified the causal invariant at FULL SCALE (not just the synthetic regression test — the same class of check that caught the H&S bug, which a synthetic test alone missed): **28,524 confirmed motifs across all 26 pairs, 0 causal-invariant violations.** Checked touch-run duration realism (median 0.8 days, p99 2.4 days, max 3.4 days on GBPJPY — realistic, contained formations, no degenerate multi-year "double tops"). Confirmed no same-side double-counting (structural, via the run builder's index advancement) and correct entry/exit date ordering (structural, via `race_trades`' forward-only exit scan). **No new bug found this pass** — reported plainly as a real but bounded result, not proof of permanent cleanliness. Pattern-lab honest-validation layer, first read (2026-08-12):** `js/patternEngine.js`/`pattern-lab.html` (a SEPARATE, older, already-shipped JS system — flags/pennants/head-and-shoulders/double-triple-tops/triangles-channels-wedges, 17 shape sub-types, MFE/MAE per instance) was AUDITED and confirmed to have **zero cost model and zero calendar IS/OOS split anywhere** — everything pooled over full history. `AnalogML/scripts/export_pattern_lab.mjs` (new) calls the JS detectors directly (no server, no redetection) and dumps instances to JSON; `AnalogML/pattern_lab_validate.py` (new) applies real costs (`pylego.costs.default_spread`, same convention as `pylego.barrier_race`'s cost-as-R-multiple) and a real 2023-01-01 IS/OOS split. **GBPJPY, all types pooled: IS PF=1.12 → OOS PF=1.11** (small but real, survives costs). Disaggregated by type (n_oos≥30 only — smaller cells are noise, e.g. `descending_triangle` OOS PF=0.07 on n=6): `double_top`/`double_bottom` are the standout, strong AND IS→OOS-consistent (1.34→1.71, 1.25→1.30) — independent confirmation, from a completely different engine, of the same shape family `motif_touch.py` already validated. `bull_flag` mild positive both sides. `bull_pennant`/`bear_flag`/`inverse_head_shoulders`/`triple_top` decay from decent IS to sub-1.0 OOS — the overfitting signature. One pair only — next step is the same multi-pair sweep ladder every other AnalogML check went through before anything here is trusted. **Genuine walk-forward, replacing the single 2023 cutoff (2026-08-12, `AnalogML/motif_walkforward.py`):** the touch-motif's earlier "IS PF=1.18→OOS PF=1.16" was one fixed split, not a walk-forward. Rebuilt as 11 consecutive calendar-YEAR folds (2016–2026, all 26 pairs pooled per fold): **11/11 folds PF>1.0 (cost on), 11/11 beat baseline** — 2025 is the weakest year (PF 1.04) but still positive, the opposite of the "one lucky split" failure mode. Explicit cost sensitivity (all folds pooled, n=28,423): **PF cost-ON=1.174, PF cost-OFF=1.259** — costs remove 0.085 PF, a real but survivable drag. **Portfolio-level test (2026-08-12, `AnalogML/motif_portfolio_sim.py`, reusing `portfolio_sim.py`'s account simulator verbatim):** 26 pairs, 1%/trade, 5% concurrent cap, 17,858/28,423 signals taken. **Sharpe 1.61, max DD −55.1%, avg pairwise weekly-return correlation +0.012** (near-independent bets). Matched-utilization benchmark: 2 of 3 sampled single pairs (audcad, audjpy) hit **−100% max DD (total ruin)** at the portfolio's own 2.7% utilization; the portfolio drew down only −55.1% at that same utilization — the real diversification effect. (Raw total-return figures from this sim are a fixed-fractional-compounding artifact over 17,858 trades, not a return forecast — Sharpe/DD/utilization are the numbers to read.) **The 6 originally-negative pairs, investigated (2026-08-12):** no detector malfunction (played-out rate/touch mix/top-bottom split all statistically indistinguishable from positive pairs); spread-cost burden unremarkable except eurgbp (spread/ATR 12.6% vs 4–9% typical); all six track the SAME year-by-year shape as the full 26-pair pool (strong 2016–2020, soft 2024–2025) — reads as cross-sectional noise around a shared weak recent stretch, not six broken pairs, EXCEPT **audcad and usdcad, which remain clearly negative in the most-recent (2026) fold specifically** and warrant continued monitoring; gbpchf/euraud/gbpcad/eurgbp are now near-breakeven-to-positive in the most recent fold. **Dashboard checked against merged code (2026-08-12):** `today.html`/`indexv2.html`/`bot-config.html` on `main` (PR #1216, commit `181e1b50`) DO call `/api/analogml/motif-state`/`/api/analogml/motif-trades`, not the retired k-NN routes — confirmed by direct grep, not assumed. A user report of still seeing the old signal on the live Railway site is therefore a deploy-lag/live-data question, not a stale-code one — unverifiable from this sandbox (Railway blocked by the outbound proxy); still open pending the user looking at the live site. **Root cause found (2026-08-12), from a user screenshot of `indexv2.html`'s per-instrument DRILL-DOWN view ("The Board"):** the PR #1216 swap only reached `renderCards()`'s compact multi-pair grid (`analogShapeHtml`, line ~1416) — the separate single-instrument drill-down grid (`renderDrill()`) still only had the OLD `js/patternEngine.js`-based "Pattern Match" `dcard` with no motif card next to it, even though `d.analogml` was already being loaded into the same per-instrument row object (`analogmlByPair` at line ~1075) that both render paths share. Not a deploy-lag issue after all — a real incomplete-swap gap in this repo. Fixed: added a "Structural Motif (AnalogML)" `dcard` to `renderDrill()`'s grid, directly before "Pattern Match", reading the same `d.analogml` field (current touch-run, distance to level, historical played-out-rate/PF) plus a one-line pointer to the walk-forward record above. `today.html` has no equivalent drill-down view (card-grid only), so it didn't have this gap. **Phase 1 built (2026-08-12), `AnalogML/motif_adaptive.py`:** the original brief's MAE-based stop / historic-breakout TP, deferred until the detector proved it had something to size risk around (it did — 11/11-fold walk-forward + portfolio test above). New `pylego.barrier_race` bricks (`VariableEntry`, `race_trades_variable`, `excursion` — 7 new unit tests, 21/21 passing) let each trade carry its OWN sl/tp instead of a shared grid cell. Per-category (n_touches × is_top) SL/TP sized from that category's own historical MAE/MFE, ATR-scaled, causal (only same-category precedent strictly before that trade, pooled across all 26 pairs, expanding window). **A real bug found before trusting anything:** sizing off the full 200-bar race horizon produced ~11x-ATR (~220-pip) stops that diluted the signal into mark-to-close timeouts (adaptive avgR +0.006 vs frozen +0.110, 2-pair smoke test) — fixed by bounding the excursion window to the breakout's own horizon (`--excursion-bars`, default 40) instead of the full race horizon. A 6-cell percentile sweep (same 2 pairs) then found SL/TP both at p50 clearly ahead of the other cells. **Full 26-pair confirmation, same 28,223 motifs raced both ways: adaptive PF=1.227/avgR=+0.115 vs frozen-grid PF=1.174/avgR=+0.098 — a real, +17% relative avg-R improvement, but fold consistency is only 6/11 (not the entry signal's own 11/11)**, concentrated in a few standout years (2018/2020/2022/2025) with several folds flat-to-slightly-worse (2017/2019/2023/2024/2026) — a real but modest win, not a decisive one. Per-category sizing is now sane (2-touch: SL≈36-37p/2.3xATR, TP≈49p/3.1xATR, ~1.3:1 reward:risk; 3-touch: SL≈41-45p/2.7-2.8xATR, TP≈42-43p/2.7xATR, ~1:1) — a real structural difference between 2- and 3-touch motifs, not noise. **Portfolio-level test (2026-08-13), `AnalogML/motif_adaptive_portfolio_sim.py`:** a 3-pair smoke test looked like a clean win (adaptive Sharpe 1.68 vs frozen 1.31, max DD −18.8% vs −26.3%, MORE capital deployed not less) — **the full 26-pair confirmation walked that back.** Same 28,223 motifs raced both ways: adaptive Sharpe=1.86/max DD=−68.6%/util=3.6% (n taken=11,829) vs frozen-grid Sharpe=1.58/max DD=−54.5%/util=2.7% (n taken=17,688). **Sharpe genuinely improves but max drawdown is materially WORSE** — adaptive's wider SL/TP (36-49p vs frozen 20p/30p) holds trades longer, overlaps more, hits the 5% concurrent-risk cap far more often (16,394/28,223 skipped vs 10,535/28,223), concentrating risk in fewer, larger positions. A real trade-off, not a decisive win — the opposite of the small-sample read. Diversification itself still holds regardless of sizing method (matched-utilization single pairs: audcad −99.9%/audchf −88.6%/audjpy −86.9% max DD, all worse than either portfolio). Not yet done: a percentile ablation (e.g. tighter SL at p25/p35) to see if the drawdown cost can be traded back down before this replaces the frozen grid as the default. **True multi-timeframe agreement analysis (2026-08-13), `AnalogML/motif_multi_tf.py`:** answers a question open since the original scoping conversation ("if higher timeframes have a bullish pennant and lower timeframes have bearish, what happens"), confirmed absent everywhere else (`js/patternEngine.js`'s HTF flag is single-level, unaggregated; nothing in the Python motif chain looks past its own timeframe). Detects the SAME touch-motif on H1 and independently on 4H/1D, buckets each H1 entry by whether the most recently CONFIRMED HTF motif (causally known by that entry's own time, within a lookback window) agrees, conflicts, or is absent. **A real lookahead bug caught before running anything:** a resampled bar is labeled by its START, so cutting off against that timestamp could let a still-forming HTF bar leak into a decision made mid-bar — fixed by deriving each bar's actual END time and cutting off against that. **A real reversal between small and full sample:** 2-pair smoke test suggested 4H mattered (AGREE PF=1.29 vs CONFLICT 1.19) and 1D didn't (1.20 vs 1.25, reversed) — **the full 26-pair confirmation found the opposite**: 4H shows no separation (PF 1.19 vs 1.18, a wash), **1D shows a real gap (PF 1.24 vs 1.09, avg R +0.133 vs +0.055 — CONFLICT trades' edge drops to less than half of AGREE's)**, fold-consistent 7/11 years. CONFLICT stays net positive (not reversed), reading as "1D agreement adds conviction, 1D conflict is a reason to size down," not a hard filter. NONE (no fresh HTF read) is the majority bucket (~70-76%) in both splits — a real constraint on how often this could apply live. **Percentile ablation, resolving the drawdown cost (2026-08-13) — DEFAULT CHANGED to (35,35).** 8-pair sweep at the PORTFOLIO level found (35,35) clearly ahead of every other cell tried; full 26-pair confirmation, same motifs: **adaptive (35,35) Sharpe=2.31/max DD=−41.8% vs frozen-grid Sharpe=1.58/max DD=−54.5%, at MATCHED utilization (2.7% both)** — beats the frozen grid on BOTH Sharpe and drawdown now, no trade-off. Trade level barely moves (PF 1.212/avg R +0.110 vs (50,50)'s 1.227/+0.115) but fold consistency improves (8/11 vs 6/11). (35,35) is now the default in both `motif_adaptive.py` and `motif_adaptive_portfolio_sim.py`. **HTF-conflict-aware position sizing (2026-08-13), `AnalogML/motif_htf_sized.py`:** the natural integration of the 1D-conflict finding — keep every trade, size DOWN (0.5x) on a 1D conflict rather than skip (CONFLICT stays net positive). `portfolio_sim.py`'s `simulate_portfolio` extended with an optional per-trade `size_mult` (default 1.0, every other caller unaffected). Isolates ONE new variable on top of the already-validated frozen-grid entry signal, deliberately not stacked with the adaptive SL/TP. 3-pair smoke test looked like a wash (Sharpe 1.26 vs 1.32) — **full 26-pair confirmation found a real win**: HTF-sized Sharpe=1.80/max DD=−42.9% vs uniform-sizing Sharpe=1.61/max DD=−55.1%, at matched utilization (2.6%/2.7%), 4,168/28,423 (14.7%) trades downsized. Not yet done: an in-progress/provisional HTF read, and testing adaptive SL/TP + HTF-conflict sizing COMBINED (deliberately kept separate so far to isolate each variable). **The combination test (2026-08-14), `AnalogML/motif_combined_portfolio_sim.py`:** the deferred COMBINED item, now done — a pure composition layer (imports `collect_pair_motifs`, `htf_lean_at`, and the shared `simulate_portfolio` verbatim; modifies neither parent script) racing the SAME 28,223 motifs through the full 2x2 (frozen/adaptive SL-TP x uniform/HTF-sized), so each delta isolates one mechanism. **The gains stack**: combination Sharpe=2.45/max DD=−38.7% beats the best single mechanism (adaptive alone: 2.31/−41.8%) at matched utilization; each single-mechanism arm reproduces its parent's separately-computed numbers (frozen 1.58 vs 1.61, HTF-sized 1.79/−42.9% vs 1.80/−42.9%, adaptive 2.31/−41.8% exact) so the composition is faithful, not a drifted re-implementation. The 3-pair smoke test read the OPPOSITE ("no stack") — the 5th small-sample read overturned at 26-pair scale in this build. Inherits both parents' open caveats (one percentile cell, conflict-side sizing only, mark-to-close sim); the tracked live signal (`motif_track.py`) stays frozen-grid — this informs the manual-execution sizing notes the Telegram alert already shows. See `AnalogML/README.md` for the full table. **Backtest export + viewer, extended to the standard quant results-card set (2026-08-14), `AnalogML/motif_combined_backtest_export.py` / `motif-combined-backtest.html`:** the house `backtest_export.py`/`analogml-backtest.html` pattern (per-trade JSON, no backend port) applied to the combination — trade log with entry/exit/stop/target prices, click-to-chart on real OANDA candles (`lightweight-charts`, same pattern as `pattern-lab.html`'s overlay, via the existing generic `/api/ohlc-range` — no new server.js route). Extended the SHARED `pylego/portfolio_sim.sharpe_and_dd` (not a local copy — every existing caller unaffected, 17/17 tests including 7 new ones still pass, `motif_htf_sized.py` re-run standalone to confirm) with Sortino, CAGR, Calmar, max-drawdown-duration and skew; added `daily_equity_series` (the exact daily series the stats are computed from, extracted so a chart never silently drifts from the numbers) and `monte_carlo_bootstrap` (trade-based bootstrap, WITH replacement, fixed-seed — the MultiCharts/TradeStation-style check, not a price-path sim) as new shared bricks. Portfolio table now shows all four arms across the full set; equity curves for all four overlaid on a log-scale chart (fixed-% compounding over 20-28k trades makes linear scale useless); Monte Carlo panel for combination vs baseline. CAGR/Calmar and the Monte Carlo final-return bands inherit the same runaway-compounding inflation as total_return already had (quadruple-digit CAGR, trillions-of-% MC bands) — explicitly caveated on the page as relative-ranking numbers, not an absolute forecast; the MC max-drawdown bands are the bounded, trustworthy half. **Portfolio-level IS/OOS split (2026-08-14), same export/page:** the trade-level IS/OOS split (PF/avg R) already existed since the first version of this export; this extends it to the full portfolio stat set. `portfolio_arm_with_is_oos()` re-runs the SAME `portfolio_arm()` pipeline independently on each calendar-split subset (each starts its own fresh account, not a slice of the pooled curve) -- Sharpe/Sortino/CAGR/Calmar/max DD/equity curve/Monte Carlo, all now available IS-only and OOS-only per arm. **Result: holds up reasonably well, with one honest caveat** -- Sharpe decays 2.50 (IS) to 2.30 (OOS), similar magnitude to the trade-level PF decay (1.23->1.18), not a collapse; but **the worst drawdown of the entire 10-year run (-38.7%) occurred WITHIN the OOS window** (IS-only max DD was -35.3%) -- surfaced explicitly on the page, not smoothed over by the pooled number alone. **Cost sensitivity (2026-08-14), same export -- direct ask ("will costs kill this trade"):** every 'r'/'bench_r' number already had the modeled round-trip spread subtracted from day one (`pylego.costs.default_spread`: 0.8p FX majors/1.0p JPY crosses/$0.30 gold); this adds the explicit side-by-side every other AnalogML export already shows. SAME entry/stop/target re-raced with cost_price=0.0 (`r_nocost`), both trade-level (PF 1.29->1.21, avg R 0.147->0.110) and portfolio-level (Sharpe 3.29->2.45, max DD -34.5%->-38.7%) -- a real, substantial drag (~25% off Sharpe), the edge clearly survives it. Flagged on the page: the spread model is flat per-asset-class, not recalibrated per pair or session, so it likely understates real cost on thinner crosses (GBPNZD/EURNZD-style) and during news/low-liquidity windows -- a lower bound on real cost, not an upper one. **Telegram alerts (2026-08-13), `AnalogML/motif_track.py --telegram`:** the "leave it as a signal, alert when a trade is building" decision — a human-facing alert with SL/TP markings, not automated execution. Reads the SHARED dashboard `tg_config` via the new `pylego/telegram.py` brick (row above) — no new credentials needed. One alert per newly-confirmed motif (the existing watermark already guarantees no backfill flood). Shows the TRACKED frozen-grid entry/SL/TP (unchanged — the record everything in this file is judged against never silently drifts) plus the validated adaptive ATR-scaled SL/TP ((35,35) constants, hardcoded not recomputed live) and the 1D HTF agree/conflict read with a size-down note — informational overlay only, neither adaptive number is applied to the tracked trade itself. Opt-in (`--telegram`, off by default), auto-disabled under `--as-of` even if passed. |
| **Analog + walk-forward-ML research (Python, NEW)** | `AnalogML/` | **CORRECTED 2026-08-12: every positive PF/Sharpe/AUC number in this cell was `find_analogs`'s self-adjacency bug (see the `pylego/shape_match.py` row above), not real edge. Full re-validation post-fix, all against real data: 4-pair sweep 46%/50% positive (was 96%/83%), full 26-pair sweep 31%/38% positive (was 100%/96%), `portfolio_sim.py --all-pairs` final equity 0.638x/Sharpe −0.14/max DD −62.9% (was 15.5x/1.39/−26.2%), full `backtest_export.py` (19,815 trades) IS PF=0.94 OOS PF=0.95 cost-off PF=1.01 (was consistently >1), `ml_walkforward.py --with-analog` AUC/IC delta now flat-to-mixed with no consistent direction (was a consistent same-direction improvement on every model/scheme). This specific method (fixed-window k-NN shape matching, frozen window=64/k=20) shows no real repeatable edge — treat everything below as the historical record of what the bug made it look like, not current fact. Honest next move: a structurally different approach (motif/structural-event matching — e.g. N-touches-of-a-level, entry-on-Nth, live partial-pattern matching, per-cluster adaptive SL/TP from that cluster's own MAE/breakout distribution), scoped separately, not further tuning of this null method.** `pattern_scan.py` — walks a sample of historical bars, at each one causally finds its k nearest shape-matched analogs (`shape_match` + `analog_signal`), takes the direction the analogs did better on, scores it with `pylego.barrier_race` (same walker as every SL/TP study), and reports it against a mechanical-both-directions baseline; `scan()` also usable programmatically. `pattern_scan_sweep.py` — robustness sweep across pairs/window/k, plus a non-overlapping-window (stride==window, independent trials) check. `ml_walkforward.py` — trains XGBoost/LightGBM classifiers (`tp_hit` framing, same as `bot/scripts/train_gold_model.py`) + an sklearn `StackingRegressor` on price/vol-derived features, walked forward with `pylego.walkforward` (expanding AND rolling); `--with-analog` adds the `analog_margin` feature and runs a real with/without ablation; `--macro-csv` is the (unfilled) plumbing to merge real macro columns in by date. **`pattern_scan.py` / sweep (gbpjpy/eurusd/audjpy/usdjpy H1, sl=20p, cost on):** mechanical baseline flat (PF≈0.83–1.07) throughout; the analog-consensus direction had **profit factor > 1.0 in 23/24 overlapping-window sweep cells (96%) AND 10/12 independent non-overlapping-window cells (83%)**, across every pair and every window(32/64/96)/k(10/20) combination tried — not one lucky setting. Neighbour-margin-vs-outcome AUC still only ≈0.50–0.57 (weak discrimination), so the win reads as DIRECTION SELECTION, not confidence calibration. **Full 26-pair universe check (window=64/k=20, the same setting, every locally-available pair):** **26/26 (100%) positive on the overlapping check, 25/26 (96%) positive on the independent non-overlapping check** — only eurnzd negative (PF 0.84). Under a true-null baseline (flat PF≈1.0) this many pairs landing the same side is not a chance outcome — real evidence the edge isn't an artifact of the original 4-pair selection. Gold stood out (PF 2.37, n=165, independent check) but is flagged, not led with — smallest sample of the 26 and the multiple-comparisons "best of 26" trap. **`ml_walkforward.py` (gbpjpy H1, 2016→2026, sl=20p, tp_r=1.5, cost on, 38 OOS quarters/scheme):** price-only features are close to null (AUC≈0.51, essentially no discrimination). Adding `analog_margin` (`--with-analog --analog-sample-every 4`) moved AUC/IC in the SAME direction on every model and every scheme — expanding xgboost 0.510→0.532, lightgbm 0.510→0.531, stack IC 0.023→0.069; rolling xgboost 0.512→0.521, lightgbm 0.510→0.520, stack IC 0.013→0.044 — with PF and trade count rising too (expanding xgboost PF 1.09→1.19, n 2,520→4,275). Cadence-sensitive: a coarse `--analog-sample-every 24` smoke test moved AUC by only ~0.001–0.002 (noise), so the effect needs the feature computed reasonably fresh. `portfolio_sim.py` (new) — combines every pair's dated trades into ONE event-driven account (fixed risk-% sized at entry, a hard concurrent-open-risk cap, refusals counted not dropped), the "does the per-trade edge survive being a portfolio" gate. Tracks TIME-WEIGHTED average concurrent-risk utilization and reports TWO benchmarks: A) same risk_pct as the portfolio, uncontrolled utilization (the original, confounded comparison — a single pair almost never nears the concurrency cap, so it under-deploys capital relative to the portfolio); B) risk_pct scaled per pair so its OWN average utilization matches the portfolio's exactly — the fair comparison. **Result (26 pairs, 3yr, 1% risk/trade, 5% cap): portfolio avg utilization 0.5%, Sharpe 1.39, max DD −26.2%.** Three single pairs matched to that same 0.5% utilization (benchmark B): audcad Sharpe 0.29/DD −38.6%, audchf Sharpe 1.28/DD −22.7%, audjpy Sharpe 0.74/DD −45.8% — **the portfolio beats every matched single pair on Sharpe and has a shallower drawdown than two of three: a real, controlled diversification effect**, not the capital-deployed illusion benchmark A showed. (Raw headline number for context, not a return forecast: final equity 15.5x, a mechanical artifact of ~1,953 trades compounding at fixed 1% risk over 3yr; the concurrency cap also skipped 3,975/5,928 raw signals — 67% — so this tests only the signal that fit the cap.) Everything here is still: unoptimised hyperparameters, a handful of pairs tuned in detail (not the full 29), one sl/tp cell, no realistic execution/slippage/swap modelling — real first reads, strengthened by the sweep/ablation/portfolio sim but not validated edges. `paper_track.py` (new) — the one gap every result above still shares: window/k were chosen looking at aggregate performance over roughly the period being reported, so nothing here is a genuinely blind forward test. Logs what the FROZEN signal calls on each new bar (`AnalogML/data/paper_trades.json`, append-only) and re-races still-`open` trades against newly-arrived bars on later runs to mark `tp`/`sl`/genuine-`timeout`, via the same `pylego.barrier_race` walker — never touching the frozen params based on what comes back. **This sandbox cannot reach live data (confirmed, not assumed — a direct `curl` to OANDA gets a 403 policy denial from the outbound proxy)**, so it currently reads the same static local parquet snapshot as everything else. The scan→resolve→scan mechanism is verified via `--as-of` historical replay (logs an open trade using only data up to a cutoff, then a second run with fuller data correctly resolves it using genuinely-later bars — proven with a real GBPJPY SELL: logged open as-of 2026-04-01, resolved as an SL hit −1.05R once 2026-05-21 data was visible) — a correctness proof, not a forward result. Seeded `paper_trades.json` with 25/26 pairs' genuinely-open signals as of the snapshot's end. **Wired for Railway (2026-08-11):** `refresh_m1.py` (new) incrementally tops up each pair's local parquet from OANDA (reuses `fetch_m1_oanda.py`'s `fetch_chunk` + `pylego.instruments.oanda_symbol`, writes back in the exact schema every AnalogML script already reads); `--refresh-data` runs it before scanning; the trade log now persists to Cloudflare R2 (`R2_ACCESS_KEY`/`R2_SECRET_KEY`) instead of local disk when configured, since Railway wipes local disk on redeploy; `AnalogML/paper_track_loop.sh` (hourly, wrapped by `restart_bot` in `start.sh`) is the new supervised process. Still needed before this is a trustworthy live loop: the R2/OANDA credentials found hardcoded in 4 files (fixed separately, see the security-fix commit) need rotating and Railway's env vars updated to match. **Surfaced on the dashboard (2026-08-12):** `compute_shape_state`/`save_shape_state` (new) export the CURRENT window's shape + neighbour-consensus (incl. `detail=True`'s top-3 closest analogs) to `AnalogML/data/shape_state.json` (local + R2, same pattern as the trade log) each run; `server.js` serves it + the trade log at `GET /api/analogml/shape-state` / `GET /api/analogml/paper-trades`. `today.html`/`indexv2.html` pair cards show a live sparkline + LONG/SHORT/FLAT lean chip + win rate, with an expandable "closest historical analogs" table (date, closeness percentile, that occurrence's own R in the lean direction) — clearly labelled research/not-a-validated-signal. `bot-config.html` gets a new AnalogML tab (open/closed paper trades) as the landing spot if this is ever promoted to a real bot. `backtest_export.py` (new) — the house-standard results card, exported: runs the FROZEN window=64/k=20 setting across all 26 pairs, full history, and writes `AnalogML/data/backtest_export.json` with per-trade R **and MAE from the real bar path** (capped at the fixed SL — the exit bar's full H1 range can overshoot the SL price on a big wick, but the position closes exactly at the touch, so uncapped MAE would overstate real risk), a calendar IS/OOS split (cutoff 2023-01-01, honestly flagged on the page as a stability check across two periods, NOT a blind holdout — window/k were chosen by the sweep looking at roughly this same OOS window), and cost-on-vs-off. Consumed by **`analogml-backtest.html`** (repo root, self-contained, dark theme, no live backend — Python-only signal, no JS port yet) — IS/OOS + cost-sensitivity cards, per-pair table, and the 3 house-standard CSV export buttons in the exact schemas (`Date,Return %,MAE %` / `date,R,MAE (R)` / `Trade Date,PnL ($),Risk ($)`), account size ($10,000) and R-unit (fixed 20-pip stop, not vol-scaled) stated next to the buttons per convention. Linked from `hub.html`'s Macro Research group. | reads `VolRangeForecaster/data/m1/*.parquet`; imports `pylego.shape_match`, `pylego.analog_signal`, `pylego.walkforward`, `pylego.trade_stats`, `pylego.barrier_race`, `pylego.costs`, `pylego.instruments`; served by `server.js` (`/api/analogml/shape-state`, `/api/analogml/paper-trades`) to `today.html`, `indexv2.html`, `bot-config.html` | ⛔ **null banked 2026-08-12** (fixed-window k-NN shape matching, window=64/k=20, self-adjacency-bug-corrected: full 26-pair sweep 8/26 positive, portfolio Sharpe −0.14, backtest OOS PF=0.95 — see correction note above). Bricks stay (`shape_match`/`analog_signal` are pure, tested, and the fix is real); dashboard cards/tab kept as infrastructure, relabelled research-not-signal; structural-motif alternative scoped, not yet built. **Phase 2/3 built 2026-08-12:** `pylego/swing_structure.py` + `pylego/motif_touch.py` (rows above) + `AnalogML/motif_scan.py` (the evaluation CLI, same baseline/signal/race_grid pattern as `pattern_scan.py`). First read (4 pairs — gbpjpy/eurusd/audjpy/usdjpy H1, 3yr, sl=20p, cost on, AFTER the lookahead-lag bug above was found and fixed): signal profit factor beat the mechanical both-directions-at-the-same-opportunities baseline on every pair at tp_r=1.5 — gbpjpy 1.00→1.04, eurusd 0.95→1.40, audjpy 0.99→1.32, usdjpy 0.92→1.19 — and held up across every tp_r cell tested (1.0/1.5/2.0/3.0), not just one. **Explicitly NOT yet a validated edge** — this is the same single-slice stage `pattern_scan.py`'s original "first read" was at before the 4-pair sweep, 26-pair universe check, portfolio sim, and (critically) the bug that turned out to explain almost the whole thing. Next honest steps before trusting this: a non-overlapping/independent-trial check, the full pair universe, a real bug-hunt pass beyond the one lag issue already caught (CLAUDE.md's "Mandatory Bug Review" — assume more bugs, don't assume this is clean because one was found and fixed), and only then a portfolio simulation. **Full 26-pair sweep + calendar IS/OOS split (2026-08-12, same day):** window=64/k=20-equivalent frozen params (`pivot_n=5, tol=1.2xATR, min_retrace=2.5xATR, min_gap=10 bars` — the JS engine's untouched defaults, not tuned on this data) run across all 26 pairs, 3yr: **20/26 pairs (77%) signal PF>1.0, 25/26 (96%) beat the mechanical baseline** — a materially broader/stronger first read than the k-NN method ever showed even before ITS bug was found. Six pairs negative (eurgbp, gbpchf, audcad, usdcad, gbpcad, euraud), named not hidden. Calendar IS/OOS (cutoff 2023-01-01, all 26 pairs pooled): **IS n=19,240 PF=1.18 → OOS n=9,183 PF=1.16** — minimal decay, the opposite signature of an overfit result; OOS cost-off PF=1.24 (survives real costs). Still not portfolio-tested (task pending) and still just one sl/tp-r cell — genuinely promising, not yet validated. **Live tracking built (2026-08-12):** `AnalogML/motif_track.py` (new) — forward-tracks the frozen signal the same way `paper_track.py` did for the retired k-NN method (same R2+disk persistence, `--as-of`/`--refresh-data` flags, `resolve_open_trades` via the shared barrier walker) PLUS a new live "what's forming right now" diagnostic (`compute_motif_state`): whichever touch-run is currently in-progress per pair, distance to the level, a `provisional` flag when the last touch is still within `pivot_n` bars of "now" (not yet actually confirmable — a live system that skipped this would show phantom setups), and "confidence" = the REAL historical played-out-rate/PF/avg-R for that exact (n_touches, is_top) category on that pair (never a fabricated per-instance probability). **Bug found and fixed before shipping (2026-08-12):** the first version logged every motif in the pair's ENTIRE history as "new" on the first run (28,524 signals in one run) because it re-scans full history each call with no cadence bookkeeping; fixed with a per-pair watermark (seeded at "now" with nothing logged on a fresh pair, same never-backfill contract as `paper_track.py`) — verified with a 3-step `--as-of` replay (0 signals / 0 signals / 83 signals-in-the-gap, then resolve+continue). Separate log/state files (`motif_trades.json`/`motif_state.json`, R2 keys `analogml/motif_trades.json`/`analogml/motif_state.json`) — does NOT touch the retired method's `paper_trades.json`/`shape_state.json`, which stay as its historical record. `server.js` serves both at `/api/analogml/motif-state`/`/api/analogml/motif-trades`. **Dashboard swapped, not duplicated:** `today.html`/`indexv2.html` pair cards now show the motif diagnostic (touch count, side, distance-to-level, provisional flag, historical confidence) in place of the retired shape-match sparkline; `bot-config.html`'s AnalogML tab now reads the motif trade log (added a Pattern column) instead of the k-NN one. `AnalogML/motif_track_loop.sh` (hourly, wrapped by `restart_bot` in `start.sh` alongside the still-running `paper_track_loop.sh`) is the new supervised process. **`flag_scan.py`/`flag_scan_sweep.py` — flags/pennants, the first additional shape family beyond touches, banked null 2026-08-12 (same day, own branch):** the owner's full "shape prediction" ask (every geometrically-defined shape family in `js/patternEngine.js`, each with a before/during/after lifecycle, multi-timeframe agreement study, and adaptive per-cluster SL/TP) names flags/pennants as the first family to try after touches, per its own suggested minimal-DOF-first build order. `pylego/flag_pennant.py` (row above) regenerates `detectFlagsPennants` fresh from the JS spec, reusing `pivot_highs`/`pivot_lows` rather than a third pivot-detection copy; `AnalogML/flag_scan.py` is the single-pair evaluation CLI (same baseline/signal/race_grid harness as `motif_scan.py`); `AnalogML/flag_scan_sweep.py` (new) is a committed 26-pair-sweep-plus-pooled-calendar-IS/OOS-split script, since motif's own sweep wasn't checked in as a script — filling that gap for reproducibility. **Explicit bug-hunt before trusting any number (CLAUDE.md's mandatory review):** the confirmability-lag class of bug that hit `motif_touch.py` does NOT apply here by construction — each consolidation-window candidate re-slices bars and re-runs `pivot_highs`/`pivot_lows` on just that slice, so a window's last pivot is always at least `consol_pivot_n` bars before the window's own end (the same lag `motif_touch.py` had to add a manual fix for falls out of this construction for free); a regression test plus the real-data smoke test assert `pole_start_idx < pole_end_idx < consol_end_idx < confirm_idx` on every instance found. 8/8 offline tests pass (hand-verified bull-flag/bull-pennant/failure/mirrored-bear-flag/no-consolidation/no-pole cases, each cross-checked against the already-tested pivot bricks before being baked into an assertion); a real-data spot-check on GBPJPY (one instance's actual OHLC path: a clean 108-pip pole, 43-bar consolidation retracing 33.5%, confirmed continuation breakout) confirmed plausible geometry before any aggregate number was trusted. **Result: null, and it stayed null under every variant tried.** Full 26-pair sweep (H1, JS-engine-untouched default params, sl=20p, tp_r=1.5, cost on): **6/26 pairs (23.1%) signal PF>1.0, 9/26 (34.6%) beat the mechanical baseline** — named losers: audcad, audchf, audjpy, audnzd, audusd, chfjpy, euraud, eurcad, eurchf, eurgbp, eurnzd, eurusd, gbpaud, gbpchf, gbpjpy, nzdjpy, nzdusd, usdcad, usdchf, usdjpy (20/26); winners were cadjpy (1.01), eurjpy (1.09), gbpcad (1.02), gbpnzd (1.19), gbpusd (1.02), gold (1.06) — no consistent direction, reads like the scatter a true-null baseline produces. Pooled calendar IS/OOS split (cutoff 2023-01-01, all 26 pairs, same cell): **IS n=11,721 PF=0.94 → OOS n=5,362 PF=0.92** — both sides at or below the coin-flip baseline, not a decay pattern, a flat null throughout. Checked whether costs were manufacturing the null: cost-off, same cell, **IS PF=1.00, OOS PF=0.98** — dead flat even with zero cost, ruling out "it's a real edge too small to survive spread." Checked the `tp_r=1.0` cell too: 8/26 (30.8%) PF>1.0, IS PF=0.93/OOS PF=0.94 — same story. Checked whether filtering to ONLY the pole's textbook-expected breakout direction (`played_out=True`, discarding the "failed flag" entries) rescues it, since that's a materially different entry rule, not more tuning of the same one: pooled, sl=20p tp_r=1.5 cost on, **n=9,503, PF=0.95, WR=40.5%** — still null. Four independent checks (raw signal, cost-off, a second tp_r cell, the played_out filter), all converging on the same flat-to-negative number, is itself evidence this is a real null and not a fragile artifact of one setting. **Per CLAUDE.md's "Pivot or Pivot" rule:** flags/pennants (this shape family, H1, these frozen params) show no real edge — stating that plainly, not softening it. Bricks stay (`flag_pennant.py` is pure, tested, and reusable regardless); the honest next move for the broader "shape prediction" ask is NOT tuning this method's thresholds further (the same lesson the k-NN method's retirement already taught) but either a different shape family (head & shoulders / triangles-channels are next in `js/patternEngine.js`, both already geometrically defined and un-tried) or a different timeframe (everything AnalogML has built so far, touches included, is H1-only — flags/pennants may behave differently on H4/D1, genuinely untested, not a prediction either way) — owner's call on which, not pre-decided here. **Lifecycle disaggregation (2026-08-13, same branch):** built `pylego/pattern_lifecycle.py` (row above) as the shared DURING-quality scoring brick the owner's fuller ask calls for, then ran the specific cross-tab the owner asked for directly — does touch/bounce COUNT predict breakout direction/magnitude — pooled across all 26 pairs for BOTH existing detectors. **Touches: yes, and it's a real, IS/OOS-confirmed split, not a subset-mining artifact.** n_touches=2 (double top/bottom, n=21,623 pooled): PF=1.24, avg_R=0.133 — n_touches=3 (triple, n=6,800): PF=0.98, avg_R≈0. Checked the standout cell against a genuine calendar IS/OOS split (cutoff 2023-01-01, sl=20p/tp_r=1.5/cost-on, same as every other AnalogML check): doubles IS PF=1.25 (n=14,646) → OOS PF=1.23 (n=6,977) — minimal decay, well past the ≥30-OOS-trade bar; triples IS PF=1.00 (n=4,594) → OOS PF=0.95 (n=2,206) — flat-to-negative both sides. **The touches motif's edge concentrates almost entirely in double tops/bottoms; triples are close to a coin flip.** This sharpens, not overturns, the existing "promising, not yet validated" status — portfolio test and a second full bug-hunt pass are still outstanding — but it's a real, useful refinement `motif_track.py`'s existing per-(n_touches, is_top)-category confidence design already anticipated (see that entry below) even though this is the first time the pooled cross-pair number was actually computed and checked OOS. Also checked (exploratory, NOT yet OOS-confirmed, flagging rather than overclaiming per CLAUDE.md's multiple-testing rule — roughly 20 cells were sliced across both families this pass): shorter-duration touch formations (15-27 bars) show PF=1.30 vs 1.03 for longer ones (41-127 bars) — a real lead, not yet checked against a calendar split. Formation volatility (candle range vs local ATR during the shape) showed no meaningful effect on touches (PF 1.15/1.18/1.19 across terciles — flat). **Flags/pennants: slicing did not rescue the null.** Touch-count buckets from 5 (the minimum) through 9 stay in the same 0.91-1.00 PF band the pooled null already showed (n=532-11,096, real sample sizes); buckets above 9 touches get too sparse to trust (n<40, one cell literally n=8 showing PF=0.20 — noise, not signal, named here so it's not mistaken for one later). Duration and formation-volatility terciles were both flat (PF 0.92-0.94 throughout, no ordering). Retrace depth showed a mild monotonic lean (shallow retrace PF=0.89 → deep retrace PF=0.97) but every cell stayed below 1.0 — a lead worth a real IS/OOS check if this family is ever revisited, not a rescue of the current null. **Head & shoulders + triangles/wedges/channels built and evaluated (2026-08-13, same branch):** `pylego/head_shoulders.py` and `pylego/triangle_channel.py` (rows above) — the second and third additional shape families beyond touches, both regenerated from already-validated JS specs (`detectHeadShoulders`, `detectTrianglesChannels`), completing every named pattern in the owner's retail reference image except cup & handle (no existing spec anywhere in this repo — flagged, not invented). **Head & shoulders: a real lookahead bug was caught and fixed BEFORE the first sweep was trusted** — the same bug class that hit `motif_touch.py`, but bigger (42.6% of pooled confirmed instances changed confirm_idx/direction after the fix, vs `motif_touch`'s 15.3%). The UNFIXED sweep read 21/26 pairs (80.8%) PF>1.0, IS PF=1.13→OOS PF=1.14 — a strong-looking result that was **entirely the bug**, the same shape of false positive the k-NN method's self-adjacency bug produced. **After the fix: null.** 8/26 pairs (30.8%) PF>1.0, 13/26 (50.0%) beat baseline; pooled IS PF=0.98→OOS PF=0.95 (cost on), cost-off IS PF=1.06→OOS PF=1.01 — flat-to-negative both ways, both cost settings. **Triangles/wedges/channels: null from the first sweep**, no bug found (checked explicitly — this detector's construction is immune to the confirmability-lag class by design, see its row above). 7/26 pairs (26.9%) PF>1.0, 13/26 (50.0%) beat baseline; pooled IS PF=0.97→OOS PF=0.90. Disaggregated by shape type before accepting the pooled null (CLAUDE.md: "pooled nulls hide subset edges — disaggregate before declaring null"): all 7 types read at or below breakeven except symmetrical_triangle (PF=1.07, n=212 — small sample, and the one type with no directional expectation to begin with, so a mild positive read here isn't a coherent "textbook direction predicts outcome" edge the way the others would be) — no hidden winner. **Three shape families now built (touches, flags/pennants, head & shoulders) plus triangles/wedges/channels; touches remains the only one with a real (not yet portfolio-validated) positive first read** — everything else tried since is null, reported as plainly as touches' positive read was. **Flags/pennants, a fifth check (2026-08-13):** owner asked why a pattern this widely used by retail traders would show no edge — raced every eligible instance through its OWN pattern-derived stop/target (0.5x/1.0x the pole's measured move, `js/patternEngine.js`'s own `computeOutcome` default, not the flat 20-pip stop every check above used) instead of a fixed stop: pooled 26 pairs, n=17,083, PF=0.96, WR=33.3% — still null, ruling out "the fixed stop specifically killed a real edge." Multi-timeframe confluence, other timeframes, and fuzzy/discretionary pattern recognition remain untested, not proven null. **Sixth/seventh checks — the exact mechanics of a retail reference image the owner supplied (2026-08-13):** retest-of-breakout entry (wait up to 20 bars for price to pull back to the broken trendline before entering, not chase the breakout bar) — 57.1% of instances retested; measured-move stop/target on those: n=9,724, PF=0.97, still null. Trend-context filter (`classify_swing_structure` — only count flags whose pole continues an ALREADY-established trend, the "impulsive wave, flag=corrective wave" framing the image showed): trend-aligned n=2,470 PF=0.95 vs not-aligned n=7,254 PF=0.97 — aligned subset was marginally WORSE, no rescue. Four honest entry variants now tested (fixed stop, measured-move, measured-move+retest, measured-move+retest+trend-context), all null. **H4 check (2026-08-13):** owner's reference images specifically showed H4/H8, so re-ran `flag_scan_sweep.py --timeframe 4h`, same frozen params. First read looked real — 20/26 pairs (76.9%) PF>1.0, IS PF=1.10→OOS PF=1.07 — but only 15/26 (57.7%) actually beat the mechanical baseline, because a flat 20-pip stop is a much tighter relative risk unit on H4 bars than H1, inflating BOTH signal and baseline (gbpjpy's zero-signal baseline alone read PF=1.23). This is a live example of exactly the timeframe-normalization problem the owner's original ask named ("MAE/TP need to be normalized... so this shape on H4 and the same shape on M15 are comparable"). Re-tested with the timeframe-scaling measured-move stop/target (proportional to each pattern's own size, not a fixed pip count): signal PF=1.02 vs baseline PF=1.00, IS PF=1.02→OOS PF=1.04 — flat both sides. **Flags/pennants on H4: also null**, same conclusion as H1, once measured with a risk unit that doesn't accidentally favor the timeframe. **Touches portfolio-level test (2026-08-13) — the outstanding validation debt flagged since the first read, now closed:** extracted `pylego/portfolio_sim.py` (row above) as a shared Tier-1 brick from the k-NN method's `AnalogML/portfolio_sim.py` (9 new hand-verified tests; that engine had none before, only exercised indirectly) and built `AnalogML/motif_portfolio_sim.py` on top of it — same event-driven single-account simulator, same two-benchmark methodology (A: uncontrolled utilization, confounded; B: matched utilization, the fair comparison), zero second implementation. **Full touches signal, 26 pairs, 1% risk/trade, 5% concurrent-risk cap: Sharpe 1.61, max DD −55.1%, avg utilization 2.7%** (37.2% of raw signals refused by the risk cap, reported not dropped); avg pairwise weekly-return correlation +0.012 — close to independent, a genuinely favorable diversification starting point for FX pairs that share currency legs. **Doubles-only (n_touches=2, the disaggregation-confirmed sharper subset): Sharpe 2.27, max DD −31.8%** — BOTH higher Sharpe and shallower drawdown than the diluted full signal, consistent with the earlier finding that triples add noise, not value. Benchmark B (3 sample pairs matched to the portfolio's own utilization): audchf survives at Sharpe 1.08–1.28; audcad and audjpy, scaled to the SAME total risk a single pair would need to match the portfolio's utilization, go to **−100%/−99.4% drawdown (ruin)** — the portfolio, spreading that identical total risk across 26 pairs, does not. That gap is the real, controlled diversification effect, not a capital-deployed illusion. (Headline equity multiples — 46,274x / 2,548,954x — are mechanical compounding artifacts over ~10.5 years at fixed 1% risk with 1,000+ trades/pair, same caveat the k-NN method's own headline number needed; not a return forecast.) **Still outstanding before this is a validated edge:** only one bug-hunt pass has been done on `motif_touch.py` (CLAUDE.md: assume more bugs exist, don't assume clean because one was caught — flags/pennants and head & shoulders both got adversarial variant-testing this session that touches hasn't yet had); sizing here is fixed-%, not vol-scaled per pair; mark-to-close only, no intra-trade floating equity; risk-pct/cap parameters (1%/5%) are inherited unoptimised from the k-NN method's original defaults, not tuned for touches specifically (deliberately — avoids a new overfit risk, but also means they aren't validated as good choices for this signal). Genuinely the strongest result so far in this build, and still not the finish line. **Second bug-hunt pass on `motif_touch.py` (2026-08-13):** re-read the full detector source fresh; empirically verified the causal invariant at FULL SCALE (not just the synthetic regression test — the same class of check that caught the H&S bug, which a synthetic test alone missed): **28,524 confirmed motifs across all 26 pairs, 0 causal-invariant violations.** Checked touch-run duration realism (median 0.8 days, p99 2.4 days, max 3.4 days on GBPJPY — realistic, contained formations, no degenerate multi-year "double tops"). Confirmed no same-side double-counting (structural, via the run builder's index advancement) and correct entry/exit date ordering (structural, via `race_trades`' forward-only exit scan). **No new bug found this pass** — reported plainly as a real but bounded result, not proof of permanent cleanliness. Pattern-lab honest-validation layer, first read (2026-08-12):** `js/patternEngine.js`/`pattern-lab.html` (a SEPARATE, older, already-shipped JS system — flags/pennants/head-and-shoulders/double-triple-tops/triangles-channels-wedges, 17 shape sub-types, MFE/MAE per instance) was AUDITED and confirmed to have **zero cost model and zero calendar IS/OOS split anywhere** — everything pooled over full history. `AnalogML/scripts/export_pattern_lab.mjs` (new) calls the JS detectors directly (no server, no redetection) and dumps instances to JSON; `AnalogML/pattern_lab_validate.py` (new) applies real costs (`pylego.costs.default_spread`, same convention as `pylego.barrier_race`'s cost-as-R-multiple) and a real 2023-01-01 IS/OOS split. **GBPJPY, all types pooled: IS PF=1.12 → OOS PF=1.11** (small but real, survives costs). Disaggregated by type (n_oos≥30 only — smaller cells are noise, e.g. `descending_triangle` OOS PF=0.07 on n=6): `double_top`/`double_bottom` are the standout, strong AND IS→OOS-consistent (1.34→1.71, 1.25→1.30) — independent confirmation, from a completely different engine, of the same shape family `motif_touch.py` already validated. `bull_flag` mild positive both sides. `bull_pennant`/`bear_flag`/`inverse_head_shoulders`/`triple_top` decay from decent IS to sub-1.0 OOS — the overfitting signature. One pair only — next step is the same multi-pair sweep ladder every other AnalogML check went through before anything here is trusted. **Genuine walk-forward, replacing the single 2023 cutoff (2026-08-12, `AnalogML/motif_walkforward.py`):** the touch-motif's earlier "IS PF=1.18→OOS PF=1.16" was one fixed split, not a walk-forward. Rebuilt as 11 consecutive calendar-YEAR folds (2016–2026, all 26 pairs pooled per fold): **11/11 folds PF>1.0 (cost on), 11/11 beat baseline** — 2025 is the weakest year (PF 1.04) but still positive, the opposite of the "one lucky split" failure mode. Explicit cost sensitivity (all folds pooled, n=28,423): **PF cost-ON=1.174, PF cost-OFF=1.259** — costs remove 0.085 PF, a real but survivable drag. **Portfolio-level test (2026-08-12, `AnalogML/motif_portfolio_sim.py`, reusing `portfolio_sim.py`'s account simulator verbatim):** 26 pairs, 1%/trade, 5% concurrent cap, 17,858/28,423 signals taken. **Sharpe 1.61, max DD −55.1%, avg pairwise weekly-return correlation +0.012** (near-independent bets). Matched-utilization benchmark: 2 of 3 sampled single pairs (audcad, audjpy) hit **−100% max DD (total ruin)** at the portfolio's own 2.7% utilization; the portfolio drew down only −55.1% at that same utilization — the real diversification effect. (Raw total-return figures from this sim are a fixed-fractional-compounding artifact over 17,858 trades, not a return forecast — Sharpe/DD/utilization are the numbers to read.) **The 6 originally-negative pairs, investigated (2026-08-12):** no detector malfunction (played-out rate/touch mix/top-bottom split all statistically indistinguishable from positive pairs); spread-cost burden unremarkable except eurgbp (spread/ATR 12.6% vs 4–9% typical); all six track the SAME year-by-year shape as the full 26-pair pool (strong 2016–2020, soft 2024–2025) — reads as cross-sectional noise around a shared weak recent stretch, not six broken pairs, EXCEPT **audcad and usdcad, which remain clearly negative in the most-recent (2026) fold specifically** and warrant continued monitoring; gbpchf/euraud/gbpcad/eurgbp are now near-breakeven-to-positive in the most recent fold. **Dashboard checked against merged code (2026-08-12):** `today.html`/`indexv2.html`/`bot-config.html` on `main` (PR #1216, commit `181e1b50`) DO call `/api/analogml/motif-state`/`/api/analogml/motif-trades`, not the retired k-NN routes — confirmed by direct grep, not assumed. A user report of still seeing the old signal on the live Railway site is therefore a deploy-lag/live-data question, not a stale-code one — unverifiable from this sandbox (Railway blocked by the outbound proxy); still open pending the user looking at the live site. **Root cause found (2026-08-12), from a user screenshot of `indexv2.html`'s per-instrument DRILL-DOWN view ("The Board"):** the PR #1216 swap only reached `renderCards()`'s compact multi-pair grid (`analogShapeHtml`, line ~1416) — the separate single-instrument drill-down grid (`renderDrill()`) still only had the OLD `js/patternEngine.js`-based "Pattern Match" `dcard` with no motif card next to it, even though `d.analogml` was already being loaded into the same per-instrument row object (`analogmlByPair` at line ~1075) that both render paths share. Not a deploy-lag issue after all — a real incomplete-swap gap in this repo. Fixed: added a "Structural Motif (AnalogML)" `dcard` to `renderDrill()`'s grid, directly before "Pattern Match", reading the same `d.analogml` field (current touch-run, distance to level, historical played-out-rate/PF) plus a one-line pointer to the walk-forward record above. `today.html` has no equivalent drill-down view (card-grid only), so it didn't have this gap. **Phase 1 built (2026-08-12), `AnalogML/motif_adaptive.py`:** the original brief's MAE-based stop / historic-breakout TP, deferred until the detector proved it had something to size risk around (it did — 11/11-fold walk-forward + portfolio test above). New `pylego.barrier_race` bricks (`VariableEntry`, `race_trades_variable`, `excursion` — 7 new unit tests, 21/21 passing) let each trade carry its OWN sl/tp instead of a shared grid cell. Per-category (n_touches × is_top) SL/TP sized from that category's own historical MAE/MFE, ATR-scaled, causal (only same-category precedent strictly before that trade, pooled across all 26 pairs, expanding window). **A real bug found before trusting anything:** sizing off the full 200-bar race horizon produced ~11x-ATR (~220-pip) stops that diluted the signal into mark-to-close timeouts (adaptive avgR +0.006 vs frozen +0.110, 2-pair smoke test) — fixed by bounding the excursion window to the breakout's own horizon (`--excursion-bars`, default 40) instead of the full race horizon. A 6-cell percentile sweep (same 2 pairs) then found SL/TP both at p50 clearly ahead of the other cells. **Full 26-pair confirmation, same 28,223 motifs raced both ways: adaptive PF=1.227/avgR=+0.115 vs frozen-grid PF=1.174/avgR=+0.098 — a real, +17% relative avg-R improvement, but fold consistency is only 6/11 (not the entry signal's own 11/11)**, concentrated in a few standout years (2018/2020/2022/2025) with several folds flat-to-slightly-worse (2017/2019/2023/2024/2026) — a real but modest win, not a decisive one. Per-category sizing is now sane (2-touch: SL≈36-37p/2.3xATR, TP≈49p/3.1xATR, ~1.3:1 reward:risk; 3-touch: SL≈41-45p/2.7-2.8xATR, TP≈42-43p/2.7xATR, ~1:1) — a real structural difference between 2- and 3-touch motifs, not noise. **Portfolio-level test (2026-08-13), `AnalogML/motif_adaptive_portfolio_sim.py`:** a 3-pair smoke test looked like a clean win (adaptive Sharpe 1.68 vs frozen 1.31, max DD −18.8% vs −26.3%, MORE capital deployed not less) — **the full 26-pair confirmation walked that back.** Same 28,223 motifs raced both ways: adaptive Sharpe=1.86/max DD=−68.6%/util=3.6% (n taken=11,829) vs frozen-grid Sharpe=1.58/max DD=−54.5%/util=2.7% (n taken=17,688). **Sharpe genuinely improves but max drawdown is materially WORSE** — adaptive's wider SL/TP (36-49p vs frozen 20p/30p) holds trades longer, overlaps more, hits the 5% concurrent-risk cap far more often (16,394/28,223 skipped vs 10,535/28,223), concentrating risk in fewer, larger positions. A real trade-off, not a decisive win — the opposite of the small-sample read. Diversification itself still holds regardless of sizing method (matched-utilization single pairs: audcad −99.9%/audchf −88.6%/audjpy −86.9% max DD, all worse than either portfolio). Not yet done: a percentile ablation (e.g. tighter SL at p25/p35) to see if the drawdown cost can be traded back down before this replaces the frozen grid as the default. **True multi-timeframe agreement analysis (2026-08-13), `AnalogML/motif_multi_tf.py`:** answers a question open since the original scoping conversation ("if higher timeframes have a bullish pennant and lower timeframes have bearish, what happens"), confirmed absent everywhere else (`js/patternEngine.js`'s HTF flag is single-level, unaggregated; nothing in the Python motif chain looks past its own timeframe). Detects the SAME touch-motif on H1 and independently on 4H/1D, buckets each H1 entry by whether the most recently CONFIRMED HTF motif (causally known by that entry's own time, within a lookback window) agrees, conflicts, or is absent. **A real lookahead bug caught before running anything:** a resampled bar is labeled by its START, so cutting off against that timestamp could let a still-forming HTF bar leak into a decision made mid-bar — fixed by deriving each bar's actual END time and cutting off against that. **A real reversal between small and full sample:** 2-pair smoke test suggested 4H mattered (AGREE PF=1.29 vs CONFLICT 1.19) and 1D didn't (1.20 vs 1.25, reversed) — **the full 26-pair confirmation found the opposite**: 4H shows no separation (PF 1.19 vs 1.18, a wash), **1D shows a real gap (PF 1.24 vs 1.09, avg R +0.133 vs +0.055 — CONFLICT trades' edge drops to less than half of AGREE's)**, fold-consistent 7/11 years. CONFLICT stays net positive (not reversed), reading as "1D agreement adds conviction, 1D conflict is a reason to size down," not a hard filter. NONE (no fresh HTF read) is the majority bucket (~70-76%) in both splits — a real constraint on how often this could apply live. **Percentile ablation, resolving the drawdown cost (2026-08-13) — DEFAULT CHANGED to (35,35).** 8-pair sweep at the PORTFOLIO level found (35,35) clearly ahead of every other cell tried; full 26-pair confirmation, same motifs: **adaptive (35,35) Sharpe=2.31/max DD=−41.8% vs frozen-grid Sharpe=1.58/max DD=−54.5%, at MATCHED utilization (2.7% both)** — beats the frozen grid on BOTH Sharpe and drawdown now, no trade-off. Trade level barely moves (PF 1.212/avg R +0.110 vs (50,50)'s 1.227/+0.115) but fold consistency improves (8/11 vs 6/11). (35,35) is now the default in both `motif_adaptive.py` and `motif_adaptive_portfolio_sim.py`. **HTF-conflict-aware position sizing (2026-08-13), `AnalogML/motif_htf_sized.py`:** the natural integration of the 1D-conflict finding — keep every trade, size DOWN (0.5x) on a 1D conflict rather than skip (CONFLICT stays net positive). `portfolio_sim.py`'s `simulate_portfolio` extended with an optional per-trade `size_mult` (default 1.0, every other caller unaffected). Isolates ONE new variable on top of the already-validated frozen-grid entry signal, deliberately not stacked with the adaptive SL/TP. 3-pair smoke test looked like a wash (Sharpe 1.26 vs 1.32) — **full 26-pair confirmation found a real win**: HTF-sized Sharpe=1.80/max DD=−42.9% vs uniform-sizing Sharpe=1.61/max DD=−55.1%, at matched utilization (2.6%/2.7%), 4,168/28,423 (14.7%) trades downsized. Not yet done: an in-progress/provisional HTF read, and testing adaptive SL/TP + HTF-conflict sizing COMBINED (deliberately kept separate so far to isolate each variable). **Telegram alerts (2026-08-13), `AnalogML/motif_track.py --telegram`:** the "leave it as a signal, alert when a trade is building" decision — a human-facing alert with SL/TP markings, not automated execution. Reads the SHARED dashboard `tg_config` via the new `pylego/telegram.py` brick (row above) — no new credentials needed. One alert per newly-confirmed motif (the existing watermark already guarantees no backfill flood). Shows the TRACKED frozen-grid entry/SL/TP (unchanged — the record everything in this file is judged against never silently drifts) plus the validated adaptive ATR-scaled SL/TP ((35,35) constants, hardcoded not recomputed live) and the 1D HTF agree/conflict read with a size-down note — informational overlay only, neither adaptive number is applied to the tracked trade itself. Opt-in (`--telegram`, off by default), auto-disabled under `--as-of` even if passed. **`pattern_lab_validate.py` extended 2026-08-13 from GBPJPY-only to the full 26-pair universe** (`--all-pairs`, one `export_pattern_lab.mjs` run per pair): resolves the discrepancy this raised against `pylego/flag_pennant.py`'s fresh Python regeneration (26-pair null on flags/pennants) — pooled across all 26 pairs on the OLDER JS detector's own output, `bull_flag` OOS PF=1.00 avgR=-0.001 (11/25 pairs PF>1.0, coin-flip), `bull_pennant` OOS PF=0.93 (11/25), `bear_flag` OOS PF=0.87 (6/25), `bear_pennant` OOS PF=0.96 (10/25) — GBPJPY's own lone mild-positive read was one favorable pair out of 25, not real signal; the null stands, now confirmed on a second, independently-built detector implementation, not just the regeneration. Notable side-finding from the same pooled run: `double_top`/`double_bottom` (patternEngine.js's OLDER double/triple-extremes detector, not `pylego/motif_touch.py`) independently read OOS PF=1.31/1.25 with 24/25 and 21/25 pairs PF>1.0 — an independent corroboration of the touches motif's double/triple-top-bottom edge from a structurally different, already-shipped codepath, not a re-check of the same code. `head_shoulders`/`inverse_head_shoulders` OOS PF~1.02, consistent with `pylego/head_shoulders.py`'s own null. `channel_up` read OOS PF=1.43 (10/25 pairs) but IS PF=0.97 (near-null) — the IS/OOS direction is backwards from what a real effect should look like (should be roughly consistent, not null-then-positive), read as noise, not a lead, until it survives a second independent check. **Dashboard build 2026-08-13, follow-up to the extension above:** `AnalogML/motif_backtest_export.py` (new) + `touches-backtest.html` (new) give the touches motif signal the same house-standard results card `backtest_export.py`/`analogml-backtest.html` built for the retired k-NN signal — static pre-computed JSON (no server route, matching the fact this is a Python-only signal with no JS port), 3 CSV exports in the exact house schemas, IS/OOS + cost-sensitivity cards, per-pair table, trade log with pair AND n-touches (doubles/triples) filters. `pylego/barrier_race.py` gained `mae_from_path` (extracted from `backtest_export.py`'s until-now-uncopied `compute_mae` — this is its second consumer, which is what actually made it a shared brick rather than premature extraction) — both export scripts now import the same MAE-from-real-path-capped-at-SL logic instead of each carrying their own copy. Linked from `hub.html`, `index.html`, and `indexv2.html` (the last of which was also missing a shortcut to `analogml-backtest.html` itself — added both). This mirrors `analogml-backtest.html`'s STATIC-export pattern, not `vol-backtest-v2.html`'s live async-job pattern (`POST /run` -> jobId -> `GET /status/:jobId`) — that second pattern requires the detection logic to be server-callable JS, which `motif_touch.py` is not (Python-only); porting it to JS just to get a live-refresh button was judged not worth it for a results viewer, since the underlying signal is frozen, not something a user tunes interactively. A live "what's forming right now" view already exists separately and is NOT this page — `today.html`'s per-pair "structural motif diagnostic" chip, fed by `AnalogML/motif_track.py`'s `motif_state.json`/`motif_trades.json` via `/api/analogml/motif-state`/`/api/analogml/motif-trades` (server.js) — this backtest card is the historical-record view, that chip is the live-state view; they read different JSON files and serve different questions. **Real bug caught via headless-browser testing of the new page, fixed 2026-08-13:** `json.dump` silently writes invalid `NaN`/`Infinity` tokens (not valid JSON) for any subset with 0 trades or infinite PF — this was ALREADY live in `backtest_export.json` (audchf has 0 OOS trades, its local history ending in 2020 before the 2023 cutoff), meaning `analogml-backtest.html` was silently broken in production, confirmed by the user's own screenshot of the live Railway site showing exactly this `JSON.parse` error. New shared brick `pylego/json_safe.py` (6 tests) fixes both export scripts; both data files regenerated. **Also found and cleaned up while resolving this same row's merge conflict against `main` (2026-08-13):** this row had been silently duplicated into three near-identical copies (a truncated snapshot, a medium snapshot missing the flags/pennants-through-lifecycle-disaggregation content, and the full correct version) by an unrelated PR's botched conflict resolution sometime after PR #1224 merged — deduped back to one row (this one), the two stale partial copies removed, nothing else in the file touched. |
| telegram | `pylego/telegram.py` | alert transport — still a candidate. | — | 🔲 planned |
| **Give-back (JS brick + dashboard)** | `js/giveback.js` | **the dashboard view** (everything the owner consumes is a webpage, not a CLI): `excursionFromM1(packed, trade, pip)` reconstructs MFE/MAE (pips) from the real M1 high/low path using the `barUtils.bisect` packed-array contract; `summarizeGiveback(rows, pipFor)` aggregates a bot's `*_trade_log` rows into per-bot give-back stats (median peak vs kept, % of peak handed back, winners-give-back vs losers-median-peak split, `greenThenRed`, $ off the peak via profit-derived $/pip). Pure (loader + pip injected), tested `js/giveback.test.mjs`. Consumed by **`GET /api/giveback`** (server.js — reads both KV logs, enriches pre-logging rows via `loadM1ForPair`, 5-min cache) → **`giveback.html`** (per-bot cards, linked from `index.html` command hub). Rows carry `mfe_pips` live now (pylego brokers). | `server.js /api/giveback`, `giveback.html` | ✅ built |
| **Backtest VMC test** | `js/backtestVmc.js` | tests one hypothesis: does VuManChu EXHAUSTION at entry separate the backtestSystem bot's winning fades from its losers (its own trend-built conviction vote is anti-predictive — `analysis/backtest_entry_quality.py`)? `wtSeriesForPair` builds a CAUSAL WT series (operator's 9/12/3) on M1 resampled to `tfMin`; `classifyEntry` reads the last TF bar STRICTLY before entry → `confirm` (fade LONG when oversold / SHORT when overbought) / `oppose` / `neutral` / `unknown`; `summarize` buckets win%/expR incl. the confirm-vs-rest and does-it-rescue-high-conviction crosses. Pure (M1 injected), tested `js/backtestVmc.test.mjs` (incl. causality). Consumed by **`GET /api/backtest-vmc?tf=&ob=`** (reads the committed snapshot `analysis/data/backtest_enriched.json`, reconstructs VMC from R2 M1, 30-min cache) → **`backtest-vmc.html`** (linked from `index.html`). EXPLORATORY — n≈279, one window; a steer, not proof. | `server.js /api/backtest-vmc`, `backtest-vmc.html` | 🔬 hypothesis test |
| **Backtest exit study** | `js/backtestExitStudy.js` | replays each backtestSystem trade's real M1 path under ALTERNATIVE exits (fixed-TP grid 1/1.5/2/3R, chandelier trail, breakeven move, time-stop) vs the actual exit, all in R (risk=|entry−SL|), barrier ties adverse-first (conservative). `studyTrade`/`summarizeExitStudy` + `mfeMae`. Answers whether the bot's far ~2R+ target leaves money / round-trips (entry analysis: RR>3 hit 1-in-7). Pure (M1 injected), tested `js/backtestExitStudy.test.mjs`. Consumed by **`GET /api/backtest-exit-study`** (reads `analysis/data/backtest_enriched.json`, replays from R2 M1, 30-min cache) → **`backtest-exit-study.html`** (index-linked). Gold preview (n=33): tp3R −0.42R vs tp1R −0.03R vs trail0.5/0.5 +0.24R — far target confirmed as the leak, but EXPLORATORY (one window, gross R). | `server.js /api/backtest-exit-study`, `backtest-exit-study.html` | 🔬 hypothesis test |
| **Backtest entry-quality (CLI)** | `analysis/backtest_entry_quality.py` | joins the backtestSystem log's per-ticket ENTRY context (conv/confirms/features/SL-TP prices) to MT5 outcomes (`backfill_trade_history.py --out`) by ticket → the loss-asymmetry read (avg win vs avg loss R, exit-type split, by-conviction/confirms/feature-family/pair), netted for cost. Found: the bot is a net loser (−0.35R/trade, 30% win) because WIN-RATE is too low (not "losses cut deep" — losses cap at ~1R); and conviction/confirms are anti-predictive. Has a pnl_r-vs-profit$ sign guard (a sign bug bit once: dir is LONG/SHORT not BUY/SELL). | reads `backtestSystem.log` + MT5 dump | ✅ built |
| **Give-back diagnostic (CLI deep-dive)** | `analysis/bot_giveback.py` | the offline deep-dive (R-multiples, chandelier replay, bank-X%-of-peak counterfactual) behind the dashboard view: for every CLOSED trade walks the REAL M1 path to get MFE vs realised, winners/losers separate. Generalises `Gold/mfe_mae_analysis.py`. Four loaders: `gold`/`confluence` (journal join), `range_line`/`oi` (exported KV `*_trade_log`). Unit R/$/pips. Skips (never approximates) trades outside local M1 coverage. Validated on Gold (n=30) + synthetic KV. | reads gold/confluence journals, `range_line_trade_log`/`oi_bot_trade_log` KV | ✅ built |

### 1e. Vol-forecast evaluation brick (2026-06-29)

Built to answer a question the strategy stack *assumed* rather than measured:
which σ estimator actually predicts realised range best, per asset class, OOS.
σ is the ruler bands and "extension past the mean" are measured in, so this grades
the ruler itself. Pure, no-network, covered by `js/volForecastBench.test.mjs`
(24 synthetic checks incl. a no-lookahead contract test on every estimator and an
OLS-recovers-a-known-law test for HAR-RV).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Vol-forecast bench** | `js/volForecastBench.js` | σ-estimator **evaluation** registry (`ESTIMATORS`) — EWMA(0.90/0.94), HV20/HV30, Yang-Zhang(30), GARCH(1,1) all **imported** from `volBacktestEngine.js` (no copies, re-aligned to a `predictVar(bars)→Float64Array` no-lookahead contract) plus the one new entrant **HAR-RV** (`harRvPred`, walk-forward OLS via incremental normal equations + `solve4`); realised-variance proxies (`realizedVarSeries`: Garman-Klass / squared-return / Parkinson); QLIKE+MSE scoring with full/IS/OOS split (`scoreSeries`); `runBench` ranks by OOS QLIKE; **next-session forecast** for the winning estimator (`latestSigmaForecast`, `sigmaSeriesForExport`, `harRvForecastNext`, `benchCtx`). **HAR-IV added 2026-07** (`harIvPred`/`harIvForecastNext`, `solveN` 5×5): Corsi HAR-RV **plus a forward-looking implied-variance regressor** from the listed vol index (`IV_INDEX_BY_INSTRUMENT`: GVZ→gold, VXN→NQ, VIX→SPX, RVX→US2000, VXD→US30, OVX→oil, EVZ→EURUSD), `ivVarSeries` converts annualised IV%→daily variance (server aligns the FRED series onto the bar dates via `forwardFillAlign`). IV-gated: excluded from the default keys unless an IV series is supplied; partial IV history (e.g. GVZ from 2021) trains only its covered span. `runBench.matched` scores **harIV vs harRV on the COMMON IV-covered index set** (`scoreOnIndices`) — the fair head-to-head, since the full-sample ranks mix periods. Evidence base: implied vol carries real predictive content for future RV, often subsuming HAR terms (Busch-Christensen-Nielsen 2011), strongest on equity indices → weakest on FX (EURUSD only). Pure; unit-tested `js/volForecastBench.harIV.test.mjs` (16: solveN, IV→var, informative-IV-beats-RV, noise-IV-no-edge, partial-coverage, runBench matched/gating). **Not yet run OOS** — FRED unreachable in sandbox; verdict on Railway. | `server.js` `/api/vol-forecast-bench/*` (now fetches each instrument's IV index) + `vol-forecast-bench.html` (ranking + matched harIV-vs-harRV badge; linked from `hub.html`) | ✅ built (HAR-IV unrun OOS) |
| **Forecast drift comparator** | `js/forecastDriftCompare.js` | `compareForecastLines(bars, assetClass)` — measures the gap between the **PLAN** forecaster (frozen `nextSigma`/`volSigmaSeries` + `forecastCore` corrections — what the live vol bot's entry LINES are built from) and the **REFERENCE** forecaster (`volForecast.computeForecast` — recalibrated YZ/GARCH σ + its own corrections — what the dashboard chart shows). Returns each band's size (% of price) from both + the signed per-line drift `(plan−ref)/ref` and the σ drift. `+` = plan wider (bot enters later), `−` = narrower (bot line inside the reference → enters early). The two disagree because commodity σ is HV20 (plan) vs YZ (ref) **and** the correction sets differ (even fx, same σ, drifts ~7%). Pure, no-network, tested in `js/forecastDriftCompare.test.mjs` | `server.js` `GET /api/forecast-drift/:pair` (live D1) + `bot-config.html` Volatility tab "Forecast drift vs reference" readout | ✅ |
| **Forecast export** | `js/forecastExport.js` | reproduce the live forecaster's export TEXT for an arbitrary daily σ (e.g. the bench winner): `forecastFields` (delegates band math to `volForecast.js`'s `_buildOutput` + the v2 drift block via imported `_driftD`/`_bmMaxQuantile`/`ASSET_PARAMS` — **never copies the recalibrated correction factors**) + the format builders `buildExportText`/`buildExportV2Text`/`buildExtendedText`/`buildExportHarText` (verbatim copies of the page functions, **golden-tested** byte-identical in `js/forecastExport.test.mjs`); **`harShadowFields` (2026-07-03)** — the daily HAR-RV challenger: bench `sigmaSeriesForExport('harRV')` σ through `forecastFields`, attached as `f.har` per instrument by the scheduler (purely additive — primary fields never move; kill switch `VOL_FORECAST_HAR=0`; delegation golden-tested byte-equal to hand-composing the two bricks) | `server.js` `/api/vol-forecast-bench/*` (export strings in the job result) + `vol-forecast-bench.html` copy buttons + `js/volForecastScheduler.js` (`f.har` shadow block in `/api/vol-forecast`) + `vol-forecast.html` ⬇ Export HAR button | ✅ |

> Imports the incumbent estimators from `volBacktestEngine.js` rather than copying
> them, so the benchmark and the live forecaster cannot silently disagree (Lego
> Principle 1). HAR-RV is a *candidate* estimator — it only earns a place in the
> forecaster if it beats the asset-class incumbent **out-of-sample**; the bench is
> how that's decided, not an automatic adoption.
>
> **HAR-RV daily shadow (2026-07-03):** while that OOS case accumulates, the daily
> forecast run now attaches a HAR-RV *shadow* block (`f.har`) beside every
> instrument's primary fields (`harShadowFields`), and vol-forecast.html grows an
> "⬇ Export HAR" button emitting the same text structure as the main export — so
> incumbent vs HAR-RV vs the reference forecast can be compared line-for-line every
> session. The primary forecast, the per-line book and the bot plan are untouched;
> back-out = `VOL_FORECAST_HAR=0` (or drop the field render).
>
> **Additive exports (visibility-only, zero behaviour change):** to let
> `forecastExport.js` reuse the forecaster's exact band math instead of copying the
> drift-prone numbers, `export` keywords were added to `_buildOutput`, `_driftD`,
> `_bmMaxQuantile`, `ASSET_PARAMS` in `volForecast.js` and `G_ALPHA`/`G_BETA` in
> `volBacktestEngine.js`. No logic changed; `computeForecast` output verified
> identical. The export text is **golden-tested byte-identical** to vol-forecast.html
> so the same Pine indicator consumes it; only the σ comes from the bench winner.

### 1f. Intraday mark-to-market drawdown brick (2026-06-30)

Built to answer an institutional reviewer's audit: the headline portfolio
drawdown is read off the **closed-trade daily-netted** equity curve, which omits
(i) **intratrade MAE** — a fade that runs most of the way to its stop before
reverting to target books as a clean win, its unrealised drawdown invisible — and
(ii) **intraday concurrency** — many positions open at once net to one daily
number, hiding simultaneous open-position drawdown. Both make the closed-trade DD
a *lower bound*; this brick computes the honest tradeable number. Pure, no-network,
covered by `js/intradayDrawdown.test.mjs` (synthetic checks: MAE exposure on a
winning trade, concurrency stacking vs sequential non-stacking, loss = its DD,
midpoint default, malformed→0, MTM deeper than closed, and **coverage** — zero-
duration trades expose no MAE and are counted so a stale dataset can't quote a
flattering ≈1× DD as if it were the correction).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Intraday MTM drawdown** | `js/intradayDrawdown.js` | `intradayMtmDrawdown(trades)` — portfolio mark-to-market drawdown including intratrade MAE + concurrency. Each trade is a 3-point unrealised-PnL path (0 @entry → −maePct @maeTime → finalPnl @exit, linear between) anchored on its **actual** peak adverse excursion; an active-set sweep over the breakpoint grid sums concurrent open marks + realised PnL and takes peak-to-trough. Self-coerces bar times (epoch-sec / epoch-ms / ISO) to one ms clock so cross-pair concurrency is meaningful. MAE-anchored approximation (real worst excursion + real timing), **not** a tick replay. Also returns **`coverage`/`nPlaced`/`nZeroDur`** (fraction of trades with a real duration — the ones that can expose MAE; zero-duration records contribute realised PnL only and quietly pull the DD back to the closed floor). Also exports **`tradeTimingStats`** (avg/median duration, %zero-duration, avg/median/p95 maePct) — the discriminator proving the intraday uplift is real short-lived mean-reversion, not missing-timestamp zero-duration records | `perLineStrategy.js` `runPerLine` (book `intradayDD`) + `buildSurvivors` (survivor `intradayDD`) — `intradayDDBlock` adds a **`valid`** flag (false when %zero-duration > 5); **`withMtmDD`** (exported) folds the MTM DD into the portfolio stats as the **PRIMARY** drawdown/Calmar basis (`volTarget.maxDDMtm`/`calmarMtm` at 10% vol **plus** `maxDDMtmRaw` = the FULL leverage-free magnitude at realised vol, shown as "max DD (MTM · FULL)"), keeping the closed daily-net figure as a labelled **lower bound** (`maxDDClosed`/`calmarClosed`). The **headline** on both `forecast-analysis.html` (Book tab) and `forecast-book-report.html` is the **standard backtest** battery (`backtestStats`/`metricsCore` — one equity curve, per-trade Sharpe, additive max-DD, Calmar — the same method every other system reports, so it's comparable/explainable); `buildSurvivors` gains a `book` field for the live-universe standard stats. The concurrency-adjusted portfolio Sharpe + MTM DD/Calmar (`withMtmDD` → `volTarget.maxDDMtm`/`calmarMtm`, closed as `maxDDClosed`/`calmarClosed`) are the labelled **secondary** view (§2b "concurrency-adjusted risk"); MTM shows **n/a** on a stale/pre-MTM book. A **timing floor** (in `forecastAnalyser.js`'s barrier walk **and** mirrored defensively in `runPerLine`) gives a same-bar barrier resolution a one-bar minimum hold so `exitTime` never equals `fillTime` — otherwise ~40%+ of trades were zero-duration and the MTM read n/a (timing fields only; outcomes untouched). §2b also carries **`concentrationStats`** (exported): average pairwise daily-PnL correlation, **effective independent bets** `N/(1+(N-1)ρ)`, and single-/top-3-instrument gross-PnL share — quantifying why "N/M pairs profitable" breadth and the per-trade Sharpe both flatter (the USD complex moves as one; gold can carry a week's drawdown). Tested in `js/perLineMtmDD.test.mjs` + `js/perLineConcurrency.test.mjs` | ✅ |

> `forecastAnalyser.js` also exports **`simulateExitVariants(bars, touchIdx, {…})`**
> — a PURE exit-rule simulator that walks the same real M1 path from a touch and
> returns the ten {fade,follow}×{fixed,chandelier,walk,**ride**,**ridehold**} gross
> %-of-price PnLs + an exit-reason (`*Why` ∈ trail/stop/tp/close) for the two rides
> (conservative intrabar ordering: stop-first, then TP, then trail/BE update; no
> intrabar lookahead). **`ride`** = chandelier trail with **no TP cap** (same
> family as the range-line bot's winning exit but **NOT the same rule** — see the
> drift warning below): a reversion runs
> past the inner line instead of capping there, with a **session-close** fallback.
> **`ridehold`** = the same but walks into `forwardBars` (next day[s]) instead of
> closing at session end — "leave it running past 22:00". `analyseWindow` calls it
> on every hit touch and stamps the `ex*` fields (+ `forwardBars` from `runAnalyser`,
> `rideHoldDays` default 1); `perLineStrategy.extractTouches` carries them through and
> `runExitStudy` prices the OOS A/B/C/D/E off them. Fixed variants match `pnlFor`'s
> pre-cost gross for the same touch. Tested in `js/exitStudy.test.mjs`.
>
> ⚠️ **Known near-duplicate (deliberate — do NOT "unify"): two chandelier rules.**
> `volatility_bot/engine.py ride_trail_stop` mirrors `simulateExitVariants`'s
> `ride` (trails from entry immediately), while `pylego/strategy/rangeline.py
> chandelier_stop` mirrors `rangeLineAnalyser._trailExits`' c-path (holds at the
> protect stop until price makes a new extreme BEYOND entry). Each live bot
> matches its OWN validated book's exit; merging them either way silently changes
> one bot's strategy. Any unification must re-run the affected book's exit study
> first (2026-07 education-review finding).
>
> Consumes the analyser's already-computed adverse excursion (`extPct` = the
> continuation extreme for a fade) plus newly-captured `extTime`/`exitTime` timing
> from `forecastAnalyser.js`'s barrier walk — no new MAE math, just timing on the
> existing geometry. The brick reports the raw intraday DD, the raw closed-trade DD
> (same % units) and their **multiple**, so the tearsheet scales the vol-targeted
> headline DD up by that multiple to show a like-for-like honest figure rather than
> mixing raw and vol-targeted units.

### 1g. Event gate + MT5 magic registry (2026-07-02)

The first macro-layer wiring that actually reaches a live entry decision: a
scheduled-event blackout gate for the volatility bot (risk control, not alpha —
the bot no longer sits on fade limits through NFP/CPI/FOMC), plus the registry
that ended the MT5 magic-number collisions found in `PLATFORM_REVIEW_2026-07.md`.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Event gate core** | `js/eventGateCore.js` | `buildEventWindows(events, cfg)` (calendar rows → per-CURRENCY blackout windows, default 45m pre / 15m post high-impact; explicit-UTC `parseFinnhubTimeUTC` — `new Date('YYYY-MM-DD HH:MM:SS')` parses LOCAL in V8, a 1–5h silent shift), `eventGate(ccys, nowMs, windows)`, `pairCcys` (any symbol form → event currencies; metals/indices → quote leg). Pure, tested `js/eventGateCore.test.mjs` | `server.js` `_refreshEventWindows` (hourly → KV `event_windows_v1`). **2026-07-27: producer re-sourced from the FREE ForexFactory feed (`js/econCalendar.js` `fetchWeekEvents`) instead of calling Finnhub's `/calendar/economic` directly — that endpoint is PREMIUM and 403s on a free/standard key, so the producer had been throwing every hour and never writing `event_windows_v1`; every bot silently failed OPEN (no event suppression) even with `FINNHUB_KEY` set. Gate now runs keyless; Finnhub is a best-effort fallback only.** | ✅ |
| **Event gate (Python consumer)** | `pylego/events.py` | `blackout(ccys, now_ms, windows)`, `pair_ccys`, `stale_reason` — reads the server's PRECOMPUTED windows ("ship timestamps, not logic": no calendar parsing in Python, nothing to drift). Fail-OPEN on stale/missing, loudly. Tested `pylego/events_test.py` | `volatility_bot` (touch during blackout is **deferred, not burned** — the line re-arms after the window; priming ignores blackout; see `engine_test.py`); **2026-07-18: `range_line_bot`, `oi_bot`, `YieldSpreadBot` adopted the same defer-don't-burn gate** (skip before `decide`/enter — levels/zones/z-signals persist, so a clear tick re-fires; exits/trailing always run). `oi_bot`'s magic 20260714 registered in `magics.py` (was unregistered — `magics_test` failing). YieldSpreadBot also adopted `pylego.costs` (`max_spread` per-class cap — was a flat 50.0 no-op — and `expected_fill` sizing) | ✅ |
| **MT5 magic registry** | `pylego/magics.py` | The ONE table of bot → magic number. `pylego/magics_test.py` parses every registered bot source and fails on mismatch/duplicate/unregistered magic. 2026-07 de-collision: DynAnchorBot 20260006→**20260009**, MacroEquityBot 20260006→**20260010** (legacy read-set until its book turns over), bot/hedge_bot 20260007→**20260011** (legacy read-set; pre-change legs stay in RegimeV7's magic-space until closed) | all MT5 bots (data + CI check; no runtime import) | ✅ |

### 1h. Macro regime brick (2026-07-03) — platform review #7, TDE §7c

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Macro core** | `js/macroCore.js` | `macroRegime(fredHistory, asOfMs)` — the PRE-REGISTERED risk-regime classifier (VIXCLS level+trend, HY OAS 20-obs change; `MACRO_THRESHOLDS` **frozen 2026-07-03 before any backfill result** — editing them after seeing results voids the falsification test); `effectiveDate` (+1-business-day publication lag, Fri→Mon); `macroContext(pair, …)` → the TDE §7c snapshot object (stale >3d ⇒ NEUTRAL + `stale:true`, fail-neutral never fail-closed); `macroContextByDate(pair, …)` → the backfill injection map (per PAIR — riskSens is pair-specific; golden identity: map ≡ `macroRegime` pointwise); `riskSensFor` — **derived from `fx-macro-model.PAIR_DRIVERS` via `resolveKey` at import, zero hand copies** (golden-equality-tested, both key forms). Tested `js/macroCore.test.mjs` (25 asserts incl. end-to-end with `decisionCore.macroState`) | `server.js` (live slow loop `refreshPair(p,{macro})`, backfill route per-pair `contextByDate`, `_loadMacroFredHistoryFull` KV cache) | ✅ |

The verdict machinery lives TDE-side (`macroBucketReport` PRIMARY, ablation
SECONDARY — §7c #5). Sequencing (frozen): one full macro-OFF rebuild on the
`nextSigma` σ (the incumbent baseline — `POST /api/trade-decision/backfill/run
{full:true, macro:false}`), then the macro-ON run, then the two tests. Both
fail ⇒ macro stays out of the feature vector permanently.

Also in this pass (fixes, not bricks — full detail in `PLATFORM_REVIEW_2026-07.md`):
the vol-plan scheduler now fires at **00:05 Europe/London** (fixed 23:05 UTC was
55 min BEFORE London midnight all GMT season → every winter plan anchored on the
prior session's open), the bot **fail-closes on a stale plan** (`_plan_is_current`),
the producer's σ off-by-one is fixed via `nextSigma`, `computeMacroScore`'s
safe-haven sign is scored per-currency and mapped by leg (`js/macroScore.test.mjs`),
net-liquidity now converts WALCL $M→$B before subtracting TGA/RRP (4 sites, with a
unit sentinel + synthetic generators that reproduce the real units mismatch), and
`refreshFredDashboard` mirrors KV `fred` so the Level Bot's `vol_gate` VIX block
can actually fire (with a 24h staleness refusal in `bot/modules/vol_gate.py`).

---

### 1i. Yield-coupling brick (2026-07-04) — measure-first

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Yield-coupling core** | `js/yieldCouplingCore.js` | the price↔yield-spread coupling compute — `standardize` (population-z overlay), `alignByTime` (inner-join two/N `{t,v}` series on common timestamps), `buildSpread` (signed bond-PRICE legs → a yield spread oriented FX-bullish-when-positive; bond price is inverse yield, so the yield sign is the leg coefficient `k`, never a hidden default), `pearson`/`rollingCorr` (**candidates to promote into `statsCore`** once a 2nd consumer wants them), `gapSeries` (standardized price − spread = the error-correction residual in σ-units), `bestLag` (cross-correlation lead-lag scan; +lag ⇒ spread leads price), `directionSignal` (recent standardized-spread slope, gated by \|coupling\| and flipped on inverse coupling), `computeCoupling` (one call → priceZ/spreadZ + the four primitives). Pure, horizon/-resolution-agnostic, no network/DOM. Tested `js/yieldCouplingCore.test.mjs` (29 asserts on synthetic data). | `server.js` `/api/yield-coupling` (measure-first overlay endpoint — fetches the FX pair + OANDA bond-CFD legs, reports per-instrument data availability, returns the overlay + primitives per tenor); `yield-coupling.html` viewer | ✅ built (measure-first) |

The core also runs the **projection gate** (`computeProjectionGate`) — the
trader's ACTUAL method (FOLLOW, not fade): yesterday's yield path is projected
onto today; if price tracks it early in the session, trade ALONG it. Per day it
aligns today's price path vs YESTERDAY's yield path by time-of-day, splits at a
gate hour, and reports whether EARLY tracking predicts LATE tracking
(persistence) and whether high-early-tracking ("gate ON") days show better
afternoon tracking + a >50% follow-through of the projection's direction vs
"gate OFF" days. Intraday only (`/api/yield-coupling` non-daily; `?gateHour=`
tunable); neutral, no verdict. Distinct from the divergence/reversion tests — this
is the confidence-to-follow gate. Panel on `yield-coupling.html`.

The core also runs a **neutral walk-forward** (`walkForwardDivergence`) — the RAW
per-time-fold behaviour with NO trade bias: for each fold it reports the event
count, **reverted%** (the *sign of what price did* — >50% mean-reversion, <50%
momentum — measured, not assumed), mean forward move gross AND net-of-cost, and
Sharpe. No verdict; the numbers are the user's to judge (they flagged that baked-in
trade bias/verdicts were unwanted). Per-fold |gap| threshold, non-overlapping.
Rendered as a data-only per-fold table on `yield-coupling-real.html`
(`?wfQuantile=&wfHorizon=&wfFolds=` tunable). Purpose: is the tail edge stable
across time or one lucky fold.

The core also runs the **convexity analyzer** (`computeConvexity`) — the payoff
SHAPE a hit-rate hides: for each big-divergence event it records **MFE** (max
favorable excursion) and **MAE** (max adverse), normalised by the expected move
(σ·√H), then simulates a **stop + target with PATH-AWARE first-touch** (walk the
bars; whichever hits first wins) across a stop×target grid, netting cost, and
reports EV + hit-rate per cell + the best cell. A green cell = **positive EV even
at a low hit-rate** (the user's convexity thesis, measured) — it can't rescue
symmetric noise after cost. Panels on both `yield-coupling.html` (intraday) and
`yield-coupling-real.html` (daily).

The core also runs the **fade-to-yield backtest** (`backtestDivergenceFade`) —
the actual trade, not a diagnostic: enter when |divergence gap| ≥ an **IS-learned**
threshold (no OOS lookahead), fade toward the yield (gap>0 ⇒ long FX), hold N days,
**mark-to-close** (no intrabar path assumption), net of round-trip cost;
non-overlapping trades; true IS/OOS split; reuses `metricsCore.summarizeTrades`
(+ avgWin/avgLoss/R:R) and reports OOS **cost-stress** (1×/2×/3×). Measures EV/R:R,
which the direction hit-rate couldn't. Surfaced on `yield-coupling-real.html` with
an IS/OOS card, cost-sensitivity, and a horizon×gap-size **robustness sweep**
(lucky-cell guard). Ships only on OOS Sharpe ≥ incumbent at n≥30 surviving 2× cost.

The same core is also run on the **REAL DE–US yields** (not the CFD proxy):
`server.js` `/api/yield-coupling-real` fetches actual daily yields — US from FRED
(`DGS2`/`DGS10`), German (euro-area AAA) from the ECB yield curve, EUR/USD from
FRED (`DEXUSEU`) — builds `spread = DE − US` and runs `computeDivergenceEvents` +
`computeDailyLeadLag` on it. This is the only path that can test the **2Y**
(OANDA has no German 2Y CFD — the 2Y is the lesson's stated *direction* leg).
Viewer `yield-coupling-real.html` (2Y/10Y toggle). `_fetchFredDaily` /
`_fetchEcbDaily` are full-history fetchers (the existing `_worker.js` ECB fetch
only pulls the latest 5 obs).

The core also emits the **divergence-events** test (`computeDivergenceEvents`) —
the CONDITIONAL edge an unconditional correlation can't see: buckets days by the
SIZE of the spread-vs-FX divergence (vol-scaled trailing gap) and reports, per
forward horizon, how often FX moves to CLOSE the gap. The signature of a real
discretionary edge is a hit-rate RISING with divergence size (the ~5% of big-move
days that a per-day Pearson correlation averages into 95% noise). Rendered as a
size-bucket × horizon table (daily + intraday). Diagnostic, in-sample — the test
that matches "big spread move, FX hasn't followed, fade the gap".

The core also emits the **daily lead-lag** test (`computeDailyLeadLag`, endpoint
`granularity=D`) — the macro "spread leads EUR/USD by days" thesis (Cole/
Transatlantic-spread): cross-correlation of daily FX returns vs daily spread
returns across lags 0–30d (optimal lead + full profile) + a spread-momentum →
forward-return test (past N-day spread move → next M-day FX direction, hit vs
50%). Intraday everything was ~coincident (matches the ±2h finding); this tests
the DAILY horizon where the flows thesis says the lead actually lives.
Diagnostic, in-sample.

The core also emits the **prior-day projection** test (`computePriorDayProjection`)
— does TODAY's price path follow YESTERDAY's yield path? (the user's indicator
projects yesterday's yield forward). Groups bars by UTC date, matches consecutive
days by time-of-day, reports pooled/per-day shape correlation (% of days price
tracks) + a "calls the day" hit-rate (yesterday net yield dir → today net price
dir vs 50%). This is a **~1-day-lagged** relationship — outside the ≤2h intraday
lead-lag everything else measured, so the earlier "coincident / weak direction"
verdict never tested it. Diagnostic, in-sample; needs a deep `days=` pull.

The core also emits the **live confirmation reading** (`couplingState`) — the
daily-brief "rates-backed / divergent / decoupled" flag for the newest bar
(regime coupling + session + whether the latest move is rates-corroborated).
**Wired into the daily brief (lens 1, shipped):** `/api/yield-context?symbol=`
(lightweight, cached, reuses the M5 fetch + `couplingState` + a spread percentile)
feeds a "Rates context" section in the `today.html` per-pair drawer — CONTEXT
only, explicitly no direction call (the 22yr conclusion: yield confirms moves, it
does not forecast them).
Measured verdict that scoped it: coupling is real + regime is predictable
(1h autocorr ≈0.82) but **coincident, weak direction** → confirmation/conviction
grade, not a price forecast; `couplingState` is deliberately a context flag, not
a direction call. Lens-1 engine (surfaced on `yield-coupling.html`; daily-brief
`today.html` wiring is the next step).

The core also emits **regime persistence** (`computeCouplingPersistence`,
`laggedAutocorr`) — the "can we predict WHEN price follows the yield" test:
autocorrelation of the rolling coupling (is the regime sticky?), conditional
forward coupling (coupled-now → coupled-later?), and a directional hit-rate
(trailing yield-vs-price divergence → forward price direction, coupled vs
decoupled bucket, no-lookahead). Diagnostic (in-sample, no costs) — proves the
edge EXISTS before any harness.

The core also emits **returns-based coupling** (`toReturns`, `computeReturnsCoupling`,
`sessionBreakdown`, `sessionOfUTCHour`, `SESSIONS`) — correlating price *changes*
vs spread *changes* (the trading-relevant test; level correlation is spurious for
two drifting series) plus a per-session (Asia/London/Overlap/NY, UTC-hour)
coincident-corr breakdown, so we can see whether the coupling concentrates in the
active rates-lead-FX hours. Measured finding (EUR/USD, ~5mo M5): level coupling
washes out to ~0 over months (the +0.55 one-week reading was a transient regime);
returns/session is the deciding test for whether any tradeable edge survives.

The `/api/yield-coupling` endpoint also has a **deep-history mode** (`?days=`):
date-paginated forward fetch (`_fetchCouplingRange`, ≤30k bars) plus a cheap
earliest-available-bar probe per instrument (`_probeEarliestBar`), yielding a
**history-ceiling verdict** (feasible ≥24mo / marginal ≥6mo / too-shallow) — the
binding limit for any lens-2 backtest. Deep-pull plot arrays are downsampled to
~2500 pts; the coupling stats are computed on the full series.

The measure-first stage: prove the coupling is real on 5m and learn how much
intraday bond-CFD history OANDA actually serves, **before** wiring the planned
consumers (daily brief reading, coupling-gated z-score strategy, directional
drift hook into `dayTypeScore`/`selectStrategy`, regime filter, divergence
alert). Data reality it surfaces: OANDA carries US Treasury CFDs (2/5/10/30Y) +
the Bund (`DE10YB_EUR`) and Gilt (`UK10YB_GBP`) 10Y only — **no German/UK 2Y
CFD**, so 2Y spreads are US-leg-only (flagged `partial`). The 10Y spread is the
fully-constructible one. A backtest consumer is gated on the bond M1 history
depth the tool reports; the live/display consumers are not.

---

### 1j. Trend-basket engine (2026-07-05) — the honest factor strategy

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Trend basket** | `js/trendBasketEngine.js` | diversified G10-FX time-series-momentum backtest — `alignSeries` (inner-join `{ccy:[{t,v}]}`), `runTrendBasket` (per-currency 12-mo trend sign → long up / short down, **inverse-vol / equal-risk** sizing to a target vol, weekly rebalance, **round-trip cost on turnover**, true IS/OOS split, equity curve, per-year, current positions, + an **equal-weight long-basket benchmark** so we know it's the *factor* not a USD bet; **`directionAt` hook** swaps the per-ccy direction source — used by econ-trend AND the trend-quality selector). Pure; reuses `statsCore` + `metricsCore` (`sharpeRatio`, `maxDrawdownFromEquity`). Tested `js/trendBasketEngine.test.mjs` (10 asserts incl. trends-profit + cost-drag). | `server.js` `/api/trend-basket` (fetches ~20yr D1 for 7 ccys vs USD via `fetchOandaD1Range`, `USD_*` inverted); `trend-basket.html` viewer (IS/OOS card, equity curve, per-year, positions, honest "diversifier not wealth-engine" framing) | ✅ built |
| **Trend quality (Frog-in-the-Pan)** | `js/trendQuality.js` | momentum PATH-QUALITY filter composed onto the basket via its `directionAt` hook (engine untouched). `trendQualityScore(retWindow, measure)` — `'driftDiffusion'` (\|Σr\|/(σ·√L), the trend's \|t-stat\|) or `'fipID'` (negated Da/Gurun/Warachka information discreteness); both oriented HIGHER = SMOOTHER. `makeQualityDirection({lookback,measure})` returns a `directionAt` that keeps the top-half of trending currencies by quality (cross-sectional MEDIAN split — **parameter-free**, no tuned threshold) and zeroes the spiky rest. Pure; reuses `statsCore.stdev`. Tested `js/trendQuality.test.mjs` (12 asserts: smooth>spiky both measures, median split keeps ~half, pre-lookback all-zero, ≤2-names no-split). | `server.js` `/api/trend-basket` `qualityAB` block (baseline vs filtered, ΔOOS Sharpe + verdict `quality-wins-oos`/`quality-wins-but-thin`/`no-improvement`); `trend-basket.html` Frog-in-the-Pan A/B panel | ⛔ **null banked 2026-07-21** (full 2005→2026 OANDA run: ΔOOS Sharpe +0.01 vs ±0.37 SE = within-noise; filter shrank the book, didn't add edge — the raw FX-trend factor is itself thin, `QUANT_MOMENTUM_LESSONS.md §Result`). Bricks stay (pure, tested); the `qualityAB` verdict was also hardened to require ΔSharpe > Sharpe-SE so it can't call noise a win |
| **Carry factor** | `js/carryEngine.js` | the HONEST FX carry factor — `alignSeries` + `forwardFillRates` (monthly FRED rates → daily, no-lookahead), `runCarryBasket` (signal = **rate differential** `sign(rate_ccy − rate_USD)`, inverse-vol/equal-risk sizing, rebalance, cost on turnover, **carry accrual `(rate_ccy−rate_USD)/252` priced in**, true IS/OOS) returning a **spot-vs-carry-vs-cost decomposition** + a `spotOnly` series (the old-proxy world, no accrual) so the accrual's contribution is visible; `financingHaircut` reconciles the interbank differential against OANDA live financing (retail-swap haircut). Pure; reuses `statsCore` + `metricsCore`. Tested `js/carryEngine.test.mjs` (16 asserts incl. accrual-shows-up, signal-flip, decomposition-sums, no-lookahead, haircut math). **Interbank caveat:** accrual is an interbank upper bound — real retail carry is lower by the swap spread (that's what the haircut measures). Replaces the spot proxy in `system-fx-carry.html` (relabelled "JPY-Cross Spot Proxy — NOT carry"). | `server.js` `/api/fx-carry` (fetches ~20yr D1 + FRED 3-mo interbank rates `IR3TIB01…M156N` for 7 ccys, + OANDA account-instruments financing); `system-fx-carry-factor.html` viewer (positions by differential, decomposition bars, IS/OOS vs spot-only, retail-swap haircut, equity, per-year) | ✅ built |

The pivot after the yield investigation nulled: instead of hunting a directional
signal on one liquid pair (the picked-clean spot), harvest the **replicated,
diversified** momentum premium across many currencies — small Sharpe, real
drawdowns, honest. Distinct family from the yield work; new engine + page. Phase 2
(carry: rank by short-rate, blend 50/50 with trend) needs G10 short-rate data
(FRED/ECB partial; the rest is the sourcing work).

### 1u. Multi-factor combiner (2026-07-21) — the trend+carry blend (Phase 2 above)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Multi-factor book** | `js/multiFactorEngine.js` | the factor-agnostic COMBINER — `combineFactors(factors, cfg)` takes N **date-tagged, already-costed** daily return streams (`{name, dates, dailyRet}`), inner-joins them on common dates (`joinFactors`), normalises each to an equal risk budget with a **trailing (no-lookahead) vol** (`trailingVol[t]` uses returns strictly `< t`), equal-weights the normalised legs, then scales the blend to a portfolio vol target — the same construction as `trendFollowEngine.buildPortfolioReturns` lifted one level up. Reports headline + true **IS/OOS** stats, per-factor standalone stats over the joined window, the **factor correlation matrix**, and diversification metrics (avg ρ, diversification ratio, blend-vs-best-single-leg). Honest read: flags a blend that's dead OOS, that doesn't beat its best leg, or whose legs are highly correlated ("one bet wearing several hats" — the `SYSTEM_ASSESSMENT.md` §2.4 warning made numeric). **It sizes/diversifies edge; it does NOT create it — a blend of dead factors is dead** ("a method is not a strategy"). Pure; reuses `statsCore` + `metricsCore`, imports the factor engines' outputs, copies no signal. Tested `js/multiFactorEngine.test.mjs` (18 asserts: join, no-lookahead mutation test, blend-Sharpe-beats-best-leg on uncorrelated legs, correlated-leg flag, dead-blend honesty, guardrails). **This is Phase 2 (blend carry + trend) from §1j.** VRP (`vix-vol-carry`, Python-only) is a natural third leg but not yet wired — the engine is factor-agnostic, so it's a one-leg addition once exposed as a JS daily series. | `server.js` `POST /api/multi-factor/run` + `/status/:jobId` (async-job; runs the trend basket via `buildPortfolioReturns` on the date-aligned universe + the carry factor via `runCarryBasket({returnDaily:true})`, then blends); `multi-factor-book.html` viewer (blended KPIs + equity, IS/OOS, correlation heatmap, per-leg standalone, honest read). Needs `OANDA_KEY` + `FRED_KEY` (deployed only). | ✅ built — **infrastructure; the blend is only as real as its legs OOS** |

Small non-breaking add to `carryEngine.runCarryBasket`: an opt-in `returnDaily`
flag attaches the full daily **simple**-return series (`daily:{dates, ret}`,
`expm1` of the internal log returns) so the combiner can consume it. Off by
default — the public `/api/fx-carry` payload is unchanged.

### 1k. Z-Score V2 confidence core (2026-07-06) — macro as confidence, not gate

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Z-Score confidence core** | `js/zscoreConfidenceCore.js` | pure, network-free confidence-scoring bricks for the "z as confidence, not gate" reframe. **Phase 1:** `zAlignScore` (nominal carry confirms/vetoes the fade), `riskOffScore` (VIX+HY carry-crash veto), `approachVelRangeScaled`/`velToScore` (OOS-proven approach spike), `structScore` (fib depth — folklore, ablate-first). **Phase 1.5** (cross-asset macro docs): `realRateAlignScore`+`usdRole` (US 10Y real-yield DFII10 USD bias — the literature's preferred read over nominal), `coherenceScore` (fraction of directional macro lenses agreeing — the docs' "coherence→conviction"), `positioningBoostScore` (COT extreme the fade opposes), `isNfpFriday`/`eventVetoActive` (FOMC/NFP/CPI hard veto — NFP intrinsic). `compositeConfidence` is evidence-tiered + **null-skipping** (weight-0 OR no-data → factor drops out, rest renormalise). Plus `confBucketOf`/`computeConfBuckets` (monotonicity falsification), `buildSingleRollingZByDate`/`buildRiskOffByDate`, `splitTradesByDate` (IS/OOS). Tested `js/zscoreSpreadV2Engine.test.mjs` (40 asserts). | `js/zscoreSpreadV2Engine.js` (I/O engine: imports v1's FRED/session/fill helpers — now exported — + this core; fetches GS2/foreign-short/VIX/HY/DFII10; `runFullZScoreV2Backtest`); `server.js` `/api/zscore-v2/*` (A/B vs v1 gate); `zscore-v2.html` (OOS A/B card + 7 ablation weights + event-veto + bucket falsification) | 🟡 built, **not yet validated** (needs live `FRED_KEY` on Railway — sandbox can't reach FRED, and synthetic FRED is unreliable for this exact change). Positioning factor is null until a historical COT series is wired. |

Phase 1 of the zone→direction→confidence build. Reframes v1's binary z-gate:
the fib zone is the **structure**, direction comes from **fade geometry**, and the
yield-spread z-score is demoted to **one weighted confidence factor** beside a
research-backed **risk-off veto** (the literature's carry-crash gate) and the
internally-OOS-proven **approach-velocity**. Every factor is evidence-tiered and
independently ablatable so the A/B can *invalidate* ideas on the OOS card. v1's
`fetchFredObservations`/`_shiftDate`/`buildRollingZSeries`/`buildDayIndex`/
`analyzeDay`/`walkTrade` were exported (no logic change) so V2 imports, never copies.
**Built ≠ proven** — the real "does confidence beat the gate?" A/B must run on
Railway; do not read any local run as edge.

---

### 1l. Macro-direction predictiveness test (2026-07-07) — falsification-first, before levels/z

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Macro-direction core** | `js/macroDirectionCore.js` | pure, network-free scoring for "does macro DIRECTION lead forward FX drift?": `pairLegs`/`usdRole`/`havenTilt`/`CURRENCY_HAVEN` (pair orientation), `carryVote`/`realVote`/`riskVote` (replicated FX-directional factors as ±1 votes — 2Y-diff momentum, US real-yield momentum, VIX momentum by haven leg), `macroDirScore` (mean of votes, null/0-weight drops out), `forwardReturn`, `spearman` (rank corr), `summarizeDirection` (hit%, mean ret, Sharpe, corr — non-overlapping samples), `splitByDate` (IS/OOS). Tested `js/macroDirectionCore.test.mjs` (18 asserts). | `js/macroDirectionEngine.js` (I/O: reuses z-engine's `fetchFredObservations`/`buildDayIndex` + `loadM1ForPair` for M1→daily closes; per-horizon 1/5/20d, per-factor attribution, buy-&-hold benchmark, cross-pair pooled OOS); `server.js` `/api/macro-direction/*`; `macro-direction.html` (pooled OOS verdict + per-pair + per-factor) | 🟡 built, **not yet run** (needs live FRED + M1 on Railway) |

This is the **falsification-first** step under the "macro sets direction, levels time the entry, z-score exits" bot: test the *foundation* (does macro direction predict drift at all) before building level entries or the z-exit on top. No fib levels, no z-gate — just macro→forward return. If it's null, the premise is dead cheaply; if it leads, the entry/exit build has a load-bearing base. Z-score is explicitly demoted here to a future **exit** (z-exit), not part of this direction test.

### 1w. Macro-conditioner engine (2026-07-22) — does risk regime add to day-character BEYOND σ?

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Macro-conditioner engine** | `js/macroConditionerEngine.js` | the σ-CONTROLLED conditional: holding forecast σ fixed (tercile bucket of the causal σ percentile within-instrument), does macroCore's VIX+HY **risk regime** still move the day's *character*? `buildRows` (per London-day labels — `expand` = realized H-L in σ-units > forecast 75th `BM_P75·hl_75_corr`, `dayEff` = |close−open|÷range — + causal σ-rank + regime join + IS/OOS seg + risk-off **episode** detection + regime timeline), `summarizeRows` (cells[seg][σ-bucket][regime] + the **σ-only ablation** `sigmaOnly` + `regimeSpread` = expand(RISK_OFF)−expand(RISK_ON) within bucket), `verdict` (pre-registered: **INCREMENTAL** only if ≥2/3 σ-buckets show same-sign IS&OOS spread ≥ minSpread with ≥minN/cell, else **REDUNDANT_OR_NULL** — σ already carries it), `analyzePair`. Pure; imports `BM_P75`/`ASSET_PARAMS` (no copies), regime passed in (never fetched). Tested `js/macroConditionerEngine.test.mjs` (20 asserts — fires INCREMENTAL only on a planted within-bucket effect, REDUNDANT on noise). | `server.js` `/api/macro-conditioner/*` (async job; FRED VIX+HY via `fetchFredSeries` → `macroCore.macroContextByDate` regime map, London-daily via `buildLondonDaily`, causal σ via `volSigmaSeries`, pooled FX); `macro-conditioner.html` (grouped bars σ-bucket×regime + σ-only line, IS/OOS, spread table, risk-off episode strip, VIX+HY regime ribbon, per-pair verdicts; `?demo=1` synthetic payload); linked from `index.html` | 🟡 built, **not yet run** (needs live `FRED_KEY` + `OANDA_KEY` on Railway; sandbox can't reach FRED). Prior: likely **REDUNDANT-with-σ** — the σ-control is the hero so a null reads cleanly. |

The honest framing: risk-off is *also* high-VIX is *also* high-σ, which the forecast band already prices — so the only worthwhile question is the **incremental** one (does regime separate the day-character label *within* a fixed σ bucket). Same distance-controlled logic as `volatilityExhaustion/conditioners.py` (VWAP-stretch vs raw distance), lifted to the macro/day-character axis. It's a **dispersion/state** read that would feed sizing / target-width / posture — never a directional entry (direction at exhaustion is dead, six ways — see `volatilityExhaustion/`).

---

### 1m. Range-level edge test (2026-07-07) — the S/R folklore falsification

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Range-level core** | `js/rangeLevelCore.js` | pure test of "does a 5m range level have ANY standalone edge vs a placebo": `FIB_LADDER`/`buildLadder` (half-integer grid off a session range), `findConfluence` (today∩yesterday ladder match within tol), `mulberry32` (seeded PRNG for reproducible placebo shifts), `barrierRace` (symmetric ±D bounce-vs-break race, same-bar tie → break), `summarizeRace` (bounce rate + after-cost expectancy over resolved races), `edgeVsPlacebo` (real − placebo bounce delta). Re-exports `splitByDate`. Tested `js/rangeLevelCore.test.mjs` (13 asserts). | `js/rangeLevelEdgeEngine.js` (I/O: reuses `loadM1ForPair` + the z-engine's `analyzeDay`/`buildDayIndex`; real levels = Asia edges + today∩yesterday confluence, each with a shifted PLACEBO control; per-pair + pooled OOS); `server.js` `/api/range-level-edge/*`; `range-level-edge.html` | 🟡 built, **not yet run** (needs M1 on Railway) |

The **foundation-below-the-foundation** test: before macro/z/confidence, does price "respect" a range level more than a random price? The only honest S/R test is vs a **placebo** (same level shifted to the wrong spot) — if real ≈ placebo, "levels work" is folklore. Symmetric barrier (no R:R to game), after-cost, IS/OOS. Ordered after the macro-direction null: prove the *level* has edge before asking whether a (weak) macro filter improves entry selection.

### 1n. Cross-pair forecast-behaviour research (2026-07-08) — the "trend spotter"

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Cross-pair research** | `js/crossPairResearch.js` | pure SYNTHESIS over the already-persisted per-pair research JSON (`vfr_research` + optional `intraday_research`) — reads the AGGREGATES, does not re-run engines. `pairType`/`PAIR_TYPE_LABELS` (major/eur-cross/jpy-cross/other-cross/gold/index), `signTestP` (two-sided binomial), `analyzeCrossPair(vfr, intraday, opts)` → `{ reliability, trust, byType, consistency, hidden, hypotheses }`: (A) cross-pair **consistency** — per-metric sign test → Benjamini–Hochberg → `robust` only if it also spans ≥2 pair types; (B) **trust tiers** trade/caution/exclude via hard rules + robust-z (median/MAD) outliers + bottom-tertile; (C) **pair-type profiles**; (D) percentile-ranked composite **reliability score** (calibration/skill/sharpness/low-error, weights 0.30/0.30/0.25/0.15); **(Phase 2) `hidden`** — aggregates each pair's `featureScan` into cross-pair predictor→miss relationships + pooled day-types; **(Phase 2b) `hidden.session`** — within-day session-share→miss relationships (same discipline); **(2c) `touchBehaviour`** — folds the intraday touch study cross-pair (touch rate, fade-vs-follow sign test, MFE/MAE, fade-in-range/follow-in-trend split) — the BOT-relevant layer; **`costSurvival`** — the Q8 make-or-break screen (each touch → ±20-pip symmetric bracket, per-touch net = `20×|revFrac−contFrac| − cost` at cost ×1/×2/×3, `COST_PIPS` table); **FX-aware verdict** (indices discounted) and **`byLine`** comparison of **five fade lines** — **median** (≡ open-close: note `oh/ol_median` alias `oc_median` in the forecaster), **75th**, **calm-day median** (`touches.conditionalCalm`, the short-gamma tail filter), and the **dynamic H-L range** median + 75th (`touches.dynExtension`/`dynP75Extension` — the opposite extreme projected from the RUNNING high/low, moving intrabar via `_dynLevelOutcome`, the M1-justifying level set; see `CONDITIONAL_FADE_DESIGN.md`); the touch study now runs on **walk-forward recalibrated** bands (level distances scaled by trailing realized÷forecast H-L — the bands a bot would trade, not the too-wide raw lines; `touches.bandsRecalibrated`/`recalFactor`, opt-out `recalibrate:false`); **the three GATES**: `touchBehaviour.placebo` (G1 — is the forecast level > a jittered placebo? sign test + type spread), `touchBehaviour.payoffShape` (G2 — is fading short-gamma? median skew + avg-win/avg-loss across pairs), and `portfolioIndependence(returnsByPair)` (G3 — effective independent bets = participation ratio n²/ΣC²ᵢⱼ of the daily-return correlation matrix); **`botQuestions`** — 3 gates + the 8-question funnel, tagged answerable/GAP; **`trust`** tiers are now RELATIVE terciles of reliability + a sharpness≤0 floor (the old absolute skill/calibration gates wrongly excluded the whole universe); **`recal`** passthrough surfaces the reference-forecaster drift. Tested `js/crossPairResearch.test.mjs` (11 asserts incl. touch-behaviour + relative tiers). | `server.js` `GET /api/cross-pair-research`; **`cross-pair-research.html`** (canonical page, linked from `index.html`; see `BOT_DECISION_QUESTIONS.md`) + `vol-research-book.html` chapter (summary + link) | ✅ built (Phase 1+2+2b+2c) |
| **Per-hit line-fade study** | `js/intradayForecastResearch.js` (`touches.perHit`) | for each STATIC forecast line (O-H/O-L median & 75th, O-C median & 75th) the post-touch excursion is now measured **separately from each of the first N taps** (`_perHitExcursions`, `MAX_HITS=6`), so the fade (MAE, reversion back toward the interior) vs blow-through (MFE continuation, `continuePct`) can be read **per hit** — bucketed 1st / 2nd / 3rd+ and sliced by BULL/BEAR/RANGE. Each bucket: `{ n, continuePct, reversePct, meanFadePct, meanContPct, meanFadePips, meanContPips }` (% is vs the line price so it composes cross-pair). Tests the "3rd hit blows through" folklore — a rising `continuePct` by the 3rd+ tap = the line has stopped holding; a `good` finding fires when 1st→3rd+ blow-through rises >5pp. Dynamic day-H/L lines are excluded (they move intrabar). Tested `js/intradayForecastResearch.test.mjs` (per-hit partition + hand-crafted 1st-fades/3rd-blows-through). | `server.js` `/api/intraday-research` (auto-serialized via `evaluateIntradayAllHorizons`); **`today.html`** per-pair drawer "Line fade by hit" table (daily/weekly toggle, regime selector, 1st/2nd/3rd+ columns) | ✅ built |
| **Band-calc A/B** | `js/bandCalcAB.js` | `bandCalcAB(dailyBars, assetClass)` — walk-forward evaluation of candidate range CALCS (Feller×corr ≈ current page, pure Feller on YZ/HV20/EWMA σ, **climatology** trailing-HL quantiles, **empirical ratio × σ** self-scaling) scored by **calibration** (exceed-median→50 / exceed-75→25), **sharpness** (corr forecast↔realized), MAE/bias; ranks by calibration miss (sharpness tiebreak). Answers "is the Feller-constant band right, or is an empirical calc better?" Reuses σ estimators + BM constants from `volBacktestEngine` (never copied). Tested `js/bandCalcAB.test.mjs` (empirical calcs self-calibrate ~50/25, ranker orders by calib, no-lookahead). | `server.js` vfr run attaches `summary.bandCalcAB`; `crossPairResearch._bandCalcFold` → `bandCalc` (cross-pair median per calc); `cross-pair-research.html` "Base calc" section | ✅ |
| **Forecast feature scan** | `js/forecastFeatureScan.js` | pure per-pair "hidden relationships" + day-type layer over the engine's per-day `rows` — `scanFeatures(rows, {sessionByDate})` → `{ correlations, importance, missProfile, dayTypes, sessionRelationships }`. Only **causal** predictors (regime, forecast-time vol/vov, trailing climatology, recent÷baseline realized range, yesterday's outcome) — never same-day realized features (lookahead). Spearman corr vs miss-size + completion; feature-importance rank; big-miss profile; seeded (deterministic) k-means day-type clustering; **(2b) `sessionRelationships`** — when a per-day session series is joined, Asia/London/NY share correlations vs miss (labelled within-day / descriptive, NOT pre-open). Tested `js/forecastFeatureScan.test.mjs` (8 asserts incl. planted vov→miss + planted Asia-share→miss recovery). | `server.js` vol-forecast-research run attaches `summary.featureScan = scanFeatures(ev.rows, {sessionByDate})` per pair (session series from `dailySessionContributions`); consumed by `crossPairResearch.hidden` | ✅ built (Phase 2+2b) |

The **anti-overfit layer** over the per-pair book: not "was one pair's forecast right?" but "which patterns hold across pairs of different *types* (worth trusting) vs pair-specific noise, and which pairs to discount." Analysis, **not** a strategy — the decision/selector layer is an explicitly deferred Phase 3, gated on this surfacing robust, type-diverse structure (see `CROSS_PAIR_RESEARCH_DESIGN.md`). **Phase 2** runs the per-day feature scan where the engine's `rows` exist (server run-time, attached as `summary.featureScan`) rather than persisting 65k raw rows; **Phase 2b** joins the per-day session series (`dailySessionContributions`) for within-day session→miss relationships. Remaining boundary (2b-ii/2c): session-contribution *accuracy* needs the forecaster to emit an Asia/London/NY split; macro/news conditioning needs an economic-calendar join.

### 1o. Vol-forecast level-proximity alert brick (2026-07-09)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Vol-level alert core** | `js/volLevelAlertCore.js` | the pure decision + message logic for the vol-forecast-v2 level-proximity Telegram alerts — a **selector/formatter** brick that owns NO math, only composes existing bricks: `approachSpeed` (net-displacement-over-ATR "blasting vs drifting" via `indicatorCore.atrWilder`), `momentumZ` (WaveTrend WT1 latest z-score via `vumanchuCore.waveTrendSeries` + `statsCore.rollingZAt`), `divergenceLabel` (regular/hidden divergence via the `vumanchu.detectDivergence` brick), `scanNearLevels` (live price → forecast levels within a per-pair pip threshold; O-H/O-L med+75th direct, H-L med+75th projected into upper/lower price extremes from the session open), `formatAlert`/`evaluatePair` (pretty informational Telegram text — `pairIcon` country-flags/🥇/index glyphs, `LEVEL_NARRATIVE` plain-English level meaning, explicit current + level price). `LEVEL_LABELS`/`ALERT_LEVEL_KEYS` registry. Plus `dispersionContext`/`formatDispersionLines` — the daily **dispersion** block (renamed from "budget": the depletion metaphor was falsified — range is a distribution the day samples from, not a tank that drains; `MARKET_STATE_FINDINGS.md` Tier 3 #4): factual range-used-% (session H-L ÷ forecast median day) and the OOS-validated **expansion regime** (transparent rule: lean EXPANSION if prior day blew through its 75th OR σ accelerating >1.10× prior-5; validated in `volatilityExhaustion/daytype_classifier.py`, pooled-FX OOS +8pp separation). Deliberately a **magnitude/break-vs-hold** read, NOT direction (the trend-character label tested null, AUC 0.505) — footer says so. All pure (bars/levels/price in → object/string out) — tested `js/volLevelAlertCore.test.mjs` (16 asserts, synthetic bars, no network). | `server.js` `checkVolLevelAlertsNow` loop (90s) + `/api/vol-forecast/level-alerts/*` config/creds/test/scan endpoints, reading levels from the extracted `computeDailyBrief()` (one source of truth with the dashboard); the dispersion regime is computed via `_volLevelDailyRegime` on the SAME `volSigmaSeries`/`nextSigma` σ the plan uses (imported, cached per sym/day); config UI on `vol-forecast-v2.html` (🔔 Level Alerts panel, dedicated Telegram bot) | ✅ built |

The alert loop reads its levels from `computeDailyBrief()` (the `/api/daily-brief` builder extracted into a reusable function in this pass) so the alerts fire on the *exact* prices the dashboard shows — no second copy of the level math. Uses its OWN dedicated Telegram bot (`tg_vollevel_config` KV) separate from v1 + levels-v2; config in `vol_level_alert_cfg`. Enrichment candles come from the shared OANDA candle path (M5). All alerts are explicitly informational — no trade signal.

---

### 1p. QMR shared exit walk + cost netting (2026-07-12)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **QMR trade walk** | `server.js` (`_qmrWalkTrade`, `_qmrNetReturn`, `QMR_COSTS` — inline next to `QMR_TIMING`, not yet a `js/` module) | the ONE per-trade exit rule for the QMR session-momentum system: stop-before-TP within a bar (conservative), then EOD close on the first bar labeled ≥ `QMR_TIMING.eodHour`, last-close fallback for truncated days; plus the one cost-netting formula (raw move − costPct − stop-slip, × leverage) and the shared cost constants (0.008% / 0.005%) | `_computeNqQmr` (all four systems: S1, S2 counterfactual, S3/S4 fades) AND `_qmrResolveForward` — the live forward-validation resolver that writes actual after-cost outcomes of sent alerts into the four `*_qmr_audit` KV logs (NQ/SPX/DOW/DAX), so the forward record is apples-to-apples with the backtest by construction. Tested on synthetic bars incl. a 5000-case fuzz vs the pre-refactor inline walk (scratchpad harness, 2026-07-12). | ✅ built (inline) |

If a third consumer appears (or the QMR engine gets versioned out of `server.js`), extract `_qmrWalkTrade`/`_qmrNetReturn`/`QMR_TIMING`/`QMR_COSTS` into a proper `js/qmrCore.js` brick with a checked-in unit test.

### 1q. Econ-calendar feed brick (2026-07-14) — free source + fail-visible

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Econ calendar core** | `js/econCalendar.js` | the scheduled-events FEED (not the gate — that's `eventGateCore`): `fetchWeekEvents({finnhubKey})` → `{ok, source, error, events}` — ForexFactory `ff_calendar_thisweek.json` (FREE, no key) primary, Finnhub `/calendar/economic` (PREMIUM, 403s on a free key — the silent-empty root cause) best-effort fallback, 30-min module cache, `ok:false` on a dead feed so callers distinguish a quiet day from a down feed. Pure normalizers: `normalizeForexFactory` (FF currency→Finnhub country via `CCY_TO_COUNTRY`, `title`→event, `forecast`/`previous`→estimate/prev, ISO+offset date→`ms`+UTC `"YYYY-MM-DD HH:MM:SS"` `time` the client re-parses) and `normalizeFinnhub` (reuses `eventGateCore.parseFinnhubTimeUTC`). Tested `js/econCalendar.test.mjs` (23 asserts, synthetic rows + mocked-fetch flow). | `server.js` `_fetchTodayEvents` (morning brief + per-pair snapshots; sets `_calFeedOk` → the brief's "feed UNAVAILABLE" sentinel vs "no events") + new `GET /api/events` (today.html "Watch" strip + per-pair chips — the route previously existed ONLY in the retired `_worker.js`, so on Railway it 404'd to the SPA fallback and the strip was permanently blank) + `volForecastScheduler.fetchNewsEvents` (the forecast news-multiplier → today.html "Event risk" tile; filters the week to the session's UTC date, feeds `detectNewsMultiplier`). Wiring the scheduler **restores event-day forecast range-widening** — the multiplier was silently stuck at 1× on the Finnhub-403 path (verified end-to-end: a CPI+Fed-testimony day now yields 1.18×). | ✅ built |

### 1r. Forecast-path cone / replay brick (2026-07-18)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Forecast path core** | `js/forecastPathCore.js` | the cone/replay/sample-path math behind the Forecast Path viewer: `buildForecastContext` (one pass: σ via `volSigmaSeries`, EWMA log-return drift, lagged `momentumSignal` trend score — every value usable at i reads data **strictly < i**), `coneFromContext`/`forecastCone` (analytic next-H-days claim: drift path capped at ±0.5σ/day + P50/P75 close-displacement envelopes = `computeBands` at σ√h — horizon-agnostic scaling, zero copied vol math; `i === n` gives the LIVE cone via `nextSigma`; **`opts.bandsFn`** swaps the band calibration — computeBands-shaped fn in, e.g. COG's raw constants (`cogReverseEngineer.COG_CONST`) — envelopes + tally grade the swapped claim while the drift line stays calibration-independent), `samplePaths` (seeded mulberry32 Monte-Carlo candle paths from the same claim — wicks documented as cosmetic, padded to the Feller median daily range; per-step median = the "most-agreed path"), `calibrationTally` (non-overlapping H-day windows, rankIC-style: P50→50% / P75→75% containment per step + drift-direction hit rate vs the 50% coin flip, full-history AND recent slice), `nextWeekday`. **Drift source / honest direction test (2026-07-21):** `opts.driftSource` = `'ewma'` (default, past-return EWMA) · `'trend'` (the replicated multi-lookback momentum **sign** from `trendFollowEngine.momentumSignal`) · `'blend'` (mean) picks which drift bends the cone center AND is graded by the tally's `direction.hitRate` — so `'trend'` runs the honest OOS direction question through the exact same non-overlapping-window grader. `opts.trendDriftFrac` is a **display-only** lean scale (how far the trend line bends at full conviction) that provably cannot change the graded number — only `sign(trend)` is graded, magnitude-independent. `forecast-path.html` draws it as the orange **"Trend line"** toggle next to blue (EWMA) + purple (consensus) with a blunt live hit-rate label ("calls next H-day move X% vs the 50% coin flip — context/sizing only, never a signal"). Daily cone only (trend is a daily-horizon signal). Honest prior/result: ~coin flip, as expected; the label makes that legible so the line can't masquerade as edge. **Per-pair card readout (2026-07-21):** `server.js` `GET /api/forecast-path/trend-dir?pair=` (daily bars via `_btFetchD1`, `driftSource:'trend'` live cone + `calibrationTally` → `{dir, trendScore, hitRate, n, recentHitRate, recentN}`, 3h per-pair cache) feeds a lazy **"trend bias (daily)"** row in `today.html`'s per-pair drawer Forecast-Path section — arrow + its own live 10-day hit-rate vs 50%, coloured only when meaningfully off the coin flip on n≥100; the deep-link to the full line already sits in that section. **Intraday extension (2026-07-18):** `buildIntradayContext` / `intradayCone` / `intradaySamplePaths` / `intradayTally` — the "next few hours" cone on M15/M5 bars (bar size inferred from the grid): per-bar EWMA σ × a **causal hour-of-day profile** (`profileMult` — bucket RMS ÷ global RMS from strictly-prior returns, prefix-sums + `barUtils.bisect`; the session shape Asia-quiet/London-loud that a flat √t cone would miscalibrate at every open), Gaussian close-displacement envelopes (|z| 0.6745/1.1503 — the Feller constants describe a DAILY session and don't apply per intraday step), FX weekend-gap hop for live-edge times, same tally discipline/claims. **Event-aware widening (2026-07-19):** `opts.events` (release epochs, caller filters by currency/rank) + `opts.eventAware` — steps inside a release window get × the **learned** `eventMult` (near-event RMS ÷ same-hour causal baseline; the hour-bucket contamination deliberately cancels in the applied `profileMult × eventMult` product — documented in-module, verified on planted synthetic events), floored at 1/capped at 4, 1 until ≥20 near-event obs; `intradayTally` gains `eventSplit` (event vs quiet final-step cells, classification independent of the flag) so the page A/Bs the conditioner on/off — pre-registered: event-bucket P75 toward 75%, quiet unchanged, else it hasn't earned its place. `intradayTally` additionally splits the FINAL-step claim **by entry hour** (`byHour` — when is the cone trustworthy?) and by **range-budget spent at entry** (`budget` — today's high-low so far ÷ the causal same-hour median of prior days → cold/normal/hot buckets with final-step containment + median realized |z| vs the claimed 0.674; MEASURES the exhaustion-vs-persistence question, never rescales the cone — a conditioner must earn its way in via a stable gap first). `intradayRealizedZ` + `normCdf` — the "surprise meter": where a price sits inside the cone drawn h bars earlier (z + claimed percentile). **Implied-vol width conditioner (2026-07-19, measured-first/default OFF):** `opts.ivByDate` ({date→implied-vol level, e.g. EVZ/GVZ/VIX} — brick pure, server passes it in) + `opts.ivConditioner` scales the whole day's base σ by implied ÷ its own causal trailing median (clamped 0.5–2×; uses implied as of the PRIOR trading day); `intradayTally` gains `ivStat` (did the multiplier vary) + `overall` (containment cell for the on/off A/B) — tests whether forward-looking implied adds anything beyond the realized σ already in the cone; honest prior = coin flip, the A/B decides. **Bust attribution (2026-07-19):** `intradayTally.trendSplit` — final-step containment/med|z| by CAUSAL approach-trend (Kaufman efficiency ratio of the prior H bars: chop <0.25 / mid / trend >0.5) → "do busts cluster when price was already trending in?" A diagnostic (post-hoc understanding) that doubles as a width-conditioner candidate if the trend bucket's med|z| sits high; `pathAdherence` (pooled P50/P75 containment across window×step — "how tightly price hugged the most-agreed path", a range fit not a direction call). **Stop reality (2026-07-19):** `intradayTally.excursion` = `{p50,p75}` each `{touch, touchEither, closeBeyond}` — for a stop at the FIXED final-step band level, the one-sided intrabar TOUCH rate vs the one-sided CLOSE-beyond rate (apples-to-apples). touch ≫ closeBeyond = the reflection effect, the honest number for stop placement (a stop is a fixed line, NOT the widening cone — the earlier widening-cone version overstated the hit rate). Finite-horizon reflection principle (a mentor raised the LIL asymptotic, which doesn't bite at 4h; reachability already had the fixed-barrier form). **Day range budget / "vol left in the day" (2026-07-19):** `dayRangeStatus(bars)` — pure intraday range climatology (no edge claim): for the current partial UTC day, the high-low range used so far, its busy/quiet percentile vs prior same-hour days, the typical full-day range, and how much range a typical day still has left. Surfaced on `forecast-path.html` (side card) + `today.html` drawer (via `/api/forecast-path/summary` `dayBudget`). **Reachability (2026-07-19) — the "price" primitive:** `intradayReachability(ctx, i, target, H)` — Monte-Carlo first-passage from the cone's own drift+σ ladder (seeded, intrabar wick touch counts) → `{pTouch, medBarsToTouch, side, z}`: the calibrated probability price TOUCHES a level (TP/SL) within the window + typical time; `reachabilityCalibration(bars)` grades it (predicted vs realized touch-rate reliability curve + mean `gap`) — the falsification before it's trusted. Consumers import the CLAIM, never re-simulate. **Intraday excursion / "how far it may reach" (2026-07-22):** `intradayExcursion(ctx, i, H)` — the running MAX high / MIN low over the window (the day's REACH, a DIFFERENT quantity from the close-location envelope, which understates a high), from the same seeded MC + intrabar-wick model as reachability → median/75th/90th up & down as `{pctile, frac, price}` off the anchor; `excursionCalibration(bars)` grades the labels (a level at pct p must be exceeded (100−p)% of the realized windows: p50→50 %, p75→25 %, p90→10 %; mean `gap`→0). Powers `forecast-path.html`'s **"Intraday range — how far it may reach"** table (High/Low levels at median/busy/big-day with Δ-from-now, the intraday session-shaped sibling of the vol-forecast daily range panel), calibration note in the footer. Reach ≠ the fan: use the excursion, never the envelope. Imports `forecastCore` (volSigmaSeries/nextSigma/computeBands) + `trendFollowEngine.momentumSignal` + `barUtils.bisect` — never copied. A **calibration viewer's engine, not a strategy** — no entries, no PnL claims. Tested `js/forecastPathCore.test.mjs` (1286 asserts: no-lookahead mutation tests daily+intraday, cone shape, synthetic containment near claims at both granularities, the hour-of-day profile recovering a known 2× loud/quiet regime causally, seeded-path determinism, consensus≈drift self-checks, the drift-source block — trend/blend bend by the momentum sign, fractional band width is source-independent, `trendDriftFrac` provably can't flip the graded direction hit-rate — and the excursion block: reach levels ordered + monotone in percentile, seeded-deterministic, and the exceed-rate calibration near claimed on synthetic bars). | **Cone forward-track** | `js/coneForwardTrack.js` | the live post-research record (pure): `makeClaim` (live summary → a 4h cone claim), `shouldRecord` (~hourly dedupe/pair), `resolveClaims` (matured claim + realized bars → close-in-P75 / intrabar-touch-P75 / drift-direction outcome), `pruneStale`, `summarizeForward` (forward P75 containment vs claim 75%, touch rate, direction vs coin flip, per-pair). Server-side kv (single `_CF_EXACT` gate: `cone_fwd_log`/`cone_fwd_meta`); `server.js` `POST/GET /api/forecast-path/forward*` + 30-min auto-tick (`CONE_FWD_AUTO`); `forecast-path.html` "Forward track" card. Tested `js/coneForwardTrack.test.mjs` (19). | ✅ built |
| **Surprise alert core** | `js/surpriseAlertCore.js` | the "is this cone reading worth a ping?" decision + message builder (pure, no network/clock): `detectSurprise(summary, opts)` (one `/api/forecast-path/summary` row → null or an alert with `category`, `direction`, `phase`, `dedupeKey`, `severity` 1–3, and `.text` = HTML ready for `sendTelegram`). **Corrected semantics (2026-07-21):** the surprise `pct` is `normCdf(z)` of NET displacement from the day-open, i.e. **directional** — so `pct ≥ pctHigh` = **stretched UP** and `pct ≤ pctLow` = **stretched DOWN** (both are big directional moves; the old code mislabeled `pct ≤ pctLow` as "quiet", which never fired for a genuinely compressed day and mis-narrated a down-move as expansion). **TRUE quiet** now comes from a separate trigger: `dayBudget.consumedPercentile ≤ quietBudgetPct` with `reliable` (a compression measure, not the displacement pct). **Path-awareness (2026-07-21):** stretched pings read the server's intraday-excursion fields (`surprise.dispPct`/`peakPct`/`retraceFrac`/`reversing`, computed off the real M15 high/low path in `_fpSummarizePair`) and branch `phase` **extending** (near the intraday extreme → "continuation stretched", fade context) vs **reversing** (pulled ≥⅓ back from the extreme → "the fade is already underway, late to chase", protect-profit wording) — the displacement z was path-blind and read a spike-then-reverse identically to a steady grind. Stretch still gated by `pctHigh/pctLow` **and** |z| ≥ `zMin` **and** cone calibration `minCalibN`. Every message ends with a **next-steps line that is explicitly NOT a buy/sell call**. `shouldFire`/`recordFired` dedupe on `dedupeKey` (`category:phase`) so an extending→reversing transition sends a fresh ping instead of being suppressed (`minGapMin`). A CONTEXT ping, never a signal. Server-side kv config in `_CF_EXACT` (`surprise_alert_config`); dedupe state (`surprise_alert_state`) deliberately ephemeral. `server.js` `GET/POST /api/forecast-path/alert/config` (creds masked) + `POST …/alert/test` + `POST …/alert/scan?dry=1` (preview) + 20-min auto-scan (`SURPRISE_ALERT_AUTO`); `forecast-path.html` "Surprise alert" card. Tested `js/surpriseAlertCore.test.mjs` (34 asserts: stretched up/down direction, low-pct is stretched-down NOT quiet, budget-based quiet + reliability gate, extending vs reversing wording + peak/current quote, magnitude+calibration guards, severity ramp, event/shaky/budget context, phase-aware dedupe). | ✅ built |
| `forecast-path.html` (client-side; D1 via `/api/weekly-vol-backtest/d1/:pair`, M15/M5 via `/api/weekly-vol-backtest/{m15,m5}/:pair` — one shared `_wbtIntradayRoute` handler in `server.js`; pip-precision axis via `instrumentRegistry.priceDigits`; news markers via `GET /api/calendar-events` — the `newsCalendar` CSV parse topped up past its tail by the live `econCalendar` week feed; level overlay via `levelSources.collectLevels` on causally-resampled bars + `barUtils.resampleTo`/`bisect`); **`server.js` `GET /api/forecast-path/summary`** (per-pair compact claims API — live event-aware 4h cone P75 envelope + full cone coordinates for drawing, surprise-vs-day-open percentile, trusted/shaky hours from the by-hour tally, release windows ahead; plus the Monte-Carlo consensus ("most-agreed path"); 15-min per-pair cache; consumed by `today.html`'s drawer "Forecast Path" section + on-chart cone overlay (blue predicted + purple most-agreed + P50/P75, last candle padded to ~3/4 so the cone has room) and `position-sizer.html`'s intraday noise-floor check — both import the CLAIMS, never re-derive cone math) + **`GET /api/forecast-path/reach`** (target reachability for programmatic consumers — per-line book, OI zones, alert thresholds: `?pair&target&hours` → `pTouch`/`medBarsToTouch`/`reliabilityGap`, live event-aware cone, 5-min bar cache) + **`GET /api/forecast-path/iv`** (daily implied-vol history for the width-conditioner A/B — EUR/USD→EVZ, GOLD→GVZ, US indices→VIX via FRED, 6h cache; `supported:false` for FX crosses); linked from `index.html` (Live ▾ + sitemap Vol-Level Research), deep-linkable via `?pair=&gran=&calc=` | ✅ built |

### 1s. Macro-change brick (2026-07-21) — what moved, not just the level

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Macro change core** | `js/macroChange.js` | day-over-day / 1w / 1m change on the tracked macro series so the briefs can SAY what's shifting ("10Y +6bps today → yields grinding higher"), not just quote the level. Pure: `seriesDeltas(pts, windows)` (last value + Δ over 1/5/20 OBS from the ascending `[{date,value}]` fredhistory shape; FRED daily series skip weekends → 1/5/20 obs ≈ 1d/1wk/1mo), `buildMacroChanges(histByKey, spec)` → `{rows, windows, text}` with per-series bps-vs-points scaling (rate/spread series in % → Δ×100 bps; VIX/DXY levels → points), a derived **2s10s** row (10Y−2Y deltas, steepening/flattening), 1d-based direction arrow + credit widening/tightening note, and a preformatted prompt block; `formatMacroChanges`. `MACRO_CHANGE_SPEC` = the daily set (us2y, us10y, tips, bei, hy, vix, dxy) **plus money-market plumbing** (sofr = the overnight repo rate → bps; rrp = the Fed's reverse-repo facility usage `RRPONTSYD` → `$bn` `flow` kind, change shows liquidity draining/building). Tested `js/macroChange.test.mjs` (26 asserts, synthetic series). | `server.js` `_loadMacroChanges` (reads `fredhistory_series_<key>` KV, 30-min cache) → **injected into BOTH AI briefs** (`_buildMorningBrief` "WHAT MOVED" block + rule to anchor on the shift; `_injectServerContext` → `buildAnalysisPrompt` per-pair block) + `GET /api/macro-changes` → `today.html` "What moved" strip (per-series 1d/5d/20d chips, credit tinted by widening/tightening). `sofr`/`rrp` added to `_FREDHISTORY_SERIES` (SOFR/RRPONTSYD). Situational-awareness/readability, NOT an edge signal. | ✅ built |

---

### 1t. Reversion-ladder brick (2026-07-19) — visual fade-the-band tally

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Reversion ladder** | `js/reversionLadder.js` | the "fade a vol-forecast line, target the level below it" spec + resolver, as a VISUAL/DIAGNOSTIC brick (not an edge claim — the tally it makes is in-sample; fading extremes is folklore, default prior null). `LADDER_LINES` (the 8 forecast lines — H/C±/L × med/p75 — single definition shared with the overlay), `ladderLevels(open, pcts)` (the 8 line prices off the open from a `{hl_median,hl_75,oc_median,oc_75}` PERCENT object — calc-agnostic, fed by the page's Original/COG toggle — with each line's reversion **target = the adjacent inner band on the same side, innermost → the open**), `reversionTrades(open, bars, pcts, {armed,costPct,style,sltp,forwardBars,decideAction})` (**`decideAction(line,touchIdx,bars)→'fade'|'follow'|null`** = a per-touch SELECTOR that overrides the fixed style — the brick finds the first-touch bar (`firstTouchIdx`, exported) and lets the caller pick fade/follow from a causal signal read there (null → no trade); the momentum & divergence styles use it. **`forwardBars`** = EOD handling: omit → the walk sees only the session so an unresolved trade marks to the session close (kill-at-EOD); pass the following sessions' bars → the trade RUNS past EOD until SL/TP (entry still constrained to the session via `fillTime ≤ sessionEnd`, so kill/run share the identical entry set — only the exit horizon differs). **`sltp`** picks the exit: `{mode:'level'}` (default) = TP the adjacent band + symmetric SL; `{mode:'fixed',slDist,tpMult}` = a fixed PRICE stop distance (caller converts pips/points) with TP = slDist×tpMult, same entry line + direction — the "5-pip SL, 2R TP" A/B; per **`STYLES`**: `fade_all` = fade every touched line — SELL an up-line / BUY a down-line, limit at the line, target the adjacent **inner** band; `follow_med_fade_75` = MEDIAN lines FOLLOW — stop THROUGH the line, continue the move (BUY up / SELL down), target the adjacent **outer** band, skipped on the outermost — while 75th lines still fade; **stop symmetric** (1:1 on distance) either way; resolved by the **shared `walkBars` fill walker imported from `forecastCore.js` — never copied**: SL-first, TP not booked on the limit fill bar, a candle straddling both = LOSS, unresolved marks to session close; walkBars labels a positive mark-to-close as `'win'`, so the brick re-classifies by the exact entry→target distance to split a true target-hit from an `'expired'` drift), `tallyTrades` (per-line + total: touches/wins/losses/expired/win%/ΣNet%). Pure, no DOM/network. Tested `js/reversionLadder.test.mjs` (40 asserts: target ladder + innermost→open, adjacent-outer target, symmetric stop, fade + follow win/loss/straddle=loss/expired/no-touch both directions, style routing (med→follow/p75→fade), cost netting, tally, armed=null fires all 8). | `forecast-reversion.html` (client-side copy of the Replay page as a `<script type="module">`: per-line arm chips, a **Style toggle** (Fade all / Cont med · fade 75th), an **SL/TP toggle** (Next level / Fixed pip-point SL + TP× — unit auto pips-for-FX/points-for-gold-indices / **ATR** — SL = mult×Wilder-ATR(period) computed causally on the loaded TF, per-day entering-session ATR, vol-relative stop + TP×), an **EOD toggle** (Kill @ EOD / Let run — run holds up to ~5 sessions past close), a **🔍 Scan SL/TP** modal (sweeps a fixed SL × TP-multiple grid — SL as multiples of the median band distance, auto-shown in pips/points — over the current touches, colours each cell by avg net %/trade, highlights + click-applies the best; framed in-sample "trust a plateau not a spike"), **Momentum, Divergence, Budget & Timing styles** (a signal decides fade-vs-follow per touch instead of a fixed choice — momentum = WaveTrend overbought/rolling-over → fade; divergence = regular price↔WT divergence → fade, else follow; **budget** = realized÷expected day range at the touch (`cut`) — unspent → fade, spent → follow (tested ~null — vol-spent runs opposite to the exhaustion premise); **timing** = session fraction of the touch (`Tcut`) — early → fade, late → follow, the cleanest separator the Fade/Follow panel found), a **⚖ Fade/Follow panel** (geometry-neutral revert-vs-continue race per touch, bucketed by vol-spent / line-family / tier / **session** (Asia/London/NY) / **day-of-week** / timing + a **MAE/MFE-per-outcome** table for stop sizing — measure-first, the honest single-variable alternative to a fitted multi-weight "state engine"), a **〰 Osc** toggle drawing the WaveTrend pane + price↔oscillator divergence connectors (regular=solid/reversal, hidden=dashed/continuation; bull green / bear red) in a reserved bottom band, armed forecast lines drawn+labelled (name/±%/price), on-chart entry ▸ exit trade markers coloured win/loss/expired, a live per-line tally split by calc + style, costs-on by default; reuses `/api/ohlc-range` + `/api/vol-forecast/{backtest-range,archive/range}` — **no server change**); linked from `vol-forecast-v2.html` (next to 📊 Replay) + `index.html` (quick-hub + sitemap) | ✅ built — visual instrument, **not** validated for edge (in-sample by construction; OOS harness is the real test) |
| **Divergence core** | `js/divergenceCore.js` | pure, oscillator-AGNOSTIC price↔oscillator divergence detector, **validated bit-for-bit against the user's VuManChu Cipher B Pine `f_findDivs`** — `pivotHighs`/`pivotLows` (reach-bar fractals = Pine's 5-bar fractal), `findDivergences(priceHi,priceLo,osc,{reach,obLevel,osLevel})` → regular + hidden × bull + bear (regular = reversal/fade, hidden = continuation/follow; each carries the two pivot indices + price/osc values for drawing the connector). **OB/OS gate matches VuManChu**: `obLevel`/`osLevel` gate REGULAR divergences to the overbought/oversold zone (bear pivot ≥ obLevel, bull ≤ osLevel); HIDDEN stay ungated (Pine `showHiddenDiv_nl` default). `reversalDecision(...,touchIdx,side,{obLevel,osLevel})` → 'fade' (fresh regular reversal of the matching bias) / 'follow', causal (reads ≤ touchIdx). The caller passes the oscillator series — **never a WT copy** — so unlike the older global-state-bound, hidden-blind, WT-drifting `js/divergence.js` (left as-is; converge-later candidate) this can't drift. The reversion page feeds it the **wt2 signal line** at **VuManChu params 9/12/3** with gates **45/−65** — matching what the operator sees on TradingView. Tested `js/divergenceCore.test.mjs` (14 asserts: pivots incl. tie-rejection, regular bear, hidden bull, OB/OS gate filters regular but not hidden, reversalDecision fade/follow/wrong-side/early). | `forecast-reversion.html` (Divergence style decideAction + the 〰 Osc viz); `vumanchuCore.computeWaveTrend` (wt2 @ 9/12/3) is its oscillator source | ✅ built + indicator-faithful — detector matches VuManChu; but per the operator's own docs the SCRIPTED auto-divergence is **explicitly not the edge** (discretionary confluence + money-flow fuel is), money flow is unreliable on FX (no real volume), so the fade/follow EDGE is folklore/null (VuManChu-confirmed fade already tested ~null in `vumanchuFadeEngine`), in-sample |

---

### 1x. COG band brick — the business-standard line set (2026-07-22)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **COG bands** | `js/cogBands.js` | `computeCogBands(open, sigma)` — COG's published vol-range line set as a reusable brick: his fixed constants (`COG_CONST` imported from `cogReverseEngineer.js` — the single source of truth, back-solved from his manual: `{BM_P50:1.56, BM_P75:1.93, HN_P50:0.74, HN_P75:1.24}`) × a daily σ FRACTION, with **NO per-asset-class correction** (COG uses one uniform set for fx/index/gold). Output keys **match `computeBands`** so it's a drop-in swap; the only differences are deliberate — uniform constants + no `assetClass` arg. This is the SAME calc the vol-forecast-v2 "⬇ COG" export uses, so a plan built with it is bit-identical to that export. Horizon-agnostic (pass a σ already scaled by √periods). Pure/synthetic-testable. Tested `js/cogBands.test.mjs` (4 asserts: constants×σ, price levels off open, uniform-vs-Feller-class-dependence, drop-in key-shape). | **`volatilityBotPlan.buildVolatilityPlan`** (via `bandMode:'cog'`, now the **default**) → the volatility bot's live lines; opt-in for the forecaster/other consumers next. | ✅ built — **volatility bot migrated to COG by default 2026-07-22** |

> **Volatility-bot migration (2026-07-22).** `buildVolatilityPlan` gained a
> `bandMode` (default **`'cog'`**); `refreshVolatilityPlan` defaults `bandMode:'cog'`
> and takes an injected `cogHvSigma(oandaSym, pair) → daily σ frac|null` that
> reproduces the export's ONE special case — **NQ** drawn from COG's close-to-close
> HV σ (window 30, guarded 4–200% annual), every other instrument on platform σ.
> Server wires it via `_computeCogHv`. Plan carries `bandSource`/`bandMode` so the
> bot-config UI shows "COG lines". The policy book was learned on the OLD (Feller)
> geometry; the cells are geometry-relative and ride along, but the edge was **not**
> re-validated on the wider COG lines — a queued follow-up, not shipped as validated.
> Note COG's FX median (1.56σ) is WIDER than both the current bot (~1.29σ) and the
> backtest realized-best (~1.34σ): this is consistency-with-COG, a product choice.
> `computeBands` (Feller) is UNCHANGED — every backtest/forecaster still uses it;
> only the bot's plan path opts into COG. Set `bandMode:'feller'` to revert.

---

### 1y. Price-slowdown decomposition brick (2026-07-23) — the "two budgets" diagnostic

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Slowdown decomp** | `js/priceSlowdownDecomp.js` | `decomposeSessions(bars, opts)` — splits every session into the TWO volatility budgets (RANGE = path travelled `(runHigh−runLow)/open`, what the HL bands model; DISPLACEMENT = distance from open `(price−open)/open`, what the OC bands model), finds the first HL-line tag, measures approach velocity at the tag, and labels how far it faded back (`retraceToOcMed` = tradeable target, `retraceToOpen` = full fade). Plus `groupSessions`, `fadeRateBy`, `fadeRateByQuantile`, `hitRateBy` aggregators. IMPORTS `computeBands`+`volSigmaSeries` (forecastCore), `labelOutcome` (dayTypeCore) and `touchFeatures.approachVel` — never re-inlines σ/band/velocity math, so it can't disagree with the forecaster. Causal (σ for session i uses data < i; velocity uses bars ≤ tag; fade label reads the close as the OUTCOME). Pure/synthetic-testable — `js/priceSlowdownDecomp.test.mjs` (4 asserts: session anchoring, range≥\|disp\| invariant, round-trip→REVERSION→open, trend→CONTINUATION with range≈disp). | `price-slowdown-lab.html` (visual explainer, EURUSD baked in); `scripts/run-slowdown-decomp.mjs` (regenerator over EUR/GBP/AUD parquet) | ✅ built — **descriptive diagnostic, not a costed OOS strategy** |

> **What it found (10y × EUR/GBP/AUD, descriptive — no costs, no IS/OOS split).**
> Conditional on tagging the median exhaustion line (HL50), fading ALL the way
> back to the open is **rare (~12%)**; the tradeable retrace to the OC-median line
> happens **~40%**. A **velocity spike** into the line lifts the tradeable-fade rate
> from ~30% (grind) to ~50% (spike) and the full-fade rate ~2–3×, **monotone and
> consistent across all three pairs**. Range-*budget*-consumed at the tag was weak
> and inconsistent — the kinematics carry the signal, not the static count. This is
> consistent with the platform's earlier finding (`ENTRY_ZONE_CONFIDENCE.md`): the
> pre-day day-type score is dead (AUC≈0.50), `approachVel` is significant OOS
> (p<0.001). The costed OOS fade edge lives in the per-line book, not here.

---

### 1z. Range-extension strategy + confidence brain (2026-07-23) — Asia extensions, conditioned

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Session ranges** | `js/sessionRanges.js` | canonical London-DST + Asia/Monday session-range helpers — `dayStartEpoch`, `londonOffsetHours`, `dowOf`, `isoDate`, `eachDate`, `buildAsiaSessions`, `buildMondayRanges`, `prevSession`, `mondayForDay`, `prevMonday`. Bodies via `barUtils.bodyRange` (closes, not wicks). Pure/synthetic-tested. **Extraction target:** the identical private copies still living in `rangeFibEngine.js` and `asiaRangeEngine.js` (flagged §2) — new code imports this; those two are the un-migrated copies to retire next. | `rangeExtEngine` ✅; **un-migrated copies:** `rangeFibEngine` 🔲, `asiaRangeEngine` 🔲 | 🟡 |
| **Range-ext confidence brain** | `js/rangeExtConfidence.js` | the `score → choice` selector — `dayContext` (state → trendiness → fade/follow), `scoreLevel` (level confidence from multiple/alignment/regime-fit), `selectLevels` (top-N above floor), `DEFAULT_WEIGHTS`. Pure; every constant a prior, ablatable, none fit to trade outcomes. | `rangeExtEngine` ✅ | ✅ built |
| **Range-ext engine** | `js/rangeExtEngine.js` | Asia range-extension backtest with the brain — `runPairRangeExt`, `runRangeExtBacktest`, `summarizeRangeExt` (IS/OOS), A/B (all-fade baseline vs brain). **2026-07-24:** optional `levelSource: asia\|monday\|both` (Monday-weekly levels off `sessionRanges.buildMondayRanges`, stop scaled to each source's own range) + `holdDays` (multi-day swing hold). Monday levels are **decisively worse INTRADAY** (−0.37 R); a ~3-day swing hold lifts them to ~breakeven (−0.03 R) but NOT to an edge. **A claimed "swing survivor" (+0.117 R) was RETRACTED — a fill-conditioned selection look-ahead;** the honest engine `gated` selection is −0.006 R OOS at top-1, negative at top-2/3/5, spreads-only. Range-extension family is a **null, intraday and swing**. See `RANGE_EXTENSION_FINDINGS.md` "Weekly swing variant — RETRACTED". Imports the baseplate wholesale (`barUtils`, `fibProjection`, `sessionRanges`, `forecastCore.walkBars`, `dayTypeCore`, `indicatorCore.atrWilder`, `statsCore.rollingPercentile`, `metricsCore.summarizeTrades`, `instrumentRegistry`). Costs on; no-lookahead (state features use data < D). | `server.js` `/api/range-ext/*` → `range-ext-backtest.html`; tests `js/rangeExt.test.mjs` | ✅ built |

> **What it found (10y × 26 FX + gold, M1, costed OOS — full write-up
> `RANGE_EXTENSION_STRATEGY.md` / `RANGE_EXTENSION_FINDINGS.md`): NULL for
> tradeable edge, with durable negative findings.** The base "trade every Asia
> extension" fade loses everywhere (pooled −0.12 R, **0/26 pairs positive**),
> extending the POI null. Three refutations: (1) the framework's **two-session
> "alignment zones" HURT** (`align=none` +0.31 R vs aligned negative on top
> picks); (2) **follow/breakout direction is harmful** (−0.31 R vs fade −0.15 R);
> (3) base negative in every feature bucket. The confidence brain **works as a
> ranker** — top-1/pair-day ≫ top-3 ≫ all, geometry-robust (+0.05 R OOS at flat
> cost, t 7.3) — but under **realistic per-pair spreads** it falls to +0.017 R
> (t 2.4, below the \|t\|>3 bar), and its survivors are exactly the wide-spread
> crosses where the cost model is least reliable (majors flat-to-negative). So the
> selector orders levels correctly; the raw method has **no edge to concentrate**.
> Kept as a costed harness + the brain, ready to test the data-gated mechanistic
> conditioners (OI/gamma walls, rate-spread, catalyst calendar) that the sandbox
> can't source. **UPDATE 2026-07-24: NULL confirmed, intraday AND swing.** A
> briefly-claimed weekly-swing survivor was retracted as a fill-conditioned
> selection look-ahead (see the engine row + `RANGE_EXTENSION_FINDINGS.md`). The
> confidence brain ranks levels but there is no edge to concentrate. Lesson
> recorded: never select "best-among-filled" offline from a fill-only trade dump.
> **Also 2026-07-24: wired the at-touch `approachVel` (`touchFeatures` + `touchGate`),
> the platform's strongest discriminator. Biggest effect in the study (grind fade
> +0.003 R vs spike fade −0.23 R) so "some touches are far better" is TRUE — but no
> pole is tradeable (grind = breakeven; spike-fade −0.23; spike-follow −0.29), and
> the polarity is REVERSED vs σ-band lines (structural range-multiple → spike =
> continuation). Selection reaches breakeven, not profit; verdict stays null.**

---

### 1r. Trend-following v2 — forecast-σ sizing A/B + Sharpe honesty (2026-07-17)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Trend-follow v2 (forecast-σ sizing)** | `js/trendFollowV2Engine.js` | the Moreira-Muir experiment on our own baseplate: does sizing the diversified trend engine by the vol FORECASTER beat v1's trailing 63d stdev? `forecastVolSeries(bars, assetClass)` (annualised, causal — `volSigmaSeries[i+1]` so out[i] uses data ≤ i, SAME information set as `rollingVol[i]`; warmup/degenerate σ → NaN so the engine sits flat instead of max-leveraging a garbage 1/σ), `runTrendAB` (runs BOTH variants through v1's own `backtestBasket`/`robustness`/`isOosSplit` — signal, costs, targets identical; only the σ estimator differs), `compareAB` (**pre-registered verdict**: `v2_wins` iff OOS Sharpe of the IS-selected config improves AND the gain survives 5bp costs; else `v2_fragile`/`no_improvement` — stated in code before the first real run). NOT a copy of the trend engine: v1's `backtestMarket` gained an optional injectable `volSeries` param (omitted ⇒ bit-identical, proven in tests) and v2 composes through it. Tested `js/trendFollowV2.test.mjs` (17 asserts: bit-safe injection, causality, warmup safety, verdict logic). | `server.js` `GET /api/trend-v2/backtest` (same universe/data as `/api/trend/backtest`, 6h cache) → `trend-v2.html` (side-by-side A/B card + verdict panel); linked from `index.html` Research ▾ | 🟡 built, **not yet validated** — needs OANDA on Railway; synthetic tests prove plumbing, not edge. Do not read any local run as a result. |
| **Sharpe honesty metrics** *(addition to `metricsCore`)* | `js/metricsCore.js` | `sharpeStdError(sharpeAnnual, nPeriods, periodsPerYear)` (Lo 2002 — report every Sharpe as `SR ± SE`; a card inside its own error bar of zero has shown nothing) + `minTrackRecordLength(sharpeAnnual, {benchmark, z, periodsPerYear, skew, kurt})` (Bailey-López de Prado 2012 — YEARS of live returns needed to distinguish the Sharpe from the benchmark; SR 0.5 ⇒ ~10.8y at 95% one-sided, the sobering number every card should show; Infinity when SR ≤ benchmark). Pure, hand-calc-tested in `legoBricks.test.mjs`. | `trendFollowV2Engine` (both A/B cards carry `sharpeSE` + `minTrackYears`); intended: every IS/OOS card 🔲 | ✅ |

The first consumer of the "use the forecaster for SIZING, not direction" thesis:
vol forecasting is the platform's replicated asset, and vol-managed sizing
(Moreira-Muir 2017) is the replicated way to spend it. The A/B isolates ONE
variable (σ estimator) and pre-registers both outcomes; a null ⇒ "trailing vol
is good enough — keep v1" is a cheap, real answer, not a failure.

---

### 1n. yield-spread mean-reversion replication (2026-07-07) — test the ACTUAL bot

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Yield-Spread core** | `js/yieldSpreadCore.js` | pure replication of the colleague's confirmed dashboard mechanic (yield-SPREAD z mean-reversion, NO levels): `directionFromZ` + `resolveInverted` (orient sign by USD role — USD-quote pairs flip), `zTierSize`/`zTierLabel` (their 1×/1.5×/2× ladder), `shouldExit` (z-revert to ±zExit or max-hold), `tradeReturn`, `sharpeFromDaily` (honest daily-MTM Sharpe), `perYearBreakdown`, `summarizeYieldSpread` (win/PF/expectancy + **flat-vs-z-sized A/B** + **by-z-tier breakdown**). Tested `js/yieldSpreadCore.test.mjs` (17 asserts). | `js/yieldSpreadEngine.js` (I/O: `loadPairData` once + `simulatePair`/`simulateBook`; real daily MTM; per-pair + pooled OOS + **`runYieldSpreadSweep`** robustness grid); `server.js` `/api/yield-spread/*` (+`/sweep`); `yield-spread.html`; **strategy doc `YIELD_SPREAD_STRATEGY.md`** | ✅ **validated OOS** (lookahead-audited, sign-corrected, honest Sharpe ~1.0–1.2, 12/12 sweep cells profitable) — **not forward-proven** |
| **Yield-Spread live plan + bot** | `js/yieldSpreadEngine.computeYieldSpreadSignals` → `js/yieldSpreadProducer.js` → `YieldSpreadBot/yield_spread_bot.py` | live sleeve off the SAME validated math (generate-don't-port): `computeYieldSpreadSignals` emits today's per-pair z (pub-lag-shifted, orient-resolved `inverted`); the producer freezes it + the thresholds into `yield_spread_plan`; the Python bot (pylego bricks: `KvClient`/`PaperBroker`+`Mt5Broker`/`QuoteFeed`/`position_size`/`RiskGuard`, magic `20260012`) runs the per-pair swing state machine (enter \|z\|≥entry in the z-direction, exit on z-revert/max-hold, wide %-of-price protective stop, flat risk-% size). Config/creds/status via `yield_spread_config`/`_credentials`/`_status`. | `server.js` `/api/yield-spread/refresh-plan` + daily 13:05-UTC schedule; `bot-config.html` (Yield-Spread tab + Positions row) / `js/bot-config.js` (`loadYsConfig`/`saveYsConfig`/`loadYsLiveStatus`/`saveYsCreds`); KV 3-gate (`kv.js` `_CF_EXACT`, `_worker.js` `isAllowedKVKey`+`PERMANENT_KEYS`) | 🟡 **paper only** — validated ≠ forward-proven; defaults to paper, live is opt-in |

**The survivor of the whole investigation.** A screenshot confirmed the colleague's bot is pure
yield-spread-z mean-reversion (no levels), so the earlier v1/levels/macro-direction nulls
had tested configs they aren't running. Testing their *actual* mechanism — after correcting a
USD-quote **direction-sign bug**, adding **publication lags** (the monthly foreign rates
were lookahead), and fixing an **inflated Sharpe** (smeared daily returns → real daily
MTM) — it clears every audit: 6/6 pairs, 5/5 OOS years, **12/12 parameter-sweep cells
profitable** (graceful degradation, not a lucky spike). Validated region: entry |z| 2.0–2.5,
window 90–126 (the colleague's own 2.75/252 is a *weaker* cell; their size-up-at-extremes rule is
backwards — trade flat). Full write-up, caveats, and paper-trade plan in
`YIELD_SPREAD_STRATEGY.md`. **Still one historical period — forward paper-trading is the only
remaining proof.**

### 1r. Economic-trend cross-sectional test (2026-07-17) — pre-registered, fundamentals-only

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Econ-Trend core** | `js/econTrendCore.js` | pure cross-sectional ECONOMIC-trend scoring (trend on FUNDAMENTALS, not prices — the replicated AQR family, in the monthly cross-sectional form; NOT the per-pair 1–20d form that nulled in `macroDirectionCore`): `asOfValue` (binary-search no-lookahead gate), `factorChange`, `econScoresAt` (per (factor,window) relative-to-USD change, cross-sectionally z-scored, frozen signs rate +/y10 +/unemp −, windows 90/180/365d), `econDirections` (rank → long top-K / short bottom-K), `runEconTrend` (drives `runTrendBasket` via `directionAt` — zero portfolio-code copies), `runEconTrendPlacebo` (seeded-LCG random-ranking chance floor), `evaluateEconTrend` (the FROZEN pass/fail from `ECON_TREND_TEST.md`). Tested `js/econTrendCore.test.mjs` (29 asserts incl. constructed-world pass, shuffled-fundamentals fail, hook-equivalence regression). | `server.js` `/api/econ-trend`; `econ-trend.html` | ⛔ **null banked 2026-07-18** (the one pre-registered run: OOS Sharpe 0.09, placebo pctl 78%<90%, OOS years 4/9 — `ECON_TREND_TEST.md` §Result). Bricks stay (pure, tested); page = read-only viewer; wire into nothing |
| **Econ-Trend I/O** | `js/econTrendEngine.js` | `ECON_UNIVERSE` (8-ccy FRED registry: GS2/GS10/UNRATE + OECD IRSTCI·IR3TIB/IRLTLT01/LRHUTTTT per ccy), `toLaggedSeries` + publication-lag shift (**US +35d / foreign +75d** from obs date — monthly obs are dated at month START), `buildFundamentals` (fail-soft per series, availability table). Reuses `fetchFredObservations`/`_shiftDate` from `zscoreSpreadEngine` — no FRED-fetch copies. | `server.js` `/api/econ-trend` | 🧪 built |

> `trendBasketEngine.runTrendBasket` gained an optional **`directionAt` hook**
> (per-rebalance `{ccy: −1|0|+1}` source) + `splitDate` in the result — the default
> path is bit-identical (regression-tested), and the hook is what lets a
> fundamentals signal reuse the sizing/cost/metrics machinery instead of copying it.

### 1s. Credit-stress (CSI) overlay brick (2026-07-18) — risk gate, not alpha

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Credit-Stress core** | `js/creditStressCore.js` | the CSI risk-overlay (pre-registered `CREDIT_STRESS_TEST.md`): `buildCsi` (equal-weight mean of per-component 252d rolling z's — weights FROZEN equal, reuses `statsCore.rollingZScore`), `gateExposure`/`buildGateSeries` (frozen tiers ×1 / ×0.5 at z≥1 / ×0 at z≥2), `applyGate` (as-of **≤ t−1** application via `econTrendCore.asOfValue` — yesterday's published index sizes today; \|Δexposure\| costed), `runCsiOverlay` (ungated vs VIX-only-gated vs CSI-gated, IS/OOS via `metricsCore`), `evaluateCsi` (frozen 3-way verdict: `csi` / `vix-enough` / `no-gate` — **the named benchmark is VIX alone**). Tested `js/creditStressCore.test.mjs` (20 asserts incl. leading-CSI world passes, identical-info world → vix-enough, harmful gate → no-gate). | `server.js` `/api/credit-stress`; `credit-stress.html` | ⛔ **null banked 2026-07-18** (valid full-history run post-Moody's-amendment: `no-gate` — CSI-gated OOS −0.15 vs ungated −0.08, = VIX-gate; helped IS/GFC era, hurt OOS fast-crash era — `CREDIT_STRESS_TEST.md` §Result). Bricks stay (pure, tested); page = read-only stress dashboard (CSI + Credit Vega context); wire into no sizing path |
| **Credit-Stress I/O** | `js/creditStressEngine.js` | `CSI_SERIES` (FRED: `BAMLC0A1CAAA`/`BAMLC0A4CBBB` → quality spread BBB−AAA, `BAMLH0A0HYM2`, `VIXCLS`) + publication lags (OAS +2d, VIX +1d), `buildCsiInputs` (fail-soft availability; throws only if a composite component is entirely missing). CDS index deliberately **omitted** — Markit data isn't retail-accessible and CDX≈HY OAS. Reuses `fetchFredObservations` + `econTrendEngine.toLaggedSeries` — no fetch/lag copies. | `server.js` `/api/credit-stress` | 🧪 built |

> The core also carries **`creditVega`** (+`vegaLabel`, `VEGA_DEFAULTS`) — the
> DIAGNOSTIC rolling 63d beta of Δ(HY OAS bps) on Δ(VIX pts), percentile-labelled
> High/Elevated/Normal/Low (display panel on `credit-stress.html`). Explicitly NOT
> an input to the frozen gate/verdict. Rolling-beta math stays local for now —
> `yieldCouplingCore.pearson/rollingCorr` remain the flagged candidates for a shared
> `statsCore` correlation/beta promotion once consolidated (§2).
>
> `runTrendBasket` also gained `returnDaily` (opt-in `{dates, dailyReturns, benchReturns}`
> in the result) so overlays can re-weight the daily series — additive, default unchanged.
> Note the overlap with `macroCore.macroRegime` (VIX + HY OAS classifier, live in TDE):
> CSI is the *sizing-gate* test of the same data family; if the verdict is `vix-enough`
> or `no-gate`, `macroCore` stays the only credit/VIX consumer and CSI is retired.

---

### 1r. Strategy Lab — spec-driven gauntlet backtester (2026-07-17)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Strategy Lab engine** | `js/strategyLabEngine.js` | the spec-driven gauntlet: `SIGNALS` registry (13 close-only daily signals — the 12 famous retail strategies: EMA cross 9/21, golden cross, MACD, RSI mean-rev, RSI-2 dip buy, Bollinger reversion, Turtle 20/10, 52-wk-high momentum, Supertrend, stochastic+trend, Ichimoku — plus `buy_hold` benchmark and `tsmom` **imported from `trendFollowEngine.momentumSignal`**, never copied), each `compute(bars, params, direction) → pos[]` with per-signal `sweep` neighbour grids; `positionBacktest` (the strategy-agnostic core of `trendFollowEngine.backtestMarket` — pos decided at t−1 earns ret t, cost bp on \|Δpos\|); `splitDateFor` (ONE shared chronological split **date** across the universe — avoids the hedge-v2 per-pair bar-index defect); `evaluateSpec` (per-market + equal-weight-portfolio IS/OOS cards via `backtestStats.portfolioStats`); `runGauntlet` (leaderboard, **every variant tried counted as a DSR trial** via `backtestStats.deflatedSharpe`, magic-value neighbour flag, honest gate: OOS>b&h + ≥30 OOS trades + DSR≥0.5 + neighbours alive). Pure, no network. Tested `js/strategyLabEngine.test.mjs` (105 asserts incl. per-signal no-lookahead future-shock checks). | `server.js` `/api/strategy-lab/run` + `/status/:jobId` (async-job; OANDA D1 via `fetchD1`) + `/specs`; `strategy-lab.html` (leaderboard page, benchmark pinned, per-instrument + sweep drill-down) | ✅ built — **infrastructure, not edge**; no honest run recorded yet |

The gatekeeper, not the goldmine: makes every "test this famous strategy" idea a
10-line spec through one honest code path instead of a new bespoke engine.
Pre-registered expectation for the first Railway run: **mostly nulls after
costs** (the base rate for famous indicator strategies on liquid FX); anything
green must survive the DSR + neighbour + OOS-trade-count gate and then goes to
forward validation, not money. Signals are close-evaluated state machines — **no
intrabar stop/TP modeling** by design (daily path unknown, house anti-pattern).
Known copy note: `positionBacktest` generalises the loop inside
`trendFollowEngine.backtestMarket`; trendFollow is validated/live-adjacent so it
was NOT refactored onto the new brick — listed in §2 P2 as a consolidation
candidate.

---

### 1u. Diversification core — effective number of bets (2026-07-21)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Diversification core** | `js/diversificationCore.js` | the "how many INDEPENDENT bets is this book really?" metric asked for by `SYSTEM_ASSESSMENT.md` §2.4 / punch-list #6. `pearson` (finite-aligned, mirrors the inline page copy) + `correlationMatrix(cols)`; `symmetricEigenvalues` (cyclic Jacobi, robust for small matrices); three effective-number-of-bets definitions — `effectiveBetsPCA` (inverse participation ratio `(Σλ)²/Σλ²`, bounded `[1,n]`), `effectiveBetsEntropy` (Meucci `exp(−Σpᵢlnpᵢ)`), `effectiveBetsWeighted` (allocation-aware `(Σw)²/wᵀCw`, **can exceed n when net-hedged** — documented); `effectiveBetsAvgCorr(n,ρ̄)` (the crude single-ρ closed form, kept as the migration home for the copy inlined in `perLineStrategy.js` `concentrationStats`); `diversificationSummary(cols,weights)` → `{n,corr,eigenvalues,pca,entropy,weighted,ratio}` (ratio = PCA÷n, cleanly in (0,1]). Pure, no DOM/network. Tested `js/diversificationCore.test.mjs` (32 asserts: ρ=1→1 bet, ρ=0→n bets, hand-computed 2×2, negative-corr >n, mirror→1). | **(1)** `diversification.html` — Correlations tab "Effective Number of Bets" card (STRATEGY-level: independence of the 5 backtested sleeves over monthly-return history). **(2)** `bot-config.html` Positions tab "Effective Number of Bets — live book" card (LIVE-book: how concentrated the currently-open trades are — nets signed lots per instrument, weights by \|lots\|, **direction-adjusts** the hedge-engine correlation matrix so a long+short in a correlated pair partly cancels; headline = `effectiveBetsWeighted`, plus a direction-blind structural `effectiveBetsPCA`). Both expose `window.divCore` via a `<script type="module">`; no new server route — reuses the positions + `hedge_alerts_cache` data already on each tab. **(3)** `perLineStrategy.js` `concentrationStats` uses `effectiveBetsAvgCorr` (the single-ρ copy migrated onto the brick, 2026-07-21 — numerically identical, `perLineConcurrency.test.mjs` unchanged). | ✅ built |

Turns the correlation matrix `diversification.html` already renders into the one
number that matters for §2.4: a book of N strategies is only N bets if they're
uncorrelated. **Note the existing simpler copy** — `perLineStrategy.js`'s
`concentrationStats` computes `N/(1+(N−1)ρ̄)` on per-instrument daily PnL (a
single-average-ρ approximation at the *instrument* level inside one book);
`effectiveBetsAvgCorr` is its exact formula, so that inline use is a §2 candidate
to migrate onto this brick. This brick's eigenvalue/weighted forms are the more
faithful measures when the full matrix is available, applied at the
*strategy-book* level. **Built ≠ edge**: this is a risk diagnostic, not a signal —
it tells you how illusory the book's diversification is, per the honest read on
the "diversification is the real edge" thread that prompted it.

### 1z. Max Copier engine (2026-07-22) — impulse-continuation basket backtester

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Max Copier engine** | `js/maxCopierEngine.js` | an M1-driven, event-based backtester for the discretionary "Max copier" strategy (`max copier strategy.md`): HTF (1H Donchian) level → impulse past it (close ≥ k·ATR beyond) → M15 consolidation → rotate into the value-area → **hidden-divergence** confirm → enter a basket of N positions → managed exit. **Exit model is a SELECTOR (`EXIT_MODES`), not knobs** — three modes (`fixed_r` minimal-DOF baseline / `shared_htf` measured-move / `ladder_trail` scale-out-plus-trail) are simulated on the SAME detected signals and A/B'd on OOS Sharpe (`bestMode`, ≥30-basket gate). Headline stats are **per-basket** (correlated basket = sizing, not diversification); per-position rows are emitted for the prop-firm CSV. MAE read off the real M1 path. **Divergence oscillator = VuManChu WaveTrend by default** (`vumanchuCore.computeWaveTrend` WT1; `divergenceSource:'rsi'` reverts) — what the chart shows = what the trade uses. **Built-in autopsy** (`computeAutopsy`/`poolAutopsyRaw`, poolable raw counters): (A) the PREMISE test — forward return in ATR units after every impulse (does an impulse predict continuation at all?); (B) divergence value-add (passed-vs-failed subsets); (C) expectancy arithmetic (win% vs breakeven from the R payoff); (D) exit-mix + MFE-before-stop. **Chart trace** (`traceMaxCopier`/`traceMaxCopierPair`) emits windowed candles + WaveTrend + impulse/level/consolidation/value-area/divergence/entry/stop/exit marks for the replay chart. Exports `runMaxCopier` (pure, network-free), `compareMaxCopier`, `runMaxCopierSuite` (async; lazy-imports `loadM1ForPair`), `MAXCOPIER_INSTRUMENTS` (24 FX + gold), `MAXCOPIER_DEFAULTS`, plus pure helpers (`swingLows`/`swingHighs`/`hiddenDivergence`/`hasHiddenDivergence`). **Reuses bricks, copies nothing**: `barUtils`, `indicatorCore` (`atrWilder`/`rsiWilder`), `vumanchuCore` (`computeWaveTrend`), `forecastCore` (`summarizeSplit` + default frictions), `instrumentRegistry`. Tested `js/maxCopierEngine.test.mjs` (offline synthetic: divergence truth-table, pipeline, ladder-varies-positions, autopsy premise/expectancy, trace candles+WaveTrend+marks, flat→no-signal). | `server.js` `/api/max-copier/run` + `/status/:jobId` + `/trace` (async-job Map, no OANDA D1 — runs off local/R2 parquet); `max-copier-backtest.html` (IS/OOS 3-mode tables, pooled, per-instrument, **autopsy panel**, cost-sensitivity, yearly-concentration, 3 CLAUDE.md-spec CSV exports, **Lightweight-Charts replay** w/ VuManChu pane); linked from `index.html`. | ✅ built · ⛔ **null, mechanism proven** (2016→2026 all-26: pooled OOS Sharpe negative across all three exit modes; gold marginally +0.1–0.15 OOS ≈ noise). Autopsy root cause: the PREMISE is economically empty — mean forward move after an impulse is ~0.03/0.06/0.09 ATR at 4h/8h/24h with a ~50% hit-rate (t≈2.2 = a real but tiny TS-momentum whisper, far below the ~1-ATR stop + costs). Divergence selects a less-bad subset but still loses; win% 35.3 vs 37.5 needed (−2.1pp); of stopped baskets only ~25% ever reached +1R first. No entry/exit finesse can rescue a coin-flip premise. |

**Known limitation / candidate upgrade:** the "value area" is approximated
**by price** (lower/upper `vaDepth` of the consolidation range), not by a real
tick-volume value-area (the parquet carries tick volume, so a proper VP/TPO
value area is a future toggle). Also: **basket = sizing.** N correlated
positions on one signal is one bet at N× size; per-basket is the honest stat
unit, per-position is only for the broker/prop trade log. Every threshold
(Donchian lookback, impulse k, consolidation bounds, `vaDepth`, stop buffer,
divergence on/off) is a **degree of freedom = overfit surface** — the engine is
a *mechanical proxy* of a discretionary method, judged OOS. The swing-fractal +
value-area logic is engine-local glue for now; if a second consumer wants it, it
becomes a §2 candidate to extract.

### 1aa. Information-theory brick (2026-07-24) — analytics-engine Phase 1

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Entropy core** | `js/entropyCore.js` | the information-theory Tier-1 family (nothing in the codebase computed any of it before — audited 2026-07-24): `histProbs` (clamping equal-width histogram), `shannonEntropy` (bits), `normalizedEntropy` (the [0,1] "market disorder" gauge), `klDivergence` (honest +∞ on unshared support), `jsDivergence` (symmetric, finite, bounded [0,1] bits — the practical histogram distance), `mutualInformation` (binned, catches nonlinear dependence correlation misses), `regimeShiftSeries` (rolling JS divergence of trailing window vs prior reference window; **bin edges from the reference window only** — the data being judged never defines its own ruler; NaN until warm, no lookahead, proven by a truncation test). Pure, no DOM/network. Tested `js/entropyCore.test.mjs` (27 asserts, every number hand-calculated; deterministic vol-break series: pre-break JS 0.006 → post-break 0.650). | none wired yet — built as Phase 1 of `ANALYTICS_ENGINE_DESIGN.md`: the desk-view disorder panel + the pre-registered A/B vs HMM/BOCPD regime flips (lead/lag + agreement on historical breaks) are the named consumers | ✅ built · **measurement brick, no edge claim** |

The first genuinely missing engine from the institutional analytics map
(`ANALYTICS_ENGINE_DESIGN.md` §2, engine #6/#14 gap). Measurement-class: its
bar is correctness (hand-calc unit tests), not OOS — it describes
distributional change, it doesn't trade it. Any promotion to a filter/sizer
goes through the harness with a pre-registered win condition first.

### 1ab. EVT + interval-coverage bricks (2026-07-25) — analytics-engine Phase 2

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Extremes core** | `js/extremesCore.js` | EVT Tier-1 family (engine #7 gap — `metricsCore.histVaR/CVaR` read the EMPIRICAL tail and cannot see past the worst observed point; a GPD fit extrapolates the tail honestly): `quantileSorted` (type-7, matches `histVaR`'s interpolation), `hillEstimator` (Pareto tail index, null on infeasible k), `fitGPD` (Hosking–Wallis PWM — closed-form, deterministic, no optimizer; recovers exp(β)→ξ=0 and GPD(ξ=.3)→ξ=.298 on inverse-CDF grids), `potFit` (peaks-over-threshold; null when the tail is too thin — an honest "not enough tail", not a 0), `gpdQuantile` (ξ=0 branch included), `gpdES` (NaN for ξ≥1 rather than a fake number), `returnLevel` (the 1-in-m-days move), `evtVaR`/`evtES` convenience. Pure, no DOM/network. Tested `js/extremesCore.test.mjs` (26 asserts, analytic hand checks incl. exponential memorylessness through POT). | `forecastCoverage.js` (GPD on band-break severity). Next named consumer: the pre-registered EVT-stop-vs-chandelier A/B (design doc §4 — win = higher OOS Sharpe on ≥30 trades at 2–3× cost, else chandelier stays) | ✅ built · **measurement brick, no edge claim** |
| **Forecast coverage** | `js/forecastCoverage.js` | the interval-coverage card (engine #13 gap): scores the bands as the FREQUENCIES they promise — realized range ≤ hl50/hl75 on ~50%/75% of days, \|close−open\| vs ocMed/oc75 likewise — no-lookahead (σ from `volSigmaSeries`, bars < i), **imports `computeBands` from `forecastCore` (never copies)** so what's graded is byte-identical to what the forecaster and every backtest use. Emits per-band `coverageStats` (cov, binomial SE, z vs nominal — n travels with every claim), per-year hl75/oc75 split (the drifted-ruler catch), trailing rolling-coverage trace, ratio medians (med(range/hl50) ≈ 1.0 if calibrated — a PIT-style location check), and `tail75` break severity (mean excess + `fitGPD` shape on overshoots). σ injectable (`seriesFn`) mirroring `nextSigma`'s DI. Tested `js/forecastCoverage.test.mjs` (24 asserts, coverage exact-by-construction bars). | `server.js` `POST /api/forecast-coverage/run` + `GET /status/:jobId` (async-job Map, OANDA D1 via `_btFetchD1`) + `forecast-coverage.html` (linked from `index.html`) | ✅ built |

### 1ac. OU promotion + the Desk assembly (2026-07-25) — analytics-engine Phase 3

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **OU core** | `js/ouCore.js` | the Ornstein-Uhlenbeck family (engine #4 gap): `ouFit` (discrete OU by OLS of Δz on z₍ₜ₋₁₎ → κ, μ, σ, **half-life = ln2/κ**, t-stat vs random walk, `ok` only when κ > 0), `ouConvergence` (closed-form convergence distribution for a current deviation — expected z, fraction of gap closed, P(revert inside band), 68/95 CIs), `empiricalSnapback` (the model-free base rate the OU probability must BEAT — the benchmark discipline in code), `normCdf`. **PROMOTED verbatim from `js/mve/ou.js`** — the math was always pure, but living inside the retired MVE engine (null verdict, wired to nothing) made every new consumer look MVE-dependent. `js/mve/ou.js` is now a **re-export shim** (no second copy; `js/mve/mve.test.mjs` still 93/93). Tested `js/ouCore.test.mjs` (22 asserts: noiseless AR(1) recovers κ=1−φ and half-life exactly, trend → not-reverting, closed-form convergence hand checks, hand-counted snapback, shim-identity check). | `js/mve/*` (via the shim), `js/analyticsDesk.js`. Next named consumer: any half-life read on a spread/deviation — import here, never re-derive | ✅ built · **measurement brick, no edge claim** |
| **Hurst (DFA)** | `js/statsCore.js` → `hurstDFA` | calibrated long-memory of an **increment** series (pass returns, not levels): integrate → detrend per window → RMS → slope of log F(s) on log s. Recovers 0.5 on white noise, 1.5 on a random walk's levels, <0.5 anti-persistent, >0.5 persistent. Added 2026-07-25 because the incumbent short-lag R/S on levels is degenerate (§3 drift #11). Tested `js/hurstDfa.test.mjs` (15 asserts incl. scale-invariance, null-not-fake-0.5 on short input, and asserts pinning the incumbent's saturation so the defect can't silently return). | `js/analyticsDesk.js`. **Not** wired into the live range-bias path — see §3 #11 | ✅ built |
| **Analytics desk** | `js/analyticsDesk.js` | `deskSnapshot(bars, assetClass)` — the per-instrument desk view (`ANALYTICS_ENGINE_DESIGN.md` §3). Pure **assembly**: computes nothing novel, COMPOSES the bricks so every desk number is the same number the backtests use — `nextSigma`+`computeBands` (expected range), `classifyRegime` (regime), `dayTypeScore` (trend-day-ness T), `statsCore.hurstDFA` on returns + `ouFit` (trending vs reverting + half-life + stretch z), `rollingZAt` on the daily range (is this move normal), `normalizedEntropy` + `regimeShiftSeries` with a percentile-of-own-history locator (has the distribution changed), `potFit`/`gpdQuantile`/`gpdES`/`returnLevel` on daily LOSSES (tail geometry: ξ, VaR/ES 99%, the 1-in-250-day loss). Returns `{ok:false, error}` under 320 bars and `null` per field for "can't say" — never a fake 0. Tested `js/analyticsDesk.test.mjs` (17 asserts: field/unit shape, band ordering, oscillating market → OU reverting w/ finite half-life vs trend market → not reverting, all three asset classes, graceful degradation). | `server.js` `GET /api/analytics-desk/:pair` (live D1) + `analytics-desk.html` (linked from `index.html`); the page also overlays `/api/oi-levels` dealer walls | ✅ built |

### 1ad. Hurst A/B + book stress (2026-07-25) — drift #11 evidence + Phase 4

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Hurst bench** | `js/hurstBench.js` | the measurement that decides §3 drift #11 instead of arguing it. Three escalating questions: **(1) distribution** — what each estimator reads on real D1 (`quantiles`); **(2) decision** — `voteFor` applies `featureHurst`'s LIVE thresholds (`LIVE_THRESHOLDS` = <0.45 revert / >0.55 trend) and counts the vote mix, with `dominantShare` = 1.0 meaning *the feature is a constant, not a signal*; plus `disagreeShare`, the "would a swap change the bot at all" number; **(3) predictiveness** — the question that actually decides it: does the reading rank the FORWARD `efficiencyRatio` (\|net move\| ÷ path, estimator-free so it flatters neither candidate)? Scored by `statsCore.rankIC` with a true IS/OOS split. `benchInstrument` + `poolBench`. **Benchmark is IC = 0 and better calibration is explicitly NOT a win condition** — if both OOS ICs are ≈0 the honest conclusion is to drop the feature, not swap it. No lookahead (reading ≤ i, outcome i+1..i+K). Tested `js/hurstBench.test.mjs` (28 asserts; the saturation is *measured*: incumbent medians 0.869/0.926/0.779 on iid/persistent/anti-persistent markets — dominant vote **1.00/1.00/1.00**, i.e. constant on all three — vs DFA 0.487/1.068/0.292). | `server.js` `/api/hurst-bench/run` + `/status/:jobId`; `hurst-bench.html` (linked from `index.html`) | ✅ built · **measurement, verdict pending real-data run** |
| **Book stress** | `js/bookStress.js` | Phase 4 — the liquidity-contraction replay (`SYSTEM_ASSESSMENT.md` §2.4 / punch-list #6). `STRESS_WINDOWS` (6 **declared** crisis windows — GFC, taper, Aug-2015, Q4-2018, COVID, 2022; declared constants so windows can't be picked after seeing returns), `alignSleeves` (date-intersect so every cross-sectional number shares a calendar), `seriesStats`, `bookSeries`, `stressReplay` → per-window book + per-sleeve stats, count of sleeves negative, avg correlation, and **effective bets IN-window vs the calm baseline** (imports `diversificationCore`) — the diversification-evaporation measurement; `allocationCompare` (equal / inverse-vol / **risk-parity ERC**, weights from trailing windows only, each scored on realized vol/Sharpe/DD + effective bets); `riskParityWeights` (multiplicative ERC fixed point — verified to recover w ∝ 1/σ on uncorrelated sleeves; the naive `target/(Σw)_i` update converges to 1/σ² and is documented as the trap). Tested `js/bookStress.test.mjs` (31 asserts, crisis behaviour exact by construction: calm ρ 0.001 / 3.00 bets → crisis ρ 0.932 / 1.10 bets). | `server.js` `POST /api/book-stress/run` (accepts real sleeve return series) + `GET /api/book-stress/market-sleeves` (buy-and-hold D1, **explicitly labelled market backdrop, not strategy returns**); `book-stress.html` (linked from `index.html`) | ✅ built · **risk diagnostic, not a signal** |

Phase 3 of `ANALYTICS_ENGINE_DESIGN.md` §4. The desk page labels every panel
**validated input** (the bands) or **context** (everything else) — the
measurement-vs-signal split made visible at the point of use, so nothing on it
can be mistaken for an edge claim. The entropy-shift panel sits deliberately
NEXT TO the HMM/day-type regime read: that side-by-side is the pre-registered
A/B (§4), not an adoption.

Phase 2 of `ANALYTICS_ENGINE_DESIGN.md` §4. Both measurement-class. The
coverage card is the cheap honest grade of the platform's core input: if hl75
holds ~75% per year, the ruler is calibrated; if the per-year split drifts
(the ifo/DAX failure mode — a full-sample average hiding decay), that's now
visible in one click instead of assumed away.

### 1ae. Trend-Flip engine (2026-07-27) — HTF-bias-gated discrete flip, stage 1

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Trend-Flip engine** | `js/trendFlipEngine.js` | A discrete trend-entry system: a daily HTF bias gates a lower-timeframe "flip" — the LTF's own reading going from weak/unaligned into aligned with the HTF direction (`computeLtfLeanSeries` + the flip check in `runTrendFlip`) — sized with a Wilder ATR stop and a fixed-RR target, filled and walked to exit on the real M1 path via `walkBars` (forecastCore's shared fill walker, reused as-is with a `'stop'`-type order at the LTF bar's open so it fills immediately). Both HTF and LTF "lean" are `sign(return over the window) × classifyDayType(...).T` (`computeHtfBiasByDate` / `computeLtfLeanSeries`) — direction from the realized price move, conviction from dayTypeCore's unsigned trend-day-ness. **Caught-in-review bug, fixed before any real-data run:** the first version used `classifyDayType`'s own `signedT` as if it were bullish/bearish direction; `signedT`'s two estimators (efficiencyRatio, varianceRatio) both take `Math.abs()` of the price move, so a clean down-trend and a clean up-trend score identically positive — `signedT`'s sign is fade-vs-follow conviction, not price direction. `trendFlipEngine.test.mjs` check [1]/[3] caught it immediately (a down-drift synthetic market read HTF-bullish and emitted BUY-only trades); fixed by deriving direction from `Math.sign` of the window's own return and using T only as the conviction multiplier — still one brick (`classifyDayType`), used for what it actually measures. Originated from reviewing a pasted Pine Script MTF Trend Dashboard indicator (EMA20/50/200 stack + Supertrend HTF filter); that EMA-stack mechanism was already A/B tested here (`js/trendFollowEmaEngine.js`, §1c/known-drift table) and came back **null**, so this engine deliberately does not reuse it. No lookahead: both the conviction read and the direction sign use only indices < idx; the HTF read for a given LTF bar uses the daily index of that bar's calendar date (itself only reading days strictly before that date), and entry executes at the NEXT LTF bar's open after the flip is confirmed on the signal bar's close. `runTrendFlipSummarized` wraps one instrument's run through `summarizeSplit` (honestForecastEngine) for the IS/OOS card. Tested `js/trendFlipEngine.test.mjs` on synthetic up/down-drift fixtures (5 checks: HTF lean sign matches drift direction, trades are sane, trade side matches drift direction, truncating future data doesn't change past trades, IS+OOS partitions the full trade set) — **no real-data run yet, so no edge claim exists for this brick**; per CLAUDE.md's own rule, "built" ≠ "works" ≠ "has edge" here specifically. | `server.js` `POST /api/trend-flip/run` + `GET /api/trend-flip/status/:jobId`; `trend-flip-backtest.html` (linked from `index.html`) | 🔬 built · single-instrument (no multi-pair sweep), **not yet run on real data or OOS-validated** |

Stage 1–3 of the honest-backtest-build discipline (`CLAUDE.md` "Backtest build
discipline" section): minimal-DOF version wired end-to-end, sanity-checked on
synthetic data, ready for a zero-frills real-data run. Stage 4 (true IS/OOS on
real D1+M1, ≥30 OOS trades) and the pre-registered benchmark comparison — does
the FLIP timing beat just staying HTF-aligned with no flip condition, and does
either beat the existing validated `trendFollowEngine.js` TSMOM equity curve —
have not been run. Treat every number this page currently shows as a
plumbing-correctness check, not a result.

---

### 1af. Server-side raster + the VuManChu pane as an image (2026-07-30)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **PNG canvas** (Tier 1) | `js/pngCanvas.js` | The platform's first server-side rasteriser: an RGB framebuffer with coverage-anti-aliased draw ops (`line` incl. dashes, `polyline`, `fillBetween`, `rect`, `disc`, `text`) plus a real PNG encoder (`toPNG`/`encodePNG`, colour type 2) built on Node's **built-in `zlib`** — **zero dependencies, no browser**. ~70ms for a 1200×440 pane. Text is an embedded 5×7 bitmap font (ASCII 0x20–0x5A + `·`/`×`, lowercase folded to uppercase, unknown glyphs advance silently) so there is no font file or font parser; labels render ALL CAPS by design. `fillBetween` walks the band **column-by-column** rather than per-segment, so it stays gap-free when bars pack tighter than 1px. **Why not playwright:** it is declared in `package.json` but imported nowhere, and `start.sh` has no browser-install step — there is no working headless Chromium on Railway, and adding one costs ~400MB of build plus RAM in a container already supervising three Python bots. Reusable for any future series→image need (equity curves, vol bands, OI). Tested `js/vumanchuChart.test.mjs` — the PNG assertions **decode the emitted bytes back to pixels** (chunk walk → inflate → un-filter → CRC check against `zlib.crc32`), so "returned a Buffer" cannot pass for "returned a valid image". | `js/vumanchuChart.js` | ✅ built |
| **VuManChu chart** (Tier 2 render) | `js/vumanchuChart.js` | The WaveTrend pane as a picture, from ONE `vumanchuLayout` geometry pass consumed by three emitters: `renderVumanchuPNG` (Telegram), `renderVumanchuSVG` (web, real font so labels keep casing), `vumanchuChartData`/`vumanchuCaption` (the text read + a <1024-char caption). Composes bricks only — **no new maths**: `vumanchuCore.computeWaveTrend` (WT1/WT2 + fill), `vumanchuCore.waveTrendReading` (latest-bar OB/OS), `divergenceCore.findDivergences` run on **both** oscillators (it is oscillator-agnostic, so one detector serves the wave and the yellow line), `pngCanvas` to draw. Money flow is deliberately **not** drawn. Defaults are the **operator's** Cipher B setup, taken from `forecast-reversion.html` where `divergenceCore` was validated bit-for-bit against his Pine `f_findDivs`: **WT 9/12/3**, drawn bands **53/−53**, and a SEPARATE asymmetric divergence gate **`divOb` 45 / `divOs` −65** — kept as distinct options because collapsing them into obLevel/osLevel silently changes which divergences qualify (a first cut here did exactly that). Warm-up is computed then discarded: oscillators run on the full history, only the last `displayBars` are drawn, so the EMA seeding transient never reaches the image. Requires **oldest-first** bars (`MIN_BARS` 60) — reversed input mirrors the picture silently, which is why the route deliberately does not reverse OANDA's payload the way `/api/oanda_ohlc5m` does. **Yellow-line caveat, measured not assumed:** `vwapSeries` defaults to `'wtdiff'` (`wt1−wt2`, Pine's `wtVwap`) because on a trending 200-bar fixture the alternative `'cumvwap'` (`vumanchuCore.computeVWAP().osc`) ran 35→100 — a one-way ramp pinned at its own normalisation peak, yielding **zero** divergences, versus wtdiff's −11→+14 about zero with 5. A VWAP anchored at bar 0 of an arbitrary window drifts monotonically once price trends, so its "oscillator" stops oscillating — worth scrutiny wherever `cumvwap` IS consumed (`vumanchuFadeEngine`). **Not** checked against the operator's actual Pine file; that is the whole of the evidence. `vumanchuCore` was NOT modified, so no engine's numbers move. Tested `js/vumanchuChart.test.mjs` (50 asserts: geometry/window/clamping, divergence endpoints tracking their own series, operator params pinned, gate independence, in-plot colour scans for bear/bull/none, SVG escaping, determinism). | `server.js` `GET /api/vumanchu/chart` (png/svg/json, cached per granularity) + `POST /api/vumanchu/chart/send`; `vumanchu-chart.html` (linked from `index.html`); level-bot Telegram alerts via `sendVumanchuChart` | ✅ built (render brick — no edge claim; it draws a read, it does not test one) |

Also added in `server.js`: `sendTelegramPhoto` (multipart via Node 18+'s built-in
`FormData`/`Blob`, no dependency) and `vumanchuM5Bars(sym)` — the M1-monitor→M5
resample **extracted out of `formatAlert`** so the alert TEXT and the attached
CHART are provably the same bars; two copies of that prep is precisely how a
picture starts disagreeing with the caption beside it. Note the alert keeps
sending its full text message and attaches the chart as a **separate photo**:
Telegram caps a photo caption at 1024 chars vs 4096 for a message, and
`formatAlert` routinely exceeds 1024 once the plain-English decoder block is
appended — folding the message into a caption would truncate live alerts.
Toggle: `cfg.vuManChuChart` (default on; ignored when `cfg.vuManChu` is `'off'`).

This is a **render** brick pair, not a strategy one. It makes an existing read
visible; it says nothing about whether that read has edge. The underlying
VuManChu-confirmed fade was already tested ≈null (`vumanchuFadeEngine`), and
per §1's divergence-core row the operator's own docs say the SCRIPTED
auto-divergence is explicitly not the edge. Drawing it well does not change that.

### 1ag. Multi-timeframe WaveTrend overlay (2026-07-30)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **VuManChu MTF** | `js/vumanchuMtf.js` | Two timeframes of the WaveTrend on one pane plus a measured agreement read. Composes `vumanchuCore.computeWaveTrend` (both timeframes, one compute), `pngCanvas`, and `vumanchuChart.THEME` (shared palette, so the two charts read as one system) — no new indicator maths. **`alignHtfCausal(fastBars, slowBars, slowSeries)`** is the reason this is a brick: the x-axis is the **FAST** timeframe and the slow wave is step-held onto it, taking only the last slow bar whose CLOSE is at or before each fast bar's close. The naive "which slow bar contains this fast bar" mapping **leaks up to one full slow bar of future** — the Pine `request.security` repainting bug — and still renders a beautiful, plausible chart, so only an explicit test catches it. Drawing on the slow grid instead would force the fast series to be downsampled, destroying the detail the comparison exists for. Returns `slowIdx[]` alongside the values as the caller's proof of causality. `agreementSeries` + `agreementStats` give per-bar agreement in three modes (`level` / `zone` / `direction`) measured **over the visible window only**, so the headline % describes the same bars as the ribbon under it (measuring over the fetched history let `comparableBars` exceed `window.bars` and silently describe a wider span — caught and fixed before deploy). Emitters: `renderVumanchuMtfPNG` / `…SVG` / `vumanchuMtfData` / `vumanchuMtfCaption`. Tested `js/vumanchuMtf.test.mjs` (41 asserts) — including a truncation test (removing future bars must not change any earlier aligned value) and a test that the naive contains-mapping *would* leak, so the causality test is proven to have teeth. | `server.js` `GET /api/vumanchu/mtf` (png/svg/json) + `POST /api/vumanchu/mtf/send`; `vumanchu-chart.html` MTF panel | ✅ built (descriptive — no edge claim) |

**Two measured findings that changed the design**, both recorded because they are
counter-intuitive enough to be "fixed" back by a future tidy-up:

1. **The agreement % is mostly arithmetic, so it ships with a baseline.** Two
   timeframes of the SAME oscillator on the SAME price are mechanically correlated
   — the slow wave is close to a smoothed version of the fast one — so they agree
   heavily *by construction*. `agreementStats` therefore reports `baselinePct`:
   the same statistic over **deterministic** circular re-phasings of the slow
   series (evenly spaced offsets, no RNG, so a cached image and its JSON can never
   disagree), which preserves each series' own persistence while destroying their
   true time correspondence. **Read `delta`, never `pct`.** The PNG header colours
   by delta, not by the raw percentage, for the same reason.

2. **`direction` is NOT the default, despite being what everyone asks for.** "Are
   both waves rolling the same way" is the mode most corrupted by the indicator's
   own lag: the slow wave's slope is a heavily-smoothed, delayed version of the
   fast one's, so when the dominant price cycle is short relative to that lag the
   two slopes sit out of phase and `direction` reads as *systematic disagreement*
   — far BELOW its chance baseline, not near it. Measured at M5/M30, WT 9/12/3
   (slow smoothing lag ≈ n2×ratio ≈ 72 fast bars), sweeping a sine's period:

   | cycle ÷ lag | 1.0 | 1.7 | 3.5 | 7.0 | 14.0 | 27.9 | 55.9 |
   |---|---|---|---|---|---|---|---|
   | `direction` | 15.8% | 15.3% | 30.6% | 54.3% | 74.6% | 87.0% | 93.5% |
   | baseline | ~51% | ~51% | ~51% | ~50% | ~49% | ~48% | ~48% |

   Monotonic, crossing baseline at cycle ÷ lag ≈ 7. On a broadband fixture the
   modes split hard: **direction −23.8pp, level +5.1pp, zone +15.2pp**. So the
   default is **`level`** (comparable on nearly every bar, behaves as a reader
   expects); `zone` shows the strongest agreement but is null unless BOTH waves sit
   inside an OB/OS band (~⅓ of bars — check `comparableBars`); `direction` is kept
   but its JSON carries an explicit caveat. `js/vumanchuMtf.test.mjs` pins the
   long-cycle-agrees / short-cycle-disagrees relationship, which is also the
   regression test for the alignment itself.

Sizing note for the route: the slow series needs its OWN warm-up, so it is fetched
by **span** (`ceil(fastCount × fastSec / slowSec) + 220` slow bars), not by "the
same number of bars" — a large fast:slow ratio costs slow-side history, and that
is the real ceiling on how wide a ratio is usable.

Still descriptive, like §1af: that MTF alignment can be *measured* is not evidence
it *predicts* anything. Establishing that needs costs and a true OOS split.

### 1ai. Money-Flow layer + the predictiveness null (2026-07-30)

`js/vumanchuChart.js` now draws **Money Flow** as a zero-split wave (green above,
red below, filled to the zero line, behind the WaveTrend so the gridlines and wave
sit on top). Options `showMoneyFlow` (default ON), `mfPeriod`, `mfScale`,
`mfTargetAmp`, `mfPctile`, `mfClamp`; API param `&mf=0` hides it; `reading.moneyFlow`
added to the JSON. `computeMoneyFlow` was already in `vumanchuCore` — only the
render is new, and no brick maths changed.

**Two display defects found and worked around (not in the brick — in how it must be
drawn).** `computeMoneyFlow` divides by `max(|raw|)` over the array it is handed:
1. **Outlier-dominated.** Real EUR/USD M15 has ~18× tick-count outliers (busiest bar
   21941 vs median 1172), so one spike sets the divisor and flattens the whole wave
   — the first render was an invisible line. Fixed by rescaling for DISPLAY from a
   robust percentile (`mfPctile` 90 → `mfTargetAmp`).
2. **Long-tailed.** Even rescaled, the drawn range hit −12.9…+98.2 against a ±106
   domain — one excursion would fill the pane. Clamped (`mfClamp` 66), amplitude
   only, never sign.
Both are display-side; Spearman IC is rank-invariant to a positive rescale, so
**neither affected the measurements below**. The same single-max normalisation makes
the *displayed* value window-dependent (amplitude shifts with how many bars were
fetched) — stated on the page.

**MEASURED: Money Flow does not help direction, and neither does anything else in
this family.** 13 months of real EUR/USD M15 (26,880 bars, 100% volume coverage),
Spearman IC vs forward return, block-bootstrap null, IS/OOS 70/30:

| component | corr vs `-wt1` | IC h=16 IS | IC h=16 OOS |
|---|---|---|---|
| Money Flow | **−0.75** | −0.034 | **+0.016** (sign flips) |
| rolling-VWAP distance | 0.87 | 0.042 | −0.005 |
| rolling-VWAP slope | −0.80 | −0.036 | 0.020 |
| session-VWAP distance | 0.73 | 0.041 | 0.012 |
| RSI(14) | 0.90 | 0.050 | 0.009 |
| WaveTrend hist | −0.18 | −0.005 | −0.003 |

The decisive structural point: **these are not independent views.** A VWAP is a
volume-weighted moving average and WaveTrend is price-versus-an-EMA — both are
"price relative to its recent average", hence 0.73–0.90 correlation. An
equal-weight composite (zero fitted parameters) **lost to the best single component
in all 6 cells**, and |score| showed **no calibration** in either half
(non-monotonic; OOS strongest quintile paid 0.03bp against a 0.69bp round-trip
cost; hit rates 48–52%). So there is no "confidence" to output.

`vumanchuCore.computeVWAP().osc` looked like the exception (IC −0.14/−0.15 at h=96,
nearly uncorrelated with WaveTrend) but is an artifact: it measures price against a
VWAP **cumulative from bar 0 of whatever window you pass**, so it is
**window-dependent** (same final bar: −47.62 on 13 months vs −48.97 on 6) and its
peak normalisation uses whole-series data. Rank-invariant, so it did not fabricate
the IC — but it is not a reproducible live signal, and its IC growing with horizon
is the signature of a slow level tracking the sample's own drift. The well-defined
session-anchored version sits at 0.004–0.068 like everything else.

Full write-up and the earlier WaveTrend-only nulls (MTF agreement adds nothing;
oscillator slope null; the 67%-hit-rate-for-1.3bp mechanism where the oscillator
resets because its moving average catches up rather than because price reverts) are
in the findings doc. **Keep this family for reading structure and timing an entry
whose direction comes from elsewhere; it does not source direction.**

### 1ah. MTF stack — N timeframes, one directional series (2026-07-30)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **MTF stack** | `js/mtfStack.js` | Generalises §1ag from 2 timeframes to N (2–6): a `SERIES_SOURCES` registry of directional series, each aligned onto the fastest grid via `vumanchuMtf.alignHtfCausal` (the causality guard is **imported, not reimplemented**), rendered as one labelled up/down ribbon row per timeframe plus a signed `alignmentScore` histogram. Reuses `vumanchuCore.computeWaveTrend`, `vwapReversionEngine.computeSessionVwap` (per day-slice — **no fourth VWAP definition added**), `pngCanvas`, and `vumanchuChart.THEME`. Ribbon rows deliberately sidestep the scale problem: N series in different units cannot honestly share one y-axis, but their SIGNS can. Reading the rows top-to-bottom shows a flip **cascade** — the fast timeframe turns first. Tested `js/mtfStack.test.mjs` (21 asserts) incl. a truncation causality test and the degeneracy measurement below pinned as an assertion. | `server.js` `GET /api/vumanchu/mtf-stack` + `POST /api/vumanchu/mtf-stack/send`; `vumanchu-chart.html` stack panel | ✅ built (descriptive — no edge claim) |
| **VuManChu core (Python)** | `pylego/indicators/vumanchu.py` | The Category-A Python reader of the JS VuManChu maths — ONE copy, **golden-tested bit-for-bit** against `js/vumanchuCore.js` + `vumanchuMtf.alignHtfCausal` via `scripts/gen_vumanchu_vectors.mjs` -> `vumanchu_vectors.json` (73 asserts, offline, `vumanchu_test.py`). Deliberately splits into TWO families: `parity_*` (bit-identical to the live pane, and LOOK-AHEAD — they normalise by the max over the whole array) and `causal_*` (`causal_money_flow` rolling robust percentile, `causal_vwap_dist` rolling-VWAP distance in sigma, truncation-invariance asserted) for research/panels. Also ports `align_htf_causal` and adds `agreement` (direction/level/zone) + `rephasing_baseline` (the circular re-phasing chance baseline). Vectorised via pandas `ewm(adjust=False)`, which IS the JS recurrence, so speed costs no fidelity. The test pins a measured nuance: the parity look-ahead is SILENT — a truncated run is bit-identical whenever the cut falls after the global peak, so a single spot-check can wrongly certify it as causal. | `vumanchuLab/*` | ✅ built |
| **VuManChu Lab** | `vumanchuLab/` | Generalised conditional-probability study of VuManChu state vs forward price — `panel.py` (causal feature panel: per-timeframe WT/MF/VWAP state + causally-aligned HTF columns + agreement + forward outcomes in sigma units; stride applied AFTER feature compute), `analyse.py` (P(up) per cell vs a **stratified (hour x vol-bucket) matched baseline**, batch-means SEs over 40 time blocks, IS/OOS split, explicit multiple-testing count), `falsify.py` (**the anchor-offset falsifier** — re-anchors entry at close[i+k] holding the state read at bar i, separating real reversion from noise shared between the oscillator and its own anchor bar), `crossasset.py` (transfer across asset classes), and **`shapes.py` — the SHAPE/trajectory engine** (conditions on the wave's PATH across all three timeframes, not a single-bar snapshot: a readable symbolic encoding LEVEL x FORM per timeframe plus k-means over the concatenated causally-aligned trajectory, scored on REVERT-vs-CONTINUE against a baseline stratified on hour x vol x prior-move-size, with the reverse P(shape|reversal)/P(shape) lift view reported alongside so the selection-on-outcome trap stays visible). Found and fixed a **mixed datetime-resolution bug** (gold/nq parquets are `datetime64[us]`, eurusd `[ns]`; the ns-assuming epoch conversion silently destroyed HTF alignment on two of three instruments) — now guarded by a loud spacing assertion. **Result (2026-07-30, eurusd/gold/nq, real M1): real but sub-cost.** Mean-reverting structure at h=60m, IS/OOS-consistent, survives the anchor falsifier (91-96% retained at k=1), transfers across FX/gold/index with strength ordered FX > gold > index, and multi-timeframe zone agreement roughly DOUBLES the single-timeframe read (eurusd +2.28pp -> +5.30pp). Money Flow adds nothing incremental over WaveTrend. `direction`-mode MTF agreement sits BELOW its chance baseline on all three instruments — empirically confirming the smoothing-lag artifact predicted on fixtures in `js/vumanchuMtf.js`. **0/15 cells clear round-trip cost at h=60m** (best 0.85-0.91x); the cells that clear cost at h=240m are the ones that aren't significant. Descriptive terrain map — wired into nothing. See `vumanchuLab/FINDINGS.md`. | imports `pylego.indicators.vumanchu`, `pylego.instruments`, `pylego.costs` | ✅ built (descriptive — structure found, no tradeable edge) |

**The finding that shaped this brick: "multi-timeframe VWAP" is degenerate, and it
took two attempts to find a version that isn't.** Asked for a 1m/3m/5m/15m VWAP
agreement read, the obvious implementations return ~100% agreement as *arithmetic*:

| series (sign of) | all-agree across M1/M3/M5/M15 | verdict |
|---|---|---|
| price vs **cumulative** session VWAP | 99.3% | degenerate |
| **cumulative** VWAP slope | 99.4% | degenerate |
| price vs **rolling** VWAP(20) | 76.7% | usable — **default** |
| **rolling** VWAP(20) slope | 74.1% | usable |

Two separate causes, both measured:
1. **A VWAP is near timeframe-invariant.** VWAP = Σ(tp×vol)/Σ(vol); bucketing bars
   coarsely barely changes either sum. M1-computed vs M15-computed VWAP differ by a
   max of **115 ppm**, with slope-direction agreement **100.0%** at every timeframe.
2. **Taking its slope does not rescue it.** A cumulative average is a slow monotone
   curve — its slope sign flipped only **2 times in an entire session** (0.07% of M1
   bars), so "is VWAP rising" is the same answer everywhere.

A **rolling-window** VWAP works because the window scales with the timeframe (20 M1
bars = 20 min; 20 M15 bars = 5 h), so the curves are genuinely different objects —
confirmed by sign-flip rate: rolling(20) flipped 22× on M1 vs 0× on M15, where the
cumulative version flipped twice at every timeframe. The degenerate variants are
**kept, not deleted**, marked `tfDependent: false`; `buildMtfStack` emits a
`degenerate` string and the renderer stamps the warning onto the image, so the
effect stays inspectable instead of merely asserted in a comment.

`alignmentScore` (mean direction sign, −1..+1) is deliberately **not** called
"confidence" — that would imply predictive weight nothing here has earned. As in
§1ag it ships with a re-phasing `baselinePct`; read `delta`.

Route notes: non-native OANDA granularities are **resampled from M1** via the shared
`resampleBars` (OANDA's enum jumps M1, M2, M4, M5, M10 — there is no M3), with each
synthetic bar restamped from its group's first M1 bar so the causal alignment has
real bar-start times. M1 is fetched once and reused for every derived timeframe.

### 1aj. Per-currency extreme-crowding cards + reinforcing-pair selector (2026-07-30)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Extreme crowding alerts** | `cot-extremes.html` (`crowdState`, `crowdingCards`, `FX_PAIRS`) | One colour-tinted card **per currency** individually at/beyond the page's existing 90th/10th percentile crowding cutoff (same threshold as `extremes()`/`colFor()`) — Z-score, percentile, Net % OI, badge ("OVERCROWDED LONG"/"HEAVILY SHORT"), all reusing already-computed COT percentile/z-score fields from `_worker.js`'s `/api/cot-extremes`. First cut gated the card behind a *pair* both legs being extreme at once, matching the reviewed reference screenshot's framing too literally — restyled to one card per stretched currency (so a single extreme currency always shows something, not just the rarer double-extreme case) plus a **secondary text annotation** underneath (reusing `FX_PAIRS`, the 25-pair set mirroring `js/instrumentRegistry.js`'s canonical FX list — plain-script page, no ES modules, so hand-mirrored) flagging when two currently-stretched currencies pair into a real FX cross reinforcing the same direction (base crowded long + quote crowded short ⇒ the cross reads crowded long). | `cot-extremes.html` | 🔲 view-only, **no backtest — a crowding/interpretation aid, not a validated signal** |
| **Derived USD mirror** | `cot-extremes.html` (`loadUsdMirror`, `usdDerivedReading`, `pctRankCalc`/`zScoreCalc`) | This feed has no direct CFTC USD-index future, so USD alone has no real specNet series to rank. `today.html`'s currency-strength drawer already derives a USD *snapshot* (mirror of the other 7 majors' net specs); this extends that mirror across time so it can be percentile/Z-scored like every real instrument: lazily fetches all 7 majors' 200-week histories via the existing `/api/cot-extremes?history=` endpoint (no new backend route), aggregates net/OI by report date (requiring ≥4-of-7 majors present per date so the mirror isn't built off one or two currencies), then ranks the latest point against that derived series' own history using `pctRankCalc`/`zScoreCalc` — copied verbatim from `_worker.js`'s `pctRank`/`zScore`, including its `h()`/`clean()` self-exclusion convention (rank today against history EXCLUDING today). Renders as a normal card in the grid above but visually marked **DERIVED** (dashed border + tag) and called out explicitly in the panel's footnote as a synthetic read, not a real tracked position — folded into the `FX_PAIRS` reinforcing-pair annotation too, so USD-leg pairs (EURUSD, GBPUSD, etc.) can now appear there. Verified locally: mocked 7 synthetic 200-week histories (majors trending increasingly net-short) via headless Chromium (no live network in this sandbox) and confirmed the derived card renders with the expected direction/magnitude. | `cot-extremes.html` | 🔲 view-only, **derived/synthetic — not a real CFTC-tracked position, no backtest** |

This is a *selector*, not a strategy: it composes an already-built Tier-2 COT
reading (per-currency percentile/z-score, real or derived) into "stretched
enough to flag," with a secondary combinatorial read across two cards, the
same shape as `dayTypeScore → selectStrategy` (Lego Principle 4). Per
CLAUDE.md's evaluation rules, a method is not a strategy until tested — this
has not been run through the honest IS/OOS harness (Lego Principle 5), so it
ships with an explicit in-page disclaimer rather than any performance claim.
If it's ever promoted to a real backtest, pre-register the benchmark (does fading a double-extreme cross
beat just fading either single-leg extreme alone, and does either beat a naive
mean-reversion baseline) before running it.

### 1aj. Stage-5 cycle timing — tested and closed (2026-07-30)

The last live hope for this family was TIMING rather than direction: "the average
WaveTrend cycle is N candles, we are N−1 in, so a reversal is due." Measured as a
proper **hazard rate** (that claim is the gambler's fallacy unless h(n) actually
rises with age), across four instruments.

It looked real — the wt1×wt2 cross cycle is regular: mean 5.7–5.9 bars, **CV
0.62–0.65**, rising hazard (rank corr 0.67–0.99), consistent IS and OOS. Then the
control, the same measurement on a **pure random walk**:

| params | EUR/USD | GBP/USD | USD/JPY | XAU/USD | **RANDOM WALK** |
|---|---|---|---|---|---|
| 9/12/3 | 5.1/0.74 | 5.1/0.74 | 5.1/0.75 | 5.1/0.74 | **5.1/0.72** |
| 10/21/4 | 6.7/0.76 | 6.6/0.76 | 6.6/0.77 | 6.5/0.76 | **6.7/0.75** |
| 9/12/8 | 8.1/0.64 | 8.0/0.65 | 8.2/0.65 | 8.1/0.65 | **8.2/0.65** |
| 9/12/16 | 10.9/0.67 | 11.0/0.66 | 10.7/0.67 | 11.0/0.67 | **11.1/0.67** |

Every column matches **including noise**, and the cycle length tracks the
signal-line period exactly as filter theory predicts. WT1 is an EMA and WT2 an SMA
of that EMA; two smoothed series of one input cross at a frequency set by their
periods. **The "cycle" is the smoothing filter, not the market.**

Two by-products worth keeping: the ~16-bar zero-cross cycle (closest to the "≈18
candles" usually quoted) is the **memoryless** one — flat hazard, so age says
nothing; and Money-Flow runs are **over-dispersed with a falling hazard**
(CV 1.51–1.66), meaning a long-running green MFI is *less* likely to flip than a
fresh one — the opposite of the usual intuition.

Full record, including every earlier null and the two artifacts caught before they
became "findings": **`VUMANCHU_DIRECTION_FINDINGS.md`**.

### 1ak. Analog cone + trailing-error-weighted blend (2026-08-03)

Second forward-path envelope alongside `forecastPathCore`'s model-based
intraday cone, and a combiner — built from an owner conversation about what
other prediction-cone families are worth knowing (options-implied density,
GEX regime, OU half-life, event-implied, realized-vol cone, regime-
conditional, Kalman fair value) before attempting to combine any of them.
This is the first (of that list), lowest-lift pair: a genuinely orthogonal
empirical cone + the combining machinery, shipped and OOS-graded before
adding a third leg.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Analog cone (Cone B)** | `js/analogCone.js` (`buildAnalogContext`, `analogCone`, `analogSamplePaths`, `analogConeCalibration`) | An EMPIRICAL forward-path envelope — no distributional assumption. Buckets every bar by (trend regime × realized-vol tertile) causally, reusing `classifyRegime` (`volBacktestEngine.js`) and `rollingPercentile` (`statsCore.js`) rather than inventing new regime math; a query pools every prior bar sharing the CURRENT bucket (capped at `maxAnalogs`, most-recent-first — bounds cost and is a deliberate recency bias, not an arbitrary one) whose own forward window doesn't reach into the query, and the envelope is the empirical quantile spread of what those analogs' own forward paths actually did. Reports `nAnalogs`/`nEpisodes` (raw matched windows vs. maximal contiguous runs — the closer estimate of INDEPENDENT samples) and `lowConfidence` below `minAnalogs`, so a thin bucket says so rather than drawing a confident line off five samples. `analogConeCalibration` grades it against the claimed P50/P75 coverage AND against an unconditional (no state-matching) naive floor — the regime/vol matching only earns its complexity if it beats that floor. | `js/coneBlend.js`, `forecast-blend.html` | 🟢 built + unit-tested (`analogCone.test.mjs`, synthetic data) — **not yet run on real OANDA history**, so whether the state-matched cone actually beats the naive floor live is untested |
| **Cone calibration core** | `js/coneCalibrationCore.js` (`gradeCone`, `tallyGrades`) | The shared "does this envelope contain what it claims" per-step P50/P75 coverage + direction hit-rate tally, extracted so `analogCone.js` and `coneBlend.js` share one copy instead of drifting from day one. | `js/analogCone.js`, `js/coneBlend.js` | 🟢 built. `forecastPathCore.calibrationTally` carries its own inline copy of the same logic and predates this extraction — **known drift, see §3 item 12** — left alone rather than refactored under this task's blast radius (a production page) |
| **Cone blend** | `js/coneBlend.js` (`fitBlendWeights`, `blendCones`, `weightAFor`, `blendCalibration`) | Combines Cone A + Cone B via quantile averaging in log-return space (Vincentization — matching quantiles blended, NOT a full Bayesian mixture of the two distributions; stated precisely so it isn't oversold as more than the lightweight stand-in for BMA it actually is). Weights are fit by walking forward on non-overlapping windows, scoring each cone's own envelope with pinball (quantile) loss against the realized path, inverse-error softmax — bucketed by Cone B's own (regime, volBucket) read (reused, not a new axis) with a global fallback when a bucket has under `minBucketN` graded windows (a thin bucket is not trusted with its own weight — the sample-starvation problem raised before building this). **IS/OOS split is load-bearing**: weights fit on `[0, isFrac×n)`, `blendCalibration` grades blend / Cone A alone / Cone B alone only on the held-out remainder (Lego Principle 5 — a blend that only wins in-sample is not a result). `opts.fit`/`opts.ctxA`/`opts.ctxB` passthrough avoids rebuilding the O(n)-to-O(n·volPctPeriod) contexts 2-3× per page load. | `forecast-blend.html` | 🟢 built + unit-tested (`coneBlend.test.mjs`) — **OOS win/loss vs Cone A and Cone B alone not yet measured on real data**; ship-then-measure, per the "Built ≠ works ≠ has edge" rule |
| **Forecast Blend viewer** | `forecast-blend.html` | Chart page (M15/M5 only — Cone A's intraday engine + Cone B's epoch-second-time contract are both intraday-specific; D1 is out of scope for this build) showing Cone A / Cone B / Blend as toggle-able overlays, the live weight + which bucket it came from, and the OOS calibration table (blend vs Cone A vs Cone B, claimed 50%/75%/coin-flip). Reuses `createLevelChart`/`instrumentRegistry` and the same `/api/weekly-vol-backtest/m15\|m5/:pair` route `forecast-path.html` already calls — no new backend route. **Deliberately not built yet** (sequencing, not oversight): replay slider, a persisted forward-track record, and any third/fourth cone leg (OU half-life timing, options-implied risk-neutral density) — those are the next steps IF this one earns them on OOS numbers. | — | 🟡 view-only, unverified against live OANDA data in this sandbox (OANDA is Railway-only); logic verified end-to-end against synthetic data (`smoke test`, not committed — ad hoc) |

Next steps if the OOS numbers justify them (in order, per the sequencing
discussion that preceded this build): cross-pair pooling of the bucket
weight-fit (bucket by `pairType`, not per-pair — this repo's 26-pair coverage
is a real advantage here, though FX cross-correlation means it's more like a
3-6× effective sample boost than 26×, not free); a real walk-forward
(rolling, not one static split) validation of the weights themselves; a
third cone leg (OU half-life reversion timing — the most orthogonal
remaining candidate, since Cone A and a realized-vol cone are both
price-derived while OU timing measures something different); options-implied
risk-neutral density (Breeden-Litzenberger off a FITTED smile, not raw
finite-differenced strikes — FX is delta-quoted, not strike-dense, so this
needs an SVI-style smoothing step first) as a fourth leg once an IV surface
fit exists; replacing the inverse-pinball-loss softmax with real stacking
(a small periodically-refit regression minimizing log-loss) once enough live
forward-tracked history exists to fit one without overfitting.

### 1al. Expected-Move Board — multi-pair orchestration of 1ak + dayTypeCore + gammaFlow (2026-08-03)

Built from an owner request to consolidate a "continue or fade, and by how
much, over the next N bars" read across the full pair universe in one place,
using what's already built rather than inventing anything new. Pure
orchestration brick — every input is an existing, already-registered module;
this only wires them together per pair and loops the wiring across pairs.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Expected-move core** | `js/expectedMoveCore.js` (`computeExpectedMove`, `wallModifier`) | One pair's consolidated read: magnitude from the §1ak Cone A/B blend (same call sequence `forecast-blend.html` uses — `buildIntradayContext`/`buildAnalogContext`/`intradayCone`/`analogCone`/`fitBlendWeights`/`weightAFor`/`blendCones`), direction from `dayTypeCore.classifyDayType`'s T (TREND→trust the blend's own median-path lean as CONTINUE_UP/DOWN, RANGE→FADE, MIXED→MIXED — dayTypeCore's estimators are magnitude-only/unsigned, so the actual up/down call comes from the blended cone's `center` vs `anchor`, not from dayTypeCore itself), and an optional GEX wall-proximity modifier (`gammaFlow.gammaFlip`/`distanceToFlip` + call/put-wall distance) read from the pair's `oi_store` entry when the user has pasted OI data for it — inert (`wall: null`) otherwise. No new math anywhere; see the file's own header for the exact validation-status caveat per layer (Cone A/B is OOS-graded per pair, dayTypeScore backs live strategies elsewhere, the GEX read is explicitly folklore-tier per `gammaFlow.js`). | `server.js` `/api/expected-moves/run` | 🟢 built + unit-tested (`expectedMoveCore.test.mjs`, synthetic data) — **not yet run on real OANDA history**, same caveat as §1ak |
| **Expected-Move Board route** | `server.js` (`POST /api/expected-moves/run`, `GET /api/expected-moves/status/:jobId`) | Async-job loop (same pattern as `/api/poi-reaction/run`) over a universe (`POI_ALL_PAIRS`, the 26 FX+gold pairs, by default; `POI_INDEX_PAIRS` — the 6 index CFDs, `nq/spx500/us30/de30/uk100/us2000` — opt-in via the request's `pairs`), fetching each pair's M15/M5 bars via `_wbtFetchIntraday` with the OANDA symbol read straight off `instrumentRegistry`'s `INSTRUMENTS[key].oanda` (**not** `_wbtInstrMap` — that table is keyed by `weeklyVolBacktestEngine`'s own names (`spx500`/`de30`/`uk100`/`us30`/`us2000`), which don't match `instrumentRegistry`'s canonical short keys (`spx`/`dax`/`ftse`/`dow`/`rut`) that `resolveKey()` returns; using `_wbtInstrMap[key]` after `resolveKey()` 404'd every index except `nq`, caught while wiring indices in — the FX+gold path was unaffected since those canonical keys already matched `_wbtInstrMap`'s naming 1:1), reading `oi_store` from KV once per job (not per pair) for the wall modifier. | `expected-moves.html` | 🟢 built |
| **Expected-Move Board viewer** | `expected-moves.html` | One row per pair: price, CONTINUE_UP/DOWN/FADE/MIXED + T%, expected move in pips (center/±p50/±p75) at the chosen horizon, Cone B's (regime,vol) bucket, a call/put-wall tag when price is near a pasted wall, a ⚠ for low-confidence flags. Sortable by move size / conviction / pair. A universe selector (FX+Gold 26 / Indices 6 / All 32) picks which pair set the run job covers. Clicking a row draws that pair's cone on an inline chart — same call sequence + `createLevelChart` `forecast-blend.html` uses, ported so `forecast-blend.html`'s single-pair view and this board's per-row view now render the same thing; the one thing NOT ported is `forecast-blend.html`'s OOS calibration table (`blendCalibration`'s P50/P75 coverage grading) — that's still `forecast-blend.html`-only. Carries an explicit on-page notice (mirrors this section's caveat, plus an indices-specific one below) that this is a decision-support readout, not a validated combined-edge strategy. | — | 🟡 view-only, unverified against live OANDA data in this sandbox (Railway-only); logic verified via `expectedMoveCore.test.mjs` on synthetic data |

**Indices caveat (flagged, not silently ignored, 2026-08-04):** Cone A's
session-shape profile (`buildIntradayContext`, `forecastPathCore.js`) buckets
drift/vol purely by UTC hour-of-day — right for FX's ~continuous trading,
untested for index/gold-future CFDs' own daily settlement break (~22:00 UTC).
It runs without erroring (UTC-hour bucketing doesn't require continuous data,
just enough per-hour samples) and produces a read, but that hour's bucket is
built mostly from reopen-gap bars rather than a typical trading hour — whether
that meaningfully degrades cone quality vs FX has not been checked. Cone B
(regime/vol-bucketed analogs, via `classifyRegime`'s existing per-asset-class
params) and `dayTypeCore` are both already asset-class-agnostic. Also fixed in
the same pass: `instrumentRegistry.js`'s `EXTRA_ALIASES` was missing `us30`,
`uk100`, `us2000`/`rus2000` (only the `spx500`/`de30`/`nas100` families had
aliases) — `resolveKey('us30')` etc silently returned `null` for anyone who'd
have hit this before now. Two-line completion of the existing pattern, not a
new mechanism.

Not built (deliberately, scope discipline): a persisted forward-track record
of the board's own calls (would let "how often did CONTINUE calls actually
continue" be graded, but needs live tracked history first); a portfolio-level
view (correlated exposure across the pair universe, e.g. don't count 5
EUR-cross CONTINUE_UP calls as 5 independent bets); wiring in a 3rd/4th cone
leg (OU half-life, options-implied density) — those stay §1ak's roadmap, this
board just consumes whatever `coneBlend` produces; the calibration-table gap
noted above (add it here, or keep `forecast-blend.html` as the
calibration-specific view — an open call, not yet decided).

### 1am. Pair-composite signal brick (2026-08-08) — technical+COT+macro+carry, one read

Built from an owner request: several signals this project already builds per
pair or per currency (technical regime/session bias, CFTC positioning, the
11-dimension Macro Scorecard, carry) each lived in their own separate
card/section with no combined read, and crosses (anything not a direct
CFTC-tracked USD pair, e.g. GBPJPY) had no COT read at all — §1aj's
reinforcing-pair selector only *flagged* a cross when both legs happened to
clear the strict 90th/10th percentile band, with no continuous score for
everything short of that.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Pair composite engine** | `js/pairCompositeEngine.js` | Two pure functions. `cotPairBias(base, quote, cotByCcy)` generalizes §1aj's `crowdState`/`FX_PAIRS` reinforcing-pair logic (base long-crowded + quote short-crowded ⇒ reads long the pair) from a binary 90/10-percentile flag into a continuous `[-1,+1]` score (Z-score spread between the two legs, clipped) usable for every tracked cross, not just the ones that happen to clear the strict band — `extreme` still reproduces §1aj's original binary flag exactly, same threshold. `pairComposite(legs)` averages whichever named legs a caller supplies (each pre-normalized to base-favored-positive `[-1,+1]`) into one score/direction/agreement-count, missing legs left out (never zeroed), same convention as `macroScorecardEngine.js`. Pure, no DOM/network/globals. Unit-tested `js/pairCompositeEngine.test.mjs` (14 cases, including the real GBP/JPY crowding-alert numbers from the reviewed screenshot). | `today.html` (module → `window.pairCompositeBrick`, same pattern as `window.creditBrick`) ✅; `indexv2.html` (direct ES-module import) ✅ | 🟡 built + unit-tested — **not backtested, a context combiner not a validated rule**, same posture as §1aj |
| **today.html: cross-pair COT + composite chip** | `today.html` (`cotFor`, `pairSignalComposite`, `compositeChip`) | `cotFor(name)` now falls back to `cotPairBias` for any tracked pair NOT in the hand-maintained `COT_MAP` (the 7 direct-vs-USD majors) — so all 26 tracked crosses get a COT read, marked `derived:true` and worded accordingly in the card's tooltip. `pairSignalComposite(r)` feeds `pairSignal` (technical), the (now-universal) COT read, a Macro-Scorecard base-minus-quote diff (`/2`, clipped), and a 10Y-yield-diff carry read (`/3`, clipped) into `pairComposite`; rendered as a compact `⚖ LONG 3/4` chip on each card (only shown with ≥2 covered legs) and as a new "Composite (all of the above, combined)" section at the top of the currency drawer, synthesizing the drawer's own existing Technical/COT/Carry/Fundamentals sections into one read. | `cardHtml`, `openCcyDrawer` | 🟡 built, same untested-context caveat |
| **indexv2.html: Positioning + Composite Signal dcards** | `indexv2.html` (`cotEdgeFor`, new `.dcard`s in `renderDrill`) | Fetches `/api/cot-extremes` once per backdrop load into `S.cotByCcy` (currency-keyed, not previously fetched on this page). New "Positioning" dcard mirrors the existing "Macro Fundamentals" dcard's visual shape. New "Composite Signal" dcard combines Fundamentals (`macroEdgeFor`, rescaled `/2`) + Positioning only — **deliberately does NOT fold in Rate Differential or Regime**, both already have their own dedicated dcard, and `RATE_BASIS`'s `a`/`b` sign convention is inconsistent per pair (whichever currency happens to be listed first), so folding it into a base-favored-positive composite without per-pair sign verification was judged too easy to get silently backwards — left as a documented gap, not guessed at. | `renderDrill` | 🟡 built, same untested-context caveat |

This is a *selector* (Lego Principle 4), same shape and same evidentiary
status as §1aj: composes already-built Tier-2 readings into one number, has
not been run through the honest IS/OOS harness, and ships with an in-UI
disclaimer rather than a performance claim. If ever promoted to a real
backtest, pre-register the benchmark (does the composite direction beat any
single leg alone, and does either beat a naive baseline) before running it —
same discipline §1aj's own note already asks for.

### 1an. Liquidity Gate brick (2026-08-13) — Fed/ECB/BoJ balance-sheet momentum, daily context

Built from an owner request (relayed from an external "liquidity mechanism"
suggestion) to surface Fed/ECB/BoJ balance-sheet direction vs VIX as daily
context for setting the day's trade — the same "null system, useful data"
pattern this project already used for ifo→DAX and `econTrendEngine`'s
`ECON_UNIVERSE`→`realYieldEngine`/`yieldCurveEngine`/`laborMarketEngine`.
`js/macro.js`'s `computeT1_Equity()` already computes a bare
week-over-week `WALCL−TGA−RRP` delta for index sizing, but that's US-only
and single-point — no ECB/BoJ exposure anywhere live-facing, and no history.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Liquidity gate engine** | `js/liquidityGateEngine.js` | `cbLiquidityLeg(points)` — one central bank's own balance-sheet history, z-scored on the latest period-over-period CHANGE (not the raw level, so a secularly-growing balance sheet doesn't always read "high") — `[-1,+1]`. `mergeFedLiquidity(walcl, tga, rrp)` forward-fills TGA/RRP (both more frequent than WALCL) onto WALCL's own release dates, same "attach the most recently KNOWN reading, no future leak" join `yieldCurveEngine.js`'s `mergeSlope` already uses, extended to three series. `fedNetLiquidityLeg` is the one leg that legitimately nets (WALCL/TGA/RRP all USD). `liquidityVixNote(score, vix, vixPrev)` — a hedged, descriptive-not-predictive confirming/diverging read against the caller's own already-loaded VIX. **Deliberately does NOT net USD+EUR+JPY balance sheets into one dollar-equivalent number** — the existing dormant "COG Liquidity Gate" (`js/cogLiquidityGate.js`/`cogConfig.js`, part of the Global Liquidity family) already tried exactly that and is flagged in `MARKET_DESK_PROPOSAL.md`/`GLOBAL_LIQUIDITY_SYSTEM.md` as "downstream of the WALCL units bug, re-run needed" — an unresolved cross-currency unit-mismatch. This sidesteps that bug class entirely: only same-currency legs are ever summed; ECB/BoJ are scored independently and combined by SIGN AGREEMENT via `js/pairCompositeEngine.js`'s `pairComposite()` (reused, not duplicated) at the call site. Pure, no DOM/network/globals. Unit-tested `js/liquidityGateEngine.test.mjs` (13 cases). | `today.html` (module → `window.liquidityGateBrick`, same pattern as `window.creditBrick`/`window.pairCompositeBrick`) ✅ | 🟡 built + unit-tested — **not backtested, a context combiner not a validated rule**, same posture as §1aj/§1am |
| **today.html: liquidityGateRead()** | `today.html` (`liquidityGateRead`, wired into `equitiesRisk()`) | Combines the Fed net leg + ECB/BoJ legs via `pairComposite`, adds the VIX-divergence note, and reports the result as `risk.liquidity` — a NEW display line in `renderMarketRead()` (`Liquidity: expanding/contracting/mixed · N/3 central banks agree`), positioned right after the existing Credit line. **Deliberately left OUT of the RISK-ON/OFF `tone`/`cls` classification math** — that stays driven by the pre-existing evidenced inputs (equity breadth, haven flows, credit spreads, VIX/HY levels); an unvalidated new signal doesn't get to quietly move the headline verdict. Data comes free from the existing `/api/fredhistory` pipeline — `walcl`/`tga`/`rrp`/`ecb_assets`/`boj_assets` were already in `_worker.js`'s `ALL_SERIES` allowlist (added earlier for the dormant Global Liquidity engine, never consumed live before now) with its own live FRED fallback fetch, so this shipped with **zero backend/server.js changes** — only `today.html`'s `FREDHIST_KEYS` needed the 5 new keys appended. | `equitiesRisk`, `renderMarketRead` | 🟡 built, same untested-context caveat |

Same evidentiary posture as §1aj/§1am: a *selector*, not a strategy — composes
already-fetched Tier-2 readings, ships with an explicit "context, not a
backtested rule" disclaimer in its own tooltip, and has not been run through
the honest IS/OOS harness. If ever promoted to a real backtest, pre-register
the benchmark (does the liquidity-vs-VIX divergence read actually precede a
vol regime shift, at what horizon, vs a naive baseline) before running it.

**Follow-up (2026-08-16, same PR series) — Credit Quality Spread.** The
Credit Stress Index's investment-grade quality spread (`BAA10Y`/`AAA10Y`)
turned out NOT cheap to surface via the existing `/api/credit-stress` route —
that endpoint fetches full daily OANDA history since 2005 across
`TREND_UNIVERSE` and runs a full trend-basket backtest overlay just to
produce the one `current.componentZ.quality` number, 1h-cached but still too
heavy to call from every `today.html` page load. Instead, a new lightweight
route reuses the SAME already-imported pure functions
(`buildCsiInputs`/`buildCsi` from `js/creditStressEngine.js`/`creditStressCore.js`)
**without** the OANDA-dependent backtest — `quality` is derivable from
`buildCsiInputs`'s FRED-only `components.quality` (Baa−Aaa) alone. New KV-cached,
daily-gated route `/api/credit-quality` (`credit_quality_v1` — added to
`kv.js`'s `_CF_EXACT` immediately per this project's own hard-learned
persistence lesson), same exact shape as every other numeric engine here.
Wired into `today.html`'s `equitiesRisk()` as `risk.creditQ`, reported as its
own line right after the Liquidity line — a different axis than the existing
HY-OAS-LEVEL credit line (junk-bond spreads): this is investment-grade
credit-curve SHAPE. Same "reported, not folded into tone/cls" treatment as
Liquidity above.

**Follow-up (2026-08-16, same PR series) — MVE fair-value chip.** Third and
last item from the same null-backtest sweep. `today.html`'s `loadMve()`
fetches `/api/mve/:sym` (already live, 1h server-side cache) for the 6
MVE-supported instruments (`GOLD→XAUUSD, EURUSD, GBPUSD, USDJPY, AUDUSD,
NQ`) once per page load, and `mveChip(r)` renders a `◆ MVE cheap/rich Nσ`
chip on eligible cards — tooltip states plainly that this project's OWN
backtest found the underlying signal null-to-negative
(`MARKET_VALUATION_ENGINE.md`/`js/mve/*`) and it's shown as read-only
context, not a lean. **Explicitly NOT folded into `pairSignalComposite`/
`pairComposite`'s agree/total count** — inflating an "agreement" tally with
a confirmed-non-working leg would be dishonest, same discipline as every
other "context, not a signal" caveat this session's combiners carry.

---

### 1an. Overnight-hold vs buy & hold engine (2026-08-11) — the education/buy-and-hold-notes.md task, run for real

Built from the education-notes task itself (`education/buy-and-hold-notes.md`):
enter long 20:00 UK, exit 14:30 UK the following session, NAS100 + XAUUSD, M1
data, compared against continuous buy & hold, then run through a prop-firm
rule check. Reuses the existing session-window / M1 / metrics baseplate
(`barUtils`, `nasdaqSessions`'s exact IANA-based UK-time conversion —
preferred over `sessionRanges.londonOffsetHours`'s ±1h DST approximation for
this one, since the task's own gate is specifically about catching timezone
error — `metricsCore`, `instrumentRegistry`); the only new logic is the
session-window trade construction, the cost/financing model, the mirror-test
integrity check, exposure/correlation and the prop-firm rule check.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Overnight-hold engine** | `js/overnightHoldEngine.js` | Pure core (no network — data passed in): `buildOvernightTrades`/`mirrorTest` (stage-01/02/03 gates — timezone sanity, Sun-Thu trading calendar, last-tick-before fill, session-edge exceptions logged not fabricated), `applyCosts` (stage 04 — spread/slip/overnight-financing/triple-swap-day, restated `DEFAULT_COST_PCT`/`DEFAULT_SLIP_PCT` from `honestForecastEngine.js`'s honest-harness convention), `computeMetricsTable`/`correlationToBuyHold`/`maxDrawdownWithDuration` (stage 05), `toCsvReturns`/`toCsvRMultiples`/`toCsvCurrency`/`combineInstruments` (stage 06, exact 3-schema house convention), `runPropFirmRuleCheck` (stage 07 — daily loss / static+trailing drawdown / profit target+time / consistency, illustrative generic ruleset, not any named firm's real numbers; returns BOTH the first breach of each rule *and* the full event log — `dailyLossBreachEvents` for every breach day, `staticDrawdownEpisodes`/`trailingDrawdownEpisodes` for every contiguous breach episode with start/end/trough, not just the worst one), `resampleDailyFromPacked` (D1 OHLC straight off the packed typed arrays, for the overview chart — deliberately bypasses `barUtils.resampleTo`'s bar-object materialization at 3.6M+ M1 rows). `runOvernightHoldBacktestForPairs` is the thin IO wrapper (`loadM1ForPair`) for server/CLI use. Unit-tested on synthetic M1 data `js/overnightHoldEngine.test.mjs` (19 cases: mirror-test reconstruction, MAE sign, DST-transition trading-calendar, triple-swap multiplier, CSV schema, rule-check breach/pass paths, breach-event grouping, daily resample correctness). | `server.js` (`/api/overnight-hold-v1/run` + `/status/:jobId` + `/m1/:instrument` trade-zoom, same async-job Map pattern as `/api/macro-equity-backtest`); `overnight-hold-backtest.html` (dashboard) | 🟢 built, unit-tested, **and actually run on real M1 data** (R2, both instruments, 2016-01-04 → 2026-06-05) — see result below. Not walk-forward / IS-OOS split; costs, financing bps/night and the rule-check limits are documented illustrative assumptions, not fetched from a live broker/firm feed. |
| **Dashboard** | `overnight-hold-backtest.html` | Self-contained dark-theme page (house convention, `lightweight-charts@4.2.0` via the same CDN pattern as `asia-range-backtest.html`/`backtest-viewer.html`/`cog-replay.html`): per-instrument daily candlestick chart with **every trade plotted as a marker** (green=net win, red=net loss) — click a marker to zoom into that trade's real M1 path (entry/exit price lines + MAE, fetched on demand via `/m1/:instrument`, server-cached so repeat clicks don't re-fetch 90MB from R2), gross/net vs buy&hold comparison table, hand-built SVG equity-curve+drawdown chart, exposure/correlation line, a **browsable stage-02 exceptions table** (every skipped day + reason, with reason/weekday breakdown bars, not just a count), a prop-firm rule-check card with a **full breach-event log** (every daily-loss-breach day, every drawdown-breach episode with start/end/trough — not just the first), 3 CSV export buttons, plus an equal-weight combined-portfolio pass. Ruleset/cost inputs are editable in the UI, not hidden constants. | Standalone page, linked from `index.html` | 🟢 built; the server-side contract is verified against the live route (confirmed `dailyBars`/exceptions/breach-event JSON shapes and the `/m1` trade-zoom endpoint against real data, field-for-field against what the page's JS reads). The client-side rendering itself could **not** be exercised with a headless browser in this sandbox — Chromium here cannot reach `http://127.0.0.1:<port>` at all (confirmed via a `data:` URL control test that DID load, isolating it to loopback HTTP specifically, not a general browser-launch failure) — so treat the chart/modal JS as code-reviewed and shape-verified, not click-tested, until someone runs it in a normal browser. |

**The honest result, since this one was actually run (not just built):** on
the full available R2 history for both instruments (~10.4 years, 2016-01-04 to
2026-06-05), the raw overnight effect exists **gross** on both legs (NQ
+172% compounded, gold +260% compounded) but is **erased by costs** on both —
net total return is slightly **negative** on both (NQ −3.9%, gold −2.3%) over
the full window, against continuous buy & hold's +572% (NQ) and +309% (gold)
over the same span. Sharpe on both net series is ≈0.03 (indistinguishable
from zero) and correlation to buy & hold is ≈0 on both (−0.09 NQ, −0.01 gold)
— so whatever's left isn't a lower-beta copy of buy & hold, it's just not
there net of cost. Under the illustrative generic rule check, **neither
instrument, nor the combined blend, would have passed historically** — both
breach the daily loss limit on at least one historical overnight gap and
breach the trailing drawdown over the multi-year window; the profit target is
technically reached eventually but far outside any reasonable time limit.
This is the opposite of the task's own a-priori framing (which expected the
NQ leg to look "reasonably strong" gross and questioned only whether it
survived costs) — **both legs, not just gold, turn out flat-to-negative net**.
Exceptions logged during stage 02 (638 gold / 651 NQ, out of ~2,719 expected
trading days) are overwhelmingly (543/each) Sunday-20:00 attempts where the
market hadn't reopened yet — the session-edge handling the task's own stage-02
gate asks for, not a data-quality problem.

This is a real result on real data, not a null from missing infrastructure —
but it used one set of illustrative cost/financing/ruleset assumptions.

**Update (2026-08-11, same day): the cost-sensitivity sweep asked for above is
now built and run.** `costSensitivitySweep(grossTrades, assetKey, opts)`
re-applies costs at a grid of scale multipliers (0x = free fills through 2x =
double the assumed defaults) against the SAME already-built gross trades — no
M1 rescanning, cheap even at 2000+ trades — and finds the breakeven scale by
linear interpolation between the grid points that bracket the sign change.
`applyCosts` gained a `costScale` param (default 1, no behavior change for
existing callers) that the sweep turns as its one knob. 5 new unit tests (24
total): costScale=0 reproduces pure gross exactly, return is monotonically
non-increasing in cost scale (costs only ever subtract, by construction), the
interpolated breakeven self-consistently nets ~0%, and an already-negative-
at-zero-cost series is reported as "no breakeven" rather than a fabricated
one. Wired into every `/run` response as `costSweep` (no new endpoint needed
— reuses the trades already built that call) and surfaced in the dashboard as
a per-instrument sweep chart plus a cross-instrument "which leg is actually
closer to working" summary panel.

**The real answer, run against the same R2 data:** gold's breakeven sits at
**98.2%** of the assumed cost level, NQ's at **96.2%** — both within a few
percentage points of the current assumption. This reframes the earlier
"both net negative" result: it isn't costs dwarfing a real edge, it's a
knife-edge case where the specific illustrative cost assumption happens to
sit almost exactly at the crossover for both instruments. Gold needs a
smaller relative cost cut (1.8pp) to flip positive than NQ does (3.8pp) —
consistent with gold's own net number already being less negative (−2.3%
vs −3.9%) — so under these specific assumptions gold is marginally the leg
closer to working, again the opposite of the task's own a-priori framing.
The more decision-relevant takeaway: because both sit this close to the
edge, the verdict is NOT robust to the (documented, not-fetched-from-a-real-
broker) cost assumption — a plausible, small change to the real spread/slip/
financing numbers would flip the conclusion for either instrument. Before
trusting the current "fails net" verdict for a real decision, plug in the
actual broker's numbers rather than the illustrative defaults.

**Update (2026-08-11, same day again): the combined-portfolio "diversification
beats both legs" claim did NOT survive a walk-forward check — retracted, not
softened.** The full-history combined pass (+0.17% vs gold −2.3% / nq −3.9%)
had been described as a genuine diversification benefit. Asked directly
whether that holds up under a proper split rather than the single full-
history number, two new pure functions were added: `yearlyDiversificationBreakdown`
(per-calendar-year gold/nq/combined net %, gold-nq correlation, and whether
combined beat BOTH legs that year) and `diversificationIsOosSplit` (one
shared chronological split date derived from the overlap window — not
per-leg trade count, so no leakage — oosFrac=0.4 matching
`honestForecastEngine.js`'s `summarizeSplit` convention). 5 new unit tests
(26 total): correct per-year compounding against a hand-built anti-correlated
pair, exact split-date arithmetic on a leap-year-safe window, and trade-count
conservation across the IS/OOS partition.

**Run against the same R2 data, the answer is no — it does not hold up:**
combined beat **both** individual legs in **0 of 11** years tested. In the
true chronological split (before/after 2022-04-05): in-sample, gold −21.8%,
nq +13.9%, combined −3.6% (combined loses to nq, so "beat both" = **no**);
out-of-sample, gold +24.8%, nq −15.7%, combined +3.9% (combined loses to
gold, so "beat both" = **no** again). In every single year and in both
halves of the IS/OOS split, the equal-weight blend sits between the two legs
— it never beats the stronger one. The full-history "+0.17%, beats both
individually" number is real arithmetic, but it is a **compounding-path
/ volatility-drag artifact specific to that one full ~10.4-year window**, not
a robust, repeatable diversification effect — it doesn't reproduce in any of
the 11 years or either IS/OOS half tested separately. The earlier framing
("pure diversification benefit from the ~0 correlation between them") was too
generous and is corrected here rather than left standing. Also notable: the
gold-nq correlation itself is unstable across the split (IS ≈ −0.008, OOS ≈
+0.184) — the "near-zero correlation" full-history read isn't a stable
structural property either. One documented modeling nuance surfaced by this:
on a date only one leg has a trade (the other hit a stage-02 exception), the
combined blend uses that leg's return unweighted rather than halved, so it
isn't a strictly-constant 50/50 exposure every day — visible in 2022, where
combined (−12.25%) finished worse than BOTH individual legs, which a true
constant-weight blend should never do.

**Update (2026-08-11, third pass: "any suggestions on how to turn this
profitable?"): the single biggest lever found so far — Wednesday (triple
swap) alone flips both instruments from net-negative to strongly net-positive.**
Two additions, both cheap given the existing engine: `weekdayBreakdown(netTrades)`
groups the net trade series by entry weekday (trade count, avg/compounded net
%, win rate, profit factor, avg financing cost, triple-swap-night count) — a
zero-new-infrastructure query on data already computed, per the "check the
cheap, evidence-backed lever first" plan. Separately, `server.js`'s
`/api/overnight-hold-v1/run` now accepts real-broker cost overrides
(`spreadPctGold`/`spreadPctNq`, `slipPctGold`/`slipPctNq`,
`financingBpsGold`/`financingBpsNq`, keyed through to `applyCosts`'
`costPct`/`slipPct` by asset class) instead of only the financing-bps
override it had before — surfaced as an open-by-default "Real broker costs"
form section in `overnight-hold-backtest.html`, blank = engine default.
6 new unit tests (27 total, all passing): correct per-weekday compounding,
correct triple-swap financing surfaced per weekday, and a functional
end-to-end check that the new cost-override fields actually reach `applyCosts`
(verified live against the real route: overriding to tighter costs moved
gold's 10.4-year net return from −2.34% to +149.9%, and the per-trade cost
fields in the response reflected the override exactly).

**The real numbers are stark.** Gold's weekday breakdown: Mon −0.7%, Tue
+14.0%, **Wed −19.0%**, Thu +6.5% (compounded, over the full window). NQ:
Mon +53.7%, Tue +21.3%, **Wed −33.8%**, Thu −22.2%. Wednesday is financing
`avgFinancingCostPct` ≈3x every other night (the triple-swap rule doing
exactly what it's supposed to) and by a wide margin the worst night for
both instruments. Because compounding is associative across weekday groups,
the "skip Wednesday entirely" total is exact arithmetic, not an estimate —
and it's large: **gold goes from −2.3% to +20.6% net; NAS100 goes from
−3.9% to +45.1% net**, over the same ~10.4-year window, by removing one
night out of five. Rough decomposition: the marginal 2x-extra financing
from tripling (vs charging it once) alone compounds to roughly −15pp for
gold across ~533 Wednesday trades — a large fraction, though clearly not
all, of Wednesday's −19pp. This is exactly why the cost-override fields
matter alongside this: **whether a real broker actually triples the charge
on Wednesday specifically (vs Friday, vs not at all for CFD gold/NAS100)
is an assumption, and now both directly testable in the same dashboard** —
skip-Wednesday-as-a-rule and correct-the-swap-assumption are related but
not identical, and the honest next step is checking which one (or both)
apply to a specific real account before treating either as a finding about
the strategy itself rather than about this one configuration.

**A correction made along the way:** this update also restores the
"## 2. Candidate bricks" section heading below, which was accidentally
deleted by an earlier edit in this same file (the prior diversification-
retraction pass) — the section content itself was never lost, only its
heading, but it's a real slip worth naming rather than quietly patching.

**Update (2026-08-12: "test skip-Wednesday as an actual rule and rerun"):**
the arithmetic shortcut above ("if Wednesday were removed, total return
would be X") is correct as far as it goes, but it can't show the
risk-adjusted picture — Sharpe, drawdown shape, or whether the prop-firm
rule check actually changes — because those aren't linear in the trade
series the way total compounded return is. `buildOvernightTrades` now takes
`opts.skipWeekdays` (array of `0`=Sun..`6`=Sat): no entry is even attempted
on an excluded weekday, logged as a distinctly-labeled `skipped by rule —
{weekday} entries excluded` exception (kept apart from the "no bar within
tolerance" market-closed/data-gap exceptions it sits alongside in the same
array), so it flows through the *entire* pipeline as a real rule — cost
sweep, weekday breakdown, rule-check, diversification — not just total
return. `server.js`'s `/run` accepts `skipWeekdays` in the body; the
dashboard gained Sun–Thu exclusion checkboxes (all unchecked by default —
opt-in, doesn't change baseline behavior). 1 new unit test (28 total):
confirms no Wednesday trade exists under the rule, the excluded count
matches exactly, and the exception reason is distinctly labeled.

**Run for real (not the shortcut) with Wednesday excluded — the total
return numbers match the shortcut exactly (confirms the shortcut was
sound), and the risk-adjusted picture is genuinely better, though not a
free pass:**

| | Gold — baseline | Gold — skip Wed | NQ — baseline | NQ — skip Wed |
|---|---|---|---|---|
| Total return % | −2.3 | **+20.6** | −3.9 | **+45.1** |
| Sharpe | 0.032 | **0.244** | 0.030 | **0.394** |
| Calmar | −0.006 | **+0.070** | −0.014 | **+0.159** |
| Max drawdown % | −38.75 | −25.75 | −27.24 | −22.87 |
| Worst DD ever recovers? | **no** (still under at end) | **yes** (took ~8.1yrs) | no | still no |
| Daily-loss breach | yes (1) | **none** | yes (1) | **none** |
| Trailing-DD breach | yes | yes (still) | yes | yes (still) |
| Profit target in time (≤30d) | no (92d) | no (1490d) | no (835d) | no (447d) |
| **Overall rule-check** | **fail** | **fail** | **fail** | **fail** |

The daily-loss breach disappearing traces to a precise mechanism, not
coincidence: `runPropFirmRuleCheck` buckets P&L by *exit* date (when it
books), and both breaches (gold 2026-03-19, NQ 2020-03-12) turn out to be
labeled by their Thursday exit date for a trade that actually *entered* the
prior Wednesday (2026-03-18, 2020-03-11 — both confirmed Wednesdays) —
removing the entry removes the breach it produced. The overall verdict is
still **fail** for both instruments even with Wednesday excluded — the
trailing-drawdown and profit-target-timing rules still breach — so this is
a real, substantial improvement in the underlying edge, not a rule that
makes the strategy pass a prop-firm check. Worth naming as a caveat too:
skip-Wed's profit target takes *longer* to reach in raw days than the
baseline (1490 vs 92 for gold) despite the far better final number — an
early-lucky-run artifact in the baseline path, not evidence that skip-Wed
is strictly better on every single axis.

**Update (2026-08-12: "why is Wednesday so bad? what about not entering a
stop loss and letting them run to the time out?"): decomposed the Wednesday
drag into gross-return vs cost, and confirmed the strategy already has no
stop-loss.** `weekdayBreakdown` now also returns `avgGrossPct`/
`compoundedGrossPct` (pre-cost) and `avgSpreadCostPct`/`avgSlipCostPct`
(alongside the existing `avgFinancingCostPct`) per weekday, so the total
Wednesday drag can be split into "the trades themselves were worse" vs "the
triple-swap charge did it" rather than inferred. 1 new unit test (28 total):
hand-built fixture with different weekday gross returns but identical
spread/slip and only Wednesday's financing tripled, asserting gross sits
above net and spread/slip are flat across weekdays while financing isn't.
Surfaced in `overnight-hold-backtest.html`'s weekday table (gross % / net %
/ spread % / slip % / financing % / win rate / profit factor columns,
replacing the old net-only view) and re-verified against the live route.

**The two instruments fail for different reasons — this is the actual
answer to "what's special about Wednesday":**

| | Gold — Mon | Gold — Tue | Gold — Wed | Gold — Thu | NQ — Mon | NQ — Tue | NQ — Wed | NQ — Thu |
|---|---|---|---|---|---|---|---|---|
| Compounded **gross** % | 30.2 | 53.1 | **27.7** | 41.5 | 86.5 | 50.3 | **1.4** | **−4.3** |
| Avg spread % (flat) | 0.025 | 0.025 | 0.025 | 0.025 | 0.010 | 0.010 | 0.010 | 0.010 |
| Avg slip % (flat) | 0.015 | 0.015 | 0.015 | 0.015 | 0.010 | 0.010 | 0.010 | 0.010 |
| Avg financing % | 0.015 | 0.015 | **0.045** | 0.015 | 0.020 | 0.020 | **0.060** | 0.020 |
| Compounded **net** % | −0.7 | 14.0 | **−19.0** | 6.5 | 53.7 | 21.3 | **−33.8** | **−22.2** |

- **Gold's Wednesday problem is almost entirely a cost artifact.** Gross
  Wednesday (27.7%) sits in the same range as Monday (30.2%) and Thursday
  (41.5%) — the price action itself isn't unusually bad. Spread and slip are
  identical every night (0.025/0.015 flat). Financing is exactly 3× on
  Wednesday (0.045 vs 0.015) and nowhere else. Take the triple-swap charge
  away and gold's Wednesday looks like an ordinary night.
- **NQ's Wednesday (and Thursday) problem is real, not just cost.** Gross
  Wednesday collapses to 1.4% and gross **Thursday goes negative** (−4.3%) —
  both far below Monday's 86.5% and Tuesday's 50.3%. Thursday carries no
  triple-swap charge at all (financing back to the normal 0.02) and is still
  the worst gross night, so something about the price action entering
  Wednesday night and Thursday night specifically is genuinely weaker for
  NQ, on top of — not instead of — the triple-swap charge stacking on the
  same Wednesday night. Both effects are real and compounding, not one
  explaining the other away.
- Practical read: correcting an unrealistic triple-swap assumption (per the
  cost-override fields above) would likely repair most of gold's Wednesday
  problem but only part of NQ's — NQ needs its actual overnight-hold edge on
  Wed/Thu explained or excluded, not just its cost model fixed.

**On the stop-loss question: there already isn't one, and MAE evidence
confirms trades are already given the maximum available time to recover.**
`buildOvernightTrades` has never had a stop-loss — every trade is opened at
20:00 UK and closed at the fixed 14:30 UK exit regardless of what happens in
between; the only way out early is a stage-02 data exception, never a price
level. Checked directly against the real per-trade `maePct` (worst
intra-trade adverse excursion) vs the trade's final `netPct` on the same
2016–2026 R2 run: **95.7% of gold trades (1,991/2,081) and 95.5% of NQ
trades (1,975/2,068) show a worse intra-trade drawdown than their final
recorded result** — i.e. the overwhelming majority of trades were already
underwater by more, at some point overnight, than they finished at losing
or winning by the scheduled exit. The single worst trade for each
instrument is itself a Wednesday entry that ended up recovering some ground
by the timeout: gold's worst MAE (−7.11%, on the 2026-03-18 Wednesday entry)
finished at −5.48% net, and NQ's worst MAE (−8.26%, on the 2020-03-11
Wednesday entry) finished at −5.46% net — both are the same two trades that
tripped the daily-loss-limit breach in the prop-firm rule check above, now
tied to a concrete number: without the fixed-timeout exit, an intrabar stop
placed anywhere between the MAE and the final result would have locked in a
*worse* outcome than just waiting for 14:30. This doesn't prove a stop-loss
would hurt overall — a stop caps the unknown remaining 4–5% of trades where
MAE was shallower than the final loss, which this data doesn't isolate — but
it does confirm the premise behind the question was backwards: the strategy
already lets every trade run to the timeout with no early exit, and on the
worst individual trades that no-stop design is what turned a bigger interim
loss into a smaller final one. Testing the **opposite** — adding a stop-loss
at some MAE-derived level and comparing net result/Sharpe against the current
no-stop baseline — is a well-defined next test, not yet built.

**Update (2026-08-12: "what about holding for longer than 14:30? increase an
hour each time to see if holding until London close gets better results?"):
built and run — the result is a mild improvement for one instrument, a worse
one for the other, neither flips net-negative to net-positive.**
`buildOvernightTrades` gained `opts.exitTime` ('HH:MM', default '14:30' — no
behavior change for existing callers), threaded through to the mirror leg too
so overnight+mirror still reconstruct the full calendar day at any exit time.
New pure function `exitTimeSweep(packed, startEpoch, endEpoch, assetKey,
opts, exitTimes)` reruns `buildOvernightTrades`+`applyCosts` once per
candidate exit time (a real M1 rescan each time — this changes which bar
gets picked, unlike the cost-scale sweep which reuses one set of built
trades) and reports total return/Sharpe/win rate/profit factor/avg hold
hours per candidate, plus which one wins. Candidate list defaults to
`['14:30','15:30','16:30']` — 14:30 through London close, matching
`nasdaqConfig.js`'s own `london` session window (`08:00–16:30` UK). 2 new
unit tests (30 total): exitTime correctly shifts the exit fill and the
mirror leg together (reconstruction identity still holds at a later exit
time), and the sweep's average hold duration grows by ~1h per candidate as
expected. Wired opt-in (`opts.exitTimes` — only rescans when the caller asks
for it) into `runOvernightHoldForInstrument`'s output as `exitSweep`,
`server.js`'s `/run` route (validated `HH:MM` array), and the dashboard as a
new "exit-time (hold duration) sweep" table+chart with an opt-in checkbox
("off by default" per the same "expensive extra sweep, don't run it
unasked" pattern as the skip-weekday rule).

**One documented modeling simplification, stated not hidden:** `applyCosts`'
`exitSlipMult` (widens the exit leg for "US cash-open volatility at 14:30
UK") is held fixed across every candidate exit time — a later exit is
further from the actual cash open, so if anything this makes the later-exit
points slightly conservative (still charged cash-open-level slippage for a
calmer, later fill), not optimistic.

**Run for real against the same R2 data — the honest answer is mixed, not a
clean win:**

| | Gold 14:30 | Gold 15:30 | Gold 16:30 | NQ 14:30 | NQ 15:30 | NQ 16:30 |
|---|---|---|---|---|---|---|
| Net total return % | **−2.3** | −15.8 | −6.3 | **−3.9** | −13.4 | **−2.9** |
| Sharpe | 0.032 | −0.080 | 0.014 | 0.030 | −0.024 | 0.059 |
| Win rate % | 51.5 | 49.6 | 50.3 | 52.3 | 50.3 | 53.0 |

Gold gets **worse** at every later exit tested — 15:30 is the sharpest drop
(−15.8%), 16:30 partially recovers but still sits well below the 14:30
baseline. NQ's best point in this sweep is actually London close (16:30,
−2.9%), a small improvement on the 14:30 baseline (−3.9%) — but it's still
net-negative, not a flip to profitable, and 15:30 is the worst point for NQ
too (−13.4%), the same non-monotonic dip seen in gold. Both instruments
dipping hardest at 15:30 UK specifically (not a smooth trend toward London
close) suggests something in the NY-morning path around that hour is
genuinely adverse for a long holding through it on this data, not just
noise from one instrument — worth flagging as a pattern rather than
explaining away, though decomposing *why* 15:30 is the worst point
specifically hasn't been done (the same gross/cost-decomposition approach
used for the Wednesday question above would be the natural next step if
that's wanted). **Bottom line: holding longer does not rescue this
strategy** — at best (NQ, London close) it trims the loss by about a point;
at worst (gold, 15:30) it roughly 7x's it. The original 14:30 exit remains
the better of the tested options for gold; NQ has a marginal, not
game-changing, case for London close instead.

**Update (2026-08-12, same day: "how about earlier then?"): built the
mirror-image direction — exiting BEFORE 14:30, back toward London open —
and it surfaces a genuine multiple-testing trap worth naming rather than
selling.** `exitTimeSweep` was direction-agnostic already; added
`DEFAULT_EARLY_EXIT_TIMES` (`14:30 → 13:30 → … → 08:00`, London open per
the same `nasdaqConfig.js` `london` window used for the close bound) and
fixed `baselineExitTime` to resolve by matching `'14:30'` in the candidate
list rather than assuming it's always `exitTimes[0]` — needed once a caller
can combine earlier+later candidates into one sorted array with 14:30
sitting in the middle. 1 new unit test (31 total): earlier candidates
shrink `avgHoldHours` as expected, and baseline resolves correctly even when
14:30 isn't first in the array. Dashboard gained a second, independent
checkbox for the earlier direction; checking both merges into one sorted
9-point 08:00→16:30 grid in a single run.

**Run for real against the same R2 data, the full grid (08:00 through
16:30, hourly, both instruments):**

| Exit (UK) | Gold net % | NQ net % |
|---|---|---|
| 08:00 | −21.0 | −22.9 |
| 09:30 | −17.8 | −10.0 |
| 10:30 | −17.8 | −18.1 |
| 11:30 | −3.0 | −10.3 |
| 12:30 | **−0.4** | −1.1 |
| 13:30 | −4.1 | **+13.0** |
| 14:30 (baseline) | −2.3 | −3.9 |
| 15:30 | −15.8 | −13.4 |
| 16:30 | −6.3 | −2.9 |

Two honest reads, not one blended one:
- **The coherent part:** exiting anywhere from 08:00–10:30 is clearly worse
  than the 14:30 baseline for BOTH instruments, by a wide and consistent
  margin (roughly −18pp to −21pp net) — closing out mid-London-morning,
  well before the US session, is a real and repeatable drag here, not noise.
  Gold's best point in the whole 9-candidate grid is 12:30 (−0.4%, close to
  breakeven and clearly better than the −2.3% baseline) sitting in a smooth,
  believable trough shape either side of it (11:30 −3.0%, 13:30 −4.1%) —
  that's the kind of result worth taking seriously.
- **The part that should NOT be sold as a finding:** NQ's 13:30 point
  flips to **+13.0%**, the only positive cell anywhere in either sweep,
  immediately flanked by its own neighbors at −1.1% (12:30) and −3.9%
  (14:30) — a single hour, single instrument spike surrounded by negative
  results on both sides, out of a 9-candidate grid with no correction for
  multiple testing and no OOS split run on it. This is exactly the
  "finding a few winners among many slices is what noise does" pattern this
  file's own working agreement warns about — reporting it as "hold NQ to
  13:30" would be curve-fitting one lucky cell, not evidence of an edge.
  Flagged here as a candidate for a proper walk-forward check (same
  discipline as the diversification retraction above) **before** it's
  treated as anything more than an interesting single data point — not done
  yet.
- **Bottom line, combining both directions:** the 14:30 baseline is not the
  single best point on the grid for either instrument, but nothing on the
  grid is convincingly better either — gold's best credible improvement
  (12:30, ~2pp) is modest and sits in a believable local shape; NQ's only
  standout point (13:30) is the one result across this whole exercise that
  looks like noise dressed as a finding, not a repeatable edge.

### 1ao. CB-sentiment lexicon + FOMC statement backfill (2026-08-17) — Stage 2 of the sentiment→price test

Built for `MD files/CB_SENTIMENT_PRICE_TEST.md` (pre-registered 2026-08-15;
Stage 1's registered drift cell came back a clean null, banked). This pass
adds the two bricks Stage 2 needs and the server job that runs them where
fed.gov and the LLM API are reachable (Railway — the build sandbox reaches
neither, which is also *why* the lexicon lists are guaranteed frozen-before-
scoring: no historical document was fetchable while they were written).

| Brick | File | What it does | Consumers | Status |
|---|---|---|---|---|
| **CB lexicon scorer** | `js/cbLexicon.js` | Deterministic hawk/dove scorer (Apel–Blix Grimaldi-style term counting, statement-register phrase regexes, ~26 terms/side, FROZEN as `cb-lexicon-v1`): `score(text)` → `{score∈[−1,1], hawk, dove, nWords, hits}` with the matched-substring audit trail. Zero tunables by design — it is Scorer A (confirmatory) precisely because an LLM scoring 2019 text knows 2020. Changing a list after historical scores exist voids Stage 3 (re-register as v2). Unit-tested `js/cbLexicon.test.mjs` (direction, determinism, false-positive guards, edge cases). | `server.js` `_fomcBackfillJob` | 🟢 built, tested; **not yet run on a real statement** (needs the deployed server) |
| **FOMC historical calendar** | `js/fomcHistory.js` | Scheduled decision days 2016→2025 (79 meetings + sep flags; 2020 intermeeting emergency actions excluded by design), `allMeetings()` (merged+deduped with live `FOMC_MEETINGS`), `previousMeetingDate()`. Deliberately NOT merged into `fomcCalendar.js` so `pendingAsOf`/calendar routes keep their behavior. Provenance: all dates passed Stage 1's ≥2× 14:00 ET vol-spike join proof (82/82 incl. 2026). | `server.js` backfill + `_fomcPrevMeetingDate` (now diffs the first live-calendar meeting against its true 2025 predecessor instead of returning null) | 🟢 built |
| **Backfill job + routes** | `server.js` | `POST /api/fomc-backfill/run[?llm=1]` (fire-and-forget + running guard, same pattern as `/api/fomc/fetch-now`), `GET /api/fomc-backfill/status` (heartbeat KV `fomc_backfill_log`), `GET /api/fomc-backfill/scores`. Phase 1: idempotent raw capture (`fomc_raw_statement_<date>` never refetched/overwritten — live point-in-time captures are safe) + lexicon scores, 1.2s politeness delay on actual fetches only. Phase 2 (`?llm=1`, needs `ANT_KEY`): standard `_buildFomcAnalysis` over meetings with no analysis, `fomc_latest` pointer snapshotted+restored so a historical backfill can't repoint the dashboard. Output: KV `fomc_lexicon_scores` (per-meeting lexicon + LLM scores and meeting-over-meeting Δs) — the Stage-3 join input. | Stage 3 event-study join (`analysis/fomc_event_study/`, to be extended) | 🟢 built; ⏳ **awaiting a run on the deployed server** |

---

### 1ao. Impulse/EMA/Range-Exhaustion engine + Range Percentile brick (2026-08-17) — mechanising a colleague's posted 1m trades, tested null

Owner shared screenshots of a colleague ("Jordan", tagging `@C.OG`) posting
"test" trades on 1-minute Gold and Nasdaq TradingView charts — the visible
elements were an impulsive swing leg, what looked like an EMA cross, an
"H-L Range: Live / Median / 75th Pct" tool, and TradingView's Long/Short
Position drawing (the red/green box = SL/entry/TP, **not** a POI zone — a
correction from the first-pass read of the screenshots). Ask: build a real
research tool, formalise the visible pattern, and test whether the STYLE has
edge on real data — not to reproduce those specific screenshotted trades
(blocked: OANDA is 403 in this sandbox and the cached M1 series ends
2026-06-05, before the screenshots' 13–14 Aug 2026 dates).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Range Percentile core** | `js/rangePercentileCore.js` | `trailingRangeDistribution`, `quantile`, `percentileOf`, `rangeExhaustionRead` — ranks a session's forming H-L range against the EMPIRICAL trailing-N-day distribution of realized D1 H-L%. New primitive: `VolRangeForecaster` is a THEORETICAL Brownian-motion range forecast off a vol estimate, not an empirical percentile-of-history read — this fills that gap. Pure, unit-tested (`js/legoBricks.test.mjs`) | `js/impulseEmaRangeV1Engine.js` | 🟢 built + unit-tested |
| **Impulse/EMA/Range engine (v1)** | `js/impulseEmaRangeV1Engine.js` | `runImpulseEmaRange(packed, cfg)` — composes `patternEngine.pivotHighs/pivotLows/computeATR` (impulse-leg detection, ATR-normalized), `indicatorCore.ema` (fast/slow cross), the new range-percentile brick (exhaustion gate), and `forecastCore.walkBars` (fill/exit). Direction = CONTINUATION of the impulse (buy/sell the 38.2–61.8% pullback), stop beyond the realised pullback's own extreme, fixed-RR target, one trade/day. Every judgment call is pinned and documented in the file header per the Build Plan discipline. Costs on. **Pinned — never edited in place after the baseline result below; every follow-up variant forks to v2 instead**, per this repo's own "version it, don't overwrite" rule. | `education/jordan_impulse_range_backtest/scripts/run_one.mjs`, `sensitivity.mjs`, `mae_dynamic_stop.mjs`, `server.js`'s Trade Lab route | 🔴 **built + backtested — tested NULL**, see below |
| **Impulse/EMA/Range engine (v2)** | `js/impulseEmaRangeV2Engine.js` | Same contract, forked from v1 specifically so v1 never gets touched for an experiment. Adds `maxTradesPerDay` (>1), `rangeGateMode:'exhausted'` + `rangeGateMinUsedFrac`, `entryBandMode:'vwap'` + `vwapBandAtrMult`, exported `buildDaily`, and additive `legOriginTime`/`legExtremeTime` per trade — all backward-compatible (v1-matching defaults verified byte-identical to v1's own committed baseline `trades.json`, both instruments, before any follow-up number was trusted). | `education/jordan_impulse_range_backtest/scripts/multi_trade_per_day.mjs`, `range_gate_flip.mjs`, `vwap_entry_band.mjs`, `session_split.mjs`, `liquidity_sweep_filter.mjs`, `live_validation_harness.mjs` | 🟡 built + unit-verified against v1; the follow-up cfgs it carries are each tested null-but-improving, see below |

**Result — null, consistently, across every knob tried.** Full 10.4-year real
M1 history (2016-01-04 → 2026-06-05, `loadM1ForPair('gold')` and
`loadM1ForPair('nq', portfolioBacktest/cache)`), costs on, true 60/40 IS/OOS
split:

| Instrument | Trades | Win% | PF | Sharpe (full) | Sharpe (OOS) | Buy&Hold Sharpe |
|---|--:|--:|--:|--:|--:|--:|
| Gold (baseline, RR 2:1) | 3,156 | 24.1% | 0.357 | −5.99 | −4.44 (n=1263) | +0.82 |
| NQ/NAS100 (baseline, RR 2:1) | 3,149 | 32.3% | 0.642 | −2.49 | −2.63 (n=1260) | +0.81 |

Sensitivity swept RR (1.0/1.5/2.0/3.0), the range-exhaustion gate (on/off/tight),
and the impulse-size threshold (2.5×/3.5× ATR) — **every single variant on
both instruments stayed negative**, IS and OOS close together (not an
overfit-then-broke pattern — there was never an edge to break). The range gate
barely moved the trade count or Sharpe on/off, meaning as implemented it isn't
doing meaningful discrimination. Full detail, method, and the pinned judgment
calls: `education/jordan_impulse_range_backtest/RESULTS.md`.

This lands in the same place as the closely-related `poiReactionV1Engine.js`
(§ColezTrades POI backtest, `education/coleztrades_poi_backtest/`) — a
structural-zone-plus-momentum-confirmation family that has now been tested
null twice, on different instruments and a different confirmation mechanism
(VuManChu divergence there, EMA cross + range-exhaustion here), both times
IS-consistent-with-OOS. Not proof the general style can never work — only
that this specific, honestly-pinned formalisation of it doesn't, on 10 years
of Gold/NQ M1.

**Follow-up (2026-08-17, same day) — the owner correctly rejected the above as
answering the wrong question** ("build a P&L backtest" vs "read what actually
preceded these entries and find the real trend"). Built a second, genuinely
different brick in response: **`js/impulseRetracementGeometry.js`** —
`findImpulseRetracements(bars, opts)` (pivot-detected impulse legs, ≥2×ATR,
tracks the deepest pullback before continuation/invalidation as a fraction of
the leg) + `kmeans1D`/`histogram` for unsupervised pattern discovery. This is
a **descriptive geometry pass, not a P&L engine** — no entries/stops/costs.
Run on the full real 10.4y M1 archive (both instruments, replicated at M5 and
native M1): unsupervised k-means (k=3, no Fib level assumed) lands at
**0.36-0.38 / 0.62 / 0.87-0.88 on BOTH Gold and NQ** — the classic Fibonacci
retracement levels, recovered from real data with nothing coded in. Bigger
impulses (5×+ATR) retrace shallower (~0.45-0.48) before continuing than
smaller ones (2-3×ATR, ~0.74) on both instruments; EMA(9/21) agreement at the
turn is a lagging confirmation (only ~59-60% of turns already have it), not a
leading trigger. Full result, the 4-known-trade comparison, and the honest
caveats: `education/jordan_trade_geometry/RESULTS.md`. Unit-tested
(`js/legoBricks.test.mjs`) against a hand-built synthetic 61.8%-retrace case.

**Follow-up (2026-08-17, same day) — Trade Lab visual page, Railway-deployable.**
The owner asked for a real chart, not just numbers: `trade-lab.html` (self-contained,
lightweight-charts, same style as `level-chart-demo.html`) + new server routes
`GET /api/trade-lab/candles`, `GET /api/trade-lab/geometry`,
`POST /api/trade-lab/geometry-window`. New brick **`js/tradeLabDataSource.js`**
(`loadTradeLabBars`) stitches the frozen R2 archive with a LIVE OANDA→Yahoo
fallback for any window past the archive's last sync (`loadM1ForPair` checks
R2 before local disk on every call with no caching, so this brick also adds
its own per-process in-memory archive cache — found the hard way: an
uncached repeat request took 46s, re-downloading the whole 90MB/65MB archive
every time). Both OANDA and Yahoo are 403 in this sandbox (confirmed by
direct test) — the page degrades gracefully and REPORTS the failure
(`liveStatus`/`liveError`, a visible badge), never silently shows nothing;
same for the chart-lib CDN itself, which is also policy-blocked here (fixed
a real bug found by this: `createLevelChart` throws synchronously, which
silently killed the ENTIRE page script before the fix — now every `view.*`
call is null-guarded so data/stats/the density plot still work chart-lib-down).
Tested end-to-end via Playwright against the local server on the cache-only
path (real numbers, verified against `education/jordan_trade_geometry`'s own
output) — the live-fetch path is untestable from here by construction and
needs a real check once deployed to Railway.

**Follow-up (2026-08-17, same day) — direction split + the VuManChu volume/
Money-Flow question, and a caught-in-time lookahead artifact.** Two asks in
one: (1) had the geometry pooled up- and down-impulses together? Yes — split
in `run_geometry.mjs`'s new `byDirection`, a small real, replicated asymmetry:
up-impulses continue slightly more often (49-51% vs 45-47%) and retrace less
deeply (median ~0.60-0.62 vs ~0.64) than down-impulses, on both instruments.
(2) does volume/Money-Flow confirmation (reusing `js/vumanchuCore.js` +
`js/divergenceCore.js` — the SAME bricks `poiReactionV1Engine`'s Stage-3 gate
uses on a fade geometry, no new math) predict which impulses continue —
new script `education/jordan_trade_geometry/scripts/run_vumanchu_gate.mjs`.
**First pass looked like a huge finding (48% baseline → 88.7% with VWAP
agreement) and was a hindsight-selection artifact**, the same class of bug
`STAGE3_VUMANCHU_GATE.md` already caught once before, just subtler this time
— not a same-candle leak (checked: only 1.8%), but scoring the indicator at
the bar the detector picks by scanning FORWARD to find the retrospectively-
final extreme, which a live trader could never identify at that exact bar.
Fixed with a confirmation-delay design (score N bars after the retrospective
extreme, drop occurrences already resolved within that window) — corrected
result: baseline jumps to ~90% on its own (surviving a few bars unresolved is
informative), and VuManChu confirmation adds close to nothing on top,
inconsistently, on both instruments. Full diagnosis and both the naive and
corrected numbers: `education/jordan_trade_geometry/VUMANCHU_GATE.md`.

**Follow-up (2026-08-17, same day) — "assume the rule is correct" historical
trade browser.** The owner asked to flip the framing: even though
`impulseEmaRangeV1Engine.js` backtested null (Sharpe −5.99 gold / −2.49 NQ,
above), they want to SEE every trade it would have generated on real Gold/NQ
history, visually, before deciding whether to chase a forward-looking alert
idea — explicitly deferred until this listing works. New route
`GET /api/trade-lab/strategy-trades` (instrument, outcome win/loss/all, sort
recent/oldest, paginated) runs `runImpulseEmaRange` once per instrument
against the full archive (`loadFullArchivePacked`), cached in-process
(`_tradeLabStrategyCache`, same lazy-`Map<key,Promise>` pattern as the
archive cache above — computing it live is ~36-67s of CPU, too slow to redo
per request) and adds a human-readable `fibText` per trade (which
38.2/61.8/88.6% zone the entry fell in, derived from `entryFrac`). New
"Strategy backtest trades" card in `trade-lab.html`: filterable/sortable/
paginated table, states up front that the rule "isn't validated as
profitable" and links `RESULTS.md`; clicking a row draws that trade's
impulse origin/extreme, all three Fib levels, and entry/SL/TP on the chart
via `drawStrategyTradeOnChart`. Also fixed a real bug this surfaced: empty
Entry/SL/TP inputs were read with `Number('')` which is `0`, not `NaN`, so
the panel silently showed "0.00 / 0.00 (NaNR)" instead of "set entry/SL/TP"
— fixed with a `numOrNull(id)` helper (checks the raw string for `''`
first) at all 3 call sites that independently read those fields. Verified
end-to-end via Playwright against the local server (Gold: 3,156 trades,
32.8% win rate; NQ: 3,149 trades, 35.5% win rate — matches the backtest
totals above) — table load/filter/paginate/row-click-to-chart all confirmed
working; the chart canvas itself is blank in this sandbox only because the
lightweight-charts CDN is policy-blocked here (same known limitation as
above), not a defect in this feature.

**Follow-up (2026-08-17, same day) — small dynamic stop, on the "if it's
going to lose it loses fast" premise.** Also null, on both instruments. New
script **`education/jordan_impulse_range_backtest/scripts/mae_dynamic_stop.mjs`**
re-walks every baseline trade's real M1 path (same source/discipline as the
existing `maeFromPath` MAE figures, never approximated from closes) two ways:
(1) an adverse-excursion-by-bar-count profile split winners vs losers — losers
do reach ≥0.75R adverse fast (~99% by bar 0-1, both instruments), but so do a
third to over half of WINNERS at the same early bar, from the same mechanical
cause (entries fill as a stop right as price is mid-retracement, so early
adverse drift is common to both outcomes, not distinctive to losers); (2) a
`fracEarly`×`kBars` grid re-simulating a tightened stop active only for the
first `kBars` bars post-fill, reverting to the full structural stop after —
bounded to the SAME UTC-day cutoff the baseline engine uses (one trade/day),
after a first unbounded-horizon version was caught, mid-audit, silently
carrying trades past midnight and re-labeling ~1-3% of EOD-marked "wins"
that never actually touched TP; fixed and reverified with 0 outcome
mismatches vs baseline across all 6,305 trades before trusting the grid.
Result: Sharpe degrades monotonically as the early stop tightens, on both
Gold (−6.09 mild → −8.58 aggressive vs −5.99 baseline) and NQ (one
economically meaningless cell ~0.05 Sharpe better than baseline, everything
past it worse) — losers "saved" always vastly outnumber winners cut short in
raw count, but each cut-short winner gives up a full ~2R target for what a
saved loser only avoids a fraction of a ~1R loss, net negative on Sharpe/PF
every time it's checked. Third independent test of this engine family now
null (baseline backtest, VuManChu confirmation gate, and this). Full method
and both instruments' grids: `education/jordan_impulse_range_backtest/MAE_DYNAMIC_STOP.md`.

**Follow-up (2026-08-17, same day) — relaxing "one trade per day".**
Owner noticed real intraday charts commonly show a 2nd qualifying impulse
the same day, after the first has resolved — asked whether the engine's
one-trade/day cap (already flagged untested in RESULTS.md) was discarding
real opportunities. Added `maxTradesPerDay` as a backward-compatible cfg on
**`js/impulseEmaRangeV2Engine.js`** (a versioned fork — v1 stays pinned and
untouched; default `1`, unchanged, verified byte-identical to v1's own
committed baseline `trades.json` for both instruments before trusting
anything higher) — when `>1`, the day loop resumes scanning right after
each trade's own exit bar, folding the skipped in-trade bars back into the
running session range first so the next signal's range-exhaustion gate
still reads the full day-so-far range. New script
**`education/jordan_impulse_range_backtest/scripts/multi_trade_per_day.mjs`**
sweeps `maxTradesPerDay` 1/2/3/5. Result: the premise is confirmed (a 2nd+
setup exists on ~97% of trading days, both instruments — not rare) but
taking it doesn't help — win rate barely moves (noise either direction)
and Sharpe gets monotonically WORSE as more trades/day are allowed (Gold
−5.99→−13.66, NQ −2.49→−7.03 at maxTradesPerDay=5), because every extra
trade shares the same negative per-trade edge as the first (confirmed by
scoring the "2nd+-only" trades separately — same win rate, same sign).
Fourth independent test of this engine family now null (baseline,
VuManChu gate, dynamic stop, and this) — all four point at the entry
signal itself, not the exit/sizing/cadence around it. Full method and
both instruments' tables: `education/jordan_impulse_range_backtest/MULTI_TRADE_PER_DAY.md`.

**Follow-up (2026-08-17, same day) — three more entry-hypothesis probes,
one confound caught, two real (still-negative) improvements found.** Owner
asked to step back from "is this exact formalisation right" and infer what
ELSE could produce the visible pattern, given four independent nulls on the
continuation-on-pullback entry itself. All three probes run
`js/impulseEmaRangeV2Engine.js` (v1 stays pinned and untouched) for its
additive `legOriginTime`/`legExtremeTime` and exported `buildDaily`, each
reusing the now-standard byte-identical-at-default backward-compat check:

- **Session/time-of-day split** (`scripts/session_split.mjs`) — a first pass
  bucketed by `fillTime` and found 77% of gold trades in hours 22-04 UTC,
  which turned out to be a day-loop artifact (78% of hour-00 trades fill
  within 30 min of midnight — carried-over legs, not fresh setups), caught
  and fixed by re-bucketing on the new `legExtremeTime` instead. Corrected
  result: still no hour-of-day cell survives n≥30 + full/IS/OOS-positive,
  either instrument. `education/jordan_impulse_range_backtest/SESSION_SPLIT.md`.
- **Liquidity-sweep filter** (`scripts/liquidity_sweep_filter.mjs`, post-hoc
  on the existing baseline trades, no re-backtest) — only count a leg whose
  origin swept the prior calendar day's H/L first (a stop-hunt-then-reversal
  read). Result: a real, IS/OOS-consistent improvement on both instruments
  (Gold Sharpe −5.99→−1.89 on 15% of trades, NQ −2.49→−0.93) — still net
  negative, but the strongest survivor in this whole investigation.
  `education/jordan_impulse_range_backtest/LIQUIDITY_SWEEP_FILTER.md`.
- **VWAP-anchored entry band** (`entryBandMode: 'vwap'` on v2, reuses
  `js/vumanchuCore.js`'s `computeVWAP` session-anchored) — swap the fixed
  Fib retracement band for `|close − sessionVWAP| ≤ vwapBandAtrMult × ATR`.
  Result: beats the Fib band at every threshold tried (0.25×-1.5×ATR), on
  both instruments, with near-identical trade counts to baseline and low
  threshold-sensitivity (both signs of a real effect, not a lucky slice) —
  still net negative (Gold →−3.66, NQ →−0.76).
  `education/jordan_impulse_range_backtest/VWAP_ENTRY_BAND.md`.

- **Range-gate flip** (`rangeGateMode: 'exhausted'` on v2, inverts the gate
  to require an already-stretched day instead of room-left) — the
  strongest result of all four probes: Sharpe improves
  mostly-monotonically as the threshold rises, reaching −0.48 (gold) and
  **−0.10, PF 0.961** (NQ) at the highest threshold tried — still net
  negative, but the closest any variant has come to breakeven this session.
  `education/jordan_impulse_range_backtest/RANGE_GATE_FLIP.md`.

**Taken together**, every follow-up that showed a real, IS/OOS-consistent
improvement (liquidity sweep, VWAP band, range-gate flip) shares a theme —
"the day/move is already significant" beats "wait for it to look tidy."
None cross into positive Sharpe alone; combining them is untested.

**Follow-up (2026-08-17, later same day) — live-OANDA validation harness.**
Owner corrected the MAE-dynamic-stop test's framing (Jordan actually runs
his own MAE analysis and a stop that shifts because of it — a different,
unspecified mechanism from the one time-boxed-tightening implementation
already tested null, see `MAE_DYNAMIC_STOP.md`'s correction note) and asked
for a way to check the engine's live-forward signals against Jordan's
actual trades directly, on real OANDA data. New script
**`education/jordan_impulse_range_backtest/scripts/live_validation_harness.mjs`**
— cannot run from this sandbox (OANDA 403 by policy), meant for Railway or
the owner's own machine. Loads the frozen R2 archive, gap-fills it to NOW
via real OANDA M1 (reusing `js/m1GapFill.js`'s `gapFillPacked` +
`fetchM1Range` — the SAME chunked-fetch brick the per-line book's own
rebuild-time top-up uses, not a new one-off fetch loop; a naive single
`fetchM1Range` call would silently truncate over a ~10-week gap given
OANDA's 5000-bar-per-request cap), then runs 4 variants via v2 (`baseline`
at v1-matching defaults, `rangeGateMode:'exhausted'` @1.5x,
`entryBandMode:'vwap'` @0.5xATR, and a liquidity-sweep post-filter) over
the extended data, prints every trade
since 2026-08-01, and cross-references against the known reconstructed
Jordan trades (same numbers as `trade-lab.html`'s `KNOWN_TRADES`; 4 from
13-14 Aug plus 4 more from 24 Aug added 2026-08-24, each with its own
`approxTime` now that the set spans more than one session — see
`js/liveValidationCore.js`) for timing/direction/price proximity. Verified
end-to-end in this sandbox
(minus the actual OANDA fetch, which correctly 403s here as expected) —
gap-fill chunking, error handling, and the "still short of Aug 1" guard all
confirmed working before this was committed. Deliberately uses RELATIVE
imports (unlike this folder's other scripts, which hardcode this sandbox's
absolute clone path) since it must run at a different path elsewhere.

**Known duplication flagged, not fixed here:** `impulseEmaRangeV1Engine.js`'s
local `buildDaily(packed)` (unexported, v1 stays untouched) and
`impulseEmaRangeV2Engine.js`'s own exported copy of the same function are
now a 5th and 6th independent copy of the same D1-bucketing loop already
inlined in `js/poiReactionV1Engine.js`, `js/rangeExtEngine.js`,
`js/backtest-worker.js` and `js/gold-backtest-worker.js` — a P1 extraction
candidate (see §2), not extracted here to avoid touching those files' tested
call sites in an unrelated change. v2 deliberately did NOT import v1's
`buildDaily` (it isn't exported, and shouldn't be — v1 stays exactly as
originally committed, nothing added to it, not even an export).

### 1ap. COT positioning factor core (2026-08-21) — DF-01's six steps, publication-lagged

Built for the pre-registered test in `MD files/COT_POSITIONING_FACTOR_TEST.md`
(proposal P-C of `education/151_STRATEGIES_PROPOSALS.md`, from book strategy 9.2
+ `education/data-foundations-notes.md` DF-01). Companion to — **not** a
replacement for — the display-grade COT ranking in `_worker.js`.

| Brick | File | What it does | Consumers | Status |
|---|---|---|---|---|
| **COT factor core** | `js/cotFactorCore.js` | Pure, network-free (history passed in): `tradableFrom(reportDate)` — the **publication-lag rule**, derived from `release = report + 3d` (Tue snapshot → Fri 15:30 ET) then the first Monday strictly after, so an off-cycle CFTC date can never resolve before its own release; `cotFactorSeries(rows, {flip, window})` → per-week `{date, tradableFrom, specNet, share, z, pct}` where **`share = specNet/openInterest` is what gets ranked** (DF-01 step 2), z/percentile over a 156-week window; `qualifies()` (≥260 SCORED weeks — contract renames truncate Socrata history silently, so it counts scored weeks, not raw rows); `COT_FACTOR_UNIVERSE` (the 8 contracts with local M1 price history, each with its flip flag, pinned dataset and mapped pair) and `COT_DATASETS` (Socrata ids + participant fields). **Imports `statsCore`'s `rollingZScore`/`rollingPercentile` rather than adding a THIRD copy of the repo's duplicated `pctRank`/`zScore`.** Unit-tested `js/cotFactorCore.test.mjs` (lag rule incl. year-boundary + every-weekday safety, OI-normalisation, flip-together convention, window fill, null-not-Infinity on bad OI, input hygiene, history guard). | `server.js` `_cotBackfillJob` | 🟢 built, tested; **not yet run on real history** (CFTC unreachable from the sandbox) |
| **History backfill + routes** | `server.js` | `POST /api/cot-backfill/run` (fire-and-forget + running guard), `GET /api/cot-backfill/status`, `GET /api/cot-backfill/series`. Pulls FULL Socrata history (2006→, `$limit=3000`, ascending) for the 8 contracts, walking each contract's `alt` names on a rename, 800ms politeness between calls; scores via the brick; writes KV `cot_factor_history_v1` (durable — it is the frozen INPUT to a registered test, so a redeploy must not force a re-fetch of a *different* revised vintage). Deliberately does NOT read `/api/cot-extremes`: that is 156-week-capped, 7-day-cached, current-week-only and unlagged. | `cot-extremes.html` "⏬ Factor history" button | 🟢 built; ⏳ **awaiting a run on the deployed server** |

**Known limitation recorded with the build:** Socrata serves the *current* value
of historical rows, so this is a revised-vintage backtest, not a first-print one.
No vintage capture exists and building one would take years of forward capture.
Stated in the pre-registration rather than discovered later.

---

### 1ap. CME CVOL implied-vol brick + FX/Gold vol-carry (VRP) backtester (2026-08-21)

Owner uploaded a CME CVOL EOD parquet export (daily options-implied vol index
+ ATM/skew/convexity, per instrument, 2016–2026-08-20) and asked what could be
built with it against the existing systems. Grepped the whole repo first: no
implied-vol data was wired in anywhere — every "vol" number here (the live
forecaster, every regime classifier, `js/volBacktestEngine.js`) is
realized/statistical vol computed from OANDA price history. This is the first
market-implied (forward-looking, options-derived) vol source in the codebase.

Built the variance-risk-premium (VRP = implied − realized) angle first, per
the owner's ask: does CVOL add information as a GATE on the platform's
existing fade/follow exhaustion-band strategy, versus always-fade and
always-follow at the same band (the named benchmarks). **Explicitly NOT** a
synthetic variance-swap/short-vega payoff — no FX options or variance swaps
are tradable here (spot only), so a literal "sell implied variance" backtest
would be a different, more optimistic-looking, untradeable lookalike test —
the kind CLAUDE.md's honest-teammate section says not to run and call the
thing. VRP is used purely as a spot regime signal.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Implied-Vol core** | `js/impliedVolCore.js` | `loadCvolSeries(product)`, `alignCvolToBars` (exact-date, no forward-fill), `realizedVolPct` (RV30 annualized %, fx→Yang-Zhang(30)/commodity→HV(30) — imports `yzVolSeries`/`hvVarSeries` from `volBacktestEngine.js`, never re-implemented), `computeVRPSeries` (VRP + rolling z-score via `statsCore.rollingZScore`). Reads the static snapshot `js/data/cmeCvolEod.json` (16,657 rows, 7 products: EURUSD/GBPUSD/USDJPY/AUDUSD/USDCAD/USDCHF/XAUUSD), converted by `scripts/convertCmeCvol.py` | `js/fxVolCarryEngine.js` | 🟢 built + unit-tested (`js/fxVolCarryEngine.test.mjs`, synthetic data, no network) |
| **Honest-day resolver, extracted** | `js/honestForecastEngine.js` → `resolveHonestDay` (newly exported) | The fill/cost/mark-to-close mechanics previously locked inside private `simulateDayHonest`, now takes an ALREADY-DECIDED `band`/`act` instead of deriving it from `entryMode` internally — so a different selector (VRP here) can drive the SAME mechanics without copying them (Lego Principle 1). `simulateDayHonest` now just computes `band`/`act` from `entryMode` and delegates. Byte-identical behavior for existing callers (`runHonest`/`compareModes`/`forecastCore.js` unaffected — only additive fields: `maePct` real path-derived MAE off the D1 OHLC, `slDPct` the trade's own vol-scaled stop distance, both newly needed for the house 3-CSV-export convention) | `js/fxVolCarryEngine.js` (new), `simulateDayHonest` (existing, unchanged behavior) | 🟢 refactored, `node js/legoBricks.test.mjs` + `node js/fxVolCarryEngine.test.mjs` both pass; the one pre-existing failure in legoBricks (`volatility plan: band fractions match canonical computeBands`) reproduces identically on `main` before this change — not caused by this work |
| **FX/Gold Vol-Carry engine** | `js/fxVolCarryEngine.js` | `selectStrategyVRP(vrpZ, cfg)` — vrpZ≥richZ→fade, ≤cheapZ→follow, else flat (mirrors `selectStrategy(T,...)`'s shape: a selector on top of the primitive, not a new leg); `runVRPBacktest` — three arms (vrp-gated / always-fade / always-follow) sharing the SAME trend-derived band per day, differing only in action, so the comparison isolates what VRP adds; `runVRPSuite` (fetch+run across `VRP_INSTRUMENTS`); equity curves, monthly heatmap, and the house 3-CSV-export functions (`toCsvReturns`/`toCsvRMultiples`/`toCsvCurrency` — R-unit is the trade's own vol-scaled `slDPct`, not a fixed %, so it isn't numerically redundant with % Return, the degenerate case CLAUDE.md flags) | `server.js` (`/api/fx-vol-carry/run`+`/status`, async-job pattern copied from vol-backtest-v2), `fx-vol-carry-backtest.html` | 🟡 built + unit-tested on synthetic data; **not yet run against real OANDA/CVOL data** — OANDA is 403 in this sandbox (confirmed: `Host not in allowlist`), same documented limitation as every other live-data engine here. Needs a real run on the Railway deploy before any verdict badge on the page means anything |
| **FX Vol-Carry page** | `fx-vol-carry-backtest.html` | Run button + async-job poll (mirrors `vol-backtest-v2.html`'s pattern) with Chart.js visuals per instrument: cumulative-return chart (3 arms overlaid), CVOL-vs-RV30 diagnostic chart, monthly-return heatmap, IS/OOS tables, verdict badge (vrp OOS Sharpe vs the better baseline, gated on ≥30 OOS trades), 3 CSV export buttons. States plainly in an info-box that CVOL is a static snapshot and this is a spot-only VRP gate, not an options strategy | `server.js`'s `/api/fx-vol-carry/*` | 🟡 built, registered in `js/siteApiMap.js` + `SITE_MAP.md` (WIP group) — untested against live data per above |

**Also fixed while investigating "what else could use this data"**: a
separate, unrelated bug the owner flagged — AnalogML's daily trade output
was undiscoverable. `motif_track.py`'s live paper-trade log surfaces on
`bot-config.html`'s AnalogML tab, but the only Site Map entry for "AnalogML"
pointed at the retired k-NN `analogml-backtest.html` (tagged NULL), so
following the documented discoverability path led to "this is dead" instead
of the live table. Added a `bot-config.html#tab-analogml` entry to
`js/siteApiMap.js` + `SITE_MAP.md` and disambiguated the archived entry.
**Not fixed** (outside this session's reach): the underlying trade log
(`AnalogML/data/motif_trades.json`) hasn't advanced past 2026-08-13 as of
2026-08-21 — `motif_track_loop.sh`'s hourly loop appears to have stopped
succeeding on Railway. That's an ops check (is the loop running, are its R2
creds still valid), not a code fix from here.

**Other integration ideas surfaced but not built this pass** (owner expressed
interest, scoped as follow-ups): feeding CVOL level/z-score as a regime
feature into `RegimeV2`/`V4`/`V7`/`RegimeOptimizer` (orthogonal to their
existing price-only features; `skew`/`skewRatio` in particular is a new
information category — options positioning — distinct from the COT/OI data
already tracked); wiring XAUUSD CVOL into `Gold`/`GoldV2`/`regime_classifier_gold_mtf.py`
directly (a clean match since gold already has dedicated infrastructure).
Coverage caveat for both: CVOL only has 6 USD-major pairs + gold, none of the
19 cross pairs the platform actually trades.

**Follow-up (2026-08-22) — a second uploaded dataset, CBOE GVZ + VXN, wired into the same engine.**
Owner uploaded `XAUUSD_GVZ_2016_present.zip`: CBOE's GVZ (GLD-options implied
vol, close-only) and VXN (NDX-options implied vol, full OHLC), 2016–2026-08-19,
a genuinely different provider/methodology than CME CVOL, not a duplicate.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **CBOE vol-index loader** | `js/impliedVolCore.js` → `loadCboeVolSeries`, `cboeMeta`, `crossCheckSeries` (new exports) | Reads `js/data/cboeVolIndices.json` (`scripts/convertCboeVolContext.py`), normalizes GVZ/VXN into the SAME row shape `loadCvolSeries` produces (close→`cvol`; `atm`/`skew`/`upvar`/`dnvar`/`convexity` stay null — CBOE doesn't publish them, not fabricated) so `computeVRPSeries` and every existing consumer work unchanged on either source. `crossCheckSeries` aligns two independent implied-vol reads of the same underlying onto one bar series and reports their Spearman correlation (`statsCore.spearman`, imported not reimplemented) | `js/fxVolCarryEngine.js` | 🟢 built + unit-tested |
| **`realizedVolPct` index branch** | `js/impliedVolCore.js` | Added the missing `assetClass==='index'` path (GARCH(1,1) via `garchSigmas`, same as `volSigmaSeries`'s own index path) — the function only handled fx/commodity before; NQ has no realized-vol comparator without this | `js/fxVolCarryEngine.js`'s NQ instrument | 🟢 built + unit-tested |
| **NQ + gold cross-check wiring** | `js/fxVolCarryEngine.js` | `VRP_INSTRUMENTS` now carries `volSource`/`cvolProduct`\|`cboeProduct` per instrument instead of assuming CME; added **NQ** (`oanda: NAS100_USD`, `assetClass: 'index'`, primary source **CBOE VXN** — CME CVOL has no index coverage at all, so this is NQ's ONLY implied-vol source) and gave **GOLD** a `crossCheck: {volSource:'CBOE', cboeProduct:'XAUUSD'}` (GVZ) — computed as a correlation + overlay against the SAME diagnostics, explicitly NOT a second trading arm, so the comparison stays honest instead of quietly doubling GOLD's apparent edge surface. `volSigmaSeriesFor` and `runVRPBacktest` gained the matching GARCH branch for the exhaustion-band width itself | `server.js`'s `/api/fx-vol-carry/*` (unchanged route — instrument filter was already generic), `fx-vol-carry-backtest.html` | 🟡 built + unit-tested on synthetic + the real CBOE files (`js/fxVolCarryEngine.test.mjs`, 33 checks); still not run against live OANDA data — same sandbox limitation as the CME-only pass above |
| **Cross-check UI** | `fx-vol-carry-backtest.html` | GOLD's card now renders a correlation badge + a 2-line implied-vol overlay chart (CVOL vs GVZ) under its monthly heatmap; instrument dropdown adds NQ; the IV-vs-RV diagnostic chart title/legend now reads the actual source (`CME:XAUUSD` vs `CBOE:NAS100`) instead of hardcoding "CVOL" | — | 🟡 built, same untested-live caveat |

**Follow-up (2026-08-26) — first real run found a real bug, not a null.** Owner
ran `fx-vol-carry-backtest.html` for real (Railway, live OANDA + the static
CVOL/CBOE files) and pasted the results back: the `vrp` arm showed **exactly
0 trades on all 8 instruments, IS and OOS**, while `alwaysFade`/`alwaysFollow`
traded normally (hundreds of trades each) — the asymmetry was the tell this
was broken plumbing, not "VRP has no information" (a genuine null would look
like a trade-count-reduced baseline, not zero everywhere on every instrument
across 11 years).

Root cause, traced and proven against the real data files (not assumed):
CME CVOL and CBOE (GVZ/VXN) only settle on US options-exchange trading days,
so US holidays OANDA still trades through (MLK Day, Presidents Day, Good
Friday, Thanksgiving, …) are missing rows in both `js/data/cmeCvolEod.json`
and `cboeVolIndices.json` — ~98-99 gaps over 2016-2026, spaced every ~28
trading days on average. `computeVRPSeries`'s z-score used
`statsCore.rollingZScore`, which requires the ENTIRE 252-day trailing window
to be gap-free before it computes anything. A 252-day window is never once
clean when gaps recur every ~28 days — verified directly: **0 of 2774 days
came out finite, for the whole 11-year history.**

| Fix | File | Detail |
|---|---|---|
| **Tolerant rolling z-score** | `js/impliedVolCore.js` → `rollingZScoreTolerant` (new, private to this file) | Requires 85% window coverage instead of 100%, computing mean/stdev off whatever's actually present in the window. Deliberately NOT added to `statsCore.rollingZScore` itself — that primitive's other callers correctly rely on its strict all-finite contract for a price series, where a gap usually means broken data; VRP's gaps are a known, bounded, calendar-driven pattern, a different case. Verified against the real gap pattern: 2432 of 2774 days now finite |
| **`cboeMeta` wired through** | `server.js`'s `/api/fx-vol-carry/run` handler | A second real bug found in the same review pass: `runVRPSuite` already returned `cboeMeta`, but the route only destructured `cvolMeta` — so the page's info box silently never showed CBOE's data coverage, even though NQ and the GVZ cross-check were both working off it correctly. One-line fix |
| **Regression test** | `js/fxVolCarryEngine.test.mjs` (test #11) | Reproduces EURUSD's ACTUAL CVOL calendar (not a synthetic approximation of the gap pattern) and asserts both a majority-finite z-score and actual filled trades, so this exact failure mode can't silently return |

Verified none of the ~82 commits that landed on `main` between the original
build and this fix touched any file this system depends on (`impliedVolCore.js`,
`fxVolCarryEngine.js`, `honestForecastEngine.js`, `volBacktestEngine.js`,
`statsCore.js`, `forecastCore.js`) before re-running the full test suite —
34 checks pass, `legoBricks.test.mjs`'s one pre-existing unrelated failure
(`volatility plan: band fractions match canonical computeBands`) is unchanged.
**Still needs a real re-run on Railway** to confirm the fix produces sane
trade counts and Sharpe numbers against live data — the fix is proven against
the real calendar/gap pattern in isolation, not yet against a full live run.

---

### 1ap. Impulse Range Engine (2026-08-23) — 4H impulse-as-range continuation/fade research, extending Entry Trigger Lab

A colleague handoff (Jordan) proposed a specific, testable framing: a
significant 4H impulse candle might work better as a REFERENCE RANGE (levels
+ extensions lower-timeframe price action tests for continuation vs fade)
than as a standalone directional signal, conditioned on Asia/Monday range
confluence and VWAP context. Explicit instruction: extend the Asia-range
confluence work already built for `entry-trigger-lab.html`, not build a
disconnected model — the H4 resampling, Asia/Monday ladder history, and the
today-vs-yesterday confluence math are all imported straight from
`js/entryTriggerLabEngine.js` (itself not yet its own formal §1 row —
gap noted, not backfilled here) / `js/confluence-core.js`; VWAP is
`js/vwapReversionEngine.js`'s `computeSessionVwap`; swing-structure regime
classification is `js/patternEngine.js`'s `classifySwingStructure`/`regimeAt`.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Impulse Range Engine** | `js/impulseRangeEngine.js` | `detectH4Impulses` (classic/displacement presets, strictly causal — qualification uses only the impulse's own H4 bar + strictly prior bars, never a future one), `impulseLevels` (same `low+range*fib` convention as `ranges.js:projectFibLevels`, deliberately — lets impulse levels and Asia/Monday levels compare through the same `detectConfluencesCore` call), `detectFVG` (new — no fair-value-gap detector existed anywhere in the repo before this), `buildVwapContext`/`vwapAt` (daily-reset VWAP + slope, reusing `computeSessionVwap`), `computeAsiaConfluence` (reuses `activeLevelsAt` + `detectConfluencesCore` — same Pine-matching math as Entry Trigger Lab, applied to impulse-vs-range instead of range-vs-range), `classifyLtfReaction` (one forward walk over lower-timeframe bars at-or-after the impulse's close → deterministic `CONTINUATION`/`REVERSION`/`FAILED_IMPULSE`/`EXTENSION`/`NO_CLEAR_EDGE` outcome + MFE/MAE, kept strictly separate from the independent evidence-flag booleans so outcome labels are never fed back as detection inputs, per the handoff's explicit anti-lookahead requirement), `scoreImpulse` (explicit, unvalidated experimental weighted-count — spec says do not claim predictive until validated), `runImpulseRangeScan` (orchestrator), `aggregateImpulseStats` (by-session/day-of-week/instrument/confluence/score-edge/LTF-granularity breakdowns). Pure, no I/O. 23 unit tests on synthetic data (`js/impulseRangeEngine.test.mjs`), including a dedicated causal-window test (a huge-body bar placed just outside the `bodyLookback` window must NOT inflate the average). | `impulse-range-lab.html` | 🟢 built + unit-tested + Playwright-verified end-to-end (mocked chart lib); **not yet run against real OANDA data** — sandbox can't reach it, needs a Railway check |
| **Impulse Range Lab (page)** | `impulse-range-lab.html` | Dashboard: pair/date/preset picker, 4H impulse markers + impulse-range/extension/Asia-confluence lines (scoped to each impulse's own reaction window via the same real-bar-coordinate clipping fix as `entry-trigger-lab.html`'s line-bleed bug — never falls back to the raw canvas edge), a 3m/1m LTF toggle (resamples the fetched M1 feed client-side via `barUtils.resampleTo`, or uses M1 directly), click-to-inspect evidence/outcome/score panel, and a stats side panel for every `aggregateImpulseStats` breakdown. Explicitly research-only (banner states it plainly) — not wired into any execution signal. | registered in `js/siteApiMap.js` (WIP group) + `SITE_MAP.md` | 🟡 built + smoke-tested; awaiting a real Railway data check |

**Server-side prerequisite:** `server.js`'s `/api/ohlc-range` only allowed
`M5/M15/M30/H1/D` before this — no `M1`, and OANDA has no native `M3`
granularity at all. Widened `_RANGE_GRAN` to include `M1` (the underlying
`fetchOandaCandleRange` was already granularity-agnostic, so this is a pure
allow-list change); 3-minute bars are resampled from M1 client-side, never
fetched directly.

**What v1 answers vs defers**, against the handoff's own §16 research
questions: detection, level/extension projection, Asia/Monday confluence,
VWAP context, and a deterministic outcome taxonomy are all built and
unit-tested. Deliberately deferred/simplified for v1 (documented, not
hidden): the "reversion return target" only checks a return to impulse
high/low, not the handoff's other options (midpoint/open/VWAP); FVG and
structure-break are new, first-pass detectors (no prior brick existed to
compare against); the confluence score's weight table is explicitly
unvalidated per the handoff's own instruction not to optimise before the
underlying questions are answered. **No result yet** — this is
infrastructure, not a finding; the honest next step is running it on real
OANDA data (Railway) across enough pairs/days to say anything about whether
the framework carries information, per this repo's "built ≠ works ≠ has
edge" discipline.

---

### 1aq. Asia Fib Atlas engine (2026-08-26) — Level Atlas's sibling for Asia range-extension lines

Requested build: apply Level Atlas's per-touch reference-engine template
(`MD files/REFERENCE_ENGINE_PLAYBOOK.md` — literally extracted from building
Level Atlas + Session Path, "the template for the NEXT analysis, whatever it
turns out to be") to the Asia-range-extension fib lines the "Asia Session Fib
Retracement" Pine indicator draws (`education/range-extension-levels-notes.md`),
instead of forecast-ladder lines. Genuinely a different unit from Level Atlas
per the playbook's §2 rule (don't force a new question into an existing unit):
one row = one touch of one Asia-range extension rung (a fib multiple outside
[0,1] — the 0/0.25/0.5/0.75/1 key levels are the range box itself, deliberately
excluded from the walk), outcome = does price reach the next rung out or
revert to the one just inside it (the SAME `out`/`back`/`neither` shape Level
Atlas uses, chosen deliberately so the two books' outcome tables are directly
comparable and share a report-layer implementation — see below).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Asia Fib Atlas Engine** | `js/asiaFibAtlasEngine.js` | `asiaFibAtlasWalk(packed, {instrument, assetClass})` → `{touches, coverage}`, `asiaFibAtlasLiveToday`. Composes, copies nothing: `sessionRanges.js` (Asia 00:00-06:00 London + Monday ranges, body hi/lo — "closes=acceptance" per the lesson notes), `fibProjection.js` (the SAME 45-level grid the Pine indicator draws — `RUNGS_ABOVE`/`RUNGS_BELOW` are derived FROM `FIB_LEVELS`, never hand-copied), `confluence-core.js:detectConfluencesCore` (the Pine-Script-matching matcher — `clusterMerge:false`, `priceMode:'lowest'`, the session-range-capped tolerance formula — for the Asia-vs-previous-Asia track, never a local re-derivation), `confluenceFeatures.js` (the same VuManChu/VWAP/ADX/structural-confluence/candle-reject/volume-climax/round-number touch pack Level Atlas uses), `rangeLineAnalyser.js:sessionConfluenceLevels`, `forecastLadder`/`forecastSigma` (Level Atlas's own daily-σ fit, reused for `dayVol` and a genuinely new use — `rangeBudgetUsedPct`, how much of today's TYPICAL day-range is already consumed by the time price reaches this rung, from `education/FORECASTER_WALKTHROUGH_NOTES.md` Part 5), `instrumentRegistry.js:pipSize` (one pip source — fixes the gold 1.0-vs-0.1 inconsistency `rangeFibEngine.js`/`asiaRangeEngine.js` still carry, noted in §3 below). **Deliberately NOT reused**: `levelAtlasEngine.js`'s own `sessionRangeSeries`/`sessionVolBucket` measure a UTC 22:00-07:00 "Asia" — a genuinely different window from this engine's London 00:00-06:00 Asia range, so `asiaVolBucket` here is a small fresh implementation, not a copy of the same formula on different-window data (would have silently mislabelled the vol regime against the wrong session). New context beyond Level Atlas's set: `levelFlipState` (fresh touch vs a retest of a line already body-closed-through earlier the same window — causal running close-extreme, no lookahead), `sessionHandoff` (finer than plain session: Asia-close breakout / London morning / London-NY overlap / NY afternoon / NY-late-pre-Asia).

**Confluence, corrected 2026-08-26 (owner review):** the original Pine indicator runs TWO INDEPENDENT confluence checks — Asia(today) vs Asia(previous day), and Monday(this week) vs Monday(the week before) — and never cross-compares Asia fibs to the Monday ladder. The first shipped version of this engine did exactly that (checked today's Asia rungs against the Monday ladder and folded the result into one conflated `confluenceGrade`) — a real mismatch from the source strategy, not a refinement of it, caught by the owner re-reading the two confluence blocks in the original Pine script side by side. Now three clearly separated fields: `confluenceGrade`/`asiaConfPips` (Asia vs previous Asia ONLY — the core track, matches the indicator exactly), `mondayWeekTightestPips`/`mondayWeekZone` (Monday vs the previous Monday — its own, entirely independent weekly track, computed once per reference cycle and constant for every touch in it — "drawn once, persists the week", verified by a dedicated test), and `mondayCrossPips`/`mondayCrossZone` (does this Asia rung land near the Monday ladder anyway — real, kept as an explicit EXPLORATORY field, never blended into the core grade). Per the owner's own framing: the actual pip gap to the nearest matching prior-cycle level ("the pip confluence of X vs previous X") is the real analytical zone — always reported, never threshold-gated — with the categorical grade kept only as a companion view, one dimension among many, never the sole thing a finding gets attributed to.

Monday's ladder itself is still causally gated exactly like the Pine script's own `is_current_monday ? prev_monday : curr_monday` — a Monday's own touches read the PREVIOUS week's completed Monday, never the current, still-forming one (verified by a white-box test against the actual `sessionRanges` helpers, not a behavioural perturbation — perturbing a Monday's own bars turned out to shift which touches occur that day at all, which broke record-matching before the confluence question could even be asked).

24 unit tests (`js/asiaFibAtlasEngine.test.mjs`) — the causality ones matter most here: the far-future-perturbation test that already caught Level Atlas's dayVol tautology also caught THIS engine's own bug during development (`dayOpen` referenced before its `const` declaration executed — a temporal-dead-zone `ReferenceError` silently swallowed by a `try/catch` around the ladder fit, which made `rangeBudgetUsedPct`/`gapSig` silently null/NaN for every row; `node --check` and the type-free JS runtime both missed it, only running the walk and inspecting null-rates caught it). Two of the "both sides / extreme rung" tests needed a deterministically-constructed price path rather than a bigger random fixture, once a naive "symmetric" generator turned out to still be structurally range-bound at any wiggle amplitude (the SHAPE, not the scale, was the problem) — worth remembering for the next engine's tests that need a rare joint condition. | `scripts/run_asia_fib_atlas.mjs` | 🟢 built + unit-tested; **run against real M1 for EURUSD/GBPUSD/USDJPY/GOLD** (2016-03 to 2026-08, local parquet cache, no network needed — see the real-data findings write-up below the table) |
| **Asia Fib Atlas Report** | `js/asiaFibAtlasReport.js` | `buildAsiaFibAtlasBook(touches, {rearmFrac})` → per-`(side, level)` cell × dimension book, IS/OOS split, `extractHeldFindings`, `renderAsiaFibBookText`. Imports `annotateHolds` (THE shared OOS-holding gate, REFERENCE_ENGINE_PLAYBOOK.md §3.2 — n≥30 both halves, ≥3pp effect, same sign) straight from `levelAtlasReport.js`, never a second copy. Also newly exports `splitAt`/`tableFor`/`summarizeAll`/`pctiles` FROM `levelAtlasReport.js` (previously private there) — legitimate reuse, not a coincidental resemblance: both engines' outcome records share the exact `{outcome, fadePips, runPips, pullbackFrac, minsToResolve}` shape by deliberate design specifically so the table-building logic could be shared rather than re-derived. 27 context dimensions (vs Level Atlas's ~25) — see the file's own `DIMENSIONS` export for the full list and labels. | `scripts/run_asia_fib_atlas.mjs` | 🟢 built + validated on real 4-instrument data — 2 findings hold OOS on every instrument (see below) |

**What v1 answers vs defers**, per the playbook's own "don't build report/UI
until the engine's rows earn it" discipline (§4): the engine + OOS-gated
report layer (the actual "does this context factor hold up" analysis the
build was requested for) are done. Explicitly deferred, not forgotten:
routes (async-job `/run`+`/status`+`/card` pattern, mirroring
`levelAtlasRoutes.js`) and any UI/dashboard page — build these once the book's
findings on real data are worth serving live, not before. Also flagged as
natural next layers rather than built now (checked against
`education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md`,
`cross-asset-options-diagnostic-notes.md`, `QUANT_MACRO_LESSONS_1-6.md` during
scoping): macro-calendar proximity (FOMC/CPI/NFP/OpEx — `calendar_events.csv`
exists in-repo but its schema/coverage wasn't verified before this build),
COT positioning (weekly cadence needs its own lag rule, unlike CVOL's daily
one-day lag), and cross-asset regime (yield-spread rate-of-change, VIX
regime). Also flagged (2026-08-26, owner discussion): Monday's own ladder
never gets its OWN touch events here — it's only ever read as context for an
Asia-rung touch (`mondayWeekTightestPips`/`mondayCrossPips`). A genuine
"Monday Fib Atlas" — its own unit, one row per touch of a Monday-range
extension rung, mirroring this engine exactly but for the weekly ladder —
would need a separate walk; not built, noted here so it isn't lost.

**Real-data run (2026-08-26, `scripts/run_asia_fib_atlas.mjs`)** — the local
M1 parquet cache (`VolRangeForecaster/data/m1/`, no network needed) has
2016-03 to 2026-08 for every major pair; ran EURUSD/GBPUSD/USDJPY/GOLD
(~10.5 years, ~2750 sessions, 44k-110k touches each, 60/40 IS/OOS split).
Two findings hold OOS on EVERY ONE of the 4 instruments, same sign, similar
magnitude — genuinely the kind of cross-instrument consistency this
playbook's §3.2 gate exists to surface, not cherry-picked from one pair:
- **`prevOutcomeSameDay = 'out'` → strong continuation lift** (+22pp to +42pp
  vs the cell's own base rate, IS and OOS alike, across nearly every
  side/level cell on every instrument). Same-day-retest persistence — this is
  the SAME mechanism Level Atlas's own single cleanest finding is (a
  session's trending-vs-stuck character persists through a same-day retest),
  now confirmed on a structurally different line family (range-extension fib
  rungs, not forecast-ladder rungs). Directly answers the owner's original
  question ("does price always continue when session range is high") with a
  real, conditional answer: not unconditionally, but conditioned on an
  earlier same-day continuation at this exact rung, yes, consistently.
- **`sessionHandoff = '5·ny-late-preasia'` → strong reversion lift** (-23pp to
  -40pp on the 'out' rate, i.e. touches late in the NY session are much MORE
  likely to revert than continue), also consistent across all 4 instruments.
  Answers the "early in the day" framing from the same original question —
  it's specifically the LATE end of the trading day, heading into the next
  Asia, that shows the reversal bias, not "early" as originally guessed.

Both are IS+OOS-consistent, n≥30+ in nearly every cell, cross-instrument —
worth real trust. This is still descriptive (REFERENCE_ENGINE_PLAYBOOK.md
§3.3 — a reference book, not a signal search: no after-cost gate has been
applied, no position sizing). The honest next step, same as Impulse Range
Engine (§1ap, immediately above): widen to the full 26-pair set and let a
LATER, separate signal-search exercise decide if either finding survives
costs.

**Confluence corrected (2026-08-26, owner review)** — the original Pine
indicator runs Asia-vs-previous-Asia and Monday-vs-previous-Monday as TWO
INDEPENDENT confluence checks; it never cross-compares Asia fibs to the
Monday ladder. The first version of this engine did exactly that cross
comparison and folded it into one conflated `confluenceGrade` — a real
mismatch from the source strategy. Now three separated fields:
`confluenceGrade`/`asiaConfPips` (Asia vs previous Asia only, the core
track), `mondayWeekTightestPips`/`mondayWeekZone` (Monday vs the previous
Monday, its own independent weekly track — constant for every touch in a
reference cycle that runs Tuesday through the following Monday inclusive,
since Monday itself borrows the prior cycle's resolved Monday), and
`mondayCrossPips`/`mondayCrossZone` (does this Asia rung land near the
Monday ladder anyway — kept, explicitly exploratory, never blended into the
core grade). Per the owner's framing, the actual pip gap to the nearest
matching prior-cycle level is always reported (never threshold-gated) — the
real zone worth analysing, not a pre-filtered yes/no. **Real-data check**:
none of the three confluence dimensions produce a single cross-instrument
law the way the two headline findings above do — real, level-specific
context (worth keeping in the analysis exactly as the owner asked), but
scattered by rung and instrument rather than a second universal rule.

**Second round of context added (2026-08-26, "what else, like the
volatility atlas" + "build the full analysis while I sleep")** — five new
dimensions, three of them ready-made bricks not previously wired into this
engine:
- `ivRegime`/`vrp`/`ivSkewDir` — CVOL implied-vol settle, via `cvolLoader.js`,
  same one-day-lag discipline as `levelAtlasEngine.js`. A concrete gap this
  engine had vs. Level Atlas until now.
- `weeklyPivotZone` — `rangeBiasCore.computeWeeklyPivots` (classic
  PP/R1/R2/S1/S2), a genuinely separate structural level family from the fib
  grid, same always-on pip-gap treatment as the confluence tracks.
- `hurstBucket` — `rangeBiasCore.computeHurst`, trailing 80 daily closes.
  Carried the known caveat forward rather than hiding it: this exact
  estimator was dropped from a DIFFERENT context (live entry-conviction
  voting) after saturating near 0.88 on every tested instrument — wired in
  fresh here anyway since a touch-level rung question is a genuinely
  different test of it, not a retry of the same one.
- `asiaShape` — did the Asia session's OWN formation drive cleanly one way or
  chop, using the SAME churn thresholds/labels as the existing post-Asia
  `churn` field but Asia's own close-direction as the reference (no external
  target line exists for Asia's own shape) — a new formula, not a copy.
- `swingRegime` — HTF swing structure (CHoCH/BOS) via
  `rangeBiasCore.featureSwingRegime`, agreeing or conflicting with the
  range-extension direction (above=short, below=long, per the lesson notes'
  own framing). Built on a once-per-instrument 30m resample
  (`barUtils.resamplePacked`, the same brick `confluenceFeatures.
  createHtfContext` uses for its own HTF series) + a bisect lookup per
  touch — recomputing the resample per touch would be O(n²) over a
  multi-year walk.

29 unit tests total (10 new) — the CVOL one mirrors `levelAtlasEngine.
test.mjs`'s own settle-lag test verbatim (same outlier-injection technique);
`asiaShape` gets a dedicated causality test (perturbing bars strictly AFTER
Asia closes must not move it — a different causal boundary than every other
field in this engine, worth its own proof).

**Real-data check on the five new dimensions (2026-08-26, same 4-instrument
run)** — mixed and worth reporting exactly as found, per this repo's own
"report the green honestly and the red honestly" rule:
- **CVOL (`ivRegime`/`vrp`/`ivSkewDir`) — ZERO held findings on ALL 4
  instruments.** A genuine, notable null: CVOL's `vrp` is Level Atlas's own
  standout finding for forecast-line touches (OOS effect usually as strong
  as IS, "worth the most trust of any single finding" per that engine's own
  entry above) — and it holds NOTHING for range-extension touches. Not a
  bug (the settle-lag mechanics are unit-tested and match Level Atlas's own
  proven pattern exactly) — implied vol/skew genuinely doesn't condition
  behaviour at a fib rung the way it does at a forecast-ladder rung.
- **Hurst (`hurstBucket`) — ZERO held findings on ALL 4 instruments.**
  Consistent with (not identical to — this is a different question) its
  prior drop from the live entry-conviction aggregate. Honest confirmation
  rather than a wasted addition, exactly as flagged when it was wired in.
- **`weeklyPivotZone`** — real findings (7-18 per instrument) but the same
  scattered-by-rung, no-universal-direction pattern as the confluence
  tracks above — worth having per-level, not a third cross-instrument law.
- **`asiaShape`** — modest findings (4-9 per instrument), scattered.
- **`swingRegime`** — modest findings (4-11 per instrument); `3·agree`
  recurs across all 4 instruments' held lists more often than the other new
  dimensions, but even within ONE instrument the sign flips by rung (EURUSD
  `below|-3.5` agree → +15.7pp IS; `below|-3` agree → -8.5pp IS) — a real,
  level-specific read, not a fourth universal finding.

Net: the two headline findings from the first real-data run remain the only
cross-instrument laws in the book. Everything added since (confluence
tracks + these five) is real, worth keeping per-level exactly as the owner
asked, but the search for a THIRD universal rule came back empty this
round — reported plainly, not reframed as a near-miss.

**Macro-calendar proximity added (2026-08-26, same session — closes the gap
flagged at every prior mention of "macro-calendar proximity" since the very
first proposal).** `js/calendarLoader.js` reads the real `calendar_events.csv`
(2014-2026, verified against known FOMC 2pm-ET announcement times to confirm
`datetime_raw` is UTC) — schedule only (date/time/currency/impact tier), the
`actual`/`consensus`/`previous` outcome columns are never parsed at all,
structurally. `macroEventHours`/`macroEventBucket`: hours to the nearest
`'Major'`-impact event (FOMC/ECB/BoE decisions, NFP, CPI, etc.) in the
instrument's relevant currencies. Explicitly documented as the ONE field in
this engine allowed to look in both directions from the touch — a scheduled
calendar date is public knowledge in advance (unlike price, and a different
KIND of forward-looking than CVOL's uncertain market-implied read). 4 more
tests (31 total for the engine).

**Real-data check**: 6-19 held findings per instrument, same scattered-by-
rung pattern as every other addition tonight except the original two — not a
third law. Worth flagging as the closest of the new additions to something
recognizable: EURUSD shows `2·same-day` (near a Major event) with a
NEGATIVE lift on 4 of its top 6 held rungs — a same-instrument lean toward
reversion near macro events — but this does not replicate across GBPUSD/
USDJPY/GOLD, which show mixed signs for the same bucket at different rungs.
Real, level-specific context; not evidence of a universal "fade near
events" rule.

**26-pair widen (2026-08-27, `scripts/run_asia_fib_atlas.mjs --headline`)** —
the follow-up the house rule calls for ("prefer validating what exists over
adding surface"): do the two cross-instrument headline findings above
generalize past the original 4 USD-major pairs, or are they an artifact of
that specific set? Ran the full local 26-pair M1 universe (every FX cross the
parquet cache covers + gold, `ALL_26_PAIRS` in the script) through the same
OOS-holding gate, one `(dimKey, bucket)` target per finding, and rolled the
per-pair held-cell counts up into a single cross-pair verdict (script prints
this rollup itself; also hand-verified by re-aggregating all 26 per-pair
result lines independently, since the run had to be resumed pair-by-pair
across three sandbox container restarts mid-run — matched the script's own
rollup exactly). Result: **both findings generalize with no exceptions**:
- **`prevOutcomeSameDay = 'out'` (same-day retest persistence)** — held on
  **26/26 pairs**, **26/26 same-sign** (positive, i.e. continuation lift, on
  every single one). Avg effect across held-pairs: **+29.4pp IS / +29.2pp
  OOS** — actually slightly stronger on average than the original 4-pair
  read, not weaker. Held-cell fraction ranges widely by pair (12/28 on
  AUDNZD to 38/38 on GBPCHF) but every pair clears the bar on at least a
  third of its cells, none at zero.
- **`sessionHandoff = '5·ny-late-preasia'` (late-NY reversal)** — held on
  **26/26 pairs**, **26/26 same-sign** (negative, i.e. reversion, on every
  one). Avg effect across held-pairs: **-19.1pp IS / -21.2pp OOS**, in line
  with the original 4-pair magnitude.

This is the strongest cross-instrument result in this engine's book so far —
not "holds on majors," holds on every pair the local cache has, USD-quoted or
not (EUR/GBP/AUD crosses included), same sign, comparable magnitude. Still
descriptive per the playbook's own §3.3 discipline (a reference book, not a
signal search — no after-cost gate, no position sizing, no live wiring) — the
widen raises confidence the *pattern* is real and general, it does not by
itself make either finding tradeable. `node --check` passed before the run;
`--headline` mode adds no engine changes, pure validation tooling
(`scripts/run_asia_fib_atlas.mjs` only). PR #1345.

**Live page built (2026-08-27) — `asia-fib-atlas-live.html`.** Per the owner's
ask ("can we build it into a page on railway where i can see the info on a
live candle chart"): the per-level, per-situational confidence read
discovered in the widen check (§ above — `prevOutcomeSameDay`/`sessionHandoff`
dominate ~73% of levels' held findings) is now servable live, mirroring Level
Atlas's own async-job + R2-persist + fast-live-cache architecture exactly —
no new pattern invented:

| Brick | File | Owns | Status |
|---|---|---|---|
| **Live ladder** | `js/asiaFibAtlasEngine.js` `asiaFibAtlasLiveLadder(packed, opts)` | Today's FULL fib grid (all 40 rungs, touched or not — `RUNGS_ABOVE`/`RUNGS_BELOW`, same `asia.low+asia.range*level` formula the walk itself uses), each carrying `prevOutcomeSameDay` (derived from today's touches-so-far via `asiaFibAtlasLiveToday`, last RESOLVED outcome per rung wins) and the CURRENT `sessionHandoff` (now `export`ed — was module-private). Deliberately does NOT replicate this engine's other ~20 touch-time-only fields (candleReject, wtState, macroEventBucket, ...) for untouched rungs — see the function's own header for why building the live score around exactly the two dimensions the widen check proved general is the honest v1 scope, not a shortcut. | 🟢 built + tested |
| **Generalized confidence matcher** | `js/levelAtlasReport.js` `matchLiveContext(book, liveTouch, {keyField, dimLabels})` | Extended (backward-compatibly — new args default to the OLD `rung`/module-private-`DIM_LABEL` behaviour, every existing Level Atlas call site untouched) so Asia Fib Atlas's `level`-keyed book reuses the SAME base-rate + held-dimension + supports/challenges logic instead of a second copy. This is the reuse the two engines' identical `{outcome, fadePips, runPips, ...}` record shape was deliberately built for (see the original §1aq entry). | 🟢 built + tested (25/25 `levelAtlasReport.test.mjs`, incl. a new test proving the `level`-keyed reuse) |
| **Routes** | `js/asiaFibAtlasRoutes.js` (new) | `mountAsiaFibAtlasRoutes(app,express)` — `/run`+`/status` (async job, walks full history + gap-fills to now via OANDA, builds the book, persists to R2), `/live` (last stored snapshot), `/fastlive` (warm 180-day bounded-window cache, incrementally topped up, recomputes only on a new M1 bar — same `boundPacked`/`getFastLive` shape as `levelAtlasRoutes.js`, not a copy-paste: re-derived because the ladder/scoring types differ), `/book`, `/book/:instrument/text`. `scoreLadder(book, ladder)` is the one place that flattens `matchLiveContext`'s match object back onto each rung's own price/distance/touchedToday fields (a real bug caught in manual browser testing before commit: the match object doesn't carry the original rung fields at its top level, only nested under `.liveTouch` — every consumer needs the merge, so it's one function, not copy-pasted at each call site). | 🟢 built + manually verified against real M1 (local server, real EURUSD run) |
| **Page** | `asia-fib-atlas-live.html` (new) | Candlestick chart via `js/levelChart.js` (reused, not re-wired — new `KIND_STYLE` entries added: `fibOutStrong/fibOutWeak/fibBackStrong/fibBackWeak/fibNeutral/asiaBoxEdge`, colour keyed off `lean`+`sameSignOOS`) + a side-panel ladder table + per-rung detail (supports/challenges/other-held-reads). Candles from the existing `/api/pattern-lab/live-candles/:pair` route (reused, not a new candle endpoint). Polls `/api/asia-fib-atlas/fastlive/:instrument` every 15s. | 🟢 built; verified in headless Chromium with a `LightweightCharts` stub (the CDN script itself can't load in this sandbox — same Railway-only constraint as every other `levelChart.js` page, see CLAUDE.md's OANDA note) — page logic (data fetch, ladder render, status line) confirmed working end-to-end against the real local server + real EURUSD data; the CDN chart itself needs a Railway check |

**Scope, stated plainly**: this live score combines a rung's own OOS base
rate with whichever of the two proven-general dimensions currently applies —
a simple additive read presented per-dimension (supports/challenges), NOT a
fitted/backtested joint model. No after-cost gate, no position sizing, no
claim that acting on it is profitable — this is the reference book made
live-readable, same discipline as everything else in this section.

Nightly refresh: added as a third leg of the existing `reference-engine-
rebuild` scheduler in `server.js` (00:30 London, alongside Level Atlas +
Session Path + Session Handoff) — `REFERENCE_ENGINE_PAIRS` filtered to
FX+gold (Asia Fib Atlas's own scope, matches the Pine indicator it mirrors),
not a second hand-maintained pair list. Registered for discoverability per
CLAUDE.md's house convention: `js/siteApiMap.js` (`#smBody` FX-BT group + the
`am-row` API listing) + `MD files/SITE_MAP.md` + `js/commandHub.js`'s
`chubDDvol` menu — NOT `hub.html`.

**Vote-margin trade backtest (2026-08-27) — `js/asiaFibAtlasVoteReview.js` +
`scripts/run_asia_fib_atlas_vote_backtest.mjs`.** The owner's own ask: "wait
for asia to complete, pull the range lines like the indicator, grab the line
with confluence, when price hits trade what the atlas says — is there a
profitable trade?" Mirrors `js/levelAtlasVoteReview.js`'s already-validated
barrier-priced backtest (real fixed target/stop from the touch's own rung
distances, real spread cost, true walk-forward IS/OOS split) rather than
inventing a new fill mechanism — `reorientExcursion`/`applyConcurrencyCap`/
`buildPortfolioDailySeries`/`inverseVolWeights`/`riskAdjustTrades`/
`applyPortfolioHeatCap`/`applyDrawdownThrottle` are imported straight from
there, unchanged (engine-agnostic — they operate on an already-built trade
list's generic shape). What's genuinely adapted, not reused: Level Atlas's
`rung`/`level`/`open` fields mean something DIFFERENT on an Asia Fib Atlas
touch (`level` is the fib multiplier there, the raw price here is `price`) —
blindly reusing Level Atlas's own `buildBarrierTrades` would have silently
priced every trade off the fib multiplier instead of the real price; this
module reads the right field and re-outputs Level Atlas's OWN field names so
every downstream generic function still works unchanged (see the module's
own header for the full reasoning, and its test file
`js/asiaFibAtlasVoteReview.test.mjs` for a dedicated regression test proving
the pnl magnitude is sane, not 4-5 orders of magnitude off).

**The vote is deliberately restricted to `VOTE_DIMS = {prevOutcomeSameDay,
sessionHandoff}`** — the two dimensions the 26-pair widen check found
generalize almost everywhere — NOT all ~30 context dimensions the way Level
Atlas's own (separately validated) vote uses. Voting on every dimension here
would be exactly the "found a few winners among 70 slices" multiple-testing
trap this project's own house rules warn against.

**Real-data check (2026-08-27, EURUSD/GBPUSD/USDJPY/GOLD, OOS since each
pair's own 60/40 split date, real spread cost).** The RAW numbers looked
absurd (Sharpe 5-22, near-zero drawdown) — and per this repo's own
Bug-Hunting Rules ("assume code failure first" applies just as hard to a
result that's too GOOD as one that's null), that was investigated before
being trusted, not reported. Diagnosis: `prevOutcomeSameDay` is *defined* by
"another touch already happened today", so trades using it cluster heavily
on trending days — 87-97% of trading days with any signal had 2+ trades
firing. Treating those as independent Sharpe observations is the exact same
correlated-trade inflation `levelAtlasVoteReview`'s own history already
diagnosed (346/622 EURUSD days, roughly halving that Sharpe) — just far more
severe here, because this vote's strongest dimension is intrinsically more
same-day-clustering-prone than Level Atlas's broader dimension set.
Re-checked with a realistic 1-concurrent-position cap
(`applyConcurrencyCap`, reused unchanged):

| Pair | margin≥1 (either dim) capped Sharpe | **margin=2 (both agree) capped Sharpe** | margin=2 PF | margin=2 maxDD |
|---|---|---|---|---|
| EURUSD | 1.15 ± 0.48 | **3.88 ± 0.48** | 1.66 | -0.58% |
| GBPUSD | **-1.57 ± 0.46** (negative) | **5.16 ± 0.47** | 1.69 | -0.87% |
| USDJPY | 3.18 ± 0.49 | **4.77 ± 0.50** | 2.20 | -0.72% |
| GOLD | 1.12 ± 0.47 | **3.14 ± 0.48** | 2.07 | -1.62% |

Two clean findings, one green and one red, reported plainly per this
project's own working agreement:
- **Green: requiring BOTH proven dimensions to agree (margin=2) is real and
  cross-instrument-consistent.** All 4 pairs positive, all comfortably
  outside their own Sharpe error bar, PF 1.66-2.20, drawdowns all under 2%,
  n=551-2362 OOS trades per pair. Still a single-position-at-a-time,
  single-instrument read (not yet portfolio-combined via
  `buildPortfolioDailySeries`/`inverseVolWeights`, not yet forward-tested
  live) — "real and worth building on", not "done, tradeable as-is".
- **Red: "either dimension alone" (margin≥1) is NOT tradeable.** Negative on
  GBPUSD (-1.57 Sharpe, -52% maxDD once capped) and marginal-to-noisy
  elsewhere. The raw uncapped numbers for this exact bucket looked BEST of
  all (Sharpe up to 21.9) purely from the correlated-trade artifact — the
  single clearest illustration in this project's own history of why the
  concurrency cap step is mandatory before trusting any vote-backtest Sharpe.
- **Red: the owner's own "grab the line with confluence" hypothesis did NOT
  add value.** Gating margin=2 entries to a tight Asia-vs-previous-Asia zone
  (≤2 pips, `asiaConfPips`) made the Sharpe WORSE on every single pair
  (EURUSD 3.88→2.58, GBPUSD 5.16→3.29, USDJPY 4.77→2.13, GOLD 3.14→2.64)
  while shrinking the sample — confluence is real, level-specific context
  (per the earlier §1aq real-data checks above) but isn't where THIS
  particular edge lives; vote margin is what mattered, not zone tightness.

`js/asiaFibAtlasVoteReview.js`: 🟢 built + unit-tested (14 assertions,
`js/asiaFibAtlasVoteReview.test.mjs`) + validated on real 4-instrument data.

**26-pair widen + Monday-ladder sibling (2026-08-27/28) — `js/mondayFibAtlasEngine.js`
+ `js/mondayFibAtlasRoutes.js` + `scripts/backfill_fib_atlas_vote_trades.mjs` +
`asia-fib-atlas-vote-backtest.html`.** The owner's own follow-up ask: widen the
4-pair check to all 26 locally-cached pairs, add the Monday ladder's own
version of the same backtest (it had only ever existed as *context* on Asia
touches — `mondayCrossPips`/`mondayWeekTightestPips` — never its own walked
unit), and build a trade-review page (real M1 candles with entry/target/stop
markers per trade, full tearsheet, CSV export) so results can be inspected
trade-by-trade instead of just as summary stats — modeled directly on
`level-atlas-vote-backtest.html`.

**Monday engine, what's genuinely new vs. reused:** the weekly walk window
(Tuesday 00:00 → the following Monday inclusive, re-derived from Asia Fib
Atlas's own already-established `mondayForDay`/`isMonday`-redirect logic, not
guessed) and the barrier-resolution mechanics (mirrored from Asia's own
proven walk, not imported — the two engines' touches differ in shape:
Monday's is deliberately leaner, only the vote-relevant fields, not Asia's
~30-dimension richness). Everything downstream is pure reuse: `buildMondayRanges`,
`RUNGS_ABOVE`/`RUNGS_BELOW`/`SIDES`/`sessionOf`/`sessionHandoffPhase`/`pipSize`
from the existing bricks, and — the deliberate Lego win — the walk emits its
`prevOutcomeSameDay` field with SAME-WEEK (not same-day) carry-forward
semantics specifically so `js/asiaFibAtlasVoteReview.js`'s existing vote/price/
barrier logic runs on Monday touches completely unmodified: **zero new
vote-review code**, only a new record producer. `js/mondayFibAtlasEngine.test.mjs`:
🟢 8/8 assertions (outcome sanity, required-field contract, rung-price formula,
walk-window boundary, same-week-only `prevOutcomeSameDay` carry — explicitly
proven not to leak across weeks, `sessionHandoff` consistency, no-lookahead via
truncation, graceful degradation on thin history).

A real bug was caught before trusting the widen: `js/asiaFibAtlasRoutes.js`'s
`runOne` built and persisted the vote-margin summary to R2 correctly but
silently dropped it from its own return value, so a smoke test's console
output read "margin=2: n=0" for a pair whose R2 blob actually held 1,812
real trades — assume-code-failure-first, verified against the R2 blob
directly before either trusting or discarding the result, then fixed
(`voteSummaryByMargin` now surfaced on the return value too). Caught before
it could have been mistaken for a real degenerate result.

**Real-data check, all 26 pairs, both ladders (2026-08-28), concurrency-capped
(`applyConcurrencyCap({maxConcurrent:1})`, same correction the 4-pair check
required — raw uncapped Sharpe here again runs 5-12+ from the same same-day-
clustering artifact, not trusted on its own).** margin=2 (both dimensions
agree) only, OOS since each pair's own split date, real spread cost:

| | n pairs | capped Sharpe: min | median | max | negative pairs |
|---|---|---|---|---|---|
| **Asia** | 26 | -6.02 | 4.18 | 5.92 | **GBPCAD** (-6.02, 50.5% win, PF 0.47, maxDD -27.3%), **GBPNZD** (-1.33, 62.2% win, PF 0.86) |
| **Monday** | 26 | 1.24 | 3.14 | 5.66 | none |

Total OOS trades: ~63.5k raw (Asia, before capping) / ~10.1k raw (Monday) across
the 26 pairs combined — Monday's sample is intrinsically smaller (weekly cycles
vs. daily Asia sessions, so roughly 1/5th the touch density over the same history).

The EURUSD/GBPUSD/USDJPY/GOLD numbers reproduced almost exactly against the
original 4-pair check (capped Sharpe 3.876/5.162/4.768/3.141 here vs.
3.88/5.16/4.77/3.14 there) — a clean pipeline-consistency check, not a new
finding, but worth recording as one: the same code, re-run on a slightly later
data snapshot, reproduces.

Three findings, reported plainly:
- **Green: Monday margin=2 is positive on all 26 pairs, no exceptions** —
  narrower Sharpe range (1.24-5.66) than Asia's, smaller per-pair samples
  (47-698 OOS trades vs. Asia's 551-3,297), but zero losers at 26-pair scale.
  The weaker end (GBPAUD 1.24, AUDNZD ~1.25-equivalent) is thin enough
  (n<200) that it shouldn't be read as strongly proven per-pair, but the
  cross-pair sign consistency itself — 26/26 positive — is the real signal.
- **Red: Asia margin=2 is NOT universally positive at 26-pair scale.**
  GBPCAD is an outright loser (Sharpe -6.02, win rate barely above a coin
  flip, PF 0.47, a 27% max drawdown once capped — nowhere near the 4-pair
  check's cleanest cells) and GBPNZD is marginal-negative (-1.33, PF 0.86).
  Both are GBP crosses with the thinnest liquidity/widest-typical-range
  profile of the 26 — consistent with (not proof of) the idea that this
  edge degrades where realistic spread cost eats more of a narrower true
  edge, but that's a hypothesis for a follow-up check, not a demonstrated
  cause here. The honest read: **"margin=2 works" was true for the 4 pairs
  originally checked but is not a universal, instrument-agnostic property of
  this vote rule** — 24/26 Asia pairs are still solidly positive (median
  4.18), but per-pair validation before trading a new pair is not optional.
- **Neutral: the widen didn't change the earlier grid conclusions it retested.**
  margin≥1 (either dimension alone) and the confluence-gating hypothesis were
  not re-swept across all 26 here (out of scope for this pass, which targeted
  margin=2 + the Monday build specifically) — those findings stand as
  reported in the original 4-pair check above, not re-validated at 26-pair
  scale.

Still a single-position-at-a-time, single-instrument, single-ladder read —
**not yet** portfolio-combined across Asia+Monday or across the 26 pairs
(`buildPortfolioDailySeries`/`inverseVolWeights`, reused unchanged elsewhere,
would need a cross-pair concurrency budget decision first), and not yet
forward-tested live. "Real and worth building on for 24/26 Asia pairs and all
26 Monday pairs" — not "done, tradeable as-is everywhere."

`js/mondayFibAtlasEngine.js`/`js/mondayFibAtlasRoutes.js`: 🟢 built + unit-tested
+ validated on real 26-pair data. `asia-fib-atlas-vote-backtest.html`: 🟢 built,
Playwright-verified against the real local server + full 26-pair R2 data (both
ladders load, KPIs/trade table/CSV export all confirmed against live data — the
underlying `LightweightCharts`/`Chart.js` CDN scripts themselves are blocked in
this sandbox, same pre-existing constraint as every other chart page here, see
CLAUDE.md's live-deployment note; page logic itself needs no further check).

**Portfolio combine + quant-diagnostics enrichment (2026-08-28).** Owner's own
follow-up: match this engine's backtest to the depth of `regime-backtest.html`/
`vol-backtest-v2.html`/`level-atlas-vote-portfolio.html` — full quant-level
stats, non-compounding results, and both an individual (per-pair, chart-based
trade review — already existed) and collective (multi-pair combined) view.

- **`js/fibAtlasVotePortfolio.js`** (new) — `buildFibAtlasVotePortfolio(opts)`,
  a fresh extraction of `js/levelAtlasRoutes.js`'s own `/api/level-atlas/
  vote-portfolio` route body (same computation, same query-param contract,
  same response shape) generalized behind a `loadPairVoteTrades(pair)`
  callback so it's shared by BOTH `js/asiaFibAtlasRoutes.js`'s and
  `js/mondayFibAtlasRoutes.js`'s new `/vote-portfolio` routes — one core, two
  R2 prefixes. Reuses `levelAtlasVoteReview.js`'s portfolio bricks
  (`applyConcurrencyCap`, `buildPortfolioDailySeries`, `inverseVolWeights`,
  `riskAdjustTrades`, `applyPortfolioHeatCap`, `applyDrawdownThrottle`)
  completely unchanged — no new portfolio math, only new wiring. Deliberately
  does NOT include `applyFadeStopTightening` (a separately OOS-validated
  Level-Atlas-specific feature with no equivalent study run for this engine —
  silently assuming it transfers would be exactly the kind of unvalidated
  claim this project's house rules warn against). This is an intentional
  **duplication, not a migration** — `levelAtlasRoutes.js`'s own route is
  large, working, and carries its own OOS-validated correlated-risk warnings;
  migrating it to call this shared function too is flagged here as a real
  candidate for later, judged riskier to do in the same change that adds a
  new consumer than to prove the extraction against Asia+Monday first.
- **`asia-fib-atlas-vote-portfolio.html`** (new) — `level-atlas-vote-
  portfolio.html`'s sibling: same KPI-grid layout (shared/compounded/
  non-compounded/levered split, non-compounding stated and computed
  explicitly per the owner's ask), equity curve with log-scale toggle,
  heat-cap and drawdown-throttle real A/B comparison cards, per-pair
  breakdown table, Performance Summary report, and the same 3-schema CSV
  export (MAE flipped negative at export time). Adds the Asia/Monday toggle;
  all 26 pairs selectable, unlike Level Atlas's curated 21/26 — **no
  correlated-risk leave-one-out study has been run for this engine**, so the
  warning card says that plainly instead of implying a validated exclusion
  list exists. Verified live: heat cap/throttle A/B, Asia↔Monday toggle,
  CSV export (6,046 real rows, MAE correctly negative), Performance Summary
  overlay — all against real 26-pair R2 data.
- **`asia-fib-atlas-vote-backtest.html`** enriched with `js/backtestStats.js`'s
  bootstrap (1,000× resample-with-replacement → CI on total return/Sharpe,
  P(profitable)) and Monte Carlo (1,000× reorder → shuffled-order worst-case
  drawdown percentiles) battery — the "outcome uncertainty within this
  sample" diagnostics `regime-backtest.html`/`vol-backtest-v2.html` already
  had and this page didn't. Explicitly labeled as NOT a substitute for the
  walk-forward OOS split already applied above (per this project's own
  house rule: resampling a strategy's own return distribution says nothing
  about whether the edge generalizes to unseen data) — both describe
  uncertainty within the realized sample, not OOS generalization.

`js/fibAtlasVotePortfolio.js`: 🟢 built, smoke-tested against real R2 data
(4-pair Asia portfolio reproduced the exact per-pair numbers the CLI script
computed independently) and via the live `/vote-portfolio` routes (heat cap:
44/5,148 trades skipped at 2% cap; throttle: 163/1,021 days throttled at
-8%/-2%/0.5× — both real, not asserted). `asia-fib-atlas-vote-portfolio.html`
and the `backtestStats()` enrichment: 🟢 built + Playwright-verified against
the real local server + full 26-pair R2 data.

Deferred, not forgotten: the correlated-risk leave-one-out study for this
engine (Level Atlas's own took real analysis, `scripts/leave_one_out_
portfolio.mjs`, before it could offer a validated "select recommended"
exclusion set — nothing equivalent has been run here yet), forward-test
live, and re-sweep margin≥1/confluence-gating at the full 26-pair scale.

**2026-08-29 — honest Deflated Sharpe Ratio finding (owner flagged the
Sharpe/CAGR numbers as implausibly high — correctly).** Ran
`deflatedSharpe` (`js/backtestStats.js`, already built, never previously
applied to this vote-margin system) against the real 26-pair × 2-ladder ×
{margin≥1, margin≥2} grid (104 trials with usable daily-return series,
pulled from real R2 data, concurrency-capped the same way the live pages
do). Result: the headline EURUSD Asia margin≥2 config's own per-observation
Sharpe (0.373) does **not** clear the expected best-of-104-by-chance bar
(0.931) — `dsr: 0`. Even the single best trial across all 104 (Monday
NZDUSD margin≥2, per-obs Sharpe 1.146) only reaches `dsr: 0.795`, short of
the ~0.95 usually wanted before trusting a selected-after-search Sharpe.
This is a **lower bound** on the true correction, not the full picture —
the vote rule itself (`prevOutcomeSameDay` + `sessionHandoff`) was
originally selected from a ~30-context-dimension × 26-pair search earlier
in the project with no trial-Sharpe log kept, so the real search space is
larger and unlogged; 104 is only the grid this check could reconstruct.
Ruled out simpler explanations first and confirmed they're NOT the cause:
`priceBarrierTrade`'s fade/follow PnL math (no sign error), `PAIR_COST_PCT`
(real non-zero cost, e.g. EURUSD ≈0.87 pips round-trip, correctly
subtracted once), and same-day trade clustering (the single biggest burst
day, EURUSD 2025-04-02 at 27 trades, was 15W/12L — genuinely mixed, not a
one-directional sweep masquerading as many independent trades). Separately,
Asia Fib Atlas trades far more densely than Level Atlas's own EURUSD
(median duration 13min/~3.25 trades-per-day vs Level Atlas's 116min/~1.9
trades-per-day) — a real structural contributor to the raw Sharpe gap
between the two engines, on top of the multiple-testing risk above. Net:
**the high Sharpe/CAGR numbers on this system's pages are not yet shown to
survive selection bias** — treat them as an unvalidated, likely-optimistic
upper bound until a proper walk-forward OOS split or a fuller trial log
says otherwise, not as a bug to fix or a result to feature.

**Same date — Asia+Monday "combine" portfolio option**
(`js/fibAtlasVotePortfolio.js`, `js/asiaFibAtlasRoutes.js`,
`asia-fib-atlas-vote-portfolio.html`), built to let the owner see the
concurrency impact directly rather than guess at it. `buildFibAtlasVote
Portfolio`'s per-constituent grouping key was generalized from always
`stored.instrument` to an optional `stored.groupKey` override (defaults
to the old behavior — fully backward compatible, no change for either
single-ladder route) — so a caller can hand it "EURUSD (Asia)" and "EURUSD
(Monday)" as two separate constituents of ONE portfolio, sharing the same
concurrency cap / heat cap / weighting machinery every other constituent
already goes through, with zero new combination math (Lego Principle
compliant: this is a parameterization of an existing brick, not a new
one). New route `GET /api/asia-fib-atlas/vote-portfolio-combined?pairs=
...&ladders=asia,monday` builds the constituent list as `pair|ladder`
keys and tags each loaded blob with `groupKey`/`ladder` before handing it
to the shared builder. New "Both (combined)" toggle added alongside the
existing Asia/Monday toggle on `asia-fib-atlas-vote-portfolio.html`.
Verified live (real server, real R2 data, Playwright + curl): 5 default
pairs → 10 per-pair rows (both ladders per pair), CSV export correctly
labels all 10 constituent strings. **The combined Sharpe (9.42) is HIGHER
than either ladder alone** — this reinforces the DSR finding above rather
than allaying it (stacking more of a same-family, densely-trading,
search-selected rule does not look like diversification benefit). A
direct heat-cap A/B (2-pair test, `maxHeatPct=1` forcing a shared 1%
budget across both pairs AND both ladders) barely moved the number (6.15
uncapped → 6.11 capped, 316/4,179 trades skipped) — cross-ladder/cross-pair
concurrency stacking is **not** the dominant driver of the inflated
Sharpe; the multiple-testing/search-selection explanation above is.
🟢 built, `node --check` clean, live-verified; 🟡 not yet a validated
result — same OOS/DSR caveat as the rest of this section applies with
extra force here since combining only compounds the underlying
selection-bias risk.

**2026-08-29 — DF-01 education-lesson review, and a structural mechanism
found behind the DSR=0 finding above.** Owner asked for the Fib Atlas
backtest to be checked against `education/data-foundations-notes.md`'s
data-governance principles (look-ahead, survivorship, revision blindspot,
provenance). Findings, and what came of each:

- **Look-ahead — the vote-decision layer (`js/asiaFibAtlasVoteReview.js`)
  had no dedicated test of its own**, unlike the engine/walk layer
  (`asiaFibAtlasEngine.js`'s NO-LOOKAHEAD CONTRACT + truncation tests). Added
  three tests to `js/asiaFibAtlasVoteReview.test.mjs` (T15-T17, 🟢 17/17
  passing): `voteDecision`'s direction is driven by the book's IS `deltaOut`
  only, never the OOS half (T15); `buildBarrierTrades` excludes any touch
  dated before `book.splitDate`, `>=` not `>` (T17). **T16 surfaced something
  bigger than a unit-test gap**: `matchLiveContext`'s `holdsOOS` gate (from
  `levelAtlasReport.js`'s `annotateHolds`, shared by every reference-engine
  book including this one) only lets a dimension bucket vote if its IS-period
  effect had the SAME SIGN in the OOS half of the SAME split this module then
  trades against (`annotateHolds`: `Math.sign(dIS) === Math.sign(dOOS)`).
  That means the dimension-selection step (which of ~30 context dimensions,
  narrowed to `prevOutcomeSameDay`/`sessionHandoff` by the §1aq widen check)
  already looked at the OOS labels before the "OOS backtest" is run and
  reported on those same labels — the 40% holdout was never a clean,
  never-touched holdout in the first place. This isn't a bug in
  `asiaFibAtlasVoteReview.js` (the vote correctly does what the book tells
  it) and isn't newly introduced by T16 — T16 documents an existing,
  deliberate design property so it can't silently drift. It is, however, a
  concrete mechanism explaining WHY the Deflated Sharpe check above found
  DSR=0: the "OOS" trades were partly selected using their own outcomes.
  **Not fixed here** — a real fix needs a genuinely held-out third slice (or
  walk-forward re-validation across several splits), which is a bigger,
  separately-scoped follow-up, not a test addition.
- **Provenance — OANDA is a single retail broker's mid-price stream, not a
  consolidated tape**, and nothing in the fetch code (`volBacktestEngine.js`,
  `tradeLabDataSource.js`, `volBacktestM1Engine.js`) acknowledges that. Built
  `analysis/oanda_provenance_check.mjs`: samples real recorded touches for a
  pair/ladder from R2 (the OANDA side, no re-fetch needed) and checks, minute
  by minute, whether a second vendor (Twelve Data) confirms the same
  touch/no-touch call and how far its price sits from OANDA's at that moment
  — a direct test of whether broker-specific quote noise is a live risk for
  a system trading tight intraday stops (median hold ~13min), not just a
  documentation gap. **Built and `node --check` clean, but UNRUN** — this
  sandbox has no `TWELVE_KEY` and blocks outbound HTTPS to both
  `api.twelvedata.com` and OANDA (confirmed via direct `curl`, both return
  connection failures), so the live comparison needs to run on Railway (or
  anywhere both R2 and Twelve Data are reachable). 🟡 no result exists yet —
  do not treat this caveat as resolved OR as confirmed-serious until it's
  actually run.

**2026-08-29 — Fib Atlas leave-one-out study (stage 1: Asia only), and a
red flag, not a result.** Owner asked for a "select strongest pairs" feature
like Level Atlas's own (`level-atlas-vote-portfolio.html`'s "Select
recommended" button). Confirmed first what that button actually is: NOT a
live computation — a hardcoded 10-pair exclusion `Set`
(`level-atlas-vote-portfolio.html:275`), the transcribed output of a manual,
three-stage process (`scripts/leave_one_out_portfolio.mjs`'s greedy
forward-elimination on maxDD → manual transcription → a SEPARATE OOS
validation pass, `scripts/oos_validate_pair_selection.mjs`, before the
button shipped). Built `analysis/fib_atlas_leave_one_out.mjs`, the Asia/
Monday/combined-ladder sibling — same shared bricks
(`applyConcurrencyCap`/`riskAdjustTrades`/`buildPortfolioDailySeries`/
`portfolioStats`), same method, reading from R2 instead of a local dump,
`LADDER=asia|monday|combined` env var (combined tags each pair's two
ladders as separate constituents, same `groupKey` convention as
`/vote-portfolio-combined`).

**Ran stage 1 (Asia, all 26 pairs, minMargin≥2, no heat cap — R2-only, runs
fine in this sandbox).** Baseline (all 26, equal-weight, COMPOUNDED —
this script mirrors Level Atlas's own convention of not applying
`withNonCompoundedDD`, so these are internal ranking diagnostics, not the
headline non-compounded numbers the live page shows): Sharpe 2.78, maxDD
**-99.43%**, CAGR 1905%. Greedy removal of 20/26 pairs (keeping only
USDJPY/AUDUSD/NZDUSD/USDCHF/EURJPY/AUDJPY) lifts Sharpe to **11.02** and
cuts maxDD to -8.5%. **This is not being reported as a usable "strongest
pairs" set.** Two things it actually shows: (1) the -99% uncapped baseline
maxDD confirms unconstrained 26-pair stacking is a real correlated-risk
problem here, same as it was for Level Atlas (motivating the same kind of
study); (2) Sharpe climbing from 2.78 to 11+ by handpicking 6 of 26 pairs,
run on a trade series ALREADY shown not to survive Deflated-Sharpe
correction (DSR=0, this section's 2026-08-29 entry above) and already shown
to have OOS-label leakage in its own dimension selection (`holdsOOS`
finding, same date) — is exactly the shape of further overfitting, not
evidence of 6 genuinely stronger pairs. Level Atlas's own equivalent step
was independently OOS-validated before it was trusted; this one has not
been, and given the two compounding selection-bias findings already on
record for this system, that validation step matters more here than it did
there. **Not proceeding to Monday/combined runs or any UI button without
that validation** — flagged to the owner rather than assumed.

**2026-08-29 — Fib Atlas SL-tightening study, replicating Level Atlas's own
9-step methodology (`analysis/mae_timing_study.mjs` /
`analysis/sl_tightening_backtest.mjs`) on the Asia ladder.** Owner asked for
the same rigor applied to Fib Atlas's own stop/target logic. Built two
scripts, reusing every brick unchanged (zero new backtest math):
`analysis/fib_atlas_mae_timing_study.mjs` (checkpoint-based MAE-timing —
same M1-walk method, geometry algebra verified against
`asiaFibAtlasEngine.js`'s own `fadePips`/`runPips`/`outcome` construction
before writing it, checkpoints shortened to 2–120min to match this system's
much faster resolution than Level Atlas's) and
`analysis/fib_atlas_sl_tightening_backtest.mjs` (`priceAtTighterStop` /
`applyPortfolioHeatCap` / `portfolioStats` / `backtestStats`, all imported
unchanged from `levelAtlasVoteReview.js`/`backtestStats.js` — Fib Atlas's
trade shape already carries every field they expect). Also reused
`js/intradayDrawdown.js`'s `intradayMtmDrawdown`/`tradeTimingStats`
(existing, tested Tier-1 bricks, not written for this) for the
intraday/concurrency-aware drawdown step — zero adaptation needed, Fib
Atlas's `time`/`resolveTime`/`pnlPct`/`maePct` fields map directly.

**Real, self-caught bug worth recording**: the first draft's Sharpe-CI line
paired `portfolioStats`' daily-aggregated Sharpe (this codebase's own
"honest" concurrency-aware figure) with a confidence interval bootstrapped
from `backtestStats`' PER-TRADE-annualized Sharpe — two different bases
under one label. Fixed before reporting: the CI section now prints
`backtestStats`' own point estimate next to its own CI, explicitly labeled
as a different basis from the daily Sharpe in the headline tables. Exactly
the kind of "sophisticated-looking noise with false precision" this
project's own house rules and the DF-01 lesson both warn about — caught by
re-reading the output, not by assumption.

**Ran stage 1 (Asia, 26 pairs, minMargin≥2, fresh 70/30 IS/OOS split
`2025-02-20`, uncapped/compounded — same "internal ranking diagnostic, not
the headline number" caveat as the leave-one-out study above applies to
every CAGR/maxDD figure below):**
- IS fraction grid has a real interior peak (not monotonic) — Sharpe rises
  from baseline 3.69 to a peak of 10.8 at frac=0.9, then falls through
  frac=0.75 (8.64), 0.6 (5.23), 0.5 (2.33), and goes NEGATIVE at 0.4/0.25 —
  a genuine trade-off curve, not a "wider stop always wins" or "tighter
  stop always wins" artifact.
- Pre-stated rule (tightest fraction with IS Sharpe ≥90% of baseline AND
  lower maxDD, frozen before looking at OOS) chose **frac=0.6**.
- **OOS: baseline collapsed (Sharpe 3.69 IS → 0.94 OOS, a ~75% drop —
  another data point for this system's already-flagged overfitting risk),
  while frac=0.6 barely moved (5.23 IS → 4.96 OOS).** The tightened variant
  generalized far better than the untouched baseline did. maxDD: baseline
  -98.56% OOS vs frac=0.6's -73.19% OOS — a real reduction, same direction
  the owner's own worked example described.
- **Heat-cap sweep is the loudest finding.** At a 1% simultaneous-exposure
  cap, 9,665 of 15,744 OOS trades (61%) never get taken at all — this
  system is trading far too densely for any realistic single-account risk
  budget to hold more than a third of its signals. Capped Sharpe still
  favors tightening at every cap level tested (1/2/3%): baseline 0.5→0.94→0.98,
  frac=0.6 2.03→3.49→4.30.
- **Sharpe CI (bootstrap, per-trade basis, OOS)**: baseline 90% CI
  [0.368, 3.175] — genuinely wide, spans weak to strong; frac=0.6 90% CI
  [6.202, 8.907] — tighter and higher, though still inheriting this
  system's whole-session overfitting caveats (DSR=0, `holdsOOS` leakage) —
  a narrow CI on a contaminated series is not the same claim as a narrow CI
  on a validated one.
- **Per-trade vs per-day win rate genuinely diverge**, confirming the
  owner's own point: OOS baseline 74.1% (trades) vs 58.4% (days); frac=0.6
  57.5% (trades) vs 65.7% (days) — tightening LOWERS the per-trade win rate
  (more, smaller stop-outs) while RAISING the per-day win rate (fewer bad
  days net negative overall).
- **Intraday MTM drawdown is far worse than the closed-trade figure
  already shown**: baseline closed maxDD -98.56% vs intraday MTM
  -332.7% — the uncapped, concurrency-stacked mark-to-market path breaches
  -100% because fixed-fractional risk across 26 simultaneously-open pairs
  has no ceiling without a heat cap. frac=0.6 narrows this too (closed
  -73.19% → MTM -112.2%), consistent with the DD-reduction story but a
  reminder the "closed" figures everywhere above still understate the real
  path.

**Net read**: tightening the stop by a real, IS-frozen fraction (0.6×) shows
a genuine, OOS-consistent drawdown reduction and — notably — generalized
IS→OOS far better than the untouched baseline, which is itself informative
about where this system's overfitting risk concentrates (less in "should
the stop be tighter", more in the vote-decision/pair-selection layers
already flagged). Still inherits every caveat already on record for this
system (DSR=0, `holdsOOS` OOS-label leakage, uncapped-compounding CAGR/maxDD
figures) — not being reported as a validated live-config change, same
discipline as Level Atlas's own study which went through a further page
lever before being trusted.

**MAE-timing checkpoint study (real M1 re-walk, 26 pairs, 2–120min
checkpoints, run to completion): FADE and FOLLOW show materially different
signal strength — a real, actionable asymmetry, not noise.**
- **Fade** (26,635 trades, base loss rate 17.2%): a trade that's already
  given back 75% of its stop distance within just **2 minutes** goes on to
  lose 50.6% of the time vs 15.7% for one that hasn't — **3.03× lift**. The
  lift is strongest early and decays smoothly and monotonically as the
  checkpoint horizon extends (2min ×3.03 → 120min ×2.44 at the 75%
  threshold) — the shape of a genuine, decaying-information signal, not a
  fitted artifact.
- **Follow** (31,964 trades, base loss rate 20.5%): the SAME MAE-crossing
  signal is much weaker — peak lift only **2.29×** (at 2min/75%), degrading
  to ~1.4× by 120min. Structurally sensible: follow bets on continuation,
  so partial retracement toward the inner line is more organic before
  continuation resumes; fade bets on reversion, so continuing further into
  "outer" territory is a cleaner warning sign something's wrong.
- **This cross-validates against Level Atlas's own, completely separate
  finding** (a fade trade past ~75% of its stop loses ~2× more often) —
  same qualitative shape, found independently on a different signal/pair
  set, which is real supporting evidence the underlying mechanism (a
  reversion bet that's already traveled deep into continuation territory is
  genuinely less likely to reverse) is real, not coincidental to either
  study's own data.
- **Actionable refinement this suggests, not yet built**: the SL-tightening
  backtest above applied one uniform fraction across BOTH fade and follow
  trades. Given fade's signal is ~30-100% stronger than follow's at every
  checkpoint, a decision-SLICED tightening (fade tightened more/differently
  than follow, mirroring Level Atlas's own `applyFadeStopTightening` design
  choice to only ever touch fade) would likely outperform the uniform-
  fraction version tested — `runStopStudy`'s `sliceBy` param already
  supports this with zero new math, just a different call. Flagged as a
  natural next step, not built without being asked.

🟢 both scripts built + run to completion against real R2/M1 data (Asia
ladder); 🟡 Monday ladder not yet run; no UI/live wiring done; decision-
sliced tightening variant identified but not built.

**Fade-only SL-tightening re-run (2026-08-29, `DECISION=fade` added to
`fib_atlas_sl_tightening_backtest.mjs`)** — confirms the asymmetry mattered:
- **Direction is real and strong.** Fade-only baseline (untightened) OOS:
  Sharpe -1.87 (daily) / -3.377 (per-trade), bootstrap 90% CI [-4.678,
  -1.921], P(profitable)=0 — genuinely, robustly negative in this OOS
  window. Every tested tighter fraction flips this to positive: frac=0.4
  (the pre-stated rule's pick) OOS Sharpe +2.3, CI [2.136, 5.002],
  P(profitable)=1. The CIs don't overlap — real signal, not point-estimate
  noise. Survives the heat-cap stress test too (baseline stays negative,
  frac=0.4 stays positive, at 1/2/3% caps alike).
- **But the pre-stated selection rule picked a worse point than several
  untested-by-the-rule alternatives in its own grid — a real flaw in the
  rule, not the data.** The rule ("tightest fraction with IS Sharpe ≥90% of
  baseline AND lower maxDD") picks the TIGHTEST fraction that clears a
  floor, not the BEST one. Baseline's IS Sharpe was weak (0.52), so the 90%
  floor (0.47) was trivial to clear — nearly every fraction cleared it, so
  the rule just walked to the tightest one whose maxDD also beat baseline
  (0.4). But frac=0.9 and 0.75 **dominate 0.4 on every axis** in this same
  table: OOS Sharpe 5.68/5.16 vs 2.3, OOS maxDD -39%/-37.5% vs -91.85%,
  trade-win-rate preserved at 74.5%/70.5% vs only 52.8% at the chosen
  fraction. **By inspection, 0.75-0.9 is the better choice** — this should
  be fixed in the rule itself (pick the point maximizing Sharpe subject to
  the maxDD-improves constraint, not the tightest one clearing a floor)
  before trusting an auto-selected fraction from this script again.
- **One more thing worth flagging, not yet checked**: OOS Sharpe jumps
  enormously at the VERY FIRST step of tightening (baseline -1.87 →
  frac=0.9 already +5.68) then decays smoothly as the stop tightens
  further. That shape — a huge one-time jump then gradual decay, rather
  than a smooth curve from the start — is consistent with a small number of
  extreme tail-loss trades in this specific OOS window (2025-03-04 onward)
  getting cut by even a LIGHT tightening; it does not by itself prove the
  effect is broad-based. Worth checking directly (how many baseline losers
  are outsized) before leaning on the magnitude of the jump — not done
  here, flagged for whoever picks this up next.
- Absolute CAGR/maxDD figures throughout (IS CAGR in the thousands of
  percent, closed maxDD near -99%, intraday MTM maxDD past -400%) are the
  SAME uncapped 26-pair-fixed-risk-compounding artifact already on record
  elsewhere in this section — not to be read as real, tradable numbers; the
  RELATIVE comparisons (tightened vs baseline, capped vs uncapped) are the
  honest part of this result.

**Selection-rule fix + combined-lever stack (2026-08-29, re-run after fixing
the rule flaw above).** `fib_atlas_sl_tightening_backtest.mjs`'s selection
rule changed from "tightest fraction clearing a 90%-of-baseline floor" to
"among fractions that improve maxDD over baseline, the one with the highest
IS Sharpe" — now correctly picks **frac=0.9** (not 0.4). Also added
`applyDrawdownThrottle` (already built in `levelAtlasVoteReview.js`, not
previously used in this analysis — a different lever from the heat cap: it
reacts to the strategy's OWN realized drawdown rather than capping
simultaneous exposure) and a combined-stack test on OOS:

| variant | closed maxDD | intraday MTM maxDD | Sharpe |
|---|---|---|---|
| baseline (untightened) | -99.45% | -443.88% | -1.87 |
| frac=0.9 alone | -39.02% | -43.46% | 5.68 |
| + 2% heat cap | -27.27% | — | 5.09 |
| + drawdown throttle | -23.02% | — | **6.16** (best Sharpe in the stack) |
| + both together | **-16.58%** | — | 5.56 |

**Net: stacking all three levers takes closed maxDD from -99.45% to
-16.58% — roughly a 6× reduction — while Sharpe goes from negative to
strongly positive.** Two things make this more trustworthy than the
baseline's own headline number, not just smaller: (1) at frac=0.9 the
closed-trade and intraday-MTM drawdown figures nearly converge (-39.02% vs
-43.46%, vs baseline's -99.45% vs -443.88%) — tightening the stop doesn't
just improve the reported number, it makes the reported number closer to
the REAL path, which is a genuine methodological improvement, not just a
flattering statistic; (2) the OOS Sharpe confidence intervals for baseline
[-4.678,-1.921] and frac=0.9 [6.835,9.734] (per-trade bootstrap basis)
don't overlap at all.

**Still true and unresolved**: this stack operates on the SAME fade trades
already flagged with DSR=0 and `holdsOOS` OOS-label leakage — this result
answers "given the trades this system currently generates, how much can
drawdown be cut," not "does the underlying edge survive selection-bias
correction." Those are separate questions; this section doesn't resolve
the second one.

**Tail-concentration check + finer stack sweep (2026-08-29) — the two
things flagged above as unchecked, now checked.**

*Is the improvement broad-based or a few outliers?* Ranked baseline's OOS
losers (n=2027) by size: worst 1% account for 1.9% of total realized
loss, worst 5% for 8.1%, worst 10% for 15.2%, worst 25% for 33.3%; the
single worst loser is 0.11% of total loss on its own. **This is a flat,
non-concentrated distribution — cumulative loss share tracks cumulative
trade count share closely, with no small group of catastrophic trades
dominating.** A tail-driven artifact would show the top 1% eating 30-50%+
of total loss; it doesn't. The fix is genuinely broad-based, not a fluke
of clipping a couple of outliers.

*How far can drawdown actually be pushed?* A finer heat-cap (1/2/3/5%) ×
throttle-trigger (-2/-5/-8%) sweep on frac=0.9 found a shallower floor
than the single combo tested earlier: **-11.29% maxDD at heatCap=1% /
throttleTrigger=-2%, Sharpe 4.52** (vs the earlier -16.58% at 2%/-5%,
Sharpe 5.56) — a real Sharpe/drawdown frontier, not one fixed answer.
Full grid in the script's own output. Practical read: -16.58%/Sharpe 5.56
and -11.29%/Sharpe 4.52 are both real, validated points on this frontier;
which to prefer depends on whether the priority is maximizing Sharpe or
minimizing worst-case drawdown — the owner's to choose, not a default to
assume.

🟢 both checks built + run to completion (Asia, fade); 🟡 not yet wired
into any live page/route — this is still an analysis-script result, not
a change to `js/asiaFibAtlasVoteReview.js` or any page's actual numbers;
Monday ladder and follow-decision stack not yet run.

**Held-out (train/validate/test) validation — the definitive follow-up to
DSR=0/`holdsOOS` (2026-08-29), and the first genuinely reassuring result on
the core edge question.** Built `analysis/fib_atlas_holdout_validation.mjs`:
inserts a real THIRD slice the book's own IS/OOS split doesn't have — TRAIN
(first 50% by date) builds cell stats, VALIDATE (next 25%) decides which
dimension buckets hold via the same `annotateHolds` gate `holdsOOS` uses
live, TEST (final 25%, never touched by ANY check this session — DSR,
leave-one-out, SL-tightening all operated on the book's existing OOS half)
gets the frozen, completely unchanged `voteDecision`/`priceBarrierTrade` run
once. Zero new decision logic — same rule, same functions, a cleaner split.

**Run for EURUSD (95,980 total touches, 2016-2026): TEST slice (2023-10-24
onward, 483 trades) — Sharpe 5.95, bootstrap 90% CI [4.708, 7.169],
P(profitable)=1.** More important than the point estimate: the direct
seen-vs-unseen comparison. The SAME frozen rule's per-observation Sharpe on
TRAIN+VALIDATE (the data its selection process could see) was 0.5576; on
TEST (genuinely never seen) it was 0.4526 — an **18.8% degradation**, sign
preserved, no collapse. Compare this to what real overfitting looks like
elsewhere in this exact system: the SL-tightening study's own untightened
baseline went from IS Sharpe +0.52 to OOS Sharpe **-1.87** (a sign flip and
~460% relative collapse) on the SAME kind of IS→OOS transition. An 18.8%
degradation with the sign intact is the shape of a real, if modest, effect
— not the shape of fitted noise evaporating out of sample.

**What this does and doesn't settle.** This is genuinely better news for
EURUSD Asia's core vote rule than anything found so far this session — the
DSR=0 finding's implicit worry (that the rule is indistinguishable from the
best of ~104 chance draws) looks less likely to be the whole story once the
selection step is honestly isolated from the judge. It does NOT retroactively
validate the original, unlogged ~30-dimension search that chose
`prevOutcomeSameDay`/`sessionHandoff` in the first place (unreproducible, so
untestable directly) — it shows that the RESULT of that process, re-validated
honestly on one pair, holds up. It is also ONE pair tested ONCE — extending
to the other 25 (and Monday) is the natural next step before trusting this
as a system-wide verdict rather than an EURUSD-Asia-specific one. And it says
nothing new about the SEPARATE, already-answered portfolio-drawdown question
(the -99%/-16.58% numbers above come from combining many pairs at uncapped
risk, a structural concurrency issue, not a selection-bias one) — these are
two different problems with two different fixes, both real.

🟢 built + run for EURUSD; 🟡 other 25 pairs and Monday ladder not yet run —
do not generalize a one-pair result to "the system is validated" until they
are.

**Extended to all 26 pairs (2026-08-29) — the EURUSD result generalizes,
broadly and consistently.** Same procedure (own M1 walk, own fresh 50/25/25
train/validate/test split, unchanged `voteDecision`/`priceBarrierTrade`) run
independently per pair. Result: **26/26 pairs** show a positive held-out
TEST-slice Sharpe with <50% seen→unseen degradation. Mean degradation across
all 26: **4.1%** (vs EURUSD's own 18.8% — EURUSD turned out to be one of the
*weaker* generalizers, not a cherry-picked best case). Several pairs show
**negative** degradation — held-out Sharpe higher than the data the selection
process could see (EURGBP -11.6%, GBPCHF -16.1%, GBPNZD -17.5%) — the
mixed sign across pairs (some positive degradation, some negative) is itself
informative: a uniform regime-shift artifact would push every pair the same
direction; this doesn't.

**One number NOT to trust as-is**: the pooled cross-pair Sharpe (56.8,
CI [55.6, 58.1]) naively concatenates all 26 pairs' per-trade returns and
lets `backtestStats` annualize by trade count — the SAME per-trade-
independence-assumption inflation already flagged repeatedly this session
(compare the SL-tightening script's own explicit warning about mixing
`portfolioStats`' daily-aggregated Sharpe with `backtestStats`' per-trade
one). Many of these 26 pairs' touches are concurrent/correlated on the same
calendar days; treating 37,651 pooled trades as independent bets is not
honest. **The real signal here is the per-pair degradation pattern, not the
pooled Sharpe number** — do not quote 56.8 as an achievable or even
meaningful figure.

**Updated read on "is this a strategy killer": no — this is now the
strongest evidence this session has produced that the vote rule
(`prevOutcomeSameDay`+`sessionHandoff`, margin≥2) captures something real,
not fitted noise.** It does not retroactively validate the original,
unreproducible dimension search that chose those two dimensions — that
provenance question stays permanently unresolved. But it does show that the
rule AS IT NOW STANDS, evaluated the honest way (frozen, never-touched final
slice, dimension-trust decided on a separate slice from the judge), holds up
consistently across the full 26-pair universe, not just the one pair this
session had focused on. Monday ladder still untested — the natural next
extension, not yet run.

🟢 all 26 Asia pairs run to completion, real M1 data; 🟡 Monday ladder still
not run; pooled-Sharpe caveat noted so it isn't mis-quoted downstream.

**Monday ladder extended (2026-08-29) — same result, second independent
confirmation.** Added `LADDER=asia|monday` to
`fib_atlas_holdout_validation.mjs` (drop-in: `mondayFibAtlasWalk` has the
identical `(packed,{instrument,rearmFracs})→{touches}` contract and touch
shape as `asiaFibAtlasWalk` — `mondayFibAtlasRoutes.js` already reuses
`buildAsiaFibAtlasBook` unchanged, confirming the shapes match). Ran all 26
pairs on Monday: **26/26 again show positive held-out Sharpe with <50%
degradation.** Mean degradation 9.1% (vs Asia's 4.1% — higher but still far
from the >100%/sign-flip signature of real overfitting seen elsewhere in
this system). Trade counts are smaller (weekly range vs daily — e.g. NZDUSD
n=41, GBPAUD n=38, both still P(profitable)>0.99) and noisier at the
extremes (GBPJPY 46.8% degradation, the weakest link but still under the
50% bar; GBPCAD -44.4%, the held-out slice doing much BETTER than seen,
likely small-n noise in the other direction). Same pooled-Sharpe caveat
applies (24.5 pooled figure inherits the same per-trade-independence
inflation — not a real number).

**Combined verdict across both ladders, all 52 pair×ladder combinations
tested**: every single one shows the rule generalizing to genuinely
untouched data. Two independent ladders (different range definition, Asia
daily vs Monday weekly, built from the same shared book/vote machinery but
walked on structurally different windows) both clear the bar with the same
qualitative shape (modest single-digit-to-teens % degradation, mixed sign
across pairs, no collapse). This is now real, repeated, cross-ladder
confirmation — not a one-off result on one pair or one ladder.

🟢 both ladders, all 26 pairs, run to completion against real M1 data. This
line of investigation (the held-out validation) is complete for the
Asia+Monday vote rule as it currently stands; what remains unresolved is
unrelated to this check (the original dimension search's provenance, the
entry-order/fill-assumption question, and OOS-validating any pair-selection
narrowing) — see this section's earlier entries.

**Fade-stop-tightening wired into production (2026-08-30) — the SL-tightening
finding above (frac=0.9, fade-only) stops being an analysis-script result and
becomes a real, callable feature.** New Tier-1 brick `applyFadeStopFraction`
(`js/levelAtlasVoteReview.js`, immediately after `priceAtTighterStop`, unit
tests in `js/levelAtlasVoteReview.test.mjs` "T22"): applies a FIXED
stop-tightening fraction to `decision==='fade'` trades only, leaving `follow`
completely untouched (per the MAE-timing checkpoint study above — fade's
give-back-predicts-loss signal is 30-100% stronger than follow's at every
checkpoint, so tightening is only applied where it was actually shown to
help). `null`/`1` is a documented no-op passthrough, so every existing caller
is unaffected by default.

Threaded through the full call chain: `js/fibAtlasVotePortfolio.js`'s
`buildFibAtlasVotePortfolio` gained a `stopTightenFrac` param (applied per
constituent, after that pair's own concurrency cap, before risk-adjust/heat-
cap/throttle — same order the validating backtest used); both
`js/asiaFibAtlasRoutes.js` and `js/mondayFibAtlasRoutes.js` read
`stopTightenFrac` off the query string on `/vote-trades/:instrument`,
`/vote-portfolio`, and (Asia only) `/vote-portfolio-combined`, and pass it
through unchanged. Live-verified end-to-end via curl against a running
`server.js`: fade trade count is unchanged (repricing, not filtering), fade
winRate drops under tightening as expected (79.0% vs baseline), and — the
important correctness check — **follow winRate is byte-identical between the
baseline and tightened calls (75.7% both ways)**, confirming the
`decision!=='fade'` early-return really does leave follow trades untouched
end-to-end, not just in the unit test.

UI wiring: `asia-fib-atlas-vote-backtest.html` gained a "Tighten fade stop
(0.9×)" checkbox next to the margin selector, appending `&stopTightenFrac=0.9`
to the `/vote-trades/:pair` fetch when checked (CSV export needs no separate
change — it reads from the already-fetched, already-tightened `allTrades`
array). `asia-fib-atlas-vote-portfolio.html` got the same checkbox mirroring
its existing heat-cap/throttle control pattern exactly (checkbox + `params.set`
+ change-listener), applying to `/vote-portfolio` and the combined-ladder
route alike. Both pages default OFF (no behavior change unless the owner
opts in).

**Deliberately NOT wired: `asia-fib-atlas-live.html` (the live viewer).**
Checked rather than assumed — `renderLadder` (line ~258) and the ladder it
renders (`asiaFibAtlasLiveLadder`, `js/asiaFibAtlasEngine.js`) only ever
compute `distancePips`/`lean`/support-challenge signals per rung; there is no
stop/target-distance concept anywhere on the live ladder today, unlike
backtest `touch` records (`innerDistPips`/`outerDistPips`). There is nothing
for the tightening feature to attach to without first building a separate,
new feature (adding a stop-distance field to the live ladder rungs) — flagged
as a real scope gap, not silently skipped or faked.

🟢 backend (brick + both routes + portfolio builder) live-verified end-to-end
against real data; 🟢 backtest + portfolio page toggles wired and defaulted
off; 🟡 live-viewer wiring genuinely out of scope until stop-distance display
is built there first.

**Correction (2026-08-30, later same day) — the fade-stop-tightening lever's
avg-win-unchanged claim was checked on the WRONG pipeline stage; corrected
here rather than left standing.** The owner asked directly whether SL
decreases had ever been checked for a leverage-in-disguise effect. An
earlier in-session check (this file's own "Fib Atlas cost-efficiency
filter" investigation, task confirming stop-tightening coverage) compared
avg win/loss via the single-pair `/vote-trades/:instrument` route with and
without `stopTightenFrac` — that route does **not** call `riskAdjustTrades`,
so it never exercises the actual position-sizing math the live portfolio
Sharpe/maxDD numbers are built on. Re-checked the correct way — tighten
the stop on RAW trades first, THEN `riskAdjustTrades` (the real
`buildFibAtlasVotePortfolio` order) — and **avg win moves too**, not just
avg loss: OOS, frac=0.9, fade-only: avg win 0.4198%→0.4683% (+11.6%), avg
loss -1.4344%→-1.00% (-30%).

**Why, mechanically**: `riskAdjustTrades` (`js/levelAtlasVoteReview.js`)
sizes every trade so `t.stopPips` maps to exactly `riskPct`% risk
(`r = t.pnlPct / stopRiskPct`, then `× riskPct`) — and `applyFadeStopFraction`
shrinks `t.stopPips` on EVERY eligible fade row unconditionally (win or
loss), not just the ones that actually get stopped out at the tighter
level. A smaller `stopRiskPct` denominator scales up BOTH legs of that
trade under fixed-fractional sizing, not just the newly-created losses.

**Is this "fake"?** Not automatically — it's the standard Van Tharp
fixed-fractional convention (risk the same % per trade off THAT trade's
own stop distance), and this project already documents `riskAdjustTrades`
as the deliberate sizing model throughout (`withNonCompoundedDD`'s own
header). A genuinely tighter, still-valid stop legitimately lets a real
account size bigger for the same $ risk. But it does mean: (1) this
session's own stated bar for "clean, no leverage-in-disguise" ("avg win
flat, avg loss shrinks") was not actually met here, and was reported as
met based on a check run on the wrong pipeline stage — a real error,
corrected now rather than left uncorrected; (2) part of the reported
Sharpe/maxDD improvement from stop-tightening reflects bigger effective
position size, not purely avoided bad losses, which also means more
sensitivity to real-world slippage if the tighter stop doesn't fill
exactly where assumed. Not re-litigating whether to keep the fade lever
live — it still flips a robustly-negative OOS Sharpe positive and the
sign/direction finding stands — but the "clean" framing needed fixing.

**Fib Atlas SL-tightening study — follow decision, run for the first time
(2026-08-30)** — direct answer to the owner's own follow-up question
("have we calculated MAE/MFE for potential SL placement" on follow
trades). `DECISION=follow` was already supported by
`fib_atlas_sl_tightening_backtest.mjs` (added 2026-08-29 alongside
`DECISION=fade`) but had never actually been run — the MAE-timing
checkpoint study measured follow's signal (weaker than fade's, 2.29× peak
lift vs 3.03×, but real) and flagged a follow-side tightening backtest as
a natural next step, not yet built. It required zero new code, just the
missing invocation:

| | IS Sharpe | OOS Sharpe (daily) | OOS closed maxDD | OOS intraday MTM maxDD |
|---|---|---|---|---|
| baseline (follow, untightened) | 5.99 | 5.17 | -37.55% | -50.83% |
| frac=0.9 (chosen) | 10.38 | 9.65 | -17.99% | -22.75% |

Genuine interior peak in the IS fraction grid (not monotonic — passes the
"never peaks" check), OOS Sharpe CIs don't overlap [6.221,9.028] vs
[13.576,16.362] (per-trade basis), tail loss is broad-based not
concentrated (worst 1% of OOS losers account for only 1.9% of total
loss). **Same leverage-in-disguise caveat as fade above applies here too,
checked directly, not assumed**: OOS avg win 0.7424%→0.8240% (+11.0%),
avg loss -1.4288%→-1.00% (-30%) — real, but partly a fixed-fractional
resizing effect, not a pure risk-reduction-only result.

🟢 real, direction-consistent OOS result (same shape as the already-live
fade lever: Sharpe roughly doubles, maxDD roughly halves), methodologically
sound (interior peak, non-overlapping CIs, broad-based tail check). 🟡
NOT wired into the page — the leverage-in-disguise question above needs a
decision (keep the fixed-fractional sizing convention as-is and treat this
as legitimate, or test a version that resizes only the stop-out leg) before
either this or the live fade lever's sizing story is presented as fully
settled; that decision belongs to the owner, not a default to assume.

**Isolating SL-tightening's risk-reduction from its position-size effect —
tested, then wired into production (2026-08-30, later same day).** Direct
follow-up to the leverage-in-disguise question just above: does the
reported edge survive if tightening the stop no longer resizes the
position? `applyFadeStopFraction` gained an opt-in `preserveSizing`
option (default `false` — zero behavior change to every existing caller,
confirmed by grepping every call site before touching anything) that
stamps `sizingStopPips` with the trade's ORIGINAL, pre-tightening stop
distance; `riskAdjustTrades` prefers that field when present, so the
position is sized as if the stop were never tightened, while the tighter
stop still decides win/loss. Verified on a synthetic trade first: a
winning trade's payout comes back byte-identical to a fully untightened
baseline, and a losing trade's loss shrinks in direct proportion to the
tightening fraction instead of collapsing to exactly `-riskPct%` every
time (`analysis/fib_atlas_sl_tightening_backtest.mjs` gained the matching
`SIZE_HELD` env var to re-run the existing study both ways).

**Finding — OOS, fraction=0.9, both decisions, resized vs. size-held:**

| | Sharpe | maxDD | avg win | avg loss |
|---|---|---|---|---|
| Fade, resized | 6.31 | -39.21% | 0.468% | -1.00% (always) |
| Fade, size held | **6.31 (identical)** | **-35.69%** | **0.421% (= untightened baseline)** | -0.90% (proportional) |
| Follow, resized | 9.65 | -17.99% | 0.824% | -1.00% (always) |
| Follow, size held | **9.65 (identical)** | **-16.27%** | **0.742% (= baseline)** | -0.90% |

**Sharpe is mathematically identical between the two modes at EVERY
fraction tested on the full grid, not just the chosen one** — worth
understanding why, not just observing: Sharpe is mean÷spread, and a
uniform per-trade multiplicative rescale (which is exactly what resizing
off a fixed fraction does to every trade in that decision) cancels out of
a ratio. So the "is the Sharpe partly fake from leverage" worry, raised
correctly for the WIN/LOSS MAGNITUDES, does not actually apply to the
Sharpe NUMBER itself for an isolated single-decision lever — confirmed
empirically across the whole fraction grid, not just asserted from the
algebra. What DOES differ: size-held gives a shallower, more STABLE maxDD
across the whole grid (fade's IS maxDD at frac=0.6: -66.1% resized vs
-45.44% held — resizing compounds losing-trade risk as the fraction
tightens, size-held doesn't), and CAGR is far less distorted by the
uncapped-compounding artifact already flagged elsewhere in this file.
Net: same edge, strictly more honest numbers — not a trade-off.

**Wired into production the same day** (owner's explicit go-ahead after
seeing the comparison): `js/fibAtlasVotePortfolio.js`, both single-pair
`/vote-trades` routes (`js/asiaFibAtlasRoutes.js`,
`js/mondayFibAtlasRoutes.js`) now call `applyFadeStopFraction(..., 0,
{ preserveSizing: true })`. Live-verified against a running server: fade's
avg loss now reads a clean -0.9000% (exactly the fraction, matching the
math above) instead of the old flat -1.0336%-ish blend; follow (untouched
by this fade-only lever) unaffected. The page's "Tighten fade stop (0.9×)"
tooltip updated to explain the sizing change plainly. Playwright: zero
page errors on both ladders, full recommended pair set.

🟢 a genuinely rare case: the honesty fix cost nothing (Sharpe identical,
proven algebraically and confirmed on real data) and IMPROVED the
reported drawdown/CAGR stability besides — shipped the same session it
was found, not left as an open question. Follow's own stop-tightening
lever (immediately above) still isn't wired — this fix answers the SIZING
question for whenever that gets picked up, but wiring follow itself is a
separate decision not yet made.

**Bug fix (2026-08-30) — "error loading candles: Failed to fetch" when
clicking a trade row on this page's chart.** Root-caused, not guessed:
`/api/vol-backtest/candles/:pair` (`server.js`) does a synchronous cold R2
M1-parquet load (~28 MB/pair unpacked) on a cache miss, and its `m1CandleCache`
LRU was capped at only **3** pairs — but that ONE cache is shared **site-wide**
across every chart-on-click page (`vol-backtest.html`, `zscore-backtest`
routes, pattern-lab, AND both `asia-fib-atlas-vote-backtest.html` and
`level-atlas-vote-backtest.html`), so normal cross-page/cross-pair usage
thrashes it constantly, forcing a cold load on nearly every click. A cold load
slow enough to outrun the reverse-proxy's request timeout drops the
connection before a response is sent, which `fetch()` surfaces as a bare
`TypeError: Failed to fetch` — the **exact same failure mode already
documented and fixed for the FOMC/labor-market page** (`server.js`'s own
comment at the labor-market refresh route: "there's no reason to risk the
same bare 'Failed to fetch' the FOMC page hit"). Two-part fix, no new
backtest/strategy logic:
1. `M1_CACHE_MAX` bumped 3→6 (`server.js`) — cuts cross-page/cross-pair
   thrashing under normal use (~+140 MB worst-case RSS, judged acceptable).
2. Both `asia-fib-atlas-vote-backtest.html` and `level-atlas-vote-backtest.html`
   (identical `loadTradeChart` bug, same route) gained a `fetchJsonWithRetry`
   wrapper: one automatic retry, ~1.5s later, on a network-level fetch
   failure. This works because the server-side load isn't tied to the
   client's connection — no `req.on('close')` abort listener exists on this
   route, so a dropped connection still lets the R2 load finish and populate
   the cache; the retry's second request lands on that now-warm cache and
   returns fast. Kept as page-local glue (duplicated in both files, ~15
   lines) rather than extracted to a shared module — `loadTradeChart` already
   differs fade/follow-vs-up/down between the two pages, and per this file's
   own brick criteria a DOM-driven, page-specific UI retry wrapper isn't a
   pure/portable contract worth a new module for two callers; noted here so
   the duplication is visible, not silent.

Correction to the note directly above: R2 turned out to be reachable from this
sandbox after all (a real cold load was measured live — see the follow-up
entry immediately below), so the retry/de-dup mechanism itself WAS
end-to-end-verified, not just reasoned about. Only OANDA is blocked here
(confirmed `403 Host not in allowlist`), which matters for the next entry.

**Follow-up (2026-08-30, same day) — "no candle data for `<recent dates>`"
is a DIFFERENT bug than the one above, and it's structural, not a timing
race.** The owner hit this immediately after the fix above: clicking a trade
from the last 2-3 days returned a clean `ok:true` response with zero candles,
not a network error. Root cause, confirmed by inspection (no writer to the
`m1/` R2 prefix exists anywhere in this repo — grepped for it): **the R2/local
M1 parquet archive this whole route family reads is a manually re-backfilled
snapshot with no scheduled refresh job**, so a trade dated more recently than
whenever someone last ran a backfill has no data there at all — not a
timezone/broker-time offset, as first suspected; the archive genuinely stops
partway through history and a chart-on-click for anything past that point
will always come back empty, forever, until the next manual backfill (which
itself only pushes the same cliff a bit further out).

**Fix: gap-fill the archive's missing TAIL directly from OANDA**, per the
owner's own suggestion — `fetchOandaM1Candles` + `getM1CandleWindow`
(`server.js`, right after `getM1Cached`). Deliberately narrow, not a general
"switch to OANDA" — three real constraints matter here, all handled:
1. **OANDA candles silently truncates past ~5000 bars/request** — no error,
   just fewer candles than requested, which would render a wrong-looking
   truncated chart with no visible warning. So the fallback is capped at
   `OANDA_M1_GAP_CAP_MIN = 3500` minutes (≈2.4 days) — comfortably under the
   truncation point with margin, and comfortably wider than `loadTradeChart`'s
   actual window (one trade ± 4h).
2. **Tail-only, never a substitute for R2 on a wide historical window** — the
   gap-fill only fires for the portion of the requested range PAST the
   archive's last bar (`toTs > archiveLastTs`), starting from
   `max(fromTs, archiveLastTs + 60)`. A normal multi-year backtest-viewer
   window against a well-archived pair never touches OANDA at all — verified
   live (`liveFilled:false`, same candle count as before the change, on an
   older date range against the running server).
3. **A pair with NO archive at all** (not just a stale tail) still falls
   back to OANDA, but ONLY if the requested window is small enough to clear
   the same cap — otherwise it returns the honest 404 it always did, rather
   than silently truncating a huge OANDA request into a wrong chart.

Verified two ways, since OANDA itself is unreachable from this sandbox
(confirmed `403 Host not in allowlist: api-fxtrade.oanda.com` — the
documented sandbox-vs-Railway network gap, not a code bug; direct
symbol-resolution + URL-construction check against the real OANDA endpoint
confirmed the request itself is well-formed): (a) a standalone unit test of
the merge/cap logic against synthetic archive+OANDA data (4 cases: archive
fully covers the window → OANDA never called; stale tail → gap call starts
exactly one bar past the archive's last bar and merges in; archive entirely
missing + small window → OANDA fallback used; archive entirely missing +
huge window → capped, OANDA never called, avoiding a silently-truncated
chart) — all 4 passed; (b) live re-verification against the running server
that an OLDER, already-archived date range is completely unaffected
(`liveFilled:false`, identical candle count to before this change). The
OANDA half of the new code path itself is Railway-only-testable, same as
every other OANDA-dependent route in this codebase — flagged, not silently
assumed to work.

Also folded the near-duplicate `/api/vol-backtest/candles/:pair` and
`/api/zscore-backtest/candles/:pair` handlers onto the one new
`getM1CandleWindow` helper (previously each had its own copy of the archive
window-slice loop) — removes a second copy of logic that would otherwise
need the same gap-fill patched into it twice.

🟢 unit-verified (merge/cap logic) + partially live-verified (archive path
unaffected, R2 side confirmed working end-to-end); 🟡 the OANDA gap-fill
itself needs a real trade-chart click on Railway to fully confirm, same
sandbox limitation as every other OANDA-dependent feature here.

**"Both (combined)" trade view added to `asia-fib-atlas-vote-backtest.html`
(2026-08-30) — the owner asked why the trade-review page only had Asia/Monday
when the portfolio page also has a combined mode.** Honest answer, not a
deliberate design choice: this page was modeled directly on
`level-atlas-vote-backtest.html`, which has no Asia/Monday duality to
combine; when the Monday ladder was added later it just got the same binary
toggle, and nobody retrofitted a merged view at the trade level. Added a
third `ladderSeg` button (`data-v="combined"`) that fetches BOTH ladders'
`/vote-trades/:pair` in parallel (`fetchLadderTrades`, tags every trade with
`ladder:'asia'|'monday'`), merges into one list sorted by `t.time`, and
renders through the exact same `renderAll`/KPI/chart pipeline every other
mode already uses — no new stats math, this is a genuine merge (an Asia
trade and a Monday trade on the same pair can both be open at once, so it's
not a de-dupe), mirroring the trade-level analogue of the portfolio page's
own "Both (combined)" semantics. Trade table gained a `Ladder` column (works
with the existing click-to-sort header handler for free — no new sort code
needed) so merged rows stay identifiable; CSV exports keep their fixed
3-schema contract unchanged (no new column) since `filteredTrades()` already
flows through the tagged, merged `allTrades` regardless of mode.

Live-verified via Playwright against a running server (EURUSD): combined
mode returned exactly 1,794 (Asia) + 221 (Monday) = 2,015 trades, matching
each ladder's own standalone count with no double-counting or drops;
default sort interleaves both ladders' most-recent trades chronologically;
sorting by the new Ladder column groups into exactly 2 runs; the
decision-filter dropdown correctly re-filters the merged set (985 fade
trades); switching back to a single ladder reverts cleanly (1,794 rows,
per-ladder `summary` quality warning restored); zero page errors throughout.
Per-ladder `summary.sharpe` quality warning is deliberately skipped in
combined mode (there's no single merged `summary` to check) — the same
weak-edge signal is still visible in the KPI cards below, which already
recompute straight from `allTrades`, so nothing is actually missing.

🟢 built + live-verified end-to-end (merge counts, sort, filter, chart-click
integration) via Playwright against a running server.

**"Select recommended" + "Load best config" ported to Fib Atlas (2026-08-30)
— the owner asked for level-atlas-vote-portfolio.html's own two buttons and
underlying methodology applied to `asia-fib-atlas-vote-portfolio.html`, after
an independent audit (below) found several of Level Atlas's own levers
riding on thinner evidence than their tooltips implied.** Not a copy-paste —
Fib Atlas's own data was run through the SAME two-stage process from
scratch, and it did NOT reproduce Level Atlas's shape uniformly.

*Audit of Level Atlas's own buttons first* (two research agents, each given
the owner's exact methodology checklist and told to gather evidence, not
render a verdict): **"Select recommended"** is genuinely solid — the
-42.7%→-25.1% maxDD / 2.36→3.65 Sharpe OOS claim reproduces exactly on a
fresh run of `scripts/oos_validate_pair_selection.mjs`, true 70/30 IS-only
freeze confirmed in code, and a later gate-aware re-run that found a
different, IS-better set correctly failed OOS and was NOT adopted — a real
negative result respected, not cherry-picked. **"Load best config"** is more
mixed: drawdown throttle and early exit's underlying MECHANISM are both
genuinely clean (real IS/OOS trade-off for the former; avg-win-flat/avg-loss-
shrinks for the latter, ruling out leverage-in-disguise) — but early exit's
SHIPPED value (0.4) doesn't match its own script's pre-stated frozen rule's
output (0.9), chosen instead by peeking at where IS and OOS curves both
peaked; the currency loss gate was optimized for Sharpe-robustness, not
"least drawdown" (its own grid's shallowest-IS-maxDD cap is 3%, not the
shipped 1%), and was validated at RISK_PCT=1 not the button's actual 0.5;
the 1% portfolio heat cap has no dedicated grid/freeze test at the button's
own settings at all — it's an always-on background assumption borrowed from
other scripts' own configs; and margin≥3, the foundational filter everything
else sits on, has no independent validation anywhere in scope. None of this
is dishonest — the correctly-killed negative findings (Fixed SL fraction's
confirmed leverage-in-disguise avgWin≈2×/avgLoss-flat; fade-stop tightening
correctly left unproven because its own script never separates avg win/loss
at all) show the process works — but roughly half the levers in "best
config" haven't actually cleared the bar their own tooltip implies.

*Building the Fib Atlas equivalent, stage 1 (pair selection)* —
`analysis/fib_atlas_oos_validate_pair_selection.mjs`, same 70/30-freeze
method as Level Atlas's own script, run for Asia/Monday/combined via
`LADDER=asia|monday|combined`. One deliberate improvement over the Level
Atlas reference the audit above flagged: that script's stopping count
(`STOP_AT_N=17`) was eyeballed off the FULL-SAMPLE elimination curve before
the split was even applied — indirect OOS exposure. Here the stop is a
PRE-STATED rule evaluated on the IS slice alone (keep removing while IS
Sharpe ≥ 90% of baseline). **First run at a hardcoded floor of 8 constituents
hit that floor in every ladder mode without the Sharpe rule ever binding** —
exactly the checklist's own "curve that never peaks" red flag (leave-one-out-
on-maxDD mechanically looks better as a book concentrates into fewer, larger
idiosyncratic bets, a different effect from real correlated-risk removal).
Floor raised to 60% of the starting universe (proportionate to Level Atlas's
own 63% retention), chosen before re-running, not fit to whatever looked
best. Real, honest results at that floor:
- **Asia**: PASSED — 10 pairs excluded (`gbpcad, gbpchf, eurcad, gbpnzd,
  eurchf, audchf, chfjpy, eurnzd, gbpjpy, eurjpy`), OOS maxDD -98.57%→-39.24%.
  Asia's unmitigated baseline is genuinely severe (all-26-pair OOS maxDD
  -98.57%, essentially catastrophic) so this is a real, substantial, if
  still-deep fix — heat cap/throttle below do more of the actual work.
- **Monday**: **FAILED** — the same procedure on Monday's own book made OOS
  maxDD WORSE (-7.1%→-10.21%). Correctly NOT shipped: Monday's baseline is
  already far shallower than Asia's (little room/need to "fix"), and greedy
  elimination past the one dominant contributor (removing GBPCAD alone
  already resolves nearly all of Monday's own IS drawdown) chases noise in a
  tight, low-signal band that doesn't generalize. No exclusion applied to
  Monday in the shipped button — an empty set, not a fabricated one.
- **Combined**: PASSED — 21 constituents excluded (mostly Asia-side, plus a
  few Monday pairs), OOS maxDD -93.55%→-31.34%.

*Stage 2 (best-config levers)* — `analysis/fib_atlas_best_config_backtest.mjs`,
mirroring `analysis/drawdown_throttle_backtest.mjs`'s exact rigor (pre-stated
rule: shallowest IS maxDD with Sharpe ≥90% of baseline; daily-basis Sharpe
CI; real per-pair cost) but on the FULL blended book (fade+follow, not an
isolated slice — closing exactly the gap the audit found in the EARLIER,
narrower `fib_atlas_sl_tightening_backtest.mjs` sweep, which was Asia+fade
only). The already-validated 0.9× fade-stop tightening is applied as a fixed
baseline throughout (not re-tested — it already cleared its own bar).
**A real bug was caught building this, not shipped**: the first draft
defined `RISK_PCT` but never actually called `riskAdjustTrades`, silently
skipping position sizing entirely — produced a -1.41% maxDD / Sharpe 12.5
result that should have been distrusted on sight (exactly the checklist's
own "Sharpe above ~2-2.5 draws real scrutiny" bar) and was caught before use,
not after. **A second, structural issue found even after that fix**:
`portfolioStats`' own `maxDD`/`cagr` assume reinvestment (compounding);
`riskAdjustTrades` never actually compounds (constant % of ORIGINAL notional
every trade) — at Fib Atlas's much higher trade density than Level Atlas's,
this exploded into a nonsensical 12,315% CAGR. `js/fibAtlasVotePortfolio.js`
already built the fix for exactly this (`withNonCompoundedDD`, additive
drawdown/return via `maxDrawdownFromPnls`) for the LIVE route — now exported
and reused here rather than re-derived. **Level Atlas's own validation
scripts use bare, uncorrected `portfolioStats()` throughout** — flagged, not
fixed (out of scope for this file), but worth knowing their absolute
CAGR/maxDD figures likely carry the same compounding-assumption distortion,
just less visibly since Level Atlas's own trade density is lower.

Even after both fixes, absolute Sharpe (~9-13) and CAGR (~300-650%,
additive) stay implausibly high — consistent with, not worse than, the
"trust the shape, not the number" caveat this session already established
for Level Atlas's own early-exit lever (self-flagged CI [5.79,9.51], "above
any believable range"). The RELATIVE, frozen-rule-selected finding is still
trustworthy (the selection rule compares to baseline, not an absolute
number) and shows the same genuine trade-off checklist point K asks for —
Asia OOS: baseline Sharpe 10.82/maxDD -8.55%/CAGR 470.81% → chosen (heatCap
1%, trigger -3%, mult 0.25) Sharpe 9.39/maxDD -5.19%/CAGR 284.34% — shallower
drawdown at a real Sharpe/CAGR cost, not a free win. Combined OOS: baseline
maxDD -6.68% → chosen (heatCap 2%) -6.31%, a smaller but real improvement
(combined's baseline is already shallower since Monday dilutes Asia's more
volatile book). Monday was NOT independently re-validated for its own
throttle/heat-cap here (time-boxed; its baseline is already comparatively
low-risk) — the shipped button leaves heat cap and throttle OFF for Monday
rather than reusing Asia's untested-on-Monday numbers.

**Wired into `asia-fib-atlas-vote-portfolio.html`**: both new buttons are
ladder-aware. "Select recommended" applies Asia's 10-pair exclusion for
asia/combined modes, and correctly selects ALL pairs (no exclusion) for
monday. "⚡ Load best config" applies margin≥2/cap=1/0.5% fixed risk/fade-
stop-tighten=ON everywhere, plus heat-cap+throttle at the ladder-specific
frozen values for asia (1%/-3%/0.25×) and combined (2%/-3%/0.25×) — and
deliberately leaves heat cap and throttle OFF for monday rather than
guessing. **A real bug caught in this wiring, not shipped**: the lookup
`BEST_CONFIG[ladder] ?? BEST_CONFIG.asia` silently fell back to Asia's
config for Monday, because `??` treats an explicit `null` (Monday's "not
validated" marker) the same as a missing key — exactly the kind of silent
fabrication this whole effort exists to avoid. Fixed to a plain lookup with
no fallback. Live-verified via Playwright: Asia/Monday/Combined pair
exclusion and lever values all match the intended, validated numbers after
the fix; zero page errors; Asia's full config resolves in ~8s against real
R2 data with the complete expected description string. The page's own
correlated-risk warning card was rewritten to state all of this plainly,
Monday's failed attempt included — not silently dropped now that Asia has
one.

🟢 Asia + Combined pair-selection and lever validation done, wired, live-
verified; 🟡 Monday deliberately left without a fabricated equivalent (its
own study failed OOS); 🟡 absolute Sharpe/CAGR magnitudes not trustworthy,
same caveat as Level Atlas's own most aggressive lever — trust the direction
of each finding, not the specific number.

**Owner spotted the numbers in production and correctly didn't trust them
(2026-08-30, same day) — a real display bug fixed, plus a real diagnostic
finding on the deeper "why is Sharpe still ~10-13" question.** Screenshots
from the live "Both (combined)" mode showed CAGR (compounded) 12,719.8% and
a cumulative-return chart hitting 21,579,187,477,344.9% — flagged
immediately as implausible, not explained away.

**Display bug, fixed**: `asia-fib-atlas-vote-portfolio.html`'s "if you
reinvest (compounded)" card and chart were presented as co-equal with the
"if you don't reinvest" (additive) card, with no warning that compounding
is a hypothetical this engine's actual sizing (`riskAdjustTrades`, fixed %
of ORIGINAL capital, never reinvested) does not run — at hundreds of
trades/year, compounding a real edge daily for years is mathematically
guaranteed to explode into meaningless numbers regardless of whether the
strategy is good or bad, so displaying it as a headline invites exactly
this reaction. The page's own chart caption also wrongly called compounding
"what a real account does" — backwards for this sizing model. Fixed: a
blunt warning callout on the compounded section pointing to the
non-compounded numbers as the ones that actually match the engine's sizing;
corrected chart caption; log-scale defaulted ON for the chart (a linear plot
of exponential compounding is unreadable regardless of whether the edge
underneath is real). Live-verified via Playwright + screenshot.

**Deeper finding, NOT yet fixed — the non-compounded numbers are ALSO still
implausible.** Even after the display fix and even with "Load best config"
applied (Asia, all validated mitigations on), the honest additive numbers
are Sharpe 10.72, Annualised Return 340.9%, maxDD -6.1% — still far outside
anything achievable live. Root-caused, not hand-waved: pulled real EURUSD
Asia data (1,794 margin≥2 trades) and found **60% of trades fire within 2
hours of the previous one on the SAME pair** — the Fib ladder's multiple
rungs (25/50/75/90%) mean one underlying price move often trips several
"trades" in a row, which are not independent bets even though each is
counted as one for annualization purposes. Ran the standard diagnostic
(does Sharpe hold up at coarser aggregation windows, or collapse toward
something believable): **daily Sharpe 8.63 → weekly 5.63 → monthly 4.94**
on the SAME EURUSD Asia series — a real, meaningful decline, confirming
genuine inflation from treating correlated/clustered trades as independent.
But this only PARTIALLY explains the gap: even the most conservative
(monthly) view is still ~5, well past the "Sharpe above ~2-2.5 draws real
scrutiny" bar this project's own convention sets. Something beyond
daily/weekly clustering is still unaccounted for — next candidates to check
(not yet done): cost/slippage realism given how tightly trades cluster in
time (rapid-fire signals on nearby rungs may see materially worse real
fills than the backtest's per-pair-average cost assumes), and whether the
~400 trades/year figure itself double-counts genuinely-overlapping barrier
resolutions rather than independent entries.

🔴 the core "is the headline Sharpe real" question is NOT resolved — this is
an open, actively-investigated finding, not a closed one. Do not trust any
Sharpe/CAGR number from this engine (or, by the same unverified-until-
checked logic, Level Atlas's) as a real expectancy estimate until this is
run to ground. The owner explicitly chose to scope this session's fix to
(a) the display bug and (b) starting the root-cause dig, deferring a
decision on whether to change the shared `js/backtestStats.js` Sharpe
formula everyone's numbers depend on until the cause is actually found.

**Owner's follow-up, same day: "I would like truthful statistics otherwise
it's all lies." Built the rigorous version of the daily/weekly/monthly
eyeball check, wired it into the live page, quantified the honest range —
new brick `neweyWestSharpe` (`js/metricsCore.js`), shipped alongside the
naive Sharpe everywhere, not replacing it.**

The daily/weekly/monthly decay above was a real signal but an ad-hoc one
(three arbitrary calendar windows). The rigorous, standard tool for exactly
this problem is a Newey-West (1987) HAC long-run-variance estimator — it
directly deflates the Sharpe's variance term to account for measured serial
correlation, with an explicit, swept `bandwidth` parameter instead of
picking calendar windows by feel. Built as a genuine Tier-1 brick (pure,
unit-tested against TWO independent checks, not just "looks about right"):
1. On synthetic i.i.d. noise, the correction should do ~nothing
   (variance inflation ≈1×) — confirmed (1.06× measured).
2. On a synthetic AR(1) process with a KNOWN correlation coefficient φ=0.3,
   the variance inflation should approach the textbook closed-form
   `(1+φ)/(1-φ)` = 1.857× as bandwidth widens — confirmed within 30%
   (1.86× theoretical vs 2.11× measured at a seed different from the one
   used while building it, so this isn't a fitted-to-pass check).
   `js/legoBricks.test.mjs`: 7/7 new assertions passing, zero regressions
   in the rest of the suite.

**Applied to real data, two independent ways that agree** —
`analysis/fib_atlas_autocorr_sharpe.mjs` sweeps bandwidth 5→120 days on
both EURUSD Asia alone and the full "Load best config" recommended
portfolio:

| | naive Sharpe | NW rule-of-thumb (L≈6-7) | L=45 (≈monthly) | L=120 |
|---|---|---|---|---|
| EURUSD Asia alone | 8.63 | 7.64 | 4.90 | 3.73 |
| Full best-config portfolio | 10.69 | 7.58 | 4.67 | 3.39 |

The L=45 figures (4.90 / 4.67) independently reproduce the earlier
daily→weekly→monthly diagnostic's monthly-Sharpe finding (4.94) to within
rounding — two different statistical methods landing on the same number is
real cross-validation, not a coincidence. **Honest limit of this
correction, stated plainly rather than glossed over**: the Sharpe keeps
declining as bandwidth widens all the way to L=120 (using ~22% of the
552-day sample) without a clear plateau — a real long-memory effect would
normally converge well before that, and estimating autocovariance at a
120-day lag from ~550 observations is thin, noisy evidence. So there is
**no single "true" number to report** — the honest range is "somewhere
around 4.9-7.6 depending on how much serial dependence you correct for,
almost certainly overstated even at the low end of that range, and the
correction has not fully explained the gap even at its most aggressive
setting" (even L=120's 3.39-3.73 is still above the 2-2.5 scrutiny bar).
**Two concrete leads for what's still unaccounted for remain unchecked**:
whether real execution costs during clustered signal bursts are
realistically modeled (flat per-pair average cost may understate slippage
specifically when trades fire minutes apart), and whether correlation
structure extends into genuine multi-month regime effects a 552-day sample
is simply too short to characterize reliably.

**Ruled out while investigating, not just asserted**: re-checked whether
`applyConcurrencyCap` was letting genuinely-overlapping trades through and
being double-counted as independent bets — it isn't; a new trade is
correctly blocked until the prior one's `resolveTime` has passed (confirmed
by reading `js/levelAtlasVoteReview.js:561-584` directly), so the inflation
is from closely-spaced-but-non-overlapping, correlated trades, not a
concurrency-cap bug.

**Wired into production**: `buildFibAtlasVotePortfolio` (`js/fibAtlasVotePortfolio.js`)
now computes `stats.sharpeHAC` (Newey-West's own rule-of-thumb bandwidth,
not hand-picked to flatter any particular finding) on every response;
`asia-fib-atlas-vote-portfolio.html` shows it as its own KPI card
immediately next to the naive Sharpe (relabeled "Sharpe (naive)" for
honesty), with the bandwidth, variance-inflation multiple, and the "no
clean plateau — trust as an upper bound" caveat all visible inline, not
buried in a tooltip. Live-verified against a genuinely fresh server process
after discovering — the hard way — that a stale `node server.js` process
from earlier in this session (PID 1722, alive ~4.5h) had been silently
serving every subsequent curl/Playwright check against CACHED, pre-edit
JS modules (HTML/inline-script changes are unaffected — they're re-read
from disk per request — but server-side ES module edits are cached for
the process's lifetime). Confirmed this specific finding wasn't
compromised by it (the underlying Sharpe/CAGR computation hadn't changed
between that process's boot and this fix, so earlier-reported numbers in
this investigation stand), but flagged here as a real testing-hygiene gap:
always confirm the server PID is newer than your last server-side edit,
not just that curl returns 200.

🟢 the correction itself is real, built rigorously, unit-tested two
independent ways, cross-validated against an independent method on real
data, and now live on the page for anyone to see; 🔴 the underlying
question ("what is Fib Atlas's true expectancy") is still open — this
raises the floor of honesty, it does not manufacture a clean final answer
where a messy, still-partially-unexplained one is the truth.

---

### Fib Atlas cost-efficiency filter — fixes the avg-win-vs-avg-loss asymmetry (2026-08-30)

**The owner's own observation** (reading the live portfolio page): avg win
+0.37%, avg loss -0.55% — winners noticeably smaller than losers, worth
worrying about even after the Newey-West Sharpe work above, since a real
sizing/edge asymmetry is a different problem than an inflated Sharpe.

**Root-caused, not just described.** First hypothesis (narrow targets /
wide stops — a structural ladder design issue) was checked directly against
the data and was WRONG: target:stop pip ratio is ≈1.00 at nearly every
rung. The real cause, found by reading `priceBarrierTrade`
(`js/asiaFibAtlasVoteReview.js:98`): `cost` is subtracted as a FLAT amount
from every trade's `pnlPct` regardless of win/loss. Combined with near-1:1
target:stop design, this mechanically shrinks small-pip-distance winners'
edge far more (in relative terms) than it deepens losses. Confirmed
empirically by reconstructing gross (pre-cost) win/loss: gross avg
win/loss ratio ≈1.02 (essentially symmetric, as the pip ratio predicts) vs.
net (as-displayed) ratio ≈0.67 — the entire asymmetry is a transaction-cost
artifact, not a target/stop redesign issue. Average cost (~0.017%) eats
~21% of the average gross win on its own, more on the smallest rungs
(gross wins as low as 0.009–0.028% before cost).

**Lever tested**: a pure selection gate — skip trades whose gross target
move doesn't clear a minimum multiple of that pair's own round-trip cost
(`applyCostEfficiencyFilter` in `js/levelAtlasVoteReview.js`, reused
by Level Atlas's engine-agnostic trade shape). No stop repricing, no
resizing — so unlike a stop-tightening lever there's no leverage-in-disguise
question to check.

`analysis/fib_atlas_cost_efficiency_filter.mjs` — 70/30 IS/OOS freeze,
pre-stated rule: maximize IS Sharpe (chosen because the goal here is fixing
the edge itself, a different objective than the shallowest-maxDD rule used
for other levers), grid `[1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]`×cost-ratio.

| Ladder | Chosen ratio | OOS baseline Sharpe / maxDD / W:L ratio | OOS chosen Sharpe / maxDD / W:L ratio |
|---|---|---|---|
| Asia (`LADDER=asia`) | ≥3x | 6.66 / -39.24% / 0.47 | 13.64 / -14.96% / 0.67 |
| Monday (`LADDER=monday`) | ≥4x | 10.54 / -7.1% / 0.66 | 10.51 / -5.44% / 0.76 |

Asia's result is the strong one (maxDD roughly halved, Sharpe doubled);
Monday's is real but modest (Sharpe flat, maxDD meaningfully shallower) —
reported both honestly rather than leading with only the better number.

**Wired into production**: `applyCostEfficiencyFilter(trades, cost,
minCostRatio)` (new shared brick, `js/levelAtlasVoteReview.js`) → threaded
through `buildFibAtlasVotePortfolio`'s new `minCostRatio` param
(`js/fibAtlasVotePortfolio.js`, applied to each pair BEFORE the
concurrency cap since it's a pure pre-cap selection gate) → `minCostRatio`
query param on `js/asiaFibAtlasRoutes.js` and `js/mondayFibAtlasRoutes.js`'s
`/vote-trades/:instrument`, `/vote-portfolio`, and (Asia only)
`/vote-portfolio-combined` routes, mirroring the existing `stopTightenFrac`
plumbing exactly. `asia-fib-atlas-vote-portfolio.html` gets a new "Cost-
efficiency filter" checkbox (default OFF) next to "Tighten fade stop", with
the OOS numbers above in its tooltip; the ladder toggle auto-switches the
ratio sent (3x Asia, 4x Monday — combined mode reuses Asia's ratio, same
precedent as `recommendedExcludeFor` reusing Asia's exclusion set for
combined mode, since Asia is the dominant risk driver). "Load best config"
now also enables this toggle. The per-pair table's Skipped column shows a
`(+N cost)` suffix (with a tooltip) when the filter drops trades, so the
existing Decided/Kept/Skipped columns stay honestly reconciled instead of
silently not summing.

Live-verified via Playwright against a freshly-started `node server.js`
(explicitly checked no stale process was running first, after the
Newey-West investigation's own testing-hygiene lesson above): manual
toggle sends `minCostRatio=3` on Asia and `minCostRatio=4` after switching
to Monday; "Load best config" checks the box and includes `minCostRatio=3`
alongside the other validated levers; per-pair `costFilteredOut` count
reconciles correctly against `totalDecided`/`kept`/`skipped`; zero page
errors.

🟢 root cause found and confirmed empirically (not just hypothesized);
lever is a pure selection gate (no sizing/leverage question); real OOS
improvement on both ladders, strong on Asia and modest-but-real on Monday;
wired end-to-end with default-off opt-in, matching house convention. 🟡
combined-mode's ratio is NOT independently validated — it borrows Asia's
ratio by analogy to an existing precedent, not its own OOS test.

---

### Fib Atlas entry-priority ordering under the heat cap — tested, correctly NOT shipped (2026-08-30)

**The owner's own suggestion** ("could we analyse a different order to
enter the trades in the portfolio?") as a candidate fix for the same
avg-win-vs-avg-loss observation. Diagnosed first, not assumed: the merged,
margin-filtered Asia book has 857 real same-entry-timestamp contention
groups (up to 14 pairs firing at once — same Fib Atlas session-boundary
evaluation across pairs), where `applyConcurrencyCap`'s admission order
fell back to plain array order (whichever pair happened to load first) —
arbitrary, not economically motivated, exactly where a shared heat budget
gets contested.

Added a new opt-in `priorityOf` param to `applyConcurrencyCap` and
`applyPortfolioHeatCap` (`js/levelAtlasVoteReview.js`): a `trade -> number`
scorer that breaks ties ONLY among trades sharing the EXACT SAME entry
`time`, never reordering trades at different times (that would defer an
earlier trade's admission on the hope a better one shows up later — a live
system can't do that; simultaneous ties are the one case reordering is
causally free, since every candidate is already known at that instant).
`undefined`/omitted keeps today's behavior exactly — checked, zero
regression to any existing caller.

**Two candidate priority signals tested, both empirically, neither guessed:**
- **`margin`** (the natural first candidate — "prioritize higher-conviction
  trades"): confirmed a **structural no-op**. Every one of the 857
  contention groups has a UNIFORM margin across all its simultaneous
  members (margin reflects a session-wide vote shared by every pair firing
  at that instant, not a per-pair-varying score) — diffing admitted-trade
  sets at 5 heat-cap levels (1/2/3/5/10%) showed zero differing admissions
  at every level. Not a bug in the mechanism (verified correct on a
  synthetic example first) — genuinely nothing to reorder.
- **`asiaConfPips`** (the Asia-vs-previous-Asia confluence distance already
  stored per trade — `js/asiaFibAtlasVoteReview.js`'s own
  `confluenceOnly` filter treats SMALLER values as tighter/stronger
  confluence, so priority sorts ascending): does vary within 853/857
  groups and DOES change admission (195 differing trades at heatCap=1%,
  the frozen BEST_CONFIG value) — a real lever, not a no-op. But on the
  full already-validated pipeline (recommended pairs, cost-efficiency
  filter ≥3x, fade-stop-tighten 0.9x, heat cap+throttle at BEST_CONFIG),
  **IS Sharpe went DOWN** (14.83 → 14.65, `analysis/
  fib_atlas_entry_priority_backtest.mjs`). Pre-stated rule (maximize IS
  Sharpe) was not met, so — per this project's own discipline — it was
  **not** carried to OOS despite OOS happening to look slightly better
  (16.15 → 16.48); trusting a post-hoc OOS number after failing the
  pre-stated IS gate is exactly the cherry-picking this methodology exists
  to prevent.

**Not wired into the page.** No config toggle added — there is nothing
validated to expose. The `priorityOf` plumbing itself is kept (harmless,
backward-compatible, unit-tested via the two scripts above, zero
regression to `legoBricks.test.mjs`) as a real extension point should a
future, genuinely-varying, pre-outcome conviction signal turn up — but it
should not be presented as "done" beyond that.

🟢 diagnosed rigorously (contention quantified before touching code, both
candidate signals checked empirically rather than assumed to work);
mechanism built correctly and unit-verified on a synthetic case before
trusting real-data results. 🔴 the lever itself is a clean null on this
book with the two most natural signals available — reported honestly
rather than shipped anyway or reframed as a partial win.

---

### Fib Atlas trailing/continuation exit for follow-wins — validated, NOT yet wired live (2026-08-30)

**The owner's own suggestion**: "if we are trading a level which will
continue the same direction we move to, sl etc and don't close and open a
trade?" — today's `follow` trades close at a FIXED target the instant
price first touches the next rung out (`asiaFibAtlasEngine.js`'s walk
loop breaks the moment `outcome='out'` fires); nothing lets a genuinely
continuing move run further. This is the only lever tried this session
that needed a real M1 re-walk, not just reprocessing the already-built
touch JSON — the stored touch record's `mfePips`/`maePips` only cover the
excursion up through the FIRST resolution bar, nothing about what price
did afterward. Confirmed M1 bars ARE loadable in this sandbox
(`loadM1ForPair`, R2 parquet, ~25s/pair) before committing to the build —
this is cached data, not the live-OANDA fetch CLAUDE.md flags as
sandbox-blocked.

**Design (minimal-DOF, one tunable)**: applies ONLY to `decision==='follow'
&& win===true` trades — exactly "the level kept going the direction we bet
on." Fade trades and follow LOSSES are completely untouched (zero
interaction with the already-shipped fade-stop-tightening lever, which
only ever touches fade rows). From the resolution bar, walks M1 forward
tracking a trailing stop that only ever ratchets in the favorable
direction, initialized AT the original fixed-target price — so the worst
case is byte-identical to today's exit (an instant reversal loses nothing)
and the best case captures a real continuation. `givebackFrac` (how much
of the peak excursion beyond the original target gets given back before
the trail fires) is the one new tunable. Bounded to the trade's own
calendar `date` (forced close at day-end if never stopped out), keeping
every trade same-day — matches this project's existing daily-return-series
convention and avoids open-ended multi-day holds this system was never
built to carry.

**Correctness point specific to this lever**: the trail lengthens
`resolveTime` for touched trades, which the per-pair `applyConcurrencyCap`
(max 1 concurrent) must see BEFORE deciding which trades survive — the
pipeline order here is trail-first-then-concurrency-cap, the reverse of
every other lever this session, specifically so a trade the corrected
(longer) occupancy window would have blocked can't slip through on the
strength of its original (shorter) window.

`analysis/fib_atlas_trailing_continuation_backtest.mjs` — full recommended
Asia pair set, on top of the already-shipped pipeline (cost-efficiency
filter ≥3x, fade-stop-tighten 0.9x, heat cap+throttle at frozen
BEST_CONFIG). Pre-stated rule: maximize IS Sharpe. First grid
`[0.2..0.8]` picked the edge value (0.2, the tightest tested) — recognized
as this project's own "curve that never peaks" red flag and NOT trusted
without checking further, so the grid was extended down to `[0.02..0.15]`
before freezing anything. The extended run showed a genuine PLATEAU
(IS Sharpe 16.62/16.60/16.56/16.52 for 0.02/0.05/0.1/0.15 — differences
inside the Sharpe CI noise band) followed by a smooth, real decline as
giveback loosens toward 0.8 — a legitimate interior optimum region, not a
runaway hugging the search boundary.

| | IS Sharpe | OOS Sharpe | OOS maxDD | OOS avg win | OOS avg loss | OOS PF |
|---|---|---|---|---|---|---|
| baseline | 14.83 | 16.15 | -3.16% | 0.4159% | -0.5584% | 16.59 |
| giveback=0.02 (chosen) | 16.62 | 16.73 | -3.16% | 0.4667% | -0.5584% | 24.49 |

**Leverage-in-disguise check, done explicitly, not assumed**: OOS avg
loss is byte-identical (-0.5584% both) — no stop or sizing change touched
losing or fade trades, exactly as designed. OOS maxDD is also unchanged
(-3.16% both). Only avg win moved (+12.2% relative) and profit factor
improved materially (16.59 → 24.49) — real risk-neutral upside, not
leverage in disguise.

**WIRED INTO THE LIVE PAGE (2026-08-30, after an explicit go-ahead) — a
genuinely different wiring shape than every other lever this session.**
Every other validated lever (cost-efficiency filter, fade-stop-tighten,
heat cap, throttle) operates purely on the ALREADY-STORED
`{pair}-votetrades.json` at READ time — cheap enough for a request-time
query-param toggle. This lever needs M1 bars (~25s/pair to load) to
compute the trailed exit, not viable at interactive request time, so it's
split into two bricks (`js/levelAtlasVoteReview.js`):
`applyTrailingContinuation(trades, packed, {givebackFrac, cost})` runs
GENERATION-time inside each ladder's `runOne` (`js/asiaFibAtlasRoutes.js`,
`js/mondayFibAtlasRoutes.js`), off the SAME gap-filled `packed` M1 bars
already loaded for the walk (no second fetch) — bakes
`trailedPnlPct`/`trailedPnlPips`/`trailedResolveTime` onto follow-win rows
before persisting; `applyStoredContinuationExit(trades, on)` is the cheap
READ-time swap (no M1 access) wired through `buildFibAtlasVotePortfolio`
and both ladders' `/vote-trades`, `/vote-portfolio`, and (Asia)
`/vote-portfolio-combined` routes via a `continuationExit` query param,
applied BEFORE `applyConcurrencyCap` (the trailed, possibly-longer
occupancy window must be in place before that function decides survivors,
not after). `asia-fib-atlas-vote-portfolio.html` gets a default-off
"Trailing/continuation exit" toggle, included in "Load best config".

**Production regeneration — a real incident, not a clean rollout.** Wiring
this live required baking the trailed fields into every pair's stored
`{pair}-votetrades.json` (26 pairs × 2 ladders = 52 runs via
`scripts/backfill_fib_atlas_vote_trades.mjs`, each running the FULL
`asiaFibAtlasWalk`/`mondayFibAtlasWalk`, not just the trailing step —
~150s/pair for Asia, ~20s/pair for Monday). Run as ONE long-lived Node
process for all 52, it got **OOM-killed by the container's memcg** partway
through (confirmed via `dmesg`: `oom-kill` on the node PID at ~8.45GB RSS)
after 40/52 runs — accumulated per-pair M1 decode/walk memory was never
being reclaimed across pairs. The killed process's exit code, observed
through a `| tee` pipe, read as `0` (that's `tee`'s own exit code, not
node's — a real trap: **never trust a piped command's reported exit code
as the upstream command's**, check the actual process/output instead).
Diagnosed via `dmesg | grep oom`, then fixed by re-running each remaining
pair as its OWN short-lived subprocess (`node scripts/backfill_fib_atlas_
vote_trades.mjs <pair>` in a loop) so the OS fully reclaims memory between
pairs — the standard mitigation for exactly this shape of per-item memory
growth, rather than debugging the leak's source inside a long-running
process. A direct R2 coverage sweep (not log-line counting, which the
`tee`-masked exit code showed can't be trusted) caught one more gap the
first remediation pass missed (`monday-fib-atlas/audcad`, whose Monday leg
never started before the kill) before declaring done. Final state,
independently verified: **52/52 pair-ladder combinations carry trailed
fields, 0 missing, 0 stale.**

Live-verified end-to-end via Playwright against a freshly-restarted server
(restarted again after merging in an unrelated same-day `main` push that
touched `server.js`, per this session's own stale-process discipline):
the toggle works correctly with the full recommended pair set selected on
BOTH ladders, and "Load best config" enables it — zero page errors.

🟢 real, validated, honestly-checked result: strong OOS Sharpe/PF
improvement, zero leverage-in-disguise (avg loss and maxDD both
unchanged), the initial edge-of-grid pick was caught and re-tested rather
than shipped, and the extended grid confirmed a genuine plateau rather
than a runaway curve; now fully wired and live, with full, independently-
verified data coverage across every pair and both ladders. 🟡 an OOM
killed the first regeneration attempt partway through — caught via
`dmesg`, not the (misleading) reported exit code, and fully recovered
with a per-pair-subprocess remediation plus a from-scratch coverage
re-check — a real incident during this rollout, recorded here rather than
smoothed over.

**Extended to fade wins too (2026-08-30, same day) — the owner's own
follow-up question: "why have we not tested both sides of the line for
the continuation or fade?"** A fair miss — the lever above only ever
covered `decision==='follow'`, with no principled reason fade couldn't
get the same "let a genuine winner keep running" treatment.

`applyTrailingContinuation` generalized (still one function, still
backward-compatible — `decisions` defaults to `['follow']` so every
existing caller is unaffected) to accept a `decisions` list. The sign math
needed real care, not a copy-paste: fade and follow on the SAME `side` are
MIRROR IMAGES, not the same direction — a 'follow' win on `side==='above'`
runs favorably toward new HIGHS (away from the range), while a 'fade' win
on that SAME side runs favorably toward new LOWS (back toward the range).
`awaySgn` (the natural "away from range" direction implied by `side`)
now flips for fade, doesn't for follow. **Verified on synthetic bars
before trusting real data** (the same discipline used for the
entry-priority-ordering lever's synthetic check) — traced the exact
bar-by-bar arithmetic for all four `{decision, side}` combinations,
confirming each captures genuine continuation in ITS OWN correct favorable
direction, not a sign-flipped copy of another decision's.

`analysis/fib_atlas_trailing_continuation_backtest.mjs` also refactored to
IMPORT the shared brick instead of carrying its own private, now-stale
copy of the trailing-walk math (a real Lego-principle violation this
review caught and fixed, not left to drift) — and gained a `DECISION`
env var (`follow` default | `fade` | `all`) plus `LADDER` support (see
below). Same pipeline, same pre-stated rule (maximize IS Sharpe), same
70/30 split:

| DECISION | IS Sharpe (baseline→chosen) | OOS Sharpe | OOS maxDD | OOS avg win | OOS avg loss |
|---|---|---|---|---|---|
| follow only (re-run, unchanged from original) | 14.92→16.71 | 15.38→16.28 | -4.43%→-3.16% | 0.4152%→0.4677% | -0.5578% both |
| fade only (new) | 14.92→17.14 | 15.38→16.33 | -4.43%→-2.65% | 0.4152%→0.5084% | -0.5578%→-0.558% |
| both together (new, one shared giveback) | 14.92→17.12 | 15.38→16.05 | -4.43%→-2.64% | 0.4152%→0.5146% | -0.5578%→-0.558% |

Fade's own IS fraction grid is a genuine, non-edge-of-search PLATEAU
(17.09–17.14 across nearly the entire giveback range 0.02–0.5, only
declining at the loosest values tested) — a different, arguably even more
robust shape than follow's own sharper peak-then-decay curve, and not
sensitive to the exact giveback chosen. Leverage-in-disguise check done
the same way as follow's: avg loss essentially untouched throughout (this
lever never touches `stopPips`, so it doesn't interact with
`riskAdjustTrades`' per-trade sizing the way the SL-tightening levers do
— see the correction entry above).

**`LADDER` support added the same pass — closing a real gap this review
found, not just adding fade.** The original follow-only script had NO
`LADDER` env var (hardcoded to Asia's own R2 prefix), which meant an
earlier wiring comment in `js/mondayFibAtlasRoutes.js` claiming the
follow lever was **"validated for Monday too"** was never actually true —
it had simply never been run there. Caught while reading that comment for
this fade extension, fixed by adding real `LADDER=asia|monday` support
(mirroring `fib_atlas_sl_tightening_backtest.mjs`'s own pattern — Monday
gets no pair exclusion, per its own failed exclusion study, and no frozen
heat-cap/throttle, since `BEST_BY_LADDER.monday` stays `null` rather than
silently borrowing Asia's) and actually running `LADDER=monday
DECISION=all`: OOS Sharpe 11.54→12.05, maxDD -3.3%→-2.79%, avg win
+10.3%, avg loss unchanged — genuinely positive, the same shape as Asia
though more modest. The false comment is now corrected in place.

**Wired into production, both decisions, both ladders**: `js/asiaFibAtlasRoutes.js`
and `js/mondayFibAtlasRoutes.js`'s `runOne` now call
`applyTrailingContinuation(..., { cost, decisions: ['fade', 'follow'] })`
(giveback still 0.02, the brick's own default — chosen because it's
simultaneously follow's own IS-optimal value AND squarely inside fade's
flat plateau, so one shared value serves both well rather than being a
compromise). The page's own toggle (`asia-fib-atlas-vote-portfolio.html`)
relabeled "Trailing/continuation exit (both sides)" with the updated
numbers in its tooltip — no new checkbox, no new query param, the
EXISTING `continuationExit` toggle now just does more because the
underlying stored data carries trailed fields for both decisions. All 52
pair-ladder combinations regenerated again (same per-pair-subprocess
approach the OOM incident above taught, applied from the start this time
— see this entry's own commit for the coverage re-verification).

🟢 a fair question, answered properly rather than defensively: real,
positive OOS result on fade (arguably the more robust of the two shapes —
a genuine plateau, not a sharp peak), a genuinely different-signed sign
computation verified correct on synthetic data before trusting it on
real prices, a private-code duplication caught and fixed while already in
the file, AND a previously-unnoticed FALSE "validated for Monday"
claim caught and corrected rather than left standing. 🟡 the single
shared `givebackFrac=0.02` is a good value for both decisions on Asia
specifically (verified); Monday was validated with `DECISION=all` only
(not fade-alone or follow-alone in isolation there), which is what
actually ships, so that's not a gap — flagging only that Monday's
per-decision breakdown, unlike Asia's, wasn't separately examined.

---

### Net exposure cap for Fib Atlas — a real bug fix, then a clean null (2026-08-31)

Direct follow-up to "any other ideas for reducing drawdown" — this book's
own worst-drawdown finding (§ above, `applyDrawdownThrottle`'s own build
history) was a **19-day CORRELATED losing stretch across pairs** (win
rate 45.5% vs 58.9% overall), not concurrent-position pile-up. The
existing `applyPortfolioHeatCap` sums GROSS risk regardless of direction
— a long EURUSD + long USDCHF (partially hedged: +EUR-USD and +USD-CHF
net close to zero USD exposure) costs the same budget as long USDJPY +
long USDCHF (+USD twice, real doubled exposure); it can't tell a hedge
from a stack. `applyExposureCap`/`tradeFactors` (`js/levelAtlasVoteReview.js`)
already exist for exactly this — built earlier for Level Atlas, never
tried on Fib Atlas before now.

**Real bug found and fixed before trusting any result, not after.**
`applyExposureCap`'s direction sign comes from `betDirection(t)`, which
checked `t.side === 'up'` — but Fib Atlas trades carry `side:
'above'|'below'`, never the literal string `'up'`. Every Fib Atlas
trade's computed long/short direction was silently WRONG before this fix
— it depended only on `decision` (fade always resolved 'long', follow
always 'short'), completely ignoring which side of the range the touch
was actually on. This wasn't caught by any earlier lever this session
because none of them needed trade DIRECTION — cost-efficiency, stop-
tightening, trailing-exit, entry-priority, heat cap and throttle are all
direction-blind. `betDirection` now recognizes 'above' as Level Atlas's
'up' and 'below' as 'down' (structurally the same "which way is outward"
concept); Level Atlas's own 'up'/'down' behavior is completely
unchanged since it never sends 'above'/'below'. New unit tests
(`js/levelAtlasVoteReview.test.mjs` T21) assert all four
`{decision, side}` combinations resolve to the correct direction for
BOTH engines' vocabularies, not just Level Atlas's.

**The test itself, once the bug was fixed, came back a clean null on
both ladders.** `analysis/fib_atlas_exposure_cap_backtest.mjs` — full
already-shipped pipeline (recommended pairs, cost-efficiency filter,
fade-stop-tighten with `preserveSizing:true`, heat cap + throttle at
frozen BEST_CONFIG where one exists), exposure cap applied BEFORE the
heat cap (finer, direction-aware gate first), pre-stated rule (among cap
values with lower IS maxDD than baseline, the highest IS Sharpe), 70/30
split, swept `[0.5, 0.75, 1, 1.5, 2, 3, 5]%`:

- **Asia**: every tested cap either makes maxDD WORSE (tighter than
  ~1%: IS maxDD -4.59%→-5.43% at 0.5%, Sharpe also drops 14.81→14.1) or
  is a near no-op (looser than ~1.5%: <50 of 12,675 trades ever skipped).
  No cap cleared the pre-stated bar — nothing frozen for OOS.
- **Monday**: identical shape — tighter caps cost both Sharpe and maxDD
  (12.08→11.63 Sharpe, -3.71%→-4.1% maxDD at 0.5%), looser caps are a
  near no-op. Same null.

**Not a broken or vacuous test** — the mechanism genuinely engages (14-19%
of trades skipped at the tighter cap levels on both ladders), it just
doesn't help. Plausible read, not confirmed further: Asia's own frozen
heat cap (1% simultaneous exposure, effectively ≤2 concurrent 0.5%-risk
positions) is ALREADY tight enough that there's little room left for a
direction-aware refinement to add value — the coarser gross-risk cap is
already doing most of the useful work at that tightness. Monday has no
heat cap at all yet shows the identical null shape, which cuts against
that specific explanation and wasn't chased further (would need its own
investigation, not assumed).

🟢 the bug fix is real, independently valuable regardless of this test's
outcome (any FUTURE Fib Atlas consumer of `betDirection`/`tradeFactors`/
`applyExposureCap`, or of `applyConcurrencyCap`'s `perDirection` mode,
would have silently gotten wrong signs before this), caught by reading
the function against real data rather than trusting a generic-looking
signature. 🔴 the drawdown-reduction hypothesis itself is a clean, honest
null on both ladders — reported as such, not reframed as a partial win.
Two other drawdown-reduction bricks flagged in the same conversation
(`applyCurrencyLossGate`, `applyNewsProximityThrottle`) remain untested
for Fib Atlas.

---

### Chandelier (ATR-trailed) continuation exit for Fib Atlas — a real drawdown win, analysis-only (2026-08-31)

Direct follow-up to "did we have a reduction in drawdown from [the
exposure cap]? if not let's test something else? did we ever test ...
instead of closing a trade at tp we move to breakeven and then trade
from chandelier effect to see if actually we can catch runners? this
may mean we have multiple trades open at once on a pair so interested
in analysis first?" — the exposure cap was a clean null (§ above), so
this is "something else": a genuinely different trail SHAPE, plus the
concurrency question asked explicitly, tested as **analysis before any
implementation** per the owner's own request.

**Why the already-shipped trailing exit couldn't answer this.**
`applyTrailingContinuation`'s `trailMode:'giveback'` (live at
givebackFrac=0.02) gives back a FIXED FRACTION of the excursion made so
far — found this session to exit almost immediately on any pullback
(median hold-time extension ~0 across 17,399 kept Asia trades, max
~2min). It structurally never held a trade long enough to create a
"second trade wants to open on this pair" scenario, so the concurrency
question was moot for it — a genuinely wider, volatility-aware trail
was needed to test it for real.

**Built:** `applyTrailingContinuation` (`js/levelAtlasVoteReview.js`)
gains `trailMode:'chandelier'` (default stays `'giveback'`, fully
backward-compatible — zero behavior change for every existing caller,
proven by a bit-identical-output unit test). Trails
`chandelierMult` × a rolling ATR (Wilder EMA, `chandelierPeriod` M1
bars — default 60, not yet independently swept) behind the running
extreme, instead of a fixed fraction of the excursion. Reuses
`trueRange` (`indicatorCore.js`) for the true-range primitive; the
Wilder-EMA smoothing loop is re-expressed against this file's packed
PARALLEL-ARRAY format (`rollingATR`) rather than `atrWilder`'s bar-
OBJECT array — same math, the established array-vs-object split this
file's M1 hot path already uses (`barUtils.js`'s own convention), not a
second copy to drift from. Same floor (never worse than the original
fixed exit) and day-boundary forced close as giveback mode. New unit
tests (`js/levelAtlasVoteReview.test.mjs` T23, hand-built M1 path):
chandelier survives a pullback giveback mode can't and stays open
materially longer, still respects decisions/win-only filtering, and the
untouched giveback default is bit-identical to before this param
existed.

**`analysis/fib_atlas_chandelier_exit_backtest.mjs`** — full
already-shipped pipeline (cost-efficiency filter, fade-stop-tighten with
`preserveSizing:true`, heat cap + throttle at frozen BEST_CONFIG),
`decisions:['fade','follow']` (matches production's both-sides
trailing exit), swept `chandelierMult ∈ [1.5, 2, 3, 4, 5]`, pre-stated
rule (maximize IS Sharpe, must beat baseline), 70/30 IS/OOS freeze,
Asia only so far:

- **IS**: baseline Sharpe 14.81 → mult=3 (chosen) Sharpe 19.75, maxDD
  -4.59%→-3.29%, avgWin 0.41%→0.62%, avgLoss -0.5454%→-0.5477%
  (essentially flat).
- **OOS (frozen from IS, unchanged)**: baseline Sharpe 15.33 → mult=3
  Sharpe **19.47** (real improvement holds out of sample), maxDD
  **-4.51%→-2.43%** (nearly HALVED), CAGR(add.) 427.72%→786.02%. avgLoss
  -0.5354%→-0.5383% (still essentially flat) — **leverage-in-disguise
  check passes cleanly**: this lever only ever touches WINNING trades'
  exit, never `stopPips` or sizing, and the OOS numbers confirm it
  didn't quietly become one.
- **Hold-time extension** (mult=3, winners the chandelier actually
  extended): n=9974, p10=3min, median=13min, p75=25min, p90=43min,
  max=170min (2.8hr) — a real, materially longer hold than giveback
  mode's near-zero extension, genuinely riding continuations rather
  than exiting on the first tick of noise.

**"Analysis first" — both concurrency models tested at the frozen exit,
answering the owner's explicit question, nothing wired in yet.**
`applyConcurrencyCap`'s own existing `maxConcurrent` parameter (no new
mechanism) run at 1 ("blocked" — today's production default, a later
same-pair signal is skipped while the chandelier-held trade is still
open) vs 2 ("stacking" — a second trade may open while it's still
open):

| | IS Sharpe | IS maxDD | OOS Sharpe | OOS maxDD | OOS trades |
|---|---|---|---|---|---|
| blocked (concur=1) | 19.75 | -3.29% | 19.47 | -2.43% | 3711 |
| stacking (concur=2) | 21.39 | -3.04% | 20.93 | **-1.93%** | 4038 |

Stacking wins on every axis, IS **and** OOS, on top of the already-real
chandelier improvement: higher Sharpe, shallower maxDD, +327 genuinely
new OOS trades the blocked model was refusing outright — avgWin/avgLoss
essentially unchanged between the two (0.5951%/-0.5383% vs
0.5957%/-0.5387%), confirming this is purely "take more of the same
trades", not a risk-shape change.

🟢 **this is a real, OOS-validated result, not a null** — first genuine
drawdown improvement found in this session's whole drawdown-reduction
thread (net exposure cap and, earlier, the SL-tightening isolation study
were both clean/near-nulls on maxDD specifically). 🟡 **deliberately NOT
wired into production yet** — the owner asked for the concurrency
analysis BEFORE any implementation decision, and moving to
`maxConcurrent:2` is architecturally significant (interacts with the
frozen heat cap's own budget semantics, which was tuned against
`maxConcurrent:1`; the live page's per-pair occupancy assumptions;
Monday ladder untested). Open before wiring: (1) re-validate
`chandelierPeriod` itself (currently fixed at 60, not gridded — only
`chandelierMult` was swept); (2) re-tune/re-validate the heat cap
against `maxConcurrent:2`'s different occupancy pattern rather than
reusing the `maxConcurrent:1`-tuned `BEST_CONFIG` as-is; (3) run the
same study on the Monday ladder before assuming it transfers.

**Monday ladder: same shape, smaller magnitude (2026-08-31).**
`fib_atlas_chandelier_exit_backtest.mjs`, identical pipeline/rule,
Monday's OWN pair set (no exclusion — its own pair-selection study
failed OOS, see § above), 26 constituents:

- **IS**: baseline Sharpe 12.08 → mult=1.5 (chosen — Monday's own
  optimum is a much TIGHTER trail than Asia's mult=3, its noise
  character differs) Sharpe 13.11, maxDD -3.71%→-3.61%.
- **OOS**: baseline Sharpe 11.39 → mult=1.5 Sharpe **12.85**, maxDD
  **-3.11%→-2.57%** (real, ~17% relative reduction — smaller than
  Asia's ~46%, but real). avgLoss OOS -0.4973%→-0.4973% — **identical
  to four decimal places**, the cleanest leverage-in-disguise pass yet.
- **Hold-time extension** (mult=1.5): n=1737, median=3min, p90=10min,
  max=62min — much shorter than Asia's (median=13min, p90=43min),
  consistent with the tighter chosen mult.
- **Stacking** (maxConcurrent=2) on top: IS Sharpe 13.11→13.92, maxDD
  -3.61%→-3.13%, trades 4483→5814; OOS Sharpe 12.85→**14.48**, maxDD
  -2.57%→**-1.93%**, trades 1647→2141 (+494). Same direction as Asia
  on every axis.

Both ladders now have independent OOS footing for the chandelier exit
and for stacking on top of it — the next step (below) is reviewing
whether the EXISTING heat cap still earns its keep once both are running.

### Heat-cap platform review for chandelier + stacking (2026-08-31) — a real pre-existing bug, and the heat cap goes from helping to redundant-or-harmful

Direct follow-up to "do monday then we have a good footing for the
chandelier then we can review as a platform the heat cap and wire into
production" — Monday done (above), this is the heat-cap review, run on
`analysis/fib_atlas_best_config_backtest.mjs` (the SAME script that
originally froze the currently-shipped `BEST_BY_LADDER.asia`), extended
with `CHANDELIER=1`/`MAX_CONCURRENT` knobs rather than a second copy.

**Real, pre-existing bug found and fixed before trusting any refit.**
`fib_atlas_best_config_backtest.mjs` never imported or applied
`applyCostEfficiencyFilter` — the already-validated, PRODUCTION-LIVE
filter from 2026-08-30 (§ above) — at all. Caught by comparing this
script's Asia trade count against `fib_atlas_chandelier_exit_backtest.mjs`'s
on the identical pair set (30,805 vs 17,399) rather than assuming the
bigger number was fine. This means the CURRENTLY-SHIPPED
`BEST_BY_LADDER.asia` (heatCap=1%, trigger=-3, mult=0.25) was fit on a
trade universe production no longer runs. Fixed (import +
`MIN_COST_RATIO=3`, matching every other Fib Atlas script this
session) and re-run before anything else in this entry.

**Step 1 — re-fit TODAY's exit (no chandelier) on the corrected
pipeline, to check the currently-shipped config still holds on its own
terms.** Asia: same config re-chosen (heatCap=1%, trigger=-3,
mult=0.25) — the bug didn't change WHICH config wins. But **OOS maxDD
is worse with the cap than without it**: baseline -4.07% → capped
**-4.51%** (Sharpe improves 14.96→15.33, trades drop 4724→4012). Same
shape as the exposure-cap null (§ above) — the drawdown-reduction case
for TODAY's shipped Asia heat cap does not actually hold up OOS, on
the corrected pipeline, independent of any chandelier work. Monday
(which has never had a frozen heat cap) shows the opposite: baseline
OOS maxDD -3.11% → capped **-2.73%**, a real improvement (Sharpe drops
11.39→10.47, trades 1654→1389) — heat-cap OOS behavior is not uniform
across ladders even under the unchanged exit.

**Step 2 — re-fit the SAME grid on the chandelier + stacking pipeline
(`CHANDELIER=1 MAX_CONCURRENT=2`, each ladder's own frozen mult),
replicated on BOTH ladders:**

| | IS maxDD, no cap | 1% cap | 2% cap | 3%/5% cap | Chosen | OOS: no cap | OOS: chosen |
|---|---|---|---|---|---|---|---|
| Asia | -2.88% | -3.04% (worse) | -3.38% (worse) | -2.88% (no-op) | cap=3% | -3.1% | -3.1% (identical) |
| Monday | -3.13% | -3.25% (worse) | -3.13% (tie) | -3.13% (no-op) | cap=2% | -1.93% | -1.93% (identical) |

**No tested heat cap improves drawdown on either ladder once
chandelier+stacking is running.** Tight caps (1%, sometimes 2%) make
IS maxDD WORSE; looser caps are exact no-ops; whichever the pre-stated
rule picks, OOS maxDD comes back bit-for-bit IDENTICAL to no cap at
all, on both ladders independently. The drawdown-throttle trigger
(-3%) baked into every grid cell also never fires in either ladder's
series post-chandelier+stacking — the book no longer dips deep enough
to trip it.

**Read:** the heat cap's original job — capping correlated/pile-up
risk — now appears to already be happening at the exit/concurrency
layer itself: the ATR-aware trail cuts real losers' hold time less
than winners' (leverage-in-disguise check stayed clean throughout),
and stacking admits genuinely diversifying second positions rather
than blindly refusing by raw count. A mechanism built to solve a
problem the new pipeline no longer has isn't a bug to fix — it's
redundant, and at tight settings actively counter-productive. Replicated
independently on both ladders, not one lucky slice.

🟢 the cost-efficiency-filter bug fix is real and independently
valuable (the frozen production heat cap was validated against a
trade set production doesn't actually run). 🟢 chandelier+stacking's
own drawdown improvement (§ above) is confirmed to NOT depend on the
heat cap doing any of the work — it holds with the cap entirely absent.
🟡 **recommendation, not yet wired**: when moving chandelier+stacking to
production, do NOT carry `BEST_BY_LADDER.asia`'s heat cap forward
unchanged — either drop it or loosen it well past the point where it
binds (e.g. 5%+), since tightening it now costs drawdown it used to
save. The drawdown throttle can stay as a dormant tail-risk backstop
(it costs nothing when it never fires) but its own value under this
pipeline is unconfirmed, not proven.

### CORRECTION: "stacking" was a real duplicate-counting bug, not a genuine improvement (2026-08-31)

The chandelier+stacking work above was wired into production, then the
owner spotted an unbelievable live result on the portfolio page (PF
133.53, 94.1% win rate, 7186.7% non-compounded annual return) and
pushed back hard rather than accepting it — exactly right. Auditing it
found a real bug, plus a second, separate false alarm along the way;
both are recorded honestly below.

**The real bug: "stacking" was counting one market move as two trades.**
`maxConcurrent=2` was tested with `perDirection:false` (the default),
which allows TWO SAME-DIRECTION positions on one pair at once. In
practice: two adjacent fib rungs touched minutes apart during the SAME
real continuation both survived the cap, and because the chandelier
exit extends both to ride the SAME underlying move, they resolved at
the IDENTICAL timestamp with the IDENTICAL `pnlPct` — one real market
event, paid out as two independently-sized (0.5% risk each) trades.
Quantified directly on the live Asia "best config" pull before any fix:
**4,534 (pair, resolveTime) groups had 2+ trades; the "extra" (2nd+)
trades in those groups contributed 27.1% of total win PnL.** That's the
single largest driver of the inflated headline numbers — not the
chandelier exit itself, and not a chandelier-only defect (the SAME
mechanism would apply to any wide, extendable exit combined with
same-direction stacking).

**The fix**: `applyConcurrencyCap`'s existing `perDirection:true` option
(already built for Level Atlas, unmodified here) tracks long/short
budgets SEPARATELY — at `maxConcurrent:1`, that means at most 1 long
AND 1 short per pair simultaneously (a genuine hedge is still allowed)
but same-direction pyramiding is now STRUCTURALLY impossible, not just
discouraged. `analysis/fib_atlas_chandelier_exit_backtest.mjs`'s STEP 3
was rewritten around a `duplicateContamination()` diagnostic that
re-measures the same (pair, resolveTime) collision rate on every run,
so the fix is proven each time, not just asserted once:

| | OOS duplicate trades | % of win PnL |
|---|---|---|
| Asia, ORIGINAL (maxConcurrent=2, perDirection=false) | — | **27.1%** (live pull) |
| Asia, FIXED (maxConcurrent=1, perDirection=true, "hedgeOnly") | 71/4,578 | **1.37%** |
| Monday, FIXED (same) | 16/1,664 | **1.42%** |

**Re-tested, corrected OOS numbers, chandelier exit's own frozen mult, full IS/OOS discipline:**

| | Asia OOS Sharpe | Asia maxDD | Monday OOS Sharpe | Monday maxDD |
|---|---|---|---|---|
| blocked (maxConcurrent=1, no hedge) | 19.47 | -2.43% | 12.85 | -2.57% |
| hedgeOnly (the fix) | 19.49 | -2.43% | 13.07 | -2.57% |
| OOS trades gained by allowing a hedge | +4 (3711→3715) | | +17 (1647→1664) | |

**Second finding along the way: the earlier "stacking beats blocked"
result was almost entirely the bug, not a real effect.** Once corrected,
hedge-only is statistically indistinguishable from plain blocked on
both ladders (Sharpe moves by ~0.02-0.2, trade count moves by single
digits to tens). Shipped anyway since it's free — zero downside, the
tiny genuine-hedge upside — but the story is now "stacking doesn't
meaningfully help," not "stacking is a further OOS win," which is what
was reported before this correction.

**A second scare that was NOT a bug — recorded so it isn't re-litigated.**
Before finding the above, the owner also asked to verify parameter-sweep
methodology (~10 levers this session, all effectively validated against
overlapping windows of the SAME 70/30 calendar split — a real, still-open
multi-testing risk, see the note left in this file for whoever picks
that up next) and cross-pair correlation in the win-rate sample
(same-day, same-direction trades across correlated pairs pooled as if
independent). Both were checked with real numbers: same-day cross-pair
overdispersion measured only 1.14x (modest, not dramatic); the
day-level "94.1% win rate" badge on the dashboard was separately found
to be a DIFFERENT statistic than per-trade win rate (day-level = fraction
of trading days the whole pooled portfolio closed net positive; true
per-trade win rate is ~72%) — a metric-labeling confusion on this
session's own part, corrected in conversation, not a data problem.
Separately, an apparent core-engine anomaly (69.6% per-trade win rate
when the target is FARTHER than the stop — geometrically it should be
well under 50% with no edge) survived four independent falsification
attempts (same-bar look-ahead, inner/outer rung mislabeling, one-trend-
sliced-into-many-trades, pair-specific bad data) and held STABLE across
5 independent, non-overlapping ~1-year chunks of 2021-2026 history
(66-72% every year, including the earliest year that predates this
whole session and the most recent year past nearly every lever's own
tuning cutoff) — current read: probably a genuine, structurally
persistent momentum characteristic of fib-touch events (a touch can
only happen by having just crossed the prior rung, so touches are
inherently momentum-conditioned), not a bug, though the exact mechanism
was never pinned down and this is not 100% certain.

🟢 the duplicate-counting bug was real, is now fixed, and the fix is
self-verifying (`duplicateContamination()` reruns the check every time,
not a one-off manual audit). 🟢 the corrected numbers (Asia OOS Sharpe
19.47/19.49, Monday 12.85/13.07 — chandelier's own real, unchanged win)
are believable in a way PF 133 / 94.1% never was. 🔴 do not trust the
absolute PF (still 42 on Asia, 11 on Monday in the corrected live pull —
elevated, plausible given the robustness-tested touch-momentum effect,
but still not validated as tradeable at that magnitude) or Sharpe as
real-world expectancy; trust the DIRECTION. 🟡 the ~10-lever
same-overlapping-OOS-window multi-testing risk from the parameter-sweep
audit remains genuinely open — not fixed by this correction, and worth
a dedicated pass (e.g. a fresh walk-forward re-validation of the FULL
stacked pipeline, not lever-by-lever) before trusting this book much
further.

### Follow-up: walk-forward validation of the chandelierMult choice (2026-08-31)

Direct answer to "is the ~10-lever OOS-overlap risk actually still the
reason for the false numbers, and does chasing it change the config?"
No on the first (the false numbers were the duplicate-counting bug
above, fully explained and fixed) — but the owner asked to chase the
overlap risk anyway to see if it changes anything, specifically for the
chandelier exit (the newest, highest-leverage, most-recently-chosen
parameter, picked last after seeing many other levers' own OOS results
on the same shared window).

**Method** (`analysis/fib_atlas_chandelier_walkforward.mjs`, new): a
single 70/30 split only shows whether ONE split likes a choice; it
can't distinguish a real, stable edge from a choice that fits one
specific stretch. A walk-forward with 3 independent, non-overlapping,
EXPANDING-window folds can — each fold re-picks chandelierMult fresh
from its OWN fit-only slice (never reusing an earlier fold's choice or
peeking at its own test window), so a mult that wins across genuinely
different chunks of history is real evidence, not a repeat of the same
question.

**Result: perfectly stable on both ladders.**

| | Fold 1 | Fold 2 | Fold 3 | Shipped |
|---|---|---|---|---|
| Asia chosen mult | 3 | 3 | 3 | 3 |
| Monday chosen mult | 1.5 | 1.5 | 1.5 | 1.5 |

Every fold, on both ladders, independently re-derived the SAME mult
already shipped — no fold ever disagreed. OOS improvement was also
consistent across every fold (not just the specific split everyone
happened to share), e.g. Asia: baseline Sharpe 13.15/15.86/14.74 across
the 3 folds' own test windows → mult=3 Sharpe 19.95/20.06/19.96 every
time, maxDD improving in all 3; Monday: baseline Sharpe
11.52/12.06/11.33 → mult=1.5 Sharpe 12.91/13.45/12.83 every time.

🟢 the chandelierMult choice itself is NOT an artifact of the one
shared 70/30 split — it independently re-emerges from 3 genuinely
different, non-overlapping historical stretches on both ladders. This
is real evidence against the specific overfitting worry that prompted
the check. 🟡 this only tests ONE parameter (chandelierMult) at the
concurrency=blocked setting — it does not re-validate the other ~9
levers (cost-efficiency ratio, stop-tighten fraction, pair-selection
exclusion, etc.) the same way, so the broader "many levers, one shared
window" methodology risk is narrowed, not fully closed. The pattern
(`fib_atlas_chandelier_walkforward.mjs`) is reusable for any other
single-parameter lever that's worth the same check.

### Follow-up 2: walk-forward on the 3 remaining single-split levers — one real finding (2026-08-31)

Direct continuation of the above, prompted by the owner asking "are you
comfortable this backtest is ready to become a live bot?" — answer was
no, specifically because most levers were still only single-split
validated. This closes 3 more of them
(`analysis/fib_atlas_remaining_levers_walkforward.mjs`, Asia, same 3
expanding-window folds as the chandelierMult check, same rule: re-derive
each lever fresh from ONLY that fold's fit data, chandelierMult held
fixed at the already-validated 3):

| Lever | Shipped | Fold 1 | Fold 2 | Fold 3 | Verdict |
|---|---|---|---|---|---|
| Cost-efficiency ratio | 3 | 3 | **1** | **1** | 🔴 NOT stable |
| Stop-tighten fraction | 0.9 | 0.75 | 0.75 | 0.75 | 🟡 stable, but **≠ shipped** |
| Concurrency mode | hedgeOnly | hedgeOnly | hedgeOnly | hedgeOnly | 🟢 confirmed stable |

**Concurrency mode (hedgeOnly): now genuinely confirmed**, not just
"statistically indistinguishable" on the one split — every fold
independently re-picked it, by the same razor-thin margin each time
(fit Sharpe +0.01 to +0.02 over blocked). No change needed.

**Cost-efficiency ratio=3: the real finding, and it's not comfortable.**
Ratio=1 is a no-op (`applyCostEfficiencyFilter` returns trades unchanged
for minCostRatio<=1 — see its own doc) — so folds 2 and 3 are saying
"no filter at all" beat the shipped 3x filter on FIT data, and the gap
carries into OOS too: fold 2's shipped(3) OOS Sharpe 17.66 vs the
fold's own honestly-chosen ratio=1 OOS Sharpe 19.32; fold 3's shipped(3)
18.37 vs ratio=1's 20.86. Only fold 1 (the earliest, shortest-history
fold) still preferred 3, and even there the margin over ratio=1 is thin
(fit Sharpe 17.51 vs 16.75). The original single-split finding that
picked 3x was real for ITS split, but does not generalize — this reads
as the ratio=3 threshold being fit to a specific stretch, not a stable
characteristic of the cost-efficiency logic itself (that logic's own
premise — flat cost eats small-distance wins disproportionately — is
still probably true; the SPECIFIC 3x cutoff is what doesn't hold up).
**Not shipped as a fix yet — flagging for the owner's call**: loosen the
ratio, drop the filter, or re-derive it as a genuinely time-varying/
per-pair threshold instead of one fixed global multiple.

**Stop-tighten fraction: walk-forward's answer (0.75) differs from
shipped (0.9), consistently.** Every fold independently chose 0.75 over
0.9 from fit-only data — a real, stable disagreement with the shipped
value, not a coin-flip. OOS is more mixed than the "stable" label alone
suggests: frac=0.75 beat shipped(0.9) OOS Sharpe in folds 1-2 (19.00 vs
18.87; 18.05 vs 17.66) but shipped(0.9) narrowly won fold 3 (18.37 vs
17.94). Net read: 0.75 is the more defensible fit-derived choice and
performs at least comparably OOS everywhere it was checked — worth
updating, but the practical difference between 0.75 and 0.9 here is
modest (Sharpe moves by ~0.1-0.4 either direction), unlike the
cost-ratio finding above which is the one that actually changes the
"is this ready for capital" answer.

🔴 **Net effect on the ~10-lever OOS-overlap risk** (as first read, before
the correction below): narrowed further but not closed, cost-efficiency
ratio a genuine red flag.

### CORRECTION: the cost-ratio "red flag" and the stop-frac "≠ shipped" finding were both a selection-metric bug, not real findings (2026-08-31)

Both findings above were reached by picking each fold's "winner" via the
DAY-POOLED portfolio Sharpe (`statsFor`'s `.sharpe`, from
`portfolioStats(dailyReturns)`) — the exact metric this session's
dashboard fixes (2026-08-31, the Sharpe-de-inflation PRs) exist to warn
is a different, easily-inflated basis from per-trade edge. Re-ran both
levers as a pooled-OOS head-to-head (`analysis/fib_atlas_cost_ratio_
pooled_oos.mjs`, `fib_atlas_stopfrac_pooled_oos.mjs` — every candidate
value run on ALL 3 folds' own test-only windows, pooled into one
~60%-of-history OOS track record, checked on BOTH the day-pooled basis
AND the per-trade basis via `summarizeTrades`, same brick as the
dashboard's per-trade card) before trusting either conclusion.

**Cost-efficiency ratio — the two bases give OPPOSITE answers, and
per-trade is the one that matters:**

| Ratio | Trades | Day-pooled Sharpe | Per-trade PF | Per-trade Sharpe (raw) |
|---|---|---|---|---|
| 1 (no filter) | 16,041 | **20.55** | 2.77 | 0.455 |
| 1.5 | 14,492 | 20.09 | 2.84 | 0.468 |
| 2 | 13,103 | 19.38 | 2.86 | 0.471 |
| 2.5 | 11,787 | 18.59 | 2.91 | 0.478 |
| **3 (shipped)** | 10,405 | 18.20 | **2.96** | **0.488** |

Day-pooled Sharpe falls monotonically as the filter tightens; per-trade
PF and raw Sharpe RISE monotonically, same direction as the original
single-split study's premise (flat cost eats small-distance wins
disproportionately) and the SAME direction all the way to ratio=3.
Mechanism: cost-ratio changes trade COUNT (fewer, choosier trades at
higher ratios) — dropping the filter adds ~5,600 more, genuinely
thinner-edge trades, which smooths the daily return series and inflates
the day-pooled number even though each individual trade got worse, not
better. 🟢 **ratio=3 is the best of the values tested on the metric that
actually reflects each trade's own quality — the "NOT stable" verdict
above is retracted.** Not run past ratio=3 in this pooled form yet (the
original per-fold walk-forward's fit tables showed day-pooled Sharpe
falling sharply above ratio=4 from trade count alone; whether per-trade
edge keeps climbing past 3 is untested and would be a legitimate
follow-up, not a red flag).

**Stop-tighten fraction — no reversal, both bases roughly agree, shipped
value holds up:**

| Fraction | Day-pooled Sharpe | Per-trade PF | Per-trade Sharpe (raw) | Win rate |
|---|---|---|---|---|
| 1.0 (off) | 17.89 | 2.76 | 0.461 | 73.1% |
| **0.9 (shipped)** | 18.20 | **2.956** | **0.488** | 72.3% |
| 0.75 | 18.27 | 2.960 | 0.484 | 70.7% |
| 0.6 | **18.34** | 2.91 | 0.469 | 68.0% |
| 0.5 | 18.21 | 2.90 | 0.461 | 66.0% |
| 0.4 | 17.82 | 2.90 | 0.450 | 63.5% |
| 0.25 | 16.98 | 2.89 | 0.429 | 58.2% |

Unlike the cost ratio, tightening a fade stop only REPRICES existing
losing trades (same trade, cut earlier) — trade count is IDENTICAL
(10,405) at every fraction, so the count-driven smoothing mechanism
above can't apply, and indeed it doesn't: both bases show the same
shape, an interior optimum around 0.6-0.9, not a boundary effect. 0.9
and 0.75 are a near-exact tie on both bases (day-pooled 18.20 vs 18.27;
per-trade PF 2.956 vs 2.960; raw Sharpe 0.488 vs 0.484 — all well inside
each other's noise band, nowhere close to the CI widths seen throughout
this session's walk-forward work). 🟢 **0.9 is not beaten by a
non-trivial margin on either basis — no change warranted** (Lego
Principle 5: a change only wins if it clears the incumbent by a real
OOS margin; 0.75 doesn't).

**Corrected summary**: all 3 of these remaining levers now hold up once
checked on the metric that actually matters — the earlier "problems"
were both artifacts of one shared selection-metric bug (day-pooled
Sharpe used to pick a per-fold "winner"), not real issues with the
shipped config. Cost-efficiency ratio and stop-tighten fraction are both
now genuinely re-validated, on top of chandelierMult and concurrency
mode from the earlier follow-ups. Still outstanding: pair-selection
exclusion set (not yet walk-forward-checked at all).

### Follow-up 3: same corrected check extended to Monday and COMBINED — the mode the owner will actually trade (2026-08-31)

The above was Asia-only. Direct owner ask: "asia, monday and then both,
as I imagine both is what I will trade and both is where all the high
numbers are coming from." Found first, by reading the shipped code
rather than assuming: `costRatioFor(ladder)` sends **4x for Monday**,
not 3x — a value never touched by the Asia-only corrections above — and
combined mode sends **Asia's 3x uniformly to both ladders' legs**
(confirmed in `asiaFibAtlasRoutes.js`'s `/vote-portfolio-combined`:
`minCostRatio` is ONE global param, no per-ladder branch — the client's
own comment already flags this as "NOT independently validated").
`chandelierMult` is NOT affected — it's baked into each stored trade at
generation time per ladder (3 Asia / 1.5 Monday), so combined mode
already applies the right mult per leg regardless of the request-level
params; only cost-ratio/stop-frac ride on one shared value.

`analysis/fib_atlas_full_config_pooled_oos.mjs` (new — generalizes the
day-pooled + per-trade pooled-OOS method to `LADDER=asia|monday|combined`;
combined loads BOTH ladders' data per pair as separate constituents
`PAIR_ASIA`/`PAIR_MONDAY`, matching the live route exactly), wider grid
this time (ratio up to 5, not just 3):

**Cost-efficiency ratio, per-trade PF / raw Sharpe:**

| Ratio | Asia | Monday | Combined |
|---|---|---|---|
| 1 (no filter) | 2.77 / 0.455 | 2.80 / 0.490 | 2.76 / 0.456 |
| 2 | 2.86 / 0.471 | 2.86 / 0.501 | 2.84 / 0.470 |
| **3 (Asia/combined shipped)** | 2.96 / 0.488 | 2.93 / **0.512** | 2.92 / 0.485 |
| **4 (Monday shipped)** | 3.04 / 0.507 | 2.90 / 0.510 | 2.99 / 0.501 |
| 5 | 3.07 / **0.521** | 2.91 / 0.511 | 3.00 / **0.511** |

Asia and Combined: per-trade edge keeps climbing all the way to ratio=5
in this wider grid — shipped ratio=3 is solid and clearly beats loose
filtering, but is NOT the ceiling of what was tested (trades drop from
~10-12k to ~6-8k at ratio=5, a real capacity trade-off, not yet weighed).
🟡 flagging as a legitimate, second-order "could tighten further"
option — NOT a red flag like the retracted finding above, since 3 is
already solidly ahead of the loose end; just possibly short of optimal.
Monday: per-trade Sharpe peaks at ratio=3 (0.512), narrowly ahead of the
shipped 4x (0.510) and 5x (0.511) — all three are within noise of each
other (PF 2.90-2.93, Sharpe 0.510-0.512). 🟢 Monday's shipped 4x is fine,
not urgent to change; 3x is a marginal, noise-level alternative.

**Stop-tighten fraction, per-trade PF / raw Sharpe — clean interior peak
at 0.9 on ALL THREE modes, no exceptions:**

| Fraction | Asia | Monday | Combined |
|---|---|---|---|
| 1.0 (off) | 2.76 / 0.461 | 2.86 / 0.505 | 2.76 / 0.462 |
| **0.9 (shipped)** | **2.96 / 0.488** | **2.90 / 0.510** | **2.92 / 0.485** |
| 0.75 | 2.96 / 0.484 | 2.74 / 0.477 | 2.90 / 0.477 |
| 0.6 | 2.91 / 0.469 | 2.63 / 0.447 | 2.84 / 0.459 |

🟢 **0.9 is the per-trade peak (or a dead-even tie for it) on Asia,
Monday, AND Combined independently.** This is the cleanest, most
consistent confirmation of the whole exercise — no ladder disagrees, no
change warranted anywhere.

**On "combined is where the high numbers come from"**: confirmed
structurally, not newly broken. Combined's day-pooled CAGR/Sharpe track
Asia's almost exactly at every ratio (e.g. day-pooled Sharpe 18.2 Asia
vs 18.51 combined at ratio=3) because combined is ~80% Asia-leg trade
volume + ~20% Monday-leg by count (12,496 combined vs 10,405 Asia-only
at ratio=3) — Asia is the dominant risk driver, same conclusion this
doc already reached for pair-exclusion and cost-ratio precedent. The
extreme non-compounded headline % figures are the SAME high-trade-
frequency accounting artifact already explained to the owner directly
(annual return ≈ trades/yr × avg edge/trade, thousands of trades summed
off a fixed reference capital) — confirmed present in combined at the
same magnitude as Asia alone, not a new or worse mechanism.

🟢 **Net position after this pass**: chandelierMult, concurrency mode,
cost-efficiency ratio, and stop-tighten fraction are now checked with
the corrected (day-pooled + per-trade) method across Asia, Monday, AND
Combined. Stop-tighten fraction is fully confirmed everywhere.
Cost-efficiency ratio is confirmed-solid everywhere, with a legitimate
(not urgent) "could go tighter" option flagged for Asia/Combined only.
🟡 **Still not walk-forward-checked**: pair-selection exclusion set, and
concurrency mode specifically IN combined mode (held fixed at hedgeOnly
this pass rather than re-tested blocked-vs-hedgeOnly on the 32-stream
combined universe — the single-split check that originally confirmed
hedge-only covered Asia and Monday separately, not combined's own
constituent mix).

---

### "Let-ride" extended resolution for unresolved ('neither') touches — built, tested, shipped as an opt-in toggle (2026-08-31)

Direct owner question after the day-pooled-vs-per-trade corrections above:
"what do you do with trades at the end of the day — are they closed and
counted as wins/losses or ignored completely?" Answer, found by reading
`asiaFibAtlasEngine.js`'s walk loop: a touch that hits neither the inner
nor outer barrier by local midnight gets `outcome:'neither'` and is
**dropped entirely** by `buildBarrierTrades` (`asiaFibAtlasVoteReview.js:139`)
— never counted as a win, a loss, or anything. ~3.5-4% of touches.

**Two hypotheses tested directly, not guessed:**
1. *Mark-to-close* (force-price at the midnight close instead of
   target/stop) — `analysis/fib_atlas_neither_markclose_test.mjs`: the
   1,331 previously-dropped touches this recovers have only a **37.3% win
   rate** — close to a coin flip. Rejected: there's no real trading rule
   that flattens at midnight; this measures wherever price randomly was
   at one arbitrary snapshot, not the trade's real outcome.
2. *Extend the search* (owner's own proposal: let it keep looking for a
   real resolution into following days, but cap concurrency occupancy at
   the next session's build time — 6am, since Asia's new range isn't
   built until then — so a still-open extended trade can never block a
   fresh signal) — `analysis/fib_atlas_neither_extend_test.mjs`, bounded
   to 14 days: **99.8-99.9% eventually resolve**, with a win rate close to
   the already-counted trades' own. Chosen over mark-to-close for exactly
   that reason — it measures what the touch actually did.

**Built into the engine** (not just an analysis script):
`asiaFibAtlasWalk` gains `extendResolutionDays`/`nextSessionBuildHrs`,
both additive and off by default (0 = byte-identical to prior behavior,
verified via the full existing test suite) — see the function's own doc
for the mechanism (a SEPARATE bars array for the outcome race only; every
feature/confluence computation still uses the unchanged same-day window).
`concurrencyResolveTime` implements the cap. Generation (`runOne` in
`asiaFibAtlasRoutes.js`) runs a SECOND full walk (same already-loaded M1,
no extra fetch) with extension on, builds `extTrades`/`extSummaryByMargin`
with full parity to the baseline (giveback + chandelier trailing both
applied), and persists them ALONGSIDE `trades` in the same R2 blob — same
dual-store precedent as chandelier's own trailed fields. Read routes
(`vote-trades/:instrument`, `vote-portfolio`, `vote-portfolio-combined`)
accept `letRide=true` to swap in `extTrades` via a shared `loadVoteTrades`
helper, falling back to `trades` when absent (older data, or a ladder —
Monday — that doesn't have one yet) — `buildFibAtlasVotePortfolio` itself
needed zero changes. UI checkbox on `asia-fib-atlas-vote-portfolio.html`,
off by default including in "Load Best Config" (new enough to stay
opt-in rather than folded into the shipped default).

**A real subtlety found while wiring this, not before**: extending
resolution doesn't just add trades — it reshapes the underlying vote
BOOK too, since the book's own per-cell win-rate statistics are built
from `buildAsiaFibAtlasBook(touches, ...)`, and `touches` is now a
materially fuller (and less selectively-clean) sample once previously-
'neither' touches carry a real resolved outcome. The correct
implementation rebuilds the book from the EXTENDED touches
(`extBook = buildAsiaFibAtlasBook(extTouches, ...)`), not the baseline
one — this is more principled (a vote decision should reflect the TRUE
empirical hold-rate of a cell, not one computed on a sample that quietly
excluded the ambiguous cases) but means an earlier draft of the analysis
script (which reused the baseline book for both) understated the effect.
**Live full-16-pair "Load Best Config" comparison** (the real production
numbers, not the analysis script's):

| | letRide off (shipped) | letRide on |
|---|---|---|
| Trades | 16,712 | **5,811** (-65%) |
| Portfolio Sharpe (day-pooled) | 16.37 | 11.84 |
| Max Drawdown (fixed risk) | -3.99% | -4.07% |
| Profit Factor (day-pooled) | 42.41 | 12.86 |
| **Per-trade win rate** | 72.4% | **72.6%** |
| **Per-trade PF** | 2.555 | **2.599** |
| **Per-trade Sharpe (raw)** | **0.411** | **0.409** |

🟢 **The real finding: per-trade edge quality is unchanged** (0.411 vs
0.409 raw Sharpe, 72.4% vs 72.6% win rate — a rounding-level difference,
not a real one) — extending resolution does NOT make the trades taken
any better or worse individually. What changes is trade COUNT: the
book rebuilt from the fuller data is far more selective, and 65% fewer
(side,level) cells clear the margin≥2 vote bar. Read plainly: the
CURRENT shipped book may be systematically more confident than it should
be, because it's built on a sample that silently excludes every touch
that didn't cleanly resolve same-day — a form of selection bias in the
book's own training data, separate from (and not yet fully reconciled
with) the trade-count question the owner originally asked about. Max
drawdown barely moves either way (-3.99% -> -4.07%), so this isn't a risk
story — it's a "how much do you trust a leaner, more conservative book
vs. a denser, possibly-overconfident one" story.
🟡 Left as of that pass: Asia-only, not walk-forward validated, and the
denser-vs-leaner-book question unresolved.

#### Follow-up: extended to Monday and Combined (2026-08-31)

Direct owner ask — "need to do Monday and both[combined], both for this
[let-ride] and also for the backtest pages and portfolio". Quantified
first: even Monday's existing ~8-day window drops **~3.3-4.4% of
touches** as unresolved (`analysis/fib_atlas_monday_neither_extend_test.mjs`,
26-pair sweep) — the same order of magnitude as Asia's own rate, worth
the same fix. Given +21 more days (mirroring Asia's own 14-day choice,
scaled up since Monday's window already starts at 8 days), the residual
unresolved rate drops to **0.00-0.03%** — essentially fully resolved,
even cleaner than Asia's own 0.1-0.2% residual.

`mondayFibAtlasWalk` gains the SAME `extendResolutionDays` capability
(additive, off by default, full existing test suite passes — 15/15).
Monday's concurrency cap needed no separate hours-based parameter the way
Asia's did: the engine's EXISTING `winEnd` (Tuesday + 8 days) already
sits almost exactly at next week's own fresh-range boundary, so
`concurrencyResolveTime` always caps there regardless of extension
length. `mondayFibAtlasRoutes.js`'s `runOne` mirrors Asia's `runOne`
exactly (second full walk off the same already-loaded M1, full giveback
+ chandelier trailing parity, `extTrades`/`extSummaryByMargin` stored
alongside the baseline). Read routes accept `letRide=true` via a shared
`loadVoteTrades` helper (exported once from `asiaFibAtlasRoutes.js`,
imported by Monday's routes — no duplicated logic, verified no circular
import). `asia-fib-atlas-vote-portfolio.html`'s toggle now genuinely
covers all three modes; `asia-fib-atlas-vote-backtest.html` (the
single-pair tearsheet, which had NO cost-efficiency or let-ride toggle
at all before this) got the same checkbox wired into its single-ladder
AND combined-mode fetch paths.

**Real, live, full-26-pair "Load Best Config" comparison for Monday — a
genuinely different, more favorable shape than Asia's:**

| | letRide off | letRide on |
|---|---|---|
| Trades | 5,457 | 5,251 (only -3.8%) |
| Portfolio Sharpe (day-pooled) | 12.31 | **13.03** |
| Max Drawdown (fixed risk) | -3.25% | **-2.65%** (shallower) |
| Per-trade win rate | 74.8% | 74.7% |
| Per-trade PF | 2.725 | **2.758** |
| Per-trade Sharpe (raw) | 0.471 | **0.490** |

🟢 Unlike Asia (where the rebuilt book was far more selective, -65%
trades), Monday's book barely changes — only -3.8% fewer trades — and
EVERY metric holds steady or improves slightly, day-pooled and per-trade
alike. The likely reason: Monday's existing 8-day window already
captured most of the resolution information before extension, so
extending further doesn't reshape the book's statistics the way jumping
from same-day-only to 14 days did for Asia — it just quietly recovers a
small number of genuinely slow-to-resolve touches without disturbing
what the book already knew. This is close to a clean, no-real-tradeoff
win for Monday specifically.

**Combined mode verified working correctly**: each pair's Asia leg and
Monday leg pick up their OWN ladder's `extTrades` independently
(confirmed via the live route: combined `letRide=true` shows Asia's leg
dropping 16,712→5,811 trades and Monday's leg dropping only
3,458→3,347 — exactly matching each ladder's own standalone numbers).
Combined day-pooled Sharpe 16.76→14.27, maxDD -4.21%→-3.80% (a small
improvement, since Monday's slight improvement partially offsets Asia's
larger trade-count reduction, and Asia dominates combined's volume as
already established elsewhere in this doc).

🟡 **Still not done**: walk-forward validation of the let-ride mechanism
itself (a single before/after comparison on both ladders now, not a
3-fold check like the other levers); and the denser-vs-leaner-book
question is now split by ladder — Asia's book genuinely trades a lot of
breadth for selectivity, Monday's doesn't — worth the owner's own read
on whether that's a reason to ship let-ride for Monday but hold off on
Asia, rather than an all-or-nothing choice.

#### Live/paper trading bot — `fib_atlas_bot` (2026-08-31)

Direct owner ask: turn the validated Fib Atlas system into a real
live/paper trading bot, following the general "turn a validated backtest
into a live bot" playbook this repo already uses (kill switch, paper/live
default-paper, sizing off the undegraded stop, concurrency caps, hard
drawdown lockout, gradual drawdown throttle, portfolio heat cap,
stack/duplicate guard, spread cap, plan-staleness gate, decision audit
log, Telegram entry/close alerts, config page wired the same way as every
other bot). Built as a genuinely new bot (`fib_atlas_bot/`), mirroring
the newest, most complete reference bot in the repo
(`volatility_bot_v2/volatility_bot_v2.py`) rather than inventing a new
pattern — see that bot's own file for the template this one follows gate-
for-gate.

**The core design decision**: the server computes and freezes a plan,
the bot only executes it — same split `_refreshVolatilityV2Plan` already
uses for Level Atlas's own live bot, applied here for the first time to a
strategy with TWO independent ladders (Asia range-extension, Monday
range-extension) that can both be open on the same pair at once.

- **`js/asiaFibAtlasEngine.js`** — new exported pure helper
  `asiaRungBarrierPips(side, level, boundary, pip)`: the SAME
  `here`/`inner`/`outer` neighbour-rung construction `asiaFibAtlasWalk`'s
  hot loop already used inline, factored out so a live-plan producer can
  price a rung that HASN'T been touched yet (no `touch` record to read
  `innerDistPips`/`outerDistPips` off) exactly the way Level Atlas's own
  `_volatilityV2PriceZone` already prices its own pending rungs. Unit-
  tested (`asiaFibAtlasEngine.test.mjs`) by cross-checking every same-
  session real touch's OWN `innerDistPips`/`outerDistPips` against what
  the new pure helper computes independently — byte-identical, not just
  "looks right". `js/mondayFibAtlasEngine.js` carries the identical
  `mondayRungBarrierPips`, same cross-check test.
- **`js/asiaFibAtlasRoutes.js`** — new exported `asiaLivePlanZones(pair,
  opts)`: for every rung in the pair's live ladder (`getFastLive`), calls
  the SAME `voteDecision(book, rung)` the backtest itself validated with,
  prices it via `asiaRungBarrierPips`, applies the frozen best-config
  filters (minMargin=2, minCostRatio=3, stopTightenFrac=0.9), and emits
  one zone per currently-favored rung: `{side, rung, decision, margin,
  entry, sl, sizingSl, tp, targetPips, stopPips, sizingStopPips, pip,
  rearmFrac, touchedToday, dedupeTag, rationale}`. `sizingSl`/
  `sizingStopPips` carry the FULL, untightened stop distance — sizing
  must always use these, never the (possibly server-tightened) `sl`/
  `stopPips`, or fixed-fractional sizing sizes UP to compensate for a
  smaller stop (this repo's live-bot playbook §2). New route `GET
  /api/asia-fib-atlas/plan/:instrument` exposes it directly. Live-tested
  end to end against real R2 data (both via the HTTP route and via a
  direct in-process call) — real zones with correct entry/sl/tp math
  confirmed. `js/mondayFibAtlasRoutes.js` carries the identical
  `mondayLivePlanZones` (minCostRatio=4, Monday's own frozen ratio) +
  `GET /api/monday-fib-atlas/plan/:instrument`.
- **`server.js`** — new `_refreshFibAtlasPlan()`, mirroring
  `_refreshVolatilityV2Plan` exactly (cold-start throttling, "never
  publish an empty plan over a good one", 45s cadence): builds one
  constituent per `"{pair}|asia"`/`"{pair}|monday"` key (same convention
  `/vote-portfolio-combined` already uses) across the 16-pair recommended
  universe (`FIB_ATLAS_ALL_PAIRS`/`FIB_ATLAS_RECOMMENDED_EXCLUDE`, hand-
  kept in sync with `asia-fib-atlas-vote-portfolio.html`'s own set), and
  persists to KV key `fib_atlas_bot_plan`. Verified end to end via an
  isolated aggregation script against real R2 data — both pairs, both
  ladders, correct zone math. New `POST /api/fib-atlas-bot/telegram-test`
  route + `fibAtlas` entry in `TG_SENDERS` (not enforced by this file's
  own `tgOn()` — the bot is a separate process, checks `ai_alert_cfg`
  directly, same pattern as `voteAtlas`).
- **KV registration** — `fib_atlas_bot_config`/`_credentials`/`_plan`/
  `_state`/`_trade_log`/`_decision_log` in all three required gates
  (`kv.js` `_CF_EXACT`, `_worker.js` `isAllowedKVKey` EXACT set,
  `_worker.js` `PERMANENT_KEYS`); `fib_atlas_bot_status` in `_worker.js`'s
  `STATUS_KEYS`/`BOT_KEYS` only (deliberately excluded from the permanent
  list — rewritten every ~30s, a stale status should expire, not
  masquerade as "still running").
- **`pylego/drawdown_throttle.py`** (new brick) — the gradual size-
  multiplier drawdown throttle, extracted from
  `volatility_bot_v2/drawdown_throttle.py` once `fib_atlas_bot` became a
  SECOND consumer of the identical logic (Lego Principle: "if two copies
  already exist, that alone qualifies"). Byte-identical copy, own test
  suite (`pylego/drawdown_throttle_test.py`, all passed).
  🟡 **Known duplicate, not yet consolidated**: `volatility_bot_v2` still
  imports its OWN local copy (left untouched — a live production bot's
  import path is not something to change as a side effect of adding an
  unrelated new bot). A future cleanup pass should point
  `volatility_bot_v2` at `pylego/drawdown_throttle.py` too and delete its
  local copy.
- **`pylego/magics.py`** — `fib_atlas_bot/fib_atlas_bot.py: 20260831`
  registered.
- **`fib_atlas_bot/engine.py`** (new, pure, offline-tested) — the two
  pieces deliberately left to the bot rather than the server plan (see
  that file's own extensive doc): `RearmTracker` (the live tick-by-tick
  touch/rearm state machine — the plan tells the bot the CURRENT
  decision/margin for a rung, the bot tracks WHEN price actually crosses
  it, with a `rearm_distance()` helper that reconstructs the EXACT
  `rungSpan` the backtest's own rearm math uses from the plan's
  `targetPips`/`sizingStopPips` fields, not a guessed proxy) and
  `chandelier_stop()` (the live ATR trailing-stop math — confirmed,
  not guessed, to be the byte-for-byte same Wilder-EMA recurrence as
  `js/levelAtlasVoteReview.js`'s `rollingATR`, the exact function
  `analysis/fib_atlas_chandelier_exit_backtest.mjs` used to pick this
  bot's own frozen per-ladder multipliers, Asia 3.0 / Monday 1.5, period
  60). Both real, disclosed (not hidden) differences from the backtest's
  own math are documented in the code: a live tick stream has no
  separate open/high/low/close to split the rearm-distance check from
  the touch check the way the M1-bar walk does, and a freshly-opened
  position's own bar history is shorter than the ATR's Wilder-EMA needs
  to fully converge. `pylego/drawdown_throttle_test.py`-style tests, all
  passed.
- **`fib_atlas_bot/fib_atlas_bot.py`** (new) — the main loop, mirroring
  `volatility_bot_v2.py` gate-for-gate: kill switch, paper/live
  (defaults paper), sizing (`pylego.sizing.position_size` off the
  undegraded `sizingSl` distance), global + per-pair concurrency caps
  (per-pair counts BOTH ladders combined — an Asia long + a Monday short
  on the same pair legitimately counts as 2), `pylego.risk_guard
  .RiskGuard` hard lockout, `pylego.drawdown_throttle.DrawdownThrottle`
  gradual throttle (off by default — new levers ship opt-in), portfolio
  heat cap, the `dedupeTag`-based stack/duplicate guard
  (`Mt5Broker`/`PaperBroker`'s existing `dedupe_tag` mechanism — no new
  code needed), `pylego.costs.max_spread` spread cap, a fail-closed plan-
  staleness gate, the chandelier trailing stop (new execution behavior,
  see `engine.py` above), a capped/restore-on-restart decision audit log,
  and Telegram entry (price + SL + TP) / close (P&amp;L + trade duration)
  alerts, reply-threaded, dedup'd, gated on the central `ai_alert_cfg`
  `tgMaster.fibAtlas` kill switch (fails open on fetch error).
- **`bot-config.html` / `js/bot-config.js`** — new "🌐 Fib Atlas" tab,
  cloning the Vote Atlas tab's structure (How-it-decides explainer, Live
  Status, Risk Systems tiles, Open Positions, Today's Levels &amp; Live
  Decisions — sourced straight from `fib_atlas_bot_plan` so an operator
  can see what the bot WOULD trade even before starting it — Decision
  Timeline with real date navigation, How-to-run, pair universe
  checkboxes, Bot Control, MT5 Credentials) with a Trade-Asia/Trade-
  Monday toggle pair added alongside the usual fields. Telegram
  token/chat-id default to empty (same convention as every other bot's
  `tg_token`/`tg_chat_id` default — a credential is never a literal in
  source; the owner's real bot token/chat id, provided when this bot was
  commissioned, goes straight into these fields on the page and Save,
  landing in `fib_atlas_bot_config` KV, not in git). No unfiltered "All
  Lines" table (no unfiltered-preview route exists for this engine yet;
  the Levels table already shows everything actually tradeable). Verified
  rendering end to end via Playwright against a local static server: tab
  switches, 26 pair checkboxes populate, ladder toggles default on,
  Telegram fields pre-fill correctly, zero JS console errors.
- **Not yet done**: no live/paper track record at all yet (ships exactly
  like every other new bot here — backtest + OOS only, paper-mode
  default); `volatility_bot_v2`'s own currency-loss gate was deliberately
  NOT ported (a real, validated lever, but a genuinely separate scope
  decision, not silently dropped — flagged here for the owner's own
  call); `start.sh` was deliberately left untouched (MT5 has no Linux
  wheel, so live trading needs a separate Windows-hosted process exactly
  like `volatility_bot_v2`/`range_line_bot` already do — paper mode CAN
  run on Railway if desired, same one-line addition either of those two
  bots would need).

---

## 2. Candidate bricks — mapped, prioritized, not yet extracted

Ranked by **drift risk × reuse**. "Live" = a copy runs in a production bot, so a
drift directly desyncs trading from its backtest (the worst case).

### P0 — highest leverage (live ↔ backtest disagreement, or PnL-corrupting)

| # | Candidate brick | What it owns | Duplicated in (file:line) | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **`assetParams` + BM/HN constants (single source)** | Brownian range constants + per-asset-class correction factors | `volBacktestEngine.js:22-34` (canonical) vs **divergent** copies: `volForecast.js:45-50,115-120` (Jun-26 recal), `forecaster-backtest.html:471-481`, `VolRangeForecaster/vol_*.py`, `ForecasterOptimizer/engine.py`, **live** `TradingBot/dyn_anchor_bot.py:44-47`, **live** `DynAnchorBot/dyn_anchor_mt5_bot.py:46-62` | 🔴 CRITICAL | 6+ correction-factor sets from a June recalibration applied unevenly → live bots forecast different ranges than backtests. Make `volBacktestEngine` the source; Python imports via a generated JSON. |
| 2 | **GARCH(1,1) σ series** | close-to-close GARCH vol | `volBacktestEngine.js:152-164` (α=0.06,β=0.91) vs **live** `js/vol.js:54-68` (**α=0.10,β=0.85,ω=1e-7**); Python ports match backtest | 🔴 CRITICAL | Live `vol.js` is structurally different from every backtest. Decide the canonical (α,β) and parameterise. |
| 3 | **Instrument registry (Python side)** | pip size, point value, MT5/OANDA/Yahoo symbols | 🟡 **PIP SIZES DONE (2026-07-18)** — every remaining inline `_PIP_SIZES`/`PIP_SIZES` literal now calls `pip_sizes_for` (RegimeV7, RegimeV4, RegimeV2 + `backtest_v3`, DynAnchorBot, `bot/{hedge_bot,backtest}`, `bot/utils/sl_tp_engine`, `bot/modules/{confluence,oi_walls}`, `backtestSystem/mt5_utils`), verified entry-by-entry vs the old literals. Exception: `scripts/grade_v7_audit.py` (documented import-infeasible replica). **pointValue/`_PIP_VALUES` still NOT bridged — drifted (EUR/JPY 6.5 vs 9.0) + account-currency dependent → sizing change behind risk review.** | 🟠 (was 🔴) | Pip drift closed; the remaining risk is the un-bridged `_PIP_VALUES`. |
| 4 | **Python indicator core** | EMA/ATR/ADX/RSI/WaveTrend for the bots | `bot/utils/indicators.py` (ATR alpha=0.15) vs `backtestSystem/indicators.py` (Wilder ATR) vs inline `bot/regime_bot.py:252-271`, `Gold/main.py`, `Gold/modules/fib_engine.py:89-97` | 🔴 VERY HIGH | ATR smoothing differs bot vs backtest → stops differ. Mirror of `js/indicatorCore.js`. |
| 5 | **Regime composite score** | 7-component HMM+BOCPD+session+DXY+consensus+vol+credit → 0-100 | `RegimeV2/regime_score.py` vs `RegimeV4/regime_score_v4.py` (adds `bocpd_trend`, consensus fix) vs `js/regime-confidence.js` (6, no credit) vs inline in `regime-backtest.html` | 🔴 CRITICAL | V2 and V4 bots score the *same* regime differently. Pick V4 as canonical; port to JS for backtests. |
| 6 | **BOCPD change-point detector** | run-length change-point prob | `RegimeV2/bocpd.py` (full, used by V2/V4/V7 bots) vs simplified scalar in `js/regime-confidence.js` / `regime-backtest.html` | 🔴 CRITICAL | Live exit gates fire on BOCPD; backtests compute it differently (or not). Port `bocpd.py` → `js/bocpd.js`. |
| 7 | **Cost/friction model** | round-trip spread + commission + slippage (limit vs stop asymmetry, borrow) | `forecastCore.js:45-47`, `honestForecastEngine.js:39-41`, `backtest-worker.js`, Python `vix-vol-carry`/`macro-regime-conditional` constants, `RegimeV2/backtest_v3.py` | 🔴 CRITICAL | When/how costs are applied differs; only honest-forecast models stop-entry slippage. One `applyCosts(...)`. |

### P1 — high value (shared within research/systems)

| # | Candidate brick | What it owns | Duplicated in | Risk |
|---|---|---|---|---|
| 8 | **Macro tier score (T1–T8)** | rate/VIX/DXY/credit/carry/NFCI/momentum/session → sizing band | `js/macro.js:69-792` (canonical; T4/T7/T8 JS-only) vs `RegimeV2/regime_score.py`, `macroEquityEngine.js`, `GlobalLiquidity/gli.py` | 🟠 HIGH |
| 9 | **Position-sizing band** | conviction → risk% / lots | `nasdaqSizing.js:77-93`, `RegimeV2/regime_score.py:84-89`, `GlobalLiquidity/sizer.py:36-83`, `DecisionEngine/decisionEngine.js:46-133` (scales 13 vs 55 vs 0.5 — incommensurable) | 🟠 HIGH |
| 10 | **Fill walker (generalised)** | intrabar SL/TP resolution, limit/stop fill, slippage, breach-reclaim | `forecastCore.js:72-96` (canonical `walkBars`) vs inline `honestForecastEngine:84-120`, `asiaRangeEngine:278-301`, `zscoreSpreadEngine:172-187`, `backtest-viewer:312+` | 🟠 HIGH |
| 11 | **Walk-forward / IS-OOS split** | date-fraction & window-count splitting | `honestForecastEngine.summarizeSplit`, `nasdaqPerformance:326-391`, `backtest.js:687-844`, Python `GlobalLiquidity`/`vix-vol-carry`/`macro-regime-conditional` (504/63/21) | 🟠 MEDIUM |
| 12 | **Volume profile (POC/VAH/VAL/nPOC)** | value-area + age-weighted naked POC | `js/profileShapeCore.js` `valueArea` (new pure JS home for the histogram→POC/VAH/VAL walk) vs inline copies in `levelSources.volumeProfileLevels:145-170` + `confluenceModules.js:266-312` (no nPOC age) vs `Gold/modules/volume_profile.py:52-147` (full nPOC stack) vs `GoldV2/modules/volume_profile.py` (verbatim copy of Gold's — V1 is frozen so no drift *yet*; retire both into `pylego` when adopted). Next unification: retire the `levelSources`/`confluenceModules` inline walks onto `profileShapeCore.valueArea`. | 🟠 HIGH |
| 13 | **Pivots / VWAP anchors** | Camarilla pivots, session VWAP, session-open anchors | `Gold/modules/session_engine.py:66-201` (only full impl) vs `GoldV2/modules/session_engine.py` (verbatim copy); backtests omit VWAP anchors entirely | 🟠 HIGH (backtest↔live gap) |
| 14 | **Confluence scorer** | weighted zone ranking across level types | `Gold/modules/confluence_scorer.py:56-186` vs `asiaRangeEngine.runModuleChecks` (module-hit-count, no cross-impulse/nPOC-age/VWAP) | 🟠 VERY HIGH (backtest↔live gap) |
| 15 | **Swing-pivot detection** | N-bar high/low S/R | `confluenceModules:209-223`, `backtest-engine:189-203`, `range-bias:288-303`, `backtestSystem/indicators.py:111-122`, `Gold/modules/fib_engine.py:100-113`, `GoldV2/modules/level_matrix.py:_find_pivots` + `GoldV2/modules/htf_bias.py:_find_pivots` (N varies) | 🟠 MEDIUM |
| 15b | **Gold-bot fork copies (V1→V2)** | GoldV2 is a versioned fork of Gold (house rule: version, don't overwrite). `volume_profile.py` / `session_engine.py` / `trendline_engine.py` are verbatim copies; `vumanchu.py` diverges deliberately (WT-mandatory + fuel veto); `level_matrix.py` replaces `fib_engine.py`+`confluence_scorer.py`. V1 is frozen, so copies can't drift while it lives — but when V2 wins the A/B, extract the three verbatim modules into `pylego` instead of letting a V3 copy them again. | `Gold/modules/*` vs `GoldV2/modules/*` | 🟡 MEDIUM (frozen incumbent) |
| 16 | **D1 bucketing from packed M1 (`buildDaily`)** | fold `{times,opens,highs,lows,closes}` into completed UTC-day D1 bars, one forward pass | `js/poiReactionV1Engine.js:152`, `js/rangeExtEngine.js:80` (`buildDailyBars`), `js/backtest-worker.js:935` (`buildDailyBars`), `js/gold-backtest-worker.js:52` (`buildDailyBars`), `js/impulseEmaRangeV1Engine.js` (5th copy, added 2026-08-17, §1ao), `js/impulseEmaRangeV2Engine.js` (6th copy, added 2026-08-17, §1ao) — all byte-identical logic, different names | 🟡 MEDIUM (identical today, 6 places to keep in sync) |

### P2 — useful consolidation (cleanliness, lower drift risk)

| # | Candidate brick | What it owns | Duplicated in | Risk |
|---|---|---|---|---|
| 15c | **Cross-asset risk-flag composite** | the "3+ flags → cut gross" daily risk dashboard (VIX level, VIX/VIX3M term structure, HY-OAS 5-obs speed, USD/JPY 5-obs JPY bid, EVZ 5y percentile) — `computeRiskFlags()` in `server.js` (2026-07-11, education review), served at `/api/risk-flags`, rendered on `today.html`, injected into `/api/analysis` + morning-brief prompts. Currently server glue with one copy; **extract to a brick if a bot wants it** (RegimeV2/V4's E-gates already compute VIX-backwardation separately — that's the known second copy to unify). Stock-bond correlation flag deliberately absent (no daily SPX series server-side — add the feed first, don't proxy). | `server.js computeRiskFlags` vs `RegimeV4` VIX-term gate (partial) | 🟡 LOW-MED |
| 15d | ~~**Effective-bets (single-ρ) inline copy**~~ | ~~`N/(1+(N−1)ρ̄)` per-instrument concentration~~ | ✅ **MIGRATED 2026-07-21** — `perLineStrategy.js` `concentrationStats` now calls `diversificationCore.effectiveBetsAvgCorr`; no inline copy remains | ✅ done |
| 16 | **OANDA D1 fetcher** | daily OHLC + 22:00 session-day shift + retry | `volBacktestEngine.js:51-84` (no retry) vs `cogHistoricalDataLoader.js:72-110` (retry/backoff) | 🟡 MEDIUM |
| 17 | **FRED fetcher + publication lag** | series fetch, lag shift, forward-fill | `nasdaqDataSources`, `cogDataSources`, `nasdaqTransforms:172-189`, `server.js:3882-3958` (local re-impl), `GlobalLiquidity/backtestCore.mjs` (3 different FRED_ID maps) | 🟡 MEDIUM |
| 18 | **COT/CFTC parser** | TFF + disaggregated parse, symbol map | `_worker.js:67-175` (parse) vs `js/cot.js:7-52` (client transform); two symbol maps drift | 🟡 LOW-MED |
| 19 | **Session/timezone bucketing** | London-session day, Asia/London/NY classify, BST | `utils.js:103-150`, `volBacktestM1Engine:217-224`, `cogHistoricalDataLoader:40-64`, `nasdaqSessions:25-80` (DST-aware), `cogTradingDay:18-54` (DST-blind) | 🟡 MEDIUM |
| 20 | **COG/Nasdaq exit engine** | direction-aligned continuation score → exit | `cogExitEngine.js:32-100` vs `nasdaqExitEngine.js:29-100` (share `compositeRampScore`) | 🟠 HIGH |
| 21 | **COG/Nasdaq liquidity gate** | balance-sheet+credit → [-5,+5] | `cogLiquidityGate.js:18-76` ≈ `cogThreshold1Gate.js:69-97` (self-admitted copy) vs `nasdaqLiquidityEngine.js:56-80` (simpler voting) | 🟠 HIGH |
| 22 | **Async job-queue helper** | `POST /run`→jobId, `GET /status/:id` boilerplate | repeated ~5× in `server.js` (`:2976`, `:3199`, `:3256`) + `analyserRoutes.js:54-99` + `/api/strategy-lab/*` | 🟢 LOW |
| 23 | **Position-series backtest loop** | pos[t−1]×ret[t] + cost-on-\|Δpos\| daily loop | `strategyLabEngine.positionBacktest` (the generic brick) vs the identical loop fused inside `trendFollowEngine.backtestMarket:81-90` — trendFollow is validated, so consolidate onto the brick only with a bit-identical A/B, not a drive-by refactor | 🟢 LOW |
| 24 | **Macro tier score (T1–T8 composite)** | `calculateTierScores()` + the 8 tier functions + PCA decorrelation + coherence bonus — lives in `js/macro.js`, an index.html *app module* that reads the `state.js` singleton (`S.currentPair`, `S.fredData`, `S.ohlcData`, `S.ohlc5m`…), not a registered brick. **Now has a second consumer**: `js/deskApp.js` (desk.html context drawer, 2026-07-24) imports it and feeds `IX` the same payloads rather than copying the logic — no drift, but the shared-mutable-state contract is fragile (caller must set `S.currentPair` before each call). If a third consumer appears (a bot, the analyser), extract to a pure `tierScoreCore.js` with explicit inputs `(pair, fred, ohlcD1, ohlc5m, ecb, ifo) → {tiers, totalScore…}`. Heuristic context, not OOS-validated — extraction is about drift safety, not signal status. | `js/macro.js` (single copy; consumed by `js/main.js` + `js/deskApp.js`) | 🟢 LOW (no copy yet — state-contract fragility only) |
| 25 | **Currency strength + drill-down (`today.html` "Market Read")** | `currencyStrength`/`currencyDetail`/`openCcyDrawer` (today.html, 2026-07-28) — per-currency net technical score (blend of each pair's HMM regime + live session bias, via `PAIR_CCY`), now **completed** to cover all 25 tracked pairs (was silently missing `EURCAD/EURAUD/EURNZD/AUDNZD/AUDCAD/AUDCHF/GBPAUD/GBPCAD/GBPNZD/NZDJPY/CHFJPY` — 11 pairs' signal never reached the board, e.g. CHF's score previously ignored `CHFJPY`/`AUDCHF` entirely). `currencyDetail(ccy)` adds two genuinely different inputs on click-through: COT positioning read straight off the currency's own CME future (`cot[ccy]`, not derived per-pair; USD has no standalone future so it's the OI-weighted mirror of the other 7 — flagged `derived:true` in the UI, not asserted as direct), and 10Y-yield carry/rank via FRED (`CCY_FRED10Y`; no NZD series wired in yet — shown as an honest gap, not backfilled with a proxy). Page glue, not a portable brick yet: reads today.html's module-scope `cot`/`fred`/`allRows()` directly, single consumer. If a second page wants the same per-currency view (e.g. `desk.html`), extract `currencyDetail` into a pure `ccyStrengthCore.js` with explicit inputs `(rs, cot, fred) → detail`. | `today.html` (single copy) | 🟢 LOW (single consumer; extract if a 2nd page adopts it) |

### Python-bot shared utilities (live-bot territory — **document only, do not edit live bots yet**)

These are real duplications but live inside production bots, so per the current
task they are catalogued, not extracted. See `a5819a3c`/`a8ce0949` survey notes.

| Candidate | Duplicated in | Risk |
|---|---|---|
| MT5 position serialization (`_serialize_open_positions`) | 🟡 **extracted** → `pylego/broker/mt5.py` (`Mt5Broker.serialize_*`); `bot/regime_bot.py` adopted. Still inline: `bot/main.py:123-145`, RegimeV2/V4/V7, DynAnchorBot | 🟠 HIGH |
| Python position sizing (risk% → lots, decay) | 🟡 **extracted** → `pylego/sizing.py`; `bot/regime_bot.py` adopted. Still inline: `RegimeV2` (`×0.5` decay variant), V7, DynAnchorBot | 🟠 HIGH |
| MT5 connect/login + account check | 🟡 **extracted** → `pylego/broker/mt5.py` (`Mt5Broker.connect`); `bot/regime_bot.py` adopted. Still inline: `bot/main.py`, RegimeV2/V7, DynAnchorBot | 🟡 MEDIUM |
| KV client (get/put/status push) | `bot/main.py`, `bot/regime_bot.py`, `RegimeV2:189-209`, V7; partial `bot/utils/state_reader.py` | 🟡 MEDIUM |
| RiskGuard (daily/monthly DD lockout) | 🟡 **extracted** → `pylego/risk_guard.py`; `bot/regime_bot.py` adopted. Still inline: RegimeV2/V7, DynAnchorBot; unwired `safety/risk_gate.py:116-309` | 🟠 HIGH |
| Telegram alerting | `bot/main.py:316-357`, RegimeV2 `formatter.py` (reused by V7), DynAnchorBot inline | 🟡 MEDIUM |
| Logging setup | `bot/main.py:65`, `bot/regime_bot.py:97`, RegimeV2/V7 | 🟢 LOW |
| London DST offset rule (last-Sun-Mar/Oct manual fallback) | `volatility_bot/engine.py:_london_offset_hours` (canonical manual rule; `range_line_bot` **imports** it for the Batch-6 boundary-hour sanity check) vs `bot/utils/config_helpers.py:_london_offset_hours` (Batch 6 — zoneinfo primary, same manual rule as fallback; also adds the NY 2nd-Sun-Mar/1st-Sun-Nov rule). Extract to `pylego` (e.g. `pylego/sessions.py`) next time a third consumer appears — the vol bot's copy is frozen-plan-adjacent, so adopt deliberately. | 🟡 MEDIUM |

---

## 3. Known drifts this registry exists to retire

Concrete, evidenced divergences found during the mapping. Each is a latent
"backtest says X, live does Y" bug. **Documented, not silently auto-fixed** —
unifying them changes existing numbers, so adopt deliberately with an OOS re-run.

1. **Gold pip size:** `1.0` (server.js, asiaRangeEngine) vs `0.1` (rangeFibEngine).
   `instrumentRegistry` canon = `1.0`. *(rangeFibEngine's local `PIP_SIZE` left
   untouched for now — changing it shifts that backtest's pip math.)*
2. **GARCH (α,β):** backtest `(0.06, 0.91)` vs live `js/vol.js (0.10, 0.85)`.
3. **ASSET_PARAMS correction factors:** ≥6 sets across JS/HTML/Python/live bots
   from an unevenly-applied June-2026 recalibration.
4. **News multiplier:** JS includes "Fed Chair Speech"; `VolRangeForecaster` Python
   does not → Python under-forecasts on those days.
5. **ATR smoothing:** Wilder (regime/hmm) vs EMA-alpha-0.15 (Python bots) vs
   simple-mean (session-range backtests) — all named separately in
   `indicatorCore` so the caller can't pick the wrong one by accident.
6. **Regime score:** V2 vs V4 (`bocpd_trend` penalty + consensus fix) — different
   sizing/exits for the same regime.
7. **Rolling z-score:** population stddev + clip (nasdaqTransforms) vs sample
   stddev no-clip (GlobalLiquidity mathx). `statsCore.rollingZScore` makes `ddof`
   and `clipAt` explicit arguments.
8. **🔴 Confluence engine — live ≠ backtest (the big one).** The LIVE alert path
   and the Asia-range BACKTEST use **different confluence code**:
   - **Live / telegram:** `levels.js` → `confluence-core.js`
     (`detectConfluencesCore` / `mergeCrossSessionConfs`) → writes `ai_entries_{PAIR}`
     to KV → `cron-worker.js:51` proximity alerts + `bot/main.py:1005`
     `evaluate_pair_telegram` + `bot/modules/macro_regime.py`. This is what the
     index.html cards show and what the bot trades.
   - **Backtest:** `asiaRangeEngine.js` → its own local `detectConfluence` + the
     `confluenceModules.js` 16-module stack, served at `/api/asia-range-backtest/*`.
     `asiaRangeEngine` does **not** import `confluence-core.js`.
   ⇒ **The Asia-range backtest does not validate the live alert logic.** The real
   prize is one shared confluence brick both `levels.js` and the backtest call —
   equivalence-first, A/B'd on M1 + the live KV path (it changes live behaviour,
   so highest caution). Note: repointing `confluenceModules → levelSources` is a
   *backtest-internal* cleanup and does NOT touch this live path.
   **Full gap analysis + the Asia-backtest inventory: `CONFLUENCE_LIVE_VS_BACKTEST.md`.**
   ✅ **Steps 1–3 done** (the backtest now grades like the live bot):
   (1) confluence detection via the LIVE `confluence-core.detectConfluencesCore`
   (range-cap + clustering); (2) Monday is its own strategy (Monday-vs-prev-Monday)
   with an opt-in `crossSessionMerge` overlay; (3) every trade records `live_stars`
   / `live_signal_score` / `live_grade` via the SHARED `hmm.js` + `rangeBiasCore` +
   `entryGradeCore` + `trade-grade.js` (additive, no-lookahead). ⚠ Macro/COT/retail
   factors omitted (no history) → grade is a faithful *approximation*. This changes
   the backtest's confluence/selectivity on purpose; re-run on M1 to see it. Full
   detail + remaining UI-filter work in `CONFLUENCE_LIVE_VS_BACKTEST.md`.
   `confluence-core.js`, `range-bias.js`, `structural-fibs.js`, `ranges.js` are
   **live, not dead** — don't delete. Archived: the MD-files ZSCORE export +
   `Zoo/asia_range_backtest.py` → `archive/`.
9. **✅ CLOSED — Telegram-v2 vs the range-line bot learned the SAME Asia/Monday
   touches with TWO DIFFERENT policies.** `js/rangeLineBotProducer.js` (feeding the
   LIVE `range_line_bot`) already used the RANGE_EXTENSION_GUIDE.md §13 spec
   (per-instrument, no condition, held-chandelier pricing). `js/levelsV2Learn.js`
   (feeding telegram-v2) instead ran a pooled cross-pair policy conditioned on
   `approachVel`, priced by a fixed adjacent-line barrier — both §12 and §14 (which
   landed in the SAME build window as v2, but were never fed back in) later proved
   that variant loses on the honest single-pair unit. Symptom: every live v2 grade
   capped out around B (edge scale ~0.02%/touch vs the §13 book's ~0.095–0.48%).
   **Fix:** `levelsV2Learn.js` now calls `perLineStrategy.buildPolicy({pricer:
   pnlHeld})` per instrument — the SAME bricks `rangeLineBotProducer` freezes —
   so telegram-v2 and the bot grade one edge, not two drifted copies of it. Detail:
   `TELEGRAM_V2.md`'s "v3 correction" note.
10. **Session-range + London-DST helpers — 3rd copy now canonical.** The identical
    `dayStartEpoch`/`_londonOffsetHours`/`_buildAsiaSessions`/`_buildMondayRanges`/
    `_prevAsia`/`_mondayForDay` logic lives privately in **both** `rangeFibEngine.js`
    and `asiaRangeEngine.js`. Extracted 2026-07-23 to `js/sessionRanges.js` (canonical,
    unit-tested) and consumed by the new `rangeExtEngine.js`. The two old copies are
    **not yet migrated** (asiaRangeEngine is production/range-line-bot path → highest
    caution; rangeFibEngine has no test). Retire by pointing both at `sessionRanges`
    with an equivalence check — behaviour must stay byte-identical.
11. **✅ RESOLVED 2026-07-25 — Hurst was saturated AND actively harmful in the
    LIVE range-bias feature; `featureHurst` dropped from the aggregate.**
    Found from the live Analytics Desk: `rangeBiasCore.computeHurst` runs R/S
    over lags `[2,4,8,16]` on **price levels**, which reads ≈H+1 on a
    non-stationary series and is severely small-sample-biased upward besides
    — GOLD 0.903, EURUSD 0.882, two opposite markets read as the same number.
    **The pre-registered A/B (`js/hurstBench.js`, run on real D1 across 10
    instruments) confirmed the DROP outcome**: incumbent median OOS |IC| vs
    forward efficiency ratio = **0.026**, DFA = **0.010** — 0/10 instruments
    cleared the 0.20 usable-relationship bar for *either* estimator. Neither
    reading predicts anything; better calibration (DFA) does not earn a swap
    under the pre-registered rule.
    It was worse than inert, not merely neutral: H≈0.88 on **all 10**
    instruments with zero exceptions in the trending bucket meant
    `featureHurst` (thresholds 0.45/0.55) voted the OPPOSITE of every
    `entryDir`, unconditionally, on every call. Because conviction is the
    ratio `(confirm−conflict)/total`, that guaranteed fifth conflict vote
    distorted asymmetrically: a clean 3-confirm/1-conflict setup that should
    read conviction=0.50 (clears the `>0.30` "RB confirm" tag in `server.js`)
    was dragged to 0.20 (fails it) — a manufactured false negative on
    well-confirmed setups specifically, while already-weak setups were barely
    touched.
    **Fix applied:** `featureHurst` removed from `computeRangeBiasServer`'s
    aggregate (`js/rangeBiasCore.js`, evidence + reasoning in the code
    comment); the function itself is kept (used by `hurstBench.js`, tested
    standalone). Live consumers — `levels.js` grading and the `asiaRangeEngine`
    confluence backtest — both go through this one shared aggregate, so both
    move together; no drift introduced. `js/rangeBiasCore.test.mjs` updated
    (4 features, not 5; asserts `hurst` key absent from the aggregate).
    `perLineStrategy` (the confirmed range-line edge) was never a consumer —
    untouched throughout. Duplicate copies of the saturated `computeHurst`
    still exist in `js/range-bias.js` and `js/backtest-engine.js` (not wired
    to this aggregate, not touched by this fix — candidates for the same
    review if a consumer surfaces). `statsCore.hurstDFA` (the calibrated
    replacement estimator, used by `analyticsDesk`) stays available for any
    future feature that wants a Hurst reading; this resolution says the
    *live range-bias feature specifically* carries no information, not that
    Hurst is unusable everywhere.
12. **`forecastPathCore.calibrationTally` vs `coneCalibrationCore` (2026-08-03,
    not yet unified).** `forecastPathCore.js`'s `calibrationTally` carries an
    INLINE copy of the same "per-step P50/P75 coverage + direction hit-rate"
    tally logic that `js/coneCalibrationCore.js` (`gradeCone`/`tallyGrades`)
    now exports as a shared brick for `analogCone.js`/`coneBlend.js`. Left
    unrefactored deliberately: `forecastPathCore.js` backs the production
    `forecast-path.html` page, and unifying it was outside this task's blast
    radius (CLAUDE.md's "don't refactor v1/production code in place" caution).
    If a third consumer of this tally shape shows up, that's the trigger to
    repoint `calibrationTally` at `coneCalibrationCore` and retire the copy.

---

## 4. Conventions for bricks (from `CLAUDE.md`)

- **Import, never copy.** A second copy is a future drift bug.
- **One primitive, parameterised** — express new ideas as params/selectors, not
  new bespoke functions.
- **Horizon-agnostic & no-lookahead** where the brick touches time series.
- **Pure + unit-tested on synthetic data** (no network). Add cases to
  `js/legoBricks.test.mjs` (or a sibling `*.test.mjs`).
- **Costs honest by default**; report sample size next to any win-rate claim.
- **Validate before commit:** `node --check` the module + every file you rewired,
  and run the brick tests.
- **Don't edit v1 production** (`volBacktestM1Engine.js`) or live Python bots in
  place — build alongside and migrate deliberately.
- **Know the tier and the bar.** Is it a Tier-1 primitive, a Tier-2 level source,
  a render brick, or a selector? Does it clear the "what IS a brick" bar (≥2 uses
  or clean contract, stable I/O, pure, synthetic-testable)? See CLAUDE.md "Brick
  tiers & what counts as a brick".
- **Keep THIS registry current** — updating it is part of "done" for any brick
  add/change (Lego Principle 6): a row in §1, status + consumers, and any copy
  you couldn't yet retire logged in §2 / §3.

---

## 5. Adoption checklist (next steps, in order)

Tier-1 primitives
- [x] Wire `confluenceModules.js` to `barUtils` + `fibProjection`.
- [x] Wire `metricsCore` into `honestForecastEngine.summarize` (golden test proves equivalence).
- [ ] Wire `metricsCore` into `nasdaqPerformance` / `zscoreSpreadEngine` / `macroEquityEngine`.
- [ ] Wire `statsCore` into `nasdaqTransforms.rollingZScore/rollingPercentile`
      (bit-faithful), then `globalLiquidityEngine` / `macroEquityEngine`.
- [ ] Wire `indicatorCore` into `hmm5m.js` / `hmm5m-v2.js` (ATR/ADX/rollingZ).
- [~] Generate `instruments.json` from `instrumentRegistry` and have the Python
      bots + backtests read it (single pip/symbol source across languages).
      ✅ bridge built (`scripts/gen_instruments_json.mjs` → `pylego/instruments.json`),
      ✅ `pylego/instruments.py` + `bot/main.py` adopted (pip size). Remaining bots
      + `_PIP_VALUES` unification tracked in `PYTHON_LEGO.md §5`.

Tier-2 level sources (`js/levelSources.js`)
- [x] Build the level-source contract + registry (7 sources) + `collectLevels` / `clusterLevels`.
- [x] Add a **VWAP/anchor** source (`vwap`).
- [x] Build the **render brick** (`js/levelChart.js`) + demo (`level-chart-demo.html`).
- [x] Unify **VuManChu/WaveTrend** — `js/vumanchuCore.js` (one compute, two use
      cases); `js/vumanchu.js` + `asiaRangeEngine` wired; guard standardized on
      `1e-10` (golden-tested). Python copies still to unify.
- [ ] Point the Asia-range confluence modules at `levelSources` (thin
      `levels()`→`check()` adapters) to delete the duplicate level math. ⚠ **NOT a
      bit-identical swap** — confluenceModules and levelSources differ in algorithm
      (e.g. `round_number` 0.1 vs 0.01 grid), timeframe (`sr_level` 30m vs daily)
      and aggregation (`vah_val` per-session vs composite), so it **changes the
      backtest's confluence results**. Do it equivalence-first (make levelSources
      reproduce each module exactly) and **A/B on M1 data** — not a headless swap.
- [ ] Unify the Gold bot's Python copies (`volume_profile.py` nPOC-age, `session_engine.py`
      pivots/VWAP) with these sources — **behind an OOS re-run**, since it touches live code.

P0 cross-language unification
- [ ] `ASSET_PARAMS` + GARCH params + BOCPD/regime score — each behind an OOS
      re-run, per `SYSTEM_ASSESSMENT.md` P0.

---

## 5. Market Valuation Engine (MVE) — isolated subsystem (`js/mve/`)

> A self-contained set of bricks implementing the fair-value / mispricing engine
> designed in `MARKET_VALUATION_ENGINE.md`. **Isolated by design:** nothing live
> imports it, it adds no route, and it's unit-tested on synthetic data
> (`node js/mve/mve.test.mjs`, 110 assertions). Reuses `statsCore` + `backtestStats`
> (`deflatedSharpe`) read-only — copies nothing. Usage: `MVE_RUN_GUIDE.md`.
> Status ✅ = built & tested (edge **unproven** — needs a live data adapter + OOS run).

| Brick | File | Owns | Status |
|---|---|---|---|
| Linear algebra | `js/mve/linalg.js` | solve/inv/transpose/quad for OLS/Kalman/Mahalanobis | ✅ |
| Multi-factor OLS | `js/mve/ols.js` | fit + **prediction σ** (β-estimation error); generalizes `compassDivergence` | ✅ |
| Validation harness | `js/mve/validation.js` | purged/embargoed walk-forward, band calibration, `deflatedSharpe` re-export | ✅ |
| Emitter contract | `js/mve/contract.js` | `estimate()→{fairValue,σ,confidence}`, Bucket A/B/C split | ✅ 📄 |
| Fair-value emitters | `js/mve/emitters.js` | regression (BEER-lite), AR1, vol/positioning weights | ✅ |
| OU convergence | `js/mve/ou.js` | half-life, P(revert)/magnitude/CI, empirical snap-back | ✅ |
| Mispricing | `js/mve/mispricing.js` | standardized residual, **Mahalanobis**, Bayesian posterior | ✅ |
| Regime weights | `js/mve/regimeWeights.js` | regime-adaptive weight table (generalizes `gold-model.js REGIME_WEIGHTS`) | ✅ |
| Ensemble | `js/mve/ensemble.js` | precision/min-variance consensus + dispersion + effN | ✅ |
| Kalman SSM | `js/mve/ssm.js` | hidden-state fair-value fusion (emitters = observations) | ✅ |
| Factor model | `js/mve/factorModel.js` | shared-factor cross-asset loadings + coherence (safe Relationship Engine) | ✅ |
| Confidence engine | `js/mve/confidence.js` | logistic over agreement/fit/calibration/regime/reversion | ✅ |
| Orchestrator + card | `js/mve/index.js` | `runMVE()`, `valuationCard()`, `valuationText()` | ✅ |
| Signal adapter (opt-in) | `js/mve/signalAdapter.js` | blend MVE into `computeSignalScore` — **not wired** | ✅ 📄 |
| Live data adapter | `js/mve/liveAdapter.js` | real OANDA D1 + FRED → `runMVE` ctx (FX=rate diffs, gold=real yield+DXY, **NQ=real yield+HY OAS+VIX, added 2026-07-27, real-data verdict NULL — worse than inert, negative icEdge**); injected fetchers, pure `buildContext`; **`fetchPriceOnly` (2026-07-27)** — OANDA-only, no FRED, for the Kalman branch | ✅ |
| Live endpoint | `server.js` `/api/mve/:sym` | additive read-only route (1h cache); does NOT feed any signal/bot | ✅ |
| OOS validation | `js/mve/validateInstrument.js` | walk-forward no-lookahead IC of mispricing vs forward return, **benchmark-relative `icEdge`** (strips spurious detrend reversion), deflated Sharpe, verdict, via shared **`scoreMispricing`** tail. Two fair-value sources feed it: the factor regression (`oosMispricingSeries`) and **`oosMispricingSeriesKalman`/`validateMechanicalAnchor` (2026-07-27)** — a price-only Kalman local-level filter (Garin's dog/owner "moving fair value"), `qFrac`/`rWindow` calibrated once against a random walk to match the SMA(150) benchmark's memory | ✅ |
| Validation endpoints | `server.js` `/api/mve-validate/:sym` + `/api/mve-validate-mechanical/:sym` | the honesty gate — does the fair value predict returns OOS? Regression branch run on real data (NQ/XAUUSD/AUDUSD NULL, EURUSD weak); Kalman branch built+tested on synthetic data, not yet run live (needs OANDA only, no FRED_KEY) | ✅ |
| Demo page | `mve.html` | synthetic sandbox + **live** (OANDA+FRED) toggle + **🔬 OOS validation** | ✅ |

**Not yet built (deliberate next steps, per `MVE_RUN_GUIDE.md` §7):** dashboard wiring
(signal score / entry scanner / AI summary — the opt-in `signalAdapter` shows the blend),
and OOS proof on real feeds before any real capital. The live endpoint is surfacing-only.

### 1ar. Market Outlook engine (2026-09-02, v2+v3 same day) — 5-day/20-day per-pair context composite + horizon toggle + macro-momentum legs + AI-analysis integration

Owner request: fold everything the dashboard already reads per pair — the
composite technical/COT/macro/carry read, COT positioning, the vol-regime
building/cooling read, and the yield-spread z-score family (the one component
in this repo with a real OOS result, `YIELD_SPREAD_STRATEGY.md`) — into a
5-day / 20-day directional outlook, with a page-level toggle to switch the
per-pair view between Daily / 5-Day / 20-Day, alongside a global
bullish/neutral/bearish summary across the board. Deliberately built as a
**composition of already-computed reads**, not a new signal: the only new
network call is one cached fetch of `/api/yield-spread/plan`, and the engine
inherits `§1am`'s pair-composite output rather than recomputing legs.

**v2 same-day revision**, prompted by the owner's own worry that the v1 macro
leg was a *level* snapshot (today's macro-scorecard/carry state) when a
multi-week horizon calls for *momentum* (which way the backdrop has been
moving). An audit of the repo's Fed/macro data surface found the fix needed
**zero new fetches**: `js/macroChange.js`'s `/api/macro-changes` (DXY/VIX/HY
1d/5d/20d deltas) was already loaded into `today.html` as `macroMoved` and
used only for a decorative "what moved" list. Two new drivers wire it into
the bias score instead, matched to the horizon by picking the 5d delta for
`'weekly'` and the 20d delta for `'monthly'` — the delta window itself does
most of the horizon-adaptation, the leg-weight table just tilts a bit further
the same direction. **Deliberately excluded: central-bank hawkish-score
momentum.** The audit also surfaced `MD files/CB_SENTIMENT_PRICE_TEST.md` — a
pre-registered, already-run test of exactly this hypothesis (does ΔhawkishScore
predict next-day/week price beyond the initial 30-minute reaction) — banked a
clean null on both registered cells (R1~Δscore t=-0.75 N=81; Stage-1 drift
t=0.32 N=82). Adding it here would re-litigate a falsified test, so it isn't a
recognized input at all (tested: `js/outlookEngine.test.mjs`'s "CB sentiment
is NOT a recognized input" case).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Outlook engine** | `js/outlookEngine.js` | `computeOutlook(inputs, horizonKey)` — takes `{composite, yieldSpread, volRegime, cot, events, dxyMomentum, riskMomentum}` (each optional, missing legs left out never zeroed, same convention as `pairComposite`) and a horizon key from the re-exported `forecastCore.HORIZONS` (`'weekly'`=5-day, `'monthly'`=20-day), returns `{bias, biasScore, confidence, agree, total, drivers[], eventRisk, disclaimer}`. Each driver carries a `VALIDATED`/`CONTEXT` status — only the yield-spread leg is `VALIDATED` (with the USDJPY-sign caveat from `js/yieldSpreadEngine.js`'s own header note); the vol-regime driver never sets `biasScore`, only `confidence`. **New drivers (v2):** `dxyMomentumDriver` (DXY's window-selected delta, signed by whether USD is this pair's base or quote — absent for USD-free crosses) and `riskMomentumDriver` (VIX+HY-OAS window-selected deltas, signed by the new `pairRiskLean(base, quote)` helper against the new `CCY_RISK_LEAN` table — a small, standard, hand-set FX haven/risk-currency classification, USD/JPY/CHF haven +1, AUD/NZD/CAD risk -1, EUR/GBP neutral 0; absent for neutral-vs-neutral pairs like EURGBP). Both tagged `CONTEXT` — untested hypotheses, explicitly distinct from the banked-null CB-sentiment claim (see above). Per-horizon leg weights are a small hand-set table (not fitted — CLAUDE.md "the brain is a selector, not more knobs"): yield-spread/dxyMomentum/riskMomentum/cot weighted up at 20d, composite/vol-regime weighted toward 5d. Confidence also falls when a high-impact event sits inside the horizon window. Pure, no DOM/network/globals. `computeOutlookAllHorizons(inputs)` convenience wrapper for both horizons at once. Unit-tested `js/outlookEngine.test.mjs` (30 cases: the original 17 plus `pairRiskLean` sign checks, dxy/risk-momentum driver presence/absence/sign/window-selection, and the CB-sentiment exclusion guard). | `today.html` (module → `window.outlookBrick`, same pattern as `window.pairCompositeBrick`) | ✅ built + unit-tested — **context composite, not a validated predictive signal**, same posture as §1am; the yield-spread leg is the one exception, tagged accordingly |
| **today.html: horizon toggle + outlook chip + drawer section + sidebar summary** | `today.html` (`outlookInputsFor`, `pairOutlook`, `pairOutlookBoth`, `outlookChip`, `renderDrawerOutlook`, `setOutlookHorizon`, `_macroMovedByKey`) | A Daily/5-Day/20-Day pill toggle (`#outlookHzBar`, sibling of `#commandHub` — not folded into `js/commandHub.js` since that file is shared with pages this feature doesn't apply to) persisted to `localStorage` (`outlookHorizon`, same pattern as `rateStatTab`). Daily = the page's existing reads, no overlay. 5-Day/20-Day add a `🔭 Weekly/20-Day bullish/bearish/neutral · confidence%` chip to `pairChipsHtml` (after the existing `⚖` composite chip) and drive a new "🔭 Market Outlook" drawer section (`drOutlookSec`, in the Read tab) showing BOTH horizons side by side with the full driver breakdown, regardless of the global toggle. The sidebar's "Market Outlook" card (after "Volatility Outlook") always shows bullish/neutral/bearish counts for both horizons across the whole board — the "global" view, not gated by the toggle. `loadGate()` gained one new cached fetch (`/api/yield-spread/plan` → `yieldSpreadPlan`, keyed by `js/zscoreSpreadEngine.js`'s lower-cased `ZSCORE_PAIRS` keys — 6 pairs only, everything else has no yield-spread leg). `outlookInputsFor` builds `dxyMomentum`/`riskMomentum` from the already-loaded `macroMoved` (no new fetch) + `PAIR_CCY`'s base/quote lookup. | `cardHtml`→`pairChipsHtml`, `openDrawer`→`renderDrawerOutlook`, `renderSidebar` | ✅ built; verified end-to-end (chip render, horizon switch, drawer breakdown incl. the new momentum drivers, sidebar tally) with synthetic data via headless Chromium — no live OANDA/FRED path in the sandbox |

**Audit of what else is available but unused** (full findings kept in the PR
discussion, not duplicated here): central-bank tone TREND (`/api/fomc/history`
etc. — the multi-meeting hawkish trajectory, distinct from the single latest
score `/api/macro-scorecard` already folds in) reaches nowhere beyond its own
banked-null test above; the Global Liquidity Index (`js/globalLiquidityEngine.js`,
`global-liquidity.html` — level/impulse/cycle regime + FX ranking) is used
**only** on its own page, never reaching `today.html` at all — a real gap,
untested either way, deferred as a larger follow-up (needs a currency-ranking
mapping, not a drop-in driver); the 8-currency `/api/real-yield` engine only
reaches `today.html` via its already-blended macro-scorecard dim, never as a
raw per-leg BEER-lite carry input — also deferred. GPR, credit (`creditCore`/
`creditHmm`), and the Fed/ECB/BoJ balance-sheet liquidity GATE (distinct,
smaller thing from the GLI above) were checked and are already live/rendered
in `today.html` — not a gap.

**v3 same-day addendum** — three more owner asks, addressed in order:

1. **"Does candle shape / slope belong in this?"** Yes, cheaply — the HMM
   daily regime (`r.d.regime.trend_dir`/`trend_prob`/`reliable`) is already
   loaded for every pair, zero new fetches, and is exactly "is price sloping,
   how cleanly." Added as `priceTrendDriver` (CONTEXT, absent for a RANGE
   regime). **Named risk, not hidden:** this same regime read already feeds
   `pairSignal()`'s "technical" leg inside the `composite` driver, so this is
   NOT fully independent evidence — the driver's own `detail` text says so
   explicitly, rather than silently double-counting one read as two.
   Weighted DOWN at 20d (same reasoning as `composite`: a same-day regime
   read says more about the next few sessions than a month out).
2. **Central-bank tone (Fed/ECB/BoE/BoJ), delivered end-to-end.** `loadGate()`
   now fetches `/api/{fomc,ecb,boe,boj}/history?n=6` (small, cached). New
   `describeCbTrend(history)` in `js/outlookEngine.js` summarizes the
   multi-meeting hawkish/dovish trajectory in plain words — **structurally
   NOT a driver**: no `score` field, never read by `computeOutlook`, unit-
   tested to prove attaching a CB-trend object under any input key changes
   nothing about the computed bias (banked-null discipline enforced in code,
   not just by convention — see the null test in §1's own file header for
   why). Rendered in the drawer's Outlook section in its own visually
   separate block ("context only — not scored") via `cbToneFor(r)`, and fed
   to the AI prompt as descriptive color the model is explicitly told never
   to use as a reason for any call.
3. **5-day/20-day output in the AI analysis** (`server.js buildAnalysisPrompt`,
   `/api/analysis`). `assembleSnapshot` now feeds the AI the ALREADY-COMPUTED
   `outlookWeekly`/`outlookMonthly` (bias/confidence/drivers) as ground truth
   — new prompt rule 19 has the model narrate those numbers, not re-derive
   its own, and a new rule states plainly that the daily/weekly/monthly reads
   may diverge and the model must explain divergence rather than force false
   consensus. New schema fields `weeklyOutlook`/`monthlyOutlook`
   (`{bias, confidence, rationale}` — no entry/stop/target, a position read
   not a trade setup). **Refresh-cadence design:** the underlying drivers
   move far slower than daily technicals, so `today.html`'s `analysePair()`
   now keeps the OLD cached weekly/monthly narrative (+ its own timestamp)
   when it's still within a TTL (~1 day weekly, ~5 days monthly), discarding
   the model's freshly-generated one for that call — documented v1 tradeoff:
   the model still writes fresh weekly/monthly prose every call and it gets
   thrown away when the cache is fresh, rather than standing up a second,
   independently-triggered AI call (the cleaner design, deferred — building a
   second live Anthropic pipeline blind, with no `ANT_KEY` in this sandbox to
   verify it against, was judged the wrong place to add risk). Verified via
   Playwright with a mocked `/api/analysis` response: three consecutive calls
   showed the weekly text held constant across an immediate re-click, then
   refreshed independently of monthly once its own TTL was artificially aged
   past expiry — the splice logic behaves exactly as designed.

New/changed since v2: `js/outlookEngine.js` (`priceTrendDriver`,
`describeCbTrend`, +12 tests, 42 total), `today.html` (`cbHistory` fetch,
`cbToneFor`, `analysePair`'s splice cache, `loadDrawerAnalysis`'s new
weekly/monthly cards), `server.js` (`buildAnalysisPrompt`'s new sections/rule
19, the JSON schema's two new fields — **not live-tested end-to-end**: this
sandbox has no `ANT_KEY`, so the actual model output needs a live Railway
check before trusting the prose quality, same as every prior AI-prompt change
in this repo).

**v4 addendum (2026-09-02)** — two gaps the owner found from the live Railway
deploy (first real screenshots of this feature), both real, not cosmetic:

1. **The Daily/5-Day/20-Day toggle changed nothing at the global/currency
   level.** It only ever fed `outlookChip()` (the per-card chip) and the
   sidebar's small bullish/neutral/bearish tally — the page's actual
   "global" reads (Market Read headline, the Market Tone currency-strength
   gauge, the macro-moved list) all stayed on `currencyStrength()`, which is
   hard-wired to today's tape (`pairSignal`) and has no horizon concept at
   all. Fixed with a genuinely new function, not a retrofit of the existing
   one (`currencyStrength()`'s 6 existing call sites are all correctly
   daily-only and were left untouched): `outlookCurrencyStrength(rs,
   horizonKey)` (`today.html`) mirrors its exact aggregation shape
   (base-favored-positive, quote-negative, averaged per currency) but sources
   from each pair's `pairOutlook(r, horizonKey).biasScore` instead of
   `pairSignal(r)` — same missing-leg discipline (a pair contributes only if
   `PAIR_CCY` covers it and the horizon call returns a score). Rendered as a
   new per-currency ranked strength row in the sidebar's "🔭 Market Outlook"
   card for both horizons, alongside the existing tally — the first place on
   the page where flipping the pill changes which currency reads strong/weak,
   not just a per-pair chip. Deliberately scoped here, not into the Market
   Tone gauge or Market Read headline (both daily-only reads on this page by
   design; retrofitting them was judged a bigger, separate UX decision than
   this fix, not requested).
2. **Gold's per-pair Outlook was thin** — a live screenshot showed both
   horizons reading NEUTRAL at 5% confidence off a single COT driver, because
   `GOLD` isn't in `PAIR_CCY` (the FX base/quote table `dxyMomentumDriver`/
   `riskMomentumDriver`'s sign inputs are built from), so it silently got
   NEITHER of them — a real gap, not a deliberate omission (unlike the
   yield-spread leg, which correctly has no gold entry because no such model
   exists for gold). Fixed with a small explicit `ASSET_USD_SIDE`/
   `ASSET_RISK_LEAN` table in `today.html` (`{GOLD: 'quote'}` / `{GOLD: 1}` —
   USD-quoted, classic risk-off haven, same +1 convention as
   `CCY_RISK_LEAN`'s own havens) consumed by `outlookInputsFor` as a fallback
   when `PAIR_CCY` has no entry. Equity indices (NQ/SPX500/US30/US2000/DE30/
   UK100) are deliberately NOT extended the same way — their dollar/risk
   relationship is a materially different, contestable claim (growth-driven,
   not haven-driven) nobody asked to reason through here; better left on
   COT-only than guessed at.

Verified live-shaped in headless Chromium: a synthetic Gold instrument now
carries both `dxyMomentum`/`riskMomentum` drivers with correctly-signed
detail text; a 6-pair synthetic FX book renders a real ranked currency-
strength row (`USD +12`, `JPY -10`, …) with hoverable per-currency pair
lists, matching `currencyStrength()`'s own tooltip convention.

Same evidentiary status as §1am/§1aj: a *selector* composing already-built
reads, shipped with an in-UI disclaimer rather than a performance claim. If
ever promoted toward a real forecast, pre-register the benchmark (does the
5-day/20-day bias beat a naive baseline, OOS, per pair) before running it —
same discipline every prior composite in this registry asks for.
