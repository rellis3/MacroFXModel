# Surprise actuals from FRED vintages

*2026-09-19. Plumbing, not a claim — but the surprise index, the event-day
read in the brief and the timeline's "actual vs consensus" all sit on it.*

## The fault

The economic-surprise store (`econ_surprise_v1`) is consensus-vs-actual for
every scheduled release, standardised per series and decay-weighted into the
"beating vs missing consensus" bars. It was backfilled from the ForexFactory
archive to 2025-04-04 and then refreshed hourly from ForexFactory's free weekly
feed. That feed carries `title, country, date, impact, forecast, previous` —
**no `actual`** — and `mergeReleases` drops any row without one. So for
seventeen months the refresh logged *"10,181 stored releases — nothing new,
store untouched"* every hour and the store never took a live print. Everything
built on it ran on data that ended in April 2025.

Same family as the other silent feeds: a job that never errors and never grows.

## The fix

For the US releases FRED publishes, the actual is rebuilt from FRED **vintages**
(ALFRED). Asking the API for the series *as known between the release day and
three days later* (`realtime_start`/`realtime_end`) returns the first print with
a `realtime_start` stamp saying when it appeared. The join rule
(`js/fredActuals.js`):

- take the newest observation in that window;
- require it to have been published inside the window (`realtime_start ≥`
  release day) — otherwise FRED has not posted yet and the hourly pass retries;
- require its date to be a period the release could report on (one of the
  three months before a monthly release, the quarter before a quarterly one, a
  fortnight for weekly claims, the day after the decision for the target rate,
  because FRED's decision-day row can still carry the old rate);
- format to ForexFactory's string (`0.2%`, `228K`, `7.57M`, `-48.7B`) so the
  print joins the backfilled history of the same series;
- the observation before it, in the same vintage, is the prior the market had —
  compared with ForexFactory's `previous` and logged when they disagree
  (revisions), never used as a gate.

Latest-vintage FRED would not do: the first attempt used it and payrolls,
retail sales, GDP and JOLTS were all wrong against the archive, because they
are revised by tenths and tens of thousands.

## Validation (design frozen before running)

For each mapped series, the last 5–6 prints in the ForexFactory archive were
rebuilt from vintages and compared with what ForexFactory printed on the day.

| Series | n | exact | note |
|---|---|---|---|
| CPI m/m, Core CPI m/m, CPI y/y | 18 | 18 | |
| PPI m/m, Core PPI m/m | 12 | 12 | |
| Core PCE m/m, Personal Spending m/m, Import Prices m/m | 18 | 18 | |
| Non-Farm Payrolls, ADP, Unemployment Rate, Avg Hourly Earnings | 24 | 24 | |
| Unemployment Claims | 6 | 6 | persons → K |
| JOLTS Job Openings | 6 | 6 | |
| Retail Sales m/m, Core Retail Sales m/m | 12 | 12 | |
| Industrial Production, Capacity Utilisation | 12 | 12 | |
| Durable Goods, Core Durable Goods, Factory Orders, Business Inventories | 24 | 24 | |
| Trade Balance | 6 | 6 | |
| Building Permits, Housing Starts, New Home Sales | 18 | 17 | one permits print a tick out (1.51M vs 1.50M rounding) |
| Advance / Prelim / Final GDP q/q | 15 | 15 | |
| Federal Funds Rate | 5 | 5 | |
| **Total** | **181** | **179** | |

Dropped after the run: Existing Home Sales (no ALFRED vintages), UoM Consumer
Sentiment (FRED's revised copy disagreed with the print). Never mapped: ISM,
S&P PMIs, Conference Board, Philly/Empire, NAR pending sales — proprietary.

Live dry run on the week of 14 Sep 2026: ten US prints filled — retail sales
1.2% vs 0.8% consensus, core 1.4% vs 0.6%, claims 196K vs 207K, fed funds 4.00%
as expected, industrial production 0.0% vs 0.3% — with priors agreeing except
Housing Starts, where July was revised 1.24M → 1.31M (a revision, logged).

## What is live and what is not

- **Live:** US releases on the map (about thirty series), filled within the
  hour of FRED posting, which is within minutes of the print.
- **Not live:** every non-US release, and the proprietary US surveys. They keep
  consensus and prior and simply do not score. The page says so under the
  surprise bars, with the date of the last live print; older than nine days on
  a working calendar is flagged amber.
- `/api/econ-surprise` now returns `health` (`livePrints`, `last30d`,
  `latestPrintAt`) so the feed can be watched from outside the log.

## What it changes on the page

The currency surprise bars move again; the morning brief's RELEASED marks can
say what the number was; the timeline's look-back shows "actual vs consensus
(surprise +1.3σ)" on US prints. Nothing about direction — the S7 result stands:
surprise size sets range, not sign.

## Addendum 2026-09-19 (later the same day): revisions and non-US rate decisions

**Revisions.** The vintage already carries the prior as the market now sees it,
so at fill time it is compared with the previous release's first print. A
difference is written on both rows — the new release *"revised the prior 1.24M
→ 1.31M"*, the old one *"later revised to 1.31M (+0.07M)"* — and shown in amber
on the timeline. Merge keeps the marks when the feed row comes round again.

**Non-US rate decisions.** FRED only carries the ECB daily (`ECBMRRFR`); the
others come from the central banks' own open feeds: BoE IADB `IUDBEDR`, BoC
Valet `V39079`, RBA F1 daily `FIRMMCRTD`. Join: the first observation dated
after the decision day (the ECB's new rate applies six days later, so that one
waits six days). Validated on the last eight decisions each: **BoE 8/8, BoC
8/8, RBA 8/8, ECB 8/8** (ECB was 2/8 before the six-day lag was added — the
first attempt was reading the old rate). Late fills find the event through the
daily snapshot's released rows, since the calendar feed only shows the current
week. BoJ, RBNZ, SNB: no clean open feed found (RBNZ 403, BoJ HTML only) —
unscored, said so on the page.

**Scale.** The per-series sigma was a standard deviation over eleven years of
surprises, so 2020 dominated it: an 11K claims miss scored +0.1σ. Now the median
absolute deviation (×1.4826), falling back to the standard deviation only when
a series almost never surprises (rate decisions). This week under the new
scale: claims 196K vs 207K = +0.67σ, retail sales 1.2% vs 0.8% = +1.12σ, CPI
0.4% vs 0.3% = +0.67σ. S7 (surprise size → range) is to be re-run on the
rescaled history once deployed; its verdict is recorded below when done.
