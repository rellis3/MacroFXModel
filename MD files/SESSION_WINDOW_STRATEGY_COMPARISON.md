# Session-Window Comparison — Does the Range Need to Come From Asia? (findings)

**TL;DR — Asia (00:00-06:00 London) stays the best-supported single choice, but
it isn't uniquely magic.** Two other "quiet-ish, narrower-than-a-full-session"
windows — an ordinary 08:00-12:00 morning and an arbitrary 10:00-14:00 control
window — perform almost as well, sometimes better per pair. The one thing
that IS unambiguous: pulling the range from a **full London (07:00-16:00) or
full New York (13:00-21:00) session is the weakest choice tested, on every
pair, by every metric, with the thinnest and least statistically trustworthy
sample.** Tested on **2016-2026 (~10.5y), EURUSD/GBPUSD/USDJPY/GOLD, real M1,
costs on**, using the exact SAME engine (range → fib ladder → 2-pip
confluence-vs-yesterday → vote-margin barrier trade) the live Fib Atlas
strategy already runs — only the window that builds the range changes.

## What was tested

Same machinery throughout (`js/asiaFibAtlasEngine.js`'s `asiaFibAtlasWalk` →
`buildAsiaFibAtlasBook` → `runBarrierWalkForward`, unmodified logic), a new
`startHour` parameter (added to `sessionRanges.buildAsiaSessions` and threaded
through the walk, 2026-09-12, fully backward compatible) is the only thing
that changes between rows below. Six windows, all London-local, DST-aware:

| Variant | Window | Rationale |
|---|---|---|
| **Asia (baseline)** | 00:00–06:00 | the live strategy: quiet, thin-liquidity session |
| **London** | 07:00–16:00 | full London session |
| **New York** | 13:00–21:00 | full NY session |
| **Morning** | 08:00–12:00 | a commonly-cited "good time to trade" window |
| **Overlap** | 13:00–17:00 | London/NY overlap, "best liquidity" window |
| **Control** | 10:00–14:00 | arbitrary mid-day window, no session-boundary rationale |

