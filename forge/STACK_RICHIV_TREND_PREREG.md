# Stacking the H1 trend state and spread conditions on the rich-IV break rule — pre-registration

Committed 2026-10-02 before any number below was computed. Base: forge/BREAK_IVRV_PREREG.md (break trades on rich IV ÷ RV days,
mean R over 0.1σ/0.2σ × 5R/10R; +0.119R FX/gold, +0.071R indices). New input: forge/MACRO_TREND_WEEKDAY_PREREG.md section B found
that touches heading AGAINST the H1 EMA20/EMA50 trend continue +5.8pp (FX/gold) / +6.6pp (indices) more, both halves.

## Definitions (fixed)
- H1 (and H4) trend state at the break's signal bar, from completed bars only, exactly as htf_trend_build.mjs: +1 up, −1 down, 0 neutral.
  Signal time = London midnight of the day + the row's minute. "Counter" = break direction opposite to the H1 trend; "with" = same;
  "neutral" = no trend.
- Rich day: CVOL IV÷RV ≥ 1.27 (7 FX/gold), CBOE ≥ 1.53 (NQ, SPX, DOW, US2000). Same as the base.
- Spread condition (from the Q5 stress): the 0.2σ-stop variants only (half the spread share), and signals from 02:00 London (the
  00:00–02:00 window carries the widest spreads). Reported as a separate row, not combined with the trend row unless both pass.

## Tests
1. **Trend stack:** rich-IV breaks, COUNTER to the H1 trend vs ALL rich-IV breaks. PASS = counter mean R > all mean R in 2016–22 AND
   2023–26 on FX/gold, the same ordering on the indices, counter > 0 in both halves on both sets, indices counter SHORTS alone > 0,
   and the counter group's t-test survives Benjamini–Hochberg 10% across {counter, with, neutral} × {FX/gold, indices}.
2. **Spread conditions:** rich-IV breaks, 0.2σ stops, signal ≥ 02:00 — mean R vs the base's 4-cell mean, both halves, both sets.
3. **Both** (counter × spread conditions): reported; counts as a pass only if 1 and 2 pass individually.
4. Also reported, not tested: H4 instead of H1; the same split on the plain book race (already known: +5.8pp).
A pass is a candidate second rule for the paper record, after its own forward evidence — the live rule is not edited.
