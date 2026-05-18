import { S } from './state.js';
import { PAIRS, CACHE_DURATION } from './config.js';
import { kvSet, loadCached, cleanupStaleSessionCaches, fetchAPI, updateStatus, updatePill, londonSessionDay, getDigits, getPipSize, toOandaSym, classifySpread } from './utils.js';
import { TYPICAL_SPREADS } from './config.js';
import { calculateAsiaRanges, calculateMondayRanges } from './ranges.js';
import { calculateStructuralFibs } from './structural-fibs.js';
import { filterConfluences, enhanceConfluences } from './confluences.js';
import { calculateTierScores } from './macro.js';
import { calculateVolRegime, calculatePivots } from './vol.js';
import { loadCaps, openCfgModal, closeCfgModal, saveCaps, resetCaps } from './caps.js';
import { oiLoadStoreFromKV, openOIModal, closeOIModal, processOIData, removeOIInstrument, calcOISpot, updateOIBasis, autoEstimateBasis } from './oi.js';
import { setCompassMode, toggleCompassFX, loadAndRenderCompass } from './compass.js';
import { fvGapToPips, runSignalEngine, runEntryScanner, renderSignalAndEntries, detectCandlePatterns, openRangeBiasModal, closeRangeBiasModal, saveRangeBiasModal } from './signal.js';
import { renderARMAAndTransition } from './arma.js';
import { renderAll } from './render.js';
import { triggerAIAnalysis, copyAIAnalysis, copyAITldr, analyseAllPairs } from './ai.js';
import { loadCOT, openCOTModal, closeCOTModal, saveCOTUrlFromModal, refreshCOT } from './cot.js';
import { detectSession, computeSessionOpens, computeDailyOpens } from './session.js';
import { loadEventData } from './events.js';
import { computeDollarRegime, computeUSDStrength } from './macro.js';
import { exportWatchlistCSV } from './watchlist.js';
import { checkAndSendAlerts, invalidateAlertCache, openAlertModal, closeAlertModal, saveAlertModal, saveTelegramCreds, sendTestAlert, sendTestServerAlert, loadAlertCfg, forceKVSync, checkGoldMacroAlerts, syncGoldModelNow } from './alerts.js';

// ── Debounced renderAll ───────────────────────────────────────────────────────
// Prevents concurrent DOM mutations when async compass resolve + quote refresh
// both fire renderAll in the same tick.
let _renderTimer = null;
const renderAllDebounced = () => {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => { _renderTimer = null; renderAll(); }, 300);
};
window.renderAllDebounced = renderAllDebounced;

// ── Wire window globals for HTML onclick handlers and circular-dep breakers ──
window.renderAll              = renderAll;
window.renderSignalAndEntries = renderSignalAndEntries;
window.renderARMAAndTransition = renderARMAAndTransition;
window.fvGapToPips            = fvGapToPips;
window.openOIModal            = openOIModal;
window.closeOIModal           = closeOIModal;
window.processOIData          = processOIData;
window.removeOIInstrument     = removeOIInstrument;
window.calcOISpot             = calcOISpot;
window.updateOIBasis          = updateOIBasis;
window.autoEstimateBasis      = autoEstimateBasis;
window.openCfgModal           = openCfgModal;
window.closeCfgModal          = closeCfgModal;
window.saveCaps               = saveCaps;
window.resetCaps              = resetCaps;
window.setCompassMode         = setCompassMode;
window.toggleCompassFX        = toggleCompassFX;
window.detectCandlePatterns   = detectCandlePatterns;
window.triggerAIAnalysis      = triggerAIAnalysis;
window.copyAIAnalysis         = copyAIAnalysis;
window.copyAITldr             = copyAITldr;
window.analyseAllPairs        = analyseAllPairs;
window.openCOTModal           = openCOTModal;
window.closeCOTModal          = closeCOTModal;
window.saveCOTUrlFromModal    = saveCOTUrlFromModal;
window.refreshCOT             = refreshCOT;
window.openRangeBiasModal     = openRangeBiasModal;
window.closeRangeBiasModal    = closeRangeBiasModal;
window.saveRangeBiasModal     = saveRangeBiasModal;
window.openAlertModal         = openAlertModal;
window.closeAlertModal        = closeAlertModal;
window.saveAlertModal         = saveAlertModal;
window.saveTelegramCreds      = saveTelegramCreds;
window.sendTestAlert          = sendTestAlert;
window.sendTestServerAlert    = sendTestServerAlert;
window._forceKVSync           = async function() {
  const btn = document.getElementById('alertPushBtn');
  const lbl = document.getElementById('alertPushStatus');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  if (lbl) lbl.textContent = '';
  const result = await forceKVSync();
  if (btn) { btn.disabled = false; btn.textContent = '📤 Push to Bot'; }
  if (lbl) lbl.textContent = result.ok ? '✓ Pushed to Railway bot' : `✗ ${result.error ?? 'failed'}`;
};

window._reloadLevels = async function() {
  const btn = document.getElementById('alertReloadBtn');
  const lbl = document.getElementById('alertReloadStatus');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Loading…'; }
  if (lbl) lbl.textContent = '';
  try {
    const r = await fetch('/api/levels/reload', { method: 'POST' });
    const j = await r.json();
    if (j.ok) {
      if (lbl) lbl.textContent = `✓ Reloaded at ${new Date(j.loadedAt).toLocaleTimeString()}`;
    } else {
      if (lbl) lbl.textContent = `✗ ${j.error ?? 'failed'}`;
    }
  } catch (e) {
    if (lbl) lbl.textContent = `✗ ${e.message}`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Data'; }
  }
};

// ── Initialise state ─────────────────────────────────────────────────────────
S.currentPair = PAIRS[0];

// ── UI helpers ───────────────────────────────────────────────────────────────
function renderPairTabs() {
  document.getElementById('pairTabs').innerHTML = PAIRS.map((p, i) =>
    `<button class="ptab ${i === 0 ? 'active' : ''}" onclick="selectPair(${i})">${p.name}</button>`
  ).join('');
}

