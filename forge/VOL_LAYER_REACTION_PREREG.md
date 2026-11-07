# vol-layer-reaction — does the shared vol state tell us when price reacts at the chosen forecast's lines?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `vol-layer-reaction` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-reaction` |
| Data | The LINE-REACTION encounters (`analysis/output/line_reaction/events_chosen/`, chosen lines, 34 instruments, sessions 2020-08 → 2026-08), new features from M1 (`VolRangeForecaster/data/m1`) and the Step 0 table. No session after 2026-08-20 is read. |
| Seed | `20261107` for the shifts and models. The bootstrap keeps `forecast_record.boot_weights` (20261006), so the interval scheme matches LINE-REACTION. |
| Uncertainty | Date-block stationary bootstrap, block 20, 2,000 reps |
| Scripts / outputs | `forge/vol_state_hist.py` (tested), `scripts/vol-layer/reaction.py` → `analysis/output/vol-layer-reaction/` |
| Harness | Own script, reusing the LINE-REACTION folds, models and fade test so results compare directly |

## 1. The claim

C.OG, Market Movers, 28 Sep 2026: "make volatility a shared states variable [current conditional volatility, expected change, relative to long-run, regime probabilities, forecast error]", "use its errors as a feedback loop", "research a lot into jump intensity", and an example of a layer is "splitting correlation from variance". He says his stop orders exist because the forecaster is one layer of many.

The owner's framing, 2026-11-07: **for exhaustion the question is not whether the line is touched 50% of days, but whether price reacts at that point.** The chosen forecast stays as the lines. This asks whether the state around it says when a touch rejects and when it breaks.

## 2. Why it is not already settled

Read after the literature and repo passes, as the bias check:

- **`LINE-REACTION` (2026-10-07):** P(reject | resolved) ≈ 0.485 at every rung, no different from ±0.3σ away. GBM on 31 lead-up features gives log-loss ÷ base 1.000. It held only `regime`, `res1`, `iv_sig`, event, gap and weekday from the vol state.
- **`exhaustion-schedule`:** distance from the open adds almost nothing beyond the clock. It tested price-only distance, no vol state.
- **`level-touch`:** real lines vs shifted lines, about zero. No conditioning on state.
- **`line-touch-reach`:** p75 → p90 about 40%. Reach odds, not reaction.
- **`line-touch-wide-scan`, `line-touch-limit-unseen`:** a gross fade edge after fast run-ins that fails net of costs. The selector was candle, position, time and regime.
- **`meta-label-trust-lines-persist`:** morning information does not predict whether a line is passed. A different target (reach), and it said the meta-label belongs at the touch.

**New here, so not a re-run:** none of these held expected change in vol, filtered regime on realised vol, forecast-error state, unscheduled jump intensity, the day's realised vol so far against forecast, or the common-versus-own split of the move. They also never asked whether these change the reaction beyond the 31 features already tried. Those features are the benchmark, so anything that only repeats them scores 1.000.

**Expectation is honest:** the neighbours in LINE-REACTION mean a pass here would most likely be state-dependent reaction at any distance, not something special about the line. That is still useful for stops and entries. It is reported separately.

## 3. Definitions

**Encounters.** As LINE-REACTION: first touch per level per session, 01:00–20:00 London, offsets 0 (line) and ±0.1/0.2/0.3σ (placebo). K = 0.25σ, horizon 120 minutes. y = reject, trained on resolved rows. Folds 1–5, 5-session embargo.

**Features.** Pre-open features for session t use only sessions before t. Refits are expanding, every 63 sessions, and use only rows whose target is complete before the refit date. At-touch features use only 5-minute slots complete before the touch minute.

| Family | Feature | Definition |
|---|---|---|
| **A state** | `dsig` | Expected change: HAR on log rv5 predicting the mean of the next 5 sessions, minus the same HAR predicting the next session |
| | `sig_rel_har` | Model long-run: HAR 1-step forecast minus the HAR unconditional mean, in log rv5 |
| | `p_hi` | Filtered P(high state), 2-state Gaussian HMM on log rv5 |
| | `p_res` | Filtered P(high state), 2-state Gaussian HMM on HAR 1-step residuals (is the model failing?) |
| | `err_ewm` | EWMA (half-life 10) of log(r_hl ÷ pit_hl_p50), signed |
| | `err_abs` | EWMA (half-life 10) of its absolute value |
| **B jumps** | `js20` | Mean `jump_share` over the last 20 sessions |
| | `lam_un` | EWMA (half-life 20) of unscheduled jump days: \|max_r5\| > 5·√(bv5 ÷ 264) and event tag `none` |
| | `lam_sch` | The same on sessions tagged FOMC, NFP, CPI or high |
| **C feedback (at touch)** | `rv_so_far` | log(RV so far ÷ σ² ÷ clock share), less its trailing 250-session median. Clock share = trailing 250-session median of cum RV(slot) ÷ session RV |
| | `jump_today` | Largest \|5-min return\| so far ÷ √(bipower so far per slot) |
| | `err_today` | r_hl so far ÷ today's line p50 for HL, using range before the touch |
| **D correlation, FX only** | `common60` | Move over the last 60 minutes predicted from the two currency legs using the OTHER pairs only, signed toward the level, in σ |
| | `resid60` | `spd60` − `common60`: the part that is this pair's own |
| | `cvar60` | Share of the pair's 60-session daily variance explained by those other-pair legs, pre-open |

