# mtf-structure — Do multi-timeframe structure states (EMA trend, confirmed swings, filtered HMM states on W1/D1/H4/H1) change the next 24h / 3d / 5d direction against the base rate, and does timeframe conflict used as "no view" raise accuracy on the days kept?

**Pre-registered 2026-11-15, before any outcome was computed.** No market data was read to write this document. The
power table (§5) is a pure simulation (`scripts/mtf-structure/power_sim.py`: synthetic panel, no prices, no outcomes;
output `analysis/output/mtf-structure/power_sim.json`).

| | |
|---|---|
| ID / ledger id | `mtf-structure`; one scored ledger entry per family: `mtf-structure-ema`, `mtf-structure-swing`, `mtf-structure-hmm`, `mtf-structure-pullback`, `mtf-structure-conflict-ema`, `mtf-structure-conflict-hmm` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `mtf-structure` (CLAIMED 2026-11-15; the register is maintained by the parent session) |
| Data | 13 instruments, the `scripts/h4-trend-hold/backtest.py` `SYM` set mapped to local OANDA mid M1: EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, EURJPY, GBPJPY, GOLD (`VolRangeForecaster/data/m1/<key>_m1.parquet`), NAS100 (`nq`), SPX500 (`spx500`), US30 (`us30`) (`portfolioBacktest/cache/<key>_m1.parquet`). M1 2016-01-04 → **2026-08-21 lockbox** (read filter stops at 2026-08-21 20:00 UTC; the runner asserts no later bar and no horizon end after 2026-08-21). Scored test sessions 2018-01-02 → 2026-08-21; 2016-2017 are warm-up / training only. Never R2 (all `R2_*` env vars unset) |
| Seed | `20261115` (every script, every bootstrap, shuffle, plant and HMM start) |
| Uncertainty | moving-block bootstrap over **dates** (all 13 instruments of a date move together), block 21 sessions, B = 2000; SE floor = SD of 200 whole-block date shuffles of the outcome matrix (§3.7) |
| Scripts / outputs | `scripts/mtf-structure/` (`run.py`, `power_sim.py`) → `analysis/output/mtf-structure/` (`RESULTS.md`, `results.json`, one evidence pack per family under `<family>/evidence/`) |
| Harness | own Python script (`python -X utf8 -I`): `analysis/study.mjs` / `runStudy.mjs` have no HMM or multi-timeframe bar path. CPU capped: `OMP_NUM_THREADS=2`, `MKL_NUM_THREADS=2`, ≤ 2 worker processes |

## 1. The claim (required)

The owner (2026-11-15), `plans/DAILY_BIAS_REVIEW.md` §5 test 2 ("Multi-timeframe HMM structure, done properly": weekly,
daily, 4h and 1h states; filtered probabilities only; state count chosen on held-out data; alignment patterns — all
agree; HTF up with LTF pullback — against the base rate, a plain σ-chain and the bias-learner) and
`plans/BIAS_RESEARCH_SYNTHESIS.md` **P1**: *"do W1/D1/H4 alignment states (EMA trend and confirmed swing structure), and
HMM states aligned across timeframes with filtered labels, change the 24h–5-day direction against B0? Does timeframe
conflict as 'no view' raise the accuracy of the days you keep? Benchmarks: named-state chain, bias learner, random
abstention."* The synthesis's own expectation: *"Low for direction, real for abstention."* The desk habit behind it is the
educators' top-down read (higher timeframe sets the side, lower timeframe the timing; stand aside when they disagree:
the gold method's NEUTRAL rule).

**Mechanism.** If trends persist at several scales at once, a day when every timeframe points the same way should
continue more often than the base rate; when timeframes disagree, the next move is closer to a coin, so abstaining
should lift accuracy on the days kept. HMM states are a data-driven version of "trend regime".

**Edge source (lesson #4).** Forecasting skill on the sign of the 07:00 → 07:00 move beyond each instrument's drift (the
drift is in B0). No premium is claimed; the use is the desk card's direction line and its "no view".

