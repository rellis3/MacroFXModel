/**
 * The morning tape: yesterday's full day AND the overnight move, each scaled to the market's normal day.
 *
 * On 2026-11-06 the morning issue showed Nasdaq +1.42%: the live price against Thursday's close (the overnight bounce).
 * Thursday's full day, -7.03% (28,537.8 to 26,531), appeared nowhere. Every edition that prints a day move (the V3
 * daily's tables, the magazine's tape and opening, the desk brief pictograph and the plain-text versions) now reads it
 * from here, so the numbers cannot diverge between them.
 *
 * Per market (an Atlas `assets` row: d1, d1Basis, d1AsOf, spark, hlMed, and optionally prevClose/lastClose and
 * yHigh/yLow/yDate from the OANDA daily candle):
 *   day   : the last full day, the last two daily closes, close to close.
 *   night : the live price against that close ("since Thu's close"), only when the basis is `live` (js/closeBasis.js).
 *   pos   : where the price sits in the last full day's high-to-low range (0% at the low, 100% at the high), or above
 *           its high / below its low.
 *
 * The unit (×) is the desk's own forecast of a normal day: the move divided by the market's forecast median day range,
 * high to low (hlMed, % of price; the p50 of the fitted ladder). It is the same unit as "share of a normal day's range
 * used" elsewhere in the issue, so 1× is a typical whole day. It is today's forecast, used for both moves.
 *
 * Nothing here forecasts a direction. Pure. Tested in js/morningTape.test.mjs.
 */
const MINUS = '−';
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const TAPE_UNIT_NOTE = "× = the move divided by the market's forecast median day range (high to low), so 1× is a typical whole day.";
export const TAPE_STRESS_NOTE = 'The forecast range runs narrow in stress (Evidence Book: forecast-miss-shock-idx, forecast-miss-shock-fx), so on a stressed day the multiple reads somewhat high.';

/** '+1.33%' / '−7.03%' with a true minus sign. */
export const fmtPct = (v, d = 2) => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(d)}%` : '·');
/** '4.1×' (one decimal; two significant places below 1 would suggest precision the unit does not have). */
export const fmtMult = m => (Number.isFinite(m) ? `${m.toFixed(1)}×` : '');
/** '−7.03% (4.1×)', or the % alone without a unit. */
export const fmtMove = (pct, mult, d = 2) => `${fmtPct(pct, d)}${Number.isFinite(mult) ? ` (${fmtMult(mult)})` : ''}`;

const isoOk = s => /^\d{4}-\d{2}-\d{2}/.test(s ?? '');
/** 'Thu' (short) or 'Thursday' (long) for an ISO date, read as a calendar day. */
export function dayName(iso, long = false) {
  if (!isoOk(iso)) return '';
  const w = WD[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()];
  return long ? w : w.slice(0, 3);
}

/** |move %| ÷ the forecast median day range (% of price), or null without a unit. */
export function multiple(pct, hlMed) {
  return Number.isFinite(pct) && Number.isFinite(hlMed) && hlMed > 0 ? Math.abs(pct) / hlMed : null;
}

/** The last full day for one market: { pct, date } or null. */
export function lastFullDay(a) {
  if (!a) return null;
  if (a.d1Basis === 'bars') return Number.isFinite(a.d1) ? { pct: a.d1, date: a.d1AsOf ?? null } : null;
  if (!a.d1Basis) return Number.isFinite(a.d1) ? { pct: a.d1, date: null } : null;   // an older input with no basis: one undated move
  if (a.d1Basis !== 'live') return null;
  let p = a.prevClose, c = a.lastClose;
  if (!(Number.isFinite(p) && Number.isFinite(c))) { const sp = (a.spark ?? []).filter(Number.isFinite); if (sp.length < 2) return null; p = sp.at(-2); c = sp.at(-1); }
  return p ? { pct: (c / p - 1) * 100, date: a.d1AsOf ?? null } : null;
}

/** Where a price sits in a high-low range: { pct (0 low, 100 high, can run outside), word }. */
export function rangePosition({ high, low, price } = {}) {
  if (![high, low, price].every(Number.isFinite) || !(high > low)) return null;
  const pct = ((price - low) / (high - low)) * 100;
  const word = price > high ? 'above high' : price < low ? 'below low' : pct < 100 / 3 ? 'bottom third' : pct < 200 / 3 ? 'middle third' : 'top third';
  return { pct, word, outside: price > high || price < low };
}

const num = v => (typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(/,/g, '')));

/** One market on the tape: { key, label, day, night, pos, score } (day/night: { pct, mult, date }). */
export function tapeRow(a) {
  const fd = lastFullDay(a);
  const day = fd ? { ...fd, mult: multiple(fd.pct, a.hlMed) } : null;
  const night = a?.d1Basis === 'live' && Number.isFinite(a.d1) ? { pct: a.d1, mult: multiple(a.d1, a.hlMed), date: a.d1AsOf ?? null } : null;
  // position: the live price when there is one, else the last close in its own day's range
  const price = a?.d1Basis === 'live' ? num(a.price) : Number.isFinite(a?.lastClose) ? a.lastClose : num(a?.price);
  const rp = rangePosition({ high: a?.yHigh, low: a?.yLow, price });
  const pos = rp ? { ...rp, date: a.yDate ?? day?.date ?? null, live: a?.d1Basis === 'live' } : null;
  const ms = [day?.mult, night?.mult].filter(Number.isFinite), ps = [day?.pct, night?.pct].filter(Number.isFinite).map(Math.abs);
  return { key: a?.key ?? null, label: a?.label ?? '', day, night, pos, score: ms.length ? Math.max(...ms) : null, absMax: ps.length ? Math.max(...ps) : null };
}

/** Every market on the tape, biggest first: the larger of the two multiples, so a crash day cannot drop out behind a quiet night. Rows without a unit go after, by %. */
export function tapeRows(assets) {
  return (assets ?? []).filter(a => a?.label).map(tapeRow).filter(r => r.day || r.night)
    .sort((x, y) => (x.score === null) - (y.score === null) || (y.score ?? 0) - (x.score ?? 0) || (y.absMax ?? 0) - (x.absMax ?? 0));
}

/** The last full day the tape describes: the most common day date across markets. */
export function tapeDay(rows) {
  const c = {};
  for (const r of rows ?? []) if (r.day?.date) c[r.day.date] = (c[r.day.date] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;
}

/** The plain-text pieces of one row: { day: 'Thu −7.03% (4.1×)', night: '+1.33% (0.8×) since Thu's close', pos: '21% of Thu's range, bottom third' }. */
export function rowText(r) {
  const dn = r?.day?.date ? dayName(r.day.date) : '';
  const pos = !r?.pos ? '' : r.pos.outside ? `${r.pos.word === 'above high' ? 'above' : 'below'} ${dayName(r.pos.date) || 'yesterday'}'s ${r.pos.word === 'above high' ? 'high' : 'low'}`
    : `${Math.round(r.pos.pct)}% of ${dayName(r.pos.date) || 'yesterday'}'s range, ${r.pos.word}`;
  return {
    day: r?.day ? `${dn ? dn + ' ' : ''}${fmtMove(r.day.pct, r.day.mult)}` : '',
    night: r?.night ? `${fmtMove(r.night.pct, r.night.mult)} since ${dayName(r.night.date) || 'the'}${r.night.date ? "'s" : ''} close` : '',
    pos: pos ? `${r.pos.live ? '' : r.pos.outside ? 'closed ' : 'closed at '}${pos}` : '',
  };
}

