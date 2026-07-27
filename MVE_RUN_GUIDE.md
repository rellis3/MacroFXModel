# Market Valuation Engine — Run & Usage Guide

> **What this is.** A working, tested implementation of the Market Valuation Engine
> designed in `MARKET_VALUATION_ENGINE.md` (Part 9's phased plan). It lives entirely
> in **`js/mve/`** plus a standalone demo page **`mve.html`**.
>
> **Safety — read first.** This subsystem is **fully isolated**. Nothing in the live
> system imports it: no change to `server.js`, `_worker.js`, `levels.js`, `signal.js`,
> `index.html`, `hub.html`, or any bot. It adds **no API route** and is **not linked**
> from any dashboard. `mve.html` is served as a static file only. So it deploys with
> the repo but **cannot alter live behaviour** — going live is a deliberate, separate
> step (§7). It imports two existing *pure* bricks read-only (`statsCore.js`,
> `backtestStats.js`) and copies nothing.
>
> **Honesty (per `CLAUDE.md`).** This is **built and tested**, not **proven to have
> edge**. Every fair value here is validated only on *synthetic* data so far — the
> sandbox can't reach OANDA/FRED. The engine is correct; whether it produces edge on
> real data is exactly what Phase 0's harness exists to find out. Don't size real
> money off it until it clears out-of-sample validation on real feeds.

---

## 1. Run the tests

```bash
node js/mve/mve.test.mjs
```

59 synthetic, deterministic (seeded — no `Math.random`) assertions. Each proves a
mathematical property (OLS recovers known β, OU recovers known κ, ensemble weights the
tightest-σ member most, Kalman filters to the true hidden level, Mahalanobis handles
correlation correctly, the full pipeline flags an injected mispricing, …). Expected:

```
✅ MVE tests: 59/59 passed
```

Syntax-check any module the usual way: `node --check js/mve/<file>.js`.

## 2. Open the interactive demo

Serve the repo root and open `mve.html` (e.g. `npm start` then
`http://localhost:<port>/mve.html`, or any static server). It generates synthetic
macro-driven price data in the browser, runs the **whole pipeline**, and renders the
per-trade valuation card + a price-vs-fair-value chart + the raw valuation object.
Sliders inject a known mispricing and reversion speed; dropdowns switch regime and
consensus method (ensemble vs Kalman). No network, no server route.

## 3. Module map (`js/mve/`)

| File | Phase | Owns |
|---|---|---|
| `linalg.js` | 0 | pure matrix ops (solve, inv, transpose, quad) for OLS/Kalman/Mahalanobis |
| `ols.js` | 0/1 | multi-factor OLS + **prediction σ** (folds in β-estimation error) |
| `validation.js` | 0 | purged/embargoed **walk-forward splits**, **band calibration**, pinball/MAE, re-exports `deflatedSharpe` |
| `contract.js` | 1 | the `estimate()` contract + Bucket A/B/C (`anchor`/`weight`/`alpha`) split |
| `emitters.js` | 1 | fair-value models: `regressionEmitter` (BEER-lite), `ar1Emitter`, vol/positioning weights |
| `ou.js` | 2 | **OU fit** (κ, half-life, t-stat) + **convergence** (P/magnitude/CI) + empirical snap-back |
| `mispricing.js` | 2 | standardized residual, **Mahalanobis**, Bayesian mispricing posterior |
| `regimeWeights.js` | 3 | the regime-adaptive weight table (generalized from `gold-model.js`) |
| `ensemble.js` | 3 | precision-weighted / min-variance **consensus** + dispersion + effN |
| `ssm.js` | 5 | **Kalman** state-space fusion (hidden fair value, emitters = observations) |
| `factorModel.js` | 6 | shared-factor cross-asset loadings + **coherence check** (safe Relationship Engine) |
| `confidence.js` | 4 | logistic **confidence engine** over agreement/fit/calibration/regime/reversion |
| `index.js` | 4 | **`runMVE()`** orchestrator + `valuationCard()` / `valuationText()` |
| `signalAdapter.js` | 4 | OPT-IN blend of MVE into an existing 0–100 signal score (not wired) |
| `mve.test.mjs` | — | the synthetic test suite |

## 4. Minimal usage

```js
import { runMVE, valuationText, valuationCard } from './js/mve/index.js';

const v = runMVE({
  instrument: 'EUR/USD',
  price:   [...],                 // number[] newest-last (level or log-level)
  factors: [                      // aligned to price, newest-last
    { name: 'rate', series: [...] },   // e.g. 2y real-rate differential
    { name: 'dxy',  series: [...] },
  ],
  returns:  [...],                // for the vol weight (optional)
  crowdPct: 72,                   // COT spec percentile (optional)
  window:   150,                  // rolling fit window
  horizon:  10,                   // convergence horizon in bars
  regime:   'RANGE',              // from your HMM/macro classifier
  useSSM:   false,                // false = ensemble, true = Kalman consensus
});

console.log(valuationText(v));    // the AI-style sentence
// v.fairValue, v.sigma, v.mispricing.z, v.convergence.pRevert, v.confidence, ...
```

`runMVE` returns: `fairValue`, `sigma`, `mispricing {gap,z,rich,label,tailProb}`,
`convergence {pRevert,expectedMagnitude,halfLife,ci68,ci95}`, `snapbackBaseRate`,
`confidence` (+ `confidenceBreakdown`), `ensemble {weights,dispersion,effN,members}`,
`ssm` (Kalman cross-check), and the raw `estimates`.

You can also pass your own pre-built anchors (e.g. a yield model or OI-magnet structure
level) via `ctx.extraEmitters` or bypass the built-ins entirely with `ctx.estimates`.

## 5. Validation (Phase 0) — how to check a model is honest

```js
import { walkForwardSplits, walkForwardEvaluate, bandCalibration, deflatedSharpe } from './js/mve/validation.js';

const report = walkForwardEvaluate(n, (split) => {
  // fit on [trainStart,trainEnd), predict [testStart,testEnd) with the embargo gap
  return { forecasts:[...], actuals:[...], sigmas:[...] };
}, { trainSize: 500, testSize: 60, embargo: 10 });

report.calibration;   // { 0.68:{coverage,...}, 0.95:{...} } — coverage should ≈ nominal
report.mae; report.bias; report.rmse;
```

**The rule:** a fair value's `sigma` must be the **out-of-sample** residual std, and
its bands must be **calibrated** (coverage ≈ nominal) before its mispricing z is
believed. `deflatedSharpe(dailyReturns, trialSharpes)` discounts any backtest Sharpe
for the number of configs tried.

## 6. Live data — WIRED (read-only endpoint)

The engine is now hooked to real data via **`js/mve/liveAdapter.js`** + a server
endpoint. It sources real **OANDA D1** prices and **FRED** macro series through the
*same* fetchers the rest of the server uses (`fetchD1`, `fetchFredSeries`) and runs the
full pipeline. It is **surfacing-only** — it does not feed any live signal or bot.

**Endpoint (on the deployed server, needs `OANDA_KEY` + `FRED_KEY`):**

```
GET /api/mve            → { supported:[XAUUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,NQ] }
GET /api/mve/EURUSD     → full valuation (fairValue, mispricing z, convergence, confidence, dataSource)
GET /api/mve/XAUUSD?ssm=1&regime=RISK_OFF   → Kalman consensus, regime-tilted
GET /api/mve-validate/NQ  → the OOS gate for NQ (2026-07-27 addition, see below — not yet run on real data)
```

Results are cached 1h in memory (`?fresh=1` to bypass). In the sandbox the endpoint
returns a clean `{ok:false, error:"FRED_KEY not configured"}` — it only computes real
values on Railway where the keys are set. The **demo page** (`mve.html`) has a
"Live — OANDA + FRED" data-source toggle that calls this endpoint.

**Factor design** (`FACTOR_SPEC` in `liveAdapter.js`), per `MARKET_VALUATION_ENGINE.md`
Part 4:
- **Gold** → US 10y **real yield** (DFII10) + broad **DXY** (DTWEXBGS) — the proven
  `system-gold-macro` model; both external daily drivers.
- **FX** → US-vs-foreign **rate differentials** (10y + 2y/short) + US **breakeven**
  (T10YIE). **DXY is deliberately excluded for FX** — EUR is ~57% of DXY, so regressing
  EUR/USD on DXY would be a near-tautological (circular) fair value. OLS learns the sign,
  so differentials are passed raw (us − foreign).
- **NQ** (added 2026-07-27, per the OU/dog-owner conversation — see chat log) → US 10y
  **real yield** (DFII10, discount-rate channel) + **HY OAS** (BAMLH0A0HYM2, credit/
  risk-appetite channel) + **VIX** (VIXCLS, vol risk-premium channel). Minimal-DOF first
  pass, deliberately **3 factors, not gold's DXY-included recipe**: Nasdaq's
  dollar-earnings-translation channel is weaker/more debated than gold's, so DXY isn't
  added just because gold's spec has it — the discipline is "prove the narrow version
  first" (`CLAUDE.md` backtest-build section). `js/mve/mve.test.mjs` proves the wiring
  (spec, `buildContext`, `runMVE`, injected-fetcher `runLiveMVE`) on synthetic data —
  **no real numbers yet**. OANDA (`NAS100_USD`) 403s in the sandbox as expected/documented;
  `FRED_KEY` isn't set in the sandbox either. **Next action: run
  `GET /api/mve-validate/NQ` on Railway** — that's the actual gate, same as every other
  instrument in §10 below. Until that returns, this is infrastructure, not a result.

**Still not wired** (deliberately): the signal-score blend, entry scanner, AI summary
(§7). The adapter is the only new code that touches live feeds; the engine stays pure.
Add `crowdPct` (COT percentile) or `extraEmitters` (OI walls / yield model as extra
anchors) to the `runMVE` ctx later to enrich the consensus.

> **Honest caveat:** foreign long yields on FRED are *monthly* (`IRLTLT01*M156N`),
> forward-filled onto trading days — so the FX rate-differential factor only steps
> ~monthly. That's fine for a slow macro fair value (the honest horizon anyway) but
> means the FX daily signal is coarser than gold's (whose drivers are daily). Noted as a
> future refinement (daily foreign yields / swap curves).

## 7. Integrating into the dashboard (deliberate, still off)

When (and only when) the engine clears OOS validation on real data:

1. **Signal score** — `js/mve/signalAdapter.js` shows the exact blend:
   `augmentSignalScore(computeSignalScore(...), valuation, direction, 0.20)` adds MVE as
   a 6th factor without disturbing the other five. Wire it in `js/signal.js`.
2. **Entry scanner** — add a mispricing tag/weight in `runEntryScanner`; use `fairValue`
   as a non-arbitrary TP target.
3. **AI summary** — fold `valuationText(v)` / the valuation object into
   `js/ai.js aiCollectSnapshot`.
4. **Card** — drop `valuationCard(v)` into any page.

Each of these is a small, reversible edit to a live file — do them one at a time, behind
your normal review, after the numbers justify it.

## 8. Phase status

| Phase | Status |
|---|---|
| 0 — validation harness | ✅ built + tested |
| 1 — emitter contract + multi-factor fair values | ✅ built + tested |
| 2 — mispricing + OU convergence | ✅ built + tested |
| 3 — ensemble + regime-adaptive weights | ✅ built + tested |
| 4 — orchestrator, confidence engine, valuation card, opt-in adapter | ✅ built + tested |
| 5 — Kalman state-space fusion | ✅ built + tested |
| 6 — shared-factor cross-asset model (diagnostic) | ✅ built + tested |
| Live data adapter + `/api/mve/:sym` endpoint (§6) | ✅ built + wired (real OANDA/FRED, read-only) |
| Honest confidence (base-rate reality, capped ≤0.90, fairly-priced state) | ✅ built + tested |
| OOS validation engine + `/api/mve-validate/:sym` (§10) | ✅ built + tested (benchmark-relative, no-lookahead) |
| Dashboard wiring — signal score / scanner / AI (§7) | ⛔ intentionally off |
| OOS proof on real feeds | ▶ run `/api/mve-validate/:sym` on Railway — this is the gate |

## 10. Does it actually predict? — the OOS validation (§b)

The endpoint that answers whether any of this is worth trusting:

```
GET /api/mve-validate/EURUSD   → walk-forward, no-lookahead validation report
```

It walk-forwards over ~6y of history, fitting the fair value strictly on past data, and
measures whether the mispricing z **predicts forward returns**. The key column is
**`icEdge`** per horizon:

- `icPredictive` = −corr(z, forward return); >0 means cheap→up / rich→down held OOS.
- **BUT** any trailing anchor shows *spurious* reversion IC on a pure random walk
  (deviation-from-a-trailing-fit mechanically mean-reverts). So the report also computes
  `icBenchmark` — the same IC for a **naive trailing-mean anchor** — and the real signal
  is **`icEdge = icPredictive − icBenchmark`**. Verified: on a random walk `icEdge ≈ 0`
  across all horizons (60/60 seeds → NULL verdict); it only lights up when the *factor*
  fair value genuinely beats the trailing baseline.
- Plus a z-fade strategy's **deflated Sharpe** (P(true Sharpe>0) after adjusting for the
  thresholds tried), and a one-line **verdict**: `SURVIVES` / `WEAK` / `NULL`.

The demo page (`mve.html`, Live mode) has a **🔬 Run OOS validation** button that renders
this. **Expect NULL or WEAK at daily horizons** — macro fair value reverts over
weeks-to-quarters, so look at the 20/60-bar rows. A `NULL` verdict is not a failure of the
build; it is the harness correctly telling you *do not wire this in*.

## 9. What to remember

- The engine is **correct and isolated**; edge is **unproven** until §6 + Phase-0
  validation run on real OANDA/FRED data.
- Every number right of "mispricing" on the card is **model, ex-ante** — size from the
  **OOS-calibrated confidence**, half-Kelly at most.
- Don't build the causal cross-asset *propagation graph* (`MARKET_VALUATION_ENGINE.md`
  Part 9.1) — the `factorModel.js` shared-factor form is the safe version and is enough.
