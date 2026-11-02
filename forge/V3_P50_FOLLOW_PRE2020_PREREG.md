# v3-p50-follow-pre2020: does following the first touch of the v3 p50 line (NQ, hold to 21:55) beat non-forecast lines on years it was not found on?

**Pre-registered 2026-11-02, before any 2016–20 outcome was computed.**

| | |
|---|---|
| ID / ledger id | `v3-p50-follow-pre2020` |
| Branch | `main` (temp worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `v3-p50-follow-pre2020` |
| Data | NQ = OANDA `NAS100_USD` M1. London sessions **2016-09-12 → 2020-08-14**: the first row with the 120-session regime feature, through the last row before the 2020-08-24 fit start minus the 5-session embargo. Lockbox not read. |
| Seed | `20261102` |
| Uncertainty | session moving-block bootstrap, block 21, B = 2000; placebo 1,000 same-quarter shuffles |
| Scripts / outputs | `scripts/v3-p50-follow-pre2020/` → `analysis/output/v3-p50-follow-pre2020/` |
| Harness | own script. Lines come from `scripts/rule-a-pre2020/run.py` `backcast_lines()`, unchanged |

## 1. Claim

On NQ, enter in the direction of the first touch of the v3 chosen (SI: persistence + VXN) O→H p50 or O→L p50 line, filled at the line, with no stop, and exit at the 21:55 London close. This makes more than the same rule on lines of the same size that carry no forecast information.

## 2. Why this is not settled, and the prior exposure

- **Where it came from.** Found today in an exploratory look (`nq-v3-lines-explore`, 8fda7a30) on 2020-08 → 2026-08:
  - follow +0.063% per trade, n 1,304;
  - same-quarter shuffled-line placebo at the 0.3rd percentile of the fade, i.e. follow at about the 99.7th;
  - non-forecast lines of the same size about +0.003 to +0.008%.
  - That look was one of about 30 made that day, which makes it a candidate, not a result.
- **Nearest banked entries:**
  - `rule-a-pre2020`: rule A (break of v3 p50/p75 lines, 00–10 London, stop and target, rich days) was NULL on these same years.
  - day-recon M3/M7: PROD touches equal placebo.
- **What is different here:** no rich-day filter, no stop or target, a hold to 21:55, and NQ only.
- **Prior exposure:**
  - These years have been read for rule A (other rules) and for PROD-line studies.
  - **This rule's outcome on 2016–20 has not been computed.**

## 3. Definitions (frozen)

- **Lines:**
  - `SI_oh_p50` and `SI_ol_p50` from `backcast_lines()`: class betas and per-instrument widths fitted on 2020-08-24 → 2026-08-20 only, then applied to these rows.
  - Fold 0's σ estimator choice used data through 2020-08, which is a mild parameter overlap. It is named and accepted, as in `rule-a-pre2020`.
- **Trade:**
  - Line levels: O × (1 ± d/100).
  - **Entry:** on the first M1 bar (from the open, before 21:55) whose high ≥ the upper line or low ≤ the lower line. The fill is at the line, or at the bar open if the bar opens beyond it.
  - **Side:** long at the upper line, short at the lower.
  - **Exit:** at the close of the last bar before 21:55 London.
  - If both lines are first touched in the same bar, the day is skipped and counted.
  - One trade a day at most.
- **Cost:** 0.0068% round trip (OANDA NAS100 model), with 2× sensitivity.
- **Controls, same sessions:**
  - **TQ:** lines at the trailing 250-session 50th percentile of realised `r_oh` / `r_ol`.
  - **ATR:** k × ATR20 lines, with k the median ratio of the v3 line to ATR20 on these rows (no outcomes used).
  - **Placebo:** the SI p50 distances shuffled within calendar quarter, upper and lower moved together, 1,000 times.

## 4. Gate

Primary is forecast-specificity. The profit claim is reported but is underpowered by design (§5).

1. Real follow mean ≥ the **95th percentile** of the placebo distribution of follow means.
2. Real follow mean − ATR-line follow mean > 0 **and** real − TQ-line follow mean > 0. The difference is bootstrapped jointly by session; the CI lower bound must be > 0 for at least one of the two, and the point estimate must be > 0 for both.
3. The direction split is reported: up-breaks vs down-breaks. If all the gain is in up-breaks and the ATR/TQ controls show the same up-break gain, it is drift.

- **VALIDATED** = conditions 1 and 2 hold. Then the next step is a forward paper record. Nothing goes live.
- **NULL:**
  - the placebo percentile < 80; or
  - the real − ATR CI upper bound < +0.03% (half the discovered gap).
- **UNDERPOWERED:** anything else that fails.

**Mirror.** The fade side is −follow − 2× cost, reported. A move that only shows on the fade side counts as no support.

## 5. Power

- About 1,000 sessions; touches on about 85% of them, so n ≈ 850.
- Per-trade SD is about 1.1%, so the SE of the follow mean is about 0.04% (block). **The profit claim's MDE is about 0.11%**, above the 0.063% discovered, so the profit claim is underpowered by design.
- The placebo SD of the mean in the discovery data was about 0.02%, so the placebo gate can detect a gap of about 0.04–0.05%.

## 6. Multiplicity

- One cell: p50, follow, NQ.
- p75/p90 are not run, and nothing else is scored.
- The discovery's selection (about 30 looks) is why this replication exists. No further correction is applied to this single pre-registered cell.

## 7. Not tested

- Other instruments and other rungs.
- Stops or targets.
- The lockbox and live forward performance.

## Amendments

(none)

## RESULTS

(to follow in its own commit)
