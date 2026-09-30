// Shared pieces for the range/touch book builders: day context and pre-day regime.
// Everything here reads only data completed before a day's London-midnight open.
import { fitHMM } from '../../hmm.js';
import { v4Days, nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';

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
