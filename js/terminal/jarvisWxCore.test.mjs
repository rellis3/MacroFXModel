import test from 'node:test';
import assert from 'node:assert/strict';
import { condition, groupWeather, ccyWeather, wxScript, GROUPS, memberSpread } from './jarvisWxCore.js';
import { candleRows } from './jarvisCandles.js';
import { MARKET_KEYS } from './jarvisMarkets.js';

const mk = (key, oc) => ({ key, oc, oh: Math.max(oc, 0) + 0.1, ol: Math.max(-oc, 0) + 0.1, forecast: { oc_median: 1 } });
const vol = Object.fromEntries([['WTI', -2.4], ['BRENT', -2.0], ['NATGAS', -1.8], ['GOLD', 1.8], ['SILVER', 2.0], ['COPPER', 1.2], ['NQ', 0.1], ['SPX500', -0.1], ['EURUSD', 0.6], ['GBPUSD', 0.1], ['USDJPY', 2.2], ['AUDUSD', -0.3], ['NZDJPY', 2.0], ['EURJPY', 2.4], ['GBPJPY', 2.1]].map(([k, v]) => [k, mk(k, v)]));

test('condition: quiet is clear; big moves both ways is wind; up is warm/hot; down is cloud/rain/storm', () => {
  assert.equal(condition(0.1, 0.3), 'clear'); assert.equal(condition(0.1, 1.4), 'wind'); assert.equal(condition(0.8, 0.9), 'warm'); assert.equal(condition(2, 2), 'hot');
  assert.equal(condition(-0.2, 0.7), 'cloud'); assert.equal(condition(-1, 1.1), 'rain'); assert.equal(condition(-2.1, 2.1), 'storm');
});
test('groupWeather: groups only exist when a member is in the feed; energy down hard is a storm, metals up is hot; the biggest mover is named', () => {
  const r = candleRows(vol, {}), g = Object.fromEntries(groupWeather(r).map(x => [x.id, x]));
  assert.equal(g.energy.cond, 'storm'); assert.ok(g.energy.avg < -1.5); assert.equal(g.metals.cond, 'hot'); assert.ok(!g.crypto && !g.farm, 'no market in the feed, no cell');
  assert.ok(g.energy.top.name && g.energy.top.ratio < 0);
  assert.ok(GROUPS.flatMap(x => x.keys).every(k => MARKET_KEYS.includes(k)), 'every group member is a desk market');
});
test('ccyWeather: yen is the weakest when the yen crosses rise, and a currency needs three pairs', () => {
  const r = candleRows(vol, {}), c = Object.fromEntries(ccyWeather(r).map(x => [x.id, x]));
  assert.ok(c.JPY.avg < -1 && ['storm', 'rain'].includes(c.JPY.cond)); assert.ok(!c.CHF, 'CHF has no pairs in the sample');
});
test('wxScript: short, names the storm and the warmth, ends with the not-a-forecast line; null with no data', () => {
  const r = candleRows(vol, {}), t = wxScript(groupWeather(r), ccyWeather(r));
  assert.ok(/Energy is stormy/.test(t) && /warmest/.test(t) && /not a forecast/.test(t)); assert.ok(t.split(/\s+/).length <= 60, 'keep the morning view short');
  assert.equal(wxScript([], []), null);
});
test('the view registers a view, a quick-brief scene after candles, and a scene that is null without data', async () => {
  const { EXTRA, viewsOf } = await import('./jarvisModules.js'); await import('./jarvisViewWx.js');
  const { SHOW_HOOKS, QUICK_IDS } = await import('./showCore.js');
  assert.ok(viewsOf().some(v => v.id === 'wx') && EXTRA.some(m => m.id === 'wx')); assert.ok(QUICK_IDS.has('wx'));
  const h = SHOW_HOOKS.find(x => x.id === 'wx'); assert.equal(h.after, 'candles'); assert.equal(h.build({}, null), null);
  const r = candleRows(vol, {}), sc = h.build({}, { ok: true, at: 1, rows: r }); assert.equal(sc.view, 'wx'); assert.ok(sc.text.length > 20);
});

test('pickRecorderType: MP4 first where the browser can write it, else WebM, else null; a throwing check counts as unsupported', async () => {
  const { pickRecorderType, RECORD_TYPES } = await import('./showCore.js');
  assert.deepEqual(pickRecorderType(() => true), { mime: RECORD_TYPES[0], ext: 'mp4' });
  assert.equal(pickRecorderType(t => t.startsWith('video/webm') && !t.includes('vp9')).ext, 'webm');
  assert.equal(pickRecorderType(() => false), null); assert.equal(pickRecorderType(() => { throw new Error('x'); }), null);
});

test('members: every group and currency carries its members low to high, so a split group shows its spread (one up 3x and one down 3x is not "clear")', () => {
  const sp = memberSpread([{ key: 'A', v: 3 }, { key: 'B', v: -3 }]); assert.equal(sp.spread, 6); assert.equal(sp.members[0].key, 'B'); assert.equal(memberSpread([]).spread, 0);
  const r = candleRows(vol, {}), g = Object.fromEntries(groupWeather(r).map(x => [x.id, x]));
  assert.equal(g.energy.members.length, g.energy.n); assert.ok(g.energy.members.every((m, i, a) => !i || a[i - 1].v <= m.v)); assert.ok(g.energy.lo <= g.energy.avg && g.energy.avg <= g.energy.hi);
  const c = Object.fromEntries(ccyWeather(r).map(x => [x.id, x])); assert.equal(c.JPY.members.length, c.JPY.n); assert.ok(c.JPY.members.every(m => m.v < 0), 'yen pairs counted from the yen side');
  const split = groupWeather(candleRows({ WTI: mk('WTI', 3), BRENT: mk('BRENT', -3) }, {}))[0]; assert.notEqual(split.cond, 'clear'); assert.equal(split.spread, 6);
});

test('wxScript: no strongest / weakest currency under FLAT (Helix review 0.9)', () => {
  const r = candleRows(Object.fromEntries([['EURUSD', 0.01], ['GBPUSD', -0.01], ['USDJPY', 0.02], ['AUDUSD', 0], ['USDCAD', 0.01], ['USDCHF', -0.02], ['EURGBP', 0.01], ['EURJPY', 0]].map(([k, v]) => [k, mk(k, v)])), {});
  const t = wxScript(groupWeather(r), ccyWeather(r));
  assert.match(t, /No clear leader among the currencies/); assert.doesNotMatch(t, /Strongest currency|weakest/);
});
