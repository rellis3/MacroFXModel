# positioning-flow-inputs — Do non-price, non-public-macro inputs (OANDA retail book, 25-delta risk reversals, the volatility risk premium, a month-end flow estimate) add next-day and 5-day direction information beyond the base rate B0, and beyond the bias-learner's readings?

**Pre-registered 2026-11-15, before any outcome was computed.** Only input history depth was measured to write this
(row counts and first/last dates of each input file; §3.2). No target, no B0 and no input-versus-outcome statistic was
computed. The power table (§5) is filled by a PRE-RESULTS amendment from a simulation that uses the real readings and
**synthetic** labels only (the `bias-learner` A1 pattern).

| | |
|---|---|
| ID / ledger id | `positioning-flow-inputs`; suggested one ledger entry per input: `positioning-flow-book`, `positioning-flow-rr`, `positioning-flow-vrp`, `positioning-flow-monthend` (the owner banks; this session does not edit `js/deskEvidence.js` or the register) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `positioning-flow-inputs` (CLAIMED; maintained by the owner's session) |
| Data | The `bias-learner` panel: 13 instruments (EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, EURJPY, GBPJPY; GOLD; NAS100, SPX500, US30), OANDA mid M1, London sessions 2016-01-04 → **2026-08-21** (lockbox: no outcome after it; every horizon end ≤ 2026-08-21 21:00 London, asserted). Inputs in §3.2 |
| Seed | `20261115` (every script and every shuffle in this study) |
| Uncertainty | moving-block bootstrap over test **dates** (all instruments of a date move together), block 21 sessions, B = 2000; SE floor = SD of the 200-refit block-shuffled-input placebo (§3.6) |
| Scripts / outputs | `scripts/positioning-flow-inputs/run.py` (`--selftest`, `--power`, real run) → `analysis/output/positioning-flow-inputs/` |
| Harness | own Python script. It imports `scripts/bias-learner/run.py` for the panel (readings, P0, 21:00 closes, the lockbox-filtered M1 reader), point-in-time B0 (`b0_matrix`) and the offset logistic (`fit_logit`), so the readings, targets and yardstick are exactly the banked learner's. `python -X utf8 -I`; every `R2_*` variable unset; nothing is written to R2 |

## 1. The claim (required)

`plans/BIAS_RESEARCH_SYNTHESIS.md` **P4**: *"Positioning and flow inputs, t → t+1: VRP, OANDA retail book,
risk-reversal change, month-end flow estimate. Each alone, then added to the bias learner. New information, not public
price/macro."* `plans/DAILY_BIAS_REVIEW.md` tests 6/7 (risk reversals and skew as a slow direction prior; the bank
"fast overlay": positioning, risk reversals, month-end/fix flows).

**Mechanism, per input.**
- **Retail book (contrarian).** OANDA's retail clients are the classic "wrong-side" crowd: when the near-spot book is
  unusually long, the folklore is that price falls. Edge source: a behavioural premium (retail pays to provide
  momentum-chasing liquidity) — or nothing.
- **25-delta risk reversal (level and change).** Options buyers paying up for calls (or puts) on a pair may know
  something, or may be hedging; the change shows demand arriving. Edge source: information in option demand, or a
  crash-risk premium (RR level = what the market fears, so a skew-rich side may drift the other way as the fear is
  paid).
- **Volatility risk premium (implied − realised).** A high VRP is a risk premium being charged; in equities it has been
  linked to later returns at monthly horizons. In FX it is oriented to the USD side here (high VRP → does the dollar
  rise, a haven bid?). Edge source: risk premium.
- **Month-end flow estimate.** Foreign holders of US equities hedge or rebalance at month end: when US equities have
  outperformed the rest of the world over the month, the textbook flow is USD selling into the last sessions. Edge
  source: a structural, predictable flow.

Who is on the other side, in every case, is the reason the expectation (§4) is null: these are widely watched.

## 2. Why it is not already settled (required)

