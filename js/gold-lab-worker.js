// gold-lab-worker.js — Web Worker for Gold Lab reconstruction page.
// Handles: CSV parsing (1m bars), historical model feature reconstruction,
// outcome labeling (SL/TP hit detection on 1m bars), and CSV export generation.

// ── Storage ────────────────────────────────────────────────────────────────────
let _bars1m = [];        // parsed 1m bars for XAU/USD, oldest→newest
let _fredHistory = null; // 5Y FRED history { tips:[], bei:[], dxy:[], vix:[], hy:[], us2y:[] }

// ── Entry point ───────────────────────────────────────────────────────────────
self.onmessage = ({ data: { type, payload } }) => {
  if      (type === 'parse_m1')    handleParseM1(payload);
  else if (type === 'set_history') handleSetHistory(payload);
  else if (type === 'reconstruct') handleReconstruct(payload);
};

function post(type, payload) { self.postMessage({ type, payload }); }

// ── 1m CSV parser ──────────────────────────────────────────────────────────────
// Expected format: unix_ts_ms, open, high, low, close  (no volume required)
function handleParseM1({ text }) {
  post('progress', { stage: 'parse', pct: 2, msg: 'Parsing 1m bars…' });
  const lines = text.split('\n');
  const bars  = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const p = raw.split(',');
    if (p.length < 5) continue;
    const ts = parseInt(p[0], 10);
    if (isNaN(ts)) continue;
    const o = +p[1], h = +p[2], l = +p[3], c = +p[4];
    if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;
    bars.push({ ts, o, h, l, c });
    if (i % 100000 === 0) {
      post('progress', { stage: 'parse', pct: Math.round(5 + 40 * i / lines.length),
        msg: `Parsing… ${(i / 1000).toFixed(0)}k / ${((lines.length) / 1000).toFixed(0)}k rows` });
    }
  }

  bars.sort((a, b) => a.ts - b.ts);
  _bars1m = bars;
  post('parsed_m1', { count: bars.length,
    dateFrom: bars[0]  ? new Date(bars[0].ts).toISOString().slice(0,10) : null,
    dateTo:   bars[bars.length-1] ? new Date(bars[bars.length-1].ts).toISOString().slice(0,10) : null,
  });
}

// ── Store FRED history from main thread ───────────────────────────────────────
function handleSetHistory({ history }) {
  _fredHistory = history;
  post('history_ready', { keys: Object.keys(history) });
}

// ── Main reconstruction loop ──────────────────────────────────────────────────
// For each trading day in FRED history: reconstruct macro features, then label
// outcome by scanning forward on 1m bars for SL/TP hit.
function handleReconstruct({ atrMultSl, atrMultTp, scanDays, minHistoryDays, lookbackWindow, oiData }) {
  if (!_fredHistory || !_bars1m.length) {
    post('error', 'Missing 1m bars or FRED history — load both first');
    return;
  }

  const SL_MULT  = atrMultSl  ?? 1.5;
  const TP_MULT  = atrMultTp  ?? 2.5;
  const SCAN_BARS = (scanDays ?? 5) * 1440;  // 1440 1m bars per day
  const MIN_HIST  = minHistoryDays ?? 30;
  const Z_WINDOW  = lookbackWindow  ?? 60;

  // Align FRED series into a day-keyed map for fast lookup
  const fredByDate = buildFredByDate(_fredHistory);
  const sortedDates = Object.keys(fredByDate).sort();

  // Build 1m bar index by date string (YYYY-MM-DD in London time ≈ UTC for daily)
  const barsByDate = buildBarsByDate(_bars1m);

  post('progress', { stage: 'reconstruct', pct: 50, msg: `Reconstructing ${sortedDates.length} trading days…` });

  const rows = [];
  let processed = 0;

  for (let di = MIN_HIST; di < sortedDates.length; di++) {
    const date  = sortedDates[di];
    const today = fredByDate[date];

    // Build history slice up to (not including) today for z-score/accel computation
    const histSlice = buildHistSlice(_fredHistory, date, Z_WINDOW + 5);

    // Reconstruct macro model features for this date
    const features = reconstructFeatures(today, histSlice, Z_WINDOW, fredByDate, sortedDates, di);
    if (!features) continue;

    // Compute ATR from last 14 days of daily closes (from 1m bars)
    const atr = computeDailyAtr(barsByDate, date, sortedDates, di, 14);
    if (!atr || atr < 1) continue;  // skip days with insufficient bar data

    const slPips = atr * SL_MULT;
    const tpPips = atr * TP_MULT;

    // Label: scan 1m bars from next trading day open forward
    const label = labelOutcome(barsByDate, date, sortedDates, di, features.signal,
                               slPips, tpPips, SCAN_BARS, oiData);

    rows.push({ date, ...features, atr: round2(atr), sl_pips: round2(label.tp_pips_used ?? slPips),
                tp_pips: round2(label.tp_pips_used ?? tpPips), tp_method: label.tp_method, ...label });

    processed++;
    if (processed % 50 === 0) {
      post('progress', { stage: 'reconstruct',
        pct: Math.round(50 + 45 * di / sortedDates.length),
        msg: `Labeled ${processed} days…` });
    }
  }

  post('progress', { stage: 'reconstruct', pct: 98, msg: 'Generating CSV…' });
  const csv = generateCSV(rows);
  post('done', { rows: rows.length, csv,
    stats: computeStats(rows),
    dateFrom: rows[0]?.date, dateTo: rows[rows.length-1]?.date });
}

