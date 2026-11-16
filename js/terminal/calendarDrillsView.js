// js/terminal/calendarDrillsView.js: the CALENDAR DRILLS on the Calendar tab (the rules are calendarDrillsCore.js). Two cards above the calendar (earnings ahead, recent release scorecards) and, on every
// release row, a small "drill" button that opens: what this release has done to each market in the past (size; direction as the coin flip it is) and, for the matching US rows, the nowcast
// gap with its evidence grade. Everything comes from routes and data the terminal already holds; no consensus feed is added. The owner's private call on a release is never shown to a desk login.
//
// The calendar rows are drawn by calendar() in desk-terminal.html and redrawn whole on a refresh, so a MutationObserver puts the buttons back; the two cards live in #cal-drills, a sibling
// of the Calendar section that this file shows and hides with the tab.
//
// A PREVIEW feature (registry id panel.cal.drills): js/terminal/terminalFeel.js only loads this file when the session may see that surface.
import { earningsByDay, recentScorecards, scorecardLines, nowcastGap, similarReleases, rowSignature, sameRow } from './calendarDrillsCore.js';
import { chipFor } from './corrEvidence.js';

export const REFRESH_MS = 10 * 60_000;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const getJson = async (win, url) => { try { const r = await win.fetch(url, { credentials: 'same-origin' }); return r.ok ? await r.json() : null; } catch { return null; } };
const defaultEvents = () => { try { return typeof D !== 'undefined' && D && Array.isArray(D.ev) ? D.ev : []; } catch { return []; } };
const squash = t => String(t ?? '').replace(/\s+/g, ' ').trim();
// a cell's own text: its first child node (a text node, or <b>US</b>), not what the drill button adds after it
const ownText = cell => { const first = cell?.childNodes?.[0]; if (first) return squash(first.textContent); return squash(cell?.text) || squash(cell?.kids?.[0]?.textContent); };
const cellsOf = tr => [...(tr?.children ?? tr?.kids ?? [])].filter(c => c.tag ? /^t[dh]$/.test(c.tag) : /^T[DH]$/.test(c.tagName ?? ''));

