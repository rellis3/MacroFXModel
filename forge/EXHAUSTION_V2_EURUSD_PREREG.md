# exhaustion-v2-eurusd — after EURUSD touches a ladder line, which forecast of "further travel" is right?

**Pre-registered 2026-11-19, before any EURUSD touch outcome was computed.**

| | |
|---|---|
| ID / ledger id | `exhaustion-v2-eurusd` (C), `exhaustion-v2-eurusd-fut` (F) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `exhaustion-v2-eurusd` |
| Lines | the walk-forward EURUSD ladders from `ladder-v2-eurusd` (VALIDATED): arm **HARCJ on both tracks**, because H3 found 6E and the CFD have the same range distribution, so 6E reuses the CFD spec. Files: `analysis/output/ladder-v2-eurusd/test_{C,F}.parquet` |
| Prices | the EURUSD M1 files hashed in `analysis/output/ladder-v2-eurusd/results.json` |
| Calendar | Major releases for the **United States and the Euro Area** (both move EURUSD), UTC, from `load_calendar()` |
| Window / seed / uncertainty | test years 2019 → 2026-08-21; `20261119`; 63-session blocks, B = 2000 |
| Scripts / outputs | `scripts/exhaustion-v2/` → `analysis/output/exhaustion-v2-eurusd/` |

Runbook Phase 2, the FX pilot. Everything follows `forge/EXHAUSTION_V2_NQ_PREREG.md` §3–§9 (incl. A1). The control
follows gold exhaustion A1–A2: synthetic paths at 60 substeps per minute, 20 synthetic histories, and a clustered noise
floor. Only the differences are written here.

## Prior art

- `exhaustion-v2-nq` (VALIDATED both tracks): the plain ladder odds ignore the time of day. The logistic blend X7 was
  chosen; X4 (vol clock + hot/cold day) was tied and better calibrated.
- `exhaustion-v2-gold`: registered with the control fixes; its result was not known when this was written.
- `ladder-v2-eurusd` (VALIDATED): HAR-CJ.
- `band-reach-from-here`: EUR/USD's odds of reaching the median band at 10:30 UK were 43% against 18% for the hour.
- FX's intraday clock is shaped by the London open, the overlap with New York and US data, and a quiet Asia session.
  It is estimated per year from EURUSD's own M1.

## Differences from NQ

- Release still to come: US **and** Euro Area Major events (X5, X7).
- X8 (futures VWAP distance and touch volume) uses 6E volume.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | As NQ exhaustion with gold's control fixes; HAR-CJ lines on both tracks; US + EA releases | 2026-11-19 | registered |

## Amendments

(none)
