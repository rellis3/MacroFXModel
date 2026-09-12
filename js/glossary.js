/**
 * js/glossary.js — the ONE place a term on today.html is defined.
 *
 * Draft 2026-09-12, for review before anything is wired to it.
 *
 * Why one file. The page carries ~170 inline tooltips, each written from scratch,
 * so "underwater" is defined in three places in three wordings and none of them
 * link to each other. A reader who is learning needs one wording, met at the
 * moment of need, with the same map as the page itself. This file is that wording;
 * the tooltips, the term links, the "Reading this page" panel and the concept of
 * the day will all read from it, so it cannot drift from itself.
 *
 * Every entry has the same five fields, in the same order, because a learner
 * reads the SHAPE before the words:
 *
 *   definition   one sentence, plain English, what the thing IS
 *   why          why a trader cares -- what decision it changes
 *   scale        what a high reading means and what a low one means
 *   source       where it is measured from, and its evidence level
 *   not          the misreading it invites, stated so it is not made
 *
 * `evidence` is one of the four glyphs the page uses everywhere:
 *   validated    an out-of-sample result stands behind it
 *   context      measured and real, but not predictive
 *   unvalidated  a heuristic, not yet tested
 *   null         tested, and nothing was found
 *
 * `section` matches the drawer's own tabs so the reference has the same map as
 * the UI: day · levels · lean · why · evidence.
 */

