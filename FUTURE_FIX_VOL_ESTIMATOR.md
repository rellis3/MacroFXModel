# Future fix — align the volatility estimator to the London-midnight session

**Status:** deferred (low priority). Documented 2026-07-05.
**Impact:** small — a fraction of a percentage point on the forecast band width.
Not urgent, but a real internal inconsistency worth closing eventually.

---

## The inconsistency

As of the London-midnight anchor work (PRs #701 and the session-tracker fix),
**everything that *applies* the forecast band is anchored to the London-midnight
session open** — the per-line book, the volatility-bot plan, the Daily Brief and
the intraday session tracker all use the one DST-safe anchor
(`londonMidnightSec()` / `fetchSessionOpenLondon`): 23:00 UTC in BST, 00:00 UTC
in GMT.

But the **σ (volatility) estimator that produces the band width is *not* built on
London-midnight-to-London-midnight daily bars.** It reads whatever daily bar the
data source returns:

| Instruments | Source | Daily boundary used | vs London midnight |
|---|---|---|---|
| FX + gold | OANDA `granularity=D`, **no alignment** (`js/volForecastScheduler.js` `fetchOHLCOanda`, ~line 115) | OANDA default = 17:00 New York ≈ **21:00 UTC (BST) / 22:00 UTC (GMT)** | off by ~1–2 h |
| Equity indices (NQ, SPX, DE30, US30, US2000, UK100) | Yahoo daily (`preferYahoo: true`) | exchange **RTH close** | not midnight at all |

So the "day" the vol magnitude is measured over is cut ~1–2 hours away (FX/gold),
or is an exchange session (indices), rather than the London-midnight-to-next-
London-midnight session the band is actually applied to and forecasts.

## Why the levels are still ~right (why it's low priority)

The forecaster does **not** read an empirical high/low distribution off the daily
bars. It extracts a **single number, σ**, then builds the band analytically from
theoretical constants (`js/volForecast.js`): `HL = 1.572σ` (Brownian range),
`OC = 0.6745σ` (half-normal). The *shape* is theory; only σ comes from the bars.
σ over a ~24-hour window barely changes if you slide the cut by an hour or two,
so the band width is close either way — the discrepancy is **points of a
percent**, not a structural error.

## Where the boundary shift *does* leak in (so the effect isn't exactly zero)

- **Rogers–Satchell / RS-EWMA** (gold/commodity) uses each bar's intraday OHLC —
  a different cut moves where the high/low/open/close land.
- **GARCH / HV20** (index/fx close-to-close) samples the daily *close* — a
  21:00-UTC close vs a 23:00-UTC close are different prices, so the
  close-to-close return series shifts slightly.
- **US-DST wrinkle:** OANDA's default boundary tracks *New York* DST (17:00 NY),
  while the anchor tracks *London* DST — so the FX/gold offset isn't even a
  constant hour across the year.

## The fix, when we do it

**FX + gold (clean, low-risk):** add `dailyAlignment=0&alignmentTimezone=Europe/London`
to the OANDA D1 fetch in `fetchOHLCOanda` (`js/volForecastScheduler.js`). OANDA
then returns daily candles opening at 00:00 Europe/London (DST handled by OANDA),
so σ is measured on the exact session the band is applied to. One-parameter change.

**Equity indices (messier — separate decision):** they're on Yahoo RTH daily by
design (`preferYahoo`, because OANDA's index CFDs price/settle oddly at 22:00 UTC).
A Yahoo RTH bar can't be realigned to London midnight; making the indices
session-consistent means resampling OANDA index M1/H1 → London-midnight daily
bars, with its own weekend / close-gap handling. Bigger change; decide separately.

## When to prioritise

- If a recalibration of the correction factors (`ASSET_PARAMS` in
  `js/volForecast.js`) is being done anyway — fold the alignment fix in first so
  the factors are fit against the correct session.
- If the band is ever validated bar-for-bar against realised London-midnight
  sessions and a systematic ~small bias shows up that tracks the boundary offset.

Otherwise: leave it. The anchor (the part that matters for *where* the levels
sit) is correct; this only sharpens the *width* by a sliver.
