// Squeeze-fuel vs realised volatility — PRE-REGISTERED 2026-09-13
//
//   node analysis/squeeze_vol_study.mjs                 # all four backfilled instruments
//   LA_PAIRS=gold node analysis/squeeze_vol_study.mjs
//
// THE CLAIM. When the retail position book is crowded on one side AND that side is
// mostly underwater, the next day is WIDER than a comparable day without that
// setup. "Crowded and losing is squeeze fuel" -- a statement about the RANGE of
// what follows, never its direction. Direction is exploratory below and carries no
// pass bar, because retail on FX mirrors momentum and momentum on FX is a banked
// null here: any directional result would have to survive that first.
//
// PRE-REGISTERED, FROZEN BEFORE THE FIRST RUN:
//   setup      at the 07:00 UTC snapshot (before London, so the read precedes the
//              day it is scored against): the larger side holds >= 60% of near-spot
//              positions, and >= 70% of THAT side is underwater
//   outcome    realised high-low range in ATR(14) over the next 24h (07:00 -> 07:00)
//              and the next 5 trading days
//   control    for each setup day, one non-setup day of the same instrument, from a
//              different ISO week, matched on vol-percentile quintile (ATR14 rank
//              over the trailing 252 sessions) AND prior-5-day momentum tercile
//              (signed, in ATR). Matching on both is what stops "wide day follows
//              wide day" and "trend in disguise" from producing the result.
//   statistic  paired mean difference (setup - control) in next-24h range, with a
//              week-block bootstrap 95% CI (400 reps); the same at 5d
//   PASS       the 24h paired difference is positive with the CI clear of zero on
//              at least 3 of the 4 instruments. Anything less is a null and is
//              banked as one. The 5d horizon is reported, not scored.
//
// Two robustness cells, also pre-registered, reported alongside but not scored:
//   R1  setup defined on the 5-year live-store window only (2021-09 onward), in
//       case the 2017-2021 book behaves differently
//   R2  thresholds 65 / 75 -- if the effect exists it should not vanish one notch up
//
// Data: backfill/books_daily.ndjson (one 07:00 snapshot per trading day since
// 2017-05, summarised by js/positionBookMetrics.js -- the same metric the page
// shows) and the frozen M1 history the other studies use. Deterministic RNG.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { summarisePositionBook } from '../js/positionBookMetrics.js';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, 'output', 'squeeze-vol');
const NDJSON = path.join(__dirname, '..', 'backfill', 'books_daily.ndjson');

const INST = { EUR_USD: 'eurusd', XAU_USD: 'gold', USD_JPY: 'usdjpy', GBP_USD: 'gbpusd' };
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()) : Object.values(INST);

const CROWD = 60, PAIN = 70;              // pre-registered
const CROWD_R2 = 65, PAIN_R2 = 75;        // robustness
const ATR_N = 14, VOL_RANK_N = 252, MOM_DAYS = 5, BOOT = 400;
const HOUR = 7;                           // snapshot hour, UTC

