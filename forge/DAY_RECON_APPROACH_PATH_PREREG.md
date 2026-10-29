# day-recon-approach-path — Does the way price arrives at a forecast level change whether it continues or reverts, beyond what the same path does at placebo lines?

**Pre-registered 2026-10-29, before any outcome was computed for this question.** Milestone 5 of `day-reconstruction`,
approved by the owner on 2026-10-29 with three amendments, all built in here:
1. everything is fixed in advance;
2. the forecast-minus-placebo difference is estimated directly with its own interval;
3. the bootstrap keeps forecast and placebo observations from the same day together.

| | |
|---|---|
| ID / ledger id | `day-recon-approach-path` |
| Register row | `plans/RESEARCH_REGISTER.md` → `day-recon-approach-path` |
| Data | Milestone-2 archive (`analysis/output/day-reconstruction/archive/`: day and touch tables, minute path) and milestone-3 outputs (phantom-ladder touches ×0.70/0.85/1.15/1.30, outcome definitions). Nothing rebuilt, no forecast change, no indicator, no new data. Lockbox (after 2026-08-20) not read |
| Instruments | GOLD, NQ, EURUSD, each assessed separately |
| Families | **Fixed OH/OL** (OH and OL, p50/p75/p90) and **Projected H/L** (ProjH and ProjL, p50/p75/p90), always separate. Close Up/Down left out (priced within hundredths of a percent of OH/OL, milestone 3) |
| Eras | **Primary:** `oos_pit`, 2020-08-21 → 2026-08-20 (point-in-time forecast). **Replication (exploratory):** `insample_prod_params`, 2016 → 2020-08-20 |
| Seed / bootstrap | `20261029`; paired day-cluster Poisson bootstrap, B = 2000 |
| Scripts | stage 1 `scripts/day-reconstruction/m5_features.py` (path measures, terciles; **no outcomes**, run before this prereg was committed); stage 2 `scripts/day-reconstruction/m5_analysis.py` (written after this commit) → `analysis/output/day-reconstruction/m5/` |

## 1. Why this question, and prior evidence

- **What milestone 3 already conditioned on:** time of day, range used, opposite side reached, σ regime, previous
  day, event day and rung (`scripts/day-reconstruction/m3_analysis.py`).
  - Time and range used move the absolute probabilities a lot, equally at placebo lines.
  - None of these conditions moved the direction (11 of 157 conditional cells nominally significant vs ~8 by chance).
- **What it never conditioned on:** the path price took to reach the level, the third condition named in the owner's
  objective.
- **Prior evidence on other lines (not this question):**
  - `MD files/APPROACH_SPEED_CONTROL_TEST.md` (2026-09-12): slow arrivals dwell longer, identically at random prices.
  - The path map's placebo variant: approach speed 0 of 314 cells on the earlier HAR lines.
  - Those used different lines and outcomes. They set the expectation that any path effect will also appear at
    placebo lines, which is why the forecast-vs-placebo difference is the primary test.

## 2. Touches and exclusions

- **Unit:** the first touch of a level on a day, as in the archive (and the milestone-3 phantom touches for the
  placebo sets).
- **Exclusions, fixed in advance** (stage-1 counts for the forecast lines):

| Exclusion | Rule | `oos_pit` | 2016–20 |
|---|---|---|---|
| `next_rung_same_minute` | the next rung (p50→p75, p75→p90) was first touched in the touch minute itself, so the order is unknowable, and the archive's "next" time would then measure a move back *through* that rung | 74 | 48 |
| `ambiguous_order` | the touch minute also first-touched a level on the other side | 0 | 9 |
| `float32_tie` | touch minute depends on float32 rounding (milestone 2 check C) | 0 | 1 |
| `first_minute` | touch in bar 0, so there is no approach | 0 | 1 |

- **Analysed touches (forecast lines):** 12,304 `oos_pit` (7,889 fixed, 4,415 projected) and 8,711 in 2016–20.
- Same rules for placebo touches.

## 3. Path measures (fixed; stage-1 code)

**Previous reference R_prev:**
- p50 → the session open;
- p75 → the same family's p50;
- p90 → the same family's p75.

Priced bar by bar:
- **Static levels:** open × (1 ± pct × factor / 100).
- **Projected levels:** the running opposite extreme through bar j−1 × (1 ± HL pct × factor / 100), the archive's
  own rule. Placebo sets use their scaled ladder.

**Leg start k_last:** the last bar j < k (k = touch bar) where price was at or behind R_prev(j):
- up touch: low ≤ R_prev(j);
- down touch: high ≥ R_prev(j);
- for p50, bar 0 always qualifies (it opens at the open; the archive open is float32-rounded).

