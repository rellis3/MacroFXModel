# Impulse / EMA / Range-Exhaustion Backtest — Gold & NQ, 2016–2026

A mechanised, honestly-pinned formalisation of a discretionary intraday
pattern observed second-hand — a colleague ("Jordan", tagging `@C.OG`)
posting "test" trades on 1-minute Gold and Nasdaq TradingView charts.
Engine: [`js/impulseEmaRangeV1Engine.js`](../../js/impulseEmaRangeV1Engine.js).
New brick: [`js/rangePercentileCore.js`](../../js/rangePercentileCore.js).

---

## What this is and isn't

**Isn't:** a reconstruction of the specific screenshotted trades. Those are
dated 13–14 Aug 2026. This sandbox's live OANDA fetch is 403 (confirmed by
testing `fetchM1Range('XAU_USD', ...)` directly), and the cached M1 series
(R2, `loadM1ForPair`) ends **2026-06-05** — ~10 weeks before the screenshots.
There is no honest way to pull those exact bars from here right now.

**Is:** a real, falsifiable formalisation of the *visible pattern* — an
impulsive swing leg, an EMA cross, a session-range-exhaustion read, entered on
a pullback — built from this repo's existing tested bricks (not new
one-off glue) and run against the **full 10.4 years of real M1 data that IS
available** for both instruments, to answer the actual question asked: does
this *style* of trade have edge, tested properly (costs, true OOS split, no
lookahead)?

### Correction from the first-pass read of the screenshots

The first read of the screenshots (before this build) mis-identified the
red/green rectangle as a confluence "Point of Interest" zone. It is not —
it's **TradingView's Long/Short Position drawing tool**: the boundary between
red and green is the entry, the far red edge is the stop, the far green edge
is the target. Re-reading the screenshots on that basis: the Gold sequence
(13 Aug) was a **SHORT** — entry ≈4372, stop ≈4380 (red, above), target
≈4345 (green, below), ~3.4R — taken as price pulled back UP into resistance
after an initial down-impulse, i.e. a **continuation-on-pullback** trade, not
a fade. The NQ sequence with the box inverted (red at the bottom) was a
**LONG** on the same logic. That reading — impulse, then a confirmed
pullback entered in the impulse's own direction — is what's formalised below.

---

## The rule, exactly as pinned (every judgment call named)

| Element (visible in the screenshots) | Mechanised as | Pinned choice |
|---|---|---|
| Impulsive swing leg | `patternEngine.pivotHighs/pivotLows` (±5-bar confirmation) → most recent confirmed alternating pivot pair whose size ≥ `impulseAtrMult`×ATR(14) on the entry timeframe | `impulseAtrMult = 2.5`, M1 bars, ATR(14) |
| EMA cross (blue lines) | `indicatorCore.ema` fast/slow, must AGREE with the impulse direction at the confirmation bar | EMA(9) vs EMA(21) — standard, not fit |
| "H-L Range: Live / Median / 75th Pct" tool | **New brick** `rangePercentileCore.rangeExhaustionRead` — today's session range-so-far ranked against the trailing-N-day empirical H-L% distribution | 20-session lookback; gate = live ≤ 1.0× trailing median (room left in the day) |
| Pullback entry | Confirmation bar must CLOSE inside the leg's 38.2–61.8% retracement | Standard Fib band, not fit |
| Fill | STOP order at the *next* bar's open (no lookahead, no same-bar limit-fill ambiguity) | via shared `forecastCore.walkBars` |
| Stop | Beyond the realised pullback's own high/low (from the leg's turning point to the confirmation bar) + 0.25×ATR buffer | "beyond recent market structure" — the framework's own preferred stop rule (`MD files/ZONE_TRADE_DECISION_FRAMEWORK.md`) |
| Target | Fixed RR × stop distance | RR = 2.0 baseline; 1.0/1.5/3.0 swept |
| Trade cadence | One trade/day, first qualifying setup | matches `poiReactionV1Engine`'s convention and COG's own observed ~1-trade/day cadence (`MD files/COG_OBSERVED_SYSTEM.md` §4b) |

No lookahead: pivots are only used once their ±5-bar confirmation window has
fully elapsed as of the evaluation bar; EMA/ATR are causal running series
recomputed per day from a 2-day context window; the range gate reads only D1
bars strictly before today and the running high/low up to "now". Costs on:
0.020% round-trip for gold, 0.010% for the NQ/NAS100 proxy (same figures the
POI engine uses).

---

## Data

