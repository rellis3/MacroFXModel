# Nasdaq Macro Lead

**Research tool, not a trading bot.** No orders, no KV config/credentials, no
position sizing — this exists to answer one question honestly: *does a
composite line built from macro proxies track NAS100 ahead of price?*

Runs **natively in the Railway dashboard process** (`server.js`) — no Python
subprocess. The math lives in [`js/nasdaqMacroLeadCore.js`](../js/nasdaqMacroLeadCore.js)
(pure, unit-testable, no I/O); the fetch + orchestration lives inline in
`server.js` (the "Nasdaq Macro Lead: native in-process scheduling" block),
reusing `fetchOandaCandleRange` (already hardened for the NAS100/gold
"403 unexplainable" instrument quirks that plain OANDA calls hit) and
`fetchFredObservations` (`js/zscoreSpreadEngine.js`) rather than
reimplementing HTTP fetch — the same pattern
[`js/yieldSpreadCore.js`](../js/yieldSpreadCore.js) +
[`js/yieldSpreadEngine.js`](../js/yieldSpreadEngine.js) already use for the
live yield-spread signal.

(An earlier version of this ran the same logic as a Python subprocess,
mirroring `SessionResearch`'s scheduling pattern — see git history if that's
useful context. It was replaced because this repo's "the dashboard already
has the API access" is the Node process itself, and running natively removes
a whole layer — subprocess spawning, `python` path resolution, cross-process
JSON — that isn't needed when the fetch helpers it needs already live in the
same process.)

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
4-hours-out framing of the original chart — with three variants:

1. **`fast`.** Daily FRED yields update once a day; a 4h horizon needs
   something that updates every bar. This variant uses continuously quoted
   OANDA instruments instead: UST bond CFDs (`USB10Y_USD`, `USB02Y_USD` —
   price moves inverse to yield) as the rate proxy, a USD basket built from
   the majors, and gold.
2. **`fred`** runs alongside it, using the same daily yield series as the
   existing study, forward-filled onto H4 bars — included specifically so a
   null result there (expected, given the daily-horizon finding) has
   something to be compared against.
3. **`fairvalue`** — a structurally different LEVEL regression rather than a
   return regression, added after the first two produced a visually jagged
   line that didn't resemble the smooth "fair value" style chart the request
   was actually modeled on. See its own section below.

## Methodology — same discipline as `yield_asset_coupling.py`, adapted to walk-forward

The original study fits one regression over the whole sample and reports
its stats — legitimate for a stats table, but if you turned that fit into a
line and plotted it over the same sample, it would look like a leading
indicator whether or not it actually is one (the classic curve-overlay
illusion). This package instead runs an explicit walk-forward loop
(`nasdaqMacroLeadCore.walkForward`):

- Fit an OLS on a rolling window (default 500 H4 bars ≈ 83 days), predicting
  the **next bar's** log return from **this bar's** z-scored macro features
  (features are z-scored against a trailing window that never looks past the
  current bar).
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
  honest analogue to "the blue line." Returned (and charted) as an **array of
  segments, one per window** rather than one flat series — a window that
  drifted far from reality by its last bar still resets cleanly at the next
  window's real-price anchor, and flattening that into a single line would
  draw a straight connecting segment across the reset (a visible "cliff"
  that looks like a rendering bug, not the reset it actually is). The
  dashboard renders each segment as its own line so a reset shows as a gap.
- **`next_bar_pred`** — at each bar, the model's forecast for the very next
  bar's close, plotted at the current bar. The direct test of "does the line
  arrive before the candle."

## Honesty checks (`nasdaqMacroLeadCore.oosStats`, ported from `yield_asset_coupling.py`)

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

## The `fairvalue` variant — a LEVEL regression, not a return regression

`fast`/`fred` above predict the **next bar's return** from the **change** in
a macro factor — economical for honesty-testing, but a compounding sum of
noisy return predictions produces a visibly jagged line, and a real reset
between walk-forward windows (see `window_path` above) looks like a
rendering glitch even once fixed. That's not what a "macro fair value" chart
actually looks like — those are smooth, because they regress the **level**
of the index on the **levels** of its macro drivers, and levels move slowly
bar-to-bar compared to returns.