## 2. Why it is not already settled (required)

| Nearest entry | Verdict | Why this is a different question |
|---|---|---|
| `gr-hmm-trend-direction` (`forge/GLOBAL_READ_UNTESTED_DIRECTION_PREREG.md`) | NULL | **One** timeframe (an HMM on 200 daily returns, TREND regime + 10-day t-stat), 7 dollar pairs, next-day IC −0.011 [−0.030, +0.008], MDE 0.027. Here: four timeframes (W1/D1/H4/H1), alignment across them, state count by held-out likelihood, filtered one-step predictive mean, refit walk-forward by year, 13 instruments, 1/3/5-day horizons, and the conflict-as-abstention question it never asked. **Screen applied:** a single-TF HMM direction is not scored again (it appears only as the D1 base call of the abstention cell, whose question is the filter, not the call) |
| `bias-learner-fx` NULL / `-gold`, `-idx` UNDERPOWERED (`forge/BIAS_LEARNER_PREREG.md`) | NULL / UNDERPOWERED | A regularised logistic over 13 continuous readings including EMA20 slopes on 1h/4h/D1/W1 (`tr1h`..`trW`), scored as P(up) Brier skill; FX BSS vs B0 +0.05% to +0.15%, all CIs below the useful bar; top-20% accuracy 0.538–0.547 vs B0 0.539–0.565. It explicitly **excluded** HMM states and never formed discrete **alignment / conflict** states or swing structure. Here those are the object. **Screen applied:** the learner is a benchmark (§3.6), so a pass must also be read against its top-confidence accuracy |
| `h4-trend-hold`, `max-bias-reverse` (register, exploratory, not banked) | — | The single 4h EMA20-slope side lost (−0.04R a day pre-lockbox); Max Cole's first daily side matched the 4h slope 84%. One timeframe; here H4 is one of four |
| `exit-on-fixed-entries` (NULL) | NULL | exits on the 4h-slope entry; no exit rescues it. Not a direction test |
| `direction-bar` (CONTEXT) | — | the measuring stick: B0 point-in-time base rate is the yardstick; a 1-day always-on signal needs IC ≈ 0.04 |
| memory / `project_hmm_variance_not_direction` | — | HMM RANGE state is quiet, not directionless: HMMs on returns separate variance. Expectation in §4 follows it |

Prior art in the method lessons (`education/RESEARCH_METHOD_LESSONS.md`), applied here:
- **#5 linear / named baseline first**: every HMM cell is read against an explicit **named-state σ-chain** through the
  identical alignment pipeline (§3.4), and against B0. An HMM cell cannot pass unless it beats the named chain (G5).
- **#6 latent-state checks**: K ∈ {2, 3} chosen per fold on held-out likelihood, 4 random starts, refit per year;
  dwell / flip rates reported beside the named chain and EMA states (descriptive; `model-audits` Q1 is a separate card
  and is not answered here).
- **#14 causal labels**: filtered (forward-only) probabilities only; Viterbi and smoothed probabilities are used
  **only** as the deliberate-leak canary (§3.8).
- **#1 positive control**: `run.py --selftest` (synthetic) must pass before any real outcome is read, and every scored
  cell gets a planted-effect control on the real rows (G6).
- `.claude/skills/research-director/agendas/model-audits.md` Q1 (does the HMM label stay put; does it beat a plain
  chain) — the "beats a named chain" half is gate G5 here; relabel-on-refit is not scored.

No banked null is re-run: no entry scored alignment or conflict states across timeframes, swing structure, or HMMs on
more than one timeframe.

## 3. Definitions, fixed in advance (required)

### 3.1 Sessions, entry, outcomes

