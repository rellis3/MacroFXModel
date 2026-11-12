# Arithmetic and Geometric Brownian Motion Masterclass

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=J23tj13WOK8 |
| ReelScribe id | j57740n8tg9pckwmnfkxr19zhd8j3pkc · 62 min |
| Notebook | `2026 Video Lectures/135. Arithmetic and Geometric Brownian Motion Masterclass/abmgbm.ipynb` |
| Recorded | 2026 lecture series |
| Processed | 2026-11-12 |

## Lesson
ABM (dS = μdt + σdW) is additive: integrate both sides and S_T ~ N(S₀ + μT, σ²T), so the expectation is a straight line.
GBM (dS = μS dt + σS dW) is multiplicative. Take logs and apply Itô's lemma, and the −½σ² term appears: log S_T ~
N(log S₀ + (μ − ½σ²)T, σ²T). S_T is log-normal, the mean grows as e^{μT}, and the median (geometric mean) grows as
e^{(μ−½σ²)T}. The gap between them is volatility drag ("the experience of the few is not the experience of the many").
ABM allows negative values, so it fits a spread or a contract that can go negative (crude 2020); GBM does not. Every
cross-section converges to the known law as paths are added, as long as the generating distribution stays fixed.

## Approach
- **Framing**: the model's job is an expectation, not a path: "It's never the purpose of a model to predict randomness."
- **Model choice and why**: pick the process by a qualitative property (can the asset go negative? additive or
  compounding?) before fitting anything. REPEAT of the playbook's "reject a model class on a qualitative property first".
- **Validation**: derive the law analytically, then show the simulated cross-section converging to it at every time slice,
  not only the terminal one. Says plainly that simulating with known parameters is circular ("if you know the population
  parameters, why are you simulating?"). In practice the parameters are estimated.
- **Failure mode**: "structural breaks". Real data never converges to a fixed mean. SDEs are "more appropriate" for
  pricing derivatives than for forecasting prices. REPEAT: "pricing and forecasting are two different ball games".

## What the code actually does
- Uses the **exact** log-step for GBM (`exp(cumsum((μ−½σ²)dt + σ√dt z))`), so there is no discretisation error, and plots
  the theoretical arithmetic mean, the geometric mean (median) and the densities over the simulated cross-sections. Seeded
  (`default_rng(3)`), 5,000 paths for the histograms.
- Here the reference curves are genuinely independent closed forms, unlike the Brownian-motion and Volterra notebooks.
- Slip: `MU = 0.30  # 10% annual drift` in the first cell (the later cells say 30%).

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Volatility drag: the median path compounds at μ − ½σ² (QG) | method | ALREADY DO: `forecastPathCore` consensus path is the per-step **median** close; Theory Lab `ito-lemma` teaches drag |
| 2 | ABM is the better choice where prices can go negative (QG) | method | Context only. WTI handling is the known FRED-print conflict (memory), not a model choice |
| 3 | SDEs fit pricing better than forecasting asset prices (QG) | method | ALREADY DO: forward-direction nulls; σ/range is what we forecast |

## What we could learn
- **Draw the exact transition when the law is known**: ALREADY DO (`forecastPathCore` steps `prev * exp(mu + sig*z)`).
- **Check every cross-section, not only the terminal**: DON'T DO for path tools. `reachabilityCalibration` grades the
  output against real touches, but no test checks the generator against a closed form first.

### A known-answer check of our own generator (scratch, not a registered study)
To see whether the desk's MC passes QG's own test, the `intradayReachability` generator was copied into a scratch script
(log-normal closes plus the "pad every bar to the median bar range" wick rule) and fed a pure Brownian walk whose true bars
came from 60 sub-steps. 40,000 paths, H = 12 bars, target at m·σ√H:

| target | reflection closed form | fine-path truth | desk generator | closes only |
|---|---|---|---|---|
| 0.5 σ | 0.617 | 0.602 | 0.592 | 0.508 |
| 1.0 σ | 0.317 | 0.309 | 0.304 | 0.248 |
| 1.5 σ | 0.134 | 0.130 | 0.127 | 0.099 |
| 2.0 σ | 0.046 | 0.043 | 0.042 | 0.032 |

Under a Brownian world the generator is within ~1–2.5pp of the closed form; the wick pad does its job (closes-only
under-counts by 5–11pp). So the shipped 94% → 68% miss (`js/oiReachability.js` header) is **not the path mechanics**. It
has to come from the inputs (the σ ladder) or from real paths not being Brownian (intraday mean reversion, clustering).
That changes `model-audits` Q2. See the card below.

## Research ideas
- **Card (adds to `model-audits.md` Q2 as its first step): split the P(touch) miss into σ error and path shape.**
  Variable: realised touch indicator per level-window vs (a) the shipped MC P(touch), (b) the reflection closed form using
  the *realised* σ over the window (oracle σ), (c) the closed form using the forecast σ. Condition: EURUSD, GOLD, NQ; distance
  tercile. Horizons: 6/12/24/48 M5 bars. Noise threshold: binomial/day-bootstrap interval; placebo levels. Benchmark: (b).
  If touches match (b) but not (c), the miss is all σ input, so fix the intraday σ ladder and retire the map. If they miss
  (b) too, real paths are not Brownian at that horizon (mean reversion), and Q2's bootstrap generator is the right next arm.
  Screening: `evidence_map` "touch probability", "reachability touch monte carlo wick" 0 entries; `line-touch-reach`
  VALIDATED (daily lines calibrate), `day-recon-reach-calibration` UNDERPOWERED. Intraday MC split UNTESTED. Data: M5 on hand.

## Quotes
- "It's never the purpose of a model to predict randomness, predict the path that you're going to walk. It's to generate an expectation."
- "If you know the population parameters, why are you simulating? And if you're simulating, you have the population parameters."
- "Once you start getting into the idea of having different regimes… that is where everything may change."
