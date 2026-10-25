# overnight-hold-toolkit — run the overnight-hold trades through the prop-firm toolkit: gross first, then net. How often does it get funded, and how much of that is edge rather than luck?

**Pre-registered 2026-10-25, before any toolkit-style simulation was computed.** Not blind on the inputs: the trade
lists are the banked `overnight-hold` ones (`analysis/output/overnight-hold/honest_trades_{nq,gold}.csv`), whose mean,
spread and prop pass rate under the engine's generic 30-day ruleset are already known (2–3% at 1×). This study is
C.OG's stage 7 ("take the trades through the prop firm toolkit"), which was never done on a real program's rules.

| | |
|---|---|
| ID / ledger id | `overnight-hold-toolkit` (context; one entry) |
| Branch | `claude/overnight-hold-dax-ifo-retro` |
| Register row | `plans/RESEARCH_REGISTER.md` → `overnight-hold-toolkit` |
| Data | the banked trade lists: NQ 1,949 and gold 1,962 overnight trades, 2016-10-24 → 2026-08-21 (lockbox end). No new price data |
| Seed | `20261025` |
| Uncertainty | Monte Carlo, 5,000 paths per cell, block bootstrap of daily rows (block 5, the toolkit's "preserve streaks" default); MC error ±0.7pp on a 50% rate |
| Scripts / outputs | `scripts/overnight-hold-toolkit/` → `analysis/output/overnight-hold-toolkit/` |
| Harness | own script: a replica of the toolkit's method as its page describes it. The toolkit's own code is behind a password and was not read; our replica is labelled as ours. The toolkit CSVs are exported so the owner can run the real toolkit and compare |

## 1. The claim (required)

C.OG, Overnight Hold task (`education/bank-verbatim/Overnight-Buy-Hold-Task/PAGE_TEXT.md`):

> A prop challenge … demands a **modest return delivered in a particular shape** — without tripping a daily loss
> limit, a drawdown line, or a consistency cap … Run the trade history through the toolkit and you see it directly:
> which days breach the daily cap, how close the trailing drawdown comes, how many trading days it takes to reach
> target.

The owner's framing (2026-10-25): run the process end to end to see that even a simple idea can be positive EV, gross
first and then with costs.

## 2. Why it is not already settled (required)

`overnight-hold-nq` / `-gold` (underpowered) ran the engine's **generic** ruleset (8% in 30 trading days). Real
programs such as the FTMO 2-step have no time limit, a 10% / 5% two-phase target and a static 10% floor, which is a
different question: with no clock, any positive-drift series eventually reaches target unless a loss limit stops it.
No ledger entry runs a real program's rules or measures how much of a pass rate is variance alone.

## 3. Definitions, fixed in advance (required)

- **Toolkit CSVs** (C.OG's exact format, `Date,Return %,MAE %`, one row per trade, Date = exit date):
  gross = `grossPct`, `maePct`; net = `net`, MAE − (spread + financing) (all of that trade's costs counted as
  already paid at its worst point, conservative). Per instrument, plus the **combined third pass**: both instruments'
  rows at half size each (total notional 1× equity).
- **Program (primary): FTMO Challenge 2-step** as listed on the toolkit page: Phase 1 target +10%, Phase 2 +5%,
  max loss 10% of initial (static), daily loss 5% of initial (hard), minimum 4 trading days per phase, no time limit
  (simulation stops a phase at 500 trading days and counts it as a timeout). Each phase restarts at the initial
  balance.
- **Daily loss on intraday equity:** a day breaches if start-of-day equity + (trade size × MAE) falls below the
  start-of-day balance − 5% of initial; max loss uses the same intraday low against initial − 10%.
- **Size k:** notional as a multiple of equity, k ∈ {0.5, 1, 2, 3, 5}. Return per day = k × trade return.
- **Bootstrap:** daily rows resampled in blocks of 5 consecutive trades (toolkit default), 5,000 paths per cell.
- **Zero-edge control (THE MIRROR):** the same rows with the sample mean subtracted from Return % and MAE %
  (same shape, no drift). Edge contribution = funded rate − zero-edge funded rate.
- **Edge-uncertainty band:** the net cells re-run with the mean shifted to the lower and upper ends of the banked 95%
  CI (NQ [+0.0011, +0.0660]%, gold [−0.0092, +0.0538]% per trade).
- **Funded stage and EV (descriptive):** each funded path then trades 12 months (252 days) under the same daily /
  max-loss rules; 80% of month-end profit above the initial balance is paid out and the balance reset to initial.
  EV per attempt (in % of account) = P(funded) × E[12-month payouts] − fee. The fee is not modelled; the
  **break-even fee** (the EV = 0 fee) is reported and compared with the FTMO 100k fee as a stated assumption (€540 ≈
  0.54% of the account; to be checked by the owner).
- **Secondary program:** the engine's generic ruleset (8% in 30 days) for continuity with the banked result.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| T1 | Gross funded rate at k = 1 | High (>50%): positive drift and no time limit |
| T2 | Net funded rate at k = 1 | Lower than gross, still above the zero-edge control |
| T3 | Edge contribution (net − zero-edge) at the best k | Small and inside the edge-uncertainty band: much of any pass rate is variance |
| T4 | Break-even fee vs ~0.54% | Gross above it; net uncertain |

**THE GATE (reading, not a verdict):** "the edge pays for the challenge" only if at some k the net funded rate exceeds
the zero-edge rate by ≥ 5pp **and** the EV is positive at the lower end of the edge-uncertainty band. Otherwise the
pass rate is reported as mostly variance.

## 5. Power (required)

Monte Carlo error is small (±0.7pp). The binding uncertainty is the edge itself: the banked per-trade mean is not
confirmed (NQ Holm p 0.085), which is why the edge-uncertainty band is part of the design. No new inference about the
mean is made here.

## 6. Multiplicity (required)

Nothing is scored as a test. 2 cost states × 3 books × 5 sizes × 2 programs plus controls are a descriptive grid,
reported in full. Picking the best k after the fact is labelled as such.

## 7. What this does NOT test (required)

Whether the overnight edge is real (banked: underpowered). FTMO's real fills, swaps or spreads (the costs are
OANDA's; see `cost-verification`). Any program other than the two listed. Consistency rules (FTMO 2-step has none).

## 8. What each verdict changes (required)

Verdict word: **CONTEXT** in every case (a descriptive add-on). The ledger entry says the funded rate, the zero-edge
rate and the break-even fee. If THE GATE reads yes, the next step is a forward paper record, never a paid challenge
from this study alone.

## Amendments

### A1 — 2026-10-25 — POST-HOC (results seen)

- Added two descriptive checks: FTMO on the actual trade sequence (a fresh attempt every 21 trades, no resampling)
  and a 21-trade bootstrap block for the net 1× cells. They don't change any registered cell.
- THE GATE reads yes on the letter, but its EV leg turned out not to discriminate: in this payout model the
  zero-edge control also clears a ~0.54% fee (break-even fee ~1.0–1.2%), because a challenge caps losses at the fee.
  The registered reading is reported as is, with this caveat and the fact that the edge contribution is ~0 at the
  lower end of the edge interval.

## RESULTS

*In `analysis/output/overnight-hold-toolkit/RESULTS.md`.*
