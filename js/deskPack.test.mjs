import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESK_FEEDS, DESK_SKILLS, expandFeeds, findAsOf, toMs, isEmptyPayload, slimPayload, packEntry, buildDeskPack,
  packForSkill, packSummary, upsertIndex, indexRow, shouldBuild, londonDate, allInstruments, instrumentLegs, groupOf,
  DESK_SUBSETS, DESK_CCYS, DESK_EXTRA_CCYS, packFresh,
} from './deskPack.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const NOW = Date.parse('2026-11-03T06:45:00Z');
const feed = (over = {}) => ({ id: 'x', skill: 'rates_cb', path: 'x', maxAgeH: 24, ...over });

t('every feed names a known skill, and every skill has a feed', () => {
  const ids = new Set(DESK_SKILLS.map(s => s.id));
  const all = expandFeeds();
  for (const f of all) assert.ok(ids.has(f.skill), `${f.id} -> unknown skill ${f.skill}`);
  for (const s of DESK_SKILLS) assert.ok(all.some(f => f.skill === s.id), `${s.id} has no feed`);
});

t('skills run in the owner\'s order: global, then currency, then asset, then evidence', () => {
  const rank = { global: 0, currency: 1, asset: 2, evidence: 3 };
  const layers = DESK_SKILLS.map(s => rank[s.layer]);
  assert.deepEqual(layers, [...layers].sort((a, b) => a - b));
});

