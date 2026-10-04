# Vote Atlas v4: a layered build, led by the Forecaster Portfolio lessons

*Drafted 2026-10-04. Inputs: `education/forecaster-portfolio-case-study/` Lessons 01–03 and
the evidence in `FINDINGS.md` (this folder). Status: **plan only**. Nothing here changes
a live setting until its phase passes.*

## Why a v4, and what changes

Vote Atlas so far:

| Version | What it is |
|---|---|
| v1 | Yang-Zhang ladder, `level-atlas` |
| v2 | HAR-RV(log) ladder, `level-atlas-v2` |
| bot | `volatility_bot_v3` trades it through `local_decision_engine` |

All of them have one decision stage: the forecast places the rungs, the vote picks
fade/follow, and every trade risks a flat 0.5%. The overlays (throttle, early exit,
currency gate, risk guard) sit on top, and they are tested only together.

v4 does **not** change the core. The ladder and the vote stay; both earned their place
(`FINDINGS.md` §0, §3.5). What v4 changes is **structure**, following Lesson 03:

1. **Separate layers, one job each, each with its own test and pass bar written
   before the test is run.**
2. **Use the volatility forecast for *how much* as well as *where*** (L03 §02). This is
   the main design gap found in `FINDINGS.md` §0.
3. **Try the meta-label layer only as a thin, optional filter.** A full meta-label model was already tried here (`Trade_Decision_Engine`, parked), and the new prototype shows the same weak discrimination (Phase 4).
4. **Put the implementation layer (TC) under measurement**, because that is where the
   fundamental law says IR is being lost (live took 48% of the backtest's trades,
   §3.9).
5. **Run the research as a managed search** (L02): every configuration logged, stopping
   rules set in advance, one layer changed at a time against a frozen control.

## The v4 stack

```
L1  Data            point-in-time M1/D1, calendar, IV       (same series live and in the fit)
L2  Range forecast  forecast ladder p50/p75/p90             (forecaster v3 — unchanged core)
L3  Event / jump    scheduled-event multipliers             (null tag = ×1.0, fixed 2026-10-04)
L4  Exhaustion      IV/σ, range completion, vol-of-vol       (NEW as a live input: a STATE, not a trigger)
L5  Signal          vote: follow / fade at a touched rung   (unchanged logic; book refit honestly)
L6  Meta-label      take it or not                          (OPTIONAL — prior attempt parked; see Phase 4)
L7  Sizing          how much: vol/exhaustion/meta/margin     (NEW — replaces flat 0.5%)
L8  Execution       fills, spread caps, slippage            (measured, not assumed)
L9  Management      DD throttle, ccy gate, kill rule         (keep throttle; add SPRT monitor)
```

