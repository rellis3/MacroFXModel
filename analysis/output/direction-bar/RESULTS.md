# direction-bar — results

**Context.**
- Prereg: `forge/DIRECTION_BAR_PREREG.md`, committed in `0e0e73ba` on 2026-10-31, before any outcome was computed.
- One post-hoc amendment, A1: four fixes, each of which can only widen intervals, raise MDEs or lower the pooled gain.
- Run 2026-10-31, seed 20261031. Branch `claude/direction-bar`. Ledger id `direction-bar`.
- Data: OANDA daily mid closes, 2006 → **2026-08-21**. Nothing after the lockbox date was read.
- Reproduce from the repo root (`MFX_DATA_ROOT` = a checkout that holds `features/` and the banked outputs):
  1. `python -I scripts/direction-bar/bar.py`
  2. then `scoreboard.py`
  3. then `tables.py`

Full tables: `tables.md`. Machine-readable: `results.json`, `scoreboard.json`.

## Verdict: CONTEXT

This is a measuring instrument, not a directional claim. Every acceptance criterion holds; A1 explains the one that
needed a fix:

- **Q1, baselines:** NQ 20-day P(up) is 0.652, against the target 0.653 ± 0.01. EURUSD is 0.493.
- **Q2, positive control:** a planted effect of exactly the MDE was found at power 0.76–0.85 in every σ-unit and IC
  control (6/6), and 0.76–0.78 with the exact hit-rate plant (4/4).
- **Q3, costs:** tabled; disagreements explained below.
- **Q5:** every cell labelled.

## 1. The correction the owner asked for: detectability relative to each market's own baseline

The proposal's table measured "detectable" against 50%. For NQ at 20 days that gave 0.586, below NQ's own base rate
of 0.653, which is meaningless. **That table is withdrawn.**

The MDE is now the excess over B0 that a cell must show, where B0 is the point-in-time expanding P(up). It is measured
from placebo date sets drawn on the real data, so overlap, autocorrelation and drift in the baseline are all carried.

What a direction cell must show at 80% power, single test. The historical K assumes the cell is active on 10% of
non-overlapping periods:

| | 1 day | 5 days | 20 days | 60 days |
|---|---|---|---|---|
| **NQ** base P(up) | 0.554 | 0.590 | **0.652** | 0.724 |
| NQ cell must show (K = 482 / 96 / 23 / 7) | ≥ 0.62 or ≤ 0.49 | ≥ 0.74 or ≤ 0.44 | **≥ 0.95 or ≤ 0.36** | not reachable |
| NQ MDE in σ_h | 0.13 | 0.30 | 0.61 | 1.12 |
| **EURUSD** base P(up) | 0.502 | 0.501 | 0.493 | 0.514 |
| EURUSD MDE in σ_h | 0.13 | 0.30 | 0.60 | 1.24 |
| **Gold** base P(up) | 0.531 | 0.556 | 0.559 | 0.606 |
| Gold MDE in σ_h | 0.14 | 0.32 | 0.67 | 1.25 |

ES, GBPUSD and USDJPY are similar: 0.13–0.14 σ at 1 day, 0.61–0.64 at 20 days, 1.23–1.37 at 60 (`tables.md`).

**Dependence.** For spaced events, the placebo spread equals the analytic `√(p0(1−p0)/K)` to within 2–4%, after
correcting for the finite history (A1 fix 4). Regime
cells are where dependence bites. A cell covering 10% of days in runs of at least 20 has:

| Horizon | Days in the cell | Independent observations | MDE |
|---|---|---|---|
| 1 day | 458 | ~550 | 0.12 σ (6 pp) |
| 20 days | 458 | ~52 | 0.46 σ (21 pp) |

Counting overlapping days as independent would understate the 20-day MDE about 3×.

**Non-stationarity.** The expanding B0 is biased whenever the base rate moves. Its average error in the last
pre-lockbox year:
- NQ 20d −7.8 pp; EURUSD 60d −15.5 pp; USDJPY 60d +35 pp;
- across 2006–26, EURUSD 60d −11 pp.

These biases enter the MDE through the placebo mean: +4.7 pp for NQ at 60 days and +7.0 pp for ES at 60 days.

**Multiplicity.** At K = 100, the MDE rises from about 14–17 pp (single test) to about 18–21 pp (a family of 10) and
about 22–25 pp (the whole ledger of 217). Every cell in `tables.md` gives all three.

