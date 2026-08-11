# Overnight Hold vs Buy & Hold — Lesson Notes

> **Source:** Colez Trades — Quantitative & Macro Insights (C.OG), Research Task —
> "Overnight Hold vs Buy & Hold" (Nasdaq & Gold).
> **Purpose of this file:** raw study notes on the task material as set — the
> question being tested, the seven-stage pipeline specified, the metrics and
> export formats required, and the prop-firm rule checks. These are learning
> notes on a research task's methodology, not conclusions: nothing in this file
> has been run, tested, or judged yet, and no result is reported here because
> none has been produced.
> **Task's own framing:** a comparison of holding an instrument only overnight
> against holding it continuously (buy & hold), run on two markets "chosen
> because they should disagree," with the trades then passed through a
> prop-firm rule check as a separate question from raw profitability.
> Educational content only — not financial advice.

---

## 0. Task summary (one paragraph)

The task specifies a single rule tested on two instruments: enter long at 20:00
UK, exit at 14:30 UK the following session, using M1 data on NAS100/US100 and
XAUUSD. This "overnight hold" is compared against continuous buy & hold over
the same window. The task frames the two instruments as a deliberate contrast
— equity indices are noted as having documented overnight-return research
behind them, while gold trades near-continuously and is described in the task
as a weaker/control case. The task's stated point is that a strategy's raw
profitability and its ability to pass a prop-firm's rule set (daily loss limit,
drawdown limit, profit target with time limit, consistency cap) are separate
questions, and that both are testable on historical data before any account
fee is paid.

---

## 1. The comparison being specified

| Parameter | Value given in the task |
|---|---|
| Entry | 20:00 UK time |
| Exit | 14:30 UK time, following session |
| Data resolution | M1 (one-minute) |
| Instruments | NAS100 / US100, XAUUSD |
| Benchmark | Continuous buy & hold, same instrument, same window |
| Position | Long only, unlevered, fixed notional, one position at a time |

