# Tradability Review — Range Extension, Forecasting & QMR

> A focused, evidence-based assessment of whether the three "interesting"
> systems are actually **tradable**, not just whether their backtests look good.
> Companion to `CODEBASE_OVERVIEW.md` and `SYSTEM_ASSESSMENT.md`.
>
> **Headline:** all three are genuinely interesting, and none is tradable as-is.
> The results that make them attractive are largely an **in-sample mirage**. One
> of them (forecasting) fails in a *measurable* way, which is the single most
> useful finding here — it tells us exactly what to fix and what to keep.

---

## 1. Why "Interesting Results" Can Be Misleading

Every one of these systems shares the same three failure modes, in different
amounts. Before the per-system detail, here is the pattern to internalise:

1. **Optimistic fills.** Backtests fill a limit order the instant price *touches*
   a level. Live, the touches you don't get filled on are disproportionately the
   ones that would have lost (price blew through and kept going). Touch-fill
   counts the winners and silently drops the losers.
2. **Missing costs.** Spread, slippage, and commission are mostly set to zero or
   to optimistic constants. On thin-edge mean-reversion, costs alone can flip the
   sign of the P&L.
3. **In-sample selection.** Picking the best of N configs/filters on the same
   data that reports the result is multiple-comparisons bias. The more knobs and
   filters, the more the "edge" is just fitted noise — and the smaller the
   surviving sample, the less you can tell.

A real edge survives all three. None of these three has been *shown* to.

---

## 2. Forecasting — Strong Foundation, Measurably Fails OOS

**This is the most legitimate of the three and the only one with real
out-of-sample data — which is why it's the most informative.**

### What the numbers actually say
- **Sharpe degrades ~56% in-sample → out-of-sample** (mean ~0.75 IS → ~0.33 OOS).
- **9 of 26 pairs go negative out-of-sample** despite positive in-sample.
- **The tell is sample size:** the high-trade-count pairs collapse, while the
  "great" pairs are small-N flukes.

| Pair | IS Sharpe | OOS Sharpe | OOS trades | Read |
|---|---|---|---|---|
| audusd | 0.39 | **−2.25** | high | edge inverts on big sample |
| eurjpy | 0.43 | −0.21 | ~1,768 | collapses |
| cadjpy | + | **>1.5** | >1,400 | survives — worth a look |
| chfjpy | + | **>1.5** | >1,400 | survives — worth a look |

96% of pairs show positive *in-sample* Sharpe — suspiciously high, the signature
of selection fitted to the 2018–2023 training window.

### Fill & cost reality
The engines (`volBacktestEngine.js`, `weeklyVolBacktestEngine.js`,
`VolRangeForecaster/vol_backtest.py`, `ForecasterOptimizer/engine.py`) assume a
limit at `HL_75` fills the instant the daily high *touches* it, at the exact
price, with **zero spread and zero commission**. Realistic costs (~1.5 pip
spread + slippage over 500–1,000 trades) cost another ~0.25–0.4 Sharpe — enough
to push several positive-IS pairs negative.

### The vol estimate itself is unstable
The σ that sets every level is not yet reliable: NQ/index range error is around
**−36% and *widening*** across recent sessions (`VOL_CALIBRATION_TRACKER.md`).
On the high-vol days that matter most, the levels are systematically wrong.

### The central modelling problem (the real work)
The strategy currently **always fades** at the forecast extreme (sell at
`open + HL_75`, buy at `open − HL_75`). But at an exhaustion point, price does
one of two opposite things:

- **Mean-revert** — the move is exhausted, fade it back toward the open. ✓ for
  the current logic.
- **Continue / break out** — the extreme *is* the breakout; fading it is
  standing in front of a train.

A single always-fade rule has to be wrong roughly half the time by construction.
**The edge is not "fade the extreme" — it's knowing *which regime you're in* when
price reaches the extreme.** That classification (trend day vs range day,
exhaustion vs breakout) is the hard part and the thing most worth building.

### Verdict
- **As a fade strategy:** not tradable — fails OOS, before costs.
- **As an input:** the range *estimate* ("expected range today is X") is
  genuinely useful for sizing and level-setting in other systems, independent of
  whether you fade or follow.
- **Salvage value: HIGH** — separate the two questions and keep the estimate;
  rebuild the entry decision around an exhaustion-vs-continuation classifier.

---

## 3. Range Extension / Asia-Fib — Marginal, Entirely Fill-Dependent

### Fill & cost reality
- **Asia engine** (`asiaRangeEngine.js`): fills a level the first time
  `low ≤ level ≤ high`, at the exact level, **no slippage, no cost deduction**.
- **Z-score engine** (`zscoreSpreadEngine.js`): **zero costs**, and its own code
  states *only USDJPY's direction sign has been validated against live results* —
  the other pairs are research, not signals. Yield legs are monthly series
  forward-filled, so the z-score updates in monthly steps.
- **Range-fib baseline** (`rangeFibEngine.js`): the one engine that *does* model
  cost — 0.8 pip spread + 0.5 pip slippage = 1.3 pips. Still optimistic for
  crosses/gold (2–3 pip real spreads), and it models entry slippage only.

### Sample collapses as filters stack
This is the killer. Starting from ~90 candidate zones/day:
- "tight" filter removes ~70–80%,
- confluence-module gate removes ~80–90% more,
- priority mode caps at ~5 zones/day.

