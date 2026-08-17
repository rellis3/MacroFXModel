# MAE-timing / dynamic-stop test — does a losing trade "reveal itself fast"?

Follow-up to the baseline backtest ([RESULTS.md](RESULTS.md), Sharpe −5.99
gold / −2.49 NQ). Owner's question: assume the engine's entries are correct
and only the STOP is the problem — if a trade is going to lose, does it lose
*fast*? If losing trades show a fast, deep adverse move early while winners
don't, a small stop active only for the first few bars (reverting to the
full structural stop after) could cut losers early without cutting winners
short. Script: [`scripts/mae_dynamic_stop.mjs`](scripts/mae_dynamic_stop.mjs).

Two phases, both re-walked off the real M1 archive (`loadM1ForPair`, same
source as the baseline engine and the existing `maeFromPath` MAE figures —
never approximated from closes):

1. **Adverse-excursion-by-bar-count profile**, split winners vs losers — does
   the hypothesis hold in the data at all, before touching the stop rule?
2. **Dynamic-stop grid** — re-simulate every trade's real path with a
   tightened stop for the first `kBars` bars (`fracEarly` × the original
   stop distance), full structural stop after, across a `fracEarly` ×
   `kBars` grid, and recompute win rate / Sharpe / total R for each cell.

## Phase 1 — the "loses fast" half is true, but so is "wins with an early dip"

