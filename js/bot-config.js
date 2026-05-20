// Bot configuration page — reads / writes bot_config in Cloudflare KV
// and displays live bot_status when available.

const DEFAULTS = {
  kill_switch: false,
  mode: 'full',  // 'full' = run all modules, 'telegram' = entry criteria only
  enabled_pairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD'],
  tg_mode: {
    min_grade:        'B',   // minimum KV entry grade to act on
    min_signal_score: 0.55,  // minimum entry.signalScore
  },
  modules: {
    macro_regime: true,
    vol_gate:     true,
    confluence:   true,
    oi_walls:     true,
    cot_filter:   false,
    news_risk:    false,
  },
  execution: {
    // Quality filter
    tier:                'balanced',  // strict=4★ balanced=3★ loose=2★ aggressive=1★
    bardir:              'auto',      // off | auto | on (MTF WT1 filter mode)
    wtthreshold:         35,          // WT1 magnitude threshold for auto mode
    // Score gates
    min_macro_score:     5,
    min_stars:           3,
    min_agree:           3,
    max_trades:          2,
    composite_threshold: 0.60,
    prox_pips:           8,
    // Ladder exits (R multiples)
    tp1r:                0.3,
    tp2r:                1.0,
    trailoffset:         0.7,
    // Spread gate
    max_spread_pips:     3.0,
    // Risk Guard
    ddlimit:             3,    // daily DD % before lockout
    monthlydd:           5,    // monthly DD % before lockout
    lockout:             3,    // hours locked after DD breach
    cooldown:            60,   // minutes between trades, per pair
    sizing:              1.0,  // manual sizing multiplier
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
    tp1_close_pct:  50,
    max_sl_pips:    50,
    max_tp_pips:    100,
    max_lot:        5.0,
  },
  safety: {
    trade_window_start: '06:05',
    trade_window_end:   '21:00',
  },
  oi_walls: {
    oi_wall_pips: 15,
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
    // Deep-merge stored over defaults so new fields always appear
    if (stored) {
      _cfg = JSON.parse(JSON.stringify(DEFAULTS));
      for (const [k, v] of Object.entries(stored)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && _cfg[k]) {
          Object.assign(_cfg[k], v);
        } else {
          _cfg[k] = v;
        }
      }
    } else {
      _cfg = JSON.parse(JSON.stringify(DEFAULTS));
    }
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

  _cfg.execution = _cfg.execution || {};

  // Execution — quality filter
  _cfg.execution.tier             = str('ex_tier',          'balanced');
  _cfg.execution.bardir           = str('ex_bardir',        'auto');
  _cfg.execution.wtthreshold      = num('ex_wtthreshold',   35);
  // Execution — score gates
  _cfg.execution.min_macro_score  = num('ex_min_score',     5);
  _cfg.execution.min_stars        = num('ex_min_stars',     3);
  _cfg.execution.min_agree        = num('ex_min_agree',     3);
  _cfg.execution.max_trades       = num('ex_max_trades',    2);
  _cfg.execution.composite_threshold = num('ex_threshold',  0.60);
  _cfg.execution.prox_pips        = num('ex_prox_pips',     8);
  // Execution — ladder exits
  _cfg.execution.tp1r             = num('ec_tp1r',          0.3);
  _cfg.execution.tp2r             = num('ec_tp2r',          1.0);
  _cfg.execution.trailoffset      = num('ec_trailoffset',   0.7);
  // Execution — spread gate
  _cfg.execution.max_spread_pips  = num('ex_max_spread',    3.0);
  // Execution — risk guard
  _cfg.execution.ddlimit          = num('ec_ddlimit',       3);
  _cfg.execution.monthlydd        = num('ec_monthlydd',     5);
  _cfg.execution.lockout          = num('ec_lockout',       3);
  _cfg.execution.cooldown         = num('ec_cooldown',      60);
  _cfg.execution.sizing           = num('pos_sizing',       1.0);

  // Position
  _cfg.position = _cfg.position || {};
  _cfg.position.risk_pct      = num('pos_risk',     1.0);
  _cfg.position.vol_high_mult = num('pos_hi_mult',  0.5);
  _cfg.position.vol_low_mult  = num('pos_lo_mult',  1.2);

  // SL/TP
  _cfg.sl_tp = _cfg.sl_tp || {};
  _cfg.sl_tp.sl_method     = radio('sl_method',  'structure');
  _cfg.sl_tp.tp_method     = radio('tp_method',  'confluence');
  _cfg.sl_tp.sl_atr_mult   = num('sl_atr_mult',  1.5);
  _cfg.sl_tp.tp1_close_pct = num('tp1_close_pct', 50);
  _cfg.sl_tp.max_sl_pips   = num('max_sl_pips',  50);
  _cfg.sl_tp.max_tp_pips   = num('max_tp_pips',  100);
  _cfg.sl_tp.max_lot       = num('pos_max_lot',  5.0);

  // Safety
  _cfg.safety = _cfg.safety || {};
  _cfg.safety.trade_window_start = str('tw_start', '06:05');
  _cfg.safety.trade_window_end   = str('tw_end',   '21:00');

  // OI Walls
  _cfg.oi_walls = _cfg.oi_walls || {};
  _cfg.oi_walls.oi_wall_pips = num('oi_wall_pips', 15);

  // Bot mode
  _cfg.mode = radio('bot_mode', 'full');
  _cfg.tg_mode = _cfg.tg_mode || {};
  _cfg.tg_mode.min_grade        = str('tg_min_grade', 'B');
  _cfg.tg_mode.min_signal_score = num('tg_min_signal', 0.55);
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

  const ec = _cfg.execution || {};

  // Execution — quality filter
  setVal('ex_tier',        ec.tier              ?? 'balanced');
  setVal('ex_bardir',      ec.bardir            ?? 'auto');
  setVal('ex_wtthreshold', ec.wtthreshold       ?? 35);
  // Execution — score gates
  setVal('ex_min_score',  ec.min_macro_score    ?? 5);
  setVal('ex_min_stars',  ec.min_stars          ?? 3);
  setVal('ex_min_agree',  ec.min_agree          ?? 3);
  setVal('ex_max_trades', ec.max_trades         ?? 2);
  setVal('ex_threshold',  ec.composite_threshold ?? 0.60);
  setVal('ex_prox_pips',  ec.prox_pips          ?? 8);
  // Execution — ladder exits
  setVal('ec_tp1r',        ec.tp1r              ?? 0.3);
  setVal('ec_tp2r',        ec.tp2r              ?? 1.0);
  setVal('ec_trailoffset', ec.trailoffset       ?? 0.7);
  // Execution — spread gate
  setVal('ex_max_spread',  ec.max_spread_pips   ?? 3.0);
  // Execution — risk guard
  setVal('ec_ddlimit',     ec.ddlimit           ?? 3);
  setVal('ec_monthlydd',   ec.monthlydd         ?? 5);
  setVal('ec_lockout',     ec.lockout           ?? 3);
  setVal('ec_cooldown',    ec.cooldown          ?? 60);
  setVal('pos_sizing',     ec.sizing            ?? 1.0);

  // Position
  setVal('pos_risk',    _cfg.position?.risk_pct      ?? 1.0);
  setVal('pos_hi_mult', _cfg.position?.vol_high_mult ?? 0.5);
  setVal('pos_lo_mult', _cfg.position?.vol_low_mult  ?? 1.2);

  // SL/TP
  setRadio('sl_method', _cfg.sl_tp?.sl_method ?? 'structure');
  setRadio('tp_method', _cfg.sl_tp?.tp_method ?? 'confluence');
  setVal('sl_atr_mult',    _cfg.sl_tp?.sl_atr_mult    ?? 1.5);
  setVal('tp1_close_pct',  _cfg.sl_tp?.tp1_close_pct  ?? 50);
  setVal('max_sl_pips',    _cfg.sl_tp?.max_sl_pips    ?? 50);
  setVal('max_tp_pips',    _cfg.sl_tp?.max_tp_pips    ?? 100);
  setVal('pos_max_lot',    _cfg.sl_tp?.max_lot        ?? 5.0);

  // Safety
  setVal('tw_start', _cfg.safety?.trade_window_start ?? '06:05');
  setVal('tw_end',   _cfg.safety?.trade_window_end   ?? '21:00');

  // OI Walls
  setVal('oi_wall_pips', _cfg.oi_walls?.oi_wall_pips ?? 15);

  // Bot mode
  setRadio('bot_mode', _cfg.mode ?? 'full');
  setVal('tg_min_grade',  _cfg.tg_mode?.min_grade        ?? 'B');
  setVal('tg_min_signal', _cfg.tg_mode?.min_signal_score ?? 0.55);
  if (typeof window.toggleTgSettings === 'function') window.toggleTgSettings();
}

