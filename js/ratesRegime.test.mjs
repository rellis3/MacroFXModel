// node js/ratesRegime.test.mjs — shape + behaviour of js/ratesRegime.js on synthetic data.
import assert from 'node:assert/strict';
import { pairedChanges, band, ratesRegimeRead, alertText } from './ratesRegime.js';

let fails = 0;
const ok = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } };

// synthetic: 30 weekdays x 40 bars, Nasdaq = -beta * yield move + noise (beta given in % per bp)
function synth(betaPctPerBp, days = 30, noise = 0.05, seed = 1) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const bond = [], nq = [];
  let p = 100, q = 20000, t = Date.UTC(2026, 6, 1, 8) / 1000, d = 0;
  while (d < days) {
    const day = new Date(t * 1000).getUTCDay();
    if (day !== 0 && day !== 6) {
      for (let i = 0; i < 40; i++) {
        const dy = rnd() * 1.0;                                   // bp
        p *= Math.exp(-dy * 1.9 / 1e4);
        q *= Math.exp((betaPctPerBp * dy + rnd() * noise) / 100);
        bond.push({ time: t + i * 900, close: p }); nq.push({ time: t + i * 900, close: q });
      }
      d++;
    }
    t += 86400;
  }
  return { bond, nq };
}

ok('pairedChanges: only consecutive 15-min bars, signs right', () => {
  const bond = [{ time: 0, close: 100 }, { time: 900, close: 99.9 }, { time: 2700, close: 99.8 }];
  const nq = [{ time: 0, close: 100 }, { time: 900, close: 101 }, { time: 2700, close: 102 }];
  const r = pairedChanges(bond, nq);
  assert.equal(r.length, 1);
  assert.ok(r[0].dy > 0, 'price down -> yield up');
  assert.ok(r[0].dq > 0);
});
ok('band thresholds', () => {
  assert.equal(band(-0.4).key, 'strong-opposite');
  assert.equal(band(0.2).key, 'moderate-together');
  assert.equal(band(0.1).key, 'weak');
});
ok('recovers a strong opposite regime and its beta', () => {
  const r = ratesRegimeRead({ ...synth(-0.05), now: 0 });
  assert.ok(r.ok, r.reason);
  assert.equal(r.band.key, 'strong-opposite');
  assert.ok(Math.abs(r.betaPctPerBp + 0.05) < 0.01, `beta ${r.betaPctPerBp}`);
  assert.ok(r.read.includes('OPPOSITE'));
});
ok('weak regime when unrelated', () => {
  const r = ratesRegimeRead({ ...synth(0, 30, 0.2), now: 0 });
  assert.equal(r.band.strength, 'weak');
});
ok('not enough data says so', () => {
  const r = ratesRegimeRead({ ...synth(-0.05, 5), now: 0 });
  assert.equal(r.ok, false);
});
ok('alertText: band change and silence when unchanged', () => {
  const cur = ratesRegimeRead({ ...synth(-0.05), now: 0 });
  assert.equal(alertText({ ...cur }, { ...cur, lastBar: { ...cur.lastBar, shock: false } }), null);
  const msg = alertText({ band: { key: 'weak' }, lastBar: cur.lastBar }, { ...cur, lastBar: { ...cur.lastBar, shock: false } });
  assert.ok(msg && msg.includes('strong, opposite'));
  assert.ok(msg.includes('Context, not a signal'));
});
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
