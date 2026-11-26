// oi-monthly-vs-full (EXPLORATORY, not pre-registered, 2026-11-26).
// Question: on our own nightly QuikStrike capture, how far do the OI Profile lines move if the book is cut down to the standard
// monthly / quarterly family only (what the Databento history holds: OG gold monthlies, EUU/GBU/JPU/ADU/CAU/CHU FX monthlies,
// NQ/ES quarterlies)? Each instrument-date is built twice through the live path (buildOIEntry -> hedging map maxDte 3 ->
// buildOiProfile, strongest book, ±3σ window, σ = that day's forecast), once on the full matrix and once with every non-standard
// expiry column blanked. Also an all-expiries aggregate (walls / max pain / all-expiry gamma flip), full vs monthly-only.
//   node scripts/oi-monthly-vs-full/compare.mjs <oi_raw_cacheDir> <out.jsonl>
// Read-only: local files only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { buildOIEntry } = await imp('js/oi.js');
const { buildOiProfile } = await imp('js/oiProfile.js');
const { cmeBookContracts } = await imp('js/hedgingBooks.js');
const { hedgingScenario } = await imp('js/hedgingScenario.js');

const [cacheDir, outFile] = process.argv.slice(2);
const FK = { 'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'XAU/USD': 'GOLD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF',
  NAS100_USD: 'NQ', US30_USD: 'US30', SPX500_USD: 'SPX500', US2000_USD: 'US2000' };
// the standard (Databento-style) family per instrument: root + month code + year digit; indices quarterly months only
const STD = { 'EUR/USD': /^EUU[FGHJKMNQUVXZ]\d$/, 'GBP/USD': /^GBU[FGHJKMNQUVXZ]\d$/, 'USD/JPY': /^JPU[FGHJKMNQUVXZ]\d$/, 'AUD/USD': /^ADU[FGHJKMNQUVXZ]\d$/,
  'USD/CAD': /^CAU[FGHJKMNQUVXZ]\d$/, 'USD/CHF': /^CHU[FGHJKMNQUVXZ]\d$/, 'XAU/USD': /^OG[FGHJKMNQUVXZ]\d$/,
  NAS100_USD: /^NQ[HMUZ]\d$/, SPX500_USD: /^ES[HMUZ]\d$/, US30_USD: /^YM[HMUZ]\d$/, US2000_USD: /^RTO[HMUZ]\d$/ };
const windowSig = 3;
const INVERTED = new Set(['USD/JPY', 'USD/CAD', 'USD/CHF']);

const hdrIdx = lines => { for (let i = 0; i < lines.length; i++) { const c = lines[i].split('\t').map(s => s.trim()).filter(Boolean); if (c.length >= 4 && c.every(x => x === 'C' || x === 'P')) return i; } return -1; };
// column codes + DTEs from the matrix header (same rules as js/oi.js _matrixRows)
function header(raw) {
  const lines = String(raw || '').split('\n'); const h = hdrIdx(lines); if (h < 0) return null;
  const codes = [], dtes = [];
  for (let i = 0; i < h; i++) {
    const m = lines[i].match(/(-?\d+)\s*DTE/g); if (m) for (const t of m) dtes.push(parseInt(t, 10));
    const c0 = (lines[i].split('\t')[0] || '').trim(); const rowIsPrice = c0 === '' || /^-?\d+(\.\d+)?$/.test(c0);
    // wider than js/oi.js: series codes may start with a digit (4JYQ6) or a single letter (G4WU6); tokens on price rows are the underlyings
    for (const tok of lines[i].split('\t')) { const t = tok.trim(); if (rowIsPrice || !/^[A-Z0-9]{2,5}[FGHJKMNQUVXZ]\d$/.test(t) || !/[A-Z]/.test(t)) continue; codes.push(t); }
  }
  const nExp = Math.floor(lines[h].split('\t').filter(Boolean).length / 2);
  return { lines, h, nExp, codes: codes.length === nExp ? codes : null, dtes: dtes.length === nExp ? dtes : null };
}
// code per column: the header's own codes when complete, otherwise the settlements (IV term) table, matched by DTE in table order
function columnCodes(hd, ivTerm) {
  if (hd.codes) return { codes: hd.codes, via: 'header' };
  if (!hd.dtes) return { codes: null, via: 'none' };
  const tab = [];
  for (const l of String(ivTerm || '').split('\n')) { const m = l.match(/^([A-Z0-9]{3,7})\t(\d+)\t\d\d\/\d\d\/\d{4}/); if (m) tab.push({ code: m[1], dte: +m[2] }); }
  const used = {};
  const codes = hd.dtes.map(d => { const c = tab.filter(t => t.dte === d); const k = used[d] = (used[d] ?? -1) + 1; return c[k]?.code ?? null; });
  return { codes, via: 'ivterm' };
}
// blank the non-standard expiry columns of a matrix paste (keeps every cell position)
function keepColumns(raw, keep) {
  const hd = header(raw); if (!hd) return raw;
  return hd.lines.map((l, i) => {
    if (i <= hd.h) return l;
    const cells = l.split('\t'); const s = parseFloat((cells[0] || '').replace(/,/g, ''));
    if (!Number.isFinite(s)) return l;
    for (let e = 0; e < hd.nExp; e++) if (!keep[e]) { if (1 + 2 * e < cells.length) cells[1 + 2 * e] = ''; if (2 + 2 * e < cells.length) cells[2 + 2 * e] = ''; }
    return cells.join('\t');
  }).join('\n');
}
const quiet = fn => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; return Promise.resolve(fn()).finally(() => { console.warn = w; console.log = l; }); };

