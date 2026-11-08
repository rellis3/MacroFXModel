# overnight-hold-fx — results

Prereg `forge/OVERNIGHT_HOLD_FX_PREREG.md` (pushed before any FX outcome). Scored once, 2026-11-08, seed 20261108,
block bootstrap (mean block 20 trades, B 10,000), Holm across the two pairs. Window 2016-10-24 → 2026-08-21.
Scripts: `scripts/overnight-hold-fx/run_engine.mjs` (engine unchanged), `scripts/overnight-hold-fx/honest.py`.
Full output: `results.json`, `run.log`.

## Verdicts

| Pair | Trades | Mean net / trade | 95% CI | Holm p | Net a year | Verdict |
|---|---|---|---|---|---|---|
| GBPUSD | 2,026 | −0.026% | [−0.044, −0.009] | 0.008 (negative side) | −5.4% | **NULL** |
| USDJPY | 2,026 | −0.005% | [−0.026, +0.016] | 0.62 | −1.3% | **UNDERPOWERED** |

GBPUSD's interval lies wholly below the +0.01% bar, and below zero: holding it overnight lost money net, in both
halves (−0.022 / −0.030) and in 10 of 11 calendar years. USDJPY's interval spans zero; a modest edge either way
cannot be ruled out, but the estimate is slightly negative.

## Where the money went (sum of nightly %, 2016-10 → 2026-08)

| Pair | Overnight price move | Spread | Financing | Net |
|---|---|---|---|---|
| GBPUSD | −11.4 | −28.5 | −12.9 (pays) | −52.8 |
| USDJPY | +0.7 | −24.3 | +12.8 (credit) | −10.7 |

- **No overnight effect in FX price.** Gross per night is −0.006% (GBPUSD) and +0.0004% (USDJPY), i.e. nothing. The
  overnight legs × every exit→next-entry leg reconstruct buy & hold exactly (ratio 1.000000 both): USDJPY's +52% over
  the decade came entirely outside the 20:00 → 14:30 window.
- **The spread is the whole cost.** About 0.012–0.014% a round trip, 2.4–2.9× the gross move's size over the decade.
- **Carry is real but not enough.** OANDA credits long USDJPY (USD − JPY rate gap minus a 0.81pp markup); that credit
  pays back half the spread. GBPUSD pays on both sides (markup 1.09pp on a gap near zero).

## Against buy & hold (CFD, same window, same financing model)

| Pair | Overnight hold, net | Buy & hold, net | Overnight Sharpe | Prop pass (1×, intraday) |
|---|---|---|---|---|
| GBPUSD | −5.4% a year, DD −44% | −0.4% a year | −0.85 | 0 of 96 starts |
| USDJPY | −1.3% a year, DD −25% | +6.0% a year (+4.4% price, ~1.5% carry) | −0.17 | 0 of 96 starts |

Mirror (descriptive): shorting the same nights loses too (GBPUSD −20.7%, USDJPY −43.4% net total), so it is not a
direction problem: there is nothing in the window to pay the spread.

## With NAS100 and gold

| Book | Net a year | Verdict |
|---|---|---|
| NAS100 | +6.0% | UNDERPOWERED (banked 2026-10-25) |
| Gold | +4.0% | UNDERPOWERED (banked 2026-10-25) |
| GBPUSD | −5.4% | NULL |
| USDJPY | −1.3% | UNDERPOWERED |

The overnight hold is an index/metal effect, as C.OG's task framing implies (it chose NAS100 for the overnight
premium and gold as the control). In FX the window carries no drift and the spread at 20:00 UK takes the rest.

## Limitations

- Financing markup fixed from one snapshot (2026-10-20) and held over the decade (as banked); actual OANDA markups have
  varied. The owner's own accounts were not measured on FX.
- OANDA practice bid/ask; MT5 spreads at 20:00 UK may differ (often wider around the 22:00 rollover).
- Long the pair as quoted only; no direction choice (a carry rule is a different question).

## What it changes

Both pairs go on `overnight-hold-real-costs.html` beside NAS100 and gold with these verdicts, and in an all-four book.
Nothing live changes. No follow-up on FX overnight holds is proposed.
