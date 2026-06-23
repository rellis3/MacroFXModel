// Actionable Levels page — composite signal combining the 8-tier macro/regime
// engine (js/macro.js, js/vol.js) with the volatility-forecast price levels
// engine (js/volForecast.js, served via /api/vol-forecast[/live]).
//
// Standalone module: cannot import js/main.js (it calls init() at module
// scope, which requires index.html's DOM). Instead this file replicates the
// minimal per-pair loader pattern used by loadPairDataForAnalysis() /
// saveAllPairsToJournal() in main.js.
import { S } from './state.js';
import { PAIRS, CACHE_DURATION } from './config.js';
import { fetchAPI, loadCached, londonSessionDay, getDigits, cleanupStaleSessionCaches } from './utils.js';
import { calculateTierScores, computeBayesianScore, computeUSDStrength, computeDollarRegime } from './macro.js';
import { calculateVolRegime, calcPositionSize } from './vol.js';

// ── Pair symbol -> vol-forecast instrument key ───────────────────────────────
const INSTRUMENT_KEY_OVERRIDES = { 'XAU/USD': 'GOLD', 'NAS100_USD': 'NQ' };
function toInstrumentKey(pair) {
  return INSTRUMENT_KEY_OVERRIDES[pair.symbol] ?? pair.symbol.replace('/', '').replace(/_USD$|_GBP$/, '');
}

// ── Breakout extension probability (ported from vol-forecast.html) ──────────
// P ≈ 2 * (1 - Φ(remaining / √(1-timeFrac))) — BM-theory estimate of exceeding
// the median H-L forecast given how much range is used and how much day is left.
function breakoutProb(consumedFrac, timeFrac) {
  const remaining = Math.max(0, 1 - consumedFrac);
  const timeLeft  = Math.max(0.01, 1 - Math.min(0.99, timeFrac));
  const z = remaining / Math.sqrt(timeLeft);
  const phi = x => {
    if (x < 0) return 1 - phi(-x);
    const t = 1 / (1 + 0.2316419 * x);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  };
  return Math.max(0, Math.min(100, Math.round(2 * (1 - phi(z)) * 100)));
}

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(type, text) {
  const dot = document.getElementById('alSdot');
  const txt = document.getElementById('alStxt');
  if (dot) dot.className = `sdot ${type}`;
  if (txt) txt.textContent = text;
}

