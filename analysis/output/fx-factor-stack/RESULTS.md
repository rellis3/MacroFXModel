# fx-factor-stack — results

Prereg: `forge/FX_FACTOR_STACK_PREREG.md` (registered 2026-10-17 in `48bf7b4b`; Amendment A1 PRE-RESULTS committed in `889cb395`, 2026-11-01, before any score was computed). Run 2026-11-01, seed 20261017, B = 2,000 (moving block, 3 months), placebo 1,000 draws.
Branch `rich-fx`. Ledger ids: `fx-factor-stack`, `fx-factor-carry`, `fx-factor-momentum`, `fx-factor-value`, `fx-factor-surprise`.
Reproduce: `MFX_DATA_ROOT=<checkout holding features/> python -I scripts/fx-factor-stack/run.py`, then `verify.py`. The keys `id`, `verdict`, `ranAt` and `prereg` in `results.json` were added by hand after the run.

## Verdict: UNDERPOWERED

The equal-risk book of the four factors earned a net Sharpe of **+0.05** over the 103 out-of-sample months (2018-01 → 2026-07), 95% interval after the effective-N haircut **[−1.01, +1.21]**, DSR (N = 5) **0.17**. It did not reach the registered bars (Sharpe > 0.5, DSR ≥ 0.95, beat the placebo). The interval contains both zero and the 0.5 bar, so by the verdict words set in A1.5 this is **UNDERPOWERED**, not NULL. Every one of the four factors is also UNDERPOWERED. No factor's rank-IC interval excludes zero. The stopping rule (A1.9) does not fire: it needs the combined book to be NULL.

What the numbers do say: carry and surprise momentum have positive point estimates in both OOS halves and in the range of the published premia (net Sharpe 0.36 and 0.34, rank-IC +0.08 and +0.07). Momentum and the value proxy do not (−0.39 and −0.12). Blended in equal risk, the two that work and the two that do not cancel to about zero.

## Scored cells (OOS 2018-01 → 2026-07, n = 103 months; haircut factor 1.74, m_eff 2.31)

| Cell | Rank-IC | IC 95% CI (haircut) | Net Sharpe | Sharpe 95% CI (haircut) | Max DD | Placebo p95 | Mirror | Verdict |
|---|---|---|---|---|---|---|---|---|
| carry | +0.079 | [−0.030, +0.192] | +0.36 | [−0.66, +1.54] | 18% | 0.54, not beaten | fails | UNDERPOWERED |
| momentum | −0.045 | [−0.190, +0.104] | −0.39 | [−1.60, +0.87] | 46% | 0.52, not beaten | fails | UNDERPOWERED |
| value (5y reversal proxy) | −0.018 | [−0.177, +0.134] | −0.12 | [−1.38, +0.92] | 35% | 0.53, not beaten | fails | UNDERPOWERED |
| surprise momentum | +0.075 (90 months) | [−0.042, +0.190] | +0.34 | [−0.68, +1.63] | 15% | 0.50, not beaten | fails | UNDERPOWERED |
| **equal-risk book** | n/a | n/a | **+0.05** | **[−1.01, +1.21]** | 23% | 0.54, not beaten | n/a | **UNDERPOWERED** |

Halves (2018–2021 / 2022–2026): carry IC +0.067 / +0.089 and Sharpe +0.09 / +0.58; momentum IC −0.119 / +0.019; value IC +0.038 / −0.067; surprise IC +0.066 / +0.085; the book's mean monthly net return was −0.2% / +0.2%.
In-sample (2005–2017), reported only: carry IC +0.064 (Sharpe +0.06), momentum +0.051 (+0.22), value 0.000 (+0.43), surprise −0.028 on about two years (+0.14), book Sharpe +0.35.
3-month rank-IC (report only, overlapping): carry +0.119, surprise +0.075, momentum −0.069, value −0.066.

Why this is UNDERPOWERED and not NULL: 103 months across eight currencies carry an effective cross-section of about 2.3 (A1.6 assumed about 3, so the haircut came out at 1.74, not 1.5). The Sharpe interval is about ±1.1 wide and the IC interval about ±0.11. With that interval a true net Sharpe of 0.5 would have been detected about one time in seven. The upper bounds (+1.2 to +1.6 Sharpe, +0.10 to +0.19 IC) sit well above the bars, so the data cannot rule out the published premia, and it cannot confirm them.

## Controls

