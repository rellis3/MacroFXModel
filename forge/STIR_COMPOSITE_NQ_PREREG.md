# STIR-COMPOSITE-NQ: do composite US−EU short-rate spreads lead Nasdaq by hours (divergence catch-up / confirmed turn)?

*Pre-registered 2026-10-10 while the IBKR strip pull was running, before any composite series was built or plotted
beyond the single week in `analysis/output/cog_video_0918/`. Source: C.OG's video "Macro Variable Context Relevance"
(16–23 Sep 2026) and his Discord note that the line is SOFR (US leg) vs ICE €STR (EU leg), built in Python. Two claims
in the video were NOT covered by the earlier grid (`plans/RATE_DIFF_NQ_LEADLAG_PLAN.md`, lags 1–60 min and 1–20 days,
straight-line correlations):*

- *H-A, divergence catch-up: the spread drifts for hours while Nasdaq sits flat, then Nasdaq catches up (Mon 21 Sep,
  02:15 → 14:15 UK).*
- *H-B, confirmed turning point: the spread makes a low, confirmed ~45 min later, and Nasdaq turns the same way
  within 1–2 h (Fri 18 Sep, low 16:00 UK, confirmed 16:45, Nasdaq low 17:15 UK).*

*The rebuild of that week from our data matched Monday (both US−EU spreads +2.5 / +5 bp through Nasdaq's flat spell,
then flat at the break; the move came from the euro leg) and roughly matched Friday (spread lows 15:15 UTC, Nasdaq low
16:00 UTC). One week is a hypothesis, not evidence; this file fixes the test.*

## Data

- **Rates, 1-min MIDPOINT from IBKR** (`analysis/output/stir_1m/`): SOFR 3m (`SR3` U6 Z6 H7 M7 U7), €STR 3m (ICE `ER3`
  U6 Z6 H7 M7 U7), Euribor 3m (ICE `I` Z6 H7 M7 U7), US 2y (`ZT` U6/Z6), German 2y (`FGBS` Sep26/Dec26).
  Rate = 100 − price. The U6 contracts (Sep–Dec 2026 period) are live until mid-Dec 2026, so they cover the whole window.
- **Nasdaq:** CME NQ futures 1-min MIDPOINT (`stir_1m/CME_NQM6/U6/Z6`, front = roll 7 days before expiry, returns
  within one contract only). Not the OANDA CFD he charts: the research copy of that
  (`VolRangeForecaster/data/m1/nq_m1.parquet`) ends 2026-08-20 and the bars after it are the lockbox of
  `forge/INTRADAY_EXTREME_PATHS_PREREG.md`, which must stay unseen. NQ and OANDA agree at 0.965 in the same 15-min bar
  (diagnostic review T1), so the swap costs little; the OANDA series may be used for the explore half only, as a
  cross-check that is reported but not scored.
- **Window:** 2026-04-13 → 2026-10-09 (the 1-min archive). **Explore** 2026-04-13 → 2026-07-17 (14 weeks).
  **Confirm** 2026-07-20 → 2026-10-09 (12 weeks). The video week (16–23 Sep) sits in confirm and was chosen by him
  after the fact, so confirm is reported **with and without 2026-09-16 → 09-23**; the without-figure is the one that
  counts.
- **Bars:** 15-min, UTC, label right, last 1-min midpoint in the bar; a bar counts only if both legs and Nasdaq have
  ≥ 10 of its minutes. Weekend and euro-market-closed stretches (no euro prints for > 60 min) are dropped, not carried.

## The five constructions (all fixed now; nothing is picked by its resemblance to his line)

| id | series | note |
|---|---|---|
| C1 | SOFR front − €STR front, same quarterly | his literal pair; front = nearest unexpired, switch 7 days before expiry |
| C2 | mean over Z6 H7 M7 U7 of (SOFR − €STR) | 4-contract strip, ≈ 1-year forward gap |
| C3 | PCA-1 of the four Z6…U7 differences | "level"; weights fitted on **explore only**, frozen for confirm |
| C4 | PCA-2 of the same | "slope" |
| C5 | US 2y − German 2y yield change (ZT, FGBS; −Δln P / 1.9) | the classic EURUSD driver |

Euribor-based versions of C1–C4 are run as a robustness column, not scored.

## H-A: divergence catch-up

- For lookback L ∈ {4, 8, 12} h: D_L(t) = z(Δspread over L) − z(ΔNasdaq over L), each z using the rolling 20-day
  standard deviation of that L-change computed from data **before** day t.
- Target: Nasdaq log return over the next H ∈ {1, 2, 4} h.
- Statistic: correlation of D_L(t) and the forward return at every 15-min bar, day-clustered t (per-day sums), as in the
  grid. Overlapping windows are the reason for day clustering.
- 5 constructions × 3 L × 3 H = **45 cells**. Explore: BH-FDR at 10 % over the 45. Sign free in explore.
- Confirm: only explore survivors, **sign fixed from explore**, one-sided p < 0.05 each, on confirm-without-video-week.
- **PASS** = at least one cell survives both. A PASS also reports the effect in Nasdaq points per 1σ of D_L.

## H-B: confirmed turning point

- Event: at bar t the spread's close is the lowest (highest) of the last K bars, K ∈ {16, 32} (4 h, 8 h), and the next
  3 bars all close above (below) it. The signal fires at **t + 3** (45 min later, his confirmation lag); nothing before
  t + 3 is used.
- Target: Nasdaq log return from the t + 3 close over H ∈ {1, 2} h, signed (+ after a low, − after a high).
- Baseline: 1,000 scrambles — the same number of events placed at random bars with the same hour-of-day distribution,
  within the same half.
- 5 constructions × 2 K × 2 H = **20 cells**. Explore: observed mean above the 95th percentile of scrambles, BH-FDR 10 %
  over 20. Confirm: survivors only, sign fixed, above the 95th percentile on confirm-without-video-week.
- **PASS** = at least one cell survives both **and** the mean after a 1.5-point round-trip cost is still positive.
- Reported, no pass weight: how often the spread's turn precedes a Nasdaq turn by 15–120 min at all (the raw
  "did it lead" count), with its scramble baseline.

## Power, before any result is read

The grid's 15-min cells had 0–3 % power (diagnostic review T6). So, first, a planted-signal check on the real series:
inject a lead of known size (H-A: corr 0.03 / 0.05 / 0.08; H-B: +0.05 % / +0.10 % mean per event) into the explore
half and record the detection rate under the rules above. **If detection at the middle size is under 50 %, a null is
classified "insufficient data", not "no effect", and the confidence intervals are the finding.**

## Classification of the outcome (from the diagnostic brief)

- PASS in explore and confirm → real candidate; goes to a forward paper record before anything is built.
- Null with power ≥ 50 % → genuinely little predictive information at these horizons; the composite spreads stay as a
  context overlay (regime read, attribution), not a signal.
- Null with power < 50 % → insufficient data; the question reopens only when the 1-min archive is twice as long
  (~Apr 2027), not by adding cells now.

## Stopping rule

One run per hypothesis. No new constructions, lookbacks, horizons or filters are added after the first number is seen.
If his later videos specify the exact construction (PCA, residuals), that is a **new** pre-registration against new
data, not an amendment here.

Script `scripts/rate_diff_nq/composite_tests.py`; output `analysis/output/rate_diff_nq/composite/RESULTS.md` with the
heatmaps; evidence ledger entry `stir-composite-nq` in `js/deskEvidence.js`.