**Pooling (corrected in A1).**
- The 6 main instruments carry **≈ 3.5** independent forecasts.
- The 7 USD pairs carry **≈ 2.8**, not the 8–9 the first run claimed: pairs quoted both ways cancelled their
  correlations.
- Pooled MDE ≈ single / √m_eff. It assumes the signal is no more correlated across instruments than the returns are.
  For one macro signal applied to every market, pooling gains less.

**Always-on signals.**
- A signal that changes daily needs an IC of about 0.04 at 1 day and 0.06–0.07 at 20 days.
- A persistent signal, like a regime or macro state with a half-life of about one horizon, needs 0.15–0.18 at 20 days
  and 0.26–0.30 at 60. The 20 years of history hold only about 250–350 effective observations.
- Reaching the plausible IC of 0.10 at 20 days with a persistent signal would take about 40–80 years of data.

## 2. Statistics, economics and plausibility, kept apart

These are three different numbers.

**1. Statistics.** The MDE above.

**2. Economics.** Break-even on futures is tiny: NQ 0.0026%, ES 0.008%, GC 0.005%, 6E 0.012%, 6B 0.021% and 6J 0.022% of
price per round trip. The binding economics are the **drift on the short side**:

| Call | Break-even move (σ_h) | Break-even P(up) shift |
|---|---|---|
| NQ 20-day short | −0.24 | −13 pp |
| NQ 60-day short | −0.42 | −23 pp |
| NQ long, futures | the baseline already pays (negative excess needed) | — |
| EURUSD, any side (no drift) | +0.03 to +0.11 | +2 to +6 pp |

On CFDs the 20-day financing makes the NQ short need −0.35 σ. A 20-day CFD round trip costs 0.54% on NQ and 0.47% on
gold; on EURUSD it is 0.08%, but that uses an assumed 1%/yr financing markup.

**3. Plausibility.** Fixed in the prereg at 0.25 σ for sparse cells and IC 0.05 / 0.10 for always-on signals.

**Labels** (sparse design, both venues):
- **1-day cells are (a):** meaningful and detectable in history, for every instrument.
- **5-, 20- and 60-day cells are (b):** meaningful, but detectable only pooled or forward.
  - Pooled MDE at 20 days is 0.33–0.39 σ, still above the plausible 0.25 σ: pooling over about 3 instruments is not
    enough at 20 days.
  - Forward years needed for a 0.25 σ effect from a 10%-coverage single-market cell: about 27–30 at 5 days, about
    110–130 at 20 days and about 335–500 at 60 days.
- **No cell is (c)** under the prereg rule, because futures costs are below every plausible effect. The short side of
  NQ and ES at 20–60 days comes close: 0.24 σ at 20 days and 0.42 σ at 60 days (0.33–0.62 σ on CFD) against the 0.25 σ
  bar.

**In plain terms:** a single-market, slow-horizon direction call cannot be confirmed or refuted from our history. It
can only be built from:
- sparse events with large effects;
- pooled designs (cross-sections, many events);
- the forward ledger.

**The Phase 1 gate.** For a persistent signal across the 8-currency cross-section (247 months), the MDE of the mean
monthly rank IC is **0.060** single, 0.079 for a family of 10, and 0.097 at the ledger level. That is inside the
published FX-premia range of 0.05–0.10. **Phase 1 is detectable at single-test level, marginal after multiplicity.**
The owner reviews before it starts.

## 3. B2 momentum and B3 carry as probability forecasts

Neither beats climatology as a P(up) forecast.
- **Brier skill vs B0 is negative in 23 of 24 cells for momentum.** The CI excludes zero on the negative side for
  EURUSD 1/5/20d and NQ 60d.
- **Carry is negative in 10 of 12.** It is significantly negative on GBPUSD 20/60d and EURUSD 1d.
- USDJPY 1–5 days is the only positive, and it is not significant.

The conditional climatology adds noise: about one bit of state, re-estimated on fewer observations. This does not say
that momentum or carry *books* lose money. Carry's long-short book earned before 2015 (see S6). It says they are not
better *probability* forecasts of one market's sign than its own base rate. CONTEXT.

## 4. Scoreboard: the existing direction cells against B0

