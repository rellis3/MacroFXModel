// decisionUI.js — renders the permission banner into #decisionBannerCard.
// Called after renderSignalAndEntries in render.js.

import { collectDecisionInputs } from './decisionInputs.js';
import { runDecisionEngine, MODES, PARTICIPATION } from './decisionEngine.js';

// ── Colour maps ───────────────────────────────────────────────────────────────

const MODE_COLOURS = {
  [MODES.TREND_CONTINUATION]:  { bg: 'var(--green)',  label: 'TREND CONTINUATION' },
  [MODES.MEAN_REVERSION]:      { bg: 'var(--blue)',   label: 'MEAN REVERSION'     },
  [MODES.BREAKOUT]:            { bg: '#f59e0b',       label: 'BREAKOUT PREP'       },
  [MODES.POSITION_MANAGEMENT]: { bg: '#8b5cf6',       label: 'POSITION MANAGEMENT' },
  [MODES.EXHAUSTION]:          { bg: 'var(--red)',    label: 'EXHAUSTION / EXIT'   },
  [MODES.NO_TRADE]:            { bg: 'var(--text3)',  label: 'NO TRADE'            },
};

const PARTICIPATION_COLOURS = {
  [PARTICIPATION.FULL]:     'var(--green)',
  [PARTICIPATION.REDUCED]:  '#f59e0b',
  [PARTICIPATION.MINIMUM]:  'var(--red)',
  [PARTICIPATION.NO_TRADE]: 'var(--text3)',
};

const REGIME_LABELS = { BULL: '↑ Bull', BEAR: '↓ Bear', RANGE: '↔ Range', TRANSITION: '? Transition' };
const VOL_LABELS    = { COMPRESSION: 'Vol Compressed', NORMAL: 'Vol Normal', EXPANSION: 'Vol Expanding', EXTREME: 'Vol Extreme' };
const PHASE_LABELS  = { EARLY: 'Early Session', MID: 'Mid Session', LATE: 'Late Session' };

// ── Range utilisation meter ───────────────────────────────────────────────────

function rangeUtilMeter(rangeUtil) {
  const pct     = Math.min(200, Math.round(rangeUtil * 100));
  const barPct  = Math.min(100, pct / 2); // meter is 0–200%, bar is 0–100% width
  const colour  = pct < 50  ? 'var(--green)'
                : pct < 100 ? 'var(--blue)'
                : pct < 125 ? '#f59e0b'
                : pct < 150 ? '#ef8c1a'
                : 'var(--red)';
  const zone    = pct < 50  ? 'Under-expanded'
                : pct < 100 ? 'Normal'
                : pct < 125 ? 'Mature move'
                : pct < 150 ? 'Exhaustion zone'
                : 'Extreme';

  return `
<div style="margin-top:8px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
    <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">Range Utilisation</span>
    <span style="font-size:10px;font-weight:700;color:${colour};font-family:'DM Mono',monospace">${pct}% · ${zone}</span>
  </div>
  <div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden;position:relative">
    <div style="height:100%;width:${barPct}%;background:${colour};border-radius:3px;transition:width 0.3s"></div>
    <!-- threshold markers -->
    <div style="position:absolute;top:0;left:25%;width:1px;height:100%;background:var(--border);opacity:0.6"></div>
    <div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:var(--border);opacity:0.6"></div>
    <div style="position:absolute;top:0;left:62.5%;width:1px;height:100%;background:#f59e0b;opacity:0.5"></div>
    <div style="position:absolute;top:0;left:75%;width:1px;height:100%;background:var(--red);opacity:0.5"></div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:2px">
    <span style="font-size:8.5px;color:var(--text3)">0%</span>
    <span style="font-size:8.5px;color:var(--text3)">50%</span>
    <span style="font-size:8.5px;color:var(--text3)">100%</span>
    <span style="font-size:8.5px;color:#f59e0b">125%</span>
    <span style="font-size:8.5px;color:var(--red)">150%</span>
    <span style="font-size:8.5px;color:var(--text3)">200%</span>
  </div>
</div>`;
}

// ── Permission switch ─────────────────────────────────────────────────────────