- **Placebo** (scores permuted across the eight each month, same construction and costs, 1,000 draws): means −0.04 to −0.06 (the cost drag), 95th percentiles 0.50–0.54. No arm beats its own p95, so even carry's +0.36 is within what random rankings produce roughly one time in eight.
- **Mirror** (sign-reversed): no factor's reversal passes its bars. Momentum reversed has a Sharpe of +0.34 and an IC of +0.045 with an interval that includes zero.
- **Mechanics check** (`scripts/fx-factor-stack/verify.py`, `verify.json`): month returns equal the raw pair-price change plus that month's carry accrual (largest gap 0.52%, 1,799 currency-months); carry IC recomputed with `scipy.spearmanr` matches to the last digit (0.0787); placebo means are centred on the cost drag. A synthetic world with a planted carry effect returns VALIDATED, and 300 random worlds returned IC −0.0002 ± 0.0015 and Sharpe −0.004 ± 0.013.
- **Baselines (reported, not gates):** the dollar basket (equal-weight long the seven currencies vs USD) earned a Sharpe of −0.32 over the OOS window (−2.2% a year). The book's correlation with it is +0.08 and its beta +0.13, so the book is dollar-neutral as built. **Carry alone beat the book:** book minus carry Sharpe −0.32, interval [−1.11, +0.38]. No factor-book panel would ship on this.
- **Sensitivities (A1.10):** EUR carry neutral after 2026-02-16 instead of the DE call-money splice: carry IC +0.077, Sharpe +0.36, book Sharpe +0.04. Gross of cost: book +0.06, carry +0.37. Costs cost very little in a monthly book. DSR at N = 6 was not computed (see below).

## Deviations from the prereg

Everything run follows Amendment A1. Where the data forced something, it is listed here:
- **The yield-spread arm was not computed.** There is no NZD 10-year in the store (`y10_nzd.parquet` does not exist), so the reported-only arm could not be built for all eight. It has no bar, no ledger id and no say in the book either way. A DSR at N = 6 therefore does not exist; the figure of 0.173 in `results.json` (`dsr_n6`) duplicates the book as its sixth trial and **should not be quoted**.
- **Surprise momentum is thin at both ends.** The store starts 2015-11-04, so the in-sample covers about two years. In 2025–26 it holds few non-US releases, so the score is neutral for all eight currencies in the last rebalances (90 of 103 OOS months have a score at all; 247 of 824 OOS currency-months are neutral). Its z scaling is not verified point-in-time.
- **Value is the 5-year reversal proxy**, not the registered PPP form (US CPI only). A stronger or weaker CPI-adjusted version is untested.
- **Costs use the spread measured since 2026-09 for all history**, which flatters the earlier years. The effect on this result is small because the book trades monthly.
- **EUR leg after 2026-02-16** is the German call-money rate plus a 12-month offset of +0.009 percentage points (A1.3); the sensitivity above shows it does not matter here.
- The effective-N haircut came out larger than A1.6 assumed (m_eff 2.31 vs about 3), so the intervals are wider than the pre-results power paragraph implied.

## Descriptive (not part of the verdict)

Momentum's OOS book lost 46% peak to trough; the 2018–2021 half is where it hurt (IC −0.12, Sharpe −0.95). The in-sample 2005–2017 Sharpe was positive for all four factors, which fits the broader record that cross-sectional FX premia thinned after 2015. Carry's second half (2022–2026, Sharpe +0.58) is the strongest single stretch of the study and is not a result.

## What this changes

- **FX direction at one to three months becomes forward-record only**, not closed. The data could not answer, and the registered stopping rule needs a NULL combined book (A1.9, flagged for the owner to confirm).
- **No factor-book panel, no new input to Global Read, no tilt on Today or the newsletters.** The blend did not beat carry alone, and no factor cleared its placebo.
- **Carry and surprise momentum go to the forward ledger** as research forecasters per A1.8, since neither is NULL: 7 USD pairs, horizons 20 and 60 closes, P(up) from a logistic map fitted on data to 2026-08-21 and then frozen, scored against B0–B3. Momentum and the value proxy do not.
- What would reopen it: a CPI-adjusted value signal (needs point-in-time CPI for the other seven economies), a longer carry and momentum history from the pre-2005 era (the 1976–2014 carry record exists elsewhere), or the forward record reaching the counts set in `forge/DIRECTION_BAR_PREREG.md`.