Evidence classes:
- **H-D:** discovered on, or peeked at, this sample.
- **H-R:** registered before scoring, but on history that already existed.
- **F:** genuinely forward, between registration and 2026-08-21.

| Cell | Class | n | Excess over B0 [95% CI] | Excess hit | p | × family | × ledger 241 | Reading |
|---|---|---|---|---|---|---|---|---|
| Post-FOMC USD drift, all | H-D | 76 | +41bp [+22, +62] | +21 pp | 0.0005 | 0.007 | 0.12 | holds vs B0 |
| – 2016–21 | H-D | 42 | +55bp | +29 pp | <0.001 | | | holds |
| – 2022+ (the "OOS" half, already seen) | H-D | 34 | +24bp [−12, +59] | +11 pp | 0.18 | 1 | 1 | **weakened** |
| Positioning into release (D) | H-R | 2,029 | +0.042 ATR [+0.004, +0.080] | +2 pp | 0.029 | 0.058 | 1 | holds vs B0 (reproduced its own +0.064 matched effect exactly) |
| COT state D, holdout markets | H-R | 362 | +0.163 [+0.056, +0.269] | +13 pp | 0.005 | 0.10 | 1 | holds vs B0 |
| COT state D, discovery markets | H-D | 142 | +0.069 [−0.10, +0.24] | 0 pp | 0.45 | 1 | 1 | weakened |
| VIX-beta change, all | H-R | 383 | +47bp [+9, +87] | +7 pp | 0.039 | 0.62 | 1 | holds; **discover and test splits weakened** |
| VVIX/VXN derivative, all | H-R | 376 | +124bp [+26, +214] | +9 pp | 0.007 | 0.34 | 1 | holds; **discover and test splits weakened** |
| Carry 1979–2014 | H-D | 430 months | +0.42%/month [+0.16, +0.65] | +12 pp | 0.001 | 0.003 | 0.24 | holds |
| Carry 2015–2026 | seen | 139 months | +0.13% [−0.17, +0.42] | +8 pp | 0.39 | 1 | 1 | weakened |
| **Overnight hold NQ** | H-R | 1,756 | **−0.4bp [−4.4, +3.8]** | −2 pp | 0.83 | 1 | 1 | **not distinguishable from drift** |
| Overnight hold gold | H-R | 1,768 | +3.8bp [+0.7, +6.9] | +2.5 pp | 0.020 | 0.04 | 1 | holds vs B0 |
| Reversal hour | — | — | — | — | — | — | — | **not scored:** no prereg or per-event output, and a reversal rate, not a signed drift |
| **Any cell, forward (F)** | F | **0** | — | — | — | — | — | **no cell has a single genuinely forward event before the lockbox date** |

What this says, as the owner asked:

1. **Historical validation is not out-of-sample evidence here.** Every validated direction cell is H-D or H-R.
   - Post-FOMC was peeked before registration. Its "OOS 2022+" half is weaker (t ~1.3 on 34 events) and was already
     seen.
   - The registered held-out tests (COT holdout markets, positioning) are the strongest *historical* evidence.
   - Genuine forward evidence: zero events. The `vix-signals-forward` record has 0 events so far.
2. **Against drift, most cells still hold over their full sample.** Three got bigger against B0:
   - Post-FOMC: the USD basket's expanding drift was negative (−6.5bp per 5 days), so +29bp becomes +41bp.
   - Positioning and COT D shrink: +0.064 → +0.042 ATR, and +0.27 → +0.16.
3. **Under multiplicity the picture is weaker.**
   - Only post-FOMC (family p 0.007) and pre-2015 carry (0.003) survive their own family correction comfortably.
   - Positioning (0.058) and COT D (0.10) are borderline.
   - The two VIX cells do not survive their families (0.62, 0.34).
   - **No cell survives the whole-ledger level (241 claims).** Post-FOMC is closest at 0.12.
4. **One cell is drift.** Overnight-hold NQ earns exactly NQ's drift per hour held (−0.4bp excess). Its gross return is
   being long, not the overnight session. Gold overnight beats gold's drift by about 4bp per night (family p 0.04).

**Demotions proposed to the owner.** No Evidence Book verdict was edited by this study.

