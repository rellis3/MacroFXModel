// node js/signalJournal.test.mjs
import { detectTouches, scoreTouch, touchOdds, guidance, hourBucket, yieldEvents, formatDigest, formatYield } from './signalJournal.js';

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fail++; };

// a London session (2026-01-14, GMT so London = UTC): 5-min bars from 00:00, rising 0.01% per bar, then falling after 16:00
const t0 = Date.UTC(2026, 0, 14, 0, 0) / 1000;
const bars = [];
let px = 1.1;
for (let i = 0; i < 264; i++) {
  const h = i / 12, step = h < 16 ? 0.0001 : -0.00015;
  const o = px; px = px * (1 + step);
  bars.push({ t: t0 + i * 300, open: o, close: px, high: Math.max(o, px), low: Math.min(o, px) });
}
const ladder = { oh: { p50: 0.3, p75: 0.6, p90: 0.9 }, ol: { p50: 0.3, p75: 0.6, p90: 0.9 } };
const T = detectTouches('EURUSD', bars, 1.1, ladder);
ok('detects up touches in order', T.length === 3 && T.every(x => x.side === 'up') && T[0].rung === 'p50' && T[2].rung === 'p90');
ok('touch time is the first bar through the line', T[0].level === 1.1 * 1.003 && bars.find(b => b.t === T[0].t).high >= T[0].level);
ok('next level set for p50/p75, none for p90', T[0].nextLevel != null && T[2].nextLevel == null);
ok('odds attached', T[0].odds.reach > 0 && T[0].odds.final > 0 && typeof T[0].guidance === 'string');

const S = scoreTouch(T[0], bars);
ok('p50 touch later reached p75', S.reached === true);
ok('an early touch was not the day high', S.final === false);
const hiTouch = { ...T[2] };                                 // p90 at ~09:00, day high at ~16:00
ok('top rung scores reached = null', scoreTouch(hiTouch, bars).reached === null);

ok('hour buckets', hourBucket(3.5) === '00-07' && hourBucket(10) === '08-12' && hourBucket(15.9) === '13-16' && hourBucket(19) === '17-20' && hourBucket(21.2) === '21-22');
const lateMajor = touchOdds('EURUSD', 'p75', 20.5);
ok('late touch: high final odds -> take-profit guidance', lateMajor.final >= 0.5 && guidance(lateMajor).startsWith('late extreme'));
const earlyMajor = touchOdds('EURUSD', 'p75', 9);
ok('morning touch: reach >= 45% -> goes on', earlyMajor.reach >= 0.45 && guidance(earlyMajor) === 'more often goes on than not');
ok('classes map', touchOdds('GOLD', 'p50', 10).cls === 'gold' && touchOdds('NQ', 'p50', 10).cls === 'indices' && touchOdds('EURJPY', 'p50', 10).cls === 'fx_crosses');

const sig = { eurusd: { label: 'EURUSD', z: 2.3 }, usdjpy: { label: 'USDJPY', z: 1.2 }, gbpusd: { label: 'GBPUSD', z: 1.4 } };
const pos = { GBPUSD: { dir: 'LONG', entry: 1.3, entryDate: '2026-01-02' } };
const E = yieldEvents(sig, pos, { EURUSD: 1.1, USDJPY: 150, GBPUSD: 1.31 }, () => 5, s => (s.z > 0 ? 'SHORT' : 'LONG'));
ok('entry when |z| >= 2 and flat', E.some(e => e.kind === 'entry' && e.label === 'EURUSD' && e.dir === 'SHORT'));
ok('no entry below 2', !E.some(e => e.label === 'USDJPY'));
ok('exit when |z| <= 1.5', E.some(e => e.kind === 'exit' && e.label === 'GBPUSD'));
const E2 = yieldEvents({ gbpusd: { label: 'GBPUSD', z: 1.9 } }, pos, { GBPUSD: 1.31 }, () => 20, () => 'LONG');
ok('exit after 20 days held', E2.length === 1 && E2[0].kind === 'exit' && /20 days/.test(E2[0].reason));

ok('digest text', /EURUSD/.test(formatDigest(T)) && formatDigest([]) === null);
ok('yield text', /ENTRY — EURUSD SHORT/.test(formatYield(E.find(e => e.kind === 'entry'))) && /EXIT — GBPUSD/.test(formatYield(E.find(e => e.kind === 'exit'))));

console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
