// js/terminal/gammaHoloCore.js: the pure half of Jarvis's two gamma holograms, GAMMA PILLAR (today's option book as a glass column) and GAMMA TERRAIN (net dealer gamma by strike over the last weeks).
// No DOM, no fetch, no three.js: it shapes the API replies into what the views draw and say.
//
//   PILLAR   today's /api/oi-store entry goes through jarvisGammaCore.buildLadder (48 strike bins: call and put open interest, net gamma, flip, walls, max pain); this file adds the regime split
//            (which side of the flip the net gamma is positive on), the 20-capture spot trail from /api/oi-history, price ticks and the spoken line.
//   TERRAIN  /api/oi-history-raw keeps each day's RAW strike ladder (rawOI: the QuikStrike strike x expiry matrix as text, plus spot, basis and the primary expiry's DTE). Net gamma per strike per day is
//            rebuilt here exactly as js/oi.js rebuildGexProfile does it (the server's self-heal path): parse the matrix, take the primary expiry (most near-the-money open interest), shift strikes
//            by the stored basis (1/strike - basis for the inverted FX futures, with calls and puts swapped into pair terms as the analyser does by default), then Black-Scholes gamma at FLAT vol
//            and T = that day's DTE: netGex = (callOI - putOI) x gamma x contract size x spot. js/oi.js is not imported because it pulls the app's state and DOM modules; the test checks parity with it.
//            If a day's ladder cannot be parsed, that day falls back to the archived summary's top-8 call and put walls (open interest, not gamma) and the view says so.
// DESCRIPTION ONLY. Where open interest sits and the gamma it implies; the repo's own studies found no proven direction from these levels. Nothing here is a forecast, a signal or a target.
import { GAMMA_MARKETS, buildLadder, fmtPx } from './jarvisGammaCore.js';
import { spoken } from './showCore.js';

export const fin = v => typeof v === 'number' && Number.isFinite(v);
export const TERRAIN_NX = 64;
export const TERRAIN_DAYS = 60;
export const TRAIL_DAYS = 20;
export const MIN_DAYS = 5;
export const CAP_Q = 0.97;               // terrain heights are scaled to the 97th percentile of |net gamma|; taller cells are capped and flagged

// ───────────── instrument constants (mirrors js/oi.js for the markets Jarvis shows) ─────────────
const IDX = { NAS100_USD: 20, SPX500_USD: 50, US30_USD: 5, US2000_USD: 50, DE30_USD: 25, UK100_GBP: 10 };
/** CME quotes 6J/6C/6S in USD per foreign unit, so those strikes are inverted (1/strike) into pair terms. */
export const isInverted = pair => pair === 'USD/JPY' || pair === 'USD/CAD' || pair === 'USD/CHF' || String(pair ?? '').includes('JPY');
/** The flat annual vol js/oi.js prices gamma with when no smile is used: indices 20%, gold 18%, FX 12%. */
export const flatVol = pair => (pair in IDX ? 0.2 : String(pair ?? '').includes('XAU') ? 0.18 : 0.12);
/** Contract multiplier (oi.js oiContractSize). A constant per market, so it never changes a shape, only the units. */
export const contractSize = pair => IDX[pair] ?? (String(pair ?? '').includes('XAU') ? 100 : 125000);
const erfless = (k, s, sig, T) => { const d1 = (Math.log(s / k) + 0.5 * sig * sig * T) / (sig * Math.sqrt(T)); return Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI) / (s * sig * Math.sqrt(T)); };
/** Black-Scholes gamma (no rates), as oiGreeks computes it. */
export const bsGamma = (strike, spot, sigma, T) => (strike > 0 && spot > 0 && sigma > 0 && T > 0 ? erfless(strike, spot, sigma, T) : 0);

