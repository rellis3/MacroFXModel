# gex-range-gold — results

Prereg: `oi_research_book/GEX_RANGE_GOLD_PREREG.md` (registered 2026-11-06 in commit 53b8b845; amendments A1 029fcd76 and
A2 33ec09b9, both before the run). Run 2026-11-06, seed 20261106, B = 10,000. Branch `gex-range-gold`.
Script `oi_research_book/scripts/34_gex_range_gold.py`; output `oi_research_book/data/results/gex_range_gold.json`.
Ledger id: `gex-range-gold`.

## Verdict: UNDERPOWERED

Gold's near-surface (DTE ≤ 45) gamma sign, with New York-close sessions and OI(D) → session D+2, shows **no
short-gamma range widening**: vol-matched ΔDR **−0.031 [−0.209, +0.148]**, p 0.75, n = 866 (156 short-gamma, 710 long).
The registered gate fails (ΔDR below +0.05, p above 0.05, **0 of 4** spec cells positive, and the all-shift placebo
gate fails: the 95th percentile of the label-shift placebos is +0.176, and the real value sits at the 26th percentile).
The NULL rule needs the interval to lie below +0.10 and the upper end is +0.148, so the cell is **UNDERPOWERED**,
not NULL. What the interval does rule out: an NQ- or ES-sized effect (+0.29 to +0.38) is far outside it.

## Scored cell

| Cell | n | Estimate (vol-matched ΔDR) | 95% CI | MDE | Pass bar | p | Cell verdict |
|---|---|---|---|---|---|---|---|
| Gold, near / rv20, honest timing | 866 (156 / 710) | −0.031 | −0.209 to +0.148 | about 0.25 (see below) | +0.05 gate, +0.10 operational | 0.753 | UNDERPOWERED |

Other spec cells (all four must be positive; none is): near/atr14 −0.043, all/rv20 −0.036, all/atr14 −0.029. Raw ΔDR:
near/rv20 −0.015; DR short 1.000, DR long 1.015 (long gamma is **not** quieter on gold; versus 1: p 0.66).

## Controls

- **Pipeline check (Q2, NQ reference): PASS.** The same script reproduces the banked NQ near/rv20 vol-matched ΔDR
  **+0.28799 vs banked +0.28799** (tolerance ±0.005), so the gold run uses the same code path as the banked work.
- **Injection:** +0.15 added to short-gamma DR is recovered exactly (0.150). **No-lookahead:** pass.
- **Placebo gate: FAIL**, for the reason that matters here: the placebo distribution is wide (all-shift sd 0.079,
  95th percentile +0.176), because the short-gamma arm is small (18% of days). A real effect would need to exceed +0.176
  to pass; the real estimate is −0.031.

## Deviations from the prereg

A1 (script matches the text) and A2 (window ends 2026-04-15 because Databento's statistics requests returned 504s from
2026-04-16 on) are PRE-RESULTS. **One thing differs from A2's projection:** A2 projected an MDE of about 0.13 from NQ's
raw-estimator SE (0.048 at n = 866). The measured bootstrap SE of the vol-matched estimator on gold is **0.091**, so the
realised MDE is about **0.25**, roughly twice the projection. The short arm is smaller and more dispersed than NQ's
(156 vs 230 sessions; gold's gamma sign has been mostly long since mid-2024). The verdict does not depend on this
(the rule uses the interval), but "an NQ-sized effect is detectable" holds only for effects of about +0.25 and above.

## Descriptive (not part of the verdict)

- Ladder (vol-matched ΔDR): original UTC pipeline +0.019, NY-close with next-session target +0.015, scored −0.031.
  Nothing on gold moves with the timing fixes; NQ's ladder was +0.32 / +0.36 / +0.29.
- Halves (split 2024-07-30): −0.202 first, +0.256 second. The short arm is 121 sessions in the first half and **35** in
  the second, so the second half is close to noise. Neither half is a result.
- Gold has 156 short-gamma OI dates in 866 (18%) on `near` and 62 in 866 on `all`.
- Not run: the ±0.5% spot-shift basis sensitivity named in the prereg. It would need the futures-spot basis, which
  this study does not have; it stays open.

## What this changes

- Ledger `gex-range-gold`: **underpowered**. The G2 "long gamma is quiet" relation has not been seen on gold; it
  stays an equity-index finding (NQ, ES). Say "gold shows no sign of it in the CME monthly book, and an effect as big as
  NQ's is ruled out; an effect up to about +0.15 is not".
- The OI Profile's gold gamma column remains a picture of the book. Nothing live changes.
- The held-out tail (2026-04-16 → 2026-08-21, A2 item 4) stays open if Databento serves it; it would add about 90
  sessions, which does not change the answer much. Weekly and Friday gold options (not in `OG.OPT`) are the bigger gap.
