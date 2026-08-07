import { readFileSync } from 'fs';
import { parseOIMatrix, oiCalcMaxPain } from '../../js/oi.js';
const B='C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel/';
const argmax = a => a.indexOf(Math.max(...a));

function report(label, raw) {
  const m = parseOIMatrix(raw);
  if (!m) return console.log(`${label}: parse null`);
  const anchor = m.futures ?? m.strikes[Math.floor(m.strikes.length/2)];
  const idx = m.strikes.map((k,i)=>({k,i})).sort((a,b)=>Math.abs(a.k-anchor)-Math.abs(b.k-anchor));
  console.log(`\n${label}  (${m.strikes.length} strikes, anchor ${anchor})`);
  console.log('   nStrikes   maxPain    callWall   putWall    totalCallOI  totalPutOI   P/C');
  for (const n of [25, 50, 100, 200, 400, m.strikes.length]) {
    const keep = new Set(idx.slice(0, n).map(x=>x.i));
    const K=[],C=[],P=[];
    m.strikes.forEach((k,i)=>{ if(keep.has(i)){K.push(k);C.push(m.calls[i]);P.push(m.puts[i]);} });
    if (K.length < 3) continue;
    const tc=C.reduce((a,b)=>a+b,0), tp=P.reduce((a,b)=>a+b,0);
    const tag = n >= m.strikes.length ? 'ALL' : String(n);
    console.log(`   ${tag.padEnd(10)} ${String(oiCalcMaxPain(K,C,P)).padEnd(10)} `
      + `${String(K[argmax(C)]).padEnd(10)} ${String(K[argmax(P)]).padEnd(10)} `
      + `${tc.toLocaleString().padEnd(12)} ${tp.toLocaleString().padEnd(12)} ${(tp/Math.max(tc,1)).toFixed(2)}`);
  }
}
report('ES matrix (captured today)', readFileSync(B+'oi_recon/out/2026-07-30/record/merged_03_1221rows.tsv','utf8'));
report('EUR/USD fixture (the oracle)', readFileSync(B+'js/fixtures/oi-eurusd-heatmap-matrix.txt','utf8'));
