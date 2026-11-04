// Tests for js/marketBoards.js.   node js/marketBoards.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yieldBoard, changeCorr, creditBoard, liquidityBoard, xccyBasis, basisBoard, termPremium, worldStress, pctile } from './marketBoards.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const days = (k, f, start = Date.parse('2026-01-01')) => Array.from({ length: k }, (_, i) => ({ date: new Date(start + i * 864e5).toISOString().slice(0, 10), value: f(i) }));
t('cross-currency basis matches the study\'s own rows (scripts/xccy-basis/build.py)', () => {
  const lines = readFileSync(new URL('../analysis/output/xccy-basis/basis_daily.csv', import.meta.url), 'utf8').trim().split('\n'), h = lines[0].split(','), ix = k => h.indexOf(k);
  let checked = 0;
  for (const l of lines.slice(1, 4000).filter((_, i) => i % 97 === 0)) {
    const c = l.split(','), pair = c[ix('pair')], b = +c[ix('basis_live')]; if (!Number.isFinite(b)) continue;
    const fxb = pair === 'gbp' ? 365 : 360, got = xccyBasis(+c[ix('F')], +c[ix('S')], +c[ix('t_days')], +c[ix('r_usd_live')], +c[ix('r_fx_live')], fxb);
    assert.ok(Math.abs(got - b) < 3, `${c[0]} ${pair}: ${got} vs ${b}`); checked++;   // the study takes the median over minutes; one F, S pair is within a few bp
  }
  assert.ok(checked >= 20);
  const bb = basisBoard({ asOf: 'x', legs: { EUR: { F: 1.0912, S: 1.0880, t: 60, contract: '2026-12' }, JPY: { F: 0.0070, S: 0.0069, t: 60 } } }, { USD: 3.9, EUR: 2.0, JPY: 0.5 });
  assert.ok(Number.isFinite(bb.rows.find(r => r.ccy === 'EUR').basis)); assert.equal(bb.rows.find(r => r.ccy === 'GBP').basis, null);
});
t('yield board: gaps to the US, changes, the currency link', () => {
  const us = { y2: days(80, i => 4 + i * 0.001), y10: days(80, () => 4.5) }, de2 = days(80, i => 2 + i * 0.004);
  const eurusd = days(80, i => 1.1 * (1 + i * 0.0006));
  const b = yieldBoard({ USD: us, EUR: { y2: de2, y10: days(80, () => 2.6) } }, { EUR: eurusd });
  const de = b.rows.find(r => r.ccy === 'EUR'); assert.equal(de.gapChg20d, 6); assert.equal(de.slope, Math.round((2.6 - de.y2) * 1000) / 10); assert.ok(de.fxChg20d > 0);
  assert.equal(b.rows.find(r => r.ccy === 'USD').gapToUs, null); assert.equal(b.rows.find(r => r.ccy === 'JPY').y2, null);
  const a = days(60, i => Math.sin(i)), bb = a.map(p => ({ ...p, value: p.value * 2 })); assert.equal(changeCorr(a, bb), 1);
});
t('credit board: bp, changes, percentiles and the state', () => {
  const hy = days(300, i => (i < 280 ? 3 : 3 + (i - 279) * 0.05)); const b = creditBoard({ BAMLH0A0HYM2: hy });
  const r = b.rows.find(x => x.id === 'BAMLH0A0HYM2'); assert.equal(r.oas, 400); assert.equal(r.chg20d, 100); assert.equal(r.pctile1y, 100); assert.equal(b.state, 'stress');
  assert.equal(pctile(days(10, i => i)), null);
});
t('liquidity board: net liquidity and its state', () => {
  const w = k => days(30, () => k, Date.parse('2026-01-07')).map((p, i) => ({ ...p, date: new Date(Date.parse('2026-01-07') + i * 7 * 864e5).toISOString().slice(0, 10) }));
  const WALCL = w(7_000_000).map((p, i) => ({ ...p, value: 7_000_000 - i * 60_000 })), WTREGEN = w(800_000), RRP = days(220, () => 100);
  const b = liquidityBoard({ WALCL, WTREGEN, RRPONTSYD: RRP, WRESBAL: w(3_200_000) });
  assert.equal(b.items[0].label, 'Net liquidity'); assert.equal(b.items[0].chg4w, -240); assert.equal(b.state, 'draining');
});
t('term premium and the World stress strip', () => {
  const tp = termPremium(days(100, i => 0.5 + i * 0.005), days(100, () => 4.4)); assert.equal(tp.chg20d, 10); assert.equal(tp.expectations, +(4.4 - tp.value).toFixed(2));
  const calm = worldStress({ risk: { level: 'CALM', active: 0, available: 6 }, credit: { state: 'normal', rows: [] }, em: { stress: { level: 'calm', z: 0.2 } } });
  assert.equal(calm.overall, 'calm'); assert.equal(calm.tiles.length, 3);
  const bad = worldStress({ risk: { level: 'RISK_OFF', active: 4, available: 6 }, credit: { state: 'stress', rows: [{ id: 'BAMLH0A0HYM2', oas: 520, chg20d: 90 }] } });
  assert.equal(bad.overall, 'stress'); assert.match(bad.tiles[1].detail, /HY 520bp \(\+90 in 20d\)/);
  assert.equal(worldStress({}).overall, null);
});
console.log(`marketBoards: ${n} tests passed`);
