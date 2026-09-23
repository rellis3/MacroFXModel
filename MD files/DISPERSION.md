# D1 — does a crowded market (high dispersion) precede a wider week?

*Pre-registered 2026-09-23, before any outcome was computed. Prompted by a Crown
Macro clip: "VIX trades 14, VIX-EQ minus VIX is starting to rally … what happens
in this environment is you get mini flash crashes where the market pukes out of
the AI trade and buys it back. This is single-sector chasing, and it is a very
fragile market." The mechanism is real and worth stating precisely; the forward
claim is what this tests.*

## The idea, in plain terms

The VIX prices the index. Single-name options price the shares inside it. When
money crowds into a few names, those names become expensive to hedge while the
index stays cheap — because its constituents are pulling against each other and
partly cancelling out. CBOE publishes that gap directly as the **Dispersion
Index (DSPX)**.

A high DSPX is therefore a description of market *structure*: the index looks
calm over a market that is violently disagreeing with itself. The claim under
test is that this structure is **fragile** — that it is followed by a wider
week, because the concentration unwinds in bursts an index hedge does not cover.

## Data

| series | source | note |
|---|---|---|
| DSPX | CBOE `DSPX_History.csv` | free, daily, no key, 2014-06-19 → present (3,083 rows) |
| VIX, VIX3M | FRED `VIXCLS`, `VXVCLS` | the existing inversion measure, as a control |
| SPX500, NAS100 | OANDA D1, London-anchored | the instruments this desk actually carries |

Window: 2014-06-19 → present. Today's reading, for the record and before any
outcome is computed: **DSPX 36.38 on 2026-09-22, the 95th percentile of its
whole history and the 83rd of the last three years, median 31.6, up 1.7 over
twenty sessions.**

## Definitions, frozen

- **Crowded**: DSPX at or above its own 80th percentile of the trailing 3 years
  (a rolling percentile, so there is no look-ahead).
- **Rising**: the 20-session change in DSPX is positive.
- **The setup**: the first session on which crowded AND rising are both true, with
  no re-fire inside 20 sessions.
- **Wider**: mean daily range over the next 5 sessions, as a multiple of the
  trailing 20-session median daily range for that instrument.
- **Control**: all sessions at least 20 sessions away from any setup.

## Claims

**D1a — range.** After the setup, is the next week wider than control, on SPX500
and NAS100? Reported as the difference in the range ratio with a block bootstrap
95% interval (blocks of 10, 1000 reps). **Real only if the interval excludes
zero.** Also reported: the same for the 20 sessions after, and the same measured
on the VIX itself.

**D1b — is it just the VIX?** The same test with the setup restricted to days
when the VIX is BELOW its own median. This is the version Crown describes ("VIX
trades 14") and the one that would matter — a fragility gauge that only fires
when volatility is already high would be telling us nothing new. Reported
alongside the correlation between DSPX and VIX so the reader can judge overlap.

**D1c — the tail, not the mean.** Does the setup raise the odds of a large
single-day move (≥ 2× the trailing median range) in the next 5 sessions? Share
with a Wilson interval against the control share. This is the "mini flash
crashes" part of the claim, stated as a frequency rather than a story.

## What each verdict does to the page

- The **tile** and the descriptive finding on market-view.html ship regardless —
  they describe structure and say plainly that no forward effect has been tested.
- D1a or D1c **real** → a ledger entry with the number, and a Desk Watch trigger
  on the setup, worded as range only.
- **Null** → the ledger records the null and the finding keeps its current
  wording ("this desk has not tested it; it describes how the market is put
  together, not what happens next"), which becomes "tested here, null".
- Direction is not tested and will not be. Nothing in the claim is directional,
  and every direction test on this desk has died.

Harness: `analysis/dispersion_study.mjs`. Output: `analysis/output/dispersion.json`.

## Findings

*(to be filled after the run)*
