// News at the vol lines (forge/NEWS_TOUCH_PREREG.md).
//   node scripts/rangebook/news_build.mjs [pair]
// For each pass: is it the first pass of its line within 120 min after a Major/Moderate release in the instrument's
// currencies? Surprise alignment (S, FX/gold) and the first 5-minute reaction alignment (R).
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { instrumentCurrencies } from '../../js/volForecast.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
const RAW = JSON.parse(fs.readFileSync('analysis/output/rangebook/news_releases.json', 'utf8'));
const IS_FX = /^[a-z]{6}$/.test(PAIR) || PAIR === 'gold';
const ccySign = c => !IS_FX ? null : PAIR === 'gold' ? (c === 'USD' ? -1 : null) : c === PAIR.slice(0, 3).toUpperCase() ? 1 : c === PAIR.slice(3).toUpperCase() ? -1 : null;
const REL = instrumentCurrencies(SYM).flatMap(c => (RAW[c] ?? []).map(([t, imp, z]) => ({ t, imp, z, c }))).sort((a, b) => a.t - b.t);
const RELT = REL.map(r => r.t), WIN = 7200;
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }

function pickRelease(t) {                     // most recent Major in (t − 120 min, t], else most recent Moderate
  const win = []; for (let i = lowerBound(RELT, t - WIN + 1); i < REL.length && REL[i].t <= t; i++) win.push(REL[i]);
  for (const imp of ['M', 'm']) {
    const c = win.filter(r => r.imp === imp); if (!c.length) continue;
    const tMax = Math.max(...c.map(r => r.t)), same = c.filter(r => r.t === tMax);
    same.sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0) || (a.c < b.c ? -1 : 1));
    return same[0];
  }
  return null;
}

function dayRows(S, ctx, di, want) {
  const d = ctx.days[di], out = [], unit = d.sigmaFrac * d.open;
  if (!(unit > 0)) return out;
  const all = passesOf(d);
  for (const p of all) {
    const key = `${d.date}|${p.line}|${p.pass}`; if (!want.has(key)) continue;
    const t = d.bars[p.k].time, rel = pickRelease(t);
    if (!rel) continue;
    // first pass of this line since the release (earlier passes of the same line at/after the release disqualify)
    if (all.some(q => q.line === p.line && q.k < p.k && d.bars[q.k].time >= rel.t)) continue;
    const sg = LINE_SIDE[p.line] === 'up' ? 1 : -1, cs = ccySign(rel.c);
    const row = { key, imp: rel.imp, mins: Math.round((t - rel.t) / 60), zAl: rel.z != null && cs != null ? r3(rel.z * cs * sg) : null, react: null };
    if (t >= rel.t + 300) {
      const a = lowerBound(S.times, rel.t), b = lowerBound(S.times, rel.t + 300) - 1;
      if (a < S.n && b >= a && S.times[a] < rel.t + 300) row.react = r3((S.closes[b] - S.opens[a]) / unit * sg);
    }
    out.push(row);
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`)), dates = new Set(seq.map(p => p.date));
const rows = [];
ctx.days.forEach((d, di) => { if (dates.has(d.date)) rows.push(...dayRows(S, ctx, di, want)); });
{
  const idx = new Map(Array.from(S.times, (x, i) => [x, i])), seqK = new Map(seq.map(p => [`${p.date}|${p.line}|${p.pass}`, p]));
  const cand = rows.filter(r => r.react != null), picks = cand.filter((_, i) => i % Math.max(1, Math.floor(cand.length / 5)) === 1).slice(0, 5);
  if (picks.length < 4) { console.error('self-check sampled too few'); process.exit(2); }
  for (const r of picks) {
    const p = seqK.get(r.key), q = scrambleFrom(S, idx.get(p.time) + 1, 107), c2 = buildContext(q, OPTS);
    const g = dayRows(q, c2, c2.dayIdx.get(p.date), new Set([r.key]))[0];
    if (!g || JSON.stringify(g) !== JSON.stringify(r)) { console.error(`LOOK-AHEAD ${r.key}\n ${JSON.stringify(r)}\n ${g && JSON.stringify(g)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} news rows identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_news.json`, JSON.stringify({ pair: SYM, rows }));
const c = (f) => rows.filter(f).length;
console.log(`${SYM}: ${rows.length} first-after-release touches (major ${c(r => r.imp === 'M')}, moderate ${c(r => r.imp === 'm')}); S scorable ${c(r => r.zAl != null)}, R scorable ${c(r => r.react != null)}`);
