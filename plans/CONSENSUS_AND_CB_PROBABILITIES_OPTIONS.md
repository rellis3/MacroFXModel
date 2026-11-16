# Consensus column and ECB / BoE / BoJ rate probabilities: free options

Researched 2026-11-16. Read-only: nothing was wired. The terminal is non-commercial and shared with a few friends, so the rule is
free sources only. Every HTTP status below was tested from the research machine on 2026-11-16 (a home connection, not Railway);
whether Railway's datacenter address is accepted is marked where it matters. UNVERIFIED means not tested.

## 1. What we already hold for consensus (the headline: no paid feed is needed)

| Piece | Source | Coverage | Status |
|---|---|---|---|
| Forecast and previous, this week | ForexFactory JSON `nfs.faireconomy.media/ff_calendar_thisweek.json` (js/econCalendar.js, server.js calendar-ahead) | USD EUR GBP JPY AUD CAD NZD CNY (no CHF). 120 rows this week. Fields: title, country, date, impact, forecast, previous. NO actual. The `nextweek` and `lastweek` files return 404 | 200 tested |
| Actual AND consensus, all countries, with history | Nasdaq `api.nasdaq.com/api/calendar/economicevents?date=D` (js/nasdaqReleases.js, scripts/calendar/fetch_nasdaq_calendar.py) | EU DE FR IT ES GB JP AU NZ CA CH plus US. Per-date queries work for past and near-future dates | 200 tested; the server already calls it |
| Statistics-office actuals | js/fredActuals.js (ONS, StatCan, Eurostat, FRED) | a handful of key releases | held |
| Stored surprise history | KV `econ_surprise_v1` via /api/econ-surprise and /api/release-surprises | 13,100 stored releases on 2026-11-16: USD 4,207 (56 series), EUR 2,317 (66), GBP 1,697 (40), CAD 1,578 (30), AUD 894 (21), JPY 495 (32), NZD 348 (12), CHF 204 (9). Recent 120-day counts per currency run from 7 to 207 | held |
| Revisions | js/econSurprise.js keeps `revised`, `revisedAt`, `revisedDelta` and `revision {of, was, now, delta}` on a release row | US vintages via ALFRED; non-US only where a later print restates `previous` | partial |
| Surprise size | z against that series' own dispersion. Evidence Book `surprise-size` VALIDATED (range, not direction) | | held |

So the calendar already shows forecast and previous (the Desk magazine prints "Expected 0.3%"), and the store already holds forecast,
actual and a standardised surprise per release back to about 2015 for most series.

### What is genuinely missing
1. A per-release history view: every past print of CPI m/m with forecast, actual, surprise z and the market's reaction size. The data exists; nothing draws it.
2. A consensus range (high, low, number of forecasters). No free source gives it.
3. Revisions for non-US releases (only visible when the next print restates `previous`).
4. Thin series: CHF (204 rows, 9 series), NZD (348, 12) and JPY (495, 32) have short samples. ForexFactory has no CHF at all; Nasdaq does.
5. A longer sample for some series: /api/econ-surprise lists a "too few historical surprises" skip list.

## 2. Consensus: candidate free sources

| Source | URL tested | Result | Gives | History | Terms and limits | Machine-readable | Datacenter risk | Effort | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| ForexFactory JSON (ours) | nfs.faireconomy.media/ff_calendar_thisweek.json and .csv | 200 JSON and CSV; nextweek and lastweek 404 | forecast, previous, impact | this week only | unofficial mirror, no key. The forexfactory.com site itself returns 403 to scripts | yes | works from Railway (already in production) | done | keep |
| Nasdaq economic events | api.nasdaq.com/api/calendar/economicevents?date= | 200 | actual, consensus, previous, all countries | years back | unofficial API, needs a browser-like User-Agent | yes | works from Railway (already in production) | done | keep (primary) |
| Trading Economics guest | api.tradingeconomics.com/calendar?c=guest:guest | 410 Gone | n/a | n/a | the guest key is dead | no | n/a | n/a | rule out |
| FXStreet calendar API | calendar-api.fxstreet.com | 401 | forecast, actual, revisions | long | needs a (commercial) key | yes | n/a | n/a | rule out |
| Finnhub economic calendar | finnhub.io/api/v1/calendar/economic | 401 with the demo token | n/a | n/a | premium endpoint (our own code comment says it 403s on free keys) | yes | n/a | n/a | rule out |
| EODHD economic events | eodhd.com/api/economic-events | 403 with the demo token | n/a | n/a | free tier UNVERIFIED | yes | n/a | n/a | UNVERIFIED, low value |
| Investing.com | no API | n/a | n/a | n/a | scraping forbidden | no | n/a | n/a | rule out |
| FRED / ALFRED | api.stlouisfed.org (free key) | held | US actuals and full revision vintages | decades | free key, already used (js/fredActuals.js) | yes | works | S | use for US revisions |
| ECB data portal | data-api.ecb.europa.eu | 200 | euro-area actuals | long | open, no key | yes (CSV, SDMX) | works | S | actuals, not consensus |
| OECD SDMX | sdmx.oecd.org/public/rest | 200 | actuals, leading indicators | long | open | yes | works | S | actuals, not consensus |
| BoE database | bankofengland.co.uk/boeapps/database | 200 CSV | UK rates and series | long | open | yes | works | S | actuals |
| BoJ statistics | boj.or.jp | pages 200; the direct data paths I guessed returned 404 | JP rates | long | open | partly | UNVERIFIED | M | actuals |
| Alpha Vantage, Twelve Data | not tested | n/a | US macro series, no consensus | | tiny free tiers | | | | UNVERIFIED, not worth it |