Net result on a 60-day window: roughly **2–3 trades *per Fib level***. The
analyzer (`asia-range-analysis.html`) literally hides cells with **<3 trades** as
"statistically unreliable." So the eye-catching win rates on the heavily-filtered
"tight confluence + high score" setups are **noise**, not edge.

### OOS
The UI has IS (2020–22) / OOS (2023–25) split buttons and sensible validation
gates (≥100 trades, WR ≥58%, PF ≥1.5, max DD >−20%, top-5-day concentration
<40%) — but **nothing has been run and committed**. No stored OOS evidence.

### Verdict
- **Base range-fib:** plausibly breakeven-to-marginal after realistic fills.
- **Filtered "tight confluence":** the high win rates are selection bias on tiny
  samples.
- **Z-score overlay:** only USDJPY is even directionally validated.
- **Salvage value: MEDIUM** — needs realistic fills (breach-and-reclaim), full
  costs, a hard sample-size floor, and a real OOS split before any of it counts.

---

## 4. QMR — The Most Speculative

### No results exist
The engine (`server.js` `_computeNqQmr()`, ~lines 2254–2654) computes everything
live; **nothing has ever been committed**. The "interesting result" is something
seen once on the dashboard, not a validated, reproducible figure.

### Fill & cost reality
- **Zero costs.** Spread constants exist in the file but are **never applied** to
  the QMR engine. The transaction-cost slider only affects the validation card,
  not the equity curve.
- Entry is the **open of the ~13:00 UTC bar (≈09:25 ET)** — a low-liquidity
  pre-market window where NAS100 trades ~1/5 of regular-hours volume. Expect
  2–5 bp of slippage that the model ignores (~1–3% CAGR drag).
- Stop-before-TP on ambiguous bars is conservatively handled (good), but
  intrabar fills and EOD exits assume perfect prices.

### Overfitting risk
- **~375 trades over 5 years** (Gate 1 fires ~60–70% of days, Gate 2 keeps ~half).
- The optimizer grid is **5,250 configs** → ~14 configs *per trade*. Rule of
  thumb wants ≤1 parameter per 30–50 trades; this is ~50× looser.
- Walk-forward windows exist in the UI; **no OOS results committed.**

### The thesis is shaky
Overnight-Asia → London → NY continuation is *plausible* (session momentum
carryover) but has no published precedent and a data-mined feel. The biggest tell
is **Systems 2/3/4 (rejection/extension/chop *fades*)**: if the core continuation
thesis were sound, you wouldn't need three post-hoc fade patches to rescue P&L.
Their existence suggests the base system produces predictable failures that hand-
tuned filters are mopping up — classic overfitting. Macro regime (VIX, rates) is
ignored entirely.

### Verdict
- **Tradable: no** — and unlike the others, you can't even see the numbers.
- **Salvage value: LOW until proven** — first commit an honest, costed, OOS run;
  only then is there something to evaluate.

---

## 5. Side-by-Side

| | Foundation | Real OOS evidence | Costs modelled | Tradable as-is | Salvage value |
|---|---|---|---|---|---|
| **Forecasting** | Strong | **Yes — and it fails** | No | No | **High** (keep the estimate) |
| **Range ext.** | Medium | No (buttons, no runs) | Partial (base only) | No | Medium |
| **QMR** | Weak–Medium | **None committed** | No | No | Low |

---

## 6. What Would Make Each Believable

The cheap, decisive move is the same for all three: **stop trusting the live
dashboards and re-test honestly**, with —

1. **Realistic fills** — require *breach-and-reclaim* (or add adverse slippage),
   not touch-fill. This is the biggest single correction.
2. **Full costs** — real spread + entry *and* exit slippage + commission per
   instrument.
3. **True walk-forward** — the config/filter selection window must never touch
   the test window. Report IS and OOS side by side, with a deflated-Sharpe
   adjustment for the number of trials.
4. **Sample-size floor** — no filter combination that yields <30 trades/year is
   allowed to count as "validated."

And specifically for the forecaster: **replace the always-fade rule with an
explicit exhaustion-vs-continuation decision** at the extreme, and test *both*
directions plus the classifier that picks between them.

---

## 7. Recommendation

Focus order, by expected payoff per hour of work:

1. **Forecasting first.** It's the only system you can already *measure*, the
   foundation is real, and the range estimate is reusable even if the fade isn't.
   The win is reframing the question from "fade the extreme" to "fade *or* follow
   the extreme, decided by regime."
2. **Range extension second.** Re-test with realistic fills + a sample floor;
   keep only what survives.
3. **QMR last.** First produce one honest, costed, OOS-split run and commit it —
   until then there is nothing to trade or even evaluate.

The next deliverable is a **web-based "honest harness"** built into the dashboard
(same style as the existing backtesters) that bakes in realistic fills, full
costs, and a true walk-forward split — and, for the forecaster, lets you toggle
mean-reversion vs continuation at the exhaustion point and measure a classifier
that chooses between them.

---

*Figures quoted here come from the repository's own backtests and optimizer
result files (`ForecasterOptimizer/results/`, `VOL_CALIBRATION_TRACKER.md`,
`FORECASTER_OPTIMIZER_RESULTS_LOG.md`) and from direct reading of the engine
code. The in-sample numbers are the system's own; the out-of-sample and
fill/cost critiques are the substance of this review.*