// ── FRED alignment helpers ─────────────────────────────────────────────────────

function buildFredByDate(history) {
  // Union of all dates across all series, each date gets its known values
  const map = {};
  for (const [key, arr] of Object.entries(history)) {
    for (const { date, value } of arr) {
      if (!map[date]) map[date] = {};
      map[date][key] = value;
    }
  }
  return map;
}

// Build a slice of the history arrays up to (exclusive) targetDate, limited to maxLen points
function buildHistSlice(history, targetDate, maxLen) {
  const slice = {};
  for (const [key, arr] of Object.entries(history)) {
    slice[key] = arr.filter(p => p.date < targetDate).slice(-maxLen);
  }
  return slice;
}

// ── Feature reconstruction ────────────────────────────────────────────────────

function reconstructFeatures(today, histSlice, zWindow, fredByDate, sortedDates, di) {
  const tips  = today.tips  ?? null;
  const bei   = today.bei   ?? null;
  const dxy   = today.dxy   ?? null;
  const vix   = today.vix   ?? null;
  const hy    = today.hy    ?? null;
  const us2y  = today.us2y  ?? null;

  if (tips == null || bei == null) return null;  // minimum required fields

  // Previous day values for single-period momentum
  const prevDate  = sortedDates[di - 1];
  const prev      = prevDate ? (fredByDate[prevDate] || {}) : {};
  const tipsPrev  = prev.tips ?? null;
  const beiPrev   = prev.bei  ?? null;
  const dxyPrev   = prev.dxy  ?? null;
  const vixPrev   = prev.vix  ?? null;
  const hyPrev    = prev.hy   ?? null;
  const us2yPrev  = prev.us2y ?? null;

  // Momentum (1-period)
  const tipsMom  = tipsPrev != null ? tips - tipsPrev : null;
  const beiMom   = beiPrev  != null ? bei  - beiPrev  : null;
  const dxyMom   = dxyPrev  != null ? (dxy / dxyPrev - 1) * 100 : null;
  const vixChg   = vixPrev  != null ? vix  - vixPrev  : null;
  const hyChg    = hyPrev   != null ? hy   - hyPrev   : null;
  const us2yMom  = us2yPrev != null ? us2y - us2yPrev : null;

  // Acceleration (history-derived, more accurate)
  const tipsArr  = histSlice.tips  || [];
  const beiArr   = histSlice.bei   || [];
  const dxyArr   = histSlice.dxy   || [];
  const vixArr   = histSlice.vix   || [];

  const { mom: tipsMomH, accel: tipsAccel } = calcMomAccel(tipsArr);
  const { mom: beiMomH,  accel: beiAccel  } = calcMomAccel(beiArr);
  const { accel: dxyAccel } = calcMomAccel(dxyArr);
  const { accel: vixAccel } = calcMomAccel(vixArr);

  const tipsMomFinal = tipsMomH ?? tipsMom;
  const beiMomFinal  = beiMomH  ?? beiMom;

  // Z-scores
  const tipsZScore = calcZScore(tipsArr, zWindow);
  const beiZScore  = calcZScore(beiArr,  zWindow);
  const dxyZScore  = calcZScore(dxyArr,  zWindow);
  const vixZScore  = calcZScore(vixArr,  Math.min(30, zWindow));

  // Inflection
  const tipsInflection = inflection(tipsMomFinal, tipsAccel);
  const beiInflection  = inflection(beiMomFinal,  beiAccel);

  // Regime classification (simplified rules matching gold-model.js logic)
  const regime = classifyRegime(tips, tipsMomFinal, bei, beiMom, vix, hy);

  // Layer scores
  const rl  = scoreTipsLevel(tips);
  const bl  = scoreBeiLevel(bei);
  const rm  = scoreTipsMom(tipsMomFinal);
  const bm  = scoreBeiMom(beiMomFinal);
  const dm  = scoreDxyMom(dxyMom);
  const sh  = scoreSafeHaven(vix, vixChg, hy, hyChg);

  const WEIGHTS = regimeWeights(regime);
  const rawScore = WEIGHTS.rl * rl + WEIGHTS.rm * rm + WEIGHTS.bl * bl +
                   WEIGHTS.bm * bm + WEIGHTS.dm * dm + WEIGHTS.sh * sh;
  const goldScore = Math.max(-1, Math.min(1, rawScore));

  const signal   = goldScore >  0.25 ? 'BULLISH' : goldScore < -0.25 ? 'BEARISH' : 'NEUTRAL';
  const strength = Math.abs(goldScore) > 0.60 ? 'STRONG'
                 : Math.abs(goldScore) > 0.30 ? 'MODERATE' : 'WEAK';

  // Confidence: simplified (no GARCH in worker)
  const isTransitioning = tipsInflection !== 'TRENDING' || beiInflection !== 'TRENDING';
  const confidence = isTransitioning ? 'LOW'
                   : Math.abs(goldScore) > 0.5 ? 'HIGH' : 'MEDIUM';

  return {
    signal, strength, regime, gold_score: round3(goldScore), confidence,
    tips:      round2(tips),       tips_mom:   round4(tipsMomFinal), tips_accel:  round4(tipsAccel),
    tips_zscore: round3(tipsZScore), tips_inflection: tipsInflection,
    bei:       round2(bei),        bei_mom:    round4(beiMomFinal),  bei_accel:   round4(beiAccel),
    bei_zscore:  round3(beiZScore),  bei_inflection:  beiInflection,
    dxy:       round2(dxy),        dxy_mom:    round3(dxyMom),       dxy_accel:   round4(dxyAccel),
    dxy_zscore:  round3(dxyZScore),
    vix:       round2(vix),        vix_chg:    round3(vixChg),       vix_accel:   round4(vixAccel),
    vix_zscore:  round3(vixZScore),
    hy:        round3(hy),         hy_chg:     round4(hyChg),
    us2y_mom:  round4(us2yMom),
    is_transitioning: isTransitioning ? 1 : 0,
    entryPrice: null,  // set by labelOutcome
  };
}

