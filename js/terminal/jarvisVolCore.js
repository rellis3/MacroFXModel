// js/terminal/jarvisVolCore.js: the pure half of Jarvis's VOL view, a landscape of "range used". For each desk market and each of the last ~60 completed sessions: the day's high-low range
// (as a percent of price) divided by that market's OWN normal range, the median of its previous 20 sessions' ranges (point-in-time, so a day never sets its own yardstick). 1.0 = a normal day for that market.
// Source: /api/ohlc-range daily bars (OANDA), the VIX curve from /api/fredhistory. DESCRIPTION ONLY: how stretched each day was; never a forecast, never a trade.
import { spokenName } from './jarvisNames.js';
import { closuresBetween } from '../marketCalendars.js';
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const CLIP = 3, LOOKBACK = 20, MIN_PRIOR = 10, SESSIONS = 60, BASE_N = 250;

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
  // Z keeps 1 in a missing cell so the drawn terrain stays level there; `has` marks the cells that were measured, and every READ (latest, peaks, stretched, recentRange)
  // uses only those, so a market with no bar is never said to be "1.0 times normal" nor averaged in as normal (Helix review 0.7)
  const nm = mk.length, ns = dates.length, Z = new Float32Array(nm * ns).fill(1), has = new Uint8Array(nm * ns), Zraw = new Float32Array(nm * ns).fill(NaN); let missing = 0;
  const own = [];       // per market, every session's unclipped ratio (null under minPrior), for the point-in-time base rates (Helix review wave 1.2)
  mk.forEach((m, i) => {
    const bars = barsByKey[m.key], at = new Map(bars.map((b, k) => [b.date, k]));
    const rs = bars.map((b, k) => { const prior = bars.slice(Math.max(0, k - lookback), k).map(x => x.r); return prior.length < minPrior ? null : b.r / median(prior); }); own.push({ rs, at });
    for (let j = 0; j < ns; j++) {
      const k = at.get(dates[j]); if (k == null || rs[k] == null) { missing++; continue; }
      Z[j * nm + i] = clamp(rs[k], 0, CLIP); Zraw[j * nm + i] = rs[k]; has[j * nm + i] = 1;
    }
  });
  /** How often market i ran at least x times normal over its own `base` sessions BEFORE date (point in time): { c, n } or null under 40 sessions. */
  const rarity = (i, date, x, base = BASE_N) => { const { rs, at } = own[i], k = at.get(date); if (k == null) return null; const pr = rs.slice(Math.max(0, k - base), k).filter(v => v != null); return pr.length >= 40 ? { c: pr.filter(v => v >= x).length, n: pr.length } : null; };
  const latest = mk.map((m, i) => (has[(ns - 1) * nm + i] ? { key: m.key, v: Z[(ns - 1) * nm + i] } : null)).filter(Boolean).sort((a, b) => b.v - a.v);
  const peaks = mk.map((m, i) => { let bj = -1; for (let j = 0; j < ns; j++) if (has[j * nm + i] && (bj < 0 || Z[j * nm + i] > Z[bj * nm + i])) bj = j; return bj < 0 ? null : { key: m.key, date: dates[bj], v: Z[bj * nm + i], j: bj, i }; }).filter(Boolean).sort((a, b) => b.v - a.v);
  // the base rates, beside the clipped reads: the tallest ridge's own unclipped size and how rare it was for that market; how many markets a typical day runs at 1.5x
  const pk0 = peaks[0]; if (pk0) { pk0.raw = Zraw[pk0.j * nm + pk0.i]; pk0.rare = rarity(pk0.i, pk0.date, pk0.raw); }
  let expStretched = 0, expN = 0; const dl = dates[ns - 1];
  mk.forEach((m, i) => { if (!has[(ns - 1) * nm + i]) return; const r = rarity(i, dl, 1.5); if (r) { expStretched += r.c / r.n; expN++; } });
  return { markets: mk.map(m => ({ key: m.key, group: m.group })), dates, Z, Zraw, has, nm, ns, missing, latest, latestN: latest.length, stretched: latest.filter(x => x.v >= 1.5).length, peaks,
    base: expN ? { stretched: expStretched, n: expN } : null };
}
/** The VIX curve read: spot against three-month. Above 1 = inverted (the front costs more than the three-month). null when VIX is missing. */
export function vixCurve(h) {
  const last = s => { const a = Array.isArray(s) ? s : []; for (let i = a.length - 1; i >= 0; i--) { const v = num(a[i]?.value); if (v != null) return { v, date: a[i].date }; } return null; };
  const v = last(h?.vix); if (!v) return null; const m = last(h?.vix3m), ratio = m && m.v > 0 ? v.v / m.v : null;
  // side by side (Helix review 0.2): how many sessions the inversion has run, so the validated first-day fact (Evidence Book vix-inversion) is said only on day one
  const m3 = new Map((Array.isArray(h?.vix3m) ? h.vix3m : []).map(p => [p?.date, num(p?.value)])), rs = [];
  for (const p of (Array.isArray(h?.vix) ? h.vix : []).slice().reverse()) { const a = num(p?.value), b = m3.get(p?.date); if (a != null && b > 0) rs.push(a / b); if (rs.length >= 30) break; }
  let runDays = 0; while (runDays < rs.length && rs[runDays] > 1) runDays++;
  const firstDay = ratio != null && ratio > 1 && runDays === 1 && rs.length >= 2;
  return { vix: v.v, vix3m: m?.v ?? null, ratio, inverted: ratio != null && ratio > 1, date: v.date, runDays, firstDay };
}
/** The VIX-curve sentence for the BRIEF: description, plus the Evidence Book's vix-inversion result (range, not direction) on the first day of an inversion only. */
export function vixLine(V) {
  if (!V || V.ratio == null) return null;
  if (!V.inverted) return 'The VIX curve slopes upward, the calm shape.';
  if (V.firstDay) return 'The VIX curve inverted today: spot is above the three-month. In the desk\'s tests, the first day of an inversion has been followed by a wider week than usual, in range, not direction.';
  return `The VIX curve is inverted: spot is above the three-month${V.runDays > 1 ? `, for ${V.runDays} sessions now` : ''}. The desk's tested result, a wider week, is for the first day of an inversion only.`;
}
const say = spokenName;
const dayWord = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T00:00:00Z'));
/** The spoken script: from the real numbers only. null when there is no terrain. */
export function volScript(T, V) {
  if (!T) return null;
  const hi = T.latest[0], pk = T.peaks[0], n = T.latestN ?? T.nm; if (!hi || !pk) return null;
  let s = `Now the volatility landscape. Each ridge is how stretched a day's range was against that market's own normal, over the last ${T.ns} sessions. `;
  const typ = T.base && T.base.n >= 3 ? ` On a typical day, ${T.base.stretched < 0.5 ? 'fewer than one' : `about ${Math.round(T.base.stretched)}`} would.` : '';
  s += T.stretched ? `On the latest session, ${T.stretched} of ${n} markets ran at least one and a half times their normal range, led by ${say(hi.key)} at ${hi.v.toFixed(1)} times.${typ} ` : `On the latest session, none of the ${n} markets ran at one and a half times its normal range; the highest was ${say(hi.key)} at ${hi.v.toFixed(1)} times.${typ} `;
  // the real size of the tallest ridge (not the drawn cap) and how rare that was for that market, from its own sessions before it (Helix review wave 1.2)
  const raw = Number.isFinite(pk.raw) ? pk.raw : pk.v, rr = pk.rare;
  const rare = !rr ? '' : rr.c === 0 ? `, the biggest in its previous ${rr.n} sessions` : rr.n / rr.c >= 2 ? `, about a one-in-${Math.round(rr.n / rr.c)} day for it` : '';
  s += `The tallest ridge in the window is ${say(pk.key)} on ${dayWord(pk.date)}, at ${raw.toFixed(1)} times its normal${raw > CLIP ? ', above the top of the scale' : ''}${rare}. `;
  if (V && V.ratio != null) s += `The VIX curve is ${V.inverted ? 'inverted: spot is above the three-month, so the front is priced dearer' : 'sloping upward: spot is below the three-month'}. `;
  return s + 'This describes what already happened. It is not a forecast.';
}

