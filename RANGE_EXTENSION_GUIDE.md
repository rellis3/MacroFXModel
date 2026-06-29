# Range-Extension Strategy — Build Guide & Honesty Log

> How we built the **Range-Line Strategy** (Asia/Monday range-extension levels),
> the **four "lies"** that made an unbelievable backtest look unbelievable, how we
> found and removed each one, and what's actually left underneath (a real, modest,
> cost-robust edge ≈ Sharpe 3, not the fantasy ~24).
>
> Engine: `js/rangeLineAnalyser.js` · Pricing/policy brick: `js/perLineStrategy.js`
> · Stats brick: `js/backtestStats.js` · UI: `range-line-strategy.html` · Route:
> `POST /api/range-line/run` (`server.js`).
>
> Read this with `CLAUDE.md` (the Lego Principle) and `FORECAST_WORKLOG.md` (the
> sibling forecast engine that walked this exact path first and set the bar:
> *"a believable Sharpe is < 2"*).

---

## 0. TL;DR

- **What it is.** Treat each Asia-session and Monday-of-week **range-extension fib
  level** (`low + range × {…,−1,−0.5,0,0.5,1,1.5,…}`) as a "line." For each
  `(line × condition)` cell, learn on after-cost expectancy — in-sample only —
  whether to **fade** (bet reversion), **follow** (bet continuation) or **skip**
  it. Apply that policy out-of-sample. No confluence modules.
- **What we found.** The first runs showed an impossible **Sharpe ~24** with a
  near-zero drawdown. That was **four stacked artifacts**, not edge. We removed
  each with a measured, committed fix.
- **What's real.** A **single pair** (eurusd), traded one position at a time with
  a **trailing exit**, at **realistic (2–3× cost) fills**, lands at **Sharpe ≈
  2.5–5** with realistic drawdowns (−2.6% to −4.7%), **positive every year and
  every walk-forward fold**, Deflated Sharpe 100%. Modest, thin (~4 pips/trade,
  ~2 after real cost), but **real**.
- **The arc:** `~56 → ~24 → ~12 → ~7 (one pair) → ~3 (realistic fills)`. Every
  step down was a lie removed, not edge lost.

---

## 1. The four lies (and the fifth residual)

Each "lie" is a way the backtest **looked better than reality**. We found them in
order, each with its own diagnostic and fix. The headline Sharpe at each stage:

| # | The lie | How it inflated | How we caught it | The fix | Sharpe after |
|---|---|---|---|---|---|
| 1 | **Independence** | Per-trade Sharpe × √(trade-count). 26k correlated trades counted as 26k independent annual-scaled bets. | Sharpe 56 is impossible; the trades overlap in time. | Score risk on the **daily portfolio-PnL series** ×√252, not per touch. | ~24 |
| 2 | **Lookahead** | The Asia low/high (`A_0`/`A_1`) are *defined by* the formation window, then "predicted" to revert *during that same window*. Circular — half the book. | `A_0`/`A_1` were ~half the trades at 90% revert. | **`validFrom` gate**: a level isn't tradeable until its range is *known* (Asia after the 6h window; Monday never on Monday). | ~12 |
| 3 | **Over-count** | One trend booked as a *separate* trade at every level it crossed (~90 trades/day). The strategy looked like 90 independent edges/day. | The held model halved trades/day (90→46) **without dropping the Sharpe** — proving the count was a lie even though it wasn't the Sharpe inflator. | **Held-position model**: one position per day/direction/source, re-entry suppressed while open. | ~12 (book) / ~6 trades/day |
| 4 | **Cross-pair pooling** | 25 correlated FX pairs piled together; the daily aggregation credited "diversification" that isn't real for instruments that all move on USD/risk → the impossible **−0.6% drawdown**. | **Single-pair run**: Sharpe halved (12→7) and drawdown became real (−0.6% → −2.6%). | Treat the **single pair** as the honest unit; discount portfolio uplift. | ~7 (one pair, @1×) |
| 5 | **Fill optimism** *(residual)* | Entries/exits assumed at the **exact level price**, zero real slippage. Adds a small consistent positive bias to nearly every trade → a daily curve that almost never dips. | The gap between **@1× (zero-slippage) and @2–3× cost** Sharpe. | **Cost-stress is the fill proxy** — read the @2–3× column, not @1×. (A dedicated fill model is optional confirmation.) | **~2.5–5 (realistic)** |

**The punch line.** None of these was a coding bug — each was an *honesty* gap: a
place where the harness flattered the strategy. Strip all five and a genuine,
small edge remains. This is exactly how the sibling forecast engine reached its
"believable < 2" verdict (`FORECAST_WORKLOG.md`).

---

## 2. How the engine is built (the pipeline)

Everything is built by **connecting existing bricks**, never copying (the Lego
Principle). The flow for one run:

