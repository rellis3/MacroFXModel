/**
 * Release scorecard -- the Event Response Book closing its own loop, every print.
 *
 * Thirty minutes after a high-impact release the desk measures what each pair
 * did and sets it against what history said that release does (the book's
 * 30-minute "spike", in multiples of an ordinary half-hour) -- and against the
 * user's own call, made before the print ("higher" or "lower" than consensus).
 * Size is what this desk has shown is learnable; direction is not. So the card
 * teaches size: "EUR/USD moved 18 pips, 2.1x a normal half-hour; the book said
 * 2.9x on 124 prints."
 *
 * Pure: grouping, measuring, wording and scoring are here and unit tested; the
 * server fetches candles and the calendar, keeps the cards in the daily
 * snapshot, and sends the Telegram line.
 */
import { EVENT_FAMILY_RE } from './deskWatch.js';
import { eventImpact } from './eventImpactMap.js';

const MIN = 60_000;
// Which instruments answer to which country's data. FX and gold are what the
// book measured; the two US indices are measured without a book line.
export const COUNTRY_INSTRUMENTS = {
  US: ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'GOLD', 'NQ', 'SPX500'],
  EU: ['EURUSD', 'EURGBP', 'EURJPY'], DE: ['EURUSD', 'EURGBP'],
  GB: ['GBPUSD', 'EURGBP', 'GBPJPY'], JP: ['USDJPY', 'EURJPY', 'GBPJPY'],
  AU: ['AUDUSD', 'AUDJPY', 'AUDNZD'], NZ: ['NZDUSD', 'AUDNZD'], CA: ['USDCAD', 'CADJPY'], CH: ['USDCHF', 'EURCHF'],
};
export const OANDA_SYM = { GOLD: 'XAU_USD', NQ: 'NAS100_USD', SPX500: 'SPX500_USD' };
export const oandaSym = name => OANDA_SYM[name] ?? name.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1_$2');
// price units: pips for FX (x100 for yen crosses), points otherwise
export function unitOf(name) {
  if (name === 'GOLD') return { mult: 1, unit: '$', dp: 1 };
  if (name === 'NQ' || name === 'SPX500') return { mult: 1, unit: 'pts', dp: 0 };
  return /JPY$/.test(name) ? { mult: 100, unit: 'pips', dp: 0 } : { mult: 10000, unit: 'pips', dp: 0 };
}
export const familyOf = event => EVENT_FAMILY_RE.find(([, re]) => re.test(event ?? ''))?.[0] ?? null;

// Prints at the same minute from the same country are one event (CPI m/m, core
// CPI, CPI y/y at 12:30): one reaction, several numbers.
export function groupReleases(events, { now = Date.now(), minAgeMin = 31, maxAgeMin = 60, impacts = ['high'] } = {}) {
  const by = new Map();
  for (const e of events ?? []) {
    if (!e?.ms || !impacts.includes(String(e.impact ?? '').toLowerCase())) continue;
    const age = (now - e.ms) / MIN; if (age < minAgeMin || age > maxAgeMin) continue;
    const key = `${String(e.country).toUpperCase()}|${e.ms}`;
    if (!by.has(key)) by.set(key, { key, country: String(e.country).toUpperCase(), ms: e.ms, prints: [] });
    by.get(key).prints.push({ event: e.event, estimate: e.estimate ?? null, prev: e.prev ?? null, actual: e.actual ?? null, family: familyOf(e.event) });
  }
  return [...by.values()].sort((a, b) => a.ms - b.ms);
}

// The ordinary half-hour, the way the Event Response Book defined it: the median
// absolute 30-minute move at the SAME CLOCK over the previous twenty weekdays.
// An 18:00 UTC Fed window and a 12:30 CPI window live in different parts of the
// liquidity day; an all-day median would flatter both. M30 bars are used, on
// the slot the release falls in (a 12:30 print -> the 12:30-13:00 bar).
export function ordinaryHalfHour(m30, releaseMs, { days = 20 } = {}) {
  const d = new Date(releaseMs); const slot = d.getUTCHours() * 60 + (d.getUTCMinutes() >= 30 ? 30 : 0);
  const same = (m30 ?? []).filter(b => { const t = new Date(b.time); const dow = t.getUTCDay(); return b.time < releaseMs && dow !== 0 && dow !== 6 && t.getUTCHours() * 60 + t.getUTCMinutes() === slot; })
    .sort((a, b) => b.time - a.time).slice(0, days).map(b => Math.abs(b.close - b.open)).filter(Number.isFinite).sort((a, b) => a - b);
  if (same.length >= 5) return { value: same[Math.floor(same.length / 2)], basis: 'same clock', n: same.length };
  const all = (m30 ?? []).map(b => Math.abs(b.close - b.open)).filter(Number.isFinite).sort((a, b) => a - b);
  return all.length >= 50 ? { value: all[Math.floor(all.length / 2)], basis: 'all hours', n: all.length } : null;
}
// The reaction: close of the last bar before the print to the close 30 minutes
// after, in price, against the ordinary half-hour above.
export function measureReaction(name, releaseMs, m5, m30) {
  // bar `time` is the bar's START: the last bar that CLOSES before the print starts
  // five minutes before it; the 30-minute window is the six bars starting at the print
  const before = (m5 ?? []).filter(b => b.time <= releaseMs - 5 * MIN).sort((a, b) => a.time - b.time);
  const after = (m5 ?? []).filter(b => b.time >= releaseMs && b.time < releaseMs + 30 * MIN).sort((a, b) => a.time - b.time);
  if (!before.length || after.length < 4) return null;
  const p0 = before[before.length - 1].close, p30 = after[after.length - 1].close;
  const hi = Math.max(...after.map(b => b.high)), lo = Math.min(...after.map(b => b.low));
  const ord = ordinaryHalfHour(m30, releaseMs); const ordinary = ord?.value ?? null;
  const u = unitOf(name);
  const move = p30 - p0;
  return { name, move: +(move * u.mult).toFixed(u.dp), range: +((hi - lo) * u.mult).toFixed(u.dp), unit: u.unit, dir: move > 0 ? 'up' : move < 0 ? 'down' : 'flat', ratio: ordinary ? +(Math.abs(move) / ordinary).toFixed(2) : null, ordinary: ordinary ? +(ordinary * u.mult).toFixed(u.dp) : null, ordinaryBasis: ord?.basis ?? null, bars30: after.length };
}

