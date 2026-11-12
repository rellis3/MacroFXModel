# Path Signatures for Quantitative Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (sole speaker; tag every claim) |
| URL | https://www.youtube.com/watch?v=kv5cJDP-GGo |
| ReelScribe id | j57cfhvd9th4h9dynwhx98zxk98j3hte · 45 min (2,708 s) |
| Recorded | unknown |
| Processed | 2026-11-12 |

## Lesson
A vanilla option's payoff depends only on where price ends, so the volatility surface carries only the *terminal*
(risk-neutral) distribution and says nothing about the route there. Several models, or one model with different
parameters, can fit the same surface exactly and still generate very different paths. For anything whose payoff
depends on the path (barriers, lookbacks, Asians), that path model is where the risk sits. A Taylor expansion prices a
vanilla with a weighted sum of the terminal distribution's moments. A path signature (the stack of iterated integrals
of the path: level 1 a vector, level 2 a matrix, and so on) plays the same role for a path, so the expected signature,
truncated at some level, prices a path-dependent payoff. He checks both approximations against a case with a known
closed-form answer (the Black-Scholes call, and an analytic barrier price matched to 1.7376 vs 1.7378 at signature
level 4). He also warns against throwing signature levels into an ML model as features without an economic reason.

## Approach
- **Problem framing**: pricing, not prediction. The target is a risk-neutral expectation, not a conditional return
  distribution to bet on. He states this outright: the signatures here "are not being used to predict anything".
- **Question**: what information does a quantity need? Terminal-only payoff → moments of the terminal distribution
  are enough. Path-dependent payoff → you need something that encodes the path (the expected signature).
- **Model choice and why**: local vol, stochastic vol (Heston), LSV and rough models can all be calibrated to the same
  surface. He prefers models that reproduce the stylised facts: the leverage effect, vol as its own latent process.
  The reason given is path realism ("if our paths aren't accurate, they're going to produce unrealistic payoff
  densities"), not fit quality, because every candidate fits the surface.
- **Evidence / validation**: a controlled setting with a known answer. The moment expansion has to converge to the
  Black-Scholes price "by construction... if it didn't, it wouldn't make any sense". The signature approximation is
  checked against the analytic barrier price. Convergence is shown by adding terms or levels until the price stops
  moving (moment 7, level 4).
- **Statistics**: none beyond convergence. No out-of-sample or empirical test in this video. It is a math and
  intuition lecture.
- **Costs**: model risk is priced as a spread on top of fair value: "counterparty risk, spread, liquidity, profit".
- **Failure modes**: (1) fitting the marginals and assuming the paths are right (non-identifiability of path
  dynamics from the surface); (2) the discretisation scheme degrading path quality; (3) truncating too early;
  (4) a kitchen sink of path features with no economic reason.
- **Kill rule**: implicit. An approximation that fails to converge to the known answer in the controlled case is
  wrong, so don't use it.
- **Habit**: compute with a library (`signatory` or similar) rather than by hand. Use a visual proxy (the norms of
  the flattened levels 1-3 as a 3-D point per path) for intuition only, and say so.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | The vol surface encodes the terminal risk-neutral density and "the path that it takes to get there, it's agnostic to" (QG) | mechanism | Standard theory. Not a desk test object |
| 2 | One stochastic-vol model can be "calibrate[d]... and then under a completely different parameterization, reproduce that exact same volatility surface" while implying different paths (QG) | mechanism | PARTLY ON FILE: the desk's version is in `js/oiReachability.js`. The constant-σ Monte Carlo is calibrated on close displacement, but its raw P(touch) is over-confident (94% → 68% realised, mean error 9.0pp on EURUSD M5). The terminal is right and the path is wrong |
| 3 | Path-dependent payoff ≈ linear combination of expected signature levels; level 4 matched an analytic barrier price to 4 dp (QG) | method | UNTESTED here. A pricing result in a GBM classroom setting, outside the desk's job (we don't price exotics) |
| 4 | Signatures can be calibrated to reproduce a rough/fBM covariance kernel (QG) | method | Not a market claim. See agenda `rough-volatility.md` (2026-11-12) for the roughness question itself |
| 5 | Throwing signature levels into an ML model for returns has "no economic basis"; "you should have an economic reason for it" (QG) | method | ON FILE in spirit: `rangebook/eurusd_SEQUENCE_RESULTS.md` Q2, where path variables (top/when/passes) add no reach skill (−0.0010 [−0.0030, +0.0010]). Also `FINGERPRINT_RESULTS.md`, where combined touch features give AUC 0.578, no better than the simple ones, and every decile loses after costs. Signatures themselves: 0 entries (`evidence_map "path signature"`) |
| 6 | Path quality depends on "our discretization scheme and the model that we select" (QG) | method | PARTLY: `forecastPathCore.intradayReachability` counts a touch with iid normal steps plus a *fixed* wick, padded to the median prior-bar range. Nothing on file tests that discretisation choice against M1 touches |

