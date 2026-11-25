// js/terminal/broadcastCore.js: the pure half of Jarvis's MORNING BROADCAST, the morning review played as a TV-news package over the hologram views: a cold open, THE LEAD (the top three
// things that matter this morning, each on a full-screen card with its number), then numbered segments (Markets, The Chain, Rates, Currencies, Volatility, Positioning, The Day Ahead) and a sign-off.
// This file writes the words (templates over numbers, no model call), picks the lead, plans which scene plays in each segment (the first view that exists; a segment with nothing is skipped),
// numbers the segments, estimates durations, and formats the ticker crawl and the subtitles. The DOM overlay and the director are in jarvisModBroadcast.js.
// Voice: a sharp, slightly robotic news anchor. Short declarative sentences, the number first, rounded ("2.4 times its usual move"). Every segue carries a number from the data; the lead's opener
// rotates by date (deterministic, so a recording is reproducible); no sentence is said twice in one programme; the description-only line is said ONCE, in the sign-off (the corner bug carries it on
// screen). DESCRIPTION ONLY: nothing here is a forecast, a signal or a trade.
import { spokenName, marketName } from './jarvisNames.js';
import { readSeconds } from './showCore.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ── dates and spoken numbers ──
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
  'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** A small whole number in words (up to twelve), else digits. */
