# surprise-size-pooled — results

Prereg: `forge/SURPRISE_SIZE_POOLED_PREREG.md` (committed in `fa02f432`, 2026-11-28, before any release-window
range was read). Run 2026-11-28, seed 20261128, B = 2000 (London-date cluster bootstrap). Branch
`wf2/surprise-pooled`. Ledger ids: `surprise-size-pooled-fx`, `surprise-size-pooled-us-risk`,
`surprise-size-pooled-us-indices` (the last split off by amendment A1, describe/demote only).
Page: `surprise-size.html` (Macro menu, "Surprise size vs release range (study)").

## Verdict

- `surprise-size-pooled-fx`: **VALIDATED** (30 min). 2 h is **CONTEXT**, rest of session **NULL**.
- `surprise-size-pooled-us-risk` (gold on US releases): **VALIDATED** (30 min). 2 h **CONTEXT**, rest of session **NULL**.
- `surprise-size-pooled-us-indices` (NQ, S&P 500 on US releases): **UNDERPOWERED** (S&P 30 min); every NQ cell and the
  other S&P cells are **NULL** (CI rules out a 7.5% uplift).

The registered gate (γ > 0, Holm p < 0.05 over 12 cells, uplift exp(1.5γ) − 1 ≥ 7.5%, positive in both halves, the
week-before placebo clean) holds for two cells. **Home FX, 30 min:** γ = +0.063 per 1σ of surprise [+0.047, +0.081],
t = 7.1, so a 2σ surprise's first 30 minutes run **+9.9% [+7.3, +13.0]** wider than a 0.5σ surprise's of the same
series, after the production forecast, the event multiplier, the usual size of that window and the hour before;
H1 +0.058, H2 +0.068; placebo +0.008 ± 0.018. **Gold, 30 min after US releases:** γ = +0.057 [+0.036, +0.080],
t = 4.9, **+9.0% [+5.6, +12.7]**; H1 +0.051, H2 +0.081; placebo −0.002 ± 0.041. Both clear the |t| ≥ 3 promotion bar.

This answers the 2026-10-31 audit objection to `surprise-size` ("size matters" untested): within release windows of
the same series, size matters, but only in the first half hour to two hours, and only modestly.

## Scored cells

| Cell | n (events) | γ | 95% CI | Uplift 0.5σ → 2σ | MDE (uplift) | Pass bar | Holm p | Halves γ | Placebo γ (± 1.96 se) | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| FX w30 | 5,847 | +0.063 | [+0.047, +0.081] | +9.9% [+7.3, +13.0] | 3.8% | 7.5% | 0.006 | +0.058 / +0.068 | +0.008 ± 0.018 | VALIDATED |
| FX w120 | 5,846 | +0.028 | [+0.014, +0.042] | +4.3% [+2.1, +6.5] | 3.9% | 7.5% | 0.006 | +0.032 / +0.027 | −0.008 ± 0.017 | CONTEXT |
| FX ros | 5,632 | +0.010 | [−0.003, +0.024] | +1.6% [−0.4, +3.6] | 4.4% | 7.5% | 0.595 | +0.012 / +0.014 | +0.011 ± 0.019 | NULL |
| NQ w30 | 2,490 | +0.026 | [+0.002, +0.048] | +3.9% [+0.3, +7.4] | 5.8% | 7.5% | 0.198 | +0.044 / +0.050 | −0.009 ± 0.044 | NULL |
| NQ w120 | 2,488 | +0.015 | [−0.007, +0.037] | +2.3% [−1.0, +5.7] | 5.9% | 7.5% | 0.595 | +0.029 / +0.008 | −0.021 ± 0.038 | NULL |
| NQ ros | 2,479 | +0.009 | [−0.012, +0.033] | +1.4% [−1.8, +5.0] | 6.7% | 7.5% | 0.748 | +0.018 / +0.016 | −0.027 ± 0.041 | NULL |
| SPX500 w30 | 2,278 | +0.032 | [+0.006, +0.058] | +4.9% [+0.9, +9.1] | 6.0% | 7.5% | 0.133 | +0.057 / +0.042 | −0.006 ± 0.050 | UNDERPOWERED |
| SPX500 w120 | 2,286 | +0.019 | [−0.005, +0.044] | +2.9% [−0.7, +6.9] | 6.1% | 7.5% | 0.595 | +0.036 / −0.001 | −0.012 ± 0.046 | NULL |
| SPX500 ros | 2,250 | +0.003 | [−0.020, +0.025] | +0.5% [−3.0, +3.9] | 6.3% | 7.5% | 0.790 | +0.015 / −0.001 | −0.033 ± 0.043 | NULL |
| GOLD w30 | 2,492 | +0.057 | [+0.036, +0.080] | +9.0% [+5.6, +12.7] | 6.0% | 7.5% | 0.006 | +0.051 / +0.081 | −0.002 ± 0.041 | VALIDATED |
| GOLD w120 | 2,493 | +0.034 | [+0.012, +0.059] | +5.3% [+1.9, +9.3] | 6.0% | 7.5% | 0.036 | +0.038 / +0.041 | −0.002 ± 0.042 | CONTEXT |
| GOLD ros | 2,491 | +0.025 | [+0.005, +0.048] | +3.9% [+0.8, +7.5] | 6.5% | 7.5% | 0.096 | +0.029 / +0.033 | −0.024 ± 0.047 | NULL |

