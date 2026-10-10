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
 * prediction), 'underpowered' (tested, but the design could only have found an
 * effect far larger than a realistic one -- MD files/PREREG_TEMPLATE.md §5; it
 * rules out a LARGE effect and says nothing about a small one). Range claims are
 * about RANGE; nothing here predicts direction.
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
    id: 'rates-pivot-lead', domain: 'macro', verdict: 'null', date: '2026-09-25', doc: 'MD files/RATES_PIVOT_LEAD_PREREG.md',
    claim: 'A confirmed turn in short-term rates leads the Nasdaq intraday -- you confirm the pivot, then pre-position before the index moves',
    result: 'Null on every cell. 360 days of M15, 2,430 confirmed 2-year pivots (measured from the CONFIRMATION bar, never the pivot), 2,010 de-clustered events at 1h: signed Nasdaq return -0.005% vs control [-0.021,+0.012]. Null at 1h, 2h and 4h, in both directions and both halves. WELL POWERED: the interval is about +/-0.12 ATR, inside this desk own 0.15 execution gate, so anything tradeable would have shown. The telling number: a confirmed rates low is followed by an up-move 54.1% of the time and the BASE RATE is 54.1%.',
    use: 'Do not pre-position in equities off a turn in short-term rates. Rates and equities move in the SAME bar (+0.23 at M15) and not in sequence -- now shown three ways: daily coupling, 15m return lags, and 15m pivots. And never quote a hit rate without its base rate: 54% looked like an edge and was exactly nothing.',
  },
  {
    id: 'dr-copper', domain: 'macro', verdict: 'null', date: '2026-09-25', doc: 'MD files/DR_COPPER_PREREG.md',
    claim: '"Dr Copper does not miss": copper falls three months before GDP turns negative, every single time',
    result: 'The universal claim is FALSIFIED and needs no statistics: 12 of the 14 negative US quarters since 1990 had no 15% copper fall in front of them. Copper was RISING (+5.5%) into 2020 Q1, and US GDP was already negative in 2008 Q1 -- two quarters BEFORE the July 2008 copper peak the story cites. Whether copper has any weaker lift is UNTESTABLE: only 5 signals at the pre-registered 15% gate, against a floor of 6. Descriptively, a 10% gate fires 22 times with an 82% false alarm rate and 1.77x lift.',
    use: 'Copper is a growth DESCRIPTION, not a recession signal. Never imply it forecasts a contraction. The general form: "every single time" is a sensitivity claim, and sensitivity without a false-alarm rate is nearly worthless.',
  },
  {
    id: 'driver-roundtrip', domain: 'price', verdict: 'null', date: '2026-09-25', doc: 'MD files/ROUNDTRIP_PREREG.md',
    claim: 'When a driver spikes and fully retraces intraday, the markets it drives follow it back -- "crude moves back, stocks recover, but bonds never forget"',
    result: 'Null on every testable leg. 400 days of M15, 35 crude round trips vs 81 held excursions: USD/CAD +0.33 [-0.22,+0.88], S&P +0.47 [-0.07,+1.01], Nasdaq -0.13 [-0.90,+0.50]. The direction split is incoherent (S&P gives back 0.19 of an up-spike and 1.00 of a down-spike), which argues the positive point estimates are noise. UNDERPOWERED: 26-30 events, intervals span +/-0.55 of a move, so only a large effect could have been found. BONDS WERE NOT TESTED -- and the reason first given (no intraday rates data) was wrong: OANDA serves US 2Y/5Y/10Y/30Y, Bund and Gilt CFDs at M15 through the route this study already uses. The bond leg is unanswered and answerable.',
    use: 'Do not say a linked move "will come back" because the driver round-tripped. Round trips are also rarer than the story implies: 35 in 283 crude sessions, and 6 in 284 for EUR/USD.',
  },
  {
    id: 'breadth-narrowing', domain: 'price', verdict: 'null', date: '2026-09-23', doc: 'MD files/BREADTH_NARROWING_PREREG.md',
    claim: 'Market narrowing -- equal-weight (RSP) lagging cap-weight (SPY) hard -- is a "textbook rotation" worth acting on',
    result: 'Null on all four pre-registered hypotheses. 23 years (RSP from 2003), 35 de-clustered NARROW events vs 267 controls. Direction -0.5% at 20d [-2.70, +1.57]; range +0.37 [-0.10, +0.85]; no reversion of the spread; no continuation of the rotation. The range near-miss dies on its mirror: extreme BROADENING raises forward range just as much (+0.28), so the effect belongs to the volatile period both readings sit inside, not to breadth. First half holds only 14 events, so the half-split could not be completed.',
    use: 'Show the narrowing, never alert on it. Use it for positioning, not timing: at an extreme reading, long the index is long a handful of its largest companies rather than "the market", and an index hedge is hedging direction when the exposure is concentration.',
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
    id: 'multi-spread-sleeve', domain: 'macro', verdict: 'validated', date: '2026-09-20', doc: 'MD files/MULTI_SPREAD_SLEEVE.md',
    claim: 'The identical yield-spread-sleeve mechanism, run on the US-vs-foreign 10Y nominal differential instead of the validated 2Y, finds an independent edge that genuinely diversifies the 2Y sleeve rather than relabeling it',
    result: 'Bar A (10Y on its own): 12-cell sweep (entry |z| 2.0-2.75 x window 90/126/252) all 12 profitable, PF 1.06-3.44, broad multi-year coverage -- a plateau, not a spike, weakest at window=252/z=2.0 (PF 1.06, 2/5 years). Bar B (diversification): 15.7% trade overlap with the validated 2Y sleeve (well under 50%), 0.300 daily-return correlation, equal-risk combined Sharpe 1.15 beats either leg alone (y2 1.02, y10 0.81). Both pre-registered bars pass.',
    use: 'A second, independently-diversifying spread-sleeve leg alongside yield-spread-sleeve, same discipline (rare entries, publication lags on, cost-inclusive). Like that sleeve, this is in-sample/OOS backtest evidence only -- not forward-proven. The 252-day window is the weak corner (thin margin over cost); prefer 90-126-day windows until a cost-stress re-check.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'],
  },
  {
    id: 'spread-sleeve-factor-audit', domain: 'macro', verdict: 'validated', date: '2026-09-22', doc: 'MD files/MVE_BOOK_FACTOR_AUDIT.md',
    claim: 'The 2Y/10Y spread sleeves\' edge is genuine rate-spread relative value, not a disguised bet on the shared currency factors (USD / risk) that all six USD pairs share',
    result: 'Pre-registered MVE Phase 7 book-layer audit (currency-space PCA, K=2 by noise band, factor-neutral book, costs on every leg incl. hedges). Sanity gate passed (raw book reproduces the sleeve engines: y2 1.06 vs 1.13, y10 0.62 vs 0.58). All three books read RELATIVE-VALUE: neutralising RAISED OOS Sharpe -- 2Y 1.02->1.33, 10Y 0.58->1.01, combined 0.98->1.36 -- and IS Sharpe too (2Y 0.26->0.46), while cutting OOS vol ~60-65% (2Y 14.1%->5.1%). ~55% of the raw book\'s risk was factor risk that did not pay. Caveats: IS is weak for every version (2018/2020 losses raw and neutral), the OOS strength sits in the 2022-24 rate-divergence cycle, and the OOS window overlaps the grid the 2.0/126 config came from -- this answers dollar-bet-vs-RV, it does not re-validate the sleeves.',
    use: 'CORRECTION 2026-09-22 (MVE_BOOK_FACTOR_AUDIT.md §9): the audit\'s PC-only hedge can leave net USD in the book, so this reading may be partly a dollar bet -- read it together with MVE_BOOK_SYSTEM_BACKTEST.md, which runs a hedge that also zeroes net USD at a fixed 10% vol target. Until that runs, treat the relative-value claim as unconfirmed.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
  },
  {
    id: 'residual-reversion-fx', domain: 'macro', verdict: 'null', date: '2026-09-20', doc: 'MD files/RESIDUAL_REVERSION_FX_TEST.md',
    claim: 'Mean-reversion of the residual (actual price minus an OLS macro fair value) predicts forward FX returns, out-of-sample, net of a naive trailing-mean benchmark',
    result: 'The MVE\'s cross-instrument pool (js/mve/validateInstrument.js, publication-lag-honest -- fixed same day, no prior real-data FX number predates it), 6 instruments: only 1/6 (EURUSD) clears both a real icEdge and an above-coin-flip hit rate, which poolConsistency itself reads as chance-level, not corroboration (mean icEdge -0.030, mean hit rate 0.485). NQ (-0.246) replicates July\'s "null and worse than inert" finding on this exact instrument. USDJPY shows positive icEdge but a below-50% hit rate -- internally inconsistent, not corroborating. GBPUSD\'s deflated Sharpe (0.796) is the closest to tradeable but its icEdge sits under the pooling threshold.',
    use: 'The residual-fair-value framing (as opposed to the validated yield-spread-sleeve\'s spread-level z-score) still shows no tradeable, cross-sectionally-corroborated edge on FX -- consistent with the object having no anchoring economic force to close the gap, unlike a policy-rate spread. The pre-registered 2022-24 regime split (does a rate-divergence-supercycle window hide edge a full-sample pool would miss) has now been run for EURUSD, the one pair with a real pooled icEdge: raw icEdge is ~3.7x larger in 2022-24 (0.1236 vs 0.0332 rest), directionally confirming the rate-divergence intuition, but the tradeable z-fade\'s deflated Sharpe is actually lower in that window (0.366 vs 0.178 rest vs 0.549 pooled) -- the smaller in-regime sample loses more to the multiple-testing deflation penalty than it gains from the stronger raw correlation. All three slices stay well under the 0.95 SURVIVES bar. Disaggregating did not hide a regime-concentrated edge here; it confirmed the pooled null.',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'XAUUSD', 'NQ'],
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
    id: 'daily-band-fade', domain: 'price', verdict: 'null', date: '2026-09-23', doc: 'MD files/BAND_FADE_DAILY.md',
    claim: 'On DAILY bars, a close outside a volatility band (vol-unit, Keltner or Bollinger) reverts toward the EMA20 fair value -- the daily test the intraday band-fade nulls never ran',
    result: 'Pre-registered, 25 FX pairs + gold, 2016-2026, costs on, OOS from 2022-06. Stage 1 (vol band, 5 days, |z| >= 2): +0.08 sigma, t 0.85 vs a shuffled-return null 95th pct of 2.00; OOS mean negative; all five sampling phases t -0.18 to 0.85. Keltner t 1.77, Bollinger t 0.71; stacking 1/2/3 bands no stronger. Stage 2 (vol-targeted book, 485 trades): Sharpe 0.14 +/- 0.30 (IS -0.26, OOS 0.74 carried by 2023-24), 82nd percentile of a random-entry control whose 95th is 0.40, 2x cost 0.05.',
    use: 'A band on the chart is a map at every timeframe now, not an entry: price outside it is no more likely to come back than shuffled prices are. Use the bands for how far price travels (band-reach-from-here), not which way.',
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
    id: 'mv-vixterm-range', domain: 'volatility', verdict: 'validated', date: '2026-09-23', doc: 'MD files/OUTCOME_LOOP.md',
    instruments: ['SPX500', 'NQ'],
    claim: 'When the Market View flags an inverted VIX curve, the next month runs wider',
    result: 'O1, pre-registered: the range ratio over the next 20 sessions is +0.52 [0.38, 0.88] on SPX500 and +0.44 [0.26, 0.78] on NQ against a matched control, on 14 de-clustered firings (8% of sessions). Holds in BOTH halves of the sample (+0.70 early, +0.35 late), so it is not one episode. Direction is null: 57% up against an 80%+ control.',
    use: 'Widen the expected range before sizing. It says the next few weeks are likely to be bigger, never which way. Independently reproduces the earlier VIX-inversion result from a different harness, which is the main reason to believe it.',
  },
  {
    id: 'mv-dispersion-range', domain: 'volatility', verdict: 'validated', date: '2026-09-23', doc: 'MD files/OUTCOME_LOOP.md',
    instruments: ['SPX500', 'NQ'],
    claim: 'When the Market View flags a crowded market (high dispersion), the next month runs wider',
    result: 'O1, pre-registered: +0.52 [0.37, 0.64] on SPX500 and +0.55 [0.37, 0.69] on NQ over 20 sessions, on 9 firings (8% of sessions). Holds in both halves (+0.73 early, +0.35 late). Reaches D1’s SECONDARY 20-day window by an independent path; D1’s headline weekly claim stays null and is not revived by this.',
    use: 'A month, not a week, and range only. Nine firings on revised data earns a re-run and a forward test, not a trigger.',
  },
  {
    id: 'mv-creditstack-range', domain: 'macro', verdict: 'context', date: '2026-09-23', doc: 'MD files/OUTCOME_LOOP.md',
    claim: 'When the Market View flags the credit stack moving, the next month runs wider',
    result: 'O1, pre-registered: +0.16 [0.015, 0.33] on SPX500 — barely clear of zero — and NULL on NQ (+0.14 [-0.13, 0.42]), on 12 firings. Both halves positive but both marginal.',
    use: 'Not enough to act on. Recorded so the next run has a number to beat.',
  },
  {
    id: 'mv-dislocation-forward', domain: 'macro', verdict: 'null', date: '2026-09-23', doc: 'MD files/OUTCOME_LOOP.md',
    claim: 'When two markets that normally move together come apart, something follows',
    result: 'O1, pre-registered: NULL. Range +0.01 [-0.11, 0.34] on SPX500, +0.12 [-0.11, 0.40] on NQ, on 17 firings. Direction 71% up against an 80% control — BELOW control. The two halves flip sign entirely (+0.29 early, -0.24 late), which is what noise looks like.',
    use: 'The page’s existing wording was right and is now evidenced: a dislocation says which markets disagree today, and carries nothing about what happens next.',
  },
  {
    id: 'mv-extreme-forward', domain: 'price', verdict: 'null', date: '2026-09-23', doc: 'MD files/OUTCOME_LOOP.md',
    claim: 'When a market makes a rare move against its own history, something follows',
    result: 'O1, pre-registered: NULL. Range +0.15 [-0.04, 0.40] on SPX500, +0.15 [-0.15, 0.44] on NQ, on 15 firings. Direction 73% up against a 79% control.',
    use: '"Rare is a measurement, not a forecast" is now tested rather than asserted. The same run found the threshold was far too loose — the finding had been firing on 96% of sessions — and thresholds are now calibrated against the board’s own maximum.',
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
    id: 'regime-divergence-fx', domain: 'macro', verdict: 'null', date: '2026-09-20', doc: 'MD files/REGIME.md#R2',
    claim: 'When two economies sit in different growth/inflation regimes (policy divergence), their currency pair runs wider or tilts',
    result: 'Per-currency labels (USD, GBP, EUR, CAD) 2008-2026. Diverging vs aligned months: EUR/USD range +0.03pp [-0.48, +0.52], GBP/USD -0.33pp [-0.86, +0.23], USD/CAD -0.09pp, EUR/GBP -0.11pp; return differences all through zero.',
    use: 'State the two economies’ regimes as the backdrop of a pair; never call divergence a setup or a warning.',
  },
  {
    id: 'dispersion-crowded-week', domain: 'volatility', verdict: 'null', date: '2026-09-23', doc: 'MD files/DISPERSION.md#D1',
    claim: 'A crowded market -- CBOE dispersion high and rising, single-name volatility dear while the index stays cheap -- is fragile, and is followed by a wider week and mini flash crashes',
    result: '68 setups 2014-2026 (DSPX at or above its own trailing 80th percentile and rising over 20 sessions). Next-5-session range vs control: SPX500 +0.07 [-0.06, +0.23], NQ +0.07 [-0.03, +0.17]. A day of twice the trailing median range within five: 33% [23-46] vs 30% [28-32] control on SPX500, 33% vs 27% on NQ. Secondary window, pre-registered as also-reported: the next 20 sessions run +0.23 [+0.04, +0.51] and +0.21 [+0.08, +0.38], and that survives restricting to a below-median VIX (+0.233, +0.221 on n=24), so it is not the VIX in disguise -- but it sits in the late half of the sample and rests on a small count.',
    use: 'Do not write that a crowded market means a wild week: tested here, null at five sessions and null on the tail. Dispersion is a structural read -- the index hedge protects least when the risk is concentration rather than the market falling as a whole. The month result was unconfirmed; D2 (dispersion-reset, 2026-09-27) supplied the mirror it was missing and it PASSED, which raises confidence in the rising arm without making it a trigger -- it still lives mostly in the late half of the sample.',
  },
  {
    id: 'yield-move-fx-range', domain: 'volatility', verdict: 'null', date: '2026-09-27', doc: 'MD files/YIELD_MOVE_FX_RANGE_PREREG.md',
    claim: 'A large move in the US 10-year precedes a WIDER FX session -- the range question, after the direction question was closed null',
    result: 'Pre-registered with a POSITIVE expectation (+0.15 to +0.30 ATR). 1,915 top-decile DGS10 days on a rolling 504-day threshold, de-clustered to 260 setups per pair, 2010-2026. Gate was all three pairs AND both halves: EUR/USD clears alone (+0.101 [0.013, 0.196] next session, +0.053 [0.007, 0.105] at five) and USD/JPY and GBP/USD do not, with no half-split clearing anywhere. The MIRROR is the interesting part and is pre-registered as a warning rather than a finding: at five sessions a yield FALL widens range on 3 of 3 pairs (+0.109, +0.208, +0.090, all clear of zero) while a yield RISE does so on 0 of 3.',
    use: 'Do not write that a big rates day means a wild FX session -- tested here against a positive prior and null on the gate. The down-side asymmetry is almost certainly the risk-off episode the yield fall sits inside, not the yield fall; nothing here separates them. It is consistent with front-end-shock, which found a hawkish 2-year repricing followed by a CALMER week, so two independent studies now say rates up -> quieter FX. Worth a properly conditioned risk-off test one day; not a claim today.',
  },
  {
    id: 'spread-divergence-range', domain: 'volatility', verdict: 'null', date: '2026-09-27', doc: 'MD files/SPREAD_DIVERGENCE_RANGE_PREREG.md',
    claim: 'When the DE-US 10-year spread moves and EUR/USD does not, the next hours run WIDER -- the range question, after spread-leads-fx-hours closed the direction one',
    result: 'Pre-registered NULL and the gate came back REAL, then the mirror killed it. 60,613 aligned hours 2012-2026, 693 divergence setups (the direction study had 727). Against an hour-of-day-matched control the next 2h run +0.132 [0.071, 0.198] and the next 6h +0.076 [0.032, 0.116], real in BOTH halves; 24h is null. But the pre-registered mirror -- spot moves, spread does not -- is LARGER at every horizon (+0.164 and +0.087 on the same hour-matched footing). The prereg said in advance that if both widen, the effect is a big move in either leg rather than the disagreement.',
    use: 'Never write that a spread/spot divergence means a volatile few hours: what widens the tape is a big move in EITHER leg, which is volatility clustering and already known. The hour-of-day-matched control is the reusable part -- it halved the raw effect (+0.220 to +0.132), because divergences cluster into the London-New York overlap. Any future hourly study here should carry it.',
  },
  {
    id: 'dispersion-reset', domain: 'volatility', verdict: 'validated', date: '2026-09-27', doc: 'MD files/DISPERSION.md#D2',
    instruments: ['SPX500', 'NQ'],
    claim: 'A crowded market that is NORMALIZING -- dispersion high but now falling -- is the signal the dominant theme is losing control, and the break is starting',
    result: 'D2, pre-registered with the opposite expectation. 68 crowded-and-rising vs 31 crowded-and-falling setups 2014-2026, same 2,604 controls. THE GATE (do the arms separate?) passes 4/4: rising minus falling is +0.186 [+0.017, +0.349] and +0.307 [+0.091, +0.584] on SPX500 at 5 and 20 sessions, +0.148 [+0.039, +0.254] and +0.262 [+0.091, +0.433] on NQ. But the SIGN is the reverse of the claim: the falling arm precedes a CALMER week (-0.122 [-0.190, -0.005] SPX500, -0.083 [-0.151, -0.008] NQ) and nothing at a month. Direction null in both arms (+0.006 and -0.005 at 20 sessions, all intervals across zero). Falling arm is n=26 against a floor of 25.',
    use: 'The direction of travel in dispersion matters -- but backwards from the story. Crowded and STILL RISING is the wide tape; crowded and RESETTING is the quiet one. Never write that a normalizing dispersion spread means a break is starting: tested here and falsified in sign. Direction is null as it always is. Thin on both arms (n=26 falling), so this informs an expected-range read and is not a trigger.',
  },
  {
    id: 'fear-gold', domain: 'macro', verdict: 'null', date: '2026-09-21', doc: 'MD files/FOUR_GOLDS.md#G1',
    claim: 'Fear buys gold: a spike in the VIX brings a gold bid that lasts days, not months',
    result: '58 VIX spikes (+5 points in five sessions) 2010-2026. Gold five sessions on +0.42% vs +0.35% ordinary: excess +0.07% [-0.42, +0.30]; higher at five sessions 53% [41-66]. Twenty sessions on +0.01% vs +1.20%: excess -1.19% [-2.30, -0.48]. Spiked then gave back half by day 20: 24% of spikes; the rest never spiked.',
    use: 'No fear bid in gold on average, and a month after a fear spike gold has lagged its ordinary drift. Never write "fear is bidding gold"; if gold is up in a fear week, look for the rates or dollar leg instead.',
  },
  {
    id: 'which-gold', domain: 'macro', verdict: 'context', date: '2026-09-21', doc: 'MD files/FOUR_GOLDS.md#G2',
    claim: 'There are four golds -- rates, dollar, reserve, fear -- and only one drives at a time',
    result: 'Rolling 60-session regressions of gold on real yields and the broad dollar, 689 windows 2010-2026: rates gold 19% of windows, dollar gold 18%, both 16%, neither 45%, the wrong sign 3%. 2022 rates 36% + both 16%; 2025 neither 96% (the reserve-gold year, from the residual alone); latest window neither.',
    use: 'Name the gold that is trading from the chain links (real to gold, dollar to gold), and say "no single gold" when both are quiet -- which is nearly half the time. Reserve gold is the residual and cannot be confirmed from a free feed.',
  },
  {
    id: 'crack-inflation-channel', domain: 'macro', verdict: 'context', date: '2026-09-21', doc: 'MD files/CRACK_SPREAD.md',
    claim: 'The 3-2-1 crack spread (refining margin: fuel prices minus crude) carries inflation pricing beyond crude itself -- when crude falls but products stay tight, breakevens do not take the relief',
    result: 'All 20-session windows 2003-2026 (n=5,700). Breakevens correlate 0.40 with crude and 0.19 with the crack; the crack after removing crude is 0.185 [0.10, 0.27]. Windows where crude fell 5% or more but the crack rose 5 dollars or more: breakevens -4bp; where both fell: -14bp; difference +15bp [+4, +32].',
    use: 'When crude sells off, look at the crack before writing that inflation pricing should ease: a rising crack with falling crude is the bond market keeping its inflation view. On the chain the crack has its own link to inflation pricing.',
  },
  {
    id: 'crack-blowout-range', domain: 'macro', verdict: 'null', date: '2026-09-21', doc: 'MD files/CRACK_SPREAD.md',
    claim: 'A crack-spread blow-out (20-session change at or above +2 z) is followed by a wider month in crude, USD/CAD and gold',
    result: '61 episodes since 1996, 24-25 with OANDA history. Next-20-session mean daily range vs control: WTI +0.13 ATR [-0.02, +0.16], USD/CAD -0.03 [-0.06, +0.04], gold -0.06 [-0.09, -0.002].',
    use: 'No range trigger. Crude leans wider after a blow-out but the interval touches zero on a small count; the FX and gold legs are flat or a hair narrower.',
  },
  {
    id: 'crack-disagreement-direction', domain: 'macro', verdict: 'null', date: '2026-09-21', doc: 'MD files/CRACK_SPREAD.md',
    claim: 'When crude sells off while the crack keeps rising, the sell-off is not the end of the story and crude is higher a month later',
    result: 'Crude higher 20 sessions after a disagreement window (crude -5%, crack +5 dollars) 62% [48-75] (n=45); after an agreement window 49% [33-65]; after any -5% crude window 55% [47-62]; unconditional 52%.',
    use: 'A base rate that leans the way the story says, with an interval that holds the coin. Say "crude sell-offs with the crack rising have more often reversed than not, 62% on 45 cases" -- never "the crack says crude goes back up".',
  },
  {
    id: 'nonus-yield-gap-label', domain: 'macro', verdict: 'context', date: '2026-09-20', doc: 'MD files/NONUS_YIELDS.md',
    claim: 'A foreign-led yield rise (gilts, bunds, JGBs rising faster than Treasuries) marks the currency day: the bad rise (yields up, currency down) for the pound, the carry textbook for the others',
    result: 'Daily 2010-2026, London-day bars. Gilt-led rise on GBP/USD worst-5% days x1.39 [0.69, 2.20] -- twelve days in sixteen years, mostly 2022 and the mini-budget; the bad-rise label is null. Bund-led fall on EUR/USD worst days x2.37 [1.54, 3.32] and bund-led rise on its best days x1.81 [1.07, 2.77]: the carry textbook holds on the tails, same day. JGB-led rise on USD/JPY worst days x2.02 [0.92, 3.30], not clear; same-day correlation -0.26, the strongest of the three. Over 20-session windows the gap and the pair agree with the textbook 57% [47-67] GBP, 74% [64-83] EUR, 70% [60-79] JPY.',
    use: 'On the chain the bund and JGB gap links are textbook links that hold seven windows in ten; the gilt link is a coin flip and its card says so. Never write "gilts are selling off, so the pound will fall" -- the famous days are exceptions, not a rule.',
  },
  {
    id: 'nonus-yield-gap-range', domain: 'macro', verdict: 'null', date: '2026-09-20', doc: 'MD files/NONUS_YIELDS.md',
    claim: 'After a big move in the foreign-minus-Treasury 10-year gap, the next session in the pair runs wider than usual',
    result: 'Next-session range over the trailing 20-session median, minus the ordinary-day control (post-hoc, the pre-registered bar was cleared by the control itself): gilts +0.12 [-0.001, +0.25], bunds +0.02 [-0.04, +0.08], JGBs +0.03 [-0.04, +0.09]. Against a US-led control (big Treasury day, no divergence) +0.10, -0.01, -0.04, all through zero. One of nine cells (JGB-led fall +0.13 [0.007, 0.28]) clears on its own.',
    use: 'No range trigger from the foreign leg. A big yield day is followed by a wider session whether or not the foreign market led -- that is vol clustering, already on the book.',
  },
  {
    id: 'nonus-yield-gap-direction', domain: 'macro', verdict: 'null', date: '2026-09-20', doc: 'MD files/NONUS_YIELDS.md',
    claim: 'After a foreign-led yield rise the pair follows the textbook the next session',
    result: 'Next-session textbook direction after a foreign-led rise: 50% [43-58] GBP/USD (n=173), 55% [48-62] EUR/USD (n=185), 50% [40-59] USD/JPY (n=109); after a foreign-led fall 45%, 49%, 60% [50-70]. Every interval holds the coin.',
    use: 'The gap explains the day it moves on; it does not announce the next one. Same result as the DE-US spread at hourly resolution.',
  },
  {
    id: 'repo-stress-range', domain: 'macro', verdict: 'context', date: '2026-09-20', doc: 'MD files/PLUMBING.md#P1',
    claim: 'Repo stress (the SOFR 99th percentile 10bp or more above the Fed floor) precedes a wider week',
    result: '26 episodes 2018-2026, first session of each. Next-five-session range vs matched control: SPX500 +0.14 ATR [-0.54, +0.98], EUR/USD +0.13 [-0.37, +0.65], USD/JPY +0.08 [-0.76, +0.93]; the dollar moved LESS than usual (0.45% vs 0.59%). And the setup fires on a quarter of all sessions since 2024 -- it is month-end plumbing, not stress.',
    use: 'Read SOFR-99th above the floor as month-end tightness unless the backstops (SRF, discount window) are in use. The chain funding links are described, not tested.',
  },
  {
    id: 'analogue-weeks', domain: 'macro', verdict: 'null', date: '2026-09-20', doc: 'MD files/WEEK_MAP.md#W1',
    claim: 'The past weeks whose macro scores most resemble this week tell you what follows (the "when did it sit like this before" analogue)',
    result: 'Walk-forward, 400 weeks, ten nearest weeks in z-space across 21 series with an eight-week crowding rule, median 13-week outcome. S&P: analogues right 75% vs the unconditional 76%; EUR/USD 53% vs 54%; gold 61% vs 69%. Size error larger than the unconditional median on all three. Placebo (ten random weeks) 63-69%, 45-54%, 52-60%.',
    use: 'Show the analogue weeks as history, never as a lean. The week map is for how unusual a move was and in what; the third view is a story.',
  },
  {
    id: 'spread-leads-fx-hours', domain: 'macro', verdict: 'null', date: '2026-09-19', doc: 'MD files/LEAD_LAG_TESTS.md#L1',
    claim: 'The DE-US 10-year spread leads EUR/USD by hours: when the spread moves and spot does not, spot catches up within a day',
    result: 'Hourly bars 2012-2026 (61k hours). Same-hour correlation -0.30 every year; +1h -0.015 (placebo 0.013); +2h to +48h zero. The divergence setup (727 non-overlapping): next 24h in the direction the spread pointed 52% [48-56], +0.05 sigma -- identical to the aligned control. Big divergences (n=52) went the other way (35%, -0.47 sigma): the spread gave back. GBP/USD 47%.',
    use: 'The spread explains a move in the same hour; it does not announce one. Never write "rates moved first, the currency will follow". The Feb 2026 case in the course notes is one episode.',
  },
  {
    id: 'month-end-rebalance', domain: 'price', verdict: 'null', date: '2026-09-19', doc: 'MD files/LEAD_LAG_TESTS.md#L2',
    claim: 'After a strong month, rebalancing sells stocks in the final two or three sessions',
    result: 'SPX500 2007-2026, 229 months. After top-quintile months the last three sessions returned +0.11% [-0.32, +0.50], negative 47% of the time; after bottom-quintile months +0.65%. Ordinary months -0.06%.',
    use: 'No month-end drag to trade or to warn about. Month-end stays a calendar note, not a lean.',
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
  {
    id: 'news-asymmetry', domain: 'events', verdict: 'null', date: '2026-09-28', doc: 'MD files/NEWS_ASYMMETRY_PREREG.md',
    claim: 'A bad data surprise moves FX more in the first 30 minutes than an equally large good one (Andersen-Bollerslev-Diebold-Vega 2003)',
    result: 'Null, and well powered. 656 releases 2016-26 (US core CPI, payrolls, unemployment, wage growth; CA unemployment; AU employment), polarity-signed surprise capped at 3 sigma, 30-minute move scaled per instrument, family fixed effects: bad-minus-good slope -0.10 per sigma [-0.23, +0.04] against a pass bar of +0.25 and a detectable effect of 0.19. The halves disagree (2016-20 +0.02, 2021-26 -0.15); no single family survives Benjamini-Hochberg.',
    use: 'Do not say the market fears a miss more than it cheers a beat: size the release-day move symmetrically. The size effect lives in the biggest surprises (surprise-size terciles), not in a linear per-sigma slope.',
  },
  {
    id: 'fx-factor-book-v2', domain: 'macro', verdict: 'underpowered', date: '2026-09-27', doc: 'MD files/FX_FACTOR_V2_TEST.md',
    claim: 'Quant-desk upgrades (TSMOM with a correlation factor, a volatility-regime multiplier, residual cross-sectional momentum, carry filtered by momentum, a risk-off gate on carry, a Carver trend+carry blend) improve this desk\'s G10 trend and carry baskets',
    result: 'Two runs of the frozen spec, both with 8 of 8 primaries within noise; the largest improvement was T5 +0.26 Sharpe against a Bonferroni bar of +1.04. UNDERPOWERED: 5.7 years out of sample on 7 USD crosses gives a Sharpe SE of 0.41 and a minimum detectable improvement of about +1.4, while the literature sizes these overlays at +0.1 to +0.3. The incumbents themselves: trend -0.16 out of sample; carry +0.61, which is 1.5 SE and sits in the 2021-26 rate-divergence era (in-sample -0.12). The risk-off gate (C3) ran as a monthly gate by a design flaw, so the idea was not tested as meant.',
    use: 'No LARGE improvement from any of these overlays exists; realistic ones were never testable on this universe. Do not describe any variant as better or worse than the incumbent, and do not cite the carry basket\'s out-of-sample Sharpe as an edge.',
  },
  {
    id: 'ou-bands-fx-crosses', domain: 'price', verdict: 'underpowered', date: '2026-09-27', doc: 'MD files/FX_FACTOR_V2_TEST.md#9',
    claim: 'Ornstein-Uhlenbeck optimal entry/exit bands beat fixed +/-2 sigma bands on mean-reverting G10 crosses (AUD/NZD, EUR/CHF, EUR/GBP, AUD/CAD)',
    result: 'Second too-few-trades on the core 4 (22 out-of-sample trades against a floor of 30), which the pre-registration said means this universe cannot test the idea at daily frequency. Pooled OU +0.67 vs +/-2 sigma -0.07 out of sample, but +0.07 vs +0.46 in sample, and the +0.74 gap is under the Bonferroni bar of +1.07 even had there been enough trades. Of 68 closed OU trades, 46 (68%) ended on the 3-half-life time stop, 18 on the stop, and only 4 (6%) reached the OU target.',
    use: 'Not evidence that OU bands work, or that these crosses revert on a trading horizon: they mostly drift part of the way back and rarely finish the reversion. Never quote the out-of-sample Sharpe without its 22 trades and its in-sample.',
  },
  {
    id: 'curve-inversion', domain: 'macro', verdict: 'null', date: '2026-10-01', doc: 'MD files/CURVE_INVERSION_PREREG.md',
    claim: 'An inverted US yield curve (10y minus 2y below zero) is followed by weaker risk assets and a recession signal the market has not already priced -- the most cited spread in macro, on this board since the liquidity gate was built and never scored',
    result: 'Pre-registered NULL for the tradeable half and that is what came back. 12,581 daily T10Y2Y observations 1976-06 to 2026-10 collapse to TEN inversion episodes (60-day buffer; the unit is the episode, because one inversion contributes hundreds of days and would otherwise read as hundreds of successes). Recession within 24 months followed 6 of 10 -- 60%, 95% CI [31%, 83%], an interval that contains a coin flip; within 12 months only 3 of 10. Forward Nasdaq against a month-matched control: +3m -1.6% vs +2.2%, +6m -1.7% vs +5.7% (p=0.057), +12m +10.5% vs +13.0% (p=0.33, n=10 vs 5,218). The pre-registered gate needed all three of leave-one-out, a mirror and a control. Leave-one-out PASSED against expectation (the recession rate never fell below 56%, so 2008 is not carrying it). The MIRROR killed it: steepening episodes -- the spread crossing above its 80th percentile -- returned -1.1% at +12m on n=6, WORSE than inversions, so curve shape is not what separates the periods. The control never cleared either. The one nominally significant horizon (+6m) moved from p=0.029 to p=0.057 on a cosmetic change to how an episode end was labelled, which is its own warning.',
    use: 'Never write that an inversion means equities fall or that a downturn is being under-priced: over fifty years the forward equity read does not separate from a matched control at any horizon, and steepenings were followed by WORSE returns than inversions. The recession association may be reported descriptively -- 6 of 10 within two years -- but always with the denominator, because the folk version silently reverses the conditional: P(inversion | recession) is high, P(recession | inversion) is 60% with an interval from 31% to 83%, and four of ten inversions were followed by no recession at all. USREC is NBER-dated in arrears, so even the half that is real can never be traded. 2019-08 is the case to remember: right about the recession, and +48.5% on the Nasdaq over the following year.',
  },
  {
    id: 'funding-stress', domain: 'macro', verdict: 'null', date: '2026-10-02', doc: 'MD files/FUNDING_STRESS_PREREG.md',
    claim: 'Genuine funding stress -- the headline SOFR trading above the Fed floor away from month-end, or the Standing Repo Facility actually being drawn -- precedes wider ranges and weaker risk assets. The follow-up repo-stress-range left open after finding the 99th-percentile version was month-end plumbing',
    result: 'NULL, and both setups failed for different reasons. 2,123 SOFR sessions 2018-04 to 2026-09, same instruments, ATR-quintile-matched control and 10-session de-clustering as P1 so the numbers sit beside it. S1 (headline SOFR >= 3bp over the floor, month-end excluded) left just 15 episodes -- UNTESTABLE against a pre-registered floor of 20 -- and 12 of those 15 fall on the 14th-18th of a month. Removing month-end did not remove the calendar, it revealed a different one: mid-month tax and settlement dates. S2 (SRF drawn) gave 21 episodes and came back AGAINST the written expectation: SPX500 next-5-session range -0.561 ATR [-0.984, -0.181] versus control, negative in both halves (-0.928 / -0.228) -- markets are CALMER after the facility is used, not wider. EUR/USD -0.483 [-1.150, +0.119] and USD/JPY +0.417 [-0.066, +0.963] are both null. Direction null on all three for both setups, as pre-registered. The SRF is drawn on 667 of 2,123 sessions (31%), so "the backstop was used" is routine plumbing rather than a stress marker -- the same discovery P1 made about the 99th percentile.',
    use: 'Never read SOFR above the floor as a stress signal: at month-end it is balance-sheet dressing (P1), away from month-end it is mid-month tax and settlement dates, and the Standing Repo Facility is drawn on nearly a third of all sessions. Do not claim that a drawn SRF warns of a wider tape -- the one interval that excludes zero points the other way. That negative is reported as measured and NOT as evidence the backstop works: with usage this routine, SRF days are mostly ordinary days, and the sample contains no pre-2018 crisis. The open question this still does not answer is whether funding stress matters when the facility is NOT there to cap it.',
  },
  {
    id: 'gex-range', domain: 'positioning', verdict: 'validated', date: '2026-09-24',
    also: ['oi_research_book/G3_AND_EVENTDAY_PREREG.md', 'oi_research_book/GEX_FX_CROSSMATCH_PREREG.md'],
    doc: 'oi_research_book/GEX_RANGE_BROWNIAN_RESULTS.md', instruments: ['NQ'],
    claim: 'Dealer gamma positioning says something about how far price travels the next day -- long gamma damps movement, short gamma amplifies it. The mechanism behind every "GEX" read on this desk, asserted in the AI prompt and in levelExpectation Reject/Break since before it was ever scored',
    result: 'The RANGE half is real on the Nasdaq and the DIRECTION half is not. Pre-registered in 0663f29 and run on 793 days of NQ from the 1,521-day per-strike archive in OI Data/NAS100_USD.csv: next-day realised range against a same-trailing-vol Brownian baseline is +0.176 higher on short-gamma days (p 0.0008), rising to +0.315 matched on trailing vol -- the vol confound was diluting the effect, not creating it. Positive in 4 of 4 specifications and 6 of 6 usable years. The reversal condition the study named for itself is closed (0afafbb): vol-matched dDR is +0.306 on non-event days, +0.306 on event days, +0.304 overall, so FOMC/CPI/NFP/opex contribute nothing. TWO CORRECTIONS TO THE FOLK VERSION. (1) The asymmetry runs the other way: short-gamma days sit at DR ~1.02, essentially Brownian, while long-gamma days sit at ~0.85 -- the reliable state is "long gamma is QUIET", not "short gamma is wild". (2) It does not generalise to FX, and it carries no directional content; the adjacent wall-magnet direction (G3) was falsified separately at 48.8% out-of-sample against a 49.9% placebo. The earlier 2026-08-22 band-position study (analysis/gamma_band_realised.py, 26 days) is NOT superseded by this and did not test the same variable -- it was UNDERPOWERED at a thirtieth of the power, and its own spec curve over 90 specifications returned median t -0.861 against a placebo mean of +0.263, neither supporting nor ruling out.',
    use: 'Report GEX as a RANGE statement and never as a direction. On the Nasdaq, long gamma is the informative state and the honest sentence is "quieter than a vol-matched baseline"; short gamma means ordinary movement, so "amplifying" and "breakout risk" overstate it. Say nothing from GEX on FX -- it was tested there and does not carry. Never let a gamma sign imply mean reversion or a breakout: the directional layer beside it is falsified, not merely untested. js/ai.js was corrected to this wording on 2026-10-02; js/levelExpectation.js still splits Reject from Break on the same rule and has NOT been re-scored against this result, which is the open item.',
  },
  {
    id: 'macro-confluence-direction', domain: 'macro', verdict: 'context', date: '2026-10-03', doc: 'MD files/MACRO_CONFLUENCE_DIRECTION_PREREG.md',
    claim: 'Does agreement across independent macro domains -- Fed net-liquidity momentum, yield-curve (T10Y2Y) regime, and HY-OAS credit stress, all +1 or all -1 the same day -- predict forward direction on EUR/USD, SPX500 and GOLD beyond a single domain alone (COG\'s "Surface Explorer" framing, 2026-10-02)',
    result: 'UNTESTABLE, not null. The harness ran end to end (analysis/macro_confluence_direction_study.mjs) but all three domains are only simultaneously computable 2023-11-01 to 2026-10-02 (757 days) -- bounded by BAMLH0A0HYM2 (HY OAS), whose FRED history genuinely starts 2023-10-03 regardless of the cosd param (confirmed directly against fredgraph.csv, matching the "credit stack has only ~3yr FRED history" trap already on record in js/dataCatalogue.js). That window produced only 12 positive-confluence and 5 negative-confluence episodes, both under the MIN_EVENTS=30 floor on every instrument/horizon cell.',
    use: 'Do not report this as "confluence has no edge" -- the question was not reached. Re-running with a longer-history credit proxy (BAA10Y-AAA10Y, which goes back to the 1980s on FRED, in place of BAMLH0A0HYM2) is the open next step, and needs its own prereg amendment before running, not a silent swap -- same discipline as every other study on this ledger.',
  },
  {
    id: 'macro-confluence-baa-credit', domain: 'macro', verdict: 'null', date: '2026-10-03', doc: 'MD files/MACRO_CONFLUENCE_BAA_CREDIT_PREREG.md',
    claim: 'Same claim as macro-confluence-direction, re-run with a testable sample: does agreement across Fed net-liquidity momentum, T10Y2Y curve regime and BAA10Y-AAA10Y investment-grade credit stress -- all +1 or all -1 the same day -- predict forward direction on EUR/USD, SPX500 and GOLD, beyond a single domain alone',
    result: 'NULL, properly powered this time: 39 positive- and 38 negative-confluence episodes 2009-2026 (both clear the 30-per-cell floor). One cell nominally cleared the raw interval -- EUR/USD at H=20 on positive confluence, -0.616% [-1.117, -0.080] -- but FAILS THE GATE: negative confluence at the same horizon is also negative (-0.023%, halves disagree in sign), so positive and negative confluence point the SAME direction, not opposite. That is the volatility/drift-mirror trap this gate was built to catch -- EUR/USD drifting lower across many confluence-dense years, not confluence predicting direction. Every other instrument/horizon cell is a flat null outright.',
    use: 'Confluence across these three macro domains does not predict forward FX/index direction at 5 or 20 days. This closes the "does agreement across macro domains help read direction" question for this specific design (3 domains, daily resolution, EUR/USD+SPX500+GOLD) -- same family result as yield-asset-coupling, curve-inversion, funding-stress and rates-pivot-lead. Same-bar / qualitative use of these domains (e.g. the liquidityGateEngine.js panel on today.html) is unaffected -- this tested FORWARD prediction, not whether the panel is worth looking at.',
  },
  {
    id: 'macro-confluence-range', domain: 'macro', verdict: 'null', date: '2026-10-03', doc: 'MD files/MACRO_CONFLUENCE_RANGE_PREREG.md',
    claim: 'Given this desk\'s range/timing findings validate far more often than direction, the same confluence setup from macro-confluence-baa-credit was re-asked on RANGE: does liquidity+curve+credit confluence (either sign) predict WIDER forward range on EUR/USD, SPX500, GOLD, pre-registered expectation "real but modest, positive"',
    result: 'NULL AS HYPOTHESISED -- the pre-registered gate required diff > 0 (wider range) and failed on every cell, because the measured effect runs the OPPOSITE way almost everywhere it is statistically real: SPX500 at H=20 is -0.977 ATR [-1.349,-0.612] (both signs of confluence separately real and negative), EUR/USD H=20 -0.553 ATR [-0.949,-0.025]. GOLD is flat throughout. This was NOT pre-registered as a possible direction and must not be quoted as a validated finding -- it is an unregistered observation surfaced by this run, exactly the trap this desk\'s own discipline exists to catch. Also note a gate-design flaw found while banking this: the "halves agree in sign" check is vacuous for a range outcome (range cannot be negative, so it always passes) -- it did no work here and should be replaced with "halves agree in SIGN OF THE DIFFERENCE from control" if this is re-tested.',
    use: 'Do not report "macro confluence widens range" -- that failed. If "macro confluence NARROWS range" (the opposite, unregistered pattern, strongest on SPX500 at 20 days) is worth chasing, it needs its OWN pre-registration before being tested or trusted, same as everything else on this ledger -- an eye-catching number from an exploratory run is not evidence until it has been re-asked properly.',
  },
  {
    id: 'yield-slope-magnitude', domain: 'macro', verdict: 'null', date: '2026-10-04', doc: 'MD files/YIELD_SLOPE_MAGNITUDE_PREREG.md',
    claim: 'Day-clustered formalisation of an exploratory pass (analysis/yield_shape_extended_theories.py): among the already-banked regime-gated turn signals (EUR/GBP/NZD/CHF vs yesterday\'s yield shape), does the STEEPNESS of the local 1h yield leg into a predicted turn correlate with the SIZE of the subsequent price move, not just whether a turn happens -- pre-registered gate required at least 3 of 4 pairs to independently clear',
    result: 'NULL on the gate: only 1 of 4 pairs clears. EUR/USD alone is strong (Spearman rho=0.618 [0.343,0.789], n=31 days, halves 0.43/0.64 both positive, beats 100% of 1000 placebo shuffles). GBP/USD is positive but its CI crosses zero (rho=0.218 [-0.124,0.508]). USD/CHF is near-zero (0.076). NZD/USD is NEGATIVE, the opposite sign from the hypothesis (-0.197 [-0.527,0.191]). The exploratory bar-level pass that motivated this (theory B) showed a monotonic pattern on all 4 pairs -- that pattern did not survive proper day-level de-clustering (one row per day instead of every 15-min bar), which is exactly the within-day pseudo-replication trap this ledger\'s discipline exists to catch.',
    use: 'Do not report "steeper yield slope means a bigger move" as a general rule across the four tracked pairs -- it is NOT, outside EUR/USD specifically. EUR/USD\'s own result is strong enough to be worth a dedicated single-pair follow-up if pursued further, but the owner\'s original claim (apply this across the signal generally) is closed as stated.',
  },
  {
    id: 'tag-x-persistence', domain: 'volatility', verdict: 'null', date: '2026-10-03', doc: 'forge/TAG_X_PERSISTENCE_PREREG.md',
    claim: 'At the first p75 Vol Forecast line touch, do the line tag (CME CVOL / the lines\' sigma, terciles) and 4h persistence (variance ratio over the previous 20 London days, terciles) ADD UP to a tradeable edge: H1 follow the break on CONTINUE x giving-back days; H2 fade the touch on EXHAUST x extending days. Net of js/perLineStrategy.js costs, 7 CVOL instruments, 2016-2026',
    result: 'BOTH FAIL by the pre-registered rules (9,663 touches; analysis/surfaces/TAG_X_PERSISTENCE_RESULTS.md). H1: -0.022 / -0.003 R by half, 3/7 instruments, below the shuffle. H2 is the closest any fade has come on this desk: +0.011 / +0.075 R by half, 5/7 instruments, beats the shuffled-VR benchmark, still positive at 2x costs -- but the 97.5% day-clustered CI [-0.016, +0.097] includes zero, so it fails check 2. What held: the TAG moves continuation odds at the touch in both halves (logistic CONTINUE +0.26 / +0.20, z 4.3 / 2.4; EXHAUST -0.26 / -0.33, z -3.6 / -3.3), confirming the range-residual mechanism at line-touch level on an independent IV source. Persistence adds little once the tag is known (giving back +0.07 / +0.11, z 1.1 / 1.2). EXHAUST days stall a lot (35-41% stall vs ~19% on CONTINUE days).',
    use: 'Show the tag as the read that moves fade/continue odds at the lines (range context, never direction). Show persistence only as weak context, not as a reason. Do not trade a fade on EXHAUST x extending: it is a forward-test candidate, not a rule -- the paper record logs tag and persistence on every break (ctx), and an H2 forward record needs its own pre-registration before it counts. The follow geometry here (entry at the line, p50 stop, p90 target) stays below break-even even on CONTINUE days; the rule that passed (rich-vol break) uses a tight stop and 5R/10R targets, so geometry matters as much as context.',
  },
  {
    id: 'skew-fade', domain: 'volatility', verdict: 'null', date: '2026-10-03', doc: 'forge/SKEW_FADE_PREREG.md',
    claim: 'Fade the first p75 Vol Forecast line touch when options skew is AGAINST the side being touched (CME CVOL skew, spot-oriented, terciles fitted 2016-22) -- H3 alone, H4 on EXHAUST-tag days. Prompted by a descriptive read on settlement-built 25-delta risk reversals (2020-26) where skew-against touches faded 4-6pp more in both halves. 7 instruments, net of costs',
    result: 'BOTH FAIL, and the prompting read DID NOT REPLICATE on the independent CVOL source (analysis/surfaces/SKEW_FADE_RESULTS.md, 8,611 touches): fade rate with skew against 37.5% / 40.1% by half vs 38.1% / 41.0% with it -- no difference. H3 fade-R -0.053 / -0.050, 0/7 instruments, CI [-0.090, -0.015] (significantly negative). H4 -0.100 / +0.012, 1/7.',
    use: 'Do not use options skew to choose fades at the lines, and do not show "skew against this touch" as context: the settlement risk-reversal read was source-specific and is dropped, as the pre-registration said it would be. Together with the butterfly first look (null for continuation) this means the options market\'s SHAPE (skew, tails) adds nothing at the touch; only its LEVEL against the lines\' sigma (the line tag) does.',
  },
  {
    id: 'vol-curve-front', domain: 'volatility', verdict: 'validated', date: '2026-10-04', doc: 'forge/VOL_CURVE_FRONT_PREREG.md',
    instruments: ['NQ', 'SPX'],
    claim: 'The front of the S&P implied-vol curve (VIX9D / VIX, cut-offs fixed in advance: calm < 0.8858, dear >= 0.9669) tells you whether the PRODUCTION NQ/SPX range lines (yz-10 on NY-close bars x event multiplier, production widths) are too tight or too wide for the day -- and whether that pays as a follow-on-dear / fade-on-calm trade',
    result: 'RANGE PASSES, TRADES FAIL (analysis/surfaces/VOL_CURVE_FRONT_RESULTS.md, 5,368 index-days, 2,741 touches, 2016-2026). Share of days past the production hl p75 (design 25%): calm 18.2% / 19.0%, normal 24.0% / 26.5%, dear 32.5% / 32.3% by half; logistic DEAR +0.68 / +0.59 (z +5.9 / +5.4) and CALM -0.59 / -0.72 (z -4.9 / -6.0) with the vol-level terciles in the model. NOT the event calendar: dear-front days with no Major release ran 32-33% too. Trades: follow on dear days +0.02 R (line race) and +0.14 R (break shape) pooled but negative in half A and below the shuffle; fade on calm days -0.05 / -0.07 R, negative in both halves and on both instruments.',
    use: 'Use the front ratio as a RANGE read for NQ/SPX: dear front = the production lines are likely too tight today, calm front = likely too wide (the outer lines cap). It is the strongest index width input found and belongs in the index sigma (a fitted front multiplier beside the event multiplier) and the Daily Read tag. Do not fade on calm days: wide lines mean price stalls short of them, it does not reverse. Never a direction call. The break-shape follow (0.2 sigma stop, 5R) was positive in most front states on indices -- an index-wide lead to pre-register on its own, not a front effect.',
  },
  {
    id: 'directional-rescore', domain: 'volatility', verdict: 'null', date: '2026-10-04', doc: 'forge/DIRECTIONAL_RESCORE_PREREG.md',
    claim: 'On the page\'s own daily export levels (v4Days: OH/OL p50-p90, Close p50/75), scored on DIRECTION (share continuing among resolved touches vs break-even, signed sigma return at 15/60/240 min, date-clustered errors): H8 follow when the touch is on the side of a strong export Drift (|d| >= 0.25); H9 fade when it is against; H10 follow on CONTINUE-tag days, fade on EXHAUST-tag days. 10 instruments, net of costs',
    result: 'ALL FOUR FAIL (analysis/surfaces/DIRECTIONAL_RESCORE_RESULTS.md, 84,431 first touches, 2016-2026). Drift carries NO direction at the touch: directional share minus break-even -0.001 aligned and -0.001 against, r60 +0.001 / -0.001 sigma. Tag CONTINUE: share +0.019 above break-even and r60 +0.024 sigma (SE 0.006), positive in both halves -- real but tiny -- follow +0.025 R gross, -0.048 R net. Tag EXHAUST: no reversion (fade -0.007 R gross); those days STALL (32-33% vs 16% on CONTINUE days). The re-score of every export line: directional share sits 1-3.5pp ABOVE break-even and signed returns are small positive in both halves (a slight continuation tilt everywhere, strongest at p90); fades are negative gross on most lines; follow is ~0 to +0.05 R gross and -0.02 to -0.06 R net -- the cost (~0.05 R per trade) is the whole difference.',
    use: 'At the export levels there is a slight CONTINUATION tilt and no mean-reversion edge -- fading the lines is the losing side, on every condition tested. The export Drift reading is descriptive only (no direction at touches). The line tag sets activity (move vs stall) with a sub-cost directional nudge. Any tradeable version needs lower execution cost than the retail table (follow edges are ~0.02-0.05 R gross) or information the lines do not contain. Do not build a fade bot on these levels.',
  },
  {
    id: 'exhaustion-schedule', domain: 'volatility', verdict: 'null', date: '2026-10-04', doc: 'forge/EXHAUSTION_SCHEDULE_PREREG.md',
    claim: 'A planned, open-anchored "is the day done" schedule from the export calculation: for each London hour, the distance at which a running extreme is >= 80% likely to be the day\'s final one -- as a stand-aside level for continuation and as a fade level. 34 instruments, 2016-2026',
    result: 'DESIGN DEGENERATE -> NULL (analysis/surfaces/EXHAUSTION_SCHEDULE_RESULTS.md). The 80% schedule fitted to 0 sigma at every hour from ~16:00 London (any running extreme is >= 80% final by then) and to no level before 13:00; calibration "passed" (0.907 unseen) but only restates time of day; stand-aside untestable; fade not run. Post-hoc, both halves: P(a NEW running extreme is the day\'s final one) is ~0.15 07-11, ~0.31 14-17, ~0.35 17-20, ~0.64 20-24 London and FLAT across 0.5-2.5 sigma from the open within each band -- distance travelled adds almost nothing.',
    use: 'There is no price-only distance-based exhaustion level at the export levels: a move that has travelled far is not more spent than one that has travelled a little at the same time of day. Exhaustion is a CLOCK effect: stop opening continuation trades late in the London day and bank them into the close; do not fade a new extreme because it is far from the open. Any exhaustion level with an edge needs information outside price (real order flow / absorption, fixes, expiries) -- see plans/ANALYSIS_2_ROADMAP.md Tier 1.',
  },
  {
    id: 'breadth-tilt-semis', domain: 'price', verdict: 'underpowered', date: '2026-10-05',
    doc: 'MD files/BREADTH_TILT_SEMIS_PREREG.md',
    claim: 'Crown Macro, undated clip: "the RSP spy ratio just broke its multi-year trend line... breadth is collapsing... the real leadership is compressed into the physical bottlenecks of the AI buildout. This is memory, lithography and foundry... a tilt towards the AI bottlenecks generated 3.6% in expected alpha over SPY". Stated testably: when RSP/SPY is narrowing, semis subsequently outperform SPY by MORE than they ordinarily do',
    result: 'UNTESTABLE on the data this desk holds, and that IS the finding. Pre-registered in f7929fd before the harness existed. SMH, RSP and SPY are carried only from 2020-10 -- 1,507 usable sessions. A rolling 504-session threshold consumes the first two years, and de-clustering at 20 sessions (a narrowing regime persists for months) leaves 13-14 independent episodes against a pre-registered floor of 20. Every cell returned UNTESTABLE at both the 20- and 60-session horizons, for the narrowing setup and for its broadening mirror alike. No excess return is reported, because computing one on 13 episodes and quoting it is precisely the error the floor exists to prevent. NOTE WHAT THIS DOES NOT SAY: not that the tilt is null, and not that the claim is wrong. The question was asked properly and this sample cannot answer it.',
    use: 'Never cite this for or against an AI-bottleneck tilt in either direction. The adjacent BREADTH claims are separately and properly null -- breadth-narrowing (35 de-clustered events over 23 years, killed by its mirror), rotation-extreme (n=140) and dispersion-crowded-week (68 setups) -- but all three asked what the INDEX does next, so none of them reaches this cross-sectional sleeve question, which stays open. The fix is MORE HISTORY, not a different design: SMH trades back to 2000 and RSP to 2003, so the identical pre-registered test on a longer series would clear the floor several times over. Re-running the same design on a longer sample is legitimate; relaxing the de-clustering or the floor after seeing 13 episodes would not be.',
  },
  {
    id: 'horizon-reversion', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/HORIZON_REVERSION_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'GOLD', 'NQ', 'SPX'],
    claim: 'Weekly/monthly range lines that let sigma fade back to its 250-day level (Lesson 03 half-life) beat the sqrt-h scaling of today’s sigma',
    result: 'PASS: test pinball weekly 0.968 (33/33 instruments better), monthly 0.936 (94%). p75 exceedance by calm/normal/stressed state, sqrt-h vs reverting: weekly 30.7/20.0/15.2% -> 24.3/20.5/19.3%; monthly 32.5/18.3/12.4% -> 20.7/20.1/21.3%.',
    use: 'Weekly/monthly lines: use the "Forecast Weekly · Reverting" export / chart view. The sqrt-h lines run too narrow after calm spells and too wide after stressed ones.',
  },
  {
    id: 'combined-range', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/COMBINED_RANGE_PREREG.md',
    instruments: ['NQ', 'SPX', 'DOW', 'US2000', 'DE30', 'UK100', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD'],
    claim: 'The validated pre-open range findings, fitted JOINTLY into the ladder sigma, beat the ladder alone on the daily range',
    result: 'PASS: test pinball 0.900 indices (6/6), 0.939 FX+gold (7/7). Implied vol / own sigma carries almost all of it (IV-only 0.923 / 0.938, post-hoc ablation); VIX-curve/breadth/NQ-week add ~2.5% for US indices only. Live-type re-calibration 28/28 (analysis/output/iv_adjusted/CALIBRATION.md).',
    use: 'Daily lines: the "Forecast · IV-adjusted" export / chart view. IV/sigma (the Daily Read exhaustion tag) belongs INSIDE the range forecast, as a blend (elasticity ~0.6-0.8), not a pure swap.',
  },
  {
    id: 'cross-iv', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/CROSS_IV_PREREG.md',
    instruments: ['EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCHF', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'AUDCAD', 'EURCAD'],
    claim: 'A cross’s implied vol built from its two USD legs (CVOL + trailing leg correlation) improves its daily range lines the way own-IV does for the majors',
    result: 'PASS: test pinball median 0.965, 15/15 crosses better; low/high leg-IV/sigma tercile p75 exceedance 15.8% / 31.9% -> 22.8% / 23.3%. The majors’ elasticity transfers (0.969).',
    use: 'Crosses join the IV-adjusted daily lines. NZD pairs have no NZD implied vol and stay on the plain ladder.',
  },
  {
    id: 'us-extras-confirm', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/US_EXTRAS_CONFIRM_PREREG.md',
    instruments: ['NQ', 'SPX', 'DOW'],
    claim: 'On US indices the VIX-curve / breadth / NQ-down-week terms add to IV/sigma, confirmed on years no test had touched (2011-2015)',
    result: 'CONFIRMED: (IV + extras) / (IV only) test pinball median 0.957, 3/4 better (US2000 flat in both windows), 5/5 signs as ledger; VIX-inverted-day p75 exceedance 38.8% -> 19.1%.',
    use: 'Built into the IV-adjusted export for NQ/SPX500/US30/US2000. A calm VIX front narrows the US index lines; an inverted or dear curve widens them.',
  },
  {
    id: 'intraday-range', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/INTRADAY_RANGE_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'GOLD', 'NQ', 'SPX', 'DE30'],
    claim: 'An hourly re-forecast of the remaining range (range used x last-hour speed, by hour) beats the morning lines for the rest of the day',
    result: 'PASS: FX+gold 21/21 hourly checkpoints, indices 19/21. Informative gain 08:00-13:00 (FX 9-17%, indices 3-4%); late-day gains largely mechanical. Indices downside lines slightly tight (p75 29%).',
    use: 'live-range.html: projected high/low lines that step each hour. Size and reach only, never direction.',
  },
  {
    id: 'line-touch-reach', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/LINE_TOUCH_REACH_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'GOLD', 'NQ', 'SPX'],
    claim: 'After price reaches a Live Range line, the model’s own odds of reaching the next line before the close hold',
    result: 'CALIBRATED: 20/22 eligible cells within 5pp. p50 -> p75 ~50%, p75 -> p90 ~40% (FX 38-41%, indices 33-47%); a p75 touch typically carries ~3/4 of the way to p90.',
    use: 'A Live Range line is not a barrier: from the bold p75, about 2 in 5 days reach p90. Use it for targets and expectations, not for fades.',
  },
  {
    id: 'live-range-line-race', domain: 'price', verdict: 'null', date: '2026-10-06', doc: 'forge/LIVE_RANGE_HISTORY_PREREG.md',
    claim: 'Price behaves differently at the Live Range page’s hourly-moving lines than at control lines: after a touch it continues or fades more than chance',
    result: 'PATH-NEUTRAL. Hourly lines replayed from M1 for 34 instruments (fidelity to the page’s JS exact), grids refit on the first 60% of dates, scored on 2022-06 to 2026-08: 92,914 real touches vs 96,912 placebo touches. Race from the touch bar’s close, next line out vs back level: real − placebo within ±1pp pooled in every rung/class (FX p50 25.2% vs 25.3%, p75 32.9% vs 32.8%, p90 48.5% vs 48.5%). 255 cells (rung, class, hour, side, used×pace cell, regime, jump-already-today, big line shift): 7 cleared the rule at the registered placebo (2.7%, below the 5% chance rate), 0 of 255 with a closer-matched placebo. Hour-limited race: the registered placebo flagged 42/196 cells at a common −2 to −4pp offset, which vanished (2/196) once the placebo’s distances were matched, so it was a baseline artefact. Net of spread (0.016σ FX, 0.024σ indices, 0/34 above 0.15) no cell is an edge; the best (FX p90, 08-14, high used/high pace, +8.3pp, n 374) is one of 255 picked on the test data.',
    use: 'Do not trade a fade or a continuation at a Live Range line. The lines carry how far and how much time is left, not a direction at the touch. The one cluster to watch, not act on: FX p90 touches 08:00-14:00 on the upside continued a little more than the placebo (+4.8pp, n 670).',
  },
  {
    id: 'live-range-jump-through', domain: 'volatility', verdict: 'context', date: '2026-10-06', doc: 'forge/LIVE_RANGE_HISTORY_PREREG.md',
    claim: 'Jumps run straight through the Live Range lines (the lines only react at the next hourly redraw), and the reach odds fail on jump days',
    result: 'Test 2022-06 to 2026-08. A touch bar overshoots its line by ≥0.25σ in 3-5% of touches late in the day but 26% (p75) / 44% (p90) for early-morning lines; on BNS jump days 15-20% vs 3-5%, but that flag is end-of-day and the jump bar is often the touch bar itself. Usable in real time: a ≥0.5σ 5-minute move EARLIER today lifts FX jump-through only +3 to +5pp (indices inside noise) and does not move reach odds (p75→p90 43.5% [39.5, 47.4] vs 39.6%). A ≥0.5σ move in the LAST HOUR before a redraw lifts p75→p90 to 48.2% FX [44.4, 51.8] (n 1,775) and 48.1% indices (n 343) vs 40%; a jump-in-last-hour correction cuts test log-loss by 0.00011 [0.00021, 0.00001] (statistically below 0, practically ~1% of touch rows). BNS jump days: p75→p90 47.9% FX / 50.8% indices vs 38-40% (descriptive; known only afterwards).',
    use: 'Expect jump-through mostly from the touch bar itself, which no line can anticipate. After a ≥0.5σ five-minute move in the last hour, read p75→p90 as about 48-49%, not 40%. A big jump earlier in the session does not need its own adjustment.',
  },
  {
    id: 'live-range-sigma-basis', domain: 'volatility', verdict: 'context', date: '2026-10-06', doc: 'forge/LIVE_RANGE_HISTORY_PREREG.md',
    claim: 'The Live Range grids (js/intradayRangeParams.js) are calibrated on the σ the page feeds them, and the 2026-10-05 test was out of sample',
    result: 'Neither. The grids and tercile edges were fitted on ALL dates (the 60/40 split only scored them), and on a daily σ (D1 estimator on OANDA bars) that is about 10% below the page’s σ (NY-close forecast σ): ratio median 0.90 on 31 of the 33 instruments checked (DE30/UK100 1.00; SPX500 not checked). Shipped params on the page’s σ, test 2022-06 to 2026-08: p75 exceedance FX 21.5% (target 25%), indices 24.2%; p90 8.0% (10%); p75→p90 35.9% FX (40%), 37.8% indices; refit in the page’s σ basis: 24.0/27.6%, 9.5/11.2%, 39.7/41.1%.',
    use: 'The lines the page draws sit about 3pp (p75) and 2pp (p90) too far out in the FX class, and the “from here” 40% reads about 36%. A refit of the grids on pit σ (first 60% of dates) closes this; not applied, live files untouched.',
  },
  {
    id: 'live-range-book', domain: 'price', verdict: 'null', date: '2026-10-06', doc: 'forge/LIVE_RANGE_BOOK_PREREG.md',
    claim: 'The Fade/Continue Book run on the hourly-moving Live Range lines (not the static morning lines) fades or continues profitably in some cell, and a trend-day state built from the line path (the up or down p50 line touched in consecutive hours) predicts direction to the close',
    result: 'Null both parts. A: 195,618 resolved first touches, 34 instruments, 838 cell x strategy pairs (session, touch number today, used x pace cell, a/b geometry, regime, jump earlier today, big line shift, side). Pooled net R per trade after spread is negative for continue (-0.18 to -0.45R) and about zero or negative for fade. 68 cells had train net R > 0; mean train R +0.150 became +0.001 on test, only 26.5% stayed positive, 0 passed (CI wholly above 0 and both halves positive). B: trend state (2 and 3 consecutive hours riding the p50 line) 7 class x hour cells, forward return to 22:00 vs the same-hour drift: all inside noise (test excess -0.05 to +0.05 sigma, spread 0.016-0.03 sigma), 0 edges. Train 2016-2022 selection, test 2022-06 to 2026-08, grids refit on train.',
    use: 'Moving the lines to hourly does not create a fade or continue edge: the race after a touch is still the optional-stopping geometry plus spread, and consecutive line touches do not mark a trend day. The lines remain a calibrated size and time-left tool. Caveat: R explodes on late p90 fades (tiny risk distance), so the p90 pooled interval is wide.',
  },
  {
    id: 'live-range-walkforward', domain: 'price', verdict: 'null', date: '2026-10-06', doc: 'forge/LIVE_RANGE_WALKFORWARD_PREREG.md',
    claim: 'Train forward on prior days only, by weekday and hour, and each day choose continue or fade for the p50 / p75 / p90 hourly-moving Live Range lines; that decision rule trades profitably 2018-2026',
    result: 'Null. 157,129 resolved line touches on 34 instruments, 2,176 days, grids refit every quarter on prior data only, decision refit every day on prior days only (expanding window; 3-year rolling and trailing-vol-regime variants too). Primary rule (trailing net R >= +0.03, t >= 3, n >= 200): the learner almost never found a cell worth trading, 0 to 118 trades of 157k, none profitable. Loose rule (mean > 0, t >= 1.5, n >= 100): 3-4k trades, net R -0.03 to -0.15 per trade, positive in 1 of 8 years. The learner does pick the less-bad side (+0.07R over a random continue/fade pick, CI [+0.02, +0.12]) but both sides lose after spread (same trades: always continue -0.19R, always fade -0.055R). 0 of 12 variants pass.',
    use: 'There is no hour / weekday / line rung where a walking-forward continue-or-fade rule works on the moving lines. Do not build a continue/fade chooser on them. The decision to trade or not at a line is worth nothing beyond what the line says about range and time left.',
  },
  {
    id: 'live-range-clock', domain: 'volatility', verdict: 'null', date: '2026-10-07', doc: 'forge/LIVE_RANGE_CLOCK_BASELINE_PREREG.md',
    claim: 'The Live Range moving lines (range used x last-hour pace, by hour) forecast the remaining range better than the clock of the day alone',
    result: 'Fails the registered bar: THE MOVING LINE IS A CLOCK. Test = last 40% of dates, 34 instruments, pinball on remaining range, median across instruments, B (3x3 page model) / C (hour only): FX+gold beats the clock at 12 of 21 checkpoints (need 14), by only 1-1.5% (median ratio 0.988 at 08-14 and 15-21, 0.995 at 01-07), better on 90-100% of instruments but by a hair; indices 7 of 21, 1-2% in the afternoon, worse than the clock before 09:00. Range used alone carries most of the morning/midday gain, pace alone most of the late gain; the 3x3 beats either alone by under 1%. The earlier 9-17% (FX) gain of the hourly lines over the MORNING lines is therefore almost entirely time of day.',
    use: 'Treat the hourly lines as a clock-aware range shrinker: the next exhaustion line closes in because time passes, with range used and pace adding about 1 to 1.5% of forecast skill beyond that. Do not present the lines as detecting exhaustion from price action. A static hour-by-hour table of remaining range would do nearly the same job.',
  },
  {
    id: 'live-range-features', domain: 'volatility', verdict: 'null', date: '2026-10-07', doc: 'forge/LIVE_RANGE_FEATURES_PREREG.md',
    claim: 'Price-action indicators (VWAP distance, rate of change and acceleration, WaveTrend, RSI momentum, weekday, age of the extreme, relative tick volume) make the hourly moving range line smarter than the clock and range-used x pace at forecasting remaining range or whether the running high/low is already in',
    result: 'Null for the indicators. 34 instruments, test = last 40% of dates, features computed fresh from M1 (no Vote Atlas input). One feature at a time added to the page model: VWAP, ROC, accel, WaveTrend, RSI, relative volume, weekday, age of extreme: 0 of 22 class x feature tests reached 14 of 20 checkpoints; only IV/sigma (CME CVOL, 7 FX/gold instruments) did: 14 of 20, about 3% pinball gain at 02-14h, nothing after 15:00 (consistent with the IV-adjusted ladder result). A combined gradient-boosted model beats the page model and the clock (FX 19/20 checkpoints, 1-2% morning/midday, 14% late; indices 10/20), and on the exhaustion outcome (running extreme is already in) the all-feature model scores Brier skill +22% (FX) / +19% (indices) over hour x range used x pace. Decomposed (Amendment 1): a geometry-only model (price distance from the running extreme, hour, used, pace) already gets +23% / +21%; indicators add +0.42% [+0.31, +0.54] FX and +0.28% [+0.06, +0.50] indices on top, and the family ablation shows VWAP, ROC, WaveTrend and RSI contribute about 0 (0.00 to +0.06%), age of the extreme / weekday +0.27% FX, relative volume +0.07 / +0.15%. For remaining range, indicators over geometry: 0.991 FX, 0.998 indices.',
    use: 'No VWAP / momentum / WaveTrend / RSI readout improves an exhaustion call on the moving line. What predicts that a high or low is in is how far price has already pulled back from it, with how much time is left (the same finding as the Range Book extreme-in table), not an indicator. If the Live Range page ever shows an exhaustion probability it should hang off price distance from the running extreme and the clock, and optionally IV/sigma, not off oscillators.',
  },
  {
    id: 'live-range-confluence-book', domain: 'price', verdict: 'null', date: '2026-10-07', doc: 'forge/LIVE_RANGE_CONFLUENCE_BOOK_PREREG.md',
    claim: 'Confluences at the line (time and session of day, day volatility and range used, momentum into the line and rate of change, WaveTrend and WT divergence, VWAP, prior day and week levels, volume-profile POC / value area / naked POC, a meta-label of the day) decide fade vs continue better at the hourly-moving lines than at the static morning lines',
    result: 'Null. All passes of every line, not just first touches (198,719 moving-line passes, 249,322 static-line passes, 34 instruments, 2018-04 to 2026-08; features computed from M1, no Vote Atlas input). 204 confluence x class x rung tests: real lift in continue-vs-fade at the moving lines in 12 (5.9%, chance about 5%), at the static lines in 9 (4.4%); the moving line unlocks more in 4 (2%, below chance; two are the late-day p90 clock effect, one has n=364, one borderline). Walk-forward meta-label model (refit every quarter on prior passes, trading 2020-04 on): moving net R -0.21 per trade [-0.37, -0.00], static -0.012 [-0.031, +0.008], 1 of 6 years positive; AUC 0.736 vs 0.738 for the geometry-only random-walk share (static 0.621 vs 0.627): no confluence adds information beyond the line spacing. Single-confluence rules picked on 2018-2022 and confirmed after: moving 0 of 11 positive on test, static 2 of 55 (late-day p50 and prior-week-high continue, both flattered by dropping unresolved late stalls). Full-day map: after a p75 pass in London the extreme runs a median +0.65 sigma more (240 min later) and 45% reach the next line; in late NY it is +0.23 sigma in 90 min, 53% held; a 2nd or 3rd pass of the same line behaves like the first.',
    use: 'Do not build a fade / continue chooser from these confluences on either line: the lift they give is about what chance gives and none survives spread. The moving line does not unlock them. Use the full-day map for expectations (how far, how long, how often the extreme is in) and the existing finding that the clock and the price pullback from the extreme carry the information. Phase 2 (FVG, Fibonacci, round numbers) not run.',
  },
  {
    id: 'extreme-in-probability', domain: 'volatility', verdict: 'validated', date: '2026-10-08', doc: 'forge/LIVE_RANGE_SHADOW_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD', 'NQ', 'SPX', 'DE30'],
    claim: 'The chance that the running high (or low) is already the day’s final one can be read from the hour, the range used and how far price has pulled back from that extreme',
    result: 'CALIBRATED SHADOW. A count table (hour x pullback bin x used tercile, shrunk toward coarser cells), refit every quarter on prior data only and scored 2018-04 to 2026-08 on 34 instruments: Brier skill +20.9% (FX/gold) [+20.5, +21.3] and +18.0% (indices) [+17.4, +18.6] over the page’s hour x used x pace base rate; 96% / 95% of what a gradient-boosted geometry model reaches; every probability decile within 0.3pp (FX/gold) and 1.4pp (indices) of realised (n >= 48k per decile). Skill is mostly afternoon (+30% after 15:00) and small before 07:00 (+12% / +7%).',
    use: 'A take-profit / stand-aside read on a running extreme (live-range-shadow.html, read-only): high-in >= 80% means the move is probably done. It is geometry plus the clock, not an indicator, and not a direction: fading the extreme was tested in many forms and does not pay after spread.',
  },
  {
    id: 'live-range-break-linestate', domain: 'price', verdict: 'null', date: '2026-10-08', doc: 'forge/LIVE_RANGE_SHADOW_PREREG.md',
    claim: 'The hourly moving-line state at entry (room to the next line, range used, pace, hour) improves the rich-IV break rule: as a filter, a meta-label, or by exiting at the moving p75 / p90 line',
    result: 'Null. 4,633 rich-IV break trades 2018-04 to 2026-08 on the 7 CVOL instruments (baseline +0.123R, published +0.118R). Most room to the moving p75 vs least room: -0.096R [-0.359, +0.144], halves -0.013 / -0.177. Yearly-refit gradient-boosted meta-label from 2020 (takes 61%): taken minus all -0.010R [-0.135, +0.113]. Exit at the moving p75 instead of 5R/10R: -0.186R [-0.273, -0.095] (caps the fat right tail the rule lives on); at p90: -0.011R [-0.073, +0.052]. The M1 exit simulation reproduces the stored 5R/10R outcomes on 95.8% of cells (stops 99.8%, targets 93.5%, day-end exits differ at the margin).',
    use: 'Keep the rich-IV break as is: do not filter it by distance to the hourly lines and do not take profit at them; the edge sits in the few far winners. Power is limited (a few hundred independent days).',
  },
  {
    id: 'event-layer', domain: 'events', verdict: 'null', date: '2026-10-05', doc: 'forge/EVENT_LAYER_PREREG.md',
    claim: 'On top of the IV-adjusted daily lines, the typical size of the day’s scheduled release type (and yesterday’s surprise) improves the range forecast',
    result: 'First test (calendar_events.csv) PASSED for FX+gold (0.970, 7/7) but did NOT replicate on live inputs (ForexFactory names, live IV-adjusted sigma, 2020-2025): 0.9937 vs the 0.99 bar; the fitted correction overshoots (big-release-day p75 35.5% -> 17.3%). Yesterday’s surprise null in both. The live export’s coarse event tag already brings FOMC/NFP/CPI days to 27.1% passed vs 25%.',
    use: 'Keep the coarse event tag on the IV-adjusted lines; it already handles release days. No finer release-type layer. Do not widen the day after a surprise.',
  },
  {
    id: 'motif-regime-lookahead', domain: 'execution', verdict: 'context', date: '2026-09-19', doc: 'MD files/MOTIF_REGIME_LOOKAHEAD_PREREG.md',
    claim: 'Labelling the motif swing regime at the bar it becomes knowable (not the pivot bar) changes the motif best-config backtest',
    result: 'Same 14,310 trades: 20.6% of bars relabelled; best-config PF 1.315 -> 1.198, sum R 1,076 -> 807. The 1,176 trades the hindsight label skipped ran at PF 0.656 (-0.243R) and the live bot already takes them.',
    use: 'Expect motif PF about 1.20 live, not 1.32. Keeping the with-trend skip filter is a quality-vs-total-R call.',
  },
  {
    id: 'qmr-direction-vs-geometry', domain: 'price', verdict: 'null', date: '2026-07-28', doc: 'MD files/PREREGISTERED_EVALUATIONS.md#5b',
    claim: 'QMR’s direction call beats taking the inverse trade on the same gate-selected NQ days',
    result: 'n=609: S1 +0.177%/trade vs inverse +0.188%; direction alpha -0.0056% (t -0.08). Flat across gate strictness (|t| <= 0.44).',
    use: 'Treat QMR as an asymmetric-payoff day selector, not a direction forecast.',
  },
  {
    id: 'iv-ladder-gold', domain: 'volatility', verdict: 'validated', date: '2026-09-27', doc: 'forge/IV_LADDER_GOLD_PREREG.md',
    instruments: ['GOLD'],
    claim: 'A gold forecast ladder with sigma from CBOE GVZ beats the production realized ladder on H-L pinball',
    result: '2,581 sessions, 6 folds 2016-2026: pinball 0.2090 vs 0.2146 (2.6% better), 5/6 folds; calibration guard passed by 0.1pp. Weekly/monthly rungs badly calibrated, not shipped.',
    use: 'Gold daily ranges: the GVZ-based Forecast (IV) ladder, daily horizon only.',
  },
  {
    id: 'iv-ladder', domain: 'volatility', verdict: 'validated', date: '2026-09-23', doc: 'forge/IV_LADDER_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF'],
    claim: 'A forecast ladder with sigma from 30-day ATM implied vol (CME settlements) beats the realized-vol ladder on H-L pinball',
    result: 'IV better on 5/7: EUR -4.1%, GBP -4.1%, AUD -2.5%, CAD -3.1%, CHF -3.1%; worse on USDJPY (+1.0%) and NQ (+2.0%). Calibration inside the guard; monthly rungs off.',
    use: 'Pure-IV daily ladder for the five passing majors (the Forecast (IV) export). For most uses superseded by the IV-adjusted blend (combined-range).',
  },
  {
    id: 'iv-regime-fade-follow', domain: 'volatility', verdict: 'null', date: '2026-09-23', doc: 'forge/IV_REGIME_FADE_FOLLOW_PREREG.md',
    claim: 'The IV regime (level, VRP or term-structure stress) picks out days when Vote Atlas’s fade/follow choice loses',
    result: '20,138 honest FX trades: one negative discovery cell (follow x mid-IV, -0.013R), which made +0.095R [+0.008, +0.181] out of sample. VRP and stress: no negative cells.',
    use: 'Do not gate fade/follow on IV regime (Vote Atlas is dead regardless).',
  },
  {
    id: 'iv-sizing-filter', domain: 'volatility', verdict: 'null', date: '2026-09-23', doc: 'forge/IV_SIZING_FILTER_PREREG.md',
    claim: 'IV-based sizing beats realized-vol sizing, and a term-structure stress stand-aside filter improves live strategies',
    result: 'Market level steadier with IV (5/7) but trade level null: motif Sharpe 1.62 flat / 1.65 HAR / 1.67 IV, inside noise; IV sizing slightly hurt Vote (2.94 -> 2.88). Stress filter wrong sign: stress days beat calm by +0.014R.',
    use: 'IV is a better vol forecast, but not a reason to resize bots or stand aside on stress days.',
  },
  {
    id: 'ladder-calibration', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/LADDER_CALIBRATION_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD', 'NQ', 'SPX', 'DE30', 'UK100', 'EURJPY', 'GBPJPY'],
    claim: 'A candidate sigma (HAR-v2, HAR-800 with refit widths, IV-adjusted, pure IV) fixes the live ladder’s miscalibration across sigma regimes',
    result: 'HAR-800 cut the 30-cell regime miss 2.86pp -> 1.41pp and the 12-rung miss 1.53pp -> 1.24pp, pinball 0.950 of live, better on 28/28. IV arms pass but over-correct on indices. None meets the target bar; one test year.',
    use: 'HAR-800 is the preferred side-by-side shadow candidate for the ladder; live files unchanged.',
  },
  {
    id: 'v4-dirtag', domain: 'price', verdict: 'null', date: '2026-09-29', doc: 'forge/V4_EURUSD_DIRTAG_PREREG.md',
    claim: 'The today.html direction tag calls the EURUSD day, or makes money trading line touches in its direction (6-year replay)',
    result: 'Tag at 08:00 vs rest of day: 47.6% (n=475) and 46.1% (n=267); with-tag line trades -0.003R and -0.046R (t -1.7). Both failed.',
    use: 'Do not read the direction tag as a forecast.',
  },
  {
    id: 'v4-stage1', domain: 'price', verdict: 'null', date: '2026-09-29', doc: 'forge/V4_EURUSD_STAGE1_PREREG.md',
    claim: 'Context known at the touch turns EURUSD forecast-line touches into a positive net edge out of sample',
    result: '6,243 touches, 26 features: baseline fade -0.049R, follow -0.034R net. Training selected 1 bucket (= chance), which lost on test (-0.114R, t -1.8).',
    use: 'No context filter rescues the export lines as trade levels.',
  },
  {
    id: 'v4-stage0', domain: 'price', verdict: 'null', date: '2026-09-29', doc: 'forge/V4_STAGE0_PREREG.md',
    claim: 'There is an unconditioned fade or follow edge at the forecast export line families (17 pairs, about 10 years)',
    result: '0/28 pass under either event-tag run; gross within +/-0.02R of zero, matching a random-level control; costs 0.05-0.10R make every row net negative.',
    use: 'The export lines are range statements, not trade levels: for direction they behave like random levels.',
  },
  {
    id: 'vol-target', domain: 'volatility', verdict: 'validated', date: '2026-10-05', doc: 'forge/VOL_TARGET_PREREG.md',
    instruments: ['NQ', 'SPX', 'DOW', 'US2000', 'DE30', 'UK100', 'GOLD'],
    claim: 'Sizing by a forecast sigma beats constant risk at portfolio level, and the choice of sigma matters',
    result: 'Steadier risk PASSES: LONG vol-of-monthly-vol 0.63 -> ~0.25, worst month 20-25% smaller, same Sharpe; TREND Sharpe -0.16 -> +0.16 (+0.32 [+0.14, +0.50]). Which sigma does NOT matter (arms within ~0.03; HAR vs live +0.00 [-0.06, +0.06]).',
    use: 'Vol-target sizing with any sigma buys a smaller worst month, not more return. The new forecasts earn their keep on the lines, not on position size.',
  },
  {
    id: 'gamma-real-iv', domain: 'positioning', verdict: 'null', date: '2026-09-23', doc: 'oi_research_book/GAMMA_REAL_IV_PREREG.md',
    claim: 'Rebuilt with real per-strike implied vol, the gamma flip or net GEX predicts next-day range (FX + NQ)',
    result: 'Real IV moved the flip a median 0.28% and relabelled 20% of days. Textbook sign on 1/7, t>2 on 0/7; adding GEX to HAR+IV lowered OOS error on 2/7, 0 DM-significant.',
    use: 'The FX gamma null is not a proxy artefact: the IV surface already prices it. Distinct from gex-range (NQ Brownian DR).',
  },
  {
    id: 'iv-forecast', domain: 'volatility', verdict: 'validated', date: '2026-09-23', doc: 'oi_research_book/IV_FORECAST_PREREG.md',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'NQ'],
    claim: 'Implied vol inverted from CME settlements forecasts realized vol better than realized-vol (HAR) models',
    result: '21-bar RV: HAR+IV beats HAR on 7/7 (+5% to +21%), 4/7 DM p<0.05. Next-bar range: 7/7 (+2.6% to +6.7%), 4/7 significant. Direction / VRP null (1/14 |t|>2). VXN corr 0.977.',
    use: 'Use IV as the vol forecast input; it says nothing about direction.',
  },
  {
    id: 'wall-placebo', domain: 'positioning', verdict: 'null', date: '2026-09-23', doc: 'oi_research_book/WALL_PLACEBO_PREREG.md',
    claim: 'The ~60% rejection at a max-OI wall touch is specific to the wall rather than any touched level',
    result: 'Wall-minus-placebo break rates within +/-2.1pp at every horizon, every CI containing 0; the wall beats placebo in 6/14 cells.',
    use: 'Treat OI walls as ordinary levels; the wall-touch read describes a detector artefact plus short-horizon mean reversion.',
  },
  {
    id: 'forecast-record-pit', domain: 'volatility', verdict: 'context', date: '2026-10-06', doc: 'forge/FORECAST_RECORD_PREREG.md',
    claim: 'The v3 export forecast, rebuilt point-in-time (walk-forward specs, 34 instruments, 52,486 out-of-sample sessions 2020-08 to 2026-08), is calibrated and beats climatology',
    result: 'All 12 rungs calibrated pooled (e.g. HL p75 24.7% [23.3, 26.1]); pinball skill over a 250-session climatology 4.9% [3.7, 6.2]; today’s settings applied backwards flatter it by only 0.5%. Flaw: regime. Busy days (sigma > 1.15x its median) too wide, HL p75 19.9%; quiet days (< 0.85x) too narrow, HL p75 30.6%. Skill in normal regimes only 1.3%.',
    use: 'Trust the lines on average. Lean on them less after a vol spike (they run wide) and more cautiously after calm (they run tight); the fix belongs in sigma persistence (Lesson 03 §02).',
  },
  {
    id: 'jump-structure', domain: 'volatility', verdict: 'context', date: '2026-10-06', doc: 'forge/JUMPS_PREREG.md',
    claim: 'How much of the daily move is jump, whether jumps are scheduled, and whether the forecast tail breaks on jump days',
    result: 'Jumps (RV minus bipower) are 6.6% [6.3, 6.9] of intraday variance. With the day-level BNS jump test (1%; the registered largest-bar rule over-flagged 96 days/yr, Amendments 1-2) about 32 jump days a year (~12% of days); only 25% [20, 29] are scheduled releases (majors 33%). HL p90 is passed 17.1% on jump days vs 8.7% otherwise; indices too, mostly upside (OH p90 19.1% vs 10.2%). Single-step loss: one 5-min bar crosses a 0.5-sigma stop on 11% of sessions; Monday open gaps beyond 0.5 sigma 9% vs 1.4% Tue-Fri.',
    use: 'Most jumps cannot be known in advance, so they belong in stop placement and sizing, not the lines. Stops inside 0.5 sigma get jumped often; treat Monday opens as gap risk.',
  },
  {
    id: 'jump-p90-event-term', domain: 'volatility', verdict: 'null', date: '2026-10-06', doc: 'forge/JUMPS_PREREG.md',
    claim: 'A p90-only event multiplier per release tag (Merton: jumps fatten the tail more than the middle), fitted walk-forward, improves the forecast tail on event days',
    result: 'FAIL. Event-day HL p90 pinball got worse by 0.8% [0.2, 1.4]; all days +0.5% [0.2, 0.9]. Event-day p90 was already 10.0% under the equal-scaling event multiplier.',
    use: 'Keep the equal-scaling event multiplier; scheduled tails are already priced.',
  },
  {
    id: 'meta-label-trust-lines', domain: 'volatility', verdict: 'null', date: '2026-10-06', doc: 'forge/META_LABEL_PREREG.md',
    claim: 'A meta-label using only what is known at the London open predicts when the forecast p75 lines will be passed (range, high side, low side), well calibrated, walk-forward 2021-2026',
    result: 'Registered rule (skill above 0 AND every decile within 3pp) met only for the low side (logistic, skill 1.6% [1.0, 2.3]). Range: real skill 4.8% [3.2, 6.6] and strong ranking (bottom decile 12% passed vs top 46%, base 24%) but over-confident at the low end (predicted 7%, happened 12%), so FAIL. Drivers: weekday (Monday HL p75 passed 20.6%, Thursday 27.7%), release day, implied vol above sigma, recent misses (persistence).',
    use: 'Mornings carry real information about whether the lines will hold, but as a separate trust score it is not yet calibrated. The same drivers (weekday, implied vol, persistence) are better fixed inside the forecast itself.',
  },
  {
    id: 'forecast-persistence-fix', domain: 'volatility', verdict: 'validated', date: '2026-10-06', doc: 'forge/FORECAST_FIX_PREREG.md',
    instruments: ['AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDNZD', 'AUDUSD', 'CADCHF', 'CADJPY', 'CHFJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPJPY', 'GBPNZD', 'GBPUSD', 'NZDCAD', 'NZDJPY', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'],
    claim: 'Nudging the export sigma each morning by regime (sigma vs its usual level), yesterday and last-5-day range misses, and weekday (+ implied vol where it exists) beats the export with refit widths, walk-forward 2020-2026',
    result: 'PASS both arms. Without IV: pinball 0.976 [0.970, 0.981] of the control, better in every class and every fold; calm-vs-busy HL p75 miss cut from 5.6pp to 1.8pp (quiet 30.3% to 24.7%, busy 19.4% to 24.9%). With IV (13 instruments): 0.960 [0.951, 0.968]. Monday/Thursday weekday skew removed (slight overshoot to Mon 26%, Tue 22%).',
    use: 'Candidate shadow forecast (persistence-adjusted). The export over-reacts to recent vol; this pulls sigma back toward its usual level and corrects weekday. Lines from it are the better base for the decision layers.',
  },
  {
    id: 'meta-label-trust-lines-persist', domain: 'volatility', verdict: 'null', date: '2026-10-06', doc: 'forge/META_LABEL_PREREG.md',
    claim: 'After the persistence fix, morning information still predicts when the (persistence-adjusted) p75 lines will be passed',
    result: 'No: range skill 0.3% [-0.9, 1.4], high side -0.3%, low side 0.0%, all FAIL (Amendment 2 re-run, walk-forward 2021-2026). The forecast fix absorbed what 3a found. Only leftover: implied vol (top decile 33% passed vs 23% base), which the IV arm of the fix covers.',
    use: 'Do not build a separate morning trust score: fix the forecast instead (done for persistence/weekday; IV arm next). The meta-label belongs at the line touch (3b).',
  },
  {
    id: 'forecast-pick', domain: 'volatility', verdict: 'validated', date: '2026-10-06', doc: 'forge/FORECAST_PICK_PREREG.md',
    instruments: ['AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDNZD', 'AUDUSD', 'CADCHF', 'CADJPY', 'CHFJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPJPY', 'GBPNZD', 'GBPUSD', 'NZDCAD', 'NZDJPY', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'],
    claim: 'Head-to-head of every daily forecast on one yardstick (walk-forward 2020-2026, widths refit for all): which one set of lines to keep',
    result: 'All 34: persistence 0.980 [0.974, 0.985] of plain, HAR-800 0.984, both fix the calm/busy flaw (plain 6.8pp miss). IV-13: persistence + IV 0.968 [0.961, 0.975], IV-adjusted 0.976, persistence 0.980, HAR-800 0.984. Pick by the fixed rule: persistence + IV where implied vol exists, persistence elsewhere.',
    use: 'The one set of daily lines for the Daily Plan. Other line exports go to an archive menu. Forward scorecard = its second, independent test.',
  },
  {
    id: 'meta-label-yield-spread', domain: 'volatility', verdict: 'null', date: '2026-10-06', doc: 'forge/META_LABEL_YS_PREREG.md',
    claim: 'The volatility system state at entry (regime, recent range vs forecast, today range, recent jumps, plus the primary z) tells when the yield-spread book is right, so meta-sizing beats flat (Lesson 03 meta-labelling)',
    result: 'FAIL, wrong way round. 221 walk-forward test trades 2019-2026: per-trade Sharpe 0.100 meta vs 0.165 flat, difference -0.065 [-0.117, +0.006]. Top predicted tercile won 52.8% (mean +0.02%) vs bottom 62.2% (+0.38%). The model learned high-vol entries win; the test years said the opposite. 2020 flat -31.7%, meta -49.3%.',
    use: 'Keep the yield-spread book flat or vol-targeted; the volatility state does not say when it is right. Small sample (power for large effects only): not shown, not proven absent.',
  },
  {
    id: 'meta-label-proper', domain: 'volatility', verdict: 'null', date: '2026-10-07', doc: 'forge/META_LABEL_PROPER_PREREG.md',
    claim: 'Meta-labelling built properly (AFML: high-recall yield-spread primary at CUSUM events, triple-barrier labels from sigma, uniqueness weights, purged walk-forward, probability bet sizing) finds when the primary is right, and the volatility system adds to it',
    result: 'No. 3,144 test bets 2019-2026 (~395 effective). Forest: precision 50.3% vs primary 51.6%, Sharpe 0.022 vs 0.025. Logistic: 52.6% vs 51.6% [-1.7, +3.6pp], Sharpe +0.002 [-0.05, +0.05]. Both FAILED the sanity check (did not recover the known |z| >= 2 effect, 58.6% vs ~50%), so uninformative; volatility features added nothing in either (ablation -0.021 / +0.000). Deflated Sharpe 0.22.',
    use: 'Meta-labelling closed (stopping rule). Effective sample, not method, is the limit. Keep the yield-spread book flat / vol-targeted; its traded |z| >= 2 rule already captures what a meta-model would learn.',
  },
  {
    id: 'ys-long-confirm', domain: 'macro', verdict: 'validated', date: '2026-10-07', doc: 'forge/YS_LONG_CONFIRM_PREREG.md',
    instruments: ['USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'EURUSD'],
    claim: 'The yield-spread book (validated on 2015+) holds on 40 untouched years 1976-2014 rebuilt from free FRED data, configuration unchanged: an independent second test (Lesson 02)',
    result: 'PASS. 868 trades: +0.243% net per trade [+0.005, +0.464], win 55.1%, PF 1.28; positive in 4/4 decades (+0.34, +0.35, +0.22, +0.10%) and 6/6 pairs. Daily flat-book Sharpe 0.39, well below the 2015+ figures (0.8-1.1): real but modest. FRED rebuild of 2015-2026 +0.30% (PF 1.42), consistent.',
    use: 'The book has a real, modest edge across five decades, so plan around a Sharpe nearer 0.4 than 1. The long history (1976+) is now the data source for anything that needs more independent yield-spread decisions.',
  },
  {
    id: 'ys-long-breadth', domain: 'macro', verdict: 'null', date: '2026-10-07', doc: 'forge/YS_LONG_CONFIRM_PREREG.md',
    claim: 'The same yield-spread rule works on three never-tested pairs (NZDUSD, USDNOK, USDSEK), 1976/79/82-2026',
    result: 'FAIL by the registered rule, same sign: 638 trades +0.229% per trade [-0.050, +0.492], win 54.5%; each pair about +0.23% (PF 1.23-1.26) but no single interval excludes 0. Daily Sharpe 0.28.',
    use: 'Consistent with the main book but not confirmed on its own; do not add these pairs to the live book on this evidence.',
  },
  {
    id: 'meta-label-long', domain: 'volatility', verdict: 'null', date: '2026-10-07', doc: 'forge/META_LABEL_LONG_PREREG.md',
    claim: 'With ~2x the independent sample (FRED 1976+, tested on the modern era 2006-2026 only), meta-labelling finds when the yield-spread book is right, and the volatility state adds to it',
    result: 'No, and this time the test could tell (sanity check PASSED: top tercile |z| 1.87 vs 1.69). 8,142 modern-era bets (~754 effective): precision 51.0% meta vs 51.0% primary [-2.0, +2.1pp]; Sharpe gain -0.013 [-0.066, +0.036]; volatility features +0.000 [-0.019, +0.022]. Era gate: training from 1976 did WORSE on the modern era than training from 1996 (-0.023 vs -0.012), so the old data was dropped: the owner was right that 50-year-old behaviour does not teach the modern market here.',
    use: 'Meta-labelling closed for good on this book: the volatility state does not say when the yield-spread book is right, with enough data to see it if it did. Trade the book by its own rule (|z| >= 2), flat or vol-targeted. Use 1976+ data for confirming the primary, not for training models on today.',
  },
  {
    id: 'card-checks-01-09-11', domain: 'execution', verdict: 'context', date: '2026-10-07', doc: 'forge/CARD_CHECKS_PREREG.md',
    claim: 'Lesson 01 cards on the built system: one-day delay (01), stress windows (09), measured spreads vs stops (11)',
    result: 'Card 01 PASS both: chosen forecast 0.9802 vs 0.9800 with every input a session late; yield book +0.204% vs +0.243%/trade with rates a day late. Card 09: chosen forecast beat plain in all 4 measurable crises (0.88-0.99; COVID predates the walk-forward lines), but both run tight (HL p75 passed 25-35%); stop rule FAILS the stress bar: one 5-min bar crosses the min stop on ~10% of crisis days vs 4.2% normal. Card 11: majors + gold cost 2-7% of the min stop; 6 crosses over 10% (EURNZD 19%, GBPAUD 12%, EURGBP 12%, AUDCAD 11%, GBPCAD 10%, EURAUD 10%); at rollover spreads are 50-100% of the stop.',
    use: 'Timing-robust (no exact-alignment dependence). In a crisis week, widen stops (about double the jump-through rate). Prefer majors/gold; treat the 6 flagged crosses as cost-heavy; never place tight stops across the 21-22 UTC rollover. Daily Plan now adds the measured spread to planned loss.',
  },
  {
    id: 'dip-with-bias', domain: 'price', verdict: 'null', date: '2026-10-07', doc: 'forge/DIP_WITH_BIAS_PREREG.md',
    claim: 'Buying the ~0.8 sigma dip below the London open (the shape of 4 posted C.OG trades: fills 0.67-0.88 sigma below open, between the export p50 and p75) is an edge when only taken in a trusted direction (the yield-spread book)',
    result: 'FAIL. Six yield pairs, M1, 2016-2026, target 0.4 sigma / stop 0.6 sigma, after costs: with the bias -0.048R [-0.088, -0.004] (1,574 trades, 55.6% wins vs 60% needed); against -0.090R; no filter -0.073R. Direction ordering is consistent (with > none > against, also in the 13-16 UK window: -0.044 / -0.062 / -0.115) but the gain over no filter, +0.025R [-0.012, +0.064], is too small to beat the geometry and cost.',
    use: 'The yield-spread direction tilts dip-buys the right way but not enough to make a 0.8 sigma dip-buy with this target/stop pay. Whatever C.OG uses for direction, it is not this book; his posted trades are 6 winners, the shape not the rule.',
  },
  {
    id: 'cog-setups-direction', domain: 'price', verdict: 'null', date: '2026-10-07', doc: 'forge/COG_SETUPS_PREREG.md',
    claim: "C.OG's two setups, confirmed against his own published lines (EURUSD fills on his median O-C line; gold entries on the London-midnight open with a ~0.1 sigma stop), are an edge on their own or when taken in a trend / prior-day direction",
    result: "NOTHING PASSES (10 tests, Holm). EURUSD/GOLD/NQ, M1, 2016-2026, his formula on a rebuilt sigma, after costs. A (fade at his median, stop his 75th, target halfway back): -0.066R [-0.085, -0.047], 47.7% targets vs 57.5% needed; best direction = with the 20-day trend -0.047R, better than against (-0.085R) on all 3 instruments and both halves but +0.019R [-0.002, +0.039] over no filter. B (retest of the London open in the breakaway direction, stop 0.1 sigma, target his 75th): -0.201R, 3.8% targets, 86.7% stops; mirror worse (-0.355R); no direction rule helps (best +0.032R over none, interval spans 0). Mechanics audited: only 6-10% of B stops land on the fill bar; ignoring the stop, the breakaway reaches his 75th only 10-19% of retest days. His sigma is not exactly rebuildable (corr 0.5 FX/gold, 0.1 NQ vs his published vol); on his exact lines (2026, ~40 days each) the same picture (A -0.171R).",
    use: 'His entry LOCATIONS are real (the fills sit on his lines) but location plus a mechanical direction does not pay. Direction lesson: if fading a line, fade WITH the 20-day trend (buy dips in uptrends), never against; it is the only consistent tilt, still too small alone. A return to the London open is a coin flip, not a springboard. His posted winners need something we cannot see (discretion, macro gates, or selective posting).',
  },
  {
    id: 'cog-spread-direction', domain: 'macro', verdict: 'null', date: '2026-10-07', doc: 'forge/COG_SPREAD_DIRECTION_PREREG.md',
    claim: "A daily US rate spread (fed funds, 2y-minus-fed-funds, bills-minus-fed-funds, 2s10s, 10y-3m, real yields, breakevens, Baa credit, Baa-Aaa quality, or the yield-spread book's USD stance on OTHER pairs) tells which way to trade at C.OG's median line (fade or continue)",
    result: 'FAIL. EURUSD/GOLD/NQ 2016-2026, 192 choices per instrument (12 spreads x 4 reads x sign x fade/continue), picked on past years, scored next year 2019-2026: OOS -0.033R [-0.078, +0.015], exactly the no-filter -0.033R (difference -0.000 [-0.036, +0.035]); 500 time-shifted placebo runs median -0.041R, real beats 63% (95% needed). Picks unstable for EURUSD/GOLD; NQ kept picking credit (continue in the direction credit spreads are tightening) 2021-2026 but scored about flat OOS (-0.004R). In-sample best-of-192 looked like +0.01 to +0.06R; walk-forward erased it.',
    use: 'No daily US rate spread, read at a one-day conservative lag, gives direction at his lines; the in-sample winners are selection noise. Do not wire any spread as a line-direction filter. Untested leads: non-US daily rates (not on FRED daily), intraday rate moves (same-bar only so far), rate SURPRISES on release days rather than daily drift.',
  },
  {
    id: 'rates-residual-catchup', domain: 'macro', verdict: 'null', date: '2026-10-08', doc: 'forge/RATES_RESIDUAL_PREREG.md',
    claim: "C.OG's residual idea (stream 2026-10-05): when price is out of line with its rates-implied path (rolling beta on US 2y/10y CFDs, plus the Bund/Gilt for EUR/GBP), price catches up over the next 4 hours; and that gap gives the direction at his lines",
    result: 'S1 FAIL, well powered: catch-up coefficient b -0.001 [-0.058, +0.060] pooled over EURUSD/GBPUSD/USDJPY/gold/NAS100/SPX500, M15 2018-2026 (17,912 non-overlapping 4h samples; split 3 up / 3 down); gap trade +0.19bp/trade, hit 49.2%. S2 FAIL (PCA residual vs 14 other ~23h markets, Amendment 1 after a first run starved to n 2,790 by Gilt hours had shown +0.35): b -0.056 [-0.211, +0.100], n 13,512, negative on all 6 targets. S3 FAIL: at his median line, keeping trades where price is behind rates in the trade direction -0.058R vs all -0.050R (difference -0.009 [-0.045, +0.026]). On his 6 trade days + 2 stream days the bond-CFD gap does not reproduce what his SOFR/ESTR line showed (on 2 and 5 Oct it said NQ was AHEAD of rates).',
    use: 'Bond CFDs (2y/10y) carry no lead over FX, gold or indices, even as a residual gap; the link is same-bar only (now shown four ways). The short-rate futures were pulled on 2026-10-08 and the same harness rerun on them: see stir-residual-catchup, stir-curve-map and stir-wide-scan.',
  },
  {
    id: 'stir-residual-catchup', domain: 'macro', verdict: 'null', date: '2026-10-08', doc: 'forge/STIR_RESIDUAL_PREREG.md',
    claim: "With the instrument on C.OG's screen (SOFR futures SR3Z6/SR3H7, Euribor IZ6, IBKR 15-min, Apr-Oct 2026) instead of bond CFDs: price catches up with the rates-implied move within 1 h (R1), rates move first (R2), and the previous day's rate-differential path draws the next day's NAS100 afternoon (R3)",
    result: 'R1 FAIL on its placebo rule only: catch-up b +0.186 [+0.037, +0.342] over 1 h, positive on all 5 targets (NAS100, SPX500, EURUSD, USDJPY, gold) and both halves (bond CFDs gave -0.001), but real b beats only 68.5% of day-shifted placebo runs (95% needed; that placebo is wide because shifted drivers make the implied move near zero). 4 h: b +0.169 [-0.182, +0.480], gap trade -9.5bp. R2: no lead either way at 15 min (NAS100 vs SR3H7 next bar +0.019 [-0.006, +0.046]; same bar +0.23). R3 passed its registered bar narrowly (mean corr +0.074 vs placebo 95th +0.068, 126 day pairs) but a post-hoc check shows it is the afternoon DIRECTION (agrees 56%), not the turn times: detrended -0.021.',
    use: 'Short-rate futures carry more than bond CFDs (the 1 h catch-up leans positive everywhere) but nothing clears its bar on 6 months; next test needs a longer history and a scale-free placebo. Turn-time matching across days (his Friday/Monday charts) does not hold. Not a signal.',
    instruments: ['NQ', 'SPX500', 'EURUSD', 'USDJPY', 'GOLD'],
  },
  {
    id: 'stir-curve-map', domain: 'macro', verdict: 'context', date: '2026-10-08', doc: 'analysis/output/stir_maturity_map/RESULTS.md',
    claim: 'Which part of the short-rate curve moves markets, by how much per bp, and whether markets keep going after a sharp 15-min rate move (SOFR and Euribor futures by months to expiry; expired contracts 2025-01..2026-03 vs live Apr-Oct 2026)',
    result: 'SOFR 6-12 months to expiry explains the most of 8 markets\' 15-min moves in BOTH periods (R2 ~20-22% in 2025, 22-25% in 2026); the front 0-3 months almost none (2-4%); the US-minus-euro differential 1-3%. Per +1 bp higher US rates, same 15 min (2026): NAS100 -0.04 to -0.05%, SPX -0.03 to -0.04%, EURUSD -0.02 to -0.03%, USDJPY +0.02 to +0.03%, gold about -0.10%. After a sharp move (top 5%, ~1-1.5 bp) markets follow the expected way 44-55% at 15 min / 1 h / 4 h in both periods: no follow-through. Stocks FLIPPED sign: 2025 +0.06 to +0.08% per bp (rates up with growth), 2026 negative.',
    use: 'Same-bar explanation, not a forecast: a 2027 repricing is priced into FX/indices within the same 15 min. Any rule mapping rates to NASDAQ must measure the current sign (e.g. last 20 days) first; a fixed "rates down = buy NQ" rule was wrong all of 2025. Watch the 6-12 month SOFR contracts, not the front.',
    instruments: ['NQ', 'SPX500', 'DE30', 'EURUSD', 'GBPUSD', 'USDJPY', 'GOLD'],
  },
  {
    id: 'stir-wide-scan', domain: 'macro', verdict: 'null', date: '2026-10-08', doc: 'forge/STIR_WIDE_SCAN_PROTOCOL.md',
    claim: 'Searching 48,600 ways short-rate futures could lead 18 markets (12 rate series incl. differentials and Fed-path slopes x 9 features x 5 horizons x 5 sessions), found on Apr-Jul 2026 and checked on Aug-Oct 2026',
    result: 'No single test beats the scrambled-rates family-wise bar (best |t| 3.35 vs 4.45). Broad discovery-holdout agreement rho +0.018 (scrambled 95th +0.069). But 25 of the top 30 kept their sign in the holdout vs scrambled median 14 (1 of 30 scrambles reached it): a borderline LEAD. The top results cluster on the Fed-path slope (SR3M7 minus SR3Z6, how many 2027 cuts are priced) leading EURUSD / DAX / silver / AUD by 15 min - 2 h, mostly London morning and Asia.',
    use: 'CLOSED 2026-10-08 (forge/FED_PATH_LEAD_PREREG.md): the cluster tested once on untouched Oct 2025 - Apr 2026 data, Fed-path slope 30-min change vs a EURUSD/AUD/silver/DAX basket next 30 min, Asia + London morning: t +1.43 (needed 2.0), same sign but smaller than discovery (+2.84), EURUSD alone -0.54; gross +0.005% per trade, below one spread. Too small to trade at 15 min. Nothing to wire.',
  },
  {
    id: 'rate-diff-nq-leadlag', domain: 'macro', verdict: 'null', date: '2026-10-09', doc: 'analysis/output/rate_diff_nq/REPORT.md',
    claim: 'The US-EU short-rate differential (SOFR minus Euribor / ESTR futures, incl. C.OG\'s SR3U6 - ER3U6 pair) leads or lags Nasdaq at some timeframe (1m to daily), in some regime',
    result: 'Coincident only. Explore Oct 2025-Mar 2026, confirm Apr-Oct 2026 (15-min TRADES and MIDPOINT), 1-min MIDPOINT Apr-Oct: every rates-first candidate failed confirmation and several reversed sign (SR3Z6 one bar ahead +0.028 -> -0.018; rates up today -> Nasdaq down tomorrow -0.32 -> +0.13; C.OG pair Granger rate->Nasdaq p 0.028 -> 0.92). Nasdaq -> rates Granger p ~0.000 at 1-5 min in both halves but ~0.5 bp per 1% Nasdaq move, a fraction of a tick, gone by 15 min (large-tick quote adjustment). Same-bar link of each leg strong (-0.11 to -0.35, higher rates <-> lower Nasdaq); the DIFFERENTIAL\'s link flips with which leg moves markets: +0.18 (15m) Oct-Mar, +0.06 Apr-Oct.',
    use: 'Do not read a rate-differential overlay as a leading indicator for Nasdaq: they move in the same minutes. For Nasdaq the rate LEVEL (either leg) is the steadier co-mover; the US-EU gap belongs with EURUSD. Full grid 2026-10-09 (analysis/output/rate_diff_nq/full/RESULTS.md) with a SMOOTH spread (2y yields from CBOT ZT and Eurex Schatz futures): 0 of 600 non-zero-lag cells (5 series x 1-60 min x lags -12..+12) survive FDR, none replicates; distributed-lag models improve out-of-sample forecasts in under a third of cases (median R2 change negative); the 2y US-DE spread has ~0 same-bar link (legs -0.13 to -0.36 each, they cancel); the rolling-beta gap is closed by neither side. Diagnostic review (DIAGNOSTIC_REVIEW.md): alignment/DST/measures correct, 29 years daily nothing, vol/range/direction nothing; the one 15-min candidate (DE 2y lead, -0.038) failed once on new Sep 2025-Mar 2026 data (full window -0.008 [-0.035, +0.020]) -> closed (forge/DE2Y_NQ_15M_LEAD_PREREG.md). Untested: seconds-level leads (tick data) and large-surprise-only effects (calendar file ends 2026-07-02).',
    instruments: ['NQ', 'SPX500'],
  },
  {
    id: 'stir-composite-nq', domain: 'macro', verdict: 'null', date: '2026-10-10', doc: 'forge/STIR_COMPOSITE_NQ_PREREG.md',
    claim: 'C.OG video "Macro Variable Context Relevance" (16-23 Sep 2026): a composite US-EU short-rate spread (SOFR vs ESTR) leads Nasdaq by HOURS in two ways the 1-60 min grid never tested: (A) the spread drifts while Nasdaq sits flat, then Nasdaq catches up; (B) a low/high in the spread, confirmed 45 min later, is followed by Nasdaq turning the same way within 1-2 h',
    result: 'Both FAIL in explore (Apr-Jul 2026), nothing reaches confirm. Five constructions from the IBKR 1-min strip (his literal SR3U6-ER3U6 pair, 4-contract strip mean, PCA level, PCA slope, US-DE 2y): A = 0 of 45 cells pass FDR, largest |corr| 0.065 - but planted signals of 0.03/0.05/0.08 were all undetectable (detection starts near 0.20), so A is INSUFFICIENT DATA, not a refutation. B = 0 of 20 (planted +0.05%/event detected 10/10, so this null is real): mean signed Nasdaq move after a confirmed spread turn -0.03% to +0.03%, confirm (video week removed) +0.00 to +0.03%, scramble p 0.09-0.61; Nasdaq prints a fresh same-side extreme within 2 h after the spread turns 42% of the time vs 41% after random bars at the same hour. His video week itself rebuilds (Fri: spread lows 15:15 UTC, Nasdaq low 16:00; Mon: spreads +1 to +5 bp through Nasdaq\'s flat spell, from the EURO leg falling), but his line\'s scale (7.7-8.5) and a Tuesday-midday jump match no construction.',
    use: 'A confirmed turn in any US-EU short-rate composite is not a Nasdaq entry. Hours-scale divergence effects below corr ~0.2 cannot be seen on 6 months of 1-min data; reopen only with ~a year more (Apr 2027), not more cells. Flagged, unregistered: his literal pair shows +0.03 to +0.09 catch-up correlations in ALL nine confirm cells and none in explore - needs its own prereg on 2027 data. The composites stay as context (ratesRegime read), like the single legs.',
    instruments: ['NQ'],
  },
  {
    id: 'rate-diff-xsmom', domain: 'macro', verdict: 'null', date: '2026-10-08', doc: 'forge/RATE_XSMOM_PREREG.md',
    claim: "C.OG's suggestion: cross-sectional momentum in short-term rate differentials (rank 9 currencies vs USD by the 3-month change in their 3-month-rate gap, long top third / short bottom third), and NASDAQ only while US short rates fall",
    result: 'FX FAIL: +0.95% a year, Sharpe 0.13, 1976-2026 (1976-2014 +0.081%/month [-0.110, +0.276]; 2015-2026 +0.073%); alpha over carry and FX momentum t +0.81; look-backs 1/6/12 no better in both periods. Same code ranking by rate LEVEL (carry) earns +5.0%/yr, Sharpe 0.54, 1976-2014 (interval above 0), so the construction works. NASDAQ rule FAIL: Sharpe 0.24 vs buy-and-hold 0.35, worse in both periods (in the market 46%); US-minus-others version worse (-0.25 [-0.46, -0.04]).',
    use: 'On monthly FRED rates (45-day lag) the momentum in rate gaps adds nothing beyond carry; NASDAQ rate-timing loses to holding. Untested: the same on DAILY market-priced rates (short-rate futures per currency), which is how C.OG means it. Carry itself is the part that pays.',
    instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'NZDUSD', 'NQ'],
  },
  {
    id: 'policy-direction-at-lines', domain: 'macro', verdict: 'null', date: '2026-10-08', doc: 'forge/POLICY_DIRECTION_PREREG.md',
    claim: 'The slow, literature-backed rate directions give the direction at his lines: the post-FOMC dollar drift (sessions D+1..D+5, dollar up) and the 63-day change in US-minus-German 2y (Ang & Chen sign); and the 2y momentum pays as a multi-day EURUSD hold',
    result: 'S4 FAIL: dollar-up side +0.002R [-0.066, +0.066] (78 events, event-resampled), against -0.104R, with minus against +0.105 [-0.030, +0.240]; continuation trades on EURUSD with the drift +0.109R. S5a FAIL: with the 2y momentum -0.030R vs all EURUSD line trades +0.029 [-0.005, +0.063] better. S5b FAIL: EURUSD 5-day hold 2000-2026 +1.0bp [-5, +8], hit 49.7%, Sharpe 0.06; 20-day the same.',
    use: 'Both tilt the right way (with > against) and neither is big enough alone. The 2y-momentum FX effect from the literature does not show on EURUSD 2000-2026 at a 5-20 day hold. Keep them only as vote components.',
  },
  {
    id: 'direction-vote-at-lines', domain: 'price', verdict: 'context', date: '2026-10-08', doc: 'forge/DIRECTION_VOTE_PREREG.md',
    claim: 'Stacking the weak direction tilts (20-day trend, yield book, US-DE 2y momentum, post-FOMC drift, rates gap) into a vote separates line trades: take only trades with 2+ net agreeing',
    result: 'S6 FAIL on the bar: v>=2 -0.019R [-0.073, +0.034], minus all +0.031 [-0.021, +0.082]. But the ladder is MONOTONE: v>=2 -0.019, v=1 -0.039, v=0 -0.044, v=-1 -0.065, v<=-2 -0.082 (2018+, with gap); without the gap 2016+: -0.013, -0.017, -0.064, -0.076, -0.100. S7a FAIL: the same vote does not predict the London session direction (+0.004 sigma, hit 49.0%, 1,534 days). S7b FAIL: entering at the median line in the vote direction, stop 0.6 sigma, out 22:00: +0.022R [-0.040, +0.088] (gold +0.106R, EURUSD +0.010R).',
    use: 'The components carry real ranking information AT the line (agreement adds) but not about the day, and no geometry tried makes it pay. Context, not a signal: if a line trade is taken, prefer the side most components agree with; never the side they oppose (the v<=-2 rung is the worst trade on the board).',
  },
];

// The Theory Lab is the shareable zone; the ledger is written for the desk. Strip what
// only makes sense (or should only be seen) inside it: internal system names, repo file
// paths and commit hashes. Used by server.js's /theory-lab/desk-verdicts.json; js/lessonEvidence.test.mjs checks
// every lesson-cited entry comes out clean.
export function lessonSafe(text) {
  return String(text)
    .replace(/\s+in\s+(?:\S+\s)?\S*\/\S+\.(?:csv|json|parquet)\b/g, '')
    .replace(/\s*\((?:[\w./-]+\/)?[\w.-]+\.(?:js|mjs|py|md|csv|json)\b[^)]*\)/g, '')
    .replace(/\b(?:[\w-]+\/)*[\w.-]+\.(?:js|mjs|py|md|csv|json)\b/g, 'an internal tool')
    .replace(/\s*\((?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\)/g, '')
    .replace(/\s+in (?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g, '')
    .replace(/\bQMR's\b/g, "one mean-reversion system's").replace(/\bQMR\b/g, 'a mean-reversion system')
    .replace(/\b[Tt]he vote atlas\b/g, 'A voting system').replace(/\bvote atlas\b/gi, 'voting system')
    .replace(/\bFib Atlas\b/g, 'A Fibonacci-level system')
    .replace(/\b[Tt]he backtestSystem bot\b/g, 'A backtest system').replace(/\bbacktestSystem( bot)?\b/g, 'a backtest system')
    .replace(/\blevelExpectation\b/g, 'the level-expectation logic')
    .replace(/\bicEdge\b/g, 'IC edge').replace(/\bpoolConsistency\b/g, 'pool consistency')
    .replace(/\bdDR\b/g, 'range-ratio change')
    .replace(/\b[Tt]he vol CLI\b/g, 'A volatility tool').replace(/\bvol CLI\b/g, 'volatility tool');
}

/** The entries relevant to one instrument (validated ones with that instrument listed), plus every null. */
/**
 * The same instrument under two names. The board calls gold GOLD; one entry scopes itself
 * to XAUUSD, so that finding was invisible on the only page where it applies. Aliases
 * rather than a rewrite of the entries, because both spellings are correct and which one
 * a study used is part of its record.
 */
const INSTRUMENT_ALIAS = { GOLD: ['XAUUSD'], XAUUSD: ['GOLD'], NQ: ['NAS100'], NAS100: ['NQ'], SPX500: ['SPX', 'ES'] };

export function evidenceFor(instrument) {
  const names = new Set([instrument, ...(INSTRUMENT_ALIAS[instrument] ?? [])]);
  return DESK_EVIDENCE.filter(e => !e.instruments || e.instruments.some(i => names.has(i)));
}

/** Compact text block for an AI prompt. */
// ─────────────────────────────────────────────────────────────────────────────
// HOW STRONG IS AN ENTRY, AND HOW MAY IT BE QUOTED
//
// WHY THIS EXISTS. On 2026-10-02 I quoted `oi-max-pain` as settled all session --
// to justify rewriting live code and to tell the owner a live bot's modes were
// dead. Its entire result text is "Tested properly for the first time 2026-09-10:
// null.": no sample size, no interval, and a `doc` pointing at a memory note
// rather than a study. The ledger's `null` covers BOTH that and `news-asymmetry`
// (656 releases, "Null, and well powered"), and nothing in the data told them
// apart. The verdict word was doing work the evidence could not support.
//
// Prose could not fix this. The owner's objection was exact: every session answers
// with conviction, and CLAUDE.md gets skimmed. So the fix is not a rule asking
// anyone to hedge -- it is that THE CONFIDENT PHRASING IS NOT AVAILABLE. Callers
// do not compose their own wording; they call `citable()` and get a tag that
// already carries the hedge when the evidence is absent.
//
// POWER is opt-IN and deliberately not inferred. An entry is quoted confidently
// only when someone has READ the study and recorded its n here. Nothing is parsed
// out of the result prose -- guessing a sample size with a regex is the exact
// mistake that produced this note (a scan read "5 sessions" and "5 days" as n=5
// on studies of 84 meetings and 485 trades).
//
// An id missing from this map is not a failing entry. It means "nobody has
// recorded the power yet", and it reads as "single test, power not recorded"
// until someone does. That default is the safe direction.
const POWER = {
  // Verified by reading the entry on 2026-10-03.
  'gex-range':               { n: '793 NQ days',               note: 'p 0.0008, +0.315 vol-matched, 4/4 specs, 6/6 years, event-day confound closed' },
  'news-asymmetry':          { n: '656 releases 2016-26',      note: 'the entry states "Null, and well powered"' },
  'breadth-narrowing':       { n: '35 de-clustered events',    note: '267 controls, 23 years, and the range near-miss dies on its mirror' },
  'crowded-bond-short-fomc': { n: '84 meetings 2010->',        note: 'CFTC positioning, CI on the consensus-decision cell' },
  'daily-band-fade':         { n: '485 trades',                note: '25 FX pairs + gold, 2016-2026, costs on, OOS from 2022-06, shuffled-return null' },
  'curve-inversion':         { n: '10 episodes',               note: '12,581 daily obs collapsed to episodes; leave-one-out passed, the MIRROR killed it' },
  'priced-in':               { n: '85 FOMC decision days',     note: 'terciles of prior 20-session |d2Y|, four instruments' },
  'rotation-extreme':        { n: '140 extremes',              note: 'forward 20-session range with CIs' },
  'cb-tone-direction':       { n: '82 meetings',               note: 'first-30-min reaction vs next-day; priced inside 30 minutes (t 2.04)' },
  'narrow-day-expansion':    { n: '~2,490 sessions x 8 instruments', note: 'matched days, every CI across zero' },
  'yield-move-fx-range':     { n: '260 de-clustered setups',   note: 'from 1,915 top-decile DGS10 days, 2010-2026, pre-registered POSITIVE' },
  'fear-gold':               { n: '58 VIX spikes 2010-2026',   note: 'excess +0.07% [-0.42, +0.30]' },
  'analogue-weeks':          { n: '400 weeks walk-forward',    note: 'beaten by the unconditional base rate' },
  'month-end-rebalance':     { n: '229 months 2007-2026',      note: 'quintiles with CIs' },
  'zone-engine':             { n: '83k trades (M30)',          note: 'negative in both halves; H4 a coin flip' },
  'funding-stress':          { n: '21 episodes (S2)',          note: 'S1 left 15 episodes and was declared UNTESTABLE against a pre-registered floor of 20' },
};

const TAG = { validated: 'VALIDATED', null: 'TESTED NULL', context: 'BASE RATE', underpowered: 'UNDERPOWERED' };

/**
 * How this entry may be spoken about.
 *
 *   tag     what goes in the prompt, hedge included when the power is unrecorded
 *   strong  true only when someone has read the study and recorded an n
 *   power   the recorded sample, or null
 *
 * Every prompt builder goes through this. A caller that writes its own tag is a
 * caller that can over-claim, which is the whole thing this prevents.
 */
export function citable(e) {
  const base = TAG[e?.verdict] ?? String(e?.verdict ?? '').toUpperCase();
  const pw = POWER[e?.id] ?? null;
  // A `doc` that is a memory note rather than a file is not a study on disk.
  const docIsStudy = typeof e?.doc === 'string' && !/^\s*memory[:\s]/i.test(e.doc);
  if (pw) return { tag: `${base}, n=${pw.n}`, strong: true, power: pw, docIsStudy };
  return {
    tag: `${base} — single test, power not recorded${docIsStudy ? '' : ', no study doc'}`,
    strong: false, power: null, docIsStudy,
  };
}

/** Ids with no recorded power — the backlog this map is meant to shrink. */
export function unrecordedPower(list = DESK_EVIDENCE) {
  return list.filter(e => !POWER[e.id]).map(e => e.id);
}

export function evidenceForPrompt(list = DESK_EVIDENCE) {
  return list.map(e => `- [${citable(e).tag}, ${e.date}] ${e.claim}. ${e.result} USE: ${e.use}`).join('\n');
}

/**
 * The same ledger, short enough to leave room for an answer.
 *
 * The full block is 70 entries and ~10,300 tokens — 78% of the end-of-day review's
 * prompt — and the first live run came back truncated at the token cap with no review
 * at all. Each entry's `result` is the bulk of that: the counts, the intervals, the
 * methodology. A model being told not to contradict a finding needs the CLAIM and the
 * USE; it does not need the bootstrap intervals in order to obey them.
 *
 * Every entry is KEPT and shortened, rather than some being dropped. A filtered ledger
 * that happens to omit the relevant null reads to the model as permission, which is the
 * one failure mode worse than a long prompt.
 */
export function evidenceBrief(list = DESK_EVIDENCE) {
  return list.map(e => `- [${citable(e).tag}] ${e.claim} -> ${e.use}`).join('\n');
}
