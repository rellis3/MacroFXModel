// EURUSD Sequence Book builder (forge/SEQUENCE_BOOK_EURUSD_PREREG.md).
// Every pass at every export line (re-arm after a close 0.1σ back inside), with the
// pullback before it, the previous overshoot, its race outcome, and the path state at
// the 07/10/13/16 London checkpoints.
//   node scripts/rangebook/seq_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { linesAtBar, LINE_SIDE, ALL_LINES } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, preDay, scrambleFrom, targets, race } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const REARM = 0.1, CHECKPOINTS = [7, 10, 13, 16];
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;
const session = m => m < 420 ? 'Asia' : m < 780 ? 'London' : m < 1020 ? 'NY' : 'Late';

// Every pass of every line in a day (bars[0..k-1] price the lines, as firstTouches does).
function passesOf(d) {
  const bars = d.bars, unit = d.sigmaFrac * d.open;
  const st = Object.fromEntries(ALL_LINES.map(n => [n, { armed: true, n: 0, lastK: null, pull: 0, over: 0, prevOver: null }]));
  const out = [];
  let runHi = d.open, runLo = d.open;
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k], lv = linesAtBar(d, k, runHi, runLo);
    for (const name of ALL_LINES) {
      const L = lv[name]; if (L == null) continue;
      const up = LINE_SIDE[name] === 'up', s = st[name];
      if (s.armed) {
        if (up ? b.high >= L : b.low <= L) {
          s.n++; s.armed = false;
          out.push({ line: name, pass: s.n, k, level: L, hiB: runHi, loB: runLo,
                     pullback: s.n === 1 ? null : s.pull / unit, prevOver: s.n === 1 ? null : s.over / unit });
          s.pull = 0; s.over = 0;
        } else if (s.n > 0) s.pull = Math.max(s.pull, up ? L - b.low : b.high - L);
      } else {
        s.over = Math.max(s.over, up ? b.high - L : L - b.low);
        s.pull = Math.max(s.pull, up ? L - b.low : b.high - L);
        if (up ? b.close <= L - REARM * unit : b.close >= L + REARM * unit) s.armed = true;
      }
    }
    if (b.high > runHi) runHi = b.high;
    if (b.low < runLo) runLo = b.low;
  }
  return out;
}

