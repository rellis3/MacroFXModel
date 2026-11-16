// node js/cotSource.test.mjs
import assert from 'node:assert/strict';
import { cotSourceState } from './cotSource.js';
import { freshness, healthLine } from './dataFreshness.js';

assert.equal(cotSourceState({ expected: '2026-11-10', atSource: '2026-11-03', held: '2026-11-03' }).state, 'source-late');
assert.equal(cotSourceState({ expected: '2026-11-10', atSource: '2026-11-10', held: '2026-11-03' }).state, 'ours-behind');
assert.equal(cotSourceState({ expected: '2026-11-10', atSource: '2026-11-10', held: '2026-11-10' }).state, 'current');
assert.equal(cotSourceState({ expected: '2026-11-10', atSource: null, held: '2026-11-03' }).state, 'unknown');

// the newsletter's data-check line blames the right side
const row = o => freshness([{ label: 'Speculative positioning', source: 'CFTC', asOf: '2026-11-03', cadence: 'cftc', ...o }], '2026-11-16')[0];
const late = row({ sourceLatest: '2026-11-03' });
assert.equal(late.status, 'source-late');
assert.match(late.note, /CFTC has not published the report for 10 Nov yet/);
const ours = row({ sourceLatest: '2026-11-10' });
assert.equal(ours.status, 'stale');
assert.match(ours.note, /is out at the CFTC/);
const unknown = row({});
assert.equal(unknown.status, 'stale'); assert.match(unknown.note, /is out/);
assert.match(healthLine([late]), /Data check: .*has not published/);
console.log('cotSource: ok');
