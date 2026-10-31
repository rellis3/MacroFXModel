# residual-pca-family — does the micro bank's residual-reversion system work on a wider basket, on indices, or under news / month-end / COT conditions?

**Pre-registered 2026-10-31, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `residual-pca-wide10` (the one scored cell); `residual-pca-news`, `residual-pca-monthend`, `residual-pca-cot`, `residual-pca-idx6` (described, underpowered by design, §5) |
| Branch | `ccr-829ef092-pdoasn` |
| Register row | `plans/RESEARCH_REGISTER.md` → `residual-pca-family` |
| Data | 17:00 New York daily closes (OANDA M1 via `analysis/output/dynlead/assets_daily.parquet`; XAGUSD from OANDA M15 `analysis/output/rates_residual/m15/XAG_USD.parquet`, clock checked against M1 gold: identical closes on 2,229 days). FX majors, gold, 6 index CFDs 2016-01-04 → 2026-08-20; silver 2018-01-02 → 2026-08-20. Ends before the lockbox (H-A starts after 2026-08-21). Panel: `analysis/output/residual-pca-family/panel_daily.csv` (`scripts/residual-pca-family/build_panel.py`) |
| Seed | `20261031` (every script) |
| Uncertainty | date-block bootstrap, block 21 sessions, B = 2000; Newey-West (5 lags) t for daily IC series |
| Scripts / outputs | `scripts/residual-pca-family/` → `analysis/output/residual-pca-family/` |
| Harness | own script (`engine.py`): the q1 loop generalised; it reproduces the banked q1 run exactly on q1's own closes (K 2, IS IC −0.0012, OOS IC 0.0271, t 2.11, OOS net Sharpe 0.468; `repro_q1.py`) |

## 1. The claim (required)

Source: C.OG's Micro Learning Bank, Series 05 q1 "Mean Reversion of Residuals"
(`education/bank-verbatim/micro-learning-bank/build.md`): on a rolling window, take the leading
principal components of a basket's returns as the common drivers, strip them out, and lean against
each instrument's displacement from its own residual average, factor-neutral. The owner asked
(2026-10-30/31) which systems can be built from the micro bank plus the rest of C.OG's education.
This family tests five follow-ups proposed in that conversation:

- **T1 news** (Series 01 lessons 3–4, market efficiency): displacements built on scheduled news carry
  information and should revert *less* than displacements built on no-news days.
- **T2 month-end** (`theory-lab/lessons/fx-fixings-wm-reuters.html`; `forecast-miss-month-end-fx`):
  month-end fix flows are non-informational, so a displacement measured at the month-end close
  should revert *more*.
- **T3 COT crowding** (`cot-crowding-p5`; the COT lessons): a displacement in the same direction as
  an extreme speculative position should revert *more*.
- **T4 wide basket**: a Discord member (Chris, 2026-10-30) runs this model on a demo account with
  metals in the basket (trade comments `PCA_z…`). Does the model work on FX8 + gold + silver?
- **T5 indices**: the same model on six index CFDs.

## 2. Why it is not already settled (required)

- The nearest entry is the q1 test itself (`education/residual_pca_currency_test/RESULTS.md`,
  2026-09-22): FX8, IC −0.001 in 2016–21 and +0.027 (t 2.11) in 2021–26, FAIL under its own
  both-halves rule. It is not in `js/deskEvidence.js` (it predates the protocol); this family banks
  alongside it. Its own RESULTS says any other variant on this history "is a new test, needs its
  own pre-registration, and counts against the multiple-testing budget: this was test #1". This
  family is tests #2–#6.
- T1–T3 condition the *same* FX8 signal, so they are not independent of q1. They ask whether a
  pre-specified subset carries the edge in **both** halves (q1 failed exactly there). Picking a
  subset after seeing q1's split would be the post-hoc regime story q1 forbade; these subsets come
  from mechanisms named in the education, fixed here, and each must hold in both halves.
- `cot-positioning-factor` (null), `cot-crowding-p5` (validated, crowded-trend pullback) and
  `cot-extreme-aftermath` (exploratory) are about COT and price direction, not about residual
  displacements. `fx-factor-book-v2` (underpowered) and `trend-following-fx` (null) are factor
  books, not residual books. No index or metals residual test exists.

## 3. Definitions, fixed in advance (required)

**The model (all tests, unchanged from q1).** Universe returns r (log, close-to-close); x = r minus
the equal-weight cross-sectional mean. Per signal day t, window = the 120 rows ending at t:
standardise, correlation PCA, K leading components, residual path = cumsum of the residuals,
displacement `disp[t,i]` = its z-score. Outcome `e[t,i]` = the residual of x[t+lag] with loadings,
mean and sd frozen at t, in residual-sd units (nothing after t enters the signal). Score
`s[t,i] = −disp[t,i] · e[t,i]` (positive = moved back toward home). Daily IC = cross-sectional
correlation of −disp with e. Book: target −disp, dead band 0.2, cap 1.5, ÷ window sd, project out
the K factor exposures and the basket, gross 1, costs = turnover × one-way cost.

