// js/terminal/smileView.test.mjs: IV smile replay (the pure reduction, the route over a stand-in app and store, the picture, the player definition, the command and the wiring).
// node --test js/terminal/smileView.test.mjs. It does NOT prove the look or the feel in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as S from '../smileCore.js';
import { mountSmile as mountRoute } from '../smileRoutes.js';
import { smileStage } from './smileDraw.js';
import { smileDef, resetCache } from './smileView.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';

// a synthetic chain: spot 1000, strikes 880..1120 every 10, three expiries; a smile that is steeper on the put side
const FIELDS = ['option', 'bid', 'ask', 'iv', 'open_interest', 'volume'];
const occ = (root, exp, cp, K) => `${root}${exp.slice(2, 4)}${exp.slice(5, 7)}${exp.slice(8, 10)}${cp}${String(Math.round(K * 1000)).padStart(8, '0')}`;
const chain = (day, bump = 0) => {
  const rows = [];
  for (const [exp, base] of [['2026-11-16', 14], ['2026-11-17', 15], ['2026-11-20', 17], ['2026-12-18', 19]]) for (let K = 880; K <= 1120; K += 10) for (const cp of ['C', 'P']) {
    const m = K / 1000 - 1, iv = (base + bump + (m < 0 ? -m * 100 * 1.2 : m * 100 * 0.4)) / 100;
    rows.push([occ('SPX', exp, cp, K), 5, 6, +iv.toFixed(4), 100, 10]);
  }
  rows.push([occ('SPX', '2026-11-16', 'P', 1000), 0, 0, 5, 1, 1], [occ('SPX', '2026-11-16', 'C', 1000), 5, 6, 9, 1, 1], [occ('SPX', '2026-11-01', 'C', 1000), 5, 6, 0.2, 1, 1]);   // no quote, junk vol, an expired contract
  return rows;
};

test('reduceChain: out-of-the-money only, junk and unquoted contracts left out, buckets, the nearest expiries, ATM and skew', () => {
  const r = S.reduceChain(chain('2026-11-13'), FIELDS, 1000, '2026-11-13'); assert.equal(r.spot, 1000); assert.equal(r.curves.length, 4); assert.deepEqual(r.curves.map(c => c.dte), [3, 4, 7, 35]);
  const c = r.curves[0]; assert.equal(c.exp, '2026-11-16'); assert.ok(c.pts.length >= 20 && c.pts.length <= 30); assert.ok(c.pts.every(p => Math.abs(p[0]) <= 12.001), 'within 12% of spot');
  assert.ok(c.atm > 13.9 && c.atm < 14.2, `atm ${c.atm}`); assert.ok(c.skew5 > 3.5 && c.skew5 < 4.5, `skew ${c.skew5}`, 'put side steeper: 5% put vol minus 5% call vol');
  assert.ok(c.pts[0][0] < 0 && c.pts.at(-1)[0] > 0 && c.pts[0][1] > c.pts.at(-1)[1], 'the put wing is higher than the call wing');
  assert.ok(!c.pts.some(p => p[1] > 80), 'the 900% junk vol is dropped'); assert.equal(S.reduceChain(chain('x'), FIELDS, null, '2026-11-13').curves.length, 0); assert.equal(S.reduceChain([], FIELDS, 1000, '2026-11-13').curves.length, 0); assert.equal(S.reduceChain(chain('x'), ['a'], 1000, '2026-11-13').curves.length, 0);
  assert.equal(S.reduceChain(chain('x'), FIELDS, 1000, '2026-11-13', { maxExp: 2 }).curves.length, 2); assert.equal(S.interp([[0, 1], [10, 3]], 5), 2); assert.equal(S.interp([[0, 1]], 5), null);
  assert.equal(S.rawSpot({ underlying: { current_price: 7561.67 } }), 7561.67); assert.equal(S.rawSpot({}), null);
});

