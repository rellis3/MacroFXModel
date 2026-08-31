// Bot configuration page — manages both the Telegram signal bot (bot_config KV)
// and the Backtest/MT5 bot (backtestsystem_live_config KV).

import { createLevelChart } from './levelChart.js';

// ── Telegram bot defaults ─────────────────────────────────────────────────────

const DEFAULTS = {
  kill_switch: false,
  mode: 'full',
  enabled_pairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD'],
  tg_mode: {
    min_signal_score: 0.55,
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
    min_grade:           'B',
    bardir:              'auto',
    wtthreshold:         35,
    min_macro_score:     5,
    min_agree:           3,
    max_trades:          2,
    composite_threshold: 0.60,
    prox_pips:           8,
    tp1r:                0.3,
    tp2r:                1.0,
    trailoffset:         0.7,
    max_spread_pips:     3.0,
    ddlimit:             3,
    monthlydd:           5,
    lockout:             3,
    cooldown:            60,
    sizing:              1.0,
    bypass_risk_guard:   false,
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
  'EUR/JPY', 'EUR/CHF', 'GBP/CHF', 'AUD/JPY', 'CAD/JPY',
  'SPX500_USD', 'DE30_USD', 'UK100_GBP',
  'US30_USD', 'US2000_USD',
];

// ── Backtest bot defaults (mirrors Python config.py DEFAULTS exactly) ─────────

const BT_DEFAULTS = {
  // Entry levels
  method:            'asia',
  confTolPips:       2.0,
  signalFilter:      'all_conf',
  priceMode:         'lowest',
  clusterMerge:      true,
  useM1Features:     true,
  // Entry timing & proximity
  entryWindow:       800,
  eodExit:           2100,
  entryProximityATR: 0.5,
  entryTolPips:      3.0,
  pollInterval:      2,
  tradeCooldownMins: 30,
  // Entry quality filters
  minConviction:     0.20,
  minConfirms:       3,
  levelReentry:      2,
  requireSweep:      false,
  sweepPips:         2,
  secondTouchOnly:   false,
  candleConfirmN:    0,
  candleConfirmPct:  0.6,
  rejectionBar:      false,
  rejWickPct:        0.40,
  rejMinAtrPct:      0.30,
  reEnterTp:         true,
  flipOnSL:          false,
  // Stop loss
  slMode:            'atr30m',
  slFraction:        0.35,
  slMult:            1.5,
  minSlPips:         5,
  atrPeriod:         14,
  // SL → Breakeven
  slToBePct:         0.0,
  slBeBuffer:        1.0,
  // Chandelier trailing stop
  chandelierEnabled:     false,
  chandelierAtrMult:     3.0,
  chandelierActivateAtr: 1.0,
  // Take profit
  tpMode:            'fixedR',
  rrRatio:           2.2,
  maxRR:             4.0,
  tpBuf:             5,
  tpAtrFallback:     5,
  tpVolLo:           2.0,
  tpVolMed:          3.0,
  tpVolHi:           5.0,
  // Kill switches
  killDaily:         2.0,
  killWeekly:        5.0,
  killMonthly:       10.0,
  // Position sizing
  posMode:           'risk_pct',
  riskPct:           1.0,
  fixedSize:         10,
  // Regime veto
  useServerRegime:       false,
  regimeVetoConfidence:  70,
  // Enabled pairs
  enabledPairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'XAUUSD'],
  // Features
  features: {
    rangePosition: { enabled: false, weight: 1 },
    chochBos:      { enabled: false, weight: 2 },
    wickRejection: { enabled: false, weight: 1 },
    rsiDivergence: { enabled: false, weight: 1 },
    orderBlock:    { enabled: false, weight: 1 },
    htfEma:        { enabled: false, weight: 1 },
    vwapSlope:     { enabled: false, weight: 1 },
    adxFilter:     { enabled: false, weight: 1 },
    hurstRegime:   { enabled: false, weight: 1 },
    fvgBias:       { enabled: false, weight: 1 },
    weeklyPivot:   { enabled: false, weight: 1 },
    ichimokuCloud: { enabled: false, weight: 1 },
    macdSignal:    { enabled: false, weight: 1 },
  },
};

const BT_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'XAUUSD', 'USTECH100M'];
const BT_FEATURES = [
  'rangePosition', 'chochBos', 'wickRejection', 'rsiDivergence',
  'orderBlock', 'htfEma', 'vwapSlope', 'adxFilter',
  'hurstRegime', 'fvgBias', 'weeklyPivot', 'ichimokuCloud', 'macdSignal',
];

let _cfg   = JSON.parse(JSON.stringify(DEFAULTS));
let _btCfg = JSON.parse(JSON.stringify(BT_DEFAULTS));

// ── KV helpers ────────────────────────────────────────────────────────────────

async function kvGet(key) {
  const r = await fetch(`/api/kv/get?key=${encodeURIComponent(key)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.miss ? null : j.data;
}

async function kvSet(key, data) {
  // Surface write failures (e.g. the worker's 401 auth gate) instead of swallowing
  // them — a silent failure here showed "Saved ✓" while the value never persisted,
  // which is how the volatility bot's MT5 credentials looked saved but weren't.
  const r = await fetch('/api/kv/set', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key, data, timestamp: Date.now() }),
  });
  if (!r.ok) {
    let msg = `save failed (HTTP ${r.status})`;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch { /* non-JSON body */ }
    throw new Error(msg);
  }
}

function _deepMerge(base, override) {
  const result = Object.assign({}, base);
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && result[k] && typeof result[k] === 'object') {
      result[k] = _deepMerge(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── Telegram bot load / save ──────────────────────────────────────────────────

async function loadConfig() {
  setStatus('loading', 'Loading…');
  try {
    const stored = await kvGet('bot_config');
    _cfg = stored ? _deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), stored)
                  : JSON.parse(JSON.stringify(DEFAULTS));
    renderForm();
    setStatus('ok', 'Config loaded');
  } catch (e) {
    setStatus('err', `Load failed: ${e.message}`);
  }
}

async function saveConfig() {
  readForm();
  setStatus('loading', 'Saving…');
  const inl = document.getElementById('tgSaveStatus');
  if (inl) { inl.textContent = 'Saving…'; inl.style.color = 'var(--text3)'; }
  try {
    await kvSet('bot_config', _cfg);
    setStatus('ok', 'Saved — bot picks up on next loop');
    if (inl) { inl.textContent = '✓ Saved'; inl.style.color = 'var(--green)'; }
  } catch (e) {
    setStatus('err', `Save failed: ${e.message}`);
    if (inl) { inl.textContent = `✗ ${e.message}`; inl.style.color = 'var(--red)'; }
  }
}

function resetDefaults() {
  _cfg = JSON.parse(JSON.stringify(DEFAULTS));
  renderForm();
  setStatus('ok', 'Defaults restored — click Save to apply');
}

// ── Kill switch ───────────────────────────────────────────────────────────────

async function forceUnlock() {
  const btn = document.getElementById('unlockBtn');
  const status = document.getElementById('unlockStatus');
  btn.disabled = true;
  if (status) { status.textContent = 'Sending unlock…'; status.style.color = 'var(--text3)'; }
  try {
    await kvSet('bot_override', { force_unlock: true, timestamp: Date.now() });
    if (status) { status.textContent = 'Unlock sent ✓ — bot clears lockout on next loop'; status.style.color = 'var(--green)'; }
    setTimeout(() => { if (status) status.textContent = ''; btn.disabled = false; }, 8000);
  } catch (e) {
    if (status) { status.textContent = `Failed: ${e.message}`; status.style.color = 'var(--red)'; }
    btn.disabled = false;
  }
}

async function toggleKillSwitch() {
  _cfg.kill_switch = !_cfg.kill_switch;
  const btn = document.getElementById('ksBtn');
  btn.textContent = _cfg.kill_switch ? 'KILL SWITCH: ON' : 'KILL SWITCH: OFF';
  btn.className = 'ks-btn' + (_cfg.kill_switch ? ' ks-on' : '');
  setStatus('loading', 'Updating kill switch…');
  try {
    await kvSet('bot_config', _cfg);
    setStatus(_cfg.kill_switch ? 'err' : 'ok',
      _cfg.kill_switch ? 'KILL SWITCH ON — bot will not trade' : 'Kill switch OFF — bot will resume');
  } catch (e) {
    setStatus('err', `Kill switch update failed: ${e.message}`);
  }
}

// ── Telegram bot form → _cfg ──────────────────────────────────────────────────

function readForm() {
  for (const mod of Object.keys(DEFAULTS.modules)) {
    const el = document.getElementById(`mod_${mod}`);
    if (el) _cfg.modules[mod] = el.checked;
  }
  _cfg.enabled_pairs = ALL_PAIRS.filter(p => {
    const el = document.getElementById(`pair_${p.replace('/', '')}`);
    return el && el.checked;
  });

  _cfg.execution = _cfg.execution || {};
  _cfg.execution.min_grade           = str('ex_min_grade',   'B');
  _cfg.execution.bardir              = str('ex_bardir',      'auto');
  _cfg.execution.wtthreshold         = num('ex_wtthreshold', 35);
  _cfg.execution.min_macro_score     = num('ex_min_score',   5);
  _cfg.execution.min_agree           = num('ex_min_agree',   3);
  _cfg.execution.max_trades          = num('ex_max_trades',  2);
  _cfg.execution.composite_threshold = num('ex_threshold',   0.60);
  _cfg.execution.prox_pips           = num('ex_prox_pips',   8);
  _cfg.execution.tp1r                = num('ec_tp1r',        0.3);
  _cfg.execution.tp2r                = num('ec_tp2r',        1.0);
  _cfg.execution.trailoffset         = num('ec_trailoffset', 0.7);
  _cfg.execution.max_spread_pips     = num('ex_max_spread',  3.0);
  _cfg.execution.ddlimit             = num('ec_ddlimit',     3);
  _cfg.execution.monthlydd           = num('ec_monthlydd',   5);
  _cfg.execution.lockout             = num('ec_lockout',     3);
  _cfg.execution.cooldown            = num('ec_cooldown',    60);
  _cfg.execution.bypass_risk_guard   = chk('ec_bypass_risk');
  _cfg.execution.sizing              = num('pos_sizing',     1.0);

  _cfg.position = _cfg.position || {};
  _cfg.position.risk_pct      = num('pos_risk',    1.0);
  _cfg.position.vol_high_mult = num('pos_hi_mult', 0.5);
  _cfg.position.vol_low_mult  = num('pos_lo_mult', 1.2);

  _cfg.sl_tp = _cfg.sl_tp || {};
  _cfg.sl_tp.sl_method     = radio('sl_method',   'structure');
  _cfg.sl_tp.tp_method     = radio('tp_method',   'confluence');
  _cfg.sl_tp.sl_atr_mult   = num('sl_atr_mult',   1.5);
  _cfg.sl_tp.tp1_close_pct = num('tp1_close_pct', 50);
  _cfg.sl_tp.max_sl_pips   = num('max_sl_pips',   50);
  _cfg.sl_tp.max_tp_pips   = num('max_tp_pips',   100);
  _cfg.sl_tp.max_lot       = num('pos_max_lot',   5.0);

  _cfg.safety = _cfg.safety || {};
  _cfg.safety.trade_window_start = str('tw_start', '06:05');
  _cfg.safety.trade_window_end   = str('tw_end',   '21:00');

  _cfg.oi_walls = _cfg.oi_walls || {};
  _cfg.oi_walls.oi_wall_pips = num('oi_wall_pips', 15);

  _cfg.mode = radio('bot_mode', 'full');
  _cfg.tg_mode = _cfg.tg_mode || {};
  _cfg.tg_mode.min_signal_score = num('tg_min_signal', 0.55);
}

// ── _cfg → Telegram bot form ──────────────────────────────────────────────────

function renderForm() {
  const btn = document.getElementById('ksBtn');
  if (btn) {
    btn.textContent = _cfg.kill_switch ? 'KILL SWITCH: ON' : 'KILL SWITCH: OFF';
    btn.className = 'ks-btn' + (_cfg.kill_switch ? ' ks-on' : '');
  }
  for (const mod of Object.keys(DEFAULTS.modules)) {
    const el = document.getElementById(`mod_${mod}`);
    if (el) el.checked = !!(_cfg.modules?.[mod]);
  }
  for (const p of ALL_PAIRS) {
    const el = document.getElementById(`pair_${p.replace('/', '')}`);
    if (el) el.checked = (_cfg.enabled_pairs || []).includes(p);
  }
  const ec = _cfg.execution || {};
  setVal('ex_min_grade',   ec.min_grade         ?? 'B');
  setVal('ex_bardir',      ec.bardir            ?? 'auto');
  setVal('ex_wtthreshold', ec.wtthreshold       ?? 35);
  setVal('ex_min_score',   ec.min_macro_score   ?? 5);
  setVal('ex_min_agree',   ec.min_agree         ?? 3);
  setVal('ex_max_trades',  ec.max_trades        ?? 2);
  setVal('ex_threshold',   ec.composite_threshold ?? 0.60);
  setVal('ex_prox_pips',   ec.prox_pips         ?? 8);
  setVal('ec_tp1r',        ec.tp1r              ?? 0.3);
  setVal('ec_tp2r',        ec.tp2r              ?? 1.0);
  setVal('ec_trailoffset', ec.trailoffset       ?? 0.7);
  setVal('ex_max_spread',  ec.max_spread_pips   ?? 3.0);
  setVal('ec_ddlimit',     ec.ddlimit           ?? 3);
  setVal('ec_monthlydd',   ec.monthlydd         ?? 5);
  setVal('ec_lockout',     ec.lockout           ?? 3);
  setVal('ec_cooldown',    ec.cooldown          ?? 60);
  setChk('ec_bypass_risk', ec.bypass_risk_guard ?? false);
  setVal('pos_sizing',     ec.sizing            ?? 1.0);
  setVal('pos_risk',       _cfg.position?.risk_pct      ?? 1.0);
  setVal('pos_hi_mult',    _cfg.position?.vol_high_mult ?? 0.5);
  setVal('pos_lo_mult',    _cfg.position?.vol_low_mult  ?? 1.2);
  setRadio('sl_method',    _cfg.sl_tp?.sl_method  ?? 'structure');
  setRadio('tp_method',    _cfg.sl_tp?.tp_method  ?? 'confluence');
  setVal('sl_atr_mult',    _cfg.sl_tp?.sl_atr_mult    ?? 1.5);
  setVal('tp1_close_pct',  _cfg.sl_tp?.tp1_close_pct  ?? 50);
  setVal('max_sl_pips',    _cfg.sl_tp?.max_sl_pips    ?? 50);
  setVal('max_tp_pips',    _cfg.sl_tp?.max_tp_pips    ?? 100);
  setVal('pos_max_lot',    _cfg.sl_tp?.max_lot        ?? 5.0);
  setVal('tw_start',       _cfg.safety?.trade_window_start ?? '06:05');
  setVal('tw_end',         _cfg.safety?.trade_window_end   ?? '21:00');
  setVal('oi_wall_pips',   _cfg.oi_walls?.oi_wall_pips ?? 15);
  setRadio('bot_mode',     _cfg.mode ?? 'full');
  setVal('tg_min_signal',  _cfg.tg_mode?.min_signal_score ?? 0.55);
  if (typeof window.toggleTgSettings === 'function') window.toggleTgSettings();
}

// ── Backtest bot load / save ──────────────────────────────────────────────────

async function loadBtConfig() {
  try {
    const stored = await kvGet('backtestsystem_live_config');
    _btCfg = stored ? _deepMerge(JSON.parse(JSON.stringify(BT_DEFAULTS)), stored)
                    : JSON.parse(JSON.stringify(BT_DEFAULTS));
    renderBtForm();
  } catch (e) {
    console.warn('loadBtConfig failed:', e);
  }
}

async function saveBtConfig() {
  readBtForm();
  const el = document.getElementById('btSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('backtestsystem_live_config', _btCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = 'var(--green)'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetBtDefaults() {
  _btCfg = JSON.parse(JSON.stringify(BT_DEFAULTS));
  renderBtForm();
  const el = document.getElementById('btSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

// ── readBtForm: form → _btCfg ─────────────────────────────────────────────────

function readBtForm() {
  // Entry strategy
  _btCfg.method            = radio('bt_method',       'asia');
  _btCfg.confTolPips        = num('bt_confTolPips',   2.0);
  _btCfg.signalFilter       = str('bt_signalFilter',  'all_conf');
  _btCfg.priceMode          = str('bt_priceMode',     'lowest');
  _btCfg.clusterMerge       = chk('bt_clusterMerge');
  _btCfg.useM1Features      = chk('bt_useM1Features');
  // Entry timing
  _btCfg.entryWindow        = num('bt_entryWindow',   800);
  _btCfg.eodExit            = num('bt_eodExit',       2100);
  _btCfg.entryProximityATR  = num('bt_entryProximityATR', 0.5);
  _btCfg.entryTolPips       = num('bt_entryTolPips',  3.0);
  _btCfg.pollInterval       = num('bt_pollInterval',  2);
  _btCfg.tradeCooldownMins  = num('bt_tradeCooldownMins', 30);
  // Entry quality
  _btCfg.minConviction      = num('bt_minConviction', 0.20);
  _btCfg.minConfirms        = num('bt_minConfirms',   3);
  _btCfg.levelReentry       = num('bt_levelReentry',  2);
  _btCfg.secondTouchOnly    = chk('bt_secondTouchOnly');
  _btCfg.reEnterTp          = chk('bt_reEnterTp');
  _btCfg.flipOnSL           = chk('bt_flipOnSL');
  // Sweep / candle
  _btCfg.requireSweep       = chk('bt_requireSweep');
  _btCfg.sweepPips          = num('bt_sweepPips',     2);
  _btCfg.candleConfirmN     = num('bt_candleConfirmN', 0);
  _btCfg.candleConfirmPct   = num('bt_candleConfirmPct', 0.6);
  _btCfg.rejectionBar       = chk('bt_rejectionBar');
  _btCfg.rejWickPct         = num('bt_rejWickPct',    0.40);
  _btCfg.rejMinAtrPct       = num('bt_rejMinAtrPct',  0.30);
  // SL
  _btCfg.slMode             = radio('bt_slMode',      'atr30m');
  _btCfg.slFraction         = num('bt_slFraction',    0.35);
  _btCfg.slMult             = num('bt_slMult',        1.5);
  _btCfg.minSlPips          = num('bt_minSlPips',     5);
  _btCfg.atrPeriod          = num('bt_atrPeriod',     14);
  _btCfg.slToBePct          = num('bt_slToBePct',     0.0);
  _btCfg.slBeBuffer         = num('bt_slBeBuffer',    1.0);
  // Chandelier trailing stop
  _btCfg.chandelierEnabled     = chk('bt_chandelierEnabled');
  _btCfg.chandelierAtrMult     = num('bt_chandelierAtrMult',     3.0);
  _btCfg.chandelierActivateAtr = num('bt_chandelierActivateAtr', 1.0);
  // TP
  _btCfg.tpMode             = radio('bt_tpMode',      'fixedR');
  _btCfg.rrRatio            = num('bt_rrRatio',       2.2);
  _btCfg.maxRR              = num('bt_maxRR',         4.0);
  _btCfg.tpBuf              = num('bt_tpBuf',         5);
  _btCfg.tpAtrFallback      = num('bt_tpAtrFallback', 5);
  _btCfg.tpVolLo            = num('bt_tpVolLo',       2.0);
  _btCfg.tpVolMed           = num('bt_tpVolMed',      3.0);
  _btCfg.tpVolHi            = num('bt_tpVolHi',       5.0);
  // Kill switches
  _btCfg.killDaily          = num('bt_killDaily',     2.0);
  _btCfg.killWeekly         = num('bt_killWeekly',    5.0);
  _btCfg.killMonthly        = num('bt_killMonthly',   10.0);
  // Position sizing
  _btCfg.posMode            = radio('bt_posMode',     'risk_pct');
  _btCfg.riskPct            = num('bt_riskPct',       1.0);
  _btCfg.fixedSize          = num('bt_fixedSize',     10);
  // Regime veto
  _btCfg.useServerRegime       = chk('bt_useServerRegime');
  _btCfg.regimeVetoConfidence  = num('bt_regimeVetoConfidence', 70);
  // Enabled pairs
  _btCfg.enabledPairs = BT_PAIRS.filter(p => {
    const el = document.getElementById(`bt_pair_${p}`);
    return el && el.checked;
  });
  // Features
  _btCfg.features = _btCfg.features || {};
  for (const feat of BT_FEATURES) {
    const el = document.getElementById(`bt_feat_${feat}`);
    if (!_btCfg.features[feat]) _btCfg.features[feat] = { enabled: false, weight: BT_DEFAULTS.features[feat]?.weight ?? 1 };
    _btCfg.features[feat].enabled = el ? el.checked : false;
  }
}

// ── renderBtForm: _btCfg → form ───────────────────────────────────────────────

function renderBtForm() {
  setRadio('bt_method',      _btCfg.method           ?? 'asia');
  setVal('bt_confTolPips',   _btCfg.confTolPips      ?? 2.0);
  setVal('bt_signalFilter',  _btCfg.signalFilter     ?? 'all_conf');
  setVal('bt_priceMode',     _btCfg.priceMode        ?? 'lowest');
  setChk('bt_clusterMerge',  _btCfg.clusterMerge     ?? true);
  setChk('bt_useM1Features', _btCfg.useM1Features    ?? true);

  setVal('bt_entryWindow',        _btCfg.entryWindow        ?? 800);
  setVal('bt_eodExit',            _btCfg.eodExit            ?? 2100);
  setVal('bt_entryProximityATR',  _btCfg.entryProximityATR  ?? 0.5);
  setVal('bt_entryTolPips',       _btCfg.entryTolPips       ?? 3.0);
  setVal('bt_pollInterval',       _btCfg.pollInterval       ?? 2);
  setVal('bt_tradeCooldownMins',  _btCfg.tradeCooldownMins  ?? 30);

  setVal('bt_minConviction',  _btCfg.minConviction    ?? 0.20);
  setVal('bt_minConfirms',    _btCfg.minConfirms      ?? 3);
  setVal('bt_levelReentry',   _btCfg.levelReentry     ?? 2);
  setChk('bt_secondTouchOnly',_btCfg.secondTouchOnly  ?? false);
  setChk('bt_reEnterTp',      _btCfg.reEnterTp        ?? true);
  setChk('bt_flipOnSL',       _btCfg.flipOnSL         ?? false);

  setChk('bt_requireSweep',     _btCfg.requireSweep    ?? false);
  setVal('bt_sweepPips',        _btCfg.sweepPips       ?? 2);
  setVal('bt_candleConfirmN',   _btCfg.candleConfirmN  ?? 0);
  setVal('bt_candleConfirmPct', _btCfg.candleConfirmPct ?? 0.6);
  setChk('bt_rejectionBar',     _btCfg.rejectionBar    ?? false);
  setVal('bt_rejWickPct',       _btCfg.rejWickPct      ?? 0.40);
  setVal('bt_rejMinAtrPct',     _btCfg.rejMinAtrPct    ?? 0.30);

  setRadio('bt_slMode',      _btCfg.slMode            ?? 'atr30m');
  setVal('bt_slFraction',    _btCfg.slFraction        ?? 0.35);
  setVal('bt_slMult',        _btCfg.slMult            ?? 1.5);
  setVal('bt_minSlPips',     _btCfg.minSlPips         ?? 5);
  setVal('bt_atrPeriod',     _btCfg.atrPeriod         ?? 14);
  setVal('bt_slToBePct',     _btCfg.slToBePct         ?? 0.0);
  setVal('bt_slBeBuffer',    _btCfg.slBeBuffer        ?? 1.0);

  setChk('bt_chandelierEnabled',     _btCfg.chandelierEnabled     ?? false);
  setVal('bt_chandelierAtrMult',     _btCfg.chandelierAtrMult     ?? 3.0);
  setVal('bt_chandelierActivateAtr', _btCfg.chandelierActivateAtr ?? 1.0);

  setRadio('bt_tpMode',      _btCfg.tpMode            ?? 'fixedR');
  setVal('bt_rrRatio',       _btCfg.rrRatio           ?? 2.2);
  setVal('bt_maxRR',         _btCfg.maxRR             ?? 4.0);
  setVal('bt_tpBuf',         _btCfg.tpBuf             ?? 5);
  setVal('bt_tpAtrFallback', _btCfg.tpAtrFallback     ?? 5);
  setVal('bt_tpVolLo',       _btCfg.tpVolLo           ?? 2.0);
  setVal('bt_tpVolMed',      _btCfg.tpVolMed          ?? 3.0);
  setVal('bt_tpVolHi',       _btCfg.tpVolHi           ?? 5.0);

  setVal('bt_killDaily',     _btCfg.killDaily         ?? 2.0);
  setVal('bt_killWeekly',    _btCfg.killWeekly        ?? 5.0);
  setVal('bt_killMonthly',   _btCfg.killMonthly       ?? 10.0);

  setRadio('bt_posMode',     _btCfg.posMode           ?? 'risk_pct');
  setVal('bt_riskPct',       _btCfg.riskPct           ?? 1.0);
  setVal('bt_fixedSize',     _btCfg.fixedSize         ?? 10);

  setChk('bt_useServerRegime',      _btCfg.useServerRegime      ?? false);
  setVal('bt_regimeVetoConfidence', _btCfg.regimeVetoConfidence ?? 70);

  for (const p of BT_PAIRS) {
    const el = document.getElementById(`bt_pair_${p}`);
    if (el) el.checked = (_btCfg.enabledPairs || []).includes(p);
  }
  for (const feat of BT_FEATURES) {
    const el = document.getElementById(`bt_feat_${feat}`);
    if (el) el.checked = !!(_btCfg.features?.[feat]?.enabled);
  }
}

// ── Telegram bot status ───────────────────────────────────────────────────────

async function loadBotStatus() {
  try {
    const data = await kvGet('bot_status');
    if (!data) { setText('bsAge', 'No status — bot may not have run'); return; }
    const age = Math.round((Date.now() - (data.timestamp ?? 0)) / 60000);
    setText('bsAge',     `Last loop ${age}m ago`);
    setText('bsPaper',   data.paper ? '· paper' : '· LIVE');
    setText('bsTier',    data.min_grade ? `· Grade ${data.min_grade}` : '');
    setText('bsBalance', data.balance ? `· $${(+data.balance).toLocaleString('en-US', {maximumFractionDigits:0})}` : '');
    const pairs = (data.pairs_evaluated || []).map(p => {
      const col = p.action === 'trade' ? 'bs-green' : 'bs-dim';
      return `<span class="${col}">${p.pair}→${p.action}${p.direction ? ' ' + p.direction : ''}${p.grade ? ' [' + p.grade + ']' : ''}</span>`;
    }).join('  ');
    document.getElementById('bsPairs').innerHTML = pairs || '<span class="bs-dim">No pairs evaluated</span>';
    const blocked = (data.pairs_blocked || []);
    document.getElementById('bsBlocked').innerHTML = blocked.length
      ? `<span class="bs-amber">Blocked: ${blocked.join('  ')}</span>` : '';
    const open = (data.open_positions || []);
    document.getElementById('bsOpen').innerHTML = open.length
      ? `Open: ${open.map(p => `<span class="bs-green">${p.pair} ${p.type} ${p.volume}L @${p.price_open}</span>`).join('  ')}`
      : '<span class="bs-dim">No open positions</span>';
    const mgmt = (data.mgmt_actions || []);
    document.getElementById('bsMgmt').innerHTML = mgmt.length
      ? `<span class="bs-dim">Actions: ${mgmt.slice(-3).join('  ')}</span>` : '';
    document.getElementById('bsErrors').innerHTML = (data.errors || []).length
      ? `<span class="bs-red">Errors: ${data.errors.join(' · ')}</span>` : '';
  } catch (e) { /* non-critical */ }
}

// ── Backtest bot status ───────────────────────────────────────────────────────

async function loadBtBotStatus() {
  try {
    const data = await kvGet('backtestsystem_status');
    if (!data) { setText('btBsAge', 'No status — bot may not have run'); _renderBtPairGrid(null); return; }
    const age = Math.round((Date.now() - (data.timestamp ?? 0)) / 60000);
    setText('btBsAge',    `Last update ${age}m ago`);
    setText('btBsWindow', data.in_window ? '· IN WINDOW' : '· outside window');
    setText('btBsDate',   data.date ? `· ${data.date}` : '');

    const pairs = data.pairs || {};
    const pairHtml = Object.values(pairs).map(p => {
      if (!p.price) return '';
      const zone = p.in_zone ? '<span class="bs-amber"> ◄ZONE</span>' : '';
      const dir  = p.direction ? ` <span class="bs-green">${p.direction}</span>` : '';
      const cv   = p.conviction != null ? ` conv=${p.conviction.toFixed(2)}` : '';
      const posCount = (p.positions || []).length;
      const posTag   = posCount ? ` <span class="bs-green">[${posCount} pos]</span>` : '';
      return `<span class="bs-dim">${p.pair} ${p.price?.toFixed(5) ?? ''}${zone}${dir}${cv}${posTag}</span>`;
    }).filter(Boolean).join('  ');
    document.getElementById('btBsPairs').innerHTML = pairHtml || '<span class="bs-dim">No pair data yet</span>';

    const allPositions = Object.values(pairs).flatMap(p => p.positions || []);
    document.getElementById('btBsPositions').innerHTML = allPositions.length
      ? `Open: ${allPositions.map(p =>
          `<span class="bs-green">${p.direction?.toUpperCase()} @${p.open_price} SL:${p.sl} TP:${p.tp} P&L:${p.profit > 0 ? '+' : ''}${p.profit}</span>`
        ).join('  ')}`
      : '<span class="bs-dim">No open positions</span>';

    _renderBtPairGrid(data);
  } catch (e) { /* non-critical */ }
}
window._loadBtBotStatus = loadBtBotStatus;

// ── Backtest bot live pair monitor (ported from backtest-monitor.html so the
// standalone page can be retired — same backtestsystem_status KV shape) ────────

function _btDistClass(pips) {
  if (pips <= 5)  return 'close';
  if (pips <= 15) return 'medium';
  return 'far';
}

function _btPriceTickPct(price, low, high) {
  if (high <= low) return 50;
  return Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
}

function _renderBtPairCard(pair, d) {
  const inZone  = d.in_zone;
  const hasDir  = d.direction && inZone;
  const dir     = d.direction || '';
  const cardCls = hasDir ? 'bt-pair-card trading' : (inZone ? 'bt-pair-card in-zone' : 'bt-pair-card');

  let badges = '';
  if (inZone) badges += '<span class="bt-zone-badge in">IN ZONE</span>';
  if (dir === 'long')  badges += '<span class="bt-zone-badge dir-long">LONG</span>';
  if (dir === 'short') badges += '<span class="bt-zone-badge dir-short">SHORT</span>';

  let asiaHtml = '<div class="bt-asia-bar"><div class="bt-asia-label">Asia Range</div>';
  if (d.asia) {
    const { low, high, range_pips } = d.asia;
    const tickPct = d.price ? _btPriceTickPct(d.price, low, high) : null;
    asiaHtml += `
      <div class="bt-asia-range-row">
        <span class="bt-asia-val">${low.toFixed(5)}</span>
        <div class="bt-asia-track">
          <div class="bt-asia-fill" style="width:100%"></div>
          ${tickPct !== null ? `<div class="bt-price-tick" style="left:${tickPct}%"></div>` : ''}
        </div>
        <span class="bt-asia-val">${high.toFixed(5)}</span>
        <span class="bt-asia-val" style="color:var(--text3)">${range_pips}p</span>
      </div>`;
  } else {
    asiaHtml += '<div style="font-size:11px;color:var(--text3)">Range not yet formed</div>';
  }
  asiaHtml += '</div>';

  let levelsHtml = '<div class="bt-levels-section"><div class="bt-levels-label">Confluence Levels</div>';
  if (d.confluences && d.confluences.length) {
    d.confluences.forEach((c, i) => {
      const isNearest = i === 0;
      const arrow     = c.above ? '↑' : '↓';
      const fibStr    = c.fib != null ? c.fib.toFixed(2) : '—';
      const tight     = c.isTight ? '<span class="bt-tight-dot" title="Tight confluence"></span>' : '';
      const distCls   = _btDistClass(c.dist_pips);
      const rowCls    = isNearest ? 'bt-level-row nearest' : 'bt-level-row';
      levelsHtml += `
        <div class="${rowCls}">
          <span class="bt-level-arrow">${arrow}</span>
          <span class="bt-level-price">${c.price.toFixed(5)}${tight}</span>
          <span class="bt-level-fib">${fibStr}</span>
          <span class="bt-level-dist ${distCls}">${c.dist_pips.toFixed(1)}p</span>
        </div>`;
    });
  } else {
    levelsHtml += '<div style="font-size:11px;color:var(--text3);padding:4px 0">No confluences — may still be forming</div>';
  }
  levelsHtml += '</div>';

  let featHtml = '';
  if (inZone && d.conviction !== null) {
    const convPct = Math.round((d.conviction ?? 0) * 100);
    const dirCls  = dir === 'long' ? 'long' : (dir === 'short' ? 'short' : '');
    featHtml = `
      <div class="bt-feat-section">
        <div class="bt-feat-label">Feature Score</div>
        <div class="bt-feat-conv">
          <span>Direction: <span class="bt-feat-val ${dirCls}">${dir || 'none'}</span></span>
          <span>Conviction: <span class="bt-feat-val">${convPct}%</span></span>
          <span>Confirms: <span class="bt-feat-val">${d.confirms ?? '—'}</span></span>
        </div>
      </div>`;
  }

  let posHtml = '';
  if (d.positions && d.positions.length) {
    posHtml = '<div class="bt-pos-section"><div class="bt-pos-label">Open Position</div>';
    d.positions.forEach(p => {
      const dCls   = p.direction === 'long' ? 'dir-long' : 'dir-short';
      const pnlCls = p.profit >= 0 ? 'bt-pnl-pos' : 'bt-pnl-neg';
      const pnlStr = (p.profit >= 0 ? '+' : '') + p.profit.toFixed(2);
      const levStr = p.level != null
        ? `@ ${p.level.toFixed(5)}${p.level_fib != null ? ' ('+p.level_fib.toFixed(2)+')' : ''}`
        : '';
      posHtml += `
        <div class="bt-pos-row">
          <span class="bt-zone-badge ${dCls}">${p.direction.toUpperCase()}</span>
          <span class="bt-pos-entry">${p.open_price.toFixed(5)}</span>
          <span class="bt-pos-level">${levStr}</span>
          <span class="${pnlCls}">${pnlStr}</span>
        </div>
        <div class="bt-pos-detail">SL ${p.sl.toFixed(5)} · TP ${p.tp.toFixed(5)} · ${p.lots} lots · #${p.ticket}</div>`;
    });
    posHtml += '</div>';
  }

  const priceStr = d.price != null ? d.price.toFixed(5) : '—';

  return `
    <div class="${cardCls}">
      <div class="bt-card-head">
        <span class="bt-pair-name">${pair}</span>
        <span class="bt-pair-price">${priceStr}</span>
        <div class="bt-pair-badges">${badges}</div>
      </div>
      ${asiaHtml}
      ${levelsHtml}
      ${featHtml}
      ${posHtml}
    </div>`;
}

