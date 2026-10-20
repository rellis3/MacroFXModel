# rates-vol-gap — Does rates implied vol (MOVE) tell us anything about coming Nasdaq volatility that Nasdaq's own implied vol, its recent realised vol and the release calendar do not?

**Pre-registered 2026-10-21, before any outcome was computed.** (The only outcome-touching code run so far is
`scripts/rates-vol-gap/power.py`, which scores the signal circularly shifted by ≥ 126 sessions — the control, as the
template allows for §5. It never computes the real-alignment statistic.)

| | |
|---|---|
| ID / ledger id | `rates-vol-gap-move` (C1), `rates-vol-gap-state` (C2) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `rates-vol-gap` |
| Data | NAS100 (OANDA M1 → 17:00 New York sessions, n ≥ 60), ICE BofA MOVE (Yahoo `^MOVE` daily close), Cboe VXN daily close, US release calendar (`load_calendar`, both files). Sessions 2016-01-04 → **2026-08-20** (M1 ends 2026-08-20 23:59 UTC; lockbox from 2026-08-21) |
| Seed | `20261021` |
| Uncertainty | moving-block bootstrap, block 21 sessions, B = 2000; plus a circular-shift placebo (400 shifts, ≥ 126 sessions) |
| Scripts / outputs | `scripts/rates-vol-gap/` (`build.py`, `common.py`, `power.py`, `score.py`) → `analysis/output/rates-vol-gap/` |
| Harness | own script: a daily regression design that `runStudy.mjs` does not cover |

## 1. The claim

C.OG, *Cross Asset Volatility Analysis* (Colez Trades, Issue 07, 21 Apr 2026; verbatim in
`education/cross-asset-volatility-analysis/PAGE_TEXT.md`). Reading SR3, TN and NQ options on one day, he found rates
vol "paying up for specific identifiable scenarios the equity options market is not pricing at all" — the 2-year
yield CVOL up 4.38 to 103.87 and SR3 skew near its 90th percentile, while NQ ATM vol sat at the ~30th percentile of
its own month. His modal reading (Scenario B, 45%): "SR3 is right, NQ is asleep … the equity complex is under-hedged
for an event that rates are clearly pricing", with the expected consequence that NQ realised vol comes in above what
NQ options price. He calls it "not predictive — three observations do not make a pattern" (2007, Q4 2018, early
2020) and lists data mining as failure mode #5.

Our translation (this step is ours): if rates implied vol carries information about equity risk that equity implied
vol is missing, then **MOVE should improve a forecast of Nasdaq realised vol that already contains VXN**, and most of
all on days when MOVE is high against its own year while VXN is low against its own year.

## 2. Why it is not already settled

- `yield-move-fx-range` (NULL), `front-end-shock` (NULL), `curve-inversion` (NULL), `growth-vs-yields` (context):
  all measure what yields **did** (levels, moves). None uses rates **implied vol**. `MD files/CLIP_WATCH.md`
  (2026-10-02) recorded exactly this gap — "the desk has tested what yields did and never what the market was paying
  for protection against them doing it" — and left the bond-vol → range prereg open. This is that test, on equities.
- `rates-vol-news-timing` (CONTEXT): the 2h vol gain from intraday rate *moves* vanished with a release calendar in
  the baseline. That was realised rate moves at 15m; this is implied rate vol at daily, with the calendar in the
  baseline from the start.
- `nbfi-rates-vol` (UNDERPOWERED): predicted Treasury vol, not equity vol.
- `vix-inversion` (VALIDATED, range): equity implied vol's own term structure. Here equity implied vol is the
  baseline, and the question is what rates vol adds to it.
- IV-from-settlements (`oi_research_book/IV_FORECAST_PREREG.md`): implied vol beats realised-vol forecasts 7/7. That
  is why VXN is in the baseline: the bar is "beyond implied vol", not "beyond realised vol".

## 3. Definitions, fixed in advance

- **Session D**: a NAS100 17:00 New York bar (M1 from 17:00 on D−1 to 16:59 on D), weekdays, n ≥ 60 minutes.
  Parkinson variance `pk = ln(H/L)² / (4 ln 2)`.
- **Signal (known at the D close)**: `mp` = percentile rank of MOVE's close in its trailing 252 sessions (incl. D);
  `vp` the same for VXN. MOVE and VXN are taken as the last print ≤ D (none stale > 5 days in the panel).
- **Outcome**: `y_h = ln(mean pk over D+1 … D+h)`. Primary h = 1; descriptive h = 5, 21.
- **Baseline (known at D or scheduled in advance)**: `ln VXN_D`, `vp_D`, `ln pk_D`, `ln mean pk(D−4…D)`,
  `ln mean pk(D−21…D)`, counts of FOMC decision, CPI and NFP days in D+1 … D+h; for h = 1 also the weekday of D+1.
- **Exclusions (fixed on bar counts, not outcomes)**: rows whose outcome window contains a session with < 1,000
  minutes (holiday / half sessions); the first 252 + 22 sessions (warm-up).
- **C1 statistic**: partial correlation of `mp` with `y_h` after both are residualised on the baseline (OLS,
  Frisch–Waugh), fitted within the sample being scored.
- **C2 statistic (one-leg matched)**: among equity-cheap days (`vp ≤ 0.40`), the mean baseline residual of `y_h`
  (log units) when rates vol is rich (`mp ≥ 0.70`) minus when it is not. Matching on the equity leg is required:
  the power run showed that `vp` low alone carries a negative residual (placebo mean −0.10 to −0.15 before matching,
  ~0 after).
