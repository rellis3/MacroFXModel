import { parseOIMatrix, parseIVSettlement, parseSettlementTermStructure, oiCalcMaxPain } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const d = (await r.json()).data;
const am = a => a.indexOf(Math.max(...a));
console.log('sym          strikes  futures     primary      maxPain     callWall    putWall     chainOI    termOI');
for (const [sym, e] of Object.entries(d)) {
  const m = parseOIMatrix(e.rawOI || '');
  if (!m) { console.log(`${sym.padEnd(12)} rawOI DID NOT PARSE`); continue; }
  const iv = e.rawIV ? parseIVSettlement(e.rawIV) : null;
  const tm = e.rawIVTerm ? parseSettlementTermStructure(e.rawIVTerm) : null;
  const chainOI = iv ? iv.calls.reduce((a,b)=>a+b,0) + iv.puts.reduce((a,b)=>a+b,0) : null;
  const termOI  = tm ? tm.reduce((a,x)=>a+(x.oiCall||0)+(x.oiPut||0),0) : null;
  const frac = tm ? tm.filter(x=>!Number.isInteger(x.oiCall)||!Number.isInteger(x.oiPut)).length : 0;
  console.log(`${sym.padEnd(12)} ${String(m.strikes.length).padEnd(8)} `
    + `${String(m.futures ?? '-').padEnd(11)} ${String(m.primaryExpiry?.code ?? '-').padEnd(12)} `
    + `${String(oiCalcMaxPain(m.strikes,m.calls,m.puts)).padEnd(11)} `
    + `${String(m.strikes[am(m.calls)]).padEnd(11)} ${String(m.strikes[am(m.puts)]).padEnd(11)} `
    + `${String(chainOI ?? '-').padEnd(10)} ${termOI==null?'-':Math.round(termOI)}${frac?` (${frac} FRAC!)`:''}`);
}
