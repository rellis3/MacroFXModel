/**
 * Risk-flag history strip (Desk Terminal, preview): the six stress lights as ribbons over the days we hold, from the saved snapshots (js/riskFlagStripCore.js). Two places: the Insight tab's
 * Risk flags board (flagsView.js loads this file only when the registry says the session may see `panel.risk.strip`) and a slim card at the top of the Overview (terminalFeel.js mounts it).
 * It describes the lights; only a flag with a validated range finding is marked as one that says something, and it never says which way. Theme tokens only.
 */
import { model, csv } from '../riskFlagStripCore.js';
import { FLAG_EVIDENCE } from './flagsView.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { esc } from './boardViz.js';
import { saveBlob } from './exportView.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const FIRST = '2026-11-14T00:00:00Z';
const cache = { at: 0, points: null };

/** The risk section of every saved snapshot from the start of the record, hourly. Cached for five minutes. */
export async function loadPoints({ fetchJson = J, now = () => Date.now() } = {}) {
  if (cache.points && now() - cache.at < 300e3) return cache.points;
  const j = await fetchJson(`/api/desk-snapshots?fields=risk&step=60&max=400&from=${FIRST}&to=${new Date(now() + 3600e3).toISOString()}`);
  cache.points = (j.points ?? []).filter(p => p.d?.risk); cache.at = now(); return cache.points;
}
export const resetCache = () => { cache.at = 0; cache.points = null; };

const KIND_CHIP = { range: 'chip up', nearest: 'chip', light: 'chip' };

/** One ribbon as an SVG: one block per capture, wide as the time to the next one. on = red, off = quiet, could-not-read = hatched. */
export function ribbonSvg(row, m, { w = 640, h = 16, id = 'rfs' } = {}) {
  const span = Math.max(1, m.t1 - m.t0), x = t => ((t - m.t0) / span) * w, s = row.series;
  let cells = '';
  s.forEach((p, i) => {
    const x0 = x(p.ts), x1 = i + 1 < s.length ? x(s[i + 1].ts) : w, ww = Math.max(1, x1 - x0 + 0.4);
    const fill = p.on === 1 ? 'var(--dn)' : p.on === 0 ? 'var(--line2)' : `url(#${id}-gap)`, op = p.on === 1 ? 0.95 : p.on === 0 ? 0.35 : 1;
    cells += `<rect x="${x0.toFixed(1)}" y="0" width="${ww.toFixed(1)}" height="${h}" fill="${fill}" fill-opacity="${op}"/>`;
  });
  const ticks = m.ticks.map(t => `<line x1="${x(t.ts).toFixed(1)}" x2="${x(t.ts).toFixed(1)}" y1="0" y2="${h}" stroke="var(--bg1)" stroke-width="1.5"/>`).join('');
  return `<svg class="rfs-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" role="img" aria-label="${esc(row.text)}"><defs><pattern id="${id}-gap" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="var(--bg2)"/><line x1="0" y1="0" x2="0" y2="4" stroke="var(--tx3)" stroke-width="1.2"/></pattern></defs><rect width="${w}" height="${h}" fill="var(--bg2)" fill-opacity=".5"/>${cells}${ticks}</svg>`;
}

let uid = 0;
/** The full board block for the Insight tab. */
export function boardHtml(m) {
  if (!m.ok) return `<div class="card rfs-card" data-surface="panel.risk.strip"><div class="ch"><span class="lbl">The lights over time</span></div><p class="muted">${esc(m.why)}</p><p class="rfs-depth muted">${esc(m.depth)}</p></div>`;
  const axis = `<div class="rfs-axis" aria-hidden="true">${m.ticks.map(t => `<span style="left:${(((t.ts - m.t0) / Math.max(1, m.t1 - m.t0)) * 100).toFixed(1)}%">${esc(t.label)}</span>`).join('')}</div>`;
  const rows = m.rows.map(r => `<div class="rfs-row"><div class="rfs-h"><b>${esc(r.label)}</b><span class="${KIND_CHIP[r.evidence.kind]}" title="${esc(r.evidence.words)}">${esc(r.evidence.kind === 'range' ? 'range finding: VALIDATED' : r.evidence.kind === 'nearest' ? 'nearest test only' : 'a light, not a finding')}</span></div>${ribbonSvg(r, m, { id: `rfs${++uid}` })}<p class="rfs-s">${esc(r.text)}</p></div>`).join('');
  return `<div class="card rfs-card" data-surface="panel.risk.strip"><div class="ch"><span class="lbl">The lights over time</span><span class="r"><button type="button" class="btn" data-rfs-csv data-noexport title="Save the ribbons as a CSV file (made in this browser)">CSV</button></span></div><p class="rfs-head"><b>${esc(m.headline)}</b></p>${rows}${axis}<p class="rfs-depth muted">${esc(m.depth)}</p><p class="tt-note">Red is on, grey is off, hatched is a flag that could not be read. The lights describe where markets were. Only a flag with a validated range finding says anything about what follows, and then only that the days ahead run wider, never which way.</p></div>`;
}

