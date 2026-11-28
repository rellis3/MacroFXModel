# fred-untested-range — results

**Run 2026-11-28.** Prereg `forge/FRED_UNTESTED_RANGE_PREREG.md` (registered in 3f36a14c; amendments A1/A2 pre-results in
db08a6d6). Script `scripts/fred-untested-range/run.py`, seed 20261128, one run (a first run crashed in the descriptive
VIX step after the family had been scored in memory; nothing was written or printed from it; the identical seeded run
was repeated after the one-line fix). Outputs: `results.json` (every cell), `site.json` (page), `calibration.json`,
`positive_control.json`, `power.json`, `run_log.txt`. Page: `fred-untested-range.html`.

## Verdict: NULL (pooled), UNDERPOWERED (per instrument)

No cell passed. **0 of 408 scorable cells survived discovery** (BH q 0.10; smallest calibrated p 0.021, DGS6MO move size on
EURUSD), so nothing went to the held-out Holm stage and **nothing confirmed**. Under the calibrated p, 12 cells came under
p 0.05 against 20.4 expected by chance, and none came under 0.01. That is fewer than chance, not a hidden cluster.

- **POOL (mean next-week miss of the five instruments): NULL.** 44 of the 68 scorable POOL cells could have seen a 10%
  effect over 2020-26 (MDE95 at or below 10%). Full-sample POOL effects run from −7.3% to +8.1% (median MDE95 8.6%). The
  pre-registered family rule (at least half the POOL cells NULL-graded) gives `NULL`.
- **Per instrument: UNDERPOWERED.** 254 of 340 per-instrument cells have a full-sample MDE95 above 10% (USDJPY 67 of 68,
  SPX500 60 of 68). The design could only have found effects of about 10-30% of next-week range on a single instrument.
- **Positive control (A2):** a planted +10% next-week range shift on POOL, in the top tercile of a pure-noise persistent
  signal, came back as +10.0% each time (the arithmetic is right). It passed both stages in **1 of 3** replicates: the
  noise signal's own chance link to the slow drift in the forecast miss (+5.7% / +4.6% / +14.8% on discovery) hides or adds
  to a 10% plant. A real 10% POOL effect is found about one time in three, which fits the power table. **The pooled NULL
  rules out effects of roughly 10% or more, not 5%.**

## What the scan says, series by series (graded weight, not results)

Full-sample (2020-08 → 2026-08) top-minus-bottom-tercile effect on POOL next-week range against the shipped forecast,
with that cell's own shift-placebo MDE95 (calibrated). NULL = would have seen 10%; UNDERPOWERED = would not.

