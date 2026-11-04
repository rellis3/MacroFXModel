// Tests for js/globalBoards.js.   node js/globalBoards.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEer, parseOecdCli, fairValue, cliBoard, parseRbaI2, monthly, commodityFx, realisedVol, carryVol, sessionHeat, ratioBoard, PAIRS, csvRows } from './globalBoards.js';

const FX = f => fs.readFileSync(new URL(`../tests/fixtures/global_boards/${f}`, import.meta.url), 'utf8');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('the 28 pairs in market order', () => {
  assert.equal(PAIRS.length, 28); const ids = PAIRS.map(p => p.id);
  for (const x of ['EURUSD', 'GBPJPY', 'AUDNZD', 'USDCAD', 'CADCHF', 'CHFJPY', 'NZDCAD']) assert.ok(ids.includes(x), x);
  assert.ok(!ids.includes('USDEUR') && !ids.includes('JPYCHF'));
});
t('BIS real effective rates: parsed from the saved response, fair value against the own average', () => {
  const by = parseEer(FX('eer_sample.csv'));
  for (const a of ['US', 'XM', 'GB', 'JP', 'AU', 'NZ', 'CA', 'CH']) assert.ok(by[a]?.length >= 36, a);
  const fv = fairValue(by);
  assert.equal(fv.rows.length, 8); assert.ok(fv.rows[0].devPct >= fv.rows.at(-1).devPct);
  const r = fv.rows.find(x => x.ccy === 'JPY'); assert.ok(Number.isFinite(r.devPct) && Number.isFinite(r.z) && r.spark.length > 10 && /^\d{4}-\d{2}$/.test(r.period));
  // synthetic: flat at 100 then 115 → 'expensive'
  const s = Array.from({ length: 60 }, (_, i) => ({ period: `2020-${String((i % 12) + 1).padStart(2, '0')}`, value: i === 59 ? 115 : 100 }));
  assert.equal(fairValue({ US: s }).rows[0].label, 'expensive');
});
t('OECD leading indicators: phases from the saved response', () => {
  const by = parseOecdCli(FX('cli_sample.csv')); assert.ok(Object.keys(by).length >= 6);
  const b = cliBoard(by); assert.ok(b.rows.every(r => ['expansion', 'slowdown', 'recovery', 'contraction'].includes(r.phase)));
  const ph = (v, d) => cliBoard({ X: [{ period: '2025-01', value: v - d }, { period: '2025-02', value: v }, { period: '2025-03', value: v }, { period: '2025-04', value: v }] }).rows[0].phase;
  assert.equal(ph(101, 1), 'expansion'); assert.equal(ph(101, -1), 'slowdown'); assert.equal(ph(99, 1), 'recovery'); assert.equal(ph(99, -1), 'contraction');
});
t('RBA commodity index: dd/mm/yyyy rows, blank future rows skipped', () => {
  const s = parseRbaI2(FX('rba_i2_sample.csv')); assert.ok(s.length >= 30);
  assert.match(s.at(-1).date, /^\d{4}-\d{2}$/); assert.ok(s.every(x => Number.isFinite(x.value)));
  assert.deepEqual(parseRbaI2('nothing'), []);
});
t('a commodity currency against its basket: inversion, gap and read', () => {
  const months = Array.from({ length: 30 }, (_, i) => `20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const commodity = months.map((d, i) => ({ date: d, value: 100 * (1 + 0.01 * i) })), fx = months.map(d => ({ date: d, value: 1.35 }));
  const r = commodityFx({ ccy: 'CAD', basket: 'BCPI', commodity, fx, fxInverted: true });
  assert.ok(r.ok && r.commodity12m > 8 && r.ccy12m === 0 && /lagged/.test(r.read));
  assert.equal(commodityFx({ ccy: 'X', commodity: [], fx: [] }).ok, false);
  assert.deepEqual(monthly([{ date: '2026-01-05', close: 1 }, { date: '2026-01-30', close: 2 }, { date: '2026-02-02', close: 3 }]), [{ date: '2026-01', value: 2 }, { date: '2026-02', value: 3 }]);
});
t('carry against volatility: sign, ratio, ranking', () => {
  const up = Array.from({ length: 30 }, (_, i) => 1 + (i % 2 ? 0.004 : -0.004)), calm = Array.from({ length: 30 }, (_, i) => 1 + (i % 2 ? 0.001 : -0.001));
  assert.ok(realisedVol(up) > realisedVol(calm)); assert.equal(realisedVol([1, 2]), null);
  const b = carryVol({ AUD: 4.6, JPY: 1.23, CHF: 0, EUR: 2.5 }, { AUDJPY: calm, EURCHF: up, AUDCHF: calm });
  const aj = b.rows.find(r => r.pair === 'AUDJPY'); assert.equal(aj.carry, 3.37); assert.equal(aj.side, 'long');
  assert.equal(b.rows[0].pair, 'AUDCHF'); assert.ok(!b.rows.find(r => r.pair === 'EURJPY'), 'no closes, no row');
});
t('session heat: London hours, shares sum to 100', () => {
  const bars = []; for (let d = 0; d < 3; d++) for (let h = 0; h < 24; h++) { const t = Date.UTC(2026, 0, 5 + d, h); bars.push({ time: new Date(t).toISOString(), open: 1, high: 1 + (h === 13 ? 0.01 : 0.001), low: 1 }); }
  const r = sessionHeat({ EURUSD: bars }).rows[0];
  assert.equal(r.peakHour, 13); assert.ok(Math.abs(r.share.reduce((a, b) => a + b, 0) - 100) < 0.5);
});
t('a ratio over time and a spread', () => {
  const a = Array.from({ length: 300 }, (_, i) => ({ date: `d${String(i).padStart(3, '0')}`, close: 4 + i * 0.001 })), b = a.map(x => ({ date: x.date, close: 2000 }));
  const r = ratioBoard(a, b, { label: 'copper/gold' }); assert.ok(r.ok && r.chg20 > 0 && r.z1y > 1 && r.spark.length === 120);
  const d = ratioBoard(a, a.map(x => ({ date: x.date, close: 3 })), { diff: true }); assert.equal(d.unit, '$'); assert.ok(d.value > 1);
  assert.equal(ratioBoard([], []).ok, false);
  assert.deepEqual(csvRows('a,"b,c"\n1,2'), [['a', 'b,c'], ['1', '2']]);
});
console.log(`globalBoards: ${n} tests passed`);
