# Daily-open research: findings

**Instruments** Gold (XAUUSD), Nasdaq (NAS100), EURUSD. **Data** 1-minute bars, Jan 2016 to Aug 2026 (about 2,740 trading days each).
**Anchor** the broker's daily candle. The feed follows CME hours, so the first bar of every gold / NQ day prints at 23:00 UK (18:00 New York) all year; EURUSD trades through the boundary. The anchor is a parameter of every study and six alternatives were compared (section 1).
**Units** every distance is expressed in ADR, the trailing 20-day median daily range, so the three instruments are directly comparable. Trade results are in R (risk multiples) net of an assumed round-trip cost of 0.30 on gold, 1.5 points on NQ and 1.5 pips on EURUSD, and the gross (pre-cost) figure is reported next to it so the reader can see what cost does.
**Nulls** every "does X predict Y" statistic is shown against the answer a driftless random walk would give, and the two early-extreme claims are also tested against a shuffled-returns null (the same day's one-minute moves in random order). IS/OOS is a 60/40 date split; per-year tables are in each instrument's report.

Per-instrument reports with every table: `out/gold/REPORT.md`, `out/nq/REPORT.md`, `out/eurusd/REPORT.md`. Cross-instrument table: `out/SUMMARY.md`.

## The short version

1. **The 23:00 UK open is a real but small volatility event on gold and NQ, and nothing on EURUSD.** The first 15 minutes carry roughly 1.5x the per-minute range of the following hour (the "Asian injection"), then it fades. The whole first hour holds about 12% of the day's range on gold and NQ, the same as the last hour of the day; on EURUSD 23:00 is the quietest hour of the day. London 08:00 and New York 13:30-15:00 UK are where the range actually is.
2. **The day's extremes do not form at the open.** The first hour contains the day's high or low 18-20% of the time on gold/NQ, which is *below* the 26-27% a shuffled random ordering of the same day produces. The "Judas swing" (early low, then an up day) is likewise below its null on all three instruments. Extremes cluster in the New York hours.
3. **Nothing about the first candle predicts the rest of the day.** First 15/30/60/120-minute direction agrees with the rest of the day 48-50% of the time on every instrument and every timeframe. The 52-56% figures retail material quotes come from letting the first move overlap the day it is supposedly predicting.
4. **Opening-range breakout at 23:00 has no momentum after the breakout, and cost turns "zero" into a reliable loss.** Once the breakout bar's overshoot is accounted for, the probability of reaching +1 range before the opposite edge equals the random-walk expectation on gold and NQ and sits well below it on EURUSD. Gross expectancy is within +/-0.03R of zero everywhere; net expectancy is -0.13 to -0.32R on gold, -0.11 to -0.20R on NQ and -0.31 to -0.91R on EURUSD, because the opening range is 3-12% of ADR and the spread is 13-72% of the risk. Both sides of the opening range get taken on 78-95% of days.
5. **Impulse-then-fib-pullback is the one place a small, stable effect shows up, and it still does not pay the spread at the 1-minute scale.** Across 52,000 legs, the chance of a pullback continuing to a new extreme is 2-4 percentage points above the random-walk null at every fib depth, in-sample and out-of-sample, and the gap is bigger for impulsive legs (+4-5 points at the 0.5 depth) than for grinding legs (+0-1). But the limit-order sims are negative gross at 0.382 and 0.5 depth (the bar that fills you keeps going: adverse selection worth 3-8% of R) and only marginally positive gross at 0.618-0.786 with a stop at the leg origin (gold +0.03 to +0.11R, t up to 4; NQ +0.00 to +0.03; EURUSD ~0), where the spread is 23-66% of the risk. After a continuation, price reaches 1.1x the leg 82-86% of the time, 1.272x 64-68% and 1.618x 43-48%, which matches the extension targets on the chart in the screenshot but is close to what a random walk gives too.
6. **VWAP behaves differently per instrument.** Gold reverts to VWAP after a 2-sigma push faster than at a random bar (43% within 60 minutes vs 34%); NQ does the opposite (25% vs 36%, it keeps trending away during Asia); EURUSD is neutral. The fade and bounce sims are all roughly zero gross and heavily negative net because Asia-session bands are so tight that the spread is 0.3-1.5R. Side of VWAP at 07:00 UK predicts the rest of the day 50-53%.
7. **Asia range into London is a coin flip with an instrument-specific texture.** The day closes beyond the first-broken side 51-52% everywhere. Gold takes both sides of its Asia range on 35% of days, EURUSD 47%, NQ 54%. Breakout and sweep-fade sims are +0.02 to +0.10R gross (EURUSD sweep-fade t=2.3 is the strongest single number in the suite, from a 25% win rate at 4:1) and negative net. Small Asia ranges (<0.25 ADR) get both sides taken 60-67% of the time.
8. **Prior-day levels break slightly more often than they hold.** At the first touch of PDH/PDL, price goes 0.15 ADR through before 0.15 ADR back 52-56% of the time on all three. PDH/PDL are touched on 42-56% of days, prior-week levels on 18-28%. Yesterday's close is revisited on about 90% of days.
9. **Gaps at the open fill, unless they are big.** 93-97% of gaps fill; gaps above 0.30 ADR fill about half the time; Monday gaps (the only material ones, median 0.06-0.08 ADR) fill 81-88%.
10. **Once price is 0.3 ADR from the open, it never comes back that day 41-42% of the time, on all three instruments.** At 13:00 UK with more than 0.5 ADR of travel, the close is back through the open only 6-15% of the time. The direction is set by then, but the probability of *further* progress from that point is still 50%.

Nothing above survives as a stand-alone entry signal at the 1-minute scale after cost. What is real is structure: where volatility is, where extremes form, which instrument trends and which reverts in the Asian session, and a small continuation effect after genuine impulses.

## What each study measured and what it found

### 1. Which open matters (anchor comparison)

| anchor | gold: first-60m share of range | NQ | EURUSD | gold: day extreme in first 60m | NQ | EURUSD |
|---|---|---|---|---|---|---|
| broker (23:00 UK) | 0.123 | 0.116 | 0.090 | 19.8% | 18.2% | 12.4% |
| London midnight | 0.127 | 0.102 | 0.107 | 18.2% | 15.8% | 14.5% |
| Tokyo 09:00 (00:00 UTC) | 0.153 | 0.125 | 0.146 | 22.9% | 18.9% | 19.4% |
| London 08:00 | 0.218 | 0.174 | 0.283 | 31.2% | 25.5% | 39.4% |

The 23:00 UK candle is the right anchor for the broker's daily open, gap and daily candle, and it is a real event on gold/NQ because of the CME re-open. But by the "where does the day's range and extreme come from" test, London 08:00 is a far stronger open, and for EURUSD it is the only open worth anchoring to.

### 2. Volatility profile

Mean 1-minute true range in ADR units by 15-minute block (x1000): gold 24.7 in the first block, 16-18 for the next hour, rising again at +2h (01:00 UK, Tokyo cash) and +3h (Shanghai/Singapore); NQ 19.7 then 11-13; EURUSD 14.4 then 10-13. Median 60-minute range by UK hour peaks at 13:00-15:00 UK on all three (gold: 7.0-7.3 vs 2.3-3.7 during Asia).

### 3. The open as a level

- First-move direction vs rest of day: 48.3-50.5% across all windows and instruments (p > 0.07 in every cell, most around 0.5).
- Open crosses per day: median 19-21. Share of bars above the open: median 0.53-0.58, but the p10/p90 are 0.06/0.97: days are mostly one-sided or mostly two-sided, rarely balanced.
- Open holds (never revisited) after moving 0.1 / 0.2 / 0.3 / 0.5 ADR away: 12-14% / 26-27% / 41-42% / 66-68% on all three instruments. These numbers are almost identical across gold, NQ and EURUSD, which suggests they are a property of the random walk plus the day's drift, not of the open.
- Where the day's high forms: 7-9% in the first 30 minutes (mechanical: the open is near an extreme by construction), then flat through Asia and London, then 3.5-4.8% per 30-minute bucket through 13:00-16:00 UK.

### 4. Opening-range breakout

See point 4 above. Conditioning did not rescue it: narrow opening ranges (<0.10 ADR) are the worst (net -0.18 to -0.51R at 1R target), wide ones (>0.35 ADR) are roughly break-even but rare (n = 20-124). No weekday, vol-regime or news-day cell is positive with t > 1.8. Gold's 30m/60m breakouts improved in 2025-26 (net -0.03 to -0.05R) as ADR grew and the spread became a smaller fraction of the risk; that is a cost effect, not a signal effect.

### 5. Impulse leg and fib pullback

Method: a leg becomes "drawable" the first time price gives back 23.6% of a swing of at least 0.12 ADR from the last confirmed pivot, within four hours of the open. Nothing after that moment is used to define the leg. Depth is the fraction of the leg given back (a TradingView fib drawn low to high shows 1 - depth, so 0.618 on that chart is 0.382 depth here).

| pullback reached | gold obs / null | NQ obs / null | EURUSD obs / null |
|---|---|---|---|
| 0.236 | 69.2 / 67.4 | 69.8 / 69.5 | 69.6 / 68.9 |
| 0.382 | 56.3 / 53.9 | 56.5 / 55.4 | 56.7 / 54.9 |
| 0.5 | 45.6 / 42.8 | 45.6 / 43.9 | 46.2 / 43.7 |
| 0.618 | 35.3 / 31.9 | 34.9 / 33.0 | 35.6 / 32.7 |
| 0.786 | 19.9 / 16.6 | 19.4 / 17.1 | 20.8 / 17.1 |

The null is the random-walk probability computed from the close of the bar that first reached the depth (the bar overshoots, so it is below the textbook 1 - depth). Impulsive legs (top half on both path efficiency and speed) at 0.5 depth: 47.4 / 42.8 gold, 48.4 / 43.5 NQ, 47.0 / 43.2 EURUSD. Grinding legs: 44.1 / 42.7, 43.3 / 44.3, 45.4 / 44.1. The effect is stable IS vs OOS on all three.

Sims (limit at depth, stop at the leg origin, target 1.272 or 1.618, net / gross): gold 0.5 -0.21 / -0.03, 0.618 -0.21 / +0.03, 0.786 -0.31 / +0.11 (t 4.1); NQ 0.618 -0.20 / +0.00, 0.786 -0.33 / +0.03; EURUSD 0.618 -0.44 / -0.07, 0.786 -0.66 / -0.01. Larger legs (>0.35 ADR, n = 160-390) are the only cells that go positive net (gold +0.18R, t 1.2), which is consistent with the effect being real but only tradeable where the leg is big enough to make the spread irrelevant.

### 6. Session VWAP

See point 6. Additional detail: at minute 120 with |z| >= 1.5, the day closes even further from VWAP 42-46% of the time and back through it 46-50%; NQ is the most trend-persistent. The VWAP-bounce race (return to VWAP after a 1.5-sigma push, then +1 sigma before -1 sigma) is 50.1% gold, 46.9% NQ, 50.7% EURUSD against nulls of 49.7 / 48.9 / 48.4.

### 7. Asia range

Asia range median 0.42 ADR gold, 0.31 NQ, 0.34 EURUSD. First break arrives a median 44-72 minutes after 07:00 UK. Gold: a wide Asia range (>0.60 ADR) is followed by a breakout that closes beyond 56% and the breakout sim is +0.05R net (n = 549, t 1.0); NQ's best cell is the 0.40-0.60 sweep-fade at +0.05R net (n = 491, t 0.5). Neither is significant after the number of cells looked at.

### 8. Prior levels, first candles, gaps

See points 8, 9. The first 60-minute candle's opposite extreme holds for the rest of the day only 8-13% of the time; the first 4-hour candle's 22-34%. Strong-bodied first candles hold their opposite extreme more often than dojis (gold 60m: 19% vs 10%) but still do not predict direction (47-50%).

## What I would investigate next, in order

1. **Re-run the whole suite anchored at London 08:00 and New York 14:30 UK.** The anchor comparison says that is where the range and the extremes are. The code takes the anchor as a parameter (`--anchor london08`); the Asia-range and trend-checkpoint studies would need their session clocks shifted.
2. **Measure the real spread at 23:00 UK.** Every sim here is decided by cost. Rollover spreads on gold and indices are typically 2-5x the daytime spread for the first minutes of the session, which makes the assumed 0.30 / 1.5 optimistic exactly when the "injection" candle prints. Log live spreads for a month and re-run with the measured cost curve by minute-since-open.
3. **Scale the impulse-continuation effect up.** It is the only stable edge above null. Test legs of 0.35 ADR and larger, on 5-minute bars, across all 26 pairs and the whole day, with the stop placed by ATR rather than at the origin, and check whether the +4-5 point impulsive-leg premium survives. If it does, the question becomes minimum leg size at which cost falls below the edge.
4. **Treat NQ and gold differently in Asia.** NQ keeps trending away from VWAP through the Asian session and takes both sides of its Asia range 54% of the time; gold reverts and takes both sides 35%. That argues for continuation logic on NQ and range logic on gold during 23:00-07:00 UK, which is testable as a paired walk-forward.
5. **Condition on what the previous session did, not on the calendar.** Major-news days made no difference to any table. The session-handoff work already in this repo found volatility clusters session to session; the open studies here should be conditioned on the prior NY session's range and close location, and on Monday (gaps) versus the rest of the week.
6. **Use the gap the right way round.** Gaps fill 93-97% of the time but are tiny; the useful question is whether the 0.15-0.30 ADR gaps (fill 74-82%, median fill time over an hour) can be faded with a stop beyond the opening extreme, and what happens on the days they do not fill.
7. **Replace the fixed 0.15 ADR reaction race at prior levels with a distribution.** PDH/PDL break slightly more than they hold at the first touch. Recording the full MFE/MAE after the touch, split by whether the touch happens in Asia, London or NY, would show whether the level matters at all or only the session it is touched in.
8. **Walk-forward the two cells that looked best, with their neighbours.** Gold wide-Asia-range breakout and EURUSD sweep-fade. Both are single cells out of dozens; a rolling annual refit that must pick them without seeing the future is the honest test, and the leave-one-out / DSR tooling in `analysis/` already exists for it.
9. **Check bid/ask.** The parquet is one price stream. Fills at fib limits showed adverse selection; with bid/ask bars the fill assumption can be made exact rather than approximated with a round-trip cost.

## How to run

```
python3 -m DailyOpenResearch.run --pairs gold,nq,eurusd [--anchor broker]
python3 -m DailyOpenResearch.summary
```

Modules: `data.py` (loading, anchored days, ADR), `studies_profile.py`, `studies_orb.py`, `studies_open.py`, `studies_fib.py`, `studies_vwap.py`, `studies_session.py` (Asia range, prior levels), `studies_mtf.py`, `news.py`, `report.py`, `summary.py`. NQ minute data is fetched with `python3 scripts/r2_download.py nq`.
