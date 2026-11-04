// Tests for js/fxFairValue.js on synthetic series with a known structure.   node js/fxFairValue.test.mjs
import assert from 'node:assert/strict';
import { asOfJoin, buildRows, olsFit, predict, ar1HalfLife, rollingGaps, stability, fairValueNow, convergenceSample, closureBeta, closureAt, FV_PAIRS, SCORED_PAIRS } from './fxFairValue.js';
import { mulberry32 } from './statsCore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const rng = mulberry32(20261104);
const gauss = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const days = N => { const out = []; let d = Date.parse('2010-01-04'); while (out.length < N) { const w = new Date(d).getUTCDay(); if (w > 0 && w < 6) out.push(new Date(d).toISOString().slice(0, 10)); d += 864e5; } return out; };

/** Synthetic world: random-walk yield gaps and VIX; ln price = a + b·x + u, u AR(1) with half-life `hl`. */
function world(N, { hl = 20, b = [0.04, 0.02, -0.03], uSd = 0.01, rwPrice = false } = {}) {
  const D = days(N), phi = Math.pow(0.5, 1 / hl);
  let g2 = 1, g10 = 0.5, lv = Math.log(18), u = 0, rw = 0;
  const y2B = [], y2Q = [], y10B = [], y10Q = [], vix = [], fx = [];
  for (let i = 0; i < N; i++) {
    g2 += 0.03 * gauss(); g10 += 0.025 * gauss(); lv = lv + 0.05 * (Math.log(18) - lv) + 0.06 * gauss();
    u = phi * u + uSd * Math.sqrt(1 - phi * phi) * gauss();
    rw += 0.006 * gauss();
    const ln = rwPrice ? rw : 0.1 + b[0] * g2 + b[1] * g10 + b[2] * lv + u;
    y2B.push({ date: D[i], value: 2 + g2 }); y2Q.push({ date: D[i], value: 2 });
    y10B.push({ date: D[i], value: 3 + g10 }); y10Q.push({ date: D[i], value: 3 });
    vix.push({ date: D[i], value: Math.exp(lv) }); fx.push({ date: D[i], close: Math.exp(ln) });
  }
  return { fx, y2Base: y2B, y2Quote: y2Q, y10Base: y10B, y10Quote: y10Q, vix };
}

