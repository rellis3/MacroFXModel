import { FeatureStore } from './features_copy.mjs';
// ALFRED-style rows for a monthly series: each row = (period date, asof when that VALUE first appeared).
// Jan print on Feb 11; a benchmark revision of an OLD period (2025-05) published Feb 14; Feb print on Mar 11.
const rows = [
  { date: '2025-12-01', asof: '2026-01-13T23:59:59Z', value: 3.0, vintage: '2026-01-13' },
  { date: '2026-01-01', asof: '2026-02-11T23:59:59Z', value: 3.1, vintage: '2026-02-11' },
  { date: '2025-05-01', asof: '2026-02-14T23:59:59Z', value: 2.2, vintage: '2026-02-14' },   // annual revision of an old month
  { date: '2026-02-01', asof: '2026-03-11T23:59:59Z', value: 3.3, vintage: '2026-03-11' },
];
const man = { features: [{ id: 'x', kind: 'series', asofRule: 'vintage', status: 'built' }] };
const s = new FeatureStore(man, '/nonexistent');
s._cache.set('x', rows.map(r => ({ ...r, _asofMs: Date.parse(r.asof) })).sort((a, b) => a._asofMs - b._asofMs));
const v = await s.at('x', '2026-02-20T00:00:00Z');
console.log('at(2026-02-20) ->', v, '\nexpected the latest PERIOD known then: 2026-01-01 = 3.1');
