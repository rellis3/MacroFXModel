# Volatility Risk Premium: How Options Markets Price Fear

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=kmAE9ZhQ0jU |
| ReelScribe id | j576y2cfqdan1ythnbdjzyd9sx8j2aak · ~20 min |
| Notebook | `2026 Video Lectures/119. Volatility Risk Premium How Options Markets Price Fear/` (`riveot.ipynb`, `optdata.py`) |
| Recorded | unknown (2026 lecture series, no. 119) |
| Processed | 2026-11-12 |

## Lesson
Implied vol (backed out of option prices; forward-looking) and realised vol (a statistic of past returns; a latent
process you can only proxy) track each other on the S&P 500 but are built in completely different ways. Selling options
is selling portfolio insurance, and insurance has to be overpriced on average or nobody would write it: that is the
volatility risk premium. He shows it by plotting today's IV against realised vol 30 trading days later and noting the
fitted slope is below 1, and by the IV histogram sitting to the right of the RV histogram. Then he turns it round:
being long insurance can also pay, because a hedged book loses less in a crash and compounds faster afterwards. Both
hold at once, and he puts the difference down to timing and portfolio construction. "Simple in design, difficult to
implement in practice." Tenor, structure, sizing and rolling are all left open.

## Approach
- **Question**: is IV systematically above the realised vol that follows? Benchmark: the y = x line ("if the market
  was always correct, every point would be on this line"). Description, not a trading backtest.
- **Mechanism first**: he wants "something good to cling to... some sort of market structure" before trusting a
  statistic. Here the structure is insurance economics (someone has to be paid to hold the tail). This repeats the
  "name the edge source" idea (method lesson #4): he files VRP as a risk premium, not a forecasting skill.
- **Proxy choice up front**: realised vol "is actually a latent process", so the rolling window is a researcher's
  choice. The animation shows a short window outpaces IV on average and a long one lags it and flattens the
  relationship. "So, which window do we choose? Welcome to quantitative research." He shows the sensitivity but
  doesn't settle it.
- **Evidence**: (1) a 10-year IV/RV overlay; (2) the window-sensitivity animation; (3) IV_t against RV at t+30 trading
  days, with an expanding-window OLS line; (4) unconditional IV and RV histograms; (5) a stylised insurance
  simulation (seller vs insured book through one crash).
- **Kill rule**: none stated. Outliers (crashes) are set aside: "we're not talking about those right now. Nobody
  knows when a crash or crisis is going to happen."
- **Tail risk**: handled with the simulation and a portfolio view: he keeps a "convexity layer", takes 15% in a 20% year
  to pay for it, and monetises it in a crash ("roll down and monetize"). That is a position, not a test.
- **Costs**: never modelled. No bid-ask, margin, delta-hedging or option P&L anywhere.

## What the code actually does
Data (`optdata.py`): IBKR `OPTION_IMPLIED_VOLATILITY` daily bars for SPX over "10 Y" (IB's own 30-day IV index for the
underlying, not a surface or a VIX calc). RV = rolling 21-day sample standard deviation of daily log returns (demeaned),
× √252.
1. **The forward test has a horizon mismatch.** `forward_30d_realized_volatility = realized_volatility.shift(-30)`.
   RV21 dated t+30 covers returns t+10 … t+30, but a 30-calendar-day IV at t prices roughly t+1 … t+21. Only about 12
   of the 21 days overlap. The target should be RV over exactly the days the IV prices.
2. **The units differ from the formula.** The markdown regresses RV² on IV² (variance, the tradeable unit), but the
   code regresses vol on vol (`np.polyfit(iv, rv_fwd, 1)`).
3. **The inference is from the slope.** "Slope less than y = x, meaning implied volatility is overstated" doesn't follow.
   The premium is the mean of IV − RV (or IV² − RV²). If the intercept is positive (the usual case for this regression;
   his printed value isn't in the transcript), a slope below 1 means the line crosses y = x, and at low IV the fit says
   RV comes in *above* IV. A slope below 1 is also what mean reversion and a noisy
   regressor produce on their own. The intercept is printed but never discussed.
4. **Daily overlapping observations.** Each RV21 shares 20 of 21 returns with its neighbour, and there is no standard
   error, interval or out-of-sample split. R² and correlation are printed but never used.
5. **The window animation smooths the already-smoothed RV21 again** (trailing 1–126-day means), at the same date as IV.
   It shows the proxy problem, not a forecast.
6. **The tail evidence is synthetic.** It's one path (seed 7) with a hand-placed crash (−1.8%/day for 34 days plus −5.5%
   and −4% days), a 5.5%/yr premium and a floor at 85. The 31% seller drawdown against 18% insured and 49% market
   comes from those settings, not from data.
7. **There's an internal tension.** The video settles seller vs buyer by "timing", but the notebook's summary
   recommends "systematic, rules-based volatility strategies... rather than relying on market timing".

## How this compares with how we measure it
| Point | QG | This desk |
|---|---|---|
| IV source | IBKR SPX IV index | CME CVOL 30d (2016+); Black-76 iv30 from CME settlements (2020-09+, `iv-forecast`); CBOE VIX/VXN |
| Horizon match | RV21 at t+30 (t+10…t+30) vs 30d IV | `forge/VRP_FORECAST_PREREG.md`: RV over D+1…D+21 exactly, entry at month-end close |
| Overlap | daily, overlapping | non-overlapping months (775 instrument-months) |
| Unit | vol on vol (formula says variance) | short-variance payoff (IV² − RV²)/(2·IV), vol points |
| Costs | none | 0.4 and 0.8 vol points per round trip |
| Tail | one synthetic path | worst month −37.8, p5 −4.5 vol pts reported; Portfolio Book short-variance sleeve skew −9 |
| Result | "substantial edge" | FX/gold: IV > RV in 75% of months (+0.98 vol pts), but always-short nets +0.17 (t 1.3) at 0.4 cost and −0.23 at 0.8. The premium is about one bid-ask wide (`analysis/output/rangebook/VRP_RESULTS.md`, commit 8f82e725). NQ: realised moves ~16% under VXN at 1–20 sessions (`vix-brownian-scaling`, CONTEXT) |

**The rich-vol rule is a different object.** `js/paperRecordCore.js` flags a rich day when IV30 ÷ *trailing* RV20
(21 NY closes, demeaned, close-to-close) ≥ 1.182 (FX/gold, top third 2016–22) or ≥ 1.53 (CBOE indices). It then
trades **breaks** of the Vol Forecast lines, which is a continuation bet, not a vol sale. So the desk's one passing
rule leans the opposite way to "IV is overstated": it bets that rich IV over a quiet trailing RV marks a move coming.
The two fit together, since E[RV_fwd] < IV (the premium) and E[RV_fwd | high IV/RV20] > RV20 (IV beats HAR, `iv-forecast`)
can both hold. But the rule has never measured which half it rides: realised catching up, or premium. It is also QG's
first chart ("IV − RV latest spread", backward) rather than his regression (forward). Anything that calls the flag "VRP"
mislabels it.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "Statistically implied volatility is... overstated" (QG), SPX | mechanism | PARTLY: FX/gold premium real, 75% of months, +0.98 vol pts, but ~1 spread wide (vrp-forecast, results file only, not in the Evidence Book). NQ ~16% (`vix-brownian-scaling`) |
| 2 | "There's substantial edge" in selling it (QG) | trading | PARTLY: FX net t 1.3 at 0.4 cost, negative at 0.8; VIX-squared proxy sleeve Sharpe 0.89 but overstated against Cboe PUT (`portfolio-book-validate` T6, corr 0.58) |
| 3 | The RV window choice "dramatically" changes the IV–RV statistic (QG) | method | ON FILE as a lesson: method lesson #10 (second source) |
| 4 | Buying insurance also pays in geometric terms: a smaller drawdown, then faster compounding (QG) | mechanism | UNTESTED here (long convexity sleeve never built); see card 2 |
| 5 | Both sides can profit; "the difference is timing" (QG) | trading | UNTESTED; stated, not shown with data |
| 6 | Hedge funds mostly trade "some variation of short vol" (QG) | industry | not testable |

## What we could learn
- **Horizon-matched, non-overlapping, variance-unit, costed VRP**: ALREADY DO (`forge/VRP_FORECAST_PREREG.md`). His notebook
  shows what goes wrong without it. Independent support for method lesson #11 (no overlapping windows), which is now in
  2 QG items.
- **The proxy window decides the statistic**: REPEAT of #10 (the RV-window animation). That makes 2 QG items, so it is ready to propose.
- **The window the forecast prices must be the window you score**: ALREADY DO in vrp-forecast. It's a naming hazard on the
  rich-vol flag (backward ratio, not a premium). Proposed: one line in `data-rules` lookahead-and-oos ("an IV-vs-RV
  outcome uses RV over exactly the days the IV prices, t+1…t+h").
- **Bias is the mean error; the slope is efficiency.** Read the intercept and slope jointly (Mincer–Zarnowitz,
  α = 0, β = 1, HAC SE) and the mean of IV − RV. Never read bias from a slope alone: DO WORSE (MZ used once, in
  `forge/VMC_NQ_VOL_INCREMENT_PREREG.md`; `iv-forecast` uses DM loss tests). WATCH.
- **Judge a short-premium book by its worst month and against a real tradeable benchmark**: ALREADY DO
  (`portfolio-book-validate` T6 against Cboe PUT; vrp-forecast tail stats).
- **"Name the edge source"**: REPEAT of #4. VRP is the textbook risk-premium case.

## Research ideas
1. **Is the rich-vol flag a premium or a forecast?** · variable: on each day, split ln(IV30/RV20) = ln(IV30/RV_fwd)
   [premium] + ln(RV_fwd/RV20) [catch-up], RV_fwd over sessions D+1…D+h · condition: IV/RV20 tercile (the 2016–22
   edges the rule uses) · horizons h = 1, 5, 21 · noise threshold: block-bootstrap CI; placebo of days matched on RV20
   level · benchmark: bottom/middle tercile, and HAR's own RV_fwd forecast · changes: if catch-up dominates, rule A is a
   vol-forecast trade and pairs with IV-based sizing. If premium dominates, the break edge doesn't come from vol
   expansion, and the forward record has no mechanism behind it. → `model-audits.md`. Screening: PARTLY ON FILE (BREAK_IVRV
   check 4 is only a tercile ordering; vrp-forecast is unconditional); decomposition UNTESTED. Data: CVOL 2016+,
   settlement iv30 2020-09+, local M1.
2. **Insurance seller vs buyer, judged geometrically and in stress.** · variable: monthly excess returns of Cboe PUT
   (put-write), BXM (buy-write = covered call), PPUT (5% put protection), VXTH (tail hedge) against SPX TR · condition:
   stress windows (2008, 2020-03, 2022, 2025-04) against calm · horizons: monthly, 1y rolling · noise threshold: block
   bootstrap on the geometric-return and max-drawdown differences · benchmark: SPX TR and the book's VIX-squared proxy
   sleeve · changes: whether the Portfolio Book swaps its proxy sleeve for a real benchmark series and whether a
   convexity sleeve lifts the blend's geometric growth (method lessons #7, #8) → `portfolio-construction.md`. Screening:
   PARTLY ON FILE (PUT used once, in T6; nothing on long convexity). Data: PUT on hand; BXM/PPUT/VXTH are free Cboe downloads.

## Quotes
- "This particular business is the business of selling insurance... if selling insurance wasn't profitable, then boy, nobody would do it."
- "Realized volatility is actually a latent process. In other words, we know it exists, but we can't directly observe it."
- "So, which window do we choose? Welcome to quantitative research."
- "The strategy is simple in design, but it's difficult to implement in practice."
- "Though the individual contract is a zero-sum game, statistically both portfolio insurance and selling portfolio insurance can be profitable."