- **Session** d = London calendar date, weekdays (data-rules item 1); M1 timestamps converted to Europe/London.
- **Entry** P0(d) = open of the first M1 bar starting 07:00–07:04 London on d; otherwise no row (counted).
- **Outcomes** for h ∈ {1, 3, 5}: d_h = the h-th later session of that instrument with a P0. y_h = 1{P0(d_h) > P0(d)},
  0 if lower, row dropped if equal or if d_h > 2026-08-21. "24h" = h 1. Also kept (descriptive): the σ-scaled move
  m_h = ln(P0(d_h)/P0(d)) / σ_day, σ_day = SD of the last 20 NY-close daily log returns known at 07:00.
- **B0_{i,h}(d)** = (Σ y + 10) / (n + 20) over instrument i's horizon-h labels whose end session d_h < d, from
  2016-01-04 (Beta(10,10), expanding, point-in-time; as `bias-learner` / `direction-bar`).
- **Excess** e = y − B0. For a call `side` ∈ {+1, −1}, side·e = 1{call right} − P_B0(call right). Its mean over called
  rows is the **hit-rate excess over B0** (probability units; 0.03 = 3 percentage points).

### 3.2 Bars (all from M1; only bars **completed at or before 07:00 London on d** are read)

- **H1**: UTC hour grid (London is a whole-hour offset), completes at the hour end.
- **H4**: UTC 4-hour grid (`t // 14400`), as `scripts/h4-trend-hold/backtest.py`.
- **D1**: NY-close days (17:00 New York; label = NY date of t_NY + 7h; weekend labels dropped), completes 17:00 NY on
  its label (data-rules item 2; never `*_d1.parquet`).
- **W1**: Friday NY-close weeks from D1 (`W-FRI`), completes with its last D1 bar.
- OHLC per bar = first open, max high, min low, last close of its M1 bars.

### 3.3 Per-timeframe states (tf ∈ {W1, D1, H4, H1})

- **EMA trend** T_tf = sign(EMA20 − EMA50) of closes (EMA seeded at the first close; undefined for the first 50 bars).
- **Confirmed swing structure** S_tf: a swing high at bar j when high_j > the highs of bars j−1, j−2 and high_j ≥ the
  highs of j+1, j+2; a swing low mirrored. A swing is **confirmed at the completion of bar j+2** (no lookahead). With
  SH2/SH1 the last two confirmed swing highs (newest second) and SL2/SL1 the lows: S = +1 if SH2 > SH1 and SL2 > SL1
  (higher highs and higher lows), −1 if SH2 < SH1 and SL2 < SL1, else 0.
- **Filtered HMM direction** H_tf: per instrument, timeframe and test year Y (2018 … 2026), a 1-D Gaussian HMM
  (`hmmlearn.GaussianHMM`, `covariance_type='diag'`, `n_iter=200`, `tol=1e-4`, `min_covar=1e-3`) on that timeframe's
  bar log returns divided by their **training-window** SD. Training window = bars completed before 00:00 UTC on 1 Jan
  of Y, from 2016-01-04, capped to the most recent 15,000 bars (binds on H1 only). **K ∈ {2, 3}**: fit each K on the
  first 80% of the training window with 4 starts (`random_state` = 20261115 + s, s = 0..3; best training log-likelihood
  kept) and choose the K with the higher log-likelihood on the last 20%; refit the chosen K on the whole window with 4
  starts. **Filtered** probabilities α_t (forward recursion only, fixed fold parameters, run from the window start
  through the test year): α_t uses returns ≤ t. H_tf at bar t = sign(α_t · A · μ), the one-step-ahead predicted mean.
  Fold-Y parameters are used for every session of year Y (including W1/D1 bars completed in late Y−1).
- **Named-state σ-chain** N_tf (the benchmark, lesson #5 / QG's rule): state at bar t = (sign of the sum of the last 20
  bar log returns) × (20-bar return SD above / at-or-below its median over the previous 250 bars, min 100): 4 named
  states. N_tf = sign of the **training-window** mean of the next bar's return given the state (same fold windows as the
  HMM; a state with no training rows → 0).
- **Smoothed HMM direction** (canary only, never scored): the same rule with forward-backward posteriors over the
  window start → end of year Y (`predict_proba`), which reads returns after t.

