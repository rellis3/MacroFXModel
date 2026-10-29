# rule-a-portfolio: Lesson 06 on rule A. Does risk budgeting by correlation cluster improve it, and is it a separate source of return from the portfolio book?

**Pre-registered 2026-10-27, before any outcome of the two scored questions was computed.**

| | |
|---|---|
| ID / ledger id | `rule-a-portfolio-budget` (Q3), `rule-a-portfolio-second-book` (Q4) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `rule-a-portfolio` |
| Data | Rule A trades at the registered setting (stop 0.2σ, target 5R, out by 22:00, 2× spread table), 11 instruments, from `backtest-data/decision-lab/rule_a.json.gz` (tag `lesson-track-L05` build), 2020-08-24 → 2026-08-20. Portfolio book sleeves from `analysis/output/portfolio-book/book.json` (built 2026-10-24, registered costs), to 2026-08-21. The lockbox is not read. |
| Seed | `20261027` |
| Uncertainty | Paired moving-block bootstrap on weekdays, block = 20 weekdays (4 weeks), B = 2000 |
| Scripts / outputs | `scripts/rule-a-portfolio/` → `analysis/output/rule-a-portfolio/` |
| Harness | Own script (Python). The streams are already built; the harness would rebuild neither. |

## 1. The claim
Case study Lesson 06 ("From One Idea to a Portfolio",
`education/forecaster-portfolio-case-study/LESSON_06_from-one-idea-to-a-portfolio.md`):
- A portfolio's gain is set by how different its legs are, not by how many there are. Effective bets are measured by the eigenvalues of the correlation matrix against the Marchenko–Pastur noise band.
- Each leg's risk budget should be equalised, so that "a portfolio of ten legs in which one carries half the risk is a portfolio of far fewer than ten" (§01, equal risk contribution).
- Diversification must survive the worst days: the joint worst-5% count is checked against the hypergeometric distribution (§04).

Applied to us:
- **Q3:** rule A's 11 instruments behave as fewer bets. Giving each correlated cluster one shared budget, and each leg an equal risk share inside it, should raise rule A's risk-adjusted return out of sample.
- **Q4:** rule A should be a separate source of return from the portfolio book (core beta, trend, carry, FOMC drift), so that adding it is close to a full extra bet.

## 2. Why it is not already settled
- **Prior art:**
  - `rule-a-late-entry` (NULL) and the Decision Lab filters (draft) change which trades are taken, not how they are sized against each other.
  - `portfolio-book` / `portfolio-book-validate` (CONTEXT) built the sleeves but never included an intraday rule.
  - The factor blend (trend + yield spread, corr 0.06, `/api/factor-blend`) is another pair of sleeves, not rule A.
  - `rules-book-backtest` (exploratory, branch `ccr-42a42ec1-xka4ex`) combines three daily direction rules, not rule A.
- **No Evidence Book entry** sizes rule A's legs or measures its correlation with another book.
- **Disclosure of what has been seen (2026-10-27, before this prereg).** A descriptive pass over the full 2020-26 sample, scratchpad script `l06_struct.py`, gave:
  - average pair correlation 0.10; two eigenvalues above the MP ceiling (2.27, the index block; 1.49, the USD block);
  - N_PR 8.8, N_var 5.5;
  - SPX500–US30 0.57, NQ–SPX500 0.56, EURUSD–USDCHF 0.36;
  - FX+gold vs indices: corr 0.22, joint worst-5% days 10 vs 3.9 expected (p 0.004);
  - per-leg Sharpe (SPX500 and US30 negative); portfolio Sharpe 0.86.

  These full-sample numbers informed the choice of a 0.30 clustering threshold, which is why Q3 is scored only walk-forward, with clusters and weights fitted on earlier years. Nothing about rule A versus the portfolio book (Q4) has been computed.

## 3. Definitions, fixed in advance
- **Leg stream:** for instrument i and weekday t, r_it is the sum of net R of rule A trades entered on London day t (0 if none). The calendar is every weekday from 2020-08-24 to 2026-08-20.
- **EW (control):** P_t = Σ_i r_it, so every trade is 1R. This is how rule A is backtested today.
- **CR (cluster risk budget, Q3):** at each 1 January, Y = 2022 … 2026, using only days before Y:
  1. C is the correlation matrix of the leg streams; σ_i is each leg's daily SD.
  2. Clusters are the connected components of the graph with an edge where C_ij ≥ 0.30.
  3. Each of the K clusters gets budget 1/K, split equally inside the cluster.
  4. w_i = (1/K)(1/|cluster_i|)/σ_i, rescaled so the weights average 1 (units stay "R at average size").
  5. The weights are held for year Y.
