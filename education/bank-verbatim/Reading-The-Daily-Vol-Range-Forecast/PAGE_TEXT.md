<!-- https://cog000.github.io/Reading-The-Daily-Vol-Range-Forecast/ | Reading the Daily Vol & Range Forecast — A Working Manual -->
Colez Trades
Quantitative & Macro Insights
C.OG
Colez Trades The Daily Forecast
Playbook · Reading the Forecast Daily Series
The Playbook Daily Forecast
# Reading the daily *vol & range* forecast.

A working manual — how to take the published numbers and turn them into clean, actionable levels on your TradingView chart.

Worked example · Gold spot · Tue 19 May 2026 Read time · ~10 min
Today's publication · sample
### Vol & Range Forecast

For session: Tuesday, 19 May 2026
Gold
Volatility (annualized)
26.61%
High – Low range
2.65% / 3.23%
Open – Close move
1.28% / 2.10%
EUR / USD
Volatility (annualized)
5.59%
High – Low range
0.55% / 0.68%
Open – Close move
0.26% / 0.42%
NQ
Volatility (annualized)
25.37%
High – Low range
2.47% / 3.09%
Open – Close move
1.16% / 2.02%
Volatility · annualized
Median · 50th percentile
Stretch · 75th percentile
How to read the post
Each instrument carries three numbers. One is a context reading. The other two are pairs — a **median** figure (the central case) and a **75th-percentile** figure (the stretch case). The median is where the work lives; the 75th is there for the tail.

§01 · The Metrics
## What each *number* means.

Before any chart work, the numbers have to land. There are three of them per instrument, and they do not measure the same thing. One sets the temperature; the other two set the geometry of the day.

[SVG: ]
01 · Context
#### Volatility (annualized)

The temperature reading. An **annualized** figure for how much price is expected to move, on average, scaled up to a full year of trading.

It is not a level on the chart. It is the answer to "*how energetic is the regime?*" — useful for comparing one day to another, or one instrument to another.

Gold · 26.61% annualized = a quietly elevated regime for the metal.
[SVG: ]
02 · Geometry
#### High – Low range

The **full range** between the day's high and low, expressed as a percentage of the daily open.

This is the day's *amplitude*. It tells you how wide the candle prints from top to bottom, independent of direction.

Gold · 2.65% median = the expected high-to-low range, expressed as a fraction of the day's open.
[SVG: ]
03 · Drift
#### Open – Close move

The **directional displacement** from where the day opens to where it closes, again as a percentage of the open.

This is the day's *body*. It strips out the wicks and tells you how far price travels net — regardless of how widely it ranges within the session.

Gold · 1.28% median = the expected open-to-close displacement, up or down, as a fraction of the open.
Range vs. Move
The two numbers are **not** the same thing. A 3% range with a 1% move is a busy, two-way day that closes near the open. A 3% range with a 3% move is a one-way trend day. The pair tells you the *shape* of the day, not just its size.

§02 · Probability
## Median vs. *75th percentile*.

A forecast is never a single number — it is a distribution. Two figures get published because two points are enough to sketch the shape of that distribution without drowning the post in noise.

The **median** is the central case. It is the value that splits the world of possible outcomes in half: half of comparable days come in below it, half come in above. The **75th percentile** is the stretch case — the level only one day in four exceeds.

To anchor this in something real, the chart below is the *actual empirical distribution* of Gold's daily high-low range over the past 1,658 sessions — roughly six and a half years of market data. The shape is what you should expect from any range distribution: **right-skewed**, with a floor at zero and a long upper tail of unusually wide days.

Gold · Daily High–Low Range · 1,658 sessions · 2019 → 2026
What range distributions *actually* look like
[SVG: 0% 1% 2% 3% 4% TYPICAL · 1.25% historical median BUSY · 1.72% historical 75th TODAY · 2.65% ≈ 92nd percentile of history SMALLER DAY LARGER DAY Daily High–Low range, % of open]
Show All Highlight Typical Highlight Busy Highlight Today
What this tells you
The empirical median for Gold sits at **1.25%** — that's the day-to-day "normal" range. The empirical 75th sits at **1.72%** — a normal-but-busier-than-average day. The day-19-May forecast median of **2.65%** lands near the **92nd percentile** of unconditional history.

