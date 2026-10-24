# q6-netliq-rerun — results

Re-run of the three backtests that `MD files/BACKTEST_INDEX.md` Q6 says must be repeated after the net-liquidity unit
fix (`plans/DATA_SPEC.md` §5 #8): the macro-equity allocator (`js/macroEquityEngine.js`, page
`macro-equity-backtest.html`), the liquidity-gate backtest (server.js `_computeLiquidityGate`, page
`liquidity-gate-backtest.html`) and the Global Liquidity backtests (`GlobalLiquidity/backtestCore.mjs` +
`js/globalLiquidityEngine.js`, page `global-liquidity.html`). Run 2026-10-24. Branch
`worktree-agent-abe91e57843ba5c43`.

**None of the three had an Evidence Book entry or a banked number.** BACKTEST_INDEX carried only "re-run" notes, so
there is no banked result to compare against. Each was therefore run twice, once with the fixed line and once with
the 2026-07-02..2026-10-17 line (`WALCL/1000 − WTREGEN − RRP`, TGA left in $M, roughly −TGA), so what the fix changed
is visible. The old line is reproduced by feeding WTREGEN × 1000 into each engine's own fixed code; nothing else
differs between the two runs. None of these is pre-registered, so none can be `validated`; Q6's bar is the engines'
own gate (OOS Sharpe ≥ 0.5, "below → macro stays a dashboard").

## Data (no OANDA_KEY or FRED_KEY in this session)

