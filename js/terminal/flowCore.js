// js/terminal/flowCore.js: the pure half of the terminal's FLOW features (plans/TERMINAL_FLOW_REVIEW.md, items F7 to F10, the slim "What drives this", dense mode).
// No DOM, no fetch. js/terminal/flowView.js is the DOM half, js/terminal/analyticsSplit.js the Analytics tab's pills. Tested by flowCore.test.mjs.
//
//   F7  the Overview "at a glance" block: what the market is doing now in one screen (regime, stress lights, strength, the most unusual reading, the next release, the ruling)
//   F8  one home for currency strength: the other places link to it and say which measure they show (desk read or price)
//   F9  the Analytics tab split into "Market behaviour" and "The desk's record"
//   F10 the Insight boards promoted to where they belong, as links (no board is drawn twice)
//   the slim "What drives this" on the Pair page, and the comfortable / dense setting
// Context only: nothing here is a trade signal and no number is invented; a missing feed shows as "not available".

export const SURFACES = {
  glance: 'panel.ov.glance',
  promos: 'panel.flow.promos',
  slim: 'panel.pair.driveshort',
  density: 'widget.density',
  anaPills: 'panel.ana.pills',
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fin = v => typeof v === 'number' && Number.isFinite(v);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD'];

// ── F7 at a glance ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** "2h 15m", "35m", "now" for a time in the future (ms); a time up to 30 minutes in the past reads "now". */
export function countdown(ms, now = Date.now()) {
  if (!fin(ms) || !fin(now)) return null;
  const d = ms - now;
  if (d <= 0) return 'now';
  const m = Math.round(d / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r ? `${h}h ${r}m` : `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The regime: tone word, conviction, and one line, from the Global Manager's ruling (run.debate.global.view or run.head.book.global). */
export function regimeOf(run) {
  const v = run?.debate?.global?.view ?? run?.head?.book?.global ?? null;
  if (!v) return null;
  const tone = String(v.tone ?? '').replace('_', '-').toLowerCase();
  const word = /off/.test(tone) ? 'Risk-off' : /on/.test(tone) ? 'Risk-on' : tone ? cap(tone) : '';
  return { word, cls: /off/.test(tone) ? 'dn' : /on/.test(tone) ? 'up' : 'fl', conviction: v.conviction ? String(v.conviction) : null, summary: v.summary ? String(v.summary) : null };
}

/** The world-stress strip's counts: { overall, ok, watch, stress, worst:[{label, level, detail}] }. */
export function stressOf(ws) {
  if (!ws?.ok || !Array.isArray(ws.tiles) || !ws.tiles.length) return null;
  const c = { ok: 0, watch: 0, stress: 0 };
  for (const t of ws.tiles) if (c[t.level] != null) c[t.level]++;
  const rank = { stress: 2, watch: 1, ok: 0 };
  const worst = ws.tiles.filter(t => rank[t.level] > 0).sort((a, b) => rank[b.level] - rank[a.level]).slice(0, 3).map(t => ({ label: String(t.label ?? ''), level: t.level, detail: t.detail ? String(t.detail) : '' }));
  return { overall: String(ws.overall ?? ''), ok: c.ok, watch: c.watch, stress: c.stress, n: ws.tiles.length, worst };
}

/** The desk's own ranking (strongest first) and the price read's top and bottom (the 1D window, else 4H): { desk:{top,bottom}, price:{top,bottom,window,from} }. */
export function strengthOf(ranking, strength) {
  const out = { desk: null, price: null };
  if (Array.isArray(ranking) && ranking.length >= 2) out.desk = { top: ranking[0], bottom: ranking[ranking.length - 1] };
  const hz = strength?.ok ? (strength.horizons?.['1D']?.available ? '1D' : strength.horizons?.['4H']?.available ? '4H' : null) : null;
  if (hz) {
    const rows = (strength.horizons[hz].scores ?? []).filter(s => CCYS.includes(s.ccy) && fin(s.score)).sort((a, b) => b.score - a.score);
    if (rows.length >= 2) out.price = { window: hz, top: { ccy: rows[0].ccy, score: rows[0].score }, bottom: { ccy: rows.at(-1).ccy, score: rows.at(-1).score }, from: strength.horizons[hz].from ?? null };
  }
  return out;
}

/** The next high-impact release from the page's events (each { ms|time, event, country, impact }): { event, country, ms, in } or null. */
export function nextRelease(events, now = Date.now()) {
  const list = (Array.isArray(events) ? events : []).map(e => ({ e, ms: Number(e.ms ?? Date.parse(e.time)) })).filter(x => fin(x.ms) && x.ms > now - 30 * 60_000 && /high/i.test(String(x.e.impact ?? ''))).sort((a, b) => a.ms - b.ms);
  const x = list[0]; if (!x) return null;
  return { event: String(x.e.event ?? ''), country: String(x.e.country ?? ''), ms: x.ms, in: countdown(x.ms, now) };
}

/** The most unusual reading in the Insight ranking (rankBundle rows, most extreme first): { label, group, text, count, expected } or null. */
export function unusualOf(rank, expected = null) {
  const r = rank?.rows?.[0]; if (!r) return null;
  return { key: r.key, label: String(r.label ?? r.key), group: r.group ?? null, text: String(r.driver?.text ?? ''), count: expected?.hot ?? null, expected: expected?.expected ?? null };
}

/** A short "how fresh" phrase from the run's date and the data-quality chip's text ("DATA 129/134"). */
export function freshness(run, dqText = '', now = Date.now()) {
  const parts = [];
  if (run?.date) parts.push(`desk run ${run.date}`);
  const t = String(dqText ?? '').trim(); if (t) parts.push(t.replace(/^data\s*/i, 'feeds '));
  if (run?.finishedAt) { const m = Math.round((now - Date.parse(run.finishedAt)) / 60000); if (fin(m) && m >= 0) parts.push(m < 90 ? `book ${m}m old` : `book ${Math.round(m / 60)}h old`); }
  return parts.join(' · ') || null;
}

/** The whole model from what the page holds. Every part is null when its feed is missing (the view then says "not available"). */
export function buildGlance({ run = null, ws = null, ranking = null, strength = null, rank = null, expected = null, events = null, dqText = '', now = Date.now() } = {}) {
  const ok = !!(run?.ok && run.head?.ok !== false);
  return {
    regime: ok ? regimeOf(run) : null,
    ruling: ok ? (run?.head?.book?.headline ? String(run.head.book.headline) : null) : null,
    stress: stressOf(ws),
    strength: strengthOf(ok ? ranking : null, strength),
    unusual: unusualOf(rank, expected),
    next: nextRelease(events, now),
    fresh: freshness(ok ? run : null, dqText, now),
  };
}

const tile = (label, body, { go = '', cls = '', title = '' } = {}) =>
  `<${go ? 'button type="button"' : 'div'} class="fl-tile ${cls}"${go ? ` data-go="${esc(go)}"` : ''}${title ? ` title="${esc(title)}"` : ''}><span class="fl-lbl">${esc(label)}</span>${body}</${go ? 'button' : 'div'}>`;
const na = '<span class="fl-na">not available</span>';

/** The glance block's HTML (every string escaped). Tiles with a data-go open the board that holds the detail. */
export function glanceHtml(m) {
  const t = [];
  t.push(tile('Regime', m.regime ? `<b class="fl-big ${m.regime.cls}">${esc(m.regime.word)}</b>${m.regime.conviction ? `<span class="fl-sub">${esc(m.regime.conviction)} conviction</span>` : ''}` : na, { go: 'ov.regime', title: "The Global Manager's risk-on / risk-off ruling" }));
  if (m.stress) {
    const lights = `<span class="fl-lights" aria-label="${m.stress.stress} stress, ${m.stress.watch} watch, ${m.stress.ok} ok">${'<i class="dn"></i>'.repeat(m.stress.stress)}${'<i class="gold"></i>'.repeat(m.stress.watch)}${'<i class="up"></i>'.repeat(m.stress.ok)}</span>`;
    t.push(tile('World stress', `<b class="fl-big ${m.stress.overall === 'stress' ? 'dn' : m.stress.overall === 'watch' ? 'gold' : 'up'}">${esc(cap(m.stress.overall))}</b>${lights}<span class="fl-sub">${m.stress.worst.length ? esc(m.stress.worst.map(w => w.label).join(' · ')) : 'all lights green'}</span>`, { go: 'insight.flags', title: 'The six stress lights with what the tests found for each' }));
  } else t.push(tile('World stress', na));
  const s = m.strength;
  if (s?.price || s?.desk) {
    const price = s.price ? `<span class="fl-sub">price (${esc(s.price.window)}): <b class="up">${esc(s.price.top.ccy)}</b> ${s.price.top.score >= 0 ? '+' : ''}${s.price.top.score.toFixed(1)}σ · <b class="dn">${esc(s.price.bottom.ccy)}</b> ${s.price.bottom.score >= 0 ? '+' : ''}${s.price.bottom.score.toFixed(1)}σ</span>` : '';
    const desk = s.desk ? `<span class="fl-sub">desk read: <b class="up">${esc(s.desk.top)}</b> strongest · <b class="dn">${esc(s.desk.bottom)}</b> weakest</span>` : '';
    t.push(tile('Currency strength', `${price}${desk}`, { go: 'insight.fxmatrix', title: 'Two different measures: what price did (σ) and what the desk rules. Open the currency matrix for all eight' }));
  } else t.push(tile('Currency strength', na));
  t.push(tile('Most unusual', m.unusual ? `<b class="fl-med">${esc(m.unusual.label)}</b><span class="fl-sub">${esc(m.unusual.text)}</span>${m.unusual.count != null && m.unusual.expected != null ? `<span class="fl-sub">${esc(m.unusual.count)} readings hot, about ${esc(Math.round(m.unusual.expected))} by chance</span>` : ''}` : na, { go: 'insight.unusual', title: 'Ranked against its own history, not by size' }));
  t.push(tile('Next release', m.next ? `<b class="fl-med">${esc(m.next.country)} ${esc(m.next.event)}</b><span class="fl-sub">in ${esc(m.next.in)}</span>` : '<span class="fl-sub">no high-impact release in sight</span>', { go: 'tab.cal', title: 'The calendar, with what each release did before' }));
  return `<div class="fl-glance" data-surface="panel.ov.glance" role="region" aria-label="The market at a glance"><div class="fl-head"><span class="fl-title">At a glance</span>${m.fresh ? `<span class="fl-age">${esc(m.fresh)}</span>` : ''}</div>`
    + (m.ruling ? `<p class="fl-ruling">${esc(m.ruling)}</p>` : '')
    + `<div class="fl-tiles">${t.join('')}</div><p class="fl-note">Context for the day, not a trade signal. Each tile opens the board behind it.</p></div>`;
}

// ── F9 Analytics split ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The Analytics tab's blocks in two groups. Every panel.ana.* surface is in exactly one (flowCore.test.mjs checks the registry). */
export const ANA_GROUPS = [
  { id: 'market', alias: 'market', label: 'Market behaviour', blurb: 'how the market behaves: the book as it is held, strength over time, vol forecast against what happened, release reactions, factor risk and scenarios',
    blocks: ['panel.ana.web', 'panel.ana.strength', 'panel.ana.volfc', 'panel.ana.fans', 'panel.ana.risk', 'panel.ana.scenmap'] },
  { id: 'desk', alias: 'desk', label: "The desk's record", blurb: "how the desk itself did: its track record, which layer earned it, each scored day and each analyst's scorecard",
    blocks: ['panel.ana.track', 'panel.ana.fall', 'panel.ana.days', 'panel.ana.analysts'] },
];
export const ANA_BLOCKS = ANA_GROUPS.flatMap(g => g.blocks);
export const anaGroupOf = id => ANA_GROUPS.find(g => g.blocks.includes(id))?.id ?? null;
/** "#ana/desk" -> 'desk'; anything else -> null. */
export const anaFromHash = h => { const m = /^#?ana\/([a-z]+)$/i.exec(String(h ?? '').trim()); return m && ANA_GROUPS.some(g => g.alias === m[1].toLowerCase()) ? m[1].toLowerCase() : null; };
/** Which group opens: the hash, else the remembered one, else the first with a visible block. isOn(surface) -> bool. */
export function pickAnaGroup({ hash = '', saved = '', isOn = () => true } = {}) {
  const vis = ANA_GROUPS.filter(g => g.blocks.some(b => isOn(b))).map(g => g.id);
  const h = anaFromHash(hash);
  return vis.includes(h) ? h : vis.includes(saved) ? saved : (vis[0] ?? null);
}
export function anaPillsHtml(active, isOn = () => true) {
  const vis = ANA_GROUPS.filter(g => g.blocks.some(b => isOn(b)));
  if (vis.length < 2) return '';
  return `<div class="filters msub-pills fl-anapills" role="tablist" aria-label="Analytics sections" data-surface="panel.ana.pills">${vis.map(g => `<button type="button" role="tab" data-ana="${g.id}" aria-selected="${g.id === active}" aria-pressed="${g.id === active}" title="${esc(cap(g.blurb))}">${esc(g.label)}</button>`).join('')}</div>`;
}

// ── F10 promoted Insight boards (links, never a second drawing) ─────────────────────────────────────────────────────────────────────────

/** Where an Insight board is linked from. `where` names the host; `target` is the registry surface of the board that is opened. */
export const PROMOS = [
  { id: 'gold', host: 'assets', label: 'Gold board', text: 'Gold against the real yield, the dollar, its own vol, positioning and the ETF holdings', target: 'panel.insight.gold' },
  { id: 'reach', host: 'pair', label: 'Level reach', text: 'The chance price touches a level by the end of the day, from the calibrated range', target: 'panel.insight.reach' },
  { id: 'flags', host: 'stress', label: 'Risk flags with their evidence', text: 'Each stress light beside what the tests found for it', target: 'panel.insight.flags' },
  { id: 'fxmatrix', host: 'strength', label: 'Currency matrix', text: 'All eight currencies across 1H, 4H, 1D and 1W: the home of currency strength', target: 'panel.insight.fxmatrix' },
  { id: 'unusual', host: 'overview', label: 'What is unusual right now', text: 'Every series ranked by how extreme it is against its own history', target: 'panel.insight.unusual' },
  { id: 'economies', host: 'macro', label: 'World economies', text: 'Growth, prices, jobs and spending for the eight economies', target: 'panel.insight.economies' },
];
export const promosFor = host => PROMOS.filter(p => p.host === host);
export function promoHtml(p) {
  return `<button type="button" class="fl-promo" data-surface="panel.flow.promos" data-promo="${esc(p.target)}" title="${esc(p.text)}"><span class="fl-pl">${esc(p.label)}</span><span class="fl-pt">${esc(p.text)}</span><span class="fl-pa" aria-hidden="true">open ›</span></button>`;
}

// ── the slim "What drives this" ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** From cardDrivers(): the net chip, and the two strongest tailwinds and two strongest headwinds across every analyst (each point once, with who made it). */
export function slimDrivers(x, { analystLabel = id => id, take = 2 } = {}) {
  if (!x?.analysts) return null;
  const pts = x.analysts.flatMap(a => a.points.map(p => ({ ...p, by: analystLabel(a.id) })));
  const up = pts.filter(p => p.push > 0).sort((a, b) => b.push - a.push).slice(0, take);
  const dn = pts.filter(p => p.push < 0).sort((a, b) => a.push - b.push).slice(0, take);
  return { net: x.net ?? 0, tailwinds: up, headwinds: dn, analysts: x.analysts.length, points: pts.length };
}

/** First sentence, ended on a word boundary under `max` characters (never mid-number). */
export function firstLine(text, max = 190) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = /^(.{6,}?[.!?])(\s|$)/.exec(t);
  let s = m ? m[1] : t;
  if (s.length <= max) return s;
  s = s.slice(0, max);
  const k = Math.max(s.lastIndexOf(' '), s.lastIndexOf(','), s.lastIndexOf(';'));
  return `${s.slice(0, k > 60 ? k : max).replace(/[,;:\s]+$/, '')}…`;
}

export function slimHtml(m, { market = '', summary = '', stanceFn = null } = {}) {
  if (!m) return '';
  const st = stanceFn ? stanceFn(m.net) : { word: m.net > 0 ? 'Tailwind' : m.net < 0 ? 'Headwind' : 'Neutral', cls: m.net > 0 ? 'up' : m.net < 0 ? 'dn' : 'flat' };
  const li = (p, cls, word) => `<li class="fl-sp ${cls}"><span class="fl-sw">${word}</span><span class="fl-st">${esc(firstLine(p.claim))}<i class="fl-by"> · ${esc(p.by)}</i></span></li>`;
  return `<div class="fl-slim-body" data-surface="panel.pair.driveshort"><p class="fl-sl"><span class="hd-chip ${esc(st.cls)}">${esc(st.word)}</span> ${esc(summary || `${m.points} points from ${m.analysts} analysts on ${market}.`)}</p>`
    + `<div class="fl-cols"><div><span class="fl-colh up">Strongest tailwinds</span><ul>${m.tailwinds.map(p => li(p, 'up', 'Tailwind')).join('') || '<li class="fl-none">None this morning.</li>'}</ul></div>`
    + `<div><span class="fl-colh dn">Strongest headwinds</span><ul>${m.headwinds.map(p => li(p, 'dn', 'Headwind')).join('') || '<li class="fl-none">None this morning.</li>'}</ul></div></div>`
    + `<p class="fl-note">It explains the analysts' thinking, it is not a tested signal.</p></div>`;
}

// ── dense mode ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const DENSITY_KEY = 'deskDensity:v1';
export const DENSITIES = ['comfortable', 'dense'];
export const normaliseDensity = v => (DENSITIES.includes(String(v ?? '').toLowerCase()) ? String(v).toLowerCase() : 'comfortable');
export const nextDensity = v => (normaliseDensity(v) === 'dense' ? 'comfortable' : 'dense');
/** DENSE / DENSE ON / DENSE OFF / DENSE TOGGLE / COMFORTABLE -> the density to set, or null for an unknown word. */
export function densityFromWord(word, current = 'comfortable') {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w || w === 'toggle') return nextDensity(current);
  if (w === 'on' || w === 'dense' || w === 'compact') return 'dense';
  if (w === 'off' || w === 'comfortable' || w === 'normal' || w === 'roomy') return 'comfortable';
  return null;
}
