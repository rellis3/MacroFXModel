# Null audit: `wall-placebo` (Evidence Book, verdict null, 2026-09-23)

Audited 2026-10-24 on branch `worktree-agent-a6bd188756b698369`. Banked record untouched (no edit to
`js/deskEvidence.js`, the prereg, or `oi_research_book/data/results/`). Scripts: `scripts/null-audit/wall-placebo/`.
Outputs: this folder.

**Claim tested by the study:** the ~60% rejection seen when price touches the max-OI strike (the "wall") is specific
to the wall, so the wall's break rate is below the break rate at neighbouring listed strikes (grid placebo, ±1/±2
strike steps). Prereg PASS: at 15 min, wall − grid < 0 with a 95% cluster-bootstrap CI excluding 0 on BOTH the call
and the put side, and |diff| ≥ 3 pp. Banked: FAIL → null.

**Bottom line: BUG-NO-CHANGE.** Two real bugs: no futures-to-CFD basis, and CME call/put labels not swapped on the
inverted pairs. Together they meant the banked pipeline was not testing the wall where it actually trades. The
positive control shows the banked code would have missed a prereg-sized effect sitting at the real wall. With both
bugs fixed, though, the wall is still no different from its neighbours (15 min: calls −0.4 pp [−2.8, +2.2], puts
+0.2 pp [−2.0, +2.7]). The corrected pipeline does catch a planted effect of the same size. So the null holds, now
on a design that can see the effect.

---

## Code path traced

`17_wall_placebo.py build` → `05_intraday_validation.py` (`load_m1`, `load_lagged_levels`, `detect_touch_events`,
`_classify_event`) → `data/daily_master_all_<pair>.parquet`, built by `01_build_daily_dataset.py` from
`OI Data/<PAIR>.csv` (Databento CME statistics + settlements) and the OANDA D1 file. Then `17 report` → pooled break
rates, a (pair, ISO week) cluster bootstrap (2,000 reps, seed 7) and the gate. Constants come from `pair_config.py`.

