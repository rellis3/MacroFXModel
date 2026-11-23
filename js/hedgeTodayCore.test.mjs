// node js/hedgeTodayCore.test.mjs — the Today hedge maths (js/hedgeTodayCore.js).
import assert from 'node:assert/strict';
import { londonOffsetSec, sessionsFromH1, buildTodayPanel, hourlyOf, sessionRetOf, betaEwma, corrWindow, heldUp, rankToday, ccysOf, NH } from './hedgeTodayCore.js';

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

t('London offset: GMT in January, BST in July, switches at 01:00 UTC on the last Sundays', () => {
  assert.equal(londonOffsetSec(Date.parse('2026-01-15T12:00:00Z') / 1000), 0);
  assert.equal(londonOffsetSec(Date.parse('2026-07-15T12:00:00Z') / 1000), 3600);
  assert.equal(londonOffsetSec(Date.parse('2026-03-29T00:59:00Z') / 1000), 0);
  assert.equal(londonOffsetSec(Date.parse('2026-03-29T01:00:00Z') / 1000), 3600);
  assert.equal(londonOffsetSec(Date.parse('2026-10-25T01:00:00Z') / 1000), 0);
});

// synthetic hourly candles: 24 bars a day; price = a function of the hour so the mapping is checkable
function candles(days, startISO, f) { const o = [], t0 = Date.parse(startISO); for (let i = 0; i < days * 24; i++) { const t = t0 + i * 3600e3; o.push({ t, c: f(i, t) }); } return o; }

t('sessionsFromH1: P_h is the close of the bar ending at h:00 London (BST: 07:00 UTC bar for 08:00)', () => {
  const cs = candles(3, '2026-07-13T00:00:00Z', (_i, t) => 100 + new Date(t).getUTCHours());   // close = 100 + bar start hour UTC
  const m = sessionsFromH1(cs, Date.parse('2026-07-20T00:00:00Z') / 1000);
  const r = m.get('2026-07-14');
  // 08:00 London BST = 07:00 UTC end -> bar starting 06:00 UTC -> 106
  assert.equal(r[0], 106); assert.equal(r[9], 115);
});
t('sessionsFromH1: GMT winter mapping, weekends dropped, today kept only after 17:00 London', () => {
  const cs = candles(7, '2026-01-12T00:00:00Z', (_i, t) => 100 + new Date(t).getUTCHours());
  const m = sessionsFromH1(cs, Date.parse('2026-01-16T15:00:00Z') / 1000);   // Friday 15:00 London
  assert.equal(m.get('2026-01-13')[0], 107);                                   // 08:00 GMT = bar 07:00-08:00 UTC
  assert.ok(!m.has('2026-01-16'), 'today before 17:00 is not a completed session');
  const m2 = sessionsFromH1(cs, Date.parse('2026-01-19T00:00:00Z') / 1000);
  assert.ok(m2.has('2026-01-16')); assert.ok(!m2.has('2026-01-17') && !m2.has('2026-01-18'));
});

// planted relationship: target hourly = beta * hedge hourly + noise, in session; overnight unrelated
function rngOf(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }
function planted(beta, days = 300, seed = 7) {
  const g = rngOf(seed), z = () => { let u = 0; while (!u) u = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * g()); };
  const t0 = Date.parse('2025-06-02T00:00:00Z'); const H = [], A = [], N = []; let h = 1, a = 1, nn = 1;
  for (let i = 0; i < days * 24; i++) {
    const t = t0 + i * 3600e3, end = t / 1000 + 3600, tl = end + londonOffsetSec(end), hr = Math.floor((tl % 86400) / 3600);
    const inS = hr >= 9 && hr <= 17, eh = z() * 0.001;
    h *= Math.exp(eh); a *= Math.exp(inS ? beta * eh + z() * 0.0005 : z() * 0.001); nn *= Math.exp(z() * 0.001);
    H.push({ t, c: h }); A.push({ t, c: a }); N.push({ t, c: nn });
  }
  return buildTodayPanel({ HEDGE: H, TGT: A, NOISE: N }, { nowSec: t0 / 1000 + days * 86400 });
}

t('buildTodayPanel keeps at most 200 completed sessions and the session return is P17/P8', () => {
  const p = planted(1.0);
  assert.ok(p.sessions.length <= 200 && p.sessions.length > 150);
  const r = sessionRetOf(p, 'TGT'), hh = hourlyOf(p, 'TGT');
  let s = 0; for (let j = 0; j < NH; j++) s += hh[5 * NH + j];
  assert.ok(Math.abs(s - r[5]) < 1e-9);
});
t('betaEwma recovers a planted session beta (positive control, as hedge-today §3.6)', () => {
  for (const beta of [0.5, 1.0, -0.8]) {
    const p = planted(beta), x = hourlyOf(p, 'TGT'), y = hourlyOf(p, 'HEDGE');
    const b = betaEwma(x, y, p.sessions.length);
    assert.ok(Math.abs(b - beta) < 0.08, `beta ${beta} recovered as ${b}`);
  }
});
t('corrWindow is strong for the planted pair and near zero for noise; heldUp removes variance out of sample', () => {
  const p = planted(1.0), n = p.sessions.length, x = hourlyOf(p, 'TGT');
  assert.ok(corrWindow(x, hourlyOf(p, 'HEDGE'), n) > 0.8);
  assert.ok(Math.abs(corrWindow(x, hourlyOf(p, 'NOISE'), n)) < 0.2);
  const h = heldUp(x, hourlyOf(p, 'HEDGE'), sessionRetOf(p, 'TGT'), sessionRetOf(p, 'HEDGE'), n);
  assert.ok(h.cut > 0.6 && h.n >= 50, JSON.stringify(h));
});
t('rankToday puts the planted partner first, on the short side for a positive beta', () => {
  const rows = rankToday(planted(1.0), 'TGT');
  assert.equal(rows[0].sym, 'HEDGE'); assert.equal(rows[0].side, 'short'); assert.ok(Math.abs(rows[0].ratio - 1) < 0.08);
});
t('ccysOf and the cuts-the-view flag', () => {
  assert.deepEqual(ccysOf('EUR_USD'), ['EUR', 'USD']); assert.deepEqual(ccysOf('XAU_USD'), []); assert.deepEqual(ccysOf('NAS100_USD'), []);
});

console.log(`\n${pass} passed`);
