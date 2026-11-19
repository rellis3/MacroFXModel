# roc-stall-trend-filter — results (run 2026-11-18, holdout read once for this cell)

Prereg: `forge/ROC_STALL_TREND_FILTER_PREREG.md` (commit cf9e0ad0, 2026-11-18, before any outcome at a real event was computed). Run script `scripts/roc-stall-trend-filter/run.mjs` (commit 9ba96956, before the run). Seed 20261118, B = 2000 (month blocks), placebo B = 500. Branch `claude/signal-bot-bias-analysis-bwr1qv`. Ledger id: `roc-stall-trend-filter`. Data: the parent's 30 daily series re-fetched 2026-11-18 (`data_manifest.json`), window 2000-01-03 → 2026-08-21. Everything in `results.json`.

## Verdict: NULL

Jordi Visser's filtered rule, as a price signature, has **no footprint on these 30 markets**. A 50-session rate-of-change reset after a strong run, taken only when price is above a rising 200-day average, was followed over the next 20 sessions by **+0.040 of a typical 20-session move** more than ordinary uptrend sessions of the same market, 95% interval **[−0.063, +0.140]**, 666 events on the 2013 → 2026-08-21 holdout. The registered gate needed the interval's lower edge above +0.02 and the effect beyond the 95th percentile of rotated flags; it is at the 81st percentile (p 0.43). The interval's upper edge (+0.140) is below the +0.15 bar, so a rise of the size the claim needs is **ruled out** and, by the rule written in the prereg this time, the cell is NULL, not UNDERPOWERED (MDE 0.143). The estimate is the same as the unconditioned stall's (+0.050 in the parent), because 83% of the parent's stall events were already above a rising 200-day: the filter is close to implied by the stall, and it adds nothing.

## The scored cell (holdout 2013-01-01 to 2026-08-21; unit z = a typical h-session move)

| Cell | n (disc / hold) | Discovery | **Holdout [95% CI]** | Halves 2013-19 / 2020-26 | p (two-sided) | Placebo pct | MDE | Bar | Gate a b c d e f | **Verdict** |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 TOP stall above a rising SMA200 → Z20 vs same-state controls, higher? | 447 / 666 | +0.046 | **+0.040 [−0.063, +0.140]** | +0.016 / +0.080 | 0.43 | 81st | 0.143 | 0.15 | n Y Y Y n Y | **NULL** |

- Gate (a) fails (lower edge −0.063, needed > +0.02); (e) fails (81st percentile of 500 rotated-flag books, needed > 95th; the 95th sits at +0.092). The sign is stable in a weak sense: positive in discovery, both halves, and leaving any one series out (+0.019 to +0.061), which is what an upward drift of a few hundredths looks like, not an effect of the bar's size.
- **Disaggregation (BH q = 0.10):** per series 19 positive / 11 negative, **0 of 30** survive (3 expected by chance); per group **0 of 6**: indices +0.023 (193 events), sectors +0.055 (240), commodities +0.156 (67), FX −0.026 (123), bonds +0.015 (17), bitcoin +0.075 (21). By year the effect swings from −0.35 (2023) and −0.32 (2020) to +0.56 (2022) and +0.29 (2021): 8 of 14 years positive, no stable shape.

## Reported cells (descriptive, no pass/fail weight; BH q = 0.10 across the six: 1 pass, 0.6 expected)