Each layer reads only the outputs of the layers below it. So a layer can be
replaced and re-tested while everything below it is held fixed (L03 §01: "a better
forecast of one quantity can be introduced without redesigning the decision layers").

---

## Phase 0: foundations (before any v4 change; 1–2 weeks)

These are the conditions that make every later test mean something.

| # | Task | Lesson | Where | Pass bar |
|---|---|---|---|---|
| 0.1 | **Freeze v3 as the control.** Config hash, pair list, trade list and bootstrap band written to a frozen expectation | L01 cards 03/10 | `scripts/freeze_expectation.mjs` → `expect_vote_atlas_v3.json` | file exists; `bot-audit` reads it |
| 0.2 | **Start the trial ledger.** One JSONL line per configuration ever compared on this history: what changed, the date, Sharpe, n | L02 §05 practice 02 | new `analysis/forecaster_lessons/trial_ledger.jsonl` + a 20-line append helper | every later phase appends; DSR reads N from here |
| 0.3 | **Live ↔ backtest parity** on v3, after the 18 Sep engine fix | L03 TC | `live_parity.py` on the newest v3 decision log | **recall ≥ 90% and precision ≥ 90%**. If it fails, fix the live data/σ path first (the 18 Sep sync finding, `FINDINGS.md` §3.2 item 2) |
| 0.4 | **Every live trade in R.** Store `sl`/`tp` at entry | L01 card 10 | `pylego/broker/mt5.py` serialisers (`LIVE_BACKTEST_ALIGNMENT.md` §2.2) | live closed trades carry entry, stop and R |
| 0.5 | **Config hygiene.** The USDCHF per-pair spread cap reading 0.0 (§3.9) | — | bot-config / `pylego/costs.max_spread` | no pair has a 0 cap unless deliberately disabled |
| 0.6 | **Lockbox date.** Everything after the freeze date is held out from v4 research and examined **once**, at the end | L01 card 03 | written in this file when 0.1 lands | — |

## Phase 1: L1–L3, the forecasting layer (mostly done; 1 week)

The forecaster is already the strongest part (`FINDINGS.md` §0). Close its known gaps only.

| # | Change | Lesson | Pass bar (out of sample, per pair) |
|---|---|---|---|
| 1.1 | **One forecast for everything.** Today the forecaster v3 export button and Vote Atlas draw the *same* fitted widths (`forecastLadderParams.js`) with *different* σ inputs. The export uses 17:00-NY OANDA D1 bars (Yahoo for NQ) plus event multipliers (`volForecastScheduler` → `computeForecast`). Vote Atlas uses M1 bucketed by London calendar day (24h) and **always** `eventTag:'none'` (`levelAtlasEngine.js:225/303`, `server.js` `_volatilityV2InstrumentPreview`). The widths were fitted on **00:00–22:00 London** sessions (`forge/vol.py` `london22`), so neither input matches the fit. Known symptom: NQ 13.99% vs 24.70% on 2026-09-22, not root-caused (`server.js:21756`). v4: one forecast service, σ on `london22` sessions, event-tagged, that both the export and Vote Atlas read | L01 card 01 (point-in-time, same series); L03 §01 (one layer, one output) | the two exports agree to < 1% on every instrument; live exceedance on 20+ sessions within ±3pp of 50/25/10 |
| 1.2 | **Estimate index GARCH** by maximum likelihood, rolling, instead of the hand-set β 0.87 | L03 §02 | pinball loss ≤ incumbent; half-life reported |
| 1.3 | **IV ladder where IV exists** (CME CVOL pairs, GVZ for gold) is already pre-registered as a win, but Vote Atlas does not use it today (only the export's "Forecast (IV)" button does). Make it the default σ for those pairs in the one forecast service | L03 §02 | existing `forge/IV_LADDER_PREREG.md` result holds on the newest fold |
| 1.4 | Re-run any fade/touch study that used `/api/vol-forecast/backtest-range` before 2026-10-04 (bands were 2–8% narrow) | — | results re-banked |

## Phase 2: L4, exhaustion as a state (new live input; 1–2 weeks)

The exhaustion surface is our clearest edge beyond the course. IV/σ predicts how often
p75 is breached, out of sample (§3.3). The course's rule is to use such structure for
size, not direction. So L4 outputs a **state**, never a trade:

- `exh_ivsig` = IV/σ tercile (cheap / middle / rich)
- `exh_completion` = share of today's p50 range already travelled, at the moment of a touch
- `exh_vov` = vol-of-vol bucket

| # | Task | Pass bar |
|---|---|---|
| 2.1 | Compute the three state fields causally, at touch time, in `levelAtlasEngine.js` (backtest) and `local_decision_engine` (live). It must be one implementation | parity test: identical state on the same touch |
| 2.2 | Descriptive check: does the book's per-trade R differ by state? Report only; no rule yet | written up; ≥ 2 of 3 fields show a monotone R pattern in both halves, or the layer stays informational |

## Phase 3: L5, the signal layer, refit honestly (2 weeks; R2 needed)

The vote logic stays. What changes is **how the book behind it is fitted and judged**.

| # | Change | Lesson | Pass bar |
|---|---|---|---|
| 3.1 | **Remove the hold-gate contamination.** `annotateHolds` decides which dimensions "hold" using the same labels the trades are scored on. Refit walk-forward: the book that trades year Y is fitted only on data before Y | L01 card 02 (walk-forward), card 04 (leakage) | walk-forward book Sharpe ≥ 70% of the contaminated one; positive every year |
| 3.2 | **Pair selection by rule.** Keep a pair while its trailing t > 0 (walk-forward), not by hand | L02 §05 | rule-based universe ≥ all-32 universe (it was 5.69 vs 5.32, §3.5) |
| 3.3 | **minMargin stays on its plateau** (3–6). No re-optimisation | L01 card 07 | — |
| 3.4 | **Deflate with the ledger's real N**, plus CSCV PBO over everything in the ledger | L01 card 05, L02 §05 | DSR ≥ 0.95, PBO ≤ 0.10 |

## Phase 4: L6, the meta-label layer (optional, low priority; after Phase 5)

**Prior attempt: it failed, and the reason matters.** `Trade_Decision_Engine/`
(`FIT_FINDINGS.md`) fitted a logistic meta-label on 110,883 zone-touch events across 6 FX
majors. It beat the hand-set weights on Brier but was "weakly discriminating": almost
every event scored 50–60% and realised about 55%. The WT-stretch and `htf_align` features
were null, and it was PARKED. Its primary signal was *generic zones with no proven edge*.
López de Prado's method needs a primary model that already has one
(`MD files/VWAP_REVERSION_FINDINGS.md` says the same).

**The 2026-10-04 prototype (`layer_experiments.py` E1) shows the same weakness.** On top
of the Vote Atlas trades, which do have a primary edge, its OOS IC is only 0.031. The
gain (Sharpe 3.92 → 4.07; more under slippage) comes almost entirely from dropping the
bottom ~30% of trades, not from fine discrimination.

So in v4 the meta-label is a **thin, optional filter**, tried only after the simpler
rule-based layers:
- First choice: the rule-based equivalents. Margin weighting (E2, monotone, already
  passed) and the L4 state go into **sizing** (Phase 5).
- Only then test whether a model adds anything on top. Features known at entry; policy
  fixed in advance: skip when predicted R ≤ 0, never size by it.

| # | Task | Pass bar (walk-forward, equal 10% vol, **on top of Phase 5**) |
|---|---|---|
| 4.1 | Re-run E1 with Phase 5 sizing already applied, plus event tag, L4 state and entry spread | Sharpe ≥ Phase-5 book + 0.15 **and** ≥ + 0.3 at +1 pip slippage; else **stop: the layer ships off** (the third strike for meta-labelling in this repo) |
| 4.2 | Only if 4.1 passes: shadow live, logging skip decisions next to entries, trading nothing | shadow-skipped trades' live R < kept trades' live R over ≥ 300 trades |

## Phase 5: L7, sizing: the volatility forecast decides *how much* (2 weeks)

This is the course's central use of the vol layer, and the biggest gap in v1–v3.

```
risk_pct = base_risk
         × margin_weight(margin)          # E2: shrunk walk-forward mean R by margin bucket
         × state_weight(L4 exhaustion)    # only if Phase 2 found a monotone pattern
         × book_vol_scale                 # slow (λ≈0.99) book-vol target, regime-level
capped at ½-Kelly on the SHRUNK, COST-STRESSED edge  (L01 §06)
```

- `margin_weight` is the prototype that passed (E2: Sharpe 4.09 vs 3.92).
- `book_vol_scale`: fast vol targeting added nothing because book vol has a ~206-day
  half-life (§3.6). Keep only a slow, regime-level scale, and only if it passes.
- **Kelly cap:** full Kelly on the raw record is about 11.6× today's 0.5%. Use ≤ ½ Kelly
  on the edge *after* shrinkage and *after* the Phase 6 measured slippage. Never raise
  base risk before Phase 6 reports.

| # | Pass bar (walk-forward; each factor tested alone, then together; equal 10% vol) |
|---|---|
| 5.1 | each factor: Sharpe ≥ base, max DD ≤ base, on ≥ 90% of 1,000 bootstrap paths (the E6 test) |
| 5.2 | combined: improves both Sharpe and DD vs the best single factor; else ship only the best single factor |

## Phase 6: L8, execution, measured (runs in parallel from Phase 0; R2 + 2–4 weeks live)

| # | Task | Lesson | Pass bar |
|---|---|---|---|
| 6.1 | **Fill-realism replay** on R2 M1: spread at the time, a trade-through rule (price must trade *past* the rung, not touch it), worst-case same-bar stop/target | L01 card 11 | net mean R > 0 with margin ≥ 1 pip of headroom per kept pair |
| 6.2 | **Measured spread caps per pair** from real bid/ask history (`/api/level-atlas/spread-check`), replacing guesses | — | caps written to config, none 0 |
| 6.3 | **Live cost measurement**: 2–4 weeks at minimum size, unattended, trades in R (0.4) | L01 card 10 | slippage per pair estimated to ±0.2 pip; pairs with cost > headroom dropped |

## Phase 7: L9, management and monitoring (1 week)

| # | Task | Lesson | Pass bar |
|---|---|---|---|
| 7.1 | **Keep the graded DD throttle**: it reduced DD on 100% of bootstrap paths (E6) | L01 §04 | — |
| 7.2 | **Currency loss gate**: keep only if it passes its own walk-forward test. Today it barely moves anything (Sharpe 3.96 vs 3.95) | L01 card 07 | otherwise remove (Occam) |
| 7.3 | **Risk guard daily lockout** stays off (already off in v3). It was an uncalibrated default and the backtest never modelled it | L03 §01 | — |
| 7.4 | **SPRT kill rule** on per-trade R against the frozen v4 expectation: kill at LLR ≥ 2.77 (about 80 trading days if the edge is gone) | L01 card 10 (power) | wired into `bot-audit`, alerts on breach |
| 7.5 | **Regime report**: Sharpe by half-year and by L4 state, refreshed monthly | L01 card 09 | — |

## Phase 8: assemble, lockbox, roll out

1. **Assemble v4** from the layers that passed, each behind its own flag; failed layers
   stay off.
2. **One-shot lockbox:** run assembled v4 vs frozen v3 on the post-freeze data, once.
   v4 ships if it beats v3 on Sharpe at measured cost, without worse DD.
3. **Freeze v4's expectation** (as in 0.1) and point the SPRT monitor at it.
4. **Roll out small, scale in steps.** Base risk starts at the Phase 6-justified level
   and steps up after each 200 trades at or above expectation. The SPRT stops it
   automatically if the edge is gone.

## Running it as a managed search (Lesson 02)

- **One layer at a time**, against the frozen control. Never two changes in one test.
- **Pass bars are written in this file before the test runs.** A phase that misses its
  bar is recorded in the ledger and switched off, not re-tuned until it passes.
- **Stopping rule per phase:** at most 3 attempts (configurations) per phase, about
  3× its expected effort (L02 §02 overrun law). If none passes, the layer ships off.
- **Fade-direction research stays closed** (11 failures; `FINDINGS.md` §3.7).
  Direction ideas enter only through the meta-label features, never as a new standalone
  fade system.

## Rough timeline

| Weeks | Work |
|---|---|
| 1–2 | Phase 0 (parity, R records, freeze, ledger) · Phase 6.1 fill replay (laptop + R2) |
| 3 | Phase 1 |
| 4–5 | Phases 2 and 3 (R2) |
| 6–7 | Phase 5 (sizing) · Phase 6.3 live cost measurement runs unattended |
| 8–9 | Phase 7 · Phase 4 (optional meta-label, only if time) |
| 10 | Phase 8: lockbox, freeze, small live rollout |

Effort is mostly offline research. The only time-bound pieces are the parity check (days of
logs) and the live cost measurement (2–4 weeks, unattended), plus meta-label shadowing
if Phase 4 ever passes. They all run in the background.

*Research and education only. Not financial advice.*