function _renderBtPairGrid(data) {
  const gridEl = document.getElementById('btPairGrid');
  if (!gridEl) return;
  if (!data) { gridEl.innerHTML = '<div class="bt-no-data">No status — bot may not have run</div>'; return; }

  const pairs  = Object.entries(data.pairs || {});
  const inZone = pairs.filter(([, d]) => d.in_zone).length;
  const ageSec = Math.round((Date.now() - (data.timestamp || 0)) / 1000);
  const ageStr = ageSec < 60 ? `${ageSec}s ago` : `${Math.round(ageSec / 60)}m ago`;
  const inWin  = data.in_window;

  setText('btDateBadge', data.date || '—');
  const dateBadgeEl = document.getElementById('btDateBadge');
  if (dateBadgeEl) dateBadgeEl.className = 'bt-badge ok';

  setText('btPairsBadge', `${pairs.length} pairs`);
  const pairsBadgeEl = document.getElementById('btPairsBadge');
  if (pairsBadgeEl) pairsBadgeEl.className = pairs.length ? 'bt-badge ok' : 'bt-badge dim';

  setText('btZoneBadge', inWin === false ? 'outside window' : `${inZone} in zone`);
  const zoneBadgeEl = document.getElementById('btZoneBadge');
  if (zoneBadgeEl) zoneBadgeEl.className = inWin === false ? 'bt-badge dim' : (inZone ? 'bt-badge warn' : 'bt-badge dim');

  setText('btLastUpdate', `Updated ${ageStr}`);

  if (!pairs.length) {
    const msg = inWin === false
      ? 'Outside trade window — monitoring paused. Levels will appear after entryWindow time.'
      : 'Bot running but no price data yet — Asia session may still be forming (opens at 06:00 London).';
    gridEl.innerHTML = `<div class="bt-no-data">${msg}</div>`;
    return;
  }

  gridEl.innerHTML = pairs.map(([pair, d]) => _renderBtPairCard(pair, d)).join('');
}

// ── MT5 Credentials ───────────────────────────────────────────────────────────

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

async function loadCreds()   { try { _applyCredsToForm(await kvGet('bot_credentials'),             '',     'mt5_password');    } catch(e) {} }
async function saveCreds()   { await _saveCreds('bot_credentials',             '',     'mt5_password',    'credsStatus');   }
async function loadBtCreds() { try { _applyCredsToForm(await kvGet('backtestsystem_credentials'), 'bt_', 'bt_mt5_password'); } catch(e) {} }
async function saveBtCreds() { await _saveCreds('backtestsystem_credentials', 'bt_', 'bt_mt5_password', 'btCredsStatus'); }

// ── Shared helpers ────────────────────────────────────────────────────────────

function num(id, def)  { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? def : v; }
function str(id, def)  { return document.getElementById(id)?.value || def; }
function chk(id)       { return !!(document.getElementById(id)?.checked); }
function radio(name, def) { return document.querySelector(`input[name="${name}"]:checked`)?.value ?? def; }
function setVal(id, v)    { const el = document.getElementById(id); if (el) el.value = v; }
function setChk(id, v)    { const el = document.getElementById(id); if (el) el.checked = !!v; }
function setText(id, v)   { const el = document.getElementById(id); if (el) el.textContent = v; }
function setRadio(name, v){ const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; }
function setStatus(type, msg) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = type;
}

// ── Trade Journal (rendering) ─────────────────────────────────────────────────

function _buildJournalSvg(rec) {
  const bars = rec.bars || [];
  const W = 480, H = 108;
  const ml = 40, mr = 6, mt = 7, mb = 10;
  const cw = W - ml - mr, ch = H - mt - mb;

  if (bars.length === 0) {
    return `<svg viewBox="0 0 ${W} 38" class="jsvg" style="height:38px">` +
           `<text x="${W/2}" y="22" text-anchor="middle" font-size="11" ` +
           `fill="var(--text3)" font-family="DM Sans,sans-serif">` +
           `Trade open — bars accumulating on next poll</text></svg>`;
  }

  // Price range from bars + all levels
  const prices = bars.flatMap(b => [b.h, b.l]);
  prices.push(rec.entry_price, rec.sl, rec.tp);
  if (rec.be_price) prices.push(rec.be_price);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pRange = pMax - pMin || (rec.pip || 0.0001) * 10;
  const pad  = pRange * 0.15;
  const yLo  = pMin - pad, yHi = pMax + pad, yRange = yHi - yLo;

  function yp(price) {
    return +(mt + ch * (1 - (price - yLo) / yRange)).toFixed(1);
  }
  const barSlot = Math.min(cw / bars.length, 16);
  function xLeft(i)   { return +(ml + i * barSlot).toFixed(1); }
  function xCenter(i) { return +(ml + i * barSlot + barSlot * 0.5).toFixed(1); }
  const bodyW = Math.max(+(barSlot * 0.7).toFixed(1), 1);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="jsvg" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Trade-period shade
  const entryTs = rec.entry_ts_ms || 0;
  const exitTs  = rec.exit_time ? new Date(rec.exit_time).getTime() : Infinity;
  let firstIn = -1, lastIn = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].t >= entryTs && bars[i].t <= exitTs) {
      if (firstIn < 0) firstIn = i;
      lastIn = i;
    }
  }
  if (firstIn >= 0) {
    const x1 = xLeft(firstIn);
    const x2 = xLeft(lastIn) + barSlot;
    svg += `<rect x="${x1}" y="${mt}" width="${+(x2-x1).toFixed(1)}" height="${ch}" fill="rgba(96,165,250,0.07)"/>`;
  }

  // Level lines + labels
  const levels = [
    { price: rec.tp,          color: 'var(--green)',  label: 'TP', dash: '4 2' },
    { price: rec.entry_price, color: 'var(--blue)',   label: 'Ent', dash: '3 2' },
    { price: rec.sl,          color: 'var(--red)',    label: 'SL', dash: '4 2' },
  ];
  if (rec.be_price != null) {
    levels.push({ price: rec.be_price, color: 'var(--amber)', label: 'BE', dash: '2 2' });
  }
  for (const lv of levels) {
    const y = yp(lv.price);
    svg += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="${lv.color}" stroke-width="1" stroke-dasharray="${lv.dash}" opacity="0.75"/>`;
    svg += `<text x="${ml - 3}" y="${y + 3}" text-anchor="end" font-size="8" fill="${lv.color}" font-family="DM Mono,monospace">${lv.label}</text>`;
  }

  // Candlesticks
  for (let i = 0; i < bars.length; i++) {
    const b  = bars[i];
    const xc = xCenter(i), xl = xLeft(i);
    const yo = yp(b.o), yc_ = yp(b.c), yh = yp(b.h), yl = yp(b.l);
    const top = Math.min(yo, yc_), bodyH = Math.max(Math.abs(yo - yc_), 1);
    const color = b.c >= b.o ? 'var(--green)' : 'var(--red)';
    svg += `<line x1="${xc}" y1="${yh}" x2="${xc}" y2="${yl}" stroke="${color}" stroke-width="1" opacity="0.75"/>`;
    svg += `<rect x="${xl}" y="${top}" width="${bodyW}" height="${bodyH}" fill="${color}" opacity="0.85"/>`;
  }

  // Entry / exit verticals
  if (firstIn >= 0) {
    const x = xLeft(firstIn);
    svg += `<line x1="${x}" y1="${mt}" x2="${x}" y2="${mt + ch}" stroke="var(--blue)" stroke-width="1.5" opacity="0.45"/>`;
  }
  if (rec.exit_time != null && lastIn >= 0) {
    const x     = +(xLeft(lastIn) + barSlot).toFixed(1);
    const ecol  = rec.exit_type === 'tp' ? 'var(--green)' : rec.exit_type === 'be' ? 'var(--blue)' : 'var(--red)';
    svg += `<line x1="${x}" y1="${mt}" x2="${x}" y2="${mt + ch}" stroke="${ecol}" stroke-width="1.5" opacity="0.45"/>`;
  }

  svg += '</svg>';
  return svg;
}

function _renderJournalCard(rec) {
  const isOpen   = rec.status === 'open';
  const badge    = isOpen ? 'open' : (rec.exit_type || 'manual');
  const badgeMap = { tp: 'TP HIT', sl: 'SL HIT', be: 'BE EXIT', manual: 'MANUAL' };
  const badgeLbl = isOpen ? 'OPEN' : (badgeMap[badge] || badge.toUpperCase());
  const cardCls  = isOpen ? 'open' : `c-${badge}`;

  const pnlR     = rec.pnl_r;
  const pnlPips  = rec.pnl_pips;
  const pnlCls   = pnlR === null ? '' : pnlR > 0 ? 'pos' : pnlR < 0 ? 'neg' : '';
  const pnlStr   = pnlR === null ? ''
    : `${pnlR > 0 ? '+' : ''}${pnlR.toFixed(2)}R  ${pnlPips > 0 ? '+' : ''}${pnlPips.toFixed(1)}p`;

  const entryHM  = rec.entry_time ? rec.entry_time.slice(11, 16) : '—';
  const exitHM   = rec.exit_time  ? rec.exit_time.slice(11, 16)  : (isOpen ? 'open' : '—');

  let duration = '';
  if (rec.entry_time && rec.exit_time) {
    const m = Math.round((new Date(rec.exit_time) - new Date(rec.entry_time)) / 60000);
    duration = m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  const beTag = rec.be_moved_at
    ? `<span style="font-size:10px;color:var(--amber)">BE@${rec.be_moved_at.slice(11,16)}</span>`
    : '';

  const chips = (rec.features || []).map(f => `<span class="jchip">${f}</span>`).join('');

  return `
<div class="jcard ${cardCls}">
  <div class="jcard-head">
    <span class="jcard-pair">${rec.pair}</span>
    <span class="jcard-dir ${rec.direction}">${rec.direction.toUpperCase()}</span>
    <span class="jcard-time">${entryHM}→${exitHM}${duration ? ` (${duration})` : ''}</span>
    ${beTag}
    <span class="jcard-badge ${badge}">${badgeLbl}</span>
    ${pnlStr ? `<span class="jcard-pnl ${pnlCls}">${pnlStr}</span>` : ''}
  </div>
  <div class="jcard-meta">
    <span>@${rec.entry_price}</span>
    <span>SL ${rec.sl} (${rec.sl_dist_pips}p)</span>
    <span>TP ${rec.tp} (${rec.tp_dist_pips}p)</span>
    <span>${rec.lots}L</span>
    <span>conv ${Math.round((rec.conviction || 0) * 100)}%</span>
    ${rec.level_fib != null ? `<span>fib ${rec.level_fib}</span>` : ''}
  </div>
  ${chips ? `<div class="jcard-chips">${chips}</div>` : ''}
  <div class="jsvg-wrap">${_buildJournalSvg(rec)}</div>
</div>`;
}

async function loadBtJournal() {
  const listEl  = document.getElementById('btJournalList');
  const countEl = document.getElementById('btJournalCount');
  if (!listEl) return;
  try {
    const data = await kvGet('backtestsystem_journal');
    if (!data || !data.length) {
      listEl.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:4px 0">No trades recorded yet.</div>';
      if (countEl) countEl.textContent = '0 trades';
      return;
    }
    const openCount = data.filter(r => r.status === 'open').length;
    if (countEl) countEl.textContent =
      `${data.length} trade${data.length !== 1 ? 's' : ''}${openCount ? ` · ${openCount} open` : ''}`;

    // Group by date, newest first
    const byDate = {};
    for (const rec of data) {
      const d = rec.date || 'Unknown';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(rec);
    }
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    let html = '';
    for (const date of dates) {
      html += `<div class="jday-header">${date}</div>`;
      for (const rec of byDate[date]) {
        html += _renderJournalCard(rec);
      }
    }
    listEl.innerHTML = html;
  } catch (e) {
    if (listEl) listEl.innerHTML =
      `<div style="color:var(--red);font-size:12px;padding:4px 0">Error: ${e.message}</div>`;
  }
}

// ── Regime Bot ────────────────────────────────────────────────────────────────

const RG_DEFAULTS = {
  enabled:            true,
  paper_mode:         true,
  pairs:              ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  interval_secs:      60,
  min_confidence:     65,
  candle_hold:        3,
  sl_atr_mult:        1.8,
  sl_atr_tf:          '5m',
  risk_pct:           1.0,
  max_lot:            5.0,
  max_spread_pips:    3.0,
  trade_window_start: '07:00',
  trade_window_end:   '20:00',
  ddlimit:            3.0,
  monthlydd:          5.0,
  lockout:            3,
  cooldown:           240,
  // Dynamic exit
  exit_on_range:      true,
  range_exit_hold:    2,
  // Decay detector
  vol_z_max:          2.5,
  decay_window:       10,
  entry_decay_max:    0.25,
  decay_warning:      0.50,
  decay_exit:         0.70,
};

const RG_PAIRS = [
  { id: 'rg_pair_EURUSD', sym: 'EUR/USD' },
  { id: 'rg_pair_GBPUSD', sym: 'GBP/USD' },
  { id: 'rg_pair_USDJPY', sym: 'USD/JPY' },
  { id: 'rg_pair_AUDUSD', sym: 'AUD/USD' },
  { id: 'rg_pair_NZDUSD', sym: 'NZD/USD' },
  { id: 'rg_pair_USDCAD', sym: 'USD/CAD' },
  { id: 'rg_pair_USDCHF', sym: 'USD/CHF' },
  { id: 'rg_pair_GBPJPY', sym: 'GBP/JPY' },
  { id: 'rg_pair_EURGBP', sym: 'EUR/GBP' },
  { id: 'rg_pair_EURJPY', sym: 'EUR/JPY' },
  { id: 'rg_pair_EURCHF', sym: 'EUR/CHF' },
  { id: 'rg_pair_GBPCHF', sym: 'GBP/CHF' },
  { id: 'rg_pair_AUDJPY', sym: 'AUD/JPY' },
  { id: 'rg_pair_CADJPY', sym: 'CAD/JPY' },
  { id: 'rg_pair_XAUUSD', sym: 'XAU/USD' },
  { id: 'rg_pair_NAS100', sym: 'NAS100_USD' },
  { id: 'rg_pair_SPX500', sym: 'SPX500_USD' },
  { id: 'rg_pair_DE30',   sym: 'DE30_USD'   },
  { id: 'rg_pair_UK100',  sym: 'UK100_GBP'  },
  { id: 'rg_pair_US30',   sym: 'US30_USD'   },
  { id: 'rg_pair_US2000', sym: 'US2000_USD' },
];

let _rgCfg = JSON.parse(JSON.stringify(RG_DEFAULTS));

function readRgForm() {
  _rgCfg.enabled            = chk('rg_enabled');
  _rgCfg.paper_mode         = chk('rg_paper_mode');
  _rgCfg.interval_secs      = num('rg_interval_secs',      60);
  _rgCfg.min_confidence     = num('rg_min_confidence',     65);
  _rgCfg.candle_hold        = num('rg_candle_hold',         3);
  _rgCfg.sl_atr_mult        = num('rg_sl_atr_mult',       1.8);
  _rgCfg.sl_atr_tf          = radio('rg_sl_atr_tf',       '5m');
  _rgCfg.exit_on_range      = chk('rg_exit_on_range');
  _rgCfg.range_exit_hold    = num('rg_range_exit_hold',     2);
  _rgCfg.risk_pct           = num('rg_risk_pct',          1.0);
  _rgCfg.max_lot            = num('rg_max_lot',           5.0);
  _rgCfg.max_spread_pips    = num('rg_max_spread_pips',   3.0);
  _rgCfg.trade_window_start = str('rg_window_start',   '07:00');
  _rgCfg.trade_window_end   = str('rg_window_end',     '20:00');
  _rgCfg.ddlimit            = num('rg_ddlimit',           3.0);
  _rgCfg.monthlydd          = num('rg_monthlydd',         5.0);
  _rgCfg.lockout            = num('rg_lockout',             3);
  _rgCfg.cooldown           = num('rg_cooldown',          240);
  _rgCfg.vol_z_max          = num('rg_vol_z_max',         2.5);
  _rgCfg.decay_window       = num('rg_decay_window',       10);
  _rgCfg.entry_decay_max    = num('rg_entry_decay_max',   0.25);
  _rgCfg.decay_warning      = num('rg_decay_warning',     0.50);
  _rgCfg.decay_exit         = num('rg_decay_exit',        0.70);
  _rgCfg.pairs              = RG_PAIRS.filter(p => chk(p.id)).map(p => p.sym);
}

function renderRgForm() {
  setChk('rg_enabled',          _rgCfg.enabled        ?? true);
  setChk('rg_paper_mode',       _rgCfg.paper_mode     ?? true);
  setVal('rg_interval_secs',    _rgCfg.interval_secs  ?? 60);
  setVal('rg_min_confidence',   _rgCfg.min_confidence ?? 65);
  setVal('rg_candle_hold',      _rgCfg.candle_hold    ?? 3);
  setVal('rg_sl_atr_mult',      _rgCfg.sl_atr_mult        ?? 1.8);
  setRadio('rg_sl_atr_tf',      _rgCfg.sl_atr_tf          ?? '5m');
  setChk('rg_exit_on_range',    _rgCfg.exit_on_range      ?? true);
  setVal('rg_range_exit_hold',  _rgCfg.range_exit_hold    ?? 2);
  setVal('rg_risk_pct',         _rgCfg.risk_pct           ?? 1.0);
  setVal('rg_max_lot',          _rgCfg.max_lot        ?? 5.0);
  setVal('rg_max_spread_pips',  _rgCfg.max_spread_pips ?? 3.0);
  setVal('rg_window_start',     _rgCfg.trade_window_start ?? '07:00');
  setVal('rg_window_end',       _rgCfg.trade_window_end   ?? '20:00');
  setVal('rg_ddlimit',          _rgCfg.ddlimit        ?? 3.0);
  setVal('rg_monthlydd',        _rgCfg.monthlydd      ?? 5.0);
  setVal('rg_lockout',          _rgCfg.lockout        ?? 3);
  setVal('rg_cooldown',         _rgCfg.cooldown           ?? 240);
  setVal('rg_vol_z_max',        _rgCfg.vol_z_max          ?? 2.5);
  setVal('rg_decay_window',     _rgCfg.decay_window       ?? 10);
  setVal('rg_entry_decay_max',  _rgCfg.entry_decay_max    ?? 0.25);
  setVal('rg_decay_warning',    _rgCfg.decay_warning      ?? 0.50);
  setVal('rg_decay_exit',       _rgCfg.decay_exit         ?? 0.70);

  const enabledPairs = new Set(_rgCfg.pairs || RG_DEFAULTS.pairs);
  RG_PAIRS.forEach(p => setChk(p.id, enabledPairs.has(p.sym)));
}

async function loadRgConfig() {
  try {
    const stored = await kvGet('regime_bot_config');
    if (stored) { _rgCfg = { ...JSON.parse(JSON.stringify(RG_DEFAULTS)), ...stored }; }
    renderRgForm();
  } catch (e) { /* non-critical */ }
}

async function saveRgConfig() {
  readRgForm();
  const el = document.getElementById('rgSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('regime_bot_config', _rgCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = 'var(--purple)'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetRgDefaults() {
  _rgCfg = JSON.parse(JSON.stringify(RG_DEFAULTS));
  renderRgForm();
  const el = document.getElementById('rgSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadRgCreds() {
  try { _applyCredsToForm(await kvGet('regime_bot_credentials'), 'rg_', 'rg_mt5_password'); } catch (e) {}
}
async function saveRgCreds() {
  await _saveCreds('regime_bot_credentials', 'rg_', 'rg_mt5_password', 'rgCredsStatus');
}

// ── Regime Bot V2 ─────────────────────────────────────────────────────────────

const RGV2_DEFAULTS = {
  enabled:            true,
  paper_mode:         true,
  pairs:              ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  interval_secs:      30,
  entry_conf:         70.0,
  candle_hold:        2,
  vol_z_max:          2.5,
  entry_decay_max:    0.25,
  consensus_min:      2,
  hold_conf:          55.0,
  conf_floor:         45.0,
  slope_thresh:       -5.0,
  slope_bars:         3,
  drop_thresh:        15.0,
  bocpd_thresh:       70.0,
  bocpd_exit_bars:    2,
  decay_exit:         0.70,
  decay_window:       10,
  ddlimit:            3.0,
  monthlydd:          5.0,
  lockout:            3,
  cooldown:           240,
  heartbeat_min:      120,
  use_1h:             true,
  use_bocpd:          true,
  use_vix:            true,
  use_news:           true,
  fomc_window_hours:  48.0,
  bocpd_run_length:   150,
  entry_score_min:    55.0,
  hold_score_min:     40.0,
  score_drop_exit:    30.0,
  score_drop_bars:    2,
  trade_window_start: '07:00',
  trade_window_end:   '20:00',
  tg_token:           '',
  tg_chat_id:         '',
};

const RGV2_PAIRS = [
  { id: 'rgv2_pair_EURUSD', sym: 'EUR/USD' },
  { id: 'rgv2_pair_GBPUSD', sym: 'GBP/USD' },
  { id: 'rgv2_pair_USDJPY', sym: 'USD/JPY' },
  { id: 'rgv2_pair_AUDUSD', sym: 'AUD/USD' },
  { id: 'rgv2_pair_NZDUSD', sym: 'NZD/USD' },
  { id: 'rgv2_pair_USDCAD', sym: 'USD/CAD' },
  { id: 'rgv2_pair_USDCHF', sym: 'USD/CHF' },
  { id: 'rgv2_pair_GBPJPY', sym: 'GBP/JPY' },
  { id: 'rgv2_pair_EURGBP', sym: 'EUR/GBP' },
  { id: 'rgv2_pair_EURJPY', sym: 'EUR/JPY' },
  { id: 'rgv2_pair_EURCHF', sym: 'EUR/CHF' },
  { id: 'rgv2_pair_GBPCHF', sym: 'GBP/CHF' },
  { id: 'rgv2_pair_AUDJPY', sym: 'AUD/JPY' },
  { id: 'rgv2_pair_CADJPY', sym: 'CAD/JPY' },
  { id: 'rgv2_pair_XAUUSD', sym: 'XAU/USD' },
  { id: 'rgv2_pair_NAS100',  sym: 'NAS100_USD' },
  { id: 'rgv2_pair_SPX500',  sym: 'SPX500_USD' },
  { id: 'rgv2_pair_DE30',    sym: 'DE30_USD'   },
  { id: 'rgv2_pair_UK100',   sym: 'UK100_GBP'  },
  { id: 'rgv2_pair_US30',    sym: 'US30_USD'   },
  { id: 'rgv2_pair_US2000',  sym: 'US2000_USD' },
];

let _rgv2Cfg = JSON.parse(JSON.stringify(RGV2_DEFAULTS));

function readRgV2Form() {
  _rgv2Cfg.enabled            = chk('rgv2_enabled');
  _rgv2Cfg.paper_mode         = chk('rgv2_paper_mode');
  _rgv2Cfg.interval_secs      = num('rgv2_interval_secs',      30);
  _rgv2Cfg.entry_conf         = num('rgv2_entry_conf',         70);
  _rgv2Cfg.candle_hold        = num('rgv2_candle_hold',         2);
  _rgv2Cfg.vol_z_max          = num('rgv2_vol_z_max',          2.5);
  _rgv2Cfg.entry_decay_max    = num('rgv2_entry_decay_max',    0.25);
  _rgv2Cfg.consensus_min      = num('rgv2_consensus_min',       2);
  _rgv2Cfg.hold_conf          = num('rgv2_hold_conf',          55);
  _rgv2Cfg.conf_floor         = num('rgv2_conf_floor',         45);
  _rgv2Cfg.slope_thresh       = num('rgv2_slope_thresh',       -5);
  _rgv2Cfg.slope_bars         = num('rgv2_slope_bars',          3);
  _rgv2Cfg.drop_thresh        = num('rgv2_drop_thresh',        15);
  _rgv2Cfg.bocpd_thresh       = num('rgv2_bocpd_thresh',       70);
  _rgv2Cfg.bocpd_exit_bars    = num('rgv2_bocpd_exit_bars',     2);
  _rgv2Cfg.decay_exit         = num('rgv2_decay_exit',         0.70);
  _rgv2Cfg.ddlimit            = num('rgv2_ddlimit',            3.0);
  _rgv2Cfg.monthlydd          = num('rgv2_monthlydd',          5.0);
  _rgv2Cfg.lockout            = num('rgv2_lockout',              3);
  _rgv2Cfg.cooldown           = num('rgv2_cooldown',           240);
  _rgv2Cfg.heartbeat_min      = num('rgv2_heartbeat_min',      120);
  _rgv2Cfg.bocpd_run_length   = num('rgv2_bocpd_run_length',   150);
  _rgv2Cfg.entry_score_min    = num('rgv2_entry_score_min',   55.0);
  _rgv2Cfg.hold_score_min     = num('rgv2_hold_score_min',    40.0);
  _rgv2Cfg.score_drop_exit    = num('rgv2_score_drop_exit',   30.0);
  _rgv2Cfg.score_drop_bars    = num('rgv2_score_drop_bars',     2);
  _rgv2Cfg.use_1h             = chk('rgv2_use_1h');
  _rgv2Cfg.use_bocpd          = chk('rgv2_use_bocpd');
  _rgv2Cfg.use_vix            = chk('rgv2_use_vix');
  _rgv2Cfg.use_news           = chk('rgv2_use_news');
  _rgv2Cfg.trade_window_start = str('rgv2_window_start',   '07:00');
  _rgv2Cfg.trade_window_end   = str('rgv2_window_end',     '20:00');
  _rgv2Cfg.tg_token           = str('rgv2_tg_token',       '');
  _rgv2Cfg.tg_chat_id         = str('rgv2_tg_chat_id',     '');
  _rgv2Cfg.pairs              = RGV2_PAIRS.filter(p => chk(p.id)).map(p => p.sym);
}

function renderRgV2Form() {
  setChk('rgv2_enabled',          _rgv2Cfg.enabled          ?? true);
  setChk('rgv2_paper_mode',       _rgv2Cfg.paper_mode       ?? true);
  setVal('rgv2_interval_secs',    _rgv2Cfg.interval_secs    ?? 30);
  setVal('rgv2_entry_conf',       _rgv2Cfg.entry_conf       ?? 70);
  setVal('rgv2_candle_hold',      _rgv2Cfg.candle_hold      ?? 2);
  setVal('rgv2_vol_z_max',        _rgv2Cfg.vol_z_max        ?? 2.5);
  setVal('rgv2_entry_decay_max',  _rgv2Cfg.entry_decay_max  ?? 0.25);
  setVal('rgv2_consensus_min',    _rgv2Cfg.consensus_min    ?? 2);
  setVal('rgv2_hold_conf',        _rgv2Cfg.hold_conf        ?? 55);
  setVal('rgv2_conf_floor',       _rgv2Cfg.conf_floor       ?? 45);
  setVal('rgv2_slope_thresh',     _rgv2Cfg.slope_thresh     ?? -5);
  setVal('rgv2_slope_bars',       _rgv2Cfg.slope_bars       ?? 3);
  setVal('rgv2_drop_thresh',      _rgv2Cfg.drop_thresh      ?? 15);
  setVal('rgv2_bocpd_thresh',     _rgv2Cfg.bocpd_thresh     ?? 70);
  setVal('rgv2_bocpd_exit_bars',  _rgv2Cfg.bocpd_exit_bars  ?? 2);
  setVal('rgv2_decay_exit',       _rgv2Cfg.decay_exit       ?? 0.70);
  setVal('rgv2_ddlimit',          _rgv2Cfg.ddlimit          ?? 3.0);
  setVal('rgv2_monthlydd',        _rgv2Cfg.monthlydd        ?? 5.0);
  setVal('rgv2_lockout',          _rgv2Cfg.lockout          ?? 3);
  setVal('rgv2_cooldown',         _rgv2Cfg.cooldown         ?? 240);
  setVal('rgv2_heartbeat_min',    _rgv2Cfg.heartbeat_min    ?? 120);
  setVal('rgv2_bocpd_run_length', _rgv2Cfg.bocpd_run_length ?? 150);
  setVal('rgv2_entry_score_min',  _rgv2Cfg.entry_score_min  ?? 55.0);
  setVal('rgv2_hold_score_min',   _rgv2Cfg.hold_score_min   ?? 40.0);
  setVal('rgv2_score_drop_exit',  _rgv2Cfg.score_drop_exit  ?? 30.0);
  setVal('rgv2_score_drop_bars',  _rgv2Cfg.score_drop_bars  ?? 2);
  setChk('rgv2_use_1h',           _rgv2Cfg.use_1h           ?? true);
  setChk('rgv2_use_bocpd',        _rgv2Cfg.use_bocpd        ?? true);
  setChk('rgv2_use_vix',          _rgv2Cfg.use_vix          ?? true);
  setChk('rgv2_use_news',         _rgv2Cfg.use_news         ?? true);
  setVal('rgv2_window_start',     _rgv2Cfg.trade_window_start ?? '07:00');
  setVal('rgv2_window_end',       _rgv2Cfg.trade_window_end   ?? '20:00');
  setVal('rgv2_tg_token',         _rgv2Cfg.tg_token           ?? '');
  setVal('rgv2_tg_chat_id',       _rgv2Cfg.tg_chat_id         ?? '');

  const enabledPairs = new Set(_rgv2Cfg.pairs || RGV2_DEFAULTS.pairs);
  RGV2_PAIRS.forEach(p => setChk(p.id, enabledPairs.has(p.sym)));
}

async function loadRgV2Config() {
  try {
    const stored = await kvGet('regime_bot_v2_config');
    if (stored) { _rgv2Cfg = { ...JSON.parse(JSON.stringify(RGV2_DEFAULTS)), ...stored }; }
    renderRgV2Form();
  } catch (e) { /* non-critical */ }
}

async function saveRgV2Config() {
  readRgV2Form();
  const el = document.getElementById('rgv2SaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('regime_bot_v2_config', _rgv2Cfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = 'var(--purple)'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetRgV2Defaults() {
  _rgv2Cfg = JSON.parse(JSON.stringify(RGV2_DEFAULTS));
  renderRgV2Form();
  const el = document.getElementById('rgv2SaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function rgV2TgTest() {
  const btn = document.getElementById('rgv2TgTestBtn');
  const el  = document.getElementById('rgv2TgTestStatus');
  if (btn) btn.disabled = true;
  if (el)  { el.textContent = 'Sending…'; el.style.color = 'var(--text3)'; }
  try {
    const r = await fetch('/api/regime-v2/tg-test', { method: 'POST' });
    const j = await r.json();
    if (j.ok) {
      if (el) { el.textContent = `Sent ✓  (${j.pair})`; el.style.color = 'var(--purple)'; }
      setTimeout(() => { if (el) el.textContent = ''; }, 4000);
    } else {
      if (el) { el.textContent = `Failed: ${j.reason}`; el.style.color = 'var(--red)'; }
    }
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadRgV2Creds() {
  try { _applyCredsToForm(await kvGet('regime_bot_v2_credentials'), 'rgv2_', 'rgv2_mt5_password'); } catch (e) {}
}
async function saveRgV2Creds() {
  await _saveCreds('regime_bot_v2_credentials', 'rgv2_', 'rgv2_mt5_password', 'rgv2CredsStatus');
}

async function rgV2ForceUnlock() {
  const btn = document.getElementById('rgv2UnlockBtn');
  const el  = document.getElementById('rgv2UnlockStatus');
  if (btn) btn.disabled = true;
  if (el)  { el.textContent = 'Sending…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('rgv2_force_unlock', { force_unlock: true, requested_at: Date.now() });
    if (el) { el.textContent = 'Unlock sent — bot will clear lockout within 30s ✓'; el.style.color = 'var(--purple)'; }
    setTimeout(() => { if (el) el.textContent = ''; if (btn) btn.disabled = false; }, 5000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
    if (btn) btn.disabled = false;
  }
}

function _rgv2RegimeColor(regime) {
  const r = (regime || '').toUpperCase();
  if (r === 'BULL')  return '#2ecc71';
  if (r === 'BEAR')  return '#e74c3c';
  if (r === 'RANGE') return '#f1c40f';
  return '#888';
}

async function loadRgV2Status() {
  try {
    const data = await kvGet('regime_bot_v2_status');
    const ageEl    = document.getElementById('rgv2StatusAge');
    const modeEl   = document.getElementById('rgv2StatusMode');
    const lockEl   = document.getElementById('rgv2LockoutBadge');
    const tbody    = document.getElementById('rgv2StatusBody');
    if (!data) {
      if (ageEl) ageEl.textContent = 'Bot has not run yet';
      return;
    }

    const ageSecs = Math.round((Date.now() - (data.pushed_at ?? 0) * 1000) / 1000);
    if (ageEl) {
      ageEl.textContent = ageSecs < 60 ? `${ageSecs}s ago` : `${Math.round(ageSecs / 60)}m ago`;
      ageEl.style.color = ageSecs > 90 ? '#f39c12' : 'var(--text3)';
    }
    if (modeEl) {
      modeEl.textContent = data.paper_mode ? '· PAPER' : '· LIVE';
      modeEl.style.color = data.paper_mode ? '#888' : '#e74c3c';
    }
    if (lockEl) {
      lockEl.style.display = data.riskguard_locked ? 'inline' : 'none';
    }

    if (!tbody) return;
    const pairs = data.pairs || {};
    if (!Object.keys(pairs).length) {
      tbody.innerHTML = '<tr><td colspan="10" style="padding:16px;text-align:center;color:var(--text3)">No pair data yet</td></tr>';
      return;
    }

    tbody.innerHTML = Object.entries(pairs).map(([sym, p]) => {
      const regColor   = _rgv2RegimeColor(p.regime);
      const confVal    = p.conf != null ? p.conf.toFixed(1) + '%' : '—';
      const slopeStr   = p.slope != null ? (p.slope >= 0 ? `+${p.slope.toFixed(1)}` : p.slope.toFixed(1)) : '—';
      const volStr     = p.vol_z != null ? (p.vol_z >= 0 ? `+${p.vol_z.toFixed(2)}` : p.vol_z.toFixed(2)) : '—';
      const activeMins = p.regime_mins != null ? Math.round(p.regime_mins) + 'm' : '—';
      const bocpdStr   = p.bocpd != null ? p.bocpd.toFixed(1) + '%' : '—';

      // Score cell
      const rs = p.reg_score;
      let scoreCell = '<span style="color:var(--text3)">—</span>';
      if (rs && rs.score != null) {
        const s = rs.score;
        const scoreColor = s >= 70 ? '#2ecc71' : s >= 55 ? '#f1c40f' : s >= 40 ? '#f39c12' : '#e74c3c';
        const tip = rs.size_pct != null ? `title="Size ${rs.size_pct.toFixed(0)}% of target"` : '';
        scoreCell = `<span ${tip} style="color:${scoreColor};font-weight:600">${s.toFixed(0)}</span>`;
      }

      let posCell = '<span style="color:var(--text3)">flat</span>';
      if (p.status === 'open') {
        const sign = (p.pnl_pips ?? 0) >= 0 ? '+' : '';
        const pnl  = p.pnl_pips != null ? ` ${sign}${p.pnl_pips.toFixed(1)}p` : '';
        const dur  = p.dur_secs != null ? ` ${Math.round(p.dur_secs / 60)}m` : '';
        const col  = p.direction === 'LONG' ? '#2ecc71' : '#e74c3c';
        posCell = `<span style="color:${col};font-weight:600">${p.direction}${dur}${pnl}</span>`;
      } else if (p.status === 'blocked') {
        posCell = `<span style="color:#f39c12">🔒 ${p.reason || 'locked'}</span>`;
      } else if (p.status === 'gated') {
        posCell = `<span style="color:var(--text3)">gated: ${(p.reason || '').substring(0, 24)}</span>`;
      } else if (p.status === 'hold_pending') {
        posCell = `<span style="color:var(--text3)">hold…</span>`;
      } else if (p.status === 'watching') {
        posCell = `<span style="color:var(--text3)">watching</span>`;
      }

      const h1Cell = p.h1_regime
        ? `<span style="color:${_rgv2RegimeColor(p.h1_regime)}">${p.h1_regime}</span>`
        : '<span style="color:var(--text3)">—</span>';

      // Score component breakdown row (shown when reg_score.components available)
      let breakdownRow = '';
      if (rs && rs.components && Object.keys(rs.components).length) {
        const chips = Object.values(rs.components).map(c => {
          const cs = c.score;
          const cc = cs >= 70 ? '#2ecc71' : cs >= 40 ? '#f39c12' : '#e74c3c';
          return `<span title="${c.label}: score ${cs.toFixed(0)}, raw ${c.raw}${c.unit}" `
               + `style="display:inline-block;padding:1px 6px;margin:1px 2px;border-radius:3px;`
               + `background:${cc}22;color:${cc};font-size:10px;white-space:nowrap">`
               + `${c.label} ${cs.toFixed(0)}</span>`;
        }).join('');
        const entryS = p.entry_score != null ? ` <span style="color:var(--text3)">entry=${p.entry_score.toFixed(0)}</span>` : '';
        breakdownRow = `<tr style="border-bottom:1px solid var(--bd);background:var(--s2)">
          <td colspan="10" style="padding:2px 10px 5px 24px">${chips}${entryS}</td>
        </tr>`;
      }

      return `<tr style="border-bottom:${breakdownRow ? 'none' : '1px solid var(--bd)'}">
        <td style="padding:7px 10px;font-weight:600">${sym.replace('/', '')}</td>
        <td style="padding:7px 10px;color:${regColor};font-weight:600">${p.regime || '—'}</td>
        <td style="padding:7px 10px;text-align:right">${confVal}</td>
        <td style="padding:7px 10px;text-align:right">${slopeStr}</td>
        <td style="padding:7px 10px;text-align:right">${volStr}σ</td>
        <td style="padding:7px 10px;text-align:right">${activeMins}</td>
        <td style="padding:7px 10px;text-align:right">${bocpdStr}</td>
        <td style="padding:7px 10px;text-align:right">${scoreCell}</td>
        <td style="padding:7px 10px">${posCell}</td>
        <td style="padding:7px 10px">${h1Cell}</td>
      </tr>${breakdownRow}`;
    }).join('');
  } catch (e) { /* non-critical */ }
}

