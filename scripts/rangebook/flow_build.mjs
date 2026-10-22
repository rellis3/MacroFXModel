// Flow columns per pass (forge/FLOW_COLUMNS_PREREG.md): dealer GEX, expiry-pin distance (real + placebo),
// catalyst window + aligned surprise, fix window / month-end, intraday HMM quiet probability.
//   node scripts/rangebook/flow_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { instrumentCurrencies } from '../../js/volForecast.js';
import { fitHMM } from '../../hmm.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
const FLOW = JSON.parse(fs.readFileSync('analysis/output/rangebook/flow_daily.json', 'utf8'));
const GEX = FLOW.gex[PAIR] ?? {}, EXP = FLOW.expiry[PAIR] ?? {};
const CCY = instrumentCurrencies(SYM);
const IS_FX = /^[a-z]{6}$/.test(PAIR) || PAIR === 'gold';
// +1 if a positive surprise in that currency pushes the instrument up (base), −1 if down (quote); indices: none.
const ccySign = c => !IS_FX ? null : PAIR === 'gold' ? (c === 'USD' ? -1 : null) : c === PAIR.slice(0, 3).toUpperCase() ? 1 : c === PAIR.slice(3).toUpperCase() ? -1 : null;
const REL = CCY.flatMap(c => (FLOW.releases[c] ?? []).map(([t, ev, z]) => ({ t, ev, z, c }))).sort((a, b) => a.t - b.t);
const RELT = REL.map(r => r.t);
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }
function hashU(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1e6) / 1e6; }
const lastBizOfMonth = date => { const d = new Date(date + 'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); return d.toISOString().slice(5, 7) !== date.slice(5, 7); };

function makeEnv(S) {
  const ctx = buildContext(S, OPTS), s5 = [], c5 = [];
  for (let i = 0; i < S.n; i++) { const s = Math.floor(S.times[i] / 300) * 300; if (s5.at(-1) !== s) { s5.push(s); c5.push(S.closes[i]); } else c5[c5.length - 1] = S.closes[i]; }
  return { S, ctx, s5, c5 };
}

function passRow(env, di, p) {
  const d = env.ctx.days[di], unit = d.sigmaFrac * d.open, up = LINE_SIDE[p.line] === 'up', sg = up ? 1 : -1;
  const t = d.bars[p.k].time, londonMin = Math.round((t - d.openSec) / 60), out = {};
  const g = GEX[d.date]; out.gex = g ? r3(Math.sign(g[0])) : null; out.gexRel = g ? r3(g[1]) : null;
  // Expiry pin: strikes of series expiring today, only before their expiry time.
  const ex = (EXP[d.date] ?? []).filter(e => e.t > t);
  if (ex.length) {
    const ks = ex.flatMap(e => e.strikes), shift = (hashU(d.date + '|pin') < 0.5 ? -1 : 1) * (0.15 + 0.35 * hashU('pin|' + d.date)) * unit;
    out.pin = r3(Math.min(...ks.map(k => Math.abs(k - p.level) / unit))); out.pinP = r3(Math.min(...ks.map(k => Math.abs(k + shift - p.level) / unit)));
  } else { out.pin = null; out.pinP = null; }
  // Catalyst: Major releases in the instrument's currencies in (t − 60 min, t].
  let best = null;
  for (let i = lowerBound(RELT, t - 3600 + 1); i < REL.length && REL[i].t <= t; i++) {
    const r = REL[i]; if (!best || Math.abs(r.z ?? 0) > Math.abs(best.z ?? 0)) best = r;
  }
  out.cat = best ? 1 : 0;
  out.catZ = best && best.z != null && ccySign(best.c) != null ? r3(best.z * ccySign(best.c) * sg) : null;
  out.fix = londonMin >= 945 && londonMin < 975 ? 1 : 0; out.monthEnd = lastBizOfMonth(d.date) ? 1 : 0;
  // Intraday HMM on the 144 completed M5 returns before the touch.
  const j = lowerBound(env.s5, t - 300 + 1) - 1;
  out.hmmQuiet = null;
  if (j >= 145) {
    const rets = []; for (let q = j - 143; q <= j; q++) rets.push(Math.log(env.c5[q] / env.c5[q - 1]));
    const h = fitHMM(rets); if (h && Number.isFinite(h.rangeProb)) out.hmmQuiet = r3(h.rangeProb);
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const env = makeEnv(S);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
function dayRows(e, di, w) {
  const d = e.ctx.days[di], out = [];
  if (!(d.sigmaFrac * d.open > 0)) return out;
  for (const p of passesOf(d)) { const key = `${d.date}|${p.line}|${p.pass}`; if (w.has(key)) out.push({ key, r: passRow(e, di, p) }); }
  return out;
}
const byKey = new Map();
env.ctx.days.forEach((d, di) => { if (dates.has(d.date)) for (const x of dayRows(env, di, want)) byKey.set(x.key, x.r); });
const rows = seq.map(p => { const k = `${p.date}|${p.line}|${p.pass}`; return byKey.has(k) ? { key: k, ...byKey.get(k) } : null; }).filter(Boolean);
if (rows.length < 0.98 * seq.length) { console.error(`only ${rows.length}/${seq.length}`); process.exit(3); }
{
  const idx = new Map(Array.from(S.times, (x, i) => [x, i]));
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 5) === 6).slice(0, 5);
  for (const p of picks) {
    const key = `${p.date}|${p.line}|${p.pass}`;
    const e2 = makeEnv(scrambleFrom(S, idx.get(p.time) + 1, 103));
    const g = dayRows(e2, e2.ctx.dayIdx.get(p.date), new Set([key]))[0];
    if (!g || JSON.stringify(g.r) !== JSON.stringify(byKey.get(key))) { console.error(`LOOK-AHEAD ${key}\n ${JSON.stringify(byKey.get(key))}\n ${g && JSON.stringify(g.r)}`); process.exit(2); }
  }
  if (picks.length < 4) { console.error('self-check sampled too few'); process.exit(2); }
  console.log(`self-check: ${picks.length} passes' flow columns identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_flow.json`, JSON.stringify({ pair: SYM, rows }));
const share = k => (rows.filter(r => r[k] != null && r[k] !== 0).length / rows.length * 100).toFixed(1) + '%';
console.log(`${SYM}: ${rows.length} passes; gex ${share('gex')} cat ${share('cat')} catZ ${share('catZ')} fix ${share('fix')} pin ${share('pin')} hmm ${share('hmmQuiet')}`);
