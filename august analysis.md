# August Analysis — Full Repo Review (2026-08-22)

**What this is.** A page-by-page audit of the entire MacroFXModel repo: every research page, backtest, bot, engine and dashboard — what hypothesis it tests, what maths it actually uses, how complete it is, what evidence exists, and a verdict (**KEEP / MERGE / PARK / CULL**). Its purpose is to let you see the wood for the trees: keep what earned its place, close what's answered, and combine the scattered risk pieces (MAE, stop loss, sizing, giveback) into one system.

**How to read the verdicts.**
- **KEEP** — live/production, or actively earning its place.
- **MERGE → x** — real content, wrong home; fold into x and retire the standalone page.
- **PARK** — question answered (usually a banked null) or blocked; keep read-only as the record, do no further work.
- **CULL** — superseded, orphaned, broken or duplicated; move to `archive/` (pages are static files — culling costs nothing server-side beyond updating `js/commandHub.js`, `js/siteApiMap.js` and `hub.html`).

**Completeness score.** 5 = wired to real data, computes honestly, verdict recorded · 4 = wired and honest, verdict not banked · 3 = works but manual/sample data or known defects · 2 = shell/blocked · 1 = broken/absent.

---

## 1. Executive summary — the wood from the trees

### 1.1 What actually has evidence of edge (only three things)

| # | Edge | Evidence | Where it lives |
|---|---|---|---|
| 1 | **Range-Line strategy (§13)** — Asia/Monday fib ladder, per-cell fade/follow policy learned pooled-IS → per-pair-OOS, held position + chandelier trail | Single-pair Sharpe **≈4.7–6 @2–3× cost**, positive every year and fold, OOS ≥ IS, DSR 100%. Indices transfer stronger (NAS +7.34, Russell +6.58 @3×). The old headline Sharpe ~24 was retracted as 4 stacked artifacts. | `range-line-strategy.html` → `levelsV2Engine.js` → `range_line_bot/` (all on the same golden-tested pylego bricks) |
| 2 | **Yield-spread z-reversion** — US-vs-foreign 2Y spread z-score mean reversion on FX | OOS **Sharpe ~1.1, PF 2.19, 109 trades**, every OOS year 2022–26 positive, 12/12 sweep cells profitable, survived lookahead/sign/cost audits | `yield-spread.html` + `YieldSpreadBot/` (paper) |
| 3 | **Touch-motifs + double tops/bottoms** — structural pivot-touch patterns with adaptive MAE/MFE exits | **11/11 calendar-year folds PF>1** with costs (pooled PF 1.174, n≈28k); combined portfolio Sharpe 2.45 / −38.7% DD; independently corroborated by pattern-lab's costed audit (double_top OOS PF 1.31, 24/25 pairs positive). Not yet live-validated. | `touches-backtest.html`, `motif-combined-backtest.html`, AnalogML motif line (Python) |

Honourable mention: the **post-FOMC 5-day USD drift** is a real market finding (+26.3bp/event, 99.8th placebo pctl) but the tradable spec **failed** its own OOS t≥2 bar — banked as knowledge, not a system.

Everything else in the repo is either a banked null, a falsified result, honest-but-unrun machinery, or infrastructure.

### 1.2 What is definitively dead (do not re-litigate)

These are **banked nulls with recorded numbers** — the docs already say "answered, do not re-open":

- **Confluence-stacking fades**: POI-reaction (46,677 trades, Sharpe −3.43, 1/26 pairs positive); range-extension family intraday AND swing (0/26 pairs; the one "survivor" was fill-conditioned lookahead, retracted); macro z-score gating of the same zones (PF 0.88; "scoring a zero-edge entry can't create one").
- **VWAP reversion**: 0/26 pairs, t = −46.6, gross ≈ zero — no edge at all, not a cost problem.
- **VuManChu direction**: the WaveTrend "cycle" reproduces exactly on a random walk; every representation |IC| ≈ 0.02–0.05, under the spread.
- **EMA crossover / FX-only momentum**: buy-and-hold beats the cross on 7/8 markets; cross-sectional FX momentum indistinguishable from noise (DSR-culled).
- **12 famous retail strategies** (strategy-lab gauntlet): 0/12 survive honest costs + OOS.
- **k-NN price-shape analogs** (AnalogML): every positive number was a self-adjacency bug; post-fix portfolio 0.638×, Sharpe −0.14. Flags, pennants, H&S, triangles also null.
- **NQ-QMR** — *falsified*, the repo's defining cautionary tale: the engine gave every trade a free pass through the 13:00–14:00 NY-open hour. Honest Sharpe **0.06 vs claimed 1.56** on the same 590 trades. All downstream results (walk-forward Sharpe 1.18, both-sides book, tearsheet) withdrawn.
- **Macro as a signal**: econ-trend momentum (OOS 0.09, below placebo), macro-direction (null), credit-stress gating (made the book *worse* OOS), CB-sentiment→price (priced in 30 minutes, nothing at daily horizon), FOMC surprise magnitude (null), GLI→FX (Sharpe 0.01). The repo's own verdict: macro is "decoration, not a judge" — its correct roles are the event/news gate and slow regime context, never a per-minute signal.
- **Mechanical fades at vol-forecast lines**: every tested exit negative; the overshoot mechanism (price runs ~36 pips past the line; MFE≈38/MAE≈37) kills tight and wide stops alike. Lines are context, not triggers.
- **Misc**: hedge-v1 correlation "hedging" (bleeds by construction), hurst feature (dropped — predicts nothing), layer2 vol-bot SL/TP grid (net-negative every pair), sltp hindsight-best ≈ zero edge, overnight hold (gross effect, net negative), max-copier (autopsy: post-impulse drift is a coin flip), inverse-σ sizing on chandelier books (chandelier already σ-normalizes), Dax IFO (decayed 2020+), MVE fair-value z-fade (deflated Sharpe 0.008 — "worse than inert").

### 1.3 The repo's actual diseases (not bad ideas — process)

