# MVE Phase 7 — book-layer factor audit of the spread sleeves (pre-registered 2026-09-22)

*Registered before the real-data run. The run happens on Railway (needs `FRED_KEY`;
this sandbox has M1 + `OANDA_KEY` but no FRED), from `mve.html` → **📚 Book layer →
Run book factor audit**. Results get appended **below the line** and nothing above it
changes after the run.*

## 0. The question

The two spread sleeves with evidence both trade the same six **USD pairs**:
the validated 2Y sleeve (`YIELD_SPREAD_STRATEGY.md`) and the 10Y multi-spread sleeve
(`MULTI_SPREAD_SLEEVE.md`). When several pairs signal the same way, the book holds one
dollar bet several times (education notes, lesson slide 10). So:

> **Is the sleeves' out-of-sample edge a genuine rate-spread relative-value edge, or
> mostly a bet on the shared currency factors (USD, risk)?**

This is the "Position → Neutralise" half of the Mean Reversion of Residuals lesson
(`education/mean-reversion-of-residuals-notes.md`) applied to what already works,
rather than a new signal. It is also the MVE's missing layer: phases 0–6 value one
instrument at a time, and nothing yet looks at the book.

## 1. What is fixed before the run (no sweep, no re-runs with other settings)

| Item | Setting |
|---|---|
| Sleeves | `runSpreadBook('y2')` and `runSpreadBook('y10')` from `js/multiSpreadEngine.js`, unchanged |
| Sleeve config | zWindow **126**, entry \|z\| **2.0**, zExit 1.5, max hold 20d, pub lags US +2d / foreign +45d, auto-orient, from 2015-01-01. This is the validated 2Y region's representative cell, used for both tenors. |
| Position size | Flat, 1 unit per open trade (the sleeves' validated honest stream). Combined book = each tenor at ½ (equal risk, `MULTI_SPREAD_SLEEVE.md` Bar B convention). |
| Currency space | 8 currencies from the 7 USD majors; weekday closes only (M1 → UTC-date daily, the sleeves' own day boundaries; the ~2h Sunday stub is dropped and rolls into Monday) |
| Factor model | Rolling **120**-day window, basket de-mean, standardise, correlation PCA |
| K | Noise band: 500 pure-noise sets through the identical procedure, 95th percentile per rank. K = **median** count of leading components above the band over **in-sample windows only**, then fixed |
| Neutral book | Each day's currency weights projected off [sd⊙V₁ … sd⊙V_K, basket], mapped back onto the 7 USD majors, rescaled to the raw book's gross |
| No lookahead | Model at close t, position applied to return t+1 (unit-tested: truncating the future leaves every past day bit-identical) |
| Costs | **1 bp one-way per unit of turnover on every pair traded, hedge legs included** (= the sleeves' validated 0.02% round trip) |
| OOS | From the **2Y sleeve's own split date** (60% of its trades), so the OOS window matches the validated sleeve's |
| Sharpe | Annualised daily mark-to-market, flat days included, net of costs |

## 2. Pre-registered readings (per book; the 2Y sleeve is the primary one)

- **RELATIVE-VALUE:** neutral OOS Sharpe **≥ 0.5** AND neutral IS Sharpe **> 0**. The
  edge survives removing the shared factors.
- **FACTOR-DRIVEN:** raw OOS Sharpe **≥ 0.5** AND neutral OOS Sharpe **≤ 0.2**. The
  edge lived in the factors.
- **MIXED:** anything else. It is reported as MIXED, not re-read into one of the others.

What each would mean for the system:
- **RELATIVE-VALUE** → the factor-neutral combined book becomes the candidate system
  for forward paper tracking (smaller volatility per unit of edge, no hidden USD bet).
- **FACTOR-DRIVEN** → the sleeves are a USD-timing signal. Size the book as **one**
  USD bet, not six, and stop describing it as relative value. The validated raw sleeve
  isn't invalidated; its risk is re-described.
- **MIXED** → no change to the validated raw sleeve. Forward-track raw and neutral side
  by side and let forward data decide.

## 3. Sanity gate (checked first — bug before belief)

The raw 2Y book's **gross** OOS Sharpe must land within **±0.3** of the sleeve engine's
own `portfolioSharpe.oos` (shown on the page as "Reproduction check"). The expected
differences are small: weekday-only alignment (a trade dated on a dropped Sunday starts
a day later) and a turnover cost model with the same total. **If it's off by more, the
audit is not read** until the gap is explained.

## 4. Information only (not part of any reading)

- Mean |exposure| to each kept factor, and the average ex-ante share of the raw book's
  risk that is factor ("Risk that is factor").
- OOS volatility raw → neutral, per-year net returns, equity curves.
- **Shadow sleeve:** the currency PCA residual loop (education test #1, which already
  **FAILED** its own pre-registration). It is shown for forward tracking and as a JS-vs-Python
  cross-check, never as evidence.

## 5. Synthetic proof (`node js/mve/bookFactor.test.mjs`, 29/29)

On a synthetic 2-factor currency market with a planted edge of each kind:
- **Dollar-beta sleeve:** raw OOS Sharpe 1.56 → neutral −0.60, reads FACTOR-DRIVEN, 82% of
  its risk is factor.
- **Relative-value sleeve** (EURUSD against a reverting EUR residual): neutral OOS 1.16,
  reads RELATIVE-VALUE, and the hedge cuts volatility from 7.3% to 1.2%.
- **Random sleeve:** raw and neutral within 2 SE of zero.

The same file also checks exact projection (zero exposure after neutralising), the pair ↔
currency mapping, position timing, weekend handling, and no lookahead.

## 6. Known limits (stated up front)

- **No return attribution.** An "exposure × factor return" split was built and then
  removed. With only 8 currencies the factors are built from the same series, and USD is
  minus the basket average, so one currency's own move leaks into every factor. On
  synthetic data it ranked a pure relative-value sleeve as *more* factor-driven than a
  pure dollar bet. The neutral-book comparison doesn't have this problem.
- A single-pair USD position is mostly factor risk *by construction* (the synthetic
  relative-value sleeve was 92%), so a high "risk that is factor" number alone is not a
  verdict. The neutral Sharpe is.
- Spot returns only (no swap/carry), the same as the sleeves' validation.
- The neutral book trades NZDUSD as a hedge leg; the raw sleeves never do.
- One history (2015→), and the OOS is the 2Y sleeve's own OOS period, not fresh data.
  Forward tracking is still the only untouched test.

## 7. Code

`js/mve/bookFactor.js` (pure) · `js/mve/bookFactorEngine.js` (I/O) · `js/mve/bookFactor.test.mjs`
· `server.js` `POST /api/mve-book/run` + `GET /api/mve-book/status/:jobId` (async job,
6h cache) · `mve.html` 📚 panel. `js/diversificationCore.js` gained `symmetricEigen`
(eigenvectors from the same Jacobi pass; `symmetricEigenvalues` now delegates to it).
`js/multiSpreadEngine.js` now exports its `dailyClosesFrom`. Read-only: feeds no live
signal, bot or dashboard decision.

---

## 8. Results

*(pending the Railway run)*