**Models.** Primary: GBM with LINE-REACTION's settings. Secondary: L2 logit. M0 = rung × side × class. M1 = M0 + the 31 LINE-REACTION features. M1+family = M1 + one family. M1+ALL = M1 + all four.

**Trades (the dumb-view stop-order test, layer 7).** Same geometry as LINE-REACTION: target K, stop K, 120-minute limit.
- **Fade:** top quintile of the model's predicted P(reject), threshold from training predictions.
- **Follow:** bottom quintile, trade the break.

**Costs.** One full round-trip spread per trade: `features/spread_profile.parquet`, median over UK hours 10–19 of the hourly mean, in pips, at the instrument's pip size. Instruments not in it use `pylego.costs.default_spread`. Converted to K units per trade with that session's σ. Same-bar ambiguity is a loss.

**Controls.**
- **Neighbours:** the same pipeline on |offset| ≥ 0.2.
- **Shuffle placebo:** M1+ALL refit 20 times with the new features shifted by a random whole number of sessions (60–500) within instrument. The real ratio must be below all 20.

**Sample.** Folds 1–5 are the stability gate. Concentration: by year and without the top 1% of days.

## 4. Hypotheses

| # | Question | Expectation |
|---|---|---|
| a | A state adds to M1 | No, or a tiny amount: ratio 0.998–1.000 |
| b | B jumps add to M1 | No |
| c | C feedback adds to M1 | Most likely of the four to add, because it is new at-touch information: 0.995–1.000 |
| d | D correlation adds to M1 (FX) | Possibly: a broad dollar move continuing more than an own-pair move is the mechanism |
| e | A selected fade or follow makes money net of spread | No, by the record of the neighbouring studies |
| **GATE (VALIDATED)** | M1+ALL GBM ratio whole 95% interval below 0.99, **and** selected fade or follow net mean with whole interval above 0, **and** positive in at least 4 of 5 folds, **and** below all 20 shuffles | |
| **MIRROR** | Follow is the mirror of fade; both reported whether or not either passes | |

**Words.**
- `VALIDATED`: the gate holds. Research only; no live change without |t| ≥ 3 or a forward test.
- `CONTEXT`: a family's ratio is below 1 after Holm and below the shuffles, but the gate fails. The state describes reaction but does not pay.
- `NULL`: no family clears Holm, and the design was powered.
- `UNDERPOWERED`: only if the realised interval half-width exceeds the bar in §5.

## 5. Power

From LINE-REACTION on the same rows: log-loss ratio interval ±0.001 and top-quintile fade interval ±0.016 K (n ≈ 15,000).

| Cell | n | SE | MDE (80%, α 0.0125) | Pass bar | Verdict |
|---|---|---|---|---|---|
| Family ratio vs M1 | ≈ 71,000 resolved | 0.0005 | 0.0017 | < 1 after Holm | POWERED |
| M1+ALL ratio vs M0 | ≈ 71,000 | 0.0005 | 0.0017 | 0.01 | POWERED |
| Selected trade net mean | ≈ 15,000 | 0.008 K | 0.027 K | > 0 net | POWERED for a net edge of about 0.03 K (≈ 0.007σ) or more |
| D on FX only | ≈ 55,000 | ≈ 0.0006 | 0.002 | < 1 after Holm | POWERED |

## 6. Multiplicity

- **Scored cells:** four family ratios (Holm α = 0.05, one-sided bootstrap), plus the M1+ALL gate, which is conjunctive.
- **Descriptive, BH q = 0.10:** each new feature × rung, top minus bottom quintile of P(reject), at the line and at the neighbours. A survivor is a candidate for its own prereg, never a result.
- **Variants logged:** one registered run. Any further variant goes under Amendments before it runs.

## 7. What it does not test

- Other trade geometry. K = 0.25σ and 120 minutes are fixed for comparability. The noise-threshold stop gets its own study.
- Black-Litterman, book-level sizing and correlation as a portfolio input (layers 3 and 6). `common60`, `resid60` and `cvar60` only ask about reaction here.
- Order flow or dealer positioning, which `exhaustion-schedule` named as the likely source of any real exhaustion level.
- Meta-labelling as its own layer. The M1+ALL model is close to one, but calibration and bet sizing are a separate study.

## 8. What each verdict changes

- **VALIDATED:** forward paper record on the Vol-Layer page. Nothing live.
- **CONTEXT:** the state is drawn beside the lines as a description of reaction odds. No trade.
- **NULL:** the state does not explain reaction at K = 0.25σ, so reaction needs information outside price and vol. The next layer tests a different target, not more features on this one.
- **Either way:** the state fields are kept for sizing and stops, which this study does not judge.

## Amendments

## RESULTS
