// VIX vs index divergence for each NQ/SPX book pass (forge/VIX_DIVERGENCE_PREREG.md).
//   node scripts/rangebook/vix_div_build.mjs   -> analysis/output/rangebook/vix/<pair>_vixdiv.json
// For the last completed Yahoo VIX hour H before the touch: dV, dX (index over the same interval), β and residual SD from
// the previous 20 trading days' hours (H's own date excluded), z = (dV − β·dX) / SD, s = z × touch direction.
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';

const Y = JSON.parse(fs.readFileSync('analysis/output/rangebook/vix/VIX_1h.json', 'utf8')).chart.result[0];
const TS = Y.timestamp, CL = Y.indicators.quote[0].close;
const nyDate = s => new Date((s - 4 * 3600) * 1000).toISOString().slice(0, 10);   // trading date label (approx; only used to group days)
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

for (const pair of ['nq', 'spx']) {
  const S = await loadM1ForPair(pair);
  const closeBefore = x => { const i = lowerBound(S.times, x) - 1; return i >= 0 && x - S.times[i] <= 15 * 60 ? S.closes[i] : null; };
  // hourly pairs (consecutive VIX hours within a session)
  const H = [];
  for (let i = 1; i < TS.length; i++) {
    if (CL[i] == null || CL[i - 1] == null || TS[i] - TS[i - 1] > 3600 * 1.5) continue;
    const end = Math.min(TS[i] + 3600, TS[i + 1] ?? Infinity), endPrev = TS[i];          // bar i spans [TS[i], end)
    const x1 = closeBefore(end), x0 = closeBefore(endPrev);
    if (!x0 || !x1) continue;
    H.push({ end, date: nyDate(TS[i]), dV: Math.log(CL[i] / CL[i - 1]), dX: Math.log(x1 / x0) });
  }
  const ends = H.map(h => h.end), dates = [...new Set(H.map(h => h.date))];
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${pair}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar);
  const rows = [];
  for (const p of seq) {
    const i = lowerBound(ends, p.time + 1) - 1;                    // last hour ending at or before the touch bar's open
    if (i < 0 || p.time - H[i].end > 2 * 3600) continue;           // no VIX hour in the last 2h (overnight) -> no reading
    const h = H[i], di = dateIdx.get(h.date);
    if (di < 20) continue;
    const okDates = new Set(dates.slice(di - 20, di));
    const W = H.filter(x => okDates.has(x.date));
    if (W.length < 60) continue;
    const mx = W.reduce((a, x) => a + x.dX, 0) / W.length, mv = W.reduce((a, x) => a + x.dV, 0) / W.length;
    const sxx = W.reduce((a, x) => a + (x.dX - mx) ** 2, 0), sxy = W.reduce((a, x) => a + (x.dX - mx) * (x.dV - mv), 0);
    const beta = sxy / sxx, alpha = mv - beta * mx;
    const res = W.map(x => x.dV - alpha - beta * x.dX), sd = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / (res.length - 2));
    if (!(sd > 0)) continue;
    if (h.end > p.time) throw new Error('look-ahead: hour ends after the touch');
    const z = (h.dV - alpha - beta * h.dX) / sd, sg = LINE_SIDE[p.line] === 'up' ? 1 : -1;
    rows.push({ key: `${p.date}|${p.line}|${p.pass}`, z: Math.round(z * 1000) / 1000, s: Math.round(z * sg * 1000) / 1000, beta: Math.round(beta * 100) / 100, hourEnd: h.end });
  }
  fs.writeFileSync(`analysis/output/rangebook/vix/${pair}_vixdiv.json`, JSON.stringify({ pair, rows }));
  const b = rows.map(r => r.beta).sort((a, c) => a - c);
  console.log(`${pair.toUpperCase()}: ${H.length} VIX/index hours; ${rows.length} passes with a reading (median β ${b[b.length >> 1]}); against ${rows.filter(r => r.s >= 1).length}, with ${rows.filter(r => r.s <= -1).length}`);
}