The value of a state on session d = its value on the last bar of that timeframe completed ≤ 07:00 London on d.

### 3.4 Families (each gives `side` per instrument-session; 0 = no call)

| Family (ledger id) | Called when | side |
|---|---|---|
| **F1 EMA alignment** (`-ema`) | T_W1 = T_D1 = T_H4 = T_H1 = s | s |
| **F2 swing alignment** (`-swing`) | S_W1 = S_D1 = S_H4 = S_H1 = s ≠ 0 | s |
| **F3 HMM alignment** (`-hmm`) | H_W1 = H_D1 = H_H4 = H_H1 = s ≠ 0 | s |
| **F4 HTF trend, LTF pullback** (`-pullback`) | T_W1 = T_D1 = s and T_H4 = T_H1 = −s | s (buy the pullback in the higher-timeframe trend) |
| **F5 conflict as no view, EMA** (`-conflict-ema`) | base call = T_D1 on every session; kept = F1-aligned sessions | T_D1 |
| **F6 conflict as no view, HMM** (`-conflict-hmm`) | base call = H_D1 on every session; kept = F3-aligned sessions | H_D1 |
| N (benchmark, not scored alone) | N_W1 = N_D1 = N_H4 = N_H1 = s ≠ 0 | s |
| N-conflict (benchmark) | base = N_D1, kept = N-aligned | N_D1 |

**Statistics.** F1–F4: hit-rate excess E = Σ side·e / Σ|side| over called rows (all instruments pooled, test sessions).
F5, F6: **Δ = E(kept rows) − E(all base-call rows)**: what conflict-abstention adds over always calling the D1 side.
Random abstention at the same keep rate has expected Δ = 0 and its 1000-draw band is reported (§3.6).

**Mirrors.** F1–F3 against the trend = −E (a significant negative E is reported as WRONG SIGN / mirror, never as a
pass). F4's mirror (side = the lower-timeframe direction, "the pullback continues") = −E(F4).

### 3.5 Sample, folds, halves

Test sessions 2018-01-02 → 2026-08-21 (9 test years, HMM refit per year; EMA / swing states need no fit). Stability
halves: **H1 = 2018–2021**, **H2 = 2022 → 2026-08-21**.

### 3.6 Benchmarks

- **B0** (inside every statistic, via e).
- **Named-state σ-chain** N through the same alignment (F3 vs N) and conflict (F6 vs N-conflict) pipeline: gate G5.
- **Random abstention** (F5, F6): within each instrument, keep the same number of base-call rows at random, 1000
  draws → Δ band (5th–95th and 2.5th–97.5th); G4 for F5/F6 is "Δ above the 97.5th percentile of that band" in place
  of the outcome shuffle.
- **bias-learner** (descriptive, not a gate): its banked top-20% accuracy (21:00 / +1 / +3 / +5, by group, from
  `analysis/output/bias-learner/RESULTS.md`) beside each family's raw hit rate and B0 hit rate by group. Its targets end
  at 21:00 London, ours at 07:00, so the comparison is approximate and is labelled so.

### 3.7 Uncertainty and p-values

- Per test date, sum side·e and |side| over instruments (for F5/F6 both kept and all); moving-block bootstrap of
  dates, block 21 (≥ h + 1), B = 2000, seed 20261115 → 95% percentile CI of E (ratio of sums) and Δ.
- **Outcome shuffle (noise threshold)**: permute whole 21-session blocks of dates of the excess matrix (all
  instruments and horizons of a date move together; states stay in place), 200 shuffles → the real value's percentile
  and the shuffle SD.
- **p** = two-sided normal with z = est / SE, **SE = max(bootstrap SE, shuffle SD)** (an approximation, stated).

### 3.8 Controls

