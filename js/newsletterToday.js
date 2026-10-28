/**
 * The opening of the issue, about today: what is on, what has changed and what to watch, written from the day's own figures.
 *
 * The 20-day story changes slowly, so a headline built from it repeats for days. This builds the faster layer: the scheduled events (central banks, big releases),
 * the market state in one line, what changed since the last issue and which market has moved most against its own normal day. Every line is an observed figure or a
 * schedule, so none can claim a direction, and none needs checking against a forecast. The 20-day story stays as "the month in one line" beneath it.
 *
 * Pure. Tested in js/newsletterToday.test.mjs.
 */
const TZ = 'Europe/London', MINUS = '−';
const BANK = { USD: 'the Fed', EUR: 'the ECB', GBP: 'the Bank of England', JPY: 'the Bank of Japan', AUD: 'the RBA', NZD: 'the RBNZ', CAD: 'the Bank of Canada', CHF: 'the SNB' };
const BANK_ORDER = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF'];
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = n => WORD[n] ?? String(n);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const wday = ms => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', timeZone: TZ });
const ukDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; };

/** A central bank's rate decision itself, not its minutes, speeches or press conference. */
const isDecision = e => /rate decision|interest rate|monetary policy|fomc|official bank rate|cash rate|policy rate|bank rate/i.test(e?.event ?? '') && !/minutes|press|speak|speech|testif|member|projection/i.test(e?.event ?? '') && !!BANK[e?.ccy];
const decisionRank = e => { const i = BANK_ORDER.indexOf(e.ccy); return i < 0 ? 99 : i; };

/** The high-impact events inside the window: today for a daily issue, seven days for a weekly one. Earliest first. */
function windowEvents(events, nowMs, weekly) {
  const hi = (events ?? []).filter(e => e?.impact === 'high' && Number.isFinite(e.ms) && e.ms >= nowMs - 36e5).sort((a, b) => a.ms - b.ms);
  return weekly ? hi.filter(e => e.ms < nowMs + 7 * 864e5) : hi.filter(e => ukDay(e.ms) === ukDay(nowMs));
}

const nameOf = e => (isDecision(e) ? cap(BANK[e.ccy]) : clip(e.event, 30));
/** The short name used inside a list: the bank without its article, other events as the calendar names them. */
const listName = e => (isDecision(e) ? BANK[e.ccy].replace(/^the /, '') : clip(e.event, 30));
const at = (e, weekly) => (weekly ? `on ${wday(e.ms)}` : `at ${hhmm(e.ms)}`);

/** The headline: the lead event with how many others come before or after it. */
function headlineOf(hi, nextHigh, weekly) {
  if (!hi.length) {
    if (nextHigh) return `A quiet day on the calendar, then ${nameOf(nextHigh).replace(/^The /, 'the ')} on ${wday(nextHigh.ms)}`;
    return weekly ? 'A quiet week on the calendar, so the markets set the pace' : 'A quiet calendar: today is about the tape, not the releases';
  }
  const decisions = hi.filter(isDecision).sort((a, b) => decisionRank(a) - decisionRank(b)), lead = decisions[0] ?? hi[0];
  const bef = hi.filter(e => e !== lead && e.ms < lead.ms), aft = hi.filter(e => e !== lead && e.ms >= lead.ms), rest = bef.length + aft.length;
  const verb = isDecision(lead) ? `${cap(BANK[lead.ccy])} decides ${at(lead, weekly)}` : `${nameOf(lead)} ${at(lead, weekly)}`;
  const noun = k => `${num(k)} more high-impact ${k === 1 ? 'release' : 'releases'}`, named = a => list(a.map(e => (isDecision(e) ? BANK[e.ccy] : `the ${nameOf(e)}`)));
  if (!rest) return verb;
  if (weekly) return `${verb}, plus ${num(rest)} more big ${rest === 1 ? 'release' : 'releases'}`;
  if (bef.length && bef.length <= 3) return `${verb}, after ${named(bef)}`;
  if (bef.length) return `${verb}, and ${noun(bef.length)} land first`;
  return aft.length <= 2 ? `${verb}, with ${named(aft)} to follow` : `${verb}, with ${noun(aft.length)} to follow`;
}