// ── Outcome labeling ──────────────────────────────────────────────────────────

function labelOutcome(barsByDate, date, sortedDates, di, signal, slPips, atrTpPips, scanBars, oiData) {
  const NEUTRAL_ROW = {
    entry_price: null, outcome_hit_tp: -1, outcome_hit_sl: -1,
    forward_return_1d: null, forward_return_5d: null,
    bars_to_outcome: null, tp_pips_used: null, tp_method: null,
  };

  if (signal === 'NEUTRAL') return NEUTRAL_ROW;

  const nextBars = getNextBars(barsByDate, sortedDates, di, 1, scanBars);
  if (!nextBars.length) return NEUTRAL_ROW;

  const entryPrice = nextBars[0].o;  // open of first bar next day = entry
  const isLong     = signal === 'BULLISH';

  // Prefer OI wall as TP; fall back to ATR multiplier
  const oiTpDist  = findOiWallDist(entryPrice, isLong, oiData);
  const tpPips    = oiTpDist ?? atrTpPips;
  const tpMethod  = oiTpDist ? 'oi_wall' : 'atr';

  const tp = isLong ? entryPrice + tpPips : entryPrice - tpPips;
  const sl = isLong ? entryPrice - slPips : entryPrice + slPips;

  let outcome_hit_tp = -1, outcome_hit_sl = -1, bars_to_outcome = null;

  for (let i = 0; i < nextBars.length; i++) {
    const bar   = nextBars[i];
    const tpHit = isLong ? bar.h >= tp : bar.l <= tp;
    const slHit = isLong ? bar.l <= sl : bar.h >= sl;
    if (tpHit && slHit) {
      // Both hit same bar — conservative: SL wins
      outcome_hit_sl = 1; outcome_hit_tp = 0; bars_to_outcome = i + 1; break;
    }
    if (tpHit) { outcome_hit_tp = 1; outcome_hit_sl = 0; bars_to_outcome = i + 1; break; }
    if (slHit) { outcome_hit_sl = 1; outcome_hit_tp = 0; bars_to_outcome = i + 1; break; }
  }

  // Forward returns at fixed horizons (independent of SL/TP)
  const bars1d = getNextBars(barsByDate, sortedDates, di, 1, 390);   // ~6.5h = 1 session
  const bars5d = getNextBars(barsByDate, sortedDates, di, 1, 1950);  // 5 sessions
  const ret1d  = bars1d.length ? round4((bars1d[bars1d.length-1].c - entryPrice) / entryPrice) : null;
  const ret5d  = bars5d.length ? round4((bars5d[bars5d.length-1].c - entryPrice) / entryPrice) : null;

  return {
    entry_price: round2(entryPrice), outcome_hit_tp, outcome_hit_sl,
    forward_return_1d: ret1d, forward_return_5d: ret5d,
    bars_to_outcome, tp_pips_used: round2(tpPips), tp_method: tpMethod,
  };
}

