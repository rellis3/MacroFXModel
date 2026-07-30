import { oiMatrixTermStructure, parseIVSettlement } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const d = (await r.json()).data;
for (const sym of ['EUR/USD','SPX500_USD','XAU/USD','US30_USD']) {
  const iv = parseIVSettlement(d[sym]?.rawIV || '');
  if (!iv) { console.log(`${sym}: no chain`); continue; }
  const chain = iv.calls.reduce((a,b)=>a+b,0) + iv.puts.reduce((a,b)=>a+b,0);
  const ts = oiMatrixTermStructure(d[sym]?.rawOI || '') || [];
  // Match the matrix column by DTE, the only key both sides share here.
  const near = ts.filter(t => t.dte != null)
                 .sort((a,b)=>Math.abs(a.dte-iv.dte)-Math.abs(b.dte-iv.dte))[0];
  console.log(`${sym.padEnd(12)} chain(${String(iv.dte).padEnd(6)} DTE, ${String(iv.strikes.length).padEnd(3)} strikes) OI ${String(chain).padEnd(8)}`
    + ` | matrix col dte ${String(near?.dte ?? '-').padEnd(5)} totalOI ${String(near?.totalOI ?? '-').padEnd(9)}`
    + ` | ratio ${near?.totalOI ? (chain/near.totalOI).toFixed(2) : '-'}`);
}