function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
function quantile(sorted, q) { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function pairedT(d) { const n = d.length; if (n < 3) return { n, mean: mean(d), t: null }; const m = mean(d); const sd = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)); return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : null }; }
const isoWeek = d => { const x = new Date(d + 'T00:00:00Z'); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-${Math.round(((x - y0) / 864e5 - 3 + ((y0.getUTCDay() + 6) % 7)) / 7) + 1}`; };
function weekBootstrap(pairs, rng, reps = BOOT) {
  const byW = new Map(); for (const p of pairs) { if (!byW.has(p.week)) byW.set(p.week, []); byW.get(p.week).push(p.diff); }
  const weeks = [...byW.values()], out = [];
  for (let k = 0; k < reps; k++) { const s = []; for (let i = 0; i < weeks.length; i++) s.push(...weeks[Math.floor(rng() * weeks.length)]); out.push(mean(s)); }
  out.sort((a, b) => a - b); return { lo: quantile(out, 0.025), hi: quantile(out, 0.975) };
}

// ── book snapshots ───────────────────────────────────────────────────────────
async function loadBook() {
  const by = {};
  const rl = readline.createInterface({ input: fs.createReadStream(NDJSON) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const j = JSON.parse(line); if (j.book !== 'position') continue;
    const m = summarisePositionBook({ price: String(j.price), time: j.time, buckets: j.buckets.map(([p, l, s]) => ({ price: String(p), longCountPercent: String(l), shortCountPercent: String(s) })) });
    if (!m || m.longPct == null || !m.pain) continue;
    const crowdSide = m.longPct >= 50 ? 'long' : 'short';
    const crowd = Math.max(m.longPct, m.shortPct ?? 0);
    const pain = crowdSide === 'long' ? m.pain.longsUnderwaterPct : m.pain.shortsUnderwaterPct;
    (by[j.instrument] ||= {})[j.time.slice(0, 10)] = { crowdSide, crowd, pain, spot: m.spot };
  }
  return by;
}

// ── price outcomes from M1 ───────────────────────────────────────────────────
// Everything is anchored to the 07:00 UTC bar of each session, so "next 24h" is
// 07:00 -> 07:00 and the ATR is from completed sessions before the snapshot.
async function loadPrices(pair) {
  const packed = await loadM1ForPair(pair);
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 300);
  const d1 = new Map();
  for (const d of dates) { const b = sessions.get(d); let hi = -Infinity, lo = Infinity; for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } d1.set(d, { hi, lo, close: b.at(-1).close }); }
  const atrAt = i => { if (i < ATR_N + 1) return null; let s = 0; for (let k = i - ATR_N; k < i; k++) { const c = d1.get(dates[k]), p = d1.get(dates[k - 1]); s += Math.max(c.hi - c.lo, Math.abs(c.hi - p.close), Math.abs(c.lo - p.close)); } return s / ATR_N; };
  // Index of the first bar at/after 07:00 UTC in each session, plus that bar's close.
  const at7 = new Map();
  for (const d of dates) { const b = sessions.get(d); const i = b.findIndex(x => new Date(x.time * 1000).getUTCHours() >= HOUR); if (i >= 0) at7.set(d, { i, px: b[i].close, bars: b }); }
  const atrs = dates.map((_, i) => atrAt(i));
  const rows = new Map();
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i], atr = atrs[i], a = at7.get(d);
    if (!(atr > 0) || !a) continue;
    // vol percentile: ATR rank over trailing 252 completed sessions
    const win = atrs.slice(Math.max(0, i - VOL_RANK_N), i).filter(v => v != null);
    const volPct = win.length >= 60 ? win.filter(v => v <= atr).length / win.length : null;
    // momentum: close at 07:00 today minus 07:00 five sessions ago, in ATR
    const p5 = i >= MOM_DAYS ? at7.get(dates[i - MOM_DAYS]) : null;
    const mom = p5 ? (a.px - p5.px) / atr : null;
    // next 24h range: from 07:00 today to 07:00 next session
    const nx = i + 1 < dates.length ? at7.get(dates[i + 1]) : null;
    let r24 = null;
    if (nx) { let hi = -Infinity, lo = Infinity; for (let k = a.i; k < a.bars.length; k++) { const x = a.bars[k]; if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } for (let k = 0; k < nx.i; k++) { const x = nx.bars[k]; if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } r24 = (hi - lo) / atr; }
    // next 5d range
    let r5 = null;
    if (i + 5 < dates.length) { let hi = -Infinity, lo = Infinity; for (let j = 0; j <= 5; j++) { const s = at7.get(dates[i + j]); if (!s) { hi = null; break; } const from = j === 0 ? s.i : 0, to = j === 5 ? s.i : s.bars.length; for (let k = from; k < to; k++) { const x = s.bars[k]; if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } } if (hi != null) r5 = (hi - lo) / atr; }
    // direction over 24h, for the exploratory cell
    const dir24 = nx ? (nx.px - a.px) / atr : null;
    rows.set(d, { atr, volPct, mom, r24, r5, dir24 });
  }
  return rows;
}

// ── the test ─────────────────────────────────────────────────────────────────
function run(days, { crowd, pain, from }, rng) {
  const all = days.filter(x => x.r24 != null && x.volPct != null && x.mom != null && (!from || x.d >= from));
  const volQ = x => Math.min(4, Math.floor(x.volPct * 5));
  const momT = x => x.mom < -0.5 ? 0 : x.mom > 0.5 ? 2 : 1;
  const isSetup = x => x.crowd >= crowd && x.pain >= pain;
  const setups = all.filter(isSetup), pool = all.filter(x => !isSetup(x));
  const pairs = [];
  for (const s of setups) {
    const cands = pool.filter(c => volQ(c) === volQ(s) && momT(c) === momT(s) && c.week !== s.week);
    if (!cands.length) continue;
    const c = cands[Math.floor(rng() * cands.length)];
    pairs.push({ week: s.week, diff: s.r24 - c.r24, diff5: (s.r5 != null && c.r5 != null) ? s.r5 - c.r5 : null, setup: s, control: c });
  }
  const d24 = pairs.map(p => p.diff), d5 = pairs.map(p => p.diff5).filter(v => v != null);
  const t24 = pairedT(d24), ci24 = pairs.length >= 10 ? weekBootstrap(pairs, rng) : { lo: null, hi: null };
  const t5 = pairedT(d5);
  // Exploratory: does the day resolve AGAINST the crowd? (+ = against)
  const against = pairs.map(p => (p.setup.crowdSide === 'long' ? -p.setup.dir24 : p.setup.dir24)).filter(v => v != null);
  return {
    nDays: all.length, nSetup: setups.length, nPaired: pairs.length, setupRate: +(setups.length / Math.max(1, all.length)).toFixed(3),
    h24: { meanDiffAtr: t24.mean != null ? +t24.mean.toFixed(3) : null, t: t24.t != null ? +t24.t.toFixed(2) : null, ci95: [ci24.lo != null ? +ci24.lo.toFixed(3) : null, ci24.hi != null ? +ci24.hi.toFixed(3) : null],
           setupMean: pairs.length ? +mean(pairs.map(p => p.setup.r24)).toFixed(3) : null, controlMean: pairs.length ? +mean(pairs.map(p => p.control.r24)).toFixed(3) : null, clear: ci24.lo != null ? (ci24.lo > 0 ? 'above' : ci24.hi < 0 ? 'below' : 'no') : 'no' },
    h5:  { meanDiffAtr: t5.mean != null ? +t5.mean.toFixed(3) : null, t: t5.t != null ? +t5.t.toFixed(2) : null, n: t5.n },
    exploratory_direction: { meanAgainstCrowdAtr: against.length ? +mean(against).toFixed(3) : null, n: against.length, note: 'not scored; would have to survive a momentum control on its own' },
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const book = await loadBook();
  const results = {};
  let passes = 0, cells = 0;
  console.log('PRE-REGISTERED: crowd >= 60%, pain >= 70% at 07:00 UTC -> next-24h range vs matched control (vol quintile x momentum tercile, different week)');
  console.log('PASS bar: 24h paired diff > 0 with week-bootstrap 95% CI clear of zero on >= 3 of 4 instruments\n');
  for (const [inst, pair] of Object.entries(INST)) {
    if (!PAIRS.includes(pair)) continue;
    if (!book[inst]) { console.log(`${inst}: no book data`); continue; }
    const prices = await loadPrices(pair);
    const days = Object.entries(book[inst]).map(([d, b]) => { const p = prices.get(d); return p ? { d, week: isoWeek(d), ...b, ...p } : null; }).filter(Boolean).sort((a, b) => a.d < b.d ? -1 : 1);
    // Diagnostics first: how many days joined, and the distribution of crowd and pain,
    // so an empty cell is explained rather than crashed on.
    const joined = days.length, withOut = days.filter(x => x.r24 != null && x.volPct != null && x.mom != null).length;
    const crowds = days.map(x => x.crowd).sort((a, b) => a - b), pains = days.map(x => x.pain).sort((a, b) => a - b);
    console.log(`${inst}: ${joined} book days joined to prices (${Object.keys(book[inst]).length} in book), ${withOut} with full outcomes; crowd p50/p90 ${quantile(crowds, .5)?.toFixed(1)}/${quantile(crowds, .9)?.toFixed(1)}, pain p50/p90 ${quantile(pains, .5)?.toFixed(1)}/${quantile(pains, .9)?.toFixed(1)}`);
    const rng = mulberry32(0x5EED ^ inst.length);
    const main_ = run(days, { crowd: CROWD, pain: PAIN }, rng);
    const r1 = run(days, { crowd: CROWD, pain: PAIN, from: '2021-09-01' }, mulberry32(1));
    const r2 = run(days, { crowd: CROWD_R2, pain: PAIN_R2 }, mulberry32(2));
    results[inst] = { pair, days: days.length, coverage: { from: days[0]?.d, to: days.at(-1)?.d }, main: main_, r1_liveWindow: r1, r2_tighter: r2 };
    cells++; if (main_.h24.clear === 'above') passes++;
    const f = v => v == null ? '  -  ' : (v >= 0 ? '+' : '') + v.toFixed(3);
    console.log(`${inst}  ${days.length} days (${days[0]?.d} -> ${days.at(-1)?.d})   setups ${main_.nSetup} (${(main_.setupRate * 100).toFixed(1)}% of days), paired ${main_.nPaired}`);
    console.log(`  MAIN   24h: setup ${main_.h24.setupMean} vs control ${main_.h24.controlMean} ATR  diff ${f(main_.h24.meanDiffAtr)} [${f(main_.h24.ci95[0])}, ${f(main_.h24.ci95[1])}] t=${main_.h24.t}  -> ${main_.h24.clear}      5d diff ${f(main_.h5.meanDiffAtr)} (n=${main_.h5.n})`);
    console.log(`  R1 (2021-09+)   24h diff ${f(r1.h24.meanDiffAtr)} [${f(r1.h24.ci95[0])}, ${f(r1.h24.ci95[1])}]  n=${r1.nPaired}      R2 (65/75)  24h diff ${f(r2.h24.meanDiffAtr)} [${f(r2.h24.ci95[0])}, ${f(r2.h24.ci95[1])}]  n=${r2.nPaired}`);
    console.log(`  exploratory direction: mean move AGAINST the crowd ${f(main_.exploratory_direction.meanAgainstCrowdAtr)} ATR over 24h (n=${main_.exploratory_direction.n}) -- not scored\n`);
  }
  const verdict = passes >= 3 ? 'PASS' : 'NULL';
  console.log(`VERDICT: ${verdict} — ${passes} of ${cells} instruments clear the bar.`);
  fs.writeFileSync(path.join(OUT_DIR, 'squeeze_vol_study.json'), JSON.stringify({ preregistered: { CROWD, PAIN, horizon: '24h', matching: 'vol quintile x momentum tercile, different week', passBar: '>=3 of 4 instruments, 24h paired diff CI clear of 0' }, verdict, passes, cells, results, generatedAt: new Date().toISOString() }, null, 1));
  console.log(`wrote ${OUT_DIR}/squeeze_vol_study.json`);
}
if (path.resolve(process.argv[1] ?? '') === __filename) main();
