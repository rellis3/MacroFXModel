# nbfi-rates-vol — Does faster cross-border dollar borrowing by Cayman fund vehicles (as known at publication) predict more Treasury volatility next quarter than current volatility already implies?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `nbfi-rates-vol` (one scored cell) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `nbfi-rates-vol` |
| Data | BIS LBS, latest vintage: cross-border USD claims on the Cayman Islands (`Q.{S,F}.C.A.USD.A.5J.A.5A.A.KY.N`); all-currency claims on non-bank financials (`…TO1…5A.F.5J.N`, from 2014, descriptive only). Yahoo daily `^TNX` (10-year Treasury yield, % ) for realised vol; Yahoo monthly `^MOVE` (2002+, descriptive only). Outcome quarters run up to 2026-Q2, before the lockbox. |
| Seed | `20261020` |
| Uncertainty | Moving-block bootstrap over quarters, block 4, B = 2000 |
| Scripts / outputs | `scripts/nbfi-rates-vol/` → `analysis/output/nbfi-rates-vol/` |
| Harness | Own script (quarterly). |

## 1. The claim (required)

Cayman-domiciled hedge funds run the Treasury cash-futures basis trade, financed in repo. The Fed (Barth, Kahn and Mann 2023) and the BIS (Quarterly Review, March 2024) describe this leverage as an amplifier: when it unwinds (March 2020, April 2025), Treasury volatility spikes. The desk version: when Cayman dollar borrowing has been growing fast, is the next quarter's Treasury volatility **higher than its own persistence predicts**? This is about size, not direction. It is the idea raised on 2026-10-20 after the bank-credit page went live (Cayman USD +20% y/y).

## 2. Why it is not already settled (required)

- `funding-stress` (null) is about SOFR above the floor and Standing Repo Facility draws: funding **price** episodes at a daily horizon. This study is leverage **quantity** at a quarterly horizon.
- `yield-move-fx-range` (null) is about Treasury moves driving FX ranges, which is a different outcome.
- `bank-credit-dollar-*` covers the global dollar series against DXY and Nasdaq returns, not rates vol.

## 3. Definitions, fixed in advance (required)

- **Signal.** `g_KY(q)` = 4-quarter FX-adjusted growth of cross-border USD claims on Cayman (four F flows ÷ stock four quarters back × 100). It is known at the end of q+2 and used to predict quarter q+3.
- **Outcome.** `RV(q)` = the standard deviation of daily ^TNX changes within the quarter, in bp, × √252 (annualised bp vol). The quantity predicted is `log RV(q+3)`.
- **Persistence control.** `log RV(q+3)` is regressed on `log RV(q+2)` (the last quarter known when the signal arrives) by OLS over the full sample. The scored statistic is the **partial correlation** of `g_KY(q)` with that residual.
- **Placebo.** Circular shifts of the signal by at least 12 quarters. The observed partial r must lie outside the placebo's central 95%.
- **Sample.** Outcome quarters from the first quarter with Cayman data plus 7 quarters (expected late 1980s) to 2026-Q2; about 150 quarters. Halves split at 2008-Q1.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Does fast Cayman USD borrowing growth predict more Treasury vol than persistence predicts (partial r > 0)? | **Weak positive or null.** Leverage builds slowly and unwinds suddenly, and one quarter is a short window. |
| — | **THE GATE**: the bootstrap 95% CI excludes 0; the same sign in both halves; outside the placebo 95%. One cell, so no Holm correction. | |
| — | **THE MIRROR**: Cayman deleveraging (g < 0) followed by calmer rates; the correlation covers it. | |

## 5. Power (required)

n ≈ 150, design effect about 1 (non-overlapping outcomes). MDE (80% power, α 0.05) = (1.96 + 0.84) / √150 ≈ **0.23**. Useful bar 0.15. **UNDERPOWERED by design.** It runs anyway because the history cannot get longer. Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−0.15, +0.15); otherwise UNDERPOWERED.

## 6. Multiplicity (required)

- One scored cell. Descriptive only: non-bank financials growth (2014+, about 40 quarters), MOVE quarterly average (2003+), the 5-year (^FVX) instead of the 10-year, the raw (not partial) correlation, and the largest 5-day yield move in the quarter as the outcome.
- Promotion: |t| ≥ 3 plus a forward record.

## 7. What this does NOT test (required)

- Direction of yields, the timing of an unwind, or the basis trade's actual size (CFTC TFF leveraged-fund shorts would be the direct measure; that is a separate idea).
- Intraday effects on Nasdaq or SOFR legs.
- Point-in-time BIS data (latest vintage only, so revision lookahead remains).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). The Cayman tile on bank-credit.html shows "historically more rates vol next quarter", and the stop-risk and vol pages can cite it as context. A forward record starts. No sizing until |t| ≥ 3.
- **NULL / UNDERPOWERED** → ledger entry. The Cayman line stays as a description of leverage only.
