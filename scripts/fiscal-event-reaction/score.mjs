// fiscal-event-reaction step 4: score S1, S2, D2 (D1 is below its floor, prereg A1) and the described cells; write
// analysis/output/fiscal-event-reaction/{results.json,RESULTS.md} and backfill/fiscal_history.json (the site's history).
//   node scripts/fiscal-event-reaction/score.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UK_EVENTS, LOCKBOX_END } from './events.mjs';
import { INSTRUMENTS, usEvents, controlDates, cachePath } from './fetch_prices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'fiscal_history');
const OUT = path.join(ROOT, 'analysis', 'output', 'fiscal-event-reaction');
const SEED = 20261028, B = 2000;
const D = { UK10YB_GBP: 8.5, USB10Y_USD: 8.0, USB02Y_USD: 1.9, USB30Y_USD: 17 };
const LABEL = { UK10YB_GBP: 'UK 10y gilt', GBP_USD: 'GBP/USD', UK100_GBP: 'FTSE 100', USB10Y_USD: 'US 10y', USB02Y_USD: 'US 2y', USB30Y_USD: 'US 30y' };
const numbers = JSON.parse(fs.readFileSync(path.join(DIR, 'numbers.json'), 'utf8'));

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };

/** Window stats from cached open-stamped M1: move % from t0-5 to t0+W, range %, minutes of data, and a 5-min path. */
function statsFrom(bars, t0, W) {
  const start = t0 - 5 * 60e3, end = t0 + W * 60e3;
  const closeAt = x => { let c = null; for (const b of bars) { if (b[0] + 60e3 <= x) c = b[4]; else break; } return c; };
  const p0 = closeAt(start), p1 = closeAt(end);
  const inW = bars.filter(b => b[0] >= t0 && b[0] < end);
  if (p0 == null || p1 == null || inW.length < 30) return null;
  const hi = Math.max(...bars.filter(b => b[0] >= start && b[0] < end).map(b => b[2])), lo = Math.min(...bars.filter(b => b[0] >= start && b[0] < end).map(b => b[3]));
  const path5 = [];
  for (let m = -15; m <= W; m += 5) { const c = closeAt(t0 + m * 60e3); path5.push(c == null ? null : +((c / p0 - 1) * 100).toFixed(4)); }
  return { move: (p1 / p0 - 1) * 100, range: (hi - lo) / p0 * 100, minutes: inW.length, path5 };
}

// Control windows use the same LOCAL clock on their own date (so a control across a DST change keeps 12:30 London).
import { zonedMs } from './events.mjs';
function controlStats(ins, date, ev) {
  const f = cachePath(ins, date, ev.clock, ev.tz);
  if (!fs.existsSync(f)) return null;
  return statsFrom(JSON.parse(fs.readFileSync(f, 'utf8')), zonedMs(date, ev.clock, ev.tz), ev.windowMin);
}

const ukEvents = UK_EVENTS, us = usEvents().map(e => ({ ...e, name: `Quarterly Refunding, ${['', 'February', 'May', 'August', 'November'][e.q]} ${e.year}`, scored: e.date <= LOCKBOX_END, unscheduled: false }));
const eventDates = { GB: new Set(ukEvents.map(e => e.date)), US: new Set(us.map(e => e.date)) };

const rows = [];
for (const ev of [...ukEvents, ...us]) {
  const row = { id: ev.id, country: ev.country, date: ev.date, name: ev.name, clock: ev.clock, tz: ev.tz, windowMin: ev.windowMin, scored: ev.scored, unscheduled: !!ev.unscheduled, inst: {} };
  const ctrlDates = controlDates(ev, eventDates[ev.country]);
  for (const ins of INSTRUMENTS[ev.country]) {
    const e = controlStats(ins, ev.date, ev);
    const cs = ctrlDates.map(d => controlStats(ins, d, ev)).filter(Boolean);
    if (!e || cs.length < 4) { row.inst[ins] = { dropped: !e ? 'no event data' : `only ${cs.length} control days` }; continue; }
    const cAbs = median(cs.map(c => Math.abs(c.move))), cRange = median(cs.map(c => c.range));
    row.inst[ins] = {
      move: +e.move.toFixed(4), bp: D[ins] ? +(-e.move * 100 / D[ins]).toFixed(1) : null, range: +e.range.toFixed(4),
      ctrlAbs: +cAbs.toFixed(4), ctrlRange: +cRange.toFixed(4), nCtrl: cs.length,
      ratio: +(Math.max(Math.abs(e.move), 1e-4) / Math.max(cAbs, 1e-4)).toFixed(3), rangeRatio: +(e.range / cRange).toFixed(3), path5: e.path5,
    };
  }
  const n = ev.country === 'GB' ? numbers.uk[ev.id] : numbers.us[ev.id];
  if (ev.country === 'GB') Object.assign(row, { giltRevision: n?.giltRevision ?? null, revisionQuote: n?.revisionQuote ?? null, remitYear: n?.year ?? null, giltSales: n?.giltSales ?? null, docSrc: n?.src ?? null });
  else Object.assign(row, { couponChange: n?.couponChange ?? 0, couponQuote: n?.couponQuote ?? null, docSrc: n?.src ?? ev.href });
  rows.push(row);
}

