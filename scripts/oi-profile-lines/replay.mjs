// oi-profile-lines, stage 0: replay every archived morning through the OI Profile build, exactly as /api/oi-profile/export does it live
// (server.js ~32691: buildOIEntry -> dayMove from that day's vol forecast -> hedging map (maxDte 3) -> buildOiProfile, strongest book, ±3σ window).
// Output: one JSON line per (date, instrument) with the drawn lines and the day's context. No price data is read here.
//   node scripts/oi-profile-lines/replay.mjs <cacheDir> <out.jsonl> [--books all]
import fs from 'node:fs';
import path from 'node:path';
import { buildOIEntry } from '../../js/oi.js';
import { buildOiProfile } from '../../js/oiProfile.js';
import { cmeBookContracts } from '../../js/hedgingBooks.js';
import { hedgingScenario } from '../../js/hedgingScenario.js';

const [cacheDir, outFile] = process.argv.slice(2);
const allBooks = process.argv.includes('--books') && process.argv[process.argv.indexOf('--books') + 1] === 'all';
const FK = { 'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'XAU/USD': 'GOLD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF',
  NAS100_USD: 'NQ', US30_USD: 'US30', SPX500_USD: 'SPX500', US2000_USD: 'US2000' };
const windowSig = 3;

const dates = fs.readdirSync(cacheDir).map(f => f.match(/^oi_raw_(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter(Boolean).sort();
const out = fs.createWriteStream(outFile);
const log = { days: 0, rows: 0, noForecast: 0, errors: [] };
const quiet = fn => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; return Promise.resolve(fn()).finally(() => { console.warn = w; console.log = l; }); };

for (const date of dates) {
  const day = JSON.parse(fs.readFileSync(path.join(cacheDir, `oi_raw_${date}.json`), 'utf8'));
  const store = day.data ?? day;
  let fc = null, fcAt = null;
  const ff = path.join(cacheDir, `vol_forecast_${date}.json`);
  if (fs.existsSync(ff)) { const j = JSON.parse(fs.readFileSync(ff, 'utf8')); fc = j.instruments ?? null; fcAt = j.computed_at ?? null; }
  log.days++;
  for (const [sk, cap] of Object.entries(store)) {
    if (!cap?.rawOI) continue;
    try {
      const entry = await quiet(() => buildOIEntry({
        pair: sk, rawOI: cap.rawOI, rawChg: cap.rawChg || '', rawVol: cap.rawVol || '', rawIV: cap.rawIV || '', rawIVTerm: cap.rawIVTerm || '',
        dteRaw: Number.isFinite(cap.dte) ? cap.dte : NaN, spotRaw: Number.isFinite(cap.spot) ? cap.spot : NaN, futuresRaw: Number.isFinite(cap.futures) ? cap.futures : NaN,
        manualFutures: Number.isFinite(cap.futures), skipLiveQuote: true,
      }));
      if (!entry || entry.error || !entry.inst?.spot) { log.errors.push({ date, sk, e: entry?.error || 'no inst' }); continue; }
      const inst = entry.inst; inst.pair = inst.pair || sk;
      const fk = FK[sk], sg = fc?.[fk]?.ladder?.sigma_daily_pct;
      const dayMove = sg > 0 ? inst.spot * sg / 100 : null;
      if (!dayMove) log.noForecast++;
      const rm = dayMove ?? (inst.refMove?.move > 0 ? inst.refMove.move : inst.spot * 0.01);
      let hedge = null;
      try {
        const bk = cmeBookContracts(sk, inst, { maxDte: 3 });
        if (bk) { const half = Math.min(0.08, Math.max(0.008, (windowSig + 0.1) * rm / inst.spot)); hedge = hedgingScenario(bk.contracts, { spot: bk.spot, lo: bk.spot * (1 - half), hi: bk.spot * (1 + half), n: 81, shifts: [-2, 0, 2, 4], optMult: 1, futMult: 1 }); }
      } catch { hedge = null; }
      const prof = buildOiProfile(inst, { sym: sk, hedge, dayMove, windowRm: windowSig, allBooks });
      if (!prof) { log.errors.push({ date, sk, e: 'no profile' }); continue; }
      // per-strike gamma / volume magnitude at each line (for the "big gamma, no volume" question): read off the profile's own bins
      const at = (rows, px, f) => { if (!rows?.length) return null; let b = null; for (const r of rows) if (!b || Math.abs(r.price - px) < Math.abs(b.price - px)) b = r; return Math.abs(b.price - px) <= prof.binWidth ? f(b) : 0; };
      const gMax = Math.max(1e-12, ...prof.gex.map(r => Math.abs(r.net))), vMax = Math.max(1e-12, ...prof.volume.map(r => r.v));
      const row = {
        date, sk, fk, savedAtMs: cap.savedAtMs ?? null, fcAt, spot: prof.spot, futures: cap.futures ?? null, basis: cap.basis ?? null,
        sigmaPct: sg ?? null, dayMove, rm: prof.refMove, regime: prof.regime, netGex: prof.netGex, hedgeRegime: hedge?.atSpot?.regime ?? null,
        book: prof.book, zeroGamma: prof.zeroGamma, em: prof.em, iv: prof.iv,
        levels: prof.levels.map(l => ({ type: l.type, price: l.price, strength: l.strength ?? null, rank: l.rank ?? null, tags: l.tags ?? null, hidden: !!l.hidden,
          label: l.label, expect: l.expect, chgPct: l.chgPct ?? null,
          gAt: at(prof.gex, l.price, r => Math.abs(r.net) / gMax), vAt: at(prof.volume, l.price, r => r.v / vMax) })),
      };
      out.write(JSON.stringify(row) + '\n'); log.rows++;
    } catch (e) { log.errors.push({ date, sk, e: e.message }); }
  }
}
out.end();
console.log(JSON.stringify({ ...log, errors: log.errors.length, errSample: log.errors.slice(0, 8) }, null, 1));
