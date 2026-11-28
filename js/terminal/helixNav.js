// js/terminal/helixNav.js: the pure half of Helix's navigation. jarvisView.js draws; everything that can be decided without a browser lives here and is tested in helixNav.test.mjs.
//   resolveTarget(word)        a typed / spoken / linked word -> { kind: 'view' | 'tool', id } (ids, the labels people see, and a few plain aliases)
//   parseHelixArgs(text)       the command line's "helix yields", "helix board 1d", "helix map europe" -> { target, win, region }
//   parseHelixHash(hash)       "#helix/yields/5d" -> the same; helixHash(state) builds one
//   voiceNav(query)            "show yields", "go to the gamma pillar" -> 'yields' / 'the gamma pillar' (the word to resolve), or null (then it is a question for ASK)
//   STYLE_GROUPS + collapseStyles(items, prefs, view) + nextStyle()   the duplicate drawings of one analysis shown as ONE nav item with a STYLE toggle (nothing is removed)
//   mergeInbox({ tab, server, desk })   one alert list from the tab watcher, the server watcher (phone) and the desk alert rules, deduped
//   sinceSummary(seen, snap, alerts, now)   "since you last looked": links that broke or healed, new big moves, alerts sent since then
//   todayLines(inp)            the TODAY home screen: one line per section, each with where it opens
//   frameBudget()              the adaptive frame governor: drop to DPR 1 when frames run slow, 30 fps when idle or under reduced motion
//   KEYS                       the keyboard map the ? overlay lists
// DESCRIPTION ONLY: nothing here forecasts or calls a trade.
import { SECTIONS, labelOf, sectionOf } from './jarvisNav.js';
import { watchDiff, navWords } from './jarvisCore.js';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = s => norm(s).replace(/\s+/g, '');

/** Plain words people say or type for a picture or panel (beyond its id and its label). */
export const ALIASES = {
  today: ['tool', 'today'], home: ['tool', 'today'], front: ['tool', 'today'], start: ['tool', 'today'],
  board: ['view', 'candles'], marketboard: ['view', 'candles'], markets: ['view', 'candles'], map: ['view', 'globe'], world: ['view', 'globe'], globe: ['view', 'globe'],
  chart: ['view', 'session'], candles: ['view', 'session'], weather: ['view', 'wx'], links: ['view', 'net'], network: ['view', 'net'], correlations: ['view', 'net'],
  curve: ['view', 'yields'], yieldcurve: ['view', 'yields'], yields: ['view', 'yields'], rates: ['view', 'cbpaths'], ratepaths: ['view', 'cbpaths'],
  chain: ['view', 'reactor'], reactor: ['view', 'reactor'], city: ['view', 'skyline'], orbit: ['view', 'orbit'], fly: ['view', 'chainfly'],
  gamma: ['view', 'gpillar'], pillar: ['view', 'gpillar'], terrain: ['view', 'gterrain'], flip: ['view', 'flipmap'], flips: ['view', 'flipmap'], cot: ['view', 'cot'], positioning: ['view', 'cot'],
  vol: ['view', 'vol'], volatility: ['view', 'vol'], surface: ['view', 'ivsurf'], volsurface: ['view', 'ivsurf'], currencies: ['view', 'ccy'], fx: ['view', 'fxgrid'], matrix: ['view', 'fxgrid'],
  range: ['view', 'rangeused'], rangeused: ['view', 'rangeused'], implied: ['view', 'rangeused'], day: ['view', 'dayso'], daysofar: ['view', 'dayso'], ahead: ['view', 'ahead'], dayahead: ['view', 'ahead'],
  surprises: ['view', 'surprise'], shockwave: ['view', 'shockwave'], cycle: ['view', 'cycle'], money: ['view', 'moneyglobe'], calls: ['view', 'book'], book: ['view', 'book'],
  unusual: ['tool', 'radar'], radar: ['tool', 'radar'], ranked: ['tool', 'markets'], list: ['tool', 'markets'], read: ['tool', 'brief'], brief: ['tool', 'brief'], briefing: ['tool', 'brief'],
  show: ['tool', 'broadcast'], broadcast: ['tool', 'broadcast'], morning: ['tool', 'broadcast'], newsletter: ['tool', 'news'], replay: ['tool', 'film'], precedent: ['tool', 'precedent'],
  ask: ['tool', 'ask'], explain: ['tool', 'explain'], papers: ['tool', 'papers'], alerts: ['tool', 'alerts'], inbox: ['tool', 'alerts'], server: ['tool', 'system'], system: ['tool', 'system'],
};
/** Every item in the sections, plus TODAY. */
export const allItems = () => SECTIONS.flatMap(s => s.items.map(([kind, id, label]) => ({ kind, id, label, sec: s.id })));

