// js/zone-audit.js
// Zone Audit System: saves Entry Lens zone snapshots to localStorage, retrospectively
// checks M1 OHLC for zone touches and TP/SL outcomes, renders an audit table with
// date filters and a LightweightCharts M1 modal per zone entry.

const AUDIT_STORE_KEY = 'zone_audit_v2';
const MAX_HISTORY_DAYS = 14;

// ── Local storage helpers ─────────────────────────────────────────────────────
function loadAuditRecords() {
  try { return JSON.parse(localStorage.getItem(AUDIT_STORE_KEY) ?? '[]'); }
  catch (e) { return []; }
}

function saveAuditRecords(records) {
  try { localStorage.setItem(AUDIT_STORE_KEY, JSON.stringify(records)); }
  catch (e) { console.warn('[zone-audit] localStorage write failed', e); }
}

// ── Zone tag extraction (mirrors zoneSourceTags in levels.js) ─────────────────
function extractTags(z) {
  const tags = [];
  if (z.source === 'cross') tags.push('Asia+Monday');
  else if (z.source === 'asia') tags.push('Asia');
  else if (z.source === 'monday') tags.push('Monday');
  else if (z.source === 'volforecast') tags.push('Vol Forecast');
  else if (z.source === 'oi') tags.push('OI');
  if (z.hasVolForecast && z.source !== 'volforecast') tags.push('+Vol');
  if (z.pdhMatch) tags.push(z.pdhMatch);
  if (z.pwhMatch) tags.push(z.pwhMatch);
  if (z.pivotMatch) tags.push(z.pivotMatch);
  if (z.dailyFib) tags.push(`Fib ${z.dailyFib.label ?? z.dailyFib}`);
  if (z.structuralFib) tags.push('Struct Fib');
  if (z.oiMatch) tags.push(z.oiMatch);
  if (z.retailCluster) tags.push(z.retailCluster.label ?? 'Retail');
  if (z.isFlipped) tags.push('Flip');
  return tags;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function weekStartStr() {
  const d = new Date();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1)); // Monday = 0
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function getDayOfWeek(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr + 'T12:00:00Z').getUTCDay()];
}

function getSessionLabel(timestamp) {
  const h = new Date(timestamp).getUTCHours();
  if (h >= 22 || h < 7) return 'Asia';
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 17) return 'Overlap';
  return 'NY';
}

// ── Snapshot saving (called from levels.js after all pairs compute) ───────────
export function saveZoneSnapshot(results) {
  const today = todayStr();
  const now = Date.now();

  const newRecords = [];
  for (const m of results) {
    if (!m.zones?.length) continue;
    for (const z of m.zones) {
      if (!z.price || z.sl == null || z.tp == null) continue;
      const dp = m.dp ?? 5;
      const id = `${today}_${m.sym.replace(/[^A-Za-z0-9]/g, '')}_${z.price.toFixed(dp)}_${z.direction ?? 'n'}`;
      newRecords.push({
        id,
        date: today,
        timestamp: now,
        sym: m.sym,
        dp,
        verdict: m.verdict,
        bias: m.bias,
        nowPrice: m.nowPrice,
        zone: {
          price:     z.price,
          direction: z.direction ?? 'neutral',
          stars:     Math.max(0, Math.min(5, Math.round(z.stars ?? 0))),
          source:    z.source ?? 'unknown',
          sl:        z.sl,
          tp:        z.tp,
          rrRaw:     z.rrRaw ?? '—',
          size:      z.size ?? 0,
          tags:      extractTags(z),
        },
        outcome:   null,
        touchIdx:  null,
        touchTime: null,
      });
    }
  }

  if (!newRecords.length) return;

  // Trim history and merge, preserving already-computed outcomes
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_HISTORY_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const existing = loadAuditRecords().filter(r => r.date >= cutoffStr);
  const existingMap = new Map(existing.map(r => [r.id, r]));

  for (const r of newRecords) {
    const prev = existingMap.get(r.id);
    if (prev?.outcome) {
      // Keep computed outcome, refresh display fields with latest zone data
      existingMap.set(r.id, { ...r, outcome: prev.outcome, touchIdx: prev.touchIdx, touchTime: prev.touchTime });
    } else {
      existingMap.set(r.id, r);
    }
  }

  saveAuditRecords([...existingMap.values()]);
}

