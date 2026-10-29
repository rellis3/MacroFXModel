# Day reconstruction — Milestone 1: validating the historical rebuild of the production forecast

Run 2026-10-28. GOLD, NQ, EURUSD. Scripts: `scripts/day-reconstruction/` (`ff_tags.py`, `validate_prod.mjs`,
`validate_hist.py`, `validate_drift.mjs`). Numbers: `validate_prod.json`, `validate_hist.json`, `validate_drift.json`.
Nothing in production was changed. No price *behaviour* was measured in this milestone. The only outcome statistic
used is the forecast's own calibration: how often each rung is exceeded against the 50/25/10% it promises.

**Lockbox note.** Published forecasts after 2026-08-21 were read only to check the arithmetic that turns σ into
levels. No price outcome after 2026-08-20 was looked at.

## Verdict

**The historical reconstruction is valid for GOLD and EURUSD and is the right basis for NQ, with three decisions
fixed below.**
- **GOLD and EURUSD:** rebuilt σ, rebuilt levels and drift match production exactly.
- **NQ:** production builds its σ from Yahoo NQ=F futures. The research history is OANDA NAS100, which runs about
  2% lower (median), so historical NQ levels sit slightly inside the live ones.
- **Discrepancies:** of the five suspected, two are immaterial, two are real and handled by design, and one is a
  small production defect, reported and not fixed.

## 1. What each level is (production definitions, preserved)

All levels come from one call, `buildLadder` ([js/forecastLadder.js:95](../../../js/forecastLadder.js)):
rung % = fitted width × σ_daily × event multiplier.
- **σ_daily:** `forecastSigma` on OANDA daily candles that close at 17:00 New York, with the instrument's frozen
  estimator (yz_10 for all three).
- **Widths and multipliers:** `js/forecastLadderParams.js`, the last walk-forward fold, trained through 2025-08-19.

| Family (export row) | Anchor | Price level | Available |
|---|---|---|---|
| **OH: "Open High (upside)"**, p50/p75/p90 | London-midnight open | open × (1 + OH%) | fixed at the open |
| **OL: "Open Low (downside)"**, p50/p75/p90 | London-midnight open | open × (1 − OL%) | fixed at the open |
| **OC: "Open to Close move"**, p50/p75/p90 | London-midnight open | open × (1 ± OC%), "Close med/75p" on the chart | fixed at the open |
| **HL: "High to Low range"**, p50/p75/p90 | none: a range **width** | not a price level by itself | fixed at the open |
| **Proj H / Proj L** (TradingView only), med/75p | the **opposite running extreme** | Proj H = running day low × (1 + HL%); Proj L = running day high × (1 − HL%) | moves all day |
| **Drift** (d = μ/σ) | n/a | reported, **not applied** to any level | fixed at the open |
| **Event multiplier** | n/a | scales σ: FOMC / NFP / CPI / high / holiday / none, from the instrument's own currencies | known before the day |

- **OH/OL and Proj H/L are different things.** The export's "Open High" is fixed off the open. The chart's "Proj H"
  trails the running low by the full HL width. Both are studied, under separate names.
- **The chart has no Proj p90 line**, although the HL p90 rung exists in the export.
- **The chart's Proj lines include the current bar's own extreme**, which isn't knowable inside that bar. The research
  rebuild (`v4Days` / `linesAtBar`) uses extremes through the *previous* bar only. That is the correct, no-lookahead
  version of the same line.

## 2. The checks

| # | Check | Result |
|---|---|---|
| V1 | Existing lookahead tests (`js/voteAtlasV4Lines.test.mjs`: truncation, future-scramble, NY-close cut-off, Proj lag) | **7/7 pass** |
| V2 | Production's daily bars vs NY-close bars built from local M1: published `yz_vol_annual` on 50 archived days (2026-06-11 → 08-21) | GOLD **50/50**, max diff 0.04%. EURUSD **50/50 exact**. NQ median 3.9%, max 13.8%: production uses Yahoo NQ=F, not OANDA |
| V3 | Every published ladder rebuilt from its own σ + event tag with the repo's params | **49/49** per instrument from 2026-08-24. The 2026-08-21 ladder used an earlier params version |
| V0 | Python (forge) σ vs JS `v4Days` σ, every day 2016–2026 | max difference **0.000** |
| — | Drift: published `drift_d` vs `computeForecast` on rebuilt bars (40 days) | GOLD median 0, max 0.04. EURUSD exact. NQ median 0.045 off (Yahoo again) |
| V4 | σ on the bars the widths were **fitted** on (London 00:00–22:00 sessions) vs the bars production **uses** (NY 17:00) | ratio median **1.00** (GOLD 1.003, NQ 1.001, EURUSD 1.005), 90% of days within ±3–5%. Calibration OOS on the live basis is **no worse**: mean deviation from target GOLD 1.33pp vs 1.45, NQ 1.51 vs 1.57, EURUSD 0.43 vs 0.46. **Immaterial.** |
| V4b | My rebuild reproduces forge's own reported OOS exceedance | HL p75, folds 0–3: within 0–2pp on all three. Fold 4 differs 3–4pp because my window stops where the event calendar does (n 163 vs a full year) |
| V5 | Production params (fitted through 2025-08-19) vs the fold in force at the time | OH p75 levels differ by a median **4.3% GOLD, 1.1% NQ, 5.3% EURUSD**. EURUSD's estimator differs on 78% of days (yz_20 in folds 1–4, yz_10 now). On 2020-08 → 2025-04, production params look better calibrated on GOLD and NQ *because they were fitted on those days*. **Real lookahead; handled by point-in-time params** |
| V6 | Event tags (the repaired ForexFactory history the multipliers were fitted on) | covers to **2025-04-07**. ~355 days (2025-04-08 → 2026-08-20, 13% of history) have **no tag**, so ×1.0 where production would apply ×0.93–1.24. **Real gap; handled by flagging** |
| V7 | First M1 touch vs the live tracker's rule (first H1 **close** beyond the level), OH/OL p50/p75/p90 | **These are different events.** H1-close fires on ~80% of M1-touch days at p50 and ~70–80% at p75/p90. When both fire, the close comes a median **42–57 min** later. Two-sided first touches in the same minute: **0–1 days in 10 years** |
| V8 | NQ: σ from Yahoo NQ=F (production) vs OANDA NAS100 (history), yz_10, 2016-11 → 2026-08 | OANDA/Yahoo median **0.982** (p5 0.87, p95 1.03), stable every year. Production NQ levels run ~2% wider than the history implies, up to ~13% on some days |