**Recommended path for consensus (free, no signup):** keep Nasdaq plus ForexFactory as the consensus source and build the missing
view on what is already stored: a release drawer showing forecast, actual, previous, revision and surprise z, with a table of the last
N prints and the Evidence Book chip (size validated, direction not). Add US revisions from ALFRED. State the sample size per series.
Fallback: none needed. If Nasdaq ever blocks, ForexFactory carries forecasts and the statistics-office feeds carry actuals.
Effort M. Needs from the owner: nothing, except confirming the FRED key is set (variable `FRED_API_KEY` in Railway).

Test commands the owner can paste (each prints a row count):

```
curl -s -A "Mozilla/5.0" https://nfs.faireconomy.media/ff_calendar_thisweek.json | python -c "import sys,json;print(len(json.load(sys.stdin)),'FF rows')"
curl -s -A "Mozilla/5.0" "https://api.nasdaq.com/api/calendar/economicevents?date=2026-11-12" | python -c "import sys,json;print(len(json.load(sys.stdin)['data']['rows']),'Nasdaq rows')"
```

## 3. ECB, BoE and BoJ market-implied rate probabilities

The Fed path works because the laptop reads CME ZQ futures through IBKR (fedwatch/pull_zq_path.py). Nothing of that quality is free
and public for the other three banks, so the answer differs by bank.

| Source | Bank | Tested | Gives | History | Terms | Machine-readable | Datacenter | Effort | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **BoE OIS yield curves**: `bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip` and `oisddata.zip` | BoE | 200. Downloaded and opened here. The latest daily file has sheets for the instantaneous OIS forwards (short end, 1 to 60 months, monthly points), the forward curve, the spot short end and the spot curve. Latest row 2026-11-13 | the market-implied Bank Rate path, monthly out to 5 years, built from SONIA OIS | daily from 2009 (`oisddata.zip`, 11.8 MB, three xlsx files) | free and official. Storing electronically is allowed under the conditions on the Bank's copyright page. No API. Published by noon the next business day. Data "subject to revisions" | xlsx inside a zip, stable URLs | UNVERIFIED from Railway; the Bank's site is generally open | M | **use** |
| ECB euro short-term rate (EST dataset) | ECB | 200 CSV (`data-api.ecb.europa.eu/service/data/EST/...`) | the fixing, not a forward path | long | free, no licence charge | yes | works | S | spot only |
| ECB Euribor 1M to 12M (FM dataset) | ECB | monthly keys return 200; the daily keys I tried returned no series | term rates carry the priced path crudely (bank credit premium, monthly averages) | long | free | yes | works | S | crude fallback, not a probability |
| BlueGamma public pages | ECB, BoE, BoJ | 200 HTML. The page shows "Hike 91% / Hold 9%" for the ECB meeting on 17 Dec 2026 (+23bp implied) and Hike 84% (+21bp) for the BoJ meeting on 18 Dec 2026, with a path table. Daily from OIS | exactly the product wanted | forward curves only; history needs the trial | **Rate Data Terms v1.0 (1 Aug 2026) forbid scraping and automated extraction, storing beyond ordinary browsing, and any embedding or republishing without a written licence.** Personal viewing of the public pages is allowed. The API is under separate subscription terms (14-day free trial) | HTML, server rendered | n/a | n/a | **do not automate.** Manual cross-check only, or ask support@bluegamma.io for written permission |
| rateprobability.com | ECB, BoE, BoJ | 403 to every script request, including robots.txt | meeting-by-meeting paths from OIS; the earlier web search said free accounts refresh three times a day. I could not read the page | | UNVERIFIED | UNVERIFIED | blocked by a bot wall here | | open it by hand in a browser and read its terms before building on it |
| centralbank.watch | Fed, ECB, BoE, BoJ, RBA, RBNZ, SNB | 200 HTML. robots.txt allows crawling except /api/ and /admin/, crawl-delay 1 | live paths from ESTR, SONIA and TONA futures | n/a | its methodology page states only "For educational use. Not investment advice." and "All rights reserved"; nothing on automated use | HTML | n/a | S to M | manual cross-check. Automating it without written permission is a risk |
| Eurex 3M ESTR, ICE 3M SONIA and Osaka 3M TONA futures through IBKR on the laptop | ECB, BoE, BoJ | not testable here (needs your TWS or Gateway) | the real futures curve, same method as ZQ | settlement history where entitled | free with the account; some exchange data is delayed or needs a subscription | yes | n/a (laptop) | M each | **best quality; availability UNVERIFIED** |
| MoF JGB curve (we already pull JGB 2y to 40y) | BoJ | held | the front-end JGB yield, a proxy for the path, not a probability | long | free | yes | works | S | fallback proxy, labelled as such |
| JBA TIBOR | BoJ | 200 HTML; a terms-and-conditions page exists | 1M to 12M yen interbank rates | daily | read the terms first | HTML | n/a | S | UNVERIFIED terms, weak signal |
| CME FedWatch and CME pages | Fed | 403, "IP address is blocked ... scraping" | n/a | | CME forbids scraping | | | | never; we use ZQ through IBKR |

