// backtest.js — Backtest page controller

// ── Saved configs ──────────────────────────────────────────────────────────────

const SAVED_CFGS_KEY = 'bt-saved-cfgs';

const BEST_CONFIG_V1 = {
  id: 'best_v1',
  name: 'Best Config #1 — PF 2.1 · Sharpe 9.89',
  date: '28 Apr 2025',
  cfg: {
    rrRatio: 2.5,
    slFraction: 0.30,
    minConviction: 0.20,
    minConfirms: 3,
    entryProximityATR: 0.25,
    warmupDays: 120,
    spread: 0.8,
    slippage: 0.3,
    killDaily: 2,
    killWeekly: 5,
    killMonthly: 10,
    features: {
      rangePosition: { enabled: true,  weight: 1, label: 'Range Position' },
      chochBos:      { enabled: true,  weight: 2, label: 'CHoCH / BOS' },
      wickRejection: { enabled: true,  weight: 1, label: 'Wick Rejection' },
      rsiDivergence: { enabled: true,  weight: 1, label: 'RSI Divergence' },
      orderBlock:    { enabled: true,  weight: 1, label: 'Order Block' },
      htfEma:        { enabled: true,  weight: 1, label: 'HTF EMA 21/50' },
      vwapSlope:     { enabled: true,  weight: 1, label: 'TWAP Slope' },
      adxFilter:     { enabled: true,  weight: 1, label: 'ADX Filter' },
      hurstRegime:   { enabled: true,  weight: 1, label: 'Hurst Regime' },
      fvgBias:       { enabled: true,  weight: 1, label: 'FVG Bias' },
      weeklyPivot:   { enabled: false, weight: 1, label: 'Weekly Pivot' },
      ichimokuCloud: { enabled: false, weight: 1, label: 'Ichimoku Cloud' },
    },
  },
};

function initSavedConfigs() {
  try {
    const raw = localStorage.getItem(SAVED_CFGS_KEY);
    let configs = raw ? JSON.parse(raw) : [];
    if (!configs.find(c => c.id === BEST_CONFIG_V1.id)) {
      configs.unshift(BEST_CONFIG_V1);
      localStorage.setItem(SAVED_CFGS_KEY, JSON.stringify(configs));
    }
  } catch {}
  renderConfigList();
}

function getSavedConfigs() {
  try { return JSON.parse(localStorage.getItem(SAVED_CFGS_KEY) || '[]'); } catch { return []; }
}

function saveCurrentConfig() {
  const nameEl = document.getElementById('cfg-save-name');
  const name = nameEl?.value?.trim();
  if (!name) { nameEl?.focus(); return; }
  const configs = getSavedConfigs();
  const id = 'cfg_' + Date.now();
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  configs.push({ id, name, date, cfg: buildCfg() });
  localStorage.setItem(SAVED_CFGS_KEY, JSON.stringify(configs));
  if (nameEl) nameEl.value = '';
  renderConfigList();
}

function loadConfig(id) {
  const entry = getSavedConfigs().find(c => c.id === id);
  if (!entry) return;
  const { cfg } = entry;
  const sv = (elId, v) => { const el = document.getElementById(elId); if (el && v != null) el.value = v; };
  sv('cfg-rr',           cfg.rrRatio);
  sv('cfg-sl',           cfg.slFraction);
  sv('cfg-conv',         cfg.minConviction);
  sv('cfg-conf',         cfg.minConfirms);
  sv('cfg-prox',         cfg.entryProximityATR);
  sv('cfg-warmup',       cfg.warmupDays);
  sv('cfg-spread',       cfg.spread);
  sv('cfg-slippage',     cfg.slippage);
  sv('cfg-kill-daily',   cfg.killDaily);
  sv('cfg-kill-weekly',  cfg.killWeekly);
  sv('cfg-kill-monthly', cfg.killMonthly);
  if (cfg.features) {
    for (const [key, feat] of Object.entries(cfg.features)) {
      const chk = document.getElementById('feat-' + key);
      if (chk) chk.checked = !!feat.enabled;
    }
  }
  const row = document.querySelector(`[data-cfg-id="${id}"]`);
  if (row) {
    row.style.background = 'var(--blue-bg)';
    setTimeout(() => { row.style.background = ''; }, 700);
  }
}

function deleteConfig(id) {
  if (id === BEST_CONFIG_V1.id) return;
  const configs = getSavedConfigs().filter(c => c.id !== id);
  localStorage.setItem(SAVED_CFGS_KEY, JSON.stringify(configs));
  renderConfigList();
}

