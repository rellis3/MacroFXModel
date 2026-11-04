#!/usr/bin/env node
// fx-short-term-fair-value: download the study's inputs (read-only, keyless) into data/fx-short-term-fair-value/.
// Prereg: forge/FX_SHORT_TERM_FAIR_VALUE_PREREG.md.   node scripts/fx-short-term-fair-value/fetch.mjs
//
// FX: FRED H.10 noon New York buying rates (DEXUSEU, DEXUSUK, DEXJPUS, DEXUSAL, DEXCAUS) through fredgraph.csv, which
// needs no key. OANDA (the live page's source) answers 403 from the sandbox; H.10 is the same pairs at noon NY instead
// of the 17:00 NY close. Yields: FRED DGS2/DGS10 (US), Bundesbank (DE), BoE IADB IUDSNPY (5y par, GBP's short leg as
// on the yield board) and IUDMNZC (10y), MoF (JP), Bank of Canada Valet, RBA F2. Risk: FRED VIXCLS.
// Nothing here reads an outcome; it only saves the series and a sha256 of each in manifest.json.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fetchBund, fetchJgbBoth, parseValet, parseRbaF2 } from '../../js/yieldFeeds.js';
import { fetchBoeSeries } from '../../js/boeSeries.js';

const OUT = new URL('../../data/fx-short-term-fair-value/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 MacroFXDashboard' };
const text = async (u, ms = 90_000) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.text(); };
async function fred(id) {
  const csv = await text(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  return csv.trim().split('\n').slice(1).map(l => l.split(',')).map(([date, v]) => ({ date, value: parseFloat(v) })).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value));
}
const jobs = {
  DEXUSEU: () => fred('DEXUSEU'), DEXUSUK: () => fred('DEXUSUK'), DEXJPUS: () => fred('DEXJPUS'), DEXUSAL: () => fred('DEXUSAL'), DEXCAUS: () => fred('DEXCAUS'),
  US2: () => fred('DGS2'), US10: () => fred('DGS10'), VIX: () => fred('VIXCLS'),
  DE2: () => fetchBund('02'), DE10: () => fetchBund('10'),
  GB2: () => fetchBoeSeries('BOE_IUDSNPY', '1998-01-01'), GB10: () => fetchBoeSeries('BOE_IUDMNZC', '1998-01-01'),
  JP: () => fetchJgbBoth(),
  CA: async () => { const ids = ['BD.CDN.2YR.DQ.YLD', 'BD.CDN.10YR.DQ.YLD'], p = parseValet(JSON.parse(await text(`https://www.bankofcanada.ca/valet/observations/${ids.join(',')}/json?start_date=1998-01-01`)), ids); return { y2: p[ids[0]], y10: p[ids[1]] }; },
  AU: async () => { const csv = await text('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv'); return { y2: parseRbaF2(csv, 'Australian Government 2 year bond'), y10: parseRbaF2(csv, 'Australian Government 10 year bond') }; },
};
const manifest = { fetchedAt: new Date().toISOString(), files: {} };
for (const [k, f] of Object.entries(jobs)) {
  const v = await f();
  const parts = Array.isArray(v) ? { [k]: v } : { [`${k}2`]: v.y2, [`${k}10`]: v.y10 };
  for (const [name, s] of Object.entries(parts)) {
    const body = JSON.stringify(s);
    fs.writeFileSync(new URL(`${name}.json`, OUT), body);
    manifest.files[name] = { n: s.length, from: s[0]?.date, to: s.at(-1)?.date, sha256: crypto.createHash('sha256').update(body).digest('hex') };
    console.log(name.padEnd(8), String(s.length).padStart(6), s[0]?.date, '→', s.at(-1)?.date);
  }
}
fs.writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