// ── Outcome detection (fetch M1 bars and walk forward from touch) ─────────────
async function fetchAndComputeOutcome(record) {
  const { sym, date, zone } = record;
  try {
    const res = await fetch(`/api/oanda_ohlc1m?symbol=${encodeURIComponent(sym)}&date=${date}&days=1`);
    if (!res.ok) return { ...record, outcome: 'NO_DATA' };
    const data = await res.json();
    // Filter to only bars from the requested date (datetime is London-local)
    const bars = (data?.values ?? []).filter(b => b.datetime.startsWith(date));
    if (!bars.length) return { ...record, outcome: 'NO_DATA' };

    // Find first bar where price touches the zone
    let touchIdx = -1;
    for (let i = 0; i < bars.length; i++) {
      const lo = parseFloat(bars[i].low);
      const hi = parseFloat(bars[i].high);
      if (zone.direction === 'long'  && lo <= zone.price) { touchIdx = i; break; }
      if (zone.direction === 'short' && hi >= zone.price) { touchIdx = i; break; }
      if (zone.direction === 'neutral' && lo <= zone.price && hi >= zone.price) { touchIdx = i; break; }
    }

    if (touchIdx < 0) return { ...record, outcome: 'NONE' };
    const touchTime = bars[touchIdx].datetime;

    // Walk forward from touch bar to find TP or SL hit
    for (let i = touchIdx; i < bars.length; i++) {
      const lo = parseFloat(bars[i].low);
      const hi = parseFloat(bars[i].high);
      if (zone.direction === 'long') {
        const hitTP = zone.tp != null && hi >= zone.tp;
        const hitSL = zone.sl != null && lo <= zone.sl;
        if (hitTP) return { ...record, outcome: 'WIN',  touchIdx, touchTime };
        if (hitSL) return { ...record, outcome: 'LOSS', touchIdx, touchTime };
      } else if (zone.direction === 'short') {
        const hitTP = zone.tp != null && lo <= zone.tp;
        const hitSL = zone.sl != null && hi >= zone.sl;
        if (hitTP) return { ...record, outcome: 'WIN',  touchIdx, touchTime };
        if (hitSL) return { ...record, outcome: 'LOSS', touchIdx, touchTime };
      }
    }
    // Touched but neither TP nor SL hit within the session data
    return { ...record, outcome: 'TOUCHED', touchIdx, touchTime };
  } catch (e) {
    console.warn('[zone-audit] outcome fetch failed', record.sym, e);
    return { ...record, outcome: 'NO_DATA' };
  }
}

// ── Outcome display helpers ───────────────────────────────────────────────────
function outcomeLabel(outcome) {
  switch (outcome) {
    case 'WIN':     return '✓ WIN';
    case 'LOSS':    return '✗ LOSS';
    case 'TOUCHED': return '◎ TOUCHED';
    case 'NONE':    return '○ NO TOUCH';
    case 'NO_DATA': return '— NO DATA';
    default:        return '? PENDING';
  }
}

function outcomeCls(outcome) {
  switch (outcome) {
    case 'WIN':     return 'win';
    case 'LOSS':    return 'loss';
    case 'TOUCHED': return 'touched';
    case 'NONE':    return 'none';
    default:        return 'pending';
  }
}

// ── M1 chart modal ────────────────────────────────────────────────────────────
let _auditChart = null;

function destroyAuditModal() {
  if (_auditChart) { try { _auditChart.remove(); } catch (e) {} _auditChart = null; }
  document.getElementById('auditModal')?.remove();
}

export function destroyAuditCharts() { destroyAuditModal(); }

