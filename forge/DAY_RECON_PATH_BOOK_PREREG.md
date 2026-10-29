# Day reconstruction M7: post-touch path book at the forecast levels (pre-registration)

**Status:** FROZEN 2026-10-29 (final; owner-approved decisions U1–U11 and the four follow-up decisions written into the body;
change log in §13). Committed with the features-only stage-1 artefacts before any M7 outcome code existed or any post-touch
outcome was read.
**Register id:** `day-recon-path-book`
**Governing rules:** `forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md`, frozen in `d7ce9e06`. This prereg adopts R0–R9 and
D1–D5 **unchanged**. Where this file restates a rule, the rules file wins. Everything else here is implementation of
those rules, decided before outcomes (decision record in §11).
**Data:** M2 archive (`analysis/output/day-reconstruction/ARCHIVE.md`), M3 phantom ladders, M5 frozen features. GOLD, NQ,
EURUSD only. Nothing after 2026-08-20; the lockbox is not accessed.

## 0. What M7 is, and is not

M7 asks what price does after a first touch of a forecast p50 or p75 level, in which proportions, how far and how fast,
and whether any of that differs from comparable placebo lines. Its three conclusions are kept separate (R0):

| Conclusion | Statistic | Cannot establish |
|---|---|---|
| Behaviour | path-category shares; magnitude, time and adverse-excursion distributions | expectancy, forecast-specificity |
| Forecast-specificity | Δ share or Δ_EV, forecast minus B2 placebo | that the behaviour pays |
| Expectancy | per-touch reference-race EV in R, against the cost hurdle | forecast-specificity (needs Δ_EV); an executable strategy |

- **EV is a behavioural reference-race statistic, not an estimate of strategy returns.** Exits are valued at the rung price
  exactly, on mid prices, with no fills, slippage, sizing or account costs. A reference reached in a gap bar is valued at
  the reference price by convention: a measurement convention, not evidence of an executable fill.
- **The cost hurdle is a materiality threshold** for that statistic, not a model of trading costs or profitability.
- **No M7 result validates a strategy.** At most it triggers a request to plan M8 (behavioural forward validation), which
  needs separate owner approval. Trading validation is a further, separate stage, open only to an M8-confirmed T2 cell
  (R8).
- **M6 alters no trigger.** M6 found next-rung reach at fixed forecast levels equal to placebo within about ±1.3–2.2pp.
  Reach is categories 1 + 2 + 3 together; M7 tests whether the split between paths differs, without assuming it does.

## 1. Prior art (stated as hypotheses)

| # | Finding | Source |
|---|---|---|
| P1 | Race to ±0.5σ after a touch is about 40/40 at every level, family and rung; 1 of 378 cells survives BH and flips sign in 2016–20 | `analysis/output/day-reconstruction/m3/REPORT.md` |
| P2 | NQ continuation +0.03–0.07R gross but equal at phantom lines; costed execution null | `m3/REPORT.md`, `m4/REPORT.md` |
| P3 | Approach path: 0 of 12 forecast-specific (underpowered); market-wide effects change how much happens, not which way | `m5/REPORT.md` |
| P4 | Next-rung reach equals placebo on fixed levels (±1.3–2.2pp); projected GOLD/NQ inconclusive | `m6/REPORT.md` |
| P5 | EURUSD export lines: pullback before continuing median 0.15σ; overshoot before fading median 0.14σ | `analysis/output/rangebook/eurusd_TOUCH_RESULTS.md` |
| P6 | Continued vs faded touches: AUC 0.578 = geometry alone; every decile loses after costs | `analysis/output/rangebook/FINGERPRINT_RESULTS.md` |
| P7 | Path Map 0 of 314 cells; Live Range "PATH-NEUTRAL" (7 of 255) | `forge/PATH_MAP_SPEC.md`; `analysis/output/live_range_history/RESULTS.md` |

Prediction (not a finding): category shares and EV will look like placebo lines. Any positive T2 EV is more likely
market-wide (recorded, not triggering, D4) than forecast-specific.

## 2. Unit, eligibility, references and price arithmetic (R1)

- **Unit:** first touches of p50 and p75 at Fixed OH/OL and Projected H/L, per instrument; sides pooled within family,
  with s orienting each touch. p90 excluded.