export function earningsCardHtml(rows, now) {
  const days = earningsByDay(rows, { now });
  if (!days.length) return '<div class="ch"><span class="lbl">Earnings ahead</span></div><p class="muted">No big-company earnings on the schedule this week (or the schedule is not available).</p>';
  return `<div class="ch"><span class="lbl">Earnings ahead</span><span class="r muted">the big companies this week; a schedule, not a forecast</span></div>${days.map(d => `<div class="cd-day"><b class="mono">${esc(d.label)}</b><span class="cd-chips">${d.items.map(i => `<span class="chip${i.tracked ? ' gold' : ''}" title="${esc(`${i.name}${i.capB ? ` · about $${i.capB}bn` : ''}${i.when ? ` · ${i.when}` : ''}`)}">${esc(i.symbol)}<small class="muted"> ${i.when === 'before the open' ? 'am' : i.when === 'after the close' ? 'pm' : ''}</small></span>`).join('')}${d.total > d.items.length ? `<span class="muted"> +${d.total - d.items.length} more</span>` : ''}</span></div>`).join('')}`;
}
export function scorecardsCardHtml(cards, { owner = false } = {}) {
  const rs = recentScorecards(cards, 6);
  if (!rs.length) return '<div class="ch"><span class="lbl">Recent releases</span></div><p class="muted">No release scorecard yet: one is written 30 to 60 minutes after each high-impact print.</p>';
  return `<div class="ch"><span class="lbl">Recent releases</span><span class="r muted">how big each market moved in the 30 minutes after, against a normal half-hour: size, not direction</span></div>${rs.map(c => {
    const l = scorecardLines(c, { owner });
    return `<div class="cd-sc"><div class="cd-h">${esc(l.head)}</div>${l.lines.map(x => `<div class="cd-l">${esc(x)}</div>`).join('') || '<div class="cd-l muted">no market reaction measured</div>'}${l.call ? `<div class="cd-l muted">${esc(l.call)}</div>` : ''}</div>`;
  }).join('')}`;
}
const sgn = v => (v == null || !Number.isFinite(+v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(+v)}`);
const dayWord = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
/** A strip of the surprises' z, oldest to newest: up for above forecast, down for below, height = how big against that release's own typical surprise (capped at 3). Neutral colour: which way it went is not a signal. */
export function zStripSvg(rows) {
  const zs = [...rows].reverse().map(r => r.z).filter(z => z != null && Number.isFinite(z));
  if (zs.length < 2) return '';
  const W = Math.max(120, zs.length * 22), H = 46, mid = H / 2, bw = 14;
  const bars = zs.map((z, i) => { const h = Math.min(3, Math.abs(z)) / 3 * (mid - 3), x = 6 + i * 22; return `<rect x="${x}" y="${(z >= 0 ? mid - h : mid).toFixed(1)}" width="${bw}" height="${Math.max(1.5, h).toFixed(1)}" rx="2" fill="var(--pur2)" opacity="${(0.45 + Math.min(1, Math.abs(z) / 3) * 0.55).toFixed(2)}"><title>${esc(sgn(z))}σ</title></rect>`; }).join('');
  return `<svg class="cd-z" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Surprise size of the last ${zs.length} prints, oldest to newest"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--line2)" stroke-dasharray="3 3"/>${bars}</svg>`;
}
/** The "past prints" drawer for one release (js/releaseHistory.js -> /api/release-history). Always says what it is missing; never a lean. */
export function historyHtml(h) {
  const head = '<div class="cd-h">Past prints of this release <span class="chip" title="The size of a surprise is validated; which way the next one lands is not predictable from the series.">size, not direction</span></div>';
  if (!h || h.ok === false || !h.found || !Array.isArray(h.rows) || !h.rows.length) return `${head}<div class="cd-l muted">${esc(h?.note ?? 'No past prints of this release are held yet, so there is nothing to show.')}</div>`;
  const sm = h.summary ?? {};
  const line = `${h.printed} prints held since ${esc(dayWord(h.first))}${h.matched === 'normalised' ? ' (matched by title without its period tag)' : ''}. ${sm.withForecast ? `Against the forecast: ${sm.above} above, ${sm.inline} in line, ${sm.below} below. ` : 'No forecast is stored for these prints. '}${sm.medianAbsZ != null ? `A typical surprise is ${esc(sm.medianAbsZ)}σ of this release's own surprises, the largest ${esc(sm.maxAbsZ)}σ.` : esc(sm.zNote ?? '')}`;
  const rows = h.rows.map(r => `<tr><td class="mono">${esc(dayWord(r.date))}</td><td class="n mono">${esc(r.forecast ?? '–')}</td><td class="n mono">${esc(r.actual)}</td><td class="n mono muted">${esc(r.previous ?? '–')}</td><td class="n mono">${r.beat ? `${r.beat === 'above' ? '▲' : r.beat === 'below' ? '▼' : '='} ${esc(sgn(r.surprise))}` : '–'}</td><td class="n mono">${r.z != null ? `${esc(sgn(r.z))}σ` : '–'}</td><td class="n mono muted">${r.revised != null ? esc(r.revised) : r.revision ? esc(`${r.revision.was ?? '?'} → ${r.revision.now ?? '?'}`) : '–'}</td></tr>`).join('');
  const miss = Array.isArray(h.missing) && h.missing.length ? `<div class="cd-l muted">Not available: ${h.missing.map(esc).join('; ')}.</div>` : '';
  const ev = h.evidence ? `<div class="cd-l" style="margin-top:6px">${chipFor(h.evidence.id, '')} <span class="muted">${esc(h.evidence.say)}</span></div>` : '';
  return `${head}<div class="cd-l">${line}</div>${zStripSvg(h.rows)}<table class="cd-t"><thead><tr><th>Date</th><th>Forecast</th><th>Actual</th><th>Previous</th><th>Surprise</th><th>vs its own history</th><th>Revised</th></tr></thead><tbody>${rows}</tbody></table>${miss}${ev}`;
}
export function drillHtml(event, nowcast) {
  const g = nowcastGap(event, nowcast), s = similarReleases(event);
  const gap = g ? `<div class="cd-sec"><div class="cd-h">Nowcast gap <span class="chip" title="${esc(g.evidence.say)}">${g.evidence.grade === 'null' ? 'context only: tested, no edge' : 'context'}</span></div><div class="cd-l">${esc(g.words)}</div></div>` : '';
  const sim = s ? `<div class="cd-sec"><div class="cd-h">What this release has done before <span class="chip" title="Size is validated (event-impact-map); direction is not">size, not direction</span></div><div class="cd-l">${esc(s.words)}</div>
<table class="cd-t"><thead><tr><th>Market</th><th>30-min move vs normal</th><th>Prints</th><th>Next day up</th></tr></thead><tbody>${s.rows.map(r => `<tr><td class="mono">${esc(r.inst)}</td><td class="n mono">${esc(r.spike)}×</td><td class="n mono">${esc(r.n)}</td><td class="n mono muted">${esc(r.upPct)}%</td></tr>`).join('')}</tbody></table></div>` : '';
  return gap + sim || '<div class="cd-l muted">Nothing held about this release beyond the calendar line: the Event Response Book has no entry for it (a release that never moved markets much has none).</div>';
}

export function mountCalendarDrills({ doc = document, win = window, getEvents = defaultEvents, now = () => Date.now(), owner = !win.deskIsViewer?.() } = {}) {
  const root = doc.getElementById('cal'), host = doc.getElementById('cal-drills');
  if (!root || !host || host.dataset.cdMounted) return null;
  host.dataset.cdMounted = '1';
  let data = { earn: null, cards: null, nowcast: null }, open = false, timer = null, scheduled = false;
  const drawTop = () => { host.innerHTML = `<div class="card cd-card" data-surface="panel.cal.drills">${earningsCardHtml(data.earn?.rows, now())}</div><div class="card cd-card" data-surface="panel.cal.drills">${scorecardsCardHtml(data.cards?.scorecards, { owner })}</div>`; };
  // put a drill button in the event cell of each row and tie the row to its event by time, country and name
  function decorate() {
    scheduled = false;
    const events = getEvents().filter(e => !/holiday/i.test(e.impact ?? '')), used = new Map();
    for (const tr of root.querySelectorAll('tbody tr')) {
      if (tr.querySelector('.cd-btn')) continue;
      const cells = cellsOf(tr); if (cells.length < 3) continue;
      const sig = { time: ownText(cells[0]), country: ownText(cells[1]), event: ownText(cells[2]) };
      const matches = events.filter(e => sameRow(sig, rowSignature(e))), k = `${sig.time}|${sig.country}|${sig.event}`, nth = used.get(k) ?? 0; used.set(k, nth + 1);
      const ev = matches[Math.min(nth, matches.length - 1)]; if (!ev) continue;
      const idx = events.indexOf(ev);
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'cd-btn'; b.setAttribute('data-cd', String(idx)); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', `What is known about ${sig.event}`); b.title = 'What this release has done before, and the nowcast gap where there is one'; b.textContent = '▸';
      cells[2].appendChild(b);
    }
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null; obs?.observe?.(root, { childList: true, subtree: true });
  root.addEventListener('click', e => {
    const b = e.target.closest?.('.cd-btn'); if (!b) return;
    const cell = b.closest('td'), det = cell.querySelector('.cd-det');
    if (det) { det.remove(); b.setAttribute('aria-expanded', 'false'); b.textContent = '▸'; return; }
    const ev = getEvents().filter(x => !/holiday/i.test(x.impact ?? ''))[+b.dataset.cd]; if (!ev) return;
    const d = doc.createElement('div'); d.className = 'cd-det'; d.setAttribute('data-noexport', ''); d.innerHTML = drillHtml(ev, data.nowcast);
    cell.appendChild(d); b.setAttribute('aria-expanded', 'true'); b.textContent = '▾';
    // the past prints of this release: fetched on click (one small route), never with the page
    const hist = doc.createElement('div'); hist.className = 'cd-sec cd-hist'; hist.innerHTML = '<div class="cd-h">Past prints of this release</div><div class="cd-l muted">Loading the past prints…</div>'; d.appendChild(hist);
    if (ev.country && ev.event) getJson(win, `/api/release-history?country=${encodeURIComponent(ev.country)}&event=${encodeURIComponent(squash(ev.event))}&n=12`).then(h => { if (hist.isConnected !== false) hist.innerHTML = historyHtml(h); });
    else hist.innerHTML = historyHtml(null);
  });
  async function load() {
    const [earn, cards, nowcast] = await Promise.all([getJson(win, '/api/earnings-ahead'), getJson(win, '/api/release-calls?days=30'), getJson(win, '/api/nowcast')]);
    data = { earn: earn?.ok ? earn : data.earn, cards: cards?.ok ? cards : data.cards, nowcast: nowcast?.ok ? nowcast : data.nowcast };
    if (open) drawTop();
  }
  function enter() { if (open) return; open = true; host.hidden = false; drawTop(); load(); decorate(); timer = win.setInterval(() => { if (!doc.hidden) load(); }, REFRESH_MS); }
  function leave() { open = false; host.hidden = true; if (timer) win.clearInterval(timer); timer = null; }
  const tabBtns = [...doc.querySelectorAll('#tabs [data-t]')], onTab = e => { const b = e.currentTarget ?? e.target; if (b.dataset.t === 'cal') win.setTimeout(enter, 0); else leave(); };
  for (const b of tabBtns) b.addEventListener('click', onTab);
  host.hidden = true;
  if (doc.querySelector('#tabs [data-t="cal"]')?.getAttribute('aria-selected') === 'true') enter();
  return { enter, leave, decorate, destroy() { leave(); obs?.disconnect?.(); for (const b of tabBtns) b.removeEventListener('click', onTab); host.innerHTML = ''; delete host.dataset.cdMounted; } };
}
