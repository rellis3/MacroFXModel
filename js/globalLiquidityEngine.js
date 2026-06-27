/*
 * globalLiquidityEngine.js — pure-JS port of the GlobalLiquidity macro FX system.
 *
 * Runs entirely in the browser (or Node) — NO Python, no server compute. Feed it
 * the FRED history payload from /api/fredhistory and it returns a live snapshot:
 *   - Global Liquidity Index: level, 13-week impulse, cycle position, per-ccy impulse
 *   - Regime: 4-state classifier + Macro Alf risk gate
 *   - Target FX book: cross-sectional liquidity-impulse ranking
 *
 * Mirrors the Python package in GlobalLiquidity/ (gli.py / regime.py / ranker.py).
 * Every transform is strictly causal (trailing windows only) so the numbers a
 * phone shows are the numbers a backtest would have produced at that date.
 *
 * Works as a browser global (window.GLIEngine) and a CommonJS module (Node tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GLIEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Config (mirrors GlobalLiquidity/config.py) ────────────────────────────
  const CFG = {
    Z_WINDOW: 156, MIN_Z: 26,            // weeks
    IMPULSE_LOOKBACK: 13, IMPULSE_SMOOTH: 4,
    CYCLE_LENGTH: 282,
    PUB_LAG: { cb: 2, growth: 3, credit: 1, vol: 1 },  // publication lags (weeks)
    SHADOW_TILT_WEIGHT: 0.25,
    GLI_WEIGHTS: { USD: 0.35, CNY: 0.25, EUR: 0.20, JPY: 0.15, GBP: 0.05 },
    RISK_GATE: { creditZ: 1.0, volZ: 1.25, grossCut: 0.40 },
    RANKER: { longN: 3, shortN: 3, buffer: 0.25 },
    CCY_BETA: { USD: -0.6, EUR: 0.2, GBP: 0.2, JPY: -0.8, CHF: -0.8,
                AUD: 0.9, NZD: 0.9, CAD: 0.6, XAU: 0.7 },
    PAIRS: ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCAD','USDCHF',
            'EURGBP','EURJPY','EURCHF','EURCAD','EURAUD','EURNZD',
            'GBPJPY','GBPCHF','GBPAUD','GBPCAD','GBPNZD',
            'AUDJPY','AUDNZD','AUDCAD','AUDCHF','NZDJPY','CADJPY','CHFJPY','XAUUSD'],
  };

  // FRED short-keys (must match the worker /api/fredhistory ALL_SERIES map).
  const KEYS = ['walcl','tga','rrp','ecb_assets','boj_assets','cny_res',
                'dexuseu','dexjpus','dexusuk','dexchus',
                'sofr','iorb','hy','dxy','bei','tips','vix','indpro'];

  const REGIMES = {
    REFLATION:       { tilt: 1.0,  vol: 'short vol / carry' },
    RECOVERY:        { tilt: 0.5,  vol: 'neutral' },
    GOLDILOCKS_LATE: { tilt: 0.0,  vol: 'buy convexity' },
    DEFLATION:       { tilt: -1.0, vol: 'long vol' },
  };

  // ── Causal math helpers (mirror mathx.py) ─────────────────────────────────
  const isNum = (x) => typeof x === 'number' && !isNaN(x);

  function ffill(a) {
    const out = a.slice(); let last = NaN;
    for (let i = 0; i < out.length; i++) {
      if (!isNum(out[i])) out[i] = last; else last = out[i];
    }
    return out;
  }
  function lag(a, k) {
    if (k <= 0) return a.slice();
    const out = new Array(a.length).fill(NaN);
    for (let i = k; i < a.length; i++) out[i] = a[i - k];
    return out;
  }
  function sma(a, win) {
    const out = new Array(a.length).fill(NaN);
    for (let i = 0; i < a.length; i++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - win + 1); j <= i; j++) if (isNum(a[j])) { s += a[j]; n++; }
      if (n) out[i] = s / n;
    }
    return out;
  }
  function rollingZ(a, win, minP) {
    const out = new Array(a.length).fill(NaN);
    for (let i = 0; i < a.length; i++) {
      const seg = [];
      for (let j = Math.max(0, i - win + 1); j <= i; j++) if (isNum(a[j])) seg.push(a[j]);
      if (seg.length >= minP) {
        const mu = seg.reduce((s, v) => s + v, 0) / seg.length;
        const sd = Math.sqrt(seg.reduce((s, v) => s + (v - mu) ** 2, 0) / (seg.length - 1));
        out[i] = sd > 1e-12 ? (a[i] - mu) / sd : 0;
      }
    }
    return out;
  }
  function roc(a, k) {
    const out = new Array(a.length).fill(NaN);
    for (let i = k; i < a.length; i++) if (isNum(a[i]) && isNum(a[i - k])) out[i] = a[i] - a[i - k];
    return out;
  }
  const z0 = (a) => a.map((v) => (isNum(v) ? v : 0));
  const last = (a) => { for (let i = a.length - 1; i >= 0; i--) if (isNum(a[i])) return a[i]; return NaN; };

  function splitPair(p) { return p === 'XAUUSD' ? ['XAU', 'USD'] : [p.slice(0, 3), p.slice(3)]; }

  // ── Align an /api/fredhistory payload to a common weekly grid ──────────────
  // payload: { key: [{date, value}, ...] ascending }. Returns { dates, series }.
  function alignWeekly(payload) {
    let minT = Infinity, maxT = -Infinity;
    for (const k of KEYS) {
      const arr = payload[k];
      if (Array.isArray(arr) && arr.length) {
        minT = Math.min(minT, +new Date(arr[0].date));
        maxT = Math.max(maxT, +new Date(arr[arr.length - 1].date));
      }
    }
    if (!isFinite(minT)) return { dates: [], series: {} };
    const WEEK = 7 * 864e5;
    const dates = [];
    for (let t = minT; t <= maxT; t += WEEK) dates.push(new Date(t).toISOString().slice(0, 10));

    const series = {};
    for (const k of KEYS) {
      const arr = (payload[k] || []).map((o) => [+new Date(o.date), o.value]);
      const col = new Array(dates.length).fill(NaN);
      let j = 0, lastV = NaN;
      for (let i = 0; i < dates.length; i++) {
        const t = +new Date(dates[i]);
        while (j < arr.length && arr[j][0] <= t) { lastV = arr[j][1]; j++; }
        col[i] = lastV;
      }
      series[k] = col;
    }
    return { dates, series };
  }

  // ── GLI nowcast ───────────────────────────────────────────────────────────
  function computeGLI(dates, S) {
    const Z = CFG.Z_WINDOW, M = CFG.MIN_Z, n = dates.length;
    const blank = () => new Array(n).fill(NaN);

    // Per-block USD liquidity → z and impulse.
    const blocks = {
      USD: () => { const w = ffill(S.walcl), t = ffill(S.tga), r = ffill(S.rrp);
                   return w.map((v, i) => (isNum(v) ? v : 0) - (isNum(t[i]) ? t[i] : 0) - (isNum(r[i]) ? r[i] : 0)); },
      EUR: () => { const a = ffill(S.ecb_assets), fx = ffill(S.dexuseu);
                   return a.map((v, i) => v * (isNum(fx[i]) ? fx[i] : NaN)); },
      JPY: () => { const a = ffill(S.boj_assets), fx = ffill(S.dexjpus);
                   return a.map((v, i) => v * (isNum(fx[i]) && fx[i] > 0 ? 1 / fx[i] : NaN)); },
      // GBP omitted: no clean BoE balance-sheet series on FRED. The ranker falls
      // back to GBP's beta-to-global-impulse proxy (config CCY_BETA), and the
      // 0.05 GLI weight is simply renormalised across the remaining blocks.
      CNY: () => { const a = ffill(S.cny_res), fx = ffill(S.dexchus);
                   return a.map((v, i) => v * (isNum(fx[i]) && fx[i] > 0 ? 1 / fx[i] : NaN)); },
    };

    const perCcyImpulse = {}, perCcyLevelZ = {};
    for (const ck of Object.keys(blocks)) {
      const usd = lag(blocks[ck](), CFG.PUB_LAG.cb);
      perCcyLevelZ[ck] = rollingZ(usd, Z, M);
      perCcyImpulse[ck] = rollingZ(roc(sma(usd, CFG.IMPULSE_SMOOTH), CFG.IMPULSE_LOOKBACK), Z, M);
    }

    // Aggregate z across blocks.
    let wsum = 0; const agg = new Array(n).fill(0);
    for (const [ck, w] of Object.entries(CFG.GLI_WEIGHTS)) {
      if (perCcyLevelZ[ck]) { const zc = z0(perCcyLevelZ[ck]); for (let i = 0; i < n; i++) agg[i] += w * zc[i]; wsum += w; }
    }
    if (wsum > 0) for (let i = 0; i < n; i++) agg[i] /= wsum;

    // Shadow / private liquidity tilt.
    const repo = lag(ffill(S.sofr).map((v, i) => v - (isNum(ffill(S.iorb)[i]) ? ffill(S.iorb)[i] : 0)), CFG.PUB_LAG.credit);
    const repoZ = rollingZ(repo, Z, M).map((v) => -v);
    const creditZ = rollingZ(lag(ffill(S.hy), CFG.PUB_LAG.credit), Z, M).map((v) => -v);
    const dollarZ = rollingZ(lag(ffill(S.dxy), CFG.PUB_LAG.credit), Z, M).map((v) => -v);
    const shadow = new Array(n);
    for (let i = 0; i < n; i++) shadow[i] = ((isNum(repoZ[i]) ? repoZ[i] : 0) + (isNum(creditZ[i]) ? creditZ[i] : 0) + (isNum(dollarZ[i]) ? dollarZ[i] : 0)) / 3;

    const blended = new Array(n);
    for (let i = 0; i < n; i++) blended[i] = (1 - CFG.SHADOW_TILT_WEIGHT) * agg[i] + CFG.SHADOW_TILT_WEIGHT * shadow[i];

    const level = rollingZ(blended, Z, M);
    const impulse = rollingZ(roc(sma(level, CFG.IMPULSE_SMOOTH), CFG.IMPULSE_LOOKBACK), Z, M);
    const cycle = cyclePosition(level);

    return { dates, level, impulse, cycle, perCcyImpulse };
  }

  function cyclePosition(levelZ) {
    const sm = sma(levelZ, 8), slope = roc(sm, 8);
    return sm.map((v, i) => {
      if (!isNum(v)) return NaN;
      const lvl = Math.max(-1, Math.min(1, v / 3));
      const slp = Math.max(-1, Math.min(1, (isNum(slope[i]) ? slope[i] : 0) * 5 / 3));
      let ph = Math.atan2(-slp, lvl) / (2 * Math.PI);
      return ((ph % 1) + 1) % 1;
    });
  }

  // ── Regime + risk gate ─────────────────────────────────────────────────────
  function classify(dates, S, gli) {
    const Z = CFG.Z_WINDOW, M = CFG.MIN_Z, n = dates.length;
    // Growth nowcast: z-score of INDPRO year-on-year (monthly, current on FRED;
    // ISM/NAPM is discontinued so it's not used client-side).
    const growthZ = rollingZ(lag(roc(ffill(S.indpro), 52), CFG.PUB_LAG.growth), Z, M);
    const creditZ = rollingZ(lag(ffill(S.hy), CFG.PUB_LAG.credit), Z, M);
    const volZ = rollingZ(lag(ffill(S.vix), CFG.PUB_LAG.vol), Z, M);

    const regime = [], tilt = new Array(n), conv = new Array(n), gate = new Array(n), grossMult = new Array(n);
    for (let i = 0; i < n; i++) {
      const imp = isNum(gli.impulse[i]) ? gli.impulse[i] : 0;
      const g = isNum(growthZ[i]) ? growthZ[i] : 0;
      let st = imp >= 0 ? (g >= 0 ? 'REFLATION' : 'RECOVERY') : (g >= 0 ? 'GOLDILOCKS_LATE' : 'DEFLATION');
      regime.push(st);
      tilt[i] = REGIMES[st].tilt;
      conv[i] = Math.tanh(Math.abs(imp)) * (0.5 + 0.5 * Math.tanh(Math.abs(g)));
      const cz = isNum(creditZ[i]) ? creditZ[i] : 0, vz = isNum(volZ[i]) ? volZ[i] : 0;
      const tripped = cz > CFG.RISK_GATE.creditZ || vz > CFG.RISK_GATE.volZ;
      gate[i] = tripped; grossMult[i] = tripped ? CFG.RISK_GATE.grossCut : 1;
      if (tripped) tilt[i] = Math.min(tilt[i], -0.5);
    }
    return { dates, regime, tilt, conviction: conv, gate, grossMult, growthZ, creditZ, volZ };
  }

  // ── Cross-sectional FX ranker ──────────────────────────────────────────────
  function ccyImpulse(gli, ccy, i) {
    if (gli.perCcyImpulse[ccy]) { const v = gli.perCcyImpulse[ccy][i]; return isNum(v) ? v : 0; }
    const gi = isNum(gli.impulse[i]) ? gli.impulse[i] : 0;
    return (CFG.CCY_BETA[ccy] || 0) * gi;
  }
  function buildBook(gli, reg, i) {
    const scored = CFG.PAIRS.map((p) => {
      const [b, q] = splitPair(p);
      return { pair: p, s: ccyImpulse(gli, b, i) - ccyImpulse(gli, q, i) };
    });
    const sorted = scored.slice().sort((a, b) => b.s - a.s);
    const longs = new Set(sorted.slice(0, CFG.RANKER.longN).map((x) => x.pair));
    const shorts = new Set(sorted.slice(-CFG.RANKER.shortN).map((x) => x.pair));
    const tilt = reg.tilt[i];
    let book = scored.map((x) => {
      let w = longs.has(x.pair) ? 1 : shorts.has(x.pair) ? -1 : 0;
      if (w > 0) w = 1 + 0.5 * tilt; else if (w < 0) w = -(1 - 0.5 * tilt);
      return { pair: x.pair, raw: w, score: x.s };
    });
    const gross = book.reduce((s, x) => s + Math.abs(x.raw), 0) || 1;
    const tradedBook = book.map((x) => ({ pair: x.pair, weight: x.raw / gross, score: x.score }))
                           .filter((x) => Math.abs(x.weight) > 1e-6)
                           .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    // Full cross-sectional ranking of ALL pairs (context, not all traded). Side
    // marks which extreme each pair sits in; rank is 1 = strongest long candidate.
    const ranking = sorted.map((x, idx) => ({
      pair: x.pair, score: round(x.s), rank: idx + 1,
      side: longs.has(x.pair) ? 'long' : shorts.has(x.pair) ? 'short' : 'flat',
    }));
    return { book: tradedBook, ranking };
  }

  // ── Top-level: payload → snapshot ──────────────────────────────────────────
  function run(payload) {
    const { dates, series } = alignWeekly(payload);
    if (!dates.length) return { error: 'no data', dates: [] };
    const gli = computeGLI(dates, series);
    const reg = classify(dates, series, gli);
    const i = dates.length - 1;
    const { book, ranking } = buildBook(gli, reg, i);
    const perCcy = {};
    Object.keys(gli.perCcyImpulse).forEach((k) => { perCcy[k] = round(last(gli.perCcyImpulse[k])); });
    for (const c of Object.keys(CFG.CCY_BETA)) if (!(c in perCcy)) perCcy[c] = round(ccyImpulse(gli, c, i));
    return {
      asOf: dates[i],
      weeks: dates.length,
      gli: { level: round(gli.level[i]), impulse: round(gli.impulse[i]),
             cycle: round(gli.cycle[i]), cyclePhase: phaseLabel(gli.cycle[i]), perCcy },
      regime: { state: reg.regime[i], vol: REGIMES[reg.regime[i]].vol,
                tilt: round(reg.tilt[i]), conviction: round(reg.conviction[i]),
                gate: reg.gate[i], grossMult: round(reg.grossMult[i]),
                growthZ: round(reg.growthZ[i]), creditZ: round(reg.creditZ[i]), volZ: round(reg.volZ[i]) },
      book,
      ranking,
      history: { level: gli.level, impulse: gli.impulse, dates },
    };
  }

  // ── Backtest primitive: book weights for EVERY week (same causal pipeline) ──
  // Returns dense per-week data so a backtester applies week t's book to week
  // t+1's returns. run() above is just the last week of this.
  function runHistory(payload) {
    const { dates, series } = alignWeekly(payload);
    if (!dates.length) return { error: 'no data', dates: [] };
    const gli = computeGLI(dates, series);
    const reg = classify(dates, series, gli);
    const m = CFG.PAIRS.length, idx = {};
    CFG.PAIRS.forEach((p, j) => { idx[p] = j; });
    const weights = [], regime = [], gate = [], grossMult = [], conviction = [], impulse = [];
    for (let i = 0; i < dates.length; i++) {
      const row = new Array(m).fill(0);
      const { book } = buildBook(gli, reg, i);            // identical to live
      book.forEach((b) => { row[idx[b.pair]] = b.weight; });
      weights.push(row);
      regime.push(reg.regime[i]); gate.push(reg.gate[i]); grossMult.push(reg.grossMult[i]);
      conviction.push(isNum(reg.conviction[i]) ? reg.conviction[i] : 0);
      impulse.push(isNum(gli.impulse[i]) ? gli.impulse[i] : 0);
    }
    return { dates, pairs: CFG.PAIRS.slice(), weights, regime, gate, grossMult, conviction, impulse };
  }

  function round(x) { return isNum(x) ? Math.round(x * 1000) / 1000 : null; }
  function phaseLabel(p) {
    if (!isNum(p)) return '—';
    if (p < 0.125 || p >= 0.875) return 'Peak';
    if (p < 0.375) return 'Falling';
    if (p < 0.625) return 'Trough';
    return 'Rising';
  }

  // ── Synthetic generator (offline demo / Node tests; mirrors data.py) ───────
  function synthetic(nWeeks = 500, seed = 7) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const L = CFG.CYCLE_LENGTH, t = Array.from({ length: nWeeks }, (_, i) => i);
    const phases = { USD: 0, EUR: 1.3, JPY: 2.6, GBP: 3.9, CNY: 5.2 }, speeds = { USD: 1, EUR: 0.9, JPY: 1.15, GBP: 1.05, CNY: 0.8 };
    const cyc = {};
    for (const c in phases) cyc[c] = t.map((i) => Math.sin(2 * Math.PI * i * speeds[c] / L + phases[c]) + 0.3 * Math.sin(2 * Math.PI * i * speeds[c] / (L / 2) + phases[c]));
    const stress = t.map(() => 0);
    [[Math.floor(0.32 * nWeeks), 8, 1.0], [Math.floor(0.74 * nWeeks), 6, 1.3]].forEach(([c, w, m]) => t.forEach((i) => { stress[i] += m * Math.exp(-0.5 * ((i - c) / w) ** 2); }));
    const cum = (sc) => { let a = 0; return t.map(() => (a += sc * gauss())); };
    const series = {};
    const base = { walcl: 4000, ecb_assets: 4500, boj_assets: 5500, cny_res: 3100 };
    series.walcl = t.map((i) => base.walcl * (1 + 0.0025 * i + 0.25 * cyc.USD[i]) - base.walcl * 0.2 * stress[i] + 30 * gauss());
    series.ecb_assets = t.map((i) => base.ecb_assets * (1 + 0.0025 * i + 0.25 * cyc.EUR[i]) - base.ecb_assets * 0.2 * stress[i]);
    series.boj_assets = t.map((i) => base.boj_assets * (1 + 0.0025 * i + 0.25 * cyc.JPY[i]));
    series.cny_res = t.map((i) => base.cny_res * (1 + 0.0025 * i + 0.25 * cyc.CNY[i]));
    series.tga = t.map((i) => 500 + 80 * Math.abs(Math.sin(i / 9)));
    series.rrp = t.map((i) => Math.max(0, 800 - 600 * cyc.USD[i]));
    series.dexuseu = t.map((i) => 1.1 * (1 + 0.04 * cyc.EUR[i]));
    series.dexjpus = t.map((i) => 110 * (1 - 0.04 * cyc.JPY[i]));
    series.dexusuk = t.map((i) => 1.3 * (1 + 0.04 * cyc.GBP[i]));
    series.dexchus = t.map((i) => 6.8 * (1 - 0.02 * cyc.CNY[i]));
    series.iorb = t.map((i) => Math.max(0.1, 2 + 1.5 * Math.sin(i / 40)));
    series.sofr = t.map((i) => series.iorb[i] + 0.02 + 0.3 * stress[i]);
    const gl = t.map((i) => (0.35 * cyc.USD[i] + 0.25 * cyc.CNY[i] + 0.2 * cyc.EUR[i] + 0.15 * cyc.JPY[i] + 0.05 * cyc.GBP[i]));
    series.hy = t.map((i) => Math.max(1.5, 3.5 - 1.2 * gl[i] + 4 * stress[i]));
    series.dxy = t.map((i) => 100 * (1 - 0.05 * gl[i] + 0.04 * stress[i]));
    series.bei = t.map((i) => Math.max(0.5, 2.2 + 0.4 * gl[i] - 0.5 * stress[i]));
    series.tips = t.map((i) => 0.5 - 0.8 * gl[i] + 0.6 * stress[i]);
    series.vix = t.map((i) => Math.max(9, 15 - 4 * gl[i] + 35 * stress[i]));
    series.indpro = t.map((i) => 100 * (1 + 0.04 * gl[i] - 0.06 * stress[i]));
    series.ism = t.map((i) => Math.max(35, Math.min(65, 52 + 6 * gl[i] - 8 * stress[i])));
    // Build a /api/fredhistory-shaped payload (weekly dated, ascending).
    const start = +new Date('2014-01-03'), WEEK = 7 * 864e5, payload = {};
    for (const k of KEYS) payload[k] = (series[k] || []).map((v, i) => ({ date: new Date(start + i * WEEK).toISOString().slice(0, 10), value: v }));
    return payload;
  }

  return { run, runHistory, synthetic, alignWeekly, CFG, KEYS, _math: { ffill, sma, rollingZ, roc, lag } };
}));
