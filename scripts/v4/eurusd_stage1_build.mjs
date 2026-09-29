// EURUSD Stage 1 dataset builder (forge/V4_EURUSD_STAGE1_PREREG.md).
// Every first touch of every export line, last 6 years, with context features
// computed ONLY from completed bars before the touch bar, and the Stage 0 outcome.
// Aborts if the future-scramble self-check finds any feature that changes when
// data from the touch bar onward is replaced.
//   node scripts/v4/eurusd_stage1_build.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { v4Days, firstTouches, nyCloseDailyBars, LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { createHtfContext, createConfluenceFeatures } from '../../js/confluenceFeatures.js';
import { sessionConfluenceLevels, DAILY_CONFLUENCE_SOURCES } from '../../js/rangeLineAnalyser.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { loadCalendarProxy } from './calendarProxy.mjs';

const PAIR = 'eurusd', SYM = 'EURUSD', PIP = 0.0001, M = 0.5;
const FROM = '2020-09-29', TO = '2026-09-28';
const cost = costForPair(PAIR, 'fx');
const tagFor = loadCalendarProxy()(SYM);

let full = await loadM1ForPair(PAIR);
{ // 7 years: 6 of touches + warm-up for sigma / SMA20 / HTF indicators
  const cut = Date.parse('2019-09-01T00:00:00Z') / 1000;
  let i = 0; while (i < full.n && full.times[i] < cut) i++;
  const s = k => Array.from(full[k].slice(i));
  full = { n: full.n - i, times: s('times'), opens: s('opens'), highs: s('highs'), lows: s('lows'), closes: s('closes'), volumes: s('volumes') };
}

// Everything that depends on price is built from `packed`, so the self-check can
// rebuild it from a scrambled copy.
function buildContext(packed) {
  const days = v4Days(packed, { instrument: SYM, assetClass: 'fx', eventTagFor: tagFor });
  const htf = createHtfContext(packed);
  const tf = createConfluenceFeatures({ htf });
  const ny = nyCloseDailyBars(packed).filter(b => b.n >= 60);
  return { days, htf, tf, ny, dayIdx: new Map(days.map((d, i) => [d.date, i])), wt: new Map(), conf: new Map() };
}

const b3 = (v, lo, hi, names) => v == null || !Number.isFinite(v) ? null : v < lo ? names[0] : v < hi ? names[1] : names[2];
const sessionOf = h => (h >= 22 || h < 7) ? 'Asia' : h < 13 ? 'London' : 'NY';

