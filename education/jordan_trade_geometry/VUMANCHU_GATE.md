# Does VuManChu confirmation predict continuation? Naive result was wrong — caught and fixed

Follow-up to [`RESULTS.md`](RESULTS.md), testing the specific suggestion to look
at volume/Money-Flow: does WaveTrend hidden divergence, Money-Flow fading
toward zero, or VWAP-oscillator agreement — evaluated at an impulse's
retracement extreme — predict whether it CONTINUES (resumes the impulse) or
INVALIDATES (fully reverses)? Not retracement *depth* (RESULTS.md's
question) — whether the pattern completes at all. Engine:
[`js/impulseRetracementGeometry.js`](../../js/impulseRetracementGeometry.js) +
the existing `js/vumanchuCore.js`/`js/divergenceCore.js` bricks (same ones
`js/poiReactionV1Engine.js`'s Stage-3 gate uses on a *fade* geometry — this
applies the identical 3-signal idea to the *continuation* geometry instead).

## The naive result looked spectacular — and was wrong

First pass: score WaveTrend/Money-Flow/VWAP at `turnIdx`, the bar the
detector picks as the retracement's extreme.

| | Gold | NQ |
|---|--:|--:|
| Baseline continuation rate | 48.0% | 48.2% |
| 2 of 3 signals agree | 84.4% | 85.7% |
| VWAP oscillator agreement alone | 88.7% (n=7,812) | — |

A ~40-point jump from 3 volume-based signals looked like a real discovery.
It's the same shape this repo already caught and documented once before —
[`education/coleztrades_poi_backtest/STAGE3_VUMANCHU_GATE.md`](../coleztrades_poi_backtest/STAGE3_VUMANCHU_GATE.md)'s
"first, an honest correction" section, where a spectacular flip on a
*different* geometry turned out to be a lookahead bug. Same discipline
applies here — checked, and it's the same class of problem, just subtler.

## The bug: hindsight-selected extreme, not a same-candle leak

`turnIdx` is picked by scanning **forward** to find the bar that,
already knowing the future path, turns out to be the final extreme before
the pattern resolves. A live trader can never know in real time "this bar
IS the exact bottom" — only afterward, once some bars pass with no new
extreme. Checked the crude version of this first (is the resolution
literally on the same candle as the turn?) — only **1.8%** of cases, not the
explanation. The real effect is subtler: reading VWAP right at the
*retrospectively confirmed* exact low is a fundamentally easier condition to
satisfy than reading it at a bar a live trader could actually have flagged
as "probably the low" at the time.

**Fix:** re-score `CONFIRM_BARS` (3) after the retrospective extreme — still
fully causal, only bars up to the eval point are ever read — and **drop any
occurrence whose outcome was already decided within that window** (can't
fairly test "predicts the still-future outcome" if the future already
happened). Checked CONFIRM_BARS = 1/3/5 for robustness — same shape at all
three.

## Corrected result — the "signal" mostly evaporates

| | Gold | NQ |
|---|--:|--:|
| Baseline (survives 3 bars without resolving) | **90.4%** (n=27,276) | **91.6%** (n=25,909) |
| 0 signals | 87.3% | 89.2% |
| 1 signal | 92.0% | 92.9% |
| 2 signals | 89.2% | 90.5% |
| 3 signals | 94.3% (n=87) | 88.8% (n=89) |
| Money-Flow fading alone | 87.8% | 89.6% |
| VWAP agreement alone | 91.5% | 92.4% |

Two things happen once corrected, both real:

1. **The baseline itself jumps to ~90%.** Simply surviving a few bars past the
   retrospective extreme without the pattern resolving either way is hugely
   informative on its own — most whipsaws (both fast continuations and fast
   invalidations) get filtered into "already resolved," leaving a much
   cleaner, calmer subset behind. This is a real, useful, honestly-earned
   number — but it's a statement about **which occurrences survive to be
   evaluated at all**, not about what VuManChu adds.
2. **VuManChu confirmation adds almost nothing on top of that 90% floor, and
   isn't even monotonic** — 2-signal reads score *lower* than 1-signal reads
   on both instruments, and Money-Flow alone is the weakest of the three
   despite being the deck's headline "fuel" concept. This is a null result on
   the actual question asked ("does volume/Money-Flow predict the turn"),
   not a caveat on a positive one.

## Bottom line

The volume/Money-Flow angle was worth checking and the naive number would
have been a genuinely misleading thing to report — this is exactly the
"assume the pipeline has a bug before believing the alpha" discipline this
repo's own house rules call for, and it caught something real. Corrected
honestly, VuManChu-style confirmation does not meaningfully discriminate
continuation from invalidation on this geometry, on either instrument.

## Reproduce

```bash
node education/jordan_trade_geometry/scripts/run_vumanchu_gate.mjs gold "" education/jordan_trade_geometry/data
node education/jordan_trade_geometry/scripts/run_vumanchu_gate.mjs nq   ./portfolioBacktest/cache education/jordan_trade_geometry/data
```

Full naive + corrected numbers: `data/gold.vumanchu_gate.json`, `data/nq.vumanchu_gate.json`.