- **Selftest (before any real outcome; `run.py --selftest`, synthetic only)**: (i) a planted alignment effect of
  +0.06 hit-rate on a synthetic 13-instrument panel is recovered (CI lower > 0) and a zero effect is not flagged
  (|z| < 2.99); (ii) on a synthetic 2-state Gaussian HMM series the forward filter equals hmmlearn's posterior at the
  last observation, the filtered direction is unchanged when future returns are perturbed, and the **smoothed**
  direction's next-observation accuracy beats the filtered one by ≥ 2 pp (the leak is visible); (iii) on synthetic M1,
  perturbing every bar after 07:00 London on a date leaves every EMA / swing / named state on that date unchanged.
- **Planted control on the real rows, per scored cell (G6)**: on the real called rows, flip a random share
  q = bar / (1 − hit-rate) of the wrong calls to right (a bar-sized hit-rate gain); 40 plants; detection = the
  planted z ≥ 2.99 (Holm first step). POWERED when detection ≥ 80%.
- **Evidence pack** (`scripts/evidence_pack/pack.py` `build_pack`) per family at h = 1 (24h): rows = called rows
  (F5/F6: base-call rows with signal = kept flag), outcome = e, cluster = 21-session date block; `plant_fn` adds a
  bar-sized drift in the state's direction to the real e; `leak_fn` = the **smoothed-HMM** side (F3, F6) or
  **tomorrow's sign** (F1, F2, F4, F5). Its diagnosis label is reported; it does not change the verdict.
- **Concentration** (descriptive): by year, by asset group (FX / gold / indices), by instrument (BH q = 0.10 with the
  chance baseline), without the top 1% of contributing dates.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | F1 EMA alignment: E at h 1/3/5 | **Null**; |E| < 0.02 (the 4h slope lost; bias-learner flat on the same EMA readings) |
| b | F2 swing alignment | **Null**; rare state, likely underpowered at 3d/5d |
| c | F3 HMM alignment, and vs the named chain | **Null**; HMM ≈ variance (memory, `gr-hmm-trend-direction`); not better than N |
| d | F4 pullback in the HTF trend | **Null** (point estimate either sign) |
| e | F5 conflict-as-no-view (EMA): Δ | **Null to small** (Δ < 0.02); the synthesis expected "real for abstention", our evidence says the aligned side is no better than D1 alone |
| f | F6 conflict-as-no-view (HMM): Δ, and vs N-conflict | **Null** |
| — | **THE GATE (per cell)**: G1 Holm p < 0.05 over the 18 scored cells; G2 estimate ≥ bar (E ≥ **+0.03**; Δ ≥ **+0.02**); G3 positive in both halves; G4 above the 97.5th percentile of its noise distribution (outcome shuffle for F1–F4; random abstention for F5–F6); G5 (F3, F6 only) beats its named-chain counterpart: bootstrap CI of (HMM − N) lower > 0; G6 POWERED (planted control ≥ 80%). A family is VALIDATED if ≥ 1 of its horizon cells passes G1–G6 | |
| — | **THE MIRROR**: −E for F1–F3 (against the trend), −E(F4) (pullback continues) | a significant negative E is reported as the mirror (CONTEXT), never a pass |

**Bars.** E ≥ 0.03: a 3 pp hit-rate gain on a symmetric 1σ day is ≈ +0.05σ per call, the desk's usual +0.05R
useful-effect bar (`exit-on-fixed-entries`, `bias-learner` U at IC 0.08). Δ ≥ 0.02: abstention must lift the kept-day
hit rate by 2 pp over calling every day, net of the shrinking sample.

**Cell word** (registered): PASS (G1–G6) → VALIDATED. Else, if POWERED and CI upper < bar: CI lower > 0 → CONTEXT
(small but real), otherwise NULL. Else UNDERPOWERED (unpowered, or the CI still includes the bar). **Family word**:
VALIDATED if any cell VALIDATED; else UNDERPOWERED if any cell UNDERPOWERED; else CONTEXT if any; else NULL.

## 5. Power — what this design can and cannot find (required)