// Features for a touch of `line` at bar k of day `di`. Reads bars[0..k-1] only.
function featuresAt(ctx, di, k, line, level) {
  const d = ctx.days[di], bars = d.bars, side = LINE_SIDE[line], isUp = side === 'up';
  const past = bars.slice(0, k);                          // the only intraday bars allowed
  const f = {};
  const hr = new Date(bars[k].time * 1000).getUTCHours();   // the touch TIME is known at the touch
  f.session = sessionOf(hr); f.hour = String(hr).padStart(2, '0');
  const dt = new Date(d.date + 'T12:00:00Z');
  f.weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  f.month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  f.line = line; f.side = side; f.event = d.eventTag ?? 'unknown';

  // Day state from completed bars
  let hi = d.open, lo = d.open;
  for (const b of past) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  const used = (hi - lo) / d.open * 100 / d.ladder.hl.p50;
  f.rangeUsed = used < 0.5 ? '<0.5' : used < 0.8 ? '0.5-0.8' : used < 1.0 ? '0.8-1.0' : '>1.0';
  f.minsFromOpen = b3((bars[k].time - d.openSec) / 60, 480, 960, ['0-8h', '8-16h', '16h+']);
  const touchedBefore = ctx.touchedBefore.get(`${di}|${k}`) ?? [];
  const fam = line.replace(/(Up|Dn|H|L)?_p\d+$/, '').replace(/^O[HL]$/, 'OHOL');
  const opp = touchedBefore.some(x => LINE_SIDE[x] !== side && x.replace(/(Up|Dn|H|L)?_p\d+$/, '').replace(/^O[HL]$/, 'OHOL') === fam);
  f.oppSideTouched = opp ? 'yes' : 'no';
  f.linesBefore = touchedBefore.length === 0 ? '0' : touchedBefore.length <= 2 ? '1-2' : '3+';

  // Momentum into the line: 60-bar move in σ, oriented to the touch direction
  if (k >= 61) {
    const mv = (past[k - 1].close - past[k - 61].close) / d.open / d.sigmaFrac * (isUp ? 1 : -1);
    f.mom60 = mv < 0 ? '<0' : mv < 0.3 ? '0-0.3' : mv < 0.6 ? '0.3-0.6' : '>0.6';
  } else f.mom60 = null;

  // Prior NY day + 20-day SMA (bars that closed before today's open)
  const ny = ctx.ny.filter(b => b.endSec <= d.openSec);
  if (ny.length >= 21) {
    const y = ny.at(-1), r = (y.close - y.open) / y.open / d.sigmaFrac * (isUp ? 1 : -1);
    f.prevDay = r < -0.3 ? 'against' : r > 0.3 ? 'with' : 'flat';
    const sma = ny.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
    f.sma20 = ((y.close > sma) === isUp) ? 'with' : 'against';
  }

  // Existing bricks, evaluated at the LAST COMPLETED bar (k-1)
  if (k >= 1) {
    let wt1 = ctx.wt.get(di); if (!wt1) { wt1 = ctx.tf.wtSeries(bars); ctx.wt.set(di, wt1); }
    let conf = ctx.conf.get(di);
    if (conf === undefined) {
      const prior = ctx.days.slice(Math.max(0, di - 60), di).map(x => {
        let h = -Infinity, l = Infinity; for (const b of x.bars) { if (b.high > h) h = b.high; if (b.low < l) l = b.low; }
        return { date: x.date, open: x.bars[0].open, high: h, low: l, close: x.bars.at(-1).close };
      });
      const intraday = ctx.days.slice(Math.max(0, di - 5), di).flatMap(x => x.bars);
      conf = prior.length >= 5 ? sessionConfluenceLevels({ dailyBars: prior, intraday, pip: PIP, price: d.open, sources: DAILY_CONFLUENCE_SOURCES, fib15: false }) : null;
      ctx.conf.set(di, conf);
    }
    const out = ctx.tf.compute({ bars: past, touchIdx: k - 1, open: d.open, sigma: d.sigmaFrac, side: isUp ? 'up' : 'dn',
                                 wt1, level, pip: PIP, confLevels: conf });
    for (const key of ['approachER', 'approachVel', 'wtState', 'volClimax', 'roundNum', 'wtMtf', 'wtSlow', 'momAdx', 'htfTrend', 'vwapSide', 'confluence'])
      f[key] = out[key]?.bucket ?? null;
  }
  return f;
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

function touchesFor(ctx) {
  const out = [];
  ctx.touchedBefore = new Map();
  ctx.days.forEach((d, di) => {
    if (d.date < FROM || d.date > TO) return;
    const ts = firstTouches(d);
    for (const t of ts) ctx.touchedBefore.set(`${di}|${t.k}`, ts.filter(x => x.k < t.k).map(x => x.line));
    for (const t of ts) out.push({ di, ...t });
  });
  return out;
}

const ctx = buildContext(full);
const touches = touchesFor(ctx);
const rows = touches.map(t => {
  const d = ctx.days[t.di], b = M * d.sigmaFrac * d.open;
  const r = fadeR(d.bars, t.k, t.level, t.side === 'up', b);
  return { date: d.date, time: t.time, line: t.line, r, c: +(cost / (b / d.open * 100)).toFixed(4),
           f: featuresAt(ctx, t.di, t.k, t.line, t.level) };
});

// ── Self-check: features must not change when the touch bar and everything after
// it is replaced. Rebuilds v4 days + HTF context from the scrambled series.
{
  const idx = new Map(full.times.map((x, i) => [x, i]));
  const sample = touches.filter((_, i) => i % Math.floor(touches.length / 12) === 0).slice(0, 12);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (const t of sample) {
    const from = idx.get(t.time);
    const q = { n: full.n, times: full.times, opens: full.opens.slice(), highs: full.highs.slice(), lows: full.lows.slice(), closes: full.closes.slice(), volumes: full.volumes.slice() };
    let px = q.closes[from - 1];
    for (let i = from; i < q.n; i++) { const o = px; px *= 1 + (rnd() - 0.5) * 0.002; q.opens[i] = o; q.closes[i] = px; q.highs[i] = Math.max(o, px) * 1.0003; q.lows[i] = Math.min(o, px) * 0.9997; q.volumes[i] = 1 + Math.floor(rnd() * 500); }
    const c2 = buildContext(q);
    const di2 = c2.dayIdx.get(ctx.days[t.di].date);
    c2.touchedBefore = ctx.touchedBefore;   // derived from bars < k, already covered by the line tests
    const a = JSON.stringify(featuresAt(ctx, t.di, t.k, t.line, t.level)), b = JSON.stringify(featuresAt(c2, di2, t.k, t.line, t.level));
    if (a !== b) { console.error(`LOOK-AHEAD: features changed for ${t.line} ${ctx.days[t.di].date} k=${t.k}\n  ${a}\n  ${b}`); process.exit(2); }
  }
  console.log(`self-check: ${sample.length} touches, features identical under future-scramble`);
}

fs.mkdirSync('analysis/output/v4_stage1', { recursive: true });
fs.writeFileSync('analysis/output/v4_stage1/eurusd.json', JSON.stringify({ pair: SYM, m: M, cost, from: FROM, to: TO, rows }));
console.log(`${SYM}: ${rows.length} touches ${rows[0].date}→${rows.at(-1).date}`);