Read in plain English: the forecast for this Tuesday isn't just saying "Gold will move today" — it's saying *Gold is expected to move wider than 9 days out of 10 of its own history*. That's the regime signal embedded in the number.

Why we lead with the median
The median is the **most representative** value of the day's expected behaviour. Half the time you'll see less, half the time more — but every value near the median is roughly equally plausible. The 75th sits further out in the tail: it is exceeded less often, but when it is, the day is *unusually* wide even relative to today's expectation.

Treat the median as the working hypothesis. Treat the 75th as the stretch — the level that says "if today decides to be a bigger day than the forecast already expects, this is where bigger looks like".

One last point on the statistics. The forecast is a probability statement, which means individual days will hit, miss, and overshoot. The **calibration is over many days**, not any one. If you measured the published median against actual outcomes over a full quarter of forecasts, roughly half the realised ranges would print below it and half above — that is what "median" means.

§03 · The Session
## The daily *00:00 → 00:00* window.

Every forecast is anchored to a specific session. For these instruments, the session is defined by the **00:00 to 00:00** boundary on the chart — one full calendar day. This is the window the forecast describes: not the New York session, not the London session, but the full 24-hour candle.

Why does it matter? Because if you draw your levels against the wrong session, every line you place will be off. The open you mark must be the **00:00 open**. The high you eventually anchor the range to must be the high within that *same* window. The discipline is purely mechanical, but everything that follows depends on it.

00:00 OPEN
00:00 CLOSE
One forecast window · 24 hours
00:00 06:00 12:00 18:00 00:00
Mechanical Rule
On TradingView, use a **vertical line tool** at the start of the day's 00:00 candle and another at the next day's 00:00 candle. Everything you mark — open level, high anchor, low anchor, expected close band — lives strictly between those two verticals.

§04 · The Walkthrough
## A live worked example — *Gold, Tuesday 19 May 2026*.

The forecast for this day was a **2.65%** median high-low range and a **1.28%** median open-close move. Below is the exact process — six steps — for translating those two percentages into lines on the chart, and then watching how price interacts with them as the session plays out.

[SVG: ]
##### Vertical Line

For marking the 00:00 session boundaries.

[SVG: ]
##### Horizontal Ray

For pinning the daily open and projected high / low levels.

[SVG: ]
##### Price Range Tool

For applying the % range directly to the chart and reading the absolute price displacement.

[SVG: ]
##### Rectangle / Box

For drawing the open-close envelope ±% around the daily open.

Define the window
Mark the 00:00 → 00:00 session.
STEP 01 · SESSION BOUNDARIES
[IMAGE figures/fig01.png] Step 1: marking the daily session 00:00 boundaries on a TradingView chart
Drop two vertical lines on the chart — one at Tue 19 May 00:00 and one at Wed 20 May 00:00. Every level you place from here on lives inside that band.

This step is unglamorous and easy to skip. Don't. Marking the boundary first forces you to anchor against the same window the forecast was written for. If you read the open off a 09:30 candle or a 17:00 candle, every downstream level drifts.

TradingView
Vertical Line tool → click on the candle that opens at 00:00. Repeat at the next day's 00:00.
Anchor the reference
Mark the daily open.
STEP 02 · DAILY OPEN · 4,573.995
[IMAGE figures/fig02.png] Step 2: marking the daily open level at 4,573.995
The 00:00 candle on Tuesday 19 May opens at **4,573.995**. That single price is the reference point for *every* percentage in the forecast — the high-low range, the open-close move, and the 75th percentile of each.

A horizontal ray from this level, extended right across the session, is enough. Label it cleanly. Everything else is measured against this line.

TradingView
Horizontal Ray → snap to the open of the 00:00 candle. Label it Open.
The Math
Open · 4,573.995 · Range · 2.65% · Open-Close · 1.28%
Apply the range
Project the high-low range from the first extreme.
STEP 03 · HIGH-LOW RANGE · −2.65% FROM HIGH
[IMAGE figures/fig03.png] Step 3: applying the 2.65% range from the day's high using the price range tool
The high-low forecast is a **magnitude** — it tells you how far the day stretches between its two extremes, but not which one prints first. The practical move is to *wait until one extreme reveals itself*, then project the range from there to anticipate the other.