// ── Regime Bot V7 ─────────────────────────────────────────────────────────────

const RGV7_DEFAULTS = {
  enabled:                  true,
  paper_mode:               true,
  pairs:                    ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  interval_secs:            30,
  entry_conf:               54.0,
  entry_score_min:          58.0,
  sl_atr_mult:              2.3,
  candle_hold:              3,
  conf_floor:               55.0,
  mfe_retrace_pct:          0.27,
  mfe_min_r:                1.1,
  max_hold_bars:            49,
  exit_regime_bars:         4,
  window_start:             7,
  window_end:               19,
  post_exit_cooldown:       4,
  htf_require:              false,
  use_bocpd:                true,
  bocpd_run_length:         150,
  risk_pct:                 1.0,
  max_lot:                  5.0,
  max_spread_pips:          3.0,
  ddlimit:                  3.0,
  monthlydd:                5.0,
  lockout:                  3,
  fomc_window_hours:        48.0,
  heartbeat_min:            60,
  entry_fail_cooldown_secs: 300,
  tg_token:                 '',
  tg_chat_id:               '',
};

const RGV7_PAIRS = [
  { id: 'rgv7_pair_EURUSD', sym: 'EUR/USD' },
  { id: 'rgv7_pair_GBPUSD', sym: 'GBP/USD' },
  { id: 'rgv7_pair_USDJPY', sym: 'USD/JPY' },
  { id: 'rgv7_pair_AUDUSD', sym: 'AUD/USD' },
  { id: 'rgv7_pair_NZDUSD', sym: 'NZD/USD' },
  { id: 'rgv7_pair_USDCAD', sym: 'USD/CAD' },
  { id: 'rgv7_pair_USDCHF', sym: 'USD/CHF' },
  { id: 'rgv7_pair_GBPJPY', sym: 'GBP/JPY' },
  { id: 'rgv7_pair_EURGBP', sym: 'EUR/GBP' },
  { id: 'rgv7_pair_EURJPY', sym: 'EUR/JPY' },
  { id: 'rgv7_pair_EURCHF', sym: 'EUR/CHF' },
  { id: 'rgv7_pair_GBPCHF', sym: 'GBP/CHF' },
  { id: 'rgv7_pair_AUDJPY', sym: 'AUD/JPY' },
  { id: 'rgv7_pair_CADJPY', sym: 'CAD/JPY' },
  { id: 'rgv7_pair_XAUUSD', sym: 'XAU/USD' },
  { id: 'rgv7_pair_NAS100',  sym: 'NAS100_USD' },
  { id: 'rgv7_pair_SPX500',  sym: 'SPX500_USD' },
  { id: 'rgv7_pair_DE30',    sym: 'DE30_USD'   },
  { id: 'rgv7_pair_UK100',   sym: 'UK100_GBP'  },
  { id: 'rgv7_pair_US30',    sym: 'US30_USD'   },
  { id: 'rgv7_pair_US2000',  sym: 'US2000_USD' },
];

let _rgv7Cfg = JSON.parse(JSON.stringify(RGV7_DEFAULTS));

function readRgV7Form() {
  _rgv7Cfg.enabled                  = chk('rgv7_enabled');
  _rgv7Cfg.paper_mode               = chk('rgv7_paper_mode');
  _rgv7Cfg.interval_secs            = num('rgv7_interval_secs',      30);
  _rgv7Cfg.entry_conf               = num('rgv7_entry_conf',         54.0);
  _rgv7Cfg.entry_score_min          = num('rgv7_entry_score_min',    58.0);
  _rgv7Cfg.sl_atr_mult              = num('rgv7_sl_atr_mult',        2.3);
  _rgv7Cfg.candle_hold              = num('rgv7_candle_hold',        3);
  _rgv7Cfg.conf_floor               = num('rgv7_conf_floor',         55.0);
  _rgv7Cfg.mfe_retrace_pct          = num('rgv7_mfe_retrace_pct',    0.27);
  _rgv7Cfg.mfe_min_r                = num('rgv7_mfe_min_r',          1.1);
  _rgv7Cfg.max_hold_bars            = num('rgv7_max_hold_bars',      49);
  _rgv7Cfg.exit_regime_bars         = num('rgv7_exit_regime_bars',   4);
  _rgv7Cfg.window_start             = num('rgv7_window_start',       7);
  _rgv7Cfg.window_end               = num('rgv7_window_end',         19);
  _rgv7Cfg.post_exit_cooldown       = num('rgv7_post_exit_cooldown', 4);
  _rgv7Cfg.htf_require              = chk('rgv7_htf_require');
  _rgv7Cfg.use_bocpd                = chk('rgv7_use_bocpd');
  _rgv7Cfg.bocpd_run_length         = num('rgv7_bocpd_run_length',   150);
  _rgv7Cfg.risk_pct                 = num('rgv7_risk_pct',           1.0);
  _rgv7Cfg.max_lot                  = num('rgv7_max_lot',            5.0);
  _rgv7Cfg.max_spread_pips          = num('rgv7_max_spread_pips',    3.0);
  _rgv7Cfg.ddlimit                  = num('rgv7_ddlimit',            3.0);
  _rgv7Cfg.monthlydd                = num('rgv7_monthlydd',          5.0);
  _rgv7Cfg.lockout                  = num('rgv7_lockout',            3);
  _rgv7Cfg.fomc_window_hours        = num('rgv7_fomc_window_hours',  48.0);
  _rgv7Cfg.heartbeat_min            = num('rgv7_heartbeat_min',      60);
  _rgv7Cfg.entry_fail_cooldown_secs = num('rgv7_entry_fail_cooldown_secs', 300);
  _rgv7Cfg.tg_token                 = str('rgv7_tg_token',           '');
  _rgv7Cfg.tg_chat_id               = str('rgv7_tg_chat_id',         '');
  _rgv7Cfg.pairs                    = RGV7_PAIRS.filter(p => chk(p.id)).map(p => p.sym);
}

function renderRgV7Form() {
  setChk('rgv7_enabled',            _rgv7Cfg.enabled            ?? true);
  setChk('rgv7_paper_mode',         _rgv7Cfg.paper_mode         ?? true);
  setVal('rgv7_interval_secs',      _rgv7Cfg.interval_secs      ?? 30);
  setVal('rgv7_entry_conf',         _rgv7Cfg.entry_conf         ?? 70.0);
  setVal('rgv7_entry_score_min',    _rgv7Cfg.entry_score_min    ?? 62.0);
  setVal('rgv7_sl_atr_mult',        _rgv7Cfg.sl_atr_mult        ?? 2.0);
  setVal('rgv7_candle_hold',        _rgv7Cfg.candle_hold        ?? 2);
  setVal('rgv7_conf_floor',         _rgv7Cfg.conf_floor         ?? 45.0);
  setVal('rgv7_mfe_retrace_pct',    _rgv7Cfg.mfe_retrace_pct    ?? 0.25);
  setVal('rgv7_mfe_min_r',          _rgv7Cfg.mfe_min_r          ?? 1.5);
  setVal('rgv7_max_hold_bars',      _rgv7Cfg.max_hold_bars      ?? 24);
  setVal('rgv7_exit_regime_bars',   _rgv7Cfg.exit_regime_bars   ?? 3);
  setVal('rgv7_window_start',       _rgv7Cfg.window_start       ?? 7);
  setVal('rgv7_window_end',         _rgv7Cfg.window_end         ?? 20);
  setVal('rgv7_post_exit_cooldown', _rgv7Cfg.post_exit_cooldown ?? 4);
  setChk('rgv7_htf_require',        _rgv7Cfg.htf_require        ?? false);
  setChk('rgv7_use_bocpd',          _rgv7Cfg.use_bocpd          ?? true);
  setVal('rgv7_bocpd_run_length',   _rgv7Cfg.bocpd_run_length   ?? 150);
  setVal('rgv7_risk_pct',           _rgv7Cfg.risk_pct           ?? 1.0);
  setVal('rgv7_max_lot',            _rgv7Cfg.max_lot            ?? 5.0);
  setVal('rgv7_max_spread_pips',    _rgv7Cfg.max_spread_pips    ?? 3.0);
  setVal('rgv7_ddlimit',            _rgv7Cfg.ddlimit            ?? 3.0);
  setVal('rgv7_monthlydd',          _rgv7Cfg.monthlydd          ?? 5.0);
  setVal('rgv7_lockout',            _rgv7Cfg.lockout            ?? 3);
  setVal('rgv7_heartbeat_min',      _rgv7Cfg.heartbeat_min      ?? 60);
  setVal('rgv7_tg_token',           _rgv7Cfg.tg_token           ?? '');
  setVal('rgv7_tg_chat_id',         _rgv7Cfg.tg_chat_id         ?? '');

  const enabledPairs = new Set(_rgv7Cfg.pairs || RGV7_DEFAULTS.pairs);
  RGV7_PAIRS.forEach(p => setChk(p.id, enabledPairs.has(p.sym)));
}

async function loadRgV7Config() {
  try {
    const stored = await kvGet('regime_bot_v7_config');
    if (stored) { _rgv7Cfg = { ...JSON.parse(JSON.stringify(RGV7_DEFAULTS)), ...stored }; }
    renderRgV7Form();
  } catch (e) { /* non-critical */ }
}

