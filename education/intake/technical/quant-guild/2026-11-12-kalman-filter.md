# Kalman Filter for Quant Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=zVJY_oaVh-0 |
| ReelScribe id | j570nc5jq0newjfcyqtsggw9yh8j215s · 49 min |
| Recorded | unknown (2026 lecture series, #92) |
| Processed | 2026-11-12 |
| Notebook | `2026 Video Lectures/92. Kalman Filter for Quant Finance/kffqf.ipynb` (+ `vix.csv`) |

## Lesson
Every model has two separate problems. **Specification**: is the model the right shape? A linear trend fitted to the VIX
extrapolates to ±∞, while an OU model knows the VIX reverts. **Parameterization**: are the numbers right? The same OU
with bad parameters says VIX > 60 happens once in 65 billion years instead of about every 4.2 years. Both go stale when
the regime changes. A Kalman filter mixes a theory model (the "laws of physics", here an OU fitted as an AR(1) by OLS)
with noisy observations. The gain K = P/(P+R) is a trust lever: high R trusts the model, low R trusts the data. It is
a model stacked on a model, so Q and R are parameters too. A plain Kalman filter updates the *state*, not the model's
parameters, so on its own it is "a band-aid, not a cure". Dual / augmented filters treat the parameters as states.

## Approach
- **Question**: estimate a latent "true" level from noisy quotes and forecast it, with the model's uncertainty carried along.
- **Model choice and why**: the specification comes from theory and literature ("well-documented… a mean reverting
  process"), not from fit. He gives the Bloomberg BVAL illiquid-bond pricer as the industry case: a discounting model
  plus sparse trades in the bond and in similar issues as observations.
- **Kill rule**: a model is broken when its implied probabilities produce impossible or ignored states (VIX > 100 in a
  month; a 65-billion-year tail). "If your assumptions upstream are violently incorrect… all of those probabilities…
  even any form of statistical test, is going to be wildly incorrect."
- **Calibration window**: "Should I use the entire history…? The last 2 years? … There isn't a right or wrong here."
  Dual filters are offered as the "statistically optimal way" out of picking a window.
- **Trade-off**: adaptivity vs whipsaw ("no free lunch"). Q/R "we can also do so statistically… minimises some
  objective function", but that is "beyond the scope of this video".

## What the code actually does
- OU calibration: OLS of VIX_t on VIX_{t-1} over the **whole `vix.csv`**, then the filter runs over the **same** data.
  The "forecast tracking" chart is in-sample, and there is no benchmark (no random walk, no plain AR(1) forecast, no error metric).
- Q = residual variance (calibrated); **R = 2.0 assumed** (a second cell uses R = (1% × level)²). Neither is fitted by innovation likelihood.
- The "dual filter / adapting to new levels" demo is **not a dual filter**: a local-level filter where an innovation
  > 3σ adds +150 to P (an outlier gate that inflates uncertainty). The parameters never become states. Synthetic, one seed, one planted jump at t=50.
- The 65-billion-year vs 4.2-year example compares two hand-set OU parameter sets on paths, not a fit to data.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | VIX is mean-reverting; a linear extrapolation is misspecified | mechanism | ON FILE as context: `vix-second-derivative` VALIDATED notes "part is VIX mean reversion"; VIX calculus suite |
| 2 | Specification vs parameterization: name which one broke | method | PARTLY: our audits ask "mechanics before strategy" (`feedback_audit_mechanics_before_strategy`), not this split |
| 3 | Kalman gain = trust lever; Q/R are themselves parameters | method | DO WORSE: `js/config.js` KALMAN5M_DEFAULTS sets Q = 0.01·var, R = 0.10·var by hand; `js/mve/ssm.js` auto q = 1e-3·var; neither fitted or swept |
| 4 | Plain KF doesn't update model parameters | method | ALREADY KNOWN (Theory Lab `kalman-filter.html`, `kalman-smoother-ekf-ukf.html`) |
| 5 | Q/R can be chosen "statistically" | method | UNTESTED on any desk filter (0 Evidence Book entries for Kalman) |

## What we could learn
- **Filter noise settings are parameters: fit or sweep them, and report the effective gain.** Our 5m Kalman (Q/R = 0.1
  of the 40-bar close variance) converges to a gain of ≈0.27, i.e. an EMA with a ~2-bar half-life. Nothing in the code or
  docs says so. DON'T DO. New lesson (maximise the innovation likelihood, or sweep Q/R and show the plateau).
- **Specification vs parameterization as the first diagnostic when a model breaks.** DO WORSE: our audit habit stops at
  "mechanics vs strategy". Small addition to that habit; WATCH.
- **Out-of-sample calibration.** His demo calibrates and filters on the same series. ALREADY DO (lockbox, trailing-only
  fits). Logged under the Playbook's "gaps (his, not ours)".
- **Bugs on file for our filters**: `MD files/BUG_LIST.md` #37 (`beta_estimator.py` re-feeds the last 5 bars every
  cycle, giving an overconfident beta) and #73 (`js/macro.js` Kalman loop drops an extra close). The loop shape #73
  describes is still in the code (`bars.slice(1, …)`, then `i < chron.length - 1`). I haven't checked whether it is
  intended (a one-step hold-out) or a bug.

## Research ideas
- Card for `model-audits` (new Q4): the 5m Kalman bias (T8), see the Kalman mean-reversion note for the full card.
- Not carded: Kalman fair value for illiquid instruments (BVAL-style). We trade liquid FX/index CFDs, so nothing needs a sparse-trade pricer.

## Quotes
- "If we knew the true dynamics, we wouldn't need to build a model in the first place."
- "Is it a model specification issue or a parameterization issue? The answer is probably both."
- "We are now effectively stacking a model on a model… and it is also subject to misparameterization."
- "We're effectively just using the Kalman filter as a band-aid. It is not a cure."
- "If R is large, the filter is going to trust the model more. If R is small, it is going to trust the data more."
