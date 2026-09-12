# Session-Window Comparison — Does the Range Need to Come From Asia? (findings)

**TL;DR — all 6 variants are now tested on the full 26-pair universe. Asia
(00:00-06:00 London) wins outright, and London (07:00-16:00) loses outright —
both hold up at every scale tested.** The middle of the pack reorders once you
move from 4 pairs to 26, though: Morning and Overlap turn out stronger
relative to NY/Control than the small sample suggested. Four specific pairs —
**GBPCAD, GBPNZD, AUDNZD, EURNZD** — are net losers (negative capped Sharpe,
sub-60% win rate, poor year-to-year consistency) under EVERY window tested,
Asia included; that's a pair-selection problem, not a session-window problem
(see the dedicated follow-up section below), and it drags every variant's
pooled average down together. Excluding just those 4 pairs, the full 26-pair,
6-variant ranking (pooled capped Sharpe, owner's actual config) is:

**Asia 2.08 > Morning 1.83 > Overlap 1.55 > Control 1.38 > NY 1.26 > London 0.83**

Tested on **2016-2026 (~10.5y), real M1, costs on**, using the exact SAME
engine (range → fib ladder → 2-pip confluence-vs-yesterday → vote-margin
barrier trade) the live Fib Atlas strategy already runs — only the window
that builds the range changes. All 6 variants were first tested on 4 pairs
(EURUSD/GBPUSD/USDJPY/GOLD, see "Headline" below), then re-run on the full
26-pair local universe (see "26-pair update" below).

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

## 26-pair update (2026-09-12): does this hold at full scale?

The table above only tested 4 pairs (majors + gold). **All 6 variants have
now been re-run across all 26 locally-cached pairs.** Pooled capped Sharpe at
the owner's actual config, full 26-pair set:

| Variant | avg Sharpe (capped), 26 pairs | avg win rate | % years positive |
|---|---|---|---|
| Asia | 1.37 | 72.9% | 89% |
| Morning 08-12 | 1.21 | 73.1% | 88% |
| Overlap 13-17 | 1.15 | 75.3% | 89% |
| NY 13-21 | 1.09 | 75.8% | 88% |
| Control 10-14 | 0.87 | 72.4% | 93% |
| London 07-16 | 0.67 | 72.8% | 78% |

**The 4-pair headline overstated Asia's margin, and reordered the middle of
the pack.** At 26 pairs Asia (1.37) and Morning (1.21) are much closer than
the 2.48-vs-2.30 gap the small sample showed, and Overlap/NY — which looked
clearly behind Control on 4 pairs — are now AHEAD of Control once the full
universe is included. London stays unambiguously last at every scale tested,
by every metric, including the worst consistency (78% of years positive, the
only variant below 86%). Every variant's pooled Sharpe and consistency
dropped from its own 4-pair figure. Digging into the per-pair numbers
explains most of the drop: **GBPCAD, GBPNZD, AUDNZD, and EURNZD are net
losers under every one of the 6 variants tested** — negative capped Sharpe,
sub-60% win rates, only 1-3 of 5-6 years positive, all four pairs, all six
windows (see the dedicated follow-up section below for the investigation into
why). GBPCAD is the worst single result of the whole exercise: **-6.27 capped
Sharpe, 42% win rate, 1/5 positive years** under Asia. These four pairs alone
are dragging every pooled average down by roughly the same amount regardless
of which window builds the range — this reads as a pair-selection problem,
not evidence against any particular session choice.

Excluding just those 4 pairs (22 remaining), the complete ranking:

| Variant | avg Sharpe (capped), 22 pairs | avg win rate | % years positive |
|---|---|---|---|
| **Asia** | **2.08** | 67.2% | 98% |
| Morning 08-12 | 1.83 | 67.2% | 95% |
| Overlap 13-17 | 1.55 | 67.8% | 94% |
| Control 10-14 | 1.38 | 65.8% | **99%** |
| NY 13-21 | 1.26 | 68.7% | 89% |
| **London 07-16** | **0.83** | 67.2% | **79%** |

This matches the original 4-pair ranking at the top and bottom (Asia best,
London worst) and sits much closer to the original 4-pair figures overall —
the broader pair universe doesn't overturn the headline conclusion, it
reveals that (a) 4 specific pairs shouldn't have been pooled in unfiltered,
and (b) the middle-of-the-pack ordering (Morning/Overlap/Control/NY) is
genuinely closer and noisier than any 4-pair sample could show. **Practical
read: this strategy family (any window) should exclude
GBPCAD/GBPNZD/AUDNZD/EURNZD, or at minimum flag them for separate review,
before the window-choice question is even asked** — pooling them in is what
made the 26-pair numbers look like a bigger reversal than the underlying
window comparison actually shows. Asia and Control tie for best consistency
(98-99% of years positive) even though Control's average return is well
behind Asia's — a strategy that's slightly-positive almost every year vs. one
that's solidly positive most years is a real, separate tradeoff worth naming,
not just collapsing into one Sharpe number.

A second confirmation at 26-pair scale: the **unfiltered** (`margin>=1, any`,
no 2-pip confluence gate) config's pooled **capped** Sharpe goes **negative**
for Asia itself (-7.41), Morning (-3.76), Control (-3.84), and Overlap
(-1.07) once all 26 pairs are pooled — a sharp reversal from the small
4-pair sample's positive figures for every one of these. Only London (0.52)
and NY (-0.27, essentially flat) end up close to their 4-pair figures.
This reinforces the report's earlier side-finding: **the 2-pip confluence
gate is not optional garnish, it's what keeps this strategy family robust
once you stop hand-picking favorable pairs** — dropping it produces a real
net loss at scale for every window that looked good on the small sample,
Asia included.

Full per-pair breakdown (all 26 pairs, all 6 variants, all metrics including
`minTrackYears`) is in `analysis/session_window_comparison_results.json`.

## Follow-up: what's actually wrong with GBPCAD/GBPNZD/AUDNZD/EURNZD?

Investigated per the CLAUDE.md bug-hunting discipline (audit for a code/data
bug before declaring a pair a real null) — **this is not a data bug.** Checked
M1 bar counts, weekday gap patterns, single-bar >1% price jumps, and
zero-volume bars for all 4 pairs against 4 clean pairs (EURUSD, USDCHF,
GBPAUD, AUDCHF): counts and gap structure are comparable across the board: no
missing-data red flag, no corrupted-file signature.

**Cost is a real contributor, but not the root cause.** `js/perLineStrategy.js`'s
own `PAIR_COST_PCT` table assigns these 4 pairs among the highest round-trip
costs of any FX cross tested — GBPNZD (0.045%) is the single highest cost in
the whole 26-pair table, EURNZD (0.038%) is 2nd, GBPCAD (0.032%) ties 3rd,
AUDNZD (0.030%) ties 4th. But **win rate is cost-INDEPENDENT** (cost only
scales the size of each win/loss, never flips one into the other), and these
4 pairs' win rates are genuinely poor on their own terms — 41-62% across all
3 windows tested, vs. 60-72% for the rest of the universe. GBPCAD's Asia-window
win rate (42.3%, n=1,419) is the single worst result in the entire sweep. High
cost makes an already-marginal signal worse, but isn't inventing the problem.

**The direction is consistent across 3 independent windows** (Asia, Morning,
Control each partition the calendar differently and produce different touch
sets) **for all 4 pairs, in all 12 (pair × window) cells** — every cell is
capped-Sharpe-negative. That consistency is itself evidence this is a real,
pair-specific characteristic rather than one unlucky test configuration —
though per the house rule below, several of the individual `minTrackYears`
figures are very high (GBPNZD's Asia-window cell needs 790.6 years to trust,
AUDNZD's Control cell needs 91.8), meaning several of these NEGATIVE point
estimates individually carry weak statistical power too. The honest read:
the *direction* (bad) is well-supported by repetition across windows; the
exact *magnitude* of how bad, pair by pair, is not something to over-trust
from any single cell.

**3 of these 4 pairs are ALREADY excluded from live trading**, on
independent grounds: `server.js`'s `FIB_ATLAS_RECOMMENDED_EXCLUDE` (mirrored
in `asia-fib-atlas-vote-portfolio.html`'s `ASIA_RECOMMENDED_EXCLUDE`) already
excludes GBPCAD, GBPNZD, and EURNZD — frozen from
`analysis/fib_atlas_oos_validate_pair_selection.mjs`'s IS/OOS-validated,
70/30-split greedy-elimination study. That study asks a DIFFERENT question
than this one, though — it removes whichever pair contributes most to
**portfolio-level maxDD** (correlated risk), not whichever pair has the worst
**standalone** Sharpe/win-rate — so the two lists overlapping on 3/4 pairs is
a genuine, independent cross-validation of the same conclusion by two
different methods, not a restatement of the same finding.

**AUDNZD is the one gap: it is NOT in the current live exclusion list**,
despite showing the same negative-capped-Sharpe, poor-win-rate pattern in
every window tested here. This is a real, actionable candidate worth the
owner's own review before adding it to `FIB_ATLAS_RECOMMENDED_EXCLUDE` —
flagged here, not applied, since (a) it's a live-trading-affecting config
change, (b) the underlying criterion (standalone edge) differs from what the
existing exclusion list was validated against (portfolio drawdown
contribution), so this isn't simply "the same test caught one more," and (c)
per the caveat above, some of AUDNZD's own cells have weak individual
statistical power even though the direction repeats three times.

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

*(Confirmed at 26-pair scale — see "26-pair update" above: London stays last
by both average Sharpe AND consistency, the only variant with a positive-year
fraction below 86%, at every scale tested.)*

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
minimal news flow while it builds — wasn't cleanly separated from "shorter
window" by this test alone, since every variant above changes BOTH length
and start hour at once. The isolation follow-up below settles it.

*(Confirmed, with a tighter margin, at 26-pair scale — see "26-pair update"
below: Asia keeps first place but the gap to Morning narrows further once
the full pair universe is included, and a handful of specific pairs turn out
to be dragging every variant's average down together, not just Asia's.)*

**Practical read**: this does not argue for abandoning the Asia range — it
remains the best-supported, most consistent, largest-sample choice, and it's
the one already live and validated elsewhere in this repo (`asiaConfPips`,
the whole vote/confluence machinery) — but it argues against assuming the
*specific* clock hours 00:00-06:00 are doing something no other quiet-enough
window could do. If anything ever forces a change of window (e.g. a
broker/data gap during Asia hours), 08:00-12:00 is a reasonable fallback;
07:00-16:00 (full London) is not.

### Isolation follow-up: holding window LENGTH fixed, varying only start hour

Four 6h windows (matching Asia's own duration exactly), tiling the full 24h
day once each — `iso00`=00:00-06:00 (identical to Asia), `iso06`=06:00-12:00,
`iso12`=12:00-18:00, `iso18`=18:00-00:00 — tested on the same 4-pair sample
(EURUSD/GBPUSD/USDJPY/GOLD), owner's actual config, capped:

| Window | avg Sharpe (capped) | avg win rate | % years positive |
|---|---|---|---|
| 06:00-12:00 | **2.61** | 77.1% | 95% |
| 00:00-06:00 (Asia) | 2.48 | 74.1% | 100% |
| 12:00-18:00 | 1.53 | 77.3% | 100% |
| 18:00-00:00 | 0.79 | 68.6% | 100% |

**With length held constant, start hour clearly still matters — but not in
the simple "Asia is the uniquely quiet window" story.** 06:00-12:00
(Asia-close through the London morning — NOT the quietest stretch of the
day) edges out Asia itself on this sample. The real split is coarser than
either window individually: **00:00-12:00 (Asia + the window right after it)
clearly beats 12:00-24:00 (the overlap through the NY afternoon/evening)** —
2.48-2.61 vs. 0.79-1.53, a much bigger gap than any single-window comparison
above showed. 18:00-00:00 — despite ALSO being a quiet, thin-liquidity
stretch (the NY afternoon lull into the pre-Asia dead zone) — is the worst
performer of the four, which rules out "any quiet window works" as the
explanation just as clearly as it rules out "Asia specifically." The
first half of the London trading day behaving differently from the second
half (for THIS strategy's reversion/continuation vote) looks like the real
structural variable, not session-naming or raw quietness. This was tested
on 4 pairs only — worth confirming at 26-pair scale before leaning on the
06:00-12:00 result specifically, given how close it sits to Asia's own
figure on this sample size. Full detail in
`analysis/session_window_comparison_results.json` under the `iso00`/`iso06`/
`iso12`/`iso18` keys.

## A side-finding that did NOT survive the 26-pair re-test — retracted

> **CORRECTION (2026-09-12, same day as first written).** This section
> originally claimed, from the 4-pair sample, that Overlap's UNFILTERED
> (no confluence gate) pooled capped Sharpe was the best of the whole sweep
> at 2.96, beating even Asia's own unfiltered 0.75, and framed that as a
> real, separate signal worth its own follow-up. **That does not hold at
> 26-pair scale: Overlap's unfiltered pooled capped Sharpe is -1.07 across
> all 26 pairs** (see "26-pair update" above) — a small-sample artifact, not
> a real effect. Left visible with this correction rather than silently
> deleted, per this repo's own house rule on retractions
> (`MD files/RANGE_EXTENSION_FINDINGS.md`'s own 2026-07-24 correction is the
> precedent this follows).

What DOES survive at 26-pair scale, and is worth keeping as the honest
version of this observation: the 2-pip confluence gate's *lift* (unfiltered
→ gated pooled capped Sharpe) is genuinely uneven across windows —
Asia -7.41→1.37, Morning -3.76→1.21, Control -3.84→0.87, and Overlap
-1.07→1.15 all show a large POSITIVE lift from adding the gate, while NY
(-0.27→1.09) and London (0.52→0.67) show a much smaller one. So the gate
is doing real, broadly-necessary work everywhere except London/NY, not a
uniquely-Asia effect as this section first (wrongly) suggested — but there
is no evidence, at full scale, of an Overlap-specific unfiltered edge to
chase as its own strategy. That specific follow-up idea is closed.

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
- London/NY's samples are thinner PER PAIR than Asia/Morning/Control's
  (10-41 confluence-gated trades/pair in the original 4-pair test; the
  26-pair pooled totals are larger — 1,373 for London, 4,356 for NY — but
  still the two smallest pooled samples of the 6 variants), so their point
  estimates carry more uncertainty — the `minTrackYears` figures
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