window.selectPair = async function(index) {
  S.currentPair = PAIRS[index];
  document.querySelectorAll('.ptab').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
  window._lastEntries = null;          // clear stale proximity targets before new pair loads
  dismissProxAlert();
  updateHeaderRegime();                // switch regime pill immediately from cached data
  await loadAll();
  startLiveStream();                   // restart SSE for new pair
};

window.toggleDark = function() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  document.getElementById('d-icon').textContent = isDark ? '☀️' : '🌙';
  document.getElementById('d-lbl').textContent = isDark ? 'Light' : 'Dark';
};

window.forceRefresh = async function() {
  const symKey = S.currentPair.symbol.replace('/', '');
  const sessionDay = londonSessionDay();

  const keysToDrop = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k === 'fred' || k.startsWith('ohlc_') || k.startsWith('ohlc5m_') ||
        k.startsWith('ohlc30m_') || k.startsWith('quote_') ||
        k.startsWith('ai_') || k.startsWith('compass_')) {
      keysToDrop.push(k);
    }
  }
  keysToDrop.forEach(k => localStorage.removeItem(k));

  const kvKeysToEvict = [
    'fred',
    `ohlc_${symKey}`,
    `ohlc5m_${symKey}_${sessionDay}`,
    `ohlc30m_${symKey}_${sessionDay}`,
    `quote_${symKey}`,
    `ai_${symKey}`,
    `compass_${symKey}`,
  ];
  Promise.all(kvKeysToEvict.map(k => kvSet(k, null).catch(() => {})));

  S.fredData          = null;
  S.ohlcData          = {};
  S.ohlc5m            = {};
  S.ohlc30m           = {};
  S.asiaRangeData     = {};
  S.mondayRangeData   = {};
  S.compassData       = {};   // reset so signal engine doesn't read stale compass during refresh
  S.usdStrength       = null;
  S.dollarRegime      = null;
  S.eventRisk         = null;
  S.surpriseIndex     = null;
  S.otcForecast       = null;
  S.macroQuadrant     = null;
  S.ecbData           = null;

  updateStatus('spin', `Refreshing ${S.currentPair.name}...`);
  loadAll();
};

// ── Fix 25: Header price + proximity alert ────────────────────────────────────

function updateHeaderPrice(quote) {
  if (!quote || quote.price == null) return;
  const sym    = S.currentPair.symbol;
  const digits = getDigits(sym);
  const el  = document.getElementById('hdrPrice');
  const pEl = document.getElementById('hdrPairPrice');
  const nEl = document.getElementById('hdrPairName');
  if (!el) return;
  if (nEl) nEl.textContent = S.currentPair.name;
  if (pEl) pEl.textContent = quote.price.toFixed(digits);
  el.style.display = 'flex';
}

// ── Live 5m HMM regime ────────────────────────────────────────────────────────

function updateHeaderRegime() {
  const sym = S.currentPair?.symbol;
  const el  = document.getElementById('hdrRegime');
  if (!el) return;
  const r = S.hmm5mRegimes?.[sym];
  if (!r) { el.style.display = 'none'; return; }
  const lbl  = document.getElementById('hdrRegimeLbl');
  const conf = document.getElementById('hdrRegimeConf');
  if (lbl)  lbl.textContent  = r.regime;
  if (conf) conf.textContent = `${r.confidence}%`;
  el.className = `hdr-regime ${r.regime.toLowerCase()}`;
  el.title     = `Bull ${r.pBull}%  ·  Bear ${r.pBear}%  ·  Range ${r.pRange}%\ntrendZ ${r.trendZ}  volZ ${r.volZ}  adxZ ${r.adxZ}`;
  el.style.display = 'flex';
}

async function loadHMM5m() {
  try {
    const r = await fetch('/api/hmm5m');
    if (!r.ok) return;
    S.hmm5mRegimes = await r.json();
    updateHeaderRegime();
  } catch {}
}

// Proximity thresholds (pips / points from the level)
const _PROX_PIPS = { 'NAS100_USD': 20, 'XAU/USD': 5 };

function checkProximityAlerts() {
  const entries = window._lastEntries;
  if (!entries || !entries.length || !window._latestQuote) return;
  const sym     = S.currentPair.symbol;
  const price   = window._latestQuote.price;
  const pipSz   = getPipSize(sym);
  const proxPips = _PROX_PIPS[sym] ?? 3;
  const proxDist = proxPips * pipSz;

  const nearby = entries
    .filter(e => Math.abs(e.price - price) <= proxDist)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));

  const alertEl = document.getElementById('proxAlert');
  if (!alertEl) return;

  if (!nearby.length) { alertEl.style.display = 'none'; return; }

  const e      = nearby[0];
  const digits = getDigits(sym);
  const unit   = sym === 'NAS100_USD' ? 'pts' : 'p';
  const dist   = Math.round(Math.abs(e.price - price) / pipSz);
  const urgency = dist <= 1 ? 'red' : dist <= 2 ? 'amber' : 'green';

  alertEl.style.display = 'flex';
  alertEl.className = `prox-alert ${urgency}`;
  alertEl.innerHTML = `
    <span class="pa-icon">${urgency === 'red' ? '🔴' : urgency === 'amber' ? '🟡' : '🟢'}</span>
    <span class="pa-main">${dist <= 0 ? 'AT' : dist + unit + ' from'} <strong>${e.price.toFixed(digits)}</strong> ${e.direction === 'long' ? '↑ BUY' : '↓ SELL'} · ${'★'.repeat(Math.min(5, e.totalStars || 0))}</span>
    ${e.candleConfirmed === true ? '<span class="pa-confirm">5m ✔</span>' : ''}
    <button class="pa-close" onclick="dismissProxAlert()">✕</button>
  `;
}

