// How informative would each candidate chain chip be? Descriptive, over the 5-year market bundle.
//   node analysis/chain_candidates.mjs [path/to/drill-series.json]
//
// A chain link is judged on a 20-calendar-day window: both ends must have moved past their noise floors, then it is HOLDING if they moved the way the
// textbook says and BROKEN if not (js/macroChain.js evaluateChain). So a chip is worth adding when its link
//   (a) is judged often      -> both ends actually move in 20 days, otherwise the chip is "quiet" most days and says nothing
//   (b) holds most of the time -> the textbook is reliable, so a BREAK is news. A link that holds 50% is a coin flip: a break tells you nothing.
// This is a DESCRIPTIVE screen of the textbook, not a forecast test. Nothing here says the link predicts the next move; the desk's tests find direction
// claims null. It only decides which links are informative enough to draw. Candidate floors are proposals (marked), the existing ones are the chain's own.
import fs from 'node:fs';
import { CHAIN_NODES, CHAIN_LINKS } from '../js/macroChain.js';

const file = process.argv[2] ?? 'C:/Users/relli/AppData/Local/Temp/claude/c--Users-relli-OneDrive-Documents-Programming-Trading-v2-trading-model-MacroFXModel/ada3f133-3642-4302-83f2-c5e05d3e9659/scratchpad/ep/drill-series.json';
const d = JSON.parse(fs.readFileSync(file, 'utf8')), S = d.series, D = d.dates, N = D.length - 1;

// node key -> drill series key (existing nodes), plus the candidates' own nodes: unit, floor (PROPOSED), label
const SERIES = { real: 'tips', dxy: 'dxy', oil: 'oil', gold: 'gold', copper: 'copper', btc: 'btc', nq: 'nq', spx: 'spx', us2y: 'us2y', us10y: 'us10y', us30y: 'us30y', bei: 'bei', vix: 'vix', hy: 'hy', audusd: 'audusd', usdcad: 'usdcad', usdjpy: 'usdjpy', eurusd: 'eurusd', gbpusd: 'gbpusd' };
const CAND_NODES = {
  smh: { s: 'smh', unit: 'pct', floor: 5, label: 'Semiconductors (SMH)' }, xle: { s: 'xle', unit: 'pct', floor: 3, label: 'Energy stocks (XLE)' }, xlre: { s: 'xlre', unit: 'pct', floor: 3, label: 'Real-estate stocks (XLRE)' },
  xlu: { s: 'xlu', unit: 'pct', floor: 3, label: 'Utilities (XLU)' }, xlf: { s: 'xlf', unit: 'pct', floor: 3, label: 'Financials (XLF)' }, r2k: { s: 'r2k', unit: 'pct', floor: 3, label: 'Small caps (R2K)' },
  jp225: { s: 'jp225', unit: 'pct', floor: 3, label: 'Nikkei 225' }, de30: { s: 'de30', unit: 'pct', floor: 3, label: 'DAX' }, uk100: { s: 'uk100', unit: 'pct', floor: 2.5, label: 'FTSE 100' },
  move: { s: 'move', unit: 'pt', floor: 10, label: 'Bond-market fear (MOVE)' }, ccc: { s: 'ccc', unit: 'bp', floor: Number(process.env.CCC_FLOOR ?? 100), label: 'CCC credit spread' }, ig: { s: 'ig', unit: 'bp', floor: 8, label: 'Investment-grade spread' },
  natgas: { s: 'natgas', unit: 'pct', floor: 10, label: 'Natural gas' }, silver: { s: 'silver', unit: 'pct', floor: 3, label: 'Silver' }, brent: { s: 'brent', unit: 'pct', floor: 3, label: 'Brent' },
  skew: { s: 'skew', unit: 'pt', floor: 8, label: 'Crash-protection price (SKEW)' }, vix9d: { s: 'vix9d', unit: 'pt', floor: 3, label: 'VIX 9-day' }, xlp: { s: 'xlp', unit: 'pct', floor: 3, label: 'Staples (XLP)' }, xlk: { s: 'xlk', unit: 'pct', floor: 3, label: 'Technology (XLK)' },
};
const nodeDef = k => CHAIN_NODES[k] ? { s: SERIES[k], unit: CHAIN_NODES[k].unit, floor: CHAIN_NODES[k].floor, label: CHAIN_NODES[k].label } : CAND_NODES[k];

