import test from 'node:test';
import assert from 'node:assert/strict';
import { stressLights, vixRead, creditRead, fundingRead, movedShare, weatherModel, weatherScript } from './jarvisWeatherCore.js';
import { buildScenes } from './showCore.js';
import './jarvisViewWeather.js';

const ws = { ok: true, overall: 'stress', tiles: [{ id: 'risk', level: 'watch' }, { id: 'credit', level: 'stress' }, { id: 'funding', level: 'stress' }, { id: 'tp', level: 'ok' }] };
const ser = vals => vals.map((v, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, value: v }));
const hist = { vix: ser([20, 25]), vix3m: ser([24, 25]), hy: ser([3, 3.4]), sofr: ser([3.9]), iorb: ser([3.85]) };
const vol = { A: { oc: 1, forecast: { oc_median: 0.5 } }, B: { oc: -0.1, forecast: { oc_median: 0.5 } }, C: { oc: 0.4, forecast: { oc_median: 0.5 } }, D: { oc: -0.9, forecast: { oc_median: 0.5 } }, BAD: { oc: 1 } };

test('stressLights: amber counts half, red full; missing feed is null', () => {
  const L = stressLights(ws); assert.equal(L.n, 4); assert.equal(L.on, 3); assert.equal(L.red, 2); assert.equal(L.share, 0.625); assert.equal(stressLights(null), null); assert.equal(stressLights({ tiles: [] }), null);
});
test('vix, credit, funding, moved share read the real shapes', () => {
  const v = vixRead(hist); assert.equal(v.vix, 25); assert.equal(v.inverted, false); assert.ok(vixRead({ vix: ser([26]), vix3m: ser([25]) }).inverted);
  const k = creditRead(hist); assert.ok(Math.abs(k.hy - 340) < 1e-9); assert.ok(Math.abs(k.d20 - 40) < 1e-9);
  assert.ok(Math.abs(fundingRead(hist).spread - 5) < 1e-9); assert.equal(vixRead({}), null);
  assert.deepEqual(movedShare(vol), { n: 4, past: 2, share: 0.5 }); assert.equal(movedShare({}), null);
});
test('weatherModel: every knob comes from one input, none when the input is missing', () => {
  const m = weatherModel({ ws, hist, vol, broken: 3 });
  assert.equal(m.density, 0.625); assert.equal(m.lightning, 0.5); assert.equal(m.rain, 1); assert.equal(m.mist, 1); assert.equal(m.embers, 3); assert.equal(m.tone, 'dn'); assert.ok(m.aurora === 0);
  const e = weatherModel({}); assert.equal(e.density, null); assert.equal(e.lightning, null); assert.equal(e.embers, null); assert.equal(e.missing.length, 4);
  assert.equal(weatherModel({ ws: { tiles: [{ id: 'x', level: 'ok' }], overall: 'ok' } }).aurora, 1);
});
test('weatherScript: plain measured words, a caveat, null without the lights', () => {
  const t = weatherScript(weatherModel({ ws, hist, vol, broken: 0 }));
  assert.match(t, /three of four stress lights are on, two of them red/); assert.match(t, /50 percent of markets/); assert.match(t, /not a forecast/); assert.doesNotMatch(t, /\d+ of \d+/);
  assert.equal(weatherScript(weatherModel({})), null);
});
test('the SHOW scene is registered after the lean and skips when data is missing', () => {
  const inp = { now: new Date(), movers: [{ key: 'NQ', ratio: 2, oc: 1 }], board: { up: 1, dn: 0, quiet: 0, haveLean: 1, bull: 1, bear: 0, flat: 0 }, chain: null, extra: { weather: { ws, hist, vol } } };
  const ids = buildScenes(inp).map(s => s.id); assert.ok(ids.indexOf('weather') === ids.indexOf('lean') + 1 && ids.includes('weather'));
  assert.ok(!buildScenes({ ...inp, extra: { weather: null } }).some(s => s.id === 'weather'));
  const sc = buildScenes(inp).find(s => s.id === 'weather'); assert.equal(sc.view, 'weather'); assert.equal(typeof sc.motion, 'function');
});
