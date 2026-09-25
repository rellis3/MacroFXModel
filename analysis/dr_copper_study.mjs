#!/usr/bin/env node
/**
 * C1 — does Dr Copper actually have a PhD?
 *
 * Pre-registered in `MD files/DR_COPPER_PREREG.md` BEFORE this was written.
 *
 * The claim is "every single time, three months before GDP, you'll see copper fall".
 * That is a SENSITIVITY statement and on its own it is nearly worthless: a signal that
 * fires before every recession and before thirty things that were not recessions has no
 * information in it. The pre-registered primary outcome is therefore the FALSE ALARM
 * RATE, which is the half the claim omits.
 *
 * Both series are FRED, keyless through the graph CSV:
 *   PCOPPUSDM            global copper, USD/tonne, monthly, from 1990
 *   A191RL1Q225SBEA      US real GDP, % change on the preceding period, SAAR
 *
 * Usage: node analysis/dr_copper_study.mjs
 */
import fs from 'node:fs';

const PRIMARY = 15;                   // the pre-registered threshold; others are descriptive
const DESCRIPTIVE = [10, 20, 25];
const MIN_EVENTS = 6;                 // below this the sample cannot carry a rate

const fred = async (id, from = '1990-01-01') => {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${from}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${id} -> ${r.status}`);
  return (await r.text()).trim().split('\n').slice(1)
    .map(l => l.split(',')).filter(c => c[1] && c[1] !== '.')
    .map(c => ({ d: c[0], v: +c[1] }));
};

const copper = await fred('PCOPPUSDM');
const gdp = await fred('A191RL1Q225SBEA');
console.log(`C1 — does Dr Copper actually have a PhD?`);
console.log(`copper ${copper[0].d} -> ${copper.at(-1).d} (${copper.length} months)`);
console.log(`GDP    ${gdp[0].d} -> ${gdp.at(-1).d} (${gdp.length} quarters)\n`);

const cuBy = new Map(copper.map(x => [x.d.slice(0, 7), x.v]));
const monthsBefore = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 - n, 1)); return d.toISOString().slice(0, 7); };

/**
 * One row per GDP quarter: the copper change over the three months ENDING the month
 * before the quarter starts, and whether that quarter's GDP printed negative.
 */
const rows = [];
for (const q of gdp) {
  const qStart = q.d.slice(0, 7);
  const end = monthsBefore(qStart, 1);        // the month before the quarter began
  const start = monthsBefore(qStart, 4);      // three months earlier
  const a = cuBy.get(start), b = cuBy.get(end);
  if (a == null || b == null || !a) continue;
  rows.push({ q: q.d, gdp: q.v, neg: q.v < 0, cu3m: (b / a - 1) * 100 });
}
console.log(`quarters usable: ${rows.length}   negative-GDP quarters: ${rows.filter(r => r.neg).length} (base rate ${(100 * rows.filter(r => r.neg).length / rows.length).toFixed(1)}%)\n`);

function table(thr) {
  const fell = rows.filter(r => r.cu3m <= -thr);
  const negs = rows.filter(r => r.neg);
  const tp = fell.filter(r => r.neg).length;          // copper fell AND GDP went negative
  const fp = fell.length - tp;                        // copper fell and nothing happened
  const fn = negs.length - tp;                        // GDP went negative with no warning
  const base = negs.length / rows.length;
  return {
    thr, signals: fell.length, tp, fp, fn,
    sensitivity: negs.length ? tp / negs.length : null,     // "every single time" is this
    falseAlarm: fell.length ? fp / fell.length : null,      // the pre-registered primary
    precision: fell.length ? tp / fell.length : null,
    base, lift: (fell.length && base) ? (tp / fell.length) / base : null,
  };
}

const pct = x => x == null ? '—' : `${Math.round(x * 100)}%`;
const P = table(PRIMARY);
console.log(`PRIMARY, a ${PRIMARY}% three-month fall:`);
console.log(`   it fired ${P.signals} times in ${rows.length} quarters`);
console.log(`   caught ${P.tp} of ${P.tp + P.fn} negative quarters          -> sensitivity ${pct(P.sensitivity)}   ("every single time" claims 100%)`);
console.log(`   ${P.fp} of its ${P.signals} warnings had no negative quarter -> FALSE ALARM RATE ${pct(P.falseAlarm)}`);
console.log(`   P(negative | copper fell) ${pct(P.precision)}  vs base rate ${pct(P.base)}  -> lift ${P.lift ? P.lift.toFixed(2) + 'x' : '—'}`);
console.log(`   ${P.fn} negative quarters arrived with NO copper warning at all\n`);

console.log(`descriptive only, NOT the pre-registered test:`);
for (const t of DESCRIPTIVE) {
  const x = table(t);
  console.log(`   ${String(t).padStart(2)}%  fired ${String(x.signals).padStart(3)}  sensitivity ${pct(x.sensitivity).padStart(4)}  false alarms ${pct(x.falseAlarm).padStart(4)}  lift ${x.lift ? x.lift.toFixed(2) + 'x' : '—'}`);
}

// the two examples the claim leans on
console.log(`\nthe famous ones:`);
for (const y of ['2008', '2020']) {
  const hit = rows.filter(r => r.q.startsWith(y) && r.neg);
  for (const h of hit) console.log(`   ${h.q}  GDP ${h.gdp.toFixed(1)}%  copper's prior 3m ${h.cu3m > 0 ? '+' : ''}${h.cu3m.toFixed(1)}%  ${h.cu3m <= -PRIMARY ? '<- WARNED' : '<- no warning at ' + PRIMARY + '%'}`);
}

const testable = P.signals >= MIN_EVENTS && (P.tp + P.fn) >= MIN_EVENTS;
const verdict = !testable ? 'UNTESTABLE'
  : (P.lift != null && P.lift >= 2 && P.falseAlarm != null && P.falseAlarm <= 0.5) ? 'REAL' : 'NULL';
console.log(`\nVERDICT: ${verdict}${verdict === 'UNTESTABLE'
  ? ` — ${P.signals} signals and ${P.tp + P.fn} negative quarters against a floor of ${MIN_EVENTS}. Not a null: the question was not answered.`
  : verdict === 'NULL'
  ? ` — copper falling does not usefully raise the odds of a negative quarter. ${pct(P.falseAlarm)} of its warnings were wrong, and it missed ${P.fn} of the ${P.tp + P.fn} contractions entirely.`
  : ` — it clears both pre-registered bars.`}`);

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/dr_copper.json', JSON.stringify({ at: new Date().toISOString(), primary: P, descriptive: DESCRIPTIVE.map(table), rows, verdict }, null, 2));
console.log('\nwritten to analysis/output/dr_copper.json');
