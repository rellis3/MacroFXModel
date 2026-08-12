import { readFileSync } from 'fs';
import { parseIVSettlement, parseOIMatrix, oiCalcMaxPain } from '../../js/oi.js';
const D='C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel/oi_recon/out/2026-07-29/record/';
const rd = f => readFileSync(D+f,'utf8');

console.log('=== CAPTURED CHAIN (merged_09, 20 cols) through parseIVSettlement ===');
const iv = parseIVSettlement(rd('merged_09_70rows.tsv'));
if (!iv) console.log('  PARSE RETURNED NULL');
else {
  const {strikes:K,calls:C,puts:P} = iv;
  const wall = a => K[a.indexOf(Math.max(...a))];
  console.log('  strikes:', K.length, ' expiryCode:', iv.expiryCode ?? '(none)');
  console.log('  total call OI:', C.reduce((a,b)=>a+b,0).toLocaleString(),
              ' total put OI:', P.reduce((a,b)=>a+b,0).toLocaleString());
  console.log('  call wall:', wall(C), ' put wall:', wall(P), ' max pain:', oiCalcMaxPain(K,C,P));
  console.log('  first 3 rows -> K/C/P:', K.slice(0,3), C.slice(0,3), P.slice(0,3));
}

console.log('\n=== FIXTURE CHAIN (14 cols) for comparison ===');
const f = parseIVSettlement(readFileSync('C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel/js/fixtures/oi-eurusd-mo4n6-settlements.txt','utf8'));
console.log('  strikes:', f.strikes.length, ' total call OI:',
  f.calls.reduce((a,b)=>a+b,0).toLocaleString(), ' total put OI:', f.puts.reduce((a,b)=>a+b,0).toLocaleString());

console.log('\n=== CAPTURED MATRIX (merged_07) through parseOIMatrix ===');
const m = parseOIMatrix(rd('merged_07_214rows.tsv'));
console.log('  strikes:', m?.strikes?.length ?? 'null', ' primaryExpiry:', JSON.stringify(m?.primaryExpiry ?? null));
