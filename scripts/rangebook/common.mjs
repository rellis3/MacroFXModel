// Shared pieces for the range/touch book builders: day context and pre-day regime.
// Everything here reads only data completed before a day's London-midnight open.
import { fitHMM } from '../../hmm.js';
import { v4Days, nyCloseDailyBars, firstTouches, LINE_SIDE } from '../../js/voteAtlasV4Lines.js';

export function buildContext(packed, { sym, assetClass, tagFor }) {
  const days = v4Days(packed, { instrument: sym, assetClass, eventTagFor: tagFor });
  const ny = nyCloseDailyBars(packed).filter(b => b.n >= 60);
  return { days, ny, dayIdx: new Map(days.map((d, i) => [d.date, i])) };
}

// sigmaReg / hmm / yRange / event — buckets per forge/RANGE_BOOK_EURUSD_PREREG.md.
export function preDay(ctx, di) {
  const d = ctx.days[di];
  const prior = ctx.days.slice(Math.max(0, di - 20), di).map(x => x.ladder.sigma_daily_pct);
  let sigmaReg = null;
  if (prior.length >= 10) {
    const s = [...prior].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
    const r = d.ladder.sigma_daily_pct / med;
    sigmaReg = r < 0.85 ? 'quiet' : r > 1.15 ? 'heavy' : 'normal';
  }
  const closes = ctx.ny.filter(b => b.endSec <= d.openSec).slice(-200).map(b => b.close);
  let hmm = null;
  if (closes.length >= 100) {
    const rets = []; for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const h = fitHMM(rets);
    if (h) hmm = (h.regime === 'TREND' && h.trendDir && h.trendDirConfident) ? (h.trendDir === 'BULL' ? 'TREND_up' : 'TREND_dn') : 'RANGE';
  }
  let yRange = null;
  const y = ctx.days[di - 1];
  if (y && y.bars.length > 200) {
    let hi = -Infinity, lo = Infinity; for (const b of y.bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    const r = (hi - lo) / y.open * 100 / y.ladder.hl.p50;
    yRange = r < 0.8 ? 'small' : r > 1.2 ? 'big' : 'normal';
  }
  const ev = d.eventTag;
  const event = ['FOMC', 'NFP', 'CPI'].includes(ev) ? 'tier1' : ev === 'high' ? 'high' : 'none';
  return { sigmaReg, hmm, yRange, event };
}

// Replace everything from bar index `from` onward with a different random walk.
export function scrambleFrom(full, from, seed) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const q = { n: full.n, times: full.times, opens: Float64Array.from(full.opens), highs: Float64Array.from(full.highs),
              lows: Float64Array.from(full.lows), closes: Float64Array.from(full.closes), volumes: full.volumes };
  let px = q.closes[from - 1];
  for (let i = from; i < q.n; i++) { const o = px; px *= 1 + (rnd() - 0.5) * 0.002; q.opens[i] = o; q.closes[i] = px; q.highs[i] = Math.max(o, px) * 1.0003; q.lows[i] = Math.min(o, px) * 0.9997; }
  return q;
}

// ── Touch setup shared by the touch book (part 1) and entry timing (part 2) ──
// Continue / fade target levels for a touch, from the ladder and the running extremes
// BEFORE the touch bar (forge/TOUCH_BOOK_EURUSD_PREREG.md). null = line not raced.
export function targets(d, line, level, hiB, loB) {
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

const _r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

// Every raced first touch of a day with its situation (bars[0..k-1] + pre-day only).
// -> [{ d, t, up, k, tg, unit, dc, df, sameBar, sit, pre }]
export function touchSetups(ctx, di) {
  const d = ctx.days[di], bars = d.bars, unit = d.sigmaFrac * d.open;
  if (!(unit > 0) || !d.ladder.hl?.p50) return [];
  const pre = preDay(ctx, di);
  const touches = firstTouches(d);
  const out = [];
  for (const t of touches) {
    const up = t.side === 'up', k = t.k;
    let hi = d.open, lo = d.open;
    for (let j = 0; j < k; j++) { if (bars[j].high > hi) hi = bars[j].high; if (bars[j].low < lo) lo = bars[j].low; }
    const tg = targets(d, t.line, t.level, hi, lo);
    if (!tg) continue;
    const dc = Math.abs(tg.cont - t.level) / unit, df = Math.abs(t.level - tg.fade) / unit;
    if (!(dc > 0) || !(df > 0)) continue;
    const mom = k >= 61 ? (bars[k - 1].close - bars[k - 61].close) / unit * (up ? 1 : -1) : null;
    const contHit = up ? bars[k].high >= tg.cont : bars[k].low <= tg.cont;
    const fadeHit = up ? bars[k].low <= tg.fade : bars[k].high >= tg.fade;
    out.push({ d, t, up, k, tg, unit, dc, df, sameBar: contHit || fadeHit, pre,
      sit: { londonMin: Math.round((bars[k].time - d.openSec) / 60), used: _r4((hi - lo) / d.open * 100 / d.ladder.hl.p50),
             linesBefore: touches.filter(x => x.k < k).length, mom60: _r4(mom) } });
  }
  return out;
}