export function bookFor(country, family, name) {
  const imp = family ? eventImpact(country, family) : null; const i = imp?.instruments?.[name];
  return i ? { spike: i.spike, n: i.n, next: i.next ?? null } : null;
}
export function sizeWord(ratio, book) {
  if (ratio == null) return '';
  if (book?.spike) { const r = ratio / book.spike; return r >= 1.4 ? 'bigger than the book' : r <= 0.6 ? 'smaller than the book' : 'about what the book said'; }
  return ratio >= 3 ? 'a big move' : ratio >= 1.5 ? 'a real move' : 'an ordinary half-hour';
}

const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
// "higher" / "lower" than consensus, as printed -- no polarity: the user is
// asked which side of the number, not whether it is good for the currency.
export function sideOf(actual, estimate) {
  const a = num(actual), e = num(estimate); if (a == null || e == null) return null;
  return a > e ? 'higher' : a < e ? 'lower' : 'inline';
}
export function scoreCall(call, actual, estimate) {
  const side = sideOf(actual, estimate); if (!call || !side) return null;
  return side === 'inline' ? 'push' : side === call ? 'hit' : 'miss';
}
export function summariseCalls(calls = []) {
  const scored = calls.filter(c => c.result === 'hit' || c.result === 'miss');
  const hits = scored.filter(c => c.result === 'hit').length, n = scored.length;
  const modelScored = calls.filter(c => c.modelResult === 'hit' || c.modelResult === 'miss');
  const mHits = modelScored.filter(c => c.modelResult === 'hit').length;
  const p = n ? hits / n : null, se = n ? Math.sqrt(p * (1 - p) / n) : null;
  return { n, hits, pushes: calls.filter(c => c.result === 'push').length, hitRate: p != null ? +p.toFixed(3) : null, lo: p != null ? +Math.max(0, p - 1.96 * se).toFixed(3) : null, hi: p != null ? +Math.min(1, p + 1.96 * se).toFixed(3) : null, model: { n: modelScored.length, hits: mHits } };
}

// The card in words -- one line per print, one per instrument, the call last.
export function surpriseWord(actual, estimate) {
  const s = sideOf(actual, estimate); if (!s) return '';
  return s === 'inline' ? 'as expected' : `${s} than the ${estimate} expected`;
}
export function formatScorecard(card, { html = false } = {}) {
  const b = html ? (s) => `<b>${s}</b>` : (s) => s;
  const head = `${card.country} ${card.prints.map(p => `${p.event}: ${p.actual != null ? `${b(p.actual)}, ${surpriseWord(p.actual, p.estimate)}` : `not on the feed yet (${p.estimate ?? '?'} expected)`}`).join(' · ')}`;
  const lines = (card.reactions ?? []).filter(r => r).map(r => {
    const bk = r.book ? ` (the book: ${r.book.spike}× on ${r.book.n} prints)` : '';
    const amt = r.unit === '$' ? `$${Math.abs(r.move)}` : `${Math.abs(r.move)} ${r.unit}`;
    return `${r.name.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2')} moved ${b(amt)} ${r.dir} in 30 min${r.ratio != null ? ` — ${b(`${r.ratio}×`)} a normal half-hour${bk}, ${sizeWord(r.ratio, r.book)}` : ''}`;
  });
  const call = card.call ? `Your call: ${card.call.call} — ${card.call.result === 'hit' ? '✓ right' : card.call.result === 'miss' ? '✗ wrong' : card.call.result === 'push' ? 'in line, a push' : 'not scored'}${card.call.model ? ` · the model said ${card.call.model}${card.call.modelResult ? ` (${card.call.modelResult === 'hit' ? '✓' : card.call.modelResult === 'miss' ? '✗' : 'push'})` : ''}` : ''}` : '';
  const sep = html ? '\n' : '\n';
  return [head, ...lines, call].filter(Boolean).join(sep);
}