- **Eras:** point-in-time 2020-08-21 → 2026-08-20 (primary; Y1–Y6 start each 21 August); 2016–20 as the sign check only.
- **Exclusions, in order, each counted:**
  1. M5's set: first minute, `float32_tie`, `ambiguous_order`, next rung in the touch minute, no reference bar;
  2. a ≤ 0 or b ≤ 0 (R1-x).

  **Share-eligible** = after these. **EV-eligible** = share-eligible with a ≥ 0.10σ and b ≥ 0.10σ (D1, expectancy only).
- **References:**
  - E = close of bar k.
  - N and P are frozen at bar k. Fixed N = open × (1 ± pct_next). Projected N = the running opposite extreme through bar
    k−1 × (1 ± hl_next), which is the archive's level rule.
  - P = the open for p50, and the same family's p50 rung for p75. O = the open.
  - Placebo ladders use the same rule with every percentage multiplied by the factor.
  - z(x) = s·(x − E) ÷ scale, scale = open × σ_used; a = z(N); b = −z(P).
- **Price arithmetic (U8), one convention for every event calculation, forecast and placebo alike:**
  - every path price (open, high, low, close) is the float32 value the archive's loader produces: the parquet value cast
    to float32, then held as float64;
  - rung prices are computed in float64 from the archive's open;
  - every comparison is float64 on those values.

  This reproduces the archive's JavaScript arithmetic exactly (doubles holding float32-loaded prices). No event
  calculation mixes this with uncast prices. The uncast comparison is computed once only as the tie-mismatch diagnostic
  in §6.
- **Reached:** the first bar j ≥ k+1 with high ≥ N (s = +1) or low ≤ N (s = −1); likewise P and O in the fade direction.
  This is the archive's comparison.
- **Ordering (R2), bar level only:** j_N < j_P → N first; j_P < j_N → P first; j_N = j_P → U; neither by the last bar →
  unresolved. A bar that opens beyond a reference reaches it at that bar. The bar's open is never used to order events
  inside a bar.
- **Horizon:** the session's last bar; close_end = its close.

**Stage-1 counts, point-in-time forecast touches:**

| | GOLD fixed p50 / p75 | GOLD proj p50 / p75 | NQ fixed | NQ proj | EURUSD fixed | EURUSD proj |
|---|---|---|---|---|---|---|
| Share-eligible | 1,568 / 783 | 839 / 429 | 1,547 / 797 | 883 / 415 | 1,504 / 759 | 778 / 387 |
| Excluded: a ≤ 0 or b ≤ 0 | 2 / 4 | 67 / 1 | 1 / 0 | 85 / 0 | 1 / 1 | 61 / 1 |
| Excluded: M5 set | 8 / 5 | 6 / 0 | 11 / 2 | 4 / 1 | 20 / 6 | 10 / 1 |
| Not EV-eligible (D1) | 0 / 3 | 20 / 1 | 1 / 1 | 12 / 1 | 1 / 3 | 11 / 1 |

- **Structural note:** projected p50 loses 61–85 touches per instrument (7–10%) to b ≤ 0. On those days the projected p50
  line lies beyond the open, so the touch-bar close is already behind P. This follows from the frozen R1-x rule and is
  reported, not adjusted.
- Median race distances (EV-eligible): a ≈ 0.44–0.63σ, b ≈ 0.44–0.62σ, except projected p50 where b (to the open) ≈
  1.04–1.11σ.
- Untagged days are 21% of point-in-time share-eligible forecast touches.
- 2016–20 EV-eligible forecast touches: fixed p50 1,106–1,130; fixed p75 546–549; projected p50 550–575; projected p75
  275–296.

## 3. Outcomes

### 3.1 Path categories (R2)

| Category | Definition |
|---|---|
| 1. Direct continuation | N first; min z before N > −0.25σ |
| 2. Pullback then continuation | N first; min z before N ≤ −0.25σ |
| 3. Reversal then recovery | P first; N reached later, by the last bar |
| 4a. Failed, held above the open | P first; N not reached; O not reached (p75 only) |
| 4b. Failed, deep reversal | P first; N not reached; O reached (every p50 failure) |
| 5a. Stalled | neither; max z < 0.25σ and min z > −0.25σ |
| 5b. Unresolved with movement | neither; otherwise |
| U. Unordered | N and P first reached in the same bar |

