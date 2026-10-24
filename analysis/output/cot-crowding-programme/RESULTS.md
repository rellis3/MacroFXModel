# cot-crowding-programme — results

Prereg: `forge/COT_CROWDING_PROGRAMME_PREREG.md` (registered `705e46ea`, 2026-10-24, before any state outcome). Run
2026-10-24, seed 20261024, B = 2000. Branch `ccr-b9c5645b-qc2in4`.

- Phases 2–3 (P1–P10): `phase23.py` → `phase23_results.json`.
- Phase 4 (A1–A4, VA1, VA2): `phase4_*` → `phase4_results.json` / `phase4_RESULTS.md`.
- Phase 1 (measurement map, no outcomes): `phase1_measures.json`.

## What COT crowding means in practice — the short answer

PHASE4_SUMMARY_PLACEHOLDER

## Phase 1 — what the measurements capture (descriptive)

- **One "level" dimension, three others.**
  - Percentile, z-score and raw-contract percentile are one measure (Spearman 0.96–0.99). Net share, the gross
    long/short ratio and the trader-count ratio track it at 0.65–0.96, and commercials mirror it (−0.79). This
    level factor is 52% of the variance.
  - The 4-week flow, the open-interest change and the duration of an extreme are separate dimensions (≈ 3.2
    effective dimensions in all).
- **"Historically extreme" ≠ "one-sided".**
  - Only 42% of 90th/10th-percentile weeks have a gross book of ≥ 3:1.
  - 14% of percentile extremes have the crowd side in the net *minority*: trimmed books, which the study's crowded
    flag excludes.
  - 62% of 3:1-lopsided weeks aren't historically extreme (structurally one-sided markets).
- **Accumulation vs covering.**
  - At extremes, moves toward the crowd side are mostly **new crowd-side positions** (median 68%), not the other
    side covering.
  - Moves away are mostly **the crowd liquidating** (median 80%), not new opposite positions.
- **Extremes are long-lived.** The median run is 3 weeks, but 43% of extreme weeks sit in runs of ≥ 12 weeks.

## Phases 2–3 — scored cells (holdout = 22 markets no COT study here had used)

Each state is compared with non-crowded weeks of the same market, trend-strength tercile, 4-week momentum sign and
vol-regime tercile. Outcomes are signed by the 13-week trend (+ = the trend continued), in units of σ_w·√h.

| Cell | Question | Holdout effect [95% CI] | Episodes | Halves | Discovery | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| P1 | crowded with trend → 12-wk continuation | +0.065 [−0.055, +0.201] | 689 | −0.02 / +0.10 | −0.06 | 1.00 | UNDERPOWERED (CI touches the 0.20 bar) |
| P2 | crowded with trend → P(2σ adverse within 4 wks) | −0.019 [−0.057, +0.010] | 689 | −0.01 / −0.02 | +0.02 | 1.00 | UNDERPOWERED (CI touches −0.05) |
| P3 | crowded with trend → next-20-day vol ratio | +0.039 [+0.010, +0.067] | 689 | +0.06 / +0.05 | +0.06 | 0.062 | UNDERPOWERED: misses Holm, and would be CONTEXT anyway (below the 0.05 bar; the trimmed mirror shows +0.09) |
| P4 | **B** (momentum fading, still building) → P(2σ adverse) | −0.039 [−0.087, +0.018] | 423 | −0.00 / −0.04 | +0.02 | 0.75 | UNDERPOWERED |
| **P5** | **D** (price pulling back, crowd leaving) → 4-wk move | **+0.269 [+0.086, +0.392]** | 253 | +0.18 / +0.21 | +0.07 | **0.006** | **VALIDATED**, *in the opposite direction to the "unwind" reading* |
| P6 | **A** (healthy) → 12-wk continuation | +0.045 [−0.093, +0.184] | 776 | −0.05 / +0.10 | +0.07 | 1.00 | NULL |
| P7 | danger (stall + OI contracting) vs other crowded → P(2σ adverse) | −0.041 [−0.091, +0.010] | 316 | −0.06 / −0.05 | −0.08 | 0.67 | UNDERPOWERED (leans *lower* risk) |
| P8 | macro against vs supporting → 4-wk move (all macro markets) | −0.032 [−0.200, +0.197] | 206 | +0.04 / +0.22 | — | 1.00 | NULL |
| P9 | COT features improve OOS prediction of a 2σ adverse move? | log-loss gain −0.0014 [−0.0025, −0.0005] | — | −/− | — | — | NULL (adding COT made held-out prediction slightly *worse*) |
| P10 | COT features improve OOS prediction of 12-wk continuation? | −0.0017 [−0.0037, +0.0002] | — | −/− | — | 0.59 | NULL |

