/**
 * Ghost walk (Desk Terminal, preview): the shared replay player (js/terminal/replayPlayer.js) fed by /api/replay/ghosts. One London day of one market in units of its own
 * forecast median range from the open, over the faint paths of earlier days, with the day's option levels from the time they were saved and a ring where price touched
 * one. Mounted by terminalFeel.js only when the registry says the session may see `widget.ghostwalk` (the owner always; a desk login only when switched on).
 *
 *   GHOST <market> [date] on the command line, a "Ghost walk" button on the OI terrain card (Options tab), or window.deskGhostWalk.open(inst, date).
 * The pure parts (units, ghosts, touches, words) are in js/ghostWalkCore.js and the picture is js/terminal/ghostWalkDraw.js; this file only joins them to the player.
 */
import { openPlayer } from './replayPlayer.js';
import { ghostStage } from './ghostWalkDraw.js';
import { INSTRUMENTS, londonDate } from '../replayCore.js';
import { recentSessions, londonDay, niceDate } from '../replayVizCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { GHOST_MARKETS, GHOST_FILTERS, MIN_GHOSTS, selectGhosts, makeFrames, bandAt, levelLines, touchTimes, touchSummary, touchSentence, coverageOf, captionFor, hmOf, ghostCsv, STEP_MS, fin } from '../ghostWalkCore.js';
import { chartToPng, saveBlob } from './exportView.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const label = k => INSTRUMENTS[k]?.label ?? k;
const pxF = (v, dp) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');

/** What the Evidence Book already says about these levels, as small chips (read from the book itself, so a changed verdict changes the chip). */
export function evidenceChips(book = DESK_EVIDENCE) {
  const want = [['wall-placebo', 'walls against a mirrored placebo'], ['oi-max-pain', 'max pain'], ['gex-range-es', 'gamma and the size of the day (S&P)']];
  return want.map(([id, what]) => { const e = (book ?? []).find(x => x.id === id); return e ? `<span class="chip" title="Evidence Book: ${e.id} (${e.verdict})">${what}: ${String(e.verdict).toUpperCase()}</span>` : ''; }).filter(Boolean);
}

/** The market a terrain card heading names ("Nasdaq (NQ)", "Gold", "EURUSD"...) -> a desk key, or null. */
export function instFromLabel(text) {
  const t = String(text ?? '').toLowerCase();
  const pairs = [['nq', 'NQ'], ['nasdaq', 'NQ'], ['s&p', 'SPX500'], ['(es)', 'SPX500'], ['russell', 'US2000'], ['rty', 'US2000'], ['dow', 'US30'], ['(ym)', 'US30'], ['gold', 'GOLD'], ['eurusd', 'EURUSD'], ['gbpusd', 'GBPUSD'],
    ['usdjpy', 'USDJPY'], ['audusd', 'AUDUSD'], ['usdcad', 'USDCAD'], ['usdchf', 'USDCHF']];
  return pairs.find(([w]) => t.includes(w))?.[1] ?? null;
}

/** The player definition. `fetchJson` is injectable for tests. inst0 and date0 come first in their pick lists so the window opens on them. */
export function ghostDef(inst0, date0, { fetchJson = J, now = () => Date.now() } = {}) {
  const today = londonDate(now()), first = GHOST_MARKETS.includes(inst0) ? inst0 : 'NQ';
  const dates = [today, ...recentSessions(now(), 8)];
  if (date0 && !dates.includes(date0)) dates.unshift(date0);
  const dayVals = [...new Set(date0 ? [date0, ...dates] : dates)].map(d => ({ v: d, label: d === today ? `${londonDay(d)} (today, so far)` : londonDay(d) }));
  const held = new Map();
  return {
    id: 'ghost', title: 'Ghost walk: a day against its own expected range',
    note: 'One unit is the day\'s archived forecast median high-low range, so +1 means price is a whole median day above its London open. The faint paths are earlier days only, in the same units; the band is the middle 80% of them and the dashed line their median. The option levels appear when their capture was saved, and a ring marks a touch. Beside the touch count is the same levels mirrored through the open, which is what chance alone gives. This describes where price has been against the levels; it does not say where it will go.',
    picks: [{ id: 'inst', label: 'Market', reload: true, values: [first, ...GHOST_MARKETS.filter(k => k !== first)].map(k => ({ v: k, label: label(k) })) },
      { id: 'day', label: 'Session', reload: true, values: dayVals }, { id: 'flt', label: 'Ghosts', reload: true, values: GHOST_FILTERS.map(f => ({ v: f.v, label: f.label })) }],
    load: async function this_load(picks) {
      const key = `${picks.inst}|${picks.day}`;
      const p = held.get(key) ?? await fetchJson(`/api/replay/ghosts?inst=${encodeURIComponent(picks.inst)}&date=${encodeURIComponent(picks.day)}`); held.set(key, p);
      const cov = coverageOf(p), focus = (p.days ?? []).find(d => d.date === picks.day);
      // today, early in the London day (or with no forecast yet), may have too little to draw: show the last complete session instead, and say so
      if (!focus && picks.day === today) {
        const last = [...(p.days ?? [])].reverse().find(d => d.date < today && !d.partial);
        if (last) { picks.day = last.date; const r = await this_load(picks); return { ...r, coverage: `Today has too few bars or no forecast yet, so the last complete session (${last.date}) is shown. ${r.coverage}` }; }
      }
      if (!focus) {
        const why = !cov.from ? 'no option-OI captures are held for this market yet' : picks.day < cov.from ? `the option-OI capture only starts on ${niceDate(cov.from)}` : `no forecast was archived in the first hour of ${picks.day} (the forecast is made around midnight), or too few bars`;
        throw new Error(`there is no ghost walk for ${label(picks.inst)} on ${picks.day}: ${why}`);
      }
      const sel = selectGhosts(p.days, focus, picks.flt), ghostsOn = sel.enough;
      const frames = makeFrames(focus, ghostsOn ? sel.ghosts : []);
      const bandSeries = []; if (ghostsOn) for (let x = 0; x <= 24 * 3600e3; x += STEP_MS) { const b = bandAt(sel.ghosts, x); if (b.med != null) bandSeries.push({ x, ...b }); }
      const lines = levelLines(focus), touchAt = touchTimes(focus), summary = touchSummary(p.days, { upTo: focus.date });
      const unitPts = focus.open * focus.unitPct / 100;
      const noGhostsWhy = sel.pool < MIN_GHOSTS ? `only ${sel.pool} earlier days held` : `only ${sel.n} ${sel.label}`;
      const oiLine = focus.oi ? `levels: capture of ${focus.oi.asOf ?? focus.oi.date ?? 'an earlier day'}, from ${hmOf(Math.max(0, focus.oi.savedX))} London${focus.oi.stale ? ' (an old capture)' : ''}` : null;
      const extra = { focus, ghosts: sel.ghosts, ghostsOn, filterLabel: sel.label, noGhostsWhy, bandSeries, lines, touchAt, levelsFrom: Math.max(focus.openX ?? 0, focus.oi?.savedX ?? 0), dp: p.dp, label: p.label, unitPct: focus.unitPct, unitPts,
        touchText: touchSentence(summary), oiLine, evChips: evidenceChips(), cov, summary, inst: picks.inst };
      current = { focus, extra };
      return { frames, extra, wanted: null,
        coverage: `${cov.oiDays} days of option-OI held for ${p.label}, from ${niceDate(cov.from)}: the walk only goes back as far as that capture. ${sel.pool} earlier days could be ghosts (${cov.dropped?.['no-forecast'] ?? 0} dropped for no forecast in the first hour of the day, ${cov.dropped?.['few-bars'] ?? 0} for thin bars). ${frames.length} steps of 15 minutes.${ghostsOn ? '' : ` No ghosts are drawn: ${noGhostsWhy}, and a handful of paths is an anecdote, not a spread.`}` };
    },
    coverage: (frames, r) => r.coverage,
    draw: (frames, i, { reduced, extra }) => ghostStage(frames, i, extra, { reduced }),
    caption: (frames, i, extra) => captionFor(frames, i, extra),
    label: (f, i, n, picks) => `${hmOf(f.data.x)} London · ${picks.day} · step ${i + 1} of ${n}`,
  };
}

