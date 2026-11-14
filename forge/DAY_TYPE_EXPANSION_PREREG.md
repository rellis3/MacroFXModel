# day-type-expansion — Can a pre-open score built only from validated range inputs call expansion days vs range days (07:00–21:00 UK) better than the σ-only forecast and the base rate?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `day-type-expansion`; one scored ledger entry per family: `day-type-expansion-fx`, `day-type-expansion-gold`, `day-type-expansion-idx` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `day-type-expansion` |
| Data | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, GOLD, NQ, SPX500. OANDA mid M1 (label), production point-in-time σ (`pit_sig_used`), Cboe vol indices, SPX500 NY-close D1. London sessions **2020-08-24 → 2026-08-21** (the σ export's out-of-sample span; nothing after the lockbox, 2026-08-21, is read) |
| Seed | `20261114` (every script in this study) |
| Uncertainty | moving-block bootstrap over test **dates** (all instruments of a family move together), block 21 sessions, B = 2000; SE floor from a month-block label permutation (§3) |
| Scripts / outputs | `scripts/day-type-expansion/` → `analysis/output/day-type-expansion/` |
| Harness | own Python script (logistic walk-forward + Brier; `analysis/study.mjs` / `runStudy.mjs` have no classifier path). Power: `scripts/day-type-expansion/power_sim.py` (reads inputs only) |

## 1. The claim (required)

Daily-bias agenda Q1 (`.claude/skills/research-director/agendas/daily-bias.md`, set 2026-11-13; owner 2026-11-14): *"Build a
morning expansion probability from what already forecasts range (IV vs RV, the VIX curve, gamma sign, the day's event size,
month-end, stress, yesterday's speed). Label each day by what it did: did it close near an extreme and travel ≥ k·σ
open→close, or rotate inside its lines? Sweep k and read the hit rate and calibration by decile, against the σ-only forecast
and the base rate."* Falsifier on the card: *no decile of P(expansion) beats the σ-only forecast on Brier out of sample.*

Edge source (lesson #4): forecasting skill about the **shape** of the day (directional travel ending at an extreme vs
rotation), not a premium and not direction. Nobody is on the other side; the use is routing (range-edge tools vs direction
tools) and abstention.

## 2. Why it is not already settled (required)

Every input below is validated as a **size** effect (range wider/narrower than forecast). None of them has been scored on
the **shape** of the day measured in σ units against the shipped σ:

- `one-range-forecast` (NULL): index state flags and gamma sign do not improve the range **size** forecast on top of
  persistence + IV. Different outcome: here the label is |open→close| travel AND close location, normalised by σ.
  Prior: expect little on indices.
- `fast-start-rest-of-day` (VALIDATED): a fast first 2h widens the afternoon, but "a trend-day close at the extreme is NOT
  more likely". That was conditional on an intraday trigger; here only pre-open information is used.
- `narrow-day-expansion` (NULL): NR7/inside days do not predict expansion (size). Not an input here.
- `vmc-nq-vol-transition` (NULL): intrabar NQ expansion onset from an indicator. Different horizon and inputs.
- `live-range-break-linestate` (NULL): trend-day state from line touches, intraday.

No banked entry asks whether the validated pre-open range inputs separate trend-to-close days from rotation days beyond σ.

## 3. Definitions, fixed in advance (required)

### 3.1 Sample and sessions

- Rows: `analysis/output/vf3_stage_b/part1_lines.parquet` with `oos == 1`, `inst` in the nine instruments, `event != 'unknown'`
  (calendar coverage ends 2026-07-02; 35 dates after it are excluded for every model, not imputed), `regime` not null.
  `date` there is the London calendar date of the session (built by `scripts/forecast_history/build.mjs` on London sessions);
  the runner asserts it is a weekday and joins everything by this key, printing match shares.
- Coverage (input side, counted 2026-11-14): FX 1,555 rows each (CME IV from 2020-09-09, 12 rows missing → dropped),
  GOLD 1,498, NQ 1,493, SPX500 1,493. Last session 2026-08-20.

### 3.2 σ_day (the scale) — data-rules item 2

σ_day = `pit_sig_used`: the production export's point-in-time daily σ (walk-forward fold estimator on NY-close bars from
M1, × the event multiplier), % of the London session open. Same file. Stored to 2 decimals (≈ 1% relative rounding on
FX); accepted. Sensitivity (descriptive, lesson #10): σ_day = HAR-800 = `har_ann / √252` from the same file.

### 3.3 The label (outcome)

From OANDA mid M1 (`VolRangeForecaster/data/m1/{eurusd,gbpusd,usdjpy,audusd,usdcad,usdchf,gold}_m1.parquet`;
`portfolioBacktest/cache/` for `nq`, `spx500`; loaded with `forge.bars.load_m1`, timestamps converted to Europe/London,
**never a fixed UTC hour**). For instrument i, session date d:

- Window W = M1 bars whose London start time t satisfies 07:00 ≤ t < 21:00 on date d.
- O = open of the first bar in W, required to start 07:00–07:04 London; C = close of the last bar in W, required to start
  20:55–20:59; H = max high, L = min low over W. Coverage: ≥ 756 of 840 minutes. A day failing any requirement is
  dropped for all models and counted per instrument (US half-days and holidays fall out here and are reported).
- m = 100·(C − O)/O (% of O); z = |m| / σ_day; pos = (C − L)/(H − L) (H = L → dropped).
- **Expansion day** E_k = 1 if z ≥ k AND ((m > 0 AND pos ≥ 0.80) OR (m < 0 AND pos ≤ 0.20)); otherwise **range day** E_k = 0.
- **k grid: {0.50, 0.75, 1.00}**, all three scored (§6). No other k is run.

### 3.4 Inputs (all known before 00:00 London on d, so before 07:00)

Each input enters only in the family where its Evidence Book entry validated it. Global series are read as the last
value dated **strictly before** d.

| Input | Evidence | Formula | Families | Source path | Point-in-time history |
|---|---|---|---|---|---|
| `regime` (in B1) | shipped σ | ln(pit_sig_daily / median of previous 250, min 120) — column `regime` | all | `part1_lines.parquet` | whole sample |
| `evmult` (in B1) | shipped σ | ln(pit_sig_used / pit_sig_daily) (the shipped event multiplier) | all | same | whole sample |
| `ivrel` | `iv-forecast` (FX majors, NQ); `iv-over-rv-wider` (NQ, SPX) | ln(iv_ann / (σ_day·√252)); iv_ann = CME settlement IV (FX), VXN (NQ), VIX (SPX500), asof-before | FX, idx | `part1_lines.parquet` `iv_ann` (built from `oi_research_book/data/iv_daily_*.parquet`, `analysis/surfaces/cboe/{VXN,VIX}.csv`) | FX 2020-09-09 →; idx whole sample |
| `front` | `vol-curve-front` | ln(VIX9D / VIX) | idx | `analysis/surfaces/cboe/VIX9D.csv`, `VIX.csv` (MM/DD/YYYY, CLOSE) | 2011 → |
| `stress` (count) | `forecast-miss-shock-fx/-idx`, `drawdown-forecast-error-fx/-idx`, `vix-inversion` | FX: # of {spx5 ≥ T, spx60 ≥ T, VIX ≥ T, vixchg5 ≥ T, VIX/VIX3M ≥ T, spx20 ≥ Q80} (0–6). idx: # of {spx5 ≥ T, vixchg5 ≥ T, spx20 ≥ Q80, VIX > VIX3M} (0–4). gold: 1{VIX > VIX3M}. spxN = −100·ln(SPX_{d−1}/SPX_{d−1−N}) (+ = fell); vixchg5 = VIX_{d−1} − VIX_{d−6}. T = top-tercile and Q80 = 80th-percentile cut, **computed on the fit window of each fold** (causal, lesson #14) | all | `oi_research_book/data/gex_range_es/spx500_nyclose_d1.parquet` (`close`, 2016-01 → 2026-08-20), `analysis/surfaces/cboe/VIX.csv`, `VIX3M.csv` | whole sample |
| `tier1`, `high` | `event-impact-map`; the shipped σ's own tag | 1{event ∈ NFP, CPI, FOMC}; 1{event = high} | all | `part1_lines.parquet` `event` (calendar proxy `scripts/v4/calendarProxy.mjs`, `calendar_events.csv`) | to 2026-07-02 |
| `month_end` | `forecast-miss-month-end-fx` | 1{d is among the first 2 or last 2 weekdays of its month} (weekday calendar, not data presence) | FX | calendar | whole sample |
| `prev_speed` | `fast-start-rest-of-day` / `tape-speed-persistence` (the owner's "yesterday's speed", prior day only) | ln(max(z_{d−1}, 0.05)), z of the previous session of the same instrument from §3.3 (known at 21:00 on d−1) | all | M1 as §3.3 | whole sample |

**Dropped, with reasons (not invented):**

| Input | Why |
|---|---|
| `fast-start-rest-of-day` (same-day first 2h) | known only at 09:00, after the open. Replaced by `prev_speed` |
| `tape-speed-persistence` (15-min → next hour) | intraday; prior-day form covered by `prev_speed` |
| `surprise-size` | the surprise is known only at the release. Prior-day CPI surprise ("session after") would need consensus/actuals that end 2026-07-02 and is a one-family effect; left out to keep parameters few |
| `extreme-in-probability` | an intraday running-extreme table; no pre-open form |
| `gex-range-es` / `gex-range-iv` | validated effect mostly absorbed by IV (`gex-range-iv`: 64–73%), and the near-surface book covers only 772 (SPX) / 782 (NQ) sessions out of ~1,490 (`oi_research_book/data/gex_range_es/nyc/daily_master_near_{spx500,nas100}_usd.parquet`, `net_gex_sum`, OI(D) → session D+2). Descriptive arm only (§4 e) |
| GVZ for GOLD `ivrel` | gold IV is not validated as a range input (`iv-forecast` excludes gold) |
| `vol-curve-front`, `iv-over-rv` on FX | validated on indices only |

### 3.5 Models (frozen)

All logistic regressions, L2 penalty λ = 10⁻³ on standardised features (numerical stability only, not tuned), features
standardised with the fit window's mean and SD, one fit per family × k, instrument intercepts (one-hot, no shared
intercept).

- **B0** — per instrument, expanding mean of E_k over all its sample rows dated < d (from 2020-08-24, min 120 rows).
- **B1 (σ-only)** — intercepts + `regime` + `evmult`. Everything the shipped σ knows.
- **M (score)** — B1 + family inputs: FX: `ivrel, stress, tier1, high, month_end, prev_speed` (14 parameters);
  idx: `ivrel, front, stress, tier1, high, prev_speed` (10); gold: `stress, tier1, high, prev_speed` (7).

### 3.6 Walk-forward splits (fixed)

Expanding fit window, refit once a year, 5-session embargo before each test block.

| Fold | Fit rows | Test rows |
|---|---|---|
| T1 | 2020-08-24 → 2022-08-26 | 2022-09-05 → 2023-09-04 |
| T2 | 2020-08-24 → 2023-08-25 | 2023-09-05 → 2024-09-04 |
| T3 | 2020-08-24 → 2024-08-26 | 2024-09-05 → 2025-09-04 |
| T4 | 2020-08-24 → 2025-08-26 | 2025-09-05 → 2026-08-21 |

(The 5-session embargo is applied by session count; the dates shown are approximate ends.) Test halves for the stability
gate: **H1 = T1+T2**, **H2 = T3+T4**. Rows 2022-08-27 → 2022-09-04 are never scored.

### 3.7 Metrics

- **Primary: Brier skill vs B1**, per family × k, pooled over the family's test rows:
  BSS_B1 = 1 − Σ(p_M − E)² / Σ(p_B1 − E)². Same for **BSS_B0** with p_B0.
- **AUC** of M, B1 (B0 ≈ 0.5) per cell, bootstrap CI. **Calibration**: deciles of p_M (pooled family test rows): mean
  p vs realised share and n; recalibration intercept and slope (logit E ~ a + b·logit p_M).
- **Secondary (descriptive): move captured on high-score days.** High = test rows with p_M ≥ that instrument's 80th
  percentile of in-sample p_M in the fold's fit window. Share = Σ_high |m| / Σ_all |m|; compared with 20% (chance) and with
  the same rule applied to p_B1. Also mean z on high vs other days.

### 3.8 Uncertainty, noise threshold, p-values

- **Bootstrap**: sum each model's Brier per test date across the family's instruments; moving-block bootstrap of dates,
  block 21, B = 2000, seed 20261114 → 95% percentile CIs for BSS_B1, BSS_B0, AUC.
- **P1 shifted-date placebo of the score**: circularly shift the M-only inputs (not intercepts, `regime`, `evmult`, not the
  label) by s sessions, the same s for every instrument in the family, s ∈ {63, 68, 73, …, n − 63}; refit the whole walk-forward
  for each s; distribution of BSS_B1.
- **P2 label permutation**: permute whole calendar months of the label series (each month's labels kept in order, the same
  month permutation for every instrument in the family; whole-cluster shuffle per the 2026-11-04 lesson), 500 permutations,
  refit walk-forward; distribution of BSS_B1.
- **p-value**: z = BSS_B1 / SE with **SE = max(bootstrap SE, SD of the P2 distribution)** (the power simulation found the
  date bootstrap can understate the Monte-Carlo SD, 2026-11-04 lesson); two-sided normal p (`pFromCI` logic).
- **Positive control (lesson #1), run before any label is read**: the runner's exact pipeline on the real inputs with
  synthetic labels from `power_sim.py`'s generator — planted β = 0.35 (FX, π = 0.2) must give BSS_B1 > 0 with CI lower > 0
  and pass P1/P2; β = 0 must give a CI covering 0 and fail P1/P2. If it does not, fix the code; no real label is scored until
  it does. Its output is written to `analysis/output/day-type-expansion/positive_control.json`.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | FX majors: does M beat B1 on Brier out of sample (any k)? | **Small yes or underpowered**: BSS_B1 ≈ +0.5% to +1.5%, mostly from `stress`, `ivrel`, `tier1`. Likely below the +2% useful bar → UNDERPOWERED or NULL |
| b | Indices: same | **Null.** `one-range-forecast` found the flags add nothing to size once IV is in; overfit penalty ≈ −0.8% |
| c | Gold: same | **Null** (few inputs; overfit ≈ −0.7%) |
| d | Does B1 itself beat B0 (σ-regime predicts shape)? | Descriptive. Expect ≈ 0: the label is already in σ units |
| e | Indices with gamma sign added, on the 770-session covered subset | Descriptive only, no weight |
| f | Secondary: share of |open→close| on M's top-quintile days | Descriptive; expect 22–26% vs 20% chance |
| — | **THE GATE** (per family × k cell): **G1** BSS_B1 95% CI lower > 0 and Holm-adjusted p < 0.05 over the 9 scored cells; **G2** BSS_B0 95% CI lower > 0; **G3** BSS_B1 > 0 in both halves H1 and H2; **G4** real BSS_B1 above the 95th percentile of **both** P1 and P2; **G5** calibration slope ≥ 0.5 | |
| — | **THE MIRROR** | No sign mirror (the outcome is unsigned). The mirror is the range-day side: a family that passes must also show the bottom decile of p_M with a realised expansion share below B0's, reported |

**Verdict per family** (bank as `day-type-expansion-<family>`; U = useful effect = BSS_B1 of **+2.0%**):

| Result | Word |
|---|---|
| At least one of the family's k cells passes G1–G5 | `VALIDATED` (research-only; promotion to anything live needs |z| ≥ 3 on that cell) |
| A cell passes G1, G2 and G4 but fails G3 or G5 | `CONTEXT` (real but unstable or miscalibrated) |
| No cell passes G1, and for every k the BSS_B1 95% CI upper bound < U | `NULL` |
| Otherwise (some CI upper ≥ U, or the cell is UNDERPOWERED by §5) | `UNDERPOWERED` |

When several k pass, the RESULTS report all; the headline is the k with the largest BSS_B1 lower bound, stated as chosen
after the fact.

## 5. Power — what this design can and cannot find (required)

From `scripts/day-type-expansion/power_sim.py` (seed 20261114; run 2026-11-14 with 40 simulations per row). It reads only
**inputs** (part1_lines σ/IV/event, Cboe, SPX500 D1); labels are synthetic: E ~ Bernoulli(logit⁻¹(a + 0.3·regime + β·score)),
score = standardised stress (+ ivrel where present), with a Gaussian-copula date factor (ρ = 0.47 FX, 0.85 indices) so
instruments of a family co-move. The exact walk-forward of §3.5–3.6 (M without `month_end`/`prev_speed`) and BSS_B1 were
computed on each draw. Base rate π is unknown without reading outcomes, so three are shown (≈ k = 1.0 / 0.75 / 0.5).

| Family | Test dates | π | Null BSS_B1 (overfit cost) | MC SD near the MDE | Bootstrap SE (5 draws) | Planted β = 0.25 / 0.35 → BSS_B1 |
|---|---|---|---|---|---|---|
| FX (6) | 992 | 0.10 / 0.20 / 0.30 | −0.24% / −0.29% / −0.21% | 0.38% / 0.50% / 0.48% | 0.32% / 0.52% / 0.49% | +0.5 / +1.2%; +1.0 / +1.9%; +1.2 / +2.5% |
| GOLD | 955 | same | −0.72% / −0.68% / −0.82% | 1.5% / 1.1% / 0.9% | 1.4% / 1.3% / 1.1% | +1.1 / +3.7%; +1.7 / +3.6%; +1.4 / +3.2% |
| idx (2) | 950 | same | −0.98% / −0.82% / −0.92% | 1.0–1.5% / 1.0–1.4% / 0.8–1.0% | 0.5–0.8% / 0.7–1.1% / 0.9% | −0.3 / +0.4%; +0.4 / +1.4%; +0.8 / +1.5% |

MDE = (z_α + 0.84) × SD, with α = 0.05/9 (Holm's first step, z 2.77) and α = 0.05 (last step, z 1.96):

| Cell | n (test dates) | SD of BSS_B1 | Design effect | **MDE** (Holm first / last step) | Pass bar U | Verdict |
|---|---|---|---|---|---|---|
| FX × each k | ~990 × 6 inst | 0.50% | in the copula (ρ 0.47) | **1.8% / 1.4%** | +2.0% | POWERED |
| GOLD × each k | ~955 | 1.1–1.5% | 1 | **4.0–5.4% / 3.1–4.2%** | +2.0% | UNDERPOWERED by design |
| idx × each k | ~950 × 2 inst | 1.0–1.4% | in the copula (ρ 0.85) | **3.6–5.1% / 2.8–4.0%** | +2.0% | UNDERPOWERED by design |

Readings: (1) only FX can resolve a +2% gain; gold and indices can only find ≥ 4–5%, so an empty result there banks
`UNDERPOWERED` unless the CI upper bound falls below +2%. (2) The overfit cost (−0.2% FX, −0.7 to −1.0% gold/idx) is
inside the model comparison already. (3) The date bootstrap understated the MC SD on indices at π = 0.1 (0.53% vs 1.45%),
hence the SE floor in §3.8. (4) Label autocorrelation across days was not simulated; the P2 floor covers it.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: 9** = {FX, GOLD, idx} × k {0.50, 0.75, 1.00}, statistic BSS_B1. **Holm at α = 0.05** across all 9 (G1).
  G2–G5 are conjunctive on top.
- **Disaggregation (BH q = 0.10, with `chanceBaseline`)**: 27 instrument × k BSS_B1 cells; event (tier1/high) vs no-event
  days; per test year. Survivors are candidates for their own prereg, never a result.
- **Descriptive, no weight**: B1 vs B0; AUC; calibration deciles; capture share; the σ = HAR-800 label; a rolling 3-year
  fit window beside the expanding one (lesson #19); the 07:00–16:00 window; the gamma-sign arm (indices, covered subset);
  concentration (by year, without the top 1% |m| days).
- p-values from z with the §3.8 SE (normal approximation), stated as such.

## 7. What this does NOT test (required)

- **Direction.** E_k is unsigned; a pass says nothing about which way.
- **Tradability / costs.** No entry, stop or P&L is scored.
- **Size.** Range width is already the shipped σ's job; the label is in σ units on purpose.
- **Intraday updating.** Only pre-open inputs; the first-hours speed (`fast-start-rest-of-day`) is not in the score.
- **Cause.** Inputs overlap (stress and ivrel co-move); no coefficient is read as a mechanism.
- **Other instruments, other windows, the lockbox period.** Nothing after 2026-08-21.

## 8. What each verdict changes (required)

- **VALIDATED** (per family) → ledger entry; the morning card can show a research-only "expansion probability" for that
  family next to the σ line (shadow, side by side, nothing live changes until the owner chooses); range-day calls route to
  the validated range-edge tools, expansion calls to the direction outputs (agenda Q2/Q5). Promotion needs |z| ≥ 3 or a
  forward record.
- **CONTEXT** → ledger entry; the card may describe the tilt, no routing.
- **NULL** → ledger entry; "range day vs expansion day" stays a σ statement; no third bias state for that family.
- **UNDERPOWERED** → ledger entry; testable on a longer history (pre-2020 σ export rebuilt with `scripts/forecast_history/build.mjs`
  plus Cboe/CME IV back to 2009 for indices/gold) or on the forward record after the lockbox evaluation.

## 9. Method lessons applied (education/RESEARCH_METHOD_LESSONS.md)

- **#1 positive control (DO WORSE)**: planted-signal Monte Carlo on the real inputs before registering (§5), and the same
  check on the runner before any label is read (§3.8).
- **#5 linear baseline first (DO WORSE)**: the score is itself a logistic; B0 (intercept) and B1 (σ-only) are the claims'
  yardsticks.
- **#10 two proxy specs (DO WORSE)**: σ = production PIT export and HAR-800.
- **#12 name what the extension gives up (DO WORSE)**: the overfit cost per family is in §5.
- **#14 causal labels (DO WORSE)**: stress tercile cuts and standardisation from each fold's fit window only.
- **#18 bias vs slope (DO WORSE)**: calibration intercept and slope reported, slope gated (G5).
- **#19 fit window (DO WORSE)**: rolling 3-year arm beside expanding (descriptive).
- **#25 quantile ladder (DO WORSE)**: calibration and realised share by decile, not top-minus-bottom.
- stats-defaults lessons 2026-10-21 (all-shift placebo distribution, not one shift), 2026-11-04 (whole-cluster shuffles;
  MC SD for power), 2026-11-07 (many shuffles, percentile gate, registered up front).

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS
Runner details fixed while writing `scripts/day-type-expansion/run.py`; no real label had been read (the M1 is not in
this container; only synthetic data was scored). (1) Positive control, null arm: the §5 simulation shows the overfit
cost puts the null BSS_B1 near −0.2% with SD ≈ 0.2%, so its CI can sit wholly below 0. The null arm therefore passes when
it gives **no false positive** (CI lower ≤ 0 and not above both placebos); whether the CI covers 0 is recorded
(`null_ci_covers_0`). (2) The positive control uses P1 step 25 sessions and 100 P2 permutations (a code check, not a
scored cell); the scored cells use step 5 and 500 as registered. (3) Each cell's own word in `results.json` applies the
family table of §4 to that cell alone; the banked word per family is the §4 rule over its three k cells.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/day-type-expansion/RESULTS.md` and `results.json` (seed 20261114). Nothing above this line
changes after the run.*
