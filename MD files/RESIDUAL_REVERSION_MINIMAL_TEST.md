# Minimal-DOF residual mean-reversion — the price-only AR(1) branch (2026-09-21)

_Pre-registered before the real-data run. This is an INDEPENDENT re-test of the
unconditional residual-reversion question, built from scratch at the owner's
request, deliberately NOT reusing the MVE macro-factor residual (which is a
documented NULL on FX — `RESIDUAL_REVERSION_FX_TEST.md`). The object tested here is
the OTHER minimal thing the desk keeps circling: **price minus its own AR(1)
one-step forecast, faded at the bare sign.** No FRED, no factor soup, no entry
threshold optimised on the entry decision._

## 0. Why a separate, price-only test

The MVE residual is `price − OLS(price ~ rate differentials)`. That is a _macro_
fair value with real estimation DOF (factor betas, window, pub-lag). The minimal
question — "is price simply stretched versus where its own short memory says it
should sit, and does that snap back?" — is a different, lower-DOF object. An AR(1)
one-step forecast is the simplest non-trivial "fair value" that is not a bare
trailing mean, so it is the right minimal-DOF null to test first (CLAUDE.md
backtest-build discipline: start with the version that has almost nothing to fit).

## 1. The model (minimal DOF, fixed before running)

- **Fair value** = AR(1) one-step forecast: fit `p_t = c + φ·p_{t-1}` on the
  trailing `window=120` bars strictly before bar `i`, forecast `p_i = c + φ·p_{i-1}`.
  φ clamped to (−0.999, 0.999) so a near-unit-root fit can't explode.
- **Residual z** = `(price[i] − forecast) / residualσ` (in-sample residual std of
  the same causal fit). Positive z = price above its AR(1) forecast.
- **Signal** = the bare SIGN of z. Fade it (z>0 → short, z<0 → long). No entry
  threshold is tuned on the entry decision — the `threshold=0.0` arm IS the
  minimal-DOF strategy. A hold×threshold sweep exists only to be _paid for_ in the
  deflated Sharpe, not to be cherry-picked.
- **No lookahead** — proven in the unit test: truncating the future leaves every
  past residual bit-identical.

## 2. The benchmark that makes it honest

**A trailing-mean anchor z-score, built the SAME way over the SAME window.** This
is the crux. ANY trailing anchor "reverts" on a pure random walk (price above its
rolling mean tends to come back through it), so a positive raw IC is NOT evidence.
The only real signal is the model's **edge over** that spurious baseline:

```
icEdge = icPredictive(AR1 residual) − icPredictive(trailing-mean benchmark)
```

The synthetic unit test (`js/residualReversionCore.test.mjs`, 11/11 pass) proves
the harness behaves correctly on known data:

- **Random walk** → best icEdge ≈ 0, verdict NULL (no fabricated edge).
- **Mean-reverting AR(1)** → raw icPredictive strongly positive (reversion IS
  real) BUT icEdge ≈ 0 — _because the trailing-mean benchmark captures the same
  reversion_. This is the subtle, correct behaviour: a model only "adds" something
  if it beats a plain trailing mean, and on a stationary series it does not.

## 3. Validation gates (all on, none optional)

- **True chronological IS/OOS split** — the last 50% of the causal walk-forward
  scoring series is judged OOS. No refit on the split (the walk is already causal).
- **Costs ON** — 0.02% round-trip, the validated yield-spread sleeve's own
  assumption. Stated as an ASSUMPTION, not a measured spread/ATR gate (that data is
  not in this harness — `RESIDUAL_REVERSION_FX_TEST.md` §3 says the same).
- **Non-overlapping, horizon-matched trades** — entries spaced ≥ hold bars so trade
  returns are independent (no autocorrelation-inflated Sharpe).
- **Deflated Sharpe** (López de Prado, `js/backtestStats.js`) across the WHOLE
  hold×threshold sweep — the multiple-testing correction.
- **≥30 OOS trades** before any belief.
- **OU diagnostic** (`js/ouCore.js` `ouFit`) + empirical snap-back base rate, so the
  model's convergence claim is checked against the pair's own history.

## 4. Pre-registered outcomes (frozen before the run)

- **"It worked"** = OOS `icEdge > 0.03` at some horizon AND the horizon-matched fade
  clears **deflated-Sharpe ≥ 0.95 after costs on ≥30 OOS trades**, AND the
  cross-instrument pool (`poolConsistency`-style: positive icEdge AND >50% hit rate,
  sign-only is a coin flip) is consistent. → a candidate, confirm on more history.
- **"It didn't"** = anything else, **including a positive RAW icPredictive that does
  not beat the trailing-mean benchmark.** That is the spurious-reversion trap this
  brick exists to catch, and it is reported as a NULL, not re-narrated into a maybe.
- **Pooled null** → disaggregate ONCE (the slow 20/60-bar horizons are where a slow
  reversion edge would live), state the cell count and chance baseline, and stop —
  no fishing further splits.

## 5. Code

- `js/residualReversionCore.js` — the pure engine (`oosResidualSeries`,
  `validateResidualReversion`, `_synth`). No network/DOM/env. Reuses `ouCore` and
  `backtestStats.deflatedSharpe` (Lego Principle 1 — imported, never copied).
- `js/residualReversionCore.test.mjs` — 11/11 synthetic assertions (the honesty proof).
- `analysis/residual_reversion_minimal.mjs` — the runner. `node
analysis/residual_reversion_minimal.mjs [PAIR]` (needs `OANDA_KEY`; loads a root
  `.env` if present). Writes `analysis/output/residual_reversion_minimal.json`.

## 6. Relationship to the prior MVE null (read this before over-reading a green)

This test is **price-only**; the MVE null is **macro-factor**. They are different
objects, so this is not a re-run of an already-falsified lookalike. BUT the bar is
the same and the prior is informed by it: the MVE macro residual is NULL on 5/6
instruments and only weak-positive on EURUSD. If this simpler AR(1) residual ALSO
comes back null — i.e. price does not even revert to its own short-memory forecast
after costs — that is _convergent_ evidence that unconditional residual-reversion
has no tradeable edge on these series at daily horizons, and the honest next move
is the CONDITIONAL (regime-gated) version, not a third unconditional variant.

## 7. Results

_Pending the real-data run (`OANDA_KEY` not available in the authoring sandbox).
The table below is filled in from `analysis/output/residual_reversion_minimal.json`
once run — green and red reported honestly, per the working agreement._

| Instrument | meanPhi | OU half-life | Best icEdge | Horizon | Hit rate | Deflated Sharpe | Verdict   |
| ---------- | ------- | ------------ | ----------- | ------- | -------- | --------------- | --------- |
| EURUSD     | —       | —            | —           | —       | —        | —               | (pending) |
| GBPUSD     | —       | —            | —           | —       | —        | —               | (pending) |
| USDJPY     | —       | —            | —           | —       | —        | —               | (pending) |
| AUDUSD     | —       | —            | —           | —       | —        | —               | (pending) |
| GOLD       | —       | —            | —           | —       | —        | —               | (pending) |
| NQ         | —       | —            | —           | —       | —        | —               | (pending) |

**Pooled:** (pending)
