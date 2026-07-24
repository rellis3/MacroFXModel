# Range-Extension Strategy — Findings (honest result)

**TL;DR — NULL, intraday AND swing.** Tested on **2016–2025, 26 FX pairs + gold,
real OANDA M1, costs on, chronological IS/OOS**. Full spec:
`RANGE_EXTENSION_STRATEGY.md`. Engine: `js/rangeExtEngine.js`. Brain:
`js/rangeExtConfidence.js`.

> **⚠️ CORRECTION (2026-07-24).** An earlier version of this doc claimed a
> "weekly swing survivor" (+0.117 R OOS). **That was WRONG — a selection-bias
> artifact, now retracted.** The offline analysis selected the best-confidence
> level *among the levels that FILLED*, which conditions the pick on whether price
> reached the level over the following days — a look-ahead not available at
> decision time. Measured honestly through the engine's own selection (rank
> levels, commit to the top-N limit orders Monday morning, trade whatever fills),
> the Monday-swing config is **−0.006 R OOS at top-1 (spreads only), negative at
> top-2/3/5, and negative after any carry.** The whole range-extension family —
> intraday and swing — is a null. See §"Weekly swing variant" for the corrected
> numbers and the lesson.

## The bar (pre-registered)

Treatment beats the trade-everything baseline on **OOS per-trade expectancy**,
clears **breakeven-after-cost**, with **|t| > 3** (multiple-testing) and **≥30 OOS
trades**, IS-consistent. Judged on **expectancy**, never frequency-flattered
Sharpe.

## What happened

1. **Base method loses everywhere.** Pooled OOS **−0.115 R/trade**, **0 of 26
   pairs positive**, every feature bucket negative. Extends the in-house POI null
   (−0.016 R), doesn't overturn it.

2. **The framework's own claims are refuted:**
   - **Two-session "alignment zones" hurt, not help.** `align=none` = **+0.31 R**
     on top picks; tight/strong aligned = negative. The headline
     "highest-probability = alignment" claim fails on 10y.
   - **Follow/breakout direction is harmful** (auto fade+follow −0.31 R vs
     fade-only −0.15 R).
   - Near-range (`mult<1`) and **below-range/BUY** fades are the least-bad; far
     (>3×) and above/SELL are worst.

3. **The confidence brain ranks correctly — but there is no edge to concentrate.**
   top-1/pair-day ≫ top-3 ≫ all levels, **geometry-robust** (RR 1.0 and 1.5):
   +0.05 R OOS (t 7.3) at flat cost. Under **realistic per-pair spreads** it
   falls to **+0.017 R (t 2.4, full-sample t 1.1)** — below the |t|>3 bar — and its
   per-pair survivors are exactly the **wide-spread crosses** (EURAUD/AUDJPY/GBPNZD
   ≈ +0.15 R) where the cost assumption is least reliable; tight majors are
   flat-to-negative. Cost-model artifact, not alpha. top-3 is −0.09 R.

## Verdict

Do **not** trade this as-is. The ranker works; the raw geometry+confluence method
is a coin flip the spread eats. The only honest route to a positive version is to
add the **mechanistic / macro conditioners the sandbox can't source** — CME
OI/gamma walls (the *why* a level holds), the rate-differential compass, the
catalyst calendar — and re-run this exact A/B harness. Those are separate claims
to be proven on their own data.

## Follow-up: Monday-weekly levels (tested 2026-07-24)

Hypothesis (user): higher-timeframe **Monday–Monday weekly** range levels are
"usually stronger" — would they help? Wired as `levelSource: asia|monday|both`
(stop scaled to each source's own range) and re-ran the 26-pair A/B.

**Decisively no, for this intraday engine.** Monday levels pooled **−0.367 R** vs
Asia **−0.119 R** (OOS t = −96), **worse on 0/26 pairs, positive on 0/26**; top-1
selection can't rescue them (−0.072 R vs Asia +0.05 R); every multiple bucket
≈ −0.35 R. Mechanistic reason: the engine resolves every trade **within the same
day** (06:00–20:00), but weekly levels sit far from price and are *swing-timeframe*
levels that react over days — an intraday fade of them mostly marks-to-close or
stops out before any weekly reaction. The belief may still hold for a **multi-day
hold** (a different exit engine, not built). Capability kept; default `asia`.

## Weekly swing variant — RETRACTED (was a selection-bias artifact)

The multi-day hold (`holdDays`) was added to test weekly (Monday) levels on their
native swing timeframe. An **offline analysis** appeared to show a strong edge
(Monday levels, top-1/pair-week, ~3-day fade: +0.19 R OOS spreads-only, +0.117 R
under pessimistic carry, 21/26 pairs). **This was wrong and is retracted.**

**The bug (a look-ahead).** The engine's `mode:'all'` records only trades that
**filled**. The offline script then picked "the highest-confidence level per week
**among those filled**." Requiring the chosen level to have filled conditions the
selection on a *future* fact — whether price reached that extension over the next
3 days — which you don't know when you place the order Monday morning. It also
biases toward the favourable subset (a fade only fills if price reached the
extreme, where mean-reversion is more likely). Classic conditioning-on-outcome.

**The honest measure** is the engine's own `mode:'gated'` selection: rank levels
by (no-lookahead) confidence, commit to the top-N limit orders, trade whatever
fills. Monday levels, 3-day hold, fade, RR 1.5, **spreads only**:

| selection | OOS exp | note |
|---|---:|---|
| top-1 / week | **−0.006 R** | breakeven; negative after any carry |
| top-2 / week | −0.022 R | |
| top-3 / week | −0.052 R | |
| top-5 / week | −0.043 R | |

Every size is ≤ 0 **before** carry. So carry (G5) is moot — the edge is gone at
spreads. The multi-day hold DID help the raw Monday number (−0.37 R intraday →
−0.03 R swing), i.e. the timeframe-match intuition was directionally right, but it
lands at breakeven, not profit.

**Lesson (kept):** when a per-level engine records only filled trades, never
select "the best among filled" offline — that's a fill-conditioned look-ahead.
Selection must be measured through the engine (choose first, then fill), exactly
as here. The same bias also inflated the *intraday* top-1 numbers elsewhere in
this doc (they were already ≤ breakeven, so the null verdict there only
strengthens). **Net: the range-extension family is a null, intraday and swing.**

## Reproduce

```
# engine A/B (both arms), any pair or all 26:
POST /api/range-ext/run  { pair?, dateFrom, dateTo, topN, minConfidence, direction, tpMode, tpR }
GET  /api/range-ext/status/:jobId

# or directly:
node -e "import('./js/rangeExtEngine.js').then(async m=>{ \
  const b=await m.runRangeExtBacktest({mode:'all',tpMode:'rr',tpR:1.5},['eurusd']); \
  console.log(m.summarizeRangeExt(b.trades).OOS); })"
```

Disaggregation method: dump the ALL-fade universe carrying every state feature +
fade-confidence + gross R + stop distance, then evaluate every selection rule and
cost model as a post-hoc filter (top-1/day, per-multiple, per-alignment,
per-regime, and realistic per-pair spreads). Unit tests: `js/rangeExt.test.mjs`.
