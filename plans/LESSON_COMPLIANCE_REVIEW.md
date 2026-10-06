# Lesson compliance review — are we following Lessons 1–3?

Written 2026-10-06 after re-reading the three transcribed lessons in full against what has been built
(plans/FORECASTER_SYSTEM_BLUEPRINT.md). ✓ followed · ◐ partly · ✗ not yet. Each gap has an action.

## Lesson 3 — A system built in layers (the lesson that started this)

| Instruction in the lesson | Status | Evidence / gap |
|---|---|---|
| Separate the informational question (what can be forecast) from the decisional one (what to hold) | ✓ | Layers 3–5 forecast; layers 6–7 decide; no layer mixes the two |
| Give each layer one job and **specify what passes between layers** | ◐ | Jobs are clear; the interfaces (exact outputs one layer hands the next) are implicit in code, not written down. **Action A1** |
| Develop, test and replace each layer without disturbing the others; change one layer at a time | ✓ | Every candidate runs side by side; nothing live replaced |
| Test each layer against its own standard: forecasts vs outcomes, construction by how much forecast value survives into positions, management under stress | ◐ | Forecast layers scored against outcomes (3, 5, 6) ✓. No construction layer exists yet, so the transfer coefficient is unmeasured; stress behaviour not examined. Waits on a direction / construction layer (later lessons) |
| Fundamental law IR ≈ TC · IC · √BR: skill, breadth and implementation are separable | ◐ | Skill is measured as calibration and Brier/pinball, not as an IC; breadth (independent bets a year) never counted. **Action A2** |
| Direction is close to unpredictable; volatility is what to forecast | ✓ | Layer 4: real lines race like control lines in 314/314 cells; layers 3 and 5 forecast distance only |
| **Measure clustering on the data: autocorrelation of returns vs absolute returns, persistence α+β, half-life of a shock** | ✗ | The lesson's central demonstration (§02) was never run on our own instruments; we jumped straight to forecasters. **Action A3** |
| Jumps: measure them; excess kurtosis falls with horizon; jump risk passes through stops; size for both | ◐ | Stop-risk map (layer 7) measures gap-through ✓; jump share exists in older research (Phase 12) but not in this build; kurtosis-by-horizon not measured; the sizing rule does not yet use loss-given-stop. **Actions A3, A4** |
| Meta-labelling: a secondary model learns when a **primary model's** decisions are right | ◐ | Layer 6 labels layer 5's reach calls, because no directional primary exists. A documented deviation; the framework is ready for a primary model when a lesson supplies one |

## Lesson 1 — One path among many (rules for every layer)

| Instruction | Status | Evidence / gap |
|---|---|---|
| Every statistic is one draw: report its sampling distribution | ✓ | Date-clustered SEs, bootstrap CIs, both-halves rule in every layer |
| Regimes change the process: separate variation within a regime from across regimes | ✓ | Regime splits in layers 3–6; halves 2016–20 / 2021–26 |
| Shape changes with horizon (skew ÷ √h, kurtosis ÷ h) | ◐ | Daily horizon only; weekly/monthly ladders untested. **Action A3** (kurtosis by horizon) |
| Sharpe SE with skew/kurtosis; Pr(loss) by horizon; bootstrap paths | ✓ | forge/evaltools.py, tested on the lesson's own numbers |
| Lo's annualisation correction η(q); Bayesian shrinkage of a Sharpe | ✗ | Not in the toolkit. **Action A5** |
| Ensemble vs time average: volatility drag μ − σ²/2, Kelly μ/σ² | ✗ | Not yet relevant (no return stream), belongs to layer 7 once a direction exists. Noted |
| **Institutional check 01 — point-in-time data, plus "delay every input by a further day and confirm the result does not depend on exact alignment"** | ◐ | Causality built in (as-of-before joins, NY-close bars, train-only fits) ✓; the one-day-delay robustness check never run. **Action A6** |
| Check 02 — in-sample / out-of-sample | ✓ | Every layer: train < 2025-09-05, test after |
| **Check 03 — holdout examined once, then a lockbox protocol limiting how often forward data is examined** | ✗ | **The 2025-09 → 2026-08 test year has been scored repeatedly** (ladder candidates 1–4, remaining-travel variants 1–3, confidence) — it has become a research sample, not a holdout. The shadow screens are viewed freely. **Action A7 (most important)** |
| Check 04 — purged time-series cross-validation | — | Not used (single split); acceptable for now |
| Check 05 — multiple testing priced (deflated Sharpe, expected best of N) | ◐ | Every variant logged ✓; but choosing the best of 4 ladder candidates or 5 travel models on the same test year was never deflated. **Action A8** |
| Check 06 — significance and precision | ✓ | CIs and z-scores throughout |
| **Check 07 — parameter stability (a plateau, not a peak)** | ✗ | HAR window (800 bars), checkpoint grid, width multipliers, the 0.85/1.15 regime cut-offs never perturbed. **Action A9** |
| Check 08 — path robustness: bootstrap, permutation, placebo | ✓ | Control-line placebo in layer 4; clustered resampling |
| Check 09 — regimes and stress | ◐ | Regime splits ✓; worst periods (2020, 2022) not examined separately. Folded into A9 |
| Check 10 — forward evidence with monitoring rules | ◐ | Shadow screens collect forward data ✓; no written monitoring rule (what result, after how many sessions, triggers what). Part of A7 |
| Check 11 — costs and capacity | — | No trading layer yet |

