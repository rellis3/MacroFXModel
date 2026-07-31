import { readFileSync } from 'fs';
import { parseOIMatrix } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const P = parseOIMatrix((await r.json()).data['EUR/USD'].rawOI);
const F = parseOIMatrix(readFileSync('out/2026-07-30/fetch/EUR_USD_oi_matrix.tsv','utf8'));
const V = parseOIMatrix(readFileSync('out/2026-07-30/fetch/EUR_USD_vol_matrix.tsv','utf8'));
const m = a => new Map(a.strikes.map((k,i)=>[k,[a.calls[i],a.puts[i]]]));
const pm=m(P), fm=m(F), vm=m(V);
let hit=0, tot=0, dcAll=0, dpAll=0, vcAll=0, vpAll=0;
const rows=[];
for (const k of [...pm.keys()].filter(k=>fm.has(k)).sort((a,b)=>a-b)) {
  const [pc,pp]=pm.get(k), [fc,fp]=fm.get(k), [vc,vp]=vm.get(k)||[0,0];
  const dc=pc-fc, dp=pp-fp;
  if (dc===0 && dp===0) continue;
  tot++; dcAll+=dc; dpAll+=dp; vcAll+=vc; vpAll+=vp;
  const near = (a,b)=> b>0 && Math.abs(a-b)/b < 0.25;
  if (near(dc,vc) || near(dp,vp)) hit++;
  rows.push(`  ${String(k).padEnd(8)} dCall ${String(dc).padStart(6)} vs vol ${String(vc).padStart(6)}   dPut ${String(dp).padStart(6)} vs vol ${String(vp).padStart(6)}`);
}
console.log('per-strike: (paste - fetch) OI  vs  fetched VOLUME\n');
console.log(rows.slice(0,14).join('\n'));
console.log(`\n  ${tot} differing strikes · ${hit} where the gap is within 25% of that strike's volume`);
console.log(`  TOTALS: dCall ${dcAll}  vs volCall ${vcAll}   |   dPut ${dpAll}  vs volPut ${vpAll}`);