// ───────────── the raw ladder parse (mirrors oi.js _matrixRows + pickPrimaryExpiry + oiParseTable) ─────────────
const num = s => parseFloat(String(s ?? '').replace(/,/g, ''));
function matrix(raw) {
  const lines = String(raw).split('\n');
  let hdr = -1;
  for (let i = 0; i < lines.length; i++) { const c = lines[i].split('\t').map(s => s.trim()).filter(Boolean); if (c.length >= 4 && c.every(x => x === 'C' || x === 'P')) { hdr = i; break; } }
  if (hdr < 0) return null;
  let futures = null; const dtes = [];
  for (let i = 0; i < hdr; i++) {
    if (futures == null) for (const tok of lines[i].split('\t')) { const t = tok.replace(/,/g, '').trim(); if (!/^-?\d+(\.\d+)?$/.test(t)) continue; const n = parseFloat(t); if (n > 0 && n < 1e7) { futures = n; break; } }
    const m = lines[i].match(/(-?\d+)\s*DTE/g); if (m) for (const t of m) dtes.push(parseInt(t, 10));
  }
  const rows = [];
  for (let i = hdr + 1; i < lines.length && rows.length < 4000; i++) {
    const cells = lines[i].split('\t'), strike = num(cells[0]); if (!fin(strike) || strike <= 0 || strike > 1e7) continue;
    const cp = []; for (let j = 1; j < cells.length; j += 2) { const c = num(cells[j]), p = num(cells[j + 1]); cp.push([fin(c) ? c : 0, fin(p) ? p : 0]); }
    rows.push({ strike, cp });
  }
  return rows.length ? { futures, dtes, rows } : null;
}
function primaryIndex(rows, dtes, anchor) {
  const nExp = Math.max(0, ...rows.map(r => r.cp.length)); if (nExp <= 1) return 0;
  const ss = rows.map(r => r.strike).sort((a, b) => a - b), lo = ss[0], hi = ss[ss.length - 1];
  let anc = fin(anchor) ? anchor : null; if (anc == null || !(anc >= lo * 0.5 && anc <= hi * 1.5)) anc = ss[Math.floor(ss.length / 2)];
  const band = Math.abs(anc) * 0.03, near = new Array(nExp).fill(0), tot = new Array(nExp).fill(0);
  for (const r of rows) { const nr = Math.abs(r.strike - anc) <= band; for (let e = 0; e < nExp; e++) { const oi = Math.abs(r.cp[e]?.[0] ?? 0) + Math.abs(r.cp[e]?.[1] ?? 0); tot[e] += oi; if (nr) near[e] += oi; } }
  const sc = near.some(v => v > 0) ? near : tot; let best = 0;
  for (let e = 1; e < nExp; e++) { if (sc[e] > sc[best]) best = e; else if (sc[e] === sc[best] && fin(dtes[e]) && fin(dtes[best]) && dtes[e] < dtes[best]) best = e; }
  return best;
}
/** A raw ladder string -> { strikes, calls, puts, futures, dte } for the primary expiry (matrix) or the simple "strike call put" table; null when fewer than 2 strikes parse. */
export function parseLadder(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const m = matrix(raw);
  if (m) {
    const e = primaryIndex(m.rows, m.dtes, m.futures), strikes = [], calls = [], puts = [];
    for (const r of m.rows) { const c = Math.abs(r.cp[e]?.[0] ?? 0), p = Math.abs(r.cp[e]?.[1] ?? 0); if (c === 0 && p === 0) continue; strikes.push(r.strike); calls.push(c); puts.push(p); }
    return strikes.length >= 2 ? { strikes, calls, puts, futures: m.futures, dte: m.dtes[e] ?? null } : null;
  }
  const strikes = [], calls = [], puts = [];
  for (const line of raw.split('\n').slice(0, 8000)) {
    let row = line.trim(); if (!row || row.length < 3) continue; if (!/^\d/.test(row) && /[A-Za-z]/.test(row)) continue;
    row = row.replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trim();
    const nums = row.split(' ').slice(0, 50).map(num).filter(n => !Number.isNaN(n)); if (nums.length < 3) continue;
    const [k, c, p] = nums; if (k < 0.001 || k > 1e6 || Math.abs(c) > 5e6 || Math.abs(p) > 5e6) continue;
    strikes.push(k); calls.push(Math.abs(c)); puts.push(Math.abs(p));
  }
  return strikes.length >= 2 ? { strikes, calls, puts, futures: null, dte: null } : null;
}

/**
 * One archived day's per-strike profile, rebuilt the way oi.js rebuildGexProfile does: [{ strike, callOI, putOI, netGex }] sorted by strike, or null.
 * entry = an /api/oi-history-raw history row { rawOI, spot, basis, dte }. swap (default: the pair is an inverted future) flips calls and puts into pair terms.
 */
