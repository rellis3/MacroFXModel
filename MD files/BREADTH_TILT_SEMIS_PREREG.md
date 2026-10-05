# BREADTH-TILT-SEMIS — does RSP/SPY narrowing predict semis beating SPY?

**Pre-registered 2026-10-05, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

Crown Macro, video clip, undated (per `CROWN_WATCH.md` step 4b, the filming date is not
scored — only the claim is):

> *"Diversification is dead… This is the RSP spy ratio. RSP is equal weight and spy is the
> cap weight S&P. And this ratio just broke its multi-year trend line a few sessions ago.
> This is the market telling you that breadth is collapsing… The real leadership is
> compressed into the physical bottlenecks of the AI buildout. This is memory, lithography
> and foundry… a tilt towards the AI bottlenecks generated 3.6% in expected alpha over SPY,
> an equal-weight S&P that's RSP generated negative alpha over the same time period."*

Stated as something testable: **when RSP/SPY is narrowing, semis subsequently outperform
SPY by more than they ordinarily do.**

## Why it is not already settled

`breadth-narrowing` (TESTED NULL, n=35 de-clustered events, 23 years) tested whether RSP/SPY
narrowing predicts the **index's own** forward direction and range. It does not: direction
−0.5% at 20d [−2.70, +1.57], and the range near-miss died on its mirror, extreme broadening
raising forward range just as much (+0.28 vs +0.37).

**That does not answer this.** It asked what the *index* does next. This asks what the
*leadership* does next — a cross-sectional question about one sleeve against the benchmark,
which a test of the index's own forward return cannot see. `rotation-extreme` (NULL, n=140)
is closer but measured forward *range*, not relative return, and did not involve semis.

`dispersion-crowded-week` (NULL, 68 setups) came from an earlier Crown clip on the same
theme — crowding into the AI trade — but tested index range, again not relative return.

So the breadth premise is well-tested as a **timing** signal and null three ways. The
sleeve-selection claim is genuinely new here and has never been measured.

## Definitions, fixed in advance

- **Instruments**: `SMH` (semiconductors — the closest listed proxy to "memory, lithography
  and foundry"; it holds TSMC, ASML, Micron, Applied Materials, Lam), `RSP`, `SPY`. All three
  are already in the drill bundle, Yahoo daily closes, **1,581 dates from 2020-10-05**.
- **The setup (NARROW)**: the RSP/SPY ratio's 20-session change in its bottom decile, measured
  on a rolling 504-session (≈2y) window so the threshold is knowable at the time and does not
  use future data. "Broke its multi-year trendline" is not reproducible as stated; a rolling
  percentile of the same ratio is the nearest honest formalisation, and it is stated here
  rather than chosen after looking.
- **Knowable when?**: the 20-session change is complete at the close of day D, so every
  measurement starts at the **open of D+1**. No same-bar entry.
- **The outcome**: `SMH` total return minus `SPY` total return over the next 20 and 60
  sessions, from D+1. Relative return, not range, not direction of the index.
- **The control**: every other session in the same period, same instruments — the
  **unconditional** SMH−SPY spread. This is the test that matters (see gate (c)).
- **De-clustering**: 20 sessions. A narrowing regime persists for months; without this one
  episode contributes dozens of overlapping "events", which is what collapsed 12,581 curve
  observations to ten episodes in `curve-inversion`.
- **MIN_EVENTS**: **20** de-clustered events per cell. Below it the cell is UNTESTABLE,
  which is NOT a null.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | After a NARROW setup, is SMH−SPY over the next 20 sessions positive? | **Yes, clearly positive.** Semis led this entire sample. |
| b | Is it positive **in excess of the unconditional SMH−SPY spread** over the same period? | **No.** I expect the excess to be near zero with an interval spanning it. |
| c | **THE GATE.** For this to count as real, (b) must clear zero with a 95% day-clustered bootstrap interval **AND** survive the MIRROR: the same test on BROAD setups (top decile of the 20-session change) must NOT produce a similar-sized excess. If broadening predicts semis outperformance just as well, the effect belongs to the period, not to breadth. | **Expect it to fail the gate**, most likely on (b) before the mirror is even reached. |

**The stated prior is that this is a passenger.** Semis outperformed massively over 2020-2026
regardless of breadth; a tilt measured in-sample will show large alpha whether or not the
breadth signal contributed anything. This is the same shape as `growth-vs-yields`, where the
Nasdaq range effect was real but yields turned out to be riding along rather than driving,
and the one-leg control is what separated them.

If (b) comes back clearly positive, that is a result **against** a written prior and worth
far more than a confirmation.

## What this does NOT test

- **Crown's actual portfolio.** He names eight bottlenecks and specific percentage tilts,
  behind a paid letter. SMH is a proxy for the sleeve, not a replication of his weights.
- **His 3.6% figure.** No period, method, or out-of-sample split was given, so it cannot be
  reproduced or contradicted — only measured independently.
- **Anything before 2020-10.** The desk's SMH history starts there. That is ONE cycle,
  containing the 2022 drawdown and the 2023-26 AI run. A single cycle cannot establish that
  this generalises, and the write-up must not imply it does.
- **Whether semis are the right proxy.** Memory, lithography and foundry are a subset of
  SMH; the ETF also holds designers and equipment names that are not bottlenecks.
- **Costs, capacity or taxes.** This is a gross relative-return measurement.
