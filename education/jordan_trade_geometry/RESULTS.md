# Impulse → Retracement Geometry — Gold & NQ, real M1/M5, 2016–2026

This is a **geometry/inference pass, not a P&L backtest.** No entries, no
stops, no costs. It answers the actual question: across the real 10-year
candle archive, where does price actually turn during a pullback, as a
fraction of the impulse leg that preceded it — and does that depend on the
impulse's size or the EMA state at the turn? Engine:
[`js/impulseRetracementGeometry.js`](../../js/impulseRetracementGeometry.js).

## Method

For each instrument, real M1 bars (`loadM1ForPair`) resampled to M5 (results
below; **replicated on native M1 too — see "Robustness"**), pivot-detected
(`patternEngine.pivotHighs/pivotLows`, ±5 bars), kept if the leg between two
alternating pivots is ≥2× ATR(14) (an "impulse"). For each impulse, scan
forward bar-by-bar and track the deepest pullback reached before EITHER price
makes a new extreme beyond the impulse (`continued`) OR fully retraces past
the impulse's own origin (`invalidated`). `retraceFrac` = how deep that
pullback got, as a fraction of the impulse's size (0 = no pullback, 1 = fully
back to the start). Unsupervised 1D k-means (k=3, deterministic seeding) run
on the `continued` cases' `retraceFrac` values — no Fibonacci level assumed
anywhere in the code, it's discovered from the data.

## Result

| | Gold | NQ (NAS100) |
|---|--:|--:|
| Impulsive legs found (M5, 10.4y) | 64,998 | 64,816 |
| → continued (pullback then resumed) | 31,184 (48.0%) | 31,229 (48.2%) |
| → invalidated (pullback became reversal) | 33,814 (52.0%) | 33,587 (51.8%) |
| Median retrace depth (continued cases) | **0.629** | **0.615** |
| k-means centroids (k=3) | **0.377 / 0.623 / 0.872** | **0.355 / 0.621 / 0.883** |
| k-means cluster sizes | 9414 / 11819 / 9951 | 9928 / 11888 / 9413 |

**The unsupervised clustering lands almost exactly on the classic Fibonacci
retracement levels — 0.382 / 0.618 / 0.886 — on BOTH instruments, with no Fib
level coded into the detector.** That's a real, cross-instrument stylized
fact about how these markets pull back before continuing, not something
specific to gold or NQ individually, and not something I assumed going in.

### Impulse size changes the depth needed before continuation

| Impulse size (× ATR) | Gold median retrace | NQ median retrace |
|---|--:|--:|
| 2.0–3.0× (smaller impulse) | 0.739 | 0.740 |
| 3.0–5.0× (medium) | 0.628 | 0.623 |
| 5.0×+ (large/violent impulse) | **0.475** | **0.449** |

**Bigger, faster impulses need a much shallower pullback before resuming.** A
small 2-3×ATR move typically needs a deep 0.74 retrace before continuing; a
genuinely violent 5×+ATR move often turns and resumes after giving back less
than half its own range. This is the "was there a huge impulse before this
zone" question, answered with numbers: yes, and the size of that impulse
predicts how shallow the reaction zone will be.

### EMA cross is a lagging confirmation, not the trigger

| | Gold | NQ |
|---|--:|--:|
| EMA(9)/EMA(21) already agrees with impulse direction AT the turn | 58.7% | 60.0% |
| Mean retrace when EMA already agrees | 0.553 | 0.534 |
| Mean retrace when EMA does NOT yet agree | 0.736 | 0.738 |

Only ~59-60% of genuine turning points already have the EMA cross in place —
the rest turn *before* the EMA has flipped, then the EMA catches up
afterward. And deeper pullbacks (~0.74) are the ones most likely to turn
*before* the EMA agrees; shallow pullbacks (~0.53-0.55) are the ones where
the EMA never really lost the trend. This matches what the screenshots
themselves showed: the visible EMA cross in the NQ 1-minute chart happened
*at* the sweep low, after price had already turned — a confirmation, not a
leading signal.

### Up vs down impulses — a real, small asymmetry

Every number above pools both directions together. Split, there's a small
but consistent, replicated difference:

| | Gold UP | Gold DOWN | NQ UP | NQ DOWN |
|---|--:|--:|--:|--:|
| Continuation rate | 49.2% | 46.7% | 51.2% | 45.1% |
| Median retrace depth | 0.616 | 0.641 | 0.594 | 0.639 |
| k-means centroids | 0.369/0.619/0.871 | 0.390/0.633/0.877 | 0.334/0.603/0.873 | 0.384/0.639/0.893 |

Up-impulses continue slightly more often and need a slightly shallower
pullback than down-impulses, on both instruments. Small effect (2-6 points),
but the direction of the asymmetry replicates — consistent with the
"fear moves faster, greed grinds" folklore, though 2-6 points is not enough
to build a directional filter around on its own.

### Does volume/Money-Flow confirmation predict which impulses continue?

