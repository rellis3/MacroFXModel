# Pre-registration: fade the p75 line when options skew is against the touch

Committed 2026-10-03 before any number of this test was computed. Results will go in
`analysis/surfaces/SKEW_FADE_RESULTS.md` in a separate commit that cites this one.

## Why

There are two fade-side reads, both from outside the price path, and both held in both halves descriptively:

- **The descriptive skew read** (analysis/surfaces/BUTTERFLY_CHECK.md, settlement-built 25-delta risk reversal, 6 FX,
  2020–26). When the risk reversal is **against** the side being touched, p75 touches faded 40–42% of the time, against
  36% when it was with the touch. That held in both halves.
- **The EXHAUST tag** (forge/TAG_X_PERSISTENCE_PREREG.md results). The EXHAUST × extending fade was positive in both
  halves but not significant. The tag on its own moves continuation odds in both halves.

This test uses an **independent options source**, CME CVOL skew from 2016, so the skew read is not re-tested on the data
that suggested it. It asks whether skew-against fades pay net of costs, alone and on EXHAUST days.

## Data and definitions

- **Instruments, bars, London day, halves (A = 2016–2022, B = 2023–2026-08), σ, lines, touch, fade trade, costs:**
  exactly as in forge/TAG_X_PERSISTENCE_PREREG.md. The fade trade enters at the p75 line (or at the gapped open), targets
  p50, stops at p90, and exits at the day's last close if neither is hit. It is charged the round-trip cost.
- **Skew against the touch:**
  - skew_with_t = side × orientation × CVOL skew / CVOL, from the last CVOL date before day t.
  - side = +1 for an OH touch and −1 for an OL touch.
  - orientation is the file's `quote_orientation`: −1 for JPY/USD, CAD/USD and CHF/USD, so the sign is expressed in
    spot-pair terms.
  - Per-instrument tercile cut-offs are fitted on half A. **AGAINST** = bottom third: downside variance priced over
    upside on an OH touch, or the reverse on an OL touch.
- **Tag:** as in TAG-X-PERSISTENCE (CVOL ÷ σ terciles fitted on half A).

## Hypotheses and pass rules

- **H3 (primary):** fade trades on touches with skew AGAINST have mean net fade-R > 0.
- **H4 (primary):** fade trades on touches with skew AGAINST **and** tag EXHAUST have mean net fade-R > 0.

Each passes only if **all** of the following hold. The pass rules are the same five checks as TAG-X-PERSISTENCE, with
Bonferroni across H3 and H4:

1. Mean net fade-R > 0 in both halves.
2. The day-clustered bootstrap 97.5% CI of the pooled mean excludes 0 (2,000 day resamples).
3. At least 5 of 7 instruments are positive (pooled).
4. The pooled mean beats the 95th percentile of a shuffled benchmark: skew terciles permuted within instrument × year,
   500 times.
5. The pooled mean is still positive at 2× costs.

**Reported, not pass criteria:**
- continue / fade / stall rates by skew tercile and half (the replication of the descriptive read on CVOL);
- the follow-trade R by skew tercile;
- per-instrument means;
- the tag × skew table.

## What each outcome means

- **H3 or H4 passes:** the first fade rule on this desk with an out-of-price mechanism. It would be added to the
  paper record as a logged fade column and forward-tested before anything trades it.
- **Both fail, but the replication holds** (fade rate higher with skew against, in both halves, on CVOL): the skew read
  goes on today.html as context next to the line tag ("skew against this touch: fades work more often"), labelled
  untradeable.
- **The replication fails on CVOL:** the descriptive read was source-specific and is dropped.

## Multiple-testing ledger

This adds 2 primary tests (H3, H4) to the running ledger.