function dayRows(ctx, di) {
  const d = ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open;
  if (!(unit > 0) || !d.ladder.hl?.p50) return { passes: [], checkpoints: [] };
  const pre = preDay(ctx, di);
  const all = passesOf(d);
  const firstK = {};
  for (const p of all) if (p.pass === 1) firstK[p.line] = p.k;
  const passes = [];
  for (const p of all) {
    const up = LINE_SIDE[p.line] === 'up';
    const tg = targets(d, p.line, p.level, p.hiB, p.loB);
    if (!tg) continue;
    const dc = Math.abs(tg.cont - p.level) / unit, df = Math.abs(p.level - tg.fade) / unit;
    if (!(dc > 0) || !(df > 0)) continue;
    const b = bars[p.k];
    const sameBar = (up ? b.high >= tg.cont : b.low <= tg.cont) || (up ? b.low <= tg.fade : b.high >= tg.fade);
    const rc = race(bars, p.k, up, p.level, tg);
    const mom = p.k >= 61 ? (bars[p.k - 1].close - bars[p.k - 61].close) / unit * (up ? 1 : -1) : null;
    const londonMin = Math.round((b.time - d.openSec) / 60);
    passes.push({ date: d.date, line: p.line, pass: p.pass, k: p.k, time: b.time, londonMin, session: session(londonMin),
      sameBar: sameBar ? 1 : 0, pullback: r4(p.pullback), prevOver: r4(p.prevOver), dc: r4(dc), df: r4(df),
      used: r4((p.hiB - p.loB) / d.open * 100 / d.ladder.hl.p50),
      linesBefore: Object.values(firstK).filter(k => k < p.k).length, mom60: r4(mom),
      outcome: rc.outcome, beyondBefore: r4(rc.mb / unit), backBefore: r4(rc.mk / unit),
      lastMove: r4(rc.lastMove / unit), costSig: r4(COST / 100 * d.open / unit), ...pre });
  }
  // Path state at each checkpoint, per side, from passes strictly before the checkpoint bar.
  const RANK = { none: 0, p50: 1, p75: 2, p90: 3 };
  const checkpoints = [];
  for (const h of CHECKPOINTS) {
    const kc = bars.findIndex(x => x.time >= d.openSec + h * 3600);
    if (kc < 1) continue;
    const side = {};
    for (const [s, prefix] of [['up', 'OH_'], ['dn', 'OL_']]) {
      const before = all.filter(p => p.k < kc && p.line.startsWith(prefix));
      let top = 'none';
      for (const p of before) { const r = p.line.split('_')[1]; if (RANK[r] > RANK[top]) top = r; }
      const f50 = before.find(p => p.line === prefix + 'p50');
      side[s] = { top, when: f50 ? session(Math.round((bars[f50.k].time - d.openSec) / 60)) : 'notYet',
                  passes: top === 'none' ? 0 : before.filter(p => p.line === prefix + top).length };
    }
    checkpoints.push({ date: d.date, h, ...side });
  }
  return { passes, checkpoints };
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const built = ctx.days.map((_, di) => dayRows(ctx, di));
const passes = built.flatMap(x => x.passes), checkpoints = built.flatMap(x => x.checkpoints);

// ── Check 1: pass 1 reproduces the touch book's first touches exactly ──
{
  const tb = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_touches.json`, 'utf8')).rows;
  const key = r => `${r.date}|${r.line}|${r.k}|${r.dc}|${r.df}|${r.outcome}`;
  const a = new Set(tb.map(key)), b = new Set(passes.filter(p => p.pass === 1).map(key));
  const missing = [...a].filter(x => !b.has(x)).length, extra = [...b].filter(x => !a.has(x)).length;
  if (missing || extra) { console.error(`pass-1 mismatch vs touch book: ${missing} missing, ${extra} extra`); process.exit(3); }
  console.log(`check: pass 1 == touch book first touches (${a.size} rows)`);
}

// ── Check 2: future-scramble on later passes and on checkpoint path state ──
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  const keepP = p => JSON.stringify([p.line, p.pass, p.k, p.pullback, p.prevOver, p.dc, p.df, p.used, p.linesBefore, p.mom60, p.sigmaReg, p.hmm, p.yRange, p.event]);
  const later = passes.filter(p => p.pass >= 2);
  const picks = later.filter((_, i) => i % Math.floor(later.length / 6) === 1).slice(0, 6);
  for (const p of picks) {
    const c2 = buildContext(scrambleFrom(full, idx.get(p.time) + 1, 41), OPTS);
    const again = dayRows(c2, c2.dayIdx.get(p.date)).passes.find(x => x.line === p.line && x.pass === p.pass);
    if (!again || keepP(again) !== keepP(p)) { console.error(`LOOK-AHEAD pass ${p.date} ${p.line} #${p.pass}\n ${keepP(p)}\n ${again && keepP(again)}`); process.exit(2); }
  }
  const at10 = checkpoints.filter(c => c.h === 10);
  const cps = at10.filter((_, i) => i % Math.floor(at10.length / 5) === 3).slice(0, 5);
  if (picks.length < 4 || cps.length < 4) { console.error(`self-check sampled too few rows (${picks.length} passes, ${cps.length} checkpoints)`); process.exit(2); }
  for (const c of cps) {
    const d = ctx.days[ctx.dayIdx.get(c.date)];
    const kc = d.bars.findIndex(x => x.time >= d.openSec + 10 * 3600);
    const c2 = buildContext(scrambleFrom(full, idx.get(d.bars[kc].time), 43), OPTS);
    const again = dayRows(c2, c2.dayIdx.get(c.date)).checkpoints.find(x => x.h === 10);
    if (JSON.stringify(again) !== JSON.stringify(c)) { console.error(`LOOK-AHEAD checkpoint ${c.date}\n ${JSON.stringify(c)}\n ${JSON.stringify(again)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} later passes + ${cps.length} checkpoints identical under future-scramble`);
}

fs.writeFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, JSON.stringify({ pair: SYM, cost: COST, passes, checkpoints }));
const byPass = passes.reduce((a, p) => (a[Math.min(p.pass, 3)] = (a[Math.min(p.pass, 3)] ?? 0) + 1, a), {});
console.log(`${SYM}: ${passes.length} passes ${JSON.stringify(byPass)} (3 = 3+), ${checkpoints.length} checkpoint rows`);