function dismissProxAlert() {
  const el = document.getElementById('proxAlert');
  if (el) el.style.display = 'none';
}
window.dismissProxAlert = dismissProxAlert;

// ── Fix 23: SSE live stream ───────────────────────────────────────────────────
// _latestQuotes[sym] stores the freshest tick per symbol.
// _latestQuote is a live reference to the active pair's quote — all existing
// code that reads window._latestQuote continues to work without changes.

window._latestQuotes = window._latestQuotes || {};

let _sseSource  = null;                  // active-pair stream
let _bgSseSrcs  = {};                    // background streams keyed by symbol
let _lastFullRender = 0;
const STREAM_RENDER_INTERVAL = 30_000;

function _storeQuote(sym, d) {
  window._latestQuotes[sym] = { price: d.price, bid: d.bid, ask: d.ask };
  // Keep the legacy single-quote reference pointing at the active pair
  if (sym === S.currentPair?.symbol) {
    window._latestQuote = window._latestQuotes[sym];
  }
}

// Reconnect state for the active stream
let _sseReconnectTimer = null;
let _sseReconnectDelay = 3000;   // starts at 3s, backs off to 30s max
const SSE_MAX_DELAY = 30_000;

function _clearReconnectTimer() {
  if (_sseReconnectTimer) { clearTimeout(_sseReconnectTimer); _sseReconnectTimer = null; }
}

function startLiveStream() {
  _clearReconnectTimer();
  if (_sseSource) { try { _sseSource.close(); } catch(e) {} _sseSource = null; }
  const sym = S.currentPair.symbol;

  // Reset backoff when manually starting a new stream (pair change / page load)
  _sseReconnectDelay = 3000;

  _openSseForSym(sym);

  // Restart background streams whenever the active pair changes
  startBackgroundStreams();
}
window.startLiveStream = startLiveStream;

// Reconnect immediately when tab becomes visible again (phone call end, app switch, etc.)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.currentPair && (!_sseSource || _sseSource.readyState === EventSource.CLOSED)) {
    _sseReconnectDelay = 3000;
    _clearReconnectTimer();
    startLiveStream();
  }
});

function _openSseForSym(sym) {
  // Guard: don't open if the pair has changed since this reconnect was scheduled
  if (sym !== S.currentPair?.symbol) return;

  try {
    const src = new EventSource(`/api/oanda_stream?symbol=${encodeURIComponent(sym)}`);
    let receivedTick = false;

    src.onmessage = evt => {
      try {
        const d = JSON.parse(evt.data);
        _sseReconnectDelay = 3000; // reset backoff on any valid message (price or heartbeat)
        if (d.price != null) {
          receivedTick = true;
          _storeQuote(sym, d);
          updateHeaderPrice(window._latestQuote);
          checkProximityAlerts();
          checkAndSendAlerts();
          const updEl = document.getElementById('upd');
          if (updEl) updEl.textContent = new Date().toLocaleTimeString();
          const now = Date.now();
          if (now - _lastFullRender >= STREAM_RENDER_INTERVAL) {
            _lastFullRender = now;
            renderAllDebounced();
          }
        }
      } catch(e) {}
    };

    src.onerror = () => {
      try { src.close(); } catch(e) {}
      if (_sseSource !== src) return; // already superseded by a pair change
      _sseSource = null;

      // Show reconnecting state in header
      const updEl = document.getElementById('upd');
      if (updEl) updEl.textContent = 'reconnecting…';

      // Exponential backoff: 3s → 6s → 12s → 24s → 30s max
      _sseReconnectDelay = Math.min(_sseReconnectDelay * 2, SSE_MAX_DELAY);
      _clearReconnectTimer();
      _sseReconnectTimer = setTimeout(() => {
        _sseReconnectTimer = null;
        _openSseForSym(sym);
      }, _sseReconnectDelay);
    };

    _sseSource = src;
  } catch(e) {
    _sseSource = null;
    // Retry after backoff even on synchronous throw
    _sseReconnectDelay = Math.min(_sseReconnectDelay * 2, SSE_MAX_DELAY);
    _sseReconnectTimer = setTimeout(() => {
      _sseReconnectTimer = null;
      _openSseForSym(sym);
    }, _sseReconnectDelay);
  }
}

// Open one SSE stream per alert-watch pair that isn't the active pair.
// Ticks only update _latestQuotes[sym] — no DOM changes.
function startBackgroundStreams() {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('tg_alert_cfg') || '{}'); } catch(e) { return {}; } })();
  if (!cfg.enabled) { _closeBackgroundStreams(); return; }

  const watchPairs = cfg.pairs && cfg.pairs.length > 0
    ? cfg.pairs
    : PAIRS.map(p => p.symbol);          // all pairs if no filter set

  const activeSym = S.currentPair?.symbol;

  // Close streams for pairs no longer watched
  for (const [sym, src] of Object.entries(_bgSseSrcs)) {
    if (!watchPairs.includes(sym) || sym === activeSym) {
      try { src.close(); } catch(e) {}
      delete _bgSseSrcs[sym];
    }
  }

  // Open streams for new watch pairs (skip active — already has _sseSource)
  for (const sym of watchPairs) {
    if (sym === activeSym) continue;
    if (_bgSseSrcs[sym]) continue;       // already streaming
    _openBgSseForSym(sym);
  }
}

function _closeBackgroundStreams() {
  for (const src of Object.values(_bgSseSrcs)) { try { src.close(); } catch(e) {} }
  _bgSseSrcs = {};
  for (const t of Object.values(_bgReconnectTimers)) clearTimeout(t);
  for (const k of Object.keys(_bgReconnectTimers)) delete _bgReconnectTimers[k];
}
window.startBackgroundStreams = startBackgroundStreams;

// Per-symbol reconnect delays for background streams
const _bgReconnectDelays = {};
const _bgReconnectTimers = {};

