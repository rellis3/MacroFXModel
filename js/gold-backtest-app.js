// gold-backtest-app.js — Gold strategy backtester frontend controller

const R2_BASE = 'https://pub-1d8354116ae54e158e7010f0deb8f6e6.r2.dev';
const GOLD_SYM = 'XAUUSD';

let _worker  = null;
let _result  = null;
let _isResult  = null;
let _oosResult = null;

// ── Worker management ─────────────────────────────────────────────────────────

function ensureWorker() {
  if (_worker) return _worker;
  _worker = new Worker('./js/gold-backtest-worker.js', { type: 'module' });
  _worker.onmessage = (e) => onWorkerMessage(e);
  _worker.onerror   = (e) => setStatus(`Worker error: ${e.message}`, 'error');
  return _worker;
}

function onWorkerMessage({ data: { type, payload } }) {
  if (type === 'progress') {
    const pct = payload.pct ?? 0;
    const msg = payload.status ?? `${payload.tf ?? ''} rows ${payload.rows ? fmtNum(payload.rows) : ''}`.trim();
    setStatus(msg, 'running', pct);
  } else if (type === 'parsed') {
    _parsed[payload.tf] = true;
    setStatus(`${payload.tf} parsed — ${fmtNum(payload.count)} bars`, 'running');
    checkAllParsed();
  } else if (type === 'result') {
    _result = payload;
    renderResults(payload);
    setStatus(`Done — ${fmtNum(payload.totalTrades)} trades · Sharpe ${payload.allStats?.sharpe ?? '—'}`, 'done');
    setRunning(false);
  } else if (type === 'error') {
    setStatus(payload, 'error');
    setRunning(false);
  }
}

// ── Fetch state ───────────────────────────────────────────────────────────────
const _parsed = { m1: false, m5: false, m30: false };
let   _pendingRun = null;

function checkAllParsed() {
  if (['m1', 'm5', 'm30'].every(tf => _parsed[tf]) && _pendingRun) {
    const cfg = _pendingRun;
    _pendingRun = null;
    ensureWorker().postMessage({ type: 'run', payload: cfg });
  }
}

// ── R2 fetch with streaming progress ─────────────────────────────────────────

// Track per-tf download progress for combined display
const _dlPct = { m1: 0, m5: 0, m30: 0 };

