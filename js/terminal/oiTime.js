/**
 * OI over time (Desk Terminal, preview): three views of the stored option-OI captures, played with the shared replay player (js/terminal/replayPlayer.js).
 *   terrain  each day's strike profile (calls right, puts left), max pain, gamma flip and the day's price on one axis; or, within a day, the 15-minute path against that day's capture
 *   walk     one level held fixed from a start day, followed as its expiry nears, with touches and the real-versus-mirrored tally
 *   gauge    the Options tab's calls-against-puts dial, day by day, tinted by what price did
 * Data: /api/replay/oi-days (js/oiTimeRoutes.js), and for within-a-day /api/replay/day. Mounted by terminalFeel.js when the registry says the session may see `widget.oitime`
 * (the owner always; a desk login only when switched on). Buttons sit on the OI terrain card (Options tab); OITIME <terrain|walk|gauge> <market> [date] on the command line.
 */
import { openPlayer } from './replayPlayer.js';
import { terrainStage, walkStage, gaugeStage } from './oiTimeDraw.js';
import { INSTRUMENTS } from '../replayCore.js';
import { recentSessions, londonDay, niceDate } from '../replayVizCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { GHOST_MARKETS, hmOf } from '../ghostWalkCore.js';
import { dayFrames, terrainScale, terrainCaption, LEVEL_KINDS, walkLevel, tally, tallySentence, walkCaption, gaugeFrames, gaugeCaption, coverage, HORIZON, fin } from '../oiTimeCore.js';

const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const label = k => INSTRUMENTS[k]?.label ?? k;
export const VIEWS = [
  { id: 'terrain', words: ['terrain', 'profile', 'strikes'], name: 'OI terrain over time', short: 'OI over time', what: 'each day\'s option strike profile (calls right, puts left) with max pain, the gamma flip and price on one axis, day by day, or within a day by the 15-minute price path' },
  { id: 'walk', words: ['walk', 'level', 'expiry', 'dte'], name: 'Level walk', short: 'Level walk', what: 'one level (a big strike, max pain or the gamma flip) held fixed from a start day and followed as its expiry nears, with price over it, the touches and the real-against-mirrored tally' },
  { id: 'gauge', words: ['gauge', 'speedometer', 'dial', 'putcall'], name: 'OI gauge', short: 'OI gauge', what: 'the calls-against-puts dial day by day, tinted by what price did that day, with a strip of daily moves (CME option open interest, not COT)' },
];
export const viewByWord = w => { const k = String(w ?? '').toLowerCase(); return VIEWS.find(v => v.id === k || v.words.includes(k)) ?? null; };

/** What the Evidence Book already says about these levels, as small chips. */
export function evidenceChips(book = DESK_EVIDENCE) {
  const want = [['wall-placebo', 'walls against a mirrored placebo'], ['oi-max-pain', 'max pain'], ['wall-dte-style-h1', 'near and far expiry walls']];
  return want.map(([id, what]) => { const e = (book ?? []).find(x => x.id === id); return e ? `<span class="chip" title="Evidence Book: ${e.id} (${e.verdict})">${what}: ${String(e.verdict).toUpperCase()}</span>` : ''; }).filter(Boolean);
}

const held = new Map();
export const resetOiCache = () => held.clear();
/** The days for one market, kept for half an hour per page (the route is cached on the server for hours): switching views or sessions does not fetch again. */
async function daysOf(inst, fetchJson, now = Date.now()) {
  const c = held.get(inst);
  if (c && now - c.at < 30 * 60e3) { try { return await c.p; } catch { held.delete(inst); } }
  const p = fetchJson(`/api/replay/oi-days?inst=${encodeURIComponent(inst)}`); held.set(inst, { at: now, p });
  try { return await p; } catch (e) { held.delete(inst); throw e; }
}
const marketPick = first => ({ id: 'inst', label: 'Market', reload: true, values: [first, ...GHOST_MARKETS.filter(k => k !== first)].map(k => ({ v: k, label: label(k) })) });
const cov = (p, what) => { const c = coverage(p.days); return `${c.n} daily captures of option-OI for ${p.label}, ${niceDate(c.from)} to ${niceDate(c.to)} (${p.captureDates ?? c.n} capture dates filed; weekends skipped; ${c.withPrice} with a price candle). ${what}`; };
const tooFew = (p, need) => { if ((p.days?.length ?? 0) < need) throw new Error(`only ${p.days?.length ?? 0} daily captures are held for ${p.label ?? 'this market'}, too few to replay`); };

