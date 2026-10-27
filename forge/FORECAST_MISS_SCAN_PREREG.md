# forecast-miss-scan — Which conditions known before the London open explain the days the shipped range forecast misses? (wide scan, discover then confirm)

**Pre-registered 2026-10-27, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `forecast-miss-scan` (one family entry). Each survivor that confirms gets its own follow-up id. |
| Branch | `claude/forecast-miss-scan` → main |
| Register row | `plans/RESEARCH_REGISTER.md` → `forecast-miss-scan` |
| Data | `analysis/output/vf3_stage_b/part1_lines.parquet` out-of-sample rows (34 instruments, London sessions 2020-08-20 → 2026-08-20, before the lockbox). Signals from the feature store, point-in-time (asof ≤ session date 00:00 UTC): `px_d1_*`, `vix`, `vix3m`, `move_index`, `y2_usd`, `y10_usd`, `credit_baa10y`, `credit_aaa10y`, `xccy_basis_{eur,jpy}_live`, `rrp_on`, `fed_reserves`, `sofr_volume`, plus the error table itself (lagged). |
| Seed | `20261027` |
| Uncertainty | Date-block bootstrap (block 21 sessions), B = 1000 in discovery, B = 2000 in confirmation |
| Scripts / outputs | `scripts/forecast-miss-scan/` → `analysis/output/forecast-miss-scan/` |
| Harness | Own script; it reuses the error construction of `scripts/drawdown-forecast-error/run.py`. |

## 1. The claim (required)

The one thread result that improves trading (`drawdown-forecast-error`, validated) came from asking what explains the shipped forecast's **errors**, not what predicts direction. This is the owner's "go wide, then narrow": scan every condition the desk can see before the London open, keep those that survive a false-discovery correction on the first half, and confirm them on the untouched second half. The aim is a short list of conditions where the range lines are reliably too narrow or too wide, each a candidate for its own shadow band.

## 2. Why it is not already settled (required)

Already scored against the same error table, and **excluded** here (so they are not re-run):
- `funding-forecast-error-squeeze`, `-cpstress`, `-levbuild`: SOFR over the floor, CP over SOFR, TFF leverage build.
- `drawdown-forecast-error-fx/-idx`: the S&P 20-day fall. It is carried along as a **reference cell**: reported, not counted in the family.
- `one-range-forecast` (null) tested market-state flags and gamma sign on top of SI. The candidates below are different variables.

## 3. Definitions, fixed in advance (required)

- **Error.** e = ln(r_hl / shipped p50), where shipped = SI where present, else S. The date-level mean is taken per class: `fx` (fx_majors + fx_crosses) and `idx` (indices).
- **Statistic.** For a continuous signal: the mean date-level e on top-tercile signal days minus bottom-tercile days (terciles cut within the discovery window, and cut again within the confirmation window). For a binary flag: mean e on flagged days minus other days. Reported as % = 100 × (exp(diff) − 1). **Two-sided.**
- **Candidates (17).** Each is known before session date 00:00 UTC.

| # | id | Definition |
|---|---|---|
| 1 | spx5 | S&P 500 5-day log return, sign-flipped (+ = fell) |
| 2 | spx60 | S&P 500 60-day log return, sign-flipped |
| 3 | nq20 | NAS100 20-day log return, sign-flipped |
| 4 | vix_level | VIX close |
| 5 | vix_chg5 | VIX 5-day change |
| 6 | vix_term | VIX / VIX3M |
| 7 | move_level | MOVE close (data ends 2026-09-21; inside the sample) |
| 8 | usd20 | 7-pair USD basket 20-day return (+ = USD stronger) |
| 9 | usdjpy20 | USDJPY 20-day log return, absolute value |
| 10 | us2y_chg20 | US 2-year yield 20-day change (bp), absolute value |
| 11 | us10y_chg20 | US 10-year yield 20-day change (bp), absolute value |
| 12 | credit_chg20 | (Baa−Treasury) − (Aaa−Treasury) 20-day change |
| 13 | basis_eur_chg20 | EUR cross-currency basis 20-day change, sign-flipped (+ = widened) |
| 14 | basis_jpy_chg20 | JPY basis 20-day change, sign-flipped |
| 15 | rrp_level | ln(1 + RRP $bn) |
| 16 | recent_miss | mean date-level e over the previous 5 sessions, same class (does the forecaster miss in streaks?) |
| 17 | month_end | binary: the last 2 or first 2 London sessions of a month |

  Reference (not counted): `spx20` (validated).