| Unit | lvl: POOL full-sample effect (MDE95) grade | mov: POOL full-sample effect (MDE95) grade | smallest discovery p (cell, effect) |
|---|---|---|---|
| AAA10Y | not scorable | +2.8% (6.3) NULL | 0.155 (mov EURUSD +5.6%) |
| BAA10Y | +3.6% (11.4) UNDERPOWERED | +3.0% (6.5) NULL | 0.064 (lvl EURUSD +17.0%) |
| DCPF3M | not scorable | +2.4% (7.9) NULL | 0.022 (mov EURUSD +14.5%) |
| DEXCAUS | +6.5% (10.9) UNDERPOWERED | -1.2% (6.7) NULL | 0.125 (lvl NQ +14.6%) |
| DEXCHUS | +8.1% (13.3) UNDERPOWERED | +0.7% (7.8) NULL | 0.082 (mov SPX500 +11.0%) |
| DEXJPUS | not scorable | +0.2% (7.1) NULL | 0.249 (mov NQ +4.3%) |
| DEXSZUS | not scorable | +1.9% (6.6) NULL | 0.192 (mov POOL +3.7%) |
| DEXUSAL | -7.3% (12.1) UNDERPOWERED | +0.7% (6.9) NULL | 0.275 (lvl NQ -8.7%) |
| DEXUSEU | -3.6% (9.7) NULL | +3.1% (7.2) NULL | 0.095 (mov USDJPY +7.8%) |
| DEXUSNZ | -5.5% (11.7) UNDERPOWERED | +0.7% (6.6) NULL | 0.120 (mov EURUSD +6.6%) |
| DEXUSUK | not scorable | +3.0% (6.5) NULL | 0.202 (mov EURUSD +6.2%) |
| DFII5 | +6.8% (12.8) UNDERPOWERED | -1.8% (6.7) NULL | 0.071 (lvl NQ +17.0%) |
| DGORDER | -4.4% (8.9) NULL | +3.0% (7.8) NULL | 0.212 (lvl POOL -7.4%) |
| DGS1 | +4.9% (14.1) UNDERPOWERED | +1.3% (8.8) NULL | 0.044 (mov EURUSD +13.8%) |
| DGS1MO | +5.9% (15.6) UNDERPOWERED | +3.2% (10.0) UNDERPOWERED | 0.095 (mov USDJPY +10.3%) |
| DGS20 | not scorable | +1.8% (6.5) NULL | 0.092 (mov NQ +7.8%) |
| DGS3 | not scorable | +0.8% (8.6) NULL | 0.570 (mov EURUSD +3.5%) |
| DGS30 | not scorable | +1.4% (6.7) NULL | 0.220 (mov NQ +6.0%) |
| DGS3MO | not scorable | +4.7% (9.7) NULL | 0.042 (mov EURUSD +16.3%) |
| DGS5 | not scorable | +2.5% (7.9) NULL | 0.298 (mov EURUSD +6.0%) |
| DGS6MO | not scorable | +3.5% (9.1) NULL | 0.021 (mov EURUSD +17.8%) |
| DGS7 | not scorable | +1.8% (7.1) NULL | 0.239 (mov NQ +6.7%) |
| DHHNGSP | +2.5% (12.1) UNDERPOWERED | +0.6% (7.2) NULL | 0.169 (lvl GOLD -6.0%) |
| DTB3 | not scorable | +4.7% (10.2) UNDERPOWERED | 0.045 (mov EURUSD +16.0%) |
| DTWEXEMEGS | +3.8% (13.0) UNDERPOWERED | -1.6% (6.6) NULL | 0.115 (mov GOLD -5.8%) |
| EFFR | +4.5% (17.1) UNDERPOWERED | -1.7% (10.4) UNDERPOWERED | 0.322 (lvl SPX500 +12.9%) |
| EPUTRADE | +4.5% (12.5) UNDERPOWERED | +0.6% (7.4) NULL | 0.128 (lvl POOL +9.1%) |
| NDFFRIW027SBOG | not scorable | -1.1% (7.2) NULL | 0.081 (mov GOLD -6.8%) |
| NFCI | +1.5% (11.9) UNDERPOWERED | +3.6% (8.0) NULL | 0.061 (lvl EURUSD +15.2%) |
| OVXCLS | -0.8% (9.7) NULL | -0.6% (6.4) NULL | 0.025 (lvl EURUSD +18.0%) |
| PCEPILFE | not scorable | -3.7% (8.1) NULL | 0.043 (mov SPX500 -9.2%) |
| PPIFIS | -0.8% (15.6) UNDERPOWERED | -1.7% (8.6) NULL | 0.048 (lvl GOLD -6.7%) |
| SOFRVOL | not scorable | +2.5% (5.8) NULL | 0.245 (mov GOLD +3.4%) |
| SWPT | not scorable | +2.8% (8.9) NULL | 0.041 (mov SPX500 +9.4%) |
| T5YIE | -1.8% (13.0) UNDERPOWERED | +1.4% (6.6) NULL | 0.032 (mov EURUSD +9.1%) |
| T5YIFR | -2.9% (11.6) UNDERPOWERED | +2.0% (5.7) NULL | 0.078 (lvl NQ -10.7%) |
| TOTBKCR | -0.7% (14.4) UNDERPOWERED | -2.7% (8.7) NULL | 0.045 (lvl USDJPY +13.5%) |
| USEPUINDXD | +1.7% (8.3) NULL | +0.3% (4.4) NULL | 0.208 (lvl NQ +5.2%) |
| USEPUINDXM | +6.1% (12.0) UNDERPOWERED | +2.3% (8.4) NULL | 0.089 (lvl EURUSD +14.9%) |
| WLCFLPCL | +4.1% (10.6) UNDERPOWERED | +1.5% (8.8) NULL | 0.162 (lvl POOL +8.6%) |
| WMTSECL1 | not scorable | -0.6% (7.3) NULL | 0.374 (mov GOLD -3.2%) |
| WRESBAL | -5.9% (10.8) UNDERPOWERED | -0.2% (7.4) NULL | 0.052 (lvl POOL -11.1%) |
| WTREGEN | -1.8% (10.1) UNDERPOWERED | -0.3% (8.2) NULL | 0.055 (mov SPX500 -6.7%) |
**Not scorable (A1 rules, listed rather than tested; 30 unit × transform pairs):** BAMLEMCBPIOAS and BAMLH0A1HYBB
(FRED's ICE history starts 2023-11-29), EVZCLS (dead after 2025-03-11, now treated as missing), GEPUCURRENT (first releases
arrive 61-219 days late, so it is stale most of the time), THREEFYTP10 (the ALFRED first releases are irregular, so
under 70% coverage), IORB_SPLICE (a step function: the terciles are unbalanced). For these the level transform was not
balanced in both periods: AAA10Y, DCPF3M, DEXJPUS, DEXSZUS, DEXUSUK, DGS3MO/6MO/3/5/7/20/30, DTB3, NDFFRIW027SBOG,
PCEPILFE, SOFRVOL, SWPT, WMTSECL1. A trending level spends a whole period in one tercile of its own trailing year. Their
move-size transforms were scored.