function renderConfigList() {
  const el = document.getElementById('cfg-list');
  if (!el) return;
  const configs = getSavedConfigs();
  if (!configs.length) {
    el.innerHTML = '<div style="font-size:10px;color:var(--text3);">No saved configs yet.</div>';
    return;
  }
  el.innerHTML = configs.map(c => `
    <div class="saved-cfg-row" data-cfg-id="${c.id}">
      ${c.id === BEST_CONFIG_V1.id ? '<span class="saved-cfg-star">★</span>' : ''}
      <span class="saved-cfg-name" onclick="loadConfig('${c.id}')" title="Click to load: ${c.name}">${c.name}</span>
      <span class="saved-cfg-date">${c.date || ''}</span>
      ${c.id !== BEST_CONFIG_V1.id
        ? `<button class="saved-cfg-del" onclick="deleteConfig('${c.id}')" title="Delete">✕</button>`
        : ''}
    </div>`).join('');
}

// ── R2 config ──────────────────────────────────────────────────────────────────

const R2_BASE = 'https://pub-1d8354116ae54e158e7010f0deb8f6e6.r2.dev';

// Builds the R2 URL for a given symbol + timeframe.
// Default pattern: EURUSD/m1.csv — edit r2-path-tpl in the sidebar to override.
function r2Url(symbol, tf) {
  const tpl = document.getElementById('r2-path-tpl')?.value?.trim() || '{symbol}/m{tf}.csv';
  return R2_BASE + '/' + tpl.replace('{symbol}', symbol).replace('{tf}', tf);
}

// Streams a file from R2 with download progress, then sends to worker for parsing.
async function fetchFromR2(symbol, tf) {
  const url = r2Url(symbol, tf);
  updateR2Status(tf, 'downloading…');
  setProgress(`Downloading ${symbol} ${tf.toUpperCase()}…`, 5);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const msg = `HTTP ${res.status} from ${url}`;
      updateR2Status(tf, '✗ ' + res.status);
      throw new Error(msg);
    }

    const total = parseInt(res.headers.get('Content-Length') || '0', 10);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const mb = (received / 1048576).toFixed(1);
      if (total > 0) {
        setProgress(`Downloading ${tf.toUpperCase()}… ${mb} MB`, Math.round(100 * received / total));
      } else {
        setProgress(`Downloading ${tf.toUpperCase()}… ${mb} MB`, 0);
      }
    }

    updateR2Status(tf, 'parsing…');
    const text = await new Blob(chunks).text();
    getWorker().postMessage({ type: 'parse', payload: { symbol, tf, text } });
  } catch (err) {
    throw err; // re-throw so loadAllFromR2 can show combined error
  }
}

async function loadAllFromR2() {
  const symbol = getSymbol();
  document.getElementById('r2-load-btn').disabled = true;
  setProgress('Connecting to R2…', 2);

  try {
    // M30 first (smallest, needed for precompute)
    await fetchFromR2(symbol, 'm30');
    // M5 (medium)
    await fetchFromR2(symbol, 'm5');
    // M1 (largest — optional but fetched if available)
    try { await fetchFromR2(symbol, 'm1'); } catch { updateR2Status('m1', 'skipped (not found)'); }
  } catch (err) {
    showError(err.message + ' — check the path template below.');
  } finally {
    document.getElementById('r2-load-btn').disabled = false;
  }
}

function updateR2Status(tf, msg) {
  const el = document.getElementById(`r2-status-${tf}`);
  if (el) el.textContent = msg;
}

const DEFAULT_FEATURES = {
  rangePosition: { enabled: true,  weight: 1, label: 'Range Position' },
  chochBos:      { enabled: true,  weight: 2, label: 'CHoCH / BOS' },
  wickRejection: { enabled: true,  weight: 1, label: 'Wick Rejection' },
  rsiDivergence: { enabled: true,  weight: 1, label: 'RSI Divergence' },
  orderBlock:    { enabled: true,  weight: 1, label: 'Order Block' },
  htfEma:        { enabled: true,  weight: 1, label: 'HTF EMA 21/50' },
  vwapSlope:     { enabled: true,  weight: 1, label: 'TWAP Slope' },
  adxFilter:     { enabled: true,  weight: 1, label: 'ADX Filter' },
  hurstRegime:   { enabled: true,  weight: 1, label: 'Hurst Regime' },
  fvgBias:       { enabled: true,  weight: 1, label: 'FVG Bias' },
  weeklyPivot:   { enabled: true,  weight: 1, label: 'Weekly Pivot' },
  ichimokuCloud: { enabled: true,  weight: 1, label: 'Ichimoku Cloud' },
};