**K.** The q1 rule: per IS window, count leading components above the 95th-percentile noise band
(500 noise simulations, same procedure, seed 7 as in q1); K = the median count over IS windows.
Computed separately per universe; never chosen by outcome.

**Universes.**

| Universe | Instruments | Rows |
|---|---|---|
| fx8 (T1–T3) | USD EUR GBP AUD NZD JPY CAD CHF (currency vs USD; USD = 0) | 2016-01-05 → 2026-08-20 |
| wide10 (T4) | fx8 + XAU + XAG (metal vs USD) | 2018-01-03 → 2026-08-20 |
| idx6 (T5) | NAS100 SPX500 US30 US2000 DE30 UK100 (local-currency CFD returns) | 2016-01-05 → 2026-08-20 |

Rows where any instrument in the universe is missing are dropped before returns are taken (as in
q1). Silver is the reason wide10 starts in 2018. NOK, which Chris also trades, has no synchronised
history in the repo, so it is out (§7).

**Lag.** lag = 1 for fx8 and wide10 (q1). **lag = 2 for idx6**: DAX and FTSE futures stop at
16:00 ET, so a 17:00 ET CFD close can be up to an hour stale, and a stale close catches up the next
day, which would look exactly like residual reversion. Skipping a day (signal at close t, outcome
t+1 → t+2, the book trades a day late) makes that artefact impossible.

**Costs** (round trip, % of price): house table `js/perLineStrategy.js` PAIR_COST_PCT
(EUR 0.008, GBP 0.010, AUD 0.011, NZD 0.013, JPY 0.009, CAD 0.011, CHF 0.011, XAU 0.020; NAS100
0.008, SPX500 0.008, US30 0.010, US2000 0.015, DE30 0.012, UK100 0.015). XAG has no house entry:
**0.08%**, fixed here.

**Tags** (inputs only; `scripts/residual-pca-family/tags.py`), on the signal day t:

- `news[t,c]` = a ForexFactory **high-impact** event for currency c on the calendar date of t or of
  the previous row (`forge/ff_calendar.py` repaired dates; FF history downloaded 2026-10-31 from
  the MIT dataset that module names). Coverage ends 2025-04-07, so T1 uses t ≤ 2025-04-04.
  Tagged share: USD 0.80, GBP 0.49, CAD 0.45, AUD 0.43, EUR 0.28, NZD 0.25, JPY 0.10, CHF 0.08.
- `monthend[t]` = t is the last row of its calendar month (128 days).
- `crowd[t,c]` = +1 / −1 / 0 when the CFTC speculative net share of OI (USD = ICE dollar index) sits
  at a prior-only 3-year percentile ≥ 90 / ≤ 10 (`_rank_prior` from
  `scripts/cot-crowding-programme/panel.py`). Known from report_date + 3 days. Signal days in the
  shutdown backlogs (2018-12-21 → 2019-03-08, 2025-10-01 → 2026-01-31) excluded.
  **Aligned** = crowd ≠ 0 and sign(disp) = crowd (stretched the way the crowd leans).
  **Neutral** = crowd = 0.

**Statistics.**

- T4, T5: mean daily IC per half; full-sample NW-5 t → one-sided p.
- T1–T3: within-instrument contrast
  `D = Σ_c n_A,c (mean s | A,c − mean s | B,c) / Σ_c n_A,c`, with A/B = untagged/tagged (T1),
  month-end/other (T2), aligned/neutral (T3). SE from the date-block bootstrap; one-sided p from
  the normal approximation (`pFromCI` style).

**Sample split.** Signal days split in half chronologically within each universe's scored span
(as q1). IS = first half, OOS = second half.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| T4 | wide10 daily IC > 0 in both halves, full-sample p ≤ 0.05 | **Null more likely than not** (q1's FX8 failed IS; metals add one component's worth of new residuals). If real, IC ≈ +0.02 to +0.03 |
| T1 | D (no-news minus news) > 0 | Yes, small (≈ +0.02) |
| T2 | D (month-end minus other) > 0 | Yes, but not findable here (§5) |
| T3 | D (aligned minus neutral) > 0 | Yes, small |
| T5 | idx6 daily IC (lag 2) > 0 | Null more likely (three of six are US large caps; one or two components take almost all of it) |
| **THE GATE (T4, scored)** | IC > 0 in IS **and** OOS **and** full-sample one-sided NW-5 p ≤ 0.05 | |
| **Candidate gate (T1–T3, described)** | D > 0 in both halves, nominal one-sided p ≤ 0.05, **and** mean s in set A > 0 in both halves | |
| **Candidate gate (T5, described)** | as T4's gate | |
| **THE MIRROR** | T1–T3: the complement sets (news / other days / counter-crowd = crowd ≠ 0 with disp against it) reported beside A; T4/T5: the bucket table (extremes must carry the reverting sign) | |

