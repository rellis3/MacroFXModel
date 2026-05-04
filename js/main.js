import { S } from './state.js';
import { PAIRS, CACHE_DURATION } from './config.js';
import { kvSet, loadCached, cleanupStaleSessionCaches, fetchAPI, updateStatus, updatePill, londonSessionDay, getDigits } from './utils.js';
import { calculateAsiaRanges, calculateMondayRanges } from './ranges.js';
import { filterConfluences, enhanceConfluences } from './confluences.js';
import { calculateTierScores } from './macro.js';
import { calculateVolRegime, calculatePivots } from './vol.js';
import { loadCaps, openCfgModal, closeCfgModal, saveCaps, resetCaps } from './caps.js';
import { oiLoadStoreFromKV, openOIModal, closeOIModal, processOIData, removeOIInstrument } from './oi.js';
import { setCompassMode, loadAndRenderCompass } from './compass.js';
import { fvGapToPips, runSignalEngine, runEntryScanner, renderSignalAndEntries } from './signal.js';
import { renderARMAAndTransition } from './arma.js';
import { renderAll } from './render.js';
import { triggerAIAnalysis } from './ai.js';
import { loadCOT, openCOTModal, closeCOTModal, saveCOTUrlFromModal } from './cot.js';
import { detectSession } from './session.js';
import { loadEventData } from './events.js';
import { computeDollarRegime, computeUSDStrength } from './macro.js';

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
window.triggerAIAnalysis      = triggerAIAnalysis;
window.openCOTModal           = openCOTModal;
window.closeCOTModal          = closeCOTModal;
window.saveCOTUrlFromModal    = saveCOTUrlFromModal;

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
  await loadAll();
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

  S.fredData      = null;
  S.ohlcData      = {};
  S.ohlc5m        = {};
  S.ohlc30m       = {};
  S.asiaRangeData = {};
  S.mondayRangeData = {};
  S.usdStrength   = null;
  S.dollarRegime  = null;
  S.eventRisk     = null;
  S.surpriseIndex = null;

  updateStatus('spin', `Refreshing ${S.currentPair.name}...`);
  loadAll();
};

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

    // Update session badge immediately (no network needed)
    S.sessionData = detectSession();

    let hasFinnhub = false;
    try {
      const cfg = await fetch('/api/config').then(r => r.json());
      if (cfg.hasAnt)     updatePill('pillAnt', 'ant');
      if (cfg.hasKV)      updatePill('pillKV',  'ok');
      if (cfg.hasFinnhub) hasFinnhub = true;
    } catch(e) {}

    // Load events in background — non-blocking, updates S.eventRisk + S.surpriseIndex
    loadEventData(hasFinnhub).catch(() => {});

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
        () => fetchAPI(`/api/ohlc5m?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
        CACHE_DURATION.OHLC5M);
      updatePill('pill5m', 'ok');
    }

    if (!S.ohlc30m[S.currentPair.symbol]) {
      const sessionDay = londonSessionDay();
      S.ohlc30m[S.currentPair.symbol] = await loadCached(`ohlc30m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/ohlc30m?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
        CACHE_DURATION.OHLC30M);
      updatePill('pill30m', 'ok');
    }

    const quote = await loadCached(`quote_${symKey}`,
      () => fetchAPI(`/api/quote?symbol=${encodeURIComponent(S.currentPair.symbol)}`),
      CACHE_DURATION.QUOTE);
    updatePill('pillQuote', 'ok');

    calculateAsiaRanges(S.currentPair.symbol);
    calculateMondayRanges(S.currentPair.symbol);
    window._latestQuote = quote;

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
    window._latestQuote = quote;

    try {
      const bars = S.ohlc5m[S.currentPair.symbol]?.values;
      const latestOpenMs = bars && bars.length
        ? new Date(bars[0].datetime.replace(' ', 'T') + 'Z').getTime()
        : 0;
      if (Date.now() - latestOpenMs > 10 * 60 * 1000) {
        const fresh = await fetchAPI(`/api/ohlc5m?symbol=${encodeURIComponent(S.currentPair.symbol)}`);
        if (fresh && fresh.values && fresh.values.length) {
          S.ohlc5m[S.currentPair.symbol] = fresh;
          calculateAsiaRanges(S.currentPair.symbol);
        }
      }
    } catch (e) {
      console.warn('5m anchor refresh skipped:', e.message);
    }

    renderAll();
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
        isTight:   c.isTight || false,
        sl:        c.sl  || null,
        tp:        c.tp  || null,
        aligned:   c.aligned || false,
        pivotMatch:c.pivotMatch || null,
        distance:  c.distance,
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
        isTight:   e.isTight || false,
        sl:        e.sl  || null,
        tp:        e.tp  || null,
        aligned:   e.aligned || false,
        distance:  e.distance,
        tags:      (e.tags || []).map(t => ({ label: t.label, cls: t.cls || 'range' })),
        source:    'scanner',
      });
    });

    if (levels.length === 0) {
      alert('No confluence levels detected for ' + sym + '.\nMake sure data has fully loaded (check status pills).');
      return;
    }

    const snapshot = {
      pair: sym,
      date,
      capturedAt: new Date().toISOString(),
      macro: {
        bias:      macroBias,
        score:     tierData.totalScore,
        maxScore:  tierData.maxScore,
        volRegime: volRegime.regime,
        atrPips:   volRegime.atrPips,
        garchPips: volRegime.garch ? volRegime.garch.pips : null,
      },
      levels,
    };

    localStorage.setItem('journal_pending', JSON.stringify(snapshot));

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

    console.log('Journal: snapshot written — ' + levels.length + ' levels for ' + sym + ' on ' + date);
  } catch(e) {
    console.error('saveToJournal error:', e);
    alert('Error saving to journal: ' + e.message);
  }
};

// ── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  renderPairTabs();
  await loadAll();
  setInterval(() => refreshQuote(), 5 * 60 * 1000);
}

init();
