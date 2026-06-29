// Entry Lens — a second homepage that re-cuts every dashboard engine through a
// single lens: "where would I actually enter a trade." Combines:
//  - the 8-tier macro/regime engine + vol-forecast price levels (js/macro.js,
//    js/vol.js, js/volForecast.js via /api/vol-forecast)
//  - the Asia/Monday range + daily-fib confluence engine (js/ranges.js,
//    js/confluences.js), with today's vol-forecast OC/HL levels folded in as a
//    mergeable source so a volatility target and a range/fib level compress
//    into one zone when they sit close together
//  - both z-score sources: the yield-spread compass (js/compass.js) and the
//    pairwise hedge-correlation divergence monitor (index.html's Hedge Monitor)
//
// Standalone module: cannot import js/main.js (it calls init() at module
// scope, which requires index.html's DOM). Instead this file replicates the
// minimal per-pair loader pattern used by loadPairDataForAnalysis() /
// saveAllPairsToJournal() in main.js, plus the per-pair confluence pipeline
// from js/render.js's renderAllInner().
import { S } from './state.js';
import { PAIRS, CACHE_DURATION, COMPASS_CONFIG } from './config.js';
import { fetchAPI, loadCached, londonSessionDay, getDigits, getPipSize, cleanupStaleSessionCaches, filterTradingDays, toMyfxbSym } from './utils.js';
import { calculateTierScores, computeBayesianScore, computeUSDStrength, computeDollarRegime } from './macro.js';
import { calculateVolRegime, calcPositionSize, calculatePivots } from './vol.js';
import { calculateAsiaRanges, calculateMondayRanges } from './ranges.js';
import { detectCrossSessionClusters, mergeCrossSources, filterConfluences, enhanceConfluences } from './confluences.js';
import { loadCaps } from './caps.js';
import { loadCompassData, compassFairValue, compassDivergence, compassRocForecast, zScore, compositeSpreadZSeries } from './compass.js';
import { oiLoadStore, oiLoadStoreFromKV } from './oi.js';
import { loadCOT, getCOTForPair, renderCOTCard } from './cot.js';
import { saveZoneSnapshot, renderAuditPage, destroyAuditCharts, renderPairAuditHistory, initPairAuditHistory } from './zone-audit.js';

// ── Pair symbol -> vol-forecast instrument key ───────────────────────────────
const INSTRUMENT_KEY_OVERRIDES = { 'XAU/USD': 'GOLD', 'NAS100_USD': 'NQ' };
function toInstrumentKey(pair) {
  return INSTRUMENT_KEY_OVERRIDES[pair.symbol] ?? pair.symbol.replace('/', '').replace(/_USD$|_GBP$/, '');
}