export const numWord = n => (Number.isInteger(n) && n >= 0 && n < NUMW.length ? NUMW[n] : String(n));
const parts = d => { const o = {}; for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)) o[p.type] = p.value; return o; };
/** The date three ways (London time): card "FRIDAY 20 NOVEMBER", spoken "Friday the twentieth of November", short "FRI 20 NOV", plus the London hour. */
export function dateWords(now = new Date()) {
  const d = now instanceof Date && !Number.isNaN(+now) ? now : new Date(), p = parts(d), day = +p.day;
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
  const doy = Math.round((Date.UTC(ymd[0], ymd[1] - 1, ymd[2]) - Date.UTC(ymd[0], 0, 1)) / 86_400_000) + 1;
  return { card: `${p.weekday} ${day} ${p.month}`.toUpperCase(), spoken: `${p.weekday} the ${ORD[day] ?? day} of ${p.month}`, short: `${p.weekday.slice(0, 3)} ${day} ${p.month.slice(0, 3)}`.toUpperCase(), hour: +p.hour % 24, hm: `${p.hour}:${p.minute}`, weekday: p.weekday, doy };
}
/** 'morning' before noon, 'afternoon' before six, else 'evening' (London hour): the programme's title and the cards follow the clock. */
export const partOfDay = h => (h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');
const greeting = h => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
/** A percent move for the voice: "2.1 percent", "0.42 percent", "12 percent". */
export const pctWords = v => { const a = Math.abs(v); return `${a >= 10 ? Math.round(a) : a >= 1 ? a.toFixed(1) : String(+a.toFixed(2))} percent`; };
/** A multiple of the usual move for the voice: "twice", "1.8 times", "about", "half". Rounded to one decimal; ten and over to whole numbers. */
export function timesWords(r) {
  const a = Math.abs(r), t = a >= 10 ? String(Math.round(a)) : a.toFixed(1);
  if (t === '1.0') return 'about'; if (t === '2.0') return 'twice'; if (t === '3.0') return 'three times'; if (t === '0.5') return 'half';
  return `${t} times`;
}
/** A multiple on screen: "1.8×", "12×". */
export const timesFig = r => `${Math.abs(r) >= 10 ? Math.round(Math.abs(r)) : Math.abs(r).toFixed(1)}×`;
/** A percent move on screen, signed: "+0.42%", "−2.1%". */
export function pctFig(v) { if (!fin(v)) return '–'; const a = Math.abs(v), s = a >= 10 ? Math.round(a) : a >= 1 ? a.toFixed(1) : a.toFixed(2); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}%`; }

/** Text made speakable and quiet: arrows to "to", dashes to commas, no symbols the voice would trip on. */
export const clean = t => String(t ?? '').replace(/\s*[→⇒]\s*/g, ' to ').replace(/\s*[—–]\s*/g, ', ').replace(/\s*&\s*/g, ' and ').replace(/(\d)\s*%/g, '$1 percent')
  .replace(/\bm\/m\b/gi, 'month on month').replace(/\by\/y\b/gi, 'year on year').replace(/\bq\/q\b/gi, 'quarter on quarter').replace(/\s+/g, ' ').trim();
/**
 * Whole sentences up to about maxWords (always at least one). For the QUICK broadcast: a leading sentence that only names the picture ("Rate paths: what futures price...", a colon and
 * no number) is dropped when more follows, and if the cut kept no number at all, the first sentence that has one is added, so the short line still carries its fact.
 */
export function trimWords(text, maxWords) {
  const s = String(text ?? '').trim(); if (!maxWords || !s) return s;
  let sents = s.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
  const words = x => x.split(/\s+/).filter(Boolean).length, hasNum = x => /\d/.test(x);
  while (sents.length > 1 && /:/.test(sents[0]) && !hasNum(sents[0]) && sents.slice(1).some(hasNum)) sents = sents.slice(1);
  const out = []; let n = 0;
  for (const x of sents) { const w = words(x); if (out.length && n + w > maxWords) break; out.push(x); n += w; }
  if (!out.some(hasNum)) { const k = sents.find(x => hasNum(x) && !out.includes(x)); if (k) out.push(k); }
  return out.join(' ');
}

const CCY_WORD = { USD: 'US', EUR: 'Euro area', GBP: 'UK', JPY: 'Japan', AUD: 'Australia', NZD: 'New Zealand', CAD: 'Canada', CHF: 'Swiss', CNY: 'China', CNH: 'China' };
const BIG = /\b(cpi|inflation|payroll|nfp|non-?farm|employment|jobs|unemployment|fomc|rate decision|interest rate|monetary policy|press conference|gdp|retail sales|ecb|boe|boj|fed\b|powell|lagarde|bailey)/i;
/** One calendar event normalised: { time 'HH:MM', ccy, event, where 'US', big } or null. Accepts the morning digest's { time, ccy, event } or a plain string. */
export function normEvent(e) {
  if (!e) return null;
  if (typeof e === 'string') { const m = e.match(/^\s*(\d{1,2}:\d{2})\s+(.*)$/); const ev = clean(m ? m[2] : e); return ev ? { time: m ? m[1].padStart(5, '0') : '', ccy: '', event: ev, where: '', big: BIG.test(ev) } : null; }
  const ev = clean(e.event ?? e.title ?? e.name ?? ''); if (!ev) return null;
  const ccy = String(e.ccy ?? '').toUpperCase(), time = String(e.time ?? '').match(/^\d{1,2}:\d{2}$/) ? String(e.time).padStart(5, '0') : '';
  return { time, ccy, event: ev, where: CCY_WORD[ccy] ?? ccy, big: BIG.test(ev) };
}
const evName = e => (e.where && !e.event.toLowerCase().startsWith(e.where.toLowerCase()) ? `${e.where} ${e.event}` : e.event);

// ── THE LEAD ──
/**
 * The top things that matter this morning, best first. inp = { movers: candle rows biggest first, board: boardSummary, chain: st.sum, events: [{time, ccy, event}] }.
 * Each item: { kind 'mover'|'chain'|'event'|'quiet', score, figure (the big number), figLabel, headline, sub, tone 'up'|'dn'|'gold'|'tx', text (spoken), key? }.
 * At most two movers, one chain item and one event, so the lead is never three versions of the same story.
 */
/** The markets the owner trades (25 Nov 2026: "Nasdaq, gold, FX majors really, unless anything insane has happened on an asset"): only these lead, unless another moves INSANE x its usual. */
export const LEAD_CORE = new Set(['NQ', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD']), LEAD_INSANE = 4;
export function pickLead(inp = {}, n = 3) {
  const cand = [], mv = (inp.movers ?? []).filter(m => m && fin(m.ratio) && fin(m.oc) && m.tone !== 'quiet'), ch = inp.chain, ev = (inp.events ?? []).map(normEvent).filter(Boolean);
  let nm = 0;
  const told = new Set(inp.headKeys ?? []);          // markets THE HEADLINE already named: the lead does not repeat them
  for (const m of mv) {
    const a = Math.abs(m.ratio); if (a < 1.2 || told.has(m.key)) continue;
    // an obscure cross or a soft commodity leads only on an extraordinary day
    if (!inp.leadAll && !LEAD_CORE.has(m.key) && a < LEAD_INSANE) continue;
    const up = m.ratio > 0, tw = timesWords(m.ratio), k = nm++;
    // two phrasings, so two movers in one lead never share a sentence
    const say = k === 0 ? `${spokenName(m.key)} is ${up ? 'up' : 'down'} ${pctWords(m.oc)}. That is ${tw === 'about' ? 'about its usual move' : `${tw} its usual move`}.`
      : `${spokenName(m.key)}, ${up ? 'up' : 'down'} ${pctWords(m.oc)}: ${tw === 'about' ? 'a normal-sized day' : `${tw} a normal day's travel`}.`;
    cand.push({ kind: 'mover', key: m.key, score: Math.min(a, 6), figure: timesFig(m.ratio), figLabel: 'its usual move', headline: `${marketName(m.key)} ${up ? 'up' : 'down'} ${pctFig(m.oc).replace(/^[+−]/, '')}`, sub: `${up ? '▲ Up' : '▼ Down'} ${pctFig(m.oc).replace(/^[+−]/, '')} so far today, against its own usual move`, tone: up ? 'up' : 'dn', say });
  }
  // the textbook-links count no longer competes for the lead (owner, 24 Nov 2026: it led both programmes, and the desk's tests give those macro links little weight); it stays a
  // one-line segment. inp.chainLead = true brings it back.
  if (inp.chainLead && ch && fin(ch.broken) && ch.broken > 0) {
    const judged = fin(ch.judged) && ch.judged >= ch.broken ? ch.judged : ch.broken + (fin(ch.holding) ? ch.holding : 0), names = (ch.brokenShort ?? []).map(clean).filter(Boolean);
    cand.push({ kind: 'chain', score: Math.min(4, 1.6 + 0.5 * ch.broken), figure: `${ch.broken} of ${judged}`, figLabel: 'textbook links broken', headline: ch.broken === 1 ? 'A textbook link has broken' : 'Textbook links are breaking', sub: names.slice(0, 2).join('  ·  ') || 'in the macro chain', tone: 'gold',
      say: `in the chain, ${numWord(ch.broken)} of ${numWord(judged)} textbook links ${ch.broken === 1 ? 'is' : 'are'} broken${names.length ? `, ${ch.broken === 1 ? '' : 'led by '}${names[0]}` : ''}.` });
  }
  const big = ev.filter(e => e.big), first = big[0] ?? ev[0];
  if (first) {
    cand.push({ kind: 'event', score: big.length ? 1.9 : 1.25, figure: first.time || `${ev.length}`, figLabel: first.time ? 'UK time' : 'releases today', headline: evName(first), sub: `${ev.length === 1 ? 'The one' : `One of ${ev.length}`} high-impact release${ev.length === 1 ? '' : 's'} today`, tone: 'tx',
      say: `${first.time ? `at ${first.time} UK time, ` : 'today, '}${evName(first)}. ${ev.length > 1 ? `It heads a list of ${numWord(ev.length)}.` : 'The one big release today.'}` });
  }
  cand.sort((a, b) => b.score - a.score);
  const out = [], cnt = { mover: 0, chain: 0, event: 0 }, lim = { mover: 2, chain: 1, event: 1 };
  for (const c of cand) { if (out.length >= n) break; if (cnt[c.kind] >= lim[c.kind]) continue; cnt[c.kind]++; out.push(c); }
  for (const c of cand) { if (out.length >= n) break; if (!out.includes(c)) out.push(c); }       // a thin morning may lean on a third mover
  const bd = inp.board;
  if (!out.length && bd && bd.n) out.push({ kind: 'quiet', score: 0, figure: `${bd.quiet} of ${bd.n}`, figLabel: 'markets barely moving', headline: 'A quiet start', sub: 'No market is far outside its usual move', tone: 'tx', say: `a quiet start. ${cap1(numWord(bd.quiet))} of the ${bd.n} markets are barely moving against their usual size.` });
  for (const x of out) x.text = cap1(x.say);
  return out;
}
/** The lead's openers, rotated by the day of the year (form = doy % 3): the same date always gets the same words. */
export const LEAD_OPENERS = [
  (n, when) => (n === 1 ? `One story leads ${when}.` : `${cap1(numWord(n))} stories lead ${when}.`),
  (n, when) => `Here is what matters ${when}.`,
  (n, when) => (n === 1 ? `One thing to know ${when}.` : `${cap1(numWord(n))} things to know ${when}.`),
];
/** The lead's spoken lines: "<opener> First, gold is up..." then "Second, ..." and "And third, ...". The only "First" in the programme (the segues never count). */
export function leadLines(lead, when = 'this morning', form = 0) {
  const n = lead.length, open = LEAD_OPENERS[((form % 3) + 3) % 3](n, when);
  return lead.map((x, i) => {
    const intro = i === 0 ? `${open} ` : '';
    if (n === 1) return intro + cap1(x.say);
    const ord = i === n - 1 ? (n === 2 ? 'And second' : n === 3 ? 'And third' : 'And finally') : ['First', 'Second', 'Third'][i];
    return `${intro}${ord}, ${x.say}`;
  });
}

// ── built-in scenes (the HUD's own views: candles, skyline, globe) ──
/** Markets the RANGES scene names, in order of preference (the first four present with a typical range). */
export const RANGE_KEYS = ['NQ', 'SPX500', 'GOLD', 'EURUSD', 'USDJPY', 'GBPUSD', 'BRENT', 'WTI', 'BTCUSD', 'DE30'];
export const BUILTIN = {
  // the vol model's typical high-to-low range for today (its median day), per headline market, and how much of it the day has already used. Sizes, never direction.
  ranges(inp) {
    const rows = (inp.rows ?? []).filter(r => r && fin(r.range) && r.range > 0), pick = RANGE_KEYS.map(k => rows.find(r => r.key === k)).filter(Boolean).slice(0, 4);
    if (pick.length < 2) return null;
    const t = [`The vol model's typical range for today, high to low: ${list(pick.map(r => `${spokenName(r.key)} about ${pctWords(r.range)}`))}.`];
    const used = pick.filter(r => fin(r.hl) && r.hl > 0).map(r => ({ r, u: r.hl / r.range })).sort((a, b) => b.u - a.u)[0];
    if (used && used.u >= 0.25) t.push(`${cap1(spokenName(used.r.key))} has already used ${used.u >= 1 ? 'all' : `${Math.round(used.u * 100)} percent`} of its${used.u >= 1 ? ' typical range, and more' : ''}.`.replace(/of its\.$/, 'of it.'));
    if (pick.some(r => fin(r.range75))) t.push('One day in four runs bigger. Those are sizes, not direction.');
    return { title: "Today's ranges", view: 'vol', cam: null, text: t.join(' '), figure: { value: `${pick[0].range >= 1 ? pick[0].range.toFixed(1) : String(+pick[0].range.toFixed(2))}%`, label: `${marketName(pick[0].key, { short: true })} typical range` } };
  },
  // EVENING: how much of its typical high-to-low range each headline market actually used today (the morning's ranges scene, told looking back). Sizes, never direction.
  rangeused(inp) {
    const rows = (inp.rows ?? []).filter(r => r && fin(r.range) && r.range > 0 && fin(r.hl) && r.hl > 0), pick = RANGE_KEYS.map(k => rows.find(r => r.key === k)).filter(Boolean).slice(0, 6);
    if (pick.length < 2) return null;
    const u = pick.map(r => ({ r, u: r.hl / r.range })).sort((a, b) => b.u - a.u), top = u.slice(0, 2), over = rows.filter(r => r.hl > r.range).length;
    // the morning's number checked against the day (owner, 24 Nov 2026): what the vol model's typical range said this morning, and what the market travelled
    const pc = v => pctWords(v);
    const t = [`This morning's typical ranges, against the day.`, ...top.map(x => `${cap1(spokenName(x.r.key))}: ${pc(x.r.range)} expected, ${pc(x.r.hl)} travelled.`)];
    t.push(over ? `${cap1(numWord(over))} of ${rows.length} markets ran past their typical range.` : `None of the ${rows.length} markets ran past its typical range.`);
    return { title: 'Morning range vs the day', view: 'vol', cam: null, text: t.join(' '), figure: { value: `${Math.round(top[0].u * 100)}%`, label: `${marketName(top[0].r.key, { short: true })} of the morning's range` } };
  },
  // the board's counts are in the Markets segue; the body names the movers, skipping any the lead has already covered (inp.leadKeys)
  candles(inp) {
    const bd = inp.board, mv = (inp.movers ?? []).filter(m => m && fin(m.ratio) && fin(m.oc)); if (!bd || !bd.n) return null;
    const said = new Set(inp.leadKeys ?? []), fresh = mv.filter(m => !said.has(m.key)), mvWord = m => `${spokenName(m.key)} ${m.ratio > 0 ? 'up' : 'down'} ${pctWords(m.oc)}`;
    const top = mv[0], t = [];
    if (top && !said.has(top.key)) {
      t.push(`The widest move is ${spokenName(top.key)}, ${top.ratio > 0 ? 'up' : 'down'} ${pctWords(top.oc)}, ${timesWords(top.ratio) === 'about' ? 'about its usual size' : `${timesWords(top.ratio)} its usual size`}.`);
      const two = fresh.filter(m => m !== top).slice(0, 2).map(mvWord); if (two.length) t.push(`Behind it, ${list(two)}.`);
    } else if (fresh.length) t.push(`Beyond the lead, ${list(fresh.slice(0, 3).map(mvWord))}.`);
    else t.push(`Every candle is scaled to its own market's usual day.`);
    return { title: 'Today as candles', view: 'candles', cam: { fly: true }, text: t.join(' '), figure: top ? { value: timesFig(top.ratio), label: `${marketName(top.key, { short: true })} vs usual` } : { value: `${bd.up} / ${bd.dn}`, label: 'up / down' } };
  },
  chain(inp) {
    const ch = inp.chain; if (!ch) return null;
    const head = ch.headline ? clean(ch.headline).replace(/first-order reads are enough today/i, 'the first-order reads are enough') : `${ch.holding ?? 0} links are holding and ${ch.broken ?? 0} are broken.`;
    return { title: 'The macro chain', view: 'skyline', cam: { drift: true }, text: head, figure: fin(ch.broken) ? { value: `${ch.broken}`, label: 'links broken' } : null };
  },
  ahead(inp) {
    const ev = (inp.events ?? []).map(normEvent).filter(Boolean); if (!ev.length) return null;
    const lines = ev.slice(0, 4).map(e => (e.time ? `at ${e.time}, ${evName(e)}` : evName(e)));
    return { title: 'The calendar', view: 'globe', cam: { region: 'world' }, text: `${cap1(list(lines))}.`, figure: { value: String(ev.length), label: `high-impact release${ev.length === 1 ? '' : 's'}` } };
  },
};
const isAre = n => (n === 1 ? 'is' : 'are');
const CORE_VIEWS = new Set(['globe', 'candles', 'skyline', 'bubbles', 'orbit']);

