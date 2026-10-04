# Pre-registration: the exhaustion schedule ("is the day already done?") at the export levels

Committed 2026-10-04 before any number of this test was computed. Results will go in
`analysis/surfaces/EXHAUSTION_SCHEDULE_RESULTS.md` in a separate commit that cites this one. Plan:
`plans/ANALYSIS_2_ROADMAP.md` section 4.

## Why

At the export levels a touch is a fair bet. What has held out of sample before is "is the high/low already in". This
builds that into a level that is **planned the night before**: for each hour of the London day, the distance from the
open at which a running extreme is at least 80% likely to be the day's final extreme. The schedule is then tested two
ways:

- as a **stand-aside** rule for continuation;
- as a **fade**.

## Data and levels

- **Levels:** exactly as forge/DIRECTIONAL_RESCORE_PREREG.md: the page's daily export calculation (`v4Days` via
  `scripts/rangebook/common.mjs`), per-day event tag, calendar to 2026-07-02.
- **Instruments:** every forecast instrument with local M1:
  - the 27 FX pairs in `VolRangeForecaster/data/m1` (NZDCHF has no file);
  - GOLD, NQ, SPX500, DOW (`us30`), US2000, DE30, UK100.
- **Halves:** **A = 2016–2022 (fit)**, **B = 2023 → 2026-07-02 (read)**.

## The schedule (fitted on A only)

- **Distance:** D_h = the running high's (or low's) distance from the London-midnight open at the end of London hour h,
  in units of σ_used (the export's σ including the event multiplier).
- **Final:** the running extreme at the end of hour h is never exceeded later that London day.
- **State:**
  - **tag** (IV ÷ σ terciles, cut-offs fitted on A) for EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF (CVOL) and GOLD
    (CVOL);
  - **front** (VIX9D ÷ VIX: calm / normal / dear, fixed cut-offs 0.8858 / 0.9669) for NQ, SPX500, DOW and US2000;
  - **no state** for everything else.
- **d*(instrument, state, hour, side):** the smallest d on a 0.05σ grid such that, in half A, P(final | D_h ≥ d) ≥ 0.80
  with at least 30 qualifying days. Where no d qualifies, that hour has no level.
- **Clock:** hours are London clock hours. Vol time is a fixed monotone transform of clock time for each instrument, so
  hour bins are equivalent and transparent.

## Primary tests (half B unless stated; net of `js/perLineStrategy.js` costs)

- **H11 (calibration):**
  - Read on B, the realised P(final | D_h ≥ d*) is ≥ 0.75, pooled across instruments.
  - In at least 70% of instruments it is ≥ 0.70.
  - In plain terms: the 80% schedule still means roughly 80% on unseen data.
- **H12 (stand-aside for continuation):**
  - Take first touches of OH/OL p50 and p75 (the DIRECTIONAL-RESCORE touch tables).
  - A touch is **beyond** the schedule when the touched line's distance from the open is ≥ d* for its hour, side and
    state.
  - Follow trades (the book's race, net R) on touches beyond the schedule must have a **lower** mean than touches before
    it, in both halves.
  - The difference must have a 99% date-clustered CI below 0.
  - **Meaning:** "stop opening continuation trades past the exhaustion line" is a real improvement.
- **H13 (fade at the schedule):**
  - **Trigger:** on each day and side, the first M1 bar whose running extreme reaches the schedule level for the
    current hour. Entry is at the schedule level.
  - **G1:** stop 0.25σ beyond the entry, exit at the London day's last close.
  - **G2:** stop 0.25σ beyond the entry, target 0.25σ back (1R), exit at day end if neither is hit.
  - **Resolution** starts on the bar after the trigger. If stop and target are hit on the same bar, the stop counts.
  - **Pass checks** (each geometry):
    1. Mean net R > 0 in both halves.
    2. The 99% date-clustered CI of the pooled mean excludes 0.
    3. At least 70% of instruments are positive.
    4. It beats a shuffled benchmark: the same trades triggered at the schedule level of a random other hour (500
       draws).
    5. It is positive at 2× costs.
    6. Fades of highs (shorts) and fades of lows (longs) are both positive.
  - **Note:** the schedule is fitted on A, so H13's half-A result is in-sample for level placement. Half B is the
    out-of-sample read, and **both halves must be positive.**

**Reported, not pass criteria:**
- The schedule itself per instrument and state.
- The 75% and 90% versions.
- Realised P(final) by hour.
- Follow R before vs beyond the schedule per instrument.
- Fade R by hour.
- The share of days that reach the schedule.

## What each outcome means for the system

- **H11 + H12 pass:** the schedule goes into the Export forecast text, today.html (a live flag) and the Pine indicator,
  as the planned "take profit / stop chasing" level.
- **H13 passes too:** the planned fade becomes a paper-record rule (forward test first, then a bot).
- **H11 fails:** the "high is in" probabilities don't transfer to unseen data at these levels, and nothing ships.

## Multiple-testing ledger

This adds 4 primary tests: H11, H12, H13-G1 and H13-G2.

## Amendment 2026-10-04, before any H11-H13 result was computed (implementation details)

1. **H13 trigger when the level steps past price.** The schedule steps closer through the day, so at the start of an
   hour the running extreme can already be beyond the new hour's level while price has pulled back. In that case the
   trigger is that hour's first M1 bar, entry is at its **open** (the level is no longer available), and the stop is
   0.25σ beyond the entry. Otherwise the entry is at the level on the first bar whose running extreme reaches it.
2. **The H13 shuffled benchmark** is each day's schedule **circularly shifted by a random 1–23 hours** (500 draws). This
   uses real schedule values at the wrong time of day, which isolates whether the *timing* in the schedule matters.
3. **Stage 1** (`scripts/rangebook/exhaustion_build.mjs`) records D_h and "final" per day × side × hour. One sanity
   check was looked at before writing this amendment: EURUSD's unconditional P(final) by hour (7% at 00:00 rising to
   96% by 21:00). It contains no schedule, test or trade result.