// Hash-routable key for a pair (e.g. 'EUR/USD' -> 'EUR_USD').
function symKey(sym) { return sym.replace('/', '_'); }

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
  const symKeyStr = sym.replace('/', '');
  const sessionDay = londonSessionDay();
  if (!S.ohlcData[sym]) {
    try {
      S.ohlcData[sym] = await loadCached(`ohlc_${symKeyStr}`,
        () => fetchAPI(`/api/ohlc?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC);
    } catch (e) {}
  }
  if (!S.ohlc5m[sym]) {
    try {
      S.ohlc5m[sym] = await loadCached(`ohlc5m_${symKeyStr}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc5m?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC5M);
    } catch (e) {}
  }
  if (!S.ohlc30m[sym]) {
    try {
      S.ohlc30m[sym] = await loadCached(`ohlc30m_${symKeyStr}_${sessionDay}`,
        () => fetchAPI(`/api/oanda_ohlc30m?symbol=${encodeURIComponent(sym)}`), CACHE_DURATION.OHLC30M);
    } catch (e) {}
  }
  try {
    return await loadCached(`quote_${symKeyStr}`,
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

// ── Previous-day / previous-week extremes (ported from js/render.js) ────────
// Operate on S.currentPair.symbol — caller must set S.currentPair first.
function getYesterdayLevels() {
  const bars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  if (!bars || bars.length < 2) return { high: null, low: null };
  return {
    high: parseFloat(bars[1].high),
    low:  parseFloat(bars[1].low),
    open: parseFloat(bars[1].open),
  };
}

function getPrevWeekLevels() {
  const bars = S.ohlc30m[S.currentPair.symbol]?.values;
  if (!bars?.length) return { high: null, low: null };

  function weekKey(bar) {
    const d = new Date(bar.datetime.replace(' ', 'T') + 'Z');
    const day = d.getUTCDay() || 7;
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (day - 1));
    return mon.toISOString().split('T')[0];
  }

  const weeks = {};
  bars.forEach(bar => {
    const wk = weekKey(bar);
    if (!weeks[wk]) weeks[wk] = { high: -Infinity, low: Infinity };
    const h = parseFloat(bar.high), l = parseFloat(bar.low);
    if (h > weeks[wk].high) weeks[wk].high = h;
    if (l < weeks[wk].low)  weeks[wk].low  = l;
  });

  const sorted = Object.keys(weeks).sort().reverse();
  if (sorted.length < 2) return { high: null, low: null };
  const prevWeek = weeks[sorted[1]];
  return { high: prevWeek.high, low: prevWeek.low, weekDate: sorted[1] };
}

// ── Range/vol-forecast confluence zones (ported pipeline from js/render.js) ──
// Requires S.currentPair to already be set to `pair`.
function buildZones(pair, quote, tierData, volRegime, macroBias, f, s) {
  if (!quote?.price) return [];
  const symbol = pair.symbol;

  let pivots;
  try { pivots = calculatePivots(); } catch (e) { pivots = {}; }

  const asia   = S.asiaRangeData[symbol]   || { confluences: [] };
  const monday = S.mondayRangeData[symbol] || { confluences: [] };
  const _asiaConfs   = (asia.confluences   || []).map(c => ({ ...c, source: 'asia' }));
  const _mondayConfs = (monday.confluences || []).map(c => ({ ...c, source: 'monday' }));
  detectCrossSessionClusters(_asiaConfs, _mondayConfs, symbol);

  // Fold today's vol-forecast OC levels in as a mergeable source so a
  // volatility-forecast target that lands near a range/fib zone compresses
  // into a single zone instead of showing as two unrelated levels.
  const volConfs = [];
  if (f && s?.anchor_open != null) {
    const open = s.anchor_open;
    const push = (price, label) => {
      if (price != null && isFinite(price)) volConfs.push({ price, source: 'volforecast', isTight: false, density: 1, vfLabel: label });
    };
    push(open + open * f.oc_median / 100, 'Vol Med ↑');
    push(open + open * f.oc_75    / 100, 'Vol 75th ↑');
    push(open - open * f.oc_median / 100, 'Vol Med ↓');
    push(open - open * f.oc_75    / 100, 'Vol 75th ↓');
  }

  // OI option levels injected as zone sources — call wall, put wall, max pain,
  // and gamma flip appear in the zone table with full trade plan when OI data
  // has been pasted. density:2 bypasses filterConfluences' minimum-density gate;
  // gamma flip gets isTight:true instead (tight = definitionally significant).
  const oiConfs = [];
  const pairOIData = getPairOI(symbol);
  if (pairOIData) {
    const addOI = (price) => { if (price > 0 && isFinite(price)) oiConfs.push({ price, source: 'oi', isTight: false, density: 2 }); };
    if (pairOIData.callWall) addOI(pairOIData.callWall);
    if (pairOIData.putWall)  addOI(pairOIData.putWall);
    if (pairOIData.maxPain)  addOI(pairOIData.maxPain);
    const gexFlipPrice = findGexFlip(pairOIData.gexProfile);
    if (gexFlipPrice) oiConfs.push({ price: gexFlipPrice, source: 'oi', isTight: true, density: 1 });
  }

  const merged   = mergeCrossSources([..._asiaConfs, ..._mondayConfs, ...volConfs, ...oiConfs], symbol);
  const filtered = filterConfluences(merged);
  if (!filtered.length) return [];

  const yesterdayLvls = getYesterdayLevels();
  const prevWeekLvls  = getPrevWeekLevels();
  const keyLevels = {
    pdhHigh: yesterdayLvls.high ?? null,
    pdhLow:  yesterdayLvls.low  ?? null,
    pwhHigh: prevWeekLvls.high  ?? null,
    pwhLow:  prevWeekLvls.low   ?? null,
  };

  let enhanced;
  try {
    enhanced = enhanceConfluences(filtered, quote.price, macroBias, pivots, volRegime, tierData.totalScore, keyLevels);
  } catch (e) {
    console.warn('[levels] enhanceConfluences failed for', symbol, e);
    return [];
  }
  // Sort: nearest first, tiebreak by stars — so the cap removes the most distant levels,
  // not the lowest-rated ones. Stars are still visible on each card.
  enhanced.sort((a, b) => a.distance - b.distance || b.stars - a.stars);

  const _caps = S._caps;
  const zoneWindowPips = (volRegime.atrPips || 50) * (_caps?.zoneWindowAtrMult ?? 4);
  const maxZones = _caps?.maxZones ?? 14;
  return enhanced.filter(z => z.distance <= zoneWindowPips).slice(0, maxZones);
}

// ── Hedge correlation z-score monitor (ported from index.html's Hedge Monitor) ──
let _hedgeAlerts = null;
async function loadHedgeAlerts() {
  try {
    const res = await fetch('/api/hedge-alerts');
    _hedgeAlerts = res.ok ? await res.json() : null;
  } catch (e) {
    _hedgeAlerts = null;
  }
}

function hedgeSignalLabel(z) {
  if (z >  2.0) return '⚡ Diverged';
  if (z >  1.2) return '↗ Weakening';
  if (z < -2.0) return '↙ Very tight';
  if (z < -1.2) return '↘ Tightening';
  return '— Normal';
}

// All hedge partners for `symbol`, ranked by |z-score| descending.
function hedgeRowsForPair(symbol) {
  if (!_hedgeAlerts?.pairs?.length) return [];
  const sym6   = toMyfxbSym(symbol);
  const avg    = _hedgeAlerts.avg_corr   || {};
  const std    = _hedgeAlerts.corr_std   || {};
  const lastC  = _hedgeAlerts.last_corr  || {};
  const lastB  = _hedgeAlerts.last_betas || {};
  const hPairs = _hedgeAlerts.pairs;

  const rows = [];
  for (let i = 0; i < hPairs.length; i++) {
    for (let j = i + 1; j < hPairs.length; j++) {
      const a = hPairs[i], b = hPairs[j];
      if (a !== sym6 && b !== sym6) continue;
      const key  = `${a}_${b}`;
      const avgC = avg[key]  ?? avg[`${b}_${a}`]  ?? null;
      const stdC = std[key]  ?? std[`${b}_${a}`]  ?? null;
      const curC = lastC[key] ?? lastC[`${b}_${a}`] ?? null;
      if (avgC == null || stdC == null || curC == null) continue;
      const vA = lastB[a]?.vix ?? 0, vB = lastB[b]?.vix ?? 0;
      const score = (-avgC * 0.7) + (Math.abs(vA - vB) / 2 * 0.3);
      if (score < 0.3) continue;
      const z = stdC > 0 ? (curC - avgC) / stdC : 0;
      rows.push({ partner: a === sym6 ? b : a, avgC, curC, z, score, signal: hedgeSignalLabel(z) });
    }
  }
  rows.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
  return rows;
}

// ── Yield-spread compass z-score (js/compass.js) ─────────────────────────────
async function pairCompassSignal(sym) {
  if (!COMPASS_CONFIG[sym]) return null;
  try {
    const data = await loadCompassData(sym);
    if (!data) return null;
    const signal = compassFairValue(data);
    const z10arr = data.spread10y?.length > 20 ? zScore(data.spread10y) : null;
    const z2arr  = data.spread2y?.length  > 20 ? zScore(data.spread2y)  : null;
    let divergence = null;
    try { divergence = compassDivergence(data, sym); } catch (e) {}
    let rocForecast = null;
    try { rocForecast = compassRocForecast(data, sym); } catch (e) {}
    return {
      signal,
      z10: z10arr ? (z10arr[z10arr.length - 1]?.value ?? null) : null,
      z2:  z2arr  ? (z2arr[z2arr.length - 1]?.value  ?? null) : null,
      label: COMPASS_CONFIG[sym]?.label ?? null,
      divergence,
      rocForecast,
      data,
    };
  } catch (e) {
    return null;
  }
}

// ── Build the composite per-pair model: macro bias + vol-forecast levels +
//    range/vol confluence zones + both z-scores + verdict ───────────────────
// Loads the stored OI snapshot for a pair (populated by the main dashboard's
// OI modal). Returns null when no data has been pasted yet.
function getPairOI(sym) {
  try { return oiLoadStore()[sym] ?? null; } catch(e) { return null; }
}

// Finds the gamma flip strike — the price where net GEX crosses zero, meaning
// the regime transitions from PIN (dealers long gamma) to BREAKOUT (short).
function findGexFlip(gexProfile) {
  if (!gexProfile || gexProfile.length < 2) return null;
  for (let i = 1; i < gexProfile.length; i++) {
    if (Math.sign(gexProfile[i].netGex) !== Math.sign(gexProfile[i - 1].netGex)) {
      return Math.abs(gexProfile[i].netGex) < Math.abs(gexProfile[i - 1].netGex)
        ? gexProfile[i].strike : gexProfile[i - 1].strike;
    }
  }
  return null;
}

function buildCardModel(pair, quote, tierData, volRegime, bayes, posSize, f, s, zones, compass, hedgeRows) {
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

  // Surface the nearest range/vol-forecast confluence zone aligned with the
  // macro bias — this is the concrete price the verdict is actually about.
  const dirWord = dir > 0 ? 'long' : dir < 0 ? 'short' : null;
  const alignedZone = (dirWord && zones.find(z => z.direction === dirWord)) || zones[0] || null;
  if (alignedZone) {
    const starTxt = '★'.repeat(Math.max(1, Math.round(alignedZone.stars)));
    rationale += ` Nearest zone: ${alignedZone.price.toFixed(dp)} (${starTxt}${alignedZone.direction ? `, ${alignedZone.direction}` : ''}, ${Math.round(alignedZone.distance)}p away).`;
  }

  // COT crowding modifier — downgrade ACT→WATCH when specs are crowded in the
  // direction we're trading; note contrarian fuel when they're crowded against us.
  const cotData = getCOTForPair(sym);
  if (cotData?.specPct != null && dir !== 0) {
    const sp = cotData.specPct;
    const crowdedWith    = (dir > 0 && sp >= 80) || (dir < 0 && sp <= 20);
    const crowdedAgainst = (dir > 0 && sp <= 20) || (dir < 0 && sp >= 80);
    const side = dir > 0 ? 'long' : 'short';
    const contra = dir > 0 ? 'short' : 'long';
    if (crowdedWith) {
      if (verdict === 'ACT') verdict = 'WATCH';
      rationale += ` ⚠ COT: specs at ${sp}th-pctile ${side} — crowded trade, elevated unwind risk.`;
    } else if (crowdedAgainst) {
      rationale += ` COT: specs at ${sp}th-pctile ${contra} — contrarian fuel if positioning unwinds.`;
    }
  }

  // GEX regime note — tells the trader whether to expect pinning or amplification.
  const oiForRationale = getPairOI(sym);
  if (oiForRationale?.exposures?.gex != null && verdict !== 'AVOID') {
    const gex = oiForRationale.exposures.gex;
    if (gex < 0) {
      rationale += ` GEX negative (BREAKOUT) — dealer hedging amplifies moves.`;
    } else if (gex > 0 && oiForRationale.maxPain) {
      const mpDir = oiForRationale.maxPain > (price ?? 0) ? '↑' : '↓';
      rationale += ` GEX positive (PIN) — gravity toward max pain ${oiForRationale.maxPain.toFixed(dp)} ${mpDir}.`;
    }
  }

  return {
    pair, sym, price, nowPrice: price ?? curClose ?? open, dp,
    tierData, volRegime, bayes, posSize, f, s, open,
    ohMedP, oh75P, olMedP, ol75P, curClose,
    remOhMed, remOh75, remOlMed, remOl75,
    hlConsumedPct, breakoutPct, bias, dir, conviction, verdict, rationale,
    zones, topZone: zones[0] ?? null,
    compass, hedgeRows, hedge: hedgeRows[0] ?? null,
    oi: getPairOI(sym),
    cot: getCOTForPair(sym),
  };
}

// ── Shared rendering helpers ─────────────────────────────────────────────────
let _allResults = [];
let _filter = 'all';

function lvRow(label, val, hit, isCurrent) {
  return `<div class="al-lv-row${hit ? ' hit' : ''}${isCurrent ? ' current' : ''}">
    <span class="al-lv-label">${label}</span><span class="al-lv-price">${val}</span>
  </div>`;
}

function fmtZ(z) { return z == null ? '—' : `${z >= 0 ? '+' : ''}${z.toFixed(1)}σ`; }

function buildLevelsHtml(m) {
  const { dp, f, open, ohMedP, oh75P, olMedP, ol75P, curClose, nowPrice, hlConsumedPct, breakoutPct, s } = m;
  const fmtP = v => v != null ? v.toFixed(dp) : '—';
  if (!f || open == null) return '<div class="al-empty-note">No vol-forecast data for this instrument yet.</div>';
  return `
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

function zonePillHtml(zone, dp) {
  if (!zone) return '<span class="al-meta">No range/vol zones nearby</span>';
  const rounded = Math.max(0, Math.min(5, Math.round(zone.stars)));
  const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  const dirIcon = zone.direction === 'long' ? '↑' : zone.direction === 'short' ? '↓' : '·';
  return `<span class="al-zone-pill ${zone.alignStatus || ''}">${dirIcon} ${zone.price.toFixed(dp)} <span class="al-zone-stars">${stars}</span> · ${Math.round(zone.distance)}p</span>`;
}

function zScoreRowHtml(m) {
  const parts = [];
  if (m.compass) {
    parts.push(`<span class="al-z-pill" title="Yield-spread composite z-score (10y/2y, sign-adjusted for ${m.sym})">📐 Yield ${fmtZ(m.compass.signal)}</span>`);
  }
  if (m.compass?.divergence?.z != null) {
    const dz = m.compass.divergence.z;
    parts.push(`<span class="al-z-pill" title="Price vs. spread-implied fair value: rolling regression residual, z-scored (r²=${m.compass.divergence.r2.toFixed(2)}, ${m.compass.divergence.n}d window)">↔ Div ${fmtZ(dz)}</span>`);
  }
  if (m.compass?.rocForecast?.zRoc != null) {
    const rf = m.compass.rocForecast;
    parts.push(`<span class="al-z-pill" title="Rolling rate-of-change of the yield-spread z-score (lag ${rf.lagDays}d ≈ next 24h), smoothed + z-scored. β=${rf.beta != null ? rf.beta.toFixed(2) : '—'}, n=${rf.n}. Last lag window: ${rf.followStatus}.">⏱ RoC ${fmtZ(rf.zRoc)}${rf.abnormal ? ' ⚠' : ''}</span>`);
  }
  if (m.hedge) {
    parts.push(`<span class="al-z-pill" title="Correlation vs ${m.hedge.partner}: ${m.hedge.avgC.toFixed(2)} avg → ${m.hedge.curC.toFixed(2)} now">🔗 ${m.hedge.partner} ${fmtZ(m.hedge.z)}</span>`);
  }
  if (m.oi) {
    const gex = m.oi.exposures?.gex ?? 0;
    const regime = gex > 0 ? 'PIN' : gex < 0 ? 'BKOUT' : 'NEU';
    const mpDist = m.nowPrice && m.oi.maxPain
      ? Math.round(Math.abs((m.oi.maxPain - m.nowPrice) / getPipSize(m.sym))) : null;
    const mpDir  = m.oi.maxPain > (m.nowPrice ?? 0) ? '↑' : '↓';
    parts.push(`<span class="al-z-pill" title="Options OI: call wall ${m.oi.callWall?.toFixed(m.dp ?? 5) ?? '—'} · put wall ${m.oi.putWall?.toFixed(m.dp ?? 5) ?? '—'} · max pain ${m.oi.maxPain?.toFixed(m.dp ?? 5) ?? '—'} · GEX ${gex > 0 ? '+' : ''}${gex.toFixed(0)}">🎯 OI ${regime}${mpDist != null ? ` MP${mpDir}${mpDist}p` : ''}</span>`);
  }
  if (m.cot) {
    const net = m.cot.levNet ?? 0;
    const dir = net > 0 ? '↑' : net < 0 ? '↓' : '—';
    const pct = m.cot.specPct != null ? ` ${m.cot.specPct}%ile` : '';
    const crowd = m.cot.crowdingPct >= 20 ? ' ⚠' : '';
    parts.push(`<span class="al-z-pill" title="COT: spec net ${net > 0 ? '+' : ''}${net} contracts (${m.cot.levNetChg != null ? (m.cot.levNetChg >= 0 ? '+' : '') + m.cot.levNetChg + ' wk' : '—'}) · ${m.cot.crowdingPct ?? 0}% of OI${m.cot.specPct != null ? ` · ${m.cot.specPct}th pctile (3yr)` : ''}">📋 COT ${dir}${pct}${crowd}</span>`);
  }
  return parts.length ? `<div class="al-macro-row">${parts.join('')}</div>` : '';
}

function buildCardHtml(m) {
  const { pair, sym, nowPrice, dp, tierData, volRegime, bayes, posSize, bias, conviction, verdict, rationale, topZone } = m;
  const priceTxt = nowPrice != null ? nowPrice.toFixed(dp) : '—';
  const levelsHtml = buildLevelsHtml(m);

  return `
    <div class="al-card verdict-${verdict}" data-symkey="${symKey(sym)}">
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
      ${zScoreRowHtml(m)}
      <div>
        <div class="al-section-label">Top Zone</div>
        ${zonePillHtml(topZone, dp)}
      </div>
      <div>
        <div class="al-section-label">Today's Levels</div>
        ${levelsHtml}
      </div>
      <div class="al-rationale ${verdict}">${rationale}</div>
    </div>
  `;
}

// ── Deep-dive rendering ──────────────────────────────────────────────────────
function zoneSourceTags(z) {
  const tags = [];
  if (z.source === 'cross') tags.push('Asia+Monday');
  else if (z.source === 'asia') tags.push('Asia');
  else if (z.source === 'monday') tags.push('Monday');
  else if (z.source === 'volforecast') tags.push('Vol Forecast');
  else if (z.source === 'oi') tags.push('OI');
  if (z.hasVolForecast && z.source !== 'volforecast') tags.push('+Vol');
  if (z.pdhMatch) tags.push(z.pdhMatch);
  if (z.pwhMatch) tags.push(z.pwhMatch);
  if (z.pivotMatch) tags.push(z.pivotMatch);
  if (z.dailyFib) tags.push(`Fib ${z.dailyFib.label}`);
  if (z.structuralFib) tags.push('Struct Fib');
  if (z.oiMatch) tags.push(z.oiMatch);
  if (z.retailCluster) tags.push(z.retailCluster.label);
  if (z.isFlipped) tags.push('🔄 Flip');
  return tags;
}

function zoneRowHtml(z, dp) {
  const rounded = Math.max(0, Math.min(5, Math.round(z.stars)));
  const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  const dirTxt = z.direction === 'long' ? '↑ Long' : z.direction === 'short' ? '↓ Short' : '· Neutral';
  const tags = zoneSourceTags(z).map(t => `<span class="al-tag">${t}</span>`).join('');
  return `<tr class="al-zone-row ${z.alignStatus || ''}">
    <td>${z.price.toFixed(dp)}</td>
    <td>${dirTxt}</td>
    <td>${stars}</td>
    <td>${Math.round(z.distance)}p</td>
    <td>${tags}</td>
    <td>${z.sl != null ? z.sl.toFixed(dp) : '—'}</td>
    <td>${z.tp != null ? z.tp.toFixed(dp) : '—'}</td>
    <td>${z.rrRaw}R${z.poorRR ? ' ⚠️' : ''}</td>
    <td>${z.size}%</td>
  </tr>`;
}

function tierRowHtml(t) {
  const cls = t.score > 0 ? 'LONG' : t.score < 0 ? 'SHORT' : 'NEUTRAL';
  return `<tr>
    <td>${t.tier}</td>
    <td>${t.name}</td>
    <td class="al-tier-score ${cls}">${t.score > 0 ? '+' : ''}${t.score}</td>
    <td>${t.val ?? '—'}</td>
    <td class="al-tier-reading">${t.reading ?? ''}</td>
  </tr>`;
}

// Placeholder div for the Lightweight Charts yield-lag chart. The actual
// chart is mounted by initYieldLagChart() AFTER this HTML is injected into
// the DOM, since LightweightCharts.createChart() needs a live DOM element.
function compassRocChartHtml(sym) {
  return `
  <div class="compass-legend" style="margin-top:10px">
    <div class="cl-item"><div class="cl-line" style="background:#9b59b6"></div><span>Yield fair value (regression-implied price)</span></div>
    <div class="cl-item"><div class="cl-line" style="background:transparent;border-top:2px dashed #3498db;height:0;margin-top:5px"></div><span>FX price (candles)</span></div>
    <div class="cl-item"><div class="cl-line" style="background:transparent;border-top:2px dashed #27ae60;height:0;margin-top:5px"></div><span>Forecast projection</span></div>
  </div>
  <div id="ylChart-${sym.replace('/', '_')}" style="height:220px;background:#131722;border-radius:6px;margin-top:6px"></div>`;
}

// Returns the next N non-weekend dates after dateStr (YYYY-MM-DD).
function nextTradingDays(dateStr, n) {
  const dates = [];
  const d = new Date(dateStr + 'T00:00:00Z');
  while (dates.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Active LightweightCharts instance — destroyed when routing away from deep-dive.
let _ylChart = null;

// Mounts the yield-lag LightweightCharts chart after deep-dive HTML injection.
// Shows: daily FX candles + yield regression fair-value line (same price axis,
// no rescaling — fairPrice IS already in price units) + dashed forward
// projection showing where the RoC forecast implies price will move.
function initYieldLagChart(m) {
  if (_ylChart) { try { _ylChart.remove(); } catch(e) {} _ylChart = null; }

  const LC = window.LightweightCharts;
  if (!LC) return;

  const sym   = m.sym;
  const el    = document.getElementById('ylChart-' + sym.replace('/', '_'));
  if (!el) return;

  const div = m.compass?.divergence;
  const roc = m.compass?.rocForecast;
  const dp  = m.dp ?? 5;

  // FX daily candles (chronological, last 60 bars)
  const rawBars = filterTradingDays(S.ohlcData[sym]?.values) ?? [];
  const candles = [...rawBars].reverse().slice(-60).map(b => ({
    time:  b.datetime.split(' ')[0],
    open:  parseFloat(b.open),
    high:  parseFloat(b.high),
    low:   parseFloat(b.low),
    close: parseFloat(b.close),
  })).filter(b => b.close > 0);

  if (!candles.length) return;
  const lastBar = candles[candles.length - 1];

  // Fair-value line from the divergence regression (price units, daily)
  const fairSeries = div?.fairPriceSeries
    ?.filter(p => p.date >= candles[0].time)
    ?.map(p => ({ time: p.date, value: p.value })) ?? [];

  _ylChart = LC.createChart(el, {
    autoSize:   true,
    layout:     { background: { color: '#131722' }, textColor: '#d1d4dc' },
    grid:       { vertLines: { color: '#1c2133' }, horzLines: { color: '#1c2133' } },
    crosshair:  { mode: LC.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2a3348', precision: dp },
    timeScale:  { borderColor: '#2a3348', timeVisible: false },
  });

  // Candlestick series
  const cs = _ylChart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
  });
  cs.setData(candles);

  // Fair-value line (purple) — same price axis, no rescaling
  if (fairSeries.length) {
    const fvLine = _ylChart.addLineSeries({
      color: '#9b59b6', lineWidth: 2,
      lineStyle: LC.LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: true,
    });
    fvLine.setData(fairSeries);

    // Current fair value as a horizontal price line
    if (div?.fairPrice != null) {
      fvLine.createPriceLine({
        price: div.fairPrice, color: '#9b59b680', lineWidth: 1,
        lineStyle: LC.LineStyle.Dashed, title: `Fair value ${div.fairPrice.toFixed(dp)}`,
        axisLabelVisible: true,
      });
    }
  }

  // Forward projection: from last close out lagDays trading days
  if (roc?.forecastDelta != null && lastBar) {
    const lagDays  = roc.lagDays ?? 1;
    const target   = lastBar.close + roc.forecastDelta;
    const futureDates = nextTradingDays(lastBar.time, lagDays);
    const projColor = roc.forecastDelta >= 0 ? '#27ae60' : '#e74c3c';
    const projLine  = _ylChart.addLineSeries({
      color: projColor, lineWidth: 2,
      lineStyle: LC.LineStyle.Dashed,
      priceLineVisible: false, lastValueVisible: true,
    });
    projLine.setData([
      { time: lastBar.time, value: lastBar.close },
      { time: futureDates[futureDates.length - 1], value: target },
    ]);

    const pipSz = getPipSize(sym);
    const pipLabel = pipSz ? `${roc.forecastDelta >= 0 ? '+' : ''}${Math.round(roc.forecastDelta / pipSz)}p` : '';
    projLine.createPriceLine({
      price: target, color: projColor, lineWidth: 1,
      lineStyle: LC.LineStyle.Dotted,
      title: `Forecast ${pipLabel}`, axisLabelVisible: true,
    });
  }

  _ylChart.timeScale().fitContent();
}

function oiHtml(m) {
  const oi = m.oi;
  if (!oi) return '<div class="al-empty-note">No OI data for this pair — paste CME strike table via the 📊 OI button on the main dashboard to unlock options-level analysis.</div>';

  const dp     = m.dp ?? 5;
  const sym    = m.sym;
  const pipSz  = getPipSize(sym);
  const price  = m.nowPrice;

  const callWall  = oi.callWall  ?? 0;
  const putWall   = oi.putWall   ?? 0;
  const maxPain   = oi.maxPain   ?? 0;
  const gex       = oi.exposures?.gex ?? 0;
  const dex       = oi.exposures?.dex ?? 0;
  const gexSign   = gex > 0 ? 'positive' : gex < 0 ? 'negative' : 'zero';
  const regime    = gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
  const regimeCls = gex > 0 ? 'WATCH' : gex < 0 ? 'ACT' : '';
  const gexFlip   = findGexFlip(oi.gexProfile);

  const fmt = v => v ? v.toFixed(dp) : '—';
  const pips = (a, b) => (pipSz && a && b) ? Math.round(Math.abs(a - b) / pipSz) : null;
  const dir  = (a, b) => a > b ? '↑' : '↓';

  // Price position relative to key levels
  const aboveCW  = price != null && callWall && price > callWall;
  const belowPW  = price != null && putWall  && price < putWall;
  const cwDist   = pips(price, callWall);
  const pwDist   = pips(price, putWall);
  const mpDist   = pips(price, maxPain);
  const fpDist   = pips(price, gexFlip);

  const mpDir    = maxPain && price != null ? dir(maxPain, price) : '';
  const fpDir    = gexFlip  && price != null ? dir(gexFlip, price)  : '';

  // Regime narrative
  const narrative = (() => {
    if (regime === 'PIN') {
      return `Net GEX is <strong>positive</strong> — dealers are long gamma and actively delta-hedge in the opposite direction of moves. Expect price to be attracted toward high-OI strikes and volatility to be dampened. Max pain at <strong>${fmt(maxPain)}</strong> acts as a gravitational target ${mpDir}${mpDist != null ? ` (${mpDist}p away)` : ''}.`;
    }
    if (regime === 'BREAKOUT') {
      return `Net GEX is <strong>negative</strong> — dealers are short gamma and must hedge by trading <em>with</em> the move, amplifying momentum. Breakout moves are more likely to extend; fade attempts are riskier. Watch the gamma flip at <strong>${fmt(gexFlip)}</strong> as a potential inflection point.`;
    }
    return 'Net GEX is near zero — no clear gamma-driven bias. Price can move freely without dealer hedging headwinds or tailwinds.';
  })();

  // Top call / put walls as level rows
  const cwWalls = (oi.callWalls?.length ? oi.callWalls : (callWall ? [{ strike: callWall, oi: oi.callWallOI ?? 0 }] : [])).slice(0, 3);
  const pwWalls = (oi.putWalls?.length  ? oi.putWalls  : (putWall  ? [{ strike: putWall,  oi: oi.putWallOI  ?? 0 }] : [])).slice(0, 3);

  const wallRow = (w, type) => {
    const d = pips(price, w.strike);
    const active = price != null && (type === 'call' ? price > w.strike - (d ?? 999) * pipSz && price < w.strike : price < w.strike + (d ?? 999) * pipSz && price > w.strike);
    return lvRow(
      `${type === 'call' ? '🔴 Call wall' : '🟢 Put wall'} ${fmt(w.strike)}`,
      `${w.oi ? Math.round(w.oi / 1000) + 'k OI' : ''}${d != null ? ` · ${d}p` : ''}`,
      false, active
    );
  };

  return `
    <div class="al-macro-row">
      <span class="al-chip ${regimeCls}">γ ${regime}</span>
      <span class="al-meta">GEX ${gex >= 0 ? '+' : ''}${Math.round(gex)}</span>
      ${dex !== 0 ? `<span class="al-meta">DEX ${dex >= 0 ? '+' : ''}${Math.round(dex)}</span>` : ''}
      ${gexFlip ? `<span class="al-meta">flip ${fmt(gexFlip)} ${fpDir}${fpDist != null ? `${fpDist}p` : ''}</span>` : ''}
    </div>
    <div class="al-rationale ${regimeCls}">${narrative}</div>

    <div class="al-levels" style="margin-top:8px">
      ${cwWalls.map(w => wallRow(w, 'call')).join('')}
      ${pwWalls.map(w => wallRow(w, 'put')).join('')}
      ${maxPain ? lvRow(`🎯 Max pain ${fmt(maxPain)}`, `${mpDir}${mpDist != null ? mpDist + 'p away' : ''}`, false, false) : ''}
      ${gexFlip ? lvRow(`⚡ Gamma flip ${fmt(gexFlip)}`, `${fpDir}${fpDist != null ? fpDist + 'p · regime changes here' : 'regime changes here'}`, false, false) : ''}
    </div>

    ${aboveCW ? `<div class="al-rationale AVOID" style="margin-top:6px">Price is <strong>above the call wall</strong> at ${fmt(callWall)} — options resistance has been breached; dynamic is now gamma-driven squeeze territory or reversal risk.</div>` : ''}
    ${belowPW ? `<div class="al-rationale ACT" style="margin-top:6px">Price is <strong>below the put wall</strong> at ${fmt(putWall)} — put sellers defending this level; watch for a bounce or increased selling pressure.</div>` : ''}
  `;
}

function compassHtml(m) {
  if (!m.compass) return '<div class="al-empty-note">No yield-spread data for this instrument.</div>';
  const { signal, z10, z2, label, divergence, rocForecast } = m.compass;
  const lean = signal == null ? 'Neutral' : signal > 0.3 ? 'Favors LONG' : signal < -0.3 ? 'Favors SHORT' : 'Neutral';
  const divHtml = (() => {
    if (divergence?.z == null) return '';
    const dz = divergence.z;
    const dzAbs = Math.abs(dz);
    const rich = dz > 0;
    const pipSz = getPipSize(m.sym);
    const gapPips = divergence.gap != null && pipSz ? Math.abs(divergence.gap / pipSz).toFixed(0) : null;
    const verdict = dzAbs < 1 ? 'Price is tracking the spread closely — no meaningful divergence.'
      : rich ? `Price is running ${gapPips ? `~${gapPips}p ` : ''}rich vs what the spread implies — reversion risk skews lower.`
             : `Price is lagging ${gapPips ? `~${gapPips}p ` : ''}below what the spread implies — catch-up move skews higher.`;
    return `
    <div class="al-macro-row" style="margin-top:6px">
      <span class="al-chip">↔ Divergence</span>
      <span class="al-meta">z ${fmtZ(dz)}</span>
      <span class="al-meta">r² ${divergence.r2.toFixed(2)}</span>
      <span class="al-meta">${divergence.n}d window</span>
    </div>
    <div class="al-rationale">Rolling regression of price on the spread lean, residual z-scored. ${verdict}</div>`;
  })();
  const rocHtml = (() => {
    if (!rocForecast || rocForecast.zRoc == null) return '';
    const rf = rocForecast;
    const pipSz = getPipSize(m.sym);
    const deltaPips = rf.forecastDelta != null && pipSz ? Math.abs(rf.forecastDelta / pipSz).toFixed(0) : null;
    const dirArrow = rf.forecastDelta == null ? '·' : rf.forecastDelta > 0 ? '↑' : rf.forecastDelta < 0 ? '↓' : '·';
    const target = (m.nowPrice != null && rf.forecastDelta != null) ? (m.nowPrice + rf.forecastDelta).toFixed(m.dp) : null;
    const statusCls = rf.followStatus === 'FOLLOWING' ? 'ACT' : rf.followStatus === 'DIVERGING' ? 'AVOID' : '';
    const verdict = (rf.beta == null || rf.n < 15)
      ? `Not enough history yet to trust the beta fit (n=${rf.n}) — forecast is informational only.`
      : `Lagged ${rf.lagDays}d RoC implies a ${dirArrow} move of ${deltaPips ? `~${deltaPips}p` : 'an undetermined size'} over the next ~24h${target ? ` (≈ ${target})` : ''}. Last completed lag window: price <strong>${rf.followStatus}</strong> the forecast.`;
    return `
    <div class="al-macro-row" style="margin-top:10px">
      <span class="al-chip">⏱ Movement Lag Forecast</span>
      <span class="al-meta">RoC z ${fmtZ(rf.zRoc)}${rf.abnormal ? ' ⚠ abnormal' : ''}</span>
      <span class="al-meta">β ${rf.beta != null ? rf.beta.toFixed(2) : '—'}</span>
      <span class="al-meta">r ${rf.corr != null ? rf.corr.toFixed(2) : '—'}</span>
      <span class="al-meta">n=${rf.n}</span>
    </div>
    ${compassRocChartHtml(m.sym)}
    <div class="al-rationale ${statusCls}">${verdict}</div>`;
  })();
  return `
    <div class="al-macro-row">
      <span class="al-chip">${label ?? 'Yield Spread'}</span>
      <span class="al-meta">z10y ${fmtZ(z10)}</span>
      <span class="al-meta">z2y ${fmtZ(z2)}</span>
    </div>
    <div class="al-rationale">Composite signal ${fmtZ(signal)} — <strong>${lean}</strong> based on the yield-spread differential vs its trailing distribution.</div>
    ${divHtml}
    ${rocHtml}
  `;
}

function hedgeHtml(m) {
  if (!m.hedgeRows?.length) return '<div class="al-empty-note">No hedge correlation data for this pair right now.</div>';
  return `<div class="al-levels">` + m.hedgeRows.slice(0, 5).map(r => lvRow(`vs ${r.partner}`, `${fmtZ(r.z)} · ${r.signal}`)).join('') + `</div>`;
}

function buildDeepDiveHtml(m) {
  const { pair, sym, nowPrice, dp, tierData, bayes, posSize, bias, conviction, verdict, rationale, zones } = m;
  const priceTxt = nowPrice != null ? nowPrice.toFixed(dp) : '—';
  const levelsHtml = buildLevelsHtml(m);

  const tierRows = (tierData.tiers || []).map(tierRowHtml).join('') ||
    `<tr><td colspan="5" class="al-empty-note">No tier data.</td></tr>`;
  const zoneRows = zones.length
    ? zones.map(z => zoneRowHtml(z, dp)).join('')
    : `<tr><td colspan="9" class="al-empty-note">No range/vol-forecast confluence zones detected for this pair right now.</td></tr>`;

  return `
    <div class="al-dd-header">
      <a href="#" class="al-back-link">← All pairs</a>
      <div class="al-dd-title">
        <span class="al-pair-name">${pair.name}</span>
        <span class="al-price">${priceTxt}</span>
        <span class="al-verdict-badge ${verdict}">${verdict}</span>
      </div>
    </div>

    <div class="al-dd-grid">
      <div class="al-dd-col al-dd-main">
        <div class="al-card">
          <div class="al-macro-row">
            <span class="al-chip ${bias}">${bias}</span>
            <span class="al-chip">${conviction}</span>
            <span class="al-meta">${tierData.agreeCount}/8 tiers agree</span>
            <span class="al-meta">Bayes ${bayes.pct}%</span>
            <span class="al-meta">Size ${posSize}%</span>
          </div>
          <div class="al-rationale ${verdict}">${rationale}</div>
        </div>

        <div class="al-card">
          <div class="al-section-label">Range &amp; Volatility Confluence Zones</div>
          <div style="overflow-x:auto">
          <table class="al-zone-table">
            <thead><tr>
              <th>Price</th><th>Dir</th><th>★</th><th>Dist</th><th>Confluence</th>
              <th>SL</th><th>TP</th><th>R:R</th><th>Size</th>
            </tr></thead>
            <tbody>${zoneRows}</tbody>
          </table>
          </div>
        </div>

        <div class="al-card">
          <div class="al-section-label">8-Tier Macro Breakdown</div>
          <div style="overflow-x:auto">
          <table class="al-tier-table">
            <thead><tr><th>Tier</th><th>Driver</th><th>Score</th><th>Value</th><th>Reading</th></tr></thead>
            <tbody>${tierRows}</tbody>
          </table>
          </div>
        </div>
      </div>

      <div class="al-dd-col al-dd-side">
        <div class="al-card">
          <div class="al-section-label">Today's Vol-Forecast Levels</div>
          ${levelsHtml}
        </div>
        <div class="al-card">
          <div class="al-section-label">Yield-Spread Compass</div>
          ${compassHtml(m)}
        </div>
        <div class="al-card">
          <div class="al-section-label">Hedge Correlation Monitor</div>
          ${hedgeHtml(m)}
        </div>
        <div class="al-card">
          <div class="al-section-label">Options Open Interest — Levels &amp; Gamma</div>
          ${oiHtml(m)}
        </div>
        <div class="al-card">
          <div class="al-section-label">COT Positioning <span style="font-size:9px;font-weight:500;padding:1px 5px;border-radius:3px;background:#7c3aed22;color:#a78bfa;letter-spacing:.3px">CFTC</span></div>
          ${renderCOTCard(m.sym)}
        </div>
        <div class="al-card">
          <div class="al-section-label">Zone History <span style="font-size:9px;font-weight:500;padding:1px 5px;border-radius:3px;background:#f39c1222;color:#f39c12;letter-spacing:.3px">14d</span></div>
          ${renderPairAuditHistory(m.sym)}
        </div>
      </div>
    </div>
  `;
}

// ── Grid rendering ───────────────────────────────────────────────────────────
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
  grid.querySelectorAll('.al-card').forEach(card => {
    card.addEventListener('click', () => { location.hash = '#' + card.dataset.symkey; });
  });
}

// ── Hash-based routing between the all-pairs grid and a pair's deep-dive ────
function route() {
  const hash    = decodeURIComponent(location.hash.replace(/^#/, ''));
  const dd      = document.getElementById('alDeepDive');
  const grid    = document.getElementById('alGrid');
  const summary = document.getElementById('alSummary');
  const audit   = document.getElementById('alAudit');

  // Destroy charts when leaving their views
  if (_ylChart) { try { _ylChart.remove(); } catch(e) {} _ylChart = null; }
  if (hash !== 'audit') destroyAuditCharts();

  const m = (hash && hash !== 'audit') ? _allResults.find(r => symKey(r.sym) === hash) : null;

  if (hash === 'audit') {
    grid.style.display    = 'none';
    summary.style.display = 'none';
    dd.style.display      = 'none';
    if (audit) { audit.style.display = 'block'; renderAuditPage(audit); }
  } else if (m) {
    grid.style.display    = 'none';
    summary.style.display = 'none';
    dd.style.display      = 'block';
    if (audit) audit.style.display = 'none';
    dd.innerHTML = buildDeepDiveHtml(m);
    // Mount charts/event-handlers AFTER HTML is in the DOM
    initYieldLagChart(m);
    initPairAuditHistory();
  } else {
    dd.style.display = 'none';
    if (audit) audit.style.display = 'none';
    grid.style.display = 'grid';
    if (_allResults.length) summary.style.display = 'flex';
    renderGrid();
  }
}
window.addEventListener('hashchange', route);

function render(results, meta) {
  _allResults = results;
  const counts = { ACT: 0, WATCH: 0, WAIT: 0, AVOID: 0 };
  results.forEach(r => counts[r.verdict]++);
  document.getElementById('cnt-all').textContent   = results.length;
  document.getElementById('cnt-ACT').textContent   = counts.ACT;
  document.getElementById('cnt-WATCH').textContent = counts.WATCH;
  document.getElementById('cnt-WAIT').textContent  = counts.WAIT;
  document.getElementById('cnt-AVOID').textContent = counts.AVOID;
  if (meta?.computed_at) {
    document.getElementById('alUpdated').textContent = new Date(meta.computed_at).toLocaleString();
  }
  route();
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
    await Promise.all([loadCaps(), loadHedgeAlerts(), loadCOT(), oiLoadStoreFromKV()]);

    S.fredData = fredData;
    S.ecbData  = ecbData;
    const forecastInstruments = forecastRes?.instruments ?? {};
    const sessionInstruments  = sessionRes?.instruments ?? {};
    S.garchForecast = forecastInstruments;

    // ① Prefetch all pairs' OHLC + quotes in parallel — the serial loop was the
    //   #1 cause of slow loads (26 × 4 sequential network calls = up to 100+ requests).
    setStatus('spin', 'Prefetching market data…');
    await Promise.all(PAIRS.map(p => loadPairData(p.symbol).catch(() => null)));

    // USD strength is synchronous once OHLC data is in S — no dedicated serial pre-loop needed.
    S.usdStrength  = computeUSDStrength();
    S.dollarRegime = computeDollarRegime();

    // ② Prefetch compass signals for all supported pairs in parallel (FRED/KV → localStorage).
    setStatus('spin', 'Loading yield signals…');
    const compassResults = {};
    await Promise.all(
      PAIRS
        .filter(p => COMPASS_CONFIG[p.symbol])
        .map(p =>
          pairCompassSignal(p.symbol)
            .then(r  => { compassResults[p.symbol] = r; })
            .catch(() => {})
        )
    );

    // ③ Sequential computation (tier calcs mutate S.currentPair) + progressive render.
    //   Each pair now reads already-loaded S state — no network waits inside the loop.
    const results = [];
    for (let i = 0; i < PAIRS.length; i++) {
      const pair = PAIRS[i];
      setStatus('spin', `Analysing ${pair.name} (${i + 1}/${PAIRS.length})…`);
      const quote = await loadPairData(pair.symbol); // instant — data already in S

      S.currentPair = pair;
      let tierData, volRegime, bayes, posSize;
      try {
        calculateAsiaRanges(pair.symbol);
        calculateMondayRanges(pair.symbol);
        tierData  = calculateTierScores();
        volRegime = calculateVolRegime();
        bayes     = computeBayesianScore(tierData.tiers);
        posSize   = calcPositionSize(tierData.totalScore, volRegime, null, null);
      } catch (e) {
        console.warn('[levels] tier calc failed for', pair.symbol, e);
        tierData  = { totalScore: 0, tiers: [], agreeCount: 0, maxScore: 18 };
        volRegime = { regime: 'NORMAL', sizeMult: 1, usedPct: 0, atrPips: 50 };
        bayes     = { pct: 50, dir: 'neutral' };
        posSize   = 10;
      }

      const instKey = toInstrumentKey(pair);
      const f = forecastInstruments[instKey] ?? null;
      const s = sessionInstruments[instKey] ?? null;

      const macroBiasForZones = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
      let zones = [];
      try { zones = buildZones(pair, quote, tierData, volRegime, macroBiasForZones, f, s); }
      catch (e) { console.warn('[levels] zone build failed for', pair.symbol, e); }

      const compass = compassResults[pair.symbol] ?? null;
      const hedgeRows = hedgeRowsForPair(pair.symbol);

      results.push(buildCardModel(pair, quote, tierData, volRegime, bayes, posSize, f, s, zones, compass, hedgeRows));

      // Progressive render — update grid as each pair completes so results are
      // visible immediately rather than after all 26 pairs finish computing.
      _allResults = [...results];
      if (!location.hash.replace(/^#/, '')) renderGrid();
    }

    S.currentPair = PAIRS[0];
    render(results, forecastRes?.meta);
    // Save zone snapshot for the audit trail (async, non-blocking)
    try { saveZoneSnapshot(results); } catch (e) { console.warn('[levels] audit snapshot failed', e); }

    const withLevels = results.filter(r => r.f).length;
    const withZones  = results.filter(r => r.zones?.length).length;
    setStatus('ok', `${results.length} pairs loaded · ${withLevels} with live levels · ${withZones} with confluence zones`);
  } catch (error) {
    console.error('[levels] boot error', error);
    setStatus('err', `Error: ${error.message}`);
  }
}

boot();
