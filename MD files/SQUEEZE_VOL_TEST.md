# Retail pain as squeeze fuel — pre-registered test

> **Status: PRE-REGISTERED 2026-09-13 (commit `359253f`), run the same day.
> Verdict: NULL, 0 of 4 instruments.** Crowded-and-underwater days are not wider
> than matched days, and the move goes neither with nor against the crowd. Banked.
> The page's wording was corrected the same day; the pain read stays as a fact
> about who is losing, labelled null as a predictor.

## The claim

When OANDA's retail position book is crowded on one side and that side is mostly
underwater, the following day is wider than a comparable day without that setup —
"crowded and losing is squeeze fuel". A claim about the **range** of what follows,
never its direction. Direction was carried as an exploratory line with no pass bar,
because retail on FX mirrors momentum and momentum on FX is a banked null here.

## Design, frozen before the first run

| | |
|---|---|
| setup | 07:00 UTC snapshot: larger side ≥ 60% of near-spot positions, and ≥ 70% of that side underwater |
| outcome | realised high–low range in ATR(14), 07:00 → 07:00 next session; also 5 sessions |
| control | one non-setup day, same instrument, different ISO week, matched on vol-percentile quintile **and** prior-5-day momentum tercile |
| statistic | paired mean difference, week-block bootstrap 95% CI, 400 reps |
| pass | 24h difference > 0 with CI clear of zero on ≥ 3 of 4 instruments |
| robustness | R1: 2021-09 onward only · R2: thresholds 65/75 |

Data: `backfill/books_daily.ndjson` — one snapshot per trading day since 2017-05
for EUR_USD, XAU_USD, USD_JPY, GBP_USD, fetched by `scripts/fetch_oanda_books.py
--daily 07:00` and summarised by `js/positionBookMetrics.js` (the same metric the
page shows); M1 price history from the frozen snapshot. `analysis/squeeze_vol_study.mjs`.

## Result

| | setups | 24h diff [95% CI] | 5d diff | direction vs crowd |
|---|---|---|---|---|
| EUR_USD | 638 (27% of days) | +0.017 [−0.033, +0.071] | +0.05 | −0.03 ATR |
| XAU_USD | 158 (6.7%) | +0.065 [−0.019, +0.143] | −0.16 | +0.04 |
| USD_JPY | 90 (3.8%) | −0.044 [−0.171, +0.125] | −0.15 | +0.00 |
| GBP_USD | 18 (0.8%) | +0.150 [−0.044, +0.428] | +0.24 | −0.05 |

Gold is the only suggestive cell (t = 1.5) and it fails two ways: the interval
includes zero, and the 5-day sign flips. R2 on gold shrinks to +0.012. Direction is
flat everywhere.

## The finding that matters more than the verdict

**Retail is ~60% long on every major, every day.** Crowd-share p50/p90: EUR_USD
61.1/62.3 · USD_JPY 60.0/62.7 · GBP_USD 58.2/59.7 · gold 60.7/67.9. The "crowding"
number has almost no variance — the half of the setup assumed to be doing the work
filtered nothing (R2's 65% threshold finds zero days on EUR_USD). Only pain varies,
and pain, tested, predicts nothing.

So the position book's honest job on the page is descriptive: who is there, who is
losing. Not a threat, not fuel, not a setup. The card's threat priority dropped the
pain chip the same day; the drawer, the AI prompt and the glossary now say what the
test said.

## What was not tested

The order book (resting stops and limits) — a different endpoint, not fetched. And
the 20-minute intraday path of pain around a level touch, which is a different
question from a daily 07:00 read. Neither is queued; the daily null and the flat
crowd share make a strong prior against either.