On this day, the high arrives early — gold tags **4,589** right after the 00:00 open. That sets the upper anchor for the session. Using TradingView's *Price Range* tool, project **−2.65%** down from the high. The tool reads back −2.65% — a projected low in the 4,467 zone.

TradingView
Price Range tool → click at the day's high, drag down until the readout shows −2.65%. The bottom of the box is your projected low.
The Rule
If the **high** prints first → project the range **down**. If the **low** prints first → project the range **up**.
Pin the target
Extend a horizontal level at the projected low.
STEP 04 · PROJECTED LOW · 4,467.966
[IMAGE figures/fig04.png] Step 4: extending a horizontal ray at the projected low of 4,467.966
The bottom of the price-range box gives you a number — **4,467.97**. Convert that from a box edge into a tradable level by extending a *horizontal ray* at that exact price across the session.

This is the day's **expected low** under the median scenario. It is not a guarantee, it is not support in the technical sense — it is the level where, if the day plays out at its central expectation, price should bottom out.

TradingView
Horizontal Ray → snap to the bottom edge of the price-range box. Label it Expected Low.
Observe the outcome
Watch how price interacts with the level.
STEP 05 · REALISED LOW · TICK-PERFECT
[IMAGE figures/fig05.png] Step 5: the projected low is hit almost to the tick, demonstrating accuracy
The session's actual low prints at the highlighted candle — right at the projected **4,467** band. Gold then rotates, builds a base, and the day's downside is functionally resolved.

This is the cleanest possible outcome: the median range was the *realised* range. It happens often enough to be useful, and rarely enough to remind you that the median is a *central* expectation, not a ceiling. Some days you'll see the level rejected before it's tagged. Some days you'll see it punctured. Both are inside the distribution.

What this tells you
When a session tags the projected extreme cleanly and rotates, the market has *filled its expected envelope*. Further extension would require a 75th-percentile-style day — possible, but no longer the central case. That's a useful piece of information for risk management.

Layer the drift
Apply the open-close envelope around the daily open.
STEP 06 · OPEN-CLOSE ENVELOPE · ±1.28%
[IMAGE figures/fig06.png] Step 6: applying the open-close move as a symmetric envelope around the open
The open-close move is symmetric around the open because the forecast doesn't specify direction — only magnitude. Project the **±1.28%** envelope above and below the open level using the price-range tool.

On a 4,574 open, that gives you a band from roughly **4,515** up to **4,632**. The close is expected, under the median scenario, to land somewhere inside that band. The two extremes of the band are the points at which a one-directional close would be considered "as far as a normal day goes" — the median exhaustion of the daily trend, in either direction.

TradingView
Price Range tool → click on the open, drag **up** to +1.28%, then again from the open **down** to −1.28%. Two boxes, one envelope.
Reading it
A close *inside* the band = a normal session. A close *outside* the band = a stretch / 75th-style day, with a directional bias confirmed.
Six tools, two percentages
The entire walkthrough uses two numbers from the daily post — the high-low median and the open-close median — and turns them into four chart objects: a session boundary, an open ray, an expected-low (or high) ray, and a symmetric close envelope. That's the whole apparatus. Everything else is just observation.

> The forecast doesn't tell you *what happens*. It tells you what *typical* looks like — so the chart can tell you when today isn't. The frame, not the prediction

§05 · Interpretation
## Reading the *interaction*.

Once the levels are on the chart, the job becomes reading how price behaves around them. Two relationships do the heavy lifting — what the high-low range tells you, and what the open-close envelope tells you. Neither is a trade signal on its own; both are *information* about how the day is unfolding relative to its expectation.

#### The high-low range gives you exhaustion zones

When price reaches the projected low (or high) and rotates, the message is mechanical: the day has used its budget. The market has covered the distance the forecast said it would. Continuation from that point isn't impossible, but it's no longer the base case — it would require today to become a wider-than-median day.

This is most useful as a **caution flag for chasing**. If you're considering a short into a low that's already been tagged at the median range, you're betting on a 75th-percentile day. Sometimes correct. Often not.

#### The open-close envelope frames the directional drift

If the high-low describes *how wide*, the open-close describes *how far net*. Two days can carry an identical high-low range and produce very different close locations — one closes near the open after roundtripping, the other closes at the extreme.