**The two measures:**
- **P1, approach time:** (t[k] − t[k_last]) / 60 minutes. Fast arrival vs slow grind.
- **P2, approach pullback:** the largest move against the touch direction during the leg, bars k_last+1 … k−1.
  - The extreme must be printed on an **earlier** bar than the pullback, so no within-bar ordering is assumed.
  - Up touch: max over j of (max high[k_last+1 … j−1] − low[j]); down touch mirrored.
  - 0 if the leg has fewer than 2 bars. Divided by the day's σ scale.
  - Straight approach vs choppy approach.

**Correlation of P1 and P2** (Spearman, forecast lines, `oos_pit`): 0.49–0.59 fixed, 0.78–0.84 projected. They're
related, so they're reported as two measures, not two independent confirmations.

**Medians, forecast lines, `oos_pit`:**

| | P1, fixed | P1, projected | P2, fixed | P2, projected |
|---|---|---|---|---|
| GOLD | 78 min | 48 min | 0.20σ | 0.23σ |
| NQ | 69 min | 50 min | 0.19σ | 0.23σ |
| EURUSD | 82 min | 53 min | 0.20σ | 0.22σ |

## 4. Terciles (frozen in `analysis/output/day-reconstruction/m5/tercile_boundaries.json`)

- **Where the boundaries come from:**
  - one pair of boundaries (the 1/3 and 2/3 quantiles) per instrument × family group × rung × hour bucket × line set
    (forecast, ×0.70, ×0.85, ×1.15, ×1.30);
  - computed from `oos_pit` touches only;
  - **from the path measure only.**
- **Assignment:** bottom ≤ q1/3; top > q2/3; middle otherwise. Ties go to the lower tercile.
- **Same boundaries for the 2016–20 replication.**
- **Why within rung and hour:** "slow" means slow for that rung at that time of day. P1 grows with the clock (a p50
  touch at 15:00 has had more time to arrive than one at 03:00), so global terciles would be mostly a time-of-day
  split.
- **Why each placebo set has its own boundaries:** a ×1.30 line is farther away and takes longer to reach, so a
  shared cut-off would put most ×1.30 touches in the top tercile.

Hour buckets (London, since the 00:00 open): 00–07, 07–12, 12–17, 17–22, as in milestone 3.

## 5. Outcomes (milestone 3's definitions, fixed)

**Primary: `cont_first`.** Price trades through the next level before trading back through the previous one, by
22:00 London.
- **Next:**
  - p50 → the same family's p75; p75 → p90 (the archive's `next_<level>_min`, measured from the minute after the
    touch);
  - p90 → one more rung step beyond the p90 price (step = (p90 − p75 pct) × factor / 100 × level price, milestone 3's
    expansion rule). Timed here as the first minute **after** the touch bar reaching it, to match the other rungs.
- **Previous:** p50 → the open (`next_Open_min`); p75 → p50; p90 → p75.
- **Scoring:**
  - both in the same minute → neither (0);
  - neither by 22:00 → 0;
  - so unresolved touches count as "not continuation-first". The hour fixed effects absorb the time left.