/** A key number in words for the voice: "65 bp" -> "65 basis points", "2.4×" -> "2.4 times usual", "15%" -> "15 percent"; a label is added after a comma when it says what the number is. */
export function speakFig(fig) {
  if (!fig || fig.value == null || fig.value === '') return null;
  let v = String(fig.value).trim().replace(/\s*bp$/i, ' basis points').replace(/%$/, ' percent').replace(/^[−-]\s*(?=\d)/, 'minus ');
  const x = /×$/.test(v); if (x) v = `${v.replace(/×$/, '')} times usual`;
  const lb = String(fig.label ?? '').trim(), skip = !lb || x || /^(key number|vs usual|uk time)$/i.test(lb);
  return skip ? v : `${v}, ${/^the /i.test(lb) ? '' : 'the '}${lb.toLowerCase()}`;
}
const FX = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']);
const isFx = k => /^[A-Z]{6}$/.test(k) && FX.has(k.slice(0, 3)) && FX.has(k.slice(3));
/**
 * The programme. tiers: the first tier with anything available plays; in the FULL broadcast every available scene of that tier plays, in QUICK only the first.
 * say(c) writes the anchor's hand-off into the segment and carries a number from the data (c = { inp, scene, fig (the scene's key number, spoken), leadKeys, leadKinds }); null -> the static `segue`.
 * Each has its own shape, so no two segues share a phrase; none of them counts ("First" belongs to the lead).
 */
