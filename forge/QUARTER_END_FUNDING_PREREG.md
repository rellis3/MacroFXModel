# quarter-end-funding — Does a thin RRP buffer, known a week ahead, predict a bigger quarter-end SOFR spike, and does the dollar firm into quarter-ends more than into ordinary month-ends?

**Pre-registered 2026-10-22, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `quarter-end-funding-spike` (plumbing forecast), `quarter-end-funding-usd` (FX) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `quarter-end-funding` |
| Data | Feature store: `sofr`, `iorb`, `rrp_on` (fixed_lag rules), `px_d1_eurusd`, `px_d1_gbpusd`, `px_d1_audusd`, `px_d1_nzdusd`, `px_d1_usdcad`, `px_d1_usdchf`, `px_d1_usdjpy` (OANDA daily). FRED `IOER` (2018-04 → 2021-07, the floor before IORB existed), fetched by the script. Quarter-ends up to 2026-06-30 (lockbox 2026-08-21). |
| Seed | `20261022` |
| Uncertainty | spike: bootstrap over quarter-ends (iid; quarter-ends are about 3 months apart), B = 2000. usd: block bootstrap over calendar months, block 3, B = 2000. |
| Scripts / outputs | `scripts/quarter-end-funding/` → `analysis/output/quarter-end-funding/` |
| Harness | Own script (calendar event study). |

## 1. The claim (required)

C.OG, Education Bank, Currency Markets & Global Flows: *"Quarter-end effects: Banks reduce balance sheets for reporting dates, temporarily widening basis … Basis typically widens at quarter-end due to bank balance sheet management — don't overreact to predictable seasonal moves."* Quant Macro lessons: *"Quarter-end window dressing."*

The desk extension (2026-10-21): with the Fed's overnight reverse repo buffer now at about $0.2bn (it was above $2tn in 2022), quarter-end balance-sheet shrinking should hit repo rates harder, as in 2018–2019, when RRP was also near zero and SOFR spiked (September 2019). If spike size is predictable from the RRP buffer a week ahead, that is a usable plumbing forecast for SOFR prints, the SR1 and SR3 front contracts, and the funding read. Separately, a balance-sheet squeeze that falls on the dollar should show up as the dollar firming into quarter-ends.

## 2. Why it is not already settled (required)

- `funding-stress` (null) and the earlier P1 work established **that** SOFR spikes at month-end (balance-sheet dressing) and mid-month (tax and settlement). They tested whether those spikes predict **market ranges and risk**. They did not ask whether the **size** of the spike is predictable from the RRP buffer, which is this study's first question, with a funding-rate outcome.
- `month-end-rebalance` (null) tested **equity** rebalancing after strong months. This study's FX cell compares **quarter-ends against ordinary month-ends**, so month-end rebalancing flows are controlled out and only the quarter-end reporting effect remains.
- No entry tests FX into quarter-ends.

## 3. Definitions, fixed in advance (required)

**Cell `spike` (plumbing forecast)**
- **Floor.** IOER until 2021-07-28, then IORB.
- **Quarter-end print.** SOFR for the **last business day** of the quarter. It is published the next business morning, which is fine because the outcome is the rate itself.
- **Spike.** (SOFR − floor) on that day, minus the median of (SOFR − floor) over the 10 business days ending 5 business days before quarter-end. In bp: how much the quarter-end lifts SOFR above its own recent norm.
- **Predictor.** `B` = log(1 + RRP in $bn), using the latest RRP print known 5 business days before quarter-end. That is a usable lead time.
- **Statistic.** The Spearman correlation of B with the spike across quarter-ends 2018-Q2 → 2026-Q2 (n ≈ 33). **Expected negative**: a thin buffer means a bigger spike.

**Cell `usd` (FX)**
- **USD basket.** The mean of the 7 USD pairs' log returns, each signed so that **+ = USD stronger**.
- **Window.** The **last 5 trading days** of a month (close of trading day −6 to close of the last day).
- **Statistic.** The mean 5-day basket return into **quarter-end** months minus the mean into **non-quarter** month-ends, 2003-Q2 → 2026-Q2 (≈ 93 quarter-ends against ≈ 186 other month-ends). **Expected positive**: the dollar firms more into quarter-ends.

**Controls**
- spike: the same statistic on non-quarter month-ends (the expected effect is smaller). A random-date placebo: 1,000 sets of 33 random business days with the same B rule.
- usd: a shifted-window placebo (5-day windows ending 10 trading days before month-end; should be ≈ 0). Halves split at 2015-01-01 (usd) and 2022-07-01 (spike).

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `spike`: is the quarter-end SOFR spike bigger when the RRP buffer is thin (Spearman < 0)? | **Yes, clearly**, ρ around −0.5 or stronger: 2018–19 and 2025–26 versus 2021–24. |
| b | `usd`: does the USD basket gain more into quarter-ends than into other month-ends (> 0)? | **Small positive or null**, about +0.1% to +0.2%. |
| — | **THE GATE**, spike: Holm CI excludes 0 (negative); the same sign in both halves where each half has at least 10 quarter-ends; outside the random-date placebo. usd: Holm CI excludes 0 (positive); positive in both halves; the shifted placebo is near 0. | |
| — | **THE MIRROR**: a fat buffer means no spike. The correlation covers it. | |

## 5. Power (required)

| Cell | n | MDE | Useful bar | Verdict |
|---|---|---|---|---|
| spike | ≈ 33 quarter-ends | ρ ≈ 3.08/√33 ≈ **0.54** | 0.40 | **UNDERPOWERED by design at 0.40**; powered only for a strong effect, which is what's expected |
| usd | ≈ 93 vs 186 | SD of the 5-day basket ≈ 1.0% → SE ≈ 0.13%, MDE ≈ **0.39%** | 0.25% | **UNDERPOWERED by design at 0.25%** |

Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−bar, +bar); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored cells: `spike`, `usd` (Holm at α 0.05).
- Descriptive only: month-ends (all) for the spike; year-ends alone; the reversal over the first 5 trading days of the new quarter; per-pair FX (EURUSD, USDJPY); reserves instead of RRP as the predictor; SOFR volume; and the model's implied spike for the 2026-12-31 year-end at today's RRP, kept as a **forward record** item, not scored.
- Promotion: |t| ≥ 3 plus the forward record.

## 7. What this does NOT test (required)

- The cross-currency basis itself (there is no feed yet; this is the main gap left from the course claim).
- Whether a SOFR spike moves equity or FX ranges (`funding-stress` covers that).
- Trading costs. The usd cell is a calendar tendency, not a strategy.
- How much a one- or two-day spike moves the SR3 settlement. A quarter-end spike of 20 bp lasting 2 days adds only about 0.4 bp to a 3-month compounded rate. The SR1 (1-month) contract and the funding read are where the spike forecast matters.

## 8. What each verdict changes (required)

- **spike VALIDATED** → ledger entry. The funding read and Desk Watch gain a "quarter-end squeeze risk" line in the last 2 weeks of each quarter, sized from the fitted model at the current RRP. The 2026 year-end becomes the first forward test.
- **usd VALIDATED** → ledger entry (research-only). The calendar note on today.html may say the dollar has historically firmed into quarter-ends by about x%. No sizing.
- **NULL / UNDERPOWERED** → ledger entries. Quarter-end stays a calendar note, and the course rule is recorded as a description: predictable, not to be overread.