- **U is not a path category.** Category shares use as denominator the share-eligible touches minus U (U2). Every cell
  reports n share-eligible, n U and the denominator explicitly.
- **"Before an event"** uses E and bars k+1 … j_event − 1; the decisive bar's other extreme is not used. min z uses lows
  when s = +1 and highs when s = −1; max z the reverse.
- **Assertion:** every share-eligible touch gets exactly one label (1–5b or U), and the labels sum to the share-eligible
  count. Failure stops the run before any statistic.
- **Distributions reported within each category**, as 25th, 50th, 75th and 90th percentiles with intervals, forecast and
  B2 placebo:
  - further travel = max z over bars k+1 … last;
  - retrace depth = −min z before the decisive event (categories 1–4b);
  - time from bar k to N, P and O, in minutes (archive convention);
  - maximum adverse excursion, defined below.

**Maximum adverse excursion (U6)** is descriptive only. It never affects eligibility, categories, payoffs or any
classification, and it introduces no alternative valuation. Defined per touch and per race:

| | Continuation race | Fade race |
|---|---|---|
| Reference | E | E |
| Adverse direction | against continuation (toward P) | against the fade (toward N) |
| Value in σ | MAE_C = max(0, −min z) | MAE_F = max(0, max z) |
| In R | MAE_C ÷ b_i | MAE_F ÷ a_i |
| Window | E and bars k+1 … j_end | same window |

The window end j_end is the same for both races:
- **resolved (N first or P first):** j_end = j_first − 1, the bar before the decisive bar;
- **U:** j_end = j_U − 1, the bar before the shared bar;
- **unresolved:** j_end = the last bar.

If the decisive bar is k+1, the window is E alone and both MAEs are 0. Because the window stops before the decisive bar,
MAE_C < b_i and MAE_F < a_i always. Both MAEs are reported for every share-eligible touch, by category and by race
outcome (win, loss, U, unresolved).

**Maximum favourable excursion** (descriptive only, same status as MAE): per race, from E over the same window as MAE.
- Continuation: MFE_C = max(0, max z), in σ and ÷ b_i in R.
- Fade: MFE_F = max(0, −min z), in σ and ÷ a_i in R.

Because the window ends before the decisive bar, MFE_C < a_i and MFE_F < b_i. "Further travel" (max z over the whole
session) is reported separately.

### 3.2 Reference-race EV (R3)

| Outcome for touch i | Fade (R_i = a_i) | Continuation (R_i = b_i) |
|---|---|---|
| P first | +b_i / a_i | −1 |
| N first | −1 | +a_i / b_i |
| U | −1 | −1 |
| Unresolved | −z(close_end) / a_i | +z(close_end) / b_i |

- **Cell EV** = mean of payoff_i over EV-eligible touches, unresolved included. The per-touch mean is the only definition.
- **Decomposition** for every cell, forecast and placebo, each with an interval:
  - unresolved share;
  - resolved contribution = (resolved and U payoffs) ÷ n;
  - unresolved contribution = (unresolved payoffs) ÷ n;
  - the two contributions sum to EV;
  - mean unresolved payoff.
- **D2 sensitivity (U9):** EV with U touches removed from both numerator and denominator, reported beside the primary EV
  for every cell. **The primary rule is unchanged: U = −1R in both races.** The sensitivity changes no classification.
- **Break-even column (descriptive):** mean a_i/(a_i+b_i) for the fade, mean b_i/(a_i+b_i) for continuation.
- **Cost hurdle (R3), a materiality bar only:**
  - c = 0.020σ GOLD, 0.005σ NQ, 0.035σ EURUSD;
  - h_i = max(2c ÷ R_i, 0.05) in R;
  - H = mean h_i over the cell's EV-eligible touches in that race;
  - T2 condition 2 is EV_fc ≥ H, equivalently mean(payoff_i − h_i) ≥ 0;
  - H applies to forecast EV only.

### 3.3 Placebo (R3)

- Phantom ladders at ×0.70, ×0.85, ×1.15 and ×1.30 (M3), on the same days and path. Each has its own first touches, k, E,
  N, P, a and b, the M5 exclusions, R1-x, D1, and its own condition levels (§5).
