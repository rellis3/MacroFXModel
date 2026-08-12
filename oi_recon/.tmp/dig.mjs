import { readFileSync } from 'fs';
import { parseOIMatrix } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const P = parseOIMatrix((await r.json()).data['EUR/USD'].rawOI);
const F = parseOIMatrix(readFileSync('out/2026-07-30/fetch/EUR_USD_oi_matrix.tsv','utf8'));
const pm=new Map(P.strikes.map((k,i)=>[k,[P.calls[i],P.puts[i]]]));
const fm=new Map(F.strikes.map((k,i)=>[k,[F.calls[i],F.puts[i]]]));
const ks=[...pm.keys()].filter(k=>fm.has(k)).sort((a,b)=>a-b);
let cDiff=0,pDiff=0,cSum=0,pSum=0,cP=0,cF=0,pP=0,pF=0;
for(const k of ks){const [a,b]=pm.get(k),[c,d]=fm.get(k);
  if(a!==c){cDiff++;cSum+=a-c}ic: if(b!==d){pDiff++;pSum+=b-d}
  cP+=a;cF+=c;pP+=b;pF+=d;}
console.log(`shared strikes: ${ks.length}`);
console.log(`CALLS  differ on ${cDiff}  | paste total ${cP.toLocaleString()}  fetch ${cF.toLocaleString()}  (paste-fetch = ${cSum.toLocaleString()})`);
console.log(`PUTS   differ on ${pDiff}  | paste total ${pP.toLocaleString()}  fetch ${pF.toLocaleString()}  (paste-fetch = ${pSum.toLocaleString()})`);
console.log('\nevery differing strike (paste vs fetch):');
for(const k of ks){const [a,b]=pm.get(k),[c,d]=fm.get(k);
  if(a===c&&b===d) continue;
  const cm=a===c?'   =':(a>c?' P>F':' F>P'), pmk=b===d?'   =':(b>d?' P>F':' F>P');
  console.log(`  ${String(k).padEnd(8)} C ${String(a).padStart(6)}/${String(c).padStart(6)}${cm}   P ${String(b).padStart(6)}/${String(d).padStart(6)}${pmk}`);
}
