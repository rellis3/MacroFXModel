// js/terminal/moneyGlobeCore.js: the pure part of Jarvis's MONEY GLOBE (js/terminal/jarvisViewMoneyGlobe.js). No DOM, no fetch, no three.js. Tested in moneyGlobeCore.test.mjs.
//
// It shapes three answers for the globe:
//   ratesModel(/api/world-rates)  -> one light pillar per central bank (BIS WS_CBPOL, monthly): height = the policy rate on ONE shared linear scale (0..RATE_CAP %, above it the pillar stops and is
//                                    marked capped), colour = hiking / cutting / unchanged over 3 months (worldRates' own +-0.2 pp rule), a ring at the base whose AREA is the 12-month change.
//   creditModel(/api/bank-credit) -> BIS Locational Banking Statistics (quarterly, about four months late) as TOTALS: lender nations (the 'parents': their banks' cross-border USD claims) and
//                                    borrower countries (cross-border USD claims on them, the flow over the last four quarters). The BIS publishes no lender -> borrower matrix here, so the globe
//                                    never draws one: lenders rise to a shared "dollar pool" and the pool descends to borrowers.
//   gapsModel(ratesModel)         -> rate gaps between the lowest-rate funding currencies and the highest-rate liquid ones: an INCENTIVE, not a measured flow.
// Plus the places (a capital or financial centre per country), the camera regions, label picking and collision-free placement, card lines, the SHOW script and its camera stops.
// DESCRIPTION ONLY: every number here is a published level or change. Nothing is a forecast, a signal or a trade.
import { regimeOf } from '../bankCredit.js';

// ───────────────────────── places ─────────────────────────
/** [lat, lon, place] per ISO2 code (world-rates areas + BIS bank-credit codes). XM, the euro area, sits at the ECB in Frankfurt. */
export const PLACES = {
  US: [38.9, -77.0, 'Washington'], XM: [50.1, 8.7, 'Frankfurt'], GB: [51.5, -0.1, 'London'], JP: [35.7, 139.7, 'Tokyo'], CH: [47.4, 8.5, 'Zurich'], CA: [45.4, -75.7, 'Ottawa'],
  AU: [-33.9, 151.2, 'Sydney'], NZ: [-41.3, 174.8, 'Wellington'], SE: [59.3, 18.1, 'Stockholm'], NO: [59.9, 10.8, 'Oslo'], DK: [55.7, 12.6, 'Copenhagen'], BR: [-15.8, -47.9, 'Brasilia'],
  MX: [19.4, -99.1, 'Mexico City'], ZA: [-25.7, 28.2, 'Pretoria'], TR: [39.9, 32.9, 'Ankara'], AR: [-34.6, -58.4, 'Buenos Aires'], IN: [19.1, 72.9, 'Mumbai'], KR: [37.6, 127.0, 'Seoul'],
  CN: [39.9, 116.4, 'Beijing'], PL: [52.2, 21.0, 'Warsaw'], CZ: [50.1, 14.4, 'Prague'], HU: [47.5, 19.0, 'Budapest'], RU: [55.8, 37.6, 'Moscow'], CL: [-33.4, -70.7, 'Santiago'],
  CO: [4.7, -74.1, 'Bogota'], PE: [-12.0, -77.0, 'Lima'], ID: [-6.2, 106.8, 'Jakarta'], MY: [3.1, 101.7, 'Kuala Lumpur'], TH: [13.8, 100.5, 'Bangkok'], PH: [14.6, 121.0, 'Manila'],
  IL: [31.8, 35.2, 'Jerusalem'], IS: [64.1, -21.9, 'Reykjavik'], SA: [24.7, 46.7, 'Riyadh'], KW: [29.4, 48.0, 'Kuwait City'], HK: [22.3, 114.2, 'Hong Kong'], MA: [34.0, -6.8, 'Rabat'],
  MK: [42.0, 21.4, 'Skopje'], RO: [44.4, 26.1, 'Bucharest'], RS: [44.8, 20.5, 'Belgrade'], KY: [19.3, -81.4, 'Cayman Islands'], SG: [1.35, 103.8, 'Singapore'], AE: [25.2, 55.3, 'Dubai'],
  LU: [49.6, 6.1, 'Luxembourg'], IE: [53.3, -6.3, 'Dublin'], FR: [48.9, 2.35, 'Paris'], DE: [50.1, 8.7, 'Frankfurt'],
};
/** The euro members (ISO numeric, as js/worldRates.js EURO_MEMBERS) at their capitals, so the ECB's colour can tint them faintly. */
export const EURO_PLACES = {
  '040': [48.2, 16.4], '056': [50.8, 4.4], '191': [45.8, 16.0], '196': [35.2, 33.4], '233': [59.4, 24.7], '246': [60.2, 24.9], '250': [48.9, 2.35], '276': [52.5, 13.4], '300': [38.0, 23.7],
  '372': [53.3, -6.3], '380': [41.9, 12.5], '428': [56.9, 24.1], '440': [54.7, 25.3], '442': [49.6, 6.1], '470': [35.9, 14.5], '528': [52.4, 4.9], '620': [38.7, -9.1], '703': [48.1, 17.1],
  '705': [46.1, 14.5], '724': [40.4, -3.7],
};
/** Where the camera turns for each region button: [lat, lon, zoom]. */
export const REGIONS = { world: [22, 15, 1], americas: [16, -78, 1.2], europe: [47, 14, 1.4], asia: [24, 112, 1.2], 'mideast-africa': [12, 36, 1.25] };
export const REGION_LABEL = { world: 'WORLD', americas: 'AMERICAS', europe: 'EUROPE', asia: 'ASIA', 'mideast-africa': 'MIDEAST-AFRICA' };
export const REGION_SHORT = { world: 'WORLD', americas: 'AMER', europe: 'EUR', asia: 'ASIA', 'mideast-africa': 'ME-AF' };
export const G10 = ['US', 'XM', 'JP', 'GB', 'CH', 'CA', 'AU', 'NZ', 'SE', 'NO'];

