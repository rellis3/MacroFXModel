# Credit-Spread Risk Gate — signal & feature spec

**Purpose.** Use corporate-bond credit spreads as a *leading* macro risk-appetite
gate for the risk-sensitive instruments (NQ / SPX / DAX and, as a risk proxy,
EUR/USD and the growth FX). Credit holders carry the downside of a weakening
economy and are structurally more risk-averse than equity holders, so credit
tends to **de-risk before equities** — a widening in spreads often *precedes*
higher equity vol / risk-off; a tightening improves risk appetite and is
supportive for equities.

Two deliverables:
1. **Shipped** — a plain-English *Credit gate* in the Daily Brief (`today.html`):
   a macro thread + a signal folded into the risk verdict. See "Dashboard
   implementation" below.
2. **This spec** — the fuller feature vector (the "credit-Greeks") for a fitted,
   OOS-validated model. Not yet implemented; this is the design.

---

## 1. What we measure, and why an index

We watch an **index**, not individual bonds. The canonical daily cash series is
the **ICE BofA US High-Yield OAS** (`BAMLH0A0HYM2`, exposed as `hy` in
`/api/fred`). The real-time, tradable, less-liquidity-contaminated cousin is
**CDX HY** (Markit) — not currently fed, a candidate source. Rating cohorts we
already have: `hy_bb` (`BAMLH0A1HYBB`), `hy_ccc` (`BAMLH0A3HYC`). Financial
conditions: `nfci` (Chicago Fed NFCI).

**OAS strips optionality, not liquidity.** A cash OAS still bundles: expected
default loss + risk/uncertainty premium + **liquidity premium** + tax/technical.
We do **not** try to isolate the risk-appetite component analytically — for a
daily gate it isn't worth it, because:
- the liquidity premium is slow-moving and persistent, so a **z-score /
  percentile of the level** normalises its baseline away, and
- the **daily/weekly change** is dominated by the risk-sentiment component.

If a cleaner decomposition were ever wanted: use **CDX** (unfunded, liquid) and
the **cash-CDS basis** as an explicit liquidity gauge; or the Fed's **Excess Bond
Premium** (Gilchrist–Zakrajšek), which regresses spreads on firm-level default
risk and keeps the residual; or spread-to-swaps rather than spread-to-Treasuries
(Treasuries carry their own convenience premium that spikes in flight-to-quality).

---

## 2. The feature vector (the "credit-Greeks")

Terminology borrowed as an analogy for feature engineering — these are **not**
Black-Scholes Greeks, they are level + derivatives + persistence of the spread.

| Feature | "Greek" | Definition | Notes |
|---|---|---|---|
| **Position** | — | percentile / z of the level vs its own trailing window | the missing term in a pure-derivatives view; a 10bp widen from stressed ≠ from calm |
| **Velocity** | Delta (1st deriv) | Δ bps over 1d, 5d, 20d | 1d is noisy; **5d is the cleaner risk read**. z-score the change vs its own recent vol-of-changes |
| **Acceleration** | Gamma (2nd deriv) | change in the 5d slope (smoothed) | 2nd derivatives are **mostly noise** — EWMA the level first. Use the **sign/quadrant**, not the raw number |
| **Persistence** | Theta | regime stickiness | days-in-regime, or an AR(1)/OU half-life, or a **2-state HMM self-transition prob** (repo already has HMM infra) |
| **Quality** | — | CCC − BB decompression (level + Δ) | the sharpest, earliest risk-appetite tell — the low-quality tail moves first |
| **Liquidity** | — | cash-CDS basis (if CDX added) | separates "liquidity" from "riskiness view" — a driver the user correctly flagged |

**Acceleration quadrant** (the useful form of gamma): the joint (velocity sign ×
acceleration sign):
- widening + accelerating → risk-off *intensifying* (the one to fear)
- widening + decelerating → stress maybe exhausting
- tightening + accelerating → risk-on impulse
- tightening + decelerating → rally fading

---

## 3. Pitfalls to bank before fitting

