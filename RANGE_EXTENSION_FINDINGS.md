# Range-Extension Strategy — Findings (honest result)

**TL;DR — NULL for tradeable edge, with three durable negative findings.** The
Asia range-extension method + a state-conditioning confidence brain, tested on
**2016–2025, 26 FX pairs + gold, real OANDA M1, costs on, chronological IS/OOS**
(294,091 baseline trades). Full spec: `RANGE_EXTENSION_STRATEGY.md`. Engine:
`js/rangeExtEngine.js`. Brain: `js/rangeExtConfidence.js`.

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