/** The slim card for the top of the Overview: six thin ribbons with the labels and the headline. */
export function compactHtml(m) {
  if (!m.ok) return '';
  const rows = m.rows.map(r => `<div class="rfs-mini"><span class="rfs-ml">${esc(r.label)}</span>${ribbonSvg(r, m, { h: 10, id: `rfsm${++uid}` })}<span class="rfs-mn ${r.sum.now === 1 ? 'on' : ''}">${r.sum.now === 1 ? 'ON' : r.sum.now === 0 ? 'off' : 'n/a'}</span></div>`).join('');
  return `<div class="card rfs-compact" data-rfs-compact data-noexport data-surface="panel.risk.strip"><div class="ch"><span class="lbl">Risk flags, ${esc(m.depth.split(' saved captures')[0])} captures</span><span class="r muted">${esc(m.headline)}</span></div>${rows}</div>`;
}

function ensureCss(doc) {
  if (doc.getElementById('rfsCss')) return;
  const l = doc.createElement('link'); l.id = 'rfsCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/risk-strip.css'; doc.head?.appendChild(l);
}

/** Draw the board block into the end of the Insight > Risk flags host (flagsView calls this when the surface is on). */
export async function mountStripInto(host, { doc = document, fetchJson = J, win = window } = {}) {
  if (!host || host.querySelector('[data-rfs-board]')) return null;
  ensureCss(doc);
  const slot = doc.createElement('div'); slot.setAttribute('data-rfs-board', ''); slot.innerHTML = '<p class="muted">Reading the saved snapshots…</p>'; host.appendChild(slot);
  try {
    const m = model(await loadPoints({ fetchJson }), { flagEvidence: FLAG_EVIDENCE, evidence: DESK_EVIDENCE }); slot.innerHTML = boardHtml(m);
    slot.querySelector('[data-rfs-csv]')?.addEventListener('click', () => saveBlob(new win.Blob([csv(m)], { type: 'text/csv;charset=utf-8' }), 'risk-flag-history.csv', doc, win));
  } catch (e) { slot.innerHTML = `<p class="muted">The history could not be read (${esc(e?.message ?? e)}).</p>`; }
  return slot;
}

/** The Overview card: mounted by terminalFeel.js. Puts a slim card at the top of #overview and puts it back when the tab is redrawn. */
export function mountRiskStrip({ doc = document, win = window, fetchJson = J } = {}) {
  if (!doc.body || doc.body.dataset?.rfsMounted) return null;
  if (doc.body.dataset) doc.body.dataset.rfsMounted = '1';
  ensureCss(doc);
  let html = null, loading = false, sched = false;
  const decorate = () => {
    const root = doc.getElementById('overview'); if (!root || root.querySelector('[data-rfs-compact]')) return;
    if (html != null) { if (html) root.insertAdjacentHTML('afterbegin', html); return; }
    if (loading) return; loading = true;
    loadPoints({ fetchJson }).then(pts => { html = compactHtml(model(pts, { flagEvidence: FLAG_EVIDENCE, evidence: DESK_EVIDENCE })); }).catch(() => { html = ''; }).finally(() => { loading = false; decorate(); });
  };
  const schedule = () => { if (!sched) { sched = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(() => { sched = false; decorate(); }); } };
  const root0 = doc.getElementById('overview'), obs = win.MutationObserver ? new win.MutationObserver(schedule) : null; obs?.observe?.(root0 ?? doc.body, { childList: true });
  decorate();
  win.deskRiskStrip = { open: () => { doc.querySelector('button[data-t="insight"]')?.click?.(); win.setTimeout?.(() => doc.querySelector('.in-tab[data-p="flags"]')?.click?.(), 700); return true; } };
  return { decorate, destroy() { obs?.disconnect?.(); doc.querySelectorAll('[data-rfs-compact]').forEach(c => c.remove()); delete win.deskRiskStrip; delete doc.body.dataset?.rfsMounted; } };
}
