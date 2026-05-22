import { S } from './state.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
  'NZD/USD', 'USD/CAD', 'USD/CHF', 'XAU/USD', 'NAS100_USD',
];

// ── Module-scoped state ───────────────────────────────────────────────────────

let _v2TrainStatus = {};
let _trainingInProgress = false;
let _pollTimer = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function openV2Modal() {
  const overlay = document.getElementById('v2ModalOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  const content = document.getElementById('v2ModalContent');
  if (content) content.innerHTML = renderV2Modal();
  loadHMM5mV2();
}

export function closeV2Modal() {
  const overlay = document.getElementById('v2ModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

export async function loadHMM5mV2() {
  try {
    const [v2Res, statusRes] = await Promise.all([
      fetch('/api/hmm5m-v2'),
      fetch('/api/hmm5m-train-status'),
    ]);

    if (v2Res.ok) {
      S.hmm5mV2Regimes = await v2Res.json();
    }
    if (statusRes.ok) {
      _v2TrainStatus = await statusRes.json();
    }

    updateV2Pill();

    const overlay = document.getElementById('v2ModalOverlay');
    if (overlay && overlay.classList.contains('open')) {
      _rerenderCompareTable();
      _rerenderStatusBar();
    }
  } catch (_e) {
    // silent
  }
}

export function updateV2Pill() {
  const el = document.getElementById('hdrRegimeV2');
  if (!el) return;

  const sym = S.currentPair?.symbol;
  const r = sym && S.hmm5mV2Regimes && S.hmm5mV2Regimes[sym];

  if (!r) {
    el.style.display = 'none';
    return;
  }

  const regime = r.regime || 'RANGE';
  const pct    = Math.round(r.confidence ?? 0);
  const pBull  = Math.round(r.pBull  ?? 0);
  const pBear  = Math.round(r.pBear  ?? 0);
  const pRange = Math.round(r.pRange ?? 0);
  const pChop  = Math.round(r.pChop  ?? 0);
  const trendZ = (r.trendZ ?? 0).toFixed(2);
  const volZ = (r.volZ ?? 0).toFixed(2);
  const adxZ = (r.adxZ ?? 0).toFixed(2);
  const macroLabel = r.macroContext?.label ?? '—';
  const vix = r.macroContext?.vix != null ? r.macroContext.vix.toFixed(1) : '—';

  el.className = `hdr-regime ${regime.toLowerCase()} v2-pill`;
  el.title = [
    `Bull ${pBull}% · Bear ${pBear}% · Range ${pRange}% · Chop ${pChop}%`,
    `trendZ ${trendZ} volZ ${volZ} adxZ ${adxZ}`,
    `Macro: ${macroLabel} · VIX ${vix}`,
  ].join('\n');
  el.style.display = '';

  el.innerHTML = `
    <span class="regime-dot"></span>
    <span>[V2] ${regime} ${pct}%</span>
  `;
}

export async function triggerV2Training() {
  if (_trainingInProgress) return;

  _trainingInProgress = true;
  _rerenderTrainingSection();

  try {
    await fetch('/api/hmm5m-train', { method: 'POST' });
  } catch (_e) {
    // continue to poll even if POST itself errors
  }

  let elapsed = 0;
  const POLL_INTERVAL = 2000;
  const MAX_WAIT = 60000;

  if (_pollTimer) clearInterval(_pollTimer);

  _pollTimer = setInterval(async () => {
    elapsed += POLL_INTERVAL;

    try {
      const res = await fetch('/api/hmm5m-train-status');
      if (res.ok) _v2TrainStatus = await res.json();
    } catch (_e) {
      // keep polling
    }

    _rerenderTrainingSection();

    const statuses = Object.values(_v2TrainStatus)
      .filter(s => s && 'status' in s)
      .map(s => s.status);
    const allSettled = statuses.length > 0 &&
      statuses.every(s => s === 'done' || s === 'error');

    if (allSettled || elapsed >= MAX_WAIT) {
      clearInterval(_pollTimer);
      _pollTimer = null;
      _trainingInProgress = false;
      _rerenderTrainingSection();
      await loadHMM5mV2();
    }
  }, POLL_INTERVAL);
}

// ── Internal render helpers ───────────────────────────────────────────────────

function renderV2Modal() {
  return `
    <div class="oi-modal-hd">
      <div>
        <div class="oi-modal-title">&#x1F52C; HMM V2 Shadow Model</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">
          Baum-Welch learned emissions &middot; 4-state HMM &middot; FRED macro overlay &middot; session-aware
        </div>
      </div>
      <button class="oi-btn" onclick="closeV2Modal()">&#x2715; Close</button>
    </div>

    <div id="v2StatusBar">${_renderStatusBar()}</div>

    <div style="height:1px;background:var(--border);margin:16px 0"></div>

    <div id="v2TrainingSection">${_renderTrainingSection()}</div>

    <div style="height:1px;background:var(--border);margin:16px 0"></div>

    <div id="v2CompareSection">${_renderCompareTable()}</div>

    <div style="height:1px;background:var(--border);margin:20px 0"></div>

    <div id="v2ExtractSection">${_renderExtractSection()}</div>

    <div style="height:1px;background:var(--border);margin:20px 0"></div>

    ${_renderDailyGuide()}
  `;
}

function _renderStatusBar() {
  const allStatuses = Object.values(_v2TrainStatus).filter(s => s && typeof s === 'object' && 'status' in s);
  const anyLearned = _v2TrainStatus._meta?.hasLearnedParams
    || (S.hmm5mV2Regimes
      ? Object.values(S.hmm5mV2Regimes).some(r => r.isLearned)
      : false);

  let lastTrained = 'Never — click Train to begin';
  let badgeHtml = `<span style="font-size:10px;background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-bd);padding:2px 8px;border-radius:8px;font-weight:600">NOT TRAINED</span>`;

  if (anyLearned) {
    const doneStatuses = allStatuses.filter(s => s.status === 'done' && s.completedAt);
    if (doneStatuses.length > 0) {
      const latest = Math.max(...doneStatuses.map(s => s.completedAt));
      lastTrained = new Date(latest).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } else {
      lastTrained = 'Params loaded';
    }
    badgeHtml = `<span style="font-size:10px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd);padding:2px 8px;border-radius:8px;font-weight:600">LEARNED</span>`;
  }

  return `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);font-weight:600;margin-bottom:3px">
          Training Status
        </div>
        <div style="font-size:12px;color:var(--text);font-family:'DM Mono',monospace">
          Last trained: ${lastTrained}
        </div>
      </div>
      ${badgeHtml}
    </div>
  `;
}

function _renderTrainingSection() {
  const statuses = _v2TrainStatus;
  const pairs = DEFAULT_PAIRS;

  let progressHtml = '';

  if (_trainingInProgress) {
    const rows = pairs.map(sym => {
      const st = statuses[sym];
      const status = st?.status ?? 'queued';
      const colour = status === 'done' ? 'var(--green)'
        : status === 'error' ? 'var(--red)'
        : status === 'training' ? 'var(--blue)'
        : 'var(--text3)';
      const icon = status === 'done' ? '&#x2713;'
        : status === 'error' ? '&#x2717;'
        : status === 'training' ? '&#x25CC;'
        : status === 'fetching' ? '&#x2193;'
        : '&#x2026;';
      const detail = status === 'done' && st?.iterations
        ? ` ${st.iterations} iter, ${st.nBars ?? '?'} bars`
        : status === 'error' ? ' failed'
        : status === 'training' ? ' running...'
        : status === 'fetching' ? ' fetching bars...'
        : '';
      return `<div style="display:flex;gap:6px;align-items:center;font-size:11px;font-family:'DM Mono',monospace">
        <span style="color:${colour};width:14px;text-align:center">${icon}</span>
        <span style="color:var(--text2);width:90px">${sym}</span>
        <span style="color:${colour}">${status}${detail}</span>
      </div>`;
    }).join('');

    progressHtml = `
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:4px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);font-weight:600;margin-bottom:6px">
          Training in progress&#x2026;
        </div>
        ${rows}
      </div>
    `;
  } else {
    const doneStatuses = Object.values(statuses).filter(s => s.status === 'done');
    if (doneStatuses.length > 0) {
      const avgIter = doneStatuses.reduce((a, s) => a + (s.iterations ?? 0), 0) / doneStatuses.length;
      progressHtml = `
        <div style="margin-top:10px;font-size:11px;color:var(--green);font-family:'DM Mono',monospace">
          &#x2713; Complete &mdash; ${doneStatuses.length} pairs learned in ~${Math.round(avgIter)} iterations avg
        </div>
      `;
    }
  }

  return `
    <div>
      <button
        class="oi-btn oi-btn-primary"
        onclick="triggerV2Training()"
        ${_trainingInProgress ? 'disabled' : ''}
        style="font-size:13px;padding:9px 22px;border-radius:10px;${_trainingInProgress ? 'opacity:.6;cursor:not-allowed;' : ''}"
      >
        ${_trainingInProgress ? '&#x23F3; Training&#x2026;' : '&#x25B6; Train V2 Model'}
      </button>
      <div style="font-size:10px;color:var(--text3);margin-top:5px">
        Fetches 5,000 M1 bars per instrument and runs Baum-Welch EM. Takes ~20&ndash;30 seconds.
      </div>
      ${progressHtml}
    </div>
  `;
}

function _renderCompareTable() {
  const v1Data = S.hmm5mRegimes ?? {};
  const v2Data = S.hmm5mV2Regimes ?? {};
  const hasAny = DEFAULT_PAIRS.some(sym => v1Data[sym] || v2Data[sym]);

  if (!hasAny) {
    return `<div style="font-size:11px;color:var(--text3);padding:8px 0">
      No regime data loaded yet. Data will appear here once regimes are fetched.
    </div>`;
  }

  const headerStyle = 'padding:7px 10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text3);border-bottom:1.5px solid var(--border);text-align:left;white-space:nowrap';
  const cellStyle = 'padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);font-family:"DM Mono",monospace;vertical-align:middle';

  const rows = DEFAULT_PAIRS.map(sym => {
    const v1 = v1Data[sym];
    const v2 = v2Data[sym];

    const v1Regime = v1?.regime ?? '—';
    const v1Conf = v1 ? Math.round(v1.confidence ?? 0) + '%' : '—';

    const v2Regime = v2?.regime ?? '—';
    const v2Conf = v2 ? Math.round(v2.confidence ?? 0) + '%' : '—';
    const v2IsDefault = v2 && !v2.isLearned;

    let matchHtml = '<span style="color:var(--text3)">—</span>';
    let rowBg = '';
    if (v1 && v2) {
      if (v1Regime === v2Regime) {
        matchHtml = '<span style="color:var(--green);font-weight:700">&#x2713;</span>';
      } else {
        matchHtml = '<span style="color:var(--amber);font-weight:700">&#x2717;</span>';
        rowBg = 'background:var(--amber-bg);';
      }
    }

    const macroLabel = v2?.macroContext?.label ?? '—';
    const macroColour = macroLabel === 'CALM' ? 'var(--green)'
      : macroLabel === 'STRESS' ? 'var(--red)'
      : macroLabel === 'CAUTION' ? 'var(--amber)'
      : 'var(--text3)';

    const sessionLabel = v2?.sessionLabel ?? '—';

    const v2RegimeDisplay = v2IsDefault
      ? `${v2Regime} <span style="font-size:9px;color:var(--text3)">[default]</span>`
      : v2Regime;

    const v2RegimeColour = v2Regime === 'BULL' ? 'var(--green)'
      : v2Regime === 'BEAR' ? 'var(--red)'
      : v2Regime === 'CHOP' ? 'var(--text3)'
      : 'var(--amber)';

    const v1RegimeColour = v1Regime === 'BULL' ? 'var(--green)'
      : v1Regime === 'BEAR' ? 'var(--red)'
      : 'var(--amber)';

    return `<tr style="${rowBg}">
      <td style="${cellStyle}color:var(--text);font-weight:500">${sym}</td>
      <td style="${cellStyle}color:${v1RegimeColour}">${v1Regime}</td>
      <td style="${cellStyle}color:var(--text2)">${v1Conf}</td>
      <td style="${cellStyle}color:${v2RegimeColour}">${v2RegimeDisplay}</td>
      <td style="${cellStyle}color:var(--text2)">${v2Conf}</td>
      <td style="${cellStyle}text-align:center">${matchHtml}</td>
      <td style="${cellStyle}color:${macroColour}">${macroLabel}</td>
      <td style="${cellStyle}color:var(--text2)">${sessionLabel}</td>
    </tr>`;
  }).join('');

  return `
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);font-weight:600;margin-bottom:10px">
        V1 vs V2 Comparison &mdash; All Pairs
      </div>
      <div style="overflow-x:auto">
        <table class="v2-compare-table" style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:var(--s2)">
              <th style="${headerStyle}">Pair</th>
              <th style="${headerStyle}">V1 Regime</th>
              <th style="${headerStyle}">V1 Conf</th>
              <th style="${headerStyle}">V2 Regime</th>
              <th style="${headerStyle}">V2 Conf</th>
              <th style="${headerStyle}text-align:center">Match</th>
              <th style="${headerStyle}">Macro</th>
              <th style="${headerStyle}">Session</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:6px">
        &#x2713; = models agree &nbsp;&middot;&nbsp;
        &#x2717; = regimes diverge (row highlighted) &nbsp;&middot;&nbsp;
        [default] = not yet trained
      </div>
    </div>
  `;
}

function _renderExtractSection() {
  const pairOpts = DEFAULT_PAIRS
    .map(p => `<option value="${p}">${p}</option>`)
    .join('');

  return `
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);font-weight:600;margin-bottom:10px">
        Pine Script Parameters
      </div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:10px;line-height:1.5">
        Extract learned emission parameters for one instrument and paste them into
        the Pine indicator inputs on TradingView.
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <select id="v2ExtractPair" class="oi-select" style="font-size:12px;padding:5px 8px;border-radius:7px;background:var(--s2);border:1px solid var(--border);color:var(--text);min-width:110px">
          ${pairOpts}
        </select>
        <button class="oi-btn oi-btn-primary" onclick="extractV2Params()" style="font-size:12px;padding:6px 16px;border-radius:8px">
          &#x25B6; Extract
        </button>
        <button class="oi-btn" id="v2CopyBtn" onclick="copyV2Params()" style="font-size:12px;padding:6px 16px;border-radius:8px;display:none">
          &#x2398; Copy
        </button>
      </div>
      <textarea
        id="v2ExtractOutput"
        readonly
        placeholder="Select a pair and click Extract…"
        style="width:100%;min-height:175px;font-family:'DM Mono',monospace;font-size:11px;padding:10px;background:var(--s2);border:1px solid var(--border);border-radius:8px;color:var(--text2);resize:vertical;box-sizing:border-box;line-height:1.7"
      ></textarea>
      <div id="v2ExtractMsg" style="font-size:10px;color:var(--text3);margin-top:4px"></div>
    </div>
  `;
}

function _renderDailyGuide() {
  const section = (title, body) => `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:6px">${title}</div>
      ${body}
    </div>
  `;

  const mono = (text) =>
    `<div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--text2);line-height:1.7;white-space:pre-wrap">${text}</div>`;

  return `
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px;display:flex;align-items:center;gap:8px">
        <span>&#x1F4C5;</span> Daily Workflow
      </div>

      ${section('Morning (after London open, ~08:00 UTC)', mono(
        '1. Click "Train V2 Model" above — fetches 5,000 M1 bars per instrument\n' +
        '   and runs Baum-Welch EM to learn emission parameters from real data.\n' +
        '   Takes ~20–30 seconds. Do this once per day.\n' +
        '2. Watch the V2 pill (below V1 in the header) update within 60 seconds.\n' +
        '3. Check the comparison table. Green ✓ = models agree. Amber ✗ = diverge —\n' +
        '   worth investigating before trading that pair.'
      ))}

      ${section('When to re-train', mono(
        '  • After major news (NFP, FOMC, CPI) — volatility regime shifts\n' +
        '  • After a prolonged holiday — market structure changes\n' +
        '  • Weekly minimum to keep parameters fresh'
      ))}

      ${section('Reading the comparison', `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${_guideEntry(
            'V2 shows CHOP where V1 shows RANGE',
            'V2 detecting elevated vol with no direction — avoid range-fade setups',
            'var(--amber)'
          )}
          ${_guideEntry(
            'V1 higher confidence than V2',
            'Macro context (VIX/credit spread) dampening V2’s conviction',
            'var(--blue)'
          )}
          ${_guideEntry(
            'Both agree at high confidence',
            'High conviction — both statistical and learned models aligned',
            'var(--green)'
          )}
          ${_guideEntry(
            'V2 params marked [default]',
            'Not yet trained — click Train first before relying on V2 output',
            'var(--text3)'
          )}
        </div>
      `)}

      ${section('What V2 adds over V1', mono(
        '  • 4th CHOP state separates quiet range from high-vol chop\n' +
        '  • Learned emission parameters fitted to your actual instrument history\n' +
        '  • Session-aware: regime transitions harder during thin Asian hours\n' +
        '  • FRED macro overlay: VIX / credit spread / yield curve modulate confidence'
      ))}
    </div>
  `;
}

function _guideEntry(title, body, colour) {
  return `
    <div style="padding:8px 10px;background:var(--s2);border-radius:6px;border-left:3px solid ${colour}">
      <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:2px">${title}</div>
      <div style="font-size:11px;color:var(--text2)">${body}</div>
    </div>
  `;
}

// ── Partial re-render helpers (update sections without full modal rebuild) ────

function _rerenderStatusBar() {
  const el = document.getElementById('v2StatusBar');
  if (el) el.innerHTML = _renderStatusBar();
}

function _rerenderTrainingSection() {
  const el = document.getElementById('v2TrainingSection');
  if (el) el.innerHTML = _renderTrainingSection();
}

function _rerenderCompareTable() {
  const el = document.getElementById('v2CompareSection');
  if (el) el.innerHTML = _renderCompareTable();
}

export async function extractV2Params() {
  const pair   = document.getElementById('v2ExtractPair')?.value;
  const output = document.getElementById('v2ExtractOutput');
  const msg    = document.getElementById('v2ExtractMsg');
  const copy   = document.getElementById('v2CopyBtn');
  if (!output) return;

  output.value = 'Loading…';
  if (msg)  msg.textContent = '';
  if (copy) copy.style.display = 'none';

  try {
    const res = await fetch('/api/hmm5m-train-params');
    const data = await res.json();

    if (!res.ok || !data.ok) {
      output.value = '';
      if (msg) msg.textContent = data.error || `HTTP ${res.status}`;
      return;
    }

    const p = data.params[pair];
    if (!p) {
      output.value = '';
      if (msg) msg.textContent = `No trained parameters found for ${pair}. Run Training first.`;
      return;
    }

    const fmt = (arr) => arr.map(v => Number(v).toFixed(4)).join(',');

    // Average diagonal of transition matrix for self-prob
    const A = p.transMatrix;
    const selfProb = A && A.length === 4
      ? ((A[0][0] + A[1][1] + A[2][2] + A[3][3]) / 4).toFixed(4)
      : '0.9000';

    const lines = [
      `BULL means:  ${fmt(p.means[0])}`,
      `BULL vars:   ${fmt(p.vars[0])}`,
      `BEAR means:  ${fmt(p.means[1])}`,
      `BEAR vars:   ${fmt(p.vars[1])}`,
      `RANGE means: ${fmt(p.means[2])}`,
      `RANGE vars:  ${fmt(p.vars[2])}`,
      `CHOP means:  ${fmt(p.means[3])}`,
      `CHOP vars:   ${fmt(p.vars[3])}`,
      `Self-prob:   ${selfProb}`,
    ];

    output.value = lines.join('\n');
    if (msg)  msg.textContent = `Parameters for ${pair} — paste each value into the matching Pine indicator input.`;
    if (copy) copy.style.display = '';
  } catch (e) {
    output.value = '';
    if (msg) msg.textContent = `Error: ${e.message}`;
  }
}

export function copyV2Params() {
  const output = document.getElementById('v2ExtractOutput');
  const msg    = document.getElementById('v2ExtractMsg');
  if (!output || !output.value) return;

  navigator.clipboard.writeText(output.value).then(() => {
    if (msg) {
      msg.textContent = '✓ Copied to clipboard';
      setTimeout(() => { if (msg) msg.textContent = 'Parameters for the selected pair — paste each value into the matching Pine indicator input.'; }, 2000);
    }
  }).catch(() => {
    output.select();
    document.execCommand('copy');
    if (msg) msg.textContent = '✓ Copied (fallback)';
  });
}

// ── Window globals for onclick attributes ─────────────────────────────────────

window.openV2Modal       = openV2Modal;
window.closeV2Modal      = closeV2Modal;
window.loadHMM5mV2       = loadHMM5mV2;
window.triggerV2Training = triggerV2Training;
window.extractV2Params   = extractV2Params;
window.copyV2Params      = copyV2Params;
