// js/gold-lab-app.js — Gold Model Lab orchestrator
// Manages R2 streaming, 5Y FRED fetch, worker communication,
// results display, live log management, and CSV export.

const R2_BASE    = 'https://pub-1d8354116ae54e158e7010f0deb8f6e6.r2.dev';
const R2_URL     = `${R2_BASE}/XAUUSD/xauusd-m1-bid.csv`;
const FRED_KEYS  = 'tips,bei,dxy,vix,hy,us2y';
const LIVE_LOG_KEY = 'gold_lab_live_log';

let _worker    = null;
let _csvData   = null;   // last generated CSV string
let _statsData = null;   // last stats object
let _fredReady = false;
let _barsReady = false;

// ── Worker ─────────────────────────────────────────────────────────────────────
function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('./gold-lab-worker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = handleWorkerMsg;
  }
  return _worker;
}

function handleWorkerMsg({ data: { type, payload } }) {
  if      (type === 'progress')    onProgress(payload);
  else if (type === 'parsed_m1')   onParsedM1(payload);
  else if (type === 'history_ready') onHistoryReady(payload);
  else if (type === 'done')        onDone(payload);
  else if (type === 'error')       onWorkerError(payload);
}

// ── Progress ──────────────────────────────────────────────────────────────────
function onProgress({ pct, msg }) {
  el('progressFill').style.width = pct + '%';
  el('progressMsg').textContent  = msg;
}

function showProgress(msg = '') {
  el('progressWrap').classList.add('visible');
  el('progressFill').style.width = '2%';
  el('progressMsg').textContent  = msg;
}

function hideProgress() { el('progressWrap').classList.remove('visible'); }

// ── Step 1: Load 1m bars from R2 ─────────────────────────────────────────────
el('btnLoadR2').addEventListener('click', async () => {
  el('btnLoadR2').disabled = true;
  showProgress('Connecting to R2…');
  setStep(1);

  try {
    const res = await fetch(R2_URL);
    if (!res.ok) throw new Error(`R2 HTTP ${res.status}`);

    const total    = parseInt(res.headers.get('Content-Length') || '0', 10);
    const reader   = res.body.getReader();
    const chunks   = [];
    let received   = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const mb  = (received / 1048576).toFixed(1);
      const pct = total > 0 ? Math.round(10 + 35 * received / total) : 0;
      onProgress({ pct, msg: `Downloading 1m bars… ${mb} MB${total ? ' / ' + (total/1048576).toFixed(0) + ' MB' : ''}` });
    }

    onProgress({ pct: 46, msg: 'Parsing CSV…' });
    const text = await new Blob(chunks).text();
    getWorker().postMessage({ type: 'parse_m1', payload: { text } });
  } catch (e) {
    hideProgress();
    el('btnLoadR2').disabled = false;
    alert('Failed to load R2 data: ' + e.message);
  }
});

function onParsedM1({ count, dateFrom, dateTo }) {
  _barsReady = true;
  el('stat1mBars').textContent  = count.toLocaleString();
  el('stat1mRange').textContent = `${dateFrom} → ${dateTo}`;
  el('btnLoadFred').disabled    = false;
  el('btnLoadR2').disabled      = false;
  setStep(2);
  updateReadyState();
  onProgress({ pct: 100, msg: `Parsed ${count.toLocaleString()} 1m bars. Now load FRED history →` });
  setTimeout(hideProgress, 1500);
}

