/**
 * The live layer: the Desk Terminal's daily boards, kept moving between their daily prints.
 *
 * WHY. Several boards are built from daily bars or daily official prints and cached for hours, so an intraday move shows nowhere until tomorrow:
 * the EM gauges, the wider-market tiles, the global yields and the curve. This module turns one small batch of live prices into an OVERLAY for each:
 * the daily number stays the reference, the overlay says how far the market has moved since it, labelled price-based / implied and stamped with the
 * quote time. Nothing here replaces an official number, writes into the desk book or feeds a bot.
 *
 *   overlayEm(em, px)               live EM prices against the last daily close (the board's own `last`)
 *   overlayIndices({refs, px})      Nasdaq / S&P / Dow / Russell against the last completed daily close, plus small-vs-big and tech-vs-broad
 *   overlayYields({mvs, official})  the implied intraday US 2/5/10/30y and Bund 10y beside the last official prints, plus implied slopes and the Bund gap
 *   rangeState(session, now)        how much of the forecast day's range is used so far, against how much of the day has gone
 *   corrRegime(h1)                  the correlation regime of the majors from hourly returns, against the last few weeks of 5-day windows
 *   priceRead({strength, analyst})  a candle-based read per currency beside the analyst's dawn read, and where they disagree
 *
 * DESCRIPTIVE ONLY. "Quiet" means small moves so far, not that there is no direction; the price read is a description of recent movement, not a forecast;
 * none of this is the validated daily HMM. Pure: no fetch, no DOM. Tested in js/liveLayerCore.test.mjs.
 */
import { shapeMove } from './curveBoardCore.js';

const fin = x => typeof x === 'number' && Number.isFinite(x);
const r1 = x => (fin(x) ? Math.round(x * 10) / 10 : null);
const r2 = x => (fin(x) ? Math.round(x * 100) / 100 : null);
const r3 = x => (fin(x) ? Math.round(x * 1000) / 1000 : null);
export const pct = (ref, live) => (ref > 0 && live > 0 ? (live / ref - 1) * 100 : null);

export const EM_LIVE = [{ id: 'USDCNH', oanda: 'USD_CNH' }, { id: 'USDMXN', oanda: 'USD_MXN' }, { id: 'USDZAR', oanda: 'USD_ZAR' }, { id: 'USDTRY', oanda: 'USD_TRY' }];
export const INDEX_LIVE = [
  { id: 'NQ', oanda: 'NAS100_USD', label: 'Nasdaq 100' }, { id: 'SPX', oanda: 'SPX500_USD', label: 'S&P 500' },
  { id: 'DOW', oanda: 'US30_USD', label: 'Dow' }, { id: 'RUT', oanda: 'US2000_USD', label: 'Russell 2000' },
];
export const pricingList = () => [...EM_LIVE, ...INDEX_LIVE].map(x => x.oanda);

/** The yield legs the overlay prices (names in js/yieldLegs.js) and how the board names them. */
export const YIELD_LIVE = [['Y_US2', 'US 2y', 'us2y'], ['Y_US5', 'US 5y', 'us5y'], ['Y_US10', 'US 10y', 'us10y'], ['Y_US30', 'US 30y', 'us30y'], ['Y_DE10', 'Bund 10y', 'bund10']];

/** OANDA's pricing response -> { INSTRUMENT: { mid, bid, ask, at (ms), tradeable } }. */
export function parsePricing(json) {
  const out = {};
  for (const p of json?.prices ?? []) {
    const bid = Number(p.bids?.[0]?.price ?? p.closeoutBid), ask = Number(p.asks?.[0]?.price ?? p.closeoutAsk);
    if (!fin(bid) || !fin(ask) || bid <= 0 || ask <= 0) continue;
    out[p.instrument] = { mid: (bid + ask) / 2, bid, ask, at: Date.parse(p.time) || null, tradeable: p.tradeable !== false && p.status !== 'non-tradeable' };
  }
  return out;
}

/** True when every quote says the market is not tradeable, or the newest quote is older than `staleMin` minutes. */
export function quotesClosed(px, now = Date.now(), staleMin = 90) {
  const q = Object.values(px ?? {}); if (!q.length) return null;
  const newest = Math.max(...q.map(x => x.at ?? 0));
  return q.every(x => !x.tradeable) || (newest > 0 && now - newest > staleMin * 60e3);
}

