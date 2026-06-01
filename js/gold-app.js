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
import { oiLoadStoreFromKV } from './oi.js';

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
    startZoneTicker();
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

const COT_TTL = 7 * 24 * 60 * 60 * 1000;

// ── Data fetching ──────────────────────────────────────────────────────────────
async function loadData() {
  const [
    fredData,
    history,
    ohlcData,
    ohlc5mData,
    ohlc30mData,
    liveQuote,
    cotData,
    caps,
  ] = await Promise.allSettled([
    loadCached('gold_fred2', () => fetchAPI('/api/fred'), CACHE_DURATION.FRED,
      d => ['vix', 'us10y', 'hy', 'nfci'].every(k => d?.[k]?.value != null)),
    loadCached('gold_fredhistory2', () => fetchAPI('/api/fredhistory?keys=tips,bei,vix,hy,dxy'), 6 * 60 * 60 * 1000,
      d => Object.values(d || {}).some(arr => Array.isArray(arr) && arr.length > 0)),
    loadCached('gold_ohlc',       () => fetchAPI('/api/ohlc?symbol=XAU/USD'),           CACHE_DURATION.OHLC),
    loadCached('gold_ohlc5m',     () => fetchAPI('/api/oanda_ohlc5m?symbol=XAU/USD'),  CACHE_DURATION.OHLC5M),
    loadCached('gold_ohlc30m',    () => fetchAPI('/api/oanda_ohlc30m?symbol=XAU/USD'), CACHE_DURATION.OHLC30M),
    loadCached('gold_quote',      () => fetchAPI('/api/quote?symbol=XAU/USD'),          CACHE_DURATION.QUOTE),
    // Use same key + TTL as main dashboard so shared localStorage is read first —
    // if user has already loaded COT on the main dashboard it shows here instantly.
    loadCached('cot_data', async () => {
      const res = await fetch('/api/cot');
      const j   = await res.json();
      if (!j.ok) throw new Error(j.reason || 'COT fetch failed');
      return j.data;
    }, COT_TTL),
    fetchAPI('/api/config/caps'),
    oiLoadStoreFromKV(),
  ]);

  // Helper to unwrap settled results — logs warnings on failure
  function unwrap(settled, label, fallback = null) {
    if (settled.status === 'fulfilled') return settled.value;
    console.warn(`[gold-app] ${label} failed:`, settled.reason?.message);
    return fallback;
  }

  return {
    fredData:   unwrap(fredData,   'FRED',          null),
    history:    unwrap(history,    'FRED history',  null),
    ohlcData:   unwrap(ohlcData,   'OHLC daily',    null),
    ohlc5mData: unwrap(ohlc5mData, 'OHLC 5m',       null),
    ohlc30mData:unwrap(ohlc30mData,'OHLC 30m',      null),
    liveQuote:  unwrap(liveQuote,  'Live quote',    null),
    cotData:    unwrap(cotData,    'COT data',      null),
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
    <div class="gold-card-title">What's Driving Gold: Inflation vs Real Yield</div>
    <div class="gold-bei-implication">
      <strong>${escHtml(driverLabel)}</strong> — ${escHtml(d.interpretation)}
    </div>
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
    ${model.fedPricingSignal ? `<p class="gold-bei-fed">Fed Pricing Signal: <strong>${escHtml(model.fedPricingSignal)}</strong></p>` : ''}
  </div>`;
}

// ── Combined macro narrative ───────────────────────────────────────────────────
// Reads the 3M trend of all four factors together and produces a plain-English
// summary of what the combination means for gold right now.
function buildSparklineNarrative(history) {
  const get = key => {
    const s = history[key];
    if (!s || s.length < 2) return null;
    const vals = s.map(p => p.value);
    const change = vals[vals.length - 1] - vals[0];
    const latest = vals[vals.length - 1];
    const pctChg = vals[0] !== 0 ? (change / Math.abs(vals[0])) * 100 : 0;
    return { change, latest, pctChg, rising: change > 0, falling: change < 0 };
  };

  const tips = get('tips');
  const bei  = get('bei');
  const dxy  = get('dxy');
  const vix  = get('vix');

  if (!tips && !bei && !dxy && !vix) return null;

  // Score each factor: +1 = gold tailwind, -1 = gold headwind, 0 = flat
  const tipsScore = !tips ? 0 : tips.falling ? 1 : tips.rising ? -1 : 0;
  const beiScore  = !bei  ? 0 : bei.rising   ? 1 : bei.falling  ? -1 : 0;
  const dxyScore  = !dxy  ? 0 : dxy.falling  ? 1 : dxy.rising   ? -1 : 0;
  const vixScore  = !vix  ? 0 : vix.rising   ? 1 : vix.falling  ? -1 : 0;

  const netScore = tipsScore + beiScore + dxyScore + vixScore;
  const tailwinds = [tipsScore, beiScore, dxyScore, vixScore].filter(s => s > 0).length;
  const headwinds = [tipsScore, beiScore, dxyScore, vixScore].filter(s => s < 0).length;

  // Detect special regimes
  const crisisVix    = vix && vix.latest > 30;
  const stagflation  = tips && bei && tips.rising && bei.rising;
  const deflation    = tips && bei && tips.falling && bei.falling;
  const realYieldDriven = tips && Math.abs(tips.pctChg) > 5;
  const dollarDom    = dxy && Math.abs(dxy.pctChg) > 3;

  let headline, body, verdictColor;

  if (crisisVix) {
    headline = 'Fear is spiking — safe-haven demand is the primary driver.';
    body = `VIX above 30 signals elevated market stress. In crisis episodes gold's normal macro relationships break down — it trades primarily as a safe haven. ${
      tipsScore >= 0 ? 'Real yields and inflation signals are secondary right now.' :
      'Rising real yields are normally a headwind, but fear-driven buying is overriding fundamentals.'
    }`;
    verdictColor = 'var(--green)';

  } else if (stagflation) {
    headline = 'Stagflation signal: both real yields and inflation expectations are rising.';
    body = `This is the historical sweet spot for gold — inflation is building (${bei ? bei.change.toFixed(2) + '% BEI rise' : ''}) but real yields are also rising (${tips ? '+' + tips.change.toFixed(2) + '% TIPS' : ''}), creating uncertainty that gold tends to absorb. ${
      beiScore > tipsScore
        ? 'Inflation expectations are outpacing real yields — the net effect supports gold.'
        : 'Real yields are rising faster than inflation expectations — this limits the upside.'
    }${dxy && dxy.rising ? ' Dollar strength is an additional headwind to watch.' : ''}`;
    verdictColor = 'var(--amber)';

  } else if (deflation) {
    headline = 'Both real yields and inflation expectations are falling — deflationary pressure.';
    body = `Falling real yields (${tips ? tips.change.toFixed(2) + '% TIPS' : ''}) are gold-positive, but falling inflation expectations (${bei ? bei.change.toFixed(2) + '% BEI' : ''}) weaken the inflation-hedge argument. ${
      vixScore > 0
        ? 'Rising uncertainty is providing a partial offset via safe-haven demand.'
        : 'With VIX calm, there is limited safe-haven support to fill the gap.'
    }${dxyScore > 0 ? ' A weaker dollar is providing additional structural support.' : ''}`;
    verdictColor = 'var(--amber)';

  } else if (netScore >= 3) {
    headline = 'The macro backdrop is strongly aligned in gold\'s favour.';
    const drivers = [];
    if (tipsScore > 0) drivers.push('real yields are falling (reducing competition from bonds)');
    if (beiScore  > 0) drivers.push('inflation expectations are rising (building the hedge case)');
    if (dxyScore  > 0) drivers.push('the dollar is weakening (gold cheaper globally)');
    if (vixScore  > 0) drivers.push('uncertainty is elevated (safe-haven demand)');
    body = `${drivers.length > 1
      ? drivers.slice(0, -1).join(', ') + ', and ' + drivers[drivers.length - 1]
      : drivers[0]} over the past 90 days. ${
      headwinds === 0
        ? 'No major macro headwinds are visible in the data.'
        : 'Minor cross-currents remain but the dominant trend is supportive.'
    }`;
    verdictColor = 'var(--green)';

  } else if (netScore <= -3) {
    headline = 'Multiple macro factors are aligned against gold right now.';
    const drags = [];
    if (tipsScore < 0) drags.push('real yields are rising (bonds more competitive vs gold)');
    if (beiScore  < 0) drags.push('inflation expectations are falling (weakening the hedge case)');
    if (dxyScore  < 0) drags.push('the dollar is strengthening (headwind for gold in all currencies)');
    if (vixScore  < 0) drags.push('fear is subdued (limited safe-haven bid)');
    body = `${drags.length > 1
      ? drags.slice(0, -1).join(', ') + ', and ' + drags[drags.length - 1]
      : drags[0]}. ${
      tailwinds === 0
        ? 'There are no clear macro tailwinds in the 90-day data.'
        : 'Some factors offer partial offset but the macro tide is running against gold.'
    }`;
    verdictColor = 'var(--red)';

  } else if (realYieldDriven && tipsScore > 0) {
    headline = 'Falling real yields are the dominant driver — the core bull case for gold.';
    body = `Real yields have dropped ${tips ? Math.abs(tips.change).toFixed(2) + '%' : ''} over 90 days — this directly reduces the opportunity cost of holding gold versus bonds, which is historically the single strongest predictor of gold price moves. ${
      beiScore > 0
        ? 'Rising inflation expectations are reinforcing the move.'
        : 'Inflation expectations are not yet participating — watch for BEI to confirm.'
    }${dxyScore < 0 ? ' Dollar strength is a partial offset.' : dxyScore > 0 ? ' A weakening dollar adds further tailwind.' : ''}`;
    verdictColor = 'var(--green)';

  } else if (realYieldDriven && tipsScore < 0) {
    headline = 'Rising real yields are the dominant headwind — the core bear case for gold.';
    body = `Real yields have risen ${tips ? Math.abs(tips.change).toFixed(2) + '%' : ''} over 90 days. When bonds offer better real returns, gold — which pays nothing — faces structural selling pressure. ${
      beiScore > 0
        ? 'Rising inflation expectations are providing a partial offset, limiting the downside.'
        : 'With inflation expectations also subdued, the bear case is reinforced.'
    }${dollarDom && dxyScore < 0 ? ' A strengthening dollar compounds the pressure.' : ''}`;
    verdictColor = 'var(--red)';

  } else if (tailwinds === headwinds) {
    headline = 'Mixed signals — macro factors are roughly balanced.';
    const positives = [], negatives = [];
    if (tipsScore > 0) positives.push('falling real yields');
    if (tipsScore < 0) negatives.push('rising real yields');
    if (beiScore  > 0) positives.push('building inflation expectations');
    if (beiScore  < 0) negatives.push('falling inflation expectations');
    if (dxyScore  > 0) positives.push('dollar weakness');
    if (dxyScore  < 0) negatives.push('dollar strength');
    if (vixScore  > 0) positives.push('elevated uncertainty');
    if (vixScore  < 0) negatives.push('low fear');
    body = `${positives.length ? positives.join(' and ') + ' support gold' : ''}${positives.length && negatives.length ? ', while ' : ''}${negatives.length ? negatives.join(' and ') + ' weigh against it' : ''}. In this environment gold often trades in a range — catalyst-driven moves rather than macro-led trends.`;
    verdictColor = 'var(--amber)';

  } else {
    // Slight lean one way or the other
    const bullish = netScore > 0;
    headline = `Slight ${bullish ? 'tailwind' : 'headwind'} — ${tailwinds} of 4 macro factors ${bullish ? 'support' : 'oppose'} gold.`;
    body = `The macro picture is not strongly aligned ${bullish ? 'for' : 'against'} gold. ${
      bullish
        ? 'The partial support is better than nothing but lacks the conviction of a full alignment — size accordingly and look for confirmation from price action.'
        : 'The partial pressure is not enough to call a strong structural bear case, but it limits the macro tailwind. Any gold rally may face selling into strength.'
    }`;
    verdictColor = bullish ? 'var(--amber)' : 'var(--amber)';
  }

  return { headline, body, verdictColor, tailwinds, headwinds };
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

  const GOLD_CONTEXT = {
    tips: { good: 'down', label: 'Rising = headwind for gold (bonds pay more)' },
    bei:  { good: 'up',   label: 'Rising = tailwind for gold (inflation hedge)' },
    vix:  { good: 'up',   label: 'Rising = safe-haven demand (short-term gold positive)' },
    dxy:  { good: 'down', label: 'Rising = headwind for gold (dollar strength)' },
  };

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

    const ctx = GOLD_CONTEXT[key];
    const trendIsGood = ctx && ((change >= 0 && ctx.good === 'up') || (change < 0 && ctx.good === 'down'));
    const trendColor = ctx ? (trendIsGood ? 'var(--green)' : 'var(--red)') : chgColor;

    return `<div class="gold-spark-card">
      <div class="gold-spark-title">${escHtml(label)}</div>
      ${ctx ? `<div class="gold-spark-context" style="color:var(--text3)">${escHtml(ctx.label)}</div>` : ''}
      <div class="gold-spark-value">${latest.toFixed(2)}${unit}
        <span style="color:${trendColor};font-size:0.8em">${chgStr} (3M) ${ctx ? (trendIsGood ? '✓' : '✗') : ''}</span>
      </div>
      ${buildSparkline(series, color)}
      <div class="gold-spark-range">
        <span>Low: ${min.toFixed(2)}${unit}</span>
        <span>High: ${max.toFixed(2)}${unit}</span>
      </div>
    </div>`;
  }).join('');

  const narr = buildSparklineNarrative(history);
  const narrativeHtml = narr ? `
    <div class="gold-spark-narrative">
      <div class="gold-spark-narr-headline" style="color:${narr.verdictColor}">${escHtml(narr.headline)}</div>
      <div class="gold-spark-narr-body">${escHtml(narr.body)}</div>
      <div class="gold-spark-narr-score">
        ${[...Array(narr.tailwinds)].map(() => `<span class="gold-narr-dot gold-narr-dot-good"></span>`).join('')}
        ${[...Array(narr.headwinds)].map(() => `<span class="gold-narr-dot gold-narr-dot-bad"></span>`).join('')}
        <span style="font-size:10px;color:var(--text3);margin-left:6px">${narr.tailwinds} tailwind${narr.tailwinds !== 1 ? 's' : ''} · ${narr.headwinds} headwind${narr.headwinds !== 1 ? 's' : ''}</span>
      </div>
    </div>` : '';

  return `
  <div class="gold-card gold-full-width">
    <div class="gold-card-title">90-Day Factor History</div>
    ${narrativeHtml}
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
      <div class="gold-card-title">Price Volatility</div>
      <p class="gold-muted">Volatility data unavailable — need daily OHLC data.</p>
    </div>`;
  }

  const regimeColor = volRegime.regime === 'HIGH'  ? 'var(--red)'
                    : volRegime.regime === 'LOW'   ? 'var(--green)'
                    : 'var(--amber)';

  const regimeDesc = volRegime.regime === 'HIGH'
    ? 'High — bigger price swings than usual. Use wider stops.'
    : volRegime.regime === 'LOW'
    ? 'Low — calm market conditions. Tighter ranges.'
    : 'Normal — typical price movement.';

  const pctBar = `<div class="gold-vol-pct-bar">
    <div class="gold-vol-pct-fill" style="width:${volRegime.percentile}%;background:${regimeColor}"></div>
  </div>`;

  const biasColor = volRegime.volBias === 'expanding'   ? 'var(--red)'
                  : volRegime.volBias === 'contracting' ? 'var(--green)'
                  : 'var(--text2)';
  const biasDesc  = volRegime.volBias === 'expanding'   ? 'Volatility increasing — consider wider stops'
                  : volRegime.volBias === 'contracting' ? 'Volatility settling — conditions normalising'
                  : 'Volatility stable';

  const garch = volRegime.garch;
  const sizeMult = model?.regimeConfidence?.sizeMult;

  return `<div class="gold-card">
    <div class="gold-card-title">Price Volatility</div>
    <div class="gold-vol-grid">
      <div class="gold-vol-row">
        <span>Current level</span>
        <strong style="color:${regimeColor}">${escHtml(regimeDesc)}</strong>
      </div>
      <div class="gold-vol-row">
        <span>Typical daily move</span>
        <span>$${volRegime.atr.toFixed(2)} (${volRegime.atrPips.toFixed(0)} pips)</span>
      </div>
      <div class="gold-vol-row">
        <span>Vol vs recent history</span>
        <span>Higher than ${volRegime.percentile}% of recent days</span>
      </div>
      ${pctBar}
      ${volRegime.volBias ? `<div class="gold-vol-row">
        <span>Trend</span>
        <span style="color:${biasColor}">${escHtml(biasDesc)}</span>
      </div>` : ''}
      ${garch ? `<div class="gold-vol-row">
        <span>Expected daily range</span>
        <span>±$${(garch.range / 2).toFixed(0)} typical · ±$${garch.ci95Pips ? (garch.ci95Pips * 0.1).toFixed(0) : '—'} extreme</span>
      </div>` : ''}
      ${sizeMult != null ? `<div class="gold-vol-row">
        <span>Suggested position size</span>
        <strong>×${sizeMult} of your base risk</strong>
      </div>` : ''}
    </div>
    ${volRegime.regime === 'HIGH' && model ? `<p class="gold-vol-warn">High volatility is reducing model confidence — consider smaller size.</p>` : ''}
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
  const headline = signal === 'BULLISH' && pctInterp >= 60 ? 'Strong case for higher gold'
                 : signal === 'BULLISH' && pctInterp >= 30 ? 'Moderate case for higher gold'
                 : signal === 'BULLISH' ? 'Slight lean towards higher gold'
                 : signal === 'BEARISH' && pctInterp >= 60 ? 'Strong case for lower gold'
                 : signal === 'BEARISH' && pctInterp >= 30 ? 'Moderate case for lower gold'
                 : signal === 'BEARISH' ? 'Slight lean towards lower gold'
                 : 'No clear direction — factors are balanced';

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
    <div class="gold-gauge-headline" style="color:${fillColor}">${escHtml(headline)}</div>
    <div class="gold-gauge-score">${s > 0 ? '+' : ''}${s.toFixed(3)} &nbsp;·&nbsp; ${escHtml(strength)}</div>
  </div>`;
}

// ── Factor interpretation helper ───────────────────────────────────────────────
function factorInterpretation(label, score) {
  const dir = score > 0.15 ? 'up' : score < -0.15 ? 'down' : 'neutral';
  const MAP = {
    'TIPS Real Yield': {
      up:      'Low/negative real yields — cost of holding gold vs bonds is low',
      down:    'High real yields — bonds pay well, competing with gold',
      neutral: 'Real yields moderate — no strong structural pull on gold',
    },
    'BEI Level': {
      up:      'High inflation expectations — investors buying gold as inflation hedge',
      down:    'Low inflation expectations — limited demand for inflation protection',
      neutral: 'Inflation expectations moderate — no structural bias',
    },
    'Real Yield Δ': {
      up:      'Real yields falling — easing the cost of holding gold',
      down:    'Real yields rising fast — increasing competition from bonds',
      neutral: 'Real yields stable — no momentum pressure on gold',
    },
    'BEI Δ': {
      up:      'Inflation expectations rising — building the case for gold as a hedge',
      down:    'Inflation expectations falling — reducing the inflation hedge case',
      neutral: 'Inflation expectations stable — no momentum signal',
    },
    'DXY Δ': {
      up:      'Dollar weakening — gold becomes cheaper globally, supporting price',
      down:    'Dollar strengthening — gold more expensive for foreign buyers',
      neutral: 'Dollar stable — no currency tailwind or headwind for gold',
    },
    'Safe Haven': {
      up:      'Market stress elevated — investors fleeing to gold for protection',
      down:    'Risk appetite high, low fear — limited safe-haven demand for gold',
      neutral: 'Market calm — normal risk environment',
    },
  };
  const set = MAP[label] ?? { up: 'Positive for gold', down: 'Negative for gold', neutral: 'Neutral for gold' };
  const tag = dir === 'up' ? 'HELPING GOLD ↑' : dir === 'down' ? 'HURTING GOLD ↓' : 'NEUTRAL →';
  const tagColor = dir === 'up' ? 'var(--green)' : dir === 'down' ? 'var(--red)' : 'var(--amber)';
  return { tag, tagColor, explanation: set[dir] };
}

// ── Factor score bar (plain-English impact style) ──────────────────────────────
function buildScoreBar(score, label, rawVal) {
  const s = Math.max(-1, Math.min(1, score ?? 0));
  const { tag, tagColor, explanation } = factorInterpretation(label, s);
  const valDisplay = rawVal ? escHtml(rawVal) : (s > 0 ? '+' : '') + s.toFixed(2);

  return `
  <div class="gold-factor-row">
    <div class="gold-factor-top">
      <span class="gold-factor-label">${escHtml(label)}</span>
      <span class="gold-factor-impact" style="color:${tagColor};background:${tagColor}18;border:1px solid ${tagColor}35">${tag}</span>
      <span class="gold-factor-val">${valDisplay}</span>
    </div>
    <div class="gold-factor-explain">${escHtml(explanation)}</div>
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

  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const maxWeight = sorted[0]?.[1] ?? 1;

  const importanceLabel = (w, max) => {
    const r = w / max;
    return r >= 0.85 ? 'Dominant' : r >= 0.65 ? 'High' : r >= 0.40 ? 'Moderate' : 'Background';
  };

  const rows = sorted.map(([key, w], i) => {
    const label = FACTOR_LABELS[key] ?? key;
    const barWidth = Math.round((w / maxWeight) * 100);
    const isTop = i === 0;
    const barColor = isTop ? 'var(--amber)' : 'var(--blue)';
    const imp = importanceLabel(w, maxWeight);

    return `
    <div class="gold-weight-row${isTop ? ' gold-weight-top' : ''}">
      <span class="gold-weight-label">${isTop ? '★ ' : ''}${escHtml(label)}</span>
      <div class="gold-weight-track">
        <div class="gold-weight-fill" style="width:${barWidth}%;background:${barColor}"></div>
      </div>
      <span class="gold-weight-imp${isTop ? ' gold-weight-imp-top' : ''}">${imp}</span>
    </div>`;
  }).join('');

  return `<div class="gold-weight-summary">Which factors the model focuses on in this regime</div>${rows}`;
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

let _quoteTick = 0;  // counts 30s ticks; used to throttle less-frequent refreshes

function startQuoteLoop() {
  if (_quoteTimer) clearInterval(_quoteTimer);
  _quoteTimer = setInterval(async () => {
    _quoteTick++;
    try {
      const quote = await fetchAPI('/api/quote?symbol=XAU/USD');
      _liveQuote = quote;

      // Re-fetch COT from KV every 5 minutes (10 × 30s ticks) so URL changes
      // made on the main dashboard propagate here without needing a full reload.
      if (_quoteTick % 10 === 0) {
        // Re-read COT from localStorage — picks up any update the main dashboard
        // wrote without making a network request.
        try {
          const raw = localStorage.getItem('cot_data');
          if (raw) {
            const { data } = JSON.parse(raw);
            if (data) _cotData = data;
          }
        } catch(_) {}
        oiLoadStoreFromKV().catch(() => {});
      }

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

// ═══════════════════════════════════════════════════════════════════════════════
// ZONE TICKER — live zone proximity + VuManChu pass/fail breakdown
// ═══════════════════════════════════════════════════════════════════════════════

// ── VuManChu JS port (mirrors Gold/modules/vumanchu.py) ───────────────────────

function _ztEma(vals, p) {
  if (!vals.length) return [];
  const k = 2 / (p + 1), out = [vals[0]];
  for (let i = 1; i < vals.length; i++) out.push(vals[i] * k + out[i - 1] * (1 - k));
  return out;
}

function _ztSma(vals, p) {
  return vals.map((_, i) =>
    i < p - 1 ? NaN : vals.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p
  );
}

function _ztWt(bars, n1 = 10, n2 = 21) {
  const hl3 = bars.map(b => (b.high + b.low + b.close) / 3);
  const esa  = _ztEma(hl3, n1);
  const d    = _ztEma(hl3.map((v, i) => Math.abs(v - esa[i])), n1);
  const ci   = hl3.map((v, i) => d[i] ? (v - esa[i]) / (0.015 * d[i]) : 0);
  const wt1  = _ztEma(ci, n2);
  const wt2  = _ztSma(wt1, 4);
  return { wt1, wt2 };
}

function _ztMf(bars, p = 14) {
  const raw = bars.map(b => {
    const r = b.high - b.low + 0.001;
    return (b.close - b.open) / r * (b.tick_volume ?? b.volume ?? 1);
  });
  const pk = Math.max(...raw.map(Math.abs), 1);
  return _ztEma(raw.map(v => v / pk * 100), p);
}

function _ztVwap(bars, dir, win = 20) {
  if (bars.length < win + 5) return { signal: 'NEUTRAL', earlySlope: null, lateSlope: null, ratio: null };
  let cv = 0, ctvp = 0;
  const vw = bars.map(b => {
    const tp = (b.high + b.low + b.close) / 3, vol = b.tick_volume ?? b.volume ?? 1;
    ctvp += tp * vol; cv += vol;
    return cv ? ctvp / cv : tp;
  });
  const rec  = vw.slice(-win);
  const half = Math.floor(win / 2);
  const es   = rec[half] - rec[0];
  const ls   = rec[rec.length - 1] - rec[half];
  const ratio = es !== 0 ? Math.abs(ls) / Math.abs(es) : null;
  let signal = 'NEUTRAL';
  if (dir === 'long') {
    if (es < 0 && ls > 0)                        signal = 'REVERSAL';
    else if (es < 0 && ratio !== null && ratio < 0.45) signal = 'EXHAUSTION';
  } else {
    if (es > 0 && ls < 0)                        signal = 'REVERSAL';
    else if (es > 0 && ratio !== null && ratio < 0.45) signal = 'EXHAUSTION';
  }
  return { signal, earlySlope: es, lateSlope: ls, ratio };
}

// WT oversold/overbought thresholds for gold (mirrors Python WT_OVERSOLD/OVERBOUGHT)
const ZT_WT_OVERSOLD   = -60;
const ZT_WT_OVERBOUGHT =  60;
const ZT_OSC_MIN_DIFF  =  2.0;   // min oscillator units for structural divergence

// Structural swing detection (mirrors Python _find_swings)
function _ztFindSwings(series, left = 3, right = 2) {
  const highs = [], lows = [];
  for (let i = left; i < series.length - right; i++) {
    const v = series[i];
    let isH = true, isL = true;
    for (let j = 1; j <= left;  j++) { if (v <= series[i - j]) isH = false; if (v >= series[i - j]) isL = false; }
    for (let j = 1; j <= right; j++) { if (v <= series[i + j]) isH = false; if (v >= series[i + j]) isL = false; }
    if (isH) highs.push([i, v]);
    if (isL) lows.push([i, v]);
  }
  return { highs, lows };
}

// Structural divergence (mirrors Python _divergence_structural)
// Returns DIVERGENCE_BULL | DIVERGENCE_BEAR | HIDDEN_BULL | HIDDEN_BEAR | NONE
function _ztDivStructural(closes, oscillator, startIdx = 0, swingLeft = 3, swingRight = 2, oscWin = 2, minGap = 5) {
  let c = startIdx > 0 ? closes.slice(startIdx)     : closes;
  let o = startIdx > 0 ? oscillator.slice(startIdx) : oscillator;
  const minBars = swingLeft + swingRight + minGap + 2;
  if (c.length < minBars || o.length < minBars) {
    c = closes.slice(-minBars);
    o = oscillator.slice(-minBars);
    if (c.length < minBars) return 'NONE';
  }
  const n = Math.min(c.length, o.length);
  c = c.slice(0, n); o = o.slice(0, n);

  const { highs: ph, lows: pl } = _ztFindSwings(c, swingLeft, swingRight);

  const oscNear = (idx, takeMax) => {
    const s = Math.max(0, idx - oscWin), e = Math.min(n, idx + oscWin + 1);
    const seg = o.slice(s, e);
    if (!seg.length) return null;
    return takeMax ? Math.max(...seg) : Math.min(...seg);
  };

  if (ph.length >= 2) {
    const [ph1i, ph1] = ph[ph.length - 2], [ph2i, ph2] = ph[ph.length - 1];
    if (ph2i - ph1i >= minGap) {
      const oh1 = oscNear(ph1i, true), oh2 = oscNear(ph2i, true);
      if (oh1 !== null && oh2 !== null) {
        if (ph2 > ph1 && (oh1 - oh2) >= ZT_OSC_MIN_DIFF) return 'DIVERGENCE_BEAR';
        if (ph2 < ph1 && (oh2 - oh1) >= ZT_OSC_MIN_DIFF) return 'HIDDEN_BEAR';
      }
    }
  }
  if (pl.length >= 2) {
    const [pl1i, pl1] = pl[pl.length - 2], [pl2i, pl2] = pl[pl.length - 1];
    if (pl2i - pl1i >= minGap) {
      const ol1 = oscNear(pl1i, false), ol2 = oscNear(pl2i, false);
      if (ol1 !== null && ol2 !== null) {
        if (pl2 < pl1 && (ol2 - ol1) >= ZT_OSC_MIN_DIFF) return 'DIVERGENCE_BULL';
        if (pl2 > pl1 && (ol1 - ol2) >= ZT_OSC_MIN_DIFF) return 'HIDDEN_BULL';
      }
    }
  }
  return 'NONE';
}

// VWAP oscillator series: (close − session_VWAP) normalised ±100
// Mirrors Python _vwap_osc_series
function _ztVwapOscSeries(bars) {
  let cumTpv = 0, cumVol = 0;
  const raw = bars.map(b => {
    const tp = (b.high + b.low + b.close) / 3, vol = b.tick_volume ?? b.volume ?? 1;
    cumTpv += tp * vol; cumVol += vol;
    const vwap = cumVol ? cumTpv / cumVol : tp;
    return b.close - vwap;
  });
  const peak = Math.max(...raw.map(Math.abs), 1);
  return raw.map(v => v / peak * 100);
}

// Structural divergence from zone-entry bar index (fallback to full tail)
function _ztDivFrom(closes, oscillator, startIdx) {
  return _ztDivStructural(closes, oscillator, startIdx);
}

// Returns full VuManChu result including per-component rule/threshold/actual values.
// gpEntryMs: Date.now() ms timestamp of when price first entered the GP window,
//            or null if price hasn't touched the GP yet.
function _ztVuManchu(bars, zoneDir, minComp = 2, gpEntryMs = null) {
  if (!bars || bars.length < 31) return null;
  const closes  = bars.map(b => b.close);
  const { wt1: wt1s, wt2: wt2s } = _ztWt(bars);
  const mfs     = _ztMf(bars);
  const vwap    = _ztVwap(bars, zoneDir);
  const vwapOsc = _ztVwapOscSeries(bars);

  const wt1 = wt1s[wt1s.length - 1] ?? 0;
  const wt2 = isNaN(wt2s[wt2s.length - 1]) ? 0 : (wt2s[wt2s.length - 1] ?? 0);
  const mf  = mfs[mfs.length - 1] ?? 0;

  // ── Resolve zone-entry bar index ──────────────────────────────────────────
  // Find the first bar (by time field) that was captured at or after the GP entry
  // timestamp. Divergence is then measured only from that bar onwards so we catch
  // the Cipher B pattern forming at the zone rather than in the whole window.
  let entryBarIdx = 0;
  if (gpEntryMs != null) {
    const entrySec = gpEntryMs / 1000;
    for (let i = 0; i < bars.length; i++) {
      if ((bars[i].time ?? 0) >= entrySec) { entryBarIdx = i; break; }
    }
  }

  // ── WT signal — priority order (mirrors Python compute_vumanchu) ──────────
  // 1. OVERSOLD / OVERBOUGHT — most direct exhaustion read at the zone
  // 2. Structural divergence (regular + hidden) from last two swing points
  // 3. WT1/WT2 crossover — weakest, only if neither above fires
  let wtSig;
  if      (zoneDir === 'long'  && wt1 <= ZT_WT_OVERSOLD)   wtSig = 'OVERSOLD';
  else if (zoneDir === 'short' && wt1 >= ZT_WT_OVERBOUGHT)  wtSig = 'OVERBOUGHT';
  else {
    const div = _ztDivFrom(closes, wt1s, entryBarIdx);
    if (div !== 'NONE') wtSig = div;
    else                wtSig = wt1 > wt2 ? 'BULLISH' : wt1 < wt2 ? 'BEARISH' : 'NEUTRAL';
  }

  // ── VWAP divergence (structural, price vs VWAP oscillator) ───────────────
  const vwapDiv = _ztDivFrom(closes, vwapOsc, entryBarIdx);

  const prev5      = mfs.slice(-6, -1);
  const mfMax      = prev5.length ? Math.max(...prev5) : mf;
  const mfMin      = prev5.length ? Math.min(...prev5) : mf;
  const mfRollback = mfMax > 0 ? mf / mfMax * 100 : null;
  const mfRollup   = mfMin < 0 ? mf / mfMin * 100 : null;

  let mfSig;
  if      (mfMax > 30 && mf < mfMax * 0.7)  mfSig = 'BEARISH_EXHAUSTION';
  else if (mfMin < -30 && mf > mfMin * 0.7) mfSig = 'BULLISH_EXHAUSTION';
  else if (mf > 20)                          mfSig = 'BULLISH';
  else if (mf < -20)                         mfSig = 'BEARISH';
  else                                       mfSig = 'NEUTRAL';

  const vwapSlopeOk = vwap.signal === 'EXHAUSTION' || vwap.signal === 'REVERSAL';
  const vwapDivOk   = zoneDir === 'long'
    ? (vwapDiv === 'DIVERGENCE_BULL' || vwapDiv === 'HIDDEN_BULL')
    : (vwapDiv === 'DIVERGENCE_BEAR' || vwapDiv === 'HIDDEN_BEAR');
  const vwapOk = vwapSlopeOk || vwapDivOk;
  let aligned = 0;
  const comps = [];

  // ── WT Momentum ───────────────────────────────────────────────────────────
  const wtOk = zoneDir === 'long'
    ? (wtSig === 'OVERSOLD' || wtSig === 'BULLISH' || wtSig === 'DIVERGENCE_BULL' || wtSig === 'HIDDEN_BULL')
    : (wtSig === 'OVERBOUGHT' || wtSig === 'BEARISH' || wtSig === 'DIVERGENCE_BEAR' || wtSig === 'HIDDEN_BEAR');
  if (wtOk) aligned++;

  const isOSOB     = wtSig === 'OVERSOLD' || wtSig === 'OVERBOUGHT';
  const isDivWT    = wtSig.startsWith('DIVERGENCE');
  const isHiddenWT = wtSig.startsWith('HIDDEN');
  const entryBarNote = entryBarIdx > 0 ? ` (from bar ${entryBarIdx}, zone entry)` : ' (full window)';
  const wtRuleMap = {
    DIVERGENCE_BULL: `Price lower low, WT higher low — reversal divergence${entryBarNote}`,
    DIVERGENCE_BEAR: `Price higher high, WT lower high — reversal divergence${entryBarNote}`,
    HIDDEN_BULL:     `Price higher low, WT lower low — hidden bullish (trend continuation)${entryBarNote}`,
    HIDDEN_BEAR:     `Price lower high, WT higher high — hidden bearish (trend continuation)${entryBarNote}`,
  };
  comps.push({
    name:      'Momentum (WT)',
    ok:        wtOk,
    signal:    wtSig,
    rule:      isOSOB
      ? `WT1 ${zoneDir === 'long' ? '≤ −60 (oversold)' : '≥ +60 (overbought)'} — momentum exhausted at zone`
      : (isDivWT || isHiddenWT)
        ? (wtRuleMap[wtSig] ?? `Structural divergence detected${entryBarNote}`)
        : `WT1 (${wt1.toFixed(1)}) ${wt1 > wt2 ? '>' : '<'} WT2 (${wt2.toFixed(1)}) — crossover`,
    threshold: isOSOB ? `WT1 ${zoneDir === 'long' ? '≤ −60' : '≥ +60'}`
             : (isDivWT || isHiddenWT) ? 'Structural swing-point comparison (≥2 osc units)'
             : `WT1 ${zoneDir === 'long' ? '>' : '<'} WT2`,
    actual:    isOSOB ? `WT1 = ${wt1.toFixed(1)}`
             : (isDivWT || isHiddenWT) ? `${wtSig}`
             : `WT1 ${wt1 > wt2 ? '>' : '<'} WT2`,
  });

  // ── Money Flow ────────────────────────────────────────────────────────────
  let mfOk, mfRule, mfThreshold, mfActual;
  if (zoneDir === 'long') {
    mfOk = mfSig === 'BULLISH_EXHAUSTION' || mfSig === 'BULLISH';
    if (mfSig === 'BULLISH_EXHAUSTION') {
      mfRule      = `Bearish spike (${mfMin.toFixed(1)}) rolling back toward 0`;
      mfThreshold = 'spike < −30, rollup > 70% of trough';
      mfActual    = mfRollup !== null ? `${mfRollup.toFixed(0)}% rollup (need >70%)` : '—';
    } else {
      mfRule = 'MF positive pressure'; mfThreshold = '> +20'; mfActual = mf.toFixed(1);
    }
  } else {
    mfOk = mfSig === 'BEARISH_EXHAUSTION' || mfSig === 'BEARISH';
    if (mfSig === 'BEARISH_EXHAUSTION') {
      mfRule      = `Bullish spike (${mfMax.toFixed(1)}) rolling back toward 0`;
      mfThreshold = 'spike > +30, rollback < 70% of spike';
      mfActual    = mfRollback !== null ? `${mfRollback.toFixed(0)}% of spike remains (need <70%)` : '—';
    } else {
      mfRule = 'MF negative pressure'; mfThreshold = '< −20'; mfActual = mf.toFixed(1);
    }
  }
  if (mfOk) aligned++;
  comps.push({ name: 'Money Flow (MF)', ok: mfOk, signal: mfSig, rule: mfRule, threshold: mfThreshold, actual: mfActual });

  // ── VWAP (slope + divergence) ─────────────────────────────────────────────
  let vwapRule, vwapThreshold, vwapActual, vwapSignalLabel;
  if (vwapDivOk) {
    // Divergence triggered — describe the structural div
    const divMap = {
      DIVERGENCE_BULL: 'Price lower low, VWAP osc higher low — reversal',
      DIVERGENCE_BEAR: 'Price higher high, VWAP osc lower high — reversal',
      HIDDEN_BULL:     'Price higher low, VWAP osc lower low — continuation',
      HIDDEN_BEAR:     'Price lower high, VWAP osc higher high — continuation',
    };
    vwapRule      = divMap[vwapDiv] ?? `VWAP divergence: ${vwapDiv}`;
    vwapThreshold = 'Structural swing-point comparison (≥2 osc units)';
    vwapActual    = vwapDiv;
    vwapSignalLabel = vwapDiv;
  } else if (vwap.signal === 'REVERSAL') {
    vwapRule      = `VWAP slope sign-flipped (momentum reversed)`;
    vwapThreshold = 'early/late slope opposite sign';
    vwapActual    = `early ${vwap.earlySlope?.toFixed(3) ?? '—'} → late ${vwap.lateSlope?.toFixed(3) ?? '—'}`;
    vwapSignalLabel = 'REVERSAL';
  } else {
    vwapRule      = `VWAP momentum exhausting into zone`;
    vwapThreshold = 'late slope < 45% of early slope';
    vwapActual    = vwap.ratio !== null ? `${(vwap.ratio * 100).toFixed(0)}% of early slope (need <45%)` : '—';
    vwapSignalLabel = vwap.signal;
  }
  if (vwapOk) aligned++;
  comps.push({ name: 'VWAP', ok: vwapOk, signal: vwapSignalLabel, rule: vwapRule, threshold: vwapThreshold, actual: vwapActual });

  const confidence = aligned >= 3 ? 'HIGH' : aligned >= minComp ? 'MEDIUM' : 'LOW';
  const direction  = aligned >= minComp ? zoneDir.toUpperCase() : 'NEUTRAL';
  return { direction, confidence, aligned, minComp, entryBarIdx, components: comps };
}

// ── Zone ticker state + polling ───────────────────────────────────────────────

const _ZT = {
  timer:          null,
  zones:          null,
  status:         null,
  lastZonesFetch: 0,
  // GP entry tracking: keyed by zone_id → timestamp (ms) when price first
  // entered gp_low..gp_high. Used to anchor zone-entry divergence detection.
  gpEntryTime:    {},
};

const ZT_HISTORY_KEY = 'gold_zone_events';
const ZT_HISTORY_MAX = 100;
const ZT_PROX_PIPS   = 50;   // show VuManChu panel when within this many pips

let _ztLastLoggedZone = null;

// History panel open/close state — must survive every-5s re-renders.
// Stored on window so inline onclick handlers (in innerHTML) can reach it.
window._ztHistOpen = false;

function _ztLogEvent(ev) {
  try {
    const raw    = localStorage.getItem(ZT_HISTORY_KEY);
    const events = raw ? JSON.parse(raw) : [];
    events.unshift({ ...ev, ts: new Date().toISOString() });
    if (events.length > ZT_HISTORY_MAX) events.length = ZT_HISTORY_MAX;
    localStorage.setItem(ZT_HISTORY_KEY, JSON.stringify(events));
  } catch (_) {}
}

function _ztGetHistory() {
  try { return JSON.parse(localStorage.getItem(ZT_HISTORY_KEY) ?? '[]'); } catch (_) { return []; }
}

async function _ztStep() {
  const now = Date.now();

  // Zones payload changes every ~2 min — fetch every 90s
  if (now - _ZT.lastZonesFetch > 90_000) {
    try {
      const r = await fetch('/api/kv/get?key=gold_bot_zones');
      const j = await r.json();
      if (!j.miss && j.data) { _ZT.zones = j.data; _ZT.lastZonesFetch = now; }
    } catch (_) {}
  }

  // Bot status (state, armed zone) — fetch every tick
  try {
    const r = await fetch('/api/kv/get?key=gold_bot_status');
    const j = await r.json();
    if (!j.miss && j.data) _ZT.status = j.data;
  } catch (_) {}

  const price  = _liveQuote ? parseFloat(_liveQuote.price ?? _liveQuote.close ?? _liveQuote.ask ?? 0) || null : null;
  const bars5m = S.ohlc5m?.['XAU/USD']?.values ?? [];
  const zones  = _ZT.zones?.zones ?? [];
  const armedId = _ZT.zones?.armed_zone ?? _ZT.status?.armed_zone ?? null;

  // Find focus zone: armed zone first, else closest within proximity
  let focusZone = null, focusVu = null;
  if (price && zones.length) {
    const withDist = zones
      .map(z => ({ ...z, distPips: Math.max(0, Math.max((z.gp_low ?? 0) - price, price - (z.gp_high ?? 0))) }))
      .sort((a, b) => a.distPips - b.distPips);

    focusZone = armedId
      ? (withDist.find(z => z.zone_id === armedId) ?? (withDist[0]?.distPips <= ZT_PROX_PIPS ? withDist[0] : null))
      : (withDist[0]?.distPips <= ZT_PROX_PIPS ? withDist[0] : null);

    if (focusZone && bars5m.length >= 31) {
      // Track when price first enters the GP window for zone-entry divergence
      const inGP = price != null && price >= (focusZone.gp_low ?? 0) && price <= (focusZone.gp_high ?? 0);
      if (inGP && !_ZT.gpEntryTime[focusZone.zone_id]) {
        _ZT.gpEntryTime[focusZone.zone_id] = Date.now();
      } else if (!inGP && _ZT.gpEntryTime[focusZone.zone_id]) {
        // Price left the GP window — keep entry time so we still detect divergence
        // on any retest; clear only when the zone itself changes.
      }
      // Clear stale entry times for zones no longer focused
      for (const id of Object.keys(_ZT.gpEntryTime)) {
        if (id !== focusZone.zone_id) delete _ZT.gpEntryTime[id];
      }

      const gpEntryMs = _ZT.gpEntryTime[focusZone.zone_id] ?? null;
      focusVu = _ztVuManchu(bars5m.slice(-60), focusZone.direction, 2, gpEntryMs);

      // Log once per zone approach
      if (focusZone.distPips <= ZT_PROX_PIPS && focusZone.zone_id !== _ztLastLoggedZone) {
        _ztLastLoggedZone = focusZone.zone_id;
        if (focusVu) {
          _ztLogEvent({
            zone_id:    focusZone.zone_id,
            direction:  focusZone.direction,
            price,
            dist_pips:  Math.round(focusZone.distPips),
            score:      focusZone.score,
            gp:         `${(focusZone.gp_low ?? 0).toFixed(1)}–${(focusZone.gp_high ?? 0).toFixed(1)}`,
            aligned:    focusVu.aligned,
            min_comp:   focusVu.minComp,
            confidence: focusVu.confidence,
            components: focusVu.components.map(c => ({ name: c.name, ok: c.ok, signal: c.signal })),
          });
        }
      } else if (focusZone.distPips > ZT_PROX_PIPS) {
        _ztLastLoggedZone = null;
      }
    }
  }

  _ztRender(price, zones, focusZone, focusVu, armedId);
}

function startZoneTicker() {
  if (_ZT.timer) clearInterval(_ZT.timer);
  _ztStep();
  _ZT.timer = setInterval(_ztStep, 5_000);
}

// ── Zone ticker render ────────────────────────────────────────────────────────

function _ztConfClass(item) {
  if (/^nPOC/i.test(item))            return 'ztc-npoc';
  if (/^POC /i.test(item))            return 'ztc-poc';
  if (/^HVN/i.test(item))             return 'ztc-hvn';
  if (/^VA[HL]/i.test(item))          return 'ztc-vah';
  if (/VWAP/i.test(item))             return 'ztc-vwap';
  if (/^HTF/i.test(item))             return 'ztc-htf';
  if (/ TL /i.test(item))             return 'ztc-tl';
  if (/cluster/i.test(item))          return 'ztc-cluster';
  if (/retest/i.test(item))            return 'ztc-retest';
  if (/\.(786|886|382|5) @/.test(item)) return 'ztc-fib';
  if (/Daily open/i.test(item))       return 'ztc-session';
  if (/Prev day/i.test(item))         return 'ztc-session';
  if (/Session H\/L/i.test(item))     return 'ztc-session';
  if (/Pivot/i.test(item))            return 'ztc-pivot';
  return 'ztc-other';
}

function _ztConfLabel(item) {
  // nPOC 4521.1 (5d)  → keep as-is (already short)
  if (/^nPOC/.test(item))   return item;
  // VWAP anchor 4521.1 (NY 3d bullish) → VWAP (session+age)
  const vw = item.match(/VWAP anchor [\d.]+ \((\w+) (\d+)d/);
  if (vw) return `VWAP ${vw[1]} ${vw[2]}d`;
  // M30 ascending TL (3t @ 4521.1) → M30 ↑TL 3t
  const tl = item.match(/(\w+) (ascending|descending) TL \((\d+)t/);
  if (tl) return `${tl[1]} ${tl[2] === 'ascending' ? '↑' : '↓'}TL ${tl[3]}t`;
  // H4 886 cluster → H4 .886 clust
  const cl = item.match(/(\w+) (\w+) cluster/);
  if (cl) return `${cl[1]} .${cl[2]} clust`;
  // H4 .786 @ 4521.3 → H4 .786
  const fi = item.match(/(\w+ \.\d+) @/);
  if (fi) return fi[1];
  // HTF BULL → HTF ↑ | HTF BEAR → HTF ↓
  if (/^HTF BULL/.test(item)) return 'HTF ↑';
  if (/^HTF BEAR/.test(item)) return 'HTF ↓';
  return item;
}

// ── Zone card helpers ─────────────────────────────────────────────────────────

// Format a Unix timestamp (seconds) as "Mon DD HH:MM" or "HH:MM today"
function _ztFmtTime(unixSec) {
  if (!unixSec) return null;
  const d = new Date(unixSec * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Swing anchor line: "Impulse ↑  4489.1 (Mon 09:00) → 4542.2 (Mon 11:30)  53.1pts"
function _ztSwingAnchor(z) {
  if (z.swing_origin == null || z.swing_end == null) return '';
  const arrow     = z.direction === 'long' ? '↑' : '↓';
  const originFmt = _ztFmtTime(z.swing_origin_time);
  const endFmt    = _ztFmtTime(z.swing_end_time);
  const originStr = originFmt ? `${z.swing_origin.toFixed(1)} <span class="zt-sw-ts">(${escHtml(originFmt)})</span>`
                               : z.swing_origin.toFixed(1);
  const endStr    = endFmt ? `${z.swing_end.toFixed(1)} <span class="zt-sw-ts">(${escHtml(endFmt)})</span>`
                            : z.swing_end.toFixed(1);
  const pts       = z.impulse_size != null ? ` · <span class="zt-sw-size">${z.impulse_size.toFixed(1)}pt impulse</span>` : '';
  return `<span class="zt-sw-lbl">Impulse ${arrow}</span> ${originStr} → ${endStr}${pts}`;
}

// Horizontal candle chart with fib levels overlaid — mirrors the TradingView layout.
// Time runs left→right, price top→bottom. Fib lines are horizontal with labels on left.
// Bar data comes from shared S state (ohlc30m / ohlc5m / ohlcData depending on zone TF).
function _ztFibSvg(z, price) {
  if (z.swing_origin == null || z.swing_end == null || z.level_382 == null) return '';

  // ── Resolve bar data for zone timeframe ──────────────────────────────────
  const tfBars = {
    'D1':  S.ohlcData?.['XAU/USD']?.values,
    'H4':  S.ohlc30m?.['XAU/USD']?.values,
    'H1':  S.ohlc30m?.['XAU/USD']?.values,
    'M30': S.ohlc30m?.['XAU/USD']?.values,
    'M15': S.ohlc5m?.['XAU/USD']?.values,
  };
  const allBars = tfBars[z.tf] ?? S.ohlc30m?.['XAU/USD']?.values ?? [];

  // Normalise bar timestamp — Oanda bars may use numeric 'time', or string 'time'/'date'
  const bt = b => {
    const t = b.time ?? b.date ?? b.datetime;
    if (!t) return 0;
    if (typeof t === 'number') return t;
    return Math.floor(new Date(t).getTime() / 1000);
  };

  // Bars to display: from the swing origin bar onwards (when available), capped at 80.
  // Fallback to the most recent 80 bars when swing_origin_time is not yet in the KV
  // (bot hasn't restarted with updated code that exports timestamps).
  const hasOriginTime = z.swing_origin_time && z.swing_origin_time > 0;
  let zoneBars;
  if (hasOriginTime && allBars.length) {
    const fromSec = z.swing_origin_time - 300; // include one bar before for context
    zoneBars = allBars.filter(b => bt(b) >= fromSec).slice(0, 80);
  } else {
    zoneBars = allBars.slice(-60); // fallback: recent 60 bars
  }

  // ── Dimensions ────────────────────────────────────────────────────────────
  const W = 310, H = 130;
  const padL = 46, padR = 4, padT = 6, padB = 6;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // ── Price range ───────────────────────────────────────────────────────────
  const pLow  = Math.min(z.swing_origin, z.swing_end);
  const pHigh = Math.max(z.swing_origin, z.swing_end);
  const span  = pHigh - pLow || 1;
  const vMin  = pLow  - span * 0.05;
  const vMax  = pHigh + span * 0.05;
  const vSpan = vMax - vMin;

  const py = p => padT + chartH * (1 - (p - vMin) / vSpan);

  const isLong   = z.direction === 'long';
  const dirColor = isLong ? '#22c55e' : '#ef4444';

  // ── Fib levels ────────────────────────────────────────────────────────────
  // Mirror TradingView colours: white/grey for 0/1, orange for .786/.886, yellow for .618/.65, green .382
  const mid = (z.swing_origin + z.swing_end) / 2;
  const fibLevels = [
    { lbl: '1',    p: z.swing_end,   color: '#e5e7eb', lw: 1.2 },
    { lbl: '.886', p: z.level_886,   color: '#f97316', lw: 0.8 },
    { lbl: '.786', p: z.level_786,   color: '#eab308', lw: 0.8 },
    { lbl: '.65',  p: z.level_650,   color: dirColor,  lw: 1.5 },
    { lbl: '.618', p: z.level_618,   color: dirColor,  lw: 1.5 },
    { lbl: '.5',   p: mid,           color: '#60a5fa', lw: 0.8 },
    { lbl: '.382', p: z.level_382,   color: '#4ade80', lw: 0.8 },
    { lbl: '0',    p: z.swing_origin,color: '#9ca3af', lw: 1.0 },
  ].filter(f => f.p != null);

  let svg = `<svg class="zt-fib-svg zt-fib-candles" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Chart area background
  svg += `<rect x="${padL}" y="${padT}" width="${chartW}" height="${chartH}" fill="rgba(15,20,30,0.7)" rx="2"/>`;

  // GP zone fill
  const gpY1 = py(z.gp_high ?? z.level_618);
  const gpY2 = py(z.gp_low  ?? z.level_650);
  const gpTop = Math.min(gpY1, gpY2);
  const gpHt  = Math.max(Math.abs(gpY2 - gpY1), 3);
  svg += `<rect x="${padL}" y="${gpTop}" width="${chartW}" height="${gpHt}" fill="${dirColor}" fill-opacity="0.15"/>`;

  // Fib horizontal lines + labels
  for (const f of fibLevels) {
    const y    = py(f.p);
    if (y < padT - 2 || y > padT + chartH + 2) continue;   // outside view
    const isGP = f.lbl === '.618' || f.lbl === '.65';
    const dash = f.lw > 1 ? '' : ' stroke-dasharray="3,2"';
    svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${f.color}" stroke-width="${f.lw}"${dash} opacity="${isGP ? 0.9 : 0.5}"/>`;
    // Label: ratio on left, price value in grey after
    svg += `<text x="${padL - 2}" y="${y + 3}" font-size="7.5" fill="${f.color}" text-anchor="end" opacity="${isGP ? 1 : 0.8}">${f.lbl} <tspan fill="#6b7280">${f.p.toFixed(1)}</tspan></text>`;
  }

  // ── Candlesticks ─────────────────────────────────────────────────────────
  if (zoneBars.length >= 2) {
    const n  = zoneBars.length;
    const cw = Math.max(Math.floor(chartW / n * 0.7), 1);
    const spacing = chartW / n;

    for (let i = 0; i < n; i++) {
      const b    = zoneBars[i];
      const o    = parseFloat(b.open),  c = parseFloat(b.close);
      const h    = parseFloat(b.high),  l = parseFloat(b.low);
      const bull = c >= o;
      const col  = bull ? '#22c55e' : '#ef4444';
      const cx   = padL + (i + 0.5) * spacing;

      const oY = py(o), cY = py(c), hY = py(h), lY = py(l);
      const bodyTop = Math.min(oY, cY);
      const bodyHt  = Math.max(Math.abs(cY - oY), 1);

      // Wick
      svg += `<line x1="${cx.toFixed(1)}" y1="${hY.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${lY.toFixed(1)}" stroke="${col}" stroke-width="0.8" opacity="0.6"/>`;
      // Body
      svg += `<rect x="${(cx - cw / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${cw}" height="${bodyHt.toFixed(1)}" fill="${col}" opacity="0.85"/>`;
    }
  } else {
    svg += `<text x="${padL + chartW / 2}" y="${padT + chartH / 2 + 3}" font-size="8" fill="#4b5563" text-anchor="middle">bars loading…</text>`;
  }

  // ── Current price ─────────────────────────────────────────────────────────
  if (price != null) {
    const priceY = py(price);
    if (priceY >= padT && priceY <= padT + chartH) {
      svg += `<line x1="${padL}" y1="${priceY.toFixed(1)}" x2="${W - padR}" y2="${priceY.toFixed(1)}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="2,2"/>`;
      // Price badge pinned to right edge
      svg += `<rect x="${W - padR - 38}" y="${priceY - 7}" width="38" height="12" fill="#f59e0b" rx="2"/>`;
      svg += `<text x="${W - padR - 19}" y="${priceY + 2.5}" font-size="7.5" fill="#000" text-anchor="middle" font-weight="700">${price.toFixed(1)}</text>`;
    }
  }

  svg += '</svg>';
  return svg;
}

function _ztRender(price, zones, focusZone, focusVu, armedId) {
  const el = document.getElementById('goldZoneTicker');
  if (!el) return;

  if (!zones || !zones.length) {
    el.innerHTML = `<div class="zt-card"><div class="zt-title">ZONE TICKER</div><div class="zt-empty">Gold bot offline or no active zones loaded yet</div></div>`;
    return;
  }

  const botState = _ZT.zones?.bot_state ?? _ZT.status?.state ?? '—';
  const htfBias  = _ZT.zones?.htf_bias  ?? '—';
  const htfConf  = _ZT.zones?.htf_confidence ?? 0;

  // Sort zones by distance to price (or just by score if no price)
  const withDist = zones
    .map(z => ({ ...z, distPips: price ? Math.max(0, Math.max((z.gp_low ?? 0) - price, price - (z.gp_high ?? 0))) : 9999 }))
    .sort((a, b) => a.distPips - b.distPips);

  const maxDist = Math.max(...withDist.map(z => z.distPips), 100);

  let zoneRows = '';
  for (const z of withDist.slice(0, 12)) {
    const isArmed  = z.zone_id === armedId;
    const isNear   = z.distPips <= ZT_PROX_PIPS;
    const isFocus  = focusZone?.zone_id === z.zone_id;
    const dirCls   = z.direction === 'long' ? 'zt-bull' : 'zt-bear';
    const barPct   = Math.max(3, Math.round((1 - z.distPips / (maxDist + 50)) * 100));
    const score    = z.score ?? 0;
    const stars    = '★'.repeat(Math.min(Math.round(score), 5)) + '☆'.repeat(Math.max(0, 5 - Math.round(score)));
    const badge    = isArmed ? '<span class="zt-badge zt-badge-armed">ARMED</span>'
                   : isNear  ? '<span class="zt-badge zt-badge-near">NEAR</span>' : '';
    const distStr  = z.distPips < 1 ? 'INSIDE' : `${Math.round(z.distPips)}p`;
    // Zone variant label: GP / .5 / .786 / .886 / RETEST
    const variant  = z.zone_variant ?? (z.zone_id?.endsWith('_786') ? '786' : z.zone_id?.endsWith('_886') ? '886' : z.zone_id?.endsWith('_50pct') ? '50pct' : z.zone_id?.endsWith('_retest') ? 'retest' : 'gp');
    const variantLabel = variant === 'gp' ? 'GP' : variant === '50pct' ? '.5' : variant === 'retest' ? 'RETEST' : `.${variant}`;
    const variantCls   = variant === 'gp' ? 'zt-var-gp' : variant === '786' ? 'zt-var-786' : variant === '886' ? 'zt-var-886' : variant === '50pct' ? 'zt-var-50pct' : 'zt-var-retest';
    // Fib ladder: highlight the zone's own entry level as target
    let fibLadder = '';
    if (price && z.level_382 != null) {
      const targetKey = variant === '786' ? '.786' : variant === '886' ? '.886' : variant === '50pct' ? '.5' : variant === 'retest' ? '.retest' : null;
      const midPrice  = (z.swing_origin != null && z.swing_end != null) ? (z.swing_origin + z.swing_end) / 2 : null;
      const fibs = [
        { label: '.382',    price: z.level_382 },
        { label: '.5',      price: z.level_500 ?? midPrice },
        { label: '.618',    price: z.level_618 ?? z.gp_high },
        { label: '.650',    price: z.level_650 ?? z.gp_low },
        { label: '.786',    price: z.level_786 },
        { label: '.886',    price: z.level_886 },
        ...(variant === 'retest' ? [{ label: '.retest', price: (z.gp_low + z.gp_high) / 2 }] : []),
      ].filter(f => f.price != null);
      fibLadder = fibs.map(f => {
        const diff = Math.round(Math.abs(price - f.price));
        const atLevel = diff <= 3;
        const isTarget = f.label === targetKey || (targetKey === null && (f.label === '.618' || f.label === '.650'));
        const cls = atLevel ? 'zt-fib-at' : isTarget ? 'zt-fib-target' : 'zt-fib-off';
        return `<span class="zt-fib ${cls}" title="${f.price.toFixed(1)}">${f.label}${atLevel ? '◀' : isTarget ? '⬤' : ''}</span>`;
      }).join('');
    }

    // Mini SVG fib chart: vertical representation of the full impulse leg with
    // fib levels marked and current price dot. Shows WHERE the swing came from.
    const fibSvg = _ztFibSvg(z, price);

    // Swing anchor text: shows the actual pivot prices and their dates so you
    // can immediately understand which move this zone was drawn from.
    const swingAnchor = _ztSwingAnchor(z);

    zoneRows += `
      <div class="zt-zone-row${isFocus ? ' zt-zone-focus' : ''}">
        <div class="zt-zone-meta">
          <span class="zt-dir-pill ${dirCls}">${z.direction === 'long' ? '▲' : '▼'} ${(z.direction ?? '').toUpperCase()}</span>
          <span class="zt-tf">${escHtml(z.tf ?? '')}</span>
          <span class="zt-variant ${variantCls}">${variantLabel}</span>
          <span class="zt-gp">${(z.gp_low ?? 0).toFixed(1)}–${(z.gp_high ?? 0).toFixed(1)}</span>
          ${badge}
        </div>
        <div class="zt-bar-wrap"><div class="zt-bar-fill ${dirCls}" style="width:${barPct}%"></div></div>
        <div class="zt-zone-right">
          <span class="zt-stars">${stars}</span>
          <span class="zt-dist">${distStr}</span>
        </div>
        ${fibLadder ? `<div class="zt-fib-ladder" style="grid-column:1/-1">${fibLadder}</div>` : ''}
        ${swingAnchor ? `<div class="zt-swing-anchor" style="grid-column:1/-1">${swingAnchor}</div>` : ''}
        ${fibSvg ? `<div class="zt-fib-chart-row" style="grid-column:1/-1">${fibSvg}</div>` : ''}
        ${(() => {
          const comp = (z.composition ?? []).slice(1);
          if (!comp.length) return '';
          const chips = comp.map(item =>
            `<span class="zt-conf-chip ${_ztConfClass(item)}" title="${escHtml(item)}">${escHtml(_ztConfLabel(item))}</span>`
          ).join('');
          return `<div class="zt-conf-row" style="grid-column:1/-1">${chips}</div>`;
        })()}
      </div>`;
  }

  // VuManChu breakdown panel
  let vuHtml = '';
  if (focusZone && focusVu) {
    const confCls  = focusVu.confidence === 'HIGH' ? 'zt-conf-high' : focusVu.confidence === 'MEDIUM' ? 'zt-conf-med' : 'zt-conf-low';
    const dirLabel = focusZone.direction === 'long' ? '▲ LONG' : '▼ SHORT';
    let compRows = '';
    for (const c of focusVu.components) {
      const icon    = c.ok ? '<span class="zt-pass">✓</span>' : '<span class="zt-fail">✗</span>';
      const sigCls  = c.ok ? 'zt-sig-ok' : 'zt-sig-fail';
      const detail  = c.threshold
        ? `<div class="zt-rule-detail"><span class="zt-rule-lbl">Rule:</span> ${escHtml(c.rule)}<br><span class="zt-rule-lbl">Threshold:</span> ${escHtml(c.threshold)}<br><span class="zt-rule-lbl">Actual:</span> <strong>${escHtml(c.actual)}</strong></div>`
        : `<div class="zt-rule-detail">${escHtml(c.rule)}</div>`;
      compRows += `
        <div class="zt-comp-row">
          <div class="zt-comp-head">${icon}<span class="zt-comp-name">${escHtml(c.name)}</span><span class="zt-sig ${sigCls}">${escHtml(c.signal)}</span></div>
          ${detail}
        </div>`;
    }
    vuHtml = `
      <div class="zt-vu-panel">
        <div class="zt-vu-header">
          <span class="zt-vu-title">VuManChu Cipher B</span>
          <span class="zt-vu-zone">${escHtml(focusZone.zone_id ?? '')}</span>
          <span class="zt-dir-pill ${focusZone.direction === 'long' ? 'zt-bull' : 'zt-bear'}">${dirLabel}</span>
          <span class="zt-conf ${confCls}">${focusVu.aligned}/${focusVu.minComp}+ aligned · ${focusVu.confidence}</span>
        </div>
        ${compRows}
      </div>`;
  } else if (focusZone) {
    vuHtml = `<div class="zt-vu-panel"><div class="zt-empty">Loading 5m bars for VuManChu…</div></div>`;
  }

  // History toggle — state persists across 5s re-renders via window._ztHistOpen
  const histCount = _ztGetHistory().length;
  if (!histCount) window._ztHistOpen = false;   // auto-close when history is empty
  const histBtn   = histCount
    ? `<button class="zt-hist-btn" onclick="window._ztHistOpen=!window._ztHistOpen;const p=document.getElementById('ztHistPanel');if(p)p.classList.toggle('zt-hist-open',window._ztHistOpen)">📋 ${histCount} zone events</button>`
    : '';

  // Sniper Suite pivot marks — sourced from pivot_levels, vwap_anchors, npoc_stack in KV
  const pivLvls     = _ZT.zones?.pivot_levels  ?? null;
  const vwapAnchors = _ZT.zones?.vwap_anchors  ?? [];
  const npocStack   = _ZT.zones?.npoc_stack    ?? [];
  let sniperHtml = '';
  if (price && (pivLvls || vwapAnchors.length || npocStack.length)) {
    const SNAP = 3; // $3 alignment window

    // Tapped/bias data: status KV updates every ~5s via live price ticks;
    // zone KV is the 90s fallback for when the bot has just started.
    const touched    = _ZT.status?.touched          ?? pivLvls?.touched          ?? {};
    const pivBias    = _ZT.status?.pivot_bias        ?? pivLvls?.pivot_bias       ?? 'NEUTRAL';
    const structBias = _ZT.status?.structural_bias   ?? pivLvls?.structural_bias  ?? 'NEUTRAL';
    const momentum   = _ZT.status?.momentum          ?? pivLvls?.momentum         ?? 'NEUTRAL';

    // ── Confluence status box (pivot bias + structural bias + momentum) ────────
    const _biasCls = v => v === 'BULL' ? 'zt-snp-conf-bull' : v === 'BEAR' ? 'zt-snp-conf-bear' : 'zt-snp-conf-neut';
    const _biasArrow = v => v === 'BULL' ? '▲' : v === 'BEAR' ? '▼' : '─';
    const allBull = pivBias === 'BULL' && structBias === 'BULL' && momentum === 'BULL';
    const allBear = pivBias === 'BEAR' && structBias === 'BEAR' && momentum === 'BEAR';
    const verdict = allBull ? 'BULL CONFIRMED' : allBear ? 'BEAR CONFIRMED' : 'NO CONFLUENCE';
    const verdictCls = allBull ? 'zt-snp-verdict-bull' : allBear ? 'zt-snp-verdict-bear' : 'zt-snp-verdict-none';
    const confluenceBox = `
      <div class="zt-snp-conf-box">
        <div class="zt-snp-conf-row">
          <span class="zt-snp-conf-lbl">Pivot Bias</span>
          <span class="zt-snp-conf-val ${_biasCls(pivBias)}">${_biasArrow(pivBias)} ${pivBias}</span>
        </div>
        <div class="zt-snp-conf-row">
          <span class="zt-snp-conf-lbl">Structure</span>
          <span class="zt-snp-conf-val ${_biasCls(structBias)}">${_biasArrow(structBias)} ${structBias}</span>
        </div>
        <div class="zt-snp-conf-row">
          <span class="zt-snp-conf-lbl">Momentum</span>
          <span class="zt-snp-conf-val ${_biasCls(momentum)}">${_biasArrow(momentum)} ${momentum}</span>
        </div>
        <div class="zt-snp-verdict ${verdictCls}">${verdict}</div>
      </div>`;

    // ── Build flat mark list ──────────────────────────────────────────────────
    const marks = [];

    if (pivLvls) {
      marks.push(
        { label: 'VAH',  price: pivLvls.vah,        cls: 'zt-snp-vah',  note: 'prev day VA',    touched: false,           key: true  },
        { label: 'VAL',  price: pivLvls.val,        cls: 'zt-snp-val',  note: 'prev day VA',    touched: false,           key: true  },
        { label: 'PP',   price: pivLvls.pp,         cls: 'zt-snp-pp',   note: 'prev day pivot', touched: touched.pp??false, key: true  },
        { label: 'R1',   price: pivLvls.r1,         cls: 'zt-snp-r',    note: 'daily',          touched: touched.r1??false, key: true  },
        { label: 'R2',   price: pivLvls.r2,         cls: 'zt-snp-r',    note: 'daily',          touched: touched.r2??false, key: false },
        { label: 'S1',   price: pivLvls.s1,         cls: 'zt-snp-s',    note: 'daily',          touched: touched.s1??false, key: true  },
        { label: 'S2',   price: pivLvls.s2,         cls: 'zt-snp-s',    note: 'daily',          touched: touched.s2??false, key: false },
        { label: 'POC',  price: pivLvls.poc,        cls: 'zt-snp-poc',  note: 'today',          touched: false,           key: true  },
        { label: 'VWAP', price: pivLvls.vwap,       cls: 'zt-snp-vwap', note: 'today session',  touched: false,           key: true  },
        { label: 'Open', price: pivLvls.daily_open, cls: 'zt-snp-open', note: 'today open',     touched: false,           key: true  },
      );

      // 4H pivot levels (sub-daily precision, not touched-tracked)
      const h4p = pivLvls.h4_pivot;
      if (h4p) {
        if (h4p.r1) marks.push({ label: 'H4 R1', price: h4p.r1, cls: 'zt-snp-r',  note: '4H pivot', touched: false, key: false });
        if (h4p.pp) marks.push({ label: 'H4 PP', price: h4p.pp, cls: 'zt-snp-pp', note: '4H pivot', touched: false, key: false });
        if (h4p.s1) marks.push({ label: 'H4 S1', price: h4p.s1, cls: 'zt-snp-s',  note: '4H pivot', touched: false, key: false });
      }
    }

    // VWAP anchors — each carries session name, age_days, direction, date
    for (const a of vwapAnchors.slice(0, 5)) {
      if (!a.price) continue;
      const lbl  = `VWAP ${a.session ?? ''}`;
      const note = [
        a.age_days != null ? `${a.age_days}d` : null,
        a.direction ? a.direction : null,
        a.date ?? null,
      ].filter(Boolean).join(' · ');
      marks.push({ label: lbl, price: a.price, cls: 'zt-snp-vwap', note, touched: false, key: false });
    }

    // Naked POC stack — each has price, age_days, date
    for (const n of npocStack.slice(0, 4)) {
      if (!n.price) continue;
      const note = [
        n.age_days != null ? `${n.age_days}d ago` : null,
        n.date ?? null,
      ].filter(Boolean).join(' · ');
      marks.push({ label: 'nPOC', price: n.price, cls: 'zt-snp-poc', note, touched: false, key: false });
    }

    const sorted = marks
      .filter(m => m.price != null && m.price > 0)
      .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
      .slice(0, 14);

    const vah = pivLvls?.vah, val = pivLvls?.val;
    const inVA = vah != null && val != null && price >= val && price <= vah;

    const rows = sorted.map(m => {
      const dist    = m.price - price;
      const distStr = `${dist >= 0 ? '+' : ''}$${Math.abs(dist).toFixed(1)}`;
      const distCls = dist >= 0 ? 'zt-snp-above' : 'zt-snp-below';
      const rowCls  = m.touched ? ' zt-snp-tapped' : '';

      // Tag if any bot Fib zone's GP window overlaps this pivot mark
      const aligned = zones.find(z =>
        z.gp_low != null && z.gp_high != null &&
        m.price >= z.gp_low - SNAP && m.price <= z.gp_high + SNAP
      );
      const alignTag = aligned
        ? `<span class="zt-snp-align">${escHtml(aligned.tf)} ${aligned.direction === 'long' ? '▲' : '▼'} ${(aligned.zone_variant ?? 'gp').toUpperCase()}</span>`
        : '';

      const freshTag = !m.touched && m.key
        ? `<span class="zt-snp-fresh">FRESH</span>`
        : m.touched ? `<span class="zt-snp-tapped-badge">TAPPED</span>` : '';

      const noteHtml = m.note
        ? `<span class="zt-snp-note">${escHtml(m.note)}</span>`
        : '';

      return `<div class="zt-snp-row${rowCls}">
        <span class="zt-snp-lbl ${m.cls}">${escHtml(m.label)}</span>
        <span class="zt-snp-price">${m.price.toFixed(1)}</span>
        <span class="zt-snp-dist ${distCls}">${distStr}</span>
        ${noteHtml}
        ${freshTag}
        ${alignTag}
      </div>`;
    }).join('');

    const vaStr = (vah && val)
      ? `<div class="zt-snp-va-bar">VA ${val.toFixed(1)} – ${vah.toFixed(1)}${inVA ? ' <span class="zt-snp-inside">INSIDE VA</span>' : ''}</div>`
      : '';

    sniperHtml = `
      <div class="zt-sniper-panel">
        <div class="zt-title" style="margin-top:10px">SNIPER MARKS</div>
        ${confluenceBox}
        ${vaStr}
        <div class="zt-snp-grid">${rows}</div>
      </div>`;
  }

  el.innerHTML = `
    <div class="zt-card">
      <div class="zt-title">
        ZONE TICKER
        <span class="zt-bot-state zt-state-${escHtml((botState || '').toLowerCase().replace(/\s+/g, '-'))}">${escHtml(String(botState))}</span>
        <span class="zt-htf-lbl">HTF ${escHtml(htfBias)} ${(htfConf * 100).toFixed(0)}%</span>
        ${histBtn}
      </div>
      <div class="zt-zones">${zoneRows}</div>
      ${_ztSummaryHtml(zones, price)}
      ${sniperHtml}
      ${vuHtml}
      ${histCount ? _ztHistoryHtml() : ''}
    </div>`;
}

// ── Simple zone + confluence summary table ────────────────────────────────────
// Shows every active zone as one plain row: direction, window, distance, how many
// confluence levels converge, and the explicit list of those levels. This makes it
// easy to audit whether the engine found real levels or noise.
function _ztSummaryHtml(zones, price) {
  if (!zones || !zones.length) return '';

  const sorted = [...zones].sort((a, b) => {
    const da = price != null ? Math.max(0, Math.max((a.gp_low ?? 0) - price, price - (a.gp_high ?? 0))) : 9999;
    const db = price != null ? Math.max(0, Math.max((b.gp_low ?? 0) - price, price - (b.gp_high ?? 0))) : 9999;
    return da - db;
  });

  const rows = sorted.map(z => {
    const dist = price != null
      ? Math.max(0, Math.max((z.gp_low ?? 0) - price, price - (z.gp_high ?? 0)))
      : null;
    const gpMid   = ((z.gp_low ?? 0) + (z.gp_high ?? 0)) / 2;
    const distStr = dist == null ? '—'
                  : dist < 1    ? 'AT ZONE'
                  : `${Math.round(dist)}p ${price != null && gpMid > price ? '↑' : '↓'}`;

    const conf    = (z.composition ?? []).slice(1);  // drop "{tf} dir GP" header label
    const nLevels = conf.length;
    const confStr = conf.length ? conf.join(' · ') : 'no extra levels found';

    const dirCls  = z.direction === 'long' ? 'zt-bull' : 'zt-bear';
    const dirLbl  = z.direction === 'long' ? 'BUY' : 'SELL';
    const variant = z.zone_variant ?? 'gp';
    const varLbl  = variant === 'gp' ? 'GP' : variant === '50pct' ? '.5' : variant === 'retest' ? 'RETEST' : `.${variant}`;
    const scoreColor = nLevels >= 3 ? 'var(--green)' : nLevels >= 2 ? 'var(--amber)' : 'var(--text3)';

    return `<tr class="zt-sum-row">
      <td><span class="zt-dir-pill ${dirCls}" style="font-size:9px;padding:1px 5px">${dirLbl}</span></td>
      <td class="zt-mono" style="font-size:10px">${escHtml(z.tf ?? '')} ${varLbl}</td>
      <td class="zt-mono" style="font-size:10px;white-space:nowrap">${(z.gp_low ?? 0).toFixed(1)}–${(z.gp_high ?? 0).toFixed(1)}</td>
      <td class="zt-mono" style="font-size:10px;white-space:nowrap">${distStr}</td>
      <td style="font-size:11px;font-weight:700;color:${scoreColor};text-align:center">${nLevels}</td>
      <td style="font-size:9px;color:var(--text3)">${escHtml(confStr)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="zt-summary-section">
      <div class="zt-title" style="margin-top:12px;font-size:11px;letter-spacing:0.08em">ALL ZONES — LEVEL CONFLUENCE (within $3)</div>
      <div style="font-size:9px;color:var(--text3);margin-bottom:6px">Each row = one active zone. "LEVELS" = how many independent price references land within $3 of its entry window centre.</div>
      <table class="zt-sum-table">
        <thead><tr>
          <th>DIR</th><th>TF / TYPE</th><th>GP WINDOW</th><th>DIST</th><th>LEVELS</th><th>WHAT CONVERGES</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _ztHistoryHtml() {
  const events = _ztGetHistory();
  if (!events.length) return '';
  let rows = '';
  for (const e of events.slice(0, 25)) {
    const d       = new Date(e.ts);
    const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const dirCls  = e.direction === 'long' ? 'zt-bull' : 'zt-bear';
    const passed  = (e.aligned ?? 0) >= (e.min_comp ?? 2);
    const confBadge = `<span class="${passed ? 'zt-pass' : 'zt-fail'}">${e.aligned ?? 0}/3</span>`;
    const icons     = (e.components ?? []).map(c => `<span title="${escHtml(c.name + ': ' + c.signal)}">${c.ok ? '✓' : '✗'}</span>`).join('');
    rows += `<tr>
      <td class="zt-mono">${escHtml(timeStr)}</td>
      <td class="zt-mono" style="font-size:10px">${escHtml(e.zone_id ?? '—')}</td>
      <td><span class="zt-dir-pill ${dirCls}" style="font-size:9px">${(e.direction ?? '').toUpperCase()}</span></td>
      <td class="zt-mono">${(e.price ?? 0).toFixed(2)}</td>
      <td class="zt-mono">${e.dist_pips ?? '—'}p</td>
      <td>${confBadge} <span class="zt-mono" style="font-size:11px;letter-spacing:2px">${icons}</span></td>
    </tr>`;
  }
  return `
    <div id="ztHistPanel" class="zt-history${window._ztHistOpen ? ' zt-hist-open' : ''}">
      <div class="zt-hist-title">Zone Approach History
        <button class="zt-hist-clear" onclick="window._ztHistOpen=false;localStorage.removeItem('${ZT_HISTORY_KEY}');document.getElementById('ztHistPanel').remove()">clear</button>
      </div>
      <table class="zt-hist-table">
        <thead><tr><th>Time</th><th>Zone</th><th>Dir</th><th>Price</th><th>Dist</th><th>VuManChu</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
