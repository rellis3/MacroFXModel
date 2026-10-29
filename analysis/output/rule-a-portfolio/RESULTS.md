# rule-a-portfolio: results

Prereg: `forge/RULE_A_PORTFOLIO_PREREG.md` (commit 77bd3258, pushed before the run).
Script: `scripts/rule-a-portfolio/run.py`, seed 20261027, run once on 2026-10-27.
Data: rule A at 0.2σ / 5R / 2× spread, 2,057 trades, 11 instruments, 1,564 weekdays from 2020-08-24 to 2026-08-20. Portfolio book sleeves from `analysis/output/portfolio-book/book.json`.

| ID | Verdict |
|---|---|
| `rule-a-portfolio-budget` (Q3) | **UNDERPOWERED** |
| `rule-a-portfolio-second-book` (Q4) | **VALIDATED** |

## Structure (descriptive; this full sample was seen before the prereg)
- **Pair correlations:** average 0.100, against a noise level of about 0.025.
  - SPX500–US30 0.57, NQ–SPX500 0.56, EURUSD–USDCHF 0.36.
- **Eigenvalues:** 2.27 and 1.49 lie above the Marchenko–Pastur ceiling of 1.17. These are the index block and the USD block; the other nine are inside the noise band or below it.
- **Effective bets out of 11:** N_PR 8.8, N_ent 9.8, N_var 5.5.
- **Books (FX+gold vs indices):**
  - correlation 0.22;
  - joint worst-5% days: 10 against 3.9 expected (p 0.004);
  - the index book lost −23R on the FX book's 78 worst days, and the FX book made +59R on the index book's worst days.
  - Rule A fails Lesson 06's tail check between its own two halves.
  - All 10 shared days are real losses in both halves.
  - **The mechanism** is that the halves trade on the same days. The index half trades on few days (it loses on only 136), and on the 125 days both halves trade, their correlation is 0.38. Rich-vol mornings hit both at once, which is Lesson 06's §05 common factor.
- **Sharpe:** the equal-weight portfolio is 0.86 against an average single leg of 0.35, roughly √N_var times larger.
- **Lower-tail curve (2% to 25% of days, descriptive):** flat days are exact zeros in both halves. Ranking ties by date lined those zeros up and faked shared "worst" days beyond the 9% of days the index half loses on. The first run did this; the curve now breaks ties at random. On the second run, Q3, Q4 and the verdicts were byte-identical. The curve sits above the chance band from 5% to about 20% of days.

## Q3: cluster risk budget, walk-forward 2022-01 → 2026-08
| | Sharpe |
|---|---|
| 1R per trade (EW, control) | 0.71 |
| Cluster budget + 1/σ (CR, registered) | **0.99** |
| Difference | **+0.28 [−0.05, +0.68]** |
| Clusters only, no 1/σ (variant) | 0.92 |
| 1/σ only, no clusters (variant) | 0.73 |
| Placebo: same cluster sizes, random legs (200 draws) | median 0.67, 90th percentile 0.84; CR beats 99.5% |

- **By year (EW → CR):**
  - 2022: 1.60 → 1.92
  - 2023: −0.56 → −0.32
  - 2024: 0.43 → 0.36
  - 2025: 0.79 → 0.70
  - 2026: 1.49 → 1.87

  CR is ahead in 3 of 5 years.
- **Max drawdown, in units of the stream's own daily SD:** EW 27.0, CR 22.5.
- **Gate:**
  - lower bound > 0: no;
  - 3 of 5 years: yes;
  - Holm p 0.13.
- **Verdict UNDERPOWERED:** the difference is positive and the interval crosses 0. The design MDE was about 0.6 Sharpe (prereg §5).
- **What the variants and the placebo say:** the gain comes from giving correlated clusters a shared budget, not from 1/σ sizing.
  - 1/σ alone adds nothing (0.73).
  - Clusters alone reach 0.92.
  - The random-cluster placebo does not reproduce the gain.
- **A flaw in the registered rule:** 1/σ gives sparse legs large weights. US2000 trades rarely, so its 2026 weight is 6.1 against an average of 1. The clusters-only variant avoids this.
- **The 2022 clusters were fitted on only 16 months**, and they grouped AUDUSD and USDCAD with the indices. From 2023 on, the clusters settle to {NQ, SPX500, US30} and {EURUSD, USDCHF}.

## Q4: rule A vs the CFD portfolio book (S1g, S2, S3g, S4), 1,559 common weekdays
- **Correlation:** −0.013 [−0.075, +0.053]. The upper bound is below 0.20.
- **Joint worst-5% days:** 6 against 3.9 expected, p 0.19.
- **Each on the other's worst days:**
  - on rule A's 78 worst days (−388R in total), the book made −1.1% of its capital;
  - on the book's worst days, rule A made +115R.
- **Mirror (rule A vs the core-beta sleeve S1g):** corr −0.003 [−0.061, +0.050]; joint worst days 4 against 3.9 (p 0.56). There is no hidden index-beta overlap.
- **Correlation with each sleeve:** S1g −0.003, S2 −0.003, S3g −0.018, S4 +0.002, S5g −0.071.
- **Gate:** both parts hold. Holm p < 0.001.
- **Verdict VALIDATED:** rule A is a separate source of return from the book.
- **Reported, not scored:**
  - Equal-risk Sharpe: rule A 0.86, book 1.41, combined **1.61**.
  - Effective bets of the 15 streams (11 rule A legs + 4 sleeves): N_PR 12.2, N_var 8.8.
  - Caveat: the book here is at its registered costs. portfolio-book-validate's financing and realism haircuts take the CFD-only book far lower (0.21 over its full 2008–26 history), so the combined Sharpe is an upper figure. The correlation result does not depend on costs.

## What changes
- **Q4:**
  - Rule A is recorded as a second-book candidate for the portfolio book: a near-full extra bet, the shape Lesson 06 asks for.
  - Next is a combined-book forward record. The rule A paper record and the book's forward record are scored together, with no new fitting.
- **Q3:**
  - Sizing stays at 1R per trade (EW) for the record.
  - The Decision Lab shows the cluster view as context. The three index legs count as about one bet, and EURUSD/USDCHF as about one.
  - A clusters-only budget, which has no 1/σ, is the variant worth a forward test.