/** em = /api/em-gauges. Live price against the board's last daily close (`last`) and against the close five sessions back (`spark` ends at `last`). */
export function overlayEm(em, px) {
  if (!em?.pairs) return { ok: false, error: 'no EM board' };
  const pairs = {};
  for (const { id, oanda } of EM_LIVE) {
    const g = em.pairs[id], q = px?.[oanda]; if (!g?.ok || !q) continue;
    const five = g.spark?.length > 5 ? g.spark[g.spark.length - 6] : null;
    pairs[id] = { live: q.mid, ref: g.last, refDate: g.date ?? null, chgLive: r2(pct(g.last, q.mid)), chg5dLive: r2(pct(five, q.mid)), quoteAt: q.at ? new Date(q.at).toISOString() : null, tradeable: q.tradeable };
  }
  return { ok: Object.keys(pairs).length > 0, pairs, basis: 'live price against the last daily close; USD/EM up = the EM currency weaker' };
}

const sgn = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
/** refs = { NQ: { close, date }, ... } (last completed daily close), px = parsePricing. */
export function overlayIndices({ refs, px }) {
  const rows = {};
  for (const x of INDEX_LIVE) {
    const ref = refs?.[x.id], q = px?.[x.oanda]; if (!ref || !q) continue;
    rows[x.id] = { id: x.id, label: x.label, live: q.mid, ref: ref.close, refDate: ref.date ?? null, chgPct: r2(pct(ref.close, q.mid)), quoteAt: q.at ? new Date(q.at).toISOString() : null };
  }
  const c = id => rows[id]?.chgPct;
  const smallVsBig = fin(c('RUT')) && fin(c('SPX')) ? r2(c('RUT') - c('SPX')) : null, techVsBroad = fin(c('NQ')) && fin(c('SPX')) ? r2(c('NQ') - c('SPX')) : null;
  const T = 0.15, parts = [];
  if (smallVsBig != null) parts.push(Math.abs(smallVsBig) < T ? 'small caps are keeping pace with the S&P' : `small caps are ${smallVsBig > 0 ? 'leading' : 'lagging'} the S&P by ${Math.abs(smallVsBig).toFixed(2)}pp`);
  if (techVsBroad != null) parts.push(Math.abs(techVsBroad) < T ? 'the Nasdaq is keeping pace' : `the Nasdaq is ${techVsBroad > 0 ? 'leading' : 'lagging'} by ${Math.abs(techVsBroad).toFixed(2)}pp`);
  const line = parts.length ? `Since the last daily close ${parts.join('; ')}.` : null;
  return { ok: Object.keys(rows).length > 0, rows, smallVsBig, techVsBroad, line, basis: 'index CFD mid price against the last completed daily close' };
}

/**
 * Implied intraday yields. mvs = { Y_US2: { now, ref, deltaBp, asOf, closed, D }, ... } (js/chainLive.js liveYieldMove results),
 * official = { Y_US2: { date, value }, ... } the last official print. The implied level is the official yield moved by the bond CFD's price
 * change through a duration (js/yieldLegs.js): approximate, a bp or two of drift, exact only at each official anchor. It never replaces the print.
 */
export function overlayYields({ mvs, official = {} }) {
  const rows = [], by = {};
  for (const [name, label, key] of YIELD_LIVE) {
    const mv = mvs?.[name]; if (!mv || !fin(mv.now)) continue;
    const o = official[name] ?? null;
    const row = { key, name, label, implied: r3(mv.now), refImplied: r3(mv.ref), deltaBp: r1(mv.deltaBp), official: o && fin(o.value) ? { date: o.date, value: o.value } : null,
      vsOfficialBp: o && fin(o.value) ? r1((mv.now - o.value) * 100) : null, D: r2(mv.D), asOf: mv.asOf ?? null, closed: !!mv.closed };
    rows.push(row); by[key] = row;
  }
  const slope = (long, short) => { const a = by[long], b = by[short]; return a && b ? { now: r1((a.implied - b.implied) * 100), ref: r1((a.refImplied - b.refImplied) * 100) } : null; };
  const slopes = [['2s10s', '2y–10y', 'us10y', 'us2y'], ['2s30s', '2y–30y', 'us30y', 'us2y'], ['5s30s', '5y–30y', 'us30y', 'us5y']]
    .map(([k, label, l, s]) => { const v = slope(l, s); return v ? { key: k, label, nowBp: v.now, refBp: v.ref, deltaBp: r1(v.now - v.ref) } : null; }).filter(Boolean);
  const gap = by.bund10 && by.us10y ? { nowBp: r1((by.bund10.implied - by.us10y.implied) * 100), refBp: r1((by.bund10.refImplied - by.us10y.refImplied) * 100) } : null;
  if (gap) gap.deltaBp = r1(gap.nowBp - gap.refBp);
  const shape = by.us2y && by.us10y ? shapeMove(by.us2y.deltaBp, by.us10y.deltaBp, 2) : null;
  let line = null;
  if (shape && shape.key !== 'still') line = `Since the last daily close the US curve has made ${shape.word} (2y ${sgn(by.us2y.deltaBp, 1)}bp, 10y ${sgn(by.us10y.deltaBp, 1)}bp, implied from the bond futures).`;
  else if (shape) line = `The US curve is little changed since the last daily close (2y ${sgn(by.us2y.deltaBp, 1)}bp, 10y ${sgn(by.us10y.deltaBp, 1)}bp, implied).`;
  return { ok: rows.length > 0, rows, slopes, bundGap: gap, shape, line, basis: 'implied from the bond CFDs through a duration, anchored to the official print (approximate); official prints are unchanged' };
}

