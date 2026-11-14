/**
 * The Desk Terminal REPLAY ("time machine"), stage 1: the pure core. No fetch, no DOM, no clock except what is passed in.
 *
 * Pick a London session day, go back to it, and play it forward: candles draw in, the levels that were KNOWN at that moment sit on the chart and the
 * touches of them are logged, the price-based currency strength moves, and the desk's book shows what it said. Everything here is "as of" a moment:
 *
 *   sessionWindow / londonDate / londonWall   the London calendar (a session is the Europe/London calendar day, DST-aware)
 *   aggregateM1 / m1Count / barsAt            minute bars -> the chosen timeframe, with the still-FORMING bar built from the minutes that have finished
 *   activeOi / oiLines / forecastLines        the levels as known at ts: the option-OI walls, max pain and flips from the last capture saved before ts
 *                                             (point-in-time: the capture's own saved time, never the trade date), the forecast lines from the session open
 *   levelsAt / scanTouches                    one list of lines at ts, and every touch of them over the day (a touch = price within a tolerance of a line)
 *   strengthAt / deskAt                       the as-of lookups for the strength series and the desk book (snapshot, else the dawn run, else nothing)
 *   captionFor                                a rule-built sentence that DESCRIBES the moment. It never says what price will do.
 *   parseReplayHash / formatReplayHash        the deep link #replay/NQ/2026-11-12T14:30 (London wall clock; a trailing Z means UTC)
 *   coverageRows                              what each layer can replay, and from when, with what is missing said plainly
 *
 * Honest by construction: a layer with nothing recorded at ts returns null, never a guess; a level carries the date it was published and the date
 * it is for; touches are described, and the Evidence Book still says a line touch is not an edge (line-touch book: gross +0.19R, fails net).
 *   node --test js/replayCore.test.mjs
 */
import { zonedEpoch } from './yieldLegs.js';

const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const fin = v => v != null && Number.isFinite(+v);

/** The markets the replay can draw. oanda = candle symbol, oi = the key in the OI store (null: no option book), dp = price decimals, mult/unit = distance units. */
export const INSTRUMENTS = {
  EURUSD: { label: 'EUR/USD', oanda: 'EUR_USD', oi: 'EUR/USD', dp: 5, mult: 10000, unit: 'pips' },
  GBPUSD: { label: 'GBP/USD', oanda: 'GBP_USD', oi: 'GBP/USD', dp: 5, mult: 10000, unit: 'pips' },
  USDJPY: { label: 'USD/JPY', oanda: 'USD_JPY', oi: 'USD/JPY', dp: 3, mult: 100, unit: 'pips' },
  AUDUSD: { label: 'AUD/USD', oanda: 'AUD_USD', oi: 'AUD/USD', dp: 5, mult: 10000, unit: 'pips' },
  NZDUSD: { label: 'NZD/USD', oanda: 'NZD_USD', oi: null, dp: 5, mult: 10000, unit: 'pips' },
  USDCAD: { label: 'USD/CAD', oanda: 'USD_CAD', oi: 'USD/CAD', dp: 5, mult: 10000, unit: 'pips' },
  USDCHF: { label: 'USD/CHF', oanda: 'USD_CHF', oi: 'USD/CHF', dp: 5, mult: 10000, unit: 'pips' },
  GOLD: { label: 'Gold', oanda: 'XAU_USD', oi: 'XAU/USD', dp: 2, mult: 1, unit: '$' },
  NQ: { label: 'Nasdaq 100', oanda: 'NAS100_USD', oi: 'NAS100_USD', dp: 1, mult: 1, unit: 'pts' },
  SPX500: { label: 'S&P 500', oanda: 'SPX500_USD', oi: 'SPX500_USD', dp: 1, mult: 1, unit: 'pts' },
  US30: { label: 'Dow 30', oanda: 'US30_USD', oi: 'US30_USD', dp: 1, mult: 1, unit: 'pts' },
  US2000: { label: 'Russell 2000', oanda: 'US2000_USD', oi: 'US2000_USD', dp: 1, mult: 1, unit: 'pts' },
};
export const DEFAULT_INST = 'NQ';
/** Real-time multiples: 1x is one second of market per second. 300x is one five-minute bar per second. */
export const SPEEDS = [1, 2, 5, 10, 60, 300];
export const TIMEFRAMES = [{ key: '1m', min: 1 }, { key: '5m', min: 5 }, { key: '15m', min: 15 }, { key: '1h', min: 60 }];
export const HORIZONS = ['1H', '4H', '1D', '1W'];
/** A touch = the price came within this share of the line (0.02% = 5.6 points on the Nasdaq at 27,850, 2.2 pips on EUR/USD). */
export const TOUCH_TOL_PCT = 0.02;

