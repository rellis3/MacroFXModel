# close-window-momentum — does the move into 15:30 ET predict the last 30 minutes of the US cash session on our instruments, more so when dealers are short gamma, and does it survive our costs?

**Pre-registered 2026-11-11, before any outcome was computed.** The count-first pass (`scripts/close-window-momentum/count.py`
→ `analysis/output/close-window-momentum/power_count.json`) read only cell sizes, the marginal SD of the predictor and of
the outcome / trade P&L (control-sample SDs, which the template allows), the gamma-sign counts, and the number of level
first touches per time window. No slope, no predictor-outcome pairing, no trade mean and no race outcome was computed.
The level builder's race code exists but was run only with `--count` (no outcome field written).

| | |
|---|---|
| ID / ledger ids | `close-window-momentum` (unconditional slope + first half-hour, NQ/ES), `close-window-momentum-gamma` (gamma split), `close-window-momentum-trade` (the costed trade), `close-window-momentum-secondary` (gold, FX), `close-window-momentum-levels` (level arm) |
| Branch | `main` (pushed from a scratch worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `close-window-momentum` |
| Data | **Primary:** NT8 continuous 1-minute futures, ratio-adjusted, `analysis/output/nt8/continuous/{NQ,ES}_1m_ratio.parquet` (end-stamped; labels moved back one minute, faults-log 2026-11-07), 2016-01-04 → 2026-08-21. **CFD replication:** OANDA M1 bid/ask `data/m1_bidask/{nq,spx}_m1.parquet` (open-stamped; mid = research mid), 2016-10-24 → 2026-08-21. **Secondary:** OANDA M1 bid/ask `gold`, `eurusd`, `gbpusd`, `usdjpy`, `audusd`, same window. **Gamma:** `oi_research_book/data/gex_range_es/nyc/daily_master_near_{nas100_usd,spx500_usd}.parquet` `net_gex_sum` (CME monthly/quarterly books, near surface), 2020-09/11 → 2026-08-20. **Levels:** day-reconstruction archive `analysis/output/day-reconstruction/archive/{NQ,GOLD,EURUSD}_{days,path}.parquet`; NQ walls from `oi_research_book/data/gex_range_es/nyc/daily_master_near_nas100_usd.parquet` on `analysis/output/nt8/continuous/NQ_1m_unadj.parquet`. Every series ends at **2026-08-21** (lockbox). |
| Seed | `20261111` (every script) |
| Uncertainty | week-clustered pairs bootstrap (ISO week = cluster, resample weeks with replacement), B = 2,000; Newey-West HAC t (lag 5) reported beside every slope |
| Scripts / outputs | `scripts/close-window-momentum/` (`build.py`, `levels.py`, `common.py`, `count.py`, `analyze.py`) → `analysis/output/close-window-momentum/` |
| Harness | own scripts (Python), because the anchors are clock times in two time zones and the gamma join reuses the gex-range-es files |

## 1. The claim (required)

**Baltussen, Da, Lammers & Martens (2021), "Hedging demand and market intraday momentum"** (JFE): across 60+ futures, the
return from the previous close to 30 minutes before the close (r_ROD) predicts the last-30-minute return (r_LH). On the
S&P 500 future the slope is 6.63 (t 4.8) when dealer net gamma is negative and 0.82 (t 1.0) when it is positive (their
tables report slopes x 100, i.e. 0.066 and 0.008 in return units). The equity pooled slope is about 4.2 (x 100). The last
half hour reverses over the next 1-3 days. FX futures alone after 2000 are not significant; the effect stops at 16:00 ET.
**Gao, Han, Li & Zhou (2018), "Market intraday momentum"** (JFE): on SPY the first half hour (prior close → 10:00 ET)
predicts the last half hour. Sources read through the private library synthesis (titles only cited here).

**Claim tested:** on our instruments and our data, the vol-scaled move from the prior 16:00 ET close to 15:30 ET predicts
the 15:30 → 16:00 ET move on NQ and ES futures, the slope is larger on negative-gamma days, the first half hour predicts
it too, and a sign(r1) trade over the last 30 minutes pays after our costs. **Secondary (the owner's interest):** a first
arrival at a forecast-ladder line or an OI wall in the direction of the day, inside the close window, follows through more
often than the same arrival 10:00-15:00 ET.

## 2. Why it is not already settled (required)

Searched `js/deskEvidence.js`, `plans/RESEARCH_REGISTER.md`, `forge/`, `plans/`, `MD files/` for intraday momentum, last
half hour, close window, Gao, Baltussen. **No study has tested the close-window regression or the r_ROD trade.**
`MD files/TRADABILITY_REVIEW.md` and `plans/vol-layer/L2/L7/L8_LITERATURE_SPEC.md` cite Gao and Baltussen; nothing was run.
Nearest banked entries and why each is a different question:

- `directional-rescore` (null, 84k touches, 2016-26): slight **continuation** tilt at the export lines, follow +0.025R
  gross / −0.048R net; never conditioned on the clock or on the day's direction into the close.
- `exhaustion-schedule` (null): "exhaustion is a CLOCK effect": a new extreme late in the London day is ~0.64 likely
  final from 20:00 London; distance adds nothing. Relevant to the level arm (late arrivals may stall), not a test of
  close-window continuation.
- Fade/Continue Book (`range-book-family`, memory): late-day touches continue only ~13%, mostly stall. Same caution.
- `reversal-hour` (validated): moves starting 20-22 UTC revert on EUR/USD and gold; weak on NQ. Our index window
  (19:30-20:00 UTC in summer, 20:30-21:00 in winter) overlaps it, so a reversal is a live alternative.
- `gamma-regime-trades` (null, NQ) / `-fx` (null): fade/follow switch at the p75 line by gamma regime; no clock, no r_ROD.
- `gex-range` / `gex-range-es` (validated size on ES): short gamma = wider sessions, about half is recent falls; range,
  not direction. We reuse its gamma sign and its OI(D) → session D+2 timing.
- `day-reconstruction` M3: NQ continuation after a touch +0.05 to +0.07R gross at ±0.25σ, equal at phantom lines,
  "NQ intraday momentum measured on the forecast's scale". Not split by clock or day direction.
- `nq-line-touch-hold-to-close` (exploratory): follow to the close is the mirror of the fade; asymmetry = drift.
- `vwap-stretch-line-touch`, `jump-after`: other conditioners, not the r_ROD predictor.
- In flight, not edited: `wall-dte-style` (fade/follow at walls by DTE) and `level-local-gamma` (local gamma at the
  level). This study conditions on clock and day direction, not on wall DTE or local gamma.

## 3. Definitions, fixed in advance (required)

**Anchors (prices).** Price at time T = close of the M1 bar that ends at T (OANDA open-stamped: bar start T−1 min; NT8
end-stamped: labels moved back one minute, faults-log 2026-11-07, checked here on the 09:30/16:00 volume spikes). If that
bar is missing the last bar ending within 5 minutes before T is used, otherwise the day is dropped (counted). Clock times
are local and DST-aware (America/New_York for indices and gold; Europe/London for FX).

| Family | prior anchor (previous weekday) | predictor end | window | first half hour |
|---|---|---|---|---|
| Indices NQ, ES (futures), NQ, SPX500 (CFD) | 16:00 ET | 15:30 ET | 15:30 → 16:00 ET | prior 16:00 → 10:00 ET |
| GOLD (CFD) | 13:30 ET (COMEX settle) | 13:00 ET | 13:00 → 13:30 ET | — |
| EURUSD, GBPUSD, USDJPY, AUDUSD (CFD) | 16:00 London (WM/R fix) | 15:30 London | 15:30 → 16:00 London | — |

The prior anchor is the last price at or before the previous weekday's window-end time (20-hour tolerance, so a US
holiday's early halt gives its last price).

- **σ** = 20-session stdev of New York-close (17:00 NY) daily log returns built from the same M1 file, ending at the NY
  close before the day (data-rules item 2). Known before the day starts.
- **Predictor** x = ln(P_15:30 / P_prior) / σ; **outcome** y = ln(P_16:00 / P_15:30) / σ (family anchors as above).
  First half hour x_fh = ln(P_10:00 / P_prior) / σ.
- **Day filter.** ≥ 25 of the 30 window bars present. Index CFD cells and GOLD keep only days on which the matching
  futures file (NQ for NQ CFD and GOLD, ES for SPX CFD) has a full window, which drops US holidays and half-days (futures
  halt at 13:00-13:15 ET). FX keeps every weekday that passes the bar count.
- **Gamma sign.** gneg = 1 if `net_gex_sum` of CME OI date D < 0; used on the cash day of NY-close session D+2 (the
  gex-range-es timing; OI(D) is public mid-D+1). Sensitivity, not scored: D+1 (OI(D) is public by ~16:00 UTC on D+1,
  before 15:30 ET, so it is knowable for the window though not for all of r1).
- **Slope.** OLS of y on x with an intercept, per instrument, never pooled. The raw (unscaled) slope is reported beside it
  for comparison with the papers' x 100 numbers.
- **Interaction.** β_neg − β_pos from separate fits, bootstrapped jointly (same week draws).
- **Trade.** At 15:30 ET (13:00 ET gold, 15:30 London FX) take sign(x) for the window, flat at its end. P&L in bp of the
  entry price. Costs: futures 1 tick each side + $4.50 round-trip commission (NQ 0.725 pt, ES 0.59 pt, the repo's
  futures_check convention), as bp of the entry price; CFDs pay half the measured OANDA bid/ask spread at the entry minute
  and half at the exit minute (`data/m1_bidask`, the spread at its own minute, never a flat table). x = 0 → no trade.
  Benchmark: always long over the same window. Long (x > 0) and short (x < 0) trades reported separately.
- **Level arm.** First touches (first M1 bar whose high/low reaches the level) of the archive's static OH/OL p50/p75/p90
  lines (open × (1 ± rung%), London 00:00-22:00 session, point-in-time parameters as built). The builder reproduces the
  archive's own first-touch bar on 4,550/4,550 NQ, 4,588/4,588 GOLD and 4,479/4,480 EURUSD touches (one float tie).
  **With the day** = the level lies on the same side of the prior anchor (16:00 ET NQ, 13:30 ET gold, 16:00 London EURUSD)
  as the touch direction. Windows on the touch bar's local start minute: NQ late60 = [15:00, 16:00) ET, late30 =
  [15:30, 16:00), early = [10:00, 15:00); GOLD late60 [12:30, 13:30), late30 [13:00, 13:30), early [08:50, 12:30) ET;
  EURUSD late60 [15:00, 16:00), late30 [15:30, 16:00), early [08:30, 15:00) London. **Outcome:** a 0.25σ race from the
  level over bars k+1 … k+30: follow = +0.25σ further in the touch direction first, fail = 0.25σ back first; both in one
  bar = `both`, neither = `open`; follow share = follow / (follow + fail + both) (a `both` counts against follow);
  `open` counted and reported. σ unit = the archive's `scale` (open × σ_used).
  **Placebo levels:** the same rung scaled by 0.85 and 1.15 (pooled), same filters and race.
  **NQ OI walls:** `call_wall_a` and `put_wall_a` (max-OI call / put strike, near surface) of OI date D on the cash day
  of session D+2, on unadjusted NQ futures from 09:30 ET (side set by the 09:30 price; first touch after the first bar);
  σ unit = σ × prior close; placebo = prior close + f × (wall − prior close), f ∈ {0.85, 1.15}.
- **De-clustering.** One observation per instrument-day for the regression and trade. Level touches of different rungs on
  one day are kept; the week-cluster bootstrap carries their dependence.
- **Sample / stability.** Halves split at each cell's median date. Both halves reported for every scored cell.

## 4. Hypotheses, expectation first (required)

| # | Question (per instrument, never pooled) | Expectation |
|---|---|---|
| P1 | β (y on x), NQ_FUT, ES_FUT | **Yes, small**: +0.01 to +0.04 (the papers' equity slopes are ~0.04; post-2016 decay likely) |
| P2 | β on negative-gamma days, NQ_FUT, ES_FUT | **Yes**, larger than P1 (paper 0.066) |
| P3 | β_neg − β_pos, NQ_FUT, ES_FUT | **Positive** (paper ~0.058); CME book is ~5% of dealer gamma, so may be weak |
| P4 | β of y on x_fh (Gao), NQ_FUT, ES_FUT | **Yes, small** |
| P5 | Trade net mean (bp), NQ_FUT, ES_FUT | **Null or sub-cost** (directional-rescore: continuation real but sub-cost) |
| P6 | β and trade net, NQ_CFD, SPX_CFD | as P1/P5 (CFD replication, own costs) |
| S1 | β, GOLD (13:00-13:30 ET), EURUSD/GBPUSD/USDJPY/AUDUSD (15:30-16:00 London) | **Null for FX** (Baltussen FX n.s. after 2000), gold weak |
| S2 | Trade net mean, same five | **Null** |
| L1 | Follow share with-the-day: late60 − early, real lines (NQ, GOLD, EURUSD, NQ walls) | **Unclear**: momentum says up, exhaustion-schedule / Fade-Continue Book say stall |
| L2 | L1(real) − L1(placebo) | **Null** (M3: continuation equal at phantom lines) |

**THE GATE (per scored cell → VALIDATED):** the 95% bootstrap CI excludes 0 on the predicted side (positive for every
cell), the cell survives BH at q = 0.10 across all 32 scored cells, the estimate has the same sign in both halves, and
the point estimate ≥ the cell's pass bar (§5). Trade cells additionally need the long and short sides each with a
positive gross mean (the index long-drift trap) and a positive net mean in both halves.
**CONTEXT:** CI excludes 0 on the predicted side and survives BH, but the point estimate is below the bar or a halves /
side condition fails (statistical, not economic, or not stable). **NULL:** none of the above and the CI's upper end is
below the pass bar (the bar is ruled out), or the CI excludes 0 on the wrong side. **UNDERPOWERED:** otherwise (the CI
still includes the bar).
**THE MIRROR (descriptive):** the same predictor-to-window slope for a mid-afternoon window (prior close → 14:30 ET
predicting 14:30 → 15:00 ET) and the post-close window (x predicting 16:00 → 16:15 ET); the paper expects the close
window above both. Also descriptive: next 1-3 day reversal of y (y on future 16:00→16:00 returns), Gao's first-half-hour
vol tercile, trailing-vol terciles inside each gamma arm, the D+1 gamma timing, late30 level windows, raw slopes, HAC t,
by-year slopes.

**Question-level verdicts for banking.** `close-window-momentum` = P1 and P4 on NQ_FUT and ES_FUT; `-gamma` = P2, P3;
`-trade` = P5 and P6 trade cells (P6 β cells reported with P1); `-secondary` = S1, S2; `-levels` = L1, L2. Each question
takes VALIDATED if any of its cells is VALIDATED (naming which); else CONTEXT if any is CONTEXT; else NULL if every
cell is NULL; else UNDERPOWERED.

## 5. Power — what this design can and cannot find (required)

From `power_count.json` (control-sample SDs only). MDE = 2.8 × SE × 1.2 (80% power at two-sided 5%, with a 1.2
inflation for week clustering and fat tails). SE(β) = sd(y) / (sd(x) √n); SE(trade) = sd(P&L)/√n; proportions at
p = 0.5; L2 inflates L1 by √1.5 for the pooled placebo arm.

| Cell | n | MDE | Pass bar | Verdict |
|---|---|---|---|---|
| P1 β NQ_FUT / ES_FUT | 2,356 / 2,350 | 0.015 / 0.018 | 0.025 | POWERED |
| P2 β_neg NQ_FUT / ES_FUT | 216 / 174 (pos 420 / 437; 2020-11 → 2026-08) | 0.042 / 0.061 | 0.066 (paper) | POWERED |
| P3 β_neg − β_pos NQ_FUT / ES_FUT | 636 / 611 | 0.055 / 0.075 | 0.058 (paper) | NQ POWERED / **ES UNDERPOWERED by design** |
| P4 β_fh NQ_FUT / ES_FUT | 2,355 / 2,349 | 0.022 / 0.027 | 0.035 | POWERED |
| P5 trade net NQ_FUT / ES_FUT | 2,356 / 2,350 (sd 35.9 / 31.9 bp; mean cost 0.65 / 1.53 bp) | 2.49 / 2.21 bp | 2.75 bp (≈ net Sharpe 1.2 a year) | POWERED |
| P6 β NQ_CFD / SPX_CFD | 2,141 / 2,021 | 0.017 / 0.021 | 0.025 | POWERED |
| P6 trade net NQ_CFD / SPX_CFD | (sd 37.3 / 33.7; cost 0.64 / 1.09 bp) | 2.71 / 2.52 bp | 2.75 bp | POWERED |
| S1 β GOLD / EURUSD / GBPUSD / USDJPY / AUDUSD | 2,141 / 2,517 / 2,519 / 2,517 / 2,501 | 0.010 / 0.016 / 0.016 / 0.014 / 0.015 | 0.025 | POWERED |
| S2 trade net, same | (cost 2.27 / 1.24 / 1.37 / 1.16 / 1.89 bp) | 0.98 / 0.71 / 0.89 / 0.69 / 0.96 bp | 1.0 bp | POWERED |
| L1 NQ lines (with-day, factor 1.0: late60 241 vs early 1,657) | | 11.6 pp | 10 pp | **UNDERPOWERED by design** |
| L1 GOLD lines (late60 107 vs early 1,253) | | 16.9 pp | 10 pp | **UNDERPOWERED by design** |
| L1 EURUSD lines (late60 437 vs early 2,069) | | 8.9 pp | 10 pp | POWERED |
| L1 NQ walls (late60 5 vs early 36) | | ~80 pp | 10 pp | **UNDERPOWERED by design** (reported, can't pass) |
| L2 (each) | | L1 × 1.22 (NQ 14.2, GOLD 20.7, EURUSD 10.8 pp) | 10 pp | **UNDERPOWERED by design** (all) |

The level arm is powered only for a large clock effect on EURUSD. The owner's question on NQ needs about 300 late
with-the-day arrivals for a 10 pp effect; this sample has 241 (late60) / 121 (late30). It is run and reported because a
large effect is still visible and because the point estimates set the next design; an empty cell is UNDERPOWERED,
never NULL.

## 6. Multiplicity — how many cells, and the corrected bar (required)

**Scored cells: 32.** P1–P5 × {NQ_FUT, ES_FUT} = 10; P6 {β, trade} × {NQ_CFD, SPX_CFD} = 4; S1, S2 × 5 = 10;
L1, L2 × {NQ, GOLD, EURUSD, NQ walls} = 8. Two-sided p from the bootstrap SE (normal approximation, `pFromCI` logic);
**Benjamini–Hochberg at q = 0.10 across all 32** (the owner's instruction for this study, in place of Holm on a subset);
Holm at 0.05 reported beside it. Everything else is descriptive. Promotion to anything live needs |t| ≥ 3 on the
scored cell (not just VALIDATED). Variants: none beyond the registered sensitivities; no other window, threshold or
anchor will be tried.

## 7. What this does NOT test (required)

- Not the full dealer book: CME monthly/quarterly options only (~5% of Nasdaq dealer gamma; no 0DTE, no SPX/SPY/QQQ).
  A null on P2/P3 does not refute Baltussen's mechanism, which used the whole index-option market.
- Not causation (hedging vs LETF rebalancing vs MOC flow); the clock and the gamma split only.
- Not a stop/target system: the trade is a fixed 30-minute hold, no stops, one size; no leverage or compounding.
- Not the 1-3 day reversal as a trade (descriptive only).
- Not live cost at the owner's MT5 broker: CFD costs are OANDA practice bid/ask, futures a tick a side + commission.
- The level arm does not test a level's own property beyond the shifted-level placebo; it does not test walls by DTE
  or local gamma (other in-flight studies).
- Nothing after 2026-08-21.

## 8. What each verdict changes (required)

- **Pass (P1/P4):** the desk can say "the move into 15:30 ET tends to carry into the cash close on NQ/ES" with the slope;
  any close-window wording on Today / the brief cites this id. Promotion to a bot needs |t| ≥ 3 and a VALIDATED trade cell.
- **Pass (P2/P3):** the gamma map earns a direction-adjacent sentence for the close window only ("short gamma: the day's
  move tends to carry into the close"), never a fade, never outside the window.
- **Pass (P5/P6):** a forward paper record of the close-window trade (own prereg), not live money.
- **Null:** pages must not claim late-day momentum on these instruments; the library's strongest direction evidence
  does not hold here.
- **Underpowered (levels):** the owner's level question needs more late arrivals (all rungs of all families, or
  a longer archive) or the Cboe book; the point estimates decide whether that is worth building.

## Amendments

(none)

## RESULTS

See `analysis/output/close-window-momentum/RESULTS.md` (written after the run; nothing above changes).
