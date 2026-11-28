# fred-untested-range — do any of the catalogued-but-untested FRED series, point-in-time, condition next-week realised range beyond the shipped forecast?

**Pre-registered 2026-11-28, before any outcome was computed.** (The §5 power table uses the outcome's own SD and
autocorrelation against synthetic signals only, as the template allows. No FRED series was joined to an outcome.)

| | |
|---|---|
| ID / ledger id | `fred-untested-range` (family entry); one extra ledger id `fred-untested-range-<series>-<transform>` per confirmed cell, if any |
| Branch | `wf2/fred-untested` |
| Register row | `plans/RESEARCH_REGISTER.md` → `fred-untested-range` |
| Data | Outcome: `analysis/output/vf3_stage_b/part1_lines.parquet` OOS rows (the shipped range forecast, same table and error as `forecast-miss-scan`) for EURUSD, USDJPY, GOLD, NQ, SPX500, London sessions 2020-08-24 → 2026-08-20 (lockbox from 2026-08-22 untouched). Signals: ALFRED first releases of 50 FRED series (49 units, IOER+IORB spliced), observations 2014-01 → 2026-08-21, fetched by `scripts/fred-untested-range/fetch_vintages.py` |
| Seed | `20261128` |
| Uncertainty | p-values from a circular-shift placebo (signal shifted against the outcome by 63 … n−63 sessions, step 5; normal approximation on the placebo mean and SD); 95% CIs from a 21-session moving-block bootstrap (B = 1000 discovery, 2000 held-out) |
| Scripts / outputs | `scripts/fred-untested-range/` → `analysis/output/fred-untested-range/` |
| Harness | own script (`run.py`), the `forecast-miss-scan` design extended to a FRED family. `runStudy.mjs` has no ALFRED loader |

## 1. The claim

`plans/FEED_REVIEW_2026-10-22.md`: "61 of the 106 catalogued series are pulled and have no ledger entry. Among them: NFCI,
T5YIFR, DFII5, T5YIE, WTREGEN, WRESBAL, EFFR, IORB, OVXCLS, the daily FRED FX series and most of the curve … the highest-return
move is a range-first scan of the series we already hold." Recommended order item 1: "one harness scan … against
next-5-session range, with the registry's FDR and a mirror placebo." `js/dataCatalogue.js` `untested()` lists 50 FRED ids
with no evidence on 2026-11-28; this study scores all of them. The claim under test: some of these series, known before the
week starts, tell us next week's realised range will differ from what the shipped forecast says.

## 2. Why it is not already settled

- `forecast-miss-scan` (validated ×3, context family) used 17 pre-open conditions on the same error table: VIX/S&P shocks,
  MOVE, rate moves, credit (BAA−AAA 20d change), basis, RRP, month-end. None of the 50 series here was in it except as a
  different construction (it used BAA−AAA as a spread change; here AAA10Y and BAA10Y are scored separately as levels and
  move sizes). Its confirmed survivors (equity/vol stress, FX month-end) are not re-tested here.
- `funding-forecast-error` (SOFR/CP/TFF) and `repo-stress-range` used SOFR, RRP, WALCL; DCPF3M appears there only as a
  spread vs SOFR. `mv-creditstack-range` used HY/IG/CCC OAS, not BB or EM. `curve-inversion` used T10Y2Y only.
- No banked entry uses NFCI, T5YIFR, DFII5, T5YIE, EPU (any), WRESBAL, WTREGEN, TOTBKCR, SWPT, OVX, EVZ, the H.10 fixings or
  the individual curve legs against range. Not a re-run of a banked null.
- Owner rule applied: prior nulls on neighbouring series are not used to predict this one.

## 3. Definitions, fixed in advance

- **Units (49).** DGS1MO DGS3MO DGS6MO DGS1 DGS3 DGS5 DGS7 DGS20 DGS30 THREEFYTP10 DFII5 T5YIE T5YIFR USEPUINDXD USEPUINDXM
  GEPUCURRENT EPUTRADE PCEPILFE PPIFIS EFFR IOER→IORB (spliced at 2021-07-29, one unit `IORB_SPLICE`) WLCFLPCL DTB3
  DTWEXEMEGS DCPF3M WTREGEN WRESBAL TOTBKCR NFCI BAMLEMCBPIOAS AAA10Y BAA10Y EVZCLS OVXCLS DEXUSEU DEXJPUS DEXUSUK DEXCAUS
  DEXSZUS DEXUSAL DEXUSNZ DEXCHUS DHHNGSP DGORDER BAMLH0A1HYBB SWPT SOFRVOL NDFFRIW027SBOG WMTSECL1.
