/**
 * IV smile replay (Desk Terminal, preview): the shared replay player (js/terminal/replayPlayer.js) fed by /api/replay/smile. The implied-vol smile of a symbol's nearest expiries from the Cboe chains
 * the server keeps, day by day (end-of-day chains since 16 Oct 2026) or within a day (15-minute chains for SPX, NDX, SPY and QQQ since 1 Nov 2026). It describes the quoted smile and how it changed;
 * it never says where price goes. Mounted by terminalFeel.js only when the registry says the session may see `widget.smile`. SMILE [symbol] [intraday] on the command line, or a button on the OI terrain card.
 * Pure parts: js/smileCore.js and js/terminal/smileDraw.js.
 */
import { openPlayer } from './replayPlayer.js';
import { smileStage } from './smileDraw.js';
import { instFromLabel } from './ghostWalk.js';
import { chartToPng, saveBlob } from './exportView.js';
import * as S from '../smileCore.js';
import { SYMS, INTRA_SYMS, SYM_OF_INST, symFromWord } from '../smileCore.js';
export { SYMS, INTRA_SYMS, SYM_OF_INST, symFromWord };

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const heldCache = new Map();
async function held(sym, fetchJson) { if (!heldCache.has(sym)) heldCache.set(sym, fetchJson(`/api/replay/smile?sym=${sym}`).catch(e => { heldCache.delete(sym); throw e; })); return heldCache.get(sym); }
export const resetCache = () => heldCache.clear();

/** The player definition. `h` is the held answer for the first symbol (so the day pick has values); fetchJson is injectable. */
export function smileDef(sym0, mode0, h, { fetchJson = J } = {}) {
  const sym = SYMS.includes(sym0) ? sym0 : 'SPX', idays = (h?.intraday ?? []).slice().reverse();
  const dayVals = (idays.length ? idays : ['']).map(d => ({ v: d, label: d ? S.niceDay(d) : 'no 15-minute days' }));
  const first = Math.max(0, dayVals.findIndex(x => x.v)), ordered = [dayVals[first], ...dayVals.filter((_, i) => i !== first)];
  return {
    id: 'smile', title: 'IV smile: the quoted vol by strike, through time',
    note: 'Implied vol from Cboe\'s own chain, out-of-the-money options only (puts below spot, calls above), averaged into 0.5% buckets, for the nearest expiries. The faint dashed line is the same expiry one step earlier. It shows how the quoted smile looked and changed, not where price goes.',
    picks: [{ id: 'sym', label: 'Symbol', reload: true, values: [sym, ...SYMS.filter(k => k !== sym)].map(k => ({ v: k, label: k })) },
      { id: 'mode', label: 'Steps', reload: true, values: (mode0 === 'intraday' ? [['intraday', 'Within a day (15 minutes)'], ['eod', 'Day by day (end of day)']] : [['eod', 'Day by day (end of day)'], ['intraday', 'Within a day (15 minutes)']]).map(([v, label]) => ({ v, label })) },
      { id: 'day', label: 'Day (within a day)', reload: true, values: ordered }],
    load: async p => {
      const hs = await held(p.sym, fetchJson);
      let frames = [], skipped = 0;
      if (p.mode === 'intraday') {
        if (!INTRA_SYMS.includes(p.sym)) throw new Error(`15-minute chains are only kept for ${INTRA_SYMS.join(', ')}, not ${p.sym}`);
        if (!p.day || !hs.intraday.includes(p.day)) throw new Error(`no 15-minute chains are held for ${p.sym} on ${p.day || 'that day'}`);
        const j = await fetchJson(`/api/replay/smile?sym=${p.sym}&date=${p.day}&mode=intraday`);
        frames = (j.frames ?? []).map(f => ({ ...f, label: `${S.hhmm(Date.parse(f.t))} UTC` }));
      } else {
        const days = hs.days;
        for (let i = 0; i < days.length; i += 4) {
          const got = await Promise.all(days.slice(i, i + 4).map(d => fetchJson(`/api/replay/smile?sym=${p.sym}&date=${d}`).then(j => ({ ...j.frames[0], label: S.niceDay(d), day: d })).catch(() => null)));
          for (const g of got) g ? frames.push(g) : skipped++;
        }
      }
      frames = frames.filter(f => f.curves?.length); if (frames.length < 2) throw new Error(`too few ${p.mode === 'intraday' ? '15-minute' : 'end-of-day'} chains with a drawable smile are held for ${p.sym} to replay (${frames.length})`);
      const y = S.yRange(frames), extra = { sym: p.sym, y, mode: p.mode };
      current = { frames, extra };
      return { frames: frames.map((f, i) => ({ t: i, data: f })), extra, wanted: null,
        coverage: `${S.coverageText({ sym: p.sym, days: hs.days, intraday: hs.intraday })}${skipped ? ` ${skipped} day${skipped === 1 ? '' : 's'} could not be read and ${skipped === 1 ? 'is' : 'are'} skipped.` : ''} Showing ${frames.length} step${frames.length === 1 ? '' : 's'}.` };
    },
    coverage: (frames, r) => r.coverage,
    draw: (frames, i, { reduced, extra }) => smileStage(frames, i, extra, { reduced }),
    caption: (frames, i, extra) => S.caption(frames[i].data, i > 0 ? frames[i - 1].data : null, frames[i].data.label),
    label: (f, i, n, picks) => `${f.data.label} · ${picks.sym} · step ${i + 1} of ${n}`,
  };
}
let current = null;