- Each share and EV is computed per factor f; placebo = Σ_f w_f × statistic(f), with w = (−1/6, 2/3, 2/3, −1/6).
- Δ share = share_fc − share_pl; Δ_EV = EV_fc − EV_pl.
- **Small placebo samples (U10):** no eligibility threshold is added, and no factor is dropped or reweighted. Every cell
  reports n per factor. Any cell where a placebo factor has fewer than 150 eligible touches is flagged "small placebo
  sample, limits interpretation".
  - The flag is a reporting warning only. It changes no eligibility, cell inclusion, weighting, BH family, trigger or
    classification.
  - Reaching 150 touches does not by itself establish adequate statistical power.

## 4. Statistical procedure (R4, R5)

- **Bootstrap:** B = 2000, seed 20261030, one Poisson(1) weight per calendar date, shared by forecast and every phantom
  touch on that date, across all cells.
  - 95% percentile intervals.
  - Two-sided p = 2 × min(share ≤ 0, share ≥ 0), floor 1/B.
- **Untagged-day sensitivity:** every statistic is recomputed with untagged days removed, H included. A trigger that fails
  without them is flagged "depends on untagged days".
- **Period estimates:** Y1–Y3 and Y4–Y6 (point-in-time) and 2016–20, for every T1 and T2 statistic.
- **Period sign stability (U4):** each period's point estimate has the same sign as the pooled point estimate. A zero
  estimate fails. There is no tolerance.

**T1: forecast-specific behaviour.**
- **Cells:** instrument × family × rung × category, all touches.
- **Statistic:** Δ share, on the U2 denominator.
- **Family:** one BH family at q < 0.10 over all 78 T1 cells.
- **Triggers if** BH-significant, |Δ| ≥ 5pp, and period-sign-stable in Y1–Y3, Y4–Y6 and 2016–20.
- **Supports:** behaviour and forecast-specificity only. Its EV is reported, not claimed.

**T2: forecast-specific expectancy.**
- **Cells:** instrument × family × rung × race × condition level (§5).
- **Family:** cells with ≥ 150 EV-eligible forecast touches (counted at stage 1) form one BH family at q < 0.10, on the p
  of EV_fc. Smaller cells are descriptive.
- **Triggers only if all four hold:**
  1. EV_fc > 0 and BH-significant;
  2. EV_fc ≥ H;
  3. Δ_EV's 95% interval excludes 0 and Δ_EV ≥ 0.05R;
  4. EV_fc and Δ_EV are each period-sign-stable in Y1–Y3, Y4–Y6 and 2016–20.

**Market-wide context (D4, U3).** A T2 cell is labelled **"market-wide context, not forecast-specific"** when it doesn't
trigger, conditions 1 and 2 hold, condition 3 fails, and **forecast EV** (not Δ_EV) is period-sign-stable.
- The label describes positive reference-race EV that appears equally at placebo lines. It is ordinary market behaviour
  measured on the forecast's scale, not information in the forecast levels.
- It **never triggers M8** and never supports a "fade worth considering" or "continuation more likely" label (R6).
- It is reported separately from both forecast-specific expectancy and triggers.

## 5. Cell inventory (stage 1, features only, reproducible)

**Stage 1:** `scripts/day-reconstruction/m7_features.py` (sha256 prefix `f98d123fb9e8eb02`).
- **Reads only:**
  - archive touch rows restricted by parquet column projection to pre-touch and at-touch fields (`level_price`, k, t,
    `run_hi_before`, `run_lo_before`, `hl_before_pct`, open, scale, era, tag);
  - the same columns from M3's phantom table;
  - M5's frozen exclusions and P1/P2 terciles;
  - the archive day rows' rung percentages;
  - the **close of bar k only** from the path.
- **Never loaded:** no `next_*`, `cont_*`, `rev_*`, return or later-bar column.
- **Reproducibility:** re-running it into a fresh folder gave byte-identical outputs:

| File | sha256 prefix |
|---|---|
| `features.parquet` | `165579061993f74c` |
| `cell_inventory.csv` | `ea983b6a0401fba9` |
| `range_used_terciles.json` | `53945c6314d67282` |
| `stage1_meta.json` | `0bca27a7b3e4a67e` |

