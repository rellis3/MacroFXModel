// Tests for js/deskSnapshot.js (the pure half of the Desk Terminal time machine). Run: node js/deskSnapshot.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_FEEDS, CORE_IDS, FULL_FEEDS, FULL_EXCLUDED, OWNER_ONLY_FEEDS, MAX_POINT_BYTES, isFxOpen, captureIntervalMs, chunkKey, fullKey, extractFeed, dueFeeds, buildCorePoint, trimPoint,
  mergeByTs, downsample, selectFields, parseFields, chooseStep, buildFullSnapshot, terminalRoutes } from './deskSnapshot.js';
import { sanitizeSnapshot } from './deskViewerView.js';
import { FIXTURES } from './deskSnapshot.fixtures.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const iso = s => Date.parse(s);

t('FX week: closed Saturday and until Sunday 21:00 UTC, open Monday to Thursday, closes Friday 22:00 UTC', () => {
  assert.equal(isFxOpen(iso('2026-11-14T12:00:00Z')), false);     // Saturday
  assert.equal(isFxOpen(iso('2026-11-15T20:59:00Z')), false);     // Sunday before the open
  assert.equal(isFxOpen(iso('2026-11-15T21:00:00Z')), true);
  assert.equal(isFxOpen(iso('2026-11-16T03:00:00Z')), true);      // Monday
  assert.equal(isFxOpen(iso('2026-11-13T21:59:00Z')), true);      // Friday before the roll
  assert.equal(isFxOpen(iso('2026-11-13T22:00:00Z')), false);
});
t('capture cadence: 5 minutes while open, 30 otherwise', () => {
  assert.equal(captureIntervalMs(iso('2026-11-16T10:00:00Z')), 5 * 60_000);
  assert.equal(captureIntervalMs(iso('2026-11-14T10:00:00Z')), 30 * 60_000);
});
t('chunk keys are UTC hours; one key per hour, not per point', () => {
  assert.equal(chunkKey(iso('2026-11-16T10:07:30Z')), 'desk_snap_core_2026-11-16T10');
  assert.equal(chunkKey(iso('2026-11-16T10:59:59Z')), 'desk_snap_core_2026-11-16T10');
  assert.equal(fullKey('2026-11-16'), 'desk_snap_full_2026-11-16');
});

