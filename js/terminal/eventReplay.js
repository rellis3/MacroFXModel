/**
 * Event replay (Desk Terminal, preview): the shared replay player (js/terminal/replayPlayer.js) fed by the Release Reaction record. One past release, minute by minute from 30 minutes
 * before to 4 hours after, over the faint paths of the last five releases of the same kind, in units of the market's typical 30-minute reaction. Size and timing only: which way a
 * release moves a market is not predictable from the release alone (Evidence Book), so nothing here says where the next one will go. Mounted by terminalFeel.js only when the
 * registry says the session may see `widget.eventreplay` (the owner always; a desk login only when switched on).
 *
 *   EVENTREPLAY [family] [market] on the command line, an "Event replay" button at the top of the Calendar tab, or window.deskEventReplay.open(family, market).
 * The pure parts (picking, units, ghosts, words) are js/eventReplayCore.js and the picture is js/terminal/eventReplayDraw.js; this file only joins them to the player.
 */
import { openPlayer } from './replayPlayer.js';
import { eventStage } from './eventReplayDraw.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { chartToPng, saveBlob } from './exportView.js';
import * as C from '../eventReplayCore.js';
import { familyFromWord, marketFromWord } from '../eventReplayCore.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };

export { familyFromWord, marketFromWord };

/** The player definition. `rows` are /api/release-layer1 rows; fetchJson is injectable for tests. family0 and mkt0 choose what the window opens on. */
export function eventDef(rows, { family0 = null, mkt0 = null, fetchJson = J, now = () => Date.now() } = {}) {
  let picks = C.releasePicks(rows, now(), 24);
  if (family0) { const f = picks.filter(p => rows.find(r => r.id === p.v)?.family === family0); if (f.length) picks = [...f, ...picks.filter(p => !f.includes(p))]; }
  const firstRel = rows.find(r => r.id === picks[0]?.v), m0 = mkt0 ?? C.FAMILY_MARKET[firstRel?.family] ?? 'nq';
  const mkts = [m0, ...C.MARKETS.map(m => m.k).filter(k => k !== m0)].map(k => ({ v: k, label: C.marketLabel(k) }));
  const held = new Map();
  const path = async id => { if (!held.has(id)) held.set(id, fetchJson(`/api/release-layer1/paths?id=${encodeURIComponent(id)}`).then(j => j.paths, () => null)); return held.get(id); };
  return {
    id: 'eventreplay', title: 'Event replay: a release, minute by minute',
    note: 'The market\'s move since the release minute, in units of its typical 30-minute reaction to this kind of release. The faint lines are the last five releases of the same kind to the same minute. It shows how big and how fast past releases moved markets. Which way a release moves a market is not predictable from the release alone, so nothing here says where the next one will go.',
    picks: [{ id: 'rel', label: 'Release', reload: true, values: picks }, { id: 'mkt', label: 'Market', reload: true, values: mkts }],
    load: async p => {
      const focus = rows.find(r => r.id === p.rel); if (!focus) throw new Error('that release is not in the record');
      const prev = C.previousSameKind(rows, focus), [fp, ...gps] = await Promise.all([path(focus.id), ...prev.map(r => path(r.id))]);
      if (!fp?.[p.mkt]) throw new Error(`no stored path for ${C.marketLabel(p.mkt)} around this release`);
      const ghostRows = prev.filter((r, i) => gps[i]?.[p.mkt]), ghostPaths = ghostRows.map(r => gps[prev.indexOf(r)][p.mkt]);
      let unit = C.unitFor(rows, focus.family, p.mkt), fallback = false;
      if (unit == null) {   // fewer than 5 of this kind: the median of every release of this market, said on screen
        const all = rows.map(r => r.M?.[p.mkt]?.m30).filter(C.fin).map(Math.abs).sort((a, b) => a - b); unit = all.length ? all[all.length >> 1] : null; fallback = true;
      }
      if (!(unit > 0)) throw new Error(`no typical 30-minute move can be worked out for ${C.marketLabel(p.mkt)}`);
      const frames = C.makeFrames(fp[p.mkt], ghostPaths, unit);
      const extra = { mkt: p.mkt, mktLabel: C.marketLabel(p.mkt), unit, family: focus.family, focusLabel: `${C.familyLabel(focus.family)} ${C.niceDay(focus.t)}`, focus, ghostIds: ghostRows.map(r => r.t.slice(0, 10)), facts: C.facts(focus),
        evidence: C.evidenceWords(DESK_EVIDENCE), thin: !!fp[p.mkt].thin };
      current = { frames, extra };
      return { frames, extra, wanted: null, coverage: C.coverageText(rows, focus, ghostRows, fallback ? null : unit, p.mkt) };
    },
    coverage: (frames, r) => r.coverage,
    draw: (frames, i, { reduced, extra }) => eventStage(frames, i, extra, { reduced }),
    caption: (frames, i, extra) => C.captionFor(frames, i, extra),
    label: (f, i, n, picks) => `${f.t === 0 ? 'the release' : f.t < 0 ? `${-f.t} min before` : `${f.t} min after`} · ${C.marketLabel(picks.mkt)} · step ${i + 1} of ${n}`,
  };
}

