# oi-touch-order — Does the reaction at an OI level depend on how many times it has already been tested today, beyond what any nearby strike does?

**Pre-registered 2026-11-18, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `oi-touch-order` (H1, H2 scored); `oi-touch-order-h3` (descriptive, not scored) |
| Branch | `claude/oi-touch-order` |
| Register row | `plans/RESEARCH_REGISTER.md` → `oi-touch-order` |
| Data | Arm A: 7 instruments (EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY, NAS100), Databento monthly/quarterly book walls (all-expiry, `daily_master_all*`), OANDA M1, **2020-09-08 → 2026-09-04** (end of the Databento book; see Amendment A1 — the 2026-08-21 lockbox cut does not apply). Arm B: our own nightly QuikStrike archive (`oi_raw_<date>`, replayed through `buildOiProfile`), 2026-08-03 → latest, scored once the §5 gate says so. |
| Seed | `20261118` |
| Uncertainty | cluster bootstrap on (instrument, ISO week), B = 2000, as `WALL_PLACEBO_PREREG.md` |
| Scripts / outputs | `oi_research_book/scripts/35_oi_touch_order.py` → `oi_research_book/data/results/oi_touch_order.json`, `oi_research_book/OI_TOUCH_ORDER_RESULTS.md` |
| Harness | own script, reusing `05_intraday_validation.py`'s detector and `17_wall_placebo.py`'s placebo grid (same code path as the banked placebo run, so the two are comparable) |

## 1. The claim

From the owner, 2026-11-18, prompted by a competitor's gamma-level system: *"Do we track touches off OI levels … if touch 1/2/3 cause a reaction? Like price always pulls through a line, then a level of support becomes resistance on the 2nd bounce. Or if a level isn't [tested] earlier in the session it's not respected."*

Stated as testable claims:
- **H1 (order):** the reaction at an OI wall depends on whether this is the first test of the day or a return visit, **by more than the same split does at neighbouring listed strikes**.
- **H2 (role reversal):** after price has closed beyond an OI wall, the next touch from the **other** side is held (rejected) more often at the wall than at neighbouring strikes.
- **H3 (when in the session, descriptive):** the order effect, if any, differs by session block.

## 2. Why it is not already settled

- `WALL_PLACEBO_PREREG.md` / results (2026-09-23): wall touches react exactly like the neighbouring listed strikes at 15/60/240 min (wall − grid −0.6…+2.1 pp, all CIs spanning 0). **That pooled all touches.** It never split by touch order, and never asked about a return visit after a break. This study asks whether the null hides an interaction, using the same detector, data and placebo.
- `project_oi_wall_touch_artifact` / `WALL_DTE_STYLE_RESULTS.md`: walls = neighbours; near-dated walls UNDERPOWERED. Different question (which book), same placebo logic reused here.
- Evidence Book forecast-line entries (first-touch fade / follow at the Live Range and Vol Forecast percentile lines) condition on **first touch only** and are about forecast lines, not OI levels.
- The live bot records touches per zone as telemetry (`OISession.touches`) for the hold-score calibration; no result is banked from it.
- Not a re-run of a banked null: the interaction (order × wall-vs-placebo) and the role-reversal retest are new cells.

## 3. Definitions, fixed in advance

