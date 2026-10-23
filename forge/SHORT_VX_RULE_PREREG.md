# short-vx-rule: a costed, sized short-VX-futures rule on the validated "fear has run ahead of the Nasdaq" flag

**Pre-registered 2026-10-23, before the rule below was run.** Disclosure: the *unstopped, unsized* version of this rule
was already seen as a description in `vix-calculus` part E (52 trades, mean +5.5% of entry, 77% winners, worst
−54.5%). What is new and unseen:

- the stop;
- the sizing;
- **the random-entry benchmark** (does the flag beat shorting VX on any day?);
- the period test.

| | |
|---|---|
| ID / ledger id | `short-vx-rule` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `short-vx-rule` |
| Data | `analysis/output/vix-calculus/panel_daily.parquet` (CBOE VIX/VVIX/VXN, FRED NASDAQ100, the banked R_a/R_b flags) and `analysis/output/vix-calculus/data/vx_settle.parquet` (CBOE VX settlements per contract), 2013-05-20 → 2026-08-21. Lockbox: nothing after 2026-08-21 is scored here; later sessions go to `vix-signals-forward`. |
| Seed | `20261023` |
| Uncertainty | trade-level bootstrap (5,000) for the mean; random-entry benchmark from 2,000 matched entry sets |
| Scripts / outputs | `scripts/short-vx-rule/rule.py` → `analysis/output/short-vx-rule/` |

## 1. The claim (required)

This continues `vix-ratio-vx-futures` (VALIDATED research only), the test Garin asked for (Discord 2026-10-23: "backtesting
spot VIX could possibly overstate what's actually able to capture"). The give-back after the ratio extremes survives on
VX futures at about 60% of spot.

The question here is whether a trader could have **used** that: shorting VX on the flag, with a stop, sized by risk,
after costs, and **better than simply shorting VX on any day**. A short VX position earns the contango roll anyway.

## 2. Why it is not already settled (required)

`vix-calculus` E tested the futures *effect* in a regression with controls, plus an unstopped description. It didn't
test a tradeable rule, a stop, risk sizing or the random-entry benchmark. Shorting VX is known to earn a roll premium
with crash risk, so the benchmark is the real question.

## 3. The rule, fixed in advance (required)

- **Signal:** `R_a_hi` or `R_b_hi` is 1 at the close of session d. These are the banked `vvix-ratio-range` flags: the
  20-session VVIX- or VIX-to-Nasdaq realised-vol ratio in the top decile of its last 252 sessions.
- **Entry:** short the nearest VX contract with ≥ 35 calendar days to expiry, at its settle on d+1.
- **One position at a time.** A flag while a position is open is ignored.
- **Exit,** whichever comes first:
  - (a) **stop:** the first settle at or above entry × 1.25 (+25%), exiting at that settle, so a gap through the stop
    costs its full size;
  - (b) **time:** the settle 20 sessions after entry.
- **Costs:** 0.10 VX points round trip on every trade, plus 0.05 points extra slippage on stop exits.
- **Sizing:** risk 1% of equity at the stop, i.e. notional = 1% ÷ 25% = 4% of equity per trade, compounding.
  - Trade result in R = net return on the short ÷ 0.25.
  - A gap beyond the stop shows as below −1R.
- **Random-entry benchmark:** the same rule (same contract choice, stop, hold, costs, one position at a time) entered on
  randomly chosen sessions.
  - There are 2,000 sets, each with the same number of trades as the flag rule and the same number in each calendar
    year.
  - Entries are drawn from sessions where the rule could enter and no simulated position is open.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| 1 | Mean net R per trade of the flag rule > 0 | **Yes** (the unstopped version was positive) |
| 2 | The flag rule beats random-entry shorting | **Uncertain**: random short VX also earns the roll |
| 3 | Positive in each period (2013–16, 2017–20, 2021–26) | Uncertain: few trades per period |
| | **THE GATE** | (1) the bootstrap 95% CI of mean net R excludes 0; (2) the flag mean exceeds the random-entry benchmark, one-sided p < 0.05 (share of random sets with mean ≥ the flag's); (3) mean net R > 0 in all three periods |

**Verdicts:**

- **VALIDATED:** all three conditions hold.
- **NULL:** the flag-minus-random difference has a 95% interval inside ±0.15R.
- **UNDERPOWERED:** otherwise.

## 5. Power (required)

Power comes from the random-entry trades only, before the flag rule is run. This is the control sample the template
allows. The SD of random-entry net R per trade, and the minimum detectable flag-minus-random difference at about 50
trades (≈ 2.8 × SD ÷ √n), go in a PRE-RESULTS amendment before the flag rule's outcomes are computed.

## 6. Multiplicity (required)

- **Scored:** one rule, one gate.
- **Descriptive, not scored:**
  - stop at +15% / +40% / none;
  - hold 10 sessions;
  - the equity curve and maximum drawdown at 1% risk;
  - the worst gap in R.

## 7. What this does NOT test (required)

- Intraday stops.
- Options-based hedges (a long VX call spread against the short).
- Execution on VXM minis.
- Anything after 2026-08-21.

## 8. What each verdict changes (required)

- **Pass:** a paper forward record of the rule in `vix-signals-forward`, research only until it has at least 15
  forward trades.
- **Fail:** the flag stays a volatility read, with no trade form. Short VX is then a roll trade, not a signal trade.

## Amendments

### A1 — 2026-10-23 — PRE-RESULTS (power from random-entry trades only; flag trades not yet run)

`scripts/short-vx-rule/rule.py power` (`analysis/output/short-vx-rule/power.json`):

- The flag rule makes **52 trades**. Entry dates only were counted, with no outcome read. By year: 2013 3, 2014 4,
  2015 2, 2016 4, 2017 6, 2018 2, 2019 3, 2020 1, 2021 8, **2022 0**, 2023 7, 2024 6, 2025 4, 2026 2.
- The random-entry net R per trade, over all 3,314 candidate sessions, has a mean of +0.074R and an SD of 0.72R.
- At 80% power the minimum detectable flag-minus-random difference is **≈ 0.28R** per trade.

**Consequences:**

- The NULL clause (interval inside ±0.15R) is unlikely to be reachable.
- A failed gate will most likely be **UNDERPOWERED**.
- 2022 has no flag trades, so the random benchmark draws none in 2022 either.
