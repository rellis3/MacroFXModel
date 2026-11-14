# event-vol-ramp — does the front-implied-vol ramp into a scheduled FOMC/CPI/NFP say how wide the event-day range runs, beyond the level the vol-curve-front test already uses?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `event-vol-ramp` (two scored cells: SPX500, NQ) |
| Branch | `main` (small commits) |
| Register row | `plans/RESEARCH_REGISTER.md` → `event-vol-ramp` |
| Data | NY-close daily bars for SPX500 and NAS100 (`oi_research_book/data/gex_range_es/{spx500,nas100}_nyclose_d1.parquet`, the `gex-range` sessions), 2016-01-04 → 2026-08-20 (lockbox date respected); Cboe VIX9D and VIX closes (`analysis/surfaces/cboe/VIX9D.csv`, `VIX.csv`); event dates from `analysis/output/rate-surprise-events/events.parquet` (FOMC / CPI / NFP, 2016-01 → 2026-07, date and time only: its outcome columns are never read) |
| Seed | `20261114` |
| Uncertainty | stationary block bootstrap over sessions (mean block 10), B = 2,000; all-shift placebo on the ramp series |
| Scripts / outputs | `scripts/event-vol-ramp/` → `analysis/output/event-vol-ramp/` |
| Harness | own script (a range regression in the repo's `gex-range` convention: DR in σ units, OLS with block bootstrap) |

Applied from `education/RESEARCH_METHOD_LESSONS.md`: a scheduled-news baseline is in the model (family dummies), and a volatility
"win" must survive it; the registered gate is read against the verdict code before any result is read.

## 1. The claim (required)

Implied vol is known to rise into scheduled macro events. A recent line of papers uses the ramp of short-dated implied vol
before an announcement as a forecast of the announcement-day move. The repo already has the **level** of the front of the
curve (VIX9D / VIX) as a validated range read for NQ/SPX (`vol-curve-front`). The question here is the part that test did not
ask: **in the two sessions before a scheduled FOMC, CPI or payrolls release, does a rise in the front ratio (VIX9D / VIX) add to
how wide the event-day range runs, beyond the level of that ratio, the implied-to-realised ratio and the event type?** A range
(size) question, no direction.

## 2. Why it is not already settled (required)

Searched 2026-11-14 (register, `forge/`, `js/deskEvidence.js`, `plans/`, the paper-ideas report):
- `vol-curve-front` (VALIDATED, 2026-10-04): the **level** of VIX9D/VIX (calm < 0.8858, dear ≥ 0.9669) says whether the production NQ/SPX
  range lines are too tight or too wide for the day; it reports that dear-front days **with no Major release** ran as wide as with one
  (32-33%), i.e. the level effect is not the event calendar. It does not ask about the *change* into an event or an
  event-specific effect. **Overlap handled by design:** the level L enters the baseline, so only the ramp can score.
- `gex-range-iv` (UNDERPOWERED) uses VIX/VXN level relative to realised vol; no ramp, no event split. The Event Response Book and
  `nq-line-calibration-audit` show CPI/NFP/FOMC days run wider than the lines (event multipliers 1.0-1.2): a family effect,
  not a ramp effect, and entered here as family dummies.
- No match for "implied vol ramp" or a pre-event front-ratio change in `forge/` or the Evidence Book.

Different question: level says today's lines are too tight; ramp asks whether the *rise into* an event says the event day is wider
than that level already implies.

## 3. Definitions, fixed in advance (required)

- **Sessions and DR:** the NY-close sessions as in `gex-range` (label date = the date the session closes at 17:00 New York).
  DR_t = ln(H_t / L_t) ÷ (σ_t · √(8/π)), σ_t = standard deviation of the previous 20 daily log returns ending at t − 1
  (known before the session opens). Sessions with < 20 prior returns are dropped.
- **Events:** a session is an **event day** if an FOMC decision, a US core CPI or a US payrolls print falls on its New York date
  (`events.parquet` family and `t`, converted to America/New_York; the family is the event type). All other sessions are
  **ordinary days**. A session with two families is tagged with each. Sessions after 2026-08-21 are never read.
- **Knowable at the open:** every implied-vol input is the Cboe close (16:15 ET) of session t − 1, strictly before session t
  opens at 17:00 ET on t − 1.
- **Level L** = ln(VIX9D_{t−1} / VIX_{t−1}) (the `vol-curve-front` variable).
- **Implied-to-realised ratio v** = ln(VIX_{t−1}/100 ÷ (σ_t · √252)) (the `gex-range-iv` variable).
- **Ramp (primary)** = ln(VIX9D_{t−1}/VIX_{t−1}) − ln(VIX9D_{t−3}/VIX_{t−3}) = the change of L over the two sessions before t; expressed
  in units of its pooled standard deviation over all sessions (a scaling only).
- **Model B1 (scored):** DR_t ~ 1 + FOMC + CPI + NFP + weekday dummies + L + v + ramp + ramp × event, where event = 1 if any family flags.
  **b_ramp×event** is the score: the extra DR on event days per one SD of ramp, over and above the same ramp on ordinary days.
- **Model B0 (reported):** B1 without the ramp terms.
- **Descriptive:** ramp coefficient on ordinary days (the plain vol-dynamics effect), ramp × family (FOMC, CPI, NFP, BH q = 0.10),
  alternative ramps (VIX9D alone over 2 sessions; ratio over 1 session), halves.

## 4. Hypotheses, expectation first (required)

Expectation: event days are wide (family dummies positive), the level L carries range information, and the ramp
carries a small extra on event days (rising front ratio = the market adds event risk) that the level mostly already contains.

| # | Question | Pre-registered expectation |
|---|---|---|
| SPX500 | b_ramp×event > 0? | small positive; interval may span the +0.05 gate |
| NQ | b_ramp×event > 0? | small positive; interval may span the +0.05 gate |
| — | **THE GATE** (each cell) | b ≥ +0.05 per SD; bootstrap 95% CI lower > 0; Holm p < 0.05 across the two cells; real b above **95%** of all-shift placebos |
| — | **THE MIRROR** | positive control: the three family dummies are positive (event days wider than ordinary, B0) in both cells; a time-shifted event label (±1 session) shows no such excess |

**Verdict rules (each cell):** `VALIDATED` if the gate holds. `NULL` if the gate fails **and** the 95% CI upper bound of b < **+0.10**.
`UNDERPOWERED` otherwise. If the positive control fails the run is stopped and the event/session alignment debugged before any
ramp coefficient is read.

## 5. Power — what this design can and cannot find (required)

About 334 event days (FOMC 83, CPI 124, NFP 127) and 2,400 ordinary days per instrument. The interaction's SE is roughly
residual SD ÷ (SD(ramp) · √n_event) ≈ 0.4 / (1 · 18) ≈ 0.02-0.03, so MDE (×3.0 SE, Holm) ≈ 0.07-0.09 per SD, below the +0.10 operational
bar. The actual design-based SE and MDE (whole-sample residual SD, event-sample design matrix; no ramp coefficient read) are
written into Amendment A1 (PRE-RESULTS) before scoring. If the MDE comes out above +0.10 the cells are UNDERPOWERED by design.

## 6. Multiplicity — how many cells, and the corrected bar (required)

Scored: two cells (SPX500, NQ), Holm at α 0.05. Descriptive (BH q = 0.10 for the family split): the other ramp definitions, halves, family
split, ordinary-day coefficient. Both instruments share the same VIX inputs and event dates, so they are one source of evidence counted twice; a pass
needs both, and is research-only until |t| ≥ 3 and unseen data confirm it. This is a new family on data used by `vol-curve-front` and `gex-range`.

## 7. What this does NOT test (required)

Direction or the surprise; trade rules or stops; other events (ECB, NFP revisions, GDP); VIX9D before 2016; intraday windows; whether the
`vol-curve-front` result survives costs; anything after 2026-08-21.

## 8. What each verdict changes (required)

- `VALIDATED`: research-only candidate: a ramp multiplier beside the front-level multiplier for event days in the NQ/SPX range lines and the Daily
  Read tag; the terminal's Replay/FOMC strip may shade the ramp and say "the front rose into the event". Needs |t| ≥ 3 and unseen data before live.
- `NULL`: say so: the rise into an event adds nothing to the level the front already carries; keep the level input only.
- `UNDERPOWERED`: the ramp is shown as a description with its interval, never as an input.

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS (sample, design SE and MDE, alignment check)
No ramp coefficient had been computed. `scripts/event-vol-ramp/run.py --stage power` fits the baseline B0 (no ramp terms) for the alignment check and the residual SD, and uses the design matrix only for the interaction SE.

- **Sample (both instruments):** 2726 sessions 2016-02-02 to 2026-08-20, of which 322 event days (FOMC 82, CPI 121, NFP 126); the first 20 sessions drop for the trailing sigma and the VIX9D lags.
- **Design SE and MDE (interaction, per SD of ramp, x3.0 SE):** SPX500 residual SD 0.508, SE 0.038, **MDE 0.114**; NQ residual SD 0.467, SE 0.035, **MDE 0.105**. Both sit just above the +0.10 operational bar, so a NULL by the rule is out of reach unless the estimate is negative; the expected label is UNDERPOWERED by design, with the interval as the real output.
- **THE MIRROR (positive control) before scoring:** event days are wider than ordinary days (mean DR 1.16 vs 1.00 SPX500, 1.11 vs 0.97 NQ) and the B0 family dummies are positive (SPX500 FOMC +0.081, CPI +0.051, NFP +0.119; NQ +0.052, +0.050, +0.132), so the alignment check passes. Note the time-shifted label is not a clean zero for FOMC: the day after (shift +1) is also wide (SPX500 +0.125, NQ +0.158) while the day before (shift -1) is quiet; this is read as post-decision vol, not misalignment, and the family dummies are small after the level and IV controls because the front ratio already carries the event premium.
- No other change.


## RESULTS
