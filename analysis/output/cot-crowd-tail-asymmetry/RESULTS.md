# cot-crowd-tail-asymmetry — are big moves lopsided against a crowded COT position?

**Exploratory, not pre-registered.** Register row `cot-crowd-tail-asymmetry`. Design is in the header of
`scripts/cot-crowd-tail-asymmetry/analyse.py`, written before any outcome was computed. Seed 20261022.

## Plain-English summary

Earlier studies showed that the *average* move after a crowded reading is about zero. This study asks whether that
average hides a lopsided tail: rare, sharp moves against the crowd.

1. **In the week after a report, at an extreme, the bumps are slightly bigger against the crowd.**
   - About 3.5% of trading days move 2σ or more against the crowd, and 3.0% move that far with it. For neutral
     positioning it's 2.9% each way.
   - The worst days against the crowd are bigger than the best days with it: by 0.17σ more than for neutral
     positioning, and by 0.38σ for extremes held a long time.
   - This holds when any single market is left out. But it's mostly a 2019–2026 effect: the daily against/with ratio
     is 1.40 then, against about 1.04 before.
2. **Over a month the picture flips.** At extremes, 4-week moves of 2σ or more go *with* the crowd more often than
   against it (3.5% vs 1.9%). The difference from neutral isn't statistically clear (ratio vs neutral 0.66
   [0.44, 1.13]), but it points the same way in all three eras. Trends at extremes tend to keep going rather than
   snap back.
3. **Volatility runs a little hotter after an extreme.** Realised vol over the next 20 trading days is 4.7% above
   trailing vol, against 0.7% after neutral readings: a difference of +4.0% [+0.3%, +7.5%], or +5.5%
   [+1.5%, +9.4%] without the 10Y. FX majors account for most of it (AUD, CAD, CHF, EUR and JPY run about 8–14% above
   neutral); ES, NQ, the 10Y and DXY don't show it.
4. **The 10Y is the clearest squeeze case.** When leveraged funds are at an extreme (almost always short Treasuries,
   the basis trade), daily shocks against them are twice as common as shocks in their favour: 3.0% vs 1.4% of days,
   ratio vs neutral 3.0 [1.4, 5.4]. That fits basis-trade unwinds, which hurt the leveraged short when they happen.
5. **The single biggest squeeze in the sample** was the January 2015 SNB de-peg: −31σ in one day against a crowded CHF
   short. It alone turns daily skew from about −0.2 into −1.6 (and −4.2 for long-held extremes). **Skew numbers here
   are one-event artefacts and should not be quoted.**

**For stops and sizing:**
- If you're on the crowd's side at an extreme, don't expect a reversal. Expect a bumpier ride: daily shocks against
  you are slightly more common and slightly larger, and next-month vol runs about 5% above what trailing vol says
  (about 10% in the FX majors).
- In practice, size about 5–10% smaller, or set vol-based stops about 5–10% wider, than trailing σ alone would.
- Holding a leveraged-style short in Treasury futures at an extreme carries roughly twice the usual chance of a
  2σ day against it.
- None of this is a direction signal.

## Data and groups

- Weekly panel imported from `scripts/cot-extreme-duration/analyse.py`: 12 markets, reports 2007-06-12 → 2026-08-18
  (11,735 market-weeks), priced at the release-Friday close, σ = std of the prior 52 weekly returns.
- Daily view: the trading days in the week after each release (56,563 market-days); σ_daily = RMS of the 60 daily
  returns before the release Friday.
- z = crowd-signed move ÷ σ (+ = the crowd's way). Groups are disjoint:

| group | definition | n weeks |
|---|---|---|
| neutral | stretch 50–70 | 4,100 |
| stretched | 70–90, net on the same side | 3,333 |
| extreme | 90+, net on the same side | 2,846 |
| long-held | extreme, and ≥ 2/3 of the prior 26 weeks at 80+ | 990 |
| trimmed (mirror) | 70+ but net position on the opposite side; direction = net sign | 1,456 |

## Results (pooled; 95% CIs from a 26-week block bootstrap over dates, paired against neutral)

Share of readings followed by a 2σ+ move against / with the crowd:

| | 1 week against / with | ratio vs neutral | 4 weeks against / with | ratio vs neutral | daily against / with | ratio vs neutral |
|---|---|---|---|---|---|---|
| neutral | 2.7% / 3.2% | — | 2.6% / 3.2% | — | 2.9% / 2.9% | — |
| stretched | 2.7% / 2.9% | 1.14 [0.78, 1.62] | 2.6% / 3.4% | 0.91 [0.61, 1.41] | 3.0% / 2.9% | 1.08 [0.90, 1.29] |
| extreme | 3.0% / 3.6% | 0.98 [0.68, 1.47] | 1.9% / 3.5% | 0.66 [0.44, 1.13] | 3.5% / 3.0% | **1.18 [1.00, 1.44]** |
| long-held | 3.1% / 3.1% | 1.20 [0.63, 2.38] | 1.6% / 2.7% | 0.71 [0.23, 1.91] | 3.4% / 2.7% | 1.31 [0.98, 1.80] |
| trimmed | 4.1% / 3.3% | 1.50 [0.97, 2.15] | 3.5% / 3.7% | 1.14 [0.58, 2.46] | 3.0% / 3.0% | 1.02 [0.81, 1.29] |

Tail asymmetry, |worst 5% against| − |best 5% with| in σ, minus neutral's:
- daily extreme **+0.17 [+0.00, +0.36]**
- daily long-held **+0.38 [+0.09, +0.73]** (ex-10Y +0.37 [+0.04, +0.84])
- weekly cells all span zero (4-week extreme −0.36 [−0.91, +0.15], i.e. the bigger tail is *with* the crowd)

Vol over the next 20 days ÷ trailing vol:

| | pooled | vs neutral | ex-10Y | vs neutral | 10Y | vs neutral |
|---|---|---|---|---|---|---|
| neutral | 1.007 | — | 1.006 | — | 1.026 | — |
| stretched | 1.017 | +0.010 [−0.006, +0.030] | 1.016 | +0.010 | 1.039 | +0.013 |
| extreme | 1.047 | **+0.040 [+0.003, +0.075]** | 1.061 | **+0.055 [+0.015, +0.094]** | 0.968 | −0.058 [−0.143, +0.022] |
| long-held | 1.030 | +0.022 [−0.024, +0.078] | 1.046 | +0.040 [−0.014, +0.111] | 0.981 | −0.045 |

10Y only, daily: extreme 3.0% / 1.4%, ratio vs neutral **3.0 [1.4, 5.4]**; long-held **2.9 [1.2, 5.5]**.

## Concentration

- **Daily extreme ratio, leaving out one market at a time:** 1.08 (without the 10Y) to 1.20. By era: 1.05 (2007–12),
  1.04 (2013–18), 1.40 (2019–26), against neutral ratios of 0.94 / 0.98 / 1.00. **Most of it is recent.**
- **Long-held daily tail asymmetry, leaving out one market at a time:** +0.25 (without CHF) to +0.43. Positive in all
  three eras (+0.15 / +0.45 / +0.48 vs neutral ≈ 0).
- **Vol expansion, leaving out one market at a time:** +0.030 to +0.055. By era: +0.071 / +0.009 / +0.043. By market:
  - higher: AUD 1.12, CAD 1.09, CHF 1.12, EUR 1.12, JPY 1.10, silver 1.06 (neutral ≈ 0.96–1.02)
  - lower than neutral: ES 0.97, NQ 1.03, TY 0.97, DXY 1.00
- **4-week "fewer big moves against":** extreme ratio 0.48 / 0.41 / 0.91 against neutral 0.80 / 0.56 / 1.09. Same
  sign every era.
- **Outliers:** five days beyond ±8σ (the CHF de-peg at −31σ; AUD +9.9σ in 2025; silver +9.4σ in 2013; AUD 2008;
  JPY 2010). Dropping them leaves the 2σ frequencies unchanged and shrinks the daily extreme tail asymmetry from
  0.16 to 0.15.

## Multiple testing and the mirror arm

- 84 comparisons against neutral (2σ ratio and tail asymmetry at 1w / 4w / daily, plus vol, × 4 groups × pooled /
  ex-10Y / 10Y). **12 excluded the null, where about 4 are expected by chance.** The cells are correlated, so the
  effective count is lower.
- One of the 12 is degenerate (10Y trimmed at 4 weeks: zero events, n = 88).
- The coherent cluster is extreme/long-held at the **daily** horizon (frequency, tail size and vol all in the same
  direction) plus the 10Y.
- **The mirror arm doesn't reproduce the daily pattern** (ratio 1.02), which is what you'd expect if the pattern is
  about crowding. It does show more 1-week shocks against the net position (1.50 [0.97, 2.15]; ex-10Y 1.60
  [1.06, 2.26]). That is one cell among many with no mechanism, so it's an observation, not a finding.

## Caveats

- Exploratory, on data already used by cot-extreme-duration.
- Effects are small in absolute terms: about one extra 2σ day against the crowd per 200 days.
- The daily asymmetry is mostly from 2019 onwards.
- Futures prices are unadjusted front-month (small roll jumps).
- A 2σ threshold on a fat-tailed distribution is a convention, not a natural boundary.

## Next

- Confirm on unused data: the post-2026-08-21 lockbox plus forward weeks. Use one pre-registered cell — the daily
  against/with ratio at extremes (ex-10Y) — plus the FX-major vol-expansion ratio.
- If the vol expansion holds, it belongs in sizing (scale σ up about 5–10% when an FX major is at a COT extreme),
  not in direction.

## Files

`scripts/cot-crowd-tail-asymmetry/analyse.py` → `results.json`, `rows.csv` (one row per market-week), and
`js/cotTailData.js` (`window.COT_TAIL`, for cot-extremes.html).