**Stated expectation per instrument (task's own framing, not verified here):**

| Instrument | Task's stated expectation |
|---|---|
| NAS100 / US100 | Described as having "a solid body of research" behind overnight effects in equity indices; task expects a "reasonably strong" gross result, with the open question being whether it survives costs. |
| XAUUSD | Described as trading close to 23 hours a day, so the task states the overnight window "barely means anything" for gold, the effect is expected to be weaker, and swap costs are noted as likely to bite harder. Framed in the task as a control leg rather than a failure case. |

The task explicitly states that if the two instruments reach opposite
conclusions, that divergence is itself the thing to report — a result that
holds on one market and not the other is described as more informative than
two partial results.

---

## 2. Framing given: prop-challenge risk vs prop-challenge rules

The task separates two different questions and states that most preparation
addresses only the first one:

| Question 1 (what most people prepare for) | Question 2 (what the task says actually decides funding) |
|---|---|
| Does the strategy make money? | Does the strategy make money in a shape the funding rules permit? |

**Cost/payoff framing given in the task, stated as given (not a recommendation):**

| Side | Task's description |
|---|---|
| What is risked | One challenge fee — described as known in advance, capped, and identical whether the account fails on day one or day thirty. |
| What is being sought | Trading capital "many multiples" of that fee, with the firm bearing the downside on that capital rather than the trader's own account. |

**The four rule categories named in the task**, each described as testable on
historical trade data before a fee is paid:

1. Daily loss limit
2. Maximum drawdown (task notes firms differ on static vs trailing)
3. Profit target, within a time limit
4. Consistency rule (cap on the share of total profit from a single day)

The task states plainly that a backtest is evidence, not a guarantee — that
forward results differ, costs move, and a failed challenge still costs the
fee regardless of what a backtest showed.

---

## 3. The seven-stage pipeline specified

The task lays out a fixed order of seven stages, each with one "gate" check
described as the single test that catches that stage's most likely failure
mode. The task states the order matters because an error early does not
produce a slightly-wrong answer — it produces a fictional one that still
looks plausible.

### Stage 01 — Source the data

- M1 data for both instruments, from whatever the trader's own data source is.
- Task instructs finding the **overlapping date range** across both
  instruments and trimming both to that common window, on the stated
  reasoning that mismatched history lengths make the comparison meaningless.
- Task instructs establishing the source data's actual timezone before
  anything else — broker feeds are described as commonly GMT+2/GMT+3 with
  their own DST rules, not UTC and not UK time. The task states that getting
  this wrong offsets every entry/exit in the backtest while still looking
  plausible.
- **Stated gate:** locate a known high-impact release (e.g. an NFP print on
  the first Friday of a month) and confirm the volatility spike lands on the
  expected minute, as a check against timezone error.

### Stage 02 — Prepare it

- Convert to UK local time and handle the GMT⇄BST switchover, since UK and US
  clock-change dates differ, shifting the UK-time gap to the US session by an
  hour for a few weeks each spring and autumn. The task states the 20:00/14:30
  boundaries must stay fixed in UK local time throughout.
- Task instructs deciding and documenting a fill rule for a missing minute
  (first tick after / last tick before) and applying it consistently across
  both instruments and both directions.
- Task instructs handling session edges explicitly: no Friday-20:00 trade
  (no following session), differing Sunday reopen times between gold and
  Nasdaq, holiday half-days (Christmas, New Year, Thanksgiving, Independence
  Day), and broker maintenance gaps.
- Task instructs logging every skipped or gap-filled day to a separate
  exceptions file rather than forward-filling silently.
- **Stated gate:** compare total expected trading days against actual trades
  generated; a large gap between the two is flagged as a signal to
  investigate before continuing.

### Stage 03 — Build the strategy and its benchmark

- Long only, unlevered, fixed notional, one position at a time, no
  overlapping or pyramiding.
- Task instructs using the actual traded price at both timestamps (not a
  synthetic mid or bar average) and applying the same price convention to the
  benchmark.
- Benchmark specified as continuous buy & hold on the same instrument, same
  notional, same price convention — starting on the date of the first
  overnight trade and ending on the date of the last one, not the first/last
  row of the raw data file.
- **Stated gate — the "mirror test":** run the opposite window (enter 14:30,
  exit 20:00) to isolate the intraday-session return. The task states that
  overnight return plus intraday return should roughly reconstruct the buy &
  hold return; if the two don't add back up, the task attributes this to a
  pipeline bug rather than a market effect.

### Stage 04 — Apply costs

- Spread on both legs (entry and exit), with the task noting spread is
  typically wider at 20:00 for gold given thinner off-session liquidity.
- Overnight swap/financing on every trade, since every trade in this rule is
  held through rollover by construction. Task instructs checking whether
  triple-swap Wednesday applies (roughly one trade in five, if so).
- Slippage on both legs, with the task noting the 14:30 exit sits inside US
  cash-open volatility where fills can differ meaningfully from the printed
  price.
- **Stated gate:** produce gross and net results side by side in one table.
  The task frames a "gross strong, net flat" outcome as a valid finding to
  report as-is, not as a failed test.

### Stage 05 — Measure it

One comparison table per instrument, overnight strategy vs buy & hold, with
these fields listed in the task:

| Metric group | Fields specified |
|---|---|
| Return | Total return, annualised return (CAGR) |
| Drawdown | Max drawdown (%), max drawdown duration |
| Risk-adjusted | Sharpe ratio, Sortino ratio, Calmar ratio |
| Trade stats | Win rate, profit factor, avg win vs avg loss, largest win/loss, longest losing streak, total trades |
| Dispersion | Std dev of returns |
| Exposure | Time in market, return per unit of exposure |
| Relationship to benchmark | Correlation to buy & hold |

Two fields the task singles out for separate emphasis:

- **Time in market:** the task notes the overnight version is exposed roughly
  18.5 hours of each 24-hour weekday cycle and none of the weekend, and
  instructs reporting return per unit of exposure alongside raw return —
  stated reasoning: a given return achieved on less exposure is not
  automatically a weaker result once exposure is accounted for.
- **Correlation to buy & hold:** the task instructs correlating the overnight
  strategy's returns against buy & hold for the same instrument, stating that
  a correlation near 1.0 indicates a lower-beta version of the same
  exposure, while a materially lower correlation indicates something
  distinct from simple long exposure.

**Stated gate:** plot both equity curves on one chart per instrument with
drawdown plotted underneath, on the stated reasoning that a table does not
show the shape of losses the way a chart does.

### Stage 06 — Export for the toolkit

Three-column CSV, exact column order specified:

| Date | Return % | MAE % |
|---|---|---|
| 2025-01-02 | -1.20 | -1.40 |
| 2025-01-02 | 0.30 | -0.10 |
| 2025-01-03 | 2.10 | -0.20 |
| 2025-01-06 | -0.50 | -0.70 |
| 2025-01-06 | 1.00 | -0.60 |
| 2025-01-07 | 0.65 | -0.30 |

Column definitions as given:

- **Date** — `YYYY-MM-DD`, the trade's entry date; multiple rows can share a
  date (rows are not aggregated).
- **Return %** — net return of the individual trade after spread, swap and
  slippage; percentage of position notional (not account equity), not
  cumulative, signed so losses are negative.
- **MAE %** — Maximum Adverse Excursion: the furthest the trade moved against
  the position before it closed. Task specifies this must be computed by
  scanning every one-minute bar between entry and exit and finding the
  lowest low (for a long trade) across that window, expressed as a
  percentage move from entry — not approximated from the entry candle's low
  or the daily low. Always negative or zero. Values rounded to two decimals,
  no currency symbols or percent signs in the cells.

**Stated gate:** produce the two instruments as separate files first, then a
combined file as a third pass — task notes combining blends two equity
curves into one synthetic portfolio, described as a legitimate but distinct
question from how each instrument performs alone.

### Stage 07 — Run the rule check

Four checks specified, run against the exported trade data:

1. **Daily loss limit** — aggregate trades by day and check for any single
   day breaching the cap.
2. **Max drawdown** — both static and trailing versions, since firms are
   noted to differ on which they apply (trailing described as harder to
   survive).
3. **Profit target and time** — not only whether the target is reached, but
   how many trading days it takes, relative to any time limit.
4. **Consistency rule** — the share of total profit contributed by a single
   day, against whatever cap a given firm applies.

**Stated gate:** the task instructs treating a historical-data breach as
equivalent to a live breach, and states that the response to a rule breach
should be to change the strategy or the sizing — not to relax the
assumptions until the check passes.

---

## 4. Deliverables listed in the task

The task lists six outputs plus a stated answer as "what you should have at
the end":

1. A cleaned, timezone-verified M1 dataset for both instruments over a
   common date window, with an exceptions file listing every skipped or
   gap-filled day.
2. One comparison table per instrument — overnight strategy vs buy & hold,
   gross and net side by side.
3. Time in market and return per unit of exposure, plus correlation to buy &
   hold.
4. Equity curves for both, one chart per instrument, with drawdown plotted
   underneath.
5. A three-column CSV per instrument in the specified format, plus a
   combined third pass.
6. The rule-check verdict: which limits (if any) are breached, how many
   trading days to target, and whether a single day accounts for a
   disproportionate share of the result.

---

## 5. Key takeaways (as stated in the task)

- **Profitability and rule-compliance are separate questions.** The task
  states both are testable on historical data before a fee is paid, and
  frames this as the reason the exercise is worth doing.
- **Gross and net are reported side by side, not one or the other.** The task
  treats "gross positive, net flat/negative" as a valid, reportable outcome
  rather than a failed test.
- **A divergence between the two instruments is a result, not a gap to fill.**
  The task instructs writing up an instrument-level disagreement rather than
  treating the weaker leg as a discarded control.
- **Exposure-adjusted return is reported alongside raw return.** The task
  specifies computing time in market and return per unit of exposure as a
  named, separate line item.
- **A historical rule breach is treated as if it would recur live.** The
  task's stated response to a breach is to change the strategy or sizing,
  not to relax the backtest's assumptions.
- **A backtest is evidence, not a guarantee, per the task's own wording** —
  forward results can differ from historical ones, costs can move, and a
  failed prop-firm challenge still costs the fee regardless of what a
  backtest showed beforehand.

---

## 6. Glossary / definitions used in the task

| Term | Definition (as used in the task) |
|---|---|
| **Overnight hold** | The specific rule tested: enter 20:00 UK, exit 14:30 UK the following session. |
| **Buy & hold** | The benchmark: continuous holding of the same instrument over the same window, no entries/exits in between. |
| **Mirror test** | The stage-03 integrity check: trading the opposite window (14:30→20:00) to isolate the intraday-session return, used to sanity-check that overnight + intraday ≈ buy & hold. |
| **MAE (Maximum Adverse Excursion)** | The furthest a trade moved against the position before it closed, measured minute-by-minute and expressed as a % move from entry. |
| **Gross vs net return** | Gross = before costs; net = after spread, swap and slippage. The task treats the gap between the two as the central question of stage 04. |
| **Time in market** | The proportion of total elapsed time a position is actually held; used to compute return per unit of exposure. |
| **Static vs trailing drawdown** | Two different drawdown-limit conventions prop firms may apply; trailing is described in the task as harder to survive. |
| **Consistency rule** | A prop-firm rule capping the share of total profit that may come from a single day. |
| **Triple-swap Wednesday** | A convention at many brokers where the overnight financing charge is applied at 3x on a specific weekday to account for weekend settlement. |

---

## 7. Self-test questions (revision)

1. What are the exact entry and exit times specified, and in which timezone?
   *(20:00 UK entry, 14:30 UK exit the following session, UK local time
   throughout including across the BST/GMT switch.)*
2. Why does the task instruct trimming both instruments to their overlapping
   date range before comparing them? *(So neither instrument's result is
   built on more or less history than the other — otherwise the comparison
   isn't like-for-like.)*
3. What is the stage-01 gate, and what specific failure mode does it catch?
   *(Checking a known high-impact release, e.g. an NFP Friday, lands on the
   expected minute — catches timezone misalignment.)*
4. What is the mirror test, and what should the two halves approximately sum
   to? *(Trading the opposite window, 14:30→20:00; overnight + intraday
   return should roughly reconstruct buy & hold return.)*
5. List the four categories of cost applied in stage 04. *(Spread on both
   legs, overnight swap/financing including triple-swap Wednesday where it
   applies, and slippage on both legs.)*
6. Why does every trade in this rule structurally pay more financing cost per
   unit of exposure than buy & hold, per the task's framing? *(Every overnight
   trade is held through rollover by construction, whereas buy & hold pays
   financing continuously rather than once per discrete overnight hold.)*
7. What two fields does the task single out beyond the standard return/risk
   metrics, and why? *(Time in market and return per unit of exposure — the
   overnight strategy's ~18.5-hour weekday exposure with no weekend exposure
   makes raw return alone an incomplete comparison to a fully-exposed
   benchmark.)*
8. What does a correlation to buy & hold near 1.0 indicate, per the task, and
   what does a materially lower correlation indicate? *(Near 1.0 = a
   lower-beta version of the same exposure; materially lower = something
   distinct from simple long exposure.)*
9. Name the three columns of the required CSV export, in order, and state one
   formatting rule for each. *(Date — YYYY-MM-DD, entry date, rows not
   aggregated; Return % — net of costs, % of notional, signed, not
   cumulative; MAE % — always ≤0, computed from M1 bar-by-bar scan, not
   approximated from entry/daily candle.)*
10. Why does the task specify M1 data rather than a coarser resolution?
    *(The 14:30 exit sits inside US cash-open volatility, and MAE must be
    measured minute-by-minute rather than approximated.)*
11. List the four rule categories checked in stage 07. *(Daily loss limit,
    max drawdown — static and trailing, profit target within a time limit,
    consistency rule.)*
12. What is the task's stated response to a historical rule breach?
    *(Treat it as if it would recur live; change the strategy or the sizing
    rather than relaxing the backtest's assumptions.)*
13. Why does the task treat an instrument-level disagreement between NAS100
    and XAUUSD as a useful outcome rather than an incomplete result?
    *(A result that holds on one market and not the other indicates the
    effect is structural rather than universal — stated as more informative
    than two partial or vague results.)*

---

## 8. Questions to investigate in future (arising from the task material)

Open questions the task raises but leaves to the person running it — future
research prompts, not conclusions:

1. **What overlapping M1 date range is actually available** for NAS100/US100
   and XAUUSD from whichever data source is used, and how long is the
   resulting common window once trimmed?
2. **What timezone does the source feed actually publish in**, and what is
   its DST convention — this has to be established before stage 02 can run.
3. **What is the fill-rule decision** for a missing minute (first tick after
   vs last tick before), and does it change results materially between the
   two conventions?
4. **Does triple-swap Wednesday apply** to the broker/feed being used, and by
   how much does it change stage-04 net results if included vs excluded?
5. **Does the mirror test reconstruct buy & hold** within a reasonable
   tolerance, or does it reveal a pipeline discrepancy to resolve first?
6. **What does the gross-vs-net gap look like per instrument** once real
   spread/swap/slippage assumptions are applied — the task frames this as
   the central open question of the whole exercise.
7. **Do NAS100 and XAUUSD in fact diverge**, and if so, is the divergence
   consistent with the task's stated a-priori expectation (stronger overnight
   effect in the index, weaker/near-noise in gold) or does it contradict it?
8. **Which specific prop-firm rule set(s) should stage 07 be checked
   against** — daily loss %, static vs trailing drawdown %, profit target %
   and days allowed, and the consistency-rule cap all vary by firm and are
   not specified numerically in the task itself.
9. **How sensitive is the rule-check verdict to position sizing** — the task
   notes a single bad overnight gap can breach a daily loss limit even with a
   strong Sharpe ratio; what sizing keeps daily-loss exposure within a given
   cap without materially changing the return profile.

---

## 9. Disclaimer (reproduced from the task material)

Educational content only — not financial advice. All content is for
educational and informational purposes only. Nothing here constitutes
financial advice, investment advice, or a personal recommendation. Trading
and investing carries significant risk of loss, including the possible loss
of all capital. Past performance and backtested results are not indicative
of future results. Backtests are subject to assumptions, data errors and
survivorship effects, and results achieved historically may not be
achievable in live conditions. Please seek independent advice from a
qualified, FCA-authorised professional before making any investment
decisions.
