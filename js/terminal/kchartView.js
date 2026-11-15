// js/terminal/kchartView.js: the CHART tab, a KLineChart candle chart on OUR bars (/api/desk-bars) with built-in indicators (MA, EMA, BOLL, RSI, MACD), drawing tools and our own
// lines laid over it: the day's forecast lines, option walls within 3% of price, the session's high and low so far, and the dawn read as a chip. It sits BESIDE the terminal's own glow
// charts and replaces none of them. The pure half (bars, pinned library, indicators, levels, theme styles) is kchartCore.js.
//
// The library is loaded on first visit from a pinned jsDelivr URL with an integrity hash (KLINE in kchartCore.js): nothing downloads for a session that never opens the tab, and a
// changed file would not run. Colours are theme tokens read at draw time and repainted on 'themechange'. The linked selection (js/terminal/selectionCore.js) drives the market and
// the candle size when linking is on. A PREVIEW feature (registry id tab.kchart): js/terminal/terminalFeel.js only loads this file when the session may see that surface.
import { KLINE, INDICATORS, DRAWINGS, TOKENS, toKline, periodFor, precisionFor, newerThan, levelsFromDay, styleFor, indicatorById, drawingById, cleanSymbol } from './kchartCore.js';
import { mountTfBar } from './timeframePills.js';
import { ALL_INSTRUMENTS, instLabel } from './commandCore.js';
import { INSTRUMENTS as REPLAY_INSTRUMENTS, londonDate } from '../replayCore.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MAIN_PANE = 'candle_pane';
const LAST_KEY = 'deskKchartInst';

/** Load the pinned library once. Resolves to the library object, rejects with a plain message. */
export function loadKline(doc = document, win = window) {
  if (win.klinecharts) return Promise.resolve(win.klinecharts);
  return new Promise((res, rej) => {
    const s = doc.createElement('script');
    s.src = KLINE.url; s.integrity = KLINE.integrity; s.crossOrigin = 'anonymous'; s.async = true;
    s.onload = () => (win.klinecharts ? res(win.klinecharts) : rej(new Error('The chart library loaded but is empty.')));
    s.onerror = () => rej(new Error('The chart library could not be loaded (blocked, offline, or the file changed).'));
    doc.head.appendChild(s);
  });
}

