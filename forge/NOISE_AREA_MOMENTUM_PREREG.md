# noise-area-momentum — does the "Beat the Market" noise-band intraday momentum strategy (Zarattini, Aziz & Barbon 2024) pay on US index futures after our costs, beyond what a path with no intraday ordering pays?

**Pre-registered 2026-11-13, before any outcome was computed.** Only file schemas and date coverage were read
(ES/NQ/YM/RTY NT8 1-minute files: columns, first/last timestamp). No band, signal, position or return has been computed.

| | |
|---|---|
| ID / ledger ids | `noise-area-momentum` (P1: ES and NQ, the paper's stop, 1x), `noise-area-momentum-book` (P2: four-index book, vol-targeted, the paper's headline), `noise-area-momentum-stop` (P3: does the current-band + VWAP stop beat the opposite-band stop) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `noise-area-momentum` |
| Data | NT8 continuous 1-minute futures, ratio-adjusted, `analysis/output/nt8/continuous/{ES,NQ,YM,RTY}_1m_ratio.parquet` (end-stamped: a bar labelled T covers T−1min → T, faults-log 2026-11-07), unadjusted twin `*_1m_unadj.parquet` for converting point costs to return. Primary ES, NQ; secondary YM, RTY (RTY starts 2017-07). Cash session only, 09:30–16:00 America/New_York (DST-aware). Window: first day with 14 prior sessions (Jan 2016; RTY Aug 2017) → **2026-08-21** (lockbox). |
| Seed | `20261113` (every script) |
| Uncertainty | ISO-week-clustered bootstrap of daily returns, B = 2,000, for Sharpe and mean; within-day permutation null, 200 draws (ES, NQ), 100 (YM, RTY) |
| Scripts / outputs | `scripts/noise-area-momentum/` → `analysis/output/noise-area-momentum/`; page `noise-area-momentum.html` |
| Harness | own Python script: minute-level path simulation with clock anchors in New York time; the JS harness has no intraday clock-anchored simulator |

## 1. The claim (required)

**Zarattini, Aziz & Barbon (2024, rev. 2025), "Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF
(SPY)", SFI Research Paper 24-97.** SPY 1-minute data, May 2007 → April 2024 (updated to Aug 2025 in their FAQ Q24):

- **Noise area.** For each minute HH:MM, σ_HH:MM = mean over the previous 14 days of |Close_HH:MM / Open_9:30 − 1|.
  Upper = max(Open_9:30, prior Close_16:00)·(1 + σ), Lower = min(Open_9:30, prior Close_16:00)·(1 − σ).
- **Decisions** only at HH:00 and HH:30 (first at 10:00). Long if price is above the upper band, short if below the
  lower band. All positions flat at 16:00.
- **Stops.** Base: opposite band (reverse when crossed). Improved: trailing stop = max(upper band, VWAP) for longs,
  min(lower band, VWAP) for shorts, checked at the same half-hours. VWAP is cash-session only.
- **Sizing.** 1x notional, or vol-targeted: leverage = min(4, 0.02 / σ_daily), σ_daily = sample stdev of the last 14
  daily close-to-close returns.
- **Results (net of $0.0035 + $0.001 per share):** opposite-band 1x Sharpe 0.61 (178%); band+VWAP 1x Sharpe 1.24 (380%,
  hit 43%, skew +1.29); band+VWAP vol-targeted Sharpe 1.33, 19.6% a year, MDD 25%; 7,668 trades (1.8/day), avg
  +$0.09/share. FAQ: S&P 500 futures Sharpe 1.32, Nasdaq 1.23, Russell 0.45; lookback 90d Sharpe 1.50; VM 1.5 Sharpe 1.55;
  VWAP-only stop Sharpe 1.17; losing years 2016 (−12.8%) and 2017 (−6.9%); 2025 to Aug +1.0%.

**Edge source (method lesson 4).** Skill: under-reaction / slow-moving capital and short-gamma dealer hedging make a
move that leaves the day's normal range continue. The other side is liquidity providers and mean-reverting flow. A risk
premium reading (selling intraday reversal insurance) is also possible; the payoff is positive-skew, so it is not short
optionality.

**Claim tested.** On ES and NQ futures, cash session, 2016 → 2026-08-21, the paper's band + VWAP rules at 1x earn a
positive net Sharpe that a path with the same day's minute returns in random order does not earn.

## 2. Why it is not already settled (required)

