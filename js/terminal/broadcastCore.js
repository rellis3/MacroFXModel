// js/terminal/broadcastCore.js: the pure half of Jarvis's MORNING BROADCAST, the morning review played as a TV-news package over the hologram views: a cold open, THE LEAD (the top three
// things that matter this morning, each on a full-screen card with its number), then numbered segments (Markets, The Chain, Rates, Currencies, Volatility, Positioning, The Day Ahead) and a sign-off.
// This file writes the words (templates over numbers, no model call), picks the lead, plans which scene plays in each segment (the first view that exists; a segment with nothing is skipped),
// numbers the segments, estimates durations, and formats the ticker crawl and the subtitles. The DOM overlay and the director are in jarvisModBroadcast.js.
// Voice: a calm British news presenter. Short sentences, rounded numbers, "one point eight times its usual move". DESCRIPTION ONLY: nothing here is a forecast, a signal or a trade.
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
  return { card: `${p.weekday} ${day} ${p.month}`.toUpperCase(), spoken: `${p.weekday} the ${ORD[day] ?? day} of ${p.month}`, short: `${p.weekday.slice(0, 3)} ${day} ${p.month.slice(0, 3)}`.toUpperCase(), hour: +p.hour % 24, hm: `${p.hour}:${p.minute}` };
}
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
export function pickLead(inp = {}, n = 3) {
  const cand = [], mv = (inp.movers ?? []).filter(m => m && fin(m.ratio) && fin(m.oc) && m.tone !== 'quiet'), ch = inp.chain, ev = (inp.events ?? []).map(normEvent).filter(Boolean);
  for (const m of mv) {
    const a = Math.abs(m.ratio); if (a < 1.2) continue; const up = m.ratio > 0, tw = timesWords(m.ratio);
    cand.push({ kind: 'mover', key: m.key, score: Math.min(a, 6), figure: timesFig(m.ratio), figLabel: 'its usual move', headline: `${marketName(m.key)} ${up ? 'up' : 'down'} ${pctFig(m.oc).replace(/^[+−]/, '')}`, sub: `${up ? '▲ Up' : '▼ Down'} ${pctFig(m.oc).replace(/^[+−]/, '')} so far today, against its own usual move`, tone: up ? 'up' : 'dn',
      say: `${spokenName(m.key)} is ${up ? 'up' : 'down'} ${pctWords(m.oc)}. That is ${tw === 'about' ? 'about its usual move' : `${tw} its usual move`}.` });
  }
  if (ch && fin(ch.broken) && ch.broken > 0) {
    const judged = fin(ch.judged) && ch.judged >= ch.broken ? ch.judged : ch.broken + (fin(ch.holding) ? ch.holding : 0), names = (ch.brokenShort ?? []).map(clean).filter(Boolean);
    cand.push({ kind: 'chain', score: Math.min(4, 1.6 + 0.5 * ch.broken), figure: `${ch.broken} of ${judged}`, figLabel: 'textbook links broken', headline: ch.broken === 1 ? 'A textbook link has broken' : 'Textbook links are breaking', sub: names.slice(0, 2).join('  ·  ') || 'in the macro chain', tone: 'gold',
      say: `in the chain, ${numWord(ch.broken)} of ${numWord(judged)} textbook links ${ch.broken === 1 ? 'is' : 'are'} broken${names.length ? `, ${ch.broken === 1 ? '' : 'led by '}${names[0]}` : ''}. That is where the story is.` });
  }
  const big = ev.filter(e => e.big), first = big[0] ?? ev[0];
  if (first) {
    cand.push({ kind: 'event', score: big.length ? 1.9 : 1.25, figure: first.time || `${ev.length}`, figLabel: first.time ? 'UK time' : 'releases today', headline: evName(first), sub: `${ev.length === 1 ? 'The one' : `One of ${ev.length}`} high-impact release${ev.length === 1 ? '' : 's'} today`, tone: 'tx',
      say: `${first.time ? `at ${first.time} UK time, ` : 'today, '}${evName(first)}. ${ev.length > 1 ? `One of ${numWord(ev.length)} high-impact releases on the calendar.` : 'The main release on the calendar.'}` });
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
/** The lead's spoken lines: "Three things matter this morning. First, gold is up..." then "Second, ..." and "And third, ...". */
export function leadLines(lead, when = 'this morning') {
  const n = lead.length;
  return lead.map((x, i) => {
    const intro = i === 0 ? (n === 1 ? `One thing stands out ${when}. ` : `${cap1(numWord(n))} things matter ${when}. `) : '';
    if (n === 1) return intro + cap1(x.say);
    const ord = i === n - 1 ? (n === 2 ? 'And second' : n === 3 ? 'And third' : 'And finally') : ['First', 'Second', 'Third'][i];
    return `${intro}${ord}, ${x.say}`;
  });
}

// ── built-in scenes (the HUD's own views: candles, skyline, globe) ──
export const BUILTIN = {
  candles(inp) {
    const bd = inp.board, mv = (inp.movers ?? []).filter(m => m && fin(m.ratio) && fin(m.oc)); if (!bd || !bd.n) return null;
    const top = mv[0], two = mv.slice(1, 3).map(m => `${spokenName(m.key)} ${m.ratio > 0 ? 'up' : 'down'} ${pctWords(m.oc)}`);
    const t = [`Across the desk's ${bd.n} markets, ${are(bd.up)} up, ${are(bd.dn)} down and ${are(bd.quiet)} barely moving, each measured against its own usual move.`];
    if (top) t.push(`The biggest is ${spokenName(top.key)}, ${top.ratio > 0 ? 'up' : 'down'} ${pctWords(top.oc)}, ${timesWords(top.ratio) === 'about' ? 'about its usual move' : `${timesWords(top.ratio)} its usual move`}.`);
    if (two.length) t.push(`Then ${list(two)}.`);
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
    return { title: 'The calendar', view: 'globe', cam: { region: 'world' }, text: `On the calendar today: ${list(lines)}. That is the schedule, not a call on the outcome.`, figure: { value: String(ev.length), label: `high-impact release${ev.length === 1 ? '' : 's'}` } };
  },
};
const are = n => `${n} ${n === 1 ? 'is' : 'are'}`;
const CORE_VIEWS = new Set(['globe', 'candles', 'skyline', 'bubbles', 'orbit']);

/** The programme. tiers: the first tier with anything available plays; in the FULL broadcast every available scene of that tier plays, in QUICK only the first. */
export const SEGMENTS = [
  { id: 'markets', name: 'Markets', segue: 'First, the markets.', tiers: [['candles', 'wx']] },
  { id: 'chain', name: 'The Chain', segue: 'Now, the chain.', tiers: [['reactor'], ['chainfly'], ['chain']] },
  { id: 'macro', name: 'The Macro', segue: 'The bigger picture.', tiers: [['moneyglobe', 'surprise', 'cycle']] },
  { id: 'rates', name: 'Rates', segue: 'To rates.', tiers: [['cbpaths', 'yields']] },
  { id: 'ccy', name: 'Currencies', segue: 'Currencies.', tiers: [['fxgrid'], ['ccy']] },
  { id: 'vol', name: 'Volatility', segue: 'Volatility.', tiers: [['ivsurf'], ['vol']] },
  { id: 'pos', name: 'Positioning', segue: 'Positioning, and where the options sit.', tiers: [['gpillar', 'gterrain', 'cot'], ['gamma']] },
  { id: 'ahead', name: 'The Day Ahead', segue: 'And the day ahead.', tiers: [['dayahead', 'shockwave'], ['ahead']] },
];
/** Every hook scene id the programme may use (so the director only prepares those). */
export const wantedSceneIds = () => [...new Set(SEGMENTS.flatMap(s => s.tiers.flat()))].filter(id => !BUILTIN[id]);
/** In the QUICK broadcast a scene's line is cut to whole sentences of about this many words (eight segments, a little over two minutes). */
export const QUICK_WORDS = 34;
/** The SHORT broadcast (mode 'short', for a YouTube Short, which must stay under 3 minutes): shorter lines, a two-item lead, and if the estimate still runs long the
 *  least essential segments go first, in this order. Markets, The Chain and The Day Ahead always stay. The budget is an ESTIMATE: a real run took about 1.2x it (transitions, the voice's own pace), so 120 s lands near 2.5 minutes. */
export const SHORT_WORDS = 24, SHORT_BUDGET_SEC = 120, SHORT_DROP = ['vol', 'pos', 'ccy', 'macro', 'rates'];
export const SIGNOFF_TEXT = 'That is the briefing. Description, not advice. Until tomorrow.';

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
export function planBroadcast(inp = {}, { hooks = [], have = null, mode = 'quick' } = {}) {
  const quick = mode !== 'full', short = mode === 'short', words = short ? SHORT_WORDS : QUICK_WORDS, date = dateWords(inp.now ?? new Date()), viewOk = v => !have || have.has(v) || CORE_VIEWS.has(v);
  const built = {}, sceneFor = id => {
    if (id in built) return built[id];
    let x = null; const h = hooks.find(k => k.id === id);
    try {
      if (h) { const r = h.build(inp, inp.extra?.[id] ?? null); if (r && r.text) x = { id, title: r.title ?? id, view: r.view ?? 'globe', cam: r.cam ?? null, text: clean(r.text), enter: r.enter, motion: r.motion, figure: r.figure ?? r.key ?? null }; }
      else if (BUILTIN[id]) { const r = BUILTIN[id](inp); if (r) x = { id, ...r }; }
    } catch (e) { x = null; }
    if (x && !viewOk(x.view)) x = null;
    return (built[id] = x);
  };
  const segs = [];
  for (const s of SEGMENTS) {
    let scenes = [];
    for (const tier of s.tiers) { scenes = tier.map(sceneFor).filter(Boolean); if (scenes.length) break; }
    if (!scenes.length) continue;
    if (quick) scenes = scenes.slice(0, 1);
    segs.push({ id: s.id, name: s.name, segue: s.segue, scenes });
  }
  const am = date.hour < 12, lead = pickLead(inp, short ? 2 : 3), lines = leadLines(lead, am ? 'this morning' : 'today'), g = greeting(date.hour);
  const build = list => {
    const total = list.length + 1, items = [];                     // + the sign-off
    list.forEach((s, i) => { s.num = i + 1; s.total = total; });
    items.push({ kind: 'open', title: 'THE MORNING BRIEFING', view: 'globe', cam: { region: 'world' }, hold: short ? 3 : 4.2, text: `${g}. This is Jarvis, with the ${am ? 'morning ' : ''}briefing for ${date.spoken}.` });
    lead.forEach((x, i) => items.push({ kind: 'lead', idx: i, n: lead.length, lead: x, title: 'The Lead', view: 'globe', cam: x.key ? { focus: x.key } : { region: 'world' }, hold: 0.6, text: lines[i] }));
    for (const s of list) {
      const seg = { id: s.id, name: s.name, num: s.num, total };
      items.push({ kind: 'bumper', seg, title: s.name, view: s.scenes[0].view, cam: null, hold: short ? 1.2 : 1.9, text: '' });
      s.scenes.forEach((sc, j) => {
        const body = quick ? trimWords(sc.text, words) : sc.text, text = j === 0 ? `${s.segue} ${body}` : body;
        items.push({ kind: 'scene', seg, scene: sc, title: sc.title, view: sc.view, cam: sc.cam, hold: 0.65, text, figure: sc.figure && sc.figure.value ? sc.figure : keyFigure(body) });
      });
    }
    items.push({ kind: 'close', seg: { id: 'signoff', name: 'Sign-off', num: total, total }, title: 'Sign-off', view: 'globe', cam: { region: 'world' }, hold: 2.5, text: SIGNOFF_TEXT, date });
    return { items, total, totalSec: Math.round(items.reduce((a, x) => a + (x.text ? readSeconds(x.text) : 0) + (x.hold ?? 0), 0)) };
  };
  let segsUsed = segs, P = build(segsUsed);
  if (short) for (const id of SHORT_DROP) { if (P.totalSec <= SHORT_BUDGET_SEC) break; if (segsUsed.some(x => x.id === id)) { segsUsed = segsUsed.filter(x => x.id !== id); P = build(segsUsed); } }
  const { items, total, totalSec } = P;
  return { date, lead, segments: segsUsed.map(s => ({ id: s.id, name: s.name, num: s.num, total, scenes: s.scenes.map(x => x.id) })), items, ticker: tickerItems(inp.rows ?? inp.movers ?? []), totalSec };
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
