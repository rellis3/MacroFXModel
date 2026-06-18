# Dynamic Cross-System Book Allocation — Scope Document

**Status:** Scoping only — not yet implemented.
**Origin:** Second half of the original "coffee" feedback: *"a way to have dynamic allocation between systems so a component that forecasts what's meant to be strong and when ... overfitting is possible here so be really strict with the testing."*

---

## Where this fits

The feedback had two halves:

1. **Position sizing within each system** — closed. Continuous vol-targeted sizing was built for P1, validated OOS via Walk-Forward (won 8/10 windows), then rolled to P2/P3/P6 (PR #385). A follow-up full-sample comparison showed continuous is *not* a static win except for P1 (similar Sharpe, much smaller drawdown); for P2/P3/P6 it's strictly dominated by discrete. Conclusion: `discrete` stays the default everywhere; `continuous` stays available as an optimizer/walk-forward option, not a blanket replacement.
2. **Dynamic allocation *between* systems** — this document. Not started.

---

## What already exists (don't rebuild it)

| Asset | What it has | What it's missing |
|---|---|---|
| `diversification.html` `computeCombined()` (line ~1371) | Combines each system's monthly returns using a single weight per system (`ws[i]`), chosen from one of four presets — Equal Weight, Risk Parity, Max Sharpe/Markowitz, Min Drawdown (`applyPreset`, line ~1606) | The weight is computed **once over the whole sample and held constant**. It is not regime-conditioned, not a forecast, not time-varying. |
| `hub.html` ("Portfolio Risk Hub") | A fully-specified gate design: P7 JPY circuit breaker, Portfolio DD gate (>8% → halve all), **P1 Macro Regime Overlay** (scales every other book off P1's own composite score), **VIX Regime Gate** (60-day Z-score buckets: LOW/NORMAL/HIGH/EXTREME → per-book size scalar). Explicitly states gates apply a size scalar and **do not transfer capital between books** — downweighted capital sits in cash. | Zero `<script>` tags. Every number is hardcoded HTML. Not wired to any real backtest data, not validated, not connected to `diversification.html` at all. |
| `correlations.html` ("Correlation Lab") | A live, working regime classifier (`betaClassify(vix)`, `computeRegimeCorr`, a Regime Breakdown tab) with real rolling correlation/beta-by-regime computation. | Scoped to FX currency pairs and macro factors, not the P1–P4/P6 books. Not wired to system weights either. |
| `diversification.html` `runP3`/`runP4` | A VIX regime classifier already computed and reused twice: `vix < vixCalm && z < 0` → Calm, `vix > vixStress \|\| z > stressZ` → Stressed, else Elevated, using `_cfg.p3.{vixCalm, vixStress, stressZ}` and `rollingZ(vixRaw, zWin)`. Already optimizer-validated (it's in `OPT_GRIDS.p3`). | Only used to size P3 and P4 individually — never used to gate the *combined book's* weights across systems. |

**Conclusion:** the design already exists (hub.html) and the regime-detection code already exists and is validated (P3/P4's VIX classifier in diversification.html). The work is wiring the two together into `computeCombined()`, behind the same walk-forward/DSR discipline already applied to the sizing-mode work — not inventing a new forecasting model from scratch.

---

## Proposed design

### Regime signal: reuse, don't invent
Use the existing P3/P4 3-state VIX classification verbatim. Refactor the inline classification (currently duplicated in `runP3` and `runP4`) into one shared `regimeAt(dateIdx)` helper returning `'calm' | 'elevated' | 'stressed'`. Zero new free parameters — same thresholds already in `_cfg.p3` and already proven via the optimizer.

### V1 — hand-set scalar, no fitting
Mirror hub.html's gate table directly rather than fitting anything:

- **Stressed**: P1/P2/P3/P4 scaled down (e.g. 75%/50%, matching hub.html's existing matrix); **P6 exempt, stays 100%** — gold is the safe-haven leg and hub.html explicitly calls this out.
- **Calm / Elevated**: 100% all books — no change from whatever the active static preset already gives.

No optimizer grid in V1. The point is to get an honest walk-forward read on whether *any* gate of this shape helps, using numbers that are already written down and economically motivated rather than fit to the data — this sidesteps selection bias for the first pass entirely.

### Capital treatment — decide explicitly, don't default by accident
hub.html's model reduces total book exposure (freed capital sits in cash) rather than reallocating it to the other books. Recommend keeping that semantics for V1 — it's the simpler, more conservative claim ("de-risk the book in stress") versus the much larger claim ("tilt between books"), and the second is a bigger overfitting surface that should wait for a later phase if V1 proves out.

### Where it plugs in
- `regimeAt(dateIdx)` — shared helper, refactored out of `runP3`/`runP4`.
- `gateMultiplier(sysKey, regime)` — hand-set lookup table per V1 above.
- `computeCombined(results, weights)` — instead of one static `ws[i]` applied to every month, multiply `ws[i] * gateMultiplier(SYS_KEYS[i], regimeAt(date))` per month, **without renormalizing to sum to 1** (per the cash-sits-out decision above).
- A "Regime Gate: On/Off" toggle next to the four existing preset buttons, so static-vs-gated is a one-click comparison — same principle as wiring `sizingMode` into the existing `OPT_GRIDS` instead of building a separate comparison tool.

---

## Testing plan (non-negotiable)

1. **Full-sample comparison** (sanity check only, not the deciding test) — Combined Book Sharpe/CAGR/DD, gate on vs off, under the current Max Sharpe weights.
2. **Walk-Forward** — extend the existing rolling train/test harness to treat "Gate On"/"Gate Off" as an in-sample choice per window, exactly like `sizingMode`, and read the OOS win rate off the drift table. This is the test that actually matters — the P1 sizing-mode lesson was that a full-sample static comparison answers a different question than "does this adaptively win OOS."
3. **Deflated Sharpe Ratio (Section 6)** — add "Combined w/ Regime Gate" as its own row so its selection-bias-corrected probability is reported next to the four existing presets.
4. **EV-by-regime (Section 7)** — cross-check: this section should already show whether stressed months are where the gated books lose money. If it doesn't, the gate has nothing to fix, and a null/neutral result here is itself a useful, honest finding — not a failure to dig deeper.

## Phase 2 (only if V1 proves out OOS)

Replace the hand-set 75%/50%/100% multipliers with a small optimizer grid — a single shared "stress multiplier" ∈ `{0.5, 0.6, 0.7, 0.8, 1.0}` applied uniformly to all non-exempt books, wired into `OPT_GRIDS` the same way `sizingMode` was. Keep it one shared scalar rather than 4 books × 3 regimes = 12 free parameters; the latter is a much larger overfitting surface and should only be considered if the single-parameter version *also* proves out OOS, with a correspondingly higher DSR bar before adoption.

## Explicit non-goals

- Within-system position sizing (`sizingMode`) — closed, separate, already shipped in PR #385.
- A forward-looking regime *forecast* (e.g. predicting tomorrow's VIX regime before it happens). V1 only reacts to today's already-realized regime, same lag profile as every other signal in the book. Predicting regimes ahead of time is a materially bigger, separate research question.
- Per-system fitted multipliers in V1 — Phase 2/3 territory, with a higher evidentiary bar than the single shared scalar.

## Risks / open questions

- **Regime persistence vs. timing**: VIX regimes can stay "stressed" for months. A gate that's on for a long stretch behaves more like a structural underweight than a tactical tilt. Need to check how much of any OOS improvement is really just "P1/P3/P4 are underweight on average" in disguise — compare against simply lowering their static Max-Sharpe weight by the same average amount, to isolate whether *timing* adds anything beyond average de-risking.
- **Boundary whipsaw**: discrete on/off transitions at the Calm/Elevated/Stressed boundary risk the same flapping problem already seen in the position-sizing work. Worth confirming the existing "Elevated" buffer zone is wide enough.
- **Small N**: the available history contains a small number of genuine stress regimes (GFC, COVID, 2022 hiking). Walk-forward windows touching stress will be scarce, so OOS evidence here will be thinner than the position-sizing test had — any conclusion should say explicitly if it rests on very few stress episodes.

## Estimated effort

- V1 (shared regime helper + hand-set gate + toggle + Walk-Forward/DSR wiring): comparable scope to the P2/P3/P6 `sizingMode` rollout — roughly one session.
- Phase 2 (single-parameter optimizer grid): small incremental addition once V1's OOS result is in hand.
