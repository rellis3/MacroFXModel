#!/usr/bin/env node
/**
 * Read `backfill/event_response_book.json` and print what it actually says.
 *
 * The book is ~86 families x 26 instruments x 15 cells. Nobody can read that,
 * and picking the biggest numbers out of it by eye is precisely the failure
 * `MD files/EVENT_RESPONSE_BOOK.md` §5 exists to prevent. This prints the five
 * summaries that are safe to read, in the order they should be read:
 *
 *   1. Coverage — what is in the book and what was dropped, with reasons.
 *   2. The join proof — which families the market can even see.
 *   3. SIZE — how much bigger than an ordinary day each category of news is.
 *      This is the part that replicates and the part a range forecast can use.
 *   4. DIRECTION — the unconditional up-rate distribution, against the 50% floor.
 *   5. The conditional question — whether cells hold their sign across their own
 *      halves more often than a coin flip, which is the only honest aggregate
 *      read on a grid this size.
 *
 *   node analysis/event_response/summarize_book.mjs [--category inflation] [--instrument gold]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'backfill', 'event_response_book.json'), 'utf8'));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const onlyCat = arg('--category'), onlyInst = arg('--instrument');

const S = book.cellSchema.reduce((a, k, i) => (a[k] = i, a), {});
const fam = k => book.families[k];
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const pct = (x, d = 0) => (x == null ? '—' : x.toFixed(d) + '%');
const f2 = x => (x == null ? '—' : x.toFixed(2));

// Rows = one (family, instrument) pair.
const rows = [];
for (const [fk, f] of Object.entries(book.book)) {
  const meta = fam(fk); if (!meta) continue;
  if (onlyCat && meta.category !== onlyCat) continue;
  for (const [inst, r] of Object.entries(f.instruments)) {
    if (onlyInst && inst !== onlyInst) continue;
    rows.push({ fk, inst, meta, r });
  }
}

console.log(`\n═══ EVENT RESPONSE BOOK — built ${book.builtAt.slice(0, 16).replace('T', ' ')}Z`);
console.log(book.status);

// ── 1. coverage ───────────────────────────────────────────────────────────────
console.log(`\n── 1. COVERAGE ─────────────────────────────────────────────────`);
const byCat = {}, byCcy = {};
for (const [k, m] of Object.entries(book.families)) { (byCat[m.category] ??= []).push(k); (byCcy[m.ccy] ??= []).push(k); }
console.log(`${Object.keys(book.families).length} families · ${book.instruments.length} instruments · ${rows.length} family×instrument rows`);
console.log('by category: ' + Object.entries(byCat).sort((a, b) => b[1].length - a[1].length).map(([c, k]) => `${c} ${k.length}`).join(' · '));
console.log('by currency: ' + Object.entries(byCcy).sort((a, b) => b[1].length - a[1].length).map(([c, k]) => `${c} ${k.length}`).join(' · '));
if (book.droppedFamilies?.length) {
  const why = {};
  for (const d of book.droppedFamilies) (why[d.reason.replace(/[\d.]+x/g, 'Nx')] ??= []).push(d.label);
  console.log(`\n${book.droppedFamilies.length} candidate families DROPPED (clock unprovable — all from the ForexFactory archive):`);
  for (const [r, list] of Object.entries(why)) console.log(`  ${list.length}x  ${r}\n     ${list.slice(0, 6).join(', ')}${list.length > 6 ? ` …+${list.length - 6}` : ''}`);
  const lostCcy = [...new Set(book.droppedFamilies.map(d => d.country))];
  console.log(`  economies affected: ${lostCcy.join(', ')} — these are the economies vendor 2 carries no consensus for,`);
  console.log('  so AUD/NZD/CAD/CHF/JPY news is thin in this book by data availability, not by choice.');
}

// ── 2. join proof ─────────────────────────────────────────────────────────────
console.log(`\n── 2. JOIN PROOF — can the market even see this release? ────────`);
console.log('median |30-min move| ÷ the same clock on an ordinary day, across the instruments that trade it\n');
const jp = Object.entries(book.families).map(([k, m]) => ({ k, m, r: m.joinProof.medianSpikeR0, pass: m.joinProof.instrumentsPassing, n: m.joinProof.instruments }))
  .filter(x => Number.isFinite(x.r)).sort((a, b) => b.r - a.r);
console.log('  strongest:');
for (const x of jp.slice(0, 12)) console.log(`   ${f2(x.r).padStart(5)}x  ${x.m.label.padEnd(44)} ${x.pass}/${x.n} instruments clear 2x`);
console.log('  weakest (the market barely registers these):');
for (const x of jp.slice(-6)) console.log(`   ${f2(x.r).padStart(5)}x  ${x.m.label.padEnd(44)} ${x.pass}/${x.n}`);
console.log(`  ${jp.filter(x => x.r >= 2).length} of ${jp.length} families clear 2x on the median instrument.`);

// ── 3. size ───────────────────────────────────────────────────────────────────
console.log(`\n── 3. SIZE — how much bigger than an ordinary day (next-day |move| ÷ baseline) ──`);
const catRows = {};
for (const r of rows) (catRows[r.meta.category] ??= []).push(r);
console.log('  category            families  median×  best family (median × across its instruments)');
for (const [cat, rs] of Object.entries(catRows).sort((a, b) => (med(b[1].map(x => x.r.moveMultiple)) ?? 0) - (med(a[1].map(x => x.r.moveMultiple)) ?? 0))) {
  const perFam = {};
  for (const r of rs) (perFam[r.fk] ??= []).push(r.r.moveMultiple);
  const best = Object.entries(perFam).map(([k, v]) => ({ k, m: med(v) })).sort((a, b) => b.m - a.m)[0];
  console.log(`  ${cat.padEnd(20)} ${String(new Set(rs.map(r => r.fk)).size).padStart(5)}   ${f2(med(rs.map(x => x.r.moveMultiple))).padStart(6)}   ${fam(best.k).label} ${f2(best.m)}x`);
}
console.log('\n  top 12 single family×instrument rows by size multiple:');
for (const r of [...rows].sort((a, b) => (b.r.moveMultiple ?? 0) - (a.r.moveMultiple ?? 0)).slice(0, 12)) {
  console.log(`   ${f2(r.r.moveMultiple)}x  ${r.inst.padEnd(7)} ${r.meta.label.padEnd(40)} n=${r.r.n}`);
}

// ── 4. direction ──────────────────────────────────────────────────────────────
console.log(`\n── 4. DIRECTION, unconditional — next-day up-rate against the 50% floor ──`);
const ups = rows.map(r => r.r.r1?.[2]).filter(Number.isFinite);
const band = (lo, hi) => ups.filter(u => u >= lo && u < hi).length;
console.log(`  ${rows.length} rows · median up-rate ${pct(med(ups), 1)} · mean ${pct(ups.reduce((a, b) => a + b, 0) / ups.length, 1)}`);
console.log(`  distribution: <40% ${band(0, 40)} · 40-45% ${band(40, 45)} · 45-55% ${band(45, 55)} · 55-60% ${band(55, 60)} · >=60% ${band(60, 101)}`);
console.log(`  Reading: a release that predicted direction would push this distribution away from 50.`);

// ── 5. the conditional question ───────────────────────────────────────────────
console.log(`\n── 5. THE CONDITIONAL QUESTION — do cells hold their sign across their own halves? ──`);
console.log('  A cell whose R1 median flips sign between the earlier and later half of its own');
console.log('  sample is noise however big it looks. With no effect at all, ~50% hold by chance.\n');
const tally = kind => {
  let held = 0, total = 0, big = 0, bigHeld = 0;
  for (const r of rows) for (const c of Object.values(r.r[kind] ?? {})) {
    if (c[S.unstableR1] == null) continue;
    total++; if (c[S.unstableR1] === 0) held++;
    if (Math.abs(c[S.r1Median] ?? 0) >= 15) { big++; if (c[S.unstableR1] === 0) bigHeld++; }
  }
  return { held, total, big, bigHeld };
};
for (const [kind, label] of [['cells', 'joint  (lead-up × outcome)'], ['lead', 'lead-up only'], ['outcome', 'outcome only']]) {
  const t = tally(kind);
  if (!t.total) continue;
  console.log(`  ${label.padEnd(28)} ${t.held}/${t.total} held their sign = ${pct((t.held / t.total) * 100, 1)}`
    + `   ·  of the ${t.big} with |median| ≥ 15bp: ${pct((t.bigHeld / t.big) * 100, 1)}`);
}
console.log('\n  The ">=15bp" column is NOT a second, better result. A pooled median is an average');
console.log('  of the two halves, so selecting cells with a LARGE pooled median mechanically');
console.log('  selects cells whose halves agree — the 72-80% there is arithmetic, not evidence.');
console.log('\n  Same question by category (joint cells):');
for (const [cat, rs] of Object.entries(catRows)) {
  let held = 0, total = 0;
  for (const r of rs) for (const c of Object.values(r.r.cells ?? {})) { if (c[S.unstableR1] == null) continue; total++; if (c[S.unstableR1] === 0) held++; }
  if (total >= 20) console.log(`   ${cat.padEnd(20)} ${String(held).padStart(4)}/${String(total).padEnd(5)} ${pct((held / total) * 100, 1)}`);
}

// Does conditioning add anything over not conditioning? Compare each joint cell's
// |R1 median| against its own family×instrument unconditional |R1 median|.
let better = 0, cmp = 0;
for (const r of rows) {
  const base = Math.abs(r.r.r1?.[0] ?? 0);
  for (const c of Object.values(r.r.cells ?? {})) { if (c[S.r1Median] == null) continue; cmp++; if (Math.abs(c[S.r1Median]) > base) better++; }
}
console.log(`\n  Joint cells whose |next-day median| exceeds their own unconditional row: ${better}/${cmp} = ${pct((better / cmp) * 100, 1)}.`);
console.log('  (Cutting a sample three ways ALWAYS produces sub-cells further from the pooled');
console.log('   median — this number is a sanity check on effect size, not evidence of an effect.)');
console.log('\n  The registered test that settles the conditional claim is EVENT_RESPONSE_BOOK.md §6.');
console.log('  It is not run here and nothing above is a substitute for it.\n');
