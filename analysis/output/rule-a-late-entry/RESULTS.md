# rule-a-late-entry: results

**Prereg:** `forge/RULE_A_LATE_ENTRY_PREREG.md` (committed in `0f56f25c`, 2026-10-20). Run 2026-10-20, seed 20261020, B = 2000. Branch `main`. Ledger id: `rule-a-late-entry`.

## Verdict: NULL
**The registered gate failed on all three items.** Rich-day breaks first occurring between 10:00 and 13:00 London (the line unbroken before 10:00), with stop 0.2σ, target 5R, out at 22:00 and 2× spread costs:
- **Pooled:** n = 823, net R per trade **-0.100**, 95% CI [-0.260, +0.063].
- **Halves:** -0.101 (2020–23) and -0.098 (2024–26). Both negative.
- **Instruments:** 5/11 positive.

The interval excludes the +0.16R this design could detect (§5), so the result is NULL, not UNDERPOWERED.

## Scored cells
| Cell | n | Estimate | 95% CI | MDE | Pass bar | Cell verdict |
|---|---|---|---|---|---|---|
| Rich days, 10:00–13:00, 0.2σ / 5R | 823 | -0.100 | [-0.260, +0.063] | ≈ 0.16R | lower bound > 0; both halves > 0; ≥ 6 of 11 instruments | null |

## Controls
**Mirror (late breaks on non-rich days):** n = 1938, -0.185 [-0.292, -0.093], 1/11 instruments positive. So rich days are still less bad than other days after 10:00, but neither pays.

## Deviations from the prereg
None.

## Descriptive (not part of the verdict)
- **By instrument:** AUDUSD +0.13, EURUSD -0.21, GBPUSD -0.22, GOLD -0.32, NQ +0.27, SPX500 +0.21, US2000 -0.41, US30 +0.17, USDCAD +0.05, USDCHF -0.38, USDJPY -0.10.
- **By hour:** 10:00 -0.07R (n 255), 11:00 -0.28R (n 258), 12:00 +0.02R (n 310).
- **Rule A's other registered cells, late window:** 0.1σ/5R -0.242, 0.1σ/10R -0.185, 0.2σ/10R -0.072 (n 823).
- **The three US indices** (NQ, SPX500, US30) are positive in this window. That is post-hoc, on three instruments, and is not a finding.

## What this changes
- **Rule A keeps its 00:00–10:00 entry window.** The Decision Lab plan and the v3 Trade lines already stop at 10:00.
- **This is consistent with the exits study** (`backtest-data/decision-lab/EXITS_DECISION.md`): the edge needs a far target and time for the day to travel, and later breaks have less of both.
- **What would reopen it:** a new reason specific to the US open for indices (its own prereg, on fresh data).