**Secondary:**
- `rev_first` (previous before next);
- `race50_cont` (+0.5σ before −0.5σ from the level price, milestone 3's race);
- `open_revisit`;
- `closeback` (session closes back on the open side of the level);
- `race50_R_cont` / `race50_R_rev`: milestone 3's 1:1 ±0.5σ gross R proxy, entered at the level price, ties
  stop-first. **Used only for the economic hurdle**, not as a strategy.

## 6. Estimation

**Model.** For each instrument × family group × path measure × line set (forecast, and each of the four placebo
factors), a linear probability model fitted by weighted least squares:

```
outcome = rung×hour fixed effects (12) + b1·u + b2·u² + D·[top tercile] + M·[middle tercile]
```

- u = range used before the touch ÷ the **forecast's own** HL p50 for that day. The same control is used for
  forecast and placebo lines, because the path and range used are the same day's.
- **D** = top-minus-bottom tercile difference in percentage points, holding rung, time of day and range used fixed.
- Range used enters continuously, not as milestone 3's buckets. A rung × hour × range-used split would leave cells
  too small to estimate in every placebo set, losing 30–70% of the projected touches. The continuous control keeps
  them.

**Estimands per cell:**
- **D_fc:** the path effect at the forecast's levels.
- **D_pl:** the path effect at placebo lines, curvature-corrected (milestone 3's B2) = −1/6·D(×0.70) + 2/3·D(×0.85)
  + 2/3·D(×1.15) − 1/6·D(×1.30).
- **Δ = D_fc − D_pl:** the forecast-specific part. **Primary.**

**Paired bootstrap (amendment 3):**
- One vector of Poisson(1) weights per trading day per draw, applied to **every** touch on that day: forecast and all
  four placebo sets, every family and rung.
- D_fc, the four placebo Ds, D_pl and Δ are all recomputed from the same draw.
- Δ's interval therefore keeps the same-day link between forecast and placebo.
- 95% percentile intervals; two-sided p = 2 × min(share ≤ 0, share ≥ 0).

**Twelve primary cells:** 3 instruments × 2 family groups × 2 path measures.

**Multiple testing:** Benjamini–Hochberg at q < 0.10, applied separately to:
- the 12 Δ p-values (forecast-specific question);
- the 12 D_fc p-values (is there a path effect at all at the forecast levels).

Secondaries get their own BH within each outcome.

## 7. Power (stage 1, from touch counts only, before outcomes)

Minimum detectable top-minus-bottom effect at 80% power, `oos_pit`:
- **D_fc:** about **6.6–6.8pp** for fixed levels and **8.7–9.2pp** for projected.
- **Δ:** **9.3–9.6pp** fixed and **12.5–13.3pp** projected, as an upper bound that treats forecast and placebo as
  independent. Same-day pairing makes the real interval narrower.

So this test can confirm a large forecast-specific effect, but may be unable to rule out one below about 10pp. That
outcome is reported as **underpowered**, not null.

## 8. Decision rules (fixed now)

Each cell is classified on each question.

**Forecast-specific path information:**

| Class | Conditions |
|---|---|
| **FORECAST-SPECIFIC** | Δ survives BH (q < 0.10) **and** \|Δ\| ≥ 5pp **and** Δ has the same sign in the 2016–20 replication |
| **NULL** | Δ's 95% interval lies entirely inside ±5pp |
| **UNDERPOWERED** | anything else |

**Path effect at the forecast levels:**

| Class | Conditions |
|---|---|
| **PRESENT** | D_fc survives BH **and** \|D_fc\| ≥ 5pp **and** same sign in 2016–20 |
| **NULL** | D_fc's interval lies inside ±5pp |
| **UNDERPOWERED** | anything else |

**Interpretation, fixed:**
- **PRESENT but not FORECAST-SPECIFIC** is a market-wide path effect measured on the forecast's scale. It is
  reported as market behaviour and **never** as information in the forecast levels.
- **Economic hurdle**, the only gate to *proposing* a trading experiment (none is run in this milestone). It applies
  only to a FORECAST-SPECIFIC cell, and needs both:
  - the favoured tercile's gross `race50_R` (on its favoured side) is at least **max(2 × the instrument's median
    spread at ±0.5σ, 0.05R)**. Median spread at ±0.5σ (milestone 3): GOLD 0.04, NQ 0.01, EURUSD 0.07R, so the
    hurdles are 0.08, 0.05 and 0.14R. The 0.05R floor is there because milestone 4 showed that entering at the level
    price overstates real stop-entry fills by about that much;
  - **and** it beats the same quantity at B2 placebo with a paired interval above 0.

  Meeting the hurdle allows one future pre-registered, costed test, with owner approval. Failing it means the
  finding is information only.

**Study verdict for the Evidence Book:**
- **validated** if any cell is FORECAST-SPECIFIC (research finding; trading only via the hurdle above);
- **null** if all 12 Δ are NULL;
- **underpowered** otherwise.

Any PRESENT market-wide path effect gets a separate **context** entry.

## 9. Also reported (descriptive, not used for the verdict)

- **The same estimands on the secondary outcomes,** each with its own BH.
- **Pooled across the three instruments** per family group × measure: stacked, with instrument × rung × hour fixed
  effects, and the bootstrap weights shared by calendar date. More power, but secondary to the per-instrument
  results.
- **Sensitivities:** tagged days only (2025-04-08 onwards untagged); by side (up/down); by rung.
- **By year:** Δ.
- **Tercile counts,** and the share of touches excluded per cell.

## 10. Commit order

This prereg, the register row and stage 1 (code, `features.parquet`, `tercile_boundaries.json`, `stage1_meta.json`)
are committed and pushed **before** `m5_analysis.py` is written or any outcome is joined to the path measures. Any
later change is a dated amendment below, marked PRE- or POST-RESULTS.

## Amendments

(none)

## RESULTS

Run 2026-10-29 → `analysis/output/day-reconstruction/m5/REPORT.md`, `results.json`.

**Forecast-specific path information: UNDERPOWERED.**
- 0 of 12 Δ significant.
- 1 NULL (GOLD Fixed P1: +0.7 [−3.5, +4.8]); 11 underpowered.
- Δ point estimates −2.8 to +5.0pp.
- Pooled across instruments (secondary), Δ is within about ±3–6pp of zero: Fixed +0.6 / +0.1, Projected +0.3 / +1.6pp.

**Path effect at the forecast levels: PRESENT in 5 of 12 cells, all market-wide.** Each is equally present at placebo
lines:
- EURUSD Fixed P1 −11.6 [−16.2, −6.9];
- EURUSD Fixed P2 −6.2;
- EURUSD Projected P1 −9.8;
- NQ Projected P1 −5.6;
- GOLD Projected P2 +7.2.

**Slow arrivals lower revert-first as well** (Fixed −8 to −10pp, Projected −21 to −28pp; open revisits −8 to
−30pp). The path changes how much happens after the touch, not which way.

**Economic hurdle:** not applicable (no forecast-specific cell). No trading experiment follows.
