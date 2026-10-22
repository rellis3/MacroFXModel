# Trend-day filter and acceptance-retest entry for the rich-IV break rule — pre-registration

Committed 2026-10-02 before any number below was computed. Base rule: forge/BREAK_IVRV_PREREG.md (break of a Vol Forecast
line, 00:00–10:00 London, on rich IV ÷ RV days; mean R over 0.1σ/0.2σ stop × 5R/10R; the live paper record). Two ideas from
an outside framework that this research had not tested.

## Sets
FX/gold: the 7 CVOL instruments, rich = IV ÷ RV ≥ 1.27 (CVOL, as the base test). Indices: NQ, SPX, DOW, US2000, rich ≥ 1.53
(CBOE). Same break signals as the base (scripts/rangebook asym/paper-record core, parity-checked).

## Variant 1 — trend-day filter (London breaks the Asia range)
Asia range = high/low of the London day's bars from 00:00 to 07:00. Defined only for break signals at or after 07:00.
- **Primary: asiaBreakWith** = before the break's signal bar, a bar from 07:00 on CLOSED beyond the Asia high (for a long) or
  low (for a short).
- Secondary: **narrowAsia** = today's Asia range below the median of the previous 20 London days' Asia ranges.
Comparison: filtered breaks vs all rich-IV breaks with signals from 07:00 (same window), net R per trade.

## Variant 2 — acceptance, then retest entry
For every rich-IV break signal (bar k): **acceptance** = the next 5 M1 closes all stay beyond the line; any close back inside
→ no trade. After acceptance, **retest** = the first bar within 120 minutes whose low (long) / high (short) comes within
0.02σ of the line; fill at line ± 0.02σ (at the bar's open if it opens beyond that). No retest → no trade. Same stops
(0.1σ / 0.2σ behind the line), targets 5R / 10R from the fill, day-end exit, stop wins a same-bar tie including the fill bar.
**Primary metric: R per SIGNAL** (no-trade signals count 0), because a retest entry skips the runaway moves; per-trade R and
the fill rate are reported too.

## Pass (each variant)
Its metric beats the base rule's (base: R per trade for variant 1; base R per signal for variant 2) in 2016–22 AND 2023–26 on
FX/gold, AND on the indices. A pass becomes a candidate change to the paper record, decided after its own forward evidence —
not a silent edit of the live rule.
Self-check: the asiaBreakWith flag and the retest fill must be unchanged under future-scramble from the bar after the
decision (signal bar / fill bar).
