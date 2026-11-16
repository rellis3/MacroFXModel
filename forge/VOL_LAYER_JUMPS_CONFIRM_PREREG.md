# vol-layer-jumps-confirm: after a burst, does a σ stop get hit more often, and lose more past the stop, than the vol clock says?

**Pre-registered 2026-11-16. No stop touch or overshoot after a burst has been computed on 2023-01-01 → 2026-08-20.** The bursts themselves (times, sizes, cojump counts) are known for that window from `jump-after`; counting them reads no outcome. The discovery numbers in §2 and §5 use sessions before 2023-01-01 only.

| | |
|---|---|
| ID / ledger id | `vol-layer-jumps-confirm-touch`, `vol-layer-jumps-confirm-overshoot` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-jumps-confirm` |
| Data | **Bursts and controls:** setup columns only (`inst, date, slot, kind, ver, size, hour, sched`) of `analysis/output/jump-after/events.parquet`, main read (`ver == "x"`, first burst 01:00–21:00 London). Its outcome columns (`m5 … m240`, `sp_*`, `pl_*`) are never loaded. **Paths and fills:** M1 bid/ask, `data/m1_bidask`. **σ:** `live_sig_used` from `analysis/output/forecast_history/<SYM>.csv` (known at the open). **Instruments (34):** the jump-after list. **Score window:** 2023-01-01 → 2026-08-20; the lockbox (2026-08-21 on) is untouched. **Discovery (power and profile only):** 2016-10-24 → 2022-12-30. |
| Seed | `20261116` |
| Uncertainty | Date-block stationary bootstrap over sessions, block 20, B = 2000 (`line_reaction.Boot`, `forecast_record.SEED = 20261116`). Null spread: 200 per-moment label shuffles (§3). |
| Scripts / outputs | `scripts/vol-layer-jumps-confirm/run.py` → `analysis/output/vol-layer-jumps-confirm/{control,discovery,confirm}/`, `RESULTS.md`, `results.json` |
| Harness | Own script. The cells need a bid/ask M1 path after each event, which the harnesses don't do. |

## 1. The claim

Stage 4 now confirms each layer on its own measure (C.OG L03): accuracy for a forecast, calibration for a probability, steadiness for sizing. The overlay-on-Rule-A design could not judge overlays (`vol-layer-rule-a-confirm`: Sharpe MDEs 0.25–0.31 on 1,135 trades).

Layer 2's own question (`js/volLayerResearch.js`, LAYERS jumps): *does knowing jump risk tell us when a σ-based stop will be blown through, beyond σ and the clock?* Its field is the stop-through tail: how far past a stop price goes when it is hit.

C.OG, Forecaster Portfolio L03: "jump risk passes through stops and cannot be traded out of; sizing on vol alone understates one-step loss." L01/L05: fit a generalised Pareto tail, because a bootstrap cannot make a day worse than the worst seen.

**The claim:**
- **Touch.** Right after a burst, a 0.5σ stop is hit within 60 minutes more often than the vol-clock random walk predicts, by more than after a near-burst bar.
- **Overshoot.** When that stop is hit, the fill lands further past it after a burst than after a near-burst bar.

## 2. Why it is not already settled

**First: what `jump-after` already used.** Its detector and every scored cell ran on 2016-03 → 2026-08-20 (first flags 2017-08-30). So the whole confirm window was scored there:
- **Path** (5 cells at 60 minutes), all sessions to 2026-08-20.
- **Stop-through** and **intensity**, walk-forward, scored 2019 → 2026-08-20. The published half split puts intensity at +0.58% / +0.50%, and the second half is mostly 2023-26.
- **Descriptive cells** (size thirds, horizons, the noise check), all sessions to 2026-08-20.

The 2023-26 slice was never printed on its own. But with the full-window numbers published, the discovery-only numbers below make the slice a subtraction away. **So the candidate cells (a)-(c) cannot be confirmed on 2023-26.** They are kept out of the scored family (§4, "Not scored here") and their power is still shown in §5.

The window has been used once before: `vol-layer-rule-a-confirm` scored Rule A's overlay trades on it. That is a different question (stop and size overlays on Rule A's entries), and no burst-conditioned quantity was computed there.

**What was never computed, on any window:** a σ stop's touch rate and its fill past the stop, conditioned on a burst.
- `jump-after-stop-through` (CONTEXT): a session-level forecast made before the session (largest 5-minute move or gap ≥ d·σ). Not what happens to a stop after a burst is seen.
- `jump-structure` (CONTEXT): one 5-minute bar crosses a 0.5σ stop on 11% of sessions. Unconditional.
- `jump-next-day-miss` (CONTEXT): the next session's range. Not intraday, not stops.
- `jump-after-path` (NULL): signed direction after a burst. Touch here is direction-free.
- Vol-layer execution stage 3 (`scripts/vol-layer-deep/execution_wide.py`, discovery only, random entries, not banked): bid/ask touch = random walk plus spread; weekday gap rate 3.2% of stop hits, overshoot p99 0.69σ, GPD ξ 0.34; weekends ξ 0.06 with p99 3.9σ. Never split by burst; never run past 2022.
- `live-range-jump-through` (`js/deskEvidence.js` line-touch entry): overshoot of a forecast line on the touch bar. Not a stop placed after a burst.

**Discovery look (bursts 2017-08-30 → 2022-12-30; the detector needs 370 sessions of history), stated before scoring.** Direction-free entries at the event bar's close, 60 minutes, bid/ask:

- 4,951 bursts and 45,407 controls (3 bursts and 2 controls dropped: no σ or no bid/ask bar).
- These are raw touch rates. The random-walk benchmark was not computed in the look. Post-stratification on instrument × hour makes it almost the same for both groups, so the raw Δ ≈ the excess Δ.
- Overshoot is the fill past the stop, in R, with fills at the stop counted as 0.

| d | Touch, bursts | Touch, controls | Δ [SE] | Hits, bursts | Gapped hits, bursts | Overshoot Δ, R [SE] | p99 overshoot, bursts / controls (σ) |
|---|---|---|---|---|---|---|---|
| 0.25 | 56.7% | 30.9% | +25.8pp [0.9] | 5,617 | 166 (3.0%) | +0.007 [0.004] | 0.137 / 0.008 |
| **0.5** | **26.9%** | **8.0%** | **+18.9pp [0.9]** | 2,665 | 45 (1.7%) | +0.0014 [0.0013] | 0.012 / 0.004 |
| 1.0 | 6.8% | 1.1% | +5.7pp [0.7] | 675 | 7 (1.0%) | +0.0006 [0.0005] | 0.001 / 0.002 |

The look found the touch effect is large and the overshoot is tiny. The confirm asks whether both hold on data no one has looked at.

**Expectation:** touch is higher after a burst than after a near-burst bar, because a burst raises local vol for a while. Whether it is higher *than the vol clock allows by more than a near-burst* is the open part. Overshoot: about 0; gapped fills are rare (under 2% of hits at 0.5σ) and small.

## 3. Definitions, fixed in advance

**Events.** From `events.parquet`, `ver == "x"`, setup columns only.
- **Burst:** `kind == "flag"`: the first 5-minute bar per instrument and session, 01:00–21:00 London, with |L| above that instrument's 88th percentile of session max |L| over the previous 500 sessions (jump-after A1, A2).
- **Control:** `kind == "control"`: the first bar in the same session with 3 ≤ |L| < that limit, before any burst, 01:00–21:00.
- **Moment:** date × slot. Bursts in the same moment are one cluster. **Common** = 3 or more instruments in the moment; **own** = fewer.
- The script asserts 3,431 bursts and 30,642 controls in the score window, and 4,954 bursts before 2023 (counts from this drafting). A mismatch stops the run. Events dropped for a missing σ or bid/ask bar are counted; more than 1% stops the run.

**Entries.** At the last M1 bar inside the event's 5-minute slot:
- a long at the ask close and a short at the bid close, both from the same bar;
- u = σ_used × mid at that bar;
- stop at d × u from the fill: long stop = ask − d·u, short stop = bid + d·u;
- `data/m1_bidask` times load as `datetime64[us]`. All time arithmetic converts to one unit first (`.dt.as_unit("ns")`). The drafting look first ran with mixed units and read a 41-day window as 60 minutes (touch 93%); it was caught and rerun before these numbers were written.
- path = the next 60 M1 bars (London), stopping at 21:59 London. A window cut short by 22:00 is kept and flagged; a share above 5% is reported.

**Touch.** A long stop is hit when a later bid low ≤ stop; a short stop when a later ask high ≥ stop. Event outcome = the mean of the two sides (0, ½ or 1).

**Fill and overshoot.** On the first hit bar, the fill is the stop, unless that bar's bid open (long) or ask open (short) is already beyond the stop, then the fill is that open. Overshoot = distance from stop to fill, in σ. Loss beyond the stop in R = overshoot ÷ d. A fill at the stop is 0, and is counted.

**Vol-clock random walk.** For each instrument, the share V(s, 60) of a session's 5-minute variance that falls in the 12 slots after slot s. Profile = the mean of squared 5-minute mid returns per slot, from discovery sessions only (2016-10-24 → 2022-12-30), normalised to sum to 1 over 00:00–22:00. Predicted touch per side = 2Φ(−d ÷ √V). This is the known-answer benchmark (reflection principle). It ignores the spread, which applies to bursts and controls alike.

**Cells.**

| Cell | Statistic | Base | Plateau neighbours | +1 lag |
|---|---|---|---|---|
| T1 touch | Δ excess = (touch − predicted) for bursts minus the same for controls; controls post-stratified on instrument × hour to the burst mix (the jump-after weights) | d = 0.5, 60 min | d = 0.25 and d = 1.0 | entry one slot later (close of slot s+1), same stop rule |
| T2 overshoot | Δ mean loss beyond the stop in R per hit, bursts minus controls, same weights; hits from both sides stacked | d = 0.5, 60 min | d = 0.25 and d = 1.0 | entry one slot later |

**Null spread: per-moment label shuffle** (the jump-after A3 lesson). A per-row shuffle breaks cojump clusters and gives too narrow a null.
- Within each instrument × hour stratum, every burst moment and every control is a unit. A burst moment's rows move together.
- Each draw reassigns the burst and control labels at random among the units of each stratum, keeping each stratum's counts. Then Δ is recomputed.
- 200 draws, seed 20261116.
- Reported: the 2.5–97.5% range of the 200 shuffled Δ (must include 0), the real Δ's percentile in it, and the share of draws whose own bootstrap interval excludes 0 (should be near 5%).

**Positive controls (method lesson 1), run first, from outside the pipeline.**
- *Known zero:* simulated Brownian paths on the real event grid (same instruments, slots, σ and V). T1 excess must be within ±1pp of 0 in both groups, and Δ ≈ 0.
- *Known effect:* the same, with burst paths' variance × 1.5 for 60 minutes. Predicted Δ from the closed form; the pipeline must recover at least half of it.
- *Overshoot:* simulated paths with gaps planted at a known rate and exponential size. T2 must recover the planted mean extra loss within its interval. A GPD fit to simulated Pareto exceedances with ξ = 0.3 must return ξ within ±0.15.
- If any control fails, nothing is scored. The fix and rerun are a PRE-RESULTS amendment.

**Descriptive only (no pass or fail):**
- **GPD tail of the overshoot.** Fit on bursts' gapped hits, top 10% or at least 40 exceedances, as `execution_wide.gpd_fit`. Needs at least 80 gapped hits; otherwise empirical median, p90 and p99 only. Shown beside the discovery random-entry tail (weekday ξ 0.34, p99 0.69σ).
- T1 and T2 by common vs own, by class, and at 15, 30 and 120 minutes.
- T1 and T2 per year 2023, 2024, 2025, 2026 (to 08-20).
- The share of 60-minute windows cut short by 22:00.

## 4. Hypotheses

| Cell | Question | Expectation |
|---|---|---|
| T1 | After a burst, is the 0.5σ stop hit more often than the vol clock predicts, by more than after a near-burst? | **Yes**, about +15 to +20pp (discovery +18.9pp) |
| T2 | When hit, does the fill land further past the stop after a burst? | **No** (NULL): under 0.01R (discovery +0.0014R) |

**THE GATE (VALIDATED)**, all of the following:
- Holm-adjusted p < 0.05 over the two cells (p from the bootstrap, `pFromCI`);
- Δ at least the pass bar (T1 +5pp; T2 +0.05R), in the claimed direction;
- the real Δ above the 97.5th percentile of the 200 per-moment shuffles;
- **plateau:** both neighbours (d = 0.25, 1.0) the same sign, each with its interval excluding 0. A half-size rule does not fit here, because touch rates fall with d by construction (discovery Δ +25.8, +18.9, +5.7pp);
- **+1 lag:** entry one slot later, same sign and at least half the size;
- the same sign in at least 3 of the 4 calendar years 2023–2026.

**THE MIRROR:** the controls are the mirror: the same entries, stops and clock on a near-burst bar. Both groups' raw excess over the random walk is reported, so a pass can't come from the controls falling below it.

**Other verdicts:**
- **NULL:** powered by §5, and the 95% interval of Δ lies below the pass bar.
- **UNDERPOWERED:** §5 says so, or the interval includes both 0 and the pass bar.
- **CONTEXT:** passes on p and size but fails the plateau, the lag or the year check; or significant in the opposite direction.

**Not scored here, and why** (the four candidate cells from the brief):

| Candidate | Why it is not a confirm cell |
|---|---|
| (a) Large market-wide bursts (above 0.703σ, 3+ instruments), follow net of spread at 60 min | 2023-26 outcomes sit inside jump-after's full-window and half-B numbers. And no window we hold can power it (§5). Discovery alone: net +0.040σ [−0.040, +0.122], gross +0.094σ [+0.015, +0.175]. The lead was already not significant net before 2023. |
| (b) Own-burst give-back at 5 min, and its growth with the spread at the burst | Seen: the give-back is in jump-after's full window, the spread split in its noise check. Discovery alone: −0.029σ [−0.044, −0.015]; wide minus normal spread −0.044σ (SE about 0.017). It held before 2023 on its own. |
| (c) Burst intensity clusters | Seen: scored walk-forward to 2026-08-20; half B (mostly 2023-26) published at +0.50%. |
| (d) GPD tail of stop overshoot after bursts | Kept, as T2 (scored) plus the GPD fit (descriptive, §3). |

## 5. Power

From discovery data only (sessions before 2023-01-01) and the event counts in the score window (setup columns only). Score window: 3,431 bursts in 965 moments; 30,642 controls. Discovery: 4,954 bursts in 1,443 moments.

**Scored cells.** SE scaled from discovery by √(discovery moments ÷ confirm moments) = √(1,443 ÷ 965). MDE = `mdeFromCI` at 80% power, two-sided, α = 0.05 ÷ 2 (the Holm first step, conservative).

| Cell | Planned n (score window) | SE (discovery, scaled) | Design effect | **MDE** (80%, α 0.025) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| T1 touch, d = 0.5 | 3,431 bursts in 965 moments; 30,642 controls | 0.0086 × 1.22 = 0.0105 | in the bootstrap (date blocks); the moment-cluster SE on discovery was 0.0079, so blocks are the wider | **3.2pp** | +5pp | POWERED |
| T2 overshoot, d = 0.5 | about 1,850 burst hits (2,665 × 965 ÷ 1,443) | 0.00126 × 1.22 = 0.00154R | in the bootstrap | **0.0048R** | +0.05R | POWERED |

- **Why these bars.** +5pp: the spread alone adds about 2pp to a stop's touch rate (execution stage 3), and a stop rule changed for less than that is noise. +0.05R = 0.025σ at d = 0.5, half a typical round-trip spread (jump-after cost about 0.05σ); a smaller extra loss is inside the cost already paid.
- **GPD fit (descriptive).** Discovery had 45 gapped burst hits at 0.5σ, so the score window will have about 30. That is under the 80 the fit needs. It runs only at d = 0.25 if that reaches 80 (discovery 166, so about 110 expected); otherwise quantiles only. It cannot be powered as a scored cell.

**Candidates not scored here (for the record):**

| Candidate | SE on 2023-26 (from discovery) | MDE (80%, α 0.05) | Bar | Verdict |
|---|---|---|---|---|
| (a) large market-wide follow net, 228 moments | 0.050σ | 0.141σ | 0.03σ net (jump-after `PATH_MIN`) | UNDERPOWERED by design |
| (a) on the whole 2017-26 sample, 558 moments | 0.032σ | 0.090σ | 0.03σ | UNDERPOWERED by design |
| (b) own give-back at 5 min, 665 bursts | 0.0092σ | 0.026σ two-sided, 0.023σ one-sided | 0.025σ (banked size) | UNDERPOWERED two-sided; POWERED one-sided |
| (b) wide minus normal spread at 5 min | 0.021σ | 0.060σ | 0.031σ (noise check) | UNDERPOWERED by design |
| (c) intensity Brier gain, ~32,000 sessions | 0.0021 | 0.0060 | 0.005 | UNDERPOWERED by design |

So (a) can't be settled on any data we hold: at the 0.03σ bar it needs about 5,000 moments, about 80 years of bursts at about 63 a year. Even at the full-window point estimate (+0.049σ) it needs about 1,900 moments, about 30 years.

## 6. Multiplicity

- Two scored cells, T1 and T2. Holm at α = 0.05, with p from the bootstrap interval (`pFromCI`, normal approximation).
- Neighbour settings, the lag rerun, years, horizons, common vs own, class and the GPD fit are descriptive.
- Disaggregation slices (class, common vs own): BH at q = 0.10 with `chanceBaseline`. A slice that survives is a candidate for its own prereg, never a result.
- **Directions tried on this layer** (L02/L04 deflation): jump-diffusion, jump-structure, jump-p90-event-term, jump-next-day-miss, jump-after (3 questions), and this one. A VALIDATED here stays research-only until |t| ≥ 3.

## 7. What this does NOT test

- Direction after a burst, or any trade on it: `jump-after-path` covers that, and (a) is untestable here.
- Whether bursts can be forecast before they happen (`jump-after-intensity`).
- Fills inside an M1 bar. An overshoot on a bar that did not open beyond the stop is invisible here, so T2 is a lower bound on real slippage.
- Weekend and overnight gaps: the window closes at 22:00. Execution stage 3 measured those.
- A real system's stops. These are direction-free entries at the burst, so a pass describes the stop layer, not a strategy.
- Whether the touch effect is a jump or plain vol clustering. A burst is a big bar, and big bars raise local vol; the near-burst control takes out some of that, not all. A forecast with realised vol so far today (vol-layer-reaction) would be the next benchmark.
- Second bursts in the same session. jump-after kept only the first; its session-max threshold makes later bursts hard to compare. Needs its own detector design.
- The lockbox, and the 2026-08-21 onward data, for all cells.

## 8. What each verdict changes

- **T1 VALIDATED:** a jump allowance for stops placed within an hour after a burst: widen by the measured excess, or wait. Shadow first, on the stop layer (layer 7). The ASSEMBLY "Stop loss" slot records it. Nothing live.
- **T2 VALIDATED:** the loss-given-stop after a burst is set from the measured tail, not 1R. It feeds the stop-risk map and sizing, side by side with the current numbers.
- **NULL:** a σ stop with the vol clock already prices the hour after a burst. The "jump allowance" idea from L03 is recorded as not needed intraday on our 34 instruments; the allowance stays for weekends only.
- **UNDERPOWERED:** recorded as such. The next data would be a forward record of the same events; §5 gives the size needed.
- **(a):** the large market-wide follow lead is closed as UNDERPOWERED by design (untestable on any data we hold). Bank it with that word under this slug's note; it stops being listed as a next prereg.
- **(b) and (c):** their banked words stand. A true confirm needs data none of us has seen: a forward record of own bursts from the commit date. One-sided, at the banked 0.025σ, it needs about 560 own bursts, about 3 years. Proposed, not registered here.

## Amendments
