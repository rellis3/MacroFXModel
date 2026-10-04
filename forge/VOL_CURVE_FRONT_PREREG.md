# Pre-registration: the S&P vol-curve front against the production NQ/SPX lines, as a trade

Committed 2026-10-04 before any number of this test was computed. Results will go in
`analysis/surfaces/VOL_CURVE_FRONT_RESULTS.md` in a separate commit that cites this one.

## Why

The descriptive check (analysis/surfaces/VOL_TERM_CHECK.md, not pre-registered) used a plain Yang-Zhang σ with no event
multiplier. On it, NQ+SPX days past their p75 range line in 2021–26 rose from 20.7% to 35.2% across the thirds of
front = VIX9D ÷ VIX. Within the middle vol-level third, they rose from 15% to 48%.

A dear front often means a scheduled release is close, and the production lines already widen σ on event days. So the
effect may already be in the production lines. This test asks two things:

1. Does the front still separate days **against the production lines** (event multiplier included)?
2. Does it pay as a **trade**: follow the break on dear-front days, fade the touch on calm-front days? These are the two
   halves of an automatic continue-vs-mean-revert system.

## Data

- **Instruments:** NQ (`nq_m1`) and SPX (`spx500_m1`), local OANDA M1, 2016-01 → 2026-08-20.
- **Vol curve:** CBOE closes in `analysis/surfaces/cboe/` (VIX9D, VIX, VXN). A day uses the last CBOE close dated before it.
- **Calendar:** `calendar_events.csv` (covers to 2026-07-02). Days after the calendar's coverage are **excluded**,
  because their event tag is unknown.
- **Halves:** **A = 2016–2020**, **B = 2021 → 2026-07-02**.
  - **Disclosure:** B's *range* outcome against a non-production σ was already seen in the descriptive check.
  - The production-line version and every trade outcome are new.

## Production-equivalent lines (`js/forecastLadderParams.js`, `forge/vol.py`)

- **σ_yz,t:** Yang-Zhang 10-day volatility on **NY-close daily bars** (17:00 New York), using only bars completed before the
  London day t opens.
- **Event tag:**
  - Rule: `forge/vol.py load_event_tags`, the highest-ranked **Major** USD event on day t.
  - Ranking: FOMC (fed press conference / fomc / interest rate decision) > NFP (payroll jobs growth) > CPI (inflation rate)
    > high (any other Major).
  - Otherwise the tag is none. The holiday tag is not reproduced; those days take none.
- **σ_used = σ_yz × event multiplier:**
  - NQ: FOMC 1.197, NFP 1.017, CPI 1.024, high 1.033, none 0.979.
  - SPX: FOMC 1.192, NFP 1.103, CPI 1.025, high 1.041, none 0.943.
- **Lines** = London-midnight open × (1 ± w × σ_used), with production widths:
  - NQ: hl [1.4067, 1.8869, 2.4836], oh [0.6262, 1.0844, 1.5552], ol [0.5632, 1.087, 1.7954].
  - SPX: hl [1.3858, 1.8815, 2.4806], oh [0.6144, 1.0573, 1.5595], ol [0.559, 1.0725, 1.7748].

## Reads, fixed in advance

- **front** = VIX9D ÷ VIX. Its cut-offs are **already fixed** from the descriptive fit on 2016–2020:
  - CALM < 0.8858
  - DEAR ≥ 0.9669
  - NORMAL in between
- **level** = (VXN for NQ, VIX for SPX) ÷ 100 ÷ √252 ÷ σ_yz. Its tercile cut-offs are fitted per instrument on half A.

## Outcomes and trades (first p75 touch per side per day, as in forge/TAG_X_PERSISTENCE_PREREG.md)

- **Range:** whether the day's high − low passes the production hl p75 width.
- **Follow G1** (line race): entry at the p75 line (or a gapped open), target p90, stop p50, exit at the day's last bar.
- **Follow G2** (break shape, like the rule that passed): entry as above, stop 0.2 σ_used behind the line, target 5R,
  exit at the day's last bar.
- **Fade G1:** entry as above, target p50, stop p90, exit at the day's last bar.
- **Fade G2:** entry as above, stop 0.2 σ_used beyond the line, target the p50 line (variable R), exit at the day's last
  bar.
- **Resolution** starts on the bar after the touch. If both levels are hit on one bar, the stop counts.
- **Costs** (`js/perLineStrategy.js`): 0.008% round trip for both instruments. Follow entries also pay index slippage of
  0.008%.

## Hypotheses and pass rules

- **H5 (range):**
  - The share of days past the production hl p75 is higher on DEAR than on CALM days in both halves, **and**
  - in a logistic regression of exceedance on level-tercile and front-state dummies, the DEAR coefficient is > 0 with
    z ≥ 2 **in both halves**.
- **H6 (follow on DEAR days)**, for G1 and G2 separately:
  1. Mean net R > 0 in both halves.
  2. The 99% day-clustered bootstrap CI of the pooled mean excludes 0.
  3. Both instruments are positive.
  4. The pooled mean beats the 95th percentile of front labels permuted within instrument × year, 500 times.
  5. It is positive at 2× costs.
  6. **Shorts alone are positive** (the house index rule).
- **H7 (fade on CALM days)**, for G1 and G2 separately: the same six checks. For check 6, the fades of upside touches
  (shorts) and of downside touches (longs) must **both** be positive.

The CI level is 99%, Bonferroni across the five primary results: H5, H6-G1, H6-G2, H7-G1, H7-G2.

**Reported, not pass criteria:**
- every front × level cell;
- the 1-year-by-year means;
- the event-tag split (DEAR days with vs without a Major event), which answers the event-calendar caveat directly.

## What each outcome means for a system

- **H6 or H7 passes:** that trade becomes a **candidate auto-trade rule** for indices. In order:
  1. Add it to the Rich-Vol Break Record as its own logged rule.
  2. Run it as a paper forward test.
  3. Only after the forward record confirms it, wire it to a bot through the usual bot-config path.

  The front ratio also becomes an index input to the Daily Read tag.
- **Only H5 passes:** the front is a real "lines too tight / too wide" read against production lines, shown on today.html
  and the Daily Read as context, but not traded.
- **H5 fails:** the descriptive effect was the event calendar that the production lines already price. The today.html
  wording is downgraded accordingly.

## Multiple-testing ledger

This adds 5 primary results to the running ledger.
