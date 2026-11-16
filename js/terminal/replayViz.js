/**
 * Replay on one visualisation (Desk Terminal, preview): puts a small "Replay" button on the card of each replayable visual and opens the shared
 * player (js/terminal/replayPlayer.js) with that visual's own history. Mounted by terminalFeel.js only when the registry says the session may see
 * `widget.replayviz` (the owner always; a desk login only when the owner switches it on): no button, no key handler and no code for anyone else.
 *
 * Each visual is { frames from a read-only route, a draw function }. The button is added to the card by a light observer, so boards that build
 * lazily (the Macro sections) still get theirs. REPLAY <visual> on the command line calls the same opener.
 */
import { openPlayer } from './replayPlayer.js';
import { VISUALS, vizByWord, curveBounds, curveCaption, niceDate, strengthFrames, strengthBound, strengthCaption, recentSessions, londonStamp, londonDay, STRENGTH_WINDOWS, fedFrames, fedCaption } from '../replayVizCore.js';
import { curveStage } from './replayCurveDraw.js';
import { strengthStage } from './replayStrengthDraw.js';
import { fedStage } from './replayFedDraw.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };

/** The player definition for one visual. `fetchJson` is injectable for tests. */
export function defFor(id, { fetchJson = J, now = () => Date.now() } = {}) {
  const v = VISUALS.find(x => x.id === id); if (!v) return null;
  if (id === 'curve') {
    return {
      id, title: 'The Treasury curve, day by day', note: 'Each frame is the official daily print dated that day (the Treasury publishes it the next business day). This describes how the curve moved; it does not say where it goes next, and the shape of the curve as a predictor is a tested null on this desk.',
      load: async () => { const r = await fetchJson(v.route); return { frames: r.frames, wanted: { from: new Date(Date.parse(`${r.asOf}T00:00:00Z`) - (r.days ?? 90) * 864e5).toISOString().slice(0, 10) }, extra: { bounds: curveBounds(r.frames) } }; },
      draw: (frames, i, { reduced, extra }) => curveStage(frames, i, { bounds: extra.bounds, reduced }),
      caption: (frames, i) => curveCaption(frames, i),
      label: (f, i, n) => `${niceDate(f.t)} · day ${i + 1} of ${n}`,
    };
  }
  if (id === 'strength') {
    const days = recentSessions(now(), 5);
    return {
      id, title: 'Currency strength through a London session', note: 'Each step is rebuilt with the engine of the live board from only the bars that had finished by then, so nothing from later leaks into an earlier step. It describes how the currencies moved; it does not say which way any pair goes next.',
      picks: [{ id: 'day', label: 'Session', reload: true, values: days.map(d => ({ v: d, label: londonDay(d) })) }, { id: 'hz', label: 'Window', values: STRENGTH_WINDOWS.map(w => ({ v: w, label: w })) }],
      load: async picks => { const r = await fetchJson(v.route + encodeURIComponent(picks.day)); const x = strengthFrames(r); return { frames: x.frames, extra: { ccys: x.ccys, dropped: x.dropped, stepMs: x.stepMs, day: picks.day } }; },
      coverage: (frames, r) => `${frames.length} steps of ${Math.round((r.extra.stepMs ?? 9e5) / 60e3)} minutes, ${londonStamp(frames[0].t)} to ${londonStamp(frames[frames.length - 1].t)}.${r.extra.dropped ? ` ${r.extra.dropped} step${r.extra.dropped === 1 ? '' : 's'} could not be built and ${r.extra.dropped === 1 ? 'is' : 'are'} skipped, not filled.` : ''}`,
      draw: (frames, i, { reduced, extra, picks }) => strengthStage(frames, i, picks.hz, extra.ccys, { reduced, bound: strengthBound(frames, picks.hz) }),
      caption: (frames, i, extra, picks) => strengthCaption(frames, i, picks.hz, extra.ccys),
      label: (f, i, n, picks) => `${londonStamp(f.t)} · step ${i + 1} of ${n} · ${picks.hz}`,
    };
  }
  if (id === 'fedpath') {
    return {
      id, title: 'The priced Fed path, day by day', note: 'Odds for the 3-month average rate over a forward window (Atlanta Fed tracker, CME 3-month SOFR options), not for a meeting, and not the same instrument as CME FedWatch. The store keeps the last 180 trading days of four windows; the per-meeting strip from the futures has only a few lookback copies, so it is not replayed. It describes how the priced path moved; the 15-minute lead of the Fed path is a banked null.',
      load: async () => { const r = fedFrames(await fetchJson(v.route)); if (!r.ok) throw new Error(r.error); return { frames: r.frames, extra: { windows: r.windows } }; },
      coverage: frames => `${frames.length} trading days, ${niceDate(frames[0].t)} to ${niceDate(frames[frames.length - 1].t)}: four windows from the Atlanta Fed store (it keeps the most recent 180 days, so nothing earlier is held here).`,
      draw: (frames, i, { reduced }) => fedStage(frames, i, { reduced }),
      caption: (frames, i) => fedCaption(frames, i),
      label: (f, i, n) => `${niceDate(f.t)} · day ${i + 1} of ${n}`,
    };
  }
  return null;
}

export function mountReplayViz({ doc = document, win = window, fetchJson = J } = {}) {
  if (!doc.body || doc.body.dataset?.rpvMounted) return null;
  if (doc.body.dataset) doc.body.dataset.rpvMounted = '1';
  const open = (id, opener = null) => {
    const def = defFor(id, { fetchJson }); if (!def) return false;
    openPlayer(def, { doc, win, opener }); return true;
  };
  let scheduled = false;
  function decorate() {
    scheduled = false;
    for (const v of VISUALS) {
      for (const root of doc.querySelectorAll(`[data-surface="${v.surface}"]`)) {
        for (const card of root.querySelectorAll('.card')) {
          if (card.querySelector('[data-rpviz]')) continue;
          const lbl = card.querySelector('.ch .lbl'); if (!lbl) continue;
          const lt = String(lbl.textContent).trim(); if (v.cardLabel ? lt !== v.cardLabel : !new RegExp(v.cardRe).test(lt)) continue;
          const head = card.querySelector('.ch'); if (!head) continue;
          const tmp = doc.createElement('span');
          tmp.innerHTML = `<button type="button" class="btn rpv-open" data-rpviz="${v.id}" data-noexport data-surface="widget.replayviz" title="Replay ${v.what.replace(/"/g, '')}" aria-label="Replay: ${v.name}">▶ Replay</button>`;
          const b = tmp.querySelector('button'); if (b) head.appendChild(b);
        }
      }
    }
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null;
  obs?.observe?.(doc.body, { childList: true, subtree: true });
  const onClick = e => { const b = e.target.closest?.('[data-rpviz]'); if (b) open(b.dataset.rpviz, b); };
  doc.addEventListener('click', onClick);
  decorate();
  win.deskReplayViz = { open: id => open(vizByWord(id)?.id ?? id), ids: () => VISUALS.map(v => v.id) };
  return { open, decorate, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.querySelectorAll('[data-rpviz]').forEach(b => b.remove()); doc.getElementById('rpv-back')?.remove(); delete doc.body.dataset.rpvMounted; delete win.deskReplayViz; } };
}
