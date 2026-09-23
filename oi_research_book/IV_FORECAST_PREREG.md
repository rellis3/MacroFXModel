# Pre-registration — IV from CME settlements: does it forecast vol better than realized vol?

Written 2026-09-23, **before** the harness exists. Frozen: nothing below changes after
results are seen; anything added later is labelled post-hoc.

## Why this is testable at all

The live `oi_store` carries `ivDynamics` but never archives it, so the live system has no
IV history. The raw CME chains in `OI Data/*.csv` (7 instruments, 2020-09 → 2026-09) do
carry a per-strike `settlement` premium (99.75% populated per RESEARCH_BOOK Part 0).
Black-76 inversion of those premiums gives a real, daily, six-year IV surface. Queued as
item 4 in the research book's roadmap and never done.

## Construction (scripts/14_iv_surface.py)

- Per (date, expiry): settlement > 0 only (zeros are "not settled" quarter strikes).
- Forward F and discount D from put-call parity on the strikes nearest ATM
  (regress C−P on K: slope −D, intercept D·F; D clamped to [0.90, 1.00]).
- Invert OTM options only (calls K ≥ F, puts K < F), Black-76, bisection.
  T measured from 20:00 UTC on the report date to the listed expiry timestamp.
- Per expiry: ATM IV (interpolated at K = F), 25-delta call/put IV → RR25, BF25.
- Per date: 30-day constant-maturity ATM IV (`iv30`) by total-variance interpolation
  between bracketing expiries with DTE ≥ 5; `iv_front` = nearest expiry with DTE ≥ 5.
- CME-inverted pairs (USDJPY/CAD/CHF): ATM IV unchanged; RR sign flipped to OANDA
  orientation.

## Validation gates (must pass before any hypothesis is read)

- **V1** NAS100 `iv30` vs CBOE VXN (independent NDX 30d IV): level correlation ≥ 0.85.
  Fail → the inversion is wrong, stop.
- **V2** Timing: daily Δln(F_front) vs Δln(OANDA D1 close) at label shifts −1/0/+1; the
  shift with the highest correlation fixes which D1 bar an option date belongs to. All
  forward windows start at the bar AFTER that one (no overlap with the settlement day).

## Hypotheses

Baseline "realized-vol forecaster" = log-HAR on Parkinson daily variance (day, 5-day,
22-day means) — the standard strong RV benchmark. Expanding window, refit every 21 bars,
first 500 bars in-sample only. Loss = squared error of log vol. Diebold-Mariano with
Newey-West lag = horizon.

- **H1 (PRIMARY)** 21-bar forward realized vol. Model C (HAR + log iv30) vs Model A (HAR).
  **PASS** = C has lower OOS MSE on ≥ 5 of 7 instruments AND one-sided DM p < 0.05 on
  ≥ 4 of 7.
- **H2** Next-bar log range (high−low)/close — the daily-range-lines use case. HAR +
  log iv_front + log iv30 vs HAR. Same pass rule.
- **H3** Calibration of an "IV expected move" line: share of next-bar |close-to-close|
  inside ±iv30·√(1/252)·close. Reported vs the 68.3% a correct σ gives, raw and after a
  trailing-252-bar realized/implied ratio rescale. Descriptive; no pass rule.
- **H4 (EXPECTED NULL)** Direction: 5-bar change in RR25 → next 5-bar return; and the
  vol risk premium (iv30 − trailing RV22) → next 21-bar return. Pre-registered as null so
  a null is not a surprise and a hit is treated as suspect until replicated.

## Known limits, stated up front

- FX options are monthly-only in this file and NQ quarterly-only, so there is no clean
  1-week IV; `iv_front` DTE wanders 5–35 days (FX) / 5–90 (NQ).
- Settlement is ~19:00–20:00 UTC, before the OANDA daily close — IV is known before the
  bar it is paired with closes, so this is not lookahead, but it is ~1–2h stale at close.
- NQ quarterly options are American-style; OTM-only inversion keeps the early-exercise
  bias small but not zero.
- Rates discount is estimated from parity, not a curve; effect on short-dated IV < 1%.

---

## RESULTS (run 2026-09-23, same day, after the harness was written)

Data: 7 instruments × ~1,510 option dates, 2020-09-04 → 2026-09-04. Raw numbers in
`data/results/iv_forecast_results.json`.

**Gates.** V1 PASS — NAS100 `iv30` vs CBOE VXN: level corr 0.977, daily-change corr
0.851, ours ≈ 0.91× VXN (futures-options vs NDX-spot, and VXN's 30d uses weeklies).
V2 — every instrument aligns to the SAME-date OANDA D1 bar (corr 0.90–0.94 at shift 0,
|corr| < 0.09 at ±1), so forward windows start at the next bar.

| Instrument | H1 21-bar RV: HAR+IV vs HAR | DM p | H2 next-bar range | DM p | H4 ΔRR t | H4 VRP t |
|---|---|---|---|---|---|---|
| EUR_USD | +12.5% | 0.005 | +3.1% | 0.057 | +1.42 | −0.13 |
| GBP_USD | +13.5% | 0.071 | +4.2% | 0.024 | +1.31 | −2.22 |
| AUD_USD | +11.8% | 0.009 | +2.6% | 0.116 | −1.17 | +0.26 |
| USD_CAD | +20.9% | 0.000 | +5.7% | 0.009 | −0.17 | +0.51 |
| USD_CHF | +5.0% | 0.110 | +2.8% | 0.066 | +0.69 | +1.25 |
| USD_JPY | +17.4% | 0.034 | +6.7% | 0.000 | +0.68 | −0.01 |
| NAS100 | +9.7% | 0.051 | +5.9% | 0.000 | −0.22 | −0.26 |

- **H1 PASS** — 7/7 lower OOS error, 4/7 DM p < 0.05.
- **H2 PASS** — 7/7 lower OOS error, 4/7 DM p < 0.05. (Data-hygiene fix after the first
  run: one NAS100 zero-range bar made log(range) = −inf; dropped. Not a spec change.)
- **H3** — ±1σ (iv30/√252) holds 77% of next-bar close moves, not 68%. Realized/implied
  RMS ratio ≈ 1.0 on every instrument, so IV is not overpriced on average — the excess
  coverage is fat tails (many small days, few big ones). Rescaling changed nothing.
- **H4 null, as pre-registered** — 1 of 14 |t| > 2 (GBP VRP, −2.22), what chance gives.

**Post-hoc (not pre-registered, read as description):**
- IV ALONE beat HAR+IV out of sample on 6/7 for the 21-bar horizon — the realized-vol
  terms add fitting noise once IV is in. The 1-month forecast can be IV-only.
- Empirical next-bar |close move| quantiles in units of iv30/√252, remarkably uniform
  across all 7: 50% ≈ 0.46σ, 68% ≈ 0.77σ, 90% ≈ 1.47σ, 95% ≈ 1.85σ. Median high–low
  range ≈ 1.1–1.27σ. These are full-sample (in-sample) calibrations.

**Verdict.** IV from settlements is a genuinely better vol forecaster than realized vol
here, at both horizons, on every instrument. It says nothing about direction.
