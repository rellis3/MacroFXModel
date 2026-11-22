// js/terminal/ivSurfaceCore.js: the pure half of Jarvis's VOL SURFACE view (js/terminal/jarvisViewVolSurface.js). It turns the option implied-vol data the server already keeps into one
// moneyness x expiry grid per snapshot: columns = strike distance from spot in percent (puts left, calls right), rows = expiries (nearest first), cell = implied vol in percent (null where nothing
// was quoted, never filled in). From each grid it reads the at-the-money term structure, the 25-delta put and call wings and the put-call skew.
// Two sources, never mixed in one surface:
//   'cboe': /api/replay/smile (js/smileRoutes.js + js/smileCore.js), the Cboe chains: up to the 4 nearest expiries, out-of-the-money options in 0.5% buckets, one snapshot per held day (history).
//   'cme' : /api/oi-store (js/oi.js), the nightly CME capture: ivSmiles (near-expiry chains), ivSmile (the main expiry's chain, with the previous settlement's vols as ivPrior) and
//           ivTermStructure.points (ATM vol per expiry, further out, with the day's change). Far expiries there carry only an ATM vol, so those rows are spine-only.
// DESCRIPTION ONLY: what options are pricing now, never a forecast. No DOM, no fetch, no three.js; tested by ivSurfaceCore.test.mjs.

const fin = v => typeof v === 'number' && Number.isFinite(v);
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

/** The markets the view offers, picker order: key (the HUD market key), the store key on /api/oi-store, the Cboe symbol (when a Cboe chain stands for it) and a short label. */
export const IV_MARKETS = [
  { key: 'SPX500', pair: 'SPX500_USD', sym: 'SPX', label: 'S&P 500' }, { key: 'NQ', pair: 'NAS100_USD', sym: 'NDX', label: 'NASDAQ' }, { key: 'US2000', pair: 'US2000_USD', sym: 'RUT', label: 'RUSSELL' },
  { key: 'US30', pair: 'US30_USD', sym: 'DJX', label: 'DOW' }, { key: 'GOLD', pair: 'XAU/USD', sym: 'GLD', label: 'GOLD' },
  { key: 'EURUSD', pair: 'EUR/USD', label: 'EURUSD' }, { key: 'GBPUSD', pair: 'GBP/USD', label: 'GBPUSD' }, { key: 'USDJPY', pair: 'USD/JPY', label: 'USDJPY' }, { key: 'AUDUSD', pair: 'AUD/USD', label: 'AUDUSD' },
  { key: 'USDCAD', pair: 'USD/CAD', label: 'USDCAD' }, { key: 'USDCHF', pair: 'USD/CHF', label: 'USDCHF' },
];
export const NC = 41;          // moneyness columns
export const MAX_ROWS = 10;    // expiries drawn at most (the farthest term-structure points are thinned to fit)
export const D25 = 0.6745;     // N^-1(0.75): the d1 of a 25-delta option

/** Vols as percent: a list that looks like decimals (median under 1.5) is multiplied by 100. Non-finite or non-positive values become null. */
export function toPct(arr) {
  const a = (Array.isArray(arr) ? arr : []).map(v => (fin(v) && v > 0 ? v : null)), f = a.filter(v => v != null).sort((x, y) => x - y);
  if (!f.length) return a; const k = f[Math.floor(f.length / 2)] < 1.5 ? 100 : 1; return a.map(v => (v == null ? null : v * k));
}

/** Linear interpolation of ascending [x, y] points at x0; null outside the quoted range (no extrapolation). */
export function interpAt(pts, x0) {
  if (!pts?.length || !fin(x0) || x0 < pts[0][0] - 1e-9 || x0 > pts[pts.length - 1][0] + 1e-9) return null;
  for (let i = 1; i < pts.length; i++) if (x0 <= pts[i][0]) { const [xa, ya] = pts[i - 1], [xb, yb] = pts[i]; return xb === xa ? yb : ya + ((yb - ya) * (x0 - xa)) / (xb - xa); }
  return pts[pts.length - 1][1];
}

const cleanPts = pts => (Array.isArray(pts) ? pts : []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1]) && p[1] > 0).map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0]);

/** One Cboe replay frame ({ t, spot, curves: [{ exp, dte, pts: [[moneyness %, iv %]], atm }] }) -> a snapshot { label, spot, src, rows: [{ dte, exp, pts, atm, atmOnly }] }, nearest first. */
export function fromCboeFrame(frame, label) {
  const rows = (Array.isArray(frame?.curves) ? frame.curves : []).map(c => {
    const pts = cleanPts(c?.pts); if (pts.length < 3 || !fin(c?.dte)) return null;
    const atm = fin(c.atm) ? c.atm : interpAt(pts, 0);
    return { dte: c.dte, exp: c.exp ?? null, pts, atm: fin(atm) ? atm : null, atmOnly: false };
  }).filter(Boolean).sort((a, b) => a.dte - b.dte);
  return { label: label ?? String(frame?.t ?? ''), spot: fin(frame?.spot) ? frame.spot : null, src: 'cboe', rows };
}