- **Control / placebo**: the same statistic with `mp` circularly shifted by k ∈ [126, n−126] sessions (400 draws).
- **Sample split**: Explore 2016-01-04 → 2020-12-31, Confirm 2021-01-01 → 2026-08-20. Pooled is the scored sample
  (the halves are underpowered alone, §5); the halves are a sign-consistency check.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| C1 | Does MOVE's percentile add to next-session Nasdaq realised vol beyond VXN, VXN's percentile, realised vol and the calendar? (h = 1, pooled) | **Null.** Prior: implied vol is hard to beat; every rates→Nasdaq vol test so far came back empty once news timing was in the baseline. If anything, a small positive (≤ +0.05). |
| C2 | On equity-cheap days, is the next week (h = 5) busier than baseline when rates vol is rich than when it is not? | **Null, and UNDERPOWERED by design** (§5). Recorded so the lesson's own setup is on file. |
| **THE GATE (C1)** | VALIDATED only if all hold: pooled 95% bootstrap CI > 0; partial corr ≥ +0.05; real statistic above the 95th percentile of the shift placebo; positive point estimate in **both** halves | |
| **THE MIRROR** | Equity rich, rates cheap: among `vp ≥ 0.70` days, `mp ≤ 0.30` vs `mp > 0.30` | Descriptive. If the mirror is as large and the same sign, the C2 effect is "any vol disagreement", not rates leading equities |
| Verdict rules | C1 NULL if the pooled CI's upper bound < +0.10 (the smallest useful effect); UNDERPOWERED if the CI covers both 0 and +0.10; C2 UNDERPOWERED unless its CI excludes 0 | |

## 5. Power — what this design can and cannot find

From `analysis/output/rates-vol-gap/power.json` (control only: shifted signal, 400 draws; SE = SD of the placebo
statistic, which includes the regressor's persistence; MDE = 2.8 × SE).

| Cell | n sessions | state / cheap days | Placebo mean | SE | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| **C1 h1 pooled (scored)** | 2,480 | — | −0.002 | 0.038 | **0.105** | 0.10 (smallest useful) | **POWERED, marginally** (~75% at the bar) |
| C1 h1 Explore / Confirm | 1,032 / 1,448 | — | −0.025 / −0.005 | 0.050 / 0.084 | 0.14 / 0.24 | sign only | sign check |
| C1 h5 pooled | 2,424 | — | −0.004 | 0.065 | 0.18 | 0.10 | UNDERPOWERED → descriptive |
| C1 h21 pooled (the lesson's horizon) | 2,222 | — | −0.005 | 0.096 | 0.27 | 0.10 | UNDERPOWERED → descriptive |
| **C2 h5 pooled (scored)** | 2,424 | 203 / 1,002 | −0.004 | 0.103 | **0.29 log** (≈ +33% vol) | 0.15 log | **UNDERPOWERED by design** |

The lesson's horizon (weeks) and its exact state (rates rich, equity cheap: 8.5% of days) cannot be judged on ten
years of daily data. The design can judge one thing: whether MOVE carries next-day equity vol information that VXN
lacks, at an effect of about 0.10.

## 6. Multiplicity

- Scored cells: C1, C2. Holm at α = 0.05 over the two (p from the bootstrap CI via `pFromCI`). C1's gate is also
  conjunctive (halves, placebo).
- Descriptive (no pass/fail weight): C1 at h5/h21 and per half; the mirror; MOVE level instead of percentile;
  per-year and without 2020 / 2022; FOMC-window interaction (`mp × fomc5`); NQ settlement iv30
  (`oi_research_book/data/iv_daily_nas100_usd.parquet`, 2020-09 → 2026-09) in place of VXN.
- Promotion to anything live (range lines, risk gate weights) needs |t| ≥ 3 on C1.

## 7. What this does NOT test

- **Direction.** Nothing here says which way Nasdaq goes. The lesson does not claim it either.
- **SR3 options themselves** (skew, butterfly, term-structure steps). We hold no SR3 options history; MOVE is
  Treasury 1-month implied vol, a proxy for TUVY, not for SR3 skew. A Databento SR3 options pull would be needed.
- **Tradability** of long-NQ-convexity structures (his failure mode #6): no options P&L, no costs.
- **The rate-leg spread on cog-chart.html.** That is futures prices; this is implied vol. A pass here would make a
  rates-vol readout worth showing next to the line, not the line itself predictive.
- **Cause.** MOVE and VXN share macro shocks; a pass says "information", not "rates lead equities".

## 8. What each verdict changes

- **VALIDATED (C1)**: MOVE percentile becomes a candidate input for the NQ range forecast (shadow only, side by side,
  never editing live calcs), and a "rates vol vs equity vol" readout earns a place on the rates page with the
  number. The 0.6 `movePercentile` weight in the COG risk gate gets its first evidence row.
- **NULL (C1)**: the today.html "rate vol high, equity vol calm" divergence and the risk-gate `movePercentile`
  component are recorded as untested-folklore-now-tested-null; the readout stays context-only. Equity implied vol
  already carries what rates implied vol knows, at a day ahead.
- **UNDERPOWERED**: say so; the next step is more history (VXN from 2009 with a second Nasdaq source) or the SR3
  options data, under a new prereg.
- C2 in every case: on file as UNDERPOWERED unless its CI excludes 0, in which case it is a candidate for its own
  prereg on fresh data, never a result.

## Amendments

(none yet)

## RESULTS

(not run)
