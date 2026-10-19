# Decision Lab: filters on rule A (DRAFT, not registered; needs the owner's approval before any test runs)

**Primary:** rule A, the rich-day break on the chosen v3 lines, at its registered setting (stop 0.2σ, target 5R). The trades are those in the locked Forecast Line Backtest record (tag `lesson-track-L05`) on 11 instruments, 2020-08 → 2026-08-20. Rule A sets the direction; this layer only decides take/skip or size (Lesson 03 §01: meta-labelling sits on a primary that already chooses direction).

**Context:** `scripts/decision_lab/build_rule_a_context.py` → `backtest-data/decision-lab/rule_a.json.gz`. Every input is the last feature-store value whose `asof` is before the entry minute. Page: `decision-lab.html`.

## Disclosure (before registration)
- On 2026-10-19 the page's green-vs-red table was viewed **once on the full period, 2020–2026**, for the nine inputs listed there. It was then changed to open on 2020–23.
- **So for those nine inputs, 2024–26 is no longer an unseen check.** Their confirmation must come from data nobody has looked at:
  - the forward paper record (`paper-record.html`, rule A live since 2026-10-02);
  - and/or the sealed holdout (opens once 2027-01-04).
- What was seen: the COT input ("funds already positioned the trade's way", z-score over 156 weeks) split +0.34R (top third) vs +0.02R (bottom third) per trade, outside its shuffle band. The other eight were inside their bands.
- With nine inputs, about one is expected outside by chance. This is a lead, not a result.

## Hypotheses (at most five, each with its reason written before any test)
1. **Positioning agreement (H1).** Rule A trades where leveraged funds are already net positioned the trade's way (COT z > 0) earn more than those against.
   - **Reason:** a break that agrees with how fast money is positioned has a buyer behind it. Seen once on the full period (above).
2. **Rates agreement (H2).** Trades where the 10-year yield gap has moved the trade's way over 20 days earn more.
   - **Reason:** rates are the slow driver of FX, and a break with the rate move is with the tide.
   - Daily DGS10-type series only; the monthly GS2 lookahead is avoided (`forge/HARNESS_REGISTRY_ADDENDUM_A.md`).
3. **Richness band (H3).** Trades with IV ÷ RV in the middle of its range earn more than the extremes.
   - **Reason:** very rich days may already have moved.
4. **Stress (H4).** Trades on days with an inverted VIX term structure (VIX ÷ VIX3M > 1) differ from the rest. Two-sided.
5. **Surprise agreement (H5).** Trades whose USD exposure agrees with the last 5 days of US data surprises earn more.

## Test plan (to be fixed at registration)
- **Where it runs:** each hypothesis through `js/harness/runStudy.mjs`:
  - weekly block bootstrap;
  - BH-FDR across the five;
  - deflated Sharpe with N = 5 plus the 60 settings already offered on the backtest page.
- **Use:** size, not skip. A passing filter scales position size (e.g. 1.5× when agreeing, 0.5× when not), judged against flat size on net R and drawdown.
- **Pass:**
  - confirmation lower bound > 0 on unseen data: the paper record once it holds ≥ 150 rule A trades, and the holdout at its one opening;
  - same sign on 2020–23.
- **Stopping rule:** if none passes, no further filters on rule A until a new lesson or new data source gives a new reason.