1. **Verdicts not banked.** The most common failure is an *honest, well-built harness whose decisive run was never recorded*: pooled-fade, news-exhaustion, vol-horse-race, sigma-fade-ab, honest-policy, exhaustion-forecast, pivot-spike (Q1), credit-leadlag (Q4), liquidity-backtest, macrofx-zone, trend-v2, carry-factor, fx-vol-carry, range-level-edge (never even run). ~15 pages compute honestly and bank nothing.
2. **Duplicated engines.** Six level engines, seven regime classifiers, four live regime bots, two decision engines (that one's by design), three position-sizing implementations, ≥6 independent MAE computations, four net-liquidity computations, three rates viewers, five competing dashboards, two HMM hand-rolls, ~11 private pip-size dicts (with proven drift), triplicated Gold module trees, and simulator logic existing in JS + Python + live-bot form simultaneously.
3. **Live ≠ validated (port drift).** The range-line bot ships `confluence_min: 0` while the docs call 2 "the best OOS book"; V7 slope window 8 vs backtest's 40–60; vol bot trades COG bands the book never validated; MacroEquityBot is live-trading a signal whose post-WALCL-unit-fix re-validation (Q6) is still outstanding.
4. **Risk is fragmented** (see §3): the parts of one risk system exist as ~15 disconnected pages/scripts, and the account-level safety gate — built and tested — is wired into nothing.

### 1.4 The headline numbers

Across the audit: roughly **45 KEEP** (of which ~15 are production infra), **25 MERGE**, **35 PARK** (mostly banked nulls kept as records), **20 CULL**. The site's own `SITE_MAP.md` taxonomy (168 root pages) is accurate and this report is consistent with it — the main additions here are the merge map, the risk-system assembly plan, and the run-and-record queue.

---

## 2. Hypothesis scoreboard

Every hypothesis the repo has pursued, with its current evidential status.

| Hypothesis | Status | Key number | Action |
|---|---|---|---|
| Asia/Monday range fib ladder, per-cell fade/follow + chandelier (§13) | ✅ **PROVEN** (honest OOS) | Sharpe 4.7–6 @2–3× | Live wiring; fix `confluence_min` drift |
| 2Y yield-spread z mean reversion | ✅ **PROVEN** (OOS) | Sharpe ~1.1, PF 2.19 | Forward-validate via bot; don't touch |
| Structural touch-motifs / double tops | ✅ **STRONG** (walk-forward) | 11/11 folds PF>1; Sharpe 2.45 combined | Forward paper track; backend port |
| Post-FOMC 5-day USD drift | ✅ finding / ❌ not tradable | +26bp/event; OOS t=1.11 | Banked knowledge |
| NQ fresh-extreme state gate on TSMOM | 🌱 weak positive | OOS Sharpe 0.54→0.64 | Optional follow-up |
| COG replication: line placement | ⛔ answered | his lines ≈ ours (width 0.97–1.13×) | Closed |
| COG replication: tide/GEX/OI-magnet forward test | 🧪 **stalled** | 2 rows logged since 2026-07-31 | Restart logging or archive |
| OI dealer-gamma walls (PIN/BREAKOUT) | 🧪 collecting | calibration "collecting" | Keep forward test |
| Confirmed WT+VWAP pooled fade | 🧪 unrecorded | antecedent 26/31 lift | **Run once, bank verdict** |
| News/calendar exhaustion conditioning | 🧪 unrecorded | — | **Run once, bank verdict** |
| Exhaustion-band fade/follow/regime (honest harness) | 🧪 defects open | SL artifact documented | Fix, run, bank |
| Honest-fills reproduction of COG "Complete Book" | 🧪 unrecorded | — | **Run once, bank verdict** |
| HAR-RV σ upgrade → trading lift (sigma-fade-ab) | 🧪 unrecorded | HAR better calibrated | **Run once, bank verdict** |
| σ-estimator horse race (8 models, QLIKE) | 🧪 unrecorded | — | **Run once, bank verdict** |
| Real-level vs placebo-level bounce (range-level-edge) | 🧪 **never run** | — | **Run before any new level work** |
| Daily pivots mean reversion (Q1) | 🧪 unrecorded | — | Run once, bank |
| Credit Δ leads NQ vol beyond persistence (Q4) | 🧪 unrecorded | — | Run once, bank |
| Macro-equity composite ×equity exposure (Q6) | 🔁 contaminated | pre-fix OOS 1.21 untrustable | **Re-run — highest priority; a live bot depends on it** |
| Liquidity levels (POC/VAH/OI) improve range-line book | 🧪 unrecorded | — | Run once, bank |
| NASDAQ 4-gate / COG threshold family (Q8) | 🧪 no honest verdict ever | ~2 real-data trades | One committed run or archive family |
| VIX vol carry (P8) | ❌ failing own bar | walk-forward OOS Sharpe **−0.62** | Park; confront the number in the doc |
| FX variance risk premium gate | 🧪 blocked | static IV snapshots | One real Railway run |
| COT positioning factor (pre-registered 2026-08-21) | 🧪 not run | — | Run once, bank |
| Cointegration spread trading (hedge-v2 / portfolioBacktest) | 🧪 open (Q10) | v1 banked negative | One stack owns it; A/B vs v1 |
| Trend/carry multi-factor book | 🧪 legs thin | FX-only OOS 0.15±0.37 | Blocked on multi-asset breadth, not code |
| Confluence-stacking fades (POI/range-ext/zscore) | ⛔ **NULL** ×3 | Sharpe −3.4; 0/26; PF 0.88 | Closed |
| VWAP reversion | ⛔ NULL | t=−46.6, 0/26 | Closed |
| VuManChu direction | ⛔ NULL | \|IC\|≈0.02–0.05 | Closed |
| EMA cross / FX momentum / 12 retail strategies | ⛔ NULL | 0/12 survive | Closed |
| k-NN shape analogs; flags/H&S/triangles | ⛔ NULL (post-bugfix) | Sharpe −0.14 | Closed |
| NQ-QMR session continuation | ⛔ **FALSIFIED** | 1.56 → 0.06 | Tombstone kept |
| Macro-as-signal (econ-trend, direction, credit gate, CB sentiment, GLI) | ⛔ NULL ×5 | see §1.2 | Context-only roles |
| Mechanical fades at vol lines | ⛔ NULL | overshoot ≈36 pips | Lines are context |
| Hurst feature, inverse-σ sizing, hedge-v1, overnight hold, max-copier, Dax IFO, MVE z-fade | ⛔ NULL each | — | Closed |

---

## 3. The combined risk system (your MAE / stop-loss / risk-positioning hunch)

**Your instinct is correct.** The pages that individually look thin — `position-sizer`, `sltp-distribution`, `giveback`, `backtest-exit-study`, `fill-realism`, `journal`, `reversion-proof`, plus `analysis/*.py` and `safety/` — are the disassembled parts of exactly **one pipeline**. Almost every joint between them already exists in prose (CLAUDE.md doctrine, LEGO docs) but not in code.

### 3.1 The pipeline the parts imply

```
(1) ENTRY QUALITY          trade-cards / upcoming-trades / Trade_Decision_Engine
        │                  + backtest_entry_quality.py buckets
        ▼                  (the one OOS-validated filter — USD-trend alignment — is documented but UNWIRED)
(2) STOP DISTANCE          sltp-distribution ("no fixed SL is stable"; per-asset room-needed tiers)
        │                  + exit-study MAE p50/p75/p90 + MAE_DYNAMIC_STOP early-adverse profile
        ▼                  + position-sizer's noise-floor (4h P75 envelope) as the live floor
(3) POSITION SIZE          position-sizer.html  ≡  backtestSystem/risk.py::position_size()
        │                  (same fixed-fractional formula in two languages — converge them)
        ▼
(4) EXIT / GIVEBACK        giveback.html + bot_giveback.py + backtest-exit-study
        │                  = ONE excursion engine rendered three ways; chandelier trail is the
        ▼                  proven exit (converted fragile 3.45 → cost-robust 7.29 on the range book)
(5) ACCOUNT BACKSTOP       safety/risk_gate.py + kill_switch.py — built, tested, WIRED INTO NOTHING
        │                  (the −18.5R day, where the in-memory kill switch reset ~45×/run, is the cost of this gap)
        ▼
(6) FEEDBACK LOOP          journal.html + trade_analyzer.py outcomes → currently go NOWHERE
                           → route closed trades back into a persisted MAE/MFE store so (2)'s quantiles update
```

### 3.2 What the evidence has already settled

- **Measure MAE/MFE from the real M1 path, never close-to-close** (house doctrine, already implemented in the pylego broker).
- **The proven exit is the chandelier trail** (stop = peak − ½ rung, never tighter than inner stop). It beat fixed TP, zone-walk, and breakeven variants on the only validated book.
- **Stops at the level die to overshoot** (~36 pips past vol-forecast lines) — confirmation entries and room-to-breathe stops are mechanically motivated, not folklore.
- **Inverse-σ sizing adds nothing** on a chandelier book (already σ-normalized) — banked null; don't rebuild it.
- **Confidence-scaled sizing is currently anti-predictive** (DecisionEngine "high-confidence" multiplier actually *shrinks* size — BUG_LIST #32) — don't scale size by conviction until something predicts.
- **A working −3R day-stop halves both total loss and drawdown** (measured on the real −18.5R incident).

### 3.3 What's missing to close the loop (the build list)

1. **A persisted per-pair MAE/MFE quantile table** — one store, written by one excursion engine, read by stops (JS *and* Python). Today MAE is computed ≥6 times and stored nowhere.
2. **One stop spec**: `stop = max(noise floor from forecast P75 envelope, winners' MAE quantile)` per pair — replacing the three unrelated conventions currently in use (0.75σ grading rule, bot ATR, forecast-range multiple).
3. **One sizing implementation** shared by `position-sizer.html` and `risk.py`, with the heat cap fed the *whole* book — including the five stale hedge-bot pair positions (open since 2026-06-26, no SL, one with `ticket_a == ticket_b`) that nothing currently counts. Reconcile or flatten those.
4. **Wire the safety gate** (`safety/risk_gate.py`) in front of every live order. Everything else in the risk slice is analytics until an order actually passes through this gate. This is the keystone.
5. **Merge the three excursion surfaces** (giveback.html, bot_giveback.py, backtest-exit-study) into one "excursion & exit quality" page per bot, and validate its counterfactuals (bank-70%-of-peak, BE@1R, time-stops) with the purged walk-forward + deflated-Sharpe brick already sitting unused in `js/mve/validation.js`.
6. **Close the journal loop**: closed trades (manual and bot) feed the MAE/MFE store.

This is the single highest-value consolidation in the repo: no new alpha required, all parts exist, and it protects the two live edges you already have.

---

## 4. Area-by-area audit

### 4.1 Forecasting suite (18 pages + 2 Python modules)

The suite's real core is three things: **forecast-path** (the live cone with its own forward grading), **forecast-analysis + forecast-refresh** (measured base rates at every line — the deliberate pivot after the v2 backtester's SL artifact produced fantasy OOS Sharpe 10–15), and **forward-track** (the live post-research record that will settle whether the pooled fade is real). Chief gap: most pages compute honestly and **bank nothing**.

| Page | Hypothesis / purpose | Method (actual maths) | C | Verdict |
|---|---|---|---|---|
| forecast-path.html | Live intraday/daily price cone + grading | Monte-Carlo paths, session-shaped σ; 50/75% containment claims; KV forward record | 5 | **KEEP** — production face |
| forecast-analysis.html | What price does at each line — measure, don't trade | Per-line touch outcomes, binomial z vs 50/50, n≥30 gates, per-year consistency, IS policy → OOS triple-barrier | 4 | **KEEP** — methodological anchor |
| forward-track.html | Live forward record of confirmed WT+VWAP fade vs backtest | Same `detectSessionSignals` brick (imported, not copied); Δ(forward−backtest) as overfit tell | 5 | **KEEP** — most valuable single page |
| forecast-accuracy.html | Range magnitude right? Where does price turn? | Realized vs forecast H-L; exceed rate vs 50% ideal; reversal ÷ median (~0.65× FX) | 4 | **KEEP**; absorb coverage + timeline |
| forecast-coverage.html | Does HL75 contain 75% of days? | No-lookahead coverage in binomial SEs; GPD on breach severity | 4 | **MERGE → forecast-accuracy** |
| forecast-range-timeline.html | Same comparison as a timeline | Forge walk-forward export, causality-tested | 4 | **MERGE → forecast-accuracy** |
| forecast-book-report.html | Tearsheet of per-line fade book | Renders analyser dataset; per-trade annualized Sharpe | 4 | **MERGE → forecast-analysis** (headline is what fill-realism falsifies) |
| forecast-reversion.html | Interactive fade lab (ladders, styles, SL/TP grid) | Fitted p50/p75/p90 ladders, COG constants, exhaustion ladder; WT-stretch lifted fade WR 50→62% OOS (sub-cost) | 4 | **KEEP** — exploration cockpit |
| forecast-style-fade.html | Which forecaster's lines fade best (6×4 grid) | WT+VWAP confirmed; pooled after-cost expectancy, 100-trade min/cell | 4 | **PARK** after one banked run |
| forecast-blend.html | Model cone + analog cone blend | Vincentization weighted by trailing pinball loss | 3 | **PARK** — unverified, downstream of path |
| forecast-replay.html | Replay archived bands on candles | Overlay only | 3 | **CULL** — forecast-reversion supersedes |
| forecast-refresh.html | Admin: rebuild analyser dataset | Plumbing | 4 | **KEEP** |
| honest-forecast-harness.html | Fade/follow/regime at exhaustion band, honest | Breach-and-reclaim fills, costs, OOS ≥30 trades | 3 | **PARK until SL/breach defects fixed** |
| honest-policy.html | COG "Complete Book" on honest 1-min fills | IS cell selection → OOS real fills, no mark-to-close, pooled equity | 4 | **KEEP — run and bank** |
| exhaustion-forecast.html | Where price fades from; falsify range-budget fade | k_fade = median(reversal÷σ) IS→OOS; block-bootstrap Sharpe floor; pre-registered "expect collapse" | 4 | **KEEP — run and bank** |
| estimator-ab.html | HAR-RV vs Yang-Zhang σ | Pinball loss at 50/75th, paired daily wins, walk-forward | 4 | **KEEP** — wire verdicts into change log |
| rank-ic.html | Do the stack's scores sort outcomes at all? | Spearman rank IC vs forward window, OOS, benchmark IC=0 | 4 | **KEEP** — cheapest honest first gate |
| forecaster-backtest.html | Level backtest + random-search optimizer | EWMA λ=0.94, Feller 1.572/2.049; MAE-calibrated SLs; MFE-trail | 4 | **MERGE → ForecasterOptimizer** (viewer only) |
| VolRangeForecaster/ | Canonical Python forecaster + backtest | EWMA→Feller/half-normal bands, per-class corrections, news multiplier; <1% MAE vs reference | 5 | **KEEP** — canonical engine + data store |
| ForecasterOptimizer/ | 26-pair sweep, honest train/holdout | Numba port validated bit-identical; anti-fake-stop constraint; holdout best cadjpy Calmar 18.8 | 5 | **KEEP** — the only legitimate optimizer |

### 4.2 Volatility suite (17 pages + 3 modules)

Core: **vol-forecast-v2** (the live σ everything trades off, calibration tracked), **volBacktestEngine/forecastCore** (canonical band maths — HL = 1.572σ Feller, OC = 0.6745σ half-normal — imported everywhere), **volatility_bot** (production), **vol-research-book** (synthesis), **volatilityExhaustion/** (the one study with fully banked pre-registered findings: distance-from-open exhaustion NULL; fresh-extreme hold weakly consistent 0.505–0.553 FX; NQ state-gate lifts TSMOM 0.54→0.64).

| Page | Hypothesis / purpose | Method | C | Verdict |
|---|---|---|---|---|
| vol-forecast-v2.html | Live production vol forecast | YZ(30) fx/gold, GARCH(1,1) indices, HAR references, news multiplier, hit-rate tracking | 5 | **KEEP** — the production forecaster |
| vol-forecast.html | Prior-gen forecast dashboard | EWMA + BM constants | 4 | **MERGE → v2**, retire |
| vol-backtest.html | Original band-fade backtester | Per-class σ, EMA regime, M1 fills | 4 | **KEEP** — source of truth for vol math |
| vol-backtest-v2.html | Adaptive selector vs fixed legs | Day-type T selector; shared forecastCore | 4 | **KEEP** — re-run post causality fix (Q2) before citing |
| vol-horse-race.html | 8 σ-forecasters, QLIKE-ranked | RW/EWMA/HV/YZ/GARCH/HAR/combos vs 5-min RV | 4 | **KEEP — run and bank** |
| vol-forecast-bench.html | Incumbents vs HAR (2-model) | MSE+QLIKE walk-forward | 4 | **MERGE → horse-race** (strict subset) |
| vol-research-book.html | Chaptered forecast-quality book | 20 sections, BH-corrected sign tests, recal multipliers | 4 | **KEEP** — consolidation surface |
| vol-forecast-research.html | Forecast accuracy/calibration/skill | MAE/RMSE, exceed calibration, skill vs climatology | 4 | **MERGE → research-book** |
| weekly-vol-backtest.html | Monday-anchored weekly band fade | σ_d×√5, maeCalib stops, regime gates | 3 | **KEEP after Q3 defect fix**; remove dead Hurst option |
| layer2-vol-audit.html | Vol bot entries × SL/TP grid | Real M1 replay; eurusd −0.074R, gold −0.032R best cells | 5 | **PARK** — banked null |
| expected-moves.html | Blended cone + direction + GEX board | Cone A+B blend, walk-forward weights, honest framing | 4 | **KEEP** |
| sigma-fade-ab.html | Does HAR σ lift the pooled fade? | Identical fade run twice, σ swapped | 3 | **KEEP — run and bank** (the accuracy→edge converter) |
| vix-vol-carry(-backtest) | P8 short-VXX vol premium | Vol-cone pctl, term-structure gate, circuit breaker | 3 | **PARK** — own chart shows OOS Sharpe −0.62 |
| fx-vol-carry-backtest.html | CVOL-implied − realized VRP as gate | VRP gating of exhaustion-band fade | 2 | **KEEP** — needs one real Railway run |
| volatility-classifier-standalone.html | Browser classifier test | imports Node-only module — cannot run | 1 | **CULL** |
| volatility-classifier-backtest.mjs | Fade/follow/classifier 3-way | WT + day-type vote at band touches, pre-registered bar | 3 | **MERGE → vol-backtest-v2** |
| volatility_classifier_standalone.py | Python twin | hand-ported copies of the JS math | 2 | **CULL** — drift hazard |
| hurst-bench.html | Hurst: signal or constant? | R/S vs DFA, rank IC, pre-registered drop rule | 5 | **PARK** — banked null (dropped 2026-07-25) |
| volatilityExhaustion/ | Where does expected vol exhaust? | YZ σ reproduced to 1.7e-18 vs JS; barrier races; Tiers 1–8 pre-registered | 5 | **KEEP** — best-documented research module |
| volatility_bot/ | Live per-line fade bot | Frozen plan, golden-tested decide(), pylego risk | 5 | **KEEP** — production |

### 4.3 COG / VuManChu / fades (20+ pages)

The COG effort **converged, then stalled at the exact point that matters**. The line-replication question is closed (constants pinned: 1.56/1.93/0.74/1.24 × σ; anchor identified; his levels ≈ ours 0.97–1.13×; fading his line pre-registered null). What remains is one thing: the **forward test** of the tide/GEX/OI-magnet hypothesis — methodologically excellent, pre-registered (≥70% direction agreement at n≥30), and sitting at **2 rows since 2026-07-31**. Restart daily logging or archive the effort.

| Page | Hypothesis / purpose | Method | C | Verdict |
|---|---|---|---|---|
| cog-replay.html (+ cog-standalone/) | Reference-capture + eyeball tool | KV reference dumps + OANDA candles | 5 | **KEEP** — feeds the whole evidence base; automate the standalone copy sync |
| cog-reverse-engineer.html | Pin COG's vol calc + anchor | Back-solved constants; anchor via vol-ratio ≈ 1 | 4 | **PARK** — succeeded; baked into cogBands.js |
| cog-level-poc.html | His levels vs ours, paired A/B | Identical measurement per reference day, N≈20 | 4 | **PARK** — answered (≈ equal) |
| cog-fade.html | Fade at his line placement | C×σ dynamic H-L; confirmation + blind scalp exits | 4 | **PARK** — prior null; record run output |
| cog-signal-log.html | Costed forward record of his alerts | Manual 4-stage entry → resolved vs M5 + costs | 4 | **MERGE** with FORWARD_LOG (one record); keep as entry UI |
| cog-v2-engine.html | Async 3-gate state machine (Setup/Risk/Trigger) | Hysteresis liquidity gate, frozen risk gate, timed trigger; conf ≥35 | 4 | **KEEP** — live shadow engine; bar = the forward log, not more building |
| cog-replication/ | Tide/GEX/OI-magnet forward test | Pre-registered bars; QMR gates falsified & closed | 2 | **KEEP** — restart logging or it's dead weight |
| cog/ (12 lessons) | Documentation | honest, self-aware | 5 | **KEEP** |
| vumanchu-chart.html | Server-rendered WT pane (Telegram alerts) | vumanchuCore, golden-tested (73 checks) | 5 | **KEEP** — production infra |
| vumanchu-state.html | Live MTF state + forward scorecard | Frozen 10y lab table lookup; forward logger | 4 | **KEEP** — the lab's forward validation |
| vumanchuLab/ | Conditional-probability terrain map | 3.75M bars, matched baselines, falsifier, OOS by year | 5 | **KEEP** — evidence base (+2–5pp tilt, clears no spread; 0/15 cells beat cost) |
| vumanchu-fade.html | WT-gated band fade | causal WT read at touches | 3 | **MERGE → pooled-fade** |
| backtest-vmc.html | WT at bot's historical entries | 279-trade snapshot, n<30 flags | 3 | **PARK** — superseded by lab |
| pooled-fade.html | The decisive pooled confirmed-fade test | WT+VWAP confirm, trader's real exit, ×1/2/3 cost | 4 | **KEEP — run and bank the verdict** |
| fade-viewer.html | Per-session trust tool | shared `inspectSession` brick | 5 | **KEEP** |
| continuation-fade-ticker.html | Live fade/continuation ticker | decisionCore — self-labelled UNCALIBRATED | 2 | **PARK** |
| reversal-fade.html | Re-placed fade line at k×median | k fit IS-only → OOS | 4 | **PARK** — family already answered |
| reversal-study.html | Where price actually reverses | Zigzag swings; **FX turns at ~0.84× median, indices blow through (1.0–2.5×)** — a durable, reused fact | 5 | **KEEP** |
| news-exhaustion.html | Calendar predicts fade-vs-follow | News-tier buckets, costed fade AND follow expectancy, IS/OOS | 4 | **KEEP — run and bank** (last untested exogenous conditioner) |
| vwap-reversion.html | VWAP as intraday fair value | 3 modes, walkBars fills, costs, IS/OOS | 5 | **PARK** — model documented null |

### 4.4 Levels / ranges / zones / Asia session (24 pages)

**Six distinct level engines exist.** The evidence is unambiguous: every confluence-stacking fade variant is a banked null, while the **rangeLineAnalyser ladder → levelsV2Engine → range_line_bot** stack (all sharing golden-tested pylego bricks — the correct pattern) is the only validated edge. Canonicalize on it.

| Page | Hypothesis / purpose | Method | C | Verdict |
|---|---|---|---|---|
| range-line-strategy.html | §13 per-cell fade/follow policy | Fib ladder −10.5..+10.5 of Asia 5m body / Monday 15m; pooled-IS→per-pair-OOS; chandelier; DSR | 5 | **KEEP** — the crown jewel |
| levelsV2Engine.js + telegram-v2 | Live grader on frozen OOS policy | identical ladder bricks; `policy_v2` KV; entry ledger | 4 | **KEEP** — canonical live grader |
| range_line_bot/ | Production executor of §13 | pylego rangeline bricks, paper/MT5, risk guard | 4 | **KEEP**; resolve `confluence_min: 0` vs docs' 2 |
| range-zones.html | Live zone monitor for the bot | display-only | 4 | **KEEP** |
| levels.html + levels.js (v1) | v1 confluence + signalScore grading | fib confluence 2-pip; hand-set weight blend (HMM/ADX/CHoCH/TWAP/EMA/Hurst/pivots/macro) | 4 | **MERGE → v2 path** once ledger comparison completes |
| levelEngine/ (Python) | COG σ-band base rates | COG + Feller calcs, θ=0.25 touch scan, 4-fold robustness; NQ close_up_75 follow +0.15R OOS n=309 | 5 | **KEEP** — σ-band benchmark |
| range-level-edge.html | Real vs **placebo** level bounce | ±D barrier race vs shifted placebo | 2 | **KEEP — RUN IT** (never run; decisive and cheap) |
| range-ext-backtest.html | Confidence-brain A/B on extensions | state-conditioned top-N; costs; IS/OOS | 5 | **PARK** — banked NULL (−0.115 R/trade, 0/26) |
| range-fib-backtest.html | Bare fade base rate | stripped limit-fade, SL-first pessimism | 4 | **MERGE → range-line-strategy** as control arm |
| asia-range-backtest.html | Live-stack-replica backtest — **zero costs** | full confluence modules, triple-barrier | 4/2 | **MERGE** — live-parity testing only; never quote its P&L |
| asia-range-analysis.html | Probability explorer over that book | pivot heatmaps, MFE/MAE buckets | 4 | **MERGE → asia-range-backtest** tab |
| asia-npoc-confluence.html | Unfilled prior-day lines × SD ladder | SD grid + reversionLadder/COG lines | 3 | **KEEP (short leash)** — needs a touch-outcome stat |
| touches-backtest.html | N-touches motif signal card | frozen motif export; OOS +0.091R, PF 1.16, 11/11 folds | 4 | **KEEP** — second real edge; port to backend |
| poi-reaction-backtest.html | ColezTrades POI confluence | costed IS/OOS | 5 | **PARK** — banked NULL (Sharpe −3.43) |
| pivot-spike-backtest.html | Daily pivots mean-revert? (Q1) | PP/R1/S1/R2/S2, SL-first M1 walk | 3 | **KEEP one run**, bank, then likely park |
| macrofx-zone-backtest.html | Multi-model Decision Zones | collectLevels/clusterLevels + dayType selector | 3 | **Run once or CULL** (third confluence-stacking test) |
| gold-zones.html / oi-zones.html | Live zone monitors | KV display | 4 | **KEEP**; consider one consolidated zone monitor |
| entry-trigger-lab.html | Eyeball-triage of 5 discretionary triggers | day-walk SL/TP counts | 3 | **PARK after triage**; promote survivors into range-line harness |
| price-slowdown-lab.html | RANGE vs DISPLACEMENT budgets | YZ σ, computeBands, approachVel | 4 | **KEEP** as reference ("kinematics beat static budgets") |
| zscore-backtest.html | Hard z-gate fade (v1) | rolling z 90d arms the day | 3 | **CULL** — superseded, flawed, negative |
| zscore-v2.html | z as weighted confidence factor | compositeConfidence; pre-registered bucket test | 4 | **PARK** — banked null; keep the bricks |
| archive/ (v5.2, asia py) | ancestors | — | — | already archived — done |
| level-chart-demo.html | dev demo, synthetic data | — | 3 | **PARK** |

### 4.5 Macro / econ / rates / liquidity (~28 pages)

Two things wearing one dashboard. The evidence-bearing spine is good — seven pre-registered tests designed, five run, **one survivor (yield-spread) vs four banked nulls** — but the display layer is sprawl: ~20 viewer pages whose outputs terminate in HTML, four independent net-liquidity computations, three rates viewers, eight clone econ-release pages. Macro feeds exactly **one** trading decision (yield-spread); everything else is context.

| Page | Hypothesis / purpose | Method | C | Verdict |
|---|---|---|---|---|
| yield-spread.html + YieldSpreadBot/ | **The survivor** — 2Y spread z reversion | z(90–126d), pub-lagged, enter \|z\|≥2–2.5, exit 1.5/20d | 5 | **KEEP** — forward-validate, don't touch |
| macro-scorecard.html | Cross-engine aggregation per currency | equal-weight mean of engine composites | 3 | **KEEP** as the single macro landing page |
| cpi/gdp/ism/ppi/retail-sales/labor-market/trade-balance/consumer-confidence.html | Per-release composition scores | FRED/OECD, YoY, z vs trailing 24 obs, clip to −1..+1 | 4 | **MERGE all 8 → one econ-releases page** feeding scorecard |
| fomc/ecb/boe/boj-sentiment.html | Hawk/dove scoring | point-in-time capture, diff, Claude JSON score + Apel–Blix-Grimaldi lexicon | 5 | **KEEP** (consolidated UI optional) — validated scorers, formally context-only |
| beige-book.html | Leading qualitative signal | same LLM template + regionalBreadth | 4 | **MERGE → CB sentiment page** as a tab |
| econ-trend.html | Fundamentals momentum (AQR-style) | cross-sectional z, pub lags, placebo | 5 | **PARK** — banked null Q11 |
| macro-direction.html | Carry+real-yield+VIX votes → drift | 3 ±1 votes, forward returns, costs | 4 | **CULL page** — null banked; keep core+doc |
| macro-conditioner.html | Risk regime beyond σ? | σ-tercile × macroCore regime, pre-registered | 4 | **KEEP one run** then decide |
| rate-matrix.html | Rate-differential grid | display of laggy OECD monthlies | 2 | **MERGE → scorecard tile or CULL** |
| real-yield.html | 10Y − CPI per currency | causal join, z-trend | 4 | **KEEP** (scorecard input); run or delete the registered test |
| yield-curve.html | 2s10s slope context | slope + z-trend | 3 | **MERGE** into one rates page with real-yield |
| yield-coupling(-real).html | FX↔spread coupling/divergence | rolling Pearson, gap residual, fade backtest | 4 | **PARK** — "context, logged-but-inert"; two pages for one inert lens |
| credit-leadlag.html | Credit Δ leads NQ vol? (Q4) | predictors vs forward RV, IC vs lagged-vol benchmark | 4 | **KEEP one recorded run**, else cull |
| credit-stress.html | CSI exposure gate | equal-weight 252d z gate vs VIX-alone | 5 | **PARK** — banked null Q12 |
| global-liquidity.html + GlobalLiquidity/ | GLI regime → FX book | multi-CB balance sheets, impulse, cycle clock | 4 | **PARK pending one post-WALCL-fix re-run**; consolidate all liquidity consumers |
| liquidity-pulse.html | Daily TGA/RRP flows → NQ | −(ΔTGA+ΔRRP), settlement-day splits | 3 | **MERGE** into consolidated liquidity page |
| liquidity-gate-backtest.html | Weekly net-liq z gate | 252d z vs 6 indices | 3 | **MERGE** — results void (unit bug), fourth net-liq copy |
| liquidity-backtest.html | Intraday POC/VAH/OI levels help range book? (misnamed — microstructure) | A/B on range-line analyser, pre-registered pass rule | 4 | **KEEP one recorded run**; rename |
| cot-extremes.html | Positioning extremes context | OI-normalized spec share percentiles, 156w | 4 | **KEEP** + run the pre-registered COT factor test before wiring anything |
| news-exhaustion.html | (see fades §4.3) | — | 4 | **KEEP — run and bank** |
| Dax Base IFO System/ | IFO MoM → DAX | sign rule + OLS | 3 | **CULL (archive)** — decayed 2020+; lessons extracted |
| macro-regime-conditional/ | Composite score × QQQ/SPY | weekly z-composite, ladder, WF | 4 | **PARK pending Q6 re-run** |
| system-credit-equity/system-yield-curve.html | P2/P3 display panels | hand-tunable thresholds — unfalsifiable as shipped | 2 | **CULL** — honest versions exist elsewhere; one already nulled |

### 4.6 Systematic strategies / portfolio / equity / gold (~28 pages)

Only the **touch-motif family** has fold-consistent, costed, walk-forward evidence here. The trend/carry/multi-factor stack is honest machinery whose FX-only legs test at zero (the thesis "diversification is the edge" is demonstrated but needs multi-asset breadth to monetize). **P1 macro-equity is live-trading on contaminated evidence — the Q6 re-run is the most urgent validation in the repo.**

| Page | Hypothesis / purpose | Method | C | Verdict |
|---|---|---|---|---|
| motif-combined-backtest.html | Touch-motifs + adaptive MAE/MFE exits + HTF sizing | (35,35) pctl SL/TP, 26-pair portfolio sim, real bar-path MAE | 4 | **KEEP** — priority forward-validation candidate |
| touches-backtest.html | (see §4.4) | — | 4 | **KEEP** |
| pattern-lab.html + PatternBot/ | 17 chart patterns + live alerts | detectors + per-instance MFE/MAE stats | 4 | **MERGE focus → motif line**; restrict alerts to double tops/bottoms (the survivors) |
| analogml-backtest.html + AnalogML/ | k-NN shape matching | window-64 unit-vol shapes, k=20 | 4 | **KEEP as null record; CULL further k-NN work** |
| trend.html | Diversified TSMOM | multi-lookback sign momentum, inverse-vol, vol target, costs | 4 | **KEEP** — canonical trend harness |
| trend-v2.html | Forecast-σ sizing (Moreira-Muir) A/B | identical signal, σ source swapped | 4 | **PARK** — record one verdict or fold into trend.html |
| trend-basket.html | G10 12-month trend basket | 252d sign, equal-risk, FitP filter | 4 | **PARK** — OOS 0.15±0.37; revive only cross-asset |
| trend-ema-ab.html | EMA cross vs momentum | signal-injection A/B, golden-tested | 5 | **KEEP** as banked-null reference |
| trend-flip-backtest.html | HTF-gated dayType flips | honest fills; acceptance bar missing | 3 | **PARK** — run vs no-flip control or archive |
| multi-factor-book.html | Trend+carry blended book | equal-risk inner-join, vol target, div ratio | 4 | **KEEP** — blocked on leg evidence, not code |
| diversification.html | P1–P6 combined-book explorer | five engines, EW/RP/Markowitz/min-DD, WF, DSR | 4 | **KEEP** — flagship portfolio surface; fold system pages in |
| system-fx-carry.html | P4 JPY-cross "carry" (spot only) | HY-OAS z stepped allocation | 3 | **CULL** — self-labelled folklore; superseded |
| system-fx-carry-factor.html | Honest carry (differential + accrual) | FRED 3-mo rates, inverse-vol, 2bp, accrual decomposition | 4 | **KEEP** — needs one recorded OOS run |
| system-fx-momentum.html | P5 cross-sectional momentum | 63d return rank | 3 | **CULL** — twice-falsified family |
| system-gold-macro.html | P6 gold FV (real yields + USD) | rolling OLS log(GLD)~DFII10+DTWEXBGS, residual z bands | 3 | **MERGE → diversification.html** (duplicate of runP6) |
| correlations.html | Correlation Lab | rolling corr/beta, VIX-regime split | 4 | **KEEP** — measurement infra |
| book-stress.html | Crisis replay of the book | per-crisis DD, pairwise ρ Δ, effective bets | 4 | **KEEP** |
| portfolioBacktest/ | Stat-arb desk sim | Engle-Granger screen, \|z\|≥1.5 spread entries, β-neutral | 3 | **PARK** — one cointegration stack should own the question (vs hedge-v2) |
| gold-miner-arb.html | GDX/gold cointegration | rolling hedge z, tiered scale-in | 3 | **PARK** — ~60 days of GDX vs 2y requirement |
| macro-equity-backtest.html + MacroEquityBot/ | P1 composite × equity exposure | 252d z composite (0.30/0.20/0.20/0.15/0.15), bands, 200-DMA, lags | 4 | **KEEP page / FLAG BOT** — Q6 re-run before believing anything |
| gold.html / Gold/ (V1) | Gold confluence bot + docs | fib zones + VuManChu 2-of-3, 8 gates | 4 | **KEEP docs, PARK V1** (95% BUY through a falling market = diagnostic, not edge) |
| GoldV2/ | Level-matrix rework | HTF-bias-first redesign | 3 | **KEEP** — forward paper track; consolidate triplicated Gold/GoldV2/ConfluenceBot modules |
| gold-backtest.html | Browser CSV VuManChu backtest | client-side, no costs/OOS | 2 | **CULL** — legacy shell |
| gold-lab.html | FRED-history dataset builder | reconstruction stepper | 3 | **PARK** unless GoldV2 consumes it |
| nasdaq-liquidity-continuation.html | 4-gate NQ continuation | LiquidityScore(14 inputs)/TrendScore/NY confirm/exit score | 4/1 | **PARK pending one committed Q8 run**; archive family on fail |
| nasdaq-threshold-backtest/-engine.html | COG Threshold-1 macro gates | Gate1A regime→Gate2 vol→Gate3 direction→Gate4 execution | 4 | **PARK** — same Q8 decision |
| nq-qmr-backtest.html / qmr-tearsheet.html | Falsified QMR + evidence | tombstone + exhibits | 5 | **KEEP tombstone** — best overfitting cautionary artifact |
| overnight-hold-backtest.html | Overnight long NAS/gold | gross vs net vs B&H + prop-rule check | 4 | **PARK** — run once, record, archive |
| max-copier-backtest.html | "Max" copier mechanized | impulse→VAL entry→hidden divergence; autopsy | 4 | **KEEP as banked-null autopsy** |
| cross-pair-research.html | Which pairs is the model reliable on | sign-consistency binomial, MAD outliers, tiers | 4 | **KEEP** — feeds pair selection |
| Beta Idea | Beta as stochastic state, HJB inaction bands | Kalman β + regime targets | 3 | **PARK** — do the simpler allocation-scope regime gate first |

### 4.7 Bots, regime engines and backends

**Seven regime classifier implementations feeding four live regime bots.** Canonical classifier: **hmm5m-v2.js (+ hmm5m-train.js)** — 4-state (BULL/BEAR/RANGE/CHOP), learned Baum-Welch emissions, session-aware stickiness, the only one in production serving every consumer. Canonical bot: **RegimeV7** — terminal point of the V1→V7 evolution, ports the optimizer-validated simulateV7 exactly, and uniquely carries a per-trade audit log with the config hash frozen at entry.

| Module | Purpose / method | C | Verdict |
|---|---|---|---|
| RegimeV7/ | Live simulateV7 port: M30 MTF + HTF gate; exit cascade FLIP→CONF_FLOOR→MFE_RETRACE→RANGE→MAX_HOLD; audit log | 4 | **KEEP** — canonical regime bot |
| RegimeV4/ | V2 + RANGE_HOLD state machine, 9 gates, 10 exits | 4 | **MERGE → V7** |
| RegimeV2/ | BOCPD (Normal-Normal, hazard 1/150) + 7-component score | 4 | **PARK bot; KEEP library** (bocpd/macro_overlay/formatter imported by V4/V7) |
| bot/regime_bot.py (V1) | consecutive-poll entry, decay-score exit | 4 | **PARK** — superseded |
| RegimeOptimizer/ | Optuna TPE over Python re-ports of the simulators | 5 | **KEEP** — V7's evidence factory; retire V1/V2 paths |
| regime-backtest.html + viewer | 9 simulateVx variants, train/val/test | 4 | **KEEP as reference; freeze V1–V6** |
| hmm5m-v2.js + train | 4-state learned HMM (canonical) | 5 | **KEEP** |
| hmm.js / hmm5m.js | 2-state daily / 3-state forward | 5 | **PARK hmm.js**; hmm5m stays as consumed |
| regime_classifier_mtf.py | offline matplotlib MTF visualiser | 2 | **CULL** |
| backtestSystem/ | Live MT5 level-confluence bot; persisted KillSwitch; ~10 feature detectors | 4 | **KEEP** — hardest-hardened level bot; absorb bot/main.py |
| bot/main.py | dashboard level executor | 4 | **MERGE → backtestSystem** |
| bot/hedge_bot.py | executes server hedge signals | 4 | **KEEP** (with v2 signals only) |
| oi_bot/ + oi_recon/ + oi-dashboard | Dealer-gamma plan executor (frozen single-planner — no drift) + capture pipeline | 4 | **KEEP** — architecturally the best bot pattern in the repo |
| Trade_Decision_Engine/ | Meta-labeling API: modelV1 logistic on 110,883 events, OOS Brier 0.2469 | 4 | **KEEP** — canonical per-event decision layer |
| DecisionEngine/ | Session-level permission state machine | 3 | **KEEP** as dashboard permission banner |
| ConfluenceBot/ | GoldV2 strategy generalized; honest ≥30-OOS rule | 4 | **KEEP (paper)** |
| ContinuationBot/ | Only trend-continuation system; results.json present | 3 | **KEEP as research**; judge by its own OOS |
| DynAnchorBot/ | EWMA vol fade-to-open on trending days (Calmar 9.97 config) | 4 | **KEEP** |
| TradingBot/ | older duplicate of DynAnchor | 2 | **CULL** |
| SessionResearch/ | session-cycle stats, walk-forward day-model; honest "mostly no" | 4 | **KEEP** — exemplary hygiene |
| forge/ | randomized-level null harness (deliberate documented null) | 5 | **KEEP** — null reference |
| pylego/ | shared brick library (instruments, sizing, risk_guard, broker, barrier_race, magics) | 5 | **KEEP** — the baseplate; migrate stragglers onto it |
| cron-worker/ | CF cron Telegram proximity alerts | 4 | **KEEP** |
| Zoo/ | docs-only shell — script itself gitignored/absent | 1 | **CULL or restore** |
| server.js / _worker.js / server-analyser.js | Railway monolith (27k lines, six regime generations, 25 unbounded caches) / legacy CF worker (COT KV source of truth) / thin analyser server | 4 | **KEEP; decompose, don't delete** |

### 4.8 Hubs, dashboards, education, infra

Five genuine front-door competitors; the repo already decided twice: **index.html is THE Dashboard**, today.html its bannered daily companion.

| Page | C | Verdict |
|---|---|---|
| index.html | 5 | **KEEP — the single front door** |
| today.html | 5 | **KEEP** — daily companion |
| hub.html | 4 | **KEEP as secondary link index**; split out the unwired P1–P8 gate spec |
| desk.html | 4 | **MERGE → today.html** (the one duplication SITE_MAP hasn't adjudicated) |
| analytics-desk.html | 4 | **KEEP** — per-instrument diagnostics (σ bands, DFA, OU half-life, EVT, OI walls) |
| indexv2.html | 3 | **CULL → archive** (superseded; fix its desk link first) |
| todayv2.html / Todayv3.html | 2 | **CULL** — orphaned iframe restyle shims (zero inbound links); land the CSS or delete |
| theory-lab/ (121 lessons) + education/ | 5 | **KEEP, PARK development** — sampled maths verified correct (Kelly, GARCH, BSM, OU); the education→systems review loop has caught real live-money bugs |
| repo-brick-map.html, brief-config, bot-config, telegram-v2, backtest-viewer, backtest-monitor (redirect), strategy-lab, discipline-map | 4–5 | **KEEP** (bot-config's 546KB monolith flagged as tech debt; discipline-map's unvalidated "Reflexivity" composite should be culled or backtested) |
| backtest.html, claude-backtest.html | 3 | **CULL → archive** (superseded by strategy-lab) |
| trade-lab.html, cross-pair-research.html | 3–4 | **KEEP/PARK** — active research |
| journal.html, performance.html, trade-cards.html, upcoming-trades.html, position-sizer.html, giveback.html, etc. | — | see risk system §3 and the merge map §5 |

**Infra facts for culling:** production is Railway (`start.sh` supervises server.js + ~8 bots); pages are static files — culling breaks nothing server-side except entries in `js/commandHub.js`, `js/siteApiMap.js`, and `hub.html`. Cloudflare KV remains load-bearing for persistent state (journal, OI store, COT, forward-track logs). The real infra risk is *inside* server.js (25 unbounded caches), not the page count.

---

## 5. The consolidation map (what merges into what)

| Absorbing page | Absorbs | Why |
|---|---|---|
| **forecast-accuracy.html** | forecast-coverage, forecast-range-timeline | three renderings of one calibration question |
| **forecast-analysis.html** | forecast-book-report | tearsheet of the same dataset with a known-optimistic headline |
| **vol-forecast-v2.html** | vol-forecast.html | superseded predecessor still live |
| **vol-horse-race.html** | vol-forecast-bench | strict superset (8 models vs 2) |
| **vol-research-book.html** | vol-forecast-research | book already subsumes the readout |
| **vol-backtest-v2.html** | volatility-classifier-backtest.mjs (keep its pre-registration) | one canonical fade-vs-follow classifier test |
| **ForecasterOptimizer/** | forecaster-backtest.html (as viewer) | Python port is bit-identical, faster, persists results |
| **pooled-fade.html** | vumanchu-fade | pooled page is the proper validation of the same idea |
| **cog FORWARD_LOG** | cog-signal-log records | one canonical forward record, page stays as entry UI |
| **range-line-strategy.html** | range-fib-backtest (control arm) | stripped fade is its natural baseline |
| **asia-range-backtest.html** | asia-range-analysis (tab); role narrowed to live-parity only | zero-cost book must never be quoted as P&L |
| **levelsV2 path** | levels.js v1 grading | two graders racing on the same KV keys today |
| **backtest-exit-study.html** | giveback.html + analysis/bot_giveback.py output + backtest_entry_quality.py output | one excursion & exit-quality surface per bot |
| **backtest_entry_quality.py** | trade_analyzer.py loaders (standardize on R) | cleaner R framing wins |
| **trade-cards.html** | upcoming-trades (list/grid toggle) | same data, two layouts, one honesty banner |
| **one live-ops cockpit** | performance.html + safety-layer account view + hedge book | nothing currently watches account-level risk |
| **one econ-releases page** | cpi, gdp, ism, ppi, retail-sales, labor-market, trade-balance, consumer-confidence | 8 clones of one engine family |
| **CB-sentiment page** | beige-book (tab) | same LLM template |
| **one rates page** | real-yield + yield-curve + rate-matrix | three viewers on one series family |
| **one liquidity page** | global-liquidity + liquidity-pulse + liquidity-gate | four net-liq computations today |
| **diversification.html** | system-gold-macro (runP6 duplicate) | exact duplicate with a chart wrapper |
| **today.html** | desk.html (fold in exceptions/trust-legend ideas) | one daily read |
| **motif line (Python)** | pattern-lab focus; PatternBot alerts restricted to surviving pattern types | same phenomenon, cleaner harness |

## 6. The cull list (move to `archive/`, update the 3 nav files)

`forecast-replay.html` · `volatility-classifier-standalone.html` (can't even load data) · `volatility_classifier_standalone.py` (drift hazard) · `zscore-backtest.html` · `system-fx-carry.html` · `system-fx-momentum.html` · `system-credit-equity.html` · `system-yield-curve.html` · `gold-backtest.html` · `backtest.html` · `claude-backtest.html` · `indexv2.html` · `todayv2.html` · `Todayv3.html` · `macro-direction.html` (keep core + recorded null) · `rate-matrix.html` (unless kept as scorecard tile) · `Dax Base IFO System/` · `regime_classifier_mtf.py` · `TradingBot/` · `Zoo/` (or restore its missing script) · `hedge-signals.html` + `hedge-backtest.html` (after v2's A/B reproduces the comparison) · `macrofx-zone-backtest.html` (if its one run comes back null).

Also fix while culling: `MASTER_STRATEGY_DOCUMENTATION.md` / `Fib_STRATEGY_DOCUMENTATION.md` are byte-identical (make one a pointer); mark `PROJECT_MASTER_STATUS.md` superseded; reconcile the QMR verdict chain (`BACKTEST_INDEX.md` §3 and `TRADABILITY_REVIEW.md` §4 still cite the withdrawn Sharpe 1.18/1.63 numbers that `FIX_TRACKER.md` falsified).

## 7. The run-and-record queue (highest value per hour of work)

Each of these is a **built, honest harness one run away from a verdict**. Run once, write the number into the findings doc, then keep or park. In priority order:

1. **Q6 re-run: macro-equity post-WALCL-fix** — a live bot (MacroEquityBot) is trading this signal. Bar: OOS Sharpe ≥0.5 vs an honest always-in benchmark.
2. **range-level-edge.html** — the placebo test the entire level family lacks; never run; decisive and cheap.
3. **pooled-fade.html** — the decisive test of the confirmed WT+VWAP fade (and `forward-track` is already accruing its live counterpart).
4. **sigma-fade-ab.html + vol-horse-race.html** — settles the σ-estimator question end to end (accuracy → trading lift).
5. **honest-policy.html** — the honest-fills falsification of the strongest external claim (COG's +290% book).
6. **exhaustion-forecast.html Panel 3** — pre-registered "expect collapse"; bank it either way.
7. **news-exhaustion.html** — the last untested exogenous conditioner; even a null still supports the event-blackout gate.
8. **Q8: one committed NASDAQ 4-gate run** — "biggest maintenance surface with the least evidence"; archive the family if it fails.
9. **pivot-spike (Q1), credit-leadlag (Q4), liquidity-backtest, COT factor test, fx-vol-carry (Railway), trend-v2** — one run each, bank, move on.
10. **Restart the COG forward log** (2 rows since 2026-07-31) — or archive the replication effort.

## 8. The simplified target site

If the merges and culls above are executed, the site collapses to roughly:

- **Front door**: `index.html` (+ `today.html` daily brief, `hub.html` link index, `analytics-desk` diagnostics).
- **Live trading**: range-line stack (strategy page, zones monitor, telegram-v2, bot) · yield-spread (page + bot) · OI zones/bot · vol-forecast-v2 + volatility_bot · DynAnchorBot · GoldV2 (paper) · Trade_Decision_Engine + DecisionEngine banner · bot-config + one live-ops cockpit (with the safety gate wired in).
- **The risk system** (§3): one excursion/exit page, one sizing spec, one MAE/MFE store, safety gate, journal feeding back.
- **Forecast & vol research**: forecast-path, forecast-analysis(+refresh), forecast-accuracy, forward-track, forecast-reversion, exhaustion-forecast, estimator-ab, rank-ic, honest-policy, vol-backtest(+v2), vol-horse-race, vol-research-book, expected-moves, VolRangeForecaster/ForecasterOptimizer.
- **Macro context**: macro-scorecard (+ one econ-releases page, one CB-sentiment page, one rates page, one liquidity page), cot-extremes, macro-conditioner (post-run).
- **Portfolio**: diversification, multi-factor-book, trend, carry-factor, correlations, book-stress, cross-pair-research.
- **Candidates under forward test**: motif line, ContinuationBot, ConfluenceBot, asia-npoc (short leash), cog-v2 + restarted forward log.
- **Reference / banked records** (read-only shelf): all PARK'd nulls, the QMR tombstone, forge, strategy-lab, trend-ema-ab, theory-lab, education, discipline-map, price-slowdown-lab, reversal-study.

That's ~60 active surfaces instead of ~200, with every remaining research page carrying either a banked verdict or a scheduled one.

---

*Produced 2026-08-22 by a full parallel audit of every page, engine, bot and doc in the repo (10 themed review passes + synthesis). Numbers are quoted from the pages and findings docs themselves; where a doc and a later fix disagree (e.g. QMR), the falsification wins.*
