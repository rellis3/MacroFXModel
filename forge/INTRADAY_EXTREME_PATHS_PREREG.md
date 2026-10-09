# INTRADAY-EXTREME-PATHS: after a dynamic intraday extreme, what is the probability of continuation, meaningful reversal, or consolidation?

**STATUS: FROZEN 2026-10-09 (owner approved, with the defaults recorded under "Owner decisions"). No experiment had been run when frozen.**
Later changes only by dated amendment *before* the result they affect is seen (variant log at the end).
Nothing here builds or deploys a trading strategy. Stage 5 (trading usefulness) is a gate, not a plan.

Written for: the owner, to approve; then as the standing record for later sessions.

## 0. Why this is not a re-run of the forecast-line research

The existing record is dense but tests *line touches* and *size*. The coverage matrix (section 1) shows the gap: no study has asked, from an
arbitrary decision time, for the joint probability of **continuation / meaningful reversal / consolidation** after a *dynamic* extreme (the running
session high/low), at *fixed horizons* with *competing barriers*, as a function of pullback, age of the extreme, range consumed, momentum, regime, time of day,
cross-asset state and point-in-time macro, with an incremental-information ladder. The closest completed work is `extreme-in-probability` (does the extreme
survive *to the session end*: one binary, no direction/consolidation split, no fixed horizon) and `live-range-features`/`confluence-book` (features at *lines*).
Those results are **reused as priors and baselines, not re-run** (section 1 lists the one methodological gap that justifies new computation: the outcome definition).

## 1. Coverage matrix (what is tested, partial, untested)

T = tested (result exists, not re-run) · P = partial (tested for a different outcome, anchor or horizon; the gap is stated) · U = untested.

