// js/gold-app.js — Gold Macro Model page orchestrator
//
// Standalone page logic for gold.html. Imports shared modules, loads data,
// computes the gold macro model + vol regime, and renders all UI panels.
//
// Architecture:
//   init() → loadData() → setupState() → computeAll() → render()
//   startQuoteLoop() → 30s quote refresh → partial re-render

import { computeGoldMacroModel, computeGoldT1 } from './gold-model.js';
import { calculateVolRegime, calculatePivots }    from './vol.js';
import { calculateAsiaRanges, calculateMondayRanges } from './ranges.js';
import { filterConfluences, enhanceConfluences }   from './confluences.js';
import { S }                                        from './state.js';
import { PAIRS, CACHE_DURATION, CAP_DEFAULTS }      from './config.js';
import { loadCached, fetchAPI, getPipSize, getDigits, filterTradingDays } from './utils.js';
import { detectSession, computeSessionOpens, computeDailyOpens } from './session.js';

// ── Module-level state ─────────────────────────────────────────────────────────
let _model          = null;   // computeGoldMacroModel result
let _volRegime      = null;   // calculateVolRegime result
let _history        = null;   // 90-day FRED history
let _cotData        = null;   // COT KV data
let _liveQuote      = null;   // latest quote object
let _quoteTimer     = null;   // setInterval handle
let _enhancedConfs  = [];     // last computed enhanced confluence levels (shared between checklist + levels)

// ── Dark mode ─────────────────────────────────────────────────────────────────
// Apply saved preference on script load (before DOM is populated by render).
// Default: dark mode enabled.
const _savedDark = localStorage.getItem('gold_dark');
if (_savedDark === '0') {
  document.body.classList.remove('dark');
} else {
  document.body.classList.add('dark');
}

export function toggleDark() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('gold_dark', isDark ? '1' : '0');
  const btn = document.getElementById('darkToggle');
  if (btn) btn.textContent = isDark ? '☀ Light' : '🌙 Dark';
}

// ── Status / pill helpers ──────────────────────────────────────────────────────
function pill(id, state) {
  const el = document.getElementById(id);
  if (el) el.className = `dpill${state === 'ok' ? ' ok' : ''}`;
}

function setStatus(state, msg) {
  const dot = document.getElementById('sdot');
  const txt = document.getElementById('stxt');
  const cssMap = { loading: 'spin', ok: 'ok', error: 'err', warn: 'err' };
  if (dot) dot.className = `sdot ${cssMap[state] ?? ''}`;
  if (txt) txt.textContent = msg;
}

// ── Entry point ────────────────────────────────────────────────────────────────
export async function init() {
  setStatus('loading', 'Loading gold macro data…');
  try {
    const data = await loadData();
    setupState(data);
    const { model, volRegime } = computeAll(data);
    _model     = model;
    _volRegime = volRegime;
    _history   = data.history;
    _cotData   = data.cotData;
    _liveQuote = data.liveQuote;

    render(model, volRegime, data.history, data.cotData, data.liveQuote);
    setStatus('ok', 'Updated ' + new Date().toLocaleTimeString());

    // Log today's model state to the Gold Lab live dataset (localStorage).
    // This runs once per session so the ML training CSV grows automatically.
    if (model && typeof window.goldLabLog === 'function') {
      window.goldLabLog(buildLiveLogRow(model, data.liveQuote));
    }

    startQuoteLoop();
  } catch (err) {
    console.error('[gold-app] init error:', err);
    setStatus('error', 'Load failed: ' + err.message);
    const root = document.getElementById('goldRoot');
    if (root) {
      root.innerHTML = `<div class="gold-error-card">
        <h3>Failed to load Gold Macro Model</h3>
        <p>${escHtml(err.message)}</p>
        <p>Check that FRED_API_KEY is configured and the API server is running.</p>
      </div>`;
    }
  }
}

// ── Data fetching ──────────────────────────────────────────────────────────────
async function loadData() {
  // All fetches run in parallel — each uses loadCached with appropriate TTL.
  // COT data is fetched directly (server manages its own cache in KV).
  const [
    fredData,
    history,
    ohlcData,
    ohlc5mData,
    ohlc30mData,
    liveQuote,
    cotRaw,
    caps,
  ] = await Promise.allSettled([
    loadCached('gold_fred',       () => fetchAPI('/api/fred'),                          CACHE_DURATION.FRED),
    loadCached('gold_fredhistory',() => fetchAPI('/api/fredhistory?keys=tips,bei,vix,hy,dxy'), 6 * 60 * 60 * 1000),
    loadCached('gold_ohlc',       () => fetchAPI('/api/ohlc?symbol=XAU/USD'),           CACHE_DURATION.OHLC),
    loadCached('gold_ohlc5m',     () => fetchAPI('/api/oanda_ohlc5m?symbol=XAU/USD'),  CACHE_DURATION.OHLC5M),
    loadCached('gold_ohlc30m',    () => fetchAPI('/api/oanda_ohlc30m?symbol=XAU/USD'), CACHE_DURATION.OHLC30M),
    loadCached('gold_quote',      () => fetchAPI('/api/quote?symbol=XAU/USD'),          CACHE_DURATION.QUOTE),
    fetchAPI('/api/kv/get?key=cot_data'),
    fetchAPI('/api/config/caps'),
  ]);

  // Helper to unwrap settled results — logs warnings on failure
  function unwrap(settled, label, fallback = null) {
    if (settled.status === 'fulfilled') return settled.value;
    console.warn(`[gold-app] ${label} failed:`, settled.reason?.message);
    return fallback;
  }

  const cotRawData = unwrap(cotRaw, 'COT data', null);
  const cotData    = (cotRawData && !cotRawData.miss) ? cotRawData.data : null;

  return {
    fredData:   unwrap(fredData,   'FRED',          null),
    history:    unwrap(history,    'FRED history',  null),
    ohlcData:   unwrap(ohlcData,   'OHLC daily',    null),
    ohlc5mData: unwrap(ohlc5mData, 'OHLC 5m',       null),
    ohlc30mData:unwrap(ohlc30mData,'OHLC 30m',      null),
    liveQuote:  unwrap(liveQuote,  'Live quote',    null),
    cotData,
    caps:       unwrap(caps,       'Caps config',   CAP_DEFAULTS),
  };
}

