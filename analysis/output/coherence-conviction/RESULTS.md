# coherence-conviction — results

Prereg: `forge/COHERENCE_CONVICTION_PREREG.md` (committed in `3ccf06b3`, 2026-11-15; amendments A1, A2 inside it).
Run 2026-11-15, seed 20261115, B = 2000 (scored cells), on branch `claude/signal-bot-bias-analysis-bwr1qv`.
Runner: `scripts/coherence-conviction/run.py`. It imports the R machinery of `scripts/slow-bias-clock/run.py` unchanged.

Data:
- Coherence inputs: SPX500 NY-close bars, VIX close, DGS2 (equal to the first prints on all 2,501 overlap dates) and a
  7-leg USD basket.
- Lean and outcomes: bid/ask M1 for 13 instruments.
- Coverage: 30,571 lean entries on 2,385 dates, 2016-11-21 → 2026-08-21. Nothing after 2026-08-21 was read (asserted).
- Excluded: 1,390 entries where a coherence input was missing on t1 (US holidays). They were counted, not imputed.

## Verdict: `coherence-conviction` UNDERPOWERED (primary hit cells and C2 NULL; C1, C5, C6 UNDERPOWERED)

When equities, VIX, the 2-year yield and the dollar all moved together as one risk factor the day before, the 4h-trend
lean did no better the next day:
- **Hit rate:** 45.9% on coherent days vs 46.0% on incoherent days and 46.2% on all days.
- **R per trade:** −0.030R on coherent days vs −0.031R on incoherent days and −0.029R on all days.

All six cells sit within ±0.006 of zero.
- **The hit-rate cells are NULL**, and powered: a 5-point lift is ruled out (upper bounds +2.2 pp and +1.1 pp).
- **C2 (R on coherent days vs all days) is NULL**: a lift of 0.05R is ruled out.
- **C1, C5 and C6 are UNDERPOWERED** by the stricter power stage (binding MDE 0.08–0.09R against a 0.05R bar). Their
  intervals still sit at about 0 ± 0.04R.

Nothing passes Holm (every adjusted p = 1.0), and no decomposition test survives BH q = 0.10.

## Scored cells

