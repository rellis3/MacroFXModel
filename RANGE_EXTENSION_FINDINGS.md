# Range-Extension Strategy — Findings (honest result)

**TL;DR — the INTRADAY idea is a null, BUT a WEEKLY-level SWING variant is a
validated survivor.** Tested on **2016–2025, 26 FX pairs + gold, real OANDA M1,
costs on, chronological IS/OOS**. Full spec: `RANGE_EXTENSION_STRATEGY.md`. Engine:
`js/rangeExtEngine.js`. Brain: `js/rangeExtConfidence.js`.

> **The survivor (see §"Weekly swing variant" below):** Monday-weekly range
> extensions, top-1 level per pair-week, faded with a ~3-day hold — **+0.117 R
> OOS (t 8), positive in BOTH IS & OOS on 21/26 pairs** even under a pessimistic
> always-pay 1 pip/day swap. Clears the pre-registered bar. The one unquantified
> risk is real per-pair carry/swap (needs broker data). Everything below is the
> INTRADAY version, which is the null.

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

## Weekly swing variant — the survivor (validated 2026-07-24)

The intraday nulls all shared one assumption: trades resolve inside one day. That
structurally mismatches a **weekly** (Monday) level, which is a *swing* reaction
point. Adding a multi-day hold (`holdDays`) and testing weekly levels on their
native timeframe changed the result.

**Strategy:** each Monday, project fib extensions off the **Monday-weekly range**;
score with the confidence brain; **take the single best level per pair-week**;
**fade** it (limit → target back toward range, RR 1.5, stop 0.75× weekly range);
**hold ~3 days**. One trade per pair per week (non-overlapping → clean stats).

**Result (top-1/pair-week, chronological IS/OOS):**

| cost assumption | OOS exp | OOS t | pairs +ve both IS&OOS |
|---|---:|---:|---:|
| spreads only | +0.19 R | 13.1 | 25/26 |
| + 1 pip/day swap (pessimistic, always-pay) | **+0.117 R** | 8.2 | **21/26** |
| + 2 pip/day swap | +0.047 R | 3.3 | 12/26 |
| + 3 pip/day swap | −0.02 R | — | 6/26 |

Win rate 54–56% at RR 1.5 (breakeven 40%). Positive across **every currency
bloc**, not one group. Robustness: the **3-day** hold is the sweet spot — 5-day
and 10-day holds accumulate more carry and die at 1–2 pip/day; RR 1.0 works at
zero carry but is less carry-robust than RR 1.5. **Asia (daily) levels get NO
benefit from the hold** (still −0.12 R) — it's specifically the *weekly* levels
that want the swing timeframe. Selection matters: pooled all-Monday-levels is
still −0.06 R; the edge is in the **top-1 per week**, so the brain earns its keep
here (top-1 ≫ all).

**Why it clears the bar where the intraday version didn't:** IS-consistent
(21–25/26 pairs both halves — vs 1/26 intraday), |t| ≫ 3, ≥30 OOS trades, beats
baseline, and has a mechanism (weekly level traded on weekly timeframe; short
hold minimises carry). This is not a lucky slice.

**The one open risk — carry/swap.** Modelled here as a flat *always-pay* drag
(pessimistic: a mean-reversion book earns swap ~half the time, so true net carry
is likely lower). Real per-pair broker swap rates aren't sourceable in-sandbox.
The edge survives to ~2 pip/day of always-pay drag; it needs real swap data +
forward validation before it's a live strategy. **Verdict: a real, broad,
IS-consistent backtest edge, conditional on carry — the first survivor in this
family.**

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