// ── OI wall TP helper ─────────────────────────────────────────────────────────
// Finds the distance from entry to the nearest significant call wall (LONG)
// or put wall (SHORT) in the loaded OI store.  Returns null if unavailable.

function findOiWallDist(entryPrice, isLong, oiData) {
  if (!oiData) return null;

  // Gold OI can be stored under various symbol keys
  const goldOi = oiData['XAUUSD'] || oiData['XAU/USD'] || oiData['GOLD'] || null;
  if (!goldOi?.strikes?.length) return null;

  const { strikes, calls, puts } = goldOi;
  const wallOI  = isLong ? calls : puts;
  const maxOI   = Math.max(...wallOI);
  if (maxOI <= 0) return null;

  // Only consider strikes with OI above 20% of the peak — ignores thin strikes
  const threshold = maxOI * 0.20;

  let bestDist = Infinity;

  for (let i = 0; i < strikes.length; i++) {
    if ((wallOI[i] || 0) < threshold) continue;
    const s = strikes[i];
    if (isLong  && s > entryPrice) bestDist = Math.min(bestDist, s - entryPrice);
    if (!isLong && s < entryPrice) bestDist = Math.min(bestDist, entryPrice - s);
  }

  return bestDist === Infinity ? null : bestDist;
}

// ── 1m bar helpers ────────────────────────────────────────────────────────────

function buildBarsByDate(bars) {
  // Group 1m bars by YYYY-MM-DD (UTC date of timestamp)
  const map = {};
  for (const bar of bars) {
    const d = new Date(bar.ts).toISOString().slice(0, 10);
    if (!map[d]) map[d] = [];
    map[d].push(bar);
  }
  return map;
}

