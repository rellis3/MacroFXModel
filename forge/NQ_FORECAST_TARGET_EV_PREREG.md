# nq-forecast-target-ev — Can the vol forecast's open-to-close / high-to-low levels build an NQ trade with positive expectancy that the forecast, not the drift, explains?

**Pre-registered 2026-11-02, before any strategy outcome was computed.**

| | |
|---|---|
| ID / ledger id | `nq-forecast-target-ev` (the trade question); `nq-forecast-oc-hl-calibration` (Parts A/B, descriptive) |
| Branch | `main` (temp worktree; the shared checkout belongs to other sessions) |
| Register row | `plans/RESEARCH_REGISTER.md` → `nq-forecast-target-ev` |
| Data | NQ = OANDA `NAS100_USD` M1 (`portfolioBacktest/cache/nas100_usd_m1.parquet`); forecast rows `analysis/output/forecast_history/NQ.csv` (`scripts/forecast_history/build.mjs`). Window: London sessions **2020-08-24 → 2026-08-20**, `oos == 1` only (1,550 sessions). The lockbox (after 2026-08-21) is not read. |
| Seed | `20261102` |
| Uncertainty | session moving-block bootstrap, block 21 sessions, B = 2000, percentile 95% intervals |
| Scripts / outputs | `scripts/nq-forecast-target-ev/` → `analysis/output/nq-forecast-target-ev/` |
| Harness | own script (Python): the trade sims need the M1 path and the forecast CSV joined by London session |

This is a new question, separate from day-reconstruction M1–M7. Those are frozen and are neither re-opened nor re-scored here.

## 0. Forecast-definition audit (done before this prereg; from code, not from outcomes)