export const SEGMENTS = [
  { id: 'markets', name: 'Markets', segue: 'Starting with the markets.', tiers: [['candles', 'wx']],
    say: ({ inp }) => { const b = inp.board; return b?.n ? `Starting with the markets. Of ${b.n} on the board, ${b.up} ${isAre(b.up)} up, ${b.dn} down, ${b.quiet} barely moving.` : null; } },
  { id: 'chain', name: 'The Chain', segue: 'The chain.', bodyless: true, tiers: [['reactor'], ['chainfly'], ['chain']],      // one line (owner, 24 Nov 2026): the counts, no body
    say: ({ inp, leadKinds }) => {
      const c = inp.chain; if (!c || !fin(c.holding) || !fin(c.broken)) return null;
      if (!c.broken) return `The chain is intact: all ${c.holding} judged links hold.`;
      return `The chain: ${c.holding} links holding, ${c.broken} broken.`;
    } },
  { id: 'macro', name: 'The Macro', segue: 'The bigger picture.', tiers: [['moneyglobe', 'surprise', 'cycle']], say: ({ fig }) => (fig ? `The bigger picture: ${fig}.` : null) },
  { id: 'rates', name: 'Rates', segue: 'Rates.', tiers: [['cbpaths', 'yields']], say: ({ fig }) => (fig ? `Rates. The headline number: ${fig}.` : null) },
  { id: 'ccy', name: 'Currencies', segue: 'Currencies.', tiers: [['fxgrid'], ['ccy']],
    say: ({ inp }) => {       // a count, not a name: the scene names the pairs itself
      const fx = (inp.rows ?? []).filter(r => r && isFx(r.key) && fin(r.ratio)); if (!fx.length) return null;
      const moving = fx.filter(r => r.tone !== 'quiet').length;
      return !moving ? `Currencies. All ${fx.length} pairs are quiet.` : moving === fx.length ? `Currencies. All ${fx.length} pairs are on the move.` : `Currencies. ${cap1(numWord(moving))} of ${fx.length} pairs are on the move.`;
    } },
  { id: 'vol', name: 'Volatility', segue: 'Volatility.', tiers: [['ivsurf'], ['vol']],
    say: ({ inp, fig }) => {
      const rows = (inp.rows ?? []).filter(r => r && fin(r.ratio)), big = rows.filter(r => Math.abs(r.ratio) >= 2).length;
      return big ? `Over to volatility. ${cap1(numWord(big))} of ${rows.length} markets are moving at least twice their usual size.` : fig ? `Over to volatility: ${fig}.` : null;
    } },
  { id: 'pos', name: 'Positioning', segue: 'Positioning, and where the options sit.', tiers: [['gpillar', 'gterrain', 'cot'], ['gamma']], say: ({ fig }) => (fig ? `Positioning, and where the options sit: ${fig}.` : null) },
  // THE WIDE programme's market-wide sections (25 Nov 2026; not in the phone Short): the tone and the news first, the bias after the outlook (morning) or the releases (evening)
  { id: 'tone', name: 'Market Tone', wide: true, keep: 2, segue: '', tiers: [['tone', 'wire'], ['wire']] },
  { id: 'bias', name: 'The Bias', wide: true, morning: true, segue: '', tiers: [['biasboard']] },
  { id: 'biasday', name: 'The Bias, Scored', wide: true, evening: true, segue: '', tiers: [['biasday']] },
  { id: 'curve', name: 'The Curve', wide: true, segue: '', tiers: [['curve']] },
  { id: 'stress', name: 'Stress & Positioning', wide: true, segue: '', tiers: [['stress']] },
  { id: 'cross', name: 'Cross-Asset', wide: true, segue: 'What is moving together.', tiers: [['net']] },
  // THE EVENING programme (after 18:00 London) opens on THE DAY and THE RELEASES and closes on TOMORROW, and drops THE OUTLOOK. evening: true = only in the evening.
  { id: 'day', name: 'The Day', evening: true, keep: 2, segue: 'The day, looking back.', tiers: [['daymove', 'rangeused'], ['rangeused']], say: () => 'The day, looking back.' },
  { id: 'releases', name: 'The Releases', evening: true, keep: 2, words: 75, segue: '', tiers: [['shocktoday', 'dayreview'], ['dayreview']] },      // the scene opens with its own words
  { id: 'next', name: 'Tomorrow', evening: true, words: 45, segue: '', tiers: [['tomorrow']] },
  // THE OUTLOOK: what today holds: the calendar with its expectations and typical reaction, then today's typical ranges. keep: 2 = both scenes play even in the quick and short cuts. First in the morning.
  { id: 'ahead', name: 'The Outlook', segue: 'The outlook for today.', keep: 2, tiers: [['dayahead', 'ranges', 'shockwave'], ['ahead', 'ranges'], ['ranges']],
    say: ({ inp }) => { const n = (inp.events ?? []).map(normEvent).filter(Boolean).length; return n ? `The outlook for today: ${numWord(n)} high-impact release${n === 1 ? '' : 's'} on the clock.` : null; } },
];
/** Every hook scene id the programme may use (so the director only prepares those). */
export const wantedSceneIds = () => [...new Set(SEGMENTS.flatMap(s => s.tiers.flat()))].filter(id => !BUILTIN[id]);
/** In the QUICK broadcast a scene's line is cut to whole sentences of about this many words (eight segments, a little over two minutes). */
export const QUICK_WORDS = 34;
/** The SHORT broadcast (mode 'short', for a YouTube Short, which must stay under 3 minutes): shorter lines, a two-item lead, and if the estimate still runs long the
 *  least essential segments go first, in this order. Markets, The Chain and The Day Ahead always stay. The budget is an ESTIMATE: a real run took about 1.2x it (transitions, the voice's own pace), so 120 s lands near 2.5 minutes.
 *  The laptop's FRAME-BY-FRAME recording has no waits between lines, so it asks for more (budgetSec 125, about 2 min 45 s; 145 ran to 3 min 14 s on 24 Nov). */
