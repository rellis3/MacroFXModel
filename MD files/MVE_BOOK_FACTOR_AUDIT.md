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

## 8. Results (Railway run, 2026-09-22)

Run from `mve.html` → 📚 Book layer on the deployed server. Data 2016-01-04 → 2026-09-21,
2,783 weekday closes. **K = 2** (IS windows beating the noise band: 1 comp 226, 2 comps
972, 3 comps 460, so the median is 2, the same K as the lesson and test #1). OOS from
**2022-11-15** (the 2Y sleeve's own split). Cost 1 bp one-way on every pair traded, hedge
legs included.

### Sanity gate (§3): **PASSED**

| Sleeve | Engine's own OOS Sharpe | This book's raw gross OOS | Gap |
|---|---|---|---|
| 2Y (290 trades) | 1.13 | 1.06 | −0.07 |
| 10Y (347 trades) | 0.58 | 0.62 | +0.04 |

Both are well inside ±0.3, so the book reproduces the sleeves and the audit can be read.

### Readings (§2): **RELATIVE-VALUE on all three books**

| Book | Raw IS | Raw OOS | Neutral IS | Neutral OOS | OOS vol raw → neutral | Risk that is factor | Days held | Reading |
|---|---|---|---|---|---|---|---|---|
| **2Y sleeve (primary)** | 0.26 | 1.02 | 0.46 | **1.33** | 14.1% → 5.1% | 55% | 1,309 | **RELATIVE-VALUE** |
| 10Y sleeve | −0.02 | 0.58 | 0.14 | **1.01** | 12.5% → 4.3% | 55% | 1,173 | **RELATIVE-VALUE** |
| Combined 2Y+10Y (equal risk) | 0.15 | 0.98 | 0.36 | **1.36** | 11.1% → 4.1% | 56% | 1,786 | **RELATIVE-VALUE** |
| Currency residual (test #1, shadow) | −0.14 | 0.31 | −0.14 | 0.31 | 1.8% → 1.8% | 0% | 2,662 | info only |

(Sharpe is annualised, daily mark-to-market, net of costs.)

**Net return by year, % (raw / neutral):**

| Book | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2Y | 50.3 / 41.5 | −4.0 / −1.6 | −21.0 / −14.8 | 4.6 / 6.5 | −31.8 / −22.6 | 7.0 / 5.4 | 31.2 / 22.3 | 19.3 / 9.2 | 22.8 / 11.3 | 2.1 / −3.3 | 8.3 / 7.9 |
| 10Y | 11.4 / 9.1 | −0.1 / 7.8 | −11.8 / −10.6 | 9.7 / 5.2 | −45.6 / −26.5 | 7.1 / 3.8 | 29.4 / 20.9 | 1.5 / 4.0 | 20.7 / 9.0 | 8.3 / 1.9 | −3.6 / 2.2 |
| Combined | 30.9 / 25.8 | −2.0 / 3.2 | −16.4 / −13.4 | 7.2 / 6.4 | −38.7 / −24.4 | 7.1 / 4.7 | 30.3 / 22.0 | 10.4 / 6.8 | 21.8 / 10.2 | 5.2 / −1.1 | 2.4 / 5.1 |
| Shadow residual | −1.6 | 1.3 | −2.1 | 1.0 | 0.6 | −1.7 | −1.3 | 2.3 | 1.5 | −0.6 | 0.9 |

(Year returns are summed daily returns at flat size 1 per open trade, so several open
trades mean more than 1× gross. Compare raw and neutral within a row, not the levels.)

### What it means, read strictly

- **The pre-registered answer: the spread sleeves' edge is not a disguised dollar bet.**
  Removing the two shared currency factors *raised* OOS Sharpe on every book (2Y 1.02 →
  1.33, 10Y 0.58 → 1.01, combined 0.98 → 1.36) and raised IS Sharpe too (2Y 0.26 → 0.46).
  About 55% of the raw book's risk was factor risk. It wasn't paying, so it was noise
  sitting on top of the spread edge.
- **Hedging cuts volatility by about 60–65%** (2Y 14.1% → 5.1%) and softens the bad
  years (2020: 2Y −31.8% → −22.6%; combined −38.7% → −24.4%). It gives up some of the good
  years (2023–24), because part of those gains came from factor moves.
- **The in-sample period is weak for every version.** IS Sharpe is 0.26 raw and 0.46
  neutral for 2Y, and 0.14 neutral for 10Y. 2018 and 2020 are large losses raw *and*
  neutral. The OOS strength sits in 2022–24, the rate-divergence cycle. The hedge improves
  the risk profile; it doesn't remove the period concentration already noted in
  `YIELD_SPREAD_STRATEGY.md` §5.
- **The OOS window is not fresh data.** The 2.0/126 config came from a grid whose OOS
  overlaps this one (§6). This audit answers "dollar bet or relative value?" cleanly. It
  does not re-validate the sleeves.
- **Shadow residual (test #1):** −0.14 IS / 0.31 OOS on this UTC-close, 1 bp-cost version,
  the same pattern as the Python run (nothing IS, something weak OOS). It stays
  information only.

### Consequence (as pre-registered in §2)

**RELATIVE-VALUE → the factor-neutral combined book becomes the candidate system for
forward paper tracking.** Nothing is wired into live trading by this result. The next step is
a frozen forward tracker: the same code, the same config, a daily log of neutral-book
weights, marked-to-market P&L and costs, with the pass bar written down before it starts.