t('pair list: the five scored USD pairs are in the display list, pips are right', () => {
  for (const p of SCORED_PAIRS) assert.ok(FV_PAIRS.find(x => x.id === p), p);
  assert.equal(FV_PAIRS.find(x => x.id === 'USDJPY').pip, 0.01);
  assert.equal(FV_PAIRS.find(x => x.id === 'EURUSD').pip, 0.0001);
});
t('as-of join carries a holiday, drops a dead feed, never looks ahead', () => {
  const s = [{ date: '2026-01-02', value: 1 }, { date: '2026-01-09', value: 2 }];
  assert.deepEqual(asOfJoin(['2026-01-01', '2026-01-05', '2026-01-08', '2026-01-09', '2026-01-20'], s, 5), [null, 1, null, 2, null]);
});
t('OLS recovers known coefficients and the prediction SE is at least the residual SD', () => {
  const X = [], y = [];
  for (let i = 0; i < 500; i++) { const a = gauss(), b = gauss(); X.push([a, b]); y.push(1 + 2 * a - 0.5 * b + 0.1 * gauss()); }
  const f = olsFit(X, y);
  assert.ok(Math.abs(f.beta[0] - 1) < 0.02 && Math.abs(f.beta[1] - 2) < 0.02 && Math.abs(f.beta[2] + 0.5) < 0.02, f.beta.join());
  assert.ok(f.r2 > 0.99 && Math.abs(f.s - 0.1) < 0.01);
  const p = predict(f, [0, 0]); assert.ok(Math.abs(p.yhat - 1) < 0.02 && p.sePred >= f.s);
  assert.equal(olsFit([[1], [1], [1], [1]], [1, 2, 3, 4]), null, 'a constant column is singular');
});
t('AR(1) half-life: a planted 20-day half-life is recovered inside its interval; a random walk has no reversion in its CI', () => {
  const phi = Math.pow(0.5, 1 / 20); let u = 0; const e = [];
  for (let i = 0; i < 4000; i++) { u = phi * u + gauss(); e.push(u); }
  const a = ar1HalfLife(e);
  assert.ok(a.ok && a.halfLifeCi[0] <= 20 && 20 <= a.halfLifeCi[1], JSON.stringify(a));
  let w = 0; const rw = []; for (let i = 0; i < 1000; i++) { w += gauss(); rw.push(w); }
  assert.equal(ar1HalfLife(rw).noReversionInCi, true);
  assert.equal(ar1HalfLife([1, 2]).ok, false);
});
t('rolling fair value on a planted world: betas recovered, gap is out of sample, z ~ N(0,1)', () => {
  const W = world(900);
  const rows = buildRows(W);
  assert.equal(rows.length, 900); assert.equal(rows[0].x.length, 3);
  const g = rollingGaps(rows, { window: 250 });
  assert.equal(g.length, 650); assert.equal(g[0].date, rows[250].date);
  const b = g.at(-1).beta; assert.ok(Math.abs(b[1] - 0.04) < 0.01 && Math.abs(b[3] + 0.03) < 0.01, b.join());
  const z = g.map(x => x.z), m = z.reduce((s, v) => s + v, 0) / z.length, sd = Math.sqrt(z.reduce((s, v) => s + (v - m) ** 2, 0) / z.length);
  assert.ok(Math.abs(m) < 0.3 && sd > 0.7 && sd < 1.6, `${m} ${sd}`);
  // out of sample: changing today's price moves today's gap one for one and leaves today's fair value alone
  const rows2 = rows.map(q => ({ ...q })); rows2.at(-1).y += 0.05; rows2.at(-1).price *= Math.exp(0.05);
  const g2 = rollingGaps(rows2, { window: 250 });
  assert.ok(Math.abs(g2.at(-1).fair - g.at(-1).fair) < 1e-12 && Math.abs(g2.at(-1).gap - g.at(-1).gap - 0.05) < 1e-12);
});
t('fair value now: pips, %, band, half-life, stability and history on a planted world', () => {
  const W = world(900, { hl: 15 });
  const f = fairValueNow(buildRows(W), { pip: 0.0001 });
  assert.ok(f.ok); assert.ok(f.band95[0] < f.fair && f.fair < f.band95[1]);
  assert.ok(Math.abs(f.gapPct - 100 * (f.price / f.fair - 1)) < 0.01);
  assert.ok(Math.abs(f.gapPips - (f.price - f.fair) / 0.0001) < 1);
  assert.equal(f.betas.length, 3); assert.equal(f.betas[0].factor, '2y gap');
  assert.ok(f.halfLife.ok && f.halfLife.halfLife > 3 && f.halfLife.halfLife < 60, JSON.stringify(f.halfLife));
  assert.ok(f.stability.label === 'stable', JSON.stringify(f.stability));
  assert.equal(f.history.length, 120);
  assert.equal(fairValueNow(buildRows(world(100))).ok, false);
});
t('without 10y series the model drops that factor', () => {
  const W = world(400); const rows = buildRows({ ...W, y10Base: null, y10Quote: null });
  assert.equal(rows[0].x.length, 2);
  const f = fairValueNow(rows); assert.ok(f.ok); assert.deepEqual(f.betas.map(b => b.factor), ['2y gap', 'ln VIX']);
});
t('convergence: a planted mean-reverting gap closes at the AR(1) rate; a random-walk price shows none', () => {
  const W = world(3000, { hl: 20, uSd: 0.02 });
  const rows = buildRows(W), g = rollingGaps(rows, { window: 250, step: 5 });
  const s = convergenceSample(rows, g, { h: 20, skip: 1 });
  assert.equal(s.length, g.length - 21);
  const b = closureBeta(s);
  // the rolling fit soaks up part of the planted gap into its coefficients, so the pipeline sees about half the true closure
  assert.ok(b > 0.15 && b < 0.75, `planted closure ${b} vs ~${closureAt(20, 20)} before attenuation`);
  const R = buildRows(world(3000, { rwPrice: true })), gR = rollingGaps(R, { window: 250, step: 5 });
  const bR = closureBeta(convergenceSample(R, gR, { h: 20, skip: 1 }));
  assert.ok(Math.abs(bR) < 0.2, `random walk closure ${bR}`);   // 40 seeds: mean +0.012, sd 0.047 (unbiased)
});
t('the lockbox end cuts both the signal and the outcome', () => {
  const W = world(600), rows = buildRows(W), g = rollingGaps(rows, { window: 250 });
  const end = rows[500].date, s = convergenceSample(rows, g, { h: 5, skip: 1, end });
  assert.ok(s.length > 0 && s.every(x => x.date < end));
  const lastSig = rows.findIndex(q => q.date === s.at(-1).date); assert.equal(lastSig + 1 + 5, 500);
});
t('closure share from a half-life', () => { assert.ok(Math.abs(closureAt(20, 20) - 0.5) < 1e-12); assert.ok(Math.abs(closureAt(10, 120) - 0.0561) < 1e-3); });

console.log(`fxFairValue: ${n} passed`);