export const GLOSSARY = [

  // ═══════════════════════════════════════════════════════════════════════════
  // THE DAY — what kind of day, and what kind of hour, is this?
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'atr', term: 'ATR', aliases: ['average true range', 'ATR(14)'], section: 'day', evidence: 'context',
    definition: 'The average size of a full day\'s move over the last 14 days, counting any gap from the previous close as part of the move.',
    why: 'It is the ruler. Every distance on this page — how far a level is, how big a stop should be, how fast the tape is moving — is measured in ATRs so that gold and EUR/USD can be read the same way.',
    scale: 'A distance of 0.1 ATR is close; 1.0 ATR is a whole normal day away. A stop inside 0.2 ATR is inside the noise.',
    source: 'Daily candles from OANDA, 14-day average of true range. A measurement, not a forecast.',
    not: 'Not a prediction of today\'s range — that is the expected day range, which is calibrated.',
  },
  {
    id: 'expected-range', term: 'Expected day range', aliases: ['exp range', 'hl med', 'median range'], section: 'day', evidence: 'validated',
    definition: 'How far this market typically travels from its high to its low in a day, from the forecast model, scaled to today\'s volatility.',
    why: 'It sizes stops and targets and says when a day is "done": once most of it is used, the odds of a further leg fall.',
    scale: 'Shown as points or pips. Compare the range used against it: 30% used early in London is normal; 90% used by noon means the day has already happened.',
    source: 'The vol forecast engine, calibrated out of sample — it beats a flat percentage-of-open on range but NOT on direction.',
    not: 'Not a direction. The model knows how far, never which way.',
  },
  {
    id: 'range-used', term: 'Range used', aliases: ['% used'], section: 'day', evidence: 'validated',
    definition: 'How much of today\'s expected range price has already travelled, high to low.',
    why: 'Fuel gauge. A trade that needs another 40% of the range when 85% is already used is asking for an unusual day.',
    scale: 'Under 40% and the day still has room; over 80% and continuation needs the day to be a big one.',
    source: 'Today\'s high−low so far, divided by the expected day range.',
    not: 'Not "the range is finished". Big days exist; this says they are the exception, not that they cannot happen.',
  },
  {
    id: 'range-map', term: 'Range map', aliases: ['forecast cone', 'OL75', 'OLmed', 'OHmed', 'OH75'], section: 'day', evidence: 'validated',
    definition: 'The strip on each card: where price sits between the forecast\'s typical low (OL med), typical high (OH med) and their wider 1-day-in-4 versions (OL 75, OH 75), anchored to the day\'s open, with the range actually travelled shaded.',
    why: 'One glance answers three questions: how much of the day is used, whether price is stretched to one side, and which forecast rung is next.',
    scale: 'Price near the open with little shading is an unstarted day. Price sitting past OH med with the shade all on one side is stretched — the next rung is the 1-in-4 one.',
    source: 'The calibrated forecast ladder for this instrument and today\'s sigma.',
    not: 'Not support and resistance. The rungs are how far a typical day reaches, which is a statement about distance, not about price reacting there.',
  },
  {
    id: 'vol-percentile', term: 'Vol percentile', aliases: ['σ P51', 'vol P', 'volatility percentile'], section: 'day', evidence: 'context',
    definition: 'Where today\'s volatility ranks against this market\'s own last year, from 0 (the quietest) to 100 (the wildest).',
    why: 'Sizing. The same 50-pip stop is generous at P15 and tight at P85. It also tells you whether a "big" move is big for this market or just normal.',
    scale: 'P80 and above: unusually jumpy, widen stops, expect the expected range to be exceeded more often. P20 and below: a compression stretch — ranges run smaller and breaks are rarer, until they are not.',
    source: 'Realised volatility (Yang-Zhang) ranked over the trailing 252 sessions.',
    not: 'Not a forecast of volatility rising or falling — that is the cone.',
  },
  {
    id: 'vol-cone', term: 'Volatility cone', aliases: ['σ building', 'σ cooling', 'cone 5d'], section: 'day', evidence: 'context',
    definition: 'Whether the last five days\' volatility ranks higher or lower than the last year\'s — vol building, or vol cooling.',
    why: 'Direction of volatility, not of price. Vol building means moves are getting bigger than the year suggests; cooling means the opposite. Size and stop width should follow it.',
    scale: 'A gap of 15 percentile points or more between the 5-day rank and the 1-year rank earns the chip. Smaller gaps are noise.',
    source: 'The forecast engine\'s 5-day vs 252-day sigma percentiles.',
    not: 'Not "a breakout is coming". Compression often precedes expansion, but the cone does not time it.',
  },
  {
    id: 'iv-rv', term: 'Realised vs implied', aliases: ['IV/RV', 'σ rich', 'σ cheap', 'implied vol'], section: 'day', evidence: 'context',
    definition: 'Realised volatility is what this market HAS done; implied is what the options market is CHARGING for the next month. The ratio says whether options are expensive or cheap relative to recent movement.',
    why: 'It is a price, so it is a sizing and expectations input: a rich ratio says the market is paying up for a move that has not happened; a cheap one says breakout risk is under-priced.',
    scale: 'Ratio above 1.2 is rich; below 0.85 is cheap. Between them it earns no chip.',
    source: 'Implied from the relevant vol index (GVZ for gold, EVZ for EUR/USD, VXN for NAS100, VIX for the other US indices). Only six instruments have one; FX crosses have realised only.',
    not: 'Not direction, and not a signal on the underlying. It says what options cost, nothing about which way price goes.',
  },
  {
    id: 'tape-speed', term: 'Tape speed', aliases: ['DRIFT', 'slow', 'mid', 'quick', 'FAST', 'approach speed'], section: 'day', evidence: 'validated',
    definition: 'How fast price has moved over the last 15 minutes, in ATR per minute, ranked against this market\'s own history for this time of day and cut into fifths: DRIFT, slow, mid, quick, FAST.',
    why: 'Speed persists. A slow tape tends to stay slow for the next hour and a fast one to stay fast, so the label says what kind of hour you are in and how wide the next one is likely to be.',
    scale: 'DRIFT (slowest fifth): the next hour usually stays put and ranges narrower than a typical one. FAST (fastest fifth): the next hour ranges wider than typical — but usually narrower than the hour just gone, because the burst is behind you. The middle three are an ordinary hour and earn no chip.',
    source: 'Every bar of five years of minute data, sampled, per instrument and session band. 68 of 68 instrument×band cells are monotonic. Tested against random non-level prices: the effect is the same away from levels as at them.',
    not: 'Not about levels. Slow arrivals do "dwell" at a level — and just as much at any random price arriving at the same speed. And never direction.',
  },
  {
    id: 'dwell', term: 'Dwell', aliases: [], section: 'day', evidence: 'validated',
    definition: 'The share of the next hour that price spent within 0.1 ATR of where it was at the start.',
    why: 'It is the plain measure of "did price go anywhere". High dwell means the hour was a hold; low dwell means it travelled.',
    scale: 'Above 80% is a stuck hour; below 55% is a moving one. It varies by session — the NY overlap dwells less than Asia at every speed.',
    source: 'The tape-speed tables; measured, per instrument and band.',
    not: 'Not "price respected the level". A slowly moving price stays near wherever it is, level or not — the control study showed exactly that.',
  },
  {
    id: 'next-hour-range', term: 'Next-hour range', aliases: ['vs typical hour', 'vs last hour'], section: 'day', evidence: 'validated',
    definition: 'The median high-to-low range of the next hour, in ATR, given the tape\'s current speed — shown against a typical hour for this session band and against the hour just gone.',
    why: 'It sets expectations for the hour you are about to trade: how much movement to plan for, and whether the last hour was the burst or the beginning.',
    scale: '"1.4× a typical hour" is a wide hour ahead. "0.8× the last hour" means calmer than what just happened. After fast tape both are usually true at once.',
    source: 'The tape-speed tables.',
    not: 'Not a target. It is a distribution\'s middle, and half of hours are wider than it.',
  },
  {
    id: 'session-bands', term: 'Session bands', aliases: ['Asia', 'London', 'NY overlap', 'Late'], section: 'day', evidence: 'context',
    definition: 'The four parts of the trading day used everywhere on this page: Asia 23:00–07:00, London 07:00–12:00, the NY overlap 12:00–17:00, and Late 17:00–23:00, all UTC.',
    why: 'The same speed, range or move is normal in one band and extreme in another — the fastest fifth in the NY overlap starts at roughly double Asia\'s. Every "against its own history" comparison is made inside the current band for that reason.',
    scale: 'Volatility rises through the day and peaks in the overlap; Late is the quietest and the one where a reading says least.',
    source: 'Fixed clock boundaries. The Asia range only becomes a usable level at 07:00, once it has finished forming.',
    not: 'Not exchange hours. FX has no open or close; these are the hours when different people are at their desks.',
  },
  {
    id: 'session-path', term: 'Session path', aliases: ['handoff', 'where is today headed'], section: 'day', evidence: 'validated',
    definition: 'Given what the sessions so far have done, what the rest of the day has historically looked like — and what the last session handed to this one.',
    why: 'A London session that used 70% of the range hands the overlap a different day from one that used 20%. This reads the handoff rather than treating every hour as a fresh start.',
    scale: 'Reported as probabilities of range outcomes, with the sample size. Read n before the number.',
    source: 'Session-conditional range statistics, checked out of sample.',
    not: 'Not direction — it says how much of the day is likely left, not which way.',
  },
  {
    id: 'news-multiplier', term: 'News multiplier', aliases: ['×1.3', 'event mult', 'news flag'], section: 'day', evidence: 'validated',
    definition: 'On a day with a major scheduled release, the expected range is scaled up by a fixed factor for that release bucket.',
    why: 'CPI and payrolls days are wider. Stops and targets set from a no-news range get run over.',
    scale: '×1.0 is a quiet day; ×1.3 or more means the release is expected to move this market materially. Many wait until it has cleared.',
    source: 'The vol forecast engine\'s event buckets, calibrated from past release days.',
    not: 'Not the direction of the reaction, and not a claim that the release will be a surprise.',
  },
  {
    id: 'regime', term: 'Regime', aliases: ['trending', 'ranging', 'HMM'], section: 'day', evidence: 'context',
    definition: 'Whether this market is currently in a trending or a ranging state, from a hidden-Markov model on recent price behaviour.',
    why: 'It changes what a level means: in a range, edges get faded; in a trend, they get run through.',
    scale: 'Trending with high confidence favours continuation; ranging favours mean reversion. Low confidence in either is the honest state and the page says so.',
    source: 'A fitted regime model per instrument. Descriptive of the recent past; the transition to the next regime is not forecast.',
    not: 'Not a prediction that the regime continues. Regimes end, and the model sees it late by construction.',
  },
  {
    id: 'sizing', term: 'Size', aliases: ['size ½', 'sizing label'], section: 'day', evidence: 'context',
    definition: 'A suggested position size relative to normal, from the regime and volatility state.',
    why: 'The one input that changes risk without changing the idea. Half size in a jumpy, low-confidence state is how a wrong idea stays affordable.',
    scale: '1 is normal; ½ means cut it; 0 means stand aside.',
    source: 'The regime engine\'s sizing label.',
    not: 'Not a signal to trade. It sizes a trade you have already decided on for other reasons.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVELS — where are they, and what happens there?
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ladder', term: 'Level ladder', aliases: ['rungs', 'OH med', 'OL med', 'OH 75', 'OL 75'], section: 'levels', evidence: 'validated',
    definition: 'The forecast\'s distances from today\'s open, laid out as prices: the typical high and low (OH med, OL med) and the 1-day-in-4 versions (OH 75, OL 75).',
    why: 'They are the day\'s expected reach, so they are where moves tend to run out of road. A target beyond OH 75 needs an unusual day.',
    scale: 'The "med" rungs are reached on about half of days; the "75" rungs on about a quarter. The hit rate beside each one is that number for this instrument.',
    source: 'The calibrated forecast ladder.',
    not: 'Not levels that price bounces off. The rung is a distance; whether price reacts there is a separate, largely null, question.',
  },
  {
    id: 'hit-rate', term: 'Hit rate', aliases: ['hits 52%', 'median UTC'], section: 'levels', evidence: 'validated',
    definition: 'How often, out of 100 days, price touches this rung — and the typical time of day it does.',
    why: 'It turns a level into odds. A rung hit on 52% of days by ~14:10 is a coin flip with a clock; one hit on 24% is a stretch.',
    scale: 'Above 50% is the ordinary reach of the day. Below 30% is the tail.',
    source: 'Counted over this instrument\'s history.',
    not: 'Not the probability of a reaction at the rung. Touching and turning are different events.',
  },
  {
    id: 'level-atlas', term: 'Level Atlas', aliases: ['base rates', 'what history says from here'], section: 'levels', evidence: 'context',
    definition: 'For the level nearest to price right now: what has historically happened after a first touch from this distance at this hour — how often it held, broke, or went nowhere.',
    why: 'It replaces "support should hold" with a measured base rate. If the base rate is a coin flip, the level is not a reason.',
    scale: 'Read the sample size first. A 60% hold rate on 40 touches is noise; on 1,200 it is a base rate.',
    source: 'Measured over past touches, per level family. Not live: the numbers do not change during the day.',
    not: 'Not a signal. Most level families have no forward edge once tested against a paired control — the Atlas reports the rate, it does not recommend the trade.',
  },
  {
    id: 'turn-zones', term: 'Turn zones', aliases: ['exhaustion zones', 'where the day reverses'], section: 'levels', evidence: 'context',
    definition: 'Price bands, not single prices, where this session\'s moves have most often run out and reversed — measured as distances from the open in today\'s sigma.',
    why: 'They say where a move is more likely to be tired than fresh, which is a sizing and patience input.',
    scale: 'Shown per session and as the dominant zone for the day. A move entering a zone has done what moves usually do; it is not obliged to stop.',
    source: 'Exhaustion statistics by session, descriptive.',
    not: 'Not reversal signals, and not prices to place orders at — they are zones by construction.',
  },
  {
    id: 'options-walls', term: 'Options walls', aliases: ['call wall', 'put wall', 'OI walls'], section: 'levels', evidence: 'context',
    definition: 'Strikes where a large amount of options open interest sits — the call wall above price, the put wall below.',
    why: 'Dealers hedging those positions can make price sticky near the walls and faster away from them, so they are candidate places for the day to stall.',
    scale: 'A wall matters more the closer it is and the bigger it is relative to the rest of the board. A wall at 2 ATR is furniture.',
    source: 'CME open interest by strike, captured nightly. Real data; a forward test of what walls actually do is collecting.',
    not: 'Not a guarantee of anything. Max pain, in particular, was tested here and found null as a predictor.',
  },
  {
    id: 'max-pain', term: 'Max pain', aliases: [], section: 'levels', evidence: 'null',
    definition: 'The strike at which the most options would expire worthless — the price that hurts option buyers most.',
    why: 'Folklore says price is drawn toward it into expiry. Shown because people ask; labelled because it was tested.',
    scale: 'Its distance from price is reported. That distance does not predict where price goes.',
    source: 'Computed from the options board. Tested on this platform 2026-09-10: no forward relationship.',
    not: 'Not a magnet. Treat it as trivia with a number attached.',
  },
  {
    id: 'oi-regime', term: 'Options regime', aliases: ['PIN', 'ACCELERATE', 'gamma'], section: 'levels', evidence: 'context',
    definition: 'From the shape of options positioning: whether dealer hedging is likely to dampen moves today (PIN — price stuck near here, drifting back to the middle) or amplify them (ACCELERATE — a break is more likely to run).',
    why: 'It says which kind of day the options market has set up: fade the edges, or respect the break.',
    scale: 'PIN favours fading; ACCELERATE favours following. It is one input to the direction tag, not the tag itself.',
    source: 'Net gamma from the options board. Descriptive of positioning; the forward test is collecting.',
    not: 'Not a direction. PIN says stuck, ACCELERATE says fast — neither says up or down.',
  },
  {
    id: 'handles', term: 'Handles', aliases: ['round numbers', '$10 handle'], section: 'levels', evidence: 'null',
    definition: 'Round-number prices — every $10 on gold, every 50 pips on a major.',
    why: 'People place orders at them, so they are visible in the position book. They were included in the approach-speed test as the family nobody claims is special.',
    scale: 'They separated arrivals exactly as much as "real" levels did — which is how the whole level story was shown to be a speed story.',
    source: 'Arithmetic.',
    not: 'Not levels with an edge. They are useful for describing where the crowd is, not for predicting price.',
  },
  {
    id: 'prior-ranges', term: 'Prior ranges', aliases: ['prior day high', 'prior day low', 'Asia high', 'Asia low', 'previous Asia'], section: 'levels', evidence: 'context',
    definition: 'Yesterday\'s high and low, and the high and low of the Asia session (23:00–07:00 UTC) — the reference prices every desk has on its screen.',
    why: 'They are where the most people are watching, so reactions there are at least crowded. That is a reason to expect noise, not necessarily a reason to expect a turn.',
    scale: 'Distance in ATR. Today\'s Asia range only counts as a level from 07:00 — before that it is still being made, and reading it earlier is reading the answer off the question.',
    source: 'Price history.',
    not: 'Not tested edges. The line-touch studies here found nothing tradeable at them once the paired control was run.',
  },
  {
    id: 'proximity', term: 'Proximity', aliases: ['⚑', 'decision moment'], section: 'levels', evidence: 'context',
    definition: 'Live price is within a few pips of one of the key levels right now.',
    why: 'It is a decision moment: whatever you think about the level, the time to act on it is now, not after.',
    scale: 'The flag shows the level and the distance. It clears as price moves away.',
    source: 'Live price against the ladder.',
    not: 'Not a recommendation to trade the level — only that the question is live.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAN & FLOW — which way is it leaning, and who is positioned?
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'direction-tag', term: 'Direction tag', aliases: ['lean up', 'lean down', 'mixed', 'agree 3/5'], section: 'lean', evidence: 'context',
    definition: 'The page\'s one-word read of which way this market is aiming — up, down, or mixed — from the higher-timeframe trend, today\'s session flow, the range used, positioning and the macro read, with dissent pulling it to MIXED.',
    why: 'It is the headline, and the "3/5" beside it is the honest part: how many of the reads agree. A lean on 5/5 and a lean on 3/5 are different animals.',
    scale: '4/5 or 5/5 agreement is a lean worth respecting; 3/5 is a coin flip with a tilt; MIXED means the reads disagree and the page will not pretend otherwise.',
    source: 'Arithmetic agreement across reads the page already computes. Not a backtested rule.',
    not: 'Not a forecast with a track record. It summarises what the inputs say; the ledger that will score it against outcomes is not built yet.',
  },
  {
    id: 'pair-composite', term: 'Pair composite', aliases: ['legs', 'composite signal', '⚖'], section: 'lean', evidence: 'context',
    definition: 'Four legs averaged into one number: today\'s technical flow, COT positioning, the fundamental gap, and carry.',
    why: 'It shows agreement and disagreement across different kinds of evidence, which is more useful than any single leg.',
    scale: 'Score from −1 to +1; the count of legs agreeing matters more than the score.',
    source: 'Each leg is computed elsewhere on the page and labelled with its own evidence. The carry leg is the only one with a validated result behind it.',
    not: 'Not a signal. It is arithmetic agreement, and one leg being validated does not validate the average.',
  },
  {
    id: 'htf-trend', term: 'HTF trend', aliases: ['higher-timeframe trend'], section: 'lean', evidence: 'context',
    definition: 'The direction of the daily and 4-hour trend, independent of anything happening today.',
    why: 'It is the slowest input, so it is the one today\'s noise least affects. Trading against it needs a reason.',
    scale: 'Up, down, or flat. The direction tag weighs it heavily.',
    source: 'Moving-average structure on daily and H4 bars.',
    not: 'Not a timing tool. Trend-following on FX was tested here and found null as a strategy; the trend is context for where the wind blows, not a system.',
  },
  {
    id: 'cot', term: 'COT', aliases: ['large speculators', 'CFTC', 'COT extreme', 'crowding percentile'], section: 'lean', evidence: 'context',
    definition: 'The weekly CFTC report of who holds what in the futures market — here, the net position of large speculators, ranked against its own history as a percentile.',
    why: 'It says how crowded the professional side is. A crowd at the 90th percentile long has little room to add and a lot of room to unwind.',
    scale: 'Above the 90th or below the 10th percentile is an extreme and earns a warning chip. Extremes are contrarian context: a reason not to join late, not a reason to fade.',
    source: 'CFTC, published Fridays for the previous Tuesday — days lagged by construction. Crosses without a direct contract are derived from each currency\'s own.',
    not: 'Not a timing signal. Extremes persist for weeks; the chip warns about crowding, it does not call the turn.',
  },
  {
    id: 'position-book', term: 'Position book', aliases: ['OANDA book', 'retail long', 'the crowd right now'], section: 'lean', evidence: 'context',
    definition: 'OANDA\'s snapshot of its own retail clients\' open positions by price — what share are long, what share short, and where they got in.',
    why: 'It is positioning at a higher frequency than COT (every 20 minutes, not weekly) and from a different crowd. The two disagreeing is itself a read.',
    scale: 'Retail is long-biased almost everywhere, so "62% long" says little on its own. Above 65% or below 35% near spot is one-sided. The pain figures are the informative part.',
    source: 'OANDA, head counts not money, one broker\'s clients, up to 20 minutes stale. Crowding is measured within 10% of spot; positions further away are excluded and their share reported.',
    not: 'Not the market, not institutions, not a signal. Retail on FX tends to mirror momentum, so "fade the crowd" is not independent of trend-following — which was tested here and found null.',
  },
  {
    id: 'underwater', term: 'Underwater', aliases: ['pain', 'longs underwater', 'shorts underwater'], section: 'lean', evidence: 'context',
    definition: 'A position that is losing at today\'s price: a long opened above where price is now, or a short opened below it.',
    why: 'A crowd that is losing is a crowd that can be forced out. "64% long" tells you who is there; "82% of shorts underwater" tells you who gets squeezed if price keeps going.',
    scale: 'Above 60% of one side underwater is a lot of pain; near 50% is nothing. Crowded AND underwater is the squeeze setup; crowded and in profit is not — a winning crowd has no reason to be forced out.',
    source: 'Entry prices in the OANDA position book against spot.',
    not: 'Not a direction call. Pain says who is vulnerable and how fast a move could accelerate, not which way price goes next.',
  },
  {
    id: 'far-from-spot', term: 'Far from spot', aliases: ['excluded', 'stale positions'], section: 'lean', evidence: 'context',
    definition: 'The share of the position book sitting more than 10% from today\'s price — left out of the crowding figure.',
    why: 'A book spans every price ever traded. Gold carries "long clusters" at 1,286 and 1,810 against a 4,350 spot. Counting them made every market read 100% long; excluding them makes the number mean something.',
    scale: 'On a quiet major it is under 10%. On gold, which has doubled, it is nearly 80% — some of those are years-old positions nobody closed, some are six-month-old positions that are simply far away. Either way they say little about who is crowded now.',
    source: 'Arithmetic on the book.',
    not: 'Not "abandoned". Far from spot in a fast-trending market includes live positions; the label was corrected for that reason.',
  },
  {
    id: 'crowd-moving', term: 'Crowd moving', aliases: ['24h', '7d', '30d deltas'], section: 'lean', evidence: 'context',
    definition: 'How the retail long-share has changed over the last day, week and month, in points.',
    why: 'A level says who is there; the change says whether they are piling in or getting out — which is the more interesting question.',
    scale: 'A move of 5 points or more earns colour. "No record yet" means the series does not reach back that far: it started 11 September 2026 and fills in as it runs.',
    source: 'The recorded position-book history, 20-minute resolution for two weeks, daily beyond.',
    not: 'Not a signal. It is the beginning of a record from which one could be tested.',
  },
  {
    id: 'squeeze', term: 'Squeeze', aliases: ['short squeeze', 'liquidation'], section: 'lean', evidence: 'context',
    definition: 'A move that accelerates because the losing side is forced to close, and closing means trading in the direction of the move.',
    why: 'It is the mechanism behind the sharpest moves. The ingredients are visible in advance — a crowded side, mostly underwater — even though the trigger is not.',
    scale: 'Crowded and underwater is fuel. Whether it catches is a separate question this page does not answer.',
    source: 'The position book\'s pain figures.',
    not: 'Not a prediction. Fuel sits unlit for weeks. It is a statement about volatility if a move comes, not about whether one does.',
  },
  {
    id: 'contrarian', term: 'Contrarian read', aliases: ['fade the crowd'], section: 'lean', evidence: 'null',
    definition: 'The idea that when the crowd is heavily one way, the better trade is the other way.',
    why: 'It is the folklore reading of positioning, and it contains a real observation — crowds are most one-sided at the worst moments — dressed as an edge it has not earned.',
    scale: 'Used here only as a warning against joining a crowded trade late, never as a reason to fade it.',
    source: 'Retail on FX mirrors momentum, so fading retail is trend-following in disguise; trend-following on FX was tested here and found null.',
    not: 'Not a signal. When the page says "contrarian context" it means "do not add to this", not "do the opposite".',
  },
  {
    id: 'move-decomposition', term: 'Move decomposition', aliases: ['macro vs own', 'what moved this today'], section: 'lean', evidence: 'context',
    definition: 'How much of today\'s move in this pair is explained by the shared macro factors — the dollar, rates, risk mood — and how much is the pair\'s own.',
    why: 'A move that is all macro will reverse with the macro; a move that is the pair\'s own has its own reason and its own momentum. They are traded differently.',
    scale: 'Reported as a split. "80% macro" means this pair is along for the ride; "80% own" means something specific is happening here.',
    source: 'Regression of the pair\'s return on the factor returns, measured, exact split.',
    not: 'Not a forecast of either component continuing.',
  },
  {
    id: 'divergence', term: 'Divergence', aliases: ['diverges from peers'], section: 'lean', evidence: 'context',
    definition: 'This pair is moving differently from the pairs it usually moves with.',
    why: 'Either something specific is happening here, or the peers are wrong and this one is early. Both are worth knowing; neither is decided by the chip.',
    scale: 'Earns a chip only when the gap to its usual co-movers is unusual against history.',
    source: 'Rolling correlation against the pair\'s normal cluster.',
    not: 'Not mean-reversion bait. Divergences resolve in both directions.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WHY — the macro backdrop
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'macro-scorecard', term: 'Macro Scorecard', aliases: ['composite', 'fundamentally strong', 'fundamentally weak'], section: 'why', evidence: 'context',
    definition: 'Each currency scored on its real economic data — inflation, growth, jobs, demand, trade, rates — grouped into six factors and averaged with equal weight, then ranked strongest to weakest.',
    why: 'It is the "why" behind the FX board: not which currency is strong, but on what. A composite of +0.3 that every factor contributes to is a different statement from one that inflation drags across four factors that disagree.',
    scale: 'From −1 to +1. Read the factor count first: a currency scored on 3 of 6 factors is a thinner statement than one on all six, and the page will not pair a thin one against a deep one.',
    source: 'This platform\'s own engines on FRED data, each dimension already on a −1..+1 scale. Missing and discontinued data are left out, never counted as neutral.',
    not: 'Not a forecast. Macro-as-signal has been tested here five times and found null every time. The composite explains why the board looks the way it does; it does not say where it goes.',
  },
  {
    id: 'factor', term: 'Factor', aliases: ['six factors', 'rates & policy', 'inflation', 'growth', 'labour market', 'domestic demand', 'external balance'], section: 'why', evidence: 'context',
    definition: 'One of six groups the economic dimensions are sorted into before scoring: rates & policy, inflation, growth, labour market, domestic demand, external balance.',
    why: 'Grouping first is what makes the weighting a decision. Three dimensions measure rates and two measure inflation, so averaging all twelve flat would hand rates triple weight and inflation double — not because anyone decided that, but because more series happen to point at them.',
    scale: 'Each factor scores −1 to +1 and reports how many of its series are fresh enough to count. A factor resting on one of three series is a weaker statement than one on all three.',
    source: 'Equal weights, deliberately: any other weighting is a claim about what drives FX, and those claims have not survived testing here.',
    not: 'Not independent. Growth and labour move together; the six are a grouping for honesty, not six separate bets.',
  },
  {
    id: 'dominant-factor', term: 'Dominant factor', aliases: ['led by', 'mostly a … story'], section: 'why', evidence: 'context',
    definition: 'For one currency, the factor furthest from neutral — what its score is mostly a story about.',
    why: 'It turns "USD +0.14" into "USD is strong on inflation and weak on growth", which is a thing you can think about and argue with.',
    scale: 'Shown beside each currency in the ranking.',
    source: 'The largest absolute factor score.',
    not: 'Not the most important factor in general — the one pulling hardest today.',
  },
  {
    id: 'driver', term: 'Driver', aliases: ['what is separating the board', 'factor spread'], section: 'why', evidence: 'context',
    definition: 'Across all eight currencies, the factor with the widest spread between the highest and lowest — the axis the FX board is sorted on today.',
    why: 'A factor every currency agrees on cannot separate them however extreme its level. The driver is where the macro disagreement actually sits, so it is the lens to read the pairs through.',
    scale: 'Reported as the factor, its spread, and which currency sits at each end. Today\'s driver at the time of writing: external balance, CAD highest, JPY lowest.',
    source: 'Dispersion of factor scores across currencies.',
    not: 'Not a prediction that the driver will move price. Dispersion says where the disagreement is, not that it resolves.',
  },
  {
    id: 'fundamental-gap', term: 'Fundamental gap', aliases: ['macro edge', 'base minus quote'], section: 'why', evidence: 'context',
    definition: 'For a pair, the base currency\'s factor scores minus the quote\'s, factor by factor, then averaged equally.',
    why: 'It says which factor carries the fundamental case for this pair and whether the others agree — a gap every factor contributes to is a real story; a gap one factor drags across four that disagree is a coin toss with a narrative.',
    scale: 'From −1 to +1 with the number of factors agreeing. Null when fewer than four dimensions or two factors are shared.',
    source: 'Differenced at the factor level, deliberately — differencing raw dimensions gave rates three votes and inflation two by accident.',
    not: 'Not a signal. Context for the why, never the when.',
  },
  {
    id: 'yield-spread-z', term: 'Yield-spread z', aliases: ['carry z', 'the validated leg'], section: 'why', evidence: 'validated',
    definition: 'How unusual the gap between two countries\' rates is right now, against its own history, in standard deviations.',
    why: 'It is the one leg on this page with a real out-of-sample result behind it (PF 2.19, Sharpe ~1.1), and it works by fading extremes — when the spread is stretched, it tends to come back.',
    scale: 'Beyond ±2 is stretched. The bot that trades it acts only at extremes, and entries are rare — 15 to 25 per pair per year.',
    source: 'Six pairs only. Tested, validated, and traded live.',
    not: 'Not the level of rates. Japan always pays less; the z removes that so only the deviation votes.',
  },
  {
    id: 'carry', term: 'Carry', aliases: ['rate differential'], section: 'why', evidence: 'context',
    definition: 'The interest you earn or pay for holding one currency against another, from the difference in their short-term rates.',
    why: 'It is the structural wind. High-carry currencies get bought in calm markets and dumped in scared ones.',
    scale: 'Used on this page as a deviation from its own history, never as a level, because a level barely changes between sessions and is a fixed offset dressed as a vote.',
    source: 'Short-rate differentials from FRED, z-scored.',
    not: 'Not free money. Carry trades lose more in a week of risk-off than they earn in months.',
  },
  {
    id: 'real-yield', term: 'Real yield', aliases: ['TIPS', 'breakeven', 'nominal = real + breakeven'], section: 'why', evidence: 'context',
    definition: 'The yield a lender earns after inflation. A nominal 10-year yield splits into the real yield plus the market\'s expected inflation (the breakeven).',
    why: 'The same headline "yields up" can be a serious headwind or barely matter depending on which half moved. A real-yield rise makes holding anything that pays no income — gold above all — cost more; a breakeven rise does not.',
    scale: 'Reported as today\'s basis-point change in each half, and which dominated.',
    source: 'US Treasury and TIPS yields, daily. The decomposition is an identity, not a model.',
    not: 'Not a forward signal for FX or indices — that coupling was tested here and is null beyond the same day.',
  },
  {
    id: 'priced-in', term: 'Priced in', aliases: ['moves priced', '2-year vs policy rate'], section: 'why', evidence: 'context',
    definition: 'How many rate cuts or hikes the market has already assumed, from the gap between the 2-year yield and the policy rate.',
    why: 'A currency does not respond to the level of rates; it responds to rates coming in different from what was already assumed. This is why a central bank can cut and its currency rises.',
    scale: '"Two cuts priced" means a single cut is a hawkish surprise. Zero priced means any move is news.',
    source: 'FRED 2-year and policy series.',
    not: 'Not a forecast of the central bank. It is a reading of what the market has bet on.',
  },
  {
    id: 'correlation-regime', term: 'Correlation regime', aliases: ['HIGH', 'NORMAL', 'LOW correlation'], section: 'why', evidence: 'context',
    definition: 'How much the markets on this board are moving together right now, from rolling correlations across pairs.',
    why: 'In a HIGH regime three trades can be one position — the same dollar bet wearing three hats. In a LOW regime setups diversify better than usual.',
    scale: 'Reported as the mean absolute correlation and a state. HIGH is the state to size down in.',
    source: 'Rolling pairwise correlations of daily returns.',
    not: 'Not a prediction of the regime lasting; correlation spikes in panics and fades after.',
  },
  {
    id: 'discontinued', term: 'Discontinued', aliases: ['stale', 'behind', 'no live source'], section: 'why', evidence: 'context',
    definition: 'A data series whose source has stopped publishing — as opposed to one that is merely late.',
    why: 'They look identical on a page (both show an old date) and mean opposite things: "check back tomorrow" versus "not coming back without a new data source". The macro pages now say which.',
    scale: 'A series is flagged behind when older than its cadence allows — 130 days for monthly, 300 for quarterly. It is flagged discontinued when the provider has withdrawn it: five currencies\' CPI and two countries\' retail sales are in that state now.',
    source: 'Checked against FRED directly. Discontinued dimensions score nothing rather than a frozen print.',
    not: 'Not neutral. Missing data is left out of every average; it is never counted as zero.',
  },
  {
    id: 'cadence', term: 'Cadence', aliases: ['monthly', 'quarterly', 'publication lag'], section: 'why', evidence: 'context',
    definition: 'How often a data series publishes — monthly, quarterly — and therefore how old its newest reading can be while still being current.',
    why: 'A quarterly print is legitimately 250 days old late in the following quarter. Judging it on a monthly budget marked healthy data stale across the whole board until this was fixed.',
    scale: 'Monthly: a print older than ~80 days means a release is probably missing. Quarterly: ~320.',
    source: 'Each engine now reports the cadence of its own series.',
    not: 'Not the same for every currency in a dimension. Retail sales is monthly for the US and quarterly for the other seven.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EVIDENCE & EXECUTION — how much to trust it, and whether it can be traded at all
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'evidence-glyphs', term: 'Evidence glyphs', aliases: ['✓', '~', '?', '∅', 'validated', 'context', 'unvalidated', 'null'], section: 'evidence', evidence: 'context',
    definition: 'Every chip and section on the page carries one of four marks: ✓ validated (an out-of-sample result stands behind it), ~ context (measured and real, but not predictive), ? unvalidated (a heuristic not yet tested), ∅ null (tested, and nothing was found).',
    why: 'The page shows things of very different weight side by side. The glyph is how you tell a calibrated forecast from a heuristic without reading the tooltip.',
    scale: 'On a typical card only two things are ✓: the range map and the tape. That is honest, and it is the point.',
    source: 'Assigned by what has actually been tested on this platform, and changed when a test changes it.',
    not: 'Not a ranking of usefulness. Context is most of what a trader uses; ✓ just means it has earned a claim about the future.',
  },
  {
    id: 'oos', term: 'Out of sample', aliases: ['OOS', 'in-sample', 'walk-forward'], section: 'evidence', evidence: 'context',
    definition: 'A result measured on data the model never saw while it was being built.',
    why: 'Anything can be made to fit the past. Only what holds on unseen data has earned a claim about the future — which is why ✓ requires it.',
    scale: 'The page reports in-sample and out-of-sample separately where both exist, and flags when the sign flips between them.',
    source: 'A date split, typically 60/40, fixed before looking.',
    not: 'Not a guarantee. Out-of-sample results decay too; they just decay from something rather than from nothing.',
  },
  {
    id: 'spread-atr', term: 'Spread / ATR', aliases: ['cost', 'execution feasibility', '£ cost', 'dead'], section: 'evidence', evidence: 'validated',
    definition: 'The spread you pay to trade, as a fraction of the market\'s daily range.',
    why: 'It is the one input that can disqualify a setup regardless of direction. Cost outruns edge as the timeframe gets shorter, and past a certain ratio no strategy tested here survived it.',
    scale: 'Above 0.15 is dead — 0 of 30 strategy cells survived at that cost. Below 0.05 is cheap. The chip turns critical at the line.',
    source: 'Live spreads from the broker against ATR. Tested across every strategy on this platform.',
    not: 'Not a small detail. Two strategies here were positive gross and three to eight times underwater after cost.',
  },
  {
    id: 'paired-control', term: 'Paired control', aliases: ['control study', 'random non-level'], section: 'evidence', evidence: 'context',
    definition: 'To test whether a level does anything, measure the same statistic at a random moment that is NOT a level — matched on instrument, time of day and speed — and compare, pair by pair.',
    why: 'It is how most of the level folklore was retired here. Slow arrivals dwell at levels — and just as much at random prices arriving at the same speed. The level was how you noticed it, not the cause.',
    scale: 'The number that decides it is the level increment: the effect at levels minus the effect at controls, at the same speed. Zero or negative means the level does no work.',
    source: 'The method behind the tape-speed read, the line-touch verdicts and the HL result.',
    not: 'Not pedantry. Every level claim on this page that was believed before this test turned out to be a property of the day or the speed, not the line.',
  },
  {
    id: 'banked-null', term: 'Banked null', aliases: ['null result', 'tested and found nothing'], section: 'evidence', evidence: 'null',
    definition: 'A question that was asked properly, tested, and answered "no" — and then recorded so it is not asked again by accident.',
    why: 'Nulls are the most valuable results on the platform: each one is an idea you no longer have to spend money finding out about. Macro as a signal, trend-following on FX, max pain, the HL line signal, CB-sentiment momentum, fading retail — all banked.',
    scale: 'A banked null stays on the page only in the Research shelf, labelled, and never carries weight on a card.',
    source: 'The study write-ups in MD files/ and the project memory.',
    not: 'Not "it does not exist". It means "it did not survive the honest test here" — which is the only version of existing that pays.',
  },
  {
    id: 'calibrated', term: 'Calibrated', aliases: ['calibration'], section: 'evidence', evidence: 'context',
    definition: 'A forecast is calibrated when the things it says happen 75% of the time actually happen about 75% of the time.',
    why: 'It is the difference between a number and a probability. The vol cone\'s "P75" rung is calibrated; the direction tag is not, yet.',
    scale: 'Checked on the Calibration page for the range forecasts. Direction, by that page\'s own check, is a coin flip.',
    source: 'Realised outcomes against stated probabilities, out of sample.',
    not: 'Not accuracy. A calibrated forecast can be wide and useless; calibration only means it is honest about its own uncertainty.',
  },
  {
    id: 'sample-size', term: 'n', aliases: ['sample size', 'touches', 'sessions'], section: 'evidence', evidence: 'context',
    definition: 'How many cases a number was measured on.',
    why: 'Read it before the number. A 60% hold rate on 40 touches is noise; on 1,200 it is a base rate. Every statistic on the page shows its n so a thin one cannot masquerade as a result.',
    scale: 'Under 30 is anecdote. Hundreds is a base rate. Thousands, and the confidence interval is what to read.',
    source: 'Counted.',
    not: 'Not a guarantee of independence — touches on the same day are not separate evidence, which is why the studies bootstrap by day.',
  },
  {
    id: 'percentile', term: 'Percentile', aliases: ['<p20', '>p80', 'p40–60', 'rank'], section: 'evidence', evidence: 'context',
    definition: 'Where a reading sits against its own history: p80 means higher than 80% of past readings.',
    why: 'It is how the page makes gold and EUR/USD comparable, and how "big" becomes "big for this market at this time of day".',
    scale: 'Below p20 and above p80 are the tails and earn chips; the middle is ordinary and earns nothing.',
    source: 'Ranked against the instrument\'s own history, usually within the current session band.',
    not: 'Not a probability of anything happening next.',
  },
];

// ── lookups ──────────────────────────────────────────────────────────────────
export const SECTION_LABEL = {
  day: 'The day — what kind of day, and what kind of hour, is this?',
  levels: 'Levels — where are they, and what happens there?',
  lean: 'Lean & flow — which way is it leaning, and who is positioned?',
  why: 'Why — the macro backdrop',
  evidence: 'Evidence & execution — how much to trust it, and whether it can be traded at all',
};
export const EVIDENCE_GLYPH = { validated: '✓', context: '~', unvalidated: '?', null: '∅' };

export const byId = Object.fromEntries(GLOSSARY.map(g => [g.id, g]));

/** Find an entry by term or alias, case-insensitive. */
export function lookup(text) {
  const t = String(text || '').trim().toLowerCase();
  return GLOSSARY.find(g => g.term.toLowerCase() === t || g.aliases.some(a => a.toLowerCase() === t)) ?? null;
}
