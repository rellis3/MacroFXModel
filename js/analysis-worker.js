// ══════════════════════════════════════════════════════════════════════════════
// analysis-worker.js — Deep statistical analysis engine for Asia/Monday model
// Runs as a Web Worker. Processes M5+M30 CSV bars, detects confluence levels,
// records 15+ features per touch, aggregates statistics for the analysis page.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Fib extensions projected from Asia range ─────────────────────────────────
const FEXT = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

// ─── Kill zone windows (London time, hours) ───────────────────────────────────
const KILL_ZONES = [
  { id: 'asia_close',   label: 'Asia Close (05–07)',  h0: 5,  h1: 7  },
  { id: 'london_open',  label: 'London Open (07–10)', h0: 7,  h1: 10 },
  { id: 'london_mid',   label: 'London Mid (10–13)',  h0: 10, h1: 13 },
  { id: 'ny_open',      label: 'NY Open (13–16)',     h0: 13, h1: 16 },
  { id: 'ny_mid',       label: 'NY Mid (16–20)',      h0: 16, h1: 20 },
];

// ─── Correlated pairs for SMT divergence ─────────────────────────────────────
const SMT_MAP = {
  EURUSD: 'GBPUSD', GBPUSD: 'EURUSD',
  USDJPY: 'GBPJPY', GBPJPY: 'USDJPY',
  AUDUSD: 'NZDUSD', NZDUSD: 'AUDUSD',
};

// ─── State ────────────────────────────────────────────────────────────────────
const _bars = {}; // { [symbol]: { m1:[], m5:[], m30:[] } }

// ─── Entry point ──────────────────────────────────────────────────────────────
self.onmessage = ({ data }) => {
  const { type, payload } = data;
  if (type === 'parse') handleParse(payload);
  if (type === 'run')   handleRun(payload);
  if (type === 'reset') { Object.keys(_bars).forEach(k => delete _bars[k]); }
};

// ══════════════════════════════════════════════════════════════════════════════
// CSV PARSING
// ══════════════════════════════════════════════════════════════════════════════
function handleParse({ symbol, tf, text }) {
  const rows = text.split('\n');
  const bars = [];
  for (const row of rows) {
    const p = row.split(',');
    if (p.length < 5) continue;
    const ts = parseInt(p[0], 10);
    if (!isFinite(ts) || ts < 1_000_000_000_000) continue; // require ms timestamp
    const o = +p[1], h = +p[2], l = +p[3], c = +p[4];
    if (!isFinite(o) || h < l) continue;
    bars.push({ ts, o, h, l, c, ...londonTime(ts) });
  }
  bars.sort((a, b) => a.ts - b.ts);
  if (!_bars[symbol]) _bars[symbol] = {};
  _bars[symbol][tf] = bars;
  self.postMessage({ type: 'parsed', symbol, tf, count: bars.length });
}