export const fmtPrice = (inst, p) => (fin(p) ? Number(p).toLocaleString('en-GB', { minimumFractionDigits: INSTRUMENTS[inst]?.dp ?? 2, maximumFractionDigits: INSTRUMENTS[inst]?.dp ?? 2 }) : '–');
const sgn = (v, d = 1) => (!fin(v) ? '–' : Number(Math.abs(v).toFixed(d)) === 0 ? (0).toFixed(d) : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`);
const ord = n => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;

// ── the London calendar ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(s) {
  if (!DATE_RE.test(String(s ?? ''))) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s;
}
const lDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const lHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** 'YYYY-MM-DD' of the London calendar day containing ms. */
export const londonDate = ms => lDate.format(new Date(ms));
/** 'HH:MM' London wall clock. */
export const londonHM = ms => lHM.format(new Date(ms));
export const utcHM = ms => new Date(ms).toISOString().slice(11, 16);
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const nextDate = date => addDays(date, 1);
export const prevDate = date => addDays(date, -1);
/** UTC ms of a London wall-clock time on a London date. */
export const londonWall = (date, hh = 0, mm = 0) => zonedEpoch(date, hh, mm, 'Europe/London') * 1000;
/** The London session day: start (00:00 London) to the next 00:00. 23, 24 or 25 hours across a clock change. */
export const sessionWindow = date => ({ date, start: londonWall(date, 0, 0), end: londonWall(nextDate(date), 0, 0) });

// ── the deep link ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** '#replay/NQ/2026-11-12T14:30' (London wall clock) or '...T13:30Z' (UTC) -> { inst, date, ts } or null. A bare date starts at 00:00 London. */
export function parseReplayHash(hash) {
  const m = String(hash ?? '').match(/^#?replay\/([A-Za-z0-9]+)(?:\/(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(Z)?)?)?$/);
  if (!m) return null;
  const inst = m[1].toUpperCase();
  if (!INSTRUMENTS[inst]) return null;
  if (!m[2]) return { inst, date: null, ts: null };
  if (!validDate(m[2])) return null;
  let ts, date = m[2];
  if (m[3] == null) ts = londonWall(date, 0, 0);
  else {
    const hh = +m[3], mm = +m[4]; if (hh > 23 || mm > 59) return null;
    ts = m[5] ? Date.parse(`${date}T${m[3]}:${m[4]}:00Z`) : londonWall(date, hh, mm);
    date = londonDate(ts);
  }
  return { inst, date, ts };
}
export const formatReplayHash = (inst, ts) => `#replay/${inst}/${londonDate(ts)}T${londonHM(ts)}`;

// ── the clock ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Play for realDtMs of the viewer's time. Stops at the end of the window. state = { ts, speed, playing }. */
export function advance(state, realDtMs, win) {
  if (!state.playing) return state;
  const ts = state.ts + realDtMs * state.speed;
  return ts >= win.end ? { ...state, ts: win.end, playing: false, ended: true } : { ...state, ts, ended: false };
}
export const stepTo = (state, deltaMs, win) => ({ ...state, ts: clamp(state.ts + deltaMs, win.start, win.end), playing: false, ended: false });
/** While playing, a stretch with no price bars at all (a weekend, the daily break) is skipped: returns the time of the next bar if more than gapMs away, else null. */
export function gapJump(m1, ts, gapMs = 20 * MIN) {
  const n = m1Count(m1, ts);
  if (n >= m1.length) return null;
  const next = m1[n][0];
  return next - ts > gapMs ? next : null;
}

// ── candles ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** m1 = ascending rows [t (ms, bar OPEN), o, h, l, c]. The number of minutes that have FINISHED by ts (t + 1 min <= ts). */
export function m1Count(m1, ts) {
  let lo = 0, hi = m1.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (m1[m][0] + MIN <= ts) { k = m; lo = m + 1; } else hi = m - 1; }
  return k + 1;
}
/** Minutes -> bars of tfMin minutes, UTC-aligned like OANDA's. Each bar keeps i0..i1, its minute range. */
export function aggregateM1(m1, tfMin) {
  const step = tfMin * MIN, out = [];
  for (let i = 0; i < m1.length; i++) {
    const r = m1[i], k = Math.floor(r[0] / step) * step, a = out[out.length - 1];
    if (a && a.t === k) { a.h = Math.max(a.h, r[2]); a.l = Math.min(a.l, r[3]); a.c = r[4]; a.i1 = i; } else out.push({ t: k, o: r[1], h: r[2], l: r[3], c: r[4], i0: i, i1: i });
  }
  return out;
}
/** The bars as they stood when n minutes had finished: whole bars, plus the forming one built from the minutes so far. */
export function barsAt(agg, m1, n) {
  if (!n || !agg.length) return [];
  let lo = 0, hi = agg.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (agg[m].i0 < n) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return [];
  const out = agg.slice(0, k), b = agg[k];
  if (b.i1 < n) { out.push(b); return out; }
  let h = -Infinity, l = Infinity;
  for (let i = b.i0; i < n; i++) { if (m1[i][2] > h) h = m1[i][2]; if (m1[i][3] < l) l = m1[i][3]; }
  out.push({ t: b.t, o: b.o, h, l, c: m1[n - 1][4], i0: b.i0, i1: n - 1, forming: true });
  return out;
}
/** The session's open: the first minute at or after the London midnight. { price, t } or null. */
export function sessionOpen(m1, win) {
  const r = m1.find(x => x[0] >= win.start && x[0] < win.end);
  return r ? { price: r[1], t: r[0] } : null;
}