| Cell | Proposed change |
|---|---|
| `vix-beta-change` | validated → **underpowered** (fails its own Holm-16 family once overlap is respected; 2 of 3 splits weakened) |
| `vix-second-derivative` | already fails the 46-family Holm; same proposal |
| `overnight-hold-nq` | add "≈ drift" to the existing underpowered entry |
| post-FOMC drift | keep validated, but the forward record decides; it is the best candidate for the first research forecaster in the ledger |
| positioning, COT D | keep; both need their forward records, which are not yet registered as ledger forecasters |

## 5. Costs: reconciliation (Q3)

- **Gold CFD spread, three sources disagree:**
  - `spread_profile` (live sampler, 22 UTC, Sep–Oct 2026): 1.35bp;
  - `cost_table.json` "oanda_model": 2.25bp (−40%, outside the 10% band);
  - fills-based measure: 0.32bp.

  This is the same disagreement `cost-verification` already found ("gold model overstated"). The profile sits between
  the fill measure and the model, and is used here.
- **NQ CFD:** the `cost_table` model figure (0.68bp) is used directly, so it agrees by construction. Fills cannot
  isolate the NQ spread (the measured round trip is ≤ 0).
- **`js/harness/costs.mjs`** uses the same `spread_profile` at hour 22 for FX and gold, so it agrees by construction.
  For indices it charges the worst measured FX pair instead of the index spread: an open inconsistency, recorded and
  not fixed here.
- **FX CFD financing** is an assumption (1%/yr markup), not a measurement.

## 6. The forward ledger (§L), live from deploy

- **Code:** `js/directionLedger.js` (tests: `js/directionLedger.test.mjs`, 6 pass), the `directionLedger` job in
  `server.js`, and `/api/direction-ledger`.
- **When:** each New York close.
- **What it records:**
  - B0, B1 and B2 for NQ, ES, gold, EURUSD, GBPUSD and USDJPY at 1, 5, 20 and 60 closes;
  - the probability, model id and version, prereg, decision and inputs, as write-once R2 records;
  - the realised outcome and the Brier and log scores once each horizon closes.
- **Summary** (per model × instrument × horizon): skill vs B0 on the same rows, and a CUSUM degradation measure.
- **Baselines** are frozen at the lockbox date (`js/directionLedgerBaselines.json`), so the comparator never refits on
  unseen data.
- **B3 (carry) is not in v0:** no live 3m-rate source matches the historical definition.
- **Research forecasters** register in `RESEARCH_FORECASTERS` with a prereg. None in v0.

## Deviations from the prereg

A1 (post-hoc, results seen), three fixes, each only widening intervals or lowering the pooled gain:
1. Sign-free effective N for pooling (the original is kept as `m_eff_original_A0`).
2. An exact hit-rate plant beside the diluted original. The original hit-rate controls ran at 0.69–0.75, and 3 of 4
   fall outside the band.
3. Month-clustered bootstrap for the overlapping daily scoreboard cells.
4. A finite-population correction to the sparse placebo spread. Before it, the 20-day MDE was understated by about
   25%: 0.47 σ became 0.61 σ.

Other differences from the banked figures:
- **Post-FOMC n is 76, not 81.** Events with `join_ok` and a complete 5-day window before 2026-08-21.
- **Re-run noise.** The bar was re-run after A1. Because the extra control consumes random draws, numbers differ from
  the first run in the third decimal.

## What this changes

1. **Every future direction claim is scored against B0 (and B1) with these MDEs, not against 50%.** The proposal's §0
   table is superseded.
2. **Where direction research can still work:**
   - 1-day sparse conditions, detectable in history;
   - 5-day conditions pooled; 20-day conditions only in wide pools (cross-sections, many-event families) beyond 3
     instruments;
   - otherwise through the forward ledger.

   Single-market 20–60-day direction from history alone is out of reach. That is not "no edge exists": it is "our data
   cannot tell".
3. **Phase 1 (the FX cross-section) is detectable at the single-test level** (MDE IC 0.06). The owner decides.
4. **The research directions the owner wants protected are all still open**, and this map says how each must be
   designed to be judgeable:
   - combinations, conditional effects and event reactions: sparse, large and pooled;
   - cross-asset links: pooled with m_eff ≈ 3;
   - regime-dependent behaviour: regime cells need about 3× more data than their day count suggests.
5. **The forward ledger is the permanent record from deploy.** The next step is to register post-FOMC drift,
   positioning and COT D as research forecasters in it, each with its own prereg.