const parsedFiles = {}; // symbol → {m1,m5,m30}: true when parsed
let worker = null;
let isRunning = false;

// ── Init ───────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderFeatureList();
  bindEvents();
  restoreSettings();
  initSavedConfigs();

  // Dark mode
  const saved = localStorage.getItem('bt-theme');
  if (saved === 'light') document.body.classList.remove('dark');
  else document.body.classList.add('dark');
});

// ── Worker lifecycle ───────────────────────────────────────────────────────────

function getWorker() {
  if (!worker) {
    // new URL() resolves relative to this module file (/js/backtest.js → /js/backtest-worker.js)
    worker = new Worker(new URL('./backtest-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = handleWorkerMsg;
    worker.onerror   = (e) => showError('Worker error: ' + e.message);
  }
  return worker;
}

function handleWorkerMsg(e) {
  const { type, payload } = e.data;
  if (type === 'progress') handleProgress(payload);
  else if (type === 'parsed')   handleParsed(payload);
  else if (type === 'result')   handleResult(payload);
  else if (type === 'error')    showError(payload);
}

function handleProgress({ status, pct, symbol, tf, rows, total }) {
  const el = document.getElementById('progress-status');
  if (!el) return;
  if (status) el.textContent = status;
  if (pct !== undefined) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = pct + '%';
  }
  if (rows !== undefined && total) {
    el.textContent = `Parsing ${symbol} ${tf?.toUpperCase()}… ${((rows/total)*100).toFixed(0)}%`;
  }
}

function handleParsed({ symbol, tf, count }) {
  if (!parsedFiles[symbol]) parsedFiles[symbol] = {};
  parsedFiles[symbol][tf] = count;
  const kbars = `${(count/1000).toFixed(0)}k bars ✓`;
  // Update both R2 status and file upload label
  updateR2Status(tf, kbars);
  const lbl = document.getElementById(`lbl-${tf}`);
  if (lbl) { lbl.textContent = kbars; lbl.classList.add('parsed'); }
  checkRunReady();
  setProgress(`${tf.toUpperCase()} loaded (${count.toLocaleString()} bars).`, 100);
}

// ── File handling ──────────────────────────────────────────────────────────────

async function loadFile(file, tf) {
  const symbol = getSymbol();
  const text = await file.text();
  setProgress(`Parsing ${tf.toUpperCase()}…`, 0);
  getWorker().postMessage({ type: 'parse', payload: { symbol, tf, text } });
}

function bindFileInput(id, tf) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0], tf);
  });
  // Drag and drop on label
  const lbl = el.closest('.file-zone');
  if (lbl) {
    lbl.addEventListener('dragover', (e) => { e.preventDefault(); lbl.classList.add('drag'); });
    lbl.addEventListener('dragleave', () => lbl.classList.remove('drag'));
    lbl.addEventListener('drop', (e) => {
      e.preventDefault();
      lbl.classList.remove('drag');
      if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0], tf);
    });
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────

function runBacktest() {
  if (isRunning) return;
  const symbol = getSymbol();
  if (!parsedFiles[symbol]?.m5 || !parsedFiles[symbol]?.m30) {
    showError('Please load M5 and M30 data first.');
    return;
  }

  isRunning = true;
  document.getElementById('run-btn').disabled = true;
  setProgress('Starting…', 2);
  clearResults();

  const cfg = buildCfg();
  getWorker().postMessage({ type: 'run', payload: { symbol, cfg } });
}

function buildCfg() {
  const g = (id) => document.getElementById(id)?.value;
  const features = {};
  for (const [key, def] of Object.entries(DEFAULT_FEATURES)) {
    const chk = document.getElementById('feat-' + key);
    features[key] = { ...def, enabled: chk ? chk.checked : def.enabled };
  }
  return {
    rrRatio:           parseFloat(g('cfg-rr'))           || 2.2,
    slFraction:        parseFloat(g('cfg-sl'))           || 0.35,
    minConviction:     parseFloat(g('cfg-conv'))         || 0,
    minConfirms:       parseInt(g('cfg-conf'))           || 2,
    entryProximityATR: parseFloat(g('cfg-prox'))         || 0.30,
    warmupDays:        parseInt(g('cfg-warmup'))         || 100,
    spread:            parseFloat(g('cfg-spread'))       || 0,
    slippage:          parseFloat(g('cfg-slippage'))     || 0,
    killDaily:         parseFloat(g('cfg-kill-daily'))   || 0,
    killWeekly:        parseFloat(g('cfg-kill-weekly'))  || 0,
    killMonthly:       parseFloat(g('cfg-kill-monthly')) || 0,
    features,
  };
}

