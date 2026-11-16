/**
 * The Evening edition's "day in order" (owner, 2026-11-16: "very matter of fact instead of a look back over the day").
 *
 * Rule-built from stored data, no model call: the day's calendar prints (with the market's first 30 minutes after each),
 * the news wire's tier 1-2 headlines (with the news analyst's read and whether the market moved with it), the scheduled
 * speakers, and the busiest 30 minutes of every big mover, grouped overnight/Asia, London and New York in London time.
 * A scheduled event with no headline says so in one line ("no headline captured"); a burst with no headline within 30
 * minutes says "no news found in the wire". Nothing is filled in and no cause is invented.
 *
 * Pure. Tested in js/eveningTimeline.test.mjs. Inputs are the shapes js/eveningFacts.js already works with:
 *   wire        [{ ms, title, sources, tier, read: { tier, why, impact }, react: { m30: { label } } }]
 *   events      [{ ms, country, event, impact, actual, estimate, prev }]
 *   scorecards  [{ ms, country, prints: [{ event, actual }], reactions: [{ name, dir, move, unit, ratio }] }]
 *   bursts      js/eveningFacts.js moveTiming() rows: { inst, u, from, to, fromMs, toMs, share }
 */
import { londonMs } from './deskScore.js';
import { DESK_UNIVERSE } from './deskPack.js';

const LONDON = 'Europe/London';
export const londonHM = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: LONDON, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const londonMin = ms => { const [h, m] = londonHM(ms).split(':').map(Number); return h * 60 + m; };

/** Overnight/Asia before 08:00 London, London to 13:30 (the New York cash open for data), New York after. */
export const SESSIONS = [
  { id: 'asia', label: 'Overnight and Asia', from: 0, to: 8 * 60 },
  { id: 'london', label: 'London', from: 8 * 60, to: 13 * 60 + 30 },
  { id: 'ny', label: 'New York', from: 13 * 60 + 30, to: 24 * 60 },
];
export const sessionOf = ms => { const m = londonMin(ms); return (SESSIONS.find(s => m >= s.from && m < s.to) ?? SESSIONS[2]).id; };

const nextDate = d => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
export const dayBounds = date => ({ startMs: londonMs(date, 0), endMs: londonMs(nextDate(date), 0) });

