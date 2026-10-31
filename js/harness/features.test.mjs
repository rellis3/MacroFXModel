/**
 * The feature store's contract, on fixtures it writes itself.
 *
 * The fixture parquet is produced by the repo's own Python (pyarrow) at test time, so the
 * round trip pyarrow -> hyparquet is part of what is tested — that is the exact path the
 * real store uses. No committed binary, no reliance on the real features/ directory.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FeatureStore, validateEntry, validateRows, UnregisteredFeature, FeatureNotBuilt, BadFeatureRows, loadManifest } from './features.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The repo's Windows venv when present; otherwise $PYTHON or python3 (Linux/cloud sessions).
const WIN_PY = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
const PY = process.env.PYTHON || (existsSync(WIN_PY) ? WIN_PY : 'python3');
const DIR = mkdtempSync(path.join(tmpdir(), 'featstore-'));

// A monthly macro series with revisions. The reference month is `date`; the value is
// knowable only from `asof`. Two vintages of August: the first print on 12 Sep, revised on
// 14 Oct when September's print arrived. This is the shape that produces lookahead if the
// store gets it wrong.
const SERIES = [
  { date: '2026-07-01', asof: '2026-08-12T23:59:59Z', value: 100.0, vintage: '2026-08-12', source: 'fixture' },
  { date: '2026-08-01', asof: '2026-09-12T23:59:59Z', value: 101.0, vintage: '2026-09-12', source: 'fixture' },  // first print
  { date: '2026-08-01', asof: '2026-10-14T23:59:59Z', value: 101.4, vintage: '2026-10-14', source: 'fixture' },  // revised
  { date: '2026-09-01', asof: '2026-10-14T23:59:59Z', value: 102.0, vintage: '2026-10-14', source: 'fixture' },
];
const EVENTS = [
  { date: '2026-10-14', asof: '2026-10-14T12:30:00Z', value: 1.2, ccy: 'USD', series: 'CPI m/m', actual: '0.3%', estimate: '0.2%', source: 'fred-vintage' },
  { date: '2026-10-15', asof: '2026-10-15T00:30:00Z', value: -0.8, ccy: 'AUD', series: 'Employment Change', actual: '12.1K', estimate: '19.6K', source: 'printed' },
];
const PROFILE = [ { pair: 'eurusd', hour: 10, mean: 0.9, sd: 0.1, max: 1.4, n: 140, asof: '2026-10-16T20:00:00Z' } ];

const MANIFEST = { features: [
  { id: 'fx_cpi', kind: 'series', label: 't', source: 'fixture', sourceRef: 'x', cadence: 'monthly', asofRule: 'vintage', revises: true, countries: ['US'], builder: 'x', unit: 'index', status: 'built' },
  { id: 'fx_events', kind: 'events', label: 't', source: 'fixture', sourceRef: 'x', cadence: 'event', asofRule: 'release_ts', revises: false, countries: [], builder: 'x', unit: 'z', status: 'built' },
  { id: 'fx_profile', kind: 'profile', label: 't', source: 'fixture', sourceRef: 'x', cadence: 'live', asofRule: 'measured', revises: false, countries: [], builder: 'x', unit: 'pips', status: 'built' },
  { id: 'fx_gap', kind: 'series', label: 't', source: null, sourceRef: null, cadence: 'monthly', asofRule: 'vintage', revises: true, countries: ['JP'], builder: null, unit: 'index', status: 'gap', note: 'no source yet' },
  { id: 'fx_registered_unbuilt', kind: 'series', label: 't', source: 'x', sourceRef: 'x', cadence: 'daily', asofRule: 'close+1h', revises: false, countries: [], builder: 'x', unit: 'price' },
] };

before(() => {
  const spec = path.join(DIR, 'spec.json');
  writeFileSync(spec, JSON.stringify({ dir: DIR, tables: { fx_cpi: SERIES, fx_events: EVENTS, fx_profile: PROFILE } }));
  // write with the same library and compression the real builder uses
  execFileSync(PY, ['-c', `
import json,sys,pyarrow as pa,pyarrow.parquet as pq
spec=json.load(open(sys.argv[1]))
for name,rows in spec['tables'].items():
    cols={k:[r.get(k) for r in rows] for k in rows[0].keys()}
    pq.write_table(pa.table(cols), spec['dir']+'/'+name+'.parquet', compression='snappy')
print('ok')`, spec], { stdio: 'pipe' });
});

const store = () => new FeatureStore(MANIFEST, DIR);

test('the real manifest loads and every entry validates', async () => {
  const m = await loadManifest();
  assert.ok(m.features.length >= 40, `only ${m.features.length} features registered`);
  for (const e of m.features) assert.ok(validateEntry(e));
  const ids = m.features.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate feature ids');
});

test('an unregistered feature throws, by name, before anything is read', async () => {
  await assert.rejects(() => store().at('nope', '2026-10-01T00:00:00Z'), UnregisteredFeature);
  assert.throws(() => store().entry('nope'), /not in FEATURE_MANIFEST/);
});

test('a registered gap throws rather than returning nothing', async () => {
  await assert.rejects(() => store().at('fx_gap', '2026-10-01T00:00:00Z'), FeatureNotBuilt);
  await assert.rejects(() => store().at('fx_registered_unbuilt', '2026-10-01T00:00:00Z'), FeatureNotBuilt);
});

test('at() answers by ASOF, not by date — the point-in-time rule', async () => {
  const s = store();
  // 1 Sep: July's print is the newest thing KNOWN, although August's period has ended
  const sep1 = await s.at('fx_cpi', '2026-09-01T12:00:00Z');
  assert.equal(sep1.date, '2026-07-01'); assert.equal(sep1.value, 100.0);
  // 20 Sep: August's FIRST print is known; the revision is not
  const sep20 = await s.at('fx_cpi', '2026-09-20T12:00:00Z');
  assert.equal(sep20.date, '2026-08-01'); assert.equal(sep20.value, 101.0);
  // 15 Oct: September's print and August's revision both landed on the 14th; newest PERIOD wins
  const oct15 = await s.at('fx_cpi', '2026-10-15T00:00:00Z');
  assert.equal(oct15.date, '2026-09-01'); assert.equal(oct15.value, 102.0);
  // before anything was knowable: null, not the first row
  assert.equal(await s.at('fx_cpi', '2026-08-01T00:00:00Z'), null);
  // the exact asof instant is inclusive
  assert.equal((await s.at('fx_cpi', '2026-08-12T23:59:59Z')).value, 100.0);
});

test('at() returns the newest PERIOD known at t, not a later revision of an older period', async () => {
  // July revised on 20 Oct, after August's first print (12 Sep) and September's (14 Oct).
  const rows = [
    { date: '2026-07-01', asof: '2026-08-12T23:59:59Z', value: 100.0, _asofMs: Date.parse('2026-08-12T23:59:59Z') },
    { date: '2026-08-01', asof: '2026-09-12T23:59:59Z', value: 101.0, _asofMs: Date.parse('2026-09-12T23:59:59Z') },
    { date: '2026-09-01', asof: '2026-10-14T23:59:59Z', value: 102.0, _asofMs: Date.parse('2026-10-14T23:59:59Z') },
    { date: '2026-07-01', asof: '2026-10-20T23:59:59Z', value: 99.5, _asofMs: Date.parse('2026-10-20T23:59:59Z') },
    { date: '2026-09-01', asof: '2026-10-25T23:59:59Z', value: 102.3, _asofMs: Date.parse('2026-10-25T23:59:59Z') },
  ];
  const s = store(); s._cache.set('fx_cpi', rows);
  assert.equal((await s.at('fx_cpi', '2026-10-21T00:00:00Z')).value, 102.0);   // September, not the July revision
  assert.equal((await s.at('fx_cpi', '2026-10-26T00:00:00Z')).value, 102.3);   // September's own revision wins
  assert.equal((await s.at('fx_cpi', '2026-09-20T00:00:00Z')).value, 101.0);
  // staleness: on 30 Nov the newest print (25 Oct) is 36 days old
  assert.equal(await s.at('fx_cpi', '2026-11-30T00:00:00Z', { maxStaleDays: 30 }), null);
  assert.equal((await s.at('fx_cpi', '2026-10-26T00:00:00Z', { maxStaleDays: 30 })).value, 102.3);
});

test('series() reconstructs history as it was knowable at a point in time', async () => {
  const s = store();
  // as known on 20 Sep: August is the first print (101.0), September does not exist
  const asSep20 = await s.series('fx_cpi', { asofBefore: '2026-09-20T00:00:00Z' });
  assert.deepEqual(asSep20.map(r => [r.date, r.value]), [['2026-07-01', 100.0], ['2026-08-01', 101.0]]);
  // as known today: August is the REVISED value
  const now = await s.series('fx_cpi');
  assert.deepEqual(now.map(r => [r.date, r.value]), [['2026-07-01', 100.0], ['2026-08-01', 101.4], ['2026-09-01', 102.0]]);
  // date window
  assert.equal((await s.series('fx_cpi', { from: '2026-08-01' })).length, 2);
});

test('a row whose asof precedes its own date is refused at load', () => {
  assert.throws(() => validateRows('x', 'series', [{ date: '2026-09-01', asof: '2026-08-31T23:59:59Z', value: 1 }]), BadFeatureRows);
  assert.throws(() => validateRows('x', 'series', [{ date: '2026-09-01', asof: 'not a time', value: 1 }]), BadFeatureRows);
  assert.throws(() => validateRows('x', 'series', [{ date: '2026-09-01', asof: '2026-09-02T00:00:00Z', value: 'abc' }]), BadFeatureRows);
  assert.doesNotThrow(() => validateRows('x', 'series', [{ date: '2026-09-01', asof: '2026-09-01T00:00:00Z', value: 1 }]));
});

test('events and profiles use their own accessors, and at() refuses them', async () => {
  const s = store();
  const ev = await s.events('fx_events', { from: '2026-10-14T00:00:00Z', to: '2026-10-14T23:59:59Z' });
  assert.equal(ev.length, 1); assert.equal(ev[0].ccy, 'USD'); assert.equal(ev[0].source, 'fred-vintage');
  const pr = await s.profile('fx_profile');
  assert.equal(pr[0].pair, 'eurusd'); assert.equal(pr[0].hour, 10);
  await assert.rejects(() => s.at('fx_events', '2026-10-15T00:00:00Z'), /is events/);
  await assert.rejects(() => s.series('fx_profile'), /is profile/);
});

test('manifest entries with a bad rule or kind are rejected', () => {
  assert.throws(() => validateEntry({ id: 'a', kind: 'series', asofRule: 'whenever', revises: false, countries: [] }), /unknown asofRule/);
  assert.throws(() => validateEntry({ id: 'a', kind: 'blob', asofRule: 'vintage', revises: false, countries: [] }), /kind must be/);
  assert.throws(() => validateEntry({ id: 'a', kind: 'series', asofRule: 'vintage', revises: 'yes', countries: [] }), /revises/);
  assert.ok(validateEntry({ id: 'a', kind: 'series', asofRule: 'fixed_lag:45', revises: true, countries: ['GB'] }));
});

test('coverage() reports built vs gap from the manifest, without reading data', () => {
  const c = store().coverage();
  assert.equal(c.find(x => x.id === 'fx_gap').status, 'gap');
  assert.equal(c.find(x => x.id === 'fx_gap').built, false);
  assert.equal(c.find(x => x.id === 'fx_cpi').built, true);
});
