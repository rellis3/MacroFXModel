# August Action Plan — Working Plans per Section (2026-08-22)

Companion to **`august analysis.md`**. That document says *what everything is and what its verdict should be*; this one says *exactly what to do next*, system by system. Three sections:

- **A. Test plans for every unbanked system** — each open hypothesis gets a card: what it tests, where to run it, prerequisites, the steps, the pre-registered pass bar, where to record the verdict, and what happens on pass/fail.
- **B. Centralised risk system** — a phased implementation plan for the MAE → stop → size → exit → backstop → feedback pipeline, with the concrete components, files, and how every bot and page consumes it.
- **C. Sorting the estate** — the ordered execution plan for the merges and culls.

**House rules that apply to every test below** (from CLAUDE.md doctrine — restated once so each card can stay short):
- Costs on, honest M1 fills (SL-before-TP pessimism), true chronological IS/OOS split, **≥30 OOS trades** before any belief.
- The verdict is not done until it is **written down**: flip the system's row in `MD files/BACKTEST_INDEX.md` (✅/⛔/🔁) *and* drop a short findings note (either the system's existing `*_TEST.md`/`*_FINDINGS.md`, or a new one named `<SYSTEM>_FINDINGS.md`). A run whose number only ever existed on-screen does not count — this is the repo's #1 recurring failure.
- One test at a time, banked before starting the next. Suggested cadence: one card per working session.

---

## A. Test plans for the unbanked systems

### Tier 1 — protects live money (do these first)

