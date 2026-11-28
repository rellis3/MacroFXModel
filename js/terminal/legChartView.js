// js/terminal/legChartView.js: the DOM half of the terminal's "Rates vs price" panel (panel.macro.legchart, preview). Core: legChartCore.js.
// Candles for any market, a rate leg or spread over them on its own left axis, Move forward/back (buttons, a slider, [ and ]), "Find best lag" on
// the bars on screen (tested against a placebo, same wording as cog-chart.html), a rolling correlation under the chart, and, for Nasdaq, the daily
// Nasdaq-vs-rates regression read from /api/cog-chart/nq-rates. Description only: the shift moves what is drawn, never a number.
import { barsFromColumns, TF_SEC, lagProfile } from '../cogChartMath.js';
import { TFS, PRESETS, DEFAULT_STATE, lineRaw, neededLegs, rollingCorr, visibleSpan } from './legChartCore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'ttLegChart_v1', ID = 'ttlc';

let st = { ...DEFAULT_STATE };
try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* private window: defaults */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ asset: st.asset, tf: st.tf, overlays: st.overlays, active: st.active, custom: st.custom })); } catch (e) { /* ignore */ } };
const tok = (n, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim() || fb; } catch (e) { return fb; } };   // the terminal's theme tokens, so every theme paints the chart
const jget = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };
const COLS = [['blue2', 'royalblue'], ['gold', 'orange'], ['pur', 'mediumpurple'], ['up', 'mediumseagreen'], ['dn', 'tomato'], ['tx', 'white']];
const CUSTOM0 = { a: 'I2', b: 'SR3U6', asRate: true, invert: true, inBps: true };
const nqRead = r => (r && typeof r === 'object' ? [r.regime, r.sign, r.gap].filter(Boolean).join('. ') : String(r ?? ''));

const CSS = '#ttlc .lc-row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:10px}#ttlc .lc-row label{display:flex;gap:6px;align-items:center}#ttlc .lc-row select{max-width:100%}'
  + '#ttlc .lc-chips{display:flex;flex-wrap:wrap;gap:6px}#ttlc .lc-chips button{width:auto;display:inline-flex;gap:6px;align-items:center}#ttlc .lc-chips button[aria-pressed="true"]{border-color:var(--gold)}#ttlc .lc-dot{width:9px;height:9px;border-radius:50%;display:inline-block}'
  + '#ttlc .lc-row button{width:auto;flex:0 0 auto}#ttlc .lc-row input[type=range]{width:min(360px,60vw);flex:1 1 200px}#ttlc .lc-leg{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;margin:4px 0}';

/** The placeholder the Macro > Rates section draws; mountLegChart() fills it once it is on screen. */
export function legChartHtml() {
  return `<div class="sec"><h2>Rates vs price</h2><span class="lbl">candles for any market, with the rate lines you pick drawn over them: move a line forward and back, or find the lag that fits the bars on screen · description, not a signal</span></div>
<div class="card" id="${ID}" data-legchart="1"><p class="muted">Loading the chart…</p></div>`;
}

