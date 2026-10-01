# Trading the reaction after the touch — pre-registration

Committed 2026-10-01 before any number below was computed. Follows forge/DIVERGENCE_REACTION_PREREG.md: 15 minutes
after a vol-line touch, price back inside by > 0.1σ reaches the line behind first 48% (London 57%) and the next line
out 23%, but a fade from there to the line behind loses (target closer than the stop). Two pre-registered follow-ups.

## Population
Every non-same-bar pass of the Fade/Continue Book. Instruments: the 16 FX/gold pooled (primary); the six indices
(NQ, SPX, DOW, US2000, DE30, UK100) pooled as an independent confirmation set. Spread = the book's cost per pair.

## A — the tighter fade
- Trigger: at the decision bar (first M1 bar at touch + 15 min; secondary 5 and 30 min), price's last close is back
  inside the line by > 0.1σ and the touch's continue/fade race has not resolved.
- Entry: open of the decision bar, in the fade direction.
- Stop: the furthest price reached beyond the line between the touch and the decision, plus a buffer of
  **0.05σ** or **0.15σ**.
- Target: **halfway** to the line behind, **the line behind**, **1R** or **2R** (R = entry-to-stop distance).
- Exit at the London day's last bar if neither is hit; if one bar hits both, the stop counts.
- Grid: 2 stops × 4 targets × 3 decision times = 24 cells. Net R per trade after spread.
- **PASS:** net R > 0 in 2016–22 AND 2023–26, the pooled t-test survives Benjamini–Hochberg 10% over the 24 cells,
  AND the same cell has net R > 0 on the index set. Sessions reported, not tested.

## B — the cut rule for continuation trades
- Base trade: the book's follow trade at the touch (entry at the line, target next line out, stop the line
  behind, exit at the day end).
- **Rule B1:** at touch + 15 min, if the trade is still open and price is back inside by > 0.1σ, exit at the
  decision bar's open.
- **Rule B2:** B1, plus exit at the confirmation bar's open of a Cipher B divergence at the line (OB 45, M5;
  forge/VMC_DIVERGENCE_INDICES_PREREG.md) if the trade is still open (FX/gold and indices that have it).
- Metric: mean net R per trade (rule) − mean net R per trade (hold), over all passes. Day-bootstrap 95% CI.
- **PASS:** CI above 0 and the improvement > 0 in both halves, on the primary set AND the index set.
- This tests trade management only; it does not make the follow trade profitable unless the numbers say so.

Self-check: the trigger, entry, stop distance and B1 exit decision must be unchanged under future-scramble from
the decision bar.
