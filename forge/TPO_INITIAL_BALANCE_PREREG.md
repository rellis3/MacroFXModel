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

### A1 — 2026-11-20 — PRE-RESULTS: order flow and candles added (owner's ask)

The owner asked (2026-11-20) for order flow, candles, and a cross-comparison of TPO against order flow in the same study. No outcome had been computed: no script for this study had read prices after an event. Added:

**Flow and candle variables, all known at the event period's close (t).**
- **Delta proxy (tier P).** The bulk-volume classification already used in `value-migration-nq` (`scripts/value-migration-nq/vmig/features.py`): per minute δ = V·(2Φ(Δp/σ1) − 1), with Δp the close-to-close change (close − open at 09:30). The flow ratio of a window is cd = Σδ / ΣV.
- **x_flow, follow events.** cd over the event's two acceptance periods, signed with the break (+ = buyers on an up-break), and z-scored against the same two clock periods over the previous 20 sessions (past only).
- **x_flow, fade events.** cd over the poke period, signed **toward the poke** (+ = aggressive buying into a poke above IBH that still closed back inside, which is absorption). Expectation from the footprint literature: more absorption leads to a stronger fade. The sign is fixed here.
- **x_candle, follow events.** The close location of the second acceptance period's 30-minute candle in the break direction, CLV = (C − L)/(H − L) for an up-break and (H − C)/(H − L) for a down-break. 0.5 if H = L.
- **x_candle, fade events.** The poke period's close location **away from** the poke: (H − C)/(H − L) for a poke above, (C − L)/(H − L) for a poke below. A close at the far end means a strong rejection.
- x_flow and x_candle are both standardised (z) within instrument and event type over the whole sample before the regression. That is a scaling only, and the scored slope stays in σ of y per 1 SD of x.

**New scored cells (a second family, separate from the 8 in §6).**
- **Q4 (flow) and Q5 (candle):** the OLS slope b in d = a + b·x, per instrument (NQ, ES) and event type (follow, fade). That gives 8 cells: Q4-follow, Q4-fade, Q5-follow and Q5-fade, each on NQ and on ES.
- **Expected sign:** positive in all 8 (flow with the break helps the follow; absorption helps the fade; a strong close helps the follow; a strong rejection helps the fade).
- **Uncertainty:** the same session-block bootstrap (block 20, B = 2000), p via `pFromCI`, Holm at α = 0.05 over these 8.
- **A cell passes if:** Holm p < 0.05, b ≥ **+0.15σ per SD**, and the same sign in IS and OOS.
- **The question-level gate:** both NQ and ES must pass.
- **Planned power.** SE(b) ≈ SD(d)/√n. SD(d) = SD(y)·√(4/3), using the control SD from §5. At α = 0.05/8 (z 2.73 + 0.84 = 3.57):

| Cell | n | SD(d) | MDE (σ per SD of x) | Bar | Verdict |
|---|---|---|---|---|---|
| Q4/Q5 follow NQ | 1,044 | 1.19 | 0.132 | 0.15 | POWERED |
| Q4/Q5 follow ES | 1,079 | 1.29 | 0.140 | 0.15 | POWERED |
| Q4/Q5 fade NQ | 1,348 | 1.19 | 0.116 | 0.15 | POWERED |
| Q4/Q5 fade ES | 1,375 | 1.29 | 0.124 | 0.15 | POWERED |

These are restated from the real n and SD(d) in A2, before scoring. A slope that is statistically positive but below the bar in both halves is **CONTEXT**.

**Real order flow (descriptive only, no pass weight).**
- NQ tick-rule trades from NT8 history (`analysis/output/nt8/NQ_09-26_tick.csv`): 2026-02-11 → 2026-08-14, about 125 sessions, all before the lockbox. The tick rule correlated +0.91 with the exchange aggressor flag on NQ (`orderflow-lead`).
- Two uses:
  - **(i) Proxy validity:** the per-30-minute-period correlation between the tick-rule flow ratio and the proxy cd on the same periods. If it is below 0.5, Q4 is read as "the proxy carries no flow information", not as a null of flow.
  - **(ii)** The Q4 regressions re-run with tick-rule x_flow. That is about 50 follow and 65 fade events, so underpowered by design and descriptive.
- ES has no tick history before the lockbox.

**TPO against order flow, the cross-comparison (descriptive, BH q = 0.10 where a test is given).**
- **D1.** Per 30-minute period (C … M, all sessions): the correlation between the period's range extension (new TPO rows above the prior high minus new rows below the prior low, in ticks / IB width) and its flow ratio cd. Proxy for all sessions, tick rule on the NQ subset.
- **D2.** Per session: the distance between the TPO POC and the volume POC, in IB widths, and the overlap of the TPO value area with the volume value area (shared share of the union). The volume profile uses each minute's volume spread evenly over its range (tier P, as in `value-migration-nq`).
- **D3.** Per session with an IB extension on one side only: the share where the session's cumulative delta (proxy) at 15:59 has the same sign as the extension. On the NQ subset, tick-rule CVD too.
- **D4.** Day type (§3.10) against session CVD sign and against |close − TPO POC| / IB width.
- **D5.** Candles alone, as a baseline for Q5: the share of 30-minute periods whose CLV ≥ 0.8 (or ≤ 0.2) are followed by a next-period close in the same direction, against the same share at random periods.