| Nearest entry | Verdict | Why this is a different question |
|---|---|---|
| `squeeze-fuel` (`MD files/SQUEEZE_VOL_TEST.md`) | NULL | Crowded-and-underwater retail days were not **wider**, direction "flat", 4 instruments, 9 years. That was a range test with a descriptive direction glance; here the book's **level and change** are scored as calibrated next-day/5-day direction against B0, alone and over the learner. **Screen applied:** the underwater/pain read is not re-used (its range null stands) |
| `cot-positioning-factor` (NULL), `cot-crowding-*` (p5 VALIDATED, rest mostly null/underpowered) | — | CFTC weekly speculator positioning. COT is already a `bias-learner` reading (`cot`); the retail book is a different crowd at a daily cadence. Not re-tested |
| `positioning-into-release-direction` (VALIDATED, small: +0.064 ATR against the crowd on release days) | — | A conditional, release-day state on the COT crowd. Here: always-on daily retail positioning; the release-day state is not re-cut |
| `iv-over-rv-wider` (VALIDATED, range) | — | High VIX ÷ RV → **wider** indices over the next 5–20 days. A range claim; this asks direction. The `bias-learner`'s `ivrv` reading is the same quantity; the VRP alone cells for gold and indices are therefore a single-reading view of an input the learner already had (stated; they have no incremental cell) |
| Quant Guild VRP note (`education/RESEARCH_METHOD_LESSONS.md` #11, #18) | method | IV-vs-RV outcomes must be horizon-matched; forecast evaluation separates bias from slope. Applied: the outcome here is direction, not RV; calibration slope reported |
| `month-end-rebalance` (`MD files/LEAD_LAG_TESTS.md#L2`) | NULL | SPX's own last-3-session return after strong months. Here the flow estimate is **relative** equity performance (US vs Europe) applied to **FX** pairs through the USD side, the sell-side month-end model |
| `forecast-miss-month-end-fx` | VALIDATED (range) | FX month-end ranges run ~7% beyond the lines. A size effect, which is why a direction flow is worth asking about; it says nothing on direction |
| `bias-learner` (FX NULL, gold/idx UNDERPOWERED) | — | The learner over 13 morning readings. Its readings are the incremental baseline here; none of book, RR, FX VRP or month-end flow is among them (its FX-IV arm was descriptive only) |
| `fx-factor-*`, `gr-*`, `direction-bar` | NULL / UNDERPOWERED / CONTEXT | B0 is the yardstick; an always-on 1-day signal needs IC ≈ 0.04 (`direction-bar`). No banked test of these four inputs as direction calls exists (grep of `js/deskEvidence.js`, `forge/`, `plans/` on 2026-11-15: no `rr25`, no OANDA-book direction entry, no FX VRP direction entry) |

## 3. Definitions, fixed in advance (required)

### 3.1 Sessions, entry, targets, yardstick (exactly `bias-learner` §3.1–3.2)

- Session d = London calendar date, weekdays. Entry P0 = open of the 07:00 London M1 bar (07:00–07:04).
- Horizons **h ∈ {0, 5}** (data-rules, owner's brief): P_h = close of the last M1 bar in 20:55–20:59 London on the h-th
  London session after d (h = 0 is d itself: **07:00 → 21:00**; h = 5: **+5 sessions**). y_h = 1{P_h > P0}; ties
  dropped. A row whose horizon end is after 2026-08-21 is dropped (asserted).
- **B0_{i,h}(d)** = (Σy + 10)/(n + 20) over instrument i's labels realised before d (`b0_matrix`), all 13 instruments
  from 2016-01-04. Every model below has a fixed offset logit(B0), so all shrinkage is toward B0.

### 3.2 The inputs, their point-in-time rule and their measured history depth

Depth measured 2026-11-15 (row counts and dates only):

| Input | Source | Instruments | Depth before the lockbox | Status |
|---|---|---|---|---|
| OANDA retail **position book** | `backfill/books_daily.ndjson` (desk backfill, `scripts/fetch_oanda_books.py`, one snapshot per weekday at **07:00 UTC**, full buckets). Cross-check: server `/api/oanda-book/history` (read-only GET) holds the same 4 instruments' daily rows 2019-09-09 → 2026-10-30 (1,830 rows, capped at 5 × 366 days) | EURUSD, GBPUSD, USDJPY, GOLD (2,395 snapshots each, 2017-05-01 → 2026-09-11) | **2017-05 → 2026-08-20, ≈ 2,350 snapshots** | **scored** |
| OANDA book, other 12 instruments (AUDJPY, AUDUSD, EURAUD, EURCHF, EURGBP, EURJPY, GBPCHF, GBPJPY, NZDUSD, USDCAD, USDCHF, XAGUSD) | server live recorder only | — | **0** (44 daily rows, all after the lockbox, from ~2026-09) | **forward-record cell, UNDERPOWERED by design** |
| **25-delta risk reversal**, 30-day constant maturity (`rr25_30`, CME settlement chains inverted by `oi_research_book/scripts/14_iv_surface.py`; pair terms: JPY/CAD/CHF inverted so + = calls on the pair) | `oi_research_book/data/iv_daily_{eur_usd,gbp_usd,usd_jpy,aud_usd,usd_cad,usd_chf,nas100_usd}.parquet` | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF; NAS100 | **2020-09-08 → 2026-08-20, ≈ 1,500 settlements** | **scored** |
| RR for gold, ES, crude; RR 1w/3m (IBKR `scripts/rates_line/refresh_options_skew.py` → KV `options_skew_v1`) | laptop pull, from 2026-11-04 | GOLD, SPX500 (ES), NAS100 (NQ), 6 FX | **0** (all after the lockbox) | **forward-record cell, UNDERPOWERED by design** |
| **VRP, FX**: ln(iv30 / (σ_day·√252)), iv30 from the same CME files (the `bias-learner` `fxivrv` column) | `iv_daily_*` | the 6 FX pairs above | **2020-09-08 → 2026-08-20** | **scored** |
| **VRP, gold and indices**: ln(IV / (σ_day·√252·100)), IV = Cboe GVZ / VXN / VIX / VXD close dated before d (the `bias-learner` `ivrv` column) | `analysis/surfaces/cboe/` | GOLD; NAS100, SPX500, US30 | 2016 → (whole panel) | **scored, alone only** (already a learner reading; no incremental cell) |
| **Month-end flow estimate** (US vs European equity month-to-date) | M1 `portfolioBacktest/cache/{spx500,de30,uk100}_m1.parquet`, NY-close daily closes | 7 USD pairs (EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF); FX only | whole panel (from the first month with all three closes) | **scored** |

**Point-in-time rules (data-rules item 4).**
- **Book.** The 07:00 UTC snapshot equals 07:00 London in winter and is 08:00 London (after entry) in summer, so session
  d uses only the latest snapshot whose **UTC date is before London date d** (the previous weekday's 07:00 UTC book,
  ≥ 23 hours old at entry). Crowd = near-spot long share, % (buckets within ±10% of the snapshot price, summed
  long/short count shares; exactly `js/positionBookMetrics.js`, the live definition). Readings, in pair terms, signed
  **contrarian** (+ = retail short-crowded):
  `bk_lvl` = −(crowd − mean)/SD over the previous 250 snapshots (min 120; snapshots before the one used);
  `bk_chg` = −(crowd_now − crowd 5 snapshots earlier) (percentage points).
- **RR.** The settlement dated before d (`date < d`, as the learner's `fxivrv`). CME settles are published after
  ~00:00 CT (≈ 06:00 London), before entry. `rr_lvl` = rr25_30 (vol, pair terms); `rr_chg` = rr25_30 − the value 5
  settlements earlier.
- **VRP.** As the learner's `fxivrv` / `ivrv` (IV dated before d; σ_day = SD of the last 20 NY-close log returns, known
  at the last completed D1). d_i = the learner's sign of the pair's move for a USD rise (`INSTRUMENTS` column 6: −1
  EURUSD, GBPUSD, AUDUSD, NZDUSD; +1 USDJPY, USDCAD, USDCHF). FX VRP is oriented to the USD side:
  **`vrp_fx` = fxivrv × d_i**, so a positive slope reads "high FX VRP → USD up". Gold / indices: **`vrp` = ivrv** (a
  positive slope reads "high premium → up").
- **Month-end.** NY-close (17:00 New York) daily closes built from M1 for SPX500, DE30, UK100. For session d,
  MTD_x = ln(last NY close completed before 07:00 London on d / last NY close of the previous calendar month), local
  currency. rel = MTD_SPX − ½(MTD_DE30 + MTD_UK100). USD flow = −rel (US outperformance → USD selling).
  **`me` = (−rel) × d_i** (+ = the flow pushes the pair up). **Active only in the month-end window: the last 3
  weekdays of each calendar month** (weekday calendar, not observed sessions, so no holiday lookahead). Rows outside
  the window are not in the month-end cells.

### 3.3 Models (frozen)

For a cell = (input, group, horizon), rows = instruments of the group that carry the input, sessions where the label,
B0 and the input are defined (and, for incremental cells, every learner reading that exists for that group).

- **Alone**: logit P(up) = logit(B0) + Σ_k w_k z_k over the input's readings (book: `bk_lvl`, `bk_chg`; RR: `rr_lvl`,
  `rr_chg`; VRP: `vrp`; month-end: `me`), pooled slopes across the cell's instruments, no instrument effects (those are
  B0's job). z = standardised with the **training fold's** mean and SD.
- **Incremental**: base = logit(B0) + the `bias-learner`'s 13 readings that exist for the group (FX: all except `ivrv`;
  gold/indices: all except `carry`; `surp` 0 for JPY crosses), pooled slopes; full = base + the input's readings.
  Statistic **ΔBSS = BSS_B0(full) − BSS_B0(base)** on identical rows.
