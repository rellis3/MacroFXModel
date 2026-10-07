# Buy the dip at ~0.8σ, only in a trusted direction (the shape of C.OG's posted trades)

*Pre-registered 2026-10-07, before any trade was simulated. Owner: "try it".*

## Where the idea comes from (and its limits)

Four of C.OG's posted trades (NQ 31 Aug, 9 Sep; EURUSD 11 Sep, 24 Sep 2026) were all buys filled **0.67–0.88σ below the
London open** (between the export's ↓p50 and ↓p75), with small exits back toward the open (≈ 0.3–0.6σ). His direction
is believed to come from macro gates we cannot see. Hypothesis: **location (the ~0.8σ dip) + a trusted direction** is
an edge, even though dips at the lines on their own are a coin flip (Evidence Book: v4-stage0/1, live-range-book).
Six posted winners define the *shape* only. Their dates (after 2026-08-21) lie outside the test data, so the rule's
numbers were not fitted to it.

## Data

- **Pairs:** the yield-spread book's six pairs: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF.
- **Prices:** local M1, London sessions 00:00–22:00, 2016-10 → 2026-08-20.
- **σ:** that session's point-in-time export σ (`pit_sig_used`, Step 0 table), i.e. the plain export as it was that
  morning (the lines his trades were measured against).
- **Direction (the trusted bias):** the yield-spread book at its validated settings (entry |z| 2.0, window 126, exit
  1.5 / 20 days), trades from `/api/yield-spread/run` (`analysis/output/meta_label_ys/ys_run.json`). A London session D
  has a bias when one of the book's trades on that pair is open over D (entered at a close before D, exited at or
  after D), and the bias is that trade's side.

## The rule (fixed now)

- **Long bias:** a limit **buy at open × (1 − 0.8σ)**. **Short bias:** a limit **sell at open × (1 + 0.8σ)**. At most one
  trade per pair per session.
- **Target:** halfway back to the open (entry ± 0.4σ toward the open).
- **Stop:** 0.6σ beyond the entry, the how-much minimum stop for FX (forge/HOW_MUCH_SPEC.md).
- **Otherwise:** out at 22:00 London.
- **Fills:** on M1 bars. The fill bar counts the stop if it also reaches it (stop first). The target counts only from
  the next bar.
- **Cost:** `costForPair` round trip.
- **R** = result ÷ the 0.6σ stop distance.
- **Window variants (both reported; the primary is the first):**
  - **W-all:** fills allowed 00:00–21:00 London;
  - **W-his:** fills only 13:00–16:00 UK (his observed window).

## Controls (same rule, same days and costs)

- **No filter:** every session, both a dip-buy and a rip-sell. The coin-flip baseline.
- **Against the bias:** the same rule, taken in the opposite direction to the yield trade.

## PASS (primary window W-all)

1. With-bias mean net R > 0, its 95% month-block bootstrap interval wholly above 0.
2. With-bias minus no-filter mean R > 0, with its interval wholly above 0.

## What it decides

- **PASS:** "a trusted direction + the 0.8σ dip" is an edge. The Signal Journal gets real "ENTER" alerts for it on the
  six pairs.
- **FAIL:** that combination isn't the edge, whatever C.OG's actual system is.

Output `analysis/output/dip_bias/RESULTS.md`; script `scripts/dip_bias/build.mjs` + `score.py`.

## Amendment 1 (2026-10-07, after the first run): execution fault in the W-his window only

When the 13:00 window opened with price already through the 0.8σ level, the simulation filled at the level (a worse
price than the market) and, if price was already through the stop, booked an instant −1R. A real limit order placed
then fills at the market (that bar's open), and is not placed when the stop is already breached. Fixed. The primary
W-all window is unaffected (orders live from the 00:00 open, price starts at the open). The first-run W-his numbers are
void.
