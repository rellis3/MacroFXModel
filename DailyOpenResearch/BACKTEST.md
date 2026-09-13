# Standard backtest: pricing the fib-pullback finding for real

`FINDINGS.md` #5 found one statistically stable cell in the whole daily-open
suite: an impulse leg's pullback to 61.8% or 78.6% depth, entered there, stop
at the leg's own origin, target the 1.618 extension — gross expectancy
slightly positive on gold (up to +0.11R, t=4.08), net slightly negative once
a flat round-trip cost was subtracted. That was a **statistical** result:
average R per trade across every qualifying leg, pooled.

This is the same rule run through the repo's actual backtest pipeline —
real position sizing, the real per-pair cost model, the real portfolio
tearsheet — to see what "average R per trade" actually does to an account.

## What changed vs. the Python sim

- **Data**: the same M1 parquet (`VolRangeForecaster/data/m1/`, via
  `loadM1ForPair`) DailyOpenResearch/data.py reads — one source of truth.
  (The R2 copies of gold and EURUSD currently return corrupted timestamps
  that collapse the whole 10-year history into ~24 giant "sessions" —
  `loadM1ForPair` falls back to local disk when `R2_ACCESS_KEY`/`R2_SECRET_KEY`
  are unset, which is how these scripts were run. NQ's R2 copy is fine. Worth
  a separate look at the R2 upload for gold/eurusd.)
- **Day anchor**: `bucketM1IntoSessions(packed, 22)` — the fixed 22:00 UTC
  boundary this codebase already calls "the NY/OANDA broker day"
  (`js/forecastAnalyser.js`), not a new anchor. The Python anchor comparison
  (REPORT.md section 1) found this within noise of the DST-aware 17:00 NY
  anchor the Python suite used.
- **Cost**: `costForPair(pair, assetClassFor(pair))` — the house per-pair
  round-trip cost model (`js/perLineStrategy.js`), not the flat 0.30 / 1.5 /
  1.5-pip constants the Python sims used. Gold 0.020%, NQ 0.008%, EURUSD
  0.008% of price.
- **One signal per day per rung.** The Python sim priced every qualifying
  leg independently. Run that way as real 1%-risk trades, one exceptionally
  volatile gold session (2026-02-02) fired the rule **66 times in one day**
  and lost 36% of the account before the sun set on it — a real overtrading
  bug, not a finding. Capped to the first qualifying signal per day per rung,
  the same cut FINDINGS.md #5 already validated separately (continuation
  rate close to the pooled number) and the same discipline every live-sized
  book in this repo enforces its own way (`backtestSystem/config.py`'s
  `levelReentry` / `tradeCooldownMins`).
- **Sizing**: `riskAdjustTrades(trades, riskPct=1)` — 1% of equity risked per
  trade, normalized off the trade's own stop distance — then
  `applyConcurrencyCap(maxConcurrent=1)` and `buildPortfolioDailySeries` +
  `portfolioStats` for the daily-aggregated Sharpe/CAGR/maxDD/Calmar, the
  same bricks `combine_26_pair_portfolio.mjs` and every leave-one-out script
  in this repo already use.

## Result

`fib618` = entry at 61.8% depth; `fib786` = entry at 78.6% depth. Both:
stop at the leg's origin, target the 1.618 extension, riskPct=1%,
maxConcurrent=1, equal-weight 3-pair book (gold, NQ, EURUSD).

| | gross (no cost) | with real cost |
|---|---|---|
| **fib618** combined Sharpe | -0.87 | **-3.29** |
| fib618 CAGR / maxDD | -38.8% / -91% | -79.5% / -99.9% |
| gold fib618 solo Sharpe | -0.06 (flat) | -2.18 |
| NQ / EURUSD fib618 solo Sharpe | -0.67 / -1.14 | -1.40 / -3.07 |
| **fib786** combined Sharpe | -1.48 | **-4.72** |
| fib786 CAGR / maxDD | -63.5% / -99% | -94.5% / -100% |
| gold fib786 solo Sharpe | -0.42 | -3.16 |

n≈750-1,000 trades per pair per rung, OOS-only (post the 60/40 `splitAt`
date), full detail in `analysis/output/daily-open-vote-trades/results.json`
and the with/without-cost pair (`…-gross/` = cost forced to zero) in the
sibling directory.

## Verdict

**Not viable, with or without cost.** Cost is not an innocent bystander
here — it roughly triples the Sharpe damage on every cell (fib618 gold goes
from a coin flip, -0.06 Sharpe, to a clear loser, -2.18, from cost alone) —
but it is not the root cause either: gold's fib618 is the only cell that is
even gross-neutral, and NQ and EURUSD are already losing propositions before
a single cent of spread is charged.

The gap between this and the earlier statistical finding is real and worth
naming plainly: restricting to one signal per day (which honest position
sizing requires) throws away most of the edge. The pooled population — every
qualifying leg, several per day — was the source of the +0.11R gross number;
the FIRST leg of the day specifically is a measurably worse subset for this
rung on gold (gross flips from roughly +0.05 to +0.11R pooled to about -0.07
to -0.22R capped-to-first). That is itself a finding: whatever mechanism
produces the fib-continuation edge concentrates in the legs AFTER the first
one each day, not the first — the opposite of where a discretionary trader
watching one setup would naturally look.

## What would be worth trying next, in order

1. **Trade every qualifying leg, not just the first**, but size it by a
   fixed fraction of a DAILY risk budget (not 1% per trade) so a volatile
   session can't compound into the 66-trade pile-up this run had to be capped
   away from — the pooled population is where the positive gross number
   lives.
2. **Fix the R2 copies of gold and EURUSD** (see above) so this doesn't
   depend on `R2_ACCESS_KEY`/`R2_SECRET_KEY` being unset to run correctly.
3. **Widen the stop off the leg's exact origin** (e.g. origin + 10%, one of
   the variants the Python sims already tried) — a stop sitting exactly on a
   structural pivot is textbook-vulnerable to the wick that reverses one tick
   past it and back; DailyOpenResearch's own report shows this variant
   sometimes tests better gross.
4. **Run the leave-one-out / DSR tooling** (`scripts/leave_one_out_with_ccygate.mjs`'s
   pattern) on whichever variant survives step 1-3, before trusting any
   single cell's Sharpe — this backtest is one configuration, not a search.

## Run it

```
env -u R2_ACCESS_KEY -u R2_SECRET_KEY node scripts/build_daily_open_votetrades.mjs
node scripts/combine_daily_open_portfolio.mjs

# gross / no-cost comparison
DO_OUT_SUFFIX=gross DO_APPLY_COST=0 env -u R2_ACCESS_KEY -u R2_SECRET_KEY node scripts/build_daily_open_votetrades.mjs
DO_OUT_SUFFIX=gross node scripts/combine_daily_open_portfolio.mjs
```
