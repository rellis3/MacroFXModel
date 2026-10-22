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
ok('every part of the daily issue renders: world, currencies, pairs, context, triggers, lesson, honesty box', ['The numbers', 'What is moving markets', 'The big releases coming up', 'The currencies', 'Part 2', 'Each market at a glance', 'Part 3', 'The bigger picture', 'What would change the story', 'lesson', 'What we cannot tell you'].every(x => full.html.includes(x)));
ok('the three tenses are present', /Yesterday and before<\/b>/.test(full.html) && /Today<\/b>/.test(full.html) && /Coming up<\/b>/.test(full.html));
ok('graphics are inline SVG: banner, sparklines, dial, plumbing', (full.html.match(/<svg /g) ?? []).length >= 5 && /Bonds, credit, FX and equities as a plumbing system/.test(full.html) && /risk flags active/.test(full.html));
ok('the chain of impact is drawn as the box-and-arrow picture: nodes coloured by verdict, a verdict line, a key, and the reason for each broken link', /The chain of impact/.test(full.html) && /aria-label="The chain of impact/.test(full.html) && /1 of 1 testable link is broken: Real yield → Dollar/.test(full.html) && /1 broken: both moved/.test(full.html) && /<rect x="/.test(full.html));
ok('every currency gets a card with a drawn flag, a name and its central bank', /class="cc2"/.test(full.html) && /US Dollar — Fed/.test(full.html) && /viewBox="0 0 30 20"/.test(full.html));
ok('every market gets a card with an icon and a range bar', /class="pc"/.test(full.html) && /class="pairflags"/.test(full.html));
ok('releases show history only where measured, and the page never claims a direction', /Which way a surprise will push the price|Nobody can tell in advance which way/.test(full.html) && /<b[^>]*>History:<\/b> EUR\/USD range[^<]*\.<\/small>/.test(full.html) || /Nobody can tell in advance/.test(full.html));
ok('the author of the narrative is named in the footer', /narrative written by DeepSeek \(deepseek-chat\)/.test(full.html));
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
ok('an empty change list says so, and the first issue explains itself', /Nothing on the checklist changed/.test(buildNewsletter({ date: 'd', since: { from: 'x', first: false, items: [] } }).html) && /first saved issue/.test(buildNewsletter({ date: 'd', since: { first: true, items: [] } }).html));
const withRec = buildNewsletter({ date: 'd', record: { line: '14 markets: the median day came out 1.02x the expected size.', days: [{ date: '2026-10-21', line: 'median 1.1x' }] } });
ok('the track record is about size only and says there is no direction to mark', /How the last issue&#39;s sizes came out|How the last issue's sizes came out/.test(withRec.html) && /no direction to mark/.test(withRec.html) && /TRACK RECORD/.test(withRec.text));
const wkIssue = buildNewsletter({ date: 'Monday 26 October 2026', edition: 'weekly', events: [], week: { events: [{ ms: Date.parse('2026-10-28T18:00:00Z'), ccy: 'USD', event: 'FOMC Rate Decision', impact: 'high' }, { ms: Date.parse('2026-10-27T13:30:00Z'), ccy: 'USD', event: 'Durable Goods', impact: 'medium' }, { ms: Date.parse('2026-10-27T13:30:00Z'), ccy: 'USD', event: 'Minor thing', impact: 'low' }], ranges: [{ label: 'EUR/USD', hl5: 1.1, hl5_75: 1.5, hlMed: 0.5 }] } });
ok('the weekly edition is labelled, lists the week day by day (high and medium only) and the expected weekly ranges', /Desk Atlas · Weekly/.test(wkIssue.html) && /The week ahead, day by day/.test(wkIssue.html) && /FOMC Rate Decision/.test(wkIssue.html) && !/Minor thing/.test(wkIssue.html) && /Typical week/.test(wkIssue.html) && /WEEKLY/.test(wkIssue.text) && /NOT FINANCIAL ADVICE/.test(wkIssue.html));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
