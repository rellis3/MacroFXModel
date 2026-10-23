// Tests for js/stateStrip.js.   node js/stateStrip.test.mjs
import { lastHours, stripSvg, hourlyStripSvg, dailyStripSvg, summarize, summaryWords, pillWords, COLOUR } from './stateStrip.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const e = { t0: '2026-10-21T08', s: 'qqqaaq.q', p: [97, 95, 71, 80, 88, 60, 0, 90] };
const c3 = lastHours(e, 3);
ok('lastHours returns the last hours with their own stamps', c3.length === 3 && c3[0].ch === 'q' && c3[0].at === '2026-10-21 13:00 UTC' && c3.at(-1).at === '2026-10-21 15:00 UTC');
ok('asking for more hours than exist returns what exists; an empty entry returns nothing', lastHours(e, 99).length === 8 && lastHours(null, 5).length === 0);
const svg = hourlyStripSvg(e, 8);
ok('one block per hour, quiet blue, active amber, unknown grey', (svg.match(/<rect/g) ?? []).length === 8 && svg.includes(COLOUR.quiet) && svg.includes(COLOUR.active) && svg.includes(COLOUR.none));
ok('a block carries a tooltip with its hour, its state and how sure the model was', /<title>2026-10-21 08:00 UTC quiet, 97% sure<\/title>/.test(svg) && /<title>2026-10-21 14:00 UTC no reading<\/title>/.test(svg));
ok('a less sure hour is fainter', /fill-opacity="0\.\d+"/.test(svg) && Number(svg.match(/fill-opacity="([\d.]+)"/)[1]) > Number(svg.match(/fill-opacity="([\d.]+)"/g)[5].match(/"([\d.]+)"/)[1]));
ok('no data draws nothing rather than an empty box', stripSvg([]) === '' && hourlyStripSvg(null, 24) === '' && dailyStripSvg('') === '');
const dsv = dailyStripSvg('qqq.aaq');
ok('the daily strip is one wider block per day with no tooltips', (dsv.match(/<rect/g) ?? []).length === 7 && !/<title>/.test(dsv));
const sm = summarize(e, 8);
ok('the summary counts active share and state changes over known hours only', sm.hours === 7 && sm.activeShare === 29 && sm.flips === 2 && sm.now === 'quiet' && sm.nowProb === 90);
ok('the words are plain and singular/plural correct', /active 29% of the time, changed state 2 times/.test(summaryWords(sm, 8)) && /1 time\./.test(summaryWords({ ...sm, flips: 1 }, 8)) && summaryWords(null, 8) === '');
ok('the pill says which model, the state and how sure, and never a direction', pillWords('Hourly', 'active', 71) === 'Hourly model: active, 71% sure' && !/bull|bear|up|down/i.test(pillWords('Daily', 'quiet', 97)));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
