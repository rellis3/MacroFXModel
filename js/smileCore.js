/**
 * IV smile replay, the pure part (Desk Terminal, preview; used by the route js/smileRoutes.js and the view js/terminal/smileView.js). The Cboe option chains the server keeps (the end-of-day archive
 * cboe_raw/ for 18 symbols since 2026-10-16, and the 15-minute log cboe_intraday/ for SPX, NDX, SPY and QQQ since 2026-11-01) carry Cboe's own implied vol per contract. This reduces one chain to the
 * smile of its nearest expiries: implied vol against the strike's distance from spot, out-of-the-money options only (puts below spot, calls above, the usual convention), averaged into 0.5% buckets,
 * with the at-the-money vol and a 5% skew read off each curve.
 *
 * It DESCRIBES the quoted smile. It says nothing about what price does next. No model call, nothing is invented: a contract without a two-sided quote or with a junk vol is left out.
 */
import { parseOcc } from './cboeIntraday.js';

export const WINDOW = 0.12;          // strikes within 12% of spot
export const BUCKET = 0.005;         // 0.5% of spot per bucket
export const MAX_EXPIRIES = 4;
export const MIN_PER_EXPIRY = 14;    // contracts in the window before an expiry's curve is drawn
const fin = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => Math.round(v * 100) / 100;

/** Linear interpolation of a curve of [x, y] points (ascending x) at x0, or null outside its range. */
export function interp(pts, x0) {
  if (!pts?.length || x0 < pts[0][0] || x0 > pts.at(-1)[0]) return null;
  for (let i = 1; i < pts.length; i++) if (x0 <= pts[i][0]) { const [xa, ya] = pts[i - 1], [xb, yb] = pts[i]; return xb === xa ? yb : ya + ((yb - ya) * (x0 - xa)) / (xb - xa); }
  return pts.at(-1)[1];
}

/** One chain -> { spot, curves: [{ exp, dte, n, pts: [[moneyness %, iv %]], atm, skew5 }] }. `fields` names the row columns; `dayISO` is the date the chain was taken (YYYY-MM-DD). */
export function reduceChain(rows, fields, spot, dayISO, { maxExp = MAX_EXPIRIES } = {}) {
  const ix = Object.fromEntries((fields ?? []).map((f, i) => [f, i])), dayMs = Date.parse(`${dayISO}T00:00:00Z`);
  if (!fin(spot) || spot <= 0 || ix.option == null || ix.iv == null || ix.bid == null || ix.ask == null) return { spot: fin(spot) ? spot : null, curves: [] };
  const by = new Map();
  for (const r of rows ?? []) {
    const o = parseOcc(r[ix.option]); if (!o || o.expMs < dayMs) continue;
    const iv = r[ix.iv], bid = r[ix.bid], ask = r[ix.ask]; if (!fin(iv) || iv < 0.02 || iv > 3 || !(bid > 0) || !(ask > 0)) continue;
    const m = o.K / spot - 1; if (Math.abs(m) > WINDOW) continue;
    if (!((o.cp === 'P' && m <= 0.0005) || (o.cp === 'C' && m >= -0.0005))) continue;          // out of the money only
    if (!by.has(o.exp)) by.set(o.exp, { exp: o.exp, expMs: o.expMs, n: 0, b: new Map() });
    const e = by.get(o.exp), k = Math.round(m / BUCKET), cell = e.b.get(k) ?? { s: 0, c: 0 }; cell.s += iv; cell.c++; e.b.set(k, cell); e.n++;
  }
  const curves = [...by.values()].filter(e => e.n >= MIN_PER_EXPIRY && e.b.size >= 5).sort((a, b) => a.expMs - b.expMs).slice(0, maxExp).map(e => {
    const pts = [...e.b.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => [r2(k * BUCKET * 100), r2((c.s / c.c) * 100)]);
    const atm = interp(pts, 0), lo = interp(pts, -5), hi = interp(pts, 5);
    return { exp: e.exp, dte: Math.round((e.expMs - dayMs) / 864e5), n: e.n, pts, atm: atm == null ? null : r2(atm), skew5: lo != null && hi != null ? r2(lo - hi) : null };
  });
  return { spot, curves };
}

