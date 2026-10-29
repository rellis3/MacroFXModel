// oi-level-map step 5: IV-smile features per (session, market), from the same captures. The smile is one expiry's per-strike IV chain (inst.ivSmile) with the previous capture's chain
// alongside (ivPrior), so day-over-day change comes straight from the capture. Wings are read at fixed distances from price in units of the DAY's implied move, so
// every market and every expiry is measured the same way.   node scripts/oi-level-map/extract_smile.mjs   ->  analysis/output/oi-level-map/smile.json
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildOIEntry } from '../../js/oi.js';
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ');
const OUT = join(ROOT, 'analysis/output/oi-level-map');
const L = JSON.parse(readFileSync(join(OUT, 'levels.json'), 'utf8'));
const STEM = { 'EUR/USD': 'EUR_USD', 'GBP/USD': 'GBP_USD', 'USD/JPY': 'USD_JPY', 'AUD/USD': 'AUD_USD', 'USD/CAD': 'USD_CAD', 'USD/CHF': 'USD_CHF', 'XAU/USD': 'XAU_USD', NAS100_USD: 'NAS100_USD', SPX500_USD: 'SPX500_USD', US30_USD: 'US30_USD', US2000_USD: 'US2000_USD' };
const interp = (xs, ys, x) => {
  const pts = xs.map((k, i) => [k, ys[i]]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0).sort((a, b) => a[0] - b[0]);
  if (pts.length < 6 || x < pts[0][0] || x > pts[pts.length - 1][0]) return null;
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return null;
};
const feat = (sm, ivs, spot, sg) => {
  if (!sm || !ivs) return null;
  const f = d => interp(sm, ivs, spot + d * sg), a = f(0);
  const out = { atm: a };
  for (const k of [1, 2, 3]) { out['p' + k] = f(-k * sg); out['c' + k] = f(k * sg); }
  for (const k of [1, 2, 3]) { if (out['p' + k] != null && out['c' + k] != null && a != null) { out['skew' + k] = out['p' + k] - out['c' + k]; out['fly' + k] = (out['p' + k] + out['c' + k]) / 2 - a; } }
  return out;
};
const rec = [];
for (const r of L) {
  if (!r.dayMove) continue;
  const date = r.date, stem = STEM[r.sym], dir = join(ROOT, 'oi_recon/out', date, 'quikstrike');
  const rd = b => { try { return readFileSync(join(dir, `${stem}_${b}.tsv`), 'utf8'); } catch { return ''; } };
  let res; try { res = await buildOIEntry({ pair: r.sym, rawOI: rd('rawOI'), rawChg: rd('rawChg'), rawVol: rd('rawVol'), rawIV: rd('rawIV'), rawIVTerm: rd('rawIVTerm'), skipLiveQuote: true, spotRaw: r.spot, baseUrl: '' }); } catch { continue; }
  if (!res || res.error) continue;
  const i = res.inst, sm = i.ivSmile; if (!sm?.strikes?.length) continue;
  const sc = v => (v != null && v < 2 ? v * 100 : v);     // vol points
  const now = feat(sm.strikes, sm.iv.map(sc), i.spot, r.dayMove), prior = sm.ivPrior ? feat(sm.strikes, sm.ivPrior.map(sc), i.spot, r.dayMove) : null;
  rec.push({ date, sym: r.sym, spot: i.spot, dayMove: r.dayMove, now, prior, rr: i.riskReversal ? { rr: i.riskReversal.rr, putIV: i.riskReversal.putIV, callIV: i.riskReversal.callIV } : null,
             dyn: i.ivDynamics ? { atmChg: i.ivDynamics.atmChg, wingChg: i.ivDynamics.wingChg, skewSteepening: i.ivDynamics.skewSteepening } : null, strikesN: sm.strikes.length });
}
writeFileSync(join(OUT, 'smile.json'), JSON.stringify(rec));
console.log('records', rec.length, 'with prior', rec.filter(x => x.prior).length);