// ── how much of the day's range is used ────────────────────────────────────────────────────────────────────────────────────────────────
export const PACE_QUIET = 0.75, PACE_ACTIVE = 1.25;
/**
 * session = getSessionStatus(): { instruments: { NAME: { hl (range so far, % of the open), forecast: { hl_median }, bar_count (hours since London midnight) } } }.
 * used = range so far / the forecast day's median range. pace = used / sqrt(share of the day gone): a random walk's range grows with the square root of
 * time, so pace 1.0 = about as wide as the forecast implies for this hour. A size reading only.
 */
export function rangeState(session, { minHours = 2 } = {}) {
  if (!session?.instruments) return { ok: false, error: 'no session status' };
  const rows = [];
  for (const [name, s] of Object.entries(session.instruments)) {
    if (!s || s.error || !fin(s.hl) || !fin(s.forecast?.hl_median) || s.forecast.hl_median <= 0 || !fin(s.bar_count)) continue;
    const used = s.hl / s.forecast.hl_median, frac = Math.min(1, s.bar_count / 24);
    if (s.bar_count < minHours) { rows.push({ name, used: r2(used), hours: s.bar_count, pace: null, state: 'early', hl: s.hl, forecast: s.forecast.hl_median }); continue; }
    const pace = used / Math.sqrt(frac);
    rows.push({ name, used: r2(used), hours: s.bar_count, pace: r2(pace), state: pace >= PACE_ACTIVE ? 'active' : pace <= PACE_QUIET ? 'quiet' : 'normal', hl: s.hl, forecast: s.forecast.hl_median });
  }
  const judged = rows.filter(r => r.pace != null);
  const n = { active: 0, quiet: 0, normal: 0 }; for (const r of judged) n[r.state]++;
  const market = !judged.length ? null : n.active >= judged.length * 0.5 ? 'active' : n.quiet >= judged.length * 0.5 ? 'quiet' : 'mixed';
  const line = !judged.length ? 'Too early in the London day to judge the range used.' : market === 'active' ? `Most markets are wider than the forecast day implies for this hour (${n.active} of ${judged.length} active).` : market === 'quiet' ? `Most markets are narrower than the forecast day implies for this hour (${n.quiet} of ${judged.length} quiet): small moves so far, not that there is no direction.` : `A mix: ${n.active} active, ${n.normal} normal, ${n.quiet} quiet of ${judged.length}.`;
  return { ok: rows.length > 0, rows: rows.sort((a, b) => (b.pace ?? -1) - (a.pace ?? -1)), counts: n, market, line, basis: 'range so far from London midnight against the forecast median range, scaled by the share of the day gone (square-root of time)' };
}

// ── correlation regime of the majors, from hourly returns ────────────────────────────────────────────────────────────────────────────────
export const MAJORS = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_JPY', 'USD_CAD', 'USD_CHF'];
function corr(a, b) {
  const n = a.length; if (n < 10) return null;
  let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n; let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sxy += x * y; sxx += x * x; syy += y * y; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
/** Mean absolute correlation across the majors' pairs for the return window [from, to) of an aligned return matrix. */
function meanAbsCorr(R, from, to) {
  const keys = Object.keys(R); let s = 0, n = 0;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const c = corr(R[keys[i]].slice(from, to), R[keys[j]].slice(from, to)); if (c != null) { s += Math.abs(c); n++; } }
  return n ? s / n : null;
}
/**
 * h1 = { 'EUR_USD': [{ t (ms), c }, ...], ... } hourly bars. The statistic is the mean |rho| across the seven majors' 21 pairs over the last `win` hourly returns
 * (default 5 days of 24 hours), placed against the same statistic in rolling windows over the earlier bars (step 6 hours): HIGH at or above the 80th percentile,
 * LOW at or below the 20th, otherwise NORMAL. An intraday rebuild of the daily correlation regime from a different window: price-based and descriptive.
 */
