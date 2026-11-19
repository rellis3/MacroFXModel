# exhaustion-v2-gold — after gold touches a ladder line, which forecast of "further travel" is right?

**Pre-registered 2026-11-19, before any gold touch outcome was computed.**

| | |
|---|---|
| ID / ledger id | `exhaustion-v2-gold` (C), `exhaustion-v2-gold-fut` (F) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `exhaustion-v2-gold` |
| Lines | the walk-forward gold ladders from `ladder-v2-gold` (VALIDATED): **C = arm HARCJ**, **F = arm R5** (each track's own winner and widths, because gold's futures ranges differ from the CFD's); `analysis/output/ladder-v2-gold/test_{C,F}.parquet` |
| Prices | the gold M1 files hashed in `analysis/output/ladder-v2-gold/results.json` (GC repaired 2026-11-19) |
| Calendar | USD Major releases, as NQ |
| Window / seed / uncertainty | test years 2019 → 2026-08-21 (2018 train only); `20261119`; 63-session blocks, B = 2000 |
| Scripts / outputs | `scripts/exhaustion-v2/` (unchanged except the line arm, which now comes from each instrument's banked winner) → `analysis/output/exhaustion-v2-gold/` |

Runbook Phase 2, the metal pilot. Everything follows `forge/EXHAUSTION_V2_NQ_PREREG.md` §3–§9 (incl. A1): the line
families and touch definition; targets δ_next and δ_σ; candidates X0–X8 (X8 futures only); the scoring, pass rules,
controls and verdict wording. Only the differences are written here.

## Prior art

- `exhaustion-v2-nq` (VALIDATED both tracks): the plain ladder odds ignore the time of day (next-rung odds 67% before
  07:00 London, 26% after 16:00, against a flat ~45%). The logistic blend X7 was chosen; X4 (vol clock + hot/cold day)
  was tied and better calibrated. Late-day travel was over-called.
- `ladder-v2-gold` (VALIDATED): HAR-CJ (C) and HAR-RV 5-min (F); the gold futures ranges are 2–6% wider than the CFD's.
- `band-reach-from-here`: gold's morning odds of reaching the median band were 50% against 21% for the hour.
- Gold's vol clock differs from NQ's: London open and US data/COMEX open, with no cash-equity open. It is estimated
  per year from gold's own M1, as in the harness; nothing is carried over from NQ.

## Expectation (stated in advance, not a rule)

The clock effect should be at least as strong as NQ's. Whether the same candidate wins is open, since gold's day is
shaped differently.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | As NQ exhaustion, lines from each track's banked gold winner | 2026-11-19 | registered |

## Amendments

### A1 — 2026-11-19, PRE-RESULTS (gold touches extracted; no forecast scored against a real outcome)

The positive control failed on the first run (X2 2.15pp against a floor p90 of 2.01), so nothing was scored. A
diagnostic (600 synthetic sessions, gold's clock and line multipliers) found the control's own paths at fault, not the
scorer. Monitoring the synthetic path 8 times a minute misses some intraminute extremes, so the continuous-time
reflection formula over-predicts: X2 bias +0.9pp (next rung) and +1.5pp (0.25σ) at 8 substeps, +0.3pp / +0.3pp at
60. NQ at 8 substeps showed +1.0 / −0.6pp (mixed sign), which is why its control passed. Change: the synthetic paths
use 60 substeps per minute (`SUBSTEPS` in `scripts/exhaustion-v2/score.py`), for gold and every later instrument. The
pass rule is unchanged. Real gold touches are untouched: their M1 highs and lows are the exchange's.
