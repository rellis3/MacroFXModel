# vwap-stretch-line-touch: when NQ touches a v3 p75/p90 line while stretched ≥ 1.5σ from VWAP, does fading it pay, beyond the same touch unstretched and beyond stretch at a non-forecast line?

**Pre-registered 2026-11-02, before any outcome of this rule was computed.**

| | |
|---|---|
| ID / ledger id | `vwap-stretch-line-touch` |
| Branch | `main` (temp worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `vwap-stretch-line-touch` |
| Data | NQ = OANDA `NAS100_USD` M1, tick volume. **Discovery:** 2020-08-24 → 2026-08-20, walk-forward v3 SI lines (`vf3_stage_b.build`, 5-session embargo; 1,493 sessions). **Replication:** 2016-09-12 → 2020-08-14, backcast SI lines (`rule-a-pre2020` `backcast_lines()`). Lockbox not read. |
| Seed | `20261102` |
| Uncertainty | session moving-block bootstrap, block 21, B = 2000; placebo 1,000 same-quarter shuffles |
| Scripts / outputs | `scripts/vwap-stretch-line-touch/` → `analysis/output/vwap-stretch-line-touch/` |
| Harness | own script |

## 1. Claim

The owner's idea: "z-score > 1.5, reversion may happen; VWAP standard deviations."

At the first touch of the v3 O→H p75/p90 line (or O→L), if price is stretched ≥ 1.5 session-VWAP standard deviations in the touch direction, fading the touch makes money net of cost. It does better than:
- fading the same line touch when price is not stretched; and
- fading a stretched touch of a line of the same size that carries no forecast information.

## 2. Why this is not settled

- **The parts were tested on their own:**
  - `vwap-extension-fade` NULL: positive gross, 3–8× under cost.
  - `daily-band-fade` NULL.
  - `line-touch-wide-scan`: stretch into a line, gross +0.19R, fails net.
  - Fading v3/PROD line touches held to 21:55 lost (exploratory, today).
- **The combination** (VWAP stretch at a forecast-line touch) is listed as never tested in `analysis/output/day-reconstruction/SYNTHESIS.md`, gap row 7.
- **Prior exposure:**
  - The unconditional touch-fade outcomes on the discovery window were seen today (`nq-v3-lines-explore`).
  - No VWAP-conditioned outcome has been computed.

## 3. Definitions (frozen)

- **Session VWAP and bands, from 00:00 London:**
  - Typical price tp = (h + l + c)/3 per M1 bar, weighted by tick volume (bars with 0 volume get weight 1).
  - VWAP_k = Σ v·tp / Σ v over bars ≤ k.
  - σ_k = sqrt(Σ v·tp² / Σ v − VWAP_k²): the standard VWAP band SD.
  - z is measured at the touch: z = (line price − VWAP_{k−1}) / σ_{k−1}, using bars before the touch bar, so there is no lookahead.
  - At least 30 bars are needed; touches earlier than that are excluded and counted.
- **Event:** the first touch of the upper or lower SI line at rung r ∈ {p75, p90}. The first-touched side only; a same-bar touch of both sides is skipped.
- **Stretched:** z ≥ +1.5 at an upper touch, or z ≤ −1.5 at a lower touch.
- **Trade:**
  - **Fade:** short at an upper touch, long at a lower touch. The fill is at the line, or at the bar open if it opens beyond.
  - **Primary exit:** 60 minutes after entry, or the close of the last bar before 21:55 London if earlier.
  - **Secondary exit:** 21:55.
  - No stop.
  - Cost 0.0068% round trip, with 2× sensitivity.
- **Controls:**
  - **U (unstretched):** the same touches with |z| < 1.5, or z on the wrong side.
  - **ATR lines:** k × ATR20, same size as the SI line on average, same z rule.
  - **Placebo:** SI distances shuffled within calendar quarter, same z rule, 1,000 shuffles.

## 4. Gate (per rung, p75 and p90; Holm across the two for G1)

- **G1:** stretched-fade net mean > 0, with Holm-adjusted bootstrap p < 0.05. Discovery window.
- **G2:** stretched-fade − unstretched-fade > 0, CI lower bound > 0. Discovery.
- **G3:** stretched-fade with real lines ≥ the 95th percentile of the placebo (stretched rule, shuffled lines). Discovery.
- **G4:** the replication (2016–20) stretched-fade net mean has the same sign as discovery and its CI lower bound > −0.02%.

Verdicts:
- **VALIDATED** = G1–G4 all hold for a rung.
- **NULL:**
  - the stretched-fade CI upper bound < +0.02% in discovery (net); or
  - G2's point estimate ≤ 0 with its CI upper bound < +0.03%.
- **UNDERPOWERED:** otherwise. In particular, any rung with fewer than 100 stretched events in discovery.

**Mirror.** "Follow the stretched touch" = −fade − 2× cost, reported. If follow is what pays, that is a separate candidate, not this claim.

## 5. Power

- **Expected counts:**
  - First touches: about 770 at p75 and about 290 at p90 in discovery.
  - The stretched share is unknown, so the count is reported first in RESULTS.
  - At p90, fewer than 100 stretched events is likely → UNDERPOWERED by rule.
- **MDE:**
  - 60-minute per-trade SD is about 0.35–0.5%.
  - With n = 300 the SE is about 0.025%, so the MDE is about 0.07%.
  - That is roughly 10× the cost: enough to detect a tradeable effect, not a marginal one.

## 6. Multiplicity

- Two scored rungs. Holm for G1; G2–G4 are conjunctive.
- Secondary items are descriptive only:
  - the 21:55 exit;
  - 2× cost;
  - z ≥ 2.0;
  - the up/down split.

## 7. Not tested

- Other instruments.
- PROD lines.
- Stops.
- z on other bands (Bollinger etc.).
- The lockbox.

## Amendments

### A1 — 2026-11-02 — PRE-RESULTS
The count pass (`counts.json`) shows that z ≥ 1.5 holds at 98.2% of p75 first touches (756/770) and 94.8% at p90 (276/291) in discovery, and similarly in replication. Reaching a p75/p90 line means price is already far from session VWAP, so the literal rule separates nothing and leaves about 14 unstretched touches.

The distribution of signed z at the touch (discovery, no outcomes), in percentiles 10/33/50/67/90:
- p75: 1.76 / 2.23 / 2.46 / 2.74 / 3.53
- p90: 1.60 / 1.93 / 2.12 / 2.36 / 3.08

Changes:
- **Stretched** = the top tercile of signed z: p75 z ≥ 2.74, p90 z ≥ 2.36.
- **Unstretched** = the bottom tercile: p75 z ≤ 2.23, p90 z ≤ 1.93.
- The thresholds are fixed from discovery and applied unchanged to the replication and to the ATR and placebo lines.
- G1–G4 and the verdict rules are unchanged, read with these definitions; G2 = top tercile − bottom tercile.
- The literal z ≥ 1.5 fade (in effect all touches) is reported descriptively.

No outcome had been computed.

## RESULTS

**UNDERPOWERED by the frozen rule. The reversion idea is not supported** (see `analysis/output/vwap-stretch-line-touch/RESULTS.md`).
- z ≥ 1.5 holds at 95–98% of touches.
- Top − bottom tercile fade is negative in all four cells; discovery p90 −0.154 [−0.339, −0.020].
- G1–G4 fail.