function getNextBars(barsByDate, sortedDates, currentDi, skipDays, maxBars) {
  const result = [];
  for (let d = currentDi + skipDays; d < sortedDates.length && result.length < maxBars; d++) {
    const dayBars = barsByDate[sortedDates[d]] || [];
    for (const bar of dayBars) {
      result.push(bar);
      if (result.length >= maxBars) break;
    }
  }
  return result;
}

function computeDailyAtr(barsByDate, date, sortedDates, di, period) {
  const closes = [];
  for (let d = Math.max(0, di - period - 1); d <= di; d++) {
    const dayBars = barsByDate[sortedDates[d]] || [];
    if (dayBars.length) {
      const dayClose = dayBars[dayBars.length - 1].c;
      const dayHigh  = Math.max(...dayBars.map(b => b.h));
      const dayLow   = Math.min(...dayBars.map(b => b.l));
      closes.push({ h: dayHigh, l: dayLow, c: dayClose });
    }
  }
  if (closes.length < 2) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const pc = closes[i-1].c;
    trs.push(Math.max(closes[i].h - closes[i].l,
                      Math.abs(closes[i].h - pc),
                      Math.abs(closes[i].l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length);
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcMomAccel(arr) {
  if (!arr || arr.length < 2) return { mom: null, accel: null };
  const n   = arr.length;
  const mom = arr[n-1].value - arr[n-2].value;
  if (arr.length < 3) return { mom, accel: null };
  const prevMom = arr[n-2].value - arr[n-3].value;
  return { mom, accel: mom - prevMom };
}

function calcZScore(arr, window) {
  if (!arr || arr.length < window) return null;
  const slice = arr.slice(-window).map(p => p.value);
  const mean  = slice.reduce((a, b) => a + b, 0) / window;
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window);
  if (std < 0.0001) return 0;
  return round3((slice[slice.length - 1] - mean) / std);
}

function inflection(mom, accel) {
  if (accel == null || mom == null) return 'UNKNOWN';
  if (mom > 0  && accel < -0.02) return 'BEARISH_EXHAUSTING';
  if (mom < 0  && accel >  0.02) return 'BULLISH_EXHAUSTING';
  return 'TRENDING';
}

// ── Simplified regime + scoring (mirrors gold-model.js logic) ─────────────────

function classifyRegime(tips, tipsMom, bei, beiMom, vix, hy) {
  if (vix != null && vix > 30) return 'CRISIS';
  if (hy  != null && hy  > 0.08) return 'CRISIS';
  if (tipsMom != null && tipsMom > 0.15) return 'AGGRESSIVE_TIGHTENING';
  if (beiMom  != null && beiMom  > 0.10 && tipsMom != null && beiMom > tipsMom * 1.5) return 'FISCAL_DOMINANCE';
  if (tips != null && tips < 0) return 'QE_EXPANSION';
  if (tips != null && tips > 1.5 && beiMom != null && beiMom > 0.05) return 'STAGFLATION';
  return 'NEUTRAL';
}

function regimeWeights(regime) {
  const W = {
    QE_EXPANSION:          { rl:0.10, rm:0.25, bl:0.15, bm:0.30, dm:0.15, sh:0.05 },
    AGGRESSIVE_TIGHTENING: { rl:0.10, rm:0.40, bl:0.05, bm:0.15, dm:0.25, sh:0.05 },
    CRISIS:                { rl:0.05, rm:0.15, bl:0.05, bm:0.10, dm:0.20, sh:0.45 },
    FISCAL_DOMINANCE:      { rl:0.10, rm:0.10, bl:0.25, bm:0.35, dm:0.15, sh:0.05 },
    STAGFLATION:           { rl:0.20, rm:0.30, bl:0.15, bm:0.15, dm:0.15, sh:0.05 },
    NEUTRAL:               { rl:0.20, rm:0.20, bl:0.15, bm:0.20, dm:0.15, sh:0.10 },
  };
  return W[regime] ?? W.NEUTRAL;
}

function scoreTipsLevel(v)  { if (v==null) return 0; if(v<0)return 1;if(v<0.5)return 0.6;if(v<1.5)return 0;if(v<2.5)return -0.6;return -1; }
function scoreBeiLevel(v)   { if (v==null) return 0; if(v<1.5)return -0.5;if(v<2.5)return 0;if(v<3)return 0.5;return 1; }
function scoreTipsMom(v)    { if (v==null) return 0; if(v<-0.15)return 1;if(v<-0.05)return 0.5;if(v<0.05)return 0;if(v<0.15)return -0.5;return -1; }
function scoreBeiMom(v)     { if (v==null) return 0; if(v>0.15)return 1;if(v>0.05)return 0.5;if(v>-0.05)return 0;if(v>-0.15)return -0.5;return -1; }
function scoreDxyMom(v)     { if (v==null) return 0; const pct=v; if(pct<-0.5)return 0.8;if(pct<-0.2)return 0.4;if(pct<0.2)return 0;if(pct<0.5)return -0.4;return -0.8; }
function scoreSafeHaven(vix,vChg,hy,hyChg) {
  if (vix==null && hy==null) return 0;
  let s=0;
  if (vix!=null) { if(vix>30)s+=0.8; else if(vix>20)s+=0.3; else if(vix<15)s-=0.2; }
  if (vChg!=null) { if(vChg>3)s+=0.3; else if(vChg<-3)s-=0.2; }
  if (hy!=null)  { if(hy>0.08)s+=0.4; else if(hy>0.05)s+=0.15; }
  return Math.max(-1, Math.min(1, s));
}

// ── Summary stats ─────────────────────────────────────────────────────────────

function computeStats(rows) {
  const directional = rows.filter(r => r.signal !== 'NEUTRAL' && r.outcome_hit_tp !== -1);
  if (!directional.length) return {};
  const wins   = directional.filter(r => r.outcome_hit_tp === 1).length;
  const winRate = round2(wins / directional.length);

  const byRegime = {};
  for (const r of directional) {
    if (!byRegime[r.regime]) byRegime[r.regime] = { w: 0, n: 0 };
    byRegime[r.regime].n++;
    if (r.outcome_hit_tp === 1) byRegime[r.regime].w++;
  }
  for (const k of Object.keys(byRegime)) {
    byRegime[k].win_rate = round2(byRegime[k].w / byRegime[k].n);
  }

  const byStrength = {};
  for (const r of directional) {
    if (!byStrength[r.strength]) byStrength[r.strength] = { w: 0, n: 0 };
    byStrength[r.strength].n++;
    if (r.outcome_hit_tp === 1) byStrength[r.strength].w++;
  }
  for (const k of Object.keys(byStrength)) {
    byStrength[k].win_rate = round2(byStrength[k].w / byStrength[k].n);
  }

  const byTpMethod = {};
  for (const r of directional) {
    const m = r.tp_method || 'atr';
    if (!byTpMethod[m]) byTpMethod[m] = { w: 0, n: 0 };
    byTpMethod[m].n++;
    if (r.outcome_hit_tp === 1) byTpMethod[m].w++;
  }
  for (const k of Object.keys(byTpMethod)) {
    byTpMethod[k].win_rate = round2(byTpMethod[k].w / byTpMethod[k].n);
  }

  return { total: rows.length, directional: directional.length, wins, winRate, byRegime, byStrength, byTpMethod };
}

// ── CSV generator ─────────────────────────────────────────────────────────────

function generateCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]).filter(k => k !== 'entryPrice');
  // Move entry_price in
  cols.push('entry_price');
  const header = cols.join(',');
  const lines  = rows.map(r => cols.map(c => {
    const v = c === 'entry_price' ? r.entry_price : r[c];
    return v == null ? '' : String(v);
  }).join(','));
  return header + '\n' + lines.join('\n');
}

// ── Rounding helpers ──────────────────────────────────────────────────────────
const round2 = v => v != null ? Math.round(v * 100)    / 100    : null;
const round3 = v => v != null ? Math.round(v * 1000)   / 1000   : null;
const round4 = v => v != null ? Math.round(v * 10000)  / 10000  : null;
