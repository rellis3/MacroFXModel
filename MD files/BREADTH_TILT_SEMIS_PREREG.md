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

---

## RESULTS

### Run 1 — 2026-10-05, drill bundle (2020-10 →): UNTESTABLE

1,507 usable sessions. The rolling 504-session threshold consumes the first two years and
de-clustering at 20 sessions leaves **13–14** independent episodes per arm against the
pre-registered floor of 20. Every cell UNTESTABLE at both horizons, narrowing and mirror
alike. No excess was reported, because quoting one on 13 episodes is the error the floor
exists to prevent. Banked as `underpowered`, with the `use` line saying the fix was more
history on the identical design, never a looser gate.

### Run 2 — 2026-10-16, `--long` (Yahoo adjusted closes, 2003-05-01 → 2026-10-16): NULL

Same harness, same constants (LOOKBACK 20, WINDOW 504, DECLUSTER 20, MIN_EVENTS 20,
2,000-rep block bootstrap, block 10), only the sample changed. 5,904 shared sessions.
**85 NARROW / 63 BROAD** de-clustered setups — four times the floor.

| arm | horizon | SMH−SPY after setup | unconditional | excess [95% CI] | n | |
|---|---|---|---|---|---|---|
| NARROW | 20 | +1.15% | +0.45% | **+0.70 [−0.50, +1.82]** | 85 vs 2,970 | null |
| BROAD (mirror) | 20 | +0.56% | +0.45% | +0.11 [−0.71, +1.03] | 63 vs 2,970 | null |
| NARROW | 60 | +1.60% | +1.81% | **−0.21 [−2.88, +2.35]** | 84 vs 1,230 | null |
| BROAD (mirror) | 60 | +3.54% | +1.81% | +1.73 [−0.95, +4.36] | 62 vs 1,230 | null |

**Gate:** narrow clears zero — **no**; mirror contaminated — not reached.
**Verdict (computed by the harness): NULL**, on hypothesis (b), exactly where the written
prior said it would fail.

Post-hoc, descriptive, not pre-registered: splitting the sample at 2015-01, the NARROW
excess is 0.00 / −1.03 (20 / 60 sessions) in the first half and +0.61 / −0.61 in the second.
Nothing in either half approaches the interval width. Narrowing setups are spread across
every year 2005–2026 (2–7 per year), so the null is not one regime's.

**What this says.** Semis outperformed the index for twenty-three years *unconditionally*;
a narrowing of breadth did not add to that, and at two months the broadening arm did
better. The 3.6% is what an in-sample tilt toward the sample's leader always shows.

**What it does not say.** Nothing about Crown's actual eight-name sleeve or weights, nothing
about anything other than SMH as the proxy, nothing net of costs.

Output: `analysis/output/breadth_tilt_semis.json` (`source: yahoo-25y`). The six-year
UNTESTABLE run it replaced is recorded above.
