# ema-regime-line-filter — RESULTS (run 2026-11-27)

- **Prereg:** `forge/EMA_REGIME_LINE_FILTER_PREREG.md`, pushed in `38f83b30` before any outcome was joined to an EMA
  feature.
- **Script:** `scripts/ema-regime-line-filter/run.py`.
- **Stats:** seed 20261127, 21-session date-block bootstrap B 2000, 500 random filters keeping the same share per
  market.

**Question.** The `trade-at-lines` trades (NQ, gold, EURUSD; v2 lines; 2018 → 2026-08-20) lose after costs. Does a
15m + 5m 9/20/50 EMA stack on the trade's side, or a stretched fade (15m EMA20 distance ÷ ATR14), pick the trades that
pay?

**Answer: no. All 5 cells are NULL.**
- **Stack filter:** on fades it is almost never true. Price has just run into the line, so the short EMAs point the
  other way: 1% of fades qualify, and those lose more. On breakout (FOLLOW) trades it is nearly always true (84%) and
  changes nothing.
- **Stretch filter:** separates nothing.

## Checks

- **Parity:** the re-simulation reproduces all 31,234 banked pos-0 trades, with a max |netR difference| of 0.
- **No lookahead:** features come only from 5m/15m mid bars that closed at or before the start of the entry minute.
  Median bar age is 6 min (15m) and 2 min (5m); the maximum, about 2.7 h, falls across session gaps.

## Registered cells (mean net R per trade, 95% CI)

| Cell | Trades | Filter | All | Kept | 95% CI | n kept (share) | Kept − all | Random pct | Halves | Holm | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | FADE-L | stacked with | −0.102 | −0.306 | [−0.482, −0.115] | 101 (1%) | −0.205 | 1 | −0.44 / −0.16 | 0.17 | **NULL** |
| E2 | FADE-Z | stacked with | −0.140 | −0.329 | [−0.579, −0.041] | 73 (1%) | −0.189 | 3 | −0.50 / −0.16 | 0.58 | **NULL** |
| E3 | FOLLOW | stacked with | −0.081 | −0.084 | [−0.108, −0.060] | 9,615 (84%) | −0.003 | 39 | −0.09 / −0.08 | 1.00 | **NULL** |
| E4 | FADE-L | stretched (top third) | −0.102 | −0.123 | [−0.155, −0.092] | 3,440 (31%) | −0.022 | 6 | −0.14 / −0.11 | 0.50 | **NULL** |
| E5 | FADE-Z | stretched (top third) | −0.140 | −0.132 | [−0.160, −0.106] | 3,157 (37%) | +0.007 | 75 | −0.13 / −0.13 | 1.00 | **NULL** |

Every kept interval has its upper edge below 0, so a +0.05R trade is ruled out in every cell.

## Descriptive (not judged)

| Trades | All | Stacked with | Stacked against | Mixed | Stretch terciles (low / mid / high) |
|---|---|---|---|---|---|
| FADE-L | −0.102 | −0.306 (n 101) | −0.101 (n 9,467) | −0.093 | −0.117 / −0.066 / −0.123 |
| FADE-Z | −0.140 | −0.329 (n 73) | −0.134 (n 7,550) | −0.174 | −0.166 / −0.124 / −0.132 |
| FOLLOW | −0.081 | −0.084 (n 9,615) | +0.114 (n 102) | −0.077 | −0.076 / −0.083 / −0.084 |

- **The stack is mostly a description of the run into the line.**
  - At a fade it is stacked against the trade 85% of the time.
  - At a breakout it is stacked with the trade 84% of the time.
  - So it adds no new information at the entry.
- **The thin tails** (fades with the stack, breakouts against it) are about 100 trades each. They are too few to read
  as anything more than noise.
- **NQ breakouts with the stack:** +0.036 net (descriptive). This is the same market where the V1 side filter showed
  +0.07 in `bias-day-trade`.

## What it means

- An intraday 9/20/50 EMA regime doesn't fix the line trades. At the moment price touches a line, the EMA stack just
  restates the move that brought it there.
- Don't add an EMA regime score to the bias engine or as an entry gate.
- EMAs on the chart are fine as a picture of the trend so far, but they aren't a filter.