Searched `js/deskEvidence.js`, `plans/RESEARCH_REGISTER.md`, `forge/`, `plans/`, `MD files/`, git log for concretum,
zarattini, noise area, intraday momentum. **No study has run the noise-band strategy.** Nearest entries:

- `close-window-momentum` (NULL, 2026-11-11): the prior-close → 15:30 move does not predict 15:30 → 16:00 on NQ/ES
  (slope −0.001 / +0.002 vs bar 0.025); first half hour also null. That is the Gao/Baltussen *regression*. This paper's
  claim is different: an all-day breakout entered at the first half-hour beyond the band, held under a trailing stop,
  whose payoff is skew (hit 43%) rather than a linear slope. A null slope does not rule out a positive-skew stop rule.
- `close-window-momentum-gamma` (UNDERPOWERED): CME gamma sign does not switch on continuation. Not used here.
- Vol-Layer stage 3 views (0 of 993 momentum cells vs a random-walk-rebuilt null; overlapping momentum IC biased ≈ −0.20
  on pure random walks). Daily/multi-day horizons; it is why this study's null is a rebuilt path, not zero.
- `day-reconstruction` M3: NQ continuation after ±0.25σ +0.05 to +0.07R gross, equal at phantom lines (generic
  momentum). Different entry (forecast ladder touches), London clock, no stop rule.
- `vwap-stretch-line-touch` (underpowered), `vwap-extension` phase 2 (3–8× under cost): VWAP as a fade input, not a stop.
- `direction-baseline-audit` (exploratory NULL), `paper-replications` (MOP TSMOM null): daily-and-longer momentum.
- `trend-following` memory: FX daily trend null. Different horizon.

## 3. Definitions, fixed in advance (required)

**Bars.** NT8 end-stamped bars; labels moved back one minute so a bar is keyed by its start. Cash session = bars
starting 09:30 … 15:59 New York (390). Minute index m = 1 … 390, m = minutes from 09:30 to the bar's end. Missing
bars inside the session: close forward-filled, volume 0. A day is used if the 09:30 bar exists and at least 200 cash bars
exist (keeps half-days, which end at their last bar ≈ 13:00 and are closed there).

- **Open_d** = open of the 09:30 bar. **PrevClose_d** = close of the last cash bar of the previous used day.
- **move_{d,m}** = |Close_{d,m} / Open_d − 1|. **σ_{d,m}** = mean of move_{d−i,m} over the previous 14 used days that have
  minute m (needs all 14, else no trade that day at m).