/** The spot of an end-of-day archive record (Cboe's own underlying block), or null. */
export const rawSpot = rec => { const u = rec?.underlying; const v = u?.current_price ?? u?.close; return fin(v) ? v : null; };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const niceDay = d => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isNaN(t) ? String(d) : `${DAY_NAMES[new Date(t).getUTCDay()]} ${new Date(t).getUTCDate()} ${new Date(t).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`; };
export const hhmm = ms => { const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/** What each symbol's history is, in words (for the on-screen depth line). */
export function coverageText({ sym, days, intraday }) {
  const d = (days ?? []).slice().sort(), it = (intraday ?? []).slice().sort();
  if (!d.length) return `No option chains are held for ${sym}.`;
  return `${d.length} end-of-day chains held for ${sym}, ${niceDay(d[0])} to ${niceDay(d.at(-1))} (the archive began 16 Oct 2026).${it.length ? ` 15-minute chains held on ${it.length} days, from ${niceDay(it[0])}.` : ' No 15-minute chains are kept for this symbol.'}`;
}

/** Per-frame facts used by the caption: the nearest expiry's ATM vol and skew, and the change from the frame before. */
export function frameFacts(frame, prev) {
  const c = frame?.curves?.[0]; if (!c) return null; const p = prev?.curves?.find(x => x.exp === c.exp) ?? null;
  return { exp: c.exp, dte: c.dte, atm: c.atm, skew5: c.skew5, dAtm: p && fin(p.atm) && fin(c.atm) ? r2(c.atm - p.atm) : null, dSkew: p && fin(p.skew5) && fin(c.skew5) ? r2(c.skew5 - p.skew5) : null, term: frame.curves.map(x => [x.dte, x.atm]).filter(x => fin(x[1])) };
}

/** One plain sentence for a frame. It describes the quoted smile and its change; it never says where price goes. */
export function caption(frame, prev, label) {
  const f = frameFacts(frame, prev); if (!f) return `${label}: no expiry had enough two-sided quotes to draw a smile.`;
  let t = `${label}: the ${f.dte === 0 ? 'same-day' : `${f.dte}-day`} expiry (${f.exp}) is quoted at ${f.atm?.toFixed(1) ?? '–'}% at the money`;
  if (f.skew5 != null) t += `, and a put 5% below spot is quoted ${f.skew5 >= 0 ? `${f.skew5.toFixed(1)} vol points above` : `${(-f.skew5).toFixed(1)} vol points below`} a call 5% above`;
  t += '.';
  if (f.dAtm != null) t += ` Since the previous step the at-the-money vol ${f.dAtm === 0 ? 'did not change' : `${f.dAtm > 0 ? 'rose' : 'fell'} ${Math.abs(f.dAtm).toFixed(1)} points`}${f.dSkew != null && Math.abs(f.dSkew) >= 0.1 ? ` and the skew ${f.dSkew > 0 ? 'steepened' : 'flattened'} by ${Math.abs(f.dSkew).toFixed(1)}` : ''}.`;
  return t;
}

/** The y range for one fixed scale over all frames: the 5th and 95th percentile of every quoted vol, padded. */
export function yRange(frames) {
  const v = frames.flatMap(f => (f?.curves ?? []).flatMap(c => c.pts.map(p => p[1]))).filter(fin).sort((a, b) => a - b); if (!v.length) return [0, 40];
  const lo = v[Math.floor(v.length * 0.02)], hi = v[Math.min(v.length - 1, Math.floor(v.length * 0.98))];
  return [Math.max(0, Math.floor(lo - 1)), Math.ceil(hi + 1)];
}

export function csv(frames) {
  const out = [['frame', 'spot', 'expiry', 'dte', 'moneyness_pct', 'iv_pct']];
  for (const f of frames) for (const c of f.curves ?? []) for (const p of c.pts) out.push([f.label ?? f.t, f.spot ?? '', c.exp, c.dte, p[0], p[1]]);
  return out.map(r => r.join(',')).join('\n');
}

/** The symbols the replay offers (the archive holds 18; these are the ones with a useful smile) and the ones with 15-minute chains. */
export const SYMS = ['SPX', 'NDX', 'SPY', 'QQQ', 'RUT', 'IWM', 'DJX', 'DIA', 'GLD', 'SLV', 'USO', 'TLT', 'HYG'];
export const INTRA_SYMS = ['SPX', 'NDX', 'SPY', 'QQQ'];
/** The OI terrain card's market -> the symbol whose chain stands for it (an ETF proxy for gold). */
export const SYM_OF_INST = { NQ: 'NDX', SPX500: 'SPX', US2000: 'RUT', US30: 'DJX', GOLD: 'GLD' };
/** A word a person typed -> a symbol, or null. */
export const symFromWord = w => { const t = String(w ?? '').toUpperCase(); const alias = { NQ: 'NDX', NASDAQ: 'NDX', ES: 'SPX', SPX500: 'SPX', SP500: 'SPX', RTY: 'RUT', RUSSELL: 'RUT', GOLD: 'GLD', DOW: 'DJX', YM: 'DJX', US30: 'DJX' }; const k = alias[t] ?? t; return SYMS.includes(k) ? k : null; };
