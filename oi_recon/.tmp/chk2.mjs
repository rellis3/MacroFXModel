import { readFileSync } from 'fs';
import { parseSettlementTermStructure } from '../../js/oi.js';
const B='C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel/';
const show = (label, raw) => {
  const r = parseSettlementTermStructure(raw);
  if (!r) return console.log(`${label}: NULL`);
  console.log(`${label}: ${r.length} expiries`);
  for (const x of r.slice(0,3))
    console.log(`   ${x.symbol} dte=${x.dte} iv=${x.iv} straddle=${x.straddle} oiCall=${x.oiCall} oiPut=${x.oiPut}`);
};
show('FIXTURE term (17 col)', readFileSync(B+'js/fixtures/oi-eurusd-settlements-term.txt','utf8'));
console.log();
show('CAPTURED term (23 col)', readFileSync(B+'oi_recon/out/2026-07-29/record/merged_08_31rows.tsv','utf8'));
