# residual-pca-family — results

Prereg: `forge/RESIDUAL_PCA_FAMILY_PREREG.md` (committed in `2f06a5b`, 2026-10-31). Run 2026-10-31, seed 20261031,
B = 2000 (date blocks of 21). Branch `ccr-829ef092-pdoasn`. Ledger ids: `residual-pca-wide10` (scored),
`residual-pca-idx6`, `residual-pca-news`, `residual-pca-monthend`, `residual-pca-cot` (described).
Raw output: `results.json`, `loop_wide10.csv`, `loop_idx6.csv`.

## Verdict: NULL (the one scored cell); the four described tests are UNDERPOWERED by design

**T4, the micro bank q1 model on FX8 + gold + silver (2018-06 → 2026-08), is NULL.** The gate needed IC > 0 in both
halves and a full-sample one-sided p ≤ 0.05. Both halves were positive but tiny (IS +0.006, OOS +0.009), and the
full-sample IC is +0.0075 (NW t 0.85, p 0.20), 95% CI [−0.010, +0.025]. The CI excludes the 0.03 pass bar and the
design could find 0.027, so this is a real null and not a lack of power. Adding the metals did not rescue q1. The
OOS IC fell from q1's +0.027 (FX8, 2021+) to +0.009, because gold and silver residuals trend instead of reverting
(per-instrument corr −0.04 / −0.02 IS).

None of T1, T2, T3 or T5 cleared its candidate gate. Two point the wrong way (T1, and T5's OOS half), and every
contrast sits inside its tag-shift placebo spread.

## Scored cells

| Cell | n (signal days) | Estimate | 95% CI | MDE | Pass bar | p (one-sided) | Cell verdict |
|---|---|---|---|---|---|---|---|
| T4 wide10 daily IC | 2,108 | +0.0075 | [−0.010, +0.025] | 0.027 | 0.03 | 0.20 | **NULL** |

## Described cells (banked `underpowered` whatever they showed, prereg §5)

| Cell | n (days) | Estimate | 95% CI | IS / OOS | MDE | Bar | Candidate? |
|---|---|---|---|---|---|---|---|
| T5 idx6 daily IC, lag 2 | 2,540 | +0.011 | [−0.012, +0.034] | +0.019 / +0.003 | 0.037 | 0.03 | no (p 0.17) |
| T1 news: no-news minus news D | 2,280 | **−0.018** | [−0.069, +0.034] | −0.035 / +0.009 | 0.061 | 0.05 | no (wrong sign) |
| T2 month-end minus other D | 2,636 | +0.031 | [−0.062, +0.124] | +0.077 / −0.014 | 0.129 | 0.05 | no (OOS negative) |
| T3 COT-aligned minus neutral D | 2,496 | +0.003 | [−0.037, +0.042] | −0.003 / +0.012 | 0.089 | 0.05 | no |

Observations: T1 11,786 untagged / 6,454 news-tagged; T2 984 month-end / 20,104 other; T3 2,119 aligned /
15,422 neutral (2,427 counter-crowd). Descriptively, T1's and T3's intervals already exclude the 0.05 bar. The prereg
fixed their verdict as `underpowered` before the run, so that is what is banked. Treat both as "no sign of a filter
worth having".

## Controls

- **Engine:** reproduces the banked q1 run exactly on q1's closes (K 2; IS IC −0.0012; OOS +0.0271, t 2.11; OOS net
  Sharpe 0.468), and on this panel's FX8 (OOS net Sharpe 0.41, IS −0.04).
- **Harness:** OU positive controls recover IC +0.06 (10 instruments, t 8.1), +0.055 (6 instruments, lag 2, t 4.6) and
  +0.047 (8, t 5.4). Synthetic nulls: +0.007, +0.002 and −0.027 (t −2.9) on seed 11. Because the last one was large, 12
  more null seeds were run per width: mean −0.0005, sd 0.009 to 0.011 (the expected SE is 0.0094). So no estimator
  bias; seed 11 was a 3-sd draw.
- **Date-scramble placebo** (200 draws): T4 mean −0.0006, sd 0.0086, and 19% of draws ≥ the real IC. T5 mean −0.001,
  sd 0.010, and 12% ≥ real.