const GROUP_OF = Object.fromEntries(Object.entries(DESK_UNIVERSE).flatMap(([g, ns]) => ns.map(n => [n, g])));
const GROUP_PHRASE = { indices: 'Stock indices', metals: 'Metals', energy: 'Energy', ags: 'Agriculture', crypto: 'Crypto', fx_majors: 'FX majors', fx_crosses: 'FX crosses' };
const sgn = (x, dp = 2) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(dp)}`;
const cleanTitle = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const instLabel = n => (/^[A-Z]{6}$/.test(n) ? `${n.slice(0, 3)}/${n.slice(3)}` : n);

const BANK_WORDS = { US: ['fed', 'federal reserve', 'fomc', 'powell', 'chair'], GB: ['bank of england', 'boe', 'bailey', 'mpc'], EU: ['ecb', 'lagarde'], JP: ['boj', 'bank of japan', 'ueda'], AU: ['rba', 'reserve bank of australia'], CA: ['boc', 'bank of canada', 'macklem'], NZ: ['rbnz'], CH: ['snb'], NO: ['norges'], SE: ['riksbank'] };
const COUNTRY_WORDS = { US: ['u.s.', 'us ', 'american', 'united states', 'fed '], CA: ['canada', 'canadian'], GB: ['uk ', 'u.k.', 'britain', 'british', 'sterling', 'gilt'], EU: ['euro', 'eurozone', 'german', 'germany', 'france'], JP: ['japan', 'japanese', 'yen'], AU: ['australia', 'australian', 'aussie'], NZ: ['new zealand', 'nz ', 'kiwi'], CH: ['swiss', 'switzerland'] };
const STOP = new Set(['speaks', 'speech', 'speaking', 'chair', 'chairman', 'governor', 'gov', 'president', 'press', 'conference', 'testifies', 'testimony', 'member', 'the', 'and', 'of']);
const sigTokens = ev => String(ev ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
const printTokens = ev => String(ev ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w) && !['core', 'median', 'trimmed', 'common', 'flash', 'final', 'prel'].includes(w));
/** Does this headline report this print (the country's name and one of the release's own words, e.g. "Canada October CPI 3.1% vs 3.2% expected")? */
export function coversPrint(headline, e) {
  const t = ` ${String(headline?.title ?? '').toLowerCase()} `; if (t.trim() === '') return false;
  const cw = COUNTRY_WORDS[String(e.country ?? '').toUpperCase()] ?? [];
  return cw.some(w => t.includes(w)) && printTokens(e.event).some(w => t.includes(w));
}
const isSpeaker = ev => /speak|speech|testif|press conference|conference|remarks/i.test(ev);

/** Does this headline plausibly report this scheduled speaker/event? (a name token from the calendar line, or the bank's own words) */
export function coversEvent(headline, e) {
  const t = String(headline?.title ?? '').toLowerCase(); if (!t) return false;
  const words = [...sigTokens(e.event), ...(BANK_WORDS[String(e.country ?? '').toUpperCase()] ?? [])];
  return words.some(w => t.includes(w));
}

const num = v => { if (v == null || v === '') return null; const x = parseFloat(String(v).replace(/[^0-9.+-]/g, '')); return Number.isFinite(x) ? x : null; };
/** "above the forecast", "below the forecast", "in line", or null when either is missing or not a number. */
export function surpriseWord(actual, estimate) {
  const a = num(actual), f = num(estimate); if (a == null || f == null) return null;
  const d = a - f; return Math.abs(d) < 1e-9 ? 'in line with the forecast' : d > 0 ? 'above the forecast' : 'below the forecast';
}

const reactionText = sc => {
  const rs = (sc?.reactions ?? []).slice(0, 3); if (!rs.length) return '';
  return `next 30 minutes: ${rs.map(r => `${r.name} ${r.dir} ${Math.abs(r.move)} ${r.unit ?? ''}${r.ratio != null ? ` (${r.ratio}x an ordinary half-hour)` : ''}`.replace(/\s+/g, ' ').trim()).join(', ')}`;
};
const impactArrows = read => Object.entries(read?.impact ?? {}).filter(([, v]) => +v).map(([k, v]) => `${k}${+v > 0 ? '↑' : '↓'}`).join(' ');
const reactWord = h => { const l = h.react?.m30?.label; return l === 'with' ? 'the market moved the way the read implied' : l === 'against' ? 'the market moved against the read' : l ? 'no clear move' : ''; };

/** Bursts (moveTiming rows, with fromMs/toMs) clustered when they overlap or sit within `gapMin` minutes of each other. */
export function clusterBursts(bursts, { gapMin = 15 } = {}) {
  const rows = (bursts ?? []).filter(b => Number.isFinite(b.fromMs) && Number.isFinite(b.toMs)).sort((a, b) => a.fromMs - b.fromMs), out = [];
  for (const b of rows) {
    const last = out.at(-1);
    if (last && b.fromMs <= last.toMs + gapMin * 60_000) { last.toMs = Math.max(last.toMs, b.toMs); last.rows.push(b); }
    else out.push({ fromMs: b.fromMs, toMs: b.toMs, rows: [b] });
  }
  return out.map(c => {
    const rows = [...c.rows].sort((a, b) => Math.abs(b.u) - Math.abs(a.u)), g = {};
    for (const r of rows) { const k = GROUP_OF[r.inst] ?? 'other'; g[k] = (g[k] ?? 0) + 1; }
    const top = Object.entries(g).sort((a, b) => b[1] - a[1])[0]?.[0], dir = rows.filter(r => r.u > 0).length >= rows.length / 2 ? 'rose' : 'fell';
    const allSame = rows.every(r => Math.sign(r.u) === Math.sign(rows[0].u));
    return { fromMs: c.fromMs, toMs: c.toMs, markets: rows.slice(0, 5).map(r => ({ inst: r.inst, u: r.u, share: r.share })), n: rows.length, group: top,
      label: rows.length >= 2 && Object.keys(g).length === 1 && allSame ? `${GROUP_PHRASE[top] ?? 'Markets'} ${dir} together` : rows.length >= 3 && allSame ? `${GROUP_PHRASE[top] ?? 'Markets'} led a broad move ${dir === 'rose' ? 'up' : 'down'}` : rows.length >= 2 ? 'Several markets moved at once' : `${instLabel(rows[0].inst)} had its busiest half hour` };
  });
}

/**
 * The day in order. Returns { date, sessions: [{ id, label, beats }], bursts (clusters with their nearest headlines),
 * gaps: [string], counts }. Beat kinds: release | headline | speaker | gap | burst.
 */
export function buildTimeline({ date, wire = [], events = [], scorecards = [], bursts = [], now = Date.now(), nearMin = 30, maxHeadlines = 14 } = {}) {
  const { startMs, endMs } = dayBounds(date), exitMs = londonMs(date, 21), gaps = [], beats = [];
  const inDay = ms => ms >= startMs && ms < endMs;
  const heads = (wire ?? []).filter(h => h?.title && h.ms && inDay(h.ms) && (+(h.read?.tier ?? h.tier) || 3) <= 2).sort((a, b) => a.ms - b.ms);
  const covered = new Set();
  const evs = (events ?? []).filter(e => e?.ms && inDay(e.ms) && e.ms <= Math.min(now, endMs) && ['high', 'medium'].includes(String(e.impact ?? '').toLowerCase())).sort((a, b) => a.ms - b.ms);
  const relGroups = new Map();
  for (const e of evs) {
    if (isSpeaker(e.event)) {
      const h = heads.find(x => x.ms >= e.ms - 15 * 60_000 && x.ms <= e.ms + 90 * 60_000 && coversEvent(x, e));
      if (h) { covered.add(h); beats.push({ ms: e.ms, kind: 'speaker', country: e.country, text: `${e.event} (${e.country}) was due; the wire carried: ${cleanTitle(h.title)}`, tier: h.tier ?? h.read?.tier ?? null }); }
      else { const line = `${e.event} (${e.country}) was scheduled for ${londonHM(e.ms)} London: no headline captured in the wire.`; gaps.push(line); beats.push({ ms: e.ms, kind: 'gap', country: e.country, text: line }); }
      continue;
    }
    const k = `${e.ms}|${String(e.country ?? '').toUpperCase()}`; if (!relGroups.has(k)) relGroups.set(k, []); relGroups.get(k).push(e);
  }
  for (const group of relGroups.values()) {
    const e0 = group[0], sc = (scorecards ?? []).find(s => Math.abs((s.ms ?? 0) - e0.ms) < 60_000 && String(s.country ?? '').toUpperCase() === String(e0.country ?? '').toUpperCase());
    const v = x => (x == null || x === '' ? null : String(x));
    const item = e => {
      const pr = (sc?.prints ?? []).find(x => String(x.event ?? '').trim().toLowerCase() === String(e.event ?? '').trim().toLowerCase());
      const a = v(e.actual) ?? v(pr?.actual), f = v(e.estimate), p = v(e.prev), sw = surpriseWord(a, f);
      return { a, text: a != null ? `${a}${f != null ? ` against ${f} expected${sw ? `, ${sw}` : ''}` : ''}${p != null ? ` (previous ${p})` : ''}` : `actual not on the feed${f != null ? ` (${f} expected)` : ''}` };
    };
    const items = group.map(e => ({ e, ...item(e) })), missing = items.filter(x => x.a == null), rx = reactionText(sc);
    // the calendar had no actual: the wire often carries it ("Canada October CPI 3.1% vs 3.2% expected"), within half an hour of the print
    const carried = missing.length ? heads.find(x => x.ms >= e0.ms - 5 * 60_000 && x.ms <= e0.ms + 30 * 60_000 && group.some(e => coversPrint(x, e))) : null;
    if (carried) covered.add(carried);
    const body = group.length === 1 ? `${e0.event} (${e0.country}): ${items[0].text}` : `${e0.country} data: ${items.map(x => `${x.e.event} ${x.text}`).join('; ')}`;
    beats.push({ ms: e0.ms, kind: 'release', country: e0.country, text: `${body}${carried ? `. The wire carried: ${cleanTitle(carried.title)}` : ''}${rx ? `. ${rx.charAt(0).toUpperCase()}${rx.slice(1)}` : ''}`, hasReaction: !!rx, actual: items.find(x => x.a != null)?.a ?? null });
  }
  // headlines: tier 1 first when there are more than we can show, then time order; any headline already used to cover a speaker is not repeated
  const shown = [...heads.filter(h => !covered.has(h))].sort((a, b) => (+(a.read?.tier ?? a.tier) || 3) - (+(b.read?.tier ?? b.tier) || 3) || b.ms - a.ms).slice(0, maxHeadlines).sort((a, b) => a.ms - b.ms);
  for (const h of shown) {
    const arrows = impactArrows(h.read), why = h.read?.why, rw = reactWord(h);
    beats.push({ ms: h.ms, kind: 'headline', tier: +(h.read?.tier ?? h.tier) || null, source: h.sources?.[0] ?? h.source ?? null, text: cleanTitle(h.title),
      read: arrows ? `the news analyst's read: ${arrows}${why ? ` (${cleanTitle(why)})` : ''}` : null, reaction: rw || null });
  }
  // bursts: the busiest half hour of every big mover, clustered, each with the nearest headlines (or "no news found")
  const clusters = clusterBursts(bursts), nearMs = nearMin * 60_000, outClusters = [];
  for (const c of clusters) {
    const mid = (c.fromMs + c.toMs) / 2;
    const near = heads.filter(h => h.ms >= c.fromMs - nearMs && h.ms <= c.toMs + nearMs).sort((a, b) => Math.abs(a.ms - mid) - Math.abs(b.ms - mid)).slice(0, 3).sort((a, b) => a.ms - b.ms)
      .map(h => ({ ms: h.ms, hm: londonHM(h.ms), title: cleanTitle(h.title), tier: +(h.read?.tier ?? h.tier) || null }));
    const rel = evs.filter(e => !isSpeaker(e.event) && e.ms >= c.fromMs - nearMs && e.ms <= c.toMs).map(e => `${e.country} ${e.event} at ${londonHM(e.ms)}`).slice(0, 2);
    const cl = { ...c, hm: `${londonHM(c.fromMs)}-${londonHM(c.toMs)}`, headlines: near, releases: rel, noNews: !near.length };
    outClusters.push(cl);
    const mk = c.markets.slice(0, 4).map(m => `${instLabel(m.inst)} ${sgn(m.u)} u`).join(', ');
    beats.push({ ms: c.fromMs, kind: 'burst', text: `${c.label} (${cl.hm}): ${mk}${c.n > 4 ? ` and ${c.n - 4} more` : ''}.`, cluster: cl });
  }
  beats.sort((a, b) => a.ms - b.ms || ({ release: 0, speaker: 1, gap: 1, headline: 2, burst: 3 })[a.kind] - ({ release: 0, speaker: 1, gap: 1, headline: 2, burst: 3 })[b.kind]);
  for (const b of beats) b.hm = londonHM(b.ms);
  const wireEmpty = !heads.length;
  if (wireEmpty) gaps.unshift('The news wire held no tier 1-2 headlines for this day when the issue was built, so no cause is offered for any move below.');
  const sessions = SESSIONS.map(s => ({ id: s.id, label: s.label, beats: beats.filter(b => sessionOf(b.ms) === s.id) })).filter(s => s.beats.length);
  return { date, sessions, bursts: outClusters, gaps, wireEmpty, counts: { headlines: heads.length, releases: beats.filter(b => b.kind === 'release').length, bursts: outClusters.length, unexplained: outClusters.filter(c => c.noNews).length }, exitMs };
}

