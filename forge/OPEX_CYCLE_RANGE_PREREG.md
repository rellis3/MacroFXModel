# OPEX CYCLE: are US index ranges tighter into monthly options expiry and wider after it?

*Pre-registered 2026-10-19, before any number in this file was computed. Queued since 2026-09-19 in
`MD files/LEAD_LAG_TESTS.md` ("OpEx week vs the week after (range)") and never run. Prompted by the dealer-hedging
work (C.OG's 2026-10-18 chart): the mechanism is ours, not his.*

## Prior work (checked first)

- G2: the NQ gamma sign predicts next-day range; its event-day check found opex days add nothing to *that* effect
  (`oi_research_book/G3_AND_EVENTDAY_RESULTS.md`). That is a different question from the opex calendar itself.
- Max-pain pinning: null (`oi-max-pain`, 2026-09-10). This test does not use a level.
- No test of range by position in the expiry cycle exists in `js/deskEvidence.js`, `forge/` or `plans/`.

## Mechanism (one paragraph)

Monthly equity options expire on the third Friday. In the days before, open interest near spot is concentrated in
short-dated contracts whose gamma is large; when dealers are net long that gamma their hedging damps moves
(pinning), and charm (delta decay) forces hedge adjustments that also lean on price. After expiry that block of
gamma is gone and the replacement book is longer-dated with less gamma per contract, so the damping weakens
("unclenching"). Prediction: realised range relative to the forecast is lower in opex week and higher in the week
after, on US indices, and not on currencies (their CME options expire on other dates).

## Data

- `analysis/output/forecast_history/<INST>.csv` (the Step 0 table): London sessions 2016-03 → 2026-08-20, complete
  sessions only (`forecast_record.complete`), dates ≤ 2026-08-21 (lockbox).
- **Outcome** y = log(r_hl / live_hl_p50): realised high-low over the live ladder's median line (event multiplier
  included), so vol regime and scheduled events are already in the denominator.
- **Calendar** (known in advance, no lookahead): opex = the third Friday of each month; if no session for that date
  exists in the US index data (exchange holiday), the previous session.
- **Phases** per London session date:
  PRE = the four sessions before opex (Mon–Thu of opex week); OPEX = the opex session; POST = the five sessions
  after; OTHER = everything else. Quarterly = March, June, September, December cycles.
- **Controls:** y is demeaned within instrument × weekday and instrument × calendar year (two-way, fitted on OTHER
  plus all phases jointly by least squares with phase dummies). Primary sample excludes sessions with
  `event != 'none'` (CPI, FOMC, NFP, high-impact); the all-sessions version is reported.

## Instruments

- **Test:** NQ, SPX500, DOW, US2000 (the US index CFDs).
- **Placebo A (other market):** EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF on the same equity calendar.
- **Placebo B (wrong dates):** the US4 with the calendar shifted two weeks later (third Friday + 14 days).

## Primary statistic and inference

Δ = β_POST − β_PRE (log points), pooled US4. 95% interval from a cluster bootstrap over opex cycles (each month's
PRE+OPEX+POST block and the OTHER sessions of that month resampled together), 2,000 reps.

## Verdict (applied mechanically)

- **SUPPORTED:** Δ ≥ +0.05 and its interval above 0; Δ > 0 on ≥ 3 of the 4 instruments; Δ > 0 in both halves
  (sessions ≤ 2020-12-31 and ≥ 2021-01-01); placebo A |Δ| below half the US4 Δ; placebo B |Δ| < 0.03.
- **NULL:** |Δ| < 0.025, or instruments split 2–2.
- **WRONG WAY:** Δ ≤ −0.05 with the interval below 0.
- **INCONCLUSIVE:** anything else.

Also reported, not part of the verdict: β_PRE, β_OPEX, β_POST separately; the quarterly-only Δ; the all-sessions Δ.

## Decision

- SUPPORTED → an opex-phase term becomes a candidate for the one range forecast, as a new pre-registered variant of
  `forge/ONE_RANGE_FORECAST_PREREG.md` (never added directly), and the dealer hedging map shows the phase as a
  tested range context line.
- Otherwise → recorded; the map shows the phase only as untested mechanics, or not at all if NULL.

Script `scripts/forecast_history/opex_cycle.py`; output `analysis/output/opex_cycle/RESULTS.md`, `results.json`.

---

## Results (run 2026-10-19 after the commit of this file, 86b105f2)

Full table: `analysis/output/opex_cycle/RESULTS.md`. 6,241 non-event US-index sessions, 124 expiry cycles.

**Verdict: INCONCLUSIVE.** Δ (POST − PRE) = **+0.055** [−0.014, +0.124]: the size bar (0.05) is met, the direction
holds on all four indices (NQ +0.062, SPX500 +0.056, DOW +0.029, US2000 +0.073) and in both halves (+0.056 /
+0.055), FX placebo +0.019 (below half), date-shift placebo +0.029 (under 0.03) — but the interval includes 0.
About 5% more range after expiry than into it, consistent with the mechanism, not yet distinguishable from noise.

**Not pre-registered, flagged for its own test:** PRE, OPEX and POST all sit ~0.03–0.08 *below* OTHER, and the
+14-day placebo window sits *above* it: on non-event days the second half of the month ran quieter than the first
half relative to the ladder. A month-position effect, possibly linked to how early-month releases are handled.
