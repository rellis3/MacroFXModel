#!/usr/bin/env node
/**
 * P1 — does a CONFIRMED turn in short-term rates lead the Nasdaq?
 *
 * Pre-registered in `MD files/RATES_PIVOT_LEAD_PREREG.md` BEFORE this was written, with
 * the expectation (null) stated first.
 *
 * WHY THE CORRELATION TEST DID NOT SETTLE THIS. The 2-year CFD against the Nasdaq over
 * 7,533 aligned M15 bars gives +0.233 in the SAME bar and nothing above 0.04 at any lag
 * out to an hour. But pivots are 11% of bars, so an effect living only at turning points
 * and worth r ~ 0.30 there would show as ~0.03 across the full sample — inside the noise
 * already measured. A full-sample correlation cannot see a pivot-conditional effect.
 *
 * THE GUARD THAT MATTERS. A pivot at bar i needs REACH bars either side, so it is only
 * KNOWABLE at i+REACH. Every return here is measured from the confirmation bar, never
 * from the pivot. Reading it at the pivot is the look-ahead this desk has already been
 * bitten by twice (swing_regime 2026-09-19, Vote Atlas) and is the discipline the video
 * itself spends most of its time on.
 *
 * Usage: node analysis/rates_pivot_lead_study.mjs [days]
 */
import fs from 'node:fs';

const API = process.env.MFX_API || 'https://macrofxmodel-production.up.railway.app';
const DAYS = Math.min(400, Math.max(60, parseInt(process.argv[2] ?? '360', 10) || 360));
const DRIVER = 'USB02Y_USD', TARGET = 'NAS100_USD';
const REACH = 3;                      // 45 minutes, matching the video's 16:00 -> 16:45
const HORIZONS = [4, 8, 16];          // 1h, 2h, 4h from the CONFIRMATION bar
const MIN_EVENTS = 30;

const iso = ms => new Date(ms).toISOString().slice(0, 10);
async function bars(sym) {
  const to = iso(Date.now()), from = iso(Date.now() - DAYS * 864e5);
  const r = await fetch(`${API}/api/ohlc-range?symbol=${sym}&granularity=M15&from=${from}&to=${to}`);
  if (!r.ok) throw new Error(`${sym} -> ${r.status}`);
  const j = await r.json();
  return (j.values ?? []).map(v => ({ t: v.t * 1000, o: +v.open, h: +v.high, l: +v.low, c: +v.close }))
    .filter(b => Number.isFinite(b.c)).sort((a, b) => a.t - b.t);
}

const [drv, tgt] = await Promise.all([bars(DRIVER), bars(TARGET)]);
console.log(`P1 — does a confirmed turn in short-term rates lead the Nasdaq?`);
console.log(`${DRIVER} ${drv.length} bars · ${TARGET} ${tgt.length} bars · M15 · ${DAYS} days`);
console.log(`pivot reach ${REACH} (${REACH * 15}m to confirm) — every return measured from the CONFIRMATION bar\n`);

// one shared clock: only bars both instruments printed
const tgtBy = new Map(tgt.map(b => [b.t, b]));
const rows = drv.filter(b => tgtBy.has(b.t)).map(b => ({ t: b.t, d: b.c, n: tgtBy.get(b.t).c }));
console.log(`aligned bars: ${rows.length}`);

/** ATR of the target, for expressing the result as a size rather than a correlation. */
const tr = [];
for (let i = 1; i < rows.length; i++) tr.push(Math.abs(rows[i].n - rows[i - 1].n));
tr.sort((a, b) => a - b);
const atr = tr[Math.floor(tr.length / 2)] * Math.sqrt(8);   // ~2h move, the middle horizon

/** Confirmed pivots in the DRIVER. dir +1 = a low (yields peaking), -1 = a high. */
const confirms = [];
for (let i = REACH; i < rows.length - REACH; i++) {
  let hi = true, lo = true;
  for (let j = 1; j <= REACH; j++) {
    if (!(rows[i].d > rows[i - j].d && rows[i].d > rows[i + j].d)) hi = false;
    if (!(rows[i].d < rows[i - j].d && rows[i].d < rows[i + j].d)) lo = false;
  }
  // the pivot is at i; it is only knowable at i+REACH, which is where we may act
  if (lo) confirms.push({ pivot: i, at: i + REACH, dir: +1 });
  else if (hi) confirms.push({ pivot: i, at: i + REACH, dir: -1 });
}
console.log(`confirmed pivots: ${confirms.length} (${confirms.filter(c => c.dir > 0).length} lows, ${confirms.filter(c => c.dir < 0).length} highs)\n`);

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
function boot(x, y, reps = 1000, block = 5) {
  if (x.length < 5 || y.length < 5) return null;
  const pick = s => { const o = []; while (o.length < s.length) { const i = Math.floor(Math.random() * s.length); for (let k = 0; k < block && o.length < s.length; k++) o.push(s[(i + k) % s.length]); } return o; };
  const d = []; for (let r = 0; r < reps; r++) d.push(mean(pick(x)) - mean(pick(y)));
  d.sort((p, q) => p - q);
  return { lo: d[Math.floor(reps * 0.025)], hi: d[Math.floor(reps * 0.975)] };
}
const fwd = (i, H) => (i + H < rows.length && rows[i].n) ? (rows[i + H].n / rows[i].n - 1) * 100 : null;

