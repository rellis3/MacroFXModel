# portfolio-book — Does a fixed-weight book of the desk's standard sleeves earn a deflated, positive Sharpe after costs?

**Pre-registered 2026-10-19, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `portfolio-book` (one scored cell: P1) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `portfolio-book` |
| Data | feature store (`plans/FEATURE_MANIFEST.json`): `px_d1_*` for eurusd, gbpusd, audusd, nzdusd, usdcad, usdchf, usdjpy, xauusd, nas100, spx500 (OANDA daily, asof close+1h); `vix`, `vix3m` (FRED, asof close+1h); `rate3m_*` (ALFRED vintages). Scored window **2008-01-02 → 2026-08-21** (VIX3M starts 2007-12-04; lockbox after 2026-08-21 is not scored and not shown) |
| Seed | harness fixed seed `0x9e3779b9` (runStudy) for every bootstrap, the page included |
| Uncertainty | date-clustered moving-block bootstrap, mean block 5 days, B = 1,000 (`js/harness/stats.mjs`) |
| Scripts / outputs | `scripts/portfolio-book/` → `analysis/output/portfolio-book/`; page `portfolio-book.html` |
| Harness | `js/harness/runStudy.mjs` for every price-based sleeve. The vol-premium proxy is not a price series, so it is scored by the harness's own functions (`stats.mjs`: same vol target, bootstrap, DSR) in `js/portfolioBook.js` |

## 1. The claim

The owner (2026-10-19): the desk has tested hundreds of ideas but trades nothing that makes money, while friends with less
data run profitable books. The standard institutional answer is not one more signal but a **portfolio of plain risk
premia**, each vol-targeted, combined at fixed risk weights: long equity/gold beta, time-series trend, carry, a calendar
drift, and short volatility, with the VIX term structure as the de-risk switch. The claim: such a book, built only from
rules already on this desk and with no parameter fitted, has a positive Sharpe after costs that survives deflation.

## 2. Why it is not already settled

Nearest entries: `vol-target` (validated: vol-target sizing cuts the worst month and lifts trend −0.16→+0.16; it did not
test a multi-sleeve book), `fx-factor-book-v2` (underpowered: G10 trend −0.16 OOS, carry +0.61 OOS on 7 crosses),
memory `project_trend_following_status` (18-market trend ~0.3 OOS on a different engine), memory `project_factor_blend`
(trend + yield-spread, corr 0.06; the yield leg was later shown to be GS2 lookahead, `harness-registry-deflation`),
`post-fomc-usd-drift` (validated as a base rate; the hold-spec harness in `MD files/POST_FOMC_DRIFT_TEST.md` failed its
OOS bar), `vix-inversion` (validated: wider week on inversion — range, not direction). `MD files/P8_VIX_VOL_CARRY.md`
designed a VIX vol-carry book and was never run.

None of these scores a **combined book**. This is not a re-run of any single null. Every sleeve here has prior art on
this data, so the sleeve choice is **not** blind. That contamination is stated, it is why no sleeve is scored on its own,
and it is why the bar is a deflated Sharpe rather than a p-value.

## 3. Definitions, fixed in advance

All decisions are made at D 22:00Z on store features knowable then (runStudy's `featuresAt`). Each price leg is
vol-targeted to 10% (60-day EWMA, cap 3×). Costs are half the measured 22:00 UTC spread per unit turnover, and carry
is from the rate3m legs. Both come from the harness, which the study cannot change.

**Gate G (de-risk switch)** = VIX > VIX3M at the decision close (term structure inverted).

| Sleeve | Universe | Rebalance | Signal |
|---|---|---|---|
| S1 core-beta | nas100, spx500, xauusd | weekly | +1; **S1g** 0 when G |
| S2 trend | all 10 | weekly | mean over L ∈ {21, 63, 126, 252} trading days of sign(close_t / close_{t−L} − 1) |
| S3 carry | 7 USD majors | weekly | sign(rate3m_base − rate3m_quote); **S3g** 0 when G |
| S4 fomc-usd | 7 USD majors | daily | long USD (−1 on xxxUSD, +1 on USDxxx) from the close of a scheduled FOMC decision day for 5 sessions, else 0. Dates: `analysis/fomc_event_study/stage1_event_study.py` FOMC_DATES plus 2026-06-17, 2026-07-29. Live from 2016-01 |
| S5 vol-premium (proxy) | SPX 1-month variance | daily | short a constant-maturity 21-day variance swap struck at VIX². Daily P&L = v_{t−1} − r_t² + 10·(v_{t−1} − v_t), v = (VIX/100)²/252, r = SPX500 log return. Cost: strike 0.5 vol point below VIX every day, plus 10 days of that haircut on each switch on/off. **S5g** flat when G, or the day after a VIX rise > 20%, until 5 calm sessions (\|ΔVIX\| < 5%) have passed (P8 circuit breaker) |

**Sleeve normalisation.** Each sleeve's daily net stream (runStudy: equal weight across its vol-targeted legs; S5: its
raw P&L) is scaled to 10% annual vol by the 60-day EWMA of its own past stream, lagged one day, capped at 3×.

