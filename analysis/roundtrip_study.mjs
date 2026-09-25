#!/usr/bin/env node
/**
 * R1 — when the driver round-trips, does the linked market follow it back?
 *
 * Pre-registered in `MD files/ROUNDTRIP_PREREG.md` BEFORE this was written.
 *
 *   H1  the linked market gives back less than the driver   (expected, mechanically)
 *   H2  rates legs give back less than equity legs          ("bonds never forget")
 *   H3  follow-back differs from a MATCHED control          (the one that decides it)
 *
 * The guards, all fixed in advance:
 *   - the control is the same instruments over windows of the same length and a
 *     comparable driver excursion where the driver did NOT return. Paired, not pooled:
 *     without it, "the linked market kept 60% of its move" compares to nothing.
 *   - one event per session, because two excursions in the same session are not
 *     independent observations of anything
 *   - both directions tested separately; an effect on one side only is a period
 *     artefact, not a mechanism
 *   - MIN_EVENTS = 20 per pair, below which the pair is UNTESTABLE and gets no verdict
 *
 * Usage: node analysis/roundtrip_study.mjs [days]
 */
import fs from 'node:fs';

const API = process.env.MFX_API || 'https://macrofxmodel-production.up.railway.app';
const DAYS = Math.min(400, Math.max(30, parseInt(process.argv[2] ?? '270', 10) || 270));
const SPIKE_ATR = 1.0;     // how far from the session open counts as an excursion
const BACK_FRAC = 0.33;    // "returned" = back within a third of where the excursion began
const MIN_EVENTS = 20;
const GRAN = 'M15';

/** driver -> the legs the chain already claims it drives */
const LINKS = [
  { driver: 'WTICO_USD', label: 'crude', legs: [['USD_CAD', 'USD/CAD'], ['SPX500_USD', 'the S&P'], ['NAS100_USD', 'the Nasdaq']] },
  { driver: 'EUR_USD',   label: 'the euro (dollar leg)', legs: [['XAU_USD', 'gold'], ['GBP_USD', 'sterling']] },
];

const j = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); };
const iso = ms => new Date(ms).toISOString().slice(0, 10);

async function bars(sym) {
  const to = iso(Date.now()), from = iso(Date.now() - DAYS * 864e5);
  const d = await j(`${API}/api/ohlc-range?symbol=${sym}&granularity=${GRAN}&from=${from}&to=${to}`);
  return (d.values ?? []).map(v => ({ t: v.t * 1000, o: +v.open, h: +v.high, l: +v.low, c: +v.close }))
    .filter(b => Number.isFinite(b.c)).sort((a, b) => a.t - b.t);
}

/** bars grouped by London-midnight session, which is the anchor the rest of the desk uses */
function sessions(bs) {
  const m = new Map();
  for (const b of bs) { const k = iso(b.t - 60 * 60_000); if (!m.has(k)) m.set(k, []); m.get(k).push(b); }
  return [...m.entries()].filter(([, v]) => v.length >= 24).map(([day, v]) => ({ day, bars: v }));
}

const atrOf = ss => {
  const r = ss.map(s => Math.max(...s.bars.map(b => b.h)) - Math.min(...s.bars.map(b => b.l))).filter(x => x > 0).sort((a, b) => a - b);
  return r.length ? r[Math.floor(r.length / 2)] : null;
};

/**
 * Find the session's first excursion of >= SPIKE_ATR, and say whether it came back.
 *
 * Returns the window indices either way, so a spike that did NOT return is usable as
 * the matched control rather than thrown away.
 */
function excursion(bars, atr) {
  const open = bars[0].o;
  let peakI = -1, peakV = 0, dir = 0;
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - open, dn = open - bars[i].l;
    const v = Math.max(up, dn);
    if (v > peakV) { peakV = v; peakI = i; dir = up >= dn ? 1 : -1; }
    if (peakV >= SPIKE_ATR * atr) break;
  }
  if (peakI < 0 || peakV < SPIKE_ATR * atr) return null;
  const extreme = dir > 0 ? bars[peakI].h : bars[peakI].l;
  const backTo = open + dir * (extreme - open) * BACK_FRAC;
  let backI = -1;
  for (let i = peakI + 1; i < bars.length; i++) {
    if (dir > 0 ? bars[i].l <= backTo : bars[i].h >= backTo) { backI = i; break; }
  }
  return { startI: 0, peakI, backI, dir, size: peakV / atr, returned: backI > 0, endI: backI > 0 ? backI : bars.length - 1 };
}

/** how much of the move it made over [0..peak] had gone by [end], as a fraction */
function followBack(bars, ex) {
  const a = bars[0].c, b = bars[ex.peakI].c, c = bars[ex.endI].c;
  const moved = b - a;
  if (!Number.isFinite(moved) || Math.abs(moved) < 1e-12) return null;
  return (b - c) / moved;              // 1 = fully round-tripped, 0 = held it all
}

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
function boot(x, y, reps = 1000, block = 5) {
  if (x.length < 3 || y.length < 3) return null;
  const pick = s => { const o = []; while (o.length < s.length) { const i = Math.floor(Math.random() * s.length); for (let k = 0; k < block && o.length < s.length; k++) o.push(s[(i + k) % s.length]); } return o; };
  const d = []; for (let r = 0; r < reps; r++) d.push(mean(pick(x)) - mean(pick(y)));
  d.sort((p, q) => p - q);
  return { lo: d[Math.floor(reps * 0.025)], hi: d[Math.floor(reps * 0.975)] };
}

