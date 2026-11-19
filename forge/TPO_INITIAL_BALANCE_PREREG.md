# tpo-initial-balance — On NQ and ES, does a break of the US-cash initial balance that holds for an hour lead to a trend day, and does a poke beyond it that fails lead to a fade?

**Pre-registered 2026-11-18, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `tpo-ib-follow` (Q1: accepted break → follow), `tpo-ib-fade` (Q2: failed poke → fade), `tpo-ib-strategy` (Q3: the 4 strategy cells) |
| Branch | `main` (worktree; the owner's standing rule is that pushing to main is fine) |
| Register row | `plans/RESEARCH_REGISTER.md` → `tpo-initial-balance` |
| Data | CME NQ and ES continuous front month, NT8 1-minute OHLCV, unadjusted (`analysis/output/nt8/continuous/{NQ,ES}_1m_unadj.parquet`, roll per `*_rolls.csv`). **The bars are end-stamped** (faults log 2026-11-07): every stamp is moved back one minute before sessions are cut. US cash session 09:30–15:59 New York. Window **2016-01-04 → 2026-08-21** (lockbox). Sessions with < 385 cash minutes dropped (counted). First 20 sessions are warm-up for σ |
| Seed | `20261118` (one for every script in this study) |
| Uncertainty | circular moving-block bootstrap over sessions, block 20, B = 2000 |
| Scripts / outputs | `scripts/tpo-initial-balance/` → `analysis/output/tpo-initial-balance/` |
| Harness | own Python script: the question needs per-session 30-minute TPO periods and a simple bracket engine, which the JS harnesses do not have |

## 1. The claim (required)

Source: J. Peter Steidlmayer's Market Profile, as taught by Dalton (*Mind Over Markets*, *Markets in Profile*). It is listed in this repo as "the most useful practitioner lens" for reversion against continuation (`MD files/REVERSION_CONTINUATION_CONCEPT.md` §B) and was never tested. The owner asked for it on 2026-11-18, next to a TPO view on `footprint.html`.

In the source's terms: the **initial balance (IB)** is the range of the first hour (TPO periods A and B). Other-timeframe traders show up as **range extension** beyond it. If price extends beyond the IB **and is accepted there** (it spends time beyond, not just a tick), the day tends to become a trend or normal-variation day, so **follow** it. If price **pokes beyond and is rejected** (it is back inside the IB within the same period), the auction failed, so **fade** it back toward the other side of the IB.

**Edge source (lesson #4).** The claimed mechanism is a structural order-flow effect, not a risk premium. Longer-horizon participants who act after the opening hour push price outside the range the day-timeframe set, and day traders who sold the IB high must cover. Short-horizon liquidity providers who fade the break are on the other side. Nothing here predicts which way a day breaks. The claim is only about what happens after.

## 2. Why it is not already settled (required)

Nearest Evidence Book entries:

- **`opening-range-break` (NULL, `MD files/TECHNICAL_RANGE_TESTS.md` T4).** This was the London first hour on eight CFDs (FX, gold, NAS100, SPX500). The first-hour range broke 99% of the time, price was back inside within 60 minutes 83–86% of the time, and the close finished beyond the broken side 50–52%. That test did not condition on **acceptance** (two consecutive 30-minute closes beyond), which is the whole of Steidlmayer's rule. It used London's first hour, not the US cash open where the IB is defined. It also had no fade arm and no placebo matched on time of day. This study tests the acceptance and rejection split on CME futures in the US session. The T4 base rates are restated in §7 as what a null here would mean.
- **`first-hour-fraction` (VALIDATED).** The first hour is about one fifth of an FX day. That is a base rate, not this question.
- **`day-type-expansion` (NULL, FX/gold).** Range expansion on σ lines, not IB acceptance.
- **`value-migration-nq` (CONTEXT/NULL).** Volume-profile POC drift between 15-minute boxes. That is a different construct (value, not range extension), and it had no IB.
- **`failed-auction-volume` (REGISTERED, not run).** This is the nearest. It covers a failed auction at a **balance edge after an impulse** across six markets, with the volume behind the probe. Q2 here is narrower and mechanical: the IB edge only, and a poke rejected in the same period. The two share no setup definition. If both run, read Q2 next to it and do not count them twice.

This is not a re-run of a banked null. The new variables are acceptance and rejection, US-session futures, and a time-of-day placebo.

## 3. Definitions, fixed in advance (required)

**3.1 Sessions and periods.** Minute index m = 0 (09:30) … 389 (15:59) after the one-minute stamp shift. TPO periods are 30 minutes from 09:30, lettered A (09:30–09:59), B, C, … M (15:30–15:59). A missing minute in a kept session is forward-filled from the previous close with zero volume (counted).

**3.2 Initial balance.** IBH = max high and IBL = min low of minutes 0–59 (A and B). IB width w = IBH − IBL.

**3.3 Scale.** σ1 = the mean over the previous 20 sessions of each session's RMS 1-minute close change (past only). An outcome over h minutes is scaled by σ1·√h.

**3.4 The event: the first of these per session, scanning the period closes of C … K (10:59 … 14:59)** (later ones leave too little session).
- **Accepted break (Q1).** Two consecutive period closes both strictly beyond the same IB edge: up if both close > IBH, down if both < IBL. Known at the close of the second period.
- **Failed poke (Q2).** A period whose high trades > IBH (or low < IBL) but which closes back at or inside that edge, while the period before did not close beyond that edge. Known at that period's close.
- Whichever comes first is the session's event. A session can be counted once only. The first poke-then-acceptance sequence counts as a failed poke at the poke. Sessions with neither are counted as "no event" (about 5–7% on the power pass).

**3.5 Statistical outcome (Q1, Q2).** Decision time t = the event period's close. Entry reference = the open of the next minute e. y = (close at 15:59 − open[e]) / (σ1·√h), with h = 389 − e + 1. Signed: Q1 is signed with the break (+1 for up), and Q2 against the poke (−1 for a poke above IBH, so a fade up to down is positive).

**3.6 Placebo, matched on time and side.** For each event: 3 sessions drawn at random (seed) from the 250 sessions before it. In each, the same entry minute e, the same sign, and the same h are used, and y is computed from that session's prices. The scored quantity is **d = y_event − mean(y_placebo)**. This removes the drift and time-of-day effects that a plain mean would mistake for a trend-day effect. NQ's upward drift is the reason for it.

**3.7 Strategy cells (Q3, net R).**
- **Follow (Q3a).** Enter at open[e] in the break direction. The stop is one tick back inside the IB edge (IBH − tick for a long). Exit at the stop or the 15:59 close. If the stop is hit and the close are in the same minute, the stop counts first.
- **Fade (Q3b).** Enter at open[e] against the poke. The stop is one tick beyond the poke's extreme. The target is the opposite IB edge. Otherwise exit at the 15:59 close; if stop and target fall in the same minute, the stop counts first.
- **R** = net points / |entry − stop|. Trades with a stop under 4 ticks are skipped (counted).
- **Costs per round trip:** NQ 2 ticks + $4 = 0.70 pt; ES 2 ticks + $4 = 0.58 pt (`forge/FUTURES_COST_RESCORE_PREREG.md`; the commission is still an assumption).
- **Placebo trades (lesson #27).** The same entry minute, side and stop distance in points in the 3 placebo sessions. For the fade, the target is the same distance in points as on the event day. Scored: net R minus placebo net R.

**3.8 Sample split.** IS 2016-01-04 → 2020-12-31; OOS 2021-01-04 → 2026-08-21.

**3.9 Positive control (lesson #1), run before any real outcome.**
- The known zero: 2,500 synthetic sessions of a driftless Gaussian random walk at 1-minute steps. Both d cells and both strategy-minus-placebo cells must come out with intervals that cover 0.
- The planted effect: the same walk, but after an accepted break a drift of +0.20 σ1·√h to the close in the break direction is added (a closed-form effect from outside the pipeline). Q1 d must recover 0.20 ± 0.05.
- If either fails, the pipeline is wrong, and nothing real is scored until it is fixed (logged as a PRE-RESULTS amendment).

**3.10 Descriptive layers (no pass/fail weight).**
- Day-type counts in Dalton's taxonomy (non-trend, normal, normal variation, trend, neutral, double distribution) using mechanical rules written into the script before running.
- Break-time histogram.
- The same Q1/Q2 d on YM and RTY as a replication look.
- **Component decomposition (owner's rule 2026-10-27).** (a) Gross R before costs. (b) The share of events whose price reaches one more IB width beyond the broken edge before 15:59, against the placebo share. (c) The volume in the event period against the same period's median over the previous 20 sessions, with d split by tercile of that ratio. Each component is judged against the placebo, in both halves, with BH at q = 0.10. A component that passes is listed as a candidate, never as a result.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| Q1 | After an accepted IB break, does price keep going to the close more than the time-matched placebo (d > 0)? | **Null or small.** T4 found a 50–52% close-beyond rate without acceptance. Acceptance should help a little. Expect d of 0 to +0.10σ, below the bar |
| Q2 | After a failed poke, does price move back against the poke more than the placebo (d > 0)? | **Null.** "Back inside within the hour" was 83–86% in T4 but did not carry through to the close |
| Q3 | Do the follow and fade trades earn net R > 0 and beat their placebo trades? | **No.** Every mechanical level rule here has failed on cost or placebo |
| **THE GATE** | A Q1 or Q2 cell passes if all of the following hold: Holm-adjusted p < 0.05 over the 8 scored cells; d ≥ **0.15σ** (point estimate); d > 0 in both IS and OOS. The question passes only if **both NQ and ES pass**. A strategy cell passes if net R ≥ +0.05R, net R minus placebo ≥ +0.05R with Holm p < 0.05, and the same sign in both halves | |
| **THE MIRROR** | Q1 and Q2 are each other's mirror at the same edge. If acceptance → follow and rejection → fade both pass, the two together are Steidlmayer's selector. If only one passes, there is no selector, just one effect | |

Statistically positive but below 0.15σ, in both halves, on both instruments → **CONTEXT** (a description of trend persistence, not a trade).

## 5. Power — what this design can and cannot find (required)

From the power pass (2026-11-18, scratch script; it computes setup **counts** and a **control** outcome only: a random period close, random sign, random session, never an event outcome). Control SD of y: NQ 1.034, ES 1.116 (n ≈ 2,580 each).

MDE = `mdeMeanDiff({ sd, n1: n, n2: 3n, alpha: 0.05/8, power: 0.8 })`. This uses the strictest Holm step, so it is conservative.

| Cell | Planned n | Outcome SD (control) | Design effect | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| Q1 NQ follow | 1,044 | 1.034 | 1 (one event per session) | 0.132σ | 0.15σ | POWERED |
| Q1 ES follow | 1,079 | 1.116 | 1 | 0.140σ | 0.15σ | POWERED |
| Q2 NQ fade | 1,348 | 1.034 | 1 | 0.116σ | 0.15σ | POWERED |
| Q2 ES fade | 1,375 | 1.116 | 1 | 0.124σ | 0.15σ | POWERED |
| Q3 ×4 strategies | as above, minus stops under 4 ticks | from the placebo trades | 1 | **in a PRE-RESULTS amendment** before scoring | +0.05R | to be stated |

**What the bar means in points.** σ1 on NQ was about 6–12 points after 2020. At h ≈ 240 minutes, 0.15σ is roughly 14–28 NQ points per event. That is far above the 0.70-point cost, so a stat-cell pass would matter economically. An effect smaller than about 0.12σ (about 10–20 points) cannot be told from zero here and would be reported as CONTEXT or UNDERPOWERED, never as a null of the idea.

The power pass found "no event" in 191 of 2,583 NQ sessions and 130 of 2,584 ES sessions. It scanned period closes up to 15:29 (L), one period beyond the C…K window fixed in §3.4. The real n will therefore be a little lower, and the real n and MDE are restated in the PRE-RESULTS amendment.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** 8 in all. Q1 NQ, Q1 ES, Q2 NQ, Q2 ES, and Q3 follow and fade on each instrument. **Holm at α = 0.05** over all 8, with p from the bootstrap via `pFromCI`.
- On top of that, the question-level gate is conjunctive (both instruments, both halves).
- The disaggregation cells in §3.10 (components, terciles, YM, RTY, day types) use BH at q = 0.10 with `chanceBaseline`. They can produce candidates only.
- **Promotion to anything live:** |t| ≥ 3 on the scored cell plus a forward record. The repo has no IB rule live today.

## 7. What this does NOT test (required)

- **Which way the day breaks.** No direction forecast before 10:30.
- **Discretionary Market Profile reading** (tails, poor highs, excess, overlap, the other-timeframe read from the letter shapes). Only the mechanical IB acceptance and rejection rule is tested, and a null does not close the discretionary method (lesson #24).
- **Volume or delta at the break,** except as the descriptive §3.10(c). The footprint archive is inside the lockbox, so real aggressor flow at the IB edge is a later question.
- **FX, gold or crude.** Their IB would need its own session definition.
- **Variants not run:** acceptance after 1 period or after 3, the IB at 30 or 90 minutes, IB extension targets (1.5×, 2×), and exits other than the 15:59 close or the opposite IB edge. These are listed here so a later look at any of them counts as a new trial.
- **The meaning of a null:** "a mechanical IB acceptance/rejection rule carries no edge to the close beyond what the clock and drift give". It does **not** mean "the IB is meaningless". The IB lines on `footprint.html` stay as a description either way.

## 8. What each verdict changes (required)

- **Pass (VALIDATED), Q1 and/or Q2.** Ledger entries. The footprint page's IB help text says what passed, with its size. A forward record of the rule starts on recorder data from the lockbox end. No bot or alert uses it until |t| ≥ 3 and the forward record agrees.
- **NULL.** Ledger entries. The page's help keeps "descriptive, not a signal" and quotes the effect size and interval. `REVERSION_CONTINUATION_CONCEPT.md` §B gets a pointer to the result.
- **CONTEXT.** As for NULL, but the page states the small persistence figure as a description.
- **UNDERPOWERED** (strategy cells, if the amendment's MDE exceeds +0.05R). Closed as untestable at this sample on 1-minute bars. The next step would be YM+RTY pooled, under a new prereg.

## Amendments

*(none yet)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/tpo-initial-balance/RESULTS.md`. Nothing above this line changes after the run.*