// every CORE feed on a live-shaped fixture
t('every CORE feed extracts from a payload shaped like the live route, with its own asOf', () => {
  for (const spec of CORE_FEEDS) {
    const r = extractFeed(spec, { json: FIXTURES[spec.id], httpStatus: 200 });
    assert.equal(r.ok, true, `${spec.id}: ${r.why}`);
    assert.ok(r.data && typeof r.data === 'object', spec.id);
    assert.ok(r.asOf == null || typeof r.asOf === 'string', `${spec.id} asOf`);
    assert.equal(r.src, 'live');
  }
  assert.deepEqual(CORE_FEEDS.map(f => f.id), Object.keys(FIXTURES), 'a fixture for every feed and no extra');
});
t('the sections carry what the replay needs', () => {
  const x = id => extractFeed(CORE_FEEDS.find(f => f.id === id), { json: FIXTURES[id] }).data;
  assert.equal(x('stress').tiles.risk, 'ok'); assert.equal(x('stress').overall, 'watch');
  assert.deepEqual(x('risk').flags.vix_level, [0, 18.7]);
  assert.equal(x('strength').h['1D'].s.JPY, 1.17); assert.equal(x('strength').h['1D'].lead, 'JPY'); assert.ok(x('strength').h['1W'].na);
  assert.equal(x('yields').EUR.gap, -173);
  assert.equal(x('credit').csi.v, -0.89); assert.equal(x('credit').g4.phase, 'Falling');
  assert.deepEqual(x('fed').meetings[0], ['2026-12-09', 27.1, 108.5, 0]); assert.equal(x('fed').zqAsOf, '2026-11-13T21:45:00Z');
  assert.equal(x('regime').quadrant, 'reflation'); assert.equal(x('regime').corr.state, 'NORMAL');
  assert.equal(x('cb').fomc.regime, 'HAWKISH');
  assert.equal(x('desk').instruments.EURUSD.rating, 'SHORT'); assert.equal(x('desk').ccy.USD, 2); assert.equal(x('desk').tone, 'risk_off');
  assert.equal(x('curve').slopes['2s10s'][0], 24);
  assert.equal(x('vol').gauges.VIX[0], 19.3);
  assert.equal(x('watch').firing.length, 1);
});
t('no section carries a trade-level key (plan, invalidation, entry, stop, target, tp, ideas, adjustments)', () => {
  const bad = new Set(['plan', 'invalidation', 'entry', 'entries', 'stop', 'stopLoss', 'target', 'targets', 'tp', 'takeProfit', 'ideas', 'adjustments', 'riskReward', 'levels', 'zone']);
  const walk = (v, p) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!bad.has(k), `${p}.${k}`); walk(x, `${p}.${k}`); } };
  for (const spec of CORE_FEEDS) walk(extractFeed(spec, { json: FIXTURES[spec.id] }).data, spec.id);
});
t('a failed feed is a gap with the reason, never a guess', () => {
  const spec = CORE_FEEDS[0];
  assert.deepEqual(extractFeed(spec, { timedOut: true, error: 'x' }), { id: 'stress', ok: false, why: 'timeout' });
  assert.match(extractFeed(spec, { error: 'ECONNREFUSED' }).why, /^error: ECONNREFUSED/);
  assert.equal(extractFeed(spec, { json: {}, httpStatus: 502 }).why, 'HTTP 502');
  assert.equal(extractFeed(spec, { json: null, httpStatus: 200 }).why, 'empty');
  assert.match(extractFeed(spec, { json: { ok: false, error: 'no data yet' } }).why, /^not ok: no data yet/);
  assert.equal(extractFeed(spec, { json: { ok: true } }).why, 'empty');
  assert.match(extractFeed({ id: 'x', extract: () => { throw new Error('boom'); } }, { json: { a: 1 } }).why, /^extract: boom/);
});
t('slow feeds are fetched only when due; the rest are carried', () => {
  const now = 1_000_000_000_000;
  const last = { stress: { at: now - 60_000 }, desk: { at: now - 5 * 60_000 }, cb: { at: now - 31 * 60_000 } };
  const due = dueFeeds(last, now).map(f => f.id);
  assert.ok(due.includes('stress'), 'every-capture feeds are always due');
  assert.ok(!due.includes('desk'), 'desk-run is fetched every 30 minutes');
  assert.ok(due.includes('cb'), 'cb-board is due after its 30 minutes');
  assert.ok(due.includes('fed'), 'a feed never fetched is due');
});
t('a point keeps each input\'s own asOf and never re-stamps it; carried and failed inputs are visible', () => {
  const now = iso('2026-11-16T10:00:00Z');
  const live = extractFeed(CORE_FEEDS.find(f => f.id === 'yields'), { json: FIXTURES.yields });
  const carried = { ...extractFeed(CORE_FEEDS.find(f => f.id === 'desk'), { json: FIXTURES.desk }), src: 'carried' };
  const refreshFailed = { ...extractFeed(CORE_FEEDS.find(f => f.id === 'cb'), { json: FIXTURES.cb }), src: 'carried', failed: 'timeout' };
  const failed = { id: 'fed', ok: false, why: 'HTTP 502' };
  const p = buildCorePoint({ now, entries: [live, carried, refreshFailed, failed] });
  assert.equal(p.ts, now); assert.equal(p.ld, '2026-11-16'); assert.equal(p.open, true);
  assert.equal(p.inputs.yields.asOf, '2026-11-14T17:20:45.932Z'); assert.notEqual(p.inputs.yields.asOf, new Date(now).toISOString());
  assert.equal(p.inputs.desk.src, 'carried'); assert.equal(p.inputs.desk.asOf, '2026-11-13T06:57:38.645Z');
  assert.ok(p.d.cb && p.inputs.cb.src === 'carried');
  assert.deepEqual(p.gaps, [{ id: 'cb', why: 'timeout', carried: true }, { id: 'fed', why: 'HTTP 502' }]);
  assert.ok(!('fed' in p.d), 'a failed feed leaves a hole, not an old value');
});
t('London date, not UTC: a point at 23:30 UTC in summer belongs to the next London day', () => {
  const p = buildCorePoint({ now: iso('2026-07-14T23:30:00Z'), entries: [] });
  assert.equal(p.ld, '2026-07-15');
});
t('the size guard drops the cheapest sections first, records them, and never drops the core ones', () => {
  const p = buildCorePoint({ now: iso('2026-11-16T10:00:00Z'), entries: CORE_FEEDS.map(s => extractFeed(s, { json: FIXTURES[s.id] })) });
  const full = JSON.stringify(p).length;
  assert.ok(full < MAX_POINT_BYTES, `a normal point is ${full} bytes, over the budget`);
  assert.equal(trimPoint(p).trimmed.length, 0);
  const small = trimPoint(p, Math.floor(full * 0.7));
  assert.ok(small.trimmed.length > 0 && small.trimmed[0] === 'em', small.trimmed.join());
  assert.ok(small.point.trimmed.length > 0 && small.bytes <= Math.floor(full * 0.7) + 1);
  const tiny = trimPoint(p, 100);
  for (const keep of ['desk', 'stress', 'strength', 'fed', 'regime']) assert.ok(keep in tiny.point.d, `${keep} must survive`);
  assert.ok(!('em' in tiny.point.d) && !('em' in tiny.point.inputs));
  assert.ok('em' in p.d, 'the input point is not mutated');
});
t('mergeByTs, downsample, selectFields, parseFields, chooseStep', () => {
  const pt = ts => ({ v: 1, ts, ld: 'x', open: true, inputs: { desk: { asOf: 'a' }, risk: { asOf: 'b' } }, gaps: [{ id: 'risk', why: 'x' }], d: { desk: { a: 1 }, risk: { b: 2 } } });
  const m = mergeByTs([pt(3), pt(1)], [{ ...pt(3), ld: 'new' }, pt(2)]);
  assert.deepEqual(m.map(p => p.ts), [1, 2, 3]); assert.equal(m[2].ld, 'new');
  const pts = Array.from({ length: 12 }, (_, i) => pt(i * 5 * 60_000));
  assert.equal(downsample(pts, 0).length, 12);
  assert.equal(downsample(pts, 15 * 60_000).length, 4);
  assert.equal(downsample(pts, 15 * 60_000)[1].ts, 25 * 60_000, 'the last point in each bucket');
  const s = selectFields(pt(1), ['desk']);
  assert.deepEqual(Object.keys(s.d), ['desk']); assert.deepEqual(s.gaps, []); assert.deepEqual(Object.keys(s.inputs), ['desk']);
  assert.deepEqual(parseFields('desk, strength ,nope,desk'), ['desk', 'strength']); assert.deepEqual(parseFields(''), []);
  assert.equal(chooseStep(86400_000, 0, 800), 0, '24 h at 5 min is 288 points: no thinning');
  assert.equal(chooseStep(31 * 86400_000, 0, 800), 3_600_000, '31 days widened to hold at most 800 points: hourly');
  assert.equal(chooseStep(86400_000, 60, 800), 3_600_000);
});

