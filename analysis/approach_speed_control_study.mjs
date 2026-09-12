// Approach-Speed CONTROL Study — 2026-09-12
//
//   node analysis/approach_speed_control_study.mjs               # gold, eurusd, usdjpy, nq
//   LA_PAIRS=gold,eurusd node analysis/approach_speed_control_study.mjs
//   YEARS=3 node analysis/approach_speed_control_study.mjs        # shorter window
//
// THE CLAIM UNDER TEST. An external "approach speed" page (seen 2026-09-12) reports
// that when price reaches a level slowly, it then DWELLS: the slowest fifth of
// arrivals spend ~80% of the next hour within 0.10 ATR of the level, the fastest
// fifth ~62%. It holds in every session band and at every level family, with
// bootstrap CIs clear of zero, and it is presented as a property of levels.
//
// THE HOLE. "Slow arrival -> stays near the level" has a mechanical explanation
// the page never rules out: a slowly-moving price stays near WHEREVER IT IS. Speed
// persists for an hour whether or not there is a level under it (vol clustering).
// The tell is on the page itself -- every family separates, including $10 handles
// and open +/- 0.5 ATR, the ones nobody claims are special. When everything works,
// suspect the measure. That is exactly what analysis/line_touch_control_study.mjs
// found two days ago for a different statistic: the effect was in the DAY, not the
// line.
//
// THE CONTROL. For every level touch, one PAIRED control: a random bar from a
// different session of the same instrument, in the same hour band, that is NOT near
// any level. Its close is treated as a pseudo-level and the identical statistic is
// computed -- recent speed, then dwell within 0.10 ATR of that price over the next
// hour, vol ratio, displacement. If the speed->dwell separation at pseudo-levels
// matches the separation at real ones, the level contributes nothing and the whole
// effect is "price moving slowly keeps moving slowly", which is true, useful, and
// NOT about levels. The quantity that decides it is the LEVEL INCREMENT: within a
// speed quintile, dwell(touch) - dwell(control), paired.
//
// Controls are assigned to a quintile using the TOUCH cut points for that band, so
// "slow" means the same speed in both groups. Everything is normalised by the
// instrument's daily ATR(14) so instruments and eras pool.
//
// Level families (three, deliberately -- enough to test "every family", few enough
// to keep the control's exclusion zone honest):
//   priorDay   prior session high and low
//   asia       high / low of 23:00-07:00 UTC, usable only for touches at >= 07:00
//   handle     round-number grid per asset class
//
// Deterministic (seeded RNG) so a re-run reproduces the same controls.
//
// Output: analysis/output/approach-speed-control/{pair}.json and a pooled summary,
// plus a console table. Nothing here is a signal; the question is only whether the
// level is doing any work.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, 'output', 'approach-speed-control');

const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ['gold', 'eurusd', 'usdjpy', 'nq'];
const YEARS = Number(process.env.YEARS || 5);

const ATR_N = 14;
const SPEED_BARS = 15;          // approach speed = move over the prior 15 minutes
const FWD_BARS = 60;            // outcome horizon
const DWELL_ATR = 0.10;         // "near the level"
const CONTROL_EXCLUDE_ATR = 0.25; // a control must sit further than this from every level
const BOOT_REPS = 400;
const BANDS = [
  { key: 'asia',   label: 'Asia 23:00-07:00',    inBand: h => h >= 23 || h < 7 },
  { key: 'london', label: 'London 07:00-12:00',  inBand: h => h >= 7 && h < 12 },
  { key: 'ny',     label: 'NY overlap 12:00-17:00', inBand: h => h >= 12 && h < 17 },
  { key: 'late',   label: 'Late 17:00-23:00',    inBand: h => h >= 17 && h < 23 },
];
const bandOf = h => BANDS.find(b => b.inBand(h))?.key ?? null;

// Round-number grid per instrument. Coarse on purpose: a fine grid puts a "level"
// everywhere and leaves the control nowhere to stand.
function handleStep(pair) {
  if (pair === 'gold') return 10;
  if (['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'].includes(pair)) return 50;
  if (pair.endsWith('jpy')) return 0.5;
  return 0.005;                 // 50 pips
}