/** The timeline as plain text for the evening writer's prompt (stage 3: the model polishes it and may not add causes). */
export function timelineText(tl) {
  if (!tl) return '(no timeline)';
  const lines = [];
  for (const s of tl.sessions) { lines.push(`${s.label.toUpperCase()} (London time)`); for (const b of s.beats) lines.push(`  ${b.hm} [${b.kind}] ${b.text}${b.read ? ` · ${b.read}` : ''}${b.reaction ? ` · ${b.reaction}` : ''}${b.cluster ? (b.cluster.noNews ? ' · no news found in the wire' : ` · nearest headlines: ${b.cluster.headlines.map(h => `${h.hm} ${h.title}`).join(' | ')}`) : ''}`); }
  for (const g of loneGaps(tl)) lines.push(`GAP: ${g}`);
  return lines.join('\n') || '(nothing on the timeline)';
}

/** Gap lines that are not already a beat in the list (the empty-wire note): a speaker's gap is printed once, where it fell in the day. */
const loneGaps = tl => (tl.gaps ?? []).filter(g => !tl.sessions.some(s => s.beats.some(b => b.text === g)));
const ESC = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KIND = { release: ['Print', '#0b5cab'], headline: ['Wire', '#14202e'], speaker: ['Speaker', '#6b3fa0'], gap: ['Gap', '#8a6d00'], burst: ['Burst', '#b4232f'] };