`nasdaqMacroLeadCore.levelFairValue` does exactly that: walk-forward OLS
fitting NAS100's **level `horizonBars` bars ahead** (default 8 ≈ 32h — "a
rough expectation of the next day plus part of the following day") on
**today's z-scored macro LEVELS**:

| Factor | Source | Why this one, not its sibling |
|---|---|---|
| Front-end rate | `bond2_level` (`USB02Y_USD` price) | Continuously quoted, not daily |
| Long-end rate | `bond10_level` (`USB10Y_USD` price) | Continuously quoted, not daily |
| Real yield | `real10_level` (FRED `DFII10`) | Economically distinct from the nominal proxies above (the discount-rate channel growth stocks are most sensitive to) — not redundant with bond10/bond2 |
| USD strength | `usd_basket_level` | A synthetic index (start=100, compounded from the same FX-basket return `fast` uses) — "USD level" isn't a single traded instrument |
| Risk/inflation hedge | `gold_level` | |
| Curve shape | `slope_level` (FRED `y10-y2`) | Captures steepening/flattening dynamics distinct from either rate level alone |

Deliberately **one series per macro dimension** — e.g. not both `bond10_level`
*and* `y10_level`, which are two proxies for the same 10Y rate and would just
destabilize the OLS fit for no informational gain.

Three properties make this different from `fast`/`fred`:

- **Smooth by construction, not by display-time smoothing.** No moving
  average is applied anywhere in this pipeline — the smoothness comes
  entirely from regressing on slow-moving levels instead of compounding
  noisy per-bar return predictions.
- **Refit CONTINUOUSLY, one bar at a time — not in 100-bar blocks like
  `fast`/`fred`.** `fast`/`fred` fit once per 100-bar window and freeze
  those coefficients for the whole block, which is fine for their return
  regressions (`window_path` already shows each block as its own segment,
  gapped at the reset). `levelFairValue` instead refits on every single bar
  (`testBars: 1, stepBars: 1` — trained on the trailing `trainBars` window,
  predicting only that one bar, then rolling forward by one and repeating).
  This matters in practice, not just in theory: block-stepping produced
  single-step jumps up to ~14% in testing whenever a block boundary landed
  where the macro relationship had shifted — a vertical "cliff" with no
  window boundary to gap around, so unlike `window_path` it read as a
  rendering bug. Continuous refit cut the worst-case jump to under 3% in
  the same test. It costs roughly a second of server time for 2.5 years of
  H4 data — trivial next to the 10-30s the OANDA fetch itself already
  budgets for.
