// Synthetic test for the naked/untested level filter. No network.
//   node js/nakedLevels.test.mjs
import { nakedLevels, isNaked } from './nakedLevels.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Sessions oldest→newest. Day0 POC 100; day1 trades 101–104 (does NOT touch 100 → naked so far);
// day2 trades 99–103 (touches 100 → fills it). Day1 POC 102 later touched by day2 (99–103) → filled.
const sessions = [
  { date: 'd0', low: 98,  high: 101, poc: 100 },
  { date: 'd1', low: 101, high: 104, poc: 102 },
  { date: 'd2', low: 99,  high: 103, poc: 101 },   // most-recent completed
];

console.log('[isNaked]');
ok('d0 POC 100 filled by d2 (99–103)', isNaked(100, sessions, 0, 0) === false);
ok('d0 high 101 — d1 low is 101 (touched)', isNaked(101, sessions, 0, 0) === false);
ok('d0 low 98 never revisited → naked', isNaked(98, sessions, 0, 0) === true);
ok('d1 POC 102 filled by d2 (99–103)', isNaked(102, sessions, 1, 0) === false);
ok('d1 high 104 never revisited → naked', isNaked(104, sessions, 1, 0) === true);
// 103.8 is untouched by d2 (99–103) with no buffer, but a 1.0 buffer expands d2 to
// [98,104] → now "filled". Buffer requires a real fill, not just a graze.
ok('buffer flips a near-miss to filled', isNaked(103.8, sessions, 1, 0) === true && isNaked(103.8, sessions, 1, 1.0) === false);

console.log('[nakedLevels]');
const naked = nakedLevels(sessions, { lookback: 30, kinds: ['poc', 'high', 'low'] });
const prices = naked.map(l => l.price).sort((a, b) => a - b);
// d0 low 98 (naked) + d1 high 104 (naked) + all of d2's own levels 99/101/103
// (the most-recent completed session — fresh, nothing has filled them yet).
ok('keeps untested prior levels + the fresh most-recent session', JSON.stringify(prices) === JSON.stringify([98, 99, 101, 103, 104]),
   `got ${JSON.stringify(prices)}`);
ok('naked high tagged naked_hilo/naked_high', naked.find(l => l.price === 104)?.source === 'naked_hilo' && naked.find(l => l.price === 104)?.kind === 'naked_high');
ok('nPOC uses source npoc', naked.every(l => l.kind !== 'npoc' ? true : l.source === 'npoc'));

console.log('[keepForming excludes the still-open session]');
// With keepForming=1 the most-recent session (d2) can't fill earlier levels AND its
// own levels aren't emitted (it's still forming). d1 POC 102 now naked (only d2 could
// fill it, and d2 is excluded from the fill-scan too).
const nakedKF = nakedLevels(sessions, { keepForming: 1 });
ok('keepForming=1 → d2 levels not emitted', !nakedKF.some(l => l.date === 'd2'));

console.log('[edge cases]');
ok('empty / single session → []', nakedLevels([]).length === 0 && nakedLevels([{ date:'x', low:1, high:2, poc:1.5 }]).length === 0);
ok('missing poc skipped, high/low still work', nakedLevels([{date:'a',low:1,high:9},{date:'b',low:5,high:6}]).some(l=>l.kind==='naked_high'));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
