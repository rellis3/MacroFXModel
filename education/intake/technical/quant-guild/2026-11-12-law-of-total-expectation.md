# Modeling with the Law of Total Expectation

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=-CPUbalMh14 |
| ReelScribe id | j570pwn4x60f4askzbmxmr3t858j20r3 · 23:59 |
| Notebook | `2026 Video Lectures/114. Modeling with the Law of Total Expectation/` (link file only, no notebook; whiteboard talk) |
| Recorded | 2026 (he refers to "a school in 2026"); exact date unknown |
| Processed | 2026-11-12 |

## Lesson
Any unconditional mean can be split over a partition of the sample space:
E[X] = Σ E[X | Aᵢ]·P(Aᵢ). In a fixed population each piece converges (LLN). In markets "there is no fixed data
generating distribution", so the pieces don't converge, and the unconditional mean drifts (heights in 1902 vs 2026;
stock returns in the 2000s vs now). Decomposing shows *which* piece moved. Applied to trading:
E[P&L] = E[P&L | win]·P(win) + E[P&L | loss]·P(loss), partitioned further by vol regime and macro state. The legs
"are typically extremely unstable", and conditioning until they are "reasonably stable" is what an edge is. His first
request to anyone he consults for: "the distribution stability over time of their strategy". Backtests and walk-forward
estimate how unstable it is, but "all empirical research… is data mining".

## Approach
- **Question**: not "is expectancy positive?" but "which leg (hit rate, average win, average loss, regime weights)
  holds still over time?"
- **Evidence**: none shown. A whiteboard argument.
- **Habit**: decompose by partition, track each leg in time, and use a distribution distance where needed.
- **Kill rule**: legs that won't settle under any sensible conditioning = no edge.
- **Statistics**: "mean positive with reasonably constrained variance", and risk "structurally orthogonal" to plain
  market exposure.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | E[P&L] decomposes into win/loss legs × regime weights; track each leg's stability (QG) | method | **PARTLY**: per-trade win rate, MFE/MAE and give-back exist (`project_giveback_diagnostic`, `backtest_entry_quality.py`, Fib Atlas bt 85.7% vs live 39.6%), but no leg-by-leg, by-regime time series with a noise band for any forward record |
| 2 | Without stationarity, sample statistics need not converge (QG) | method | ALREADY DO (by design): forward records + lockbox, "every number is one draw" |
| 3 | An edge's risk should be orthogonal to plain market exposure (QG) | method | ALREADY DO: `rule-a-portfolio-second-book` (separate source of return), Portfolio Book bias checks |
| 4 | "All empirical research… is data mining" (QG, quoting someone) | method | ALREADY DO: trial ledger, best-of-N, Holm/BH |

## What we could learn
- **Decompose expectancy into legs by regime and watch each leg move.** DON'T DO for live/forward books. Our forward
  records (Rule A + book from 2026-10-28, rich-vol paper record, `residual-fx8-forward`) are judged on a total at a
  fixed date. The backtest-vs-live gaps (Fib Atlas, motif bots) were explained after the fact. A decomposition says
  early whether hit rate or payoff moved, and in which regime. It also answers his non-stationarity video's question
  ("which regime did it work in?") for books, the way `vol-layer-deep/feedback`'s CUSUM already does for σ misses.
  New method lesson (WATCH).
- **Regime weights are a leg too.** A forward year with a different calm/busy mix than the backtest will change the
  total even if every conditional leg holds. `LOCKBOX_ADDENDUM_1.md` reports neutral regime buckets for the lockbox.
  The paper records should do the same.

## Research ideas
**Card: which leg drifts, live against the backtest?** → `model-audits` (proposed Q5)
- Variable: for each book with a backtest and a live/forward record, the four legs P(win), E[R | win], E[R | loss],
  and the regime weights (neutral buckets: σ_d ÷ trailing 250-session median, terciles), each conditional on regime.
- Condition: backtest vs forward, and within the backtest by year.
- Horizons: rolling 50 / 100 / 200 trades.
- Noise threshold: each leg's own spread under a block bootstrap of the backtest's trades (21-session blocks); a
  forward leg outside its 90% band = drift.
- Benchmark / mirror: the backtest's legs; a shuffled-date mirror of the backtest gives the false-alarm rate.
- What it would change: early and specific warnings ("payoff shrank in busy regimes") instead of one verdict at the
  judge date. It also re-reads the Fib Atlas 85.7% → 39.6% gap by leg. Diagnostic, not a gate: it must not change a
  pre-registered judge date or rule (H-B side-by-side rule).
- Screening: PARTLY ON FILE (claim 1). `evidence_map` "edge decay stability win rate payoff drift" gives 0 hits.
  Data: bot trade history (two stores, memory `project_backtest_bot_trade_history`), paper-record KV. **Repo is public:
  trade pulls stay gitignored** (memory `feedback_public_repo_no_pnl`). Power is thin for young records (weeks).
  Start with the bots that have months of live trades.

## Quotes
- "You can always decompose an unconditional expectation into a series of conditional expectations."
- "If you have an edge, then this is going to be reasonably stable over time."
- "If we're not in the classroom, then convergence is not guaranteed, and that's the entire game."
- "All empirical research in that sense is data mining."