function bootMean(vals) {
  const m = mean(vals), bs = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < vals.length; i++) s += vals[Math.floor(rng() * vals.length)]; bs.push(s / vals.length); }
  const p = Math.min(1, 2 * Math.min(bs.filter(x => x <= 0).length, bs.filter(x => x >= 0).length) / B);
  return { m, lo: q(bs, 0.025), hi: q(bs, 0.975), p: Math.max(p, 1 / B) };
}
function sizeCell(sel, ins) {
  const r = rows.filter(sel).map(x => x.inst[ins]).filter(x => x && !x.dropped);
  const logs = r.map(x => Math.log(x.ratio)), bt = bootMean(logs);
  const rl = r.map(x => Math.log(x.rangeRatio)), br = bootMean(rl);
  return { instrument: ins, label: LABEL[ins], n: r.length, dropped: rows.filter(sel).length - r.length,
    gmRatio: +Math.exp(bt.m).toFixed(3), ci: [+Math.exp(bt.lo).toFixed(3), +Math.exp(bt.hi).toFixed(3)], p: bt.p,
    medianRatio: +median(r.map(x => x.ratio)).toFixed(3), shareAbove1: +(r.filter(x => x.ratio > 1).length / r.length).toFixed(3),
    rangeGm: +Math.exp(br.m).toFixed(3), rangeCi: [+Math.exp(br.lo).toFixed(3), +Math.exp(br.hi).toFixed(3)], rangeP: br.p };
}
const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return dx && dy ? n / Math.sqrt(dx * dy) : 0; };
const spearman = (x, y) => pearson(rank(x), rank(y));
function dirCell(pairs) {
  const x = pairs.map(p => p[0]), y = pairs.map(p => p[1]), rho = spearman(x, y), bs = [];
  for (let b = 0; b < B; b++) { const ix = Array.from({ length: pairs.length }, () => Math.floor(rng() * pairs.length)); bs.push(spearman(ix.map(i => x[i]), ix.map(i => y[i]))); }
  const p = Math.min(1, 2 * Math.min(bs.filter(v => v <= 0).length, bs.filter(v => v >= 0).length) / B);
  return { n: pairs.length, rho: +rho.toFixed(3), ci: [+q(bs, 0.025).toFixed(3), +q(bs, 0.975).toFixed(3)], p: Math.max(p, 1 / B) };
}

const ukScored = r => r.country === 'GB' && r.scored, usScored = r => r.country === 'US' && r.scored;
const S1 = sizeCell(ukScored, 'UK10YB_GBP'), S2 = sizeCell(usScored, 'USB10Y_USD');
const d2pairs = rows.filter(usScored).filter(r => r.inst.USB10Y_USD && !r.inst.USB10Y_USD.dropped).map(r => [r.couponChange, r.inst.USB10Y_USD.bp]);
const D2 = dirCell(d2pairs);
const d1pairs = rows.filter(ukScored).filter(r => r.giltRevision != null && r.inst.UK10YB_GBP && !r.inst.UK10YB_GBP.dropped).map(r => [r.giltRevision, r.inst.UK10YB_GBP.bp]);
const D1 = { ...dirCell(d1pairs), scored: false, note: 'below the 15-row floor (prereg A1): description only' };

// Holm over the four registered cells; D1 is counted at p = 1 (not scored).
const cells = [['S1', S1.p], ['S2', S2.p], ['D1', 1], ['D2', D2.p]].sort((a, b) => a[1] - b[1]);
const holm = {}; let run = 0;
cells.forEach(([k, p], i) => { run = Math.max(run, Math.min(1, p * (cells.length - i))); holm[k] = +run.toFixed(4); });
const sizeVerdict = (c, mde, h) => h < 0.05 && c.ci[0] > 1 ? 'VALIDATED' : c.ci[1] < mde ? 'NULL' : 'UNDERPOWERED';
S1.holmP = holm.S1; S1.verdict = sizeVerdict(S1, 1.48, holm.S1); S1.mde = 1.48;
S2.holmP = holm.S2; S2.verdict = sizeVerdict(S2, 1.30, holm.S2); S2.mde = 1.30;
D2.holmP = holm.D2; D2.verdict = holm.D2 < 0.05 && D2.rho > 0 ? 'VALIDATED' : (D2.ci[1] < 0.32 ? 'NULL' : 'UNDERPOWERED'); D2.mde = 0.32;
D1.verdict = 'UNDERPOWERED';