Holm p floors at 0.006 (12 × 1/B). Halves: H1 2016-01 → 2020-12, H2 2021-01 → 2025-04. NULL = the bootstrap CI's top
uplift is under the 7.5% bar (NQ w30 7.4% and gold ros 7.5% are at the edge). The halves for SPX w120 / ros go
negative in H2, so those would fail the stability gate anyway.

Control coefficients (FX w30): log pre-release hour 0.22, log usual-window size 0.34, log production σ×width 0.19,
log event multiplier 0.30, concurrent other-economy release +0.21. Within-R² 0.193 → 0.204 with size (FX w30);
0.204 → 0.213 (gold w30). The production forecast and event multiplier carry information, and size adds to them.

## Controls

- **Week-before placebo** (same London clock one week earlier, the real event's z): every cell inside its 95% band.
- **Permutation** (z shuffled within series, 200×, 30 min): means +0.0002 (FX), −0.0012 (NQ), +0.0009 (SPX), +0.0003
  (gold); 97.5th percentiles 0.016 / 0.020 / 0.030 / 0.022, all below the observed FX and gold γ.
- **Positive control** (γ = 0.05 planted on the week-before windows): recovered 0.058 (FX), 0.041 (NQ), 0.044 (SPX),
  0.048 (gold); the unplanted fits 0.008 / −0.009 / −0.006 / −0.002.
- **Scheduled-news baseline**: built in (the event multiplier and series fixed effects).
- **Concentration**: per-economy γ at 30 min is positive in all 8 (US +0.062, CA +0.088, AU +0.082, GB +0.059,
  EU +0.034, NZ +0.058, CH +0.121, JP +0.108); the equal-γ Wald test does not reject (χ²(7) = 7.8, p = 0.35). Not one
  economy carrying it.

## Out of sample (descriptive)

Fit 2016-20, score 2021-25 on the MSE of log range: FX w30 **−1.3%** with size (n 2,146), gold w30 −0.2%, every other
cell slightly worse with size (NQ w30 +2.0%, SPX w30 +2.3%). The gain is real for FX at 30 min but small in MSE
terms, because the window's own noise is large (residual sd ≈ 0.40 in log range); for gold the in-sample γ is
stable across halves but adds almost nothing to the out-of-sample fit.

## Disaggregation (BH q = 0.10, no pass weight)

29 of 119 slices survive BH positive (chance ≈ 12). Survivors: per economy at 30 min US, CA, GB, AU, CH (EU q 0.17,
JP and NZ too thin); US at 2 h; tiers FX high (+0.070) and medium (+0.047) at 30 min, both survive (high larger, as
expected); gold high and medium at 30 min; families at 30 min: FX activity +0.084, inflation +0.096, employment
+0.076, survey +0.044; gold employment, inflation, survey. NQ survives only in inflation at rest of session (+0.111,
n 213), a candidate, not a result. Nothing in the rest-of-session FX column survives.

## Robustness (descriptive)

- Mean z instead of max: FX w30 +0.052 (se 0.010), gold w30 +0.053 (0.013).
- Real-clock rows only (schedule-timed rows dropped): FX w30 +0.059 (n 4,728), gold w30 +0.059.
- No concurrent other-economy release: FX w30 +0.061.
- Big-surprise dummy (z ≥ 1.5): FX w30 +0.115 log (≈ +12%), gold w30 +0.089.
- Discrete series (rate-decision-type, 105 of 584 with any surprise): FX 30 min +0.29 log (se 0.06), 2 h +0.20
  (0.05), session +0.09 (0.05); US on NQ/SPX/gold noisy (47 surprises).

## Population (honest count)

From the 26,403 backfill rows: 2,883 could not be timed and were dropped (all years); 331 unparseable values;
2016-01-05 → 2025-04-07 leaves 5,941 continuous-z release events (US 2,512, EU 981, CA 774, GB 769, AU 473, NZ 213,
CH 125, JP 94) and 587 discrete events. Scored at 30 min: AU 468, CA 769, CH 125, EU 976, GB 758, JP 84, NZ 168, US
2,499. **JP and CH are thin** (JP mostly BoJ rate, GDP, Tankan; 5 high-impact z rows), NZ has no rest-of-session cell
(its releases land after 21:00 London), and the **live** surprise store never fills JPY/AUD/NZD/CHF actuals, so a
live layer for those currencies would have no input. About 3% of event-windows were dropped for missing M1 or missing controls.

## Data repairs (and two new faults)

- ForexFactory archive: placeholder rows (no clock, 10,426) dated by the raw string; **new fault DATA_SPEC #27**:
  `forge/ff_calendar.apply_rule` puts summer 2023-25 placeholder rows a day early, and 2023+ real-clock rows stamped
  +04:30 are 1 h early (555 rows, shifted). `backfill/surprise_backfill.json` keeps the raw UTC stamp (placeholder
  rows sit the evening before).
- Times for placeholder rows: `calendar_events.csv` matched by currency, day and identical actual (2,742 rows; its
  46,095 duplicate rows dropped; summer 2014-15 ECB/BoE −1 h, and the same +60 min lag was seen on US/GB/EU rows there
  in 2014-15, outside this window); else the series' issuer-local schedule (4,801 rows). 2016 on, the two sources
  agree to the minute on 95.8% of the rows both time; schedule vs csv agree on 91.7%. Dropping every schedule-timed
  row leaves γ unchanged (above).

## Deviations from the prereg

- §5 bar set to 7.5% before registering (documented there; no outcome seen).
- A1 (post-hoc, describe/demote): the NQ/SPX cells banked apart as `surprise-size-pooled-us-indices`.
- The cluster bootstrap resamples dates on the within-transformed data (FE fixed, Frisch-Waugh), an approximation
  to re-estimating the fixed effects in each resample. With 149 lead series (median 29 events; 32 have fewer than 12, singletons contribute nothing), the effect should be small; CR1 SEs agree with the bootstrap (FX w30 se 0.009, CI half-width 0.017).
- `ES` is the OANDA SPX500 CFD (as registered); no NT8 ES was used.

## What this changes

- The `surprise-size` line on the site can now be stated as tested: **a bigger surprise widens the next 30 minutes
  (≈ +10% from a 0.5σ to a 2σ miss) in the home currency and in gold, on top of the release-day multiplier; by 2 h it
  is a few percent and by the close nothing.** It is not a reason to widen the whole session's band, and it does not
  apply to NQ or the S&P 500.
- No live calc changes. A release-window shadow layer (30 min / 2 h band × exp(γ·z), own switch, off by default) is
  the candidate next step, with a forward record before anything sizes from it. Range only, never a direction.
- Reopen: the NQ / S&P 30-min cells with more data (forward live store, or 2007-15 index M1 if it can be found); the
  NQ CPI rest-of-session slice as its own prereg; fix `ff_calendar.apply_rule` and refit the event multipliers side by
  side (register row `ff-calendar-2023-date-shift`).