**Not added.** Real aggressor flow on ES, footprint imbalances or stacks at the IB edge (the recorder days are in the lockbox), and order-book depth. These stay for a forward record.

The A2 amendment (real n, the strategy-cell MDE from placebo trades, the positive-control result) follows before any scoring.

### A2 — 2026-11-20 — PRE-RESULTS: positive control, real n and MDEs, implementation notes

No event outcome had been computed. The count pass (`run.py count`) reads only setup counts, features known at t, and placebo (other-session) outcomes. Code: `scripts/tpo-initial-balance/` (`tpo_ib.py`, `events.py`, `control.py`, `run.py`).

**Positive control (§3.9): PASSED** (`analysis/output/tpo-initial-balance/positive_control.json`, 2,540 synthetic sessions).
- On the driftless walk, all 8 cells have 95% intervals that cover 0: d follow +0.012 [−0.051, +0.075], d fade −0.001, dR follow +0.030 [−0.138, +0.217], dR fade −0.045, and all four slopes.
- A planted +0.20 was recovered as **+0.215 [+0.149, +0.278]**.
- The synthetic walk gave event rates close to the real ones (acceptance 42%, poke 56%).

**Real n and MDE** (`count.json`; MDE at α = 0.05/8, 80% power):

| | NQ follow | NQ fade | ES follow | ES fade |
|---|---|---|---|---|
| events | 1,038 | 1,349 | 1,068 | 1,371 |
| SD of placebo y | 1.000 | 1.024 | 1.096 | 1.032 |
| MDE of d (Q1/Q2) and of the slopes (Q4/Q5) | 0.128σ | 0.115σ | 0.138σ | 0.115σ |
| trades (stop ≥ 4 ticks) | 1,024 | 1,339 | 1,023 | 1,318 |
| SD of placebo net R | 2.74 | 1.80 | 2.47 | 1.61 |
| **MDE of dR (Q3)** | **0.354R** | **0.203R** | **0.319R** | **0.183R** |

- Q1, Q2, Q4 and Q5 are all **POWERED** against their 0.15σ bars.
- **The four Q3 strategy cells are UNDERPOWERED by design.** The bar is +0.05R and the MDE is 0.18–0.35R. The IB-edge stop is often tight, so R has fat tails.
- Q3 is still scored and reported. A Q3 cell that does not clear its bar is recorded as **UNDERPOWERED**, not NULL, and only an effect above its MDE could pass.
- The design is **not** changed after this count: no wider stop, no other exit. Any such variant is a new trial under §7.

**Sessions.** NQ 2,603 kept (104 short sessions dropped, 16 minutes forward-filled); ES 2,604 (103, 16). "No event": NQ 216, ES 165.

**Implementation notes (fixed now, before scoring).**
- A period that pokes **both** IB edges and closes back inside is a poke on the side exceeded by more.
- A period that closes beyond an edge right after a period that also closed beyond the other edge does not count as acceptance; acceptance needs the same edge twice.
- Day-type rules (§3.10) are as coded in `tpo_ib.day_type`:
  - w = IB width, R = the day's range.
  - **normal:** R < 1.15w.
  - **neutral extreme / centre:** both sides extended; extreme if the close is in the outer 20% of the range.
  - **trend:** one side extended, R ≥ 2w, and the close in the outer 20% toward the extension.
  - **one-sided other:** the same as trend, but the close is not there (it absorbs Dalton's double distribution).
  - **normal variation:** one side extended and 1.15w ≤ R < 2w.
- Profiles for D2 use 1-tick rows.
- Bootstrap: one RNG with seed 20261118 is shared across cells in a fixed order.
- Placebo pool: the 250 sessions before the event, at least 20.
- The tick-rule arm uses only sessions where NQ 09-26 was the front contract in the continuous file. Before about mid-June the 09-26 trades are back-month trades and are not used. The tick arm's flow is the raw signed ratio over the event window (no 20-session z-score, because the front-month tick history is too short), standardised within the subset.

### A3 — 2026-11-20 — POST-HOC (results seen): the real-flow arm's data replaced; description only

A1 said the NT8 tick file covered "about 125 sessions" from 2026-02-11 to 2026-08-14. That was wrong. I read only its first and last rows. The file holds three two-day chunks (8 days), and only **one** session is front month, so the tick-rule arm could not run (`results.json` → `tick_arm_NQ`: 1 session).

It is replaced by the **exchange aggressor flag** on 51 NQ RTH sessions from Databento (2026-06-12 → 2026-08-21, before the lockbox), bought for `orderflow-lead-aggressor`. That is better data than the tick rule. 49 sessions overlap the kept 1-minute sessions. Script: `scripts/tpo-initial-balance/aggressor_arm.py` → `aggressor_arm.json`.

This arm is descriptive only, as A1 registered it, and it changes no verdict. It can only qualify Q4 (demote or describe). Its main use is the A1 validity check: the proxy-versus-real-flow correlation per 30-minute period.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/tpo-initial-balance/RESULTS.md`. Nothing above this line changes after the run.*
