// Expiry tracker store against an in-memory R2/KV.
//   node js/expiryTrackStore.test.mjs
import { createExpiryTrackStore, seriesKey } from './expiryTrackStore.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

function matrix(futures, dtes, rows) {
  const lines = [`${futures}`, ['Strike', ...dtes.flatMap(d => [`${d} DTE`, ''])].join('\t'), dtes.flatMap(() => ['C', 'P']).join('\t')];
  for (const [k, ...cp] of rows) lines.push([k, ...cp.flat()].join('\t'));
  return lines.join('\n');
}
const day = (fut, d1, d2, bump) => ({ 'EUR/USD': { rawOI: matrix(fut, [d1, d2], [[1.15, [100 + bump, 50], [10, 10]], [1.16, [300, 20], [20, 5]], [1.17, [900 + 2 * bump, 0], [40, 0]]]), futures: fut, spot: fut - 0.004, basis: 0.004 } });

const r2 = new Map(), kv = new Map(), puts = [];
kv.set('oi_raw_2026-11-02', JSON.stringify({ data: day(1.16, 22, 50, 0) }));
kv.set('oi_raw_2026-11-03', JSON.stringify({ data: day(1.161, 21, 49, 50) }));
r2.set('archive/oi_raw/2026/2026-10-30.json', { payload: day(1.158, 25, 53, -20) });   // only in R2 (older than the KV window)
const deps = {
  getJSON: async k => (r2.has(k) ? structuredClone(r2.get(k)) : null),
  putJSON: async (k, v) => { r2.set(k, structuredClone(v)); puts.push(k); return true; },
  kvKeys: async p => [...kv.keys()].filter(k => k.startsWith(p)),
  kvGet: async k => kv.get(k) ?? null,
  archivedDates: async () => new Set(['2026-10-30']),
  log: { warn() {} },
};
const store = createExpiryTrackStore(deps);

console.log('[first fold builds every expiry from KV + R2 days]');
{
  const r = await store.fold();
  ok('three capture days folded', r.folded === 3, JSON.stringify(r));
  ok('two series written (Nov 24 and Dec 22 expiries)', r.series === 2);
  const s = r2.get(seriesKey('EUR/USD', '2026-11-24'));
  ok('the November series has all three capture days', s?.n === 3 && s.first === '2026-10-30', s && `${s.n} ${s.first}`);
  ok('pair name made safe in the key', seriesKey('EUR/USD', '2026-11-24') === 'archive/expiry_track/EUR_USD/2026-11-24.json');
}

console.log('[re-fold only re-reads the last two days; no change -> no series writes]');
{
  puts.length = 0;
  const r = await store.fold();
  ok('two recent days re-folded', r.folded === 2);
  ok('only the index rewritten', puts.length === 1 && puts[0].endsWith('_index.json'), puts.join(','));
}

console.log('[a new night appends]');
{
  kv.set('oi_raw_2026-11-04', JSON.stringify({ data: day(1.162, 20, 48, 120) }));
  const r = await store.fold();
  ok('series rewritten', r.wrote === 2);
  const v = await store.view('EUR/USD', '2026-11-24');
  ok('view has four days and a building streak at 1.17', v.n === 4 && v.days[3].zones.find(z => z.k === 1.17).buildStreak === 3,
    v && String(v.days[3].zones.find(z => z.k === 1.17)?.buildStreak));
  const l = await store.list('EUR/USD');
  ok('list shows both expiries with DTE now', l.series.length === 2 && l.series[0].dteNow === 20, JSON.stringify(l.series[0]));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
