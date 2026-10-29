# rule-a-pre2020: does rule A on the chosen v3 lines pay in 2016–2020, years its lines were never fitted or picked on?

**Pre-registered 2026-10-28, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `rule-a-pre2020` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `rule-a-pre2020` |
| Data | **Prices:** research M1 cache (OANDA mid), London sessions 2016-05-23 → 2020-08-21 (the cache starts 2016-05-23). **Lines:** the point-in-time history `analysis/output/forecast_history/*.csv` (PIT σ; the same rows Stage B used, flagged burn-in `oos = 0`). **IV:** CBOE VXN (NQ), VIX (SPX500, US30, US2000) and GVZ (gold), as Stage B used them, plus CME CVOL for FX (`js/data/cmeCvolEod.json`): EURUSD, GBPUSD, USDJPY from 2016; AUDUSD, USDCAD, USDCHF from 2018-10. The lockbox is not read. |
| Seed | `20261028` |
| Uncertainty | Week-block bootstrap of the pooled mean (block = 4 weeks), B = 2000 |
| Scripts / outputs | `scripts/rule-a-pre2020/` → `analysis/output/rule-a-pre2020/` |
| Harness | Own script. It reuses `scripts/forecast_history/vf3_stage_b.py` (load) and `scripts/backtest/build_line_backtest.py` (simulate, spreads), so only the years differ. |

## 1. The claim
Rule A as registered and backtested 2020-08 → 2026-08 (+0.162R per trade net of 2× spread, `forecast-line-backtest.html`) also pays in the 4¼ years before its lines' scoring period. Those years were not used to fit the chosen ladder's parameters here, and not used to choose the chosen ladder.

## 2. Why it is not already settled, and what has been seen
- **The chosen lines start at 2020-08-24.** Stage B fitted them walk-forward from 2016-2020 burn-in rows, so no chosen-line trade before 2020-08 exists.
- **Prior exposure, which must be disclosed:**
  - The rich-vol break family was found and tested on 2016–2025 using **Vote Atlas v4 lines** and CVOL (`forge/ASYMMETRIC_TRADES_PREREG.md`, `forge/BREAK_IVRV_PREREG.md`, branch fade-continue-book, now merged).
  - Its rich condition (top third of IV ÷ RV) had edges fixed on 2016–22.
  - On those lines, 2016–19 was reported negative.
  - So the rich-day condition and the break idea were shaped with these years. What has never been computed is the rule **on the chosen v3 lines** in these years.
  - The result therefore tests whether the chosen-line version holds before its own period. It is not a test on virgin data for the family, and this caps how much a pass can say.
- **Nearest Evidence Book entries:** rule A's backtest (lesson-track-L05), `rule-a-late-entry` (NULL), `rule-a-portfolio-*`.

## 3. Definitions, fixed in advance
- **Lines (chosen ladder, backcast):**
  - The S form (persistence) and the SI form (persistence + IV), exactly as `vf3_stage_b.build` defines them. The class betas and per-instrument widths are fitted on **2020-08-24 → 2026-08-20 rows only** and applied to 2016-05-23 → 2020-08-14 rows. That leaves a 5-session embargo before 2020-08-24.
  - This is a backward walk: parameters are fitted only on later years.
  - SI is used where Stage B's `iv_ann` exists (indices: VXN/VIX; gold: GVZ), otherwise S. FX before 2020-09 has no settlement IV, so FX uses S. The backtest made the same choice: SI where available, else S.
- **Rich day:**
  - Indices: Stage B `iv_ann` ÷ 20-day RV from the 21 London closes before the day, ≥ 1.53 (as rule A).
  - Gold: GVZ ÷ RV ≥ 1.182 (as rule A).
  - FX: CME CVOL (`cvol`, the previous day's value) ÷ RV. The threshold is each instrument's top-third edge of CVOL ÷ RV over 2016–22, the family's own fixed edges. Rule A's 1.182 was set on the settlement source, not on CVOL.
- **Trade:**
  - The first 1-minute close ≥ 0.05σ beyond an O→H or O→L p50/p75 line, signal minute 00:00–10:00 London. Enter at the next bar's open.
  - Stop 0.2σ behind the line; target 5R; otherwise out at the last bar before 22:00. A same-minute stop and target counts as the stop.
  - Costs: 2× the spread table. One trade per line per day.
  - Skip a day if the London open differs from the line row's open by more than 0.2% (as the backtest).
- **Primary metric:** pooled mean net R per trade.

## 4. Hypotheses
- **Expectation:** small or negative. The family was negative on v4 lines in 2016–19, and rule A's own record has one negative year (2023). Expect −0.05 to +0.10R.
- **THE GATE** (all must hold):
  1. pooled mean > 0 with a 95% lower bound > 0;
  2. FX+gold and indices each > 0;
  3. at least 6 of 11 instruments > 0.
- **THE MIRROR:** the same breaks on non-rich days. If they match the rich days, the rich condition adds nothing in these years.
- **Reported, not scored:**
  - the other three registered cells (0.1σ/5R, 0.1σ/10R, 0.2σ/10R);
  - per year 2016–2020;
  - S-form vs SI-form rows;
  - 2020-26 + 2016-20 pooled, labelled descriptive because 2020-26 has been seen.

## 5. Power
- **Expected trades:** rule A ran about 340 trades a year on 11 instruments. AUD, CAD and CHF lose 2016–18 (no CVOL), so expect about 1,100–1,400 trades.
- **SE:** with a per-trade SD of about 2R, the SE ≈ 0.055–0.06R, about 0.07R with week clustering.
- **MDE (80%)** ≈ 0.2R, above the +0.16R the rule showed. **UNDERPOWERED for the backtest's own effect size.** A positive mean with an interval crossing 0 is recorded as UNDERPOWERED, not NULL. A mean ≤ 0 with an upper bound below +0.16R is NULL.

## 6. Multiplicity
- **One scored cell:** 0.2σ / 5R, rich days, pooled. The gate is conjunctive, with no further correction.
- **Everything in "Reported, not scored"** is descriptive.

## 7. What this does NOT test
- Other entry windows, exits or filters.
- The lockbox (2026-08-21 →), which is kept back.
- Settlement-IV FX before 2020: none exists.

## 8. What each verdict changes
- **VALIDATED:** rule A has a second independent pass. The Bayes arithmetic of Lesson 04 counts it, though weaker than a virgin-data pass given §2. The forward record continues unchanged.
- **UNDERPOWERED (positive):** recorded. The case rests on the forward record.
- **NULL:** rule A's 2020–26 result is treated as possibly period-specific. Its forward record becomes the deciding test, and the Decision Lab says so on "Today's decision".

## Amendments
