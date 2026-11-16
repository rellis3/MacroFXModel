# vol-layer-stops-confirm: does the stage 3 stop model hold on unseen 2023-26 bid/ask data, judged on its own measure?

**Pre-registered 2026-11-16. No outcome from 2023-01-01 onward has been computed for this study.** The frozen numbers in Appendix A come only from discovery data (2016-10-24 → 2022-12-30). §2 lists the older studies that did read some 2023-26 data (Rule A's own trades; two pooled 2016-2026 maps on mid).

| | |
|---|---|
| ID / ledger id | `vol-layer-stops-confirm-cal`, `-skill`, `-steady`, `-noise` (four scored cells); `vol-layer-stops-confirm-weekend` (described, not scored) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-stops-confirm` |
| Data | **Instruments (34):** the stage 3 set (`analysis/output/forecast_history/*.csv` with a `data/m1_bidask` file). **Prices:** M1 bid/ask, `data/m1_bidask`. **σ:** `live_sig_used` from the forecast history, known at the open. **Score window:** London sessions 2023-01-02 → 2026-08-20. Any hold that would end after 2026-08-20 is dropped for that horizon, so nothing reads the lockbox (2026-08-21 onward). **Discovery (frozen model and power only):** 2016-10-24 → 2022-12-30, fit on 2017-01-01 → 2022-12-30. |
| Seed | `20261116` |
| Uncertainty | Stationary bootstrap by London date, block 20, B = 2000; all instruments on a date move together. `-steady` uses a whole-month cluster bootstrap, B = 2000. |
| Scripts / outputs | `scripts/vol-layer-stops-confirm/freeze_discovery.py` (written, discovery only) → `analysis/output/vol-layer-stops-confirm/discovery/frozen_model.json`. `scripts/vol-layer-stops-confirm/score.py` (to write after this prereg is pushed) → `analysis/output/vol-layer-stops-confirm/{confirm,RESULTS.md,results.json}` |
| Harness | Own script. The cells need the bid/ask path of random entries, which the harnesses do not build. `score.py build` reuses the builders in `scripts/vol-layer-deep/execution_wide.py` and `scripts/noise-threshold/build.py` with only the window and seed changed. |

## 1. The claim

**Source.** Vol-Layer stage 3, layer 7 (`scripts/vol-layer-deep/execution_wide.py`, `backtest-data/vol-layer/execution-wide.json`) and the stage 2 noise map (`scripts/noise-threshold/`). Both used random entries on 2016-10 → 2022 only. C.OG lesson L03: "validate each layer by its own factor". For a stop, its own factor is calibration: does the stop-hit probability we quote match how often stops are really hit on bid/ask?

**The claim, in four parts.**
- **(a) The stop-odds model is calibrated, and better than σ alone.** A stop d σ away is hit with probability P = 2Φ(−exp(η)). η adds the stop size, the vol-clock variance left in the hold, the spread and a weekend term. The coefficients are fixed from discovery (Appendix A). On unseen 2023-26 bid/ask data, its predictions match the real hit rate, and it beats a model that knows only the stop size and the horizon.
- **(b) A σ stop is steadier than a fixed-width stop.** Stage 3: a 1σ stop's touch rate minus the random walk moved with SD 0.7pp across years; a fixed-width stop moved 4.6pp.
- **(c) There is no market-wide noise threshold.** Stage 2: after an adverse move of d, the trade ends on average where a random walk says (excess within ±0.03σ), below the spread (0.016-0.044σ).
- **(d) Weekend gaps are the stop-through risk.** Stage 3: 81% of stops hit at a weekend open gapped through, mean loss 1.38R at 1σ against 1.00R in the week. Described only.

**Edge source.** None. This is a risk-measurement layer. It says how often a stop is hit and what it costs, not where price goes.

## 2. Why it is not already settled

- **Stage 2 and stage 3 were looks.** 1,489 of 2,244 stage 3 cells passed BH, but nothing was scored, and every number came from the window the effects were found in. The 2023-01-01 → 2026-08-20 half was kept back for this stage (register row `noise-threshold-map`).
- **`vol-layer-rule-a-confirm` (banked 2026-11-15)** used 2023-26 once, for Rule A's own trades only. It scored the spread-aware and vol-clock stops (S1, S2, S3): S3 NULL, S1/S2 UNDERPOWERED (MDE 0.25-0.31 Sharpe). That asked a different question (does Rule A's Sharpe rise?) on a different population (break trades with a 0.2σ stop, entries 00:00-10:00, flat by 22:00). It never scored a stop-odds model and never read random entries. This study does not re-run it.
- **2023-26 is not fully untouched for random-entry stops.** Two older maps pooled all years, 2023-26 included:
  - `forge/STOP_RISK_PREREG.md` (2026-10-06): random entries on mid, 2016-05 → 2026-08, hit within 24 trading hours, gap-through and loss in R, weekend split (p99 2.08R). One pooled table. Never split by period, never on bid/ask, no vol clock, no model.
  - `forge/PATH_MAP_SPEC.md` (2026-10-06): races after line touches, 2016 → 2026-08, mid.

  So the average 2023-26 hit level and the weekend tail were seen inside 10-year pools. That is one reason (d) is a description. The model's calibration in 2023-26, the σ-vs-fixed steadiness and the noise excess were never computed on 2023-26 data.
- **Nearest banked entries.**
  - `day-recon-reach-calibration` (UNDERPOWERED): a time-left model of reaching the next rung was close on average; CITL half-widths 2.7-4pp, one instrument per cell. This design pools 34 instruments and random entries, which is what powers it.
  - `line-touch-reach` (VALIDATED, 20/22 cells within 5pp): reach after a line touch, not a stop from a random entry.
  - `jump-after-stop-through` (CONTEXT): session-level jump history and gap risk. It says size gap risk from σ and the calendar. Not a stop-odds model.
  - `round-break-follow` (CONTEXT), `vol-layer-round-numbers` (NULL): location effects at round numbers, not stop odds.
- **Discovery look, stated before scoring** (all from `freeze_discovery.py`, 2017-2022, 315,966 entries, 22.7M rows):
  - In sample, M_full: CITL +0.01pp [−0.28, +0.30], MZ slope 1.028 [1.023, 1.032], Brier skill vs M_σ +4.47% [+4.35, +4.59].
  - Pseudo-confirm (fit 2017-19, score 2020-22): CITL +0.29pp [−0.21, +0.77], slope 1.033 [1.024, 1.040], skill +4.65% [+4.47, +4.84].
  - The no-fit random walk with the spread (M_rw) is already close: to 22:00, hit 28.6% vs M_rw 28.6%. The fit mostly bends the tails (ln d coefficient 0.80, not 1).
  - The spread coefficient is −2.09, twice its structural −1. Dropping the spread term costs +0.84% Brier.
  - The weekend term adds nothing to the hit odds (dropping it changes Brier by −0.02%). It stays in the frozen model because it was specified before the fit. The ablation is reported.
  - Steadiness by calendar month, 1σ to 22:00: SD plain 2.3pp, fixed 8.0pp, Δ +5.6pp [+3.3, +8.1] (whole-month bootstrap). By quarter: 1.7 vs 6.3pp.
  - Noise excess to 21:00, all instruments: −0.0021σ [−0.0070, +0.0027] at 0.25σ; −0.0025σ [−0.0113, +0.0059] at 0.5σ; −0.0012σ [−0.0168, +0.0154] at 1σ.
- **Expectation:** (a) both cells pass. (b) passes on the point estimate but may not clear power. (c) passes at 0.25σ and 0.5σ. (d) the weekend loss stays near 1.4R.

**Method lessons applied** (`education/RESEARCH_METHOD_LESSONS.md`): #1 positive control (§3); #5 a plain baseline beside the model (M_σ, M_rw); #13 a path quantity judged on the path outcome (touch on the bid/ask path); #18 bias and slope reported apart (CITL and MZ slope); #23 the weekend tail fitted with a GPD, not only the bootstrap; #27 random entries, so stop management cannot pass as edge. Stats lesson 2026-11-04: steadiness uses whole-month clusters, not a date bootstrap.

## 3. Definitions, fixed in advance

**Entries (the population).** `score.py build` runs the stage 3 builder (`execution_wide.build_one`) unchanged except the window and seed:
- 34 instruments, London sessions 2023-01-02 → 2026-08-20, seed 20261116.
- 6 seeded random minutes per session, 00:15-21:00 London. Each is taken long (buy at the ask) and short (sell at the bid).
- Horizons: 15 min, 1 h, 4 h, to 22:00 London, end of the next session, end of the 5th session after. A hold that would end after 2026-08-20 is dropped for that horizon, and the drops are counted.
- M1 is cut at 2026-08-20 22:00 London before any path is read.

**Hit (the outcome).** A long stop at ask − d·σ·mid is hit when a later bid low reaches it. A short stop at bid + d·σ·mid is hit when a later ask high reaches it. d ∈ {0.25, 0.5, 0.75, 1.0, 1.5, 2.0}. σ = `live_sig_used`, known at the open. One row = entry × side × horizon × d.

**Knowable when?** σ at the open. The spread at the entry minute. V from the frozen discovery profile and the entry minute. Weekends crossed from the calendar. No prediction uses the path.

**Models (all frozen, Appendix A).**
- **M_full:** P = 2Φ(−exp(η)), η = g0 + g1·ln d + g2·ln √V + g3·(spread / d) + g4·W. V = the share of a day's variance left in the hold, from the frozen profile. W = weekends crossed. A random walk with the spread paid is g = (0, 1, −1, −1, 0).
- **M_σ (benchmark):** η = a_h + b·ln d. Knows the stop size and the horizon. Ignores entry time, spread and weekends.
- **M_rw (described):** P = 2Φ(−max(d − spread, 0) / √V). No fit.

**Statistics (pooled over all rows; each date is one cluster).**
- CITL = mean(hit − P_full), in pp.
- MZ slope = cov(hit, P_full) / var(P_full). 1 = predictions spread exactly as much as outcomes.
- Brier skill = 1 − Σ(hit − P_full)² / Σ(hit − P_σ)².
- Reliability table on the frozen bins (Appendix A), described.
- p-values from the bootstrap SE (normal approximation, `pFromCI`).

**Cell (b), steadiness.** 1σ stop, to 22:00, bid/ask. x = hit − 2Φ(−1/√V), averaged over the two sides. For each calendar month: the mean of x for the plain σ stop and for the fixed-width stop. The fixed width is the trailing 252-session median σ through t−1 (`s_fix`, min 60 sessions), so it uses pre-2023 σ at the start: an input, not an outcome. Statistic Δ = SD over months (fixed) − SD over months (plain), in pp. Confirm has about 43.7 months. Uncertainty: whole-month cluster bootstrap, B = 2000.

**Cell (c), noise.** `score.py build` also runs `scripts/noise-threshold/build.py` unchanged except window and seed: 4 random minutes per session 01:00-17:00 London, long and short at the mid close, held to 21:00. excess(d) = mean(final + d | MAE ≥ d), in σ, all instruments pooled. Margin = ±0.016σ, the smallest class median spread in discovery (indices; gold 0.029, FX majors 0.034, crosses 0.044). An excess smaller than that cannot pay even in the cheapest class.

**Cell (d), weekend.** From the confirm overshoot records (same builder): stops hit on the first bar after a gap of more than 36 hours. Gap rate, mean net loss in R with a date bootstrap, p99 overshoot, and a GPD on the top 10% of gapped overshoots (location 0), at 0.5σ, 1σ and 2σ. Note: the 81% gap rate is close to true by construction, since the hit bar is the first bar after the weekend. The loss and the tail are the informative numbers. New, computed the same way in both windows: P(a 1σ stop still open at Friday's close is hit on the weekend open bar).

**Positive control (`score.py control`, run first; the run stops if it fails).**
- Simulate random-walk M1 paths per instrument with the discovery intraday profile, the confirm spreads and the confirm σ. Run them through the exact build and scoring code.
- Known zero (closed form): M_rw must give |CITL| ≤ 0.3pp and slope within [0.97, 1.03]. The noise excess must be within ±0.005σ at 0.25σ and 0.5σ.
- Planted effect: scale the simulated σ by 1.10. M_rw's CITL must leave the ±1pp band (the closed form gives about +2 to +3pp). Add +0.03σ to `final` on hit rows: the noise cell must read outside the margin.
- Assumption most likely to break: the intraday profile changed in 2023-26 (for example index session hours). That would show as miscalibration by hour, which is reported.

**De-clustering.** None needed: entries are random minutes. All rows on one date are one bootstrap cluster (34 instruments, both sides, all horizons).

**Sample.** Score 2023-01-02 → 2026-08-20, about 945 dates. Years for the stability checks: 2023, 2024, 2025, 2026 (January to 20 August).

## 4. Hypotheses

| Cell | Question | Statistic | Expectation |
|---|---|---|---|
| `-cal` | Is M_full calibrated on 2023-26? | CITL and MZ slope, TOST | Yes: CITL within ±0.5pp, slope near 1.03 |
| `-skill` | Does M_full beat M_σ? | Brier skill | Yes, about +4.5% |
| `-steady` | Is a σ stop steadier month to month than a fixed width? | Δ SD (fixed − plain), pp | Yes, about +5pp |
| `-noise` | Is there no market-wide noise threshold at 0.25σ and 0.5σ? | excess(d), TOST at ±0.016σ | Yes: within ±0.005σ |
| `-weekend` | What does a weekend gap cost a stop? | loss in R, GPD ξ | About 1.4R at 1σ; described |

**THE GATE (VALIDATED).**
- `-cal`: the 90% CI of CITL lies inside ±1.0pp, and the 90% CI of the MZ slope lies inside [0.90, 1.10]. (TOST; p = the largest of the four one-sided p-values.) Holm-adjusted p < 0.05. Then all of these: |CITL| ≤ 2pp at each of the six stop sizes (plateau over neighbours); in each class; in each of the four years; and with σ delayed one session (+1 lag rerun, frozen coefficients).
- `-skill`: Brier skill ≥ +2% (point), 95% CI above 0, Holm p < 0.05. Then: skill > 0 at each of the six stop sizes; > 0 in at least 3 of 4 years; with σ delayed one session, at least half the base skill.
- `-steady`: Δ ≥ 2.0pp (point), 95% CI above 0, Holm p < 0.05. Then: Δ > 0 and at least half the base size at 0.5σ and 1.5σ (neighbours); with σ delayed one session in the plain stop, Δ still at least half the base size.
- `-noise`: at both 0.25σ and 0.5σ, the 90% CI of excess lies inside ±0.016σ (TOST; p = the larger of the two). Holm p < 0.05. Then: the points at the neighbours (0.2σ, 0.3σ; 0.4σ, 0.75σ) are inside ±0.016σ; each year's points at 0.25σ and 0.5σ are inside; with σ delayed one session as the unit, the points stay inside.

**THE MIRROR.**
- `-cal`, `-skill`: M_σ and M_rw scored on the same rows; the reliability table for all three.
- `-steady`: the plain σ stop is the mirror of the fixed-width stop.
- `-noise`: long and short are both in every cell. The sign of the excess says reversion (> 0) or continuation (< 0).

**Other verdicts.**
- **NULL:**
  - `-cal`: the 90% CI of CITL lies wholly outside ±1pp, or the slope CI lies wholly outside [0.90, 1.10]. The model is shown to be off by more than the margin.
  - `-skill`, `-steady`: the 95% CI upper end is below the bar (+2%, +2.0pp).
  - `-noise`: either 90% CI lies wholly outside ±0.016σ. A market-wide threshold exists, and its sign says which kind.
- **UNDERPOWERED:** the interval straddles the margin or the bar, so neither a pass nor NULL can be called.
- **CONTEXT:** passes the pooled test but fails a plateau, class, year or lag check.
- `-weekend` is CONTEXT by design.

## 5. Power

From discovery data only: `frozen_model.json` and, for `-steady`, `steady_month.json` (`freeze_discovery.py month`), both in `analysis/output/vol-layer-stops-confirm/discovery/`. SEs are scaled to about 945 confirm dates.

| Cell | Planned n | SE source | SE (confirm) | **MDE / smallest provable margin** (80% power) | Pass bar / margin | Verdict |
|---|---|---|---|---|---|---|
| `-cal` CITL | ~945 dates, ~13.9M rows | pseudo-confirm 2020-22, 779 dates, × 0.908 | 0.23pp | 0.67pp (TOST: 2.93 × SE) | ±1.0pp | POWERED |
| `-cal` MZ slope | same | same | 0.0038 | 0.011 | ±0.10 | POWERED |
| `-skill` | same | same | 0.088% | 0.25% (2.80 × SE) | +2.0% | POWERED |
| `-steady` | ~43.7 months | discovery 72 months, whole-month bootstrap, SE 1.36pp × √(71/42.7) | 1.76pp | 4.9pp | +2.0pp | **UNDERPOWERED** |
| `-noise` 0.25σ | ~945 dates, ~185k hits | discovery date bootstrap, 1,555 dates, × 1.28 | 0.0032σ | 0.0080σ | ±0.016σ | POWERED |
| `-noise` 0.5σ | ~124k hits | same | 0.0056σ | 0.0140σ | ±0.016σ | POWERED |
| noise 1σ (described) | ~51k hits | same | 0.0106σ | 0.0264σ | ±0.016σ | UNDERPOWERED, so not scored |
| `-weekend` 1σ loss | ~3,200 weekend hits | discovery, SE 0.076R × 1.28 | ~0.10R | — | described | — |

- **`-steady` is UNDERPOWERED by design.** Three and a half years hold too few regime swings to pin an SD across months. The discovery effect (+5.6pp) is near the MDE, so a pass is possible. An empty result is UNDERPOWERED, never NULL. What would power it: the forward record, or a longer bid/ask history.
- **The 1σ noise cell was moved to "described" before registering**, because its MDE (0.026σ) is above the margin.
- **The SDs in §1 (0.7 vs 4.6pp) are across 6 years.** By month they are larger (2.3 vs 8.0pp) because each month has fewer days. The statistic is by month to get enough points.
- **Bootstrap note.** A date-level stationary bootstrap of an SD across months understated the spread on discovery (95% interval [2.7, 5.8] around a point of 5.6). Whole-month clusters gave [3.3, 8.1]. `-steady` uses whole months.
- **`-cal` SE source.** The pseudo-confirm SE (0.25pp on 779 dates) is used, not the in-sample one (0.15pp on 1,555 dates, × 1.28 = 0.19pp), because it is the larger.

## 6. Multiplicity

- **Scored cells (4):** `-cal`, `-skill`, `-steady`, `-noise`. Holm at α = 0.05.
- The plateau, class, year and lag checks are conjunctive conditions, with no further correction.
- **Disaggregation (BH q = 0.10, with `chanceBaseline`):** CITL and skill by instrument, horizon, London hour bucket and σ tercile; noise excess by class against each class's own median spread. A slice that survives is a candidate for its own prereg.
- **Described, carrying no weight:** `-weekend`, the 1σ noise cell, M_rw, the ablations, the reliability table, steadiness by quarter.
- **Promotion bar.** Anything that will size or gate a live position needs |t| ≥ 3.

## 7. What this does NOT test

- **Direction or edge.** A calibrated stop-odds model says how often a stop is hit, not whether the trade makes money. On a random walk no stop placement has positive expected R.
- **Any system's own entries.** C.OG's point is to map your own trade distribution. This is random entries only. Rule A was the wrong bed (`vol-layer-rule-a-confirm`); a wide-stop system is still needed.
- **Tradability after costs.** The spread is in the hit; no P&L is scored.
- **The error-scaled stop.** Demoted in stage 3 (a peak, not a plateau).
- **Intra-minute fills and live slippage.** M1 bid/ask is a lower bound on gap risk.
- **The lockbox** (2026-08-21 onward).
- **Cause.** The model does not say why the tails are fat or why the spread term is twice its structural size.

## 8. What each verdict changes

- **`-cal` and `-skill` VALIDATED:** the frozen model becomes the stop-odds read-out on `vol-layer-system.html` (layer 7) and in the "Stop loss" slot of the assembly. It is offered to bots as a shadow field only (P(stop hit by horizon)), never an edit to a live calculation. It stays research-only until |t| ≥ 3 or a forward check.
- **`-cal` NULL:** stop odds are quoted from M_rw (no fit), with the confirm miss stated. A refit goes to a new prereg on fresh data.
- **`-skill` NULL:** the σ-only table is enough. The page stops claiming the vol clock and spread improve stop odds.
- **`-steady` VALIDATED:** "set stops in σ units" becomes a validated rule for every system. **UNDERPOWERED:** it stays a stage 3 description, as now.
- **`-noise` VALIDATED:** "no market-wide noise threshold at 0.25-0.5σ" is banked. Stop placement must come from a system's own MAE/MFE. **NULL:** the threshold, its size and sign get their own prereg on fresh data.
- **`-weekend`:** the weekend loss-given-stop figure on the page shows the 2023-26 number beside the discovery one.

## Appendix A. Frozen model and bins

Source: `analysis/output/vol-layer-stops-confirm/discovery/frozen_model.json`, written by `scripts/vol-layer-stops-confirm/freeze_discovery.py` on 2026-11-16. Fit 2017-01-01 → 2022-12-30: 1,555 dates, 315,966 entries, 22,733,496 rows. Maximum likelihood (L-BFGS) on a seeded 25% subsample (seed 20261116).

**M_full**, P = 2Φ(−exp(η)):

| term | 1 | ln d | ln √V | spread / d | weekends crossed |
|---|---|---|---|---|---|
| g | +0.038631 | +0.798166 | −0.866812 | −2.086698 | −0.038621 |

**M_σ**, P = 2Φ(−exp(η)), η = a_h + b·ln d:

| a_m15 | a_h1 | a_h4 | a_eod | a_next | a_s5 | b |
|---|---|---|---|---|---|---|
| +1.706066 | +1.207470 | +0.688722 | +0.268353 | −0.234235 | −0.867514 | +0.856845 |

**V** (share of a 24-hour day's variance in the hold): per instrument, from the frozen discovery 5-minute profile `analysis/output/vol-layer-deep/execution/wide/profiles.json`, computed exactly as `execution_wide.long_form`. eod = to 22:00; next = rest of today + next day to 22:00; s5 = rest of today + 4 days + to 22:00. The profile is NOT re-estimated on confirm data.

**W** = weekend days inside the hold ÷ 2: 0 for intraday horizons, 1 for a Friday "next", 1 for s5.

**spread** = (ask − bid) at the entry minute ÷ (σ × mid).

**Reliability bins** (edges of P_full, discovery 5% quantiles, merged where equal): 0, 0.000023, 0.000538, 0.004124, 0.019331, 0.053582, 0.100498, 0.160338, 0.230499, 0.313193, 0.410873, 0.46097, 0.536572, 0.61458, 0.680221, 0.753478, 0.83051, 1.

**In-sample fit by part** (hit vs P_full): to 22:00 28.6 vs 28.8%; 1 h 5.8 vs 6.4%; 5 sessions 69.4 vs 68.1%; 2σ 9.4 vs 10.2%; indices 27.0 vs 27.2%; years 2017-2022 within −0.7 to +0.6pp. All inside the ±2pp checks. Skill vs M_σ is smallest at 5 sessions (+0.44%) and 2σ (+1.0%).

**Ablations** (refit without a term; Brier change vs M_full): no spread +0.84%; no weekend −0.02%.

**+1 lag on discovery** (σ delayed one session, frozen coefficients): CITL +0.06pp, slope 1.026, skill +4.49%.

**Discovery reference for `-weekend`** (plain σ stops hit on the bar after a gap > 36 h): 0.5σ: gap 80%, loss 1.55R [1.41, 1.70], ξ 0.30. 1σ: gap 82%, loss 1.38R [1.24, 1.52], ξ 0.06, p99 overshoot 3.9σ. 2σ: gap 81%, loss 1.24R [1.12, 1.37], ξ −0.06. Weekday 1σ: gap 3.2%, loss 1.002R, ξ 0.34.

**Discovery reference for `-noise`** (median spread in σ): indices 0.0161, gold 0.0291, FX majors 0.034, FX crosses 0.0443, pooled 0.0375.

## Appendix B. What `score.py` does (written after this prereg is pushed)

1. `control`: the positive control in §3. Stops if it fails.
2. `build`: confirm entries, noise entries and overshoot records for 2023-01-02 → 2026-08-20, seed 20261116. Asserts no bar after 2026-08-20 22:00 London is read.
3. `score`: reads `frozen_model.json` and never refits. Writes `analysis/output/vol-layer-stops-confirm/confirm/`, `RESULTS.md` and `results.json`, with the verdict per cell from §4.

## Amendments

(none)

---

## RESULTS