t('the universe is every instrument the vol forecast covers, each in exactly one group', () => {
  const src = fs.readFileSync(path.join(root, 'js/volForecastScheduler.js'), 'utf8');
  const block = src.slice(src.indexOf('export const INSTRUMENTS = ['), src.indexOf('];', src.indexOf('export const INSTRUMENTS = [')));
  const names = [...block.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(names.length >= 51, String(names.length));
  for (const x of ['GBPNZD', 'AUDNZD', 'AUDCHF', 'NZDCHF', 'CADCHF', 'CHFJPY', 'EURNOK', 'EURSEK', 'USDNOK', 'USDSEK']) assert.equal(groupOf(x), 'fx_crosses', x);
  assert.deepEqual([...allInstruments()].sort(), [...names].sort(), 'js/deskPack.js DESK_UNIVERSE has drifted from the vol forecast\'s INSTRUMENTS');
  assert.equal(new Set(allInstruments()).size, allInstruments().length);
});

t('instrumentLegs: FX = base and quote; indices = home currency; commodities and crypto = USD; every leg is one of the 8 or NOK/SEK', () => {
  assert.deepEqual(instrumentLegs('EURJPY'), ['EUR', 'JPY']);
  assert.deepEqual(instrumentLegs('DE30'), ['EUR']);
  assert.deepEqual(instrumentLegs('UK100'), ['GBP']);
  assert.deepEqual(instrumentLegs('WHEAT'), ['USD']);
  assert.deepEqual(instrumentLegs('BTCUSD'), ['USD']);
  assert.equal(instrumentLegs('XYZ'), null);
  assert.deepEqual(instrumentLegs('EURNOK'), ['EUR', 'NOK']);
  assert.deepEqual(instrumentLegs('USDSEK'), ['USD', 'SEK']);
  for (const i of allInstruments()) for (const c of instrumentLegs(i)) assert.ok(DESK_CCYS.includes(c) || DESK_EXTRA_CCYS.includes(c), `${i} -> ${c}`);
  assert.ok(!DESK_EXTRA_CCYS.some(c => DESK_CCYS.includes(c)), 'NOK/SEK are traded, not debated');
  assert.equal(groupOf('GBPJPY'), 'fx_crosses');
});

t('expandFeeds: swing-map and TDE only for the instruments those routes serve, ids unique', () => {
  const all = expandFeeds();
  assert.equal(all.filter(f => f.id.startsWith('swing-map:')).length, DESK_SUBSETS.swingMap.length);
  for (const x of [...DESK_SUBSETS.swingMap, ...DESK_SUBSETS.tde]) assert.ok(allInstruments().includes(x), x);
  const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const sm = srv.slice(srv.indexOf('const SWING_MAP_INSTRUMENTS = {'), srv.indexOf('};', srv.indexOf('const SWING_MAP_INSTRUMENTS = {')));
  assert.deepEqual([...sm.matchAll(/(\w+): \{ oanda/g)].map(m => m[1]).sort(), [...DESK_SUBSETS.swingMap].sort(), 'swingMap subset drifted from SWING_MAP_INSTRUMENTS');
  assert.ok(all.some(f => f.path === 'trade-decision/state/eurusd'));
  assert.ok(!all.some(f => f.path === 'trade-decision/state/gold'));
  assert.equal(new Set(all.map(f => f.id)).size, all.length);
});

t('every fixed feed path is a route server.js actually serves (catches a typo before it becomes a permanent gap)', () => {
  const src = ['server.js', 'js/dailyReadRoutes.js', 'js/surfaceLabRoutes.js'].map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
  const banks = /app\.get\(`\/api\/\$\{key\}\/latest`/.test(src);
  for (const f of DESK_FEEDS) {
    const p = f.path.replace(/\?.*$/, '');
    if (/^(fomc|ecb|boe|boj|boc|rba|rbnz|snb|beigebook)\/latest$/.test(p) && banks) continue;
    assert.ok(src.includes(`'/api/${p}'`) || src.includes(`\`/api/${p}\``), `no route for /api/${p}`);
  }
  assert.ok(!DESK_FEEDS.some(f => f.path.startsWith('desk-pack')), 'the pack must never fetch itself');
  assert.ok(!DESK_FEEDS.some(f => f.id === 'cot'), '/api/cot hits CFTC on every call; use cot-state');
});

t('toMs: ISO strings, ms and seconds; rejects non-dates', () => {
  assert.equal(toMs('2026-11-02'), Date.parse('2026-11-02'));
  assert.equal(toMs('2026-10'), Date.parse('2026-10-01'));
  assert.equal(toMs(1_700_000_000), 1_700_000_000_000);
  assert.equal(toMs(1_700_000_000_000), 1_700_000_000_000);
  assert.equal(toMs('Tue 03:30'), null);
  assert.equal(toMs(true), null);
  assert.equal(toMs(-5), null);
});

t('findAsOf: top level first, then the newest one level down, future dates ignored', () => {
  assert.equal(findAsOf({ asOf: '2026-11-02T20:00:00Z', x: { updatedAt: '2026-11-03' } }, NOW).key, 'asOf');
  const nested = findAsOf({ EURUSD: { date: '2026-10-30' }, GBPUSD: { date: '2026-11-02' } }, NOW);
  assert.equal(nested.key, 'GBPUSD.date');
  assert.equal(findAsOf({ date: '2026-12-25' }, NOW), null, 'a far-future date is a calendar entry, not an as-of');
  assert.equal(findAsOf([{ date: '2026-10-01' }, { date: '2026-11-01' }], NOW).ms, Date.parse('2026-11-01'));
  assert.equal(findAsOf({ value: 3 }, NOW), null);
});

t('isEmptyPayload: null, {}, [], ok:false and all-empty fields are gaps; real content is not', () => {
  for (const v of [null, {}, [], { ok: false, error: 'no data' }, { ok: true, rows: [], meta: {} }, '']) assert.ok(isEmptyPayload(v), JSON.stringify(v));
  for (const v of [{ ok: true, value: 0 }, [1], { rows: [1] }, { flag: false }]) assert.ok(!isEmptyPayload(v), JSON.stringify(v));
});

t('slimPayload: keeps the most recent items (or the first for calendars) and records every cut', () => {
  const series = Array.from({ length: 100 }, (_, i) => i);
  const { data, truncated } = slimPayload({ s: series, note: 'x'.repeat(5000) }, { maxArray: 10 });
  assert.deepEqual(data.s, series.slice(-10));
  assert.ok(data.note.length < 4100);
  assert.deepEqual(truncated.map(c => c.path).sort(), ['note', 's']);
  assert.deepEqual(slimPayload({ s: series }, { maxArray: 10, keep: 'first' }).data.s, series.slice(0, 10));
});

t('packEntry: ok, stale, empty, error, timeout', () => {
  const fresh = packEntry(feed(), { json: { asOf: '2026-11-03T05:00:00Z', v: 1 }, httpStatus: 200, ms: 12 }, NOW);
  assert.equal(fresh.status, 'ok'); assert.equal(fresh.ageH, 1.8);
  assert.equal(packEntry(feed(), { json: { asOf: '2026-10-20', v: 1 }, httpStatus: 200 }, NOW).status, 'stale');
  assert.equal(packEntry(feed({ maxAgeH: null }), { json: { asOf: '2026-01-01', v: 1 }, httpStatus: 200 }, NOW).status, 'ok', 'maxAgeH null = freshness not judged');
  const undated = packEntry(feed(), { json: { v: 1 }, httpStatus: 200 }, NOW);
  assert.equal(undated.status, 'ok'); assert.equal(undated.asOf, null);
  const empty = packEntry(feed(), { json: { ok: false, error: 'odds not loaded' }, httpStatus: 200 }, NOW);
  assert.equal(empty.status, 'empty'); assert.equal(empty.error, 'odds not loaded');
  assert.equal(packEntry(feed(), { json: { ok: false, reason: 'no_oanda_key', message: 'needs Oanda' }, httpStatus: 200 }, NOW).error, 'needs Oanda');
  assert.equal(packEntry(feed(), { json: { error: 'boom' }, httpStatus: 500 }, NOW).status, 'error');
  assert.equal(packEntry(feed(), { error: 'ECONNREFUSED' }, NOW).status, 'error');
  assert.equal(packEntry(feed(), { timedOut: true }, NOW).status, 'timeout');
});

t('packEntry: a payload too big even after the second cut keeps only its shape', () => {
  const huge = { blob: Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [`k${i}`, 'v'.repeat(100)])) };
  const e = packEntry(feed(), { json: huge, httpStatus: 200 }, NOW, { maxBytes: 50_000 });
  assert.equal(e.status, 'oversize'); assert.equal(e.data, null); assert.equal(e.shape.type, 'object');
  assert.notEqual(packEntry(feed({ maxBytes: 2_000_000 }), { json: huge, httpStatus: 200 }, NOW).status, 'oversize', 'a feed can carry its own size allowance');
});

t('buildDeskPack: grouped by skill in layer order, health counts and gaps add up', () => {
  const feeds = expandFeeds();
  const results = feeds.map((f, i) => ({ feed: f, result: i % 10 === 0 ? { error: 'down' } : { json: { asOf: '2026-11-03T06:00:00Z', v: i }, httpStatus: 200, ms: 5 } }));
  const pack = buildDeskPack(results, { now: NOW, startedAt: NOW - 9000, trigger: 'schedule' });
  assert.equal(pack.date, '2026-11-03');
  assert.equal(pack.buildMs, 9000);
  assert.deepEqual(Object.keys(pack.skills), DESK_SKILLS.map(s => s.id));
  assert.equal(pack.health.total, feeds.length);
  assert.equal(pack.health.error, Math.ceil(feeds.length / 10));
  assert.equal(pack.health.gaps.length, pack.health.total - pack.health.ok);
  const one = packForSkill(pack, 'rates_cb');
  assert.equal(one.layer, 'currency'); assert.ok(one.feeds['fed-path']);
  assert.equal(packForSkill(pack, 'nope'), null);
  const sum = packSummary(pack);
  assert.equal(Object.keys(sum.feeds).length, feeds.length);
  assert.ok(!('data' in sum.feeds['fed-path']));
});

t('index: one row per day, replaced on rebuild, newest last, capped', () => {
  const pack = buildDeskPack([], { now: NOW });
  let idx = upsertIndex([], indexRow(pack, 100));
  idx = upsertIndex(idx, { ...indexRow(pack, 200) });
  assert.equal(idx.length, 1); assert.equal(idx[0].storedBytes, 200);
  idx = upsertIndex(idx, { date: '2026-11-02' });
  assert.deepEqual(idx.map(r => r.date), ['2026-11-02', '2026-11-03']);
  assert.equal(upsertIndex(idx, { date: '2026-11-04' }, 2).length, 2);
});

t('shouldBuild: London weekdays from 06:40, once a day, across the clock change', () => {
  assert.equal(shouldBuild(Date.parse('2026-11-03T06:39:00Z'), null), false);        // GMT in November
  assert.equal(shouldBuild(Date.parse('2026-11-03T06:40:00Z'), null), true);
  assert.equal(shouldBuild(Date.parse('2026-11-03T09:00:00Z'), '2026-11-03'), false);
  assert.equal(shouldBuild(Date.parse('2026-11-07T09:00:00Z'), null), false);         // Saturday
  assert.equal(shouldBuild(Date.parse('2026-07-01T05:45:00Z'), null), true);          // 06:45 BST
  assert.equal(shouldBuild(Date.parse('2026-07-01T05:30:00Z'), null), false);         // 06:30 BST
  assert.equal(londonDate(Date.parse('2026-07-01T23:30:00Z')), '2026-07-02');
});

t('packFresh: rebuild a pack that is old, from another day, or from an older feed list', () => {
  const now = Date.parse('2026-11-03T13:00:00Z');
  const mk = at => buildDeskPack(expandFeeds().map(f => ({ feed: f, result: { json: { asOf: '2026-11-03T06:00:00Z', v: 1 }, httpStatus: 200 } })), { now: at });
  assert.equal(packFresh(mk(now - 30 * 60_000), now).fresh, true);
  assert.match(packFresh(mk(Date.parse('2026-11-03T04:46:00Z')), now).reason, /minutes old/);
  assert.match(packFresh(mk(Date.parse('2026-11-02T12:50:00Z')), now).reason, /pack is for 2026-11-02/);
  const p = mk(now); const [skill] = Object.keys(p.skills); const [id] = Object.keys(p.skills[skill].feeds); delete p.skills[skill].feeds[id];
  assert.match(packFresh(p, now).reason, /feed list changed/);
  assert.equal(packFresh(null, now).fresh, false);
});

console.log(`deskPack: ${n} tests passed`);
