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
    if (!data) { setText('btBsAge', 'No status — bot may not have run'); return; }
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
  } catch (e) { /* non-critical */ }
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
// Full implementation lives in backtest-monitor.html

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

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('unlockBtn')?.addEventListener('click', forceUnlock);

loadConfig();
loadBtConfig();
loadRgConfig();
loadRgV2Config();
loadRgV7Config();
loadDaConfig();
loadGoldConfig();
loadCreds();
loadBtCreds();
loadRgCreds();
loadRgV2Creds();
loadRgV7Creds();
loadDaCreds();
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
        const opened = p.time_open ? new Date(p.time_open * 1000).toLocaleDateString() : '—';
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
};
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
    if (openEl) openEl.textContent = (st.mt5_positions || []).length;
    if (uniEl)  uniEl.textContent  = (st.universe || []).length;
    const pa = document.getElementById('vbPlanAge');
    if (pa) pa.textContent = planWrap?.generatedAt ? new Date(planWrap.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
    // Per-pair: today's forecast levels the bot pulled + live price.
    const body = document.getElementById('vbLinesBody');
    if (body) {
      const rows = st.lines || [];
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="11" style="padding:14px;text-align:center;color:var(--text3)">Bot running but no levels yet — waiting for the daily plan</td></tr>';
      } else {
        const d = (sym, v) => v == null ? '—' : (+v).toFixed(/jpy/i.test(sym) ? 3 : 5);
        const acted = a => (a && a.length) ? a.map(s => s.replace('_', ' ')).join(', ') : '—';
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
            <td style="padding:5px 10px;text-align:left;color:var(--text3)">${acted(r.acted)}</td>
            <td style="padding:5px 10px;text-align:center"><button type="button" onclick="openVbChart('${r.pair}')" title="Live line chart" style="background:var(--s3);color:var(--text2);border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer">📈</button></td>
          </tr>`;
        }).join('');
      }
    }
  } catch (e) { if (ageEl) { ageEl.textContent = e.message; } }
}

window.saveVbConfig = saveVbConfig; window.resetVbDefaults = resetVbDefaults;
window.saveVbCreds = saveVbCreds; window.loadVbLiveStatus = loadVbLiveStatus;

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

// ── Range-Line Bot config (mirrors the volatility bot) ────────────────────────
const RL_DEFAULTS = {
  paper_mode: true, kill_switch: false, risk_pct: 0.5, max_lot: 2.0, max_open: 12,
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

loadDaStatus();
loadGoldStatus();
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
setInterval(loadBtJournal,   120_000);
setInterval(loadHbStatus,     60_000);
setInterval(loadPhbStatus,    60_000);