async function openTradeModal(record) {
  destroyAuditModal();
  const LC = window.LightweightCharts;
  if (!LC) return;

  const { sym, dp, date, zone, verdict, bias } = record;
  const dirLabel = zone.direction === 'long' ? 'Buy' : zone.direction === 'short' ? 'Sell' : 'Zone';
  const stars = '★'.repeat(zone.stars) + '☆'.repeat(5 - zone.stars);

  const overlay = document.createElement('div');
  overlay.id = 'auditModal';
  overlay.innerHTML = `
    <div class="audit-modal-backdrop" id="auditModalBackdrop"></div>
    <div class="audit-modal-box">
      <div class="audit-modal-header">
        <div>
          <div class="audit-modal-title">${sym} — ${dirLabel} @ ${zone.price.toFixed(dp)}</div>
          <div class="audit-modal-sub">
            ${formatDisplayDate(date)} · ${getDayOfWeek(date)} · ${getSessionLabel(record.timestamp)} session ·
            ${stars} · <span class="al-verdict-badge ${verdict}" style="font-size:10px;padding:2px 8px;vertical-align:middle">${verdict}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span class="audit-outcome audit-outcome-lg ${outcomeCls(record.outcome)}">${outcomeLabel(record.outcome)}</span>
          <button class="audit-modal-close" id="auditModalClose">✕</button>
        </div>
      </div>

      <div id="auditChartEl" class="audit-chart-el"></div>

      <div class="audit-modal-meta">
        <span>Entry <strong style="color:#4f7df0">${zone.price.toFixed(dp)}</strong></span>
        <span>TP <strong style="color:#26a69a">${zone.tp != null ? zone.tp.toFixed(dp) : '—'}</strong></span>
        <span>SL <strong style="color:#ef5350">${zone.sl != null ? zone.sl.toFixed(dp) : '—'}</strong></span>
        <span>R:R <strong>${zone.rrRaw}</strong></span>
        <span>Size <strong>${zone.size}%</strong></span>
        ${record.touchTime ? `<span>Touch <strong>${record.touchTime.slice(11, 16)}</strong> London</span>` : ''}
        ${zone.tags.length ? `<span>${zone.tags.join(' · ')}</span>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const closeModal = () => destroyAuditModal();
  document.getElementById('auditModalClose').addEventListener('click', closeModal);
  document.getElementById('auditModalBackdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escClose); }
  }, { once: false });

  // Fetch M1 data then mount chart
  const chartEl = document.getElementById('auditChartEl');
  if (!chartEl) return;

  let bars = [];
  try {
    const res = await fetch(`/api/oanda_ohlc1m?symbol=${encodeURIComponent(sym)}&date=${date}&days=1`);
    if (res.ok) {
      const data = await res.json();
      bars = (data?.values ?? []).filter(b => b.datetime.startsWith(date));
    }
  } catch (e) {}

  if (!bars.length) {
    chartEl.innerHTML = '<div style="color:#888;padding:40px;text-align:center;font-family:DM Mono,monospace;font-size:12px">No M1 data available for this date.</div>';
    return;
  }

  // Parse London-local datetime as UTC timestamp for LightweightCharts
  const candles = bars.map(b => ({
    time:  Math.floor(new Date(b.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
    open:  parseFloat(b.open),
    high:  parseFloat(b.high),
    low:   parseFloat(b.low),
    close: parseFloat(b.close),
  })).filter(b => b.close > 0);

  if (!candles.length) {
    chartEl.innerHTML = '<div style="color:#888;padding:40px;text-align:center">No valid bars.</div>';
    return;
  }

  _auditChart = LC.createChart(chartEl, {
    autoSize:   true,
    layout:     { background: { color: '#131722' }, textColor: '#d1d4dc' },
    grid:       { vertLines: { color: '#1c2133' }, horzLines: { color: '#1c2133' } },
    crosshair:  { mode: LC.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2a3348', precision: dp },
    timeScale:  { borderColor: '#2a3348', timeVisible: true, secondsVisible: false },
  });

  const cs = _auditChart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
  });
  cs.setData(candles);

  // Entry line (blue)
  cs.createPriceLine({
    price: zone.price, color: '#4f7df0', lineWidth: 2,
    lineStyle: LC.LineStyle.Solid,
    title: `Entry ${zone.price.toFixed(dp)}`, axisLabelVisible: true,
  });

  // TP line (green dashed)
  if (zone.tp != null) {
    cs.createPriceLine({
      price: zone.tp, color: '#26a69a', lineWidth: 1,
      lineStyle: LC.LineStyle.Dashed,
      title: `TP ${zone.tp.toFixed(dp)}`, axisLabelVisible: true,
    });
  }

  // SL line (red dashed)
  if (zone.sl != null) {
    cs.createPriceLine({
      price: zone.sl, color: '#ef5350', lineWidth: 1,
      lineStyle: LC.LineStyle.Dashed,
      title: `SL ${zone.sl.toFixed(dp)}`, axisLabelVisible: true,
    });
  }

  // Touch marker
  if (record.touchIdx != null && candles[record.touchIdx]) {
    cs.setMarkers([{
      time:     candles[record.touchIdx].time,
      position: zone.direction === 'long' ? 'belowBar' : 'aboveBar',
      color:    '#f39c12',
      shape:    zone.direction === 'long' ? 'arrowUp' : 'arrowDown',
      text:     'Touch',
    }]);
  }

  _auditChart.timeScale().fitContent();
}