## What we could learn
- **Known-answer check before trusting a method.** DO WORSE. We have it as a lesson learned the hard way
  (`research-protocol/references/stats-defaults.md` 2026-10-21, planted-signal positive control) and as unit tests on
  synthetic data (`js/forecastPathCore.test.mjs`). It is not a prereg step. The `rough-volatility` agenda flags the
  same gap in another lecture: no estimator run on a process known to be smooth.
- **Calibrating the terminal distribution doesn't validate the paths.** ALREADY DO detecting it, DO WORSE fixing it.
  `oiReachability.js` found the over-confidence and patches the *output* with a piecewise map fitted on EURUSD M5 H=12,
  then borrows that map for other pairs and horizons (`calibSource`). The generator stays iid-normal with a fixed
  wick. QG's frame says to fix the path model (vol clustering, intraday seasonality, realistic wicks) and judge it on
  path outcomes. Carded below.
- **Mechanism before features.** ALREADY DO: `research-director/references/cog-question-style.md` K/L (context
  relevance, mechanism first). Independent confirmation from a quant teacher.
- **Convergence check on a numerical setting** (terms, levels, path count, step size). DON'T DO as a named step.
  `intradayReachability` uses nPaths 400 by default, with no recorded check that P(touch) is stable to path count or
  step size. That is cheap to add when the card below runs.

## Research ideas
- **Card: path model, not output patch, for P(touch).**
  - Variable: P(touch) of a level within H from each path generator. Three are compared: (a) the current iid-normal
    plus median wick; (b) a block bootstrap of the instrument's own past intraday returns, rescaled to the same σ;
    (c) (b) with a time-of-day vol profile.
  - Condition: per instrument (EURUSD, GOLD, NQ) and per horizon.
  - Horizons: H = 6/12/24/48 M5 bars.
  - Noise threshold: the calibration error of a random-level placebo, plus the day-bootstrap interval on the error.
  - Benchmark: the current piecewise-linear map, out of sample.
  - What it changes: if (b) or (c) calibrates raw within about 2pp on unseen pairs, the borrowed EURUSD map can go and
    `calibSource: borrowed` stops being a limitation. If not, the map stays and we know the error isn't the path
    model.
  - Screening: PARTLY ON FILE. `oiReachability.js` header shows the raw miss. Prior reach work (P8 level_p2
    calibrated geometry; P10 EURUSD reach cells, Brier skill +0.188) calibrates *empirical* reach tables, not a path
    generator. No test of the generator itself found.
  - Suggested agenda: new `path-model-reach.md`, or append to `rough-volatility.md` (the same "vol dynamics → path"
    theme).
- **Not carded: signature features for touch or continuation.** What differs from the nulls is that the level-2
  (Lévy area) term encodes the *order* of moves (drift then pullback vs pullback then drift). P11 tested only
  extreme, timing and passes. Still not carded: the speaker himself rejects it without a mechanism; every
  mechanical-direction hunt on file is null (P14: combined touch features have AUC 0.578, every decile loses after
  costs); and nobody has named a mechanism. Re-open only with a stated reason why move order should matter.

## Quotes
- "the volatility surface is encoding information about the risk neutral density... but the path that it takes to get there, it's agnostic to."
- "it is entirely possible that we can calibrate a stochastic volatility model to a volatility surface, and then under a completely different parameterization, reproduce that exact same volatility surface."
- "if our paths aren't accurate, they're going to produce unrealistic payoff densities."
- "it's not a shocker that this is going to converge perfectly to the Black-Scholes price. In fact, if it didn't, it wouldn't make any sense."
- "you can't just take a whole bunch of signature levels, throw it into your model, throw a kitchen sink at it... There's no economic basis for that."
