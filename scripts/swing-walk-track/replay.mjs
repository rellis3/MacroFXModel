// swing-walk-track, step 2: replay the live Swing Map zone walk on every past night (forge/SWING_WALK_TRACK_PREREG.md §3).
//
// For each instrument exported by export_books.py, every expiry's nightly books are folded with the live
// mergeExpirySnapshot (stale marking) and read with the live expiryView (withLadder) on the series cut at night D, then
// the live zoneWalk runs from the first close after D (OI(D) is public mid D+1) for each anchor, with and without the
// small books. One row per walk step. The expiry-date close is joined here so score.py has one table; this script
// computes no score.
//
//   node scripts/swing-walk-track/replay.mjs            -> analysis/output/swing-walk-track/_books/steps.csv
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeExpirySnapshot, expiryView } from '../../js/expiryTracker.js';
import { zoneWalk } from '../../js/swingPaths.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'analysis', 'output', 'swing-walk-track', '_books');
const ANCHORS = ['gammaCentre', 'gamma', 'strike', 'maxPain', 'centre'];
const DAY = 864e5;
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

const keys = (process.argv[2] ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => /^[A-Z0-9]+\.json$/.test(f)).map(f => f.replace('.json', '')));
const out = fs.createWriteStream(path.join(DIR, process.argv[2] ? `steps_${keys.join('_')}.csv` : 'steps.csv'));
out.write('inst,night,origin,anchor,thin_walk,expiry,dte,h,s0,sigma,ret20,target,sE,step_thin,pull_share\n');

for (const key of keys) {
  const t0 = Date.now();
  const J = JSON.parse(fs.readFileSync(path.join(DIR, `${key}.json`), 'utf8'));
  const P = J.prices;                                    // [date, close, sigma, ret20], sorted
  const pIdx = new Map(P.map((r, i) => [r[0], i]));
  const pDates = P.map(r => r[0]);
  const nextIdx = d => { let lo = 0, hi = pDates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pDates[m] <= d) lo = m + 1; else hi = m; } return lo; };   // first price date > d
  const closeOnOrBefore = d => { const i = nextIdx(d) - 1; return i >= 0 ? P[i][1] : null; };

  // fold each expiry's nights with the live merge (stale = byte-identical to the previous night's ladder)
  const series = new Map();
  const nightsOf = new Map();                            // night -> [expiry]
  for (const [expiry, nights] of Object.entries(J.books)) {
    let s = null;
    for (const [date, F, rows] of nights) {
      const spot = closeOnOrBefore(date);
      const snap = { date, dte: dayDiff(expiry, date), futures: F, spot, basis: spot != null ? F - spot : null, ladder: rows };
      s = mergeExpirySnapshot(s, { pair: key, expiry, code: null, inverted: false }, snap).series;
      if (!nightsOf.has(date)) nightsOf.set(date, []);
      nightsOf.get(date).push(expiry);
    }
    series.set(expiry, s);
  }

  let nRows = 0, nNights = 0;
  for (const D of [...nightsOf.keys()].sort()) {
    const oi = nextIdx(D);
    if (oi >= P.length) continue;
    const [O, s0, sigma, ret20] = P[oi];
    if (!(sigma > 0) || !(s0 > 0)) continue;
    const exps = [];
    for (const E of nightsOf.get(D)) {
      if (!(E > O) || dayDiff(E, D) > 100) continue;
      const s = series.get(E);
      const cut = s.days.filter(d => d.date <= D);
      const v = expiryView({ ...s, days: cut }, { topN: 6, withLadder: true });
      const d = v?.days?.at(-1);
      if (!d || d.date !== D) continue;
      exps.push({ pair: key, expiry: E, dte: d.dte, date: d.date, stale: d.stale, totalOI: d.totalOI, centrePx: d.centrePx, maxPain: d.maxPain, zones: d.zones, ladder: d.ladder ?? null });
    }
    if (!exps.length) continue;
    nNights++;
    for (const anchor of ANCHORS) for (const includeThin of [false, true]) {
      const w = zoneWalk(exps, { close: s0, anchor, includeThin, vol: sigma, date: O });
      for (const p of w.points) {
        const ie = pIdx.get(p.expiry);
        const h = ie != null ? ie - oi : nextIdx(p.expiry) - 1 - oi;
        const sE = ie != null ? P[ie][1] : '';
        out.write(`${key},${D},${O},${anchor},${includeThin ? 1 : 0},${p.expiry},${p.dte},${h},${s0},${sigma},${ret20 ?? ''},${Number(p.px.toPrecision(10))},${sE},${p.thin ? 1 : 0},${p.pullShare != null ? +p.pullShare.toFixed(4) : ''}\n`);
        nRows++;
      }
    }
  }
  console.log(`${key}: ${series.size} expiries, ${nNights} nights, ${nRows} walk steps, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
out.end();
