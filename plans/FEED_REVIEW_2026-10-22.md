# Feed review: are we missing any golden feeds?

*2026-10-22. Method: read `js/dataCatalogue.js` (106 series) and `js/dataFeeds.js` (156 entries), grepped the repo for each candidate
before calling it missing, then probed every remaining candidate against the live source for reachability and the last observation
date. Nothing here has been tested for predictive value. "Golden" means: free or keyless, fresh, and it explains a move this desk
already tries to explain. The ledger's own result applies throughout: range and timing claims validate, direction claims do not, so
the first test for any new feed should be a RANGE target.*

## What we already have (not missing)

Much of what usually gets proposed is already pulled: NFCI, forward inflation (T5YIFR, DFII5), the full Cboe vol suite (VIX, 9D, 3M,
6M, VVIX, SKEW, VXN, RVX, DSPX, COR1M, COR3M, VIXEQ), MOVE, GVZ, OVX, GPR, BIS bank lending, the H.4.1 and H.8 funding reads, TGA,
ECB / BoE / Bundesbank yields, CME QuikStrike and Cboe option chains, OANDA order and position books, CFTC COT, GDPNow and Cleveland
nowcasts, and Brent (it is in the drill bundle as `brent`; it is only absent from the catalogue list).

## The real backlog is tested-ness, not coverage

**61 of the 106 catalogued series are pulled and have no ledger entry.** Among them: NFCI, T5YIFR, DFII5, T5YIE, WTREGEN, WRESBAL,
EFFR, IORB, OVXCLS, the daily FRED FX series and most of the curve. The feature store (step 1) and the harness (step 2) make testing
them cheap, so the highest-return move is a range-first scan of the series we already hold, before adding any new feed.

## Genuinely missing, probed 2026-10-22

| candidate | source | access | latest | why it could be golden | first test | caveat |
|---|---|---|---|---|---|---|
| **Dollar vs majors and vs EM** (DTWEXAFEGS, DTWEXEMEGS) | FRED | key | 2026-10-16 | splits the broad dollar. Today's "dollar +0.9% with real yields −16bp" reads as safe haven if it is vs majors and as risk-off if it is vs EM | does the split explain the broken real-yield → dollar link | lags about 4 business days |
| **Treasury auctions** (schedule and results) | fiscaldata.treasury.gov | keyless | live; lists today's 5-year | scheduled supply events that move yields, and the calendar deliberately drops them (`nasdaqReleases.js` SKIP regex) | next-day range after 2/5/7/10/30-year auctions | tail vs when-issued is not in this API; bid-to-cover is |
| **Economic Policy Uncertainty, daily** (USEPUINDXD) | FRED | key | 2026-10-20 | a daily headline-risk gauge, aimed at the range target where this desk's validated results sit | EPU decile → next-5-session range, like `vix-inversion` | built from news text; revisions possible |
| **St. Louis stress index** (STLFSI4) | FRED | key | 2026-10-09 | a second financial-stress read beside NFCI, which we hold but have not tested | add to the same range scan | weekly, a week behind |
| **Prediction markets** (Kalshi, Polymarket) | public APIs | keyless | live | market-implied probabilities for Fed, CPI and geopolitical events, which headlines can only describe | context only until it has a record | thin liquidity, possible geo restriction, untested |
| **Crypto derivatives** (funding rate, open interest) | Binance, Bybit | keyless | live | leverage and crowding for BTC, which is on the board | funding extreme → next-day range | **Binance futures refuses US IPs; test from Railway before relying on it**, Deribit/OKX public APIs as fallback |
| **Cboe put/call ratios** (equity, total, index) | cdn.cboe.com CSV | keyless | live | a long daily sentiment series for the Nasdaq and S&P | extreme ratio → next-5-session range | files carry disclaimer header lines |
| **Central-bank balance sheets** (ECBASSETSW weekly, JPNASSETS monthly) | FRED | key | 2026-10-16 / 2026-09-01 | the liquidity differential behind EUR and JPY, next to the Fed's WALCL we hold | slow; a regime variable, not a trigger | low frequency |
| **FRED index closes** (SP500, NASDAQCOM) | FRED | key | 2026-10-21 | an independent cross-check on the indices and a clean long history for point-in-time studies | none, infrastructure | SP500 is limited to the last 10 years |
| **Expected inflation** (EXPINF1YR, EXPINF10YR) and **sticky / median CPI** | FRED | key | 2026-10-01 / 2026-09-01 | inflation persistence, beyond market breakevens | slow context | monthly |
| **EIA weekly inventories** | api.eia.gov | **free key needed** | n/a | the Wednesday oil catalyst; WTI already has a source conflict | oil range on inventory days | needs registration |
| T10Y3M | FRED | key | 2026-10-21 | the recession-curve variant | trivial | adds little |

**Not worth adding:** GDELT (rate-limited to one request per 5 seconds, noisy), AAII and NAAIM (scraped weekly surveys), FINRA margin
debt (monthly, slow), mortgage rates.

## Recommended order

1. **Test what we already hold, range-first.** One harness scan of NFCI, OVX, MOVE, EPU and the unused vol and credit series against
   next-5-session range, with the registry's FDR and a mirror placebo. No new plumbing.
2. **Add the dollar split and EPU to the feature store.** They are FRED series, the builder already exists, and both aim at questions
   the page asks every day.
3. **Treasury auctions into the catalyst list.** Keyless, scheduled, and currently excluded on purpose; it needs the SKIP rule narrowed
   and a measured effect before it earns a place.
4. **Prediction markets and crypto funding as context panels,** labelled untested, after checking reachability from Railway.

## One thing this review found about the pipeline

The macro scorecard showed 1 of 6 factors per currency on 2026-10-21 and 5 to 6 of 6 on 2026-10-22, the day after a redeploy. The
cause is not confirmed; cold caches after a restart is the likeliest reading, since the data-health feed showed the CPI store fresh at the
time. Either way, a state that looks like missing data is worth labelling on the page instead of letting it read as a thin economy.
