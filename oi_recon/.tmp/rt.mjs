import { readFileSync } from 'fs';
import { parseOIMatrix, oiCalcMaxPain } from '../../js/oi.js';
const raw = readFileSync(process.argv[2], 'utf8');
const m = parseOIMatrix(raw);
if (!m) { console.log('PARSE RETURNED NULL'); process.exit(1); }
const tc = m.calls.reduce((a,b)=>a+b,0), tp = m.puts.reduce((a,b)=>a+b,0);
const wall = a => m.strikes[a.indexOf(Math.max(...a))];
console.log(`  strikes=${m.strikes.length}  futures=${m.futures}  totalCallOI=${tc.toLocaleString()}  totalPutOI=${tp.toLocaleString()}`);
console.log(`  callWall=${wall(m.calls)}  putWall=${wall(m.puts)}  maxPain=${oiCalcMaxPain(m.strikes,m.calls,m.puts)}`);
console.log(`  primaryExpiry=${JSON.stringify(m.primaryExpiry)}`);
