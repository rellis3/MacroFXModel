# bias-scoreboard — whose morning bias beats the shared public base on the same rows?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `bias-scoreboard` (one entry; the four scored forecasters are cells inside it, listed in §6) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bias-scoreboard` |
| Data | **Forward only.** OANDA M1 mid (anchor/end prices), OANDA D mid (17:00 New York) for σ; desk book (`desk_run_elig_<date>`), Signal Copier records (`signal_copier_signals`), surprise store (`econ_surprise_v1`) + ForexFactory week calendar. Rows from the first London weekday after the build deploys; nothing back-issued. B0 frozen from M1 history 2016-01-04 → **2026-08-21** (lockbox respected: no lockbox session is used to fit anything; the forward record after deploy is the purpose of the study, as for the `direction-bar` ledger) |
| Seed | `20261114` (every script and every placebo / bootstrap in this study) |
| Uncertainty | day-cluster block bootstrap (all instruments of a day resampled together), block = 5 London weekdays, B = 2,000; `d5` target block = 10 |
| Scripts / outputs | `scripts/bias-scoreboard/` → `analysis/output/bias-scoreboard/` |
| Harness | own code: the live recorder in `server.js` + `js/directionLedger.js` (same-day row type) and `js/biasForecasters.js`; judgement by `scripts/bias-scoreboard/score.mjs`. `runStudy.mjs` does not do forward ledgers |
| Agenda | `.claude/skills/research-director/agendas/daily-bias.md` Q4 (scoreboard) and Q5 (abstention) |

Method lessons applied (`education/RESEARCH_METHOD_LESSONS.md`): #1 positive control from outside the pipeline
(§3.9); #4 edge source named (§1); #11 horizon-matched, non-overlapping primary target (`d21` is one non-overlapping
window per day; overlapping `d5` is descriptive with a 10-day block).

## 1. The claim

Daily-bias agenda Q4: "Every morning, record each forecaster's side and conviction per instrument, then score them all
07:00→21:00 and to the next morning against B0, with 'no view' allowed." Q5: "drop the weakest 30/50/70% of days by
conviction; do hit rate and R on the kept days rise above B0 by more than shuffled drops?"

The claim per forecaster: **on the rows where it speaks, its P(up) scores better than the shared base rate B0 on the
same window.** Edge source, if any: forecasting skill (information processing of public macro/news) and, for Max,
selection (abstention). No risk premium is claimed (same-day horizon). Who is on the other side: nobody in particular;
this is measurement.

## 2. Why it is not already settled

- `direction-bar` (CONTEXT) built the close-to-close ledger (17:00 NY, h = 1/5/20/60). A morning forecaster that has
  seen the Asia session cannot be scored on close[t]→close[t+1] without lookahead; its A2 left "positioning into
  release" unregistered for lack of a same-day row type. This study adds that row type. It does not re-score any ledger
  model.
- `forge/DESK_ANALYST_PIPELINE_PREREG.md` (desk-score, interim, not judged) scores the same desk book 08:00→21:00 as a
  size-weighted σ-unit return against chance. This study asks a different question: probability skill against B0 with
  abstention, on a shared row set with other forecasters. The two are not independent evidence about the desk and
  must not be counted as two passes (§6).
- Max Cole: our Signal Copier outcome record (+8.3R / 122 fills) scores his trades with his stops; it never scores his
  *side* as a forecast against a base rate, and is dominated by a few swings. No Evidence Book entry scores it.
- Surprise rule: `rate-surprise-eurusd` / `-nq` UNDERPOWERED were post-release windows; `post-release-drift-pooled`
  (claimed, Q2) tests history. This is the forward record of a carried rule, not a re-run of either.
- FundaBias: no history held (agenda "Parked").

## 3. Definitions, fixed in advance

### 3.1 The row type: `sameday`

A row = (London date `D`, instrument, target, model_id). `D` is a London weekday on which the instrument has M1 bars
between 07:00 and 21:00 London. Times are Europe/London wall clock (BST/GMT handled by the zone, never by a UTC offset).

