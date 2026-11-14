/**
 * Market clock: is the FX week open, when did it last close, when does it reopen, and how to say so. Pure: no fetch, no DOM, no clock except the instant passed in.
 *
 * Two rules live here, on purpose, because they answer different questions:
 *
 *   isFxOpen(ms)         the WIDE rule the snapshot capture uses (js/deskSnapshot.js): Sunday 21:00 UTC to Friday 22:00 UTC. It is the superset of both daylight-saving
 *                        weeks, so a capture never misses a bar; it is an hour early at the Sunday open in winter and an hour late at the Friday close in summer.
 *   fxWeekOpen(ms)       the PRECISE rule for display and anchoring: shut from Friday 17:00 to Sunday 17:00 America/New_York (the OANDA daily roll), so the close
 *                        is 21:00 UTC in summer and 22:00 UTC in winter. Use this one when a board needs "the last close" as an instant.
 *
 * What this does NOT know (said here once, so nothing else pretends): the daily break of about an hour at the 17:00 New York roll, early closes (the day after
 * Thanksgiving, Christmas Eve), Japan and other national holidays, and markets that keep different hours (crypto, futures with their own sessions). A national holiday
 * is only a note (holidayNote: the US stock market, UK and euro-area closures from js/marketCalendars.js): FX itself stays open on them, so they never switch the
 * boards to the closed state. The OANDA CFDs the boards read are shut for the same weekly window (checked on 2026-11-14: every market, BTC included, stopped at the
 * Friday close), so one weekly rule serves all of them.
 *
 * Tested by js/marketClock.test.mjs.
 */
import { etToMs, closuresBetween } from './marketCalendars.js';

/** The wide capture rule (moved here from js/deskSnapshot.js, which re-exports it): FX is open Sunday 21:00 UTC to Friday 22:00 UTC. */
export function isFxOpen(ms) {
  const d = new Date(ms), dow = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (dow === 6) return false;
  if (dow === 0) return h >= 21;
  if (dow === 5) return h < 22;
  return true;
}

const DAY = 864e5;
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
const addDaysStr = (s, n) => ymd(Date.parse(`${s}T12:00:00Z`) + n * DAY);

/** The most recent weekly close at or before ms: Friday 17:00 New York, as an instant. Also gives the reopen (Sunday 17:00 New York) that follows it. */
export function weeklyWindow(ms) {
  for (let k = 0; k <= 9; k++) {
    const date = ymd(ms - k * DAY);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) continue;
    const close = etToMs(date, 17);
    if (close <= ms) return { close, open: etToMs(addDaysStr(date, 2), 17) };
  }
  return null;
}

/** The PRECISE rule: true except from Friday 17:00 to Sunday 17:00 New York. */
export function fxWeekOpen(ms) {
  const w = weeklyWindow(ms);
  return !(w && ms >= w.close && ms < w.open);
}

/** The instant of the most recent weekly close at or before ms (Friday 17:00 New York). While the week is open this is last weekend's close. */
export const lastCloseTs = ms => weeklyWindow(ms)?.close ?? null;
/** The instant FX reopens after the weekly close that lastCloseTs names (Sunday 17:00 New York). */
export const nextOpenTs = ms => weeklyWindow(ms)?.open ?? null;

const fmt = (ms, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const hm = (ms, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/** US stock market, UK and euro-area closures on the New York calendar day of ms, as plain notes ("US stock market closed today (Thanksgiving)"). Notes only. */
export function holidayNote(ms) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return closuresBetween(day, day).map(c => `${c.market} ${c.kind === 'bank holiday' || c.kind === 'markets closed' ? 'closed' : c.kind} today (${c.name})`);
}

/**
 * The whole answer for one instant.
 *   { open, closeTs, openTs, closeLabel, label, short, holidays }
 * label  = "Markets closed · showing the close, Fri 21:00 UTC (London 22:00)"; while open, label is null.
 * The label only ever names the last prints; it is not a forecast and says nothing about direction.
 */
export function clockState(ms) {
  const w = weeklyWindow(ms), open = fxWeekOpen(ms), holidays = holidayNote(ms);
  if (!w) return { open: true, closeTs: null, openTs: null, closeLabel: null, label: null, short: null, holidays };
  const closeLabel = `${fmt(w.close, 'UTC')} UTC (London ${hm(w.close, 'Europe/London')})`;
  const reopen = `${fmt(w.open, 'UTC')} UTC`;
  return {
    open, closeTs: w.close, openTs: w.open, closeLabel, holidays,
    label: open ? null : `Markets closed · showing the close, ${closeLabel} · reopens ${reopen}`,
    short: open ? null : `closed · as at ${fmt(w.close, 'UTC')} UTC`,
  };
}
