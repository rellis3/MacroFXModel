# bias-learner — Can a walk-forward, heavily regularised learner over ~13 point-in-time morning readings, pooled over 13 instruments, beat the base rate on P(up) at 21:00 / +1 / +3 / +5 days, and know when to stay out?

**Pre-registered 2026-11-14, before any outcome was computed.** No market data was read to write this document: the
M1 is not in this container, and the power section is a pure simulation (synthetic features and synthetic targets).

| | |
|---|---|
| ID / ledger id | `bias-learner`; one scored ledger entry per asset group: `bias-learner-fx`, `bias-learner-gold`, `bias-learner-idx` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bias-learner` |
| Data | 13 instruments (the `scripts/h4-trend-hold/backtest.py` set): EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, EURJPY, GBPJPY (FX, 9); GOLD; NAS100, SPX500, US30 (indices, 3). OANDA mid M1, London sessions **2016-01-04 → 2026-08-21** (lockbox; nothing later is read, every horizon end included). Readings in §3.3 |
| Seed | `20261114` (every script in this study, including the gradient-boosting arm and every shuffle) |
| Uncertainty | moving-block bootstrap over test **dates** (all 13 instruments of a date move together), block 21 sessions, B = 2000; SE floor = SD of the day-block-shuffled-target null (§3.8) |
| Scripts / outputs | `scripts/bias-learner/` → `analysis/output/bias-learner/` |
| Harness | own Python script (pooled logistic with an offset, walk-forward by year; `analysis/study.mjs` / `runStudy.mjs` have no classifier path). Power: `scripts/bias-learner/power_sim.py` (synthetic only), output `analysis/output/bias-learner/power_sim.json` |

## 1. The claim (required)

Daily-bias agenda Q11 (`.claude/skills/research-director/agendas/daily-bias.md`, Part 3, added 2026-11-14). The owner:
*"have we analysed different ideas on different timeframes over differing periods, then trained the analysis to see if
it was correct, like ML learning what it got right and wrong, and how to improve its bias over multiple assets?"* The
card: *"Build one feature table per instrument-day from readings knowable before 07:00 London ... Train a small, heavily
regularised model per horizon (21:00, +1, +3, +5 days) walk-forward by year, pooled across assets with asset effects.
Read calibration and Brier skill against B0 by asset and horizon. Read the accuracy you keep as you drop low-confidence
days. Read which readings it leaned on, and whether that changed between years."* Falsifier on the card: *OOS Brier skill
inside the shuffled-target band for every horizon and asset group.*

**Mechanism.** Many weak, partly independent readings (macro and the 4h trend agree only 48% of days,
`macro-h4-blend`). A learner can only combine; it cannot create information. So any gain must exceed the best single
reading alone, and must survive a pipeline that has had every chance to overfit.

**Edge source (lesson #4).** Forecasting skill about the sign of the 07:00 → horizon move, beyond each instrument's
drift. Not a premium: the drift itself is in B0. Who is on the other side: nobody in particular at these sizes; the use is
the desk card's direction line and its "no view".

## 2. Why it is not already settled (required)

Every banked direction entry below is a single reading or a learned model on a different input set; none pools many
morning readings across 13 instruments and scores calibrated P(up) against B0 at four horizons.

| Nearest entry | Verdict | Why this is a different question |
|---|---|---|
| `analogue-weeks` (`MD files/WEEK_MAP.md#W1`) | NULL | A learned model (walk-forward nearest weeks on 21 macro z-scores) at a **13-week** horizon on 3 markets: S&P 75% vs 76% base. Here: daily morning readings, 0–5 day horizons, a parametric shrunk model, 13 instruments. **Screen applied:** its macro-score inputs are not used (no PIT history), and B0 is the yardstick it failed against |
| `gr-hmm-trend-direction` (`forge/GLOBAL_READ_UNTESTED_DIRECTION_PREREG.md`) | NULL | One latent-state label (HMM on 200 daily returns) as a next-day call on 7 pairs, IC −0.011 with MDE 0.027. **Screen applied:** no HMM state is a reading here; the daily trend reading is an explicit EMA slope, and the pipeline is linear-first (lesson #5) |
| `gr-us-yields-direction`, `gr-dollar-tape-direction`, `gr-risk-tone-direction` | NULL | single global macro reads, next day. Not inputs here (no reading of US yields, the broad dollar or HY OAS) |
| `fx-factor-carry`, `-momentum`, `-value`, `-surprise`, `-stack` (`forge/FX_FACTOR_STACK_PREREG.md`) | UNDERPOWERED | **Cross-sectional, monthly** ranks of 8 currencies. Here carry and the surprise enter as **time-series** readings at daily horizons beside price readings. **Screen applied:** carry and surprise are expected to add little (expectation in §4), and `fx-factor-surprise`'s thin non-US store is why only the US tier-1 surprise is used |
| `direction-bar` (`analysis/output/direction-bar/RESULTS.md`) | CONTEXT | The measuring instrument: B0 is the yardstick; a 1-day always-on signal needs IC ≈ 0.04; 6 instruments carry ≈ 3.5 independent forecasts, 7 USD pairs ≈ 2.8. Its MDEs are used in §5, and B2 momentum / B3 carry already failed as probability forecasts against B0 (BSS negative in 23/24 and 10/12) |
| `h4-trend-hold`, `macro-h4-blend`, `max-bias-reverse` (register, exploratory) | not banked | The 4h EMA20-slope rule lost (−0.04 R a day pre-lockbox). It is one reading (`tr4h`) and a benchmark here |
| `cot-crowding-p5` (VALIDATED), `positioning-into-release-direction` (VALIDATED) | — | sparse conditional states (crowded-trend pullback; release days vs a crowd). Here COT is one continuous reading among 13; the learner may or may not find those states |

No entry is re-run: this is the first combined learner, and the card's falsifier is new (shuffled-target band).

## 3. Definitions, fixed in advance (required)

### 3.1 Sessions, entry and targets

- **Session** d = London calendar date, weekdays only (data-rules item 1). M1 timestamps converted to Europe/London,
  never a fixed UTC hour. Read with a time filter that stops at **2026-08-21 21:00 London**; the runner asserts no later
  bar was read.
- **Entry** P0 = open of the M1 bar starting 07:00 London on d (allow 07:00–07:04; otherwise the row is dropped and
  counted per instrument).
- **Targets**, one per horizon h ∈ {0, 1, 3, 5}: P_h = close of the last M1 bar starting in 20:55–20:59 London on the
  h-th London session after d that has such a bar for that instrument (h = 0 is d itself). y_h = 1{P_h > P0},
  0 if P_h < P0, row dropped if equal. A row whose horizon end is after 2026-08-21 21:00 London is dropped.
  Missing 21:00 bars (US half-days, holidays) drop the row; counts reported.
- **Label realised** at 21:00 London on its end session. A row may be used for training, B0, inner selection or a
  threshold only from the next session's 07:00 onward (the purge rule, §3.5).

### 3.2 B0 (the yardstick) and M0

- **B0_{i,h}(d)** = (Σ y + 10) / (n + 20) over instrument i's horizon-h labels realised before 07:00 on d, from
  2016-01-04 (Beta(10, 10) prior; expanding; point-in-time, as `direction-bar`'s B0). Its drift bias is stated in
  `direction-bar` and is part of the yardstick, not a fault of the learner.
- **M0** = the exact learner pipeline with **no readings** (instrument effects only, on the B0 offset). Lesson #5: the
  claim is the out-of-sample gain over M0 and B0, not over 50%.

### 3.3 The readings (all knowable before 07:00 London on d)

Bars: H1 on the London clock; 4h on the UTC 4-hour grid (`t // 14400`, as `scripts/h4-trend-hold/backtest.py`); D1 =
NY-close (17:00 New York) daily bars built from M1 (data-rules item 2; never `*_d1.parquet`); W1 = Friday NY-close
weeks built from those D1. Only bars **completed before 07:00 London on d** are used. σ_day = SD of the last 20 NY-close
daily log returns (the `h4-trend-hold` σ), known at the last completed D1. d_i = the instrument's sign for a
USD-positive surprise, fixed as `forge/POST_RELEASE_DRIFT_POOLED_PREREG.md` §3.3: −1 EURUSD, GBPUSD, AUDUSD, NZDUSD,
GOLD, NAS100, SPX500, US30; +1 USDJPY, USDCAD, USDCHF; 0 EURJPY, GBPJPY.

| # | Reading | Formula | Source | PIT history |
|---|---|---|---|---|
| 1 | `tr1h` | slope of EMA20 of H1 closes over 3 bars, (EMA20_t − EMA20_{t−3}) / (s_bar·√3), s_bar = SD of the last 100 H1 log returns; clip ±4 | M1 | whole sample |
| 2 | `tr4h` | same on 4h bars (the `h4-trend-hold` slope, kept continuous) | M1 | whole sample |
| 3 | `trD` | same on NY-close D1 | M1 → D1 | whole sample |
| 4 | `trW` | same on W1 (s_bar from the last 52 weekly returns, min 26) | M1 → D1 → W1 | from ~2016-07 (warm-up) |
| 5 | `asia` | ln(close of the 06:59 bar / open of the 00:00 London bar) / σ_day | M1 | whole sample |
| 6 | `cloc` | prior London session (00:00–22:00, `london22`) (C − L)/(H − L) − 0.5; H = L → 0 | M1 | whole sample |
| 7 | `ev_today` | 1{a tier-1 US release (CPI, NFP, PPI, FOMC statement) is scheduled on d} | event table built by `scripts/post-release-drift-pooled/events.py` (its §3.1 sources: `calendar_events.csv` → 2026-07-02, `calendar_events_nasdaq.csv` after, ForexFactory 2010–17, FOMC schedule) | 2016 → 2026-08-21 (PPI from 2014) |
| 8 | `ev_tmrw` | the same for the next weekday ("pre-release day") | same | same |
| 9 | `surp` | the latest tier-1 surprise released before 07:00 on d and within the last 5 sessions: z_e (CPI/NFP/PPI, expanding-SD standardised) or z2_e (FOMC 2y CFD 15-min move), × d_i, clip ±3; else 0. A release at 08:30 ET on d is **after** 07:00 London and is not used for d | same table (`z_e`, `z2_e`, both point-in-time by its construction) | 2016 → |
| 10 | `carry` | r_base − r_quote (% p.a.), FX only (0 for gold and indices): 3m rates first print, published-before-d, USD = EFFR after 2013-06, EUR spliced to DE call money + offset after 2026-02-16, exactly `load_rates()` in `scripts/fx-factor-stack/run.py` (its A1.3) | feature store `features/rate3m_*.parquet`, `effr.parquet`, `rate_on_de.parquet` (`MFX_DATA_ROOT`) | 2005 → |
| 11 | `cot` | z of spec net / OI over the trailing 156 reports, **in the instrument's price terms**: EURUSD←EUR, GBPUSD←GBP, AUDUSD←AUD, NZDUSD←NZD, USDJPY←JPY, USDCAD←CAD, USDCHF←CHF (these three are stored in USD/xxx pair terms already: README), EURJPY = z_EUR + z_JPY(pair terms), GBPJPY = z_GBP + z_JPY(pair terms), GOLD←GOLD, NAS100←NQ, SPX500←ES, US30←YM. Usable from **report_date + 7 calendar days** (the Tuesday after; covers Monday holiday releases). Shutdown holds: the state stays at the last report published before 2018-12-22 until 2019-03-08, and before 2025-10-01 until 2026-01-31 (conservative catch-up bounds; any later true catch-up only lengthens the hold) | `analysis/output/cot-crowding-programme/cot_weekly.csv` (read `COT_WEEKLY_README.md`; fault #16) | 2006 → |
| 12 | `sigreg` | ln(σ_day / median of σ_day over the previous 250 sessions, min 120) | M1 → D1 | from ~2016-07 |
| 13 | `ivrv` | ln(IV / (σ_day·√252·100)), IV = the Cboe close dated **before** d: GVZ (GOLD), VXN (NAS100), VIX (SPX500), VXD (US30). FX: 0 in the primary model (see dropped) | `analysis/surfaces/cboe/{GVZ,VXN,VIX,VXD}.csv` (MM/DD/YYYY, CLOSE) | 2009 → |

A row enters only when all readings it uses are defined; the runner prints each instrument's first usable session.
Readings are standardised with the **training fold's** mean and SD only (lesson #14; full-sample statistics are
lookahead, data-rules item 4).

**Dropped, with reasons (no invented history):**

| Asked-for or nearby input | Why it is out |
|---|---|
| Desk ratings, Global Read story lean, FundaBias, analyst scorecard (`js/analystScorecard.js`) | no point-in-time history before 2026-10-14 / 2026-11-03 (card: "no desk or Global Read before 2026-10"). They are the forward twin's job (bias-scoreboard), not this one |
| FX implied vol (CME settlement IV, `oi_research_book/data/iv_daily_*`) in the primary model | exists only from 2020-09-09 and for 6 of the 9 pairs (no NZDUSD, EURJPY, GBPJPY). A missing-indicator would date-stamp the folds. Kept as a **descriptive** arm only (§6) |
| Non-US surprises | the surprise store has scored non-US actuals only since mid-2025 for a handful of series (`forge/FX_FACTOR_STACK_PREREG.md` A, why `fx-factor-surprise` was not registered) |
| GEX / dealer gamma | near-surface book covers ~770 of ~1,490 index sessions (`forge/DAY_TYPE_EXPANSION_PREREG.md` §3.4) |
| US 2y/10y yields, broad dollar, HY OAS as direction reads | banked NULL as next-day calls (`gr-us-yields-direction`, `gr-dollar-tape-direction`, `gr-risk-tone-direction`); the yield-spread arm had a GS2 publication lookahead (`fx-factor-stack` A1.1). Not in the card's list |
| HMM state | `gr-hmm-trend-direction` NULL; latent-state labels are not used (lessons #6, #14) |
| Max Cole's signals | 5 weeks of history |
| Carry and IV/RV for groups where they do not exist (carry on gold/indices; IV on FX) | set to 0 after standardisation, so those groups simply get no weight from them; stated, not imputed |

So the card's "about 15" becomes **13** readings.

### 3.4 Models (frozen)

- **Design**: x = [13 instrument one-hots | 13 standardised readings (pooled slopes) | 13 readings × 1{group = g} for
  g ∈ {FX, gold, indices} (asset-group deviations)] = 65 columns, plus a **fixed offset logit(B0_{i,h}(d))**. So the
  model learns departures from the point-in-time base rate, and all shrinkage is toward B0 (at infinite penalty the
  learner *is* B0). The one-hots let an instrument's level move off B0; the deviations are the "asset effects".
- **Primary, L2 logistic**: minimise Σ log-loss + ‖w‖² / (2C) (sklearn's `C` convention, no unpenalised term), solved
  by Newton/IRLS to 1e-9 relative change (checked against sklearn to 1e-8 on a test problem). One model per horizon.
- **C grid** {1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1}. **Selection rule, inside the training years only**:
  inner validation years = the last up to 3 calendar years of the training span; each is predicted by a model fitted on
  the training years before it (expanding, with the same purge). Score = the mean over inner months of the monthly mean
  Brier. Choose the C with the lowest score; ties go to the smaller C. (A one-SE rule toward smaller C was simulated
  and lost ~15% of the planted signal; not used.) The test year is never seen by the selection.
- **Secondary, shallow gradient boosting**: sklearn `HistGradientBoostingClassifier(max_depth=2, learning_rate=0.05,
  l2_regularization=1.0, min_samples_leaf=200, early_stopping=False, random_state=20261114)`; inputs = the 13 readings,
  the instrument as a categorical feature and logit(B0) as a feature (no offset support); `max_iter` ∈ {25, 50, 100,
  200} chosen by the same inner rule. Secondary means: scored against the same gates and reported, but **outside** the
  Holm family; it can lift no verdict above `CONTEXT` (§4).
- **Controls, through the identical pipeline**: M0 (no readings); **best single reading** = per fold, the one reading
  (with its group deviations) whose single-reading model has the best inner score, chosen inside the training years
  (the after-the-fact best single reading on test years is shown too, labelled as hindsight); **shuffled targets**
  (§3.8).

### 3.5 Walk-forward (fixed)

Expanding by calendar year. **Test years 2018, 2019, …, 2025 and 2026 (to 2026-08-21)**: 9 folds. Fold Y trains on
every row (all 13 instruments) dated from 2016-01-04 whose label was realised before the first session of Y (purge: the
last h sessions of Y−1 are not in training for horizon h). Rows from 2016-01-04 to 2017-12-29 are training only. The
last fold ends at the lockbox (2026-08-21). If the 2018 fold's training set has fewer than 2,000 rows after warm-up, the
2018 fold is dropped and the test span is 2019–2026 (a data rule the runner applies before reading any target, and
prints). Stability halves: **H1 = 2018–2021**, **H2 = 2022–2026-08-21**.

### 3.6 Metrics

- **Primary: BSS_B0** per horizon × asset group, pooled over the group's test rows of all folds:
  BSS = 1 − Σ(p − y)² / Σ(B0 − y)². Also BSS vs M0, and vs the best single reading.
- **Reliability**: deciles of p (pooled group test rows): mean p vs realised share, with n; recalibration
  logit P(y) = logit(B0) + a + b·(logit p − logit B0); intercept a and slope b with bootstrap CIs (lesson #18).
- **Accuracy–coverage (abstention)**: call = up if p > 0.5 else down; confidence = |p − 0.5|. Coverage thresholds q ∈
  {10, 20, 30, 50, 100}% are set from the **training** fold's in-sample p (point-in-time; realised coverage reported).
  At each q: accuracy of the learner's calls on its kept days, vs (i) **random abstention**: the same calls on random
  date-block subsets of equal size (1000 draws → 5th–95th band), and (ii) B0's own calls kept by |B0 − 0.5| at the same
  coverage.
- **R at 1σ risk on top-confidence days** (q = 20%): enter at P0 in the call's side, stop = 1·σ_day from P0, exit at the
  horizon's 21:00 close or at the stop on the M1 path (a gap through the stop fills at that bar's open), R = P&L /
  (σ_day·P0). Costs on: half-spread at the entry and exit minutes from `data/m1_bidask/<key>_m1.parquet` (2016-10 →; all
  test years covered). Shown gross and net, beside: random side on the same days (1000 draws), B0's side on the same
  days, the best single reading's top-20% days, and the 4h rule (`tr4h` sign) on every day. Descriptive (statistics and
  economics kept apart, as `direction-bar`).
- **Weight stability**: per fold, the standardised pooled slopes and group deviations at the chosen C; for each reading
  its sign in each of the 9 folds and the rank correlation of |w| between consecutive folds; GBM permutation
  importance per test year. A reading is **sign-stable** when its pooled slope has the same sign in ≥ 7 of 9 folds.

### 3.7 Abstention and R are read on the same days

The q = 20% threshold is the one registered for both the abstention gate (G7) and the R table. Other q values are
descriptive.

### 3.8 Uncertainty, noise threshold, p-values

- **Bootstrap**: per test date, sum each model's squared error over the group's instruments; moving-block bootstrap of
  dates, block 21 sessions (≥ h + 1 for every horizon), B = 2000, seed 20261114 → 95% percentile CIs for BSS_B0,
  BSS_M0, ΔBSS vs best single, accuracy differences.
- **Shuffled-target null (the card's noise threshold)**: permute whole 21-session blocks of dates of the **target
  matrix** (all 13 instruments and all four horizons of a date move together, so cross-instrument correlation and
  overlap are kept), leave every reading in place, recompute B0 from the shuffled targets, and rerun the entire
  walk-forward including the C selection. **200 shuffles** for the logistic (whole-cluster shuffles, many of them, per
  the 2026-11-04 and 2026-11-07 lessons). The real BSS_B0 is read as a percentile of that distribution.
- **p-value**: z = BSS_B0 / SE with **SE = max(bootstrap SE, SD of the shuffle distribution)**; two-sided normal p
  (`pFromCI` logic), stated as an approximation.
- **Positive control (lesson #1), before any real target is read**: the runner's exact pipeline on the **real
  readings** with synthetic targets from `power_sim.py`'s generator (composite of `trD`, `carry`/`sigreg`, `cot`,
  `asia`): planted daily IC 0.12 must give BSS_B0 CI lower > 0 and beat the 95th percentile of 20 shuffles in the FX
  group at h = 0; IC 0 must give **no false pass** (CI lower ≤ 0 or below the shuffle 95th percentile). If either fails,
  fix the code; no real target is scored until both hold. Written to `analysis/output/bias-learner/positive_control.json`.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | FX (9 pairs): does the learner beat B0 on Brier out of sample at any horizon? | **Null or underpowered.** Expected BSS_B0 ≈ 0 (−0.02% to +0.05%): the 1-day direction priors are near zero (`gr-*` nulls, B2/B3 negative vs B0), and heavy shrinkage keeps p near B0 |
| b | Gold: same | **Null / underpowered**: one instrument, MDE several times the plausible effect |
| c | Indices (3): same | **Null / underpowered**: indices move together (ρ ≈ 0.85), so 3 instruments ≈ 1.2 independent forecasts; `ivrv` may add a sliver at +3/+5 (vol-risk-premium drift) |
| d | Does the learner beat the best single reading (chosen in training)? | **No** (a combination of near-zero readings ≈ the best one) |
| e | Abstention: is accuracy on the top-20% days above random abstention? | **No**, or only for index drift days where B0 already says "up" |
| f | Weights: are any readings sign-stable (≥ 7/9 folds)? | `trW`/`trD` momentum on indices and `carry` on FX may be; the rest flip |
| g | GBM (secondary) beats the logistic? | **No**; expected worse (lesson #5: linear first) |
| — | **THE GATE** per horizon × group cell (12 cells): **G1** BSS_B0 95% CI lower > 0 **and** Holm-adjusted p < 0.05 over the 12 cells; **G2** BSS vs M0 > 0 (CI lower > 0); **G3** BSS_B0 above the best-single-reading control's BSS_B0 (point estimate; ΔBSS CI reported); **G4** real BSS_B0 above the **95th percentile** of the 200-shuffle null; **G5** BSS_B0 > 0 in both halves H1 and H2; **G6** recalibration slope b ≥ 0.5 (not overconfident); **G7** abstention: at q = 20%, the learner's accuracy is above the random-abstention 95th percentile **and** above B0's own 20%-coverage accuracy (difference CI lower > 0) | |
| — | **THE MIRROR** | The sign mirror is built in (P(down) = 1 − P(up)). The abstention mirror: the learner's **bottom**-confidence 50% must show accuracy no better than B0's on the same days, reported. The day-block-shuffled targets are the placebo |

**Verdict per cell** (U = the useful effect, §5):

| Result | Word |
|---|---|
| G1–G7 all hold | `VALIDATED` (research-only; promotion to the live card needs |z| ≥ 3 on that cell or a forward record) |
| G1 and G4 hold, any of G2, G3, G5, G6, G7 fails; or the GBM alone passes G1–G4 | `CONTEXT` (real but carried by one reading, unstable, miscalibrated or unable to abstain; a GBM-only pass is a non-linear candidate for its own prereg) |
| G1 fails, the cell is POWERED (§5) and the BSS_B0 95% CI upper bound < U | `NULL` |
| otherwise (CI upper ≥ U, or the cell is UNDERPOWERED by §5) | `UNDERPOWERED` |

A cell that VALIDATES but has **no** sign-stable reading is demoted to `CONTEXT` (the weights changed between years,
so nothing durable was learned). **Banked word per group** (`bias-learner-<group>`): VALIDATED if any of its four
horizon cells is; else CONTEXT if any is; else NULL if every cell is NULL; else UNDERPOWERED. The headline is the cell
with the largest BSS_B0 lower bound, stated as chosen after the fact. The card's falsifier ("every horizon and group
inside the shuffled band") is reported as one line.

## 5. Power — what this design can and cannot find (required)

POWER_TABLE_PLACEHOLDER

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: 12** = horizons {21:00, +1, +3, +5} × groups {FX, gold, indices}, statistic BSS_B0 of the L2
  logistic. **Holm at α = 0.05** across all 12 (G1). G2–G7 are conjunctive on top (no further correction).
- **Variants run (all logged here, nothing added later):** the primary logistic; the GBM (secondary, outside Holm, can
  only reach CONTEXT); M0; the best single reading (in-training choice and hindsight choice); 200 shuffles.
- **Disaggregation (BH q = 0.10, with `chanceBaseline`)**: 52 instrument × horizon BSS_B0 cells; per test year;
  event days (`ev_today` or `ev_tmrw`) vs other days. Survivors are candidates for their own prereg, never a result.
- **Descriptive, no weight**: reliability deciles; all coverage levels; R tables; weight paths and GBM importances; the
  FX-IV arm (primary design + `ivrv` from CME IV for EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, USDCHF, test years
  2021–2026, vs the same rows without it); a rolling 3-year fit window beside the expanding one (lesson #19); σ_day =
  HAR-style 60-day SD as a second scale for `asia` and R (lesson #10); concentration (by year, without the top 1% of
  |P_h − P0| days, the last 3 years alone).
- p-values from z with the §3.8 SE (normal approximation), stated as such.

## 7. What this does NOT test (required)

- **Tradability.** The R table is descriptive; a pass is a probability-forecast claim, not a strategy. Promotion to
  anything that sizes a position needs |t| ≥ 3 or a forward record.
- **Cause.** Readings overlap (the trends are nested; `cloc` and `asia` share the prior day); no coefficient is read as
  a mechanism. Stability is reported, not interpreted causally.
- **Inputs without history.** Desk, Global Read, FundaBias, the analyst scorecard, FX IV before 2020, non-US surprises.
  A null here says nothing about them; they belong to the forward bias-scoreboard (Q4) and its Hedge-weighting amendment.
- **Intraday updating.** Only 07:00 information; no re-forecast during the day.
- **Other horizons, instruments or windows, and the lockbox period.** Nothing after 2026-08-21.
- **Range or day type.** That is `day-type-expansion` (Q1).

## 8. What each verdict changes (required)

- **VALIDATED** (a group) → ledger entry; the learner's P(up) and its "no view" (below the q = 20% threshold) become a
  research-only direction line on the desk card for that group, shown beside B0 (shadow; nothing live changes until the
  owner chooses); the analyst-scorecard feedback is proposed to the owner with the same shrink-toward-B0 weighting.
- **CONTEXT** → ledger entry; the card may name the one reading that carries it (if G3 failed) or say the tilt is
  unstable; no direction line from the learner.
- **NULL** → ledger entry; the card says direction on this morning information is not learnable at 0–5 days for that
  group, and keeps day type plus event-led direction only (Q1/Q2), abstaining otherwise.
- **UNDERPOWERED** → ledger entry; testable only on a longer pooled history (pre-2016 M1, more instruments) or on the
  forward bias-scoreboard after 120+ days.

## 9. Method lessons applied (`education/RESEARCH_METHOD_LESSONS.md`, `references/stats-defaults.md`)

- **#1 positive control (DO WORSE)**: the power simulation plants a known IC from outside the pipeline and reads what
  the exact pipeline recovers (§5), and the runner repeats it on the real readings before any target (§3.8).
- **#5 linear baseline first (DO WORSE)**: L2 logistic is primary; GBM is secondary and capped at CONTEXT; M0 and B0
  are the yardsticks.
- **#6 / #14 regime and latent states (DON'T DO / DO WORSE)**: no HMM or latent state; every standardisation, regime
  median and coverage threshold is computed from data dated before the row (training fold only).
- **#10 two proxy specs (DO WORSE)**: σ_day on a 20- and a 60-day window.
- **#11 horizon-matched, overlapping outcomes (DON'T DO)**: overlapping +3/+5 targets are handled by the purge rule,
  the 21-session date-block bootstrap and the block-shuffled null, not by counting rows as independent.
- **#12 name what the extension gives up (DO WORSE)**: the null BSS of the shrunk pipeline (its overfit cost) is in §5.
- **#18 bias vs slope (DO WORSE)**: recalibration intercept and slope reported, slope gated (G6).
- **#19 fit window (DO WORSE)**: rolling 3-year arm beside expanding.
- **#25 quantile ladder (DO WORSE)**: reliability by decile and the whole accuracy–coverage curve, not top-minus-bottom.
- **"Tune on train only"; "small IC is normal; very high accuracy is a red flag"**: C and `max_iter` chosen inside the
  training years; data-rules item 10 (a strong result triggers the concentration checks).
- **stats-defaults 2026-10-21 (yield-predictive-ladder)**: a shrunk model recovers much less than an ideal IC test, so
  the MDE in §5 is from the exact shrunk pipeline, not an IC formula. **2026-11-04 / 2026-11-07**: whole-cluster shuffles,
  many of them, with a percentile gate registered up front, and an SE floor from the shuffle SD.
- **QG notes on HMM / model audits** (lesson #6, `model-audits` Q1): apply to the excluded HMM state; nothing here
  needs a state-count or relabel audit.

## 10. Data the owner's laptop run needs

- M1 mid, 2016-01-04 → 2026-08-21: `VolRangeForecaster/data/m1/{eurusd,gbpusd,usdjpy,usdcad,audusd,nzdusd,usdchf,eurjpy,gbpjpy,gold}_m1.parquet`;
  `portfolioBacktest/cache/{nq,spx500,us30}_m1.parquet` (NAS100 = `nq`). Never the R2 tail; nothing written to R2.
- Costs (R table only): `data/m1_bidask/<key>_m1.parquet`.
- Feature store (`MFX_DATA_ROOT`): `features/rate3m_{usd,eur,gbp,jpy,aud,nzd,cad,chf}.parquet`, `features/effr.parquet`,
  `features/rate_on_de.parquet`.
- In the repo: `analysis/output/cot-crowding-programme/cot_weekly.csv`; `analysis/surfaces/cboe/{VIX,VXN,VXD,GVZ}.csv`;
  `oi_research_book/data/iv_daily_*.parquet` (FX-IV arm).
- The tier-1 event table from `scripts/post-release-drift-pooled/events.py` (its inputs per that prereg §3.1, incl.
  `analysis/output/rate-surprise-events/events.parquet` and `m15/USB02Y_USD.parquet`).
- Run `node scripts/data_integrity.mjs` first and record what is stale (data-rules item 8).

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS
**§5 was committed with a placeholder** because the power simulation was still running when the prereg was pushed
(`f3f1365b`). This fills it. No market data was read: `scripts/bias-learner/power_sim.py` (seed 20261114) uses
synthetic readings **and** synthetic targets (13 instruments × every weekday 2016-01-04 → 2026-08-21; returns
cross-correlated FX 0.47, gold 0.30 on the FX factor, indices 0.85; readings built like the real ones, trends from past
simulated returns; a planted daily IC on a composite of `trD`, `carry`/`sigreg`, `cot`, `asia`), and runs the exact §3.4–3.5
pipeline (offset on logit B0, 65 columns, the C rule, 9 expanding folds 2018–2026, purge). 24 draws per planted IC;
40 day-block shuffles per cell (4 null draws × 10). Output `analysis/output/bias-learner/power_sim.json`; the table the
runner reads is `scripts/bias-learner/power_table.json`.

**Rules fixed here.** SD of BSS_B0 under no signal = max(Monte-Carlo SD across null draws, SD of the shuffle
distribution). **MDE** = (z + 0.84) × SD, z = 2.87 (Holm's first step, 0.05/12) and 1.96 (last step). **U (useful
effect)** = the mean BSS_B0 the exact pipeline recovers from a planted daily **IC of 0.08**, i.e. a hit-rate gain over B0
of ≈ 1.3 pp at 21:00, 1.5 at +1, 1.9 at +3, 2.3 at +5 (the card's "1–2 pp"). A cell is POWERED when its Holm-first MDE ≤ U.

| Cell | Null mean BSS (overfit cost) | SD: MC / shuffle | **MDE** Holm first / last | Recovered BSS at planted IC 0.05 / 0.08 / 0.12 | Pass bar U | Verdict |
|---|---|---|---|---|---|---|
| 21:00 × fx | −0.014% | 0.022% / 0.032% | **0.119% / 0.090%** | +0.021% / +0.186% / +0.600% | +0.186% | POWERED |
| 21:00 × gold | −0.012% | 0.050% / 0.036% | **0.186% / 0.141%** | +0.047% / +0.131% / +0.491% | +0.131% | UNDERPOWERED |
| 21:00 × idx | −0.021% | 0.043% / 0.030% | **0.158% / 0.120%** | +0.008% / +0.113% / +0.471% | +0.113% | UNDERPOWERED |
| +1 × fx | −0.028% | 0.046% / 0.043% | **0.170% / 0.128%** | +0.042% / +0.239% / +0.842% | +0.239% | POWERED |
| +1 × gold | −0.018% | 0.068% / 0.049% | **0.253% / 0.191%** | +0.052% / +0.218% / +0.698% | +0.218% | UNDERPOWERED |
| +1 × idx | −0.028% | 0.062% / 0.060% | **0.230% / 0.174%** | +0.011% / +0.132% / +0.658% | +0.132% | UNDERPOWERED |
| +3 × fx | −0.053% | 0.062% / 0.042% | **0.228% / 0.172%** | +0.096% / +0.372% / +1.432% | +0.372% | POWERED |
| +3 × gold | −0.046% | 0.174% / 0.099% | **0.646% / 0.488%** | +0.041% / +0.318% / +1.292% | +0.318% | UNDERPOWERED |
| +3 × idx | −0.053% | 0.125% / 0.085% | **0.462% / 0.349%** | +0.064% / +0.275% / +1.228% | +0.275% | UNDERPOWERED |
| +5 × fx | −0.056% | 0.108% / 0.092% | **0.402% / 0.303%** | +0.107% / +0.528% / +1.830% | +0.528% | POWERED |
| +5 × gold | −0.032% | 0.207% / 0.189% | **0.766% / 0.578%** | +0.035% / +0.321% / +1.735% | +0.321% | UNDERPOWERED |
| +5 × idx | −0.069% | 0.172% / 0.209% | **0.774% / 0.584%** | +0.111% / +0.398% / +1.476% | +0.398% | UNDERPOWERED |

Readings: (1) only the **FX** cells can resolve U; gold and the indices can only find effects of roughly IC 0.10–0.12, so
an empty result there banks `UNDERPOWERED` by design (the §4 table already says so). (2) The shrunk pipeline recovers
little of a weak signal: planted IC 0.05 (the `direction-bar` always-on bar is 0.04) comes back as +0.02% at 21:00, about
a tenth of the ideal ≈ 0.16% (the 2026-10-21 lesson, measured here, not assumed). The inner rule chose C ≤ 3e-4 in ~70%
of folds. (3) The overfit cost is small (−0.01% to −0.07%) because shrinkage is toward B0. (4) In the simulation the
learner without the B0 offset "beat" B0 by ~0.1% by shrinking per-instrument base rates (B0 noise, not readings), which
is why the offset and the M0 gate (G2) are in the design. (5) Not simulated: label autocorrelation in real returns and
B0 drift; the shuffle SE floor (§3.8) covers both in the real run. The GBM is not in the simulation (secondary).

**Runner details fixed while writing `scripts/bias-learner/run.py` (no real data read; the M1 is not in this
container):** (a) the GBM's `max_iter` is chosen from staged predictions of one 200-iteration fit per inner fold (the
same as separate fits, cheaper); the GBM pass test is G1 at raw p < 0.05 with CI lower > 0 plus G4 against the
logistic's shuffle 95th percentile; (b) a weekly bar completes with its last NY-close daily bar (a short holiday week
completes on its last trading day); (c) rows with a NaN in any reading that exists for their group are dropped and
counted; (d) the random-abstention band draws contiguous 21-session date blocks until the kept count is reached;
(e) the positive control uses 20 shuffles (a code check, not a scored cell); the scored cells use the registered 200;
(f) the recalibration-slope CI uses 500 of the 2000 bootstrap draws (G6 gates the point estimate only); (g) per-
instrument disaggregation uses B = 1000. (h) **Abstention thresholds (changes §3.6):** the coverage cut for q is the (1 − q)
quantile of |p − 0.5| over the fold's **inner validation predictions at the chosen C** (out-of-sample, dated before the
test year), not over in-sample training predictions: in-sample p is wider than out-of-sample p, and the end-to-end
smoke run on synthetic files realised ~2% coverage for a 20% target. B0's own cut uses B0 on the same inner rows. The
first fold falls back to in-sample p only if it has no inner year. (i) The runner also has `--smoke`: the real code path
end to end on a synthetic file tree (2015-06 → 2019-06); it checks that the run completes and writes, and scores nothing
real.

---

### A2 — 2026-11-14 — PRE-RESULTS

Loader bug fix, no design change. On the laptop's real M1 caches (`VolRangeForecaster/data/m1`, `portfolioBacktest/cache`) the time column `datetime` is stored as the pandas index in the parquet metadata, so `to_table(...).to_pandas()` in `scripts/bias-learner/run.py` (the M1 reader) restored it as the index and the column lookup raised `KeyError: 'datetime'` before any M1 was scored (the selftest's synthetic files carry no pandas index metadata, so it passed). Fix: `.to_pandas()` → `.to_pandas(ignore_metadata=True)` on that one line. Same rows, same values, same read-time lockbox filter and asserts; no pass bar, metric, window or design changed. No scored result had been printed when this was made.

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/bias-learner/RESULTS.md` and `results.json` (seed 20261114). Nothing above this line
changes after the run.*
