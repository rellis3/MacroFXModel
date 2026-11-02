// atlas-honest-gonogo — forge/ATLAS_HONEST_GONOGO_PREREG.md
//
// Do the Vote Atlas and Fib Atlas (Asia, Monday) fade/follow votes make money
// after real bid/ask fills, and do they beat the same trades with the decisions
// shuffled? One go/no-go per system.
//
//   python scripts/atlas-honest-gonogo/extract.py            (once: data/m1_bidask_bin_v)
//   node scripts/atlas-honest-gonogo/run.mjs --mode positive-control   (synthetic only)
//   node scripts/atlas-honest-gonogo/run.mjs --mode count     (n, SD, design effect: no means)
//   node scripts/atlas-honest-gonogo/run.mjs --mode score     (the registered run, once)
//
// Pipeline per instrument, mirroring the production routes (js/levelAtlasRoutes.js,
// js/asiaFibAtlasRoutes.js, js/mondayFibAtlasRoutes.js runOne): walk the mid M1 with
// the production engine, build the vote book from touches before the real 60/40 split
// only, take each touch on or after the split, and price BOTH a fade (resting limit)
// and a follow (stop entry) with js/bidAskFill.js on bid/ask, flat at the session
// close. The vote then picks one; the shuffled-decision placebo picks others.
import fs from 'node:fs';
import path from 'node:path';
import { atlasWalk } from '../../js/levelAtlasEngine.js';
import { asiaFibAtlasWalk } from '../../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../../js/mondayFibAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../../js/levelAtlasReport.js';
import { buildAsiaFibAtlasBook } from '../../js/asiaFibAtlasReport.js';
import { voteDecision as levelVote, priceBarrierTrade as levelMid } from '../../js/levelAtlasVoteReview.js';
import { voteDecision as fibVote, priceBarrierTrade as fibMid } from '../../js/asiaFibAtlasVoteReview.js';
import { priceBracketBidAsk } from '../../js/bidAskFill.js';
import { bisect } from '../../js/barUtils.js';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { holm, benjaminiHochberg, mdeMeanDiff } from '../../js/preregStats.js';
import { randomWalkPacked } from '../../js/atlasNullCheck.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'analysis', 'output', 'atlas-honest-gonogo');
const SEED = 20261101, B = 2000, BLOCK = 21, PASS_BAR = 0.05, REARM = 0.3, PERMS = 2000;

