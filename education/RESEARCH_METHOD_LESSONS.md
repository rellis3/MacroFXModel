# Research method lessons (all sources)

How to run research, learned from the material the owner feeds in (quant teachers, C.OG, commentators, podcasts),
compared with how this desk works now. Written by the `learn-intake` skill; read by `research-protocol` at Step 0.

Tags: **ALREADY DO** (cite where) · **DO WORSE** (what change) · **DON'T DO** (what adopting it takes) · **DISAGREE**
(our evidence). A lesson seen in 2+ items with DO WORSE / DON'T DO becomes a proposed edit to a skill; the owner approves it.
Status: **PROPOSED** = edit put to the owner · **WATCH** = seen once, waiting for a second source · **ADOPTED** = edit made (date).

Source notes live in `education/intake/<lane>/<source>/`. QG = Quant Guild (Roman Paolucci).

## Do worse / don't do

| # | Lesson | Tag | Where it touches us | Sources | Status / proposed edit |
|---|---|---|---|---|---|
| 1 | **Positive control before the real run**: run the exact pipeline on a synthetic process, planted signal or nested case with a known answer, and record that it is recovered | DO WORSE | Exists only as hard-won lessons in `research-protocol/references/stats-defaults.md` (2026-10-21 planted signal, 10-24 reproduce first, 11-04 planted gaps) and some unit tests; not a prereg step | QG path signatures, QG how to learn | **PROPOSED**: new prereg field in `MD files/PREREG_TEMPLATE.md` §3: "Positive control: the known effect or nested case this pipeline must recover before the real run, and the result" |
| 2 | **Convergence / stability of numerical settings**: add paths, steps or terms until the answer stops moving; independent methods must agree | DON'T DO | `forecastPathCore.intradayReachability` runs 400 paths by default with no recorded stability check; MC settings across forge are unrecorded | QG path signatures, QG how to learn | **PROPOSED**: one line in `stats-defaults.md`: "Any Monte Carlo or numerical result reports that doubling paths/steps moves it by less than its own CI" |
| 3 | **Factor (PCA) loading stability**: check the eigenvectors don't rotate over time before using latent factors | DON'T DO | Residual-PCA family sets K by the noise-band rule only (`forge/RESIDUAL_PCA_FAMILY_PREREG.md`, `analysis/residual_reversion_fx.mjs`) | QG model tier list, QG math tier list | **PROPOSED**: add a principal-angle diagnostic (window vs 20 days earlier) to the residual scripts' output; diagnostic only, `residual-fx8-forward` unchanged |
| 4 | **Name the edge source**: forecasting skill vs structural mispricing (who is on the other side, why it persists, what crowds it out) vs risk premium | DON'T DO | Prereg template §1–8 never asks which kind; most direction nulls here are "skill" claims | QG shorts: hedge funds | WATCH: line in prereg §1 "Edge source" |
| 5 | **Linear baseline first**: any ML / non-linear arm is reported beside a linear arm (OLS / logistic / count table) and an intercept-only M0; the claim is the gain over linear | DO WORSE | Done ad hoc (`extreme-in-probability`, `meta-label-proper`, the yield ladders' M0) but no rule | QG model tier list (+ its shorts) | WATCH: one line in `stats-defaults.md` |
| 6 | **Regime / latent-state stability**: a regime label used as a condition reports dwell time, flip rate and how often past labels change on refit | DO WORSE | `hmm.js` labels by variance (found the hard way); `hmmHourly.js`, `creditHmm.js`, `regime-confidence.js` live, bots read `hmmSignalScore`; no stability audit | QG model tier list; QG shorts: Fama-MacBeth (time-varying distributions) | WATCH (two QG items but one theme); card `model-audits` Q1 |
| 7 | **Diversification judged in stress windows**, not full-sample correlation | DO WORSE | Portfolio Book and factor blend report full-sample correlation | QG shorts: hedge funds | WATCH; card `portfolio-construction` Q1 |
| 8 | **Rebalancing (geometric-mean) effect** when combining books | DON'T DO | Nothing on file | QG shorts: hedge funds | WATCH; card `portfolio-construction` Q2 |
| 9 | **Fama-MacBeth for cross-instrument questions**: per-period cross-section, average coefficients, time-series SE, instead of one pooled fit | DON'T DO | Taught (regression course, whiteboard), never used in a study | QG shorts: Fama-MacBeth | WATCH: a robustness re-read of one pooled banked result |
| 10 | **A statistic on a latent proxy is reported on at least two proxy specs** (bar size, RV window) | DO WORSE | data-rules item 2 covers σ's bar shape, not descriptive statistics on proxies | QG volatility is rough | WATCH |
| 11 | **Increments must not overlap**: lag ≥ the proxy's window, or use non-overlapping windows | DON'T DO | No rule in data-rules / stats-defaults | QG volatility is rough | WATCH: line in `data-rules/references/lookahead-and-oos.md` |
| 12 | **Name what a model extension gives up** against the simpler baseline | DO WORSE | Implicit in research-director "Incremental value" | QG how to learn | WATCH |
| 13 | **Calibrated terminal distribution ≠ valid paths**: judge path quantities (touch, first passage) on path outcomes, and fix the generator, not just the output | DO WORSE | `js/oiReachability.js` patches over-confident MC P(touch) (94% → 68%) with a map fitted on EURUSD, borrowed for other pairs | QG path signatures | WATCH; card `model-audits` Q2 |

## Already do (independent confirmation)

| Lesson | Where we do it | Sources |
|---|---|---|
| Name the job (pricing / filtering / describing / forecasting) before scoring | `CONTEXT` verdict word; same-bar-only couplings | QG model tier list, path signatures, volatility is rough |
| Mechanism before features; no kitchen sink | `cog-question-style.md` K/L; path-feature nulls | QG path signatures |
| Small R² / IC is normal; judge by power and cost; very high accuracy is a red flag | IC bar 0.03 + MDE; data-rules item 10; direction bar | QG model tier list |
| Interpretability breaks ties | `extreme-in-probability` kept the count table | QG model tier list |
| Benchmark fixed ex ante | prereg §4, research-director benchmark field | QG shorts: ex ante |
| Check consequences across a family, not one point | "sweep a family of horizons" | QG volatility is rough |
| Reject a model class on a qualitative property first | horizon-reversion | QG volatility is rough |
| Gate each layer on full understanding before the next | forecaster blueprint; lessons ground-up | QG how to learn |
| LLM defaults aren't truth | check-the-catalogue rule; learn-intake step 4 | QG model tier list, how to learn |

## Disagree

| Their practice | Our position | Source |
|---|---|---|
| Small-sample agreement with a paper read as encouraging (rough vol, no CI) | Intervals and power before the word; a few hundred overlapping days can't tell H 0.15 from noisy 0.5 | QG volatility is rough |
| Nelson-Siegel D tier ("nobody cares") | A macro FX desk lives on curve shape; we use PCA level/slope for that job | QG model tier list |
| "Learning styles aren't real" vs Theory Lab's VARK | Keep the several modes (dual coding), drop the "styles" rationale; add graded problem sets | QG how to learn |

## For the owner's own learning (not research rules)

From QG how to learn and math tier list. Owner's call:
- A 5–10 question graded problem set per Theory Lab lesson, and a "ready to move on" gate.
- Prerequisites per lesson in `theory-lab/assets/paths-data.js`, plus a cross-lesson diagnostic quiz that gives a gap list.
- A core path ordered linear algebra → probability/statistics → multivariable calculus/optimisation → time-series econometrics, ahead of the PDE/SPDE (pricing-side) lessons.