| # | Question | Status | What exists (ledger id / file) | Gap this plan fills |
|---|---|---|---|---|
| 1 | Continuation after a dynamic extreme (further extension) | **P** | `extreme-in-probability` (validated, Brier skill +21% FX/gold, +18% indices; driven by pullback + hour + range used); `exhaustion-schedule` (a clock effect, flat across distance) | Outcome is "final extreme of the **day**" (binary, horizon varies with the hour). No fixed horizon, no size, no direction split |
| 2 | Meaningful reversal after an extreme | **P** | Fades at lines: `level-touch`, `live-range-book`, `live-range-walkforward`, `directional-rescore` (null; EXHAUST days stall rather than revert) | Reversal of a stated size from an *arbitrary* fresh extreme, with a geometry-matched baseline, is untested |
| 3 | Consolidation as its own outcome | **U** | Only "EXHAUST days stall 32-33% vs 16%" (`directional-rescore`), at lines | Never defined or predicted as a class |
| 4 | Fixed-horizon sign of return from an arbitrary state | **P** | `fast-start-rest-of-day` T3b (afternoon follows morning 47-60%); `live-range-book` B (trend state, all in noise); `v4-dirtag` | All conditioned on a line, a tag or a morning rule. No state-conditional P(r_H>0) vs drift and a price-only baseline |
| 5 | Competing barriers (up-before-down, target-before-stop, MFE/MAE) | **P** | Layer 4 `path-map`, `live-range-line-race` (real = placebo within 1pp; races start at touches); Layer 7 stop-risk | Races from arbitrary states with geometry-constant barriers untested; MFE/MAE distributions untested |
| 6 | Pullback size | **T/P** | Dominant driver of `extreme-in-probability` | Tested for "extreme survives", not for the trichotomy or for sign |
| 7 | Time since the extreme | **T/P** | `live-range-features`: age of extreme added nothing to remaining range or extreme-in (0 of 22) | Not tested for the trichotomy; the null may not transfer |
| 8 | Range consumed | **T/P** | Layer 5 remaining travel, path-map `used` cells, `band-reach-from-here` (validated for reach, mostly clock) | Not tested as a modifier of continuation vs reversal vs consolidation |
| 9 | Momentum into the extreme | **T/P** | `live-range-features` (ROC, accel, RSI, WaveTrend null for range and extreme-in); `tape-speed-persistence` (validated: pace persists) | Not tested for the trichotomy; pace is a candidate for the *consolidation* class |
| 10 | Volatility regime | **T** | Layer 3/`forecast-record-pit` (calibration by regime); path-map regime cells (null for direction); layer 5 | Reported as a stratifier only; not retested |
| 11 | IV ÷ σ | **P** | `iv-ladder`, `live-range-features` (~3% range gain, 7 instruments), layer 6 (0.7% of Brier) | Not tested for the trichotomy |
| 12 | Time of day | **T** | `live-range-clock` (the lines are mostly a clock); `exhaustion-schedule`; known 20:00-22:00 UTC reversal window | Used as a covariate and stratifier; the late window is flagged, not hunted |
| 13 | Interactions between features | **P** | `live-range-confluence-book` (204 tests, 5.9% vs ~5% chance, at line passes); path-map two-way cells (one cell, prior-day level at p90 +5.6pp z=2.4, unreplicated); GBM ceilings in layers 6 and `live-range-features` | Six pre-specified interactions on the new outcome with FDR control (section 6) |
| 14 | Prior-day / prior-level interactions | **P** | Path-map prior-day high/low cell above | Replication test as one pre-specified interaction |
| 15 | Cross-asset state, intraday and point-in-time | **P** | `surface-lab` absorption (descriptive); rates-residual S1/S2 (same-bar only, no lead); bond-CFD residual null | Never used as a conditioner of path *probabilities*. Lead-lag nulls do not answer it |
| 16 | Macro regime (point-in-time) | **P** | Daily/weekly range tests (`vix-inversion` validated, `vol-curve-front` range-only); direction: `macro-confluence-direction`, `yields-to-fx-direction`, `curve-inversion` all null | Never conditioned an intraday path model. Revisable macro excluded (section 5) |
| 17 | Incremental value ladder (baseline → +price → +vol → +cross-asset → +macro) | **P** | Layer 6 feature importances; `live-range-features` T2 ablations | The full ladder on the new outcome |
| 18 | Costs / execution feasibility | **T** | `execution-gate` (spread/ATR > 0.15 dead); `LINE_TOUCH_COST_PREREG` cost table | Reported as a feasibility column only |

**Reused as-is, not re-run:** layer-3 HAR-800 σ (`analysis/output/ladder_candidates/d1/<SYM>_har800.csv`), layer-5 vol-time profiles
(`analysis/output/remaining_travel/<SYM>_profile.csv`), the session/bar definitions of `plans/DATA_SPEC.md`, `forge/evaltools.py`, and the cost table.
**Not reused:** the layer-5 checkpoint CSVs (2-hourly, no path ordering): the new event table needs hourly checkpoints and M1 first-hit resolution.

## 2. Data, units and point-in-time rules

- **Universe:** the 34 instruments with local M1 history (27 FX, gold, six indices), London sessions per DATA_SPEC (open = first M1 bar at/after 00:00 London;
  research window to 22:00 London; sessions with < 600 bars dropped; SPX500 half-days excluded). Classes: FX majors, crosses, gold, indices.
- **σ:** the session's HAR-800 σ (known before the open; index σ from OANDA NY-close bars per fix 2 of DATA_SPEC). All distances are in units of σ·O (% of open),
  as layer 5.
- **Price:** OANDA M1 **mid**. Spread is not in the probabilities; it enters only the feasibility column (section 8).
- **Local data ends 2026-08-20.** Later M1 is not local. See section 7 (forward block).
- **Calendar proxy** ends 2026-07-02: event-day features are `unknown` after that and excluded from macro tests, not imputed.

## 3. Event table and precise definitions

**Row** = (instrument, London session s, checkpoint h), h hourly 02:00 … 18:00 (17 points; the grid lets the longest horizon end by 22:00).

