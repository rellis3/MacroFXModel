# Combined continue and fade setups — pre-registration

Committed 2026-10-02 before any number below was computed. Combines the signals that each moved fade/continue on their own
(forge/IVRV_COT_PREREG.md: rich IV ÷ RV +4.4pp continue, crowded COT −2.7pp; the book: late-session exhaustion stalls 76%)
to see whether they stack into a trade on either side.

## Population
Every Fade/Continue Book pass on the 7 instruments with both CVOL and COT: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF,
gold. Same races and net R as the book. IV ÷ RV thirds fixed at 1.05 / 1.27; COT crowded = 156-week percentile ≥ 80 (long)
or ≤ 20 (short), usable from the Monday after release; both exactly as forge/IVRV_COT_PREREG.md.
"With the crowd" = the touch heads the crowded way (up line + crowded long, down line + crowded short); "against" = mirror.

## Setups (fixed)
- **CONTINUE:** IV ÷ RV rich (top third) AND the touch is against the crowd → FOLLOW.
  Also on the BREAK trades of forge/BREAK_IVRV_PREREG.md (mean of 0.1/0.2σ × 5R/10R) with the same two filters.
- **FADE:** IV ÷ RV cheap (bottom third) AND the touch is with the crowd → FADE.
- **FADE + exhaustion:** FADE AND the touch is at or after 17:00 London AND range used ≥ 0.8 of the median day.

## Pass (each setup on its own)
Net R > 0 in 2016–22 AND 2023–26; Benjamini–Hochberg 10% across the 4 setups; net R > 0 on at least 4 of the 7
instruments. Reported alongside: each filter alone and the no-filter baseline, to show whether the filters stack.
A PASS adds the setup to the forward paper record; it is not a trading rule.