/** Strikes + vols (any unit) -> ascending [[moneyness %, iv %]] against spot. */
function smilePts(strikes, iv, spot) {
  const v = toPct(iv), out = [];
  (Array.isArray(strikes) ? strikes : []).forEach((k, i) => { if (fin(k) && k > 0 && v[i] != null) out.push([(k / spot - 1) * 100, v[i]]); });
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * One /api/oi-store entry -> { now, prior } snapshots (prior has the SAME rows as now, matched by expiry, with null where no earlier value is stored; null when nothing earlier is stored).
 * now rows: the main ivSmile chain (dte from e.dte / primaryExpiry.dte; it wins a tie because it carries the prior vols), each ivSmiles chain, then the term-structure points as ATM-only rows for expiries not already drawn.
 */
export function fromOiEntry(e, label = 'latest capture') {
  const spot = e?.spot; if (!fin(spot) || spot <= 0) return { now: null, prior: null };
  const rows = [], pri = [];
  const near = (d, tol = 1) => rows.some(r => Math.abs(r.dte - d) <= tol);
  const mainDte = fin(e.dte) ? e.dte : fin(e.primaryExpiry?.dte) ? e.primaryExpiry.dte : null;
  if (e.ivSmile && fin(mainDte) && !near(mainDte, 0.5)) {
    const pts = smilePts(e.ivSmile.strikes, e.ivSmile.iv, spot);
    if (pts.length >= 3) {
      rows.push({ dte: mainDte, exp: null, pts, atm: interpAt(pts, 0), atmOnly: false });
      const pp = smilePts(e.ivSmile.strikes, e.ivSmile.ivPrior, spot); pri.push(pp.length >= 3 ? { pts: pp, atm: interpAt(pp, 0) } : null);
    }
  }
  for (const s of Array.isArray(e.ivSmiles) ? e.ivSmiles : []) {
    const pts = smilePts(s?.strikes, s?.iv, spot); if (pts.length < 3 || !fin(s?.dte) || near(s.dte, 0.5)) continue;
    rows.push({ dte: s.dte, exp: s.code ?? null, pts, atm: interpAt(pts, 0), atmOnly: false }); pri.push(null);
  }
  const tp = Array.isArray(e.ivTermStructure?.points) ? e.ivTermStructure.points.filter(p => fin(p?.dte) && fin(p?.iv) && p.iv > 0).sort((a, b) => a.dte - b.dte) : [];
  const tv = toPct(tp.map(p => p.iv)), k = tp.length && tv[0] != null ? tv[0] / tp[0].iv : 1;
  tp.forEach((p, i) => {
    if (near(p.dte) || tv[i] == null) return;
    rows.push({ dte: p.dte, exp: null, pts: [], atm: tv[i], atmOnly: true });
    pri.push(fin(p.ivChg) ? { pts: [], atm: tv[i] - p.ivChg * k } : null);
  });
  // keep it readable: the smile rows always, then thin the ATM-only rows to fit MAX_ROWS (first and last kept)
  const order = rows.map((r, i) => i).sort((a, b) => rows[a].dte - rows[b].dte);
  let keep = order;
  const smile = order.filter(i => !rows[i].atmOnly), atmO = order.filter(i => rows[i].atmOnly), room = Math.max(0, MAX_ROWS - smile.length);
  if (atmO.length > room) { const pick = room <= 0 ? [] : room === 1 ? [atmO[atmO.length - 1]] : Array.from({ length: room }, (_, j) => atmO[Math.round(j * (atmO.length - 1) / (room - 1))]); keep = order.filter(i => !rows[i].atmOnly || pick.includes(i)); }
  const now = { label, spot, src: 'cme', rows: keep.map(i => rows[i]) };
  const anyPrior = keep.some(i => pri[i]);
  const prior = anyPrior ? { label: 'previous settlement', spot, src: 'cme', rows: keep.map(i => (pri[i] ? { dte: rows[i].dte, exp: rows[i].exp, pts: pri[i].pts, atm: fin(pri[i].atm) ? pri[i].atm : null, atmOnly: !pri[i].pts.length } : { dte: rows[i].dte, exp: rows[i].exp, pts: [], atm: null, atmOnly: true })) } : null;
  return { now: now.rows.length ? now : null, prior };
}

/** Does this store entry carry any implied vol the view can draw? */
export const oiHasIV = e => !!fromOiEntry(e).now;

/** The moneyness half-width (percent) for one market's snapshots: the median over smile rows of how far BOTH sides are quoted, held in [0.5, 12], rounded up to a tidy step. */
export function pickRange(snaps) {
  const ext = [];
  for (const s of snaps ?? []) for (const r of s?.rows ?? []) if (r.pts?.length >= 3) ext.push(Math.min(-r.pts[0][0], r.pts[r.pts.length - 1][0]));
  const f = ext.filter(v => fin(v) && v > 0).sort((a, b) => a - b); if (!f.length) return 5;
  const m = Math.max(0.5, Math.min(12, f[Math.floor((f.length - 1) / 2)])), step = m > 6 ? 2 : m > 3 ? 1 : m > 1.5 ? 0.5 : 0.25;
  return Math.min(12, Math.ceil(m / step - 1e-9) * step);
}

/** The vol scale top (percent) shared by all snapshots of a market: the 97th percentile of every drawn vol, rounded up to a tidy step; higher cells are CAPPED (and flagged). */
export function pickScale(snaps, range) {
  const v = [];
  for (const s of snaps ?? []) for (const r of s?.rows ?? []) { if (fin(r.atm)) v.push(r.atm); for (const p of r.pts ?? []) if (Math.abs(p[0]) <= range + 1e-9 && fin(p[1])) v.push(p[1]); }
  const f = v.filter(fin).sort((a, b) => a - b); if (!f.length) return 20;
  const q = f[Math.min(f.length - 1, Math.floor(f.length * 0.97))], step = q > 40 ? 10 : q > 15 ? 5 : q > 6 ? 2 : 1;
  return Math.max(step, Math.ceil(q / step - 1e-9) * step);
}

/** The 25-delta strikes as moneyness % for an ATM vol (percent) and days to expiry (forward ~ spot, so the drift term is dropped; a same-day expiry is treated as half a day). */
export function wing25(atmPct, dte) {
  if (!fin(atmPct) || atmPct <= 0 || !fin(dte) || dte < 0) return null;
  const s = atmPct / 100, sq = s * Math.sqrt(Math.max(dte, 0.5) / 365), h = 0.5 * sq * sq;
  return { put: (Math.exp(-D25 * sq + h) - 1) * 100, call: (Math.exp(D25 * sq + h) - 1) * 100 };
}

/**
 * A snapshot on the shared grid: { label, src, range, cols: m[NC], rows: [{ dte, exp, atmOnly, iv: (number|null)[NC], atm, put25: { m, iv } | null, call25 }] }.
 * A cell is null where that expiry has no quote at that moneyness (no extrapolation).
 */
export function buildSurface(snap, range, nc = NC) {
  const cols = Array.from({ length: nc }, (_, j) => r2(-range + (2 * range * j) / (nc - 1)));
  const rows = (snap?.rows ?? []).map(r => {
    const iv = cols.map(m => (r.atmOnly ? null : interpAt(r.pts, m)));
    const atm = fin(r.atm) ? r.atm : r.atmOnly ? null : interpAt(r.pts, 0), w = wing25(atm, r.dte);
    const at = m => { if (!w || r.atmOnly) return null; const v = interpAt(r.pts, m); return v == null || Math.abs(m) > range ? null : { m, iv: v }; };
    return { dte: r.dte, exp: r.exp ?? null, atmOnly: !!r.atmOnly, iv, atm: fin(atm) ? atm : null, put25: w ? at(w.put) : null, call25: w ? at(w.call) : null };
  });
  return { label: snap?.label ?? '', src: snap?.src ?? null, spot: snap?.spot ?? null, range, cols, rows };
}

/** Blend two surfaces row by row (by rank: nearest with nearest) at k in 0..1. A cell held by one side only shows that side's value from the half-way point (no invented in-between). */
export function lerpSurface(A, B, k, out) {
  const n = Math.max(A?.rows.length ?? 0, B?.rows.length ?? 0), nc = (A ?? B)?.cols.length ?? NC, kk = Math.max(0, Math.min(1, k));
  const L = (a, b) => (fin(a) && fin(b) ? a + (b - a) * kk : kk < 0.5 ? (fin(a) ? a : null) : (fin(b) ? b : null));
  const o = out ?? { rows: [] }; o.cols = (B ?? A).cols; o.range = (B ?? A).range; o.rows.length = n;
  for (let i = 0; i < n; i++) {
    const a = A?.rows[i], b = B?.rows[i], r = o.rows[i] ?? (o.rows[i] = { iv: new Array(nc).fill(null) });
    for (let j = 0; j < nc; j++) r.iv[j] = L(a?.iv[j], b?.iv[j]);
    r.atm = L(a?.atm, b?.atm); r.dte = (kk < 0.5 ? a ?? b : b ?? a).dte; r.atmOnly = (kk < 0.5 ? a ?? b : b ?? a).atmOnly;
    const w = s => { const pa = a?.[s], pb = b?.[s]; if (pa && pb) return { m: L(pa.m, pb.m), iv: L(pa.iv, pb.iv) }; return kk < 0.5 ? pa ?? null : pb ?? null; };
    r.put25 = w('put25'); r.call25 = w('call25');
  }
  return o;
}

/** The facts the labels and the narration use. Skew = 25-delta put vol minus 25-delta call vol on the nearest expiry (a day or more out, when one has both wings) that has both (vol points; positive = puts richer). */
export function surfaceFacts(S) {
  const rows = (S?.rows ?? []).filter(r => fin(r.atm)); if (!rows.length) return null;
  const near = rows[0], far = rows[rows.length - 1], slope = far.atm - near.atm;
  const both = (S.rows ?? []).filter(r => r.put25 && r.call25 && fin(r.put25.iv) && fin(r.call25.iv)), sk = both.find(r => r.dte >= 1) ?? both[0];   // a same-day expiry's wings sit a hair from the money, so the first expiry a day or more out is read
  const skew = sk ? r1(sk.put25.iv - sk.call25.iv) : null;
  return {
    near: { dte: near.dte, atm: r1(near.atm) }, far: { dte: far.dte, atm: r1(far.atm) }, nExp: rows.length, smileRows: (S.rows ?? []).filter(r => !r.atmOnly).length,
    shape: rows.length < 2 ? 'single' : slope > 0.5 ? 'upward' : slope < -0.5 ? 'inverted' : 'flat', slope: r1(slope),
    skew, skewDte: sk ? sk.dte : null, skewWord: skew == null ? null : skew > 0.3 ? 'puts richer than calls' : skew < -0.3 ? 'calls richer than puts' : 'puts and calls about level',
  };
}

export const dteText = d => (!fin(d) ? '?' : d < 0.5 ? 'same day' : `${Math.round(d)}d`);
const dayPhrase = d => (!fin(d) ? 'an unknown expiry' : d < 0.5 ? 'the same-day expiry' : `the ${Math.round(d)}-day expiry`);
const pctW = v => `${Math.abs(v) < 10 ? r1(v).toFixed(1) : Math.round(v)} percent`;

/** The SHOW narration for one market (2-4 plain sentences), or null. */
export function ivScript(f, name, srcWord) {
  if (!f) return null;
  const parts = [`The ${String(name ?? "").replace(/^the /i, "")} vol surface${srcWord ? `, from ${srcWord}` : ''}. At the money, ${dayPhrase(f.near.dte)} is priced at ${pctW(f.near.atm)}${f.nExp > 1 ? ` and ${dayPhrase(f.far.dte)} at ${pctW(f.far.atm)}` : ''}.`];
  if (f.shape === 'upward') parts.push('The term structure slopes upward: longer-dated options carry more vol, the usual calm shape.');
  else if (f.shape === 'inverted') parts.push('The term structure is inverted: near-dated options are dearer than far ones, which is how stress usually shows.');
  else if (f.shape === 'flat') parts.push('The term structure is roughly flat across these expiries.');
  if (f.skew != null) parts.push(Math.abs(f.skew) <= 0.3 ? 'The 25-delta puts and calls are priced about level.' : `The 25-delta ${f.skew > 0 ? 'puts are' : 'calls are'} ${Math.abs(f.skew).toFixed(1)} vol points richer than the ${f.skew > 0 ? 'calls' : 'puts'}, so ${f.skew > 0 ? 'downside protection costs more' : 'upside is in demand'}.`);
  parts.push('A description of what options are pricing, not a forecast.');
  return parts.join(' ');
}

/** The last n held days (ascending), for a short history. */
export const recentDays = (days, n = 6) => (Array.isArray(days) ? days.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-n) : []);

/** A sequential colour ramp position 0..1 for a vol (accent at 0, gold at the scale top); values above the top are 1 and flagged capped. */
export const rampPos = (v, top) => (!fin(v) || !(top > 0) ? 0 : Math.max(0, Math.min(1, v / top)));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' -> 'Thu 19 Nov' (UTC); anything else is returned as text. */
export const dayLabel = d => { const t = Date.parse(`${d}T00:00:00Z`); if (Number.isNaN(t)) return String(d ?? ''); const x = new Date(t); return `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONS[x.getUTCMonth()]}`; };
/** Tidy vol-axis ticks (percent) from 0 up to the scale top. */
export function volTicks(top) { if (!(top > 0)) return []; const s = top <= 4 ? 1 : top <= 10 ? 2 : top <= 25 ? 5 : top <= 60 ? 10 : 20, o = []; for (let v = s; v <= top + 1e-9; v += s) o.push(v); return o; }
