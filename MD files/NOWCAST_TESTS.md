# Nowcasts as the third number — pre-registered tests

*Registered 2026-09-19, before running. Verdicts appended below the line.*

Every release line on the desk carries two numbers: consensus and, now, the
actual. Institutions carry a third — a model's live estimate of the number
before it prints. Two are free and published daily by the Fed system itself:

- **Cleveland Fed inflation nowcast** — daily estimate of the current month's
  CPI, core CPI, PCE and core PCE (m/m), history from 2013-07, updated each day
  from oil, gasoline and the prior prints. Source: the chart JSON behind
  clevelandfed.org/indicators-and-data/inflation-nowcasting.
- **Atlanta Fed GDPNow** — running estimate of the current quarter's real GDP
  growth (annualised), every vintage on FRED/ALFRED as `GDPNOW` since 2011.

The claim worth testing is not "the nowcast is accurate" (both banks publish
that). It is the desk claim: **when the nowcast sits above the consensus, the
print is more likely to beat than to miss** — i.e. the *gap* between the third
number and the second carries the sign of the surprise.

## N1 — Cleveland inflation nowcast vs consensus → surprise sign

- **Sample:** every US `CPI m/m`, `Core CPI m/m`, `Core PCE Price Index m/m`
  release in the ForexFactory archive with a consensus, 2013-08 → 2025-04.
- **Nowcast:** the last daily nowcast value dated strictly *before* the
  release day, for the reference month (the chart for that month).
- **Consensus, actual:** ForexFactory `estimate`, `actual` (1dp strings).
- **Signal:** `gap = nowcast − consensus`. A call is made when `|gap| ≥ 0.05`
  (half a printed tick); otherwise "no call".
- **Outcome:** `sign(actual − consensus)`; an in-line print (actual = consensus)
  is neither a hit nor a miss and is dropped from the hit rate but reported.
- **Statistics:** hit rate with a 95% binomial interval; hit rate by gap size
  (≥0.05, ≥0.10, ≥0.15); MAE of nowcast vs actual against MAE of consensus vs
  actual (is the third number a better forecaster than the second?).
- **Pass:** n ≥ 40 calls and the interval's lower bound > 0.50 on CPI m/m. Core
  CPI and core PCE reported the same way; each passes or fails on its own.
- **Falsifier:** hit rate interval includes 0.50, or the nowcast's MAE is worse
  than the consensus's (then the gap is noise around a worse forecast).

## N2 — GDPNow vs consensus → surprise sign on Advance GDP

- **Sample:** every US `Advance GDP q/q` in the archive, 2011-Q3 → 2025-Q1
  (~55).
- **Nowcast:** the last GDPNow vintage published *before* the release day
  (ALFRED `realtime_start < release day`), for the quarter being reported.
- **Signal, outcome, statistics:** as N1, with the call threshold `|gap| ≥ 0.2`
  (GDP prints to 1dp on an annualised rate; the consensus spread is wider).
- **Pass:** n ≥ 40 calls, interval lower bound > 0.50. Falsifier as N1.

## What a pass changes on the page

The calendar line for a covered release gains the third number in words:
*"consensus 0.3% — the Cleveland Fed's live model says 0.43%: on this desk's
record the print beat when the model sat above consensus 6x% of the time
(n=…)."* A fail leaves the number as context only ("the model says 0.43%")
with no direction attached. Either way it is a base rate with an interval,
never a trade.

---

## Results (run 2026-09-19; design frozen above before running)

Harness `analysis/nowcast_studies.mjs`; output `analysis/output/nowcast_studies.json`.

**N1 — NULL.** 140 CPI m/m releases 2013-08 → 2025-04, 139 with a nowcast the
day before. Calls at |gap| ≥ 0.05: **23 of 43 right = 53% [39–68]**; at ≥ 0.10,
8 of 19 = 42%. And the model is the *worse* forecaster: nowcast MAE 0.105 vs
consensus 0.086. Core CPI the same shape (54% [38–70], MAE 0.105 vs 0.087);
core PCE 54% [34–74] on 24 calls with MAE 0.064 vs 0.043. A quarter of calls
landed on an in-line print. The gap between the Cleveland model and the street
is noise around a forecast the street already beats.

**N2 — insufficient, direction noted.** ALFRED's GDPNow vintages only start
2016-05, so 35 of the 73 advance prints match (30 decisive calls). Hit rate
**20 of 30 = 67% [50–84]**, rising with the gap (16/24 at ≥0.4, 14/18 = 78% at
≥0.6) — but GDPNow's MAE is worse than the consensus's (0.82 vs 0.69) and n is
under the bar. Not a pass. The Atlanta Fed's own history workbook would give
~55 releases; it sat behind an HTML interstitial when fetched, so this is queued
rather than forced.

**What shipped.** As the pre-registration said: the third number as context,
never a direction. `/api/nowcast` (daily) carries the Cleveland month values and
GDPNow; the calendar row for a covered US release shows *"model 0.43%"* with the
verdict in the hover, and the timeline's ahead lines say *"Cleveland Fed model
says 0.43%"* next to the consensus. Nothing leans on it.