// ── deterministic RNG ────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── stats ────────────────────────────────────────────────────────────────────
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
function pairedT(diffs) {
  const n = diffs.length; if (n < 3) return { n, mean: mean(diffs), t: null };
  const m = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : null };
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
// Day-block bootstrap of a statistic over rows tagged with a day key.
function dayBootstrap(rows, statFn, rng, reps = BOOT_REPS) {
  const byDay = new Map();
  for (const r of rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); }
  const days = [...byDay.values()];
  const out = [];
  for (let k = 0; k < reps; k++) {
    const sample = [];
    for (let i = 0; i < days.length; i++) sample.push(...days[Math.floor(rng() * days.length)]);
    const v = statFn(sample); if (v != null && Number.isFinite(v)) out.push(v);
  }
  out.sort((a, b) => a - b);
  return { lo: quantile(out, 0.025), hi: quantile(out, 0.975), n: out.length };
}

// ── per-instrument ───────────────────────────────────────────────────────────
async function processPair(pair) {
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data'); return null; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const allDates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 300);
  const cutoffDate = new Date(Date.now() - YEARS * 365.25 * 864e5).toISOString().slice(0, 10);
  const dates = allDates.filter(d => d >= cutoffDate);
  if (dates.length < ATR_N + 30) { console.log('  too little history'); return null; }
  const step = handleStep(pair);
  const rng = mulberry32(0xA55E55 ^ pair.length);

  // Daily H/L/C per session (for ATR and prior-day levels), over the FULL history so
  // the first usable day already has an ATR behind it.
  const d1 = new Map();
  for (const d of allDates) {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    d1.set(d, { hi, lo, close: b[b.length - 1].close });
  }
  const atrAt = (idx) => {           // ATR(14) from the 14 sessions BEFORE allDates[idx]
    if (idx < ATR_N + 1) return null;
    let s = 0;
    for (let k = idx - ATR_N; k < idx; k++) {
      const c = d1.get(allDates[k]), p = d1.get(allDates[k - 1]);
      s += Math.max(c.hi - c.lo, Math.abs(c.hi - p.close), Math.abs(c.lo - p.close));
    }
    return s / ATR_N;
  };

  // Per-session preparation: levels for the day and the bars with hour tags.
  const prepared = [];
  for (const date of dates) {
    const idx = allDates.indexOf(date);
    const atr = atrAt(idx);
    if (!(atr > 0)) continue;
    const bars = sessions.get(date);
    const prev = d1.get(allDates[idx - 1]);
    // Asia H/L: bars of THIS session with UTC hour < 7, plus the tail of the previous
    // session at >= 23. Usable only from 07:00.
    let aHi = -Infinity, aLo = Infinity;
    const prevBars = sessions.get(allDates[idx - 1]) ?? [];
    for (const x of prevBars) { const h = new Date(x.time * 1000).getUTCHours(); if (h >= 23) { if (x.high > aHi) aHi = x.high; if (x.low < aLo) aLo = x.low; } }
    for (const x of bars) { const h = new Date(x.time * 1000).getUTCHours(); if (h < 7) { if (x.high > aHi) aHi = x.high; if (x.low < aLo) aLo = x.low; } }
    const levels = [
      { fam: 'priorDay', price: prev.hi, from: 0 }, { fam: 'priorDay', price: prev.lo, from: 0 },
    ];
    if (aHi > -Infinity) { levels.push({ fam: 'asia', price: aHi, from: 7 }, { fam: 'asia', price: aLo, from: 7 }); }
    prepared.push({ date, bars, atr, levels, hours: bars.map(x => new Date(x.time * 1000).getUTCHours()) });
  }

  // Outcome for "price at P at bar i, arriving at speed s": dwell, vol ratio,
  // displacement. Identical for touches and controls -- that is the whole design.
  function outcome(bars, i, P, atr) {
    if (i < FWD_BARS || i + FWD_BARS >= bars.length) return null;
    let near = 0, fhi = -Infinity, flo = Infinity, phi = -Infinity, plo = Infinity;
    for (let k = 1; k <= FWD_BARS; k++) {
      const b = bars[i + k];
      if (Math.abs(b.close - P) <= DWELL_ATR * atr) near++;
      if (b.high > fhi) fhi = b.high; if (b.low < flo) flo = b.low;
      const q = bars[i - k];
      if (q.high > phi) phi = q.high; if (q.low < plo) plo = q.low;
    }
    const prevRange = phi - plo;
    return {
      dwell: near / FWD_BARS,
      volRatio: prevRange > 0 ? (fhi - flo) / prevRange : null,
      disp: (bars[i + FWD_BARS].close - P) / atr,
    };
  }

  // ── touches ──
  const touches = [];
  for (const s of prepared) {
    const { bars, atr, levels, hours, date } = s;
    // Handles that the day actually visited, generated from the day's range.
    let dHi = -Infinity, dLo = Infinity; for (const b of bars) { if (b.high > dHi) dHi = b.high; if (b.low < dLo) dLo = b.low; }
    const hs = [];
    for (let h = Math.ceil(dLo / step) * step; h <= dHi; h += step) hs.push({ fam: 'handle', price: +h.toFixed(6), from: 0 });
    const all = [...levels, ...hs];
    for (const L of all) {
      // First touch: first bar whose range contains the level, at or after the hour
      // the level becomes usable, with enough runway either side.
      for (let i = SPEED_BARS + 1; i < bars.length - FWD_BARS - 1; i++) {
        if (hours[i] < L.from && L.fam === 'asia') continue;
        const b = bars[i];
        if (!(b.low <= L.price && L.price <= b.high)) continue;
        // Approach speed: movement over the prior 15 bars, signed toward the level.
        // Measured from the bar BEFORE the touch so the touch bar's own range is not
        // inside its own approach.
        const from = bars[i - 1 - SPEED_BARS].close, to = bars[i - 1].close;
        const towardSign = Math.sign(L.price - from) || 1;
        const speed = ((to - from) * towardSign) / SPEED_BARS / atr;   // ATR per minute, toward the level
        if (!(speed > 0)) break;      // moving away or flat at first contact: not an "arrival"
        const o = outcome(bars, i, L.price, atr);
        if (!o) break;
        touches.push({ day: date, fam: L.fam, band: bandOf(hours[i]), hour: hours[i], speed, ...o, disp: o.disp * towardSign, i });
        break;
      }
    }
  }
  if (touches.length < 200) { console.log(`  only ${touches.length} touches`); return null; }

  // ── quintile cut points per band, from TOUCHES only ──
  const cuts = {};
  for (const bd of BANDS) {
    const sp = touches.filter(t => t.band === bd.key).map(t => t.speed).sort((a, b) => a - b);
    if (sp.length < 50) continue;
    cuts[bd.key] = [0.2, 0.4, 0.6, 0.8].map(q => quantile(sp, q));
  }
  const qOf = (band, speed) => { const c = cuts[band]; if (!c) return null; let q = 0; while (q < 4 && speed > c[q]) q++; return q; };
  for (const t of touches) t.q = qOf(t.band, t.speed);

  // ── paired controls ──
  // Same instrument, same band, DIFFERENT session, not near any level of that day.
  const byBand = {};
  for (const s of prepared) {
    // candidate bars per band for this session
    for (let i = SPEED_BARS + FWD_BARS + 1; i < s.bars.length - FWD_BARS - 1; i++) {
      const bd = bandOf(s.hours[i]); if (!bd) continue;
      (byBand[bd] ||= []).push({ s, i });
    }
  }
  // Two exclusion radii, because the handle grid is dense. On gold the grid is $10
  // and ATR ~113, so 0.25 ATR = 28 points and EVERY price is within that of a
  // handle -- the first run matched zero controls. Structural levels (prior day,
  // Asia) keep the ATR-scaled radius; handles use a fraction of their own spacing,
  // which leaves ~40% of prices as legitimate non-handle ground.
  const HANDLE_EXCLUDE = 0.3 * step;
  const nearAnyLevel = (s, price) => {
    const { atr, levels } = s;
    for (const L of levels) if (Math.abs(price - L.price) <= CONTROL_EXCLUDE_ATR * atr) return true;
    const nearest = Math.round(price / step) * step;
    return Math.abs(price - nearest) <= HANDLE_EXCLUDE;
  };
  const controls = [];
  let missed = 0;
  for (const t of touches) {
    const pool = byBand[t.band]; if (!pool?.length) { missed++; continue; }
    let picked = null;
    for (let tries = 0; tries < 60 && !picked; tries++) {
      const c = pool[Math.floor(rng() * pool.length)];
      if (c.s.date === t.day) continue;
      const P = c.s.bars[c.i].close;
      if (nearAnyLevel(c.s, P)) continue;
      const from = c.s.bars[c.i - 1 - SPEED_BARS].close, to = c.s.bars[c.i - 1].close;
      const speed = Math.abs(to - from) / SPEED_BARS / c.s.atr;
      const o = outcome(c.s.bars, c.i, P, c.s.atr);
      if (!o) continue;
      const dir = Math.sign(to - from) || 1;
      picked = { day: c.s.date, band: t.band, speed, q: qOf(t.band, speed), ...o, disp: o.disp * dir, touchDay: t.day, touchQ: t.q };
    }
    if (picked) controls.push({ touch: t, control: picked }); else missed++;
  }

  // ── tables ──
  const table = (rows, key) => {
    const out = {};
    for (let q = 0; q < 5; q++) {
      const r = rows.filter(x => x.q === q);
      out[`Q${q + 1}`] = { n: r.length, dwell: mean(r.map(x => x.dwell)), volRatio: mean(r.map(x => x.volRatio).filter(v => v != null)), disp: mean(r.map(x => x.disp)) };
    }
    out.separation = (out.Q1.dwell != null && out.Q5.dwell != null) ? out.Q5.dwell - out.Q1.dwell : null;
    return out;
  };
  const perBand = {};
  for (const bd of BANDS) {
    const tRows = touches.filter(t => t.band === bd.key && t.q != null);
    const cRows = controls.filter(p => p.touch.band === bd.key && p.control.q != null).map(p => p.control);
    if (tRows.length < 100) continue;
    // Level increment within a speed quintile: dwell(touch) - dwell(control), paired,
    // where the control is assigned to the SAME quintile as its touch by speed. Only
    // pairs whose control landed in the same quintile as the touch count -- otherwise
    // the comparison is between different speeds and says nothing about the level.
    const inc = {};
    for (let q = 0; q < 5; q++) {
      const pairsQ = controls.filter(p => p.touch.band === bd.key && p.touch.q === q && p.control.q === q);
      inc[`Q${q + 1}`] = { ...pairedT(pairsQ.map(p => p.touch.dwell - p.control.dwell)) };
    }
    // Separation difference (touch minus control), day-block bootstrapped.
    const sepStat = rows => { const t = table(rows.filter(r => r.kind === 't')), c = table(rows.filter(r => r.kind === 'c')); return (t.separation != null && c.separation != null) ? t.separation - c.separation : null; };
    const tagged = [...tRows.map(r => ({ ...r, kind: 't' })), ...cRows.map(r => ({ ...r, kind: 'c' }))];
    perBand[bd.key] = {
      label: bd.label, nTouch: tRows.length, nControl: cRows.length,
      cuts: cuts[bd.key],
      touch: table(tRows), control: table(cRows),
      levelIncrementByQuintile: inc,
      separationDiff: { value: sepStat(tagged), ci95: dayBootstrap(tagged, sepStat, rng) },
    };
  }
  // Per family (pooled across bands), touches only vs their controls.
  const perFamily = {};
  for (const fam of ['priorDay', 'asia', 'handle']) {
    const ps = controls.filter(p => p.touch.fam === fam && p.touch.q != null && p.control.q === p.touch.q);
    if (ps.length < 50) continue;
    perFamily[fam] = {
      nPairs: ps.length,
      touchSeparation: table(touches.filter(t => t.fam === fam && t.q != null)).separation,
      controlSeparation: table(ps.map(p => p.control)).separation,
      levelIncrementAllQ: pairedT(ps.map(p => p.touch.dwell - p.control.dwell)),
      levelIncrementSlowQ1: pairedT(ps.filter(p => p.touch.q === 0).map(p => p.touch.dwell - p.control.dwell)),
    };
  }

  console.log(`  ${prepared.length} sessions, ${touches.length} touches, ${controls.length} paired controls (${missed} unmatched)`);
  return {
    pair, years: YEARS, generatedAt: new Date().toISOString(),
    coverage: { from: prepared[0]?.date, to: prepared.at(-1)?.date, sessions: prepared.length },
    params: { ATR_N, SPEED_BARS, FWD_BARS, DWELL_ATR, CONTROL_EXCLUDE_ATR, handleExclude: HANDLE_EXCLUDE, handleStep: step, BOOT_REPS },
    nTouch: touches.length, nControl: controls.length,
    perBand, perFamily,
  };
}

