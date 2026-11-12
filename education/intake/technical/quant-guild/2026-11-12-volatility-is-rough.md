# Rough Volatility for Quantitative Finance ("volatility is rough")

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=Io_f4G7a_Eo |
| ReelScribe id | j57bn6xk309k50heg2hx8nqgc18j20wh · 35:45 |
| Recorded | unknown |
| Processed | 2026-11-12 |

**Same lecture as the 2026-11-12 `MD files/CLIP_WATCH.md` entry** ("speaker not named") and the source of
`.claude/skills/research-director/agendas/rough-volatility.md`. That agenda was built from a pasted copy of this
transcript; this note names the speaker and records the method points the agenda did not need. The additions are listed under "Research ideas".

## Lesson
Volatility is never observed, only proxied (here: rolling sums of squared five-minute S&P 500 returns from Interactive
Brokers, a few hundred days). To ask whether log volatility is "rough", compute the q-th order structure function
(the mean of |increment of log vol over lag delta|^q), take logs so the hypothesised power law becomes a straight line
in log delta, and read the slope zeta(q). Under plain Brownian motion zeta(1) = 0.5; he gets 0.155 (H about 0.15),
then repeats the regression for q = 0.5, 1, 1.5, 2, 3 and checks that zeta(q) is linear in q, which a single-H
fractional process predicts. Because fractional Brownian motion is non-stationary and variance cannot wander forever,
the model is a fractional Ornstein-Uhlenbeck process; its long memory kernel is slow to simulate, which is what
Markovian lifting addresses. The payoff he names is pricing (surface calibration, exotics), not forecasting.

## Approach
- **Framing**: description, not prediction. Target: the scaling exponent of log realised vol increments. Null: H = 0.5
  (the grey dashed benchmark line on the zeta(q) plot). No forecast, no horizon of use, no trading outcome.
- **Proxy choice first**: he stops to list the researcher's choices before any statistic: bar size (tick, 1m, 5m, 1h,
  daily), window length for the "first moment", and shows that each window gives a different log-vol path
  ("a one-day window is very snappy... a smoother proxy the longer the horizon"). Five-minute bars "to try to shake out
  some microstructure noise". He names the choices but does not vary them in the result.