export function rawDayProfile(entry, pair, { swap } = {}) {
  const P = parseLadder(entry?.rawOI); if (!P) return null;
  const basis = fin(entry.basis) ? entry.basis : 0, inv = isInverted(pair);
  const strikes = basis !== 0 ? P.strikes.map(s => (inv ? 1 / s - basis : s - basis)) : P.strikes.slice();
  let calls = P.calls, puts = P.puts; if (swap ?? inv) [calls, puts] = [puts, calls];
  const spot = fin(entry.spot) && entry.spot > 0 ? entry.spot : strikes[Math.floor(strikes.length / 2)];
  const T = Math.min(365, Math.max(1, fin(entry.dte) && entry.dte > 0 ? entry.dte : 14)) / 365, sig = flatVol(pair), cs = contractSize(pair);
  return strikes.map((s, i) => { const g = bsGamma(s, spot, sig, T), cg = (calls[i] || 0) * g * cs * spot, pg = (puts[i] || 0) * g * cs * spot; return { strike: s, callOI: calls[i] || 0, putOI: puts[i] || 0, netGex: cg - pg }; })
    .filter(r => fin(r.strike) && fin(r.netGex)).sort((a, b) => a.strike - b.strike);
}

/** Where net gamma changes sign (linear interpolation between strikes), the crossing nearest spot (gammaFlow.gammaFlip). null when it never crosses. */
export function flipOf(profile, spot) {
  const gp = (Array.isArray(profile) ? profile : []).filter(r => fin(r?.strike) && fin(r?.netGex)).sort((a, b) => a.strike - b.strike), hits = [];
  for (let i = 1; i < gp.length; i++) { const a = gp[i - 1].netGex, b = gp[i].netGex; if (a === 0 || Math.sign(b) === Math.sign(a)) continue; const t = Math.abs(a) / (Math.abs(a) + Math.abs(b)); hits.push({ price: gp[i - 1].strike + t * (gp[i].strike - gp[i - 1].strike), mag: Math.abs(a) + Math.abs(b) }); }
  if (!hits.length) return null;
  return (fin(spot) ? hits.reduce((m, h) => (Math.abs(h.price - spot) < Math.abs(m.price - spot) ? h : m)) : hits.reduce((m, h) => (h.mag > m.mag ? h : m))).price;
}

export const isWeekday = d => { const x = new Date(`${d}T12:00:00Z`).getUTCDay(); return x !== 0 && x !== 6; };
const histRows = j => (Array.isArray(j?.history) ? j.history : Array.isArray(j) ? j : []).filter(r => r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
const wallList = a => (Array.isArray(a) ? a.filter(w => fin(w?.strike) && fin(w?.oi) && w.oi > 0).map(w => ({ strike: w.strike, oi: w.oi })) : []);

/** The spot trail beside the pillar: the last n weekday captures from /api/oi-history -> [{ date, spot, callWall, putWall }] (oldest first). */
export function spotTrail(sumJson, n = TRAIL_DAYS) {
  return histRows(sumJson).filter(r => isWeekday(r.date) && fin(r.spot) && r.spot > 0).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-n)
    .map(r => ({ date: r.date, spot: r.spot, callWall: fin(r.callWall) && r.callWall > 0 ? r.callWall : null, putWall: fin(r.putWall) && r.putWall > 0 ? r.putWall : null }));
}

/**
 * The days of the terrain: raw ladders joined with the archived summaries by date, weekdays only, newest last, at most maxDays.
 * Each: { date, spot, prof (rebuilt profile | null), flip (rebuilt zero crossing nearest spot | null), callWall, putWall, maxPain, gammaFlip (the server's, from the summary), calls, puts (summary top walls) }.
 */
export function terrainDays(rawJson, sumJson, pair, { maxDays = TERRAIN_DAYS } = {}) {
  const sum = new Map(histRows(sumJson).map(r => [r.date, r])), raw = new Map(histRows(rawJson).map(r => [r.date, r]));
  const dates = [...new Set([...sum.keys(), ...raw.keys()])].filter(isWeekday).sort().slice(-maxDays), out = [];
  for (const d of dates) {
    const r = raw.get(d) ?? null, s = sum.get(d) ?? null, spot = fin(r?.spot) && r.spot > 0 ? r.spot : fin(s?.spot) && s.spot > 0 ? s.spot : null; if (spot == null) continue;
    let prof = null; try { prof = r ? rawDayProfile({ ...r, spot }, pair) : null; } catch (e) { prof = null; }
    if (prof && !prof.some(x => x.callOI > 0 || x.putOI > 0)) prof = null;
    const pos = v => (fin(v) && v > 0 ? v : null);
    out.push({ date: d, spot, prof, flip: prof ? flipOf(prof, spot) : null, callWall: pos(s?.callWall), putWall: pos(s?.putWall), maxPain: pos(s?.maxPain), gammaFlip: pos(s?.gammaFlip), calls: wallList(s?.callWalls), puts: wallList(s?.putWalls) });
  }
  return out;
}