// Production universes and margins (server.js VOLATILITY_V2_DEFAULT_PAIRS, minMargin 3;
// FIB_ATLAS_DEFAULT_PAIRS, minMargin 2). Bid/ask file key differs only for de30 (dax).
const SYSTEMS = {
  vote: { margin: 3, pairs: ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'] },
  asia: { margin: 2, pairs: ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'] },
  monday: { margin: 2, pairs: ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'] },
};
const FILE_KEY = { de30: 'dax' };

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const MODE = args.mode ?? 'count';

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── data ─────────────────────────────────────────────────────────────────────
const COLS = ['open', 'high', 'low', 'close', 'volume', 'bid_o', 'bid_h', 'bid_l', 'bid_c', 'ask_o', 'ask_h', 'ask_l', 'ask_c'];
function loadBin(key) {
  const file = path.join(ROOT, 'data', 'm1_bidask_bin_v', `${key}.bin`);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const n = buf.readInt32LE(0);
  const times = new Int32Array(buf.buffer.slice(buf.byteOffset + 4, buf.byteOffset + 4 + 4 * n));
  const d = { times };
  let off = 4 + 4 * n;
  for (const c of COLS) { d[c] = new Float64Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + 8 * n)); off += 8 * n; }
  const packed = { n, times, opens: Float32Array.from(d.open), highs: Float32Array.from(d.high), lows: Float32Array.from(d.low), closes: Float32Array.from(d.close), volumes: Float32Array.from(d.volume) };
  return { packed, d };
}

// Synthetic stand-in (positive control only): random-walk mid with a fixed spread.
function synthetic(seed, halfSpread) {
  const packed = randomWalkPacked({ seed, years: 3 });
  const d = { times: packed.times };
  const src = { o: packed.opens, h: packed.highs, l: packed.lows, c: packed.closes };
  for (const s of ['o', 'h', 'l', 'c']) { d['bid_' + s] = Float64Array.from(src[s], x => x - halfSpread); d['ask_' + s] = Float64Array.from(src[s], x => x + halfSpread); }
  return { packed, d };
}

// Vote Atlas only: blank a session-volatility input whose session had not finished at
// the touch (prereg §3). Session windows as js/levelAtlasEngine.js SESSION_BOUNDS:
// key `${date}|Asia` is 22:00 UTC on date -> 07:00 next day, London 07-13, NY 13-22.
const SESSION_END_H = { Asia: 24 + 7, London: 13, NY: 22 };
const endOf = (date, sess) => Date.parse(date + 'T00:00:00Z') / 1000 + SESSION_END_H[sess] * 3600;
function causalVolFields(t) {
  const out = { ...t };
  if (t.asiaVol != null && !(t.time >= endOf(t.date, 'Asia'))) out.asiaVol = null;
  if (t.londonVol != null && !(t.time >= endOf(t.date, 'London'))) out.londonVol = null;
  if (t.prevSessionVol != null) {
    const prev = { London: ['Asia', -1], NY: ['London', 0], Asia: ['NY', 0] }[t.session];
    if (prev) {
      const dd = new Date(t.date + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + prev[1]);
      if (!(t.time >= endOf(dd.toISOString().slice(0, 10), prev[0]))) out.prevSessionVol = null;
    }
  }
  return out;
}

// ── one instrument → candidate rows ─────────────────────────────────────────
function candidates(sys, instrument, packed, d, { causal = true } = {}) {
  const assetClass = assetClassFor(instrument);
  const sym = instrument.toUpperCase();
  let touches;
  if (sys === 'vote') touches = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM }).touches;
  else if (sys === 'asia') touches = asiaFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM] }).touches;
  else touches = mondayFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM] }).touches;
  touches = touches.filter(t => t.rearmFrac === REARM);
  if (sys === 'vote' && causal) touches = touches.map(causalVolFields);
  if (touches.length < 100) return { rows: [], split: null };
  const { split } = splitAt(touches);
  const isOnly = touches.filter(t => t.date < split);
  const book = sys === 'vote' ? buildAtlasBook(isOnly, { rearmFrac: REARM }) : buildAsiaFibAtlasBook(isOnly, { rearmFrac: REARM });
  if (!book) return { rows: [], split };
  const vote = sys === 'vote' ? levelVote : fibVote, mid = sys === 'vote' ? levelMid : fibMid;
  const rows = [];
  for (const t of touches) {
    if (t.date < split || (sys === 'vote' && t.rung === 'p90')) continue;
    const level = sys === 'vote' ? t.level : t.price;
    const up = t.side === 'up' || t.side === 'above';
    const startIdx = bisect(d.times, t.time), endIdx = bisect(d.times, t.sessionCloseTime);
    if (startIdx >= d.times.length || d.times[startIdx] !== t.time || endIdx >= d.times.length) continue;
    const price = (decision) => {
      const target = decision === 'fade' ? t.innerDistPips : t.outerDistPips;
      const stop = decision === 'fade' ? t.outerDistPips : t.innerDistPips;
      if (!(target > 0) || !(stop > 0)) return null;
      const dir = (decision === 'follow') === up ? 1 : -1;
      const r = priceBracketBidAsk(d, { startIdx, endIdx, dir, entryType: decision === 'fade' ? 'limit' : 'stop', level, stopDist: stop * t.pip, targetDist: target * t.pip });
      const m = mid(t, decision, 0);
      return { filled: r.filled, r: r.filled ? r.r : null, spreadR: r.filled ? r.spreadAtFill / (stop * t.pip) : null, midR: m ? (m.pnlPips / stop) : null };
    };
    const vd = vote(book, t);
    rows.push({
      instrument, date: t.date, hourUtc: new Date(t.time * 1000).getUTCHours(), gapMin: t.gapMin ?? null,
      decision: vd?.decision ?? null, margin: vd?.margin ?? 0,
      fade: price('fade'), follow: price('follow'),
    });
  }
  return { rows, split };
}