test('caption, facts, range, coverage and CSV: plain words, a change from the previous step, no direction', () => {
  const a = S.reduceChain(chain('x'), FIELDS, 1000, '2026-11-13'), b = S.reduceChain(chain('x', 2), FIELDS, 1000, '2026-11-16');
  const t = S.caption(b, a, 'Mon 16 Nov'); assert.match(t, /Mon 16 Nov: the same-day expiry \(2026-11-16\) is quoted at 16\.\d% at the money/); assert.match(t, /a put 5% below spot is quoted [\d.]+ vol points above a call 5% above/); assert.match(t, /the at-the-money vol rose 2\.0 points/);
  assert.doesNotMatch(t, /\b(will|should|buy|sell|bullish|bearish|signal|forecast)\b/i); assert.match(S.caption({ curves: [] }, null, 'x'), /no expiry had enough/); assert.match(S.caption({ curves: [{ exp: '2026-11-16', dte: 0, atm: 22, skew5: null, pts: [] }] }, null, '14:00'), /same-day expiry/);
  const [lo, hi] = S.yRange([a, b]); assert.ok(lo >= 0 && hi > lo && hi < 60); assert.deepEqual(S.yRange([]), [0, 40]);
  assert.match(S.coverageText({ sym: 'SPX', days: ['2026-10-16', '2026-11-13'], intraday: ['2026-11-12'] }), /2 end-of-day chains held for SPX, Fri 16 Oct to Fri 13 Nov.*15-minute chains held on 1 days/); assert.match(S.coverageText({ sym: 'GLD', days: ['2026-10-16'], intraday: [] }), /No 15-minute chains are kept/); assert.match(S.coverageText({ sym: 'X', days: [] }), /No option chains are held/);
  const csv = S.csv([{ ...b, label: 'Mon 16 Nov' }]).split('\n'); assert.equal(csv[0], 'frame,spot,expiry,dte,moneyness_pct,iv_pct'); assert.ok(csv.length > 40);
  for (const [w, k] of [['nq', 'NDX'], ['spx500', 'SPX'], ['gold', 'GLD'], ['qqq', 'QQQ'], ['zzz', null]]) assert.equal(S.symFromWord(w), k);
});

