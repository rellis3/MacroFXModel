# ladder-exhaustion-events: pick each line's calc by how close its levels land, then add event days, per line

**Pre-registered 2026-11-24, before any pinball pick or event-layer outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `ladder-exhaustion-events`; ledger ids `ladder-pinball-per-line-cfd` (H1), `ladder-event-layer-per-line-cfd` (H2) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-exhaustion-events` |
| Source | Owner 2026-11-24. (1) The lines are for **exhaustion**: where the day's high, low and close land, so the calc for each line should be chosen on how close its p50/p75/p90 levels land, not on QLIKE alone. (2) "Layer the calendar of high and medium events on top … so we've got a forecaster that will also trend in high volatility days", e.g. "a CPI release will increase it by X". Jordan's (a C.OG group member) method throughout: each line its own targeted calc |
| Instruments | The 40 OANDA CFDs of `ladder-qlike-per-line-cfd` (same builds, same exclusions; NQ from `analysis/output/ladder-per-line/build/nq`) |
| Lines | HL, OH, OL, **Close+** (close − open on sessions closing above the 00:00 London open), **Close−** (open − close on sessions closing below). OC is not scored (the owner replaced it with Close±) |
| Window | Sessions to **2026-08-21** (lockbox untouched). Widths from 2018, picks from 2019, scored 2020 → 2026-08-21 |
| Seed | `20261124`. B = 2000, 63-session **date-aligned** blocks |
| Scripts | `scripts/ladder-exhaustion-events/{events.py, race.py}` → `analysis/output/ladder-exhaustion-events/` |

Applied from `education/RESEARCH_METHOD_LESSONS.md`: scheduled-news baseline handled by named release families (not a
vendor grade); placebo calendar for the event layer; date-aligned bootstrap because FX pairs share shocks.

## Levels and the exhaustion score

For a line q, an arm's σ and a quantile τ ∈ {50, 75, 90}: level_τ = k_τ · σ, with k_τ = the τ-quantile of x/σ over that
line's own sessions in 2018 … Y−1 (walk-forward, refit each year Y). **Exhaustion score** = pinball loss
ρ_τ(x − level_τ) = (x − level)·(τ − 1{x < level}), averaged over the three τ. At τ = 50 this is half the absolute
error of the p50 line against the actual high/low/close: the owner's "how close was the line". Lower is better.

## H1: pick by exhaustion score instead of QLIKE

Per instrument and line, walk-forward pick for year Y = the site-computable arm (no IV, no H8, as the export) with the
lowest mean pinball on 2019 … Y−1 (**PB pick**), vs the current rule, lowest mean QLIKE on the same years (**QL pick**,
what the CFD export uses now). Both are scored on pinball 2020 → 2026-08-21.

Δ1 = Σ pinball(PB pick) / Σ pinball(QL pick) − 1 per instrument and line, equal-weight mean over the 40 × 5 cells,
90% CI from the date-aligned bootstrap. All years and each half (2020–22, 2023–26).
- **VALIDATED:** CI upper < 0 overall and in both halves → the export switches each line to its PB pick.
- **NULL:** CI lower > −0.5% → the QLIKE picks already land the levels as well; keep them.
- **UNDERPOWERED:** otherwise.

## H2: event-day widths on top of each line's calc

Session tags (`events.py`, known before the open: scheduled calendar only, no actuals read), per instrument from the
currencies it hears (USD always; FX pairs their two legs; DE30 EUR, UK100 GBP). Priority **FOMC** (Fed rate decision)
> **NFP** > **USCPI** > **CB** (the instrument's other central-bank rate decisions) > **TIER1** (CPI, jobs /
unemployment, GDP, retail sales, PCE, ISM of a relevant currency) > **POST** (session after an FOMC / NFP / USCPI / CB
day with none of its own) > **none**. Sessions where a relevant currency has no calendar source (JPY/AUD/CAD/CHF/NZD,
2025-04-08 → 2026-07-02) are **unknown**: excluded from fitting and scoring the layer, never imputed.

Layer: per instrument, line and bucket b, k_τ,b = (n_b · q_τ(x/σ | b) + 40 · k_τ) / (n_b + 40) on the same walk-forward
training sessions (shrunk toward the all-day width). Level_τ = k_τ,b · σ on a session tagged b. Base σ = the line's
**QL pick** (the live CFD export's calc), so H2 does not depend on H1.

Δ2 = Σ pinball(with layer) / Σ pinball(without) − 1 per instrument and line, mean over the 40 × 5, on known sessions,
date-aligned bootstrap, all years and both halves.
- **VALIDATED:** CI upper < 0 overall and in both halves **and** Δ2 below the placebo's Δ → event widths go on the
  CFD export (shadow, labelled).
- **NULL:** CI lower > −0.5%. **UNDERPOWERED:** otherwise.

**Placebo:** the same layer fitted on tags shifted 5 sessions later (same counts, wrong days). If the placebo improves as
much as the real calendar, the gain is shrinkage, not events.

## Descriptive (no verdict)

- Share of line-years where PB and QL picks agree; the final PB pick per line (best site arm on pinball 2020 → 2026-08).
- Δ2 on event sessions only, per bucket; and the layer on the PB pick.
- **The owner's table:** for each bucket and line, the p50 / p90 width on that bucket's days ÷ the all-day width
  (fit on 2018 → 2026-08-21), per instrument and pooled by class (FX, indices, metals/energy): "on a CPI day the HL
  p50 runs × X".
- Hit rates of the layered p50/p75/p90 by bucket.

## Controls

1. Realised HL/OH/OL and signed close reproduce the build on ≥ 99% of sessions (as `ladder-qlike-per-line-cfd`).
2. Calendar sanity, checked on the inventory before outcomes: Fed decisions on Wednesdays 98 / 104 (rest are
   date-rule edge rows), payrolls on Fridays 147 / 155 (Thursdays = holiday weeks); 8 FOMC, 12 NFP, 12 US CPI a year.
3. The QL pick reproduces `ladder-qlike-per-line-cfd`'s per-line picks.

## What it changes

Shadow only; the live ladder and live calcs are untouched. H1 VALIDATED → the CFD export's picks switch to PB.
H2 VALIDATED → event widths on the CFD export. Either NULL/UNDERPOWERED → the owner's table still goes on the site as
descriptive context, labelled with the verdict. Futures (NQ, GC, 6E, 6J) follow the same rule in a follow-up if either
hypothesis changes the CFD export.

## Amendments