**Largest leans (graded weight only; none passed discovery, and none is a candidate):**
- Reserves (WRESBAL level): high reserves → POOL next week 11.1% narrower than forecast on discovery (p 0.052),
  −5.9% full-sample (MDE 10.8). NQ −14.8%, SPX −17.7% on discovery.
- 5-year real yield (DFII5 level): high → +10.5% wider on discovery, +6.8% full-sample; NQ +17.0% on discovery.
- Front-end move size (DGS3MO, DGS6MO, DTB3, DGS1, DCPF3M `mov`) → EURUSD +14% to +18% wider on discovery, +6% to +9%
  full-sample (MDE 11-16). It is one fact (front-end repricing size) seen five times.
- H.10 fixing levels (DEXCHUS, DEXCAUS, DEXUSAL, DEXUSNZ) carry ±5-8% full-sample on POOL. These are dollar-level regimes
  lining up with the slow drift in the forecast miss, which is what the shift placebo is there to discount.

## Controls

- **Shift placebo, calibrated (A2).** The raw placebo-normal p was too liberal for persistent signals: over 300 pure-noise
  AR(1) signals, |z| > 1.96 came up 8-16% of the time by target and period. The calibration factor c (SD of z) is 1.22-1.34
  on discovery and 1.04-1.24 held-out. With c applied, 0 of 60 fresh noise signals gave p < 0.05.
- **The block bootstrap CI is not the test.** Many discovery cells have a 21-session block-bootstrap 95% CI that excludes
  zero (e.g. DFII5 level POOL +10.5% [+6.7, +14.9]) while the shift placebo gives p 0.11. Persistent macro signals line up
  with month-long runs in the forecast miss, and a 21-day block cannot see that. A screen on bootstrap CIs alone would
  have "found" dozens of these.
- **Point in time.** ALFRED first releases. Each value is usable only when realtime_start ≤ session date − 2 days. A dead
  or paused series counts as missing past 10/21/100 days. Lags are measured, not assumed (prereg §3).
- Lockbox untouched: last outcome session 2026-08-20.

## Deviations from the prereg

A1 and A2 (both pre-results, in the prereg). A2 discloses one cell seen before the main run (NFCI `lvl` × POOL: discovery
+5.7%, held-out −5.2%, from the first control design). In the main run that cell came out at calibrated p 0.69, and it
was not a survivor. The descriptives pre-registered for confirmed cells (VIX overlap, Monday-only) were not computed,
because no cell reached them.

## What this changes

- `js/dataCatalogue.js`: the 43 scored series now carry `fred-untested-range` as evidence. The six that could not be
  scored stay untested, with the reason here.
- Nothing goes into the range forecast. No layer is proposed. If anyone follows up, the one with a mechanism story is
  reserves (WRESBAL) on index range, which would need a longer history (H.4.1 goes back to 2002, but the shipped forecast's
  OOS table starts in 2020-08) or a different outcome, and its own prereg.