// ── statistics ──────────────────────────────────────────────────────────────
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sdOf = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
// Session-date moving-block bootstrap of mean R: every trade on a resampled date comes along.
function blockBoot(trades, rnd, { b = B, block = BLOCK } = {}) {
  const dates = [...new Set(trades.map(t => t.date))].sort();
  const byDate = new Map(dates.map(dt => [dt, []]));
  for (const t of trades) byDate.get(t.date).push(t.r);
  const sums = dates.map(dt => byDate.get(dt).reduce((x, y) => x + y, 0)), cnts = dates.map(dt => byDate.get(dt).length);
  const D = dates.length, out = [];
  for (let k = 0; k < b; k++) {
    let s = 0, c = 0;
    while (c < trades.length && D > 0) {
      const st = Math.floor(rnd() * D);
      for (let j = 0; j < block && c < trades.length; j++) { const i = (st + j) % D; s += sums[i]; c += cnts[i]; }
    }
    out.push(s / c);
  }
  out.sort((x, y) => x - y);
  return out;
}
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
function summary(trades, rnd) {
  if (trades.length < 30) return { n: trades.length, meanR: trades.length ? mean(trades.map(t => t.r)) : null };
  const boot = blockBoot(trades, rnd);
  const m = mean(trades.map(t => t.r));
  return { n: trades.length, meanR: m, lo: q(boot, 0.025), hi: q(boot, 0.975), pOneSided: (boot.filter(x => x <= 0).length + 1) / (boot.length + 1), win: trades.filter(t => t.r > 0).length / trades.length };
}
const pick = (row, decision) => (row[decision]?.filled ? { date: row.date, instrument: row.instrument, r: row[decision].r, midR: row[decision].midR } : null);

// Decision placebo: shuffle the vote's decisions among the same traded touches,
// within instrument (each instrument keeps its own fade/follow mix).
function permutationNull(rows, rnd, perms = PERMS) {
  const byInst = new Map();
  for (const r of rows) (byInst.get(r.instrument) ?? byInst.set(r.instrument, []).get(r.instrument)).push(r);
  const out = [];
  for (let k = 0; k < perms; k++) {
    let s = 0, c = 0;
    for (const list of byInst.values()) {
      const decs = list.map(r => r.decision);
      for (let i = decs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [decs[i], decs[j]] = [decs[j], decs[i]]; }
      list.forEach((r, i) => { const p = r[decs[i]]; if (p?.filled) { s += p.r; c++; } });
    }
    out.push(c ? s / c : 0);
  }
  return out.sort((x, y) => x - y);
}

// ── modes ───────────────────────────────────────────────────────────────────
function loadSystemRows(sys, opts = {}) {
  const rows = [], missing = [], splits = {};
  for (const pair of SYSTEMS[sys].pairs) {
    const data = loadBin(FILE_KEY[pair] ?? pair);
    if (!data) { missing.push(pair); continue; }
    const { rows: rr, split } = candidates(sys, pair, data.packed, data.d, opts);
    splits[pair] = split; rows.push(...rr);
    console.error(`${sys} ${pair}: ${rr.length} OOS touches from ${split}`);
  }
  return { rows, missing, splits };
}

function countMode() {
  const rnd = mulberry32(SEED), out = {};
  for (const sys of Object.keys(SYSTEMS)) {
    const { rows, missing } = loadSystemRows(sys);
    const voted = rows.filter(r => r.decision && r.margin >= SYSTEMS[sys].margin);
    // Control sample for the SD and the design effect: every OOS touch priced both
    // ways, no vote. Only spreads (SD, SEs) are reported here, never a mean.
    const control = rows.flatMap(r => ['fade', 'follow'].map(dc => pick(r, dc)).filter(Boolean));
    const nTraded = voted.filter(r => r[r.decision]?.filled).length;
    const sd = control.length > 1 ? sdOf(control.map(t => t.r)) : null;
    const boot = control.length > 30 ? blockBoot(control, rnd, { b: 400 }) : null;
    const seBoot = boot ? sdOf(boot) : null, seNaive = sd / Math.sqrt(control.length);
    const deff = seBoot ? (seBoot / seNaive) ** 2 : null;
    const mde = nTraded > 1 && sd ? mdeMeanDiff({ sd, n1: nTraded, alpha: 0.05 / 3, twoSided: false, deff }) : null;
    out[sys] = { instruments: SYSTEMS[sys].pairs.length - missing.length, missing, oosTouches: rows.length, votedAtMargin: voted.length, tradedAtMargin: nTraded, sdControl: sd, deff, mde, passBar: PASS_BAR, powered: mde != null && mde <= PASS_BAR };
  }
  console.log(JSON.stringify(out, null, 2));
}

