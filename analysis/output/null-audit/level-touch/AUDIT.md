# Null audit: `level-touch` (Evidence Book, null, 2026-09-10)

Audited 2026-10-24 on branch `worktree-agent-a42f167ab5297d362`. Nothing banked was edited.
Scripts: `scripts/null-audit/level-touch/`. Outputs: this folder.

**Verdict integrity: BUG-NO-CHANGE.** The null holds. The record states the wrong reason for it, and it
names a level family the code never tested.

- **The null holds.** A proper control fixes the gap in the banked design. It compares touches of the real
  lines with touches of phantom lines at 0.8, 0.9, 1.1 and 1.2 times the same distance, on the same day,
  with the same touch rule, and clusters the standard errors by date. On that control the line itself adds
  nothing, in any family or metric (every |z| < 1.9).
- **The planted check passes.** When I planted a fade at the real lines, both the banked pipeline and the
  phantom contrast found it, and the random controls did not move.
- **The record states the wrong reason.** The ledger text says "paired controls at random non-level prices…
  the level increment is zero or negative". The code uses random *times*, not prices. Its own output shows a
  *positive* increment in all 7 families, and four of them have t > 2 (hl50 +0.0264, t 3.84, 16/17 pairs).
  In the banking commit, the null rested on a cost argument that no committed code computes. That argument
  relies on a claimed "strict upper bound" that is false in general.
- **It names a family that was never tested.** The claim lists "prior-day high/low", but the code has no
  prior-day high/low family. "hl" means the *dynamic* high-low range rungs. Three other documents cite this
  id as a prior-day high/low null.

## The study as built

| Piece | File | What it does |
|---|---|---|
| Touch generation | `analysis/line_touch_response_study.mjs` (a52b447a, 2026-09-09) | One M1 walk per pair. 7 families: hl50/75/90 are dynamic H-L rungs anchored to the running opposite extreme; oh50/75/90 are the open-anchored ladder (oh/ol); dopen is the daily-open retest. Entry is the touch bar's close. Rest-of-session MFE/MAE and returns at 5/15/30/60/120 min are measured from bar k+1. Distances are divided by dayScale = open × σ(ex-ante). |
| Controls | `analysis/line_touch_control_study.mjs` (e27a2775, 2026-09-10) | Every touch is paired with **A**, a random moment on a different day, runway-matched to ±30 min, same side label; and **B**, a random other bar on the same day, same side. The statistic is the mean of (touch MFE−\|MAE\|) − (control MFE−\|MAE\|), with a per-touch paired t. |
| Pooling | `analysis/line_touch_control_report.mjs` | Inverse-variance pooling across 17 instruments, plus a count of instruments with a positive diff. The printed gate reads "\|t\| under ~2.5 … is not an effect". |
| Prereg | none | No prereg, no seed in a prereg, no pass rule written in advance. |

## 1. TRACE (step by step, file:line)

