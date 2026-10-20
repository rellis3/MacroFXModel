# rule-a-late-entry: do rule A breaks that happen between 10:00 and 13:00 London pay like the 00:00–10:00 ones?

**Pre-registered 2026-10-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `rule-a-late-entry` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `rule-a-late-entry` |
| Data | The 11 rule A instruments (EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY, GOLD, NQ, SPX500, US30, US2000). Research M1 cache (OANDA mid), London sessions. Chosen v3 lines point-in-time (`analysis/output/vf3_stage_b/part1_lines.parquet`, oos rows). Rich-day flags exactly as `scripts/backtest/build_line_backtest.py`. Window 2020-08-24 → 2026-08-20; the lockbox is not read. |
| Seed | `20261020` |
| Uncertainty | Week-block bootstrap of the pooled mean (block = 4 weeks), B = 2000 |
| Scripts / outputs | `scripts/rule-a-late-entry/` → `analysis/output/rule-a-late-entry/` |
| Harness | Own script. It reuses the locked backtest's entry and trade code so the only change is the entry window. |

## 1. The claim
Rule A, the rich-day break on the chosen v3 lines, is registered with entries from 00:00 to 10:00 London. That window was copied from C.OG's trade shape, not tested. The claim: on rich days, the first break of an O→H / O→L p50 or p75 line that happens **between 10:00 and 13:00 London** (the line not yet broken before 10:00) also has a positive expectancy after costs, with the same stop, target and exit.

## 2. Why it is not already settled
- The original study (`forge/ASYMMETRIC_TRADES_PREREG.md`, branch fade-continue-book) and rule A's registration (`forge/BREAK_IVRV_PREREG.md`) only built entries from 00:00 to 10:00.
- The Forecast Line Backtest (tag `lesson-track-L05`) and the Decision Lab use the same window.
- The exits study (`backtest-data/decision-lab/EXITS_DECISION.md`) showed that the edge needs a far target and a hold into New York, which later entries have less time for. That is a reason to expect them to be weaker, so this is a genuine question.
- No Evidence Book entry covers late entries.

## 3. Definitions, fixed in advance
- **Rich day:** IV ÷ 20-day RV ≥ 1.182 (FX, gold) or ≥ 1.53 (US indices). Implied vol is from the point-in-time Stage B row; realised vol is from the 21 London closes before the day.
- **Lines:** the chosen forecast's O→H and O→L p50 and p75, from the London-midnight open.
- **Late break:** the first 1-minute close ≥ 0.05σ beyond the line whose minute is in [10:00, 13:00) London, **on a line that had no such close before 10:00**. Enter at the next bar's open in the break direction. One trade per line per day.
- **Trade:**
  - stop 0.2σ behind the line; target 5R; otherwise out at the last bar before 22:00;
  - a stop and a target in the same minute count as the stop;
  - costs at 2× the spread table (as the backtest).
- **Primary metric:** pooled mean net R per trade.

## 4. Hypotheses, expectation first
- **Expectation:** weaker than the 00:00–10:00 window (rule A's 0.2σ / 5R reading there is +0.162R), because there is less session left to reach 5R.
- **H1:** late-window mean net R > 0.
- **THE GATE:** all of these must hold:
  1. pooled mean > 0 with a 95% lower bound > 0;
  2. both halves (2020-23, 2024-26) > 0;
  3. at least 6 of the 11 instruments > 0.
- **THE MIRROR** (a rich-day-only effect, not just afternoon drift): the same late breaks on **non-rich** days are reported. If they are as good as the rich-day ones, the result is attributed to time of day, not to rule A.

## 5. Power: what this design can and cannot find
- **Expected trades:** a few hundred to about 900 (rich days × lines still unbroken at 10:00).
- **Noise:** a 5R / −1R structure has a per-trade SD of about 2R. With 700 trades the standard error is about 0.08R before clustering, so only a mean of about +0.16R or more can clear the gate.
- **If the mean is positive but the interval crosses zero,** the verdict is UNDERPOWERED, not NULL.

## 6. Multiplicity
- **One primary cell:** the late window, 0.2σ / 5R, rich days.
- **Reported, not tested:**
  - the mirror (non-rich days);
  - the three hours separately (10, 11, 12);
  - rule A's other registered cells (0.1σ/5R, 0.1σ/10R, 0.2σ/10R).
- No other windows (13:00–16:00 etc.) are tried in this study.

## 7. What this does NOT test
- Other exits for late trades (the exits study kept 5R / 22:00).
- Entries after 13:00.
- Filters (`forge/DECISION_LAB_FILTERS_PREREG.md`, draft).

## 8. What each verdict changes
- **VALIDATED:** the 10:00–13:00 window is added to rule A as a candidate extension.
  - It is shown on the Decision Lab and as v3 Trade lines, labelled separately.
  - It is scored on the forward record before it counts as part of the rule.
- **NULL:** the window stays at 00:00–10:00, and the reason is recorded.
- **UNDERPOWERED:** no change, and it is recorded as unresolved.