#### A1. Q6 — Macro-equity re-run (a live bot is trading this)
- **What it tests**: does the 5-factor macro composite (net-liq 0.30 / curve 0.20 / credit 0.20 / real-yield 0.15 / ISM 0.15, 252d z's) genuinely time equity exposure, now that the WALCL millions-vs-billions unit bug is fixed?
- **Where**: `macro-equity-backtest.html` (engine `js/macroEquityEngine.js` v3) and/or `macro-regime-conditional/macro_equity_backtest.py`.
- **Prereqs**: WALCL fix is already in code (2026-07-02). Two harness changes are required for the run to be honest: (1) allow the allocation ladder to reach **0%** (previous runs floored ≥25–50% long, so "macro works" could not be distinguished from "long equities worked"); (2) score against an **always-in buy-and-hold benchmark on the identical window** and report excess, not raw.
- **Steps**: run walk-forward (504/63/21 windows, 0.15% RT costs as configured) on QQQ and SPY; export the walk-forward table; run once more with the composite replaced by a random-sign placebo for a sanity floor.
- **Pass bar** (pre-registered in BACKTEST_INDEX Q6): **OOS Sharpe ≥ 0.5** *and* beats always-in risk-adjusted. Treat WFE > 1 as a red flag, not a boast.
- **Record in**: `BACKTEST_INDEX.md` Q6 + a dated addendum in `MACRO_DEEP_DIVE_2026-07.md`.
- **If pass** → keep MacroEquityBot live, re-freeze its config from the passing run. **If fail** → stop MacroEquityBot (it rebalances monthly, so pausing is cheap), PARK the page as a banked null, and delete the P1 card's headline numbers from `hub.html`.
- **Until the run happens**: the bot is trading a contaminated signal. If you won't run the test this month, pause the bot now — that is the honest default, not the fallback.

#### A2. Hedge book reconciliation (not a test — an exposure)
- **What**: `hedge_bot_state.json` holds 5 open two-leg positions from 2026-06-26 (lots 0.15–0.36, no SL fields, one with `ticket_a == ticket_b` — a logging bug). No page monitors them.
- **Steps**: (1) open MT5 and confirm which of the 5 are genuinely still open; (2) close anything unwanted; (3) for anything kept, record it in the journal and add its exposure to the position-sizer heat view (see B, Phase 3); (4) fix or retire the state file.
- **Record in**: a dated note in `HEDGING_VS_SPREAD.md`.

#### A3. Range-line bot config drift (`confluence_min`)
- **What**: the live bot ships `confluence_min: 0`; the validated §13 book says confluence ≥2 is "the best OOS book". This is an open owner decision (FIX_TRACKER Batch 6).
- **Steps**: pick one — either set the bot to the validated config (recommended: match the book exactly, that is the whole point of §13), or write one sentence in FIX_TRACKER accepting the deviation and why. Then diff every other live bot config against its blessing backtest (V7 slope window 8 vs 40–60 is the other known drift) and do the same.
- **Record in**: `FIX_TRACKER.md` Batch 6.

---

### Tier 2 — decisive one-run verdicts (built, honest, one click from an answer)

#### A4. range-level-edge — the placebo test (never run)
- **What it tests**: do first-touches of *real* Asia-range levels bounce more than the same level shifted to a wrong price (placebo)? This is the foundation question under the entire levels family — and it has never been run.
- **Where**: `range-level-edge.html` → `POST /api/range-level-edge/run`. **Needs Railway** (M1 parquet access).
- **Steps**: run with defaults (barrier D = 0.25 × Asia range, spread 1.0 pip) across all pairs; read pooled and per-pair OOS bounce% delta vs placebo and after-cost expectancy.
- **Pass bar**: real levels beat placebo OOS by a margin that survives cost (positive after-cost expectancy on the pooled book). If real ≈ placebo, the level *locations* carry no information and only the §13 policy layer (fade/follow selection + exits) is doing the work — which is worth knowing.
- **Record in**: new `RANGE_LEVEL_EDGE_FINDINGS.md` + BACKTEST_INDEX row.
- **Either way** → this becomes the gate: no new level-family page gets built until its level source beats placebo here.

#### A5. pooled-fade — the confirmed WT+VWAP fade verdict
- **What it tests**: does the confirmed (WaveTrend + VWAP-osc turn) M1 fade at median/75th lines, pooled across all instruments with the trader's real exit (vol-scaled ~5-pip stop → trail to open, EOD close), make money after cost?
- **Where**: `pooled-fade.html` → `/api/pooled-fade/run` (heavy — streams M1 per pair; run on Railway).
- **Pass bar** (pre-registered on the page): positive pooled OOS Sharpe, **beats the blind fade**, survives ×2 cost.
- **Record in**: new `POOLED_FADE_FINDINGS.md`; cross-reference `forward-track.html`, which is accruing the live version of the same trade — when forward n ≥ 30, compare Δ(forward − backtest) per instrument as the overfit tell.
- **If pass** → this is the vol-level family's one live candidate; promote to a frozen plan + paper bot using the volatility_bot pattern. **If fail** → the entire vol-line fade family is closed (it would join layer2, vol-median fade, and the classifier nulls); park forecast-reversion as an exploration cockpit only.

#### A6. sigma-fade-ab + vol-horse-race — settle the σ-estimator question (run as a pair)
- **What they test**: (a) horse-race — which of 8 σ forecasters (RW/EWMA/HV/YZ/GARCH/HAR-RV/2 combos) wins per instrument on OOS QLIKE; (b) sigma-fade-ab — does swapping the winner (expected: HAR-RV) into the confirmed pooled fade actually lift OOS Sharpe on the weak instruments (indices + gold, currently 0.31–0.64)?
- **Where**: `vol-horse-race.html` (job endpoint) then `sigma-fade-ab.html` → `/api/pooled-fade/volcompare`.
- **Steps**: run the horse race across all instruments; note the per-class winner; run the A/B; read pooled + per-instrument confirmed Sharpe deltas.
- **Pass bar**: A/B improves confirmed OOS Sharpe on the target instruments without degrading FX. Accuracy alone (QLIKE) does **not** justify a production estimator switch — only the trading lift does.
- **Record in**: `ESTIMATOR_CHANGE_LOG.md` (this doc already governs estimator switches — add the race table and the A/B verdict). Update `VOL_CALIBRATION_TRACKER.md`.
- **If pass** → switch the per-class primary estimator in the forecaster config, with the change-log entry as the authority. **If fail** → freeze estimator churn; the current YZ/GARCH/HV assignments stand and the pending GARCH β 0.87→0.84 tweak is judged by the same bar.

#### A7. honest-policy — the honest-fills falsification of the COG "Complete Book"
- **What it tests**: reproduce the external ~+290% per-cell fade/follow book on **honest 1-min fills** (no mark-to-close, no zero-duration trades). If the curve is flat, his edge was the optimistic marking — the single strongest external claim gets settled.
- **Where**: `honest-policy.html` → `/api/honest-policy/run` (heavy; Railway).
- **Pass bar**: positive pooled OOS Sharpe on kept cells with ≥30 OOS trades, surviving the real-fill regime.
- **Record in**: new `HONEST_POLICY_FINDINGS.md` + a line in `COG_OBSERVED_SYSTEM.md`.
- **If pass** → escalate: this changes the COG effort's priority entirely. **If fail** → the COG replication narrows to the forward log only (A13) and every "his book made X%" reference gets the tombstone treatment.

#### A8. exhaustion-forecast Panel 3 — the range-budget fade, pre-registered to collapse
- **What it tests**: fade extremes back to open once ≥80% of the calibrated range is consumed — under strict marking (unresolved days flat −cost), stop slippage, and a moving-block bootstrap Sharpe floor.
- **Where**: `exhaustion-forecast.html` → `/api/exhaustion-forecast/run`.
- **Pass bar** (pre-registered on the page): SURVIVES only if bootstrap p5 > 0.5 **and** ≥60% positive years **and** Sharpe > 0 at ×2 spread. Registered prior: "it collapses."
- **Record in**: `VOL_LEVEL_LESSONS.md` (this is its natural home — the doc already owns the overshoot finding).
- **Either way** → the k_fade ≈ 0.65–0.84× exhaustion *measurement* stays valid as context; only the trade dies or survives.

#### A9. news-exhaustion — the last untested exogenous conditioner
- **What it tests**: does the economic calendar (known ex-ante) predict session fade-vs-follow — quiet sessions revert, high-impact sessions blow through the 75th band?
- **Where**: `news-exhaustion.html` (engine `js/newsExhaustionEngine.js`, local `calendar_events.csv` 2014–2026).
- **Steps**: run per pair; read per-bucket reached-75th rate, costed fade expectancy, costed follow expectancy, k_fade; respect the page's pre-registered split of "classifier works" vs "after-cost edge exists".
- **Pass bar**: a bucket spread that is same-sign IS and OOS *and* an after-cost expectancy > 0 in at least one bucket.
- **Record in**: new `NEWS_EXHAUSTION_FINDINGS.md`.
- **If pass** → wire the news tier as a gate on whichever fade survives A5. **If fail** → still keep the event-blackout gate (variance reduction is justified regardless — MACRO_DEEP_DIVE's one endorsed macro use); close the conditioning question.

---

### Tier 3 — fix first, then run (known defects make current numbers untrustworthy)

#### A10. honest-forecast-harness — fix the SL artifact, then run
- **Defects**: inherited SL-placed-at-+4.7σ artifact (documented in FORECAST_WORKLOG — the one that produced fantasy OOS Sharpe 10–15) and an open breach-and-reclaim fill defect (SITE_MAP).
- **Steps**: fix both in `js/honestForecastEngine.js`; add a regression test that the SL sits at the configured multiple of HL75; then run the three-leg comparison (fade / follow / regime-picks) per pair.
- **Pass bar**: OOS Sharpe on ≥30 trades for whichever leg wins; must beat the do-nothing baseline.
- **Record in**: `FORECAST_WORKLOG.md`.

#### A11. weekly-vol-backtest (Q3) and vol-backtest-v2 (Q2)
- **Q3 defects**: D1-fallback and `maeCalib` stop defects flagged in SITE_MAP — fix, then re-run the Monday-anchored weekly fade with each regime gate (drop the Hurst gate: the feature is a banked null, remove the option while you're in there).
- **Q2**: vol-backtest-v2's adaptive-selector A/B needs a clean re-run post causality fix (the offline V2_AB_RERUN already suggests the selector adds nothing — this run is to bank that on the current engine).
- **Pass bars**: Q3 — any gate cell with same-sign IS/OOS positive after-cost expectancy, ≥30 OOS trades. Q2 — adaptive beats best fixed leg on OOS Sharpe (registered expectation: it will not).
- **Record in**: BACKTEST_INDEX Q2/Q3 rows + `V2_AB_RERUN_2026-07.md` addendum.

---

### Tier 4 — single runs, lower stakes (run once, bank, move on)

| # | System | Where / how | Pass bar | Record in | On fail |
|---|---|---|---|---|---|
| A12 | **pivot-spike (Q1)** | `pivot-spike-backtest.html` job; defaults; session + level filters as configured | ≥30 OOS trades, positive after-cost expectancy on a pre-named filter (S1/S2 longs, R1/R2 shorts) | BACKTEST_INDEX Q1 + note in `jay_pivot_method.md` | PARK page as null |
| A13 | **COG forward log restart** | `cog-replication/FORWARD_LOG.md` + `cog-signal-log.html`: log our tide/GEX/OI gate output daily, stamped **before** his alerts | ≥70% direction agreement at n≥30 (pre-registered); ≤60% = null | FORWARD_LOG + DECISIONS.md | Archive the replication effort — 2 rows since 2026-07-31 is already borderline abandonment |
| A14 | **credit-leadlag (Q4)** | `credit-leadlag.html` run | any credit predictor beats the lagged-vol benchmark on OOS rank-IC | BACKTEST_INDEX Q4, new findings note | CULL page |
| A15 | **liquidity-backtest** (microstructure levels into range book) | `/api` A/B run, pre-registered rule on page | OOS held-chandelier Sharpe improves on ≥1/2 pairs, ≥30 OOS trades | new findings note; rename page (it is not macro liquidity) | drop `liquidity_levels` source |
| A16 | **macrofx-zone-backtest** | one run of the Decision-Zones book | positive OOS after cost (prior is low — third confluence-stacking test) | findings note | **CULL** (pre-committed) |
| A17 | **trend-v2** (forecast-σ sizing) | `/api/trend-v2/backtest` | OOS Sharpe improves over trailing-63d σ **and** survives 5bp (page's own bar) | `QUANT_MOMENTUM_LESSONS.md` | fold toggle into trend.html, retire page |
| A18 | **carry-factor** first recorded OOS run | `system-fx-carry-factor.html` on Railway | positive OOS Sharpe with accrual decomposition shown (spot vs carry vs cost) | new `CARRY_FACTOR_FINDINGS.md` | multi-factor book stays trend-only |
| A19 | **fx-vol-carry** (CVOL VRP gate) | needs one real **Railway** run (live OANDA leg untested; IV currently static snapshots) | VRP gate beats always-fade AND always-follow OOS | findings note | PARK with vix-vol-carry |
| A20 | **COT positioning factor** | run exactly per pre-registered `COT_POSITIONING_FACTOR_TEST.md` (rank-IC of OI-share z vs 4-week forward, block-bootstrap CI) | the doc's own registered bar | that same doc | cot-extremes stays display-only forever |
| A21 | **macro-conditioner** | one Railway run (FRED/OANDA) | ≥2/3 σ-tercile buckets same-sign IS & OOS **beyond the σ-only ablation** (registered rule) | new findings note | PARK; registered prior is "redundant with σ" |
| A22 | **overnight-hold** | `/api/overnight-hold-v1/run` | net (incl. financing) beats B&H on overlapping window + passes prop-rule check | findings note | archive |
| A23 | **Q8 — NASDAQ 4-gate / COG-threshold family** | ONE committed, costed, real-data OOS run of the 4-gate framework (`nasdaq-liquidity-continuation.html` + threshold engine) | ≥30 real OOS trades, positive after cost | BACKTEST_INDEX Q8 | **Archive the whole family** (pre-committed: "biggest maintenance surface with the least evidence") |
| A24 | **hedge-v2 / portfolioBacktest (Q10)** | fix the calendar-split defect, then A/B hedge-v2 (cointegration z) vs the v1-style baseline; pick ONE stack (recommend hedge-v2, since it feeds live pages) and archive the other | v2 beats v1 baseline on OOS Sharpe, ≥30 OOS trades | `HEDGING_VS_SPREAD.md` addendum | keep hedging manual-only; cull hedge-backtest + hedge-signals v1 either way |

### Ongoing forward tests (not one-shots — just keep them fed)
- **forward-track.html** — the pooled-fade live record; judge at n≥30/instrument.
- **vumanchu-state.html** scorecard — the lab table's OOS test; leave running.
- **motif line** (`motif_track`) — forward paper record for the touch-motif edge; when n≥30, decide on the backend port + paper bot.
- **YieldSpreadBot** — paper record vs the backtest expectancy; same Δ(forward−backtest) tell.
- **oi_bot hold-calibration** — keep collecting; review when the banner says calibrated.

---

## B. Centralised risk system — implementation plan

Goal: one pipeline — **measure excursions once → derive stops from evidence → size from one formula → manage exits by the proven rule → let nothing trade outside an account-level gate → feed outcomes back**. All parts exist; this is assembly, not invention. Build order is chosen so each phase protects live money before the next adds convenience.

### Phase 0 — Safety first (small, do immediately)
1. **Wire `safety/risk_gate.py` + `safety/kill_switch.py` in front of every live order.** The gate is built, tested, fail-closed, and consumed by nothing. Integration point: each bot's broker call site (range_line_bot loop, volatility_bot, oi_bot, DynAnchorBot, backtestSystem, Gold/GoldV2, MacroEquityBot, hedge path). Pattern: `decision = risk_gate.check(order, account_state); if not decision.allow: log & skip`. The −18.5R day (in-memory kill switch resetting ~45×/run) is the recorded cost of this gap.
2. **One durable kill switch.** Retire the per-bot in-memory variants; the file-backed switch in `safety/` is the single source. Fix the 48h-KV-TTL expiry that silently un-kills (PLATFORM_REVIEW finding) by moving the flag to the file store (kv.js persistent tier).
3. **Account-level limits, not per-bot.** Configure the gate with: max daily loss (start −3R equivalent — the measured "halves loss and drawdown" number), max account DD, max concurrent exposure per currency bucket. Per-bot RiskGuards stay as belt-and-braces but the account gate is authoritative.
4. **Reconcile the hedge book** (A2) so the gate's exposure picture is true on day one.
- **Acceptance**: a test order from each bot is provably refused when the kill switch is on and when the daily-loss limit is breached; restart the bot mid-day and confirm counters survive (they already do in backtestSystem/risk.py — replicate that persistence pattern).

### Phase 1 — One excursion engine, one MAE/MFE store
1. **Consolidate the three excursion implementations** (server `js/giveback.js`, CLI `analysis/bot_giveback.py`, exit-study's in-page walker) onto the Python `walk_excursion` (real M1 path, already in pylego's orbit) exposed via one server endpoint. The JS page becomes a renderer.
2. **Create the persisted quantile store**: KV key `excursion_stats_{pair}` (persistent tier), schema roughly:
   `{pair, n, updated, winners: {mae: {p25,p50,p75,p90}, mfe: {...}}, losers: {...}, giveback: {medianPeakPips, keptPips, fractionGivenBack}, source: "bot|journal|backtest"}`
   Written nightly by a job that walks all closed trades (bot journals + manual journal); read by everything in Phases 2–4.
3. **Merge the surfaces**: `backtest-exit-study.html` becomes the single "Excursion & Exit Quality" page per bot (absorbing giveback.html's tables and backtest_entry_quality.py's entry-side buckets). Keep the one-sentence diagnostic: *losers' median MFE < 5 pips ⇒ entry/stop problem, winners' giveback high ⇒ exit problem*.
- **Acceptance**: the store exists for every actively traded pair with n and freshness shown; deleting giveback.html breaks nothing.

### Phase 2 — One stop specification
1. **Define the stop rule once**: `stop_pips(pair) = max( noise_floor(pair), winners_mae_p75(pair) )` where `noise_floor` = the Forecast Path calibrated 4h P75 envelope (position-sizer already computes this — "noise hits it ~1 day in 4") and `winners_mae_p75` comes from the Phase-1 store. Rationale is already evidenced: tight stops die to the ~36-pip overshoot; hindsight-optimal fixed SL/TP grids are unstable everywhere (sltp-distribution); winners' MAE quantiles are the only per-pair "room needed" number derived from real paths.
2. **Publish it**: KV key `risk_spec_{pair}` = `{stopPips, noiseFloor, maeP75, asOf}` — one number both JS (position-sizer, trade-cards, telegram-v2 grading) and Python (bots) read. This replaces the three current unrelated conventions (0.75σ grading rule, per-bot ATR, forecast-range multiple). Bots that have a *validated* strategy-specific stop (§13's chandelier inner stop) keep it — the spec is the default and the floor, not an override of validated books.
3. **Sanity page**: `reversion-proof.html` already evidences the forecast quantity the noise floor is built from; link it from position-sizer as the "why".
- **Acceptance**: position-sizer, telegram-v2 and at least one bot read the same `risk_spec` value; changing it in one place changes all three.

### Phase 3 — One sizing implementation + whole-book heat
1. **Converge the three sizing implementations** (position-sizer.html, `backtestSystem/risk.py::position_size()`, journal replay modal) on one spec: fixed-fractional, `lots = (equity × riskPct) ÷ (stop_pips × pip_value)`, with the shared pylego pip-value helper (the £10/pip incident is why pip identity must come from one place). Publish the formula's constants in `risk_spec` too; the JS and Python implementations each get a golden test against the same fixture table so they cannot drift.
2. **Whole-book heat**: the heat cap must see every open position — all bots' journals + hedge legs + manual journal trades. Feed it from the same account snapshot the safety gate uses (Phase 0.3), so "heat" and "exposure limit" are one number, not two.
3. **Do NOT add**: inverse-σ sizing on chandelier books (banked null — chandelier already σ-normalizes) or confidence-scaled sizing (conviction currently anti-predictive; DecisionEngine multiplier bug #32). Kelly stays a theory-lab lesson until a book has a stable enough edge distribution to estimate it — fixed-fractional at 0.5–1% is the standing default.
- **Acceptance**: sizing a hypothetical trade in the page and in the bot produces identical lots; the heat view shows hedge legs.

### Phase 4 — Exit discipline, validated
1. **The default exit is the chandelier trail** (peak − ½ rung, never tighter than the inner stop) — the only exit that has *won* an honest comparison (fragile 3.45 → cost-robust 7.29 on the range book; beat fixed-TP and zone-walk).
2. **Validate the counterfactuals before shipping any other rule**: run the exit-study's alternatives (bank-70%-of-peak, BE@+1R, time-stops) through the purged walk-forward + deflated-Sharpe brick in `js/mve/validation.js` (extract it to `js/validationCore.js` — it is the best validation code in the repo and currently serves a parked null model). The current exit-study evidence is 279 trades / one 2-month window / no OOS — treat it as hypothesis-generating only.
3. **Giveback monitoring becomes an alarm, not a report**: from the Phase-1 store, alert when a bot's winners' giveback fraction drifts above its backtest baseline (this is the honest version of performance.html's hand-set 55% WR alert, which should be deleted).
- **Acceptance**: each live bot's exit rule is either (a) the validated chandelier, or (b) an alternative that passed the validationCore walk-forward — nothing else.

### Phase 5 — Ops cockpit + the feedback loop
1. **One live-ops cockpit** replacing performance.html: account equity + DD vs limits, gate status (kill switch, daily loss, heat), per-bot heartbeats, open positions incl. hedge legs, giveback alarms, and the forward-vs-backtest Δ for each live strategy. This is TRADING_SAFETY_LAYER.md's "Layer A" — the spec already exists.
2. **Close the journal loop**: manual journal outcomes and bot closes both flow into the excursion store (Phase 1 job), so stop quantiles and giveback baselines update continuously. TELEGRAM_ENTRY_GRADING's two-drifted-graders-racing-on-one-KV-key defect gets fixed here by making levelsV2 the only writer.
- **Acceptance**: you can answer "what is my total risk right now and who is misbehaving" from one page.

**Sequencing note**: Phases 0 and 1 are independent — start both. 2 depends on 1; 3 depends on 2 (for stop_pips) and 0 (for the account snapshot); 4 and 5 depend on 1. Nothing here requires new alpha, and every phase leaves the platform strictly safer than the last.

---

## C. Sorting the estate (merges and culls, in execution order)

Mechanics per cull/merge: `git mv` page to `archive/` (or delete the true orphans), then update the only three nav sources — `js/commandHub.js`, `js/siteApiMap.js`, `hub.html` — plus any hard link named below. Pages are static; nothing server-side breaks.

**Batch 1 — zero-risk deletions/archives (no decisions needed):**
todayv2.html, Todayv3.html (orphans — land their CSS in today.html first if wanted); indexv2.html (fix its desk.html link first); backtest.html; claude-backtest.html; forecast-replay.html; volatility-classifier-standalone.html; volatility_classifier_standalone.py; zscore-backtest.html; gold-backtest.html; system-fx-carry.html; system-fx-momentum.html; system-credit-equity.html; system-yield-curve.html; regime_classifier_mtf.py; TradingBot/; Dax Base IFO System/; Zoo/ (or restore its gitignored script — decide, don't leave the shell).

**Batch 2 — doc hygiene (an hour's work):**
make `Fib_STRATEGY_DOCUMENTATION.md` a one-line pointer to `MASTER_STRATEGY_DOCUMENTATION.md` (byte-identical duplicates); mark `PROJECT_MASTER_STATUS.md` superseded at the top; purge the withdrawn QMR numbers from `BACKTEST_INDEX.md` §3 and `TRADABILITY_REVIEW.md` §4 (point both at the FIX_TRACKER falsification); fix `CLAUDE.md` checklist step 8 ("link it from hub.html" → index/commandHub); update `discipline-map.html`'s stale "no trade journal exists" claim and remove its unvalidated Reflexivity composite.

**Batch 3 — display-layer merges (macro):**
one econ-releases page absorbing the 8 clones (cpi/gdp/ism/ppi/retail-sales/labor-market/trade-balance/consumer-confidence — the engines all stay, this is UI only); beige-book into the CB-sentiment page as a tab; real-yield + yield-curve + rate-matrix into one rates page; global-liquidity + liquidity-pulse + liquidity-gate into one liquidity page (after the A1-adjacent GLI re-run decision); macro-direction page retired (null banked).

**Batch 4 — research-suite merges:**
forecast-coverage + forecast-range-timeline → forecast-accuracy; forecast-book-report → forecast-analysis; vol-forecast → vol-forecast-v2; vol-forecast-bench → vol-horse-race; vol-forecast-research → vol-research-book; forecaster-backtest.html demoted to viewer of ForecasterOptimizer; vumanchu-fade → pooled-fade; classifier .mjs pre-registration → vol-backtest-v2; range-fib → control arm inside range-line-strategy; asia-range-analysis → tab of asia-range-backtest (whose role narrows to live-parity, P&L never quoted); upcoming-trades → trade-cards list-toggle; system-gold-macro → diversification.html; desk.html ideas → today.html then archive.

**Batch 5 — conditional on test outcomes (from section A):**
levels.js v1 grading retired once the levelsV2 ledger comparison completes; hedge-backtest + hedge-signals v1 archived once A24's A/B is banked; macrofx-zone and the NASDAQ family per A16/A23; giveback.html + analysis scripts fold into the excursion page per B Phase 1; performance.html replaced by the cockpit per B Phase 5.

---

*Working doc — tick items off in place, or lift Section A cards into `BACKTEST_INDEX.md`'s question queue as they are scheduled. Companion to `august analysis.md` (same date).*
