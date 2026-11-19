// js/terminal/jarvisWxCore.js: the pure half of MARKET WEATHER: one little weather scene per asset class and per currency, driven by that group's OWN measured move today.
// Each market's move is already in units of its own usual open-to-close move (jarvisCandles.candleRows: `ratio`). A group's weather is the average of its members' ratios (how far the group has moved,
// signed) and the average size of their moves (how much is going on, whatever the direction):
//   quiet (small moves)  -> Clear        up a little  -> Cloudy-neutral / Warm      up a lot -> Hot
//   down a little -> Rain                down a lot -> Storm                         big moves both ways -> Choppy (wind)
// DESCRIPTION OF TODAY SO FAR, never a forecast: the words say "so far today" and the view's legend says it is not an outlook.
import { MARKET_KEYS } from './jarvisMarkets.js';
import { marketName, currencyName } from './jarvisNames.js';

const FX = MARKET_KEYS.filter(k => /^[A-Z]{6}$/.test(k) && k !== 'BTCUSD'), MAJORS = MARKET_KEYS.slice(0, 7);
export const GROUPS = [
  { id: 'stocks', label: 'Stocks', keys: ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'] },
  { id: 'metals', label: 'Metals', keys: ['GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM'] },
  { id: 'energy', label: 'Energy', keys: ['WTI', 'BRENT', 'NATGAS'] },
  { id: 'farm', label: 'Farm', keys: ['SOYBEAN', 'WHEAT', 'CORN', 'SUGAR'] },
  { id: 'crypto', label: 'Crypto', keys: ['BTCUSD'] },
  { id: 'fxmaj', label: 'FX majors', keys: MAJORS },
  { id: 'fxcross', label: 'FX crosses', keys: FX.filter(k => !MAJORS.includes(k)) },
];
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const WORD = { clear: 'Clear', warm: 'Warm', hot: 'Hot', cloud: 'Cloudy', rain: 'Rain', storm: 'Storm', wind: 'Choppy' };
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** The condition from the group's average signed move (avg) and average size of move (size), both in usual-move units. */
export function condition(avg, size) {
  if (size < 0.6) return 'clear';
  if (size >= 0.9 && Math.abs(avg) < 0.45 * size) return 'wind';
  if (avg >= 1.5) return 'hot';
  if (avg >= 0.5) return 'warm';
  if (avg > -0.5) return 'cloud';
  if (avg > -1.5) return 'rain';
  return 'storm';
}

/** One entry per asset class that has at least one market in the feed. rows = jarvisCandles.candleRows output. */
export function groupWeather(rows) {
  const by = new Map((rows ?? []).map(r => [r.key, r])), out = [];
  for (const g of GROUPS) {
    const m = g.keys.map(k => by.get(k)).filter(Boolean); if (!m.length) continue;
    const r = m.map(x => x.body), avg = mean(r), size = mean(r.map(Math.abs)), top = [...m].sort((a, b) => Math.abs(b.ratio) - Math.abs(a.ratio))[0];
    out.push({ id: g.id, label: g.label, n: m.length, avg, size, cond: condition(avg, size), top: { key: top.key, ratio: top.ratio, name: marketName(top.key, { short: true }) } });
  }
  return out;
}

/** One entry per currency with at least three pairs in the feed: strength = the average of (+move as the base, -move as the quote). */
export function ccyWeather(rows) {
  const acc = Object.fromEntries(CCYS.map(c => [c, []])); let top = {};
  for (const r of rows ?? []) {
    if (!/^[A-Z]{6}$/.test(r.key) || r.key === 'BTCUSD') continue;
    const b = r.key.slice(0, 3), q = r.key.slice(3);
    if (acc[b]) { acc[b].push(r.body); (top[b] ??= []).push(r); }
    if (acc[q]) { acc[q].push(-r.body); (top[q] ??= []).push(r); }
  }
  const out = [];
  for (const c of CCYS) {
    const v = acc[c]; if (v.length < 3) continue;
    const avg = mean(v), size = mean(v.map(Math.abs));
    out.push({ id: c, label: currencyName(c), code: c, n: v.length, avg, size, cond: condition(avg, size) });
  }
  return out;
}

/** The spoken line for the SHOW (kept short: the morning view must not drag). */
export function wxScript(groups, ccys) {
  const g = [...(groups ?? [])].sort((a, b) => a.avg - b.avg), say = x => (Math.abs(x) < 10 ? Math.abs(x).toFixed(1) : String(Math.round(Math.abs(x))));
  if (!g.length) return null;
  const worst = g[0], best = g[g.length - 1], calm = g.filter(x => x.cond === 'clear').length, parts = ['Market weather, so far today.'];
  if (worst.avg <= -0.5) parts.push(`${worst.label} is ${worst.cond === 'storm' ? 'stormy' : 'rainy'}, down ${say(worst.avg)} times its usual move.`);
  if (best.avg >= 0.5 && best.id !== worst.id) parts.push(`${best.label} is the warmest, up ${say(best.avg)} times.`);
  if (calm) parts.push(`${calm} ${calm === 1 ? 'group is' : 'groups are'} quiet.`);
  const c = [...(ccys ?? [])].sort((a, b) => b.avg - a.avg);
  if (c.length >= 2) parts.push(`Strongest currency ${c[0].label}, weakest ${c[c.length - 1].label}.`);
  parts.push('A description, not a forecast.');
  return parts.join(' ');
}