- **The ladder.** It is built by `buildLadder(σ, spec)` in `js/forecastLadder.js`, the single engine used by the live forecaster, the exports and the history builder.
  - Each rung is `width[q][rung] × σ_used`, a **percentage distance from the session open**. It is not a price level until it is applied to the open.
  - `σ_used = σ_daily × event multiplier`. σ_daily = `forecastSigma` on NY-close daily bars strictly before the session (the fold's estimator: `ewma_090` in fold 0, `yz_10` after). The event multiplier is the fold's fitted factor for the day's tag (FOMC ≈ 1.09–1.20, quiet ≈ 0.97).
  - The widths are the realised quantiles of (realised ÷ σ), fitted walk-forward by `forge/vol.py` (`forge/out_vol_lon/vol_report.json`, key `nq`). There are six folds, trained through 2020-08-20, 2021-08-19, … 2025-08-19. Each session uses the newest fold trained before its open (`oos = 1`).
  - Rows before 2020-08-24 use fold 0, which was trained on them (`oos = 0`). They are **not point-in-time** and are excluded.
- **The four quantities** (code comment, `js/forecastLadder.js`):
  - **O→C (`oc`):** `|close − open|` reaches this. **It is unsigned: a size, not a direction.** p50 is exceeded on 50% of days, p75 on 25% (both sides together). `ladderLevels` draws it both ways (`oc_up`, `oc_dn`).
  - **H→L (`hl`):** the session range reaches this. **It is a width, never a level.** The code deliberately draws no `open ± hl`.
  - **O→H / O→L (`oh`, `ol`):** the high reaches open + this, and the low reaches open − this. These are fitted separately and are the only directional *excursion* quantities.
- **Session.**
  - The open is the open of the first M1 bar at or after 00:00 Europe/London (`open` in NQ.csv).
  - The close is the close of the last M1 bar before 22:00 London. The realised values are `r_oc = |C−O|/O`, `r_ocs` signed, `r_oh`, `r_ol` and `r_hl`, in %.
- **Fixed or moving.** All rungs are fixed at the open: σ uses only prior NY-close bars, and the fold and event tag are known before 00:00. Nothing in them updates during the session.
- **Available at entry.**
  - Everything above is available at 00:00 London.
  - The live page's NQ σ is Yahoo-based and about 2% wider than this rebuild (day-recon M1). That small production–history gap is accepted and named.
- **Prior exposure (named, not hidden).**
  - Before writing this I looked at the whole-history description of the realised columns (2016–26, including non-PIT rows): mean signed O→C +0.088%, SD 1.35%. On the PIT window, the SD of signed O→C is 1.40%, used for power below.
  - NQ's positive intraday and overnight drift is already known from `overnight-hold-nq` (+0.034%/trade net, underpowered).
  - day-recon M1–M7 established that the O→H/O→L ladder is a well-calibrated distance ruler with no forecast-specific direction. The **O→C and H→L rungs were never used as trade targets** in any prior test I could find. ASYMMETRIC_TRADES used O→H/O→L "far p75" targets after line entries, not open entries.

## 1. Claim and interpretation

The suggestion: "trade NQ; use the forecast's p50 open-to-close and high-to-low levels; enter long under a precise rule; exit at the p75 level; measure over months."

Possible readings:

| # | Reading | Matches the suggestion? |
|---|---|---|
| I1 | Long at the session open, limit exit at open + O→C p75, otherwise out at the close | **Yes, most literally.** It needs no invented entry level and uses the O→C rung as the exit. |
| I2 | Long at the open, exit at the O→H p75 line (the forecast's own *upside* excursion quantity) | A defensible correction of I1: "how far up the high gets" is O→H, not O→C |
| I3 | Long when price reaches a p50 reference (e.g. open − O→C p50), exit at the p75 | Needs an invented entry level and a stop; neither is in the suggestion |
| I4 | Use H→L to place levels (open ± hl/2, etc.) | Contradicts the forecast's own definition (H→L is a width, not a level) |

**Primary hypothesis = I1 (P1).** I2 and the p50 target are registered secondaries. I3 and I4 are not tested. The "p50 levels" in the suggestion enter as the p50 target cell (S1) and as Part A/B descriptives.

## 2. Why this is not already settled

- **Closest Evidence Book entries:**
  - `nq-continuation-execution`: NQ stop entries at the lines, net −0.050R.
  - `asymmetric-trades` (far p75 targets after line entries, 0/36).
  - `overnight-hold-nq`: a different window, the drift.
  - day-recon M6/M7: reach calibration of O→H/O→L.
- **None of these enters at the open or uses the O→C/H→L rungs as the exit.** The question here is narrower: whether a target taken from the forecast adds anything over the same long without that target, and over equally sized non-forecast targets.

## 3. Definitions (frozen)

- **Universe:** every PIT session in the window, 1,550 sessions; 100% traded by construction.
- **Entry:** long 1 contract at the session open O. All quantities are from the PROD `pit_*` columns.
- **Fill rules:**
  - A target limit T fills at T in the first minute whose M1 high ≥ T, counting from the entry minute.
  - A stop S fills at S in the first minute whose M1 low ≤ S.
  - If both are touched in the same minute, the stop is taken first (conservative). The count of such minutes is reported.
  - Otherwise the trade exits at the close of the last bar before 22:00 London (no financing: flat before the 22:00 roll).
- **Costs:**
  - Primary: OANDA NAS100 model round trip **0.0068% of price**, from `analysis/output/cost-verification/cost_table.json`.
  - Sensitivity: 0×, 2× and 3×. 3× roughly covers a midnight market fill on futures (1 tick + slippage + $4 commission ≈ 0.0035%) with a margin for thin 19:00 ET liquidity.
- **Units and sizing:**
  - P&L in index points.
  - In **$ per 1 NQ contract ($20/pt)**; MNQ is $2/pt.
  - In % of O.
  - In **σ-units** (P&L% ÷ `pit_sig_used`). With no stop there is no R, so σ-units are the risk unit, and the denominator is stated beside every metric.
  - Fixed 1 contract per trade, no compounding. Drawdown is in points and $ per contract, and in % of the average notional.

### Strategies (all on identical sessions and costs)

| id | entry | target | stop | role |
|---|---|---|---|---|
| **P1** | open | O × (1 + `pit_oc_p75`) | none | **primary (I1)** |
| S1 | open | O × (1 + `pit_oc_p50`) | none | secondary (the "p50" reading) |
| S2 | open | O × (1 + `pit_oh_p75`) | none | secondary (I2) |
| S3 | open | O × (1 + `pit_oc_p75`) | O × (1 − `pit_ol_p75`) | secondary: the one stop variant, the forecast's own p75 down line |
| B1 | open | none | none | baseline: session buy-and-hold, open → 22:00 (= the same entry/exit with no forecast target) |
| B2 | open | O × (1 + q75), q75 = 75th pct of realised `r_oc` over the prior 250 sessions (all NQ.csv rows; realised values only) | none | fixed-distance control (no forecast) |
| B3 | open | O × (1 + k × ATR20%), ATR20% = mean `r_hl` of the prior 20 sessions, k = median of `pit_oc_p75`/ATR20% over the window (uses no outcomes) | none | ATR-distance control, the same average size as P1 |
| B4 | open | P1 with each session's `pit_oc_p75` replaced by another session's from the **same calendar quarter** (1,000 permutations) | none | placebo: keeps the vol regime, removes the day-specific forecast |
| B5 | prior 22:00 close → 22:00 close (24 h) | — | — | context only: daily buy-and-hold |

S3's baseline twin is B1 with the same stop, reported beside it.

### Parts A and B (descriptive, `nq-forecast-oc-hl-calibration`)

- **A (O→C):**
  - P(`r_oc` > p50, p75, p90) against 50/25/10%.
  - Signed: P(C − O > +oc_p) and P(C − O < −oc_p).
  - Mean signed O→C by forecast-size tercile.
  - Pinball loss of `pit_oc_p75` against the B2 trailing quantile and the B3 ATR scaling (skill = 1 − loss/loss_baseline).
- **B (H→L):**
  - P(`r_hl` > p50, p75, p90).
  - Hour (London) at which the running range (`oh_hN + ol_hN`) first reaches `hl_p50` / `hl_p75`.
  - After the range reaches `hl_p50`: further range extension, and |close − price at that minute| in σ, against the same quantities at the median reach time on days that never reach it.
  - Pinball skill against the same two baselines.
- **Combined rule:** none is run here. Decision rule, frozen now: a combined O→C × H→L rule gets its own prereg only if Part A or B shows forecast-specific skill (pinball skill CI > 0 against **both** baselines) **and** the P1 family passes its gate. Otherwise none is proposed.

## 4. Hypotheses, gate and mirror

- **Profit claim (per strategy):** net mean P&L% > 0. Block-bootstrap CI; Holm α = 0.05 across {P1, S1, S2, S3}.
- **THE GATE (forecast adds value) — all must hold for P1:**
  1. P1 net mean > 0, Holm-adjusted;
  2. paired P1 − B2 > 0 **and** P1 − B3 > 0, each with its bootstrap 95% CI excluding 0;
  3. P1 above the 95th percentile of the B4 placebo distribution of net mean;
  4. the same sign of P1 − B2 in both halves: development 2020-08-24 → 2023-08-18 (folds 0–2), validation 2023-08-21 → 2026-08-20 (folds 3–5).
  5. For anything live, the stats-defaults bar also applies: |t| ≥ 3, or a forward test.
- **P1 − B1** is reported but is not part of the gate. A target can beat buy-and-hold just by cutting the right tail on a drifting or reverting index, which says nothing about the forecast.
- **THE MIRROR:** the same P1 run **short** (target O × (1 − `pit_oc_p75`)). Its controls are short B2, B3 and B4. If the "forecast value" shows up equally on the short side, it is a property of target geometry, not of direction or forecast content.
- **Development and validation:** nothing is fitted on outcomes (B3's k uses forecast values only), so the halves are a stability check, not a train/test fit. The untouched out-of-sample test is the lockbox (≥ 60 sessions, owner approval) or a forward record. Neither is touched here.

## 5. Power

- SD of signed O→C on the window: 1.40%.
- P1 truncates the right tail. Assume a per-trade SD of about 1.1–1.4%.
- SE with block inflation is about 0.03–0.04%, so the **MDE (80%, two-sided 5%) is about 0.09–0.11% per trade**, roughly 14–17 cost units.
- **Paired differences** (P1 − B2/B3) share every session, so their SD is much smaller. The MDE is computed from the bootstrap SE (2.8 × SE) and reported.
- **Pre-stated rule:**
  - If the paired MDE exceeds **0.02% per trade** (about 3× the cost; smaller than any forecast advantage worth trading) and the gate fails, the verdict is **UNDERPOWERED**.
  - If the MDE is at or below 0.02% and the gate fails, it is **NULL**.

## 6. Multiplicity

- **Primary family:** {P1, S1, S2, S3} × profit claim, Holm.
- **Gate:** conjunctive, on P1 only. S1–S3 gate rows are descriptive unless P1 passes.
- **Parts A/B:**
  - About 20 descriptive numbers, no p-values claimed.
  - Pinball skill CIs are reported, and only the "both baselines" rule in §3 matters.
- **Not counted as new trials:** cost multiples and yearly/monthly cuts.
- **Disaggregation:** by year, weekday and event tag; BH q = 0.10. A surviving slice is a candidate for its own prereg only.

## 7. Reported for every strategy (and how each is defined)

- n trades and % of sessions traded (denominator: 1,550 PIT sessions).
- Win rate: net P&L > 0, over trades.
- Average win and average loss, net.
- Expectancy per trade in pts, $/NQ contract, % of open and σ-units.
- Profit factor: Σ net wins / |Σ net losses|.
- Maximum drawdown: on the cumulative per-contract $ curve, peak to trough.
- Sharpe and Sortino: daily net % P&L × √252, with flat days counted as 0 (every session trades here).
- Average MFE and MAE: % and σ, measured to exit.
- Holding time in minutes.
- Monthly and yearly tables, and the equity curve.
- Concentration: the mean without the best 10 trades, and the share of total P&L from the top 5% of trades.
- Cost sensitivity at 0/1/2/3×.

## 8. What each verdict changes

- **VALIDATED** (gate passes): "supports further validation". Next is a forward paper record on the live ladder and a lockbox read with owner approval. **Nothing live.**
- **UNDERPOWERED:** "promising but unconfirmed" only if P1 beats B2/B3/B4 in point estimate. Otherwise it is "cannot tell", and it stops there.
- **NULL:** the forecast-derived target adds nothing beyond drift and equally sized distances. "Reject" as a trade construction, and **no variant hunt** (other rungs, stops or windows) follows.
- **What it does NOT test:**
  - other instruments;
  - the v3 chosen (persist + IV) lines;
  - entries away from the open;
  - discretionary use of the levels;
  - post-lockbox data.

## Amendments

### A0 — 2026-11-02 — PRE-RESULTS (mechanics only)
The open-match tolerance in the mechanics assert was loosened from 1e-9 to 1e-6, because NQ.csv stores the open to 6 decimals (max relative error 4.8e-8). A first scored attempt crashed writing to a missing output folder before printing any outcome. No outcome had been seen.

### A1 — 2026-11-02 — POST-HOC (results seen)
This demotes the §8 reading "promising but unconfirmed" for the UNDERPOWERED word. P1's margins over B2 and B3 are +0.002% and +0.001% per trade, under a third of one cost unit, and P1 sits at the 81.5th percentile of the placebo. The verdict word stays UNDERPOWERED under the frozen MDE rule (paired MDE 0.024% vs 0.020%). The description is "reject as a construction; a forecast-specific advantage above about 0.02% per trade is excluded".

## RESULTS

See `analysis/output/nq-forecast-target-ev/RESULTS.md`.
- **P1:** +0.027% per trade [−0.029, +0.086].
- **Against the controls:**
  - P1 − B1 (no target): −0.026% [−0.050, −0.003];
  - P1 − B2: +0.002% [−0.013, +0.020];
  - P1 − B3: +0.001% [−0.011, +0.014];
  - placebo: 81.5th percentile.
- **Gate:** 0 of 4 conditions.
- **`nq-forecast-target-ev`:** UNDERPOWERED (decision: reject the construction).
- **`nq-forecast-oc-hl-calibration`:** CONTEXT. The rungs are calibrated and beat a trailing quantile (+9.6% / +16.9% pinball). They do not clearly beat ATR (+1.3% / +3.2%, CIs touching 0).
