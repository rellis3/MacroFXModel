/**
 * Desk evidence — what this desk has TESTED, in one list.
 *
 * Every relationship a trader is tempted to narrate ("a rates shock means FX
 * vol", "it's priced in", "oil will reach breakevens") has either been tested
 * here or has not. This is the ledger of the ones that have: the claim, the
 * verdict, the number, the date, the write-up. It is read by the page (chips,
 * tooltips), by the morning brief and by the chain read, so that the prose leans
 * on measured results before it leans on folklore -- and says "tested null here"
 * when it touches a relationship that failed.
 *
 * Verdicts: 'validated' (pre-registered, passed, CI clear of zero), 'null'
 * (tested, nothing found), 'context' (a base rate or description; no claim of
 * prediction). Range claims are about RANGE; nothing here predicts direction.
 *
 * Pure data. Tested by js/deskEvidence.test.mjs (shape only).
 */

export const DESK_EVIDENCE = [
  {
    id: 'vix-inversion', verdict: 'validated', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S1',
    claim: 'VIX above VIX3M (near-term fear priced above the 3-month) is followed by a wider week',
    result: 'First day of inversion → next-5-session range vs matched controls: SPX500 +0.76 ATR, NAS100 +0.82, USD/JPY +0.44, XAU/USD +0.43 (86 entries since 2008, all CIs clear of zero). Inversions are brief (median 1 session).',
    use: 'Range, not direction. Applies on the first day of an inversion; the effect on later days of a long inversion was not tested.',
    instruments: ['SPX500', 'NQ', 'USDJPY', 'GOLD'],
  },
  {
    id: 'surprise-size', verdict: 'validated', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S7',
    claim: 'The size of a data surprise (actual vs consensus, in sigma) widens the release session, by family',
    result: 'Rate decisions: EUR/USD +0.42 ATR on the day, USD/JPY +0.27 (surprise size adds little -- the decision is the event). Employment: top-tercile surprises AUD/USD +0.19, EUR/USD +0.16 (≈2× the all-release effect). CPI: the release day is marginal, the NEXT session is wider (EUR/USD +0.27, USD/JPY +0.25). GDP: EUR/USD +0.22 on big surprises. PMI: USD/JPY +0.22. Retail sales: nothing. 7,932 pair-releases, 2017→.',
    use: 'Scale the expected range on the release session for employment / rate decisions; for CPI, on the session AFTER. Never a direction.',
    instruments: ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD'],
  },
  {
    id: 'nq-down-week', verdict: 'validated', date: '2026-09-17', doc: 'MD files/GROWTH_VS_YIELDS_TEST.md',
    claim: 'After a Nasdaq down-week the next session runs wider',
    result: 'NAS100 ≤ −1% over 5 sessions → next session +0.19 to +0.23 ATR vs matched controls (n=1,232; 2018+ holds; holds with rates quiet).',
    use: 'Range, not direction (5-day up-share afterwards 58%, a base rate). The yield leg it was sold with is a passenger.',
    instruments: ['NQ'],
  },
  {
    id: 'front-end-shock', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S3',
    claim: 'A front-end rates shock (2Y ±14bp in a week) means FX volatility the following week',
    result: 'Null on EUR/USD, USD/JPY and GBP/USD (~211 shocks each). After a 2Y UP shock EUR/USD and GBP/USD ran CALMER (−0.34 and −0.28 ATR, CIs clear of zero); after a 2Y DOWN shock USD/JPY was marginally wider (+0.33).',
    use: 'Do not write "the rate shock means a volatile week in FX". A hawkish front-end repricing has been followed by a quieter week in the dollar pairs.',
  },
  {
    id: 'priced-in', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S6',
    claim: '"It is priced in": a decision the front end has already repriced for moves markets less on the day',
    result: '85 FOMC decision days (2016→). Decision-day range ≈ 1.3 ATR on EUR/USD, USD/JPY, gold and SPX500 whether the prior 20-session |Δ2Y| was in the bottom tercile (<5bp) or the top (>16bp). Differences −0.11 to +0.07, CIs across zero.',
    use: 'Say a decision day runs about a third wider than a normal day; do not say prior repricing makes it smaller.',
  },
  {
    id: 'oil-to-breakevens', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S4',
    claim: 'An oil move takes time to reach inflation expectations (breakevens) -- a quiet link will catch up',
    result: 'No lag: a 20-day oil move of ±10% is followed by no excess breakeven change at 5, 10 or 20 sessions (CIs ±2-3bp around zero). Only 43% of oil shocks see breakevens move 5bp the same way within 20 sessions. Cross-correlation of the two 20-day changes is 0.37 at lag 0 and 0.09 at lag 20.',
    use: 'Oil and breakevens move in the same window. If breakevens did not move with oil, the bond market has already made its call -- do not write "not yet".',
  },
  {
    id: 'broken-link-resolution', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S5',
    claim: 'When real yields rise and the dollar (or gold) moves the wrong way, one leg gives way',
    result: 'Real +15bp & dollar −0.5% over 20 days (55 episodes): over the next 20 sessions the dollar caught up in 47%, fell further in 36%; the real yield gave back in 40%, rose further in 36%. Real +15bp & gold +2% (45): gold ≥+2% in 33%, ≤−2% in 29%. Means indistinguishable from unconditional.',
    use: 'History does not say which leg gives way. Describe the break; do not imply it resolves one way.',
  },
  {
    id: 'fed-two-moves', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S9',
    claim: 'After a Fed decision the first move (surprise: front end, dollar, stocks) is later unwound by a second move (the long end repricing the economy)',
    result: '84 FOMC days (2016→) vs non-FOMC days with a day-0 move of the same size: the share that gave back at least half within 20 sessions is the same -- 2Y 38% vs 39%, 10Y 50% vs 45%, dollar 48% vs 40%, SPX500 45% vs 51%; continuation rates likewise. Too few hawkish days (14) to score the curve; dovish days flattened no more than matched days.',
    use: 'A decision-day close has about even odds of being half-undone within a month -- the same as any big day. Say that as a base rate; do not narrate a Fed-specific "second move" as a tendency.',
  },
  {
    id: 'crowded-bond-short-fomc', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S10',
    claim: 'Everyone is short long bonds into the Fed; a consensus decision lets the long end rally and forces the shorts to cover',
    result: '84 meetings 2010→ with CFTC T-bond positioning. No squaring-up into meetings (leveraged gross rose +0.4pp). After crowded-short meetings the 30Y yield ROSE +4bp over 5 sessions vs −0.3bp after the rest; on consensus decisions +9.1bp [+1.3, +16.5] -- the shorts were paid, not squeezed. And into the 2026-09-16 meeting leveraged funds were the LEAST short in three years (94th percentile of net).',
    use: 'Check the CFTC percentile before repeating "everyone is short bonds"; do not narrate a post-Fed long-end rally as a tendency -- the base rate points the other way.',
  },
  {
    id: 'rotation-extreme', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S8',
    claim: 'A rotation extreme under a quiet index (Nasdaq vs Russell 20-day relative return in the top decile) precedes wider index ranges',
    result: '140 extremes: next-20-session range NAS100 −0.31 ATR [−0.86, +0.22], SPX500 −0.23; extreme extended in 45% of cases.',
    use: 'Rotation is description, not a warning.',
  },
  {
    id: 'stock-bond-flip', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S2',
    claim: 'Stocks and bonds falling together marks an inflation regime',
    result: 'Negative 20-day stock/yield correlation: 71 episodes since 2008, median 5 sessions, p75 17; 17% of days. Only 36 clean flips -- too few to test the range claim.',
    use: 'Say how long such episodes have typically lasted; do not claim what follows.',
  },
  {
    id: 'event-impact-map', verdict: 'validated', date: '2026-09-17', doc: 'MD files/EVENT_RESPONSE_BOOK.md',
    claim: 'Each scheduled release moves each pair by a characteristic SIZE, and most releases move nothing',
    result: 'Event Response Book, 76 families × 26 instruments, 30-minute spike ÷ an ordinary half-hour: central-bank decisions 5-9× (NZ OCR 6.9, FOMC 5.5, Fed rate 5.1, BoE 4.9), US payrolls 2.9×, US core CPI 2.8×; only 13 of 76 families clear 2× -- housing, permits, EU retail, GfK sit at 0.86-0.95×, quieter than an ordinary half-hour. Next-day size 1.35× for rates, ~1.0× for everything else. Next-day direction: median up-rate 50.5% across 558 rows.',
    use: 'An impact map: how wide to be through a release, and which releases deserve no scenario text at all. Size only; direction after news is a coin flip.',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'GOLD'],
  },
  {
    id: 'priced-in-direction', verdict: 'null', date: '2026-09-17', doc: 'MD files/EVENT_RESPONSE_BOOK.md#§6-§7',
    claim: '"Was it priced in": what yields did INTO a release changes what the outcome does to price',
    result: 'Two registered tests. §6 (lead-up × surprise interaction on the confirmatory cell): t = −0.14, fail. §7 (composite pre-event state -- Δ2y, Δ10y, Δ30y, Δreal, Δbreakeven, Δslope -- k-NN analogue): real arm 49.3% hit rate; the PLACEBO with the state shuffled scored 51.5%. Conditioning on the pre-event state made the predictor worse than ignoring it.',
    use: 'Never write "yields rose into it and the print was hot, so the pair went down". The conditional grid is noise; a placebo beat it.',
  },
  {
    id: 'cb-tone-direction', verdict: 'null', date: '2026-08-20', doc: 'MD files/CB_SENTIMENT_PRICE_TEST.md',
    claim: 'The FOMC statement\'s hawkish/dovish shift, or the first 30-minute reaction, predicts the next-day dollar move',
    result: 'N=82 meetings. First-30-minute reaction vs next-day dollar: sign agreement 46%, t = 0.32. Lexicon Δhawkishness vs next-day: t = −0.75 (though it IS priced inside 30 minutes, t = 2.04). |Δhawkishness| vs next-day size: t = 0.54.',
    use: 'The statement is priced in half an hour. Do not carry its tone forward as a next-day lean.',
  },
  {
    id: 'post-fomc-usd-drift', verdict: 'validated', date: '2026-08-20', doc: 'MD files/POST_FOMC_DRIFT_TEST.md',
    claim: 'The dollar basket drifts higher over the five sessions after an FOMC meeting, unconditionally',
    result: 'N=81 meetings: mean +26bp over 5 sessions, 65% positive, median +30bp; baseline non-FOMC windows −3bp, 49% positive; event mean at the 99.8th percentile of 10,000 placebos; halves 2016-20 +26bp, 2021-26 +26bp. The one directional base rate in this repo that survived a placebo and two halves. Not forward-proven.',
    use: 'A calendar base rate, stated as one: "the dollar has averaged +26bp over the five sessions after a Fed meeting, 65% of the time". Never a call on a single meeting; the outcome of the meeting does not change it.',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF'],
  },
  {
    id: 'yield-spread-sleeve', verdict: 'validated', date: '2026-07-17', doc: 'MD files/YIELD_SPREAD_STRATEGY.md',
    claim: 'The US-vs-foreign 2-year yield spread, z-scored, mean-reverts, and FX follows it',
    result: 'The one strategy that cleared every audit: OOS 2015-2025 with honest publication lags, ~109 trades, 63% win, PF 2.2, daily-MTM Sharpe ~1.1, every OOS year 2022-2026 positive, robust across the parameter grid. Entries are rare (~15-25 per pair per year). Paper-traded live since 2026-07.',
    use: 'A slow, weeks-long macro sleeve, not an intraday lean. When the page says a pair\'s 2Y spread z is extreme, that is the one macro read here with a validated directional record -- and its edge is mean-reversion of the SPREAD, not the level of rates.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'],
  },
  {
    id: 'price-vs-spread-divergence', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S11',
    claim: 'A pair moving against its yield spread (divergence) gets punished afterwards; moving with it (alignment) is safer',
    result: 'EUR/USD (Bund vs T-note) and GBP/USD (Gilt vs T-note), 2007→. Next-20-session range after a divergence: −0.51 ATR [−1.21, +0.19] and +0.16 [−0.86, +1.16] vs matched days; after alignment +0.10 / −0.28. The gap halves within 20 sessions 64-71% of the time, but the pair reversing toward the spread happened 48% / 39% vs 49% / 50% unconditionally -- no tendency about which leg gives.',
    use: 'Say a pair has detached from its yield spread as description. Do not call it a warning, and do not say the pair will come back to the spread. The validated yield-spread object here is the 2Y spread\'s own z-score mean reversion, a different thing.',
  },
  {
    id: 'squeeze-fuel', verdict: 'null', date: '2026-09-13', doc: 'MD files/SQUEEZE_VOL_TEST.md',
    claim: 'A crowded, underwater retail position is squeeze fuel',
    result: 'Crowded-and-underwater days were not wider than matched days on any of four instruments over nine years; direction flat. Retail is ~60% long on every major every day.',
    use: 'The position book is descriptive only.',
  },
  {
    id: 'approach-speed', verdict: 'null', date: '2026-09-12', doc: 'MD files/APPROACH_SPEED_CONTROL_TEST.md',
    claim: 'Price arriving slowly at a level dwells there',
    result: 'It dwells identically at random non-level prices. The level does no work; what survives is unconditional tape-speed persistence.',
    use: 'Tape speed is a property of the tape, not of levels.',
  },
  {
    id: 'yields-to-fx-direction', verdict: 'null', date: '2026-08-23', doc: 'memory: project_yield_asset_coupling',
    claim: 'Yield moves predict the direction of FX and indices',
    result: 'Forward coupling null; the relationship is real only in the same bar.',
    use: 'Never write that a yield move implies where a pair goes next.',
  },
];

/** The entries relevant to one instrument (validated ones with that instrument listed), plus every null. */
export function evidenceFor(instrument) {
  return DESK_EVIDENCE.filter(e => !e.instruments || e.instruments.includes(instrument));
}

/** Compact text block for an AI prompt. */
export function evidenceForPrompt(list = DESK_EVIDENCE) {
  const tag = { validated: 'VALIDATED', null: 'TESTED NULL', context: 'BASE RATE' };
  return list.map(e => `- [${tag[e.verdict] ?? e.verdict.toUpperCase()}, ${e.date}] ${e.claim}. ${e.result} USE: ${e.use}`).join('\n');
}
