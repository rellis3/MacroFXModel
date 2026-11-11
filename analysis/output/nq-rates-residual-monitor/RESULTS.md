# nq-rates-residual-monitor: when is Nasdaq a rates trade? (EXPLORATORY, not pre-registered)

Owner's question (2026-11-11): regress Nasdaq returns on yield changes, then read the residual. Does it show WHEN Nasdaq behaves differently
from what rates explain? Descriptive only. The trading version (does Nasdaq catch up to the rates-implied move afterwards?) is already banked
NULL in `analysis/output/rates_residual/RESULTS.md` (S1, 4-hour bars), and the yield ladder found Nasdaq leading yields. Neither is re-tested here.

**Verdict word: CONTEXT** (exploratory; not banked, never `validated`).

## Method

- Daily, 2005-06 to 2026-11-09, 5,338 days. FRED `NASDAQ100` (close, 16:00 ET), `DGS2`, `DGS10` (about 15:30 ET: a half-hour timing gap
  that slightly weakens the same-day link). Only days where all three print; returns and changes are taken across the same kept days.
- `r = a + b1·Δ2y + b2·Δ(10y−2y) + e`. r = log return in %, changes in bp. The 2y and the slope replace 2y and 10y because Δ2y and Δ10y
  correlate 0.74 here, which makes their separate betas unstable. The fitted value is the same either way.
- Rolling OLS on the **previous 120 trading days only**, so each day's residual is out of sample. `z = e / window residual sd`;
  `z20` = 20-day sum of e / (sd·√20). Robustness at 60 and 250 days.
- Script `scripts/nq-rates-residual-monitor/run.py`; outputs `results.json`, `monitor_daily.csv`, `monitor.png`.

## Findings

1. **Rates explain little of Nasdaq's daily move, and how much changes a lot.** Rolling R² has a median of 0.13 (10th–90th percentile
   0.02–0.32, max 0.47). It is above 0.2 on 34% of days. Out-of-sample R² over the whole period is 0.105.
2. **The relationship flips sign.**
   - The 2y beta is negative 29% of the time and changed sign 89 times in 21 years.
   - **Positive beta, yields up = Nasdaq up** ("growth / risk-on" regime): 2007–2012, 2014–2016 and 2018–2020 had strong positive betas,
     up to +2 to +2.7% per +10 bp. In crises both fall together.
   - **Negative beta, yields up = Nasdaq down** ("discount-rate / inflation" regime): 2021–2023 and from mid-2026.
   - **2021–2024 had almost no daily link** (yearly R² 0.001–0.055). Even 2022, the "rates year", is R² 0.03 on daily closes: rates moved
     the trend over weeks, not day to day.
3. **The residual on its own is mostly Nasdaq's own move.**
   - Daily residual vs daily return correlation is 0.91; for the 20-day sums it is 0.84.
   - So a big residual mostly says "Nasdaq moved a lot", not "something unusual happened".
   - It has fat tails: |z| > 2 on 6.7% of days against 4.6% for a normal distribution.
   - Lag-1 autocorrelation is −0.04, so there is no persistence day to day.
4. **The informative cases are the rare ones where rates and Nasdaq point opposite ways.** Over 20 days, rates implied a move of more than
   2% one way while Nasdaq moved more than 2% the other way on 6.9% of days. The 19 episodes with |z20| > 2.5 are mostly market-wide stress
   that did not come from rates: Oct 2008, Aug 2015, Mar 2020, Jan 2022, the Aug 2024 yen-carry unwind. The largest are listed below.
5. **Now (2026-11-09):**
   - **the 120-day R² is 0.01**, so Nasdaq is not trading on rates at the moment;
   - the 2y beta is slightly negative;
   - z20 is −2.3 (it peaked at −3.58 on 5 Nov, the third-largest in the sample).
   
   Over the last 20 days, falling yields "implied" Nasdaq **+5.4%** and it went **−10.1%**. The monitor says this sell-off is not a rates
   story. The April–May 2026 rally (+3.26, Nasdaq +16.6% with rates implying ~0) was the mirror image.
6. **Robust to the window length.** The 60-day and 250-day versions correlate 0.80 with the 120-day R² and 0.91–0.94 with the 120-day z20.

## Largest episodes (|z20| > 2.5, one row per run, at its peak)

| peak | z20 | NQ 20d % | rates-implied 20d % | R² | 2y beta (% per +10 bp) |
|---|---|---|---|---|---|
| 2020-03-12 | −3.85 | −28.0 | −5.3 | 0.28 | +1.55 |
| 2008-10-09 | −3.76 | −33.0 | −3.8 | 0.36 | +1.22 |
| 2026-11-05 | −3.58 | −15.7 | +6.6 | 0.04 | −0.56 |
| 2022-01-25 | −3.56 | −15.8 | +2.6 | 0.03 | +0.51 |
| 2024-08-07 | −3.50 | −14.6 | +3.6 | 0.00 | −0.06 |
| 2026-04-27 | +3.26 | +16.6 | −0.1 | 0.04 | −0.48 |
| 2017-07-03 | −3.06 | −4.9 | +3.5 | 0.05 | +0.30 |
| 2013-06-24 | −2.89 | −4.9 | +6.0 | 0.08 | +0.75 |
| 2015-08-25 | −2.79 | −12.7 | −0.0 | 0.05 | +0.31 |

(full list in `results.json`; 2020-03 and 2008-10 show several runs)

## How to use it

- **As a regime gauge (the useful part).** Rolling R² and beta sign say whether Nasdaq is currently a rates trade and which way: yields up
  = good, or yields up = bad. Only when R² is high is it worth reading a rate move into Nasdaq at all.
- **As a "not rates" flag.** A large |z20| with rates pointing the other way marks moves driven by something else: risk appetite, earnings,
  positioning, a carry unwind.
- **Not as a signal.** The residual does not persist, and the catch-up trade is banked NULL.

## Caveats

- Exploratory: no prereg and no multiple-testing control.
- Daily closes are about 30 minutes apart; same-time intraday bars would sharpen the link (the rates_residual study used them).
- A rolling-window OLS adapts slowly to a regime break: about 120 days to fully reflect a new sign.