// ── Step 2: Load 5Y FRED history ──────────────────────────────────────────────
el('btnLoadFred').addEventListener('click', async () => {
  el('btnLoadFred').disabled = true;
  showProgress('Fetching 5Y FRED history…');
  setStep(2);

  try {
    const res = await fetch(`/api/fredhistory?keys=${FRED_KEYS}&period=5y`);
    if (!res.ok) throw new Error(`FRED history HTTP ${res.status}`);
    const history = await res.json();

    // Count total data points
    const counts = Object.values(history).map(a => a.length);
    const totalPts = counts.reduce((a, b) => a + b, 0);
    const dates    = history.tips || history.bei || Object.values(history)[0] || [];
    const dateFrom = dates[0]?.date;
    const dateTo   = dates[dates.length-1]?.date;

    el('statFredRows').textContent  = totalPts.toLocaleString() + ' pts';
    el('statFredRange').textContent = `${dateFrom} → ${dateTo}`;

    // Send to worker
    getWorker().postMessage({ type: 'set_history', payload: { history } });
  } catch(e) {
    hideProgress();
    el('btnLoadFred').disabled = false;
    alert('Failed to load FRED history: ' + e.message);
  }
});

function onHistoryReady({ keys }) {
  _fredReady = true;
  el('btnLoadFred').disabled = false;
  setStep(3);
  updateReadyState();
  onProgress({ pct: 100, msg: `FRED history loaded (${keys.join(', ')}). Ready to reconstruct →` });
  setTimeout(hideProgress, 1500);
  refreshLiveLogStats();
}

// ── Step 3: Run reconstruction ────────────────────────────────────────────────
el('btnRun').addEventListener('click', () => {
  el('btnRun').disabled  = true;
  el('runNote').textContent = 'Running…';
  showProgress('Starting reconstruction…');
  setStep(3);

  getWorker().postMessage({ type: 'reconstruct', payload: {
    atrMultSl:       parseFloat(el('cfgSL').value)     || 1.5,
    atrMultTp:       parseFloat(el('cfgTP').value)     || 2.5,
    lookbackWindow:  parseInt(el('cfgZWin').value)     || 60,
    minHistoryDays:  parseInt(el('cfgMinHist').value)  || 30,
  }});
});

function onDone({ rows, csv, stats, dateFrom, dateTo }) {
  _csvData   = csv;
  _statsData = stats;
  el('btnRun').disabled     = false;
  el('runNote').textContent = `Done — ${rows.toLocaleString()} rows`;
  el('statTotal').textContent = rows.toLocaleString();
  onProgress({ pct: 100, msg: `Reconstruction complete — ${rows.toLocaleString()} trading days labeled.` });
  setTimeout(hideProgress, 2000);
  setStep(4);
  renderResults(stats, dateFrom, dateTo);
}

function onWorkerError(msg) {
  hideProgress();
  el('btnRun').disabled     = false;
  el('runNote').textContent = 'Error — see console';
  console.error('[gold-lab]', msg);
  alert('Reconstruction error: ' + msg);
}

// ── Results rendering ─────────────────────────────────────────────────────────
function renderResults(stats, dateFrom, dateTo) {
  el('labResults').classList.add('visible');

  // Top stats
  const wr = stats.winRate ?? 0;
  el('statWinRate').textContent  = (wr * 100).toFixed(1) + '%';
  el('statWinRate').style.color  = wr > 0.55 ? 'var(--green)' : wr > 0.45 ? 'var(--amber)' : 'var(--red)';
  el('statWinCount').textContent = `${stats.wins} wins / ${stats.directional} directional trades`;
  el('statCoverage').innerHTML   = `<div>${dateFrom} → ${dateTo}</div>
    <div style="margin-top:4px;color:var(--text3)">${stats.total} total days · ${stats.directional} directional signals</div>`;

  // Signal distribution from stats (compute from byStrength)
  const dist = Object.entries(stats.byStrength || {})
    .map(([k, v]) => `${k}: ${v.n}`).join(' · ');
  el('statSignalDist').textContent = dist || '—';

  // Regime table
  const rtbody = el('regimeTbody');
  rtbody.innerHTML = Object.entries(stats.byRegime || {})
    .sort((a, b) => b[1].n - a[1].n)
    .map(([regime, v]) => {
      const wrCls = v.win_rate > 0.55 ? 'wr-high' : v.win_rate > 0.45 ? 'wr-mid' : 'wr-low';
      return `<tr>
        <td>${regime}</td>
        <td>${v.n}</td>
        <td class="${wrCls}">${(v.win_rate * 100).toFixed(1)}%</td>
        <td>—</td>
      </tr>`;
    }).join('');

  // Strength table
  const stbody = el('strengthTbody');
  const strengthOrder = { STRONG: 0, MODERATE: 1, WEAK: 2 };
  stbody.innerHTML = Object.entries(stats.byStrength || {})
    .sort((a, b) => (strengthOrder[a[0]] ?? 9) - (strengthOrder[b[0]] ?? 9))
    .map(([str, v]) => {
      const wrCls = v.win_rate > 0.55 ? 'wr-high' : v.win_rate > 0.45 ? 'wr-mid' : 'wr-low';
      return `<tr><td>${str}</td><td>${v.n}</td><td class="${wrCls}">${(v.win_rate * 100).toFixed(1)}%</td></tr>`;
    }).join('');

  refreshLiveLogStats();
}

