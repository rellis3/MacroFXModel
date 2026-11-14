# post-release-drift-pooled — After a tier-1 US release, does price keep moving in the surprise direction after the first jump, pooled across gold, EURUSD, GBPUSD, USDJPY and NQ?

**Pre-registered 2026-11-14, before any outcome was computed.**

Only signal-side data (calendar values, the US 2y CFD move inside the release window) and control-sample statistics
on non-release days (the §5 SDs) were read before this file was written. No price after an event's +15 min entry
was read for any event in the sample.

| | |
|---|---|
| ID / ledger id | `post-release-drift-pooled` (primary: surprise-sign signal); `post-release-momentum-pooled` (variant: sign of the instrument's own first 15-minute move). Two scored questions, two ledger ids |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `post-release-drift-pooled` (CLAIMED 2026-11-14; moves to REGISTERED when this file is committed and pushed on its own) |
| Data | **Events:** CPI, NFP, FOMC 2010-01 → 2026-08-21; PPI 2014-01 → 2026-08-21 (§3.1). **Prices:** OANDA M1 mid, `eurusd`, `gbpusd`, `usdjpy`, `gold` (`VolRangeForecaster/data/m1/{key}_m1.parquet`) and NAS100 CFD as NQ (§3.6). **2y:** OANDA M15 `USB02Y_USD` CFD (`analysis/output/rate-surprise-events/m15/USB02Y_USD.parquet`). **Costs:** `data/m1_bidask/{key}_m1.parquet` (2016-10 →). Window end **2026-08-21** (lockbox), every horizon end included |
| Seed | `20261114` (one for every script in this study) |
| Uncertainty | Event sign-flip randomisation (20,000 draws) for the primary p; event-cluster bootstrap (B = 2000, clusters = events whose windows overlap, §3.9) for intervals; month-block bootstrap as a sensitivity; same-clock placebo distribution (2,000 replicates) |
| Scripts / outputs | `scripts/post-release-drift-pooled/` → `analysis/output/post-release-drift-pooled/` |
| Harness | own scripts (Python, plus one Node step for σ). `js/harness/runStudy.mjs` has no event mode; `analysis/study.mjs` does not handle intraday event clocks |

## 1. The claim (required)

**Source.** Daily-bias agenda card Q2 (`.claude/skills/research-director/agendas/daily-bias.md`), from Max Cole
(Colez Trades, `education/intake/informational/colez-trades/2026-11-13-max-cole-daily-lives-bias.md`): stay flat before
tier-1 US data, then "trade the direction of the surprise afterwards", entering after the first jump. Max's scored copy
(+8.3R over 122 fills) drew its gains from a few swings and post-data days. This study asks whether that is a property
of the market or of his entries.

**The question.** After a scheduled US CPI, NFP, PPI or FOMC release, if you enter at release + 15 min in the
direction a USD-positive (hawkish or strong) surprise implies, does price keep moving that way at +1h, to 21:00 UK, to
the next 07:00 UK, or to 21:00 UK three trading days later?

**Edge source (method lesson #4).** The edge would be **underreaction**: slow real-money rebalancing (reserve managers,
asset allocators, option hedgers rolling deltas) that follows information the fast first move has only partly priced.
On the other side are the liquidity providers and fast traders who set the first jump and fade the follow-through.
It is not a risk premium: the trade carries no systematic exposure across events. The prior is against it: Andersen,
Bollerslev, Diebold and Vega (2003) find the FX jump mostly immediate, and our own `rate-surprise-events` found the
whole EURUSD response in the first 15 minutes.

## 2. Why it is not already settled (required)

**Builds on `rate-surprise-events`** (`forge/RATE_SURPRISE_EVENTS_PREREG.md`, `analysis/output/rate-surprise-events/RESULTS.md`;
ledger `rate-surprise-eurusd` and `rate-surprise-nq`, both **UNDERPOWERED**). Exactly what differs:

| | `rate-surprise-events` (2026-10-21) | this study |
|---|---|---|
| Instruments | EURUSD, NAS100, **each scored alone** | gold, EURUSD, GBPUSD, USDJPY, NQ **pooled into one event-level outcome** (§3.7). The new element is power |
| Families | FOMC, core CPI, NFP (526 events) | adds **PPI** (2014 →); ≈ 600 signal events |
| Entry | t + W + 15 min (CPI/NFP +30 min, FOMC +75 min), M15 grid | **t + 15 min for every family** (Max's "after the jump"), M1 |
| Statistic | correlation of the signal with the **walk-forward residual of y on the asset's own window reaction** (information *beyond* the jump) | **raw signed return of the trade**, no residualisation. The asset's own jump becomes the second signal (momentum variant), not a control |
| Signal for data families | standardised data surprise (continuous) | **sign** of the standardised surprise (what is traded); size only as a tercile condition |
| FOMC signal | 2y move over 60 min | 2y move over the **first 15 min** (the window that ends at entry) |
| NQ direction | sign of the trailing 60-day NQ–2y correlation | **fixed**: rates-up = NQ-down (§3.3); the regime-signed version is descriptive only |
| Outcome | log return ÷ (σ15 × √bars) | log return ÷ point-in-time **daily HAR σ**; plus **R at a fixed 0.5σ stop**, MAE/MFE from the M1 path |
| Horizons | 1h, 16:00 ET, next 16:00 ET, +5 days | +1h, 21:00 UK, next 07:00 UK, +3 trading days 21:00 UK |
| Noise threshold | within-family permutation | event-level sign flips, a same-clock **placebo on non-release days**, event-cluster bootstrap |

**This is not a re-run of a banked null.** The four NULL cells in that study (EURUSD data surprise at 1h, close and
next day; NAS100 data surprise at 1h) are nulls of *information beyond the asset's own reaction*, per asset. Here
EURUSD and NQ appear only inside the pooled event outcome, and as BH-reported slices that cannot overturn the banked
cells. The Nasdaq 5-day fade from that study (exploratory, +0.25σ net) is not re-scored: it has its own forward-record
proposal. Our h4 NQ slice is reported but cannot promote it.

**Other neighbours, and why none answers this:**

- `post-fomc-usd-drift` (validated; flagged **FRAGILE** in the 2026-10-31 code audit, `forge/DIRECTION_BAR_PREREG.md`):
  the dollar drifts up for 5 days after *any* FOMC, whatever the surprise. That is an unconditional drift. Here the
  sign of the surprise is the signal, and an intercept per instrument × family removes that drift (gate condition 6).
- `fed-two-moves` (context): the first FOMC move is partly unwound later, the same rate as matched non-FOMC days. Read
  with our FOMC slice; that study had no surprise sign.
- `fomc-leadup-surprise-table` (context): hawkish meetings saw the dollar up 64% five sessions later (n small, a
  margin table). Not a test.
- `news-asymmetry` (null): bad vs good surprise size of the first 30 minutes. We do not test asymmetry.
- `priced-in-direction` (null): the pre-event yield state. We do not condition on it.
- `surprise-size` (validated): surprise size widens the range. That is volatility. Here size is only a condition on direction.
- `positioning-into-release-direction` (validated, small): price drifts against a crowded leveraged book on release
  days. A different signal (positioning, not the surprise). Not used here (§7).
- `cb-tone-direction` (null): first 30-minute FOMC reaction → next-day dollar sign, n = 82. Our momentum variant
  overlaps it for the FOMC slice only. The pooled cross-family, cross-asset momentum question is new.

## 3. Definitions, fixed in advance (required)

### 3.1 Event table and coverage

Built by `scripts/post-release-drift-pooled/01_events.py` → `analysis/output/post-release-drift-pooled/events.parquet`
plus `DATA_AUDIT.md`. Only scheduled releases are included. Unscheduled FOMC actions (e.g. 2020-03-03, 2020-03-15) are
excluded. Release time t is in UTC.

| Family | Years | Source of actual / consensus / time | Signal field | Events | With a non-zero signal (expected, from the signal-side count) |
|---|---|---|---|---|---|
| CPI | 2010-01 → 2026-08 | 2010–17: ForexFactory values carried in `analysis/output/rate-surprise-events/events.parquet` (core CPI m/m, from `data/calendar/ff_calendar_2007_2025.csv`, clock from the published 08:30 ET schedule). 2018-01 → 2026-07-02: `calendar_events.csv` (`Core Inflation Rate Month-over-Month`, tie-break `Inflation Rate Month-over-Month`). 2026-07-03 → 2026-08-21: `calendar_events_nasdaq.csv` (`Core CPI`, tie-break `CPI`; the m/m row is told from the y/y row by value scale, per `references/sources.md`) | core CPI m/m surprise; if exactly in line, headline m/m surprise (2018 → only: headline consensus is empty in `calendar_events.csv` 2014–17 and not carried for 2010–17) | 198 | ≈ 140 (≈ 120 from core alone 2010–26-06 + headline tie-breaks 2018 →) |
| NFP | 2010-01 → 2026-08 | 2010–17 ff (as above; `calendar_events.csv` has no NFP consensus 2014–17); 2018 → 2026-07-02 `calendar_events.csv` (`Payroll Jobs Growth`); 2026-08-07 `calendar_events_nasdaq.csv` (`Nonfarm Payrolls`) | headline payrolls surprise | 200 | ≈ 196 |
| PPI | **2014-01** → 2026-08 | `calendar_events.csv` (`Producer Price Index Month-over-Month`, tie-break `Core Producer Price Index Month-over-Month` 2018 →); `calendar_events_nasdaq.csv` (`PPI`, `Core PPI`) after the seam. **2010–13 restricted out**: the ff file is not in this checkout and the carried event table has no PPI | headline PPI m/m surprise; tie-break core PPI m/m | 151 | ≈ 139 (18 in line before the tie-break) |
| FOMC | 2010-01 → 2026-07-29 | dates and statement times as in `rate-surprise-events` (14:00 ET from 2013; 14:15 ET 2010–12; 12:30 ET at the 2011–12 press-conference meetings); 2026-07-29 from `calendar_events_nasdaq.csv` | **market surprise**: the 2y CFD move over [t, t+15] (§3.2). The data surprise is used for nothing: the decision differed from consensus at 2 of 131 meetings | 132 | ≈ 123 (2y CFD present and moved in 122 of 131 to 2026-06) |
| **Total** | | | | **≈ 681** | **≈ 600** |

Counts are rows in the event table, and the "expected" column was counted from signal fields only. The 2025 rows hold
10 CPI and 10 PPI releases (two months missing in the source). They are not imputed. Exact counts go in `DATA_AUDIT.md`.

**Point-in-time quality, stated:** consensus is one vendor's final pre-release median (ForexFactory 2010–17, the
`calendar_events.csv` vendor 2018 → 2026-07-02, Nasdaq after). It cannot be proven point-in-time. The actual is the
release-day value as captured (first print), not the revised series. `01_events.py` writes a spot-check of 20 events
(5 per family, spread over years) against first prints from the BLS/Fed archives into `DATA_AUDIT.md`. Over 2 mismatches
in 20 means the family is flagged, and the flag is reported next to its slice. `calendar_events.csv` is read through
`load_calendar()` (`scripts/calendar/fetch_nasdaq_calendar.py`), which drops its ~46k duplicate rows (fault #11).
Names are never matched across the 2026-07-02 seam: an explicit name map per source is in `01_events.py`.

**Timestamp check (repeated from `rate-surprise-events`):** the mean |2y CFD 15-min move| must peak in the bar starting
at t for every family × era (2010–17, 2018–26). A family × era that fails is dropped and reported.

### 3.2 Surprises (all known at t + 15 min)

- **Data surprise (CPI, NFP, PPI).**
  - Raw: `x_e = actual − consensus` of the signal field.
  - Standardised: `z_e = x_e / sd(x of the same family and field over all prior events)`, needing ≥ 12 prior events.
    It is point-in-time (expanding, previous events only).
  - Sign: `sgn(x_e)`. It needs no standardisation, so the first 12 events of a family still carry a sign. They get no
    tercile.
  - **USD-positive = actual above consensus** for all three (hotter inflation, stronger payrolls → hawkish → USD up).
- **Market surprise (2y).**
  - `r2_e = −ln(P2y(t+15) / P2y(t))`, where `P2y(t)` is the close of the OANDA M15 `USB02Y_USD` bar stamped t − 15
    (bars are start-stamped) and `P2y(t+15)` is the close of the bar stamped t.
  - The CFD price falls when the yield rises, so r2 > 0 means yields up = USD-positive.
  - Standardised: `z2_e = r2_e / sd(15-min 2y log changes over the 28 calendar days before t)`.
  - If the CFD price is unchanged or missing over the window, r2 is missing and the event has no market signal.
  - Intraday 2y exists only as this M15 CFD (2009-11 → 2026-08-21, local). M1 `USB02Y_USD` is not cached. The M15 grid
    matches the 15-minute window exactly, so M15 is enough here.
- **Event signal `s_e ∈ {−1, 0, +1}`:** `sgn(x_e)` for CPI/NFP/PPI, `sgn(r2_e)` for FOMC.
  - `s_e = 0` events are in the "in-line" set. They are excluded from the scored cells; their unsigned outcomes are
    reported as a descriptive control.

### 3.3 Instrument direction (fixed, no fitting)

The trade direction on instrument i is `D_{e,i} = s_e · d_i`, with d_i the instrument's response to a USD-positive
surprise:

| Instrument | Key | d_i | Why |
|---|---|---|---|
| Gold | `gold` (XAU_USD) | −1 | USD up and real yields up → gold down |
| EURUSD | `eurusd` | −1 | USD up |
| GBPUSD | `gbpusd` | −1 | USD up |
| USDJPY | `usdjpy` | +1 | USD up, US yields up |
| NQ | NAS100 CFD | **−1** | rates up → NQ down (pre-specified). The regime-signed version (trailing 60-session NQ–2y correlation sign, as in `rate-surprise-events`) is descriptive only |

### 3.4 Entry and the first move

- Entry price `P_i(t+15)` = the open of the M1 bar stamped t + 15:00 (OANDA M1 is start-stamped). Sensitivity: the
  open of t + 16:00 (bar convention, stats-defaults 2026-10-14) and of t + 30:00.
- **FOMC:** the +15 entry (14:15 ET) comes before the press conference (14:30 ET, every meeting from 2019 and 4 a
  year 2011–18). That is Max's timing, and the primary. Sensitivity (descriptive): FOMC entry at t + 60.
- **First move (momentum variant):** `m_{e,i} = ln(P_i(t+15) / P_i(t))`, where `P_i(t)` is the open of the M1 bar
  stamped t. The momentum direction is `D^m_{e,i} = sgn(m_{e,i})`. A zero move means no trade.

### 3.5 Horizons

All ends are at or before 2026-08-21 21:00 Europe/London. The exit price is the close of the last M1 bar starting
before the end time. If no bar exists in the 5 minutes before the end, the row is missing and counted.

| | End |
|---|---|
| h1 | entry + 60 min |
| h2 | 21:00 Europe/London on the release's London date (FOMC: entry 19:15 or 18:15 UK, so h2 ≈ 1h45 later) |
| h3 | 07:00 Europe/London on the next London weekday (a Friday NFP runs to Monday 07:00) |
| h4 | 21:00 Europe/London on the third London weekday after the release date |

**Contamination rule:** at h1–h3, a row is censored (missing, counted) when another tier-1 event from the table is
released between entry and the end, e.g. CPI and FOMC on the same day (2024-06-12). h4 keeps such rows: CPI and PPI
usually fall in one week. The overlap goes into the bootstrap clusters (§3.9), and h4 is also reported with them
censored.

### 3.6 Prices, σ, outcomes

- **Bars.** OANDA M1 mid from `VolRangeForecaster/data/m1/{eurusd,gbpusd,usdjpy,gold}_m1.parquet`, pulled read-only
  with `python scripts/r2_download.py eurusd gbpusd usdjpy gold` (absent in this cloud checkout). NQ uses NAS100 M1
  from `portfolioBacktest/cache/` if present, else the mid of `data/m1_bidask/nq_m1.parquet` (2016-10 →). For NQ rows
  before M1 exists, the local OANDA M15 `analysis/output/rate-surprise-events/m15/NAS100_USD.parquet` is used. Its
  entry and all four ends sit on the M15 grid, so the σ outcome is exact. Those rows are flagged, and their
  stop/MAE/MFE use 15-min closes. Never fetch with `--price BAM` for the research cache.
- **Loading.**
  - Every frame is cut at `time < 2026-08-22 00:00 UTC`. Rows are then kept only when their London date is
    ≤ 2026-08-21.
  - Timestamps are checked to be after 2009 (the BAM-1970 fault).
  - Each instrument is joined to the event table **by timestamp, never by row position**, and every lookup asserts
    that the bar found is the requested minute (stats-defaults 2026-10-24).
  - `node scripts/data_integrity.mjs` is run first and its stale list is quoted in RESULTS.
- **σ (point-in-time, `data-rules` item 2).**
  - `σ_{i,d}` = HAR-800: `forecastSigma(last 800 NY-close bars, 'har_rv_log')` (`js/forecastSigma.js`) on
    `nyCloseDailyBars(packed)` (exported from `js/voteAtlasV4Lines.js`) built from the same M1, bars with n ≥ 60 minutes.
  - It uses only bars closed by the 17:00 New York close **before** the release day's session.
  - Written by `scripts/post-release-drift-pooled/02_sigma.mjs` → `sigma.parquet` (instrument, London date, σ as a
    fraction of price).
  - **Second proxy spec (method lesson #10):** `σ60` = RMS of the previous 60 NY-close log returns. Every scored cell
    is re-reported on σ60.
- **Outcome in σ:** `y_{e,i,h} = D_{e,i} · ln(P_i(end_h) / P_i(t+15)) / σ_{i,d}`, in daily-σ units for every horizon.
  The momentum variant uses `D^m` in place of D.
- **Event-level outcome:** `ȳ_{e,h}` = the mean of `y_{e,i,h}` over the instruments available for that event (equal
  weight per instrument). **Primary statistic:** `M_h = (1/E_h) Σ_e ȳ_{e,h}` over the E_h events with s_e ≠ 0 and at
  least 3 of 5 instruments present.
- **Trading view (R).**
  - Stop at `0.5 σ_{i,d} · P_i(t+15)` against D. Exit at the stop or at end_h, whichever comes first, checked on M1
    high/low. If the stop and the end fall in the same bar, the stop counts.
  - `R = D · (P_exit − P_entry) / (0.5 σ P_entry)`; gross and net.
  - Net = minus the full bid/ask spread at the entry and exit minutes from `data/m1_bidask/{key}_m1.parquet`
    (2016-10 →). Before that, 1.5 × the instrument × family median entry spread of 2016-10 → 2026-08.
  - MAE and MFE in σ from the M1 path between entry and exit.
  - Expectancy is decomposed into P(win), E[win] and E[loss] (method lesson #20). Unresolved rows are counted, never
    dropped silently.

### 3.7 Conditions (descriptive, BH)

- **Surprise size tercile.** |z_e| (|z2_e| for FOMC) against point-in-time cut points: the 1/3 and 2/3 quantiles of
  |z| over the family's prior events, needing ≥ 24. Events without enough history get no tercile. Read as a ladder,
  checking it is monotone (method lesson #25).
- **Agreement of data and market surprise** (CPI/NFP/PPI only): `A_e = 1` if `sgn(x_e) = sgn(r2_e)`, 0 if they
  differ, missing if r2 is missing. Expected coverage: NFP ≈ 182 events with both, CPI ≈ 102 (the 2y CFD is often
  unchanged in 2010–17 CPI windows), PPI to be counted in `DATA_AUDIT.md`.
- Family (4), instrument (5), halves, FOMC entry +60, regime-signed NQ, h4 with contaminated rows censored.

### 3.8 Controls, benchmarks, mirror

- **B0 drift.** The unsigned same-clock return of each instrument (direction d_i) on placebo days, and on event days,
  regardless of sign. It is reported, and it is the reason for gate condition 6.
- **Drift-adjusted estimate.** `β_h` from `v_{e,i,h} = α_{i,f} + β_h · s_e + ε`, where
  `v = d_i · ln(P(end)/P(entry)) / σ`, with one intercept per instrument × family. It removes unconditional
  post-release drift (e.g. `post-fomc-usd-drift`) and any imbalance in the surprise signs.
- **Same-clock placebo** (`03_placebo_power.py`).
  - **Candidate days.** For each event, the placebo days are London weekdays within ±40 trading days of the release
    date, excluding any tier-1 release day in the table and the event's own ±3 trading days.
  - **Neighbourhood.** Only that neighbourhood is excluded, not every event (stats-defaults 2026-10-14: quiet-only
    controls bias the placebo).
  - **Clock and outcome.** The same New York clock time as the release, entry at +15, the same horizons and σ. The
    event's s_e and d_i are imposed.
  - **Replicates.** Each of 2,000 replicates draws one placebo day per event and computes `M_h^plc` with the event
    weights.
  - **Reading.** The real M_h is read as its percentile in that distribution, never against a single shifted draw
    (stats-defaults 2026-10-21, 2026-11-07).
  - **Design check.** The placebo mean must be within ±0.5 × bar of zero; otherwise the design is flagged biased
    before any reading.
- **Random sign within event.**
  - Draw ε_e ∈ {±1} with probability ½ each, one per event, applied to all its instruments together, so cross-asset
    correlation is kept (stats-defaults 2026-11-04).
  - `M*_h = (1/E) Σ ε_e ȳ_{e,h}`, 20,000 draws.
  - Two-sided `p = (1 + #{|M*| ≥ |M|}) / (1 + 20000)`. **This p goes into Holm.**
- **Opposite sign (reversal).** A significant negative M_h is reversal, the mirror. It passes or fails under the same
  gate with the sign flipped, and is labelled "fade the surprise".
- **Placebo-entry R (method lesson #27).** The R of the 0.5σ stop rule on the placebo days is reported, and the
  rule's R is read as the difference from it, never raw.
- **Non-US mirror (descriptive only, small).**
  - UK CPI y/y (`calendar_events.csv`, 2014 →, consensus present 68%) → GBPUSD.
  - Euro-area flash HICP y/y (2021-10 →, n ≈ 58) → EURUSD.
  - Foreign-positive surprise → pair up. Same entry, horizons and σ.
  - ECB and BoE decisions are **excluded**: their consensus starts in 2022-12, the decision equals consensus almost
    always, and no intraday Bund or Gilt series is cached for a market surprise.
- **Positive control (method lesson #1, stats-defaults 2026-10-21), run BEFORE any event outcome.**
  - On the placebo-day returns with the event signs imposed, plant `δ · s_e · 1` (in σ) into y at each horizon for
    δ ∈ {0, 0.5, 1, 1.5} × bar, 500 draws each, and run the exact scoring pipeline.
  - It must recover δ (mean within ±0.25 × bar) and reject at ≈ 5% (≤ 8%) at δ = 0.
  - The detection rate at δ = bar is the measured power. It is written to `power.json` and committed **before**
    `04_score.py` runs.
  - The assumption most likely to break is that within-event correlation is stable across years. Report the measured
    within-event ρ̄ on placebo days.

### 3.9 Dependence and intervals

- **Within an event**, the five instruments are correlated. Inference is at event level: the event mean ȳ_e, coherent
  sign flips, and resampling whole events.
- **Across events**, windows overlap: h4 of a CPI covers the PPI a day later. Clusters are the connected components
  of events whose [t, end_h4] windows overlap (union-find). The **event-cluster bootstrap** resamples clusters with
  replacement, B = 2000, seed 20261114, and gives percentile 95% intervals for M_h, β_h and the slices.
- **Sensitivity:** a calendar-month block bootstrap (stats-defaults, daily-or-slower).

### 3.10 Sample and stability split

- Full: 2010-01-01 → 2026-08-21 (PPI from 2014-01).
- Halves for the stability gate: **2010-01 → 2017-12** (ff calendar era) and **2018-01 → 2026-08-21**
  (`calendar_events` era).
- No IS/OOS fitting happens: nothing is fitted (signs and directions are fixed above). The lockbox sessions after
  2026-08-21 are not read.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Pooled continuation after +15 min, h1 (`M_h1`) | **Null-to-small**: +0.00 to +0.03σ, below the 0.05σ bar |
| b | Pooled continuation, h2 (21:00 UK), **the headline cell** | **Null**: \|M\| < 0.05σ |
| c | Pooled, h3 (next 07:00) | **Null** |
| d | Pooled, h4 (+3 days) | **Null or reversal**, e.g. FOMC partial unwind (`fed-two-moves`), NQ fade (`rate-surprise-nq` exploratory). Underpowered by design (§5) |
| e | Momentum variant (own first-15-min sign), h1–h4 | **Null**; if anything a slight reversal intraday |
| f | Large-surprise tercile and data/market agreement drift more | Weakly **yes** in direction, not significant after BH |
| g | The placebo mean is ≈ 0 | **Yes** (\|placebo mean\| < 0.5 × bar) |
| | **THE GATE** (per scored cell; all must hold) | (1) Holm-adjusted sign-flip p < 0.05 within the id's 4-cell family; (2) \|M_h\| ≥ the bar (§5) and continuation sign (> 0); (3) M_h above the 97.5th percentile of the same-clock placebo distribution; (4) same sign in both halves, each half ≥ 0.5 × bar; (5) same sign and unadjusted p < 0.05 with the top 1% of event clusters by \|ȳ\| removed; (6) drift-adjusted β_h same sign and ≥ 0.5 × bar; (7) ≥ 3 of 5 instruments with the same sign as M_h |
| | **THE MIRROR** | Reversal: the same gate with every sign flipped (M_h ≤ −bar, below the 2.5th placebo percentile, both halves negative, …). A reversal pass is reported as "fade the surprise", its own result under the same id |

Blunt odds of any VALIDATED cell: about 15%.

## 5. Power — what this design can and cannot find (required)

**Control sample** (no event outcome read):

- **Data:** OANDA M15 EURUSD and NAS100 closes (`analysis/output/rate-surprise-events/m15/`), entry at 08:45 ET on
  weekdays 2010-03 → 2026-08-18. Days are excluded if they are within −1…+3 business days of a CPI, NFP, FOMC or PPI
  release.
- **Scaling:** returns in σ from a 60-day RMS of NY-close returns built from the same bars. R with a 0.5σ stop on
  15-min closes.
- **Sample:** EURUSD n = 1,879 days, NAS100 n = 1,865.
- **Script:** a scratch script (not committed with the prereg). The same computation is the first step of `03_placebo_power.py`, which must reproduce these SDs to two decimals.

| | h1 | h2 | h3 | h4 |
|---|---|---|---|---|
| SD of y (σ), EURUSD / NAS100 | 0.257 / 0.299 | 0.638 / 0.857 | 0.759 / 0.949 | 1.942 / 1.936 |
| SD of R (0.5σ stop), EURUSD / NAS100 | 0.49 / 0.55 | 1.08 / 1.25 | 1.23 / 1.37 | 2.36 / 2.37 |
| Corr EURUSD vs NAS100 (control) | 0.08 | 0.13 | 0.17 | 0.12 |

**Assumptions for the table:**

- **Event-day SD.** 1.3 × the control SD. `event-impact-map` puts the next-day size at 1.35× for rate decisions and
  ≈ 1.0× otherwise; the post-entry part of a release day is wider than an ordinary day.
- **Within-event correlation.** ρ̄ = 0.45 among the five signed legs (four share the USD factor; NQ is ≈ 0.1 with FX
  on control days), so `deff = 1 + 4 × 0.45 = 2.8`. At h4, overlapping CPI/PPI windows add × 1.5, so deff = 4.2.
- **Sample size.** n = 600 signal events × 5 = 3,000 rows.
- **α.** Holm's first-step α = 0.05/4 = 0.0125, two-sided, 80% power, from
  `mdeMeanDiff({ sd, n1: 3000, alpha: 0.0125, deff })`.

| Cell (both ids) | Planned n (events / rows) | Outcome SD (control × 1.3) | Design effect | **MDE σ** | **MDE R** | Pass bar σ (R) | Verdict |
|---|---|---|---|---|---|---|---|
| h1 | 600 / 3,000 | 0.361 | 2.8 | **0.037** | 0.069 | **0.05** (0.10R) | POWERED |
| h2 (headline) | 600 / 3,000 | 0.972 | 2.8 | **0.099** | 0.155 | **0.10** (0.20R) | POWERED, on the edge (ratio 0.99) |
| h3 | 600 / 3,000 | 1.110 | 2.8 | **0.113** | 0.172 | **0.10** (0.20R) | UNDERPOWERED by design |
| h4 | 600 / 3,000 | 2.521 | 4.2 | **0.315** | 0.384 | **0.20** (0.40R) | UNDERPOWERED by design |

**How the bars were set:**

- About 3× the round-trip cost in σ: EURUSD ≈ 1.7 bp on a ≈ 50 bp daily σ ≈ 0.03σ, gold similar, NQ ≈ 0.015σ.
- h1 sits at the card's "about 0.1R".
- h4 carries three nights of financing.
- An effect smaller than the bar is not worth a page line or a trade even if it is real. That is the CONTEXT case in §8.

**Rules about the table:**

- **The table is provisional on one point.** `03_placebo_power.py` measures the cluster-bootstrap SE of M_h on the
  placebo replicates (`mdeFromCI`) and the planted-signal detection rate (§3.8). These read no event outcome. **That
  placebo-based MDE decides each cell's power verdict** and is committed in `power.json` before `04_score.py` runs.
  If h2's measured MDE > 0.10, h2 is UNDERPOWERED by design. The bars do not move.
- **Pooling is honest about its gain.** One instrument alone (600 rows, deff 1) gives MDE 0.041 / 0.111 / 0.127 / 0.288
  at α 0.05. The pooled α-0.0125 MDE is only modestly better, because four of the legs are one USD bet.
- **Slices:** per family (≈ 150 events), MDE ≈ 0.06 / 0.17 / 0.19 / 0.53 at α 0.05. Each half (≈ 300 events):
  0.044 / 0.118 / 0.134 / 0.374. Family and half slices cannot reach the bars at h2–h4; they are read for sign only.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells.**
  - `post-release-drift-pooled`: surprise-sign signal × {h1, h2, h3, h4} = 4 cells, **Holm α = 0.05** on the sign-flip p.
  - `post-release-momentum-pooled`: own-first-move signal × {h1..h4} = 4 cells, its own Holm α = 0.05.
  - Two ids were run, so best-of-2 is stated in RESULTS. The gate's other conditions are conjunctive on top of Holm.
- **Disaggregation (BH q = 0.10 with `chanceBaseline`)**, per id:
  - family 4 × 4 = 16
  - instrument 5 × 4 = 20
  - surprise tercile 3 × 4 = 12
  - agreement 2 × 4 = 8
  - FOMC +60 entry 4
  - regime-signed NQ 4
  - non-US mirror 2 × 4 = 8
  - in total ≈ 72 per id
- **What a BH-surviving slice means.** It is a *candidate* for its own prereg, never a result. A slice cannot turn a
  failed pooled cell into a pass.
- **Sensitivities, no p-values.** Entry +1 min and +30 min, σ60 in place of HAR σ, month-block bootstrap, h4 with
  contaminated rows censored, and NQ M15-era rows dropped. They are reported beside each scored cell. A pass that
  flips sign under any of them is demoted to CONTEXT.
- **Promotion bar (anything live):** |t| ≥ 3 on the scored cell (Harvey–Liu–Zhu) **and** net R after real spread above
  the placebo-entry R with a 95% interval above 0, then a forward record. A ledger `validated` at |t| ≥ 2 stays
  research-only.

## 7. What this does NOT test (required)

- **Cause.** A pass would show drift follows the surprise sign, not why.
- **Within-15-minute timing.** The first jump is in the entry price by design. The study does not say whether
  entering earlier or later is better (only the +1 min and +30 min sensitivities).
- **Max's discretion.** It tests the mechanical rule, not his entries, filters or exits (method lesson #24: discretion
  needs an ex-ante log).
- **Tradability in size.** Bid/ask comes from the OANDA practice feed, so fills on release minutes may be worse.
  Financing is not charged at h3/h4.
- **NQ futures.** The NAS100 CFD stands in for NQ.
- **Other release families** (ISM, retail sales, PCE, claims), other central banks, and surprise *magnitude* as a
  linear signal.
- **Positioning into the release** (the card's third condition): it needs the TFF book joined to these events. That
  is a follow-up, not a slice here.
- **Asymmetry of good vs bad news** (`news-asymmetry`) and the pre-event state (`priced-in-direction`).

## 8. What each verdict changes (required)

**Verdict mapping for each ledger id**, decided from the gate and the committed `power.json`, before results are read:

| Verdict | When |
|---|---|
| **VALIDATED** | ≥ 1 scored cell passes the full gate (continuation, or reversal as the mirror) |
| **CONTEXT** | no cell passes the full gate, but ≥ 1 cell passes conditions 1 and 3 (Holm-significant and beyond the placebo) and fails the bar (2) or a stability/concentration condition (4–7). The pattern is real in this sample but too small or too fragile to lean on |
| **NULL** | no cell passes conditions 1 and 3, **and** the headline cell h2 is POWERED in `power.json` with its 95% cluster-bootstrap interval inside (−0.10σ, +0.10σ). Each other cell is labelled NULL-by-interval only if POWERED and its interval sits inside ±bar |
| **UNDERPOWERED** | anything else: no pass, and h2 is underpowered by design or its interval reaches ±0.10σ |

**What each verdict changes:**

- **VALIDATED:**
  - The "trade the surprise" rule enters the direction output (daily-bias design) as a decaying lean at the passing
    horizon only, research-only until |t| ≥ 3 and a forward record.
  - The Signal Copier swings-only test gets a mechanism.
  - A forward-record prereg is written.
  - A reversal pass instead adds a "fade the surprise after +15 min" line, under the same conditions.
- **CONTEXT:** release-day pages may say "after a surprise, price has drifted on a little / given back a little by
  21:00", with the size and its interval, never as a trade.
- **NULL:** the desk stops saying "trade the surprise after the data". Max's post-data days are attributed to his
  entries, exits or luck. The bias's direction output gets no surprise term.
- **UNDERPOWERED:** recorded with `power.json`. The next design to reach power is more release families (ISM, retail
  sales, PCE) as one family, or the 2006–09 history once the calendar covers it. Otherwise "closed as untestable at
  this event count".

**Files (fixed now):**

- `scripts/post-release-drift-pooled/`
  - `00_fetch.sh`: read-only R2 pulls; no R2 writes, no live credentials while scoring
  - `01_events.py`
  - `02_sigma.mjs`
  - `03_placebo_power.py`: placebo, positive control, `power.json`; reads no event outcome
  - `04_score.py`
  - `05_report.py`
- `analysis/output/post-release-drift-pooled/`
  - `events.parquet`
  - `DATA_AUDIT.md`
  - `sigma.parquet`
  - `power.json`
  - `placebo.parquet`
  - `rows.parquet` (event × instrument × horizon)
  - `results.json`: seed 20261114, git hash of this prereg
  - `RESULTS.md`

**Methods lessons applied** (from `education/RESEARCH_METHOD_LESSONS.md` and `research-protocol/references/stats-defaults.md`):

- **Method lessons:**
  - #1 a positive control on the exact pipeline before the run, with a known-zero case
  - #4 the edge source named in §1
  - #10 two σ proxy specs
  - #11 overlapping h4 outcomes handled by overlap clusters, not treated as independent
  - #20 expectancy decomposed into legs
  - #25 terciles read as a ladder
  - #27 the R of a stop rule read against placebo entries
  - #24 discretion is out of scope
  - DISAGREE row on "what profitable traders do": Max's P&L is not evidence here
- **Stats-defaults lessons:**
  - 2026-10-14: neighbourhood-only placebo exclusion; re-read the gates against the verdict code before any result;
    bar-convention sensitivity; entry strictly after the signal (same-day is not forward)
  - 2026-10-18: the word comes from the power table
  - 2026-10-21: the placebo percentile over the full distribution, not one shift; planted signal on the exact pipeline
  - 2026-10-24: join by timestamp with asserts
  - 2026-11-04: whole-event (cluster) sign flips; a randomisation null rather than i.i.d. for the correlated pool
  - 2026-11-07: many draws, not a one-draw shuffle

## Amendments

(none)

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/post-release-drift-pooled/RESULTS.md`. Nothing above this line changes after the run.*
