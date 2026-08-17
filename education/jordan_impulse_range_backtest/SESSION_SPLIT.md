# Session/time-of-day split — no hidden edge, but a real methodology trap found along the way

Follow-up to the baseline backtest ([RESULTS.md](RESULTS.md), Sharpe −5.99
gold / −2.49 NQ). Question: the backtest pools all 24 hours. If the setup
only really works during a specific session (London open, NY open), pooling
would hide it. Script: [`scripts/session_split.mjs`](scripts/session_split.mjs).

## A confound found first, and fixed before trusting anything

A first pass bucketed each trade by its **fill hour** (UTC). Result: 77% of
all gold trades landed in hours 22:00–04:00, essentially none 05:00–21:00 —
and within the hour-00 bucket specifically, **78% of trades filled within 30
minutes of UTC midnight** (median 14 minutes in). That's not a market-hours
effect — it's the day-loop's own design: the engine re-scans from UTC
midnight every day and takes the FIRST qualifying setup, which is very often
a leg that fully formed *before* midnight (carried over from the prior
day/session). The trade's fill time gets artificially anchored to day-start
regardless of when the underlying pattern actually formed — bucketing by
`fillTime` would have reported a fake "session" finding.

Fixed by adding `legOriginTime`/`legExtremeTime` to the engine's trade
output (purely additive, verified to change no existing field) and
re-bucketing by `legExtremeTime` — the moment the leg's own pullback begins,
immune to the day-boundary artifact.

## Result on the corrected timestamp: still no subset survives

**Gold** — 5 hour-cells have n≥30 (00, 01, 22, 23, plus one with n=32);
every one is clearly negative (Sharpe −0.79 to −5.91), IS and OOS. Cells
below n=30 are noise-sized and excluded regardless of how they look.

**NQ** — 4 hour-cells have n≥30 (00, 01, 22, 23); same story, all negative
(−0.58 to −2.31). One small cell (hour 20, n=17) shows Sharpe +0.77 with
both IS (n=11) and OOS (n=6) positive — genuinely eye-catching, but n=17 is
under the pre-registered n≥30 bar and is exactly the kind of small-sample
result multiple-testing predicts by chance (24 hourly cells tested, ~1
"significant"-looking cell expected from noise alone at a loose 5% rate,
per CLAUDE.md's disaggregation discipline). Flagged, not treated as a
finding.

**Survivors (n≥30, full+IS+OOS Sharpe all >0): none, either instrument.**

Full detail: `data/gold.session_split.json`, `data/nq.session_split.json`.

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/session_split.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/session_split.mjs nq   education/jordan_impulse_range_backtest/data
```