// ── Bot status polling ────────────────────────────────────────────────────────

async function loadBotStatus() {
  try {
    const data = await kvGet('bot_status');
    if (!data) {
      setText('bsAge', 'No status yet — bot may not have run');
      return;
    }

    const age = Math.round((Date.now() - (data.timestamp ?? 0)) / 1000 / 60);
    setText('bsAge',     `Last loop ${age}m ago`);
    setText('bsPaper',   data.paper ? '· paper' : '· LIVE');
    setText('bsTier',    data.tier   ? `· ${data.tier}` : '');
    setText('bsBalance', data.balance ? `· $${(+data.balance).toLocaleString('en-US', {maximumFractionDigits: 0})}` : '');

    // Pairs evaluated
    const pairs = (data.pairs_evaluated || []).map(p => {
      const col = p.action === 'trade' ? 'bs-green' : 'bs-dim';
      return `<span class="${col}">${p.pair}→${p.action}${p.direction ? ' ' + p.direction : ''}${p.stars != null ? ' ' + p.stars + '★' : ''}</span>`;
    }).join('  ');
    document.getElementById('bsPairs').innerHTML = pairs || '<span class="bs-dim">No pairs evaluated</span>';

    // Blocked pairs
    const blocked = (data.pairs_blocked || []);
    if (blocked.length) {
      document.getElementById('bsBlocked').innerHTML =
        `<span class="bs-amber">Blocked: ${blocked.join('  ')}</span>`;
    } else {
      document.getElementById('bsBlocked').innerHTML = '';
    }

    // Open positions
    const open = (data.open_positions || []);
    if (open.length) {
      const pos = open.map(p =>
        `<span class="bs-green">${p.pair} ${p.type} ${p.volume}L @${p.price_open}</span>`
      ).join('  ');
      document.getElementById('bsOpen').innerHTML = `Open: ${pos}`;
    } else {
      document.getElementById('bsOpen').innerHTML = '<span class="bs-dim">No open positions</span>';
    }

    // Management actions
    const mgmt = (data.mgmt_actions || []);
    if (mgmt.length) {
      document.getElementById('bsMgmt').innerHTML =
        `<span class="bs-dim">Actions: ${mgmt.slice(-3).join('  ')}</span>`;
    } else {
      document.getElementById('bsMgmt').innerHTML = '';
    }

    // Errors
    const errs = (data.errors || []);
    document.getElementById('bsErrors').innerHTML = errs.length
      ? `<span class="bs-red">Errors: ${errs.join(' · ')}</span>` : '';

  } catch (e) {
    // non-critical
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(id, def) { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? def : v; }
function str(id, def) { return document.getElementById(id)?.value || def; }
function radio(name, def) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : def;
}
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
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

// ── MT5 Credentials helpers ───────────────────────────────────────────────────

function _applyCredsToForm(stored, idPrefix, pwId) {
  if (!stored) return;
  setVal(`${idPrefix}mt5_account`, stored.mt5_account ?? '');
  setVal(`${idPrefix}mt5_server`,  stored.mt5_server  ?? '');
  setVal(`${idPrefix}mt5_path`,    stored.mt5_path    ?? '');
  const pwEl = document.getElementById(pwId);
  if (pwEl && stored.mt5_password) pwEl.placeholder = '(saved — leave blank to keep)';
}

async function _saveCreds(kvKey, idPrefix, pwId, statusId) {
  const pwEl  = document.getElementById(pwId);
  const pwVal = pwEl?.value || '';
  let finalPw = pwVal;
  if (!pwVal) {
    try { finalPw = (await kvGet(kvKey))?.mt5_password ?? ''; } catch(e) {}
  }
  const creds = {
    mt5_account:  document.getElementById(`${idPrefix}mt5_account`)?.value?.trim() ?? '',
    mt5_password: finalPw,
    mt5_server:   document.getElementById(`${idPrefix}mt5_server`)?.value?.trim()  ?? '',
    mt5_path:     document.getElementById(`${idPrefix}mt5_path`)?.value?.trim()    ?? '',
  };
  const statusEl = document.getElementById(statusId);
  if (statusEl) { statusEl.textContent = 'Saving…'; statusEl.style.color = 'var(--text3)'; }
  try {
    await kvSet(kvKey, creds);
    if (pwEl) { pwEl.value = ''; pwEl.placeholder = '(saved — leave blank to keep)'; }
    if (statusEl) { statusEl.textContent = 'Saved ✓'; statusEl.style.color = 'var(--green)'; }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  } catch(e) {
    if (statusEl) { statusEl.textContent = `Error: ${e.message}`; statusEl.style.color = 'var(--red)'; }
  }
}

// Main bot credentials (KV key: bot_credentials)
async function loadCreds() {
  try { _applyCredsToForm(await kvGet('bot_credentials'), 'mt5_', 'mt5_password'); } catch(e) {}
}
async function saveCreds() {
  await _saveCreds('bot_credentials', 'mt5_', 'mt5_password', 'credsStatus');
}

// Backtest bot credentials (KV key: backtestsystem_credentials)
async function loadBtCreds() {
  try { _applyCredsToForm(await kvGet('backtestsystem_credentials'), 'bt_mt5_', 'bt_mt5_password'); } catch(e) {}
}
async function saveBtCreds() {
  await _saveCreds('backtestsystem_credentials', 'bt_mt5_', 'bt_mt5_password', 'btCredsStatus');
}

// ── Backtest bot live settings ────────────────────────────────────────────────

const BT_LIVE_FIELDS = [
  { id: 'bt_riskPct',     key: 'riskPct',      parse: parseFloat },
  { id: 'bt_killDaily',   key: 'killDaily',     parse: parseFloat },
  { id: 'bt_killWeekly',  key: 'killWeekly',    parse: parseFloat },
  { id: 'bt_killMonthly', key: 'killMonthly',   parse: parseFloat },
  { id: 'bt_entryWindow', key: 'entryWindow',   parse: parseInt   },
  { id: 'bt_eodExit',     key: 'eodExit',       parse: parseInt   },
  { id: 'bt_tradeCooldownMins', key: 'tradeCooldownMins', parse: parseInt },
  { id: 'bt_enabledPairs',     key: 'enabledPairs',      parse: v => v.split(',').map(s => s.trim()).filter(Boolean) },
];

async function loadLiveSettings() {
  try {
    const stored = await kvGet('backtestsystem_live_config');
    if (!stored) return;
    for (const f of BT_LIVE_FIELDS) {
      const el = document.getElementById(f.id);
      if (!el || stored[f.key] == null) continue;
      el.value = Array.isArray(stored[f.key]) ? stored[f.key].join(', ') : stored[f.key];
    }
  } catch(e) {}
}

async function saveLiveSettings() {
  const status = document.getElementById('btLiveStatus');
  status.textContent = 'Saving…';
  try {
    const data = {};
    for (const f of BT_LIVE_FIELDS) {
      const el = document.getElementById(f.id);
      if (el) data[f.key] = f.parse(el.value);
    }
    await kvSet('backtestsystem_live_config', data);
    status.textContent = 'Saved ✓';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.saveConfig       = saveConfig;
window.resetDefaults    = resetDefaults;
window.toggleKillSwitch = toggleKillSwitch;
window.saveCreds        = saveCreds;
window.saveBtCreds      = saveBtCreds;
window.saveLiveSettings = saveLiveSettings;

loadConfig();
loadCreds();
loadBtCreds();
loadLiveSettings();
loadBotStatus();
setInterval(loadBotStatus, 60_000);  // refresh status every 60s