/** The "day in order" block: one list per session, then each burst's nearest headlines. */
export function timelineHtml(tl, H = { esc: ESC }) {
  const esc = H.esc ?? ESC;
  if (!tl || (!tl.sessions.length && !tl.gaps.length)) return '';
  const beat = b => { const [lab, col] = KIND[b.kind] ?? ['', '#14202e'];
    return `<div class="evt-r"><span class="evt-t">${esc(b.hm)}</span><span class="evt-k" style="color:${col};border-color:${col}">${esc(lab)}${b.tier && b.kind === 'headline' ? ` T${b.tier}` : ''}</span><div class="evt-b"><span class="evt-x">${esc(b.text)}</span>${b.read ? `<span class="evt-n">${esc(b.read)}</span>` : ''}${b.reaction ? `<span class="evt-n">30 minutes later: ${esc(b.reaction)}</span>` : ''}${b.cluster ? `<span class="evt-n">${b.cluster.noNews ? 'No news found in the wire within 30 minutes of this.' : `Nearest headlines: ${esc(b.cluster.headlines.map(h => `${h.hm} ${h.title}`).join(' · '))}`}${b.cluster.releases.length ? ` Coincides with ${esc(b.cluster.releases.join(', '))}.` : ''}</span>` : ''}</div></div>`; };
  const ses = tl.sessions.map(s => `<h3 class="evt-s">${esc(s.label)}</h3>${s.beats.map(beat).join('')}`).join('');
  const lone = loneGaps(tl), gaps = lone.length ? `<p class="evt-g">${lone.map(esc).join(' ')}</p>` : '';
  return `<div class="evt">${ses}${gaps}</div>`;
}