// ───────────────────────── scales ─────────────────────────
export const RATE_CAP = 20;        // % : one shared linear height scale 0..20 %; Turkey / Argentina-level rates stop at the top and are marked capped
export const PILLAR_MAX = 0.6;     // globe radii at RATE_CAP
export const PILLAR_STUB = 0.014;  // a 0 % (or negative) rate is still a visible stub
export const RING_CAP = 4;         // pp : the 12-month-change ring stops growing here (marked capped)
export const RING_MAX = 0.12;      // globe radii at RING_CAP (ring AREA is proportional to |change|)
export const MOVE_PP = 0.2;        // the +-0.2 pp rule js/worldRates.js uses for hiking / cutting
export const GAP_CAP = 15;         // pp : the rate-gap arc stops thickening here (marked capped)
export const FUND_MAX = 1.0;       // % : a funding currency is one whose policy rate is at or below this (at least the two lowest are always taken)
export const FUNDER_SET = ['JP', 'CH', 'XM', 'SE', 'DK', 'GB', 'US', 'CA', 'AU', 'NZ', 'NO'];
export const TARGET_SET = ['US', 'GB', 'AU', 'NZ', 'NO', 'CA', 'MX', 'BR', 'ZA', 'TR', 'IN', 'ID', 'HU', 'PL', 'CZ', 'KR', 'CL', 'CO', 'IL', 'PE', 'PH', 'CN'];
export const POOL_Y = 1.62, POOL_R = 0.72;   // the "global dollar pool" ring above the north pole (globe radius 1)