function _openBgSseForSym(sym) {
  // Don't reconnect if this sym is now the active pair or no longer watched
  if (sym === S.currentPair?.symbol) return;
  if (_bgSseSrcs[sym]) return; // already has a live handle

  if (!_bgReconnectDelays[sym]) _bgReconnectDelays[sym] = 3000;

  try {
    const src = new EventSource(`/api/oanda_stream?symbol=${encodeURIComponent(sym)}`);
    src.onmessage = evt => {
      try {
        const d = JSON.parse(evt.data);
        if (d.price != null) {
          _bgReconnectDelays[sym] = 3000; // reset backoff on good tick
          _storeQuote(sym, d);
          // No alert check here — background pairs have no range data loaded so
          // checkAndSendAlerts() would skip them immediately. Railway bot monitors all pairs.
        }
      } catch(e) {}
    };
    src.onerror = () => {
      try { src.close(); } catch(e) {}
      // Only reconnect if still a background sym (not taken over by pair switch)
      if (_bgSseSrcs[sym] !== src) return;
      delete _bgSseSrcs[sym];
      if (_bgReconnectTimers[sym]) return; // already scheduled
      _bgReconnectDelays[sym] = Math.min((_bgReconnectDelays[sym] || 3000) * 2, SSE_MAX_DELAY);
      _bgReconnectTimers[sym] = setTimeout(() => {
        delete _bgReconnectTimers[sym];
        _openBgSseForSym(sym);
      }, _bgReconnectDelays[sym]);
    };
    _bgSseSrcs[sym] = src;
  } catch(e) {
    delete _bgSseSrcs[sym];
    _bgReconnectDelays[sym] = Math.min((_bgReconnectDelays[sym] || 3000) * 2, SSE_MAX_DELAY);
    _bgReconnectTimers[sym] = setTimeout(() => {
      delete _bgReconnectTimers[sym];
      _openBgSseForSym(sym);
    }, _bgReconnectDelays[sym]);
  }
}

// ── Spread + Sentiment loaders ────────────────────────────────────────────────

