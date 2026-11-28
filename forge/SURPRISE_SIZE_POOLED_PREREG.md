# surprise-size-pooled — within release windows, does a bigger surprise mean a bigger range, beyond the production forecast?

**Pre-registered 2026-11-28, before any outcome was computed.** (The power table in §5 uses the
control sample only: the same London clock one week before each release, with no release of that
economy within ±3 h. No release-window range was read before this file was pushed.)

| | |
|---|---|
| ID / ledger id | `surprise-size-pooled-fx` (home-currency pool, 8 economies), `surprise-size-pooled-us-risk` (US releases on NQ, ES (SPX500 CFD), gold) |
| Branch | `wf2/surprise-pooled` |
| Register row | `plans/RESEARCH_REGISTER.md` → `surprise-size-pooled` |
| Data | ForexFactory archive `data/calendar/ff_calendar_2007_2025.csv` (the 26,403 rows behind `backfill/surprise_backfill.json`: 8 currencies, High/Medium, actual and forecast present), time-repaired as below; `calendar_events.csv` as a second time source; OANDA M1 mid (`VolRangeForecaster/data/m1`) for EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, NQ, SPX500, GOLD. Window **2016-01-05 → 2025-04-07** (M1 starts 2016-01-04; the archive ends 2025-04-07). The lockbox (after 2026-08-21) is untouched because the archive stops 16 months before it |
| Seed | `20261128` (every script) |
| Uncertainty | London-date cluster bootstrap (resample release dates with all their rows), B = 2000, percentile CI; CR1 cluster-robust SE by date for the disaggregation cells |
| Scripts / outputs | `scripts/surprise-size-pooled/` (`prep_releases.py`, `engine.py`, `score.py`) → `analysis/output/surprise-size-pooled/` |
| Harness | own Python scripts: the design is a fixed-effects panel regression on intraday windows, which neither `analysis/study.mjs` nor `js/harness/runStudy.mjs` does |

## 1. The claim (required)

Desk habit and the banked entry `surprise-size` (2026-09-17, `MD files/MARKET_SENSE_TESTS.md#S7`):
"The size of a data surprise (actual vs consensus, in sigma) widens the release session, by family."
It is used on the site to say: scale the expected range on the release session for employment / rate
decisions (CPI the session after).

