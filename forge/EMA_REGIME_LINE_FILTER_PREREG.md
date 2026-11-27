# ema-regime-line-filter — PREREG

| Field | Value |
|---|---|
| Slug | `ema-regime-line-filter` |
| Date registered | 2026-11-27 (pushed before any outcome joined to an EMA feature) |
| Seed | 20261127 |
| Owner question | 2026-11-27, from a ChatGPT EMA suggestion: does a 9/20/50 EMA regime on 15m/5m make the line trades pay? |
| Scripts | `scripts/ema-regime-line-filter/` |
| Outputs | `analysis/output/ema-regime-line-filter/` |
| Lockbox | Sessions after 2026-08-20 are not scored |

## Question

The `trade-at-lines` trades (FADE-L, FADE-Z, FOLLOW at the v2 lines; NQ, gold, EURUSD; real lines, pos 0) lose after
costs. `bias-day-trade` found that the V1 side lifts them about +0.07R, but they still lose. The question here is whether
an intraday EMA regime, the thing ChatGPT proposed for entries, picks the trades that pay:

- **(a) Stack filter:** take a trade only when the 9/20/50 EMAs are stacked on the trade's side on both 15m and 5m.
- **(b) Stretch filter (fades):** take a fade only when price is stretched far from the 15m EMA20 in the direction of
  the run into the line.

Prior art: `mtf-structure-ema` (W1/D1/H4/H1 EMA alignment, 24h-5d direction) and the bias trend driver. Both are slow
timeframes and direction-of-day questions. Nothing tests intraday EMAs as an entry filter at a line.

## Data and features

- **Trades:** the `trade-at-lines` simulation (`scripts/trade-at-lines/score.py` `sim`) re-run at pos 0 to record the
  entry bar. Parity check: re-run netR must equal `analysis/output/trade-at-lines/trades.parquet` to 1e-9 on every
  trade, or the study stops. Window 2018-01-01 to 2026-08-20.
- **EMA inputs:** OANDA M1 mid closes (`data/m1_bidask/<key>_m1.parquet`), all hours, resampled to 5m and 15m bars.
  Only bars that **closed at or before the start of the entry minute** are used (no lookahead from the entry bar). EMA
  seeded with the first value, k = 2/(n+1); the first 200 bars of each series are dropped as warm-up.
- **Stack(tf)** = +1 if EMA9 > EMA20 > EMA50, −1 if EMA9 < EMA20 < EMA50, else 0.
- **Trade direction** dirn: FOLLOW at OH and fades at OL = long (+1), otherwise short (−1).
- **Stacked-with** = Stack(15m) = Stack(5m) = dirn.
- **Run stretch** = −dirn × (last 15m close − EMA20₁₅) / ATR14₁₅, where ATR14₁₅ is the Wilder ATR of the 15m mid bars.
  Positive = price stretched in the direction of the run into the line, which the fade trades against. Tercile cuts
  are taken per market over all fade trades (no outcome used); "stretched" = top tercile.

## Cells (one Holm family of 5)

| Cell | Trades | Kept |
|---|---|---|
| E1 | FADE-L | stacked-with |
| E2 | FADE-Z | stacked-with |
| E3 | FOLLOW | stacked-with |
| E4 | FADE-L | stretched (top tercile run stretch) |
| E5 | FADE-Z | stretched |

**Pass (VALIDATED):** all of the following:
- kept mean net R > 0, with its 95% CI > 0;
- both halves (split at the median date) > 0;
- kept − all ≥ +0.05R, with its CI excluding 0;
- kept − all above the 97.5th percentile of 500 random filters that keep the same share of trades within each market;
- Holm p < 0.05.

**NULL:** the kept net CI upper is below +0.05R (the `trade-at-lines` rule). **UNDERPOWERED:** otherwise.

- **Stats:** 21-session date-block bootstrap, B 2000, pooled over markets.
- **p:** the larger of the two-sided p for kept net > 0 and for kept − all > 0.

## Reported, not judged

- "Stacked-against" (both stacks opposite the trade), and each market alone.
- The 15m-only stack, and the stack with ±0 tolerance as defined.
- Stretch terciles 1/2/3 for fades, and stretch for FOLLOW.
- BH q 0.10 for any per-market disaggregation. Candidates only.

## Amendments

(none)