async function loadSpreadData() {
  if (!S.hasOanda) return;
  const sym = S.currentPair?.symbol;
  if (!sym) return;
  const oandaSym = toOandaSym(sym);
  try {
    const res = await fetch(`/api/spread?symbol=${encodeURIComponent(oandaSym)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.error) return;
    const typical = TYPICAL_SPREADS[sym] ?? null;
    const prev = S.spreadData[sym];
    S.spreadData[sym] = {
      spreadPips:     data.spreadPips,
      classification: classifySpread(data.spreadPips, typical),
      bid:            data.bid,
      ask:            data.ask,
      timestamp:      data.timestamp,
    };
    // Only re-render if the spread classification changed — avoids a render every 60s
    if (!prev || prev.classification !== S.spreadData[sym].classification) renderAllDebounced();
  } catch(e) {
    // Non-critical — spread row hidden if no data
  }
}

async function loadSentimentData() {
  if (!S.hasMyfxbook) return;
  try {
    const res = await fetch('/api/sentiment');
    if (!res.ok) return;
    const data = await res.json();
    if (data.error) return;
    // Store keyed by EURUSD-style symbol (savedAt is metadata, not a pair key)
    S.myfxSentiment = data;
    renderAllDebounced();
  } catch(e) {
    // Non-critical — sentiment row hidden if no data
  }
}

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  if (!S._caps) await loadCaps();
  try {
    updateStatus('spin', `Loading ${S.currentPair.name}...`);

    oiLoadStoreFromKV().catch(() => {});
    loadCOT().catch(() => {});
    cleanupStaleSessionCaches();

    const sym        = S.currentPair.symbol;
    const symKey     = sym.replace('/', '');
    const sessionDay = londonSessionDay();

    // Fire all independent fetches in parallel — cached values resolve instantly
    const [fredData, ecbData, cfg, ohlcData, ohlc5mData, ohlc30mData, quote] =
      await Promise.all([
        S.fredData ? Promise.resolve(S.fredData) :
          loadCached('fred', () => fetchAPI('/api/fred'), CACHE_DURATION.FRED),
        S.ecbData ? Promise.resolve(S.ecbData) :
          fetch('/api/ecbsdw').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/config').then(r => r.json()).catch(() => ({})),
        S.ohlcData[sym] ? Promise.resolve(S.ohlcData[sym]) :
          loadCached(`ohlc_${symKey}`, () => fetchAPI(`/api/ohlc?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC),
        S.ohlc5m[sym] ? Promise.resolve(S.ohlc5m[sym]) :
          loadCached(`ohlc5m_${symKey}_${sessionDay}`, () => fetchAPI(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC5M),
        S.ohlc30m[sym] ? Promise.resolve(S.ohlc30m[sym]) :
          loadCached(`ohlc30m_${symKey}_${sessionDay}`, () => fetchAPI(`/api/oanda_ohlc30m?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC30M),
        loadCached(`quote_${symKey}`, () => fetchAPI(`/api/quote?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.QUOTE),
      ]);

    // Apply global results
    if (!S.fredData) { S.fredData = fredData; updatePill('pillFred', 'ok'); }
    if (!S.ecbData)    S.ecbData  = ecbData;
    if (cfg.hasAnt)    updatePill('pillAnt', 'ant');
    if (cfg.hasKV)     updatePill('pillKV',  'ok');
    S.hasOanda    = !!cfg.hasOanda;
    S.hasMyfxbook = !!cfg.hasMyfxbook;

    // Non-blocking background tasks (need cfg first for hasFinnhub)
    loadEventData(!!cfg.hasFinnhub).catch(() => {});
    loadSpreadData().catch(() => {});
    loadSentimentData().catch(() => {});

    // Apply pair OHLC results
    S.ohlcData[sym] = ohlcData;  updatePill('pillOhlc', 'ok');
    S.ohlc5m[sym]   = ohlc5mData; updatePill('pill5m', 'ok');
    S.ohlc30m[sym]  = ohlc30mData; updatePill('pill30m', 'ok');
    updatePill('pillQuote', 'ok');

    // Session data (no network — instant)
    S.sessionData = detectSession();
    const _bars5m     = S.ohlc5m[sym]?.values || [];
    const _opens      = computeSessionOpens(_bars5m);
    const _dailyOpens = computeDailyOpens(S.ohlcData[sym]?.values || [], 30);
    if (S.sessionData) {
      S.sessionData.londonOpenPrice = _opens.londonOpenPrice;
      S.sessionData.nyOpenPrice     = _opens.nyOpenPrice;
      S.sessionData.dailyOpens      = _dailyOpens;
      S.sessionData.dailyOpenPrice  = _dailyOpens[0]?.price ?? null;
    }

    calculateAsiaRanges(sym);
    calculateMondayRanges(sym);
    calculateStructuralFibs(sym);
    _storeQuote(sym, quote);
    updateHeaderPrice(quote);

    // Oanda position book for retail sentiment range-bias feature (non-blocking, ~20min data)
    fetch(`/api/oanda_book?symbol=${encodeURIComponent(S.currentPair.symbol)}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.miss) {
          S.oandaBook[S.currentPair.symbol] = data;
          renderAllDebounced();
        }
      })
      .catch(() => {});

    // Background-load daily OHLC for the 4 USD-index pairs (cached 23h — no extra API cost
    // after first load). Each arrival updates S.usdStrength so the composite improves live.
    const USD_INDEX_PAIRS = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY'];
    USD_INDEX_PAIRS.forEach(sym => {
      if (!S.ohlcData[sym]) {
        const sk = sym.replace('/', '');
        loadCached(`ohlc_${sk}`,
          () => fetchAPI(`/api/ohlc?symbol=${encodeURIComponent(sym)}`),
          CACHE_DURATION.OHLC
        ).then(data => {
          if (data) {
            S.ohlcData[sym] = data;
            S.usdStrength   = computeUSDStrength();
            S.dollarRegime  = computeDollarRegime();
          }
        }).catch(() => {});
      }
    });
    // Initial computation from whatever's already in state
    S.usdStrength  = computeUSDStrength();
    S.dollarRegime = computeDollarRegime();

    // HMM regimes — computed server-side every 30 min, fetch once per session
    if (!Object.keys(S.hmmRegimes).length) {
      fetch('/api/hmm/regimes')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) { S.hmmRegimes = data; renderAllDebounced(); } })
        .catch(() => {});
    }


    window._exportWatchlist = (pair, topN, btn) => {
      const csv = exportWatchlistCSV(pair, topN);
      if (!csv) { console.warn('[watchlist] no levels to export for', pair); return; }
      navigator.clipboard.writeText(csv).then(() => {
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = '✓ Copied!';
          btn.style.color = '#22c55e';
          setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
        }
      }).catch(() => {
        // Fallback for browsers that block clipboard without user gesture
        const ta = document.createElement('textarea');
        ta.value = csv;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = topN != null ? '📋 Top 5 for TV' : '📋 All levels'; }, 1800); }
      });
    };

    renderAll();

    // Gold macro model — compute after FRED data is available.
    // Stores result in S.goldModel and pushes to KV for the bot.
    // Also checks macro-level Telegram alerts (regime changes, uncertainty spikes).
    if (S.fredData) {
      // Pre-populate vol regime scratch slot so gold T1 can use GARCH output
      if (S.currentPair.isGold) {
        try { S._goldVolRegime = calculateVolRegime(); } catch(_) {}
      }
      // Non-blocking: sync gold model to KV and check macro alerts
      syncGoldModelNow().catch(() => {});
      checkGoldMacroAlerts().catch(() => {});
    }

    updateStatus('ok', `${S.currentPair.name} loaded · ${S.asiaRangeData[S.currentPair.symbol].confluences.length + S.mondayRangeData[S.currentPair.symbol].confluences.length} total confluences`);
  } catch (error) {
    console.error('Load error:', error);
    updateStatus('err', `Error: ${error.message}`);
    document.getElementById('mainContent').innerHTML =
      `<div class="card" style="color:var(--red);text-align:center;padding:30px">${error.message}</div>`;
  }
}

async function refreshQuote() {
  try {
    const symKey = S.currentPair.symbol.replace('/', '');
    const quote = await fetchAPI(`/api/quote?symbol=${encodeURIComponent(S.currentPair.symbol)}`);
    localStorage.setItem(`quote_${symKey}`, JSON.stringify({ data: quote, timestamp: Date.now() }));
    _storeQuote(S.currentPair.symbol, quote);

    try {
      const bars = S.ohlc5m[S.currentPair.symbol]?.values;
      const latestOpenMs = bars && bars.length
        ? new Date(bars[0].datetime.replace(' ', 'T') + 'Z').getTime()
        : 0;
      if (Date.now() - latestOpenMs > 10 * 60 * 1000) {
        const fresh = await fetchAPI(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(S.currentPair.symbol)}`);
        if (fresh && fresh.values && fresh.values.length) {
          S.ohlc5m[S.currentPair.symbol] = fresh;
          calculateAsiaRanges(S.currentPair.symbol);
          invalidateAlertCache(S.currentPair.symbol); // force entry recompute on next alert check
        }
      }
    } catch (e) {
      console.warn('5m anchor refresh skipped:', e.message);
    }

    // 30m refresh — a new bar closes every 30 min; fetch when latest bar is >35 min old.
    // Recalculates Monday range and structural fibs once per new bar, not every 5 min tick.
    try {
      const bars30 = S.ohlc30m[S.currentPair.symbol]?.values;
      const latest30Ms = bars30 && bars30.length
        ? new Date(bars30[0].datetime.replace(' ', 'T') + 'Z').getTime()
        : 0;
      if (Date.now() - latest30Ms > 35 * 60 * 1000) {
        const fresh30 = await fetchAPI(`/api/oanda_ohlc30m?symbol=${encodeURIComponent(S.currentPair.symbol)}`);
        if (fresh30 && fresh30.values && fresh30.values.length) {
          S.ohlc30m[S.currentPair.symbol] = fresh30;
          calculateMondayRanges(S.currentPair.symbol);
          calculateStructuralFibs(S.currentPair.symbol);
        }
      }
    } catch (e) {
      console.warn('30m refresh skipped:', e.message);
    }

    updateHeaderPrice(window._latestQuotes[S.currentPair.symbol]);
    checkProximityAlerts();
    checkAndSendAlerts();
    renderAllDebounced();
    document.getElementById('upd').textContent = new Date().toLocaleTimeString();
  } catch (error) {
    console.error('Quote refresh failed:', error);
  }
}