// ───────── THE BRIEF's read (owner, 26 Nov 2026: "volatility is not giving any advice or analysis, just explaining the charts") ─────────
export const VOL_CORE = ['NQ', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];
/** Each core market's average range used over the last `n` sessions (1 = normal), busiest first: [{ key, v, last }]. */
export function recentRange(T, n = 5) {
  if (!T) return [];
  const ok = (j, i) => !T.has || T.has[j * T.nm + i] === 1;      // a missing cell is not a normal day
  return VOL_CORE.map(key => { const i = T.markets.findIndex(m => m.key === key); if (i < 0) return null; let s = 0, c = 0; for (let j = Math.max(0, T.ns - n); j < T.ns; j++) { if (!ok(j, i)) continue; s += T.Z[j * T.nm + i]; c++; } return c ? { key, v: s / c, last: ok(T.ns - 1, i) ? T.Z[(T.ns - 1) * T.nm + i] : null } : null; })
    .filter(Boolean).sort((a, b) => b.v - a.v);
}
/** The spoken read: which of our markets are running hot or quiet this week, and the VIX curve. Description only (no stop or size advice). null without a terrain. */
export function volBrief(T, V) {
  const r = recentRange(T); if (!r.length) return null;
  const hot = r.filter(x => x.v >= 1.3), quiet = r.filter(x => x.v <= 0.8).reverse(), t = [];
  const one = x => `${say(x.key)} at ${x.v.toFixed(1)} times`;
  if (hot.length) t.push(`Over the last five sessions, ${listW(hot.slice(0, 3).map(one))} ${hot.length === 1 ? 'has' : 'have'} run above ${hot.length === 1 ? 'its' : 'their'} normal range.`);
  else t.push(`Over the last five sessions none of the markets we trade has run hot; the busiest is ${one(r[0])} its normal range.`);
  if (quiet.length) t.push(`Quiet: ${listW(quiet.slice(0, 2).map(one))}, where ranges have run tight.`);
  const vl = vixLine(V); if (vl) t.push(vl);
  const hn = holidayNote(T); if (hn) t.push(hn);
  return t.join(' ') + ' A description of ranges, not a forecast.';
}
/** The latest session's holiday, said as such (Helix review wave 1.10): "The latest session, Thursday 26 November, was Thanksgiving, a US holiday: its range is a holiday range." null on an ordinary day. */
export function holidayNote(T) {
  const d = T?.dates?.[T.ns - 1]; if (!d) return null;
  const c = closuresBetween(d, d), us = c.find(x => x.market === 'US stock market') ?? c[0]; if (!us) return null;
  return `The latest session, ${dayWord(d)}, was ${us.name.replace(/^Day after/, 'the day after')}, ${/early/.test(us.kind) ? 'a US half day' : us.market === 'US stock market' ? 'a US holiday' : `a ${us.market === 'UK' ? 'UK' : 'euro-area'} holiday`}: its range is a holiday range, not a calm market.`;
}
const listW = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/**
 * The SHOW camera's act at progress p (0..1): 'sweep' (LOW along the newest session's edge, the markets passing left to right, k = how far across),
 * 'rise' (up and back until the whole window is in view), 'over' (a slow high pass over the terrain with the tallest ridges named). k is eased 0..1 within the act.
 */
export function volShowAct(p) {
  const x = Math.max(0, Math.min(1, Number(p) || 0)), e = q => { const c = Math.max(0, Math.min(1, q)); return c * c * (3 - 2 * c); };
  if (x < 0.5) return { act: 'sweep', k: e(x / 0.5) };
  if (x < 0.75) return { act: 'rise', k: e((x - 0.5) / 0.25) };
  return { act: 'over', k: e((x - 0.75) / 0.25) };
}
/** The world column of each market when asset classes are separated by a one-column ravine: { cols: [market index or -1 for a gap], at: [column of market i] }. */
export function groupColumns(markets) {
  const cols = [], at = []; let last = null;
  (markets ?? []).forEach((m, i) => { if (last != null && m.group !== last) cols.push(-1); at[i] = cols.length; cols.push(i); last = m.group; });
  return { cols, at };
}