// ── State population ───────────────────────────────────────────────────────────
function setupState(data) {
  // Wire S singleton so all shared modules can read gold data
  S.currentPair  = PAIRS.find(p => p.symbol === 'XAU/USD');
  S.fredData     = data.fredData;
  S.goldHistory  = data.history;   // enables acceleration + z-score in computeGoldMacroModel
  S._caps        = data.caps ?? CAP_DEFAULTS;

  if (data.ohlcData)   S.ohlcData['XAU/USD']  = data.ohlcData;
  if (data.ohlc5mData) S.ohlc5m['XAU/USD']    = data.ohlc5mData;
  if (data.ohlc30mData)S.ohlc30m['XAU/USD']   = data.ohlc30mData;

  // Compute session opens and daily opens before ranges (enhanceConfluences uses them)
  const bars5m  = data.ohlc5mData?.values ?? [];
  const bars1d  = data.ohlcData?.values   ?? [];
  const sessionOpens = computeSessionOpens(bars5m);
  const dailyOpens   = computeDailyOpens(bars1d, 30);
  const session      = detectSession();

  S.sessionData = {
    ...session,
    londonOpenPrice: sessionOpens.londonOpenPrice,
    nyOpenPrice:     sessionOpens.nyOpenPrice,
    dailyOpenPrice:  dailyOpens[0]?.price ?? null,
    dailyOpens,
  };

  // Asia / Monday ranges — populates S.asiaRangeData and S.mondayRangeData
  if (data.ohlc5mData?.values?.length) {
    try { calculateAsiaRanges('XAU/USD');   } catch(e) { console.warn('[gold-app] Asia ranges:', e.message); }
  }
  if (data.ohlc30mData?.values?.length) {
    try { calculateMondayRanges('XAU/USD'); } catch(e) { console.warn('[gold-app] Monday ranges:', e.message); }
  }
}

// ── Model computation ──────────────────────────────────────────────────────────
function computeAll(data) {
  let volRegime = null;
  if (data.ohlcData?.values?.length) {
    try {
      volRegime = calculateVolRegime();
    } catch(e) {
      console.warn('[gold-app] Vol regime:', e.message);
    }
  }
  S._goldVolRegime = volRegime;

  let model = null;
  if (data.fredData) {
    try {
      model = computeGoldMacroModel(volRegime);
      S.goldModel = model;
    } catch(e) {
      console.warn('[gold-app] Gold model:', e.message);
    }
  }

  return { model, volRegime };
}

// ── Top-level render ───────────────────────────────────────────────────────────
function render(model, volRegime, history, cotData, liveQuote) {
  const root = document.getElementById('goldRoot');
  if (!root) return;

  const priceNum = liveQuote
    ? parseFloat(liveQuote.price ?? liveQuote.close ?? liveQuote.ask ?? 0) || null
    : null;

  // Pre-compute enhanced confluences once — shared by checklist + levels sections.
  if (model && priceNum) {
    _enhancedConfs = _computeEnhancedConfs(model, priceNum);
  }

  // Update price pill + timestamp
  updatePricePill(liveQuote);
  const updTime = document.getElementById('updTime');
  if (updTime) updTime.textContent = new Date().toLocaleTimeString();

  // Assemble all panels into page
  let html = '';

  if (!model) {
    html += `<div class="gold-error-card">
      <strong>FRED data unavailable.</strong>
      The Gold Macro Model requires FRED API data (TIPS, BEI, VIX, HY, DXY).
      Ensure FRED_API_KEY is set in your server environment.
    </div>`;
  } else {
    // Checklist first — the live verdict that frames everything below
    html += renderChecklist(model, volRegime, cotData, liveQuote);
    html += renderRegimePanel(model);
    html += renderSignalAndWeights(model);
    html += renderLayers(model);
    html += renderBEIDecomp(model);
  }

  if (history) {
    html += renderSparklines(history);
  }

  if (model && priceNum != null) {
    html += renderLevels(model, liveQuote);
  }

  if (cotData || volRegime) {
    html += renderCOTAndVol(cotData, volRegime, model);
  }

  root.innerHTML = html;
}

// ── Shared confluence computation ──────────────────────────────────────────────
// Extracts and enhances confluences once per tick; result stored in _enhancedConfs
// so both renderChecklist and renderLevels read the same data.
function _computeEnhancedConfs(model, priceNum) {
  try {
    const asiaConfs   = S.asiaRangeData['XAU/USD']?.confluences   ?? [];
    const mondayConfs = S.mondayRangeData['XAU/USD']?.confluences ?? [];
    const all = [...asiaConfs, ...mondayConfs];
    if (!all.length) return [];

    let pivots = null;
    try { pivots = calculatePivots(); } catch(_) {}

    const bias = model.regimeBias === 'BULLISH' ? 'bullish'
               : model.regimeBias === 'BEARISH' ? 'bearish'
               : 'neutral';

    const filtered = filterConfluences(all);
    return _volRegime
      ? enhanceConfluences(filtered, priceNum, bias, pivots, _volRegime, model.goldScore)
      : filtered;
  } catch(e) {
    console.warn('[gold-app] _computeEnhancedConfs:', e.message);
    return [];
  }
}

