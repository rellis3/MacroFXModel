// js/terminal/jarvisVolCore.js: the pure half of Jarvis's VOL view, a landscape of "range used". For each desk market and each of the last ~60 completed sessions: the day's high-low range
// (as a percent of price) divided by that market's OWN normal range, the median of its previous 20 sessions' ranges (point-in-time, so a day never sets its own yardstick). 1.0 = a normal day for that market.
// Source: /api/ohlc-range daily bars (OANDA), the VIX curve from /api/fredhistory. DESCRIPTION ONLY: how stretched each day was; never a forecast, never a trade.
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const CLIP = 3, LOOKBACK = 20, MIN_PRIOR = 10, SESSIONS = 60;

/** The markets on the x axis, grouped by asset class: [desk key, the symbol the range feed takes]. */
export const VOL_GROUPS = [
  { id: 'idx', label: 'INDICES', m: [['NQ', 'NAS100_USD'], ['SPX500', 'SPX500_USD'], ['US30', 'US30_USD'], ['US2000', 'US2000_USD'], ['DE30', 'DE30_EUR'], ['UK100', 'UK100_GBP']] },
  { id: 'fxm', label: 'FX MAJORS', m: [['EURUSD', 'EUR_USD'], ['GBPUSD', 'GBP_USD'], ['USDJPY', 'USD_JPY'], ['AUDUSD', 'AUD_USD'], ['NZDUSD', 'NZD_USD'], ['USDCAD', 'USD_CAD'], ['USDCHF', 'USD_CHF']] },
  { id: 'fxc', label: 'FX CROSSES', m: [['EURGBP', 'EUR_GBP'], ['EURJPY', 'EUR_JPY'], ['GBPJPY', 'GBP_JPY'], ['AUDJPY', 'AUD_JPY'], ['EURCHF', 'EUR_CHF']] },
  { id: 'met', label: 'METALS', m: [['GOLD', 'XAU_USD'], ['SILVER', 'XAG_USD'], ['COPPER', 'XCU_USD'], ['PLATINUM', 'XPT_USD']] },
  { id: 'eng', label: 'ENERGY', m: [['WTI', 'WTICO_USD'], ['BRENT', 'BCO_USD'], ['NATGAS', 'NATGAS_USD']] },
];
export const VOL_MARKETS = VOL_GROUPS.flatMap(g => g.m.map(([key, oanda]) => ({ key, oanda, group: g.id })));

