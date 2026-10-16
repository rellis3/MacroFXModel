# Rates vs Nasdaq / C.OG's rate-differential idea — what has been done and tried (7–9 Oct 2026)

Every test was pre-registered before it ran (forge/ or plans/), committed, and logged in the Evidence Book
(js/deskEvidence.js). Results files are listed per item.

## Data built

| what | where | notes |
|---|---|---|
| SOFR futures 15-min (U5…M7), Euribor (IZ5…IZ6), €STR ICE / Eurex / CME | analysis/output/stir/ | IBKR; archive merges on each pull; expired contracts back to Dec 2024 |
| MIDPOINT 15-min (SOFR U6–M7, Euribor IZ6, €STR ER3U6) | analysis/output/stir_mid15/ | rules out stale last-trade prices |
| 1-min MIDPOINT Apr–Oct 2026: SOFR Z6/H7/U6, Euribor IZ6, €STR ER3U6, NQ futures M6/U6/Z6, US 2y (CBOT ZT U6/Z6), German 2y (Eurex Schatz) | analysis/output/stir_1m/ | Fridays re-pulled after a bug |
| Expired Schatz 1-min (Dec'25, Mar'26, Jun'26) | analysis/output/stir_1m_hist/ | for the final confirmation test |
| Daily US 2y (FRED DGS2 1976–), German 2y (Bundesbank 1997–), NASDAQ Composite (1971–), 9-currency FX + 3-month rates | analysis/output/ys_long/fred/, policy_direction/ | |

## Tests, in order

| # | idea | result | file |
|---|---|---|---|
| 1 | Price catches up with the SOFR/Euribor-implied move within 1h / 4h (bond-CFD version had failed) | FAIL on its placebo rule; leaned positive (b +0.19, all 5 markets) | forge/STIR_RESIDUAL_PREREG.md |
| 2 | Rates move first (lead-lag, 15m) | no lead; same-bar only | same |
| 3 | Friday's rate line draws Monday's Nasdaq (C.OG's chart) | passed narrowly, but it is afternoon direction, not turn times; minute moves −0.01 | same; viewer artifact |
| 4 | Wide scan: 48,600 combinations of 12 rate series × 9 features × 18 markets × 5 horizons × 5 sessions | no single result beats chance; the top-30 sign held 25/30 (borderline) → Fed-path-slope cluster | forge/STIR_WIDE_SCAN_PROTOCOL.md |
| 5 | That cluster on untouched Oct 2025 – Apr 2026 | FAIL (t +1.43, needs 2.0) | forge/FED_PATH_LEAD_PREREG.md |
| 6 | C.OG: cross-sectional momentum in short-rate differentials (9 currencies, 1976–2026) and Nasdaq only while US rates fall | both FAIL (Sharpe 0.13; Nasdaq rule worse than holding). Carry itself works (Sharpe 0.54) | forge/RATE_XSMOM_PREREG.md |
| 7 | Contract map: which part of the curve moves markets, % per bp, follow-through after sharp moves | SOFR 6–12 months out matters most; ~50% follow-through (none); stock sign flipped 2025 → 2026 | analysis/output/stir_contract_map/, stir_maturity_map/ |
| 8 | US−EU differential vs Nasdaq, 15m family, explore Oct–Mar / confirm Apr–Oct, TRADES and MIDPOINT, C.OG's pair included (10 candidates fixed in advance) | none confirmed; same-bar differential link collapsed Apr–Oct | plans/RATE_DIFF_NQ_LEADLAG_PLAN.md, analysis/output/rate_diff_nq/ |
| 9 | Same at 1 min + release windows | no rates lead; Nasdaq leads rate quotes by ~1 min at sub-tick size; at releases both move in the same minute | rate_diff_nq/one_minute/ |
| 10 | Full grid with a SMOOTH spread (US 2y − German 2y from bond futures): 5 series × 1–60 min × lags ±12, distributed-lag both ways, levels / error correction, conditional, rolling | 0 of 600 cells survive; out-of-sample forecasts no better; the 2y spread ~0 even same-bar (legs cancel) | rate_diff_nq/full/ + Lead-Lag Atlas artifact |
| 11 | Diagnostic review: timestamps/DST, rate measures, transforms and horizons on 29 years of daily data, volatility / range / direction targets, regimes, power | alignment correct; nothing replicates; the grid had little power at 15m → intervals; one candidate (DE 2y, 15m, −0.038) | rate_diff_nq/diagnostics/DIAGNOSTIC_REVIEW.md |
| 12 | That candidate, once, on new data (Sep 2025 – Mar 2026) | FAIL: primary regime only 16 days (underpowered); full window −0.008 [−0.035, +0.020] excludes the candidate's −0.038 → lead question CLOSED | forge/DE2Y_NQ_15M_LEAD_PREREG.md |

## What holds so far

- Rates and Nasdaq move together **in the same bar**, through each rate leg (−0.13 to −0.36 intraday). The **sign of that
  link changes with the regime** (flipped Mar 2026; daily +0.31 in 1997–2011, +0.09 since).
- The **US−EU differential** carries little of it: both legs usually move together and cancel.
- **No lead in either direction** has replicated at any horizon from 1 minute to a month. At 1–5 min and daily the data
  rules out anything meaningful. At 15–60 min, six months of data can't rule out a small effect (interval up to about
  ±0.05).

## Tools built

- pine/rate_overlay.pine (auto-picks SOFR / €STR / Euribor / yield feeds, raw pane like C.OG's, lag profile; not yet
  confirmed to compile).
- "Rate Spread vs Nasdaq" viewer: https://claude.ai/artifact/SwgKJPCD2hatiKDebpNvWF
- "Rate Spread Lead–Lag Atlas": https://claude.ai/artifact/N6jnsQLsd53cBBkJfvJ1Ub
- IBKR pull scripts: scratchpad/ibkr_stir_pull.py, scratchpad/ibkr_hf_pull.py.

## Bugs found and fixed along the way (mine)

- First euro pulls saved IBKR's continuous series under single-contract names, mixed into the named contracts →
  re-pulled. The earlier "€STR barely trades" was wrong.
- The `--end` option shipped without its imports (fixed by another session).
- The 1-min pull missed every Friday after 06:30 UTC → re-pulled.
- The first Rate Overlay used the wrong contracts and a rolling fit that bent the line → rebuilt.

## Still open

- Re-run the euro rows of tests 1, 4 and 7 on the clean euro data.
- The same questions against EURUSD (where the differential is the natural variable).
- calendar_events.csv ends 2026-07-02.

## Built from the lessons (2026-10-09)

**Rates vs Nasdaq regime read + alerts.** Context only, no forecasting.

- **Engine:** `js/ratesRegime.js`, tested by `js/ratesRegime.test.mjs`.
- **Server job:** `ratesRegime`, every 15 minutes, using OANDA's US 2y bond CFD and NAS100 at 15-min. It computes:
  - the rolling 20-day same-bar link and its regime band (strong / moderate / weak, opposite / together);
  - Nasdaq % per bp of yield;
  - a sign-flip check;
  - today's and the last hour's move attribution.
- **Telegram** (master switch `tgMaster.ratesRegime`) on a band change, a sign flip, or a ≥ 2σ 15-min rate shock. The
  first run after a deploy is silent.
- **Where to see it:** `/api/rates-regime`; the rates.html card "Who is driving Nasdaq — rates, or not?"; KV
  `rates_regime_v1` holds the daily history (the forward record: does the band persist?).
- **Check on the research data:** 2026-10-07 gives −0.41, −0.063% per bp, strong-opposite.

## Composite spreads, hours-scale (2026-10-10)

Source: C.OG's video "Macro Variable Context Relevance" (16-23 Sep 2026) and his Discord note that the line is SOFR vs
ICE €STR built in Python. Two claims the 1-60 min grid never covered: (A) the spread drifts for hours while Nasdaq is
flat, then Nasdaq catches up; (B) a confirmed low/high in the spread (45 min confirmation) precedes a Nasdaq turn.

- **Rebuild of his week** (`scripts/rate_diff_nq/cog_video_0918*.py`, `analysis/output/cog_video_0918/`): Friday's
  spread low at 15:15 UTC, Nasdaq low 16:00; Monday's spreads +1 to +5 bp through Nasdaq's flat spell, from the euro
  leg falling. His axis (7.7-8.5) and a Tuesday-midday jump match no construction we can build.
- **Data:** IBKR 1-min strip added to `stir_1m/` (€STR Z6 H7 M7 U7, SOFR U6 back to April, M7 U7, Euribor H7 M7 U7);
  `scratchpad/ibkr_hf_pull.py strip`. The U6 contracts are live until Dec 2026 (I had wrongly said they'd expired).
- **Pre-registered** `forge/STIR_COMPOSITE_NQ_PREREG.md` (commit 8892496b, before any composite existed): five
  constructions, H-A 45 cells, H-B 20 cells, explore Apr-Jul / confirm Jul-Oct with the video week removed, planted
  power check first. Nasdaq = CME NQ front, because the OANDA 1-min file after 2026-08-20 is the intraday-paths lockbox.
- **Result** (`analysis/output/rate_diff_nq/composite/RESULTS.md`): both FAIL in explore.
  - H-A: 0/45, largest |corr| 0.065; planted 0.03/0.05/0.08 all undetectable, detection starts ~0.20 → **insufficient
    data** (overlapping 8 h windows on 57 days ≈ 60 independent observations).
  - H-B: 0/20 with power 10/10 at +0.05 %/event → **genuinely nothing**; raw "Nasdaq turned after the spread turned"
    42 % vs 41 % at random bars.
  - Flagged, unregistered: C1 (his literal pair) +0.03..+0.09 in all nine confirm cells, none in explore.
- Evidence ledger `stir-composite-nq`. Reopen only with ~a year more 1-min data (Apr 2027), not more cells.

## Curve structure, hours-scale (2026-10-11)

Owner's new direction: does the SHAPE of repricing across SOFR/€STR maturities (broad / front / deferred / steepen /
flatten / twist, speed) carry advance information about Nasdaq return, realised vol and breakouts, beyond a single
contract or two-contract spread? Pre-registered `forge/RATE_CURVE_STRUCTURE_PREREG.md`; harness
`scripts/rate_curve/{build_bars,curve_structure}.py`; results `analysis/output/rate_curve_structure/RESULTS.md` + figs.

- **Types identifiable, frequencies unstable:** EU BROAD 47 → 4 fires, US DEFERRED 38 → 155 between halves; the
  repricing regime itself changed (spring parallel, late-summer back-end). Most explore survivors had < 15 confirm events.
- **Structure beyond contract/spread: NO (powered).** Nested OOS sets on confirm: Nasdaq-only R²/AUC ≥ single contract ≈
  spreads ≫ full structure (ret R² −0.11/−0.20, breakout AUC 0.56 vs 0.62; intervals below zero; walk-forward agrees).
- **Leads:** same-bar −0.24..−0.34 both halves; a 15-min lead (EU level/slope −0.08) appears in confirm only.
- **Event study:** 16/432 pass FDR in explore, 3 pass confirm on 21–24 events (broad US 1h repricing → next-hour
  continuation +0.13 % and 2-h vol ×1.2–1.3; US−EU 4h flattening → next-hour vol ×0.7–0.8). Planted power check: none of
  the registered sizes detectable → insufficient data; the three are large-effect small-n candidates → paper record only.
- Ledger `rate-curve-structure`. Possible feature if it survives forward: a "broad US repricing last hour" vol-context
  flag in the ratesRegime read. Nothing from strip/PCA/front-deferred earned a place.
- **Addendum A (2026-10-11), magnitude-only vol test** (`scripts/rate_curve/vol_from_repricing.py`, `ADDENDUM_A.md`):
  unsigned repricing size per contract, dispersion, front share, spread-vs-outright, US–EU co-movement (20 features) vs a
  9-feature Nasdaq vol baseline. Realised-vol gain +0.008 (1h) / +0.004 (2h) R², intervals straddle zero on confirm and
  walk-forward; |return| and return worse. Keep rule not met → stopped. The rates–Nasdaq book is closed on our data.
- **Reconstruction from first principles (2026-10-11)** `analysis/output/cog_video_0918/RECONSTRUCTION.md`: his line
  digitised through Tue 22 Sep; 60 affine candidates; best = SOFR U6 − €STR Z6 ×11.85 − 5.48 (0.12 units/bp, change
  corr 0.20) — [RETRACTED 2026-10-13: the Tuesday 'falsification' was my time-axis error, see RECONSTRUCTION.md §9; corrected: his legs inverted fit level 0.84, 1–4 h changes 0.5–0.76].
  Formula NOT identified; four questions for C.OG listed. No new predictive test follows.

- **2026-10-13 correction:** wide-frame time axis re-anchored to the crosshair label; Tuesday agrees with the data. His line ≈ SOFR − Euribor-family spread (inverted, rescaled, smoothed?); direction/shape reproduced, bar-by-bar 0.26-0.38 at 15 min. Digitisation noise floor level 1.00 / change 0.96.

- **2026-10-14 exact-pair lead test** (`forge/COG_EXACT_PAIR_LEAD_PREREG.md`, `cog_exact_pair_lead.py`): C.OG's identified line (SOFR Sep26 − Euribor Mar27, bp×0.1+1.445) vs NQ hourly: 0/8 lead cells in explore; same-hour link +0.22/+0.16 (1h) stable; planted-lead power only at ρ≥0.12. Ledger `cog-exact-pair-lead`. Reconstruction closed (RECONSTRUCTION.md §10); prediction null stands.

- **2026-10-14 video claims** (`forge/COG_VIDEO_CLAIMS_PREREG.md`, `cog_video_claims.py`, `VIDEO_CLAIMS.md`): his two setups and a continuous lead, 15 min–48 h, direction + volatility: 0 confirmed (F1 0/24 + 0/21, F2 1/18→0, F3 0/18); same-window link +0.17..+0.23 stable; weak consistent divergence→8h drift (+0.12 both halves, t 1.7–1.9). A one-bar look-ahead in my first run (open-labelled line) faked a 15-min lead and was fixed before recording. Ledger `cog-video-claims`.

## C.OG line on the Rates page + TradingView export (2026-10-14)
Built so the line can be drawn on a TradingView plan without intraday SOFR/Euribor feeds: `js/cogLine.js` (+test), `GET /api/cog-line`, `/api/cog-line/export`,
`/api/cog-line/indicator`, a Rates-page card (`#clcard`), `pine/cog_line_pasted.pine` (pasted data, EMA, offset input), `scripts/rates_line/build_cog_line.py` and
`refresh_cog_line.py` (laptop, TWS open: `python scripts/rates_line/refresh_cog_line.py --days 14 --commit`). Series file `analysis/output/cog_line/cog_line_15m.json`
(tracked; `data/` is gitignored). Data runs 15 Sep - 9 Oct until the next refresh. The Pine file has not been compiled by me.

- **2026-10-14 C.OG on his chart:** raw indicator, no smoothing or adjustment, Nasdaq on a separate tab. Pasted-data indicator default smoothing -> 1 (raw): RMSE 0.061, level 0.958, 15m change 0.56 (Mon-Tue 0.82 vs 0.84 floor). The 'time shift' is the one-bar labelling convention (0.56 right, 0.22 one bar off). RECONSTRUCTION.md s13.

- **2026-10-14 trend-state test** (`forge/COG_TREND_STATE_PREREG.md`, `cog_trend_state.py`, `TREND_STATE.md`): fuzzy causal zig-zag states for line and Nasdaq. Same-time state corr +0.15/+0.23 (fine); no lead beats the scramble band; 'line turns while Nasdaq has not' 9/36 pass explore, 0 confirm (pooled +10.6pp -> +4.1pp, 13/24 same sign). Ledger `cog-trend-state`.

- **2026-10-15 deep history + pinned-history confirmation** (`forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md`, Amendment 1 on the quality screen, `cog_pinned_history.py`, `cog_pinned_controls.py`): IBKR serves 1-min history for LIVE contracts back to listing (pulled SR3U6 + IH7 from 2024-04 to 2026-10, `analysis/output/stir_1m_deep/`; expired contracts are not found). On 504 earlier days: same-hour link +0.152 (t 5.4); divergence catch-up DOES NOT replicate (rho -0.002, MDE 0.049); trend-turn coincidence passes (+6.7 pp, z 7.3) but raw price after a line turn is ~0 (controls). Ledger `cog-pinned-history`; the earlier divergence paper-record suggestion is withdrawn.

## 2026-10-15/16 — concept-level tests of C.OG's "direction change -> confirmation -> lagged Nasdaq" (all pre-registered in forge/, results in analysis/output/cog_video_0918/)
- COG-TURN-EVENTS (+ Amendment B: matched controls excluded bars near ALL line turns = quiet-only controls = biased race/move columns; fixed, original kept): insufficient evidence.
- COG-EVENT-FEATURES (slope/speed/persistence/leg/variability, IC, OOS R2, costs, staleness audit): 0 of 110 cells. Legs print unchanged on ~88% of minutes.
- COG-LEGS-SESSION (legs separately, EU morning -> US session): null; Asian cells untestable as registered.
- COG-INDICATOR-OPTIONS (range position, z-score, EMA slope = his Auto-fit/Smoothing): 0/32.
- COG-MEETING-PATH (ZQ meeting-month strip, 4 contracts, shorter window from 2025-04): 0/48, placebo 0/48; euro side not testable (no 1M ESTR, Euribor serials ~10 weeks).
- COG-SHAPE-AGNOSTIC (boosted trees on multi-scale line path vs Nasdaq-only, walk-forward): 4h direction IC gain +0.060 beats placebo p95 (+0.046; placebo mean +0.030 because baseline IC is negative) but top-5% trades net ~0 -> "statistical signal without economic significance: context only". First run's verdict omitted the economic gate (bug, fixed, run 1 kept).
- COG-SEQUENCE-EVENTS (interpretable stage1/stage2/stage3, 36 specs, selection-aware placebo, ties to model): no repeatable sequence; model's edge NOT concentrated after sequences; surrogate tree fidelity ~0; volatility matched effect +0.14 log units beats placebo but Nasdaq-only regression t -0.8/-1.3 -> not validated. Run 1 omitted vol gates (fixed, kept).
- Video examples (Fri 18 Sep, Mon 21 Sep) reproduce exactly in our data; as rules over 2.5 years they do not repeat.
- Open: forward paper record from 2026-10-15 is the only untouched test; Dec-2026 roll is the first chance to test a second contract set; Euro meeting-path data not available.

## 2026-10-16 — COG-MATCHED-PAIRS (period-matched SOFR/Euribor/ESTR pairs + single legs), registered rules, family of 33 p-values
- Audit (published before tests): all 7 contracts' last-trade dates match exchange convention; C.OG pair has NO reference-period overlap (SOFR Sep-Dec26 vs Euribor Mar-Jun27); P1-P4 overlap fully, P3/P4 (SOFR vs ESTR) share the expiry convention; legs unchanged 87-89% of minutes; no async lag between legs; 1-minute bar-label overhang changes 24% of 15m values (same-hour link unchanged, only 72% of turn confirmations within +-1 bar); research line equals hand-computed raw rate difference exactly.
- Result: no pair or leg passes gates + BH across 33 + consistency. Matched pairs do NOT beat C.OG's pair on same-hour link (P0 has the highest R2, OOS corr 0.31 vs ~0.20); lead grid 0/24 FDR for every candidate; turn events and primary sequence null in all four pairs; leg correlations with Nasdaq flip sign between 2025 (+0.29) and 2026 (-0.22 to -0.37).
- Flexible model 4h direction IC gain is positive and beats placebo p95 in P0-P4 and the US leg alone (+0.054 to +0.076) but net lower bound at 1bp is -0.03% to -0.20% in every case: statistical context common to rates generally, not specific to any spread, no economics. P4 2h volatility passes its T5 gate (p 0.016) but fails BH and consistency -> exploratory only.
