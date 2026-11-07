/**
 * Path sources (owner, 2026-11-06): the Options → Path view and /api/swing-map can draw the expiry walk from more than
 * the nightly CME capture.
 *
 *   cme       the nightly CME capture through the expiry tracker (the default; unchanged)
 *   cboe      Cboe's free delayed chain: GLD for gold (strikes mapped to XAU/USD, contracts to ounces), SPX for the
 *             S&P 500 and NDX for the Nasdaq (cash strikes moved onto the OANDA CFD by the measured CFD-cash offset)
 *   combined  the notional-weighted union of the two; expiries on the same date are merged into one book
 *
 * Every Cboe expiry is turned into the same one-night "series" the expiry tracker stores and run through the same
 * expiryView, so the walk (js/swingPaths.js zoneWalk) reads it exactly as it reads a CME expiry. Cboe's open interest is
 * the prior day's OCC figure (it moves once a morning); its prices, IV and volume move with every 15-minute pull, so
 * each Cboe expiry carries its at-the-money implied vol (`gammaVolDaily`) for the gamma weighting, and the centres move
 * intraday with spot and IV.
 *
 * Descriptive only. The gamma centre is UNDERPOWERED as a pull on price; more expiries do not change that.
 * Pure: no fetch, no I/O. Tested by js/pathSources.test.mjs.
 */
import { expiryView } from './expiryTracker.js';
import { cashRefTime } from './cboeChain.js';
import { PATH_HORIZON_DAYS, addDaysIso } from './pathSourceMeta.js';
export { PATH_HORIZON_DAYS, PATH_CORE_DAYS, PATH_SOURCES, SOURCE_IDS, normaliseSource, sourceChoices, sourceAsOf, addDaysIso, withinHorizon } from './pathSourceMeta.js';

const DAY = 864e5;
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const fin = v => v != null && Number.isFinite(+v);
const r = (x, dp = 6) => (Number.isFinite(x) ? +x.toFixed(dp) : null);

// ── GLD → XAU/USD ──
/** The live ratio XAU spot / GLD spot maps a GLD strike to an XAU/USD price; its inverse is the ounces of gold one GLD
 *  share stands for (about 0.09 after the fund's fees), so one contract (100 shares) is 100 / ratio ounces. Null when
 *  either price is missing or the ratio is implausible (outside 5..20: a wrong quote, not a real ratio). */
export function gldXauMap({ xauSpot, gldSpot } = {}) {
  if (!(xauSpot > 0) || !(gldSpot > 0)) return null;
  const ratio = xauSpot / gldSpot;
  if (!(ratio >= 5 && ratio <= 20)) return null;
  const ozPerShare = gldSpot / xauSpot;
  return { ratio: r(ratio, 6), ozPerShare: r(ozPerShare, 6), ozPerContract: r(100 * ozPerShare, 4), toXau: k => k * ratio };
}
/** Cash index strike → OANDA CFD price: × scale, then + the measured CFD − cash offset (null → uncorrected). */
export function indexCfdMap({ scale = 1, cfdOffset = null } = {}) {
  const d = fin(cfdOffset) ? +cfdOffset : 0;
  return k => k * scale + d;
}

// ── per-expiry pieces of a parsed Cboe chain (js/cboeChain.js parseCboeChain) ──
/** Contracts grouped by expiry date: Map(exp → contracts[]). Weekly and standard roots on the same date share a book. */
export function byExpiry(parsed) {
  const m = new Map();
  for (const c of parsed?.contracts ?? []) { if (!m.has(c.exp)) m.set(c.exp, []); m.get(c.exp).push(c); }
  return m;
}
/** At-the-money implied vol of one expiry: the mean IV of the calls and puts at the listed strike nearest spot. */
export function atmIv(contracts, spot) {
  const withIv = (contracts || []).filter(c => c.iv > 0 && c.K > 0);
  if (!withIv.length || !(spot > 0)) return null;
  const k = withIv.reduce((b, c) => (Math.abs(c.K - spot) < Math.abs(b - spot) ? c.K : b), withIv[0].K);
  const at = withIv.filter(c => c.K === k);
  return at.reduce((a, c) => a + c.iv, 0) / at.length;
}
/** Where today's traded volume concentrates in one expiry: the volume-weighted strike (mapped by `mapPx`), with the
 *  call and put volume. Descriptive, untested. Null when nothing has traded. */
