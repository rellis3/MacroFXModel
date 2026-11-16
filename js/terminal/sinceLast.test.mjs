// js/terminal/sinceLast.test.mjs: "Since you last looked" (pure comparison, point picking, ranges, the card, the build over a stand-in fetch, the command and the wiring).
// node --test js/terminal/sinceLast.test.mjs. It does NOT prove the look or the feel in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../sinceLastCore.js';
import { cardHtml, build, pointAt, readLastLook, writeLastLook } from './sinceLast.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';

const T0 = Date.parse('2026-11-16T09:00:00Z'), T1 = Date.parse('2026-11-16T13:00:00Z');
const mk = (ts, over = {}) => ({ ts, d: {
  stress: { overall: 'ok', score: 1, tiles: { risk: 'ok', credit: 'watch', funding: 'ok' } },
  risk: { level: 'CALM', active: 0, available: 5, flags: { vix_level: [0, 18.0], hy_speed: [0, -10] } },
  strength: { h: { '4H': { lead: 'USD', lag: 'CHF', spread: 2, s: { USD: 1.0, CHF: -1.0, EUR: 0.2 } }, '1D': { lead: 'USD', lag: 'CHF', spread: 2, s: { USD: 1.5, CHF: -1.5, EUR: 0.1 } } } },
  fed: { meetings: [['2026-12-09', 20, 80, 0]] }, regime: { quadrant: 'goldilocks', qName: 'Goldilocks', corr: { state: 'NORMAL' } },
  cb: { boe: { date: '2026-09-17', regime: 'HAWKISH', score: 0.55 } }, curve: { slopes: { '2s10s': [24, 0, 0, 50, '2026-11-12'] } },
  vol: { gauges: { VIX: [18, 60, 0, '2026-11-13'] } }, termprem: { value: 0.87 }, market: { name: 'Quiet' }, ...over }, gaps: [] });
const A = mk(T0), B = mk(T1, {
  stress: { overall: 'watch', score: 3, tiles: { risk: 'ok', credit: 'stress', funding: 'watch' } },
  risk: { level: 'CALM', active: 1, available: 5, flags: { vix_level: [1, 21.5], hy_speed: [0, -10] } },
  strength: { h: { '4H': { lead: 'EUR', lag: 'CHF', spread: 2.5, s: { USD: 0.2, CHF: -1.1, EUR: 1.6 } }, '1D': { lead: 'USD', lag: 'CHF', spread: 2, s: { USD: 1.6, CHF: -1.4, EUR: 0.1 } } } },
  fed: { meetings: [['2026-12-09', 26, 95, 0]] }, regime: { quadrant: 'reflation', qName: 'Reflation', corr: { state: 'HIGH' } },
  cb: { boe: { date: '2026-11-05', regime: 'HAWKISH', score: 0.7, delta: 0.15 } }, curve: { slopes: { '2s10s': [30, 0, 0, 55, '2026-11-12'] } },
  vol: { gauges: { VIX: [21.5, 80, 1, '2026-11-14'] } }, termprem: { value: 0.95 }, market: { name: 'Stressed' } });
B.gaps = ['cb-futures'];
const rows = [{ id: '2026-11-16T12:30:00Z|CPI', family: 'CPI', name: 'Core CPI m/m', t: '2026-11-16T12:30:00Z', status: 'printed', actual: 0.3, consensus: 0.2, surprise: 0.1, M: { nq: { m30: -0.7 } } },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `2026-0${i + 1}-10T13:30:00Z|CPI`, family: 'CPI', name: 'CPI', t: `2026-0${i + 1}-10T13:30:00Z`, status: 'history', M: { nq: { m30: 0.4 + i * 0.1 } } })),
  { id: 'x|NFP', family: 'NFP', name: 'NFP', t: '2026-11-16T12:35:00Z', status: 'upcoming', M: {} }];

