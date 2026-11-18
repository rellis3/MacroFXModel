// node --test js/equityExposure.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { equityExposure, exposureLine, membership } from './equityExposure.js';

test('membership: NVDA is in the Nasdaq 100, the S&P, the Dow and the semis index; TGT only the S&P', () => {
  assert.deepEqual(membership('NVDA'), ['NDX', 'SPX', 'DJI', 'SOX']);
  assert.deepEqual(membership('TGT'), ['SPX']);
  assert.deepEqual(membership('HD'), ['SPX', 'DJI']);
});
test('an earnings item lists the member indices and says one company is a small part of each', () => {
  const x = equityExposure({ title: 'NVIDIA beats', earn: { symbol: 'NVDA' }, read: { impact: { EQUITIES: 2 } } });
  assert.equal(x.dir, 1); assert.equal(exposureLine(x), 'Nasdaq 100 · S&P 500 · Dow · Semiconductors (SOX)'); assert.match(x.basis, /one company/);
});
test('a macro headline lists the region: US names all four US indices, GBP the FTSE, EUR the DAX and Euro Stoxx', () => {
  assert.equal(exposureLine(equityExposure({ title: 'Fed holds rates', touches: ['USD'], read: { impact: { EQUITIES: -1 } } })), 'Nasdaq 100 · S&P 500 · Dow · Russell 2000');
  assert.equal(equityExposure({ title: 'x', touches: ['GBP'], read: { impact: { EQUITIES: -1 } } }).dir, -1);
  assert.equal(exposureLine(equityExposure({ title: 'ECB cuts', touches: ['EUR'] })), 'DAX · Euro Stoxx 50');
});
test('named indices come first and are never listed twice; nothing to say gives an empty line', () => {
  const x = equityExposure({ title: 'Nikkei and the Dow slide as yields jump', touches: ['USD', 'JPY'] });
  assert.deepEqual(x.list.map(i => i.key).slice(0, 2), ['DJI', 'N225']);
  assert.equal(new Set(x.list.map(i => i.key)).size, x.list.length);
  assert.equal(exposureLine(equityExposure({ title: 'Gold steady', touches: ['GOLD'] })), '');
  assert.equal(equityExposure({ title: 'Gold steady' }).dir, 0);
});
test('a symbol in brackets in the text is read as a member company', () => {
  assert.ok(equityExposure({ title: 'Palo Alto Networks (PANW) jumps after results', touches: [] }).list.some(i => i.key === 'NDX'));
});