export function volumeCentre(contracts, mapPx = k => k) {
  let v = 0, vk = 0, calls = 0, puts = 0;
  for (const c of contracts || []) {
    if (!(c.vol > 0) || !(c.K > 0)) continue;
    v += c.vol; vk += c.vol * mapPx(c.K);
    if (c.cp === 'C') calls += c.vol; else puts += c.vol;
  }
  return v > 0 ? { px: r(vk / v, 6), volume: v, calls, puts } : null;
}
/** One expiry's contracts → the ladder the expiry tracker stores: [[price, calls, puts]] in mapped terms, OI × `oiUnit`
 *  (ounces for GLD), strikes that map to the same price summed. */
export function cboeLadderRows(contracts, { mapPx = k => k, oiUnit = 1 } = {}) {
  const m = new Map();
  for (const c of contracts || []) {
    if (!(c.oi > 0) || !(c.K > 0)) continue;
    const px = r(mapPx(c.K), 6), row = m.get(px) ?? [px, 0, 0];
    if (c.cp === 'C') row[1] += c.oi * oiUnit; else row[2] += c.oi * oiUnit;
    m.set(px, row);
  }
  return [...m.values()].map(([k, c, p]) => [k, r(c, 2), r(p, 2)]).sort((a, b) => a[0] - b[0]);
}

/** The swing-map row for one expiry from its expiryView (the same fields the server builds for CME). */
export function swingExpiryRow(pair, v, { greeks = d => d?.greeks ?? null } = {}) {
  const d = v?.days?.at(-1); if (!d) return null;
  const firstDay = v.days[0];
  return { pair, expiry: v.expiry, code: v.code, dte: d.dte, date: d.date, stale: d.stale, totalOI: d.totalOI,
    totalOIFirst: firstDay?.totalOI ?? null, firstSeen: firstDay?.date ?? null, nights: v.n,
    centrePx: d.centrePx, centrePxFirst: firstDay?.centrePx ?? null, maxPain: d.maxPain,
    chgNearSpot: d.chgNearSpot, chgAwayFromSpot: d.chgAwayFromSpot, zones: d.zones, ladder: d.ladder ?? null,
    oiAbove: d.oiAbove, oiBelow: d.oiBelow, shareAbove: d.shareAbove, pullPct: d.pullPct,
    buildAbove: d.buildAbove, buildBelow: d.buildBelow, gamma: d.gamma ?? null, greeks: greeks(d),
    history: v.days.map(x => [x.date, x.dte, x.pullPct, x.shareAbove, x.buildAbove, x.buildBelow, x.totalOI, x.stale ? 1 : 0]) };
}

/** A one-night series in the expiry tracker's shape, so expiryView reads a Cboe (or merged) book like a CME one. */
//  The night is stamped on a weekday (expiryView drops a series whose every night is a weekend: a phantom capture);
//  days to expiry still count from `date` itself.
export function oneNightSeries({ pair, expiry, code = null, date, ref, ladder }) {
  const w = new Date(`${date}T12:00:00Z`).getUTCDay(), night = w === 6 ? addDaysIso(date, -1) : w === 0 ? addDaysIso(date, -2) : date;
  return { pair, expiry, code, inverted: false, first: night, last: night, n: 1,
    days: [{ date: night, dte: Math.max(0, dayDiff(expiry, date)), futures: ref, spot: ref, basis: 0, savedAtMs: null, ladder }] };
}

/**
 * A parsed Cboe chain → swing-map expiry rows inside the horizon, each read by expiryView.
 *  mapPx       strike → instrument price (GLD → XAU, cash → CFD)
 *  oiUnit      OI multiplier for the ladder (GLD: ounces per contract; indices: 1, contracts)
 *  unit        notional per ladder unit (for greeks' money value and the combined weighting)
 *  today       the server's date; dte = calendar days to expiry, as the CME capture counts it
 *  minOI       an expiry needs this much OI (ladder units) to be read
 * Each row adds: source, sourceLabel, oiUnit (name), unit, ivAtm, gammaVolDaily (ATM IV per session: the walk's
 * gamma weighting for this expiry), volCentre (today's volume centre, descriptive), roots.
 */
