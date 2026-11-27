// js/terminal/eveningCore.js: the pure half of the EVENING broadcast (after 18:00 London the programme looks back over the day instead of ahead). No DOM, no fetch; `now` is always passed in.
//
//   windowMove(bars, ms)              a market's % move over the 30 minutes from a release (15-minute bars: the open of the bar starting at the release to the close of the bar ending 30 min later)
//   reactionOf(bars, ms, ccy)         that move for the release's currency (signed so + = the currency gained), against the same half hour on earlier days (the usual for that time of day)
//   reviewScript(day, react, now)     the spoken line: today's released numbers against their forecasts, and what the currency did in the half hour after
//   tomorrowScript(week, now)         the next day's calendar (or the next weekday's), the morning OUTLOOK pointed one day on
//   isEvening(ms)                     true from 18:00 London (the programme's own evening)
// DESCRIPTION ONLY: what printed and what the market did afterwards. A move after a release is not proof the release caused it; the script says "in the half hour after", never "because".
import { londonParts, mergeDay, outlookScript, sayFig, sayRelease } from './dayAheadCore.js';

const fin = v => v != null && v !== '' && Number.isFinite(+v);
const STEP = 15 * 60e3, WIN = 30 * 60e3, DAY = 864e5;
export const isEvening = ms => londonParts(ms).mins >= 18 * 60;

/** The pair that carries each currency's reaction, and the sign that turns the pair's move into the currency's own (+ = the currency gained). */
export const REACT_PAIR = { USD: ['EURUSD', -1], EUR: ['EURUSD', 1], GBP: ['GBPUSD', 1], JPY: ['USDJPY', -1], AUD: ['AUDUSD', 1], NZD: ['NZDUSD', 1], CAD: ['USDCAD', -1], CHF: ['USDCHF', -1] };
export const CCY_WORD = { USD: 'the dollar', EUR: 'the euro', GBP: 'the pound', JPY: 'the yen', AUD: 'the Australian dollar', NZD: 'the New Zealand dollar', CAD: 'the Canadian dollar', CHF: 'the Swiss franc' };

/** % move over [ms, ms + win] from 15-minute bars { t (seconds), o, c }, or null when the window is not fully covered (a gap, a weekend, or not finished yet). */
export function windowMove(bars, ms, win = WIN, step = STEP) {
  if (!Array.isArray(bars) || !bars.length) return null;
  const b0 = bars.find(b => b.t * 1000 >= ms - 1000 && b.t * 1000 < ms + step); if (!b0 || !(b0.o > 0)) return null;
  const end = ms + win, b1 = bars.find(b => Math.abs(b.t * 1000 + step - end) < 1000); if (!b1 || !(b1.c > 0) || b1.t < b0.t) return null;
  return (b1.c / b0.o - 1) * 100;
}
/** The clock each currency's releases are set by (Helix review 0.6): a US 08:30 print is 08:30 New York on every earlier day, whatever London's offset did in between. */
export const RELEASE_TZ = { USD: 'America/New_York', CAD: 'America/Toronto', EUR: 'Europe/Berlin', GBP: 'Europe/London', CHF: 'Europe/Zurich', JPY: 'Asia/Tokyo', AUD: 'Australia/Sydney', NZD: 'Pacific/Auckland' };
// one formatter per zone, made once at module load (never per bar: Intl.DateTimeFormat holds native memory)
const TZ_FMT = Object.fromEntries([...new Set(Object.values(RELEASE_TZ))].map(z => [z, new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })]));
/** The zone's UTC offset at an instant, in ms (local wall time minus UTC). */
export function tzOffset(ms, zone) {
  const f = TZ_FMT[zone]; if (!f) return 0; const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) - Math.floor(ms / 60e3) * 60e3;
}
/** The same local clock time `d` days before ms in `zone` (a fixed UTC step when the zone is unknown). */
export function sameLocalTime(ms, d, zone) {
  const t = ms - d * DAY; if (!TZ_FMT[zone]) return t;
  const t1 = t + (tzOffset(ms, zone) - tzOffset(t, zone));
  return t + (tzOffset(ms, zone) - tzOffset(t1, zone));       // a second pass, with the offset read at the corrected instant (right at a clock change)
}
/** The reaction of `ccy` to a release at ms: { pair, movePct (signed for the currency), usualPct (median |move| over the same half hour on up to 10 earlier days, stepped back in the release's own clock), ratio } or null. */
export function reactionOf(bars, ms, ccy, { zone } = {}) {
  const c = String(ccy ?? '').toUpperCase(), p = REACT_PAIR[c]; if (!p) return null;
  const m = windowMove(bars, ms); if (m == null) return null;
  const z = zone ?? RELEASE_TZ[c];
  const past = []; for (let d = 1; d <= 16 && past.length < 10; d++) { const x = windowMove(bars, sameLocalTime(ms, d, z)); if (x != null) past.push(Math.abs(x)); }
  past.sort((a, b) => a - b);
  const usual = past.length >= 3 ? (past.length % 2 ? past[(past.length - 1) / 2] : (past[past.length / 2 - 1] + past[past.length / 2]) / 2) : null;
  return { pair: p[0], movePct: m * p[1], usualPct: usual, ratio: usual > 0 ? Math.abs(m) / usual : null };
}

