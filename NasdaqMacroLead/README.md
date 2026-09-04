# Nasdaq Macro Lead

**Research tool, not a trading bot.** No orders, no KV config/credentials, no
position sizing — this exists to answer one question honestly: *does a
composite line built from macro proxies track NAS100 ahead of price?*

## Where this came from

A chart was shared showing a blue "forecast" line that appeared to move
before NAS100 candles reached the same level, said to be "derived from macro
factors" and compared to a UST 2s10s yield-spread-style indicator. The daily
horizon version of that exact question already exists in this repo —
[`analysis/yield_asset_coupling.py`](../analysis/yield_asset_coupling.py) —
and running it for NDX found no forward, tradeable coupling from any of the
classic yield drivers (y2/y10/y30/slope/real10/be10), including the 2s10s
slope specifically: strong *contemporaneous* correlation (yields and Nasdaq
obviously move together in the same window), essentially zero *forward*
correlation once the signal is lagged and tested out-of-sample.

This package asks the same question at H4 resolution — closer to the
4-hours-out framing of the original chart — with two changes:

1. **Faster inputs.** Daily FRED yields update once a day; a 4h horizon needs
   something that updates every bar. The "fast" variant uses continuously
   quoted OANDA instruments instead: UST bond CFDs (`USB10Y_USD`,
   `USB02Y_USD` — price moves inverse to yield) as the rate proxy, a USD
   basket built from the majors, and gold.
2. **A "fred" variant runs alongside it**, using the same daily yield series
   as the existing study, forward-filled onto H4 bars — included specifically
   so a null result there (expected, given the daily-horizon finding) has
   something to be compared against.

## Methodology — same discipline as `yield_asset_coupling.py`, adapted to walk-forward

The original study fits one regression over the whole sample and reports
its stats — legitimate for a stats table, but if you turned that fit into a
line and plotted it over the same sample, it would look like a leading
indicator whether or not it actually is one (the classic curve-overlay
illusion). This package instead runs an explicit walk-forward loop
(`engine.walk_forward`):

- Train an OLS on a rolling window (default 500 H4 bars ≈ 83 days),
  predicting the **next bar's** log return from **this bar's** z-scored
  macro features (features are z-scored against a trailing window that never
  looks past the current bar).
- Freeze those coefficients and predict the **next** 100 bars — a segment the
  fit never saw.
- Roll forward 100 bars and repeat.

Every point in the output is therefore out-of-sample by construction. There
is no in-sample region to accidentally chart.

Two chart-ready series come out of the same walk-forward predictions:

- **`window_path`** — the model's cumulative projected price, re-anchored to
  the real close at the start of each walk-forward window (so one bad window
  can't drag the whole line off-screen). The value plotted at bar *t* uses
  only predictions made strictly *before* bar *t* — this is the closest
  honest analogue to "the blue line."
- **`next_bar_pred`** — at each bar, the model's forecast for the very next
  bar's close, plotted at the current bar. The direct test of "does the line
  arrive before the candle."

## Honesty checks (`engine.oos_stats`, ported from `yield_asset_coupling.py`)

- **Rank IC** and a **t-stat** on the OOS prediction stream (h=1, non-overlapping, so no Newey-West correction is needed).
- **Circular-shift null p-value** — how often does randomly-shifted noise on
  this data produce an |IC| at least this large?
- **Split-half stability** — does the sign of the IC survive from the first
  half of the OOS period to the second?

The dashboard page's "verdict" only shows PASS when all three clear a bar
(`|IC| > 0.03`, `p_null < 0.05`, sign-stable across both halves) — the same
combination `analysis/yield_asset_coupling.py`'s own `report()` function
requires before calling something a survivor. Expect FAIL to be the more
likely outcome, consistent with the daily-horizon result; that's a real
answer, not a bug.

## Running it

```bash
# needs OANDA_KEY and FRED_KEY in the environment (Railway has both already)
python -m NasdaqMacroLead.dashboard_export
```

Writes `NasdaqMacroLead/out/dashboard_summary.json` (gitignored — generated,
not checked in). On Railway, `server.js` runs this automatically every 4
hours (one NAS100 H4 bar) via the same native `setInterval` + `_execFileAsync`
pattern already used for `SessionResearch` — see the
"Nasdaq Macro Lead: native in-process scheduling" block in `server.js`. The
dashboard reads it from `GET /api/nasdaq-macro-lead/summary` and charts it at
[`/nasdaq-macro-lead.html`](../nasdaq-macro-lead.html).

## Known limitations

- **Bond CFD instrument codes are unverified against the live API.**
  `USB10Y_USD` / `USB02Y_USD` are the standard OANDA v20 names but aren't
  used anywhere else in this repo, and the environment this was built in
  couldn't reach OANDA to confirm them (network policy). `data.fetch_oanda_h4`
  degrades a failed instrument to "feature missing" rather than crashing —
  check the first Railway log line after deploy (`OANDA <instrument> fetch
  failed`) to see if that happened, and check the dashboard page's
  `features_missing` list per variant.
- **2.3 years of H4 history per run** (OANDA's 5000-candle cap on one
  request, no pagination implemented — this is a research tool refreshed
  every 4h, not a backtest needing the full 20-year history the daily study
  uses).
- **A FAIL verdict here doesn't mean "macro data is useless for Nasdaq"** —
  it means these specific proxies, at this specific horizon, with this
  specific walk-forward setup, didn't clear the bar. It's a negative result
  about one hypothesis, not a general claim.
