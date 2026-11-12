# Ultimate Options Trading Crash Course

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=-lQdlJh8cCE |
| ReelScribe id | j573sksnjdb2dmpm04ptgz6mv58j2h9d · ~62 min |
| Notebook | none in the library (folder `2026 Video Lectures/108. Ultimate Options Trading Crash Course/` holds only the video link; whiteboard lecture) |
| Recorded | 2026 (lecture no. 108) |
| Processed | 2026-11-12 |

## Lesson
101 material, done on a whiteboard. European calls and puts give the right to buy or sell at K at T, physically settled
in lots of 100. A payoff is a max function and profit is the payoff shifted by the premium. Portfolios add slope by
slope (a straddle = call + put; its break-evens are the market's "priced-in move" before earnings). A long option risks
only the premium; a short one has open-ended risk. Premium is not static: delta, theta and vega move it, and "most of
the profits trading options" for premium sellers come from buying back early (e.g. sold $9, bought back $5 on day 15),
because gamma risk grows near expiry. The close is the method point: **delta is a model probability**. A 50-delta
option does not mean 50% of such options finish in the money, because markets aren't a fixed probability mass function
("we do not live in a frequentist world").

## Approach
- **Framing**: pricing ≠ prediction (repeated many times). BS lets you compare options "apples to apples" across
  underlyings through IV.
- **Statistics**: a dice example for the frequentist reading and the law of large numbers. "There is no asymptotic convergence
  in real life", "non-stationarity".
- **Trading habit**: close short premium early. Most value accrues early; gamma and vol risk dominate late.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | The ATM straddle break-evens are the market's priced-in move (QG) | mechanism | PARTLY: `iv-forecast` calibration, next-day \|move\| in iv30/√252 units: a ±1σ band holds 77% (fat tails); `vix-brownian-scaling` NQ realised ~16% under VXN |
| 2 | Market-implied moves "often very wrong", which is where "very interesting trades" come from (QG) | trading | PARTLY: VRP exists but is ~1 spread wide in FX (`forge/VRP_FORECAST_PREREG.md`) |
| 3 | Short premium: take profit early; most decay is early (QG) | trading | UNTESTED, and also contested: under BS, ATM theta *accelerates* into expiry. "Most value early" holds for P&L per unit of gamma risk, not for raw decay. Not desk-relevant (we don't sell options) |
| 4 | Delta is not a frequency; trading many 30-delta options won't converge to 30% ITM (QG) | method | see "Disagree" |

## What we could learn
- **DISAGREE (claim 4).** Calibration doesn't need a fixed PMF. A forecaster issuing different probabilities for
  non-identical events can still be scored by reliability (bin the stated probabilities, compare the hit rate per bin)
  and by Brier or log score. That is how this desk scores the Vol Forecast ladder and P(touch) (`ladder-calibration`, reach
  calibration re-fit, the direction ledger). The real reason delta ≠ frequency is the measure: N(d1)/N(d2) are risk-neutral,
  so with a risk premium they are biased against physical frequencies *in a predictable direction*. That is a testable
  statement, not "no convergence". Our evidence: the ±1σ band holding 77% instead of 68% (`iv-forecast`) is exactly such
  a calibration read on implied probabilities.
- "Pricing is not prediction": REPEAT of the playbook's "name the job" (Framing).

## Research ideas
- **Are option-implied wing probabilities calibrated, per side?** · variable: N(d2) (risk-neutral P(ITM)) of 10Δ/25Δ
  puts and calls at 30d, from settlement premiums · condition: side (put/call), IV/RV tercile · horizon: expiry (~21
  sessions) · noise threshold: reliability-bin binomial CIs; block bootstrap over expiries · benchmark: the ATM
  calibration already on file (±1σ holds 77%) · changes: whether IV-based ladder/tail rungs need a side-specific haircut,
  and which side of FX carries the premium → `model-audits.md` (low priority). Screening: PARTLY ON FILE (ATM quantile
  calibration in `iv-forecast`; `skew-fade` NULL is about touches, not expiry ITM). Data: `OI Data/*.csv` settlements,
  7 CME instruments, 2020-09 → 2026-09 (laptop). Overlapping monthly expiries are a power limit: about 70 independent
  expiries per instrument.

## Quotes
- "Pricing is not prediction. Pricing is not prediction. That is one of the most important things to understand."
- "We do not live in a frequentist world... Probabilities are implied by the market, and the market is always wrong."
- "Most of the value that you accumulate in a short position is going to be early on in the contract's life."
