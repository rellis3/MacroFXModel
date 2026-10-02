# FUNDING-STRESS — Genuine funding stress (the headline SOFR above the Fed's floor away from month-end, or the standing repo facility actually being drawn) precedes wider ranges and weaker risk assets

**Pre-registered 2026-10-02, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

The plumbing version of a risk-off warning: *"When overnight secured funding trades above
the rate the Fed pays on reserves, cash is scarce. Scarce cash shows up in markets before it
shows up in prices — wider ranges, and risk assets under pressure. September 2019, March
2020 and March 2023 all announced themselves in repo first."*

## Why it is not already settled

`repo-stress-range` (CONTEXT, 2026-09-20, `MD files/PLUMBING.md#P1`) tested the **99th
percentile** of SOFR against the floor at a 10bp threshold. It found 26 episodes, every
interval straddling zero, and — decisively — that *"the setup fires on a quarter of all
sessions since 2024: it is month-end plumbing, not stress."*

That does not settle this, for three reasons:

1. **A different statistic.** The 99th percentile is the tail of the day's trade
   distribution — a handful of dealers paying up, which is routine at month-end when
   balance sheets are dressed. The **headline SOFR** is the volume-weighted median: the
   whole market paying above the floor. One is a few borrowers in trouble; the other is
   the system short of cash. `plumbing_study.mjs` actually computes the median spread
   (`medBp`) and then never uses it.
2. **The confound is now known and can be removed.** P1's own finding — that the signal is
   month-end — is the reason to re-test with month-end excluded rather than to stop.
3. **Its own `use` line leaves the discriminator untested**: *"unless the backstops (SRF,
   discount window) are in use."* Whether the Standing Repo Facility being **drawn** marks
   real stress has never been measured, and that is the cleanest definition available —
   it is a revealed preference, not a threshold someone chose.

P1 was also a RANGE study only; it says plainly that the funding links are "described, not
tested" on direction.

## Definitions, fixed in advance

- **The setups**, two of them, scored separately:
  - **S1 — the market pays up**: headline SOFR minus the Fed floor ≥ **3bp**, on a day that
    is NOT within the month-end window (defined as the last 3 or first 2 business days of a
    calendar month, which is where P1's signal lived). Floor = IORB, spliced to IOER before
    2021-07-29.
  - **S2 — the backstop is drawn**: Standing Repo Facility usage (`RPONTSYD`) **> 0**. No
    threshold to choose; either the facility was used or it was not.
- **Knowable when?**: SOFR for date D is published by the New York Fed at ~08:00 ET on
  **D+1**. A setup dated D is therefore not actionable until D+1, and **every outcome window
  starts at D+1**. This is the look-ahead that would otherwise flatter the result.
- **De-clustering**: first session of an episode only, with a **10-session gap**, matching
  P1 so the two are directly comparable.
- **The outcome**:
  - **O1 range**: next-5-session high-low ÷ ATR14 at the setup, on SPX500, EUR/USD and
    USD/JPY — the identical measure and instruments as P1, so the numbers can be set beside
    each other.
  - **O2 direction**: next-5-session close-to-close return on the same three. P1 never
    asked this.
- **The control**: a non-setup day matched on **ATR percentile quintile** (so a stressed day
  is not compared with a calm one) and at least 10 sessions from any setup — P1's control,
  reused deliberately.
- **MIN_EVENTS**: **20 per cell.** Below it the cell is **UNTESTABLE, which is NOT a null.**
  Excluding month-end will cut S1 hard, and S2 may simply be rare; saying so is the honest
  outcome, not a failure.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | S1 (median SOFR ≥ 3bp over floor, ex month-end) → wider next week? | **Null.** I expect removing month-end to leave a small, uninteresting set, and for the widening to go with it. If P1's effect was month-end, taking month-end out should take the effect out. If instead S1 comes back REAL on a smaller n, that is the interesting outcome and means the median spread carries what the tail did not. |
| b | S2 (SRF drawn) → wider next week? | **Real, and the strongest cell here.** The facility being used is revealed scarcity rather than a chosen threshold. I expect a positive range difference on SPX500 in particular. I also expect **n to be small** and quite possibly under the floor, in which case the answer is UNTESTABLE and I should say so rather than quote a number. |
| c | O2 direction, either setup | **Null on all three instruments.** Nineteen validated findings on this desk and four of them are directional; the prior is overwhelming. |
| d | **THE GATE.** What must hold for this to count as real. | **All three.** (1) The month-end **mirror**: the same test run ON month-end days must NOT give a bigger effect than the ex-month-end setup — if it does, this is still P1's calendar artefact. (2) **Both halves**: splitting the sample at its midpoint, the direction of the effect must agree in both. (3) The **ATR-matched control** must be cleared with a 95% interval excluding zero AND a difference of at least **+0.10 ATR**, P1's own bar. |

**My overall prior:** S1 null, S2 real-but-probably-underpowered, direction null throughout.
The most likely single outcome is that the honest verdict for the whole study is
**UNTESTABLE on the cell that matters**, which is worth banking precisely because "we cannot
tell" is the thing a dashboard will otherwise quietly answer anyway.

## What this does NOT test

- **Causation.** A funding squeeze and a market selling off can both be the same risk event.
- **Intraday timing.** Everything here is daily; repo stress is an intraday phenomenon and
  the five-session window is deliberately coarse.
- **The discount window.** `WLCFLPCL` is weekly and stigma-laden, so usage says as much about
  reputational cost as about scarcity. Reported descriptively if at all, never as a setup.
- **2008.** SOFR begins 2018-04, so the sample contains the 2019 repo spike, March 2020 and
  March 2023 — but no global financial crisis. Any claim about "real" stress is bounded by
  that.
- **Whether the Fed reacts.** The SRF existing at all changes what stress looks like; a
  facility that caps the rate means the price signal this study uses is itself suppressed.
