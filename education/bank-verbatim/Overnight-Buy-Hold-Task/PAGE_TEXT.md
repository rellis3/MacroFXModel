<!-- https://cog000.github.io/Overnight-Buy-Hold-Task/ | Research Task — Overnight Hold vs Buy & Hold -->
Colez*Trades*
Quantitative & Macro Insights
C.OG
Research Task · Nasdaq & Gold
# Overnight Hold vs *Buy & Hold*

Does holding an instrument **only overnight** beat simply holding it the whole time? We run it on two markets chosen because they should disagree — then take the trades through the prop firm toolkit to answer the separate question that actually decides funding: **would it survive the rules?**

Entry **20:00 UK**· Exit **14:30 UK**· **M1** data· **NAS100** + **XAUUSD**
Why this one is worth your time
## The bar for a funded account is *lower than people think* — and it isn't the bar they're training for.

Most traders assume a prop challenge demands a brilliant strategy. It doesn't. It demands a **modest return delivered in a particular shape** — without tripping a daily loss limit, a drawdown line, or a consistency cap. Those are two completely different problems, and the second one is far more solvable than the first.

That gap is where the opportunity lives. A boring strategy with small, regular, well-behaved returns can pass comfortably while a spectacular one with a single violent drawdown fails on day three. The work below is how you find out which one you're holding — **before you pay a fee to find out the expensive way.**

What you risk
One challenge fee
Known in advance. Capped. Identical whether you fail on day one or day thirty. It is the only number you can lose.

versus
What you're playing for
Trading capital
Capital many multiples of that fee, with the firm carrying the downside rather than your own account.

What actually decides it
Four rules — **daily loss**, **max drawdown**, **profit target**, **consistency**. Every single one of them is testable on historical trades, for free, before a fee is ever paid. That is the whole point of this task.

01
#### Most challenge fees are lost before the first trade

People test whether a strategy makes money. They almost never test whether it makes money *in the shape the rules allow*. The account isn't usually lost to a bad strategy — it's lost to a good strategy meeting a rule nobody modelled.

02
#### You can know your odds before you pay

Run the trade history through the toolkit and you see it directly: which days breach the daily cap, how close the trailing drawdown comes, how many trading days it takes to reach target, and whether one lucky gap is quietly carrying the entire result. That is the difference between an informed attempt and a donation.

03
#### Capital stops being your ceiling

Once you hold something that provably survives the rule set, the constraint changes completely. You're no longer limited by the size of your own account — and the same tested strategy can be put in front of more than one firm.

04
#### The method outlives the strategy

Whatever this particular test concludes, you finish it owning a repeatable pipeline: source, clean, cost, measure, export, rule-check. Every future idea you have runs through the same machine — and gets an answer in an afternoon rather than a quarter.

Said plainly
A backtest is evidence, not a guarantee — forward results differ, costs move, and a failed challenge still costs the fee. The purpose here isn't certainty. It's to be **wrong on a spreadsheet instead of wrong with your money**, and to know which of the two you're looking at before you commit anything.

What we're testing
## One rule, two markets, *opposite characters*.

Enter long at **20:00 UK**, exit at **14:30 UK** the following session. Compare that against simply buying and holding across exactly the same window. We run it on Nasdaq and gold together *because they behave very differently overnight* — and the contrast is the interesting part.

NAS100 / US100
#### Expect something here

The overnight effect is well documented in equity indices with a solid body of research behind it. The gross result is likely to look reasonably strong. The real question is whether it survives costs.

XAUUSD
#### Expect much less

Gold trades close to 23 hours a day, so "overnight" barely means anything, the effect is far weaker, and swap costs bite harder. Do not be disappointed — this leg is a control, not a failure.

Before you start
#### If the two instruments reach opposite conclusions, that *is* the finding.

A result that holds on one market and collapses on another tells you the effect is structural rather than universal — which is far more useful than two vague half-answers. Write the divergence up properly rather than treating the gold leg as a write-off.

The pipeline · seven stages
## Each stage has a gate. *Don't pass it until the gate clears.*

The order matters. An error early doesn't produce a slightly wrong answer — it produces a completely fictional one that still looks perfectly plausible. Each stage below carries the single check that catches its own failure mode.

01
### Source the data Foundation

