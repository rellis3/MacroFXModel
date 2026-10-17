/**
 * What the feature store holds, as a table. The step-1 "done when" check:
 * every feature a study needs has an asof rule, a status, and a first/last asof.
 *
 *   node js/harness/coverage.mjs            # everything
 *   node js/harness/coverage.mjs gaps       # only what is not built
 *   node js/harness/coverage.mjs stale 30   # built features whose lastAsof is older than 30 days
 */
import { openStore } from './features.mjs';

const mode = process.argv[2] ?? 'all';
const days = Number(process.argv[3] ?? 30);
const store = await openStore();
let rows = store.coverage();
const now = Date.now();
const ageDays = r => (r.lastAsof ? Math.round((now - Date.parse(r.lastAsof)) / 86400000) : null);

if (mode === 'gaps') rows = rows.filter(r => !r.built);
if (mode === 'stale') rows = rows.filter(r => r.built && ageDays(r) != null && ageDays(r) > days);

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
console.log(pad('feature', 22), pad('kind', 8), pad('asof rule', 18), pad('status', 8), pad('rows', 7), pad('first asof', 11), pad('last asof', 11), 'age d');
for (const r of rows) {
  console.log(pad(r.id, 22), pad(r.kind, 8), pad(r.asofRule, 18), pad(r.status, 8), pad(r.rows ?? '', 7),
    pad((r.firstAsof ?? '').slice(0, 10), 11), pad((r.lastAsof ?? '').slice(0, 10), 11), ageDays(r) ?? '');
}
const all = store.coverage();
console.log(`\n${all.filter(r => r.built).length} built · ${all.filter(r => r.status === 'gap').length} registered gaps · ${all.filter(r => !r.built && r.status !== 'gap').length} registered but unbuilt · ${all.length} total`);
for (const r of all.filter(r => r.status === 'error')) console.log(`  ERROR ${r.id}: ${store.entry(r.id).error ?? ''}`);