// ── Trade checklist evaluator ──────────────────────────────────────────────────
function evaluateChecklist(model, volRegime, cotData, liveQuote) {
  const priceNum = liveQuote
    ? parseFloat(liveQuote.price ?? liveQuote.close ?? liveQuote.ask ?? 0) || null
    : null;
  const conf      = model.regimeConfidence;
  const isLong    = model.signal === 'BULLISH';
  const checks    = [];

  // ── 1. Regime confidence ───────────────────────────────────────────────────
  checks.push({
    id:     'regime_conf',
    label:  'Regime confidence',
    status: conf.confidence === 'HIGH'   ? 'pass'
          : conf.confidence === 'MEDIUM' ? 'warn'
          : 'fail',
    detail: `${conf.confidence} — ${escHtml(model.regimeLabel)}`,
    failMsg: 'LOW confidence — model is uncertain. Stand aside.',
  });

  // ── 2. Signal direction + strength ────────────────────────────────────────
  const strengthRank = { WEAK: 0, MODERATE: 1, STRONG: 2 };
  const sigOk = model.signal !== 'NEUTRAL' && strengthRank[model.strength] >= 1;
  checks.push({
    id:     'signal',
    label:  'Signal & strength',
    status: sigOk ? 'pass' : model.signal !== 'NEUTRAL' ? 'warn' : 'fail',
    detail: `${escHtml(model.signal)} ${escHtml(model.strength)} · score ${model.goldScore > 0 ? '+' : ''}${model.goldScore.toFixed(3)}`,
    failMsg: 'NEUTRAL or WEAK signal — no directional conviction.',
  });

  // ── 3. Layer 2 momentum alignment ─────────────────────────────────────────
  const l2 = model.layers.momentum;
  const l2Scores  = [l2.realYield.score, l2.breakeven.score, l2.dxy.score, l2.safeHaven.score];
  const aligned   = l2Scores.filter(s => isLong ? s > 0.05 : s < -0.05).length;
  const conflicts = l2Scores.filter(s => isLong ? s < -0.2  : s > 0.2).length;
  checks.push({
    id:     'momentum',
    label:  'Momentum layer (L2)',
    status: aligned >= 3 ? 'pass' : aligned >= 2 ? 'warn' : 'fail',
    detail: `${aligned}/4 factors confirm ${escHtml(model.signal.toLowerCase())}${conflicts > 1 ? ` · ${conflicts} conflicting` : ''}`,
    failMsg: 'Momentum factors not confirming. Rate-of-change is the alpha — wait for alignment.',
  });

  // ── 4. Regime stability ────────────────────────────────────────────────────
  checks.push({
    id:     'stability',
    label:  'Regime stability',
    status: conf.isTransitioning ? 'warn' : 'pass',
    detail: conf.isTransitioning
      ? `Transitioning · ${conf.signals.length} signal${conf.signals.length !== 1 ? 's' : ''} · size ×${conf.sizeMult}`
      : `Stable · persistence ${conf.hurstProxy != null ? Math.round(conf.hurstProxy * 100) + '%' : '—'}`,
    failMsg: null,
  });

  // ── 5. COT crowding ───────────────────────────────────────────────────────
  const xauCot = cotData?.['XAU/USD'] ?? cotData?.['XAUUSD'] ?? null;
  const levPct  = xauCot?.levPct ?? xauCot?.lev_pct ?? null;
  checks.push({
    id:     'cot',
    label:  'COT crowding',
    status: levPct == null ? 'warn'
          : levPct > 80    ? 'fail'
          : levPct > 60    ? 'warn'
          : 'pass',
    detail: levPct != null
      ? `Lev funds ${levPct.toFixed(0)}th pct${levPct > 80 ? ' — mean-reversion risk' : levPct > 60 ? ' — elevated' : ' — manageable'}`
      : 'COT data unavailable',
    failMsg: 'Extremely crowded positioning — mean-reversion risk. Avoid or reduce size heavily.',
  });

  // ── 6. Price at a model-aligned level (updates every 30s) ─────────────────
  const pipSize   = getPipSize('XAU/USD');
  const digits    = getDigits('XAU/USD');
  const aligned6  = _enhancedConfs.filter(c => {
    if (!priceNum) return false;
    const dir = c.direction ?? (c.price > priceNum ? 'short' : 'long');
    return (model.signal === 'BULLISH' && dir === 'long') ||
           (model.signal === 'BEARISH' && dir === 'short');
  });

  let levelStatus = 'fail', levelDetail = 'No model-aligned confluence levels available', nearestLevel = null;
  if (priceNum && aligned6.length) {
    const nearest   = aligned6.reduce((best, c) =>
      Math.abs(c.price - priceNum) < Math.abs(best.price - priceNum) ? c : best
    , aligned6[0]);
    nearestLevel    = nearest;
    const dist      = Math.abs(nearest.price - priceNum);
    const distPips  = Math.round(dist / pipSize);
    const above     = nearest.price > priceNum;
    levelStatus     = distPips <= 15 ? 'pass' : distPips <= 60 ? 'warn' : 'fail';
    const stars     = nearest.totalStars ?? nearest.stars ?? 0;
    const starsStr  = '★'.repeat(Math.min(5, stars));
    levelDetail     = distPips <= 15
      ? `AT LEVEL ${starsStr} — ${nearest.price.toFixed(digits)} (${distPips} pip${distPips !== 1 ? 's' : ''} ${above ? '↑' : '↓'})`
      : `Nearest: ${nearest.price.toFixed(digits)} ${starsStr} · ${distPips} pips ${above ? 'above' : 'below'}`;
  } else if (!priceNum) {
    levelDetail = 'Live quote unavailable';
    levelStatus = 'warn';
  }
  checks.push({
    id:         'level',
    label:      'At a model-aligned level',
    status:     levelStatus,
    detail:     levelDetail,
    isDynamic:  true,   // this row re-renders on every quote tick
    nearestLevel,
    failMsg:    'Price is not near any model-aligned confluence. Wait for price to come to a level.',
  });

  // ── 7. Position size (informational — always shows) ───────────────────────
  const regimeMult = conf.sizeMult;
  const volMult    = volRegime?.sizeMult ?? 1.0;
  const composite  = Math.round(regimeMult * volMult * 100) / 100;
  checks.push({
    id:     'size',
    label:  'Position size',
    status: 'info',
    detail: `×${composite.toFixed(2)} of base risk  (regime ×${regimeMult} · vol ×${volMult.toFixed(2)})`,
    failMsg: null,
  });

  return checks;
}

// ── Checklist verdict deriver ──────────────────────────────────────────────────
function deriveVerdict(checks, model) {
  const byId = Object.fromEntries(checks.map(c => [c.id, c]));
  const hardFails = ['regime_conf', 'signal', 'momentum'];
  const hasFail   = hardFails.some(id => byId[id]?.status === 'fail');
  const cotFail   = byId.cot?.status === 'fail';
  const atLevel   = byId.level?.status;
  const sizeMult  = byId.size?.detail.match(/×([\d.]+)/)?.[1] ?? '1.0';
  const dir       = model.signal === 'BULLISH' ? 'LONG' : model.signal === 'BEARISH' ? 'SHORT' : null;

  if (hasFail)  return { verdict: 'PASS',           cls: 'fail',  emoji: '⛔', sub: byId[hardFails.find(id => byId[id]?.status === 'fail')]?.failMsg ?? 'Critical check failed.' };
  if (cotFail)  return { verdict: 'REDUCE OR PASS', cls: 'warn',  emoji: '⚠',  sub: 'COT extremely crowded — mean-reversion risk elevated.' };
  if (atLevel === 'fail') return { verdict: `WAIT FOR LEVEL — ${dir}`, cls: 'wait', emoji: '⏳', sub: `Model says ${dir} but price is not near a model-aligned confluence. Do not chase.` };
  if (atLevel === 'warn') return { verdict: `APPROACHING — ${dir}`,   cls: 'wait', emoji: '👀', sub: `Price within 60 pips of nearest aligned level. Watch for entry.` };
  return { verdict: `TRADE READY — ${dir}`, cls: 'pass', emoji: '✅', sub: `All checks pass. Size ×${sizeMult} of base risk.`, dir };
}

