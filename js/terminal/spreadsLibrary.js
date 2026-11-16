// js/terminal/spreadsLibrary.js: the X-versus-Y library behind the Insight tab's "Spreads & ratios" board. Pure data.
//
// Every pair here is one an educator in the stored notes (Nicholas Crown's watch log and clip notes, Jessinskip, the C.OG course text, the Colez notes,
// the podcasts, the quant teachers) talks about as "X versus Y" or "X minus Y". Built from the daily market bundle (/api/drill-series) only:
// no vendor is added, and a pair whose legs the bundle does not carry is listed in NOT_HELD with the reason, never filled in.
//
// op: 'ratio' = x / y (the line is a relative-strength ratio); 'diff' = x minus y, both legs yields or spreads in percent, shown in basis points;
//     'level' = one series read as the ratio it already is (AUD/JPY is a risk-currency over a haven).
// ev: the Evidence Book entries that test this relationship, by id, with what each one actually examined. The verdict word is NEVER stored here:
//     the board reads it from js/deskEvidence.js, so a changed verdict changes the chip (spreadsLibrary.test.mjs checks every id exists).
// say: what the educators said, in their words. verbatim:true is a quote from the clip or course text; false is the desk's own note on it.
// mentions: lines mentioning this family in the stored educator notes (a rough popularity count, not a vote; the method is in plans/SPREADS_AND_RATIOS.md).
//
// Rules: a spread or ratio DESCRIBES state (where it sits in its own history, how stretched, how it moved with another market the same day). Nothing
// here is a signal; direction claims are only as strong as the Evidence Book's verdict on them, and most of those are null.

export const EDUCATORS = { crown: 'Nicholas Crown', jess: 'Jessinskip', cog: 'C.OG course text', pod: 'Podcast notes', colez: 'Colez notes', jordan: 'Jordan videos', quant: 'Quant Guild', friend: 'Friend (VIX ratio)' };

const q = (who, text, src, verbatim = true) => ({ who, text, src, verbatim });