| symbol | definition (all causal at h) |
|---|---|
| decision price P0 | close of the last M1 bar ending at h (bar `[h−1m, h)`) |
| open O | London-midnight open |
| displacement D | (P0 − O) / (σ·O) |
| orientation o | sign(D). Rows with \|D\| < 0.25 are `flat` (no orientation); used only as the consolidation baseline |
| dynamic extreme E | highest high (o=+1) or lowest low (o=−1) over bars up to and including the decision bar |
| pullback d | o·(E − P0)/(σ·O) ≥ 0, bins **F** d ≤ 0.15 · **S** 0.15–0.5 · **M** 0.5–1.0 · **D** > 1.0 |
| age a | minutes since the bar that last set E; bins < 60 · 60–180 · > 180 |
| range used | (running high − low)/(σ·O); also the ratio to the HAR HL p50 width; terciles fixed on discovery data |
| "large" move | \|D\| ≥ 0.5 **and** in the top tercile of \|D\| for its class × hour (tercile edge fitted on the discovery block only) |
| momentum m1, m4 | o·(P0 − P(h−1h))/(σ·O), o·(P0 − P(h−4h))/(σ·O) |
| regime ρ | σ ÷ its trailing 250-session median: quiet < 0.85 · normal · busy > 1.15 |
| barrier unit u(h,H) | σ · √v(h,H); v = class vol-time share of the day's variance in (h, h+H], from the discovery-block profile (layer-5 builder). Geometry-constant: the same unit for every state |

Horizons H ∈ {1h, **2h (primary)**, 4h}. A row is kept for horizon H only if h + H ≤ 22:00 London. Outcomes are scored from the **next** bar.

### Primary outcome: the competing-barrier trichotomy (symmetric, geometry-constant)
Favourable barrier P0 + o·u; adverse barrier P0 − o·u, tested on M1 high/low, bars strictly after the decision bar, within (h, h+H].
- **CONT**: favourable barrier first. **REV** (meaningful reversal): adverse barrier first. **CONS** (consolidation): neither within H.
- **AMB**: one M1 bar touches both (order unknowable on M1). Excluded from shares; its rate is reported per class × hour. **Sensitivity:** recompute with AMB→CONT and
  AMB→REV; any conclusion that flips is labelled *ambiguity-sensitive* and cannot merit follow-up.
- Scale sensitivity (pre-registered, nothing else): barrier = 0.5u and 1.0u. Primary = **1.0u, H = 2h**.

### Secondary outcomes
- **S1** sign of o·(P(h+H) − P0): P(>0) vs 0.5 / drift. **S2** extension: new extreme beyond E by ≥ 0.25u within H (links to `extreme-in-probability`).
- **S3** failed continuation (delayed reversal): CONT first, then close at h+H below P0. **S4** MFE and MAE in units of u (quantiles by cell, no test).
- **S5** the same trichotomy to the **session end** (links to the old outcome) for comparison only.

## 4. Baselines (what each probability is compared with)

1. **Bsym (sign-flip null):** orientation randomly reassigned per session (500 permutations, date-clustered). Under no state information CONT = REV; this is the geometry/drift null and gives the CONS rate.
2. **Bplace (matched-state placebo):** for a state cell, the same instrument × hour × displacement bin, same orientation, differing in the one factor under test (e.g. pulled back vs fresh). The contrast is the effect.
3. **Model ladder** (section 6): B0 unconditional (instrument × hour) → B1 + price-only state → B2 + volatility forecast → B3 + cross-asset → B4 + macro. Each rung is compared with the one below on the same rows.
4. **Prior-art baselines:** for S2/S5 the `extreme-in` count table, so the new work must beat it to claim anything about extension.

## 5. Hypotheses (two-sided; direction of each stated only as the economic expectation)

Family A (pooled; **Holm at 0.05**, 10 tests, primary outcome, H=2h, large-move rows, validation block):

