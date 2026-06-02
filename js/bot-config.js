// Bot configuration page — manages both the Telegram signal bot (bot_config KV)
// and the Backtest/MT5 bot (backtestsystem_live_config KV).

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
  await fetch('/api/kv/set', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key, data, timestamp: Date.now() }),
  });
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
  try {
    await kvSet('bot_config', _cfg);
    setStatus('ok', 'Saved — bot picks up on next loop');
  } catch (e) {
    setStatus('err', `Save failed: ${e.message}`);
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
  { id: 'rg_pair_XAUUSD', sym: 'XAU/USD' },
  { id: 'rg_pair_NAS100', sym: 'NAS100_USD' },
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
  { id: 'rgv2_pair_XAUUSD', sym: 'XAU/USD' },
  { id: 'rgv2_pair_NAS100',  sym: 'NAS100_USD' },
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

// ── Dyn Anchor Bot ────────────────────────────────────────────────────────────

const DA_DEFAULTS = {
  enabled:             true,
  paper_mode:          true,
  pairs:               ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  interval_secs:       60,
  trade_window_start:  '00:00',
  trade_window_end:    '22:00',
  eod_close_time:      '22:30',
  risk_pct:            1.0,
  max_lot:             5.0,
  max_spread_pips:     3.0,
  daily_bars_needed:   60,
  ewma_lambda:         0.94,
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
  { id: 'da_pair_GBPCHF', sym: 'GBP/CHF'  },
];

let _daCfg = JSON.parse(JSON.stringify(DA_DEFAULTS));

function readDaForm() {
  _daCfg.enabled            = chk('da_enabled');
  _daCfg.paper_mode         = chk('da_paper_mode');
  _daCfg.interval_secs      = num('da_interval_secs',      60);
  _daCfg.trade_window_start = str('da_window_start',    '00:00');
  _daCfg.trade_window_end   = str('da_window_end',      '22:00');
  _daCfg.eod_close_time     = str('da_eod_close_time',  '22:30');
  _daCfg.risk_pct           = num('da_risk_pct',          1.0);
  _daCfg.max_lot            = num('da_max_lot',            5.0);
  _daCfg.max_spread_pips    = num('da_max_spread_pips',    3.0);
  _daCfg.daily_bars_needed  = num('da_daily_bars_needed',  60);
  _daCfg.ewma_lambda        = num('da_ewma_lambda',        0.94);
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
  setVal('da_risk_pct',         _daCfg.risk_pct         ?? 1.0);
  setVal('da_max_lot',          _daCfg.max_lot          ?? 5.0);
  setVal('da_max_spread_pips',  _daCfg.max_spread_pips  ?? 3.0);
  setVal('da_daily_bars_needed',_daCfg.daily_bars_needed ?? 60);
  setVal('da_ewma_lambda',      _daCfg.ewma_lambda      ?? 0.94);
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

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('unlockBtn')?.addEventListener('click', forceUnlock);

loadConfig();
loadBtConfig();
loadRgConfig();
loadRgV2Config();
loadDaConfig();
loadCreds();
loadBtCreds();
loadRgCreds();
loadRgV2Creds();
loadDaCreds();
loadBotStatus();
loadBtBotStatus();
loadRgBotStatus();
loadRgV2Status();
loadDaStatus();
loadBtJournal();
setInterval(loadBotStatus,    60_000);
setInterval(loadBtBotStatus,  60_000);
setInterval(loadRgBotStatus,  60_000);
setInterval(loadRgV2Status,   30_000);
setInterval(loadDaStatus,     60_000);
setInterval(loadBtJournal,   120_000);