export function mountSmile({ doc = document, win = window, fetchJson = J } = {}) {
  if (!doc.body || doc.body.dataset?.smvMounted) return null;
  if (doc.body.dataset) doc.body.dataset.smvMounted = '1';
  const note = text => { const b = doc.getElementById('ex-note'); if (b) { b.textContent = text; b.hidden = false; win.setTimeout?.(() => { b.hidden = true; }, 4000); } };
  async function open(sym = 'SPX', mode = 'eod', opener = null) {
    try { const k = symFromWord(sym) ?? 'SPX', h = await held(k, fetchJson); openPlayer(smileDef(k, mode, h, { fetchJson }), { doc, win, opener }); return true; }
    catch (e) { note(`The IV smile replay could not open: ${e.message}`); return false; }
  }
  async function onClick(e) {
    const o = e.target.closest?.('[data-smv-open]'); if (o) { open(SYM_OF_INST[instFromLabel(doc.getElementById('tr-name')?.textContent)] ?? 'SPX', 'eod', o); return; }
    const b = e.target.closest?.('[data-smv-ex]'); if (!b || !current) return;
    if (b.dataset.smvEx === 'csv') { const ok = saveBlob(new win.Blob([S.csv(current.frames)], { type: 'text/csv;charset=utf-8' }), `iv-smile-${current.extra.sym}-${current.extra.mode}.csv`, doc, win); note(ok ? 'Saved the smiles as a CSV file.' : 'The browser blocked the download.'); return; }
    const svg = doc.querySelector('#rpv-stage .smv-svg'); const blob = svg ? await chartToPng(svg, win, doc) : null;
    if (!blob) { note('That chart could not be turned into an image here.'); return; }
    const ok = saveBlob(blob, `iv-smile-${current.extra.sym}-${current.extra.mode}.png`, doc, win); note(ok ? 'Saved the chart as a PNG.' : 'The browser blocked the download.');
  }
  let scheduled = false;
  function decorate() {
    scheduled = false;
    const card = doc.getElementById('tr-card'); if (!card || card.querySelector('[data-smv-open]')) return;
    const row = card.querySelector('#tr-name')?.parentElement ?? card.firstElementChild; if (!row) return;
    const tmp = doc.createElement('span');
    tmp.innerHTML = '<button type="button" class="btn rpv-open smv-open" data-smv-open data-noexport data-surface="widget.smile" title="Replay the implied-vol smile of this market\'s option chain, day by day or within a day, from the Cboe chains the server keeps">IV smile replay</button>';
    const b = tmp.querySelector('button'); if (b) row.appendChild(b);
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null; obs?.observe?.(doc.body, { childList: true, subtree: true });
  doc.addEventListener('click', onClick);
  decorate();
  win.deskSmile = { open, symbols: () => SYMS.slice() };
  return { open, decorate, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.querySelectorAll('[data-smv-open]').forEach(b => b.remove()); doc.getElementById('rpv-back')?.remove(); delete win.deskSmile; delete doc.body.dataset?.smvMounted; } };
}
