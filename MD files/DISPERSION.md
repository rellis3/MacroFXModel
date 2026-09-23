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

## Findings — run 2026-09-23

DSPX 2014-06-19 → 2026-09-22, 3,083 sessions. **68 setups** (crowded and rising,
no re-fire inside 20 sessions), of which **26** with the VIX below its own
median. Correlation between DSPX and the VIX: **0.48** — related, not the same
thing, which is why the VIX cut matters.

**D1a — the pre-registered claim, a wider WEEK: NULL.** Next-5-session range
against control: SPX500 **+0.07 [−0.06, +0.23]**, NQ **+0.07 [−0.03, +0.17]**.
Both intervals hold zero. Crown's "mini flash crashes" framing does not show up
at the horizon he implies.

**D1c — the tail, also null.** A day of twice the trailing median range within
five sessions: 33% [23–46] after a setup against 30% [28–32] control on SPX500,
33% [23–46] against 27% [25–28] on NQ. The setup intervals are wide and overlap
the control on both.

**The secondary window, and it is the interesting part.** Over the next **20**
sessions the range ratio is **+0.23 [+0.04, +0.51]** on SPX500 and **+0.21
[+0.08, +0.38]** on NQ — both clear of zero. This was pre-registered as "also
reported", not as the headline, so it is a secondary outcome and is recorded as
such: a month, not a week.

**Is it just the VIX?** No, and this is what makes it worth keeping. Restricting
to setups where the VIX was **below** its own median — the "VIX trades 14" case
— the 20-day effect is **unchanged in size**: +0.233 [+0.068, +0.338] SPX500,
+0.221 [+0.071, +0.297] NQ, on n=24. Dispersion is saying something the VIX was
not. (The 5-day remains null in that cut too: −0.02 and +0.01.)

**Is it one episode?** Partly, and this is the honest caveat. Split at
2018-09-09: the late half carries it (+0.29 [+0.02, +0.59] SPX500, +0.29
[+0.11, +0.48] NQ, n=46) while the early half does not (+0.08 [−0.10, +0.24],
+0.14 [−0.04, +0.24], n=14). The early half has only 14 setups, so this is as
consistent with "not enough data then" as with "the effect is recent" — it does
not separate them.

**Verdict.** The claim as stated is **null**: a crowded market does not precede
a wider week, and does not raise the odds of a violent day within the week. What
survives is a *secondary, one-sided-sample, small-n* result — a wider month,
independent of the VIX. That is not enough to act on and it is recorded as
**context**, not validated. It earns a re-run, not a trigger.

**Today, for the record:** DSPX 36.38, the 95th percentile of its own history and
the 83rd of the last three years, up 1.7 over twenty sessions — the setup is
live as this was written.

## What went on the page

- The **Dispersion tile** on market-view.html (Credit & fear) and a scan finding
  that describes the structure — the index calm over a market disagreeing with
  itself — and says plainly that the week claim was tested here and came back
  null, with the month result stated as unconfirmed.
- Ledger: `dispersion-crowded-week` as null.
- No Desk Watch trigger.