const fin = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Unit-sphere vector for lat/lon (degrees), scaled to radius r. Same convention as jarvisCore.llToVec: lon 0 faces +z, north is +y. */
export function llVec(lat, lon, r = 1) { const a = lat * Math.PI / 180, o = lon * Math.PI / 180; return [r * Math.cos(a) * Math.sin(o), r * Math.sin(a), r * Math.cos(a) * Math.cos(o)]; }
/** Pillar height (globe radii) for a policy rate: linear on one shared scale, capped at RATE_CAP. */
export function pillarHeight(rate) {
  if (!fin(rate)) return { h: 0, capped: false, below: false, missing: true };
  const below = rate < 0, capped = rate > RATE_CAP;
  return { h: Math.max(PILLAR_STUB, clamp(rate, 0, RATE_CAP) / RATE_CAP * PILLAR_MAX), capped, below, missing: false };
}
/** Base ring radius (globe radii) for the 12-month change: AREA proportional to |change|, capped at RING_CAP. Under 0.05 pp there is no ring. */
export function ringRadius(d12) {
  if (!fin(d12) || Math.abs(d12) < 0.05) return { r: 0, capped: false, sign: 0 };
  return { r: RING_MAX * Math.sqrt(Math.min(Math.abs(d12), RING_CAP) / RING_CAP), capped: Math.abs(d12) > RING_CAP, sign: Math.sign(d12) };
}
/** 'up' (hiked over 3 months), 'dn' (cut), 'flat' (unchanged within +-0.2 pp), 'none' (no 3-month history). */
export const toneOf = d3 => (!fin(d3) ? 'none' : d3 >= MOVE_PP ? 'up' : d3 <= -MOVE_PP ? 'dn' : 'flat');
/** Linear width in px for a value against the biggest one: lo at 0, hi at vmax. */
export const lineWidth = (v, vmax, lo = 1.2, hi = 7) => (!fin(v) || !(vmax > 0) ? lo : lo + (hi - lo) * clamp(Math.abs(v) / vmax, 0, 1));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const backMonth = (period, n) => { const [y, m] = String(period).split('-').map(Number), d = new Date(Date.UTC(y, m - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
export const monthWord = p => { const m = /^(\d{4})-(\d{2})$/.exec(String(p ?? '')); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(p ?? ''); };
export const quarterWord = p => { const m = /^(\d{4})-Q([1-4])$/.exec(String(p ?? '')); return m ? `the ${['first', 'second', 'third', 'fourth'][+m[2] - 1]} quarter of ${m[1]}` : String(p ?? ''); };
/** The month of the last change in a monthly spark ending at asOf (null when the rate did not move inside the spark). */
export function lastMove(spark, asOf) {
  if (!Array.isArray(spark) || spark.length < 2 || !/^\d{4}-\d{2}$/.test(String(asOf ?? ''))) return null;
  for (let i = spark.length - 1; i > 0; i--) if (fin(spark[i]) && fin(spark[i - 1]) && Math.abs(spark[i] - spark[i - 1]) > 1e-9) return { period: backMonth(asOf, spark.length - 1 - i), by: +(spark[i] - spark[i - 1]).toFixed(2) };
  return null;
}
export const pp = v => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(2)}` : 'n/a');
export const pct = v => (fin(v) ? `${v.toFixed(2)}%` : 'n/a');
export const bn = v => (!fin(v) ? 'n/a' : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(2)}tn` : `$${Math.round(v)}bn`);
export const sbn = v => (!fin(v) ? 'n/a' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${bn(Math.abs(v))}`);
export const sg = v => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%` : 'n/a');

// ───────────────────────── RATES ─────────────────────────
/** /api/world-rates -> { ok, why?, asOf, banks: [...], by: {area: bank}, summary, euro } */
export function ratesModel(j) {
  if (!j || j.ok === false || !j.banks || typeof j.banks !== 'object') return { ok: false, why: j?.error ? `the BIS policy-rate feed answered: ${j.error}` : 'the BIS policy-rate feed is not available', banks: [], by: {} };
  const banks = [];
  for (const [k, b] of Object.entries(j.banks)) {
    const area = b?.area ?? k, pl = PLACES[area]; if (!pl || !fin(b?.rate)) continue;
    const ph = pillarHeight(b.rate), ring = ringRadius(b.change12m), tone = b.stale ? 'stale' : toneOf(b.change3m);
    banks.push({ area, name: b.name ?? area, ccy: b.ccy ?? area, rate: b.rate, ch3: fin(b.change3m) ? b.change3m : null, ch12: fin(b.change12m) ? b.change12m : null, cycle: b.cycle ?? 'unknown',
      stale: !!b.stale, asOf: b.asOf ?? null, lat: pl[0], lon: pl[1], place: pl[2], h: ph.h, capped: ph.capped, below: ph.below, ring: ring.r, ringCapped: ring.capped, ringSign: ring.sign, tone,
      move: lastMove(b.spark, b.asOf), g10: G10.includes(area) });
  }
  if (!banks.length) return { ok: false, why: 'the BIS policy-rate feed came back with no banks', banks: [], by: {} };
  const live = banks.filter(b => !b.stale), by = Object.fromEntries(banks.map(b => [b.area, b]));
  const summary = { n: live.length, hiking: live.filter(b => b.tone === 'up').length, cutting: live.filter(b => b.tone === 'dn').length, stale: banks.length - live.length };
  summary.hold = summary.n - summary.hiking - summary.cutting;
  const capped = banks.filter(b => b.capped).map(b => b.area);
  return { ok: true, asOf: j.asOf ?? banks.map(b => b.asOf).filter(Boolean).sort().at(-1) ?? null, banks, by, summary, capped, euro: by.XM ?? null, source: j.source ?? 'BIS central bank policy rates (WS_CBPOL), monthly' };
}
/** Which pillars carry a label: the G10, plus the biggest 3-month movers outside it (n), plus the selection. Order = priority. */
export function rateLabels(m, { compact = false, sel = null } = {}) {
  if (!m?.ok) return [];
  const live = m.banks.filter(b => !b.stale), movers = live.filter(b => !b.g10 && b.ch3 != null && Math.abs(b.ch3) >= MOVE_PP).sort((a, b) => Math.abs(b.ch3) - Math.abs(a.ch3) || a.area.localeCompare(b.area));
  const g10 = live.filter(b => b.g10).sort((a, b) => G10.indexOf(a.area) - G10.indexOf(b.area));
  const out = [...(sel && m.by[sel] ? [sel] : []), ...g10.slice(0, compact ? 6 : 10).map(b => b.area), ...movers.slice(0, compact ? 2 : 4).map(b => b.area)];
  return [...new Set(out)];
}
/** The 3-month hikers and cutters, biggest move first. */
export function movers(m) {
  const live = (m?.banks ?? []).filter(b => !b.stale && b.ch3 != null);
  return { hikers: live.filter(b => b.tone === 'up').sort((a, b) => b.ch3 - a.ch3), cutters: live.filter(b => b.tone === 'dn').sort((a, b) => a.ch3 - b.ch3) };
}

// ───────────────────────── BANK CREDIT ─────────────────────────
/** /api/bank-credit -> { ok, why?, quarter, firstSeen, usdG, regime, lenders, borrowers, biggestIn, biggestOut, denom } . Lenders and borrowers are separate TOTALS (no bilateral matrix). */
export function creditModel(j) {
  if (!j || j.ok === false || !j.headline) return { ok: false, why: j?.error ? `the BIS bank-credit record answered: ${j.error}` : 'the BIS bank-credit record is not available', lenders: [], borrowers: [] };
  const usdG = fin(j.headline.usdG) ? j.headline.usdG : null;
  const lendersRaw = (Array.isArray(j.parents) ? j.parents : []).filter(p => PLACES[p?.code] && fin(p?.usdBn) && p.usdBn > 0);
  const lmax = Math.max(0, ...lendersRaw.map(p => p.usdBn));
  const lenders = lendersRaw.map(p => {
    const g5 = fin(p.usdBn5yAgo) && p.usdBn5yAgo > 0 ? +((Math.pow(p.usdBn / p.usdBn5yAgo, 1 / 5) - 1) * 100).toFixed(2) : null;
    return { code: p.code, name: p.name ?? p.code, usdBn: p.usdBn, usdBn5yAgo: fin(p.usdBn5yAgo) ? p.usdBn5yAgo : null, g5, dir: g5 == null ? 'none' : g5 >= 0 ? 'out' : 'back', w: lineWidth(p.usdBn, lmax, 1.4, 7), share: lmax > 0 ? p.usdBn / lmax : 0,
      lat: PLACES[p.code][0], lon: PLACES[p.code][1], place: PLACES[p.code][2] };
  });
  const useUsd = Array.isArray(j.usdBorrowers) && j.usdBorrowers.length > 0, src = useUsd ? j.usdBorrowers : Array.isArray(j.borrowers) ? j.borrowers : [];
  const flowOf = b => (fin(b.flow4qBn) ? b.flow4qBn : null);
  const braw = src.filter(b => PLACES[b?.code] && (fin(b?.stockBn) || fin(b?.flow4qBn)));
  const bmax = Math.max(0, ...braw.map(b => Math.abs(flowOf(b) ?? 0)));
  const borrowers = braw.map(b => {
    const f = flowOf(b), dir = f == null ? (fin(b.g) ? (b.g >= 0 ? 'in' : 'out') : 'none') : f > 0 ? 'in' : f < 0 ? 'out' : 'none';
    return { code: b.code, name: b.name ?? b.code, stockBn: fin(b.stockBn) ? b.stockBn : null, flow4qBn: f, flowQBn: fin(b.flowQBn) ? b.flowQBn : null, g: fin(b.g) ? b.g : null, gPrev: fin(b.gPrev) ? b.gPrev : null,
      gYearAgo: fin(b.gYearAgo) ? b.gYearAgo : null, dir, w: lineWidth(f ?? 0, bmax, 1.2, 7.5), share: bmax > 0 && f != null ? Math.abs(f) / bmax : 0, lat: PLACES[b.code][0], lon: PLACES[b.code][1], place: PLACES[b.code][2] };
  });
  if (!lenders.length && !borrowers.length) return { ok: false, why: 'the BIS bank-credit record has no lender or borrower rows', lenders: [], borrowers: [] };
  const withF = borrowers.filter(b => b.flow4qBn != null), biggestIn = withF.filter(b => b.flow4qBn > 0).sort((a, b) => b.flow4qBn - a.flow4qBn)[0] ?? null, biggestOut = withF.filter(b => b.flow4qBn < 0).sort((a, b) => a.flow4qBn - b.flow4qBn)[0] ?? null;
  return { ok: true, quarter: j.latest ?? null, firstSeen: j.firstSeen ?? null, usdG, usdGPrev: fin(j.headline.usdGPrev) ? j.headline.usdGPrev : null, regime: regimeOf(usdG) ?? j.headline.regime ?? null,
    usdStockBn: fin(j.headline.usdStockBn) ? j.headline.usdStockBn : null, denom: useUsd ? 'USD' : 'all currencies', lenders, borrowers, biggestIn, biggestOut,
    source: j.source ?? 'BIS Locational Banking Statistics' };
}

// ───────────────────────── RATE GAPS ─────────────────────────
/** Funders (lowest policy rates among FUNDER_SET: every one at or below FUND_MAX, at least the two lowest) to the n highest-rate TARGET_SET banks (the high-rate ends). Stale banks are left out. */
export function gapsModel(m, { n = 5, fundMax = FUND_MAX } = {}) {
  if (!m?.ok) return { ok: false, why: m?.why ?? 'no policy rates', funders: [], targets: [], arcs: [] };
  const live = m.banks.filter(b => !b.stale);
  const cand = live.filter(b => FUNDER_SET.includes(b.area)).sort((a, b) => a.rate - b.rate || a.area.localeCompare(b.area));
  const funders = cand.filter((b, i) => b.rate <= fundMax || i < 2);
  const fset = new Set(funders.map(b => b.area));
  const targets = live.filter(b => TARGET_SET.includes(b.area) && !fset.has(b.area)).sort((a, b) => b.rate - a.rate || a.area.localeCompare(b.area)).slice(0, n);
  const arcs = [];
  for (const f of funders) for (const t of targets) {
    const gap = +(t.rate - f.rate).toFixed(2); if (!(gap > 0)) continue;
    arcs.push({ id: `${f.area}>${t.area}`, from: f.area, to: t.area, gap, capped: gap > GAP_CAP, w: lineWidth(Math.min(gap, GAP_CAP), GAP_CAP, 1, 4.5), np: Math.max(1, Math.round(1 + 6 * Math.min(gap, GAP_CAP) / GAP_CAP)) });
  }
  arcs.sort((a, b) => b.gap - a.gap);
  if (!funders.length || !targets.length || !arcs.length) return { ok: false, why: 'there is no positive rate gap among the liquid currencies', funders, targets, arcs: [] };
  return { ok: true, funders, targets, arcs, widest: arcs[0] };
}

// ───────────────────────── geometry (pure arrays) ─────────────────────────
/** Point on the dollar pool ring above a longitude. */
export const poolPoint = lon => { const o = lon * Math.PI / 180; return [POOL_R * Math.sin(o), POOL_Y, POOL_R * Math.cos(o)]; };
/** Quadratic Bezier at t. */
export const bez = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]; };
/** The control points of a fountain arc from a place on the globe up to the pool: { a, c, b } (a on the surface, b on the pool ring). */
export function poolArc(lat, lon) {
  const a = llVec(lat, lon, 1.005), b = poolPoint(lon), c = [a[0] * 1.55, a[1] * 1.55 + 0.38, a[2] * 1.55];
  return { a, c, b };
}
/** A great-circle arc between two places lifted off the sphere: n+1 points. The lift grows with the distance. */
export function gapArc(lat1, lon1, lat2, lon2, n = 48, lift = 0.32) {
  const a = llVec(lat1, lon1), b = llVec(lat2, lon2), dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1), om = Math.acos(dot), s = Math.sin(om) || 1e-9, out = [];
  const L = 1.006 + 0, hmax = lift * Math.min(1, om / 1.6 + 0.2);
  for (let i = 0; i <= n; i++) {
    const t = i / n, A = Math.sin((1 - t) * om) / s, B = Math.sin(t * om) / s, k = L + hmax * Math.sin(Math.PI * t);
    out.push([(A * a[0] + B * b[0]) * k, (A * a[1] + B * b[1]) * k, (A * a[2] + B * b[2]) * k]);
  }
  return out;
}
/** Camera yaw / elevation (radians) that put a lat/lon in the middle of the view (orbitPos convention: yaw = lon, elevation = lat). */
export const facing = (lat, lon) => ({ yaw: lon * Math.PI / 180, el: clamp(lat, -60, 70) * Math.PI / 180 });
/** Shortest signed angle from a to b. */
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ───────────────────────── labels ─────────────────────────
/** Greedy collision-free placement (highest pri first; each label tries nudges up and down, then a side shift). Returns the placed rects { id, x, y, w, h }. */
export function placeLabels(items, { W = 1280, H = 720, pad = 3, obstacles = [], step = 8, tries = 8, top = 0, bottom = 0 } = {}) {
  const placed = (obstacles ?? []).map(o => ({ ...o })), out = [];
  const hit = r => placed.some(p => r.x < p.x + p.w + pad && r.x + r.w + pad > p.x && r.y < p.y + p.h + pad && r.y + r.h + pad > p.y);
  const inside = r => r.x >= 2 && r.x + r.w <= W - 2 && r.y >= top && r.y + r.h <= H - bottom;
  for (const it of [...(items ?? [])].sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0))) {
    if (![it.x, it.y, it.w, it.h].every(fin)) continue;
    let done = null;
    for (let k = 0; k <= tries * 2 && !done; k++) {
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      for (const dx of [0, (it.side ?? 1) * 16]) { const r = { x: clamp(it.x + dx, 2, W - 2 - it.w), y: it.y + dy, w: it.w, h: it.h }; if (inside(r) && !hit(r)) { done = r; break; } }
    }
    if (done) { placed.push(done); out.push({ id: it.id, ...done }); }
  }
  return out;
}