- **Levels:** `call_wall_a` / `put_wall_a` (max-OI call / put strike, all-expiry), **lagged one trading day** exactly as `05_intraday_validation.py` (`load_lagged_levels`). *Known caveat (RESEARCH_BOOK Part 13):* OI(D) is public mid-D+1, so a T-1 level is mildly optimistic. It applies identically to the wall and its placebo, so the wall-minus-placebo contrast is protected; stated, not corrected.
- **Placebo:** the **grid placebo** of `17_wall_placebo.py` (listed strikes ±1, ±2 increments from the wall; NAS100 increment 100; JPY 5e-5 native), dropped on a day it lands within half an increment of the opposite wall. Off-grid (±0.5) reported, not scored.
- **Touch (D0, reproduction):** `05`'s detector unchanged (touch buffer 2 pips, re-arm margin 5 pips; call walls approached from below, put walls from above). Used only to reproduce the banked event counts.
- **Touch (D1, PRIMARY):** the same detector but **re-armed only after a close ≥ `0.20 × R20` away from the level on the far side**, where `R20` = the median full-day high−low range of the instrument's previous 20 sessions (known before the day). Reason: the counts (computed before registering, no outcomes read) show D0 re-arms 2–5 pips/points away, so 62% of D0 wall touches are the 3rd+ hit in the same chop (NAS100: 1,098 of 1,447), which measures noise, not a return visit. `0.20` is fixed here; no other value is run as a scored variant.
- **Order:** `n` = the 1-based rank of the touch within (instrument, side, level, London date), by time. Buckets: **O1** (first), **O2+** (second or later). (`3+` is reported, not scored.)
- **Outcome (H1):** 60-minute **break indicator** exactly as `_classify_event` (close 60 M1 bars later beyond the level in the approach direction). Events within 60 minutes of the day's end are dropped and counted. The touch-buffer / break-definition bias that inflated "rejection" in the old finding is identical for wall and grid, so it cancels in the contrast.
- **H2 detector (D2):** per (instrument, level, London date), scanning M1 both ways. A **flip** = a close beyond the level (≥ 5 pips/points beyond) after approach from the wall's usual side; a **retest** = the first later touch (same buffer) of the level **from the broken side**. Outcome = the 60-minute **reject indicator** (close 60 bars later back on the broken side of the level, i.e. did not re-cross). Same definition applied to each grid strike on the same day.
- **Sessions:** London calendar date (data-rules); window 00:00–22:00 London; weekends out; M1 from the existing `m1_*.parquet` caches (`BAM` never; `--price M` only).
- **De-clustering:** inference is at the (instrument, ISO week) cluster; per level-day events are kept (not thinned) because the contrast is within-cluster.
- **Sample:** Arm A as in the header; **no IS/OOS fit exists** (nothing is fitted). Stability = the gate must hold in both halves (2020-09 → 2023-06-30, 2023-07-01 → 2026-09-04) in sign.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Contrast `C(O2+) − C(O1)` ≠ 0, where `C(b)` = wall 60-min break rate minus grid-placebo 60-min break rate in order bucket b, per side (call, put) | **Null** (expected ≈ 0). The pooled result already shows `C ≈ 0`; an interaction needs the two buckets to disagree. |
| H1-gate | **THE GATE:** both sides' contrast `\|C(O2+) − C(O1)\| ≥ 5 pp`, 95% interval excluding 0, **same sign on both sides and in both halves** | all four conditions |
| H1-mirror | **THE MIRROR:** apply the identical contrast with grid strike `k=+1` as the "wall" against `k = −1, +2, −2` | inside its own 95% interval of 0; if the mirror alone clears the gate, the design is biased and H1 is void |
| H2 | At the wall, the retest-from-the-other-side reject rate minus the grid-placebo's, per side | **Null** (expected ≈ 0; role reversal is folklore until tested). |
| H2-gate | **THE GATE:** difference ≥ +5 pp, interval excluding 0, both sides, both halves | all four |
| H2-mirror | same, `k=+1` as pseudo-wall | inside 0 |
| H3 | the `C(O2+) − C(O1)` contrast by UTC block 00-06 / 07-12 / 13-20 / 21-23 | descriptive; BH q = 0.10 with `chanceBaseline`; a slice that survives is a candidate for its own prereg, never a result |

## 5. Power — what this design can and cannot find

Planned counts from the **D0 events** (touch timestamps only, outcomes unread): wall touches O1 = 1,190, O2 = 930, O3+ = 3,454; grid O1 = 4,704, O2 = 3,764, O3+ = 13,335; 600 wall (instrument, week) clusters, 513 with an O2 touch. D1 counts will be lower (a wider re-arm removes chop touches); the D1 wall count is recorded in `results.json` before any rate is computed.

SE basis (`mdeFromCI`, placebo run): the banked pooled wall − grid at 60 min had a 95% interval of −2.7…+3.6 pp on ~2,700 wall touches (SE ≈ 1.6 pp). Scaling by √(n_prev / n_bucket):

| Cell | Wall n (D0) | Est. SE of the contrast | **MDE** (80%, α .05) | Pass bar | Verdict by design |
|---|---|---|---|---|---|
| H1 `C(O2+) − C(O1)`, per side | ~2,200 / 1,190 each side (D0; fewer under D1) | ≈ 2.7 pp | **≈ 7.6 pp** (more under D1) | 5 pp | **UNDERPOWERED by design** for any effect between 5 and 7.6 pp |
| H2 retest vs grid, per side | unknown until D2 is built; count recorded before any rate | — | — | 5 pp | **UNDERPOWERED if the wall retest count per side < 400** |
| H3 slices | 227–2,755 per block | 3–8 pp | > 8 pp | descriptive | description only |