- FRED: public fredgraph.csv for every series (`fetch_fred.mjs` → `fred.json`, fetched 2026-10-24). NAPM and
  MPMIEZMA156N 404 on FRED, so ISM = INDPRO (the server's own fallback). **BAMLH0A0HYM2 (HY OAS) starts 2023-10-24 on
  FRED** (rolling ~3-year window); this limits two of the three engines (below).
- Prices: OANDA data already on disk (feature-store D1 closes for macro-equity; local OANDA H1 caches for the
  liquidity gate; local M1 research caches for GLI). Everything cut at **2026-08-21** (lockbox; the local caches end
  there).
- Never wrote to R2 or KV.

## 1. Macro-equity allocator — verdict: CONTEXT

`run_macro_equity.mjs` (engine v3, default config). Deviations: open = previous close (the store has closes only;
the engine uses only the first open of each month); IWM left out (no US2000 in the store); VIX from FRED VIXCLS
(same CBOE close as Yahoo ^VIX); spine = NAS100 ∪ SPX500 dates. 2005-01-03 to 2026-08-21, 5,640 days, 78
walk-forward windows.

| Run | Instr | Sharpe (B&H) | CAGR (B&H) | maxDD (B&H) | OOS Sharpe | WFE | Engine gate |
|---|---|---|---|---|---|---|---|
| fixed units | QQQ | 0.90 (0.84) | 9.1% (14.6%) | −31.3% (−50.3%) | 1.19 | 1.17 | pass |
| fixed units | SPY | 0.72 (0.65) | 5.6% (9.0%) | −30.6% (−52.6%) | 0.93 | 1.19 | pass |
| old units | QQQ | 0.86 | 8.7% | −30.5% | 1.16 | 1.21 | pass |
| old units | SPY | 0.68 | 5.4% | −30.6% | 0.93 | 1.23 | pass |
| fixed, net-liq weight 0 | QQQ | 0.86 | 8.0% | −28.4% | 1.19 | 1.21 | pass |
| fixed, net-liq weight 0 | SPY | 0.68 | 5.0% | −30.4% | 0.98 | 1.24 | pass |

The engine's gate passes, but it cannot tell us anything about macro: buy-and-hold clears the 0.5 Sharpe bar itself,
and the allocator never holds less than 50% (floor) with a 200-day / 12-month trend and VIX overlay on top. The
ablation is the informative row: **with net liquidity removed from the composite the OOS Sharpe is the same (QQQ 1.19)
or higher (SPY 0.98 vs 0.93)**. The fix moved the full-sample Sharpe by +0.04, within noise. Bank as context: the
allocator lowers drawdown versus buy-and-hold at the cost of about a third of the CAGR, and net liquidity is not what
does it. Credit (HY OAS) only exists from 2023-10, so the composite runs on the other legs for most of the sample.

## 2. Liquidity-gate backtest — verdict: UNDERPOWERED

`run_liqgate.mjs` lifts `_computeLiquidityGate`, `_liqGateBarsFromH1` and their helpers out of server.js verbatim at
run time; route defaults (threshold 0.25, stop 3%, risk 1%, requireBoth). Bars from the local OANDA H1 caches
(2016-01-04 → 2026-08-20; the route asks from 2015-01-01).

Because `requireBoth` needs a credit z-score, and HY OAS starts 2023-10-24, the gate can only open a trade from
**2023-12-11**: about 2.7 years, the same on Railway if its API key gets the same window.

| Instr | Fixed: trades, Sharpe (SE) | Old: trades, Sharpe | B&H Sharpe, same span | netliqZ vs 5-day fwd return corr (fixed) |
|---|---|---|---|---|
| NAS100 | 84 (83 long), 0.82 (0.64) | 36, −0.87 | 1.24 | −0.003 |
| SPX500 | 84, 0.95 (0.64) | 36, −0.64 | 1.39 | −0.008 |
| US30 | 84, 0.42 (0.64) | 36, −0.39 | 1.11 | −0.014 |
| US2000 | 84, 0.41 (0.64) | 36, −0.42 | 0.98 | −0.013 |
| DE30, UK100 | no day bars (the builder needs 21-22 UTC H1 bars, which these caches lack; the server would throw too) | | | |

The fix turns a losing gate into a winning one, but the fixed gate sits below buy-and-hold on all four markets over
the same span, it is in a trade 34% of days at 1/3 leverage, and the signal has no relationship with the next week
(corr ≈ 0, hit rate 0.49-0.50). With a Sharpe SE of 0.64 the test cannot rule a modest edge in or out. The page's
headline numbers before 2026-10-17 (old line) were negative.

## 3. Global Liquidity — verdict: NULL

`run_gli.mjs`: the server's three computations (`computeBacktest` FX book, `computeNqBacktest`,
`computeRegressionTest`) with the server's FX loading from local M1 (26/26 pairs) and FRED from the dump, from
2008-01-01 (the server's start). 973 weeks, 2008-01 → 2026-08-18.

| | Fixed units | Old units |
|---|---|---|
| FX book Sharpe (net) | 0.018 | −0.179 |
| Walk-forward OOS Sharpe (28 windows), WFE | −1.229, 0.76 | −1.663, 0.85 |
| NQ: buy-and-hold Sharpe; best liquidity rule | 0.691; long/flat 0.614 (OOS 0.58 vs B&H 0.78) | 0.691; long/flat 0.499 (OOS 0.64) |
| Regression: pairs with NW-HAC \|t\| ≥ 1.96; pooled t | 1/26; −1.25 | 4/26; +1.03 |

With the fix the FX book makes nothing (Sharpe 0.02, OOS −1.2, below the 0.5 gate), no NQ timing rule beats
buy-and-hold, and 1 of 26 pairs is significant at 5% (about what chance gives). The pre-fix line was worse on the
book (−0.18) and showed 4/26 "significant" pairs, which the fix removes; only the USD block changed, so the other
blocks (ECB, BoJ, China) carry the same null either way. 973 weeks is plenty to see a 0.5
Sharpe, so this is a null, not a power problem.

## Deviations

Listed per engine above. In short: local OANDA data instead of live OANDA; fredgraph instead of the FRED API; lockbox
cut 2026-08-21; macro-equity opens = previous close, no IWM, VIXCLS for ^VIX.

## What this changes

- Q6 answered: none of the three liquidity engines clears a bar that net liquidity itself is responsible for. Macro
  stays a dashboard, not an allocator (BACKTEST_INDEX's own rule for this outcome).
- The liquidity gate's credit leg only has ~3 years of FRED history, so any requireBoth result is short by
  construction. Swapping in BAA10Y−AAA10Y (as `macro-confluence-baa-credit` did) would need its own prereg.
- Not banked in the Evidence Book: these were never registered or banked, and this task added no new ids. Register
  row `q6-netliq-rerun` holds the record.

## Files

`scripts/q6-netliq-rerun/` (`fetch_fred.mjs`, `export_index_closes.py`, `run_macro_equity.mjs`, `run_liqgate.mjs`,
`run_gli.mjs`); outputs here: `macro_equity_{fixed,old,fixed_no-netliq}.json`, `liqgate_{fixed,old}.json`,
`gli_{fixed,old}.json`, logs. `fred.json`, `px_index.json` and the GLI weekly-returns cache are regenerable and not
committed.
