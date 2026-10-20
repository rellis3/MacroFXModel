# tff-basis-rates-vol — When leveraged funds' net Treasury futures short (the basis trade) is large or building fast, are the next four weeks of Treasury volatility higher than recent volatility predicts?

**Pre-registered 2026-10-21, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `tff-basis-rates-vol-level`, `tff-basis-rates-vol-build` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `tff-basis-rates-vol` |
| Data | Feature store, point-in-time: `tff_lev_ust_notional` (CFTC TFF leveraged-fund net, 2Y+5Y+10Y+bond, $bn face; asof report+3d) and `y10_usd` (FRED DGS10 daily, close+1h). Signal weeks 2007-06 (156 weeks of history needed) → 2026-07; outcomes end before 2026-08-21 (lockbox). |
| Seed | `20261021` |
| Uncertainty | Moving-block bootstrap over weeks, block 8 (4-week outcomes overlap), B = 2000 |
| Scripts / outputs | `scripts/tff-basis-rates-vol/` → `analysis/output/tff-basis-rates-vol/` |
| Harness | Own script, reading through `js/harness/features.mjs`'s parquet files with the same as-of rule (`asof <= t`). |

## 1. The claim (required)

This is the weekly, direct follow-up to `nbfi-rates-vol` (underpowered: Cayman USD borrowing growth → Treasury vol beyond persistence, partial r +0.13 [−0.00, +0.26], positive at every lag). The quarterly Cayman series stood in for the basis trade. CFTC TFF measures it directly every week: leveraged funds' net Treasury futures short is the futures leg of the cash-futures basis trade (Barth and Kahn 2021; Fed FEDS Notes 2023; BIS Quarterly Review March 2024). The claim: when that short is unusually large, or has been growing fast, the next weeks' Treasury volatility runs above what recent volatility predicts, because a crowded leveraged trade unwinds into price moves (March 2020, April 2025). This is about size, not direction.

## 2. Why it is not already settled (required)

- `nbfi-rates-vol` (underpowered) uses a quarterly proxy (Cayman borrowing). This study uses a direct weekly measure.
- `rates-vol-gap-*` (null/underpowered, 2026-10-21) tests rates **implied** vol (MOVE) against Nasdaq realised vol. That is a different signal and a different outcome market.
- `funding-stress` (null) is about repo rate episodes, not leverage size.

## 3. Definitions, fixed in advance (required)

- **Week t.** Each Friday from 2007-06 on. A value is used only if its `asof` is no later than Friday 21:00 UTC.
- **Signal, `level` cell.** `z_t` = −(latest net notional − its trailing 156-week mean) ÷ its trailing 156-week SD. The sign is flipped so that **+ = a larger net short than usual**.
- **Signal, `build` cell.** `b_t` = −(latest net notional − the value 13 weeks earlier) ÷ the trailing 156-week SD of 13-week changes. **+ = the short has been growing.**
- **Outcome.** `RV_fwd` = the annualised realised vol (bp) of daily DGS10 changes over the **next 20 trading days** after Friday t. **Control:** `RV_back` = the same over the previous 20 trading days. The quantity is `log RV_fwd` regressed on `log RV_back` (OLS, full sample); the residual is what the signal must explain.
- **Statistic.** The partial correlation of each signal with that residual.
- **Placebo.** Circular shifts of the signal by at least 52 weeks; the observed value must lie outside the central 95%.
- **Halves.** 2007-2016 and 2017-2026.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `level`: does an unusually large basis-trade short predict higher next-4-week Treasury vol than recent vol does (partial r > 0)? | **Weak positive**, about +0.05 to +0.10. |
| b | `build`: does a fast build-up predict it (partial r > 0)? | **Weak positive.** |
| — | **THE GATE** (per cell): Holm CI excludes 0 with a positive sign; both halves positive; outside the shift placebo. | |
| — | **THE MIRROR**: a shrinking short (an unwind already under way) is the negative side of `build`; the correlation covers it. | |

## 5. Power (required)

There are about 990 weekly signals. The 4-week outcomes overlap, so the effective n is about 990 / 4 ≈ 250. MDE at 80% power, Holm α 0.025: (2.24 + 0.84) / √250 ≈ **0.19**. The useful bar for a vol-beyond-persistence signal is 0.10.

| Cell | n (weeks) | Effective n | MDE (r) | Useful bar | Verdict |
|---|---|---|---|---|---|
| level | ~990 | ~250 | 0.19 | 0.10 | **UNDERPOWERED by design at 0.10** |
| build | ~990 | ~250 | 0.19 | 0.10 | **UNDERPOWERED by design at 0.10** |

It runs anyway. This is the best data that exists for the question, and it is still 5 times the quarterly study's effective n. Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−0.10, +0.10); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored cells: `level`, `build` (Holm).
- Descriptive only: the next 5-day window; the largest 5-day yield move in the next 20 days as the outcome; MOVE (`move_index`, to 2026-09-21) as the outcome; 2Y-only and 10Y-only TFF shares; SOFR volume growth as a second leverage measure.
- Promotion: |t| ≥ 3 plus a forward record (funding_read_v1 already logs the weekly value).

## 7. What this does NOT test (required)

- The direction of yields, or Nasdaq / FX effects (a separate question).
- The timing of an unwind.
- Whether the futures short is all basis trade. Some is plain duration hedging and macro shorting; TFF cannot separate them.

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). The Desk Watch `basis-trade-record` trigger cites it with its effect size, and the stop-risk and vol pages can show "basis trade large: Treasury vol historically above persistence". A forward record from funding_read_v1. No sizing until |t| ≥ 3.
- **NULL / UNDERPOWERED** → ledger entry. The trigger and funding block keep their description wording.

## Amendments

### A1 — 2026-10-21 — POST-HOC (results seen)
Describe only. The signal needs 170 weekly TFF rows (156-week window + 13-week change) and TFF starts 2006-06, so the first usable week is 2009-09-11, not 2007-06: 881 weeks instead of about 990, MDE about 0.21 instead of 0.19. Nothing else changed.