- **Model choice and why**: log-log OLS because it turns a power law into a linear regression ("very easy to conduct in
  Python"). fOU over fBM on a qualitative constraint, not a fit statistic: variance is "expected deviation from
  expectation", it must mean-revert ("if everything is surprising, nothing is surprising").
- **Validation**: (1) one slope at q = 1 against the 0.5 benchmark; (2) the family check, the slope across five q
  values and the linearity of zeta(q) in q. No interval on any slope, no out-of-sample split, no artefact control
  (same estimator on a known-H or a smooth-vol simulated series), no comparison of window/bar choices. He frames it
  as "more of an academic educational exercise than trying to directly corroborate their results", then reads the
  small sample matching the paper as encouraging ("really cool that we're observing dynamics like this with such a
  small sample size").
- **Statistics**: effect size stated in a usable unit: quadrupling the horizon multiplies the typical increment by
  4^0.14 = about 1.21, not 4^0.5 = 2. Good habit: translate an exponent into "what happens when you scale the horizon".
- **Costs**: computational only. The non-Markovian kernel needs the whole path per increment; speed matters for
  calibration, hence Markovian lifting (a separate video).
- **Failure mode he warns about**: mis-specified vol dynamics in simulation give wrong prices and calibrations. The
  failure modes of his own measurement (proxy noise reading as roughness, overlapping windows, lag units) go unmentioned.
- **Industry context**: first met it on a QR desk on the rough Bergomi model and joint SPX/VIX calibration, i.e. a
  pricing problem. That is why the lecture never asks whether roughness forecasts better.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "Volatility is a latent process... we're proxying for it here with squared returns" (QG) | method | ON FILE: the same object as `rv5` in the Step 0 tables; `forecast-pick`, `vol-layer-rv5-increment` VALIDATED forecast it |
| 2 | Slope at q = 1 "is .155 for this particular sample", "much closer to 0.1" than 0.5 (QG) | mechanism | UNTESTED on our series. `evidence_map` "hurst", "rough..." 0 entries; git grep finds only CLIP_WATCH and the agenda. Contested in the literature (Cont and Das, arXiv 2203.13820, per the agenda) |
| 3 | zeta(q) is linear in q, "exactly what we should see for a simple fractional rough process" (QG) | mechanism | UNTESTED; already in agenda Q1 falsifier ("zeta(q) is not linear in q") |
| 4 | "Variance has to be mean reverting. It can't explode to infinity" (QG) | mechanism | ON FILE in spirit: `horizon-reversion` VALIDATED (weekly 0.968, monthly 0.936 of sqrt-h); `vix-brownian-scaling` CONTEXT (VIX variance ratio 0.50 at 20 sessions) |
| 5 | "If we simulate volatility incorrectly... our models are just not as great as they could be" (QG) | method | PARTLY: true for pricing; for this desk `vol-target` VALIDATED says the choice of sigma does not matter for sizing; gains show only on the lines |
| 6 | Fractional memory is costly to simulate; Markovian lifting trades memory for speed (QG) | method | Not a market claim; parked in the agenda |

## What we could learn
- **The proxy is a set of choices, and each one gives a different process.** ALREADY DO for sigma: data-rules item 2
  ("a sigma is only valid for the bar shape it was fitted on"). DO WORSE for descriptive statistics on a proxy: no rule
  asks for the result across the proxy grid (bar size x window). Agenda Q1 should report H across at least daily `rv5`
  vs a 1h-bar RV, as a small spec grid.
- **Run the estimator on a series with a known answer before reading its number.** QG does not. ALREADY DO:
  `research-protocol/references/stats-defaults.md` (2026-10-21 planted-signal positive control), and `js/hurstBench.test.mjs`
  checks the price-Hurst estimator on synthetic series. Agenda Q1's artefact band already does this; keep it as the gate.
- **Check the consequence across a family, not one point** (one slope at q = 1 is weak; linear zeta(q) across five q is
  stronger). ALREADY DO in kind: research-director's "sweep a family of horizons". Note the limit: a pure noise-driven
  artefact also gives linear zeta(q), so linearity is necessary, not discriminating.
- **Reject a model class on a qualitative property before fitting** (fBM is non-stationary, variance cannot be). ALREADY DO:
  the reverting weekly/monthly lines (`horizon-reversion`).
- **Translate an exponent into a horizon multiplier** (4x horizon -> 1.21x increment). ALREADY DO in the line work
  (`horizon-reversion` quotes "0.968 of the sqrt-h line"); worth keeping as the house unit for any scaling result.
- **"Consistent with the paper on a small sample" is read as support.** DISAGREE: an uncertainty-free slope from a few
  hundred days, with overlapping windows and no artefact control, cannot separate H 0.15 from a noisy H 0.5. Our rule:
  intervals and power before the word (`feedback_confidence_inverse_to_evidence`, stats-defaults).
- **Overlapping rolling windows and lag units.** His proxy is a rolling window and his lag is "eight bars or 40
  minutes" in one breath and "our trading day lag" in another. When the lag is shorter than the RV window, consecutive
  increments share most of their data and the slope is mechanical. DON'T DO as a written rule: no check in data-rules
  or stats-defaults says "the lag of an increment must be at least the window that builds the proxy; else use
  non-overlapping windows". Agenda Q1 uses per-session `rv5` (non-overlapping), which is right; say so explicitly.

## Research ideas
No new card. All three of his testable claims map onto the existing agenda's Q1 (claims 2, 3) and the parked items
(claim 6). Additions to Q1, not new cards:
- a proxy spec grid (daily `rv5` from M1 vs a coarser-bar RV; non-overlapping only) with H read per cell;
- an explicit lag-vs-window rule (lag >= proxy window);
- QG's q grid (0.5, 1, 1.5, 2, 3) and his reported S&P 5-minute slope (0.155 at q = 1, "few hundred days", IBKR data)
  as the outside reference point, alongside Gatheral et al. (H about 0.1) and Cont and Das (artefact);
- the note that linear zeta(q) does not separate rough from artefact, so the artefact band is the only discriminating gate.
Agenda: `.claude/skills/research-director/agendas/rough-volatility.md` (to be edited by the parent).

## Quotes
- [3:00] "very quickly, you will find that you have a lot of decisions to make. What kind of bars do you use?... how much data are you using to estimate that... first moment?"
- [4:00] "If everything is surprising, nothing is surprising. So volatility or variance has to be mean reverting."
- [14:00] "The slope of this line... for a Q value of one is .155 for this particular sample of data."
- [17:00] "Increasing the horizon by four is increasing the increment by 1.21... not two. That is substantial."
- [15:00] "more of an academic educational exercise than it is trying to directly corroborate their results."