function scoreSystem(sys, rows, rnd) {
  const M = SYSTEMS[sys].margin;
  const voted = rows.filter(r => r.decision && r.margin >= M);
  const trades = voted.map(r => pick(r, r.decision)).filter(Boolean);
  const s = summary(trades, rnd);
  const dates = [...new Set(trades.map(t => t.date))].sort();
  const mid = dates[Math.floor(dates.length / 2)];
  const halves = [trades.filter(t => t.date < mid), trades.filter(t => t.date >= mid)].map(h => (h.length ? mean(h.map(t => t.r)) : null));
  const perm = permutationNull(voted, rnd);
  const pct = perm.filter(x => x < s.meanR).length / perm.length;
  const fadeAll = summary(voted.map(r => pick(r, 'fade')).filter(Boolean), rnd), followAll = summary(voted.map(r => pick(r, 'follow')).filter(Boolean), rnd);
  const fades = voted.filter(r => r.decision === 'fade');
  return {
    margin: M, ...s, halves, splitHalfDate: mid,
    permutation: { p95: q(perm, 0.95), median: q(perm, 0.5), realPercentile: pct },
    alwaysFade: fadeAll, alwaysFollow: followAll,
    midFillMeanR: trades.length ? mean(trades.filter(t => t.midR != null).map(t => t.midR)) : null,
    fadeFillRate: fades.length ? fades.filter(r => r.fade?.filled).length / fades.length : null,
    byDecision: Object.fromEntries(['fade', 'follow'].map(dc => [dc, summary(voted.filter(r => r.decision === dc).map(r => pick(r, dc)).filter(Boolean), rnd)])),
    byInstrument: Object.fromEntries([...new Set(voted.map(r => r.instrument))].map(i => [i, summary(trades.filter(t => t.instrument === i), rnd)])),
    byYear: Object.fromEntries([...new Set(trades.map(t => t.date.slice(0, 4)))].sort().map(y => [y, summary(trades.filter(t => t.date.startsWith(y)), rnd)])),
  };
}

function costMap(rows) {
  const cells = {};
  for (const r of rows) for (const dc of ['fade', 'follow']) {
    const p = r[dc]; if (!p?.filled || p.spreadR == null) continue;
    (cells[`${r.instrument}|${String(r.hourUtc).padStart(2, '0')}`] ??= []).push(p.spreadR);
  }
  return Object.fromEntries(Object.entries(cells).map(([k, v]) => { const s = [...v].sort((a, b) => a - b); return [k, { n: v.length, medianSpreadR: s[Math.floor(s.length / 2)] }]; }));
}

// Prereg §5-§6: MDE above the bar -> UNDERPOWERED by design (description only);
// otherwise VALIDATED on the full gate, NULL when the CI rules out the bar, else UNDERPOWERED.
function verdictFor(c, holmRejected, mde) {
  if (mde == null || !(mde <= PASS_BAR)) return 'UNDERPOWERED';
  const pass = holmRejected && c.permutation.realPercentile >= 0.95 && c.halves.every(h => h != null && h > 0);
  if (pass) return 'VALIDATED';
  if (c.hi != null && c.hi < PASS_BAR) return 'NULL';
  return 'UNDERPOWERED';
}