// ───────────────────────── cards ─────────────────────────
/** Lines for the click card: { title, tone, lines: [[label, value]], foot }. kind = 'bank' | 'lender' | 'borrower'. */
export function cardFor(kind, code, { rates = null, credit = null } = {}) {
  if (kind === 'bank') {
    const b = rates?.by?.[code]; if (!b) return null;
    const lines = [['Policy rate', `${pct(b.rate)}${b.capped ? ` (above the ${RATE_CAP}% scale: capped)` : ''}`], ['Change over 3 months', `${pp(b.ch3)} pp`], ['Change over 12 months', `${pp(b.ch12)} pp`],
      ['Last move', b.move ? `${monthWord(b.move.period)} (${pp(b.move.by)} pp)` : 'none in the last 12 months'], ['Cycle', b.cycle]];
    if (b.area === 'XM') lines.push(['Covers', '20 euro members (faintly tinted)']);
    return { title: `${b.name.toUpperCase()} · ${b.ccy}`, tone: b.tone, lines, foot: `BIS WS_CBPOL, ${monthWord(b.asOf)}${b.stale ? ' · STALE: this bank has stopped reporting' : ''}` };
  }
  if (kind === 'lender') {
    const l = credit?.lenders?.find(x => x.code === code); if (!l) return null;
    return { title: `${l.name.toUpperCase()}'S BANKS · LENDER`, tone: l.dir === 'back' ? 'dn' : 'up', lines: [['Cross-border USD claims', bn(l.usdBn)], ['Five years earlier', bn(l.usdBn5yAgo)],
      ['Growth a year, over 5 years', sg(l.g5)], ['World USD credit', `${sg(credit.usdG)} a year (${credit.regime ?? 'n/a'})`]],
      foot: `BIS LBS by bank nationality, ${credit.quarter ?? ''} · a total: who they lend to is not published here` };
  }
  if (kind === 'borrower') {
    const b = credit?.borrowers?.find(x => x.code === code); if (!b) return null;
    return { title: `${b.name.toUpperCase()} · BORROWER`, tone: b.dir === 'out' ? 'dn' : b.dir === 'in' ? 'up' : 'flat', lines: [[`Cross-border ${credit.denom} credit owed`, bn(b.stockBn)],
      ['Flow, last 4 quarters', sbn(b.flow4qBn)], ['Flow, latest quarter', sbn(b.flowQBn)], ['Growth a year', sg(b.g)], ['A quarter earlier', sg(b.gPrev)], ['World USD credit', `${sg(credit.usdG)} (${credit.regime ?? 'n/a'})`]],
      foot: `BIS LBS, ${credit.quarter ?? ''} · a total: whose banks lent it is not published here` };
  }
  return null;
}

