// Parity: js/ladderV2Shadow.js must reproduce scripts/ladder-v2 (Python) on the frozen fixture written by
// scripts/ladder-v2/build_params.py: sigma to 1e-6 relative, and the CFD paste text exactly when the Python export
// for that session exists.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { nqSigma, harcjSigma, buildText, nyKey, PARAMS } from './ladderV2Shadow.js';

const fx = JSON.parse(readFileSync(new URL('./ladderV2Shadow.fixture.json', import.meta.url), 'utf8'));
const S = fx.session;

// NY-close key: 17:00 New York rolls to the next date (EST and EDT)
assert.equal(nyKey(Date.UTC(2026, 10, 18, 21, 59) / 1000), '2026-11-18');   // 16:59 NY (EST)
assert.equal(nyKey(Date.UTC(2026, 10, 18, 22, 0) / 1000), '2026-11-19');    // 17:00 NY
assert.equal(nyKey(Date.UTC(2026, 6, 14, 21, 0) / 1000), '2026-07-15');     // 17:00 NY (EDT)

const d1 = fx.instruments.NQ.d1.map(([key, open, high, low, close]) => ({ key, open, high, low, close }));
const nq = nqSigma(d1, S);
const rel = (a, b) => Math.abs(a / b - 1);
assert.ok(rel(nq.sigma, fx.instruments.NQ.sigma) < 1e-6, `NQ sigma ${nq.sigma} vs python ${fx.instruments.NQ.sigma}`);
const sig = { NQ: nq };
for (const sym of ['GOLD', 'EURUSD']) {
  const s = harcjSigma(sym, fx.instruments[sym].m5, S);
  assert.ok(rel(s.sigma, fx.instruments[sym].sigma) < 1e-6, `${sym} sigma ${s.sigma} vs python ${fx.instruments[sym].sigma}`);
  sig[sym] = s;
}

for (const kind of ['forecast', 'exhaustion']) {
  const text = buildText(kind, 'cfd', sig, S);
  const f = new URL(`../analysis/output/ladder-v2-shadow/${S}${kind === 'forecast' ? '' : '_exhaustion'}_cfd.txt`, import.meta.url);
  if (existsSync(f)) {
    const py = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim();
    assert.equal(text.trim(), py, `${kind} CFD text differs from the Python export`);
  }
  assert.ok(buildText(kind, 'fut', sig, S).includes('Futures charts'));
}
// futures gold uses its own (wider) widths; NQ / EURUSD reuse the CFD ones
assert.ok(PARAMS.instruments.GOLD.fut.widths.hl['75'] > PARAMS.instruments.GOLD.cfd.widths.hl['75']);
assert.deepEqual(PARAMS.instruments.NQ.fut.widths, PARAMS.instruments.NQ.cfd.widths);
console.log('ladderV2Shadow: parity OK', Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, +v.sigma.toFixed(6)])));
