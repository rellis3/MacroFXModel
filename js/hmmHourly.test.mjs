// Tests for js/hmmHourly.js.   node js/hmmHourly.test.mjs
import { fillDirections, dirAt, barsToReturns, hourlyState, backfill, appendReading, tail, summarise, window_, backfillAsync, lastHour, barHour, MIN_BARS } from './hmmHourly.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// seeded noise so the test is repeatable
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const H = 3.6e6, T0 = Date.parse('2026-09-01T00:00:00Z');
function series(segments) { const out = []; let p = 1.1, t = T0; for (const [n, sig] of segments) for (let i = 0; i < n; i++) { p *= Math.exp(sig * gauss()); out.push({ ms: t, c: p }); t += H; } return out; }

// gaps
const g = [{ ms: 0, c: 1 }, { ms: H, c: 1.001 }, { ms: H * 50, c: 1.5 }, { ms: H * 51, c: 1.501 }];
ok('a return that spans a weekend-sized gap is dropped, not read as a 50% move', barsToReturns(g).length === 2 && barsToReturns(g).every(r => Math.abs(r) < 0.01));

// states
const quietThenActive = series([[480, 0.0003], [120, 0.0016]]);
const a = hourlyState(quietThenActive);
ok('after a long quiet stretch and a volatile one the model reads ACTIVE, and says how sure', a && a.state === 'active' && a.prob >= 60, JSON.stringify(a));
seed = 999; const activeThenQuiet = series([[480, 0.0016], [120, 0.0003]]);
const q = hourlyState(activeThenQuiet);
ok('after volatile then calm it reads QUIET', q && q.state === 'quiet' && q.prob >= 60, JSON.stringify(q));
ok('too little history is no reading rather than a guess', hourlyState(series([[MIN_BARS - 5, 0.0005]])) === null);

// point-in-time backfill: each hour uses only bars up to itself
seed = 4242; const sw = series([[500, 0.0003], [100, 0.0016]]);
const bf = backfill(sw, 100);
ok('backfill returns one reading per hour, in order, each stamped with its own hour', bf.length === 100 && bf.every((r, i) => i === 0 || r.hour > bf[i - 1].hour) && bf.at(-1).hour === new Date(sw.at(-1).ms).toISOString().slice(0, 13));
const cut = hourlyState(sw.slice(0, sw.length - 30));
ok('a backfilled reading equals what the model said using only the bars up to that hour (no look-ahead)', cut && bf.find(r => r.hour === new Date(sw[sw.length - 31].ms).toISOString().slice(0, 13)).state === cut.state);

const bfa = await backfillAsync(sw, 20);
ok('the yielding backfill returns exactly what the plain one does', JSON.stringify(bfa) === JSON.stringify(backfill(sw, 20)));

// the store
const st = { v: 1, pairs: {} };
appendReading(st, 'EUR/USD', '2026-10-21T08', 'quiet', 97);
appendReading(st, 'EUR/USD', '2026-10-21T09', 'active', 71);
appendReading(st, 'EUR/USD', '2026-10-21T12', 'quiet', 88);   // 10 and 11 missed
ok('one character per hour, a missed run is filled with unknown', st.pairs['EUR/USD'].s === 'qa..q' && st.pairs['EUR/USD'].p.join() === '97,71,0,0,88');
appendReading(st, 'EUR/USD', '2026-10-21T12', 'active', 60);
ok('re-running an hour overwrites it and never adds a duplicate', st.pairs['EUR/USD'].s === 'qa..a' && st.pairs['EUR/USD'].p.at(-1) === 60);
const t = tail(st, 'EUR/USD', 3);
ok('tail returns the last hours with their stamps and null for unknown ones', t.length === 3 && t[0].hour === '2026-10-21T10' && t[0].state === null && t[2].state === 'active');
const wd = window_(st, 'EUR/USD', 3);
ok('the endpoint window keeps the last hours, their start stamp and their sureness', wd.s === '..a' && wd.t0 === '2026-10-21T10' && wd.p.join() === '0,0,60' && window_(st, 'NOPE', 3) === null);
ok('lastHour reads the stored end of a pair, so a run can skip an hour it already has', lastHour(st, 'EUR/USD') === '2026-10-21T12' && lastHour(st, 'NOPE') === null && barHour(Date.parse('2026-10-21T12:00:00Z')) === '2026-10-21T12');
const big = { v: 1, pairs: {} }; for (let i = 0; i < 30; i++) appendReading(big, 'X', new Date(Date.parse('2026-01-01T00:00:00Z') + i * H).toISOString().slice(0, 13), 'quiet', 90, { keep: 10 });
ok('the log keeps only its window and moves its start hour with it', big.pairs.X.s.length === 10 && big.pairs.X.t0 === '2026-01-01T20');
const sm = summarise([{ state: 'quiet', prob: 90 }, { state: 'active', prob: 70 }, { state: null }, { state: 'active', prob: 80 }, { state: 'quiet', prob: 60 }]);
ok('the summary counts active hours and state changes over known hours only', sm.hours === 4 && sm.activeHours === 2 && sm.flips === 2 && sm.now.state === 'quiet');
ok('an empty log summarises to nothing', summarise([]) === null && tail({ pairs: {} }, 'Y', 5).length === 0);

{ const cs = [{ ms: 0, c: 1 }, { ms: 3.6e6, c: 1.1 }, { ms: 7.2e6, c: 1.0 }, { ms: 7.2e6 + 10 * 3.6e6, c: 1.2 }];
  ok('dirAt says what the hour did: up, down, and unknown across a gap', dirAt(cs, 1) === 'u' && dirAt(cs, 2) === 'd' && dirAt(cs, 3) === '.' && dirAt(cs, 0) === '.');
  const s2 = { pairs: {} }; appendReading(s2, 'X', '2026-10-21T08', 'active', 90, { dir: 'u' }); appendReading(s2, 'X', '2026-10-21T10', 'quiet', 80, { dir: 'd' });
  ok('direction is kept one character per hour, with gaps unknown', s2.pairs.X.d === 'u.d' && s2.pairs.X.d.length === s2.pairs.X.s.length && window_(s2, 'X', 2).d === '.d');
  const old = { pairs: { Y: { t0: '2026-10-21T08', s: 'qa', p: [90, 80] } } }; appendReading(old, 'Y', '2026-10-21T10', 'active', 70, { dir: 'd' });
  ok('a log written before direction existed is padded, not broken', old.pairs.Y.d === '..d' && window_(old, 'Y', 3).d === '..d'); }
{ const cs = Array.from({ length: 6 }, (_, i) => ({ ms: Date.parse('2026-10-21T08:00:00Z') + i * 3.6e6, c: [1, 1.1, 1.0, 1.0, 0.9, 1.2][i] }));
  const sx = { pairs: { Z: { t0: '2026-10-21T08', s: 'qaaqa.', p: [9, 9, 9, 9, 9, 0], d: '......' } } };
  const n = fillDirections(sx, 'Z', cs);
  ok('directions are filled in for hours logged before they were kept, from the price history', sx.pairs.Z.d === '.udfd.' && n === 4, sx.pairs.Z.d); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
