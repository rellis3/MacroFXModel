// js/dataCatalogue.js — every series this desk pulls, why it is here, and what it proved.
//
// WHY THIS EXISTS. Asked what else was worth pulling from FRED, I suggested four series
// the repo was ALREADY pulling -- DCPF3M among them -- and separately claimed the desk had
// no FX implied-vol feed when EVZCLS has been configured all along (dead since 2025-03-11,
// but configured). Nobody could see the inventory, so the inventory kept getting
// re-proposed. A list of ids in six different constants is not a catalogue.
//
// The point is NOT the id list -- that can be grepped. It is the three columns a grep
// cannot give you:
//
//   why       what question this series was added to answer
//   verdict   what happened when that question was tested (ids into js/deskEvidence.js)
//   trap      how this particular feed lies, learned the hard way
//
// A series with no verdict is a candidate for study, not a gap in the data. That
// distinction is the whole value: on 2026-10-01 the honest answer to "what should we pull
// next" was "nothing -- test T10Y2Y, which you have had all along and have never scored".
//
// KEPT HONEST BY A TEST. js/dataCatalogue.test.mjs asserts every FRED id reachable in the
// code appears here and vice versa, so the catalogue cannot quietly drift from what the
// server actually fetches -- which is exactly how the inventory got lost the first time.
//
// Pure data. No fetch, no DOM.

/** Where a series comes from, and what that costs. */
export const SOURCES = {
  fred:  { label: 'FRED (St. Louis Fed)', keyed: 'optional', note: 'fredgraph.csv needs no key and is what most of this uses; the keyed API is only for series the CSV endpoint will not serve.' },
  cboe:  { label: 'CBOE daily index CSVs', keyed: false, note: 'Free, no key, back to 2014. Blocks some non-browser clients -- it works from Railway and may 403 from a laptop, which is not the feed being down.' },
  oanda: { label: 'OANDA v3', keyed: true, note: 'Price data. Candles are stamped with the session OPEN (17:00 New York), so the date on a daily bar is the session BEFORE the one it closes in.' },
  yahoo: { label: 'Yahoo Finance', keyed: false, note: 'Sector ETFs and single names. Proven keyless; no history guarantee.' },
  cme:   { label: 'CME settlements / QuikStrike', keyed: false, note: 'Scraped nightly into OI Data/. The option book and six years of recoverable implied vol.' },
};

/**
 * One row per series.
 *
 * `why`      the question it was added to answer
 * `readBy`   which parts of the desk consume it
 * `evidence` ledger ids in js/deskEvidence.js, or [] when the question has never been put
 * `trap`     how this feed misleads, where that has been learned
 */
