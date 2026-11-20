# ladder-per-line — a separate σ model per line type, chosen on that line's own score; and the best OC forecast as a take-profit

**Pre-registered 2026-11-20, before any per-line or OC-chosen ladder was scored.**

| | |
|---|---|
| ID / ledger ids | `ladder-per-line` (Part A), `ladder-per-line-oc` (Part B1), `ladder-per-line-oc-tp` (Part B2) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-per-line` |
| Source | Jordan (a member of the C.OG group, not C.OG), DM to the owner 2026-11-20, paraphrased: find the best HL, OH and OL forecast, where each line type may end up on a different model and is judged on its own score (e.g. QLIKE). Then find the best OC forecast separately, perhaps as a take-profit. OH/OL tend to sit close to OC for some models, so don't build a model to trade the OC levels. |
| Instruments | NQ, GOLD, EURUSD. Parts A and B1 on CFD (OANDA mid M1) and futures (NT8). Part B2 on CFD only (bid/ask M1 exists for the CFDs only) |
| Window | Sessions 2016 → **2026-08-21** (lockbox untouched). Lines are walk-forward from 2018. Choosing a model needs at least one out-of-sample year, so the scored test years are **2019 → 2026-08** |
| Seed | `20261120`. B = 2000, 63-session blocks |
| Harness | `scripts/ladder-v2/ladder.py` (build + `walk_forward`). Rows are rebuilt for all three pilots into `analysis/output/ladder-per-line/build/<sym>/`, the code used for the rollout. NQ's banked rows came from the older pilot harness. Scoring is in `scripts/ladder-per-line/` |

## 1. Question

**Part A.** Each line type (HL, OH, OL) gets the σ model that forecasts it best, judged on that line's whole distribution and chosen on earlier years only. Does that ladder beat the one-model ladder, where one σ is chosen for all lines? Our mixing study (`ladder-mix-2020s`) chose per percentile, per regime and per 30-cell map, all on the tail-hit score. Three choices, one per line type, each on that line's own whole-distribution score, has not been tested.

**Part B1.** Does an OC model chosen on OC's own score beat the one-model ladder's OC lines? The race score never included OC. As context, how far is the OC p50 line from the OH/OL p50 line? Under a random walk the running maximum and |close − open| share one distribution, so they should be close.

**Part B2.** As Jordan suggests, use the chosen OC line as a take-profit. Fade the first touch of the per-line OH/OL p75 line and take profit at the same-side OC p50 line. Does that make money after costs, and does the OC level beat take-profits placed at other distances?

## 2. Lines

Every arm from the banked race (`arms_for(sym)`, main race) is walked forward per test year Y as in `ladder.walk_forward`:
- regressions are refit on data before Y
- GARCH uses the parameters fitted before Y
- width multipliers are fitted on all sessions before Y

This is done at **τ ∈ {10, 25, 50, 75, 90}** for each of **hl, oh, ol, oc** (% of the London-midnight open).

## 3. Scores (KPIs)

- **PRIMARY, per quantity q:** mean pinball loss over the five τ, in % of the open. It is a proper score for the whole distribution, rewarding calibration and sharpness together.
- **QLIKE (reported):** on the τ = 50 line, x/f − ln(x/f) − 1, over sessions with x > 0.
- **Regime guard (per quantity, and the race's 30-cell miss):** the mean |hit rate − target| over 5 σ-fifths × {p75, p90}. The fifths are cut on the live σ, as in the race.

## 4. Strategies (re-chosen each test year Y, using out-of-sample years 2018 … Y−1 only)

- **S1, one model:** the arm with the lowest PRIMARY summed over hl + oh + ol. This is the "one calc for all levels" approach.
- **SL, per line:** for each of hl, oh and ol separately, the arm with the lowest PRIMARY for that quantity.
- **SOC, per OC:** the arm with the lowest OC PRIMARY.
- **Reported only:** the banked fixed winner, and the live estimator (A0).

## 5. Part A rule

The loss is C = PRIMARY(hl) + PRIMARY(oh) + PRIMARY(ol). The test statistic is Δ = C(SL) − C(S1), relative to C(S1). It is computed per track, pooled over the three instruments (each instrument's sessions are resampled in 63-session blocks, and the instruments are summed), with a 90% CI.

- **VALIDATED** needs all three:
  - the CI upper bound is < 0 on both tracks
  - the CI upper bound is < 0 in both halves (2019–22, 2023–26) on both tracks
  - SL's 30-cell regime miss is ≤ S1's + 0.5pp on both tracks
- **NULL:** on both tracks, the point Δ ≥ 0 and the CI lower bound > −0.5%. That rules out a gain of 0.5% or more.
- **UNDERPOWERED:** otherwise.
- Reported alongside: Δ per quantity and per instrument, the picks per year, and how often the picks change.

## 6. Part B1 rule

Δ_OC = PRIMARY_oc(SOC) − PRIMARY_oc(S1), relative, with the same bootstrap and the same VALIDATED / NULL / UNDERPOWERED rules as Part A (both tracks, both halves; the guard here is the OC regime miss ≤ S1's + 0.5pp).

Context, reported: the median over sessions of |OC p50 − OH p50| and |OC p50 − OL p50| for SOC versus SL, in σ.

## 7. Part B2 rule (CFD, bid/ask M1 `data/m1_bidask/`, sessions with ≥ 600 bars)

The entry and exit mechanics are `scripts/trade-at-lines/score.py`'s FADE-L, unchanged except for the target:
- **Entry:** after the first touch of the SL OH p75 line, a short limit at the line, filled once the bid trades 1e-5 above it. Mirrored for OL p75 (long).
- **Stop:** the same-side p90 line (SL) + 0.05σ.
- **Take-profit:** the same-side OC p50 line from SOC (open ± OC p50).
- **Skip rule:** if that level isn't strictly between the open and the entry, there is no trade; the skips are counted.
- **Exit:** 22:00 London at the bid/ask close if neither the stop nor the take-profit has filled.
- **R:** |entry − stop|. Results are net of the bid/ask spread; gross is on mid.
- **Placebo take-profits:** entry ∓ 0.7d and ∓ 1.3d, where d is the real take-profit distance.

| Verdict | Rule |
|---|---|
| **VALIDATED** | Pooled net mean R has 90% CI lower > 0, in both halves, and the real minus placebo net R has CI lower > 0 |
| **NULL** | Pooled net mean R has CI upper < +0.05R |
| **UNDERPOWERED** | Otherwise |

Reported: the hit rate of the take-profit against the driftless benchmark s / (s + d), where s is the stop distance.

## 8. Positive controls (run first; nothing is scored if one fails)

- **PC-A:** add a planted arm ORACLE whose OH lines use σ_O = √(σ_S1 × OH_realised / median ratio). It is partly informed by the day's true OH and applies to oh only; its other lines copy S1.
  - Pass: SL picks ORACLE for oh in ≥ 7 of 8 test years, and Δ has CI upper < 0.
  - ORACLE is then removed.
- **PC-B2:** over all real and placebo trades, the mid-price take-profit hit rate must sit within 3pp of the driftless benchmark averaged over the same trades. This checks the fill code and the barrier geometry; real lines may differ, but the pool shouldn't be far off.

## 9. Multiplicity and lessons applied

- There are three pre-specified verdicts, each on its own rule.
- Lessons applied:
  - choose on prior out-of-sample years only, and report how unstable the picks are (`ladder-mix-2020s`)
  - placebo levels at shifted distances, and fills on real bid/ask (`trade-at-lines`)
  - a winner is never chosen on the test year

## 10. What it changes

- **A VALIDATED:** the shadow ladder takes per-line σ models on the next rollout pass; the one-model ladder otherwise stays.
- **B1 VALIDATED:** the OC lines get their own model.
- **B2 VALIDATED:** the OC take-profit goes to the exhaustion export as a target, and the trade gets its own forward record.
- **NULL or UNDERPOWERED:** nothing changes, and the result is decomposed per quantity and per instrument.
