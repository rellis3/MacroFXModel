/**
 * Replay on one visualisation (Desk Terminal, preview): puts a small "Replay" button on the card of each replayable visual and opens the shared
 * player (js/terminal/replayPlayer.js) with that visual's own history. Mounted by terminalFeel.js only when the registry says the session may see
 * `widget.replayviz` (the owner always; a desk login only when the owner switches it on): no button, no key handler and no code for anyone else.
 *
 * Each visual is { frames from a read-only route, a draw function }. The button is added to the card by a light observer, so boards that build
 * lazily (the Macro sections) still get theirs. REPLAY <visual> on the command line calls the same opener.
 */
import { openPlayer } from './replayPlayer.js';
import { VISUALS, vizByWord, curveBounds, curveCaption, niceDate } from '../replayVizCore.js';
import { curveStage } from './replayCurveDraw.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };

/** The player definition for one visual. `fetchJson` is injectable for tests. */
export function defFor(id, { fetchJson = J } = {}) {
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
          const lbl = card.querySelector('.ch .lbl'); if (!lbl || String(lbl.textContent).trim() !== v.cardLabel) continue;
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
