# calc-upgrades-wide: do gold's validated calc upgrades carry to every instrument on the QLIKE export?

**Pre-registered 2026-11-26, before any non-gold instrument has been scored with the new arms.**

| | |
|---|---|
| ID / ledger id | `calc-upgrades-wide` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `calc-upgrades-wide` |
| Source | **Owner, 2026-11-26:** "Can we do similar for the other assets?" after `gold-calc-upgrades` (10876283) validated, on gold, the pre-open hour (FRESH −6.9%), the implied-vol regressor (−2.8%) and the all-in arm (−8.8%) |
| Sample | Every instrument on the live QLIKE export: 18 futures in `js/ladderV2QlikeParams.json`, 40 CFDs in `js/ladderV2QlikeCfdParams.json`. **GOLD is left out of the pooled tests** (it was the discovery sample) and reported for reference. Test 2020 → 2026-08-21, walk-forward by year |
| Baseline | Each instrument's export calc per line (the `arm` of each line in the params file) |
| Arms | The seven arms of `gold-calc-upgrades`, same definitions and code (`scripts/gold-calc-upgrades/score.py`), plus the noise control. The IV regressor (N6, and the IV term in N7) only where an IV index exists for the whole sample: NQ (VXN), SPX500 (VIX), US30 (VXD), US2000 (RVX), SILVER (VXSLV), WTI (OVX). Elsewhere N7 is the same arm without the IV term. The old V3/V4/B_har_iv arms aren't re-raced |
| Seed | `20261126` |
| Uncertainty | Date-aligned 63-session block bootstrap (the same resampled dates for every instrument), B = 2000, 90% CI |
| Scripts / outputs | `scripts/calc-upgrades-wide/` → `analysis/output/calc-upgrades-wide/` |
| Live impact | **None.** The live QLIKE exports and their params are not touched |

## 1. Hypotheses

Metric: % change in QLIKE on Jordan's lines (HL + Close+ + Close−), arm vs export calc, summed over instruments and
days (pooled ratio), 2020 → 2026-08-21. Negative = better.

- **W1:** N4 FRESH, pooled over the futures (17, gold excluded), < 0.
- **W2:** N7 ALL, pooled over the futures (17), < 0.
- **Replication:** the same two on the 39 CFDs (gold excluded).

**Gates, each of W1 and W2:**
- **VALIDATED** if the 90% CI is below 0, BH q = 0.10 over the two, both halves (2020–22, 2023–26) are negative, and
  the CFD pooled point estimate is negative.
- **NULL** if the lower CI is above −0.5%.
- Otherwise **UNDERPOWERED**.

**Descriptive (no verdicts):**
- per instrument, per arm, both tracks, with BH over instruments within each arm (flags only);
- per asset class: FX majors, FX crosses, indices, metals, energy, rates, grains;
- every line separately;
- the positive control (HARCJ reproduced) and the noise control on every instrument;
- instruments where the positive control fails are dropped and listed.

## 2. Power

On gold, one instrument gave CIs about ±1.7% for FRESH. Pooling 17 futures should narrow that to well under ±1%, so a
pooled effect of 1–2% is detectable.

## 3. What each verdict changes

- **VALIDATED:** the arm becomes the candidate for a shadow export across those instruments (beside the live one,
  forward-scored), instrument by instrument where its own estimate is negative. No live change without the forward
  score and the owner's OK.
- **NULL / UNDERPOWERED:** the shadow stays gold-only.

## Amendments

(none yet)