// Described cells (BH q = 0.10, never promoted).
const described = [
  ['GBP/USD, UK scheduled', sizeCell(ukScored, 'GBP_USD')], ['FTSE 100, UK scheduled', sizeCell(ukScored, 'UK100_GBP')],
  ['UK 10y gilt, incl. the two 2022 unscheduled', sizeCell(r => r.country === 'GB' && r.date <= LOCKBOX_END, 'UK10YB_GBP')],
  ['US 2y, refunding', sizeCell(usScored, 'USB02Y_USD')], ['US 30y, refunding', sizeCell(usScored, 'USB30Y_USD')],
  ['US 10y, statements with a coupon change', sizeCell(r => usScored(r) && r.couponChange !== 0, 'USB10Y_USD')],
  ['US 10y, statements with no change', sizeCell(r => usScored(r) && r.couponChange === 0, 'USB10Y_USD')],
];
const ps = described.map(d => d[1].p), order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
const bhQ = new Array(ps.length); let minQ = 1;
for (let k = order.length - 1; k >= 0; k--) { minQ = Math.min(minQ, order[k][0] * order.length / (k + 1)); bhQ[order[k][1]] = +minQ.toFixed(4); }
described.forEach((d, i) => { d[1].bhQ = bhQ[i]; });

// Largest reactions, for concentration checks.
const top = (sel, ins, k = 5) => rows.filter(sel).filter(r => r.inst[ins] && !r.inst[ins].dropped).sort((a, b) => b.inst[ins].ratio - a.inst[ins].ratio).slice(0, k).map(r => ({ date: r.date, name: r.name, ratio: r.inst[ins].ratio, bp: r.inst[ins].bp }));
const S1_ex_top3 = (() => { const t = new Set(top(ukScored, 'UK10YB_GBP', 3).map(x => x.date)); return sizeCell(r => ukScored(r) && !t.has(r.date), 'UK10YB_GBP'); })();
const S2_ex_top3 = (() => { const t = new Set(top(usScored, 'USB10Y_USD', 3).map(x => x.date)); return sizeCell(r => usScored(r) && !t.has(r.date), 'USB10Y_USD'); })();

const results = {
  id: 'fiscal-event-reaction', prereg: 'forge/FISCAL_EVENT_REACTION_PREREG.md', seed: SEED, B, run: new Date().toISOString().slice(0, 10),
  data: 'OANDA mid M1; UK 2010-06-22 -> 2026-03-03, US 2008-01-30 -> 2026-08-05; lockbox events shown, not scored',
  cells: { S1, S2, D1, D2 }, holm, described: Object.fromEntries(described), concentration: { S1_ex_top3, S2_ex_top3, S1_top: top(ukScored, 'UK10YB_GBP'), S2_top: top(usScored, 'USB10Y_USD') },
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));

// The site file: per-event rows (rounded, paths for the main instruments) + the summary.
const site = {
  built: results.run, prereg: results.prereg, results: 'analysis/output/fiscal-event-reaction/RESULTS.md',
  summary: { S1, S2, D1, D2, described: Object.fromEntries(described.map(([k, v]) => [k, { n: v.n, gmRatio: v.gmRatio, ci: v.ci, bhQ: v.bhQ }])) },
  windows: { GB: 'statement start -5 min to +180 min, London clock', US: '08:30 New York -5 min to +90 min' },
  instruments: LABEL, durations: D,
  events: rows.map(r => ({ ...r, inst: Object.fromEntries(Object.entries(r.inst).map(([k, v]) => [k, v.dropped ? v : { ...v, path5: ['UK10YB_GBP', 'GBP_USD', 'USB10Y_USD', 'USB30Y_USD'].includes(k) ? v.path5 : undefined }])) })),
};
fs.writeFileSync(path.join(ROOT, 'backfill', 'fiscal_history.json'), JSON.stringify(site));

const f = c => `${c.gmRatio}× [${c.ci[0]}, ${c.ci[1]}]`;
console.log('S1 UK gilt 10y size', f(S1), 'n', S1.n, 'p', S1.p, 'holm', S1.holmP, S1.verdict, '| range', S1.rangeGm, S1.rangeCi);
console.log('S2 US 10y size     ', f(S2), 'n', S2.n, 'p', S2.p, 'holm', S2.holmP, S2.verdict, '| range', S2.rangeGm, S2.rangeCi);
console.log('D1 UK supply vs bp  rho', D1.rho, D1.ci, 'n', D1.n, '(not scored)');
console.log('D2 US coupon vs bp  rho', D2.rho, D2.ci, 'n', D2.n, 'p', D2.p, 'holm', D2.holmP, D2.verdict);
described.forEach(([k, v]) => console.log('  ', k.padEnd(44), f(v), 'n', v.n, 'q', v.bhQ));
console.log('S1 ex top3', f(S1_ex_top3), '· S2 ex top3', f(S2_ex_top3));
console.log('S1 top', JSON.stringify(results.concentration.S1_top)); console.log('S2 top', JSON.stringify(results.concentration.S2_top));
