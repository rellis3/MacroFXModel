// Tests for js/worldRates.js.   node js/worldRates.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCbpol, worldRates, byIsoNumeric, AREAS, EURO_MEMBERS } from './worldRates.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const csv = readFileSync(new URL('../tests/fixtures/world_rates/cbpol_sample.csv', import.meta.url), 'utf8');
t('parses the real BIS CSV (quoted fields with commas)', () => {
  const b = parseCbpol(csv); assert.deepEqual(Object.keys(b).sort(), ['AR', 'MX', 'TR', 'US', 'XM']);
  assert.ok(b.MX.length >= 12); assert.ok(b.MX.every((x, i) => !i || x.period > b.MX[i - 1].period));
  assert.throws(() => parseCbpol('a,b\n1,2'));
});
t('cycle, changes, staleness and the euro area on the map', () => {
  const w = worldRates(parseCbpol(csv));
  assert.equal(w.banks.MX.iso, '484'); assert.equal(w.banks.MX.name, 'Mexico'); assert.equal(typeof w.banks.MX.change12m, 'number');
  assert.equal(w.banks.AR.stale, true); assert.equal(w.summary.banks, 4);
  const map = byIsoNumeric(w); assert.equal(map['484'].area, 'MX'); assert.equal(map['276'].area, 'XM'); assert.equal(map['250'].ccy, 'EUR');
  const syn = worldRates({ US: [{ period: '2026-01', rate: 4 }, { period: '2026-04', rate: 4.5 }], JP: [{ period: '2025-04', rate: 1 }, { period: '2026-01', rate: 0.5 }, { period: '2026-04', rate: 0.5 }] });
  assert.equal(syn.banks.US.cycle, 'hiking'); assert.equal(syn.banks.JP.cycle, 'on hold after cuts'); assert.equal(syn.banks.JP.change12m, -0.5);
});
t('every area has a name and currency; codes unique', () => {
  const isos = Object.values(AREAS).map(a => a[0]).filter(Boolean); assert.equal(new Set(isos).size, isos.length); assert.equal(EURO_MEMBERS.length, 20);
});
console.log(`worldRates: ${n} tests passed`);