| id | hypothesis | metric |
|---|---|---|
| A1 | P(CONT\|resolved) at fresh large extremes (F, age < 60) differs from 0.5 (Bsym) | share − 0.5 |
| A2 | Pullback depth changes CONT share (F > S > M > D or reverse): ordered trend | Cochran-Armitage on bins, date-clustered |
| A3 | Age of the extreme changes CONT share at fixed pullback | stratified difference |
| A4 | Range used (terciles) changes the CONS share | share |
| A5 | Momentum agreement (m1 in top tercile) changes CONT share | share |
| A6 | Regime (quiet/busy) changes the CONS share | share |
| A7 | IV÷σ (7 instruments) changes CONS and CONT | share |
| A8 | Time-of-day band (Asia, London, overlap, NY, late) changes CONT share | max band contrast |
| A9 | Cross-asset: the dollar factor or the risk factor agreeing with the instrument's orientation changes CONT share | share difference |
| A10 | Macro regime (VIX level/inversion, curve slope, event day) changes CONS or CONT | share |

Cross-asset features (point-in-time market prices at the same minute; closed markets carry no value, with a `missing` flag and no forward fill beyond 15 minutes):
dollar factor = signed equal-weight USD index displacement from the 27 FX pairs; risk factor = mean standardised displacement of NQ, SPX500, US30 when open;
rates = 1-hour change of the 2y and 10y bond CFDs when open.
Macro features (only series that are final when observed): prior-day CBOE VIX, VIX9D/VIX3M, term-structure inversion; prior-day UST 2y/10y/3m yields and 63-day change
from FRED market series (unrevised daily yields); calendar tag (tier1/high/none) through 2026-07-02. **Excluded:** GDP, CPI levels, nowcasts and any revisable series
without a dated vintage (ALFRED coverage is ~30 US series; any use must be shown per series with its release timestamp).

Family B (interactions; **six only**, BH-FDR 10%): pullback × age · pullback × hour band · range used × hour band · momentum × pullback · regime × range used · displacement × regime.
Prior-day-level proximity × pullback is carried as a **replication test** of the one path-map cell (+5.6pp, z 2.4), pre-specified as a single hypothesis.

Family C (subgroup scan, **BH-FDR 10% on validation, then replication**): cells = class(4) × regime(3) × hour band(5) × displacement tercile(3) = 180 cells × 3 outcomes = 540 tests. A cell is *eligible* only with ≥ 200 distinct sessions.
A permutation test of the max |z| over all cells (outcomes shuffled across sessions within instrument × hour) gives the global "is any subgroup real" p-value. A **weak pooled result does not stop Family C.**
Partial pooling: a hierarchical shrinkage model (cell effects shrunk toward class, hour and regime effects, empirical Bayes) is reported beside the raw cells, so small cells are not discarded and not over-read.

**Power, stated honestly (rough, to be recomputed in Stage 0 from the real correlation structure):** about 1.5M rows; large-move rows ~380k; fresh-state rows ~110k; but across-instrument outcome correlation
means the effective independent sample is of the order of a few thousand bets, giving a pooled minimum detectable share shift of roughly 1.5-3pp. A subgroup cell with ~100 independent sessions can only detect shifts of
roughly 10pp or more. Family C is therefore a search for **large** conditional effects; absence there is "no large subgroup effect", not "no effect".

## 6. Models, validation design and splits

- **Models:** shrunk count tables (as `extreme-in`), regularised multinomial logistic (CONT/REV/CONS), HistGradientBoosting as a **ceiling only**. Class `AMB` excluded and its rate reported.
- **Chronological blocks:** **Discovery** 2016-01 → 2021-12 (bin edges, terciles, vol-time profiles, hierarchical priors fitted here; descriptive counts only, no hypothesis test).
  **Validation** 2022-01 → 2024-12 (all Family A/B/C tests; annual walk-forward refits; model-ladder selection). **Confirmation** 2025-01 → 2026-08-20 (each surviving finding examined **once**; note 2025-09 → 2026-08 was used in layers 3/5/6 for other outcomes: disclosed, so this block confirms, it does not count as virgin).
  **Forward block** from 2026-08-21 (section 7), never examined during design.
