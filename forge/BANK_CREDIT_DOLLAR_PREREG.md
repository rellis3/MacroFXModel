# bank-credit-dollar — Does cross-border dollar bank credit growth, as known at publication, predict the next quarter's dollar index or Nasdaq return?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `bank-credit-dollar` (one test, two scored cells: `dxy`, `nasdaq`) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bank-credit-dollar` |
| Data | BIS Locational Banking Statistics (dataflow `WS_LBS_D_PUB`, latest vintage via the BIS SDMX API); ICE dollar index `DX-Y.NYB` and Nasdaq Composite `^IXIC` monthly closes from Yahoo. Outcome quarters 1980-Q3 → 2026-Q2. The last outcome quarter ends 2026-06-30, before the 2026-08-21 lockbox cut. |
| Seed | `20261020` |
| Uncertainty | Moving-block bootstrap over quarters, block 4, B = 2000 |
| Scripts / outputs | `scripts/bank-credit-dollar/` → `analysis/output/bank-credit-dollar/` |
| Harness | Own script. The study is quarterly macro and fits neither `analysis/study.mjs` (event study) nor `js/harness/runStudy.mjs` (daily feature store). |

## 1. The claim (required)

Bruno and Shin ("Cross-border banking and global liquidity", Review of Economic Studies 2015; "Capital flows and the risk-taking channel of monetary policy", JME 2015) and BIS work since then describe a "risk-taking channel of currency appreciation". A weaker dollar flatters dollar borrowers' balance sheets, banks lend more dollars across borders, and risk appetite rises. A stronger dollar runs it in reverse. The literature is mostly about the **same-period** link. The desk question is whether the credit cycle, as it is **published**, tells you anything about the **next** quarter.

The prompt for this test was C.OG sharing the BIS LBS file (2026-10-20). The exploratory look that day found cross-border credit growing at 12.3% a year to 2026-Q1, the fastest since 2008-Q1. That look is not part of this test: it used no price data.

## 2. Why it is not already settled (required)

- `credit-leads-equities` (banked null, 2026-10-19). Credit spreads (HY OAS) do not lead equities at 1–20 sessions. That is credit **pricing** at daily horizons. This test is bank credit **quantities** at quarterly horizons, so it is a different variable and a different horizon.
- `js/globalLiquidityEngine.js` / GlobalLiquidity (the GLI) uses central-bank balance sheets and FRED credit series, with no cross-border bank data. No Evidence Book entry uses BIS banking statistics (`grep` for BIS, LBS, cross-border and Bruno on 2026-10-20 found nothing).
- `project_yield_asset_coupling` / `project_stir_rates_vs_nasdaq` found same-bar links with no lead, at intraday-to-daily horizons. That is a different horizon from this test.

## 3. Definitions, fixed in advance (required)

- **The signal.** For quarter q, `g(q)` = sum of the four BIS FX- and break-adjusted flows (measure `F`) for q−3…q, divided by the stock (measure `S`) at q−4, × 100. Series: all reporting countries (`5A`), all reporting banks, all instruments, cross-border (`N`), claims (`C`), **US dollar** (`USD`), all counterparty sectors and countries (`5J`). Key `Q.{S|F}.C.A.USD.A.5J.A.5A.A.5J.N`.
- **Knowable when?** The BIS currently publishes a quarter about 4 months after it ends. Older releases were slower. To be conservative, `g(q)` is treated as known at the **end of quarter q+2** (a 6-month lag), and it predicts the return over **quarter q+3**.
- **Revisions.** Only the latest vintage is available, so the signal carries revision lookahead that cannot be removed. Because of this, a VALIDATED result cannot be used for anything until it holds on the forward record (§8). A NULL is not weakened by it.
- **The outcome.** Log return over quarter q+3, from the last monthly close of q+2 to the last monthly close of q+3, × 100. Instruments, reported separately:
  - cell `dxy`: ICE dollar index `DX-Y.NYB`
  - cell `nasdaq`: Nasdaq Composite `^IXIC`
