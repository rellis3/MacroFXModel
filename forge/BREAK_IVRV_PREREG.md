# Break trades when implied vol is rich — pre-registration

Committed 2026-10-02. Lead from forge/ASYMMETRIC_TRADES_PREREG.md (descriptive split, after the results were seen):
BREAK trades on the 7 CVOL instruments made +0.04 to +0.17R per trade in the top third of IV ÷ RV (−0.08 to −0.18R in the
bottom third). Every year of history has been seen, so this test cannot use a clean holdout in time. It uses checks the
lead was NOT shaped on, and it fails unless all of them hold.

## Fixed definition (no re-tuning)
- Trades: the BREAK trades already built (asym_build.mjs, entries 00:00–10:00 London), cells 0.1σ/0.2σ stop × 5R/10R
  (the far-level cells are excluded: 3,102 and 310 trades).
- Condition: IV ÷ RV in the top third, edges fixed from 2016–22 (the same edges as the split).
- Primary metric: net R per trade averaged over the 4 cells.

## Checks (all must hold)
1. **Independent implied vol.** Replace CVOL with the settlement-built `iv30` (oi_research_book/data/iv_daily_*.parquet,
   6 FX pairs, 2020-09 →; no gold), same RV, top third with edges from 2020–22. Net R > 0.
2. **Instruments.** Net R > 0 on at least 5 of the 7 CVOL instruments individually.
3. **Years.** Net R > 0 in at least 7 of the 10 calendar years 2016–2025.
4. **Mechanism.** The bottom third must be below the top third in every one of the 4 cells.
5. **Not the trend.** Net R > 0 separately for longs and for shorts.

PASS = 1–5 all hold. A PASS makes it a candidate for a forward paper record (live CVOL needed; the stored file is a
static snapshot), not a trading rule.