/** The footnote for any table or box that prints the tape. */
export function tapeNote(rows) {
  const r = rows ?? [], parts = [];
  const dn = dayName(tapeDay(r));
  parts.push(`${dn || 'The day'}: that market's last full day, close to close.`);
  if (r.some(x => x.night)) parts.push("Since the close: the live price against that close, the overnight move.");
  if (r.some(x => x.pos)) parts.push(`Range: where the price sits in ${dn ? dn + "'s" : "yesterday's"} high-to-low range, 0% at the low and 100% at the high.`);
  if (r.some(x => Number.isFinite(x.score))) parts.push(TAPE_UNIT_NOTE, TAPE_STRESS_NOTE);
  return parts.join(' ');
}

/**
 * Yesterday in one line: { text, numbers, source ('evening' | 'data'), date } or null.
 * From last night's evening edition (archive kind "desk-evening", its subject) when one is stored for the last full day;
 * otherwise built from the data. `numbers` is always the data line, so a reader sees the sizes either way.
 */
export function yesterdayLine({ assets, evening = null, n = 3 } = {}) {
  const rows = tapeRows(assets), date = tapeDay(rows);
  if (!date) return null;
  const big = rows.filter(r => r.day && r.day.date === date).sort((x, y) => (y.day.mult ?? -1) - (x.day.mult ?? -1) || Math.abs(y.day.pct) - Math.abs(x.day.pct)).slice(0, n);
  const W = dayName(date, true);
  const numbers = big.length ? `${W}'s full day: ${big.map((r, i) => `${r.label} ${fmtPct(r.day.pct, 1)}${Number.isFinite(r.day.mult) ? ` (${fmtMult(r.day.mult)}${i === 0 ? ' a normal day' : ''})` : ''}`).join(', ')}` : '';
  const ev = (Array.isArray(evening) ? evening : evening ? [evening] : []).find(e => e?.date === date && e.subject);
  if (ev) return { text: `${W}, from last night's evening edition: ${String(ev.subject).replace(/^Evening:\s*/i, '').trim()}`, numbers, source: 'evening', date };
  return numbers ? { text: numbers, numbers, source: 'data', date } : null;
}
