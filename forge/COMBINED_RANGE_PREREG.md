# COMBINED-RANGE: do the validated range findings improve the forecast when combined?

*Pre-registered 2026-10-05, before any result was computed. Step two of the Forecaster
Portfolio comparison (`analysis/forecaster_lessons/FINDINGS.md` §0): the Evidence Book
holds 21 validated findings, about 15 of them range conditioners, but none feeds the
forecast lines. Research only: no live forecast, export or page changes from this test.*

## The question

The production ladder sizes each day from σ alone (plus the event multiplier). The Evidence
Book has validated, one at a time against matched controls, that several states known
before the open widen or narrow the coming range. Combined into the forecast itself, do
they make it better out of sample than the ladder alone?

Two lessons shape the design:
- **Lesson 01 §05:** overlapping evidence does not stack. VIX inversion, the vol-curve
  front and implied ÷ realised partly measure the same thing, so they are fitted
  **jointly**, never as separate multipliers.
- **Lesson 02 §05:** with 91 tests in the ledger, a few of the 21 passes are expected to be
  luck. A joint, shrunk, out-of-sample fit makes each one re-earn its weight.

## Universe and data (all local; inventory checked before writing this)

| Class | Instruments | Implied vol (IV) | Window |
|---|---|---|---|
| Indices | NQ, SPX, DOW, US2000, DE30, UK100 | VXN for NQ, VIX for the rest (`analysis/surfaces/cboe/`) | 2016-08 → 2026-08 |
| FX + gold | EURUSD, GBPUSD, USDJPY, GOLD (2016-), AUDUSD, USDCAD, USDCHF (2018-10-) | CME CVOL (`data/cvol/cme_cvol_eod.parquet`) | per instrument |

Sessions are `london22` daily bars (`forge/vol.py` `load_daily`). σ_t is each instrument's
frozen production estimator, forecast-ready (`as_of_yesterday`).

**Excluded, and why:**
- **Dispersion (`mv-dispersion-range`, `dispersion-reset`):** no daily DSPX series locally.
- **GEX (`gex-range`):** NQ only, 743 days; a later NQ-only add-on.
- **Release-day effects (`surprise-size`, `event-impact-map`):** they belong to the event
  layer and a surprise is not known before the open. Neither arm uses event multipliers,
  so the comparison is like for like.
- **Intraday findings (first hour, fast start, band reach, tape speed):** these are the
  next step, an intraday update.

## Features: all known before the London session opens

Every input is taken from the latest observation dated strictly before the session date
(CBOE and CVOL closes on D−1; index closes from the D−1 session). Dates are joined on the
**London** session date. Match share is reported per instrument: forge sessions are
stamped 23:00 UTC in summer, a known join trap.

| Feature | Definition | Evidence entry |
|---|---|---|
| `vix_inv` | VIX > VIX3M at the D−1 close (1/0) | `vix-inversion`, `mv-vixterm-range` |
| `front_dear` / `front_calm` | VIX9D ÷ VIX ≥ 0.9669 / < 0.8858 (frozen cut-offs) | `vol-curve-front` |
| `iv_sig` | log(own IV, annualised ÷ own σ_t annualised) | `iv-over-rv-wider`; FX IV÷σ (exhaustion) |
| `all_down` | all six indices closed down on the D−1 session (1/0) | `breadth-all-down` |
| `nq_dw` | NQ 5-session return to D−1 ≤ −1% (1/0) | `nq-down-week` |

All features apply to every instrument in both classes (VIX-curve and breadth are
market-wide states). Only `iv_sig` is instrument-specific.

## Arms

- **A, ladder alone.** Predicted H-L quantile = width_q × σ_t; widths refit on train.
- **B, combined.** σ_adj = σ_t × exp(x·β − mean_train(x·β)).
  - β comes from a ridge regression (λ = 1.0 on standardised features) of log(H-L ÷ σ_t)
    on the features, pooled within the class, train only.
  - Widths are then refit on σ_adj, train only.
  - One fit per class. No per-instrument tuning, no feature selection.

## Split

Per class, by date: **train = the first 60% of dates in the class's window, test = the
last 40%.** β and widths are frozen on train.

