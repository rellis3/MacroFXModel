#!/usr/bin/env node
/**
 * CURVE-INVERSION — An inverted US yield curve (10y minus 2y below zero) is followed by
 * weaker risk assets and a recession signal the market has not already priced.
 *
 * Design frozen in MD files/CURVE_INVERSION_PREREG.md BEFORE this was written.
 *
 *   node analysis/curve_inversion_study.mjs
 *
 * WHY THIS DOES NOT LOOK LIKE THE SCAFFOLD. The generated harness tests a daily setup
 * against a daily control with a block bootstrap. That is the wrong unit here and the
 * reason this claim survives: an inversion lasts hundreds of sessions, so counting days
 * turns ONE episode into five hundred observations and any interval computed on them is
 * fiction. The pre-registered unit is the EPISODE. There are about seven in fifty years,
 * and the whole point of the study is to report honestly what seven can and cannot settle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'curve_inversion.json');
const CACHE = path.join(__dirname, '.cache');

// ── pre-registered constants — these must match the prereg exactly ───────────
const MIN_EVENTS = 6;            // episodes, not days. Below this: UNTESTABLE, not null.
const BUFFER_DAYS = 60;          // so a spread oscillating around zero is one episode
const REC_HORIZONS_M = [12, 18, 24];
const EQ_HORIZONS_M = [3, 6, 12];
const REPS = 10000;

// ── data ─────────────────────────────────────────────────────────────────────
async function fred(id) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, `${id}.csv`);
  if (!fs.existsSync(f) || Date.now() - fs.statSync(f).mtimeMs > 12 * 3600e3) {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`FRED ${id} HTTP ${r.status}`);
    fs.writeFileSync(f, await r.text());
  }
  // parseFloat, so FRED's EMPTY holiday cells become NaN and drop. Unary + would read
  // them as 0 and invent a zero-priced day -- which it did, in an earlier analysis.
  return fs.readFileSync(f, 'utf8').trim().split('\n').slice(1)
    .map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; })
    .filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value));
}

const addMonths = (iso, m) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const monthOf = iso => iso.slice(5, 7);
/** first value at or after a date */
const at = (rows, date) => rows.find(r => r.date >= date) ?? null;

// ── episodes ─────────────────────────────────────────────────────────────────
/**
 * An episode starts on the first inverted day after BUFFER_DAYS clear of inversion, and
 * ends once the spread has been non-inverted for BUFFER_DAYS. Without the buffer a spread
 * hovering at zero produces dozens of "episodes" that are one event.
 */
function episodes(rows, isSetup) {
  const out = [];
  let open = null, clear = BUFFER_DAYS;
  for (let i = 0; i < rows.length; i++) {
    const on = isSetup(rows[i].value);
    if (on) {
      if (!open && clear >= BUFFER_DAYS) { open = { start: rows[i].date, startIdx: i }; }
      open.last = rows[i].date;        // the last day actually inverted
      clear = 0;
    } else if (open) {
      clear++;
      // `end` is the last INVERTED day, not the day the buffer expired -- otherwise two
      // episodes look 6 days apart when their inversions are 90 days apart.
      if (clear >= BUFFER_DAYS) { open.end = open.last; out.push(open); open = null; }
    } else clear++;
  }
  if (open) { open.end = open.last ?? null; open.ongoing = true; out.push(open); }
  return out;
}

// ── stats ────────────────────────────────────────────────────────────────────
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
/** Exact-ish binomial interval (Wilson), because a normal approximation on n=7 is a lie. */
function wilson(hits, n, z = 1.96) {
  if (!n) return { lo: null, hi: null };
  const p = hits / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { lo: +Math.max(0, c - h).toFixed(3), hi: +Math.min(1, c + h).toFixed(3) };
}
/** Permutation: could a control sample of the same size beat the episodes this often? */
function permTest(ev, ctl) {
  if (ev.length < 1 || ctl.length < ev.length) return null;
  const obs = mean(ev);
  let worse = 0;
  for (let r = 0; r < REPS; r++) {
    const pick = [];
    for (let k = 0; k < ev.length; k++) pick.push(ctl[Math.floor(Math.random() * ctl.length)]);
    if (mean(pick) <= obs) worse++;
  }
  return { obs: +obs.toFixed(4), ctlMean: +mean(ctl).toFixed(4), pLower: +(worse / REPS).toFixed(4) };
}

// ═════════════════════════════════════════════════════════════════════════════
const t10y2y = await fred('T10Y2Y');
const t10y3m = await fred('T10Y3M');
const usrec  = await fred('USREC');
const nasdaq = await fred('NASDAQCOM');
const unrate = await fred('UNRATE');

