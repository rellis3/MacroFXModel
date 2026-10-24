#!/usr/bin/env node
/**
 * q6-netliq-rerun: pull every FRED series the three Q6 engines read, from the PUBLIC fredgraph CSV
 * (no FRED_KEY in this session). Values are the same observations the FRED API serves; '.' rows
 * (missing) are dropped, as the API callers drop them. Read-only; writes one local JSON.
 *
 *   node scripts/q6-netliq-rerun/fetch_fred.mjs
 *   -> analysis/output/q6-netliq-rerun/fred.json   { SERIES_ID: [{date, value}], ... , _fetchedAt }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'analysis', 'output', 'q6-netliq-rerun', 'fred.json');
const IDS = [
  // net liquidity + macro-equity + liquidity gate
  'WALCL', 'WTREGEN', 'RRPONTSYD', 'T10Y2Y', 'BAMLH0A0HYM2', 'DFII10', 'NAPM', 'INDPRO', 'MPMIEZMA156N', 'VIXCLS',
  // global liquidity engine (GlobalLiquidity/backtestCore.mjs FRED_IDS)
  'ECBASSETSW', 'JPNASSETS', 'TRESEGCNM052N', 'DEXUSEU', 'DEXJPUS', 'DEXUSUK', 'DEXCHUS', 'SOFR', 'IORB', 'DTWEXBGS', 'T10YIE',
];

async function fredCsv(id) {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  if (!/^observation_date|^DATE/i.test(t)) throw new Error('not a fredgraph CSV');
  return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; })
    .filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
}

const out = { _fetchedAt: new Date().toISOString(), _source: 'fred.stlouisfed.org/graph/fredgraph.csv' };
for (const id of IDS) {
  try { out[id] = await fredCsv(id); console.log(`${id.padEnd(14)} ${String(out[id].length).padStart(6)}  ${out[id][0]?.date} -> ${out[id].at(-1)?.date}`); }
  catch (e) { out[id] = []; console.log(`${id.padEnd(14)} FAILED ${e.message}`); }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('written', path.relative(ROOT, OUT));