- **Test window (Q3):** 2022-01-03 → 2026-08-20. 2020-08-24 → 2021-12-31 is warm-up only.
- **Primary metric (Q3):** annualised Sharpe (mean/SD × √252 of the daily stream) of CR minus EW over the test window.
- **Book stream (Q4):**
  - Each sleeve's daily return is Σ legs c/1e8 (`js/portfolioBook.js` UNIT) for S1g (core beta, VIX-gated), S2 (trend), S3g (carry, VIX-gated) and S4 (FOMC USD drift). These are the CFD-tradeable sleeves.
  - B_t is their equal-weight mean.
  - S5g (variance proxy, not tradeable on MT5) is reported separately and is not in B.
  - The join is on the date string: rule A's London day t against the book day t, which closes at 22:00 UTC. Only common weekdays are used.
- **Primary metric (Q4):** Pearson correlation of P_t (EW) with B_t over the common window 2020-08-24 → 2026-08-20, plus the joint worst-5% count.
  - k = round(0.05 T); ties are broken by date order.
  - p = Pr(X ≥ observed) under the hypergeometric (T, k, k).

## 4. Hypotheses, expectation first
| # | Question | Expectation |
|---|---|---|
| Q3 | Does CR beat EW on Sharpe, out of sample? | Small gain, +0.1 to +0.2 Sharpe; likely UNDERPOWERED (see §5) |
| Q3 GATE | Paired-bootstrap 95% lower bound of (Sharpe CR − Sharpe EW) > 0 **and** CR ≥ EW in at least 3 of the 5 test years (2026 partial) | |
| Q3 MIRROR | Placebo: the same cluster sizes assigned to legs at random (200 draws, seed above), same budget rule. CR must beat the placebo median; if the placebo matches CR, any gain is from inverse-vol sizing, not the correlation structure | |
| Q4 | Is rule A a separate source from the CFD book? | Yes: corr near 0 (rule A trades intraday on rich-IV days, the book holds for days to months) |
| Q4 GATE | Bootstrap 95% upper bound of corr(P, B) < 0.20 **and** joint worst-5% p > 0.05 | |
| Q4 MIRROR | Rule A vs S1g (index/gold core beta) alone, where shared exposure is most likely. Reported; a pass on B with a fail on S1g means the overlap is the beta sleeve | |

**Reported, not scored:**
- N_PR, N_ent and N_var of {rule A's 11 legs + the 4 sleeves}.
- Equal-risk combined Sharpe of P and B against each alone.
- Each book's total on the other's k worst days.
- CR's max drawdown and N_var.
- The variants inverse-vol only (no clusters) and clusters only (no 1/σ).
- Per-year Sharpe.

## 5. Power
- **Q3:**
  - With 4.6 test years, the SE of an annualised Sharpe is about √(1/4.6) ≈ 0.47.
  - CR and EW share the same trades, so their correlation will be high (assume about 0.9). The SE of the paired difference is then about 0.47 × √(2 × 0.1) ≈ 0.21.
  - MDE at 80% power ≈ 2.8 × 0.21 ≈ 0.6 Sharpe.
  - The expected gain (+0.1 to +0.2) is far below that, so **Q3 is UNDERPOWERED by design**. It is run because the sizing rule is free to adopt if it does no harm. An empty result is recorded as UNDERPOWERED, never NULL.
- **Q4:**
  - Over about 1,560 common weekdays, the SE of a correlation near 0 is about 1/√T ≈ 0.025, or about 0.035 with the block design effect.
  - The upper bound clears 0.20 for any true correlation below about 0.13, so **Q4 is POWERED**.
  - Joint worst-5%: k ≈ 78, expected ≈ 3.9. A true tail correlation of about 0.2 roughly doubles the count, which the p > 0.05 rule would catch.

## 6. Multiplicity
- **Scored cells:** Q3 and Q4, with Holm at α = 0.05 over the two. p-values come from the bootstrap intervals via `pFromCI` (normal approximation).
- **Q4's two-part gate** is conjunctive, with no further correction.
- **Everything in "reported, not scored"** is descriptive.

## 7. What this does NOT test
- Dropping legs (for example SPX500 or US30). That is selection on seen data and needs its own prereg on fresh data.
- Any change to rule A's entries, stops or targets.
- Live costs or financing on the book (portfolio-book-validate's haircuts apply to B as read here).
- Forward performance.

## 8. What each verdict changes
- **Q3 VALIDATED:** cluster risk budgeting becomes the sizing for rule A on the Decision Lab and the forward record, labelled as such.
- **Q3 NULL or UNDERPOWERED:** EW stays. The cluster structure is shown as context, and the three index legs are flagged as about one bet.
- **Q4 VALIDATED:** rule A is recorded as a separate leg candidate for the portfolio book (a second book in Lesson 06's sense). A combined-book prereg on the forward record is the next step.
- **Q4 fails:** the overlap is named (via the S1g mirror), and rule A is not counted as an extra bet.

## Amendments