### P5 in detail: the "active unwind" state is a reset, not a reversal

State D is a crowded trend whose price fell back over the last 4 weeks while the crowd reduced its position. Against
pullbacks of the same depth, trend strength and vol regime in **non-crowded** markets, the trend resumed more and the
pullback hurt less:

| D vs matched control (holdout) | Effect [95% CI] |
|---|---|
| 4-wk move with trend (scored) | **+0.27 [+0.09, +0.40]** |
| 12-wk move | +0.23 [+0.04, +0.38] |
| 4-wk max adverse excursion | −0.14 [−0.24, −0.02] |
| 4-wk max favourable excursion | +0.12 [+0.00, +0.19] |
| P(2σ adverse within 4 wks) | **−8.5pp [−14.6, −1.7]** (21.5% vs ~30%) |
| reversal (weekly close 2σ against) within 12 wks | 35% vs 45% for controls |

**Post-hoc robustness** (describes, cannot promote):
- matching on pullback depth as well: +0.26 [+0.05, +0.41]. D pullbacks aren't deeper (0.47σ vs 0.46σ);
- controls restricted to weeks where non-crowded positioning *also* fell: +0.22 [+0.03, +0.39];
- leave-one-market-out: +0.23 to +0.31; 16 of 22 markets positive;
- by 3-year block it's uneven: one block is negative (2019–21), and two are about zero.

**Caveats:**
- The discovery markets show the same sign but much weaker (+0.07).
- |t| ≈ 3.4 on the holdout clears the promotion bar on paper. But D is rare (381 holdout weeks in 19 years across
  22 markets), so any use needs a forward record.

### Descriptive (BH q = 0.10 over 62 cells: 1 survivor, state D's r4 itself)

- **Volatility:** A and B carry slightly higher next-month vol (+0.05, +0.06; CIs exclude 0). C and D don't. The
  trimmed mirror shows +0.09, so the vol uplift isn't specific to crowding.
- **Long-held** (≥ 2/3 of the prior 26 weeks stretched) and **one-sided** (≥ 3:1) extremes: *fewer* 2σ adverse
  moves (−0.05, −0.04), and 12-wk continuation +0.15 to +0.17 (CIs touch 0). Long-held or lopsided crowding was
  not more fragile.
- **Crowded against the trend:** 12-wk continuation of the trend +0.22 [+0.00, +0.50]. When the crowd fights the
  trend, the trend tended to win.
- **Time to reversal (holdout):** within 12 weeks, A 42%, B 42%, C 43%, D 35%, controls 45%.

## Family 3 — the whole positioning spectrum, both extremes (amendment A1, registered `d34e6952` before it ran)

Positioning in trend terms, 0 = specs maximally positioned **against** the trend and 100 = maximally **with** it.
Every bin is compared with neutral weeks (30–70) matched on market × trend strength × 4-week momentum × vol regime.
Holdout effects [95% CI], with the discovery estimate in parentheses:

| Bin | n (holdout) / episodes | 4-wk move | 12-wk move | P(2σ adverse, 4 wks) | next-month vol ratio |
|---|---|---|---|---|---|
| **S0 opposite extreme** (crowded against the trend) | 1,061 / 356 | +0.11 [−0.04, +0.28] (+0.01) | +0.22 [+0.01, +0.49] (−0.07) | +0.000 [−0.04, +0.04] (−0.00) | −0.004 [−0.05, +0.06] (−0.02) |
| S1 leaning against | 2,510 / 902 | +0.04 [−0.04, +0.10] | +0.03 [−0.06, +0.10] | −0.005 | −0.014 |
| S2 neutral (reference) | 6,808 | 0 | 0 | 0 | 0 |
| S3 leaning with | 4,876 / 1,344 | +0.03 [−0.04, +0.11] | −0.01 [−0.11, +0.09] | +0.000 | **+0.034 [+0.01, +0.05]** (+0.02) |
| **S4 crowded with the trend** | 4,362 / 689 | +0.06 [−0.02, +0.15] | +0.07 [−0.06, +0.20] | −0.019 [−0.06, +0.01] | **+0.039 [+0.01, +0.07]** (+0.06) |

| Scored cell (Holm over 6) | Holdout | Discovery | Halves | Verdict |
|---|---|---|---|---|
| S0-r12: opposite extreme → trend continues? | +0.22 [+0.01, +0.49] | −0.07 | −0.06 / +0.42 | UNDERPOWERED (not confirmed: discovery and the halves disagree) |
| S0-adv: opposite extreme → more 2σ adverse moves? | +0.000 [−0.040, +0.040] | −0.004 | +0.04 / −0.02 | **NULL** |
| SLOPE-r12: S4 − S0 | −0.16 [−0.46, +0.09] | +0.01 | +0.04 / −0.32 | UNDERPOWERED |
| SLOPE-adv: S4 − S0 | −0.02 [−0.07, +0.02] | +0.03 | −0.04 / −0.00 | UNDERPOWERED |
| ASYM-r12: crowded long − crowded short | +0.26 [−0.04, +0.49] | −0.03 | +0.25 / +0.51 | UNDERPOWERED (discovery disagrees) |
| ASYM-adv | −0.02 [−0.08, +0.03] | −0.04 | −0.05 / −0.06 | UNDERPOWERED |

**What the spectrum says:**
- **Direction and adverse risk are flat across the whole range.** From specs crowded against the trend to crowded
  with it, no bin differs from neutral in a way the discovery markets and both halves agree on. The opposite extreme
  is no more a reversal warning than the crowded extreme. Its holdout lean (the trend continued against a crowd
  fighting it) isn't confirmed.
- **Volatility has a shape.** Next-month vol rises as specs lean *with* the trend: S3 +3.4%, S4 +3.9%, both CIs
  above 0, discovery the same sign. Leaning against shows nothing. Within the crowded-with-trend group,
  **high-open-interest** crowding carries the vol: low-OI crowding is 13% calmer [−22%, −6%], the one descriptive
  survivor of BH (1 of 20).
- **Overbought vs oversold:** crowded longs continued more than crowded shorts on the holdout (+0.18 vs −0.08), but
  the discovery markets don't show it (−0.07 vs −0.04). Unconfirmed.
- **Under-positioned strong trends** (strong trend, specs neutral) behaved no differently from well-positioned ones
  (12-wk −0.08 [−0.23, +0.09]).
- **Commercials at their own extremes,** with or against the trend: no measurable difference on any outcome.

## Phase 4 — trading decisions

PHASE4_TABLE_PLACEHOLDER

## Deviations from the prereg

Two code faults were found and fixed before the verdicts were read. Both moved the code onto the frozen definitions,
not away from them:
1. **Outcome horizons.** The first wiring computed outcomes on the filtered sample. Horizons count reports by
   position, so a dropped shutdown week could silently stretch "4 weeks". Outcomes are now computed on the complete
   weekly panel, and segments split at contract gaps (RTY 2008–2017).
2. **Episode counter.** It counted each market's selected rows as one run (22 "episodes" in every cell), which
   tripped the 40-episode gate everywhere. It now counts runs by report date with gaps ≤ 2 merged, as registered
   (689 / 423 / 253 / 776, matching §5).

No threshold, state or bar changed.

## What this changes

PHASE4_CHANGES_PLACEHOLDER