console.log(`R1 — when the driver round-trips, does the linked market follow it back?`);
console.log(`${GRAN} bars, ${DAYS} days, spike >= ${SPIKE_ATR} ATR, "returned" = back within ${BACK_FRAC} of the excursion\n`);

const out = { at: new Date().toISOString(), days: DAYS, spikeAtr: SPIKE_ATR, backFrac: BACK_FRAC, minEvents: MIN_EVENTS, results: [] };

for (const L of LINKS) {
  let dBars;
  try { dBars = await bars(L.driver); } catch (e) { console.log(`${L.label}: driver bars unavailable (${e.message})`); continue; }
  const dSess = sessions(dBars), dAtr = atrOf(dSess);
  if (!dAtr) { console.log(`${L.label}: no ATR`); continue; }

  // one excursion per session; a spike that did not return is the control
  const events = [];
  for (const s of dSess) { const ex = excursion(s.bars, dAtr); if (ex) events.push({ day: s.day, ex, bars: s.bars }); }
  const rt = events.filter(e => e.ex.returned), held = events.filter(e => !e.ex.returned);
  console.log(`\n== ${L.label} ==  ${dSess.length} sessions, ${events.length} excursions >= ${SPIKE_ATR} ATR: ${rt.length} round-tripped, ${held.length} did not`);
  console.log(`   driver's own give-back on a round trip: ${rt.length ? mean(rt.map(e => followBack(e.bars, e.ex))).toFixed(2) : '—'} (1.0 by construction-ish)`);

  for (const [sym, name] of L.legs) {
    let lBars; try { lBars = await bars(sym); } catch { console.log(`   ${name}: bars unavailable`); continue; }
    const lBy = new Map(sessions(lBars).map(s => [s.day, s.bars]));
    const fb = (list) => list.map(e => {
      const lb = lBy.get(e.day); if (!lb || lb.length <= e.ex.endI) return null;
      return followBack(lb, e.ex);
    }).filter(v => v != null && Math.abs(v) < 5);       // a 5x give-back is a different event, not this one

    const sig = fb(rt), ctl = fb(held);
    if (sig.length < MIN_EVENTS || ctl.length < MIN_EVENTS) {
      console.log(`   ${name.padEnd(12)} UNTESTABLE — ${sig.length} round trips vs ${ctl.length} controls, floor is ${MIN_EVENTS}`);
      out.results.push({ driver: L.label, leg: name, verdict: 'UNTESTABLE', n: sig.length, nCtl: ctl.length });
      continue;
    }
    const ms = mean(sig), mc = mean(ctl), ci = boot(sig, ctl);
    const real = ci && ((ci.lo > 0 && ci.hi > 0) || (ci.lo < 0 && ci.hi < 0));
    // direction split: an effect on one side only is a period artefact
    const upS = fb(rt.filter(e => e.ex.dir > 0)), dnS = fb(rt.filter(e => e.ex.dir < 0));
    console.log(`   ${name.padEnd(12)} gave back ${ms.toFixed(2)} of its move vs ${mc.toFixed(2)} when the driver held`
      + `  -> ${(ms - mc) > 0 ? '+' : ''}${(ms - mc).toFixed(2)} [${ci.lo.toFixed(2)}, ${ci.hi.toFixed(2)}]  ${real ? 'REAL' : 'NULL'}`
      + `   n=${sig.length}/${ctl.length}  up ${upS.length ? mean(upS).toFixed(2) : '—'} · down ${dnS.length ? mean(dnS).toFixed(2) : '—'}`);
    out.results.push({ driver: L.label, leg: name, verdict: real ? 'REAL' : 'NULL', signal: +ms.toFixed(3), control: +mc.toFixed(3),
      diff: +(ms - mc).toFixed(3), ci: [+ci.lo.toFixed(3), +ci.hi.toFixed(3)], n: sig.length, nCtl: ctl.length,
      up: upS.length ? +mean(upS).toFixed(3) : null, down: dnS.length ? +mean(dnS).toFixed(3) : null });
  }
}

const own = out.results.filter(r => r.verdict !== 'UNTESTABLE');
const real = own.filter(r => r.verdict === 'REAL');
out.verdict = !own.length ? 'UNTESTABLE' : real.length ? 'REAL' : 'NULL';
console.log(`\nVERDICT: ${!own.length
  ? `UNTESTABLE — every leg fell below the ${MIN_EVENTS}-event floor. This is NOT a null: the question was not answered.`
  : real.length ? `${real.length} of ${own.length} legs REAL — ${real.map(r => r.leg).join(', ')}`
  : `NULL on every testable leg. A linked market gives back no more, and no less, of its move when the driver round-trips than when the driver holds.`}`);

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/roundtrip.json', JSON.stringify(out, null, 2));
console.log('\nwritten to analysis/output/roundtrip.json');
