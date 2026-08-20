// Synthetic tests for gprEngine.js. No network.
//   node js/gprEngine.test.mjs
import { gprScore, GPR_LOOKBACK_DAYS } from './gprEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const dayStr = i => {
  const d = new Date('2024-01-01T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};

console.log('[gprScore — not enough history -> null, not a crash]');
{
  const rows = Array.from({ length: 10 }, (_, i) => ({ date: dayStr(i), gprdMa30: 100 }));
  ok('short history -> null', gprScore(rows) === null);
  ok('empty/undefined -> null', gprScore([]) === null && gprScore(undefined) === null);
}

console.log('[gprScore — flat baseline, calm ending -> z near 0]');
{
  const rows = Array.from({ length: 800 }, (_, i) => ({ date: dayStr(i), gprdMa30: 100 + (i % 5 === 0 ? 0.5 : 0) }));
  const r = gprScore(rows);
  ok('level reported near baseline', Math.abs(r.level - 100) < 5, r.level);
  ok('z small in a flat regime', Math.abs(r.z) < 1, r.z);
  ok('trend flat', r.trend === 'flat', r.trend);
}

console.log('[gprScore — sharp spike at the end -> elevated z, rising trend]');
{
  const rows = Array.from({ length: 800 }, (_, i) => ({ date: dayStr(i), gprdMa30: 90 + Math.sin(i / 30) * 5 }));
  // Spike the last 30 days sharply above the 2yr baseline.
  for (let i = rows.length - 30; i < rows.length; i++) rows[i].gprdMa30 = 200;
  const r = gprScore(rows);
  ok('z strongly positive for the spike', r.z > 2, r.z);
  ok('trend rising', r.trend === 'rising', r.trend);
  ok('asOfDate is the last row date', r.asOfDate === dayStr(799), r.asOfDate);
}

console.log('[gprScore — unsorted input still works (sorts internally)]');
{
  const rows = Array.from({ length: 800 }, (_, i) => ({ date: dayStr(i), gprdMa30: 100 }));
  rows[rows.length - 1].gprdMa30 = 300;   // most-recent day, spiked
  const shuffled = rows.slice().sort(() => Math.random() - 0.5);
  const r = gprScore(shuffled);
  ok('picks the chronologically-latest row as "latest", not array order', r.level === 300, r.level);
}

console.log('[gprScore — NaN/missing entries filtered, not propagated]');
{
  const rows = Array.from({ length: 800 }, (_, i) => ({ date: dayStr(i), gprdMa30: i % 7 === 0 ? null : 100 }));
  const r = gprScore(rows);
  ok('no crash, finite output', Number.isFinite(r.level) && Number.isFinite(r.z));
}

console.log('[GPR_LOOKBACK_DAYS — sane constant]');
ok('~2 years of daily data', GPR_LOOKBACK_DAYS === 730);

console.log(failures === 0 ? '\nALL PASSED ✓' : `\n${failures} FAILURE(S) ✗`);
process.exit(failures === 0 ? 0 : 1);