| Cell | n hold | Discovery | Holdout [95% CI] | Halves | Placebo pct (registered direction) | MDE | Read |
|---|---|---|---|---|---|---|---|
| T2 UP arm → Z40 | 656 | +0.024 | −0.015 [−0.143, +0.106] | −0.013 / +0.012 | 45th | 0.159 | nothing at 40 sessions |
| T3 UP arm → Z60 | 653 | +0.002 | +0.011 [−0.102, +0.130] | +0.045 / +0.002 | 59th | 0.163 | nothing at 60 sessions |
| **T4 UP arm → next-20 realised vol vs trailing 60 (log), lower?** | 661 | −0.048 | **−0.057 [−0.089, −0.024]** | −0.052 / −0.066 | **100th** | 0.053 | **BH-surviving**: the month after a reset inside an uptrend runs about 5.5% calmer than ordinary uptrend sessions, both halves, beats every rotation. The parent's C3 (−0.031) pointed the same way. A candidate for its own prereg on fresh data ("the pause is quiet"), never a result |
| T5 TOP stall **below a falling** SMA200 → Z20, lower? | 35 | +0.360 | +0.280 [−0.016, +0.621] | +0.44 / +0.18 | 0.2nd | 0.237 | the **opposite** sign to the registered one, on 35 events: the rare stall in a downtrend was followed by a bounce. Too few events to be more than a note |
| M1 **MIRROR** BOTTOM stall below a falling SMA200 → Z20, lower? | 388 | −0.058 | −0.009 [−0.151, +0.127] | +0.012 / −0.020 | 57th | 0.261 | the claim run backwards shows nothing either |
| M2 BOTTOM stall above a rising SMA200 → Z20, higher? | 73 | +0.039 | −0.107 [−0.342, +0.138] | +0.004 / −0.128 | 3rd | 0.160 | a dip in an uptrend did not pay, 73 events |

## Controls

- **Rotation placebo** (500 draws, arm read at the rotated position): mean −0.005, sd 0.053, 95th percentile +0.092; the real T1 sits at the 81st percentile.
- **Known-zero positive control** (prereg §3): synthetic driftless walks through the exact pipeline, 40 worlds across two batches, +0.01 or less at every horizon; a planted +0.15 came back as +0.159. The +0.02 allowance on gate (a) came from this and did not decide anything: the lower edge is below zero anyway.
- **Concentration:** no series, group or year survives BH; the two best years (2021, 2022) are the post-COVID melt-up and the 2022 bear-market rallies, and the two worst (2020, 2023) sit next to them.
- **Same sample:** the holdout had been opened by the parent for the unconditioned stall. The split here was the educator's and was carded before any number was read, but the result is a conditional re-cut, not fresh data (prereg §2).

## Deviations from the prereg

None. No amendments.

## Descriptive (not part of the verdict)

- **How much of the parent's +0.05 was uptrend drift:** the UP-arm events against the parent's **all-session** control give +0.035 [−0.079, +0.146]; against **same-state** controls +0.040. So at the event-weighted level the choice of control moves the estimate by 0.005. Session-pooled, uptrend sessions do drift more (mean Z20 of non-flag sessions: UP +0.126, DOWN +0.072, MIXED +0.017, all +0.090), but the event-weighted estimator does not carry that gap, so the parent's +0.05 was not drift that the filter removes; it was, and is, a small positive within chance.
- **Mixed state** (neither clean arm): +0.116 [−0.113, +0.306], 96 events. Up minus down (T1 − T5) −0.24, on 35 down-arm events.
- **Sensitivity** (cannot change a verdict): SMA100 in place of SMA200 +0.069 [−0.025, +0.163] (715 events, discovery +0.091); a 40-session slope window +0.052 [−0.053, +0.156]. No variant reaches the bar or clears zero.

## What this changes

- The research-director agenda **stops carrying the ROC_50 stall in any form** (Q12's registered "if no"); the intake note's claim 3 moves from PARTLY ON FILE to ON FILE under this id.
- No card line. The desk may say: on 30 markets over 2013 to 2026, a 50-day rate-of-change reset inside an uptrend was followed by returns about the same as any other uptrend session; the "consolidating and wants to go higher" read has no footprint here.
- What it does not say: anything about Visser's own stack (single stocks, fundamentals, catalysts, X sentiment), which this desk has no data for; or why anything happens.
- **Reusable candidate (never a result):** T4, the quiet month after a reset inside an uptrend (−0.057 log vol ratio, both halves, beats every rotation), which agrees with the parent's C3. It would need its own prereg on fresh data; the only fresh data is the lockbox.
- What would reopen it: a forward record disagreeing, or a test on single names with the educator's full filter set.