- **Multicollinearity / overfit.** Δ, Γ, Θ are mechanically related (Γ = Δ-of-Δ;
  Θ correlates with level). Don't feed all raw into a small model — **smooth,
  z-score each, keep the feature count small.**
- **Non-stationarity.** bps levels drift across rate regimes (2008 vs 2021).
  Normalise everything (z / percentile / spread-to-own-history) so the model
  reads *deviation*, not *regime*.
- **Asymmetry.** Widening→risk-off is faster and sharper than tightening→risk-on.
  Model the signs asymmetrically (separate features or an interaction term).
- **Complacency levels.** Tight spreads can be reach-for-yield / CB support, not
  genuine safety — another reason **change/percentile beat level** for timing.

---

## 4. Validation protocol (non-negotiable, per repo discipline) — **BUILT**

The thesis is *credit leads equity vol* — so test exactly that, **out of sample**.
Now implemented as `js/creditLeadLagEngine.js` + `/api/credit-leadlag/*` +
`credit-leadlag.html`:
- Target: NQ **forward realized vol** over (t, t+h] (`forwardRealizedVol`).
- Predictors: the §2 features (velocity / level-percentile / accel / HMM stress
  prob), computed **causally** (data ≤ t only).
- **Lead-lag table:** corr(predictor[t], vol[t+k]) for k∈±maxLag, with t-stats
  (lag>0 = credit leads).
- **True IS/OOS split** (chronological), reporting the **information coefficient**
  (rank corr) IS vs OOS + a hit-rate.
- **Named benchmark:** vol's own persistence (trailing realized vol). Credit only
  "wins" if its OOS IC is positive AND beats the past-vol benchmark — because vol
  is autocorrelated, that's the honest bar.
- Since the target is a vol *level* (not a traded price), this is a
  forecast-quality (IC) study, not a PnL backtest — no cost model applies.
- **Validation status:** the engine + HMM are unit-tested to recover *planted*
  signal on synthetic data (`creditLeadLagEngine.test.mjs` 17, `creditHmm.test.mjs`
  18, `creditCore.test.mjs` 28). The **real** verdict on live FRED HY OAS + OANDA
  NQ runs on Railway (FRED/OANDA are Railway-only). Prerequisite still open: confirm
  FRED `BAMLH0A0HYM2` daily-history coverage is adequate (the NASDAQ pipeline
  switched to an HYG/LQD proxy for coverage reasons).

---

## 5. Repo integration path (Lego)

- **Brick:** extract `js/creditCore.js` — one pure, unit-tested definition of the
  features (position/velocity/accel/persistence/quality), importable by the
  dashboard, a backtest, and the bots so they can't drift. Register in
  `LEGO_MODULES.md`.
- **Consumers:** the Daily Brief credit gate (below); the Trade Decision Engine as
  a macro gate; the Telegram alerts (fire on regime flip); a dedicated credit
  research/backtest page for the §4 study.
- **History:** add `hy_bb` / `hy_ccc` (and IG) to `_FREDHISTORY_SERIES` for proper
  long-window percentiles/z (currently only `hy` is in the history cache).

---

## 6. Dashboard implementation (shipped)

`today.html` `creditGate()` computes, client-side from `/api/fred` +
`/api/fredhistory` (`hy` history), a pragmatic subset of §2:
- **position** — percentile of HY OAS within its trailing history
- **velocity** — 1d and ~5d Δ in bps
- **acceleration** — sign of the smoothed change in 5d slope
- **persistence** — consecutive days above the 20d average
- **quality** — CCC−BB level + 1d direction

It renders a plain-English macro thread ("Credit spreads — the early warning")
with the numbers demoted, and folds a gate (`RISK-ON / NEUTRAL / CAUTION /
RISK-OFF`) into the Market Read risk verdict and the mood strip, tied explicitly
to NQ/SPX and EUR/USD. By using **change + percentile**, the slow liquidity-premium
level washes out by construction — the pragmatic answer to "do you strip the
liquidity premium?": no, and you don't need to for a daily gate.