export const CATALOGUE = [
  // ── The curve ─────────────────────────────────────────────────────────────
  { id: 'DGS1MO', source: 'fred', group: 'curve', label: 'US 1-month', why: 'The front of the curve, where the policy path is priced.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS3MO', source: 'fred', group: 'curve', label: 'US 3-month', why: 'The 10y-3m recession spread’s short leg.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS6MO', source: 'fred', group: 'curve', label: 'US 6-month', why: 'Fills the gap between bills and the 1-year.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS1',   source: 'fred', group: 'curve', label: 'US 1-year',  why: 'Policy expectations one year out.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS2',   source: 'fred', group: 'curve', label: 'US 2-year',  why: 'Almost purely a vote on the central bank between now and then; the leg the validated FX sleeve trades.', readBy: ['chapters', 'drill', 'weekMap', 'rates', 'nowcast'], evidence: ['yield-spread-sleeve', 'front-end-shock'] },
  { id: 'DGS3',   source: 'fred', group: 'curve', label: 'US 3-year',  why: 'Belly of the policy path.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS5',   source: 'fred', group: 'curve', label: 'US 5-year',  why: 'Hinge between policy and inflation pricing.', readBy: ['chapters', 'drill'], evidence: [] },
  { id: 'DGS7',   source: 'fred', group: 'curve', label: 'US 7-year',  why: 'Curve shape, for the level/slope/curvature split.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS10',  source: 'fred', group: 'curve', label: 'US 10-year', why: 'The world’s discount rate; the long leg of nearly every spread here.', readBy: ['chapters', 'drill', 'weekMap', 'rates', 'nowcast'], evidence: ['multi-spread-sleeve', 'yield-move-fx-range', 'yields-to-fx-direction'] },
  { id: 'DGS20',  source: 'fred', group: 'curve', label: 'US 20-year', why: 'Completes the long end for the curve surface.', readBy: ['chapters'], evidence: [] },
  { id: 'DGS30',  source: 'fred', group: 'curve', label: 'US 30-year', why: 'The inflation and deficit vote, least tied to the next meeting.', readBy: ['chapters', 'drill', 'weekMap', 'rates'], evidence: [] },
  { id: 'T10Y2Y', source: 'fred', group: 'curve', label: '10y minus 2y', why: 'The classic recession spread.', readBy: ['netLiquidity', 'liquidityGate'], evidence: ['curve-inversion'],
    trap: 'Fifty years of daily data collapse to TEN independent inversion episodes. Any statistic computed per DAY on this series is counting one event hundreds of times -- which is how the folk version survives. Tested 2026-10-01: the tradeable half is null.' },
  { id: 'THREEFYTP10', source: 'fred', group: 'curve', label: '10y term premium (ACM)', why: 'Splits the 10-year into expectations and the premium paid to hold duration.', readBy: ['rates', 'weekMap'], evidence: [], trap: 'Lags by days -- judge freshness on its own cadence, not the daily one.' },

  // ── Real yields and inflation pricing ─────────────────────────────────────
  { id: 'DFII5',  source: 'fred', group: 'inflation', label: '5y TIPS real yield', why: 'Nominal = real + breakeven; the real half is the genuine discount-rate hit.', readBy: ['chapters'], evidence: [] },
  { id: 'DFII10', source: 'fred', group: 'inflation', label: '10y TIPS real yield', why: 'The single biggest driver of gold and long-duration equities, and the one leg that separates a tightening from a repricing.', readBy: ['chapters', 'drill', 'weekMap', 'rates', 'netLiquidity', 'nowcast'], evidence: ['which-gold', 'fear-gold', 'broken-link-resolution'],
    trap: 'Stored to two decimals, so 5-session changes quantise to whole basis points -- coarser than the nominals, which matters when matching pre-event states.' },
  { id: 'T5YIE',  source: 'fred', group: 'inflation', label: '5y breakeven', why: 'What the market expects inflation to average over five years.', readBy: ['chapters'], evidence: [] },
  { id: 'T10YIE', source: 'fred', group: 'inflation', label: '10y breakeven', why: 'A breakeven move with a flat real yield is the market changing its mind about prices, not policy.', readBy: ['chapters', 'drill', 'weekMap', 'rates', 'nowcast'], evidence: ['oil-to-breakevens', 'crack-inflation-channel'] },
  { id: 'T5YIFR', source: 'fred', group: 'inflation', label: '5y5y forward', why: 'Inflation expected over five years starting five years out -- the leg least anchored to what has already printed.', readBy: ['chapters'], evidence: [] },
  { id: 'CPIAUCSL',      source: 'fred', group: 'inflation', label: 'CPI', why: 'What actually printed, against what was expected.', readBy: ['chapters'], evidence: ['surprise-size'] },
  { id: 'CPILFESL',      source: 'fred', group: 'inflation', label: 'Core CPI', why: 'The series policy actually reacts to.', readBy: ['chapters'], evidence: ['surprise-size'] },
  { id: 'PCEPILFE',      source: 'fred', group: 'inflation', label: 'Core PCE', why: 'The Fed’s stated target measure.', readBy: ['chapters'], evidence: [] },
  { id: 'PPIFIS',        source: 'fred', group: 'inflation', label: 'PPI final demand', why: 'Upstream price pressure before it reaches CPI.', readBy: ['chapters'], evidence: [] },
  { id: 'CES0500000003', source: 'fred', group: 'inflation', label: 'Average hourly earnings', why: 'The wage leg of the inflation picture.', readBy: ['chapters'], evidence: ['event-impact-map'] },

  // ── Policy and funding ────────────────────────────────────────────────────
  { id: 'DFEDTARU', source: 'fred', group: 'policy', label: 'Fed funds target (upper)', why: 'The anchor every other rate is priced against.', readBy: ['rates', 'weekMap'], evidence: ['post-fomc-usd-drift', 'fed-two-moves'] },
  { id: 'SOFR', source: 'fred', group: 'policy', label: 'SOFR', why: 'Secured overnight funding -- where plumbing stress shows first.', readBy: ['rates', 'weekMap'], evidence: ['repo-stress-range', 'funding-stress'],
    trap: 'CALENDAR, NOT STRESS. The 99th percentile over the floor fires on a quarter of sessions (month-end balance sheets); take month-end out and 12 of the remaining 15 episodes land on the 14th-18th, which is mid-month tax and settlement. Tested twice, null both times. The daily FRED series is only the published reference rate -- the NY Fed API carries the percentiles a stress read actually needs.' },
  { id: 'EFFR', source: 'fred', group: 'policy', label: 'Effective fed funds', why: 'Where unsecured overnight money actually trades versus the target.', readBy: ['rates', 'weekMap'], evidence: [] },
  { id: 'IORB', source: 'fred', group: 'policy', label: 'Interest on reserve balances', why: 'The floor the whole corridor sits on.', readBy: ['rates', 'weekMap'], evidence: [] },
  { id: 'IOER', source: 'fred', group: 'policy', label: 'Interest on excess reserves (retired)', why: 'The pre-2021 floor, spliced to IORB at 2021-07-29 so the history is continuous.', readBy: ['weekMap'], evidence: [],
    trap: 'Ends 2021-07-28 BY DESIGN. It is a historical leg, not a dead feed -- weekMapBuild splices it.' },
  { id: 'RPONTSYD',  source: 'fred', group: 'policy', label: 'Standing repo facility', why: 'The backstop that caps funding stress.', readBy: ['rates', 'weekMap'], evidence: ['funding-stress'],
    trap: 'Drawn on 667 of 2,123 sessions since 2018 -- 31%. "The SRF was used" is routine plumbing, not an alarm. De-clustered it gives 21 episodes, the last in 2024-01.' },
  { id: 'RRPONTSYD', source: 'fred', group: 'policy', label: 'Reverse repo', why: 'Drains reserves; one of the three legs of net liquidity.', readBy: ['rates', 'weekMap', 'netLiquidity', 'liquidityGate'], evidence: ['repo-stress-range'] },
  { id: 'WLCFLPCL',  source: 'fred', group: 'policy', label: 'Discount window', why: 'Who is borrowing at the penalty rate, which is a stress tell.', readBy: ['rates', 'weekMap'], evidence: [] },
  { id: 'DTB3',   source: 'fred', group: 'policy', label: '3-month T-bill', why: 'Bill supply and the front end of the money curve.', readBy: ['weekMap'], evidence: [] },
  { id: 'DCPF3M', source: 'fred', group: 'policy', label: '3-month commercial paper', why: 'Unsecured corporate funding -- CP minus bills is a bank-stress spread.', readBy: ['weekMap'], evidence: [],
    trap: 'Already pulled. I proposed adding it as a gap, which is the mistake this catalogue exists to prevent.' },

  // ── Balance sheet and liquidity ───────────────────────────────────────────
  { id: 'WALCL',   source: 'fred', group: 'liquidity', label: 'Fed balance sheet', why: 'The tide everything is meant to float on.', readBy: ['netLiquidity', 'liquidityGate', 'weekMap'], evidence: ['repo-stress-range', 'stock-bond-flip'] },
  { id: 'WTREGEN', source: 'fred', group: 'liquidity', label: 'Treasury general account', why: 'Drains or adds reserves as the Treasury spends.', readBy: ['netLiquidity', 'liquidityGate', 'weekMap'], evidence: [] },
  { id: 'WRESBAL', source: 'fred', group: 'liquidity', label: 'Reserve balances', why: 'What is actually in the system after the drains.', readBy: ['weekMap'], evidence: [] },
  { id: 'TOTBKCR', source: 'fred', group: 'liquidity', label: 'Bank credit', why: 'Whether the banking system is lending.', readBy: ['weekMap'], evidence: [], trap: 'Weekly, and lagged about two weeks behind the daily board. Judge its freshness on its own cadence -- reading it against a daily series makes it look permanently broken.' },
  { id: 'NFCI',    source: 'fred', group: 'liquidity', label: 'Chicago Fed financial conditions', why: 'One composite to sanity-check the hand-built liquidity read.', readBy: ['netLiquidity'], evidence: [], trap: 'Weekly, published Wednesdays for the prior week. It is a composite of 105 indicators, so it moves AFTER the things this desk already watches -- useful as a check, useless as a lead.' },

  // ── Credit ────────────────────────────────────────────────────────────────
  { id: 'BAMLH0A0HYM2', source: 'fred', group: 'credit', label: 'High-yield OAS', why: 'Lenders price the odds of not being repaid, a harder question than what a share is worth.', readBy: ['chapters', 'drill', 'weekMap', 'netLiquidity', 'liquidityGate', 'macro'], evidence: ['mv-creditstack-range', 'stock-bond-flip'],
    trap: 'ONLY ~3 YEARS OF HISTORY. FRED serves the ICE BofA OAS series on a trailing window -- 787 observations as of 2026-10-01, starting 2023 -- so every percentile and z-score built on the credit stack is measured against less than one cycle, not against 2008 or 2020. CREDIT_STRESS_TEST.md hit this in 2026-07 and moved that engine to Moody’s AAA10Y/BAA10Y (10,935 and 10,188 observations). The chapters, drill, weekMap and liquidity gate still read the short series.' },
  { id: 'BAMLC0A0CM',   source: 'fred', group: 'credit', label: 'Investment-grade OAS', why: 'The top of the stack; IG moving without HY says something different from both moving.', readBy: ['chapters', 'drill', 'weekMap'], evidence: ['mv-creditstack-range'], trap: 'Same ~3-year FRED window as the high-yield leg -- see BAMLH0A0HYM2.' },
  { id: 'BAMLH0A3HYC',  source: 'fred', group: 'credit', label: 'CCC OAS', why: 'The bottom of the stack -- where stress shows first.', readBy: ['chapters', 'drill'], evidence: ['mv-creditstack-range'], trap: 'Same ~3-year FRED window as the high-yield leg -- see BAMLH0A0HYM2.' },
  { id: 'AAA10Y', source: 'fred', group: 'credit', label: 'Moody’s Aaa minus 10y', why: 'The long-history credit leg. Exists because the ICE OAS series below only carry ~3 years, which is not a cycle.', readBy: ['creditStress'], evidence: [] },
  { id: 'BAA10Y', source: 'fred', group: 'credit', label: 'Moody’s Baa minus 10y', why: 'The credit spread proper, and with Aaa gives the quality slope. 10,188 observations against the ICE series’ 787.', readBy: ['creditStress'], evidence: [] },

  // ── Volatility ────────────────────────────────────────────────────────────
  { id: 'VIXCLS', source: 'fred', group: 'vol', label: 'VIX', why: 'What the market charges for equity insurance.', readBy: ['drill', 'weekMap', 'netLiquidity', 'macro', 'chapters'], evidence: ['vix-inversion', 'mv-vixterm-range', 'fear-gold'] },
  { id: 'GVZCLS', source: 'fred', group: 'vol', label: 'Gold implied vol (GVZ)', why: 'The only live option-implied vol this desk has for a tradeable it actually trades.', readBy: ['cvol', 'ivForecast'], evidence: ['iv-over-rv-wider'] },
  { id: 'EVZCLS', source: 'fred', group: 'vol', label: 'EUR/USD implied vol (EVZ)', why: 'The one FX option-implied vol feed -- what the market pays to hedge the euro.', readBy: ['cvol', 'volForecastBench'], evidence: [],
    trap: 'DEAD: last print 2025-03-11. /api/cvol flags it stale and the brief ignored that for months, narrating a 570-day-old 10.68 at "84.8th percentile" against today’s realized vol. Fixed 2026-10-01. Replacing the feed is unfinished business -- CBOE still computes EVZ.' },
  { id: 'OVXCLS', source: 'fred', group: 'vol', label: 'Oil implied vol (OVX)', why: 'Insurance on crude, the other commodity that drives this board.', readBy: ['chapters'], evidence: [] },

  // ── FX ────────────────────────────────────────────────────────────────────
  { id: 'DTWEXBGS', source: 'fred', group: 'fx', label: 'Broad dollar index', why: 'The unit everything else is priced in.', readBy: ['drill', 'weekMap', 'chapters'], evidence: ['post-fomc-usd-drift'] },
  { id: 'DEXUSEU', source: 'fred', group: 'fx', label: 'USD/EUR', why: 'Official daily FX fixings, for macro work where OANDA’s intraday tape is the wrong granularity.', readBy: ['regime'], evidence: [], trap: 'H.10 release -- lags several days. Not a live quote.' },
  { id: 'DEXJPUS', source: 'fred', group: 'fx', label: 'JPY/USD', why: 'Official daily yen fixing — the carry leg, and the one policy divergence shows up in first.', readBy: ['regime'], evidence: [] },
  { id: 'DEXUSUK', source: 'fred', group: 'fx', label: 'USD/GBP', why: 'Official daily sterling fixing, for month-scale regime work rather than the live tape.', readBy: ['regime'], evidence: [] },
  { id: 'DEXCAUS', source: 'fred', group: 'fx', label: 'CAD/USD', why: 'Official daily CAD fixing — the commodity-dollar leg of the regime table.', readBy: ['regime'], evidence: [] },
  { id: 'DEXSZUS', source: 'fred', group: 'fx', label: 'CHF/USD', why: 'Official daily CHF fixing — the haven leg, and the one that moves on SNB rather than growth.', readBy: ['regime'], evidence: [] },
  { id: 'DEXUSAL', source: 'fred', group: 'fx', label: 'USD/AUD', why: 'Official daily AUD fixing — the China-and-growth proxy of the majors.', readBy: ['regime'], evidence: [] },
  { id: 'DEXUSNZ', source: 'fred', group: 'fx', label: 'USD/NZD', why: 'Official daily NZD fixing — the smallest and most carry-sensitive of the majors.', readBy: ['regime'], evidence: [] },
  { id: 'DEXCHUS', source: 'fred', group: 'fx', label: 'CNY/USD', why: 'The managed rate, as a policy signal rather than a trade.', readBy: ['regime'], evidence: [] },

  // ── Commodities ───────────────────────────────────────────────────────────
  { id: 'DCOILWTICO', source: 'fred', group: 'commodity', label: 'WTI crude', why: 'Load-bearing for inflation expectations and every commodity currency.', readBy: ['crack', 'weekMap', 'brief'], evidence: ['oil-to-breakevens', 'crack-inflation-channel'],
    trap: 'Prints badly: +16.6% on 2026-09-28 and -16.1% on 2026-04-08 with no matching OANDA move, 2 such days in 125. Holidays are EMPTY (not zero) and parseFloat drops them. js/sourceConflict.js now names it when it misbehaves.' },
  { id: 'DGASNYH',  source: 'fred', group: 'commodity', label: 'RBOB gasoline', why: 'The refined leg of the 3-2-1 crack.', readBy: ['crack'], evidence: ['crack-inflation-channel', 'crack-blowout-range'] },
  { id: 'DHOILNYH', source: 'fred', group: 'commodity', label: 'Heating oil', why: 'The distillate leg of the crack.', readBy: ['crack'], evidence: ['crack-inflation-channel'] },
  { id: 'DHHNGSP',  source: 'fred', group: 'commodity', label: 'Henry Hub natural gas', why: 'The energy leg that is not oil, for the scan board.', readBy: ['drill'], evidence: [] },
  { id: 'DGORDER',  source: 'fred', group: 'growth', label: 'Durable goods orders', why: 'A real-economy leg for the growth read.', readBy: ['chapters'], evidence: [] },

  // -- Foreign rates: the legs of the one validated directional sleeve --------
  // OECD monthly series, which is exactly why the sleeve trades a z-scored SPREAD and
  // not a level: a monthly leg cannot carry a daily signal.
  { id: 'IRLTLT01DEM156N', source: 'fred', group: 'foreign', label: 'Germany 10y', why: 'The bund leg of the US-vs-foreign 10-year spread.', readBy: ['fredDash', 'yieldSpread'], evidence: ['multi-spread-sleeve', 'nonus-yield-gap-label'] },
  { id: 'IRLTLT01GBM156N', source: 'fred', group: 'foreign', label: 'UK 10y', why: 'The gilt leg -- and gilts leading Treasuries is a signal in its own right.', readBy: ['fredDash', 'yieldSpread'], evidence: ['multi-spread-sleeve', 'nonus-yield-gap-range'] },
  { id: 'IRLTLT01JPM156N', source: 'fred', group: 'foreign', label: 'Japan 10y', why: 'The JGB leg, and the anchor of the global carry trade.', readBy: ['fredDash', 'yieldSpread'], evidence: ['multi-spread-sleeve', 'yen-into-yields'] },
  { id: 'IRLTLT01AUM156N', source: 'fred', group: 'foreign', label: 'Australia 10y', why: 'The AUD long leg of the spread sleeve.', readBy: ['fredDash', 'yieldSpread'], evidence: ['multi-spread-sleeve'] },
  { id: 'IRLTLT01CAM156N', source: 'fred', group: 'foreign', label: 'Canada 10y', why: 'The CAD long leg of the spread sleeve.', readBy: ['fredDash', 'yieldSpread'], evidence: ['multi-spread-sleeve'] },
  { id: 'IRLTLT01CHM156N', source: 'fred', group: 'foreign', label: 'Switzerland 10y', why: 'The CHF long leg of the spread sleeve.', readBy: ['fredDash', 'yieldSpread'], evidence: ['multi-spread-sleeve'] },
  { id: 'IRSTCI01DEM156N', source: 'fred', group: 'foreign', label: 'Germany short rate', why: 'The 2-year-equivalent leg; the front end is where the validated version of the sleeve trades.', readBy: ['fredDash', 'yieldSpread'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01GBM156N', source: 'fred', group: 'foreign', label: 'UK 3-month interbank', why: 'Sterling short leg for the front-end spread.', readBy: ['fredDash', 'yieldSpread'], evidence: ['yield-spread-sleeve'] },
  { id: 'IRSTCI01JPM156N', source: 'fred', group: 'foreign', label: 'Japan short rate', why: 'The yen short leg -- the carry trade’s funding cost.', readBy: ['fredDash', 'yieldSpread'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01AUM156N', source: 'fred', group: 'foreign', label: 'Australia 3-month interbank', why: 'AUD short leg for the front-end spread.', readBy: ['fredDash', 'yieldSpread'], evidence: ['yield-spread-sleeve'] },
  { id: 'IRSTCI01CAM156N', source: 'fred', group: 'foreign', label: 'Canada short rate', why: 'CAD short leg for the front-end spread.', readBy: ['fredDash', 'yieldSpread'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01CHM156N', source: 'fred', group: 'foreign', label: 'Switzerland 3-month interbank', why: 'CHF short leg for the front-end spread.', readBy: ['fredDash', 'yieldSpread'], evidence: ['yield-spread-sleeve'],
    trap: 'A REPLACEMENT. The original CHF short series was discontinued 2024-03 and USDCHF’s z silently went null until this was swapped in on 2026-07-21. A dead foreign leg does not error -- it just stops producing signals for that one pair.' },
  { id: 'BAMLH0A1HYBB', source: 'fred', group: 'credit', label: 'BB OAS', why: 'The top of junk, for the quality spread within high yield.', readBy: ['fredDash'], evidence: [], trap: 'Same ~3-year FRED window as the rest of the ICE stack -- see BAMLH0A0HYM2.' },
  { id: 'VXVCLS', source: 'fred', group: 'vol', label: 'VIX 3-month (FRED route)', why: 'The 3-month leg of the VIX term structure, for the inversion read.', readBy: ['fredDash'], evidence: ['vix-inversion', 'mv-vixterm-range'],
    trap: 'A SECOND ROUTE to the same number -- the drill bundle takes VIX3M straight from CBOE. Two sources for one series is how they end up disagreeing.' },

  // -- The carry sleeve's own funding legs (server.js CARRY_PAIRS) ------------
  // A SECOND set of short-rate series, overlapping the dashboard's: the carry read keys
  // every currency to the IR3TIB01 3-month interbank family so the legs are comparable,
  // where the dashboard mixes IRSTCI01 and IR3TIB01 by availability. Same economics,
  // different series, and worth knowing before anyone compares the two numbers.
  { id: 'IR3TIB01USM156N', source: 'fred', group: 'foreign', label: 'US 3-month interbank', why: 'The funding leg every carry pair is quoted against.', readBy: ['carry'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01EZM156N', source: 'fred', group: 'foreign', label: 'Euro-area 3-month interbank', why: 'EUR funding leg for the carry read.', readBy: ['carry'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01JPM156N', source: 'fred', group: 'foreign', label: 'Japan 3-month interbank', why: 'JPY funding leg -- the short side of most carry.', readBy: ['carry'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01CAM156N', source: 'fred', group: 'foreign', label: 'Canada 3-month interbank', why: 'CAD funding leg for the carry read.', readBy: ['carry'], evidence: ['yield-spread-sleeve'] },
  { id: 'IR3TIB01NZM156N', source: 'fred', group: 'foreign', label: 'New Zealand 3-month interbank', why: 'NZD funding leg -- historically the long side of the classic carry pair.', readBy: ['carry'], evidence: ['yield-spread-sleeve'] },
];

export const byId = id => CATALOGUE.find(c => c.id === id) ?? null;
export const byGroup = g => CATALOGUE.filter(c => c.group === g);
export const GROUPS = [...new Set(CATALOGUE.map(c => c.group))];

/** Series with a known trap — the ones that have already cost something. */
export const withTraps = () => CATALOGUE.filter(c => c.trap);

/**
 * Pulled, displayed, and never actually tested.
 *
 * This is the list the question "what else should we pull?" should be answered from. On
 * 2026-10-01 it held T10Y2Y -- the most famous spread in macro, in the repo for months,
 * never scored.
 */
export const untested = () => CATALOGUE.filter(c => !c.evidence?.length);