| # | Step (file:line) | What it does | Finding |
|---|---|---|---|
| T1 | 01:53-56, 69-79 | raw chain; OI forward-filled ≤5 rows per (expiry, strike, right) | OK. The independent rebuild from raw gives the same walls on every date (step 4 matches to the event) |
| T2 | 01:58-66 | inverted pairs (USD_CAD/CHF/JPY): strike → 1/strike | **BUG B2.** The rights are not swapped. A CME call on JPY/CAD/CHF is a put on USD/xxx, so `call_wall_a` on these pairs is really the OANDA *put* (support) wall, and the detector tests it from the wrong side. Measured: "call wall" above the day's open on only 11.8% of days (USD_CAD) and 3.6% (USD_JPY), against 74-94% on the normal pairs (`accounting.csv`). Production swaps them (`js/oi.js:288-300`, `cpSwapped`, default on for inverted pairs) |
| T3 | 01:115, 190; 05:66 | walls are CME **futures-option** strikes, joined to OANDA CFD/spot prices by date | **BUG B1. No basis.** Put-call parity on the same file's settlements (`basis.py`, F = K + C − P, 4 near-ATM strikes, front expiry, vs the OANDA M1 close at the CME settle minute) gives median basis EUR +25 pips (IQR 14-40), USD_JPY −66 (IQR −121…−14), USD_CHF −37, USD_CAD −10, AUD +4, GBP +2, NAS100 +45 pts (≈ +100 every year 2023-26). The touch buffer is 2 pips and the placebo step is 50 pips FX / 100 pts NQ, so on EUR, CHF, JPY and NQ the level tested sits roughly ½ to 1 placebo step away from where the strike trades. `24_ripple_walls_placebo.py:6-9` already notes "the OI wall test never did this". `RESEARCH_BOOK.md:909-915` ("no CME-futures basis error", median +2.5 pips) is wrong: an OI-weighted strike centroid does not measure the basis |
| T4 | 01:193-194 | wall = max summed OI over **all** expiries | By design (prereg "max-OI wall"). Ties are rare (≤3 dates per pair, except USD_CHF calls: 42) |
| T5 | basis.py alignment check | which price day does the settlement on raw row D belong to? | Row D = trade date D. Day-to-day noise of F − S is 0.6-1.7 pips aligned at D, 37-64 pips at D±1 (NQ 4.9 vs 195 pts) |
| T6 | oi_date_check.py | which day's book is the OI on row D? | End of day D: Spearman(\|ΔOI_D\|, volume_D) = 0.86, against 0.26-0.31 for the volume on D−1 or D+1; P(ΔOI > 0 \| vol_D = 0) = 0.4% |
| T7 | 05:50-60 | `shift(1)` by row: day D's bars get the book of the previous CME date | Publish lag: the D−1 book is final only ~15-16 UTC on D (`RESEARCH_BOOK.md:857-866`), so the first ~2/3 of each UTC day uses a book not yet public (minor lookahead). That biases toward finding an effect, not against it. Monday gets Friday's book, which is correct. No stale-book failure (it is never older than intended). A publish-lag-honest variant (`pit`: book D valid from D+1 16:00 to D+2 16:00 UTC) changes nothing (below). Monday-capture and truncated-ladder traps apply to the live QuikStrike scraper, not to this Databento archive |
| T8 | 05:66-67 | M1 joined to levels by **date** (UTC day), inner | Join by date, not position. Sunday-evening bars have no CME row and are dropped (same for wall and placebo) |
| T9 | 05:77-96 | touch from an armed state: high ≥ W − 2 pip (call); re-arm at a close 5 pip back; initial state from the day's first close | Mechanically biased toward "reject" (touch counted short, break needs a close beyond). That is the point of the placebo, and it hits wall and placebo identically. On NQ the 2/5-pt buffers are tiny (7.4 wall touches per touch-day on calls), but week clustering absorbs that |
| T10 | 05:100-114 | outcome = close of bar i+h (bar count, not clock), same UTC day only | Off-by-one: none (bar i+h is h bars after the touch bar). Bar count ≠ minutes across gaps: a clock-time variant (`timeh`) changes ≤0.1 pp. Day-end truncation leaves 240-min outcomes unresolved for 6-25% of touches, with wall ≈ grid in each pair (`accounting.csv`). The hour of day of touches is identical for wall/grid/off-grid (mean 11.9 UTC) |
| T11 | 17:38-58 | placebos: wall ± k·step in native strike terms (k = ±1, ±2; off-grid ±0.5), inverted pairs shifted natively then inverted; dropped within ½ step of the opposite wall | Correct as written. The drop rule removes 0-100 placebo-days per k per pair (EUR −2 step on calls: 100), and it is symmetric. **Comparability:** placebo strikes carry a median 31% of the wall's OI, and 31% of placebo touches sit on strikes with ≥ 50% of the wall's OI (`oi_dose.log`). The control is "less OI", not "no OI" (see S2) |
| T12 | 17:69-96 | pooled break rate per kind; bootstrap resamples (pair, ISO week) clusters, ratio of sums | Matches the prereg. Clusters: 733-798 |
| T13 | 17:108-110 | gate `ci_hi < 0 & diff ≤ −3` for both sides at 15 min | Matches the prereg exactly |
| T14 | 17:69-70 + pair_config.py:27 | `report()` loops over `PAIR_CONFIG` | **Repro bug R1:** SPX500_USD was added to `pair_config` on 2026-10-20 and has no events file, so `17 report` now crashes. The wrapper restricts it to the 7 banked pairs |
| T15 | banked events CSVs | data window | **Lockbox breach L1:** the banked run used an M1 cache running to 2026-09-04, past the 2026-08-21 lockbox. 246 of 38,492 banked events fall after 2026-08-21 (`accounting.py`) |

## Step 2: reproduce

Command: `sh scripts/null-audit/wall-placebo/run_repro.sh` (unmodified 17 + 05, output folder redirected).

