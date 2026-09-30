// EURUSD Touch Book builder (forge/TOUCH_BOOK_EURUSD_PREREG.md).
// Every first touch of every export line: the continue-vs-fade race against its
// neighbouring lines, the excursions on the way, and the situation at the touch.
//   node scripts/rangebook/touch_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { firstTouches, LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { pipSize } from '../../js/instrumentRegistry.js';
import { buildContext, preDay, scrambleFrom } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const ASSET = assetClassFor(PAIR), COST = costForPair(PAIR, ASSET), PIP = pipSize(SYM);
const tagFor = loadCalendarProxy()(SYM);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor };
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

// Continue / fade target levels for a touch, from the ladder and the running extremes
// BEFORE the touch bar. Returns null for lines this book does not race.
function targets(d, line, level, hiB, loB) {
  const up = LINE_SIDE[line] === 'up', sg = up ? 1 : -1, open = d.open, L = d.ladder;
  const at = pct => open * (1 + sg * pct / 100);
  const [fam, rung] = line.split('_');
  if (fam === 'OH' || fam === 'OL') {
    const q = up ? L.oh : L.ol;
    if (rung === 'p50') return { cont: at(q.p75), fade: open };
    if (rung === 'p75') return { cont: at(q.p90), fade: at(q.p50) };
    if (rung === 'p90') return { cont: at(q.p90 + (q.p90 - q.p75)), fade: at(q.p75) };
  }
  if (fam === 'CloseUp' || fam === 'CloseDn') {
    const q = L.oc;
    if (rung === 'p50') return { cont: at(q.p75), fade: open };
    if (rung === 'p75') return { cont: at(q.p75 + (q.p75 - q.p50)), fade: at(q.p50) };
  }
  if (fam === 'ProjH' || fam === 'ProjL') {
    const anchor = up ? loB : hiB, proj = pct => up ? anchor * (1 + pct / 100) : anchor * (1 - pct / 100);
    if (rung === 'p50') return { cont: proj(L.hl.p75), fade: (level + anchor) / 2 };
    if (rung === 'p75') return { cont: proj(L.hl.p90), fade: proj(L.hl.p50) };
  }
  return null;
}

// Situation at the touch, from bars[0..k-1] and pre-day data only.
function situation(d, k, up, preceding) {
  const past = d.bars.slice(0, k);
  let hi = d.open, lo = d.open;
  for (const b of past) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  const unit = d.sigmaFrac * d.open;
  const mom = k >= 61 ? (past[k - 1].close - past[k - 61].close) / unit * (up ? 1 : -1) : null;
  return { londonMin: Math.round((d.bars[k].time - d.openSec) / 60), used: r4((hi - lo) / d.open * 100 / d.ladder.hl.p50),
           linesBefore: preceding, mom60: r4(mom), hiB: hi, loB: lo };
}

function touchRows(ctx, di) {
  const d = ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open;
  if (!(unit > 0) || !d.ladder.hl?.p50) return [];
  const pre = preDay(ctx, di);
  const touches = firstTouches(d);
  const rows = [];
  for (const t of touches) {
    const up = t.side === 'up', k = t.k;
    const sit = situation(d, k, up, touches.filter(x => x.k < k).length);
    const tg = targets(d, t.line, t.level, sit.hiB, sit.loB);
    if (!tg) continue;
    const dc = Math.abs(tg.cont - t.level) / unit, df = Math.abs(t.level - tg.fade) / unit;
    if (!(dc > 0) || !(df > 0)) continue;
    const beyond = b => up ? b.high - t.level : t.level - b.low;       // + = in the continue direction
    const back = b => up ? t.level - b.low : b.high - t.level;         // + = toward the fade side
    const contHit = b => up ? b.high >= tg.cont : b.low <= tg.cont;
    const fadeHit = b => up ? b.low <= tg.fade : b.high >= tg.fade;
    const sameBar = contHit(bars[k]) || fadeHit(bars[k]);
    let outcome = 'open', resolveK = null, mb = 0, mk = 0, dayB = 0, dayK = 0;
    for (let j = k + 1; j < bars.length; j++) {
      const b = bars[j];
      dayB = Math.max(dayB, beyond(b)); dayK = Math.max(dayK, back(b));
      if (outcome === 'open') {
        mb = Math.max(mb, beyond(b)); mk = Math.max(mk, back(b));
        const c = contHit(b), f = fadeHit(b);
        if (c || f) { outcome = c && f ? 'both' : c ? 'cont' : 'fade'; resolveK = j; }
      }
    }
    const lastMove = (up ? bars.at(-1).close - t.level : t.level - bars.at(-1).close) / unit;   // + = continue side
    rows.push({
      date: d.date, line: t.line, k, time: t.time, sameBar: sameBar ? 1 : 0,
      dc: r4(dc), df: r4(df), outcome, mins: resolveK == null ? null : Math.round((bars[resolveK].time - t.time) / 60),
      beyondBefore: r4(mb / unit), backBefore: r4(mk / unit), dayBeyond: r4(dayB / unit), dayBack: r4(dayK / unit),
      lastMove: r4(lastMove), costSig: r4(COST / 100 * d.open / unit), pipsPerSig: r4(unit / PIP),
      londonMin: sit.londonMin, used: sit.used, linesBefore: sit.linesBefore, mom60: sit.mom60, ...pre,
    });
  }
  return rows;
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const rows = ctx.days.flatMap((_, di) => touchRows(ctx, di));

// ── Self-check: replace everything AFTER the touch bar; the touch, its situation and
// its targets must not change (only the outcome/excursions may).
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  const keep = r => JSON.stringify({ line: r.line, k: r.k, dc: r.dc, df: r.df, sameBar: r.sameBar, londonMin: r.londonMin, used: r.used,
    linesBefore: r.linesBefore, mom60: r.mom60, sigmaReg: r.sigmaReg, hmm: r.hmm, yRange: r.yRange, event: r.event });
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 8) === 3).slice(0, 8);
  for (const r of picks) {
    const c2 = buildContext(scrambleFrom(full, idx.get(r.time) + 1, 17), OPTS);
    const again = touchRows(c2, c2.dayIdx.get(r.date)).find(x => x.line === r.line);
    if (!again || keep(again) !== keep(r)) { console.error(`LOOK-AHEAD ${r.date} ${r.line}\n ${keep(r)}\n ${again && keep(again)}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} touches identical under future-scramble`);
}

fs.mkdirSync('analysis/output/rangebook', { recursive: true });
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_touches.json`, JSON.stringify({ pair: SYM, cost: COST, rows }));
const oc = rows.reduce((a, r) => (a[r.outcome] = (a[r.outcome] ?? 0) + 1, a), {});
console.log(`${SYM}: ${rows.length} touches (${rows.filter(r => r.sameBar).length} same-bar) ${rows[0].date} -> ${rows.at(-1).date}; outcomes ${JSON.stringify(oc)}`);
