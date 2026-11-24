# bias-fast-layer — Does today's dollar and Fed-pricing move, mapped through each market's own sensitivity, call the next few hours?

**Pre-registered 2026-11-24, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `bias-fast-layer` (H1, the fast call), `bias-fast-vs-momentum` (H2, beats following the market's own move), `bias-fast-lag` (H3, the market has not followed its drivers yet) |
| Branch | `jvphone` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bias-fast-layer` |
| Data | local OANDA H1 mid bars, read-only: `VolRangeForecaster/data/m1/all_pairs_h1.parquet` (FX, GOLD, NQ, SPX500, US30, DE30) and `all_macro_h1.parquet` (US02Y, the US 2-year Treasury CFD price). Sample: London weekday sessions 2016-01-04 → **2026-08-20** (the H1 files end 2026-08-20 23:00 UTC, so the lockbox after 2026-08-21 is never reached) |
| Seed | `20261124` |
| Uncertainty | 21-session block bootstrap over evaluation sessions (the same blocks for every hypothesis), B = 1000 |
| Scripts / outputs | `scripts/bias-fast-layer/` → `analysis/output/bias-fast-layer/`. The scoring uses `js/biasFastCore.js`, the same module the live shadow uses, so the test and the live layer compute the call identically |
| Method lessons applied | #1 positive control with a known answer (§3.7); #11 horizon-matched outcome (the call is made at the slot and judged over the next 3 hours only); a benchmark the owner would otherwise use (follow the market's own move, H2); a placebo that keeps everything but the driver timing (§3.6) |

## 1. The claim

Owner, 2026-11-24, after FundaBias flipped gold from Bearish 8/10 (07:38) to Bullish 7/10 (16:06) while our engine held bearish all day: "Are we not basing our bias on … is DXY getting stronger over the past x hours, news released … Look at Max: USD getting stronger, Fed priced for a hike which means USD gets stronger, which means gold gets weaker. But the impact of this idea on other pairs reacts in different ways … 20 days feels like we aren't considering what is happening right now."

The Bias Engine already has Max's chain (gold = real yields 25% + dollar 25% + Fed path 15% + trend + risk + positioning), but every link is measured over days to weeks (20-business-day changes, weekly repricing, monthly data, D1/H4 trend). The claim: the same two links measured **since this morning** (the dollar's move and the US 2-year yield's move, the market's hourly read of Fed pricing), each mapped onto a market through that market's own measured sensitivity, give a direction for the next few hours.

## 2. Why it is not already settled

- `bias-engine-backtest` (2026-11-16): the slow engine at 1/5/20 days, UNDERPOWERED. Nothing intraday.
- `relationship-map`, `yield-predictive-ladder`: daily horizons (1/5/20 days).
- `post-release-drift-pooled`: surprise sign after tier-1 releases only, release windows only; not the dollar/2y move through the whole session, and not mapped per market.
- `hedge-today`: measured the same hourly co-movement, but for hedging (variance removed), not direction.
- Nothing in the Evidence Book scores a session-so-far macro-driver call on the next hours.

## 3. Definitions, fixed in advance

### 3.1 Prices
- London time from the BST rule (last Sunday of March / October, 01:00 UTC). An H1 bar opening at UTC t closes at t + 1 h. **Price at London hour h** = close of the H1 bar whose close is h:00 London. Missing if no such bar.
- Session = London calendar weekday d. Hours used: 07:00 … 21:00 London.

### 3.2 The drivers (session so far)
- **Dollar U(d, s)** = mean over the dollar legs of the USD-up log change from 07:00 to slot s: −Δln EURUSD, −Δln GBPUSD, −Δln AUDUSD, +Δln USDJPY, +Δln USDCAD, +Δln USDCHF. For a target that is one of these six, its own leg is left out (five legs), so a pair is never explained by itself.
- **Rates Y(d, s)** = −Δln US02Y price from 07:00 to s (a fall in the bond price = a rise in the 2-year yield = more Fed tightening priced).
- A driver needs every one of its legs at both 07:00 and s; otherwise that observation is skipped (counted).

### 3.3 Each market's sensitivity (point in time)
Targets (12): GOLD, NQ, SPX500, US30, DE30, EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD, USDCHF.
For target m on session d: OLS without intercept of m's hourly log returns on the hourly (U, Y) returns, hours 07→08 … 20→21 London, over the **previous 120 usable sessions** (sessions < d; at least 60 required, else no call). σ_h(m, d) = standard deviation of m's hourly log returns over the same window.

### 3.4 The fast call
At slot s ∈ {09:00, 10:00, …, 18:00} London: implied move I = β_U · U(d, s) + β_Y · Y(d, s). Its size in σ: z_I = I / (σ_h · √(s − 7)). **A call** = sign(I) when |z_I| ≥ 0.5, else no call.

### 3.5 Outcome and benchmark
- Forward return F = ln(P_{s+3} / P_s) / (σ_h · √3) (in units of a typical 3-hour move). Secondary horizon: to 21:00 London, scaled by √(21 − s) (descriptive).
- Score of a call = sign(I) · F.
- **Momentum benchmark (M):** sign of m's own log change 07:00 → s, called when its size |Δ| / (σ_h · √(s − 7)) ≥ 0.5.
- Per session: the mean score over all calls that session (all markets, all slots); sessions with no call are dropped from that arm (counted). The pooled statistic is the mean over sessions.

### 3.6 Placebo
I computed from the drivers of a different session (drawn at random, same slot, betas and σ of session d), 50 draws. The pooled placebo edge must sit within its own noise of 0; H1 must beat the placebo median.

### 3.7 Positive control (must pass before any real outcome is computed)
Run the H1 pipeline with F replaced by F* = 0.10 · sign(I) + N(0, 1) on the real calls. **Pass:** recovered pooled edge within ±0.02 of 0.10 and its interval excluding 0. If the control fails, the pipeline is fixed and the control re-run before scoring.

### 3.8 Evaluation window and halves
Evaluation starts at the first session with 120 usable sessions of history (≈ mid-2016) and ends 2026-08-20. Halves: sessions before 2021-07-01 / from 2021-07-01.

## 4. Hypotheses and gates

| # | Question | Expectation |
|---|---|---|
| H1 | Does the fast call predict the next 3 hours (pooled edge > 0)? | Small. Intraday continuation of macro flows is plausible but most of the move is already priced. |
| H2 | Does the fast call beat following the market's own move since 07:00 (paired by session: edge(fast) − edge(M))? | Uncertain: for gold and the dollar pairs the two calls mostly agree. |
| H3 | When the drivers and the market disagree (fast call ≠ sign of m's own move since 07:00, both called), does the fast call win (edge > 0)? This is Max's case: the dollar is up but gold has not fallen yet | The most informative cell; fewer observations. |

**Practical bar:** 0.03 (3% of a typical 3-hour move, ≈ one spread on the majors).
**Gate (each):** pooled edge > 0.03, 95% interval excluding 0, the same sign in both halves, and positive in ≥ 8 of 12 markets (per-market edge = mean score of that market's calls). H1 also needs the edge above the placebo median.
**Verdicts:** clears the gate → VALIDATED. Interval entirely inside (−0.03, +0.03) → NULL. Otherwise UNDERPOWERED. A reliably negative edge (interval below 0) is reported as the mirror (the fast call fades).
**Multiplicity:** BH q = 0.10 across H1–H3. The 21:00 horizon, per-slot and per-market splits, and the U-only and Y-only components are descriptive.

## 5. Power
About 2,600 evaluation sessions, ≈ 120 independent 21-session blocks. Calls per session ≈ 10-60 across 12 correlated markets, so the effective n is closer to sessions than to calls. The script prints each interval's half-width; if it exceeds 0.03 the verdict cannot be NULL.

## 6. What it does NOT test
- Release surprises as their own input (the calendar's actuals cover USD/EUR/GBP only and live non-US actuals are missing): a release enters only through the dollar and 2-year move it causes.
- Live Fed-funds-futures odds (no intraday history): the US 2-year stands in for them.
- Costs, entries, stops, position sizing. This is a direction read, not a trade.
- Whether the fast layer should change the morning record. The slow engine is unchanged.

## 7. What each verdict changes
- **Live shadow, regardless of verdict:** the fast layer is computed at each hourly re-run (`js/biasFastCore.js`, H1 bars from OANDA, the same definitions) and shown on Through the day beside the slow engine and FundaBias, labelled with this study's verdict. Its calls are logged from the first deploy for a forward record (judged at 60 and 120 sessions, same score).
- **H1/H2 VALIDATED:** the fast call is shown as a bias adjustment with its edge; a prereg for blending it into V2's intraday re-runs follows.
- **NULL:** shown as context only ("what the dollar and 2-year imply"), saying it does not call the next hours.
- **H3:** decides whether the "drivers moved, market has not" flag is shown as a signal or as context.

## Amendments

### A1 — 2026-11-24 — PRE-RESULTS
Only the panel build and the positive control had run; no real outcome had been computed.
- **Panel:** 2,774 London weekdays 2016-01-04 → 2026-08-20; hourly prices found 39,759 (DE30) to 41,356 (NZDUSD) of 41,610 per instrument; US02Y 39,562 (the bond CFD has more closed hours and holidays).
- **Calls built:** 274,111 slot × market observations with drivers, fit and a 3-hour outcome; skipped 733 session × market fits (under 60 sessions of history), 50,292 slot observations with a driver leg missing (mostly US02Y), 1,147 with no price 3 hours later. Evaluation starts 2016-03-29 (the first session with 60 usable sessions behind it; the prereg's "≈ mid-2016" assumed 120, but §3.3 requires at least 60, which governs).
- **Positive control passed:** planted 0.10, recovered 0.105 [0.095, 0.118].

## RESULTS