const quant = (a, q) => { if (!a.length) return null; const s = Float64Array.from(a).sort(), x = (s.length - 1) * q, i = Math.floor(x), f = x - i; return s[i] + ((s[Math.min(s.length - 1, i + 1)] ?? s[i]) - s[i]) * f; };

/**
 * The terrain grid. mode 'gamma' when at least half the days rebuilt a profile (heights = net gamma, rows that did not rebuild are flagged missing and flat), else 'oi' when the summaries carry
 * walls (heights = top-8 call walls up, put walls down: open interest, not gamma), else null. Result: { mode, nd, nx, lo, hi, xs (bin centres), h (Float32Array nd*nx in -1..1, row = day),
 * capped (Uint8Array, 1 where |value| exceeded the scale and was clipped), missing (per day), scale, days }.
 */
export function buildTerrain(days, { nx = TERRAIN_NX } = {}) {
  const D = Array.isArray(days) ? days.filter(d => fin(d?.spot)) : [], nd = D.length;
  if (!nd) return null;
  const nProf = D.filter(d => d.prof).length, haveWalls = D.some(d => d.calls.length || d.puts.length);
  const mode = nProf > 0 && nProf * 2 >= nd ? 'gamma' : haveWalls ? 'oi' : nProf > 0 ? 'gamma' : null; if (!mode) return null;
  // the price window: where the open interest sits around spot (3%..97% of each day's weight, as a fraction of spot, clamped to 1%..12%), medians over days, around the full spot range
  const fl = [], fu = [];
  for (const d of D) {
    const pts = mode === 'gamma' && d.prof ? d.prof.map(r => [r.strike, r.callOI + r.putOI]) : [...d.calls.map(w => [w.strike, w.oi]), ...d.puts.map(w => [w.strike, w.oi])];
    const s = pts.filter(p => fin(p[0]) && p[1] > 0 && Math.abs(p[0] / d.spot - 1) < 0.3).sort((a, b) => a[0] - b[0]); const tot = s.reduce((a, p) => a + p[1], 0); if (!tot) continue;
    let acc = 0, qa = null, qb = null; for (const [k, w] of s) { acc += w; if (qa == null && acc >= tot * 0.03) qa = k; if (qb == null && acc >= tot * 0.97) qb = k; }
    fl.push(Math.min(0.12, Math.max(0.01, 1 - qa / d.spot))); fu.push(Math.min(0.12, Math.max(0.01, qb / d.spot - 1)));
  }
  const sMin = Math.min(...D.map(d => d.spot)), sMax = Math.max(...D.map(d => d.spot)), wl = quant(fl, 0.5) ?? 0.04, wu = quant(fu, 0.5) ?? 0.04;
  const lo = sMin * (1 - wl), hi = sMax * (1 + wu), w = (hi - lo) / nx, xs = new Float64Array(nx); for (let i = 0; i < nx; i++) xs[i] = lo + (i + 0.5) * w;
  const raw = new Float64Array(nd * nx), missing = D.map(d => mode === 'gamma' && !d.prof), row = new Float64Array(nx);
  D.forEach((d, j) => {
    row.fill(0);
    const add = (k, v) => { if (!(k >= lo && k < hi) || !fin(v)) return; row[Math.min(nx - 1, Math.floor((k - lo) / w))] += v; };
    if (mode === 'gamma') { if (d.prof) for (const r of d.prof) add(r.strike, r.netGex); }
    else { for (const c of d.calls) add(c.strike, c.oi); for (const p of d.puts) add(p.strike, -p.oi); }
    for (let i = 0; i < nx; i++) raw[j * nx + i] = mode === 'gamma' ? (row[Math.max(0, i - 1)] + 2 * row[i] + row[Math.min(nx - 1, i + 1)]) / 4 : row[i];
  });
  const mags = []; for (const v of raw) if (v !== 0) mags.push(Math.abs(v));
  const scale = mags.length ? Math.max(quant(mags, CAP_Q), 1e-300) : 1, h = new Float32Array(nd * nx), capped = new Uint8Array(nd * nx);
  for (let k = 0; k < raw.length; k++) { const v = raw[k] / scale; if (Math.abs(v) > 1) { capped[k] = 1; h[k] = Math.sign(v); } else h[k] = v; }
  return { mode, nd, nx, lo, hi, w, xs, h, capped, missing, scale, days: D };
}
/** The terrain height (-1..1) of day row j at a price, interpolated between bin centres; 0 outside the window. */
export function heightAt(T, j, price) {
  if (!T || !fin(price) || j < 0 || j >= T.nd) return 0; const f = (price - T.lo) / T.w - 0.5; if (f < -0.5 || f > T.nx - 0.5) return 0;
  const i = Math.max(0, Math.min(T.nx - 1, Math.floor(f))), k = Math.min(T.nx - 1, i + 1), t = Math.max(0, Math.min(1, f - i)); return T.h[j * T.nx + i] * (1 - t) + T.h[j * T.nx + k] * t;
}

