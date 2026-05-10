// backtest.js — Backtest page controller

// ── Saved configs ──────────────────────────────────────────────────────────────

const SAVED_CFGS_KEY = 'bt-saved-cfgs';

const BEST_CONFIG_V1 = {
  id: 'best_v1',
  name: 'Best Config #1 — PF 2.1 · Sharpe 9.89',
  date: '28 Apr 2025',
  cfg: {
    rrRatio: 2.5,
    slMode: 'range',
    slFraction: 0.30,
    slMult: 1.5,
    minSlPips: 5,
    tpMode: 'fixedR',
    tpBuf: 5,
    tpAtrFallback: 5,
    tpVolLo: 2.0,
    tpVolMed: 3.0,
    tpVolHi: 5.0,
    reEnterTp: true,
    flipOnSL: false,
    minConviction: 0.20,
    minConfirms: 3,
    entryProximityATR: 0.25,
    warmupDays: 120,
    atrPeriod: 14,
    spread: 0.8,
    slippage: 0.3,
    commission: 0,
    posMode: 'fixed',
    fixedSize: 10,
    riskPct: 1.0,
    killDaily: 2,
    killWeekly: 5,
    killMonthly: 10,
    startDate: '2020-01-01',
    endDate: '2025-12-31',
    method: 'asia',
    signalFilter: 'all_conf',
    confTolPips: 2,
    tightPct: 50,
    entryWindow: 800,
    levelReentry: 2,
    enabledFibs: null,
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
      macdSignal:    { enabled: false, weight: 1, label: 'MACD (12/26/9)' },
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
  const sc = (elId, v) => { const el = document.getElementById(elId); if (el && v != null) el.checked = !!v; };
  sv('cfg-rr',              cfg.rrRatio);
  sv('cfg-sl-mode',         cfg.slMode);
  sv('cfg-sl',              cfg.slFraction);
  sv('cfg-sl-mult',         cfg.slMult);
  sv('cfg-min-sl',          cfg.minSlPips);
  sv('cfg-tp-mode',         cfg.tpMode);
  sv('cfg-tp-buf',          cfg.tpBuf);
  sv('cfg-tp-atr-fallback', cfg.tpAtrFallback);
  sv('cfg-tp-vol-lo',       cfg.tpVolLo);
  sv('cfg-tp-vol-med',      cfg.tpVolMed);
  sv('cfg-tp-vol-hi',       cfg.tpVolHi);
  sc('cfg-reenter-tp',      cfg.reEnterTp);
  sc('cfg-flip-on-sl',      cfg.flipOnSL);
  sv('cfg-conv',            cfg.minConviction);
  sv('cfg-conf',            cfg.minConfirms);
  sv('cfg-prox',            cfg.entryProximityATR);
  sv('cfg-warmup',          cfg.warmupDays);
  sv('cfg-atr-period',      cfg.atrPeriod);
  sv('cfg-spread',          cfg.spread);
  sv('cfg-slippage',        cfg.slippage);
  sv('cfg-commission',      cfg.commission);
  sv('cfg-pos-mode',        cfg.posMode);
  sv('cfg-fixed-size',      cfg.fixedSize);
  sv('cfg-risk-pct',        cfg.riskPct);
  sv('cfg-kill-daily',      cfg.killDaily);
  sv('cfg-kill-weekly',     cfg.killWeekly);
  sv('cfg-kill-monthly',    cfg.killMonthly);
  sv('cfg-start-date',      cfg.startDate);
  sv('cfg-end-date',        cfg.endDate);
  sv('cfg-method',          cfg.method);
  sv('cfg-signal-filter',   cfg.signalFilter);
  sv('cfg-conf-tol',        cfg.confTolPips);
  sv('cfg-tight-pct',       cfg.tightPct);
  sv('cfg-ew',              cfg.entryWindow);
  sv('cfg-reentry',         cfg.levelReentry);
  sv('cfg-candle-n',        cfg.candleConfirmN);
  sv('cfg-candle-pct',      cfg.candleConfirmPct);
  sc('cfg-require-sweep',   cfg.requireSweep);
  sv('cfg-sweep-pips',      cfg.sweepPips);
  sc('cfg-second-touch',    cfg.secondTouchOnly);
  if (cfg.enabledFibs) {
    const fibSet = new Set(cfg.enabledFibs.map(String));
    document.querySelectorAll('.fib-chk').forEach(chk => {
      chk.checked = fibSet.has(chk.dataset.fib);
    });
  }
  if (cfg.features) {
    for (const [key, feat] of Object.entries(cfg.features)) {
      const chk = document.getElementById('feat-' + key);
      if (chk) chk.checked = !!feat.enabled;
    }
  }
  onSlModeChange();
  onTpModeChange();
  onPosModeChange();
  onSweepChange();
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

// URL pattern: {SYMBOL}/{symbol_lower}-m{tf}-bid.csv
// e.g. EURUSD/eurusd-m30-bid.csv
function r2Url(symbol, tf) {
  const tplEl = document.getElementById('r2-path-tpl');
  if (tplEl?.value?.trim()) {
    const tpl = tplEl.value.trim();
    return R2_BASE + '/' + tpl
      .replace('{symbol}', symbol)
      .replace('{symbol_lower}', symbol.toLowerCase())
      .replace('{tf}', tf.replace('m', ''));
  }
  return `${R2_BASE}/${symbol}/${symbol.toLowerCase()}-${tf}-bid.csv`;
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
  macdSignal:    { enabled: false, weight: 1, label: 'MACD (12/26/9)' },
};

// ── SD Level (fib) filter ──────────────────────────────────────────────────────

const FIB_SELL = [1.5, 2, 2.5, 3, 3.5, 4, 5, 6];
const FIB_MID  = [0, 0.25, 0.5, 0.75, 1];
const FIB_BUY  = [-0.25, -0.5, -0.75, -1, -1.5, -2, -3, -4];

function initFibCheckboxes() {
  _renderFibGroup('fib-chk-sell', FIB_SELL);
  _renderFibGroup('fib-chk-mid',  FIB_MID);
  _renderFibGroup('fib-chk-buy',  FIB_BUY);
}

function _renderFibGroup(elId, fibs) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = fibs.map(f => `
    <label class="fib-chk-item">
      <input type="checkbox" class="fib-chk" data-fib="${f}" checked/>
      <span>${f > 0 ? '+' : ''}${f}</span>
    </label>`).join('');
}

function fibSelectAll(checked) {
  document.querySelectorAll('.fib-chk').forEach(chk => { chk.checked = checked; });
}

function fibSelectPreset(preset) {
  const sell = new Set(FIB_SELL.map(String));
  const mid  = new Set(FIB_MID.map(String));
  const buy  = new Set(FIB_BUY.map(String));
  document.querySelectorAll('.fib-chk').forEach(chk => {
    const f = chk.dataset.fib;
    if (preset === 'sell')      chk.checked = sell.has(f);
    else if (preset === 'mid')  chk.checked = mid.has(f);
    else if (preset === 'buy')  chk.checked = buy.has(f);
  });
}

function getEnabledFibs() {
  const out = [];
  document.querySelectorAll('.fib-chk').forEach(chk => {
    if (chk.checked) out.push(parseFloat(chk.dataset.fib));
  });
  return out;
}

const parsedFiles = {}; // symbol → {m1,m5,m30}: true when parsed
let worker = null;
let isRunning = false;

// ── Init ───────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initFibCheckboxes();
  renderFeatureList();
  bindEvents();
  restoreSettings();
  onSlModeChange();
  onTpModeChange();
  onPosModeChange();
  onSweepChange();
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
  const g  = (id) => document.getElementById(id)?.value;
  const gb = (id) => document.getElementById(id)?.checked ?? false;
  const features = {};
  for (const [key, def] of Object.entries(DEFAULT_FEATURES)) {
    const chk = document.getElementById('feat-' + key);
    features[key] = { ...def, enabled: chk ? chk.checked : def.enabled };
  }
  return {
    // SL
    slMode:            g('cfg-sl-mode')              || 'range',
    slFraction:        parseFloat(g('cfg-sl'))        || 0.35,
    slMult:            parseFloat(g('cfg-sl-mult'))   || 1.5,
    minSlPips:         parseFloat(g('cfg-min-sl'))    || 5,
    // TP
    tpMode:            g('cfg-tp-mode')               || 'fixedR',
    rrRatio:           parseFloat(g('cfg-rr'))        || 2.2,
    tpBuf:             parseFloat(g('cfg-tp-buf'))    || 5,
    tpAtrFallback:     parseFloat(g('cfg-tp-atr-fallback')) || 5,
    tpVolLo:           parseFloat(g('cfg-tp-vol-lo')) || 2.0,
    tpVolMed:          parseFloat(g('cfg-tp-vol-med'))|| 3.0,
    tpVolHi:           parseFloat(g('cfg-tp-vol-hi')) || 5.0,
    reEnterTp:         gb('cfg-reenter-tp'),
    flipOnSL:          gb('cfg-flip-on-sl'),
    // Entry
    minConviction:     parseFloat(g('cfg-conv'))      || 0,
    minConfirms:       parseInt(g('cfg-conf'))        || 2,
    entryProximityATR: parseFloat(g('cfg-prox'))      || 0.30,
    warmupDays:        parseInt(g('cfg-warmup'))      || 100,
    atrPeriod:         parseInt(g('cfg-atr-period'))  || 14,
    // Costs
    spread:            parseFloat(g('cfg-spread'))    || 0,
    slippage:          parseFloat(g('cfg-slippage'))  || 0,
    commission:        parseFloat(g('cfg-commission'))|| 0,
    // Position sizing
    posMode:           g('cfg-pos-mode')              || 'fixed',
    fixedSize:         parseFloat(g('cfg-fixed-size'))|| 10,
    riskPct:           parseFloat(g('cfg-risk-pct'))  || 1.0,
    // Kill switches
    killDaily:         parseFloat(g('cfg-kill-daily'))   || 0,
    killWeekly:        parseFloat(g('cfg-kill-weekly'))  || 0,
    killMonthly:       parseFloat(g('cfg-kill-monthly')) || 0,
    // Dates / method
    startDate:         g('cfg-start-date')            || '2020-01-01',
    endDate:           g('cfg-end-date')              || '2025-12-31',
    method:            g('cfg-method')                || 'asia',
    signalFilter:      g('cfg-signal-filter')         || 'all_conf',
    confTolPips:       parseFloat(g('cfg-conf-tol'))  || 2,
    tightPct:          parseFloat(g('cfg-tight-pct')) || 50,
    entryWindow:       parseInt(g('cfg-ew'))          || 800,
    levelReentry:      parseInt(g('cfg-reentry'))     || 2,
    // Entry quality filters
    candleConfirmN:    parseInt(g('cfg-candle-n'))    || 0,
    candleConfirmPct:  parseFloat(g('cfg-candle-pct'))|| 0.6,
    requireSweep:      gb('cfg-require-sweep'),
    sweepPips:         parseFloat(g('cfg-sweep-pips'))|| 2,
    secondTouchOnly:   gb('cfg-second-touch'),
    enabledFibs:       getEnabledFibs(),
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

// ── IS / OOS date split ────────────────────────────────────────────────────────

function applyIsOosSplit(fraction) {
  const startEl = document.getElementById('cfg-start-date');
  const endEl   = document.getElementById('cfg-end-date');
  if (!startEl || !endEl) return;
  const startMs = new Date(startEl.value || '2020-01-01').getTime();
  const endMs   = new Date(endEl.value   || '2025-12-31').getTime();
  if (endMs <= startMs) return;
  const splitMs  = startMs + (endMs - startMs) * fraction;
  const splitStr = new Date(splitMs).toISOString().slice(0, 10);
  // Store full range so we can toggle OOS
  if (!document._isOosRange) {
    document._isOosRange = { start: startEl.value, end: endEl.value };
  }
  endEl.value = splitStr;
  setProgress(`IS period: ${startEl.value} → ${splitStr}`, 0);
}

function applyOosOnly(fraction) {
  const base = document._isOosRange;
  if (!base) { setProgress('Set IS first', 0); return; }
  const startMs  = new Date(base.start).getTime();
  const endMs    = new Date(base.end).getTime();
  const splitMs  = startMs + (endMs - startMs) * fraction;
  const splitStr = new Date(splitMs).toISOString().slice(0, 10);
  document.getElementById('cfg-start-date').value = splitStr;
  document.getElementById('cfg-end-date').value   = base.end;
  setProgress(`OOS period: ${splitStr} → ${base.end}`, 0);
}

function resetDateRange() {
  const base = document._isOosRange;
  if (!base) return;
  document.getElementById('cfg-start-date').value = base.start;
  document.getElementById('cfg-end-date').value   = base.end;
  document._isOosRange = null;
  setProgress('Full date range restored', 0);
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
  document.getElementById('results-panel').style.display = 'flex';
  const ph = document.getElementById('bt-placeholder');
  if (ph) ph.style.display = 'none';

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
    { id: 'stat-kelly',   label: 'Kelly %',        val: d.kelly,              fmt: v => pct(v) },
    { id: 'stat-wins',    label: 'Wins',           val: d.wins,               fmt: v => v },
    { id: 'stat-losses',  label: 'Losses',         val: d.losses,             fmt: v => v },
    { id: 'stat-years',   label: 'Period',         val: d.dateRange?.years,   fmt: v => (v || '—') + ' yr' },
    { id: 'stat-becost',  label: 'Max Cost (pip)', val: d.breakEvenCostPips,  fmt: v => v > 0 ? v.toFixed(2) + 'p' : '—' },
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
    const costPips   = d.costsPips  || 0;
    const commision  = d.commission || 0;
    if (costPips > 0 || commision > 0) {
      costBanner.style.display = 'block';
      const parts = [];
      if (costPips > 0)  parts.push(`${costPips.toFixed(1)} pip/trade (spread + slippage)`);
      if (commision > 0) parts.push(`£${commision}/lot commission`);
      costBanner.textContent = `💰 Transaction costs: ${parts.join(' · ')}`;
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
  const PAD = { t: 14, r: 72, b: 32, l: 52 }; // extra right margin for Sharpe axis
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const vals = monthly.map(m => m.totalR);
  const vMax = Math.max(...vals, 0.01);
  const vMin = Math.min(...vals, -0.01);
  const vRange = vMax - vMin || 1;

  const n = monthly.length;
  const barW = Math.max(2, (iW / n) - 1.5);
  const zero = PAD.t + iH - ((0 - vMin) / vRange) * iH;

  const bars = monthly.map((m, i) => {
    const x  = PAD.l + (i / n) * iW;
    const y1 = PAD.t + iH - ((m.totalR - vMin) / vRange) * iH;
    const top = Math.min(zero, y1);
    const h   = Math.max(1, Math.abs(zero - y1));
    const col = m.totalR >= 0 ? 'var(--green)' : 'var(--red)';
    return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" fill-opacity="0.85"/>`;
  }).join('');

  // ── Rolling 12-month Sharpe overlay ──────────────────────────────────────
  const sharpeWindow = 12;
  const sharpeVals = monthly.map((_, i) => {
    if (i < sharpeWindow - 1) return null;
    const slice = monthly.slice(i - sharpeWindow + 1, i + 1).map(m => m.totalR);
    const mean  = slice.reduce((a, b) => a + b, 0) / sharpeWindow;
    const std   = Math.sqrt(slice.reduce((a, v) => a + (v - mean) ** 2, 0) / sharpeWindow);
    return std > 0 ? (mean / std) * Math.sqrt(12) : 0; // annualised
  });

  const validSharpes = sharpeVals.filter(v => v !== null);
  const sMax = validSharpes.length ? Math.max(...validSharpes,  5) :  5;
  const sMin = validSharpes.length ? Math.min(...validSharpes, -3) : -3;
  const sRange = sMax - sMin || 1;
  const sy = v => PAD.t + iH - ((v - sMin) / sRange) * iH;

  const sharpePts = sharpeVals
    .map((v, i) => v === null ? null : `${(PAD.l + (i / n) * iW + barW / 2).toFixed(1)},${sy(v).toFixed(1)}`)
    .filter(Boolean);

  const sharpePolyline = sharpePts.length > 1
    ? `<polyline points="${sharpePts.join(' ')}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-opacity="0.8" stroke-dasharray="0"/>`
    : '';

  // Sharpe = 0 line on right axis
  const s0y = sy(0);
  const sharpeAxis = `
    <line x1="${W - PAD.r + 4}" y1="${PAD.t.toFixed(1)}" x2="${W - PAD.r + 4}" y2="${(PAD.t + iH).toFixed(1)}" stroke="var(--blue)" stroke-width="0.5" stroke-opacity="0.4"/>
    <text x="${W - PAD.r + 6}" y="${(PAD.t + 8).toFixed(1)}" font-size="8" fill="var(--blue)" fill-opacity="0.7">S:${sMax.toFixed(1)}</text>
    <text x="${W - PAD.r + 6}" y="${(s0y + 3).toFixed(1)}" font-size="8" fill="var(--blue)" fill-opacity="0.7">0</text>
    <text x="${W - PAD.r + 6}" y="${(PAD.t + iH).toFixed(1)}" font-size="8" fill="var(--blue)" fill-opacity="0.7">${sMin.toFixed(1)}</text>
    <text x="${W - PAD.r + 2}" y="${(PAD.t + iH / 2).toFixed(1)}" font-size="7" fill="var(--blue)" fill-opacity="0.6" writing-mode="tb">12m Sharpe</text>`;

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
      ${sharpePolyline}
      ${sharpeAxis}
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

  const sortTh = (k, label) =>
    `<th class="sortable" data-k="${k}">${label} ${tradeSort.key===k?(tradeSort.asc?'↑':'↓'):''}</th>`;

  const rows = sorted.map((t, i) => {
    const dirCls  = t.dir === 'long' ? 'pos' : 'neg';
    const resCls  = t.result === 'tp' ? 'pos' : t.result === 'sl' ? 'neg' : '';
    const rCls    = t.r > 0 ? 'pos' : t.r < 0 ? 'neg' : '';
    const sdLabel = t.todayFib != null
      ? `<span class="tl-sd">SD${t.todayFib}${t.yestFib != null ? `<span class="tl-sd-y">↔${t.yestFib}</span>` : ''}</span>`
      : '<span style="color:var(--text3)">—</span>';

    // Feature vote pills
    const hasFeat = t.features?.length > 0;
    const detailId = `tl-feat-${i}`;
    const chevron  = hasFeat
      ? `<button class="tl-expand-btn" onclick="tlToggle('${detailId}')">▶</button>`
      : '';

    let featRow = '';
    if (hasFeat) {
      const pills = t.features.map(f => {
        const sc = f.signal === 'long'  ? 'tl-feat-long'
                 : f.signal === 'short' ? 'tl-feat-short'
                 :                        'tl-feat-null';
        const arrow = f.signal === 'long' ? '↑' : f.signal === 'short' ? '↓' : '—';
        const ptsTxt = f.pts > 0 ? `+${f.pts}` : f.pts < 0 ? `${f.pts}` : '0';
        const ptsC   = f.pts > 0 ? 'tl-pts-pos' : f.pts < 0 ? 'tl-pts-neg' : 'tl-pts-nil';
        return `<span class="tl-feat-pill ${sc}" title="${f.val}">${f.icon || ''} ${f.label} <span class="tl-feat-arrow">${arrow}</span> <span class="${ptsC}">${ptsTxt}</span></span>`;
      }).join('');
      featRow = `<tr id="${detailId}" class="tl-feat-row" style="display:none">
        <td colspan="8"><div class="tl-feat-wrap">${pills}</div></td>
      </tr>`;
    }

    return `<tr class="tl-main-row">
      <td class="tl-chevron-cell">${chevron}</td>
      <td>${t.date}</td>
      <td class="${dirCls}">${t.dir === 'long' ? '↑ Long' : '↓ Short'}</td>
      <td class="mono">${t.entry}</td>
      <td class="mono">${t.exit}</td>
      <td>${sdLabel}</td>
      <td class="${resCls}">${t.result.toUpperCase()}</td>
      <td class="${rCls} mono">${t.r > 0 ? '+' : ''}${t.r}R${t.tag ? ` <span style="color:var(--text3);font-size:9px">${t.tag}</span>` : ''}</td>
    </tr>${featRow}`;
  }).join('');

  el.innerHTML = `
    <table class="tl-table">
      <thead><tr>
        <th style="width:18px"></th>
        ${sortTh('date','Date')}
        ${sortTh('dir','Dir')}
        ${sortTh('entry','Entry')}
        ${sortTh('exit','Exit')}
        <th>SD Level</th>
        ${sortTh('result','Result')}
        ${sortTh('r','R')}
      </tr></thead>
      <tbody>${rows}</tbody>
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

function tlToggle(id) {
  const row = document.getElementById(id);
  if (!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : 'table-row';
  const btn = row.previousElementSibling?.querySelector('.tl-expand-btn');
  if (btn) btn.textContent = open ? '▶' : '▼';
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
  const ph = document.getElementById('bt-placeholder');
  if (ph) ph.style.display = 'flex';
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

// ── Conditional sub-row visibility ────────────────────────────────────────────

function onSlModeChange() {
  const mode = document.getElementById('cfg-sl-mode')?.value || 'range';
  const show = (id, vis) => { const el = document.getElementById(id); if (el) el.classList.toggle('visible', vis); };
  show('sl-atr-row',   mode === 'atr' || mode === 'atr30m');
  show('sl-range-row', mode === 'range');
}

function onTpModeChange() {
  const mode = document.getElementById('cfg-tp-mode')?.value || 'fixedR';
  const show = (id, vis) => { const el = document.getElementById(id); if (el) el.classList.toggle('visible', vis); };
  show('tp-fixedr-row',   mode === 'fixedR');
  show('tp-buf-row',      mode === 'structural');
  show('tp-vol-lo-row',   mode === 'volScaledR');
  show('tp-vol-med-row',  mode === 'volScaledR');
  show('tp-vol-hi-row',   mode === 'volScaledR');
  show('tp-fallback-row', mode === 'structural' || mode === 'volScaledR');
}

function onSweepChange() {
  const on = document.getElementById('cfg-require-sweep')?.checked;
  const row = document.getElementById('sweep-pips-row');
  if (row) row.style.display = on ? '' : 'none';
}

function onPosModeChange() {
  const mode = document.getElementById('cfg-pos-mode')?.value || 'fixed';
  const show = (id, vis) => { const el = document.getElementById(id); if (el) el.classList.toggle('visible', vis); };
  show('pos-fixed-row', mode === 'fixed');
  show('pos-pct-row',   mode === 'percent');
}

// Expose functions called from inline HTML onclick handlers (module scope workaround)
window.loadConfig        = loadConfig;
window.deleteConfig      = deleteConfig;
window.fibSelectAll      = fibSelectAll;
window.fibSelectPreset   = fibSelectPreset;
window.applyIsOosSplit   = applyIsOosSplit;
window.applyOosOnly      = applyOosOnly;
window.resetDateRange    = resetDateRange;
window.switchChartTab    = switchChartTab;
window.onSlModeChange    = onSlModeChange;
window.onTpModeChange    = onTpModeChange;
window.onPosModeChange   = onPosModeChange;
window.onSweepChange     = onSweepChange;
window.tlToggle          = tlToggle;

function restoreSettings() {
  try {
    const raw = localStorage.getItem('bt-cfg');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    const s  = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const sc = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.checked = !!v; };
    s('cfg-sl-mode',         cfg.slMode);
    s('cfg-sl',              cfg.slFraction);
    s('cfg-sl-mult',         cfg.slMult);
    s('cfg-min-sl',          cfg.minSlPips);
    s('cfg-tp-mode',         cfg.tpMode);
    s('cfg-rr',              cfg.rrRatio);
    s('cfg-tp-buf',          cfg.tpBuf);
    s('cfg-tp-atr-fallback', cfg.tpAtrFallback);
    s('cfg-tp-vol-lo',       cfg.tpVolLo);
    s('cfg-tp-vol-med',      cfg.tpVolMed);
    s('cfg-tp-vol-hi',       cfg.tpVolHi);
    sc('cfg-reenter-tp',     cfg.reEnterTp);
    sc('cfg-flip-on-sl',     cfg.flipOnSL);
    s('cfg-conv',            cfg.minConviction);
    s('cfg-conf',            cfg.minConfirms);
    s('cfg-prox',            cfg.entryProximityATR);
    s('cfg-warmup',          cfg.warmupDays);
    s('cfg-atr-period',      cfg.atrPeriod);
    s('cfg-spread',          cfg.spread);
    s('cfg-slippage',        cfg.slippage);
    s('cfg-commission',      cfg.commission);
    s('cfg-pos-mode',        cfg.posMode);
    s('cfg-fixed-size',      cfg.fixedSize);
    s('cfg-risk-pct',        cfg.riskPct);
    s('cfg-kill-daily',      cfg.killDaily);
    s('cfg-kill-weekly',     cfg.killWeekly);
    s('cfg-kill-monthly',    cfg.killMonthly);
    s('cfg-start-date',      cfg.startDate);
    s('cfg-end-date',        cfg.endDate);
    s('cfg-method',          cfg.method);
    s('cfg-signal-filter',   cfg.signalFilter);
    s('cfg-conf-tol',        cfg.confTolPips);
    s('cfg-tight-pct',       cfg.tightPct);
    s('cfg-ew',              cfg.entryWindow);
    s('cfg-reentry',         cfg.levelReentry);
    s('cfg-candle-n',        cfg.candleConfirmN);
    s('cfg-candle-pct',      cfg.candleConfirmPct);
    sc('cfg-require-sweep',  cfg.requireSweep);
    s('cfg-sweep-pips',      cfg.sweepPips);
    sc('cfg-second-touch',   cfg.secondTouchOnly);
    if (cfg.enabledFibs) {
      const fibSet = new Set(cfg.enabledFibs.map(String));
      document.querySelectorAll('.fib-chk').forEach(chk => {
        chk.checked = fibSet.has(chk.dataset.fib);
      });
    }
    if (cfg.features) {
      for (const [key, feat] of Object.entries(cfg.features)) {
        const chk = document.getElementById('feat-' + key);
        if (chk) chk.checked = !!feat.enabled;
      }
    }
    onSlModeChange();
    onTpModeChange();
    onPosModeChange();
  } catch {}
}