async function fetchAndParse(tf) {
  const url = `${R2_BASE}/${GOLD_SYM}/${GOLD_SYM.toLowerCase()}-m${tf}-bid.csv`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for M${tf}`);
    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total > 0) {
        _dlPct[`m${tf}`] = loaded / total;
        const combined = Math.round((_dlPct.m1 + _dlPct.m5 + _dlPct.m30) / 3 * 40);
        setStatus(`Downloading M1 + M5 + M30 from R2… M${tf}: ${fmtBytes(loaded)}/${fmtBytes(total)}`, 'running', combined);
      }
    }
    const buf  = await new Blob(chunks).text();
    _parsed[`m${tf}`] = false; // reset — set true when worker posts 'parsed'
    ensureWorker().postMessage({ type: 'parse', payload: { tf: `m${tf}`, text: buf } });
  } catch (err) {
    setStatus(`Failed to load M${tf}: ${err.message}`, 'error');
    throw err;
  }
}

// ── Build config ──────────────────────────────────────────────────────────────

function buildCfg() {
  const v = (id, def) => {
    const el = document.getElementById(id);
    if (!el) return def;
    if (el.type === 'checkbox') return el.checked;
    const n = parseFloat(el.value);
    return isNaN(n) ? (el.value || def) : n;
  };
  return {
    startDate:       document.getElementById('cfg-start')?.value || '2018-01-01',
    endDate:         document.getElementById('cfg-end')?.value   || '2025-12-31',
    isSplit:         v('cfg-is-split', 0),
    wfoEnabled:      v('cfg-wfo', false),
    wfoIsMonths:     v('cfg-wfo-is', 6),
    wfoOosMonths:    v('cfg-wfo-oos', 2),
    riskPct:         v('cfg-risk', 1.0),
    slAtrMult:       v('cfg-sl-atr', 1.3),
    tp1R:            v('cfg-tp1r', 1.5),
    tp2R:            v('cfg-tp2r', 2.5),
    tp1PartialPct:   v('cfg-tp1-pct', 50) / 100,
    spread:          v('cfg-spread', 0.3),
    fibTolPips:      v('cfg-fib-tol', 200),
    minConviction:   v('cfg-min-conv', 0),
    minConfirms:     v('cfg-min-conf', 2),
    vwapChopMult:    v('cfg-vwap-chop', 0.25),
    minVmuComponents: v('cfg-vmu-min', 2),
    sessionStart:    v('cfg-sess-start', 7),
    sessionEnd:      v('cfg-sess-end', 19),
    warmupDays:      v('cfg-warmup', 60),
    maxDailyTrades:  v('cfg-max-daily', 3),
    useStructuralFib: v('gate-struct-fib', true),
    useSessionBonus:  v('gate-session-bonus', true),
    usePivot:        v('gate-pivot', true),
    useVwapChop:     v('gate-vwap-chop', true),
    useVmu:          v('gate-vmu', true),
    requireVmuAgree: v('gate-vmu-agree', false),
    useSession:      v('gate-session', true),
    useChoch:        v('gate-choch', true),
    useHtfEma:       v('gate-htf-ema', true),
    useAdx:          v('gate-adx', false),
  };
}

// ── Run backtest ──────────────────────────────────────────────────────────────

async function runBacktest() {
  setRunning(true);
  setStatus('Initialising…', 'running', 0);
  clearResults();

  const cfg = buildCfg();
  _pendingRun = cfg;

  // Reset parsed state
  _parsed.m1 = false; _parsed.m5 = false; _parsed.m30 = false;

  // Kill and recreate worker for a clean state on each run
  if (_worker) { _worker.terminate(); _worker = null; }
  const w = ensureWorker(); // creates fresh worker with correct onmessage handler
  void w;

  // Load M5 + M30 in parallel; M1 in parallel but failure is caught gracefully
  // (M1 may not exist on R2 for gold — fall back to M5 with a warning)
  const m5fetch  = fetchAndParse('5');
  const m30fetch = fetchAndParse('30');
  const m1fetch  = fetchAndParse('1').catch(err => {
    console.warn('[gold-bt] M1 not found:', err.message);
    _parsed.m1 = true; // allow run to proceed without M1 (worker will warn)
    checkAllParsed();
  });

  try {
    await Promise.all([m5fetch, m30fetch, m1fetch]);
  } catch (e) {
    setStatus(`Load failed: ${e.message}`, 'error');
    setRunning(false);
  }
}


// ── UI helpers ────────────────────────────────────────────────────────────────

function setRunning(isRunning) {
  const btn = document.getElementById('run-btn');
  if (btn) { btn.disabled = isRunning; btn.textContent = isRunning ? 'Running…' : 'Run Backtest'; }
}

function setStatus(msg, cls = '', pct = -1) {
  const el = document.getElementById('status-bar');
  if (!el) return;
  el.className = 'status-bar ' + cls;
  el.textContent = msg;
  const bar = document.getElementById('progress-fill');
  if (bar) bar.style.width = pct >= 0 ? pct + '%' : '0%';
}

function clearResults() {
  const r = document.getElementById('results-area');
  if (r) r.innerHTML = '<div class="placeholder">Run the backtest to see results</div>';
}

function fmtNum(n) { return n?.toLocaleString() ?? '—'; }
function fmtPct(v, d = 1) { return v == null ? '—' : v.toFixed(d) + '%'; }
function fmtR(v, d = 2)   { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + 'R'; }
function fmtBytes(b) {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b / 1024).toFixed(0) + 'KB';
  return (b / 1048576).toFixed(1) + 'MB';
}

function statColor(v, good = 'green') {
  if (v == null || v === '—') return '';
  const n = parseFloat(v);
  if (isNaN(n)) return '';
  return n > 0 ? `color:var(--${good})` : n < 0 ? 'color:var(--red)' : '';
}

// ── Render results ────────────────────────────────────────────────────────────

function renderResults(data) {
  const { allStats: s, isStats, oosStats, sessions, days, levels, variants, mc, wfoResults, tradeSample, cfg } = data;
  if (!s) { clearResults(); return; }

  const area = document.getElementById('results-area');
  area.innerHTML = '';

  // ── Summary cards ──────────────────────────────────────────────────────────
  area.insertAdjacentHTML('beforeend', `
    <div class="stat-grid">
      ${statCard('Trades', fmtNum(s.n))}
      ${statCard('Win Rate', fmtPct(s.winRate), statColor(s.winRate - 50))}
      ${statCard('Profit Factor', s.profitFactor === 99 ? '∞' : s.profitFactor?.toFixed(2) ?? '—', statColor(s.profitFactor - 1))}
      ${statCard('Sharpe', s.sharpe?.toFixed(2) ?? '—', statColor(s.sharpe))}
      ${statCard('CAGR', fmtPct(s.cagr), statColor(s.cagr))}
      ${statCard('Max DD', fmtPct(s.maxDD), s.maxDD > 20 ? 'color:var(--red)' : 'color:var(--green)')}
      ${statCard('MFE Capture', fmtPct(s.mfeCaptureRatio * 100), statColor(s.mfeCaptureRatio - 0.3))}
      ${statCard('Avg R', fmtR(s.meanR), statColor(s.meanR))}
    </div>
  `);

  // ── Tab system ────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'tab-equity',   label: 'Equity' },
    { id: 'tab-isoos',    label: 'IS/OOS', hide: !isStats && !oosStats },
    { id: 'tab-wfo',      label: 'WFO',    hide: !wfoResults?.length },
    { id: 'tab-sessions', label: 'Sessions' },
    { id: 'tab-levels',   label: 'Levels' },
    { id: 'tab-trades',   label: 'Trades' },
  ].filter(t => !t.hide);

  area.insertAdjacentHTML('beforeend', `
    <div class="tab-bar">
      ${tabs.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" onclick="switchTab('${t.id}',this)">${t.label}</button>`).join('')}
    </div>
    <div id="tab-content"></div>
  `);

  renderTabEquity(s, mc);
  document.getElementById('tab-content').style.display = 'block';
}

function statCard(label, value, style = '') {
  return `<div class="stat-card"><div class="stat-val" style="${style}">${value}</div><div class="stat-lbl">${label}</div></div>`;
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tc = document.getElementById('tab-content');
  if (!tc) return;

  if (id === 'tab-equity')   renderTabEquity(_result?.allStats, _result?.mc);
  else if (id === 'tab-isoos')   renderTabIsOos(_result?.isStats, _result?.oosStats);
  else if (id === 'tab-wfo')     renderTabWfo(_result?.wfoResults);
  else if (id === 'tab-sessions') renderTabSessions(_result?.sessions, _result?.days);
  else if (id === 'tab-levels')  renderTabLevels(_result?.levels, _result?.variants);
  else if (id === 'tab-trades')  renderTabTrades(_result?.tradeSample);
}

// ── Tab: Equity ────────────────────────────────────────────────────────────────

function renderTabEquity(s, mc) {
  if (!s) return;
  const tc = document.getElementById('tab-content');
  tc.innerHTML = `
    <div class="chart-row">
      <div class="chart-box" id="chart-equity"></div>
      <div class="chart-box" id="chart-dd"></div>
    </div>
    <div class="chart-row">
      <div class="chart-box" id="chart-monthly"></div>
      ${mc ? '<div class="chart-box" id="chart-mc"></div>' : ''}
    </div>
    <div class="detail-grid">
      ${detailRow('Avg MFE', fmtR(s.avgMfe))} ${detailRow('Avg MAE', fmtR(s.avgMae))}
      ${detailRow('MFE Capture', fmtPct(s.mfeCaptureRatio * 100))} ${detailRow('Exit Leak', fmtPct((1 - s.mfeCaptureRatio) * 100))}
      ${detailRow('StdDev R', s.stdR?.toFixed(3))} ${detailRow('Calmar', s.calmar?.toFixed(2))}
      ${detailRow('Date Range', `${s.dateRange?.first} → ${s.dateRange?.last}`)} ${detailRow('Years', s.dateRange?.years)}
    </div>
  `;
  requestAnimationFrame(() => {
    renderLineSVG('chart-equity',  s.equityCurve,   'Equity (cumR)', 'var(--gold)', 'var(--bg2)');
    renderLineSVG('chart-dd',      s.drawdownCurve, 'Drawdown %',    'var(--red)',  'var(--bg2)');
    renderMonthly('chart-monthly', s.monthly);
    if (mc) renderMonteCarlo('chart-mc', mc);
  });
}

// ── Tab: IS/OOS ───────────────────────────────────────────────────────────────

function renderTabIsOos(is, oos) {
  const tc = document.getElementById('tab-content');
  if (!is && !oos) { tc.innerHTML = '<div class="placeholder">Set IS Split % above 0 to see IS/OOS comparison</div>'; return; }

  const row = (label, isV, oosV, higherBetter = true) => {
    const iN = parseFloat(isV), oN = parseFloat(oosV);
    const degraded = !isNaN(iN) && !isNaN(oN) && (higherBetter ? oN < iN * 0.7 : oN > iN * 1.3);
    const color = degraded ? 'color:var(--red)' : '';
    return `<tr><td>${label}</td><td>${isV ?? '—'}</td><td style="${color}">${oosV ?? '—'}</td></tr>`;
  };

  tc.innerHTML = `
    <h3 class="tab-title">In-Sample vs Out-of-Sample</h3>
    <table class="data-table">
      <thead><tr><th>Metric</th><th>IS</th><th>OOS</th></tr></thead>
      <tbody>
        ${row('Trades',        fmtNum(is?.n),          fmtNum(oos?.n))}
        ${row('Win Rate',      fmtPct(is?.winRate),     fmtPct(oos?.winRate))}
        ${row('Profit Factor', is?.profitFactor?.toFixed(2), oos?.profitFactor?.toFixed(2))}
        ${row('Sharpe',        is?.sharpe?.toFixed(2),  oos?.sharpe?.toFixed(2))}
        ${row('CAGR %',        fmtPct(is?.cagr),        fmtPct(oos?.cagr))}
        ${row('Max DD %',      fmtPct(is?.maxDD),       fmtPct(oos?.maxDD), false)}
        ${row('Avg R',         fmtR(is?.meanR),         fmtR(oos?.meanR))}
        ${row('MFE Capture',   fmtPct(is?.mfeCaptureRatio * 100), fmtPct(oos?.mfeCaptureRatio * 100))}
      </tbody>
    </table>
    <div class="chart-row" style="margin-top:16px">
      ${is  ? `<div class="chart-box" id="chart-is-eq"></div>`  : ''}
      ${oos ? `<div class="chart-box" id="chart-oos-eq"></div>` : ''}
    </div>
  `;
  requestAnimationFrame(() => {
    if (is)  renderLineSVG('chart-is-eq',  is.equityCurve,  'IS Equity',  'var(--gold)', 'var(--bg2)');
    if (oos) renderLineSVG('chart-oos-eq', oos.equityCurve, 'OOS Equity', 'var(--blue)', 'var(--bg2)');
  });
}

// ── Tab: WFO ─────────────────────────────────────────────────────────────────

function renderTabWfo(wfoResults) {
  const tc = document.getElementById('tab-content');
  if (!wfoResults?.length) { tc.innerHTML = '<div class="placeholder">Enable WFO above and re-run</div>'; return; }

  const rows = wfoResults.map((w, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td>${w.isStart} → ${w.isEnd}</td>
      <td>${w.oosStart} → ${w.oosEnd}</td>
      <td>${w.isTrades}</td>
      <td>${w.oosTrades}</td>
      <td style="${statColor(w.isStats?.sharpe)}">${w.isStats?.sharpe?.toFixed(2) ?? '—'}</td>
      <td style="${statColor(w.oosStats?.sharpe)}">${w.oosStats?.sharpe?.toFixed(2) ?? '—'}</td>
      <td style="${statColor(w.oosStats?.cagr)}">${fmtPct(w.oosStats?.cagr)}</td>
      <td style="${w.oosStats?.maxDD > 20 ? 'color:var(--red)' : ''}">${fmtPct(w.oosStats?.maxDD)}</td>
    </tr>
  `).join('');

  tc.innerHTML = `
    <h3 class="tab-title">Walk-Forward Validation</h3>
    <table class="data-table">
      <thead><tr><th>#</th><th>IS Period</th><th>OOS Period</th><th>IS Trades</th><th>OOS Trades</th><th>IS Sharpe</th><th>OOS Sharpe</th><th>OOS CAGR</th><th>OOS DD</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Tab: Sessions ─────────────────────────────────────────────────────────────

function renderTabSessions(sessions, days) {
  const tc = document.getElementById('tab-content');
  const sessRows = (sessions ?? []).map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${fmtNum(s.n)}</td>
      <td style="${statColor(s.winRate - 50)}">${fmtPct(s.winRate)}</td>
      <td style="${statColor(s.r)}">${fmtR(s.r)}</td>
      <td>${s.n > 0 ? fmtR(+(s.r / s.n).toFixed(2)) : '—'}</td>
    </tr>
  `).join('');

  const dayRows = (days ?? []).map(d => `
    <tr>
      <td>${d.name}</td>
      <td>${fmtNum(d.n)}</td>
      <td style="${statColor(d.winRate - 50)}">${fmtPct(d.winRate)}</td>
      <td style="${statColor(d.r)}">${fmtR(d.r)}</td>
    </tr>
  `).join('');

  tc.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <h3 class="tab-title">By Session</h3>
        <table class="data-table">
          <thead><tr><th>Session</th><th>Trades</th><th>Win%</th><th>Net R</th><th>Avg R</th></tr></thead>
          <tbody>${sessRows}</tbody>
        </table>
      </div>
      <div>
        <h3 class="tab-title">By Day of Week</h3>
        <table class="data-table">
          <thead><tr><th>Day</th><th>Trades</th><th>Win%</th><th>Net R</th></tr></thead>
          <tbody>${dayRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Tab: Levels ───────────────────────────────────────────────────────────────

function renderTabLevels(levels, variants) {
  const tc = document.getElementById('tab-content');

  // Zone variant colour coding matching gold bot convention
  const variantStyle = v => {
    if (v === 'GP')    return 'color:var(--gold);font-weight:600';
    if (v === '.786')  return 'color:var(--blue)';
    if (v === '.886')  return 'color:var(--blue)';
    if (v === '.5')    return 'color:var(--text2)';
    if (v === '.382')  return 'color:var(--text3)';
    if (v === 'Pivot') return 'color:#a78bfa';
    return '';
  };

  const variantRows = (variants ?? []).map(v => `
    <tr>
      <td style="${variantStyle(v.variant)}">${v.variant === 'GP' ? '★ GP (0.618–0.65)' : v.variant}</td>
      <td>${fmtNum(v.n)}</td>
      <td style="${statColor(v.winRate - 50)}">${fmtPct(v.winRate)}</td>
      <td style="${statColor(v.r)}">${fmtR(v.r)}</td>
      <td style="${statColor(v.n > 0 ? v.r / v.n : 0)}">${v.n > 0 ? fmtR(+(v.r / v.n).toFixed(2)) : '—'}</td>
      <td>${fmtR(v.avgMfe)}</td>
      <td>${fmtR(v.avgMae)}</td>
    </tr>
  `).join('');

  const levelRows = (levels ?? []).map(l => `
    <tr>
      <td style="${variantStyle(l.level)}">${l.level}</td>
      <td>${fmtNum(l.n)}</td>
      <td style="${statColor(l.winRate - 50)}">${fmtPct(l.winRate)}</td>
      <td style="${statColor(l.r)}">${fmtR(l.r)}</td>
      <td style="${statColor(l.n > 0 ? l.r / l.n : 0)}">${l.n > 0 ? fmtR(+(l.r / l.n).toFixed(2)) : '—'}</td>
      <td>${fmtR(l.avgMfe ?? 0)}</td>
    </tr>
  `).join('');

  tc.innerHTML = `
    <h3 class="tab-title">Zone Variant Performance</h3>
    <p style="font-size:11px;color:var(--text3);margin-bottom:10px">
      GP = Golden Pocket (0.618–0.65 of swing) — primary entry zone.
      .786 / .886 = deep reversal zones. .5 / .382 = continuation pullbacks. Pivot = daily PP/R1/S1.
    </p>
    <table class="data-table" style="margin-bottom:20px">
      <thead><tr><th>Zone Variant</th><th>Trades</th><th>Win%</th><th>Net R</th><th>Avg R</th><th>Avg MFE</th><th>Avg MAE</th></tr></thead>
      <tbody>${variantRows || '<tr><td colspan="7" style="color:var(--text3);text-align:center">No data</td></tr>'}</tbody>
    </table>
    <h3 class="tab-title">Level Detail</h3>
    <table class="data-table">
      <thead><tr><th>Level</th><th>Trades</th><th>Win%</th><th>Net R</th><th>Avg R</th><th>Avg MFE</th></tr></thead>
      <tbody>${levelRows || '<tr><td colspan="6" style="color:var(--text3);text-align:center">No data</td></tr>'}</tbody>
    </table>
  `;
}

// ── Tab: Trades ───────────────────────────────────────────────────────────────

function renderTabTrades(trades) {
  const tc = document.getElementById('tab-content');
  if (!trades?.length) { tc.innerHTML = '<div class="placeholder">No trades to show</div>'; return; }

  const resultColor = r => r === 'sl' ? 'color:var(--red)' : r === 'eod' ? 'color:var(--text2)' : 'color:var(--green)';

  const variantColor = v => {
    if (v === 'GP')    return 'color:var(--gold);font-weight:600';
    if (v === '.786' || v === '.886') return 'color:var(--blue)';
    if (v === 'Pivot') return 'color:#a78bfa';
    return 'color:var(--text2)';
  };

  const rows = [...trades].reverse().slice(0, 200).map(t => {
    const rCol  = (t.r ?? 0) >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    const stars = '★'.repeat(t.stars ?? 1) + '☆'.repeat(Math.max(0, 5 - (t.stars ?? 1)));
    const varLabel = t.inGpZone ? '★GP' : (t.zoneVariant ?? t.level ?? '—');
    return `
      <tr class="${t.isOos ? 'oos-row' : ''}">
        <td>${t.lDate}</td>
        <td style="color:${t.dir === 'long' ? 'var(--green)' : 'var(--red)'}">${t.dir === 'long' ? '▲' : '▼'} ${t.dir}</td>
        <td>${t.entryPrice?.toFixed(2) ?? '—'}</td>
        <td>${t.exitPrice?.toFixed(2) ?? '—'}</td>
        <td style="${resultColor(t.result)}">${t.result ?? '—'}</td>
        <td style="${rCol}">${fmtR(t.r)}</td>
        <td>${fmtR(t.mfe)}</td>
        <td style="${variantColor(t.zoneVariant)}" title="${t.level}">${varLabel}</td>
        <td title="${t.vmuSignal}">${t.vmuSignal ?? '—'}</td>
        <td title="${stars}" style="color:var(--gold)">${'★'.repeat(t.stars ?? 1)}</td>
      </tr>
    `;
  }).join('');

  tc.innerHTML = `
    <h3 class="tab-title">Last ${Math.min(200, trades.length)} Trades ${trades.length > 200 ? `(of ${fmtNum(trades.length)})` : ''}</h3>
    <div style="overflow-x:auto">
    <table class="data-table trades-table">
      <thead><tr><th>Date</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Result</th><th>R</th><th>MFE</th><th>Zone</th><th>VMU</th><th>★</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  `;
}

function detailRow(label, value) {
  return `<div class="detail-item"><span class="detail-lbl">${label}</span><span class="detail-val">${value ?? '—'}</span></div>`;
}

// ── SVG Charts ────────────────────────────────────────────────────────────────

function renderLineSVG(containerId, data, title, lineColor, bgColor) {
  const el = document.getElementById(containerId);
  if (!el || !data?.length) return;
  const W = el.clientWidth || 480, H = el.clientHeight || 200;
  const pad = { t: 28, r: 10, b: 30, l: 46 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  const ys = data.map(d => d.y);
  const xs = data.map(d => d.x);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yRange = yMax - yMin || 1, xRange = xMax - xMin || 1;

  const px = x => pad.l + ((x - xMin) / xRange) * cw;
  const py = y => pad.t + (1 - (y - yMin) / yRange) * ch;

  const pts = data.map(d => `${px(d.x).toFixed(1)},${py(d.y).toFixed(1)}`).join(' ');
  const zero = py(0).toFixed(1);

  // Y axis labels
  const ticks = 5;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + (yRange * i / ticks));
  const yLabels = yTicks.map(v =>
    `<text x="${pad.l - 4}" y="${py(v).toFixed(1)}" text-anchor="end" font-size="9" fill="#888">${v.toFixed(1)}</text>
     <line x1="${pad.l}" y1="${py(v).toFixed(1)}" x2="${W - pad.r}" y2="${py(v).toFixed(1)}" stroke="#333" stroke-width="0.5"/>`
  ).join('');

  el.innerHTML = `
    <svg width="${W}" height="${H}" style="background:${bgColor};border-radius:6px;overflow:visible">
      <text x="${pad.l}" y="17" font-size="11" fill="#aaa" font-family="DM Sans,sans-serif">${title}</text>
      ${yLabels}
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="#444" stroke-width="1"/>
      ${zero > pad.t && zero < H - pad.b ? `<line x1="${pad.l}" y1="${zero}" x2="${W - pad.r}" y2="${zero}" stroke="#555" stroke-width="0.8" stroke-dasharray="3,3"/>` : ''}
      <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderMonthly(containerId, monthly) {
  const el = document.getElementById(containerId);
  if (!el || !monthly?.length) return;
  const W = el.clientWidth || 480, H = el.clientHeight || 180;
  const pad = { t: 28, r: 10, b: 36, l: 46 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const n = monthly.length;
  const barW = Math.max(2, (cw / n) - 1);
  const rs   = monthly.map(m => m.totalR);
  const yMax = Math.max(...rs, 0.01), yMin = Math.min(...rs, 0);
  const yRange = yMax - yMin || 1;
  const py = v => pad.t + (1 - (v - yMin) / yRange) * ch;
  const zero = py(0).toFixed(1);

  const bars = monthly.map((m, i) => {
    const x = pad.l + (i / n) * cw;
    const y0 = parseFloat(zero);
    const y1 = py(m.totalR);
    const barH = Math.abs(y0 - y1);
    const yt = Math.min(y0, y1);
    const color = m.totalR >= 0 ? 'var(--green)' : 'var(--red)';
    return `<rect x="${x.toFixed(1)}" y="${yt.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" opacity="0.8">
      <title>${m.yearMonth}: ${fmtR(m.totalR)} (${m.trades} trades)</title></rect>`;
  }).join('');

  // X axis: show first of each year
  const xLabels = monthly
    .filter(m => m.yearMonth.endsWith('-01'))
    .map(m => {
      const i = monthly.indexOf(m);
      const x = pad.l + (i / n) * cw;
      return `<text x="${x.toFixed(1)}" y="${H - pad.b + 14}" font-size="8" fill="#666" text-anchor="middle">${m.yearMonth.slice(0, 4)}</text>`;
    }).join('');

  el.innerHTML = `
    <svg width="${W}" height="${H}" style="background:var(--bg2);border-radius:6px">
      <text x="${pad.l}" y="17" font-size="11" fill="#aaa" font-family="DM Sans,sans-serif">Monthly P&L (R)</text>
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="#444" stroke-width="1"/>
      <line x1="${pad.l}" y1="${zero}" x2="${W - pad.r}" y2="${zero}" stroke="#555" stroke-width="0.8" stroke-dasharray="3,3"/>
      ${bars}${xLabels}
    </svg>
  `;
}

function renderMonteCarlo(containerId, mc) {
  const el = document.getElementById(containerId);
  if (!el || !mc?.bands?.length) return;
  const W = el.clientWidth || 480, H = el.clientHeight || 200;
  const pad = { t: 28, r: 10, b: 30, l: 46 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  const allVals = mc.bands.flatMap(b => [b.p5, b.p95]);
  const yMin = Math.min(...allVals), yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;
  const n = mc.bands.length;

  const px = i => pad.l + (i / (n - 1)) * cw;
  const py = v => pad.t + (1 - (v - yMin) / yRange) * ch;

  const band = (key1, key2, color, opacity) => {
    const top = mc.bands.map((b, i) => `${px(i).toFixed(1)},${py(b[key2]).toFixed(1)}`).join(' ');
    const bot = [...mc.bands].reverse().map((b, i) => `${px(n - 1 - i).toFixed(1)},${py(b[key1]).toFixed(1)}`).join(' ');
    return `<polygon points="${top} ${bot}" fill="${color}" opacity="${opacity}"/>`;
  };
  const line = (key, color) => {
    const pts = mc.bands.map((b, i) => `${px(i).toFixed(1)},${py(b[key]).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  };

  el.innerHTML = `
    <svg width="${W}" height="${H}" style="background:var(--bg2);border-radius:6px">
      <text x="${pad.l}" y="17" font-size="11" fill="#aaa" font-family="DM Sans,sans-serif">Monte Carlo (${mc.N_SIM} sims)</text>
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="#444" stroke-width="1"/>
      ${band('p5', 'p95', 'var(--gold)', 0.08)}
      ${band('p25', 'p75', 'var(--gold)', 0.15)}
      ${line('p50', 'var(--gold)')}
      ${line('p5',  '#e55')}
      ${line('p95', '#5c5')}
    </svg>
  `;
}

// ── IS/OOS split slider sync ──────────────────────────────────────────────────

function syncSplitSlider() {
  const slider = document.getElementById('cfg-is-split');
  const lbl    = document.getElementById('split-lbl');
  if (!slider || !lbl) return;
  const v = parseInt(slider.value, 10);
  lbl.textContent = v === 0 ? 'Single run (no split)' : `IS ${v}% / OOS ${100 - v}%`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.switchTab      = switchTab;
window.runBacktest    = runBacktest;
window.syncSplitSlider = syncSplitSlider;

document.addEventListener('DOMContentLoaded', () => {
  syncSplitSlider();
  clearResults();
});
