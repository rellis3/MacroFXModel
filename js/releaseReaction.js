/**
 * Expectations against reality (owner, 2026-11-04, build list item 2).
 *
 * For every high-impact release the live surprise reader logs (js/surpriseReader.js), measure the market's ACTUAL move
 * 30 minutes and 4 hours after the print in the release's markets (the US 2y note, the currency pair or pairs, gold,
 * the equity index; OANDA M1, % of the price at the release minute, the release study's own unit), and set it against
 * what history says a surprise of that sign and size usually does:
 *
 *   expected  = the median move per unit of surprise z (past releases of the family with |z| >= 0.5) times this z;
 *               failing that, the median move after prints on the same side; failing that, nothing (size only).
 *   usual     = the median absolute move of the family at that horizon (the playbook's abs30 / abs240).
 *   label     = priced in      a clear surprise (|z| >= 1, or a signed miss with no z) and the market moved under a third of usual
 *               opposite       moved against the expected direction by at least a third of usual
 *               underreaction  the right way, under half the expected move
 *               in line        the right way, half to twice the expected move (or an in-line print that moved a normal amount)
 *               overreaction   more than twice the expected move (or an in-line print that moved more than twice usual)
 *   gap       = actual - expected.
 *
 * The history is point-in-time: a release is only ever compared with releases BEFORE it (the backfill from the release
 * study walks forward in time). It is history with its count, never a forecast of the next print.
 *
 * Regime at the time: the VIX close before the release (calm < 16 <= normal < 24 <= stressed), the same for the live
 * record and the backfill, plus the world-stress colour where the live reader saw it.
 *
 * Pure: no fetch, no KV, no clock. Tested in js/releaseReaction.test.mjs.
 */
import { MARKET_LABEL } from './releasePlaybook.js';

/** Markets that can be measured live on OANDA, by the release study's market id (unit %: price change of the instrument). */
export const REACTION_MARKETS = {
  zt: { inst: 'USB02Y_USD', label: 'US 2y note' }, zn: { inst: 'USB10Y_USD', label: 'US 10y note' },
  eurusd: { inst: 'EUR_USD', label: 'EUR/USD' }, gbpusd: { inst: 'GBP_USD', label: 'GBP/USD' }, usdjpy: { inst: 'USD_JPY', label: 'USD/JPY' },
  audusd: { inst: 'AUD_USD', label: 'AUD/USD' }, nzdusd: { inst: 'NZD_USD', label: 'NZD/USD' }, usdcad: { inst: 'USD_CAD', label: 'USD/CAD' }, usdchf: { inst: 'USD_CHF', label: 'USD/CHF' },
  gold: { inst: 'XAU_USD', label: 'Gold' }, es: { inst: 'SPX500_USD', label: 'S&P 500' }, nq: { inst: 'NAS100_USD', label: 'Nasdaq' },
  dax: { inst: 'DE30_EUR', label: 'DAX' }, ftse: { inst: 'UK100_GBP', label: 'FTSE 100' }, nikkei: { inst: 'JP225_USD', label: 'Nikkei' },
  bund: { inst: 'DE10YB_EUR', label: 'Bund' }, gilt: { inst: 'UK10YB_GBP', label: 'Gilt' },
};
/** The dollar index, implied from four legs with ICE weights renormalised (as js/chainLive.js does). Up = the dollar up. */
export const DX_BASKET = [['eurusd', 57.6, -1], ['usdjpy', 13.6, 1], ['gbpusd', 11.9, -1], ['usdcad', 9.1, 1]];
/** Per country: the 2y where there is one, the currency pair(s), gold and the equity index. */
const BY_COUNTRY = {
  US: ['zt', 'eurusd', 'usdjpy', 'gbpusd', 'usdcad', 'dx', 'gold', 'es', 'nq'], EU: ['eurusd', 'bund', 'dax', 'gold'], DE: ['eurusd', 'bund', 'dax', 'gold'],
  GB: ['gbpusd', 'gilt', 'ftse', 'gold'], JP: ['usdjpy', 'nikkei', 'gold'], AU: ['audusd', 'gold', 'es'], NZ: ['nzdusd', 'gold'], CA: ['usdcad', 'gold', 'es'],
  CH: ['usdchf', 'gold'], CN: ['audusd', 'usdjpy', 'gold', 'es'],
};
/** The release study's families by country (js/releasePlaybook.js FAMILIES). */
export const FAMILY_COUNTRY = { NFP: 'US', CPI: 'US', PCE: 'US', RETAIL: 'US', FOMC: 'US', REFUNDING: 'US', ECB: 'EU', BOE: 'GB', UKFISCAL: 'GB', BOJ: 'JP' };
const BP_MARKETS = new Set(['sofr', 'eur', 'spr']);
export const unitOf = id => (BP_MARKETS.has(id) ? 'bp' : '%');
export const labelOf = id => (id === 'dx' ? 'Dollar (basket)' : REACTION_MARKETS[id]?.label ?? MARKET_LABEL[id] ?? id);
export const LABELS = ['priced in', 'opposite', 'underreaction', 'in line', 'overreaction'];
export const DIRECTIONAL = new Set(['underreaction', 'in line', 'overreaction']);