t('FULL snapshot: gaps listed, failed feeds kept as ok:false, exclusions and owner-only feeds recorded', () => {
  const snap = buildFullSnapshot({ now: iso('2026-11-16T11:00:00Z'), deskRunDate: '2026-11-16', entries: [
    { path: 'risk-flags', json: { ok: true, flags: [] }, httpStatus: 200, ms: 40 }, { path: 'pair-select', json: null, httpStatus: 404 }, { path: 'gpr', timedOut: true }, { path: 'nowcast', json: {} }, { path: 'xccy-basis', json: { ok: false, error: 'laptop pull missing' } }] });
  assert.equal(snap.n, 5); assert.equal(snap.okN, 1); assert.equal(snap.ld, '2026-11-16'); assert.equal(snap.deskRunDate, '2026-11-16');
  assert.deepEqual(snap.gaps.map(g => [g.path, g.why.split(':')[0]]), [['pair-select', 'HTTP 404'], ['gpr', 'timeout'], ['nowcast', 'empty'], ['xccy-basis', 'not ok']]);
  assert.equal(snap.feeds['risk-flags'].ok, true); assert.equal(snap.feeds.gpr.ok, false);
  assert.ok(snap.excluded.length === FULL_EXCLUDED.length && snap.ownerOnly.includes('trade-watch'));
});
t('FULL list: no duplicates, exclusions are not also captured, owner-only feeds are captured', () => {
  assert.equal(new Set(FULL_FEEDS).size, FULL_FEEDS.length);
  for (const e of FULL_EXCLUDED) { assert.ok(e.why.length > 20, `${e.path}: say why`); assert.ok(!FULL_FEEDS.includes(e.path), `${e.path} is both captured and excluded`); }
  for (const f of OWNER_ONLY_FEEDS) assert.ok(FULL_FEEDS.includes(f), `${f} owner-only but not captured`);
});
t('every route the terminal loads is either captured in FULL or excluded with a reason (a route added to the page cannot slip past)', () => {
  const html = fs.readFileSync(path.join(root, 'desk-terminal.html'), 'utf8');
  const routes = terminalRoutes(html);
  assert.ok(routes.length > 40, `only found ${routes.length} routes in desk-terminal.html: the page changed shape, fix terminalRoutes()`);
  const known = new Set([...FULL_FEEDS.map(x => x.split('?')[0]), ...FULL_EXCLUDED.map(x => x.path)]);
  const missing = routes.map(r => r.split('?')[0]).filter(r => !known.has(r));
  assert.deepEqual(missing, [], `terminal routes neither in FULL_FEEDS nor FULL_EXCLUDED (js/deskSnapshot.js): ${missing.join(', ')}`);
});
t('every CORE and FULL feed names a route that exists, so a typo cannot become a permanent gap', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8') + fs.readFileSync(path.join(root, 'js', 'deskBoardRoutes.js'), 'utf8');
  const names = [...CORE_FEEDS.map(f => f.path), ...FULL_FEEDS].map(p => p.split('?')[0]);
  const missing = [...new Set(names)].filter(p => !src.includes(`'/api/${p}'`) && !src.includes(`"/api/${p}"`));
  assert.deepEqual(missing, [], `no route for: ${missing.join(', ')}`);
});

