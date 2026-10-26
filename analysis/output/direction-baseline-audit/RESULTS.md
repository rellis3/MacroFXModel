# direction-baseline-audit: results

**Exploratory, not pre-registered.** Nothing here is banked as validated. Register row `direction-baseline-audit`.
Script `scripts/direction-baseline-audit/audit.py` (seed 20261026, B = 1000, 40 placebo reps). Full output `results.json`.

## What was asked

Before building any new direction model: at which horizon, instrument and market condition does simple causal price
information beat the **base rate** on direction? And is the number of "winning" cells above what chance alone produces?

## Data and design

- 10 series, 2016-01-04 to 2026-08-20 (all before the lockbox): EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD, USDCHF
  (daily closes, `education/residual_pca_currency_test/data/daily_closes.csv`), NQ and SPX (NY-close OHLC built from M1,
  `oi_research_book/data/gex_range_es/*_nyclose_d1.parquet`, bars with n ≥ 60), and an equal-weight USD factor.
  Integrity: no gaps over 4 days; the largest moves are real (Brexit 2016-06-24, March 2020).
- Signal: the sign of the past return over 1, 5, 20, 60, 120 or 250 sessions (time-series momentum, or reversal if it
  comes out negative). The position is entered at the **next** close and held for h = 1, 5, 20 or 60 sessions.
- Conditions (all causal): all days; 20-day vol above or below its trailing 250-day median; strong trend
  (|60-day return| > 1 σ·√60) or weak trend.
- 10 × 4 × 6 × 5 = **1,200 cells**. Two measures per cell:
  - **hit excess**: the hit rate minus the hit rate a *random* signal with the same long-share would get, given the
    cell's up-share. This is the honest "better than a coin flip". NQ rose over 60 sessions 75% of the time in this
    sample, so a 50% bar flatters anything that is mostly long.
  - **timing**: mean(signal × σ-scaled return) minus mean(signal) × mean(return), so being long a rising market doesn't
    count as skill.
- Moving-block bootstrap, block = max(h, 21) sessions. **Placebo**: shuffle every series' daily returns (the same
  shuffle across the FX block, so cross-pair correlation stays), then rerun the identical pipeline, 40 times.

## Results

### 1. The base rate is not 50%, and that is the first trap

Up-share of the forward return, by horizon:

| | 1d | 5d | 20d | 60d |
|---|---|---|---|---|
| NQ | 56.0% | 60.1% | 67.6% | 74.7% |
| SPX | 55.6% | 60.8% | 69.1% | 76.8% |
| USDJPY | 52.8% | 55.8% | 56.7% | 61.7% |
| EURUSD | 50.0% | 50.2% | 49.3% | 47.7% |
| other FX majors | 49–51% | 49–51% | 48–52% | 44–55% |

"Always long NQ" was right 75% of the time over 60 sessions. A model that reports 70% directional accuracy on NQ at that
horizon has learned the drift, not the market.

### 2. Momentum and reversal on price alone: indistinguishable from chance

| | real data | placebo mean | placebo 95th pct | share of placebos ≥ real |
|---|---|---|---|---|
| cells with timing t ≥ +2 (momentum) | 4 | 24 | 52 | 93% |
| cells with timing t ≤ −2 (reversal) | 85 | 57 | 127 | 20% |
| cells with \|t\| ≥ 3 | 16 | 9.6 | 23 | 18% |

- Counted naively against "5% of 1,200 = 60", the 85 reversal cells look like a discovery (FX 20–60-day reversal, mostly
  USDCHF, NZDUSD, USDCAD, strongest when the trend was strong). The placebo shows why it isn't one. Shuffled returns,
  which carry no serial dependence at all, produce 57 such cells on average and up to 168, because overlapping windows on
  a 10-year sample bias past-versus-future sign toward reversal, and because the 1,200 cells are heavily correlated.
- Momentum is, if anything, *below* chance (4 cells against a placebo mean of 24).
- "Momentum works in strong trends" is the reverse here: the mean hit excess on 20–120-day look-backs in strong-trend
  days is −5.3pp at 20 sessions and −5.8pp at 60, against −1.8 and −2.7 on all days. That is consistent with the
  repo's banked null on FX trend following (`trend-following-fx`, `fx-factor-book-v2`: trend −0.16 Sharpe out of sample).
- The best positive cell (EURUSD, 120-day sign, strong trend, 60 sessions) is +8.7pp, t 1.3. That is noise.

### 3. Size is predictable everywhere

Spearman correlation of trailing 20-day σ with the size of the next move (|return|, not σ-scaled):

| | 1d | 5d | 20d | 60d |
|---|---|---|---|---|
| NQ | 0.33 | 0.29 | 0.30 | 0.25 |
| SPX | 0.36 | 0.36 | 0.35 | 0.24 |
| USDJPY | 0.26 | 0.22 | 0.30 | 0.19 |
| EURUSD | 0.19 | 0.10 | 0.19 | 0.27 |
| other FX | 0.04–0.19 | | | |

Positive in all 40 cells. Even the crudest vol estimate ranks the *size* of what's coming; nothing on price alone ranks
its *sign*. This repeats the Evidence Book's split (24 volatility findings validated, almost no direction).

### 4. First-touch barriers (ChatGPT's "Test C") on NQ and SPX

Which of +k σ or −k σ from the entry close is hit first within N sessions (daily high/low; a session that touches both
is counted as ambiguous, not dropped):

| | NQ up-first | SPX up-first |
|---|---|---|
| ±1σ in 5 sessions, all days | 53.5% | 52.5% |
| same, past 20 days up / down | 53.7% / 53.0% | 53.1% / 50.9% |
| ±2σ in 20 sessions, all days | 56.5% | 55.4% |
| same, past 60 days up / down | 56.2% / 57.4% | 55.3% / 55.7% |

Reframing the target as a barrier race doesn't change the answer: the up-first share is the drift, and trend filters
don't move it. (The repo's AFML meta-labelling study with triple-barrier labels, `meta-label-proper`, also came back null.)

## Verdict

**NULL (exploratory).** On daily price alone, across 10 series, 4 horizons, 6 look-backs and 5 conditions, nothing beats
the base rate on direction by more than a shuffled-returns placebo does. Size is predictable; sign is not.

## Lessons for method (added to the research-protocol stats lessons)

- Never judge a grid by "count of |t| ≥ 2 cells against 5%". Correlated cells and overlapping windows make that count
  swing from 0 to 168 under pure noise. Run the placebo through the same pipeline and compare against its distribution.
- Overlapping long-horizon windows bias sign tests toward reversal in a 10-year sample. A reversal finding at 20–60
  sessions needs a placebo before anyone reads it.
- State the base rate for every instrument and horizon before any accuracy number. The coin flip for NQ at 60 sessions
  is 75%, not 50%.

## Caveats

- Daily closes only. Nothing intraday, no order flow, no carry, no events. This audit tests the "price-only indicator"
  family, which is the family ChatGPT's sections A, priority 1 and 4 lean on. It doesn't test flows or events.
- One 10.6-year sample (2016–2026). FX was range-bound for much of it. A 1976+ sample would be needed to say anything
  about multi-decade momentum.
- Costs are not applied; there was nothing to cost.
