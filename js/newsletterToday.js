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

/** The Fed-pricing sentence, only on a day with a Fed decision and only while the tracker is under a week old. */
function fedLine(fp, hi, now) {
  if (!fp || !hi.some(e => e.ccy === 'USD' && isDecision(e)) || !Number.isFinite(fp.hike) || !Number.isFinite(fp.cut)) return '';
  const age = (now - Date.parse(`${fp.asOf}T12:00:00Z`)) / 864e5;
  if (!(age >= -1 && age <= 7)) return '';
  const dm = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `Futures put the chance of a hike by ${fp.ref ? 'the ' + dm(fp.ref) + ' meeting' : 'the next meeting'} at ${Math.round(fp.hike)}% and of a cut at ${Math.round(fp.cut)}% (Atlanta Fed tracker, ${dm(fp.asOf)}).`;
}

/** Evidence Book 'asia-range-london' (2026-09-18): share of days London reached the median band after 07:00, top-tercile Asia range against narrow Asia. */
const ASIA_LONDON = { GOLD: [24, 46], USDJPY: [18, 36], EURUSD: [33, 42] };

/** Verbs by size of move, third person singular then plural: edges / edge, slips / slip, slides / slide, tumbles / tumble. */
const VB = { fall: [['edges lower', 'edge lower'], ['slips', 'slip'], ['slides', 'slide'], ['tumbles', 'tumble']], rise: [['edges higher', 'edge higher'], ['climbs', 'climb'], ['jumps', 'jump'], ['surges', 'surge']] };
const verb = (down, mult, plural) => VB[down ? 'fall' : 'rise'][mult >= 2 ? 3 : mult >= 1.3 ? 2 : mult >= 0.9 ? 1 : 0][plural ? 1 : 0];

/**
 * The day's take, written like a newspaper: { headline, lead, asiaNote, close }.
 * Candidates are scored as a multiple of their own normal: a market by its move against its median daily range (or the share of the day's range already used),
 * the 10-year yield by 6bp, junk spreads by 8bp, VIX by 2 points; only scores of 0.75 or more count. A wild Asia session (the range at least twice the desk's own
 * wide-tercile mark) leads when there is one, with the net move since the Asia open. Observed figures only, never a direction call, and null on a quiet tape.
 */
