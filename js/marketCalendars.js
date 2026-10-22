/**
 * The week's non-economic calendar: market closures, big-company earnings, Treasury auctions and Fed speakers.
 *
 * WHY THESE FOUR. The economic calendar says when data prints. A reader of the issue also needs to know when the market is shut
 * (a thin, odd day), when the companies that carry the Nasdaq report, when the government comes to borrow (auction supply moves
 * long yields), and when Fed officials speak. All four are SCHEDULES: facts about when something happens, with no forecast of what
 * it does to price.
 *
 * SOURCES (all free, no key): api.nasdaq.com earnings calendar, TreasuryDirect upcoming auctions, the Federal Reserve's public
 * calendar JSON. Parsers here are pure so they are tested without a network. Holidays are computed from the rules.
 * Speakers are shown by ROLE, never by name (the brief's standing rule for central-bank officials).
 *
 * Pure: no fetch, no DOM. Tested in js/marketCalendars.test.mjs.
 */

// ── dates ───────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0 Sun .. 6 Sat
const addDays = (s, n) => { const t = Date.parse(s + 'T00:00:00Z') + n * 864e5; return new Date(t).toISOString().slice(0, 10); };
const isWeekend = s => { const [y, m, d] = s.split('-').map(Number); const w = dow(y, m, d); return w === 0 || w === 6; };
const nthWeekday = (y, m, wd, n) => { let c = 0; for (let d = 1; d <= 31; d++) { if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() !== m - 1) break; if (dow(y, m, d) === wd && ++c === n) return iso(y, m, d); } return null; };
const lastWeekday = (y, m, wd) => { for (let d = 31; d >= 1; d--) { if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() !== m - 1) continue; if (dow(y, m, d) === wd) return iso(y, m, d); } return null; };

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, mo, da);
}
/** A fixed-date holiday observed on the nearest weekday: Saturday goes to Friday, Sunday to Monday (the NYSE rule). */
const nyseObserved = (y, m, d) => { const w = dow(y, m, d), s = iso(y, m, d); return w === 6 ? addDays(s, -1) : w === 0 ? addDays(s, 1) : s; };