// ── levels, as known at the moment ──────────────────────────────────────────────────────────────────────────────────────────────
/** The OI capture in force at ts: the entry with the LATEST saved time not after ts (entry.savedAtMs is when the capture was written, so a level is never shown before it existed). */
export function activeOi(entries, ts) {
  let best = null;
  for (const e of entries ?? []) if (fin(e?.savedAtMs) && e.savedAtMs <= ts && (!best || e.savedAtMs > best.savedAtMs)) best = e;
  return best;
}
const WALL_LABEL = { call: 'Call wall', put: 'Put wall', maxpain: 'Max pain', gammaflip: 'Gamma flip', gexflip: 'GEX flip' };
/**
 * The lines one OI capture gives: its three biggest call walls and put walls (by open interest) among those within 3% of the spot at the capture
 * (a wall 6% away cannot meet price in a day, so it would only squash the chart; if none is that near the biggest are used), max pain, the gamma flip
 * and the first GEX flip.
 */
export function oiLines(entry, { walls = 3, near = 0.03 } = {}) {
  if (!entry) return [];
  const out = [], push = (type, price, extra = {}) => { if (fin(price)) out.push({ id: `oi:${type}:${Math.round(price * 100)}`, kind: 'oi', type, label: WALL_LABEL[type], price: +price, ...extra }); };
  const top = a => {
    const all = [...(a ?? [])].filter(w => fin(w?.strike));
    const close = fin(entry.spot) && entry.spot > 0 ? all.filter(w => Math.abs(w.strike / entry.spot - 1) <= near) : all;
    return (close.length ? close : all).sort((x, y) => (y.oi ?? 0) - (x.oi ?? 0)).slice(0, walls);
  };
  for (const w of top(entry.callWalls)) push('call', w.strike, { tier: w.tier ?? null, oi: w.oi ?? null });
  for (const w of top(entry.putWalls)) push('put', w.strike, { tier: w.tier ?? null, oi: w.oi ?? null });
  push('maxpain', entry.maxPain);
  push('gammaflip', entry.gammaFlip);
  if (entry.gexFlips?.[0]) push('gexflip', entry.gexFlips[0].price, { dir: entry.gexFlips[0].dir ?? null });
  return out;
}
const FC_LINES = [{ id: 'H75', key: 'hl_75', side: 1, label: 'Forecast high p75' }, { id: 'H50', key: 'hl_median', side: 1, label: 'Forecast high median' },
  { id: 'L50', key: 'hl_median', side: -1, label: 'Forecast low median' }, { id: 'L75', key: 'hl_75', side: -1, label: 'Forecast low p75' }];
