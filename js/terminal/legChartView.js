// js/terminal/legChartView.js: the DOM half of the terminal's "Rates vs price" panel (panel.macro.legchart, preview). Core: legChartCore.js.
// Candles for any market, a rate leg or spread over them on its own left axis, Move forward/back (buttons, a slider, [ and ]), "Find best lag" on
// the bars on screen (tested against a placebo, same wording as cog-chart.html), a rolling correlation under the chart, and, for Nasdaq, the daily
// Nasdaq-vs-rates regression read from /api/cog-chart/nq-rates. Description only: the shift moves what is drawn, never a number.
import { barsFromColumns, TF_SEC, lagProfile } from '../cogChartMath.js';
import { TFS, PRESETS, DEFAULT_STATE, lineRaw, neededLegs, rollingCorr, visibleSpan } from './legChartCore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'ttLegChart_v1', ID = 'ttlc';

/** The placeholder the Macro > Rates section draws; mountLegChart() fills it once it is on screen. */
export function legChartHtml() {
  return `<div class="sec"><h2>Rates vs price</h2><span class="lbl">a rate line over any market's candles: move it forward and back, or find the lag that fits the bars on screen · description, not a signal</span></div>
<div class="card" id="${ID}" data-legchart="1"><p class="muted">Loading the chart…</p></div>`;
}

let st = { ...DEFAULT_STATE };
try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* private window: defaults */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ asset: st.asset, tf: st.tf, preset: st.preset })); } catch (e) { /* ignore */ } };
const tok = (n, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim() || fb; } catch (e) { return fb; } };   // the terminal's theme tokens, so every theme paints the chart
const jget = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };

export async function mountLegChart(root = document) {
  const host = root.querySelector ? root.querySelector(`#${ID}[data-legchart]`) : null;
  if (!host || host.dataset.mounted === '1') return;
  host.dataset.mounted = '1';
  if (typeof LightweightCharts === 'undefined') { host.innerHTML = '<p class="muted">The chart library did not load.</p>'; return; }
  let meta;
  try { meta = await jget('/api/cog-chart/meta'); } catch (e) { host.innerHTML = `<p class="muted">Chart data is not available: ${esc(e.message)}</p>`; return; }
  const assets = (meta.assets ?? []).map(a => a.key);
  if (!assets.includes(st.asset)) st.asset = assets.includes('NAS100') ? 'NAS100' : assets[0];
  if (!PRESETS.some(p => p.id === st.preset)) st.preset = PRESETS[0].id;
  host.innerHTML = `<div class="grid" style="gap:8px;margin-bottom:8px;align-items:end">
    <label class="lbl">Market <select id="${ID}-asset">${assets.map(a => `<option ${a === st.asset ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
    <label class="lbl">Timeframe <select id="${ID}-tf">${TFS.map(t => `<option ${t === st.tf ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="lbl">Line <select id="${ID}-line">${PRESETS.map(p => `<option value="${p.id}" ${p.id === st.preset ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label></div>
  <div class="grid" style="gap:6px;margin-bottom:6px;align-items:center">
    <span class="lbl">Move the line</span><button class="chip" id="${ID}-m10">◀ 10</button><button class="chip" id="${ID}-m1">◀ 1</button>
    <input type="range" id="${ID}-sl" min="-96" max="96" step="1" value="0" style="min-width:140px" aria-label="Bars to move the line">
    <button class="chip" id="${ID}-p1">1 ▶</button><button class="chip" id="${ID}-p10">10 ▶</button><button class="chip" id="${ID}-z">0</button>
    <span class="mono muted" id="${ID}-sh"></span><button class="chip gold" id="${ID}-find" title="Correlates the line's bar-to-bar changes with price returns at every lag from -48 to +48 bars on the bars you can see, and tests the best one against a placebo">Find best lag</button></div>
  <div id="${ID}-chart" style="height:340px"></div><div class="lbl" style="margin-top:6px">Rolling correlation of the line's changes with price returns (96 bars, at the line's current shift)</div><div id="${ID}-corr" style="height:110px"></div>
  <div id="${ID}-lag"></div><div id="${ID}-nq"></div><p class="muted" style="font-size:12px" id="${ID}-note"></p>`;
  const $ = s => host.querySelector(`#${ID}-${s}`);
  const theme = () => { const c = getComputedStyle(document.documentElement); const v = n => c.getPropertyValue(n).trim(); return { bg: v('--bg2') || 'black', tx: v('--tx2') || 'gray', gr: v('--line') || 'dimgray' }; };
  const mk = el => { const t = theme(); return LightweightCharts.createChart(el, { layout: { background: { color: t.bg }, textColor: t.tx, fontSize: 11 }, grid: { vertLines: { color: t.gr }, horzLines: { color: t.gr } }, rightPriceScale: { borderColor: t.gr }, leftPriceScale: { visible: true, borderColor: t.gr }, timeScale: { borderColor: t.gr, timeVisible: true, secondsVisible: false }, crosshair: { mode: 0 } }); };
  const chart = mk($('chart')), cchart = mk($('corr'));
  const candleS = chart.addCandlestickSeries({ upColor: tok('up', 'green'), downColor: tok('dn', 'orangered'), borderVisible: false, wickUpColor: tok('up', 'green'), wickDownColor: tok('dn', 'orangered') });
  const lineS = chart.addLineSeries({ color: tok('blue2', 'royalblue'), lineWidth: 2, priceScaleId: 'left', priceLineVisible: false });
  const corrS = cchart.addLineSeries({ color: tok('pur', 'mediumpurple'), lineWidth: 2, priceLineVisible: false });
  new ResizeObserver(() => { chart.applyOptions({ width: $('chart').clientWidth }); cchart.applyOptions({ width: $('corr').clientWidth }); }).observe(host);
  let syncing = false;
  chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && !syncing) { syncing = true; cchart.timeScale().setVisibleLogicalRange(r); syncing = false; } });
  const legCache = {};
  let candles = [], raw = [], shift = 0;
  const preset = () => PRESETS.find(p => p.id === st.preset);

  async function load() {
    $('note').textContent = 'Loading…';
    try {
      const p = preset();
      await Promise.all(neededLegs(p).map(async n => {
        if (legCache[n]) return;
        const j = await jget(`/api/cog-chart/leg?name=${encodeURIComponent(n)}`);
        legCache[n] = { m5: barsFromColumns(j.m5), m15: barsFromColumns(j.m15), h1: j.h1 ? barsFromColumns(j.h1) : null };
      }));
      const cj = await jget(`/api/cog-chart/candles?asset=${st.asset}&tf=${st.tf}&count=1500`);
      candles = cj.candles ?? [];
      raw = lineRaw(p, legCache, candles.map(c => c.t), TF_SEC[st.tf]);
      $('lag').innerHTML = '';
      draw(true);
      $('note').textContent = `${st.asset} ${st.tf} · ${candles.length} bars · ${p.label}. ${raw.some(v => v != null) ? '' : 'The line has no data on this timeframe.'}`;
    } catch (e) { $('note').textContent = `Could not draw: ${e.message}`; }
  }
  // the line is drawn on its own (left) axis in its own units, shifted by `shift` bars; the shift moves the drawing only
  function draw(fit) {
    const times = candles.map(c => c.t), step = TF_SEC[st.tf];
    candleS.setData(candles.map(c => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
    const pts = [];
    raw.forEach((v, i) => {
      if (v == null) return;
      const k = i + shift; if (k < 0) return;
      pts.push({ time: k < times.length ? times[k] : times[times.length - 1] + (k - (times.length - 1)) * step, value: v });
    });
    lineS.setData(pts);
    const rc = rollingCorr(raw, candles.map(c => c.c), 96, shift).filter(p => p.r != null && p.i < times.length);
    corrS.setData(rc.map(p => ({ time: times[p.i], value: p.r })));
    chart.applyOptions({ timeScale: { rightOffset: Math.max(4, shift + 4) } });
    if (fit) chart.timeScale().fitContent();
    $('sh').textContent = `${shift > 0 ? '+' : ''}${shift} bars = ${(shift * TF_SEC[st.tf] / 3600).toFixed(2)} h (drawn only)`;
    $('sl').value = Math.max(-96, Math.min(96, shift));
  }
  const setShift = n => { shift = Math.max(-500, Math.min(500, n | 0)); draw(false); };
  $('m1').onclick = () => setShift(shift - 1); $('p1').onclick = () => setShift(shift + 1);
  $('m10').onclick = () => setShift(shift - 10); $('p10').onclick = () => setShift(shift + 10);
  $('z').onclick = () => setShift(0); $('sl').oninput = e => setShift(+e.target.value);
  host.addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) return; if (e.key === '[') setShift(shift - 1); else if (e.key === ']') setShift(shift + 1); });
  $('asset').onchange = e => { st.asset = e.target.value; save(); shift = 0; load(); updateNq(); };
  $('tf').onchange = e => { st.tf = e.target.value; save(); shift = 0; load(); };
  $('line').onchange = e => { st.preset = e.target.value; save(); shift = 0; load(); };

  $('find').onclick = () => {
    const span = visibleSpan(chart.timeScale().getVisibleLogicalRange(), candles.length);
    if (!span) { $('lag').innerHTML = '<p class="muted">Zoom out a little: there need to be at least 120 bars on screen to test a lag.</p>'; return; }
    const cut = a => a.slice(span.from, span.to + 1);
    const res = lagProfile(cut(raw), cut(candles.map(c => c.c)), 48);
    $('lag').innerHTML = lagHtml(res, st);
    const ap = $('lag').querySelector('[data-apply]');
    if (ap) ap.onclick = () => setShift(res.bestLag);
  };

  // Nasdaq mode: the daily Nasdaq-vs-rates regression read, only when the market is the Nasdaq
  async function updateNq() {
    const box = $('nq'); box.innerHTML = '';
    if (st.asset !== 'NAS100') return;
    try {
      const j = await jget('/api/cog-chart/nq-rates?w=120&days=750');
      if (!j.ok) return;
      box.innerHTML = `<div class="lbl" style="margin-top:10px">Nasdaq vs rates (daily): is the Nasdaq trading on rates right now?</div><div class="muted" style="font-size:13px;margin:4px 0">${esc(j.read ?? '')}</div><div id="${ID}-nqc" style="height:150px"></div><p class="muted" style="font-size:12px">${esc(j.note ?? '')}</p>`;
      const c = mk(box.querySelector(`#${ID}-nqc`)), s = c.addLineSeries({ color: tok('gold', 'orange'), lineWidth: 2, priceLineVisible: false });
      s.setData((j.rows ?? []).filter(r => r.z20 != null).map(r => ({ time: r.date, value: r.z20 })));
      c.timeScale().fitContent();
    } catch (e) { /* the read is optional */ }
  }
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
  <button class="chip" data-apply="1">${res.significant ? 'Draw the line at the best lag' : 'Draw it at the best lag anyway'}</button></div>`;
}
