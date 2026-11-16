# roc-stall-50d — when a market's 50-session rate of change stalls back to about zero after a strong run, what follows: weaker returns, a riskier next month, or nothing?

**Pre-registered 2026-11-16, before any outcome at a real event was computed.**

| | |
|---|---|
| ID / ledger id | `roc-stall-50d` (six scored cells C1 to C6, listed in section 6) |
| Branch | `main` (pushed straight to main, like the other register rows) |
| Register row | `plans/RESEARCH_REGISTER.md` → `roc-stall-50d` |
| Data | 30 long-history daily series, Yahoo chart endpoint (adjusted close for ETFs), fetched by `scripts/roc-stall/fetch.mjs`, tied to the file by sha256 in `analysis/output/roc-stall-50d/data_manifest.json`. Window 2000-01-03 → **2026-08-21** (the lockbox edge; nothing later is read) |
| Seed | `20261116` (every script in this study) |
| Uncertainty | date-clustered fixed-block bootstrap, blocks of 1 calendar month (h = 20 cells) or 3 months (h = 60 cell), B = 2000; shift placebo B = 500 for the gate (design numbers in section 5 used B = 200) |
| Scripts / outputs | `scripts/roc-stall/` → `analysis/output/roc-stall-50d/` |
| Harness | own script (`scripts/roc-stall/lib.mjs`, `power.mjs`, `run.mjs`): the repo harness (`runStudy.mjs`) is built for M1 sessions, not daily closes across 30 calendars |

## 1. The claim (required)

An educator in the informational lane (Crown Macro or Jessinskip: the owner pasted the passage on 2026-11-16 and the clip is not in the stored notes, so the attribution is unverified) says, of a 50-day rate of change:

> "Rate of change just means a rolling percentage performance over the last 50 days. If something gets to 100 and 50 days later it's at 100, it just went to zero in terms of rate of change. When that second derivative changes, to me it's a very powerful thing because it means people are getting frustrated ... when you are long something for 50 days and the news is good and it hasn't gone up, you're more vulnerable to selling it."

The testable price signature: a market that ran up hard (its 50-session rate of change, ROC_50, was in the top fifth of its own history) and has then gone **nowhere for 50 sessions** (ROC_50 is back near zero) is followed by worse outcomes than ordinary sessions of the same market. "Worse" is read three ways: lower forward returns (direction), and a riskier next month (volatility rises). The second-derivative reading, ROC_50 decelerating hard whatever its level, is the sixth cell.

The mechanism (holders getting frustrated and selling) is about positions and psychology. **It cannot be tested from price**; this study tests only whether the price signature that the claim describes has any footprint.

## 2. Why it is not already settled (required)

Nearest entries in `js/deskEvidence.js` and the repo, and why none answers this:

- `live-range-features` (NULL, 2026-10-07): intraday rate of change and acceleration added nothing to the hourly range line. Intraday, range questions; not 50-session, not direction or next-month risk.
- `vix-calculus` (analysis/output/vix-calculus/RESULTS.md): second derivatives of the **VIX family** (d²R/dt² of C.OG's ratios: 0 of 8 pass, 3 NULL; the first derivative of the VVIX/VXN ratio, top decile, is VALIDATED research-only: +0.23 SD over 20 sessions, fails Holm-46). Different variable (implied-vol ratios, not price) and not the stall state.
- `breadth-narrowing` (NULL), the trend-following status (FX null; multi-asset about 0.3 Sharpe OOS), the TSMOM and residual-momentum nulls (deskEvidence about line 828), the macro direction Phase 0 momentum baseline B2 (`direction-bar`): these test momentum **as a signal for continuation** (the level of trailing return), not the **stall after a run** or the change in rate of change.
- `COT adds nothing beyond price momentum` (deskEvidence about line 287): momentum is a control there, never the question.
- Nothing in the Evidence Book, `forge/`, `plans/` or the terminal tests a ROC_50 stall or ROC_50 acceleration on daily closes (the Desk Terminal draws no rate-of-change view either: checked 2026-11-16 by grep of `js/terminal`, `js/deskEvidence.js`, `forge/`, `plans/`, `MD files/`, `education/`).

So this is a new question, and the nearest nulls are named above so it cannot be read as a re-run.

## 3. Definitions, fixed in advance (required)

All quantities at session i use closes up to i. Per series, on its own trading calendar.

- **ROC_n(i)** = ln(C_i / C_{i−n}), n in {20, 50, 100}. ROC_50 is the primary; 20 and 100 are descriptive only.
- **History percentile** of a value = its mid-rank among the series' own earlier values (expanding window, sessions strictly before i), used only once at least **750** earlier ROC_50 values exist.
- **TOP stall** at i: the history percentile of ROC_50 **as known 50 sessions earlier** (i − 50) was ≥ 0.80 (it had run up hard), **and** |ROC_50(i)| ≤ 0.25 × the sd of the series' earlier ROC_50 values (price is back where it was 50 sessions ago, within a quarter of an sd).
- **BOTTOM stall** (the mirror): the same with the percentile at i − 50 ≤ 0.20.
- **ACCEL(i)** = ROC_50(i) − ROC_50(i − 20): the change in rate of change over 20 sessions (the second derivative). **ACCEL-down** = ACCEL's expanding history percentile ≤ 0.10.
- **Knowable when:** the close of session i. The outcome window starts at the close of i (so it uses nothing the flag did not know). Entering at that close is not claimed to be tradable (section 7).
- **Outcomes:** `Z_h` = ln(C_{i+h} / C_i) / (σ250(i) × √h), where σ250 is the sd of the last 250 daily log returns (units of a typical h-session move, so 30 series pool); h in {5, 10, 20, 60}. `LV_h` = ln( realised daily-return sd over sessions i+1..i+h / realised sd over i−59..i ), h in {10, 20, 60}: how much riskier the next h sessions are than the last 60.
- **Instruments:** 30 series, reported separately and pooled: SPX, NDX, RUT, DJI, DAX, FTSE, N225, HSI; XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLU, XLB; gold, silver, copper, WTI (Yahoo front futures: roll gaps are a known limit); EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD; TLT; BTC (from 2014-09). The universe was fixed before any data was read for this question.
- **De-clustering:** per series, greedy in time order: a flagged session starts an event only if at least **20** sessions after the previous event.
- **Control:** every session of the same series (same period) that is **not within 20 sessions after a flag** (the flag session itself and the 20 after it are excluded). The exclusion looks backwards only; a two-sided exclusion selects on the future and was found biased on a synthetic random walk (A0 below).
- **Pooled effect** = event-weighted mean over series of (mean outcome at events − mean outcome at that series' controls), same period. One effect per cell and period.
- **Uncertainty:** the date-clustered block bootstrap above; months are drawn with replacement and event and control means are recomputed inside each draw.
- **Sample / split:** discovery = events dated 2000-01-03 to 2012-12-31; **holdout = 2013-01-01 to 2026-08-21, opened once**, with the two halves 2013 to 2019 and 2020 to 2026-08-21. Events are assigned by their flag date.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| C1 | TOP stall → 20-session return (z): lower than controls? | **Null.** Equities and most markets drift up; I expect an effect near 0, and the educator's claim to be a describing-the-feeling claim, not a drift claim. If anything slightly negative. |
| C2 | TOP stall → 60-session return (z) | **Null.** Same, overlapping windows. |
| C3 | TOP stall → next-20 realised vol vs trailing 60 (log ratio): riskier? | **Yes, small.** Stalls follow a run, then a flat spell; I expect vol to be a little higher than controls, which is the one place the claim could show up without being a direction claim. |
| C4 | BOTTOM stall (**the mirror**) → 20-session return (z): higher than controls? | **Null.** |
| C5 | ACCEL-down decile → 20-session return (z): lower than controls? | **Null.** |
| C6 | ACCEL-down decile → next-20 realised vol (log ratio): riskier? | **Yes, small** (falling rate of change coincides with the start of a sell-off, so realised vol is already rising). |

**THE GATE** (a cell is VALIDATED only if all hold, on the holdout): (a) the pooled effect has the registered sign and its 95% bootstrap interval excludes 0; (b) the discovery effect has the same sign; (c) both holdout halves (2013 to 2019, 2020 to 2026-08-21) have the same sign; (d) it clears Holm at α = 0.05 across the six scored cells (two-sided p from the bootstrap interval, normal approximation, `pFromCI`); (e) the real holdout effect is beyond the 95th percentile, in the registered direction, of the shift-placebo distribution (B = 500 random circular rotations of each series' flags, independent per series, rotation between 100 and N − 100 sessions); (f) the effect keeps its sign when any one of the 30 series is left out (reported; a failure demotes to CONTEXT).
**THE MIRROR:** C4 is the mirror of C1; C5 and C6's opposite tail (ACCEL-up decile) is reported as the mirror for descriptive comparison (not scored).
**Material size:** the pass bar below is the size at which an effect would matter to a reader (0.15 of a typical h-session move for returns; 0.10 in log vol-ratio). A cell that is statistically detectable but smaller than its bar is still VALIDATED if it passes the gate, and the report says "small": no promotion to anything live without |t| ≥ 3.

## 5. Power — what this design can and cannot find (required)

From design numbers only (no outcome at a real event was read). Event counts are flag counts after de-clustering; the standard error is the sd of the pooled effect over 200 random rotations of each series' flags on the holdout; MDE = 2.8 × that sd (80% power, two-sided α = 0.05).

| Cell | n events discovery | n events holdout | Placebo SD (holdout) | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| C1 TOP stall → Z20 | 548 | 798 | 0.0427 | **0.120** | 0.15 | POWERED |
| C2 TOP stall → Z60 | 548 | 798 | 0.0500 | **0.140** | 0.15 | POWERED |
| C3 TOP stall → LV20 | 548 | 798 | 0.0159 | **0.045** | 0.10 | POWERED |
| C4 BOTTOM stall → Z20 | 465 | 591 | 0.0482 | **0.135** | 0.15 | POWERED |
| C5 ACCEL-down → Z20 | 912 | 1080 | 0.0346 | **0.097** | 0.15 | POWERED |
| C6 ACCEL-down → LV20 | 912 | 1080 | 0.0112 | **0.031** | 0.10 | POWERED |

- All six cells are POWERED against their bars. The thinnest margin is C2 (MDE 0.140 against 0.15: the h = 60 outcomes overlap, which is what the 3-month blocks absorb).
- **Planted-signal positive control (exact pipeline, synthetic random-walk series on the real calendars, no real outcome):** with no effect the eight synthetic worlds average within ±0.013 of zero in every cell (C1 −0.004, C2 +0.002, C3 −0.009, C4 −0.004, C5 +0.009, C6 −0.013); with an effect of exactly the bar planted at the events the pipeline returns the bar to within sampling noise (C1 −0.157, C2 −0.180, C3 +0.089, C4 +0.167, C5 −0.139, C6 +0.083 against planted −0.15, −0.15, +0.10, +0.15, −0.15, +0.10; one world each).
- Because the stall flags are rare, many events cluster in the same weeks across markets (2008, 2020). The block bootstrap and the rotation placebo both carry that; the MDE here uses the placebo spread, not an independence formula.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** C1 to C6, on the holdout. **Holm at α = 0.05** across the six.
- **Disaggregation (BH q = 0.10 with `chanceBaseline`):** the per-series effect for each cell (30 series), the per-year effect (concentration), and the other horizons (h = 5, 10, 60 for the top stall; h = 10 and 60 for the vol outcome) and the other lookbacks (ROC_20, ROC_100 versions). A slice that survives BH is a candidate for its own prereg, never a result.
- **Variants tried:** exactly the ones above (prior percentile 0.80 and flat band 0.25 sd were fixed before data; **no other threshold will be run**; a sensitivity table at percentile 0.70/0.90 and band 0.15/0.35 sd is reported as descriptive and cannot change a verdict).
- **Promotion bar:** |t| ≥ 3 before anything live uses it.

## 7. What this does NOT test (required)

- **Why anything happens.** Holder frustration, positioning and psychology are not observed in prices; a result here says nothing about them.
- **Tradability.** Entry at the signal close, no costs, no slippage, front-future roll gaps, and Yahoo closes are used: an effect here is a description of where the market has been, not a trade.
- **Direction on any single market on any given day;** the pooled effect is an average over 30 series.
- **The VIX-family or implied-vol derivatives** (already in `vix-calculus`), or the intraday rate of change (already in `live-range-features`).

## 8. What each verdict changes (required)

- **VALIDATED (any cell):** ledger entry with the effect, interval and MDE; the Insight "Momentum & rate of change" board shows the cell as a research-only context chip; nothing live (no brief line, no bot) until |t| ≥ 3 or a forward record.
- **NULL (powered, interval inside the bar):** ledger entry; the board says, next to each tile, what the educator says and that tests on this desk found no effect of that size.
- **UNDERPOWERED:** ledger entry as such; the board labels the cell "not resolved by this sample".
- Whatever the verdicts, the board is descriptive: where each series stands in its own ROC range.

## Amendments

### A0 — 2026-11-16 — PRE-RESULTS
The first design draft excluded control sessions within 20 sessions **before and after** a flag. The synthetic random-walk check (no outcome at a real event was read) showed that selecting controls with no flag in their own future biased the effect (C5 −0.23 on one synthetic world). The control exclusion was changed to look backwards only (the flag session and the 20 after it), the eight-world check then averaged within ±0.013 of zero in every cell, and the design numbers in section 5 were recomputed. No outcome at a real event had been computed.
