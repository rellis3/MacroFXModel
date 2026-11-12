// Research hub views (research.html Home and Drop in tabs): pure HTML builders, tested in js/research/hubView.test.mjs.
// Data: GET /api/research-hub (js/researchHub.js hubMap). A null value means the source could not be read: the tile says so.
import { esc, verdictChip } from './roomView.js';

const val = v => (v == null ? '<span class="tv na" title="could not read this source">–</span>' : `<span class="tv">${esc(v)}</span>`);
const tile = t => `<a class="tile${t.warn && t.value ? ' warn' : ''}" href="${esc(t.href)}">${t.link ? '<span class="tv go">→</span>' : val(t.value)}<span class="tl">${esc(t.label)}${t.lock ? ' 🔒' : ''}</span>${t.hint ? `<small>${esc(t.hint)}</small>` : ''}</a>`;

/** The loop: steps 1-5 in a row with arrows, the shelf underneath feeding every step. */
export function loopHtml(map) {
  const steps = (map ?? []).filter(s => s.id !== 'shelf'), shelf = (map ?? []).find(s => s.id === 'shelf');
  const step = s => `<section class="step st-${esc(s.id)}" aria-label="${esc(s.title)}"><header><b class="sn">${esc(s.n)}</b><span><h3>${esc(s.title)}</h3><small>${esc(s.sub)}</small></span></header>${s.tiles.map(tile).join('')}</section>`;
  return `<div class="loop">${steps.map((s, i) => `${step(s)}${i < steps.length - 1 ? '<span class="arr" aria-hidden="true">›</span>' : ''}`).join('')}</div>`
    + `<div class="back" aria-hidden="true"><span>results go back to the rooms and the Director</span></div>`
    + (shelf ? `<section class="step shelf" aria-label="Shelf"><header><b class="sn">${esc(shelf.n)}</b><span><h3>${esc(shelf.title)}</h3><small>${esc(shelf.sub)}: every step reads from here</small></span></header><div class="shelfrow">${shelf.tiles.map(tile).join('')}`
      + `<a class="tile" href="theory-lab/index.html"><span class="tv go">→</span><span class="tl">Theory Lab</span><small>lessons and visual guides</small></a>`
      + `<a class="tile" href="cog/hub.html"><span class="tv go">→</span><span class="tl">C.OG education</span><small>his course notes and lessons</small></a></div></section>` : '');
}

const STATUS_CHIP = { open: ['open', 'pur'], gated: ['gated', 'gold'], parked: ['parked', 'nul'], run: ['run', 'up'] };
/** The Director's agendas: each open card with an "Open a room" button. Run and parked cards are folded away. */
export function agendasHtml(agendas) {
  if (agendas == null) return '<p class="bad">Could not read the Director\'s agendas.</p>';
  if (!agendas.length) return '<p class="muted">No agendas yet. In a Claude session: "research director, set me the questions on …".</p>';
  return agendas.map(a => {
    const live = a.cards.filter(c => c.status === 'open' || c.status === 'gated'), done = a.cards.filter(c => !live.includes(c));
    const card = c => `<article class="qcard"><div class="qh"><span class="chip ${STATUS_CHIP[c.status]?.[1] ?? ''}">${esc(STATUS_CHIP[c.status]?.[0] ?? c.status)}</span>${c.score != null ? `<span class="score">${esc(c.score)}<small>/15</small></span>` : ''}<b>Q${esc(c.n)}. ${esc(c.title)}</b></div>`
      + `${c.text ? `<p>${esc(c.text)}</p>` : ''}${c.statusText ? `<p class="muted">${esc(c.statusText)}</p>` : ''}`
      + (c.status === 'run' ? '' : `<button type="button" class="btn" data-card="${esc(c.key)}">Open a room on this →</button>`) + '</article>';
    return `<details class="agenda"${live.length ? ' open' : ''}><summary><span class="at">${esc(a.title)}</span><span class="muted">${live.length} open · ${a.cards.length} in all</span></summary>`
      + `<div class="qgrid">${live.map(card).join('')}</div>${done.length ? `<details class="done"><summary>${done.length} run or parked</summary><div class="qgrid">${done.map(card).join('')}</div></details>` : ''}</details>`;
  }).join('');
}

/** The register's live rows (claimed, registered, running). */
export function registerHtml(rows) {
  if (!rows?.length) return '<p class="muted">Nothing claimed or running.</p>';
  return `<ul class="reg">${rows.map(r => `<li><span class="chip ${r.status === 'RUNNING' ? 'up' : 'gold'}">${esc(r.status.toLowerCase())}</span> <b>${esc(r.id)}</b> <span class="muted">${esc(r.updated)}</span><br><small>${esc(r.question)}</small>${r.next ? `<br><small class="muted">Next: ${esc(r.next.slice(0, 260))}</small>` : ''}</li>`).join('')}</ul>`;
}

/** The latest Evidence Book verdicts. */
export function latestHtml(list) {
  if (!list?.length) return '<p class="muted">Could not read the Evidence Book.</p>';
  return `<ul class="ef">${list.map(e => `<li>${verdictChip(e.verdict)} <b>${esc(e.id)}</b> <span class="muted">${esc(e.date)}</span> ${esc(e.claim)}</li>`).join('')}</ul>`;
}

const KIND = { video: '🎬 video', link: '🔗 link', paper: '📄 paper link', image: '🖼 picture', text: '📝 text' };
const QCHIP = { queued: 'gold', done: 'up', failed: 'bad', dropped: 'nul' };
/** The drop-box queue. */
export function queueHtml(items, lanes = {}) {
  if (!items?.length) return '<p class="muted">Nothing dropped yet.</p>';
  return `<ul class="queue">${items.map(x => `<li><span class="chip ${QCHIP[x.status] ?? ''}">${esc(x.status)}</span> <span class="lbl">${esc(KIND[x.kind] ?? x.kind)}</span> <span class="muted">${esc(String(x.at).slice(0, 16).replace('T', ' '))} · ${esc(lanes[x.lane] ?? x.lane)}</span><br>`
    + `${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url.length > 90 ? `${x.url.slice(0, 89)}…` : x.url)}</a>` : x.image ? esc(x.image.name || x.image.id) : `<span>${esc(String(x.text ?? '').slice(0, 160))}${String(x.text ?? '').length > 160 ? '…' : ''}</span>`}`
    + `${x.note ? `<br><small class="muted">Your note: ${esc(x.note)}</small>` : ''}${x.result?.note || x.result?.path ? `<br><small>→ ${esc(x.result.note)} ${x.result.path ? `<code>${esc(x.result.path)}</code>` : ''}</small>` : ''}</li>`).join('')}</ul>`;
}

/** The intake ledger: what has been learned, newest first. */
export function intakeHtml(rows) {
  if (rows == null) return '<p class="bad">Could not read the intake ledger.</p>';
  if (!rows.length) return '<p class="muted">Nothing processed yet. Drop something in, then ask a Claude session to "process the research inbox".</p>';
  return `<ul class="queue">${rows.map(r => `<li><span class="chip pur">${esc(r.lane)}</span> <b>${esc(r.title)}</b> <span class="muted">${esc(r.source)} · ${esc(r.processed)}</span>${r.ideas ? `<br><small>Ideas carded: ${esc(r.ideas)}</small>` : ''}${r.lessons ? `<br><small class="muted">Method lessons: ${esc(r.lessons)}</small>` : ''}</li>`).join('')}</ul>`;
}