// ── Audit page rendering ──────────────────────────────────────────────────────
export function renderAuditPage(container) {
  let activeFilter = 'today';
  let customFrom = '', customTo = '';

  function getFiltered() {
    const all = loadAuditRecords();
    const today = todayStr();
    const yest  = yesterdayStr();
    const ws    = weekStartStr();
    return all.filter(r => {
      if (activeFilter === 'today')     return r.date === today;
      if (activeFilter === 'yesterday') return r.date === yest;
      if (activeFilter === 'week')      return r.date >= ws && r.date <= today;
      if (activeFilter === 'custom' && customFrom && customTo) return r.date >= customFrom && r.date <= customTo;
      return true; // 'all'
    });
  }

  function computeStats(records) {
    const total   = records.length;
    const checked = records.filter(r => r.outcome && r.outcome !== null).length;
    const touched = records.filter(r => ['WIN', 'LOSS', 'TOUCHED'].includes(r.outcome)).length;
    const wins    = records.filter(r => r.outcome === 'WIN').length;
    const losses  = records.filter(r => r.outcome === 'LOSS').length;
    return { total, checked, touched, wins, losses };
  }

  function sortRecords(records) {
    return [...records].sort((a, b) =>
      b.date.localeCompare(a.date) || (b.zone.stars - a.zone.stars)
    );
  }

  function renderRows(sorted) {
    if (!sorted.length) {
      return `<tr><td colspan="13" class="audit-empty-cell">No zones recorded for this period.</td></tr>`;
    }
    return sorted.map((r, idx) => {
      const starsStr = '★'.repeat(r.zone.stars) + '☆'.repeat(5 - r.zone.stars);
      const dirTxt   = r.zone.direction === 'long' ? '↑ Long' : r.zone.direction === 'short' ? '↓ Short' : '·';
      const dirCls   = r.zone.direction === 'long' ? 'audit-long' : r.zone.direction === 'short' ? 'audit-short' : '';
      const tagsHtml = r.zone.tags.slice(0, 3).map(t => `<span class="al-tag">${t}</span>`).join('');
      const oc = outcomeCls(r.outcome);
      return `<tr class="audit-row">
        <td>${formatDisplayDate(r.date)}<br><span class="audit-day">${getDayOfWeek(r.date)}</span></td>
        <td class="audit-pair">${r.sym}</td>
        <td><span class="al-verdict-badge ${r.verdict}" style="font-size:10px;padding:2px 8px">${r.verdict}</span></td>
        <td class="${dirCls}">${dirTxt}</td>
        <td class="audit-stars">${starsStr}</td>
        <td class="audit-price">${r.zone.price.toFixed(r.dp)}</td>
        <td class="audit-sl">${r.zone.sl?.toFixed(r.dp) ?? '—'}</td>
        <td class="audit-tp">${r.zone.tp?.toFixed(r.dp) ?? '—'}</td>
        <td>${r.zone.rrRaw}</td>
        <td>${tagsHtml}</td>
        <td><span class="audit-session-pill">${getSessionLabel(r.timestamp)}</span></td>
        <td><span class="audit-outcome ${oc}">${outcomeLabel(r.outcome)}</span></td>
        <td class="audit-actions">
          <button class="audit-check-btn" data-idx="${idx}" title="Check M1 OHLC for outcome">↻</button>
          <button class="audit-view-btn"  data-idx="${idx}" title="View M1 chart">📈</button>
        </td>
      </tr>`;
    }).join('');
  }

  function rerender() {
    const filtered = getFiltered();
    const sorted   = sortRecords(filtered);
    const stats    = computeStats(filtered);
    const hitPct   = stats.checked  ? Math.round(stats.touched / stats.checked * 100) : 0;
    const winPct   = (stats.wins + stats.losses) ? Math.round(stats.wins / (stats.wins + stats.losses) * 100) : 0;

    const filterBtns = ['today', 'yesterday', 'week', 'all'].map(f =>
      `<button class="audit-filter-btn${activeFilter === f ? ' active' : ''}" data-af="${f}">${
        { today: 'Today', yesterday: 'Yesterday', week: 'This Week', all: 'All (14d)' }[f]
      }</button>`
    ).join('');

    container.innerHTML = `
      <div class="audit-page">
        <div class="audit-header-row">
          <div>
            <div class="audit-title">Zone Audit</div>
            <div class="audit-sub">Track whether Entry Lens levels were hit — and what happened next</div>
          </div>
          <a href="#" class="al-back-link">← Grid</a>
        </div>

        <div class="audit-filter-bar">
          ${filterBtns}
          <span class="audit-filter-sep"></span>
          <span class="audit-filter-label">Custom:</span>
          <input type="date" class="audit-date-input" id="auditFromDate" value="${customFrom}">
          <span class="audit-filter-label">→</span>
          <input type="date" class="audit-date-input" id="auditToDate" value="${customTo}">
          <button class="audit-filter-btn" id="auditCustomApply">Apply</button>
        </div>

        <div class="audit-stats-bar">
          <div class="audit-stat"><div class="audit-stat-val">${stats.total}</div><div class="audit-stat-lbl">Zones</div></div>
          <div class="audit-stat"><div class="audit-stat-val">${stats.checked}</div><div class="audit-stat-lbl">Checked</div></div>
          <div class="audit-stat">
            <div class="audit-stat-val audit-stat-touched">${stats.touched}${stats.checked ? ` <span class="audit-stat-pct">(${hitPct}%)</span>` : ''}</div>
            <div class="audit-stat-lbl">Touched</div>
          </div>
          <div class="audit-stat">
            <div class="audit-stat-val audit-stat-win">${stats.wins}${(stats.wins + stats.losses) ? ` <span class="audit-stat-pct">(${winPct}% WR)</span>` : ''}</div>
            <div class="audit-stat-lbl">Won</div>
          </div>
          <div class="audit-stat"><div class="audit-stat-val audit-stat-loss">${stats.losses}</div><div class="audit-stat-lbl">Lost</div></div>
          <div style="margin-left:auto">
            <button class="audit-check-all-btn" id="auditCheckAll" ${!sorted.filter(r => !r.outcome).length ? 'disabled' : ''}>
              ↻ Check ${sorted.filter(r => !r.outcome).length} Pending
            </button>
          </div>
        </div>

        <div class="audit-table-wrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Date</th><th>Pair</th><th>Verdict</th><th>Dir</th><th>Stars</th>
                <th>Entry</th><th>SL</th><th>TP</th><th>R:R</th><th>Source</th>
                <th>Session</th><th>Outcome</th><th></th>
              </tr>
            </thead>
            <tbody id="auditTableBody">${renderRows(sorted)}</tbody>
          </table>
        </div>
        ${!loadAuditRecords().length ? `
          <div class="audit-empty-msg">
            No zone history yet. Entry Lens snapshots are saved automatically on each load — come back after a few sessions.
          </div>` : ''}
      </div>`;

    // Filter buttons
    container.querySelectorAll('[data-af]').forEach(btn => {
      btn.addEventListener('click', () => { activeFilter = btn.dataset.af; rerender(); });
    });

    // Custom date apply
    container.querySelector('#auditCustomApply')?.addEventListener('click', () => {
      const from = container.querySelector('#auditFromDate')?.value ?? '';
      const to   = container.querySelector('#auditToDate')?.value ?? '';
      if (from && to) { customFrom = from; customTo = to; activeFilter = 'custom'; rerender(); }
    });

    // View M1 chart
    container.querySelectorAll('.audit-view-btn').forEach(btn => {
      btn.addEventListener('click', () => openTradeModal(sorted[parseInt(btn.dataset.idx)]));
    });

    // Single outcome check
    container.querySelectorAll('.audit-check-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const record = sorted[parseInt(btn.dataset.idx)];
        btn.textContent = '…'; btn.disabled = true;
        const updated = await fetchAndComputeOutcome(record);
        const all = loadAuditRecords();
        const i = all.findIndex(r => r.id === updated.id);
        if (i >= 0) { all[i] = updated; saveAuditRecords(all); }
        rerender();
      });
    });

    // Check all pending
    container.querySelector('#auditCheckAll')?.addEventListener('click', async () => {
      const pending = sorted.filter(r => !r.outcome);
      if (!pending.length) return;
      const btn = container.querySelector('#auditCheckAll');
      btn.disabled = true;
      btn.textContent = `Checking 0/${pending.length}…`;
      const all = loadAuditRecords();
      for (let k = 0; k < pending.length; k++) {
        btn.textContent = `Checking ${k + 1}/${pending.length}…`;
        const updated = await fetchAndComputeOutcome(pending[k]);
        const i = all.findIndex(r => r.id === updated.id);
        if (i >= 0) all[i] = updated;
      }
      saveAuditRecords(all);
      rerender();
    });
  }

  rerender();
}