export const PAIRS = [
  { id: 'rsp-spy', label: 'Equal-weight vs cap-weight S&P (RSP / SPY)', short: 'RSP / SPY', x: 'rsp', y: 'spy', op: 'ratio', group: 'Breadth and style',
    what: 'The S&P 500 with every company weighted equally, over the S&P 500 weighted by size. Falling means the biggest companies are doing more of the work (narrow breadth); rising means the average company is keeping up.',
    up: 'the average company is keeping up with the giants (broader)', down: 'the giants are doing more of the work (narrower)',
    say: [q('Nicholas Crown', '"the RSP spy ratio just broke its multi-year trend line... breadth is collapsing..."', 'Crown clip, undated, logged in the Evidence Book (breadth-tilt-semis)'),
      q('Nicholas Crown', '"Market breadth had become so extremely narrow that the equal-weighted S&P was getting crushed against the cap-weighted S&P..."', 'Crown clip, 2026-10-02 (MD files/CROWN_WATCH.md)'),
      q('Nicholas Crown', '"Become a relative value investor to see who\'s getting rewarded."', 'Crown clip, 2026-11-15, 0:44')],
    ev: [{ id: 'breadth-narrowing', about: 'RSP lagging SPY hard (the textbook rotation)' }, { id: 'breadth-tilt-semis', about: 'the ratio breaking its trend as a moment to tilt into semis' }],
    mentions: { n: 45, by: { Crown: 39, 'Quant Guild': 4, Podcasts: 1, 'C.OG course': 1 } } },
  { id: 'smh-spy', label: 'Semiconductors vs the index (SMH / SPY)', short: 'SMH / SPY', x: 'smh', y: 'spy', op: 'ratio', group: 'Breadth and style',
    what: 'The semiconductor ETF over the S&P 500 ETF: how much the AI and chip trade is leading the market. Rising means the chips are out-running the index.',
    up: 'chips are out-running the market', down: 'chips are lagging the market',
    say: [q('Nicholas Crown', '"you need the AI trade to crack for metals to continue to go up"', 'Crown clip, 2026-10-16 (Evidence Book: ai-crack-metals)'),
      q('Nicholas Crown', 'hyperscalers over semis "continues to the point no one can believe it"', 'Crown clip, 2026-10-16 (MD files/CROWN_WATCH.md)')],
    ev: [{ id: 'breadth-tilt-semis', about: 'semis versus the index after narrow breadth' }, { id: 'ai-crack-metals', about: 'a hard fall in semis and what gold does next' }, { id: 'bounce-confirmation', about: 'semis leading (SMH over RSP) during a Nasdaq bounce' }],
    mentions: { n: 34, by: { Crown: 34 } } },
  { id: 'nvda-smh', label: 'Nvidia vs the chip ETF (NVDA / SMH)', short: 'NVDA / SMH', x: 'nvda', y: 'smh', op: 'ratio', group: 'Breadth and style',
    what: 'Nvidia over the semiconductor ETF (the bundle carries SMH where the clip says SOXX): is the leader pulling away from its own industry. Rising means Nvidia is out-running the chips.',
    up: 'Nvidia is pulling away from the chip group', down: 'Nvidia is lagging the chip group',
    say: [q('Nicholas Crown', 'pairs to watch into the Fed: "RSP vs SPY, NVDA vs SOXX, CRWV vs SOXX and NVDA vs SPY"', 'Crown clip, 2026-11-15, as logged in education/intake/informational/crown', false)],
    ev: [], mentions: { n: 30, by: { Crown: 18, 'Quant Guild': 12 }, shared: 'NVDA' } },
  { id: 'nvda-spy', label: 'Nvidia vs the index (NVDA / SPY)', short: 'NVDA / SPY', x: 'nvda', y: 'spy', op: 'ratio', group: 'Breadth and style',
    what: 'Nvidia over the S&P 500 ETF: one very large company against the whole market. Rising means it is out-running the index.',
    up: 'Nvidia is out-running the market', down: 'Nvidia is lagging the market',
    say: [q('Nicholas Crown', 'pairs to watch into the Fed: "RSP vs SPY, NVDA vs SOXX, CRWV vs SOXX and NVDA vs SPY"', 'Crown clip, 2026-11-15, as logged in education/intake/informational/crown', false)],
    ev: [], mentions: { n: 30, by: { Crown: 18, 'Quant Guild': 12 }, shared: 'NVDA' } },
  { id: 'r2k-spx', label: 'Small vs large caps (Russell 2000 / S&P 500)', short: 'Russell / S&P', x: 'r2k', y: 'spx', op: 'ratio', group: 'Breadth and style',
    what: 'The Russell 2000 index over the S&P 500 index (the bundle holds the indices, not IWM and SPY, so this is the closest ratio). Rising means small companies are out-running large ones.',
    up: 'small caps are out-running large caps', down: 'small caps are lagging large caps',
    say: [q('Nicholas Crown', '"...IWM just hit its 200-day moving average and it stopped going down. And both of these things happening at the same time really gets our attention..."', 'Crown clip, 2026-10-02 (MD files/CROWN_WATCH.md)'),
      q('Nicholas Crown', '"IWM is front-running the implied odds of a December hike"', 'Crown clip, 2026-10-31 (MD files/CROWN_WATCH.md)')],
    ev: [{ id: 'rotation-extreme', about: 'Nasdaq against the Russell, 20-day relative return in the top decile (the closest test)' }],
    mentions: { n: 32, by: { Crown: 22, 'C.OG course': 9, Podcasts: 1 } } },
  { id: 'nq-spx', label: 'Nasdaq vs S&P 500 (growth against the broad market)', short: 'Nasdaq / S&P', x: 'nq', y: 'spx', op: 'ratio', group: 'Breadth and style',
    what: 'The Nasdaq 100 index over the S&P 500 index: whether long-duration growth stocks are leading. Rising means growth is out-running the broad market.',
    up: 'growth is out-running the broad market', down: 'growth is lagging the broad market',
    say: [q('C.OG course text', '"This is why Nasdaq and 30-year Treasuries often trade together — they\'re both long-duration assets."', 'C.OG course, Fixed-Income page')],
    ev: [{ id: 'rotation-extreme', about: 'Nasdaq against the Russell, 20-day relative return in the top decile (the closest test)' }],
    mentions: { n: 19, by: { 'Quant Guild': 6, Podcasts: 5, Crown: 4, 'C.OG course': 4 } } },
  { id: 'xly-xlp', label: 'Cyclicals vs defensives (consumer discretionary / staples)', short: 'XLY / XLP', x: 'xly', y: 'xlp', op: 'ratio', group: 'Breadth and style',
    what: 'The discretionary sector over the staples sector: people spending on wants over people spending on needs. Rising is read as a more confident market.',
    up: 'spending on wants is out-running spending on needs', down: 'defensive staples are out-running discretionary',
    say: [], ev: [], mentions: { n: 1, by: { 'C.OG course': 1 } } },
  { id: 'xle-oil', label: 'Energy stocks vs the barrel (XLE / WTI)', short: 'XLE / WTI', x: 'xle', y: 'oil', op: 'ratio', group: 'Commodities',
    what: 'The energy-sector ETF over WTI crude: are energy equities rich or cheap against the oil they produce. Rising means the shares have run ahead of the barrel.',
    up: 'the shares have run ahead of the barrel', down: 'the barrel has run ahead of the shares',
    say: [q('Nicholas Crown', '"Energy stocks diverging from barrels and distillate."', 'Crown clip, logged in MD files/CROWN_WATCH.md (XLE +5.9% over 20 sessions against WTI -1.4%)')],
    ev: [], mentions: { n: 7, by: { Crown: 6, Podcasts: 1 } } },
  { id: 'curve-2s10s', label: 'The yield curve: 10-year minus 2-year', short: '10y minus 2y', x: 'us10y', y: 'us2y', op: 'diff', unit: 'bp', group: 'Rates',
    what: 'The 10-year Treasury yield minus the 2-year, in basis points. Below zero (an "inverted" curve) has historically come before slowdowns; steepening can mean growth or inflation worries.',
    up: 'the curve is steepening (the long end yields more over the short end)', down: 'the curve is flattening (or inverting)',
    say: [q('C.OG course text', '"The yield curve - a plot of yields across different maturities - is one of the most powerful forecasting tools in finance."', 'C.OG course, Fixed-Income page')],
    ev: [{ id: 'curve-inversion', about: 'an inverted 10y-2y curve and weaker risk assets' }, { id: 'rates-spread-asset-lead', about: 'a yield spread (curve slopes 1Y to 30Y) leading an asset' }, { id: 'yield-slope-magnitude', about: 'the slope of the curve and the size of the next move' }],
    mentions: { n: 31, by: { 'C.OG course': 30, Podcasts: 1 } } },
  { id: 'curve-5s30s', label: 'The long end: 30-year minus 5-year', short: '30y minus 5y', x: 'us30y', y: 'us5y', op: 'diff', unit: 'bp', group: 'Rates',
    what: 'The 30-year yield minus the 5-year, in basis points: the far end of the curve, where term premium and supply worries show up.',
    up: 'the long end is yielding more over the middle (steeper)', down: 'the long end is flattening against the middle',
    say: [], ev: [{ id: 'rates-spread-asset-lead', about: 'a yield spread (curve slopes 1Y to 30Y) leading an asset' }],
    mentions: { n: 19, by: { Podcasts: 15, 'C.OG course': 4 } } },
  { id: 'real-bei', label: 'Real yield minus breakeven (what is driving the 10-year)', short: 'Real minus breakeven', x: 'tips', y: 'bei', op: 'diff', unit: 'bp', group: 'Rates',
    what: 'The 10-year real yield minus the 10-year breakeven inflation rate, in basis points. The nominal 10-year is the two added together, so this says which half is doing the work: growth and interest-rate expectations (real) or inflation worries (breakeven).',
    up: 'the real yield is the bigger part of the 10-year', down: 'inflation expectations are the bigger part of the 10-year',
    say: [q('C.OG course text', '"Nominal yield minus inflation expectations. Key driver for gold, growth stocks, and long-duration assets."', 'C.OG course, Cross-Asset-Synthesis page (real yield)')],
    ev: [{ id: 'broken-link-resolution', about: 'real yields and the dollar or gold moving the wrong way together' }, { id: 'gr-us-yields-direction', about: 'a 20-day rise in the US 10-year yield and the next day in the dollar' }],
    mentions: { n: 79, by: { 'C.OG course': 53, Jordan: 14, Crown: 7, Colez: 3, 'Quant Guild': 2 } } },
  { id: 'hy-ig', label: 'Credit quality gap: high-yield minus investment-grade', short: 'HY minus IG', x: 'hy', y: 'ig', op: 'diff', unit: 'bp', group: 'Credit',
    what: 'The extra yield junk bonds pay over investment-grade bonds, in basis points. Widening means lenders are asking much more to hold the riskier ones.',
    up: 'lenders are charging much more for the riskier credit', down: 'the quality gap is narrowing (calm credit)',
    say: [q('Nicholas Crown', '"Credit spreads wide."', 'Crown clip, logged in MD files/CROWN_WATCH.md (the desk\'s check: HYG/LQD -1.4% over five sessions)'),
      q('C.OG course text', '"VIX spikes, credit spreads widen, equity markets sell off"', 'C.OG course, Currency-Markets-Global-Flows page')],
    ev: [{ id: 'credit-leads-equities', about: 'credit spreads leading equities at 1 to 20 sessions' }, { id: 'bounce-confirmation', about: 'credit confirming a Nasdaq bounce (HYG/LQD)' }, { id: 'hy-spread-vol-idx', about: 'high-yield underperforming Treasuries and the next days of index volatility' }],
    mentions: { n: 69, by: { 'C.OG course': 57, Podcasts: 6, Crown: 4, Jordan: 1, 'Quant Guild': 1 } } },
  { id: 'ccc-hy', label: 'Tail credit: CCC minus high-yield', short: 'CCC minus HY', x: 'ccc', y: 'hy', op: 'diff', unit: 'bp', group: 'Credit',
    what: 'The extra yield the weakest (CCC) borrowers pay over the broad junk index, in basis points. A widening gap is the stress showing up at the very bottom first.',
    up: 'the weakest borrowers are being charged much more than the rest of junk', down: 'the tail is calming against the rest of junk',
    say: [], ev: [{ id: 'credit-leads-equities', about: 'credit spreads leading equities at 1 to 20 sessions' }],
    mentions: { n: 69, by: { 'C.OG course': 57, Podcasts: 6, Crown: 4, Jordan: 1, 'Quant Guild': 1 }, shared: 'credit' } },
  { id: 'vix-vix3m', label: 'VIX term structure: VIX / VIX 3-month', short: 'VIX / VIX3M', x: 'vix', y: 'vix3m', op: 'ratio', group: 'Volatility',
    what: 'Near-term fear (VIX, 30 days) over the 3-month: above 1 means the market pays more for protection today than for the next quarter (an "inverted" curve).',
    up: 'near-term fear is pricing above the 3-month (inverted above 1)', down: 'the vol curve is calm and upward-sloping',
    say: [q('Jessinskip', '"Just because the VIX is spiking, it doesn\'t mean that the market\'s about to go down."', 'Jessinskip clip, 2026-09-08, 1:39'),
      q('Jessinskip', '"I like to refer to it as the uncertainty index."', 'Jessinskip clip, 2026-09-08, 1:24')],
    ev: [{ id: 'vix-inversion', about: 'VIX above VIX3M and the range of the next week' }, { id: 'mv-vixterm-range', about: 'an inverted VIX curve flagged by the Market View and the next month\'s range' }],
    mentions: { n: 15, by: { 'C.OG course': 11, 'Quant Guild': 4 } } },
  { id: 'vix9d-vix', label: 'The front of the VIX curve: VIX 9-day / VIX', short: 'VIX9D / VIX', x: 'vix9d', y: 'vix', op: 'ratio', group: 'Volatility',
    what: 'Very near-term fear (9 days) over the 30-day VIX. A rich front means the next few days are being priced as busy.',
    up: 'the next few days are priced as busier than the month', down: 'the next few days are priced as calmer than the month',
    say: [], ev: [{ id: 'vol-curve-front', about: 'the front of the S&P implied-vol curve (VIX9D over VIX) and the range of the day' }],
    mentions: { n: 15, by: { 'C.OG course': 11, 'Quant Guild': 4 }, shared: 'VIX term' } },
  { id: 'move-vix', label: 'Bond vol vs equity vol: MOVE / VIX', short: 'MOVE / VIX', x: 'move', y: 'vix', op: 'ratio', group: 'Volatility',
    what: 'How much movement the bond market is paying for (MOVE) over the stock market (VIX). A high ratio means bond uncertainty is outpacing equity uncertainty.',
    up: 'bond uncertainty is outpacing equity uncertainty', down: 'equity uncertainty is outpacing bond uncertainty',
    say: [q('C.OG course text', '"Rate vol relative to equity vol. High ratio = bond uncertainty outpacing equity uncertainty. Macro stress signal."', 'C.OG course, Cross-Asset-Synthesis page'),
      q('C.OG course text', '"Treasury volatility index. Bond market\'s VIX. Elevated MOVE often precedes equity vol spikes."', 'C.OG course, Cross-Asset-Synthesis page')],
    ev: [{ id: 'rates-vol-gap-move', about: 'MOVE as a percentile of its year and next-session Nasdaq realised vol' }, { id: 'rates-vol-gap-state', about: 'rates vol rich while equity vol is cheap, and the next week of Nasdaq' }],
    mentions: { n: 32, by: { 'C.OG course': 24, Podcasts: 4, Crown: 4 } } },
  { id: 'vvix-vix', label: 'Vol of vol: VVIX / VIX', short: 'VVIX / VIX', x: 'vvix', y: 'vix', op: 'ratio', group: 'Volatility',
    what: 'How much the market pays for protection against a jump in the VIX itself (VVIX), over the VIX. High means the vol market is itself nervous.',
    up: 'the vol market is nervous about the VIX itself', down: 'the vol market is relaxed about the VIX',
    say: [], ev: [{ id: 'vvix-ratio-range', about: 'the ratio of how VVIX (or VIX) and Nasdaq price information, and the range of the next move' }, { id: 'vvix-ratio-direction', about: 'extremes of that pricing ratio and the direction of the next Nasdaq move' }],
    mentions: { n: 17, by: { 'C.OG course': 15, Friend: 1, 'Quant Guild': 1 } } },
  { id: 'copper-gold', label: 'Dr Copper: copper / gold', short: 'Copper / gold', x: 'copper', y: 'gold', op: 'ratio', group: 'Commodities',
    what: 'Copper (industrial demand) over gold (safety): rising is read as growth confidence, falling as growth worry.',
    up: 'copper is out-running gold (read as growth confidence)', down: 'gold is out-running copper (read as growth worry)',
    say: [q('C.OG course text', '"Dr. Copper" - industrial demand proxy. Leading indicator for global manufacturing and China.', 'C.OG course, Cross-Asset-Synthesis page'),
      q('Educator claim, as tested', '"Dr Copper does not miss": copper falls three months before GDP turns negative, every single time', 'Evidence Book: dr-copper', false)],
    ev: [{ id: 'dr-copper', about: 'copper falling before every negative GDP quarter' }],
    mentions: { n: 12, by: { 'C.OG course': 9, Crown: 3 } } },
  { id: 'gold-silver', label: 'Gold / silver ratio', short: 'Gold / silver', x: 'gold', y: 'silver', op: 'ratio', group: 'Commodities',
    what: 'How many ounces of silver one ounce of gold buys. High means silver is cheap against gold (often a defensive market); low means silver is running hot.',
    up: 'gold is out-running silver (a more defensive tone)', down: 'silver is out-running gold (a more speculative tone)',
    say: [], ev: [], mentions: { n: 30, by: { Crown: 18, Podcasts: 8, 'C.OG course': 4 }, note: 'mostly silver mentions, not the ratio' } },
  { id: 'gold-dxy', label: 'Gold against the dollar (gold / dollar index)', short: 'Gold / DXY', x: 'gold', y: 'dxy', op: 'ratio', group: 'Commodities',
    what: 'Gold priced in the dollar index: the line rises when gold is gaining on the dollar and falls when the dollar is gaining on gold.',
    up: 'gold is gaining on the dollar', down: 'the dollar is gaining on gold',
    say: [], ev: [{ id: 'relationship-map', about: 'twenty folklore relationships, including the dollar and gold' }],
    mentions: { n: 20, by: { Crown: 8, Colez: 4, 'C.OG course': 4, Jordan: 2, Podcasts: 2 } } },
  { id: 'btc-gold', label: 'Bitcoin vs gold (BTC / gold)', short: 'BTC / gold', x: 'btc', y: 'gold', op: 'ratio', group: 'Commodities',
    what: 'Bitcoin over gold: two "alternative" stores of value against each other. Rising means Bitcoin is out-running gold.',
    up: 'Bitcoin is out-running gold', down: 'gold is out-running Bitcoin',
    say: [], ev: [], mentions: { n: 18, by: { Podcasts: 12, Crown: 5, Colez: 1 } } },
  { id: 'audjpy', label: 'The risk gauge: AUD/JPY (risk currency over haven)', short: 'AUD/JPY', x: 'audjpy', y: null, op: 'level', group: 'Currencies',
    what: 'The Australian dollar over the Japanese yen: a risk-sensitive currency against a haven. It rises when investors take risk and falls when they run for safety.',
    up: 'investors are taking risk', down: 'investors are running to the haven',
    say: [q('C.OG course text', '"Risk Currencies (AUD, NZD, CAD, NOK, SEK, EM): Strengthen when risk appetite is high. Weaken during stress."', 'C.OG course, Currency-Markets-Global-Flows page')],
    ev: [{ id: 'yen-funding-squeeze-audjpy', about: 'growth in yen lent outside Japan and a bigger AUD/JPY squeeze' }],
    mentions: { n: 40, by: { 'C.OG course': 36, Jordan: 4 } } },
];