| Cell | Coherent days (dates / entries) | Estimate | 95% CI | Halves | Binding MDE (sim) | Bar | Placebo pct | Holm p | Pack diagnosis | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 ΔR COH − INC | 701 / 8,986 | +0.0014R | [−0.037, +0.040] | +0.006 / −0.004 | 0.082R | 0.05R | 56 | 1.00 | FLAT | **UNDERPOWERED** |
| C2 ΔR COH − all | 701 / 8,986 | −0.0010R | [−0.023, +0.022] | +0.005 / −0.008 | 0.044R | 0.05R | 41 | 1.00 | FLAT | **NULL** |
| C3 Δhit COH − INC | 701 / 8,986 | −0.04 pp | [−2.1, +2.2] pp | −0.07 / −0.01 pp | 4.1 pp | 5 pp | 46 | 1.00 | FLAT | **NULL** |
| C4 Δhit COH − all (lean's own base rate) | 701 / 8,986 | −0.21 pp | [−1.5, +1.1] pp | +0.02 / −0.43 pp | 2.3 pp | 5 pp | 35 | 1.00 | FLAT | **NULL** |
| C5 ΔR (COH ∧ lean agrees with tape) − all | 696 / 6,304 | +0.0009R | [−0.030, +0.035] | +0.005 / −0.004 | 0.084R | 0.05R | 55 | 1.00 | FLAT | **UNDERPOWERED** |
| C6 ΔR tape side − 4h side (COH days; coherence picks the side) | 701 / 8,969 | +0.0054R | [−0.025, +0.036] | −0.007 / +0.018 | 0.089R | 0.05R | 76 | 1.00 | FLAT | **UNDERPOWERED** |

How to read the table:
- R is per entry, spread inside, on the 07:00 → 21:00 London trade with a 1σ stop. A hit means R > 0.
- Half split: 2021-09.
- Mirrors: incoherent days are not significantly better (C1–C4). On C5, the lean opposing the tape: −0.004R
  [−0.057, +0.046]. On C6, the reversed tape side: −0.007R [−0.060, +0.043]. No mirror is significant.
- **Reconciliation:** the 4h lean's R across all its days is −0.0274R. `exit-on-fixed-entries` E0 reported −0.027R and
  `slow-bias-clock` −0.028R.

## Why: the evidence

There is one pack per cell, under `evidence/<cell>/evidence/`. Each pack has EVIDENCE.md, placebo/buckets/breakdown/plants
charts and 30 sample rows.

| Cell | Pack plant found at 0.5× / 1× / 2× bar | Power stage (permuted dates, Holm z) found at 0.5× / 1× / 2× | Canary (clean → leaked) |
|---|---|---|---|
| C1 | 0% / 100% / 100% | 3% / 45% / 100% | +0.001 → +1.39R |
| C2 | 35% / 100% / 100% | 30% / 95% / 100% | −0.001 → +0.75R |
| C3 | 100% / 100% / 100% | 48% / 98% / 100% | −0.000 → +1.00 |
| C4 | 100% / 100% / 100% | 88% / 100% / 100% | −0.002 → +0.54 |
| C5 | 0% / 100% / 100% | 5% / 38% / 100% | +0.001 → +0.75R |
| C6 | 100% / 100% / 100% | 5% / 28% / 95% | +0.005 → +0.66R |

- **The test works.** In the selftest (synthetic data), a planted +0.15R lift on coherent days was recovered as
  +0.145R [+0.129, +0.164], and the zero-effect world produced no VALIDATED cell. Moving every input dated after t1
  left every label, orientation and tape side unchanged. On the real rows, feeding the pipeline the answer makes every
  estimate jump (canary column above). The pack finds a bar-sized plant 100% of the time. So the nulls are
  measurements, not a broken pipeline.
- **Why C1, C5 and C6 are UNDERPOWERED although their packs say FLAT:** the pack's control uses date clusters drawn
  independently, with a 95% bar. The pre-registered power stage uses 21-day blocks and Holm's z of 2.64, which roughly
  doubles the MDE for a difference between two subsets of about 700–900 dates. The prereg binds to the stricter one.
  On the pack's reading, all six cells rule out the bar. On the registered reading, three cells can only rule out about
  0.08R.
- **Pack diagnosis: FLAT on all six.** The interval excludes the bar on the pack's bootstrap and the planted control is
  found. The placebo percentiles are 35–76, which is where noise sits.
- **Where the little variation lives (descriptive; nothing survives BH):**
  - The instruments split by group. FX leans positive on C1 (AUDUSD/EURUSD +0.06, NZDUSD +0.09, USDCAD/USDCHF +0.06;
    group +0.026 [−0.016, +0.067]). The indices lean negative (NAS100 −0.10, SPX500 −0.07, US30 −0.07; group
    −0.083 [−0.155, −0.008], nominal p 0.03, does not survive 19-test BH).
  - A plausible reading, not checked here, is the "don't chase after a strong day" pattern from
    `DAILY_BIAS_REVIEW.md` §2: a 4h trend lean after a clean one-factor index day may be a late continuation bet. It
    is a hint, not a finding.
- **Coherence is not the same as a big day.** Ranking days by the size of the joint move (|m|, top vs bottom tercile)
  gives −0.001R [−0.041, +0.045]. The C1 null is not hiding a "big day" effect either way.
- **No component carries it alone:**
  - The lean agreeing with yesterday's EQ / VOL / USD direction: +0.011R / +0.006R / +0.012R, all CIs span 0.
  - The lean agreeing with yesterday's 2-year yield direction: −0.025R [−0.063, +0.016].
  - Pairs: EQ and the 2-year yield agreeing vs disagreeing gives −0.040R [−0.072, −0.008] (nominal p 0.017). This is
    the only pair interval off zero, and it does not survive BH across 19 tests.
- **Strict unanimity vs a 2–2 split:** −0.029R [−0.083, +0.021] and −1.2 pp hit. The strict definition points the
  wrong way, if anywhere.
- **Linear baseline:** a pooled OLS of R on K gives slope −0.015R per unit of K [−0.067, +0.032]. Adding the tape-agree
  interaction gives +0.006 [−0.022, +0.030]. The quintile ladder of K is flat (R −0.024, −0.020, −0.030, −0.050, −0.020;
  hit 46.5, 46.1, 46.2, 45.3, 46.6%) and not monotone.
- **As a size multiplier (1.5× coherent, 1× mid, 0.5× incoherent):** risk-weighted R −0.0285 vs flat −0.0288, a
  difference of +0.0003R.
- **Direction alone, against each market's own base rate B0:** the lean's 07:00 → 21:00 directional hit minus B0 is
  −0.5 pp on coherent days, −0.7 pp on incoherent days and +0.1 pp on mid days.
- **Sensitivity specs** (registered, not tested) all keep every cell inside ±0.02R and ±0.6 pp, with CIs spanning 0:
  - 20-day z window: C1 −0.018R;
  - 2-year yield lagged a day (strict FRED publication): C1 +0.007R, C2 +0.010R;
  - VIX sign only: C1 +0.003R.
- **Orientation (point in time, 2016 →):**
  - VIX is opposite to equities 100% of the time.
  - The USD is opposite 88% of the time.
  - The 2-year yield is with equities 69% of the time; it flips sign in 2022-style regimes. This is why a fixed sign
    would have mislabelled those days.
  - Coherent (in practice "all four unanimous", A2) covers 29% of dates, incoherent 37%.

## What this changes for the morning card

- **Don't upgrade a call because rates, FX, equities and vol all agreed yesterday.** On about 2,400 mornings, that
  agreement did not raise the 4h lean's hit rate by even 2 points or its R by 0.02R. A 5-point hit lift and a 0.05R
  lift on coherent days vs all days are ruled out.
- `js/globalReadCore.js`'s agreement index stays **description only** (state, not conviction).
- The review's step 5 ("abstain unless the families agree") cannot rest on cross-asset agreement of yesterday's moves.
  Whatever gates a call needs its own evidence.
- **Don't size up 1.5× on coherent days.** The size-multiplier book changes R by +0.0003R.

## Where the null points next

1. **The index "don't chase" hint.** On coherent days the index lean ran −0.08R vs incoherent days. The FX lean ran the
   other way. Both are nominal and fail BH. If pursued, this needs its own prereg on fresh data as a reversal rule:
   after a coherent risk-on/off day, does the index 4h-trend entry underperform?
   - It overlaps with test 10 of `DAILY_BIAS_REVIEW.md` §5 ("don't chase" after strong days). Fold it into that study
     rather than open a new one.
2. **Coherence for range, not direction.** `macro-confluence-range` found confluence came with *narrower* forward
   range (unregistered). A coherent tape may change the size of the day rather than its direction. That is a range
   question for the vol programme, where the desk's validated edge already sits.
3. **A different lean.** The 4h lean is near zero, so there was little edge to amplify. If a lean with a real effect
   appears (e.g. COT state D, post-FOMC days 3–5), re-ask the coherence question on the forward bias-scoreboard record.
   No new historical study is suggested.
4. **Not worth re-opening:** the four-component, daily-change coherence score as a conviction or size multiplier on a
   07:00 → 21:00 trade.

## Deviations from the prereg

- **A1 (pre-results):** the packs use 300 placebo draws, 20 plants and a 400-draw bootstrap, not 500. The scored cells
  keep B = 2000.
- **A2 (post-hoc, crash fix):** the descriptive quintile ladder crashed on tied K = 1 values. The fix ranks K before
  cutting. The full rerun reproduced every scored number exactly. COH turned out to be mostly "unanimous" days (29% of
  dates, not a third).
- **Design power vs run power:**
  - The real date-level SEs were close to the design assumptions (C1 0.020R vs 0.015R; C2 0.012R vs 0.009R).
  - The block power stage is stricter, so three cells (C1, C5, C6) came out UNDERPOWERED, as the prereg's
    "marginal" warnings allowed.