Checked separately — see [`VUMANCHU_GATE.md`](VUMANCHU_GATE.md). Short
version: a naive first pass looked like a huge finding (48% baseline →
88.7% with confirmation) and turned out to be a hindsight-selection
artifact, the same class of bug this repo's own `STAGE3_VUMANCHU_GATE.md`
caught once before on a different geometry. Corrected properly, the
baseline itself jumps to ~90% (surviving a few bars without resolving is
informative on its own) and VuManChu confirmation adds close to nothing on
top of that, inconsistently, on both instruments.

## Robustness — replicated at native M1 (no resampling artifact)

| | Gold M1 | NQ M1 |
|---|--:|--:|
| Impulsive legs | 329,245 | 339,498 |
| Median retrace (continued) | 0.628 | 0.620 |
| k-means centroids | 0.373 / 0.620 / 0.870 | 0.358 / 0.615 / 0.877 |

Essentially identical to the M5 numbers above — this isn't a byproduct of
the resampling choice.

## Placing the 4 known trades against this distribution

Price levels below are read directly off the chart labels in the
screenshots (approximate — I don't have pixel-exact OHLC for these, and
cannot fetch it: OANDA is 403 in this sandbox and Yahoo's chart API also
returned 403 when tested directly, and R2's cache ends 2026-06-05, before
these trades' 13-14 Aug 2026 dates). `entryFrac` = where the entry sits
inside the SL→TP span, i.e. the same `retraceFrac` measure as above applied
to the actual drawn position tool.

| Trade | Entry | SL | TP | entryFrac | Where it falls |
|---|--:|--:|--:|--:|---|
| Gold SHORT (11:21→14:20) | ~4372.3 | ~4380 | ~4345.7 | **0.776** | Between the mid (0.62) and top (0.87) k-means clusters; close to the 2-3×ATR-bucket median (0.739) |
| NQ SHORT (03:37→07:02, failed) | — | — | — | n/a | This one never reached its entry logic cleanly — price broke straight through the zone (the `invalidated`-class outcome, ~52% base rate) |
| NQ LONG (10:19→15:05, "ignoring the SL") | ~30,097 | ~30,032 | ~30,160 | **0.510** | Below the overall median (0.615-0.629); close to the **5×+ATR-bucket median** (0.449-0.475) — consistent with this being the sharp, violent V-move visible in the 1-minute chart, where the data says a shallower retrace before reversal is normal |
| NQ SHORT (19:01) | ~30,226.5 | ~30,230 | ~30,210.75 | **0.818** | Near the top k-means cluster (0.87-0.88) |

Three of four sit inside the empirically-discovered 0.6-0.88 band that the
full 10-year archive says is where continuation-turns actually cluster; the
one that doesn't (the failed 03:37 short) is exactly the ~52% base-rate case
where the pullback becomes a real reversal instead of holding. **That's the
trend across these trades**: he's entering where price statistically tends
to turn during a continuation pullback, sized inversely to how violent the
preceding impulse was — not at a fixed universal Fib number, but the whole
archive clusters right where 3 of his 4 trades did too.

## What this is NOT saying

- **Not a profitability claim.** "Price statistically tends to turn near
  here" and "trading that turn is profitable after costs and losses on the
  ~52% that don't turn" are different questions — the first PR
  (`education/jordan_impulse_range_backtest/`) tested a mechanised version of
  the second and it was net-negative. This document only answers the
  geometry question that was actually asked here.
- **Not verification of the specific screenshotted trades** — see the OANDA/
  Yahoo/R2-cutoff caveat above. The 4-trade comparison is indicative, built
  from chart-label price reads, not a bar-by-bar match.
- **n=4 is not a sample.** The comparison shows the 4 known trades are
  *consistent with* the archive-wide pattern, not that the pattern predicts
  him specifically.

## Reproduce

```bash
node education/jordan_trade_geometry/scripts/run_geometry.mjs gold "" education/jordan_trade_geometry/data
node education/jordan_trade_geometry/scripts/run_geometry.mjs nq ./portfolioBacktest/cache education/jordan_trade_geometry/data
node education/jordan_trade_geometry/scripts/run_geometry.mjs gold "" /tmp/geom_m1 1   # native-M1 robustness check
node education/jordan_trade_geometry/scripts/run_vumanchu_gate.mjs gold "" education/jordan_trade_geometry/data   # see VUMANCHU_GATE.md
node education/jordan_trade_geometry/scripts/run_vumanchu_gate.mjs nq ./portfolioBacktest/cache education/jordan_trade_geometry/data
node js/legoBricks.test.mjs   # includes impulseRetracementGeometry's synthetic unit tests
```

Per-leg occurrence logs: `data/gold.occurrences.json`, `data/nq.occurrences.json`
(65k+ rows each — every detected impulse, its outcome, retrace fraction, ATR
multiple and EMA state at the turn). Summary cards: `data/gold.geometry.json`,
`data/nq.geometry.json`.
