# Flow and positioning columns at the vol lines — pre-registration

Committed 2026-10-01 before any number below was computed. Owner's question: do the institutional / quant reasons a
level holds or breaks (dealer gamma, expiries, catalysts, rebalancing flow, absorption, regime) change fade vs
continue at the Vol Forecast lines? New columns for the Fade/Continue Book. Same rows, races and R as the book.

## Columns
**G — dealer gamma sign (start here).** Net GEX from the CME option archive (`oi_research_book/data/
daily_master_all_*.parquet`, `net_gex_sum`, the book's sign convention: > 0 = dealers long gamma). NQ and the six FX
pairs with an archive (EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY), 2020-09 →. A London day uses the value
dated two business days earlier. Groups: long (> 0) vs short (< 0); terciles of GEX ÷ its trailing 60-day median
absolute value (secondary). Textbook: long gamma → less continuation (dealers sell rallies, buy dips). The sign
convention is an assumption (oi_research_book/GAMMA_REAL_IV_PREREG.md found the flip pointing the other way), so
the test is two-sided and both readings are reported.

**E — expiry pin.** On a day an option series expires (expiry timestamp in `OI Data/*.csv`; NQ and the six FX
pairs), the 3 strikes with the most OI in that expiring series (OI two business days earlier), in spot terms.
Touch before the expiry time with an expiring strike within 0.05σ of the line vs not; placebo = strikes shifted
0.15–0.5σ (forge/CONFLUENCE_LEVELS_PREREG.md). Textbook: pinned → less continuation.

**C — catalyst.** `calendar_events.csv` (USD/EUR/GBP, UTC release times, 2014 → 2026-07-02). A touch within 60 min
after a Major release in one of the instrument's currencies (released before the touch bar) vs not. Surprise z =
(actual − consensus) ÷ SD of that event's past surprises (≥ 12 prior releases, past only). Aligned = the surprise
pushes the instrument the way the touch is going (base-currency surprise up = instrument up; quote-currency up =
down; gold = USD quote; indices: presence only), |z| ≥ 0.5. Textbook: catalyst / aligned → more continuation.

**F — fix and month-end flow.** WM/R 16:00 London fix window = touches 15:45–16:15 London; month-end = the last
London business day of the month. Groups: fix window on month-end days vs fix window on other days (within the
same hour cells). Textbook: month-end fix flow is one-off rebalancing → fade after it.

**A — absorption (effort vs result).** Relative tick volume over the 15 minutes before the touch ÷ |15-minute move
into the line| in σ (approach book fields relVol15, mv15). Top third (lots of volume, little progress = absorbed)
vs bottom third (little volume, fast travel = vacuum), thirds from 2016–22. Textbook: absorbed → fade; vacuum → continue.

**H — intraday regime (HMM).** The repo's 2-state Gaussian HMM (hmm.js fitHMM) on the 144 M5 log returns
(12 hours) before the touch, completed bars only; quiet-state probability at the last bar. Groups: quiet (> 0.7)
vs active (< 0.3). Textbook: quiet → fade.

## Tests (fixed; all within-cell = line family × London hour × range used; day-bootstrap 95% CI)
- **T1 (each column):** continue-rate difference between its two groups. REAL = CI excludes 0 and same sign in
  both halves (2016–22 / 2023–26; for G and E, 2020–22 / 2023–26). E additionally real − placebo.
- **T2:** each group's follow and fade net R; PASS = > 0 in both halves and Benjamini–Hochberg 10% across every
  group × direction in this study (G on NQ and on FX counted separately).
- **T3:** add every new column to the all-features model of forge/DIVERGENCE_REACTION_PREREG.md (same GBM, same
  walk-forward 2023–2026) and report the change in Brier skill and the selective-trade result.
- Every builder runs a future-scramble self-check from the bar after the pass bar (G, E, C, F use no prices after
  their publication / release time; the check covers H and the touch).