// ── Export buttons ────────────────────────────────────────────────────────────
el('btnExport').addEventListener('click', () => {
  if (!_csvData) return;
  downloadCSV(_csvData, 'gold_lab_historical.csv');
});

el('btnExportMerged').addEventListener('click', () => {
  if (!_csvData) return;
  const liveRows = getLiveLog();
  if (!liveRows.length) { downloadCSV(_csvData, 'gold_lab_historical.csv'); return; }
  const liveCSV = liveRows.map(r => Object.values(r).join(',')).join('\n');
  const header  = _csvData.split('\n')[0];
  const merged  = _csvData + '\n' + liveCSV;
  downloadCSV(merged, 'gold_lab_full_dataset.csv');
});

el('btnClearLive').addEventListener('click', () => {
  if (!confirm('Clear all live log rows from localStorage?')) return;
  localStorage.removeItem(LIVE_LOG_KEY);
  refreshLiveLogStats();
});

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Live log ──────────────────────────────────────────────────────────────────
// The gold.html dashboard calls window.goldLabLog(row) to append daily model state.
// This function is exposed globally so gold-app.js can call it without importing this module.

function getLiveLog() {
  try { return JSON.parse(localStorage.getItem(LIVE_LOG_KEY) || '[]'); } catch { return []; }
}

function saveLiveLog(rows) {
  try { localStorage.setItem(LIVE_LOG_KEY, JSON.stringify(rows)); } catch {}
}

function appendLiveRow(row) {
  const rows = getLiveLog();
  // Deduplicate by date
  const existing = rows.findIndex(r => r.date === row.date);
  if (existing >= 0) rows[existing] = row;
  else rows.push(row);
  rows.sort((a, b) => a.date.localeCompare(b.date));
  saveLiveLog(rows);
}

function refreshLiveLogStats() {
  const rows = getLiveLog();
  el('statLiveRows').textContent = rows.length.toString();
  if (rows.length > 0) {
    const dates = rows.map(r => r.date).sort();
    el('statLiveRange').textContent = `${dates[0]} → ${dates[dates.length-1]}`;
  }
  const note = rows.length
    ? `Live log: ${rows.length} rows (${rows[0]?.date} → ${rows[rows.length-1]?.date}) — appended from gold.html sessions`
    : 'Live log: empty — open gold.html to start logging daily model state';
  el('liveLogNote').textContent = note;
}

// Exposed globally so gold-app.js can call window.goldLabLog(row)
window.goldLabLog = appendLiveRow;

// ── UI helpers ────────────────────────────────────────────────────────────────
function updateReadyState() {
  const ready = _barsReady && _fredReady;
  el('btnRun').disabled  = !ready;
  el('runNote').textContent = ready ? 'Ready — click to reconstruct' : 'Load data first';
}

function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const s = el(`step${i}`);
    s.classList.remove('active', 'done');
    if (i < n)  s.classList.add('done');
    if (i === n) s.classList.add('active');
  }
}

function el(id) { return document.getElementById(id); }

// ── Init ──────────────────────────────────────────────────────────────────────
refreshLiveLogStats();
el('statTotal').textContent = '—';
