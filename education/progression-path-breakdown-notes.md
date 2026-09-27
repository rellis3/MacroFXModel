# Progression Path Breakdown & Analysis (C.OG): notes

*Source: a 30-minute video by C.OG (Colez Trades / @QuantitativeAndMacroInsights), taken
from its auto-generated transcript and five screenshots. It walks through the whole path:*
1. *why systems with no edge still show winners,*
2. *what to benchmark against,*
3. *validation and paper trading,*
4. *using prop-firm challenges as a short-term way to raise capital, costed properly.*

---

## The one-paragraph version

Short-term variance makes **losing systems produce winners**: in a group of traders all
running the same losing method, a third are in profit after 10 trades. Those are the people
posting screenshots. Keep trading and the **drift** (the system's true average per trade)
always wins; by a few hundred trades almost nobody is still up. So:
- judge a system on a full, leak-free track record, and Monte-Carlo it to check the
  equity curve isn't a lucky path;
- require it to **beat buy-and-hold** (otherwise why take the risk);
- **paper trade** to confirm live results fall in the backtest's distribution.

If the system is good but your capital is small, prop-firm challenges can be a
**short-term** way to build capital, as long as you simulate your pass rate on the firm's
rules and track **everything net of costs**. The firms profit when traders fail, so it's a
funnel to exploit carefully, not a long-term home.

---

## The images, explained

### 1. The equity curve (hand-drawn, first screenshot)
A white line that zig-zags upward. An **equity curve** is just the account balance over
time drawn as a line: start at, say, 100,000, every win steps it up, every loss steps it
down. Everything else in the lesson is about how much to trust the shape of that one line.

### 2. Many paths of the same system (second screenshot)
Several coloured curves (blue, yellow, red, white) inside a pink envelope, all heading up
and to the right. It's **one system, several possible histories**. Four people run the same
rules but start at different times (2022, 2023, 2025, two weeks ago), so each sees a
different curve. Monte Carlo generates many such paths from the system's statistics.

Two things describe the fan:
- **Drift:** the average slope. Here it's clearly up.
- **Volatility:** how wide the fan is. Here the paths stay close together and none goes
  negative.

A good system has **positive drift and a tight fan**. A single backtest is just one of
these paths, and it might be the lucky one.

### 3. "Why some people still make money": 600 traders on a losing method (screenshots 1–3)
An interactive chart from the micro-learning bank, "The Bank" lesson 2 of "Start Here".
- 600 simulated traders all run **the same method, which loses 0.2% per trade on average**.
- The chart shows each trader's cumulative result (%) against trades taken, and a slider
  moves from 10 to 1,000 trades.

| Trades | Share of the 600 in profit | What's on screen |
|---|---|---|
| **10** | **35.0%** | A thin fan around 0%, green above and red below. "At this stage the winners look skilled, sound confident, and have screenshots." |
| 50 | "a large group" (≈ 1 in 5 by the maths below) | "They are not doing anything different from the others" |
| **380** | **0.7%** | A red cloud sloping down past −60% and toward −120%. "Almost nobody is left above the line. The drift was always going to win." |

**Why the numbers come out like that.** After *n* trades, a trader's total is roughly normal
with mean −0.2%·*n* and spread σ·√*n*, where σ is the per-trade volatility. The mean grows
with *n* but the spread only with √*n*, so the drift eventually swamps the luck.

Solving 35% profitable at *n* = 10 gives σ ≈ **1.6% per trade**. That same σ predicts:
- about **19% still in profit at 50 trades**;
- about **0.9% at 380 trades**, close to the 0.7% shown.

The slider is behaving exactly as the maths says. This shows how many trades you need
before a result means anything: with a small edge and noisy trades, it's **hundreds**,
not ten.

### 4. The Prop Firm Toolkit (fourth screenshot)
C.OG's tool ("Colez Trades — Prop Firm Toolkit") simulates prop-challenge outcomes from a
trade model. In the screenshot:

| Setting / result | Value | Meaning |
|---|---|---|
| Firm / program | FTMO, 2-Step Challenge | Step 1 target **10%**, step 2 target **5%**, minimum **4 days** each |
| Trade model | Source "Forecaster Portfolio", historical, **~2.6 trades/day** | Real historical trades, resampled ("empirical") |
| Scale k | **2.00×** | Risk multiplier on the historical trades. Flagged in red: "worst historical day breaches the daily limit" |
| Paths | **20,000** Monte Carlo paths (run in 311 ms) | |
| **Funded rate** | **56.9%** (11,377 of 20,000) | Share of paths passing both steps |
| **Blown** | **43.1%** (8,623 hit the max-loss floor) | |
| Cleared step 1 | 14,402 (**72.0%**) | |
| Fully funded | 11,377 (**79.0% of step-1 survivors**) | |
| Median days to funded | **17 d** (mean 19.9; P10 9 d, P90 35 d) | |
| Median worst drawdown | **−7.9%** (mean −7.1%; 1-in-20 −10.0%) | |
| Chart | Equity-path fan for step 1, dashed target line at **+10%** | |

His point: at 2× risk the pass rate is "just over a coin flip", so **lower the risk and
re-simulate**. The daily-loss limit is what's biting, as the red warning shows.

**An extra benchmark worth knowing (ours, not in the video):** what would a system with
**no edge at all** score? If the max-loss floor is 10% (FTMO's standard; it's cut off in the
screenshot), the classic gambler's-ruin result for a driftless walk gives:
- **Step 1** (+10% before −10%): 10 / (10+10) = **50%**, against the toolkit's **72%**.
- **Step 2** (+5% before −10%): 10 / (5+10) ≈ **67%**, against the toolkit's **79%**.
- **Both steps:** ≈ **33%** before daily limits and minimum days, against the toolkit's
  **57%**.

So 56.9% is well above what luck alone would produce. But the right comparison is **the
zero-edge pass rate under the same rules**, not 50%. A no-edge trader already passes a
third of the time, which is exactly why the challenge business works for the firm.

### 5. The costs spreadsheet (fifth screenshot)
A Google Sheet:
- **benchmark** 40% against **buy and hold S&P** 15%, with **50,000** as a capital figure;
- **cost** 200 × 5 accounts;
- columns **projected return** and **net of costs**, still being filled in.

It's the simplest possible habit: **money in against money out**, for every account.

---

## The lesson in steps

1. **Short-term profits prove nothing.** Even a negative system has a winning tail early
   on, and that tail is where social media's screenshots come from. The losing side stays
   quiet. Keep trading and "the drift is always going to win".
2. **Judge the system, not the path.** Build a full historical track record with no
   look-ahead or data mining:
   - in-sample, out-of-sample, walk-forward, and parameter stability;
   - Monte Carlo the result to check it's a consistent, tight fan with positive drift, not
     one lucky curve.
3. **Benchmark against buy-and-hold.** If the system doesn't beat simply holding the S&P,
   don't take the extra risk. Back to the idea bank.
4. **Paper trade to re-validate.** Live results should fall inside the backtest's
   distribution. If the backtest says 30–40% a year with a 15–20% max drawdown, and four
   months live are −20%, that points to look-ahead, a coding error or a broken backtest.
   You want to find that before any money is at risk.
5. **Then a burn-in phase at low risk, then deployment.**
6. **The capital problem.** 40% a year on £1,000 is £400, which isn't worth much. Prop
   firms offer a **short-term** way to build capital, to be rotated back into your own
   systems:
   - their business earns from failed challenge fees;
   - trades usually aren't placed in a real market;
   - your wins are their losses, a clear conflict of interest.

   Using them well needs a system with a **consistent, well-shaped distribution**. It
   doesn't need an extraordinary one.
7. **Simulate the challenge before you pay for it.** Load the trade model into the toolkit,
   find the risk level that keeps the pass rate high and daily-loss breaches rare, and read
   the expected days to pass.
8. **Account net of costs, always.** His example:
   - 5 accounts × £200 = **£1,000** in fees;
   - 2 blow, 1 passes step 1, 2 reach funded, 1 of those later blows, and 1 pays out
     **£5,000**;
   - what matters is payouts minus fees and profit splits.

   If that's positive and repeatable, it's a "structurally complete process": a funnel that
   feeds capital into your real systems.
9. **The learning curve.** He also drew a curve that dips down (effort that isn't paying off,
   because the approach was wrong) and then rises once the principles click. The time
   before isn't wasted: seeing *why* it failed is the turning point.

---

## Reading it honestly

The core message (variance, drift, validation, benchmarks, paper trading) is sound, and it
matches this repo's own rules (`CLAUDE.md`). Some caveats worth keeping next to it:

- **Monte Carlo on backtest trades isn't validation.** Resampling a strategy's own trades
  shows the spread of outcomes *if the backtest is true*. It says nothing about whether the
  edge survives new data. `CLAUDE.md` says the same: "Don't let Monte Carlo stand in for
  OOS." The toolkit's pass rate inherits every flaw of the input trades, and the forecaster
  portfolio feeding it is only as good as its out-of-sample record.
- **Resampling trades one at a time understates losing streaks.** If losing days cluster,
  which they do in real markets, drawing trades independently makes paths smoother than
  reality. Daily-loss and max-loss breaches then look rarer than they are. Resampling
  whole days, or blocks of days, is safer for prop rules.
- **The benchmark for a pass rate is the zero-edge pass rate**, about 33% for a 2-step
  10%/5% challenge with a 10% floor, not 50%. Report the pass rate *minus* that.
- **Challenge expected value is simple arithmetic and worth writing down:**
  > EV per attempt = P(funded) × E[payouts while funded] − fee (+ refunded fee, if the firm
  > refunds it)
  
  E[payouts] depends on the edge *continuing* after funding, and on the firm's rules
  (profit split, consistency rules, restricted news trading, payout conditions).
- **Beating buy-and-hold is a risk-adjusted question.** 40% with a 15% drawdown against the
  S&P's ~15% is a fair comparison only once drawdown and volatility are in the picture.
  Sharpe and Calmar do that. The S&P has had −25% to −34% drawdowns in recent years
  (2020, 2022).
- **Counterparty risk.** Firms can change rules, deny payouts or close. A process built on
  them should be priced as uncertain income, not a salary.

---

## How it maps to this repo

| Lesson idea | Where it already lives here |
|---|---|
| Drift wins; short samples mislead | `metricsCore.sharpeStdError` (report every Sharpe ± SE), `minTrackRecordLength` (how long a record must be) |
| Monte Carlo is expectation-setting, not OOS | `CLAUDE.md` "Output analysis" rules |
| Paper trading must land in the backtest's distribution | The MVE book **forward tracker** (`MVE_BOOK_FORWARD_TRACKER.md`): parity replay, KILL-DRAWDOWN at 1.5× the backtest drawdown, KILL-INCONSISTENT when forward Sharpe falls below backtest − 2 SE |
| Benchmark vs buy-and-hold | `education/buy-and-hold-notes.md`; every card's naive-benchmark rule |
| Prop-firm rules | `js/overnightHoldEngine.js` `runPropFirmRuleCheck`: daily loss, static/trailing drawdown, target and time, consistency, run on one backtest path |
| **Not built** | A prop-challenge **Monte Carlo pass-rate** brick: resample daily P&L in blocks, apply a named firm's rules, and report pass rate against the zero-edge baseline, time to pass, and EV net of fees |

---

## Key takeaways

1. **Early profit on a losing system is expected.** 35% of traders on a −0.2%/trade method
   are up after 10 trades, and 0.7% after 380. Needing hundreds of trades is normal.
2. **A system is a distribution, not a curve.** Look for positive drift and a tight fan of
   paths.
3. **Beat buy-and-hold on a risk-adjusted basis, or don't deploy.**
4. **Paper trade to catch backtest errors before money does.**
5. **Prop firms are a short-term capital funnel with a built-in conflict of interest.**
   Simulate the pass rate against the zero-edge baseline, and account for every account
   net of all costs.
