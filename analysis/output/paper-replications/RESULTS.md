# paper-replications: results

**Exploratory.** The designs come from the papers and were not tuned here, but nothing was pre-registered in this
repo, so nothing is banked as validated. Register row `paper-replications`. Script
`scripts/paper-replications/replicate.py`. Full output `results.json`.

## What was asked

Do the papers ChatGPT cited hold on our data when run with the papers' own designs?

## Data

`analysis/output/cot-crowding-programme/prices_daily.csv`: 33 Yahoo continuous front-month futures (8 FX, 4 equity
indices, 3 Treasuries, 18 commodities), daily, 2005-01 to 2026-07-31. That is the last full month before the lockbox.
That gives 247 months of strategy returns from 2006. Futures returns are excess returns, as in the papers.

Two data faults (DATA_SPEC §5 #13):
- 34 duplicate rows on US 4 July holidays; the later row is kept.
- The series aren't back-adjusted, so roll days jump. Every result is reported **raw** and **roll-cleaned**: the 162
  daily moves over 6× trailing σ are set to 0.

Both versions are shown below as raw / cleaned.

## 1. Moskowitz, Ooi & Pedersen (2012), *Time Series Momentum*

**Paper:** 58 futures, 1985–2009. A pooled regression of this month's vol-scaled return on the vol-scaled return h
months ago is positive and significant for h = 1..12 (t-stats mostly 3–6), then partly reverses. The 12-1 TSMOM
portfolio (sign of the past 12 months × 40% / ex-ante σ, held one month) earns a gross Sharpe of about 1.2.

**Here, 2006–2026:**

| | paper | raw | cleaned |
|---|---|---|---|
| lag regressions, h = 1..12: lags with t ≥ 2 | ~12 of 12 | 0 of 12 (best h = 10, t 1.96) | 0 of 12 (best h = 10, t 1.86) |
| TSMOM 12-1 portfolio, gross Sharpe (t) | ~1.2 | 0.30 (1.35) | 0.37 (1.69) |
| vol-scaled **long-only** on the same 33, Sharpe | — | 0.24 | 0.36 |
| TSMOM minus long-only, Sharpe | — | −0.00 | −0.06 |

| TSMOM Sharpe (cleaned) | 2006–12 | 2013–19 | 2020–26 |
|---|---|---|---|
| TSMOM | 0.07 | 0.46 | 0.70 |
| long-only | 0.59 | −0.09 | 0.46 |

| by asset class (cleaned) | FX | equity | bonds | commodities |
|---|---|---|---|---|
| TSMOM | −0.04 | 0.75 | 0.29 | 0.27 |
| long-only | −0.18 | 0.80 | −0.05 | 0.50 |

**Not replicated in this period.** The momentum book made about 5% a year at 14% vol (t 1.7, not significant).
That is no more than holding the same markets long with the same vol scaling. FX trend is zero, which matches the
banked `trend-following-fx` null. In equities, trend is just the upward drift.

The code was checked before reading this as a null. 2008, trend's best year in the literature, came out at +9.5%:
bonds, equity shorts, GBP and JPY paid, and commodities lost by staying long into the July 2008 reversal. The
equity-index positions flip short in February 2008 as the 12-month return turns negative, as they should.

## 2. Huang, Li, Wang & Zhou (2020), *Time Series Momentum: Is It There?*

**Paper:** the pooled t-stats in MOP overstate the evidence. Asset by asset, few markets show significant time-series
predictability, and TSMOM's return is close to that of a vol-scaled buy-and-hold.

**Here:** instrument by instrument, the sign of the past 12 months predicts next month at |t| ≥ 2 in **1 of 33**
markets on the cleaned data (2-year Treasury TU, t 3.5), against 1.6 expected by chance. The raw data has 2: TU, and
CHF with the wrong sign (t −2.0). 18 of 33 betas are positive. TSMOM minus
long-only is zero.

**Replicated.** This is the counterpoint ChatGPT mentioned, and on our data it wins.

## 3. Pitkäjärvi, Suominen & Vaittinen (2020), *Cross-Asset Signals and Time Series Momentum*

**Paper:** past 12-month bond returns predict equity returns positively, and past 12-month equity returns predict
bond returns negatively. A cross-asset TSMOM beats own-asset TSMOM.

**Here** (pooled across ES/NQ/YM/RTY and TU/TY/US, s.e. clustered by month):

| | paper sign | raw t | cleaned t |
|---|---|---|---|
| equity next month on past 12m bonds | + | −0.05 | +0.07 |
| same, with equity's own past 12m as control | + | +0.06 | +0.22 |
| bonds next month on past 12m equity | − | −1.47 | −1.00 |
| same, with own control | − | −1.17 | −0.81 |

| equity strategy, Sharpe (cleaned) | |
|---|---|
| long/short equity on the sign of past 12m bond returns | −0.13 |
| own-asset TSMOM | 0.75 |
| vol-scaled long-only | 0.80 |

**Not replicated.** Bonds → equities is zero. Equities → bonds has the paper's sign but isn't significant. The
cross-asset signal loses money against simply holding equities. A plausible reason, not tested here: the
stock-bond correlation turned positive in 2021–23, which removes the hedging logic the paper's mechanism relies on.

## Papers that can't be tested on this data

| Paper | Claim | Status in the repo |
|---|---|---|
| Cont, Kukanov & Stoikov (2014), *The Price Impact of Order Book Events* | order-flow imbalance explains same-interval price changes (R² ~65%), more so when depth is thin | never scored. Needs L1 order-book data (Databento CME is named in `plans/ANALYSIS_2_ROADMAP.md` and `EXHAUSTION_FRAMEWORK.md` H8). The paper's result is **contemporaneous**, so a direction test must show that lagged OFI predicts. `failed-auction-volume` (NT8, laptop) is the nearest registered study |
| Cont, Cucuringu & Zhang (2023), cross-impact of order-flow imbalance | lagged cross-asset OFI improves short-term forecasts, decaying within minutes | never scored; the same data need |
| Rossi (2013), exchange-rate forecasting review | a survey: beating the random walk on FX is rare and fragile | not a testable claim; the repo's FX direction nulls are consistent with it |
| FX sign/magnitude decomposition (e.g. Anatolyev & Gospodinov 2010) | modelling P(up) and the size separately improves direction forecasts | not run as such. The magnitude half is the repo's validated vol stack; the direction half has no validated input to feed it |
| Bailey & López de Prado (backtest overfitting, deflated Sharpe) | method, not a market claim | already used: deflated Sharpe in `portfolio-book`, `meta-label-proper` |

## Verdict

**NULL (exploratory)** for MOP time-series momentum and PSV cross-asset momentum on 2006–2026 futures. Huang et al.'s
critique **replicates**. This is consistent with the literature's own account of trend decay after 2009, and with the
repo's banked results (`trend-following-fx` null, `portfolio-book` trend sleeve Sharpe 0.26, `cot-trend-filter`
showing trend Sharpe 0.10 after 2016).

## Caveats

- 20 years and 33 markets, against the paper's 25 years and 58. Sharpe SE ≈ 0.22, so a true Sharpe of 0.5 would
  usually show up, and one of 1.2 certainly would. A true 0.3 can't be ruled out. "TSMOM still earns ~0.3, no more
  than long-only" is the fair reading.
- The data is Yahoo continuous futures, not back-adjusted. The cleaned run removes the worst roll jumps, but a proper
  ratio-adjusted series could move commodity numbers.
- Gross of costs. Costs would only lower these numbers.
- The papers' own samples (1985–2009, 1980s–2016) aren't covered here, so this doesn't say the papers were wrong.
  It says their effects aren't visible in the period you'd be trading.
