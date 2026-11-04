// Every backfill adapter (scripts/systems/backfill.mjs) reads its study's stored trades into valid standard trades.
//   node js/systemBackfill.test.mjs
import assert from 'node:assert/strict';
import { SYSTEMS, SKIPPED, zonedMs } from '../scripts/systems/backfill.mjs';
import { normaliseTrades } from './systemExports.js';
import { OUTCOME_TAG } from './systemReview.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
t('zoned times across DST', () => {
  assert.equal(new Date(zonedMs('2025-07-01', '18:00', 'America/New_York')).toISOString(), '2025-07-01T22:00:00.000Z');
  assert.equal(new Date(zonedMs('2025-01-06', '18:00', 'America/New_York')).toISOString(), '2025-01-06T23:00:00.000Z');
  assert.equal(new Date(zonedMs('2025-07-01', '08:00')).toISOString(), '2025-07-01T07:00:00.000Z');
});
t('ids unique and kebab; skipped list has reasons', () => {
  assert.equal(new Set(SYSTEMS.map(s => s.id)).size, SYSTEMS.length);
  for (const s of SYSTEMS) assert.match(s.id, /^[a-z0-9][a-z0-9-]{1,80}$/);
  for (const s of SKIPPED) assert.ok(s.why);
});
for (const s of SYSTEMS) t(`${s.id}: reads valid trades`, () => {
  const raw = s.trades(), { trades, errors } = normaliseTrades(raw);
  assert.ok(trades.length >= 50, `${trades.length} trades`); assert.ok(errors.length / raw.length < 0.01, `${errors.length} bad rows: ${errors[0]}`);
  for (const x of trades.slice(0, 200)) { assert.ok(Number.isFinite(x.R) && Math.abs(x.R) < 500, `R ${x.R}`); assert.ok(x.exitMs >= x.entryMs && x.entryMs > Date.parse('2000-01-01')); assert.ok(!x.maeR || x.maeR <= 0); }
  // tags that describe the outcome are marked so the filter scan never uses them
  for (const x of trades) for (const g of x.tags) if (/^(win|loss|stop|target|timed-out|stopped)$/i.test(g)) assert.fail(`unmarked outcome tag ${g}`);
});
t('vote atlas: a stop-out is about -1R', () => {
  const v = normaliseTrades(SYSTEMS.find(s => s.id === 'vote-atlas').trades()).trades.filter(x => x.tags.includes('exit:timed-out') === false && x.R < -0.9);
  const med = v.map(x => x.R).sort((a, b) => a - b)[v.length >> 1]; assert.ok(med > -1.15 && med < -0.95, `median stop ${med}`);
  assert.ok(OUTCOME_TAG.test('exit:timed-out'));
});
console.log(`systemBackfill: ${n} tests passed`);