/** The vol forecast's lines for the session: the open moved by the archived percent. The archive holds the median and p75, not a p90. */
export function forecastLines(fc, openPrice) {
  if (!fc || !fin(openPrice)) return [];
  return FC_LINES.filter(l => fin(fc[l.key])).map(l => ({ id: `fc:${l.id}:${l.side}`, kind: 'fc', type: l.id, label: l.label, price: openPrice * (1 + l.side * fc[l.key] / 100), pct: l.side * fc[l.key] }));
}
/**
 * Every line on the chart at ts. ctx = { oi: [entries], fc: { ...pcts, knownFrom }, open: { price, t } }.
 * OI lines come from the capture in force (and carry the date they were published and the session they are for, and whether they are stale);
 * the forecast lines and the open exist from the first minute of the session, or from when the forecast was computed if that was later.
 */
export function levelsAt(ctx, ts) {
  const out = [], e = activeOi(ctx?.oi, ts);
  if (e) for (const l of oiLines(e)) out.push({ ...l, publishedAt: e.savedAtMs, publishedDate: e.date ?? null, tradeDate: e.asOf ?? null, stale: ts - e.savedAtMs > 3 * DAY });
  if (ctx?.open && ts >= ctx.open.t) {
    out.push({ id: 'open', kind: 'open', type: 'open', label: 'Session open', price: ctx.open.price });
    if (ctx.fc && (!fin(ctx.fc.knownFrom) || ts >= ctx.fc.knownFrom)) out.push(...forecastLines(ctx.fc, ctx.open.price));
  }
  return out;
}

/**
 * Every touch of a line over the day, in order. A touch is a minute whose range comes within tolPct of a line that was on the chart at that minute;
 * it counts once until price has gone away by three tolerances (so a price chopping on a line is one touch, not forty). The open line is not a touch.
 * Each event depends only on minutes up to its own time, so filtering the list by ts is lookahead-free.
 */
export function scanTouches(m1, ctx, { tolPct = TOUCH_TOL_PCT } = {}) {
  const out = [], st = new Map(), n = new Map();
  for (let i = 0; i < m1.length; i++) {
    const [t, o, h, l, c] = m1[i];
    const prevC = i ? m1[i - 1][4] : o;
    for (const ln of levelsAt(ctx, t)) {
      if (ln.kind === 'open') continue;
      const tol = Math.abs(ln.price) * tolPct / 100, s = st.get(ln.id) ?? { inside: false };
      const touching = l - tol <= ln.price && ln.price <= h + tol;
      if (touching && !s.inside) { s.inside = true; const k = (n.get(ln.id) ?? 0) + 1; n.set(ln.id, k); out.push({ t: t + MIN, id: ln.id, label: ln.label, type: ln.type, kind: ln.kind, price: ln.price, from: prevC < ln.price ? 'below' : 'above', n: k }); }
      else if (!touching && (l > ln.price + 3 * tol || h < ln.price - 3 * tol)) s.inside = false;
      st.set(ln.id, s);
    }
  }
  return out;
}
/** The touches that had happened by ts (an event at t is known once its minute has finished). */
export const touchesAt = (events, ts) => (events ?? []).filter(e => e.t <= ts);