async function saveRgV7Config() {
  readRgV7Form();
  const el = document.getElementById('rgv7SaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('regime_bot_v7_config', _rgv7Cfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#14b8a6'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetRgV7Defaults() {
  _rgv7Cfg = JSON.parse(JSON.stringify(RGV7_DEFAULTS));
  renderRgV7Form();
  const el = document.getElementById('rgv7SaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function rgV7TgTest() {
  const btn = document.getElementById('rgv7TgTestBtn');
  const el  = document.getElementById('rgv7TgTestStatus');
  if (btn) btn.disabled = true;
  if (el)  { el.textContent = 'Sending…'; el.style.color = 'var(--text3)'; }
  try {
    const r = await fetch('/api/regime-v7/tg-test', { method: 'POST' });
    const j = await r.json();
    if (j.ok) {
      if (el) { el.textContent = `Sent ✓  (${j.pair})`; el.style.color = '#14b8a6'; }
      setTimeout(() => { if (el) el.textContent = ''; }, 4000);
    } else {
      if (el) { el.textContent = `Failed: ${j.reason}`; el.style.color = 'var(--red)'; }
    }
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadRgV7Creds() {
  try { _applyCredsToForm(await kvGet('regime_bot_v7_credentials'), 'rgv7_', 'rgv7_mt5_password'); } catch (e) {}
}
async function saveRgV7Creds() {
  await _saveCreds('regime_bot_v7_credentials', 'rgv7_', 'rgv7_mt5_password', 'rgv7CredsStatus');
}

async function rgV7ForceUnlock() {
  const btn = document.getElementById('rgv7UnlockBtn');
  const el  = document.getElementById('rgv7UnlockStatus');
  if (btn) btn.disabled = true;
  if (el)  { el.textContent = 'Sending…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('rgv7_force_unlock', { force_unlock: true, requested_at: Date.now() });
    if (el) { el.textContent = 'Unlock sent — bot will clear lockout within 30s ✓'; el.style.color = '#14b8a6'; }
    setTimeout(() => { if (el) el.textContent = ''; if (btn) btn.disabled = false; }, 5000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
    if (btn) btn.disabled = false;
  }
}

function _rgv7RegimeColor(regime) {
  const r = (regime || '').toUpperCase();
  if (r === 'BULL')  return '#2ecc71';
  if (r === 'BEAR')  return '#e74c3c';
  if (r === 'RANGE') return '#f1c40f';
  return '#888';
}

async function loadRgV7Status() {
  try {
    const data = await kvGet('regime_bot_v7_status');
    const ageEl  = document.getElementById('rgv7StatusAge');
    const modeEl = document.getElementById('rgv7StatusMode');
    const lockEl = document.getElementById('rgv7LockoutBadge');
    const tbody  = document.getElementById('rgv7StatusBody');
    if (!data) {
      if (ageEl) ageEl.textContent = 'Bot has not run yet';
      return;
    }

    const ageSecs = Math.round((Date.now() - (data.pushed_at ?? 0) * 1000) / 1000);
    if (ageEl) {
      ageEl.textContent = ageSecs < 60 ? `${ageSecs}s ago` : `${Math.round(ageSecs / 60)}m ago`;
      ageEl.style.color = ageSecs > 90 ? '#f39c12' : 'var(--text3)';
    }
    if (modeEl) {
      modeEl.textContent = data.paper_mode ? '· PAPER' : '· LIVE';
      modeEl.style.color = data.paper_mode ? '#888' : '#e74c3c';
    }
    if (lockEl) {
      lockEl.style.display = data.riskguard_locked ? 'inline' : 'none';
    }

    if (!tbody) return;
    const pairs = data.pairs || {};
    if (!Object.keys(pairs).length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text3)">No pair data yet</td></tr>';
      return;
    }

    tbody.innerHTML = Object.entries(pairs).map(([sym, p]) => {
      const regColor = _rgv7RegimeColor(p.regime);
      const confVal  = p.conf != null ? p.conf.toFixed(1) + '%' : '—';

      // Score: plain number on most states; nested in reg_score on 'opened'
      const scoreNum = p.score ?? (p.reg_score && p.reg_score.score);
      let scoreCell = '<span style="color:var(--text3)">—</span>';
      if (scoreNum != null) {
        const scoreColor = scoreNum >= 70 ? '#2ecc71' : scoreNum >= 50 ? '#f1c40f' : scoreNum >= 30 ? '#f39c12' : '#e74c3c';
        scoreCell = `<span style="color:${scoreColor};font-weight:600">${scoreNum.toFixed(0)}</span>`;
      }

      const htfCell = p.htf_regime
        ? `<span style="color:${_rgv7RegimeColor(p.htf_regime)}">${p.htf_regime}</span>`
        : '<span style="color:var(--text3)">—</span>';

      let posCell = '<span style="color:var(--text3)">flat</span>';
      if (p.status === 'open') {
        const sign = (p.pnl_pips ?? 0) >= 0 ? '+' : '';
        const pnl  = p.pnl_pips != null ? ` ${sign}${p.pnl_pips.toFixed(1)}p` : '';
        const dur  = p.dur_secs != null ? ` ${Math.round(p.dur_secs / 60)}m` : '';
        const mfe  = p.mfe_r != null ? ` (${p.mfe_r.toFixed(2)}R)` : '';
        const col  = p.direction === 'LONG' ? '#2ecc71' : '#e74c3c';
        posCell = `<span style="color:${col};font-weight:600">${p.direction}${dur}${pnl}${mfe}</span>`;
      } else if (p.status === 'opened') {
        posCell = `<span style="color:#2ecc71;font-weight:600">${p.direction} entered @ ${p.entry}</span>`;
      } else if (p.status === 'closed') {
        const sign = (p.pnl_pips ?? 0) >= 0 ? '+' : '';
        const col  = (p.pnl_pips ?? 0) >= 0 ? '#2ecc71' : '#e74c3c';
        posCell = `<span style="color:${col}">closed: ${p.reason} (${sign}${(p.pnl_pips ?? 0).toFixed(1)}p)</span>`;
      } else if (p.status === 'blocked') {
        posCell = `<span style="color:#f39c12">🔒 ${p.reason || 'locked'}</span>`;
      } else if (p.status === 'cooldown') {
        posCell = `<span style="color:var(--text3)">cooldown (${p.bars_left ?? 0} bars left)</span>`;
      } else if (p.status === 'window') {
        posCell = `<span style="color:var(--text3)">outside trade window</span>`;
      } else if (p.status === 'hold_pending') {
        posCell = `<span style="color:var(--text3)">hold pending (${p.debounce ?? 0})</span>`;
      } else if (p.status === 'gated') {
        posCell = `<span style="color:var(--text3)">gated (${p.debounce ?? 0})</span>`;
      } else if (p.status === 'watching') {
        posCell = `<span style="color:var(--text3)">watching</span>`;
      } else if (p.status === 'entry_failed') {
        posCell = `<span style="color:#e74c3c">entry failed</span>`;
      } else if (typeof p.status === 'string' && p.status.startsWith('order_fail_cd')) {
        posCell = `<span style="color:#e74c3c">${p.status}</span>`;
      }

      return `<tr style="border-bottom:1px solid var(--bd)">
        <td style="padding:7px 10px;font-weight:600">${sym.replace('/', '')}</td>
        <td style="padding:7px 10px;color:${regColor};font-weight:600">${p.regime || '—'}</td>
        <td style="padding:7px 10px;text-align:right">${confVal}</td>
        <td style="padding:7px 10px;text-align:right">${scoreCell}</td>
        <td style="padding:7px 10px">${htfCell}</td>
        <td style="padding:7px 10px">${posCell}</td>
      </tr>`;
    }).join('');
  } catch (e) { /* non-critical */ }
}

async function loadRgBotStatus() {
  try {
    const data = await kvGet('regime_bot_status');
    if (!data) { setText('rgBsAge', 'No status — bot has not run yet'); return; }

    const age = Math.round((Date.now() - (data.pushed_at ?? 0) * 1000) / 60000);
    setText('rgBsAge',  age < 2 ? 'Live' : `Last update ${age}m ago`);
    setText('rgBsMode', data.paper_mode ? '· paper' : '· LIVE');
    setText('rgBsBal',  data.balance != null ? `· $${Number(data.balance).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '');

    const positions = data.positions || {};
    const pairHtml  = Object.entries(positions).map(([pair, p]) => {
      const decayStr = p.decay != null ? ` d=${p.decay.toFixed(2)}` : '';
      const rlStr    = p.run_length != null ? ` rl=${p.run_length}` : '';
      if (p.status === 'open') {
        const pnl       = p.pnl_pips != null ? ` ${p.pnl_pips > 0 ? '+' : ''}${p.pnl_pips}p` : '';
        const col       = p.direction === 'LONG' ? 'bs-green' : 'bs-red';
        const flipStr   = p.flip_count > 0 ? ` ⚠️flip=${p.flip_count}` : '';
        const regLabel  = p.entry_regime && p.regime !== p.entry_regime
          ? `${p.entry_regime}→${p.regime}` : p.regime;
        return `<span class="${col}">${pair} ${p.direction}${pnl} [${regLabel}]${decayStr}${rlStr}${flipStr}</span>`;
      }
      if (p.status === 'watching') {
        return `<span class="bs-dim">${pair} watching ${p.regime} ${p.conf}%${decayStr}${rlStr} (${p.readings})</span>`;
      }
      if (p.status === 'blocked') {
        return `<span class="bs-amber">${pair} blocked: ${p.reason}</span>`;
      }
      if (p.status === 'vol_blocked') {
        return `<span class="bs-amber">${pair} vol spike vol_z=${p.vol_z}</span>`;
      }
      if (p.status === 'decay_blocked') {
        return `<span class="bs-amber">${pair} decay gate d=${p.decay}</span>`;
      }
      return `<span class="bs-dim">${pair} ${p.status}</span>`;
    }).join('  ');

    document.getElementById('rgBsPairs').innerHTML     = pairHtml || '<span class="bs-dim">No pair data</span>';

    const openPos = Object.entries(positions).filter(([, p]) => p.status === 'open');
    document.getElementById('rgBsPositions').innerHTML = openPos.length
      ? `Open: ${openPos.map(([pair, p]) =>
          `<span class="bs-green">${pair} ${p.direction} @${(p.entry ?? 0).toFixed(5)} SL:${(p.sl ?? 0).toFixed(5)} TP:${(p.tp ?? 0).toFixed(5)}</span>`
        ).join('  ')}`
      : '<span class="bs-dim">No open positions</span>';
  } catch (e) { /* non-critical */ }
}

// ── Expose globals (called from inline onclick handlers in HTML) ───────────────

window.saveConfig       = saveConfig;
window.resetDefaults    = resetDefaults;
window.toggleKillSwitch = toggleKillSwitch;
window.forceUnlock      = forceUnlock;
window.saveCreds        = saveCreds;
window.saveBtCreds      = saveBtCreds;
window.saveBtConfig     = saveBtConfig;
window.resetBtDefaults  = resetBtDefaults;
window._loadBtJournal   = loadBtJournal;
window.saveRgConfig     = saveRgConfig;
window.resetRgDefaults  = resetRgDefaults;
window.saveRgCreds      = saveRgCreds;
window.saveRgV2Config    = saveRgV2Config;
window.resetRgV2Defaults = resetRgV2Defaults;
window.saveRgV2Creds     = saveRgV2Creds;
window.rgV2ForceUnlock   = rgV2ForceUnlock;
window.rgV2TgTest        = rgV2TgTest;
window.saveRgV7Config    = saveRgV7Config;
window.resetRgV7Defaults = resetRgV7Defaults;
window.saveRgV7Creds     = saveRgV7Creds;
window.rgV7ForceUnlock   = rgV7ForceUnlock;
window.rgV7TgTest        = rgV7TgTest;

// ── Dyn Anchor Bot ────────────────────────────────────────────────────────────

const DA_DEFAULTS = {
  enabled:             true,
  paper_mode:          true,
  pairs:               ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  interval_secs:       60,
  trade_window_start:  '00:00',
  trade_window_end:    '22:00',
  eod_close_time:      '22:30',
  eod_close_mode:      'close',
  risk_pct:            1.0,
  max_lot:             5.0,
  max_spread_pips:     3.0,
  daily_bars_needed:   60,
  ewma_lambda:         0.94,
  vol_model:           'ewma',
  ema_period:          20,
  regime_threshold:    0.002,
  ddlimit:             3.0,
  monthlydd:           5.0,
  lockout:             3,
  cooldown:            0,
  tg_token:            '',
  tg_chat_id:          '',
};

const DA_PAIRS = [
  { id: 'da_pair_EURUSD', sym: 'EUR/USD'  }, { id: 'da_pair_GBPUSD', sym: 'GBP/USD'  },
  { id: 'da_pair_USDJPY', sym: 'USD/JPY'  }, { id: 'da_pair_AUDUSD', sym: 'AUD/USD'  },
  { id: 'da_pair_NZDUSD', sym: 'NZD/USD'  }, { id: 'da_pair_USDCAD', sym: 'USD/CAD'  },
  { id: 'da_pair_USDCHF', sym: 'USD/CHF'  }, { id: 'da_pair_GBPJPY', sym: 'GBP/JPY'  },
  { id: 'da_pair_EURJPY', sym: 'EUR/JPY'  }, { id: 'da_pair_EURGBP', sym: 'EUR/GBP'  },
  { id: 'da_pair_EURCHF', sym: 'EUR/CHF'  }, { id: 'da_pair_EURCAD', sym: 'EUR/CAD'  },
  { id: 'da_pair_EURAUD', sym: 'EUR/AUD'  }, { id: 'da_pair_AUDJPY', sym: 'AUD/JPY'  },
  { id: 'da_pair_AUDCAD', sym: 'AUD/CAD'  }, { id: 'da_pair_GBPAUD', sym: 'GBP/AUD'  },
  { id: 'da_pair_GBPCAD', sym: 'GBP/CAD'  }, { id: 'da_pair_CADJPY', sym: 'CAD/JPY'  },
  { id: 'da_pair_CHFJPY', sym: 'CHF/JPY'  }, { id: 'da_pair_NZDJPY', sym: 'NZD/JPY'  },
  { id: 'da_pair_AUDNZD', sym: 'AUD/NZD'  }, { id: 'da_pair_GBPNZD', sym: 'GBP/NZD'  },
  { id: 'da_pair_EURNZD', sym: 'EUR/NZD'  }, { id: 'da_pair_AUDCHF', sym: 'AUD/CHF'  },
  { id: 'da_pair_GBPCHF', sym: 'GBP/CHF'   },
  { id: 'da_pair_XAUUSD', sym: 'XAU/USD'   },
  { id: 'da_pair_NAS100', sym: 'NAS100_USD' },
];

let _daCfg = JSON.parse(JSON.stringify(DA_DEFAULTS));

function readDaForm() {
  _daCfg.enabled            = chk('da_enabled');
  _daCfg.paper_mode         = chk('da_paper_mode');
  _daCfg.interval_secs      = num('da_interval_secs',      60);
  _daCfg.trade_window_start = str('da_window_start',    '00:00');
  _daCfg.trade_window_end   = str('da_window_end',      '22:00');
  _daCfg.eod_close_time     = str('da_eod_close_time',  '22:30');
  _daCfg.eod_close_mode     = str('da_eod_close_mode',  'close');
  _daCfg.risk_pct           = num('da_risk_pct',          1.0);
  _daCfg.max_lot            = num('da_max_lot',            5.0);
  _daCfg.max_spread_pips    = num('da_max_spread_pips',    3.0);
  _daCfg.daily_bars_needed  = num('da_daily_bars_needed',  60);
  _daCfg.ewma_lambda        = num('da_ewma_lambda',        0.94);
  _daCfg.vol_model          = str('da_vol_model',          'ewma');
  _daCfg.ema_period         = num('da_ema_period',         20);
  _daCfg.regime_threshold   = num('da_regime_threshold',   0.002);
  _daCfg.ddlimit            = num('da_ddlimit',            3.0);
  _daCfg.monthlydd          = num('da_monthlydd',          5.0);
  _daCfg.lockout            = num('da_lockout',            3);
  _daCfg.cooldown           = num('da_cooldown',           0);
  _daCfg.tg_token           = str('da_tg_token',          '');
  _daCfg.tg_chat_id         = str('da_tg_chat_id',        '');
  _daCfg.pairs              = DA_PAIRS.filter(p => chk(p.id)).map(p => p.sym);
}

function renderDaForm() {
  setChk('da_enabled',          _daCfg.enabled          ?? true);
  setChk('da_paper_mode',       _daCfg.paper_mode       ?? true);
  setVal('da_interval_secs',    _daCfg.interval_secs    ?? 60);
  setVal('da_window_start',     _daCfg.trade_window_start ?? '00:00');
  setVal('da_window_end',       _daCfg.trade_window_end   ?? '22:00');
  setVal('da_eod_close_time',   _daCfg.eod_close_time     ?? '22:30');
  setVal('da_eod_close_mode',   _daCfg.eod_close_mode     ?? 'close');
  setVal('da_risk_pct',         _daCfg.risk_pct         ?? 1.0);
  setVal('da_max_lot',          _daCfg.max_lot          ?? 5.0);
  setVal('da_max_spread_pips',  _daCfg.max_spread_pips  ?? 3.0);
  setVal('da_daily_bars_needed',_daCfg.daily_bars_needed ?? 60);
  setVal('da_ewma_lambda',      _daCfg.ewma_lambda      ?? 0.94);
  setVal('da_vol_model',        _daCfg.vol_model        ?? 'ewma');
  setVal('da_ema_period',       _daCfg.ema_period       ?? 20);
  setVal('da_regime_threshold', _daCfg.regime_threshold ?? 0.002);
  setVal('da_ddlimit',          _daCfg.ddlimit          ?? 3.0);
  setVal('da_monthlydd',        _daCfg.monthlydd        ?? 5.0);
  setVal('da_lockout',          _daCfg.lockout          ?? 3);
  setVal('da_cooldown',         _daCfg.cooldown         ?? 0);
  setVal('da_tg_token',         _daCfg.tg_token         ?? '');
  setVal('da_tg_chat_id',       _daCfg.tg_chat_id       ?? '');
  const enabledPairs = new Set(_daCfg.pairs || DA_DEFAULTS.pairs);
  DA_PAIRS.forEach(p => setChk(p.id, enabledPairs.has(p.sym)));
}

async function loadDaConfig() {
  try {
    const stored = await kvGet('dyn_anchor_config');
    if (stored) { _daCfg = { ...JSON.parse(JSON.stringify(DA_DEFAULTS)), ...stored }; }
    renderDaForm();
  } catch (e) { /* non-critical */ }
}

async function saveDaConfig() {
  readDaForm();
  const el = document.getElementById('daSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('dyn_anchor_config', _daCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = 'var(--amber)'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetDaDefaults() {
  _daCfg = JSON.parse(JSON.stringify(DA_DEFAULTS));
  renderDaForm();
  const el = document.getElementById('daSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadDaCreds() {
  try { _applyCredsToForm(await kvGet('dyn_anchor_credentials'), 'da_', 'da_mt5_password'); } catch (e) {}
}
async function saveDaCreds() {
  await _saveCreds('dyn_anchor_credentials', 'da_', 'da_mt5_password', 'daCredsStatus');
}

async function daForceUnlock() {
  const btn = document.getElementById('daUnlockBtn');
  const el  = document.getElementById('daUnlockStatus');
  if (btn) btn.disabled = true;
  if (el)  { el.textContent = 'Sending…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('da_force_unlock', { force_unlock: true, requested_at: Date.now() });
    if (el) { el.textContent = 'Unlock sent — bot will clear lockout within 60s ✓'; el.style.color = 'var(--amber)'; }
    setTimeout(() => { if (el) el.textContent = ''; if (btn) btn.disabled = false; }, 5000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
    if (btn) btn.disabled = false;
  }
}

function _daRegimeColor(regime) {
  const r = (regime || '').toUpperCase();
  if (r === 'BULL')  return '#f59e0b';
  if (r === 'BEAR')  return '#e74c3c';
  if (r === 'RANGE') return '#888';
  return '#888';
}

async function loadDaStatus() {
  try {
    const data  = await kvGet('dyn_anchor_status');
    const ageEl = document.getElementById('daStatusAge');
    const modeEl= document.getElementById('daStatusMode');
    const tbody = document.getElementById('daStatusBody');
    if (!data) {
      if (ageEl) ageEl.textContent = 'Bot has not run yet';
      return;
    }
    const ageSecs = data.pushed_at ? Math.round(Date.now() / 1000 - data.pushed_at) : null;
    if (ageEl)  ageEl.textContent  = ageSecs != null ? `${ageSecs}s ago` : '—';
    if (modeEl) modeEl.textContent = data.paper_mode ? '📋 PAPER' : '🔴 LIVE';
    if (modeEl) modeEl.style.color = data.paper_mode ? 'var(--text3)' : 'var(--red)';

    const pairs = data.pairs || {};
    if (!tbody) return;
    if (!Object.keys(pairs).length) {
      tbody.innerHTML = '<tr><td colspan="10" style="padding:16px;text-align:center;color:var(--text3)">No pair data yet</td></tr>';
      return;
    }
    const rows = Object.entries(pairs).map(([pair, ps]) => {
      const regime = (ps.regime || 'RANGE').toUpperCase();
      const rCol   = _daRegimeColor(regime);
      const tradeCol = ps.tradeable ? rCol : 'var(--text3)';
      let posHtml = '';
      if (ps.direction) {
        const pCol = ps.direction === 'BUY' ? 'var(--green)' : 'var(--red)';
        posHtml = `<span style="color:${pCol};font-weight:700">${ps.direction}</span> @${ps.entry?.toFixed(5) || '—'}`;
      } else if (ps.daily_trade_done) {
        posHtml = '<span style="color:var(--text3)">traded ✓</span>';
      } else if (!ps.tradeable) {
        posHtml = '<span style="color:var(--text3)">RANGE skip</span>';
      } else if (!ps.setup_done) {
        posHtml = '<span style="color:var(--text3)">setup pending</span>';
      } else {
        posHtml = '<span style="color:var(--green)">watching</span>';
      }
      return `<tr>
        <td style="font-weight:600">${pair}</td>
        <td style="color:${tradeCol};font-weight:700">${regime}</td>
        <td style="text-align:right">${ps.session_open?.toFixed(5) || '—'}</td>
        <td style="text-align:right">${ps.run_high?.toFixed(5) || '—'}</td>
        <td style="text-align:right">${ps.run_low?.toFixed(5) || '—'}</td>
        <td style="text-align:right;color:var(--red)">${ps.sell_entry?.toFixed(5) || '—'}</td>
        <td style="text-align:right;color:var(--green)">${ps.buy_entry?.toFixed(5) || '—'}</td>
        <td style="text-align:right">${ps.hl50_pct != null ? ps.hl50_pct.toFixed(3) + '%' : '—'}</td>
        <td style="text-align:right">${ps.sigma_d_pct != null ? ps.sigma_d_pct.toFixed(3) + '%' : '—'}</td>
        <td>${posHtml}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows;
  } catch (e) {
    const tbody = document.getElementById('daStatusBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="padding:16px;color:var(--red)">Error: ${e.message}</td></tr>`;
  }
}

window.saveDaConfig     = saveDaConfig;
window.resetDaDefaults  = resetDaDefaults;
window.saveDaCreds      = saveDaCreds;
window.daForceUnlock    = daForceUnlock;

// ── Gold Bot ──────────────────────────────────────────────────────────────────

const GOLD_DEFAULTS = {
  enabled:                true,
  paper_mode:             true,
  min_zone_score:         3.0,
  proximity_pips:         5.0,
  vu_min_components:      2,
  risk_pct:               0.5,
  tp1_r:                  1.0,
  tp2_r:                  2.0,
  htf_aligned_tp2_r:      3.0,
  htf_opposed_tp2_r:      1.5,
  sl_atr_mult:            1.5,
  max_sl_pips:            40,
  max_trades_per_day:     2,
  trade_window_start:     '07:00',
  trade_window_end:       '20:00',
  cooldown_minutes:       30,
  gold_macro_gate:        true,
  htf_block:              true,
  htf_block_confidence:   0.5,
};

let _goldCfg = JSON.parse(JSON.stringify(GOLD_DEFAULTS));

function readGoldForm() {
  _goldCfg.enabled               = chk('gold_enabled');
  _goldCfg.paper_mode            = chk('gold_paper_mode');
  _goldCfg.gold_macro_gate       = chk('gold_macro_gate');
  _goldCfg.htf_block             = chk('gold_htf_block');
  _goldCfg.htf_block_confidence  = num('gold_htf_block_confidence',  0.5);
  _goldCfg.min_zone_score        = num('gold_min_zone_score',         3.0);
  _goldCfg.proximity_pips        = num('gold_proximity_pips',         5.0);
  _goldCfg.vu_min_components     = parseInt(radio('gold_vu_min',      '2'), 10);
  _goldCfg.sl_atr_mult           = num('gold_sl_atr_mult',            1.5);
  _goldCfg.max_sl_pips           = num('gold_max_sl_pips',            40);
  _goldCfg.tp1_r                 = num('gold_tp1_r',                  1.0);
  _goldCfg.tp2_r                 = num('gold_tp2_r',                  2.0);
  _goldCfg.htf_aligned_tp2_r     = num('gold_htf_aligned_tp2_r',      3.0);
  _goldCfg.htf_opposed_tp2_r     = num('gold_htf_opposed_tp2_r',      1.5);
  _goldCfg.risk_pct              = num('gold_risk_pct',               0.5);
  _goldCfg.max_trades_per_day    = num('gold_max_trades_per_day',     2);
  _goldCfg.trade_window_start    = str('gold_window_start',           '07:00');
  _goldCfg.trade_window_end      = str('gold_window_end',             '20:00');
  _goldCfg.cooldown_minutes      = num('gold_cooldown_minutes',       30);
}

function renderGoldForm() {
  setChk('gold_enabled',              _goldCfg.enabled               ?? true);
  setChk('gold_paper_mode',           _goldCfg.paper_mode            ?? true);
  setChk('gold_macro_gate',           _goldCfg.gold_macro_gate       ?? true);
  setChk('gold_htf_block',            _goldCfg.htf_block             ?? true);
  setVal('gold_htf_block_confidence', _goldCfg.htf_block_confidence  ?? 0.5);
  setVal('gold_min_zone_score',       _goldCfg.min_zone_score        ?? 3.0);
  setVal('gold_proximity_pips',       _goldCfg.proximity_pips        ?? 5.0);
  setRadio('gold_vu_min',             String(_goldCfg.vu_min_components ?? 2));
  setVal('gold_sl_atr_mult',          _goldCfg.sl_atr_mult           ?? 1.5);
  setVal('gold_max_sl_pips',          _goldCfg.max_sl_pips           ?? 40);
  setVal('gold_tp1_r',                _goldCfg.tp1_r                 ?? 1.0);
  setVal('gold_tp2_r',                _goldCfg.tp2_r                 ?? 2.0);
  setVal('gold_htf_aligned_tp2_r',    _goldCfg.htf_aligned_tp2_r     ?? 3.0);
  setVal('gold_htf_opposed_tp2_r',    _goldCfg.htf_opposed_tp2_r     ?? 1.5);
  setVal('gold_risk_pct',             _goldCfg.risk_pct              ?? 0.5);
  setVal('gold_max_trades_per_day',   _goldCfg.max_trades_per_day    ?? 2);
  setVal('gold_window_start',         _goldCfg.trade_window_start    ?? '07:00');
  setVal('gold_window_end',           _goldCfg.trade_window_end      ?? '20:00');
  setVal('gold_cooldown_minutes',     _goldCfg.cooldown_minutes      ?? 30);
}

async function loadGoldConfig() {
  try {
    const stored = await kvGet('gold_bot_config');
    if (stored) { _goldCfg = { ...JSON.parse(JSON.stringify(GOLD_DEFAULTS)), ...stored }; }
    renderGoldForm();
  } catch (e) { /* non-critical */ }
}

async function saveGoldConfig() {
  readGoldForm();
  const el = document.getElementById('goldSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('gold_bot_config', _goldCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#f4c430'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetGoldDefaults() {
  _goldCfg = JSON.parse(JSON.stringify(GOLD_DEFAULTS));
  renderGoldForm();
  const el = document.getElementById('goldSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadGoldStatus() {
  try {
    const data = await kvGet('gold_bot_status');
    if (!data) { setText('goldBsAge', 'No status — bot has not run yet'); return; }

    const ts  = data.timestamp ? new Date(data.timestamp).getTime() : 0;
    const age = Math.round((Date.now() - ts) / 60000);
    setText('goldBsAge',   age < 2 ? 'Live' : `Last update ${age}m ago`);
    setText('goldBsMode',  data.paper_mode ? '· paper' : '· LIVE');
    setText('goldBsState', data.state ? `· ${data.state}` : '');
    setText('goldBsHTF',   data.htf_bias ? `· HTF ${data.htf_bias}` : '');

    const zonesEl = document.getElementById('goldBsZones');
    if (zonesEl) {
      const zones = data.top_zones ?? [];
      if (zones.length) {
        zonesEl.innerHTML = zones.map(z => {
          const col = z.dir === 'long' ? 'bs-green' : 'bs-red';
          return `<span class="${col}">${z.zone_id} ${z.gp} score=${z.score}</span>`;
        }).join('');
      } else {
        zonesEl.innerHTML = '<span class="bs-dim">No active zones</span>';
      }
    }

    const tradesEl = document.getElementById('goldBsTrades');
    if (tradesEl) {
      const parts = [];
      if (data.trades_today != null) parts.push(`trades today: ${data.trades_today}`);
      if (data.squeeze_ratio != null) parts.push(`squeeze: ${data.squeeze_ratio.toFixed(2)}`);
      const pos = data.mt5_positions ?? [];
      pos.forEach(p => {
        const col = p.direction === 'BUY' ? 'bs-green' : 'bs-red';
        const pnl = p.profit != null ? ` $${p.profit > 0 ? '+' : ''}${p.profit.toFixed(2)}` : '';
        parts.push(`<span class="${col}">${p.symbol} ${p.direction} @ ${p.open_price}${pnl}</span>`);
      });
      tradesEl.innerHTML = parts.join(' · ') || '';
    }
  } catch (e) { /* non-critical */ }
}

window.saveGoldConfig   = saveGoldConfig;
window.resetGoldDefaults = resetGoldDefaults;

// ── Gold Bot V2 (level-matrix edition) ────────────────────────────────────────
// KV: gold_v2_config / gold_v2_credentials / gold_v2_status. Field names must
// match GoldV2/main.py DEFAULT_CFG exactly — the bot merges KV over defaults.

const GOLDV2_DEFAULTS = {
  enabled:                     true,
  paper_mode:                  true,
  // level matrix / entry gate
  min_zone_score:              4.0,
  cluster_tolerance:           3.0,
  min_distinct_legs:           1,
  proximity_pips:              5.0,
  max_armed_zones:             3,
  include_retests:             true,
  // confirmation
  vu_min_components:           2,
  vu_require_wt:               true,
  mf_fuel_veto:                true,
  // exits
  max_sl_pips:                 40,
  sl_buffer_atr:               0.3,
  tp1_r_min:                   1.0,
  tp2_r_min:                   1.5,
  tp2_r_max:                   4.0,
  range_cap_mult:              1.2,
  be_after_tp1:                true,
  allow_overnight_htf_aligned: true,
  // portfolio / risk
  risk_pct:                    0.5,
  max_trades_per_day:          4,
  max_concurrent_trades:       2,
  max_open_risk_pct:           1.0,
  max_per_direction:           2,
  min_entry_separation_pips:   15,
  cooldown_minutes:            30,
  global_cooldown_minutes:     10,
  // session
  trade_window_start:          '07:00',
  trade_window_end:            '20:00',
  // gates
  gold_macro_gate:             true,
  ml_gate:                     false,
  htf_block:                   true,
  htf_block_confidence:        0.5,
  use_vol_forecast:            true,
};

let _goldV2Cfg = JSON.parse(JSON.stringify(GOLDV2_DEFAULTS));

function readGoldV2Form() {
  _goldV2Cfg.enabled                     = chk('goldv2_enabled');
  _goldV2Cfg.paper_mode                  = chk('goldv2_paper_mode');
  _goldV2Cfg.gold_macro_gate             = chk('goldv2_macro_gate');
  _goldV2Cfg.ml_gate                     = chk('goldv2_ml_gate');
  _goldV2Cfg.htf_block                   = chk('goldv2_htf_block');
  _goldV2Cfg.use_vol_forecast            = chk('goldv2_use_vol_forecast');
  _goldV2Cfg.htf_block_confidence        = num('goldv2_htf_block_confidence', 0.5);
  _goldV2Cfg.trade_window_start          = str('goldv2_window_start', '07:00');
  _goldV2Cfg.trade_window_end            = str('goldv2_window_end',   '20:00');
  _goldV2Cfg.min_zone_score              = num('goldv2_min_zone_score',     4.0);
  _goldV2Cfg.cluster_tolerance           = num('goldv2_cluster_tolerance',  3.0);
  _goldV2Cfg.min_distinct_legs           = parseInt(num('goldv2_min_distinct_legs', 1), 10);
  _goldV2Cfg.proximity_pips              = num('goldv2_proximity_pips',     5.0);
  _goldV2Cfg.max_armed_zones             = parseInt(num('goldv2_max_armed_zones', 3), 10);
  _goldV2Cfg.include_retests             = chk('goldv2_include_retests');
  _goldV2Cfg.vu_min_components           = parseInt(radio('goldv2_vu_min', '2'), 10);
  _goldV2Cfg.vu_require_wt               = chk('goldv2_vu_require_wt');
  _goldV2Cfg.mf_fuel_veto                = chk('goldv2_mf_fuel_veto');
  _goldV2Cfg.max_sl_pips                 = num('goldv2_max_sl_pips',    40);
  _goldV2Cfg.sl_buffer_atr               = num('goldv2_sl_buffer_atr', 0.3);
  _goldV2Cfg.tp1_r_min                   = num('goldv2_tp1_r_min',     1.0);
  _goldV2Cfg.tp2_r_min                   = num('goldv2_tp2_r_min',     1.5);
  _goldV2Cfg.tp2_r_max                   = num('goldv2_tp2_r_max',     4.0);
  _goldV2Cfg.range_cap_mult              = num('goldv2_range_cap_mult', 1.2);
  _goldV2Cfg.be_after_tp1                = chk('goldv2_be_after_tp1');
  _goldV2Cfg.allow_overnight_htf_aligned = chk('goldv2_allow_overnight');
  _goldV2Cfg.risk_pct                    = num('goldv2_risk_pct',           0.5);
  _goldV2Cfg.max_trades_per_day          = parseInt(num('goldv2_max_trades_per_day', 4), 10);
  _goldV2Cfg.max_concurrent_trades       = parseInt(num('goldv2_max_concurrent', 2), 10);
  _goldV2Cfg.max_open_risk_pct           = num('goldv2_max_open_risk',      1.0);
  _goldV2Cfg.max_per_direction           = parseInt(num('goldv2_max_per_direction', 2), 10);
  _goldV2Cfg.min_entry_separation_pips   = num('goldv2_min_entry_sep',      15);
  _goldV2Cfg.cooldown_minutes            = num('goldv2_cooldown_minutes',   30);
  _goldV2Cfg.global_cooldown_minutes     = num('goldv2_global_cooldown',    10);
}

function renderGoldV2Form() {
  setChk('goldv2_enabled',              _goldV2Cfg.enabled                     ?? true);
  setChk('goldv2_paper_mode',           _goldV2Cfg.paper_mode                  ?? true);
  setChk('goldv2_macro_gate',           _goldV2Cfg.gold_macro_gate             ?? true);
  setChk('goldv2_ml_gate',              _goldV2Cfg.ml_gate                     ?? false);
  setChk('goldv2_htf_block',            _goldV2Cfg.htf_block                   ?? true);
  setChk('goldv2_use_vol_forecast',     _goldV2Cfg.use_vol_forecast            ?? true);
  setVal('goldv2_htf_block_confidence', _goldV2Cfg.htf_block_confidence        ?? 0.5);
  setVal('goldv2_window_start',         _goldV2Cfg.trade_window_start          ?? '07:00');
  setVal('goldv2_window_end',           _goldV2Cfg.trade_window_end            ?? '20:00');
  setVal('goldv2_min_zone_score',       _goldV2Cfg.min_zone_score              ?? 4.0);
  setVal('goldv2_cluster_tolerance',    _goldV2Cfg.cluster_tolerance           ?? 3.0);
  setVal('goldv2_min_distinct_legs',    _goldV2Cfg.min_distinct_legs           ?? 1);
  setVal('goldv2_proximity_pips',       _goldV2Cfg.proximity_pips              ?? 5.0);
  setVal('goldv2_max_armed_zones',      _goldV2Cfg.max_armed_zones             ?? 3);
  setChk('goldv2_include_retests',      _goldV2Cfg.include_retests             ?? true);
  setRadio('goldv2_vu_min',             String(_goldV2Cfg.vu_min_components    ?? 2));
  setChk('goldv2_vu_require_wt',        _goldV2Cfg.vu_require_wt               ?? true);
  setChk('goldv2_mf_fuel_veto',         _goldV2Cfg.mf_fuel_veto                ?? true);
  setVal('goldv2_max_sl_pips',          _goldV2Cfg.max_sl_pips                 ?? 40);
  setVal('goldv2_sl_buffer_atr',        _goldV2Cfg.sl_buffer_atr               ?? 0.3);
  setVal('goldv2_tp1_r_min',            _goldV2Cfg.tp1_r_min                   ?? 1.0);
  setVal('goldv2_tp2_r_min',            _goldV2Cfg.tp2_r_min                   ?? 1.5);
  setVal('goldv2_tp2_r_max',            _goldV2Cfg.tp2_r_max                   ?? 4.0);
  setVal('goldv2_range_cap_mult',       _goldV2Cfg.range_cap_mult              ?? 1.2);
  setChk('goldv2_be_after_tp1',         _goldV2Cfg.be_after_tp1                ?? true);
  setChk('goldv2_allow_overnight',      _goldV2Cfg.allow_overnight_htf_aligned ?? true);
  setVal('goldv2_risk_pct',             _goldV2Cfg.risk_pct                    ?? 0.5);
  setVal('goldv2_max_trades_per_day',   _goldV2Cfg.max_trades_per_day          ?? 4);
  setVal('goldv2_max_concurrent',       _goldV2Cfg.max_concurrent_trades       ?? 2);
  setVal('goldv2_max_open_risk',        _goldV2Cfg.max_open_risk_pct           ?? 1.0);
  setVal('goldv2_max_per_direction',    _goldV2Cfg.max_per_direction           ?? 2);
  setVal('goldv2_min_entry_sep',        _goldV2Cfg.min_entry_separation_pips   ?? 15);
  setVal('goldv2_cooldown_minutes',     _goldV2Cfg.cooldown_minutes            ?? 30);
  setVal('goldv2_global_cooldown',      _goldV2Cfg.global_cooldown_minutes     ?? 10);
}

async function loadGoldV2Config() {
  try {
    const stored = await kvGet('gold_v2_config');
    if (stored) { _goldV2Cfg = { ...JSON.parse(JSON.stringify(GOLDV2_DEFAULTS)), ...stored }; }
    renderGoldV2Form();
  } catch (e) { /* non-critical */ }
}

async function saveGoldV2Config() {
  readGoldV2Form();
  const el = document.getElementById('goldv2SaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('gold_v2_config', _goldV2Cfg);
    if (el) { el.textContent = 'Saved ✓ — bot picks up within 2 min'; el.style.color = '#ff9f43'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 4000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetGoldV2Defaults() {
  _goldV2Cfg = JSON.parse(JSON.stringify(GOLDV2_DEFAULTS));
  renderGoldV2Form();
  const el = document.getElementById('goldv2SaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadGoldV2Creds() {
  try { _applyCredsToForm(await kvGet('gold_v2_credentials'), 'goldv2_', 'goldv2_mt5_password'); } catch (e) {}
}
async function saveGoldV2Creds() {
  await _saveCreds('gold_v2_credentials', 'goldv2_', 'goldv2_mt5_password', 'goldv2CredsStatus');
}

async function loadGoldV2Status() {
  try {
    const data = await kvGet('gold_v2_status');
    if (!data) { setText('goldv2BsAge', 'No status — bot has not run yet'); return; }

    const ts  = data.timestamp ? new Date(data.timestamp).getTime() : 0;
    const age = Math.round((Date.now() - ts) / 60000);
    setText('goldv2BsAge',   age < 3 ? 'Live' : `Last update ${age}m ago`);
    setText('goldv2BsMode',  data.paper_mode ? '· paper' : '· LIVE');
    setText('goldv2BsState', data.state ? `· ${data.state}` : '');
    setText('goldv2BsHTF',   data.htf_bias
      ? `· HTF ${data.htf_bias}${data.htf_detail ? ` (${data.htf_detail})` : ''}` : '');

    const zonesEl = document.getElementById('goldv2BsZones');
    if (zonesEl) {
      const zones = data.top_zones ?? [];
      let html = zones.length
        ? zones.map(z => {
            const col = z.dir === 'long' ? 'bs-green' : 'bs-red';
            const gp  = z.in_gp ? ' ◆GP' : '';
            return `<span class="${col}">${z.zone_id} ${z.entry_window} score=${z.score} legs=${z.legs}${gp}</span>`;
          }).join('')
        : '<span class="bs-dim">No active zones</span>';
      // Armed-zone confirmation verdicts — why an armed zone has(n't) entered yet
      for (const [zid, d] of Object.entries(data.armed_detail ?? {})) {
        const w = d && typeof d === 'object' ? d.watch : null;
        if (!w) continue;
        const col = w.veto ? 'bs-red' : (w.verdict ?? '').startsWith('CONFIRMED') ? 'bs-green' : 'bs-dim';
        html += `<span class="${col}">👁 ${zid}: ${w.verdict}</span>`;
      }
      zonesEl.innerHTML = html;
    }

    const tradesEl = document.getElementById('goldv2BsTrades');
    if (tradesEl) {
      const parts = [];
      if (data.trades_today != null) parts.push(`trades today: ${data.trades_today}`);
      if (data.open_trades  != null) parts.push(`open: ${data.open_trades}`);
      if (data.squeeze_ratio != null) parts.push(`squeeze: ${data.squeeze_ratio.toFixed(2)}`);
      if (data.vol_forecast?.expected_range != null)
        parts.push(`σ range: ${data.vol_forecast.expected_range}p`);
      (data.mt5_positions ?? []).forEach(p => {
        const col = p.direction === 'BUY' ? 'bs-green' : 'bs-red';
        const pnl = p.profit != null ? ` $${p.profit > 0 ? '+' : ''}${p.profit.toFixed(2)}` : '';
        parts.push(`<span class="${col}">${p.symbol} ${p.direction} @ ${p.open_price}${pnl}</span>`);
      });
      tradesEl.innerHTML = parts.join(' · ') || '';
    }
  } catch (e) { /* non-critical */ }
}

window.saveGoldV2Config    = saveGoldV2Config;
window.resetGoldV2Defaults = resetGoldV2Defaults;
window.saveGoldV2Creds     = saveGoldV2Creds;

// ── Confluence Bot (multi-instrument) ───────────────────────────────────────────
// KV: confluence_bot_config / confluence_bot_credentials / confluence_bot_status.
// Field names must match ConfluenceBot/main.py DEFAULT_CFG exactly — the bot
// merges KV over defaults. Distances are in PIPS (scaled per instrument).

const CONFLUENCE_DEFAULTS = {
  enabled:                     true,
  paper_mode:                  true,
  // universe
  pairs: ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','NZD/USD','USD/CAD','USD/CHF',
          'EUR/GBP','EUR/JPY','GBP/JPY','AUD/JPY','EUR/AUD','GOLD','NQ','SPX','DAX','DOW'],
  broker_overrides:            {},
  // level matrix / entry gate (pips)
  min_zone_score:              4.0,
  cluster_tolerance:           3.0,
  min_distinct_legs:           1,
  proximity_pips:              5.0,
  max_armed_zones:             3,
  include_retests:             true,
  bucket_pips:                 0.5,
  // confirmation
  vu_min_components:           2,
  vu_require_wt:               true,
  mf_fuel_veto:                true,
  // exits (pips)
  max_sl_pips:                 40,
  min_sl_pips:                 4,
  sl_buffer_atr:               0.3,
  tp1_r_min:                   1.0,
  tp2_r_min:                   1.5,
  tp2_r_max:                   4.0,
  range_cap_mult:              1.2,
  be_after_tp1:                true,
  allow_overnight_htf_aligned: true,
  // risk — per instrument
  risk_pct:                    0.5,
  max_lot:                     5.0,
  max_trades_per_day:          4,
  max_concurrent_trades:       2,
  max_open_risk_pct:           1.0,
  max_per_direction:           2,
  min_entry_separation_pips:   15,
  cooldown_minutes:            30,
  global_cooldown_minutes:     10,
  // risk — global
  max_total_open_trades:       6,
  max_total_open_risk_pct:     3.0,
  max_total_per_direction:     5,
  // session
  trade_window_start:          '07:00',
  trade_window_end:            '20:00',
  // gates
  gold_macro_gate:             true,
  ml_gate:                     false,
  htf_block:                   true,
  htf_block_confidence:        0.5,
  use_vol_forecast:            true,
  use_oi:                      true,
  // data
  m1_lookback_bars:            18500,
};

let _cfCfg = JSON.parse(JSON.stringify(CONFLUENCE_DEFAULTS));

function _cfParsePairs() {
  const raw = (document.getElementById('confluence_pairs')?.value ?? '');
  return raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}

function readConfluenceForm() {
  _cfCfg.enabled                     = chk('confluence_enabled');
  _cfCfg.paper_mode                  = chk('confluence_paper_mode');
  _cfCfg.gold_macro_gate             = chk('confluence_macro_gate');
  _cfCfg.ml_gate                     = chk('confluence_ml_gate');
  _cfCfg.htf_block                   = chk('confluence_htf_block');
  _cfCfg.use_vol_forecast            = chk('confluence_use_vol_forecast');
  _cfCfg.use_oi                      = chk('confluence_use_oi');
  _cfCfg.htf_block_confidence        = num('confluence_htf_block_confidence', 0.5);
  _cfCfg.trade_window_start          = str('confluence_window_start', '07:00');
  _cfCfg.trade_window_end            = str('confluence_window_end',   '20:00');
  _cfCfg.pairs                       = _cfParsePairs();
  try { _cfCfg.broker_overrides = JSON.parse(str('confluence_broker_overrides', '{}') || '{}'); }
  catch (e) { _cfCfg.broker_overrides = {}; }
  _cfCfg.min_zone_score              = num('confluence_min_zone_score',    4.0);
  _cfCfg.cluster_tolerance           = num('confluence_cluster_tolerance', 3.0);
  _cfCfg.min_distinct_legs           = parseInt(num('confluence_min_distinct_legs', 1), 10);
  _cfCfg.proximity_pips              = num('confluence_proximity_pips',    5.0);
  _cfCfg.max_armed_zones             = parseInt(num('confluence_max_armed_zones', 3), 10);
  _cfCfg.bucket_pips                 = num('confluence_bucket_pips',       0.5);
  _cfCfg.include_retests             = chk('confluence_include_retests');
  _cfCfg.vu_min_components           = parseInt(radio('confluence_vu_min', '2'), 10);
  _cfCfg.vu_require_wt               = chk('confluence_vu_require_wt');
  _cfCfg.mf_fuel_veto                = chk('confluence_mf_fuel_veto');
  _cfCfg.m1_lookback_bars            = parseInt(num('confluence_m1_lookback_bars', 18500), 10);
  _cfCfg.max_sl_pips                 = num('confluence_max_sl_pips',   40);
  _cfCfg.min_sl_pips                 = num('confluence_min_sl_pips',    4);
  _cfCfg.sl_buffer_atr               = num('confluence_sl_buffer_atr', 0.3);
  _cfCfg.tp1_r_min                   = num('confluence_tp1_r_min',     1.0);
  _cfCfg.tp2_r_min                   = num('confluence_tp2_r_min',     1.5);
  _cfCfg.tp2_r_max                   = num('confluence_tp2_r_max',     4.0);
  _cfCfg.range_cap_mult              = num('confluence_range_cap_mult', 1.2);
  _cfCfg.be_after_tp1                = chk('confluence_be_after_tp1');
  _cfCfg.allow_overnight_htf_aligned = chk('confluence_allow_overnight');
  _cfCfg.risk_pct                    = num('confluence_risk_pct',          0.5);
  _cfCfg.max_lot                     = num('confluence_max_lot',           5.0);
  _cfCfg.max_trades_per_day          = parseInt(num('confluence_max_trades_per_day', 4), 10);
  _cfCfg.max_concurrent_trades       = parseInt(num('confluence_max_concurrent', 2), 10);
  _cfCfg.max_open_risk_pct           = num('confluence_max_open_risk',     1.0);
  _cfCfg.max_per_direction           = parseInt(num('confluence_max_per_direction', 2), 10);
  _cfCfg.min_entry_separation_pips   = num('confluence_min_entry_sep',     15);
  _cfCfg.cooldown_minutes            = num('confluence_cooldown_minutes',  30);
  _cfCfg.global_cooldown_minutes     = num('confluence_global_cooldown',   10);
  _cfCfg.max_total_open_trades       = parseInt(num('confluence_max_total_open', 6), 10);
  _cfCfg.max_total_open_risk_pct     = num('confluence_max_total_risk',    3.0);
  _cfCfg.max_total_per_direction     = parseInt(num('confluence_max_total_per_dir', 5), 10);
}

function renderConfluenceForm() {
  setChk('confluence_enabled',              _cfCfg.enabled                     ?? true);
  setChk('confluence_paper_mode',           _cfCfg.paper_mode                  ?? true);
  setChk('confluence_macro_gate',           _cfCfg.gold_macro_gate             ?? true);
  setChk('confluence_ml_gate',              _cfCfg.ml_gate                     ?? false);
  setChk('confluence_htf_block',            _cfCfg.htf_block                   ?? true);
  setChk('confluence_use_vol_forecast',     _cfCfg.use_vol_forecast            ?? true);
  setChk('confluence_use_oi',               _cfCfg.use_oi                      ?? true);
  setVal('confluence_htf_block_confidence', _cfCfg.htf_block_confidence        ?? 0.5);
  setVal('confluence_window_start',         _cfCfg.trade_window_start          ?? '07:00');
  setVal('confluence_window_end',           _cfCfg.trade_window_end            ?? '20:00');
  const pairsEl = document.getElementById('confluence_pairs');
  if (pairsEl) pairsEl.value = (_cfCfg.pairs ?? []).join('\n');
  setVal('confluence_broker_overrides',     JSON.stringify(_cfCfg.broker_overrides ?? {}));
  setVal('confluence_min_zone_score',       _cfCfg.min_zone_score              ?? 4.0);
  setVal('confluence_cluster_tolerance',    _cfCfg.cluster_tolerance           ?? 3.0);
  setVal('confluence_min_distinct_legs',    _cfCfg.min_distinct_legs           ?? 1);
  setVal('confluence_proximity_pips',       _cfCfg.proximity_pips              ?? 5.0);
  setVal('confluence_max_armed_zones',      _cfCfg.max_armed_zones             ?? 3);
  setVal('confluence_bucket_pips',          _cfCfg.bucket_pips                 ?? 0.5);
  setChk('confluence_include_retests',      _cfCfg.include_retests             ?? true);
  setRadio('confluence_vu_min',             String(_cfCfg.vu_min_components    ?? 2));
  setChk('confluence_vu_require_wt',        _cfCfg.vu_require_wt               ?? true);
  setChk('confluence_mf_fuel_veto',         _cfCfg.mf_fuel_veto                ?? true);
  setVal('confluence_m1_lookback_bars',     _cfCfg.m1_lookback_bars            ?? 18500);
  setVal('confluence_max_sl_pips',          _cfCfg.max_sl_pips                 ?? 40);
  setVal('confluence_min_sl_pips',          _cfCfg.min_sl_pips                 ?? 4);
  setVal('confluence_sl_buffer_atr',        _cfCfg.sl_buffer_atr               ?? 0.3);
  setVal('confluence_tp1_r_min',            _cfCfg.tp1_r_min                   ?? 1.0);
  setVal('confluence_tp2_r_min',            _cfCfg.tp2_r_min                   ?? 1.5);
  setVal('confluence_tp2_r_max',            _cfCfg.tp2_r_max                   ?? 4.0);
  setVal('confluence_range_cap_mult',       _cfCfg.range_cap_mult              ?? 1.2);
  setChk('confluence_be_after_tp1',         _cfCfg.be_after_tp1                ?? true);
  setChk('confluence_allow_overnight',      _cfCfg.allow_overnight_htf_aligned ?? true);
  setVal('confluence_risk_pct',             _cfCfg.risk_pct                    ?? 0.5);
  setVal('confluence_max_lot',              _cfCfg.max_lot                     ?? 5.0);
  setVal('confluence_max_trades_per_day',   _cfCfg.max_trades_per_day          ?? 4);
  setVal('confluence_max_concurrent',       _cfCfg.max_concurrent_trades       ?? 2);
  setVal('confluence_max_open_risk',        _cfCfg.max_open_risk_pct           ?? 1.0);
  setVal('confluence_max_per_direction',    _cfCfg.max_per_direction           ?? 2);
  setVal('confluence_min_entry_sep',        _cfCfg.min_entry_separation_pips   ?? 15);
  setVal('confluence_cooldown_minutes',     _cfCfg.cooldown_minutes            ?? 30);
  setVal('confluence_global_cooldown',      _cfCfg.global_cooldown_minutes     ?? 10);
  setVal('confluence_max_total_open',       _cfCfg.max_total_open_trades       ?? 6);
  setVal('confluence_max_total_risk',       _cfCfg.max_total_open_risk_pct     ?? 3.0);
  setVal('confluence_max_total_per_dir',    _cfCfg.max_total_per_direction     ?? 5);
}

async function loadConfluenceConfig() {
  try {
    const stored = await kvGet('confluence_bot_config');
    if (stored) { _cfCfg = { ...JSON.parse(JSON.stringify(CONFLUENCE_DEFAULTS)), ...stored }; }
    renderConfluenceForm();
  } catch (e) { /* non-critical */ }
}

async function saveConfluenceConfig() {
  readConfluenceForm();
  const el = document.getElementById('confluenceSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('confluence_bot_config', _cfCfg);
    if (el) { el.textContent = `Saved ✓ (${_cfCfg.pairs.length} pairs) — bot picks up within 2 min`; el.style.color = '#c084fc'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 4000);
  } catch (e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetConfluenceDefaults() {
  _cfCfg = JSON.parse(JSON.stringify(CONFLUENCE_DEFAULTS));
  renderConfluenceForm();
  const el = document.getElementById('confluenceSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadConfluenceCreds() {
  try { _applyCredsToForm(await kvGet('confluence_bot_credentials'), 'confluence_', 'confluence_mt5_password'); } catch (e) {}
}
async function saveConfluenceCreds() {
  await _saveCreds('confluence_bot_credentials', 'confluence_', 'confluence_mt5_password', 'confluenceCredsStatus');
}

async function loadConfluenceStatus() {
  try {
    const data = await kvGet('confluence_bot_status');
    if (!data) { setText('cfBsAge', 'No status — bot has not run yet'); return; }

    const ts  = data.timestamp ? new Date(data.timestamp).getTime()
              : (data.pushed_at ? data.pushed_at * 1000 : 0);
    const age = Math.round((Date.now() - ts) / 60000);
    setText('cfBsAge',   age < 3 ? 'Live' : `Last update ${age}m ago`);
    setText('cfBsMode',  data.paper_mode ? '· paper' : '· LIVE');
    setText('cfBsState', data.state ? `· ${data.state}` : '');
    setText('cfBsCount', `· ${data.instruments ?? 0} instruments · ${data.open_trades ?? 0} open · ${data.trades_today ?? 0} today`);

    const symEl = document.getElementById('cfBsSymbols');
    if (symEl) {
      const syms = data.symbols ?? [];
      symEl.innerHTML = syms.length
        ? syms.map(s => {
            const active = s.state === 'MANAGING' ? 'bs-green' : s.state === 'ARMED' ? 'bs-amber' : 'bs-dim';
            const htf = s.htf_bias && s.htf_bias !== 'UNKNOWN' ? ` ${s.htf_bias}` : '';
            return `<span class="${active}" title="${s.symbol}">${s.instrument}: ${s.state}${htf} · z${s.zones_active ?? 0}${s.open_trades ? ` · ${s.open_trades} open` : ''}</span>`;
          }).join('')
        : '<span class="bs-dim">No instruments active</span>';
    }

    const tradesEl = document.getElementById('cfBsTrades');
    if (tradesEl) {
      const parts = [];
      (data.mt5_positions ?? []).forEach(p => {
        const col = p.direction === 'BUY' ? 'bs-green' : 'bs-red';
        const pnl = p.profit != null ? ` $${p.profit > 0 ? '+' : ''}${p.profit.toFixed(2)}` : '';
        parts.push(`<span class="${col}">${p.symbol} ${p.direction} @ ${p.open_price}${pnl}</span>`);
      });
      tradesEl.innerHTML = parts.join(' · ') || '';
    }
  } catch (e) { /* non-critical */ }
}

window.saveConfluenceConfig    = saveConfluenceConfig;
window.resetConfluenceDefaults = resetConfluenceDefaults;
window.saveConfluenceCreds     = saveConfluenceCreds;

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('unlockBtn')?.addEventListener('click', forceUnlock);

// Persistence health — warn loudly if bot config/credentials won't survive a
// redeploy (the ephemeral file backend, the "account details keep being lost" bug).
async function checkKvHealth() {
  try {
    const r = await fetch('/api/kv-health');
    const h = await r.json();
    const el = document.getElementById('kvHealthBanner');
    if (!el || !h || !h.ok) return;
    let msg = null;
    if (!h.persistent) {
      // Durable backend entirely off — everything is ephemeral.
      msg = '⚠ Config & MT5 credentials are NOT persistent — they will be wiped on the next redeploy. '
        + 'Set CF_ACCOUNT_ID + CF_API_TOKEN in the Railway env (or mount a volume at DATA_DIR) to fix.';
    } else if (typeof h.roundTrip === 'string' && /^FAILED/i.test(h.roundTrip)) {
      // Durable backend is configured but a LIVE write test failed — saves are
      // silently falling back to the ephemeral store (this is the "config looked
      // saved but vanished on redeploy" case the plain on/off check misses).
      msg = '⚠ The durable store (Cloudflare KV) is configured but a LIVE write test FAILED — saves are '
        + 'silently falling back to the ephemeral store and will be wiped on redeploy. '
        + 'Check the CF_API_TOKEN scope / namespace. Details: ' + h.roundTrip;
    }
    if (msg) { el.textContent = msg; el.style.display = 'block'; }
  } catch (e) {}
}
checkKvHealth();

loadConfig();
loadBtConfig();
loadRgConfig();
loadRgV2Config();
loadRgV7Config();
loadDaConfig();
loadGoldConfig();
loadGoldV2Config();
loadConfluenceConfig();
loadCreds();
loadBtCreds();
loadRgCreds();
loadRgV2Creds();
loadRgV7Creds();
loadDaCreds();
loadGoldV2Creds();
loadConfluenceCreds();
loadBotStatus();
loadBtBotStatus();
loadRgBotStatus();
loadRgV2Status();
loadRgV7Status();
// ── Hedge Bot ─────────────────────────────────────────────────────────────────

const HB_DEFAULTS = {
  enabled:          true,
  paper_mode:       true,
  interval_secs:    30,
  risk_pct:         0.5,
  sl_pips:          200,
  sl_pips_gold:     1500,
  max_lot:          5.0,
  max_spread_pips:  3.0,
  min_z_score:      2.0,
  max_open_signals: 3,
};

let _hbCfg = { ...HB_DEFAULTS };

function readHbForm() {
  _hbCfg.enabled          = chk('hb_enabled');
  _hbCfg.paper_mode       = chk('hb_paper_mode');
  _hbCfg.interval_secs    = num('hb_interval_secs',    30);
  _hbCfg.risk_pct         = num('hb_risk_pct',         0.5);
  _hbCfg.sl_pips          = num('hb_sl_pips',          200);
  _hbCfg.sl_pips_gold     = num('hb_sl_pips_gold',     1500);
  _hbCfg.max_lot          = num('hb_max_lot',          5.0);
  _hbCfg.max_spread_pips  = num('hb_max_spread_pips',  3.0);
  _hbCfg.min_z_score      = num('hb_min_z_score',      2.0);
  _hbCfg.max_open_signals = num('hb_max_open_signals', 3);
}

function renderHbForm() {
  setChk('hb_enabled',          _hbCfg.enabled          ?? true);
  setChk('hb_paper_mode',       _hbCfg.paper_mode       ?? true);
  setVal('hb_interval_secs',    _hbCfg.interval_secs    ?? 30);
  setVal('hb_risk_pct',         _hbCfg.risk_pct         ?? 0.5);
  setVal('hb_sl_pips',          _hbCfg.sl_pips          ?? 200);
  setVal('hb_sl_pips_gold',     _hbCfg.sl_pips_gold     ?? 1500);
  setVal('hb_max_lot',          _hbCfg.max_lot          ?? 5.0);
  setVal('hb_max_spread_pips',  _hbCfg.max_spread_pips  ?? 3.0);
  setVal('hb_min_z_score',      _hbCfg.min_z_score      ?? 2.0);
  setVal('hb_max_open_signals', _hbCfg.max_open_signals ?? 3);
}

async function loadHbConfig() {
  try {
    const stored = await kvGet('hedge_bot_config');
    if (stored) _hbCfg = { ...HB_DEFAULTS, ...stored };
    renderHbForm();
  } catch(e) { /* non-critical */ }
}

async function saveHbConfig() {
  readHbForm();
  const el = document.getElementById('hbSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('hedge_bot_config', _hbCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#06b6d4'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch(e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetHbDefaults() {
  _hbCfg = { ...HB_DEFAULTS };
  renderHbForm();
  const el = document.getElementById('hbSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadHbCreds() {
  try { _applyCredsToForm(await kvGet('hedge_bot_credentials'), 'hb_', 'hb_mt5_password'); } catch(e) {}
}

async function saveHbCreds() {
  await _saveCreds('hedge_bot_credentials', 'hb_', 'hb_mt5_password', 'hbCredsStatus');
}

async function loadHbStatus() {
  try {
    const d = await kvGet('hedge_bot_status');
    const ageEl  = document.getElementById('hbStatusAge');
    const modeEl = document.getElementById('hbStatusMode');
    const balEl  = document.getElementById('hbStatusBalance');
    const bodyEl = document.getElementById('hbStatusBody');
    if (!d) {
      if (ageEl) ageEl.textContent = 'No data — bot not running';
      return;
    }
    const ageSecs = d.pushed_at ? Math.round(Date.now() / 1000 - d.pushed_at) : null;
    if (ageEl)  ageEl.textContent  = ageSecs != null ? `${ageSecs}s ago` : '';
    if (modeEl) { modeEl.textContent = d.paper_mode ? 'PAPER' : 'LIVE'; modeEl.style.color = d.paper_mode ? 'var(--amber)' : 'var(--green)'; }
    if (balEl)  balEl.textContent   = d.balance != null ? `$${d.balance.toFixed(2)}` : '';
    if (bodyEl) {
      const pairs  = d.pairs || [];
      const n      = d.open_signals ?? 0;
      const positions = (d.mt5_positions || []);
      if (!positions.length && !n) {
        bodyEl.innerHTML = '<span style="color:var(--text3)">No open hedge pairs</span>';
      } else {
        const rows = positions.map(p => {
          const dir   = p.direction === 'BUY' ? '<span style="color:var(--green)">BUY</span>' : '<span style="color:var(--red)">SELL</span>';
          const profit = p.profit >= 0 ? `<span style="color:var(--green)">+${p.profit.toFixed(2)}</span>` : `<span style="color:var(--red)">${p.profit.toFixed(2)}</span>`;
          return `<div style="display:flex;gap:16px;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="width:80px;font-weight:600">${p.symbol}</span>
            <span style="width:50px">${dir}</span>
            <span style="width:50px">${p.lots}L</span>
            <span style="width:70px">${profit}</span>
            <span style="color:var(--text3);font-size:11px">@${p.open_price}</span>
          </div>`;
        }).join('');
        bodyEl.innerHTML = rows || `<span style="color:var(--text3)">${n} signal pair(s) tracked</span>`;
      }
    }
  } catch(e) { /* non-critical */ }
}

window.saveHbConfig  = saveHbConfig;
window.resetHbDefaults = resetHbDefaults;
window.saveHbCreds   = saveHbCreds;

// ── Position Hedge Bot ────────────────────────────────────────────────────────

const PHB_BOTS = [
  { id: 'phb_bot_bot_status',              key: 'bot_status' },
  { id: 'phb_bot_regime_bot_status',       key: 'regime_bot_status' },
  { id: 'phb_bot_gold_bot_status',         key: 'gold_bot_status' },
  { id: 'phb_bot_regime_bot_v2_status',    key: 'regime_bot_v2_status' },
  { id: 'phb_bot_backtestsystem_status',   key: 'backtestsystem_status' },
  { id: 'phb_bot_dyn_anchor_status',       key: 'dyn_anchor_status' },
];

const PHB_DEFAULTS = {
  enabled:          true,
  paper_mode:       true,
  interval_secs:    30,
  hedge_ratio:      0.5,
  sl_pips:          300,
  sl_pips_gold:     2000,
  max_lot:          5.0,
  max_spread_pips:  3.0,
  monitored_bots:   ['bot_status', 'regime_bot_status', 'regime_bot_v2_status', 'gold_bot_status', 'dyn_anchor_status'],
};

let _phbCfg = { ...PHB_DEFAULTS };

function readPhbForm() {
  _phbCfg.enabled         = chk('phb_enabled');
  _phbCfg.paper_mode      = chk('phb_paper_mode');
  _phbCfg.interval_secs   = num('phb_interval_secs',    30);
  _phbCfg.hedge_ratio     = num('phb_hedge_ratio',      0.5);
  _phbCfg.max_lot         = num('phb_max_lot',          5.0);
  _phbCfg.max_spread_pips = num('phb_max_spread_pips',  3.0);
  _phbCfg.sl_pips         = num('phb_sl_pips',          300);
  _phbCfg.sl_pips_gold    = num('phb_sl_pips_gold',     2000);
  _phbCfg.monitored_bots  = PHB_BOTS.filter(b => chk(b.id)).map(b => b.key);
}

function renderPhbForm() {
  setChk('phb_enabled',         _phbCfg.enabled         ?? true);
  setChk('phb_paper_mode',      _phbCfg.paper_mode      ?? true);
  setVal('phb_interval_secs',   _phbCfg.interval_secs   ?? 30);
  setVal('phb_hedge_ratio',     _phbCfg.hedge_ratio     ?? 0.5);
  setVal('phb_max_lot',         _phbCfg.max_lot         ?? 5.0);
  setVal('phb_max_spread_pips', _phbCfg.max_spread_pips ?? 3.0);
  setVal('phb_sl_pips',         _phbCfg.sl_pips         ?? 300);
  setVal('phb_sl_pips_gold',    _phbCfg.sl_pips_gold    ?? 2000);
  const enabled = new Set(_phbCfg.monitored_bots || PHB_DEFAULTS.monitored_bots);
  PHB_BOTS.forEach(b => setChk(b.id, enabled.has(b.key)));
}

async function loadPhbConfig() {
  try {
    const stored = await kvGet('position_hedge_bot_config');
    if (stored) _phbCfg = { ...PHB_DEFAULTS, ...stored };
    renderPhbForm();
  } catch(e) { /* non-critical */ }
}

async function savePhbConfig() {
  readPhbForm();
  const el = document.getElementById('phbSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('position_hedge_bot_config', _phbCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#34d399'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch(e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetPhbDefaults() {
  _phbCfg = { ...PHB_DEFAULTS };
  renderPhbForm();
  const el = document.getElementById('phbSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadPhbCreds() {
  try { _applyCredsToForm(await kvGet('position_hedge_bot_credentials'), 'phb_', 'phb_mt5_password'); } catch(e) {}
}

async function savePhbCreds() {
  await _saveCreds('position_hedge_bot_credentials', 'phb_', 'phb_mt5_password', 'phbCredsStatus');
}

async function loadPhbStatus() {
  try {
    const d = await kvGet('position_hedge_bot_status');
    const ageEl  = document.getElementById('phbStatusAge');
    const modeEl = document.getElementById('phbStatusMode');
    const balEl  = document.getElementById('phbStatusBalance');
    const bodyEl = document.getElementById('phbStatusBody');
    if (!d) {
      if (ageEl) ageEl.textContent = 'No data — bot not running';
      return;
    }
    const ageSecs = d.pushed_at ? Math.round(Date.now() / 1000 - d.pushed_at) : null;
    if (ageEl)  ageEl.textContent  = ageSecs != null ? `${ageSecs}s ago` : '';
    if (modeEl) { modeEl.textContent = d.paper_mode ? '· PAPER' : '· LIVE'; modeEl.style.color = d.paper_mode ? 'var(--amber)' : 'var(--green)'; }
    if (balEl)  balEl.textContent   = d.balance != null ? `· $${d.balance.toFixed(2)}` : '';
    if (bodyEl) {
      const positions = d.mt5_positions || [];
      const hedgeCount = d.open_hedges ?? positions.length;
      if (!positions.length) {
        bodyEl.innerHTML = `<span class="bs-dim">${hedgeCount ? `${hedgeCount} hedge(s) tracked` : 'No open hedge positions'}</span>`;
      } else {
        bodyEl.innerHTML = positions.map(p => {
          const dir = p.direction === 'BUY'
            ? '<span class="bs-green">BUY</span>'
            : '<span class="bs-red">SELL</span>';
          const pnl = p.profit >= 0
            ? `<span class="bs-green">+${p.profit.toFixed(2)}</span>`
            : `<span class="bs-red">${p.profit.toFixed(2)}</span>`;
          return `<span class="bs-dim">${p.symbol}</span> ${dir} <span class="bs-dim">${p.lots}L @${p.open_price}</span> ${pnl}`;
        }).join('  ');
      }
    }
  } catch(e) { /* non-critical */ }
}

window.savePhbConfig    = savePhbConfig;
window.resetPhbDefaults = resetPhbDefaults;
window.savePhbCreds     = savePhbCreds;

// ── Macro-Regime Equity Backtest ──────────────────────────────────────────────

const ME_DEFAULTS = {
  // FRED
  fred_api_key:   '',
  // Factor weights
  w_net_liq:      0.40,
  w_curve:        0.20,
  w_credit:       0.20,
  w_real_yield:   0.15,
  w_ism:          0.05,
  // Legacy thresholds (backtester compat)
  long_threshold: 0.5,
  flat_threshold: -0.5,
  vix_z_max:      1.5,
  // Allocation bands
  band_high:       1.0,
  band_mid:        0.0,
  band_low:       -1.0,
  alloc_floor:     0.50,
  inverted_alloc_floor: 0.20,
  // Walk-forward
  wf_train:       504,
  wf_test:        252,
  wf_step:        63,
  // Instruments
  include_qqq:     true,
  include_spy:     true,
  include_russell: false,
  include_tlt:     false,
  include_dax:     false,
  include_gold:    false,
  include_bil:     false,
  portfolio_mode:  false,
  // MT5 symbols
  symbol_qqq:     'NAS100',
  symbol_spy:     'SP500',
  symbol_russell: 'US2000',
  symbol_tlt:     'USB30Y',
  symbol_dax:     'GER40',
  symbol_gold:    'XAUUSD',
  // Bot control
  enabled:              true,
  paper_mode:           true,
  rebalance_threshold:  0.05,
  poll_interval_s:      3600,
};

let _meCfg  = { ...ME_DEFAULTS };
let _meTrades = [];
let _meTradeFilter = 'all';

function readMeForm() {
  const s = id => document.getElementById(id);
  const flt = (id, def) => { const v = parseFloat(s(id)?.value); return isNaN(v) ? def : v; };
  const int = (id, def) => { const v = parseInt(s(id)?.value);   return isNaN(v) ? def : v; };
  const chk = id => s(id)?.checked ?? false;
  const txt = id => s(id)?.value?.trim() ?? '';

  _meCfg.fred_api_key          = txt('me_fred_api_key');
  _meCfg.w_net_liq             = flt('me_w_net_liq',    ME_DEFAULTS.w_net_liq);
  _meCfg.w_curve               = flt('me_w_curve',      ME_DEFAULTS.w_curve);
  _meCfg.w_credit              = flt('me_w_credit',     ME_DEFAULTS.w_credit);
  _meCfg.w_real_yield          = flt('me_w_real_yield', ME_DEFAULTS.w_real_yield);
  _meCfg.w_ism                 = flt('me_w_ism',        ME_DEFAULTS.w_ism);
  _meCfg.band_high             = flt('me_band_high',    ME_DEFAULTS.band_high);
  _meCfg.band_mid              = flt('me_band_mid',     ME_DEFAULTS.band_mid);
  _meCfg.band_low              = flt('me_band_low',     ME_DEFAULTS.band_low);
  _meCfg.alloc_floor           = flt('me_alloc_floor',  ME_DEFAULTS.alloc_floor);
  _meCfg.inverted_alloc_floor  = flt('me_inverted_alloc_floor', ME_DEFAULTS.inverted_alloc_floor);
  _meCfg.wf_train              = int('me_wf_train',     ME_DEFAULTS.wf_train);
  _meCfg.wf_test               = int('me_wf_test',      ME_DEFAULTS.wf_test);
  _meCfg.wf_step               = int('me_wf_step',      ME_DEFAULTS.wf_step);
  _meCfg.include_russell       = chk('me_include_russell');
  _meCfg.include_tlt           = chk('me_include_tlt');
  _meCfg.include_dax           = chk('me_include_dax');
  _meCfg.include_gold          = chk('me_include_gold');
  _meCfg.include_bil           = chk('me_include_bil');
  _meCfg.portfolio_mode        = chk('me_portfolio_mode');
  _meCfg.enabled               = chk('me_enabled');
  _meCfg.paper_mode            = chk('me_paper_mode');
  _meCfg.rebalance_threshold   = flt('me_rebalance_threshold', ME_DEFAULTS.rebalance_threshold);
  _meCfg.poll_interval_s       = int('me_poll_interval_s',     ME_DEFAULTS.poll_interval_s);
  _meCfg.symbol_qqq            = txt('me_symbol_qqq')     || ME_DEFAULTS.symbol_qqq;
  _meCfg.symbol_spy            = txt('me_symbol_spy')     || ME_DEFAULTS.symbol_spy;
  _meCfg.symbol_russell        = txt('me_symbol_russell') || ME_DEFAULTS.symbol_russell;
  _meCfg.symbol_tlt            = txt('me_symbol_tlt')     || ME_DEFAULTS.symbol_tlt;
  _meCfg.symbol_dax            = txt('me_symbol_dax')     || ME_DEFAULTS.symbol_dax;
  _meCfg.symbol_gold           = txt('me_symbol_gold')    || ME_DEFAULTS.symbol_gold;
}

function renderMeForm() {
  const s   = id => document.getElementById(id);
  const set = (id, v) => { if (s(id)) s(id).value = v ?? ''; };
  const chk = (id, v) => { if (s(id)) s(id).checked = !!v; };

  set('me_fred_api_key',          _meCfg.fred_api_key           ?? '');
  set('me_w_net_liq',             _meCfg.w_net_liq              ?? ME_DEFAULTS.w_net_liq);
  set('me_w_curve',               _meCfg.w_curve                ?? ME_DEFAULTS.w_curve);
  set('me_w_credit',              _meCfg.w_credit               ?? ME_DEFAULTS.w_credit);
  set('me_w_real_yield',          _meCfg.w_real_yield           ?? ME_DEFAULTS.w_real_yield);
  set('me_w_ism',                 _meCfg.w_ism                  ?? ME_DEFAULTS.w_ism);
  set('me_band_high',             _meCfg.band_high              ?? ME_DEFAULTS.band_high);
  set('me_band_mid',              _meCfg.band_mid               ?? ME_DEFAULTS.band_mid);
  set('me_band_low',              _meCfg.band_low               ?? ME_DEFAULTS.band_low);
  set('me_alloc_floor',           _meCfg.alloc_floor            ?? ME_DEFAULTS.alloc_floor);
  set('me_inverted_alloc_floor',  _meCfg.inverted_alloc_floor   ?? ME_DEFAULTS.inverted_alloc_floor);
  set('me_wf_train',              _meCfg.wf_train               ?? ME_DEFAULTS.wf_train);
  set('me_wf_test',               _meCfg.wf_test                ?? ME_DEFAULTS.wf_test);
  set('me_wf_step',               _meCfg.wf_step                ?? ME_DEFAULTS.wf_step);
  chk('me_include_russell',       _meCfg.include_russell);
  chk('me_include_tlt',           _meCfg.include_tlt);
  chk('me_include_dax',           _meCfg.include_dax);
  chk('me_include_gold',          _meCfg.include_gold);
  chk('me_include_bil',           _meCfg.include_bil);
  chk('me_portfolio_mode',        _meCfg.portfolio_mode);
  chk('me_enabled',               _meCfg.enabled ?? true);
  chk('me_paper_mode',            _meCfg.paper_mode ?? true);
  set('me_rebalance_threshold',   _meCfg.rebalance_threshold    ?? ME_DEFAULTS.rebalance_threshold);
  set('me_poll_interval_s',       _meCfg.poll_interval_s        ?? ME_DEFAULTS.poll_interval_s);
  set('me_symbol_qqq',            _meCfg.symbol_qqq             ?? ME_DEFAULTS.symbol_qqq);
  set('me_symbol_spy',            _meCfg.symbol_spy             ?? ME_DEFAULTS.symbol_spy);
  set('me_symbol_russell',        _meCfg.symbol_russell         ?? ME_DEFAULTS.symbol_russell);
  set('me_symbol_tlt',            _meCfg.symbol_tlt             ?? ME_DEFAULTS.symbol_tlt);
  set('me_symbol_dax',            _meCfg.symbol_dax             ?? ME_DEFAULTS.symbol_dax);
  set('me_symbol_gold',           _meCfg.symbol_gold            ?? ME_DEFAULTS.symbol_gold);
}

async function loadMeConfig() {
  try {
    const stored = await kvGet('macro_equity_config');
    if (stored) _meCfg = { ...ME_DEFAULTS, ...stored };
    renderMeForm();
  } catch(e) { /* non-critical */ }
}

async function loadMeLiveStatus() {
  const ageEl  = document.getElementById('meLiveAge');
  const modeEl = document.getElementById('meLiveMode');
  const bodyEl = document.getElementById('meLiveBody');
  const nextEl = document.getElementById('meNextReb');
  const fEl    = id => document.getElementById(id);

  try {
    const st = await kvGet('macro_equity_bot_status');
    if (!st) {
      if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text3)">Bot not running — no status yet</td></tr>';
      return;
    }
    const age = st.pushed_at ? Math.round((Date.now() / 1000 - st.pushed_at) / 60) : null;
    if (ageEl)  ageEl.textContent  = age != null ? `Updated ${age}m ago` : '';
    if (modeEl) { modeEl.textContent = st.paper_mode ? '📄 PAPER' : '🟢 LIVE'; modeEl.style.color = st.paper_mode ? 'var(--amber)' : 'var(--green)'; }
    if (nextEl) nextEl.textContent = st.next_rebalance ?? '—';

    // Factor scores
    const fs = st.signal?.factor_scores ?? {};
    const fv = (id, v) => { const el = fEl(id); if (el) { el.textContent = v != null ? v.toFixed(2) : '—'; el.style.color = v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text3)'; } };
    fv('meFNetliq', fs.netliq_z); fv('meFCurve', fs.curve_z); fv('meFCredit', fs.credit_z);
    fv('meFRy', fs.realyield_z); fv('meFIsm', fs.ism_z);

    // Instrument rows
    const insts = st.instruments ?? {};
    if (!Object.keys(insts).length) {
      if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text3)">No rebalance run yet this month</td></tr>';
      return;
    }
    const regimeColor = r => r === 'BULL' ? 'var(--green)' : r === 'NEUTRAL_BULL' ? '#34d399' : r === 'NEUTRAL_BEAR' ? 'var(--amber)' : 'var(--red)';
    const rows = Object.entries(insts).map(([key, inst]) => {
      const alloc  = inst.target_alloc != null ? (inst.target_alloc * 100).toFixed(0) + '%' : '—';
      const score  = inst.score != null ? inst.score.toFixed(2) : '—';
      const action = inst.action ?? '—';
      const actionColor = action === 'buy' ? 'var(--green)' : action === 'sell' ? 'var(--red)' : 'var(--text3)';
      return `<tr>
        <td style="padding:6px 10px;font-weight:600">${key}</td>
        <td style="padding:6px 10px;color:${regimeColor(inst.regime)}">${inst.regime ?? '—'}</td>
        <td style="padding:6px 10px;text-align:right">${score}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600">${alloc}</td>
        <td style="padding:6px 10px;color:var(--text3)">${inst.symbol ?? '—'}</td>
        <td style="padding:6px 10px;color:${actionColor}">${action}</td>
      </tr>`;
    }).join('');
    if (bodyEl) bodyEl.innerHTML = rows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text3)">—</td></tr>';
  } catch(e) {
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="6" style="padding:10px;color:var(--red)">${e.message}</td></tr>`;
  }
}

async function saveMeConfig() {
  readMeForm();
  const el = document.getElementById('meSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try {
    await kvSet('macro_equity_config', _meCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#818cf8'; }
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  } catch(e) {
    if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; }
  }
}

function resetMeDefaults() {
  _meCfg = { ...ME_DEFAULTS };
  renderMeForm();
  const el = document.getElementById('meSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}

async function loadMeCreds() {
  try { _applyCredsToForm(await kvGet('macro_equity_credentials'), 'me_', 'me_mt5_password'); } catch(e) {}
}

async function saveMeCreds() {
  await _saveCreds('macro_equity_credentials', 'me_', 'me_mt5_password', 'meCredsStatus');
}

async function loadMeResults() {
  const bodyEl  = document.getElementById('meResultsBody');
  const stripEl = document.getElementById('meResultsStrip');
  const sumEl   = document.getElementById('meResultsSummary');
  const runAtEl = document.getElementById('meRunAt');
  try {
    const r = await fetch('/api/macro-equity-backtest/results');
    if (!r.ok) {
      if (bodyEl) bodyEl.innerHTML = '<span style="color:var(--text3)">No results yet — run <code>macro_equity_backtest.py</code> first.</span>';
      return;
    }
    const { results } = await r.json();

    if (runAtEl && results.run_at) {
      runAtEl.textContent = `Run: ${new Date(results.run_at).toLocaleString()}`;
    }
    if (stripEl) stripEl.style.display = '';

    const tickers = ['QQQ', 'SPY'];
    const rows = tickers.map(tkr => {
      const d = results[tkr];
      if (!d) return '';
      const m   = d.metrics || {};
      const wfe = d.wfe != null ? d.wfe.toFixed(2) : 'N/A';
      const oos = d.mean_oos_sharpe != null ? d.mean_oos_sharpe.toFixed(2) : 'N/A';
      const sh  = m.Sharpe != null ? m.Sharpe.toFixed(2) : 'N/A';
      const dd  = m.Max_DD  != null ? (m.Max_DD * 100).toFixed(1) + '%' : 'N/A';
      const cg  = m.CAGR    != null ? (m.CAGR * 100).toFixed(1) + '%' : 'N/A';
      const color = tkr === 'QQQ' ? '#818cf8' : '#34d399';
      return `<span class="bs-dim" style="color:${color};font-weight:600">${tkr}</span>
        CAGR <span class="bs-dim">${cg}</span>
        Sharpe <span class="bs-dim">${sh}</span>
        MaxDD <span class="bs-dim">${dd}</span>
        OOS Sharpe <span class="bs-dim">${oos}</span>
        WFE <span class="bs-dim">${wfe}</span>
        Trades <span class="bs-dim">${d.n_windows ?? '?'} WF windows</span>`;
    }).filter(Boolean).join('  ·  ');

    if (sumEl) sumEl.innerHTML = rows;

    // Detailed results in the panel
    if (bodyEl) {
      const html = tickers.map(tkr => {
        const d = results[tkr];
        if (!d) return '';
        const m = d.metrics || {};
        const fmt = v => (v == null || v === undefined) ? 'N/A' : (typeof v === 'number' ? v.toFixed(3) : v);
        const fmtP = v => (v == null) ? 'N/A' : (v * 100).toFixed(2) + '%';
        const wfe = d.wfe != null ? d.wfe.toFixed(3) : 'N/A';
        const oos = d.mean_oos_sharpe != null ? d.mean_oos_sharpe.toFixed(3) : 'N/A';
        const wfePass = d.wfe >= 0.5 ? '#34d399' : d.wfe >= 0.3 ? '#fbbf24' : '#f87171';
        const oosPass = d.mean_oos_sharpe >= 0.5 ? '#34d399' : d.mean_oos_sharpe >= 0.3 ? '#fbbf24' : '#f87171';
        return `<div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:600;color:#818cf8;margin-bottom:6px">${tkr} — ${tkr === 'QQQ' ? 'Nasdaq-100' : 'S&P 500'}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px 12px;font-size:11px">
            <div>CAGR: <b>${fmtP(m.CAGR)}</b></div>
            <div>Sharpe: <b>${fmt(m.Sharpe)}</b></div>
            <div>Sortino: <b>${fmt(m.Sortino)}</b></div>
            <div>Max DD: <b>${fmtP(m.Max_DD)}</b></div>
            <div>Max DD Duration: <b>${m.Max_DD_Days ?? 'N/A'}d</b></div>
            <div>Win Rate: <b>${fmtP(m.Win_Rate)}</b></div>
            <div>Profit Factor: <b>${fmt(m.Profit_Factor)}</b></div>
            <div>Total Trades: <b>${m.Total_Trades ?? 'N/A'}</b></div>
            <div>Time in Market: <b>${fmtP(m.Time_In_Market)}</b></div>
            <div>Calmar: <b>${fmt(m.Calmar)}</b></div>
            <div>OOS Sharpe: <b style="color:${oosPass}">${oos}</b></div>
            <div>WFE: <b style="color:${wfePass}">${wfe}</b></div>
            <div>WF Windows: <b>${d.n_windows ?? 'N/A'}</b></div>
          </div>
        </div>`;
      }).join('');
      bodyEl.innerHTML = html || '<span style="color:var(--text3)">No data</span>';
    }
  } catch(e) {
    if (bodyEl) bodyEl.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
}

// ── Positions sub-tab: Macro Equity Backtest trades ───────────────────────────

async function loadMeTradesTab() {
  const bodyEl  = document.getElementById('meBtTableBody');
  const savedEl = document.getElementById('meBtSavedAt');
  const statsEl = document.getElementById('meBtStats');
  if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="10" class="pos-empty">Loading…</td></tr>';
  try {
    const r = await fetch('/api/macro-equity-backtest/trades');
    if (!r.ok) {
      if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="10" class="pos-empty">No backtest trades — run macro_equity_backtest.py first</td></tr>';
      return;
    }
    const { trades, savedAt } = await r.json();
    _meTrades = trades || [];
    if (savedEl && savedAt) savedEl.textContent = `Saved: ${new Date(savedAt).toLocaleString()}`;
    _renderMeBtTrades();
  } catch(e) {
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="10" class="pos-empty" style="color:var(--red)">Error: ${e.message}</td></tr>`;
  }
}

function filterMeBtTrades(filter) {
  _meTradeFilter = filter;
  ['all', 'QQQ', 'SPY'].forEach(f => {
    const btn = document.getElementById(`meBtFilter${f === 'all' ? 'All' : f}`);
    if (btn) btn.classList.toggle('active', f === filter);
  });
  _renderMeBtTrades();
}

function _renderMeBtTrades() {
  const bodyEl  = document.getElementById('meBtTableBody');
  const statsEl = document.getElementById('meBtStats');
  if (!bodyEl) return;

  const trades = _meTradeFilter === 'all'
    ? _meTrades
    : _meTrades.filter(t => t.ticker === _meTradeFilter);

  if (!trades.length) {
    bodyEl.innerHTML = '<tr><td colspan="10" class="pos-empty">No trades match filter</td></tr>';
    if (statsEl) statsEl.innerHTML = '';
    return;
  }

  const rows = trades.map(t => {
    const pnlColor = (t.pnl_pct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlStr   = t.pnl_pct != null ? `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%` : 'N/A';
    const tkrColor = t.ticker === 'QQQ' ? '#818cf8' : '#34d399';
    const regColor = t.vol_regime === 'HIGH' ? '#f87171' : t.vol_regime === 'LOW' ? '#34d399' : 'var(--text3)';
    return `<tr>
      <td style="color:${tkrColor};font-weight:600">${t.ticker}</td>
      <td>${t.entry_date ?? '—'}</td>
      <td>${t.exit_date  ?? 'Open'}</td>
      <td style="color:var(--green)">LONG</td>
      <td>${t.position_sz != null ? t.position_sz.toFixed(2) : '—'}</td>
      <td>${t.entry_price ?? '—'}</td>
      <td>${t.exit_price  ?? '—'}</td>
      <td style="color:${pnlColor};font-weight:600">${pnlStr}</td>
      <td>${t.macro_score != null ? t.macro_score.toFixed(2) : '—'}</td>
      <td style="color:${regColor}">${t.vol_regime ?? '—'}</td>
    </tr>`;
  }).join('');
  bodyEl.innerHTML = rows;

  // Stats bar
  if (statsEl) {
    const wins   = trades.filter(t => (t.pnl_pct ?? 0) > 0).length;
    const avgPnl = trades.reduce((a, t) => a + (t.pnl_pct ?? 0), 0) / trades.length;
    const bestTr = trades.reduce((b, t) => ((t.pnl_pct ?? -Infinity) > (b?.pnl_pct ?? -Infinity)) ? t : b, null);
    const worstT = trades.reduce((b, t) => ((t.pnl_pct ?? Infinity) < (b?.pnl_pct ?? Infinity)) ? t : b, null);
    statsEl.innerHTML = [
      `<span>Total trades: <b>${trades.length}</b></span>`,
      `<span>Win rate: <b>${((wins / trades.length) * 100).toFixed(1)}%</b></span>`,
      `<span>Avg P&L: <b style="color:${avgPnl >= 0 ? 'var(--green)' : 'var(--red)'}">${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%</b></span>`,
      bestTr  ? `<span>Best: <b style="color:var(--green)">+${bestTr.pnl_pct?.toFixed(2)}%</b> (${bestTr.entry_date})</span>` : '',
      worstT  ? `<span>Worst: <b style="color:var(--red)">${worstT.pnl_pct?.toFixed(2)}%</b> (${worstT.entry_date})</span>` : '',
    ].filter(Boolean).join('  ·  ');
  }
}

window.saveMeConfig    = saveMeConfig;
window.resetMeDefaults = resetMeDefaults;
window.saveMeCreds     = saveMeCreds;
window.loadMeResults   = loadMeResults;
async function loadMeLivePosTab() {
  const posBodyEl = document.getElementById('meLivePosBody');
  const rebBodyEl = document.getElementById('meRebLogBody');
  try {
    const st = await kvGet('macro_equity_bot_status');
    if (!st) {
      if (posBodyEl) posBodyEl.innerHTML = '<tr><td colspan="7" class="pos-empty">Bot not running — no status pushed yet</td></tr>';
      return;
    }
    const positions = st.mt5_positions ?? [];
    if (positions.length === 0) {
      if (posBodyEl) posBodyEl.innerHTML = '<tr><td colspan="7" class="pos-empty">No open positions</td></tr>';
    } else {
      if (posBodyEl) posBodyEl.innerHTML = positions.map(p => {
        // time_open is on the BROKER's clock; `tz_offset_sec` is the shift the bot
        // applied (0 for paper, +2/+3h for MT5) — see pylego/broker/clock.py.
        const openedUtc = p.time_open ? p.time_open - (p.tz_offset_sec || 0) : null;
        const opened = openedUtc
          ? new Date(openedUtc * 1000).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })
          : '—';
        const pnlCls = p.profit >= 0 ? 'pos' : 'neg';
        return `<tr>
          <td>${p.symbol}</td>
          <td style="color:var(--green)">${p.direction}</td>
          <td>${p.lots}</td>
          <td>${p.open_price}</td>
          <td>${p.price}</td>
          <td class="${pnlCls}">${p.profit >= 0 ? '+' : ''}${p.profit.toFixed(2)}</td>
          <td>${opened}</td>
        </tr>`;
      }).join('');
    }
    const log = st.rebalance_log ?? [];
    if (rebBodyEl) {
      if (!log.length) {
        rebBodyEl.innerHTML = 'No rebalances yet this session.';
      } else {
        rebBodyEl.innerHTML = log.slice(0, 6).map(r => {
          const allocs = Object.entries(r.instruments ?? {})
            .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join('  ');
          const scoreColor = (r.score ?? 0) >= 0 ? '#34d399' : '#f87171';
          return `<div style="margin-bottom:6px;padding:6px 10px;background:var(--s2);border-radius:5px">
            <span style="font-weight:600">${r.date}</span>
            <span style="margin:0 8px;color:${scoreColor}">${r.regime}</span>
            <span style="color:var(--text3);font-size:11px">${allocs}</span>
          </div>`;
        }).join('');
      }
    }
  } catch(e) {
    if (posBodyEl) posBodyEl.innerHTML = `<tr><td colspan="7" class="pos-empty" style="color:var(--red)">${e.message}</td></tr>`;
  }
}
window.loadMeLivePosTab = loadMeLivePosTab;

window.loadMeTradesTab = loadMeTradesTab;
window.filterMeBtTrades = filterMeBtTrades;

document.querySelector('.tab-btn[data-tab="macroequity"]')?.addEventListener('click', () => {
  loadMeResults();
  loadMeLiveStatus();
});

loadMeConfig();
loadMeCreds();
loadMeResults();
loadMeLiveStatus();

// ── Volatility Bot (per-line fade) ────────────────────────────────────────────
const VB_DEFAULTS = {
  paper_mode: true, kill_switch: false, risk_pct: 0.5, max_lot: 2.0, max_open: 12,
  max_spread_pips: 1.0, tick_secs: 3, status_secs: 30, plan_secs: 600, enabled_pairs: [],
  // σ engine for the plan's lines. 'platform' = volSigmaSeries (book-matching, default).
  // 'har-nonfx' = HAR-RV σ for indices + gold (fx unchanged) — matches the calibrated
  // export; applies on the NEXT plan refresh. Reversible: switch back any time.
  sigma_source: 'platform',
  broker_symbols: {},  // { nq:'USTECH100', spx:'SP500', de30:'GER40', … } — blank = built-in default
  // Per-asset-class sizing OVERRIDES (blank = use the global risk_pct/max_lot). Lets gold
  // (commodity) be dialled down independently so one instrument can't carry a week.
  risk_pct_by_class: {}, max_lot_by_class: {},
};
// The asset classes the per-class sizing overrides expose (fx uses the globals above).
const VB_SIZE_CLASSES = ['commodity', 'index'];
const VB_INDEX_KEYS = ['nq', 'spx', 'de30', 'us30', 'us2000', 'uk100'];
let _vbCfg = { ...VB_DEFAULTS };
// Cached latest status + plan so the live-lines modal reads a row without refetch.
let _vbLastStatus = null, _vbLastPlan = null;

function renderVbForm() {
  const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  chk('vb_paper_mode',  _vbCfg.paper_mode ?? true);
  chk('vb_kill_switch', _vbCfg.kill_switch);
  set('vb_risk_pct',        _vbCfg.risk_pct        ?? VB_DEFAULTS.risk_pct);
  set('vb_max_lot',         _vbCfg.max_lot         ?? VB_DEFAULTS.max_lot);
  set('vb_max_open',        _vbCfg.max_open        ?? VB_DEFAULTS.max_open);
  set('vb_max_spread_pips', _vbCfg.max_spread_pips ?? VB_DEFAULTS.max_spread_pips);
  set('vb_tick_secs',       _vbCfg.tick_secs       ?? VB_DEFAULTS.tick_secs);
  set('vb_status_secs',     _vbCfg.status_secs     ?? VB_DEFAULTS.status_secs);
  set('vb_plan_secs',       _vbCfg.plan_secs       ?? VB_DEFAULTS.plan_secs);
  set('vb_enabled_pairs',  (_vbCfg.enabled_pairs ?? []).join(', '));
  // Per-class sizing overrides (blank cell = fall back to the global).
  const rpc = _vbCfg.risk_pct_by_class || {}, mlc = _vbCfg.max_lot_by_class || {};
  VB_SIZE_CLASSES.forEach(c => {
    set(`vb_risk_${c}`,   rpc[c] ?? '');
    set(`vb_maxlot_${c}`, mlc[c] ?? '');
  });
  const syms = _vbCfg.broker_symbols || {};
  VB_INDEX_KEYS.forEach(k => { const el = document.getElementById(`vb_sym_${k}`); if (el) el.value = syms[k] ?? ''; });
  set('vb_sigma_source', _vbCfg.sigma_source ?? VB_DEFAULTS.sigma_source);
}

function readVbForm() {
  const num = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  _vbCfg.paper_mode      = !!document.getElementById('vb_paper_mode')?.checked;
  _vbCfg.kill_switch     = !!document.getElementById('vb_kill_switch')?.checked;
  _vbCfg.risk_pct        = num('vb_risk_pct', VB_DEFAULTS.risk_pct);
  _vbCfg.max_lot         = num('vb_max_lot', VB_DEFAULTS.max_lot);
  _vbCfg.max_open        = Math.round(num('vb_max_open', VB_DEFAULTS.max_open));
  _vbCfg.max_spread_pips = num('vb_max_spread_pips', VB_DEFAULTS.max_spread_pips);
  _vbCfg.tick_secs       = Math.round(num('vb_tick_secs', VB_DEFAULTS.tick_secs));
  _vbCfg.status_secs     = Math.round(num('vb_status_secs', VB_DEFAULTS.status_secs));
  _vbCfg.plan_secs       = Math.round(num('vb_plan_secs', VB_DEFAULTS.plan_secs));
  _vbCfg.enabled_pairs   = (document.getElementById('vb_enabled_pairs')?.value || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  // Per-class sizing overrides: only keep cells the user actually filled with a positive
  // number — blank / 0 stays out of the map so the bot falls back to the global.
  const rpc = {}, mlc = {};
  VB_SIZE_CLASSES.forEach(c => {
    const rp = parseFloat(document.getElementById(`vb_risk_${c}`)?.value);
    const ml = parseFloat(document.getElementById(`vb_maxlot_${c}`)?.value);
    if (Number.isFinite(rp) && rp > 0) rpc[c] = rp;
    if (Number.isFinite(ml) && ml > 0) mlc[c] = ml;
  });
  _vbCfg.risk_pct_by_class = rpc;
  _vbCfg.max_lot_by_class  = mlc;
  const syms = {};
  VB_INDEX_KEYS.forEach(k => { const v = (document.getElementById(`vb_sym_${k}`)?.value || '').trim(); if (v) syms[k] = v; });
  _vbCfg.broker_symbols = syms;
  _vbCfg.sigma_source = document.getElementById('vb_sigma_source')?.value === 'har-nonfx' ? 'har-nonfx' : 'platform';
}

async function loadVbConfig() {
  try { const stored = await kvGet('volatility_bot_config'); if (stored) _vbCfg = { ...VB_DEFAULTS, ...stored }; renderVbForm(); } catch (e) {}
}
async function saveVbConfig() {
  readVbForm();
  const el = document.getElementById('vbSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try { await kvSet('volatility_bot_config', _vbCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#e0a93b'; setTimeout(() => { el.textContent = ''; }, 3000); }
  } catch (e) { if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; } }
}
function resetVbDefaults() {
  _vbCfg = { ...VB_DEFAULTS }; renderVbForm();
  const el = document.getElementById('vbSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}
async function loadVbCreds() { try { _applyCredsToForm(await kvGet('volatility_bot_credentials'), 'vb_', 'vb_mt5_password'); } catch (e) {} }
async function saveVbCreds() { await _saveCreds('volatility_bot_credentials', 'vb_', 'vb_mt5_password', 'vbCredsStatus'); }

async function loadVbLiveStatus() {
  const ageEl = document.getElementById('vbLiveAge'), modeEl = document.getElementById('vbLiveMode');
  const balEl = document.getElementById('vbLiveBal'), openEl = document.getElementById('vbOpenN');
  const uniEl = document.getElementById('vbUniN');
  try {
    const [st, planWrap] = await Promise.all([kvGet('volatility_bot_status'), kvGet('volatility_bot_plan')]);
    // Cache for the live-lines modal so openVbChart reads a row without refetching.
    _vbLastStatus = st || null;
    _vbLastPlan = planWrap || null;
    if (!st) { if (ageEl) ageEl.textContent = 'Bot not running — no status yet'; return; }
    if (ageEl)  ageEl.textContent  = st.running ? 'Running' : 'Idle';
    if (modeEl) { modeEl.textContent = st.mode === 'live' ? '🟢 LIVE' : '📄 PAPER'; modeEl.style.color = st.mode === 'live' ? 'var(--green)' : 'var(--amber)'; }
    if (balEl)  balEl.textContent  = st.balance != null ? `Balance ${st.balance}` : '';
    const positions = st.mt5_positions || [];
    if (openEl) openEl.textContent = positions.length;
    const tradesEl = document.getElementById('vbTradesN');
    if (tradesEl) tradesEl.textContent = (st.today_closed_trades || []).length;
    if (uniEl)  uniEl.textContent  = (st.universe || []).length;
    const pa = document.getElementById('vbPlanAge');
    if (pa) {
      const age = planWrap?.generatedAt ? new Date(planWrap.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
      // Surface the line set the plan was built from (COG is the standard). Older
      // plans predate the field ⇒ they were Feller; label them so it's unambiguous.
      const band = planWrap?.bandSource || planWrap?.bandMode || (planWrap ? 'feller' : null);
      pa.textContent = band ? `${age} · ${band === 'cog' ? 'COG lines' : band + ' lines'}` : age;
    }

    // Map each open position to the line it's fading. The bot stores the line in the
    // position comment as "Vol {line_id} {decision}" (e.g. "Vol HL50_dn fade"); we
    // parse the line_id back to its ↑/↓ label. Also index open lines per-pair so the
    // levels table below can flag which line is live.
    const _lineLabel = Object.fromEntries(VB_LINE_ROWS.map(r => [r.key, r.label]));
    const _posLine = p => {
      const m = /Vol\s+([A-Z0-9]+_(?:up|dn))/i.exec(p.comment || '');
      return m ? (_lineLabel[m[1]] || m[1].replace('_', ' ')) : '—';
    };
    const openByPair = {};
    positions.forEach(p => {
      const k = (p.symbol || '').toLowerCase();
      (openByPair[k] = openByPair[k] || []).push(p);
    });
    const openBody = document.getElementById('vbOpenBody');
    if (openBody) {
      if (!positions.length) {
        openBody.innerHTML = '<tr><td colspan="7" style="padding:12px;text-align:center;color:var(--text3)">No open positions</td></tr>';
      } else {
        const dp = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : 5);
        openBody.innerHTML = positions.map(p => {
          const buy = (p.direction || '').toUpperCase() === 'BUY';
          const pnl = +(p.profit || 0);
          return `<tr>
            <td style="padding:5px 10px;font-weight:600;text-align:left">${(p.symbol || '?').toUpperCase()}</td>
            <td style="padding:5px 10px;text-align:left;color:${buy ? 'var(--green)' : 'var(--red)'}">${buy ? 'BUY' : 'SELL'}</td>
            <td style="padding:5px 10px;text-align:left">${_posLine(p)}</td>
            <td style="padding:5px 10px;text-align:right">${(+(p.lots || 0)).toFixed(2)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${dp(p.symbol, p.open_price)}</td>
            <td style="padding:5px 10px;text-align:right">${dp(p.symbol, p.price)}</td>
            <td style="padding:5px 10px;text-align:right;color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td>
          </tr>`;
        }).join('');
      }
    }
    // Per-pair: today's forecast levels the bot pulled + live price.
    const body = document.getElementById('vbLinesBody');
    if (body) {
      const rows = st.lines || [];
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="11" style="padding:14px;text-align:center;color:var(--text3)">Bot running but no levels yet — waiting for the daily plan</td></tr>';
      } else {
        const d = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : 5);
        // Per-line audit chip: WHY each decided line was traded or skipped. Falls back
        // to a bare line list for older statuses that predate the audit field.
        const REASON = { belowMargin: 'skip · edge < cost', lowN: 'skip · too few samples',
                         unseen: 'skip · unseen cell', degenerate: 'skip · no room', skip: 'skip' };
        const actedChip = (id, a) => {
          const lbl = _lineLabel[id] || id.replace('_', ' ');
          if (!a) return `<span style="color:var(--text3)">${lbl}</span>`;
          const traded = a.status === 'traded', primed = a.status === 'primed';
          const col = traded ? 'var(--amber)' : primed ? 'var(--text3)' : '#8a93a6';
          const tag = traded ? (a.decision || 'trade') : primed ? 'primed (pre-open)' : (REASON[a.reason] || 'skip');
          const bits = [a.bucket, a.expectancy != null ? `exp ${a.expectancy}%` : '',
                        a.revRate != null ? `rev ${a.revRate}%` : '', a.n != null ? `n ${a.n}` : '']
                       .filter(Boolean).join(' · ');
          return `<span title="${bits}" style="color:${col};white-space:nowrap">${lbl} — ${tag}</span>`;
        };
        const acted = r => {
          const au = r.audit || {};
          const ids = (r.acted && r.acted.length) ? r.acted : Object.keys(au);
          return ids.length ? ids.map(id => actedChip(id, au[id])).join('<br>') : '—';
        };
        // Live positions on this pair → a green "in trade" badge naming the line, so
        // a currently-held level stands out from the (skip-inclusive) acted list.
        const liveBadge = pair => {
          const ps = openByPair[pair.toLowerCase()] || [];
          if (!ps.length) return '';
          const tags = ps.map(p => `<span style="color:${(p.direction||'').toUpperCase()==='BUY'?'var(--green)':'var(--red)'}">▶ ${_posLine(p)} ${(p.direction||'').toUpperCase()}</span>`).join(' ');
          return `<div style="margin-top:2px;font-weight:600">${tags}</div>`;
        };
        // price colour: green if above open, red if below.
        body.innerHTML = rows.map(r => {
          const L = r.levels || {}, up = r.price != null && r.open != null && r.price >= r.open;
          return `<tr>
            <td style="padding:5px 10px;font-weight:600;text-align:left">${r.pair.toUpperCase()}</td>
            <td style="padding:5px 10px;text-align:right;color:${r.price==null?'var(--text3)':up?'var(--green)':'var(--red)'}">${d(r.pair, r.price)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${d(r.pair, r.open)}</td>
            <td style="padding:5px 10px;text-align:right">${d(r.pair, L.HL75_up)}</td>
            <td style="padding:5px 10px;text-align:right">${d(r.pair, L.HL50_up)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${d(r.pair, L.OC50_up)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${d(r.pair, L.OC50_dn)}</td>
            <td style="padding:5px 10px;text-align:right">${d(r.pair, L.HL50_dn)}</td>
            <td style="padding:5px 10px;text-align:right">${d(r.pair, L.HL75_dn)}</td>
            <td style="padding:5px 10px;text-align:left;color:var(--text3);line-height:1.7">${acted(r)}${liveBadge(r.pair)}</td>
            <td style="padding:5px 10px;text-align:center"><button type="button" onclick="openVbChart('${r.pair}')" title="Live line chart" style="background:var(--s3);color:var(--text2);border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer">📈</button></td>
          </tr>`;
        }).join('');
      }
    }
  } catch (e) { if (ageEl) { ageEl.textContent = e.message; } }
}

window.saveVbConfig = saveVbConfig; window.resetVbDefaults = resetVbDefaults;
window.saveVbCreds = saveVbCreds; window.loadVbLiveStatus = loadVbLiveStatus;

// ══════════════════════════════════════════════════════════════════════════
// volatility_bot_v2 (Level Atlas Vote Portfolio) — mirrors the Vb-prefixed
// block above exactly, adapted for a checkbox-array pair picker (matching
// level-atlas-vote-portfolio.html's own picker) instead of the other bots'
// free-text `enabled_pairs` override, and a per-zone (not per-line) levels
// table (the plan ships one row per currently-armed rung, not 6 fixed bands
// per pair).
// ══════════════════════════════════════════════════════════════════════════

// Same universe/exclusion set as level-atlas-vote-portfolio.html's own
// PAIRS/CORRELATED_RISK_EXCLUDE (hand-kept in sync — both small, curated
// lists) and server.js's VOLATILITY_V2_ALL_PAIRS/_CORRELATED_EXCLUDE.
const VB2_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'gbpjpy', 'gbpaud',
  'gbpchf', 'audjpy', 'audcad', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
  'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const VB2_CORRELATED_RISK_EXCLUDE = new Set(['gbpaud', 'gbpchf', 'usdcad', 'audcad', 'nzdjpy', 'eurgbp', 'gbpjpy', 'nzdusd', 'eurjpy', 'eurcad']);
// "Select recommended" default (all pairs minus the 10 correlated-risk exclusions).
const VB2_DEFAULT_CHECKED = new Set(VB2_PAIRS.filter(p => !VB2_CORRELATED_RISK_EXCLUDE.has(p)));
const VB2_INDEX_KEYS = ['nq', 'spx', 'de30', 'dow', 'us2000', 'uk100', 'gold'];

// 2026-08-30 live-vs-backtest parity audit: risk_pct/max_open_risk_pct/
// fade_stop_tighten had drifted from (or were never set to) the validated
// "Load best config (least drawdown)" values on level-atlas-vote-portfolio.html
// -- fixed here, plus four new fields (max_concurrent_per_pair, the four
// throttle_* fields, early_exit/early_exit_threshold) for levers that were
// validated in the backtest but had never been implemented live at all.
const VB2_DEFAULTS = {
  paper_mode: true, kill_switch: false, risk_pct: 0.5, max_lot: 2.0, max_open: 12,
  max_concurrent_per_pair: 1,
  max_spread_pips: 1.0, tick_secs: 3, status_secs: 30, plan_secs: 45,
  enabled_pairs: [...VB2_DEFAULT_CHECKED],
  ccy_loss_gate: true, max_daily_loss_pct: 1.0,
  fade_stop_tighten: false, max_open_risk_pct: 1.0,
  early_exit: true, early_exit_threshold: 0.4,
  throttle_enabled: true, throttle_trigger_dd: -8.0, throttle_restore_dd: -2.0, throttle_mult: 0.25,
  stack_guard: true, stack_guard_pips: 5,
  plan_max_age_hours: 1,
  broker_symbols: {},
};
let _vb2Cfg = { ...VB2_DEFAULTS };
let _vb2LastStatus = null;

function _vb2RenderPairChecks() {
  const el = document.getElementById('vb2PairChecks');
  if (!el) return;
  const checked = new Set(_vb2Cfg.enabled_pairs?.length ? _vb2Cfg.enabled_pairs : VB2_DEFAULT_CHECKED);
  el.innerHTML = VB2_PAIRS.map(p => `<label style="display:flex;align-items:center;gap:5px;padding:3px 0"><input type="checkbox" data-vb2-pair="${p}" ${checked.has(p) ? 'checked' : ''}>${p.toUpperCase()}</label>`).join('');
}
function _vb2ReadPairChecks() {
  const boxes = document.querySelectorAll('#vb2PairChecks input[data-vb2-pair]');
  return Array.from(boxes).filter(b => b.checked).map(b => b.dataset.vb2Pair);
}
function vb2SelectAllPairs() {
  document.querySelectorAll('#vb2PairChecks input[data-vb2-pair]').forEach(b => { b.checked = true; });
}
function vb2SelectRecommendedPairs() {
  document.querySelectorAll('#vb2PairChecks input[data-vb2-pair]').forEach(b => { b.checked = !VB2_CORRELATED_RISK_EXCLUDE.has(b.dataset.vb2Pair); });
}

function renderVb2Form() {
  const chk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = !!v; };
  const set = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
  chk('vb2_paper_mode',  _vb2Cfg.paper_mode ?? true);
  chk('vb2_kill_switch', _vb2Cfg.kill_switch);
  set('vb2_risk_pct',            _vb2Cfg.risk_pct            ?? VB2_DEFAULTS.risk_pct);
  set('vb2_max_lot',             _vb2Cfg.max_lot             ?? VB2_DEFAULTS.max_lot);
  set('vb2_max_open',            _vb2Cfg.max_open            ?? VB2_DEFAULTS.max_open);
  set('vb2_max_concurrent_per_pair', _vb2Cfg.max_concurrent_per_pair ?? VB2_DEFAULTS.max_concurrent_per_pair);
  set('vb2_max_spread_pips',     _vb2Cfg.max_spread_pips     ?? VB2_DEFAULTS.max_spread_pips);
  chk('vb2_ccy_loss_gate',       _vb2Cfg.ccy_loss_gate ?? true);
  set('vb2_max_daily_loss_pct',  _vb2Cfg.max_daily_loss_pct  ?? VB2_DEFAULTS.max_daily_loss_pct);
  chk('vb2_fade_stop_tighten',   _vb2Cfg.fade_stop_tighten ?? VB2_DEFAULTS.fade_stop_tighten);
  set('vb2_max_open_risk_pct',   _vb2Cfg.max_open_risk_pct  ?? VB2_DEFAULTS.max_open_risk_pct);
  chk('vb2_early_exit',          _vb2Cfg.early_exit ?? VB2_DEFAULTS.early_exit);
  set('vb2_early_exit_threshold', _vb2Cfg.early_exit_threshold ?? VB2_DEFAULTS.early_exit_threshold);
  chk('vb2_throttle_enabled',    _vb2Cfg.throttle_enabled ?? VB2_DEFAULTS.throttle_enabled);
  set('vb2_throttle_trigger_dd', _vb2Cfg.throttle_trigger_dd ?? VB2_DEFAULTS.throttle_trigger_dd);
  set('vb2_throttle_restore_dd', _vb2Cfg.throttle_restore_dd ?? VB2_DEFAULTS.throttle_restore_dd);
  set('vb2_throttle_mult',       _vb2Cfg.throttle_mult ?? VB2_DEFAULTS.throttle_mult);
  chk('vb2_stack_guard',         _vb2Cfg.stack_guard ?? true);
  set('vb2_stack_guard_pips',    _vb2Cfg.stack_guard_pips   ?? VB2_DEFAULTS.stack_guard_pips);
  set('vb2_tick_secs',           _vb2Cfg.tick_secs          ?? VB2_DEFAULTS.tick_secs);
  set('vb2_status_secs',         _vb2Cfg.status_secs        ?? VB2_DEFAULTS.status_secs);
  set('vb2_plan_secs',           _vb2Cfg.plan_secs          ?? VB2_DEFAULTS.plan_secs);
  set('vb2_plan_max_age_hours',  _vb2Cfg.plan_max_age_hours ?? VB2_DEFAULTS.plan_max_age_hours);
  const syms = _vb2Cfg.broker_symbols || {};
  VB2_INDEX_KEYS.forEach(k => { const e = document.getElementById(`vb2_sym_${k}`); if (e) e.value = syms[k] ?? ''; });
  _vb2RenderPairChecks();
}

function readVb2Form() {
  const num = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  _vb2Cfg.paper_mode           = !!document.getElementById('vb2_paper_mode')?.checked;
  _vb2Cfg.kill_switch          = !!document.getElementById('vb2_kill_switch')?.checked;
  _vb2Cfg.risk_pct             = num('vb2_risk_pct', VB2_DEFAULTS.risk_pct);
  _vb2Cfg.max_lot              = num('vb2_max_lot', VB2_DEFAULTS.max_lot);
  _vb2Cfg.max_open             = Math.round(num('vb2_max_open', VB2_DEFAULTS.max_open));
  _vb2Cfg.max_concurrent_per_pair = Math.round(num('vb2_max_concurrent_per_pair', VB2_DEFAULTS.max_concurrent_per_pair));
  _vb2Cfg.max_spread_pips      = num('vb2_max_spread_pips', VB2_DEFAULTS.max_spread_pips);
  _vb2Cfg.ccy_loss_gate        = !!document.getElementById('vb2_ccy_loss_gate')?.checked;
  _vb2Cfg.max_daily_loss_pct   = num('vb2_max_daily_loss_pct', VB2_DEFAULTS.max_daily_loss_pct);
  _vb2Cfg.fade_stop_tighten    = !!document.getElementById('vb2_fade_stop_tighten')?.checked;
  _vb2Cfg.max_open_risk_pct    = num('vb2_max_open_risk_pct', VB2_DEFAULTS.max_open_risk_pct);
  _vb2Cfg.early_exit           = !!document.getElementById('vb2_early_exit')?.checked;
  _vb2Cfg.early_exit_threshold = num('vb2_early_exit_threshold', VB2_DEFAULTS.early_exit_threshold);
  _vb2Cfg.throttle_enabled     = !!document.getElementById('vb2_throttle_enabled')?.checked;
  _vb2Cfg.throttle_trigger_dd  = num('vb2_throttle_trigger_dd', VB2_DEFAULTS.throttle_trigger_dd);
  _vb2Cfg.throttle_restore_dd  = num('vb2_throttle_restore_dd', VB2_DEFAULTS.throttle_restore_dd);
  _vb2Cfg.throttle_mult        = num('vb2_throttle_mult', VB2_DEFAULTS.throttle_mult);
  _vb2Cfg.stack_guard          = !!document.getElementById('vb2_stack_guard')?.checked;
  _vb2Cfg.stack_guard_pips     = num('vb2_stack_guard_pips', VB2_DEFAULTS.stack_guard_pips);
  _vb2Cfg.tick_secs            = Math.round(num('vb2_tick_secs', VB2_DEFAULTS.tick_secs));
  _vb2Cfg.status_secs          = Math.round(num('vb2_status_secs', VB2_DEFAULTS.status_secs));
  _vb2Cfg.plan_secs            = Math.round(num('vb2_plan_secs', VB2_DEFAULTS.plan_secs));
  _vb2Cfg.plan_max_age_hours   = num('vb2_plan_max_age_hours', VB2_DEFAULTS.plan_max_age_hours);
  _vb2Cfg.enabled_pairs        = _vb2ReadPairChecks();
  const syms = {};
  VB2_INDEX_KEYS.forEach(k => { const v = (document.getElementById(`vb2_sym_${k}`)?.value || '').trim(); if (v) syms[k] = v; });
  _vb2Cfg.broker_symbols = syms;
}

async function loadVb2Config() {
  try { const stored = await kvGet('volatility_bot_v2_config'); if (stored) _vb2Cfg = { ...VB2_DEFAULTS, ...stored }; renderVb2Form(); } catch (e) {}
}
async function saveVb2Config() {
  readVb2Form();
  const el = document.getElementById('vb2SaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try { await kvSet('volatility_bot_v2_config', _vb2Cfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#38bdf8'; setTimeout(() => { el.textContent = ''; }, 3000); }
  } catch (e) { if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; } }
}
function resetVb2Defaults() {
  _vb2Cfg = { ...VB2_DEFAULTS }; renderVb2Form();
  const el = document.getElementById('vb2SaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}
async function loadVb2Creds() { try { _applyCredsToForm(await kvGet('volatility_bot_v2_credentials'), 'vb2_', 'vb2_mt5_password'); } catch (e) {} }
async function saveVb2Creds() { await _saveCreds('volatility_bot_v2_credentials', 'vb2_', 'vb2_mt5_password', 'vb2CredsStatus'); }

async function loadVb2LiveStatus() {
  const ageEl = document.getElementById('vb2LiveAge'), modeEl = document.getElementById('vb2LiveMode');
  const balEl = document.getElementById('vb2LiveBal'), openEl = document.getElementById('vb2OpenN');
  const uniEl = document.getElementById('vb2UniN'), gateEl = document.getElementById('vb2GateN');
  try {
    const [st, planWrap] = await Promise.all([kvGet('volatility_bot_v2_status'), kvGet('volatility_bot_v2_plan')]);
    _vb2LastStatus = st || null;
    if (!st) { if (ageEl) ageEl.textContent = 'Bot not running — no status yet'; loadVb2AllLines(); return; }
    if (ageEl)  ageEl.textContent  = st.running ? 'Running' : 'Idle';
    if (modeEl) { modeEl.textContent = st.mode === 'live' ? '🟢 LIVE' : '📄 PAPER'; modeEl.style.color = st.mode === 'live' ? 'var(--green)' : 'var(--amber)'; }
    if (balEl)  balEl.textContent  = st.balance != null ? `Balance ${st.balance}` : '';
    const positions = st.mt5_positions || [];
    if (openEl) openEl.textContent = positions.length;
    const tradesEl = document.getElementById('vb2TradesN');
    if (tradesEl) tradesEl.textContent = (st.today_closed_trades || []).length;
    if (uniEl)  uniEl.textContent  = (st.universe || []).length;
    if (gateEl) {
      const tally = st.ccy_gate?.tally || {};
      const blocked = Object.entries(tally).filter(([, v]) => v <= -(_vb2Cfg.max_daily_loss_pct ?? 1));
      gateEl.textContent = blocked.length ? blocked.map(([c, v]) => `${c} ${v.toFixed(1)}%`).join(', ') : 'clear';
      gateEl.style.color = blocked.length ? 'var(--red)' : 'var(--text3)';
    }
    const pa = document.getElementById('vb2PlanAge');
    if (pa) pa.textContent = planWrap?.generatedAt ? new Date(planWrap.generatedAt).toISOString().slice(0, 19).replace('T', ' ') + 'Z' : '—';

    const openBody = document.getElementById('vb2OpenBody');
    if (openBody) {
      if (!positions.length) {
        openBody.innerHTML = '<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--text3)">No open positions</td></tr>';
      } else {
        const dp = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : 5);
        openBody.innerHTML = positions.map(p => {
          const buy = (p.direction || '').toUpperCase() === 'BUY';
          const pnl = +(p.profit || 0);
          return `<tr>
            <td style="padding:5px 10px;font-weight:600;text-align:left">${(p.symbol || '?').toUpperCase()}</td>
            <td style="padding:5px 10px;text-align:left;color:${buy ? 'var(--green)' : 'var(--red)'}">${buy ? 'BUY' : 'SELL'}</td>
            <td style="padding:5px 10px;text-align:right">${(+(p.lots || 0)).toFixed(2)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${dp(p.symbol, p.open_price)}</td>
            <td style="padding:5px 10px;text-align:right">${dp(p.symbol, p.price)}</td>
            <td style="padding:5px 10px;text-align:right;color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td>
          </tr>`;
        }).join('');
      }
    }

    const body = document.getElementById('vb2LinesBody');
    if (body) {
      const rows = st.lines || [];
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="10" style="padding:14px;text-align:center;color:var(--text3)">Bot running but no zones yet — waiting for the live plan</td></tr>';
      } else {
        const d = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : 5);
        const STATUS_COLOR = { entered: 'var(--green)', armed: 'var(--text2)' };
        body.innerHTML = rows.map(r => `<tr>
            <td style="padding:5px 10px;font-weight:600;text-align:left">${(r.pair || '').toUpperCase()}</td>
            <td style="padding:5px 10px;text-align:left">${r.side === 'up' ? '↑ up' : '↓ down'}</td>
            <td style="padding:5px 10px;text-align:left">${r.rung || '—'}</td>
            <td style="padding:5px 10px;text-align:left;color:${r.decision === 'fade' ? 'var(--amber)' : 'var(--blue,#60a5fa)'}">${r.decision || '—'}</td>
            <td style="padding:5px 10px;text-align:right">${r.margin ?? '—'}</td>
            <td style="padding:5px 10px;text-align:right">${d(r.pair, r.entry)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--red)">${d(r.pair, r.sl)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--green)">${d(r.pair, r.tp)}</td>
            <td style="padding:5px 10px;text-align:left;color:${STATUS_COLOR[r.status] || 'var(--text3)'}">${r.status === 'entered' ? '▶ entered' : (r.status || '—')}</td>
            <td style="padding:5px 10px;text-align:left;color:var(--text3)">${r.rationale || '—'}</td>
          </tr>`).join('');
      }
    }
  } catch (e) { if (ageEl) { ageEl.textContent = e.message; } }
  loadVb2AllLines();
}

// Unfiltered companion to the table above: EVERY currently-armed or
// already-touched-today rung across the bot's enabled pairs, regardless of
// vote margin — the bot's own plan (loaded into vb2LinesBody above) already
// drops anything under margin 3 server-side, so a real move that got a weak
// or tied vote would otherwise be invisible here. Added 2026-08-31.
async function loadVb2AllLines() {
  const body = document.getElementById('vb2AllLinesBody');
  if (!body) return;
  const pairs = _vb2Cfg.enabled_pairs?.length ? _vb2Cfg.enabled_pairs : [...VB2_DEFAULT_CHECKED];
  try {
    const r = await fetch(`/api/level-atlas/vote-preview?instruments=${encodeURIComponent(pairs.join(','))}`);
    const j = await r.json();
    if (!j.ok) { body.innerHTML = `<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text3)">${j.error || 'failed to load'}</td></tr>`; return; }
    const rows = [];
    for (const [pair, inst] of Object.entries(j.instruments || {})) {
      for (const p of (inst.pending || [])) rows.push({ pair, side: p.side, rung: p.rung, status: 'pending', decision: p.decision });
      for (const t of (inst.touches || [])) rows.push({ pair, side: t.side, rung: t.rung, status: `touched · ${t.outcome}`, decision: t.decision });
    }
    if (!rows.length) { body.innerHTML = '<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text3)">No live coverage yet</td></tr>'; return; }
    rows.sort((a, b) => (b.decision?.margin ?? -1) - (a.decision?.margin ?? -1));
    body.innerHTML = rows.map(r => {
      const d = r.decision;
      const strong = d && d.margin >= 3;
      const decLabel = !d ? '🪙 no decision' : (d.decision === 'follow' ? '↗ continue' : '↘ fade');
      const decColor = !d ? 'var(--text3)' : (d.decision === 'follow' ? 'var(--blue,#60a5fa)' : 'var(--amber)');
      return `<tr>
        <td style="padding:5px 10px;font-weight:600;text-align:left">${r.pair.toUpperCase()}</td>
        <td style="padding:5px 10px;text-align:left">${r.side === 'up' ? '↑ up' : '↓ down'}</td>
        <td style="padding:5px 10px;text-align:left">${r.rung}</td>
        <td style="padding:5px 10px;text-align:left;color:var(--text3)">${r.status}</td>
        <td style="padding:5px 10px;text-align:left;color:${decColor}">${decLabel}</td>
        <td style="padding:5px 10px;text-align:right">${d?.margin ?? '—'}</td>
        <td style="padding:5px 10px;text-align:center;color:${strong ? 'var(--green)' : 'var(--text3)'}">${strong ? '✓' : '—'}</td>
      </tr>`;
    }).join('');
  } catch (e) { body.innerHTML = `<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text3)">${e.message}</td></tr>`; }
}

window.saveVb2Config = saveVb2Config; window.resetVb2Defaults = resetVb2Defaults;
window.saveVb2Creds = saveVb2Creds; window.loadVb2LiveStatus = loadVb2LiveStatus;
window.loadVb2AllLines = loadVb2AllLines;
window.vb2SelectAllPairs = vb2SelectAllPairs; window.vb2SelectRecommendedPairs = vb2SelectRecommendedPairs;

// ── Forecast drift vs reference ───────────────────────────────────────────────
// For each live-universe pair, call /api/forecast-drift/:pair (plan lines vs the
// recalibrated reference forecaster) and render the per-line % drift. A large negative
// drift = the bot's lines sit INSIDE the reference (enters early), the "why 22 pts below
// the real resistance" case. Falls back to a small default set if no plan universe yet.
async function loadVbDrift() {
  const body = document.getElementById('vbDriftBody');
  if (!body) return;
  const pairs = (_vbLastPlan?.universe && _vbLastPlan.universe.length)
    ? _vbLastPlan.universe
    : (_vbLastStatus?.universe && _vbLastStatus.universe.length ? _vbLastStatus.universe : ['gold', 'eurusd', 'nq']);
  body.innerHTML = `<tr><td colspan="9" style="padding:12px;text-align:center;color:var(--text3)">Measuring ${pairs.length} pairs…</td></tr>`;
  const fmt = (v, d = 2) => (v == null || Number.isNaN(v)) ? '—' : (+v).toFixed(d);
  const sign = v => (v == null ? 'color:var(--text3)' : v > 0 ? 'color:#3fb27f' : v < 0 ? 'color:#e06666' : 'color:var(--text3)');
  const rows = [];
  for (const pair of pairs) {
    try {
      const r = await fetch(`/api/forecast-drift/${encodeURIComponent(pair)}`).then(x => x.json());
      if (!r?.ok) { rows.push(`<tr><td>${pair.toUpperCase()}</td><td colspan="8" style="color:var(--text3)">${(r?.error || 'error')}</td></tr>`); continue; }
      const d = r.driftPct || {}, s = r.sigma || {};
      const cell = v => `<td style="text-align:right;${sign(v)}">${v == null ? '—' : (v > 0 ? '+' : '') + fmt(v)}</td>`;
      rows.push(`<tr><td style="text-align:left">${pair.toUpperCase()} <span style="color:var(--text3)">${r.assetClass || ''}</span></td>`
        + `<td style="text-align:right">${fmt(s.planVol, 1)}</td><td style="text-align:right">${fmt(s.refVol, 1)}</td>${cell(s.driftPct)}`
        + `${cell(d.hl50)}${cell(d.hl75)}${cell(d.ocMed)}${cell(d.oc75)}`
        + `<td style="text-align:right;font-weight:600">${fmt(r.avgAbsDriftPct)}</td></tr>`);
    } catch (e) {
      rows.push(`<tr><td>${pair.toUpperCase()}</td><td colspan="8" style="color:var(--text3)">${e.message || 'fetch failed'}</td></tr>`);
    }
    body.innerHTML = rows.join('');   // progressive render as each pair resolves
  }
  if (!rows.length) body.innerHTML = `<tr><td colspan="9" style="padding:12px;text-align:center;color:var(--text3)">No pairs to measure</td></tr>`;
}
window.loadVbDrift = loadVbDrift;

// ── Live per-pair line-chart modal ────────────────────────────────────────────
// The 8 forecast lines, in table (name, side, arrow) form. Table cell key casing
// mirrors pylego/strategy/volatility.line_levels: `${NAME}_${side}` (side up/dn).
const VB_LINE_ROWS = [
  { key: 'HL75_up', name: 'HL75', side: 'up', label: 'HL75↑' },
  { key: 'HL50_up', name: 'HL50', side: 'up', label: 'HL50↑' },
  { key: 'OC75_up', name: 'OC75', side: 'up', label: 'OC75↑' },
  { key: 'OC50_up', name: 'OC50', side: 'up', label: 'OC50↑' },
  { key: 'OC50_dn', name: 'OC50', side: 'dn', label: 'OC50↓' },
  { key: 'OC75_dn', name: 'OC75', side: 'dn', label: 'OC75↓' },
  { key: 'HL50_dn', name: 'HL50', side: 'dn', label: 'HL50↓' },
  { key: 'HL75_dn', name: 'HL75', side: 'dn', label: 'HL75↓' },
];

let _vbChart = null, _vbChartPoll = null, _vbChartPair = null;

// Resolve one line's live STATE from the plan policy + acted list.
//   acted    → line id in r.acted (already traded this session).
//   armed    → plan.policy has a fade/follow decision for `${name}_${side}|*`.
//              Direction: fade+dn→BUY, fade+up→SELL, follow+up→BUY, follow+dn→SELL.
//              Buckets that disagree on direction → mixed.
//   idle     → neither.
function vbLineState(lineRow, acted, policy) {
  if ((acted || []).includes(lineRow.key)) {
    return { kind: 'vbActed', tag: 'acted', dir: null, buckets: [] };
  }
  const prefix = `${lineRow.name}_${lineRow.side}|`;
  const dirs = new Set(), armedBuckets = [];
  for (const [cell, p] of Object.entries(policy || {})) {
    if (!cell.startsWith(prefix)) continue;
    const decision = p?.decision;
    if (decision !== 'fade' && decision !== 'follow') continue;
    const bucket = cell.slice(prefix.length);
    // BUY when fading a down-line or following an up-line; else SELL (perLineStrategy.pnlFor).
    const isBuy = (decision === 'fade' && lineRow.side === 'dn') || (decision === 'follow' && lineRow.side === 'up');
    dirs.add(isBuy ? 'BUY' : 'SELL');
    armedBuckets.push({ bucket, decision, dir: isBuy ? 'BUY' : 'SELL' });
  }
  if (!armedBuckets.length) return { kind: 'vbIdle', tag: 'idle', dir: null, buckets: [] };
  if (dirs.size > 1) return { kind: 'vbMixed', tag: 'mixed', dir: 'MIXED', buckets: armedBuckets };
  const dir = [...dirs][0];
  return { kind: dir === 'BUY' ? 'vbBuy' : 'vbSell', tag: dir, dir, buckets: armedBuckets };
}

// Build the Level[] (levelChart.js contract) for one status row.
function vbBuildLevels(r, policy) {
  const isJpy = /jpy/i.test(r.pair);
  const fmt = v => (+v).toFixed(isJpy ? 3 : 5);
  const L = r.levels || {}, acted = r.acted || [];
  const levels = [];
  for (const row of VB_LINE_ROWS) {
    const price = L[row.key];
    if (price == null || !Number.isFinite(+price)) continue;
    const st = vbLineState(row, acted, policy);
    let label = `${row.label} @ ${fmt(price)}`;
    if (st.tag === 'acted') label = `${row.label} (acted)`;
    else if (st.dir === 'BUY' || st.dir === 'SELL') {
      const vel = st.buckets.map(b => b.bucket).join(',');
      const dec = st.buckets[0]?.decision?.toUpperCase() || '';
      label = `${row.label} · ${dec}→${st.dir} (vel: ${vel})`;
    } else if (st.dir === 'MIXED') {
      label = `${row.label} · MIXED`;
    }
    levels.push({ price: +price, kind: st.kind, label });
  }
  if (r.open != null && Number.isFinite(+r.open)) levels.push({ price: +r.open, kind: 'vbOpen', label: `Open @ ${fmt(r.open)}` });
  if (r.price != null && Number.isFinite(+r.price)) levels.push({ price: +r.price, kind: 'vbPrice', label: `Live @ ${fmt(r.price)}` });
  return levels;
}

function vbSetChartStatus(msg) {
  const el = document.getElementById('vbChartStatus');
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = 'flex'; }
  else { el.style.display = 'none'; }
}

async function vbFetchBars(pair) {
  const res = await fetch(`/api/volatility-bot/session-m1/${encodeURIComponent(pair)}`);
  const j = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!j.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j.bars || [];
}

function vbRenderLegend() {
  const el = document.getElementById('vbChartLegend');
  if (!el) return;
  const items = [
    ['BUY (armed)', 'var(--green)'],
    ['SELL (armed)', 'var(--red)'],
    ['mixed', 'var(--amber)'],
    ['acted', '#9ca3af'],
    ['idle', 'var(--text3)'],
    ['open', '#5b9dff'],
    ['live price', '#e0a93b'],
  ];
  el.innerHTML = items.map(([lbl, c]) =>
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:14px;height:3px;background:${c};border-radius:2px"></span>${lbl}</span>`
  ).join('');
  const note = document.getElementById('vbChartNote');
  if (note) note.textContent = '"Armed" means the frozen plan WILL trade that line if price reaches it at the shown velocity bucket (velocity-conditioned). BUY/SELL is the direction it would take; grey/dashed lines have already been acted on this session.';
}

async function openVbChart(pair) {
  const overlay = document.getElementById('vbChartModal');
  const titleEl = document.getElementById('vbChartTitle');
  const chartEl = document.getElementById('vbChartEl');
  if (!overlay || !chartEl) return;
  _vbChartPair = pair;
  const row = (_vbLastStatus?.lines || []).find(r => r.pair === pair);
  const policy = _vbLastPlan?.policy || {};
  if (titleEl) titleEl.textContent = `${pair.toUpperCase()} — live forecast lines`;
  overlay.classList.add('open');
  vbRenderLegend();
  vbSetChartStatus('Loading live M1…');

  // Tear down any prior chart instance before making a new one.
  if (_vbChart) { try { _vbChart.destroy(); } catch (e) {} _vbChart = null; }
  if (_vbChartPoll) { clearInterval(_vbChartPoll); _vbChartPoll = null; }

  if (!row) { vbSetChartStatus('No live status for this pair yet — is the bot running?'); return; }

  const draw = async () => {
    // Re-read the (possibly refreshed) row so live price + acted lines stay current.
    const r = (_vbLastStatus?.lines || []).find(x => x.pair === pair) || row;
    const pol = _vbLastPlan?.policy || policy;
    let bars = [];
    try { bars = await vbFetchBars(pair); }
    catch (e) {
      if (!_vbChart) { vbSetChartStatus(`Live M1 unavailable — is OANDA reachable? (${e.message})`); }
      return;
    }
    if (_vbChartPair !== pair) return;   // modal switched/closed while awaiting
    vbSetChartStatus('');
    if (!_vbChart) {
      try { _vbChart = createLevelChart(chartEl, { height: 420 }); }
      catch (e) { vbSetChartStatus(`Chart failed to load: ${e.message}`); return; }
    }
    _vbChart.setCandles(bars);
    _vbChart.setLevels(vbBuildLevels(r, pol), { showTitle: true });
    _vbChart.fit();
  };

  await draw();
  // Refresh candles + live lines every ~7s while the modal is open. Pull a fresh
  // status snapshot too so the live price / acted lines update.
  _vbChartPoll = setInterval(async () => {
    try { const st = await kvGet('volatility_bot_status'); if (st) _vbLastStatus = st; } catch (e) {}
    draw();
  }, 7000);
}

function closeVbChart() {
  const overlay = document.getElementById('vbChartModal');
  if (overlay) overlay.classList.remove('open');
  _vbChartPair = null;
  if (_vbChartPoll) { clearInterval(_vbChartPoll); _vbChartPoll = null; }
  if (_vbChart) { try { _vbChart.destroy(); } catch (e) {} _vbChart = null; }
}

window.openVbChart = openVbChart;
window.closeVbChart = closeVbChart;

document.querySelector('.tab-btn[data-tab="volatility"]')?.addEventListener('click', loadVbLiveStatus);
loadVbConfig();
loadVbCreds();
loadVbLiveStatus();

document.querySelector('.tab-btn[data-tab="volatilityv2"]')?.addEventListener('click', loadVb2LiveStatus);
loadVb2Config();
loadVb2Creds();
loadVb2LiveStatus();

// ── Range-Line Bot config (mirrors the volatility bot) ────────────────────────
const RL_DEFAULTS = {
  paper_mode: true, kill_switch: false, risk_pct: 0.5, max_lot: 2.0, max_open: 12,
  single_position_per_pair: true,  // false = one position per Asia/Monday ladder slot instead
  confluence_min: 2,               // structural-confluence entry gate: 0=off, 1=confluent, 2=strong (default — best OOS book)
  oi_confluence: false,            // UNVALIDATED opt-in: OI levels add to the confluence gate
  oi_override: false,              // UNVALIDATED opt-in: OI read overrides the learned direction
  oi_gamma_regime: false,          // UNVALIDATED opt-in: gamma sign → fade (PIN) / follow (BREAKOUT)
  oi_hold_break: false,            // UNVALIDATED opt-in: broken wall → squeeze (follow) not fade
  oi_break_pips: 20,               // break distance beyond a wall that counts as decisive
  oi_min_tier: '',                 // ''=any wall; weak/moderate/strong = only walls that strong count
  max_spread_pips: 2.0, tick_secs: 3, status_secs: 30, plan_secs: 600, enabled_pairs: [],
  broker_symbols: {},          // { nq:'USTECH100', de30:'GER40', ... } — blank = built-in default
};
const RL_INDEX_KEYS = ['nq', 'spx500', 'de30', 'us30', 'us2000'];
let _rlCfg = { ...RL_DEFAULTS };

function renderRlForm() {
  const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  chk('rl_paper_mode',  _rlCfg.paper_mode ?? true);
  chk('rl_kill_switch', _rlCfg.kill_switch);
  chk('rl_single_position_per_pair', _rlCfg.single_position_per_pair ?? true);
  set('rl_confluence_min',  String(_rlCfg.confluence_min ?? 0));
  chk('rl_oi_confluence', _rlCfg.oi_confluence);
  chk('rl_oi_override',   _rlCfg.oi_override);
  chk('rl_oi_gamma_regime', _rlCfg.oi_gamma_regime);
  chk('rl_oi_hold_break',   _rlCfg.oi_hold_break);
  set('rl_oi_break_pips',   _rlCfg.oi_break_pips ?? RL_DEFAULTS.oi_break_pips);
  set('rl_oi_min_tier',     _rlCfg.oi_min_tier ?? '');
  set('rl_risk_pct',        _rlCfg.risk_pct        ?? RL_DEFAULTS.risk_pct);
  set('rl_max_lot',         _rlCfg.max_lot         ?? RL_DEFAULTS.max_lot);
  set('rl_max_open',        _rlCfg.max_open        ?? RL_DEFAULTS.max_open);
  set('rl_max_spread_pips', _rlCfg.max_spread_pips ?? RL_DEFAULTS.max_spread_pips);
  set('rl_tick_secs',       _rlCfg.tick_secs       ?? RL_DEFAULTS.tick_secs);
  set('rl_status_secs',     _rlCfg.status_secs     ?? RL_DEFAULTS.status_secs);
  set('rl_plan_secs',       _rlCfg.plan_secs       ?? RL_DEFAULTS.plan_secs);
  set('rl_enabled_pairs',  (_rlCfg.enabled_pairs ?? []).join(', '));
  const syms = _rlCfg.broker_symbols || {};
  RL_INDEX_KEYS.forEach(k => { const el = document.getElementById(`rl_sym_${k}`); if (el) el.value = syms[k] ?? ''; });
}
function readRlForm() {
  const num = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  _rlCfg.paper_mode      = !!document.getElementById('rl_paper_mode')?.checked;
  _rlCfg.kill_switch     = !!document.getElementById('rl_kill_switch')?.checked;
  _rlCfg.single_position_per_pair = !!document.getElementById('rl_single_position_per_pair')?.checked;
  _rlCfg.confluence_min = parseInt(document.getElementById('rl_confluence_min')?.value ?? '0', 10) || 0;
  _rlCfg.oi_confluence = !!document.getElementById('rl_oi_confluence')?.checked;
  _rlCfg.oi_override   = !!document.getElementById('rl_oi_override')?.checked;
  _rlCfg.oi_gamma_regime = !!document.getElementById('rl_oi_gamma_regime')?.checked;
  _rlCfg.oi_hold_break   = !!document.getElementById('rl_oi_hold_break')?.checked;
  _rlCfg.oi_break_pips   = Math.round(num('rl_oi_break_pips', RL_DEFAULTS.oi_break_pips));
  _rlCfg.oi_min_tier     = document.getElementById('rl_oi_min_tier')?.value || '';
  _rlCfg.risk_pct        = num('rl_risk_pct', RL_DEFAULTS.risk_pct);
  _rlCfg.max_lot         = num('rl_max_lot', RL_DEFAULTS.max_lot);
  _rlCfg.max_open        = Math.round(num('rl_max_open', RL_DEFAULTS.max_open));
  _rlCfg.max_spread_pips = num('rl_max_spread_pips', RL_DEFAULTS.max_spread_pips);
  _rlCfg.tick_secs       = Math.round(num('rl_tick_secs', RL_DEFAULTS.tick_secs));
  _rlCfg.status_secs     = Math.round(num('rl_status_secs', RL_DEFAULTS.status_secs));
  _rlCfg.plan_secs       = Math.round(num('rl_plan_secs', RL_DEFAULTS.plan_secs));
  _rlCfg.enabled_pairs   = (document.getElementById('rl_enabled_pairs')?.value || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const syms = {};
  RL_INDEX_KEYS.forEach(k => { const v = (document.getElementById(`rl_sym_${k}`)?.value || '').trim(); if (v) syms[k] = v; });
  _rlCfg.broker_symbols = syms;
}
async function loadRlConfig() {
  try { const stored = await kvGet('range_line_bot_config'); if (stored) _rlCfg = { ...RL_DEFAULTS, ...stored }; renderRlForm(); } catch (e) {}
}
async function saveRlConfig() {
  readRlForm();
  const el = document.getElementById('rlSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try { await kvSet('range_line_bot_config', _rlCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#4fd1c5'; setTimeout(() => { el.textContent = ''; }, 3000); }
  } catch (e) { if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; } }
}
function resetRlDefaults() {
  _rlCfg = { ...RL_DEFAULTS }; renderRlForm();
  const el = document.getElementById('rlSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}
async function loadRlCreds() { try { _applyCredsToForm(await kvGet('range_line_bot_credentials'), 'rl_', 'rl_mt5_password'); } catch (e) {} }
async function saveRlCreds() { await _saveCreds('range_line_bot_credentials', 'rl_', 'rl_mt5_password', 'rlCredsStatus'); }

async function loadRlLiveStatus() {
  const ageEl = document.getElementById('rlLiveAge'), modeEl = document.getElementById('rlLiveMode');
  const balEl = document.getElementById('rlLiveBal'), openEl = document.getElementById('rlOpenN');
  const uniEl = document.getElementById('rlUniN');
  try {
    const [st, planWrap] = await Promise.all([kvGet('range_line_bot_status'), kvGet('range_line_bot_plan')]);
    if (!st) { if (ageEl) ageEl.textContent = 'Bot not running — no status yet'; return; }
    if (ageEl)  { ageEl.textContent = st.running ? (st.forming ? 'Running · Asia range forming (no entries until 06:00 London)' : 'Running') : 'Idle';
                  ageEl.style.color = st.forming ? 'var(--amber)' : 'var(--text3)'; }
    if (modeEl) { modeEl.textContent = st.mode === 'live' ? '🟢 LIVE' : '📄 PAPER'; modeEl.style.color = st.mode === 'live' ? 'var(--green)' : 'var(--amber)'; }
    if (balEl)  balEl.textContent  = st.balance != null ? `Balance ${st.balance}` : '';
    if (openEl) openEl.textContent = (st.mt5_positions || []).length;
    if (uniEl)  uniEl.textContent  = (st.universe || []).length;
    const pa = document.getElementById('rlPlanAge');
    if (pa) pa.textContent = planWrap?.generatedAt ? new Date(planWrap.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
    const body = document.getElementById('rlLinesBody');
    if (body) {
      const rows = st.lines || [];
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--text3)">Bot running but no ladders yet — waiting for the daily plan + the London window to close</td></tr>';
      } else {
        const d = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : (/nq|spx|us30|us2000|de30|dax|ftse|uk100|dow/i.test(sym) ? 1 : 5));
        const rng = (sym, lad) => lad ? `${d(sym, lad.low)} – ${d(sym, lad.high)}` : '—';
        body.innerHTML = rows.map(r => {
          const lads = r.ladders || {};
          return `<tr>
            <td style="padding:5px 10px;font-weight:600;text-align:left">${r.instrument.toUpperCase()}</td>
            <td style="padding:5px 10px;text-align:right">${d(r.instrument, r.price)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${rng(r.instrument, lads.A)}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${rng(r.instrument, lads.M)}</td>
            <td style="padding:5px 10px;text-align:left;color:var(--text3)">${(r.taken && r.taken.length) ? r.taken.join(', ') : '—'}</td>
            <td style="padding:5px 10px;text-align:right;color:var(--text3)">${((lads.A?.levels||[]).length + (lads.M?.levels||[]).length) || '—'}</td>
          </tr>`;
        }).join('');
      }
    }
  } catch (e) { if (ageEl) { ageEl.textContent = e.message; } }
}

window.saveRlConfig = saveRlConfig; window.resetRlDefaults = resetRlDefaults;
window.saveRlCreds = saveRlCreds; window.loadRlLiveStatus = loadRlLiveStatus;

document.querySelector('.tab-btn[data-tab="rangeline"]')?.addEventListener('click', loadRlLiveStatus);
loadRlConfig();
loadRlCreds();
loadRlLiveStatus();

// ── OI Gamma Bot config ───────────────────────────────────────────────────────
// ONE config object (oi_bot_config) with TWO disjoint readers: the camelCase
// STRATEGY keys are read by the server plan producer (js/oiZones.js), the snake
// EXECUTION keys by the Python bot (oi_bot/oi_bot.py). No key overlap.
const OI_DEFAULTS = {
  // strategy (server plan producer)
  minTier: 'strong', slBufferPips: 15, breakPips: 20, nearExpiryDTE: 2, extendedPips: 30,
  fadeInPin: true, followBreaks: true, maxPainReversion: true, levelLadderTP: false,
  reactAtLevels: false, reactMinTier: 'moderate', reactBreakoutTrim: 0.6,
  requireEstablished: false, avoidLiquidating: true, maxZonesPerSide: 4,
  secondaryTrim: 0.6, reachMult: 1.0, reachTrim: 0.7, maxReachPips: 0,   // PIN nearest-primary + reachability gate
  persistenceWeight: 0.1, persistentDTE: 5,                              // across-expiry durability rank/size
  pathBlockCheck: true, blockMinTier: 'moderate', blockTrim: 0.9,        // nearer-wall-in-the-path flag/trim
  fallbackTpR: 0, fxFallbackTpR: 2.0,                                    // measured-move TP for wall-less trades
  vannaBoost: 1.15, vannaTrim: 0.85, charmBoost: 1.2,                    // greek conditioners
  fx_enabled: false, fx_pairs: [],
  // strategy — 2026-08 quant-review additions (see MD files/OI_BOT_QUANT_REVIEW_2026-08.md)
  slBufferRefFrac: 0.10, breakRefFrac: 0.15, extendedRefFrac: 0.25,   // distances = max(pips, frac × refMove)
  minRR: 0.8, gexNeutralBand: 0.25, convictionSizing: true, holdScore: true,
  subTierTrade: false, subTierSize: 0.4, minZoneSpacing: 0.05, volMagnetMinShare: 0.25,
  reactNodes: { walls: 1.0, gammaFlip: 0.8, gexFlip: 0.8, vannaFlip: 0.6, volMagnets: 0.6 },
  // execution (the bot)
  paper_mode: true, kill_switch: false, risk_pct: 0.5, max_lot: 2.0, max_open: 12,
  touch_tol_pips: 2, max_spread_pips: null, tick_secs: 3, status_secs: 30, plan_secs: 600,
  stack_guard: true, stack_guard_pips: 10,   // refuse a 2nd same-dir entry within N pips of an open one (one bet, not two)
  enabled_pairs: [], broker_symbols: {},
  // execution — 2026-08 additions
  max_open_risk_pct: 2.0, max_group_positions: { index: 2 }, plan_max_age_hours: 24,
  break_hold_ticks: 2, approach_trim: 0.7, scale_out: false, be_at_tp1: true,
  max_hold_hours: { fade: 48, break: 24, maxpain: 24, react: 24},   // per-mode time exits (0 = off)
  // telegram entry alerts (blank token/chat → shared tg_config)
  tg_enabled: false, tg_token: '', tg_chat_id: '',
};
const OI_INDEX_KEYS = ['nq', 'spx', 'dax', 'dow', 'rut'];
let _oiCfg = { ...OI_DEFAULTS };

function renderOiForm() {
  const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  chk('oi_fx_enabled', _oiCfg.fx_enabled);
  set('oi_fx_pairs', (_oiCfg.fx_pairs ?? []).join(', '));
  set('oi_min_tier', _oiCfg.minTier ?? 'strong');
  set('oi_max_zones_per_side', _oiCfg.maxZonesPerSide ?? OI_DEFAULTS.maxZonesPerSide);
  chk('oi_fade_in_pin', _oiCfg.fadeInPin ?? true);
  chk('oi_follow_breaks', _oiCfg.followBreaks ?? true);
  chk('oi_maxpain_reversion', _oiCfg.maxPainReversion ?? true);
  chk('oi_level_ladder_tp', _oiCfg.levelLadderTP ?? false);
  chk('oi_react_at_levels', _oiCfg.reactAtLevels ?? false);
  set('oi_react_min_tier', _oiCfg.reactMinTier ?? 'moderate');
  set('oi_react_breakout_trim', _oiCfg.reactBreakoutTrim ?? OI_DEFAULTS.reactBreakoutTrim);
  chk('oi_avoid_liquidating', _oiCfg.avoidLiquidating ?? true);
  chk('oi_require_established', _oiCfg.requireEstablished);
  set('oi_sl_buffer_pips', _oiCfg.slBufferPips ?? OI_DEFAULTS.slBufferPips);
  set('oi_break_pips', _oiCfg.breakPips ?? OI_DEFAULTS.breakPips);
  set('oi_near_expiry_dte', _oiCfg.nearExpiryDTE ?? OI_DEFAULTS.nearExpiryDTE);
  set('oi_extended_pips', _oiCfg.extendedPips ?? OI_DEFAULTS.extendedPips);
  set('oi_sl_buffer_ref_frac', _oiCfg.slBufferRefFrac ?? OI_DEFAULTS.slBufferRefFrac);
  set('oi_break_ref_frac', _oiCfg.breakRefFrac ?? OI_DEFAULTS.breakRefFrac);
  set('oi_extended_ref_frac', _oiCfg.extendedRefFrac ?? OI_DEFAULTS.extendedRefFrac);
  set('oi_min_rr', _oiCfg.minRR ?? OI_DEFAULTS.minRR);
  set('oi_gex_neutral_band', _oiCfg.gexNeutralBand ?? OI_DEFAULTS.gexNeutralBand);
  chk('oi_conviction_sizing', _oiCfg.convictionSizing ?? true);
  chk('oi_hold_score', _oiCfg.holdScore ?? true);
  set('oi_min_zone_spacing', _oiCfg.minZoneSpacing ?? OI_DEFAULTS.minZoneSpacing);
  chk('oi_sub_tier_trade', _oiCfg.subTierTrade ?? false);
  set('oi_sub_tier_size', _oiCfg.subTierSize ?? OI_DEFAULTS.subTierSize);
  set('oi_vol_magnet_min_share', _oiCfg.volMagnetMinShare ?? OI_DEFAULTS.volMagnetMinShare);
  const rw = { ...OI_DEFAULTS.reactNodes, ...(_oiCfg.reactNodes || {}) };
  set('oi_rw_walls', rw.walls); set('oi_rw_gamma', rw.gammaFlip); set('oi_rw_gex', rw.gexFlip);
  set('oi_rw_vanna', rw.vannaFlip); set('oi_rw_vol', rw.volMagnets);
  set('oi_secondary_trim', _oiCfg.secondaryTrim ?? OI_DEFAULTS.secondaryTrim);
  set('oi_reach_mult', _oiCfg.reachMult ?? OI_DEFAULTS.reachMult);
  set('oi_reach_trim', _oiCfg.reachTrim ?? OI_DEFAULTS.reachTrim);
  set('oi_max_reach_pips', _oiCfg.maxReachPips ?? OI_DEFAULTS.maxReachPips);
  set('oi_persistence_weight', _oiCfg.persistenceWeight ?? OI_DEFAULTS.persistenceWeight);
  set('oi_persistent_dte', _oiCfg.persistentDTE ?? OI_DEFAULTS.persistentDTE);
  chk('oi_path_block_check', _oiCfg.pathBlockCheck ?? true);
  set('oi_block_min_tier', _oiCfg.blockMinTier ?? OI_DEFAULTS.blockMinTier);
  set('oi_block_trim', _oiCfg.blockTrim ?? OI_DEFAULTS.blockTrim);
  set('oi_fallback_tp_r', _oiCfg.fallbackTpR ?? OI_DEFAULTS.fallbackTpR);
  set('oi_fx_fallback_tp_r', _oiCfg.fxFallbackTpR ?? OI_DEFAULTS.fxFallbackTpR);
  set('oi_vanna_boost', _oiCfg.vannaBoost ?? OI_DEFAULTS.vannaBoost);
  set('oi_vanna_trim', _oiCfg.vannaTrim ?? OI_DEFAULTS.vannaTrim);
  set('oi_charm_boost', _oiCfg.charmBoost ?? OI_DEFAULTS.charmBoost);
  const mh = { ...OI_DEFAULTS.max_hold_hours, ...(_oiCfg.max_hold_hours || {}) };
  set('oi_mh_fade', mh.fade); set('oi_mh_break', mh.break); set('oi_mh_maxpain', mh.maxpain); set('oi_mh_react', mh.react);
  set('oi_max_open_risk_pct', _oiCfg.max_open_risk_pct ?? OI_DEFAULTS.max_open_risk_pct);
  set('oi_group_index_cap', (_oiCfg.max_group_positions || {}).index ?? 0);
  set('oi_plan_max_age_hours', _oiCfg.plan_max_age_hours ?? OI_DEFAULTS.plan_max_age_hours);
  set('oi_break_hold_ticks', _oiCfg.break_hold_ticks ?? OI_DEFAULTS.break_hold_ticks);
  set('oi_approach_trim', _oiCfg.approach_trim ?? OI_DEFAULTS.approach_trim);
  chk('oi_scale_out', _oiCfg.scale_out ?? false);
  chk('oi_be_at_tp1', _oiCfg.be_at_tp1 ?? true);
  chk('oi_paper_mode', _oiCfg.paper_mode ?? true);
  chk('oi_kill_switch', _oiCfg.kill_switch);
  set('oi_risk_pct', _oiCfg.risk_pct ?? OI_DEFAULTS.risk_pct);
  set('oi_max_lot', _oiCfg.max_lot ?? OI_DEFAULTS.max_lot);
  set('oi_max_open', _oiCfg.max_open ?? OI_DEFAULTS.max_open);
  set('oi_touch_tol_pips', _oiCfg.touch_tol_pips ?? OI_DEFAULTS.touch_tol_pips);
  chk('oi_stack_guard', _oiCfg.stack_guard ?? true);
  set('oi_stack_guard_pips', _oiCfg.stack_guard_pips ?? OI_DEFAULTS.stack_guard_pips);
  set('oi_max_spread_pips', _oiCfg.max_spread_pips ?? '');
  set('oi_enabled_pairs', (_oiCfg.enabled_pairs ?? []).join(', '));
  set('oi_tick_secs', _oiCfg.tick_secs ?? OI_DEFAULTS.tick_secs);
  set('oi_status_secs', _oiCfg.status_secs ?? OI_DEFAULTS.status_secs);
  set('oi_plan_secs', _oiCfg.plan_secs ?? OI_DEFAULTS.plan_secs);
  const syms = _oiCfg.broker_symbols || {};
  OI_INDEX_KEYS.forEach(k => { const el = document.getElementById(`oi_sym_${k}`); if (el) el.value = syms[k] ?? ''; });
  chk('oi_tg_enabled', _oiCfg.tg_enabled);
  set('oi_tg_token', _oiCfg.tg_token ?? '');
  set('oi_tg_chat_id', _oiCfg.tg_chat_id ?? '');
}
function readOiForm() {
  const num = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  const list = id => (document.getElementById(id)?.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  _oiCfg.fx_enabled = !!document.getElementById('oi_fx_enabled')?.checked;
  _oiCfg.fx_pairs = list('oi_fx_pairs');
  _oiCfg.minTier = document.getElementById('oi_min_tier')?.value || 'strong';
  _oiCfg.maxZonesPerSide = Math.round(num('oi_max_zones_per_side', OI_DEFAULTS.maxZonesPerSide));
  _oiCfg.fadeInPin = !!document.getElementById('oi_fade_in_pin')?.checked;
  _oiCfg.followBreaks = !!document.getElementById('oi_follow_breaks')?.checked;
  _oiCfg.maxPainReversion = !!document.getElementById('oi_maxpain_reversion')?.checked;
  _oiCfg.levelLadderTP = !!document.getElementById('oi_level_ladder_tp')?.checked;
  _oiCfg.reactAtLevels = !!document.getElementById('oi_react_at_levels')?.checked;
  _oiCfg.reactMinTier = document.getElementById('oi_react_min_tier')?.value || 'moderate';
  _oiCfg.reactBreakoutTrim = num('oi_react_breakout_trim', OI_DEFAULTS.reactBreakoutTrim);
  _oiCfg.avoidLiquidating = !!document.getElementById('oi_avoid_liquidating')?.checked;
  _oiCfg.requireEstablished = !!document.getElementById('oi_require_established')?.checked;
  _oiCfg.slBufferPips = num('oi_sl_buffer_pips', OI_DEFAULTS.slBufferPips);
  _oiCfg.breakPips = num('oi_break_pips', OI_DEFAULTS.breakPips);
  _oiCfg.nearExpiryDTE = Math.round(num('oi_near_expiry_dte', OI_DEFAULTS.nearExpiryDTE));
  _oiCfg.extendedPips = num('oi_extended_pips', OI_DEFAULTS.extendedPips);
  _oiCfg.slBufferRefFrac = num('oi_sl_buffer_ref_frac', OI_DEFAULTS.slBufferRefFrac);
  _oiCfg.breakRefFrac = num('oi_break_ref_frac', OI_DEFAULTS.breakRefFrac);
  _oiCfg.extendedRefFrac = num('oi_extended_ref_frac', OI_DEFAULTS.extendedRefFrac);
  _oiCfg.minRR = num('oi_min_rr', OI_DEFAULTS.minRR);
  _oiCfg.gexNeutralBand = num('oi_gex_neutral_band', OI_DEFAULTS.gexNeutralBand);
  _oiCfg.convictionSizing = !!document.getElementById('oi_conviction_sizing')?.checked;
  _oiCfg.holdScore = !!document.getElementById('oi_hold_score')?.checked;
  _oiCfg.minZoneSpacing = num('oi_min_zone_spacing', OI_DEFAULTS.minZoneSpacing);
  _oiCfg.subTierTrade = !!document.getElementById('oi_sub_tier_trade')?.checked;
  _oiCfg.subTierSize = num('oi_sub_tier_size', OI_DEFAULTS.subTierSize);
  _oiCfg.volMagnetMinShare = num('oi_vol_magnet_min_share', OI_DEFAULTS.volMagnetMinShare);
  _oiCfg.reactNodes = {
    walls: num('oi_rw_walls', OI_DEFAULTS.reactNodes.walls),
    gammaFlip: num('oi_rw_gamma', OI_DEFAULTS.reactNodes.gammaFlip),
    gexFlip: num('oi_rw_gex', OI_DEFAULTS.reactNodes.gexFlip),
    vannaFlip: num('oi_rw_vanna', OI_DEFAULTS.reactNodes.vannaFlip),
    volMagnets: num('oi_rw_vol', OI_DEFAULTS.reactNodes.volMagnets),
  };
  _oiCfg.secondaryTrim = num('oi_secondary_trim', OI_DEFAULTS.secondaryTrim);
  _oiCfg.reachMult = num('oi_reach_mult', OI_DEFAULTS.reachMult);
  _oiCfg.reachTrim = num('oi_reach_trim', OI_DEFAULTS.reachTrim);
  _oiCfg.maxReachPips = num('oi_max_reach_pips', OI_DEFAULTS.maxReachPips);
  _oiCfg.persistenceWeight = num('oi_persistence_weight', OI_DEFAULTS.persistenceWeight);
  _oiCfg.persistentDTE = Math.round(num('oi_persistent_dte', OI_DEFAULTS.persistentDTE));
  _oiCfg.pathBlockCheck = !!document.getElementById('oi_path_block_check')?.checked;
  _oiCfg.blockMinTier = document.getElementById('oi_block_min_tier')?.value || OI_DEFAULTS.blockMinTier;
  _oiCfg.blockTrim = num('oi_block_trim', OI_DEFAULTS.blockTrim);
  _oiCfg.fallbackTpR = num('oi_fallback_tp_r', OI_DEFAULTS.fallbackTpR);
  _oiCfg.fxFallbackTpR = num('oi_fx_fallback_tp_r', OI_DEFAULTS.fxFallbackTpR);
  _oiCfg.vannaBoost = num('oi_vanna_boost', OI_DEFAULTS.vannaBoost);
  _oiCfg.vannaTrim = num('oi_vanna_trim', OI_DEFAULTS.vannaTrim);
  _oiCfg.charmBoost = num('oi_charm_boost', OI_DEFAULTS.charmBoost);
  _oiCfg.max_hold_hours = {
    fade: num('oi_mh_fade', OI_DEFAULTS.max_hold_hours.fade),
    break: num('oi_mh_break', OI_DEFAULTS.max_hold_hours.break),
    maxpain: num('oi_mh_maxpain', OI_DEFAULTS.max_hold_hours.maxpain),
    react: num('oi_mh_react', OI_DEFAULTS.max_hold_hours.react),
  };
  _oiCfg.max_open_risk_pct = num('oi_max_open_risk_pct', OI_DEFAULTS.max_open_risk_pct);
  const _gidx = Math.round(num('oi_group_index_cap', 0));
  _oiCfg.max_group_positions = _gidx > 0 ? { index: _gidx } : {};
  _oiCfg.plan_max_age_hours = num('oi_plan_max_age_hours', OI_DEFAULTS.plan_max_age_hours);
  _oiCfg.break_hold_ticks = Math.round(num('oi_break_hold_ticks', OI_DEFAULTS.break_hold_ticks));
  _oiCfg.approach_trim = num('oi_approach_trim', OI_DEFAULTS.approach_trim);
  _oiCfg.scale_out = !!document.getElementById('oi_scale_out')?.checked;
  _oiCfg.be_at_tp1 = !!document.getElementById('oi_be_at_tp1')?.checked;
  _oiCfg.paper_mode = !!document.getElementById('oi_paper_mode')?.checked;
  _oiCfg.kill_switch = !!document.getElementById('oi_kill_switch')?.checked;
  _oiCfg.risk_pct = num('oi_risk_pct', OI_DEFAULTS.risk_pct);
  _oiCfg.max_lot = num('oi_max_lot', OI_DEFAULTS.max_lot);
  _oiCfg.max_open = Math.round(num('oi_max_open', OI_DEFAULTS.max_open));
  _oiCfg.touch_tol_pips = num('oi_touch_tol_pips', OI_DEFAULTS.touch_tol_pips);
  _oiCfg.stack_guard = !!document.getElementById('oi_stack_guard')?.checked;
  _oiCfg.stack_guard_pips = num('oi_stack_guard_pips', OI_DEFAULTS.stack_guard_pips);
  const ms = document.getElementById('oi_max_spread_pips')?.value;
  _oiCfg.max_spread_pips = (ms === '' || ms == null) ? null : (parseFloat(ms) || null);
  _oiCfg.enabled_pairs = list('oi_enabled_pairs');
  _oiCfg.tick_secs = Math.round(num('oi_tick_secs', OI_DEFAULTS.tick_secs));
  _oiCfg.status_secs = Math.round(num('oi_status_secs', OI_DEFAULTS.status_secs));
  _oiCfg.plan_secs = Math.round(num('oi_plan_secs', OI_DEFAULTS.plan_secs));
  const syms = {};
  OI_INDEX_KEYS.forEach(k => { const v = (document.getElementById(`oi_sym_${k}`)?.value || '').trim(); if (v) syms[k] = v; });
  _oiCfg.broker_symbols = syms;
  _oiCfg.tg_enabled = !!document.getElementById('oi_tg_enabled')?.checked;
  _oiCfg.tg_token = (document.getElementById('oi_tg_token')?.value || '').trim();
  _oiCfg.tg_chat_id = (document.getElementById('oi_tg_chat_id')?.value || '').trim();
}
async function loadOiConfig() {
  try { const stored = await kvGet('oi_bot_config'); if (stored) _oiCfg = { ...OI_DEFAULTS, ...stored }; renderOiForm(); } catch (e) {}
}
async function saveOiConfig() {
  readOiForm();
  const el = document.getElementById('oiSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try { await kvSet('oi_bot_config', _oiCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#4dd0e1'; setTimeout(() => { el.textContent = ''; }, 3000); }
  } catch (e) { if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; } }
}
function resetOiDefaults() {
  _oiCfg = { ...OI_DEFAULTS }; renderOiForm();
  const el = document.getElementById('oiSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}
async function loadOiCreds() { try { _applyCredsToForm(await kvGet('oi_bot_credentials'), 'oi_', 'oi_mt5_password'); } catch (e) {} }
async function saveOiCreds() { await _saveCreds('oi_bot_credentials', 'oi_', 'oi_mt5_password', 'oiCredsStatus'); }

async function loadOiLiveStatus() {
  const ageEl = document.getElementById('oiLiveAge'), modeEl = document.getElementById('oiLiveMode');
  const balEl = document.getElementById('oiLiveBal'), openEl = document.getElementById('oiOpenN');
  const uniEl = document.getElementById('oiUniN'), paEl = document.getElementById('oiPlanAge');
  try {
    const [st, planWrap] = await Promise.all([kvGet('oi_bot_status'), kvGet('oi_bot_zones')]);
    if (paEl) paEl.textContent = planWrap?.generatedAt ? new Date(planWrap.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
    const body = document.getElementById('oiLinesBody');
    // Prefer the bot's live lines; fall back to the plan itself so the table shows
    // the planned zones even before the bot is running.
    const rows = st?.lines || Object.entries(planWrap?.instruments || {}).map(([k, v]) =>
      ({ instrument: k, regime: v.regime, spot: v.spot, maxPain: v.maxPain, zoneCount: v.zoneCount, stale: v.stale, entered: [] }));
    // Carry the plan's stale flag onto the bot's own lines too (status may omit it).
    const _staleBy = Object.fromEntries(Object.entries(planWrap?.instruments || {}).map(([k, v]) => [k, v.stale]));
    if (!st) { if (ageEl) ageEl.textContent = planWrap ? 'Bot not running — showing the plan' : 'Bot not running — no plan yet'; }
    else {
      if (ageEl)  { ageEl.textContent = st.running ? 'Running' : 'Idle'; ageEl.style.color = 'var(--text3)'; }
      if (modeEl) { modeEl.textContent = st.mode === 'live' ? '🟢 LIVE' : '📄 PAPER'; modeEl.style.color = st.mode === 'live' ? 'var(--green)' : 'var(--amber)'; }
      if (balEl)  balEl.textContent = st.balance != null ? `Balance ${st.balance}` : '';
    }
    if (openEl) openEl.textContent = (st?.mt5_positions || []).length;
    if (uniEl)  uniEl.textContent  = rows.length;
    if (body) {
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text3)">No OI plan yet — paste the OI heatmap on index.html, then refresh the plan</td></tr>';
      } else {
        const d = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : (/^(nq|spx|dax|dow|rut|de30|us30|us2000|ftse|uk100)$/i.test(sym) ? 1 : (/gold|xau/i.test(sym) ? 2 : 5)));
        const regCol = r => r === 'PIN' ? 'var(--green)' : r === 'BREAKOUT' ? 'var(--red)' : 'var(--text3)';
        // Primed = zones the bot skipped because price had already passed their entry when the
        // plan armed. Show the count + a hover with WHEN and how far past, so a "hit but no
        // trade" is self-explaining (was invisible before). `past` is in the instrument's price
        // units; `at` is epoch seconds from the bot.
        const primedCell = (r) => {
          const p = r.primed || [];
          if (!p.length) return '<span style="color:var(--text3)">—</span>';
          const tip = p.map(z => {
            const t = z.at ? new Date(z.at * 1000).toISOString().slice(11, 19) + 'Z' : '?';
            return `${z.zone_id}: primed ${t} @ ${z.price} — ${z.past} past entry ${z.entry}`;
          }).join('\n').replace(/"/g, '');
          return `<span title="${tip}" style="color:var(--amber);cursor:help">${p.length} ⓘ</span>`;
        };
        body.innerHTML = rows.map(r => {
          const stale = r.stale || _staleBy[r.instrument];
          return `<tr style="border-top:1px solid var(--border)"${stale ? ' title="' + String(stale).replace(/"/g, '') + '"' : ''}>
          <td style="padding:6px 10px;font-weight:600">${r.instrument}${stale ? ' <span style="color:var(--amber);font-weight:400">⚠</span>' : ''}</td>
          <td style="padding:6px 10px;color:${stale ? 'var(--amber)' : regCol(r.regime)}">${stale ? 'stale — re-paste' : (r.regime || '—')}</td>
          <td style="padding:6px 10px;text-align:right">${d(r.instrument, r.spot)}</td>
          <td style="padding:6px 10px;text-align:right">${d(r.instrument, r.maxPain)}</td>
          <td style="padding:6px 10px;text-align:right">${stale ? '—' : (r.zoneCount ?? 0)}</td>
          <td style="padding:6px 10px;color:var(--text3)">${(r.entered || []).length}</td>
          <td style="padding:6px 10px">${primedCell(r)}</td>
        </tr>`; }).join('');
      }
    }
  } catch (e) { if (ageEl) { ageEl.textContent = e.message; } }
}

// Push the current OI plan to Telegram — one pretty message per chart (levels +
// direction + SL/TP + why). Saves config first so a just-typed token/chat applies.
async function pushOiLevels() {
  const el = document.getElementById('oiPushStatus');
  const set = (t, c) => { if (el) { el.textContent = t; el.style.color = c || 'var(--text3)'; } };
  try {
    await saveOiConfig();
    set('Sending…');
    const r = await fetch('/api/oi-bot/broadcast', { method: 'POST' });
    const j = await r.json();
    if (!j.ok) { set(`Error: ${j.error || 'failed'}`, 'var(--red)'); return; }
    if (!j.sent) { set('No charts with planned levels yet — paste OI + refresh the plan first', 'var(--amber)'); return; }
    set(`Sent ${j.sent} chart${j.sent === 1 ? '' : 's'} ✓`, '#4dd0e1');
    setTimeout(() => set(''), 4000);
  } catch (e) { set(`Error: ${e.message}`, 'var(--red)'); }
}

window.saveOiConfig = saveOiConfig; window.resetOiDefaults = resetOiDefaults;
window.saveOiCreds = saveOiCreds; window.loadOiLiveStatus = loadOiLiveStatus;
window.pushOiLevels = pushOiLevels;

document.querySelector('.tab-btn[data-tab="oibot"]')?.addEventListener('click', loadOiLiveStatus);
loadOiConfig();
loadOiCreds();
loadOiLiveStatus();

// ═══════════════════════════ YIELD-SPREAD BOT ═══════════════════════════════════
// Yield-spread z-score mean-reversion. Config → yield_spread_config; the server
// producer computes the daily z into yield_spread_plan; the bot pushes yield_spread_status.
const YS_DEFAULTS = {
  enabled: true, kill_switch: false, paper_mode: true,
  risk_pct: 0.5, sl_pct: 2.5, max_lot: 5.0, max_open: 6,
  entry_threshold: 2.0, z_window: 90, z_exit: 1.5, max_hold_days: 20,
  pairs: ['usdjpy', 'eurusd', 'gbpusd', 'audusd', 'usdcad', 'usdchf'],
  enabled_pairs: [], tick_secs: 10, status_secs: 60, plan_secs: 600,
  plan_utc_hour: 13, plan_utc_min: 5,
  tg_enabled: false, tg_token: '', tg_chat_id: '',
};
let _ysCfg = { ...YS_DEFAULTS };

function renderYsForm() {
  const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  chk('ys_paper_mode', _ysCfg.paper_mode ?? true);
  chk('ys_enabled', _ysCfg.enabled ?? true);
  chk('ys_kill_switch', _ysCfg.kill_switch);
  set('ys_entry_threshold', _ysCfg.entry_threshold ?? YS_DEFAULTS.entry_threshold);
  set('ys_z_window', _ysCfg.z_window ?? YS_DEFAULTS.z_window);
  set('ys_z_exit', _ysCfg.z_exit ?? YS_DEFAULTS.z_exit);
  set('ys_max_hold_days', _ysCfg.max_hold_days ?? YS_DEFAULTS.max_hold_days);
  set('ys_pairs', (_ysCfg.pairs ?? YS_DEFAULTS.pairs).join(', '));
  set('ys_risk_pct', _ysCfg.risk_pct ?? YS_DEFAULTS.risk_pct);
  set('ys_sl_pct', _ysCfg.sl_pct ?? YS_DEFAULTS.sl_pct);
  set('ys_max_lot', _ysCfg.max_lot ?? YS_DEFAULTS.max_lot);
  set('ys_max_open', _ysCfg.max_open ?? YS_DEFAULTS.max_open);
  set('ys_tick_secs', _ysCfg.tick_secs ?? YS_DEFAULTS.tick_secs);
  set('ys_status_secs', _ysCfg.status_secs ?? YS_DEFAULTS.status_secs);
  set('ys_plan_secs', _ysCfg.plan_secs ?? YS_DEFAULTS.plan_secs);
  set('ys_plan_utc_hour', _ysCfg.plan_utc_hour ?? YS_DEFAULTS.plan_utc_hour);
  set('ys_plan_utc_min', _ysCfg.plan_utc_min ?? YS_DEFAULTS.plan_utc_min);
  chk('ys_tg_enabled', _ysCfg.tg_enabled);
  set('ys_tg_token', _ysCfg.tg_token ?? '');
  set('ys_tg_chat_id', _ysCfg.tg_chat_id ?? '');
}
function readYsForm() {
  const numf = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  const list = id => (document.getElementById(id)?.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  _ysCfg.paper_mode = !!document.getElementById('ys_paper_mode')?.checked;
  _ysCfg.enabled = !!document.getElementById('ys_enabled')?.checked;
  _ysCfg.kill_switch = !!document.getElementById('ys_kill_switch')?.checked;
  _ysCfg.entry_threshold = numf('ys_entry_threshold', YS_DEFAULTS.entry_threshold);
  _ysCfg.z_window = Math.round(numf('ys_z_window', YS_DEFAULTS.z_window));
  _ysCfg.z_exit = numf('ys_z_exit', YS_DEFAULTS.z_exit);
  _ysCfg.max_hold_days = Math.round(numf('ys_max_hold_days', YS_DEFAULTS.max_hold_days));
  const pairs = list('ys_pairs');
  _ysCfg.pairs = pairs.length ? pairs : [...YS_DEFAULTS.pairs];
  _ysCfg.risk_pct = numf('ys_risk_pct', YS_DEFAULTS.risk_pct);
  _ysCfg.sl_pct = numf('ys_sl_pct', YS_DEFAULTS.sl_pct);
  _ysCfg.max_lot = numf('ys_max_lot', YS_DEFAULTS.max_lot);
  _ysCfg.max_open = Math.round(numf('ys_max_open', YS_DEFAULTS.max_open));
  _ysCfg.tick_secs = Math.round(numf('ys_tick_secs', YS_DEFAULTS.tick_secs));
  _ysCfg.status_secs = Math.round(numf('ys_status_secs', YS_DEFAULTS.status_secs));
  _ysCfg.plan_secs = Math.round(numf('ys_plan_secs', YS_DEFAULTS.plan_secs));
  _ysCfg.plan_utc_hour = Math.min(23, Math.max(0, Math.round(numf('ys_plan_utc_hour', YS_DEFAULTS.plan_utc_hour))));
  _ysCfg.plan_utc_min = Math.min(59, Math.max(0, Math.round(numf('ys_plan_utc_min', YS_DEFAULTS.plan_utc_min))));
  _ysCfg.tg_enabled = !!document.getElementById('ys_tg_enabled')?.checked;
  _ysCfg.tg_token = (document.getElementById('ys_tg_token')?.value || '').trim();
  _ysCfg.tg_chat_id = (document.getElementById('ys_tg_chat_id')?.value || '').trim();
}
async function loadYsConfig() {
  try { const stored = await kvGet('yield_spread_config'); if (stored) _ysCfg = { ...YS_DEFAULTS, ...stored }; renderYsForm(); } catch (e) {}
}
async function saveYsConfig() {
  readYsForm();
  const el = document.getElementById('ysSaveStatus');
  if (el) { el.textContent = 'Saving…'; el.style.color = 'var(--text3)'; }
  try { await kvSet('yield_spread_config', _ysCfg);
    if (el) { el.textContent = 'Saved ✓'; el.style.color = '#f472b6'; setTimeout(() => { el.textContent = ''; }, 3000); }
  } catch (e) { if (el) { el.textContent = `Error: ${e.message}`; el.style.color = 'var(--red)'; } }
}
function resetYsDefaults() {
  _ysCfg = { ...YS_DEFAULTS }; renderYsForm();
  const el = document.getElementById('ysSaveStatus');
  if (el) { el.textContent = 'Defaults restored — click Save to apply'; el.style.color = 'var(--text3)'; }
}
async function loadYsCreds() { try { _applyCredsToForm(await kvGet('yield_spread_credentials'), 'ys_', 'ys_mt5_password'); } catch (e) {} }
async function saveYsCreds() { await _saveCreds('yield_spread_credentials', 'ys_', 'ys_mt5_password', 'ysCredsStatus'); }

// Inline SVG sparkline of the z trajectory (last ~30 days) with the ±gate lines
// dashed and the zero line drawn, so you SEE how far the line sits from the trade
// gate and which way it's heading. Signed z: above 0 = LONG-side, below = SHORT-side.
function _ysSpark(history, thr) {
  const W = 130, H = 30, pad = 3;
  const zs = (history || []).map(h => h.z).filter(v => typeof v === 'number');
  if (zs.length < 2) return '<span style="color:var(--text3)">—</span>';
  // Symmetric y-range that always includes ±gate so the dashed gate lines are visible.
  const lim = Math.max(thr * 1.15, Math.max(...zs.map(Math.abs)) * 1.1, 0.5);
  const x = i => pad + (i / (zs.length - 1)) * (W - 2 * pad);
  const y = v => pad + (1 - (v + lim) / (2 * lim)) * (H - 2 * pad);
  const pts = zs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = zs[zs.length - 1];
  const lineCol = Math.abs(last) >= thr ? '#f59e0b' : '#f472b6';
  const gy1 = y(thr).toFixed(1), gy2 = y(-thr).toFixed(1), z0 = y(0).toFixed(1);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="vertical-align:middle">
    <line x1="0" y1="${z0}" x2="${W}" y2="${z0}" stroke="var(--border)" stroke-width="1"/>
    <line x1="0" y1="${gy1}" x2="${W}" y2="${gy1}" stroke="#ef4444" stroke-width="1" stroke-dasharray="2,2" opacity="0.55"/>
    <line x1="0" y1="${gy2}" x2="${W}" y2="${gy2}" stroke="#ef4444" stroke-width="1" stroke-dasharray="2,2" opacity="0.55"/>
    <polyline points="${pts}" fill="none" stroke="${lineCol}" stroke-width="1.5"/>
    <circle cx="${x(zs.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2" fill="${lineCol}"/>
  </svg>`;
}

// Horizontal bar: |z| as a fraction of the entry gate. Fills + warms as it nears
// the gate; amber "AT GATE" when |z| ≥ threshold (a trade fires).
function _ysGateBar(absz, thr) {
  const pct = Math.max(0, Math.min(100, (absz / thr) * 100));
  const col = pct >= 100 ? '#f59e0b' : pct >= 75 ? '#fb923c' : pct >= 40 ? '#38bdf8' : 'var(--text3)';
  const label = pct >= 100 ? 'AT GATE' : `${absz.toFixed(2)} / ${thr.toFixed(2)}`;
  const need = pct >= 100 ? '' : ` <span style="color:var(--text3)">(needs +${(thr - absz).toFixed(2)})</span>`;
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="flex:0 0 90px;height:8px;background:var(--s3);border-radius:4px;overflow:hidden">
      <div style="width:${pct.toFixed(0)}%;height:100%;background:${col}"></div>
    </div>
    <span style="color:${col};white-space:nowrap">${label}</span>${need}
  </div>`;
}

async function loadYsLiveStatus() {
  const ageEl = document.getElementById('ysLiveAge'), modeEl = document.getElementById('ysLiveMode');
  const balEl = document.getElementById('ysLiveBal'), openEl = document.getElementById('ysOpenN');
  const uniEl = document.getElementById('ysUniN'), paEl = document.getElementById('ysPlanAge');
  const noteEl = document.getElementById('ysGateNote');
  try {
    const [st, plan] = await Promise.all([kvGet('yield_spread_status'), kvGet('yield_spread_plan')]);
    if (paEl) paEl.textContent = plan?.generatedAt ? new Date(plan.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
    const thr = plan?.entryThreshold ?? YS_DEFAULTS.entry_threshold;
    // Merge: z + 30d history come from the plan (server-computed truth); live
    // position/held come from the bot's status. Works even before the bot runs.
    const posByPair = {};
    (st?.pairs || []).forEach(p => { posByPair[(p.pair || '').toLowerCase()] = p; });
    const sigs = plan?.signals || {};
    const rows = Object.keys(sigs).map(pair => {
      const s = sigs[pair], z = s.z;
      const dir = (typeof z === 'number') ? ((z > 0) !== !!s.inverted ? 'LONG' : 'SHORT') : null;
      const live = posByPair[pair.toLowerCase()] || {};
      const hist = s.history || [];
      const prevZ = hist.length >= 2 ? hist[hist.length - 2].z : null;
      return { pair, z, direction: dir, history: hist, prevZ, asOf: s.asOf,
               in_position: !!live.in_position, hold_days: live.hold_days };
    });
    // Liveness: how long since the bot last pushed status.
    if (!st) { if (ageEl) { ageEl.textContent = plan ? 'Bot not running — showing the plan' : 'Bot not running — no plan yet'; ageEl.style.color = 'var(--text3)'; } }
    else {
      const mins = st.pushed_at ? Math.round((Date.now() / 1000 - st.pushed_at) / 60) : null;
      const liveStr = mins == null ? '' : mins < 3 ? `updated ${mins}m ago 🟢` : mins < 15 ? `updated ${mins}m ago` : `⚠ no update in ${mins}m — bot may be stopped`;
      if (ageEl)  { ageEl.textContent = (st.running ? (st.plan_stale ? 'Running — plan STALE (entries halted)' : 'Running') : 'Idle') + (liveStr ? ' · ' + liveStr : ''); ageEl.style.color = (st.plan_stale || (mins != null && mins >= 15)) ? 'var(--amber)' : 'var(--text3)'; }
      if (modeEl) { modeEl.textContent = st.mode === 'live' ? '🟢 LIVE' : '📄 PAPER'; modeEl.style.color = st.mode === 'live' ? 'var(--green)' : 'var(--amber)'; }
      if (balEl)  balEl.textContent = st.balance != null ? `Balance ${st.balance}` : '';
    }
    if (openEl) openEl.textContent = (st?.mt5_positions || []).length;
    if (uniEl)  uniEl.textContent  = rows.length;
    // Gate note: how close is the closest pair?
    if (noteEl) {
      const closest = rows.filter(r => typeof r.z === 'number').sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
      noteEl.textContent = closest
        ? `entry gate |z| ≥ ${thr.toFixed(2)} · closest: ${closest.pair.toUpperCase()} at ${Math.abs(closest.z).toFixed(2)} (${Math.round(Math.abs(closest.z) / thr * 100)}% there)`
        : `entry gate |z| ≥ ${thr.toFixed(2)}`;
    }
    const body = document.getElementById('ysLinesBody');
    if (body) {
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--text3)">No plan yet — run <code>POST /api/yield-spread/refresh-plan</code> (needs FRED_KEY on the server)</td></tr>';
      } else {
        const dirCol = d => d === 'LONG' ? 'var(--green)' : d === 'SHORT' ? 'var(--red)' : 'var(--text3)';
        body.innerHTML = rows.map(r => {
          const hasZ = typeof r.z === 'number';
          const absz = hasZ ? Math.abs(r.z) : 0;
          // Δ vs yesterday in |z| — is the pair moving TOWARD (▲) or AWAY (▼) from the gate?
          let deltaCell = '<span style="color:var(--text3)">—</span>';
          if (hasZ && typeof r.prevZ === 'number') {
            const dAbs = absz - Math.abs(r.prevZ);
            const toward = dAbs > 0.0005, away = dAbs < -0.0005;
            const arrow = toward ? '▲' : away ? '▼' : '·';
            const col = toward ? '#f59e0b' : away ? 'var(--text3)' : 'var(--text3)';
            deltaCell = `<span style="color:${col}" title="${toward ? 'moving toward the gate' : away ? 'moving away from the gate' : 'flat'}">${arrow} ${dAbs >= 0 ? '+' : ''}${dAbs.toFixed(2)}</span>`;
          }
          const posCell = r.in_position
            ? `<span style="color:var(--green)">${r.direction || 'IN'}${r.hold_days != null ? ' · ' + r.hold_days + 'd' : ''}</span>`
            : '<span style="color:var(--text3)">flat</span>';
          return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:6px 10px;font-weight:600">${(r.pair || '').toUpperCase()}</td>
          <td style="padding:6px 10px;text-align:right">${hasZ ? (r.z > 0 ? '+' : '') + r.z.toFixed(2) : '—'} <span style="font-size:10px">${deltaCell}</span></td>
          <td style="padding:6px 10px">${hasZ ? _ysGateBar(absz, thr) : '—'}</td>
          <td style="padding:6px 10px;text-align:center">${_ysSpark(r.history, thr)}</td>
          <td style="padding:6px 10px;color:${dirCol(r.direction)}">${r.direction || '—'}</td>
          <td style="padding:6px 10px">${posCell}</td>
        </tr>`; }).join('');
      }
    }
  } catch (e) { if (ageEl) { ageEl.textContent = e.message; } }
}

window.saveYsConfig = saveYsConfig; window.resetYsDefaults = resetYsDefaults;
window.saveYsCreds = saveYsCreds; window.loadYsLiveStatus = loadYsLiveStatus;

document.querySelector('.tab-btn[data-tab="yieldspread"]')?.addEventListener('click', loadYsLiveStatus);
loadYsConfig();
loadYsCreds();
loadYsLiveStatus();

loadDaStatus();
loadGoldStatus();
loadGoldV2Status();
loadConfluenceStatus();
loadBtJournal();
loadHbConfig();
loadHbCreds();
loadHbStatus();
loadPhbConfig();
loadPhbCreds();
loadPhbStatus();
setInterval(loadBotStatus,    60_000);
setInterval(loadBtBotStatus,  60_000);
setInterval(loadRgBotStatus,  60_000);
setInterval(loadRgV2Status,   30_000);
setInterval(loadRgV7Status,   30_000);
setInterval(loadDaStatus,     60_000);
setInterval(loadGoldStatus,   60_000);
setInterval(loadGoldV2Status, 60_000);
setInterval(loadConfluenceStatus, 60_000);
setInterval(loadBtJournal,   120_000);
setInterval(loadHbStatus,     60_000);
setInterval(loadPhbStatus,    60_000);
