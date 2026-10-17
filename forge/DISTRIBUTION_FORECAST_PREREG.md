# Conditional distribution forecast for today's range, and for each remaining hour

*Pre-registered 2026-10-17, before the model was fit. Step 4 of `plans/QUANT_SYSTEM_BUILD_PLAN.md`.
Runs through the Part A harness of `forge/HARNESS_REGISTRY_PREREG.md`. Side by side with the production
vol forecast; replaces nothing.*

## Question

Does a model of today's range distribution **conditioned on what is known at 07:00 UK** — recent
realised range, the day's scheduled releases, the volatility regime, the VIX front ratio and the
weekday — beat the production forecast and the unconditional hourly envelope, out of sample,
scored as a distribution rather than a point?

## Where this starts from

- **Production** (`/api/vol-forecast`): `hl_median` / `hl_75` per instrument, calibrated — median
  used ~100%, 75th exceeded ~25% (`project_range_forecast_calibrated`). It is a *base-rate* forecast
  with a vol scaling; it does not know today's calendar.
- **Hourly envelope** (`js/sessionStats.js`): each London hour's share of the day's H–L, p50 and
  p75, five years, n = 1,290 days per instrument. Unconditional on the day.
- **Validated range effects this model is allowed to use as features**, each already in the
  ledger: `surprise-size` (release days run wider, by kind), `vix-inversion` and `vol-curve-front`
  (VIX front ratio widens next-day range), `nq-down-week`, `tape-speed-persistence` (intraday pace
  persists), the HMM variance state (`hmm-variance-not-direction`).

The model's job is to put the validated effects into one calibrated distribution. It is not
allowed to discover new ones here.

## Target

- **Daily:** log of the London-day high–low (`bucketM1IntoSessions(packed, 'Europe/London')`),
  as a fraction of the 01:00 UK open.
- **Hourly:** each hour's H–L as a share of the day's H–L (the envelope's own unit), for hours not
  yet elapsed at the forecast time.

## Model (frozen)

**Primary:** quantile regression (pinball loss) at q10, q25, q50, q75, q90 on:

| feature | definition | asof |
|---|---|---|
| HAR lags | log H–L mean over the prior 1, 5 and 22 sessions | close + 1h |
| release dummies | high-impact release today, one dummy per `newsKind` (rate, inflation, jobs, unemp, growth, spending, survey, other); count of high-impact releases | calendar, known days ahead |
| release hour | the hour of the first high-impact release (for the hourly allocation) | calendar |
| regime | HMM variance state as of the prior close | close + 1h |
| VIX front | VIX9D ÷ VIX and VIX ÷ VIX3M at the prior close (indices and gold only; FX uses the FX-vol equivalent where it exists, else omitted) | close + 1h |
| weekday | Mon–Fri dummies | — |

Hourly quantiles = the day's predicted quantiles × the envelope's hourly share, **re-weighted toward
the release hour by the `surprise-size` effect** for that kind. Monotonic quantile crossing is fixed
by sorting.

**Fallback (reported alongside):** HAR point forecast × the production's scaled quantiles.

No regularisation choices to tune: ridge λ fixed at 1.0 on standardised features. No other
parameters.

## Universe

All 33 instruments are fit. **Primary cells** (the bars apply to these): NQ, SPX, GOLD, EURUSD,
USDJPY, GBPUSD. The rest are reported.

## Sample (frozen)

OANDA M1 from 2016-01 (the M1 history start) → 2026-09. **Train 2016–2021; OOS 2022–2026**,
walk-forward with annual refit on an expanding window. OOS halves: 2022–2023, 2024–2026.

**MIN_EVENTS:** ≥ 900 OOS sessions per primary instrument (have ≈ 1,150). ≥ 60 OOS release days
per release kind that gets its own dummy; kinds below that are pooled into *other*.

## Scoring (frozen)

Against three baselines on identical OOS sessions:
(a) the **production** forecast's quantiles (hl_median, hl_75, extended to q10/q90 by its own
scaling); (b) the **unconditional envelope** (the five-year quantiles); (c) a **20-session rolling
empirical quantile** naive.

| metric | what it checks |
|---|---|
| **CRPS** from the five quantiles | the whole distribution |
| pinball at q75 and q90 | the tail the stop-risk work cares about |
| **PIT histogram**, Kolmogorov–Smirnov vs uniform | calibration |
| q75 coverage | must stay near 25% — the production's one proven property |
| hourly: CRPS of the hourly-share forecast vs the envelope, release hours and non-release hours separately | whether the re-weighting does work |

## Bars (frozen)

The model **passes** if, on the six primary cells:
- CRPS ratio vs **production** < 0.95 in ≥ 4 of 6 instruments **and** in both OOS halves;
- CRPS ratio vs the **envelope** < 0.90 in ≥ 4 of 6;
- q75 coverage within **[22%, 28%]** in every primary cell (a sharper forecast that loses
  calibration fails);
- pinball q90 ratio vs production < 1.0 in ≥ 4 of 6;
- PIT KS p > 0.05 in ≥ 4 of 6.

**Placebo (void if failed):** release dummies shuffled across days within each year, 200 draws.
If CRPS does not worsen by at least the real model's gain over the fallback, the release term is
not doing work and the model is reported as HAR-only.

**Stress windows** (the CARD_CHECKS table: COVID, gilt crisis, SVB, yen unwind, tariff shock):
CRPS ratio vs production < 1.0 in ≥ 3 of 5. A forecast that only helps in calm is not shipped.

## Expected outcome, stated before fitting

A **5–12% CRPS improvement** over production on the primary cells, almost entirely from the
release dummies and the VIX front term — both are validated range effects the production forecast
does not condition on. The hourly re-weighting improves release-hour CRPS and does little
elsewhere. Calibration holds because the model is quantile-based and the features are few. The
envelope baseline is beaten by more than production, since it conditions on nothing.

If the improvement is under 5%, the honest reading is that the production forecast already
captures most of the predictable variance and the calendar adds less than its ledger entries
suggest at the daily horizon — a result worth banking.

## What each outcome changes

- **Pass:** the day strip's envelope becomes this model's hourly quantiles; the end-of-day read
  grades it by CRPS every session (a new loop, closed daily). The production forecast is **not
  replaced** — the two run side by side for 60 sessions and the daily CRPS ratio is shown. Only
  after that does the owner decide.
- **Fail:** the strip stays a five-year base rate, labelled so. The validated range effects stay
  as individual watches.

## Stopping rule

One model, one feature set, one fit. No feature search after seeing the result. A second model
needs its own registration naming what the first one missed and why.
