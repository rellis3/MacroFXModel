import test from 'node:test'; import assert from 'node:assert/strict';
import { BUNDLE_FEEDS, HEAD_DRILL_KEYS, wrapBlock, buildHelixBundle, cleanRun, mergeDayRecord, watcherSummary, readRollHealth, buildStress, terrainRanges, TERRAIN_MARKETS, RECORD_MAX_BYTES } from './helixBundle.js';

const NOW = Date.parse('2026-11-27T07:30:00Z');

test('wrapBlock: as-of, stale, degraded on ok:false, too-large blocks dropped, trim applied', () => {
  const b = wrapBlock('mc', '/api/macro-changes', { ok: true, asOf: '2026-11-27T07:00:00Z', rows: [1] }, { now: NOW, prime: '/api/macro-changes' });
  assert.equal(b.asOf, '2026-11-27T07:00:00.000Z'); assert.equal(b.stale, false); assert.equal(b.degraded, false); assert.equal(b.prime, '/api/macro-changes');
  const bad = wrapBlock('xccy', '/api/xccy-basis', { ok: false, error: 'no futures pull yet' }, { now: NOW }); assert.equal(bad.degraded, true); assert.equal(bad.stale, true); assert.match(bad.error, /no futures/);
  const big = wrapBlock('x', '/api/x', { a: 'y'.repeat(50_000) }, { now: NOW }); assert.equal(big.degraded, true); assert.equal(big.data, null); assert.match(big.error, /too large/);
  const old = wrapBlock('sess', '/api/vol-forecast/session', { fetched_at: '2026-11-25T07:00:00Z' }, { now: NOW }); assert.equal(old.stale, true);
  const err = wrapBlock('a', '/api/a', null, { error: 'timed out' }); assert.equal(err.degraded, true); assert.equal(err.error, 'timed out');
});
test('every trim keeps what its reader needs and shrinks the big feeds', () => {
  const T = Object.fromEntries(BUNDLE_FEEDS.map(f => [f.id, f]));
  const brief = T.brief.trim({ ok: true, generated_at: 'g', instruments: { EURUSD: { levels: { hl_med: { pct: 0.6 }, oh_med: { pct: 1 } }, current_price: 1.1, stale: false, prev_day: { high: 2, low: 1, date: 'd', extra: 9 }, big: 'x'.repeat(5000) }, FOO: {} } });
  assert.deepEqual(brief.instruments.EURUSD, { levels: { hl_med: { pct: 0.6 } }, current_price: 1.1, stale: false, prev_day: { high: 2, low: 1, date: 'd' } }); assert.equal(brief.instruments.FOO, undefined);
  assert.deepEqual(T.sess.trim({ fetched_at: 'f', instruments: { NQ: { hl: 2.5, oc: 1 }, X: { error: 'e' } } }).instruments, { NQ: { hl: 2.5 } });
  const hr = T.hitRates.trim({ ok: true, computed_at: 'c', instruments: { EURUSD: { total_days: 65, levels: { oh_med: { hit_pct: 42, n_hits: 27 } }, daily: new Array(65).fill({ x: 1 }) } } });
  assert.deepEqual(hr.instruments.EURUSD, { days: 65, hit: { oh_med: 42 } });
  const q = T.qlike.trim({ ok: true, session: 's', levels: { EURUSD: { hl_p50: 0.512345, hl_p75: 0.7, sigma: 0.35021, arms: { hl: 'HARCJ' }, oc_p50: 1 } } });
  assert.deepEqual(q.instruments.EURUSD, { hl_p50: 0.512, hl_p75: 0.7, sigma: 0.3502, arm: 'HARCJ', asof: null });
  const fx = T.fxCarry.trim({ last: '2026-11-26', all: { sharpe: 1 }, financing: { asOf: '2026-11-27' }, haircut: { rows: [{ pair: 'AUD_USD', ccy: 'AUD', interbankDiffPct: 0.68, oandaCarryPct: -0.27, haircutPct: 0.95 }] } });
  assert.equal(fx.all, undefined, 'no backtest performance in the bundle'); assert.deepEqual(fx.carry[0], { pair: 'AUD_USD', ccy: 'AUD', interbankDiffPct: 0.68, oandaCarryPct: -0.27 });
  assert.match(T.drill.url, /keys=eurusd,.*btc&tail=60/); assert.equal(HEAD_DRILL_KEYS.length, 14);
});
test('buildHelixBundle: independent blocks, one failure is a degraded block, internal blocks included', async () => {
  const feeds = [{ id: 'a', url: '/api/a', trim: null, prime: true }, { id: 'b', url: '/api/b', trim: null }];
  const B = await buildHelixBundle({ feeds, now: () => NOW, fetchJson: async u => { if (u === '/api/b') throw new Error('HTTP 503'); return { ok: true, at: NOW }; },
    internal: { g10: async () => ({ ok: true, asOf: '2026-11-26' }), rollHealth: async () => ({ ok: false, absent: true }), stress: async () => { throw new Error('r2 down'); } } });
  assert.equal(B.blocks.a.degraded, false); assert.equal(B.blocks.a.prime, '/api/a'); assert.equal(B.blocks.b.degraded, true); assert.equal(B.blocks.b.error, 'HTTP 503');
  assert.equal(B.blocks.g10.degraded, false); assert.equal(B.blocks.g10.stale, false, 'a daily board one day old is not stale');
  assert.equal(B.blocks.rollHealth.degraded, false, 'an absent health file is not a data failure'); assert.equal(B.blocks.stress.degraded, true);
  assert.deepEqual(B.degraded, ['b', 'stress']); assert.equal(B.partial, true); assert.equal(B.ok, true);
});
test('day record: validated, clipped, merged per part', () => {
  assert.equal(cleanRun({ date: 'x' }).ok, false); assert.equal(cleanRun(null).ok, false);
  assert.match(cleanRun({ date: '2026-11-27', blob: 'x'.repeat(RECORD_MAX_BYTES) }).error, /too large/);
  const c = cleanRun({ date: '2026-11-27', part: 'morning', mode: 'quick', plan: [{ kind: 'open', title: 'T', view: 'globe', text: 'y'.repeat(5000) }], headline: { text: 'h' } }, { now: NOW });
  assert.equal(c.ok, true); assert.equal(c.run.plan[0].text.length, 2000); assert.equal(c.run.sceneCount, 1);
  let day = mergeDayRecord(null, c.date, c.part, c.run); day = mergeDayRecord(day, c.date, 'evening', { ...c.run, savedAt: 'later' }); day = mergeDayRecord(day, c.date, 'morning', c.run);
  assert.deepEqual(Object.keys(day.runs).sort(), ['evening', 'morning']); assert.deepEqual(day.count, { morning: 2, evening: 1 });
  assert.equal(mergeDayRecord(day, '2026-11-28', 'morning', c.run).count.morning, 1, 'a new day starts fresh');
  assert.equal(watcherSummary({ ok: true, lastCheck: 'c', lastAlerts: new Array(30).fill({ at: 'a', text: 't', extra: 1 }) }).alerts.length, 10); assert.equal(watcherSummary(null), null);
});
test('roll health: absent, object and array shapes, flags and roll windows', () => {
  assert.deepEqual(readRollHealth(null).absent, true);
  const h = readRollHealth({ asOf: '2026-11-27T06:00:00Z', roots: { ZN: { newestBar: '2026-11-26T21:00:00Z', bdToRoll: 1, front: 'ZNZ6', next: 'ZNH7' }, GBL: { newest_bar: 1795700000, bd_to_roll: 7, flag: true, why: 'next contract has no bars' } } }, { now: NOW });
  assert.equal(h.ok, true); assert.deepEqual(h.flagged, ['GBL']); assert.deepEqual(h.inRollWindow, ['ZN']); assert.equal(h.roots.find(x => x.root === 'ZN').ageDays, 0.4);
  const a = readRollHealth([{ root: 'DX', ok: false, flags: ['stale', 'no next'] }], { now: NOW }); assert.equal(a.roots[0].flag, true); assert.equal(a.roots[0].why, 'stale; no next');
});
test('stress line waits for 10 days, then describes today against the prior days', () => {
  const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, t: [1, 2, 3, 4, 5], c: f(i) }));
  assert.equal(buildStress({ MOVE: mk(5, () => [100, 101, 100, 102, 101]) }).series.MOVE.ok, false);
  const s = buildStress({ MOVE: mk(12, i => (i === 11 ? [100, 104, 103, 106, 105] : [100, 101, 100, 102, 101])), DXY: [] });
  assert.equal(s.ok, true); const m = s.series.MOVE; assert.equal(m.chgPct, 5); assert.equal(m.rangePct, 6); assert.equal(m.rangeVsMedian, 3); assert.equal(m.priorDays, 11); assert.equal(s.series.DXY.ok, false); assert.match(s.label, /not a signal/);
});
test('terrain ranges: completed weekdays only, missing markets listed', () => {
  const bars = { EURUSD: [{ datetime: '2026-11-25 00:00:00', high: 1.11, low: 1.1 }, { datetime: '2026-11-28 00:00:00', high: 2, low: 1 }, { datetime: '2026-11-27 00:00:00', high: 1.2, low: 1.1 }] };
  const t = terrainRanges(bars, '2026-11-27'); assert.deepEqual(t.markets.EURUSD, [['2026-11-25', 0.905]]); assert.equal(t.missing.length, TERRAIN_MARKETS.length - 1);
});