const inv = episodes(t10y2y, v => v < 0);
const inv3m = episodes(t10y3m, v => v < 0);

// THE MIRROR. Steepening episodes: the spread crossing ABOVE its 80th percentile after
// being below it. If these produce the same forward weakness, the finding is the period
// and not the curve -- which is what killed breadth-narrowing.
const sorted = t10y2y.map(r => r.value).slice().sort((a, b) => a - b);
const p80 = sorted[Math.floor(sorted.length * 0.8)];
const steep = episodes(t10y2y, v => v > p80);

console.log(`T10Y2Y ${t10y2y[0].date} -> ${t10y2y.at(-1).date}, ${t10y2y.length} obs`);
console.log(`inversion episodes (10y-2y): ${inv.length}   (10y-3m): ${inv3m.length}   steepening mirror: ${steep.length}  [p80 = ${p80.toFixed(2)}]`);

// ── O1 recession ─────────────────────────────────────────────────────────────
// USREC is monthly and NBER-dated IN ARREARS. Retrospective by construction, never a
// tradeable signal however it comes out -- stated in the prereg, repeated here.
function recWithin(startDate, months) {
  const end = addMonths(startDate, months);
  const win = usrec.filter(r => r.date > startDate && r.date <= end);
  return win.length ? (win.some(r => r.value === 1) ? 1 : 0) : null;
}

// ── O2 equities ──────────────────────────────────────────────────────────────
function fwdRet(startDate, months) {
  const a = at(nasdaq, startDate), b = at(nasdaq, addMonths(startDate, months));
  return (a && b && a.value > 0) ? (b.value / a.value - 1) * 100 : null;
}
/** Month-matched control: same calendar month, no inversion within +/- 12 months. */
function controlDates(months, matchMonths) {
  const invDays = new Set();
  for (const e of inv) {
    const from = addMonths(e.start, -12), to = addMonths(e.end ?? e.start, 12);
    for (const r of nasdaq) if (r.date >= from && r.date <= to) invDays.add(r.date);
  }
  return nasdaq.filter(r => !invDays.has(r.date) && matchMonths.has(monthOf(r.date))
    && at(nasdaq, addMonths(r.date, months))).map(r => r.date);
}

// ── O3 labour ────────────────────────────────────────────────────────────────
function unrateChange(startDate, months) {
  const a = at(unrate, startDate), b = at(unrate, addMonths(startDate, months));
  return (a && b) ? +(b.value - a.value).toFixed(2) : null;
}

const result = { id: 'curve-inversion', ranAt: new Date().toISOString(), minEvents: MIN_EVENTS,
  span: { from: t10y2y[0].date, to: t10y2y.at(-1).date, obs: t10y2y.length },
  episodes: inv.map(e => ({ start: e.start, end: e.end, ongoing: !!e.ongoing })), cells: {} };

console.log('\nEPISODES (the unit of observation)');
console.log('  start        end          rec<=24m   Nasdaq +12m   UNRATE +12m');
for (const e of inv) {
  const r24 = recWithin(e.start, 24), eq = fwdRet(e.start, 12), ur = unrateChange(e.start, 12);
  console.log(`  ${e.start}   ${(e.end ?? 'ongoing').padEnd(11)}  ${r24 == null ? '  ?  ' : r24 ? ' YES ' : ' no  '}     ${eq == null ? '   -   ' : (eq >= 0 ? '+' : '') + eq.toFixed(1) + '%'}       ${ur == null ? '  -  ' : (ur >= 0 ? '+' : '') + ur.toFixed(1) + 'pp'}`);
}

// ── O1 ───────────────────────────────────────────────────────────────────────
console.log('\nO1  RECESSION FOLLOWS (retrospective label — NBER dates in arrears)');
for (const M of REC_HORIZONS_M) {
  const vals = inv.map(e => recWithin(e.start, M)).filter(v => v != null);
  const hits = vals.filter(v => v === 1).length;
  const w = wilson(hits, vals.length);
  const untestable = vals.length < MIN_EVENTS;
  result.cells[`rec${M}m`] = { n: vals.length, hits, rate: vals.length ? +(hits / vals.length).toFixed(3) : null, ...w, untestable };
  console.log(`  within ${String(M).padStart(2)}m: ${hits} of ${vals.length}` +
    (untestable ? `  UNTESTABLE (floor ${MIN_EVENTS})` : `  = ${(hits / vals.length * 100).toFixed(0)}%  95% CI [${(w.lo * 100).toFixed(0)}%, ${(w.hi * 100).toFixed(0)}%]`));
}