export async function mountLegChart(root = document) {
  const host = root.querySelector ? root.querySelector(`#${ID}[data-legchart]`) : null;
  if (!host || host.dataset.mounted === '1') return;
  host.dataset.mounted = '1';
  if (typeof LightweightCharts === 'undefined') { host.innerHTML = '<p class="muted">The chart library did not load.</p>'; return; }
  let meta;
  try { meta = await jget('/api/cog-chart/meta'); } catch (e) { host.innerHTML = `<p class="muted">Chart data is not available: ${esc(e.message)}</p>`; return; }
  const assets = (meta.assets ?? []).map(a => a.key);
  if (!assets.includes(st.asset)) st.asset = assets.includes(DEFAULT_STATE.asset) ? DEFAULT_STATE.asset : assets[0];
  st.custom = { ...CUSTOM0, ...(st.custom ?? {}) };
  const legs = meta.legs ?? [], legKind = n => legs.find(l => l.name === n)?.kind ?? 'rate', legLabel = n => legs.find(l => l.name === n)?.label ?? n;
  const customPreset = () => { const c = st.custom, o = { id: 'custom', asRate: c.asRate, invert: c.invert, inBps: c.inBps }; return c.b ? { ...o, label: `My line: ${legLabel(c.a)} minus ${legLabel(c.b)}${c.invert ? ', flipped' : ''}`, kind: 'spread', eur: c.a, usd: c.b } : { ...o, label: `My line: ${legLabel(c.a)}${c.invert ? ', flipped' : ''}`, kind: 'leg', leg: c.a }; };
  const P = id => (id === 'custom' ? customPreset() : PRESETS.find(p => p.id === id));
  st.overlays = (Array.isArray(st.overlays) ? st.overlays : []).filter(id => id === 'custom' || PRESETS.some(p => p.id === id));
  if (!st.overlays.length) st.overlays = [...DEFAULT_STATE.overlays];
  if (!st.overlays.includes(st.active)) st.active = st.overlays[0];
  const colour = id => { if (id === 'custom') return tok('cy', 'cyan'); const c = COLS[Math.max(0, PRESETS.findIndex(p => p.id === id)) % COLS.length]; return tok(c[0], c[1]); };
  const mon = iso => String(iso ?? '').slice(0, 7);
  function legOpts(sel) {
    const groups = {};
    legs.forEach(l => (groups[`${l.side === 'US' ? 'US' : 'Euro'} / ${l.group}`] ??= []).push(l));
    return Object.entries(groups).sort().map(([g, ls]) => `<optgroup label="${esc(g)}">${ls.map(l => `<option value="${esc(l.name)}" ${l.name === sel ? 'selected' : ''}>${esc(l.label)} [${mon(l.first)} to ${mon(l.asOf)}]</option>`).join('')}</optgroup>`).join('');
  }
  host.innerHTML = `<style>${CSS}</style>
  <div class="lc-row">
    <label class="lbl">Market <select id="${ID}-asset">${assets.map(a => `<option ${a === st.asset ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
    <label class="lbl">Timeframe <select id="${ID}-tf">${TFS.map(t => `<option ${t === st.tf ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
  </div>
  <div class="lbl" style="margin-bottom:4px">Draw over the candles (click to add or remove)</div>
  <div class="lc-chips" id="${ID}-chips"></div>
  <details class="lc-build" id="${ID}-build" style="margin-top:10px"><summary class="lbl" style="cursor:pointer">Build your own line: leg 1 minus leg 2, with a flip</summary>
    <div class="lc-row" style="margin-top:8px">
      <label class="lbl">Leg 1 <select id="${ID}-la">${legOpts(st.custom.a)}</select></label>
      <label class="lbl">Leg 2 <select id="${ID}-lb"><option value="">(none: draw leg 1 alone)</option>${legOpts(st.custom.b)}</select></label>
    </div>
    <div class="lc-row">
      <label class="lbl"><input type="checkbox" id="${ID}-ci" ${st.custom.invert ? 'checked' : ''}> invert sign</label>
      <label class="lbl"><input type="checkbox" id="${ID}-cr" ${st.custom.asRate ? 'checked' : ''}> price → rate (100 − price)</label>
      <label class="lbl"><input type="checkbox" id="${ID}-cb" ${st.custom.inBps ? 'checked' : ''}> in bp</label>
      <button class="chip" type="button" id="${ID}-cswap">⇄ swap legs</button>
    </div>
    <p class="muted" style="font-size:12px;margin:0">The line is leg 1 minus leg 2. Rate futures are prices: tick “price → rate” for SOFR and Euribor, leave it off for bond futures and yields (it turns itself off when you pick one).</p>
  </details>
  <div class="lc-row" style="margin-top:12px">
    <span class="lbl">Move</span><select id="${ID}-act" aria-label="Which line to move"></select>
    <button class="chip" id="${ID}-m10">◀ 10</button><button class="chip" id="${ID}-m1">◀ 1</button>
    <input type="range" id="${ID}-sl" min="-96" max="96" step="1" value="0" aria-label="Bars to move the line">
    <button class="chip" id="${ID}-p1">1 ▶</button><button class="chip" id="${ID}-p10">10 ▶</button><button class="chip" id="${ID}-z">0</button>
    <span class="mono muted" id="${ID}-sh"></span>
    <button class="chip gold" id="${ID}-find" title="Correlates each line's bar-to-bar changes with price returns at every lag from -48 to +48 bars on the bars you can see, and tests the best one against a placebo">Find best fit</button>
  </div>
  <p class="muted" style="font-size:12px;margin:0 0 6px" id="${ID}-note">Loading…</p>
  <div class="lc-leg" id="${ID}-legend"></div>
  <div id="${ID}-chart" style="height:380px"></div>
  <div class="lbl" style="margin-top:10px">Rolling correlation of the moving line's changes with price returns (96 bars, at its current shift)</div><div id="${ID}-corr" style="height:110px"></div>
  <div id="${ID}-lag"></div><div id="${ID}-nq"></div>`;
  const $ = s => host.querySelector(`#${ID}-${s}`);
  const theme = () => { const c = getComputedStyle(document.documentElement); const v = n => c.getPropertyValue(n).trim(); return { bg: v('--bg2') || 'black', tx: v('--tx2') || 'gray', gr: v('--line') || 'dimgray' }; };
  const mk = el => { const t = theme(); return LightweightCharts.createChart(el, { width: el.clientWidth || 600, height: el.clientHeight || 200, layout: { background: { color: t.bg }, textColor: t.tx, fontSize: 11 }, grid: { vertLines: { color: t.gr }, horzLines: { color: t.gr } }, rightPriceScale: { borderColor: t.gr }, leftPriceScale: { visible: true, borderColor: t.gr }, timeScale: { borderColor: t.gr, timeVisible: true, secondsVisible: false }, crosshair: { mode: 0 } }); };
  const chart = mk($('chart')), cchart = mk($('corr'));
  const candleS = chart.addCandlestickSeries({ upColor: tok('up', 'green'), downColor: tok('dn', 'orangered'), borderVisible: false, wickUpColor: tok('up', 'green'), wickDownColor: tok('dn', 'orangered') });
  const corrS = cchart.addLineSeries({ color: tok('pur', 'mediumpurple'), lineWidth: 2, priceLineVisible: false });
  new ResizeObserver(() => { chart.applyOptions({ width: $('chart').clientWidth }); cchart.applyOptions({ width: $('corr').clientWidth }); }).observe(host);
  let syncing = false;
  chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && !syncing) { syncing = true; cchart.timeScale().setVisibleLogicalRange(r); syncing = false; } });
  const legCache = {}, series = {}, raw = {}, shifts = {}, failed = {};
  let candles = [];
  const seriesFor = id => series[id] ??= chart.addLineSeries({ color: colour(id), lineWidth: 2, priceScaleId: Object.keys(series).length === 0 ? 'left' : `ov-${id}`, priceLineVisible: false, lastValueVisible: false });

  function chips() {
    $('chips').innerHTML = [...PRESETS, customPreset()].map(p => `<button type="button" class="chip" data-id="${p.id}" aria-pressed="${st.overlays.includes(p.id)}"><span class="lc-dot" style="background:${colour(p.id)}"></span>${esc(p.label)}</button>`).join('');
    $('act').innerHTML = st.overlays.map(id => `<option value="${id}" ${id === st.active ? 'selected' : ''}>${esc(P(id).label)}</option>`).join('');
  }
  async function load() {
    $('note').textContent = 'Loading…';
    const need = [...new Set(st.overlays.flatMap(id => neededLegs(P(id))))].filter(n => !legCache[n]);
    const res = await Promise.allSettled(need.map(async n => {
      const j = await jget(`/api/cog-chart/leg?name=${encodeURIComponent(n)}`);
      legCache[n] = { m5: barsFromColumns(j.m5), m15: barsFromColumns(j.m15), h1: j.h1 ? barsFromColumns(j.h1) : null };
    }));
    res.forEach((r, i) => { if (r.status === 'rejected') failed[need[i]] = r.reason?.message ?? 'failed'; });
    try {
      const cj = await jget(`/api/cog-chart/candles?asset=${st.asset}&tf=${st.tf}&count=1500`);
      candles = cj.candles ?? [];
    } catch (e) { candles = []; draw(false); $('note').textContent = `The ${st.asset} candles did not load (${e.message}). The lines need them to draw against.`; return; }
    const times = candles.map(c => c.t);
    for (const id of st.overlays) { const p = P(id); raw[id] = neededLegs(p).some(n => !legCache[n]) ? [] : lineRaw(p, legCache, times, TF_SEC[st.tf]); }
    $('lag').innerHTML = '';
    draw(true);
  }
  // each line is drawn on its own scale in its own units, shifted by its own number of bars; the shift moves the drawing only
  function draw(fit) {
    const times = candles.map(c => c.t), step = TF_SEC[st.tf];
    candleS.setData(candles.map(c => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
    for (const id of Object.keys(series)) if (!st.overlays.includes(id)) series[id].setData([]);
    const bad = [], legend = [];
    for (const id of st.overlays) {
      const r = raw[id] ?? [], sh = shifts[id] ?? 0, pts = [];
      r.forEach((v, i) => { if (v == null) return; const k = i + sh; if (k < 0) return; pts.push({ time: k < times.length ? times[k] : times[times.length - 1] + (k - (times.length - 1)) * step, value: v }); });
      seriesFor(id).setData(pts);
      if (!pts.length) bad.push(P(id).label);
      const last = r.filter(v => v != null).at(-1);
      legend.push(`<span><span class="lc-dot" style="background:${colour(id)}"></span> ${esc(P(id).label)} <span class="mono">${last == null ? 'n/a' : last.toFixed(Math.abs(last) < 20 ? 2 : 1)}</span> · shift <span class="mono">${sh > 0 ? '+' : ''}${sh}</span></span>`);
    }
    $('legend').innerHTML = legend.join('');
    const a = st.active, sh = shifts[a] ?? 0;
    const rc = rollingCorr(raw[a] ?? [], candles.map(c => c.c), 96, sh).filter(p => p.r != null && p.i < times.length);
    corrS.setData(rc.map(p => ({ time: times[p.i], value: p.r })));
    chart.applyOptions({ timeScale: { rightOffset: Math.max(0, ...Object.values(shifts)) + 4 } });
    if (fit) chart.timeScale().fitContent();
    $('sh').textContent = `${sh > 0 ? '+' : ''}${sh} bars = ${(sh * (TF_SEC[st.tf] ?? 0) / 3600).toFixed(2)} h (drawn only)`;
    $('sl').value = Math.max(-96, Math.min(96, sh));
    if (candles.length) $('note').textContent = `${st.asset} ${st.tf} · ${candles.length} bars.${bad.length ? ` No data for: ${bad.join(', ')} on this timeframe${Object.keys(failed).length ? ` (${Object.entries(failed).map(([k, v]) => `${k}: ${v}`).join('; ')})` : ''}.` : ''} Description only: shifting moves what is drawn, never a number.`;
  }
  const cur = () => shifts[st.active] ?? 0;
  const setShift = n => { shifts[st.active] = Math.max(-500, Math.min(500, n | 0)); draw(false); };
  $('m1').onclick = () => setShift(cur() - 1); $('p1').onclick = () => setShift(cur() + 1);
  $('m10').onclick = () => setShift(cur() - 10); $('p10').onclick = () => setShift(cur() + 10);
  $('z').onclick = () => setShift(0); $('sl').oninput = e => setShift(+e.target.value);
  host.addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) return; if (e.key === '[') setShift(cur() - 1); else if (e.key === ']') setShift(cur() + 1); });
  const zero = () => { for (const k of Object.keys(shifts)) shifts[k] = 0; };
  $('asset').onchange = e => { st.asset = e.target.value; save(); zero(); load(); updateNq(); };
  $('tf').onchange = e => { st.tf = e.target.value; save(); zero(); load(); };
  $('act').onchange = e => { st.active = e.target.value; save(); draw(false); };
  $('chips').onclick = e => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    const id = b.dataset.id, on = st.overlays.includes(id);
    if (on && st.overlays.length === 1) return;                      // keep one line so the chart never has nothing to move
    st.overlays = on ? st.overlays.filter(x => x !== id) : [...st.overlays, id];
    if (!on) st.active = id; else if (st.active === id) st.active = st.overlays[0];
    save(); chips(); load();
  };

  const customChanged = async () => {
    const c = st.custom;
    c.invert = $('ci').checked; c.asRate = $('cr').checked; c.inBps = $('cb').checked;
    if ([c.a, c.b].some(n => n && legKind(n) !== 'rate')) c.asRate = false, $('cr').checked = false;
    if (!st.overlays.includes('custom')) st.overlays = [...st.overlays, 'custom'];
    st.active = 'custom'; shifts.custom = 0; save(); chips(); await load();
  };
  $('la').onchange = e => { st.custom.a = e.target.value; customChanged(); };
  $('lb').onchange = e => { st.custom.b = e.target.value; customChanged(); };
  for (const k of ['ci', 'cr', 'cb']) $(k).onchange = customChanged;
  $('cswap').onclick = () => { const c = st.custom; if (!c.b) return; [c.a, c.b] = [c.b, c.a]; $('la').value = c.a; $('lb').value = c.b; customChanged(); };

  $('find').onclick = () => {
    const span = visibleSpan(chart.timeScale().getVisibleLogicalRange(), candles.length);
    if (!span) { $('lag').innerHTML = '<p class="muted">Zoom out a little: there need to be at least 120 bars on screen to test a lag.</p>'; return; }
    const cut = a => a.slice(span.from, span.to + 1), closes = cut(candles.map(c => c.c));
    $('lag').innerHTML = st.overlays.map(id => `<div data-id="${id}"><div class="lbl" style="margin-top:12px"><span class="lc-dot" style="background:${colour(id)}"></span> ${esc(P(id).label)}</div>${(raw[id] ?? []).length ? lagHtml(lagProfile(cut(raw[id]), closes, 48), st) : '<p class="muted">No data for this line on this timeframe.</p>'}</div>`).join('');
    $('lag').querySelectorAll('[data-apply]').forEach(btn => { btn.onclick = () => { st.active = btn.closest('[data-id]').dataset.id; save(); chips(); shifts[st.active] = +btn.dataset.apply; draw(false); }; });
  };

  // Nasdaq mode: the daily index-vs-rates regression read, only when the market is one the free daily series cover
  async function updateNq() {
    const box = $('nq'); box.innerHTML = '';
    if (!['NAS100', 'SPX500', 'US30'].includes(st.asset)) return;
    try {
      const j = await jget(`/api/cog-chart/nq-rates?asset=${st.asset}&w=120&days=750`);
      if (!j.ok) return;
      box.innerHTML = `<div class="lbl" style="margin-top:14px">${esc(st.asset)} vs rates (daily): is it trading on rates right now?</div><div class="muted" style="font-size:13px;margin:4px 0">${esc(nqRead(j.read))}</div><div id="${ID}-nqc" style="height:150px"></div><p class="muted" style="font-size:12px">${esc(String(j.note ?? '').replace(/\s*\((?:[a-z0-9]+_[a-z0-9_]+)(?:\s+S\d+)?\)/gi, ''))}</p>`;
      const c = mk(box.querySelector(`#${ID}-nqc`)), s = c.addLineSeries({ color: tok('gold', 'orange'), lineWidth: 2, priceLineVisible: false });
      s.setData((j.rows ?? []).filter(r => r.z20 != null).map(r => ({ time: r.date, value: r.z20 })));
      c.timeScale().fitContent();
    } catch (e) { /* the read is optional */ }
  }
  chips();
  await load();
  updateNq();
}