test('compare: every section that moved is described in plain words, nothing that did not move is', () => {
  const printed = C.printedBetween(rows, A.ts, B.ts); assert.equal(printed.length, 1, 'only the printed release between the two points');
  const items = C.compare(A, B, { printed, rows }), has = re => items.some(x => re.test(`${x.title} ${x.detail}`));
  for (const re of [/World stress went from OK to watch/, /Credit went from watch to stress/, /Dollar funding went from OK to watch/, /VIX level flag turned on/, /VIX rose from 18 to 21.5/, /EUR now leads the last four hours/, /EUR moved \+1\.4σ/, /chance of a move at 2026-12-09 went from 80% to 95%/, /Goldilocks to Reflation/, /Correlation between markets went from normal to high/, /Bank of England: a newer statement \(2026-11-05\)/, /2s10s slope steepened by 6 bp/, /VIX went from 18 to 21.5/, /term premium moved/, /Stressed/, /cb-futures feed went missing/, /US CPI printed at 12:30 UTC/]) assert.ok(has(re), String(re));
  assert.ok(!has(/1D.*leads/), 'the 1D leader did not change'); assert.ok(!items.some(x => x.key === 'lag-4H'), 'the 4H laggard did not change');
  const rel = items.find(x => x.kind === 'release'); assert.match(rel.detail, /0\.3 against 0\.2 expected \(\+0\.1\)/); assert.match(rel.detail, /Nasdaq moved −0\.70% in the next 30 minutes \(a typical reaction to this kind of release is 0\.\d\d%\)/);
});

test('rank: releases first, at most n, weights descending; and no sentence says what a change means for direction', () => {
  const items = C.compare(A, B, { printed: C.printedBetween(rows, A.ts, B.ts), rows }), top = C.rank(items, 5);
  assert.equal(top.length, 5); assert.equal(top[0].kind, 'release'); for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].weight >= top[i].weight);
  for (const x of items) assert.doesNotMatch(`${x.title} ${x.detail}`, /\b(bullish|bearish|will rise|will fall|should (buy|sell)|buy|sell|signal|expect(ed)? to (rise|fall))\b(?! expected)/i, `${x.title} ${x.detail}`);
});

test('compare: unchanged points give nothing, a stale gauge is not a change, a one-sided input is skipped', () => {
  assert.equal(C.compare(A, mk(T1)).length, 0); const stale = mk(T1, { vol: { gauges: { VIX: [30, 99, 3, '2026-11-13'] } } }); assert.equal(C.compare(A, stale).filter(x => x.kind === 'vol').length, 0, 'same data date: not a change');
  assert.deepEqual(C.compare({ ts: T0, d: {}, gaps: [] }, B, {}).filter(x => x.kind !== 'feed'), []);
  assert.match(C.quietText(A, mk(T1)), /Nothing moved by more than the usual amount across 10 of 10 sections/);
});

test('pickPoint: the point in force at the time (never a later one), the earliest when all are later', () => {
  const pts = [mk(1000), mk(2000), mk(3000)]; assert.equal(C.pickPoint(pts, 2500).point.ts, 2000); assert.equal(C.pickPoint(pts, 2500).early, false);
  const e = C.pickPoint(pts, 500); assert.equal(e.point.ts, 1000); assert.equal(e.early, true); assert.equal(C.pickPoint([], 1), null); assert.equal(C.pickPoint([{ ts: 5 }], 9), null, 'a point with no data is ignored');
});

test('ranges: your last visit only when it was at least 10 minutes ago, then 1h, 4h, 24h', () => {
  const now = Date.parse('2026-11-16T16:00:00Z'), r = C.ranges(now, now - 3 * 3600e3); assert.deepEqual(r.map(x => x.id), ['last', '1h', '4h', '24h']); assert.match(r[0].label, /3 h ago/);
  assert.deepEqual(C.ranges(now, now - 60e3).map(x => x.id), ['1h', '4h', '24h']); assert.deepEqual(C.ranges(now, null).map(x => x.id), ['1h', '4h', '24h']); assert.equal(C.ranges(now, null)[1].from, now - 4 * 3600e3);
  assert.equal(C.ago(30 * 60e3), '30 min'); assert.equal(C.ago(5 * 3600e3), '5 h'); assert.equal(C.ago(3 * 86400e3), '3 days');
});