export const BY_ID = Object.fromEntries(PAIRS.map(p => [p.id, p]));

/** Evidence ids that speak for the whole idea of "a relationship at an extreme": shown above the ladder, not on one row. */
export const GENERAL_EV = [
  { id: 'mv-extreme-forward', about: 'a market making a rare move against its own history' },
  { id: 'mv-dislocation-forward', about: 'two markets that normally move together coming apart' },
];

/** Educator pairs we cannot draw from the daily bundle, and why. Listed on the board so the gap is visible. */
export const NOT_HELD = [
  { id: 'hyg-ief', label: 'High-yield bonds vs Treasuries (HYG / IEF, HYG / LQD)', said: 'Crown: "Credit spreads wide." (HYG/LQD -1.4% over five sessions)', why: 'The bundle holds credit as spreads (HY, IG, CCC), not the bond ETFs. The HY minus IG and CCC minus HY rows are the closest.', ev: ['hy-spread-vol-idx', 'bounce-confirmation'] },
  { id: 'iwm-spy', label: 'Small vs large caps as the ETFs (IWM / SPY)', said: 'Crown: "IWM just hit its 200-day moving average and it stopped going down."', why: 'The bundle holds the Russell 2000 and S&P 500 indices, not the ETFs. The ratio of the indices is the closest and is on the board.', ev: ['rotation-extreme'] },
  { id: 'crwv-soxx', label: 'CoreWeave vs the chip ETF (CRWV / SOXX)', said: 'Crown (2026-11-15): pairs to watch into the Fed.', why: 'CoreWeave is not in the 75-series bundle, and SOXX is stood in for by SMH. Adding one name would need a new series.', ev: [] },
  { id: 'y3m10y', label: 'The 3-month / 10-year curve (3m10y)', said: 'The curve family in the C.OG course text.', why: 'The bundle has no 3-month yield. Daily 3-month Treasury bill rates are in FRED (DTB3) and could be added without a new vendor.', ev: ['curve-inversion'] },
  { id: 'sofr-iorb', label: 'SOFR minus the Fed floor (SOFR - IORB)', said: 'The funding-stress family in the C.OG course text.', why: 'SOFR and IORB are held on the funding board and in the plumbing tests, not in the daily bundle, so the board cannot draw it as a long line.', ev: ['funding-stress', 'repo-stress-range'] },
];

/** The most-mentioned held pairs first (ties keep library order): the wall shows the first 12. */
// A count shared with another row (the same token family) or flagged as mostly something else does not rank a row twice or inflate it.
const rankN = p => (p.mentions?.shared || p.mentions?.note ? 0 : p.mentions?.n ?? 0);
export const WALL_IDS = [...PAIRS].map((p, i) => ({ p, i })).sort((a, b) => rankN(b.p) - rankN(a.p) || a.i - b.i).slice(0, 12).map(({ p }) => p.id);