export const SHORT_WORDS = 24, SHORT_BUDGET_SEC = 120, SHORT_DROP = ['chain', 'macro', 'ccy', 'rates', 'pos', 'vol'];
// The drop order follows what is USEFUL for the day (24 Nov 2026): the slow-moving macro picture goes first, then currencies (the board and volatility already say which
// markets are moving), then rates; positioning (where the options sit: the gamma range read has evidence behind it) and volatility (implied and expected ranges, the
// desk's best-calibrated forecast) stay longest.
/** The evening's order of drops: the snapshots go before the look-back (The Day, The Releases and Tomorrow always stay; Markets repeats The Day, so it goes last). */
export const SHORT_DROP_EVENING = ['chain', 'vol', 'pos', 'ccy', 'macro', 'rates', 'markets'];
/** The one spoken disclaimer of the programme. */
export const SIGNOFF_TEXT = 'That is the briefing. Description, not advice. Until tomorrow.';
/** A sentence that is only a disclaimer or a cliché: dropped from scene bodies (the sign-off says it once for the whole programme). */
const DISCLAIM = /\b(?:description(?: only)?\b[^.!?]*\bnot\b|not a (?:forecast|call|signal|trade|prediction)|not advice|nothing here is a|that is where the story is)/i;
const sentences = t => String(t ?? '').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).filter(Boolean);
const norm = t => t.toLowerCase().replace(/[^a-z0-9.%]+/g, ' ').trim();
/** A scene body with disclaimer sentences and any sentence already said in this programme (said: Set of normalised sentences, updated) removed. */
export function dedupeBody(text, said) {
  const out = [];
  for (const x of sentences(text)) { const k = norm(x); if (DISCLAIM.test(x) || said.has(k)) continue; said.add(k); out.push(x); }
  return out.join(' ');
}