/** Within-a-day frames: one per 15 minutes from the one-minute bars of a London session (each step uses only bars finished by then), plus the 5-minute path. */
export function intradayFrames(day) {
  const bars = day?.bars ?? [], win = day?.win; if (!bars.length || !win) return { frames: [], path: [] };
  const STEP = 15 * 60e3, frames = []; let i = 0, last = null;
  const open = bars[0][0];
  for (let ts = Math.ceil((open + 60e3) / STEP) * STEP; ts <= Math.min(win.end, bars[bars.length - 1][0] + 60e3); ts += STEP) {
    while (i < bars.length && bars[i][0] + 60e3 <= ts) last = bars[i++];
    if (last) frames.push({ t: ts, data: { x: ts - win.start, price: last[4] } });
  }
  const path = []; let nextP = open; for (const b of bars) if (b[0] >= nextP) { path.push([b[0] - win.start, b[4]]); nextP = b[0] + 5 * 60e3; }
  return { frames, path };
}
function intradayCaption(frames, k, extra) {
  const f = frames?.[k], d = extra.days[extra.dayIndex]; if (!f) return '';
  const lv = [...d.calls.map(w => ({ n: 'call strike', k: w.k })), ...d.puts.map(w => ({ n: 'put strike', k: w.k })), { n: 'max pain', k: d.maxPain }, { n: 'gamma flip', k: d.gammaFlip }].filter(l => fin(l.k));
  const above = lv.filter(l => l.k >= f.data.price).sort((a, b) => a.k - b.k)[0], below = lv.filter(l => l.k < f.data.price).sort((a, b) => b.k - a.k)[0], dp = extra.dp ?? 2;
  const px = v => Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${hmOf(f.data.x)} London: ${extra.label} is at ${px(f.data.price)}. Against this day's capture the nearest level above is ${above ? `the ${above.n} at ${px(above.k)}` : 'none in the picture'} and below ${below ? `the ${below.n} at ${px(below.k)}` : 'none in the picture'}. Where price is against the levels, not where it will go.`;
}

