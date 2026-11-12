# I Met a Jane Street Quant at the Gym (diversification vs hedging)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=E73rL7Hex-k |
| ReelScribe id | j577zbn1pfe7xgast274prqnt18j25q1 · 15 min |
| Notebook | `2026 Video Lectures/120. I Met a Jane Street Quant at the Gym (He Got This Wrong)/dvh.ipynb` |
| Recorded | unknown (2026) |
| Processed | 2026-11-12 |

## Lesson
Diversification is a **statistical** mechanism: any correlation below 1 lowers portfolio variance, which lowers
volatility drag and raises Sharpe. But sample correlations are non-stationary and "go to one" in a crisis, which is
exactly when the benefit is needed. **Structural** diversification survives because independence comes from the
mechanism (a sports market-making book does not care about an equity crash). **Hedging** trades uncertainty for
certainty through a contract: a put's payoff is fixed by its terms, so its negative relation to the stock cannot break
down. Hedging done right is structural diversification, and its purpose is growth (lower drag, better CAGR), not comfort.

## Approach
- **Question**: does the source of independence survive the state you need it in? Classify by mechanism before data:
  "I don't need a backtest to tell you whether or not I have structural diversification" (QG).
- **Evidence**: four synthetic GBM demos (uncorrelated pair; pair with an injected crisis; stock + sports-MM algo;
  NVDA + Black-Scholes put), then a 10-year rolling-put vs unhedged simulation.
- **Habit**: ask what physically links two return streams; a statistical correlation estimate is the weaker evidence.

## What the code actually does
- Every crisis is **planted**: hand-set windows where both stocks get the same negative returns (correlation forced to 1)
  while the "sports MM algo" keeps its normal draw.
- The 10-year hedge result: SPY GBM with three planted crisis windows. The "rolling put" is not priced. It is a fixed
  2.5%/yr premium, a payoff of 0.45·max(−r − 0.8%, 0) per day, and a **monetisation multiplier of 1.0 inside the
  planted crisis windows vs 0.10 outside**, so the overlay knows when the crisis is. The hedged book also holds 15% cash
  at rf. The win is in the generator, not the data.
- The NVDA put demo is Black-Scholes with IV = realised σ (45%; 90% in the crisis), so no variance premium is paid.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "Correlation structures… are non-stationary… crisis, everything is correlated" (QG) | mechanism | PARTLY: our literature spec (`plans/vol-layer/L3_LITERATURE_SPEC.md` "Stress") calls it **mixed**: Longin-Solnik find a bear-market rise, but Forbes-Rigobon find almost none once you correct for conditioning on high vol. Desk: rule A vs book joint worst-5% days 6 vs 3.9 expected (p 0.19, no excess); rule A's two halves 10 vs 3.9 (p 0.004); book core beta and short vol corr 0.45 in a crash |
| 2 | "Real diversification is structural, not statistical" (QG) | method | UNTESTED as a rule; REPEAT of method lesson #7 and #4 (name the mechanism) |
| 3 | A put's negative correlation is contractual and never breaks down (QG) | mechanism | True of the payoff at expiry; the mark-to-market hedge ratio moves with IV and time. The cost (variance premium) is left out of his demo |
| 4 | Rolling puts raise long-run CAGR over buy-and-hold (QG) | trading | UNTESTED here; his evidence is a planted simulation. Proposed card Q3 with priced Cboe benchmark indices |

## What we could learn
- **DO WORSE (REPEAT of #7)**: our combination claims (Portfolio Book, factor blend "halves drawdown") rest on
  full-sample correlation. The one exception is `rule-a-portfolio-second-book`, which counted joint worst-5% days:
  that is the template. Now seen in 2+ items (hedge-funds shorts, this, engineer, vol drag), so #7 can be PROPOSED.
- **DON'T DO**: write down each sleeve's crisis behaviour by mechanism (long crash / short crash / independent) before
  measuring. Our book has two short-crash engines and no long-convexity leg.
- **DISAGREE (his evidence)**: a demo whose generator plants the crisis and tells the hedge when to pay proves the
  arithmetic only. We use synthetic data as a known-answer check (lesson #1), never as the evidence.

## Research ideas
Feeds `portfolio-construction` Q1 (proposed edits: vol-adjusted stress correlation, joint-tail count, ex-ante
mechanism labels) and proposed Q3.

## Quotes
- "Diversification is a statistical mechanism."
- "The statistical mechanism is going to fail exactly when you need it."
- "Real diversification is structural, not statistical."
- "All hedging is is trading uncertainty for certainty in the future."