const fin = Number.isFinite;
const r3 = x => (fin(x) ? +x.toFixed(3) : null);
const r2 = x => (fin(x) ? +x.toFixed(2) : null);
export const median = a => { const s = (a ?? []).filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = a => { const v = a.filter(fin); if (v.length < 2) return null; const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };

/** The markets to measure for a release: the country's set, then the playbook's biggest movers that OANDA can price, at most `max`. */
export function marketsFor(country, pb = null, { max = 9 } = {}) {
  const base = [...(BY_COUNTRY[String(country ?? '').toUpperCase()] ?? ['gold', 'es'])];
  for (const id of Object.keys(pb?.markets ?? {})) if (REACTION_MARKETS[id] && !base.includes(id) && base.length < max) base.push(id);
  return base.slice(0, max);
}

/**
 * % move of an M1 series from the release minute to `offMin` after it. bars: [{ t (open, epoch s), c }] ascending.
 * Base = the close of the last bar that closed at or before the release (within 15 min); end = the close of the last bar
 * that closed at or before release + offMin (within 10 min of it). Null when either side has no bar (market shut).
 */
export function moveFromBars(bars, ms, offMin) {
  const closeMs = b => b.t * 1000 + 60_000, target = ms + offMin * 60_000;
  let base = null, end = null;
  for (const b of bars ?? []) {
    const c = Number(b.c), cm = closeMs(b); if (!(c > 0)) continue;
    if (cm <= ms && cm > ms - 15 * 60_000) base = c;
    if (cm <= target && cm > target - 10 * 60_000) end = c;
  }
  return base && end ? r3((end / base - 1) * 100) : null;
}
/** The dollar basket's move from its legs' moves (needs all four). */
export function dxMove(moves) {
  let num = 0, den = 0;
  for (const [id, w, s] of DX_BASKET) { const m = moves?.[id]; if (!fin(m)) return null; num += w * s * m; den += w; }
  return r3(num / den);
}

const sideOf = (z, diff) => (fin(z) ? Math.sign(z) : fin(diff) ? Math.sign(diff) : 0);
/** A surprise is clear enough to have expected a move: |z| >= 1, or a miss with no z to size it. */
export const clearSurprise = s => !!s && (fin(s.z) ? Math.abs(s.z) >= 1 : fin(s.diff) && s.diff !== 0);

/**
 * What history expects for one market at one horizon ('m30' | 'm240').
 * hist: [{ z, diff, moves: { mkt: { m30, m240 } } }] (point-in-time: releases BEFORE this one). surprise: { z, diff }.
 * Returns { expected, usual, n, src, perUnit } (expected null when history cannot say a direction).
 */
export function expectationFor(hist, mkt, h, surprise, { minN = 4 } = {}) {
  const rows = (hist ?? []).map(x => ({ z: x.z, diff: x.diff, v: x.moves?.[mkt]?.[h] })).filter(x => fin(x.v));
  const usual = rows.length >= minN ? median(rows.map(x => Math.abs(x.v))) : null;
  const sized = rows.filter(x => fin(x.z) && Math.abs(x.z) >= 0.5);
  const perUnit = sized.length >= minN ? median(sized.map(x => x.v / x.z)) : null;
  const side = sideOf(surprise?.z, surprise?.diff);
  if (fin(perUnit) && fin(surprise?.z)) return { expected: r3(perUnit * surprise.z), usual: r3(usual), n: rows.length, nSized: sized.length, src: 'per unit of surprise', perUnit: r3(perUnit) };
  const same = side ? rows.filter(x => sideOf(x.z, x.diff) === side) : [];
  if (same.length >= Math.ceil(minN / 2) + 1) return { expected: r3(median(same.map(x => x.v))), usual: r3(usual), n: rows.length, nSide: same.length, src: `median after ${side > 0 ? 'above' : 'below'}-consensus prints`, perUnit: r3(perUnit) };
  return { expected: null, usual: r3(usual), n: rows.length, src: usual == null ? 'no history' : 'size only', perUnit: r3(perUnit) };
}

/** The label for one market at one horizon. Returns { label, gap, ratio } (label null when there is no history to judge by). */
export function labelReaction(actual, { expected, usual } = {}, surprise = {}) {
  if (!fin(actual)) return { label: null, gap: null, ratio: null };
  if (!(usual > 0)) return { label: null, gap: null, ratio: null, why: 'no history to judge by' };
  const a = actual, clear = clearSurprise(surprise);
  if (clear && Math.abs(a) < usual / 3) return { label: 'priced in', gap: fin(expected) ? r3(a - expected) : r3(Math.abs(a) - usual), ratio: fin(expected) && expected ? r2(a / expected) : null };
  if (!fin(expected) || Math.abs(expected) < 0.25 * usual) {
    // no meaningful direction to expect (an in-line print, or a family with no directional history): judge the size only
    return { label: Math.abs(a) > 2 * usual ? 'overreaction' : 'in line', gap: r3(Math.abs(a) - usual), ratio: null, sizeOnly: true };
  }
  const q = a / expected;
  const label = q < 0 && Math.abs(a) >= usual / 3 ? 'opposite' : q < 0.5 ? 'underreaction' : q <= 2 ? 'in line' : 'overreaction';
  return { label, gap: r3(a - expected), ratio: r2(q) };
}

/** VIX before the release → the risk tone. */
export const regimeOf = vix => (!fin(vix) ? null : vix < 16 ? 'calm' : vix < 24 ? 'normal' : 'stressed');
/** The last VIX close dated strictly before the release's date (point-in-time). vix: ascending [{date, value}]. */
export function vixBefore(vix, ms) {
  const day = new Date(ms).toISOString().slice(0, 10); let v = null;
  for (const p of vix ?? []) { if (p.date >= day) break; if (fin(p.value)) v = p.value; }
  return v;
}

/** The release's headline label: the label most markets share (ties → the headline market's), 'mixed' when none has half. */
export function overallLabel(markets, h) {
  const ls = (markets ?? []).map(m => m[`label${h}`]).filter(Boolean); if (!ls.length) return null;
  const c = {}; for (const l of ls) c[l] = (c[l] ?? 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
  if (top[0][1] * 2 >= ls.length) return top.length > 1 && top[0][1] === top[1][1] ? (markets.find(m => m[`label${h}`])?.[`label${h}`] ?? top[0][0]) : top[0][0];
  return 'mixed';
}

/**
 * Score one release at one horizon. rec: { markets: [{ id, m30?, m240? }], surprise: { z, diff } }; hist: as expectationFor.
 * Fills each market's exp/usual/label/gap for the horizon and the record's overall label. Returns a new record.
 */
export function scoreRelease(rec, hist, horizon = 30) {
  const h = `m${horizon}`, markets = (rec.markets ?? []).map(m => {
    const e = expectationFor(hist, m.id, h, rec.surprise), L = labelReaction(m[h], e, rec.surprise);
    return { ...m, [`exp${horizon}`]: e.expected, [`usual${horizon}`]: e.usual, [`n${horizon}`]: e.n, [`src${horizon}`]: e.src, [`perUnit${horizon}`]: e.perUnit, [`label${horizon}`]: L.label, [`gap${horizon}`]: L.gap, [`sizeOnly${horizon}`]: !!L.sizeOnly };
  });
  return { ...rec, markets, [`label${horizon}`]: overallLabel(markets, horizon) };
}

/** The history rows a record is scored against: same family (or, with no family, the same event), strictly earlier. */
export function historyFor(records, rec) {
  const ev = String(rec.event ?? '').trim().toLowerCase();
  return (records ?? []).filter(x => x !== rec && x.ms < rec.ms && (rec.family ? x.family === rec.family : (x.country === rec.country && String(x.event ?? '').trim().toLowerCase() === ev)))
    .map(x => ({ z: x.surprise?.z ?? null, diff: x.surprise?.diff ?? null, moves: Object.fromEntries((x.markets ?? []).map(m => [m.id, { m30: m.m30, m240: m.m240 }])) }));
}

/**
 * The backfill from the release study (analysis/output/release_layer1/summary.json rows): walks forward in time, so
 * each release's z (its surprise against the sd of the family's EARLIER surprises, at least 6) and its expectation use
 * only what came before it. vix: ascending [{date, value}] for the regime, optional.
 */
export function backfillFromStudy(rows, { vix = null, minSd = 6 } = {}) {
  const sorted = [...(rows ?? [])].filter(r => r?.family && r.M && r.t).sort((a, b) => (a.t < b.t ? -1 : 1)), out = [];
  for (const r of sorted) {
    const ms = Date.parse(r.t), prior = out.filter(x => x.family === r.family);
    const pastS = sorted.filter(x => x.family === r.family && x.t < r.t && fin(x.surprise)).map(x => x.surprise);
    const s = fin(r.surprise) ? r.surprise : null, sdv = pastS.length >= minSd ? sd(pastS) : null;
    const z = s != null && sdv > 0 ? r2(s / sdv) : null;
    const country = FAMILY_COUNTRY[r.family] ?? null, pref = BY_COUNTRY[country] ?? [], rank = id => (pref.includes(id) ? pref.indexOf(id) : 100);
    const markets = Object.entries(r.M).filter(([, v]) => v && fin(v.m30)).map(([id, v]) => ({ id, label: labelOf(id), unit: unitOf(id), m30: r3(v.m30), m240: fin(v.m240) ? r3(v.m240) : null }))
      .sort((a, b) => rank(a.id) - rank(b.id));   // the headline market first: the 2y for US data, the currency for the others
    if (!markets.length) continue;
    const vx = vix ? vixBefore(vix, ms) : null;
    let rec = { key: `study|${r.id ?? r.t}`, source: 'study', family: r.family, country, event: r.name ?? r.family, ms, at: new Date(ms).toISOString(),
      surprise: { ok: s != null, diff: s, z, direction: s == null ? null : s > 0 ? 'above' : s < 0 ? 'below' : 'in line', actual: r.actual ?? null, estimate: r.consensus ?? null },
      regime: { vix: vx, tone: regimeOf(vx), stress: null }, markets };
    const hist = historyFor(prior, rec);
    rec = scoreRelease(scoreRelease(rec, hist, 30), hist, 240);
    out.push(rec);
  }
  return out;
}

/** The family history a LIVE record is scored against: the study backfill plus earlier live records (a study row wins for the same minute). */
export function liveHistory(study, live, rec) {
  const seen = new Set((study ?? []).map(x => `${x.family}|${Math.round(x.ms / 60_000)}`));
  const pool = [...(study ?? []), ...(live ?? []).filter(x => !seen.has(`${x.family}|${Math.round(x.ms / 60_000)}`))];
  return historyFor(pool, rec);
}

/**
 * A new live record from a surprise-reader record (js/surpriseReader.js readRelease). The z falls back to the surprise
 * against the sd of the study's surprises for the family when the reader had too few prints of its own.
 */
export function newLiveRecord(rr, { study = [], vix = null, stress = null, pb = null } = {}) {
  let z = rr.surprise?.z ?? null, zSrc = z != null ? 'its own past prints' : null;
  if (z == null && fin(rr.surprise?.diff) && rr.family) {
    const past = (study ?? []).filter(x => x.family === rr.family && fin(x.surprise?.diff) && x.ms < rr.ms).map(x => x.surprise.diff), s = past.length >= 6 ? sd(past) : null;
    if (s > 0) { z = r2(rr.surprise.diff / s); zSrc = `the release study's ${past.length} ${rr.family} surprises`; }
  }
  return { key: rr.key, source: 'live', family: rr.family ?? null, country: rr.country, ccy: rr.ccy ?? null, event: rr.event, ms: rr.ms, at: rr.at,
    surprise: { ok: !!rr.surprise?.ok, diff: rr.surprise?.diff ?? null, diffText: rr.surprise?.diffText ?? null, z, zSrc, size: rr.surprise?.size ?? null, direction: rr.surprise?.direction ?? null, actual: rr.actual ?? null, estimate: rr.estimate ?? null },
    regime: { vix, tone: regimeOf(vix), stress }, markets: marketsFor(rr.country, pb).map(id => ({ id, label: labelOf(id), unit: '%', inst: REACTION_MARKETS[id]?.inst ?? null })) };
}

const sgn = (x, u = '%') => (fin(x) ? `${x > 0 ? '+' : ''}${+x.toFixed(2)}${u}` : '?');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Telegram HTML, the +30 minute follow-up to the reader's message. */
export function reactionMessage(rec, { horizon = 30, top = 4 } = {}) {
  const h = horizon, ms = (rec.markets ?? []).filter(m => fin(m[`m${h}`])).slice(0, top);
  const head = `📏 <b>${esc(rec.country ?? '')} ${esc(rec.event)}</b> · ${h === 30 ? '30 min' : '4 h'} on${rec.surprise?.diffText ? ` (${esc(rec.surprise.diffText)}${fin(rec.surprise.z) ? `, z ${sgn(rec.surprise.z, '')}` : ''})` : ''}`;
  if (!ms.length) return `${head}\nNo market could be priced (shut, or no bars).`;
  const lines = ms.map(m => {
    const e = m[`sizeOnly${h}`] ? null : m[`exp${h}`], u = m[`usual${h}`], L = m[`label${h}`];   // a size-only label is judged against the usual size, so say that
    return `• ${esc(m.label)}: moved <b>${sgn(m[`m${h}`], m.unit ?? '%')}</b> vs ${fin(e) ? `the usual ${sgn(e, m.unit ?? '%')} for a surprise like this` : fin(u) ? `a usual ±${+u.toFixed(2)}${m.unit ?? '%'}` : 'no history'}${m[`n${h}`] ? ` (n ${m[`n${h}`]})` : ''}${L ? ` → <b>${L}</b>` : ''}`;
  });
  const all = rec[`label${h}`];
  return [head, ...lines, all ? `Overall: <b>${all}</b>.` : null, '<i>History with its count, not a forecast.</i>'].filter(Boolean).join('\n');
}

/** Add or replace a record in the log (newest first), capped. */
export function upsert(log = [], rec, { keep = 600 } = {}) {
  return [rec, ...(log ?? []).filter(x => x.key !== rec.key)].sort((a, b) => b.ms - a.ms).slice(0, keep);
}

/** Which records are due a measurement now: { m30: [...], m240: [...] }. Late measurement is fine (the bars are history) up to `maxLateH`. */
export function dueMeasurements(log, now, { maxLateH = 72 } = {}) {
  const m30 = [], m240 = [];
  for (const r of log ?? []) {
    if (now - r.ms > maxLateH * 3600e3) continue;
    if (!r.done30 && now >= r.ms + 31 * 60_000) m30.push(r);
    if (!r.done240 && now >= r.ms + 241 * 60_000) m240.push(r);
  }
  return { m30, m240 };
}

/**
 * The summary: by family (and by family x regime), at each horizon, over the HEADLINE market of each release (the first
 * measured market: the 2y for US data, the currency for the others) and per market:
 *   n, moved as expected (share of releases with a directional expectation whose label is in line / under / over),
 *   priced-in share (of clear surprises), label counts, median reaction per unit of surprise z.
 */
export function summarise(records, { horizons = [30, 240] } = {}) {
  const groups = {};
  const add = (k, r) => (groups[k] ??= []).push(r);
  for (const r of records ?? []) { const fam = r.family ?? `${r.country ?? '?'} ${r.event}`; add(`${fam}||all`, r); if (r.regime?.tone) add(`${fam}||${r.regime.tone}`, r); add(`ALL||all`, r); if (r.regime?.tone) add(`ALL||${r.regime.tone}`, r); }
  const stat = (rs, h) => {
    const head = rs.map(r => (r.markets ?? []).find(m => m[`label${h}`])).filter(Boolean);
    const dirl = head.filter(m => fin(m[`exp${h}`]) && Math.abs(m[`exp${h}`]) >= 0.25 * (m[`usual${h}`] ?? Infinity));
    const clear = rs.filter(r => clearSurprise(r.surprise) && (r.markets ?? []).some(m => m[`label${h}`]));
    const labels = {}; for (const m of head) labels[m[`label${h}`]] = (labels[m[`label${h}`]] ?? 0) + 1;
    const perMkt = {};
    for (const r of rs) for (const m of r.markets ?? []) if (fin(m[`m${h}`]) && fin(r.surprise?.z) && Math.abs(r.surprise.z) >= 0.5) (perMkt[m.id] ??= []).push(m[`m${h}`] / r.surprise.z);
    return { n: head.length, expected: dirl.length ? r2(dirl.filter(m => DIRECTIONAL.has(m[`label${h}`])).length / dirl.length) : null, nDirectional: dirl.length,
      pricedIn: clear.length ? r2(clear.filter(r => (r.markets ?? []).find(m => m[`label${h}`])?.[`label${h}`] === 'priced in').length / clear.length) : null, nClear: clear.length,
      labels, perUnit: Object.fromEntries(Object.entries(perMkt).filter(([, v]) => v.length >= 3).map(([k, v]) => [k, { n: v.length, median: r3(median(v)) }])) };
  };
  const rows = Object.entries(groups).map(([k, rs]) => { const [family, regime] = k.split('||'); return { family, regime, n: rs.length, live: rs.filter(r => r.source === 'live').length, ...Object.fromEntries(horizons.map(h => [`m${h}`, stat(rs, h)])) }; });
  return rows.sort((a, b) => (a.family === 'ALL' ? -1 : b.family === 'ALL' ? 1 : b.n - a.n) || (a.regime === 'all' ? -1 : b.regime === 'all' ? 1 : a.regime.localeCompare(b.regime)));
}

/** Compact text of the summary for the events_news analyst (Desk Pack): one line per family, all regimes. */
export function summaryText(summary, { max = 10 } = {}) {
  const pct = x => (x == null ? '–' : `${Math.round(x * 100)}%`);
  return (summary ?? []).filter(r => r.regime === 'all').slice(0, max).map(r => {
    const a = r.m30, b = r.m240;
    return `${r.family}: ${r.n} releases (${r.live} live). 30 min: moved as expected ${pct(a.expected)} of ${a.nDirectional}, priced in ${pct(a.pricedIn)} of ${a.nClear} clear surprises; 4 h: as expected ${pct(b.expected)}, priced in ${pct(b.pricedIn)}.`;
  }).join('\n');
}