- **Bands** UB = max(Open, PrevClose)·(1 + VM·σ), LB = min(Open, PrevClose)·(1 − VM·σ), VM = 1.
- **VWAP_{d,m}** = Σ typical·vol / Σ vol over cash bars ≤ m, typical = (H+L+C)/3. If cumulative volume is 0, VWAP = close.
- **Check minutes** m ∈ {30, 60, …, 360} (bars ending 10:00 … 15:30). The decision uses the close of the bar ending at
  that time; the new position earns from that close onward (the paper's code: exposure shifted one bar). Exit: the last
  cash bar's close (16:00, or the half-day end).
- **Position rules per variant** at a check minute (C = close, s = current position):
  - **V1 opposite band** (paper Table 1): if C > UB → +1; if C < LB → −1; else keep s.
  - **V2 current band + VWAP** (paper Table 2, P1): +1 if C > UB and C > VWAP; −1 if C < LB and C < VWAP; else 0. (Equal
    to entering beyond the band and trailing max(UB, VWAP), checked at half-hours.)
  - **V3** = V2 with vol-target sizing (paper Table 3, P2).
  - **V4 VWAP-only stop** (FAQ Q22), vol-targeted: flat → enter as V2; long stays long while C > VWAP (else 0, or −1 if
    the short entry holds); mirror for short.
  - **V5 band-only stop**, 1x: +1 if C > UB, −1 if C < LB, else 0.
  - **V6** = V3 with lookback 90 (FAQ Q6 best). **V7** = V3 with VM 1.5 (§4.4 best). (Described only.)
- **Daily return.** Shares are fixed for the day at AUM·L / Open (L = 1, or min(4, 0.02/σ_daily)). Gross return
  r_d = L · Σ_m s_{m−1}·(C_m − C_{m−1}) / Open_d. **Costs:** each unit of |Δs| (entry, exit, a reversal = 2) costs half a
  round trip: futures 1 tick each side + $4.50 per round trip (ES 0.59 pt, NQ 0.725 pt, YM 2.9 pt, RTY 0.29 pt; the
  repo's cost-verification rule), converted to return on the **unadjusted** open of that day, times L. Fractional
  contracts (no rounding); stated as a limitation.
- **σ_daily** = stdev (ddof 1) of the last 14 cash close-to-close returns ending the day before.
- **Equity** compounds from $100,000. **Benchmark:** buy-and-hold the same future (cash close-to-close, 1x).
- **Trade** = a run of consecutive bars with the same non-zero position.

**Null (THE MIRROR).** Within-day permutation: for every day, the 390 one-minute log returns (with each bar's volume
and its high/low offsets) are shuffled; Open and the day's close are kept, so the gap, daily range scale, daily return and
the 14-day σ inputs keep their distribution but any intraday ordering (trend, reversal, clock seasonality) is destroyed.
The whole history is permuted, then bands, VWAP, σ_daily and the strategy are rebuilt. Same costs. Draws: 200 (ES, NQ),
100 (YM, RTY), seed 20261113 + draw.

**Positive control (method lesson 1).** Before the real run, on synthetic minute paths with ES's per-minute vol:
(a) a pure Gaussian random walk must give gross mean daily return within 2 SE of zero for V2 (a stopping rule on a
martingale earns nothing; known answer from outside the pipeline: optional stopping); (b) the same walk with a planted
day drift μ_d ~ N(0, 0.5·σ_day) spread evenly over the day must give a clearly positive gross V2 Sharpe (> 1). Failing
either stops the run until the code is fixed.

**Mechanics check (data-rules item 10, owner rule "audit mechanics first").** ES V3 monthly returns vs the paper's
published SPY monthly table (FAQ Q24), 2016-01 → 2025-08 (116 months). Correlation must be ≥ 0.5 for the build to be
called faithful. SPY ≠ ES (the future trades the 09:30 open as a mid-session price, costs differ), so exact equality is
not expected. Below 0.5: audit before any verdict; if no bug is found, report it and judge anyway.

## 4. Hypotheses (required)

**THE GATE — P1 `noise-area-momentum`** (ES and NQ separately, V2, 1x, net):
- **VALIDATED** if for **both** ES and NQ: annualised net Sharpe above the 97.5th percentile of its permutation null
  (Bonferroni over 2), week-bootstrap 95% CI of the mean daily net return above 0, and net Sharpe > 0 in both halves
  (split at the median day).
- **NULL** if for both the bootstrap 95% upper bound of net Sharpe is below **0.62** (half the paper's 1x Sharpe of 1.24).
- **UNDERPOWERED** otherwise (including one instrument passing and the other not).

**P2 `noise-area-momentum-book`** (V3 on ES, NQ, YM, RTY, equal-weight average of daily returns, net): VALIDATED if
the book's net Sharpe beats the 97.5th pct of the book built from the same permutation draws (draw k of each), its CI
lower bound > 0, and both halves > 0; NULL if the upper bound < 0.66 (half the paper's 1.33); else UNDERPOWERED.

**P3 `noise-area-momentum-stop`** (V2 − V1 daily net return, ES and NQ pooled per day as their mean, 1x): VALIDATED if
the week-bootstrap 95% CI of the mean difference is above 0 and the difference in Sharpe-units is > 0 in both halves;
NULL if the CI's upper bound < half the paper's gap in mean daily return (paper 9.7% vs 6.2% a year → bar 1.75%/yr /2 =
0.875%/yr = 0.35 bp/day); else UNDERPOWERED.

**Described only (no verdict):** V4–V7, gross vs net, long vs short leg, year-by-year and monthly table, time-of-day
P&L, VIX-free vol-regime split (σ_daily terciles), the paper's sensitivity claims, and the mechanics correlation.

**Decomposition if P1 is NULL/UNDERPOWERED (owner rule 2026-10-27).** Components, each against the permutation null,
both halves, BH q = 0.10 over the 2 instruments × 3 parts: (a) entry: mean gross 1x return from first entry to the next
check (30 min) per entry, sign-adjusted; (b) hold: gross return from entry to the 16:00 close (no stop); (c) stop value:
V2 − (b). A part beating both nulls in both halves is listed in `plans/MISC_STUDIES.md` as a reusable candidate, not a
result.

## 5. Power (required)

~2,650 days per instrument (10.6 years). SE of an annualised Sharpe ≈ √((1 + SR²/2)/years) ≈ 0.33 at SR 0.6. MDE at 80%
power, two-sided 5% ≈ 2.8 × 0.33 ≈ **0.92 Sharpe**. The paper's 1x claim (1.24) is above the MDE, so the paper's effect
is detectable per instrument; an effect half its size (0.62) is not, which is why NULL is defined by the CI upper bound
falling below 0.62 rather than by the point estimate. Book (4 correlated indices, assumed effective ≈ 2): SE ≈ 0.25,
MDE ≈ 0.7.

## 6. Multiplicity (required)

Three scored questions (P1, P2, P3), each with its own bar. P1 uses Bonferroni 97.5th pct across its 2 instruments and
needs both. Variants V4–V7, legs and splits are described only. The decomposition uses BH q 0.10 over its 6 cells.
Logged trials: 3 scored + 7 described variants.

## 7. What it does NOT test (required)

- SPY itself (no SPY 1-minute data held); ES/NQ cash session is the proxy.
- Execution at the decision bar's close is assumed (no latency); cost includes 1 tick each side, ≥ the paper's slippage.
- Fractional contracts; margin, financing and overnight are irrelevant (flat every day) except that 4x leverage on futures
  needs margin the paper's broker gives.
- Non-US futures, commodities (paper FAQ Q13) and single stocks (Q12): a later breadth prereg.
- The gamma (RSI) and daily-pattern (NR4/NR7) conditioners in §4.2/§4.5: later, only if P1 is not NULL.
- Anything after 2026-08-21.

## 8. What each verdict changes (required)

- **VALIDATED:** the first intraday direction rule in the book with evidence; next = frozen paper record from the next
  session on ES/NQ (NT8 bridge) and a breadth prereg on the other futures.
- **NULL:** the paper's published edge does not hold on futures 2016–26 after our costs; the page stays as a record;
  no paper/forward record. Decomposition says which part (entry, hold, stop) is alive.
- **UNDERPOWERED:** effect not ruled out; next = pooled four-index prereg or forward record without money.

## Amendments

### A1 — 2026-11-13 — PRE-RESULTS
Building the day matrices (no band, signal or return computed) found two data problems:
1. **NT8 holes.** The continuous and per-contract NT8 files miss ~6-week runs inside contracts (2018 ×2, 2024 ×3,
   2025 ×4, 2026 ×1; DATA_SPEC #24), about 10% of days and ~40% of 2024-25. Those days are **filled with the OANDA CFD
   cash-session minutes** (`data/m1_bidask/{spx,nq,dow,us2000}_m1.parquet`, open-stamped mid, tick volume), scaled to
   the futures level by the futures/CFD close ratio on the most recent day both exist. At a CFD → futures switch the
   previous close is the CFD close times today's futures/CFD open ratio (no basis jump). Costs stay the futures costs.
   On overlap days (H1 2023) the CFD's 1-minute returns correlate 0.986 (ES) / 0.998 (NQ) with the futures, open-to-close
   differs by ~2.5 bp; tick volume correlates only 0.43 / 0.66 with contract volume, so VWAP on filled days is a proxy.
   Days flagged `src`. **Added sensitivity (described):** all stats on futures-only days.
2. **Holiday Globex sessions.** CME trades to 13:00 ET on US exchange holidays; those days (last bar ending 13:00) are
   dropped as the cash market is shut. True half-days (13:15 futures close) stay and are closed at their last bar.
3. **σ_daily** uses the same-source previous close and needs 13 of the 14 returns (one gap after a long holiday break);
   a day whose previous used day is more than 5 calendar days back has no previous close (no gap widening, no σ return).
Result: ES/NQ/YM 2,684 days 2015-12-14 → 2026-08-21, RTY 2,293 from 2017-07-10; remaining missing business days are the
exchange holidays (~9-10 a year). No outcome had been computed.

## RESULTS

Run 2026-11-13: `analysis/output/noise-area-momentum/RESULTS.md`. P1 UNDERPOWERED (NQ passes: net Sharpe 1.23
[0.78, 1.69]; ES misses: 0.47 [-0.04, 0.98]); P2 UNDERPOWERED (book 0.39 [-0.19, 0.89]); P3 UNDERPOWERED (V2 - V1
-0.23 bp/day [-1.45, +0.99]). Mechanics check rho 0.94. Page: `noise-area-momentum.html`.