export function cboeExpiryRows(parsed, { pair, label, mapPx = k => k, oiUnit = 1, unit = 1, unitName = 'contracts', today, days = PATH_HORIZON_DAYS, minOI = 1 } = {}) {
  if (!parsed?.contracts?.length || !(parsed.spot > 0) || !today) return [];
  const ref = mapPx(parsed.spot), end = addDaysIso(today, days), out = [];
  for (const [exp, list] of [...byExpiry(parsed)].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (exp < today || exp > end) continue;
    const ladder = cboeLadderRows(list, { mapPx, oiUnit });
    if (ladder.length < 2 || ladder.reduce((a, x) => a + x[1] + x[2], 0) < minOI) continue;
    const iv = atmIv(list, parsed.spot);
    const v = expiryView(oneNightSeries({ pair, expiry: exp, code: `${label} ${exp.slice(2).replace(/-/g, '')}`, date: today, ref, ladder }),
      { topN: 6, sigmaAnnual: iv > 0 ? iv : null, withLadder: true });
    const row = swingExpiryRow(pair, v, { greeks: d => {
      const g = d?.greeks; if (!g) return null;
      return { ...g, contractSize: unit, charmNotional: g.charm1d * unit * ref, vannaNotional: g.vannaIvDn2 * unit * ref };
    } });
    if (!row) continue;
    out.push({ ...row, source: 'cboe', sourceLabel: label, oiUnit: unitName, unit, ivAtm: iv > 0 ? r(iv, 4) : null,
      gammaVolDaily: iv > 0 ? r(iv / Math.sqrt(252), 6) : null,
      volCentre: volumeCentre(list, mapPx), roots: [...new Set(list.map(c => c.root))].sort() });
  }
  return out;
}

/** A row with every open-interest figure multiplied by f (ladder, zones, totals): one source's units → notional. */
export function scaleRow(e, f) {
  if (!(f > 0) || f === 1) return { ...e };
  const m = x => (fin(x) ? x * f : x);
  return { ...e, totalOI: m(e.totalOI), totalOIFirst: m(e.totalOIFirst), oiAbove: m(e.oiAbove), oiBelow: m(e.oiBelow),
    buildAbove: m(e.buildAbove), buildBelow: m(e.buildBelow), chgNearSpot: m(e.chgNearSpot), chgAwayFromSpot: m(e.chgAwayFromSpot),
    ladder: e.ladder ? e.ladder.map(([k, c, p, c1, cf]) => [k, m(c), m(p), m(c1), m(cf)]) : e.ladder,
    zones: (e.zones || []).map(z => ({ ...z, oi: m(z.oi), call: m(z.call), put: m(z.put), chg1d: m(z.chg1d), chgSinceFirst: m(z.chgSinceFirst) })),
    history: (e.history || []).map(h => [h[0], h[1], h[2], h[3], m(h[4]), m(h[5]), m(h[6]), h[7]]) };
}

/**
 * The combined view: CME rows and Cboe rows weighted by notional (each source's OI × its unit) and joined by date.
 * An expiry date in one source only is kept as it is (scaled); a date in both is one book: the two ladders added
 * strike by strike in notional terms and read again by expiryView at `ref` (the anchor price), with the Cboe side's
 * IV kept for the gamma weighting. Rows carry source 'cme' | 'cboe' | 'combined' and a label ('CME', 'GLD', 'CME+GLD').
 *
 * The CME date can run ONE DAY LATE (the capture's DTE counts from the settlement before it; js/expiryTracker.js only
 * pulls weekend dates back, so a Monday or Wednesday weekly can land on Tuesday or Thursday). The Cboe date is exact (it
 * is in the OCC symbol). So a CME expiry with no Cboe book on its own date joins a Cboe book dated the day before, when
 * that book has no CME expiry of its own; the merged row takes the Cboe date.
 */
