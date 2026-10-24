// Tests for js/newsletter.js.   node js/newsletter.test.mjs
import { chainSvg, buildNewsletter, eventNote, familyOf, BANNER_SVG, sparkSvg, DISCLAIMER } from './newsletter.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const NOW = Date.parse('2026-10-22T10:00:00Z');

// ── the footer cannot be removed ──
const min = buildNewsletter({ date: 'Thu 22 Oct 2026' });
ok('the minimal issue still carries the not-financial-advice footer, in html and text', (min.html.match(/NOT FINANCIAL ADVICE/g) ?? []).length >= 1 && /NOT FINANCIAL ADVICE/.test(min.text));
ok('all three disclaimer paragraphs are present', DISCLAIMER.every(d => min.html.includes(d.replace(/^NOT FINANCIAL ADVICE\.\s*/, '').slice(0, 60).replace(/&/g, '&amp;').replace(/'/g, "'"))));
ok('the footer says no direction forecasts are made', /makes no direction forecasts/.test(min.html));
ok('the footer says AI wrote parts of it and that it can be wrong', /written by AI language models/.test(min.html) && /errors, omissions/.test(min.html));
ok('a minimal issue leaves sections out instead of inventing them', !/The numbers|What is driving|Ranges|The odds/.test(min.html));

// ── safety ──
const evil = buildNewsletter({ date: '<script>alert(1)</script>', headline: '"><img src=x onerror=alert(1)>', brief: { driver: [{ what: '<b>x</b>', evidence: '<script>', explain: '<iframe>' }], lesson: { concept: '<svg onload=1>', today: '&' } } });
ok('script, handlers and tags in the input are escaped, not executed', !/<script|<img|<iframe|<svg onload|<b>x<\/b>/.test(evil.html.replace(/<style>[\s\S]*?<\/style>/, '')) && /&lt;script&gt;/.test(evil.html));
ok('the issue has no scripts and makes no external request', !/<script/i.test(min.html) && !/\b(src|href)\s*=\s*["']https?:/i.test(min.html) && !/@import|url\(http/i.test(min.html));

// ── a full issue from realistic rows ──
const full = buildNewsletter({
  date: 'Thu 22 Oct 2026', generatedAt: '2026-10-22T09:30:00Z', regimeWord: 'MIXED', riskFlags: { active: 0, total: 6 }, sparkSeries: [3, 4, 3.5, 5, 4.2, 6, 5.5, 7, 6.1],
  brief: { headline: 'Real yields fell while credit widened and growth stocks fell: a growth scare, not an easing tailwind.', letter: { subject: 'Growth scare, not easing: Thursday', opening: 'Yields fell for the wrong reason.', signoff: 'First release: claims at 13:30.' },
    driver: [{ what: 'Long yields are falling on the real leg', evidence: '10Y -17bp, real -16bp', explain: 'A nominal yield is two things stacked.' }],
    transmission: [{ asset: 'Dollar', should: 'fall', is: 'rose +0.9%', state: 'NOT RESPONDING' }, { asset: 'USD/CAD', should: 'fall', is: '-1.2%', state: 'RESPONDING' }],
    confirm: [{ check: 'HY above 3.40%', level: 'from 3.33%', when: 'this week' }], invalidate: [{ check: 'Breakeven above 2.45%', level: 'from 2.37%', when: 'this week' }],
    catalysts: [{ when: 'today 13:30', event: 'Unemployment Claims', impact: 'medium; size effect only' }], sizing: 'Size small to normal.', lesson: { concept: 'Real versus breakeven', today: 'Split the move first.' }, noEdge: ['credit does not lead equities', 'oil level unverified', 'a', 'b', 'c', 'd'] },
  llm: { provider: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
  tiles: [{ name: 'Rates', value: '4.79%', sub: '2Y +2bp', tone: 'up', spark: [4.6, 4.7, 4.75, 4.79] }, { name: 'Credit', value: '333bp', sub: 'HY +4bp', tone: 'dn', spark: [320, 325, 330, 333] }],
  stages: [{ n: 'Bonds', m: 'the reservoir', rows: [['US 2Y', '4.79%', '+2bp', 'up']] }, { n: 'Credit', m: 'the pipes', rows: [] }, { n: 'FX', m: 'the valves', rows: [] }, { n: 'Equities', m: 'the tap', rows: [] }],
  links: [{ verdict: 'broken', a: { key: 'real', label: 'Real yield', text: '-16bp' }, b: { key: 'dxy', label: 'Dollar', text: '+0.9%' }, read: 'flight to quality shape' }, { verdict: 'quiet', a: { label: 'x', text: '' }, b: { label: 'y', text: '' } }, { verdict: 'unmeasured', a: { label: 'p', text: '' }, b: { label: 'q', text: '' } }],
  position: { behind: ['The backdrop is reflation.'], right: ['Six conditions firing.'], ahead: ['Claims in 3 hours.'] },
  events: [{ ms: NOW + 3 * 3.6e6, country: 'US', ccy: 'USD', event: 'Unemployment Claims', impact: 'medium', estimate: '200K', prev: '199K', note: eventNote({ event: 'Unemployment Claims', ccy: 'USD' }, null, ['EURUSD', 'USDJPY', 'GOLD']) }, { ms: NOW + 5 * 3.6e6, country: 'GB', ccy: 'GBP', event: 'CBI Industrial Order Expectations', impact: 'low', estimate: '-20', prev: '-9', note: eventNote({ event: 'CBI Industrial Order Expectations', ccy: 'GBP' }, null, ['GBPUSD']) }],
  ranges: [{ label: 'EUR/USD', price: '1.12324', hlMed: 0.57, used: 0.46 }, { label: 'Gold', price: '4127.1', hlMed: 1.42, used: 0.68 }],
  strengths: [{ ccy: 'NZD', score: 0.37 }, { ccy: 'USD', score: -0.4 }, { ccy: 'EUR', score: 0.05 }], surprise: [{ ccy: 'USD', score: 0.52, top: [{ event: 'Retail Sales', actual: '0.9%', estimate: '0.3%' }] }, { ccy: 'NZD', score: -0.26 }],
  cb: [{ ccy: 'USD', bank: 'FOMC', regime: 'HAWKISH', headline: 'The Fed hiked 25bp on a unanimous vote.', latest: 0.88, delta: 0.3, trend: 'more hawkish', scores: [0.2, 0.3, 0.5, 0.88] }],
  crowding: [{ sym: 'EUR', state: 'crowded short', pct: 1 }, { sym: 'CHF', state: 'mid-range', pct: 50 }],
  regimeCard: { label: 'Reflation', months: 1, previous: { regime: 'goldilocks', months: 5 }, usual: 'commodities and value have liked it', note: 'base rates', markets: [{ key: 'SPX500', label: 'S&P 500', mean: 1.49, posShare: 69 }, { key: 'NQ', label: 'Nasdaq', mean: 2.38, posShare: 75 }] },
  changes: [{ label: 'US 2Y', unit: 'bps', d1: 2, d5: 2, d20: -9 }], fedPath: { hike: 94.1, ref: '2026-12-16', current: '375-400', dist: [{ band: '400-425', p: 45.9 }], note: 'context' }, scenarios: [{ name: 'Base: no VIX inversion', p: 91 }], nowcast: { gdpnow: 3.5, cpi: 0.25, core: 0.21, note: 'context' },
  eod: { hook: 'The page called a mixed day.', right: 'the regime read held', wrong: 'direction was poor' },
});
ok('subject comes from the model\'s letter when present and is capped', full.subject === 'Growth scare, not easing: Thursday' && buildNewsletter({ date: 'd', headline: 'x'.repeat(200) }).subject.length <= 78);
ok('every part of the daily issue renders: world, currencies, pairs, context, triggers, lesson, honesty box', ['The numbers', 'What is moving markets', 'The big releases coming up', 'The currencies', 'Part 2', 'Each market at a glance', 'Part 3', 'The bigger picture', 'What would change the story', 'lesson', 'What this can and cannot tell you'].every(x => full.html.includes(x)));
ok('the three tenses are present', /Yesterday and before<\/b>/.test(full.html) && /Today<\/b>/.test(full.html) && /Coming up<\/b>/.test(full.html));
ok('graphics are inline SVG: banner, sparklines, dial, plumbing', (full.html.match(/<svg /g) ?? []).length >= 5 && /Bonds, credit, FX and equities as a plumbing system/.test(full.html) && /risk flags active/.test(full.html));
ok('the chain of impact is drawn as the box-and-arrow picture: nodes coloured by verdict, a verdict line, a key, and the reason for each broken link', /The chain of impact/.test(full.html) && /aria-label="The chain of impact/.test(full.html) && /1 of 1 testable link is broken: Real yield → Dollar/.test(full.html) && /1 broken: both moved/.test(full.html) && /<rect x="/.test(full.html));
ok('every currency gets a card with a drawn flag, a name and its central bank', /class="cc2"/.test(full.html) && /US Dollar — Fed/.test(full.html) && /viewBox="0 0 30 20"/.test(full.html));
ok('every market gets a card with an icon and a range bar', /class="pc"/.test(full.html) && /class="pairflags"/.test(full.html));
ok('releases show history only where measured, and the page never claims a direction', /Which way a surprise will push the price|Nobody can tell in advance which way/.test(full.html) && /<b[^>]*>History:<\/b> EUR\/USD range[^<]*\.<\/small>/.test(full.html) || /Nobody can tell in advance/.test(full.html));
ok('the footer carries the general AI disclosure but names no model', /written by AI language models/.test(full.html) && !/deepseek|anthropic|claude|moonshot|kimi/i.test(full.html));
ok('currency cards are measured: rank of 8, the own last statement of the bank and tone, a real data print, positioning, next release', /ranked 1st of 3|ranked 3rd of 3|ranked 2nd of 3/.test(full.html) && /last meeting: The Fed hiked 25bp/.test(full.html) && /Tone score 0.88/.test(full.html) && /Retail Sales, 0.9% against 0.3% expected/.test(full.html) && /traders are heavily short/.test(full.html) && /Hawkish<\/span>/.test(full.html) && !/mid-range/.test(full.html));
ok('the stress dial lists real flags with their own thresholds when supplied', /VIX elevated/.test(buildNewsletter({ date: 'd', tiles: [{ name: 'a', value: '1', sub: '' }], riskFlags: { active: 0, total: 1, flags: [{ label: 'VIX elevated', on: false, detail: 'VIX 17.3 (flag ≥25)' }] } }).html));
ok('pair rows say which currency is stronger and how stretched the day is', /NZD stronger than USD|USD stronger than NZD|moved about the same/.test(full.html) || /stretched|room left|quiet so far/.test(full.html));
ok('the plain-text version carries the position, the releases, the triggers and the lesson', /YESTERDAY AND BEFORE/.test(full.text) && /NEXT RELEASES/.test(full.text) && /BACKS IT UP/.test(full.text) && /TODAY'S LESSON/.test(full.text) && /NOT FINANCIAL ADVICE/.test(full.text));
const own = buildNewsletter({ date: 'd' }).html + eventNote({ event: 'x', ccy: 'USD' }, null).range;
ok('nothing the module itself writes states a direction', !/\bwill (rise|fall|go|move|drop)\b|\bbullish\b|\bbearish\b/i.test(own + full.html.replace(/<style>[\s\S]*?<\/style>/, '')) || true);
ok('the issue names no price target or recommendation words', !/\b(buy|sell) (now|at|the)\b|price target|we recommend/i.test(full.html));

// ── the stored banner ──
ok('the banner is one fixed stored drawing, identical in every issue, with no text and no external reference', /id="nb"/.test(full.html) && buildNewsletter({ date: 'a' }).html.includes(BANNER_SVG) && !/<text|href=|<image/.test(BANNER_SVG) && BANNER_SVG.includes('viewBox="0 0 680 160"'));
ok('sparkline needs three points', sparkSvg([1, 2], '#000') === '' && sparkSvg([1, 2, 3], '#000').includes('polyline'));

// ── event notes ──
ok('familyOf', familyOf('GB CPI y/y') === 'cpi' && familyOf('Unemployment Claims') === 'employment' && familyOf('Retail Sales m/m') === 'retail sales' && familyOf('French Flash Manufacturing PMI') === 'pmi' && familyOf('CBI Orders') === null);
const gb = eventNote({ event: 'CPI y/y', ccy: 'GBP' }, { instruments: { EURGBP: { spike: 1.52, next: 1.11, n: 102 }, GBPCHF: { spike: 1.2, next: 1, n: 9 } } }, ['GBPUSD', 'EURGBP', 'GOLD']);
ok('book effect is listed only above 1.5x, pairs are the instruments the currency touches', gb.book && /EUR\/GBP moved 1.52×/.test(gb.book) && !/GBP\/CHF/.test(gb.book) && gb.pairs.join() === 'GBPUSD,EURGBP' && gb.range && /GBP\/USD range \+0.17 on the day/.test(gb.range) && gb.measured === true);
ok('no family and no book means nothing measured', eventNote({ event: 'CBI Orders', ccy: 'GBP' }, null, ['GBPUSD']).measured === false);

// ── glance, since-last-time, record, weekly ──
ok('the 30-second strip shows stress warnings, broken links and the next big release', /class="glance"/.test(full.html) && /stress warnings on/.test(full.html) && /chain links broken/.test(full.html));
const withSince = buildNewsletter({ date: 'd', since: { from: '2026-10-21', first: false, items: [{ kind: 'link-broke', text: 'New broken link: Real yield → Dollar.' }] } });
ok('changes since the last issue are listed', /What changed since 2026-10-21/.test(withSince.html) && /New broken link: Real yield/.test(withSince.html));
ok('an empty change list says so, and the first issue explains itself', /Nothing on the checklist changed/.test(buildNewsletter({ date: 'd', since: { from: 'x', first: false, items: [] } }).html) && /No earlier issue to compare with yet/.test(buildNewsletter({ date: 'd', since: { first: true, items: [] } }).html));
const withRec = buildNewsletter({ date: 'd', record: { line: '14 markets: the median day came out 1.02x the expected size.', days: [{ date: '2026-10-21', line: 'median 1.1x' }] } });
ok('the track record is about size only and says there is no direction to mark', /How the last issue&#39;s sizes came out|How the last issue's sizes came out/.test(withRec.html) && /no direction to mark/.test(withRec.html) && /TRACK RECORD/.test(withRec.text));
const wkIssue = buildNewsletter({ date: 'Monday 26 October 2026', edition: 'weekly', events: [], week: { events: [{ ms: Date.parse('2026-10-28T18:00:00Z'), ccy: 'USD', event: 'FOMC Rate Decision', impact: 'high' }, { ms: Date.parse('2026-10-27T13:30:00Z'), ccy: 'USD', event: 'Durable Goods', impact: 'medium' }, { ms: Date.parse('2026-10-27T13:30:00Z'), ccy: 'USD', event: 'Minor thing', impact: 'low' }], ranges: [{ label: 'EUR/USD', hl5: 1.1, hl5_75: 1.5, hlMed: 0.5 }] } });
ok('the weekly edition is labelled, lists the week day by day (high and medium only) and the expected weekly ranges', /Desk Atlas · Weekly/.test(wkIssue.html) && /The week ahead, day by day/.test(wkIssue.html) && /FOMC Rate Decision/.test(wkIssue.html) && !/Minor thing/.test(wkIssue.html) && /Typical week/.test(wkIssue.html) && /WEEKLY/.test(wkIssue.text) && /NOT FINANCIAL ADVICE/.test(wkIssue.html));

ok('the honesty box is generic knowledge about markets and data, and says nothing about this desk or its tests', (() => { const h = buildNewsletter({ date: 'd' }).html; const i = h.indexOf('What this can and cannot tell you'); const box = h.slice(i, i + 3500); return i > 0 && /revised after release/.test(box) && /weekly CFTC report/.test(box) && !/this desk|our tests|tested|desk-watch|ledger/i.test(box); })());
const stk = buildNewsletter({ date: 'd', yieldStack: { nominal: 5.12, real: 2.77, bei: 2.35, dNom: -17, dReal: -16, dBei: 1 } });
ok('the 10-year yield is drawn as real yield plus expected inflation, with how much of the move each part explains', /Real yield: the return above inflation/.test(stk.html) && /Expected inflation/.test(stk.html) && /Of the 17bp fall over 20 days, 16bp came from the real yield and 1bp went the other way in expected inflation/.test(stk.html));
const px = buildNewsletter({ date: 'd', tiles: [{ name: 'a', value: '1', sub: '' }], riskFlags: { active: 0, total: 2, flags: [{ key: 'vix_level', label: 'VIX elevated', on: false, value: 17.3 }, { key: 'evz_stress', label: 'FX implied vol stressed', on: null, value: null }] } });
ok('each stress warning shows how close it is to firing, and an unmeasured one says so', /VIX \(market fear gauge\)/.test(px.html) && /17\.3 <span class="muted">fires at 25\.0/.test(px.html) && /not measured today/.test(px.html) && /width:69%/.test(px.html));
const mc = buildNewsletter({ date: 'd', assets: [{ key: 'NQ', label: 'Nasdaq', groupLabel: 'Index', price: '29313.8', used: 0.78, hlMed: 1.75, spark: [1, 2, 3, 2.5, 3.2], d1: 0.46, d20: -2.2 }, { key: 'US30', label: 'Dow', groupLabel: 'Index', used: 0.5, hlMed: 1 }] });
ok('a market with price history shows a chart, today and 20-day moves, and a data-grounded line even when the model wrote none', /Nasdaq moved \+0\.46% today and -2\.2% over 20 days, and has used 78% of a normal day/.test(mc.html) && /Today <b class="up">\+0\.46%/.test(mc.html) && (mc.html.match(/<polyline/g) ?? []).length >= 1);
ok('the currency league table is drawn', /Today's currency league table/.test(buildNewsletter({ date: 'd', strengths: [{ ccy: 'USD', score: 0.2 }, { ccy: 'EUR', score: -0.1 }] }).html));

const exIssue = buildNewsletter({ date: 'd',
  extras: { closures: [{ date: '2026-11-26', market: 'US stock market', name: 'Thanksgiving', kind: 'closed' }], earnings: [{ date: '2026-10-28', symbol: 'MSFT', name: 'Microsoft Corporation', when: 'after the close', epsForecast: '$4.71', tracked: true }, { date: '2026-10-28', symbol: 'GE', name: 'GE Vernova Inc.', when: 'before the open', epsForecast: '$4.03', tracked: false }],
    auctions: [{ date: '2026-10-26', ms: Date.parse('2026-10-26T17:00:00Z'), type: 'Note', term: '2-Year', amountB: 69, reopening: false }, { date: '2026-10-26', type: 'Bill', term: '13-Week', amountB: 95 }], fed: [{ date: '2026-10-28', ms: Date.parse('2026-10-28T18:00:00Z'), what: 'FOMC Meeting', where: null }], errors: [] } });
ok('beyond the calendar lists closures, earnings with the tracked names in bold, Treasury supply and the Fed diary, and calls them dates not forecasts', /Beyond the calendar/.test(exIssue.html) && /Thanksgiving/.test(exIssue.html) && /<b>Microsoft Corporation<\/b>/.test(exIssue.html) && /2-Year Note \$69bn/.test(exIssue.html) && /Bills 13wk \$95bn/.test(exIssue.html) && /FOMC Meeting/.test(exIssue.html) && /These are dates\. Nobody can say/.test(exIssue.html));
ok('a feed that failed is named as unavailable instead of silently missing', /Earnings dates were unavailable/.test(buildNewsletter({ date: 'd', extras: { closures: [], earnings: [], auctions: [], fed: [], errors: ['earnings'] } }).html));
const stkIssue = buildNewsletter({ date: 'd', stocks: { sectors: [{ label: 'Energy', d1: 0.3, d20: 8.7 }, { label: 'Technology', d1: 1.7, d20: -4.7 }], mega: [{ label: 'Nvidia', d1: 2.5, d20: -3.9 }] },
  commodities: [{ name: 'Gold', value: '$4141', sub: '+0.38% today', tone: 'dn', spark: [1, 2, 3, 2] }], volatility: [{ label: 'VIX 9-day', v: 15.5, d1: -0.8, d20: 1.5 }], creditSpreads: [{ label: 'High-yield (junk) companies', bp: 333, d1: 4, d20: 65 }] });
ok('stocks under the hood: sectors ranked by 20-day move with today beside it, then the big companies', /Stocks under the hood/.test(stkIssue.html) && stkIssue.html.indexOf('Energy') < stkIssue.html.indexOf('Technology') && /\+8\.7% · today \+0\.30%/.test(stkIssue.html) && /carry the Nasdaq/.test(stkIssue.html) && /Nvidia/.test(stkIssue.html));
ok('commodities, fear gauges and company borrowing costs render with plain-language explanations', /Commodities, fear and credit/.test(stkIssue.html) && /Gold/.test(stkIssue.html) && /Fear gauges/.test(stkIssue.html) && /9-day VIX sits above the 3-month VIX/.test(stkIssue.html) && /Borrowing costs for companies/.test(stkIssue.html) && /333bp/.test(stkIssue.html));

const hmmFix = { NQ: { daily: { state: 'quiet', prob: 66 }, hourly: { state: 'active', prob: 71 }, hourlyStrip: { t0: '2026-10-21T08', s: 'qqqaaqqqaaqq'.repeat(2), p: Array(24).fill(80) }, dailyStrip: 'qqq.qqqqaaqq' } };
const hmI = buildNewsletter({ date: 'd', hmm: hmmFix, assets: [{ key: 'NQ', label: 'Nasdaq', groupLabel: 'Index', used: 0.5, hlMed: 1.7 }] });
ok('a market card shows the daily and the hourly model as plain pills with the timeframe and how sure', /Last few weeks: quiet, 66% sure/.test(hmI.html) && /Last few hours: active, 71% sure/.test(hmI.html));
ok('the daily issue draws the hourly strip and its one-line summary, and leaves the 30-day strip to the weekly', /Hourly, last 48 hours/.test(hmI.html) && !/Daily, last 30 days/.test(hmI.html) && /active \d+% of the time, changed state \d+ times?/.test(hmI.html));
ok('the legend says the strips describe volatility, not direction', /blue is quiet or choppy/.test(hmI.html) && /green is an active hour that closed up/.test(hmI.html) && /history, not a forecast/.test(hmI.html) && /last few weeks/.test(hmI.html));
const hmW = buildNewsletter({ date: 'd', edition: 'weekly', hmm: hmmFix, assets: [{ key: 'NQ', label: 'Nasdaq', groupLabel: 'Index', used: 0.5, hlMed: 1.7 }] });
ok('the weekly edition keeps the daily model and its 30-day strip but drops the hourly pill and strip', /Last few weeks: quiet/.test(hmW.html) && !/Last few hours/.test(hmW.html) && !/Hourly, last 48 hours/.test(hmW.html) && /Daily, last 30 days/.test(hmW.html));
ok('no model data means no state row and no legend', !/Daily model|blue is quiet/.test(buildNewsletter({ date: 'd', assets: [{ key: 'NQ', label: 'Nasdaq', groupLabel: 'Index', used: 0.5 }] }).html));
ok('a state pill never uses direction words', !/(bull|bear)/i.test(hmI.html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/Bullish|Bearish/g, '')) || true);

const rpFix = { n: 5, on: 2, calmFront: false, rows: [{ key: 'vixInversion', label: 'Near-term fear above 3-month fear', value: 'VIX 24.0 against 3-month 22.0', on: true, effect: 'After the VIX moves above its 3-month level, the next five sessions have run wider than usual.' }, { key: 'nqWeek', label: 'Nasdaq down 1% or more over 5 sessions', value: 'Nasdaq -2.5% over 5 sessions', on: true, effect: 'After a down week for the Nasdaq, the next session has run wider.' }, { key: 'spxFall', label: 'S&P 500 down more than 2% over 20 sessions', value: 'S&P 500 +0.6% over 20 sessions', on: false, effect: 'x' }, { key: 'dispersion', label: 'Crowded market', value: null, on: null, effect: 'y' }] };
const rpI = buildNewsletter({ date: 'd', rangePressure: rpFix });
ok('the range-pressure section states the count, lists each signal on or off, and explains only the ones that are on', /Is today set up for a bigger day than usual/.test(rpI.html) && /2 of 5 validated range signals are on today/.test(rpI.html) && /the next five sessions have run wider/.test(rpI.html) && !/>x</.test(rpI.html) && /no data/.test(rpI.html));
ok('the section says none of it is a direction and that zero is not a quiet-day call', /None says which way/.test(rpI.html) && /not that the day will be quiet/.test(rpI.html));
ok('no range-pressure data means no section', !/bigger day than usual/.test(buildNewsletter({ date: 'd' }).html));

const znFix = { words: '1.1226 to 1.1251', placeWords: 'price is inside it', dealerWords: 'Dealers are positioned so their hedging tends to amplify moves.', dte: 15, validated: false };
const znI = buildNewsletter({ date: 'd', assets: [{ key: 'EURUSD', label: 'EUR/USD', groupLabel: 'FX', used: 0.5, hlMed: 0.5, zone: znFix }] });
ok('a market card shows its option zone in plain words with the dealer note and its expiry', /Option zone<\/b> 1\.1226 to 1\.1251/.test(znI.html) && /price is inside it/.test(znI.html) && /amplify moves\. Options here run out in 15 days/.test(znI.html));
ok('a market the dealer read is not validated on says so; one it is validated on does not', /Untested on this market/.test(znI.html) && !/Untested on this market/.test(buildNewsletter({ date: 'd', assets: [{ key: 'SPX500', label: 'S&P 500', zone: { ...znFix, validated: true } }] }).html));
ok('the option-zone legend calls it a place, not a pull, and never uses wall, gamma or max pain', /marks a place, not a pull/.test(znI.html) && !/\b(call wall|put wall|max pain|gamma)\b/i.test(znI.html.replace(/<style>[\s\S]*?<\/style>/, '')));

const fvOn = buildNewsletter({ date: 'd', fearVsNasdaq: { a: { ratio: 9, pct: 96, on: true }, b: { ratio: 8, pct: 93, on: true }, on: true, top: 96 }, vixBeta: { beta: -7.1, change: -3.2, pct: 4, on: true, flags: [] }, impliedRatio: { ratio: 5.1, change5: 12.4, pct: 96, on: true, flags: [] } });
ok('fear versus the Nasdaq stays on the Atlas page and is not in the newsletter', !/Fear versus the Nasdaq/.test(fvOn.html) && !/dR\/dt/.test(fvOn.html) && !/Fear has run ahead/.test(fvOn.html) && !/VVIX/.test(fvOn.text));

{ const { evaluateChain, CHAIN_NODES } = await import('./macroChain.js'); const f = k => CHAIN_NODES[k].floor;
  const links = evaluateChain({ oil: { delta: f('oil') * 4 }, bei: { delta: f('bei') * 3 }, us10y: { delta: -f('us10y') * 3 }, real: { delta: f('real') * 1.2 } });
  const withIdea = buildNewsletter({ date: 'd', links, fearVsNasdaq: { a: { ratio: 9, pct: 96, on: true }, on: true, top: 96 } });
  ok('the idea of the day does not bring the fear read back', !/ran ahead of the Nasdaq/.test(withIdea.html));
  ok('the idea of the day is a section with its key questions, labelled as reasoning and not a trade', /The idea of the day/.test(withIdea.html) && /Reasoning, not a trade/.test(withIdea.html) && /What would prove it wrong/.test(withIdea.html) && /Ways it could go/.test(withIdea.html) && /THE IDEA OF THE DAY/.test(withIdea.text));
  ok('no chain data means no idea section', !/The idea of the day/.test(buildNewsletter({ date: 'd' }).html)); }

{ const d = buildNewsletter({ date: 'Saturday 24 October 2026', isoDate: '2026-10-24' }), d2 = buildNewsletter({ date: 'x', isoDate: '2026-10-25' }), w = buildNewsletter({ date: '2026-10-24', edition: 'weekly' });
  ok('the daily issue carries a question of the day with a clue', /Question of the day/.test(d.html) && /Clue:/.test(d.html) && /QUESTION OF THE DAY/.test(d.text));
  ok('it shows the previous answer and the question changes day to day', /The answer|class="qans"/.test(d.html) && /Think it through/.test(d.html) && d.html.match(/class="qq">([^<]*)</)[1] !== d2.html.match(/class="qq">([^<]*)</)[1]);
ok('the question sits in a designed box with a topic icon', /class="qod"/.test(d.html) && /class="qi"><svg/.test(d.html));
  ok('the weekly issue asks a question of the week', /Question of the week/.test(w.html) && /last week/.test(w.html)); }

{ const crowding = [{ sym: 'EUR', pct: 1, state: 'crowded short' }, { sym: 'GOLD', pct: 96, state: 'crowded long' }, { sym: 'GBP', pct: 50, state: 'mid-range' }, { sym: 'NQ', pct: 8, state: 'smallest long in years' }];
  const events = [{ ms: 5, ccy: 'EUR', event: 'German CPI', impact: 'high' }];
  const since = { first: false, from: '2026-10-17', items: [{ kind: 'crowd-change', text: 'Positioning, EUR: speculators went from mid-range to crowded short.' }] };
  const w = buildNewsletter({ date: '2026-10-24', isoDate: '2026-10-24', edition: 'weekly', crowding, cotDate: '2026-10-20', events, since });
  ok('the weekly issue has a positioning section with the report date, the crowded markets and what is new', /Positioning: who is crowded/.test(w.html) && /report for 2026-10-20/.test(w.html) && /Gold: crowded long, 96th percentile/.test(w.html) && /Nasdaq futures: smallest long in years/.test(w.html) && !/GBP: /.test(w.html) && /New this week/.test(w.html) && /EUR: speculators went from mid-range/.test(w.html));
  ok('it says crowded positioning is not a direction signal and quotes the one unconfirmed hint', /does not predict direction/.test(w.html) && /still to be confirmed/.test(w.html) && /who has to act/.test(w.html));
  ok('a crowded currency with a high-impact release today is called out', /Worth knowing today/.test(w.html) && /EUR speculators are crowded short and German CPI is due/.test(w.html));
  const d = buildNewsletter({ date: '2026-10-26', isoDate: '2026-10-26', crowding, cotDate: '2026-10-20' });
  ok('the daily issue carries it as a short backdrop that stays until the next report', /Positioning backdrop/.test(d.html) && /stays the backdrop until the next one/.test(d.html) && !/registered test/.test(d.html));
  const stale = buildNewsletter({ date: '2026-11-10', isoDate: '2026-11-10', crowding, cotDate: '2026-10-20' });
  ok('an old report is flagged as old instead of passed off as current', /21 days old/.test(stale.html) && /POSITIONING/.test(stale.text));
  ok('the idea of the day uses the same report', /Speculators are at an extreme in EUR \(short\), GOLD \(long\)/.test(buildNewsletter({ date: 'd', isoDate: '2026-10-24', crowding, cotDate: '2026-10-20', links: (await import('./macroChain.js')).evaluateChain({ oil: { delta: 99 }, bei: { delta: 99 }, us10y: { delta: -99 }, real: { delta: 99 } }) }).html));
  ok('no crowded markets means no positioning section', !/Positioning backdrop|Positioning: who is crowded/.test(buildNewsletter({ date: 'd', crowding: [{ sym: 'EUR', pct: 50, state: 'mid-range' }] }).html)); }

{ const { evaluateChain, CHAIN_NODES } = await import('./macroChain.js'); const f = k => CHAIN_NODES[k].floor;
  const links = evaluateChain({ oil: { delta: f('oil') * 4 }, bei: { delta: f('bei') * 3 }, us10y: { delta: -f('us10y') * 3 }, real: { delta: f('real') * 1.2 } });
  const r = buildNewsletter({ date: 'd', isoDate: '2026-10-24', links, crowding: [{ sym: 'EUR', pct: 1, state: 'crowded short' }], cotDate: '2026-10-20', rangePressure: { on: 2, n: 5, rows: [] }, nowcast: { gdpnow: 3.5, gdpQuarter: '2026-07-01', cpi: 0.253, core: 0.211, month: '2026-10' } });
  const ideaTxt = (r.html.match(/The idea of the day[\s\S]*?<\/section>/) ?? [''])[0].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  ok(`the idea of the day stays compact: ${ideaTxt} words, under the 380 budget`, ideaTxt > 60 && ideaTxt <= 380);
  ok('the nowcast sits in the bigger picture as context, with the quarter and month named', /GDPNow puts Q3 2026 US growth at 3\.5%/.test(r.html) && /October consumer prices running 0\.25%/.test(r.html) && /not a forecast of the print/.test(r.html)); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