// ── O2 ───────────────────────────────────────────────────────────────────────
console.log('\nO2  FORWARD EQUITY RETURNS (Nasdaq, vs month-matched control)');
const matchMonths = new Set(inv.map(e => monthOf(e.start)));
for (const M of EQ_HORIZONS_M) {
  const ev = inv.map(e => fwdRet(e.start, M)).filter(v => v != null);
  const ctl = controlDates(M, matchMonths).map(d => fwdRet(d, M)).filter(v => v != null);
  const p = permTest(ev, ctl);
  const untestable = ev.length < MIN_EVENTS;
  result.cells[`eq${M}m`] = { n: ev.length, nCtl: ctl.length, ...(p ?? {}), untestable };
  console.log(`  +${String(M).padStart(2)}m: episodes ${p ? (p.obs >= 0 ? '+' : '') + p.obs.toFixed(1) + '%' : '-'} vs control ${p ? (p.ctlMean >= 0 ? '+' : '') + p.ctlMean.toFixed(1) + '%' : '-'}` +
    `  (n=${ev.length} vs ${ctl.length})` + (untestable ? `  UNTESTABLE` : `  p(episodes no better) = ${p?.pLower}`));
}

// ── O3 ───────────────────────────────────────────────────────────────────────
const urEv = inv.map(e => unrateChange(e.start, 12)).filter(v => v != null);
result.cells.unrate12m = { n: urEv.length, mean: urEv.length ? +mean(urEv).toFixed(2) : null, untestable: urEv.length < MIN_EVENTS };
console.log(`\nO3  UNEMPLOYMENT +12m: mean ${result.cells.unrate12m.mean}pp over ${urEv.length} episodes`);

// ── THE GATE ─────────────────────────────────────────────────────────────────
// Encoded from the prereg, not read off the numbers afterwards.
console.log('\nTHE GATE (all three required)');

// (1) leave-one-out on the 24-month recession rate and the 12-month equity read
const r24 = inv.map(e => recWithin(e.start, 24)).filter(v => v != null);
const loo = r24.map((_, k) => { const rest = r24.filter((__, j) => j !== k); return rest.filter(v => v === 1).length / rest.length; });
const looMin = loo.length ? Math.min(...loo) : null;
const eq12 = inv.map(e => fwdRet(e.start, 12)).filter(v => v != null);
const looEq = eq12.map((_, k) => mean(eq12.filter((__, j) => j !== k)));
const eqSignStable = looEq.length ? looEq.every(v => Math.sign(v) === Math.sign(mean(eq12))) : false;
result.gate = { looRecMin: looMin == null ? null : +looMin.toFixed(3), eqSignStable };
console.log(`  1. leave-one-out: recession rate never falls below ${looMin == null ? '-' : (looMin * 100).toFixed(0)}%; equity sign stable: ${eqSignStable}`);

// (2) the mirror
const steepEq = steep.map(e => fwdRet(e.start, 12)).filter(v => v != null);
const mirrorClean = steepEq.length ? mean(steepEq) > mean(eq12) : null;
result.gate.mirror = { n: steepEq.length, mean: steepEq.length ? +mean(steepEq).toFixed(2) : null, clean: mirrorClean };
console.log(`  2. mirror (steepening): +12m Nasdaq ${steepEq.length ? (mean(steepEq) >= 0 ? '+' : '') + mean(steepEq).toFixed(1) + '%' : '-'} on n=${steepEq.length} — ${mirrorClean === null ? 'no read' : mirrorClean ? 'differs from inversions, so the curve is doing something' : 'SAME as inversions, so this is the period, not the curve'}`);

// (3) the control must actually differ
const eqCell = result.cells.eq12m;
const controlDiffers = eqCell && !eqCell.untestable && eqCell.pLower != null && eqCell.pLower <= 0.05;
result.gate.controlDiffers = !!controlDiffers;
console.log(`  3. control: episodes materially worse than matched control? ${controlDiffers ? 'yes' : 'no'}`);

// ── VERDICT ──────────────────────────────────────────────────────────────────
const anyTestable = Object.values(result.cells).some(c => !c.untestable);
const tradeable = result.gate.controlDiffers && result.gate.mirror.clean === true && result.gate.eqSignStable;
result.verdict = !anyTestable ? 'UNTESTABLE' : tradeable ? 'REAL' : 'NULL';
result.note = result.verdict === 'NULL'
  ? 'The recession association is reported descriptively; the TRADEABLE claim — risk assets weaker after an inversion — did not clear the pre-registered gate.'
  : result.verdict === 'UNTESTABLE' ? 'Fifty years of data does not contain enough independent episodes to settle this.' : '';
console.log('\nVERDICT: ' + result.verdict + (result.note ? ' — ' + result.note : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('written ' + path.relative(process.cwd(), OUT));