| # | Step | Code | Check | Result |
|---|---|---|---|---|
| T1 | M1 load | `js/volBacktestM1Engine.js:1532-1656` | Source and tail merge | No R2 credentials in env, so it reads the local disk parquet. The R2 tail merge was added 2026-09-12, after banking. The local files are dated 2026-08-21, before banking, so the data is unchanged. **The loader writes a decoded snapshot to R2 when credentials exist (`:1612`). Any audit must run without R2 keys.** |
| T2 | Timestamps / units | `:1581` last column; prices `Float32Array` `:1557-1560` | Units, epoch | OK. spx/dow store a naive `time` column. I checked it against spx500/us30: identical closes at a 0 h shift, so it is UTC (`check_spx_tz.py`). Float32 rounding is negligible (the re-implementation casts the same way). |
| T3 | Sessions | `js/forecastAnalyser.js:411-424` London branch; study `:271-272` | London date, Sunday stubs, BST | London calendar date with a correct BST rule. Sessions with < 200 bars are dropped (`:272`), which removes Sunday-evening stubs and holidays: 7,798 of 51,581 London dates (15%). Today's session-dating change (065f3984) only touches the numeric-boundary branch, not London. **Minor:** a session runs the full London day including 22:00–24:00 London (rollover), not the `london22` window of data-rules §1. |
| T4 | Daily bars + σ | study `:275-289`; `js/forecastSigma.js:222-259` | Lookahead, bar shape | `forecastSigma(d1.slice(0, i))` takes the as-of-close value of day i−1, so there is no lookahead. **Minor:** σ comes from London-day bars built from M1, not NY-close bars (data-rules §2). The width source is `forge/out_vol_lon` (London), so this is consistent with the fit. It only affects where the lines are placed. |
| T5 | Ladder | study `:293-294`; `js/forecastLadder.js:95-139`; `js/levelAtlasEngine.js:67-77` | Params, event tag | Rung = open × (1 ± round2(c × σ% × ev)). **Minor:** `eventTag: 'none'` is used every day, so on FOMC, NFP and CPI days the lines sit where the live ladder would not draw them. **Minor:** at banking, LADDER_PARAMS was keyed `SPX500`/`US30`, so `SPX`/`DOW` fell to the index class default (fixed 77f6ef2b, 2026-09-29). Confirmed: the re-implementation matches the banked SPX touches exactly only with the class default. |
| T6 | H-L fractions | study `:144-148`; `js/forecastCore.js:52-64` | Units | hl50 = 1.572 × corr × σ, hl75 = 2.049 × corr × σ, hl90 = 2.555 × hl75corr × σ. These are full-range widths measured from the opposite extreme. OK. |
| T7 | Touch detection | study `:157-243` | Lookahead, rearm | The dynamic anchor lags through k−1 (`:159-166`), so there is no lookahead. A level re-arms after the close moves 30% of the rung spacing away. dopen needs a breakaway first. All OK, and the re-implementation matches every touch exactly (step 4). |
| T8 | Outcome | study `:107-142`, `:245-261` | Off-by-one | Entry is the close of bar k. Excursions start at k+1 (`:120`), so the touch bar's own spike is not credited. A horizon closes at the first bar ≥ h minutes. A touch on the last bar is dropped (`:109`): 69 static-ladder touches. OK. |
| T9 | Day filter | study `:301` | Dropped rows | Days with zero touches are dropped: 182 of 42,763 days. That is harmless because they carry no touches. |
| T10 | Control A | control `:153-177` | Comparability | Different day, same side, runway ±30 min, up to 12 attempts. 100% coverage (396,537 of 396,538). **Major (design):** a touch sits by construction at a running extreme after a move of known size. A random moment does not. A therefore cannot separate "the line" from "price has moved X σ". It is a momentum / day-selection contrast, not the "random non-level price" the ledger describes. |
| T11 | Control B | control `:179-192` | Lookahead | Same day and same side, so the control inherits the day's realised direction. Its ctrlEdge of +0.23 to +0.37 shows this. The author flags it as a probe and does not use it. Coverage is 86%. |
| T12 | Statistic | control `:96-118`; report `:33-47` | Clustering | Per-touch paired t, then inverse-variance pooling as if the 17 instruments were independent. Touches overlap within a day (several families, both sides, rearm re-touches) and across instruments on the same date. **The date-cluster bootstrap SE is 1.6–3.0× the naive SE** (`cluster_inflation.py`: hl50 1.62, hl75 2.25, hl90 2.02, oh50 2.10, oh75 2.40, oh90 2.94, dopen 2.96). That overstates *positive* findings, so it cannot produce a false null. |
| T13 | Gate vs claim | report `:83-87`; `js/deskEvidence.js:237-240` | Gate match | No prereg. The report's own gate (\|t\| ≥ 2.5 and most instruments positive) **passes for hl50 vs random time (t 3.84, 16/17)**. The ledger's "increment zero or negative" contradicts the code's output. The null was decided on (a) the depth ordering collapsing and (b) "a median 1.45× cost upper bound". No committed script computes (b), and "MFE−\|MAE\| is a strict upper bound on what any exit could extract" is false in general: a non-anticipating exit can beat it whenever paths are predictable. |
| T14 | Claim coverage | `js/deskEvidence.js:238` | Claim vs code | **No prior-day high/low family exists** (families: study `:39-51`). The null is cited as a prior-day high/low result in `plans/LEVEL_ENGINE_ROADMAP.md:44`, `forge/IEP_TIME_PREREG.md:24` and `forge/RANGE_LADDER_PLACEBO_PREREG.md:27`. |
| T15 | Lockbox / OOS | study `:318-319` | Holdout | Coverage ends 2026-08-20, so no lockbox rows. `splitDate` is computed but the control study never uses it; there is no out-of-sample read. |
| T16 | Power | study `:83-84` | Data choice | spx/dow read `spx_m1`/`dow_m1` (2021-06 → 2026-06-05). The full `spx500_m1`/`us30_m1` files (2016 → 2026-08) were already on disk. This costs power only. |

