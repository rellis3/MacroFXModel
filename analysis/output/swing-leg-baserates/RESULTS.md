# swing-leg-baserates: results (EXPLORATORY, not pre-registered)

Register row `swing-leg-baserates` (owner's ask 2026-11-01). The gold chart's frame (how big the swings are, whether
the current leg is "at the size where the others ran out", and what happened after a deep oversold fall) run across
instruments in each instrument's own volatility units. Exploratory: nothing here is banked. Anything worth using
needs a prereg on fresh data.

## Data and method

- **Primary:** the repo's OANDA M15 closes (`analysis/output/rates_residual/m15/`) cut at 17:00 New York into daily
  bars. 11 instruments (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, XAUUSD, XAGUSD, NAS100, SPX500, DE30),
  2018-01 to 2026-10-07. `build_m15_daily.py`.
- **Robustness:** Yahoo daily, 18 instruments (the above plus NZDUSD, EURGBP, EURJPY, GBPJPY, AUDJPY, EURCHF,
  UK100), 2016-01 to 2026-10-30. `fetch_daily.py`. Its closes are taken at a different hour from OANDA's: levels
  agree to a 0.02% median on FX, but daily returns correlate only about 0.6. Gold and silver are front-month futures,
  with a 0.4–0.7% median level gap. See `data_check.json`. Fine for multi-week swings, not for σ ladders.
- **Units:** σ = trailing 60-day stdev of daily log returns, known at that close. Leg sizes are in σ. Forward moves
  are in σ·√h.
- **Legs:** zigzag on closes, reversal at 6σ from the extreme. For gold that's about 8–10%, close to the chart's
  swings. The engine reproduces the chart's current gold leg: 24 Aug 2026, −17%.
- **State:** a fall from the 1-year high of at least 1.0 (or 1.5) annualised σ, RSI(14) under 30, at a 20-day
  closing low. Gold today is at 1.3. Each signal blocks the next 20 sessions. The mirror is for rallies.
- **Order:** bounce +0.75 vs flush −0.45 in σ·√20 units, gold's +5% / −3% at today's vol. Baseline = the same
  measurement from every 5th day.
- **Rules applied:** outcomes stop at the lockbox (2026-08-21). Bootstrap uses calendar-month blocks, 2,000 draws,
  seed 20261101.

## 1. How big swings are (σ units)

| | Down legs (OANDA) | Up legs (OANDA) | Down legs (Yahoo) | Up legs (Yahoo) |
|---|---|---|---|---|
| n | 228 | 225 | 421 | 419 |
| median size | 11.1σ (6.9%) | 12.2σ (8.1%) | 10.5σ (6.4%) | 11.5σ (7.8%) |
| p25 / p75 / p90 | 8.0 / 16.8 / 23.8σ | 8.1 / 17.7 / 24.7σ | 7.9 / 15.6 / 22.5σ | 8.1 / 16.1 / 23.0σ |
| median length | 33 sessions | 48 sessions | 33 sessions | 42 sessions |

## 2. Is there a size where legs run out? No

The question: once a leg has already travelled X σ, how much further does it go before reversing?

| Already travelled | Down legs: n, P(≥4σ more), median further | Up legs: n, P(≥4σ more), median further |
|---|---|---|
| 6σ | 228, 57%, 5.1σ | 225, 60%, 6.2σ |
| 10σ | 129, 59%, 5.9σ | 135, 70%, 6.1σ |
| 15σ | 70, 60%, 5.9σ | 84, 55%, 4.7σ |
| 20σ | 38, 58%, 5.3σ | 41, 63%, 5.2σ |

(OANDA. Yahoo gives the same flat pattern, 4.5–5.6σ further at every row.)

How much further a leg runs doesn't depend on how far it has already gone. A leg at its instrument's typical size
is no more likely to end than a fresh one. So the chart's claim "every down-leg this year lands in the same place,
so this one is at exhaustion size" isn't supported across 10 years and 18 instruments. Four legs agreeing in one
year is what you'd expect by chance.

## 3. After a deep oversold fall (the gold-chart condition)

| | n | 20-day return (σ·√20), mean [95% CI] | win | 60-day further fall, median / p75 | P(bounce before flush) [CI] | median days to bounce / flush |
|---|---|---|---|---|---|---|
| **OANDA, fall ≥ 1.0** | 87 | **+0.41 [+0.18, +0.63]** | 68% | 0.37 / 0.84 | 55% [43, 67] | 10 / 4 |
| OANDA baseline (every 5th day) | 4,123 | +0.10 [+0.03, +0.18] | 57% | 0.50 / 1.01 | 45% [42, 47] | 11 / 7 |
| **Yahoo, fall ≥ 1.0** | 158 | **+0.25 [+0.07, +0.43]** | 62% | 0.47 / 1.11 | 44% [36, 54] | 7.5 / 6 |
| Yahoo baseline | 7,655 | +0.07 [−0.01, +0.14] | 55% | 0.52 / 1.00 | 43% [41, 46] | 11 / 7 |
| OANDA, fall ≥ 1.5 | 25 | +0.38 [−0.04, +0.81] | 68% | 0.46 / 0.95 | 40% [15, 64] | 6.5 / 4 |
| Yahoo, fall ≥ 1.5 | 56 | +0.22 [−0.13, +0.54] | 63% | 0.45 / 1.10 | 41% [27, 55] | 5 / 5 |

- **There's a modest bounce tendency over 20 days.** It's about +0.15 to +0.30 σ·√20 above the baseline, in both
  sources. For gold at today's vol, +0.3 σ·√20 is roughly +2% over 20 sessions, against about +0.7% on an ordinary
  day. That's a lean, not a call.
- **"Bounce first about 60%" isn't supported.** Reaching the bounce barrier before the flush barrier happens 44–55%
  of the time after these falls, against 43–45% on any day. The intervals overlap. When the flush comes, it comes
  faster (median 4–6 sessions vs 7.5–10 for the bounce).
- **The deeper 1.5σ cut is UNDERPOWERED** (n 25 / 56). Its intervals span zero.
- **The further fall is typical.** The usual 60-day further fall (median about 0.4–0.5 σ·√60; for gold about
  4–5%) is about the same as on any day.

After a stretched **rally** (the mirror condition), there's nothing: 20-day return −0.13 [−0.38, +0.15] (OANDA) and
−0.02 [−0.19, +0.17] (Yahoo), with the pullback first 31–35% of the time, the same as baseline. Fading stretched
rallies on this definition has no support.

Search breadth: 4 conditions × 2 sources × several statistics, chosen after looking at one chart. Read the one
positive cell (20-day return after a 1.0σ fall) as a pointer, not a result.

## 4. Reading as of the latest bar (display only, Yahoo to 2026-10-29/30)

| Instrument | Current leg | Since | Size | σ | Percentile vs own legs | Fall from 1y high (ann σ) | RSI | Condition |
|---|---|---|---|---|---|---|---|---|
| XAUUSD | down | 2026-08-24 | −17.0% | 11.3 | 64% | 1.30 | 29.6 | fall ≥ 1.0 |
| XAGUSD | down | 2026-01-26 | −57.2% | 20.4 | 92% | 2.03 | 25.3 | fall ≥ 1.0 and 1.5 |
| EURGBP | down | 2026-09-24 | −2.9% | 14.4 | 76% | 1.92 | 23.6 | fall ≥ 1.0 and 1.5 |
| EURUSD | down | 2026-08-20 | −4.3% | 13.7 | 50% | 1.54 | 36.2 | – (RSI not under 30) |
| NZDUSD | down | 2026-08-25 | −5.8% | 11.3 | 46% | 1.04 | 40.5 | – |
| SPX500 | up | 2026-03-30 | +19.5% | 21.4 | 80% | – | 40.1 | – |

Full table for all 18 is in `results_yahoo.json` → `now`. For gold, section 2 says the 64th-percentile leg size
tells you nothing about when it ends. Section 3 says the historical lean after this setup is a modest 20-day bounce,
with no better than the usual odds that the bounce comes before a further flush.

## What this means for the build

- Keep in the per-pair engine: leg sizes in σ, the current leg's percentile (as description), the 20-day lean after
  a deep fall, and the which-way-first odds with the baseline beside them.
- Drop or label as untested: "exhaustion size" language, a bounce-first figure without its baseline, and point
  dates.
- Next, if wanted: pre-register the 20-day lean after a fall of at least 1.0σ (OANDA bars, fixed definition) and
  score it on data after the lockbox as it arrives.

Files: `results_m15.json`, `results_yahoo.json`, `legs_*.csv`, `data_check.json`, daily bars in `daily_m15/` and
`daily/`. Scripts: `scripts/swing-leg-baserates/`.