**Book.** The daily return is the weighted mean of the sleeve streams live that day, then scaled by the same
lagged-EWMA rule to a 10% book.

- **P1 (scored)**: equal risk across the live gated sleeves {S1g, S2, S3g, S4, S5g}.
- **P2 (descriptive)**: owner-facing proposal from 2026-10-19: S1g 0.40, S2 0.25, S5g 0.20, S3g 0.05, S4 0.05,
  renormalised over the live sleeves.

**Trades** for the export: each leg's position episodes (open → flat/flip) from runStudy, and S5g's on-periods.
Return % = that trade's contribution to the book, close to close. Risk % = the leg's 1-day 1σ contribution at entry.
MAE/MFE are close-based (no intraday path at daily rebalance; stated in each row's Notes).

**Sample.** Scored 2008-01-02 → 2026-08-21. The IS/OOS split at 2018-01-01 is reported. **Halves** for the gate are
split at 2017-05-01.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | P1 net Sharpe, full scored window | **Yes, ≈ +0.6 to +0.8** |
| b | S1g / S2 / S3g / S4 / S5g alone (descriptive) | ≈ +0.5 / +0.2 / 0 / 0 / +0.6 with heavy left skew |
| c | Mean pairwise sleeve correlation | < 0.2 |
| | **THE GATE** — P1: mean daily net return p < 0.05 (block bootstrap) **and** DSR ≥ 0.95 at N = 11 **and** Sharpe > 0 in both halves | |
| | **THE MIRROR** — P1 with every sleeve's sign flipped must have a negative Sharpe (sanity check, not a second test) | |
| | **Live promotion** — t ≥ 3 on P1 (Harvey–Liu–Zhu), else forward test only | |

## 5. Power

The Sharpe SE over T = 18.6 years is ≈ √((1 + SR²/2)/T) ≈ 0.235. The MDE at 80% power, two-sided α = 0.05, is
≈ 2.8 × 0.235 ≈ **0.66 Sharpe**.

| Cell | n | SE | MDE | Pass bar | Verdict |
|---|---|---|---|---|---|
| P1 | ~4,800 days | 0.235 | 0.66 | DSR ≥ 0.95 (≈ SR 0.6–0.7) | POWERED at the expected size, borderline |
| any single sleeve | ~4,800 days | 0.235 | 0.66 | — | UNDERPOWERED for realistic 0.2–0.5: descriptive only |

## 6. Multiplicity

One scored cell (P1), so no family correction. Deflation counts every cell this study computes: 8 sleeve cells (S1, S1g,
S2, S3, S3g, S4, S5, S5g) + P1 + P2 + mirror = **N = 11**. On the page, every weight set the viewer tries adds one trial
and the DSR shown is recomputed with that N. A tuned weight set is never the scored result.

## 7. What this does NOT test

- Not options execution: S5 is a variance-swap proxy built from VIX. It is not straddle P&L, not tradeable on an MT5
  CFD account as is, and it understates gap risk inside a day.
- Not intraday systems (Fib Atlas, rich-IV breaks): they have no daily-store stream and are left out.
- Not instruments beyond the 10 in the store (no bonds, energy or DAX), so trend is narrower than an 18-market book.
- Not financing beyond the rate3m carry legs (no broker swap markup). Index and gold carry is 0, as in the harness. Book
  rescale turnover is not charged.
- Not forward performance.

## 8. What each verdict changes

- **VALIDATED** → ledger entry `portfolio-book`; the page becomes the book to forward-test on demo; promotion to live
  needs t ≥ 3 or a forward record.
- **NULL** → ledger entry; the desk stops describing "a portfolio of the standard sleeves" as an answer on this universe.
- **UNDERPOWERED** → only if the realised Sharpe is positive but under the MDE: the book goes to forward test, with no
  claim made.

## Amendments

### A1 — 2026-10-19 — PRE-RESULTS
S1g and S3g are evaluated **daily** (rebalanceDays 1), not weekly. VIX inversions last a median of one session
(`vix-inversion`), so a weekly check would almost never act. S1 and S3 (ungated) stay weekly. The extra daily turnover is
charged by the harness. No outcome had been computed.

### A2 — 2026-10-19 — PRE-RESULTS
S5's unit is a variance notional set to **1% of capital per vol point of vega**: N_var = 0.01 / (2 · VIX_{t−1}).
Daily P&L as a fraction of capital is N_var × pnl_t × (252/21) × 10⁴. This constant only matters through the 3× sleeve
cap; the sleeve is vol-scaled to 10% like every other one. VIX_{t−1} is known at the decision close. No outcome had been
computed.

### A3 — 2026-10-19 — PRE-RESULTS
Trade attribution follows the harness's episode rule. A trade opened from flat also carries its entry day's cost (day e).
At a flip, that day belongs to the trade being closed. No outcome had been computed.

## RESULTS