/** The market state in one line: the warning flags and the VIX. */
function regimeLine(regimeWord, rf) {
  const w = String(regimeWord ?? '').toLowerCase().replace(/-/g, ' ').trim(), head = w ? `${cap(w)} regime. ` : '';
  if (!rf || !Number.isFinite(rf.total)) return head.trim();
  const measured = (rf.flags ?? []).filter(f => f.on !== null && f.on !== undefined).length || rf.total, on = rf.active ?? 0;
  const vix = (rf.flags ?? []).find(f => /^VIX elevated/i.test(f.label ?? '') && Number.isFinite(f.value));
  const state = on === 0 && measured === 1 ? 'The one measured warning flag is off' : on === 0 ? `None of the ${measured} measured warning flags is on` : on === 1 ? `One of the ${measured} measured warning flags is on` : `${on} of the ${measured} measured warning flags are on`;
  return `${head}${state}${vix ? `, VIX ${vix.value.toFixed(1)}` : ''}.`;
}

/** What changed: the last issue's differences, or failing that the market that has used most of its normal day. */
function changedLine(since, assets) {
  const items = (since && !since.first ? since.items ?? [] : []).map(i => String(i.text ?? '').trim()).filter(Boolean).slice(0, 2);
  const busy = (assets ?? []).filter(r => Number.isFinite(r.used) && Number.isFinite(r.d1)).sort((a, b) => b.used - a.used)[0];
  const sg = v => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(2)}%`;
  const mover = busy ? (busy.used >= 0.8 ? `${busy.label} has moved ${sg(busy.d1)}, ${Math.round(busy.used * 100)}% of a normal day's range.` : `Nothing has moved much: the busiest market, ${busy.label}, has used ${Math.round(busy.used * 100)}% of a normal day's range.`) : '';
  const big = (assets ?? []).filter(r => Number.isFinite(r.d1) && r.label).sort((x, y) => Math.abs(y.d1) - Math.abs(x.d1))[0];
  const fallback = mover || (big && Math.abs(big.d1) > 0 ? `The biggest move on the board is ${big.label}, ${sg(big.d1)} today.` : '');
  return [...items.map(t => (/[.!?]$/.test(t) ? t : t + '.')), items.length ? '' : fallback].filter(Boolean).join(' ');
}

/** The next high-impact events, in UK time. */
function watchLine(hi, nextHigh, weekly) {
  if (!hi.length) return nextHigh ? `Nothing high-impact in the window. Next: ${listName(nextHigh)}, ${wday(nextHigh.ms)} ${hhmm(nextHigh.ms)} UK time.` : 'No high-impact releases in the window.';
  const shown = hi.slice(0, weekly ? 5 : 4).map(e => `${listName(e)} ${weekly ? wday(e.ms).slice(0, 3) + ' ' : ''}${hhmm(e.ms)}`);
  return `${list(shown)}${hi.length > shown.length ? `, and ${num(hi.length - shown.length)} more` : ''}. UK time.`;
}

/**
 * The opening for one issue: { kicker, headline, regime, changed, watch }.
 * Inputs: events (ms, ccy, event, impact), nowMs, since, regimeWord, riskFlags, assets (label, d1, used), weekly.
 */
export function todayOpening({ events, nowMs, since, regimeWord, riskFlags, assets, weekly = false } = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now(), hi = windowEvents(events, now, weekly);
  const nextHigh = hi.length ? null : (events ?? []).filter(e => e?.impact === 'high' && e.ms > now).sort((a, b) => a.ms - b.ms)[0] ?? null;
  const day = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  return { kicker: weekly ? `This week · from ${day}` : `Today · ${day}`, headline: headlineOf(hi, nextHigh, weekly), regime: regimeLine(regimeWord, riskFlags), changed: changedLine(since, assets), watch: watchLine(hi, nextHigh, weekly), count: hi.length };
}
