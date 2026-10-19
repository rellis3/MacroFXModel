# ai-crack-metals — does the AI trade cracking (semis falling against the index) bid gold and silver?

**Pre-registered 2026-10-19, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `ai-crack-metals` (one entry per scored question: `ai-crack-metals` for gold, `ai-crack-metals-silver` for silver) |
| Branch | `main` (shared checkout; pushed straight to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ai-crack-metals` |
| Data | Yahoo adjusted daily closes: `SMH`, `SPY` (the setup), `GLD`, `SLV` (the outcomes). Shared spine **2006-04-28 → 2026-08-21** (SLV's first print → the lockbox cut), 5,111 sessions. ETFs rather than `GC=F`/`SI=F` so no roll artefacts sit in a 60-session return. The lockbox formally guards layers 3/5/6 and this is daily cross-asset data, but cutting at 2026-08-21 is the simple rule and costs 40 sessions. |
| Seed | `20261019` |
| Uncertainty | date-block bootstrap on the difference from control, block 20 sessions (= the primary horizon), B = 2000 |
| Scripts / outputs | `scripts/ai-crack-metals/` → `analysis/output/ai-crack-metals/` |
| Harness | own script (same design as `analysis/breadth_tilt_semis_study.mjs`, whose setup definition this reuses verbatim; `study.mjs` only reads `MD files/`, and this follows the `forge/` layout) |

## 1. The claim (required)

Nicholas Crown, clip of 2026-10-16 (`MD files/CROWN_WATCH.md`, "What the hell is going on"):

> *"Metals are starting to get more and more interesting here, especially as the AI trade
> cracks. **You need that to crack for metals to continue to go up.** Long dated stuff in
> metals looks interesting to us."*

Stated as something testable: **when the AI trade cracks — semiconductors fall hard against
the index — gold and silver subsequently outperform their ordinary drift.** The mechanism
implied is a rotation: money leaving the crowded AI sleeve finds its way into metals.

## 2. Why it is not already settled (required)

- `which-gold` (CONTEXT, 2026-09-21): gold's drivers decompose into real yields, the dollar and a
  reserve residual; "no single gold" 45% of windows. It never asks whether an **equity sector
  rotation** is a gold driver. Nothing in the ledger does.
- `fear-gold` (NULL): a VIX spike brings no gold bid on average, and gold lags a month on. That is
  the *fear* leg. A semis crack is not a VIX spike — SMH can fall 15% against SPY with the VIX
  at 16 — so this is a different setup, not that null in new clothes.
- `breadth-tilt-semis` (NULL, 85 episodes): the same SMH/SPY machinery, asked the other way round
  (does breadth narrowing predict semis beating SPY). It establishes the setup definition used
  here and says nothing about metals.
- `rotation-extreme` (NULL): Nasdaq vs Russell relative extremes and *index range*. Not metals.
- `us-leg-same-day-link` (CONTEXT): rates → gold in the same hour. Same-bar, not this.

So the question is genuinely open on this desk, and the owner declined to assume a prior on
2026-10-16 ("prior unstated — the desk has no evidence either way").

## 3. Definitions, fixed in advance (required)

- **The setup (CRACK)** — the 20-session change in the SMH/SPY ratio at or below the **10th
  percentile of its trailing 504 sessions** (rolling, so the threshold is knowable at the time).
  This is the pre-registered formalisation `breadth-tilt-semis` used for "the AI trade", copied
  rather than re-chosen.
- **THE MIRROR (RIP)** — the same change at or above the 90th percentile: the AI trade ripping.
- **Knowable when?** — the 20-session change completes at the close of session D. Outcomes are
  measured from the **close of D** to the close of D+h (daily data; D+1's open is the first
  tradable price and sits a few hours after the close that defines the setup — no same-bar
  entry in the sense that nothing from D+1 onward is used to define D).
- **The outcome** — `GLD` total return and `SLV` total return over the next **20** sessions
  (primary) and **60** sessions (descriptive), in percent.
- **Instruments** — gold (`GLD`) and silver (`SLV`), scored **separately**, never a basket.
  Silver is on the register because the clip's own taxonomy puts it "somewhere in between"
  monetary and industrial, and an AI crack is a growth scare that should hit the industrial leg.
- **The control** — every session at least 20 sessions away from any CRACK setup: the
  unconditional metal return. Excess = setup mean − control mean. The MIRROR is scored against
  the same control.
- **De-clustering** — 20 sessions between setups within an arm. A crack persists for weeks;
  without this one episode contributes dozens of overlapping "events".
- **Uncertainty** — block bootstrap on the difference from control, block 20, B = 2000, seed
  20261019; 95% percentile interval.
- **Sample / stability** — 2006-04-28 → 2026-08-21, split at **2016-06-24** (the spine's midpoint
  by session count) for the both-halves gate. **MIN_EVENTS = 20** per arm; below it the cell is
  UNDERPOWERED, not null.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | After a CRACK, is GLD's 20-session return higher than its unconditional 20-session return? | **Null.** Gold's drivers here are real yields and the dollar (`which-gold`); a semis crack reaches gold only through the rates leg, if at all, and `fear-gold` found the fear leg empty. Expected excess near zero, interval spanning it. |
| b | After a CRACK, is SLV's 20-session return higher than unconditional? | **Null, leaning negative.** A crack in the growth trade is a growth scare; silver's industrial leg argues for weakness, its monetary leg for nothing. |
| c | **THE GATE** (per scored cell) — the excess clears zero with the 95% interval (lower bound > 0), is positive in **both halves**, and **THE MIRROR** (RIP) does not produce an excess of the same sign reaching half its size. Conjunctive. | **Expect both cells to fail at the first clause.** |
| d | Descriptive, not scored — the 60-session excess for both metals, both arms. | No expectation written; reported with intervals only. |

## 5. Power — what this design can and cannot find (required)

Control-sample numbers only (SD of unconditional h-session returns on the shared spine to
2026-08-21; planned de-clustered setup count from the SMH/SPY ratio alone — no outcome touched):

| Cell | Planned n | Outcome SD (control) | Design effect | **MDE** (80% power, Holm α on 2 cells ≈ 0.025 → 0.05 for the smaller p) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| GLD 20s excess | 61 vs ~4,900 | 4.88% | 1 (de-clustered at the horizon) | **≈ 1.8%** (α 0.05) · ≈ 2.0% (α 0.025) | **2.0%** (≈ 0.4 SD, the size a metals allocation would notice over a month) | **POWERED** (at the edge) |
| SLV 20s excess | 61 vs ~4,900 | 9.36% | 1 | **≈ 3.4%** (α 0.05) · ≈ 3.7% (α 0.025) | **3.5%** (same 0.4 SD) | **POWERED** (at the edge) |
| GLD 60s excess | 61 | 8.11% | ≈ 3 (60-session windows overlap under 20-session de-clustering) | ≈ 5.0% | — | descriptive only |
| SLV 60s excess | 61 | 16.77% | ≈ 3 | ≈ 10.5% | — | descriptive only |

`mdeMeanDiff({ sd: 4.88, n1: 61, n2: 4900 })` = 1.76; `{ sd: 9.36, … }` = 3.37. Mirror arm: 70
planned setups, same SDs — a hair better powered than the crack arm. Both scored cells sit at
the edge of the pass bar, so if either comes back **inside** the bar with an interval that still
includes it, the word is UNDERPOWERED, not NULL.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells**: 2 — GLD 20s excess, SLV 20s excess. Holm at α = 0.05 across the two
  (`pFromCI` on the bootstrap interval, then `holm`). The both-halves and mirror clauses are
  conjunctive and need no further correction.
- **Descriptive cells**: the two 60s cells, the mirror arm's own excess, and by-year counts.
  Reported with intervals, no pass/fail weight.
- **Variants**: none. One setup definition (copied), one control, two horizons (one scored).
  If the result tempts a variant (a 10-session change, a 5th percentile, SOX instead of SMH),
  that is a new pre-registration.
- **Promotion bar**: nothing here sizes a position. A `validated` would be research-only until
  a forward record or |t| ≥ 3.

## 7. What this does NOT test (required)

- **Direction of metals in general**, or whether gold is "going up". Only the excess after a
  crack against the ordinary drift.
- **The mechanism.** A positive result would be consistent with rotation and equally with a
  shared driver (a rates fall that both cracks semis and bids gold). Nothing here separates them;
  `which-gold`'s real-yield leg would be the next cut.
- **Crown's "long dated stuff"** — options structures, not spot.
- **Costs, capacity, or anything intraday.**
- **Anything after 2026-08-21** (the lockbox cut), including the live crack of October 2026 that
  prompted the clip. That episode is the first forward observation, not evidence.

## 8. What each verdict changes (required)

- **Validated (a or b)** → ledger entry; the `claim-breadth-narrow` / `claim-semis-tilt` rows'
  look-for text on the watch register gains a line ("after a semis crack, gold ran +x% over the
  ordinary month on n setups"); a candidate register row `watch-ai-crack` (SMH/SPY bottom decile →
  metals) with the outcome as its base. Still never a direction call on metals from the clip.
- **Null** → ledger entry; `CROWN_WATCH.md`'s open-candidate line is struck with the id; the
  2026-10-16 entry gets a one-line resolution; nothing on any page changes, because no page says
  it today.
- **Underpowered** → ledger entry as such; the fix is a longer metals series (`GC=F` back to 2000
  adds ~6 years but brings roll artefacts, so it would need its own prereg stating how rolls are
  handled), not a looser gate.
