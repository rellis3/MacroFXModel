# jump-after — what does price do after a jump, and does jump risk predict stop-through beyond σ and the calendar?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `jump-after-path`, `jump-after-stop-through`, `jump-after-intensity` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `jump-after` |
| Data | M1 mid bars, real bid/ask M1 for spread (`data/m1_bidask`, from 2016-10), Step 0 table, `calendar_events.csv`. 34 instruments, 2016-03 → 2026-08-20. No lockbox session. |
| Seed | `20261107`; bootstrap keeps `forecast_record.boot_weights` |
| Uncertainty | Date-block stationary bootstrap, block 20, 2,000 reps |
| Scripts / outputs | `forge/jump_lm.py` (tested), `scripts/jump-after/run.py` → `analysis/output/jump-after/` |
| Harness | Own script |

## 1. The claim

C.OG: "research a lot into jump intensity and jump diffusion". The layer 2 literature pass (`plans/vol-layer/L2_LITERATURE_SPEC.md`): in US equity ETFs, no-news and scheduled-news jumps reverse and unscheduled-news jumps continue, with negative jumps reversing hardest. FX evidence is thin, gold has none, and no one has tested jump risk against stop-through.

## 2. Why it is not already settled

- `jump-diffusion`: "forward payoff null", on a different detector and with no split by news. Not by horizon and class with real spread.
- `jump-structure`: how much is jump, how many are scheduled, single-step loss. Descriptive, no after-jump path.
- `jump-p90-event-term`: a forecast tail term. Not this.
- `jump-next-day-miss`: the next session's range. Not the next 60 minutes, not direction.
- `live-range-jump-through`: a touch bar overshooting a line. Not a general after-jump path.
- The arrow jump-momentum null in memory (`project_jump_momentum_ignition_null`) tested a different indicator as a signal. I have not read its full design, so this is not claimed as new against it beyond the split by news and the clean detector.
- `STOP_RISK`: loss given a stop by condition, not whether jump state predicts it beyond σ and calendar.

The earlier detector forward-fills empty 5-minute slots into zero returns and has no causal bipower across days. Lower-frequency flags are bursts rather than true discontinuities (Christensen et al. 2014), and that is the name that belongs here.

## 3. Definitions

**Detector (`forge/jump_lm.py`, Lee-Mykland 2008).**
- 5-minute London-clock grid, 00:00–22:00 London, last M1 close per slot. Empty slots drop the returns around them.
- Time-of-day factor f: per slot, the median |r| over the previous 250 sessions, normalised, floored at 0.25.
- r̃ = r ÷ f. σ̂² = mean of |r̃_t||r̃_{t−1}| over the previous 270 returns, excluding this bar.
- L = r̃ ÷ σ̂. Flag when |L| exceeds the Gumbel critical value for n = 264 at α = 1% per session.
- First flag per instrument per session only.

**Scheduled.** The flag bar starts within −5/+15 minutes of a Major release in one of the instrument's currencies (`jumps.releases`, USD/EUR/GBP only). `covered` instruments have all their currencies in the calendar: EURUSD, GBPUSD, EURGBP, GOLD, NQ, SPX500, DOW, US2000, DE30, UK100. Sessions after 2026-07-02 are unknown and excluded from the split.

**Q1 After-jump path (`jump-after-path`).** Signed return = sign of the flag bar × log return from the flag bar's close, in daily σ, at 5, 15, 30, 60 and 240 minutes, within the session. Primary horizon 60 minutes.
- **Control:** first unflagged bar in the same session with 3 ≤ |L| < critical value and no flag earlier that session, post-stratified on instrument × hour to the flag mix.
- **Trade:** enter at the flag bar's close, exit at the horizon's close, both at real bid/ask. Cost = half the slot's spread at each end. Fade is the negative of follow, each paying the cost.

**Q2 Stop-through (`jump-after-stop-through`).** Target: the session's largest 5-minute move or its open gap exceeds d × σ_used, for d = 0.25, 0.5, 1. Walk-forward logistic, yearly expanding, scored from 2019.
- **Benchmark:** class, log(σ ÷ 250-session median), event tag dummies, Monday.
- **Added:** `lam_un`, `lam_sch` (EWMA half-life 20 sessions of unscheduled and scheduled flags), `flag_last`, `js20` (mean jump share over 20 sessions). All from sessions before this one.
- **Score:** Brier skill gain over the benchmark, 1 − Brier(new) ÷ Brier(benchmark).

**Q3 Intensity (`jump-after-intensity`).** Target: a flag today. Same benchmark and added features, same score. Hawkes is run only if this passes, since a session-level EWMA is the simple form of the same idea.

