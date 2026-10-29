# rule-a-pre2020: results

- **Prereg:** `forge/RULE_A_PRE2020_PREREG.md` (commit 52dbde41, pushed before the run).
- **Script:** `scripts/rule-a-pre2020/run.py`, seed 20261028, run once on 2026-10-27.
- **Outputs:** `results.json`, `trades.csv` (every break, rich and non-rich, all four cells).

**Verdict: NULL.** The mean is ≤ 0, and the upper bound (+0.094R) is below the +0.162R the 2020–26 backtest showed.

## Setup as run
- **Lines:** the chosen ladder backcast. Betas and widths were fitted on 2020-08-24 → 2026-08-20 only, then applied to 34,344 instrument-sessions from 2016-09-12 to 2020-08-14.
  - The PIT regime feature needs 120 prior sessions, so the first usable row is 2016-09-12, not 2016-05-23.
  - FX uses the S (persistence) form, since there is no settlement IV before 2020-09. Indices and gold use SI (VIX/VXN/GVZ).
- **Rich thresholds:**
  - FX: each pair's top third of CVOL ÷ RV over 2016–22. EURUSD 1.197, GBPUSD 1.220, AUDUSD 1.212, USDCAD 1.193, USDCHF 1.191, USDJPY 1.359.
  - Gold 1.182; indices 1.53 (as rule A).

## Mechanics check (done before banking)
The backcast lines are calibrated in these years:
- **S form (34,344 rows):** O→H p50 exceeded 50.8%, p75 26.3%; O→L 50.8% / 25.8%. p75 by year: 25.5, 25.5, 26.1, 25.1, 30.2 (2020).
- **SI form (6,887 rows):** 51.9 / 27.2 / 49.8 / 25.8%.

So the null is not a line-construction fault.

## Primary: rich days, 0.2σ / 5R, 2× spread
| | n | net R per trade |
|---|---|---|
| **All** | 1,386 | **−0.040 [−0.161, +0.094]** |
| FX + gold | | −0.022 |
| Indices | | −0.121 |
| Mirror: non-rich days | 2,356 | −0.147 [−0.258, −0.029] |

- **By year:**
  - 2016 −0.01 (96 trades)
  - 2017 −0.30 (227)
  - 2018 +0.03 (355)
  - 2019 −0.05 (376)
  - 2020 +0.06 (332)
- **By instrument:**
  - Positive: AUDUSD +0.32, US2000 +0.17, GBPUSD +0.15, USDCHF +0.13, NQ +0.11, USDJPY +0.03, EURUSD +0.02.
  - Negative: GOLD −0.34, SPX500 −0.31, USDCAD −0.16, US30 −0.11.
  - 7 of 11 are positive. The gate needed all three conditions, and two fail.
- **By line form (descriptive):** S (FX) +0.085 on 847 trades; SI (indices + gold) −0.235 on 539.
- **Other registered cells (rich):**
  - 0.1σ/5R −0.249 [−0.396, −0.102]
  - 0.1σ/10R −0.190 [−0.355, −0.018]
  - 0.2σ/10R −0.070 [−0.198, +0.084]

## Reading
- **Rule A did not pay in the 4 years before its own period.** This matches what the family showed on the v4 lines (2016–19 negative).
- **The rich condition still separates.** Rich days ran about 0.11R better than non-rich days. But both are below zero here, so the condition describes a relative effect, not a profitable trade, in these years.
- **The FX persistence-form trades were mildly positive (+0.085), and gold and the US large-cap indices lost.** This is post-hoc and is not a result. A pre-registered FX-only test would need fresh data, which means the forward record.
- **What changes:** rule A's 2020–26 result is treated as possibly specific to that period. The forward record (`forge/RULE_A_BOOK_FORWARD_PREREG.md`) is the deciding test, and the Decision Lab's "Today's decision" panel now says so. Lesson 04's arithmetic: one pass (2020–26, chosen on that data) and one fail (2016–20). That is no net evidence for the rule yet.