| target | anchor price | end price | y |
|---|---|---|---|
| `d21` (**primary**) | mid at the row's anchor time `A` (below) | mid at 21:00 London on `D` | 1 if end > anchor |
| `n07` | same | mid at 07:00 London on the next London weekday (Fri → Mon) | same |
| `d5` | same | mid at 07:00 London on the 5th London weekday after `D` | same |

- **Mid at time T** = close of the last OANDA M1 mid bar whose start is in [T − 5 min, T). None in that span → the row is
  `unresolved` (reason recorded, counted, reported; never silently dropped, never imputed).
- **Anchor time A (fairness rule).** A = max(07:00 London, the forecaster's own knowable time, rounded up to the next
  whole minute). The knowable time is: B0 and surprise-rule 07:00; desk = the eligible run's `finishedAt`; Max = the
  Telegram `posted_ts` of the signal used. A forecaster is never scored on a move it could already see. **B0 is scored on
  every forecaster's row at that row's own anchor** (B0's p is constant, so its score is recomputed on the same y), so
  "vs B0" is always on identical outcomes. Head-to-head comparisons between two forecasters use the later of the two
  anchors for both.
- **Late cut-off.** A view whose knowable time is after 16:00 London is not a `d21` row for `D` (recorded as `late`,
  descriptive only). The desk view must be the eligible book (finished before 08:00, desk-score §3); no eligible book →
  no desk rows that day.
- **σ (point-in-time).** σ_day = sample SD of the last 60 daily log returns of OANDA D mid candles (17:00 New York
  close), complete candles only, the last one the NY close before 07:00 London on `D` (data-rules item 2: NY-close bars,
  n ≥ 60; fewer → σ null and the row's R is null, its probability score still counts).
- **R at fixed σ risk** (speaking rows only) = side × ln(end/anchor) / σ_h, σ_h = σ_day for `d21` and `n07`,
  σ_day·√5 for `d5`. No stops, no costs in R; the cost in σ units (`analysis/output/cost-verification/cost_table.json`
  spread / (σ_day·price)) is reported beside it.

### 3.2 Instruments

- **Core six (scored):** NQ `NAS100_USD`, ES `SPX500_USD`, gold `XAU_USD`, EURUSD, GBPUSD, USDJPY (the ledger's six).
- **Extended (descriptive, BH):** US30 `US30_USD`, AUDUSD, NZDUSD, USDCAD, USDCHF, GBPJPY, EURJPY. All are in the live
  vol registry with OANDA NY-close σ (data-rules `instruments.md`); these are the markets Max and the desk cover.
- **Not covered:** silver, oil, GER40/DE30, UK100 (Max posts them rarely; not added now), crypto (ignored by the copier).
- Max symbol map: NAS100→NQ, SP500→ES, XAUUSD→gold, US30→US30, FX names as-is (after `parser.canonical`).

### 3.3 Forecasters (model_id, version `-v1`, mapping frozen here, never refitted)

`p0` = B0's p_up for that instrument and target. A forecaster that does not speak writes a row with `speaks: false`,
`p_up = p0`, `decision: NO-TRADE` (so coverage is in the record). Speaking rows: p_up = clip(p0 + side·s, 0.01, 0.99).

| model_id | Speaks when | side | shift s |
|---|---|---|---|
| `B0` | always | none (NO-TRADE) | 0: p_up = p0 = share of up windows for that instrument × target, London weekdays 2016-01-04 → 2026-08-21, from M1 (`scripts/bias-scoreboard/b0.py`, frozen to `js/biasScoreboardBaselines.json`, version `b0-sameday-20260821`). If the M1 cache is unavailable at build, p0 = 0.5 and version `b0-coin`; the version is in every record |
| `desk-rating` | eligible book card for the instrument rated LONG/STRONG_LONG (+1) or SHORT/STRONG_SHORT (−1). FLAT = no view. Size 0 still speaks (size recorded) | rating sign | conviction low 0.02, medium 0.04, high 0.06 (missing conviction = medium); STRONG_ adds 0.02; cap 0.08 |
| `desk-ccy` | FX pairs whose two legs are in the desk's eight-currency bias (−2..+2); score = bias[base] − bias[quote] ≠ 0. Indices and gold: no view | sign(score) | 0.015 × \|score\| (max 0.06) |
| `max-signals` | the **first** Signal Copier record of `D` for the instrument (market, limit or stop alike) with `posted_ts` in [22:00 UK on the previous weekday, 16:00 London on `D`] | BUY +1 / SELL −1 | 0.05 for every style; style (swing / day / single) is a flag. A later opposite-side signal the same day → flag `conflict`, the first still stands. Cancels/closes change nothing |
| `surprise-rule` | see §3.4 | USD sign map | 0.03 if 0.5 ≤ \|z\| < 1, 0.05 if \|z\| ≥ 1 |
| `fundabias` | **disabled**: writes no rows until the owner confirms its terms allow storing readings; enabling it is a PRE-RESULTS amendment before its first row, with its own 60/120-day clock (mapping then: score 1–10 → s = 0.01 × (score − 5), sign from its direction, cap 0.06) | | |

Max's paid content: a row stores **instrument, side, posted time, style only**. Never message text, entry, stop, target,
lot or signal id.

### 3.4 surprise-rule, precisely

- **Tier-1 US releases:** Non-Farm Employment Change; CPI m/m and Core CPI m/m; PPI m/m and Core PPI m/m; Federal Funds
  Rate (FOMC). Matched by `seriesKey` in `js/econSurprise.js` on the store `econ_surprise_v1` (actual and consensus as
  first printed in the ForexFactory feed; nothing revised).
- **z** of a release = (actual − consensus) / SD of that series' own previous surprises (≥ 6 prior, `surpriseReader.surprise`),
  times `polarityFor(event)` so that +z = USD-positive. When CPI and Core CPI (or PPI pair) print together, the core
  print's z is used. Fewer than 6 prior or no consensus → z unknown.
- **State at 07:00 London on `D`:** take the most recent tier-1 US release with release time < 07:00 London on `D`.
  Speak if its \|z\| ≥ 0.5; otherwise (in line, FOMC with no numeric surprise, z unknown) no view.
- **Carry and flat:** the state is carried day to day until the next tier-1 release replaces it. **On any London date
  with a tier-1 US release scheduled (calendar as known at 07:00), no view** (Max: "flat before data"). No age cap.
- **USD sign map:** USDJPY, USDCAD, USDCHF +side; EURUSD, GBPUSD, AUDUSD, NZDUSD, gold −side; NQ, ES, US30, GBPJPY,
  EURJPY no view.
- **Events:** rows driven by one release share `event_key = <release key>`; judged on events as well as rows.

### 3.5 Scoring

Per speaking row: Brier, log score, B0's Brier and log score on the same y, hit (side matches y), R.
- **Primary statistic per forecaster:** mean log-score difference (forecaster − B0) over its speaking rows, `d21`, core
  six pooled. For a fixed shift s around p0 ≈ 0.5 this is positive iff the hit rate exceeds ≈ 0.5 + s/2: it rewards
  direction and penalises overconfidence.
- Co-reported: Brier skill vs B0, coverage (speaking rows / eligible rows), hit rate when speaking, mean R and R net of
  cost, events, per-instrument cells, `n07` and `d5`, extended instruments, style and conviction buckets.
- **Coin control (noise threshold, agenda Q4):** 2,000 random-sign versions of each forecaster keeping its exact rows,
  coverage and shift sizes (seed 20261114). The real statistic's percentile in that distribution is reported.
- **Abstention (Q5):** rank a forecaster's speaking rows by conviction (desk-rating: s; desk-ccy: \|score\|;
  surprise-rule: \|z\|; max-signals: swing > day > single, descriptive only), ties broken by seeded random order; drop
  the weakest 30/50/70%. Compare hit rate and mean R on the kept rows with 2,000 random drops at the same rate.

### 3.6 Shared trading days and judgement points

- **Shared day** = a London weekday with a `base` issue file (B0 written on time) and a resolved `d21` outcome.
  Desk-less or Max-less days are still shared days; those forecasters simply have coverage 0 that day.
- **Look 1 at the 60th shared day** (≈ February 2027); **look 2 at the 120th** (≈ May 2027). Judged by
  `score.mjs` on the files as they stand; nothing re-issued.

### 3.7 Sample split

Halves for the stability gate at look 2: shared days 1–60 and 61–120.

### 3.8 Missing data

Missed issue windows are gaps (no back-issue). Unresolved rows are counted per forecaster and reported; if more than
10% of a forecaster's speaking rows are unresolved at a look, its verdict at that look is `UNDERPOWERED` regardless of
the score. A source down at issue time (desk, store, copier) writes `external_status` and no rows for that model.

### 3.9 Positive control (build gate, before the first live row)

On synthetic M1 paths with a planted forecaster of known hit rate 0.65 and coverage 0.5, `score.mjs` must recover the
hit rate within its CI and give log-score difference > 0; B0 against itself must give exactly 0; a random-sign
forecaster must give coin-control percentiles that are uniform (KS p > 0.05 over 200 replications).

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `desk-rating` beats B0 on `d21` (log-score) | **Null** (desk-score interim S −0.25 over 5 days) |
| b | `desk-ccy` beats B0 on `d21` | **Null** |
| c | `max-signals` beats B0 on `d21` | **Null at this power**; if anything, positive on day-style rows |
| d | `surprise-rule` beats B0 on `d21` | **Null** (event-limited; Q2 literature says the jump is immediate) |
| e | Q5: dropping the weakest 50% raises kept-row mean R above random drops | **No** for desk; untestable for Max (two-level ranking) |
| | **THE GATE** | per forecaster: §6 boundary crossed after Holm, coin-control percentile ≥ 97.5, and (look 2 only) log-score difference > 0 in both halves |
| | **THE MIRROR** | the same forecaster with sides flipped is scored for free (−side); a forecaster whose flip passes is reported as **harmful**, verdict `NULL` |

## 5. Power

Effective independent observations per day across the core six ≈ 2.1 (data-rules item 7), scaled by coverage c.
Hit-rate MDE = 2.8 × 0.5 / √(days × 2.1 × c) (80% power, two-sided 5%). Pass bar = **+6 pp** of hit rate over B0
(≈ 0.13σ, `direction-bar` Phase 0 one-day bar). Coverage is an assumption, re-stated from the record at look 1 as a
PRE-RESULTS amendment if it differs by more than half.

| Cell (`d21`, core six) | assumed c | n_eff at 60 / 120 days | MDE at 60 | MDE at 120 | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| desk-rating | 0.6 | 76 / 151 | 16 pp | 11 pp | 6 pp | UNDERPOWERED by design (needs ≈ 430 days) |
| desk-ccy (3 FX pairs, ≈1.2 eff./day) | 0.8 | 58 / 115 | 18 pp | 13 pp | 6 pp | UNDERPOWERED by design |
| max-signals | 0.25 | 32 / 63 | 25 pp | 18 pp | 6 pp | UNDERPOWERED by design |
| surprise-rule (≈ 8 events / 60 days) | events | ≈ 12 / 24 | ≈ 40 pp | ≈ 29 pp | 6 pp | UNDERPOWERED by design |
| Q5 50% drop, any forecaster | half of above | — | > 22 pp | > 16 pp | 6 pp | UNDERPOWERED by design |

So this record can only find a **large** edge (or a large harm) by 120 days. That is accepted: it is a measuring
instrument that starts now; a verdict of `UNDERPOWERED` at 120 days is the expected outcome and the record keeps
running for a later `bias-scoreboard-confirm` prereg.

## 6. Multiplicity

- **Scored cells:** four — `desk-rating`, `desk-ccy`, `max-signals`, `surprise-rule`, each on its primary statistic
  (`d21`, core six pooled). B0 is the reference, not a cell. `fundabias` adds a fifth only by amendment.
- **Two looks:** O'Brien–Fleming boundaries for two equal looks at α = 0.05 two-sided: \|z\| ≥ 2.797 at look 1,
  \|z\| ≥ 1.977 at look 2, z from the bootstrap SE (`pFromCI`). **Holm** across the four cells applied to the nominal
  α of each look (0.0052 at look 1, 0.048 at look 2).
- `desk-rating` and `desk-ccy` read the same book: if both pass, they count as **one** desk pass in the Evidence Book.
  Neither counts alongside desk-score as independent evidence.
- **Disaggregation** (per instrument, `n07`, `d5`, extended instruments, styles, conviction buckets, Q5 drops at
  30/50/70%, head-to-head pairs): BH q = 0.10 with `chanceBaseline`; survivors are candidates for their own prereg.
- **Promotion to anything live** (sizing, the morning card's direction output, stacking weights): \|t\| ≥ 3 on the
  scored cell.

## 7. What this does NOT test

- Tradability: no stops, entries or costs in the score (R net of spread is descriptive). A pass is not a strategy.
- Max's own fills or his stop placement (that is the Signal Copier outcome record).
- Why a forecaster is right (cause); FundaBias at all until enabled.
- Close-to-close horizons (the existing ledger) and intraday paths before 21:00.
- Range / day type (agenda Q1, `day-type-expansion`).

## 8. What each verdict changes

| Look | Verdict word, per forecaster | Meaning and consequence |
|---|---|---|
| 60 | `VALIDATED` (interim) | crossed the look-1 boundary after Holm, coin percentile ≥ 97.5 → banked research-only; enters the stacking candidate list; still recorded to look 2 |
| 60 | `NULL` (harm) | its mirror crosses the look-1 boundary → banked; the morning card stops quoting it as a direction; recording continues |
| 60 | none (interim) | otherwise: no word banked; interim table shown, labelled "interim, not judged" |
| 120 | `VALIDATED` | look-2 boundary after Holm, coin ≥ 97.5, positive in both halves → research-only until \|t\| ≥ 3; first input of the stacked direction output |
| 120 | `NULL` | upper 95% bound of hit-rate excess < +6 pp (or mirror passes) → "nobody's daily call is worth copying" holds for that forecaster |
| 120 | `UNDERPOWERED` | CI spans 0 and +6 pp, or > 10% unresolved → record continues; days needed for MDE 6 pp stated |
| 120 | `CONTEXT` | the entry as a whole (B0 table, coverage, abstention curves) |
| Q5 at 120 | per forecaster | kept-50% mean R above the random-drop 97.5th percentile after Holm over the three rankable forecasters → `VALIDATED`, the card may say "no bias today" on weak days; else `UNDERPOWERED`/`NULL` by the same CI rule |

## 9. Operational spec for the build (no code changed in this step)

**Files the build changes**
- `js/directionLedger.js` — add `SAMEDAY_TARGETS = ['d21','n07','d5']`, `SAMEDAY_INSTRUMENTS` (core + extended),
  `issueSameDay({date, source, anchors, sigma, baselines, forecasts, issuedAt, code, externalStatus})`,
  `outcomeSameDay(issueRecs, target, midAt, resolvedAt)` (scores each row and B0 at the row's own anchor),
  `summariseSameDay(...)` (coverage, hit, R, log/Brier vs B0, events, CUSUM). Existing close-to-close functions unchanged.
- `js/biasForecasters.js` (new) — the pure forecasters of §3.3–3.4 (`deskRating`, `deskCcy`, `maxSignals`,
  `surpriseRule`, `fundabias` disabled) and the frozen shift tables.
- `js/biasScoreboardBaselines.json` (new) — frozen B0, written by `scripts/bias-scoreboard/b0.py`.
- `server.js` — `_biasScoreboardTick` (svcInterval 5 min): issue windows below; reads `_btFetchM1Range` mids,
  `_dlCloses`-style D candles for σ, `desk_run_elig_<date>`, `_scReadJson('signal_copier_signals')`,
  `_readSurpriseStore()`, `fetchWeekEvents`; `GET /api/direction-ledger?sameday=1[&date=][&summary=1]`.
- `scripts/bias-scoreboard/b0.py`, `scripts/bias-scoreboard/score.mjs` (judgement, coin control, abstention, bootstrap,
  Holm/OBF, seed 20261114).
- Tests: `js/directionLedger.test.mjs` (same-day issue/outcome/summarise; anchor = max rule; late cut-off; unresolved
  counted; Fri→Mon `n07`; B0 scored at each row's anchor; write-once refuses an existing key) and
  `js/biasForecasters.test.mjs` (each mapping and cap; FLAT = no view; desk-ccy sign; Max first-signal, window edges,
  conflict flag, **no text/entry/sl/id fields in output**; surprise carry, release-day flat, polarity, core-over-headline,
  unknown z; fundabias returns nothing). Positive control §3.9 as a test of `score.mjs`.

**Record layout (R2, write-once, never overwritten, never back-issued)**

| Key | Written | Contains |
|---|---|---|
| `forward/direction_ledger/sameday/<D>_base.json` | first tick in [07:00, 09:00) London on `D` | anchors at 07:00, σ_day, B0 rows, surprise-rule rows, code, versions, `external_status` |
| `forward/direction_ledger/sameday/<D>_desk.json` | first tick after the eligible book exists, before 10:00 London | desk-rating and desk-ccy rows with anchor = `finishedAt` |
| `forward/direction_ledger/sameday/<D>_max.json` | first tick in [16:05, 20:00) London | max-signals rows (instrument, side, posted_ts, style) with their anchors |
| `forward/direction_ledger/sameday/out/<D>_<target>.json` | once the end price exists (`d21` after 21:05) | mid at each anchor used and at the end, y per anchor, per-row and per-row-B0 scores, R, unresolved reasons |

Row id = `<D>|<inst>|<target>|<model_id>`; each row carries `row_type: 'sameday'`, `anchor_ts`, `knowable_ts`,
`p_up`, `speaks`, `decision`, `side`, `shift`, `conviction`, `inputs`, `flags`, `model_version`, `prereg` =
this file. A window missed (server down) is a gap; the tick never writes a file for a date other than today's London
date, and never after its window closes.

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS

No forward row exists yet (the recorder was not deployed when this was written), so no outcome has been computed.

**Added forecaster `h4-trend`** (owner request). An exploratory look, `analysis/output/max-bias-reverse/RESULTS.md`
(commit cbbe645b, *exploratory, not pre-registered*), found that Max's daily side agrees with the sign of the 4h EMA20
slope on 84% of 57 instrument-days (88% day-clustered, 21 days). This row lets the record show whether Max's side adds
anything beyond that public price reading.

- **Rule.** Take the OANDA H1 mid bars that closed at or before 07:00 London on `D` (the last 320). Make 4h closes from
  them: the last H1 close in each bucket aligned to 00/04/08/12/16/20 UTC; the latest bucket may be partial. Then
  EMA20 is seeded with the first value, and slope = EMA20(all) − EMA20(all but the last 3).
  - Side = the slope's sign. No view when the slope is 0 or there are fewer than 24 4h closes.
  - This reproduces `scripts/max-bias-reverse/analyze.py` `h4_closes` / `ema` exactly: parity checked on 30 synthetic
    series, 30/30.
  - Code: `js/biasForecasters.js` `h4Slope`, `h4Trend`.
- **Mapping.** p_up = clip(p0 ± 0.04). Knowable 07:00 London, so anchor 07:00. All scored instruments (core six and
  extended). It is written in the `base` file.
- **Scoring and multiplicity.** It is a fifth scored cell (`d21`, core six pooled), on the same primary statistic, gate
  and verdict rules as §4–§8. The Holm family in §6 is now **five** cells at each look, with the same OBF boundaries
  and nominal α. No other cell changes.
- **Head-to-head.** `max-signals` vs `h4-trend` on the rows where both speak, at Max's anchor. This is descriptive
  (BH, §6). So is Max's agreement rate with `h4-trend`.
- **Power** (§5 method, c ≈ 0.95): n_eff ≈ 120 / 239 at 60 / 120 days, hit-rate MDE ≈ 13 pp / 9 pp against the 6 pp
  bar. **UNDERPOWERED by design**, like the other cells.
- **Prior.** The exploratory file is evidence about Max's choices, not about returns. The expectation for `h4-trend`
  vs B0 is **Null**.

**Also recorded (build detail, no change to a rule).** The coin-control percentile (§3.5) splits ties uniformly at
random (seeded randomised mid-rank), so a no-skill forecaster's percentile is exactly uniform. The §3.9 KS check needs
this, because a log-score mean with a fixed shift takes discrete values.

---

## RESULTS — run <YYYY-MM-DD>
