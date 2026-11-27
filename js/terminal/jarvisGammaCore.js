// js/terminal/jarvisGammaCore.js: the pure half of Jarvis's GAMMA view. It turns one market's stored option-open-interest entry (/api/oi-store: gexProfile rows of strike, callOI, putOI, netGex,
// plus the desk's own walls, gamma flip, max pain and IV smile) into a short strike ladder: ~48 equal strike bins around spot, the call and put open interest in each, the net gamma in each,
// and the markers that the 3D fly-through stands on. DESCRIPTION ONLY: this is where open interest sits and the gamma it implies, never a forecast, never a target.
import { spoken } from './showCore.js';

/** The markets that can carry an option book, in picker order: key (the HUD's market key), pair (the store key) and the short label. */
export const GAMMA_MARKETS = [
  { key: 'NQ', pair: 'NAS100_USD', label: 'NQ' }, { key: 'SPX500', pair: 'SPX500_USD', label: 'ES / SPX' }, { key: 'US30', pair: 'US30_USD', label: 'DOW' }, { key: 'US2000', pair: 'US2000_USD', label: 'RUSSELL' },
  { key: 'EURUSD', pair: 'EUR/USD', label: 'EURUSD' }, { key: 'GBPUSD', pair: 'GBP/USD', label: 'GBPUSD' }, { key: 'USDJPY', pair: 'USD/JPY', label: 'USDJPY' }, { key: 'AUDUSD', pair: 'AUD/USD', label: 'AUDUSD' },
  { key: 'USDCAD', pair: 'USD/CAD', label: 'USDCAD' }, { key: 'USDCHF', pair: 'USD/CHF', label: 'USDCHF' }, { key: 'GOLD', pair: 'XAU/USD', label: 'GOLD' },
];
export const BINS = 48;
const fin = v => typeof v === 'number' && Number.isFinite(v);

/** Which markets in the store have a usable strike profile, in picker order. */
export const marketsWithOI = store => GAMMA_MARKETS.filter(m => Array.isArray(store?.[m.pair]?.gexProfile) && store[m.pair].gexProfile.some(r => fin(r?.strike) && (r.callOI > 0 || r.putOI > 0)) && fin(store[m.pair].spot));

/** A price in the market's own precision: indices and gold whole numbers, yen 2 places, other FX 4. */
export const fmtPx = v => (!fin(v) ? 'n/a' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 100 ? v.toFixed(2) : v.toFixed(4));
export const fmtOI = v => (!fin(v) ? 'n/a' : Math.round(v).toLocaleString('en-US'));

/**
 * The ladder for one store entry, or null when there is no profile. Result: { pair, spot, lo, hi, w, n, strikes[n] (bin centres), call[n], put[n] (open interest, contracts), net[n] (net gamma, -1..1 of the biggest bin),
 * iv[n] (smile value or null), flip, callWall: { strike, oi, bin } | null, putWall, maxPain, spotBin (fractional), long (dealers net long gamma at spot per the data | null), maxCall, maxPut, dte, savedAt, ivPts: [[strike, iv]] }.
 */