- **No threshold or bin is selected on Confirmation or Forward.** Bin edges are the round numbers in section 3 plus discovery-block terciles; the only tunable (barrier scale) is limited to {0.5u, 1.0u}.
- **Inference:** all intervals are date-clustered block bootstraps (5-day blocks, pooled across instruments; per-class too) with the number of distinct dates reported as n_eff. Overlapping rows within a session are never treated as independent.
- **Metrics per finding:** probability estimate, n (rows, sessions, dates), 95% interval, effect size in pp vs baseline, multiclass Brier and log-loss skill vs the next-lower ladder rung, per-class one-vs-rest decile calibration (n ≥ 300 per decile),
  and the same split by instrument class and regime. Calibration pass: every decile within 3pp of realised.
- **Leak canary (Stage 0):** a feature equal to the next bar's return must give near-perfect skill; a shuffled-feature version must give zero. Both are recorded before any hypothesis is tested.
- **Ladder rule:** B(k) is credited with incremental information only if its skill over B(k−1) has a date-block interval wholly above zero on Validation, holds on Confirmation, and is ≥ 0.3% of the baseline loss.
  Cross-asset and macro rungs are credited only over B2 (price + volatility), never over B0.

## 7. Forward block and data refresh

Local research M1 stops at 2026-08-20. The forward bars (2026-08-21 → fetch date, bid/ask/mid) were downloaded 2026-10-09 by
`scripts/fetch_m1_forward.py` (run via `railway run`, key never local) into `data/m1_forward/` with `manifest.json` (rows, span, SHA-256,
seam check against the research cache on 2026-08-20). They are **only downloaded and integrity-checked**: no event, feature or outcome is computed on
them until the confirmation stage is complete and frozen. The forward block is then scored **once**, extended by later fetches until it holds
≥ 3,000 distinct instrument-sessions with large-move events (expected ~8 weeks per 1,000; the first fetch is the start, not the whole block).
These sessions are also H-A of `forge/LOCKBOX_PROTOCOL.md`; that lockbox's rules (layers 3/5/6 not scored on them before its own evaluation) are unaffected.

## 8. Costs and trading usefulness (a gate, not a test in this plan)

- Every table carries a **feasibility column**: median class spread ÷ u, and the share of rows with spread/u > 0.15 (excluded from the feasible-subset view, per `execution-gate`).
- For the symmetric race the break-even edge is spread/(2u) in share terms; findings are compared with it. **A higher CONT or CONS share is not evidence of positive expectancy.**
- Only a finding that passes section 9 *and* whose effect exceeds the break-even edge in the feasible subset may be proposed for a **separate** pre-registered trading test (entries, stops, targets, slippage, per-year stability, portfolio breadth ≈ 2.1). That test is not part of this plan.

## 9. Decision criteria for each finding

| verdict | rule |
|---|---|
| **Merits further investigation** | Survives its family's multiple-testing control on Validation; effect ≥ 3pp (A1-A10, B) or ≥ 5pp (C) vs baseline, interval excluding 0; same sign in both halves of Validation and on Confirmation (interval excluding 0 there too); same sign in ≥ 60% of instruments of its class; not ambiguity-sensitive; adds incremental skill per the ladder rule where a model is involved; not reproduced by the hour-only baseline (clock) |
| **Descriptive fact** | Passes Validation but not Confirmation, or is a base rate. Recorded, not pursued |
| **Null** | Interval includes 0 with power to see ≥ 3pp pooled. Recorded with reason |
| **Inconclusive / underpowered** | Cell too small or interval too wide to exclude the effect size of interest. Not recorded as null; listed with the n needed |
| **Not credible** | Fails the leak canary, depends on AMB resolution, or is confined to one instrument or one year |

A null at the pooled level never closes a subgroup; a subgroup finding never overrides a failed Confirmation.

## 10. Stages (each stage is reported and approved before the next)

