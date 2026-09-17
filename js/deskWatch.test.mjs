// Synthetic tests for js/deskWatch.js. No network, no clock.   node js/deskWatch.test.mjs
import { evaluateTriggers, diffStates, formatTelegram } from './deskWatch.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const days = (vals, end = '2026-09-16') => vals.map((v, i) => ({ date: new Date(Date.parse(end) - (vals.length - 1 - i) * 864e5).toISOString().slice(0, 10), value: v }));
const NOW = Date.parse('2026-09-17T09:00:00Z');

console.log('[evaluateTriggers]');
{
  const t = evaluateTriggers({ now: NOW,
    fred: { vix: { value: 21 }, vix3m: { value: 19 }, us2y: { value: 4.65 }, us10y: { value: 4.97 }, us30y: { value: 5.1 }, hy: { value: 2.7 } },
    hist: { vix: days([18, 18, 20, 21]), vix3m: days([19, 19, 19, 19]), us2y: days([4.40, 4.45, 4.50, 4.55, 4.60, 4.65]), bei: days(Array(20).fill(2.36)) },
    series: { nq: days([100, 99, 98, 98, 97, 98.5]), oil: days([...Array(20).fill(90), 104]) },
    chain: [{ id: 'real-dxy', short: 'real yields → dollar', textbook: 'Higher real yields pull capital in', verdict: 'broken', expected: 'up', a: { label: 'Real yield', text: '+15bp' }, b: { label: 'Dollar', text: '-0.7%' }, punch: 'Paid more, not buying the dollar.' }, { id: 'oil-bei', short: 'oil → inflation pricing', textbook: 'x', verdict: 'quiet', a: {}, b: {} }],
    stockBond: { corr: 0.35, asOf: '2026-09-16' },
    events: [{ country: 'GB', event: 'Official Bank Rate', impact: 'high', ms: NOW + 2 * 3600e3, estimate: '3.75%' }, { country: 'US', event: 'CPI m/m', impact: 'high', ms: NOW + 30 * 3600e3 }],
    fomcDates: ['2026-09-16'] });
  const by = Object.fromEntries(t.map(x => [x.id, x]));
  ok('VIX inversion fires with the day count (2 days ≥ 3m)', by['vix-inversion'].firing && by['vix-inversion'].value.dayN === 2 && /\+0\.82 on Nasdaq/.test(by['vix-inversion'].detail));
  ok('Nasdaq down-week fires (−1.5%)', by['nq-down-week'].firing && by['nq-down-week'].value.wk < -1);
  ok('validated release fires for GB rate decision → GBP/USD; CPI 30h out is not counted', by['event-range'].firing && by['event-range'].instruments.includes('GBPUSD') && !/CPI/.test(by['event-range'].detail));
  ok('front-end shock fires at +25bp and says FX ran calmer', by['front-end-shock'].firing && /calmer/.test(by['front-end-shock'].detail));
  ok('2s10s not inverted, 2s30s not inverted', !by['curve-2s10s'].firing && !by['curve-2s30s'].firing);
  ok('stocks and bonds together fires at +0.35', by['stock-bond-together'].firing);
  ok('VIX above 20 fires; HY under 4 does not', by['vix-20'].firing && !by['hy-400'].firing);
  ok('a broken chain link becomes a trigger; a quiet one does not fire', by['chain-real-dxy'].firing && by['chain-oil-bei'] && !by['chain-oil-bei'].firing);
  ok('oil moved without breakevens fires (+15.6% vs 0bp)', by['oil-without-breakevens'].firing);
  ok('FOMC window fires the day after', by['fomc-window'].firing && /yesterday/.test(by['fomc-window'].detail));
  ok('every trigger has a kind, label and detail; nothing mentions direction', t.every(x => ['tested', 'described'].includes(x.kind) && x.label && x.detail) && t.every(x => !/goes (up|down)|will rise|will fall/i.test(x.detail)));
  ok('missing inputs disable triggers rather than throwing', evaluateTriggers({}).length === 2 && evaluateTriggers({}).every(x => !x.firing));
}

console.log('[diffStates + formatTelegram]');
{
  const prev = [{ id: 'a', firing: true }, { id: 'b', firing: false }, { id: 'c', firing: true }];
  const curr = [{ id: 'a', firing: true, kind: 'tested', label: 'A', detail: 'still' }, { id: 'b', firing: true, kind: 'tested', label: 'B', detail: 'started <now>' }, { id: 'c', firing: false, kind: 'described', label: 'C', detail: 'cleared' }, { id: 'd', firing: true, kind: 'described', label: 'D', detail: 'new' }];
  const d = diffStates(prev, curr);
  ok('started = newly firing (b, d); stopped = c; a unchanged is silent', d.started.map(x => x.id).join() === 'b,d' && d.stopped.map(x => x.id).join() === 'c');
  const msg = formatTelegram(d, new Date('2026-09-17T09:05:00Z'));
  ok('message carries both, escapes HTML, marks tested vs described', /09:05 UTC/.test(msg) && /✓ <b>B<\/b>/.test(msg) && /started &lt;now&gt;/.test(msg) && /~ <b>D<\/b>/.test(msg) && /C — cleared/.test(msg));
  ok('two starts in one pass get the domino line', /read them together/.test(msg));
  ok('no transitions -> empty string', formatTelegram(diffStates(curr, curr)) === '');
  ok('first ever pass: everything firing counts as started', diffStates([], curr).started.length === 3);
}
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