/**
 * The key number of a spoken line, for the lower-third: { value, label } or null. Takes the EARLIEST of: "1.8 times" -> 1.8×, "3 of 9" -> 3 of 9, "2.1 percent" -> 2.1%,
 * "12 basis points" -> 12 bp, a clock time; else the first plain number. Years (19xx/20xx) are not key numbers.
 */
export function keyFigure(text) {
  const s = String(text ?? ''), pats = [
    [/(\d+(?:\.\d+)?)\s*(?:times|×|x\b)/i, m => ({ value: `${m[1]}×`, label: 'vs usual' })], [/\btwice\b/i, () => ({ value: '2×', label: 'vs usual' })],
    [/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+of\s+(?:the\s+)?(\d+)\b/i, m => ({ value: `${NUMW.indexOf(m[1].toLowerCase()) > 0 ? NUMW.indexOf(m[1].toLowerCase()) : m[1]} of ${m[2]}`, label: '' })], [/(-?\d+(?:\.\d+)?)\s*(?:percent|%)/i, m => ({ value: `${m[1]}%`, label: '' })],
    [/(-?\d+(?:\.\d+)?)\s*(?:basis points?|bps?\b)/i, m => ({ value: `${m[1]} bp`, label: '' })], [/\b(\d{1,2}:\d{2})\b/, m => ({ value: m[1], label: 'UK time' })]];
  let best = null;
  for (const [re, f] of pats) { const m = s.match(re); if (m && (best == null || m.index < best.at)) best = { at: m.index, fig: f(m) }; }
  if (best) return best.fig;
  const m = s.match(/\b(?!(?:19|20)\d\d\b)\d+(?:\.\d+)?\b/); return m ? { value: m[0], label: '' } : null;
}

/**
 * The whole programme. inp = the SHOW's input ({ now, movers, board, chain, events, extra: { hookId: prepared data } , mode }). opts = { hooks: SHOW_HOOKS, have: Set of view ids or null, mode: 'quick'|'full' }.
 * Returns { date, lead, segments: [{ id, name, num, total, scenes }], items, ticker, totalSec }. items is the play list the director walks:
 *   { kind: 'open'|'lead'|'bumper'|'scene'|'close', text, view, cam, title, hold (seconds the card holds with no voice), ...kind fields }.
 * Never throws because of a hook. A segment with no available scene is skipped and the numbering closes up.
 */
