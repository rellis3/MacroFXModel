import assert from 'node:assert/strict';
import { slimDefault, sliceFeed, SLICES } from './deskSlices.js';
import { DESK_FEEDS, DESK_INSTRUMENT_FEEDS } from './deskPack.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('every hand-written slice names a real pack feed (a typo would silently fall back to the default cut)', () => {
  const ids = new Set([...DESK_FEEDS.map(f => f.id), ...DESK_INSTRUMENT_FEEDS.map(f => f.base)]);
  for (const k of Object.keys(SLICES)) assert.ok(ids.has(k), `slice ${k} matches no feed`);
});

t('slimDefault drops bulk keys, shortens arrays and strings, caps depth', () => {
  const out = slimDefault({ series: [1, 2], history: {}, keep: 'x'.repeat(700), rows: Array.from({ length: 20 }, (_, i) => i), a: { b: { c: { d: { e: 1 } } } } });
  assert.ok(!('series' in out) && !('history' in out));
  assert.ok(out.keep.length < 650);
  assert.deepEqual(out.rows, [12, 13, 14, 15, 16, 17, 18, 19]);
  assert.equal(out.a.b.c.d, '{…}');
  assert.deepEqual(slimDefault({ rows: [1, 2, 3] }, { maxArray: 2, keep: 'first' }).rows, [1, 2]);
});

t('vol-forecast keeps every instrument but only the morning fields', () => {
  const inst = { vol_annual: 6.2, vol_pct: 70, hl_median: 0.61, har: { big: 1 }, ladder: { x: 1 }, oc_75: 0.49 };
  const d = { session_date: '2026-11-03', meta: { news_flag: null }, instruments: { EURUSD: inst, GOLD: inst, NQ: inst } };
  const s = sliceFeed('vol-forecast', d);
  assert.deepEqual(Object.keys(s.instruments), ['EURUSD', 'GOLD', 'NQ']);
  assert.deepEqual(s.instruments.EURUSD, { vol_annual: 6.2, vol_pct: 70, hl_median: 0.61, oc_75: 0.49 });
});

t('instrument feeds use their base slice; central-bank reads drop the document diff', () => {
  const sm = sliceFeed('swing-map:EURUSD', { state: { a: 1 }, series: [1], legs: [1], pull: { p: 1 }, expiries: [1, 2, 3, 4, 5, 6, 7] });
  assert.deepEqual(Object.keys(sm).sort(), ['expiries', 'pull', 'state']);
  assert.equal(sm.expiries.length, 5);
  const cb = sliceFeed('ecb/latest', { kind: 'meeting', meetingDate: '2026-10-29', analysis: { tone: 'hawkish' }, diffSegments: [1, 2, 3], generatedAt: 'g' });
  assert.ok(!('diffSegments' in cb)); assert.equal(cb.analysis.tone, 'hawkish');
});

t('daily-read hands over today only; a slice that throws falls back to the default cut', () => {
  const s = sliceFeed('daily-read', { days: { '2026-11-02': { a: 1 }, '2026-11-03': { b: 2 } }, tally: { t: 1 }, tags: {} });
  assert.equal(s.day, '2026-11-03'); assert.deepEqual(s.today, { b: 2 });
  assert.deepEqual(sliceFeed('events', null), []);
  assert.deepEqual(sliceFeed('liquidity-pulse/data', { stats: { r: 1 } }).recent, []);
  assert.deepEqual(sliceFeed('no-such-feed', { series: [1], v: 2 }), { v: 2 });
});

console.log(`deskSlices: ${n} tests passed`);