async function build(sk, cap, rawOI, rawChg, dayMoveFromPct) {
  const entry = await quiet(() => buildOIEntry({
    pair: sk, rawOI, rawChg, rawVol: cap.rawVol || '', rawIV: cap.rawIV || '', rawIVTerm: cap.rawIVTerm || '',
    dteRaw: Number.isFinite(cap.dte) ? cap.dte : NaN, spotRaw: Number.isFinite(cap.spot) ? cap.spot : NaN, futuresRaw: Number.isFinite(cap.futures) ? cap.futures : NaN,
    manualFutures: Number.isFinite(cap.futures), skipLiveQuote: true,
  }));
  if (!entry || entry.error || !entry.inst?.spot) return { err: entry?.error || 'no inst' };
  const inst = entry.inst; inst.pair = inst.pair || sk;
  const dayMove = dayMoveFromPct(inst.spot);
  const rm = dayMove ?? (inst.refMove?.move > 0 ? inst.refMove.move : inst.spot * 0.01);
  let hedge = null;
  try {
    const bk = cmeBookContracts(sk, inst, { maxDte: 3 });
    if (bk) { const half = Math.min(0.08, Math.max(0.008, (windowSig + 0.1) * rm / inst.spot)); hedge = hedgingScenario(bk.contracts, { spot: bk.spot, lo: bk.spot * (1 - half), hi: bk.spot * (1 + half), n: 81, shifts: [-2, 0, 2, 4], optMult: 1, futMult: 1 }); }
  } catch { hedge = null; }
  const prof = buildOiProfile(inst, { sym: sk, hedge, dayMove, windowRm: windowSig });
  if (!prof) return { err: 'no profile' };
  return { inst, prof, hedgeOn: !!hedge, dayMove };
}
// all-expiry aggregate: walls (max OI strike), max pain, from the summed matrix columns that are kept
// Walls and max pain are taken within ±4σ of spot (in spot terms: 1/k for 6J/6C/6S, minus the stored basis), so the deep-OTM tail and the
// implausible-OI strikes the live build drops (oiAnomalies) cannot become a 'wall'. Max pain is computed in the matrix's own (futures) terms
// and converted. `oi` = the whole book's OI (no window), for the weekly/daily share.
function aggregate(rawOI, keep, { inverted = false, basis = 0, spot, sigma }) {
  const hd = header(rawOI); if (!hd) return null;
  const C = new Map(), P = new Map(); let tot = 0;
  const toSpot = k => (inverted ? 1 / k : k) - basis;
  for (let i = hd.h + 1; i < hd.lines.length; i++) {
    const cells = hd.lines[i].split('\t'); const s = parseFloat((cells[0] || '').replace(/,/g, '')); if (!Number.isFinite(s) || s <= 0) continue;
    const inWin = Math.abs(toSpot(s) - spot) <= 4 * sigma;
    for (let e = 0; e < hd.nExp; e++) {
      if (!keep[e]) continue;
      const c = Math.abs(parseFloat((cells[1 + 2 * e] || '').replace(/,/g, '')) || 0), p = Math.abs(parseFloat((cells[2 + 2 * e] || '').replace(/,/g, '')) || 0);
      tot += c + p;
      if (!inWin) continue;
      if (c) C.set(s, (C.get(s) || 0) + c); if (p) P.set(s, (P.get(s) || 0) + p);
    }
  }
  const ks = [...new Set([...C.keys(), ...P.keys()])].sort((a, b) => a - b); if (ks.length < 3) return { callWall: null, putWall: null, maxPain: null, oi: tot };
  const argmax = mp => { let b = null, v = -1; for (const [k, x] of mp) if (x > v) { v = x; b = k; } return b; };
  let mpK = null, mpV = Infinity;
  for (const K of ks) { let pain = 0; for (const k of ks) { pain += (C.get(k) || 0) * Math.max(0, K - k) + (P.get(k) || 0) * Math.max(0, k - K); } if (pain < mpV) { mpV = pain; mpK = K; } }
  // on an inverted pair a 6J CALL wall is a USDJPY PUT-side level, so the names swap in spot terms
  const cw = argmax(C), pw = argmax(P), sp = k => (k == null ? null : toSpot(k));
  return inverted ? { callWall: sp(pw), putWall: sp(cw), maxPain: sp(mpK), oi: tot } : { callWall: sp(cw), putWall: sp(pw), maxPain: sp(mpK), oi: tot };
}