// ── Results ────────────────────────────────────────────────────────────────────

function handleResult(payload) {
  isRunning = false;
  document.getElementById('run-btn').disabled = false;
  setProgress('Done!', 100);
  renderResults(payload);
  saveSettings();
}

// ── Chart tab switching ────────────────────────────────────────────────────────

function switchChartTab(tab, btn) {
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  ['equity', 'drawdown', 'monthly'].forEach(id => {
    const el = document.getElementById('chart-' + id);
    if (el) el.style.display = id === tab ? 'block' : 'none';
  });
}

function renderResults(d) {
  document.getElementById('results-panel').style.display = 'block';

  // ── Stats tiles ─────────────────────────────────────────────────────────
  const mc = d.monteCarlo;
  const tiles = [
    { id: 'stat-trades',  label: 'Trades',        val: d.totalTrades,    fmt: v => v },
    { id: 'stat-wr',      label: 'Win Rate',       val: d.winRate,        fmt: v => pct(v) },
    { id: 'stat-pf',      label: 'Profit Factor',  val: d.profitFactor,   fmt: v => v === Infinity ? '∞' : v.toFixed(2) },
    { id: 'stat-meanr',   label: 'Avg R',          val: d.meanR,          fmt: v => v.toFixed(3) + 'R' },
    { id: 'stat-sharpe',  label: 'Sharpe',         val: d.sharpe,         fmt: v => v.toFixed(2) },
    { id: 'stat-calmar',  label: 'Calmar',         val: d.calmar,         fmt: v => v.toFixed(2) },
    { id: 'stat-cagr',    label: 'CAGR (1% risk)', val: d.cagr,           fmt: v => pct(v) },
    { id: 'stat-dd',      label: 'Max Drawdown',   val: d.maxDrawdown,    fmt: v => pct(v) },
    { id: 'stat-kelly',   label: 'Kelly %',        val: d.kelly,          fmt: v => pct(v) },
    { id: 'stat-wins',    label: 'Wins',           val: d.wins,           fmt: v => v },
    { id: 'stat-losses',  label: 'Losses',         val: d.losses,         fmt: v => v },
    { id: 'stat-years',   label: 'Period',         val: d.dateRange?.years, fmt: v => (v || '—') + ' yr' },
  ];

  const grid = document.getElementById('stats-grid');
  grid.innerHTML = tiles.map(t => {
    const v = t.val;
    const color = t.id === 'stat-wr' || t.id === 'stat-pf' || t.id === 'stat-cagr' || t.id === 'stat-sharpe'
      ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '')
      : t.id === 'stat-dd' ? 'neg' : '';
    return `<div class="stat-tile">
      <div class="stat-label">${t.label}</div>
      <div class="stat-val ${color}">${v != null ? t.fmt(v) : '—'}</div>
    </div>`;
  }).join('');

  // ── Kelly sizing note ────────────────────────────────────────────────────
  const halfKelly = d.kelly / 2;
  document.getElementById('kelly-note').textContent =
    `Full Kelly: ${pct(d.kelly)} · Half Kelly: ${pct(halfKelly)} of account per trade`;

  // ── MC stats ─────────────────────────────────────────────────────────────
  if (mc) {
    const mcs = document.getElementById('mc-stats');
    const fe = mc.finalEquity, md = mc.maxDrawdown;
    mcs.innerHTML = `
      <b>Final equity (1000 paths, 1% risk per trade)</b>
      <span>P5 ${(fe.p5*100).toFixed(0)}% · P25 ${(fe.p25*100).toFixed(0)}% · P50 ${(fe.p50*100).toFixed(0)}% · P75 ${(fe.p75*100).toFixed(0)}% · P95 ${(fe.p95*100).toFixed(0)}%</span>
      <b style="margin-top:6px">Max drawdown</b>
      <span>P5 ${pct(md.p5)} · P50 ${pct(md.p50)} · P95 ${pct(md.p95)}</span>`;
  }

  // ── Cost banner ───────────────────────────────────────────────────────────
  const costBanner = document.getElementById('cost-banner');
  if (costBanner) {
    const costPips = (d.costsPips || 0);
    if (costPips > 0) {
      costBanner.style.display = 'block';
      costBanner.textContent = `💰 Transaction costs applied: ${costPips.toFixed(1)} pip/trade (spread + slippage) · deducted from every trade R`;
    } else {
      costBanner.style.display = 'none';
    }
  }

  // ── Charts ───────────────────────────────────────────────────────────────
  renderEquityCurve(d.equityCurve, d.dateRange);
  renderDrawdownChart(d.drawdownCurve);
  renderMonthlyPnL(d.monthly);
  if (mc) renderMonteCarlo(mc, d.totalTrades);

  // ── Bayesian table ───────────────────────────────────────────────────────
  renderBayesianTable(d.bayesian);

  // ── Trade log ────────────────────────────────────────────────────────────
  renderTradeLog(d.tradeSample);

  // ── Year / Month breakdown ────────────────────────────────────────────────
  const ymWrap = document.getElementById('yearmonth-wrap');
  if (ymWrap) ymWrap.style.display = d.monthly?.length ? 'block' : 'none';
  renderYearMonth(d.monthly);
}