// ── Journal localStorage helper ───────────────────────────────────────────────
// Attempts to write to localStorage; on QuotaExceededError, prunes dates older
// than 30 days and retries once. Returns true if local save succeeded.
function tryJournalLocalSave(key, data) {
  const json = JSON.stringify(data);
  try {
    localStorage.setItem(key, json);
    return true;
  } catch (e) {
    if (!e.name?.includes('QuotaExceeded') && e.code !== 22) return false;
    // Prune entries older than 30 days then retry
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    let pruned = false;
    for (const date of Object.keys(data)) {
      if (date < cutoffStr) { delete data[date]; pruned = true; }
    }
    if (!pruned) return false;
    try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch (e2) { return false; }
  }
}

// ── Trade journal snapshot ────────────────────────────────────────────────────
window.saveToJournal = function() {
  try {
    const sym   = S.currentPair.symbol;
    const date  = new Date().toISOString().split('T')[0];
    const quote = window._latestQuote;

    if (!quote) { alert('No quote loaded yet — wait for data to finish loading.'); return; }
    if (!S.fredData) { alert('FRED data not loaded yet — wait a moment and try again.'); return; }

    const tierData  = calculateTierScores();
    const volRegime = calculateVolRegime();
    const pivots    = calculatePivots();
    const asia      = S.asiaRangeData[sym]   || { today: null, yesterday: null, confluences: [] };
    const monday    = S.mondayRangeData[sym] || { current: null, previous: null, confluences: [] };
    const macroBias = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';

    const allConfluences = [
      ...(asia.confluences   || []).map(c => ({...c, source: 'asia'})),
      ...(monday.confluences || []).map(c => ({...c, source: 'monday'}))
    ];
    // Always save all levels — strength filter is display-only in the journal
    const enhanced  = enhanceConfluences(allConfluences, quote.price, macroBias, pivots, volRegime, tierData.totalScore);
    enhanced.sort((a, b) => b.stars !== a.stars ? b.stars - a.stars : a.distance - b.distance);

    const signal  = runSignalEngine(S.compassData, volRegime);
    const entries = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime);

    const seenPrices = new Set();
    const levels = [];

    enhanced.forEach(c => {
      const key = c.price.toFixed(getDigits(sym));
      if (seenPrices.has(key)) return;
      seenPrices.add(key);
      const tags = [];
      if (c.source === 'asia')   tags.push({ label: 'Asia Fib',   cls: 'fib' });
      if (c.source === 'monday') tags.push({ label: 'Monday Fib', cls: 'fib' });
      if (c.isTight)             tags.push({ label: 'Tight',      cls: 'fib' });
      if (c.aligned)             tags.push({ label: `Aligned ${macroBias}`, cls: 'signal' });
      if (c.pivotMatch)          tags.push({ label: `Pivot ${c.pivotMatch}`, cls: 'pivot' });
      levels.push({
        price:     c.price,
        direction: c.direction,
        stars:     c.stars,
        isTight:       c.isTight       || false,
        isRoundNumber: c.isRoundNumber || false,
        todayFib:      c.todayFib      ?? null,
        sl:            c.sl  || null,
        tp:            c.tp  || null,
        aligned:       c.aligned    || false,
        pivotMatch:    c.pivotMatch || null,
        distance:      c.distance,
        tags,
        source:    'fib',
        watchlist: (c.totalStars ?? 0) >= 4,
      });
    });

    (entries || []).forEach(e => {
      const key = e.price.toFixed(getDigits(sym));
      if (seenPrices.has(key)) return;
      seenPrices.add(key);
      levels.push({
        price:     e.price,
        direction: e.direction,
        stars:     e.totalStars || e.stars || 1,
        isTight:       e.isTight       || false,
        isRoundNumber: e.isRoundNumber || false,
        todayFib:      e.todayFib      ?? null,
        sl:            e.sl  || null,
        tp:            e.tp  || null,
        aligned:       e.aligned || false,
        distance:      e.distance,
        tags:          (e.tags || []).map(t => ({ label: t.label, cls: t.cls || 'range' })),
        source:        'scanner',
        watchlist:     (e.totalStars ?? 0) >= 4,
      });
    });

    if (levels.length === 0) {
      alert('No confluence levels detected for ' + sym + '.\nMake sure data has fully loaded (check status pills).');
      return;
    }

    const macro = {
      bias:      macroBias,
      score:     tierData.totalScore,
      maxScore:  tierData.maxScore,
      volRegime: volRegime.regime,
      atrPips:   volRegime.atrPips,
      garchPips: volRegime.garch ? volRegime.garch.pips : null,
    };

    // Write directly to journal_store — merge preserving existing trade status/notes
    const JKEY = 'journal_store';
    let jData = {};
    try { const raw = localStorage.getItem(JKEY); if (raw) jData = JSON.parse(raw) || {}; } catch(e) {}
    if (!jData[date]) jData[date] = {};
    const existing    = jData[date][sym] || { levels: [], macro: {} };
    const existingMap = {};
    (existing.levels || []).forEach(l => { existingMap[l.price + '_' + l.direction] = l; });
    const merged = levels.map(l => {
      const ex = existingMap[l.price + '_' + l.direction];
      // Preserve user-entered fields; let new save win on watchlist (it reflects today's computed list)
      return ex ? { ...l, trade: ex.trade, outcome: ex.outcome, notes: ex.notes, slOverride: ex.slOverride, tpOverride: ex.tpOverride, watchlist: l.watchlist || ex.watchlist } : l;
    });
    jData[date][sym] = { levels: merged, macro, savedAt: new Date().toISOString() };
    const localOk = tryJournalLocalSave(JKEY, jData);
    if (!localOk) console.warn('Journal: localStorage full — data saved to KV only');
    // Always sync to KV regardless of local storage success
    kvSet(JKEY, jData).catch(() => {});
    // Remove any stale pending key from old workflow
    localStorage.removeItem('journal_pending');

    const btn = document.getElementById('journalBtn');
    if (btn) {
      const origSpan = btn.querySelector('span:last-child');
      const orig     = origSpan ? origSpan.textContent : '';
      btn.style.background   = 'var(--green-bg)';
      btn.style.color        = 'var(--green)';
      btn.style.borderColor  = 'var(--green-bd)';
      if (origSpan) origSpan.textContent = 'Saved!';
      setTimeout(() => {
        btn.style.background  = '';
        btn.style.color       = 'var(--purple)';
        btn.style.borderColor = 'var(--purple-bd)';
        if (origSpan) origSpan.textContent = orig;
      }, 2000);
    }

    console.log('Journal: saved ' + merged.length + ' levels for ' + sym + ' on ' + date);
  } catch(e) {
    console.error('saveToJournal error:', e);
    alert('Error saving to journal: ' + e.message);
  }
};

