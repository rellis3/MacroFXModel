#!/usr/bin/env node
// hedge-finder-book: download the study's inputs (read-only, keyless) into data/hedge-finder-book/.
// Prereg: forge/HEDGE_FINDER_BOOK_PREREG.md.   NODE_USE_ENV_PROXY=1 node scripts/hedge-finder-book/fetch.mjs
// (in a cloud session Node's fetch must be told to use the agent proxy, or FRED answers 503)
//
// FRED H.10 noon New York rates for the eight currencies' USD legs plus CNY and ZAR, FRED WTI and Brent spot and the
// Nasdaq 100 close, through fredgraph.csv (no key; latest vintage, which for market prices is the only vintage).
// OANDA answers 403 from the sandbox and Yahoo rate-limits it, so gold, silver, platinum, copper, the S&P 500, the Dow
// and the Russell 2000 have no long keyless daily source here and are left out of the candidate pool (prereg §3).
// Nothing here reads an outcome; it only saves the series and a sha256 of each in manifest.json.
import fs from 'node:fs';
import crypto from 'node:crypto';

const OUT = new URL('../../data/hedge-finder-book/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const IDS = ['DEXUSEU', 'DEXUSUK', 'DEXJPUS', 'DEXUSAL', 'DEXUSNZ', 'DEXCAUS', 'DEXSZUS', 'DEXCHUS', 'DEXSFUS', 'DCOILWTICO', 'DCOILBRENTEU', 'NASDAQ100'];
async function fred(id) {
  let csv = null;
  for (let attempt = 1; attempt <= 5 && csv == null; attempt++) {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(120_000) }).catch(e => ({ ok: false, status: e.message }));
    if (r.ok) csv = await r.text();
    else { console.warn(`${id} attempt ${attempt}: HTTP ${r.status}`); if (attempt === 5) throw new Error(`${id} HTTP ${r.status}`); await new Promise(res => setTimeout(res, 5000 * attempt)); }
  }
  return csv.trim().split('\n').slice(1).map(l => l.split(',')).map(([date, v]) => ({ date, value: parseFloat(v) })).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value));
}
const manifest = { fetchedAt: new Date().toISOString(), source: 'fred.stlouisfed.org/graph/fredgraph.csv', files: {} };
for (const id of IDS) {
  const s = await fred(id);
  const body = JSON.stringify(s);
  fs.writeFileSync(new URL(`${id}.json`, OUT), body);
  manifest.files[id] = { n: s.length, from: s[0]?.date, to: s.at(-1)?.date, sha256: crypto.createHash('sha256').update(body).digest('hex') };
  console.log(id.padEnd(13), String(s.length).padStart(6), s[0]?.date, '→', s.at(-1)?.date);
}
fs.writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