// ── strength and the desk, as of ts ─────────────────────────────────────────────────────────────────────────────────────────────
/** series = { ccys, stepMs, steps: [{ t, closed, h: { '1H': [8 scores in ccys order] | null } }] } (server, js/replayStrength.js). The last step at or before ts. */
export function strengthAt(series, ts) {
  const s = series?.steps;
  if (!s?.length) return null;
  let lo = 0, hi = s.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].t <= ts) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0 || s[k].ok === false) return null;
  return { t: s[k].t, closed: !!s[k].closed, h: s[k].h, ccys: series.ccys };
}
/** One horizon of a strength step as [{ ccy, score }] strongest first, or null. */
export function ranked(step, hz) {
  const v = step?.h?.[hz];
  if (!v) return null;
  return step.ccys.map((ccy, i) => ({ ccy, score: v[i] })).filter(x => fin(x.score)).sort((a, b) => b.score - a.score);
}
/**
 * What the desk had said at ts, for this market. Order of trust: the newest stored snapshot point at or before ts (CORE, since the capture began;
 * viewer-safe: no sizes), else the morning book of that day once it had finished, else null. { source, asOf, tone, rating, conviction, ccy }.
 */
export function deskAt({ points = [], dawn = null, ts, inst }) {
  let best = null;
  for (const p of points ?? []) if (fin(p?.ts) && p.ts <= ts && p.d?.desk && (!best || p.ts > best.ts)) best = p;
  if (best) {
    const d = best.d.desk, r = d.instruments?.[inst];
    return { source: 'snapshot', asOf: best.inputs?.desk?.asOf ?? new Date(best.ts).toISOString(), at: best.ts, tone: d.tone ?? null, rating: r?.rating ?? null, conviction: r?.conviction ?? null, ccy: d.ccy ?? null };
  }
  if (dawn && fin(dawn.finishedMs) && dawn.finishedMs <= ts) return { source: 'dawn', asOf: dawn.finishedAt, at: dawn.finishedMs, tone: dawn.tone ?? null, rating: dawn.rating ?? null, conviction: null, ccy: null };
  return null;
}

// ── the running caption ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const isFx = inst => INSTRUMENTS[inst]?.unit === 'pips';
const lineName = l => l.label.toLowerCase();
/**
 * One sentence of what is on the screen, in the order a reader looks: the price and where it is against the lines, how much of the forecast range
 * has been used, who is strong and weak, and what the desk's book said. It describes. It does not say what price will do next.
 */
export function captionFor({ ts, inst, price, lines = [], counts = {}, dayHi = null, dayLo = null, open = null, fc = null, strength = null, hz = '4H', desk = null, marketClosed = false }) {
  const I = INSTRUMENTS[inst]; if (!I || !fin(price)) return `${londonHM(ts)} London · no price yet`;
  const parts = [`${londonHM(ts)} London (${utcHM(ts)} UTC) · ${I.label} ${fmtPrice(inst, price)}`];
  if (open && fin(open.price)) parts[0] += `, ${sgn((price / open.price - 1) * 100, 2)}% from the session open`;
  if (marketClosed) parts.push('the market is closed');
  const cand = lines.filter(l => l.kind !== 'open' && fin(l.price));
  const dist = l => `${(Math.abs(price - l.price) * I.mult).toLocaleString('en-GB', { maximumFractionDigits: isFx(inst) ? 0 : I.dp ? 1 : 0 })} ${I.unit}`;
  const nameOf = l => `${lineName(l)} ${fmtPrice(inst, l.price)}`;
  const at = cand.filter(l => Math.abs(price - l.price) <= Math.abs(l.price) * TOUCH_TOL_PCT / 100);
  if (at.length) {
    const l = at.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0], k = counts[l.id] ?? 1;
    parts.push(`price is at the ${nameOf(l)}, its ${ord(k)} touch so far`);
  } else {
    const above = cand.filter(l => l.price > price).sort((a, b) => a.price - b.price)[0], below = cand.filter(l => l.price < price).sort((a, b) => b.price - a.price)[0];
    if (above && below) parts.push(`between the ${nameOf(below)} (${dist(below)} below) and the ${nameOf(above)} (${dist(above)} above)`);
    else if (above) parts.push(`${dist(above)} below the ${nameOf(above)}`);
    else if (below) parts.push(`${dist(below)} above the ${nameOf(below)}`);
  }
  if (fc && open && fin(fc.hl_median) && fin(dayHi) && fin(dayLo) && open.price > 0) {
    const med = open.price * fc.hl_median / 100;
    if (med > 0) parts.push(`the day's range so far is ${Math.round((dayHi - dayLo) / med * 100)}% of the forecast median range`);
  }
  const rk = ranked(strength, hz);
  if (rk?.length >= 2) parts.push(`over ${hz} the strongest currency is ${rk[0].ccy} (${sgn(rk[0].score)}σ) and the weakest ${rk[rk.length - 1].ccy} (${sgn(rk[rk.length - 1].score)}σ)`);
  if (desk?.rating) parts.push(`the desk's ${desk.source === 'dawn' ? 'morning' : 'latest'} book on this market: ${String(desk.rating).toLowerCase()}`);
  return parts.join('; ') + '.';
}