## 2. REPRODUCE

- **Control step, exact.** I re-ran `analysis/line_touch_control_study.mjs` on the banked response files
  (main checkout, written 2026-09-09) and compared all 17 per-pair JSONs against the committed e27a2775
  copies: **2,380 numeric cells, 0 mismatches, max |diff| 0** (`compare_control.mjs`). The pooled report
  reproduces the commit message's table to the last digit: hl50 +0.0264 t3.84 16/17, hl75 +0.0138 t2.12,
  hl90 +0.0234 t2.31, oh50 +0.0056 t1.32, oh75 +0.0084 t1.55, oh90 +0.0146 t1.66, dopen +0.0072 t2.04.
- **Touch step, exact (by independent code, see step 4).** It runs on the same M1 (unchanged since
  2026-08-21) and the banking-time LADDER_PARAMS. The only dependency change since then that touches these
  pairs is the SPX/DOW param keys, so re-running the response study with *today's* code would differ for SPX
  and DOW only. The "1.45× cost" figure cannot be reproduced because no script for it exists.

## 3. PLANT (positive control)

**What I planted.** At every real open-anchored ladder touch (oh/ol p50/p75/p90, with the study's
armed/rearm rule), with probability 0.5, the rest of the session is pushed back against the touch by
δ × dayScale, ramped over 30 minutes. The lines are rebuilt day by day from the planted history, so they are
exactly the lines the study sees (`plant.py`, `indep_core.plant_pair`). I used six instruments (EURUSD,
GBPUSD, USDJPY, GOLD, NQ, DE30), δ = 0.04 and δ = 0.02, and seed 20260910. The study's own scripts ran
unchanged; only the directories differ (`make_study_copy.mjs` prints every changed line).

**Cross-check.** On the planted data, the banked JS pipeline and the independent code find the identical
touch sets and edges (`count_check.py`: every family and pair equal).

**Banked pipeline, Control A, 6 pairs** (diff, t):

| family | unplanted | planted δ=0.04 | planted δ=0.02 |
|---|---|---|---|
| oh50 | +0.0161 t2.33 | **−0.0520 t−7.82** (0/6 positive) | **−0.0201 t−2.93** (2/6) |
| oh75 | +0.0262 t2.89 | **−0.0426 t−4.76** (1/6) | −0.0073 t−0.82 (Δ −0.034) |
| oh90 | +0.0596 t4.10 | +0.0059 t0.39 (Δ −0.054) | +0.0227 t1.51 (Δ −0.037) |
| control edge, oh50/75/90 | +0.003 / +0.004 / +0.006 | −0.004 / −0.005 / +0.004 | +0.003 / −0.002 / +0.015 |

At both sizes the diff moves by roughly the amount the plant reached the touches. The pipeline sees the plant at the lines. The real touch edge
moved −0.074 / −0.077 / −0.053 at δ = 0.04, larger than the nominal −2pδ because later planted fades in the
same session add up. The random-time controls did not move. **The banked pipeline has the power to see a
level reaction of this size; its null is not a dead instrument.**

**Phantom contrast** (real − phantom, date-cluster SE, 6 pairs), from `pool.py plant_d04` / `plant_d02`:

| family/metric | unplanted | δ=0.04 | δ=0.02 |
|---|---|---|---|
| oh50 edge | −0.0005 (z −0.19) | −0.0162 (z −6.07) | −0.0071 (z −2.74) |
| oh50 r60 | −0.0004 | −0.0085 (z −9.17) | −0.0040 (z −4.15) |
| oh75 edge | +0.0087 | −0.0128 (z −2.49) | −0.0041 (z −0.82) |
| oh75 r60 | +0.0022 | −0.0094 (z −4.56) | −0.0038 (z −1.87) |
| dopen edge (not planted) | +0.0075 | +0.0024 | +0.0066 |

