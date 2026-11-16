# roc-stall-50d — results (run 2026-11-16, holdout opened once)

Prereg: `forge/ROC_STALL_50D_PREREG.md` (commit 4799657f, before any outcome at a real event was computed). Run script `scripts/roc-stall/run.mjs` (committed in 65e04ba6 before the run). Seed 20261116. Data: 30 long-history daily series, sha256 in `data_manifest.json`. Everything in `results.json`.

## The answer in one paragraph

The educator's claim, as a price signature, is **not supported**. After a market ran up hard and then went nowhere for 50 sessions (a TOP stall), the next 20 sessions were **not worse**: +0.05 of a typical 20-session move above ordinary sessions [-0.05, +0.15] (the claim needs a fall), and the next month's realised volatility was **not higher** (-0.03 in log terms [-0.07, +0.00]; if anything a little calmer). Over 60 sessions the effect is zero (-0.00 [-0.14, +0.12]). None of the six pre-registered cells validates. The mechanism the educator describes (holders getting frustrated and selling) is about positions and psychology and **cannot be seen in prices**; what this test can say is that the price footprint it would leave is not there on 30 markets over 13 years.

## The six scored cells (holdout 2013-01-01 to 2026-08-21; units: z = a typical h-session move; LV = log of next-20 realised vol over the last 60)

| Cell | Question (registered direction) | Discovery | **Holdout [95% CI]** | Halves 2013-19 / 2020-26 | p, two-sided (Holm bar for the smallest: 0.0083) | MDE | Bar | **Verdict** |
|---|---|---|---|---|---|---|---|---|
| C1 | TOP stall → 20-session return, lower? | +0.114 | **+0.050 [-0.046, +0.151]** | +0.035 / +0.057 | 0.32 | 0.12 | 0.15 | **UNDERPOWERED** (see note) |
| C2 | TOP stall → 60-session return, lower? | +0.073 | **-0.004 [-0.141, +0.122]** | +0.018 / -0.045 | 0.95 | 0.14 | 0.15 | **NULL** |
| C3 | TOP stall → next-20 vol, higher? | -0.045 | **-0.031 [-0.066, +0.003]** | -0.027 / -0.036 | 0.078 | 0.045 | 0.10 | **NULL** (wrong sign: a little calmer) |
| C4 | BOTTOM stall (mirror) → 20-session return, higher? | -0.032 | **+0.036 [-0.089, +0.161]** | +0.035 / +0.070 | 0.58 | 0.135 | 0.15 | **UNDERPOWERED** |
| C5 | ROC_50 acceleration, bottom decile → 20-session return, lower? | +0.111 | **+0.066 [-0.075, +0.195]** | +0.022 / +0.132 | 0.34 | 0.097 | 0.15 | **UNDERPOWERED** (wrong sign) |
| C6 | ROC_50 acceleration, bottom decile → next-20 vol, higher? | +0.090 | **+0.069 [+0.014, +0.124]** | +0.084 / +0.047 | 0.0135 | 0.031 | 0.10 | **UNDERPOWERED** (see note) |

Zero cells VALIDATED. Event counts (holdout, de-clustered): C1/C2/C3 792/783/792 (30 series), C4 587, C5/C6 1,076.

- **C1.** The registered rule calls NULL only when the whole 95% interval lies inside the bar on both sides. C1's upper edge is +0.1507 against a bar of 0.15, so by that letter it is UNDERPOWERED, not NULL. Read plainly: a fall as large as the claim needs is **ruled out** (the lower edge is -0.046), and the point estimate points the other way. The shift placebo puts the real +0.05 at the 92nd percentile of rotated flags, so the small positive is within what chance gives.
- **C6.** The one nominally significant registered cell: after ROC_50 decelerates sharply, the next month's realised vol is about 7% higher than ordinary sessions, in both halves of the holdout, beating the rotated-flag placebo (100th percentile) and keeping its sign leaving any one series out. It fails **Holm** across the six cells (p 0.0135 against the 0.0083 the smallest p needs), and its upper edge (+0.124) is above the 0.10 bar, so it is not VALIDATED and cannot be called NULL. The obvious reading is mechanical: a sharp fall in 50-session momentum is a sell-off, and realised vol is already rising when it is flagged.
- **Concentration.** C1 is negative in 8 of 14 holdout years and positive in 6 (2021 +0.26 and 2022 +0.40 against 2023 -0.32 and 2025 -0.19): no stable effect. C6 is positive in 9 of 14 years and in the large equity series (S&P, Nasdaq, Dow, tech, health care, industrials, discretionary 0.15 to 0.22), and negative in gold and silver.

## Descriptive facts (not scored; Benjamini-Hochberg q = 0.10 over 21 horizon cells: 6 pass against about 2 expected by chance)

- **How often and how long.** A TOP stall is rare: about **1.9 per series-year** after de-clustering (holdout), and the raw flag lasts about **2.8 sessions**. After one, the 20-session move averages +0.157 z against +0.090 for ordinary sessions (the usual upward drift); realised vol is -0.089 against -0.058.
- **Nothing in the TOP stall survives BH** at any horizon (returns 5/10/20/60, vol 10/20/60).
- **After a market falls and then goes nowhere for 50 sessions (BOTTOM stall), the next 1 to 3 months are calmer** than ordinary sessions: vol ratio -0.10 (10 sessions), -0.11 (20), -0.15 (60), each with an interval clear of zero and surviving BH. Returns after it are unremarkable (+0.04 at 20 sessions). A candidate for its own pre-registration (the volatility-after-flat-bottom shape), not a result.
- **After a hard deceleration (ACCEL-down decile)**, the next 10 sessions are riskier (+0.13) and the next **60 sessions' returns are higher** (+0.14 z [+0.04, +0.25], BH-surviving; overlapping windows, upward drift not removed beyond the control): a bounce-after-sell-off shape. A candidate, not a result.
- **Sensitivity** (descriptive; cannot change a verdict): thresholds 0.70/0.90 and band 0.15/0.35, and the 20- and 100-session versions. The TOP stall never turns negative on returns; the ROC_100 version is +0.12 [+0.02, +0.23] at 20 sessions (more upward drift after a longer run, the opposite of the claim). The vol result stays zero-to-slightly-lower across variants.

## What this does and does not say

- It says: on 30 markets (indices, sectors, gold, silver, copper, oil, FX, bonds, bitcoin) over 2000 to 2026-08-21, a 50-session stall after a strong run does **not** mark weaker returns or a riskier month, so the educator's rule of thumb is not a sell signal here and not a risk flag.
- It does not say anything about **why** (frustration, positioning), tradability (no costs, front-future roll gaps, entry at the signal close), or any single market on any single day. The volatility-after-flat-bottom and the bounce-after-deceleration shapes are descriptive leads only.
- Design checks that held: the exact pipeline on synthetic random walks averages within ±0.013 of zero in every cell and recovers a planted effect of the bar; the control exclusion looks backwards only (A0, found before registering).

## Reusable candidates (never results)

1. BOTTOM stall → lower realised vol over 10 to 60 sessions (BH, all three horizons, interval clear of zero).
2. ACCEL-down decile → higher vol at 10 sessions and higher returns at 60 sessions (BH).
Each needs its own pre-registration on fresh data before it is anything more than a lead.