// ── Save ALL pairs to journal in one click ────────────────────────────────────
window.saveAllPairsToJournal = async function() {
  const btn = document.getElementById('journalAllBtn');
  if (btn) { btn.disabled = true; btn.querySelector('span:last-child').textContent = 'Saving…'; }

  const date   = new Date().toISOString().split('T')[0];
  const JKEY   = 'journal_store';
  let   jData  = {};
  try { const raw = localStorage.getItem(JKEY); if (raw) jData = JSON.parse(raw) || {}; } catch(e) {}
  if (!jData[date]) jData[date] = {};

  const savedPairs  = [];
  const skippedPairs = [];
  const originalPair = S.currentPair;

  for (const pairObj of PAIRS) {
    const sym    = pairObj.symbol;
    const asia   = S.asiaRangeData[sym];
    const monday = S.mondayRangeData[sym];
    const quote  = window._latestQuotes?.[sym];

    // Skip pairs whose data hasn't been loaded yet
    if (!asia || !monday || !quote || !S.ohlcData?.[sym]) {
      skippedPairs.push(sym);
      continue;
    }

    // Temporarily point S.currentPair at this pair so pair-specific
    // functions (calculateVolRegime, calculatePivots, etc.) operate on it
    S.currentPair = pairObj;
    try {
      const tierData  = calculateTierScores();
      const volRegime = calculateVolRegime();
      const pivots    = calculatePivots();
      const macroBias = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';

      const allConfluences = [
        ...(asia.confluences   || []).map(c => ({...c, source: 'asia'})),
        ...(monday.confluences || []).map(c => ({...c, source: 'monday'})),
      ];
      // Always save all levels — strength filter is display-only in the journal
      const enhanced = enhanceConfluences(allConfluences, quote.price, macroBias, pivots, volRegime, tierData.totalScore);
      enhanced.sort((a, b) => b.stars !== a.stars ? b.stars - a.stars : a.distance - b.distance);

      const signal  = runSignalEngine(S.compassData, volRegime);
      const entries = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime);

      const seenPrices = new Set();
      const levels = [];

      enhanced.forEach(c => {
        const key = c.price.toFixed(getDigits(sym));
        if (seenPrices.has(key)) return;
        seenPrices.add(key);
        const tags = [];
        if (c.source === 'asia')   tags.push({ label: 'Asia Fib',   cls: 'fib' });
        if (c.source === 'monday') tags.push({ label: 'Monday Fib', cls: 'fib' });
        if (c.isTight)             tags.push({ label: 'Tight',      cls: 'fib' });
        if (c.aligned)             tags.push({ label: `Aligned ${macroBias}`, cls: 'signal' });
        if (c.pivotMatch)          tags.push({ label: `Pivot ${c.pivotMatch}`, cls: 'pivot' });
        levels.push({
          price: c.price, direction: c.direction, stars: c.stars,
          isTight: c.isTight || false, isRoundNumber: c.isRoundNumber || false,
          todayFib: c.todayFib ?? null, sl: c.sl || null, tp: c.tp || null,
          aligned: c.aligned || false, pivotMatch: c.pivotMatch || null,
          distance: c.distance, tags, source: 'fib',
          watchlist: (c.totalStars ?? 0) >= 4,
        });
      });

      (entries || []).forEach(e => {
        const key = e.price.toFixed(getDigits(sym));
        if (seenPrices.has(key)) return;
        seenPrices.add(key);
        levels.push({
          price: e.price, direction: e.direction, stars: e.totalStars || e.stars || 1,
          isTight: e.isTight || false, isRoundNumber: e.isRoundNumber || false,
          todayFib: e.todayFib ?? null, sl: e.sl || null, tp: e.tp || null,
          aligned: e.aligned || false, distance: e.distance,
          tags: (e.tags || []).map(t => ({ label: t.label, cls: t.cls || 'range' })),
          source: 'scanner', watchlist: (e.totalStars ?? 0) >= 4,
        });
      });

      if (levels.length === 0) { skippedPairs.push(sym + ' (no levels)'); continue; }

      const macro = {
        bias: macroBias, score: tierData.totalScore, maxScore: tierData.maxScore,
        volRegime: volRegime.regime, atrPips: volRegime.atrPips,
        garchPips: volRegime.garch ? volRegime.garch.pips : null,
      };

      // Merge preserving existing trade/outcome/notes
      const existing    = jData[date][sym] || { levels: [], macro: {} };
      const existingMap = {};
      (existing.levels || []).forEach(l => { existingMap[l.price + '_' + l.direction] = l; });
      const merged = levels.map(l => {
        const ex = existingMap[l.price + '_' + l.direction];
        return ex ? { ...l, trade: ex.trade, outcome: ex.outcome, notes: ex.notes,
          slOverride: ex.slOverride, tpOverride: ex.tpOverride,
          watchlist: l.watchlist || ex.watchlist } : l;
      });

      jData[date][sym] = { levels: merged, macro, savedAt: new Date().toISOString() };
      savedPairs.push(`${sym} (${merged.length})`);
    } catch(e) {
      skippedPairs.push(sym + ' (err: ' + e.message + ')');
    }
  }

  // Restore original pair context
  S.currentPair = originalPair;

  if (savedPairs.length === 0) {
    if (btn) { btn.disabled = false; btn.querySelector('span:last-child').textContent = 'All Pairs'; }
    alert('No pairs saved — switch to each pair tab first so their data loads, then try again.\nSkipped: ' + skippedPairs.join(', '));
    return;
  }

  const localOk = tryJournalLocalSave(JKEY, jData);
  if (!localOk) console.warn('Journal All: localStorage full — data saved to KV only');
  // Always sync to KV regardless of local storage success
  kvSet(JKEY, jData).catch(() => {});
  localStorage.removeItem('journal_pending');

  console.log('Journal All: saved', savedPairs, '| skipped', skippedPairs);

  if (btn) {
    const span = btn.querySelector('span:last-child');
    btn.style.background  = 'var(--green-bg)';
    btn.style.color       = 'var(--green)';
    btn.style.borderColor = 'var(--green-bd)';
    span.textContent = `Saved ${savedPairs.length}`;
    setTimeout(() => {
      btn.disabled = false;
      btn.style.background  = '';
      btn.style.color       = 'var(--purple)';
      btn.style.borderColor = 'var(--purple-bd)';
      span.textContent = 'All Pairs';
    }, 3000);
  }

  const skipMsg = skippedPairs.length
    ? `\n\nSkipped (not loaded): ${skippedPairs.join(', ')}\nVisit those pair tabs to load their data.`
    : '';
  alert(`Saved ${savedPairs.length} pair${savedPairs.length > 1 ? 's' : ''} to journal:\n${savedPairs.join('\n')}${skipMsg}`);
};