const pctWords = v => { const a = Math.abs(v); return `${a < 0.095 ? a.toFixed(2) : a.toFixed(1)} percent`; };
const timesWords = r => (r == null ? '' : r < 0.6 ? ', less than usual for that time of day' : r < 1.4 ? ', about usual for that time of day' : r < 1.75 ? ', about one and a half times the usual for that time of day'
  : r < 2.5 ? ', about twice the usual for that time of day' : `, about ${Math.round(r)} times the usual for that time of day`);
// a calendar figure with its unit (Helix review 0.5): "1.2M" against "950K" is above, not below. K / M / B / T scale; % and bare numbers compare as written.
const SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
export const num = v => { const m = /^([-]?\d+(?:\.\d+)?)\s*([KMBT%])?/i.exec(String(v ?? '').trim().replace(/[−–]/g, '-').replace(/,/g, '')); if (!m) return null; const u = (m[2] ?? '').toUpperCase(); return +m[1] * (SCALE[u] ?? 1); };
/** "came in at 54.0, above the 52.4 expected" (above / below / in line: a comparison of numbers, not a judgement of good or bad). */
function printed(e) {
  const a = sayFig(e.actual); if (!a) return null;
  const f = sayFig(e.forecast), na = num(e.actual), nf = num(e.forecast);
  const cmp = f == null || na == null || nf == null ? '' : na > nf ? `, above the ${f} expected` : na < nf ? `, below the ${f} expected` : `, in line with the ${f} expected`;
  return `${sayRelease(e)} came in at ${a}${cmp}`;
}
/** The key to look a release group's reaction up by. */
export const reactKey = (hm, ccy) => `${hm}|${ccy}`;
/** Today's released groups worth reading (rank >= 2, with a printed number), each { hm, ms, ccy, ev, rank, key }. A bare composite "PMI" is dropped when the same group names its parts. */
export function releasedGroups(day, now) {
  const done = (day?.events ?? []).filter(e => e.rank >= 2 && e.actual != null && e.ms <= now), groups = [];
  for (const e of done) { let g = groups.find(x => x.hm === e.hm && x.ccy === e.ccy); if (!g) groups.push(g = { hm: e.hm, ms: e.ms, ccy: e.ccy, ev: [] }); g.ev.push(e); }
  for (const g of groups) {
    const parts = g.ev.filter(e => !/^[A-Z]{2} PMI$/.test(e.short)); if (parts.length) g.ev = parts;
    g.ev.sort((a, b) => b.rank - a.rank); g.rank = g.ev[0].rank; g.key = reactKey(g.hm, g.ccy);
  }
  return groups;
}
/**
 * The EVENING review line: up to `max` release times (the biggest reactions and the top-ranked first, then read in clock order), each with what printed against the forecast and
 * what the currency did in the half hour after. react = { [reactKey]: reactionOf(...) }. null when nothing printed today.
 */
