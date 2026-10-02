# IV ÷ RV in the book, the rich-IV break rule on the indices, and COT positioning at the lines — pre-registration

Committed 2026-10-02 before any number below was computed.

## Data
- **FX/gold IV ÷ RV:** CME CVOL (js/data/cmeCvolEod.json) ÷ 20-day realised vol of its `underlying`, the row dated
  before the London day — exactly as forge/BREAK_IVRV_PREREG.md (edges from 2016–22: 1.05 / 1.27).
- **Index IV ÷ RV:** CBOE daily closes (cdn.cboe.com, downloaded 2026-10-02 into analysis/output/rangebook/cboe/):
  VXN → NQ, VIX → SPX, VXD → DOW, RVX → US2000. RV = 20-day realised vol of the index's own NY-close daily bars from
  the M1 history. The CBOE close dated before the London day. Terciles from that set's 2016–22 rows (SPX/DOW: 2021–22).
  DE30 and UK100 have no free implied-vol history and are excluded.
- **COT:** CFTC Socrata, futures-only, pulled 2026-10-02 into analysis/output/rangebook/cot/: TFF `gpe5-46if` Leveraged
  Funds for EUR, GBP, JPY, AUD, CAD, CHF, NZD; Disaggregated `72hh-3qpy` Managed Money for gold. Definitions reused
  unchanged from js/cotFactorCore.js: OI-normalised net, JPY/CAD/CHF flipped into pair terms, 156-week percentile, a
  report becomes usable on the Monday after its Friday release (`tradableFrom`).

## A — IV ÷ RV as a column in the main book (the 1 : 1 race)
Rows: every book pass of the 7 CVOL instruments. Groups: top vs bottom third of IV ÷ RV. T1: within-cell (line family ×
London hour × range used) continue difference, day-bootstrap 95% CI, both halves. T2: each third's follow and fade net R.
Expectation from the break result: rich IV → more continuation.

## B — the rich-IV break rule, replicated on the indices (CONFIRMATION of forge/BREAK_IVRV_PREREG.md)
The same BREAK trades already built (asym_build.mjs) on NQ, SPX, DOW, US2000, the same four cells (0.1σ/0.2σ × 5R/10R),
top third of the index IV ÷ RV. **CONFIRMED** = mean net R > 0 in the top third, top > bottom third, and net R > 0 on
SHORTS alone (no long-drift pass). Anything else = the FX/gold pass does not carry to indices.
Also reported: the same three conditions on the index book race (A's design).

## C — COT positioning at the lines (FX/gold book instruments with COT: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD,
USDCHF, NZDUSD, gold)
- Crowded long = percentile ≥ 80; crowded short = ≤ 20 (pair terms).
- A touch is **with the crowd** when it heads the crowded way (an up line with crowded long, a down line with crowded
  short) and **against** in the mirror case.
- T1: within-cell continue difference, with vs against; day-bootstrap 95% CI; both halves.
- T2: follow R when with the crowd; fade R when with the crowd (crowding theory: crowded moves fade at levels); follow R
  when against.
- Both theories are live (hedging-pressure → follow; crowding → fade; the August factor test leaned fade, p = 0.094), so
  T1 is two-sided.

## Pass rules
T2 rows across A and C: net R > 0 in both halves AND Benjamini–Hochberg 10% across all A + C rows. B has its own rule
above. Self-checks: the IV ÷ RV and COT values attached to a pass must use only data dated before its London day
(asserted in code), and the book rows are the existing future-scramble-checked files.