// ── Checklist renderer ─────────────────────────────────────────────────────────
function renderChecklist(model, volRegime, cotData, liveQuote) {
  const checks  = evaluateChecklist(model, volRegime, cotData, liveQuote);
  const verdict = deriveVerdict(checks, model);

  const ICONS = { pass: '✅', warn: '⚠', fail: '❌', info: 'ℹ' };
  const rows  = checks.map(c => {
    const icon    = ICONS[c.status] ?? 'ℹ';
    const dynTag  = c.isDynamic ? '<span class="gold-ck-live-tag">LIVE</span>' : '';
    const warnRow = (c.status === 'fail' || c.status === 'warn') && c.failMsg
      ? `<div class="gold-ck-row-warn">${escHtml(c.failMsg)}</div>` : '';
    return `
    <div class="gold-ck-row gold-ck-${c.status}${c.isDynamic ? ' gold-ck-dynamic' : ''}">
      <span class="gold-ck-icon">${icon}</span>
      <span class="gold-ck-label">${escHtml(c.label)}${dynTag}</span>
      <span class="gold-ck-detail">${c.detail}</span>
    </div>${warnRow}`;
  }).join('');

  return `
  <div id="goldChecklistSection" class="gold-ck-card">
    <div class="gold-ck-verdict gold-ck-verdict-${verdict.cls}">
      <span class="gold-ck-verdict-emoji">${verdict.emoji}</span>
      <div class="gold-ck-verdict-body">
        <div class="gold-ck-verdict-title">${verdict.verdict}</div>
        <div class="gold-ck-verdict-sub">${escHtml(verdict.sub)}</div>
      </div>
      <div class="gold-ck-clock">
        <div class="gold-ck-clock-dot"></div>
        <span>Every 30s</span>
      </div>
    </div>
    <div class="gold-ck-rows">${rows}</div>
  </div>`;
}

// ── Regime Panel ───────────────────────────────────────────────────────────────
// Full-width card, most prominent — regime name, confidence, bias, description.
function renderRegimePanel(model) {
  const conf        = model.regimeConfidence;
  const borderColor = model.regimeBias === 'BULLISH' ? 'var(--green)'
                    : model.regimeBias === 'BEARISH' ? 'var(--red)'
                    : 'var(--amber)';

  const confColor = conf.confidence === 'HIGH'   ? 'var(--green)'
                  : conf.confidence === 'MEDIUM' ? 'var(--amber)'
                  : 'var(--red)';

  const biasColor = model.regimeBias === 'BULLISH' ? 'var(--green)'
                  : model.regimeBias === 'BEARISH' ? 'var(--red)'
                  : 'var(--amber)';

  const signalColor = model.signal === 'BULLISH' ? 'var(--green)'
                    : model.signal === 'BEARISH' ? 'var(--red)'
                    : 'var(--amber)';

  // Primary driver: weight factor with highest weight in current regime
  const weightEntries = Object.entries(model.weights);
  const topFactor     = weightEntries.reduce((a, b) => b[1] > a[1] ? b : a, weightEntries[0]);
  const FACTOR_LABELS = {
    realYieldLevel:    'Real Yield Level',
    realYieldMomentum: 'Real Yield Momentum',
    breakevenLevel:    'Breakeven Level',
    breakevenMomentum: 'Breakeven Momentum',
    dxyMomentum:       'DXY Momentum',
    safeHaven:         'Safe Haven / VIX',
  };
  const primaryDriver = FACTOR_LABELS[topFactor[0]] ?? topFactor[0];

  // Transition warning block
  let transitionHtml = '';
  if (conf.isTransitioning && conf.signals.length) {
    const items = conf.signals.map(s => `<li>${escHtml(s)}</li>`).join('');
    transitionHtml = `
      <div class="gold-transition-warning">
        <strong>⚠ Regime transition signals detected — reduce size to ×${conf.sizeMult}</strong>
        <ul>${items}</ul>
      </div>`;
  }

  const sizeMultHtml = `<span class="gold-badge" style="background:${confColor}22;color:${confColor};border:1px solid ${confColor}44">
    Size ×${conf.sizeMult}
  </span>`;

  return `
  <div class="gold-regime-panel" style="border-left:4px solid ${borderColor}">
    <div class="gold-regime-header">
      <span class="gold-regime-emoji">${escHtml(model.regimeEmoji)}</span>
      <div class="gold-regime-title-group">
        <h2 class="gold-regime-name">${escHtml(model.regimeLabel)}</h2>
        <div class="gold-regime-badges">
          <span class="gold-badge" style="background:${confColor}22;color:${confColor};border:1px solid ${confColor}44">
            ${escHtml(conf.confidence)} Confidence
          </span>
          <span class="gold-badge" style="background:${biasColor}22;color:${biasColor};border:1px solid ${biasColor}44">
            ${escHtml(model.regimeBias)} Bias
          </span>
          <span class="gold-badge" style="background:${signalColor}22;color:${signalColor};border:1px solid ${signalColor}44">
            ${escHtml(model.signal)} ${escHtml(model.strength)}
          </span>
          ${sizeMultHtml}
        </div>
      </div>
    </div>
    <p class="gold-regime-desc">${escHtml(model.regimeDescription)}</p>
    <div class="gold-regime-meta">
      <span class="gold-meta-item"><span class="gold-meta-label">Primary Driver</span> ${escHtml(primaryDriver)} (${Math.round(topFactor[1] * 100)}%)</span>
      <span class="gold-meta-item"><span class="gold-meta-label">Transition Score</span> ${conf.transitionScore} / 4</span>
      ${conf.hurstProxy != null ? `<span class="gold-meta-item"><span class="gold-meta-label">Persistence</span> ${Math.round(conf.hurstProxy * 100)}%</span>` : ''}
      ${model.arimaStability != null ? (() => {
        const s = model.arimaStability;
        const col = s >= 0.80 ? 'var(--green)' : s >= 0.65 ? 'var(--amber)' : 'var(--red)';
        const lbl = s >= 0.80 ? 'stable' : s >= 0.65 ? 'elevated' : 'erratic';
        return `<span class="gold-meta-item" title="ARIMA price residual stability — erratic residuals signal regime transitioning"><span class="gold-meta-label">ARIMA</span> <strong style="color:${col}">${Math.round(s * 100)}%</strong> <span style="font-size:10px;color:var(--text3)">(${lbl})</span></span>`;
      })() : ''}
      ${model.fedPricingSignal ? `<span class="gold-meta-item"><span class="gold-meta-label">Fed Pricing</span> ${escHtml(model.fedPricingSignal)}</span>` : ''}
      ${model.nfciSignal       ? `<span class="gold-meta-item"><span class="gold-meta-label">NFCI</span> ${escHtml(model.nfciSignal)}</span>` : ''}
    </div>
    ${transitionHtml}
  </div>`;
}

// ── Signal gauge + weight bars ─────────────────────────────────────────────────
// 2-column: left = horizontal score gauge, right = adaptive weight bars
function renderSignalAndWeights(model) {
  return `
  <div class="gold-two-col">
    <div class="gold-card">
      <div class="gold-card-title">Composite Score Gauge</div>
      ${buildScoreGauge(model.goldScore, model.signal, model.strength)}
    </div>
    <div class="gold-card">
      <div class="gold-card-title">Adaptive Weights — ${escHtml(model.regimeLabel)}</div>
      ${buildWeightBars(model.weights)}
    </div>
  </div>`;
}

