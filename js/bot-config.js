// Bot configuration page — reads / writes bot_config in Cloudflare KV
// and displays live bot_status when available.

const DEFAULTS = {
  kill_switch: false,
  enabled_pairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD'],
  modules: {
    macro_regime: true,
    vol_gate:     true,
    confluence:   true,
    oi_walls:     true,
    cot_filter:   false,
    news_risk:    false,
  },
  execution: {
    min_macro_score:    5,
    min_stars:          3,
    min_agree:          3,
    max_trades:         2,
    composite_threshold: 0.60,
  },
  position: {
    risk_pct:      1.0,
    vol_high_mult: 0.5,
    vol_low_mult:  1.2,
  },
  sl_tp: {
    sl_method:      'structure',
    tp_method:      'confluence',
    sl_atr_mult:    1.5,
    tp1_rr:         1.0,
    tp1_close_pct:  50,
    tp2_method:     'garch_68',
    max_sl_pips:    50,
    max_tp_pips:    100,
  },
  safety: {
    max_daily_loss_pct: 3.0,
    trade_window_start: '07:00',
    trade_window_end:   '20:00',
  },
};

const ALL_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD',
  'EUR/GBP', 'USD/CAD', 'USD/CHF', 'GBP/JPY', 'NAS100_USD',
];

let _cfg = JSON.parse(JSON.stringify(DEFAULTS));

// ── KV helpers ────────────────────────────────────────────────────────────────