// ── Lightweight data loader for Analyse All ───────────────────────────────────
// Loads only what aiCollectSnapshot() needs for a given symbol without touching
// the active pair's DOM or triggering a full renderAll.
export async function loadPairDataForAnalysis(sym) {
  const symKey = sym.replace('/', '');
  const sessionDay = londonSessionDay();

  if (!S.ohlcData[sym]) {
    try {
      S.ohlcData[sym] = await loadCached(`ohlc_${symKey}`,
        () => fetchAPI(`/api/ohlc?symbol=${encodeURIComponent(sym)}`),
        CACHE_DURATION.OHLC);
    } catch(e) {}
  }
  if (!S.ohlc5m[sym]) {
    try {
      S.ohlc5m[sym] = await loadCached(`ohlc5m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(sym)}`),
        CACHE_DURATION.OHLC5M);
    } catch(e) {}
  }
  if (!S.ohlc30m[sym]) {
    try {
      S.ohlc30m[sym] = await loadCached(`ohlc30m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc30m?symbol=${encodeURIComponent(sym)}`),
        CACHE_DURATION.OHLC30M);
    } catch(e) {}
  }
  // Compute ranges so snapshot has Asia/Monday data
  calculateAsiaRanges(sym);
  calculateMondayRanges(sym);
  // Store quote for this pair if we have one cached
  try {
    const q = await loadCached(`quote_${symKey}`,
      () => fetchAPI(`/api/quote?symbol=${encodeURIComponent(sym)}`),
      CACHE_DURATION.QUOTE);
    if (q?.price) window._latestQuotes[sym] = { price: q.price, bid: q.bid, ask: q.ask };
  } catch(e) {}
}
window.loadPairDataForAnalysis = loadPairDataForAnalysis;

// ── Alert button state ────────────────────────────────────────────────────────
export function updateAlertBtn() {
  const btn = document.getElementById('alertBtn');
  if (!btn) return;
  const cfg = loadAlertCfg();
  if (cfg.enabled) {
    btn.style.borderColor = 'var(--green-bd)';
    btn.style.color       = 'var(--green)';
    btn.title             = `Telegram alerts ON · min ${cfg.minStars}★`;
  } else {
    btn.style.borderColor = '';
    btn.style.color       = '';
    btn.title             = 'Telegram alerts (OFF)';
  }
}
window.updateAlertBtn = updateAlertBtn;

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  renderPairTabs();
  await loadAll();
  startLiveStream();           // Fix 23: live SSE stream; falls back silently if Oanda unavailable
  updateAlertBtn();
  setInterval(() => refreshQuote(), 5 * 60 * 1000);       // polling fallback / 5m candle refresh
  setInterval(() => loadSpreadData().catch(() => {}), 60 * 1000);         // live spread, every 60s
  setInterval(() => loadSentimentData().catch(() => {}), 30 * 60 * 1000); // sentiment, every 30m

  // Live 5m HMM regime — load on boot, then poll every 5 min to stay in sync with server
  loadHMM5m().catch(() => {});
  setInterval(() => loadHMM5m().catch(() => {}), 5 * 60 * 1000);

  // Toggle .pinned shadow on sticky header when page scrolls past natural position
  const sentinel = document.getElementById('stickysentinel');
  const header   = document.querySelector('.sticky-header');
  if (sentinel && header) {
    new IntersectionObserver(([e]) => header.classList.toggle('pinned', !e.isIntersecting)).observe(sentinel);
  }
}

init();