// ───────────────────────── SHOW ─────────────────────────
const nm = b => (b?.area === 'XM' ? 'the euro area' : b?.area === 'US' ? 'the United States' : b?.area === 'GB' ? 'Britain' : b?.name ?? '');
const nmC = b => (b?.code === 'US' ? 'the United States' : b?.code === 'GB' ? 'Britain' : b?.code === 'AE' ? 'the UAE' : b?.code === 'KY' ? 'the Cayman Islands' : b?.name ?? '');
const r1 = v => { const a = Math.abs(v); return a >= 10 ? String(Math.round(a)) : String(+a.toFixed(2)); };
const bnWord = v => { const a = Math.abs(v); return a >= 1000 ? `${+(a / 1000).toFixed(1)} trillion dollars` : `${Math.round(a)} billion dollars`; };
/** The narration: who hiked / cut, the notable moves, and from the BIS the pace of world dollar credit and the biggest inflow and outflow. Null when there is nothing to say. */
export function moneyScript(rm, cm) {
  const parts = [];
  if (rm?.ok) {
    const s = rm.summary, mv = movers(rm), h = mv.hikers[0], c = mv.cutters[0];
    let t = `Policy rates from the BIS, as of ${monthWord(rm.asOf)}: over three months ${s.cutting} of ${s.n} central banks have cut and ${s.hiking} ${s.hiking === 1 ? 'has' : 'have'} hiked.`;
    const notes = [];
    if (c) notes.push(`the biggest cut was ${nm(c)}'s, ${r1(c.ch3)} points to ${r1(c.rate)} percent`);
    if (h) notes.push(`${nm(h)} hiked ${r1(h.ch3)} points to ${r1(h.rate)} percent`);
    if (notes.length) t += ` ${notes.join('; ').replace(/^./, x => x.toUpperCase())}.`;
    parts.push(t);
  }
  if (cm?.ok && cm.usdG != null) {
    let t = `BIS bank data for ${quarterWord(cm.quarter)} show cross-border dollar credit growing ${r1(cm.usdG)} percent a year, a ${cm.regime} pace.`;
    if (cm.usdG < 0) t = `BIS bank data for ${quarterWord(cm.quarter)} show cross-border dollar credit shrinking ${r1(cm.usdG)} percent a year.`;
    const io = [];
    if (cm.biggestIn) io.push(`the biggest inflow went to ${nmC(cm.biggestIn)}, ${bnWord(cm.biggestIn.flow4qBn)} over four quarters`);
    if (cm.biggestOut) io.push(`the biggest outflow was from ${nmC(cm.biggestOut)}, ${bnWord(cm.biggestOut.flow4qBn)}`);
    if (io.length) t += ` ${io.join(', and ').replace(/^./, x => x.toUpperCase())}.`;
    parts.push(t);
  }
  if (!parts.length) return null;
  return `${parts.join(' ')} A description, not a forecast.`;
}
/** The broadcast figure: banks cutting over 3 months (or world USD credit growth when there are no rates). */
export function moneyFigure(rm, cm) {
  if (rm?.ok) return { value: String(rm.summary.cutting), label: `of ${rm.summary.n} central banks cut over 3 months` };
  if (cm?.ok && cm.usdG != null) return { value: sg(cm.usdG), label: `world cross-border USD credit, a year to ${cm.quarter}` };
  return null;
}
/** The countries the SHOW camera visits in turn: [{ layer, kind, code, lat, lon }]. Rates stops first, then credit. */
export function showStops(rm, cm) {
  const out = [], seen = new Set(), add = (layer, kind, code, lat, lon) => { const k = `${layer}:${code}`; if (seen.has(k) || !fin(lat)) return; seen.add(k); out.push({ layer, kind, code, lat, lon }); };
  if (rm?.ok) { const mv = movers(rm); for (const b of [mv.cutters[0], mv.hikers[0], rm.by.US]) if (b) add('rates', 'bank', b.area, b.lat, b.lon); }
  if (cm?.ok) for (const b of [cm.biggestIn, cm.biggestOut]) if (b) add('credit', 'borrower', b.code, b.lat, b.lon);
  return out;
}
/** Which stop is on at p (0..1): stops share the line evenly. */
export const stopAt = (n, p) => (n > 0 ? clamp(Math.floor(clamp(p, 0, 0.9999) * n), 0, n - 1) : -1);
