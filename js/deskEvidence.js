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
    id: 'vix-inversion', domain: 'volatility', verdict: 'validated', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S1',
    claim: 'VIX above VIX3M (near-term fear priced above the 3-month) is followed by a wider week',
    result: 'First day of inversion → next-5-session range vs matched controls: SPX500 +0.76 ATR, NAS100 +0.82, USD/JPY +0.44, XAU/USD +0.43 (86 entries since 2008, all CIs clear of zero). Inversions are brief (median 1 session).',
    use: 'Range, not direction. Applies on the first day of an inversion; the effect on later days of a long inversion was not tested.',
    instruments: ['SPX500', 'NQ', 'USDJPY', 'GOLD'],
  },
  {
    id: 'surprise-size', domain: 'events', verdict: 'validated', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S7',
    claim: 'The size of a data surprise (actual vs consensus, in sigma) widens the release session, by family',
    result: 'Re-run 2026-09-19 on the robust sigma (7,938 pair-releases): rate decisions EUR/USD +0.38 ATR on the day, +0.51 on big surprises, GBP/USD +0.38 the session after, USD/JPY +0.24; employment EUR/USD +0.17 on big surprises (≈2× the all-release +0.07), USD/JPY +0.16 the session after; CPI shows up the SESSION AFTER on EUR/USD (+0.16) and USD/CAD (+0.14), on the day for GBP/USD (+0.17); GDP USD/CAD +0.26 on big surprises; PMI USD/JPY +0.21. Retail sales marginal (+0.11/+0.12, at the bar). The first run had AUD/USD employment +0.19 and EUR/USD CPI-next +0.27; both smaller now -- the tercile membership moved with the scale.',
    use: 'Scale the expected range on the release session for employment / rate decisions; for CPI, on the session AFTER. Never a direction.',
    instruments: ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD'],
  },
  {
    id: 'nq-down-week', domain: 'price', verdict: 'validated', date: '2026-09-17', doc: 'MD files/GROWTH_VS_YIELDS_TEST.md',
    claim: 'After a Nasdaq down-week the next session runs wider',
    result: 'NAS100 ≤ −1% over 5 sessions → next session +0.19 to +0.23 ATR vs matched controls (n=1,232; 2018+ holds; holds with rates quiet).',
    use: 'Range, not direction (5-day up-share afterwards 58%, a base rate). The yield leg it was sold with is a passenger.',
    instruments: ['NQ'],
  },
  {
    id: 'front-end-shock', domain: 'macro', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S3',
    claim: 'A front-end rates shock (2Y ±14bp in a week) means FX volatility the following week',
    result: 'Null on EUR/USD, USD/JPY and GBP/USD (~211 shocks each). After a 2Y UP shock EUR/USD and GBP/USD ran CALMER (−0.34 and −0.28 ATR, CIs clear of zero); after a 2Y DOWN shock USD/JPY was marginally wider (+0.33).',
    use: 'Do not write "the rate shock means a volatile week in FX". A hawkish front-end repricing has been followed by a quieter week in the dollar pairs.',
  },
  {
    id: 'priced-in', domain: 'events', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S6',
    claim: '"It is priced in": a decision the front end has already repriced for moves markets less on the day',
    result: '85 FOMC decision days (2016→). Decision-day range ≈ 1.3 ATR on EUR/USD, USD/JPY, gold and SPX500 whether the prior 20-session |Δ2Y| was in the bottom tercile (<5bp) or the top (>16bp). Differences −0.11 to +0.07, CIs across zero.',
    use: 'Say a decision day runs about a third wider than a normal day; do not say prior repricing makes it smaller.',
  },
  {
    id: 'oil-to-breakevens', domain: 'macro', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S4',
    claim: 'An oil move takes time to reach inflation expectations (breakevens) -- a quiet link will catch up',
    result: 'No lag: a 20-day oil move of ±10% is followed by no excess breakeven change at 5, 10 or 20 sessions (CIs ±2-3bp around zero). Only 43% of oil shocks see breakevens move 5bp the same way within 20 sessions. Cross-correlation of the two 20-day changes is 0.37 at lag 0 and 0.09 at lag 20.',
    use: 'Oil and breakevens move in the same window. If breakevens did not move with oil, the bond market has already made its call -- do not write "not yet".',
  },
  {
    id: 'broken-link-resolution', domain: 'macro', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S5',
    claim: 'When real yields rise and the dollar (or gold) moves the wrong way, one leg gives way',
    result: 'Real +15bp & dollar −0.5% over 20 days (55 episodes): over the next 20 sessions the dollar caught up in 47%, fell further in 36%; the real yield gave back in 40%, rose further in 36%. Real +15bp & gold +2% (45): gold ≥+2% in 33%, ≤−2% in 29%. Means indistinguishable from unconditional.',
    use: 'History does not say which leg gives way. Describe the break; do not imply it resolves one way.',
  },
  {
    id: 'fed-two-moves', domain: 'events', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S9',
    claim: 'After a Fed decision the first move (surprise: front end, dollar, stocks) is later unwound by a second move (the long end repricing the economy)',
    result: '84 FOMC days (2016→) vs non-FOMC days with a day-0 move of the same size: the share that gave back at least half within 20 sessions is the same -- 2Y 38% vs 39%, 10Y 50% vs 45%, dollar 48% vs 40%, SPX500 45% vs 51%; continuation rates likewise. Too few hawkish days (14) to score the curve; dovish days flattened no more than matched days.',
    use: 'A decision-day close has about even odds of being half-undone within a month -- the same as any big day. Say that as a base rate; do not narrate a Fed-specific "second move" as a tendency.',
  },
  {
    id: 'crowded-bond-short-fomc', domain: 'positioning', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S10',
    claim: 'Everyone is short long bonds into the Fed; a consensus decision lets the long end rally and forces the shorts to cover',
    result: '84 meetings 2010→ with CFTC T-bond positioning. No squaring-up into meetings (leveraged gross rose +0.4pp). After crowded-short meetings the 30Y yield ROSE +4bp over 5 sessions vs −0.3bp after the rest; on consensus decisions +9.1bp [+1.3, +16.5] -- the shorts were paid, not squeezed. And into the 2026-09-16 meeting leveraged funds were the LEAST short in three years (94th percentile of net).',
    use: 'Check the CFTC percentile before repeating "everyone is short bonds"; do not narrate a post-Fed long-end rally as a tendency -- the base rate points the other way.',
  },
  {
    id: 'rotation-extreme', domain: 'price', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S8',
    claim: 'A rotation extreme under a quiet index (Nasdaq vs Russell 20-day relative return in the top decile) precedes wider index ranges',
    result: '140 extremes: next-20-session range NAS100 −0.31 ATR [−0.86, +0.22], SPX500 −0.23; extreme extended in 45% of cases.',
    use: 'Rotation is description, not a warning.',
  },
  {
    id: 'stock-bond-flip', domain: 'macro', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S2',
    claim: 'Stocks and bonds falling together marks an inflation regime',
    result: 'Negative 20-day stock/yield correlation: 71 episodes since 2008, median 5 sessions, p75 17; 17% of days. Only 36 clean flips -- too few to test the range claim.',
    use: 'Say how long such episodes have typically lasted; do not claim what follows.',
  },
  {
    id: 'event-impact-map', domain: 'events', verdict: 'validated', date: '2026-09-17', doc: 'MD files/EVENT_RESPONSE_BOOK.md',
    claim: 'Each scheduled release moves each pair by a characteristic SIZE, and most releases move nothing',
    result: 'Event Response Book, 76 families × 26 instruments, 30-minute spike ÷ an ordinary half-hour: central-bank decisions 5-9× (NZ OCR 6.9, FOMC 5.5, Fed rate 5.1, BoE 4.9), US payrolls 2.9×, US core CPI 2.8×; only 13 of 76 families clear 2× -- housing, permits, EU retail, GfK sit at 0.86-0.95×, quieter than an ordinary half-hour. Next-day size 1.35× for rates, ~1.0× for everything else. Next-day direction: median up-rate 50.5% across 558 rows.',
    use: 'An impact map: how wide to be through a release, and which releases deserve no scenario text at all. Size only; direction after news is a coin flip.',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'GOLD'],
  },
  {
    id: 'priced-in-direction', domain: 'events', verdict: 'null', date: '2026-09-17', doc: 'MD files/EVENT_RESPONSE_BOOK.md#§6-§7',
    claim: '"Was it priced in": what yields did INTO a release changes what the outcome does to price',
    result: 'Two registered tests. §6 (lead-up × surprise interaction on the confirmatory cell): t = −0.14, fail. §7 (composite pre-event state -- Δ2y, Δ10y, Δ30y, Δreal, Δbreakeven, Δslope -- k-NN analogue): real arm 49.3% hit rate; the PLACEBO with the state shuffled scored 51.5%. Conditioning on the pre-event state made the predictor worse than ignoring it.',
    use: 'Never write "yields rose into it and the print was hot, so the pair went down". The conditional grid is noise; a placebo beat it.',
  },
  {
    id: 'cb-tone-direction', domain: 'events', verdict: 'null', date: '2026-08-20', doc: 'MD files/CB_SENTIMENT_PRICE_TEST.md',
    claim: 'The FOMC statement\'s hawkish/dovish shift, or the first 30-minute reaction, predicts the next-day dollar move',
    result: 'N=82 meetings. First-30-minute reaction vs next-day dollar: sign agreement 46%, t = 0.32. Lexicon Δhawkishness vs next-day: t = −0.75 (though it IS priced inside 30 minutes, t = 2.04). |Δhawkishness| vs next-day size: t = 0.54.',
    use: 'The statement is priced in half an hour. Do not carry its tone forward as a next-day lean.',
  },
  {
    id: 'post-fomc-usd-drift', domain: 'events', verdict: 'validated', date: '2026-08-20', doc: 'MD files/POST_FOMC_DRIFT_TEST.md',
    claim: 'The dollar basket drifts higher over the five sessions after an FOMC meeting, unconditionally',
    result: 'N=81 meetings: mean +26bp over 5 sessions, 65% positive, median +30bp; baseline non-FOMC windows −3bp, 49% positive; event mean at the 99.8th percentile of 10,000 placebos; halves 2016-20 +26bp, 2021-26 +26bp. The one directional base rate in this repo that survived a placebo and two halves. Not forward-proven.',
    use: 'A calendar base rate, stated as one: "the dollar has averaged +26bp over the five sessions after a Fed meeting, 65% of the time". Never a call on a single meeting; the outcome of the meeting does not change it.',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF'],
  },
  {
    id: 'yield-spread-sleeve', domain: 'macro', verdict: 'validated', date: '2026-07-17', doc: 'MD files/YIELD_SPREAD_STRATEGY.md',
    claim: 'The US-vs-foreign 2-year yield spread, z-scored, mean-reverts, and FX follows it',
    result: 'The one strategy that cleared every audit: OOS 2015-2025 with honest publication lags, ~109 trades, 63% win, PF 2.2, daily-MTM Sharpe ~1.1, every OOS year 2022-2026 positive, robust across the parameter grid. Entries are rare (~15-25 per pair per year). Paper-traded live since 2026-07.',
    use: 'A slow, weeks-long macro sleeve, not an intraday lean. When the page says a pair\'s 2Y spread z is extreme, that is the one macro read here with a validated directional record -- and its edge is mean-reversion of the SPREAD, not the level of rates.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'],
  },
  {
    id: 'price-vs-spread-divergence', domain: 'macro', verdict: 'null', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S11',
    claim: 'A pair moving against its yield spread (divergence) gets punished afterwards; moving with it (alignment) is safer',
    result: 'EUR/USD (Bund vs T-note) and GBP/USD (Gilt vs T-note), 2007→. Next-20-session range after a divergence: −0.51 ATR [−1.21, +0.19] and +0.16 [−0.86, +1.16] vs matched days; after alignment +0.10 / −0.28. The gap halves within 20 sessions 64-71% of the time, but the pair reversing toward the spread happened 48% / 39% vs 49% / 50% unconditionally -- no tendency about which leg gives.',
    use: 'Say a pair has detached from its yield spread as description. Do not call it a warning, and do not say the pair will come back to the spread. The validated yield-spread object here is the 2Y spread\'s own z-score mean reversion, a different thing.',
  },
  {
    id: 'fomc-leadup-surprise-table', domain: 'events', verdict: 'context', date: '2026-09-17', doc: 'MD files/MARKET_SENSE_TESTS.md#S12',
    claim: 'When the long end had already moved into the meeting and the Fed surprised hawkish, price sold off over the following days',
    result: '84 meetings as a lead-up × surprise table. The described cell (30Y up into it × hawkish day 0) has n=7. Margins five sessions later: hawkish surprise → SPX up 36% [14,64], dollar up 64% [43,86]; dovish → dollar up 35% [15,55]; 30Y up into it → gold up 29% [13,45] (one margin of 27 clearing 50%, expected by chance). On the day: hawkish → dollar up 43%, dovish → dollar up 20%.',
    use: 'Say it as what it is: the combination has happened seven times; the surrounding cells are coin flips. Describe the reaction on the day; do not carry it forward as a direction.',
  },
  {
    id: 'squeeze-fuel', domain: 'positioning', verdict: 'null', date: '2026-09-13', doc: 'MD files/SQUEEZE_VOL_TEST.md',
    claim: 'A crowded, underwater retail position is squeeze fuel',
    result: 'Crowded-and-underwater days were not wider than matched days on any of four instruments over nine years; direction flat. Retail is ~60% long on every major every day.',
    use: 'The position book is descriptive only.',
  },
  {
    id: 'approach-speed', domain: 'price', verdict: 'null', date: '2026-09-12', doc: 'MD files/APPROACH_SPEED_CONTROL_TEST.md',
    claim: 'Price arriving slowly at a level dwells there',
    result: 'It dwells identically at random non-level prices. The level does no work; what survives is unconditional tape-speed persistence.',
    use: 'Tape speed is a property of the tape, not of levels.',
  },
  // ── technical, price and execution: the same discipline, applied earlier ────
  {
    id: 'tape-speed-persistence', domain: 'price', verdict: 'validated', date: '2026-09-12', doc: 'MD files/APPROACH_SPEED_CONTROL_TEST.md',
    claim: 'The speed of the tape persists: a slow 15-minute approach is followed by a slow hour, a fast one by a fast hour',
    result: 'Unconditional on levels: 15-min |Δclose|/ATR quintiles within session band, next-hour dwell monotonic in 68 of 68 cells across 17 pairs; the effect is the same at random non-level prices, so it is a property of the tape, not of levels. Shipped as js/tapeSpeedEngine.js.',
    use: 'Read the tape-speed chip as a statement about the coming hour\'s pace. Not a direction; not a level effect.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500'],
  },
  {
    id: 'level-touch', domain: 'price', verdict: 'null', date: '2026-09-10', doc: 'analysis/line_touch_control_study.mjs · memory project_hl_signal_null',
    claim: 'Price reacts at pre-drawn levels (prior-day high/low, daily open, p50/p75/p90 range lines) -- touches bounce or break in a usable way',
    result: 'The original Sharpe 5.36 came from a survivorship filter (only touches that later "held" were counted). Barrier-free re-test with paired controls at random non-level prices: p50, p75, p90 and the daily open closed in BOTH directions. The level increment over a random price is zero or negative.',
    use: 'A level is a place, not a signal. The page draws them for orientation; nothing on this desk trades a touch on its own.',
  },
  {
    id: 'vwap-extension-fade', domain: 'price', verdict: 'null', date: '2026-09-01', doc: 'MD files/GOLD_VWAP_FIXED_SIGMA_FINDINGS.md · memory project_vwap_extension_phase2',
    claim: 'Price stretched far from VWAP snaps back -- fade the extension',
    result: 'Positive GROSS across timeframes, but 3-8× under cost; the edge decays as fast as the cost does as the timeframe shortens. As a risk overlay (Q47) it confirmed on two of three strategies (vol-fade z≈5, breakout z=5.5 on 469k trades) and reversed on the zone engine.',
    use: 'Extension is a sizing and risk fact, not an entry. Anything that trades it has to clear spread/ATR first.',
  },
  {
    id: 'execution-gate', domain: 'execution', verdict: 'validated', date: '2026-09-02', doc: 'memory project_execution_feasibility_gate',
    claim: 'When the spread is a large fraction of the day\'s range, no short-horizon edge survives it',
    result: 'Spread/ATR above 0.15: zero of 30 strategy × timeframe cells profitable. Cost outruns edge as the timeframe speeds up; the crossover is the same across strategies.',
    use: 'Compute spread/ATR before any new intraday idea. Above 0.15 it is dead before it starts; the cost chip on each card is this number.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500'],
  },
  {
    id: 'reversal-hour', domain: 'price', verdict: 'validated', date: '2026-08-30', doc: 'memory project_reversal_hour_window',
    claim: 'Late New York (20:00-22:00 UTC) reverts intraday moves; session opens persist',
    result: 'Reversion in the 20:00-22:00 UTC window: EUR/USD +10pp above base at 21:00, XAU/USD +7.6pp; session-open moves persist rather than revert. Also a confounder for the late-NY VuManChu results.',
    use: 'A move that starts at 21:00 UTC is more likely to be given back than one that starts at the London or New York open. Time of day is a real conditioner; direction still is not.',
    instruments: ['EURUSD', 'GOLD'],
  },
  {
    id: 'zone-engine', domain: 'price', verdict: 'null', date: '2026-09-01', doc: 'memory project_confluencebot_zone_verdict · MD files/CONFLUENCE_LIVE_VS_BACKTEST.md',
    claim: 'Confluence zones (Fib + S/R + pivots + vol levels stacked) are entries',
    result: 'M30: negative on 83k trades, both halves. H4: a coin flip. The 8-pip stop tripled stop-outs against a ~46-pip structure.',
    use: 'Zones are a map. The bot that traded them has no edge; do not resurrect it with a new stop.',
  },
  {
    id: 'swing-structure-vwap', domain: 'price', verdict: 'context', date: '2026-08-28', doc: 'MD files/VMC_TRIPLE_TF_FINDINGS.md · memory project_vmc_research_verdict',
    claim: 'VuManChu-style oscillator turns mark swing highs and lows',
    result: 'As a barrier race (does price reach target before stop) near-null. As a STRUCTURAL question (is this swing THE high of the move) distance from VWAP lifts the hit rate 1.3× on 3 of 3 instruments. Not a validated entry; a conditioner worth carrying.',
    use: 'An oscillator turn far from VWAP is more often a real swing than one near it. Structure, not a trade.',
  },
  {
    id: 'trend-following-fx', domain: 'price', verdict: 'null', date: '2026-07-20', doc: 'MD files/CROSS_ASSET_TREND_DESIGN.md · memory project_trend_following_status',
    claim: 'Trend following works on FX',
    result: 'FX-only basket: null, verified not-a-bug with an independent rebuild. Broad multi-asset: modest (~0.3 OOS), barely beating buy-and-hold. Fading retail ≈ trend-following ≈ null on FX.',
    use: 'A trend chip on an FX card is description of the past 20 days, not a forecast of the next 20.',
  },
  {
    id: 'backtest-artifacts', domain: 'execution', verdict: 'context', date: '2026-09-10', doc: 'MD files/LIVE_BACKTEST_ALIGNMENT.md · MD files/FIB_ATLAS_BACKTEST_VS_LIVE.md · memory project_qmr_freehour_falsification',
    claim: 'A backtest that looks too good has a bug, and the bug is usually in what it was allowed to see',
    result: 'QMR\'s entire edge: stops were not live for the first hour after entry. The vote atlas: a survivorship fix sat on a deeper look-ahead; honest edge 0.23× cost. Fib Atlas: 85.7% backtest win rate vs 39.6% live. The vol CLI: 95% of "wins" scored before entry.',
    use: 'Before believing a curve, audit what fraction of candidates each filter silently dropped and what the engine could see at decision time. Every live bot on this desk is graded against this list.',
  },
  {
    id: 'conviction-vote', domain: 'execution', verdict: 'null', date: '2026-07-25', doc: 'memory project_backtest_entry_quality',
    claim: 'A higher conviction score on an entry means a better trade',
    result: 'The backtestSystem bot\'s conviction vote is ANTI-predictive of outcome; the bot is a net loser (−£38k) on a 30% win rate, not on deep losses.',
    use: 'Do not scale size by a vote that has not been scored. The pair ledger exists to score this page\'s own direction tag before anyone trusts it.',
  },
  {
    id: 'oi-max-pain', domain: 'positioning', verdict: 'null', date: '2026-09-10', doc: 'memory project_oi_pipeline_audit',
    claim: 'Price pins to options max pain into expiry',
    result: 'Tested properly for the first time 2026-09-10: null. The OI publish-lag timing risk was tested directly and survives; DTE, gamma, sign convention and spot basis all verified.',
    use: 'Max pain is a level to know about, not a magnet. Walls as range fences remain untested (queued).',
  },
  {
    id: 'jump-diffusion', domain: 'volatility', verdict: 'context', date: '2026-09-13', doc: 'volatilityExhaustion/jump_event_validation.py',
    claim: 'Decomposing moves into jumps and diffusion predicts what comes next',
    result: 'The measurement validates (jumps are real and identifiable); the forward payoff is null.',
    use: 'Use the decomposition to describe what kind of move just happened, not to forecast the next one.',
  },
  {
    id: 'narrow-day-expansion', domain: 'price', verdict: 'null', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T1',
    claim: 'An inside day or NR7 (the narrowest of seven) is a coiled spring -- the next day expands',
    result: 'Eight instruments, ~2,490 London sessions each, 2016→. Inside days: next-session range −0.09 to +0.04 ATR vs matched days, every CI across zero. NR7: the next session is NARROWER with the CI clear on USD/JPY (−0.17), SPX500 (−0.17), NAS100 (−0.13), USD/CAD, AUD/USD; the 5-session range narrower too. Next-day direction 49-55%.',
    use: 'Quiet days cluster. A narrow day is a reason to expect a narrow day, not a breakout. Do not write "coiled spring".',
  },
  {
    id: 'first-hour-fraction', domain: 'price', verdict: 'validated', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T2',
    claim: 'How much of the day is done by the end of the first hour',
    result: 'Median share of the session range travelled in the first London hour: FX 19-23%, gold 19%, indices 12-13%; first New York hour: FX 26-32%, gold 33%, indices 19-20% (p25-p75 roughly ±8pp). The first London hour\'s high or low survives as the session extreme only 4-12% of the time.',
    use: 'A measurement for the range-used chip: by 08:00 UK an FX pair has typically used a fifth of its day. "The first hour sets the range" is false nineteen times in twenty.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'GOLD', 'NQ', 'SPX500'],
  },
  {
    id: 'fast-start-rest-of-day', domain: 'price', verdict: 'validated', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T3',
    claim: 'A fast first two hours after the London open means the rest of the day runs wide too',
    result: 'First 2h ≥ 0.6 ATR14 (n=50-151 per FX pair): the range AFTER 09:00 ran +0.15 ATR wider on EUR/USD, +0.17 GBP/USD, +0.39 USD/JPY, +0.20 AUD/USD, +0.47 gold, +0.75 SPX500 vs matched days, CIs clear (USD/CAD +0.17, CI touching zero; NAS100 unscored). A "trend-day close" at the extreme is NOT more likely (43-56% vs 40-52%). T3b: the afternoon continued the morning\'s direction 47-60% of the time vs 48-52% on ordinary mornings -- a coin flip; the 80-90% "closed on the side of the morning" figure was the morning itself.',
    use: 'When the first two hours have already used 0.6 ATR, expect the afternoon to be wider than an ordinary afternoon, in the instrument\'s units. Not a trend-day call, and not a direction: the afternoon goes either way.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'GOLD', 'SPX500'],
  },
  {
    id: 'opening-range-break', domain: 'price', verdict: 'null', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T4',
    claim: 'A break of the London opening range (first hour) follows through',
    result: 'Eight instruments, ~2,480 sessions each. The first-hour range breaks in 99% of sessions; price is back inside it within 60 minutes 83-86% of the time; it extends by half the range first only 24-32%; the session closes beyond the broken side 50-52%. Fast-tape breaks follow through 5-8pp more often (consistent with tape-speed persistence), below the 15pp bar.',
    use: 'The first-hour range is a fifth of the day (T2) -- too small to be a fence. A break of it is not a signal either way; if anything expect it back inside within the hour.',
  },
  {
    id: 'monday-gap-fill', domain: 'price', verdict: 'context', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T5',
    claim: 'Gaps fill',
    result: 'Monday open vs Friday close, NAS100 / SPX500 / gold, 2016→. Gaps under 0.25 ATR (n≈400 each) fill the same session 81-87% and those Mondays run calmer (−0.11 to −0.19 ATR vs matched sessions). Gaps of 0.25-0.5 ATR fill 50-61%. Gaps over 0.5 ATR (n≈30) fill the same session only 30-36%, 59-73% within five sessions.',
    use: 'Say "gaps fill" only for small gaps. A gap over half an ATR is more likely NOT to fill the same day; treat it as a level, not a magnet.',
  },
  {
    id: 'calendar-range-profile', domain: 'price', verdict: 'context', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T6',
    claim: 'Some days of the week and of the month run wider than others',
    result: 'Range ÷ ATR14 vs all sessions, intervals clear where stated: Monday the quietest on all eight instruments (0.87-0.96×); Thursday the widest on FX (1.05-1.09×), Wednesday on several; the first two sessions of a month wider on seven of eight (1.09-1.16×); quarter-end sessions calmer on GBP/USD, AUD/USD, NAS100, SPX500 (0.88-0.92×); Friday wider on gold and USD/CAD.',
    use: 'A profile for the expected-range line: scale Mondays down ~8%, month-start up ~12%. Never a direction.',
  },
  {
    id: 'iv-over-rv-wider', domain: 'volatility', verdict: 'validated', date: '2026-09-18', doc: 'MD files/MARKET_SENSE_TESTS.md#M9',
    claim: 'When implied vol sits far above realised, the market is over-insured and calms down',
    result: 'The opposite. VIX ÷ 20-session realised SPX vol in the top decile (88 first days, 2010→): NAS100 next-5 range +0.38 ATR [+0.11, +0.62], next-20 +0.56; SPX500 next-20 +0.67 [+0.13, +1.21] (next-5 +0.17, null). Realised catches up to implied.',
    use: 'A high implied-to-realised ratio is a reason to expect wider indices over the coming weeks, not calmer ones. Range, not direction.',
    instruments: ['NQ', 'SPX500'],
  },
  {
    id: 'breadth-all-down', domain: 'price', verdict: 'validated', date: '2026-09-18', doc: 'MD files/MARKET_SENSE_TESTS.md#M12',
    claim: 'A session where every index closes down is followed by a wider week',
    result: 'All six indices down on one session (n=1,002 since 2008): next-5 range SPX500 +0.31 ATR [+0.17, +0.45], NAS100 +0.26 [+0.15, +0.38]. Two in a row (n=243): +0.55 and +0.35. Direction five sessions later 58-61% up, the ordinary drift.',
    use: 'A breadth wipe-out is a range fact: expect the coming week wider. Not a bounce call.',
    instruments: ['SPX500', 'NQ'],
  },
  {
    id: 'yen-into-yields', domain: 'macro', verdict: 'context', date: '2026-09-18', doc: 'MD files/MARKET_SENSE_TESTS.md#M7',
    claim: 'The yen firming while US yields rise (the carry-unwind shape) is followed by a volatile week on the yen crosses',
    result: '35 episodes in 18 years -- too few to score. USD/JPY higher five sessions later 47%, EUR/JPY 62%, AUD/JPY 47%.',
    use: 'The divergence panel may describe the shape; nothing may be claimed about the week after.',
  },
  {
    id: 'spread-leads-fx-hours', domain: 'macro', verdict: 'null', date: '2026-09-19', doc: 'MD files/LEAD_LAG_TESTS.md#L1',
    claim: 'The DE-US 10-year spread leads EUR/USD by hours: when the spread moves and spot does not, spot catches up within a day',
    result: 'Hourly bars 2012-2026 (61k hours). Same-hour correlation -0.30 every year; +1h -0.015 (placebo 0.013); +2h to +48h zero. The divergence setup (727 non-overlapping): next 24h in the direction the spread pointed 52% [48-56], +0.05 sigma -- identical to the aligned control. Big divergences (n=52) went the other way (35%, -0.47 sigma): the spread gave back. GBP/USD 47%.',
    use: 'The spread explains a move in the same hour; it does not announce one. Never write "rates moved first, the currency will follow". The Feb 2026 case in the course notes is one episode.',
    instruments: ['EURUSD', 'GBPUSD'],
  },
  {
    id: 'month-end-rebalance', domain: 'price', verdict: 'null', date: '2026-09-19', doc: 'MD files/LEAD_LAG_TESTS.md#L2',
    claim: 'After a strong month, rebalancing sells stocks in the final two or three sessions',
    result: 'SPX500 2007-2026, 229 months. After top-quintile months the last three sessions returned +0.11% [-0.32, +0.50], negative 47% of the time; after bottom-quintile months +0.65%. Ordinary months -0.06%.',
    use: 'No month-end drag to trade or to warn about. Month-end stays a calendar note, not a lean.',
    instruments: ['SPX500'],
  },
  {
    id: 'nowcast-gap-cpi', domain: 'events', verdict: 'null', date: '2026-09-19', doc: 'MD files/NOWCAST_TESTS.md#N1',
    claim: 'When the Cleveland Fed inflation nowcast sits above consensus, the CPI print is more likely to beat',
    result: '139 CPI m/m releases 2013-2025. Calls at |gap| >= 0.05: 23 of 43 right (53%, interval 39-68%); at >= 0.10, 8 of 19 (42%). The nowcast forecasts worse than the consensus (MAE 0.105 vs 0.086). Core CPI and core PCE the same shape.',
    use: 'The model number is shown as context on a release line ("model 0.43%"); it carries no direction. Do not read the gap as a lean.',
  },
  {
    id: 'nowcast-gap-gdp', domain: 'events', verdict: 'context', date: '2026-09-19', doc: 'MD files/NOWCAST_TESTS.md#N2',
    claim: 'When GDPNow sits above consensus, the advance GDP print is more likely to beat',
    result: 'Atlanta Fed track record 2011-2025, 53 calls: 29 of 44 right at |gap| >= 0.2 (66%, interval 52-80%), 19 of 24 at >= 0.6 (79%). The hit-rate bar clears, but the pre-registered falsifier fires too: GDPNow forecasts the level worse than consensus (MAE 0.76 vs 0.61). ALFRED-only sample (2016+, 30 calls) had said the same.',
    use: 'A base rate, not a pass: the side GDPNow sits on has matched the side the print landed two times in three. Shown as context on the GDP line; never a lean.',
  },
  {
    id: 'band-reach-from-here', domain: 'price', verdict: 'validated', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T7',
    claim: 'Reaching the median daily band early raises the odds of reaching the 75th band before the close',
    result: 'Eight instruments, ~2,500 London sessions each. At 10:30 UK, median band reached vs the ordinary odds for the hour: NAS100 63% vs 23%, SPX500 59% vs 22%, USD/JPY 44% vs 17%, EUR/USD 43% vs 18%, gold 50% vs 21% (2.3-2.7×; n=260-450 per cell). Largest at the open, decaying through the day. Once reached, the median band was the day\'s extreme in only 4-10% of sessions, the 75th in 5-14%.',
    use: 'The "aim for the 75th, not the median" line: a target guide, never an entry. The bands are waypoints, not walls -- do not expect price to stop at one.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'GOLD', 'NQ', 'SPX500'],
  },
  {
    id: 'asia-range-london', domain: 'price', verdict: 'context', date: '2026-09-18', doc: 'MD files/TECHNICAL_RANGE_TESTS.md#T7',
    claim: 'A wide Asia range means London extends',
    result: 'The reverse. A top-tercile Asia range (range/ATR) LOWERED the odds of reaching the median band after 07:00: gold 24% vs 46% on narrow-Asia days, USD/JPY 18% vs 36%, EUR/USD 33% vs 42%. A wide Asia has already used the day\'s range.',
    use: 'After a wide Asia session, expect LESS of the day\'s range to be left for London, not more.',
  },
  {
    id: 'yields-to-fx-direction', domain: 'macro', verdict: 'null', date: '2026-08-23', doc: 'memory: project_yield_asset_coupling',
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