async function kvGet(key) {
  const r = await fetch(`/api/kv/get?key=${encodeURIComponent(key)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.miss ? null : j.data;
}

async function kvSet(key, data) {
  await fetch('/api/kv/set', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key, data, timestamp: Date.now() }),
  });
}

// ── Load & save ───────────────────────────────────────────────────────────────

async function loadConfig() {
  setStatus('loading', 'Loading config…');
  try {
    const stored = await kvGet('bot_config');
    _cfg = stored ? { ...JSON.parse(JSON.stringify(DEFAULTS)), ...stored } : JSON.parse(JSON.stringify(DEFAULTS));
    renderForm();
    setStatus('ok', 'Config loaded from KV');
  } catch (e) {
    setStatus('err', `Load failed: ${e.message}`);
  }
}

async function saveConfig() {
  readForm();
  setStatus('loading', 'Saving…');
  try {
    await kvSet('bot_config', _cfg);
    setStatus('ok', 'Saved — bot picks up changes on next loop');
  } catch (e) {
    setStatus('err', `Save failed: ${e.message}`);
  }
}

function resetDefaults() {
  _cfg = JSON.parse(JSON.stringify(DEFAULTS));
  renderForm();
  setStatus('ok', 'Defaults restored — click Save to apply');
}

// ── Kill switch (instant, separate save) ─────────────────────────────────────

async function toggleKillSwitch() {
  _cfg.kill_switch = !_cfg.kill_switch;
  document.getElementById('ksBtn').textContent = _cfg.kill_switch ? 'KILL SWITCH: ON' : 'KILL SWITCH: OFF';
  document.getElementById('ksBtn').className = 'ks-btn' + (_cfg.kill_switch ? ' ks-on' : '');
  setStatus('loading', 'Updating kill switch…');
  try {
    await kvSet('bot_config', _cfg);
    setStatus(_cfg.kill_switch ? 'err' : 'ok',
      _cfg.kill_switch ? 'KILL SWITCH ON — bot will not trade' : 'Kill switch OFF — bot will resume next loop');
  } catch (e) {
    setStatus('err', `Kill switch update failed: ${e.message}`);
  }
}

// ── Form → _cfg ───────────────────────────────────────────────────────────────

function readForm() {
  // Modules
  for (const mod of Object.keys(DEFAULTS.modules)) {
    const el = document.getElementById(`mod_${mod}`);
    if (el) _cfg.modules[mod] = el.checked;
  }
  // Enabled pairs
  _cfg.enabled_pairs = ALL_PAIRS.filter(p => {
    const el = document.getElementById(`pair_${p.replace('/', '')}`);
    return el && el.checked;
  });
  // Execution
  _cfg.execution.min_macro_score    = num('ex_min_score', 5);
  _cfg.execution.min_stars          = num('ex_min_stars', 3);
  _cfg.execution.min_agree          = num('ex_min_agree', 3);
  _cfg.execution.max_trades         = num('ex_max_trades', 2);
  _cfg.execution.composite_threshold = num('ex_threshold', 0.60);
  // Position
  _cfg.position.risk_pct      = num('pos_risk', 1.0);
  _cfg.position.vol_high_mult = num('pos_hi_mult', 0.5);
  _cfg.position.vol_low_mult  = num('pos_lo_mult', 1.2);
  // SL/TP
  _cfg.sl_tp.sl_method    = radio('sl_method', 'structure');
  _cfg.sl_tp.tp_method    = radio('tp_method', 'confluence');
  _cfg.sl_tp.sl_atr_mult  = num('sl_atr_mult', 1.5);
  _cfg.sl_tp.tp1_rr       = num('tp1_rr', 1.0);
  _cfg.sl_tp.tp1_close_pct = num('tp1_close_pct', 50);
  _cfg.sl_tp.max_sl_pips  = num('max_sl_pips', 50);
  _cfg.sl_tp.max_tp_pips  = num('max_tp_pips', 100);
  // Safety
  _cfg.safety.max_daily_loss_pct = num('max_dd', 3.0);
  _cfg.safety.trade_window_start = str('tw_start', '07:00');
  _cfg.safety.trade_window_end   = str('tw_end', '20:00');
}

// ── _cfg → form ───────────────────────────────────────────────────────────────

function renderForm() {
  // Kill switch button
  const ksBtn = document.getElementById('ksBtn');
  if (ksBtn) {
    ksBtn.textContent = _cfg.kill_switch ? 'KILL SWITCH: ON' : 'KILL SWITCH: OFF';
    ksBtn.className = 'ks-btn' + (_cfg.kill_switch ? ' ks-on' : '');
  }
  // Modules
  for (const mod of Object.keys(DEFAULTS.modules)) {
    const el = document.getElementById(`mod_${mod}`);
    if (el) el.checked = !!(_cfg.modules?.[mod]);
  }
  // Pairs
  for (const p of ALL_PAIRS) {
    const el = document.getElementById(`pair_${p.replace('/', '')}`);
    if (el) el.checked = (_cfg.enabled_pairs || []).includes(p);
  }
  // Execution
  setVal('ex_min_score',  _cfg.execution?.min_macro_score    ?? 5);
  setVal('ex_min_stars',  _cfg.execution?.min_stars          ?? 3);
  setVal('ex_min_agree',  _cfg.execution?.min_agree          ?? 3);
  setVal('ex_max_trades', _cfg.execution?.max_trades         ?? 2);
  setVal('ex_threshold',  _cfg.execution?.composite_threshold ?? 0.60);
  // Position
  setVal('pos_risk',     _cfg.position?.risk_pct      ?? 1.0);
  setVal('pos_hi_mult',  _cfg.position?.vol_high_mult ?? 0.5);
  setVal('pos_lo_mult',  _cfg.position?.vol_low_mult  ?? 1.2);
  // SL/TP
  setRadio('sl_method', _cfg.sl_tp?.sl_method ?? 'structure');
  setRadio('tp_method', _cfg.sl_tp?.tp_method ?? 'confluence');
  setVal('sl_atr_mult',    _cfg.sl_tp?.sl_atr_mult    ?? 1.5);
  setVal('tp1_rr',         _cfg.sl_tp?.tp1_rr         ?? 1.0);
  setVal('tp1_close_pct',  _cfg.sl_tp?.tp1_close_pct  ?? 50);
  setVal('max_sl_pips',    _cfg.sl_tp?.max_sl_pips    ?? 50);
  setVal('max_tp_pips',    _cfg.sl_tp?.max_tp_pips    ?? 100);
  // Safety
  setVal('max_dd',    _cfg.safety?.max_daily_loss_pct ?? 3.0);
  setVal('tw_start',  _cfg.safety?.trade_window_start ?? '07:00');
  setVal('tw_end',    _cfg.safety?.trade_window_end   ?? '20:00');
}

// ── Bot status polling ────────────────────────────────────────────────────────

async function loadBotStatus() {
  try {
    const data = await kvGet('bot_status');
    const el   = document.getElementById('botStatus');
    if (!el) return;
    if (!data) { el.innerHTML = '<span class="bs-dim">No status yet — bot may not have run</span>'; return; }

    const age  = Math.round((Date.now() - (data.timestamp ?? 0)) / 1000 / 60);
    const pairs = (data.pairs_evaluated || []).map(p => {
      const col = p.action === 'trade' ? 'bs-green' : 'bs-dim';
      return `<span class="${col}">${p.pair} → ${p.action}${p.direction ? ' ' + p.direction : ''}${p.stars != null ? ' ' + p.stars + '★' : ''}</span>`;
    }).join('  ');
    const errs = (data.errors || []).length
      ? `<br><span class="bs-red">Errors: ${data.errors.join('; ')}</span>` : '';
    el.innerHTML =
      `<span class="bs-dim">Last loop ${age}m ago · paper=${data.paper}</span>&nbsp;&nbsp;${pairs}${errs}`;
  } catch (e) {
    // non-critical
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(id, def) { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? def : v; }
function str(id, def) { return document.getElementById(id)?.value ?? def; }
function radio(name, def) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : def;
}
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setRadio(name, v) {
  const el = document.querySelector(`input[name="${name}"][value="${v}"]`);
  if (el) el.checked = true;
}
function setStatus(type, msg) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `save-status ${type}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.saveConfig      = saveConfig;
window.resetDefaults   = resetDefaults;
window.toggleKillSwitch = toggleKillSwitch;

loadConfig();
loadBotStatus();
setInterval(loadBotStatus, 60_000);  // refresh status every 60s