// what a desk viewer gets
t('a viewer\'s copy loses sizes, plans and the owner-only feeds; the owner switching a surface on brings its feed back', () => {
  const core = { ok: true, points: [{ ts: 1, d: { desk: { instruments: { EURUSD: { rating: 'SHORT', conviction: 'medium', size: 0.8 } } }, risk: { level: 'CALM' } } }] };
  const v = sanitizeSnapshot(core, () => false);
  assert.equal(v.points[0].d.desk.instruments.EURUSD.rating, 'SHORT'); assert.equal(v.points[0].d.desk.instruments.EURUSD.conviction, 'medium');
  assert.ok(!('size' in v.points[0].d.desk.instruments.EURUSD), 'size is a trade-sizing record');
  assert.equal(core.points[0].d.desk.instruments.EURUSD.size, 0.8, 'the owner copy is untouched');
  const full = { ok: true, snapshot: { feeds: { 'risk-flags': { ok: true, json: { level: 'CALM' } }, 'trade-watch': { ok: true, json: { setups: [{ entry: 1.1 }] } }, 'pair-select': { ok: true, json: { best: [] } }, 'desk-alerts': { ok: true, json: {} }, 'desk-weekly': { ok: true, json: { view: 'x', ideas: [{ entry: 1 }], plan: { zone: '1.1' } } } } } };
  const vf = sanitizeSnapshot(full, () => false);
  assert.deepEqual(Object.keys(vf.snapshot.feeds).sort(), ['desk-weekly', 'risk-flags']);
  assert.ok(!('ideas' in vf.snapshot.feeds['desk-weekly'].json) && !('plan' in vf.snapshot.feeds['desk-weekly'].json), 'trade keys are stripped');
  const on = sanitizeSnapshot(full, id => id === 'panel.ov.tradewatch');
  assert.ok('trade-watch' in on.snapshot.feeds && !('pair-select' in on.snapshot.feeds));
});
console.log(`deskSnapshot: ${n} tests passed`);