Simulation (`power_sim.py`, seed 20261115, synthetic only): 2,250 test dates × 13 instruments, daily moves with a
common-factor share 0.40 (cross-instrument co-movement), persistent states (mean run 8 sessions) sharing a common factor
0.50, overlapping h-day outcomes; 300 null draws per cell; MDE = (z at α/(2·18) + z_0.80) × null SD = 3.83 × SD.

| Coverage (share of rows called / kept) | h | SD of E | **MDE E** | MDE Δ (abstention) | vs bars 0.03 / 0.02 |
|---|---|---|---|---|---|
| 5% | 1 / 3 / 5 | 0.016 / 0.022 / 0.026 | 0.062 / 0.086 / 0.099 | 0.057 / 0.075 / 0.083 | UNDERPOWERED |
| 10% | 1 / 3 / 5 | 0.013 / 0.017 / 0.022 | 0.048 / 0.066 / 0.086 | 0.041 / 0.052 / 0.069 | UNDERPOWERED |
| 20% | 1 / 3 / 5 | 0.009 / 0.013 / 0.016 | 0.034 / 0.051 / 0.062 | 0.026 / 0.038 / 0.043 | UNDERPOWERED (h 1 borderline) |
| 30% | 1 / 3 / 5 | 0.008 / 0.011 / 0.014 | 0.031 / 0.044 / 0.053 | 0.021 / 0.026 / 0.032 | h 1 ≈ bar; 3d/5d UNDERPOWERED |

**Reading.** At the Holm-18 bar this design can only settle the 24h cells of the frequent states (EMA alignment,
expected ~25–35% coverage; HMM alignment if similar). Swing alignment and pullback (expected 5–15%) and every 3d/5d
cell are **expected UNDERPOWERED by design**; they are kept because the owner asked for these horizons, and an
underpowered cell that comes back empty is recorded as UNDERPOWERED, never NULL. The binding power check is the
planted control on the real rows (G6), which uses the realised coverage and the real outcome noise. The simulation's
co-movement (0.40) is conservative; if the real SD is smaller the cells gain power, and G6 will show it.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells**: 6 families × 3 horizons = **18**. Holm at α = 0.05 over all 18 (p from §3.7, normal approximation).
- **Conjunctive** within a cell (G1–G6); no further correction.
- **Disaggregation** (asset group, instrument, year, named-chain alone, the pullback mirror, other K): BH q = 0.10 with
  `chanceBaseline`; candidates only, never results.
- **Promotion** to anything live needs |t| ≥ 3 on the scored cell; a ledger VALIDATED at lower |t| stays research-only.

## 7. What this does NOT test (required)

- **Tradability**: hit rate, not R after costs; the σ-scaled move is descriptive. A pass is not a trading rule.
- **Intraday timing** (entries other than 07:00 London; H1/H4 states at other hours).
- **Other EMA lengths, swing widths, HMM features (e.g. adding |r|), state counts above 3**: one specification each,
  fixed here. A null here does not close every variant.
- **HMM label stability across refits** (`model-audits` Q1): only dwell / flip rates are described.
- **Variance / range**: HMM states may well separate volatility; that is not scored here.
- **The lockbox** (after 2026-08-21) is not read.

## 8. What each verdict changes (required)

- **Pass** → the ledger entry; the morning card may show the passing state as a direction lean at that horizon
  (research-only until |t| ≥ 3 or a forward test); a passing conflict cell makes "no view on conflict" a desk rule.
- **Null** → the card stops presenting multi-timeframe alignment (or HMM alignment) as a direction call; conflict is
  shown as description, not as a reason the kept days are better.
- **Underpowered** → what would make it testable: more instruments (28-pair FX universe), a longer history (M1 before
  2016), or a forward record on the bias-scoreboard.

## Amendments

(none yet)

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/mtf-structure/RESULTS.md`. Nothing above this line changes after the run. Amendments go in
the `## Amendments` section above, each dated and tagged `PRE-RESULTS` or `POST-HOC (results seen)`.*
