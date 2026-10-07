# Meta-labelling the yield-spread book on the long history, with an era gate

*Pre-registered 2026-10-07, before the long events were built. Reopens meta-labelling under the stopping rule's own
condition (much more independent data: forge/YS_LONG_CONFIRM_PREREG.md PASS; ~1,800 effective bets vs ~395). Method
as forge/META_LABEL_PROPER_PREREG.md wherever not changed below. No Vote Atlas input.*

## The owner's challenge, built in

"Will data from 50 years ago help analyse the markets now? That was a different generation of trading." Lesson 02 §06
agrees relationships change. So the old data must **earn** its place:

- **Every score is on the modern era only: test years 2006 → 2026**, walk-forward by year.
- **Two training sets** for each test year:
  - **L (long):** every event since 1976 whose label ended before the test year (purge + 10-trading-day embargo),
    time-decay weights (oldest 0.5 → newest 1.0, AFML 4.6);
  - **M (modern):** the same but starting 1996.
- **Era gate (decided first):** if L's pooled per-bet Sharpe on 2006–2026 is **≥ M's**, the old data is kept and L is
  the main result. Otherwise the old data is dropped and **M is the main result**. Both are reported.

## Data: the long FRED set (`scripts/ys_long/`), close-only

- **Pairs:** USDJPY (1985+), GBPUSD, AUDUSD, USDCAD, USDCHF (1976+), EURUSD (1999+). The breadth pairs are excluded:
  not confirmed.
- **σ:** EWMA (λ = 0.94) of daily close-to-close log returns, point-in-time.
- **CUSUM threshold:** 1.0 × σ known before the day.
- **Barriers:** ±2σ on daily closes (no high / low exists before 2016), vertical barrier 10 trading days, 0.02% cost.
- **Primary:** fires at |z| ≥ 1.0, side as the strategy.

## Features (close-based only; what exists across five decades)

| Group | Features |
|---|---|
| Primary | z, \|z\|, 5-day change in z, days since \|z\| crossed 1.0, spread level |
| Event | CUSUM move with / against the side |
| Volatility system (close-based) | regime (σ ÷ trailing 250 median), res5 (mean \|r\| ÷ σ over the last 5 days), today (\|r\| ÷ σ), 5-day change in log σ |
| Cross-section | leave-one-out USD 10-day trend, signed to the bet's USD side |

Not available before 2016, so absent: intraday jumps, implied vol, the release calendar.

## Model, sizing, scoring: as META_LABEL_PROPER_PREREG

- Logistic regression (C = 1), standardised features (variant 1 there, the one that can learn monotone effects),
  uniqueness × decay weights.
- Bet size from probability (AFML 10.1).
- **Sanity pre-condition:** the top predicted tercile must have a higher mean |z| and a higher win rate than the
  bottom; otherwise uninformative.
- **PASS:** precision gain and Sharpe gain intervals (month-block bootstrap) both wholly above 0.
- **Volatility system earns its place:** the full-minus-ablation (no volatility features) Sharpe interval is wholly
  above 0.
- Deflated Sharpe with N = 7 meta-label trials.

## Power, stated now

Modern test era ≈ 21 years × 6 pairs, ~780 effective bets. That is enough to detect a ~5 pp precision gain at 80%
power, not much smaller.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | — |
