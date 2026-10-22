# cot-extreme-duration — does positioning that stays stretched for a long time matter, and with what lag?

**Exploratory, not pre-registered.** Register row `cot-extreme-duration`; follow-up to `cot-extreme-aftermath`, asked
generally ("overbought for a long time", "how long before price reacts", "does price fall when positioning weakens")
rather than in fixed buckets. Design is in the header of `scripts/cot-extreme-duration/analyse.py`, committed before
any outcome was computed. The 10Y split was added after the pooled results were seen and is marked as such. Seed
20261022.

## Data

- COT: CFTC TFF (Leveraged Funds) and Disaggregated (Managed Money), 2006 →, share of OI ranked against the prior
  155 weeks, exactly as the page does. Scored reports 2007-06-12 → 2026-08-18; 11,735 market-weeks, 3,275 at a
  90th/10th extreme, 496 extreme runs (gaps of ≤ 2 weeks merged).
- Price: Yahoo daily closes, weekly sampling: the CME currency futures themselves (6E, 6B, 6A, 6J, 6C, 6S), ICE DXY, GC,
  SI, NQ, ES, ZN. Weekly returns match the OANDA M15 store at r = 0.97–0.99 over 2018–2026. Yahoo's spot FX closes
  were checked and rejected (r = 0.80; they are snapshots at inconsistent times). Futures are unadjusted front-month,
  so rolls add a small quarterly jump.
- Each report is priced at the first close on or after its Friday release. Nothing after 2026-08-21.
- Units: "typical weeks" = log return ÷ that market's weekly σ over the prior year, signed so that + means price went
  the crowd's way. 95% CIs come from a 26-week moving-block bootstrap over dates.

## 1. Positioning follows price; it doesn't lead it

Correlation of the positioning percentile with price's 4-week move, at each offset, averaged over 12 markets:

- Peak **+0.20 [+0.16, +0.24] with the move from about 7 weeks before the report** (that is, weeks −7 to −3).
  Still +0.08 at 26 weeks back.
- With any 4-week window **after** the report, never above |0.04| out to a year.

Specs build positioning *after* price has moved, mostly over the previous one to two months. Nothing in the level
anticipates the next move.

## 2. How long it has been stretched is the one thing that changes the picture

Average cumulative move in the crowd's direction after an extreme week (typical weeks, 95% CI):

| | n weeks | 26 wks before | next 13 wks | next 26 wks | next 52 wks |
|---|---|---|---|---|---|
| All extremes (pooled as designed) | 3,275 | +2.61 | +0.11 [−0.24, +0.54] | +0.09 [−0.47, +0.71] | −0.66 [−1.71, +0.40] |
| **Just arrived** (< 1/3 of prior 26 wks stretched), ex-10Y | 853 | +2.16 | **+0.69 [+0.06, +1.33]** | **+0.96 [+0.21, +1.71]** | +0.12 [−1.09, +1.39] |
| **Stretched a long time** (≥ 2/3 of prior 26 wks), ex-10Y | 838 | +4.41 | −0.27 [−1.15, +0.73] | −0.07 [−1.73, +1.60] | −0.17 [−2.36, +1.86] |
| Just arrived, FX + DXY | 543 | +2.75 | +0.90 [+0.07, +1.81] | +1.27 [+0.10, +2.46] | +0.13 |
| Stretched a long time, FX + DXY | 476 | +4.74 | −0.09 | −0.47 [−2.71, +2.46] | −1.66 [−4.28, +0.85] |
| 10Y, stretched a long time | 256 | −1.64 | −0.91 | **−2.73 [−4.83, −0.96]** | **−8.21 [−13.05, −3.73]** |
| Comparison: PRICE itself at a 26-wk extreme | 2,620 | +7.11 | +0.33 | +0.76 [−0.38, +1.97] | +1.12 [−0.43, +2.85] |

- A **fresh** extreme sits inside a trend that usually keeps going for about six months. That is mostly ordinary price
  momentum: a price extreme alone shows the same shape.
- A **long-lasting** extreme comes after a much bigger run (+4.4 typical weeks) and is followed by nothing: the trend
  has used itself up, but on average it doesn't reverse. In FX alone the 52-week point leans towards a give-back
  (−1.7), but the interval is wide and crosses zero.
- Time stretched over the past year (80th+), forward 26 weeks, ex-10Y: < 25% of the year +0.06 · 25–50% +0.10 ·
  50–75% +0.05 · ≥ 75% −0.05. **No dose-response outside the 10Y.**
- **The 10Y is the exception, and a different animal.** When leveraged funds have held a record short for most of
  the year, Treasury futures rallied against them. 10Y-only, ≥ 75% of the year stretched: 12% kept going at 26 weeks,
  19% at 52. In the pooled run, the 10Y supplied 183 of the 489 "≥ 75%" weeks; leave it out and the pooled fade
  disappears (−0.39 → −0.05). Leveraged-fund Treasury shorts are mostly the cash-futures basis trade, so this is not
  "the crowd was wrong about bonds".

## 3. The lag: when did price actually turn?

Per extreme run, ex-10Y (medians):

| run length | runs | price peaked (wks after flag) | middle half | positioning peaked first | price peak vs end of extreme |
|---|---|---|---|---|---|
| brief (1–3 wks) | 216 | 10 | −2 to 21 | 67% of runs, by ~10 wks | 9.5 wks after it ended |
| medium (4–11 wks) | 159 | 12 | −0.5 to 26 | 62%, by ~7 wks | 5 wks after |
| **long (12+ wks)** | 83 | **21** | **9 to 34** | 71%, by ~9 wks | **at the end (0)** |

For long runs the sequence is consistent:
1. Price runs first.
2. Positioning reaches its own peak about two months in.
3. Price keeps going for roughly another two months.
4. Price tops around the week the extreme finally ends, a median 21 weeks after the first flag.

The spread is wide: a quarter of long runs had peaked by week 9, a quarter not until after week 34.

## 4. When positioning weakens, price doesn't follow

Forward moves (σ × √weeks) by stretch level and the 4-week change in positioning:

| | 4 wks | 13 wks | 26 wks | n |
|---|---|---|---|---|
| 90th+ and still building | −0.03 | **+0.13** | **+0.13** | 1,209 |
| 90th+ and steady | +0.04 | −0.02 | −0.04 | 2,025 |
| 70–90 and paring back | +0.01 | +0.05 | +0.05 | 820 |
| **Rolling over** (was 90th+ within 8 wks, now 20+ points lower) | +0.01 · 52% | +0.07 · 52% | +0.04 · 50% | 1,891 |
| Every week (baseline) | +0.01 | +0.02 | +0.03 | 11,686 |

Positioning falling back from an extreme doesn't pull price with it. Those weeks look like any other week, because by
then price has usually already made its turn (section 3). Still building at the 90th+ leans very slightly towards
continuation.

## What it adds up to

- COT positioning is a **lagging mirror of the last one to two months of price**. Being overbought or oversold for a
  long time mostly tells you that a long trend has happened.
- **Fresh extremes:** the trend tends to run on for months. **Long-held extremes:** it has run out, without a
  reliable reversal. **The turn:** it shows up in price around when the extreme ends, not while it holds.
- No measure here gives timing. The only strong long-horizon effect is the 10Y leveraged short, which is basis-trade
  mechanics.

Caveats: exploratory, many views of the same data, overlapping windows. The 10Y split was chosen after seeing
results. Roughly 80–100 long runs in total, and most FX legs share one USD trade.

## Next

If any of this is to be used as a rule, pre-register on unused data (the post-2026-08-21 lockbox plus forward
weeks), one cell at a time:
- fresh extreme → 26-week continuation (ex-10Y)
- the 10Y long-held leveraged short → rally (with a basis-trade control: SOFR/repo or asset-manager long)

## Files

`scripts/cot-extreme-duration/fetch_prices.py`, `analyse.py` (COT pulled with
`scripts/cot-extreme-aftermath/fetch_cot.py 2006-01-01 …`) → `cot_weekly.csv`, `prices_daily.csv`, `episodes.csv`,
`results.json`, `js/cotDurationData.js` (the "How long it stays stretched" panel on cot-extremes.html).