// ── console report ───────────────────────────────────────────────────────────
const f2 = v => v == null ? '   -  ' : (v >= 0 ? '+' : '') + v.toFixed(3);
const f3 = v => v == null ? '  -  ' : v.toFixed(3);
function report(r) {
  console.log(`\n${r.pair.toUpperCase()}  ${r.coverage.from} -> ${r.coverage.to}  (${r.coverage.sessions} sessions, ${r.nTouch} touches, ${r.nControl} controls)`);
  console.log('  band      n(t)   n(c)  | dwell Q1  Q5   sep   |  CONTROL Q1  Q5   sep   | sep diff [95% CI]      | level increment Q1 (paired t)');
  for (const [k, b] of Object.entries(r.perBand)) {
    const t = b.touch, c = b.control, sd = b.separationDiff, i1 = b.levelIncrementByQuintile.Q1;
    console.log(`  ${k.padEnd(8)} ${String(b.nTouch).padStart(5)} ${String(b.nControl).padStart(6)}  | ${f3(t.Q1.dwell)} ${f3(t.Q5.dwell)} ${f2(t.separation)} |  ${f3(c.Q1.dwell)} ${f3(c.Q5.dwell)} ${f2(c.separation)} | ${f2(sd.value)} [${f2(sd.ci95.lo)}, ${f2(sd.ci95.hi)}] | ${f2(i1.mean)}  t=${i1.t == null ? '-' : i1.t.toFixed(1)} n=${i1.n}`);
  }
  console.log('  family     pairs | touch sep  control sep | level increment all-Q (t)   slow-Q1 (t)');
  for (const [k, fm] of Object.entries(r.perFamily)) {
    console.log(`  ${k.padEnd(9)} ${String(fm.nPairs).padStart(6)} | ${f2(fm.touchSeparation)}   ${f2(fm.controlSeparation)}    | ${f2(fm.levelIncrementAllQ.mean)} (t=${fm.levelIncrementAllQ.t?.toFixed(1) ?? '-'})        ${f2(fm.levelIncrementSlowQ1.mean)} (t=${fm.levelIncrementSlowQ1.t?.toFixed(1) ?? '-'})`);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  for (const pair of PAIRS) {
    console.log(`${pair.toUpperCase()}:`);
    const r = await processPair(pair);
    if (!r) { console.log('  skipped'); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${pair}.json`), JSON.stringify(r));
    results.push(r);
    report(r);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pairs: results.map(r => ({ pair: r.pair, nTouch: r.nTouch, perBand: r.perBand, perFamily: r.perFamily })) }));
  console.log(`\nwrote ${OUT_DIR}`);
  console.log('\nHOW TO READ IT. "sep" is dwell(fastest fifth) - dwell(slowest fifth): negative means slow arrivals dwell more.');
  console.log('If the CONTROL sep is about as negative as the touch sep, speed persistence explains it and the level adds nothing.');
  console.log('"level increment" is dwell(touch) - dwell(control) at the SAME speed, paired: the level\'s own contribution.');
}

if (path.resolve(process.argv[1] ?? '') === __filename) main();
