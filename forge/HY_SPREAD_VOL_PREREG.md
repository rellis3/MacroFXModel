# hy-spread-vol — When high-yield credit has been underperforming Treasuries (spreads widening), are the next five days of FX and index volatility higher than recent volatility predicts?

**Pre-registered 2026-10-22, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `hy-spread-vol-fx`, `hy-spread-vol-idx` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `hy-spread-vol` |
| Data | Yahoo daily adjusted closes HYG (2007-04+) and IEF; feature store `px_d1_*` OANDA daily closes for EURUSD, GBPUSD, AUDUSD, NZDUSD, USDCAD, USDCHF, USDJPY (fx cell) and NAS100, SPX500 (idx cell). **Scored sample 2007-06 → 2020-07.** 2020-08 → 2026-08 is reported descriptively only, because the lead came from that period. |
| Seed | `20261022` |
| Uncertainty | Block bootstrap over days, block 21, B = 2000 |
| Scripts / outputs | `scripts/hy-spread-vol/` → `analysis/output/hy-spread-vol/` |
| Harness | Own script. |

## 1. The claim (required)

Two prior results point here.
- `credit-leads-equities` (null on Moody's spreads, 22 years) recorded a descriptive: "ICE HY OAS widening → next-week realised vol above persistence, IC +0.26 on three years". Its stated next step was "a prereg on HYG/JNK from 2007".
- `funding-forecast-error` (2026-10-22) found, descriptively, that ranges ran about +5.3% above the desk forecast after a 20-day HY OAS widening (3 years).

This prereg runs that registered next step on 13 years of data the lead never saw, and extends it to FX. The idea comes from the owner's credit thread: when credit tightens for risky borrowers, leveraged positions get cut and markets move further.

## 2. Why it is not already settled (required)

- `credit-leads-equities` tested **investment-grade** spreads (Moody's Baa−Aaa, Baa−Treasury) at 1–20 sessions on **equities**: null. This study uses **high-yield**, the leg its own descriptive pointed at, and adds FX.
- The HY OAS descriptives cover 2023–2026 only (FRED's history). The scored window here (2007–2020) does not overlap them.

## 3. Definitions, fixed in advance (required)

- **Signal.** `H_t` = −[ln(HYG/IEF)_t − ln(HYG/IEF)_{t−20}] × 100, using adjusted closes. **+ = high yield has underperformed Treasuries over 20 sessions**, a widening-spread proxy. It is known at the US close of day t.
- **Outcome.** For each instrument: `ln(mean |daily log return| over t+1..t+5) − fit(ln(mean |daily return| over t−19..t))`, where the fit is OLS per instrument over the scored sample. This is volatility beyond persistence. The date-level outcome is the mean over the cell's instruments.
- **Statistic, per cell.** The mean outcome on top-tercile H days minus bottom-tercile days (terciles cut on the scored sample), as % = 100 × (exp(diff) − 1). The Pearson correlation is reported alongside.
- **Controls.**
  - Placebo: circular shifts of H by at least 63 sessions (every 5th).
  - Halves: 2007-06 → 2013-12 and 2014-01 → 2020-07.
  - Excluding 2008-09 → 2009-06 (is it all the financial crisis?).
- **Alignment.** HYG/IEF are US closes (21:00 UTC); OANDA daily closes are 21:00 UTC; outcomes start the next session. Trading days follow the OANDA calendar; H is carried forward over US holidays.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `fx`: after HY widening, is FX vol above persistence? | **Positive**, about +3% to +8%. |
| b | `idx`: after HY widening, is index vol above persistence? | **Positive**, about +5% to +15%. |
| — | **THE GATE** (per cell): Holm CI excludes 0 with a positive sign; positive in both halves; above the placebo's 95th percentile; still positive excluding 2008-09 → 2009-06. | |
| — | **THE MIRROR**: HY outperforming (spreads tightening) followed by calmer markets. The tercile difference covers it. | |

## 5. Power (required)

From the outcome alone (no signal), 2007-06 → 2020-07: the FX date-level residual has daily SD 0.31 with AC1 0.77 and a monthly-mean SD of 0.146 over 158 months; indices 0.52 / 0.86 / 0.293. The signal is a 20-day change, so the honest unit is about a month (about 53 months per tercile). SE of the difference = monthly SD × √(2/53). MDE (Holm α 0.025): **FX ≈ 0.087 log (≈ 9%)**, **indices ≈ 0.175 (≈ 19%)**.

| Cell | Months | MDE | Useful bar | Verdict |
|---|---|---|---|---|
| fx | 158 | ≈ 9% | 5% | **UNDERPOWERED by design at 5%** |
| idx | 158 | ≈ 19% | 5% | **UNDERPOWERED by design at 5%** |

Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−5%, +5%); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored: `fx`, `idx` (Holm at α 0.05).
- Descriptive only: 2020-08 → 2026-08; JNK instead of HYG; 1-day and 20-day horizons; gold; the continuous correlation; and the shipped range forecast error (vf3, 2020-08+) as the outcome.
- Promotion: |t| ≥ 3 plus a forward record.

## 7. What this does NOT test (required)

- Direction.
- Whether HYG/IEF is a clean spread measure. ETF flows and duration mismatch add noise.
- Any band adjustment to the live forecaster (`forecast-pick` and the side-by-side rule apply).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). A shadow "credit widening: vol above persistence" note sits beside the forecast, never changing it. A forward record starts. Promotion at |t| ≥ 3.
- **NULL / UNDERPOWERED** → ledger entries. The HY descriptives in `credit-leads-equities` and `funding-forecast-error` are marked as not confirmed on 2007–2020.