/** NYSE full closures and 1pm early closes for a year. */
export function usMarketDays(y) {
  const gf = addDays(easter(y), -2), out = [];
  const closed = (date, name) => out.push({ date, market: 'US stock market', name, kind: 'closed' });
  const ny = nyseObserved(y, 1, 1); if (!(dow(y, 1, 1) === 6)) closed(ny, "New Year's Day");   // a Saturday New Year is not observed the Friday before
  closed(nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day'); closed(nthWeekday(y, 2, 1, 3), "Presidents' Day"); closed(gf, 'Good Friday');
  closed(lastWeekday(y, 5, 1), 'Memorial Day'); closed(nyseObserved(y, 6, 19), 'Juneteenth'); closed(nyseObserved(y, 7, 4), 'Independence Day');
  closed(nthWeekday(y, 9, 1, 1), 'Labor Day'); const tg = nthWeekday(y, 11, 4, 4); closed(tg, 'Thanksgiving'); closed(nyseObserved(y, 12, 25), 'Christmas Day');
  const early = (date, name) => out.push({ date, market: 'US stock market', name, kind: 'early close (1pm New York)' });
  early(addDays(tg, 1), 'Day after Thanksgiving'); if (!isWeekend(iso(y, 12, 24)) && !out.some(x => x.date === iso(y, 12, 24))) early(iso(y, 12, 24), 'Christmas Eve');
  return out;
}
/** UK bank holidays (England and Wales), with substitute days. */
export function ukBankHolidays(y) {
  const taken = new Set(), out = [], e = easter(y);
  const sub = s => { while (isWeekend(s) || taken.has(s)) s = addDays(s, 1); return s; };
  const add = (date, name) => { taken.add(date); out.push({ date, market: 'UK', name, kind: 'bank holiday' }); };
  add(sub(iso(y, 1, 1)), "New Year's Day"); add(addDays(e, -2), 'Good Friday'); add(addDays(e, 1), 'Easter Monday'); add(nthWeekday(y, 5, 1, 1), 'Early May bank holiday');
  add(lastWeekday(y, 5, 1), 'Spring bank holiday'); add(lastWeekday(y, 8, 1), 'Summer bank holiday'); add(sub(iso(y, 12, 25)), 'Christmas Day'); add(sub(iso(y, 12, 26)), 'Boxing Day');
  return out;
}
/** Euro-area TARGET closing days (no substitutes). */
export function targetHolidays(y) {
  const e = easter(y);
  return [[iso(y, 1, 1), "New Year's Day"], [addDays(e, -2), 'Good Friday'], [addDays(e, 1), 'Easter Monday'], [iso(y, 5, 1), 'Labour Day'], [iso(y, 12, 25), 'Christmas Day'], [iso(y, 12, 26), 'Boxing Day']]
    .filter(([d]) => !isWeekend(d)).map(([date, name]) => ({ date, market: 'Euro area', name, kind: 'markets closed' }));
}
/** Closures between two dates (inclusive), earliest first. Weekends are never listed. Japan and other markets are not covered. */
export function closuresBetween(fromDate, toDate) {
  const ys = [...new Set([+fromDate.slice(0, 4), +toDate.slice(0, 4)])];
  return ys.flatMap(y => [...usMarketDays(y), ...ukBankHolidays(y), ...targetHolidays(y)]).filter(x => x.date >= fromDate && x.date <= toDate && !isWeekend(x.date)).sort((a, b) => a.date.localeCompare(b.date) || a.market.localeCompare(b.market));
}

// ── America/New_York wall time to an instant ─────────────────────────────────
export function etToMs(dateStr, hour, minute = 0) {
  const [y, mo, d] = dateStr.split('-').map(Number), want = Date.UTC(y, mo - 1, d, hour, minute);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let t = want;
  for (let i = 0; i < 2; i++) { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value])); t += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); }
  return t;
}
const clock = s => { const m = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i.exec(String(s ?? '')); if (!m) return null; let h = +m[1] % 12; if (m[3].toLowerCase() === 'p') h += 12; return [h, +m[2]]; };
const decode = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, '-').replace(/&#8220;|&#8221;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();

// ── earnings (api.nasdaq.com/api/calendar/earnings?date=) ────────────────────
export const TRACKED_STOCKS = ['NVDA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'GOOG', 'TSLA', 'AVGO'];
/** One day's earnings JSON to rows, keeping the large companies only (market cap in $ billions). */
export function parseEarnings(json, date, { minCapB = 150 } = {}) {
  return (json?.data?.rows ?? []).map(r => {
    const cap = Number(String(r.marketCap ?? '').replace(/[^0-9.]/g, '')), capB = cap > 0 ? Math.round(cap / 1e9) : null;
    const when = /pre/.test(r.time ?? '') ? 'before the open' : /after/.test(r.time ?? '') ? 'after the close' : 'time not given';
    return { date, symbol: r.symbol, name: decode(r.name).replace(/\s*\(The\)$/i, ''), capB, when, epsForecast: r.epsForecast || null, lastYearEps: r.lastYearEPS || null, tracked: TRACKED_STOCKS.includes(r.symbol) };
  }).filter(r => r.symbol && r.capB != null && (r.capB >= minCapB || r.tracked)).sort((a, b) => b.capB - a.capB).filter((r, i, all) => all.findIndex(x => x.name === r.name) === i);   // one row per company: Alphabet lists two share classes
}

// ── Treasury auctions (TreasuryDirect upcoming) ──────────────────────────────
export function parseAuctions(list) {
  return (Array.isArray(list) ? list : []).map(x => {
    const day = String(x.competitiveAuctionCloseDate ?? '').slice(0, 10), t = clock(x.competitiveAuctionCloseTime);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const amt = Number(x.offeringAmount);
    return { date: day, ms: t ? etToMs(day, t[0], t[1]) : null, type: x.inflationProtected === 'Yes' ? 'TIPS' : x.floatingRate === 'Yes' ? 'Floating-rate note' : x.securityType, term: x.securityTerm, amountB: amt > 0 ? Math.round(amt / 1e8) / 10 : null, reopening: x.reopening === 'Yes', maturity: String(x.maturityDate ?? '').slice(0, 10) };
  }).filter(Boolean).sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0) || (b.amountB ?? 0) - (a.amountB ?? 0));
}

// ── Fed calendar (federalreserve.gov/json/calendar.json) ─────────────────────
const ROLE = [[/Vice Chair for Supervision/i, 'Fed Vice Chair for Supervision'], [/Vice Chair/i, 'Fed Vice Chair'], [/Chairman|Chair\b/i, 'Fed Chair'], [/Governor/i, 'Fed Governor'], [/President/i, 'Reserve Bank president']];
/** Speeches, testimony, FOMC and Beige Book events in a date window. Speakers are named by role only. Times are New York time in the source. */
export function parseFedCalendar(json, fromDate, toDate) {
  const text = typeof json === 'string' ? json.replace(/^﻿/, '') : null, src = text ? JSON.parse(text) : json;
  const out = [];
  for (const e of src?.events ?? []) {
    if (!/^(Speeches|Testimony|FOMC|Beige)$/i.test(e.type ?? '')) continue;
    const month = String(e.month ?? ''), day = parseInt(String(e.days ?? '').split(/\D+/)[0], 10);
    if (!/^\d{4}-\d{2}$/.test(month) || !day) continue;
    const date = `${month}-${pad(day)}`; if (date < fromDate || date > toDate) continue;
    const title = decode(e.title), kindM = /^(Speech|Discussion|Testimony|Remarks|Statement)\b/i.exec(title), role = ROLE.find(([re]) => re.test(title))?.[1] ?? null;
    const where = decode(e.location).replace(/^At\s+/i, '').slice(0, 110), tm = clock(e.time);
    const what = /^(FOMC|Beige)$/i.test(e.type) ? title : role ? `${role}: ${(kindM?.[1] ?? 'appearance').toLowerCase()}` : `${(kindM?.[1] ?? 'Appearance')} by a Fed official`;
    out.push({ date, ms: tm ? etToMs(date, tm[0], tm[1]) : null, type: e.type, what, where: where || null });
  }
  return out.sort((a, b) => (a.ms ?? Date.parse(a.date)) - (b.ms ?? Date.parse(b.date)));
}