export function mergeSources({ cme = [], cboe = [], cmeUnit = 1, cboeUnit = 1, cboeLabel = 'Cboe', ref, today, pair = null } = {}) {
  const by = new Map(), cboeAt = new Map(cboe.map(e => [e.expiry, e])), cmeAt = new Set(cme.map(e => e.expiry));
  for (const e of cme) {
    const prev = addDaysIso(e.expiry, -1);
    const key = !cboeAt.has(e.expiry) && cboeAt.has(prev) && !cmeAt.has(prev) && !by.has(prev) ? prev : e.expiry;
    by.set(key, { cme: e });
  }
  for (const e of cboe) { const g = by.get(e.expiry) ?? {}; g.cboe = e; by.set(e.expiry, g); }
  const out = [];
  for (const [expiry, g] of [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (g.cme && !g.cboe) { out.push({ ...scaleRow(g.cme, cmeUnit), source: g.cme.source ?? 'cme', sourceLabel: g.cme.sourceLabel ?? 'CME', oiUnit: 'notional', unit: 1 }); continue; }
    if (g.cboe && !g.cme) { out.push({ ...scaleRow(g.cboe, cboeUnit), oiUnit: 'notional', unit: 1 }); continue; }
    const rows = new Map();
    const add = (l, f) => { for (const [k, c, p] of l || []) { const x = rows.get(k) ?? [k, 0, 0]; x[1] += (c || 0) * f; x[2] += (p || 0) * f; rows.set(k, x); } };
    add(g.cme.ladder, cmeUnit); add(g.cboe.ladder, cboeUnit);
    const ladder = [...rows.values()].sort((a, b) => a[0] - b[0]);
    const date = g.cboe.date ?? today ?? g.cme.date, at = fin(ref) && ref > 0 ? ref : (g.cme.ladder?.length ? g.cme.centrePx : g.cboe.centrePx);
    const sig = g.cboe.ivAtm > 0 ? g.cboe.ivAtm : g.cme.gamma?.sigmaAnnual ?? null;
    const v = expiryView(oneNightSeries({ pair: pair ?? g.cme.pair, expiry, code: [g.cme.code, g.cboe.code].filter(Boolean).join(' + '), date, ref: at, ladder }),
      { topN: 6, sigmaAnnual: sig, withLadder: true });
    const row = swingExpiryRow(pair ?? g.cme.pair, v, { greeks: () => null });
    if (!row) continue;
    out.push({ ...row, dte: g.cboe.dte ?? row.dte, history: scaleRow(g.cme, cmeUnit).history, source: 'combined', sourceLabel: `CME+${cboeLabel}`,
      oiUnit: 'notional', unit: 1, ivAtm: g.cboe.ivAtm ?? null, gammaVolDaily: g.cboe.gammaVolDaily ?? null, volCentre: g.cboe.volCentre ?? null,
      parts: { cme: { code: g.cme.code, expiry: g.cme.expiry, totalOI: g.cme.totalOI, notional: (g.cme.totalOI || 0) * cmeUnit }, cboe: { code: g.cboe.code, totalOI: g.cboe.totalOI, notional: (g.cboe.totalOI || 0) * cboeUnit } } });
  }
  return out;
}

// ── as-of labels ──
const nyDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
/** The date Cboe's open interest describes: OCC's figure from the close of the session before the quote's session
 *  (Cboe's OI moves once each morning). Weekends step back to Friday. */
export function occOiDate(asOfMs) {
  if (!Number.isFinite(asOfMs)) return null;
  let d = nyDate(cashRefTime(asOfMs));
  for (let k = 0; k < 7; k++) { d = addDaysIso(d, -1); const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w !== 0 && w !== 6) return d; }
  return d;
}

/** The extra expiries beyond the pre-registered window, flagged and given the same thin/share rule as buildSwingMap
 *  applies inside it (share of the core window's OI), so the core numbers are untouched. */
export function beyondCoreRows(rows, { coreOI, thinFloor = 0.10 } = {}) {
  return (rows || []).map(e => ({ ...e, beyondCore: true,
    oiShare: coreOI > 0 ? (e.totalOI || 0) / coreOI : null,
    thin: coreOI > 0 ? (e.totalOI || 0) < thinFloor * coreOI : true }));
}