- **Gold (XAU/USD):** `VolRangeForecaster/data/m1/gold_m1.parquet` via R2, 2016-01-04 → 2026-06-05, 3,648,400 M1 bars.
- **Nasdaq:** OANDA's `NAS100_USD` CFD proxy (no true NQ futures or MNQ data exists anywhere in this repo — see `js/instrumentRegistry.js`), `portfolioBacktest/cache/nq_m1.parquet` via R2, same window, 3,619,655 M1 bars.

---

## Headline result — null, on both instruments, at every setting tried

Baseline (RR 2:1), costs on, true 60/40 IS/OOS split:

| Instrument | Trades | Win% | PF | Expectancy (%/trade) | Sharpe (full) | Sharpe (IS) | Sharpe (OOS) | Max DD (%) | Buy&Hold Sharpe |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Gold | 3,156 | 24.1% | 0.357 | −0.0209 | **−5.99** | −7.59 | **−4.44** (n=1263) | −67.3 | +0.82 |
| NQ (NAS100) | 3,149 | 32.3% | 0.642 | −0.0083 | **−2.49** | −2.40 | **−2.63** (n=1260) | −26.5 | +0.81 |

Both trade ~305/year (roughly one qualifying setup most trading days, so
the daily cadence-matching-COG is coincidental to the rule design, not
evidence of anything). **IS and OOS Sharpe sit close together and both
negative on both instruments** — this is not an overfit-then-broke pattern
(there was never an edge to break); it's a rule with no edge, consistently,
across the whole 10-year window.

### Sensitivity — swept RR, the range gate, and the impulse threshold

Every variant tried, on both instruments, stayed negative:

```
GOLD                                  n     win%    PF     Sharpe(full)  Sharpe(OOS)
  baseline (rr=2, gate on, ema on)   3156   24.1%  0.357      -5.99         -4.44
  rr=1.0                             3156   22.3%  0.221      -8.44         -6.64
  rr=1.5                             3156   24.3%  0.304      -6.97         -5.41
  rr=3.0                             3156   22.6%  0.441      -4.45         -3.12
  no range gate                      3174   24.1%  0.361      -5.63         -3.99
  tight range gate (0.5x median)     3085   24.0%  0.354      -6.04         -4.49
  wider impulse (3.5x ATR)           3125   24.1%  0.340      -6.24         -4.91

NQ                                    n     win%    PF     Sharpe(full)  Sharpe(OOS)
  baseline (rr=2, gate on, ema on)   3149   32.3%  0.642      -2.49         -2.63
  rr=1.0                             3149   36.9%  0.508      -3.60         -3.91
  rr=1.5                             3149   35.7%  0.582      -3.02         -3.07
  rr=3.0                             3149   27.2%  0.746      -1.56         -1.71
  no range gate                      3155   32.3%  0.650      -2.41         -2.60
  tight range gate (0.5x median)     3112   32.0%  0.639      -2.66         -2.81
  wider impulse (3.5x ATR)           3116   32.2%  0.670      -2.18         -2.28
```

**The range-exhaustion gate isn't doing meaningful work as implemented.**
Turning it fully off changes the trade count by well under 1% and barely
moves Sharpe — it almost never actually binds, so as coded it isn't the
discriminator the screenshot's tool visually suggested it might be. Raising
RR mechanically improves the numbers least-badly (higher RR forgives a low
win rate more) but never comes close to flipping positive — at RR 3:1 the
breakeven win rate is 25%, and gold's actual win rate (22–23%) still misses
it; NQ's 27% at RR 3:1 similarly misses its 25% breakeven only marginally in
the wrong direction after costs.

---

## Reading this against the rest of the repo

This isn't an isolated null. `js/poiReactionV1Engine.js`
(`education/coleztrades_poi_backtest/`) mechanised a closely-related family —
structural zone + momentum-confirmation gate (VuManChu WaveTrend/VWAP/Money-Flow
there, instead of EMA-cross + range-exhaustion here) — across 26 FX pairs +
gold, and found the same shape of result: **null, IS-consistent-with-OOS, not
rescued by tightening the confirmation gate.** XAU/USD specifically scored
Sharpe −1.29 there (a *fade*-the-level version) vs −5.99 here (a
*continuation*-on-pullback version) — two different directional theses on the
same instrument, both negative. That's two independently-built, honestly-run
mechanisations of "wait for a level/impulse, confirm with an oscillator or
EMA, trade the reaction" landing in the same place.

**This does not prove the discretionary trader himself has no edge** — a
human executing this kind of setup brings judgment this mechanisation can't
capture (choosing WHICH impulse/pullback is high-quality, reading order flow,
skipping bad-context days, adjusting size). It tests one specific, honestly-pinned
*rule*, not the person. But it does mean: this particular formalisation of
what's visible in the screenshots — impulse + EMA + range-exhaustion,
continuation-on-pullback, fixed RR — is not, by itself, a source of edge on
10 years of Gold or Nasdaq 1-minute data.

