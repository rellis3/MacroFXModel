# gold-line-target-stop: results

**Setup**
- Prereg: `forge/GOLD_LINE_TARGET_STOP_PREREG.md` (pushed fea07968 before any run). Scripts: `scripts/gold-line-target-stop/`
  (`widths.py`, `run.py`). Seed 20261127.
- **Entry:** the `gold-band-fade-stop` arm-then-retest mechanism, unchanged. **Lines:** shadow N7_ALL OH/OL at P75 and P90.
- **Grid:** 36 cells = stop f × P90 distance (f = 0.15 / 0.25 / 0.35) × 6 targets × break-even at +1R on/off.
- **Data:** GC M1 unadjusted 2020 → 2026-08-21 (primary). OANDA XAU_USD for non-VWAP targets. Then 17 other NT8 futures.
- **Fills and costs:** pessimistic fills. Costs always on: GC 1 tick in, 1 tick out on non-target exits, $0.12
  commission; other futures 1 tick in, 1 tick out, 1 tick commission.
- **Positive control:** the parent's A2 rebuilt exactly (+0.05479R, 936 trades, identical arm/chase/cancel/fill counts). PASS.

## Part G: gold (36 cells, BH q = 0.10)

| Stop | Cells net positive | Range of mean net R | Verdicts |
|---|---|---|---|
| **0.15 × P90** | **12 / 12** | +0.022 to **+0.112** | 12 UNDERPOWERED |
| 0.25 × P90 | 0 / 12 | −0.052 to −0.019 | NULL |
| 0.35 × P90 | 0 / 12 | −0.082 to −0.047 | NULL (several CIs below 0) |

**Best cell (the gold-selected cell):** f 0.15, target VWAP + 0.5σ_v, BE off.
- Mean net R: **+0.112 [+0.018, +0.185]** on 957 trades.
- Halves: +0.034 / +0.166. Above the shuffled-lines p95 (+0.066).
- Target reached on 26% of trades.
- By year: +0.03 / +0.00 / +0.08 / +0.17 / +0.28 / +0.04 / +0.17 (2020 → 2026).
- **Fails BH over 36 → UNDERPOWERED.** No gold cell is VALIDATED.

Decomposed:
- **Stop size is the whole story.** Every tight-stop cell is positive and every wider-stop cell is negative, whatever
  the target.
- **Targets matter little.** Within the 0.15 stop, the VWAP bands (T1/T2) lead, but the spread between targets is
  smaller than one CI.
- **Break-even makes no consistent difference** (±0.02R).
- **Gold CFD check:** P50 and open targets slightly positive with the tight stop (+0.012, +0.020) and negative otherwise.

## Part W: the gold-selected cell on the other 17 futures (pre-registered replication)

DE30 has no shadow widths (closed 22:00–24:00 London, as in `calc-upgrades-wide`), so 16 instruments are scored.

| | Pooled mean net R [90% CI] | Halves | Shuffled-lines p95 | Share positive | Verdict |
|---|---|---|---|---|---|
| f 0.15 · VWAP + 0.5σ · BE off | **−0.063 [−0.081, −0.043]** | −0.070 / −0.057 | −0.031 | 3 / 16 | **NULL** |

- **Per instrument:**
  - positive: PLATINUM +0.057, US30 +0.035, COPPER +0.009;
  - negative: NQ −0.056, SPX500 −0.039, US2000 −0.021, WTI −0.057, BRENT −0.061, SILVER −0.146, EURUSD −0.035,
    GBPUSD −0.079, AUDUSD −0.051, NZDUSD −0.046, USDCHF −0.047, USDJPY −0.210, USDCAD −0.241.
- **By class:** index −0.021, metal (excluding gold) −0.032, energy −0.059, FX −0.101.
- **All 36 cells, pooled:** every one is negative, with its CI below 0 (−0.034 to −0.079).
- **The real lines do worse than the shuffled lines** (−0.063 vs a placebo p95 of −0.031). The loss is not only
  costs: the forecast lines carry no fade edge off gold.

## Answer

**On gold:** a tight stop (0.15 × the P90 distance) with a VWAP-band target leans positive, about +0.1R a trade, in both
halves and every year. It doesn't survive the 36-cell correction, so it is **UNDERPOWERED**.

**On everything else:** the same rule loses about 0.06R a trade, with confidence, and so does every other cell.
**NULL.**

**Reading:**
- The positive gold result does not carry to other markets. Either it is specific to gold, or it is the best of 36 cells
  on one market (a search artefact).
- The replication says the second is the safer bet. The pre-registered mirror fails: the lines are not doing the work
  across markets.

**Graded weight:**
- **Against:** the arm-then-retest fade at the OH/OL lines as a cross-market system.
- **Weak for:** gold with a tight stop. That needs a forward / post-lockbox record before anyone trades it.