- **Statistic.** Pearson correlation r between `g(q)` and the q+3 return, plus the OLS slope (return % per 1 pp of growth).
- **The control.** A circular-shift placebo. The signal is rotated against the outcomes by every offset of at least 12 quarters, and the observed r must lie outside the central 95% of the placebo distribution. This is reported alongside the bootstrap and is part of the gate.
- **Time shift.** Correlations at extra lags −2 … +4 quarters around the registered lag, plus the same-quarter (contemporaneous) correlation. These are descriptive only and carry no pass weight.
- **De-clustering.** Outcomes are non-overlapping quarters. The predictor is a trailing 4-quarter sum and so is autocorrelated, which the block bootstrap (block 4) handles.
- **Sample.** Outcome quarters 1980-Q3 → 2026-Q2 (n ≈ 184). Halves: 1980-Q3 → 2007-Q4 and 2008-Q1 → 2026-Q2.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `dxy`: does faster dollar credit growth predict a weaker dollar next quarter (r < 0)? | **Null.** The literature's link is same-period. Expect same-quarter r < 0 and forward r near 0. |
| b | `nasdaq`: does faster dollar credit growth predict a higher Nasdaq next quarter (r > 0)? | **Null**, with the same reasoning. |
| — | **THE GATE**: a cell passes only if (1) its bootstrap 95% CI for r excludes 0 after Holm across the two cells, (2) r has the same sign in both halves, and (3) r lies outside the placebo's central 95%. | |
| — | **THE MIRROR**: credit contraction (g < 0) is the same variable at the other end, because the test is a correlation across the whole range. There is no separate mirror cell. | |

## 5. Power — what this design can and cannot find (required)

Both cells have n ≈ 184 non-overlapping quarters and design effect ≈ 1 for the outcome. With Holm, the first cell is tested at α = 0.025. MDE for a correlation at 80% power = (2.24 + 0.84) / √184 ≈ **0.23**.

| Cell | Planned n | Outcome SD | Design effect | **MDE (r)** | Useful bar (r) | Verdict |
|---|---|---|---|---|---|---|
| dxy | ~184 | not needed for r | 1 | 0.23 | 0.15 | **UNDERPOWERED by design** |
| nasdaq | ~184 | not needed for r | 1 | 0.23 | 0.15 | **UNDERPOWERED by design** |

A quarterly r of 0.15 (R² ≈ 2%) would already be useful as a sizing tilt, and this design cannot reliably see an effect that small. The run goes ahead anyway because the history is fixed and cannot get longer. The verdict words follow this rule:

- **VALIDATED** (research-only): the full gate in §4 holds.
- **NULL**: the gate fails **and** the 95% CI for r lies entirely inside (−0.15, +0.15).
- **UNDERPOWERED**: everything else.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- Scored cells: `dxy`, `nasdaq`. Holm at α = 0.05 across the two, with p from `pFromCI` on the bootstrap CI.
- Descriptive only, with no pass weight: the time-shift lags, the same-quarter correlation, the same signal in EUR and in all currencies, and the non-bank borrower series (available only from 2014, about 45 quarters).
- Promotion to anything live needs |t| ≥ 3 **and** the forward record (§8).

## 7. What this does NOT test (required)

- Intraday or daily timing. The signal is quarterly and arrives months late.
- Cause. Even a pass would be a correlation through a shared driver (Fed policy, the global risk cycle).
- Tradability after costs, or any position sizing rule.
- Whether credit **levels** (2007-type booms) predict crashes. There are too few episodes to test that.
- The SOFR, SR3 and rates-leg relationships with Nasdaq at intraday horizons. Those are separate studies (`spread-episodes`, the STIR archive).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). The bank-credit page shows the signal with its test result, and the forward record starts with the next BIS release. Nothing sizes on it until the forward record and |t| ≥ 3 agree.
- **NULL** → ledger entry. The bank-credit page and today.html describe the BIS data as **context only** ("credit regime"). They never present it as a forecast of the dollar or Nasdaq.
- **UNDERPOWERED** → ledger entry. Same display rule as NULL. The history cannot get longer, so the only way to test further is the forward record, which runs from the next BIS release.

## Amendments

### A1 — 2026-10-20 — POST-HOC (results seen)
**Sample.** Yahoo's monthly history for `DX-Y.NYB` and `^IXIC` starts in 1985, so the scored sample ran 1985-Q2 → 2026-Q2 (n = 165) instead of 1980-Q3 (n ≈ 184). The MDE rises from 0.23 to 0.24. Nothing else changed.

### A2 — 2026-10-20 — POST-HOC (results seen): the nasdaq cell is demoted from VALIDATED to CONTEXT
The nasdaq cell met the gate as written (two-sided: Holm CI excludes 0, same sign in both halves, outside the placebo). r = −0.16 [−0.28, −0.06]. The sign is the **opposite** of hypothesis (b), which expected r > 0. The registered concentration controls (`stats-defaults.md`) then showed it rests on the two credit-boom busts. Without 1998–2002 and 2007–2009, r = −0.07. By decade it runs −0.21, −0.18, −0.11, −0.04, then +0.12 in the 2020s, and +0.09 over the last ten years. t ≈ 2.9, which is under the |t| ≥ 3 promotion bar. The cell is demoted to CONTEXT: it describes the history (high dollar-credit growth came before both big Nasdaq busts) and is not a forecast. A post-hoc amendment may demote, so this is allowed.