// ── Equity Curve SVG ───────────────────────────────────────────────────────────

function renderEquityCurve(curve, dateRange) {
  const el = document.getElementById('equity-svg');
  if (!el || !curve.length) return;

  const W = el.clientWidth || 680, H = el.clientHeight || 220;
  const PAD = { t: 12, r: 16, b: 32, l: 48 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const ys = curve.map(p => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const yRange = yMax - yMin || 1;

  const sx = i  => PAD.l + (i / (curve.length - 1)) * iW;
  const sy = y  => PAD.t + iH - ((y - yMin) / yRange) * iH;

  const pts = curve.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ');
  const zero = sy(0);
  const fillPts = `${sx(0)},${zero} ${pts} ${sx(curve[curve.length-1].x)},${zero}`;

  const color = ys[ys.length - 1] >= 0 ? 'var(--green)' : 'var(--red)';

  // Y axis ticks
  const yTicks = 4;
  const yTickHtml = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = yMin + (yRange * i / yTicks);
    const y = sy(v);
    return `<line x1="${PAD.l - 4}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
            <text x="${PAD.l - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--text3)">${v.toFixed(1)}R</text>`;
  }).join('');

  // Zero line
  const zeroLine = `<line x1="${PAD.l}" y1="${zero}" x2="${W - PAD.r}" y2="${zero}" stroke="var(--text3)" stroke-width="0.8" stroke-dasharray="3,3"/>`;

  el.innerHTML = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${yTickHtml}
      ${zeroLine}
      <polyline points="${fillPts}" fill="${color}" fill-opacity="0.10" stroke="none"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>
      <text x="${W/2}" y="${H - 4}" text-anchor="middle" font-size="9" fill="var(--text3)">
        ${dateRange ? dateRange.first + ' → ' + dateRange.last : ''}
      </text>
    </svg>`;
}

// ── Drawdown Chart SVG ────────────────────────────────────────────────────────

function renderDrawdownChart(curve) {
  const el = document.getElementById('drawdown-svg');
  if (!el || !curve?.length) return;

  const W = el.clientWidth || 680, H = 200;
  const PAD = { t: 12, r: 16, b: 24, l: 52 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const ys = curve.map(p => p.y);
  const yMin = Math.min(...ys, -0.001), yMax = 0;
  const yRange = yMax - yMin || 1;

  const n = curve[curve.length - 1].x || 1;
  const sx = p => PAD.l + (p.x / n) * iW;
  const sy = y => PAD.t + iH - ((y - yMin) / yRange) * iH;

  const pts = curve.map(p => `${sx(p)},${sy(p.y)}`).join(' ');
  const zero = sy(0);
  const fillPts = `${sx(curve[0])},${zero} ${pts} ${sx(curve[curve.length - 1])},${zero}`;

  const yTicks = 4;
  const yTickHtml = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = yMin + (yRange * i / yTicks);
    const y = sy(v);
    return `<line x1="${PAD.l - 4}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
            <text x="${PAD.l - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--text3)">${(v * 100).toFixed(0)}%</text>`;
  }).join('');

  el.innerHTML = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${yTickHtml}
      <line x1="${PAD.l}" y1="${zero}" x2="${W - PAD.r}" y2="${zero}" stroke="var(--text3)" stroke-width="0.8" stroke-dasharray="3,3"/>
      <polyline points="${fillPts}" fill="var(--red)" fill-opacity="0.12" stroke="none"/>
      <polyline points="${pts}" fill="none" stroke="var(--red)" stroke-width="1.4"/>
    </svg>`;
}

// ── Monthly P&L Bar Chart SVG ─────────────────────────────────────────────────

