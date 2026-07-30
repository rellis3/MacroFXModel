import { parseIVSettlement } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const d = (await r.json()).data;
for (const sym of ['EUR/USD','XAU/USD','NAS100_USD','US30_USD','SPX500_USD']) {
  const raw = d[sym]?.rawIV || '';
  const lines = raw.replace(/\r/g,'').split('\n').filter(l=>l.trim());
  const iv = raw ? parseIVSettlement(raw) : null;
  const cols = lines.map(l=>l.split('\t').length);
  console.log(`\n=== ${sym} — ${lines.length} lines, col counts ${[...new Set(cols)].join('/')}`);
  console.log('  L1:', JSON.stringify(lines[0]?.slice(0,110)));
  console.log('  L2:', JSON.stringify(lines[1]?.slice(0,110)));
  console.log('  L3:', JSON.stringify(lines[2]?.slice(0,110)));
  console.log('  L4:', JSON.stringify(lines[3]?.slice(0,110)));
  if (iv) console.log(`  parsed: ${iv.strikes.length} strikes, callOI ${iv.calls.reduce((a,b)=>a+b,0)}, putOI ${iv.puts.reduce((a,b)=>a+b,0)}, dte ${iv.dte}, code ${iv.expiryCode}`);
  else console.log('  parsed: NULL');
}
