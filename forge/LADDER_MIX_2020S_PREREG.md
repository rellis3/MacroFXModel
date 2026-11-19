# ladder-mix-2020s — does picking a different σ per percentile or per regime beat one σ, using 2020s data only?

**Pre-registered 2026-11-19, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `ladder-mix-2020s` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-mix-2020s` |
| Instruments / track | NQ, GOLD, EURUSD, OANDA CFD |
| Arms | every arm of each instrument's `ladder-v2-*` race (NQ 12, GOLD 20, EURUSD 17), σ series as built (`rows_C.parquet`) |
| Fitting | **2020s only** (owner, 2026-11-19: earlier years traded differently). Widths and the HAR-RV / SHAR / HAR-CJ / IV regressions are refitted for each test year on sessions from 2020-01-01 up to the year before. Lines exist from 2021. The GARCH parameters keep their long-history fits; their σ is filtered forward as in the race |
| Selection / test | Each strategy picks its arm(s) for test year Y using only the scored (out-of-sample) years 2021 … Y−1. Test years **2022 → 2026-08-21** |
| Seed / uncertainty | `20261119`; session block bootstrap, block 63, B = 2000 |
| Scripts / outputs | `scripts/ladder-mix-2020s/` → `analysis/output/ladder-mix-2020s/` |

## 1. Question

The owner asked whether one σ might be best for the median and another for the 75th, or one best in quiet regimes and
another in loud ones. A hindsight upper bound (choosing per cell using all years) gave scores below the luck floor
(0.34–1.24pp), which is the signature of fitting noise. This study asks the fair version: chosen forward in time,
does mixing beat a single chosen σ on years it has not seen?

## 2. Strategies (all chosen walk-forward from 2021 … Y−1)

| | Strategy |
|---|---|
| S0 | the live σ (yz_10), no choice |
| S1 | one σ: the arm with the lowest 30-cell regime miss on prior years (among GUARD passers, as the race) |
| S2 | per percentile: separate arms for the p75 lines and the p90 lines (p50 follows the p75 choice) |
| S3 | per regime: separate arms for each σ fifth (edges from prior years) |
| S4 | per cell: an arm for each fifth × quantity × percentile |

## 3. Scoring and pass rules

- **PRIMARY:** the 30-cell regime miss on the test years, pooled 2022–2026 (quintile edges from the test pool), as in
  the race.
- **Sharpness:** pinball ratio vs S1, reported.
- **Mixing VALIDATED** (per strategy S2–S4, pooled over the three instruments) if its miss beats S1's with a 90% CI of
  the difference below 0 **and** its pinball is no worse than S1's. Benjamini–Hochberg q = 0.10 over the three.
- **NULL** if the CI excludes any improvement ≥ 0.2pp. **UNDERPOWERED** otherwise.
- **Reported:**
  - S1 vs S0, i.e. does choosing within the 2020s still beat the live σ
  - which arms each strategy picks per year
  - each instrument separately

## 4. Power

Test years 2022–2026.08 give about 1,170 sessions per instrument (about 235 per fifth). The per-instrument floor is
about 1.9pp, and pooling gives about 3,500 sessions. An improvement of 0.2pp is roughly the pooled MDE.

## 5. What each verdict changes

- **VALIDATED:** the shadow export uses the mixed choice for that instrument.
- **NULL:** keep one σ per instrument. Mixing only fitted noise.

## Amendments

(none)
