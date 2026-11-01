#!/usr/bin/env node
// Real-data check for the Market State Engine (owner, 2026-11-01: "make sure you are using real data").
//
//   node scripts/check_state_real.mjs                          checks http://localhost:3000/api/state
//   node scripts/check_state_real.mjs https://<host>/api/state checks a deployed server
//
// Fails (exit 1) when: the document carries any fixture/synthetic marker; a market tier has no real reading; the
// newest market print is older than MAX_AGE_DAYS; the long-history sections are missing; or a source label is empty.
// Prints every input with its source and age, so a person can see where each number came from.
const url = process.argv[2] || 'http://localhost:3000/api/state';
const MAX_AGE_DAYS = 7;
const problems = [], notes = [];

const res = await fetch(url, { signal: AbortSignal.timeout(180_000) }).catch(e => ({ ok: false, statusText: e.message }));
if (!res.ok) { console.error(`✗ could not read ${url}: ${res.status ?? ''} ${res.statusText ?? ''}`); process.exit(1); }
const st = await res.json();

const text = JSON.stringify(st);
for (const m of ['synthetic', 'fixture', 'Synthetic test document', 'test document']) if (text.toLowerCase().includes(m.toLowerCase())) problems.push(`document contains the marker "${m}"`);

const ageDays = d => (d ? Math.round((Date.now() - Date.parse(d)) / 864e5) : null);
console.log(`State document ${url}\n  generated ${st.generatedAt}, newest print ${st.asOf} (${ageDays(st.asOf)} days old)\n`);
if (ageDays(st.asOf) == null || ageDays(st.asOf) > MAX_AGE_DAYS) problems.push(`newest market print ${st.asOf} is older than ${MAX_AGE_DAYS} days`);

console.log('Market tiers (loaded / total, source of each reading):');
for (const t of st.tiers ?? []) {
  const loaded = t.readings.filter(r => !r.missing);
  console.log(`  ${t.short.padEnd(9)} ${loaded.length}/${t.readings.length}  ${t.state?.headline ?? ''}`);
  for (const r of loaded) console.log(`      ${r.key.padEnd(9)} ${String(r.last).slice(0, 9).padEnd(10)} ${r.asOf}  ← ${st.sources?.[r.key] ?? '(no source label)'}`);
  if (!loaded.length) problems.push(`tier ${t.id} has no real reading`);
  for (const r of loaded) if (!st.sources?.[r.key]) problems.push(`${r.key} has no source label`);
}
const stale = (st.health ?? []).filter(h => h.stale);
if (stale.length) notes.push(`${stale.length} stale input(s): ${stale.map(h => `${h.key} (${h.ageDays}d)`).join(', ')}`);

console.log('\nLong history:');
const long = st.history?.long ?? [];
for (const r of long) console.log(`  ${r.id.padEnd(13)} last ${String(r.ctx.last).slice(0, 8).padEnd(9)} ${r.ctx.asOf}  since ${r.ctx.since}  all-history pct ${r.ctx.pctAll}  ← ${st.history?.sources?.[r.id] ?? 'derived'}`);
if (long.length < 5) problems.push('long-history section missing or thin');
if ((st.history?.cot ?? []).length < 10) problems.push('COT board missing or thin');
if (Object.keys(st.history?.surprises ?? {}).length < 6) problems.push('surprise history missing');
const liq = st.layers?.liquidity;
if (!liq?.net) problems.push('liquidity layer missing (FRED WALCL/WTREGEN/RRPONTSYD)');
else console.log(`\nLiquidity: net $${liq.net.last} bn as of ${liq.net.asOf} (${liq.net.impulse}, 13w ${liq.net.chg13w}); ${liq.rows.map(r => `${r.id} ${r.asOf}`).join(', ')}`);
if (liq?.warnings?.length) problems.push(`liquidity unit warnings: ${liq.warnings.join('; ')}`);

console.log('\nSections:');
const g = st.global ?? {};
console.log(`  global: env ${g.envLabel ? 'yes' : 'not loaded'}, regime ${g.regime ? 'yes' : 'not loaded'}, risk ${g.risk?.level ?? 'not loaded'}, funding ${g.funding ? 'yes' : 'not loaded'}`);
console.log(`  economies: ${(st.economies?.rows ?? []).filter(r => r.surprise?.score != null || r.yield10?.value != null).length} of ${(st.economies?.rows ?? []).length} with data`);
console.log(`  layers: vol ${st.layers?.vol?.rows?.length ?? 0}, COT ${st.layers?.positioning?.rows?.length ?? 0}, options ${st.layers?.options?.rows?.length ?? 0}, liquidity ${st.layers?.liquidity?.rows?.length ?? 0}`);
console.log(`  edges: ${(st.edges ?? []).filter(e => e.active !== null).length} of ${(st.edges ?? []).length} evaluable`);
console.log(`  playbook: ${(st.playbook?.frames ?? []).filter(f => f.state).length} of ${(st.playbook?.frames ?? []).length} frameworks with a call`);
if (st.errors?.length) { console.log('\nInputs that failed (shown on the page as "not loaded"):'); for (const e of st.errors) console.log(`  - ${e.source}: ${e.error}`); }

for (const n of notes) console.log(`\nnote: ${n}`);
if (problems.length) { console.log('\nFAILED:'); for (const p of problems) console.log(`  ✗ ${p}`); process.exit(1); }
console.log('\nOK: every section shown is built from real, dated, sourced data.');