function dayTake({ assets, changes, hi, now, asia }) {
  const c = k => (changes ?? []).find(x => x.key === k && !x.stale && Number.isFinite(x.d1)), cand = [];
  const y = c('us10y'), hy = c('hy'), vx = c('vix'), r1 = v => Math.round(Math.abs(v)), dn = v => v < 0;
  if (y) { const m = Math.abs(y.d1) / 6; cand.push({ score: m, head: `Treasury yields ${verb(dn(y.d1), m, true)} ${r1(y.d1)}bp`, fact: `US 10-year yields ${dn(y.d1) ? 'fell' : 'rose'} ${r1(y.d1)}bp` }); }
  if (hy) cand.push({ score: Math.abs(hy.d1) / 8, head: `Junk-bond spreads ${dn(hy.d1) ? 'tighten' : 'widen'} ${r1(hy.d1)}bp`, fact: `junk spreads ${dn(hy.d1) ? 'tightened' : 'widened'} ${r1(hy.d1)}bp` });
  if (vx) cand.push({ score: Math.abs(vx.d1) / 2, head: `The VIX ${dn(vx.d1) ? 'eases' : 'jumps'} ${Math.abs(vx.d1).toFixed(1)} points`, fact: `VIX ${dn(vx.d1) ? 'fell' : 'rose'} ${Math.abs(vx.d1).toFixed(1)} points` });
  for (const r of assets ?? []) {
    if (!r?.label || !Number.isFinite(r.d1)) continue;
    const m = Number.isFinite(r.used) ? r.used : Number.isFinite(r.hlMed) && r.hlMed > 0 ? Math.abs(r.d1) / r.hlMed : null;
    if (m !== null) cand.push({ score: m, head: `${r.label} ${verb(dn(r.d1), m, false)} ${Math.abs(r.d1).toFixed(1)}%`, fact: `${r.label} ${dn(r.d1) ? 'fell' : 'rose'} ${Math.abs(r.d1).toFixed(1)}%` });
  }
  const top = cand.filter(x => x.score >= 0.75).sort((a, b) => b.score - a.score);
  // a wild Asia: at least twice the desk's own wide-tercile mark, the two biggest at most
  const wild = (assets ?? []).map(r => ({ r, s: r?.key ? asia?.[r.key] : null })).filter(x => x.r?.label && x.s && x.s.band === 'wide' && Number.isFinite(x.s.atr) && x.s.cutHigh > 0 && x.s.atr / x.s.cutHigh >= 2).sort((a, b) => b.s.atr / b.s.cutHigh - a.s.atr / a.s.cutHigh).slice(0, 2);
  if (!top.length && !wild.length) return null;
  const lead = hi.filter(isDecision).sort((a, b) => decisionRank(a) - decisionRank(b))[0] ?? hi[0];
  const tail = !lead ? '' : lead.ms > now ? (isDecision(lead) ? ` as the ${BANK[lead.ccy].replace(/^the /, '')} decision looms` : ` with ${nameOf(lead)} due at ${hhmm(lead.ms)}`) : ` after ${isDecision(lead) ? `the ${BANK[lead.ccy].replace(/^the /, '')} decision` : nameOf(lead)}`;
  let headline, leadFacts = '', asiaNote = '', used = null;
  if (wild.length) {
    const nets = wild.map(x => x.s.netPct), plural = wild.length > 1, whip = wild.every(x => Number.isFinite(x.s.netPct) && Number.isFinite(x.s.rangePct) && Math.abs(x.s.netPct) < 0.35 * x.s.rangePct);
    const mixed = whip || nets.some(n => !Number.isFinite(n)) || (nets.some(n => n > 0) && nets.some(n => n < 0)), dir = (mixed ? ['swings wildly', 'swing wildly'] : nets[0] < 0 ? ['lurches lower', 'lurch lower'] : ['lurches higher', 'lurch higher'])[plural ? 1 : 0];
    headline = `${list(wild.map(x => x.r.label))} ${dir} in a wild Asian session${tail}`;
    leadFacts = wild.map(x => `${x.r.label} covered ${Math.round(x.s.atr * 100)}% of a normal day's range before London opened${Number.isFinite(x.s.netPct) && Math.abs(x.s.netPct) >= 0.05 ? ` and ended Asia ${Math.abs(x.s.netPct).toFixed(1)}% ${x.s.netPct < 0 ? 'lower' : 'higher'}` : ''}.`).join(' ');
    used = wild.find(x => ASIA_LONDON[x.r.key]);
    if (used) asiaNote = `Past wide-Asia days have left less for London: after 07:00 ${used.r.label} reached the median band on ${ASIA_LONDON[used.r.key][0]}% of them, against ${ASIA_LONDON[used.r.key][1]}% when Asia was narrow.`;
  } else headline = `${top[0].head}${tail}`;
  const rest = (wild.length ? top : top.slice(0, 3)).slice(0, 3);
  return { headline, lead: leadFacts, asiaNote, close: rest.length ? `Since yesterday's close: ${rest.map(x => x.fact).join('; ')}.` : '' };
}

/** What sort of day it is, in two words, for the kicker above the headline. */
function dayType(hi) {
  if (hi.some(e => e.ccy === 'USD' && isDecision(e))) return 'Fed day';
  const banks = hi.filter(isDecision).length;
  if (banks > 1) return 'Central bank day';
  if (banks === 1) return `${cap(listName(hi.find(isDecision)))} day`;
  return hi.length >= 3 ? 'Heavy data day' : hi.length ? 'Data day' : 'Quiet day';
}

/** The first sentence of the lede: how much is due and what has already happened today. */
function loadLine(hi, done, weekly) {
  if (!hi.length) return '';
  const n = hi.length, banks = hi.filter(isDecision).sort((a, b) => decisionRank(a) - decisionRank(b)).map(e => listName(e));
  if (weekly) return `${cap(num(n))} high-impact ${n === 1 ? 'release is' : 'releases are'} due in the next seven days${banks.length ? `, including ${list(banks)}` : ''}.`;
  const out = done.length ? ` ${cap(list(done.map(e => BANK[e.ccy])))} ${done.length === 1 ? 'has' : 'have'} already decided.` : '';
  return `${cap(num(n))} high-impact ${n === 1 ? 'release is' : 'releases are'} due today${n > 1 ? `, the last at ${hhmm(hi.at(-1).ms)} UK time` : ` at ${hhmm(hi[0].ms)} UK time`}.${out}`;
}

/** The day sheet: each high-impact release in time order with what is known about it. */
function sheetOf(hi, cb, weekly) {
  return hi.slice(0, weekly ? 7 : 6).map(e => {
    const dec = isDecision(e), st = dec ? (cb ?? []).find(c => c.ccy === e.ccy && c.regime) : null, rng = e.note?.range ?? null;
    const detail = [e.estimate ? `Expected ${e.estimate}.` : '', st ? `Its last statement read ${String(st.regime).toLowerCase()}.` : '', rng ? `Usual effect: ${rng}.` : ''].filter(Boolean).slice(0, 2).join(' ');
    return { when: `${weekly ? wday(e.ms).slice(0, 3) + ' ' : ''}${hhmm(e.ms)}`, name: dec ? `${cap(listName(e))} rate decision` : clip(e.event, 44), ccy: e.ccy ?? '', detail };
  });
}