const out = { at: new Date().toISOString(), days: DAYS, driver: DRIVER, target: TARGET, reach: REACH, minEvents: MIN_EVENTS, aligned: rows.length, confirms: confirms.length, results: [] };

for (const H of HORIZONS) {
  // de-cluster: confirmations closer than H bars are not independent
  const kept = []; let last = -Infinity;
  for (const c of confirms) if (c.at - last >= H) { kept.push(c); last = c.at; }

  // the control is every bar NOT inside a confirmation window
  const busy = new Set();
  for (const c of kept) for (let k = 0; k <= H; k++) busy.add(c.at + k);
  const ctl = [];
  for (let i = REACH; i < rows.length - H; i += H) if (!busy.has(i)) { const f = fwd(i, H); if (f != null) ctl.push(f); }

  const cell = (list, label) => {
    const sig = list.map(c => { const f = fwd(c.at, H); return f == null ? null : f * c.dir; }).filter(v => v != null);
    if (sig.length < MIN_EVENTS || ctl.length < MIN_EVENTS) return { label, verdict: 'UNTESTABLE', n: sig.length, nCtl: ctl.length };
    const ms = mean(sig), mc = mean(ctl), ci = boot(sig, ctl);
    const real = ci && ((ci.lo > 0 && ci.hi > 0) || (ci.lo < 0 && ci.hi < 0));
    const hit = sig.filter(v => v > 0).length / sig.length;
    const baseHit = ctl.filter(v => v > 0).length / ctl.length;
    return { label, verdict: real ? 'REAL' : 'NULL', n: sig.length, nCtl: ctl.length,
      signal: +ms.toFixed(4), control: +mc.toFixed(4), diff: +(ms - mc).toFixed(4),
      ci: ci ? [+ci.lo.toFixed(4), +ci.hi.toFixed(4)] : null,
      hit: +(100 * hit).toFixed(1), baseHit: +(100 * baseHit).toFixed(1),
      atrFrac: atr ? +((ms - mc) / 100 * rows.at(-1).n / atr).toFixed(2) : null };
  };

  const all = cell(kept, 'both');
  const up = cell(kept.filter(c => c.dir > 0), 'rates low (yields peaking)');
  const dn = cell(kept.filter(c => c.dir < 0), 'rates high');
  const mid = Math.floor(rows.length / 2);
  const h1 = cell(kept.filter(c => c.at < mid), 'first half');
  const h2 = cell(kept.filter(c => c.at >= mid), 'second half');

  console.log(`== ${H} bars (${H * 15}m) from confirmation ==   ${kept.length} de-clustered, ${ctl.length} controls`);
  for (const c of [all, up, dn, h1, h2]) {
    if (c.verdict === 'UNTESTABLE') { console.log(`   ${c.label.padEnd(26)} UNTESTABLE — ${c.n} events (floor ${MIN_EVENTS})`); continue; }
    console.log(`   ${c.label.padEnd(26)} ${c.signal >= 0 ? '+' : ''}${c.signal}% vs ${c.control >= 0 ? '+' : ''}${c.control}%`
      + ` -> ${c.diff >= 0 ? '+' : ''}${c.diff} [${c.ci[0]}, ${c.ci[1]}]  ${c.verdict.padEnd(4)}`
      + `  hit ${c.hit}% vs base ${c.baseHit}%   n=${c.n}${c.atrFrac != null ? `   ${c.atrFrac} ATR` : ''}`);
  }
  console.log('');
  out.results.push({ H, kept: kept.length, nCtl: ctl.length, cells: [all, up, dn, h1, h2] });
}

const own = out.results.flatMap(r => r.cells).filter(c => c.verdict !== 'UNTESTABLE');
const real = own.filter(c => c.verdict === 'REAL');
// the pre-registered gate: both directions AND both halves, not just the pooled cell
const gated = out.results.filter(r => {
  const g = Object.fromEntries(r.cells.map(c => [c.label, c]));
  return ['rates low (yields peaking)', 'rates high', 'first half', 'second half']
    .every(k => g[k]?.verdict === 'REAL' && Math.sign(g[k].diff) === Math.sign(g['both']?.diff ?? 0));
});
out.verdict = !own.length ? 'UNTESTABLE' : gated.length ? 'REAL' : 'NULL';
console.log(`VERDICT: ${out.verdict}${
  out.verdict === 'UNTESTABLE' ? ' — too few events to answer. Not a null.'
  : out.verdict === 'REAL' ? ` — clears the pre-registered gate at ${gated.map(g => g.H * 15 + 'm').join(', ')}: both directions and both halves.`
  : ` — ${real.length} of ${own.length} cells came back REAL, but none clears the pre-registered gate of BOTH directions AND BOTH halves agreeing with the pooled sign. A confirmed turn in short-term rates does not usefully lead the Nasdaq.`}`);

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/rates_pivot_lead.json', JSON.stringify(out, null, 2));
console.log('\nwritten to analysis/output/rates_pivot_lead.json');