**Time windows (U11)**, on the touch bar's London clock time (the bar's open time), exactly the M6 Part C boundaries:
[00:00, 08:00), [08:00, 13:30), [13:30, 17:00), [17:00, session end]. Used unchanged throughout.

**Range-used terciles (U1)**, fixed levels only. u = range before the touch ÷ that day's forecast HL p50, the same u for
every line set. Boundaries are per instrument × rung × line set, from point-in-time EV-eligible touches of that line set.
bottom = u ≤ t1, middle = t1 < u ≤ t2, top = u > t2.

**2016–20:** these frozen 2020–26 boundaries are applied unchanged to 2016–20 touches, as M5 did for P1/P2. This makes the
2016–20 estimate a historical sign-stability check using fixed later-era boundaries, not an independently calibrated
2016–20 model. No boundary is recomputed from the earlier period.

| Instrument | Rung | ×0.70 | ×0.85 | ×1.0 (forecast) | ×1.15 | ×1.30 |
|---|---|---|---|---|---|---|
| GOLD | p50 | 0.3560 / 0.4989 | 0.4219 / 0.5645 | 0.4838 / 0.6156 | 0.5437 / 0.6716 | 0.6096 / 0.7428 |
| GOLD | p75 | 0.5923 / 0.7260 | 0.7008 / 0.8333 | 0.8018 / 0.9371 | 0.9254 / 1.0572 | 1.0344 / 1.1671 |
| NQ | p50 | 0.3620 / 0.5120 | 0.4281 / 0.5745 | 0.4967 / 0.6420 | 0.5602 / 0.7078 | 0.6229 / 0.7666 |
| NQ | p75 | 0.6088 / 0.7572 | 0.7181 / 0.8670 | 0.8316 / 0.9726 | 0.9482 / 1.0812 | 1.0600 / 1.1926 |
| EURUSD | p50 | 0.3651 / 0.4987 | 0.4346 / 0.5655 | 0.4973 / 0.6298 | 0.5576 / 0.6917 | 0.6222 / 0.7575 |
| EURUSD | p75 | 0.5981 / 0.7329 | 0.7123 / 0.8465 | 0.8249 / 0.9501 | 0.9322 / 1.0645 | 1.0444 / 1.1727 |

M5's P1/P2 terciles are used exactly as frozen in `m5/tercile_boundaries.json`: per instrument × family × rung × hour
bucket × line set, with the cell pooling hour buckets.

**T1:** 3 instruments × 2 families × (6 categories at p50 [1, 2, 3, 4b, 5a, 5b] + 7 at p75 [adds 4a]) = **78 cells**,
one BH family.

**T2:** per instrument × family × rung, the condition levels are: all; 4 time windows; range-used terciles (fixed only);
M5 P1 terciles; M5 P2 terciles. That is 14 levels for fixed and 11 for projected, so **150 cells × 2 races = 300 tests**.
**110 cells (220 tests) have ≥ 150 EV-eligible forecast touches** and form the BH family; 40 cells are descriptive.

| Instrument × family × rung | Cells | In family | Descriptive (forecast EV-eligible n) |
|---|---|---|---|
| GOLD fixed p50 | 14 | 13 | 17:00–22:00 (105) |
| GOLD fixed p75 | 14 | 12 | 00:00–08:00 (123), 17:00–22:00 (91) |
| GOLD projected p50 | 11 | 9 | 00:00–08:00 (66), 17:00–22:00 (121) |
| GOLD projected p75 | 11 | 2 | 00:00–08:00 (26), 08:00–13:30 (60), 17:00–22:00 (83); P1 and P2 terciles (141–146) |
| NQ fixed p50 | 14 | 14 | — |
| NQ fixed p75 | 14 | 12 | 00:00–08:00 (35), 08:00–13:30 (93) |
| NQ projected p50 | 11 | 9 | 00:00–08:00 (22), 08:00–13:30 (65) |
| NQ projected p75 | 11 | 3 | 00:00–08:00 (9), 08:00–13:30 (22); P1 and P2 terciles (131–148) |
| EURUSD fixed p50 | 14 | 13 | 17:00–22:00 (94) |
| EURUSD fixed p75 | 14 | 12 | 00:00–08:00 (49), 17:00–22:00 (107) |
| EURUSD projected p50 | 11 | 9 | 00:00–08:00 (25), 17:00–22:00 (139) |
| EURUSD projected p75 | 11 | 2 | 00:00–08:00 (11), 08:00–13:30 (74), 17:00–22:00 (101); P1 and P2 terciles (125–132) |

