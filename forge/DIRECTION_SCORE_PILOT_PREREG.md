# direction-score-pilot — what 1-to-10 score does the tested direction evidence give each market, and does it earn its keep going forward?

**Pre-registered 2026-11-01, before any score was computed or scored.**

| | |
|---|---|
| ID / ledger id | `direction-score-pilot` (one scored instrument, verdict CONTEXT) |
| Branch | `rich-score` (merged to main) |
| Register row | `plans/RESEARCH_REGISTER.md` -> `direction-score-pilot` |
| Data | none read from history. Inputs are Global Read's live direction arm (`js/globalReadCore.js`, tested inputs only) and the frozen ledger baselines B0 (`js/directionLedgerBaselines.json`, version `b0b2-frozen-20260821`). Outcomes: the forward direction ledger's daily closes, from the first issue day after deploy |
| Seed | `20261101` (no resampling is used in the frozen mapping; any later interval uses this seed) |
| Uncertainty | none until n >= 30 per band; then Wilson interval on the share of up closes per band, and the difference to the mean B0 of the same rows |
| Scripts / outputs | `js/directionScore.js` (mapping and track record), `js/directionResearch.js` (ledger forecaster `direction-score`), `/api/direction-ledger?scoreTrack=1` |
| Harness | none; this is a presentation instrument scored by the existing forward ledger |

## 1. The claim

This is not a directional claim. It is a **display rule with a built-in forward score**. The owner asked for a
1-to-10 reading per market like other sites show, with the middle of the scale meaning "no direction". This
pre-registers one mapping from the tested direction evidence to that scale, fixed before it is ever scored, so the
scale can be audited later. It adds no new evidence: a score away from the middle can only appear when a tested input
is live.

## 2. Why it is not already settled

- `js/globalReadCore.js` already combines the tested inputs into P(up) per market, and `js/directionRead.js` shows
  it beside the base rate. Neither maps it onto a scale, and neither scores the shown number forward.
- The page-lean tag, the macro scorecard conviction vote and the story arm are banked nulls or unvalidated; the
  conviction vote was anti-predictive (`project_backtest_entry_quality`). They are therefore **kept out of the score**
  and shown only as a labelled Context read.
- Nearest Evidence Book entries: `direction-bar` (the MDE map this scale is expressed in), the forward direction
  ledger cells (`vix-beta-change`, `vix-second-derivative`, `cot-state-d`, `post-fomc-usd-drift`, `fx-factor-carry`).

## 3. Definitions, fixed in advance

Markets: NQ (ledger `nq`), SPX500 (`es`), GOLD (`gold`), EURUSD, GBPUSD, USDJPY. Horizon: **1 trading close** (the
ledger's h = 1). Longer horizons are not scored by this pilot.

1. `B0` = the ledger's frozen `p0` for the market at h = 1.
2. `shift` = (`pUp` - 0.5) of Global Read's direction arm for that market when its `nLive` >= 1, else 0. `pUp` combines
   only inputs with a positive effective IC (tested tiers). Inputs with weight 0 (null, never tested) change nothing.
3. `MDE_i` = the market's one-day sparse minimum detectable effect over B0, from
   `analysis/output/direction-bar/tables.md`: NQ 0.063, SPX500 0.064, GOLD 0.065, EURUSD 0.063, GBPUSD 0.065,
   USDJPY 0.063.
4. `u` = `shift` / `MDE_i`.
5. **Score** (integers 1 to 10):
   - `u` > 0: 6 if u < 0.5; 7 if u < 1; 8 if u < 2; 9 if u < 3; 10 otherwise.
   - `u` < 0: 5 if u > -0.5; 4 if u > -1; 3 if u > -2; 2 if u > -3; 1 otherwise.
   - `u` = 0 (no tested input live): **5**.
6. **Bands:** 1-3 *Bearish*, 4-7 *No direction*, 8-10 *Bullish*. Strength word: *Lean* when 1 <= |u| < 2, *Clear* when
   |u| >= 2, none inside the middle band. The middle band is the default and is wide on purpose.
7. **Issued forecast** (ledger model `direction-score`, version `direction-score-v1`): `p_up` = clip(B0 + shift, 0.01,
   0.99); decision LONG if score >= 8, SHORT if score <= 3, otherwise NO-TRADE. It speaks every issue day a Global Read
   card exists for the market (SPX500 has none at the time of writing: no score is shown or issued for it until it has).
8. **Context read:** the Global Read inputs that were read with weight 0 and a non-zero signal (|s| >= 0.1), listed by
   label with the side they point and their tier label, each tagged "describes, not shown to predict". They never
   enter the score.

## 4. What is scored, and what would count

Per band, over issue days with a resolved h = 1 outcome: n, the share of up closes, the mean B0 of the same rows, and
the difference. Bands print "n too small" below n = 30. **No verdict is drawn by this pilot.** It reports. A later
claim that a band beats its baseline needs its own prereg, a mirror (the opposite band must not also "pass") and the
direction-bar multiplicity level. A single band at 8-10 would need roughly 480 resolved rows to show a 6-point excess
at 80% power (K from `tables.md`), i.e. years of forward days at the expected frequency; this is stated so nobody
reads the first weeks as evidence.

## 5. Power, honest

Most days most markets score 5 or 6 because few tested inputs are live and their weights are small. That is the
intended behaviour, not a bug. The score cannot be shown to be predictive on any near horizon.

## 6. Multiplicity

One mapping, fixed here, six markets. No parameter is tuned. The MDE table is the direction-bar's, not re-estimated.

## 7. What this does NOT test

Whether Global Read's direction arm is right (the ledger cells test their own rules); any horizon above one close;
trading use. The score is not a signal and must not be wired to a bot or an alert.

## 8. What each outcome changes

- Score stays in the middle band almost everywhere: the pages say so, which is the honest state of the evidence.
- A band ever shows a track record at n >= 30 that looks good: it prompts a prereg, never a promotion.
- A band shows a track record that contradicts its sign at n >= 100: the display is demoted to the Context read.

## Amendments

(none)