The phantom contrast detects the plant, but diluted. The rest-of-session plant also reaches phantom touches
whose later path crosses a real line: phantoms moved −0.053 to −0.063 against −0.074 at the real oh50 line
(`plant_shift.py`). So the contrast measures only the part of an effect that is specific to the exact
line, which is the quantity the claim is about.

## 4. RE-IMPLEMENT

`indep_core.py` / `indep_compare.py` re-implement the pipeline in Python/numba and import no repo JS: parquet
read, London dates from the tz database, ≥ 200-bar filter, YZ/EWMA σ, ladder, H-L rungs, open retest,
armed/rearm detection, and rest-of-session MFE/MAE. Only numeric constants are copied (dumped LADDER_PARAMS
at e27a2775, BM_P50/75/90, H-L corrections).

**Result on all 17 instruments: 396,538 of 396,538 touches matched exactly by (date, family, side, minute),
with 0 extra and 0 missing.** σ relative error is at most 3.3e-4 (rounding of stored values). The worst
per-touch edge difference is 9e-5 day-ranges, because the banked file rounds to 5 dp. Family mean edges
agree to about 1e-6. Example, EURUSD: oh50 −0.011682 vs −0.011683, hl90 +0.077890 vs +0.077891.

**The comparison the record describes but the code never ran.** `phantom.py` + `pool.py`, all 17
instruments: real-line touches minus phantom-line touches (scales 0.8/0.9/1.1/1.2, same day, same rules),
equal weight per instrument, calendar-date cluster bootstrap (B = 1000, seed 20260910):

| family | edge (MFE−\|MAE\|) | r15 | r60 | line15 (limit fill at the line) | pairs+ (edge) | MDE80 edge |
|---|---|---|---|---|---|---|
| hl50 | +0.0073 (z 1.76) | −0.0002 | +0.0018 | +0.0005 | 11/17 | 0.012 |
| hl75 | +0.0072 (z 1.03) | −0.0001 | +0.0044 | −0.0005 | 8/17 | 0.020 |
| hl90 | +0.0081 (z 0.64) | +0.0014 | −0.0017 | +0.0020 | 7/17 | 0.035 |
| oh50 | +0.0007 (z 0.41) | −0.0002 | +0.0003 | +0.0000 | 10/17 | 0.005 |
| oh75 | +0.0031 (z 0.88) | +0.0008 | +0.0013 | +0.0011 | 11/17 | 0.010 |
| oh90 | +0.0061 (z 0.68) | −0.0020 | −0.0019 | −0.0016 | 11/17 | 0.025 |
| dopen | +0.0022 (z 0.44) | −0.0001 | +0.0004 | +0.0001 | 11/17 | 0.014 |

(Full table, including r5, eod and lim0: `phantom/real/pooled.json`; every |z| < 1.9.)

**Why this differs from the banked numbers.** The banked Control A increments (+0.006 to +0.026) shrink
toward zero once the comparison price sits at the same depth. hl50 goes from +0.0264 (random time) to
+0.0073 (phantom line). What the random-time control picks up is "price has travelled this far", which a
phantom line at the same depth shares. The line itself adds nothing that can be measured, at any horizon,
including a limit fill at the line.

## 5. ACCOUNT

| Stage | Rows | Dropped | Why |
|---|---|---|---|
| London dates in M1 (17 inst.) | 51,581 | — | — |
| ≥ 200 bars | 43,783 | 7,798 (15.1%) | Sunday-evening stubs and holidays (de30/uk100 have none) |
| after 60-day warm-up and finite σ | 42,763 | 1,020 | warm-up |
| days with ≥ 1 touch | 42,581 | 182 | no touch; carries nothing |
| touches | 396,538 | 69 static-ladder touches on the session's last bar (dynamic/dopen not counted, same order of size) | no forward path |
| Control A paired | 396,537 | 1 | 12 attempts failed |
| Control B paired | 340,908 (86.0%) | 55,630 (14.0%) | the ±120 min runway / 15-min gap is unmet near session edges (not used in the verdict) |