export function planBroadcast(inp = {}, { hooks = [], have = null, mode = 'quick', rate = 1, budgetSec = SHORT_BUDGET_SEC } = {}) {
  const quick = mode !== 'full', short = mode === 'short', words = short ? SHORT_WORDS : QUICK_WORDS, date = dateWords(inp.now ?? new Date()), viewOk = v => !have || have.has(v) || CORE_VIEWS.has(v);
  const built = {}, sceneFor = id => {
    if (id in built) return built[id];
    let x = null; const h = hooks.find(k => k.id === id);
    try {
      if (h) { const r = h.build(inp, inp.extra?.[id] ?? null); if (r && r.text) x = { id, title: r.title ?? id, view: r.view ?? 'globe', cam: r.cam ?? null, text: clean(r.text), enter: r.enter, motion: r.motion, figure: r.figure ?? r.key ?? null, panel: r.panel ?? null }; }
      else if (BUILTIN[id]) { const r = BUILTIN[id](inp); if (r) x = { id, ...r }; }
    } catch (e) { x = null; }
    if (x && !viewOk(x.view)) x = null;
    return (built[id] = x);
  };
  const segs = [];
  const pod = partOfDay(date.hour), seg = id => SEGMENTS.find(s => s.id === id), day = SEGMENTS.filter(s => !s.evening && !s.wide && s.id !== 'ahead'), w = id => (short ? null : seg(id));
  day.splice(day.findIndex(s => s.id === 'rates') + 1, 0, ...[w('curve')].filter(Boolean));      // wide: the Treasury curve straight after rates
  day.splice(day.findIndex(s => s.id === 'vol'), 0, ...[w('cross'), w('stress')].filter(Boolean));      // wide: cross-asset before volatility
  // morning: the outlook first; afternoon: the outlook last; evening: the day and its releases first, tomorrow last, no outlook (the day is done)
  const order = (pod === 'morning' ? [w('tone'), seg('ahead'), w('bias'), ...day] : pod === 'evening' ? [w('tone'), seg('day'), seg('releases'), w('biasday'), ...day, seg('next')] : [w('tone'), ...day, seg('ahead')]).filter(Boolean);
  for (const s of order) {
    let scenes = [];
    for (const tier of s.tiers) { scenes = tier.map(sceneFor).filter(Boolean); if (scenes.length) break; }
    if (!scenes.length) continue;
    if (quick) scenes = scenes.slice(0, s.keep ?? 1);
    segs.push({ id: s.id, name: s.name, segue: s.segue, scenes });
  }
  const part = partOfDay(date.hour), when = part === 'morning' ? 'this morning' : part === 'afternoon' ? 'this afternoon' : 'tonight';
  const head = inp.headline?.headline ? inp.headline : null;
  let lead = pickLead({ ...inp, headKeys: head?.keys ?? (head?.key ? [head.key] : []) }, short ? 2 : 3); if (lead.length === 3 && lead[2].score < 1.5) lead = lead.slice(0, 2);       // a weak third item is left out: two strong stories beat three
  const lines = leadLines(lead, when, date.doy % 3), leadKeys = lead.map(x => x.key).filter(Boolean);
  const ctxInp = { ...inp, leadKeys };
  const build = list => {
    const total = list.length + 1, items = [], said = new Set();          // + the sign-off
    for (const l of lines) for (const x of sentences(l)) said.add(norm(x));
    const headText = head ? [head.say, head.means].filter(Boolean).join(' ') : '';
    for (const x of sentences(headText)) said.add(norm(x));
    list.forEach((s, i) => { s.num = i + 1; s.total = total; });
    items.push({ kind: 'open', title: `THE ${part.toUpperCase()} BRIEFING`, view: 'globe', cam: { region: 'world' }, hold: short ? 3 : 4.2, text: `${greeting(date.hour)}. This is Helix, with the ${part} briefing for ${date.spoken}.` });
    // THE HEADLINE (the newsletter's one-line story), straight after the title: the market it names on its hourly chart behind the card (the daily feed runs a day behind, so yesterday's big day would be missing)
    if (head) items.push({ kind: 'headline', head, title: 'The Headline', view: head.key ? 'session' : 'globe', cam: head.key ? { chart: head.key, tf: '1h', back: head.day && pod !== 'evening' ? 1 : 0 } : { region: 'world' }, hold: 0.9, text: headText });
    lead.forEach((x, i) => items.push({ kind: 'lead', idx: i, n: lead.length, lead: x, title: 'The Lead', view: 'globe', cam: x.key ? { focus: x.key } : { region: 'world' }, hold: 0.6, text: lines[i] }));
    for (const s of list) {
      const seg = { id: s.id, name: s.name, num: s.num, total }, def = SEGMENTS.find(x => x.id === s.id);
      items.push({ kind: 'bumper', seg, title: s.name, view: s.scenes[0].view, cam: null, hold: short ? 1.2 : 1.9, text: '' });
      s.scenes.forEach((sc, j) => {
        const src = sc.id === 'candles' ? (BUILTIN.candles(ctxInp)?.text ?? sc.text) : sc.text;          // the board's body knows what the lead already said
        const w = def?.words ?? words;      // a segment may carry a longer line (the evening's releases: several numbers each with its reaction)
        let body = dedupeBody(quick ? trimWords(src, w + 8) : src, said); if (quick) body = trimWords(body, w);
        if (def?.bodyless && j === 0) body = '';
        const figure = sc.figure && sc.figure.value ? sc.figure : keyFigure(body);
        let segue = '';
        const unitFig = figure && (String(figure.label ?? '').trim() || /[×%:]|bp|\bof\b/.test(String(figure.value))) ? speakFig(figure) : null;      // a bare number ("60" sessions) is not a headline
        if (j === 0) { try { segue = def?.say?.({ inp: ctxInp, scene: sc, fig: unitFig, leadKeys, leadKinds: lead.map(x => x.kind) }) || s.segue; } catch (e) { segue = s.segue; } }
        const text = [segue, body].filter(Boolean).join(' ');
        if (text) items.push({ kind: 'scene', seg, scene: sc, title: sc.title, view: sc.view, cam: sc.cam, hold: 0.65, text, figure });
      });
    }
    items.push({ kind: 'close', seg: { id: 'signoff', name: 'Sign-off', num: total, total }, title: 'Sign-off', view: 'globe', cam: { region: 'world' }, hold: 2.5, text: SIGNOFF_TEXT, date });
    return { items, total, totalSec: Math.round(items.reduce((a, x) => a + (x.text ? readSeconds(x.text) : 0) + (x.hold ?? 0), 0)) };
  };
  let segsUsed = segs, P = build(segsUsed.map(x => ({ ...x })));
  const budget = Math.max(60, Math.min(170, +budgetSec || SHORT_BUDGET_SEC)) * Math.max(0.75, Math.min(1.5, +rate || 1));      // the budget is in seconds at normal speed: a faster voice fits more of the programme in the same 2.5 minutes
  if (short) for (const id of (pod === 'evening' ? SHORT_DROP_EVENING : SHORT_DROP)) { if (P.totalSec <= budget) break; if (segsUsed.some(x => x.id === id)) { segsUsed = segsUsed.filter(x => x.id !== id); P = build(segsUsed.map(x => ({ ...x }))); } }
  const { items, total, totalSec } = P;
  return { date, lead, segments: segsUsed.map((s, i) => ({ id: s.id, name: s.name, num: i + 1, total, scenes: s.scenes.map(x => x.id) })), items, ticker: tickerItems(inp.rows ?? inp.movers ?? []), totalSec };
}

