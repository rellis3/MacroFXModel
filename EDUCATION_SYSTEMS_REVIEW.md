# Education vs Trading Systems — Full Review (2026-07-11)

**What this is:** every file in `education/` reviewed against the nine live
bots/alerting systems (macrofx1, backtest bot, Regime V7, Confluence bot, Gold
V1/V2, volatility bot, range-line bot, QMR, Telegram V2), asking four
questions: are we out of our depth, what needs tweaking, what the lessons
teach that we haven't applied, and where more education could take us.

Framing per the working agreement: **built ≠ works ≠ has edge.** Almost
everything below is about the gap between the first two and the third.

---

## 1. The verdict — are we out of our depth?

**On infrastructure and risk plumbing: no.** Vol-scaled risk-% sizing,
ATR/structure stops, session anchoring, staleness gates, event blackouts,
audit logs, paper-first defaults — across all nine systems this is at or
above the bar the courses set. The volatility/range-line bots in particular
mechanize the forecaster-walkthrough lessons (two-sided re-anchoring,
London-midnight anchor, closes-not-wicks, no lookahead) faithfully and are
golden-tested against the JS books.

**In three specific places: yes, clearly out of depth** — complexity that
cannot currently be audited or validated:

1. **Gold V1's ML model + optimiser** (`Gold/ml_model.py`, `Gold/optimiser.py`).
   K-fold CV on time-series data (the exact thing Regression L7 forbids),
   13 features on as few as 10 trades, censored labels (EXPIRED/BE dropped
   while ~half of live trades expired), a training feature that is a made-up
   constant at predict time, and a 15-combo in-sample grid search that writes
   the winner straight into live config. Fails every row of the regression
   course's significance checklist. GoldV2 correctly ships with `ml_gate:
   False` — keep it off.
2. **macrofx1's model stack** — HMM + GARCH + ARMA + ARIMA + Hurst + Kalman
   betas + regime-conditional beta tables rebuilt weekly by subprocess. The
   beta estimator regresses pairs on collinear proxies of themselves
   (univariate, no VIF, no Newey-West, 60 H4 bars). Any layer can fail
   silently and nothing in production would reveal it. Candidate for freezing
   until something consumes it with evidence.
3. **Regime V7's four-layer stack** (HMM + BOCPD + 7-weight composite +
   Optuna) targeting an M30 FX momentum signal — the horizon Quant-Macro L1
   says is noise-dominated — and the live port has *already* drifted from the
   validated backtest (see §2.3).

Everywhere else the problem is not sophistication beyond our depth — it's
the opposite: validation discipline the lessons demand that the systems skip.

---

## 2. Acute bugs found during the review (fix-this-week list)

These are correctness findings, not opinions. Verified by code inspection
with file:line by the review agents.

1. **backtestSystem's kill switch is dead code.** `risk.py KillSwitch.record()`
   is never called anywhere; `main.py` only reads `block_reason()`/`summary()`,
   so `_daily_r/_weekly_r/_monthly_r` stay 0.0 forever and the 2R/5R/10R loss
   limits on a **live** bot never trip. One-line fix where
   `journal.record_close()` fires (`main.py:534-536`).
2. **ConfluenceBot's FX generalisation is arithmetically broken.** Gold-native
   2-dp rounding and price-unit constants survive in the modules: fib legs
   rounded to whole cents collapse EUR/USD levels onto a 100-pip grid
   (`level_matrix.py:250-316`), a 0.5-price-unit pad floor = 5,000-pip entry
   windows (`:444`), zone IDs collide (`:462`), obstacles merge within 1.5
   units (`exits.py:108`), pivots/VWAP rounded to 2 dp (`session_engine.py:88-99`).
   12 of 17 default instruments run on degenerate levels; **any FX paper
   record accumulated so far is not evidence.** Gold and indices are fine.
3. **Regime V7's slope gate diverges from the validated backtest.** Live uses
   an 8-bar OLS slope (`regime_bot_v7.py:485`); the backtest's slope feature
   uses 40–60 bars (`hmm5m-v2.js:240`). Whatever V7's backtest showed, the
   bot is not trading that strategy — the documented "bit-identical port"
   failure, live. Also: `entry_conf` 54 < `conf_floor` 55 guarantees
   spread-burning churn for entries in [54,55).
4. **Volatility bot (book variant) has no session-close exit** while the book
   prices unresolved touches at window close (`perLineStrategy.js:126-129`) —
   live positions hold overnight on an exit path the book never priced. Plus
   the early-session velocity hole (`engine.py:109-110`) fires touches the
   book excluded, minutes late.
5. **QMR's live alerts don't run the backtested rule.** Overnight window
   21:00 vs 20:00, min-bars 4 vs 3, gate bars one hour apart
   (`server.js:2773-2797` vs `13984-14072`), and a live news filter the
   backtest never models. Gate times are fixed UTC with wrong ET labels
   (DST). SPX/DOW/DAX monitors are unvalidated transplants of NQ defaults —
   including a US news filter and US session times applied to DAX.
6. **PaperBroker (pylego) can't actually measure anything.** No price feed is
   ever wired in the bot loops (`set_price` called only by tests), P&L is
   Δprice × lots (not money units), and the balance never updates. Any
   "paper A/B evidence" from the vol/range-line bots needs re-examination.
7. **macrofx1**: `min_agree=3` is inflated because `vol_gate` and
   `regime_confidence` inherit direction from `macro_regime` — one opinion
   echoed twice (`main.py:965`). Force-unlock resets the daily-DD baseline
   (`main.py:1367-1369`), so the loss limit can be ratcheted down in one bad
   day. Static `_PIP_VALUES` (USD/JPY 9.0) oversizes JPY pairs ~40% at
   current rates.
8. **GoldV2 σ-forecast anchor** uses midnight UTC (`main.py:770`) where the
   forecaster anchors London midnight — a 1-hour BST drift on every
   range-budget level.

---

## 3. The five systemic gaps (what the lessons teach that we skip)

The same violations recur across all nine systems. These are the pattern,
and they're all named explicitly in the course notes:

### 3.1 Costs are missing from exactly the medium used to validate
Quant-Macro L1.2 ("the double penalty"), Regression L7 ("implementation
killers"), house rule "costs on by default." The JS backtest books charge
costs — but: `bot/backtest.py` has zero cost modeling; Gold V1/V2 paper
fills at mid with zero spread/commission; Regime V7 paper is mid-to-mid with
a frozen 10k balance (RiskGuard can never fire in paper); ConfluenceBot
paper P&L has `swap: 0, commission: 0`; QMR's headline Sharpe is cost-free
at up to 10× leverage (costs are an optional client-side 0.003% input);
backtestSystem has no simulation at all. **Every paper/forward record being
accumulated to justify going live is cost-free, and the edges being chased
are thin enough (0.02–0.05%/touch) that spread is first-order.**

### 3.2 Correlated signals counted as independent confirmation
Regression L5 (multicollinearity), Quant-Macro L6 (coherence must come from
*independent* sources). backtestSystem's "≥3 confirms" counts
MACD/EMA/ADX/TWAP — four measures of the same trend. ConfluenceBot awards
separate credits for pivots, prev-day H/L, session H/L and daily open, where
pivots are a deterministic function of prev-day H/L/C. Regime V7 gates on
session-multiplied confidence *and* scores session quality at 15%; HMM
confidence (35%) and BOCPD (20%) are functions of the same stream. macrofx1
counts direction-inheriting modules toward agreement. Fix pattern: group
signals into families, one vote per family.

### 3.3 Hand-assigned pseudo-probabilities everywhere
Data-Foundations DF-01: "sophisticated-looking noise with a false sense of
precision." 0.85 "if max pain beyond price", 38/25/25/12 grade weights,
0.40/0.35/0.25 decay weights, ±20/±30 oscillator thresholds normalised by
window-max (so they mean different things hour to hour), ~20 confluence
weights per bot — none estimated, none validated. The lessons' alternative:
either measure the weight (Telegram V2's after-cost per-cell expectancy is
the house-best example) or delete the knob.

### 3.4 Multiple testing with no chance baseline
Regression L4 (|t| > 3 for mined effects; Harvey-Liu-Zhu), house rule "count
the cells." QMR: 5,250-combo grid scored on the full sample, live defaults
picked from it, times 4 instruments × 4 sub-systems. ConfluenceBot: 17
instruments × pick-the-winners at ~30 trades each ⇒ 2–3 false winners
expected by chance, no baseline stated. Vol bot: many-cell fade/follow book
(the §7c walk-forward ride rigor is the right countermeasure — keep it the
standard). Telegram V2: cells gated at IS mean > 0 with `marginPct = 0`, no
per-cell significance. Gold optimiser: 15 combos on ≥5 trades each.

### 3.5 Live ≠ validated (the port-drift failure class)
CLAUDE.md documents this failure; the review found it live in four places:
V7's slope window, QMR's gate timing/windows/news filter, the vol bot's
missing EOD close and velocity hole, range-line bot shipping
`confluence_min: 0` while the code says 2 is "the best OOS book" (and
`single_position_per_pair: True` diverging from the validated held-position
model). Plus the mislabeled near-duplicate chandelier bricks
(`engine.py:177` claims parity with `rangeline.chandelier_stop`; they
differ) — a seeded future drift.

---

## 4. Per-system scorecard

| System | Signal family (folklore/replicated) | Validation status | Risk plumbing | Headline issue |
|---|---|---|---|---|
| **macrofx1** (`bot/`) | Folklore (S/R confluence levels + WT) with macro filters | Backtest exists, has IS/OOS flags but **no costs**; entry stack never OOS-proven | Good (sizing, guards, blackouts) — but no portfolio USD-exposure cap; pip values stale | Unvalidated 8-module vote with double-counted directions; beta subsystem regression malpractice |
| **backtest bot** (`backtestSystem/`) | Folklore (range-extension fibs + 13-indicator vote) | **None — live system, no backtest ever run, despite the name** | Dead kill switch; rough pip values | Live orders from an unvalidated system with inert loss limits |
| **Regime V7** | Momentum/regime (the one replicated family) at a noise-dominated horizon | Backtest is cost-aware with 60/20/20 split (good) — but live port drifted | Best-in-class exits/trailing; no cross-pair USD netting | Slope-window drift severs live from validation |
| **Confluence bot** | Folklore, honestly labelled | No backtest; paper-forward only — and FX paper is invalid (scale bug) | Strong architecture (caps, skip-not-truncate SL) | FX price-unit bug; 17× multiple-testing eval design |
| **Gold V1/V2** | Folklore entries + replicated macro gate (real yields/DXY) | No backtest; forward A/B planned; V1 live record poor | V2 good (range budget, aggregate caps); V1 40-pip SL cap bad | V1 ML/optimiser = in-sample by construction; costs missing from A/B |
| **Volatility bot** | Vol predictability (replicated) delivering a learned fade/follow book | Book has OOS discipline in JS; live fidelity gaps | Good, but RiskGuard not wired | Missing EOD close; unmeasured entry slip vs modeled costs |
| **Range-line bot** | Folklore (range-fib ladder), book-driven | Book OOS'd in JS; live default ≠ OOS-best config | Broker-native trailing SL (excellent); RiskGuard not wired | Shipping the superseded config; manual DST re-freeze risk |
| **QMR** | Folklore (session momentum), reverse-engineered from an external paid system | Excellent tooling (walk-forward, bootstrap, capacity card) — but live alerts use in-sample defaults and a drifted rule | n/a (signal-only) | Cost-free 10×-levered headline stats; unvalidated SPX/DOW/DAX clones |
| **Telegram V2** | Folklore levels under the house's best measurement discipline | **Ahead of the lessons' bar**: frozen policy, after-cost expectancy, honest ledger, falsified-and-corrected history | n/a (signal-only) | Percentile grade bands make "A+" relative not absolute; no per-cell significance; `marginPct=0` |

Telegram V2 is the internal benchmark: measure after-cost expectancy per
cell from a frozen policy, resolve honestly (expired ≠ win), report realized
vs claimed, refit review-only. Every other system should converge on that
pattern.

---

## 5. Ranked action list

### Tier 0 — correctness, this week (small diffs, no research)
1. Wire backtestSystem's kill switch (`kill.record(pnl_r)` at close).
2. ConfluenceBot: add an FX-scale smoke test, then thread pip/digits through
   `level_matrix`/`exits`/`session_engine`/`trendline_engine`.
3. Regime V7: fix the slope window to `_linreg_n(pair)` (or re-validate at
   8 bars); set `entry_conf` > `conf_floor`; sync the seven dead-code
   fallback defaults.
4. Vol bot: add the book-variant EOD close; burn bucket-None touches.
5. QMR: align live windows/gate bars with the backtest; fix ET labels/DST;
   pause or separately validate the SPX/DOW/DAX clones.
6. macrofx1: exclude direction-inheriting modules from `min_agree`; stop
   force-unlock resetting `day_start_bal`; live pip values.
7. Range-line bot: startup DST sanity log; seed chandelier from the fill.
8. Fix the chandelier docstring (`volatility_bot/engine.py:177`) and note
   both bricks in `LEGO_MODULES.md`.
9. GoldV2: London-midnight σ-forecast anchor; staleness check on the macro
   gate.
10. Telegram V2: fix the "triple-barrier" label; suppress ledger per-grade
    conclusions below n=30.

### Tier 1 — make the validation medium honest (the big one)
11. **Costs in every paper path** (all bots): fill at bid/ask, subtract
    round-trip spread + stop-slippage, swap on overnight holds; make paper
    balances move so drawdown guards rehearse. Log realized entry slip per
    trade (fill − modeled level) — the cheapest falsifier of the books' flat
    cost assumptions. Until this lands, no paper record counts as evidence.
12. Wire `pylego.risk_guard.RiskGuard` into the volatility and range-line
    bots; add a portfolio-level USD-exposure cap to macrofx1 and
    currency-netting to ConfluenceBot's `global_can_open`.
13. Fix or clearly quarantine PaperBroker (feed, money units, balance).
14. QMR: default costs inside `_computeNqQmr`; re-derive live defaults from
    the walk-forward retrain, not the full-sample grid; stamp every alert
    with validation status ("OOS Sharpe X over N trades, after-cost" or
    "UNVALIDATED").
15. Telegram V2: absolute expectancy floor on *alerting* (≥ k× pair cost),
    significance gate in `buildPolicy`, chance-baseline paragraph on the OOS
    card.

### Tier 2 — evaluation design (docs before code)
16. Pre-register the fleet evaluations (ConfluenceBot's 17 instruments, Gold
    V2-vs-V1, vol/range A/Bs): pass bar, chance baseline, both outcomes
    written down before the record accrues.
17. De-correlate confirmation counts everywhere (one vote per signal family).
18. Grade the evidence that already exists: backtestSystem's 200-record KV
    journal, V7's audit log per cfg_hash — compute the Quant-Macro L1.7
    metrics table (expectancy after costs, PF, max consecutive losses, DD)
    with the ≥30-OOS floor before touching any knob.
19. Gold: optimiser to dry-run-by-default, KV push gated on ≥30 trades +
    chronological split; ML stays off until walk-forward CV on ≥~100 trades
    beats the base rate.

### Tier 3 — research candidates from the lessons (harness first, never live-first)
20. Range-budget consumed as a policy-cell condition (Forecaster Part 5's
    ">80% ⇒ fade" — the lesson's "most powerful intraday filter"; odds
    modest, correlated with what dynamic HL lines already encode).
21. Vol-regime conditioning (VOL L3 ATR-percentile classifier, already in
    `volBacktestEngine.classifyRegime`): test the lesson's own claim that
    fades work in low-vol and fail in high-vol on the per-line book; add
    high-vol risk reduction to Gold/Confluence.
22. COT per the DF-01 six-step recipe (OI-normalise → z-score → 3y
    percentile → contrarian at extremes → momentum filter → watch
    commercials) — replaces macrofx1's raw-sign momentum read; free data.
23. CME OI walls/max-pain into GoldV2's obstacle map and zone scoring (the
    OI course's recipes; macrofx1 already uses walls for stops — the one
    place a course recipe is implemented near-verbatim).
24. Event blackouts where missing (Gold, V7 — `fomc_window_hours` is loaded
    and gates nothing).

---

## 6. Where more education would take us (beyond the current courses)

The courses stop where these systems' actual problems begin. Highest-value
next study, in order:

1. **López de Prado, *Advances in Financial Machine Learning* — the parts we
   haven't used.** History note: we already ran the meta-labeling arc (Trade
   Decision Engine, 2026-07, `Trade_Decision_Engine/ARCHITECTURE.md` §8b) and
   the fitted model landed at the base-rate Brier — the method worked, the
   primary signal under it was null. That's settled; do NOT re-run
   meta-labeling on another folklore signal hoping for edge. What remains
   unused and directly fixes problems found in this review: purged/embargoed
   walk-forward CV (the fix for Gold's K-fold), the Deflated Sharpe Ratio and
   PBO (the formal chance-baseline §3.4 needs), and sample-weighting for
   overlapping trades. Validation machinery, not strategy.
2. **QLIKE / Patton (2011) + HAR-RV (Corsi 2009)** — the forecaster notes
   already name them. `vol-forecast-bench.html` exists; running the
   "outperforms GARCH/Parkinson/Harvey" claim through OOS QLIKE in-house is
   a listed investigation thread and cheap.
3. **White's Reality Check / Hansen's SPA test** — the multiple-testing
   correction for "5,250 configs, top-5 shown" (QMR) and "17 instruments,
   pick winners" (ConfluenceBot). One weekend of study, reusable everywhere.
4. **Probability calibration (Platt/isotonic, Brier decomposition)** — the
   missing layer under every 0-1 "confidence" in the codebase; also fixes
   the Gold ML threshold problem if that path ever revives.
5. **Kelly-fraction / drawdown-based sizing theory** (Thorp; Vince) — the
   sizing formula is implemented; the *risk-% choice* (why 0.5% vs 1%?) is
   currently folklore.
6. **The replicated-edge literature the courses point at but don't teach:**
   time-series momentum (Moskowitz-Ooi-Pedersen 2012), FX carry with crash
   risk (Brunnermeier et al.), vol risk premium. The honest-teammate
   contract says chase edge only here — and only `trendFollowEngine.js`
   currently does. The FX factor set (dollar/carry/momentum/value) from the
   regression notes' investigate-later list is the natural next build once
   FRED rate data is wired.
7. **Cointegration properly (Engle-Granger, Johansen)** before the hedge bot
   trades pairs again — macro-deep-dives names the requirement; the bot uses
   correlation, which is not it.

Deliberately *not* recommended next: more indicator/pattern coursework, more
ML before validation discipline, options/gamma trading (the OI course's
dealer-flow material is useful as *context* for gold/index levels, but
trading it needs data we don't have).

---

## 7. Bottom line

The education has been absorbed unevenly: the **risk and mechanics lessons
are implemented well** (sizing, stops, anchoring, session discipline — the
things the courses call the real retail edge), while the **validation
lessons are the ones being violated** (costs, OOS provenance, multiple
testing, live-equals-backtest fidelity, independence of evidence). The
courses' own verdict on our signal families is that most are folklore whose
default outcome is null — which is fine, because the harness exists to find
that out cheaply. The work that makes the whole fleet honest is Tier 0 + 11
(costs in paper): after that, the forward records everyone is waiting on
actually mean something.
