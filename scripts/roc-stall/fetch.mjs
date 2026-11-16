// scripts/roc-stall/fetch.mjs: pull long daily closes for the roc-stall-50d universe from Yahoo's keyless chart endpoint
// (laptop only: Yahoo refuses Railway egress). Writes one JSON { SYM: [[YYYY-MM-DD, close], ...] } and a manifest with first/last date,
// n and a sha256 of the file so the run is tied to these exact data. Read-only; no outcome is computed here.
//   node scripts/roc-stall/fetch.mjs <outdir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const UNIVERSE = {
  // equity indices
  SPX: '^GSPC', NDX: '^NDX', RUT: '^RUT', DJI: '^DJI', DAX: '^GDAXI', FTSE: '^FTSE', N225: '^N225', HSI: '^HSI',
  // US sectors (adjusted close)
  XLK: 'XLK', XLF: 'XLF', XLE: 'XLE', XLV: 'XLV', XLY: 'XLY', XLP: 'XLP', XLI: 'XLI', XLU: 'XLU', XLB: 'XLB',
  // commodities (front futures continuous: roll gaps are a known limit, stated in the prereg)
  GOLD: 'GC=F', SILVER: 'SI=F', COPPER: 'HG=F', WTI: 'CL=F',
  // FX
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X', AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X', USDCHF: 'CHF=X', NZDUSD: 'NZDUSD=X',
  // bonds and crypto
  TLT: 'TLT', BTC: 'BTC-USD',
};

async function pull(sym) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=30y&interval=1d&includeAdjustedClose=true`;
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
  const j = await r.json(), res = j?.chart?.result?.[0];
  const ts = res?.timestamp ?? [], adj = res?.indicators?.adjclose?.[0]?.adjclose, cl = res?.indicators?.quote?.[0]?.close ?? [];
  const out = new Map();
  for (let i = 0; i < ts.length; i++) {
    const v = Number.isFinite(adj?.[i]) ? adj[i] : cl[i];
    if (Number.isFinite(v) && v > 0) out.set(new Date(ts[i] * 1000).toISOString().slice(0, 10), v);
  }
  return [...out.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('fetch.mjs')) {
  const dir = process.argv[2] ?? '.';
  fs.mkdirSync(dir, { recursive: true });
  const data = {}, man = {};
  for (const [k, sym] of Object.entries(UNIVERSE)) {
    try {
      const rows = await pull(sym);
      data[k] = rows;
      man[k] = { yahoo: sym, n: rows.length, first: rows[0]?.[0], last: rows.at(-1)?.[0] };
      console.log(k.padEnd(7), sym.padEnd(10), String(rows.length).padStart(6), rows[0]?.[0], rows.at(-1)?.[0]);
    } catch (e) { man[k] = { yahoo: sym, error: String(e.message) }; console.log(k, 'FAILED', e.message); }
    await new Promise(r => setTimeout(r, 400));
  }
  const body = JSON.stringify(data);
  fs.writeFileSync(path.join(dir, 'daily.json'), body);
  man._sha256 = crypto.createHash('sha256').update(body).digest('hex'); man._fetchedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 1));
  console.log('sha256', man._sha256);
}