No filter selects on outcome. Every touch gets a number, and no barrier race decides inclusion. The only
coverage-type drop is control B, which the verdict does not use. Nothing here removes the cases where an
effect would show.

## Findings

| # | Severity | file:line | Finding | Could it move the verdict? |
|---|---|---|---|---|
| 1 | major (record) | `js/deskEvidence.js:238`; `analysis/line_touch_response_study.mjs:39-51` | The claim includes prior-day high/low, but no such family exists ("hl" = dynamic H-L rungs). Cited as a prior-day high/low null in `plans/LEVEL_ENGINE_ROADMAP.md:44`, `forge/IEP_TIME_PREREG.md:24`, `forge/RANGE_LADDER_PLACEBO_PREREG.md:27`. | Not this verdict. It means prior-day high/low has **no** test under this id. |
| 2 | major (record) | `js/deskEvidence.js:239` vs control report output | "Random non-level prices … increment zero or negative" is wrong twice: the controls are random times, and the increments are positive (hl50 t3.84). The real basis was an uncommitted cost calculation. | No. The phantom-price control gives increment ≈ 0. |
| 3 | major (design) | `analysis/line_touch_control_study.mjs:21-33,153-177` | Control A is not matched on depth or momentum, so it cannot attribute anything to the line. | No. The corrected control confirms the null. |
| 4 | minor | `analysis/line_touch_control_study.mjs:107-118`; `line_touch_control_report.mjs:33-47`; `line_touch_response_report.mjs:73-78` | Per-touch t and pooling across instruments ignore date clustering. SE is understated 1.6–3.0×. | No (it inflates positives). |
| 5 | minor | commit e27a2775 message; memory `project_hl_signal_null` | "MFE−\|MAE\| is a strict upper bound on any exit" is false in general, and the 1.45× cost figure has no script. | No, given finding 3's corrected result. |
| 6 | minor | `js/forecastLadder.js` paramsFor at e27a2775 (fixed 77f6ef2b) | SPX/DOW used class-default widths at banking. | No (2 of 17 instruments; levels slightly off). |
| 7 | minor | `analysis/line_touch_response_study.mjs:83-84` | spx/dow use the half-history files; spx500/us30 have 10 years. | No (power only). |
| 8 | minor | `js/forecastAnalyser.js:411-424`; study `:271` | Sessions include 22:00–24:00 London (rollover), unlike `london22`. | No (same for touches and controls). |
| 9 | minor | study `:275-289` | σ from London-day bars, not NY-close bars (data-rules §2). | No (line placement only; consistent with the London fit). |
| 10 | minor | study `:293` | `eventTag: 'none'` on every day, so event-day lines differ from live. | No. |
| 11 | info | — | No prereg, no seed in a prereg, no out-of-sample read in the control study. | — |
| 12 | info (ops) | `js/volBacktestM1Engine.js:1612` | `loadM1ForPair` writes a decoded snapshot to R2 whenever R2 keys are present. Re-running any study that uses it with credentials loaded writes to production. | — |

## Where this points next

The null on "the line itself" is now sound: power is shown and the control is comparable. What the
random-time control *did* pick up (hl50 +0.026 against a random moment, about t 2.4 after clustering) is a
depth/momentum effect that is not about lines. That belongs with the trend/momentum books, not here. The
untested idea this audit leaves behind is **prior-day high/low**, which needs its own test with this same
phantom-price control before anyone cites a null for it.

## Cost of this audit (for costing 150 studies)

| Step | Wall time | Data |
|---|---|---|
| 1 Trace (read 3 study files + 8 imported modules + git history) | ~40 min | none |
| 2 Reproduce (control re-run 574 s + compare) | ~12 min | local M1 only (17 parquets, ~1.1 GB read) |
| 3 Plant (12 planted parquets ~2 min; banked pipeline 348 s per plant size; phantom on planted ~2 min) | ~25 min | local only; ~1 GB scratch written |
| 4 Re-implement (writing ~45 min; run 17 pairs ~4 min after a 240 s → 5 s date-key fix) | ~50 min | local only |
| 5 Account | ~5 min | local only |
| Write-up | ~20 min | — |
| **Total** | **~2.5 h** | **0 network fetches** (no OANDA, FRED or R2 calls) |