function renderMonthlyPnL(monthly) {
  const el = document.getElementById('monthly-svg');
  if (!el || !monthly?.length) return;

  const W = el.clientWidth || 680, H = 200;
  const PAD = { t: 14, r: 16, b: 32, l: 52 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const vals = monthly.map(m => m.totalR);
  const vMax = Math.max(...vals, 0.01);
  const vMin = Math.min(...vals, -0.01);
  const vRange = vMax - vMin || 1;

  const n = monthly.length;
  const barW = Math.max(2, (iW / n) - 1.5);
  const zero = PAD.t + iH - ((0 - vMin) / vRange) * iH;

  const bars = monthly.map((m, i) => {
    const x = PAD.l + (i / n) * iW;
    const y1 = PAD.t + iH - ((m.totalR - vMin) / vRange) * iH;
    const top = Math.min(zero, y1);
    const h   = Math.max(1, Math.abs(zero - y1));
    const col = m.totalR >= 0 ? 'var(--green)' : 'var(--red)';
    return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" fill-opacity="0.85"/>`;
  }).join('');

  const xLabels = monthly.map((m, i) => {
    if (i > 0 && m.yearMonth.slice(0, 4) === monthly[i - 1].yearMonth.slice(0, 4)) return '';
    const x = PAD.l + (i / n) * iW;
    return `<text x="${x.toFixed(1)}" y="${H - 4}" font-size="8" fill="var(--text3)">${m.yearMonth.slice(0, 4)}</text>`;
  }).join('');

  const yTicks = 4;
  const yTickHtml = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = vMin + (vRange * i / yTicks);
    const y = PAD.t + iH - ((v - vMin) / vRange) * iH;
    return `<line x1="${PAD.l - 4}" y1="${y.toFixed(1)}" x2="${W - PAD.r}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
            <text x="${PAD.l - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text3)">${v.toFixed(1)}R</text>`;
  }).join('');

  el.innerHTML = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${yTickHtml}
      <line x1="${PAD.l}" y1="${zero.toFixed(1)}" x2="${W - PAD.r}" y2="${zero.toFixed(1)}" stroke="var(--text3)" stroke-width="0.8" stroke-dasharray="3,3"/>
      ${bars}
      ${xLabels}
    </svg>`;
}

// ── Year / Month Accordion ────────────────────────────────────────────────────

function renderYearMonth(monthly) {
  const el = document.getElementById('yearmonth-container');
  if (!el || !monthly?.length) return;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const byYear = {};
  for (const m of monthly) {
    const yr = m.yearMonth.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  }

  el.innerHTML = Object.keys(byYear).sort().reverse().map(yr => {
    const months  = byYear[yr];
    const totR    = months.reduce((s, m) => s + m.totalR, 0);
    const totT    = months.reduce((s, m) => s + m.trades, 0);
    const totW    = months.reduce((s, m) => s + m.wins, 0);
    const wr      = totT > 0 ? (totW / totT * 100).toFixed(0) : '—';
    const rSign   = totR >= 0 ? '+' : '';
    const rColor  = totR >= 0 ? 'var(--green)' : 'var(--red)';
    const id      = 'ym-' + yr;

    const monthCards = months.map(m => {
      const mo    = parseInt(m.yearMonth.slice(5)) - 1;
      const mName = MONTHS[mo] ?? m.yearMonth.slice(5);
      const mWr   = m.trades > 0 ? (m.wins / m.trades * 100).toFixed(0) : '—';
      const mSign = m.totalR >= 0 ? '+' : '';
      const mCol  = m.totalR >= 0 ? 'var(--green)' : 'var(--red)';
      return `<div class="ym-month">
        <div class="ym-month-name">${mName}</div>
        <div class="ym-month-row"><span style="color:var(--text3)">Trades</span><span class="ym-month-val">${m.trades}</span></div>
        <div class="ym-month-row"><span style="color:var(--text3)">Win %</span><span class="ym-month-val">${mWr}%</span></div>
        <div class="ym-month-row"><span style="color:var(--text3)">P&amp;L</span><span class="ym-month-val" style="color:${mCol}">${mSign}${m.totalR.toFixed(1)}R</span></div>
      </div>`;
    }).join('');

    return `<div class="ym-year">
      <div class="ym-year-hdr" onclick="this.classList.toggle('open');document.getElementById('${id}').classList.toggle('open');">
        <span class="ym-chevron">▶</span>
        <span class="ym-year-title">${yr}</span>
        <div style="flex:1"></div>
        <div class="ym-year-stats">
          <span>${totT} trades · ${wr}% WR</span>
          <span style="font-family:'DM Mono',monospace;font-weight:700;color:${rColor}">${rSign}${totR.toFixed(1)}R</span>
        </div>
      </div>
      <div class="ym-months" id="${id}">${monthCards}</div>
    </div>`;
  }).join('');
}

// ── Monte Carlo SVG ────────────────────────────────────────────────────────────

function renderMonteCarlo(mc, nTrades) {
  const el = document.getElementById('mc-svg');
  if (!el || !mc?.bands?.length) return;

  const W = el.clientWidth || 680, H = el.clientHeight || 220;
  const PAD = { t: 12, r: 16, b: 32, l: 48 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const allY = mc.bands.flatMap(b => [b.p5, b.p95]);
  const yMin = Math.min(...allY), yMax = Math.max(...allY);
  const yRange = yMax - yMin || 1;

  const sx = b  => PAD.l + (b.i / nTrades) * iW;
  const sy = v  => PAD.t + iH - ((v - yMin) / yRange) * iH;

  const band = (lo, hi, opacity, color) => {
    const top = mc.bands.map(b => `${sx(b)},${sy(b[hi])}`).join(' ');
    const bot = [...mc.bands].reverse().map(b => `${sx(b)},${sy(b[lo])}`).join(' ');
    return `<polyline points="${top} ${bot}" fill="${color}" fill-opacity="${opacity}" stroke="none"/>`;
  };

  const line = (key, color, dash = '') =>
    `<polyline points="${mc.bands.map(b => `${sx(b)},${sy(b[key])}`).join(' ')}"
       fill="none" stroke="${color}" stroke-width="1.2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;

  const zero = sy(0);
  const zeroLine = yMin < 0 && yMax > 0
    ? `<line x1="${PAD.l}" y1="${zero}" x2="${W - PAD.r}" y2="${zero}" stroke="var(--text3)" stroke-width="0.6" stroke-dasharray="3,3"/>`
    : '';

  el.innerHTML = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${band('p5',  'p95', 0.08, 'var(--blue)')}
      ${band('p25', 'p75', 0.14, 'var(--blue)')}
      ${line('p95', 'var(--blue)', '4,2')}
      ${line('p75', 'var(--blue)', '2,2')}
      ${line('p50', 'var(--blue)')}
      ${line('p25', 'var(--blue)', '2,2')}
      ${line('p5',  'var(--blue)', '4,2')}
      ${zeroLine}
      <text x="${PAD.l + 4}" y="${PAD.t + 10}" font-size="9" fill="var(--text3)">P95</text>
      <text x="${PAD.l + 4}" y="${sy(mc.bands[mc.bands.length-1].p50) + 4}" font-size="9" fill="var(--blue)">P50</text>
      <text x="${PAD.l + 4}" y="${H - 4}" font-size="9" fill="var(--text3)">P5</text>
    </svg>`;
}

// ── Bayesian Table ─────────────────────────────────────────────────────────────

function renderBayesianTable(bayesian) {
  const el = document.getElementById('bayesian-table');
  if (!el) return;

  const rows = Object.entries(bayesian)
    .filter(([, b]) => b.fires > 0)
    .sort((a, b) => (b[1].winRate ?? 0) - (a[1].winRate ?? 0));

  if (!rows.length) { el.innerHTML = '<p class="empty">No feature data yet.</p>'; return; }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Feature</th><th>Fires</th><th>Wins</th><th>Win Rate</th><th>vs All</th>
      </tr></thead>
      <tbody>${rows.map(([key, b]) => {
        const wr = b.winRate;
        const bar = wr != null ? `<div class="wr-bar"><div style="width:${(wr*100).toFixed(0)}%;background:${wr>0.5?'var(--green)':'var(--red)'}"></div></div>` : '';
        const allWR = rows.reduce((s,[,x])=>s+x.wins,0) / rows.reduce((s,[,x])=>s+x.fires,0);
        const delta = wr != null ? wr - allWR : null;
        return `<tr>
          <td>${DEFAULT_FEATURES[key]?.label ?? key}</td>
          <td>${b.fires}</td>
          <td>${b.wins}</td>
          <td>${wr != null ? pct(wr) : '—'}${bar}</td>
          <td class="${delta>0?'pos':delta<0?'neg':''}">${delta != null ? (delta>0?'+':'')+pct(delta) : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

// ── Trade Log ─────────────────────────────────────────────────────────────────

let tradeSort = { key: null, asc: true };

function renderTradeLog(trades) {
  const el = document.getElementById('trade-log');
  if (!el) return;
  if (!trades.length) { el.innerHTML = '<p class="empty">No trades.</p>'; return; }

  const sorted = [...trades];
  if (tradeSort.key) {
    sorted.sort((a, b) => {
      const va = a[tradeSort.key], vb = b[tradeSort.key];
      return tradeSort.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }

  el.innerHTML = `
    <table>
      <thead><tr>
        ${['date','dir','entry','exit','result','r'].map(k =>
          `<th class="sortable" data-k="${k}">${k.toUpperCase()} ${tradeSort.key===k?(tradeSort.asc?'↑':'↓'):''}</th>`
        ).join('')}
      </tr></thead>
      <tbody>${sorted.map(t => `<tr>
        <td>${t.date}</td>
        <td class="${t.dir==='long'?'pos':'neg'}">${t.dir}</td>
        <td>${t.entry}</td>
        <td>${t.exit}</td>
        <td class="${t.result==='tp'?'pos':t.result==='sl'?'neg':''}">${t.result.toUpperCase()}</td>
        <td class="${t.r>0?'pos':t.r<0?'neg':''}">${t.r > 0 ? '+' : ''}${t.r}R</td>
      </tr>`).join('')}</tbody>
    </table>`;

  el.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (tradeSort.key === k) tradeSort.asc = !tradeSort.asc;
      else { tradeSort.key = k; tradeSort.asc = true; }
      renderTradeLog(trades);
    });
  });
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function pct(v) { return (v * 100).toFixed(1) + '%'; }