export function buildLadder(e, n = BINS) {
  const rows = Array.isArray(e?.gexProfile) ? e.gexProfile.filter(r => fin(r?.strike) && (r.callOI > 0 || r.putOI > 0)) : [];
  const spot = e?.spot; if (!rows.length || !fin(spot) || spot <= 0) return null;
  // the window: where 97% of the open interest sits, held inside +-12% of spot, then widened to hold spot, the flip, the walls and max pain (when near)
  const srt = rows.map(r => [r.strike, (r.callOI || 0) + (r.putOI || 0)]).sort((a, b) => a[0] - b[0]); const tot = srt.reduce((s, r) => s + r[1], 0);
  let acc = 0, qa = srt[0][0], qb = srt[srt.length - 1][0], gotA = false;
  for (const [k, w] of srt) { acc += w; if (!gotA && acc >= tot * 0.015) { qa = k; gotA = true; } if (acc >= tot * 0.985) { qb = k; break; } }
  let lo = Math.max(qa, spot * 0.88), hi = Math.min(qb, spot * 1.12); const near = v => (fin(v) && v > spot * 0.85 && v < spot * 1.15 ? v : null);
  const flip = near(e.gammaFlip) ?? near(e.gexFlip), cw = near(e.callWall), pw = near(e.putWall), mp = near(e.maxPain);
  for (const v of [spot, flip, cw, pw, mp]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!(hi > lo)) { lo = spot * 0.97; hi = spot * 1.03; } const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
  const w = (hi - lo) / n, call = new Float64Array(n), put = new Float64Array(n), net = new Float64Array(n), strikes = new Float64Array(n);
  for (let i = 0; i < n; i++) strikes[i] = lo + (i + 0.5) * w;
  for (const r of rows) { if (r.strike < lo || r.strike >= hi) continue; const i = Math.min(n - 1, Math.floor((r.strike - lo) / w)); call[i] += r.callOI || 0; put[i] += r.putOI || 0; net[i] += fin(r.netGex) ? r.netGex : 0; }
  { const raw = Float64Array.from(net); for (let i = 0; i < n; i++) net[i] = (raw[Math.max(0, i - 1)] + 2 * raw[i] + raw[Math.min(n - 1, i + 1)]) / 4; }   // a 1-2-1 smoothing so the ribbon reads as a curve, not a comb
  let mx = 0, mc = 0, mpu = 0; for (let i = 0; i < n; i++) { mx = Math.max(mx, Math.abs(net[i])); mc = Math.max(mc, call[i]); mpu = Math.max(mpu, put[i]); } if (mx > 0) for (let i = 0; i < n; i++) net[i] /= mx;
  const bin = v => Math.max(0, Math.min(n - 1, Math.floor((v - lo) / w)));
  // the desk's own walls (the Options tab's), with their own open interest; if the entry carries none, the biggest single strike in the window
  const biggest = f => { let b = null; for (const r of rows) if (r.strike >= lo && r.strike < hi && (b == null || (r[f] || 0) > (b[f] || 0))) b = r; return b && b[f] > 0 ? { strike: b.strike, oi: b[f] } : null; };
  const oiAt = (s, f) => { let b = 0, d = Infinity; for (const r of rows) { const dd = Math.abs(r.strike - s); if (dd < d) { d = dd; b = r[f] || 0; } } return b; };
  const wall = (s, f, oi) => { const x = s != null ? { strike: s, oi: fin(oi) && oi > 0 ? oi : oiAt(s, f) } : biggest(f); return x && x.oi > 0 ? { strike: x.strike, oi: x.oi, bin: bin(x.strike) } : null; };
  const callWall = wall(cw, 'callOI', e.callWallOI), putWall = wall(pw, 'putOI', e.putWallOI);
  // the IV smile, when present: sorted points inside the window and a value per bin by interpolation
  let ivPts = []; const sm = e.ivSmile;
  if (Array.isArray(sm?.strikes) && Array.isArray(sm?.iv)) ivPts = sm.strikes.map((k, i) => [k, sm.iv[i]]).filter(p => fin(p[0]) && fin(p[1]) && p[0] >= lo && p[0] <= hi).sort((a, b) => a[0] - b[0]);
  const iv = new Array(n).fill(null);
  if (ivPts.length > 2) for (let i = 0; i < n; i++) { const s = strikes[i]; if (s < ivPts[0][0] || s > ivPts[ivPts.length - 1][0]) continue; let j = 1; while (j < ivPts.length - 1 && ivPts[j][0] < s) j++; const a = ivPts[j - 1], b = ivPts[j], f = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0; iv[i] = a[1] + (b[1] - a[1]) * f; }
  const spotBin = (spot - lo) / w - 0.5;
  let long = null;
  if (flip != null) long = spot >= flip; else { let s = 0; for (let i = Math.max(0, Math.round(spotBin) - 2); i <= Math.min(n - 1, Math.round(spotBin) + 2); i++) s += net[i]; long = s === 0 ? null : s > 0; }
  return { pair: e.pair, spot, lo, hi, w, n, strikes, call, put, net, iv, flip, callWall, putWall, maxPain: mp, spotBin, long, maxCall: mc, maxPut: mpu, dte: fin(e.dte) ? e.dte : null, savedAt: e.savedAt ?? null, ivPts };
}

/** How far a level sits from spot, in words: "3 percent above spot". */
export const rel = (v, spot) => { const p = (v - spot) / spot * 100, a = Math.abs(p); return `${a < 10 ? a.toFixed(1) : Math.round(a)} percent ${p >= 0 ? 'above' : 'below'} spot`; };

/** The spoken script for the SHOW: at most 45 words, walls against spot, the dealer gamma side, the caveat. null without a ladder or without any wall. */
export function gammaScript(L, key) {
  if (!L || (!L.callWall && !L.putWall)) return null;
  const num = v => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3));
  const parts = [];
  if (L.callWall) parts.push(`the biggest call wall is ${num(L.callWall.strike)}, ${rel(L.callWall.strike, L.spot)}`);
  if (L.putWall) parts.push(`the biggest put wall is ${num(L.putWall.strike)}, ${rel(L.putWall.strike, L.spot)}`);
  const side = L.long == null ? '' : L.long ? ' Spot is above the gamma flip, so dealers are net long gamma here.' : ' Spot is below the gamma flip, so dealers are net short gamma here.';
  // Helix review wave 1.9: say whose open interest this is, by its capture date
  const d = String(L.savedAt ?? '').slice(0, 10), when = /^\d{4}-\d{2}-\d{2}$/.test(d) ? ` The open interest is from the ${new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} capture.` : '';
  return `In ${spoken(key)} options, ${parts.join(' and ')}.${side}${when} Positioning, not a forecast.`;
}