- **Tag-shift placebo** (200 circular shifts ≥ 60 rows): T1 D mean +0.002, sd 0.025; T2 +0.001, sd 0.046; T3 +0.003,
  sd 0.021. All centred near zero, as a sound design should be. Each real D sits within 1 sd of its placebo.
- **Look-ahead:** signal uses rows ≤ t only; idx6 skips a day (outcome t+1 → t+2) so a stale DAX/FTSE close cannot
  fake reversion; COT known from report_date + 3 days with shutdown backlogs excluded; FF calendar used only to
  2025-04-04; nothing after 2026-08-20.

## Decomposition (owner's rule 2026-10-27)

- **Bucket shape (q1 slide 28), T4:** the IS extremes point the reverting way (+0.059 below −1.5, but +0.032 above
  +1.5, the wrong sign). OOS has only the upper extreme right (−0.094, t −1.9) and the lower one wrong (−0.008). There
  is no staircase in either half.
- **Per instrument, T4 (BH q 0.10 on the full sample):** only **EUR** survives (corr IS +0.100, OOS +0.026). EUR was
  also q1's strongest OOS currency on overlapping data, so this is not fresh evidence. It goes on the candidate list
  for a forward record only. XAU and XAG are negative IS.
- **Per instrument, T5:** none survive BH. US2000 IS +0.060 but OOS +0.012.
- **Per currency, T1–T3:** none survive BH (best: CAD news +0.074, p 0.10; CHF month-end +0.22, p 0.02 unadjusted;
  AUD COT +0.094, p 0.07).
- **IC by year, T4:** 2018 −0.027, 2019 +0.020, 2020 −0.023, 2021 +0.021, 2022 +0.020, 2023 +0.013, 2024 −0.024,
  2025 +0.012, 2026 (to Aug) +0.059. T5 alternates sign year to year.
- **Reusable components:** none beat both nulls in both halves after BH, apart from the EUR slice above, which is not
  independent of q1.

## Descriptive: the books (secondary, not part of any verdict)

| Book | IS net Sharpe | OOS net Sharpe | OOS 2× cost | Turnover/day | Max DD |
|---|---|---|---|---|---|
| FX8 base (q1, this panel) | −0.04 | 0.41 | — | — | — |
| T4 wide10 | −0.49 | 0.05 | −0.15 | 0.29 | −6.6% (OOS) |
| T5 idx6 (trades a day late) | −0.32 | 0.08 | −0.05 | 0.29 | −13.5% (IS) |
| T1 FX8, trade only no-news currencies | −0.55 | 0.29 | — | — | — |
| T2 FX8, trade only at month-end closes | 0.02 | −0.36 | — | — | — |
| T3 FX8, trade only crowd-aligned stretches | −0.32 | −0.17 | — | — | — |

Wide10 net % by year: 2018 −1.8, 2019 +0.6, 2020 −2.5, 2021 −0.6, 2022 −0.9, 2023 +2.0, 2024 −2.8, 2025 −2.0,
2026 +3.9. A good few weeks, like the one in Chris's screenshot, fit inside this record easily: 2026 to August is the
book's best year, inside a 2018–2026 run that loses money after costs.

## Deviations from the prereg

One, before banking: the run script first omitted the secondary "book masked to set A" for T2, which the prereg lists.
It was added and the script re-run with the same seed. Every other number is byte-identical to the first run (checked);
T2's masked book is the only new field.

## What this changes

- **`residual-pca-wide10` NULL:** don't say "adding metals fixes q1". The micro bank model still has no basket on this
  history where it works in both halves. The only honest route left for q1 is the one its own RESULTS gives: freeze the
  FX8 model and forward-track it.
- **News / month-end / COT / indices:** none is a filter or universe worth building on. T1's and T3's intervals already
  rule out a 0.05 improvement. T2 can't be judged on 128 month-ends. T5 is weak and unstable by year.
- **For anyone running the model live (e.g. Chris's demo):** treat it as an unproven system. On 2018–2026 the
  FX + metals version ran Sharpe −0.49 in the first half and +0.05 in the second after house costs, and −0.15 at double
  costs.
- **Would reopen:** a forward record of the frozen FX8 (and, as a candidate, EUR-only) model; NOK with a synchronised
  17:00 ET history; a multi-day horizon under its own prereg (q1's t+2 placebo hinted at slow reversion), counted as
  a new trial (this line is now at 6).