0. **Build** the event table and path-resolution code; leak canary; AMB rates; exact power calculation; parity check on hand-verified sessions. No results reported beyond these checks.
1. **Descriptive baselines** on Discovery only: CONT/REV/CONS/AMB shares by state, Bsym, cost feasibility. No tests.
2. **Family A and B** on Validation, then ladder B0 → B4 (macro and cross-asset only where their data qualifies).
3. **Family C** subgroup scan with permutation global test and hierarchical shrinkage.
4. **Confirmation** of survivors (once each), then the forward block when it exists.
5. **Gate only:** decide whether any survivor can be proposed for a separate trading pre-registration.
Every model, feature set, horizon and scale tried is appended to the search ledger (variant log below) whether or not it is reported.

## Owner decisions (2026-10-09)
1. **Data:** forward M1 fetched via Railway's stored key into a separate folder (section 7); no local key, no change to existing caches or R2.
2. **Unit and horizon:** u = σ·√(vol-time share), primary H = 2h, as registered.
3. **Late window:** checkpoints 19:00, 20:00 and 21:00 London are added as a **separate flagged stratum** ("late"), for H = 1h only (the only horizon
   that fits before 22:00 at 21:00; 2h at 19:00/20:00 also fits and is reported). Late rows are **excluded from Families A and B** and from the
   pooled ladder, and enter Family C as their own hour band (the scan grows from 180 to 216 cells, 648 tests; FDR applies to the larger count).
   Reason: the known 20:00-22:00 UTC reversal window is a prior result, so late findings are read as confirmation or not of that, not as discovery.

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above, with the owner decisions | 2026-10-09 | frozen; Stage 0 run 2026-10-09 (below) |

## Stage 0 record (2026-10-09) — checks only, no outcome share seen
`python -m forge.iep_build` → `data/iep/<SYM>.parquet` (1,797,010 rows, 34 instruments; disc 981,491 · val 527,799 · conf 287,720).
`python -m forge.iep_stage0` → `analysis/output/intraday_extreme_paths/STAGE0.md`, `stage0.json`.
- **Parity with layer 5:** all 26,535 shared EURUSD checkpoints match `remaining_travel/EURUSD.csv` (D, used, rv, σ, σ-regime, running extremes) to its 4-dp rounding.
- **Independent recomputation:** 400 random rows re-derived by pandas time slicing: 0 mismatches.
- **AMB** ≤ 0.15% everywhere at 1.0u; at 0.5u ≤ 0.2% outside the late band, 0.4–0.5% in it. Negligible; the bound analysis stays registered.
- **Missing windows:** indices late band H=1 14.3% and gold late 5.0% have no bars (market break); other bands < 1%. Stale decision bars ≤ 3%.
- **Leak canary:** scorer is not blind. Strong canary (window end return) Brier skill **+0.49**; shuffled **0.000**. The registered canary
  (next-bar return) gives only **+0.026**: the prereg's expectation of "near-perfect" was wrong (one minute is small against a 2-hour barrier),
  not the pipeline. Recorded as a wording error, not a design change.
- **Power (cluster-by-date, H=2, 1.0u, large-move resolved rows):** pooled n_eff 16,108 on discovery; MDE80 1.1pp (disc), **1.4pp projected on
  Validation**; majors 2.1pp, crosses 1.5pp, indices 3.3pp, gold 4.3pp; fresh extremes 1.8pp. Family C cells (class × regime × band) median 282
  dates, median MDE80 **7.1pp**, 22% of cells ≤ 5pp (adding the displacement tercile widens this by ~√3). So: the prereg's 3pp pooled bar is well
  powered, gold and indices less so, and Family C detects only large subgroup effects, as registered.
- **Clarification (definition gap, fixed before any result):** hour bands by decision checkpoint h: Asia 2–6, London 7–11, overlap 12–15, NY 16–18, late 19–21.
  "Large move" tercile edges (class × h, discovery) saved in `large_move_tercile_edges_disc.csv`.