## Lesson 2 — Research has no timetable

| Instruction | Status | Evidence / gap |
|---|---|---|
| Log every direction, configuration and outcome | ✓ | Variant tables in every pre-registration, nulls kept |
| Count effective independent trials; expected best of N; false-discovery arithmetic | ◐ | Counted per layer, never summed into a programme-level FDR. **Action A8** |
| Independent confirmation (a one-shot holdout) is what turns a pass into evidence | ✗ | Same as check 03. **Action A7** |
| Expect most directions to fail | ✓ | Recorded as such: layer 4 null, layer 5/6 near-misses |

## Verdict

**On track in direction, behind on validation discipline.** The architecture follows Lesson 3 closely, and the
results agree with it (volatility forecastable, direction not, jumps matter for stops). The main drift is from
Lesson 1's institutional process: the test year has been reused across many variants, there is no locked holdout,
no parameter-stability check, no one-day-delay check, and Lesson 3's own clustering measurements were skipped.

## Actions (in priority order)

| # | Action | Lesson |
|---|---|---|
| A7 | **Lockbox**: declare the test year "used". Make the next unseen span the one-shot holdout — M1 from 2026-08-22 onward (not yet in the local cache) plus the shadow screens' forward data — fix the models now, write when and how often it may be examined, then examine once | L1 check 03/10, L2 |
| A3 | **Stylized facts on our data**: per instrument, ACF of returns vs absolute returns (lags 1–60), GARCH(1,1) persistence and half-life, excess kurtosis at 1 day / 1 week / 1 month, jump share of variance | L3 §02–03, L1 |
| A9 | **Parameter stability**: perturb the HAR window (400–1200 bars), regime cut-offs, checkpoint grid and widths; confirm a plateau, and check worst periods separately | L1 check 07/09 |
| A6 | **One-day-delay check**: lag every input one more day; the layer-3/5 results must barely move | L1 check 01 |
| A8 | **Price the search**: total variants per layer, expected best-of-N, deflate the "preferred" choices | L1 check 05, L2 §05 |
| A1 | **Layer interfaces**: write the exact output each layer hands the next | L3 §01 |
| A2 | **Fundamental-law framing**: express each forecast layer's skill as an IC and count breadth | L3 §01 |
| A4 | **Sizing uses loss-given-stop**: feed the stop-risk map into the layer-7 sizing rule | L3 §03 |
| A5 | **Toolkit additions**: Lo's η(q), Bayesian Sharpe shrinkage, FDR and likelihood-ratio arithmetic | L1 §03, L2 §05 |

## Progress (2026-10-06)

| action | state |
|---|---|
| A7 lockbox | **done** — forge/LOCKBOX_PROTOCOL.md, forge/lockbox_manifest.json (13 files hashed), `python -m forge.lockbox_check` |
| A3 stylized facts | **done** — plans/STYLIZED_FACTS.md |
| A5 toolkit | **done** — Lo η(q), shrinkage, FDR, posterior after passes, best-of-N; 24 tests reproduce L1/L2 numbers |
| A1 interfaces | **done** — plans/LAYER_INTERFACES.md |
| A4 sizing uses loss-given-stop | **done** — forge/sizing.py, plans/SIZING_RULE.md |
| A9 / A6 robustness | **done** — plans/ROBUSTNESS.md: plateaus pass, one-day delay pass; found own-σ regime buckets biased → neutral buckets; layer-3 gap smaller (0.2–0.7pp) |
| A8 price the search | **done** — plans/SEARCH_BREADTH.md: HAR > live after best-of-4; HAR vs IV-adjusted indistinguishable |
| A2 IC / breadth | **done** — ICs HAR 0.38, live 0.29, R3 0.41, M2 0.14–0.19; breadth ≈ 2.1 independent forecasts/day |
