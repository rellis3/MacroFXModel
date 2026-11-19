# Jordi Visser: a research team of agents, and the 50-day rate of change

| | |
|---|---|
| Lane / source | informational / titans-of-tomorrow |
| Speaker(s) | JV = Jordi Visser (ex-Morgan Stanley MD, ex-president of a $4bn hedge fund), guest on *Titans of Tomorrow* |
| URL | pasted 2026-11-18 (two shorts from the episode; full episode on YouTube, "Jordi Visser x Titans of Tomorrow") |
| ReelScribe id | none (pasted captions, saved in `raw/`) |
| Recorded | unknown |
| Processed | 2026-11-18 |

## Lesson
Two clips. **(1)** Build a small research team of agents (fundamentals and earnings, company news and X sentiment, a
technical agent, upcoming catalysts), paper-trade their output for a period and **develop a process** before trusting
it. **(2)** His one technical rule: only names above a **rising 200-day** moving average; look for the **50-day rate of
change to reset to near zero after being high**, which above the trend reads as "consolidating and wants to go
higher", aiming to ride a three-month trend. In the second clip the same reset is "the warning": holders who waited 50
days with good news and no price get frustrated and sell.

The two clips read the same signature opposite ways, and the only stated difference is the 200-day filter. That is the
one thing in the material worth testing, and the desk already tested the unfiltered version two days ago.

## Approach
- **Question**: the hold horizon comes first ("a three month basis"), then the filter, then the trigger.
- **Evidence**: paper-trade the agents' output "for a period of time", monitor positions against what they said.
- **Kill rule**: none stated.
- **Habit**: agents gather, the human decides; "ask AI how to build a good process".

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "Five agents... paper trade for a period of time. Develop a process." (JV) | method | **ON FILE**: `desk-analyst-pipeline` (RUNNING, forward from 2026-11-04): 11 analysts, risk desk, Head of Desk, scored daily against a within-day shuffle placebo; rule 1 of `plans/DESK_ANALYST_PIPELINE.md`: the LLM layers add context, never a signal. |
| 2 | "Above the 200 day moving average and the 200 day moving average is pointed upward" (JV) | trading (filter) | **PARTLY**: no 200-day-slope filter tested as such. The trend family: `trend-following-fx` NULL (multi-asset ~0.3 OOS); `direction-bar` B2 (12-month momentum) Brier skill negative vs climatology in 23 of 24 cells; the desk's own trend system Sharpe 0.10 since 2017 vs 0.49 before (`cot-trend-filter` side finding). Single-name history here is 3 years: untestable on names. |
| 3 | "Rate of change which just reset close to zero after being higher... above the 200 day... consolidating and wants to go higher" (JV) | trading (entry) | **ON FILE** (2026-11-18, `roc-stall-trend-filter` NULL: the reset above a rising SMA200 vs same-state uptrend controls +0.040 z [−0.063, +0.140], 666 events; a rise of the 0.15 bar ruled out; 83% of stall events were already above a rising 200-day). Parent: `roc-stall-50d-top20` UNDERPOWERED: a 50-session stall after a top-quintile run → next 20 sessions **+0.05 z [−0.05, +0.15]** (792 events, 30 markets, 2013–2026); `roc-stall-50d-top60` NULL (−0.004). Not weaker, and not detectably stronger. The 200-day condition was then tested as Q12 and found to add nothing. |
| 4 | "When that second derivative changes... people are getting frustrated... more vulnerable to selling" (JV) | mechanism + trading | **ON FILE**: `roc-accel-down-20` UNDERPOWERED, sign the other way (+0.07 z); `roc-stall-50d-topvol` NULL (a little calmer, −0.03). The one footprint: hard deceleration → next-20 realised vol +7% (C6, nominal, underpowered by the rule) and a BH lead of a **60-session bounce** (+0.14 z). The frustration mechanism is positions and psychology; the prereg says it cannot be seen in prices. |
| 5 | "Agent two will be on top of X... bull bear cases, sentiment" (JV) | method (input) | **UNTESTED / no data**: no social or news-sentiment feed on the desk. Nearest: `cb-tone-direction` NULL (statement tone vs next-day dollar); the EPU uncertainty indices are catalogued and never tested on direction. |
| 6 | Catalysts: "a dev day for Apple" (JV) | method (input) | **PARTLY**: the Event Response Book covers 76 scheduled macro families (size by family; direction a coin). Company catalysts are out of this desk's scope. |

## What we could learn
- **Paper-trade the pipeline before trusting it; the gatherers never decide.** ALREADY DO (`desk-analyst-pipeline`
  forward record, rule 1; the forecast ledger). Added to `RESEARCH_METHOD_LESSONS.md` as an already-do row.
- **Horizon before signal.** He names the three-month hold before the trigger. ALREADY DO (the horizon family in every
  prereg).
- **Watch the turn, not the level.** The second source for Alfonso Peccarelli's Pattern J in `HOW_THEY_THINK.md`, now
  on price rather than macro data. The desk's answer so far: the price version of that turn carries no forward return
  at 20 sessions on 30 markets, a small vol footprint, and a bounce lead at 60 sessions. DISAGREE on the warning
  reading, with numbers; the entry reading is the open variant.
- **Company-level inputs** (fundamentals, single-name news, catalysts) are absent here. Scope, not method: this is a
  macro and FX desk. Not a lesson.

## Research ideas
- **Q12, run 2026-11-18 → NULL** (`roc-stall-trend-filter`): the ROC_50 reset split by "above a rising 200-day" vs below, the filter Visser
  trades. No footprint on 30 macro markets; candidate only, the month after the reset runs ~5.5% calmer. The agenda stops carrying the stall.
- Not carded: the five-agent team (already running as `desk-analyst-pipeline`); the sentiment agent (no data).

## Quotes
- "Pick five names, and just paper trade for a period of time. Develop a process."
- "I only care about them if they're above the 200 day moving average and the 200 day moving average is pointed upward."
- "Rate of change which just reset close to zero after being higher. It's above the 200 day moving average, so it's consolidating and wants to go higher."
- "When that second derivative changes, to me, it's a very powerful thing because it means people are getting frustrated."
- "When you are long something for 50 days and the news is good and it hasn't gone up, you're more vulnerable to selling it."

## Attribution note
The 2026-11-16 pre-registration `forge/ROC_STALL_50D_PREREG.md` quoted clip 2 with the source marked unverified
("Crown Macro or Jessinskip"). It is Visser; amendment A2 records this.