// ───────────── the pillar ─────────────
/** Today's pillar for one store entry: buildLadder's ladder plus which side of the flip carries positive net gamma (aboveLong) and the bin regimes. null without a ladder. */
export function buildPillar(entry, pair) {
  let L = null; try { L = buildLadder({ ...(entry ?? {}), pair }); } catch (e) { L = null; } if (!L) return null;
  let up = 0, dn = 0; const n = L.n;
  if (L.flip != null) for (let i = 0; i < n; i++) (L.strikes[i] >= L.flip ? (up += L.net[i]) : (dn += L.net[i]));
  const aboveLong = L.flip != null ? up >= dn : null;
  // one regime per bin: with a flip, the side; without one, the sign of the (smoothed) net gamma near spot for the whole column
  const longAt = k => (L.flip != null ? (k >= L.flip) === aboveLong : L.long);
  return { ...L, aboveLong, longAt, total: { call: L.call.reduce((a, b) => a + b, 0), put: L.put.reduce((a, b) => a + b, 0) } };
}

/** Round price ticks between lo and hi, about n of them. */
export function niceTicks(lo, hi, n = 6) {
  if (!fin(lo) || !fin(hi) || !(hi > lo)) return []; const raw = (hi - lo) / Math.max(1, n), p = 10 ** Math.floor(Math.log10(raw)), m = raw / p, st = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9 && out.length < 50; v += st) out.push(+v.toPrecision(12)); return out;
}

/**
 * Label collision avoidance in one dimension: items [{ y, h? }] (screen y, wanted) get .ly so that no two are closer than gap, staying inside [top, bottom] and in their original order.
 * Items that cannot fit are marked .hide = true (lowest priority first: an item may carry .pri, higher kept).
 */
export function dodge(items, { gap = 16, top = 0, bottom = Infinity } = {}) {
  const live = items.filter(it => fin(it?.y)); for (const it of items) { it.hide = !fin(it?.y); it.ly = it.y; }
  const room = Math.max(0, Math.floor((bottom - top) / gap) + 1);
  if (live.length > room) { const keep = new Set([...live].sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0)).slice(0, room)); for (const it of live) if (!keep.has(it)) it.hide = true; }
  const L = live.filter(it => !it.hide).sort((a, b) => a.y - b.y); if (!L.length) return items;
  for (const it of L) it.ly = Math.max(top, Math.min(bottom, it.y));
  for (let i = 1; i < L.length; i++) if (L[i].ly < L[i - 1].ly + gap) L[i].ly = L[i - 1].ly + gap;
  if (L[L.length - 1].ly > bottom) { L[L.length - 1].ly = bottom; for (let i = L.length - 2; i >= 0; i--) if (L[i].ly > L[i + 1].ly - gap) L[i].ly = L[i + 1].ly - gap; }
  return items;
}

export const metaOf = key => GAMMA_MARKETS.find(m => m.key === key) ?? null;
/** The market the SHOW talks about: ES/SPX when it has a book, else the first one with data. */
export const pickMain = avail => ['NQ', 'GOLD', 'SPX500'].map(k => (avail ?? []).find(m => m.key === k)?.key).find(Boolean) ?? avail?.[0]?.key ?? null;      // the markets the desk trades first (owner, 26 Nov 2026)
export const fmtDay = d => { const x = new Date(`${d}T12:00:00Z`); return Number.isNaN(+x) ? String(d ?? '') : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const say = v => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(Math.abs(v) >= 10 ? 2 : 4));
const pctOf = (v, spot) => { const p = Math.abs((v - spot) / spot * 100); return `${p < 10 ? p.toFixed(1) : Math.round(p)} percent`; };

