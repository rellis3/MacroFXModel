# Pre-registration: directional re-score at the export levels: drift and the line tag

Committed 2026-10-04 before any number of this test was computed. Results will go in
`analysis/surfaces/DIRECTIONAL_RESCORE_RESULTS.md` in a separate commit that cites this one.

## Why

The adversarial review of the Fade/Continue Book (2026-10-04) found three things:

1. Its "continue %" counted stalls, so its features measured **activity** (move vs stall), not **direction**.
2. Its fade target was the line behind (the open, for p50), so partial reversions were filed as stalls.
3. Its standard errors treated overlapping, same-date touches as independent.

It also found two inputs that were never tested at the touch:
- **the export's own Drift reading** (d = mean of the last 14 daily log returns ÷ the forecast σ, `js/volForecast.js _driftD`);
- the line tag **measured on the exact export levels**. TAG-X-PERSISTENCE used an approximation of the levels.

This test fixes the measurement and tests both inputs on the page's real daily calculation.

## Levels, touches, data (the page's daily calculation)

- **Levels:** `js/voteAtlasV4Lines.js v4Days`, through the branch's `scripts/rangebook/common.mjs`. This uses the same
  `forecastSigma` and `buildLadder` code as vol-forecast-v3's Export forecast: NY-17:00 daily bars closed before the
  London-midnight open, and the per-day event tag (`scripts/v4/calendarProxy.mjs`, calendar to 2026-07-02).
- **Lines:** OH/OL p50, p75 and p90, and CloseUp/CloseDn p50 and p75: the static export lines, first touch per line per
  day (`firstTouches`).
- **Instruments:** EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, GOLD, NQ, SPX.
  - Local M1, 2016 → 2026-07-02 (calendar coverage).
  - NQ uses OANDA NAS100 bars. The live page uses Yahoo NQ=F for NQ's σ, a known small difference.
- **Halves:** **A = 2016–2022**, **B = 2023 → 2026-07-02** (the book's split).

## Outcomes, all measured from the line level in units of σ_used × open

- **Race:** the book's `targets` (continue = next line out, fade = line behind).
  - It starts on the bar after the touch and runs to the London day end.
  - **Same-bar touches are now included:**
    - continue target hit on the touch bar (only possible after crossing the line) → continue;
    - fade target only, or both → excluded as ambiguous.
- **Directional share:** cont ÷ (cont + fade), against break-even BE = d_f ÷ (d_c + d_f).
- **Signed return:** close at 15, 60 and 240 minutes after the touch bar minus the line, signed + in the continue
  direction, in σ units. If the day ends first, the last close is used.
- **Follow R:**
  - Unit d_f. continue = +d_c/d_f, fade = −1.
  - A stall is marked to the day's last close, clipped to [−1, +d_c/d_f]. 'both' = −1.
  - Gross, and net of `js/perLineStrategy.js` costForPair (round trip) + slippage (fx 0.006%, gold 0.012%, index 0.008%).
- **Fade R:**
  - Unit d_c, the mirror of follow R: fade = +d_f/d_c, continue = −1, stall marked to close and clipped. 'both' = −1.
  - Net of costForPair.

## Conditions, all known before the London day

- **Drift d:** the production formula on the NY-close bars that closed before the open. Mean of the last 14 log returns
  ÷ the same day's forecastSigma (estimator per `js/forecastLadderParams.js`), clamped to ±2.
  - **ALIGNED** = the touch is on the drift side (OH touch with d > 0, OL touch with d < 0).
  - **STRONG** = |d| ≥ 0.25, the floor of the export's "Strong" band.
- **Tag:** implied vol from the last date before the day ÷ √252 ÷ the ladder's σ before the event multiplier.
  - Implied vol source: CME CVOL for the 6 FX majors and gold (NZDUSD has none and is excluded), VXN for NQ, VIX for SPX.
  - Tercile cut-offs per instrument, fitted on half A. EXHAUST = bottom third, FAIR = middle, CONTINUE = top.

## Hypotheses (primary; all on OH/OL p50 and p75 touches pooled, net of costs)

| | Trade | Condition |
|---|---|---|
| **H8** | follow | drift ALIGNED and STRONG |
| **H9** | fade | drift AGAINST (touch opposite the drift) and STRONG |
| **H10a** | follow | tag CONTINUE |
| **H10b** | fade | tag EXHAUST |

Each passes only if **all** of the following hold:

1. The mean net R is > 0 in both halves.
2. The 99% CI of the pooled mean excludes 0. It is a bootstrap clustered **by calendar date** across all instruments
   (2,000 resamples), at a Bonferroni level across the 4 tests.
3. At least 70% of the instruments with data are positive.
4. The pooled mean beats the 95th percentile of a shuffled benchmark (500 permutations within instrument × year):
   - the drift sign for H8 and H9;
   - the tag labels for H10.
5. The pooled mean is still positive at 2× costs.
6. Both trade directions (longs and shorts) are positive.

## Reported for every line × condition (descriptive, not pass criteria)

- The directional share minus BE.
- Gross and net follow and fade R.
- Signed returns at 15, 60 and 240 minutes.
- Each of these with a date-clustered SE, per half, plus the share of stalls.

This is the re-score of the book on the corrected metric.

## What each outcome means for the auto system

- **A pass:** that condition becomes a rule in the paper record's line-regime switch: a candidate auto-trade rule,
  forward-tested before any bot trades it.
- **All fail, but the directional share or signed return moves away from break-even in both halves:** the read goes on
  today.html as directional context, with its size stated.
- **All fail and nothing moves:** drift and the tag carry no direction at the touch, and the system stays
  "continue vs stand aside" on width alone.

## Multiple-testing ledger

This adds 4 primary tests.