let current = null;   // { focus, extra } of the window that is open (for the CSV and PNG buttons)

export function mountGhostWalk({ doc = document, win = window, fetchJson = J } = {}) {
  if (!doc.body || doc.body.dataset?.gwMounted) return null;
  if (doc.body.dataset) doc.body.dataset.gwMounted = '1';
  const open = (inst, date = null, opener = null) => {
    const k = GHOST_MARKETS.includes(String(inst ?? '').toUpperCase()) ? String(inst).toUpperCase() : 'NQ';
    openPlayer(ghostDef(k, date, { fetchJson }), { doc, win, opener }); return true;
  };
  const note = text => { const b = doc.getElementById('ex-note'); if (b) { b.textContent = text; b.hidden = false; win.setTimeout?.(() => { b.hidden = true; }, 4000); } };
  async function onClick(e) {
    const o = e.target.closest?.('[data-gw-open]'); if (o) { open(instFromLabel(doc.getElementById('tr-name')?.textContent), null, o); return; }
    const b = e.target.closest?.('[data-gw-ex]'); if (!b || !current) return;
    if (b.dataset.gwEx === 'csv') { const ok = saveBlob(new win.Blob([ghostCsv(current.focus, current.extra)], { type: 'text/csv;charset=utf-8' }), `ghost-walk-${current.extra.inst}-${current.focus.date}.csv`, doc, win); note(ok ? 'Saved the day as a CSV.' : 'The browser blocked the download.'); return; }
    const svg = doc.querySelector('#rpv-stage .gw-svg'); const blob = svg ? await chartToPng(svg, win, doc) : null;
    if (!blob) { note('That chart could not be turned into an image here.'); return; }
    const ok = saveBlob(blob, `ghost-walk-${current.extra.inst}-${current.focus.date}.png`, doc, win); note(ok ? 'Saved the chart as a PNG.' : 'The browser blocked the download.');
  }
  let scheduled = false;
  function decorate() {
    scheduled = false;
    const card = doc.getElementById('tr-card'); if (!card || card.querySelector('[data-gw-open]')) return;
    const row = card.querySelector('#tr-name')?.parentElement ?? card.firstElementChild; if (!row) return;
    const tmp = doc.createElement('span');
    tmp.innerHTML = '<button type="button" class="btn rpv-open gw-open" data-gw-open data-noexport data-surface="widget.ghostwalk" title="Play this market\'s day against its own expected range, over the paths of earlier days, with these option levels" aria-label="Ghost walk">▶ Ghost walk</button>';
    const b = tmp.querySelector('button'); if (b) row.appendChild(b);
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null;
  obs?.observe?.(doc.body, { childList: true, subtree: true });
  doc.addEventListener('click', onClick);
  decorate();
  win.deskGhostWalk = { open, markets: () => GHOST_MARKETS.slice() };
  return { open, decorate, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.querySelectorAll('[data-gw-open]').forEach(b => b.remove()); doc.getElementById('rpv-back')?.remove(); delete doc.body.dataset.gwMounted; delete win.deskGhostWalk; } };
}