/**
 * The weekly issue's one-line story, from the five-session changes only (never the 20-day window): { headline, standfirst } or null.
 * Yields and spreads are in basis points, VIX in points, the dollar index in percent (from its point change), all as measured over the last five sessions.
 */
export function weekStory(changes) {
  const g = k => (changes ?? []).find(c => c.key === k && !c.stale && Number.isFinite(c.d5)), abs = v => Math.abs(Math.round(v)), sgn = v => (v < 0 ? 'fell' : 'rose');
  const y10 = g('us10y'), hy = g('hy'), tips = g('tips'), cur = g('us2s10s'), vix = g('vix'), dxy = g('dxy');
  const flat = c => !c || abs(c.d5) < 1;
  let headline;
  if (y10 && !flat(y10) && hy && hy.d5 >= 5 && y10.d5 < 0) headline = `Yields fell ${abs(y10.d5)}bp this week, yet junk-bond spreads widened ${abs(hy.d5)}bp`;
  else if (y10 && !flat(y10)) headline = `The 10-year yield ${sgn(y10.d5)} ${abs(y10.d5)}bp over the week`;
  else if (y10) headline = 'The 10-year yield barely moved this week';
  else return null;
  const parts = [];
  if (tips && y10 && !flat(y10) && !flat(tips)) parts.push(`the real yield ${sgn(tips.d5)} ${abs(tips.d5)}bp, which is ${Math.min(100, Math.round(100 * tips.d5 / y10.d5))}% of the 10-year's move`);
  if (cur && !flat(cur)) parts.push(`the 2s10s curve ${cur.d5 < 0 ? 'flattened' : 'steepened'} ${abs(cur.d5)}bp`);
  if (hy && !(y10 && hy.d5 >= 5 && y10.d5 < 0) && !flat(hy)) parts.push(`junk spreads ${hy.d5 < 0 ? 'tightened' : 'widened'} ${abs(hy.d5)}bp`);
  if (vix && Math.abs(vix.d5) >= 1) parts.push(`VIX ${sgn(vix.d5)} ${Math.abs(vix.d5).toFixed(1)} points`);
  const dxp = dxy && dxy.last - dxy.d5 ? 100 * dxy.d5 / (dxy.last - dxy.d5) : null;
  if (dxp !== null && Math.abs(dxp) >= 0.1) parts.push(`the dollar index ${sgn(dxp)} ${Math.abs(dxp).toFixed(1)}%`);
  const sf = parts.slice(0, 3);
  return { headline, standfirst: sf.length ? `${sf[0].charAt(0).toUpperCase()}${sf[0].slice(1)}${sf.length > 1 ? `; ${sf.slice(1).join('; ')}` : ''}. Measured over the last five sessions.` : 'Measured over the last five sessions.' };
}

/**
 * The opening for one issue: { kicker, headline, regime, changed, watch }.
 * Inputs: events (ms, ccy, event, impact, estimate, note), nowMs, since, regimeWord, riskFlags, assets (label, d1, used), weekly, fedPath, cb, board.
 * Also returns lede (the day in three or four sentences), sheet (the releases, timed) and board (the few numbers that frame the day).
 */
export function todayOpening({ events, nowMs, since, regimeWord, riskFlags, assets, weekly = false, fedPath, cb, board, changes, asia } = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now(), hi = windowEvents(events, now, weekly);
  const nextHigh = hi.length ? null : (events ?? []).filter(e => e?.impact === 'high' && e.ms > now).sort((a, b) => a.ms - b.ms)[0] ?? null;
  const day = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  const done = weekly ? [] : (events ?? []).filter(e => e?.impact === 'high' && isDecision(e) && Number.isFinite(e.ms) && e.ms < now - 36e5 && ukDay(e.ms) === ukDay(now)).sort((x, y) => x.ms - y.ms);
  const take = weekly ? null : dayTake({ assets, changes, hi, now, asia });
  const regime = regimeLine(regimeWord, riskFlags), changed = changedLine(since, assets);
  const lede = [take?.lead, take?.asiaNote, loadLine(hi, done, weekly), fedLine(fedPath, hi, now), take ? take.close : changed, regime].filter(Boolean).join(' ');
  return { story: weekly ? 'The week in one line' : 'The month in one line', lede, sheet: sheetOf(hi, cb, weekly), board: (board ?? []).filter(b => b?.label && b.value).slice(0, 6), kicker: weekly ? `This week · from ${day}` : `${dayType(hi)} · ${day}`, headline: take?.headline || headlineOf(hi, nextHigh, weekly), regime, changed, watch: watchLine(hi, nextHigh, weekly), count: hi.length };
}