let current = null;   // { frames, extra } of the window that is open (for the CSV and PNG buttons)
const ROWS = { at: 0, rows: null };

export function mountEventReplay({ doc = document, win = window, fetchJson = J } = {}) {
  if (!doc.body || doc.body.dataset?.evrMounted) return null;
  if (doc.body.dataset) doc.body.dataset.evrMounted = '1';
  const note = text => { const b = doc.getElementById('ex-note'); if (b) { b.textContent = text; b.hidden = false; win.setTimeout?.(() => { b.hidden = true; }, 4000); } };
  async function open(family = null, market = null, opener = null) {
    try {
      if (!ROWS.rows || Date.now() - ROWS.at > 180e3) { ROWS.rows = (await fetchJson('/api/release-layer1')).rows ?? []; ROWS.at = Date.now(); }
      const fam = family ? (C.FAMILY_LABEL[String(family).toUpperCase()] ? String(family).toUpperCase() : familyFromWord(family)) : null;
      openPlayer(eventDef(ROWS.rows, { family0: fam, mkt0: market ? marketFromWord(market) : null, fetchJson }), { doc, win, opener }); return true;
    } catch (e) { note(`The event replay could not open: ${e.message}`); return false; }
  }
  async function onClick(e) {
    const o = e.target.closest?.('[data-evr-open]'); if (o) { open(null, null, o); return; }
    const b = e.target.closest?.('[data-evr-ex]'); if (!b || !current) return;
    if (b.dataset.evrEx === 'csv') { const ok = saveBlob(new win.Blob([C.eventCsv(current.frames, current.extra)], { type: 'text/csv;charset=utf-8' }), `event-replay-${current.extra.family}-${current.extra.mkt}-${current.extra.focus.t.slice(0, 10)}.csv`, doc, win); note(ok ? 'Saved the replay as a CSV file.' : 'The browser blocked the download.'); return; }
    const svg = doc.querySelector('#rpv-stage .evr-svg'); const blob = svg ? await chartToPng(svg, win, doc) : null;
    if (!blob) { note('That chart could not be turned into an image here.'); return; }
    const ok = saveBlob(blob, `event-replay-${current.extra.family}-${current.extra.mkt}-${current.extra.focus.t.slice(0, 10)}.png`, doc, win); note(ok ? 'Saved the chart as a PNG.' : 'The browser blocked the download.');
  }
  let scheduled = false;
  function decorate() {
    scheduled = false;
    const cal = doc.getElementById('cal'); if (!cal || cal.querySelector('[data-evr-bar]')) return;
    const bar = doc.createElement('div'); bar.className = 'evr-bar'; bar.setAttribute('data-evr-bar', ''); bar.setAttribute('data-noexport', ''); bar.setAttribute('data-surface', 'widget.eventreplay');
    bar.innerHTML = '<button type="button" class="btn rpv-open evr-open" data-evr-open data-surface="widget.eventreplay" title="Replay a past release minute by minute against the last five of the same kind (CPI, payrolls, a central-bank decision). Size and timing only.">▶ Event replay</button> <span class="muted">a past CPI, payrolls or central-bank decision, minute by minute, over the last five of its kind</span>';
    cal.prepend(bar);
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null;
  const cal0 = doc.getElementById('cal'); obs?.observe?.(cal0 ?? doc.body, { childList: true, subtree: !cal0 });
  doc.addEventListener('click', onClick);
  decorate();
  win.deskEventReplay = { open, families: () => Object.keys(C.FAMILY_LABEL), markets: () => C.MARKETS.map(m => m.k) };
  return { open, decorate, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.querySelectorAll('[data-evr-bar]').forEach(b => b.remove()); doc.getElementById('rpv-back')?.remove(); delete doc.body.dataset?.evrMounted; delete win.deskEventReplay; } };
}