export function defFor(id, inst0, date0, { fetchJson = J, now = () => Date.now() } = {}) {
  const first = GHOST_MARKETS.includes(inst0) ? inst0 : 'NQ';
  if (id === 'terrain') {
    const days = recentSessions(now(), 8);
    return {
      id: 'oi-terrain', title: 'The option strike profile through time',
      note: 'Left: the 8 biggest call strikes (right of the centre line) and put strikes (left) from each day\'s stored capture, bar length in contracts on one scale for the whole replay; max pain, the gamma flip and the first GEX flip as lines; price on the same axis. By day: that day\'s capture with the last 20 daily candles and the trail of max pain and the flip. Within a day: the 15-minute price path against that day\'s capture. The archive keeps only the 8 biggest strikes per side, not the whole ladder. It describes where price was against the levels; walls were tested and found no pull (Evidence Book).',
      picks: [marketPick(first), { id: 'mode', label: 'Step', reload: true, values: [{ v: 'day', label: 'By day' }, { v: 'intraday', label: 'Within a day' }] }, { id: 'day', label: 'Session (within a day)', reload: true, values: [...new Set(date0 ? [date0, ...days] : days)].map(d => ({ v: d, label: londonDay(d) })) }],
      load: async picks => {
        const p = await daysOf(picks.inst, fetchJson); tooFew(p, 5);
        const scale = terrainScale(p.days), base = { days: p.days, scale, dp: p.dp, label: p.label, evChips: evidenceChips() };
        if (picks.mode === 'intraday') {
          const idx = p.days.findIndex(d => d.date === picks.day); if (idx < 0) throw new Error(`no option-OI capture is held for ${picks.day}: the captures start on ${niceDate(p.first)}`);
          const day = await fetchJson(`/api/replay/day?inst=${encodeURIComponent(picks.inst)}&date=${encodeURIComponent(picks.day)}`), r = intradayFrames(day);
          if (!r.frames.length) throw new Error(`no price bars are held for ${picks.day}`);
          return { frames: r.frames, extra: { ...base, mode: 'intraday', dayIndex: idx, focus: { path: r.path } }, coverage: `${r.frames.length} steps of 15 minutes of ${picks.day}, from the one-minute bars, against that day's capture (the ${p.days[idx].asOf ?? 'previous settlement'} book). ${cov(p, '')}` };
        }
        return { frames: dayFrames(p.days), extra: { ...base, mode: 'day' }, coverage: cov(p, 'One frame per day.') };
      },
      coverage: (frames, r) => r.coverage,
      draw: (frames, i, { reduced, extra }) => terrainStage(frames, i, extra, { reduced }),
      caption: (frames, i, extra) => (extra.mode === 'intraday' ? intradayCaption(frames, i, extra) : terrainCaption(extra.days, frames[i]?.data.i, { label: extra.label, dp: extra.dp })),
      label: (f, i, n, picks) => (picks.mode === 'intraday' ? `${hmOf(f.data.x)} London · ${picks.day} · step ${i + 1} of ${n}` : `${niceDate(String(f.t).slice(0, 10))} · day ${i + 1} of ${n}`),
    };
  }
  if (id === 'walk') {
    return {
      id: 'oi-walk', title: 'A fixed level followed as its expiry nears',
      note: 'Pick a level as it stood on a start day (the biggest call or put strike, max pain or the gamma flip) and hold it fixed. Each later session shows price against it, the days to the primary expiry on that day\'s capture (counting down), the contracts still at about that strike, and the distance in average daily ranges. Only days after the start day count as touches. Beside it is the tally over every start day held: the real level against the same distance on the other side of the start price, which is what chance gives. The archive keeps the primary expiry only, so there is no ladder by expiry band. This is context: walls were tested against a mirrored placebo and showed no pull.',
      picks: [marketPick(first), { id: 'kind', label: 'Level', reload: true, values: LEVEL_KINDS.map(k => ({ v: k.v, label: k.label })) }, { id: 'start', label: 'Start day', reload: true, values: [{ v: 'auto', label: 'Latest full walk' }, { v: 'prev', label: 'The one before' }, { v: 'prev2', label: 'Two before' }, { v: 'prev3', label: 'Three before' }] }],
      load: async picks => {
        const p = await daysOf(picks.inst, fetchJson); tooFew(p, HORIZON + 6);
        const eligible = p.days.map((d, i) => i).filter(i => i + HORIZON < p.days.length && p.days.slice(i + 1, i + 1 + HORIZON).every(d => d.px) && fin(p.days[i].spot));
        const back = { auto: 0, prev: 1, prev2: 2, prev3: 3 }[picks.start] ?? 0, i = eligible[eligible.length - 1 - back];
        if (i == null) throw new Error('no start day has a full eight-session follow-up yet');
        const walk = walkLevel(p.days, i, picks.kind); if (!walk) throw new Error(`the ${picks.kind} level is not held for ${p.days[i].date}`);
        const t = tally(p.days), kindLabel = LEVEL_KINDS.find(k => k.v === picks.kind).label;
        const frames = [{ t: `${walk.start.date}T12:00:00Z`, data: { step: 0 } }, ...walk.steps.map((s, j) => ({ t: `${s.date}T12:00:00Z`, data: { step: j + 1 } }))];
        return { frames, extra: { walk, tally: t, tallyText: tallySentence(t), dp: p.dp, label: p.label, kindLabel, evChips: evidenceChips() }, coverage: cov(p, `${eligible.length} start days have a full eight-session follow-up; this one starts ${niceDate(walk.start.date)}.`) };
      },
      coverage: (frames, r) => r.coverage,
      draw: (frames, i, { reduced, extra }) => walkStage(frames, i, extra, { reduced }),
      caption: (frames, i, extra) => walkCaption(extra.walk, i - 1),
      label: (f, i, n) => `${niceDate(String(f.t).slice(0, 10))} · ${i === 0 ? 'start' : `session ${i} of ${n - 1}`}`,
    };
  }
  if (id === 'gauge') {
    return {
      id: 'oi-gauge', title: 'The calls-against-puts gauge through time',
      note: 'The dial the Options tab draws (needle at the puts\' share of option open interest), one frame per daily capture, the frame outlined green or red by whether price rose or fell that day, with a strip of daily price changes behind it. It is CME option open interest, not COT. It describes how the positioning looked and what price did; it is not a signal.',
      picks: [marketPick(first)],
      load: async picks => { const p = await daysOf(picks.inst, fetchJson); tooFew(p, 5); const frames = gaugeFrames(p.days); if (frames.length < 5) throw new Error('too few days with a put/call ratio are held'); return { frames, extra: { label: p.label }, coverage: cov(p, 'One frame per day.') }; },
      coverage: (frames, r) => r.coverage,
      draw: (frames, i) => gaugeStage(frames, i, {}, {}),
      caption: (frames, i, extra) => gaugeCaption(frames, i, extra),
      label: (f, i, n) => `${niceDate(f.data.date)} · day ${i + 1} of ${n}`,
    };
  }
  return null;
}