function scoreMode() {
  const rnd = mulberry32(SEED);
  const registered = JSON.parse(fs.readFileSync(path.join(OUT, 'count.json'), 'utf8'));
  const res = {}, extra = {};
  for (const sys of Object.keys(SYSTEMS)) {
    const { rows, missing, splits } = loadSystemRows(sys);
    res[sys] = { ...scoreSystem(sys, rows, rnd), missing, splits };
    extra[sys] = { costMap: costMap(rows) };
    if (sys !== 'vote') {
      const maxGap = sys === 'asia' ? 30 : 180;   // production gap filter only (FIB_ATLAS_MAX_GAP_MIN / _MONDAY_)
      res[sys].descriptiveGapFilter = summary(rows.filter(r => r.decision && r.margin >= SYSTEMS[sys].margin && (r.gapMin == null || r.gapMin <= maxGap)).map(r => pick(r, r.decision)).filter(Boolean), rnd);
    } else {
      const asIs = loadSystemRows('vote', { causal: false }).rows;   // engine as-is (session-vol inputs not blanked)
      res.vote.descriptiveEngineAsIs = scoreSystem('vote', asIs, rnd);
    }
  }
  const order = Object.keys(SYSTEMS);
  const h = holm(order.map(s => res[s].pOneSided ?? 1), 0.05);
  order.forEach((s, i) => { res[s].holmAdjustedP = h.adjusted[i]; res[s].verdict = verdictFor(res[s], h.rejected[i], registered[s]?.mde); });
  // Disaggregation (descriptive): per instrument, BH q = 0.10 within each system.
  for (const s of order) {
    const ents = Object.entries(res[s].byInstrument).filter(([, v]) => v.pOneSided != null);
    const bh = benjaminiHochberg(ents.map(([, v]) => v.pOneSided), 0.10);
    res[s].instrumentsSurvivingBH = ents.filter((_, i) => bh.rejected[i] && ents[i][1].meanR > 0).map(([k]) => k);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ id: 'atlas-honest-gonogo', seed: SEED, B, block: BLOCK, passBar: PASS_BAR, results: res }, null, 1));
  fs.writeFileSync(path.join(OUT, 'cost_map.json'), JSON.stringify(extra, null, 1));
  for (const s of order) console.log(s, res[s].verdict, JSON.stringify({ n: res[s].n, meanR: res[s].meanR, lo: res[s].lo, hi: res[s].hi, perm: res[s].permutation, halves: res[s].halves }));
}

// Positive control (synthetic data only, before registration): does the scoring
// machinery find a planted decision edge, and stay quiet without one?
function positiveControl() {
  const rnd = mulberry32(SEED);
  const rows = [];
  for (const seed of [1, 2, 3, 4]) {
    const { packed, d } = synthetic(seed, 0.00005);
    rows.push(...candidates('asia', 'eurusd', packed, d).rows.map(r => ({ ...r, instrument: 'eurusd' + seed })));
  }
  const both = rows.filter(r => r.fade?.filled && r.follow?.filled);
  const report = {};
  for (const qp of [0.5, 0.55, 0.6]) {
    // Planted: pick the better of the two priced decisions with probability qp.
    const planted = both.map(r => { const better = r.fade.r >= r.follow.r ? 'fade' : 'follow', worse = better === 'fade' ? 'follow' : 'fade'; return { ...r, decision: rnd() < qp ? better : worse, margin: 9 }; });
    const trades = planted.map(r => pick(r, r.decision)).filter(Boolean);
    const s = summary(trades, rnd);
    const perm = permutationNull(planted, rnd, 500);
    report[`oracle_${qp}`] = { n: s.n, meanR: s.meanR, lo: s.lo, hi: s.hi, permP95: q(perm, 0.95), realPercentile: perm.filter(x => x < s.meanR).length / perm.length };
  }
  console.log(JSON.stringify({ candidates: rows.length, bothFilled: both.length, control: report }, null, 2));
}

if (MODE === 'positive-control') positiveControl();
else if (MODE === 'count') { const out = path.join(OUT, 'count.json'); fs.mkdirSync(OUT, { recursive: true }); const orig = console.log; let buf = ''; console.log = s => { buf += s; orig(s); }; countMode(); fs.writeFileSync(out, buf); }
else if (MODE === 'score') scoreMode();
else throw new Error(`unknown --mode ${MODE}`);