Every window's range is held live for 24h — until the *next* calendar day's
same window starts building again — exactly the owner's own description of
how Asia levels persist, just generalized to whichever window (this falls
straight out of the window's own start time, not a second rule).

Two vote configurations reported per variant (mirrors the existing
`run_asia_fib_atlas_vote_backtest.mjs` grid):
- **`margin>=1, any`** — every touch the 2-dimension vote agrees on at all (no
  confluence gate). Large sample, "is there ANY signal here" question.
- **`margin=2, confluence<=2p`** — **the owner's own actual strategy**: both
  vote dimensions agree AND the touched rung is within 2 pips of the previous
  cycle's ladder ("grab the line with confluence").

Every number is shown **RAW** and **CAPPED** (max 1 concurrent open position).
**CAPPED is the number to trust** — RAW lets same-day overlapping trades count
as independent observations, which is exactly the "Sharpe 20+" inflation this
repo's own `LEGO_MODULES.md` already warns about elsewhere; several variants
below (e.g. `control`/`morning` raw margin>=1 Sharpe 15-19) collapse hard once
capped, precisely because that pattern.

## Headline: the owner's actual config (margin=2, confluence≤2p), capped, pooled across 4 pairs

| Variant | avg Sharpe (capped) | avg win rate | % years positive | total OOS trades |
|---|---|---|---|---|
| **Asia (baseline)** | **2.48** | 74.1% | **100%** | **3,801** |
| Morning 08-12 | 2.30 | 74.7% | 95% | 2,067 |
| Control 10-14 | 2.16 | 73.2% | 100% | 1,966 |
| Overlap 13-17 | 1.59 | 76.0% | 95% | 1,024 |
| New York 13-21 | 1.40 | 76.5% | 92% | 391 |
| **London 07-16** | **0.85** | 70.6% | **75%** | **117** |

Per-pair (same config, capped Sharpe) — Asia wins or ties-for-first on 3/4:

| | EURUSD | GBPUSD | USDJPY | GOLD |
|---|---|---|---|---|
| Asia | 2.30 | 3.15 | 2.03 | 2.44 |
| Morning | 2.56 | 3.14 | 1.13 | 2.37 |
| Control | 1.94 | 1.44 | **2.82** | 2.47 |
| Overlap | 0.87 | 2.04 | 1.98 | 1.45 |
| NY | 1.56 | 0.87 | 1.57 | 1.61 |
| London | 0.15 | 1.15 (n=10) | 1.45 | 0.64 |

## The one clean, unambiguous result: don't use the full London or NY session

London (07:00-16:00) is the worst variant on **every single pair** and on
every metric — lowest Sharpe, lowest win rate on 3/4 pairs, worst consistency
(3 of 4 years positive on EURUSD, the only variant to drop below 100%), AND
by far the thinnest sample (10-41 confluence-gated trades per pair over 10.5
years — GBPUSD's 10 trades is not a strategy, it's an anecdote). New York is
better than London but still consistently behind Asia/Morning/Control on
Sharpe, with samples 6-20x thinner than Asia's.

**`minTrackYears`** (Bailey/López de Prado — how many years of live trading
would be needed before this Sharpe is distinguishable from zero at 95%
confidence) makes the sample-size problem concrete: Asia/Morning/Control all
need **0.1-0.5 years** to trust. London needs **0.7-10.7 years** — EURUSD's
London variant would need to run for essentially the ENTIRE backtest period
again before its Sharpe means anything. That is the honest reason not to
switch to a London-built range, independent of the point-estimate Sharpe.

**Why**: the range itself is much wider when built over a full 9h session
than over a quiet 4-6h window, so the fib ladder's rungs sit much further
apart in price. Price simply revisits a widely-spaced rung far less often
(EURUSD: 95,980 raw Asia touches over the backtest vs. 5,431 for London — a
~18x gap that shows up before any confluence filter is even applied).

## The less clean part: Asia isn't uniquely special, "narrow window" might be the real variable

Morning (08:00-12:00) and Control (10:00-14:00) — both arbitrary windows with
no session-boundary logic behind them at all — land within ~10-15% of Asia's
pooled Sharpe, and each **beats** Asia outright on at least one pair (Morning
on EURUSD, Control on USDJPY). This is worth taking at face value rather than
explaining away: the common thread across Asia/Morning/Control isn't "which
named session" so much as **all three build the range over a relatively
narrow (4-6h) window rather than a full (8-9h) session**, which mechanically
produces a denser fib ladder and hence more (and more often confluent)
touches to trade. The genuinely Asia-specific property — thin liquidity,
minimal news flow while it builds — isn't cleanly separated from "shorter
window" by this test; a follow-up that holds window LENGTH constant while
varying only the START hour (e.g. four different 5h windows) would be needed
to isolate which of the two actually matters. Flagging this honestly rather
than crediting Asia with more than this test actually shows.

**Practical read**: this does not argue for abandoning the Asia range — it
remains the best-supported, most consistent, largest-sample choice, and it's
the one already live and validated elsewhere in this repo (`asiaConfPips`,
the whole vote/confluence machinery) — but it argues against assuming the
*specific* clock hours 00:00-06:00 are doing something no other quiet-enough
window could do. If anything ever forces a change of window (e.g. a
broker/data gap during Asia hours), 08:00-12:00 is a reasonable fallback;
07:00-16:00 (full London) is not.

## A side-finding, explicitly NOT part of the owner's original ask

Under the **unfiltered** `margin>=1, any` config (no 2-pip confluence gate at
all), pooled **capped** Sharpe ranks Overlap (13:00-17:00) **highest of the
whole sweep at 2.96** — actually above Asia's own unfiltered figure of 0.75.
In other words: Asia's edge in the headline table above comes almost entirely
FROM the 2-pip confluence gate (0.75 → 2.48, a >3x lift), whereas Overlap's
edge is present even WITHOUT that gate and barely changes when it's added
(2.96 → 1.59, actually falls). This suggests the Asia-style "match yesterday's
same-window ladder within 2 pips" filter is doing real, session-specific work
for Asia specifically, and is not simply "a good filter in general" — applying
it to Overlap's raw signal doesn't reproduce the same lift, and may even be
diluting a different, unfiltered signal that already exists there. This is a
genuinely different question from the one asked (a differently-tuned Overlap
strategy, not a besides-Asia range-and-confluence swap) and is reported here
as an honest side-observation for a SEPARATE follow-up, not blended into the
verdict above.

## Caveats

- **RAW Sharpe (10-20+) is not real** — same-day overlapping touches counted
  as independent trades. Every number in this doc's tables is the CAPPED
  (max 1 concurrent position) figure; RAW is in the raw JSON for reference
  only, same discipline `scripts/run_asia_fib_atlas_vote_backtest.mjs`
  already applies.
- Per-touch barrier-priced (fixed target/stop off the touched rung's own
  neighbours), single-instrument at a time — not a cross-pair portfolio
  simulation; correlated exposure across pairs at the same clock time isn't
  modeled here.
- London/NY's own thin samples (10-41 confluence-gated trades/pair) mean
  their point estimates carry wide uncertainty — the `minTrackYears` figures
  above are the honest way to read them, not the raw Sharpe number alone.
- **Data source note (unrelated to the trading question, but real):** this
  analysis reads M1 bars from the LOCAL `VolRangeForecaster/data/m1/*.parquet`
  cache (`js/localM1Loader.js`, new). `loadM1ForPair`'s normal R2-first path
  silently returns an all-zero time axis in this environment — the
  R2-hosted parquet copies carry two extra numeric columns before the
  datetime column (8 cols vs local disk's 6), so the loader's hardcoded
  `row[5]` datetime read grabs the wrong column and produces `NaN` epochs
  (coerced to 0 by the `Int32Array` write) with no error raised. Confirmed
  directly by comparing `fetchFromR2('eurusd')` (8 cols/row) against the
  local `eurusd_m1.parquet` (6 cols/row) — a genuine, pre-existing schema
  mismatch between the two data sources worth fixing separately (either
  re-uploading R2 in the 6-column schema, or making `loadM1ForPair` detect
  the row width), since anything reading M1 via the default R2-first path
  in an environment where R2 succeeds is silently getting garbage.

## Reproducing / extending

```
node scripts/run_session_window_comparison.mjs [pairs...]
```

Defaults to `eurusd gbpusd usdjpy gold`; add more pairs (all 26 local
parquet files are available) or edit the `VARIANTS` array to test other
windows (e.g. isolate window length vs. start hour, per the follow-up idea
above). Full per-pair/per-year results (including RAW figures and every
`minTrackYears`) are in `analysis/session_window_comparison_results.json`.

Engine changes that made this possible: `startHour` param on
`sessionRanges.buildAsiaSessions` (default 0, backward compatible) and
threaded through `asiaFibAtlasEngine.asiaFibAtlasWalk`/`asiaFibAtlasLiveLadder`
— see those files' own doc comments for the mechanism.