| Threshold | Gold winners | Gold losers | NQ winners | NQ losers |
|---|---|---|---|---|
| ≥0.25R adverse | 57.8% (median bar 0) | 99.6% (median bar 0) | 53.5% (median bar 0) | 98.7% (median bar 0) |
| ≥0.5R adverse | 35.4% (median bar 0) | 99.5% (median bar 0) | 31.9% (median bar 0) | 98.6% (median bar 0) |
| ≥0.75R adverse | 16.1% (median bar 1) | 99.5% (median bar 1) | 13.2% (median bar 1) | 98.6% (median bar 1) |
| ≥1.0R adverse | 0% (never — that's the stop) | 99.4% (median bar 1) | 0% (never) | 98.4% (median bar 1) |

Losers do lose fast — ~99% of them are already deep (≥0.75R) against the
entry within 0–1 bars. But that's close to tautological: a trade classified
as a "loss" is, by definition, one whose path eventually reaches the full
stop, and structural stops here sit fairly close to entry (pullback extreme
+ a small ATR buffer), so reaching most of that distance early is unsurprising.

The half that actually matters for a stop-tightening rule: **roughly a third
to over half of WINNERS also dip into the same early adverse zone** — 57.8%
/ 53.5% of winners touch ≥0.25R adverse at the *same median bar* (0) as
losers, and ~1 in 3 touch ≥0.5R. This makes sense mechanically: entries are
filled as a stop right as price is retracing into the 38.2–61.8% pullback
band, so a little continued adverse drift immediately after fill is common
for both outcomes — it's only *after* that shared early noise that winners
and losers diverge. A stop keyed on early depth/time alone can't tell the
two apart from the shape of that dip; it would have to know the future.

## Phase 2 — tightening the early stop makes Sharpe worse, not better

**A bug was caught and fixed before trusting this** (per this repo's
"assume code failure first" discipline): the first version of the re-walk
had no same-day boundary, so it could carry a trade's simulated path past
midnight into the next day — but the baseline engine bounds every trade to
its own UTC day (one trade/day, `ctxBars` ends at day-end) and marks any
trade still open at that boundary by its EOD close price, not a real
SL/TP touch (found in ~1-3% of "wins" by direct inspection). That mismatch
silently flipped a small number of outcomes between the control run and the
true baseline. Fixed by bounding the re-walk to the same UTC-day cutoff and
EOD-fallback rule the original engine uses; verified by a full
trade-by-trade check afterward — **0 outcome mismatches on the control run,
both instruments, all 6,305 trades** — before trusting the grid below.

Best cells and the untightened control (`fracEarly=1.0`), both instruments:

**Gold** (baseline Sharpe −5.987, win rate 24.1%, total R −9,905.51):

| fracEarly | kBars | Sharpe | Win% | PF | Total R | Winners cut short | Losers "saved" |
|---|---|---|---|---|---|---|---|
| 1.0 (control) | — | −5.987 | 24.1% | 0.357 | −9,968.60 | 0 | 719 |
| 0.8 | 5 | −6.093 | 21.9% | 0.347 | −9,894.96 | 91 | 1,626 |
| 0.65 | 5 | −6.370 | 19.5% | 0.325 | −9,857.29 | 188 | 1,712 |
| 0.5 | 5 | −7.292 | 16.0% | 0.273 | −9,845.16 | 317 | 1,794 |
| 0.35 | 5 | −8.181 | 12.3% | 0.227 | −9,779.08 | 459 | 1,896 |
| 0.25 | 5 | −8.575 | 10.0% | 0.203 | −9,726.49 | 557 | 1,939 |

**NQ** (baseline Sharpe −2.486, win rate 32.3%, total R −5,620.60):

| fracEarly | kBars | Sharpe | Win% | PF | Total R | Winners cut short | Losers "saved" |
|---|---|---|---|---|---|---|---|
| 1.0 (control) | — | −2.506 | 32.3% | 0.641 | −5,688.94 | 0 | 700 |
| 0.8 | 10 | −2.460 | 29.3% | 0.638 | −5,612.82 | 99 | 1,740 |
| 0.65 | 10 | −2.514 | 26.3% | 0.623 | −5,575.10 | 199 | 1,794 |
| 0.5 | 10 | −2.618 | 22.2% | 0.603 | −5,593.47 | 337 | 1,832 |
| 0.35 | 5 | −2.678 | 18.9% | 0.580 | −5,574.34 | 454 | 1,777 |

Full grid (6 `fracEarly` × 5 `kBars` values each): `data/gold.mae_dynamic_stop.json`,
`data/nq.mae_dynamic_stop.json`.

**Reading it straight:**

- On **gold**, every tightened cell is *worse* than the control — Sharpe
  degrades monotonically as `fracEarly` shrinks, from −6.09 (mild) to −8.58
  (aggressive). Total R nudges up by a few hundred (out of −9,900+) at the
  mildest setting, then that gain reverses too once tightening gets serious.
- On **NQ**, the mildest tightening (`fracEarly=0.8`, `kBars≈10-30`) gives a
  genuinely tiny Sharpe improvement (−2.460 vs −2.506 control, essentially
  noise on a number already this negative) before the same monotonic
  degradation kicks back in at anything more aggressive.
- In both instruments, "losers saved" always vastly outnumbers "winners cut
  short" in raw count (~1,600-2,000 vs ~90-560) — sounds like a good trade
  until you look at Sharpe/PF, which get *worse* anyway. Each winner cut
  short gives up its full ~2R target; each loser "saved" only avoids a
  fraction of a ~1R loss. The rare, big loss avoided isn't worth nearly as
  much as it looks, once weighed against the frequent, small win given up.

**Conclusion: no. Tightening the stop early, on the "it'll lose fast if it's
going to lose" premise, does not fix this engine — on real data it makes an
already-null strategy modestly worse, on both instruments, at every setting
tried except one economically meaningless NQ cell.** The premise's first
half is true (losers do resolve fast) but the second half — that winners
don't show the same early shape — isn't; early adverse depth doesn't
separate the two outcomes, so a stop built on it can't either. This sits
alongside the baseline result and the VuManChu volume-confirmation test
([VUMANCHU_GATE.md](../jordan_trade_geometry/VUMANCHU_GATE.md), also null)
as a third, independently-tested attempt to rescue this specific engine —
none has found anything.

## Reproduce

```bash
node education/jordan_impulse_range_backtest/scripts/mae_dynamic_stop.mjs gold education/jordan_impulse_range_backtest/data
node education/jordan_impulse_range_backtest/scripts/mae_dynamic_stop.mjs nq   education/jordan_impulse_range_backtest/data ./portfolioBacktest/cache
```

## Correction (2026-08-17, later same day)

Owner clarified: Jordan actually runs his OWN MAE analysis and uses a
dynamic stop that shifts because of it — not necessarily "a tight stop for
the first K bars, then revert," which is the ONE specific implementation
tested above. That implementation tested null; it does not rule out a
different dynamic-stop mechanism (e.g. a stop that trails/tightens
continuously as favorable MAE accumulates, rather than a fixed early
window). Not retested here — flagged so this null isn't read as broader
than what was actually tried. See `scripts/live_validation_harness.mjs` for
a way to check generated signals against Jordan's actual trades directly,
once run somewhere with real OANDA access.