// the route over a stand-in app and R2
const gz = rows => zlib.gzipSync(JSON.stringify(rows)).toString('base64');
function harness() {
  const store = new Map(), handlers = {};
  store.set('cboe_raw/SPX/2026-11-12.json', { cboeTimestamp: '2026-11-12 21:39:21', underlying: { current_price: 1000 }, fields: FIELDS, rows: gz(chain('a')) });
  store.set('cboe_raw/SPX/2026-11-13.json', { cboeTimestamp: '2026-11-13 21:39:21', underlying: { current_price: 1000 }, fields: FIELDS, rows: gz(chain('b', 1.5)) });
  for (const hm of ['143000', '144500', '150000']) store.set(`cboe_intraday/SPX/2026-11-13/${hm}.json`, { t: `2026-11-13T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00.000Z`, spot: 1000, fields: FIELDS, rows: gz(chain('c', +hm / 1e6)) });
  const app = { get: (p, h) => { handlers[p] = h; } }; let gets = 0;
  mountRoute(app, { r2Ok: () => true, r2List: async prefix => [...store.keys()].filter(k => k.startsWith(prefix)), r2Get: async k => { gets++; return store.get(k) ?? null; }, rawPrefix: 'cboe_raw/', rawRe: /^cboe_raw\/([A-Z]+)\/(\d{4}-\d{2}-\d{2})\.json$/, intraPrefix: 'cboe_intraday/', intraRe: /^cboe_intraday\/([A-Z]+)\/(\d{4}-\d{2}-\d{2})\/(\d{6})\.json$/, now: () => Date.parse('2026-11-16T12:00:00Z') });
  const call = async q => { const r = { code: 200, body: null, set() { }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; await handlers['/api/replay/smile']({ query: q }, r); return r; };
  return { call, gets: () => gets };
}
test('the route: lists what is held, reduces one day or the intraday steps, validates, caches, and never writes', async () => {
  const h = harness();
  let r = await h.call({ sym: 'SPX' }); assert.equal(r.body.ok, true); assert.deepEqual(r.body.days, ['2026-11-12', '2026-11-13']); assert.deepEqual(r.body.intraday, ['2026-11-13']);
  r = await h.call({ sym: 'SPX', date: '2026-11-13' }); assert.equal(r.body.frames.length, 1); assert.equal(r.body.frames[0].curves.length, 4); assert.equal(r.body.frames[0].spot, 1000); assert.ok(r.body.frames[0].curves[0].atm > 15);
  const g = h.gets(); r = await h.call({ sym: 'SPX', date: '2026-11-13' }); assert.equal(h.gets(), g, 'a past day is cached');
  r = await h.call({ sym: 'SPX', date: '2026-11-13', mode: 'intraday' }); assert.equal(r.body.frames.length, 3); assert.ok(r.body.frames[0].t < r.body.frames[2].t); assert.equal(r.body.mode, 'intraday');
  assert.equal((await h.call({ sym: 'SPX', date: '2026-11-01' })).code, 404); assert.equal((await h.call({ sym: 'SPX', date: '2026-11-01', mode: 'intraday' })).code, 404); assert.equal((await h.call({})).code, 400); assert.equal((await h.call({ sym: 'SPX', date: 'nope' })).code, 400);
  const src = fs.readFileSync(new URL('../smileRoutes.js', import.meta.url), 'utf8'); assert.doesNotMatch(src, /r2Put|put\(|kv\.set|app\.(post|put|delete)/, 'read-only');
});

test('the picture and the player definition: tokens only, a ghost of the previous step, the table, and honest refusals', async () => {
  const h = harness(); resetCache();
  const fetchJson = async u => { const q = new URL(u, 'http://x').searchParams, r = await h.call(Object.fromEntries(q)); if (r.code !== 200) throw new Error(r.body.error); return r.body; };
  const held = await fetchJson('/api/replay/smile?sym=SPX'), def = smileDef('SPX', 'eod', held, { fetchJson }), picks = Object.fromEntries(def.picks.map(k => [k.id, k.values[0].v]));
  const r = await def.load(picks); assert.equal(r.frames.length, 2); assert.match(def.coverage(r.frames, r), /2 end-of-day chains held for SPX/);
  for (let i = 0; i < r.frames.length; i++) { const html = def.draw(r.frames, i, { reduced: i === 1, extra: r.extra, picks }); assert.match(html, /<svg/); assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b|rgb\(/, 'tokens only'); assert.match(html, /data-smv-ex="csv"/); assert.doesNotMatch(html, /NaN|undefined/); assert.ok(def.caption(r.frames, i, r.extra).length > 30); }
  assert.match(def.draw(r.frames, 1, { extra: r.extra }), /stroke-dasharray="4 3"/, 'a ghost of the same expiry one step earlier'); assert.doesNotMatch(def.draw(r.frames, 0, { extra: r.extra }), /<path d="M[^"]*" fill="none" stroke="var\(--gold\)" stroke-opacity="\.4"/, 'no ghost on the first step');
  assert.match(smileStage([], 0, {}), /Nothing to draw/); assert.match(def.label(r.frames[1], 1, 2, picks), /Fri 13 Nov · SPX · step 2 of 2/);
  const intra = await def.load({ sym: 'SPX', mode: 'intraday', day: '2026-11-13' }); assert.equal(intra.frames.length, 3); assert.match(intra.frames[0].data.label, /14:30 UTC/);
  await assert.rejects(def.load({ sym: 'GLD', mode: 'intraday', day: '2026-11-13' }), /only kept for SPX, NDX, SPY, QQQ/); await assert.rejects(def.load({ sym: 'SPX', mode: 'intraday', day: '2026-11-05' }), /no 15-minute chains are held/);
  await assert.rejects(def.load({ sym: 'QQQ', mode: 'eod', day: '' }), /too few end-of-day chains with a drawable smile are held for QQQ/);
});

test('the SMILE command and the wiring: preview surface, loader, status panel, route mounted, no static import for a desk login', () => {
  const c = buildCommands({ isOn: () => true, now: () => Date.now() }).find(x => x.id === 'smile');
  assert.ok(c && c.help.length > 80 && c.example && c.opens && c.surface === 'widget.smile'); assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  assert.deepEqual(c.run('spx').action, { kind: 'smile', sym: 'SPX', mode: 'eod' }); assert.deepEqual(c.run('nq intraday').action, { kind: 'smile', sym: 'NDX', mode: 'intraday' }); assert.deepEqual(c.run('').action, { kind: 'smile', sym: 'SPX', mode: 'eod' });
  assert.match(c.run('zzz').error, /not a symbol I have a chain for/); assert.match(c.run('gld intraday').error, /15-minute chains are only kept for/);
  const s = SURFACES.find(x => x.id === 'widget.smile'); assert.ok(s && s.hidden === 'preview' && s.kind === 'widget'); assert.ok(FEEL_KEYS.includes('smile')); assert.equal(FEATURES.smile.surface, 'widget.smile'); assert.ok(FEATURES.smile.where.some(w => /terrain card/.test(w)) && FEATURES.smile.where.some(w => /SMILE/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /smile: on\('widget\.smile'\)/); assert.match(feel, /import\('\.\/smileView\.js'\)/);
  assert.match(fs.readFileSync(new URL('./commandLine.js', import.meta.url), 'utf8'), /case 'smile'/); assert.doesNotMatch(fs.readFileSync(new URL('./commandCore.js', import.meta.url), 'utf8'), /from '\.\/smileView\.js'/);
  const server = fs.readFileSync(new URL('../../server.js', import.meta.url), 'utf8'); assert.match(server, /import \{ mountSmile as _mountSmile \} from '\.\/js\/smileRoutes\.js'/); assert.match(server, /_mountSmile\(app, \{/);
});