/** A word -> { kind, id } or null. Exact id, then the label (spaces ignored), then an alias, then a label or id that starts with the word, then a label containing every word. */
export function resolveTarget(word) {
  const w = norm(word).replace(/^(the|a|an|my)\s+/, '').replace(/\s+(view|picture|panel|page|screen)$/, ''), q = squash(w);
  if (!q) return null;
  const items = allItems();
  const hit = items.find(i => i.id === q) ?? items.find(i => squash(i.label) === q);
  if (hit) return { kind: hit.kind, id: hit.id };
  if (ALIASES[q]) return { kind: ALIASES[q][0], id: ALIASES[q][1] };
  const pre = items.find(i => squash(i.label).startsWith(q) || i.id.startsWith(q)); if (pre && q.length >= 3) return { kind: pre.kind, id: pre.id };
  const words = w.split(' ').filter(x => x.length > 1);
  const all = words.length ? items.find(i => words.every(x => norm(i.label).split(' ').some(y => y.startsWith(x)))) : null;
  if (all) return { kind: all.kind, id: all.id };
  if (words.length <= 3) for (const x of words) if (ALIASES[x]) return { kind: ALIASES[x][0], id: ALIASES[x][1] };
  return null;
}

const WIN = /^(1|5|20)d$/i, REGION = { world: 'world', americas: 'americas', america: 'americas', us: 'americas', europe: 'europe', eu: 'europe', asia: 'asia', apac: 'asia', mideast: 'mideast-africa', africa: 'mideast-africa', 'mideast-africa': 'mideast-africa' };
/** Words after the HELIX command (or the parts of a #helix/ link) -> { target, win, region, popout }; empty -> { target: null }. Unknown words are reported, never guessed into a different view. */
export function parseHelixArgs(text) {
  const parts = String(text ?? '').trim().split(/[\s/]+/).filter(Boolean), out = { target: null, win: null, region: null, popout: false, unknown: null }, rest = [];
  for (const p of parts) {
    const l = p.toLowerCase();
    if (WIN.test(l)) out.win = +l.slice(0, -1);
    else if (REGION[l]) out.region = REGION[l];
    else if (l === 'popout' || l === 'pop' || l === 'window') out.popout = true;
    else rest.push(p);
  }
  if (rest.length) { out.target = resolveTarget(rest.join(' ')); if (!out.target) out.unknown = rest.join(' '); }
  return out;
}
/** "#helix", "#helix/yields", "#helix/board/1d", "#helix/globe/europe" -> parseHelixArgs's shape; anything else -> null. */
export function parseHelixHash(hash) {
  const m = String(hash ?? '').match(/^#helix(?:\/(.*))?$/i); if (!m) return null;
  let s = m[1] ?? ''; try { s = decodeURIComponent(s); } catch (e) { /* keep it raw */ }
  return parseHelixArgs(s.replace(/[?&].*$/, ''));
}
/** The link for a HUD state: #helix/<view or panel id>[/<window>d][/<region>]. The window is left out at its default (5D) and the region at world. */
export function helixHash({ kind = 'view', id, win = 5, region = 'world' } = {}) {
  if (!id) return '#helix';
  return `#helix/${encodeURIComponent(id)}${win && win !== 5 ? `/${win}d` : ''}${kind === 'view' && id === 'globe' && region && region !== 'world' ? `/${region}` : ''}`;
}

/** "show yields" / "go to the board" / "open alerts" / "take me to the gamma pillar" -> the words naming where to go; null when it is a question (that goes to ASK, a paid call). jarvisCore.navWords. */
export const voiceNav = navWords;

// ── STYLE: the same analysis drawn more than one way stays reachable, behind one nav item and a STYLE toggle ──
export const STYLE_GROUPS = {
  chain: { label: 'THE CHAIN', members: ['reactor', 'chainfly', 'orbit', 'skyline', 'bubbles'] },
  gamma: { label: 'GAMMA', members: ['gpillar', 'gterrain', 'gamma'] },
  vol: { label: 'VOLATILITY', members: ['vol', 'ivsurf'] },
  ccy: { label: 'CURRENCIES', members: ['ccy', 'fxgrid'] },
};
export const groupOf = id => Object.keys(STYLE_GROUPS).find(g => STYLE_GROUPS[g].members.includes(id)) ?? null;
/** One section's items with each style group folded into one item: the picture showing now if it is in the group, else the remembered style, else the first. prefs = { chain: 'orbit', ... }. */
export function collapseStyles(items, prefs = {}, view = null) {
  const out = [], done = new Set();
  for (const it of items) {
    const g = it.kind === 'view' ? groupOf(it.id) : null;
    if (!g) { out.push(it); continue; }
    if (done.has(g)) continue; done.add(g);
    const avail = items.filter(x => x.kind === 'view' && groupOf(x.id) === g).map(x => x.id);
    const pick = avail.includes(view) ? view : avail.includes(prefs[g]) ? prefs[g] : avail[0];
    const src = items.find(x => x.kind === 'view' && x.id === pick) ?? it;
    out.push({ ...src, group: g, styles: avail.length });
  }
  return out;
}
/** The next drawing of a view's group among those that exist (has(id) -> bool), or null when the view has no other style. */
export function nextStyle(view, has = () => true, dir = 1) {
  const g = groupOf(view); if (!g) return null;
  const m = STYLE_GROUPS[g].members.filter(id => id === view || has(id)); if (m.length < 2) return null;
  return m[(m.indexOf(view) + dir + m.length) % m.length];
}

// ── one alert inbox ──
const bare = t => String(t ?? '').replace(/^(?:jarvis|helix)\s*:\s*/i, '').replace(/\s*\(description, not a trade\)\s*$/i, '').trim();
/** tab = [{ at (ms), level, text }] (this tab's watcher), server = /api/jarvis/watch lastAlerts [{ at (iso), level, text, sent }], desk = /api/desk-alert-rules rules [{ name, kind, firedAt }], qlike = /api/qlike-alerts log [{ at (iso), text, send }].
 *  -> [{ at, src: 'tab' | 'phone' | 'desk' | 'qlike', level, text }], newest first; the same sentence from the tab and the phone within 15 minutes is one row (marked 'phone' since it reached the phone). */
export function mergeInbox({ tab = [], server = [], desk = [], qlike = [] } = {}, { cap = 60, windowMs = 15 * 60_000 } = {}) {
  const rows = [];
  for (const a of server ?? []) { const at = Date.parse(a?.at); if (Number.isFinite(at) && a.text) rows.push({ at, src: a.sent === false ? 'server' : 'phone', level: a.level ?? 'info', text: bare(a.text) }); }
  for (const a of tab ?? []) { const at = +a?.at; if (!Number.isFinite(at) || !a.text) continue; const t = bare(a.text); if (rows.some(r => r.src !== 'tab' && r.src !== 'desk' && r.text === t && Math.abs(r.at - at) < windowMs)) continue; rows.push({ at, src: 'tab', level: a.level ?? 'info', text: t }); }
  for (const r of desk ?? []) { const at = Date.parse(r?.firedAt); if (Number.isFinite(at)) rows.push({ at, src: 'desk', level: 'info', text: `Desk alert: ${String(r.name || r.kind || 'rule')}` }); }
  for (const e of qlike ?? []) { const at = Date.parse(e?.at); if (Number.isFinite(at) && e.text) rows.push({ at, src: 'qlike', level: 'info', text: `${bare(e.text)}${e.send === false ? ' (logged, not sent)' : ''}` }); }   // QLIKE level alerts (js/qlikeLevelAlerts.js)
  return rows.sort((a, b) => b.at - a.at).slice(0, cap);
}

// ── since you last looked ──
/** seen = { at, snap } saved when Helix was last open; snap = watchSnapshot now; alerts = the inbox rows. -> { since, lines: [{ text, go }], empty } (go = where the line opens). */
export function sinceSummary(seen, snap, alerts = [], now = Date.now()) {
  if (!seen?.at || !Number.isFinite(+seen.at)) return { since: null, lines: [], empty: true };
  const lines = [];
  for (const e of watchDiff(seen.snap, snap)) lines.push({ text: e.text, go: e.kind === 'big' ? { kind: 'tool', id: 'radar' } : { kind: 'view', id: 'reactor' } });
  const n = (alerts ?? []).filter(a => a.at > seen.at && a.at <= now).length;
  if (n) lines.push({ text: `${n} alert${n === 1 ? '' : 's'} since then.`, go: { kind: 'tool', id: 'alerts' } });
  return { since: +seen.at, lines: lines.slice(0, 6), empty: !lines.length };
}
/** "3 h 20 min ago", "2 days ago". */
export function agoText(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60_000)); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ''} ago`; const d = Math.floor(h / 24); return `${d} day${d === 1 ? '' : 's'} ago`;
}

// ── TODAY: the still front page ──
/** inp = { lead, chain: { holding, broken, brokenShort[] }, unusual: [{ label, text }], board: { up, dn, quiet, n }, next: { time, ccy, event }, walls: { label, call, put, flip, long }, alerts: { n, last } }.
 *  Each line: { sec (section id), label, text, go: { kind, id }, tone: 'warn' | 'ok' | null }. A missing input gives an honest "not loaded" line, never a guess. */
export function todayLines(inp = {}) {
  const L = [], go = (kind, id) => ({ kind, id });
  L.push({ sec: 'watch', label: 'THE LEAD', text: inp.lead ? String(inp.lead) : 'No headline yet: the chain has not loaded.', go: go('tool', 'broadcast'), tone: null });
  const c = inp.chain;
  L.push({ sec: 'macro', label: 'LINKS', text: c ? (c.broken ? `${c.broken} textbook link${c.broken === 1 ? '' : 's'} broken${c.brokenShort?.length ? `: ${c.brokenShort.slice(0, 3).join(', ')}` : ''}; ${c.holding} holding.` : `No link broken; ${c.holding} holding.`) : 'The chain has not loaded.', go: go('view', 'reactor'), tone: c?.broken ? 'warn' : null });
  const u = inp.unusual ?? [];
  L.push({ sec: 'markets', label: 'UNUSUAL', text: u.length ? u.slice(0, 3).map(x => `${x.label} ${x.text}`).join(' · ') : 'Nothing beyond its normal noise.', go: go('tool', 'radar'), tone: null });
  const b = inp.board;
  L.push({ sec: 'markets', label: 'THE BOARD', text: b?.n ? `${b.up} up, ${b.dn} down, ${b.quiet} quiet of ${b.n} markets against their usual move.` : 'The market board has not loaded.', go: go('view', 'candles'), tone: null });
  const n = inp.next;
  L.push({ sec: 'markets', label: 'NEXT RELEASE', text: n ? `${n.time} ${n.ccy} ${n.event}`.trim() : 'No high-impact release left today.', go: go('view', 'ahead'), tone: null });
  const w = inp.walls;
  L.push({ sec: 'pos', label: 'GAMMA', text: w ? `${w.label}: call wall ${w.call}, put wall ${w.put}${w.flip ? `, flip ${w.flip}` : ''}${w.long == null ? '' : w.long ? ' · spot above the flip (long gamma, moves damped)' : ' · spot below the flip (short gamma, moves amplified)'}.` : 'No option book read yet.', go: go('view', 'flipmap'), tone: null });
  const a = inp.alerts;
  L.push({ sec: 'sys', label: 'ALERTS', text: a?.n ? `${a.n} today${a.last ? `; latest: ${a.last}` : ''}` : 'No alerts today.', go: go('tool', 'alerts'), tone: a?.n ? 'warn' : null });
  return L;
}

// ── the frame budget ──
/** An adaptive governor, fed one frame time at a time. tick(ms, { idle, calm }) -> { dpr, minGap } : dpr drops to 1 after ~1 s of slow frames (> 24 ms average) and returns to the device's after
 *  ~5 s of fast ones (< 14 ms); minGap is 33 ms (30 fps) when idle (no input for 20 s) or under reduced motion, else 0. Pure (no clock of its own) so it is tested. */
export function frameBudget({ maxDpr = 2, slowMs = 24, fastMs = 14, slowN = 60, fastN = 300 } = {}) {
  let avg = 16, slow = 0, fast = 0, dpr = maxDpr;
  return {
    tick(ms, { idle = false, calm = false } = {}) {
      if (Number.isFinite(ms) && ms > 0 && ms < 1000) avg += (ms - avg) * 0.1;
      if (avg > slowMs) { slow++; fast = 0; } else if (avg < fastMs) { fast++; slow = 0; } else { slow = 0; fast = 0; }
      if (dpr > 1 && slow >= slowN) { dpr = 1; slow = 0; }
      if (dpr < maxDpr && fast >= fastN) { dpr = maxDpr; fast = 0; }
      return { dpr, minGap: idle || calm ? 33 : 0, avg };
    },
    get dpr() { return dpr; },
  };
}

// ── keys ──
export const KEYS = [
  ['1 – 6', 'the six sections (Watch, Markets, Macro, Positioning, Ask, System)'], ['0 or H', 'TODAY, the front page'], ['/', 'go to any picture or panel by name'], ['S', 'the next STYLE of this picture (same data, another drawing)'],
  ['?', 'this help'], ['Tab / Shift+Tab', 'step through the markets on the picture'], ['Enter', 'open the selected market\'s card'], ['O', 'open the selected market in the terminal (chart)'],
  ['P', 'pop Helix out to a second window'], ['Esc', 'close this, else dock Helix to a strip'], ['Space, ←, →, +, −', 'while a programme plays: pause, back, skip, faster, slower'],
];
/** Section id for a digit key '1'..'6', else null. */
export const sectionForKey = k => (/^[1-6]$/.test(String(k)) ? SECTIONS[+k - 1]?.id ?? null : null);
export { labelOf, sectionOf };

// ── OPEN IN TERMINAL: a Helix key (a chain node, a market, a gamma market) -> the desk instrument the terminal's chart / pair page take, or null ──
const CHAIN_INST = { oil: 'WTI', gold: 'GOLD', copper: 'COPPER', audusd: 'AUDUSD', usdcad: 'USDCAD', usdjpy: 'USDJPY', nq: 'NQ', spx: 'SPX500', gbpusd: 'GBPUSD', eurusd: 'EURUSD', btc: 'BTCUSD' };
export const DESK_INST = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURGBP', 'EURJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'AUDCAD', 'NZDCAD', 'NZDJPY', 'GBPNZD', 'AUDNZD', 'AUDCHF', 'NZDCHF', 'CADCHF', 'CHFJPY', 'EURNOK', 'EURSEK', 'USDNOK', 'USDSEK', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM', 'WTI', 'BRENT', 'NATGAS', 'SOYBEAN', 'WHEAT', 'CORN', 'SUGAR', 'BTCUSD'];
export function instFor(key) {
  const k = String(key ?? '').trim(); if (!k) return null;
  if (CHAIN_INST[k]) return CHAIN_INST[k];
  const u = k.toUpperCase().replace('/', ''); return DESK_INST.includes(u) ? u : null;
}

// ── colour tokens ──
/** The token Helix uses for LONG GAMMA / "together" (--cy): teal, except under the colour-blind theme, where up is already a light cyan, so it takes the violet (pur2) and calls (up) vs long gamma stay apart. */
export const cyTokenFor = themeId => (themeId === 'colourblind' ? 'pur2' : 'teal');
/** Squared RGB distance of two #rrggbb colours (for the guard that keeps two meanings apart). */
export function colourGap(a, b) {
  const p = s => { const m = String(s ?? '').trim().match(/^#([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const x = p(a), y = p(b); if (!x || !y) return null; return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}
/** The canvas font family: the theme's --mono stack (ui-monospace is not supported by Chrome on Windows, so it is never first), else a Windows-first stack. */
export function monoFont(cssMono) {
  const s = String(cssMono ?? '').trim().replace(/^ui-monospace\s*,\s*/i, '');
  return s && !/^var\(/.test(s) ? s : 'Consolas,"Cascadia Mono",Menlo,"DejaVu Sans Mono",monospace';
}
/** A ctx.font string with the views' 'ui-monospace,monospace' swapped for the HUD's family, and any px size raised to the floor (0 = none). */
export function mapFont(v, family, floor = 0) {
  let s = String(v ?? ''); if (family) s = s.replace('ui-monospace,monospace', family);
  return floor ? s.replace(/(\d+(?:\.\d+)?)px/, (x, n) => `${Math.max(+n, floor)}px`) : s;
}