- "All" cells, EV-eligible forecast touches: fixed p50 1,503–1,568; fixed p75 756–796; projected p50 767–871; projected
  p75 386–428.
- Every count, forecast and each phantom factor, is in `m7/cell_inventory.csv`. The smallest phantom n in an in-family
  cell is 57, at ×1.30.

## 6. Build-time checks (each stops the run before any share or EV is computed, and is reported)

1. **Stage-1 reproduction:** the build's eligible counts equal `cell_inventory.csv` exactly.
2. **Category assertion** (§3.1).
3. **Event agreement (U7).** Three checks, each required at the stated level:

| Check | Lines | What is compared | Required |
|---|---|---|---|
| 3a | Forecast **fixed** | j_N, j_P, j_O against the archive's `next_<N>_min`, `next_<P>_min`, `next_Open_min` | 100% |
| 3b | **Placebo fixed** (all four factors) | j_N, j_P, j_O against the same-named `next_*_min` fields in M3's phantom-touch table (equivalence verified below) | 100% |
| 3c | **Every line set**, fixed and projected, forecast and placebo | j_N, j_P, j_O from the primary (vectorised) calculation against an independent bar-by-bar reconstruction written separately with the same frozen convention (§2) | 100% |

   - Projected levels (frozen references vs the archive's moving ones) also report their disagreement rate against the
     archive fields, which is not required to be zero.
   - No agreement with archive fields is claimed for any comparison not listed above.
   - **Equivalence of the M3 phantom table for 3b**, verified from code before freezing, with no outcome read:
     - **Ladder:** `scripts/day-reconstruction/phantom_touches.mjs` (unchanged since `52ae9569`) multiplies every rung
       percentage (HL, OC, OH, OL; p50/p75/p90) by the factor, as §2 does.
     - **Days and path:** it uses the archive's day rows with the rungs as built and the same London sessions, trimmed to
       each day's first and last archive bar. Days whose bars don't align are skipped and counted.
     - **Event convention:** it calls the archive's own `buildDay`, whose `next_min` is the first bar j > k that trades
       through the level from the side of the touch-bar close (high ≥ level if the close is below, low ≤ level
       otherwise). For share-eligible touches (a > 0, b > 0) that is exactly §2's rule for N, P and O.
     - **Pass-through:** `m3_analysis.py` expands `next_min` into `next_<level>_min` columns without transforming them.
     - **Fixed levels only:** for projected phantom levels these fields use moving references, so 3b covers fixed
       ladders only, and projected levels rely on 3c.
   - **Pre-build regeneration check (part of 3b):** the build log of the EURUSD ×0.85/×1.15 phantom run was not kept, so
     its "misaligned days = 0" is not on record (the other five runs recorded 0). Before 3b, the build re-runs
     `phantom_touches.mjs` for all three instruments and both factor pairs into a temporary folder. It requires:
     - misaligned days = 0;
     - byte-identical output to the existing files (sha256 prefixes: EURUSD `9a0c188ebb46737d` / `6716c6aa94b3f2b1`,
       GOLD `19852e06fe7c251e` / `022cc63e3e24d18c`, NQ `7dea829cee43672f` / `0a4e8a607e0ccc6b`).

     Only the counts and hashes are compared; no field is read.
   - **If the M3 table is not directly comparable** (a regeneration mismatch, misaligned days, or any 3b disagreement),
     the run stops and the precise mismatch is returned for owner review. The check is not weakened.
4. **Tie-mismatch diagnostic (U8):** the forecast fixed check (3a) is recomputed once on uncast parquet prices, and the
   disagreement rate is reported (M2 found about 0.7% of exact ties). It is a diagnostic only; the primary convention is
   §2's.
5. **Decomposition identity:** resolved + unresolved contributions = EV (tolerance 1e-9), for every cell.

## 7. Reporting (R9, R2) and classification wording (U5)

**Every T1 and T2 cell**, including the 40 descriptive T2 cells, is reported with:
- n per line set;
- for T1, n share-eligible, n U and the denominator;
- estimates with intervals: forecast, B2 placebo and Δ;
- raw p and the BH result;
- unresolved share and the resolved and unresolved contributions (T2; context for T1);
- H and EV − H (T2);
- the Y1–Y3, Y4–Y6 and 2016–20 estimates;
- the untagged-excluded estimate;
- the D2 sensitivity (T2);
- the effect sizes ruled out, stated from the interval bounds;
- the small-placebo flag;
- which trigger conditions were met;
- the classification.

**Classification, one label per cell, in this order.** These are reporting labels; only "Triggered" is a trigger, and
the T1/T2 triggers and thresholds are unchanged:

| Label | T1 | T2 (per race) |
|---|---|---|
| **Triggered** | every frozen T1 condition holds | all four T2 conditions hold |
| **Market-wide context** | — | as defined in §4 (U3) |
| **Inconclusive — material effect remains, trigger unmet** | the 95% interval for Δ share lies entirely beyond +5pp or entirely beyond −5pp, but the full trigger fails on BH significance or period sign stability. The failed condition(s) are named. This is not "ruled out" and not a validated forecast-specific finding | — |
| **Ruled out** | the 95% interval for Δ share lies entirely within [−5pp, +5pp]: effects at or beyond 5pp are excluded in both directions | the interval bounds exclude the required positive effect: Δ_EV upper bound < +0.05R, **or** EV_fc upper bound < H. The label names which bound applies |
| **Underpowered** | any other non-triggered cell: the interval still allows a ≥ 5pp effect without lying wholly beyond the threshold | any other non-triggered cell, including descriptive cells |

A cell is never called "ruled out" because it is non-significant; "ruled out" only follows from the interval bounds
above.

**Counts** per instrument × family × rung: touches, exclusions by reason, U, gap bars, each category, and the
assigned-total check.

**Gap reporting (R2):**
- touches whose decisive bar opened at or beyond the reached reference, by category and race outcome, with gap size
  beyond the reference in σ (median, max);
- U split by gap / no gap.

Gap valuation is at the reference price by convention, not an executable fill.

**Files:** `m7/REPORT.md` (summary, classification counts, checks, deviations), `m7/TABLES.md` (every cell),
`m7/results.json`. The Evidence Book entries carry power rows. The summary never replaces the cell tables.

## 8. Power (from stage-1 counts only; approximate)

- **T1:** at fixed p50 (about 1,500 touches), the Δ share half-width is about 3–4pp at shares of 20–40%, so 5pp is
  detectable. At projected p75 (about 400) it is about 6–9pp, so 5pp effects there are likely to come out underpowered.
- **T2:** payoff SD is about 1–1.5R. EV half-width is about ±0.06R at n = 1,500, ±0.08R at 750, ±0.12R at 400 and
  ±0.2R at 150; Δ_EV half-widths are somewhat larger.
- **Multiplicity:** with BH over 220 tests, a lone true effect needs raw p around 0.0005.
- **M8 feasibility (R8 arithmetic):** only T2 effects of about 0.3R or more and T1 effects of about 11pp or more could be
  confirmed within the 500-session cap.

## 9. Decision flow and stop conditions

1. On owner approval, commit this file, the stage-1 script and its four outputs, and the register row
   (`day-recon-path-book`, REGISTERED), before any outcome code exists.
2. Write the outcome code against this file; commit it before the run. Run once.
3. If any build-time check (§6) fails, stop, report and wait. Nothing is fixed silently.
4. **If neither T1 nor T2 triggers → hard stop (R7).** Record:
   - "no tested effect met the pre-registered evidence standard";
   - the effect sizes ruled out per cell;
   - the cells that stay underpowered, and any "inconclusive — material effect remains, trigger unmet" T1 cells with
     their failed conditions;
   - the conditions never tested.

   This is not a claim that no effect exists. No new conditions, thresholds, variants or studies follow; go to the
   synthesis.
5. **If T1 or T2 triggers → stop and return the exact M8 plan for separate approval (R8):**
   - triggering cells (at most 3, by M7 z-score, Holm);
   - V, D and touches per session;
   - δ_plan;
   - required touches and sessions;
   - the feasibility verdict against the 500-session cap;
   - start date and looks;
   - data source.

   The lockbox stays untouched unless the owner approves it then. Nothing starts automatically.
6. In every case, bank the Evidence Book entries and stop for owner review.

## 10. What M7 will and won't tell us

**Will:**
- the path mix after a touch at each rung and family, with magnitudes, times and adverse excursions;
- whether that mix differs from comparable lines;
- the reference-race EV of fade and continuation on the ladder's own rungs, with how much of it comes from the 22:00
  close;
- whether any condition cell shows forecast-specific positive EV above the materiality bar.

**Won't:**
- executable profitability;
- stop or target design;
- live execution;
- any claim that forecast-specific information is absent in general;
- p90 behaviour (M6 Part B);
- untouched validation (test years were seen descriptively in M3–M6).

## 11. Decision record (owner, 2026-10-29)

| # | Decision | Where in this file |
|---|---|---|
| U1 | Range-used terciles per instrument × rung × line set, each line set its own, from point-in-time EV-eligible pre-outcome features; boundaries recorded. The same 2020–26 boundaries are used for the 2016–20 sign check (a historical sign-stability check, not an independently calibrated model); none recomputed | §5 |
| U2 | T1 denominator = share-eligible minus U; D1 not applied; n U and the denominator reported per cell; U is not a category | §3.1 |
| U3 | Market-wide context: conditions 1 and 2 hold, 3 fails, forecast EV period-sign-stable. Never triggers M8; reported separately | §4 |
| U4 | Period sign = same sign as the pooled point estimate; zero fails; no tolerance | §4 |
| U5 | "Ruled out" only from interval bounds (T1 within ±5pp; T2 Δ_EV upper < +0.05R or EV_fc upper < H). T1 cells whose interval lies wholly beyond ±5pp but which fail BH or sign stability: "inconclusive — material effect remains, trigger unmet", failed condition named. Otherwise underpowered. No trigger changed | §7 |
| U6 | Maximum adverse excursion per race from E, window to the bar before the decisive bar (or the last bar if unresolved); descriptive only | §3.1 |
| U7 | Fixed forecast vs archive 100%. Placebo fixed vs M3's buildDay fields 100%, with equivalence verified from code and a pre-build regeneration check (byte-identical, 0 misaligned days); any mismatch stops and is returned for review. Every line set vs an independent reconstruction 100%, as a separate check | §6 |
| U8 | One float32-loaded-price convention for every event calculation; tie-mismatch diagnostic reported | §2, §6 |
| U9 | D2 sensitivity removes U from numerator and denominator, side by side; primary stays −1R | §3.2 |
| U10 | No placebo threshold; n per factor reported. Warning flag when any placebo factor has < 150 eligible touches: reporting only, changes nothing, and 150 does not by itself establish adequate power | §3.3 |
| U11 | Touch-bar London clock time; M6 Part C boundaries, half-open, last window to session end | §5 |

## 12. Process

1. Register row and this file plus the stage-1 artefacts, pushed, after owner approval.
2. Outcome code committed before the run; one run.
3. Bank (Evidence Book with power rows; trial ledger) and stop for owner review.

## 13. Change log

- **v1 (draft):** first full text; stage-1 cell inventory; U1–U11 listed as open.
- **v2:** owner decisions U1–U11 written into the body (§2, §3, §4, §5, §6, §7, §11); stage-1 reproduction hashes added.
- **v3:** the four follow-up decisions:
  - **check 3b:** kept, after verifying from code that M3's phantom table uses the same ladder construction and event
    convention, plus a pre-build regeneration check (byte-identical, 0 misaligned days); any mismatch stops the run;
  - **small-placebo flag:** fewer than 150 eligible touches in any placebo factor, a reporting warning only; 150 does
    not establish power;
  - **T1 label:** "inconclusive — material effect remains, trigger unmet", no trigger change;
  - **2016–20:** frozen 2020–26 range-used boundaries, described as a historical sign check.
- **Final:**
  - status set to FROZEN;
  - maximum favourable excursion added as a descriptive measure beside MAE (requested by the owner; no effect on
    eligibility, categories, payoffs or classification);
  - this change log.

  No rule, threshold, cell or trigger changed at any version.