Calibration on the live basis with point-in-time params, OOS 2020-08-21 → 2025-04-07 (n ≈ 1,195 days each; target
50 / 25 / 10%):

| | HL p50 / p75 / p90 | OH p50 / p75 / p90 | OL p50 / p75 / p90 |
|---|---|---|---|
| GOLD | 51.6 / 26.3 / 9.8 | 53.4 / 27.0 / 10.5 | 49.2 / 24.7 / 11.1 |
| NQ | 53.8 / 25.1 / 8.8 | 48.1 / 25.3 / 10.4 | 53.3 / 27.2 / 10.4 |
| EURUSD | 49.8 / 24.9 / 10.4 | 49.0 / 24.6 / 9.3 | 50.2 / 25.8 / 10.4 |

A 95% interval at n ≈ 1,195 is about ±2.8pp at p50 and ±1.7pp at p90. The reconstructed levels mean what they claim.

## 3. Decisions fixed for Milestone 2 (from the measurements above)

1. **Levels:** `v4Days` / `buildLadder` unchanged. σ from NY-close bars built from M1, the production estimator,
   and the instrument's own event tag.
2. **Parameters:** point-in-time, using the walk-forward fold whose test year contains the date, passed through
   `buildLadder`'s existing `ladderParams` argument. These are the historical versions of the same calculation, not a
   new one. Two eras, reported separately:
   - **2020-08-21 → 2026-08-20: out-of-sample.** This is the primary evidence.
   - **2016 → 2020-08-20: production params, in-sample widths.** This era is labelled exploratory.
3. **Event tags:** ForexFactory history through 2025-04-07. After that the tag is **unknown**, so ×1.0 and the day is
   flagged. Every result is reported with and without the flagged days.
4. **Touches:** the **first M1 high/low touch** of a level is the event. The live tracker's H1-close confirmation and
   its time are kept as a second field on every touch, so both definitions can be compared.
5. **NQ:** the OANDA NAS100 basis is used (the widths were fitted on it). Results are stated as applying to lines about
   2% inside the published NQ lines.

## 4. Issues reported, not fixed

| Issue | Practical impact | Smallest action |
|---|---|---|
| Production NQ σ comes from Yahoo NQ=F, but NQ's widths were fitted on OANDA NAS100 | live NQ lines run ~2% wide (median), up to ~13% on some days | add NQ to `LADDER_OANDA_INDICES`, as was done for the other five indices on 2026-10-06. A live change: your call |
| The export header shows **one** event bucket (the first instrument's) for the whole paste | on a day when instruments carry different tags, the header misdescribes the others. The numbers themselves are right | cosmetic. Print the bucket per instrument block |
| On vol-forecast-v3, the "range used" chip and the session "outlook" text still measure against the **old** band family (`hl_median`), not the ladder | the page's range-consumed figure disagrees with the lines it draws | point those two readouts at `ladder.hl`. A live change: your call |
| Event-tag history ends 2025-04-07 | 13% of research days carry no event conditioning | handled by flagging. A backfill would need a ForexFactory history for 2025-04 → 2026-08 |
| No published ladder exists before 2026-08-21, and the minute history ends 2026-08-20 | the only direct day-for-day level check is the σ and arithmetic chain above, not a published-level vs rebuilt-level comparison on the same day | none needed. Each link in the chain is checked separately |

## 5. Milestone 2 (next)

Build the two datasets for GOLD, NQ and EURUSD on the decisions above:
- **Day table:** one row per instrument-day with every level, σ, tag, parameter era, open conditions, high/low and
  their times, range, close, and the order in which levels were reached.
- **Touch/transition table:** one row per first touch of each level, with the state before the touch and everything
  after it to the session end, both directions, with times. Ordering is marked ambiguous wherever one minute cannot
  settle it.

The full minute path stays in the M1 cache, keyed by instrument and date, so any day can be replayed.