- **Family.** 17 candidates × 2 classes = **34 cells**.
- **Discovery** (2020-08-20 → 2023-08-20). Benjamini–Hochberg at **q = 0.10** over the 34 cells, p from the bootstrap via `pFromCI`.
- **Confirmation** (2023-08-21 → 2026-08-20), discovery survivors only. A cell **confirms** if its confirmation-half difference has the **same sign** as in discovery and its 95% CI excludes 0. No correction across survivors is needed, because confirmation is conjunctive with discovery.
- **Controls.** For each surviving cell: a circular-shift placebo (≥ 63 sessions) in both halves, and a check that the cell is not just the reference (its correlation with spx20 is reported, and the confirmation is repeated within spx20's middle tercile).

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Do any of the 34 cells survive discovery and confirm? | **2–4 confirm.** The most likely are recent_miss (misses cluster), vix_chg5 / spx5 (short-memory shocks) and possibly abs rate moves. Several of these will overlap with the validated S&P drawdown. |
| b | Calendar (month_end) | **Null.** The forecaster already carries event multipliers, and month-end range effects were null before. |
| — | **THE GATE** (per cell): BH survivor in discovery, AND same sign with 95% CI excluding 0 in confirmation, AND outside the placebo in confirmation. | |

## 5. Power (required)

Per half: about 780 sessions, about 36 monthly units. The monthly-mean SD of the date-level error is about 0.056 (all instruments; from `drawdown-forecast-error` §5). With about 12 months per tercile, SE ≈ 0.056 × √(2/12) ≈ 0.023. Discovery at a BH-adjusted α of about 0.01 has an MDE of about 0.023 × (2.58 + 0.84) ≈ **0.08 log (≈ 8%)**. The confirmation half's MDE at α 0.05 is about **6.5%**. So this scan finds **large** miss conditions only. The validated S&P 20-day effect (about +6% over the full sample) would sit near the edge of detectability in one half. Cells that fail are UNDERPOWERED, not NULL, unless their full-sample CI lies inside ±3%.

## 6. Multiplicity (required)

- The family is 34 cells, BH q 0.10 in discovery. The confirmation half is the protection: nothing confirmed was chosen with its data.
- The family is entered in the trial ledger as **one** scan with its survivor count. Promotion of any survivor needs its own shadow and forward record (as for the drawdown band).

## 7. What this does NOT test (required)

- Instrument-specific signals (own COT, own IV, own gamma); a separate scan.
- Direction.
- Any change to the shipped lines (the side-by-side rule).

## 8. What each verdict changes (required)

- **Confirmed cells** → each gets a ledger entry (validated, research-only) and a proposed shadow rule, fixed in its own prereg amendment, run beside the drawdown shadow.
- **No confirmations** → one ledger entry for the family (context). The drawdown band stays the only known systematic miss.

## Amendments

### A1 — 2026-10-27 — PRE-FORWARD: the stress-count shadow rule, fixed before any forward session is scored
This is the §8 shadow for the 8 confirmed cells (results seen, forward data not). It runs beside the drawdown shadow (`forge/DRAWDOWN_FORECAST_ERROR_PREREG.md` A1), which is unchanged.
- **Conditions** (each known before London 00:00; full-sample top-tercile edges):
  - S&P 5-day log return ≤ −0.34% (a 5-day fall);
  - VIX 5-day change ≥ +0.67;
  - VIX ≥ 20.95;
  - VIX/VIX3M ≥ 0.910;
  - S&P 60-day log return ≤ +2.26% (the top tercile of the sign-flipped fall measure).
- **FX shadow:** the number of those 5 conditions active sets a multiplier on the live ladder: **0 → ×0.95; 1–3 → ×1.00; 4 → ×1.06; 5 → ×1.15**. Then, multiplicatively, **×1.067 on month-end sessions** (the last 2 or first 2 London sessions of a month).
- **Index shadow:** the number active of (5-day fall, 5-day VIX rise) sets **0 → ×0.96; 1 → ×1.02; 2 → ×1.06**.
- **Gold, commodities, BTC:** not covered.
- **Forward record from 2026-10-28; judged at 120 sessions** (every session counts, not only triggers). It passes if, pooled over its scored rows, the shadow's HL p75 exceedance is closer to 25% than live's, its p50 exceedance is closer to 50%, and the date-clustered CI of the improvement in |p75 exceedance − 25%| excludes 0. Promotion only on the owner's decision.
