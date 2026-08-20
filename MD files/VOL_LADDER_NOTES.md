# Vol Forecast Ladder — build notes and open items

Companion to `js/forecastLadder.js`. Records what was measured, what shipped, and —
mostly — what did **not** ship and why, since that is the part a future session will
otherwise re-derive from scratch.

Last updated: 2026-08-20.

---

## What shipped

The **Forecast** export family: one fitted quantile ladder replacing the old Original
/ Bot / Calibrated / Export-v2 variants. p50 / p75 / p90 for H-L, O-C, O-H, O-L,
daily / weekly / monthly, per instrument.

Parameters come from `forge/out_vol_v2/vol_report.json` (10 years, 6 folds, 32
instruments), exported to `js/forecastLadderParams.js`. Pooled OOS across 192
instrument-folds, every rung lands within **0.9pp** of nominal.

The **COG** family is unchanged and deliberately separate — it reproduces COG's own
published line, which is a different job from being calibrated to realized range.

Before/after on the thing that motivated the rebuild (65 live sessions, walk-forward):

| | live before | fitted after |
|---|---|---|
| p50 exceedance | 12-37% | 50.3% |
| p75 exceedance | 3-22% | 25.4% |
| SPX500 / US30 / UK100 p50 | 12% / 14% / 13% | 49% / 51% / 50% |

---

## Two live bugs fixed on the way

1. **AUD pairs were discounted on AU event days.** `detectEventTag` filtered
   `country === 'US'`, so 2026-08-20 — two HIGH-impact AU releases (Employment
   Change, Unemployment Rate), no US ones — tagged `none` and applied the ~x0.90
   quiet-day discount to AUDUSD and AUDJPY. The feed had those events; today.html was
   already displaying them. Tagging is per instrument now (`detectEventTagFor`), and
   that day resolves to `high` -> x1.13.

2. **A dead calendar feed looked like a quiet day.** `fetchNewsEvents` returned `[]`
   both when the feed said "nothing on" and when it failed. The first earns the
   discount; the second must not. It returns `null` on failure now, and a null tag
   yields x1.0.

---

## What did NOT ship: the ForexFactory event refit

The live calendar path reads ForexFactory. The event multipliers were fit on
`calendar_events.csv`, a different provider that rates the SAME events differently
(ForexFactory calls Building Permits and Housing Starts Low; the CSV calls both
Major) and carries only USD/EUR/GBP. So refitting on ForexFactory's own history
should have been strictly better.

Source: `https://huggingface.co/datasets/Ehsanrs2/Forex_Factory_Calendar` — 83,427
rows, 2007-01-01 -> 2025-04-07, MIT, all nine currencies. Downloaded to
`data/calendar/` (gitignored, 68MB).

**The dates needed repair and it worked** (`forge/ff_calendar.py`). 31% of
high-impact rows sit at 19:30/20:30 UTC = midnight Asia/Tehran, the scrape timezone:
rows where the scraper could not read a clock time and used midnight on the correct
ForexFactory day, which rolls back a day in UTC. Per-row rule — placeholder time ->
Tehran date, real time -> UTC date. NFP-lands-on-a-Friday went 26% -> 91%; the audit
set mean went **0.459 -> 0.923**.

**But the refit lost the controlled comparison.** Mean last-fold OOS gap vs nominal:

| run | window | calendar | gap50 | gap75 |
|---|---|---|---|---|
| A | full 10y | old CSV | **+0.003** | **+0.004** |
| B | 9y -> 2025-04 | old CSV | +0.014 | +0.017 |
| C | 9y -> 2025-04 | ForexFactory | +0.030 | +0.035 |
| D | 9y -> 2025-04 | ForexFactory + holiday bucket | +0.033 | +0.039 |

B vs C isolates the calendar; A vs B isolates the window. The calendar change costs
+0.016/+0.018 — larger than the window change — and ForexFactory beat the old
calendar on 4/32 instruments (3/32 with the holiday bucket). The decision rule was
set before the run: beat B on the same window or do not ship. It did not.

