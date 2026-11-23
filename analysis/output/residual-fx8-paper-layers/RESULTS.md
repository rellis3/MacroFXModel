# residual-fx8-paper-layers — do the research papers make the FX8 residual book better?

**EXPLORATORY, not pre-registered.** The base was chosen on this same 2016-26 history, so nothing here is out of
sample. The layer rules were fixed in the script header (`scripts/residual-fx8-paper-layers/layers.py`) before any
variant was run. The frozen forward record `residual-fx8-forward` is not touched.

- Data: 17:00 NY daily closes, FX8 (USD EUR GBP AUD NZD JPY CAD CHF; NOK/SEK not in the panel), P&L days
  2016-06-21 → 2026-08-20 (lockbox untouched). Halves split 2021-07-23. Rates: FRED OECD 3m interbank, monthly, used
  from the first day of month M+2.
- Base reproduces `residual-pca-stops` exactly: net Sharpe IS 0.432 / OOS 0.378 (asserted).
- Seed 20261123; moving-block bootstrap (block 21, B 2000) on the Sharpe difference vs base.
- "Better" or "worse" needs the change to have the same sign in both halves AND a 90% interval that excludes 0.

## Results (gross 1, house spread costs; "+carry" adds the interest differential the book earns or pays)

| Variant (paper) | Trades | Net Sharpe IS | Net Sharpe OOS | +carry IS | +carry OOS | Δ vs base (+carry), 90% CI | Call |
|---|---|---|---|---|---|---|---|
| **Base** FX8 threshold book | 265 | 0.43 | 0.38 | 0.43 | 0.43 | — | — |
| +V global FX vol filter (Menkhoff et al. 2012) | 214 | 0.49 | 0.20 | 0.50 | 0.26 | −0.06 [−0.29, +0.25] | no clear change |
| +M momentum guard (Menkhoff et al. 2012; AMP 2013) | 197 | 0.08 | 0.12 | 0.08 | 0.17 | −0.30 [−0.50, −0.13] | **worse** |
| +VAL value guard (Rogoff 1996; AMP 2013) | 190 | 0.29 | 0.37 | 0.29 | 0.33 | −0.12 [−0.41, +0.17] | no clear change |
| +C carry guard (Lustig, Roussanov & Verdelhan 2011) | 136 | 0.49 | 0.44 | 0.54 | 0.63 | +0.15 [−0.22, +0.45] | no clear change (best; up in both halves) |
| +AL Avellaneda & Lee 2010 entry 1.25 / exit 0.5 | 430 | 0.02 | 0.63 | 0.01 | 0.67 | −0.10 [−0.34, +0.15] | no clear change (unstable) |
| NN factor-neutral off (Verdelhan 2018 ablation) | 265 | 0.09 | 0.61 | 0.07 | 0.66 | −0.07 [−0.29, +0.17] | no clear change (unstable) |
| Stack V+M | 159 | 0.09 | 0.28 | 0.11 | 0.34 | −0.20 [−0.47, +0.15] | no clear change |
| Stack V+M+VAL | 105 | 0.10 | 0.02 | 0.12 | −0.07 | −0.40 [−0.82, +0.06] | no clear change |
| Stack V+M+VAL+C | 51 | −0.21 | 0.22 | −0.17 | 0.25 | −0.43 [−0.85, +0.13] | no clear change |

Base full sample: +carry Sharpe 0.43, about 1.0% a year at 2.3% vol (gross 1), max DD −3.3%. Carry guard: 0.58,
1.3% a year, max DD −3.5%. The base itself earns almost no carry (+0.05% a year); the carry guard earns +0.26%.

## What it says

1. **Stacking the papers made the book worse, not better.** Each guard removes trades, and the trades it removes are
   not the bad ones. With all four layers on, only 51 trades are left and the Sharpe falls by about 0.4.
2. **The momentum guard is clearly harmful** (the one call that passes the bar). The trades it blocks (fading
   currencies on extreme 3-month runs) are where much of the base book's profit comes from. Residual reversion
   at a ~1-month hold and cross-sectional FX momentum at 3-12 months are separate effects; in G10 the momentum
   effect is weak (as Menkhoff et al. found), so it shouldn't veto the fade.
3. **The carry guard is the only layer that helps in both halves** (+0.11 / +0.20 Sharpe with carry), but the
   interval includes zero and the year-by-year gain is lumpy: better in 7 of 11 years, worse in 4 (2017, 2018, 2020,
   2022). With six single layers tried, one looking this good by chance is expected.
4. **The global-vol filter helped the first half and hurt the second.** It is not the stable risk filter the paper
   suggests for this book (the paper is about carry crashes, not residual reversion).
5. **Avellaneda-Lee exits and removing factor neutrality both flip between halves** (≈0 in 2016-21, ≈0.6 in 2021-26).
   That points to regime dependence, as C.OG said, not to a better design.

## Next (owner's call)

- Nothing here should change the frozen forward record.
- If anything is carried forward, it is **the carry guard alone**, as a pre-registered **shadow** next to
  `residual-fx8-forward` (same days, same costs, real OANDA financing), judged on new data only.
- Not done: NOK and SEK (full G10) need adding to the panel first.

Files: `results.json` (every variant, every half, bootstrap), `daily_net.csv`, `daily_net_carry.csv`.