// ── coverage ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** meta = /api/replay/meta. Rows: { layer, status: 'full' | 'partial' | 'none', from, to, note } in the order the page lists them. */
export function coverageRows(meta) {
  if (!meta?.ok) return [];
  const c = meta.coverage ?? {}, rows = [];
  rows.push({ layer: 'Price candles', status: c.candles?.from ? 'full' : 'partial', from: c.candles?.from ?? null, to: 'now',
    note: `One-minute bars from the broker's history${c.candles?.from ? '' : ' (how far back this market goes was not found)'}; the chart builds the 5-minute, 15-minute and hourly candles from them, including the forming candle.` });
  rows.push({ layer: 'Option levels (walls, max pain, flips)', status: meta.instrument?.oi ? (c.oi?.days ? 'partial' : 'none') : 'none', from: c.oi?.from ?? null, to: c.oi?.to ?? null,
    note: meta.instrument?.oi ? `${c.oi?.days ?? 0} nightly captures. A level appears when its capture was saved (about 06:45 London the next morning), so the replay shows the previous night's book, as it was then. Before ${c.oi?.from ?? 'the first capture'} nothing is shown. Intraday option levels exist only for the S&P and Nasdaq (a 15-minute Cboe log since 2026-11-01) and are not drawn yet.` : 'This market has no option book in the capture.' });
  rows.push({ layer: 'Forecast lines (median, p75)', status: c.forecast?.from ? 'partial' : 'none', from: c.forecast?.from ?? null, to: c.forecast?.to ?? null,
    note: 'The vol forecast archived for each session, drawn from the session open. The archive holds the median and the 75th percentile, not a 90th.' });
  rows.push({ layer: 'Currency strength (σ)', status: 'full', from: c.candles?.from ?? null, to: 'now',
    note: 'Rebuilt from the broker bars of all 28 pairs, as of each 15 minutes, with each pair\'s normal move taken only from the bars before that moment.' });
  rows.push({ layer: 'Desk book (the morning read)', status: c.desk?.days?.length ? 'partial' : 'none', from: c.desk?.from ?? null, to: c.desk?.to ?? null,
    note: 'The morning book of each day, shown from the minute it finished, as a lean (long, short, flat) on this market. The currency bias strip and every later update exist only from the day the snapshot capture began.' });
  rows.push({ layer: 'Terminal snapshots (bias, tiles, regime)', status: c.snapshots?.days?.length ? 'partial' : 'none', from: c.snapshots?.from ?? null, to: c.snapshots?.to ?? null,
    note: 'Saved every 5 minutes while the market is open since the capture began. There is no backfill: before that date the panel says "not recorded then" and nothing is estimated.' });
  return rows;
}
