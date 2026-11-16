/**
 * OI drills (Desk Terminal, preview): a "Drill a level" button in the heading of the OI terrain card (Options tab) opens a window with the history of one level of that market from the stored
 * option-OI captures: the biggest call strike, the biggest put strike, max pain or the gamma flip. Days held, open interest and rank, distance from that day's close in average daily ranges, and
 * whether price traded through it, with buttons into the level walk and Path replays. It describes where a level was; the Evidence Book found walls no better than a mirrored placebo, and says so.
 * Pure parts: js/oiDrillCore.js. Mounted by terminalFeel.js only when the registry says the session may see `widget.oidrill`. Command: OIDRILL [callwall|putwall|maxpain|gammaflip] [market].
 */
import * as C from '../oiDrillCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { instFromLabel } from './ghostWalk.js';
import { esc } from './boardViz.js';
import { saveBlob } from './exportView.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const cache = new Map();
export const resetCache = () => cache.clear();
async function days(inst, fetchJson, now) { const h = cache.get(inst); if (h && now() - h.at < 180e3) return h.j; const j = await fetchJson(`/api/replay/oi-days?inst=${encodeURIComponent(inst)}`); cache.set(inst, { at: now(), j }); return j; }

/** A small SVG strip of one number per capture (open interest for a strike, or the distance from the close for a flip or max pain). */
export function sparkSvg(rows, key, { w = 560, h = 70 } = {}) {
  const v = rows.map(r => r[key]), fin = x => typeof x === 'number' && Number.isFinite(x), ok = v.filter(fin);
  if (ok.length < 2) return '';
  const lo = Math.min(...ok, key === 'dist' ? -1 : 0), hi = Math.max(...ok, key === 'dist' ? 1 : 1), x = i => 8 + (i / Math.max(1, v.length - 1)) * (w - 16), y = n => h - 6 - ((n - lo) / (hi - lo || 1)) * (h - 14);
  let d = '', pen = false; v.forEach((n, i) => { if (!fin(n)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`; pen = true; });
  const dots = v.map((n, i) => (fin(n) ? `<circle cx="${x(i).toFixed(1)}" cy="${y(n).toFixed(1)}" r="${i === v.length - 1 ? 4 : 2}" fill="var(--pur2)" fill-opacity="${i === v.length - 1 ? 1 : 0.55}"/>` : '')).join('');
  const zero = key === 'dist' ? `<line x1="8" x2="${w - 8}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--tx3)" stroke-opacity=".6" stroke-dasharray="3 3"/>` : '';
  return `<svg class="oid-spark" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${key === 'dist' ? 'distance from the close, in average daily ranges' : 'open interest'} over the last ${rows.length} captures"><rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="var(--bg2)" fill-opacity=".5"/>${zero}<path d="${d}" fill="none" stroke="var(--pur2)" stroke-width="1.8" stroke-linejoin="round"/>${dots}</svg>`;
}

export function drillHtml(m, ctx) {
  const picks = C.TARGETS.map(t => `<button type="button" class="btn" data-oid-t="${t.id}" aria-pressed="${t.id === ctx.target}">${esc(t.label)}</button>`).join('');
  const head = `<div class="oid-picks" role="group" aria-label="Level">${picks}</div>`;
  if (!m.ok) return `${head}<p class="muted">${esc(m.why)}</p>`;
  const dp = ctx.dp ?? 1, ev = C.evidenceWords(DESK_EVIDENCE).map(e => `<span class="chip" title="Evidence Book: ${esc(e.id)}">${esc(e.what)}: ${esc(e.verdict)}</span>`).join('');
  const strike = !!m.target.side, rows = [...m.rows].reverse();
  const tbl = `<div class="oit-tblw"><table class="oit-tbl"><thead><tr><th>Capture of</th><th class="n">Level</th>${strike ? '<th class="n">OI</th><th class="n" title="rank among the 8 biggest strikes">Rank</th>' : ''}<th class="n">Close</th><th class="n" title="distance from that day's close in average daily ranges">From close (ADR)</th><th class="n" title="did price trade through the level that day">Through</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.date)}</td><td class="n">${C.fmtLevel(r.level, dp)}</td>${strike ? `<td class="n">${r.inLadder ? Number(r.oi).toLocaleString('en-GB') : '<span class="muted">below the top 8</span>'}</td><td class="n">${r.inLadder ? r.rank : '–'}</td>` : ''}<td class="n">${C.fmtLevel(r.close, dp)}</td><td class="n">${C.fmtAdr(r.dist)}</td><td class="n">${r.through === null ? '–' : r.through ? 'yes' : 'no'}</td></tr>`).join('')}</tbody></table></div>`;
  return `${head}<p class="oid-words">${esc(C.words(m, ctx.label, dp))}</p>${sparkSvg(m.rows, strike ? 'oi' : 'dist')}<p class="oid-cap muted">${strike ? 'Open interest at this strike, one point per capture (a gap means it was below the top 8).' : 'How far the level was from that day\'s close, in average daily ranges (the dashed line is the close).'}</p>${tbl}
<div class="gw-meta">${ev}</div><div class="oid-links" data-noexport><button type="button" class="btn" data-oid-go="walk">Replay it as a level walk</button>${ctx.pathOk ? '<button type="button" class="btn" data-oid-go="path">Replay the Path</button>' : ''}<button type="button" class="btn" data-oid-csv>CSV</button></div>
<p class="tt-note">It shows where a level was and what price did against it. The Evidence Book found walls no better than a mirrored placebo and max pain no target, so this is context, never a reason to expect price to go to a level.</p>`;
}

export function mountOiDrill({ doc = document, win = window, fetchJson = J, now = () => Date.now() } = {}) {
  if (!doc.body || doc.body.dataset?.oidMounted) return null;
  if (doc.body.dataset) doc.body.dataset.oidMounted = '1';
  let st = null;
  const PATH = ['GOLD', 'NQ', 'EURUSD'];
  const close = () => { doc.getElementById('oid-back')?.remove(); st = null; };
  async function paint() {
    const back = doc.getElementById('oid-back'); if (!back || !st) return;
    const body = back.querySelector('.oid-body'); body.innerHTML = '<p class="muted">Reading the stored captures…</p>';
    try {
      const j = await days(st.inst, fetchJson, now); st.j = j; st.m = C.drill(j.days, st.target);
      body.innerHTML = drillHtml(st.m, { target: st.target, dp: j.dp, label: j.label, pathOk: PATH.includes(st.inst) });
    } catch (e) { body.innerHTML = `<p class="muted">The drill could not be read: ${esc(e.message)}</p>`; }
  }
  function open(inst, target = 'callwall', opener = null) {
    const k = String(inst ?? 'NQ').toUpperCase(); doc.getElementById('oid-back')?.remove();
    st = { inst: k, target: C.targetById(target) ? target : 'callwall', opener };
    const back = doc.createElement('div'); back.id = 'oid-back'; back.className = 'rpv-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', 'OI drill');
    back.innerHTML = `<div class="rpv"><div class="rpv-head"><b class="rpv-title">OI drill: one level through time</b><span class="chip rpv-chip">History, not live</span><button type="button" class="btn rpv-x" data-oid-x aria-label="Close">×</button></div><div class="oid-body"></div></div>`;
    doc.body.appendChild(back); back.querySelector('[data-oid-x]')?.focus?.(); paint(); return true;
  }
  const note = text => { const b = doc.getElementById('ex-note'); if (b) { b.textContent = text; b.hidden = false; win.setTimeout?.(() => { b.hidden = true; }, 4000); } };
  const onClick = e => {
    const o = e.target.closest?.('[data-oid-open]'); if (o) { open(instFromLabel(doc.getElementById('tr-name')?.textContent), 'callwall', o); return; }
    if (!st) return;
    if (e.target.closest?.('[data-oid-x]') || e.target === doc.getElementById('oid-back')) { const op = st.opener; close(); op?.focus?.(); return; }
    const t = e.target.closest?.('[data-oid-t]'); if (t) { st.target = t.dataset.oidT; paint(); return; }
    const g = e.target.closest?.('[data-oid-go]'); if (g) { const inst = st.inst; close(); if (g.dataset.oidGo === 'path') win.deskOiTime?.open?.('path', inst, null); else win.deskOiTime?.open?.('walk', inst, null); return; }
    if (e.target.closest?.('[data-oid-csv]') && st.m?.ok) { const ok = saveBlob(new win.Blob([C.drillCsv(st.m)], { type: 'text/csv;charset=utf-8' }), `oi-drill-${st.inst}-${st.target}.csv`, doc, win); note(ok ? 'Saved the drill as a CSV file.' : 'The browser blocked the download.'); }
  };
  const onKey = e => { if (e.key === 'Escape' && st) { const op = st.opener; close(); op?.focus?.(); } };
  doc.addEventListener('click', onClick); doc.addEventListener('keydown', onKey);
  let scheduled = false;
  function decorate() {
    scheduled = false;
    const card = doc.getElementById('tr-card'); if (!card || card.querySelector('[data-oid-open]')) return;
    const row = card.querySelector('#tr-name')?.parentElement ?? card.firstElementChild; if (!row) return;
    const tmp = doc.createElement('span');
    tmp.innerHTML = '<button type="button" class="btn rpv-open oid-open" data-oid-open data-noexport data-surface="widget.oidrill" title="Follow one level of this market (the biggest call strike, the biggest put strike, max pain or the gamma flip) back through the stored captures: days held, open interest, distance from the close, and whether price traded through it">Drill a level</button>';
    const b = tmp.querySelector('button'); if (b) row.appendChild(b);
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null; obs?.observe?.(doc.body, { childList: true, subtree: true });
  decorate();
  win.deskOiDrill = { open, targets: () => C.TARGETS.map(t => t.id) };
  return { open, decorate, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.removeEventListener('keydown', onKey); doc.querySelectorAll('[data-oid-open]').forEach(b => b.remove()); close(); delete win.deskOiDrill; delete doc.body.dataset?.oidMounted; } };
}