const fetchJson = async u => {
  const url = new URL(u, 'http://x'), from = Date.parse(url.searchParams.get('from')), to = Date.parse(url.searchParams.get('to'));
  const all = [mk(T0 - 3600e3), mk(T0 + 600e3), mk(T0 + 7200e3), mk(T1 - 600e3), B];
  if (u.startsWith('/api/release-layer1')) return { ok: true, rows }; return { ok: true, points: all.filter(p => p.ts >= from && p.ts <= to) };
};
test('build: picks the point in force then and the latest, compares them, and says honestly what it compared', async () => {
  const now = T1 + 60e3, res = await build({ id: '4h', from: T0 + 60e3 }, now, { fetchJson, rows }); assert.ok(res.ok); assert.equal(res.a.ts, T0 - 3600e3, 'the point in force at the start of the span, not a later one');
  assert.equal(res.b.ts, B.ts); assert.ok(res.items.length > 8); assert.match(res.span, /snapshots? held for the span/); assert.equal(res.early, false);
  const early = await build({ id: 'x', from: T0 - 30 * 3600e3 }, now, { fetchJson, rows }); assert.ok(early.ok === false || early.early === true, 'before the record begins: the earliest point and a said so');
  const none = await build({ id: 'x', from: T0 }, now, { fetchJson: async () => ({ ok: true, points: [] }), rows }); assert.equal(none.ok, false); assert.match(none.why, /begins on 14 Nov 2026/);
  const same = await build({ id: 'x', from: T1 }, now, { fetchJson: async u => (u.includes('step=5') ? { ok: true, points: [B] } : { ok: true, points: [B] }), rows }); assert.equal(same.ok, false); assert.match(same.why, /nothing to compare/);
  assert.equal((await pointAt(T1 + 1, { latest: true, fetchJson }))?.point.ts, B.ts);
});

test('the card: pills, the list, the honest sentences, escaped text, no direction words', async () => {
  const res = await build({ id: '4h', from: T0 + 60e3 }, T1 + 60e3, { fetchJson, rows }), st = { ranges: C.ranges(T1, T0), range: 'last', res, loading: false, error: null }, h = cardHtml(st);
  assert.match(h, /data-sl-card/); assert.match(h, /data-surface="panel.changed.since"/); assert.match(h, /aria-pressed="true"/); assert.match(h, /sl-rel/); assert.match(h, /not a signal/); assert.doesNotMatch(h, /undefined|NaN/);
  assert.match(cardHtml({ ...st, loading: true }), /Comparing the saved snapshots/); assert.match(cardHtml({ ...st, res: null, error: 'boom <b>' }), /boom &lt;b&gt;/); assert.match(cardHtml({ ...st, res: { ok: false, why: 'no snapshots' } }), /no snapshots/);
  assert.match(cardHtml({ ...st, res: { ok: true, items: [], quiet: 'Nothing moved', span: 'x' } }), /Nothing moved/);
});

test('the last-look stamp is kept per browser and survives a blocked store', () => {
  const m = new Map(), store = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; assert.equal(readLastLook(store), null); writeLastLook(1234567, store); assert.equal(readLastLook(store), 1234567);
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }; assert.equal(readLastLook(bad), null); writeLastLook(1, bad);
});

test('the SINCE command, and the wiring: preview surface, loader, status panel, no static import', () => {
  const c = buildCommands({ isOn: () => true, now: () => T1 }).find(x => x.id === 'since');
  assert.ok(c && c.help.length > 80 && c.example && c.opens && c.surface === 'panel.changed.since'); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  assert.deepEqual(c.run('4h').action, { kind: 'since', range: '4h' }); assert.deepEqual(c.run('').action, { kind: 'since', range: null }); assert.equal(c.run('day').action.range, '24h'); assert.match(c.run('zzz').error, /not a span I know/);
  const s = SURFACES.find(x => x.id === 'panel.changed.since'); assert.ok(s && s.hidden === 'preview' && s.kind === 'panel'); assert.ok(FEEL_KEYS.includes('sinceLast')); assert.equal(FEATURES.sinceLast.surface, 'panel.changed.since'); assert.ok(FEATURES.sinceLast.where.some(w => /Changed tab/.test(w)) && FEATURES.sinceLast.where.some(w => /SINCE/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /sinceLast: on\('panel\.changed\.since'\)/); assert.match(feel, /import\('\.\/sinceLast\.js'\)/);
  assert.match(fs.readFileSync(new URL('./commandLine.js', import.meta.url), 'utf8'), /case 'since'/); assert.doesNotMatch(fs.readFileSync(new URL('./commandCore.js', import.meta.url), 'utf8'), /from '\.\/sinceLast\.js'/);
});