* EUR_USD and NAS100_USD event files are **byte-identical** to the banked ones. GBP, AUD, CAD, CHF and JPY are
  identical once the banked rows dated after 2026-08-20 are cut (the local M1 cache ends 2026-08-20 23:59; the banked
  run's ended 2026-09-04). The one remaining difference: a single USD_CAD grid event on 2024-04-11 has a different
  240-min outcome (one M1 bar differs between cache versions).
* Pooled table, repro vs banked: call 15m −0.65 [−3.11, +1.83] vs −0.62 [−3.15, +1.90]; put 15m +1.91 [−0.45, +4.30]
  vs +2.09 [−0.30, +4.59]. All other cells move by ≤0.35 pp. FAIL in both. The whole gap is the 246 post-lockbox
  events.

## Step 3: plant (positive control)

Plant = for a random fraction F of the wall touches, mirror the next 240 bars of the path to the reject side of W
(`reimpl.pullback`). Every planted touch becomes a reject at every horizon. Mirrored paths re-arm and re-touch, so
the planted excess is larger than F × break rate. F = 0.03 gives a prereg-sized excess of about 3-5 pp. Seed 20261024.

| Planted at | Seen by | call 15m wall − grid | put 15m wall − grid | grid rate moved? | gate |
|---|---|---|---|---|---|
| banked walls, F=0.15 | **original 17+05 code** (planted M1 files) | −18.03 [−20.28, −15.54] | −15.52 [−18.36, −12.43] | 38.78 → 39.04 | PASS (same to 2 dp as the reimpl row below) |
| banked walls, F=0.15 | reimpl (base) | −18.0 [−20.3, −15.5] | −15.5 [−18.4, −12.4] | 38.8 → 39.0 | PASS |
| banked walls, F=0.03 | reimpl (base) | −5.2 [−7.7, −2.6] | −2.7 [−5.1, −0.1] | 38.8 → 38.8 | FAIL (put < 3 pp) |
| banked walls, F=0.02 | reimpl (base) | −3.7 [−6.2, −1.1] | −1.3 [−3.8, +1.2] | 38.8 → 38.8 | FAIL |
| **true walls** (swap+basis), F=0.03 | **banked design** | **−1.0 [−3.4, +1.5]** | **+1.2 [−1.2, +3.7]** | flat | **FAIL: blind** |
| true walls, F=0.03 | corrected design | −5.7 [−8.0, −3.2] | −3.9 [−6.5, −1.1] | flat | PASS |
| true walls, F=0.15 | banked design | −3.5 [−6.0, −0.9] | −1.7 [−4.5, +1.1] | flat | FAIL |
| true walls, F=0.15 | corrected design | −16.5 [−18.6, −14.1] | −16.2 [−18.6, −13.6] | flat | PASS |

What this shows:
1. The banked code finds an effect planted at the levels it uses, and the placebos stay flat (grid within 0.2 pp).
2. The banked design is close to blind to an effect at the wall's true trading location. A 4-6 pp excess there reads
   as −1.0 / +1.2 pp. Even a ~16 pp excess reads as −3.5 / −1.7 pp, and the gate fails. B1+B2 could therefore have
   produced a false null.
3. Power at the prereg bar: with a 3-5 pp effect the gate passes about half the time (both sides must clear 3 pp,
   and the CI half-width is ~2.4 pp). The pass rule is strict but not unreasonable.

## Step 4: independent re-implementation

`reimpl.py` imports none of the study's functions. It rebuilds walls from the raw chains, uses its own numba
detector written from the prereg rules, and its own bootstrap.

* **Base mode = banked design:** identical to the step-2 reproduction to 2 dp in every cell, CIs included
  (call 15m −0.65 [−3.11, +1.83], put 15m +1.91 [−0.45, +4.30]; n_wall 2,893 / 2,607, n_grid 11,228 / 10,291).
  There is no gap to explain. The walls and the detector are what the code says they are.
* **Corrected variants** (15m wall − grid, pp, 95% CI). All FAIL. None reaches |diff| ≥ 1 pp at 15 min:

| Variant | call 15m | put 15m | call 60m | put 60m |
|---|---|---|---|---|
| swap only | +0.05 [−2.3, +2.5] | −0.98 [−3.1, +1.4] | +0.04 | −1.70 [−5.0, +1.6] |
| basis only | −0.12 [−2.4, +2.4] | −0.13 [−2.5, +2.3] | −1.14 | +0.19 |
| **swap + basis (front expiry)** | **−0.44 [−2.8, +2.2]** | **+0.22 [−2.0, +2.7]** | −0.92 [−3.9, +2.0] | +0.23 [−3.2, +3.5] |
| swap + basis (wall's own expiry) | +0.25 [−2.1, +2.8] | +0.47 [−1.8, +2.9] | −0.83 | −0.11 |
| swap + basis + publish-lag-honest book | +0.47 [−1.8, +2.8] | +0.49 [−1.7, +2.8] | −1.14 | +0.65 |
| swap + basis + clock-time horizons | −0.46 [−2.8, +2.2] | +0.16 [−2.1, +2.8] | −0.97 | +0.10 |
| banked + publish-lag-honest | −0.06 [−2.5, +2.3] | +1.76 [−0.6, +4.2] | +0.75 | −0.64 |

The corrected CIs rule out a wall-specific rejection excess larger than about 2.8 pp at 15 min on either side.

## Step 5: accounting (`accounting.csv`, banked design)

* CME dates in raw: 1,519-1,521 per pair → with OANDA M1 bars (≤ 2026-08-20): 1,505-1,508 → T-1 level-days with
  bars: 1,505-1,508. No day is lost for a missing wall (call/put wall NaN on 0 days).
* Walls are far from price: median distance 1.6-5.5% of price for calls, 1.9-10.3% for puts (all-expiry max OI).
  So the wall is inside the day's range on only 34-129 days per pair and side, and wall touches cluster on 25-115
  days per pair and side. Wall touches: 5,500 (calls 2,908, puts 2,620). Grid placebo touches: 21,625. Off-grid:
  11,065.
* Placebo-days dropped by the opposite-wall rule: 0-100 per k (symmetric between call and put).
* Unresolved outcomes (touch too late in the UTC day): 15m ≤1.4%, 60m ≤4.2%, 240m 6-25%, wall ≈ grid in each pair.
  Touch hour distributions are identical across kinds. Nothing removes wall cases preferentially.
* 246 banked events are dated after the lockbox (L1).

## Supplementary (exploratory, not pre-registered): OI dose inside the placebo set

`oi_dose.py`, corrected design. The grid placebos are not low-OI: median 31% of the wall's OI. Pooled, the break
rate falls from 43% (placebo strikes < 10% of wall OI) to about 35% (50-75%), a slope of −10 pp per 100% of wall OI.
Within pair × side × k strata (NAS100 has both the highest break rate and the lowest OI ratios) the slope shrinks to
−3.7 pp [−6.8, −0.1] at 15 min and −1.5 pp [−5.7, +2.1] at 60 min. The wall itself (100%) breaks 38.7% / 38.0%,
no lower than placebos holding 50-99% of its OI. This is a marginal, post-hoc gradient after several looks. It is not
a wall effect, and it does not move the verdict. If anyone takes it further, the next step is a prereg of "break
rate vs strike OI share", within-instrument and on the corrected design, not a re-run of this test.

## Findings

| ID | Where | Severity | Could it move the verdict? |
|---|---|---|---|
| B1 | No futures→CFD basis: `01_build_daily_dataset.py:115,190`, used in `05_intraday_validation.py:66`, `17_wall_placebo.py:38-41` | **critical** (design blind at true wall, see plant) | Could have. Checked: the corrected re-run is still null → does not move it |
| B2 | Inverted pairs keep CME C/P labels after strike inversion: `01_build_daily_dataset.py:58-66` (prod swaps, `js/oi.js:288-300`) | **major** (3 of 7 instruments tested from the wrong side) | Could have. Checked: swap-corrected re-run null → no |
| D1 | `RESEARCH_BOOK.md:909-915` says no basis error; PCP basis is 25-100+ pips/pts on 4 of 7 instruments | major (documentation; other OI-book studies built on 01 inherit B1/B2) | Not for this verdict; affects sibling OI-book studies |
| L1 | Banked run scored 246 events after the 2026-08-21 lockbox (M1 cache to 2026-09-04) | minor | No (≤0.35 pp) |
| R1 | `17_wall_placebo.py:69-70` loops over `PAIR_CONFIG`, which gained SPX500_USD (`pair_config.py:27`) → `report` crashes on re-run | minor | No |
| P1 | T-1 row lag uses a book not final until ~15-16 UTC on D (`05:58-59`) | minor (biases toward an effect) | No (pit variant null) |
| N1 | Horizon by bar count, not clock (`05:103`) | minor | No (≤0.1 pp) |
| S2 | Grid placebos carry a median 31% of wall OI (prereg "less OI") | minor design caveat | No (wall no lower than high-OI placebos) |

## Cost of this audit (for a 150-study budget)

* Trace (step 1): ~20 min reading 17, 05, 01, 02, pair_config, the prereg, the book sections and the production
  `js/oi.js` inversion/basis code.
* Reproduce (step 2): 3 min build (7 pairs in parallel) + 1.5 min report, plus ~5 min diffing. Diagnosing the
  lockbox/M1-version gap took ~3 min.
* Basis + date-alignment + OI-date checks: ~40 s per pair (7 in parallel), ~2 min for the OI-date check.
* Re-implementation (step 4): ~15 min to write. First run 110 s (builds the wall cache from 1.7 GB of raw CSV), then
  25-40 s per variant. 7 variants + 8 plants ≈ 10 min of compute.
* Plant through the original code: ~20 min of compute (7 sequential builds on planted M1 files), run alongside the other steps.
* Accounting + OI dose: ~5 min.
* **Data fetching: none.** Everything was local: `OI Data/*.csv` (1.7 GB) and `VolRangeForecaster/data/m1/*_m1.parquet`
  (~430 MB), joined into the worktree. No OANDA, R2, KV or paid API calls.
* Wall clock about 35 min of compute and 30 min of writing and reading; one study of this size ≈ 1 hour.

## Verdict integrity: BUG-NO-CHANGE
