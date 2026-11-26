# gold-calc-upgrades: do published volatility-forecasting upgrades beat our gold calc on Jordan's lines?

**Pre-registered 2026-11-26, before any of the new arms has been fitted or scored.**

| | |
|---|---|
| ID / ledger id | `gold-calc-upgrades` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-calc-upgrades` |
| Source | **Owner, 2026-11-26:** "Is there anything we can do to make our gold calc better for forecasting? ... IV, RV, range, short-term volatility over the last 3/4/5 days as volatility clusters ... What do the papers in the library say?" Then: "Let's do a specific gold analysis of all these new ideas. Let's not change the calc under the QLIKE export until we have validated it." Ideas come from the paper library (read 2026-11-26): QLIKE-fitted HAR ("Coherent Forecasting of Realized Volatility", 2025, full text), overnight/session volatility as a separate regressor (G7 extreme-range-estimators paper, abstract), realized range (Christensen–Podolskij 2005 and the DAX realized-range study, abstracts), options-implied information (2026 preprint, full text); plus HARQ (Bollerslev, Patton & Quaedvlieg 2016, from the wider literature, not in the library) |
| Baseline | The calc behind the live QLIKE export per line: `js/ladderV2QlikeParams.json` (futures: HARCJ on every line) and `js/ladderV2QlikeCfdParams.json` (CFD: HARCJ, except R15 on OH and Close+) |
| Data | Gold, `analysis/output/ladder-per-line/build/gold/rows_{F,C}.parquet` (GC NT8 continuous futures = F, OANDA XAU_USD = C), plus 5-minute bars built from the same M1 files (`ratio` adjusted, as the existing RV features). Test years 2020 → 2026-08-21 (lockbox respected); training is every year before the test year |
| Seed | `20261126` |
| Uncertainty | 63-session block bootstrap, B = 2000, 90% CI (same as `ladder-qlike-per-line-*`) |
| Scripts / outputs | `scripts/gold-calc-upgrades/` → `analysis/output/gold-calc-upgrades/` |
| Live impact | **None.** The live QLIKE export and its params files are not touched by this study, whatever the verdict |

## 1. Claim

At least one of the new gold calcs gives a lower out-of-sample QLIKE than the export's current calc on Jordan's lines
(HL, Close+, Close−), on the futures, in both halves, and leans the same way on the CFD.

## 2. The arms

All arms forecast the next NY-close day's 5-minute realised variance from information available before the London
session opens (features of NY days strictly before the session date, `asof_before`). Every regression is refit once per
test year on data whose target day is before 1 January of that year (as `ladder.walk_forward`). Each arm's σ is then
scaled to each line with the existing walk-forward line scale (`h_series`) and scored with the existing per-line QLIKE
(`scripts/ladder-qlike-per-line-cfd/race.py`), so the only thing that changes is the σ series.

| Arm | What it adds | Source |
|---|---|---|
| **N1 HARQ** | HARCJ plus yesterday's continuous part × relative quarticity (√RQ / RV, demeaned): yesterday is trusted less when it was measured noisily | Bollerslev–Patton–Quaedvlieg 2016 |
| **N2 QL-HARCJ** | HARCJ's own features, fitted by minimising QLIKE instead of OLS on logs | "Coherent Forecasting of RV" 2025 |
| **N3 SESS** | yesterday's RV split into Asia (17:00–02:00 NY), London (02:00–08:00 NY) and New York (08:00–17:00 NY), each its own log term, plus 5-day and 22-day terms | G7 overnight/session result, gold's separate Asian session |
| **N4 FRESH** | HARCJ plus the log RV of the bars between the previous NY close and London midnight (the hours just before the session opens) | freshest information before the open |
| **N5 RR** | HAR on the 5-minute realized range (Σ (ln H − ln L)² / 4 ln 2): 1-, 5- and 22-day terms | Christensen–Podolskij; realized range |
| **N6 HARCJ-IV** | HARCJ plus log of GVZ daily variance as a regressor | HAR-IV (options-implied information) |
| **N7 ALL** | every feature above in one regression, fitted by QLIKE | combination |
| **V3, V4, B_har_iv** | the existing GVZ arms (scaled IV, raw IV, 50/50 HAR+IV), re-raced here because the export picks excluded them as "not site-computable" (`NO_SITE`), not because they scored worse | already built |

N3 and N4 need 5-minute bars with a timestamp; they use the same 5-minute closes as the RV features. GVZ is read as of
the CBOE close strictly before the session date (the existing `iv` column).

## 3. Hypotheses and gates

**Primary metric**, per arm: % change in mean QLIKE, arm vs export calc, summed over HL + Close+ + Close− (each
line's days; Close+ only on up days, Close− only on down days, as the race), futures track, test 2020 → 2026-08-21.
Negative = better.

- **P1** (one per arm, 10 arms): the futures primary metric < 0.
- **VALIDATED** if, for that arm:
  1. the 90% CI is entirely below 0;
  2. it survives BH q = 0.10 over the 10 arms (one-sided bootstrap p);
  3. both halves (2020–22, 2023–26) have a negative point estimate;
  4. the CFD track has a negative point estimate (replication on OANDA's own prices).
- **NULL** if the CI's lower end is above −0.5% (an improvement of 0.5% or more is ruled out).
- Otherwise **UNDERPOWERED**.

**Descriptive (no verdict):**
- each line separately, including OH, OL and OC, both tracks;
- hit rates at P50 / P75 / P90 for the best arm vs the export calc (calibration must stay near 50 / 25 / 10);
- quiet vs busy days (A0 relative to its 250-day median, tercile split) for the best arm;
- median line gap Median → P75 in dollars, all years and 2025–26, best arm vs export calc;
- coefficients of each regression arm in the last fit year.

**Positive control:** my re-implementation of HARCJ must reproduce the existing `HARCJ` σ in the walk-forward table
(max relative difference < 1e-6) before any new arm is scored. Negative control: an arm made of HARCJ plus a regressor
of pure noise (seeded) should score within ±0.3% of HARCJ.

## 4. Power

Earlier per-line races on gold (`ladder-qlike-per-line-fut`, `ladder-wide-race`) separated arms by 1–4% QLIKE with
single-instrument CIs about ±1.5%. So a 2% improvement should be detectable; below ~1% will likely be UNDERPOWERED.
The literature's typical gains for these upgrades are 2–10%, mostly on equity indices.

## 5. What each verdict changes

- **VALIDATED:** the arm goes into a **shadow** gold export beside the live one (side by side, no live change), with a
  forward score from the first session after it ships. The live QLIKE export only changes after the forward score
  agrees and the owner says so.
- **NULL / UNDERPOWERED:** the export stays as it is. The result is recorded as evidence about which upgrades don't
  help gold, with graded weight.
- Whatever the verdict for V3/V4/B_har_iv, report whether GVZ is now available live (`_ivGvzLatest`), so "not
  site-computable" can be re-checked as a separate decision.

## Amendments

- **A1, 2026-11-26, PRE-RESULTS (set in the code before the first run).** N4's regression target is the RV of the
  NY day *after* London midnight (the hours FRESH reads are taken out of the target), so the fit can't credit the
  feature with variance it contains itself. All other arms keep the full NY-day target. Because each arm is rescaled
  to every line, the target's level doesn't matter.
- **A2, 2026-11-26, POST-HOC (results seen), descriptive only.** Run because the N4 gain was large:
  - a lookahead audit of the FRESH window (`scripts/gold-calc-upgrades/decompose.py`);
  - a control with the target alone (HARCJ features with N4's target, +0.15%);
  - FRESH with the full target (−7.5%) and FRESH + IV by OLS (−7.9%);
  - the split by weekday and by year, the concentration of the gain, and the top days.
  None of this changes a verdict.
- **A3, 2026-11-26, FAULT FIX (results seen).** The FRESH feature was floored at 0.01 × the realised variance of the
  NY day being forecast. That's lookahead, and it applied on 46% of days. The floor is now 0.001 × the previous day's
  RV, known before the session, and applies on 0.7% of days. N4 and N7 were re-run and the verdicts re-read under the
  unchanged gates:
  - FRESH −6.92% → −1.16% (still VALIDATED);
  - N7 −8.84% → −4.26% (still VALIDATED).
  The other arms don't use the feature and are unchanged. Found while porting the feature to the site.

## RESULTS

Verdicts and numbers: `analysis/output/gold-calc-upgrades/RESULTS.md` (banked 2026-11-26).
- VALIDATED (corrected, A3): N7 ALL −4.26%, N6 HARCJ+IV −2.81%, V3 −1.76%, N4 FRESH −1.16%, N1 HARQ −0.42%.
- NULL: N2 QLIKE fit.
- UNDERPOWERED: the others.