// [from, to, sign, why]  sign +1: move together, -1: opposite
const CANDIDATES = [
  ['smh', 'nq', 1, 'The Nasdaq is a handful of chip and AI names; semiconductors lead it'],
  ['oil', 'xle', 1, 'Energy stocks follow the oil price'],
  ['us10y', 'xlre', -1, 'Real estate is a bond proxy: higher yields hurt it'],
  ['us10y', 'xlu', -1, 'Utilities are a bond proxy: higher yields hurt them'],
  ['us2y', 'r2k', -1, 'Small caps carry floating-rate debt: higher short rates hurt'],
  ['us10y', 'xlf', 1, 'Banks earn more as yields rise (steeper curve)'],
  ['usdjpy', 'jp225', 1, 'A weaker yen lifts Japanese exporters'],
  ['eurusd', 'de30', -1, 'A weaker euro lifts German exporters'],
  ['gbpusd', 'uk100', -1, 'A weaker pound lifts the multinational-heavy FTSE'],
  ['move', 'vix', 1, 'Bond-market fear spills into equity fear'],
  ['hy', 'ccc', 1, 'The riskiest credit moves first and furthest'],
  ['ccc', 'nq', -1, 'Distress in the riskiest credit is a warning for growth stocks'],
  ['nq', 'btc', 1, 'Risk appetite carries bitcoin'],
  ['natgas', 'eurusd', -1, 'Dearer gas hurts Europe\u2019s terms of trade'],
  ['silver', 'gold', 1, 'Precious metals move as a group'],
  ['brent', 'oil', 1, 'Brent and WTI should agree (a check on the oil chip)'],
  ['vix', 'skew', 1, 'Fear and the price of crash protection'],
  ['xlp', 'xlk', -1, 'Defensives up while tech falls = rotation to safety'],
];
const BASE = CHAIN_LINKS.map(l => [l.from, l.to, l.sign, l.id]);

// delta over 20 calendar days ending at index i, in the node's own unit; null if either end missing
function delta(def, i) {
  const a = S[def.s]; if (!a) return null; let j = i; while (j > 0 && a[j] == null) j--; if (a[j] == null) return null;
  const cut = Date.parse(D[j]) - 20 * 864e5; let k = j; while (k > 0 && (a[k] == null || Date.parse(D[k]) > cut)) k--; if (a[k] == null || Math.abs(Date.parse(D[j]) - Date.parse(D[i])) > 6 * 864e5) return null;
  const last = a[j], ref = a[k];
  return def.unit === 'pct' ? (ref ? (last / ref - 1) * 100 : null) : def.unit === 'bp' ? (last - ref) * 100 : last - ref;
}
function stat(from, to, sign) {
  const A = nodeDef(from), B = nodeDef(to); if (!A || !B || !S[A.s] || !S[B.s]) return null;
  let n = 0, judged = 0, hold = 0;
  for (let i = 60; i <= N; i += 3) { const da = delta(A, i), db = delta(B, i); if (da == null || db == null) continue; n++; if (Math.abs(da) < A.floor || Math.abs(db) < B.floor) continue; judged++; if (Math.sign(da) * Math.sign(db) === sign) hold++; }
  const dA = delta(A, N), dB = delta(B, N);
  let today = 'no data'; if (dA != null && dB != null) today = (Math.abs(dA) < A.floor || Math.abs(dB) < B.floor) ? 'quiet' : (Math.sign(dA) * Math.sign(dB) === sign ? 'holding' : 'BROKEN');
  return { n, judgedPct: Math.round(100 * judged / n), holdPct: judged ? Math.round(100 * hold / judged) : null, today, dA: dA == null ? null : +dA.toFixed(1), dB: dB == null ? null : +dB.toFixed(1) };
}
const row = (id, s) => s ? `${id.padEnd(16)} judged ${String(s.judgedPct).padStart(3)}% of windows | textbook held ${s.holdPct == null ? ' n/a' : String(s.holdPct).padStart(3) + '%'} of those | today ${s.today.padEnd(8)} (${s.dA}, ${s.dB})` : `${id.padEnd(16)} no series`;

console.log(`Window ${D[0]} to ${D[N]}, ${N + 1} daily rows. 20-calendar-day moves, sampled every 3rd day.\n\nEXISTING CHAIN LINKS (baseline, the chain's own floors)`);
for (const [f, t, s, id] of BASE) console.log(row(id, stat(f, t, s)));
console.log('\nCANDIDATE LINKS (floors are proposals)');
const rows = CANDIDATES.map(([f, t, s, why]) => ({ id: `${f}-${t}`, st: stat(f, t, s), why }));
for (const r of rows) console.log(row(r.id, r.st) + '   // ' + r.why);
