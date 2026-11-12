# Trading Mean Reversion with Kalman Filters

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=BuPil7nXvMU |
| ReelScribe id | j570nth1kra2qxtb8tddd6a32h8j2are · 13 min |
| Recorded | unknown (2026 lecture series, #95, "Quant Strats") |
| Processed | 2026-11-12 |
| Notebook | `2026 Video Lectures/95. Trading Mean Reversion with Kalman Filters/ktsmr.ipynb` + `kts.py` (IBKR GUI) |

## Lesson
In theory, if price is a true OU process, trading back to an *estimated* mean makes money even when the estimate is off
("you just need to be reasonably correct on average"). In reality there is no fixed long-run mean: OU parameters drift,
reversion switches on and off, and the bar size and calibration window are open choices. His live tool calibrates an OU
on the last 60 one-minute bars, runs a Kalman filter whose state is the "mean level", and gives the user a lever between
trusting the OU and trusting prices. Neither end is free: trust the model and you trade back to a stale level; trust the
data and you get whipsawed. He gives no rule, backtest or cost model, and says the choice is the trader's ("I can't
tell you how to play your hand of poker").

## Approach
- **Question**: where is fair value now, if fair value moves?
- **Evidence**: a synthetic OU simulation (known mean 100, 30-sample estimate, ±1 stationary-σ bands, exit at the mean),
  which shows the equity curve rising. The live tool has no evidence attached.
- **Validation**: "back tests and walk forward tests… observe out of sample if… there's stability… but at the end of the
  day, it's still no guarantee." Named, not done.
- **Failure modes named**: non-stationarity ("there is no long-term mean"), stale means, noise sensitivity of an adaptive filter.

## What the code actually does
- `estimate_ar1`: OLS AR(1) on the window, then **`phi = np.clip(phi, 0.01, 0.99)`**. On 1-minute stock prices the fitted
  φ is ≈1 (a unit root), so the clip *imposes* reversion the data doesn't show. μ = the window's sample mean.
- `KalmanOU`: Q = σ²(1−φ²), R = σ² × lever scale (0.1 to 10, or 1e8 for "pure OU"), state initialised at μ. The state
  is the filtered *price* pulled toward μ, labelled "mean level". With low R it is close to a short EMA of price.
- Orders are **manual market orders of 100 shares** from GUI buttons. No signal rule, no stops, no costs, no logging of results.
- The synthetic notebook has no costs and is stationary by construction (seed 42, start at 106 "to skew the estimate").

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "We just need appropriate bet sizing and to be correct on average to be able to generate wealth" (with OU) | trading | DISAGREE for our universe: `ou-bands-fx-crosses` UNDERPOWERED (22 OOS trades, 68% time-stopped, 6% reach the OU target); `vwap-extension-fade` NULL (gross positive, 3-8× under cost) |
| 2 | Stock prices are not OU; parameters change | mechanism | ON FILE in effect: `residual-pca-wide10` (metals residuals *trend*); pairs-spread Q1 asks this with variance ratios first |
| 3 | Adaptive filter = trade-off between staleness and whipsaw | method | UNTESTED for our live 5m Kalman (T8). See card |
| 4 | A discretionary trader with context can beat systematic use of the same tool | opinion | not testable as stated |

## What we could learn
- **Test the property before imposing it.** Clipping φ at 0.99 forces an OU on a random walk. ALREADY DO in plan:
  `pairs-spread` Q1 reads VR(q) and half-life against random walks before any rule. REPEAT of the Playbook's "ignored
  unit root" failure mode and of "reject a model class on a qualitative property first".
- **A synthetic profit curve is a demo of the maths, not evidence.** ALREADY DO (every claim gets a cost-aware OOS test;
  `project_execution_feasibility_gate`: spread/ATR > 0.15 is dead).
- **Our own live copy of this system exists.** `js/macro.js` `compute5mKalmanDev` / tier T8 "5m Kalman Bias": a
  local-level (no OU pull) filter on the last 40 five-minute closes, Q/R fixed fractions of the window's price variance,
  ±1.5σ deviation gives a mean-reversion long/short score, shown in alerts (`js/alerts.js`). No Evidence Book entry. That
  is QG's tool without even his lever, so it is the place to apply the lesson.

## Research ideas
**Card: `model-audits` Q4: does the 5m Kalman bias (T8) say anything a plain EMA doesn't, and does it survive cost?**
- Variable: `normDev` from `compute5mKalmanDev`, rebuilt point-in-time from M5 (bars to t−1, as live).
- Condition: |normDev| > 1.5 (live), then swept 1.0 to 3.0 for the noise threshold.
- Horizons: next 1, 3, 6, 12 M5 bars; signed return in ATR units, MAE.
- Noise threshold: the same statistic on the deviation from an EMA with the matched steady-state gain (≈0.27), and on shuffled-date placebos.
- Benchmark / mirror: `vwap-extension-fade` (gross positive, 3-8× under cost); the spread/ATR gate. Mirror: the continuation side.
- What it changes: drop T8 from the tier score (or show it as context only) if it is null or EMA-equivalent; keep it with a recorded gain and Q/R if it isn't.
- Screening: **UNTESTED** (evidence_map "kalman": 0 entries). **PARTLY ON FILE** through `vwap-extension-fade`, the
  execution-feasibility gate and `vwap-stretch-line-touch` (fading stretch loses on NQ). The prior is "net null". It
  still earns a card because T8 is a live input nobody has scored, not because it looks promising. Also confirm BUG_LIST #73 first.

Not carded: Kalman hedge ratios for pairs. Already in `pairs-spread` Q1's construct list ("regression (or Kalman)
coefficient"), and a pairs rule waits on Q1. The KALMAN branch of `analysis/residual_reversion_fx.mjs` has no result
written in `MD files/RESIDUAL_REVERSION_FX_TEST.md` (checked by grep).

## Quotes
- "We don't need the precise theoretical mean to be able to generate wealth effectively." (in theory)
- "The problem in reality is the law of large numbers asymptotically does not converge to the long run mean."
- "Anytime you have a model capable of adapting with the market, it is a double-edged sword."
- "You could go through and jump through all of those hoops and at the end of the day when you deploy it live, everything falls apart."