M1 one-minute data · **NAS100 / US100** and **XAUUSD** · from the data channel in the server
Minute resolution specifically — not M5, not hourly. The 14:30 exit sits inside US cash-open volatility, and MAE has to be measured minute by minute later on.

- Find the overlapping date range across both instruments and trim both to that common window. If gold carries three more years than Nasdaq, the comparison is meaningless.

- Before anything else, establish what timezone the source data is actually in. Broker feeds are usually GMT+2 or GMT+3 with their own DST rules — not UTC, and not UK time.

- Get that wrong and every entry and exit in the entire backtest is offset by hours. The results will look completely plausible while being fiction.

Gate
Find a known high-impact release — an NFP print on the first Friday of a month — and confirm the volatility spike lands on the exact minute it should. That single check catches the majority of timezone errors immediately.

02
### Prepare it Where backtests quietly fall apart

Convert to **UK local time** · handle the **GMT ⇄ BST switchover**
UK clocks change on different dates to US clocks, so for a couple of weeks each spring and autumn the gap between UK time and the US session shifts by an hour. The 20:00 and 14:30 boundaries must stay fixed in UK local terms throughout — that's the whole reason they're specified that way.

- Decide and document the fill rule for a missing minute: first tick after, or last tick before. Either is defensible; it just has to be consistent across both instruments and both directions.

- Handle session edges explicitly — Friday 20:00 has no following session so no trade opens; Sunday reopen differs between gold and Nasdaq; half-days around Christmas, New Year, Thanksgiving and Independence Day; broker maintenance gaps.

- Log every skipped or gap-filled day to a separate exceptions file rather than forward-filling quietly. If an edge shows up, you need to prove it isn't an artefact of fifty invented prices.

Gate
Report total expected trading days against actual trades generated. If those two numbers are far apart, stop and find out why before going a single step further.

03
### Build the strategy And its benchmark

Long only · unlevered · fixed notional · one position at a time
Enter long at 20:00 UK, exit 14:30 UK the following session. No overlapping or pyramiding. Fixed notional so the equity curve isn't distorted by position-sizing effects — we're isolating the overnight effect itself before layering anything on top.

- Use the actual traded price at both timestamps, not a synthetic mid or a bar average — and apply whatever convention you pick identically to the benchmark.

- Build the benchmark on exactly the same footing: continuous buy & hold, same instrument, same notional, same price convention.

- The benchmark starts on the date of the **first overnight trade** and ends on the date of the **last one** — not the first and last row of the raw file.

Gate · integrity check
Run the mirror test — enter 14:30, exit 20:00 — to isolate the intraday session return. Overnight plus intraday should roughly reconstruct buy & hold. If the two components don't add back up, there's a bug in the pipeline. It costs almost nothing once the rest is built.

04
### Apply the costs Do not skip this

Spread · swap · triple-swap Wednesday · slippage · **before believing a single result**
This section decides whether the whole thing is real. Every trade here is held through rollover by definition — so this strategy structurally pays a financing charge that buy & hold pays far less often per unit of exposure. That is the crux of the entire test.

- Spread on **both legs**, entry and exit — ideally wider at 20:00 for gold, where liquidity is thinner outside the main session.

- Overnight swap and financing on **every single trade**. Check whether triple-swap Wednesday applies: if it does, roughly one trade in five carries three times the cost.

- Slippage on both legs. The 14:30 exit sits right in the US open, where fills can be meaningfully worse than the printed price.

Gate
Produce gross and net **side by side in the same table**. Gross tells you whether the effect exists at all; net tells you whether it's tradeable. If gross is strong and net is flat, that is not a failed test — it's a real finding, and it should be stated plainly rather than buried.

05
### Measure it One table per instrument

Overnight strategy and buy & hold in **adjacent columns**, so differences read immediately
Total return
Annualised return (CAGR)
Max drawdown — % & duration
Sharpe ratio
Sortino ratio
Calmar ratio
Win rate
Profit factor
Avg win vs avg loss
Largest win / largest loss
Longest losing streak
Total trades
Std dev of returns
The one that changes the answer
#### Time in market

The overnight version is exposed roughly 18.5 hours in every 24-hour weekday cycle, and none of the weekend. Work out true exposure and report **return per unit of exposure** alongside raw return. Eighty percent of the return on forty percent of the exposure is a better strategy, not a worse one — and the headline number hides that completely.