export function mountKChart({ doc = document, win = window, fetchJson = null, loadLib = loadKline, store = null } = {}) {
  const sec = doc.getElementById('kchart');
  if (!sec || sec.dataset.mounted) return null;
  sec.dataset.mounted = '1';
  const ls = store ?? (() => { try { return win.localStorage ?? null; } catch { return null; } })();
  const getJson = fetchJson ?? (async url => { const r = await win.fetch(url, { credentials: 'same-origin' }); try { return await r.json(); } catch { return { ok: false, error: `The server answered ${r.status}.` }; } });
  const known = w => ALL_INSTRUMENTS.includes(w);
  const sel = () => win.deskSelection ?? null;
  const tc = n => win.themeColor?.(n) ?? win.getComputedStyle(doc.documentElement).getPropertyValue(`--${n}`).trim();
  const tokens = () => Object.fromEntries(TOKENS.map(k => [k, tc(k)]));

  sec.innerHTML = `<div class="kc-bar" role="toolbar" aria-label="Chart tools">
<label class="kc-l" for="kc-sym">Market</label><input id="kc-sym" list="kc-syms" autocomplete="off" spellcheck="false" maxlength="12"><datalist id="kc-syms">${ALL_INSTRUMENTS.map(k => `<option value="${k}">${esc(instLabel(k))}</option>`).join('')}</datalist>
<div id="kc-tf" class="kc-tf"></div>
<span class="kc-sep"></span>
<span class="kc-l">Indicators</span><span id="kc-ind" class="kc-ind">${INDICATORS.map(i => `<button type="button" class="btn" data-ind="${i.id}" aria-pressed="false" title="${esc(i.note)}">${esc(i.short)}</button>`).join('')}</span>
<span class="kc-sep"></span>
<label class="kc-l" for="kc-draw">Draw</label><select id="kc-draw"><option value="">Choose a tool…</option>${DRAWINGS.map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('')}</select><button type="button" class="btn" id="kc-clear">Clear drawings</button>
<span class="kc-sep"></span>
<button type="button" class="btn" id="kc-lv" aria-pressed="true" title="The day's forecast lines, option walls within 3% of price and the session range">Levels</button><button type="button" class="btn" id="kc-fit">Latest</button>
</div><div id="kc-info" class="kc-info" role="status" aria-live="polite"></div><div id="kc-chart" class="kc-chart"></div>
<p class="kc-foot muted">Candles are the terminal's own OANDA mid-price bars; they carry no volume. Lines are where price has been drawn to and how big the day is forecast to be, not which way it will go. Chart by KLineChart (Apache-2.0).</p>`;
  const $ = s => sec.querySelector(s);
  const symEl = $('#kc-sym'), infoEl = $('#kc-info'), box = $('#kc-chart');

  let K = null, chart = null, tfbar = null, open = false, inst = null, tfNow = null, pending = [], lastTs = null, subCb = null, ro = null, lvTimer = null, lvOn = true, lvSeq = 0, lvNote = '', dawn = '';
  const on = new Set();
  const say = t => { infoEl.textContent = t || ''; };
  const drawInfo = () => { infoEl.innerHTML = [dawn && `<span>${esc(dawn)}</span>`, lvNote && `<span class="muted">${esc(lvNote)}</span>`].filter(Boolean).join(' '); };

  // ── the chart ──
  function ensureChart() {
    if (chart) return true;
    K.registerOverlay({
      name: 'deskLevel', totalStep: 1, lock: true, needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates, bounding, overlay }) => {
        const y = coordinates?.[0]?.y; if (!Number.isFinite(y)) return [];
        const e = overlay.extendData ?? {};
        return [
          { type: 'line', attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] }, styles: { style: 'dashed', color: e.color, size: 1, dashedValue: [5, 4] } },
          { type: 'text', attrs: { x: bounding.width - 6, y: y - 3, text: e.label ?? '', align: 'right', baseline: 'bottom' }, styles: { color: e.color, size: 11, backgroundColor: 'transparent', borderSize: 0 } },
        ];
      },
    });
    chart = K.init(box, { locale: 'en-GB', timezone: 'Europe/London', styles: styleFor(tokens()) });
    if (!chart) return false;
    chart.setDataLoader({
      getBars: ({ type, callback }) => { if (type === 'init') { callback(pending, false); lastTs = pending.at(-1)?.timestamp ?? null; } else callback([], false); },
      subscribeBar: ({ callback }) => { subCb = callback; }, unsubscribeBar: () => { subCb = null; },
    });
    for (const id of on) addIndicator(id);
    if ('ResizeObserver' in win) { ro = new win.ResizeObserver(() => chart?.resize()); ro.observe(box); }
    return true;
  }
  function addIndicator(id) { const i = indicatorById(id); if (!i || !chart) return; chart.createIndicator(i.main ? { name: id, paneId: MAIN_PANE } : { name: id }, i.main); }
  function removeIndicator(id) { const i = indicatorById(id); if (i && chart) chart.removeIndicator(i.main ? { name: id, paneId: MAIN_PANE } : { name: id }); }

  // ── data ──
  function apply(bars, { tf, fit }) {
    const data = toKline(bars); if (!data.length || !chart) return;
    tfNow = tf;
    const sym = chart.getSymbol?.(), per = chart.getPeriod?.(), want = periodFor(tf);
    const same = sym?.ticker === inst && per?.type === want.type && per?.span === want.span;   // the library does not reload for an unchanged symbol and period: treat it as a refresh
    if (fit && !same) {
      pending = data;
      chart.setSymbol({ ticker: inst, pricePrecision: precisionFor(inst, data.at(-1).close), volumePrecision: 0 });
      chart.setPeriod(periodFor(tf));
      chart.scrollToRealTime(0);
      loadLevels();
      pending = data;
    } else if (subCb) { for (const b of newerThan(data, lastTs)) { subCb(b); lastTs = Math.max(lastTs ?? 0, b.timestamp); } if (fit) { chart.scrollToRealTime(0); loadLevels(); } pending = data; }
    else { pending = data; chart.setSymbol({ ticker: inst, pricePrecision: precisionFor(inst, data.at(-1).close), volumePrecision: 0 }); chart.setPeriod(want); }
  }
  function mountTf() {
    tfbar?.stop();
    const fresh = doc.createElement('div'); fresh.id = 'kc-tf'; fresh.className = 'kc-tf'; $('#kc-tf').replaceWith(fresh);   // a fresh host each time: the pills attach their listeners to it
    tfbar = mountTfBar(fresh, { family: 'kchart', inst, fetchJson: getJson, apply, onError: m => say(m) });
  }

  // ── our lines ──
  async function loadLevels() {
    const my = ++lvSeq;
    clearInterval(lvTimer); lvTimer = null;
    chart?.removeOverlay({ groupId: 'lv' }); dawn = ''; lvNote = ''; drawInfo();
    if (!lvOn || !chart) return;
    if (!REPLAY_INSTRUMENTS[inst]) { lvNote = `Forecast and option lines cover the ${Object.keys(REPLAY_INSTRUMENTS).length} markets the Replay covers; ${inst} is not one of them.`; drawInfo(); return; }
    let day; try { day = await getJson(`/api/replay/day?inst=${inst}&date=${londonDate(Date.now())}`); } catch { day = null; }
    if (my !== lvSeq || !chart) return;
    const L = levelsFromDay(day, Date.now());
    lvNote = L.note; dawn = L.dawn ?? ''; drawInfo();
    if (!L.ok) return;
    const ts = pending.at(-1)?.timestamp ?? Date.now();
    for (const l of L.lines) chart.createOverlay({ name: 'deskLevel', groupId: 'lv', lock: true, points: [{ timestamp: ts, value: l.price }], extendData: { label: `${l.label} ${l.price}`, color: tc(l.tone) || tc('tx2') } });
    lvTimer = win.setInterval(() => { if (open && doc.visibilityState !== 'hidden') loadLevels(); }, 5 * 60_000);
  }

  // ── choosing the market ──
  function setInst(w, fromLink = false) {
    const next = cleanSymbol(w, known); if (!next) { say(`"${w}" is not a market on this terminal.`); symEl.value = inst ?? ''; return false; }
    say('');
    if (next === inst) return true;
    inst = next; symEl.value = inst;
    try { ls?.setItem(LAST_KEY, inst); } catch { /* blocked */ }
    if (!fromLink && sel()?.linked?.()) sel().set({ inst }, 'kchart');
    if (chart) mountTf();
    return true;
  }
  const startInst = () => { let w = null; try { w = ls?.getItem(LAST_KEY); } catch { /* */ } const s = sel(); return (s?.linked?.() && s.get().inst && known(s.get().inst) ? s.get().inst : null) ?? (known(w) ? w : 'EURUSD'); };

  // ── the page ──
  async function enter() {
    if (open) return; open = true;
    if (!K) {
      say('Loading the chart…');
      try { K = await loadLib(doc, win); } catch (e) { say(e.message); open = false; return; }
      say('');
    }
    if (!open) return;
    if (!ensureChart()) { say('The chart could not start in this browser.'); return; }
    if (!inst) inst = startInst();
    symEl.value = inst;
    mountTf();
    if (sel()?.get().tf) { /* the pills remember their own size; a linked size is applied through the page's own tf command */ }
  }
  function leave() { open = false; tfbar?.stop(); tfbar = null; clearInterval(lvTimer); lvTimer = null; }
  const tabBtns = [...doc.querySelectorAll('#tabs [data-t]')], onTab = e => { const b = e.currentTarget ?? e.target; if (b.dataset.t === 'kchart') win.setTimeout(enter, 0); else leave(); };
  for (const b of tabBtns) b.addEventListener('click', onTab);

  symEl.addEventListener('change', () => setInst(symEl.value));
  symEl.addEventListener('keydown', e => { if (e.key === 'Enter') setInst(symEl.value); });
  $('#kc-ind').addEventListener('click', e => {
    const b = e.target.closest?.('[data-ind]'); if (!b) return;
    const id = b.dataset.ind, now = !on.has(id);
    if (now) on.add(id); else on.delete(id);
    b.setAttribute('aria-pressed', String(now));
    if (now) addIndicator(id); else removeIndicator(id);
  });
  $('#kc-draw').addEventListener('change', e => { const d = drawingById(e.target.value); if (d && chart) { chart.createOverlay({ name: d.id, groupId: 'drawing' }); say(`${d.label}: click on the chart to place it.`); } e.target.value = ''; });
  $('#kc-clear').addEventListener('click', () => { chart?.removeOverlay({ groupId: 'drawing' }); say('Drawings cleared.'); });
  $('#kc-fit').addEventListener('click', () => chart?.scrollToRealTime(0));
  $('#kc-lv').addEventListener('click', e => { lvOn = !lvOn; e.currentTarget.setAttribute('aria-pressed', String(lvOn)); loadLevels(); });
  const onTheme = () => { if (!chart) return; chart.setStyles(styleFor(tokens())); loadLevels(); };
  win.addEventListener?.('themechange', onTheme);
  $('.kc-bar').addEventListener('click', e => { const b = e.target.closest?.('#kc-tf [data-tf]'); if (b && sel()?.linked?.()) sel().set({ tf: b.dataset.tf }, 'kchart'); });
  const unsub = sel()?.subscribe?.(({ changed, source }) => {
    if (source === 'kchart' || !sel().linked()) return;
    if (changed.includes('inst') && sel().get().inst) setInst(sel().get().inst, true);
    if (changed.includes('tf') && sel().get().tf) $('#kc-tf').querySelector(`[data-tf="${sel().get().tf}"]`)?.click();
  });
  if (doc.querySelector('#tabs [data-t="kchart"]')?.getAttribute('aria-selected') === 'true') win.setTimeout(enter, 0);

  win.deskKchart = { show: (w, tf) => { doc.querySelector('#tabs [data-t="kchart"]')?.click(); if (w) { inst = inst ?? startInst(); setInst(w); } if (tf) sel()?.set({ tf }, 'kchart'); return true; } };
  return { enter, leave, destroy() { leave(); unsub?.(); ro?.disconnect(); if (chart && K) K.dispose(box); for (const b of tabBtns) b.removeEventListener('click', onTab); win.removeEventListener?.('themechange', onTheme); delete win.deskKchart; sec.innerHTML = ''; delete sec.dataset.mounted; }, get chart() { return chart; } };
}