function permSwitch(label, allowed) {
  const col = allowed ? 'var(--green)' : 'var(--text3)';
  const bg  = allowed ? 'var(--green)18' : 'transparent';
  const bd  = allowed ? 'var(--green)44' : 'var(--border)';
  const dot = allowed ? '●' : '○';
  return `<div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;background:${bg};border:1px solid ${bd}">
    <span style="font-size:10px;color:${col};font-weight:700">${dot}</span>
    <span style="font-size:10px;font-weight:600;color:${col}">${label}</span>
  </div>`;
}

// ── Risk multiplier bar ───────────────────────────────────────────────────────

function riskMultBar(riskMult) {
  const pct = Math.min(100, (riskMult / 1.25) * 100);
  const col = riskMult >= 1.0 ? 'var(--green)' : riskMult >= 0.5 ? '#f59e0b' : 'var(--red)';
  return `<div style="display:flex;align-items:center;gap:6px">
    <span style="font-size:10px;color:var(--text3);min-width:52px">Size: ${riskMult.toFixed(2)}×</span>
    <div style="flex:1;height:4px;background:var(--s3);border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${col};border-radius:2px;transition:width 0.3s"></div>
    </div>
  </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderDecisionBanner(volRegime, otcForecast) {
  const el = document.getElementById('decisionBannerCard');
  if (!el) return;

  const quote = window._latestQuote;
  if (!quote) { el.innerHTML = ''; return; }

  const inputs = collectDecisionInputs(volRegime, otcForecast, quote);
  if (!inputs) { el.innerHTML = ''; return; }

  const state = runDecisionEngine(inputs);

  // Store on window for AI analysis access
  window._lastDecisionState = state;

  const modeConf = MODE_COLOURS[state.mode] ?? MODE_COLOURS[MODES.NO_TRADE];
  const modeCol  = modeConf.bg;
  const modeLabel = modeConf.label;
  const partCol  = PARTICIPATION_COLOURS[state.participation] ?? 'var(--text3)';

  const p = state.permissions;
  const isNoTrade = state.mode === MODES.NO_TRADE;

  el.innerHTML = `
<div style="border:1.5px solid ${modeCol}55;border-radius:10px;background:${modeCol}0a;margin-bottom:12px;overflow:hidden">

  <!-- Header row: mode + participation -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid ${modeCol}22;flex-wrap:wrap;gap:6px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:9px;height:9px;border-radius:50%;background:${modeCol};flex-shrink:0"></div>
      <span style="font-size:12px;font-weight:800;color:${modeCol};letter-spacing:0.04em">${modeLabel}</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:10px;color:var(--text3)">${REGIME_LABELS[inputs.regime] ?? '—'}</span>
      <span style="font-size:10px;color:var(--text3)">${VOL_LABELS[inputs.volState] ?? '—'}</span>
      <span style="font-size:10px;color:var(--text3)">${PHASE_LABELS[inputs.sessionPhase] ?? '—'}</span>
      <span style="font-size:10px;font-weight:700;color:${partCol};padding:2px 8px;border-radius:6px;background:${partCol}18;border:1px solid ${partCol}44">${state.participation}</span>
    </div>
  </div>

  <!-- Permission switches -->
  <div style="padding:8px 14px;border-bottom:1px solid ${modeCol}22">
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${permSwitch('LONG',     p.long)}
      ${permSwitch('SHORT',    p.short)}
      ${permSwitch('BREAKOUT', p.breakout)}
      ${permSwitch('FADE',     p.fade)}
      ${permSwitch('NEW ENTRY', p.newEntry)}
      ${permSwitch('ADD-ON',   p.addOn)}
    </div>
  </div>

  <!-- Bias + risk -->
  <div style="padding:8px 14px ${isNoTrade ? '10px' : '6px'}">
    <div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:6px">
      ${state.bias}
    </div>
    ${!isNoTrade ? riskMultBar(state.riskMult) : ''}
    ${!isNoTrade ? rangeUtilMeter(inputs.rangeUtil) : ''}
    ${state.reasons.length > 0 ? `
    <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
      ${state.reasons.map(r => `<span style="font-size:9.5px;color:var(--amber);background:var(--amber)12;border:1px solid var(--amber)30;border-radius:5px;padding:2px 6px">${r}</span>`).join('')}
    </div>` : ''}
  </div>

</div>`;
}