// ══════════════════════════════════════════════════════════════════════════════
// LONDON TIME (handles UK DST: last Sun Mar → last Sun Oct)
// ══════════════════════════════════════════════════════════════════════════════
function londonTime(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const dst0 = lastSundayMs(y, 2) + 3_600_000; // Last Sun Mar 01:00 UTC
  const dst1 = lastSundayMs(y, 9) + 3_600_000; // Last Sun Oct 01:00 UTC
  const off  = (ms >= dst0 && ms < dst1) ? 3_600_000 : 0;
  const t    = new Date(ms + off);
  return {
    lDate:  t.toISOString().slice(0, 10),
    lHour:  t.getUTCHours(),
    lMin:   t.getUTCMinutes(),
    lDay:   t.getUTCDay(),       // 0=Sun…6=Sat
    lMonth: t.getUTCMonth(),     // 0–11
    lYear:  t.getUTCFullYear(),
  };
}
function lastSundayMs(y, m) {
  const d = new Date(Date.UTC(y, m + 1, 0)); // last day of month
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function getPip(sym) {
  if (sym.includes('JPY')) return 0.01;
  if (sym === 'XAUUSD')    return 0.1;
  return 0.0001;
}

function groupByDate(bars) {
  const m = {};
  for (const b of bars) {
    (m[b.lDate] ??= []).push(b);
  }
  return m;
}

// Rolling daily ATR (14-day average true range, price units)
function rollingATR(dayHigh, dayLow, prevClose, atrBuf) {
  const tr = prevClose != null
    ? Math.max(dayHigh - dayLow, Math.abs(dayHigh - prevClose), Math.abs(dayLow - prevClose))
    : dayHigh - dayLow;
  atrBuf.push(tr);
  if (atrBuf.length > 14) atrBuf.shift();
  return atrBuf.reduce((s, v) => s + v, 0) / atrBuf.length;
}

// Fib levels: project from Asia range in both directions
function genFibs(asiaH, asiaL) {
  const range = asiaH - asiaL;
  const out = [];
  for (const f of FEXT) {
    out.push({ fib: f,  price: asiaH + range * f, side: 'resist' }); // above → short
    out.push({ fib: -f, price: asiaL - range * f, side: 'support' }); // below → long
  }
  return out;
}

// Confluence: today's Fib within tolerance of yesterday's Fib
function detectConfluences(todayFibs, prevFibs, tolPrice) {
  const raw = [];
  for (const t of todayFibs) {
    for (const p of prevFibs) {
      const dist = Math.abs(t.price - p.price);
      if (dist <= tolPrice) {
        raw.push({ price: (t.price + p.price) / 2, todayFib: t.fib, prevFib: p.fib, side: t.side, dist });
      }
    }
  }
  // Merge clusters within 0.5 × tolPrice
  const merged = [];
  for (const r of raw.sort((a, b) => a.price - b.price)) {
    const existing = merged.find(m => Math.abs(m.price - r.price) < tolPrice * 0.5);
    if (existing) {
      existing.density++;
      existing.isTight = existing.isTight || r.dist < tolPrice * 0.2;
    } else {
      merged.push({ ...r, density: 1, isTight: r.dist < tolPrice * 0.2 });
    }
  }
  return merged;
}

function getKillZone(hour) {
  return KILL_ZONES.find(z => hour >= z.h0 && hour < z.h1)?.id ?? 'off_peak';
}

// Near X.X000 or X.X500 (50-pip round numbers for FX; 1-pip for JPY/Gold)
function isNearRound(price, pip) {
  const inPips = Math.round(price / pip);
  return inPips % 50 < 8 || inPips % 50 > 42;
}

// Monday of the week (for weekly open tracking)
function weekMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Rank of value in a sorted array → 0–1 percentile
function pct(sorted, val) {
  if (sorted.length < 2) return 0.5;
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < val) lo = mid + 1; else hi = mid;
  }
  return lo / (sorted.length - 1);
}