// ── Per-pair lightweight loader (mirrors loadPairDataForAnalysis in main.js) ──
async function loadPairData(sym) {
  const symKey = sym.replace('/', '');
  const sessionDay = londonSessionDay();
  if (!S.ohlcData[sym]) {
    try {
      S.ohlcData[sym] = await loadCached(`ohlc_${symKey}`,
        () => fetchAPI(`/api/ohlc?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC);
    } catch (e) {}
  }
  if (!S.ohlc5m[sym]) {
    try {
      S.ohlc5m[sym] = await loadCached(`ohlc5m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC5M);
    } catch (e) {}
  }
  if (!S.ohlc30m[sym]) {
    try {
      S.ohlc30m[sym] = await loadCached(`ohlc30m_${symKey}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc30m?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC30M);
    } catch (e) {}
  }
  try {
    return await loadCached(`quote_${symKey}`,
      () => fetchAPI(`/api/quote?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.QUOTE);
  } catch (e) {
    return null;
  }
}

// ── Conviction label (thresholds mirror js/market-narrative.js convictionBadge) ──
function convictionLabel(absScore) {
  if (absScore >= 9) return 'HIGH CONVICTION';
  if (absScore >= 5) return 'MED CONVICTION';
  if (absScore >= 2) return 'LOW CONVICTION';
  return 'NO CLEAR EDGE';
}

// ── Build the composite per-pair model: macro bias + vol-forecast levels + verdict ──
function buildCardModel(pair, quote, tierData, volRegime, bayes, posSize, f, s) {
  const sym = pair.symbol;
  const totalScore = tierData.totalScore;
  const bias = totalScore > 4 ? 'LONG' : totalScore < -4 ? 'SHORT' : 'NEUTRAL';
  const dir  = bias === 'LONG' ? 1 : bias === 'SHORT' ? -1 : 0;
  const conviction = convictionLabel(Math.abs(totalScore));

  const dp    = getDigits(sym);
  const open  = s?.anchor_open ?? null;
  const price = quote?.price ?? null;

  let ohMedP = null, oh75P = null, olMedP = null, ol75P = null, curClose = null;
  let remOhMed = null, remOh75 = null, remOlMed = null, remOl75 = null;

  if (f && open != null) {
    ohMedP = open + open * f.oc_median / 100;
    oh75P  = open + open * f.oc_75    / 100;
    olMedP = open - open * f.oc_median / 100;
    ol75P  = open - open * f.oc_75    / 100;
    curClose = s ? open + (open * s.oc / 100) : price;
    if (curClose != null) {
      remOhMed = Math.max(0, (ohMedP - curClose) / ohMedP);
      remOh75  = Math.max(0, (oh75P  - curClose) / oh75P);
      remOlMed = Math.max(0, (curClose - olMedP) / olMedP);
      remOl75  = Math.max(0, (curClose - ol75P)  / ol75P);
    }
  }

  let hlConsumedPct = 0, breakoutPct = null;
  if (s?.hl != null && f?.hl_median) {
    hlConsumedPct = s.hl / f.hl_median;
    if (!s.complete && s.bar_time) {
      const now = new Date(s.bar_time);
      const dayFrac = Math.min(0.99, (now.getUTCHours() * 60 + now.getUTCMinutes()) / (24 * 60));
      breakoutPct = breakoutProb(hlConsumedPct, dayFrac);
    }
  }

  const targetHitForDir = dir > 0 ? !!s?.oh_reached_at : dir < 0 ? !!s?.ol_reached_at : false;
  const rangeExhausted  = hlConsumedPct >= 0.85;

  let verdict, rationale;
  const usedPctTxt = `${Math.round(hlConsumedPct * 100)}%`;
  if (dir === 0) {
    if (hlConsumedPct < 0.3) {
      verdict = 'WAIT';
      rationale = `Macro tiers split (${tierData.agreeCount}/8 agree) — no directional edge yet. Only ${usedPctTxt} of today's range used, plenty of room either way.`;
    } else {
      verdict = 'WATCH';
      rationale = `No macro edge (${tierData.agreeCount}/8 agree) but ${usedPctTxt} of today's range is already used — watch for a breakout before sizing in.`;
    }
  } else if (rangeExhausted || targetHitForDir) {
    verdict = 'AVOID';
    rationale = targetHitForDir
      ? `${bias} bias (${conviction.toLowerCase()}) but the ${dir > 0 ? 'upside' : 'downside'} median target has already been tagged today — chasing risk, avoid new entries here.`
      : `${bias} bias (${conviction.toLowerCase()}) but ${usedPctTxt} of the daily range is already used — avoid chasing, wait for tomorrow's reset.`;
  } else if (breakoutPct != null && breakoutPct < 15 && hlConsumedPct > 0.6) {
    verdict = 'WATCH';
    rationale = `${bias} bias (${conviction.toLowerCase()}) but momentum is stalling — ${usedPctTxt} of range used with only ${breakoutPct}% odds of extending past median. Watch for a pullback entry.`;
  } else {
    verdict = 'ACT';
    rationale = `${bias} bias (${conviction.toLowerCase()}, ${tierData.agreeCount}/8 agree) with room left toward the ${dir > 0 ? 'upside' : 'downside'} median target — ${Math.round((1 - hlConsumedPct) * 100)}% of today's range remaining.`;
  }

  return {
    pair, sym, price, nowPrice: price ?? curClose ?? open, dp,
    tierData, volRegime, bayes, posSize, f, s, open,
    ohMedP, oh75P, olMedP, ol75P, curClose,
    remOhMed, remOh75, remOlMed, remOl75,
    hlConsumedPct, breakoutPct, bias, dir, conviction, verdict, rationale,
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────────
let _allResults = [];
let _filter = 'all';

function lvRow(label, val, hit, isCurrent) {
  return `<div class="al-lv-row${hit ? ' hit' : ''}${isCurrent ? ' current' : ''}">
    <span class="al-lv-label">${label}</span><span class="al-lv-price">${val}</span>
  </div>`;
}

function buildCardHtml(m) {
  const { pair, sym, nowPrice, dp, tierData, volRegime, bayes, posSize, f, s, open,
          ohMedP, oh75P, olMedP, ol75P, curClose, hlConsumedPct, breakoutPct,
          bias, conviction, verdict, rationale } = m;

  const priceTxt = nowPrice != null ? nowPrice.toFixed(dp) : '—';
  const fmtP = v => v != null ? v.toFixed(dp) : '—';

  let levelsHtml = '<div class="al-empty-note">No vol-forecast data for this instrument yet.</div>';
  if (f && open != null) {
    levelsHtml = `
      <div class="al-levels">
        ${lvRow('↑ 75th', fmtP(oh75P), !!s?.oh_75_reached_at)}
        ${lvRow('↑ Med',  fmtP(ohMedP), !!s?.oh_reached_at)}
        ${lvRow('Now / Open', `${fmtP(curClose ?? nowPrice)} / ${fmtP(open)}`, false, true)}
        ${lvRow('↓ Med',  fmtP(olMedP), !!s?.ol_reached_at)}
        ${lvRow('↓ 75th', fmtP(ol75P), !!s?.ol_75_reached_at)}
      </div>
      <div class="al-bar-track" title="${Math.round(hlConsumedPct * 100)}% of median H-L range used today">
        <div class="al-bar-fill${hlConsumedPct > 0.8 ? ' hi' : ''}" style="width:${Math.min(100, Math.round(hlConsumedPct * 100))}%"></div>
      </div>
      <div class="al-meta">${Math.round(hlConsumedPct * 100)}% of range used${breakoutPct != null ? ` · ${breakoutPct}% odds of extending past median` : ''}</div>
    `;
  }

  return `
    <div class="al-card verdict-${verdict}">
      <div class="al-card-header">
        <div><span class="al-pair-name">${pair.name}</span><span class="al-price">${priceTxt}</span></div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="al-vol-pill ${volRegime.regime}">${volRegime.regime}</span>
          <span class="al-verdict-badge ${verdict}">${verdict}</span>
        </div>
      </div>
      <div class="al-macro-row">
        <span class="al-chip ${bias}">${bias}</span>
        <span class="al-chip">${conviction}</span>
        <span class="al-meta">${tierData.agreeCount}/8 agree</span>
        <span class="al-meta">Bayes ${bayes.pct}%</span>
        <span class="al-meta">Size ${posSize}%</span>
      </div>
      <div>
        <div class="al-section-label">Today's Levels</div>
        ${levelsHtml}
      </div>
      <div class="al-rationale ${verdict}">${rationale}</div>
    </div>
  `;
}

function renderGrid() {
  const order = { ACT: 0, WATCH: 1, WAIT: 2, AVOID: 3 };
  const filtered = _filter === 'all' ? _allResults : _allResults.filter(r => r.verdict === _filter);
  const sorted = [...filtered].sort((a, b) =>
    (order[a.verdict] - order[b.verdict]) || (Math.abs(b.tierData.totalScore) - Math.abs(a.tierData.totalScore))
  );
  const grid = document.getElementById('alGrid');
  grid.innerHTML = sorted.length
    ? sorted.map(buildCardHtml).join('')
    : '<div class="al-empty-note" style="padding:20px">No pairs match this filter.</div>';
}

function render(results, meta) {
  _allResults = results;
  const counts = { ACT: 0, WATCH: 0, WAIT: 0, AVOID: 0 };
  results.forEach(r => counts[r.verdict]++);
  document.getElementById('cnt-all').textContent   = results.length;
  document.getElementById('cnt-ACT').textContent   = counts.ACT;
  document.getElementById('cnt-WATCH').textContent = counts.WATCH;
  document.getElementById('cnt-WAIT').textContent  = counts.WAIT;
  document.getElementById('cnt-AVOID').textContent = counts.AVOID;
  document.getElementById('alSummary').style.display = 'flex';
  if (meta?.computed_at) {
    document.getElementById('alUpdated').textContent = new Date(meta.computed_at).toLocaleString();
  }
  renderGrid();
}

window._alFilter = function (f) {
  _filter = f;
  document.querySelectorAll('.al-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  renderGrid();
};

window._alRefresh = function () {
  location.reload();
};

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    cleanupStaleSessionCaches();
    setStatus('spin', 'Loading macro data…');

    const [fredData, ecbData, forecastRes, sessionRes] = await Promise.all([
      loadCached('fred2', () => fetchAPI('/api/fred'), CACHE_DURATION.FRED,
        d => ['vix', 'us10y', 'hy', 'nfci'].every(k => d?.[k]?.value != null)).catch(() => null),
      fetch('/api/ecbsdw').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/vol-forecast').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/vol-forecast/live').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    S.fredData = fredData;
    S.ecbData  = ecbData;
    const forecastInstruments = forecastRes?.instruments ?? {};
    const sessionInstruments  = sessionRes?.instruments ?? {};
    S.garchForecast = forecastInstruments;

    setStatus('spin', 'Loading USD index pairs…');
    const USD_INDEX_PAIRS = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY'];
    for (const sym of USD_INDEX_PAIRS) { await loadPairData(sym); }
    S.usdStrength  = computeUSDStrength();
    S.dollarRegime = computeDollarRegime();

    const results = [];
    for (let i = 0; i < PAIRS.length; i++) {
      const pair = PAIRS[i];
      setStatus('spin', `Loading ${pair.name} (${i + 1}/${PAIRS.length})…`);
      const quote = await loadPairData(pair.symbol);

      S.currentPair = pair;
      let tierData, volRegime, bayes, posSize;
      try {
        tierData  = calculateTierScores();
        volRegime = calculateVolRegime();
        bayes     = computeBayesianScore(tierData.tiers);
        posSize   = calcPositionSize(tierData.totalScore, volRegime, null, null);
      } catch (e) {
        console.warn('[levels] tier calc failed for', pair.symbol, e);
        tierData  = { totalScore: 0, tiers: [], agreeCount: 0, maxScore: 18 };
        volRegime = { regime: 'NORMAL', sizeMult: 1, usedPct: 0 };
        bayes     = { pct: 50, dir: 'neutral' };
        posSize   = 10;
      }

      const instKey = toInstrumentKey(pair);
      const f = forecastInstruments[instKey] ?? null;
      const s = sessionInstruments[instKey] ?? null;
      results.push(buildCardModel(pair, quote, tierData, volRegime, bayes, posSize, f, s));
    }

    S.currentPair = PAIRS[0];
    render(results, forecastRes?.meta);

    const withLevels = results.filter(r => r.f).length;
    setStatus('ok', `${results.length} pairs loaded · ${withLevels} with live levels`);
  } catch (error) {
    console.error('[levels] boot error', error);
    setStatus('err', `Error: ${error.message}`);
  }
}

boot();