/** How long an item holds on screen with the voice off, at a speed: reading time plus its card hold. */
export const itemSeconds = (item, rate = 1) => ((item?.text ? readSeconds(item.text) : 0) + (item?.hold ?? 0)) / (rate > 0 ? rate : 1);

/** "2 min 10 s" / "45 s". */
export const durText = s => { const t = Math.max(0, Math.round(s)); return t >= 60 ? `${Math.floor(t / 60)} min${t % 60 ? ` ${t % 60} s` : ''}` : `${t} s`; };

// ── the ticker crawl ──
/** The crawl: every desk market from the candle rows, biggest against its usual move first: { key, label, arrow, pct, x, tone, capped }. Rows with no number are dropped. */
export function tickerItems(rows, max = 40) {
  return (Array.isArray(rows) ? rows : []).filter(r => r && r.key && fin(r.oc) && fin(r.ratio)).sort((a, b) => Math.abs(b.ratio) - Math.abs(a.ratio)).slice(0, max)
    .map(r => ({ key: r.key, label: marketName(r.key, { short: true }), arrow: r.tone === 'quiet' ? '•' : r.ratio > 0 ? '▲' : '▼', pct: pctFig(r.oc), x: timesFig(r.ratio), tone: r.tone === 'quiet' ? 'quiet' : r.ratio > 0 ? 'up' : 'dn' }));
}
/** The crawl as one plain line (what a screen reader gets): "Gold ▲ +2.1% 2.4× usual  ·  ...". */
export const tickerText = items => items.map(i => `${i.label} ${i.arrow} ${i.pct} ${i.x} usual`).join('  ·  ');

// ── subtitles ──
/**
 * A spoken line cut into broadcast subtitles (one or two short lines on screen at a time): [{ text, from, to }] with from/to as fractions 0..1 of the line, by word count.
 * Sentences are kept whole when short; a long one is cut at a comma or semicolon near the middle, else every maxWords words.
 */
export function subtitleChunks(text, maxWords = 14) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim(); if (!s) return [];
  const out = [];
  const push = t => { const w = t.split(' ').filter(Boolean); if (!w.length) return; if (w.length <= maxWords) { out.push(t.trim()); return; }
    const mid = w.length / 2; let best = -1, bd = 1e9; w.forEach((x, i) => { if (/[,;:]$/.test(x) && i < w.length - 2 && Math.abs(i + 1 - mid) < bd) { bd = Math.abs(i + 1 - mid); best = i + 1; } });
    if (best > 2 && bd < w.length * 0.3) { push(w.slice(0, best).join(' ')); push(w.slice(best).join(' ')); return; }
    const k = Math.ceil(w.length / Math.ceil(w.length / maxWords)); for (let i = 0; i < w.length; i += k) out.push(w.slice(i, i + k).join(' ')); };
  for (const sen of s.split(/(?<=[.!?])\s+/)) push(sen);
  const n = out.map(t => t.split(' ').length), tot = n.reduce((a, b) => a + b, 0); let acc = 0;
  return out.map((t, i) => { const from = acc / tot; acc += n[i]; return { text: t, from, to: acc / tot }; });
}
/** The chunk on screen at fraction p of the line (the last one holds if the voice runs on). */
export const chunkAt = (chunks, p) => (chunks.length ? chunks.find(c => p < c.to) ?? chunks[chunks.length - 1] : null);