Run A's parameters therefore remain in production, with `other` aliased to `high` so
the new tagger's vocabulary resolves them.

**Do not simply re-run this expecting a different answer.** Two things were already
tried:

* A `medium` bucket. It fitted at 0.98-1.07 (no measurable effect) and, worse, it
  starved `none`: with medium days removed, "no scheduled release at all" came to
  mean *public holiday* — 40% Mondays, 15% Sundays, most common dates Jan 1, Dec 25,
  Dec 26, Dec 24, Jul 4 — and fitted at **0.43**. A real effect measured on the wrong
  variable. Shipping it would have been actively dangerous: the live feed covers one
  week and is fetched intraday, so any sparse response would have halved every band.
* An explicit `holiday` bucket (ForexFactory marks these itself, 1,654 rows, and the
  live feed carries the same value). It cleaned `none` up properly — the holiday
  signature disappeared from its date distribution — but moved the score the wrong
  way by another +0.003/+0.005.

Leading hypothesis for the residual, untested: the per-instrument currency union
makes `high` cover 48-57% of days, lumping a minor GBP release in with an ISM print.
The old US-only bucket was coarser in scope but more selective in what qualified. A
useful next attempt would narrow `high` (named recurring releases only, per currency)
rather than widen the calendar again.

The machinery is kept — repaired loader, independent audit, tests — because it is
correct and reusable. It just does not currently earn its place in the fit.

---

## Open items

1. **O-H / O-L drift conditioning.** Measured across drift terciles on 2,982 OOS days,
   10 instruments: O-H p50 exceedance runs 42.1% / 50.5% / 56.6% from down-drift to
   up-drift (O-L mirrors it, 55.4% / 45.9% / 44.0%). A 14.5pp swing, and larger in
   relative terms at p75. Two candidate forms, to be chosen by OOS pinball loss:
   (a) linear tilt `OH x (1 + beta*d)`, (b) the analytic drifted-BM running-max
   quantile (`_bmMaxQuantile`, already in `js/volForecast.js`) with a fitted scale.
   (b) is preferred — it is what the old v2 lines used for shape; only the magnitude
   was wrong, having borrowed `oc_50_corr`, a constant fit for close displacement.
   Until then the export prints drift as "reported, not applied".

2. **Thin-session / holiday bands.** The x0.43 effect is real and large. It should be
   modelled off a liquidity signal rather than calendar emptiness, and separately
   from the event layer.

3. **Capture the live ForexFactory feed daily to KV.** The free mirror is
   `thisweek` only (all other variants 404), so history in the exact vocabulary that
   runs live can only be accumulated going forward. A few lines in the scheduler; in
   six months it retires the CSV dependency and covers every currency.

4. **UK100 and DE30 fit at ~1.0 on every event bucket** where every other instrument
   shows 1.09-1.35. Their session is 00-20 UTC vs 00-23 for the US indices, which
   explains FOMC (19:00 UTC, European cash long closed) but NOT NFP at 13:30. Cause
   unknown — flagged rather than guessed at.

5. **Monthly rungs are the least certain part of the ladder.** Non-overlapping months
   give only ~120 observations in ten years, so the monthly fit uses overlapping
   20-day windows: unbiased but heavily autocorrelated, effective n ~107. Per-
   instrument monthly OOS varies widely (US30 0.38/0.09/0.00 vs USDCAD
   0.56/0.31/0.10). Weekly is solid; monthly is indicative.

6. **The M1 cache ends 2026-06-05.** No holdout check exists on the most recent
   ~2.5 months. Refresh and re-score before trusting the ladder with size.

7. **The 12 retired export builders** are still in `vol-forecast-v2.html`, marked and
   unreachable, so any one can be re-wired in a line. Delete once the Forecast family
   has a few live sessions behind it.