// ══════════════════════════════════════════════════════════════════════════════
// TRADE SIMULATION  (uses M5 bars from touch bar onwards)
// Returns { result, r, mfe, mae } or null if no exit found
// ══════════════════════════════════════════════════════════════════════════════
function simulateTrade(bars5, touchIdx, level, dir, atrPrice, pip, slMult, rrRatio) {
  const slDist = atrPrice * slMult;
  const tpDist = slDist * rrRatio;
  if (slDist <= 0) return null;
  const sl = dir === 'long' ? level - slDist : level + slDist;
  const tp = dir === 'long' ? level + tpDist : level - tpDist;
  let mfe = 0, mae = 0;

  for (let i = touchIdx + 1; i < bars5.length; i++) {
    const b = bars5[i];
    const fav = dir === 'long' ? (b.h - level) / pip : (level - b.l) / pip;
    const adv = dir === 'long' ? (level - b.l) / pip : (b.h - level) / pip;
    if (fav > mfe) mfe = fav;
    if (adv > mae) mae = adv;

    if (dir === 'long') {
      if (b.l <= sl) return { result: 'sl', r: -1,      mfe, mae };
      if (b.h >= tp) return { result: 'tp', r: rrRatio, mfe, mae };
    } else {
      if (b.h >= sl) return { result: 'sl', r: -1,      mfe, mae };
      if (b.l <= tp) return { result: 'tp', r: rrRatio, mfe, mae };
    }
    if (b.lHour >= 20) {
      const eod = (dir === 'long' ? b.c - level : level - b.c) / slDist;
      return { result: 'eod', r: Math.max(-1, Math.min(rrRatio, eod)), mfe, mae };
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE: Judas swing (session open swept prev session extreme before touch)
// ══════════════════════════════════════════════════════════════════════════════
function detectJudas(barsBeforeTouch, prevHigh, prevLow, pip) {
  if (!prevHigh || !prevLow) return false;
  const sweep = 3 * pip;
  return barsBeforeTouch.some(b => b.h > prevHigh + sweep || b.l < prevLow - sweep);
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE: SMT divergence at time of touch
// Primary makes a new session high/low that the correlated pair does NOT match
// ══════════════════════════════════════════════════════════════════════════════
function detectSMT(primaryBars, corBars, touchTs, dir) {
  if (!corBars?.length) return 'na';
  const pri = primaryBars.filter(b => b.ts <= touchTs).slice(-24);
  const cor = corBars.filter(b => b.ts <= touchTs).slice(-24);
  if (pri.length < 6 || cor.length < 6) return 'na';
  const priH = Math.max(...pri.map(b => b.h)), priL = Math.min(...pri.map(b => b.l));
  const corH = Math.max(...cor.map(b => b.h)), corL = Math.min(...cor.map(b => b.l));
  // Divergence: one makes extreme the other doesn't (normalised — ignore scale diffs)
  if (dir === 'short') return corH > priH ? 'confirmed' : 'absent';
  if (dir === 'long')  return corL < priL ? 'confirmed' : 'absent';
  return 'na';
}

// ══════════════════════════════════════════════════════════════════════════════
// LEVEL FRESHNESS — days since this price zone was last tested
// ══════════════════════════════════════════════════════════════════════════════
function freshnessLabel(daysSince) {
  if (daysSince >= 7)  return 'fresh_7d+';
  if (daysSince >= 4)  return 'fresh_4_7d';
  if (daysSince >= 2)  return 'recent_2_3d';
  return 'retested_1d';
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS RUNNER
// ══════════════════════════════════════════════════════════════════════════════
function handleRun({ symbols, cfg }) {
  const allTouches = [];
  for (let si = 0; si < symbols.length; si++) {
    const sym = symbols[si];
    self.postMessage({ type: 'progress', pct: Math.round(si / symbols.length * 85), label: `Analysing ${sym}…` });
    allTouches.push(...analyzeSymbol(sym, cfg));
  }
  self.postMessage({ type: 'progress', pct: 92, label: 'Aggregating statistics…' });
  const stats = aggregateStats(allTouches);
  self.postMessage({ type: 'done', stats, totalTouches: allTouches.length });
}

// ══════════════════════════════════════════════════════════════════════════════
// PER-SYMBOL ANALYSIS LOOP
// ══════════════════════════════════════════════════════════════════════════════
function analyzeSymbol(symbol, cfg) {
  const pip    = getPip(symbol);
  const bars30 = _bars[symbol]?.m30 || [];
  const bars5  = _bars[symbol]?.m5  || [];
  if (bars30.length < 200 || bars5.length < 200) return [];

  const by30 = groupByDate(bars30);
  const by5  = groupByDate(bars5);
  const smtSym = SMT_MAP[symbol];
  const smtBy5 = smtSym ? groupByDate(_bars[smtSym]?.m5 || []) : {};

  const dates = Object.keys(by30)
    .filter(d => d >= (cfg.startDate || '2020-01-01') && d <= (cfg.endDate || '2099-01-01'))
    .sort();

  // Rolling history buffers
  const atrBuf        = [];   // for 14-day ATR
  const atrHistory    = [];   // sorted, for percentile
  const asiaHistory   = [];   // sorted Asia range pips
  const levelTested   = {};   // { priceBucket: lastDate } for freshness
  const monthlyOpens  = {};
  const weeklyOpens   = {};

  let prevFibs     = [];
  let prevDayHigh  = null;
  let prevDayLow   = null;
  let prevDayClose = null;
  const touches    = [];

  const slMult  = cfg.slMult  ?? 1.5;
  const rrRatio = cfg.rrRatio ?? 2.0;
  const tolPips = cfg.confTolPips ?? 2;

  for (const date of dates) {
    const d30 = by30[date];
    const d5  = by5[date] || [];
    if (!d30?.length) continue;
    const dow = d30[0].lDay;
    if (dow === 0 || dow === 6) continue; // skip weekends

    // ── Asia range (00:00–06:00 London) ─────────────────────────────────────
    const asia = d30.filter(b => b.lHour >= 0 && b.lHour < 6);
    if (asia.length < 2) { prevFibs = []; continue; }
    const asiaH = Math.max(...asia.map(b => b.h));
    const asiaL = Math.min(...asia.map(b => b.l));
    const asiaRangePips = (asiaH - asiaL) / pip;

    // Asia range percentile (vs trailing 90 sessions)
    const asiaSorted = [...asiaHistory].sort((a, b) => a - b);
    const asiaRankPct = pct(asiaSorted, asiaRangePips);
    const asiaSize = asiaRankPct < 0.33 ? 'tight' : asiaRankPct < 0.67 ? 'normal' : 'wide';
    asiaHistory.push(asiaRangePips);
    if (asiaHistory.length > 90) asiaHistory.shift();

    // ── Day ATR (14-day rolling, price units) ──────────────────────────────
    const dayH = Math.max(...d30.map(b => b.h));
    const dayL = Math.min(...d30.map(b => b.l));
    const dayC = d30[d30.length - 1].c;
    const atrPrice = rollingATR(dayH, dayL, prevDayClose, atrBuf);

    const atrSorted = [...atrHistory].sort((a, b) => a - b);
    const atrRankPct = pct(atrSorted, atrPrice);
    const atrRegime = atrRankPct < 0.33 ? 'low' : atrRankPct < 0.67 ? 'mid' : 'high';
    atrHistory.push(atrPrice);
    if (atrHistory.length > 90) atrHistory.shift();

    // ATR sequence: is current ATR expanding or contracting vs 3 days ago?
    const last3atr = atrHistory.slice(-3);
    const atrSeq = last3atr.length >= 2
      ? last3atr.at(-1) > last3atr[0] ? 'expanding' : 'contracting'
      : 'neutral';

    // ── Reference levels for bias ─────────────────────────────────────────
    const monthKey  = date.slice(0, 7);
    const weekKey   = weekMonday(date);
    if (!(monthKey in monthlyOpens)) monthlyOpens[monthKey] = d30[0].o;
    if (!(weekKey  in weeklyOpens))  weeklyOpens[weekKey]   = d30[0].o;
    const monthOpen = monthlyOpens[monthKey];
    const weekOpen  = weeklyOpens[weekKey];

    // ── Confluence detection ──────────────────────────────────────────────
    const todayFibs = genFibs(asiaH, asiaL);
    const confs     = detectConfluences(todayFibs, prevFibs, tolPips * pip);

    // Entry window: M5 bars 08:00–20:00
    const entryBars = d5.filter(b => b.lHour >= 8 && b.lHour < 20);
    const smtBarsDay = smtBy5[date] || [];

    // ── Scan touches per confluence level ─────────────────────────────────
    for (const conf of confs) {
      const level = conf.price;
      if (level <= 0) continue;
      const dir  = conf.side === 'resist' ? 'short' : 'long';

      // Round number
      const isRound = isNearRound(level, pip);

      // Previous session extreme match (within 10 pips)
      const prevMatch = prevDayHigh != null
        && (Math.abs(level - prevDayHigh) < 10 * pip || Math.abs(level - prevDayLow) < 10 * pip);

      // Level freshness: days since this price bucket was last tested
      const bucket = String(Math.round(level / (10 * pip))); // 10-pip bucket key
      const lastTestedDate = levelTested[bucket];
      let daysSince = 999;
      if (lastTestedDate) {
        daysSince = Math.round((new Date(date) - new Date(lastTestedDate)) / 86_400_000);
      }
      const freshness = freshnessLabel(daysSince);

      let lastTouchBi = -99;
      for (let bi = 0; bi < entryBars.length; bi++) {
        const bar = entryBars[bi];
        if (bi - lastTouchBi < 3) continue; // 3-bar cooldown between touches
        if (bar.l > level || bar.h < level) continue; // not touching level

        // ── Features ─────────────────────────────────────────────────────
        const kz = getKillZone(bar.lHour);

        // Judas: price swept prev session extreme before this touch
        const prior24 = entryBars.slice(Math.max(0, bi - 24), bi);
        const judas   = detectJudas(prior24, prevDayHigh, prevDayLow, pip);

        // Approach direction (last 6 bars before touch)
        const prev6    = entryBars.slice(Math.max(0, bi - 6), bi);
        const appFrom  = prev6.length ? (prev6[0].c > level ? 'above' : 'below') : 'unknown';
        const correctApproach = (dir === 'short' && appFrom === 'below') ||
                                (dir === 'long'  && appFrom === 'above');

        // Premium / discount (price vs weekly open)
        const premDisc = bar.c >= weekOpen ? 'premium' : 'discount';
        const biasOk   = (dir === 'short' && premDisc === 'premium') ||
                         (dir === 'long'  && premDisc === 'discount');

        // Monthly open alignment
        const monthBias = ((dir === 'short') === (bar.c > monthOpen)) ? 'aligned' : 'counter';

        // SMT divergence
        const smt = detectSMT(entryBars, smtBarsDay, bar.ts, dir);

        // ── Trade simulation ──────────────────────────────────────────────
        const trade = simulateTrade(entryBars, bi, level, dir, atrPrice, pip, slMult, rrRatio);
        if (!trade) { lastTouchBi = bi; continue; }

        // Update freshness tracker on successful touch
        levelTested[bucket] = date;

        touches.push({
          symbol,
          date,
          year:      String(bar.lYear),
          quarter:   `${bar.lYear} Q${Math.ceil((bar.lMonth + 1) / 3)}`,
          month:     monthKey,
          dow,                      // 1=Mon…5=Fri
          dowLabel:  ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', '', ''][dow],
          hour:      bar.lHour,
          kz,
          fibLabel:  fibLabel(conf.todayFib),
          isTight:   conf.isTight,
          density:   Math.min(conf.density, 3),
          asiaSize,
          atrRegime,
          atrSeq,
          isRound,
          prevMatch,
          freshness,
          judas,
          approach:  correctApproach ? 'correct' : 'counter',
          premDisc,
          biasOk,
          monthBias,
          smt,
          result:    trade.result,
          r:         trade.r,
          mfe:       trade.mfe,
          mae:       trade.mae,
        });
        lastTouchBi = bi;
      }
    }

    // ── Advance state ─────────────────────────────────────────────────────
    prevFibs     = todayFibs;
    prevDayHigh  = dayH;
    prevDayLow   = dayL;
    prevDayClose = dayC;
  }
  return touches;
}

function fibLabel(f) {
  if (f === 0) return '0 (range edge)';
  const n = Math.abs(f);
  return `${f > 0 ? '+' : '-'}${n} ext`;
}

// ══════════════════════════════════════════════════════════════════════════════
// STATISTICS AGGREGATION
// ══════════════════════════════════════════════════════════════════════════════
function summarise(ts) {
  if (!ts.length) return { n: 0, winRate: 0, avgR: 0, totalR: 0, avgMfe: 0, avgMae: 0, wins: 0, losses: 0, eods: 0 };
  const n      = ts.length;
  const wins   = ts.filter(t => t.result === 'tp').length;
  const losses = ts.filter(t => t.result === 'sl').length;
  const eods   = ts.filter(t => t.result === 'eod').length;
  const totalR = ts.reduce((s, t) => s + t.r, 0);
  const avgMfe = ts.reduce((s, t) => s + (t.mfe ?? 0), 0) / n;
  const avgMae = ts.reduce((s, t) => s + (t.mae ?? 0), 0) / n;
  return { n, wins, losses, eods, winRate: wins / n, avgR: totalR / n, totalR, avgMfe, avgMae };
}

function bucket(touches, key) {
  const m = {};
  for (const t of touches) {
    const k = String(t[key] ?? 'unknown');
    (m[k] ??= []).push(t);
  }
  return Object.fromEntries(Object.entries(m).map(([k, ts]) => [k, summarise(ts)]));
}

function aggregateStats(touches) {
  if (!touches.length) return { empty: true };
  const baseline = summarise(touches);

  // Feature impact: for each binary/categorical feature, compute delta vs baseline
  function impact(key, valA, labelA, valB, labelB) {
    const a = touches.filter(t => t[key] === valA);
    const b = touches.filter(t => t[key] === valB);
    return {
      [labelA]: { ...summarise(a), deltaR: summarise(a).avgR - baseline.avgR },
      [labelB]: { ...summarise(b), deltaR: summarise(b).avgR - baseline.avgR },
    };
  }

  // Top combinations (minimum 10 trades)
  const comboMap = {};
  for (const t of touches) {
    const k = [t.kz, t.isTight ? 'tight' : 'normal', t.approach, t.premDisc, t.atrRegime].join('|');
    (comboMap[k] ??= []).push(t);
  }
  const topCombos = Object.entries(comboMap)
    .map(([k, ts]) => ({ combo: k, parts: k.split('|'), ...summarise(ts) }))
    .filter(c => c.n >= 10)
    .sort((a, b) => b.avgR - a.avgR)
    .slice(0, 20);

  // Worst combinations (most negative avgR)
  const worstCombos = [...Object.entries(comboMap)
    .map(([k, ts]) => ({ combo: k, parts: k.split('|'), ...summarise(ts) }))
    .filter(c => c.n >= 10)]
    .sort((a, b) => a.avgR - b.avgR)
    .slice(0, 10);

  return {
    baseline,
    bySymbol:    bucket(touches, 'symbol'),
    byYear:      bucket(touches, 'year'),
    byQuarter:   bucket(touches, 'quarter'),
    byDow:       bucket(touches, 'dowLabel'),
    byHour:      bucket(touches, 'hour'),
    byKz:        bucket(touches, 'kz'),
    byFib:       bucket(touches, 'fibLabel'),
    byTight:     bucket(touches, 'isTight'),
    byDensity:   bucket(touches, 'density'),
    byAsiaSize:  bucket(touches, 'asiaSize'),
    byAtrRegime: bucket(touches, 'atrRegime'),
    byAtrSeq:    bucket(touches, 'atrSeq'),
    byApproach:  bucket(touches, 'approach'),
    byPremDisc:  bucket(touches, 'premDisc'),
    byBiasOk:    bucket(touches, 'biasOk'),
    byMonthBias: bucket(touches, 'monthBias'),
    byJudas:     bucket(touches, 'judas'),
    byRound:     bucket(touches, 'isRound'),
    byPrevMatch: bucket(touches, 'prevMatch'),
    bySmt:       bucket(touches, 'smt'),
    byFreshness: bucket(touches, 'freshness'),
    topCombos,
    worstCombos,
    totalTouches: touches.length,
  };
}
