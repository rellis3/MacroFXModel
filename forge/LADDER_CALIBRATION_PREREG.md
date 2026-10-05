# Pre-registration — LADDER CALIBRATION scorecard: live ladder vs side-by-side candidates

Written 2026-10-05, after scoring the live ladder and **before** any candidate's results were seen
(the HAR-v2 run was in progress, unread). Frozen; changes only by dated amendment below, before results.

## Why

The "Forecast p50/75/90" export (vol-forecast-v3.html → `/api/vol-forecast/ladder/export`,
`js/forecastLadder.js` + `js/forecastLadderParams.js`) was checked against every London day, 34 instruments,
2016 → 2026-08 (`scripts/rangebook/ladder_calibration.mjs`, `analysis/surfaces/ladder_calibration.py`):

- **Unconditionally calibrated OOS** (after trained_through 2025-08-19, 225 dates, date-clustered SEs):
  every OH/OL/HL/OC rung within ~2.5pp of 50/25/10; fx, gold and indices alike.
- **Conditionally miscalibrated by σ regime, in-sample and OOS alike.** Quintiles of σ ÷ its own trailing
  250-day median: quietest fifth HL > p75 on 32–34% of days and > p90 on 14–15%; busiest fifth 19% and 7–8%.
  Within-instrument slope of log(realised HL) on log(σ_used) ≈ 0.6. The σ over-reacts; lines are too tight
  after quiet spells and too wide after busy ones.

This scorecard is the single test every σ / ladder candidate has to pass before it goes onto the
side-by-side shadow screen. **Nothing here changes any live calculation**: candidates are scored offline
through `buildLadder`'s read-only `ladderParams` override, and promotion to live is the user's decision.

## Protocol

- Days: every London day v4Days produces (the page's own calculation: London-midnight open, NY-close daily
  bars before it, calendar-proxy event tag; tag unknown → ×1.0 after 2026-07-02, identically for both
  ladders). Days with < 600 M1 bars dropped. Realised OH/OL/HL/|OC| from that day's M1.
- Head-to-head rows: inner join of live and candidate on (instrument, date), so both are scored on
  exactly the same days.
- **Window: 2025-09-05 → end of M1 data**, the first day after the latest `trained_through` in either
  params file (live 2025-08-19, `forecastLadderParamsV2.js` up to 2025-09-04). Out-of-sample for both.
- σ regime: quintile of the **live** ladder's σ_daily ÷ its own trailing 250-day median (shifted one day),
  so both ladders are bucketed on the same days. Quintile edges taken on the window's pooled rows.
- SEs clustered by date (mean exceedance per date across instruments, SE across dates).

## Pass rule (candidate vs live)

- **PRIMARY — conditional calibration.** Mean |exceedance − target| over 5 σ-quintiles × {p75, p90} ×
  {HL, OH, OL} (30 cells) is **lower for the candidate** than for live.
- **TARGET BAR — "fixed".** Every σ-quintile within ±3pp of target at HL p75 and HL p90. Reported as met or
  not met; meeting the PRIMARY alone is "better", not "fixed".
- **CALIBRATION GUARD.** Unconditional mean |exceedance − target| over all 12 rungs no more than 1pp worse
  than live. A candidate that fixes the regime split by breaking the average does not pass.
- Reported, no rule: the log-log slope (expect closer to 1), per class (fx / gold / index), per instrument,
  by event tag.

## Variant log (Lesson 2: the breadth of the search enters the evidence)

| # | Candidate | Added | Status |
|---|---|---|---|
| 1 | `forecastLadderParamsV2.js` as-is (har_rv_log σ, its own widths and event multipliers) | 2026-10-05 | **PRIMARY PASS · GUARD FAIL · TARGET BAR NOT MET** — see Results |

| 2 | HAR-log σ exactly as production computes it (`forecastSigma(last 800 D1 bars, 'har_rv_log')`), widths refit | 2026-10-05 | registered (Amendment 1) |
| 3 | IV-adjusted σ = σ·exp(k(ln(IV/σ) − μ)) as the shipped "Forecast · IV-adjusted" export, k/μ/widths refit on train | 2026-10-05 | registered (Amendment 1) |
| 4 | Pure IV σ = IV/√252 (CME 30d ATM majors, GVZ gold, VIX/VXN indices, crosses from legs), widths refit | 2026-10-05 | registered (Amendment 1) |