export function mountOiTime({ doc = document, win = window, fetchJson = J } = {}) {
  if (!doc.body || doc.body.dataset?.oitMounted) return null;
  if (doc.body.dataset) doc.body.dataset.oitMounted = '1';
  const open = (id, inst = null, date = null, opener = null) => {
    const v = viewByWord(id); if (!v) return false;
    const k = GHOST_MARKETS.includes(String(inst).toUpperCase()) ? String(inst).toUpperCase() : 'NQ';
    openPlayer(defFor(v.id, k, date, { fetchJson }), { doc, win, opener }); return true;
  };
  const instOfCard = () => {
    const t = String(doc.getElementById('tr-name')?.textContent ?? '').toLowerCase();
    return [['nq', 'NQ'], ['nasdaq', 'NQ'], ['s&p', 'SPX500'], ['(es)', 'SPX500'], ['russell', 'US2000'], ['dow', 'US30'], ['gold', 'GOLD'], ['eurusd', 'EURUSD'], ['gbpusd', 'GBPUSD'], ['usdjpy', 'USDJPY'], ['audusd', 'AUDUSD'], ['usdcad', 'USDCAD'], ['usdchf', 'USDCHF']].find(([w]) => t.includes(w))?.[1] ?? 'NQ';
  };
  const onClick = e => { const b = e.target.closest?.('[data-oit-open]'); if (b) open(b.dataset.oitOpen, instOfCard(), null, b); };
  let scheduled = false;
  function decorate() {
    scheduled = false;
    const card = doc.getElementById('tr-card'); if (!card || card.querySelector('[data-oit-open]')) return;
    const row = card.querySelector('#tr-name')?.parentElement ?? card.firstElementChild; if (!row) return;
    const tmp = doc.createElement('span');
    tmp.innerHTML = VIEWS.map(v => `<button type="button" class="btn rpv-open gw-open" data-oit-open="${v.id}" data-noexport data-surface="widget.oitime" title="Replay ${v.what.replace(/"/g, '')}" aria-label="${v.name}">▶ ${v.short}</button>`).join('');
    for (const b of [...tmp.querySelectorAll('button')]) row.appendChild(b);
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null;
  obs?.observe?.(doc.body, { childList: true, subtree: true });
  doc.addEventListener('click', onClick);
  decorate();
  win.deskOiTime = { open, views: () => VIEWS.map(v => v.id) };
  return { open, decorate, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.querySelectorAll('[data-oit-open]').forEach(b => b.remove()); doc.getElementById('rpv-back')?.remove(); delete doc.body.dataset.oitMounted; delete win.deskOiTime; } };
}
