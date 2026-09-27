#!/usr/bin/env node
/**
 * SPREAD-DIVERGENCE-RANGE — when the DE-US 10-year spread moves and EUR/USD does not,
 * do the next hours run WIDER, even though spot does not catch up directionally?
 *
 * Design frozen in MD files/SPREAD_DIVERGENCE_RANGE_PREREG.md and committed BEFORE this
 * was written (9e92cd1).
 *
 * `spread-leads-fx-hours` settled the direction half: spot does not catch up. +1h
 * correlation -0.015 against a 0.013 placebo, zero out to 48h, on 727 setups. It never
 * computed range, and a disagreement between two markets can resolve by thrashing rather
 * than by converging.
 *
 * SAME INSTRUMENTS AND SAME BAR SOURCE as that study (DE10YB_EUR, USB10Y_USD, EUR_USD on
 * H1) so the two results sit on identical ground. Its cache holds closes only; this needs
 * highs and lows for a range, so EUR/USD is fetched into its own cache.
 *
 *   python scratchpad/runstudy.py analysis/spread_divergence_range_study.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'spread_divergence_range.json');
const CACHE = path.join(__dirname, '..', 'data', 'h1cache');
fs.mkdirSync(CACHE, { recursive: true });
const H = 3600_000;

// ── pre-registered constants ────────────────────────────────────────────────
const SPREAD_PCTILE = 0.90;    // the spread "moved": top decile of its trailing window
const TRAIL_HOURS = 24 * 500;  // ~2 years of hours
const RETHINK = 168;           // recompute the rolling thresholds weekly, not hourly:
                               // exact per-bar percentiles over a 12k window is 700M+
                               // operations and changes nothing about look-ahead
const HORIZONS = [2, 6, 24];
const MIN_EVENTS = 30;
const REPS = 1000, BLOCK = 6;  // a quarter-day block

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
const draw = (x, b) => { const o = []; while (o.length < x.length) { const i = Math.floor(Math.random() * x.length); for (let k = 0; k < b && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
function bootDiff(a, b) {
  if (a.length < MIN_EVENTS || b.length < MIN_EVENTS) return { untestable: true, nA: a.length, nB: b.length };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(a, BLOCK)) - mean(draw(b, BLOCK)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(lo), hi: r3(hi),
           real: (lo > 0 && hi > 0) || (lo < 0 && hi < 0) };
}

// ═══ 1. DATA ═════════════════════════════════════════════════════════════════
const base = () => (process.env.OANDA_ENV || 'live') === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
async function fetchH1(sym, full = false, fromIso = '2012-01-01T00:00:00Z') {
  const f = path.join(CACHE, `${sym}_H1${full ? '_hl' : ''}.json`);
  let bars = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  let from = bars.length ? new Date(bars.at(-1).t + H).toISOString() : fromIso;
  while (true) {
    const r = await fetch(`${base()}/v3/instruments/${sym}/candles?granularity=H1&price=M&from=${from}&count=5000`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`OANDA ${sym} HTTP ${r.status}`);
    const c = ((await r.json()).candles ?? []).filter(x => x.complete && x.mid)
      .map(x => full ? { t: Date.parse(x.time), c: +x.mid.c, h: +x.mid.h, l: +x.mid.l } : { t: Date.parse(x.time), c: +x.mid.c });
    if (!c.length) break;
    bars.push(...c.filter(x => !bars.length || x.t > bars.at(-1).t));
    if (c.length < 5000) break;
    from = new Date(c.at(-1).t + H).toISOString();
    process.stdout.write(`\r  ${sym} ${bars.length} bars to ${new Date(bars.at(-1).t).toISOString().slice(0, 10)}   `);
  }
  fs.writeFileSync(f, JSON.stringify(bars)); process.stdout.write('\n');
  return bars;
}

const [de, us, fx] = await Promise.all([fetchH1('DE10YB_EUR'), fetchH1('USB10Y_USD'), fetchH1('EUR_USD', true)]);
console.log(`DE10YB_EUR ${de.length} · USB10Y_USD ${us.length} · EUR_USD ${fx.length} hourly bars`);

// one shared clock
const mDe = new Map(de.map(x => [x.t, x.c])), mUs = new Map(us.map(x => [x.t, x.c]));
const rows = [];
for (let i = 1; i < fx.length; i++) {
  const t = fx[i].t, p = fx[i - 1].t;
  if (t - p > 4 * H) continue;                                    // a gap, not an hour
  if (!mDe.has(t) || !mUs.has(t) || !mDe.has(p) || !mUs.has(p)) continue;
  // These are bond PRICE CFDs, so a rising price is a FALLING yield. The spread is built
  // exactly as the original study built it -- Dlog(P_de) - Dlog(P_us) -- so the two
  // studies are measuring the same quantity with the same sign convention.
  rows.push({
    t, hour: new Date(t).getUTCHours(),
    spread: Math.log(mDe.get(t) / mDe.get(p)) - Math.log(mUs.get(t) / mUs.get(p)),
    fxRet: Math.log(fx[i].c / fx[i - 1].c),
    rng: (fx[i].h - fx[i].l) / fx[i].c,
  });
}
console.log(`aligned hours: ${rows.length}  ${new Date(rows[0].t).toISOString().slice(0, 10)} -> ${new Date(rows.at(-1).t).toISOString().slice(0, 10)}`);

// ═══ 2. SETUP AND CONTROL ════════════════════════════════════════════════════
// rolling thresholds, refreshed weekly -- no look-ahead, and tractable
let thrS = null, thrF = null;
for (let i = 0; i < rows.length; i++) {
  if (i >= TRAIL_HOURS && (i % RETHINK === 0 || thrS == null)) {
    const w = rows.slice(i - TRAIL_HOURS, i);
    const s = w.map(r => Math.abs(r.spread)).sort((a, b) => a - b);
    const f = w.map(r => Math.abs(r.fxRet)).sort((a, b) => a - b);
    thrS = s[Math.floor(s.length * SPREAD_PCTILE)];
    thrF = median(f);                                  // "spot did not answer" = below its own median
  }
  rows[i].thrS = thrS; rows[i].thrF = thrF;
}
const MAXH = Math.max(...HORIZONS);
const pick = (cond) => {
  const out = []; let last = -999;
  for (let i = TRAIL_HOURS; i < rows.length - MAXH; i++) {
    if (rows[i].thrS == null || !cond(rows[i])) continue;
    if (i - last < MAXH) continue;                     // de-cluster
    out.push(i); last = i;
  }
  return out;
};
const diverge = pick(r => Math.abs(r.spread) >= r.thrS && Math.abs(r.fxRet) < r.thrF);
const mirror = pick(r => Math.abs(r.fxRet) >= r.thrF * 3 && Math.abs(r.spread) < r.thrS * 0.3);
console.log(`divergence setups (spread moved, spot did not): ${diverge.length}`);
console.log(`mirror setups     (spot moved, spread did not): ${mirror.length}\n`);

const near = new Set();
for (const i of [...diverge, ...mirror]) for (let k = i - MAXH; k <= i + MAXH; k++) near.add(k);

// ═══ 3. THE OUTCOME ══════════════════════════════════════════════════════════
const trailMed = i => { const s = rows.slice(Math.max(0, i - 20), i).map(r => r.rng); return s.length >= 10 ? median(s) : null; };
const fwd = (i, n) => { const m = trailMed(i); if (!m || i + n >= rows.length) return null;
  return mean(rows.slice(i + 1, i + 1 + n).map(r => r.rng)) / m; };

const result = { id: 'spread-divergence-range', ranAt: new Date().toISOString(),
  aligned: rows.length, diverge: diverge.length, mirror: mirror.length, minEvents: MIN_EVENTS, cells: {} };

for (const Hh of HORIZONS) {
  const ev = diverge.map(i => fwd(i, Hh)).filter(v => v != null);
  const mi = mirror.map(i => fwd(i, Hh)).filter(v => v != null);

  // plain control: any hour far from a setup
  const ctl = [];
  for (let i = 25; i < rows.length - Hh; i++) { if (near.has(i)) continue; const v = fwd(i, Hh); if (v != null) ctl.push(v); }

  // HOUR-MATCHED control: divergences cluster into the London-New York overlap, and a
  // flat average would include the Asian lunch hour. Without this the setup looks wide
  // for a reason that has nothing to do with the spread.
  const byHour = new Map();
  for (let i = 25; i < rows.length - Hh; i++) { if (near.has(i)) continue; const v = fwd(i, Hh); if (v == null) continue;
    if (!byHour.has(rows[i].hour)) byHour.set(rows[i].hour, []); byHour.get(rows[i].hour).push(v); }
  // draw an hour-matched control pool for a given setup list
  const matchFor = list => { const out = [];
    for (const i of list) { const pool = byHour.get(rows[i].hour); if (!pool?.length) continue;
      for (let k = 0; k < 20; k++) out.push(pool[Math.floor(Math.random() * pool.length)]); }
    return out; };
  const matched = matchFor(diverge);

  // The mirror has to be judged on the SAME footing. Comparing the setup against an
  // hour-matched control and the mirror against a flat one would flatter whichever got
  // the stricter control, which is the whole thing the mirror exists to prevent.
  const mMatched = matchFor(mirror);

  // Both halves, also pre-registered as part of the gate.
  const mid = Math.floor(rows.length / 2);
  const early = diverge.filter(i => i < mid), late = diverge.filter(i => i >= mid);
  const evOf = list => list.map(i => fwd(i, Hh)).filter(v => v != null);

  result.cells[`h${Hh}`] = {
    raw: bootDiff(ev, ctl),
    hourMatched: bootDiff(ev, matched),
    mirror: bootDiff(mi, ctl),
    mirrorHourMatched: bootDiff(mi, mMatched),
    early: bootDiff(evOf(early), matchFor(early)),
    late: bootDiff(evOf(late), matchFor(late)),
  };
  const f = d => d?.untestable ? `UNTESTABLE (n=${d.nA})` : `${d.diff >= 0 ? '+' : ''}${d.diff} [${d.lo}, ${d.hi}] n=${d.nA}`;
  const c = result.cells[`h${Hh}`];
  console.log(`${Hh}h  raw ${f(c.raw)}${c.raw.real ? ' REAL' : ' null'}`);
  console.log(`     hour-matched ${f(c.hourMatched)}${c.hourMatched.real ? ' REAL' : ' null'}   <- the gate`);
  console.log(`     halves: early ${f(c.early)}${c.early.real ? ' REAL' : ' null'} | late ${f(c.late)}${c.late.real ? ' REAL' : ' null'}`);
  console.log(`     MIRROR hour-matched (spot moved, spread did not) ${f(c.mirrorHourMatched)}${c.mirrorHourMatched.real ? ' REAL' : ' null'}`);
}

// ── the verdict, from the PRE-REGISTERED gate ────────────────────────────────
// (c): anything surviving must ALSO hold with the control matched by hour of day.
const cells = Object.entries(result.cells);
// (c) as written: hour-matched AND both halves. Coded from the prereg, not from the
// numbers -- the halves were in the pre-registration and missing from the first run.
const passed = cells.filter(([, c]) => c.raw.real && c.hourMatched.real && !c.hourMatched.untestable
  && Math.sign(c.raw.diff) === Math.sign(c.hourMatched.diff)
  && c.early.real && c.late.real
  && Math.sign(c.early.diff) === Math.sign(c.hourMatched.diff)
  && Math.sign(c.late.diff) === Math.sign(c.hourMatched.diff)).map(([k]) => k);
const anyTestable = cells.some(([, c]) => !c.raw.untestable);
result.verdict = !anyTestable ? 'UNTESTABLE' : passed.length ? 'REAL' : 'NULL';
result.gate = { description: 'real against an hour-of-day-matched control, in BOTH halves, same sign throughout', passedAt: passed };
// (d) reported separately and NOT folded into the verdict, exactly as pre-registered:
// "if both do, the effect is one of the two markets moved a lot, not the disagreement".
result.mirrorVerdict = cells.map(([k, c]) => ({ at: k,
  setup: c.hourMatched.diff, mirror: c.mirrorHourMatched.diff,
  bothWiden: !!(c.hourMatched.real && c.mirrorHourMatched.real),
  setupBigger: c.mirrorHourMatched.diff != null && Math.abs(c.hourMatched.diff) > Math.abs(c.mirrorHourMatched.diff) }));
// (d) DECIDES WHAT THE RESULT MEANS, and the pre-registration said so before the run:
// "if both do, the effect is one of the two markets moved a lot, not the disagreement".
// The mirror is LARGER than the setup at every horizon, so the gate passing does not
// mean the claim passed — it means volatility clusters after a big move in either leg,
// which is already well known and is not what was being tested. breadth-narrowing died
// in exactly this way, and that is why the mirror was written into the design.
const mirrorKills = result.mirrorVerdict.some(m => m.bothWiden && !m.setupBigger);
result.claimVerdict = (result.verdict === 'REAL' && mirrorKills) ? 'NULL' : result.verdict;
result.claimNote = mirrorKills
  ? 'The gate passed but the mirror is at least as large, so the widening belongs to a big move in EITHER leg, not to the divergence between them. The claim as framed is not supported.'
  : null;

console.log(`\nGATE (c): ${result.verdict}` + (
  result.verdict === 'REAL' ? ` — survives the hour-of-day match at ${passed.join(', ')}.`
  : result.verdict === 'UNTESTABLE' ? ' — too few events. Not a null.'
  : ' — nothing survives the hour-of-day match.'));
console.log(`VERDICT ON THE CLAIM: ${result.claimVerdict}` + (result.claimNote ? `
  ${result.claimNote}` : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const m of result.mirrorVerdict) {
  console.log(`  mirror at ${m.at}: setup ${m.setup >= 0 ? '+' : ''}${m.setup} vs mirror ${m.mirror >= 0 ? '+' : ''}${m.mirror}`
    + (m.bothWiden ? ` — BOTH widen, so read this as "one of the two markets moved a lot", not as the disagreement` : ''));
}
console.log('written ' + path.relative(process.cwd(), OUT));