### Recommended path per bank
- **BoE (do first; fully free and official).** Download `latest-yield-curve-data.zip` daily on Railway (plain HTTPS, stable URL), read
  the short-end forward sheet, and turn the monthly forward path into a meeting-by-meeting probability using the standard method (the
  average forward rate after a meeting against the policy rate now). `oisddata.zip` gives daily history since 2009 for a forward
  record. This needs a hand-kept MPC meeting list (copy the dates from the Bank's published calendar; I did not verify them). Label it
  "priced, not forecast". Effort M.
- **ECB and BoJ (best route).** A laptop task in the same pattern as `fedwatch/run_zq.bat`: read the front €STR futures strip and the
  front TONA futures strip through IBKR, write to KV, and show with a data-age chip. The first step is a contract check (below). If
  the contracts are not available on your account, fall back to: ECB = Euribor 1M to 12M from the ECB portal as a crude "priced path
  direction" with no probability; BoJ = the MoF JGB 2y as a labelled proxy. Do not present either fallback as a meeting probability.
- **Manual cross-check for all three:** read BlueGamma or centralbank.watch by hand beside our number. Do not scrape them.

### What the owner does
1. **BoE: nothing to sign up for.** Test that the file downloads from any machine:

```
curl -s -L -A "Mozilla/5.0" -o boe_ois.zip "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip" && python -c "import zipfile;print(zipfile.ZipFile('boe_ois.zip').namelist())"
```

   Expect four xlsx files including "OIS daily data current month.xlsx".

2. **ECB and BoJ through the laptop:** with TWS or the Gateway logged in, run this contract search. It only reads, places nothing and costs
   nothing. Send me the printed lines.

```
python -c "
from ib_insync import IB
ib=IB(); ib.connect('127.0.0.1',4002,clientId=31)
for q in ('ESTR','SONIA','TONA','EURIBOR','SO3','FEI'):
    for d in ib.reqMatchingSymbols(q)[:8]:
        c=d.contract; print(q,'|',c.symbol,c.secType,c.primaryExchange,c.currency,d.derivativeSecTypes)
ib.disconnect()"
```

   I am not certain which symbols IBKR uses for these contracts (UNVERIFIED), which is why the search comes first. If futures
   contracts for 3M €STR (Eurex), 3M SONIA (ICE Europe) and 3M TONA (Osaka) appear, I can write the laptop pull and the Railway
   reader. Check your market-data subscriptions for Eurex, ICE Europe and Osaka (delayed data is fine for a context board).

3. **No account, key or new Railway variable is needed** for any recommended path. The only existing variable involved is
   `FRED_API_KEY` (US revisions), already used by the server.

### What can be wired once you have the results
- A BoE path card on the Macro Policy section: priced path, meeting probabilities, 1d / 1w / 1m ticks like the Fed strip, a data-age chip and the Evidence chip "priced, not forecast".
- ECB and BoJ cards from the laptop feed, or the labelled fallbacks.
- The release drawer with forecast, actual, revision and surprise history from the stored 13,100 releases.

### Side finding (UNVERIFIED, worth a look)
The BoE database series IUDSOIA (SONIA) steps from 3.7335 on 4 Nov to 3.9824 on 5 Nov 2026, which looks like a 25bp Bank Rate rise on
5 Nov. Today's issue text says "the BoE held at 3.75% on 2026-09-17" and shows central-bank tone "as of 5 Nov". If Bank Rate moved to
4.00% on 5 Nov, the desk's BoE inputs may be stale. Check the BoE tile and the policy-rates feed.

## 4. Evidence-rule note
All of these are priced or reported numbers. A market-implied probability describes what is priced, and consensus is what economists
expected. Neither forecasts direction. Surprise size is validated for range and size; the direction of a surprise is not.
