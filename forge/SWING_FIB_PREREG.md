# Swing-based Fibonacci retracements at the vol lines — pre-registration

Committed 2026-10-02 before any number below was computed. Owner's question: fib retracements pulled from a swing high and low
(0.618–0.65 golden pocket, 0.786, 0.886) lining up with a vol line. The previous-day-range golden pocket and 1.272/1.618
extensions were null (forge/CONFLUENCE_LEVELS_PREREG.md); this uses INTRADAY SWINGS instead, and the deeper 0.786 / 0.886.

## Levels (bars before the pass bar only)
H1 bars (clock-aligned, completed). Swing high/low = fractal with 3 bars each side, confirmed only once the 3rd right bar has
closed. The last impulse = the most recent confirmed swing pair (a high then a low, or a low then a high) ending within the
last 72 H1 bars. Retracement levels of that impulse measured from its end: 0.618–0.65 (zone), 0.786, 0.886. Both the impulse
direction and the vol line side are kept so the retracement is the natural pullback level for a touch going against the impulse.
Placebo: the same levels shifted by a random 0.15–0.5σ (seeded per date), as in the confluence test.

## Tests (same as the confluence test)
- At the line = level within 0.05σ of the touched vol line. T1 = within-cell (line family × London hour × range used) continue
  difference at-vs-not, minus the placebo's; day-bootstrap 95% CI; both halves. REAL = CI excludes 0 and halves agree.
- T2 = fade R at the line > 0 both halves (and follow R), BH 10% over {3 level types} × 2 directions. 16 FX/gold.