function setProgress(status, pct) {
  const s = document.getElementById('progress-status');
  const b = document.getElementById('progress-bar');
  if (s) s.textContent = status;
  if (b) b.style.width = pct + '%';
}

function showError(msg) {
  isRunning = false;
  document.getElementById('run-btn').disabled = false;
  document.getElementById('progress-status').textContent = '⚠ ' + msg;
  document.getElementById('progress-bar').style.width = '0%';
}

function clearResults() {
  const el = document.getElementById('results-panel');
  if (el) el.style.display = 'none';
}

function checkRunReady() {
  const symbol = getSymbol();
  const ok = parsedFiles[symbol]?.m5 && parsedFiles[symbol]?.m30;
  document.getElementById('run-btn').disabled = !ok;
}

function getSymbol() {
  return document.getElementById('symbol-select')?.value || 'EURUSD';
}

function renderFeatureList() {
  const el = document.getElementById('feature-list');
  if (!el) return;
  el.innerHTML = Object.entries(DEFAULT_FEATURES).map(([key, def]) => `
    <label class="feat-row">
      <input type="checkbox" id="feat-${key}" ${def.enabled ? 'checked' : ''}/>
      <span>${def.label}</span>
    </label>`).join('');
}

function bindEvents() {
  document.getElementById('symbol-select')?.addEventListener('change', () => {
    checkRunReady();
    updateR2PreviewUrls();
  });
  document.getElementById('r2-load-btn')?.addEventListener('click', loadAllFromR2);
  document.getElementById('r2-path-tpl')?.addEventListener('input', updateR2PreviewUrls);
  document.getElementById('run-btn')?.addEventListener('click', runBacktest);
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    const dark = document.body.classList.toggle('dark');
    localStorage.setItem('bt-theme', dark ? 'dark' : 'light');
  });
  document.getElementById('cfg-save-btn')?.addEventListener('click', saveCurrentConfig);
  document.getElementById('cfg-save-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrentConfig();
  });
  bindFileInput('file-m1', 'm1');
  bindFileInput('file-m5', 'm5');
  bindFileInput('file-m30', 'm30');
  updateR2PreviewUrls();
}