export function corrRegime(h1, { win = 120, step = 6, minHistory = 12 } = {}) {
  const common = MAJORS.filter(p => h1?.[p]?.length > win + 48);
  if (common.length < 5) return { ok: false, error: `only ${common.length} of ${MAJORS.length} majors have enough hourly bars` };
  // align on the hour: keep only timestamps every pair has
  const maps = common.map(p => new Map(h1[p].map(b => [b.t, b.c])));
  const ts = [...maps[0].keys()].filter(t => maps.every(m => m.has(t))).sort((a, b) => a - b);
  if (ts.length < win + step * minHistory) return { ok: false, error: `only ${ts.length} shared hourly bars` };
  const R = {}; common.forEach((p, k) => { R[p] = ts.slice(1).map((t, i) => Math.log(maps[k].get(t) / maps[k].get(ts[i]))); });
  const n = ts.length - 1, now = meanAbsCorr(R, n - win, n);
  const hist = []; for (let end = n - win; end - win >= 0; end -= step) { const v = meanAbsCorr(R, end - win, end); if (v != null) hist.push(v); }
  if (hist.length < minHistory || now == null) return { ok: false, error: 'not enough earlier windows to place the reading' };
  const sorted = [...hist].sort((a, b) => a - b), below = sorted.filter(v => v < now).length + sorted.filter(v => v === now).length / 2, pctile = Math.round(below / sorted.length * 100);
  const state = pctile >= 80 ? 'HIGH' : pctile <= 20 ? 'LOW' : 'NORMAL', med = sorted[Math.floor(sorted.length / 2)];
  const line = state === 'HIGH' ? 'The majors are moving together more than usual over the last five days: one factor (usually the dollar) is doing most of the work.'
    : state === 'LOW' ? 'The majors are moving more independently than usual over the last five days: the dollar is not the only story.' : 'The majors are correlated about as much as usual over the last five days.';
  return { ok: true, state, value: r3(now), median: r3(med), pctile, windows: hist.length, pairs: common.length * (common.length - 1) / 2, line, basis: 'mean |rho| of hourly returns across the majors, last 5 days, against earlier 5-day windows; price-based and descriptive, not the daily regime' };
}

// ── the price read, beside the analyst's dawn read ──────────────────────────────────────────────────────────────────────────────────────
export const LEAN = 0.5;
/**
 * strength = /api/ccy-strength; analyst = { USD: { bias }, ... } (the desk's dawn book: the sign is the lean).
 * The price read per currency is a rule over the 4H and 1D strength in σ: FIRM when both are at least +0.5σ, SOFT when both are at most −0.5σ, MIXED otherwise.
 * It is a description of how the currency has been moving, in prices, and is compared with the dawn read by sign only. Disagreement is flagged in plain words.
 */
export function priceRead({ strength, analyst }) {
  if (!strength?.ok) return { ok: false, error: strength?.error ?? 'no strength data' };
  const h4 = strength.horizons?.['4H'], d1 = strength.horizons?.['1D'];
  if (!h4?.available || !d1?.available) return { ok: false, error: 'the 4H and 1D windows are not both available' };
  const sc = (h, c) => h.scores.find(s => s.ccy === c)?.score;
  const rows = [];
  for (const { ccy } of h4.scores) {
    const a = sc(h4, ccy), b = sc(d1, ccy); if (!fin(a) || !fin(b)) continue;
    const read = a >= LEAN && b >= LEAN ? 'firm' : a <= -LEAN && b <= -LEAN ? 'soft' : 'mixed';
    const bias = analyst?.[ccy]?.bias, bn = Number(bias), lean = fin(bn) && bn !== 0 ? Math.sign(bn) : 0;
    const dis = (lean > 0 && read === 'soft') || (lean < 0 && read === 'firm');
    const agree = (lean > 0 && read === 'firm') || (lean < 0 && read === 'soft');
    const state = !fin(bn) ? 'no-analyst' : dis ? 'disagree' : agree ? 'agree' : 'open';
    rows.push({ ccy, s4h: r1(a), s1d: r1(b), read, analyst: fin(bn) ? bn : null, state });
  }
  const dis = rows.filter(r => r.state === 'disagree');
  const say = c => `${c.ccy}: the dawn read leans ${c.analyst > 0 ? 'firm' : 'soft'}, but in prices it has been ${c.read === 'soft' ? 'soft' : 'firm'} (4H ${sgn(c.s4h, 1)}σ, 1D ${sgn(c.s1d, 1)}σ)`;
  const line = dis.length ? `${dis.length === 1 ? 'One currency' : `${dis.length} currencies`} where the price read disagrees with the dawn read: ${dis.map(say).join('; ')}.` : 'No currency where the price read disagrees with the dawn read.';
  return { ok: true, rows, disagree: dis.map(r => r.ccy), line, basis: 'FIRM / SOFT when both the 4H and 1D strength are at least 0.5σ the same way; compared with the dawn read by sign only. A description of recent price movement, not a forecast.' };
}
