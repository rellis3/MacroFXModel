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
import { oiLoadStoreFromKV, openOIModal, closeOIModal, processOIData, removeOIInstrument } from './oi.js';
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
import { checkAndSendAlerts, openAlertModal, closeAlertModal, saveAlertModal, saveTelegramCreds, sendTestAlert, loadAlertCfg } from './alerts.js';

// ── Debounced renderAll ───────────────────────────────────────────────────────
// Prevents concurrent DOM mutations when async compass resolve + quote refresh
// both fire renderAll in the same tick.
let _renderTimer = null;
const renderAllDebounced = () => {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => { _renderTimer = null; renderAll(); }, 80);
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

// ── Initialise state ─────────────────────────────────────────────────────────
S.currentPair = PAIRS[0];
S.currentMode = 'strongest';

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
  await loadAll();
  startLiveStream();                   // restart SSE for new pair
};

window.setMode = function(mode) {
  S.currentMode = mode;
  document.querySelectorAll('.mtab').forEach(btn => {
    btn.classList.remove('active', 'green', 'amber');
    if (btn.dataset.mode === mode) {
      btn.classList.add('active');
      if (mode === 'strongest') btn.classList.add('green');
      if (mode === 'strong') btn.classList.add('amber');
    }
  });
  const desc = {
    strongest: 'Tight confluences only (highest probability)',
    strong: 'All confluences (tight + normal)',
    all: 'All confluences + key levels (0.25, 0.5, 0.75, 1.0)'
  };
  document.getElementById('modeDesc').textContent = desc[mode];
  if (S.asiaRangeData[S.currentPair.symbol]) renderAll();
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
    <span class="pa-main">${dist <= 0 ? 'AT' : dist + unit + ' from'} <strong>${e.price.toFixed(digits)}</strong> ${e.direction === 'long' ? '↑ BUY' : '↓ SELL'} · ${'⭐'.repeat(e.totalStars || 0)}</span>
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

function _openSseForSym(sym) {
  // Guard: don't open if the pair has changed since this reconnect was scheduled
  if (sym !== S.currentPair?.symbol) return;

  try {
    const src = new EventSource(`/api/oanda_stream?symbol=${encodeURIComponent(sym)}`);
    let receivedTick = false;

    src.onmessage = evt => {
      try {
        const d = JSON.parse(evt.data);
        if (d.price != null) {
          receivedTick = true;
          _sseReconnectDelay = 3000; // reset backoff on successful tick
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
          checkAndSendAlerts();
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
    S.spreadData[sym] = {
      spreadPips:     data.spreadPips,
      classification: classifySpread(data.spreadPips, typical),
      bid:            data.bid,
      ask:            data.ask,
      timestamp:      data.timestamp,
    };
    renderAllDebounced();
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
    loadCOT().catch(() => {});       // non-blocking — renders when ready
    cleanupStaleSessionCaches();

    if (!S.fredData) {
      S.fredData = await loadCached('fred', () => fetchAPI('/api/fred'), CACHE_DURATION.FRED);
      updatePill('pillFred', 'ok');
    }

    // Fix 9: ECB SDW daily rates (ESTR + DE 10Y Bund) — no key required, 12h KV cache
    if (!S.ecbData) {
      try {
        const ecbRes = await fetch('/api/ecbsdw');
        if (ecbRes.ok) S.ecbData = await ecbRes.json();
      } catch(e) { S.ecbData = null; }
    }

    // Update session badge immediately (no network needed)
    S.sessionData = detectSession();

    let hasFinnhub = false;
    try {
      const cfg = await fetch('/api/config').then(r => r.json());
      if (cfg.hasAnt)     updatePill('pillAnt', 'ant');
      if (cfg.hasKV)      updatePill('pillKV',  'ok');
      if (cfg.hasFinnhub) hasFinnhub = true;
      S.hasOanda    = !!cfg.hasOanda;
      S.hasMyfxbook = !!cfg.hasMyfxbook;
    } catch(e) {}

    // Load events in background — non-blocking, updates S.eventRisk + S.surpriseIndex
    loadEventData(hasFinnhub).catch(() => {});

    // Load spread (live, no cache) and sentiment (cached 30m in KV) — non-blocking
    loadSpreadData().catch(() => {});
    loadSentimentData().catch(() => {});

    const symKey = S.currentPair.symbol.replace('/', '');

    if (!S.ohlcData[S.currentPair.symbol]) {
      S.ohlcData[S.currentPair.symbol] = await loadCached(`ohlc_${symKey}`,
        () => fetchAPI(`/api/ohlc?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
        CACHE_DURATION.OHLC);
      updatePill('pillOhlc', 'ok');
    }

    if (!S.ohlc5m[S.currentPair.symbol]) {
      const sessionDay = londonSessionDay();
      S.ohlc5m[S.currentPair.symbol] = await loadCached(`ohlc5m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
        CACHE_DURATION.OHLC5M);
      updatePill('pill5m', 'ok');
    }
    // Merge session open prices and daily opens history into session data
    const _bars5m     = S.ohlc5m[S.currentPair.symbol]?.values || [];
    const _opens      = computeSessionOpens(_bars5m);
    const _dailyOpens = computeDailyOpens(S.ohlcData[S.currentPair.symbol]?.values || [], 30);
    if (S.sessionData) {
      S.sessionData.londonOpenPrice = _opens.londonOpenPrice;
      S.sessionData.nyOpenPrice     = _opens.nyOpenPrice;
      S.sessionData.dailyOpens      = _dailyOpens;
      S.sessionData.dailyOpenPrice  = _dailyOpens[0]?.price ?? null; // most recent, for badge
    }

    if (!S.ohlc30m[S.currentPair.symbol]) {
      const sessionDay = londonSessionDay();
      S.ohlc30m[S.currentPair.symbol] = await loadCached(`ohlc30m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc30m?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
        CACHE_DURATION.OHLC30M);
      updatePill('pill30m', 'ok');
    }

    const quote = await loadCached(`quote_${symKey}`,
      () => fetchAPI(`/api/quote?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
      CACHE_DURATION.QUOTE);
    updatePill('pillQuote', 'ok');

    calculateAsiaRanges(S.currentPair.symbol);
    calculateMondayRanges(S.currentPair.symbol);
    calculateStructuralFibs(S.currentPair.symbol);
    _storeQuote(S.currentPair.symbol, quote);
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

    // Daily watchlist — Phase 1 scores from server; refresh if date changed
    fetch('/api/daily/watchlist')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.watchlist && Object.keys(data.watchlist).length) {
          S.dailyWatchlist = data.watchlist;
          S.watchlistDate  = data.date;
          renderAllDebounced();
        }
      })
      .catch(() => {});

    window._manualWatchlist = () => {
      fetch('/api/daily/watchlist/run', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.ok) return fetch('/api/daily/watchlist').then(r => r.json());
          throw new Error(d.error ?? 'recompute failed');
        })
        .then(data => {
          if (data?.watchlist) {
            S.dailyWatchlist = data.watchlist;
            S.watchlistDate  = data.date;
            renderAllDebounced();
          }
        })
        .catch(e => console.warn('[watchlist] manual recompute failed:', e.message));
    };

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
    const filtered  = filterConfluences(allConfluences);
    const enhanced  = enhanceConfluences(filtered, quote.price, macroBias, pivots, volRegime, tierData.totalScore);
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
        source: 'fib',
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
      return ex ? { ...l, trade: ex.trade, outcome: ex.outcome, notes: ex.notes, slOverride: ex.slOverride, tpOverride: ex.tpOverride } : l;
    });
    jData[date][sym] = { levels: merged, macro, savedAt: new Date().toISOString() };
    try { localStorage.setItem(JKEY, JSON.stringify(jData)); } catch(storageErr) {
      alert('Storage error — journal not saved: ' + storageErr.message); return;
    }
    // Best-effort KV sync so journal is available across devices
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

  // Toggle .pinned shadow on sticky header when page scrolls past natural position
  const sentinel = document.getElementById('stickysentinel');
  const header   = document.querySelector('.sticky-header');
  if (sentinel && header) {
    new IntersectionObserver(([e]) => header.classList.toggle('pinned', !e.isIntersecting)).observe(sentinel);
  }
}

init();