// ── Two-layer factor breakdown ─────────────────────────────────────────────────
// 2-column: Layer 1 (levels) + Layer 2 (momentum)
function renderLayers(model) {
  const l = model.layers;

  const layer1Html = [
    buildScoreBar(l.level.realYield.score,  'TIPS Real Yield',  l.level.realYield.label),
    buildScoreBar(l.level.breakeven.score,   'BEI Level',        l.level.breakeven.label),
  ].join('');

  const layer2Html = [
    buildScoreBar(l.momentum.realYield.score, 'Real Yield Δ', l.momentum.realYield.label),
    buildScoreBar(l.momentum.breakeven.score,  'BEI Δ',       l.momentum.breakeven.label),
    buildScoreBar(l.momentum.dxy.score,        'DXY Δ',       l.momentum.dxy.label),
    buildScoreBar(l.momentum.safeHaven.score,  'Safe Haven',       l.momentum.safeHaven.label),
  ].join('');

  return `
  <div class="gold-two-col">
    <div class="gold-card">
      <div class="gold-card-title">Layer 1 — Structural Levels</div>
      <div class="gold-layer-desc">Opportunity cost context: static positioning of rates</div>
      ${layer1Html}
    </div>
    <div class="gold-card">
      <div class="gold-card-title">Layer 2 — Momentum (Alpha Layer)</div>
      <div class="gold-layer-desc">Rate-of-change signals: where repricing alpha lives</div>
      ${layer2Html}
    </div>
  </div>`;
}

// ── Breakeven decomposition ────────────────────────────────────────────────────
function renderBEIDecomp(model) {
  const d = model.beiDecomp;
  if (!d) {
    return `<div class="gold-card gold-full-width">
      <div class="gold-card-title">Breakeven Decomposition</div>
      <p class="gold-muted">Insufficient data for decomposition (need TIPS + BEI history)</p>
    </div>`;
  }

  const driverColor = d.dominantDriver === 'uncertainty_premium' ? 'var(--amber)'
                    : d.dominantDriver === 'real_yield_dominant'  ? 'var(--red)'
                    : 'var(--blue)';

  const driverLabel = d.dominantDriver === 'uncertainty_premium' ? 'Uncertainty Premium Dominant'
                    : d.dominantDriver === 'real_yield_dominant'  ? 'Real Yield Pressure Dominant'
                    : d.dominantDriver === 'aligned'              ? 'Pure Inflation Repricing'
                    : 'Unknown';

  const fmt2 = v => v != null ? v.toFixed(2) + '%' : '—';
  const fmtBp = v => v != null ? (v > 0 ? '+' : '') + (v * 100).toFixed(1) + 'bp' : '—';

  return `
  <div class="gold-card gold-full-width">
    <div class="gold-card-title">Breakeven Decomposition — Fisher Equation Proxy</div>
    <div class="gold-bei-grid">
      <div class="gold-bei-cell">
        <div class="gold-bei-label">TIPS (Real Yield)</div>
        <div class="gold-bei-value">${fmt2(d.realYield)}</div>
        <div class="gold-bei-sub">${fmtBp(d.tipsMomentum)} vs prev</div>
      </div>
      <div class="gold-bei-plus">+</div>
      <div class="gold-bei-cell">
        <div class="gold-bei-label">BEI (Breakeven)</div>
        <div class="gold-bei-value">${fmt2(d.expectedInflation)}</div>
        <div class="gold-bei-sub">${fmtBp(d.beiMomentum)} vs prev</div>
      </div>
      <div class="gold-bei-plus">=</div>
      <div class="gold-bei-cell">
        <div class="gold-bei-label">Implied Nominal</div>
        <div class="gold-bei-value">${fmt2(d.impliedNominal)}</div>
        <div class="gold-bei-sub">Fisher: TIPS + BEI</div>
      </div>
      <div class="gold-bei-divider"></div>
      <div class="gold-bei-cell gold-bei-wide">
        <div class="gold-bei-label">BEIΔ − TIPSΔ Divergence</div>
        <div class="gold-bei-value" style="color:${driverColor}">${fmtBp(d.divergence)}</div>
        <div class="gold-bei-sub" style="color:${driverColor}">${escHtml(driverLabel)}</div>
      </div>
    </div>
    <p class="gold-bei-interp">${escHtml(d.interpretation)}</p>
    ${model.fedPricingSignal ? `<p class="gold-bei-fed">Fed Pricing Signal: <strong>${escHtml(model.fedPricingSignal)}</strong></p>` : ''}
  </div>`;
}