The one that decides if it's new
#### Correlation to buy & hold

Correlate the overnight returns against buy & hold for the same instrument. Near 1.0 and you haven't found something new — just a lower-beta version of the same exposure. Meaningfully lower and something genuinely independent is happening, which makes it far more interesting as a portfolio component.

Gate
Plot both equity curves on one chart per instrument with drawdown underneath. A table hides the shape of the losses in a way a chart doesn't.

06
### Export for the toolkit Exact format

Three columns, in this order · build the export to match rather than reformatting a generic trade log afterwards
% Returns
Preferred
| Date | Return % | MAE % |
| 2025-01-02 | -1.20 | -1.40 |
| 2025-01-02 | 0.30 | -0.10 |
| 2025-01-03 | 2.10 | -0.20 |
| 2025-01-06 | -0.50 | -0.70 |
| 2025-01-06 | 1.00 | -0.60 |
| 2025-01-07 | 0.65 | -0.30 |

A
**Date** — YYYY-MM-DD, using the trade's entry date, consistent on every row. Multiple rows can share a date, so trades don't need aggregating.

B
**Return %** — the net return of the individual trade after spread, swap and slippage. Percentage of position notional, not of account equity, and not cumulative. Signed, so losses are negative.

C
**MAE %** — Maximum Adverse Excursion: the furthest the trade ever went against you before it closed. Always negative or zero, never positive.

MAE is the reason the M1 data matters. For a long trade, scan **every one-minute bar between entry and exit**, find the lowest low across that window, and express it as a percentage move from entry. Do not approximate it from the entry candle's low or the daily low — it will be wrong.

Round to two decimals. No currency symbols, no percent signs inside the cells — just the number.

Gate
Run the instruments as **separate files first**, then combined as a third pass. Combining blends two equity curves into one synthetic portfolio — a legitimate thing to look at, but a different question to how each performs alone.

07
### Run the rule check The real verdict

Prop firm toolkit · check the rules that **actually fail accounts**, not just the headline profit target
01 · The account killer
#### Daily loss limit

Aggregate trades by day and look for any single day breaching the cap. A strategy can have an excellent Sharpe and still blow an account on one bad overnight gap.

02
#### Max drawdown

Both the static and trailing versions, since firms differ on which they apply — and trailing is considerably harder to survive.

03
#### Profit target & time

Not just whether it reaches target, but how many trading days it takes. Getting there in nine months is technically passing and practically useless if there's a time limit.

04
#### Consistency rules

Many firms cap the share of total profit allowed from a single day. If one enormous overnight gap is carrying the whole result, it fails — however good the equity curve looks.

Gate · final
If it breaches on historical data, assume it breaches live. The honest response is to change the strategy or the sizing — **not to soften the assumptions until it passes**. A model tuned to clear the rules on paper is the single most expensive thing you can build here.

What you should have at the end
## Six things, and an *honest answer*.

✓
A cleaned, timezone-verified M1 dataset for both instruments over a common date window, with an exceptions file listing every skipped or gap-filled day.

✓
One comparison table per instrument — overnight strategy against buy & hold, **gross and net side by side**.

✓
Time in market and return per unit of exposure, plus correlation to buy & hold.

✓
Equity curves for both, on one chart per instrument, with drawdown plotted underneath.

✓
A three-column CSV per instrument in the exact toolkit format, plus a combined third pass.

✓
The rule-check verdict: which limits it breaches, how many days to target, and whether a single day is carrying the result.

The point of all of it
#### A clear verdict beats a flattering one.

If the effect exists gross and dies net, say so. If Nasdaq works and gold doesn't, say that too. The value of this task isn't a strategy — it's the ability to answer *"would this actually survive?"* about any idea you have from here on, with evidence, before it costs you anything.

Private Quantitative & Macro
Quantitative · Macro · Data-Driven Frameworks
**Educational content only — not financial advice.** All content provided within this group is for educational and informational purposes only. Nothing here constitutes financial advice, investment advice, or a personal recommendation. Trading and investing carries significant risk of loss, including the possible loss of all capital. Past performance and backtested results are not indicative of future results. Backtests are subject to assumptions, data errors and survivorship effects, and results achieved historically may not be achievable in live conditions. This group is not regulated by the Financial Conduct Authority. Please seek independent advice from a qualified, FCA-authorised professional before making any investment decisions.