---

## Known limitations

- **Cannot verify the specific screenshotted trades** — sandbox OANDA is 403,
  R2 cache ends 2026-06-05. If this ever runs somewhere with live OANDA
  access (e.g. Railway), `js/volBacktestEngine.js`'s `fetchM1Range` could pull
  the exact 13–14 Aug 2026 window and this same engine's logic could be
  checked bar-by-bar against those screenshots directly.
- **One trade/day, first qualifying setup by default** — deliberately
  low-DOF (Build Plan discipline). `maxTradesPerDay` cfg now exists to
  relax this (tested, see below) — a 2nd+ same-day setup turns out to be
  the norm (~97% of days), but taking it doesn't help.
- **NQ is OANDA's `NAS100_USD` CFD proxy**, not real CME NQ/MNQ futures data —
  no futures-contract Nasdaq data exists anywhere in this repo. Correlated but
  not identical to what a futures trader like the screenshots (`MNQ1!`) sees
  tick-for-tick.
- **The direction pin (continuation, not fade) is a read of two screenshot
  sequences**, not a confirmed rule — the discretionary trader may use both
  depending on context. A fade variant (buy the *extreme* of the impulse
  rather than the pullback) was not built or tested here; would be a natural
  next formalisation to pin and run the same way.
- **Retracement band (38.2–61.8%) and stop buffer (0.25×ATR) are standard,
  not fit** — consistent with the "start with the minimal-DOF version" rule,
  but also means a differently-pinned band/buffer wasn't tried.

**Follow-up tested: a small dynamic stop, on the "if it's going to lose it
loses fast" premise** — also null, on both instruments. See
[MAE_DYNAMIC_STOP.md](MAE_DYNAMIC_STOP.md).

**Follow-up tested: relaxing "one trade per day"** — a 2nd+ qualifying setup
the same day is the norm (~97% of days), not rare, but taking it just
realizes more of the same negative-edge trades faster; Sharpe gets
monotonically worse as more are allowed, on both instruments. See
[MULTI_TRADE_PER_DAY.md](MULTI_TRADE_PER_DAY.md).

**Follow-up tested: session/time-of-day split** — no hour-of-day subset
survives a real sample-size + IS/OOS-consistency bar, either instrument.
Caught and fixed a real confound along the way (fill-time clustering near
UTC midnight was a day-loop artifact, not a session effect). See
[SESSION_SPLIT.md](SESSION_SPLIT.md).

**Follow-up tested: a liquidity-sweep filter** (only count a leg whose
origin swept the prior day's H/L first) — a real, IS/OOS-consistent
improvement on both instruments (Gold Sharpe −5.99→−1.89, NQ −2.49→−0.93),
but still net negative. The strongest result in this whole line of testing
so far; reported straight, not oversold. See
[LIQUIDITY_SWEEP_FILTER.md](LIQUIDITY_SWEEP_FILTER.md).

**Follow-up tested: a VWAP-anchored entry band** (distance from session
VWAP instead of a fixed Fib retracement fraction) — also a real, threshold-
robust improvement on both instruments (Gold →−3.66, NQ →−0.76 at every
threshold tried), still net negative. See
[VWAP_ENTRY_BAND.md](VWAP_ENTRY_BAND.md).

**Follow-up tested: flipping the range gate** (require an already-stretched
day instead of room-left) — the strongest result of every test run against
this engine: Sharpe improves monotonically (mostly) as the threshold rises,
reaching −0.48 (gold) and **−0.10 with PF 0.961** (NQ) at the highest
threshold tried — still a loser, but the closest any variant has come to
breakeven. See [RANGE_GATE_FLIP.md](RANGE_GATE_FLIP.md).

**Taken together**, every follow-up that showed a real, IS/OOS-consistent
improvement (this one, the liquidity sweep, and the VWAP band) shares a
theme — "the day/move is already significant" beats "wait for it to look
tidy." None of them cross into positive Sharpe on their own; whether
combining them does is untested.

---

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/run_one.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/run_one.mjs nq   education/jordan_impulse_range_backtest/data ./portfolioBacktest/cache
node education/jordan_impulse_range_backtest/scripts/sensitivity.mjs
node js/legoBricks.test.mjs   # includes rangePercentileCore's synthetic unit tests
```

Per-trade logs: `data/gold.trades.json`, `data/nq.trades.json`. Summary cards
(full/IS/OOS + buy-and-hold benchmark): `data/gold.summary.json`,
`data/nq.summary.json`.
