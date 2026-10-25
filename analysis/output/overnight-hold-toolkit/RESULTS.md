# overnight-hold-toolkit — results

Prereg: `forge/OVERNIGHT_HOLD_TOOLKIT_PREREG.md` (committed in `25bb02ed`, before any simulation). Run 2026-10-25,
seed 20261025, 5,000 paths per cell, block 5. Script `scripts/overnight-hold-toolkit/toolkit.py` → `results.json`.
Ledger id `overnight-hold-toolkit`.

**Toolkit uploads** (C.OG's exact `Date,Return %,MAE %` format, one row per trade, Date = exit date):
`toolkit_nq_gross.csv`, `toolkit_nq_net.csv`, `toolkit_gold_gross.csv`, `toolkit_gold_net.csv`,
`toolkit_combined_gross.csv`, `toolkit_combined_net.csv` in this folder. Our numbers come from a replica of the
toolkit's method; uploading these to the real toolkit (password-protected, not read here) is the check on the replica.

## Verdict: CONTEXT

On the FTMO 2-step rules (+10% then +5%, 10% static floor, 5% daily, no time limit), measured on intraday equity, the
overnight hold at 1× size gets funded **51% (NQ) / 70% (gold) of the time gross and 39% / 42% net**. A zero-edge copy
of the same trades (same shape, mean removed) gets funded 21% / 24%. So **about 17–18 points of the net funded rate
is the edge and the rest is variance**. The catch is time: a funded pass takes a median 160–200 trading days
(8–10 months) at 1×, and sizing up to go faster mostly breaks the 5% daily limit.

THE GATE (≥ 5pp over zero edge at some size, and positive EV at the lower end of the edge interval) reads **yes** on
the letter, with two caveats found after the run (Amendment A1): its EV leg doesn't discriminate, because zero edge
also clears a ~0.54% fee in this payout model; and at the lower end of the edge interval the edge contribution is
**zero** (NQ 20.6% vs 21.1%). The "yes" rests on the point estimate, which isn't confirmed (NQ Holm p 0.085).

## Funded rate, FTMO 2-step (5,000 paths, intraday equity)

| Book | Size | Gross | Net | Zero edge (net shape) | Edge contribution (net − zero) | Net, edge at CI low / high |
|---|---|---|---|---|---|---|
| NQ | 0.5× | 71% | 46% | 14% | +32pp | 15% / 81% |
| NQ | **1×** | 51% | **39%** | 21% | **+18pp** | 21% / 56% |
| NQ | 2× | 22% | 17% | 11% | +7pp | 11% / 25% |
| NQ | 3× | 12% | 10% | 6% | +4pp | 6% / 13% |
| Gold | 0.5× | 78% | 33% | 12% | +21pp | 8% / 71% |
| Gold | **1×** | 70% | **42%** | 24% | **+18pp** | 17% / 67% |
| Gold | 2× | 38% | 25% | 18% | +7pp | 15% / 36% |
| Gold | 3× | 24% | 16% | 13% | +4pp | 10% / 22% |
| Combined (½ each) | 0.5× | 78% | 35% | 6% | +30pp | — |
| Combined (½ each) | **1×** | 80% | **56%** | 23% | **+33pp** | — |
| Combined (½ each) | 2× | 38% | 25% | 14% | +11pp | — |

At 0.5× most non-passing paths are timeouts, not failures (net NQ: 35% of phase-1 attempts still running after 500
trading days). From 2× up almost every non-pass is a breach.

## Time, payouts and the break-even fee (FTMO, 1×, net)

| Book | Median trading days to funded | 12-month funded payouts (80% split, % of account) | Funded account blown within 12 months | Break-even fee (% of account) | Zero-edge break-even fee |
|---|---|---|---|---|---|
| NQ | 159 | 8.0% | 68% | 3.1% | 1.1% |
| Gold | 200 | 7.0% | 57% | 2.9% | 1.2% |
| Combined | 261 | 7.8% | 32% | 4.3% | 1.0% |

The FTMO 100k fee is about 0.54% of the account (assumption, to be checked). Everything here clears it, zero edge
included. That's the prop structure (losses are capped at the fee, wins are paid), not the strategy; the strategy's
part is the gap between the two right-hand columns, about 2pp of account per attempt.

## Generic ruleset (the engine's: +8% in 30 trading days, trailing 10%, 30% consistency), for continuity

Net, 1×: NQ 2.1%, gold 2.7% funded (banked rolling-start figures: 2% / 3%). At 2×: 5.4% / 7.0%. With a 30-day clock
this strategy can't get there; with no clock it can.

## Post-hoc checks (Amendment A1, descriptive)

- **Actual history, no resampling** (fresh FTMO attempt every 21 trades, net, 1×): NQ 35 funded / 48 failed / 10
  unfinished (42% of finished, median 205 trading days); gold 44 / 48 / 2 (48%); combined 53 / 37 / 4 (59%). At 0.5×
  almost every finished attempt passes (NQ 35 of 36, gold 81 of 84), but it takes a median 400–900 trading days.
  Starts overlap, so these aren't independent.
- **Month-long bootstrap block (21) instead of 5,** keeping volatility regimes together, net 1×: NQ 41% vs zero edge
  19%; gold 45% vs 23%; combined 52% vs 20%. The block length doesn't change the picture.

## What this changes

- The prop question has a different answer from the banked one: with no time limit the overnight hold gets funded
  about 40% of the time at 1× net (vs 2–3% under a 30-day clock), roughly double a zero-edge strategy, but it takes
  most of a year.
- The edge itself is still unconfirmed. At the bottom of its interval it adds nothing over luck. The honest next step
  stays a forward paper record, and the toolkit CSVs should be run through the real toolkit to check the replica.
