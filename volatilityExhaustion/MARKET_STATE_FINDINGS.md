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

## Tier 3 #4b — the reversal question, done right (`budget_reversal_test.py`)

The Tier 3 #4 write-up conflated two axes and wrongly said "continuation". Correcting
the record: #4 measured **range** (unsigned), which is direction-blind — "more range
follows" is true whether the day continues OR reverses hard (a hard reversal adds range
too). So #4 does NOT speak to reversal-vs-continuation. This test does, directly.

At each fresh session extreme, a symmetric two-barrier race (reverse θσ toward open vs
extend θσ), bucketed by **budget consumed** at that moment. Pooled FX, OOS:

| budget used | P(reversal) | n |
|---|---|---|
| 0–50% | 0.516 | 13,243 |
| 50–70% | 0.507 | 27,331 |
| 70–90% | 0.501 | 29,180 |
| **90–110%** | **0.518** | 24,400 |
| 110%+ | 0.519 | 54,836 |

**FLAT.** P(reversal) is ~0.50–0.52 at *every* budget level; the 90%+ bucket (0.518) is
indistinguishable from the 50–70% bucket (0.507), gradient +0.011 (noise). So "90% of
budget spent → expect a reversal" has **no edge** — the tiny universal fade lean (~52%,
the known weak FX exhaustion) is *constant*, not stronger when the budget is spent.

**The complete, corrected model:** budget consumption tells you a move is *coming*
(magnitude, #1 clustering) but **not which way** — neither "tighten stops, it's calming"
(false) nor "fade it, it'll reverse" (false, this test). Direction at a spent-budget
extreme is a coin flip. The reversal intuition survives in memory because spent-extreme
reversals are dramatic and, per #1, *large* — but continuations are ~equally frequent
and forgettable (survivorship).

## Tier 5 — does liquidity state improve the composite? (`tier5_liquidity.py`)

Tested the owner's proposal: two days with the same range/σ can be different markets by
how the move is financed. Only tick volume is available (mid candles → no spread/depth),
so this is the honest slice: Asia relative tick volume + within-session volume trend,
added to the composite. Pooled FX OOS:

| model | OOS AUC | Brier-skill |
|---|---|---|
| composite (regime+compr+vov) | 0.562 | +1.04% |
| liquidity only (relvol+trend) | 0.509 | −0.04% |
| composite + liquidity | 0.562 | +1.14% |

**NULL (partial test).** Tick-volume liquidity alone is worthless (AUC 0.509), and adding
it moves Brier-skill +0.10pp with AUC unchanged — noise. Caveats: OANDA tick volume is a
weak participation proxy (no true FX volume), and **spread / order-book depth are untested
(no data)** — the richer liquidity signals the owner named remain open. On the testable
slice, participation does not sharpen the expansion forecast.

## Tier 6 — widen the evidence: gold + 25 FX crosses (`tier6_gold_crosssection.py`)

Using the larger `VolRangeForecaster/data/m1` set (25 FX crosses + gold; still **no
equity indices** — the real MOP test remains blocked on data).

**A. Gold conviction-gating — the NQ lead did NOT replicate; it reversed.** Gold trends
(base OOS Sharpe **+1.13**), but gating **hurt** it (+1.13 → **+1.00**), and the
conditional edge is **backwards vs NQ**: gold's trend edge is *stronger* in spent/chaotic
states (**+2.69 bp/day**) than calm (**−1.36 bp**). So on the one other non-FX trending
asset available, the Tier-1 NQ result failed to generalise. With n=2 (NQ helps, gold
hurts), **the "volatility state modifies trend-following in trending assets" claim is not
supported** — the NQ result now looks instrument-specific, more likely noise than a law.
It can only be settled by the real multi-index test (SPX/DAX/FTSE/Nikkei/HSI), which this
sandbox can't run. **Downgraded from "the lead I'd fund" to "unconfirmed, failed its one
replication."**

**B. Asia-compression — much stronger cross-section.** Re-running Tier 2 across all 25 FX
crosses: compressed Asia → larger London+ extension holds OOS on **21/25 crosses**
(mean Δ +0.063σ; the 4 misses are mostly CHF crosses). Up from 5/6 majors — this is now a
**pervasive, robust** FX effect. The single most reliable finding in the whole study.

## Tier 7 — DAX daily: the NQ tie-breaker (`tier7_dax_conviction.py`)

No SPX/DAX/FTSE **M1** exists in the repo (R2/Drive, unreachable here), but `dax_raw.csv`
has 20y of daily DAX OHLC — and the conviction test runs on daily bars. So DAX is the
honest tie-breaker for the NQ lead.

**DAX rejects it, like gold.** DAX TSMOM is weak (full Sharpe +0.17), gating **hurt** OOS
(−0.11 → −0.29), and the conditional edge is **backwards vs NQ**: chaotic +3.50 bp beats
calm +2.89 bp. Tally across the 3 non-FX assets: **NQ echoes, gold reversed, DAX reversed
— 1/3, both rejections opposite-signed.** That is the signature of noise, not a law. The
NQ conviction-gating lead is **retired (dead, not merely unconfirmed)**: "volatility state
modifies trend-following in trending assets" is unsupported. (A proper SPX/FTSE M1 basket
could revisit, but the prior is now clearly negative.)

---

## Scoreboard

| Tier | Test | Verdict |
|---|---|---|
| 1a | mechanical vol-sizing | marginal help (mechanical, expected) |
| 1b | state-gating the trend edge | **FX null; NQ suggestive (+0.54→+0.64)** — lead, needs index breadth |
| 2 | compressed-Asia → London expansion | **PASS, 5/6 FX OOS** (magnitude) |
| 3 #4 | remaining-budget exits (range) | **NULL & reversed** — fuel-tank premise false |
| 3 #4b | reversal-vs-continuation by budget | **NULL** — P(reversal) flat ~0.51 at all budget levels |
| 3 #5 | vol continuity | modest real (+0.094), not novel |
| 3 #6 | cone calibration by regime | usable (39% vs 31% exceed) |
| 4 | compose survivors | modest real composite (AUC 0.562); **no Opportunity Index** |
| 5 | liquidity (tick volume) in composite | **NULL** (partial — no spread/depth data) |
| 6A | gold conviction-gating (NQ replication) | **FAILED to replicate** (reversed) |
| 6B | Asia-compression, 25 FX crosses | **PASS, 21/25 OOS** — the most robust finding |
| 7 | DAX conviction-gating (NQ tie-breaker) | **REJECTED** — NQ lead retired (1/3 indices, dead) |

**Where this leaves the project (post-Tier-6):** the lens is a **dispersion / expansion
state engine** ("budget" retired — the depletion metaphor is false) — magnitude-only,
honestly validated. It belongs on the sizing/targets/calibration side, exactly as
`CLAUDE.md` says ("the real edge is risk"). The strongest single result is **Asia
compression → London expansion (21/25 FX crosses OOS)**. The once-promising directional
lead — **index conviction-gating (NQ)** — **failed to replicate on gold** and is now
unconfirmed; only a true multi-index test (blocked here on data) can revive or bury it.
Three intuitions are now falsified and retired: **direction from consumption (FX)**, the
**intraday fuel-tank exit model**, and **"budget spent → reversal"** (flat ~0.51 at every
level). The honest headline stands: *the volatility forecast is a market-state /
dispersion model — it estimates the distribution of movement, not its direction.*