const dates = fs.readdirSync(cacheDir).map(f => f.match(/^oi_raw_(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter(Boolean).sort()
  .filter(d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w >= 1 && w <= 5; });
const out = fs.createWriteStream(outFile);
const log = { days: dates.length, rows: 0, skipped: {} };
const skip = (why) => { log.skipped[why] = (log.skipped[why] || 0) + 1; };
for (const date of dates) {
  const store = (j => j.data ?? j)(JSON.parse(fs.readFileSync(path.join(cacheDir, `oi_raw_${date}.json`), 'utf8')));
  let fc = null; const ff = path.join(cacheDir, `vol_forecast_${date}.json`);
  if (fs.existsSync(ff)) { const j = JSON.parse(fs.readFileSync(ff, 'utf8')); fc = j.instruments ?? j.data?.instruments ?? null; }
  for (const [sk, cap] of Object.entries(store)) {
    if (!cap?.rawOI || !STD[sk]) continue;
    const sg = fc?.[FK[sk]]?.ladder?.sigma_daily_pct;
    if (!(sg > 0)) { skip('no forecast σ'); continue; }
    const hd = header(cap.rawOI); if (!hd) { skip('no matrix'); continue; }
    const cc = columnCodes(hd, cap.rawIVTerm);
    if (!cc.codes) { skip('no column codes'); continue; }
    const keep = cc.codes.map(c => !!c && STD[sk].test(c));
    const unknownCols = cc.codes.filter(c => !c).length;
    const ao = { inverted: INVERTED.has(sk), basis: Number.isFinite(cap.basis) ? cap.basis : 0, spot: cap.spot, sigma: cap.spot * sg / 100 };
    const aggAll = aggregate(cap.rawOI, cc.codes.map(() => true), ao);
    const aggStd = keep.some(Boolean) ? aggregate(cap.rawOI, keep, ao) : null;
    const stdShare = aggAll && aggStd ? aggStd.oi / aggAll.oi : 0;
    const dm = spot => spot * sg / 100;
    try {
      const full = await build(sk, cap, cap.rawOI, cap.rawChg || '', dm);
      if (full.err) { skip('full: ' + full.err); continue; }
      let mon = { err: 'no standard expiry in the capture' };
      if (keep.some(Boolean)) {
        const chgHd = header(cap.rawChg || '');
        const chg = chgHd && chgHd.nExp === hd.nExp ? keepColumns(cap.rawChg, keep) : '';
        mon = await build(sk, cap, keepColumns(cap.rawOI, keep), chg, dm);
      }
      const lv = p => p ? p.levels.filter(l => !l.hidden).map(l => ({ type: l.type, price: l.price, strength: l.strength ?? null })) : null;
      const row = {
        date, sk, fk: FK[sk], sigma: full.dayMove, spot: full.prof.spot, nCols: hd.nExp, stdCols: keep.filter(Boolean).length, unknownCols, codesVia: cc.via,
        stdCodes: cc.codes.filter((c, i) => keep[i]), stdShare,
        full: { regime: full.prof.regime, hedgeOn: full.hedgeOn, zeroGamma: full.prof.zeroGamma, flip: full.inst.gexFlip ?? null, allFlip: full.inst.fullBook?.flip ?? null,
          book: full.prof.book?.label ?? null, levels: lv(full.prof) },
        mon: mon.err ? { err: mon.err } : { regime: mon.prof.regime, hedgeOn: mon.hedgeOn, zeroGamma: mon.prof.zeroGamma, flip: mon.inst.gexFlip ?? null, allFlip: mon.inst.fullBook?.flip ?? null,
          book: mon.prof.book?.label ?? null, levels: lv(mon.prof) },
        aggAll, aggStd,
      };
      out.write(JSON.stringify(row) + '\n'); log.rows++;
    } catch (e) { skip('error: ' + e.message.slice(0, 60)); }
  }
}
out.end();
console.log(JSON.stringify(log, null, 1));
