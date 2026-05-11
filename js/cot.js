import { S } from './state.js';
import { loadCached, kvSet } from './utils.js';

const COT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — COT is weekly

// ── Loading ───────────────────────────────────────────────────────────────────

export async function loadCOT() {
  try {
    S.cotData = await loadCached('cot_data',
      async () => {
        const res = await fetch('/api/cot');
        const j = await res.json();
        if (!j.ok) throw new Error(j.reason || 'COT fetch failed');
        return j.data;
      },
      COT_TTL
    );
  } catch(e) {
    console.warn('COT load failed:', e.message);
    S.cotData = null;
  }
}

export async function loadCOTUrls() {
  try {
    const res = await fetch('/api/cot/urls');
    const j = await res.json();
    return j.urls || { fx: null, gold: null, equity: null };
  } catch(e) {
    return { fx: null, gold: null, equity: null };
  }
}

export async function saveCOTUrls(urls) {
  const res = await fetch('/api/cot/urls', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(urls),
  });
  const j = await res.json();
  if (j.ok) {
    try { localStorage.removeItem('cot_data'); } catch(e) {}
    kvSet('cot_data', null);
  }
  return j;
}

export function getCOTForPair(sym) {
  return S.cotData?.[sym] || null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtK(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(2) + 'M';
  if (abs >= 1000)    return sign + (abs / 1000).toFixed(1)    + 'k';
  return n.toString();
}

function fmtChg(n) {
  if (n == null || isNaN(n)) return '';
  return (n >= 0 ? '+' : '') + fmtK(n);
}

// ── Per-pair COT card ─────────────────────────────────────────────────────────

export function renderCOTCard(sym) {
  const d = getCOTForPair(sym);

  if (!S.cotData) {
    return `<div class="cot-empty">
      <div class="cot-empty-icon">📋</div>
      <div class="cot-empty-text">COT data not loaded</div>
      <div class="cot-empty-sub">Set this week's CFTC URL via the <strong>COT</strong> toolbar button</div>
    </div>`;
  }

  if (!d) {
    return `<div class="cot-empty">
      <div class="cot-empty-icon">—</div>
      <div class="cot-empty-sub">No COT data for ${sym} in this report</div>
    </div>`;
  }

  const levDir   = d.levNet > 0 ? 'long' : d.levNet < 0 ? 'short' : 'neutral';
  const levLabel = d.levNet > 0 ? '↑ LONG' : d.levNet < 0 ? '↓ SHORT' : '— FLAT';
  const total    = d.levLong + d.levShort;
  const longPct  = total > 0 ? Math.round(d.levLong / total * 100) : 50;
  const shortPct = 100 - longPct;
  const crowded  = d.crowdingPct != null && d.crowdingPct >= 10;
  const isDisagg = d._report === 'disagg';
  const specLabel    = isDisagg ? 'Managed Money' : 'Leveraged Funds';
  const specSub      = isDisagg ? '(hedge funds / CTAs)' : '(specs / CTAs)';
  const amLabel      = isDisagg ? 'Swap Dealers' : 'Asset Mgr / Institutional';
  const dealerLabel  = isDisagg ? 'Producer / Merchant' : 'Dealer Intermediary';

  return `
<div class="cot-card">
  <div class="cot-spec-row">
    <span class="cot-spec-lbl">${specLabel} <span style="font-weight:400;font-size:10px">${specSub}</span></span>
    <span class="cot-dir ${levDir}">${levLabel}</span>
  </div>

  <div class="cot-bar-wrap">
    <div class="cot-bar-long"  style="width:${longPct}%"></div>
    <div class="cot-bar-short" style="width:${shortPct}%"></div>
  </div>
  <div class="cot-bar-labels">
    <span class="cot-long-lbl">${fmtK(d.levLong)} L</span>
    <span class="cot-net-lbl ${levDir}">${fmtK(d.levNet)} net <span style="font-size:10px;font-weight:400">(${fmtChg(d.levNetChg)} wk)</span></span>
    <span class="cot-short-lbl">${fmtK(d.levShort)} S</span>
  </div>
  ${d.levPct != null ? `<div class="cot-pct-row">Spec net = <strong>${d.levPct > 0 ? '+' : ''}${d.levPct.toFixed(1)}%</strong> of open interest${d.crowdingPct >= 20 ? ' <span class="cot-extreme">EXTREME</span>' : d.crowdingPct >= 10 ? ' <span class="cot-elevated">ELEVATED</span>' : ''}</div>` : ''}
  ${d.numLevLong || d.numLevShort ? `<div class="cot-traders-row">${d.numLevLong} long traders · ${d.numLevShort} short traders${d.avgLevContracts ? ` · avg ${fmtK(d.avgLevContracts)}/trader` : ''}</div>` : ''}
  ${d.grossRatio ? `<div class="cot-traders-row">Gross L/S ratio: <strong>${d.grossRatio}×</strong>${d.grossRatio > 3 ? ' <span style="color:var(--amber)">⚠ one-sided</span>' : ''}</div>` : ''}

  <div class="cot-divider"></div>

  <div class="cot-cat-row">
    <span class="cot-cat-lbl">${amLabel}</span>
    <span class="cot-cat-net ${d.amNet > 0 ? 'long' : 'short'}">${fmtChg(d.amNet)} <span style="font-size:10px;color:var(--text3)">(${fmtChg(d.amNetChg)} wk)</span></span>
  </div>
  <div class="cot-cat-row">
    <span class="cot-cat-lbl">${dealerLabel}</span>
    <span class="cot-cat-net ${d.dealerNet > 0 ? 'long' : 'short'}">${fmtChg(d.dealerNet)} <span style="font-size:10px;color:var(--text3)">(${fmtChg(d.dealerNetChg)} wk)</span></span>
  </div>

  ${crowded ? `<div class="cot-crowding">⚠ Spec positioning at ${d.crowdingPct}% of OI — watch for crowded-trade unwind risk</div>` : ''}

  <div class="cot-footer">
    Report: ${d.changeDate || '—'} · OI ${fmtK(d.openInterest)}
  </div>
</div>`;
}

// ── Cross-pair positioning bar chart ─────────────────────────────────────────

export function renderCOTCrossPair() {
  if (!S.cotData || Object.keys(S.cotData).length === 0) return '';

  const pairs = Object.entries(S.cotData)
    .map(([pair, d]) => ({ pair, levNet: d.levNet, levPct: d.levPct ?? 0 }))
    .sort((a, b) => b.levNet - a.levNet);

  const maxAbs = Math.max(...pairs.map(p => Math.abs(p.levNet)), 1);

  return `<div class="cot-cross">
    ${pairs.map(({ pair, levNet }) => {
      const pct = levNet / maxAbs * 100;
      const isActive = pair === S.currentPair?.symbol;
      const barLeft  = pct >= 0 ? 50 : 50 + pct * 0.5;
      const barWidth = Math.abs(pct) * 0.5;
      return `<div class="cot-cross-row ${isActive ? 'active' : ''}">
        <span class="cot-cross-pair">${pair}</span>
        <div class="cot-cross-bar-wrap">
          <div class="cot-cross-midline"></div>
          <div class="cot-cross-bar ${levNet >= 0 ? 'long' : 'short'}" style="left:${barLeft.toFixed(1)}%;width:${Math.max(barWidth, 1).toFixed(1)}%"></div>
        </div>
        <span class="cot-cross-net ${levNet >= 0 ? 'long' : 'short'}">${fmtK(levNet)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ── COT signal for AI snapshot ────────────────────────────────────────────────

export function cotSnapshotForAI(sym) {
  const d = getCOTForPair(sym);
  if (!d) return null;
  return {
    reportDate:   d.changeDate,
    levNet:       d.levNet,
    levNetChg:    d.levNetChg,
    levPct:       d.levPct,
    numLevLong:   d.numLevLong,
    numLevShort:  d.numLevShort,
    avgContracts: d.avgLevContracts,
    amNet:        d.amNet,
    amNetChg:     d.amNetChg,
    dealerNet:    d.dealerNet,
    grossRatio:   d.grossRatio,
    crowdingPct:  d.crowdingPct,
    openInterest: d.openInterest,
  };
}

// ── COT URL modal ─────────────────────────────────────────────────────────────

export async function openCOTModal() {
  const overlay = document.getElementById('cotModalOverlay');
  if (!overlay) return;
  overlay.classList.add('open');

  const statusEl = document.getElementById('cotModalStatus');
  if (statusEl) statusEl.textContent = '';

  const urls = await loadCOTUrls();
  const fxEl     = document.getElementById('cotUrlFx');
  const goldEl   = document.getElementById('cotUrlGold');
  const equityEl = document.getElementById('cotUrlEquity');
  if (fxEl     && urls.fx)     fxEl.value     = urls.fx;
  if (goldEl   && urls.gold)   goldEl.value   = urls.gold;
  if (equityEl && urls.equity) equityEl.value = urls.equity;

  if (S.cotData) {
    const dates = Object.values(S.cotData).map(d => d.changeDate).filter(Boolean);
    const dateStr = dates[0] ? 'Loaded: ' + dates[0] : '';
    const fxDate     = document.getElementById('cotReportDateFx');
    const goldDate   = document.getElementById('cotReportDateGold');
    const equityDate = document.getElementById('cotReportDateEquity');
    if (fxDate     && S.cotData['EUR/USD'])     fxDate.textContent     = dateStr;
    if (goldDate   && S.cotData['XAU/USD'])     goldDate.textContent   = 'Loaded: ' + (S.cotData['XAU/USD'].changeDate || '');
    if (equityDate && S.cotData['NAS100_USD'])  equityDate.textContent = 'Loaded: ' + (S.cotData['NAS100_USD'].changeDate || '');
  }
}

export function closeCOTModal() {
  document.getElementById('cotModalOverlay')?.classList.remove('open');
}

export async function refreshCOT() {
  const statusEl = document.getElementById('cotModalStatus');
  const btn      = document.getElementById('cotRefreshBtn');
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Fetching fresh COT data…'; statusEl.className = 'cot-modal-status'; }

  // Bypass loadCached entirely — fetch directly from /api/cot so stale KV cannot intercept.
  // Then write the fresh result into both caches explicitly.
  try {
    const res = await fetch('/api/cot');
    const j   = await res.json();
    if (!j.ok) throw new Error(j.reason || 'COT fetch failed');

    S.cotData = j.data;

    // Overwrite both caches with fresh data + current timestamp
    const entry = { data: j.data, timestamp: Date.now() };
    try { localStorage.setItem('cot_data', JSON.stringify(entry)); } catch(e) {}
    await kvSet('cot_data', j.data);

    const dates = Object.values(j.data).map(d => d.changeDate).filter(Boolean);
    const pairs = Object.keys(j.data).length;
    if (statusEl) {
      statusEl.textContent = `✓ Refreshed — ${pairs} pairs · ${dates[0] || ''}`;
      statusEl.className = 'cot-modal-status ok';
    }
  } catch(e) {
    S.cotData = null;
    if (statusEl) {
      statusEl.textContent = `⚠ ${e.message}`;
      statusEl.className = 'cot-modal-status err';
    }
  }

  if (btn) btn.disabled = false;
  if (S.cotData) window.renderAll?.();
}

export async function saveCOTUrlFromModal() {
  const statusEl = document.getElementById('cotModalStatus');
  const btn      = document.getElementById('cotSaveBtn');

  const fx     = document.getElementById('cotUrlFx')?.value?.trim()     || null;
  const gold   = document.getElementById('cotUrlGold')?.value?.trim()   || null;
  const equity = document.getElementById('cotUrlEquity')?.value?.trim() || null;

  for (const [label, u] of [['FX', fx], ['Gold', gold], ['Equity', equity]]) {
    if (u && !u.includes('cftc.gov')) {
      if (statusEl) { statusEl.textContent = `⚠ ${label} URL must be from cftc.gov`; statusEl.className = 'cot-modal-status err'; }
      return;
    }
  }
  if (!fx && !gold && !equity) {
    if (statusEl) { statusEl.textContent = '⚠ Enter at least one URL'; statusEl.className = 'cot-modal-status err'; }
    return;
  }

  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Saving…'; statusEl.className = 'cot-modal-status'; }

  const res = await saveCOTUrls({ fx, gold, equity });
  if (!res.ok) {
    if (statusEl) { statusEl.textContent = '⚠ ' + (res.error || 'Save failed'); statusEl.className = 'cot-modal-status err'; }
    if (btn) btn.disabled = false;
    return;
  }

  if (statusEl) { statusEl.textContent = '✓ Saved — loading COT data…'; statusEl.className = 'cot-modal-status ok'; }
  await loadCOT();

  if (statusEl) {
    const dates  = S.cotData ? Object.values(S.cotData).map(d => d.changeDate).filter(Boolean) : [];
    const pairs  = S.cotData ? Object.keys(S.cotData).length : 0;
    statusEl.textContent = S.cotData
      ? `✓ Loaded ${pairs} pairs · ${dates[0] || ''}` : '⚠ Fetch succeeded but 0 pairs parsed';
    statusEl.className = S.cotData ? 'cot-modal-status ok' : 'cot-modal-status err';
  }

  if (btn) btn.disabled = false;
  if (S.cotData) window.renderAll?.();
}
