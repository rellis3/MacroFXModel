# cot-extreme-aftermath — what price did after the COT Extremes page flagged an extreme

**Exploratory, not pre-registered.** Register row `cot-extreme-aftermath` (plans/RESEARCH_REGISTER.md). Design was
written into the header of `scripts/cot-extreme-aftermath/analyse.py` and committed before any outcome was computed.
Seed 20261022. Prior registered test on this data family: `cot-positioning-factor` (null, p = 0.094).

## The question

The page flags a market when spec positioning (Leveraged Funds / Managed Money net as a share of open interest) sits at
the 90th or 10th percentile of the prior 155 weeks. Markets often stay flagged for months. So what actually happened
next: at the Friday release, over the following weeks, after an extreme had already lasted 1, 2–4, 5–11 or 12+ weeks,
and when it ended? And does the dollar-index COT say anything about DXY?

## Data and method

- COT: CFTC Socrata, pulled by contract code (TFF `gpe5-46if`, Disaggregated `72hh-3qpy`), 2014 →, same spec
  definition and percentile as `/api/cot-extremes` (BASIS = share, the page default). 12 markets: EUR, GBP, AUD, JPY,
  CAD, CHF, USD index, NQ, ES, 10Y note, gold, silver. USD index is scored against a synthetic DXY (EUR, JPY, GBP,
  CAD, CHF at ICE weights, SEK dropped and the rest renormalised).
- Price: OANDA M15 closes (`analysis/output/rates_residual/m15`), reports 2018-01-30 → 2026-08-18. Nothing after the
  2026-08-21 lockbox is scored.
- Timing: each report is measured from its public release, Friday 15:30 ET (last M15 close at or before it). Reports
  caught in the 2018–19 and 2025 shutdowns (released weeks late) are excluded.
- Outcome: log return signed by crowd direction (+ = price kept going the way specs are crowded), also in σ units
  (trailing 20-day daily σ, before the release, × √horizon). Horizons +1h, +4h, +1 trading day, 1, 4, 12 weeks.
- CIs: 95% moving-block bootstrap over release weeks (all markets on a date resampled together, block ≥ 4 weeks and
  ≥ the horizon), 2000 reps.
- 5,005 market-weeks, 1,283 at an extreme.

## Results

Each cell: mean move in σ [95% CI], % of flags after which price kept going the crowd's way. **Bold** = CI excludes 0.

| group | n (1w) | +1h | +4h | +1 day | 1 wk | 4 wks | 12 wks |
|---|---|---|---|---|---|---|---|
| Baseline: every week, signed by 12-week price trend | 4,907 | −0.02 · 49% | **+0.05** · 52% | +0.03 · 53% | +0.01 · 52% | +0.04 · 53% | +0.00 · 52% |
| Any extreme | 1,283 | +0.01 · 48% | +0.05 · 52% | −0.02 · 49% | −0.06 [−0.12, +0.00] · 48% | −0.09 [−0.17, +0.00] · 46% | −0.10 [−0.21, +0.02] · 45% |
| Week 1 (fresh) | 286 | −0.04 · 49% | −0.03 · 48% | −0.04 · 50% | −0.05 · 48% | −0.12 · 45% | −0.07 · 46% |
| Weeks 2–4 | 424 | +0.03 · 49% | +0.03 · 50% | **−0.13** · 47% | **−0.21 [−0.29, −0.10]** · 42% | **−0.21 [−0.34, −0.07]** · 41% | −0.15 · 44% |
| Weeks 5–11 | 365 | +0.03 · 46% | **+0.14** · 55% | +0.05 · 51% | +0.05 · 52% | +0.06 · 51% | +0.02 · 45% |
| Week 12+ | 208 | −0.01 · 49% | +0.03 · 55% | +0.09 · 52% | +0.03 · 51% | −0.07 · 51% | −0.26 [−0.63, +0.11] · 42% |
| Crowd with the 12-wk trend | 685 | −0.01 | +0.07 | −0.01 | −0.04 | −0.02 | −0.09 |
| Crowd against the 12-wk trend | 563 | +0.04 | +0.03 | −0.02 | −0.08 | **−0.16** · 44% | −0.09 |
| The week an extreme ends (old crowd's direction) | 287 | −0.00 | +0.09 | **+0.14** · 55% | −0.00 | +0.00 | −0.04 |
| The week a 5+ week extreme ends | 83 | +0.11 · 61% | +0.10 | +0.07 | −0.13 | **−0.22 [−0.40, −0.07]** · 39% | **−0.20 [−0.39, −0.00]** · 35% |
| Every week, in the direction specs added | 5,005 | −0.02 · 48% | −0.00 | −0.02 | −0.02 | −0.03 | −0.02 |
| Top-decile weekly change only | 510 | −0.05 | **−0.12** · 47% | −0.07 | −0.03 | −0.04 | +0.03 |
| Dollar index COT extremes vs DXY | 100 | −0.01 | −0.01 | −0.06 | −0.10 | **−0.28 [−0.50, −0.01]** · 37% | +0.06 |
| USD composite of the 6 currency legs vs DXY | 74 | +0.02 | +0.13 | −0.03 | +0.01 | −0.19 | −0.35 |

Per market (any extreme), 4 / 12 weeks: NQ −0.27σ / **−0.35σ** (26% kept going at 12 wks), EUR −0.12 / **−0.42**,
GBP −0.27 / −0.22, USD index **−0.28** / +0.06, ES +0.06 / −0.23, TY −0.12 / −0.24, **gold +0.23 / +0.25** (61% kept
going at 4 wks; the one market leaning continuation, as in cot-positioning-factor), AUD, CAD, CHF, JPY, silver ≈ 0.

### Completed extreme runs (medians, crowd-signed %)

| run length | runs | 12 wks into it | while it lasted | 4 wks after | 12 wks after |
|---|---|---|---|---|---|
| 1 week | 107 | −0.6% | +0.1% (53% up) | −0.0% | +0.6% |
| 2–4 weeks | 100 | +0.7% | −0.1% (46%) | −0.0% | +0.1% |
| 5–11 weeks | 56 | +1.6% | −1.3% (32%) | −0.7% | −1.8% |
| 12+ weeks | 20 | +3.0% | +1.1% (70%) | −1.0% | −2.8% |

### Positioning as a mirror of price

Weekly change in spec share is uncorrelated with the next week's move in every market (|r| ≤ 0.10). The level
(percentile) is correlated with the 12 weeks of price *before* the report: +0.33 to +0.49 for EUR, AUD, JPY, gold and
silver (specs chase the trend), −0.2 to −0.3 for NQ, ES, TY and the USD index (leveraged funds there are mostly the
hedged/basis side).

## Concentration checks

- Weeks 2–4: −0.22σ (2018–21) and −0.20σ (2022–26) at 1 week; negative at 1 week in 10 of 12 markets (gold +0.15, JPY
  +0.04 the exceptions).
- 5+ week exits: −0.29σ (2018–21) and −0.17σ (2022–26) at 4 weeks; most markets negative but only 4–11 exits each, and
  the USD index and AUD go the other way.

## What it says, plainly

1. **The release itself doesn't move markets.** +1h / +4h after Friday 15:30 ET is flat whichever way the report
   reads. With Tuesday data and a Friday release, whatever the report "says" is already in the price.
2. **Being at an extreme is not a trend signal, and only weakly a fade signal.** Pooled, price went the crowd's way
   45–48% of the time over 1–12 weeks, a drift of about −0.1σ. That is the same lean as the registered null.
3. **Long extremes didn't reverse while they lasted.** Markets flagged for 12+ weeks had got there with price (+3%
   over the prior 12 weeks) and 70% kept going while the flag stayed on. The giveback (−1% at 4 weeks, −2.8% at 12)
   came **after** the extreme ended. So "overbought for 12 weeks" historically meant the trend was intact until
   positioning actually turned.
4. **Two leads worth testing properly.** (a) Weeks 2–4 of a new extreme: −0.21σ over 1 and 4 weeks, 41–42% kept
   going, stable across halves and markets. (b) The first week after a 5+ week extreme ends: −0.22σ at 4 weeks, 35–39%
   kept going.
5. **DXY.** Dollar-index COT extremes leaned fade at 4 weeks (−0.28σ, 37%), but that is 100 weeks in a handful of
   episodes.

Caveats: about 100 cells, roughly 13 of which exclude zero (around 5 expected by chance, with the cells correlated);
overlapping windows; a few dozen independent runs per market; Socrata serves revised data, not first prints.

## Next

Pre-register (a) and (b) above with their own pass bars, scored on data not used here (the post-2026-08-21 lockbox
tail plus a forward record), before anything is written as a lean. Until then the page shows these as base rates
(`js/cotAftermathData.js`, panel "Track record").

## Files

- `scripts/cot-extreme-aftermath/fetch_cot.py`: CFTC pull → `cot_weekly.csv`
- `scripts/cot-extreme-aftermath/analyse.py`: everything else → `events.csv`, `episodes.csv`, `results.json`,
  `js/cotAftermathData.js`