- **Point-in-time value.** For every observation, the ALFRED **first release** (output_type 4; for daily series with more
  than 2,000 vintages, the earliest realtime_start found across one-real-time-year windows). Its realtime_start is its
  publication date, and it is the availability date **always** (never an earlier assumed lag, so archive-start vintages in
  2014–2016 only make early history stale, before any scored session). Measured lags (median since 2018): H.15 curve, TIPS,
  breakevens, Moody's, CP, EFFR 1 day; H.4.1 weekly (WRESBAL, WTREGEN, SWPT, WLCFLPCL, WMTSECL1) 1 day after the Wednesday;
  H.8 (TOTBKCR, NDFFRIW027SBOG) 9 days; NFCI 5; H.10 fixings and DTWEXEMEGS 5 (weekly release); Henry Hub 6; THREEFYTP10 7;
  daily EPU 1; monthly EPU 31; PPI 42; durable goods 56; core PCE 58; global/trade EPU 61–67. IOER/IORB are announced
  ahead (lag −1) and used as published. Rows with value "." are dropped.
- **Knowable when?** A value is usable for London session D only if its availability date ≤ D − 2 calendar days (one full
  day of buffer for FRED's posting time against the 23:00/00:00 UTC open). Values are carried forward on a Mon–Fri grid.
- **Transforms (2 per unit, fixed).** Kind per unit: `growth` = PCEPILFE PPIFIS DGORDER TOTBKCR; `log` = USEPUINDXD
  USEPUINDXM GEPUCURRENT EPUTRADE WLCFLPCL DTWEXEMEGS WTREGEN WRESBAL EVZCLS OVXCLS DEX* DHHNGSP SWPT SOFRVOL NDFFRIW027SBOG
  WMTSECL1 (ln, or ln(1+x) if any value ≤ 0); `rate` = everything else (raw).
  - `lvl`: the value (growth kind: ln x_t − ln x_{t−252 grid days}, the yearly growth rate).
  - `mov`: |x_t − x_{t−20}| on the transformed scale (log kind: |Δ20 ln x|; growth kind: |Δ20 ln x|), a move-size, no sign.
  - Each is turned into a **causal trailing percentile**: rank of today's value among the previous 756 grid days (min 252).
- **The outcome.** e = ln(realised London HL / shipped HL p50) per instrument and session, the shipped p50 being SI (IV-adjusted)
  else S, exactly as `forecast-miss-scan`. **e5(D)** = mean of e over that instrument's sessions D … D+4 (next week), dropped
  if the five rows span more than 9 calendar days. POOL = mean e5 of the five instruments (all five present).
- **Targets (6).** EURUSD, USDJPY, GOLD, NQ, SPX500, POOL, reported separately.
- **Statistic per cell** (unit × transform × target): mean e5 when percentile ≥ 2/3 minus mean e5 when percentile ≤ 1/3
  (log units, shown as %). Needs ≥ 60 sessions on each side, else the cell is not scorable.
- **Scorable.** Signal coverage (non-missing percentile) ≥ 70% of sessions in **both** periods. Not-scorable cells are listed,
  not tested (expected: BAMLEMCBPIOAS and BAMLH0A1HYBB, whose FRED history starts 2023-11; EVZCLS, dead since 2025-03).
- **The control.** The shipped forecast is the baseline (e is already the miss against it). The mirror placebo is the same
  signal circularly shifted against the outcome (keeps both autocorrelations).
- **De-clustering.** None; overlapping 5-session targets on daily rows, handled by the shift placebo and the 21-session block
  bootstrap. Sensitivity (descriptive only): Monday rows only (non-overlapping weeks).
- **Sample.** Discovery 2020-08-24 → 2023-08-18; held-out 2023-08-21 → 2026-08-20. Percentile history may use grid days before
  2020-08 (signal only).

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Does any unit×transform×target cell confirm out of sample? | **Null for most.** Most plausible survivors: NFCI level, OVX level/move, DFII5 / curve-leg move sizes on POOL or SPX/NQ. Expected size if real ~5–15% of next-week range |
| b | Are the H.10 fixing move sizes (DEX*, `mov`) redundant with the forecast? | **Yes, null**: they are lagged realised vol, which the forecast already carries |
| G | **THE GATE** per cell: (1) BH q = 0.10 across all scorable discovery cells on the placebo p; (2) held-out: same sign, Holm α = 0.05 across the discovery survivors on the held-out placebo p, held-out block-bootstrap 95% CI excluding 0, and |held-out effect| ≥ 5% | |
| M | **THE MIRROR**: two-sided; a high-signal week with a *narrower* range than forecast passes the same gate and is reported as such. The shift placebo is the structural mirror | |

Positive control (lesson 1, `education/RESEARCH_METHOD_LESSONS.md`): before the real run, the same pipeline on a planted
effect (NFCI `lvl` percentile, POOL e5 + 0.10 when ≥ 2/3, − 0.0 elsewhere, discovery and held-out) must recover ≈ +10% and pass
both gates; with no plant the planted pipeline's BH survivors from 200 pure-noise signals must be ≤ 10% of the noise cells.
Lessons applied: 1 (positive control), 11 (overlapping targets → shift placebo + block bootstrap; non-overlap sensitivity),
14 (causal trailing percentiles, no full-sample cuts).

## 5. Power — what this design can and cannot find

From `scripts/fred-untested-range/power.py` (200 synthetic AR(1) signals per persistence, unrelated to the outcome, same
percentile and tercile statistic; `analysis/output/fred-untested-range/power.json`). MDE95 = 2.8 × null SD, in % of next-week range.

| Target | n disc / held | MDE95 disc, φ 0.95 / 0.99 / 0.998 | MDE95 held, φ 0.95 / 0.99 / 0.998 |
|---|---|---|---|
| EURUSD | 777 / 774 | 13.0 / 20.8 / 22.1 | 8.1 / 8.5 / 7.8 |
| USDJPY | 777 / 774 | 12.4 / 17.2 / 18.3 | 19.7 / 26.6 / 32.3 |
| GOLD | 644 / 642 | 9.3 / 12.1 / 13.4 | 12.6 / 12.4 / 10.2 |
| NQ | 643 / 634 | 13.7 / 22.7 / 27.0 | 11.6 / 13.0 / 15.1 |
| SPX500 | 643 / 634 | 15.0 / 27.0 / 31.8 | 12.5 / 14.5 / 17.9 |
| POOL | 643 / 634 | 8.9 / 15.0 / 17.2 | 8.7 / 9.6 / 10.0 |

- Persistent signals (levels, φ ≈ 0.99–0.998) line up with slow regimes in the forecast miss, so their null SD is large. **The
  design can find effects of roughly 10–30% of next-week range per instrument, ~9–17% pooled.** The validated
  `forecast-miss-*` effects were 6–13%, so effects of the size already known are at the edge of detection.
- **Pass bar (material size): 10%.** Grading of a cell that does not confirm: if its own held-out (or, if not a survivor,
  full-sample) MDE95 from the shift placebo ≤ 10% → **NULL** (would have seen a material effect); else **UNDERPOWERED**.
  Family verdict word: `VALIDATED` if ≥ 1 cell confirms (the confirmed cells banked as their own entries); otherwise `NULL` if
  ≥ half the scorable POOL cells are NULL-graded, else `UNDERPOWERED`.

## 6. Multiplicity

- **Scored cells**: every scorable unit × transform × target (≤ 49 × 2 × 6 = 588). Discovery: Benjamini–Hochberg q = 0.10
  across all of them (FDR on a screen). Held-out: **Holm α = 0.05** across the discovery survivors (family-wise on the
  confirmation). Both bars must hold.
- p-values: normal approximation from the shift-placebo mean and SD (`pFromCI`-style), stated as such.
- Cells are correlated (curve legs, the eight H.10 fixings, five instruments + POOL); BH is valid under positive dependence
  and Holm needs no independence. The effective number of independent units is far below 49; reported as a chance baseline.
- Promotion bar for live use: |t| ≥ 3 on the held-out cell and a forward record. Nothing here goes live from this study.

## 7. What this does NOT test

- Direction: none. No signed return is ever computed (owner rule: range/size only).
- Tradability, costs, stops: no.
- Cause: a confirmed cell is a conditioner of the forecast miss, not a mechanism.
- Other horizons (next day, next month) and other instruments: no. Combinations of series: no (single-series screen).
- Whether a survivor is just the already-validated stress conditions (VIX level/5d change): **described** for confirmed cells
  (correlation with VIX-level percentile and the effect within the VIX-middle tercile), not gated.

## 8. What each verdict changes

- **Pass** → `fred-untested-range-<unit>-<transform>` validated entry, the series' catalogue `evidence` filled, the cell named
  as a candidate layer for the range forecast (a removable shadow layer, its own switch, never an edit to the base calc) in a
  follow-up prereg with a forward record.
- **Null / underpowered** → the family entry with each series' graded weight; `js/dataCatalogue.js` `evidence` set to the
  family id for every scored series, so the catalogue stops listing them as untested and the feed review backlog closes.
- The page `fred-untested-range.html` shows the whole family on the site either way.

## Amendments

*(none yet)*