// ── Sparklines (90-day FRED history) ──────────────────────────────────────────
function renderSparklines(history) {
  if (!history || typeof history !== 'object') {
    return `<div class="gold-card gold-full-width"><p class="gold-muted">FRED history unavailable</p></div>`;
  }

  const KEYS = [
    { key: 'tips', label: 'TIPS 10Y Real Yield', color: '#4f8ef7', unit: '%' },
    { key: 'bei',  label: 'Breakeven Inflation',  color: '#f7a34f', unit: '%' },
    { key: 'vix',  label: 'VIX (Uncertainty)',    color: '#e05c5c', unit: '' },
    { key: 'dxy',  label: 'DXY Index',            color: '#7ac97a', unit: '' },
  ];

  const cards = KEYS.map(({ key, label, color, unit }) => {
    const series = history[key];
    if (!series || !series.length) {
      return `<div class="gold-spark-card">
        <div class="gold-spark-title">${escHtml(label)}</div>
        <div class="gold-spark-empty">No data</div>
      </div>`;
    }

    const vals   = series.map(p => p.value);
    const latest = vals[vals.length - 1];
    const first  = vals[0];
    const change = latest - first;
    const chgStr = (change >= 0 ? '+' : '') + change.toFixed(2) + unit;
    const chgColor = change >= 0 ? 'var(--green)' : 'var(--red)';
    const min    = Math.min(...vals);
    const max    = Math.max(...vals);

    return `<div class="gold-spark-card">
      <div class="gold-spark-title">${escHtml(label)}</div>
      <div class="gold-spark-value">${latest.toFixed(2)}${unit}
        <span style="color:${chgColor};font-size:0.8em">${chgStr} (3M)</span>
      </div>
      ${buildSparkline(series, color)}
      <div class="gold-spark-range">
        <span>Low: ${min.toFixed(2)}${unit}</span>
        <span>High: ${max.toFixed(2)}${unit}</span>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="gold-card gold-full-width">
    <div class="gold-card-title">90-Day Factor History</div>
    <div class="gold-spark-grid">${cards}</div>
  </div>`;
}

// ── Confluence levels ─────────────────────────────────────────────────────────
// Shows top 8 XAU/USD confluence levels with model alignment badges.
// Uses _enhancedConfs computed by _computeEnhancedConfs — no double computation.
function renderLevels(model, liveQuote) {
  const priceNum = liveQuote
    ? parseFloat(liveQuote.price ?? liveQuote.close ?? liveQuote.ask ?? 0)
    : null;

  if (!priceNum || priceNum === 0) {
    return `<div id="goldLevelsSection" class="gold-card gold-full-width">
      <div class="gold-card-title">Confluence Levels</div>
      <p class="gold-muted">Live quote unavailable — distances cannot be calculated</p>
    </div>`;
  }

  // Re-compute if called from quote loop (priceNum changed since last full render)
  const enhanced = _enhancedConfs.length
    ? _enhancedConfs
    : _computeEnhancedConfs(model, priceNum);

  if (!enhanced.length) {
    return `<div id="goldLevelsSection" class="gold-card gold-full-width">
      <div class="gold-card-title">Confluence Levels — XAU/USD</div>
      <p class="gold-muted">No confluence levels found — Asia or Monday range data may be unavailable</p>
    </div>`;
  }

  // Sort by distance from price, take top 8
  const sorted = [...enhanced]
    .sort((a, b) => Math.abs(a.price - priceNum) - Math.abs(b.price - priceNum))
    .slice(0, 8);

  const pipSize = getPipSize('XAU/USD');
  const digits  = getDigits('XAU/USD');

  const rows = sorted.map(c => {
    const dist      = Math.abs(c.price - priceNum);
    const distPips  = (dist / pipSize).toFixed(0);
    const above     = c.price > priceNum;
    const distStr   = `${above ? '+' : '-'}$${dist.toFixed(2)} (${distPips} pips)`;
    const distColor = above ? 'var(--green)' : 'var(--red)';

    const direction = c.direction ?? (above ? 'short' : 'long');

    // Model alignment badge
    let alignBadge = '';
    if (model.signal !== 'NEUTRAL') {
      const modelAligned =
        (model.signal === 'BULLISH' && direction === 'long') ||
        (model.signal === 'BEARISH' && direction === 'short');
      if (modelAligned) {
        alignBadge = `<span class="gold-align-badge gold-align-ok">✓ Model Aligned</span>`;
      } else {
        alignBadge = `<span class="gold-align-badge gold-align-warn">⚠ Conflicts Model</span>`;
      }
    }

    const stars      = c.totalStars ?? c.stars ?? 0;
    const starsHtml  = '★'.repeat(Math.min(5, stars)) + '☆'.repeat(Math.max(0, 5 - stars));
    const dirLabel   = direction === 'long' ? 'Buy' : direction === 'short' ? 'Sell' : direction;
    const dirColor   = direction === 'long' ? 'var(--green)' : 'var(--red)';

    return `<div class="gold-level-row">
      <span class="gold-level-stars">${starsHtml}</span>
      <span class="gold-level-price">${c.price.toFixed(digits)}</span>
      <span class="gold-level-dir" style="color:${dirColor}">${escHtml(dirLabel)}</span>
      <span class="gold-level-dist" style="color:${distColor}">${escHtml(distStr)}</span>
      ${alignBadge}
    </div>`;
  }).join('');

  const macroCtx = `Regime: ${escHtml(model.regimeLabel)} · Score: ${model.goldScore > 0 ? '+' : ''}${model.goldScore.toFixed(3)}`;

  return `
  <div id="goldLevelsSection" class="gold-card gold-full-width">
    <div class="gold-card-title">Confluence Levels — XAU/USD</div>
    <div class="gold-level-macro-ctx">${macroCtx}</div>
    <div class="gold-level-list">${rows || '<p class="gold-muted">No levels within range</p>'}</div>
  </div>`;
}

// ── COT + Vol section ─────────────────────────────────────────────────────────
function renderCOTAndVol(cotData, volRegime, model) {
  return `
  <div class="gold-two-col">
    ${renderCOTCard(cotData)}
    ${renderVolCard(volRegime, model)}
  </div>`;
}

function renderCOTCard(cotData) {
  const xauCot = cotData?.['XAU/USD'] ?? cotData?.['XAUUSD'] ?? null;

  if (!xauCot) {
    return `<div class="gold-card">
      <div class="gold-card-title">COT Positioning — XAU/USD</div>
      <p class="gold-muted">COT data unavailable. Data is updated Fridays via CFTC.</p>
    </div>`;
  }

  const levNet    = xauCot.levNet    ?? xauCot.lev_net    ?? null;
  const levNetChg = xauCot.levNetChg ?? xauCot.lev_net_chg ?? null;
  const levPct    = xauCot.levPct    ?? xauCot.lev_pct    ?? null;
  const amNet     = xauCot.amNet     ?? xauCot.am_net     ?? null;
  const amNetChg  = xauCot.amNetChg  ?? xauCot.am_net_chg ?? null;
  const crowdPct  = xauCot.crowdingPct ?? xauCot.crowding_pct ?? null;

  const fmt = v => v != null ? v.toLocaleString() : '—';
  const fmtPct = v => v != null ? v.toFixed(1) + '%' : '—';
  const chgHtml = v => {
    if (v == null) return '<span class="gold-muted">—</span>';
    const color = v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text2)';
    return `<span style="color:${color}">${v > 0 ? '+' : ''}${v.toLocaleString()}</span>`;
  };

  const crowdColor = crowdPct != null
    ? (crowdPct > 80 ? 'var(--red)' : crowdPct > 60 ? 'var(--amber)' : 'var(--green)')
    : 'var(--text2)';

  const crowdLabel = crowdPct != null
    ? (crowdPct > 80 ? 'Extremely crowded — mean-reversion risk'
     : crowdPct > 60 ? 'Elevated crowding'
     : 'Positioning manageable')
    : '';

  return `<div class="gold-card">
    <div class="gold-card-title">COT Positioning — XAU/USD</div>
    <div class="gold-cot-grid">
      <div class="gold-cot-section">
        <div class="gold-cot-label">Leveraged Funds (Speculators)</div>
        <div class="gold-cot-row"><span>Net</span><strong>${fmt(levNet)}</strong></div>
        <div class="gold-cot-row"><span>Weekly Change</span>${chgHtml(levNetChg)}</div>
        <div class="gold-cot-row"><span>Percentile</span><span>${fmtPct(levPct)}</span></div>
      </div>
      <div class="gold-cot-section">
        <div class="gold-cot-label">Asset Managers (Structural)</div>
        <div class="gold-cot-row"><span>Net</span><strong>${fmt(amNet)}</strong></div>
        <div class="gold-cot-row"><span>Weekly Change</span>${chgHtml(amNetChg)}</div>
      </div>
      ${crowdPct != null ? `<div class="gold-cot-crowding">
        <div class="gold-cot-label">Crowding</div>
        <div class="gold-cot-crowd-bar">
          <div class="gold-cot-crowd-fill" style="width:${Math.min(100, crowdPct)}%;background:${crowdColor}"></div>
        </div>
        <div style="color:${crowdColor}">${fmtPct(crowdPct)} — ${escHtml(crowdLabel)}</div>
      </div>` : ''}
    </div>
  </div>`;
}

function renderVolCard(volRegime, model) {
  if (!volRegime) {
    return `<div class="gold-card">
      <div class="gold-card-title">GARCH Vol Regime</div>
      <p class="gold-muted">Vol data unavailable — need daily OHLC data for GARCH computation.</p>
    </div>`;
  }

  const regimeColor = volRegime.regime === 'HIGH'   ? 'var(--red)'
                    : volRegime.regime === 'LOW'    ? 'var(--green)'
                    : 'var(--amber)';

  const biasColor = volRegime.volBias === 'expanding'   ? 'var(--red)'
                  : volRegime.volBias === 'contracting' ? 'var(--green)'
                  : 'var(--text2)';

  const pctBar = `<div class="gold-vol-pct-bar">
    <div class="gold-vol-pct-fill" style="width:${volRegime.percentile}%;background:${regimeColor}"></div>
  </div>`;

  const garch = volRegime.garch;
  const highVolNote = (volRegime.regime === 'HIGH' && model)
    ? `<p class="gold-vol-warn">HIGH vol regime is reducing regime confidence (score dampened).</p>`
    : '';

  return `<div class="gold-card">
    <div class="gold-card-title">GARCH Vol Regime</div>
    <div class="gold-vol-grid">
      <div class="gold-vol-row">
        <span>Regime</span>
        <strong style="color:${regimeColor}">${escHtml(volRegime.regime)}</strong>
      </div>
      <div class="gold-vol-row">
        <span>ATR (EMA)</span>
        <span>$${volRegime.atr.toFixed(2)} / ${volRegime.atrPips.toFixed(0)} pips</span>
      </div>
      <div class="gold-vol-row">
        <span>Vol Percentile</span>
        <span>${volRegime.percentile}th</span>
      </div>
      ${pctBar}
      ${volRegime.volBias ? `<div class="gold-vol-row">
        <span>Vol Impulse</span>
        <span style="color:${biasColor}">${escHtml(volRegime.volBias)}
          ${volRegime.volImpulsePct ? `(${volRegime.volImpulsePct > 0 ? '+' : ''}${volRegime.volImpulsePct.toFixed(1)}%)` : ''}
        </span>
      </div>` : ''}
      ${garch ? `<div class="gold-vol-row">
        <span>GARCH State</span>
        <span>${escHtml(garch.cluster)}</span>
      </div>
      <div class="gold-vol-row">
        <span>GARCH Daily Range</span>
        <span>$${garch.range.toFixed(2)} (${garch.pips.toFixed(0)} pips)</span>
      </div>
      <div class="gold-vol-row">
        <span>68% CI / 95% CI</span>
        <span>${garch.ci68Pips.toFixed(0)} / ${garch.ci95Pips.toFixed(0)} pips</span>
      </div>` : ''}
      ${model?.regimeConfidence?.sizeMult != null ? `<div class="gold-vol-row">
        <span>Regime Size Mult</span>
        <strong>×${model.regimeConfidence.sizeMult}</strong>
      </div>` : ''}
    </div>
    ${highVolNote}
  </div>`;
}

// ── Sparkline builder ──────────────────────────────────────────────────────────
// Returns an inline SVG sparkline with gradient fill.
function buildSparkline(points, color) {
  if (!points || points.length < 2) {
    return '<div class="gold-spark-empty">No data</div>';
  }
  const w    = 260;
  const h    = 60;
  const vals = points.map(p => p.value);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 0.001;
  const xStep = w / (points.length - 1);
  const pts   = points.map((p, i) => ({
    x: i * xStep,
    y: h - ((p.value - min) / range) * (h - 4) - 2,
  }));
  const path   = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillD  = path + ` L${w},${h} L0,${h} Z`;
  const grdId  = `grd_${color.replace('#', '')}`;

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block">
    <defs>
      <linearGradient id="${grdId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${fillD}" fill="url(#${grdId})"/>
    <path d="${path}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// ── Score gauge (linear, horizontal) ──────────────────────────────────────────
// Track from -1 to +1. Fill from 0 toward score value (green=positive, red=negative).
function buildScoreGauge(score, signal, strength) {
  // Clamp to [-1, 1]
  const s       = Math.max(-1, Math.min(1, score));
  const pct     = Math.abs(s) * 50; // % of half-width
  const isPos   = s >= 0;
  const fillColor = isPos ? 'var(--green)' : 'var(--red)';

  // Fill starts at center (50%), extends right if positive, left if negative
  const fillLeft  = isPos ? 50 : (50 - pct);
  const fillWidth = pct;

  const pctInterp = Math.round(Math.abs(s) * 100);
  const interpText = pctInterp >= 75 ? `${pctInterp}% — Strong ${signal.toLowerCase()} pressure`
                   : pctInterp >= 40 ? `${pctInterp}% — Moderate ${signal.toLowerCase()} signal`
                   : pctInterp >= 15 ? `${pctInterp}% — Weak ${signal.toLowerCase()} lean`
                   : 'Essentially neutral — no directional edge';

  return `
  <div class="gold-gauge-wrap">
    <div class="gold-gauge-labels">
      <span>Bearish −1</span>
      <span>Neutral 0</span>
      <span>+1 Bullish</span>
    </div>
    <div class="gold-gauge-track">
      <div class="gold-gauge-center-line"></div>
      <div class="gold-gauge-fill" style="left:${fillLeft}%;width:${fillWidth}%;background:${fillColor}"></div>
    </div>
    <div class="gold-gauge-score" style="color:${fillColor}">
      ${s > 0 ? '+' : ''}${s.toFixed(3)}
    </div>
    <div class="gold-gauge-label">SIGNAL STRENGTH — ${escHtml(strength)}</div>
    <div class="gold-gauge-interp">${escHtml(interpText)}</div>
  </div>`;
}

// ── Factor score bar (split, -1 to +1) ────────────────────────────────────────
// Left half = negative zone (red), right half = positive zone (green).
// Fill shows where score falls within its zone.
function buildScoreBar(score, label, rawVal) {
  const s      = Math.max(-1, Math.min(1, score ?? 0));
  const isPos  = s >= 0;
  const pct    = Math.abs(s) * 100; // % of half-width

  // Negative fill: in left half (0–50%), fill from right edge of left half leftward
  // Positive fill: in right half (50–100%), fill from left edge of right half rightward
  const negFillLeft  = isPos ? 0 : (50 - pct / 2);
  const negFillWidth = isPos ? 0 : pct / 2;
  const posFillLeft  = isPos ? 50 : 0;
  const posFillWidth = isPos ? pct / 2 : 0;

  const valDisplay = rawVal ? escHtml(rawVal) : (s > 0 ? '+' : '') + s.toFixed(2);

  return `
  <div class="gold-factor-row">
    <span class="gold-factor-label">${escHtml(label)}</span>
    <div class="gold-factor-track">
      <div class="gold-factor-neg-fill" style="left:${negFillLeft.toFixed(1)}%;width:${negFillWidth.toFixed(1)}%"></div>
      <div class="gold-factor-pos-fill" style="left:${posFillLeft.toFixed(1)}%;width:${posFillWidth.toFixed(1)}%"></div>
      <div class="gold-factor-center"></div>
    </div>
    <span class="gold-factor-val">${valDisplay}</span>
    <span class="gold-factor-score">${s > 0 ? '+' : ''}${s.toFixed(2)}</span>
  </div>`;
}

// ── Weight bar ─────────────────────────────────────────────────────────────────
// Renders a sorted list of weight bars for the current regime's adaptive weights.
function buildWeightBars(weights) {
  const FACTOR_LABELS = {
    realYieldLevel:    'Real Yield Level',
    realYieldMomentum: 'Real Yield Momentum',
    breakevenLevel:    'Breakeven Level',
    breakevenMomentum: 'Breakeven Momentum',
    dxyMomentum:       'DXY Momentum',
    safeHaven:         'Safe Haven / VIX',
  };

  const sorted = Object.entries(weights)
    .sort((a, b) => b[1] - a[1]);

  const maxWeight = sorted[0]?.[1] ?? 1;

  return sorted.map(([key, w], i) => {
    const label    = FACTOR_LABELS[key] ?? key;
    const pct      = Math.round(w * 100);
    const barWidth = Math.round((w / (maxWeight || 1)) * 100);
    const isTop    = i === 0;
    const barColor = isTop ? 'var(--amber)' : 'var(--blue)';

    return `
    <div class="gold-weight-row${isTop ? ' gold-weight-top' : ''}">
      <span class="gold-weight-label">${escHtml(label)}</span>
      <div class="gold-weight-track">
        <div class="gold-weight-fill" style="width:${barWidth}%;background:${barColor}"></div>
      </div>
      <span class="gold-weight-pct">${pct}%</span>
    </div>`;
  }).join('');
}

// ── Quote refresh loop ─────────────────────────────────────────────────────────
// ── Live log row builder ───────────────────────────────────────────────────────
// Builds a row matching the gold-lab-worker CSV format from the live model state.
// Outcome columns are null — these are filled in by the Python training script
// once 1m bars arrive.
function buildLiveLogRow(model, liveQuote) {
  const f = S.fredData ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const priceNum = liveQuote
    ? parseFloat(liveQuote.price ?? liveQuote.close ?? liveQuote.ask ?? 0) || null
    : null;

  const r2 = v => v != null ? Math.round(v * 100) / 100 : null;
  const r3 = v => v != null ? Math.round(v * 1000) / 1000 : null;
  const r4 = v => v != null ? Math.round(v * 10000) / 10000 : null;

  return {
    date:              today,
    signal:            model.signal,
    strength:          model.strength,
    regime:            model.regime,
    gold_score:        r3(model.goldScore),
    confidence:        model.regimeConfidence?.confidence ?? null,
    tips:              r2(f.tips?.value),
    tips_mom:          r4(model.tipsMom),
    tips_accel:        r4(model.tipsAccel),
    tips_zscore:       r3(model.tipsZScore),
    tips_inflection:   model.tipsInflection ?? null,
    bei:               r2(f.bei?.value),
    bei_mom:           r4(model.beiMom),
    bei_accel:         r4(model.beiAccel),
    bei_zscore:        r3(model.beiZScore),
    bei_inflection:    model.beiInflection ?? null,
    dxy:               r2(f.dxy?.value),
    dxy_mom:           r3(model.dxyMom),
    dxy_accel:         r4(model.dxyAccel),
    dxy_zscore:        r3(model.dxyZScore),
    vix:               r2(f.vix?.value),
    vix_chg:           r3(model.vixChange),
    vix_accel:         r4(model.vixAccel),
    vix_zscore:        r3(model.vixZScore),
    hy:                r3(f.hy?.value),
    hy_chg:            r4(f.hy?.value != null && f.hy?.prev != null ? f.hy.value - f.hy.prev : null),
    us2y_mom:          r4(model.us2yMom),
    is_transitioning:  model.regimeConfidence?.isTransitioning ? 1 : 0,
    entry_price:       r2(priceNum),
    outcome_hit_tp:    null,
    outcome_hit_sl:    null,
    forward_return_1d: null,
    forward_return_5d: null,
    bars_to_outcome:   null,
  };
}

function startQuoteLoop() {
  if (_quoteTimer) clearInterval(_quoteTimer);
  _quoteTimer = setInterval(async () => {
    try {
      const quote = await fetchAPI('/api/quote?symbol=XAU/USD');
      _liveQuote = quote;

      // Update price pill
      updatePricePill(quote);

      // Update timestamp
      const updTime = document.getElementById('updTime');
      if (updTime) updTime.textContent = new Date().toLocaleTimeString();

      // Re-render distance-sensitive sections on every tick
      if (_model) {
        const priceNum = quote
          ? parseFloat(quote.price ?? quote.close ?? quote.ask ?? 0)
          : null;

        if (priceNum) {
          // Recompute enhanced confluences with updated price
          _enhancedConfs = _computeEnhancedConfs(_model, priceNum);

          // Checklist — verdict + level proximity row update
          const ckEl = document.getElementById('goldChecklistSection');
          if (ckEl) ckEl.outerHTML = renderChecklist(_model, _volRegime, _cotData, quote);

          // Levels — distances change as price moves
          const levelsEl = document.getElementById('goldLevelsSection');
          if (levelsEl) levelsEl.outerHTML = renderLevels(_model, quote);
        }
      }

      setStatus('ok', 'Updated ' + new Date().toLocaleTimeString());
    } catch(e) {
      console.warn('[gold-app] Quote refresh failed:', e.message);
      setStatus('warn', 'Quote refresh failed');
    }
  }, 30_000);
}

// ── Price pill updater ─────────────────────────────────────────────────────────
function updatePricePill(quote) {
  const el = document.getElementById('goldPricePill');
  if (!el || !quote) return;
  const price = quote.price ?? quote.close ?? quote.ask;
  if (price == null) return;
  el.textContent = `XAU/USD  ${parseFloat(price).toFixed(2)}`;
}

// ── Utility: HTML escape ───────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Boot ───────────────────────────────────────────────────────────────────────
// Called from gold.html after DOM ready. Exposed on window for inline script use.
window.goldApp = { init, toggleDark };
init();
