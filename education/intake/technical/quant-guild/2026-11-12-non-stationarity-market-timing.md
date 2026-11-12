# Non-Stationarity and Why Market Timing Fails

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=7nvjrgqKjJE |
| ReelScribe id | j57a4fjc5xt301gxt0pnj7rqeh8j2wtn · 30:58 |
| Notebook | `2026 Video Lectures/93. Non-Stationarity and Why Market Timing Fails/wmtf.ipynb` (+ `spx.csv`) |
| Recorded | 2026 (notebook copyright); exact date unknown |
| Processed | 2026-11-12 |

## Lesson
He builds the argument in four steps with a dice market. (1) If you know the mean, quoting around it earns money even
though every roll is random. (2) If you don't know it, the law of large numbers estimates it, and 50 rolls (sample mean
3.66) is not enough while many rolls are. (3) If the die silently changes from d6 to d10, a stale estimate loses
heavily. (4) You can't tell which die a 5 came from, so you don't know when to re-estimate or how much data to use.
"Market timing" means betting on that unknowable switch, which is why it usually fails. His fixes are words, not
tests. Returns are not draws from a distribution, so "you can't make something that is non-stationary stationary", and
"stationarity tests are largely nonsense" because a sample can look stationary until the break. What to look for is
**stability**: "perturb the parameter space… resample across regimes and observe reasonable stability. If not… model
breaks and then recover stability." A pooled return histogram is a time-compressed mixture of regimes, which is
what the fat tails are.

## Approach
- **Question**: is the edge stable across regimes and parameter perturbations? Not "is the series stationary?"
- **Evidence**: synthetic dice markets. A real SPY histogram against a normal fit with the same moments, to show the
  3σ left tail underestimated. Then a three-regime mixture (low/mid/high vol) as the explanation.
- **Kill rule**: the strategy works, stops, works again: "You have no idea what regime it worked in."
- **Model choice**: points to Markov chains, HMMs and Gaussian mixtures for latent regimes. No test of them here.
- **Statistics**: LLN and CLT "require distributions to be stationary". Excess kurtosis is "a consequence of
  non-stationarity".
- **Costs**: none.

## What the code actually does
- The dice demos are honest illustrations but hand-picked: `np.random.seed(42) # Yields an initial sample mean of 4.4
  (Terrible estimate!)`.
- §2 uses `spx.csv` (SPY + VIX). The §3 regime mixture, headed "EMPIRICAL PARAMETER FITTING", uses **simulated** data
  (lognormal VIX, SPY returns scaled by VIX). Regimes are VIX tertiles over the full sample, read the same day. So
  the regime picture is a drawing, not a fit.
- He never shows a stationarity test failing out of sample, a perturbation plateau or a regime resample. He states
  the stability criterion but does not demonstrate it.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "Stability is what we look for… not stationarity" (QG) | method | ALREADY DO: both-halves / by-year / last 1–3 years / parameter-plateau / neutral regime buckets (`stats-defaults.md` Controls, `lookahead-and-oos.md` Robustness, `LOCKBOX_ADDENDUM_1.md`) |
| 2 | Stationarity tests on real data are "ridiculous" (QG) | method | ALREADY DO in effect: ADF only reported, never a gate (`forge/run_residual.py`); `forge/residual.py` plans for broken pairs |
| 3 | Fat tails = a mixture of time-varying regimes (QG) | mechanism | ON FILE: `plans/STYLIZED_FACTS.md` (kurtosis stays 2.5 at a month because clustering mixes calm and busy months); `forge/JUMPS_PREREG.md` kurtosis of r ÷ σ_used; jump share ≈12% |
| 4 | Market timing fails because the switch is unobservable (QG) | mechanism | ON FILE as outcome: every mechanical direction null (memory); `stress-filter-hold-*` NULL/UNDERPOWERED; overnight-vol-regime flat |
| 5 | "When should we update our best guess? How much data should we use?" (QG) | method | **UNTESTED for the chosen σ**: fits are expanding-window (`FORECAST_PICK_PREREG.md` "sessions before each fold"; harness default "expanding window") |

## What we could learn
- **Stability, not stationarity.** ALREADY DO, as above. Independent confirmation of our controls.
- **Fit-window length is a modelling choice under non-stationarity, and it should be tested.** DO WORSE. Our σ
  coefficients, widths and IV-adjust mean are refit on an expanding window. That weights 2016 the same as last year and
  quietly assumes the coefficients are stationary. No study compares rolling or down-weighted windows. A positive is
  `vol-layer-deep/feedback`: the feedback betas were stable 2018–22, so the gap may be small. → card below, and
  method lesson "fit window" (new, WATCH).
- **Is anything we do under "market timing" exposed?** Research verdicts: mostly no. Direction timing is already NULL
  everywhere, and range/vol work is checked by year and half. Exposure sits in live and forward inputs:
  (a) regime labels used live (`hmm.js`/`hmmSignalScore`, BOCPD gates in the RegimeV2/V4/V7 bots, Hurst bonus in
  `bot/modules/regime_confidence_module.py`), already carded as `model-audits` Q1;
  (b) regime-gate thresholds picked by in-sample scans (`analysis/trade_analyzer.py` `_threshold_scan`, "BOCPD ≥ 70%");
  (c) forward records judged on one fixed window (Rule A book, judge 2027-10-29), where one year may be one regime.
  Report the forward window's neutral-bucket regime mix next to the backtest's;
  (d) expanding-window fits (card below).

## Research ideas
**Card: does a forgetting window beat the expanding fit for the chosen σ?** → `model-audits` (proposed Q4)
- Variable: QLIKE (variance) and pinball (H-L p50/p75/p90) of the chosen persistence+IV form, refit on (i) expanding
  (live), (ii) rolling 2y / 4y, (iii) exponentially down-weighted (half-life 1y / 2y). Also do this for the IV-adjust
  mean of log(IV ÷ σ).
- Condition: by class (FX majors / crosses / gold / indices), and calm vs stressed years.
- Horizons: daily, weekly, monthly lines.
- Noise threshold: the `forecast-pick` tie rule (1%), with a date-block bootstrap (21 sessions) on the loss difference.
- Benchmark: the live expanding fit. Mirror: a rolling window on shuffled years (the order shouldn't matter if the
  coefficients are stable).
- What it would change: the refit policy of the shipped σ, as a side-by-side shadow only. If nothing wins, the
  coefficients are stable enough and the non-stationarity worry is closed for layer 1.
- Screening: UNTESTED. `evidence_map` "fit window expanding rolling" gives 0 hits, and `forecast-pick` /
  `vol-layer-rv5-increment` are both expanding. Data on hand (`forecast_pick.py`, `pylego/walkforward.py` has
  `rolling_folds`). Must stay off H-A (lockbox).

## Quotes
- "You can't make something that is non-stationary stationary."
- "Stability is what we look for in the real world, not stationarity."
- "You have no idea what regime it worked in. You have no idea what regime it doesn't work in."
- "We should be able to perturb the parameter space… resample across regimes and observe reasonable stability."
- "Do we know when it changes from a six-sided dice to a 10-sided dice?"