**Halves.** A = up to 2021-08-20, B = after.

## 4. Hypotheses

| # | Question | Expectation |
|---|---|---|
| a | Unscheduled bursts: signed 60-minute return differs from 0 (two-sided) | Slight reversal, -0.01 to -0.03σ, if the equity result transfers |
| b | Scheduled bursts, same | Slight reversal or none |
| c | All 34, ignoring the news split | Small |
| d | Jump state adds to stop-through at d = 0.25, 0.5, 1 | Little: earlier work suggests most jumps can't be known |
| e | Intensity adds to clock and calendar | Little: Fičura found seasonality gave most accuracy on EURUSD |
| **GATE path (VALIDATED)** | Holm-significant; same sign in both halves; differs from the control with interval excluding 0; net trade in that direction with whole interval above 0 | |
| **GATE stop-through and intensity (VALIDATED)** | Gain's whole interval above 0, and gain at least 0.5% | |
| **MIRROR** | Fade is the mirror of follow; both reported | |

**Words.** `VALIDATED`: the gate holds. `CONTEXT`: Holm-significant and same sign in both halves, but net or the 0.5% bar fails. `NULL`: nothing clears, and powered. `UNDERPOWERED`: a cell's interval half-width exceeds its bar in §5.

## 5. Power

No outcomes used. From `jump-structure`, about 32 jump days per instrument-year on a stricter day-level test. Estimate 8,000+ flags in all, about 2,500 on covered instruments, split roughly 25/75 scheduled and unscheduled. A 60-minute signed return has sd about 0.3σ after a burst. Design effect about 3 from cojumps.

| Cell | n | SE | MDE (80%, Holm 3) | Bar | Verdict |
|---|---|---|---|---|---|
| Path, unscheduled | ~1,900 | 0.012σ | 0.035σ | net of about 0.04σ cost | POWERED for anything tradable |
| Path, scheduled | ~600 | 0.022σ | 0.06σ | same | POWERED only for a large effect |
| Path, all 34 | ~8,000 | 0.006σ | 0.018σ | same | POWERED |
| Stop-through gain | ~80,000 sessions | ~0.001 | 0.003 | 0.005 | POWERED |
| Intensity gain | ~80,000 sessions | ~0.001 | 0.003 | 0.005 | POWERED |

The realised flag count from the detector audit replaces these estimates in the results, and scheduled gets `UNDERPOWERED` if its half-width exceeds 0.06σ.

## 6. Multiplicity

Three scored questions, each with its own family. Path: 3 cells at 60 minutes, Holm α 0.05, two-sided. Stop-through: 3 cells, Holm. Intensity: 1 cell. Other horizons, up vs down, by class and by half are descriptive; BH q 0.10 candidates only.

## 7. What it does not test

Tick-level jumps: these are 5-minute bursts. Line touches on a burst (`live-range-jump-through`). Cross-instrument cojump structure. Merton parameters and first-passage, which is the next prereg. Stops or targets on the after-jump trade: this holds to a fixed time.

## 8. What each verdict changes

- **VALIDATED path:** a forward paper record. Nothing live.
- **CONTEXT path:** bursts get a description of what usually follows, with no trade.
- **VALIDATED stop-through:** a stop-sizing input for layer 7. Shadow first.
- **NULL:** jump state does not help beyond σ and the calendar, so jumps stay a description of what just happened and a reason to size for gap risk.

## Amendments

### A1 — 2026-11-07 — PRE-RESULTS
The detector audit, flag counts only, showed about 120 flagged sessions per instrument-year: nearly half of all sessions, against a design of about 1%. The Gumbel limit assumes Gaussian returns, and real 5-minute returns have much fatter tails. No outcome had been read. The build was stopped before writing its results.
- **New limit:** a session flags when |L| exceeds that instrument's 88th percentile of session max |L| over the previous 500 sessions. The 12% rate matches the day-level BNS rate in `jump-structure` (about 32 days a year). It uses only flag rates and past data.
- **Meaning:** a flag now means an unusually large burst for that instrument, not a statistically proven jump. The name in results is "burst".
- **Sample:** flags start after about 250 + 120 sessions of history. Flags fall to about 8,000 overall, as the power table assumed.
- **Control:** 3 ≤ |L| < that session's limit.
- **Proof checks:** this study also runs through `forge/verdict_gate.py`: planted edges, shuffle, power from the realised interval. The minimum effects are 0.03σ for the path, and a 0.5% Brier gain for stop-through and intensity.

## RESULTS
