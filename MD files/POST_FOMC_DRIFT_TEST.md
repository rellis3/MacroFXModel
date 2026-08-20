# Post-FOMC unconditional USD drift — pre-registration

> **Status: PRE-REGISTERED 2026-08-20, design frozen BEFORE the run; results
> appended below same day.** Same discipline as `CB_SENTIMENT_PRICE_TEST.md`.
> This tests the descriptive observation that document flagged as
> hypothesis-generating: dollar-basket R5 after FOMC meetings averaged +26.3bp
> with 65% positive (N=81, naïve t≈2.5). That observation was seen before this
> registration — which is exactly why the confirmatory cell below is NOT
> "is the mean positive" (it demonstrably is, in-sample) but "is it
> FOMC-specific rather than just the sample period's USD drift" — a question
> the peeked statistic does not answer.

## Hypothesis and mechanism

Scheduled FOMC meetings resolve macro uncertainty; post-announcement flows
rebalance toward the dollar as hedges unwind over the following days.
Honest counter-hypothesis stated up front: 2021–2026 was a USD-strong period,
so a positive post-FOMC mean may simply be the unconditional drift of the
sample — the mechanism would then be "the dollar went up," not "FOMC."
The published literature's robust effect is drift *before* the announcement,
not after — this test's prior is accordingly modest. **Blunt odds: ~25–35%.**

## Design (frozen)

**Event windows:** the Stage-1 R5 windows exactly as already computed
(`analysis/fomc_event_study/stage1_events.csv`): dollar-basket log return
14:30 ET on the decision day → 14:00 ET five trading days later. N=81
(2024-12-18 excluded — Christmas window, no bars).

**Baseline:** the same 5-day window shape (D 14:30 ET → D+5 14:00 ET)
computed for **every eligible trading day** 2016-02 → 2026-05. Eligible =
Mon–Fri, valid prices both ends, and NOT within −1…+5 trading days of any
scheduled FOMC decision day (so the baseline is "no scheduled FOMC nearby").

**Confirmatory cell (one):** placebo resampling — 10,000 draws of 81
baseline-day returns (uniform with replacement; overlap between drawn
windows widens the placebo distribution, which makes the bar *harder*, and
is accepted). **Pass:** the event mean exceeds the **95th percentile** of
placebo means AND the event mean is positive in both halves (2016–2020,
2021–2026). **Fail:** either condition missed. House precedent for the
placebo-percentile form: `ECON_TREND_TEST.md` (which used a 90th bar; 95th
here because the statistic was peeked descriptively first — the stricter bar
is the price of the peek).

**Descriptives (no pass/fail weight):** event vs baseline win rates, median,
per-half means, and the same comparison for R1 (next-day window).

## Decision table (written before running)

- **Pass:** a "hold USD 5 days post-FOMC" spec earns a harness test with CFD
  financing and costs (its own pre-registration; 8 round-trips/year on 7 legs
  — financing will be first-order).
- **Fail:** banked. The +26bp was the sample's USD drift wearing an FOMC
  costume; the observation is closed and must not be re-proposed without new
  data. Either way this closes the loose end left by
  `CB_SENTIMENT_PRICE_TEST.md`.

---

## Result (run 2026-08-20, code `analysis/fomc_event_study/post_fomc_drift_test.py`)

**CONFIRMATORY CELL: PASS — the drift is FOMC-specific, not sample drift.**

- Event windows (N=81): mean **+26.3bp**, 65% positive, median +30.3bp.
- Baseline (N=2,094 non-FOMC-adjacent days, same window shape): mean
  **−3.2bp**, 49% positive. The counter-hypothesis is dead on its own
  numbers — the sample period's unconditional dollar drift was flat-to-
  negative, so the event effect is +29.5bp *excess*, not a trend in costume.
- Placebo: event mean sits at the **99.8th percentile** of 10,000 placebo
  means (bar: 95th, which sat at +14.1bp).
- Halves: 2016–2020 **+26.3bp**, 2021–2026 **+26.4bp** — near-identical
  across two very different dollar regimes (baseline halves: −10.6bp and
  +3.7bp). Period-stable in a way few effects in this repo have been.

**Honest caveats, stated with the pass:** the statistic was peeked
descriptively before registration (mitigated by the stricter 95th bar — it
cleared 99.8% regardless); this is a *market-behavior* result, not yet a
strategy — no costs, no financing, no fills are in these numbers; and the
economic size is ~26bp per event on a 7-leg basket, 8 events/year — CFD
spread + 5 nights of financing on 7 legs is first-order at that scale.

**Per the frozen decision table:** a "hold USD for 5 trading days after each
scheduled FOMC decision" spec now earns a **harness test** — its own
pre-registration with per-leg costs, overnight financing (incl. triple-swap
Wednesdays), realistic fills, and an IS/OOS split. Gross-vs-net is the
headline question there; ~40bp/yr of financing drag per leg could consume
the edge. Until that passes, this stays a banked *finding*, not a signal.
