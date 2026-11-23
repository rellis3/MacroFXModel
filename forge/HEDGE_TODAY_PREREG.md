# hedge-today — A hedge held for one session: size it from the session, not from daily closes?

**Pre-registered 2026-11-23, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `hedge-today` (H1, sizing), `hedge-today-pick` (H2, choosing the partner), `hedge-today-daytype` (H3, conditioning on the day type) |
| Branch | `jvphone` |
| Register row | `plans/RESEARCH_REGISTER.md` → `hedge-today` |
| Data | local M1 (`VolRangeForecaster/data/m1/<key>_m1.parquet` via `js/localM1Loader.js`, read-only, no R2) for gold, nq, us30, us2000, de30, eurusd, gbpusd, usdjpy, usdchf, audusd, usdcad, nzdusd; synthetic DXY from the five currencies (weights as `hedge-method-comparison`). Calendar `calendar_events.csv` (UTC times, impact `Major`, exact duplicates dropped). Sample 2016-01-04 → **2026-07-02** (calendar coverage ends there; the lockbox 2026-08-21 is therefore never reached) |
| Seed | `20261123` |
| Uncertainty | 21-session block bootstrap over evaluation sessions (the same blocks for every problem and method), B = 1000 |
| Scripts / outputs | `scripts/hedge-today/` → `analysis/output/hedge-today/` |
| Method lessons applied | #1 positive control with a known answer from outside the pipeline (§3.6); #11 horizon-matched outcome (the outcome is exactly the held session); #19 a recency-weighted arm beside each fixed window (B2, S3) |

## 1. The claim

Owner, 2026-11-23: "based upon the fact that we have put a bias of sell on X, the hedge today would be Y, rather than a swing trade or a 5-day hold … what I want to use this for is entering a hedging position based upon certain information." The Desk Terminal's Hedges tab sizes and ranks hedges from **daily NY-close returns** over 20/60/120 days. A hedge opened at the London morning and closed in the New York afternoon is exposed only to the **in-session** co-movement, which can differ from close-to-close co-movement (different closing times for indices and FX, overnight moves that are not held). The claim: sizing (H1) and picking (H2) a session hedge from session data removes more of the session's risk than the tab's daily method, and doing it from past sessions of the **same day type** (H3) removes more again.

## 2. Why it is not already settled

- `hedge-method-comparison` (2026-11-20): compared ten ways of sizing on **daily** returns, applied to the next day. EWMA beat OLS60 by +1.10pp; nothing else beat it. Its §7 lists "hedge ratios on intraday bars" as not tested.
- `hedge-finder-book` / `-es`: daily, book level.
- `hedge-residual-mr/mom/carry`: trading the spread on hourly bars, not risk removed.
- Nothing in the Evidence Book measures a one-session hedge.

## 3. Definitions, fixed in advance

