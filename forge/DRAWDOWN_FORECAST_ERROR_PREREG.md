# drawdown-forecast-error — After the S&P 500 has fallen over 20 days, do markets move further than the desk's shipped range forecast says?

**Pre-registered 2026-10-22, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `drawdown-forecast-error-fx`, `drawdown-forecast-error-idx` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `drawdown-forecast-error` |
| Data | `analysis/output/vf3_stage_b/part1_lines.parquet`, out-of-sample rows (34 instruments, London sessions 2020-08-20 → 2026-08-20, before the lockbox); feature store `px_d1_spx500` (OANDA daily close, close+1h). |
| Seed | `20261022` |
| Uncertainty | Block bootstrap over session dates (whole cross-section together), block 21, B = 2000 |
| Scripts / outputs | `scripts/drawdown-forecast-error/` → `analysis/output/drawdown-forecast-error/` |
| Harness | Own script. |

## 1. The claim (required)

`hy-spread-vol` (2026-10-22) met its gate on 2007–2020, then was demoted: its high-yield signal was the stock market's 20-day fall in disguise. The S&P 20-day return alone had r −0.18 (FX) and −0.22 (indices) against volatility beyond HAR persistence. This is the textbook leverage effect: after stocks fall, volatility rises more than recent volatility implies. The desk question: does the **shipped** range forecast (persistence-adjusted S, plus implied vol in SI where IV exists) already capture it, or do markets still move further than forecast after a 20-day drop?

## 2. Why it is not already settled (required)

- `hy-spread-vol` (context) scored realised vol against a simple persistence baseline, not the shipped forecast.
- `funding-forecast-error` (underpowered) used funding signals against the same error table, not equity drawdowns.
- `one-range-forecast` (null) found that market-state flags and gamma sign add nothing on top of SI. A 20-day equity drawdown was not among them.
- `forecast-persistence-fix` (validated) corrected the busy/quiet regime miss, which may already absorb some of this.

## 3. Definitions, fixed in advance (required)

- **Shipped forecast.** `SI_hl_p50` where present, otherwise `S_hl_p50`. The error is `e = ln(r_hl / forecast)`. The date-level error is the mean over the cell's instruments.
- **Cells.** `fx` = fx_majors + fx_crosses; `idx` = indices.
- **Signal.** `D` = −(ln SPX500 close − ln SPX500 close 20 trading days earlier) × 100, using the latest OANDA close with asof ≤ session date 00:00 UTC (i.e. the previous day's close). **+ = the S&P has fallen.**
- **Statistic.** The mean date-level error on top-tercile D days minus bottom-tercile days (terciles over the full sample), as % = 100 × (exp(diff) − 1).
- **Controls.**
  - Shift placebo: at least 63 sessions, every 5th.
  - Halves: split at 2023-08-21.
  - IV-carrying instruments (SI) against S-only instruments, reported separately (does IV absorb it?).
  - The p75 exceedance rate by tercile.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `fx`: after a 20-day S&P fall, does FX move further than the shipped forecast? | **Small positive**, +2% to +5%. Most FX instruments have no IV in the forecast. |
| b | `idx`: the same for indices? | **About zero.** Index forecasts carry implied vol, which prices the leverage effect. |
| — | **THE GATE** (per cell): Holm CI excludes 0 with a positive sign; positive in both halves; above the shift placebo's 95th percentile. | |
| — | **THE MIRROR**: after a 20-day rally, markets move less than forecast. The tercile difference covers it. | |

## 5. Power (required)

From the error table alone (no signal), the monthly mean of the date-level error has SD 0.056 over 73 months, all instruments. The signal is a 20-day change, so the honest unit is about a month, and about 24 months fall in each tercile. SE ≈ 0.056 × √(2/24) ≈ 0.016. MDE at Holm α 0.025: 3.08 × 0.016 ≈ **0.05 log (≈ 5%)**. Indices have fewer instruments and are noisier, so their MDE is wider.

| Cell | Sessions | Units | MDE | Useful bar | Verdict |
|---|---|---|---|---|---|
| fx | ~1,558 | ~73 months | ≈ 5% | 3% | **UNDERPOWERED by design at 3%; powered at ~5%** |
| idx | ~1,558 | ~73 months | ≈ 7% (more noise) | 3% | **UNDERPOWERED by design at 3%** |

Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−3%, +3%); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored: `fx`, `idx` (Holm at α 0.05).
- Descriptive only: gold; the SI against S split; 5-day and 60-day drawdowns; p75 and p90 exceedance by tercile; the continuous correlation.

## 7. What this does NOT test (required)

- Direction.
- Whether a band adjustment would survive live (side-by-side rule; |t| ≥ 3 plus a forward record before anything changes).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). A **shadow** band (forecast × the measured factor after a 20-day S&P drop) is logged beside the shipped forecast and never replaces it, with a forward record. Promotion only at |t| ≥ 3 plus the forward record.
- **NULL** → ledger entry. The shipped forecast already absorbs the leverage effect, so nothing changes.
- **UNDERPOWERED** → ledger entry. The CI says how large a miss is still possible.