Secondary, reported for every test, not part of any verdict: the book's net Sharpe (and at 2×
costs) per half; for T1–T3 the book with targets zeroed outside set A (`mask`).

## 5. Power — what this design can and cannot find (required)

From the control only (`analysis/output/residual-pca-family/power.json`): fx8 unconditioned,
21,088 obs over 2,636 days, sd(s) 1.045, date-cluster design effect 1.42, mean s +0.018; daily IC sd
0.462 on fx8 (synthetic nulls 0.448 / 0.376 / 0.573 for 8 / 10 / 6 instruments, scaled by the
real-to-synthetic ratio 1.03). MDE at 80% power, one-sided α = 0.01 (Holm's first step had all five
been scored):

| Cell | Planned n | SD | Design effect | MDE (α 0.01) | MDE (α 0.05) | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| T4 wide10 IC | 2,107 days | 0.388 | NW | 0.027 | 0.021 | 0.03 | **POWERED** |
| T5 idx6 IC (lag 2) | 2,539 days | 0.591 | NW | 0.037 | 0.029 | 0.03 | UNDERPOWERED at α 0.025 (0.033) |
| T1 news D | 11,786 / 6,454 obs | 1.045 | 1.42 | 0.061 | 0.048 | 0.05 | UNDERPOWERED once scored with anything else |
| T2 month-end D | 984 / 20,104 | 1.045 | 1.42 | 0.129 | 0.101 | 0.05 | **UNDERPOWERED by design** |
| T3 COT D | ~2,270 / 15,422 | 1.045 | 1.42 | 0.089 | 0.070 | 0.05 | **UNDERPOWERED by design** |

Pass bars: IC 0.03 (q1's OOS +0.027; the lesson's simulated example ±0.04–0.08); D 0.05 (about
three times the unconditioned mean s, roughly the size a filter must add to change a book's net
Sharpe sign after costs).

**Decision taken here:** scoring T4 alone (α 0.05) is the only family in which every scored cell is
powered (adding T5 drives its MDE to 0.033; adding T1 drives T1's to 0.054). So **T4 is the one
scored cell**, and **T1, T2, T3 and T5 are run in full as descriptions**: each is banked
`underpowered` whatever it shows, and one that clears its candidate gate is written up as a
candidate for a forward pre-registration, never as a result.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** T4 only. One scored cell, no correction; the both-halves conjunction is on top.
- **Descriptive cells:** T1, T2, T3, T5 candidate gates, at nominal α 0.05, with a chance baseline
  (4 cells × 0.05 ≈ 0.2 expected false candidates).
- **Disaggregation:** per-instrument IC / contrast and IC by year, BH q = 0.10, candidates only.
- **Decomposition (owner's rule 2026-10-27), pre-registered:** for every test, the five-bucket table
  of e by displacement (q1 slide 28), per-instrument IC, IC by year, and a date-scramble placebo
  (e shuffled across signal days, 200 draws) for T4/T5; a circular tag-shift placebo (200 random
  offsets ≥ 60 rows) for T1–T3, whose D distribution must centre near zero.
- **Promotion bar:** |t| ≥ 3 on T4 before anything sizes real money; a pass at |t| < 3 is
  research-only and goes to a forward record.
- **Trial count:** this family adds 5 tests to the residual-PCA line (q1 = 1, total 6).

## 7. What this does NOT test (required)

- NOK and the exact basket Chris runs (no synchronised NOK history here); his entry clock (his
  orders went in at 15:32 UK, ours are at the 17:00 ET close); any parameter other than the
  lesson's.
- Swap/carry P&L (spot returns only, as q1). At ~2% annual vol the book needs leverage, where
  financing matters.
- Intraday execution, slippage beyond the house cost table, capacity.
- Cause: a T4 pass says the residuals of this basket reverted in both halves, not why.
- The lockbox period (after 2026-08-21) and anything after: untouched.

## 8. What each verdict changes (required)

- **T4 VALIDATED** → ledger `residual-pca-wide10` validated (research-only unless |t| ≥ 3); the
  frozen wide10 model goes to a forward record (paper) with the pass bar set in its own prereg; the
  education page on q1 can say "worked on FX + metals 2018–2026 in both halves".
- **T4 NULL** → ledger null; the line "adding metals fixes q1" is not said anywhere; q1's honest
  next step (forward-track the frozen FX8 model) stays the only route.
- **T1, T2, T3, T5** → banked `underpowered` (by design). A candidate goes in
  `plans/MISC_STUDIES.md`-style notes inside RESULTS.md as an input for a forward prereg (the only
  fresh data is the future); a non-candidate closes that conditioning on this history.

---

## Amendments

*(none)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/residual-pca-family/RESULTS.md`. Nothing above this line changes
after the run.*