/** True for a currency pair (the gamma-range result is an equity-index one: Evidence Book gex-range-es, "FX still does not carry it"). */
export const isFxKey = k => /^(EUR|GBP|AUD|NZD|USD)(USD|JPY|CAD|CHF)$/.test(String(k ?? '')) && k !== 'USDUSD';
/** The open-interest capture date in words ("26 Nov"), from an oi-store savedAt; null without one. */
export const oiDateWords = savedAt => { const d = String(savedAt ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDay(d) : null; };
/** The SHOW line for the pillar: where spot sits against the flip and the walls, plain words, at most ~60 words, one caveat. null without a ladder. */
export function pillarScript(P, key) {
  if (!P || !fin(P.spot)) return null; const who = spoken(key), s = [];
  if (P.flip != null) {
    const above = P.spot >= P.flip, long = P.longAt(P.spot);
    s.push(`In ${who} options, spot is ${say(P.spot)}, ${pctOf(P.flip, P.spot)} ${above ? 'above' : 'below'} the gamma flip at ${say(P.flip)}, in the zone where dealers are modelled ${long ? 'long gamma, where moves have tended to be damped' : 'short gamma, where moves have tended to be amplified'}.`);
  } else s.push(`In ${who} options, spot is ${say(P.spot)} and the book shows no gamma flip nearby.`);
  const w = []; if (P.callWall) w.push(`the biggest call wall is ${say(P.callWall.strike)}, ${pctOf(P.callWall.strike, P.spot)} ${P.callWall.strike >= P.spot ? 'above' : 'below'}`);
  if (P.putWall) w.push(`the biggest put wall is ${say(P.putWall.strike)}, ${pctOf(P.putWall.strike, P.spot)} ${P.putWall.strike >= P.spot ? 'above' : 'below'}`);
  if (w.length) s.push(`${w.join(', and ')}.`.replace(/^t/, 'T'));
  if (P.flip != null) s.push(`In our tests the gamma regime has been a guide to the size of the day, not its direction, so ${P.longAt(P.spot) ? 'a tighter day is the likelier shape' : 'allow for a wider day'}.`);
  // Helix review wave 1.9, side by side with the wording above (kept as it is): the FX qualifier in its own sentence, and the capture date of the open interest
  if (P.flip != null && isFxKey(key)) s.push('That test is on equity indices; in currencies the gamma regime has not carried it.');
  const od = oiDateWords(P.savedAt); if (od) s.push(`The open interest is from the ${od} capture.`);
  s.push('A description of positioning, not a forecast.');
  return s.join(' ');
}

/** The SHOW line for the terrain: how the walls, the flip and spot moved over the window (from the archived summaries). null with fewer than 2 days. */
export function terrainScript(days, key) {
  const D = (days ?? []).filter(d => fin(d?.spot)); if (D.length < 2) return null;
  const a = D[0], b = D[D.length - 1], n = D.length, parts = [];
  const mv = (name, x, y) => { if (!fin(x) || !fin(y)) return null; return Math.abs(y - x) / Math.max(1e-12, Math.abs(x)) < 0.002 ? `the ${name} held near ${say(y)}` : `the ${name} moved from ${say(x)} to ${say(y)}`; };
  const first = f => D.find(d => fin(d[f]))?.[f], last = f => [...D].reverse().find(d => fin(d[f]))?.[f];
  for (const [nm, f] of [['call wall', 'callWall'], ['put wall', 'putWall'], ['gamma flip', 'gammaFlip']]) { const p = mv(nm, first(f), last(f)); if (p) parts.push(p); }
  const sp = `spot went from ${say(a.spot)} to ${say(b.spot)}`;
  const body = parts.length ? `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}, while ${sp}` : sp;
  return `Over the last ${n} captures of ${spoken(key)} options, ${body}. A record of where positioning sat, not a signal.`;
}
export { fmtPx };

/**
 * 2D label placement: the first candidate box { x, y, w, h } (top-left origin) that stays inside bounds { x0, y0, x1, y1 } and overlaps none of the boxes in taken (pad px apart).
 * The chosen box is pushed onto taken and returned; null when every candidate collides (the label is then not drawn).
 */
export function placeBox(cands, taken, bounds = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, pad = 3) {
  const hit = (a, b) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  for (const c of cands ?? []) { if (![c?.x, c?.y, c?.w, c?.h].every(fin)) continue; if (c.x < bounds.x0 || c.y < bounds.y0 || c.x + c.w > bounds.x1 || c.y + c.h > bounds.y1) continue; if (taken.some(t => hit(c, t))) continue; taken.push(c); return c; }
  return null;
}
