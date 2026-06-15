/**
 * sys-backtest-shared.js
 * Shared utilities for the 6 standalone system backtest pages.
 * Each page imports this, defines its own runEngine() + renderSignalChart(),
 * then calls initSysBacktest(cfg).
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const Z_WIN      = 252;
const MIN_Z      = 30;
const PUB_WEEKLY = 5;
const PUB_MONTHLY= 21;

// ── Math helpers ───────────────────────────────────────────────────────────────
function ffill(arr) {
  let last = NaN;
  return arr.map(v => { if (isFinite(v)) last = v; return last; });
}
function applyLag(arr, lag) {
  if (lag <= 0) return arr;
  return Array(lag).fill(NaN).concat(arr.slice(0, arr.length - lag));
}
function pctChange(arr) {
  return arr.map((v, i) => {
    if (!i || !isFinite(arr[i-1]) || !isFinite(v) || !arr[i-1]) return NaN;
    return (v - arr[i-1]) / Math.abs(arr[i-1]);
  });
}
function rollingZ(arr, win = Z_WIN) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (!isFinite(arr[i])) continue;
    const sl = [];
    for (let j = Math.max(0, i - win); j < i; j++) if (isFinite(arr[j])) sl.push(arr[j]);
    if (sl.length < MIN_Z) continue;
    const mu = sl.reduce((a, b) => a + b, 0) / sl.length;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - mu) ** 2, 0) / sl.length);
    out[i] = sd > 0 ? (arr[i] - mu) / sd : 0;
  }
  return out;
}
function monthEndIdx(dates) {
  const out = [];
  for (let i = 0; i < dates.length - 1; i++)
    if (dates[i].substring(0, 7) !== dates[i+1].substring(0, 7)) out.push(i);
  out.push(dates.length - 1);
  return out;
}
function buildEquity(monthlyRet) {
  let eq = 1;
  return monthlyRet.map(v => { eq *= (1 + v); return eq; });
}
function sharpe(rets) {
  const fin = rets.filter(isFinite);
  if (fin.length < 3) return NaN;
  const mu = fin.reduce((a, b) => a + b, 0) / fin.length;
  const sd = Math.sqrt(fin.reduce((a, b) => a + (b - mu) ** 2, 0) / fin.length);
  return sd === 0 ? 0 : (mu / sd) * Math.sqrt(12);
}
function annCagr(finalEq, nMonths) {
  return isFinite(finalEq) && finalEq > 0 && nMonths > 0
    ? (Math.pow(finalEq, 12 / nMonths) - 1) * 100 : NaN;
}
function maxDD(eqs) {
  let pk = eqs[0] ?? 1, wd = 0;
  for (const v of eqs) { if (!isFinite(v)) continue; if (v > pk) pk = v; wd = Math.min(wd, (v - pk) / pk); }
  return wd * 100;
}
function drawdownSeries(eqs) {
  let pk = eqs[0] ?? 1;
  return eqs.map(v => { if (!isFinite(v)) return NaN; if (v > pk) pk = v; return (v - pk) / pk * 100; });
}
function rollingOLSResidual(y, x1, x2, win) {
  const n = y.length, resid = new Array(n).fill(NaN);
  for (let i = win - 1; i < n; i++) {
    const ys = [], xs1 = [], xs2 = [];
    for (let j = i - win + 1; j <= i; j++) {
      if (isFinite(y[j]) && isFinite(x1[j]) && isFinite(x2[j])) { ys.push(y[j]); xs1.push(x1[j]); xs2.push(x2[j]); }
    }
    if (ys.length < 30) continue;
    const m = ys.length;
    let sY=0,sX1=0,sX2=0,sX1Y=0,sX2Y=0,sX1X1=0,sX2X2=0,sX1X2=0;
    for (let k = 0; k < m; k++) {
      sY+=ys[k];sX1+=xs1[k];sX2+=xs2[k];sX1Y+=xs1[k]*ys[k];sX2Y+=xs2[k]*ys[k];
      sX1X1+=xs1[k]*xs1[k];sX2X2+=xs2[k]*xs2[k];sX1X2+=xs1[k]*xs2[k];
    }
    const mY=sY/m,mX1=sX1/m,mX2=sX2/m;
    const c11=sX1X1/m-mX1*mX1,c22=sX2X2/m-mX2*mX2,c12=sX1X2/m-mX1*mX2;
    const c1Y=sX1Y/m-mX1*mY,c2Y=sX2Y/m-mX2*mY;
    const det = c11 * c22 - c12 * c12;
    if (Math.abs(det) < 1e-12) continue;
    const b1=(c1Y*c22-c2Y*c12)/det,b2=(c2Y*c11-c1Y*c12)/det,b0=mY-b1*mX1-b2*mX2;
    resid[i] = ys[ys.length-1] - (b0 + b1*xs1[xs1.length-1] + b2*xs2[xs2.length-1]);
  }
  return resid;
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmt(v, d = 1, suf = '') { return isFinite(v) ? v.toFixed(d) + suf : '—'; }
function fmtPct(v) { return isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—'; }

// ── Data fetch ─────────────────────────────────────────────────────────────────
let _cachedData = null, _cachedAt = 0;
async function fetchDiversData() {
  if (_cachedData && Date.now() - _cachedAt < 22 * 3600 * 1000) return _cachedData;
  const r = await fetch('/api/diversification/data');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error ?? 'Server error');
  _cachedData = d;
  _cachedAt = Date.now();
  return d;
}

// ── localStorage result store ──────────────────────────────────────────────────
function saveResult(sysKey, result, cfg) {
  try {
    localStorage.setItem(`sys_${sysKey}`, JSON.stringify({
      monthlyRet:   result.monthlyRet,
      monthlyDates: result.monthlyDates,
      cfg,
      savedAt: new Date().toISOString(),
    }));
  } catch (e) { console.warn('localStorage save failed:', e); }
}
function loadResult(sysKey) {
  try { return JSON.parse(localStorage.getItem(`sys_${sysKey}`) || 'null'); }
  catch { return null; }
}

// ── Chart.js helpers ───────────────────────────────────────────────────────────
const _CJSOPTS = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index', intersect: false,
      backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8',
      borderColor: '#334155', borderWidth: 1,
    },
  },
  scales: {
    x: { ticks: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.06)' } },
    y: { ticks: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
  },
};
let _cjsCharts = {};
function destroyCjsChart(id) { if (_cjsCharts[id]) { _cjsCharts[id].destroy(); delete _cjsCharts[id]; } }
function makeCjsChart(id, type, labels, datasets, extraOpts = {}) {
  destroyCjsChart(id);
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  _cjsCharts[id] = new Chart(ctx, { type, data: { labels, datasets }, options: { ..._CJSOPTS, ...extraOpts } });
}

// ── LightweightCharts factory ──────────────────────────────────────────────────
function createLWChart(containerId, height = 300, extraOpts = {}) {
  const el = document.getElementById(containerId);
  if (!el || typeof LightweightCharts === 'undefined') return null;
  el.innerHTML = '';
  el.style.height = height + 'px';
  const chart = LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height,
    layout: { background: { color: '#0d1117' }, textColor: '#94a3b8' },
    grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    timeScale: { borderColor: '#334155', timeVisible: false, secondsVisible: false },
    rightPriceScale: { borderColor: '#334155' },
    handleScroll: true, handleScale: true,
    ...extraOpts,
  });
  new ResizeObserver(() => { chart.applyOptions({ width: el.clientWidth }); }).observe(el);
  return chart;
}

// ── Build markers from rebalance trade list ───────────────────────────────────
// trade: { date, oldAlloc, newAlloc, signal }
function buildMarkers(trades) {
  return trades
    .filter(t => Math.abs(t.newAlloc - t.oldAlloc) > 0.01)
    .map(t => {
      const up = t.newAlloc > t.oldAlloc;
      return {
        time: t.date,
        position: up ? 'belowBar' : 'aboveBar',
        color: up ? '#10b981' : '#ef4444',
        shape: up ? 'arrowUp' : 'arrowDown',
        text: `${Math.round(t.newAlloc * 100)}%`,
        size: 1,
      };
    });
}

// ── Regime background bands (as histogram series with zero opacity area) ───────
// regimes: [{ date, color }] — one entry per month-end with the regime colour
function addRegimeBand(chart, regimes) {
  const series = chart.addHistogramSeries({
    color: 'transparent',
    priceFormat: { type: 'volume' },
    priceScaleId: 'regime',
    scaleMargins: { top: 0, bottom: 0 },
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale('regime').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
  return series;
}

// ── KPI grid ──────────────────────────────────────────────────────────────────
function renderKPIs(eqs, monthlyRet) {
  const sh = sharpe(monthlyRet);
  const ca = annCagr(eqs[eqs.length - 1], monthlyRet.length);
  const dd = maxDD(eqs);
  const win = monthlyRet.filter(v => v > 0).length / monthlyRet.filter(isFinite).length * 100;
  const fin = monthlyRet.filter(isFinite);
  const mu  = fin.reduce((a, b) => a + b, 0) / fin.length;
  const vol = Math.sqrt(fin.reduce((a, b) => a + (b - mu) ** 2, 0) / fin.length) * Math.sqrt(12) * 100;
  const best  = Math.max(...fin) * 100;
  const worst = Math.min(...fin) * 100;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="bt-kpi">
      <div class="bt-kpi-label">CAGR</div>
      <div class="bt-kpi-value ${ca >= 0 ? 'green' : 'red'}">${fmtPct(ca)}</div>
      <div class="bt-kpi-sub">Annualised return</div>
    </div>
    <div class="bt-kpi">
      <div class="bt-kpi-label">Sharpe Ratio</div>
      <div class="bt-kpi-value ${sh >= 1 ? 'green' : sh >= 0.5 ? 'blue' : 'red'}">${fmt(sh, 2)}</div>
      <div class="bt-kpi-sub">Monthly, annualised</div>
    </div>
    <div class="bt-kpi">
      <div class="bt-kpi-label">Max Drawdown</div>
      <div class="bt-kpi-value red">${fmt(dd, 1)}%</div>
      <div class="bt-kpi-sub">Peak to trough</div>
    </div>
    <div class="bt-kpi">
      <div class="bt-kpi-label">Win Rate</div>
      <div class="bt-kpi-value ${win >= 55 ? 'green' : 'amber'}">${fmt(win, 0)}%</div>
      <div class="bt-kpi-sub">Months with gain</div>
    </div>
    <div class="bt-kpi">
      <div class="bt-kpi-label">Final Equity</div>
      <div class="bt-kpi-value blue">${fmt(eqs[eqs.length - 1], 2)}×</div>
      <div class="bt-kpi-sub">From $1 invested</div>
    </div>`;

  document.getElementById('secGrid').innerHTML = `
    <div class="bt-sec"><span class="bt-sec-lbl">Annual Vol</span><span class="bt-sec-val">${fmt(vol, 1)}%</span></div>
    <div class="bt-sec"><span class="bt-sec-lbl">Best Month</span><span class="bt-sec-val" style="color:var(--green)">${fmtPct(best)}</span></div>
    <div class="bt-sec"><span class="bt-sec-lbl">Worst Month</span><span class="bt-sec-val" style="color:var(--red)">${fmtPct(worst)}</span></div>
    <div class="bt-sec"><span class="bt-sec-lbl">Months</span><span class="bt-sec-val">${fin.length}</span></div>`;
}

// ── Monthly heatmap ───────────────────────────────────────────────────────────
const MONTHS_ABB = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function hmColor(ret) {
  if (!isFinite(ret)) return 'var(--s2)';
  const v = Math.min(Math.abs(ret) * 100, 8) / 8;
  return ret > 0 ? `rgba(16,185,129,${0.15 + v * 0.65})` : `rgba(239,68,68,${0.15 + v * 0.65})`;
}
function renderHeatmap(containerId, monthlyRet, monthlyDates) {
  const years = [...new Set(monthlyDates.map(d => d.substring(0, 4)))].sort();
  const byYM = {};
  monthlyDates.forEach((d, i) => {
    const yr = d.substring(0, 4), mo = parseInt(d.substring(5, 7)) - 1;
    if (!byYM[yr]) byYM[yr] = {};
    byYM[yr][mo] = monthlyRet[i];
  });
  let html = '<div style="overflow-x:auto"><table class="bt-tbl" style="min-width:700px"><thead><tr><th>Year</th>';
  MONTHS_ABB.forEach(m => html += `<th class="num">${m}</th>`);
  html += '<th class="num">Ann.</th></tr></thead><tbody>';
  for (const yr of years) {
    const rets = Object.values(byYM[yr] ?? {}).filter(isFinite);
    const ann = (rets.reduce((a, b) => a * (1 + b), 1) - 1) * 100;
    html += `<tr><td>${yr}</td>`;
    for (let m = 0; m < 12; m++) {
      const v = byYM[yr]?.[m];
      html += `<td class="num ${isFinite(v) ? (v >= 0 ? 'pos' : 'neg') : 'neu'}"
        style="background:${hmColor(v)};border-radius:3px;">${isFinite(v) ? fmtPct(v * 100) : '—'}</td>`;
    }
    html += `<td class="num ${ann >= 0 ? 'pos' : 'neg'}" style="font-weight:700">${fmtPct(ann)}</td></tr>`;
  }
  html += '</tbody></table></div>';
  document.getElementById(containerId).innerHTML = html;
}

// ── Annual bar chart ───────────────────────────────────────────────────────────
function renderAnnualChart(canvasId, monthlyRet, monthlyDates) {
  const years = [...new Set(monthlyDates.map(d => d.substring(0, 4)))].sort();
  const byY = {};
  monthlyDates.forEach((d, i) => { const y = d.substring(0, 4); if (!byY[y]) byY[y] = []; byY[y].push(monthlyRet[i]); });
  const vals = years.map(y => (byY[y].reduce((a, b) => a * (1 + b), 1) - 1) * 100);
  makeCjsChart(canvasId, 'bar', years, [{
    data: vals,
    backgroundColor: vals.map(v => v >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
    borderWidth: 0, borderRadius: 4,
  }], {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.06)' } },
    },
  });
}

// ── Equity vs B&H chart (Chart.js) ────────────────────────────────────────────
function renderEquityChart(canvasId, eqs, monthlyDates, bhEqs, bhLabel, sysColor) {
  const labels = monthlyDates.map((d, i) => i % 12 === 0 ? d.substring(0, 7) : '');
  const datasets = [{
    label: 'System', data: eqs, borderColor: sysColor, backgroundColor: sysColor + '15',
    borderWidth: 2, pointRadius: 0, fill: true, tension: 0,
  }];
  if (bhEqs) datasets.push({
    label: bhLabel ?? 'Buy & Hold', data: bhEqs, borderColor: '#64748b', backgroundColor: 'transparent',
    borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4], tension: 0,
  });
  makeCjsChart(canvasId, 'line', labels, datasets, {
    plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 }, boxWidth: 14 } } },
  });
}

// ── Drawdown chart ────────────────────────────────────────────────────────────
function renderDDChart(canvasId, eqs, monthlyDates) {
  const labels = monthlyDates.map((d, i) => i % 12 === 0 ? d.substring(0, 7) : '');
  const dd = drawdownSeries(eqs);
  makeCjsChart(canvasId, 'line', labels, [{
    label: 'Drawdown', data: dd, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0,
  }], {
    scales: {
      x: { ticks: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { ticks: { color: '#94a3b8', font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.06)' } },
    },
  });
}

// ── Rebalance trades table ────────────────────────────────────────────────────
// trade: { date, oldAlloc, newAlloc, signal, ret }
function renderTradesTable(tbodyEl, trades) {
  if (!tbodyEl) return;
  let html = '';
  for (const t of trades) {
    const delta = t.newAlloc - t.oldAlloc;
    const dir = delta > 0.01 ? '↑ INCREASE' : delta < -0.01 ? '↓ REDUCE' : '→ HOLD';
    const cls = delta > 0.01 ? 'pos' : delta < -0.01 ? 'neg' : 'neu';
    html += `<tr>
      <td>${t.date.substring(0, 7)}</td>
      <td class="${cls}">${dir}</td>
      <td class="num">${fmt(t.oldAlloc * 100, 0)}%</td>
      <td class="num">${fmt(t.newAlloc * 100, 0)}%</td>
      <td class="num">${isFinite(t.signal) ? fmt(t.signal, 3) : '—'}</td>
      <td class="num ${isFinite(t.ret) ? (t.ret >= 0 ? 'pos' : 'neg') : 'neu'}">${isFinite(t.ret) ? fmtPct(t.ret * 100) : '—'}</td>
    </tr>`;
  }
  tbodyEl.innerHTML = html || '<tr><td colspan="6" class="neu">No trades</td></tr>';
}

// ── Status dot ────────────────────────────────────────────────────────────────
function setStatus(type, msg) {
  const dot = document.getElementById('statusDot');
  const lbl = document.getElementById('statusMsg');
  if (dot) dot.className = 'sdot ' + (type === 'ok' ? 'ok' : type === 'spin' ? 'spin' : 'err');
  if (lbl) lbl.textContent = msg;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.dv-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.dv-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  if (typeof onTabSwitch === 'function') onTabSwitch(tab);
}