## Pass rule (per class; indices and FX+gold get separate verdicts)

**Primary.** Test H-L p50 + p75 pinball loss, B ÷ A per instrument. PASS if **both** hold:
1. the median ratio across the class's instruments is **< 0.98**;
2. B beats A on **≥ 60%** of them.

**Secondary** (reported; must not contradict the primary):
- Test H-L p75 exceedance on the days each flag is on (`vix_inv`, `front_dear`,
  `front_calm`, `all_down`, `nq_dw`, top and bottom `iv_sig` tercile from train edges),
  A vs B. B should sit closer to 25%. If the primary passes but B is further from 25% on
  most flagged states, the verdict is MIXED.
- Each β's sign against its evidence entry. A flip or a shrink to ~0 is flagged as a
  ledger entry that did not re-earn its place jointly. That is reported, not a fail.

**Decision.**
- PASS: propose the combined adjustment as an option on the daily ladder, the same way
  the reverting weekly ladder was added (a separate export first).
- FAIL / MIXED: record the result. The validated findings stay as context chips.

Script: `forge/run_combined_range.py`. Output: `analysis/output/combined_range/RESULTS.md`.

---

## Results (2026-10-05, run after the pre-registration commit dcb88638)

Full tables: `analysis/output/combined_range/RESULTS.md`. Data audit: 99–100% of sessions
usable, except AUDUSD/USDCAD/USDCHF at 79% (CVOL starts 2018-10). Train/test split: indices
2022-08-29, FX + gold 2023-01-09.

| | indices (6) | FX + gold (7) |
|---|---|---|
| test pinball B ÷ A, median | **0.900** | **0.939** |
| B better on | **6/6** | **7/7** |
| flagged states closer to 25% p75 | 7/7 | 5/7 |
| **verdict** | **PASS** | **PASS** |

**Joint coefficients (range multiplier).** Every sign matches its ledger entry except
`nq_dw` on FX (×0.98). That finding was only ever validated on NQ.

| | vix_inv | front_dear | front_calm | iv_sig (per +1 log) | all_down | nq_dw |
|---|---|---|---|---|---|---|
| indices | ×1.11 | ×1.07 | ×0.89 | ×2.01 | ×1.03 | ×1.12 |
| FX + gold | ×1.01 | ×1.02 | ×0.92 | ×2.20 | ×1.03 | ×0.98 |

**p75 exceedance (target 25%), A → B, test:**
- indices: high IV÷σ days 36.4% → 22.2%; low IV÷σ days 13.1% → 25.2%; VIX inverted 37.5% → 21.3%;
- FX + gold: high IV÷σ 35.1% → 25.7%; low 13.7% → 23.1%.

**Post-hoc ablation (not pre-registered, labelled as such).** Same run with `iv_sig` as the
only feature:

| | median B ÷ A |
|---|---|
| indices, IV÷σ only | 0.923 |
| indices, combined | 0.900 |
| FX + gold, IV÷σ only | 0.938 |
| FX + gold, combined | 0.939 |

**Reading.**
- **One finding does most of the work:** own implied vol ÷ own σ. The forecast lines run too
  narrow when options price more vol than σ shows, and too wide when they price less.
- The VIX-curve / breadth / NQ-week findings add about 2.5% more, **for US indices only**
  (SPX 0.916 → 0.862, NQ 0.921 → 0.878). They make DE30/UK100 slightly worse
  (0.93 → 0.95) and add nothing on FX.
- This is Lesson 01 §05 in practice: several separately-validated findings were largely
  the same information.
- The fitted IV elasticity is ~0.70 (indices) and ~0.79 (FX), i.e. σ_adj ≈ σ^0.3 · IV^0.7.
  That is a *blend*, where the existing "Forecast (IV)" export uses pure IV (elasticity 1).
  Blend vs pure IV has **not** been tested head to head.

**Decision per the pre-registration:** propose the adjustment as an option on the daily
ladder, the same way as the reverting weekly ladder. Suggested scope from the ablation:
- IV÷σ for every instrument with an IV source;
- the US vol-curve/breadth terms for US indices only.

The second is post-hoc, so it needs its own confirmation before it ships.
