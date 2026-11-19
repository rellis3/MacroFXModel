# roc-stall-trend-filter — does the 50-session rate-of-change reset pay only above a rising 200-day average?

**Pre-registered 2026-11-18, before any outcome at a real event was computed.**

| | |
|---|---|
| ID / ledger id | `roc-stall-trend-filter` (one scored cell, T1; reported cells T2–T5, M1, M2 are descriptive, listed in section 6) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `roc-stall-trend-filter` |
| Data | the parent study's 30 long-history daily series (`scripts/roc-stall/fetch.mjs`, Yahoo chart endpoint, adjusted close for ETFs), re-fetched 2026-11-18 (sha256 `80ba7f4f…8930a`, `analysis/output/roc-stall-trend-filter/data_manifest.json`). Window 2000-01-03 → **2026-08-21** (the lockbox edge; nothing later is read). The ETF adjusted closes differ slightly from the parent's 2026-11-16 pull because Yahoo re-adjusts for each dividend; indices, futures and FX are unchanged |
| Seed | `20261118` (every script in this study) |
| Uncertainty | date-clustered fixed-block bootstrap, blocks of 1 calendar month (h = 20), 2 months (h = 40) or 3 months (h = 60), B = 2000; rotated-flag placebo B = 500 for the gate (design numbers in section 5 used B = 200) |
| Scripts / outputs | `scripts/roc-stall-trend-filter/` (imports the parent's `scripts/roc-stall/lib.mjs` unchanged) → `analysis/output/roc-stall-trend-filter/` |
| Harness | own script, the parent's: daily closes across 30 calendars, which `runStudy.mjs` (M1 sessions) does not cover |
| Parent | `forge/ROC_STALL_50D_PREREG.md` (banked 2026-11-16: 0 of 6 cells validated) |

## 1. The claim (required)

Jordi Visser (ex-Morgan Stanley MD, ex-president of a USD 4bn hedge fund), on the *Titans of Tomorrow* podcast, two shorts pasted by the owner on 2026-11-18 (`education/intake/informational/titans-of-tomorrow/2026-11-18-visser-agents-and-roc.md`). The parent study tested his 50-day rate-of-change reset as a warning and found nothing. His fuller rule, from the second clip, adds a trend filter and reads the reset the other way:

> "I only look at things that are above the 200-day moving average and the 200-day moving average is going up ... When the 50-day rate of change gets back to zero on one of those, it means the stock has consolidated for fifty days and wants to go higher."

The testable price signature: the parent's TOP stall (ROC_50 was in the top fifth of the market's own history 50 sessions ago and has now fallen back to about zero), **taken only when the close is above a 200-session simple average whose 20-session slope is rising**, is followed by **higher** returns than ordinary sessions of the same market **in the same trend state**. The same-state control is the point of the design: a market above a rising 200-day drifts up on its own, and the claim has to beat that drift, not zero.