function updateR2PreviewUrls() {
  const sym = getSymbol();
  const el = document.getElementById('r2-url-preview');
  if (!el) return;
  el.innerHTML = ['m30', 'm5', 'm1'].map(tf =>
    `<span class="r2-url">${r2Url(sym, tf)}</span>`
  ).join('');
}

function saveSettings() {
  const cfg = buildCfg();
  try { localStorage.setItem('bt-cfg', JSON.stringify(cfg)); } catch {}
}

function restoreSettings() {
  try {
    const raw = localStorage.getItem('bt-cfg');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    const s = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    s('cfg-rr',     cfg.rrRatio);
    s('cfg-sl',     cfg.slFraction);
    s('cfg-conv',   cfg.minConviction);
    s('cfg-conf',   cfg.minConfirms);
    s('cfg-prox',   cfg.entryProximityATR);
    s('cfg-warmup', cfg.warmupDays);
    s('cfg-spread',       cfg.spread);
    s('cfg-slippage',     cfg.slippage);
    s('cfg-kill-daily',   cfg.killDaily);
    s('cfg-kill-weekly',  cfg.killWeekly);
    s('cfg-kill-monthly', cfg.killMonthly);
    if (cfg.features) {
      for (const [key, feat] of Object.entries(cfg.features)) {
        const chk = document.getElementById('feat-' + key);
        if (chk) chk.checked = !!feat.enabled;
      }
    }
  } catch {}
}