The question here: **within release windows, does a larger standardised surprise
(|actual − consensus| / that series' own trailing surprise sd) predict a larger realised range in the
home currency (and for US releases NQ / ES / gold) over the next 30 min, 2 h and the rest of the
London session, after the production range forecast (shipped estimator σ × p50 width), the production
event multiplier, the window's normal size at that clock time and the pre-release hour's range?**
Pooled across 8 economies with series fixed effects (which nest economy fixed effects).

Edge source (method lesson 4): forecasting skill about range only. Nobody is "on the other side"; the
use is band width on release days, never a direction.

## 2. Why it is not already settled (required)

- `surprise-size` (validated, **REOPENED** by the 2026-10-31 code audit, `js/evidenceAudit.js`
  FRAGILE). The audit's objection (`analysis/output/repo-review-2026-10-31/VERDICT_AUDIT.csv`):
  *"market_sense_studies.mjs:298-308: no top-vs-low comparison; 67 cells, no correction"* — what was
  shown is "release days are wider (true); 'size matters' untested"; the fix it names is
  *"within release days, by family, with Holm"*. **This design avoids that defect:** every row is a
  release window, the regressor is the size of the surprise, the comparison is big vs small surprises
  of the SAME series (series fixed effects), the 12 scored cells are Holm-corrected, and the
  disaggregation by economy / tier / family is BH-corrected and carries no pass weight. It also adds
  what the old test lacked: the production forecast and event multiplier as controls, and intraday
  windows (the old test used whole sessions in ATR).
- `post-release-drift-pooled` (UNDERPOWERED/NULL) and `rate-surprise-events` (UNDERPOWERED) are about
  DIRECTION after the surprise. This is range only. Not a re-run.
- `event-impact-map` is a descriptive spike-ratio map (release vs no release), not size.
- DATA_ASSET_MAP §4D1: the backfill "has never been pooled across economies" (only single-pair event
  studies). This is the first pooled use.

## 3. Definitions, fixed in advance (required)

**Release table (`prep_releases.py`, already run; it reads no prices).**
- Rows: the 26,403 backfill rows rebuilt from the CSV (8 currencies, High/Medium, actual and forecast
  present). Exact duplicates on (DateTime, Currency, Event): 0 found.
- **Time repair (three faults, two of them new).**
  1. Placeholder rows (UTC 19:30/20:30/23:30/23:59 = Tehran midnight, no clock time; 10,426 rows):
     the event DATE is the raw string's date (the ForexFactory day). NEW FAULT: `forge/ff_calendar.apply_rule`
     converts to Asia/Tehran, which puts summer 2023–25 placeholder rows a day early (the file still
     stamps +04:30 after Iran dropped DST in 2022; NFP on a Friday 50% of the time in 2023–24 vs 100%
     on the raw date). Recorded in DATA_SPEC §5.
  2. NEW FAULT: real-clock rows stamped +04:30 from 2023 on are one hour early in UTC (US CPI at 07:30
     New York). Shifted +60 min (555 rows).
  3. Placeholder rows have no time: taken from `calendar_events.csv` when a row there has the same
     currency, the FF day (±1), the same parsed actual (and consensus when both have one) and one
     unique minute (2,742 rows). That file's known faults are handled: 46,095 exact-duplicate rows
     dropped; summer 2014–15 ECB/BoE stamps shifted −1 h (DATA_SPEC #26; outside this window anyway).
     Otherwise the series' schedule: the modal issuer-local clock (and day offset) of the same series'
     real-clock rows within ±365 days (≥ 3 rows, mode ≥ 60%), else over the whole series (4,801 rows).
     Rows timed by neither are dropped (2,883 of 26,403, all years). Checks, 2016 on: the two sources
     agree to the minute on 95.8% of rows both time (97.7% within 2 min); the schedule agrees with
     `calendar_events.csv` on 91.7% of rows both time. A robustness cell drops every schedule-timed row.
- **Surprise** s = actual − forecast (K/M/B/T and % parsed). **Size z = |s| / RMS(s over the series'
  previous ≤ 60 releases)**, ≥ 12 previous releases needed (point in time). Series with ≥ 50% exact-zero
  previous surprises are **discrete** (rate decisions and the like): no z; they form a descriptive
  any-surprise cell. zc = min(z, 5).
- **Release event** = one economy, one minute. zc_event = the MAX zc over its series (the lead series is
  the one with the max); robustness: the mean. Impact tier = the highest of its rows (high / medium).
  Family = the lead series' family by the regex list in `prep_releases.py` (rate_decision, employment,
  inflation, gdp, survey, activity, other).
- **Knowable when?** zc is known at the release minute t0 (consensus before, actual at t0). Every control
  is known before t0. The outcome window starts AT t0.

**Outcomes** (`engine.py`): log of the high-low range of M1 bars in the window, as % of the last close
before t0 (that close must be ≤ 10 min before t0; the window must hold ≥ 60% of its minutes):
- `w30` = [t0, t0+30 min); `w120` = [t0, t0+2 h); `ros` = [t0, 22:00 London of t0's London date),
  only when ≥ 60 min long.

**Instruments (fixed).** Home pair: US → EURUSD, EU → EURUSD, GB → GBPUSD, JP → USDJPY, AU → AUDUSD,
NZ → NZDUSD, CA → USDCAD, CH → USDCHF. US releases also on NQ, SPX500 (the OANDA S&P 500 CFD, standing
in for ES; there is no 2016–2025 ES M1 here without the NT8 holes) and GOLD.

**Model (one per cell, OLS, lead-series fixed effects by within-transform):**
`log R_w = FE(economy|lead series) + γ·zc + β1·log pre60 + β2·log tod20 + β3·log base + β4·log evmult + β5·conc + ε`
- `pre60` = range of the 60 min before t0 (% of price).
- `tod20` = median of the SAME window (same London wall clock) over the previous 20 weekdays
  (≥ 10 valid).
- `base` = the production daily HL forecast for that London session: the shipped estimator in
  `js/forecastLadderParams.js` (yz_10 / ewma_094 per instrument) on `forge.vol.load_daily(london22)`,
  as-of-yesterday, /√252 × the shipped hl p50 width.
- `evmult` = the shipped event multiplier for that day's tag (FOMC / NFP / CPI / high / holiday / none),
  tags built as `forge/ff_calendar.event_tags` but on the CORRECTED dates above (the live tagger reads
  correct dates; the historical fault should not handicap the baseline).
- `conc` = 1 if a release of another economy whose currency is in the instrument fires within
  [t0 − 15 min, t0 + 30 min].
- Each control gets its own coefficient, so the baseline is at least as good as the production forecast
  scaled by any constant. "Beyond the production forecast and event multipliers" = γ conditional on these.

**The control (placebo-week).** The same model with the event's real zc on the SAME London clock exactly
one week earlier (kept only if no release of that economy is within ±3 h). A real effect of the surprise
cannot show there; a regime proxy would.

**De-clustering.** Rows share dates (several economies and instruments per day): every interval clusters
by London date. Overlapping windows of the same economy (e.g. 08:30 and 10:00 US) are kept; date
clustering covers the dependence.

**Sample split for the stability gate.** H1 = 2016-01-05 → 2020-12-31, H2 = 2021-01-01 → 2025-04-07.

**Positive control (method lesson 1).** Before reading the result: plant γ = 0.05 on the placebo-week
windows (y × exp(0.05·zc)) — the pipeline must recover ≈ 0.05; the unplanted placebo-week fit is the
known-zero case. Reported in `results.json`.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | FX pool, w30: γ > 0 | **Yes**, uplift (|z| 0.5 → 2.0) ~10–20% |
| b | FX pool, w120 / ros | **Yes, smaller** (the window dilutes the release minute) ~5–10% / ~3–6% |
| c | US on NQ / ES / gold, w30 | **Yes** on all three, smaller than FX (~5–10%) |
| d | US on NQ / ES / gold, w120 / ros | **Weak** — near the bar |
| e | Heterogeneity by economy (FX) | US / CA / AU / GB largest; JP and CH too thin to say |
| f | High vs medium impact | γ larger on high |
| g | Discrete series (rate decisions): any surprise vs none | wider (descriptive only) |
| — | **THE GATE** (per cell): γ > 0; Holm-adjusted p < 0.05 over the 12 cells; uplift exp(1.5γ) − 1 ≥ **7.5%**; γ > 0 in BOTH halves; placebo-week γ inside its 95% band OR below one third of γ | |
| — | **THE MIRROR**: none in sign (size is unsigned). The placebo-week cell is the control that must come back ≈ 0 | |

Cell verdicts: all gates → `VALIDATED`; every gate but materiality (significant, stable, placebo clean,
uplift < 7.5%) → `CONTEXT` (real but too small to change a band); bootstrap CI upper uplift < 7.5% → `NULL`;
otherwise `UNDERPOWERED`. Ledger verdict per id = the best cell verdict in its family
(VALIDATED > CONTEXT > UNDERPOWERED > NULL), with the cell list shown.

## 5. Power — what this design can and cannot find (required)

From the control sample (placebo-week windows: residual sd of the control-only model, the date-cluster
design effect, and sd(zc) over release events = see `analysis/output/surprise-size-pooled/power.json`).
MDE for γ at 80% power and the worst-case Holm α (0.05/12, two-sided): MDE = 3.71 × resid_sd ×
√deff / (sd(zc) × √n).

| Cell | Planned n (release events; ros ≈ 90%) | Control n | Resid sd (log range, control) | Design effect (date clusters) | **MDE γ** | MDE as uplift exp(1.5γ)−1 | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|---|
| FX pool w30 | 5,762 | 2,935 | 0.401 | 1.09 | 0.0249 | 3.8% | 7.5% | POWERED |
| FX pool w120 | 5,762 | 2,935 | 0.393 | 1.18 | 0.0253 | 3.9% | 7.5% | POWERED |
| FX pool ros | 5,346 | 2,753 | 0.382 | 1.49 | 0.0288 | 4.4% | 7.5% | POWERED |
| NQ w30 | 2,436 | 556 | 0.404 | 1.03 | 0.0374 | 5.8% | 7.5% | POWERED |
| NQ w120 | 2,436 | 554 | 0.404 | 1.06 | 0.0381 | 5.9% | 7.5% | POWERED |
| NQ ros | 2,260 | 505 | 0.406 | 1.26 | 0.0432 | 6.7% | 7.5% | POWERED |
| SPX500 w30 | 2,436 | 503 | 0.419 | 1.03 | 0.0389 | 6.0% | 7.5% | POWERED |
| SPX500 w120 | 2,436 | 503 | 0.415 | 1.09 | 0.0396 | 6.1% | 7.5% | POWERED |
| SPX500 ros | 2,260 | 461 | 0.394 | 1.2 | 0.0409 | 6.3% | 7.5% | POWERED |
| GOLD w30 | 2,436 | 558 | 0.417 | 1.04 | 0.0389 | 6.0% | 7.5% | POWERED |
| GOLD w120 | 2,436 | 559 | 0.398 | 1.12 | 0.0385 | 6.0% | 7.5% | POWERED |
| GOLD ros | 2,260 | 533 | 0.391 | 1.28 | 0.0419 | 6.5% | 7.5% | POWERED |

sd(zc) over the 5,941 continuous release events = 0.82 (zc capped at 5). The control n is smaller than
the planned n because the week-before window is kept only when that economy had no release within ±3 h;
MDE is scaled to the planned n by √(n_control / n_planned).

**Design change made here, before registering (from the power table, no outcome seen):** the
materiality bar was first drafted at a 5% uplift; at that bar the nine US-risk cells (MDE 5.8–6.7%)
would be UNDERPOWERED by design. The bar is set at **7.5% uplift (γ ≥ 0.048)** for ALL 12 cells: a band
that moves less than 7.5% between a 0.5σ and a 2σ surprise would not change how the desk sizes a release
window anyway. Every cell is then POWERED. Population counts per economy (continuous-z events,
2016-01-05 → 2025-04-07): US 2,512, EU 981, CA 774, GB 769, AU 473, NZ 213, CH 125, JP 94; discrete
(rate-decision-type) events 587.


## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells (12):** {FX pool, NQ, SPX500, GOLD} × {w30, w120, ros}. **Holm at α = 0.05** on the
  bootstrap p-values.
- **Disaggregation (BH q = 0.10, no pass weight):** per economy × window (FX, 8 × 3), impact tier
  (high / medium) × group × window, family × group × window. Reported with the chance count. A slice that
  survives is a candidate for its own prereg. Plus one Wald test per window of equal γ across economies.
- **Descriptive robustness (no pass weight):** zmean instead of zmax; drop schedule-timed rows; drop
  concurrent releases; a big-surprise dummy (zc ≥ 1.5); out-of-sample MSE gain (fit H1, score H2);
  a within-series permutation placebo (200 shuffles of zc, w30); discrete series any-surprise.
- **Promotion bar:** a pass here is research-only until |t| ≥ 3 on its cell (Harvey–Liu–Zhu).
- Method lessons applied: 1 (positive control, §3), 5 (linear OLS is the model), 10 (two size proxies,
  zmax and zmean, and three windows).

## 7. What this does NOT test (required)

- **Direction.** Nothing here says which way price goes after a surprise; direction claims never become
  signals.
- **Tradability.** No entry, stop or cost. It is about band width.
- **Cause / timing of the effect within the window** beyond the three windows.
- **JPY, AUD, NZD, CHF live actuals**: the LIVE surprise store never fills them (data review). The
  backfill does carry them to 2025-04, but thinly for JP (≈ 100 timed releases 2016 on, 5 high impact,
  mostly rate / GDP / Tankan) and CH (≈ 140). Any per-economy result for JP / CH is descriptive at best,
  and a live layer for those currencies would have no live input.
- **Rows the time repair could not place** (2,883 of 26,403; 11% of 2016-on rows) are not tested.

## 8. What each verdict changes (required)

- **Pass** → ledger entries; the site's release-day band reads "big surprise (|z| ≥ 2): expect the
  next 30 min / 2 h to run x% wider than the forecast" as a removable shadow layer beside the
  production forecast (own switch, never overwriting it). Research-only until |t| ≥ 3 and a forward record.
- **Context** → the effect is real but smaller than 7.5%; the page says so and does not scale bands.
- **Null** → the `surprise-size` line ("scale the expected range by the surprise") is withdrawn for the
  windows that are null: the release itself (event multipliers) carries the range, not its size.
- **Underpowered** → the forward live store (US/GB/AU/CA actuals) accumulates; re-test when ≥ 2 more
  years are in.

## Amendments

### A1 — 2026-11-28 — POST-HOC (results seen)
Describe / demote only. Under the registered rule `surprise-size-pooled-us-risk` takes its best cell,
gold 30 min (VALIDATED), while every NQ cell is NULL and the S&P 500 30-min cell is UNDERPOWERED. So the
id does not read as "validated for US indices", the NQ and SPX500 cells are banked apart as
`surprise-size-pooled-us-indices` (best cell by the same rule: UNDERPOWERED), and
`surprise-size-pooled-us-risk` carries `GOLD` only. No cell verdict changed.

## RESULTS

See `analysis/output/surprise-size-pooled/RESULTS.md`.
