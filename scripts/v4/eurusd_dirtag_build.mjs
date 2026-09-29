// today.html direction-tag replay, EURUSD (forge/V4_EURUSD_DIRTAG_PREREG.md).
// Reuses the production bricks: hmm.js fitHMM, js/travelRead.js, js/directionTag.js,
// and computeSessionMetrics' bias rule. Writes analysis/output/v4_dirtag/eurusd.json.
//   node scripts/v4/eurusd_dirtag_build.mjs
import fs from 'fs';
import { fitHMM } from '../../hmm.js';
import { travelRead } from '../../js/travelRead.js';
import { directionTag } from '../../js/directionTag.js';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { v4Days, firstTouches, nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { loadCalendarProxy } from './calendarProxy.mjs';

const SYM = 'EURUSD', FROM = '2020-09-29', TO = '2026-09-28', M = 0.5;
const cost = costForPair('eurusd', 'fx');
const tagFor = loadCalendarProxy()(SYM);

let full = await loadM1ForPair('eurusd');
{ // 200 daily closes of warm-up before the first day (~1 year) + margin
  const cut = Date.parse('2019-06-01T00:00:00Z') / 1000;
  let i = 0; while (i < full.n && full.times[i] < cut) i++;
  const s = k => Array.from(full[k].slice(i));
  full = { n: full.n - i, times: s('times'), opens: s('opens'), highs: s('highs'), lows: s('lows'), closes: s('closes'), volumes: s('volumes') };
}

// computeSessionMetrics' bias rule (js/volForecastScheduler.js:691-770), from the
// running O/H/L/C since London midnight, against the day's fitted ladder O-H/O-L p50.
function sessionRead(o, h, l, c, lad) {
  const r2 = x => Math.round(x * 100) / 100;
  const hl = r2((h - l) / o * 100), oc = r2((c - o) / o * 100);
  const oh = r2((h - o) / o * 100), ol = r2((o - l) / o * 100);
  const dir = r2(hl > 0 ? Math.abs(oc) / hl * 100 : 0);
  const ohR = r2(lad.oh.p50 > 0 ? oh / lad.oh.p50 * 100 : 0) / 100;
  const olR = r2(lad.ol.p50 > 0 ? ol / lad.ol.p50 * 100 : 0) / 100;
  let bias;
  if      (olR > 1.25 && ohR < 0.55) bias = 'downside leg dominating, upside contained';
  else if (ohR > 1.25 && olR < 0.55) bias = 'upside leg dominating, downside contained';
  else if (olR > 1.0  && ohR < 0.75) bias = 'downside extended';
  else if (ohR > 1.0  && olR < 0.75) bias = 'upside extended';
  else if (ohR > 0.8  && olR > 0.8 ) bias = 'both sides active';
  else                                bias = 'session developing';
  return { bias, dir, used: lad.hl.p50 > 0 ? hl / lad.hl.p50 : null };
}

function buildContext(packed) {
  const days = v4Days(packed, { instrument: SYM, assetClass: 'fx', eventTagFor: tagFor });
  const ny = nyCloseDailyBars(packed).filter(b => b.n >= 60);
  const regimeCache = new Map();
  // HMM + travel from the 200 most recent daily closes that had closed before the open.
  function structural(d) {
    if (regimeCache.has(d.date)) return regimeCache.get(d.date);
    const closes = ny.filter(b => b.endSec <= d.openSec).slice(-200).map(b => b.close);
    let out = null;
    if (closes.length >= 60) {
      const rets = []; for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
      const h = fitHMM(rets);
      out = { regime: h ? { label: h.regime, trendDir: h.trendDir, trendProb: Math.round(h.trendProb * 100),
                            rangeProb: Math.round(h.rangeProb * 100), trendConfident: h.trendDirConfident, reliable: h.reliable } : null,
              travel: travelRead(closes) };
    }
    regimeCache.set(d.date, out);
    return out;
  }
  // Tag using M1 bars [0, k) of the day.
  function tagAt(d, k) {
    const st = structural(d);
    if (!st) return null;
    let session = null, rangeUsed = null;
    if (k >= 1) {
      let h = -Infinity, l = Infinity;
      for (let j = 0; j < k; j++) { if (d.bars[j].high > h) h = d.bars[j].high; if (d.bars[j].low < l) l = d.bars[j].low; }
      const s = sessionRead(d.bars[0].open, h, l, d.bars[k - 1].close, d.ladder);
      session = { bias: s.bias, dir: s.dir }; rangeUsed = s.used;
    }
    const t = directionTag({ regime: st.regime, travel: st.travel, session, rangeUsed });
    return { direction: t.direction, strength: t.strength,
             drivers: Object.fromEntries(t.drivers.map(x => [x.key, x.dir])) };
  }
  return { days, tagAt, dayIdx: new Map(days.map((d, i) => [d.date, i])) };
}

function fadeR(bars, k, level, up, b) {
  const back = up ? level - b : level + b, beyond = up ? level + b : level - b;
  for (let j = k + 1; j < bars.length; j++) {
    const x = bars[j], hb = up ? x.low <= back : x.high >= back, hy = up ? x.high >= beyond : x.low <= beyond;
    if (hb && hy) return null;
    if (hb) return 1;
    if (hy) return -1;
  }
  const last = bars.at(-1).close;
  return Math.max(-1, Math.min(1, (up ? level - last : last - level) / b));
}
// The day's first bar is London midnight, so 08:00 London = open + 8h (off by an hour
// only on the two DST-change days a year).
const london8 = d => d.bars.findIndex(b => b.time >= d.openSec + 8 * 3600);

const ctx = buildContext(full);
console.log("context built");
const days = [], touches = [];
for (const d of ctx.days) {
  if (d.date < FROM || d.date > TO) continue;
  const k8 = london8(d);
  if (k8 > 0) {
    const t = ctx.tagAt(d, k8);
    if (t) days.push({ date: d.date, ...t, move: (d.bars.at(-1).close - d.bars[k8].open) / d.bars[k8].open * 100 });
  }
  for (const x of firstTouches(d)) {
    const b = M * d.sigmaFrac * d.open;
    const t = ctx.tagAt(d, x.k);
    touches.push({ date: d.date, line: x.line, side: x.side, r: fadeR(d.bars, x.k, x.level, x.side === 'up', b),
                   c: +(cost / (b / d.open * 100)).toFixed(4), tag: t });
  }
}

// Self-check: the tag at a touch must not change when that bar and everything after it is replaced.
{
  const idx = new Map(full.times.map((x, i) => [x, i]));
  let seed = 5; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sampleDays = ctx.days.filter(d => d.date >= FROM && d.date <= TO).filter((_, i) => i % 130 === 7).slice(0, 12);
  for (const d of sampleDays) {
    const k = Math.min(d.bars.length - 1, 600);
    const from = idx.get(d.bars[k].time);
    const q = { n: full.n, times: full.times, opens: full.opens.slice(), highs: full.highs.slice(), lows: full.lows.slice(), closes: full.closes.slice(), volumes: full.volumes };
    let px = q.closes[from - 1];
    for (let i = from; i < q.n; i++) { const o = px; px *= 1 + (rnd() - 0.5) * 0.002; q.opens[i] = o; q.closes[i] = px; q.highs[i] = Math.max(o, px) * 1.0003; q.lows[i] = Math.min(o, px) * 0.9997; }
    const c2 = buildContext(q);
    const d2 = c2.days[c2.dayIdx.get(d.date)];
    const a = JSON.stringify(ctx.tagAt(d, k)), b = JSON.stringify(c2.tagAt(d2, k));
    if (a !== b) { console.error(`LOOK-AHEAD in tag ${d.date} k=${k}\n ${a}\n ${b}`); process.exit(2); }
  }
  console.log(`self-check: ${sampleDays.length} days, tag identical under future-scramble`);
}

fs.mkdirSync('analysis/output/v4_dirtag', { recursive: true });
fs.writeFileSync('analysis/output/v4_dirtag/eurusd.json', JSON.stringify({ pair: SYM, m: M, cost, days, touches }));
console.log(`${SYM}: ${days.length} days, ${touches.length} touches`);