- Penalty: L2 (`fit_logit`, sklearn's C), C ∈ {1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1}, chosen **inside
  the training years only**: inner validation = the last up to 2 training years, each predicted by a fit on the
  training rows realised before it (needs ≥ 300 training and ≥ 150 validation rows); score = mean of monthly mean
  Brier; ties → smaller C; no inner fold → C = 1e-3. Base and full choose C separately.
- **Walk-forward**, expanding by calendar year with the purge (a training row's label must be realised before the
  first session of the test year). Test years: **book 2019–2026**; **RR and FX VRP 2022–2026** (inputs start
  2020-09-08); **gold/index VRP and month-end 2018–2026**. The last fold ends at 2026-08-21. Halves for G3 = test
  dates split at the median test date of the cell.

### 3.4 Scored cells

| Input | Group (instruments) | Alone h=0, h=5 | Incremental h=0, h=5 |
|---|---|---|---|
| book | fx (EURUSD, GBPUSD, USDJPY) | ✓ ✓ | ✓ ✓ |
| book | gold | ✓ ✓ | ✓ ✓ |
| rr | fx (6 pairs) | ✓ ✓ | ✓ ✓ |
| rr | idx (NAS100) | ✓ ✓ | ✓ ✓ |
| vrp | fx (6 pairs) | ✓ ✓ | ✓ ✓ |
| vrp | gold | ✓ ✓ | — (already the learner's `ivrv`) |
| vrp | idx (NAS100, SPX500, US30) | ✓ ✓ | — (same) |
| monthend | fx (7 USD pairs; window rows only) | ✓ ✓ | ✓ ✓ |

**28 scored cells** (16 alone + 12 incremental). Forward-record cells (not scored, UNDERPOWERED by design): book on the
other 12 instruments; IBKR RR (gold, ES, NQ, FX; 1w/1m/3m).

### 3.5 Metrics

- **Alone**: BSS_B0 = 1 − Σ(p − y)² / Σ(B0 − y)², pooled over the cell's OOS rows. **Incremental**: ΔBSS (§3.3).
- Descriptive: hit rate of sign(p − B0) on rows with |p − B0| > 0; recalibration slope b of
  logit P(y) = logit(B0) + a + b·(logit p − logit B0) (lesson #18); per-year and per-instrument values; slope path per
  fold.

### 3.6 Uncertainty, noise threshold, p-values

- **Bootstrap**: per test date, sum the cell's squared errors (model, base or B0) over its instruments; moving-block
  bootstrap of dates, block 21, B = 2000, seed 20261115 → 95% percentile CI and SE.
- **Placebo (noise threshold)**: permute 21-date blocks of the cell's input readings along its date axis (all
  instruments of a date move together; each block keeps its internal order), keeping targets, B0 and the learner
  readings in place; a source row with no reading for that instrument gets z = 0. Refit the entire walk-forward
  including the C choice. **200 refits per cell.**
- **p** = two-sided normal from z = est / max(bootstrap SE, placebo SD) (approximation, stated).
- **Holm at α = 0.05 over the 28 cells.**

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| a | Book, fx / gold: does contrarian retail positioning beat B0 at 21:00 or +5? | **NULL or UNDERPOWERED.** Retail is ~60% long every day (`squeeze-fuel`); deviations from its own mean are small and slow; 3 pairs ≈ 1.5 independent forecasts |
| b | RR, fx / NAS100 | **Underpowered.** 4 test years; RR level is mostly a slow crash-premium; any change effect is likely same-day (already in price) |
| c | VRP, fx | **Null/underpowered**: VRP is direction-free for a symmetric pair; the USD-haven orientation is a guess |
| d | VRP, gold / indices | **Small positive at +5 on indices** at best (the premium is paid over weeks), probably below U |
| e | Month-end, fx | **Underpowered**: ~3 sessions a month ≈ 300 window dates; the published flow models are crowded |
| f | Incremental over the learner | **No** for every input (expected ΔBSS ≈ 0; the learner's readings are not correlated with these inputs, so ΔBSS ≈ alone minus a little overfit cost) |

**THE GATE** per cell:
- **G1** est 95% CI lower > 0 **and** Holm-adjusted p < 0.05 (28 cells);
- **G2** est above the **95th percentile** of the 200-refit placebo;
- **G3** est > 0 in both halves;
- **G4** sign stability: the slope of the input's leading reading (largest mean |w| over folds) has the same sign in
  ≥ 75% of folds (alone: in the alone model; incremental: in the full model).

**THE MIRROR**: the placebo (G2) is the mirror (same reading distribution, link to the date broken). The sign mirror is
built in (P(down) = 1 − P(up)).

| Result | Word |
|---|---|
| G1–G4 all hold | `VALIDATED` (research-only; a live direction line needs |z| ≥ 3 or a forward record) |
| G1 and G2 hold, G3 or G4 fails | `CONTEXT` (real but unstable) |
| G1 or G2 fails, cell POWERED (§5) and est 95% CI upper < U | `NULL` |
| otherwise | `UNDERPOWERED` |

**Word per input** (suggested ledger entry): VALIDATED if any of its cells is; else CONTEXT if any; else NULL if every
scored cell is NULL; else UNDERPOWERED. Forward-record inputs: UNDERPOWERED by design.

## 5. Power — what this design can and cannot find (required)

POWER_TABLE_PLACEHOLDER — filled by a PRE-RESULTS amendment before any target is read. Rules fixed now:
`scripts/positioning-flow-inputs/run.py --power` takes each cell's **real rows and real readings** (and, for
incremental cells, the real learner readings) and replaces the labels with synthetic ones:
y = 1{a·s + e > 0}, e ~ N(0,1), s = the cell's standardised leading composite (mean of its readings' full-sample z,
re-standardised; full-sample is allowed here because the labels are synthetic), a set so that the daily IC
corr(s, 2y − 1) = IC (a/√(1+a²) = IC·√(π/2)); B0 = 0.5 offset. 16 draws at IC 0 (null SD) and 16 at IC 0.08, through
the exact §3.3 walk-forward. **U (useful effect)** = mean recovered statistic at IC 0.08 (≈ 1.3 pp of hit rate, the
`bias-learner` U). **SD_null** = SD across the IC-0 draws. **MDE** = (3.12 + 0.84) × SD_null (Holm first step,
0.05/28 two-sided). A cell is **POWERED** when MDE ≤ U. Synthetic labels are independent day to day, so the +5 SD is
understated; the real run's SE floor (placebo SD) covers the overlap.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored: 28 cells** (§3.4), Holm α = 0.05. G2–G4 conjunctive on top.
- **Variants (all logged here, nothing added later)**: alone and incremental per cell; the base model alone is reported
  (it is the `bias-learner` restricted to the cell's rows, a check that it is ≈ 0 as banked); the placebo; the power
  simulation; the evidence pack per cell.
- **Disaggregation (descriptive, BH q = 0.10)**: per instrument × horizon for the alone cells; per year. Survivors are
  candidates for their own prereg, never a result.
- **Descriptive only**: each reading on its own inside a two-reading block (book level vs change; RR level vs
  change); hit rates; calibration slope; the book cross-check against the server's daily rows (2019-09 → 2026-08)
  — correlation of the two crowd series, reported.

## 7. What this does NOT test (required)

- Range or volatility (the VRP and month-end **range** results stand untouched). Direction only.
- Tradability (no R, no costs); a pass is a probability-forecast claim.
- Intraday book changes (only the previous day's 07:00 UTC snapshot), order books (position books only), other
  tenors (RR 30-day only; no 1w/3m before the lockbox), gold RR, COT (already a learner reading).
- Any session after 2026-08-21; the forward-record inputs (no pre-lockbox history).

## 8. What each verdict changes (required)

- **VALIDATED** → research-only: the input becomes a candidate line on the desk bias card beside B0, and a candidate
  reading for a re-run learner (own prereg); nothing live changes until the owner chooses.
- **CONTEXT** → the card may name the input as an unstable tilt; no direction line.
- **NULL** → the card and the brief must not use the input as a direction lean (book: "retail positioning is context,
  not a call"; RR/VRP: "skew and premium are vol information"; month-end: "a range note, not a side").
- **UNDERPOWERED** → keep the forward record (the book recorder, the IBKR skew pull, the CME IV archive); re-test when a
  longer history exists (book: the 12 other instruments; RR: pre-2020 settlement chains if ever pulled).

## 9. Method lessons applied

- **#1 positive control**: the `--selftest` plants a known signal on a synthetic panel through the exact cell scorer
  (must be recovered; IC 0 must not be flagged); the evidence pack plants a bar-sized drift on the real rows.
- **#4 name the edge source** (§1). **#5 linear baseline first**: offset logistic, B0 and the learner base are the
  yardsticks; no non-linear arm. **#11** overlapping +5 targets: date-block bootstrap and block placebo, never rows as
  independent. **#14** every standardisation and rolling statistic is point-in-time (training fold / trailing window).
  **#18** calibration slope reported. **#25** buckets by decile of the lean in the evidence pack.
- stats-defaults 2026-11-04 / 2026-11-07: whole-cluster shuffles, many of them, a percentile gate registered up front,
  SE floored by the shuffle SD. 2026-10-21: the MDE comes from the exact shrunk pipeline, not an IC formula.

## 10. Data the run needs

- The `bias-learner` M1 set (its §10) and its feature store / COT / Cboe / event inputs (the panel is rebuilt with its
  own code, then cached at `analysis/output/positioning-flow-inputs/cache/`, not committed).
- `backfill/books_daily.ndjson` (gitignored, 120 MB); `oi_research_book/data/iv_daily_*.parquet`;
  `portfolioBacktest/cache/{spx500,de30,uk100}_m1.parquet`.
- The server's `/api/oanda-book/history?instrument=…` (read-only GET) for the cross-check only.

## Amendments

### A1 — 2026-11-15 — PRE-RESULTS

**§5 power table**, from `scripts/positioning-flow-inputs/run.py --power` (seed 20261115; output
`scripts/positioning-flow-inputs/power_table.json`, log `analysis/output/positioning-flow-inputs/cache/power.log`).
Real cell rows and real readings, synthetic labels only (the target columns were placeholders; no outcome was read),
B0 = 0.5, 16 draws at IC 0 and 16 at IC 0.08, through the exact §3.3 walk-forward. Depth measured by `--depth` matches
§3.2 (book 2,379 pre-lockbox snapshots per instrument; CME IV 1,500 settlements per FX pair, 1,497 NAS100; SPX500,
DE30, UK100 M1 from 2016-01-04). The book crowd series was checked against the server's daily rows
(`/api/oanda-book/history`, 1,771 overlapping days per instrument, 2019-09-09 → lockbox): correlation ≥ 0.9996, mean
absolute difference 0.025 pp (rounding) — `analysis/output/positioning-flow-inputs/book_crosscheck.json`.

**One rule added (conservative, changes POWERED only, never a pass bar):** the simulation's labels are independent
across instruments and days, which understates the null SD (FX labels correlate ≈ 0.47, indices ≈ 0.85; +5 labels
overlap). SD_null is therefore inflated by √(1 + (k − 1)ρ) for the k instruments of the group (ρ: fx 0.47, idx 0.85,
gold 0) and by √h for h = 5, before MDE = (3.12 + 0.84) × SD_null. U is unchanged. (The raw +5 draws equal the 21:00
draws because the synthetic labels are drawn per row, not per horizon; the √5 is what separates them.) Code:
`adjust_power` in `run.py`. The NULL word still needs the **real** CI upper < U, so this rule can only move a cell
from NULL to UNDERPOWERED, never the other way.

| Cell | rows (dates), train+test | null mean | SD raw / inflation / SD | MDE (Holm first) | U (IC 0.08) | Power |
|---|---|---|---|---|---|---|
| `book|fx|alone|21:00` | 6921 (2307) | -0.030% | 0.056% / x1.39 / 0.078% | 0.311% | +0.408% | POWERED |
| `book|fx|incr|21:00` | 6864 (2289) | +0.002% | 0.017% / x1.39 / 0.023% | 0.092% | +0.245% | POWERED |
| `book|gold|alone|21:00` | 2297 (2297) | -0.081% | 0.083% / x1.00 / 0.083% | 0.327% | +0.375% | POWERED |
| `book|gold|incr|21:00` | 2275 (2275) | -0.017% | 0.148% / x1.00 / 0.148% | 0.588% | +0.246% | UNDERPOWERED |
| `rr|fx|alone|21:00` | 9274 (1546) | -0.024% | 0.028% / x1.83 / 0.051% | 0.201% | +0.479% | POWERED |
| `rr|fx|incr|21:00` | 9200 (1536) | -0.003% | 0.048% / x1.83 / 0.087% | 0.346% | +0.278% | UNDERPOWERED |
| `rr|idx|alone|21:00` | 1542 (1542) | -0.050% | 0.171% / x1.00 / 0.171% | 0.678% | -0.020% | UNDERPOWERED |
| `rr|idx|incr|21:00` | 1526 (1526) | +0.031% | 0.315% / x1.00 / 0.315% | 1.249% | +0.001% | UNDERPOWERED |
| `vrp|fx|alone|21:00` | 9306 (1551) | -0.011% | 0.014% / x1.83 / 0.025% | 0.101% | +0.614% | POWERED |
| `vrp|fx|incr|21:00` | 9232 (1541) | +0.013% | 0.047% / x1.83 / 0.085% | 0.338% | +0.445% | POWERED |
| `vrp|gold|alone|21:00` | 2740 (2740) | -0.043% | 0.064% / x1.00 / 0.064% | 0.253% | +0.559% | POWERED |
| `vrp|idx|alone|21:00` | 8229 (2743) | -0.014% | 0.030% / x1.64 / 0.049% | 0.193% | +0.578% | POWERED |
| `monthend|fx|alone|21:00` | 2646 (378) | -0.036% | 0.071% / x1.95 / 0.138% | 0.546% | +0.559% | POWERED |
| `monthend|fx|incr|21:00` | 2527 (362) | +0.018% | 0.096% / x1.95 / 0.188% | 0.744% | +0.202% | UNDERPOWERED |
| `book|fx|alone|+5` | 6921 (2307) | -0.030% | 0.056% / x3.11 / 0.175% | 0.695% | +0.408% | UNDERPOWERED |
| `book|fx|incr|+5` | 6864 (2289) | +0.002% | 0.017% / x3.11 / 0.052% | 0.205% | +0.245% | POWERED |
| `book|gold|alone|+5` | 2297 (2297) | -0.081% | 0.083% / x2.24 / 0.185% | 0.731% | +0.375% | UNDERPOWERED |
| `book|gold|incr|+5` | 2275 (2275) | -0.017% | 0.148% / x2.24 / 0.332% | 1.315% | +0.246% | UNDERPOWERED |
| `rr|fx|alone|+5` | 9274 (1546) | -0.024% | 0.028% / x4.09 / 0.113% | 0.449% | +0.479% | POWERED |
| `rr|fx|incr|+5` | 9200 (1536) | -0.003% | 0.048% / x4.09 / 0.195% | 0.773% | +0.278% | UNDERPOWERED |
| `rr|idx|alone|+5` | 1542 (1542) | -0.050% | 0.171% / x2.24 / 0.383% | 1.516% | -0.020% | UNDERPOWERED |
| `rr|idx|incr|+5` | 1526 (1526) | +0.031% | 0.315% / x2.24 / 0.705% | 2.792% | +0.001% | UNDERPOWERED |
| `vrp|fx|alone|+5` | 9306 (1551) | -0.011% | 0.014% / x4.09 / 0.057% | 0.225% | +0.614% | POWERED |
| `vrp|fx|incr|+5` | 9232 (1541) | +0.013% | 0.047% / x4.09 / 0.191% | 0.756% | +0.445% | UNDERPOWERED |
| `vrp|gold|alone|+5` | 2740 (2740) | -0.043% | 0.064% / x2.24 / 0.143% | 0.566% | +0.559% | UNDERPOWERED |
| `vrp|idx|alone|+5` | 8229 (2743) | -0.014% | 0.030% / x3.67 / 0.109% | 0.431% | +0.578% | POWERED |
| `monthend|fx|alone|+5` | 2646 (378) | -0.036% | 0.071% / x4.37 / 0.308% | 1.221% | +0.559% | UNDERPOWERED |
| `monthend|fx|incr|+5` | 2527 (362) | +0.018% | 0.096% / x4.37 / 0.420% | 1.665% | +0.202% | UNDERPOWERED |

Readings: **13 of 28 cells are POWERED** (mostly 21:00 alone cells). NAS100 RR (one instrument, ~4 test years) cannot
recover a planted IC 0.08 at all (U ≈ 0: the inner C rule shrinks it to B0), so both RR-index cells are
UNDERPOWERED by design. Every +5 incremental cell except the book's is UNDERPOWERED. The selftest (synthetic panel,
exact cell scorer) passed on 2026-11-15: planted IC 0.15 recovered (alone +2.35% BSS, CI lower +1.60%, placebo 95th
+0.04%; incremental +2.23%), IC 0 not flagged (alone −0.09%, incremental −0.03%).

### A2 — 2026-11-15 — POST-HOC (results seen)

Demotion only. `monthend|fx|alone|21:00` met the registered NULL rule (POWERED by A1, CI upper +0.417% < U +0.559%),
but its evidence pack (planted bar-sized drift on the real rows) found the plant in 0% of draws, so A1's POWERED label
was optimistic for this cell; it is banked UNDERPOWERED. Every other NULL cell's pack found the plant in 100% of draws.
Nothing is promoted; the per-input words are unchanged (all UNDERPOWERED).

## RESULTS — run 2026-11-15

All four inputs **UNDERPOWERED** by the per-input rule; no cell passes G1 (every Holm p = 1.00). 10 of 28 cells NULL,
including every powered FX 21:00 cell (book alone and incremental, RR alone, FX VRP alone and incremental). Details:
`analysis/output/positioning-flow-inputs/RESULTS.md`.

*Written to `analysis/output/positioning-flow-inputs/RESULTS.md` and `results.json` (seed 20261115). Nothing above
this line changes after the run, except dated amendments.*