Consequences, fixed now: (i) a result inside ±5 pp is **UNDERPOWERED, not NULL**; NULL requires the interval to lie within ±5 pp, which needs SE ≲ 2.5 pp and is not expected on this sample. (ii) Because the owner's rule is graded reporting (effect, interval, power, test trust), RESULTS reports each cell's estimate, interval, MDE and a plain-words weight of evidence, **not** a binary pass/null.

**Arm B (own nightly archive)** is scored **once**, only when its O2+ wall count (both sides, all instruments) reaches **1,000** touches — at which the MDE is stated before any rate is read. Until then it is **recorded and described**, no verdict. It is the only source of the true 0–3 DTE book; it is expected to take months (34 sessions at 2026-10-16). The Arm A scored result does **not** wait for it.

**Positive control (before the MDE is trusted):** plant a +8 pp O2+ break-rate shift on wall events in a copy of the events and recover it with the exact estimator; report the recovered value. Also plant 0 and report the false-positive rate over 200 cluster-permutations.

## 6. Multiplicity

- **Scored cells:** H1 (two sides) and H2 (two sides) = 4 cells; each gate is conjunctive across both sides and both halves (stricter than Holm), plus Holm α = 0.05 across the four `pFromCI` p-values for the stated pass. Mirrors and the positive control are gates, not cells.
- **Disaggregation (descriptive):** per instrument (7), per UTC block (4), horizon 15 / 240 min, `3+` bucket, off-grid placebo — **BH q = 0.10 with `chanceBaseline`**; none carries pass/fail weight.
- **Variants run:** D1 `0.20 × R20` re-arm (fixed), D0 for reproduction only. No others. Count of scored variants = 1.
- **Promotion to anything live needs |t| ≥ 3** and a forward test; this study cannot size a position.

## 7. What this does NOT test

- **Direction or trade profit.** It describes reaction at a level relative to neighbouring strikes. No costs are applied; any trading rule built on a result needs its own prereg with costs, MAE from M1 and a forward record.
- **The live bot's book.** Arm A walls are the monthly/quarterly book (median nearest expiry 15 DTE FX, 45 DTE NAS100); the bot trades 0–3 DTE. Arm B is the only data on that book.
- **Causes** (dealer hedging, stop clusters, round numbers). **Gold, SPX, RUT:** no Arm A events exist (gold weeklies not pulled; no long SPX/RUT history). **Dynamic or intraday-updating levels** (the competitor's gamma zones, the Cboe intraday log) — sample too short; a separate question.

## 8. What each verdict changes

- **Pass (all four conditions):** ledger entry `validated`; the OI Lab and Pine indicator may show a "touch #" label and the bot's hold-score may use order as an input *only after* Arm B or a forward record agrees. Candidate for its own trade prereg.
- **Null:** the live "wall-touch read" stops implying order matters; the bot's `touches` telemetry stays logging only.
- **Underpowered (expected):** closed as untestable on the monthly book; the next step is Arm B at ≥ 1,000 O2+ touches, and the deliverable now is the graded table (effects, intervals, MDE). No bot or page changes.

## Amendments

### A1 — 2026-11-18 — PRE-RESULTS
Owner instruction: ignore the holdout days. Arm A's window now runs to the last date the Databento book and M1 cover (2026-09-04) instead of stopping at 2026-08-21; the §3 second half and the header row follow. Reason it is allowed: `forge/LOCKBOX_PROTOCOL.md` freezes and guards layers 3 (HAR-800 ladder), 5 (remaining travel) and 6 (confidence); this study scores none of them and fits nothing, so it cannot spend the holdout. No outcome had been computed: the only reads before this amendment were touch timestamps for the §5 counts. The 246 event rows dated after 2026-08-21 are now inside Arm A. Arm B is unchanged: its gate is statistical power (1,000 O2+ touches), not the lockbox. Arm A and Arm B overlap on calendar days 2026-08-03 → 2026-09-04 but use different level sources (monthly book vs nightly day book); they are reported separately and never pooled.