/** One daily bar's range as a percent of its mid price, or null. */
export function rangePct(b) {
  const h = num(b?.high), l = num(b?.low); if (h == null || l == null || h < l) return null; const mid = (h + l) / 2; return mid > 0 ? ((h - l) / mid) * 100 : null;
}
/** Normalise an /api/ohlc-range reply into [{date, r}] (weekdays only, since the UTC Sat/Sun bars are the thin Sunday-open sliver; oldest first), dropping the session still in progress (date >= todayIso). */
export function dailyRanges(reply, todayIso) {
  const out = [];
  for (const b of Array.isArray(reply?.values) ? reply.values : []) {
    const date = String(b?.datetime ?? '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const wd = new Date(date + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue;
    if (todayIso && date >= todayIso) continue;
    const r = rangePct(b); if (r != null && r > 0) out.push({ date, r });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/**
 * The terrain. barsByKey: { KEY: [{date, r}] }. Returns null when fewer than 3 markets have enough history.
 * { markets: [{key, group}], dates: [iso] (oldest first), Z: Float32Array(ns * nm), Z[j * nm + i] = session j, market i (1.0 = normal, clipped to CLIP; 1 where there is no bar or too little history),
 *   missing (cells without a measurement), latest: [{key, v}] (newest session, biggest first), stretched (markets at >= 1.5 x normal on the newest session), peaks: [{key, date, v, i, j}] (each market's biggest day, highest first), nm, ns }.
 */
export function buildTerrain(barsByKey, { sessions = SESSIONS, lookback = LOOKBACK, minPrior = MIN_PRIOR } = {}) {
  const mk = VOL_MARKETS.filter(m => (barsByKey?.[m.key]?.length ?? 0) > minPrior + 5);
  if (mk.length < 3) return null;
  const count = new Map(); for (const m of mk) for (const b of barsByKey[m.key]) count.set(b.date, (count.get(b.date) ?? 0) + 1);
  const dates = [...count.entries()].filter(([, c]) => c >= mk.length / 2).map(([d]) => d).sort().slice(-sessions);
  if (dates.length < 10) return null;
  const nm = mk.length, ns = dates.length, Z = new Float32Array(nm * ns).fill(1); let missing = 0;
  mk.forEach((m, i) => {
    const bars = barsByKey[m.key], at = new Map(bars.map((b, k) => [b.date, k]));
    for (let j = 0; j < ns; j++) {
      const k = at.get(dates[j]); if (k == null) { missing++; continue; }
      const prior = bars.slice(Math.max(0, k - lookback), k).map(b => b.r); if (prior.length < minPrior) { missing++; continue; }
      Z[j * nm + i] = clamp(bars[k].r / median(prior), 0, CLIP);
    }
  });
  const latest = mk.map((m, i) => ({ key: m.key, v: Z[(ns - 1) * nm + i] })).sort((a, b) => b.v - a.v);
  const peaks = mk.map((m, i) => { let bj = 0; for (let j = 1; j < ns; j++) if (Z[j * nm + i] > Z[bj * nm + i]) bj = j; return { key: m.key, date: dates[bj], v: Z[bj * nm + i], j: bj, i }; }).sort((a, b) => b.v - a.v);
  return { markets: mk.map(m => ({ key: m.key, group: m.group })), dates, Z, nm, ns, missing, latest, stretched: latest.filter(x => x.v >= 1.5).length, peaks };
}
/** The VIX curve read: spot against three-month. Above 1 = inverted (the front costs more than the three-month). null when VIX is missing. */
export function vixCurve(h) {
  const last = s => { const a = Array.isArray(s) ? s : []; for (let i = a.length - 1; i >= 0; i--) { const v = num(a[i]?.value); if (v != null) return { v, date: a[i].date }; } return null; };
  const v = last(h?.vix); if (!v) return null; const m = last(h?.vix3m), ratio = m && m.v > 0 ? v.v / m.v : null;
  return { vix: v.v, vix3m: m?.v ?? null, ratio, inverted: ratio != null && ratio > 1, date: v.date };
}
const SAY = { NQ: 'Nasdaq', SPX500: 'the S and P', US30: 'the Dow', US2000: 'the Russell', DE30: 'the DAX', UK100: 'the FTSE', GOLD: 'gold', SILVER: 'silver', COPPER: 'copper', PLATINUM: 'platinum', WTI: 'W T I crude', BRENT: 'Brent', NATGAS: 'natural gas' };
const say = k => SAY[k] ?? (k.length === 6 ? `${k.slice(0, 3)} ${k.slice(3)}` : k);
const dayWord = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T00:00:00Z'));
/** The spoken script: from the real numbers only. null when there is no terrain. */
export function volScript(T, V) {
  if (!T) return null;
  const hi = T.latest[0], pk = T.peaks[0], n = T.nm;
  let s = `Now the volatility landscape. Each ridge is how stretched a day's range was against that market's own normal, over the last ${T.ns} sessions. `;
  s += T.stretched ? `On the latest session, ${T.stretched} of ${n} markets ran at least one and a half times their normal range, led by ${say(hi.key)} at ${hi.v.toFixed(1)} times. ` : `On the latest session, none of the ${n} markets ran at one and a half times its normal range; the highest was ${say(hi.key)} at ${hi.v.toFixed(1)} times. `;
  s += `The tallest ridge in the window is ${say(pk.key)} on ${dayWord(pk.date)}, at ${pk.v >= 2.995 ? 'three times or more' : pk.v.toFixed(1) + ' times'} its normal. `;
  if (V && V.ratio != null) s += `The VIX curve is ${V.inverted ? 'inverted: spot is above the three-month, so the front is priced dearer' : 'sloping upward: spot is below the three-month'}. `;
  return s + 'This describes what already happened. It is not a forecast.';
}