```
packed M1  ─bucketM1IntoSessions→  sessions (Map date→bars)
           ─runRangeLineAnalyser→  line records  (cached: recordsForPair)
           ─extractTouches→        touches  (per (line × condition) cell)
                                      │
        pooled IS  ─buildPolicy→  POLICY  (fade/follow/skip per cell, after-cost gate)
                                      │
        OOS touches ─runPerLine→   book + portfolio (daily ×√252) + survivors
                    ─runRigor→     walk-forward / per-year / cost-stress / IS-vs-OOS
                    ─runSensitivity + deflatedSharpe→  multiple-testing correction
                    ─eRatioByCell→ MFE/MAE per cell (is there a trend to ride?)
                    ─runExitAB→    4 exits, per-touch (fixed/struct/chand/scale)
                    ─runHeldPosition→ 1 trade through the trend (the honest count)
```

### 2a. The level ladder (`analyseRangeWindow`, `buildRangeLadder`)
- `LADDER_LEVELS = FIB_LEVELS.filter(L => Number.isInteger(L*2))` — the **sparse
  half-integer grid** (…−1,−0.5,0,0.5,1,1.5…), so adjacent rungs are a real
  distance (0.5× the range), not the dense 0.25 grid.
- Each session builds an **Asia** ladder (first `asiaHrs` of the session) and a
  **Monday** ladder (the week's Monday session range). `srcTag` `A_`/`M_` keeps
  them distinct — they are **two separate strategies** layered on one chart.
- For each line: find the **first touch** (subject to the `validFrom` gate),
  resolve a **triple-barrier** (inner = next level toward mid = TP for a fade;
  outer = next level away = SL), and record everything a downstream consumer needs.

### 2b. The one decision primitive (`perLineStrategy`)
- `buildPolicy` learns, per cell, the **after-cost expectancy** of fading vs
  following, and trades the cell only if the better side clears a positive margin.
  Being right >50% is *not* enough — the wins must beat the spread. **SKIP is the
  common, honest answer** (46 of 78 cells skipped on the all-pairs run).
- `runPerLine` learns on **pooled in-sample** (one universal map → tests whether
  the edge is universal, not 26 overfit tables), applies it **per-pair
  out-of-sample**, and reports the daily-aggregated `portfolio` block + the
  `survivors` live-universe filter.

### 2c. The honest risk math (`backtestStats.portfolioStats`)
- **Sharpe on the daily portfolio-PnL series ×√252.** Same-day, cross-pair
  concurrency collapses into one number per day, so correlated simultaneous
  positions count as **one day's risk** — mathematically equal to per-trade Sharpe
  when trades are independent, **lower** when correlated (the real FX case).
- Plus **vol-targeted** CAGR/DD (scale the daily series to a fixed 10% annual vol)
  so returns are leverage-honest and comparable; **Probabilistic** and **Deflated**
  Sharpe for sample-length and multiple-testing honesty.

---

## 3. The diagnostics we built (and why each exists)

Each card on `range-line-strategy.html` exists to answer one honest question.
They were built **in the order the investigation needed them** — measure first,
then build.

| Card | Brick | The question it answers |
|---|---|---|
| **Book / Portfolio** | `runPerLine` → `portfolioStats` | What's the daily-honest Sharpe (not per-trade ×√N)? |
| **Survivors** | `buildSurvivors` | What's the book if you keep only pairs that clear their own spread? |
| **Rigor** | `runRigor` | Is it real or an artifact? IS≈OOS (structural vs overfit), per-year, **cost-stress ×1/2/3**, Deflated Sharpe. |
| **E-ratio** | `eRatioByCell` | Does price *run past* the levels (trend to ride → trail) or poke & revert (keep fixed TP)? Measured **before** building the exit. |
| **Exit A/B** | `runExitAB` | Same entries, 4 exits — does a trail beat the fixed barrier on Sharpe @2× cost? (Per-touch — doesn't deflate breadth.) |
| **Held-position** | `runHeldPosition` | One trade through the trend, re-entry suppressed → the **honest trades/day and Sharpe**. |

**Key methodology:** the **cost-stress row is how you judge real-vs-artifact**, not
the headline Sharpe. A believable edge is a *low* Sharpe that **survives 2–3×
cost**, not a high one that collapses. (Fixed exit @3× = 0.14; chandelier @3× =
2.53 — that contrast is the whole story of why the trail matters.)

---

## 4. The exit study (your "single trade for longer" idea, made rigorous)

The fixed one-level barrier capped every winner at one level and re-entered at the
next — **manufacturing the over-count** and pinning R:R near 1:1. The E-ratio
showed a real trend to ride (follow cells **2–3.5×** MFE/MAE), so we A/B'd exits:

- **Fixed** — one level, the control.
- **Structural trail** — ratchet the stop to one level behind the running peak;
  exit on a level-flip. **No tunable** → overfit-resistant, the principled choice.
- **Chandelier** — stop = peak − ½ rung (never tighter than the shared inner
  stop). Captures a touch more, at the cost of one tunable.
- **Scale-out** — half at level 1, half trailed.

**Result:** trails **quadruple the payoff** (0.96 → ~4) and turn a **cost-fragile**
edge (fixed @3× = 3.45) into a **cost-robust** one (chandelier @3× = 7.29 on the
book; 2.53 single-pair). Lower win rate, much bigger winners, far more durable.
The trail is the right exit — **confirmed on the honest harness, not assumed.**

The trail PnLs are **simulated bar-by-bar on the M1 path** (`fStruct`/`fChand` on
each touch), locked by a hand-crafted unit test with a known answer
(`js/rangeLineAnalyser.test.mjs`).

---

## 5. What the numbers actually say (single-pair eurusd, the honest unit)

| Held exit | Sharpe @1× | @2× | @3× | Trades/day | MaxDD@10% |
|---|---|---|---|---|---|
| Fixed-held | 5.53 | 2.80 | 0.14 | 6 | −6.7% |
| Structural | 5.79 | 3.91 | 2.04 | 6 | −4.7% |
| **Chandelier** | 7.26 | **4.88** | **2.53** | 6 | **−2.6%** |

- **@1× is the zero-slippage fantasy.** The realistic number is the **@2–3×
  column: Sharpe ≈ 2.5–5**, with realistic drawdowns.
- Edge is **thin**: ~4 pips/trade net, ~2 after realistic cost; **62.9% win**.
- **Robust where it counts:** positive every year (2022–2026), every walk-forward
  fold, OOS÷IS degradation ≈ 1.0, Deflated Sharpe 100%.
- The all-pairs book (Sharpe ~12) is **~2× inflated by correlated-pair pooling** —
  treat single-pair ~3 as the unit; some pairs (gold, JPY crosses) are stronger,
  some (eurgbp, audnzd) weaker.

---

## 6. Files & bricks (the build inventory)

| Piece | File | Role |
|---|---|---|
| Engine | `js/rangeLineAnalyser.js` | ladder build, `analyseRangeWindow` (triple-barrier + MFE/MAE + trail sims + `validFrom` no-lookahead gate), `recordsForPair`/`touchesForPair`, `eRatioByCell`, `runExitAB`, `runHeldPosition`; re-exports the rigor battery |
| Policy/pricing | `js/perLineStrategy.js` | `extractTouches`, `buildPolicy` (after-cost gate), `pnlFor` (triple-barrier + mark-to-close), `runPerLine`, `buildSurvivors`, `runRigor`, `runSensitivity` |
| Stats | `js/backtestStats.js` | `portfolioStats` (daily ×√252 + vol-target + PSR), `deflatedSharpe`, bootstrap/MC |
| UI | `range-line-strategy.html` | all six diagnostic cards |
| Route | `server.js` `/api/range-line/run` | streams M1 per-pair (records cache + bounded concurrency), runs the full battery |
| Tests | `js/rangeLineAnalyser.test.mjs` | synthetic end-to-end + no-lookahead gate + trail-sim known-answer + held-collapse |

All reused bricks are in `LEGO_MODULES.md`. The engine **imports** the vol math,
fill walker, metrics and fib grid — it never copies them.

---

## 7. How to reproduce / read a run

1. Open `range-line-strategy.html`, **Condition = `none (line only)`** (approachVel
   doesn't transfer to range fibs — it fragments cells and adds noise).
2. Run **all pairs** for the universe view, then **one pair** (e.g. `eurusd`) for
   the honest unit.
3. Read in this order, and **ignore the @1× Sharpe**:
   - **Rigor → cost-stress**: positive at 2–3×? → real edge.
   - **Held-position → Sharpe @2–3×**: the tradeable number. Judge vs **< ~2–3**.
   - **E-ratio / Exit A/B**: trail beats fixed → use the trail.

---

## 8. What's left (refinements, not "is it real?")

The edge is confirmed real. Remaining work is shaping the tradeable product:

1. **Per-pair × level quality scan** — which pairs and which levels actually carry
   the edge. The pooled policy can hide a level that's good universally but bad on
   one pair. This defines the **real tradeable universe** and prunes losers.
2. **Exact fill model** — convert the cost-stress proxy into a direct number
   (entry at level+slippage requiring the level to be exceeded; trail exits at
   stop∓slippage). Confirmation, not make-or-break (cost-stress already brackets it).
3. **Live wiring** — the ladder (`LADDER_LEVELS`/`buildRangeLadder`) is already
   exported so a live producer builds the *identical* grid the offline policy
   learned on (no backtest/live drift — the failure `TRADABILITY_REVIEW.md` warns
   about). Gated on the universe scan.

---

## 9. The lesson (for the next strategy)

The value of this build wasn't the strategy — it was the **discipline that found
the truth**:

- **An unbelievable number is a lie until proven otherwise.** Hunt the lie.
- **Daily-aggregate, don't ×√N.** Correlated simultaneous trades are not
  independent bets.
- **No lookahead** — a level isn't tradeable until it's *known*.
- **Model how you'd actually trade it** — one held position, not a fresh trade at
  every level.
- **One instrument is the honest unit** — pooling correlated pairs flatters.
- **Judge by cost-stress, walk-forward, per-year and Deflated Sharpe — not the
  headline.**
- **Measure before you build** (E-ratio before the trail; held-model before
  declaring breadth fixed).

Every one of those is encoded as a card or a brick here, so the *next* range
strategy starts honest.
