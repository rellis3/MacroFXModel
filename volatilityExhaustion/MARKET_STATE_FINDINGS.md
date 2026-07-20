# Market-state research — Tiers 1–4 (volatility budget as *state*, not signal)

Ran overnight on the offline M1 cache (6 FX majors + NQ, 2016→2026). The question:
after the earlier study showed range-consumption can't be *monetised as a direction
signal*, does it earn its keep as **state information** — sizing, conviction, expansion
forecasting? Every test is causal, time-ordered IS/OOS (60/40), pre-registered.

**Reproduction validated first:** the TSMOM reproduction (`budget_research_lib.py`,
mirrors `js/trendFollowEngine.js`) gives NQ Sharpe **+0.56** (the expected sign for a
trending index), so the numbers below are the strategy's, not a bug.

**One-line takeaway:** the budget lens is real as a **magnitude / range-budget state**
engine (weak-to-modest, OOS-validated), useless as a **direction** signal in FX, and
the intraday **"fuel tank empties" premise is outright false**. The one directional
lead is on **indices**, not FX.

---

## Tier 1 — does market-state improve the trend edge? (`tier1_state_conditioning.py`)

Split into the two honest claims:

**(a) Mechanical vol-sizing** — marginal help, as expected (it's just vol targeting).
Basket OOS Sharpe −0.44 (fixed) → −0.41 (inverse-vol), 4/6 pairs. Mechanical, not "state".

**(b) State-gating** (down-weight the position when the prior day was spent/chaotic —
exceeded its 75th OR efficiency < 0.35):
- **FX: NULL.** The trend signal's edge is *identical* in calm vs spent/chaotic states
  (IS signal-aligned return **−0.49 vs −0.50 bp/day**). Nothing to gate. Gating the
  basket did **not** beat inverse-vol OOS (−0.45 vs −0.41).
- **NQ (index): SUGGESTIVE and correctly signed.** Where a real trend edge exists,
  the same gate lifts OOS Sharpe **+0.54 → +0.64**, and the IS conditional edge is
  starkly split: **calm +9.4 bp/day vs spent/chaotic −3.2 bp/day**.

*Honest read:* the owner's conviction-modifier intuition ("the 72% long isn't 72% when
budget is 96%") is **null for FX** but **holds on the one index** — i.e. it works where
trend-following itself works. FX-majors-only TSMOM is flat-to-negative this decade
(a real, documented fact), so there's barely an FX edge to modulate. This is a genuine
**lead, not a result**: n=1 index. It needs the full diversified multi-index/asset
basket to confirm — which this sandbox's 7 caches can't provide. That is the honest
next step, not more FX work.

## Tier 2 — time-adjusted consumption (`tier2_time_adjusted.py`) — **PASS**

The owner's own example, tested leakage-free (Asia range = pre-08:00 London bars;
London+ extension = post-08:00 bars — disjoint windows): does a **compressed Asia
session predict a larger London+ expansion**?

**Yes — holds OOS on 5/6 FX majors.** Compressed-tercile vs stretched-tercile London+
extension (σ-units, OOS): EURUSD 1.06 vs 0.95, AUD 0.85 vs 0.63, NZD 0.84 vs 0.68,
GBP 1.04 vs 0.94, CAD 1.10 vs 1.00 (CHF the lone miss). Robust to the σ-normalisation
artifact (which would bias the other way). **Magnitude, not direction** — but real, and
it's the sharpest piece: a quiet Asia means the day's move hasn't been spent, because
the active sessions (London/NY) are still to come.

## Tier 3 — three premises (`tier3_budget_vov_cone.py`)

**#4 remaining-budget exits — NULL, and REVERSED (the important one).** The premise
"most of the range spent → less volatility remains" is **false**. High consumption by
noon predicts *higher* afternoon range (e.g. EURUSD 1.36σ vs 1.26σ), **0/6** the other
way. Intraday volatility **clusters** — an active day stays active. This **refutes the
"70–90% used → tighten stops / 90%+ → expect exhaustion" state model**: the fuel-tank
metaphor is wrong. The forecast band is a *distribution the day samples from*, not a
tank that empties.

**#5 vol continuity — modest real persistence.** lag-1 corr(realised/forecast H-L) =
**+0.094 OOS**, all 6 pairs positive. Vol clusters at the realised/forecast level —
confirmed, unexciting, not novel (GARCH/HAR territory; the repo already found faster-σ
sub-cost). A minor band-calibration refinement at best.

**#6 cone calibration — usable.** Expansion-lean days (regime rule) exceed the 75th at
**39% vs 31%** for contained days (target 25%) — so widening the band on lean days
improves per-day calibration. Confirms the shipped daytype regime, magnitude-only.

## Tier 4 — compose the survivors (`tier4_state_composite.py`)

Composed **only** the validated magnitude pieces (expansion regime + Asia compression +
vol continuity) into a **London-open expansion forecast** — "how much room is left in
today's move?". Deliberately **excluded** the non-survivors (directional conviction /
"Opportunity Index"; remaining-budget exits) so this is not a folklore blend.

Pooled-FX OOS: regime 0.533 / compression 0.549 / vov 0.509 / **all three 0.562**,
Brier-skill **+1.04%** — the composite beats the best single component (+0.48%). Real
but **modest**. It feeds sizing / target width / breakout-vs-fade posture — **not**
direction.

**No "Opportunity Index" was built.** There is no evidence to compose a *directional*
capital-deployment score for FX; doing so would be exactly the confluence-on-sand trap.
The composite here is honest because every input earned its place OOS — and it's a
range-budget forecaster, which is what the evidence supports.

---

## Scoreboard

| Tier | Test | Verdict |
|---|---|---|
| 1a | mechanical vol-sizing | marginal help (mechanical, expected) |
| 1b | state-gating the trend edge | **FX null; NQ suggestive (+0.54→+0.64)** — lead, needs index breadth |
| 2 | compressed-Asia → London expansion | **PASS, 5/6 FX OOS** (magnitude) |
| 3 #4 | remaining-budget exits | **NULL & reversed** — fuel-tank premise false |
| 3 #5 | vol continuity | modest real (+0.094), not novel |
| 3 #6 | cone calibration by regime | usable (39% vs 31% exceed) |
| 4 | compose survivors | modest real composite (AUC 0.562); **no Opportunity Index** |

**Where this leaves the project:** the budget lens is a **range-budget / expansion state
engine** — weak-to-modest, honestly validated, magnitude-only. It belongs on the
sizing/targets/calibration side, exactly as `CLAUDE.md` says ("the real edge is risk").
The single directional lead worth real research time is **index conviction-gating**
(Tier 1 NQ), which needs the full diversified basket to confirm. Two intuitions are now
falsified and should be retired: **direction from consumption (FX)** and the **intraday
fuel-tank exit model**.
