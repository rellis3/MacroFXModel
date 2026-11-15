// node js/corrHistoryPersist.test.mjs
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { saveCorrHistory, restoreCorrHistory, CORR_R2_KEY } from './corrHistoryPersist.js';
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const NOW = Date.parse('2026-11-15T16:00:00Z'), MAX = 6 * 3600e3;
const big = gen => JSON.stringify({ generated: gen, pairs: ['EURUSD'], records: new Array(200).fill({ corr: { a: 0.1 } }) });

await t('save gzips the file into R2 under the state key; refuses an empty file; reports a failed put; never throws', async () => {
  const puts = []; const raw = big('2026-11-15T15:33:41Z');
  const r = await saveCorrHistory({ readFile: () => raw, putBuffer: async (k, b) => { puts.push([k, b.length]); return true; }, configured: () => true });
  assert.ok(r.ok && r.bytes < raw.length / 2 && puts[0][0] === CORR_R2_KEY);
  assert.equal((await saveCorrHistory({ readFile: () => '', putBuffer: async () => true, configured: () => true })).ok, false);
  assert.equal((await saveCorrHistory({ readFile: () => raw, putBuffer: async () => false, configured: () => true })).reason, 'R2 put failed');
  assert.equal((await saveCorrHistory({ readFile: () => raw, putBuffer: async () => true, configured: () => false })).reason, 'R2 not configured');
  assert.equal((await saveCorrHistory({ readFile: () => { throw new Error('boom'); }, putBuffer: async () => true, configured: () => true })).reason, 'boom');
});
await t('restore: puts a fresh copy back and stamps the file with the data time, not the restore time', async () => {
  let written = null, touched = null;
  const r = await restoreCorrHistory({ exists: () => false, getBuffer: async () => gzipSync(big('2026-11-15T14:00:00Z')), writeFile: s => { written = s; }, touch: ms => { touched = ms; }, configured: () => true, now: NOW, maxAgeMs: MAX });
  assert.ok(r.restored && r.ageH === 2 && touched === Date.parse('2026-11-15T14:00:00Z') && JSON.parse(written).pairs[0] === 'EURUSD');
});
await t('restore leaves things alone when: disk copy exists, R2 empty, copy too old, copy unparseable, no generated time, R2 not configured', async () => {
  const base = { writeFile: () => assert.fail('wrote'), touch: () => assert.fail('touched'), configured: () => true, now: NOW, maxAgeMs: MAX };
  assert.equal((await restoreCorrHistory({ ...base, exists: () => true, getBuffer: async () => assert.fail('fetched') })).reason, 'disk copy present');
  assert.equal((await restoreCorrHistory({ ...base, exists: () => false, getBuffer: async () => null })).reason, 'no copy in R2');
  assert.match((await restoreCorrHistory({ ...base, exists: () => false, getBuffer: async () => gzipSync(big('2026-11-15T05:00:00Z')) })).reason, /11\.0h old/);
  assert.ok(!(await restoreCorrHistory({ ...base, exists: () => false, getBuffer: async () => Buffer.from('not gzip') })).restored);
  assert.equal((await restoreCorrHistory({ ...base, exists: () => false, getBuffer: async () => gzipSync(JSON.stringify({ x: 1 })) })).reason, 'copy has no generated time');
  assert.equal((await restoreCorrHistory({ ...base, exists: () => false, configured: () => false, getBuffer: async () => null })).reason, 'R2 not configured');
});
console.log(`\n${n} passed`);
