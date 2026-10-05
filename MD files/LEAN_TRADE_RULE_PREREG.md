# LEAN-TRADE-RULE — the lean traded as a real trade, with a stop

**Pre-registered 2026-10-06, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

The owner's description of how someone actually trades a fundamental bias:

> *"a guy who at 8am based on bearish/bullish enters a trade with a ATR 1.5 SL and runs to
> 9pm for closure, all on fundamental bias"*

Stated testably: **taking today.html's directional lean at 08:00 UK, with a 1.5 ATR stop,
exiting at 21:00 UK, is profitable net of the spread.**

## Why it is not already settled

`pair_ledger_v1` scores the same leans but as a **sign check, not a trade**: `hit` is
`sign(close − call price)`, with no stop, no fixed entry hour and no fixed exit hour. As of
2026-10-05 it reports, over 22 days and 660 calls:

| horizon | n | hit rate | gross ATR | **net ATR** |
|---|---|---|---|---|
| h0 session close | 146 | 52.7% [44.6, 60.8] | +0.018 | **−0.018** |
| h1 +1 day | 142 | 45.8% | −0.004 | **−0.036** |
| h5 +5 days | 84 | 44.0% | −0.278 | **−0.310** |

So the closest existing measurement is already net-negative. **That does not settle this**,
for two reasons that are the whole point of running it:

1. **There is no stop in the ledger.** A 1.5 ATR stop truncates the left tail. On a signal
   whose gross expectancy is ~zero, truncating losses while letting winners run to a fixed
   exit is exactly the kind of change that can flip a sign — in either direction.
2. **The entry and exit hours are not fixed.** The ledger scores from whenever the call was
   made to the session close. 08:00 → 21:00 is a different window, and this desk has already
   found time-of-day is a real conditioner (`reversal-hour`: 20:00–22:00 UTC reverts).

## Definitions, fixed in advance

- **Universe**: every directional (`dir` = up/down) row in `pair_ledger_v1`. `flat`/mixed
  rows are the page declining to call and are NOT trades.
- **Entry**: the open of the 08:00 **UK** H1 bar on the call's date, from
  `VolRangeForecaster/data/m1/all_pairs_h1.parquet`. Not the ledger's `price` — the rule
  specifies an hour, and using the call price would smuggle in whenever the page happened
  to be read.
- **Stop**: 1.5 × the row's own stored `atr`, from entry, checked against each H1 bar's
  high/low in order. First touch fills at the stop. H1 granularity is adequate for a stop
  this wide; it would not be for a tight one.
- **Exit**: the close of the 20:00 UK H1 bar (the last bar completing at 21:00), if the
  stop was not hit.
- **Cost**: the row's stored `spread`, subtracted once from every trade. The ledger already
  does this and its own header says why — *"a 51% hit rate on a move smaller than the spread
  is a loss"*.
- **The outcome**: P&L per trade in ATR, net of spread. Hit rate is reported but is NOT the
  verdict: a stop makes hit rate and expectancy pull in opposite directions by construction.
- **THE UNIT IS THE DAY, NOT THE LEG.** Six yen legs on one dollar day is one bet. The desk
  has already been bitten by this (`currencyViews` in `js/endOfDay.js`, after a leg tally
  read one move as six successes). Results are reported per day-bet: each day's trades are
  averaged into one observation before anything is tested.
- **MIN_EVENTS**: **30 day-bets**. Below it the result is UNTESTABLE, which is NOT a null.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Is mean net P&L per day-bet positive? | **No.** The stop-free version is −0.018 ATR and the signal is 52.7% at best. |
| b | Does the 1.5 ATR stop change the sign versus the same window with no stop? | **No, and barely anything.** A session rarely travels 1.5 ATR, so on a one-day hold the stop should seldom trigger — I expect it to be close to inert, which is itself worth knowing. |
| c | **THE GATE.** Net P&L per day-bet must clear zero on a day-clustered bootstrap interval, on at least 30 day-bets. | **Expect it to fail, most likely on sample size before anything else.** |

**This will almost certainly come back UNTESTABLE, and that is stated here rather than
discovered later.** The ledger holds 22 days. Thirty day-bets is roughly six weeks of
trading. Writing the floor down now is what stops a thin result being read as a verdict
when the numbers arrive.

## What this does NOT test

- **Any other entry hour, stop width or exit hour.** One rule, as described. Trying several
  and reporting the best is the thing this format exists to prevent.
- **A take-profit.** The rule as given has none.
- **Position sizing.** Every trade is one unit of ATR risk.
- **Slippage beyond the quoted spread**, or the stop gapping through on a news print.
- **Whether the LEAN is sound.** It tests one way of trading it. A null here is a null on
  the rule, not proof the underlying read is worthless — and vice versa.
