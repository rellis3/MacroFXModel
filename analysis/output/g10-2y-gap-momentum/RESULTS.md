# g10-2y-gap-momentum — results

Prereg: `forge/G10_2Y_GAP_MOMENTUM_PREREG.md` (committed in `ebbd9f48`, 2026-11-28). Run 2026-11-28, seed 20261128,
B = 2000. Branch `ccr-251b1df6-yo7y0p`. Ledger ids: `g10-2y-gap-l20h5` (primary), `g10-2y-gap-l5h5`,
`g10-2y-gap-l20h20`, `g10-2y-gap-l5h20`. Page: `g10-2y-gap-momentum.html`.

## Verdict: NULL

FX-001 asked whether the recent change in a currency's daily 2-year yield gap ranks its next 5 or 20 trading days. It
does not. The primary cell (20-day change → next 5 days) has a mean rank IC of **+0.006, 95% CI [−0.011, +0.025]**: the
whole interval sits below the registered economic bar of 0.03, so a useful effect is ruled out, not just unproven.
Halves +0.015 / −0.002; carry-orthogonal IC +0.006 (p 0.28); net book Sharpe +0.01 [−0.36, +0.37]. Two more cells are
NULL the same way; the 5-day change → 5 days is UNDERPOWERED (+0.013, CI to +0.031), with a net Sharpe of only +0.11
after 0.17 bp/day of cost. Daily data does not rescue the monthly `rate-diff-xsmom` null.

## Scored cells

9 currencies (USD EUR JPY GBP CAD AUD CHF SEK NOK; 8.3 a day on average), Fed H.10 noon fixings, yields lagged one day,
signal days 2005-01-03 → 2026-08 (outcomes end ≤ 2026-08-20). IC = daily Spearman across currencies, averaged;
moving-block bootstrap on days (block max(21, 2H)). MDE = 3.1 × bootstrap SE (Holm over 4, 80% power).

| Cell | L → H | Days | Mean IC | 95% CI | MDE | Pass bar | Holm p (IC > 0) | Halves | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **g10-2y-gap-l20h5** (primary) | 20 → 5 | 5,416 | +0.006 | [−0.011, +0.025] | 0.029 | IC > 0, Holm p ≤ 0.05, both halves; NULL if CI < 0.03 | 0.72 | +0.015 / −0.002 | **NULL** |
| g10-2y-gap-l5h5 | 5 → 5 | 5,416 | +0.013 | [−0.004, +0.031] | 0.027 | same | 0.32 | +0.016 / +0.009 | UNDERPOWERED |
| g10-2y-gap-l20h20 | 20 → 20 | 5,401 | −0.017 | [−0.044, +0.015] | 0.048 | same | 0.88 | −0.019 / −0.015 | NULL |
| g10-2y-gap-l5h20 | 5 → 20 | 5,401 | +0.007 | [−0.009, +0.025] | 0.027 | same | 0.72 | +0.011 / +0.002 | NULL |

Gate (primary passes AND carry-orthogonal IC p ≤ 0.05 AND net Sharpe > 0): not reached. Mirror (reversed signal):
no cell is significantly negative in both halves after Holm (l20h20 one-sided p 0.12), so there is no reversal either.

Book check (rank weights, gross 1, H overlapping tranches, house costs; NOK/SEK 0.035%):

| Cell | Gross Sharpe | Net Sharpe [95% CI] | Net halves | Cost bp/day |
|---|---|---|---|---|
| l20h5 | +0.08 | +0.01 [−0.36, +0.37] | +0.14 / −0.19 | 0.09 |
| l5h5 | +0.28 | +0.11 [−0.28, +0.47] | +0.24 / −0.07 | 0.17 |
| l20h20 | −0.09 | −0.13 [−0.49, +0.21] | −0.12 / −0.15 | 0.04 |
| l5h20 | +0.07 | −0.00 [−0.36, +0.34] | +0.11 / −0.17 | 0.04 |

## Controls

- **Positive control (before scoring, `control.json`, commit before the scored run):** a planted signal with true IC ≈
  0.048 is recovered as 0.043 [0.033, 0.052] (H5) and 0.045 [0.035, 0.053] (H20): the pipeline finds an effect of the
  bar's size when one exists.
- **Cross-sectional shuffle (500):** mean IC −0.0001 (H5), −0.0003 (H20): no built-in bias.
- **Sign check (null-result audit, data-rules item 10):** over the same window, the yield-gap change and the currency's
  basket return line up strongly: IC +0.36 (20-day change vs the 20-day FX move), +0.17 (5-day). The signal has the
  right sign and the data are aligned; FX simply moves **with** the rate repricing, not after it.

## Deviations from the prereg

None. One reporting detail: "95% upper bound" in the NULL rule is read as the upper end of the two-sided 95% bootstrap
interval (97.5th percentile), the stricter of the two readings.

## Descriptive (not part of the verdict)

- **Carry (yield level) does rank the next days:** IC +0.033 [+0.009, +0.057] at 5 days, +0.034 [−0.013, +0.076] at 20.
  Consistent with `rate-diff-xsmom` (level works, change doesn't) and with the carry guard being the one helpful layer in
  `residual-fx8-paper-layers` / `residual-g10-layers`.
- **20-day price momentum ranks the next days negatively:** IC −0.024 [−0.044, −0.003] at 5 days, −0.052 [−0.088,
  −0.016] at 20. Short-term cross-sectional reversal, the effect the residual book trades.
- Primary IC by year swings between −0.09 and +0.10 with no trend; no sub-period carries it.
- Same-day IC (signal vs that day's move) +0.016 / +0.027: the one-day lag is not hiding a large next-day effect.

## What this changes

- FX-001 is closed at daily frequency on government 2-year yields: rate **changes** add nothing to G10 currency ranking
  at 5–20 days, beyond or without carry. The only version left open is market-implied policy paths (OIS / rate futures),
  which need paid data, and the prior is now low.
- What does show up, descriptively, is the pair already in hand: **carry (level) and short-term reversal**. The next
  G10 step is the carry-guarded residual book as a pre-registered forward shadow at the OANDA 17:00 close, not more
  rate-change signals.
