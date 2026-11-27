# gold-band-fade-stop: results

**Setup**
- Prereg: `forge/GOLD_BAND_FADE_STOP_PREREG.md`, with amendment A1 (arming-bar fills). Script:
  `scripts/gold-band-fade-stop/run.py`. Scenario test: `test_scenarios.py` (all 5 pass). Seed 20261127.
- The mechanism is the ForecastBandFade.cs one, rebuilt from the owner's PDF (there is no source file):
  - **Entry:** touch a P75 or P90 forecast HIGH or LOW by 10% of the stop. A stop order then arms at the line and fills
    on the retest.
  - **Exits:** the stop sits at the line ± the stop distance, and the target is the session open. The order is
    cancelled if price runs 1.2× the stop past the line, and it chases to the further line.
  - **Assumed (the PDF doesn't say):** flat at 22:00 London, one position at a time, and each line used at most once
    a day.
- **Data:** GC futures M1 (unadjusted), 1,659 sessions over 2020 → 2026-08-21. OANDA XAU_USD is the replication
  (1,699 sessions).
- **Fills and costs:** pessimistic fills inside each bar are primary. Costs on the futures are 1 tick of slippage in,
  1 tick out on a stop or time exit, and commission; on the CFD, $0.40 per round trip.
- Results are in R (net R = (P&L − cost) / stop).

## Verdicts (pre-registered)

| Arm | Stop | Lines | Trades | Mean net R [90% CI] | Halves 2020–22 / 2023–26 | Shuffled-lines placebo (mean / p95) | CFD | Verdict |
|---|---|---|---|---|---|---|---|---|
| **A1** (the PDF as written) | $7.50 fixed | export | 1,021 | **−0.025** [−0.097, +0.040] | +0.012 / −0.054 | −0.041 / +0.033 | −0.068 | **NULL** |
| **A2** | $7.50 fixed | shadow (N7) | 936 | **+0.055** [−0.029, +0.112] | +0.040 / +0.065 | −0.025 / +0.034 | +0.019 | **UNDERPOWERED** |
| A3 | 0.375 × P90 distance | export | 968 | −0.030 [−0.077, +0.019] | +0.004 / −0.055 | −0.040 / −0.004 | −0.077 | **NULL** |
| A4 | 0.375 × P90 distance | shadow | 903 | −0.069 [−0.113, −0.008] | −0.028 / −0.098 | −0.038 / −0.003 | −0.083 | **NULL** |

- BH over the 4 arms: no arm passes (A2 one-sided p = 0.19).
- A2 is the only arm that meets every condition except the CI and BH:
  - both halves are positive;
  - it is above the shuffled-lines p95;
  - the CFD is positive.

## Decomposed (prereg §7: the parts against their own baselines)

| Part | What it shows |
|---|---|
| **Arm-and-retest filter** vs a raw fade at first touch (PL2) | Helps in every arm: A1 −0.025 vs raw −0.066, A2 +0.055 vs −0.021, A3 −0.030 vs −0.062, A4 −0.069 vs −0.081. **About +0.01 to +0.08 R per trade.** The cancel avoids the breakout days. |
| **The forecast lines** vs another day's lines (PL1) | Small: the real lines beat the shuffled ones by +0.01 to +0.08 R. They clear the shuffled p95 only on the shadow lines with the fixed stop (A2). |
| **Target = the open** | Too far. Only **9.5%** of A1 trades reach it; **37%** are still open at 22:00, and 54% are stopped. Wins average +1.6 R, mostly time exits. A fixed $20 target gives −0.001 R (descriptive). |
| **$7.50 fixed stop** | The stop rate climbs with the price of gold: 41–47% of trades in 2020–23, **69% in 2025 and 80% in 2026**. Mean R by year runs +0.07 (2020) to −0.13 (2026). |
| **σ-scaled stop** (A3/A4) | Fewer stop-outs (34%), but the median stop grows to $20–38 in 2025–26. Wins shrink to +0.9 R. No better overall. |
| **Intrabar ordering** | Optimistic fills change little (A1 −0.013, A2 +0.075), so the verdicts don't hinge on it. |
| **P50 lines added** | Worse (−0.048 R, 2,385 trades). |

By line, A1: long at the P75 LOW +0.022, short at the P90 HIGH +0.008, short at the P75 HIGH −0.061, long at the P90
LOW −0.076. They split both ways with no pattern.

## Answer

As written in the PDF (export lines, $7.50 stop, target the open), the mechanism loses slightly after costs: −0.025 R
per trade, with the 90% CI ruling out an edge above +0.04 R. **NULL.**

- **What it does well:** the arm-then-retest entry with the cancel is better than a plain fade at the line in every
  version. That part is worth keeping.
- **What hurts it:**
  - **The $7.50 stop no longer fits gold.** 80% of 2026 trades are stopped out.
  - **The open is too far as a target.** Only 1 in 10 trades reaches it.
- **On the new shadow lines,** with the same rules, it leans positive: +0.055 R, both halves positive, CFD positive,
  above the shuffled-lines placebo. But the CI crosses 0. **UNDERPOWERED.** That's a reason to forward-log it, not to
  trade it.

**Graded weight:**
- against the document's version as an edge;
- weak-for the arm-and-retest filter as an entry component;
- weak-for the shadow lines being the better lines to fade, consistent with `gold-calc-upgrades`.

**Next, if pursued:** a new prereg on the forward or post-lockbox record. Shadow lines, arm-and-retest entry, and a
nearer target (the P50 line on the same side, or a time-limited exit) chosen before the data is seen.
