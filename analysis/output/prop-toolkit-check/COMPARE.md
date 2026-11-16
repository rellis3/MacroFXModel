# Prop toolkit check: our replica vs C.OG's real toolkit / EV modeler

**What this is:** the check on our copy of C.OG's toolkit (`scripts/overnight-hold-toolkit/toolkit.py`). Both of our prop
studies used the copy, because his tool is behind a password. If his tool gives the same numbers on the same files, the copy
can be trusted. If not, one of the two applies a rule differently, and we find out which before using either. It is
card Q1 of `.claude/skills/research-director/agendas/prop-ev.md`.

**This is not a test of whether the systems are good.** Neither system was killed: both studies are banked CONTEXT
(edge not confirmed, CI touches zero). We use them because they are the trade lists we have in his format, and the
overnight hold is the task he set.

Built by `scripts/prop-toolkit-check/build_pack.py` from banked files only (no new simulation). Format = his spec:
`Date,Return %,MAE %`, Date = **entry** date, 2 decimals, % of account per trade, MAE ≤ 0.

## Files to upload (this folder)

| File | What it is | Rows |
|---|---|---|
| `upload_overnight_nq_net.csv` | overnight hold, NAS100, after real costs | 1,949 (2016-10-24 → 2026-08-19) |
| `upload_overnight_gold_net.csv` | overnight hold, gold, after real costs | 1,962 |
| `upload_overnight_combined_net.csv` | both at half size each | 1,965 |
| `upload_portfolio_book_A.csv` | Portfolio Book, CFD-tradeable, all haircuts (one row per day) | 2,763 (2016-01-04 → 2026-08-21) |
| `*_ZERO_EDGE.csv` (one per file above) | **the same rows with the average return removed**: the same ups, downs and streaks, but no edge. Whatever this scores is luck plus the prop structure | same |

## Settings in his toolkit

- Firm **FTMO**, program **FTMO Challenge · 2-Step** (10% then 5%, 10% static max loss, 5% daily loss of initial, min 4 days)
- Value column: **% return**; Scale k **1.00**
- Bootstrap: **Preserve streaks**, block length **5**
- Paths: **5,000** (or more)
- EV modeler: account 100k, fee as listed (we assumed ~0.54% of account, about €540); note whether "fee refunded with
  first payout" is on

## Fill in

Ours = our replica, 1×, FTMO 2-step, intraday equity, 5,000 paths. Agreement = within about 2 points (Monte Carlo error is
about ±0.7 points at 5,000 paths).

| File | Funded: ours | Funded: his | Cleared step 1: ours | his | Median days to funded: ours | his | Zero-edge funded: ours | Zero-edge funded: his |
|---|---|---|---|---|---|---|---|---|
| overnight NQ net | 38.7% | | 54.6% | | 159 | | 21.1% | |
| overnight gold net | 41.6% | | 57.3% | | 200 | | 23.9% | |
| overnight combined net | 55.6% | | 68.4% | | 261 | | 22.8% | |
| Portfolio Book A | 33.1% | | — | | 205 | | 16.3% | |

From his EV modeler, please also note: EV per challenge bought, % that cover the fee, P(any withdrawal), median days to
first withdrawal, payout at week 6 (median and lower quartile) for each real file **and its zero-edge twin**. We don't have
those outputs yet (agenda Q2), so they are the new information.

Our EV-type numbers for reference (12 months funded, 80% split, monthly payouts, fee lost):

| File | 12-month payouts if funded (% of account) | Funded account blown within 12 months | Break-even fee (% of account) |
|---|---|---|---|
| overnight NQ net | 8.0% | 68% | 3.1% (zero edge 1.1%) |
| overnight gold net | 7.0% | 57% | 2.9% (zero edge 1.2%) |
| overnight combined net | 7.7% | 32% | 4.3% (zero edge 1.0%) |
| Portfolio Book A | 6.2% | — | EV +1.52% per attempt (zero edge +0.12%) at a 0.54% fee |

## What to read from it

1. **Do the funded rates match?** If yes, the replica is good and we can model the funded-stage outputs ourselves.
2. **What does the zero-edge twin score in his tool?** If it also shows a positive EV, the EV modeler's headline can't
   separate a system from luck on its own. Read your system's EV minus the twin's.
3. **Payout timing:** his example showed payouts from week 6; ours needs a median 160–260 trading days just to be
   funded at 1×. The difference is the input system, and this run shows it on our own files.
