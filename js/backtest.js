// backtest.js — Backtest page controller

// ── Default config ─────────────────────────────────────────────────────────────

const DEFAULT_FEATURES = {
  chochBos:      { enabled: true,  weight: 1, label: 'CHoCH / BOS' },
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
  const lbl = document.getElementById(`lbl-${tf}`);
  if (lbl) lbl.textContent = `${(count/1000).toFixed(0)}k bars ✓`;
  lbl?.classList.add('parsed');
  checkRunReady();
  setProgress('File loaded.', 0);
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
    rrRatio:           parseFloat(g('cfg-rr'))   || 2.2,
    slFraction:        parseFloat(g('cfg-sl'))   || 0.35,
    minConviction:     parseFloat(g('cfg-conv')) || 0,
    minConfirms:       parseInt(g('cfg-conf'))   || 2,
    entryProximityATR: parseFloat(g('cfg-prox')) || 0.30,
    warmupDays:        parseInt(g('cfg-warmup')) || 100,
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

  // ── Charts ───────────────────────────────────────────────────────────────
  renderEquityCurve(d.equityCurve, d.dateRange);
  if (mc) renderMonteCarlo(mc, d.totalTrades);

  // ── Bayesian table ───────────────────────────────────────────────────────
  renderBayesianTable(d.bayesian);

  // ── Trade log ────────────────────────────────────────────────────────────
  renderTradeLog(d.tradeSample);
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
  document.getElementById('symbol-select')?.addEventListener('change', checkRunReady);
  document.getElementById('run-btn')?.addEventListener('click', runBacktest);
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    const dark = document.body.classList.toggle('dark');
    localStorage.setItem('bt-theme', dark ? 'dark' : 'light');
  });
  bindFileInput('file-m1', 'm1');
  bindFileInput('file-m5', 'm5');
  bindFileInput('file-m30', 'm30');
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
    if (cfg.features) {
      for (const [key, feat] of Object.entries(cfg.features)) {
        const chk = document.getElementById('feat-' + key);
        if (chk) chk.checked = !!feat.enabled;
      }
    }
  } catch {}
}