export function reviewScript(day, react = {}, now, max = 3) {
  const groups = releasedGroups(day, now); if (!groups.length) return null;
  const score = g => (react[g.key]?.ratio ?? 0) + g.rank * 0.5;
  const pick = [...groups].sort((a, b) => score(b) - score(a)).slice(0, max).sort((a, b) => a.ms - b.ms);
  const lines = pick.map(g => {
    const said = g.ev.slice(0, 2).map(printed).filter(Boolean); if (!said.length) return null;
    const r = react[g.key], who = CCY_WORD[g.ccy];
    const after = r && who ? (Math.abs(r.movePct) < 0.02 ? ` ${cap(who)} barely moved in the half hour after.` : ` In the half hour after, ${who} ${r.movePct > 0 ? 'rose' : 'fell'} ${pctWords(r.movePct)}${timesWords(r.ratio)}.`) : '';
    return `At ${g.hm}, ${said.join(', and ')}.${after}`;
  }).filter(Boolean);
  if (!lines.length) return null;
  const rest = groups.length - pick.length, big = pick.map(g => ({ g, r: react[g.key] })).filter(x => x.r?.ratio != null).sort((a, b) => b.r.ratio - a.r.ratio)[0];
  const tail = [];
  if (rest > 0) tail.push(`${rest === 1 ? 'One more release' : `${cap(numWord(rest))} more releases`} printed today.`);
  if (big && big.r.ratio >= 1.75 && pick.length > 1) tail.push(`The biggest reaction followed the ${big.g.hm} numbers.`);
  return `Today's releases, and what followed. ${lines.join(' ')}${tail.length ? ` ${tail.join(' ')}` : ''} What printed, and what moved after; not proof one caused the other.`;
}
/** A one-line figure for the lower third: the biggest reaction as "2.1×" with its currency, or the count of releases. */
export function reviewFigure(day, react = {}, now) {
  const groups = releasedGroups(day, now); if (!groups.length) return null;
  const big = groups.map(g => ({ g, r: react[g.key] })).filter(x => x.r?.ratio != null).sort((a, b) => b.r.ratio - a.r.ratio)[0];
  return big ? { value: `${big.r.ratio.toFixed(1)}×`, label: `${big.g.ccy} after ${big.g.hm} vs usual` } : { value: String(groups.length), label: 'release times today' };
}

/**
 * The next day's calendar line (the next London date with a medium- or high-impact release, at most 3 days on, so Friday evening finds Monday when the week's calendar has it):
 * { text, label ('Tomorrow' | 'Monday' ...), n } or null when the calendar does not reach that far.
 */
export function tomorrowScript(week, now, extra = {}) {
  for (let k = 1; k <= 3; k++) {
    const t = now + k * DAY, lp = londonParts(t), start = t - lp.mins * 60e3 - (t % 60e3);
    const day = mergeDay({ week, ...extra, now: start }); if (!day.events.some(e => e.rank >= 2)) continue;
    const label = k === 1 ? 'Tomorrow' : WEEKDAY[lp.dow] ?? lp.dow, on = k === 1 ? 'tomorrow' : `on ${label}`;
    let text = outlookScript(day, start); if (!text) continue;
    text = text.replace(/^On the calendar today, London time\./, `${label === 'Tomorrow' ? "Tomorrow's" : `${label}'s`} calendar, London time.`)
      .replace(/^No top-tier releases today; the medium-impact ones, London time\./, `No top-tier releases ${on}; the medium-impact ones, London time.`);
    return { text, label, n: day.events.filter(e => e.rank >= 2).length, high: day.events.filter(e => e.rank >= 3).length };
  }
  return null;
}
const WEEKDAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const numWord = n => (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n));
export { fin };