Watching where price sits inside the open-close band, particularly into the back half of the session, tells you which scenario is more likely. A close drifting toward the upper edge of the band is a directional-up median day. A close hugging the open is a chop day. A break beyond the band is the stretch.

§06 · Why This Matters
## The forecast as *foundation*.

The walkthrough above is the entry point, not the destination. The reason a calibrated daily forecast for volatility and range is worth building at all is that it sits underneath almost *every* decision the next session will demand. The chart work in §04 is one application of it. There are several others — and each, on its own, justifies the apparatus.

#### Position sizing becomes far superior

Most traders fail not because their direction is wrong but because their size is wrong relative to *future* volatility. A mediocre directional signal with strong volatility targeting routinely outperforms a strong directional signal with poor risk calibration — the consistent finding of essentially every honest backtest in the literature.

With a forward-looking estimate of tomorrow's regime, position size can be calibrated to a **conditional distribution** rather than to a static rule. The same notional risk on a 2.65% day becomes a fraction of what it would be on a 0.8% day. Over a quarter, the compounding effect on risk-adjusted return is not subtle — it is the difference between sizing into noise and sizing into signal.

#### Stops and targets sit where they belong

Stops placed inside the day's statistical noise get taken out by ordinary fluctuation. Targets placed beyond the day's reachable bound never fill. Both are common, both are expensive, and both are direct consequences of operating without a sense of the day's expected envelope.

Anchor stops and targets to the **forecasted range** rather than to a fixed pip or point distance, and the geometry of every trade improves. Stops live outside the noise band. Targets live inside what the day can plausibly deliver. The trade no longer needs a heroic day to work.

#### Intraday reads fall out for free

Once the expected range is on the chart, price action against it carries information that is otherwise invisible. The classic case:

Worked read · midday
Expected range = **0.6%**. By midday, price has already covered **0.55%**. The breakout-continuation odds collapse; the mean-reversion probability rises sharply.

That single piece of conditional reasoning is unavailable without a range forecast. With one, it generalises across the whole intraday toolkit — stop placement, profit-target sizing, breakout filtering, expected-excursion modelling, execution timing, trade-management rules. The forecast is the substrate that makes each of them readable.

#### Regime shifts surface in advance

When **forecasted** volatility diverges meaningfully from **recent realised** volatility, the divergence itself is often the most actionable signal of the session. A forecast climbing into the upper deciles of its history while the last week has been quiet is the model telling you something the candles have not yet drawn.

That early signal is the difference between adapting to a regime change as it's happening and adapting to it after the fact — usually two or three sessions too late, with the largest losses already realised.

The foundation, not the ceiling
The chart work in §04 is *one* application of the daily forecast. Position sizing, range-anchored stops and targets, intraday filtering, and regime detection are others — and each, on its own, would justify building the apparatus. The walkthrough is where the work begins. What it opens up extends considerably further than a single set of lines on a chart.

> Know the day's expected envelope, and almost every decision the session demands gets *conditionally* easier. On the forecast as foundation

§07 · The Workflow
## The *daily* checklist.

Reduce the walkthrough to the seven moves that need to happen, in order, every day, for every instrument you're tracking. The post arrives. You sit down at the chart. You do this.

### Per instrument · seven steps

- 1 Read the day's **median** figures for high-low range and open-close move. Note the 75th as the stretch reference.

- 2 Open the instrument on TradingView. Drop vertical lines at the day's **00:00 open** and the next day's **00:00**.

- 3 Mark the **daily open price** with a horizontal ray. This is the anchor for every percentage that follows.

- 4 During the session, identify the **first extreme** to print (high or low). Project the high-low range % from that extreme to the opposite side.

- 5 Extend a **horizontal ray** at the projected opposite extreme. This is the expected boundary of the day's range under the median.

- 6 Apply the open-close move as a **symmetric envelope** — ±median% around the open. This is the expected close band.

- 7 Observe. Note where price tags the levels, falls short, or overshoots. Don't grade a single day — the calibration is over the sample.

The Daily Forecast
Published once per session for Gold, EUR/USD, and NQ. Numbers are statistical forecasts of daily range and directional displacement — not trade recommendations, not technical levels, not certainties.

For educational and informational purposes · Not financial advice