function lagHtml(res, s) {
  if (res.bestLag == null) return '<p class="muted">Not enough overlapping bars to measure a lag.</p>';
  const W = 300, H = 56, M = Math.max(0.02, ...res.profile.map(v => Math.abs(v ?? 0))), bw = W / res.lags.length, hrs = n => (Math.abs(n) * TF_SEC[s.tf] / 3600).toFixed(2);
  const bars = res.lags.map((n, i) => {
    const v = res.profile[i]; if (v == null) return '';
    const h = Math.abs(v) / M * (H / 2 - 2);
    return `<rect x="${(i * bw).toFixed(1)}" y="${(v >= 0 ? H / 2 - h : H / 2).toFixed(1)}" width="${Math.max(1, bw - 0.6).toFixed(1)}" height="${h.toFixed(1)}" fill="${n === res.bestLag ? 'var(--gold)' : n === 0 ? 'var(--tx2)' : 'var(--blue2)'}"/>`;
  }).join('');
  const thr = res.threshold == null ? '' : [res.threshold, -res.threshold].map(t => { const y = (H / 2 - t / M * (H / 2 - 2)).toFixed(1); return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--dn)" stroke-dasharray="3 3"/>`; }).join('');
  const dir = res.bestLag > 0 ? `the line LEADS ${esc(s.asset)} by ${res.bestLag} bars (${hrs(res.bestLag)} h)` : res.bestLag < 0 ? `${esc(s.asset)} LEADS the line by ${-res.bestLag} bars (${hrs(res.bestLag)} h)` : 'they move on the same bar';
  const verdict = res.significant
    ? `Best lag <b>${res.bestLag > 0 ? '+' : ''}${res.bestLag}</b>: r ${res.bestR.toFixed(3)} beats the luck threshold ${res.threshold.toFixed(3)}: ${dir}.`
    : `<b>Nothing beats luck.</b> The best lag (${res.bestLag > 0 ? '+' : ''}${res.bestLag}, r ${res.bestR.toFixed(3)}) is inside the ${res.threshold == null ? 'chance' : res.threshold.toFixed(3)} you get from picking the best of ${res.lags.length} lags on shuffled prices.`;
  return `<div style="margin-top:8px"><svg width="${W}" height="${H}" style="display:block;max-width:100%"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--line)"/>${bars}${thr}</svg>
  <div class="muted" style="font-size:12px">-48 ◀ price leads | 0 grey | line leads ▶ +48 · red dashes = 95% of luck · tested on the ${res.n} bars on screen</div>
  <div style="margin:4px 0">${verdict}<br>Same-bar r ${res.sameBarR == null ? 'n/a' : res.sameBarR.toFixed(3)}. Description only: it moves what is drawn, never a number.</div>
  <button class="chip" data-apply="${res.bestLag}">${res.significant ? 'Draw the line at the best lag' : 'Draw it at the best lag anyway'}</button></div>`;
}