### 3.1 Session and returns
- **Session** = a London calendar weekday d. Price at London hour h (h = 8 … 17) = close of the last M1 bar whose time is in [h:00 − 5 min, h:00) London. Missing if none.
- **Hourly in-session returns** r_{d,h} = log(P_{h+1} / P_h), h = 8 … 16 (nine per session). **Session return** R_d = log(P_17 / P_8).
- A session is **usable for a problem** when P_8 and P_17 exist for every leg. An hourly return is used only when both its ends exist for every leg.
- **Daily returns** (the tab's input): NY-close daily bars (`nyCloseDailyBars`, n ≥ 60), log returns, weekdays only. For session d the daily methods use daily bars with key < d (the last NY close is 22:00 London the evening before: no overlap with the session).
- DXY: hourly, session and daily returns are the weighted sums of the five legs' returns (USD-up sign), as `hedge-method-comparison`.

### 3.2 Problems (H1, H3): the 12 of `hedge-method-comparison`, unchanged
1 GOLD ← DXY · 2 GOLD ← DXY, NQ · 3 NQ ← GOLD, USDJPY · 4 NQ ← US2000 · 5 US2000 ← GOLD · 6 US30 ← GOLD, USDJPY · 7 EURUSD ← USDCHF · 8 GBPUSD ← EURUSD, USDJPY · 9 AUDUSD ← NQ · 10 AUDUSD ← NQ, GOLD · 11 USDJPY ← NQ · 12 DE30 ← NQ, EURUSD.

### 3.3 Methods: hedge weights for session d, using data before d only
| Code | What | Data |
|---|---|---|
| N | no hedge | — |
| **B1** | OLS min-variance, 60 daily returns (**the Hedges tab; the benchmark**) | daily |
| B2 | EWMA least squares, λ 0.97, 250 daily returns (the tab's "ewma" column) | daily |
| S1 | OLS on the session returns R of the last 60 usable sessions | session |
| S2 | OLS on the hourly in-session returns of the last 20 usable sessions (≤ 180 observations) | hourly |
| S3 | EWMA least squares on the hourly in-session returns of the last 120 usable sessions, weight 0.95^(sessions back, 0 for the last one) | hourly |
| C1 | as S2, but only past sessions of the **same day type** as d (the last 20 such sessions within the last 500 sessions; if fewer than 10 exist, S2) | hourly |

A singular window carries the previous session's weights. Hedged session return h_d = R_A,d − Σ_j w_j,d · R_Hj,d.

### 3.4 Day type (C1, H3)
A session is an **event session** for a problem when `calendar_events.csv` lists a `Major` release, scheduled between 08:00 and 17:00 London that day, for any currency of the problem's legs (FX: both currencies; GOLD, NQ, US30, US2000, DXY: USD; DE30: EUR). Otherwise **quiet**. The schedule is known before the session (times only; actual values are never read).

### 3.5 Picking the partner (H2)
Targets: EURUSD, GBPUSD, AUDUSD, USDJPY, GOLD, NQ, US30, DE30. Pool: the other 11 instruments plus DXY (the tab offers every market, so DXY stays in for USD-pair targets too). Each session, point in time, one hedge leg:
- **P-D (the tab):** rank by |ρ| × share, ρ = 60-daily-return correlation, share = share of the 60d correlations ending every 5th day over the last 250 days with ρ's sign; |ρ| ≥ 0.10; top row; sized with B1.
- **P-S (session):** rank by |ρ_s| × share_s, ρ_s = correlation of hourly in-session returns over the last 20 usable sessions, share_s = share of those correlations ending every 5th session over the last 120 sessions with ρ_s's sign; |ρ_s| ≥ 0.10; top row; sized with S2.
- Components (descriptive, no verdict): pick D sized S2; pick S sized B1.
- No qualifying candidate → no hedge that session (counted).

### 3.6 Positive control (must pass before any real outcome is computed)
Synthetic target built on the real EURUSD path as the hedge leg: in-session hourly returns of the target = 1.0 × EURUSD's + noise (sd = EURUSD's hourly sd); the out-of-session part of each daily return = 0.2 × EURUSD's out-of-session daily part + noise (same sd scale). Known answer: the session beta is 1.0. **Pass:** S2's median weight is within ±0.05 of 1.0, and S2's VR beats B1's. If the control fails, the pipeline is fixed before scoring, and the fix is recorded as an amendment.

### 3.7 Outcomes (evaluation sessions only)
Evaluation starts at the first session on or after **2017-01-02** (≥ 250 daily returns and ≥ 120 usable sessions of history), and ends 2026-07-02.
- VR = 1 − var(h) / var(R_A) over the problem's usable evaluation sessions (primary).
- ES5 reduction = 1 − ES5(h) / ES5(R_A), ES5 = mean of the worst 5% of sessions (secondary, descriptive).
- VR on event sessions and on quiet sessions separately (descriptive; H3 uses the pooled VR).
- Mean |w| per leg (a proxy for the hedge leg's spread cost; costs are not netted).
- Halves: first and second half of each problem's evaluation sessions.

## 4. Hypotheses and gates

| # | Question | Expectation |
|---|---|---|
| H1 | Does a session-sized hedge (S1, S2, S3, C1; and B2 as a check) remove more session variance than B1? | Likely yes for problems that mix closing times (indices against FX: 3, 6, 9, 10, 11, 12) and small for FX-in-FX (7, 8). S2/S3 over S1 (nine times the observations). |
| H2 | Does the session pipeline (P-S) beat the tab pipeline (P-D)? | Smaller than H1: the top partner is often the same. |
| H3 | Does conditioning on the day type (C1) beat the unconditioned session hedge (S2)? | NULL or small: halving the sample costs about what conditioning gains. |

**Gate H1 (each method vs B1):** pooled mean ΔVR across the 12 problems > **+1.0pp**, bootstrap 95% interval excluding 0, the same sign in both halves, better in **≥ 8 of 12** problems, and the method's pooled VR above the placebo's (S2 sized on a random partner from outside the problem's set, same number of legs, 50 draws per problem, median). Benjamini–Hochberg q = 0.10 across the 5 methods' bootstrap p-values.
**Gate H2:** mean ΔVR(P-S − P-D) across the 8 targets > +1.0pp, interval excluding 0, both halves, ≥ 6 of 8 targets.
**Gate H3:** mean ΔVR(C1 − S2) across the 12 problems > +1.0pp, interval excluding 0, both halves, ≥ 8 of 12.
**Mirror:** each gate with the sign flipped (reliably worse) is reported.
**Verdicts:** clears its gate → VALIDATED. Interval inside ±1.0pp → NULL (same as the comparison). Otherwise UNDERPOWERED.

## 5. Power
About 2,350 evaluation sessions per problem, 21-session blocks, ≈ 110 independent blocks shared across correlated problems. The script prints each interval's half-width as the minimum detectable difference. Interval wider than ±2pp → UNDERPOWERED, not NULL.

## 6. Multiplicity
H1: BH q = 0.10 across B2, S1, S2, S3, C1. H2 and H3: one test each. ES5, event/quiet splits and components: descriptive, no verdict.

## 7. What it does NOT test
Whether hedging makes money (no P&L, no costs netted, no carry), whether a bias call is right, intraday entry/exit timing inside the session, sessions other than 08:00–17:00 London, options hedges, instruments without long local M1 (WTI, silver, copper, SPX). A hedge ratio is a past co-movement applied to the next session; nothing here forecasts direction. "Keeping the view" (excluding hedges that carry the currency you are betting on) is a display rule, not tested.

## 8. What each verdict changes
- **H1 VALIDATED for a session method:** the Hedges tab's new **Today** mode sizes with the best validated session method and shows its out-of-sample session VR beside the daily ratio. **NULL:** Today mode shows the daily ratio and says session sizing was tested and is the same. **UNDERPOWERED:** Today mode shows both, labelled.
- **H2:** decides whether Today mode ranks partners by session co-movement or keeps the tab's daily ranking.
- **H3:** decides whether Today mode switches to event-day ratios on release days.

## Amendments

### A1 — 2026-11-23 — PRE-RESULTS
Only the panel build had run (counts below); no weight or outcome had been computed.
- **Calendar coverage is USD, EUR and GBP only.** `calendar_events.csv` holds no rows for JPY, AUD, NZD, CAD or CHF. The day type (§3.4) therefore tags Major in-session releases of USD, EUR and GBP only. A JPY, AUD, NZD, CAD or CHF release does not make a session an event session. Most of them fall outside 08:00–17:00 London anyway, but CAD (13:30 UTC) and CHF (morning) do not, so H3 is a test of "US, euro-area or UK tier-1 day or not". Deduped in-session Major counts: USD 973, EUR 161, GBP 223 sessions.
- **Panel:** 2,739 London weekday sessions 2016-01-04 → 2026-07-02; sessions with P8 and P17 per instrument 2,659 (DE30) to 2,720; daily inner-join dates 2,666 from 2016-01-04.
- **B2 in the first weeks of 2017:** the daily history starts 2016-01-04, so B2 uses the available daily returns (at least 200) when fewer than 250 exist. B1 (60) is unaffected.
- **Hourly prices:** the close of the last M1 bar opening in [h:00 − 5 min, h:00) London, as §3.1; London time from the BST rule (last Sunday of March / October, 01:00 UTC).

## RESULTS