Further variants (σ shrunk toward its long-run level, σ-regime-conditional widths, IV blend) are added
here by amendment **before** they are run.

## Amendment 1 (2026-10-05, before any variant 2–4 result was computed)

Variants 2–4 need implied-vol inputs the JS harness does not have, and variant 1 showed widths only work on
the exact σ series they were fitted on. So variants 2–4 are scored in ONE Python harness,
`forge/run_ladder_candidates.py`, where **every arm's widths are fitted by the same procedure on the same rows
and only σ differs**:

- Inputs as the shipped IV-adjusted export uses them (`forge/export_iv_adjusted_params.py`): σ from the
  production estimator on OANDA D1 bars (last bar before the session); realised H-L / |O-C| / O-H / O-L on the
  London 00–22 session; IV: CME constant-maturity 30d ATM (majors), GVZ (gold), VIX / VXN (indices), crosses
  from the two legs' IV and their 60-bar return correlation. Variant 2's σ comes from the JS production function
  itself (`forecastSigma(bars.slice(-800), 'har_rv_log')`), run per day on the same D1 bars.
- Arms: **A0** live estimator σ (the baseline, refit the same way), **A2** HAR-800, **A3** IV-adjusted, **A4** pure IV.
- Instruments: the 28 with an IV source (6 USD majors, GOLD, 15 crosses, 6 indices). NZD pairs excluded (no IV).
- Rows: sessions where every arm has a σ (FX IV starts 2020-09). Train = dates < 2025-09-05; test = 2025-09-05 on.
- Widths per instrument × quantity × rung: `forge.vol.fit_width_multiplier` on train rows. k and μ (A3) per class
  on train rows. **No event multipliers in any arm** (identical for all; IV already prices scheduled events).
- Scoring on test rows exactly as the Pass rule above, with A0 in place of "live": PRIMARY 30-cell σ-quintile miss
  lower than A0; GUARD 12-rung miss ≤ A0 + 1pp; TARGET BAR every quintile within ±3pp at HL p75/p90. Quintiles
  from A0's σ ÷ its trailing 250-session median. Also reported: HL p50+p75 pinball ratio vs A0, slope.
- More than one arm may pass; then the one with the lower PRIMARY miss is preferred, pinball as tie-break.

## Outcome handling

Pass or fail, no live file changes. A passing candidate goes onto the side-by-side shadow screen to be
watched on live data; a failing one is recorded here and in the ledger with the cells it failed.

## Results

### Variant 1 — HAR-v2 as-is (2026-10-05)

Window 2025-09-05 → 2026-08-20, 8,415 instrument-days, 248 dates, 34 instruments, identical rows for both.

| | live | HAR-v2 |
|---|---|---|
| 12-rung unconditional mean miss | 0.96pp | 2.61pp → **GUARD FAIL** |
| 30-cell σ-quintile mean miss | 2.72pp | 2.59pp → **PRIMARY PASS** |
| HL > p75 by σ quintile Q1…Q5 | 31.4 / 23.4 / 20.3 / 21.2 / 18.6 | 22.2 / 18.9 / 18.7 / 20.9 / 21.8 |
| HL > p90 by σ quintile Q1…Q5 | 15.1 / 10.9 / 7.5 / 7.8 / 7.2 | 10.1 / 8.0 / 7.1 / 7.8 / 7.7 |
| log-log slope fx / gold / index | 0.61 / 0.55 / 0.60 | 0.86 / 0.94 / 0.88 |

Read: HAR fixes the **shape** (the regime tilt is gone, slope 0.6 → ~0.9) but the whole ladder is **too wide**
(HL > p75 20.6% overall). Diagnostic, not a rule: it is too wide in **every year 2016–2026** (HL > p75 17.7–25.4%,
mostly 20–22%), in-sample included — so this is a level mismatch between the V2 widths and the σ that
`forecastSigma('har_rv_log')` produces on NY-close bars (the widths were fitted on forge's HAR series), not a
regime effect. Same failure mode the params header warns of: widths are quantiles of realised ÷ σ for ONE σ series.