- **It projects past the end of known history.** For the most recent
  `horizonBars` bars, the target (NAS100's level that far ahead) doesn't
  exist yet — those rows still get a prediction (`scored: false`, a
  synthesized future timestamp) instead of being dropped. That unscored tail
  *is* "the rough expectation of the next day or so"; everything before it
  (`scored: true`) is the walk-forward track record, gradeable through
  `oosStats` exactly like `fast`/`fred`'s output. The dashboard renders the
  two halves as one continuous line — solid where it's backtested, dashed
  where it's a live, ungraded projection — so it's never possible to mistake
  the guess for the track record.

## TradingView port

[`tradingview/nasdaq_macro_fairvalue.pine`](tradingview/nasdaq_macro_fairvalue.pine)
is a Pine v6 port of the `fairvalue` methodology above, for anyone who wants
this on their own TradingView chart instead of the Railway dashboard.

TradingView has continuous quotes for most of `fairvalue`'s factors, and two
are actually better proxies there than what OANDA offered: `TVC:DXY` is a
real, continuously-quoted USD index (no need to build the synthetic
FX-basket `usd_basket_level` this package computes for OANDA), and
`TVC:US10Y - TVC:US02Y` is a continuously updated curve slope instead of the
daily FRED one. `FRED:DFII10` covers the real-yield leg the same way FRED
does here.

Two things are genuinely different in the Pine version, not just ported:

- **`plot(pred, offset=horizonBars)`** draws the prediction shifted forward
  in time on the chart — Pine's native mechanism for exactly the "line
  arrives before the candle" effect this whole package exists to test
  honestly, replacing the synthesized-future-timestamp `tail_path` trick
  the JS/dashboard version needs.
- **Refit cadence is periodic (default every 20 bars), not per-bar.**
  Rebuilding a `trainBars`-row training matrix and inverting it on every
  single bar, for years of intraday history, is too much for Pine's
  per-bar compute budget. Coefficients update every `refitEvery` bars;
  the z-scored inputs still update every bar in between, so the line stays
  smooth without reintroducing the block-refit "cliff" `levelFairValue`
  had to fix (see above) — the cadence trade-off is coarser than the JS
  version's continuous refit, tune `refitEvery`/`trainBars` against your
  own plan's compute limits.

The full `oosStats` honesty suite (rank-IC, t-stat, circular-shift null,
split-half stability) isn't reproduced — running that every bar isn't
practical in Pine. The script instead plots a plain rolling correlation
between backtested predictions and realized price as a rough live gauge;
treat it as a prompt to go check the real stats on the dashboard, not as a
replacement for them.

**This file has not been run in a Pine Editor** — there's no way to execute
Pine Script from wherever this was authored, unlike the rest of this
package, which is unit-tested offline. Treat it as a first draft: paste it
into TradingView's Pine Editor, fix whatever doesn't compile, and confirm
ticker availability (`TVC:US10Y`, `TVC:US02Y`, `TVC:DXY`, `TVC:GOLD`,
`FRED:DFII10`) on your plan before trusting any output.

## Running it

It runs automatically on Railway: `server.js`'s "Nasdaq Macro Lead: native
in-process scheduling" block fires once on boot and then every 4 hours (one
NAS100 H4 bar), same `setInterval` pattern as every other periodic refresh
in that file. It needs `OANDA_KEY` and `FRED_KEY` in the environment —
already set on Railway for the other bots that use them — and will log
`[nasdaq-macro-lead] OANDA_KEY/FRED_KEY not set — skipping` and do nothing
if either is missing.

Output is written to `NasdaqMacroLead/out/dashboard_summary.json`
(gitignored — generated, not checked in) and served from
`GET /api/nasdaq-macro-lead/summary`, charted at
[`/nasdaq-macro-lead.html`](../nasdaq-macro-lead.html).

To exercise the math in isolation (no network needed — everything in
`js/nasdaqMacroLeadCore.js` is pure), feed it synthetic `{t, close}` bars
directly; there's no CLI entry point for this since it only ever runs inside
the server process.

## Known limitations

- **Bond CFD instrument codes are unverified against the live API from
  wherever this was authored** — `USB10Y_USD` / `USB02Y_USD` are the
  standard OANDA v20 names but aren't used elsewhere in this repo. A failed
  instrument degrades to "feature missing" (see `features_missing` per
  variant in the API response / dashboard) rather than crashing the whole
  run — check the `[nasdaq-macro-lead]` Railway log lines after the first
  tick to see if that happened.
- **~2.5 years of H4 history per run.** `fetchOandaCandleRange` paginates
  fully (unlike a single 5000-candle request), so this is a deliberate scope
  choice for a research tool refreshed every 4h, not a technical ceiling —
  widen the window in `_computeNasdaqMacroLeadSummary` if a longer walk-
  forward history is wanted.
- **A FAIL verdict here doesn't mean "macro data is useless for Nasdaq"** —
  it means these specific proxies, at this specific horizon, with this
  specific walk-forward setup, didn't clear the bar. It's a negative result
  about one hypothesis, not a general claim.
- **Level regressions are more prone to spurious fit than return regressions**
  — two series that both trend can correlate mechanically even with no real
  relationship. The rolling z-scoring and walk-forward refitting mitigate
  this some (the fit can't lean on the FULL-sample trend, only the trailing
  window's), but `fairvalue`'s honesty checks (same `oosStats` as
  `fast`/`fred` — rank-IC, circular-shift null, split-half stability) matter
  MORE here, not less, precisely because a smooth line is more visually
  persuasive than a jagged one whether or not it's actually predictive.
  Don't read smoothness as evidence of skill — read the stats panel.