**Edge source** (method lesson #4): if real, this is trend continuation after a pause, a risk premium / trend-following drift, not forecasting skill. Who is on the other side in Visser's telling: holders who sell out of frustration after fifty flat days. That mechanism is positioning and psychology and **cannot be seen in prices**; this study tests only whether the price footprint exists.

## 2. Why it is not already settled (required)

- `roc-stall-50d-top20` (UNDERPOWERED, 2026-11-16): the unconditioned TOP stall, +0.050 [−0.046, +0.151] against **all** non-flag sessions. It did not split by trend state and its control was every ordinary session, so it never asked whether the stall beats its own uptrend. `roc-stall-50d-top60` (NULL) and `-topvol` (NULL) likewise.
- **What the design numbers already say (flags only, no outcome read).** Of the parent's 798 de-clustered holdout TOP events, **666 (83%) are above a rising SMA200**, 35 below a falling one and 97 mixed. A top-quintile run fifty sessions ago nearly always leaves price above a rising 200-day, so Visser's filter is close to implied by the stall itself. The variant therefore changes two things, not one: it drops 17% of events, and it **raises the bar** by comparing against same-state controls (uptrend sessions drift up more than all sessions). The honest expectation is that the effect comes out **lower** than the parent's +0.05.
- **Same sample.** The 2013+ holdout was opened once by the parent for the unconditioned stall. This is a conditional re-cut on the same data: the split was not chosen after seeing a trend breakdown (the parent never computed one, and the filter is the educator's, carded before any number here was read), but it is not fresh data either. Section 8 says what that costs: a pass here is research-only and needs a forward record before it is anything more.
- `trend-following-fx` (NULL), `direction-bar` B2 and the TSMOM nulls test the **level** of trailing return as a continuation signal, not a pause inside a trend. `cot-crowding-p5` state D is the nearest shape (pullback in trend) with a positioning leg this study does not have.
- Nothing in `js/deskEvidence.js`, `forge/`, `plans/` or `MD files/` conditions a rate-of-change reset on a moving average (grep 2026-11-18: "SMA200", "200-day", "roc", "stall").

## 3. Definitions, fixed in advance (required)

All quantities at session i use closes up to i, per series on its own calendar. Everything the parent fixed is imported unchanged from `scripts/roc-stall/lib.mjs` (ROC_50, the 750-session expanding percentile, TOP / BOTTOM stall at 0.80 / 0.20 prior percentile and a 0.25-sd flat band, greedy 20-session de-clustering, the backwards-only 20-session control exclusion, Z_h and LV_h outcomes, the month-block bootstrap and the rotation placebo).

- **SMA200(i)** = mean of the last 200 closes (i−199..i). **Slope** = SMA200(i) − SMA200(i−20).
- **Trend state at i:** **UP** if close > SMA200 and slope > 0; **DOWN** if close < SMA200 and slope < 0; **MIXED** otherwise (and undefined for the first 219 sessions). The state is read **at the flag session**.
- **Events:** the parent's de-clustered TOP (and, for the mirror, BOTTOM) stall events, **de-clustered before the split**, so the three arms partition the parent's events exactly. The UP arm of the TOP stall is the scored event set.
- **Control:** every session of the same series and period that is **in the same trend state** as the arm and is not the flag session or one of the 20 sessions after any raw flag (the parent's backwards-only exclusion). So the UP arm is compared with ordinary uptrend sessions, never with all sessions.
- **Knowable when:** the close of session i. The outcome window starts at that close. Entering there is not claimed to be tradable (section 7).
- **Outcomes:** `Z_h` = ln(C_{i+h}/C_i) / (σ250(i) √h), h in {20, 40, 60} (40 is new; same unit as the parent). `LV_20` = ln(realised sd over i+1..i+20 / realised sd over i−59..i).
- **Pooled effect** = event-weighted mean over series of (mean outcome at the arm's events − mean outcome at the arm's controls), same period; the parent's estimator with the arm mask on both sides.
- **Placebo:** B random circular rotations of each series' raw flags, independent per series (100 to N−100 sessions); **the arm is read at the rotated position**, so the placebo asks whether a stall is special given the trend state, with the same number of same-state controls.
- **Sample / split:** discovery 2000-01-03 → 2012-12-31; **holdout 2013-01-01 → 2026-08-21**, halves 2013–2019 and 2020–2026-08-21. Events are assigned by flag date. The scored cell is read on the holdout; the discovery sign is gate (b).
- **Instruments:** the parent's 30 (SPX, NDX, RUT, DJI, DAX, FTSE, N225, HSI; XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLU, XLB; gold, silver, copper, WTI; EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD; TLT; BTC), reported separately and pooled.
- **Positive control (method lesson #1, from outside the pipeline):** synthetic driftless geometric random walks (daily log-return sd 0.01) on the 30 real calendars, run through the exact pipeline. Known zero: 16 worlds in `power.mjs` gave T1 +0.0135 (SE 0.0073), T2 +0.0248 (0.0070), T3 +0.0266 (0.0071); a second, independent 24-world check of the same estimator (seeds 5001–5024) gave h = 20 **+0.0012 (SE 0.0063)** and h = 40 **+0.0058 (0.0066)**, with the UP-state mean, the TOP-event mean and the same-state control mean each within 2 SE of zero. The first batch was a chance run, but the two together leave the estimator's known-zero at **about +0.01 or less**, so **gate (a) carries a +0.02 allowance** (below). Planted at the bar (world 1): T1 +0.159 for +0.15, T2 +0.147, T3 +0.193, T4 −0.109 for −0.10, M1 −0.126 for −0.15: the pipeline recovers a planted effect.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| **T1** (scored) | TOP stall above a rising SMA200 → 20-session return (z) **higher** than same-state controls? | **Null.** The parent's unconditioned +0.05 was itself within chance (placebo 92nd percentile), and the same-state control removes the uptrend drift that part of it was. Point estimate expected between 0 and +0.05; a pass would surprise me. |
| T2, T3 (reported) | The same at 40 and 60 sessions | Null; the parent's 60-session cell was −0.004. UNDERPOWERED by design at the 0.15 bar (section 5), so reported only. |
| T4 (reported) | TOP stall above a rising SMA200 → next-20 realised vol vs trailing 60: **lower** (a quiet consolidation)? | Small negative, as the parent's −0.03 (if the reset is a pause, its aftermath is a little calmer). |
| T5 (reported) | TOP stall **below a falling** SMA200 → 20-session return lower? | Too rare to say (35 events). Reported for completeness. |
| **M1 (THE MIRROR**, reported) | BOTTOM stall below a falling SMA200 → 20-session return **lower** than same-state controls (the claim run backwards: "consolidated and wants to go lower")? | Null. UNDERPOWERED by design (MDE 0.26), so it cannot be scored; its sign and interval are reported beside T1. |
| M2 (reported) | BOTTOM stall above a rising SMA200 → 20-session return higher (a dip in an uptrend)? | Null; 74 events. |

**THE GATE** (T1 is VALIDATED only if all hold, on the holdout): (a) the pooled effect is positive and the 95% bootstrap interval's **lower edge is above +0.02** (zero plus the synthetic-zero allowance from section 3); (b) the discovery effect is positive; (c) both holdout halves (2013–2019, 2020–2026-08-21) are positive; (d) one scored cell, no family correction; (e) the real holdout effect is above the 95th percentile of the rotation placebo (B = 500); (f) the effect stays positive leaving any one of the 30 series out (a failure demotes to CONTEXT).
**The NULL / UNDERPOWERED split, written down this time** (the parent's A1): if the gate fails, T1 is **NULL when the interval's upper edge is below the +0.15 bar** (the claim is one-directional: a rise of the bar's size is ruled out), and **UNDERPOWERED** otherwise. An interval whose lower edge is above +0.15 while the gate fails elsewhere is UNDERPOWERED with the note "passes size, fails stability".
**Material size:** the bar is 0.15 of a typical 20-session move, the parent's. A cell that passes the gate but is smaller than the bar is VALIDATED and labelled "small"; nothing live without |t| ≥ 3 and a forward record.

## 5. Power — what this design can and cannot find (required)

Design numbers only (`scripts/roc-stall-trend-filter/power.mjs`, `analysis/output/roc-stall-trend-filter/power.json`; no outcome at a real event was read). Event counts are the parent's de-clustered flags split by trend state; the placebo SD is the sd of the pooled effect over 200 rotations of each series' flags on the holdout, the arm read at the rotated position; MDE = 2.8 × that sd (80% power, two-sided α 0.05).

| Cell | n discovery | n holdout | Placebo mean | Placebo SD | **MDE** | Bar | Verdict |
|---|---|---|---|---|---|---|---|
| **T1** TOP · UP · Z20 | 447 | 666 | −0.006 | 0.0509 | **0.143** | 0.15 | **POWERED** (thin margin) |
| T2 TOP · UP · Z40 | 447 | 666 | −0.006 | 0.0568 | 0.159 | 0.15 | UNDERPOWERED by design → reported |
| T3 TOP · UP · Z60 | 447 | 666 | −0.004 | 0.0583 | 0.163 | 0.15 | UNDERPOWERED by design → reported |
| T4 TOP · UP · LV20 | 447 | 666 | −0.002 | 0.0190 | 0.053 | 0.10 | POWERED, reported (not scored: the claim is about returns) |
| T5 TOP · DOWN · Z20 | 35 | 35 | −0.012 | 0.0848 | 0.237 | 0.15 | UNDERPOWERED by design → reported |
| M1 BOT · DOWN · Z20 (mirror) | 296 | 390 | +0.002 | 0.0932 | 0.261 | 0.15 | UNDERPOWERED by design → reported |
| M2 BOT · UP · Z20 | 65 | 74 | +0.012 | 0.0571 | 0.160 | 0.15 | UNDERPOWERED by design → reported |

- Only T1 clears its bar, by 0.007. That is why it is the single scored cell: adding T2 or T3 to the scored family would push T1 under the bar through Holm, and the question (does the reset pay inside a trend) is answered at the parent's primary horizon.
- The UP arm's holdout events by group: indices 195, sectors 242, commodities 68, FX 123, bonds 17, bitcoin 21. Sectors and indices carry the weight; the per-group split is reported with BH (section 6).
- The mirror cannot be scored (MDE 0.26 against 0.15): a BOTTOM stall below a falling 200-day has far fewer sessions in its control state and a wider spread. It is reported for its sign only.
- Session share in the holdout: UP 57%, DOWN 25%, MIXED 18%, so same-state controls are plentiful for the UP arm.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cell:** T1 on the holdout. One cell, no family correction; the gate is conjunctive.
- **Reported cells** T2–T5, M1, M2: effect, interval, halves and placebo percentile each, with their MDE beside them; BH q = 0.10 across the six as a chance baseline; no pass/fail weight. A reported cell that survives BH is a candidate for its own prereg, never a result.
- **Disaggregation (BH q = 0.10 with `chanceBaseline`):** T1 per series (30), per group (6), per holdout year (14).
- **Descriptive, cannot change a verdict:** the MIXED arm; the UP-minus-DOWN difference for the TOP stall; T1 with SMA100 in place of SMA200; T1 with a 40-session slope window in place of 20; T1 against the parent's **all-session** control (to show how much of the parent's +0.05 was uptrend drift).
- **Variants tried:** exactly the ones above. The 200-session average, the 20-session slope, the 0.80 / 0.25 stall thresholds and the 20-session de-clustering were fixed before any number was read; no other threshold will be run.
- **Promotion bar:** |t| ≥ 3 and a forward record before anything live.

## 7. What this does NOT test (required)

- **Why anything happens.** Holder frustration and positioning are not observed in prices.
- **Tradability.** Signal-close entry, no costs, no slippage, Yahoo closes, front-future roll gaps.
- **Visser's own stack.** He combines the reset with company fundamentals, catalysts and X sentiment on single stocks; this desk has none of that data (the intake note says so). The test is of the price rule alone on indices, sectors, commodities, FX, bonds and bitcoin.
- **Direction on any single market on any given day.**
- **A fresh sample.** The holdout was opened by the parent; see section 2.

## 8. What each verdict changes (required)

- **VALIDATED:** ledger entry (effect, interval, MDE, the same-sample caveat in `result`); the instrument card may carry a **"consolidating in trend"** context line in range-and-drift wording only ("after a reset inside an uptrend, markets drifted on by about X of a typical move over 20 sessions, n = …"), never a direction call; a forward panel on the Momentum & rate-of-change board; nothing live until |t| ≥ 3 and the forward record agrees. Lesson for the intake file: Visser's filter has a price footprint.
- **NULL:** ledger entry; the research-director agenda **stops carrying the ROC stall in any form** (Q12's own "if no"); the intake note's claim row moves from PARTLY ON FILE to ON FILE with this id; the board says the 200-day filter adds nothing.
- **UNDERPOWERED:** ledger entry as such, with the n that the bar would need; the agenda drops the card unless the owner wants more series.
- Whatever the verdict, the descriptive line "how much of the parent's +0.05 was uptrend drift" goes in the RESULTS.

## Amendments

(none yet)

## RESULTS

See `analysis/output/roc-stall-trend-filter/RESULTS.md` (run 2026-11-18). T1 **NULL**: +0.040 [-0.063, +0.140] against same-state controls, 666 events, placebo 81st percentile; the interval's upper edge is below the +0.15 bar, so a rise of the size the claim needs is ruled out. Reported: T4 (a calmer month after a reset inside an uptrend, -0.057 [-0.089, -0.024]) survives BH as a candidate only. Banked as `roc-stall-trend-filter`.
