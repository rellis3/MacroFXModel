import { parseSettlementTermStructure, parseIVSettlement } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const d = (await r.json()).data;
for (const [sym, code] of [['XAU/USD','G4TQ6'],['US30_USD','YM3Q6'],['EUR/USD','EUUQ6'],['SPX500_USD','EWN6']]) {
  const term = parseSettlementTermStructure(d[sym]?.rawIVTerm || '') || [];
  const row  = term.find(t => t.symbol === code);
  const iv   = parseIVSettlement(d[sym]?.rawIV || '');
  const chain = iv ? iv.calls.reduce((a,b)=>a+b,0) + iv.puts.reduce((a,b)=>a+b,0) : null;
  const termOI = row ? (row.oiCall||0)+(row.oiPut||0) : null;
  const verdict = (termOI==null) ? 'expiry not in term table'
    : (Math.abs(termOI - chain) <= Math.max(5, termOI*0.02) ? 'AGREE -> genuinely thin' : 'DISAGREE -> chain suspect');
  console.log(`${sym.padEnd(12)} ${code.padEnd(7)} chain OI ${String(chain).padEnd(9)} term-table OI ${String(termOI).padEnd(9)} ${verdict}`);
}