export const TIMELINE_CSS = `
.evt{font-family:var(--sans,'Segoe UI',system-ui,sans-serif);margin:4px 0 10px}
.evt-s{font:700 10px var(--sans,system-ui);letter-spacing:.14em;text-transform:uppercase;color:#14202e;margin:12px 0 3px;border-bottom:1px solid #d8e0ec;padding-bottom:3px}
.evt-r{display:grid;grid-template-columns:44px 74px 1fr;gap:8px;padding:4px 0;border-bottom:1px solid #eef2f8;break-inside:avoid}
.evt-t{font:700 11px var(--mono,ui-monospace,monospace);color:#14202e}
.evt-k{font:700 9px var(--mono,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase;border:1px solid;border-radius:3px;padding:1px 4px;height:fit-content;text-align:center}
.evt-b{display:flex;flex-direction:column;gap:1px;min-width:0}
.evt-x{font-size:12.5px;line-height:1.38;color:#14202e;overflow-wrap:anywhere}
.evt-n{font-size:11px;line-height:1.35;color:#5b6b82;overflow-wrap:anywhere}
.evt-g{font-size:11.5px;line-height:1.4;color:#6a5800;background:#fff8e1;border-left:3px solid #d98a00;padding:5px 8px;margin:8px 0 0}
`;
