/**
 * Correlation history: the CPU part of server.js buildCorrHistoryJS, moved here so it can run in a worker thread
 * (js/corrHistoryWorker.js) instead of on the event loop the live bots share. The OANDA fetch stays in server.js.
 *
 *   computeCorrHistory(barData, opts)  the 5-year H4 rolling correlation / beta records and their summaries, exactly
 *                                      as server.js built them before (bot/data/corr_history.json)
 *   alertsSummary(output)              the compact summary pushed to KV as hedge_alerts_cache
 *   dailyCloses(bars, shiftH)          H4 bars -> one close per New York trading day (17:00 NY roll)
 *   buildPanel(barData, opts)          the Desk Terminal's Correlations & hedges payload: aligned daily closes for every
 *                                      instrument plus the old page's EUR/USD trend regime per day. Small (~150 KB), so it
 *                                      is kept in KV too and survives a redeploy.
 *
 * Pure: no I/O, no clock except where a timestamp is passed in. Tested by js/corrHistoryCompute.test.mjs.
 */

export function logRets(arr) {
  const out = [];
  for (let i = 1; i < arr.length; i++) out.push(Math.log(Math.max(arr[i], 1e-10) / Math.max(arr[i - 1], 1e-10)));
  return out;
}
export function pearson(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; da += a * a; db += b * b; }
  const d = Math.sqrt(da * db); return d < 1e-12 ? 0 : Math.max(-1, Math.min(1, num / d));
}
export function ols(y, x) {
  const n = y.length; if (n < 3) return [0, 0];
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let cov = 0, vx = 0; for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; }
  if (vx < 1e-12) return [0, 0];
  const b = cov / vx, a = my - b * mx;
  let ss = 0, st = 0; for (let i = 0; i < n; i++) { ss += (y[i] - a - b * x[i]) ** 2; st += (y[i] - my) ** 2; }
  return [+b.toFixed(4), st < 1e-12 ? 0 : +Math.max(0, Math.min(1, 1 - ss / st)).toFixed(4)];
}
export function ema(arr, p) {
  const r = [...arr], k = 2 / (p + 1); for (let i = 1; i < r.length; i++) r[i] = arr[i] * k + r[i - 1] * (1 - k); return r;
}
/** The old page's regime: EUR/USD 20/50 EMA spread and slope (BULL / BEAR / RANGE). A trend state, not a risk regime. */
export function trendRegime(closes) {
  const n = closes.length; if (n < 25) return 'RANGE';
  const fast = ema(closes, 20), slow = ema(closes, Math.min(50, n));
  const ref = Math.max(Math.abs(closes[n - 1]), 1e-10);
  const spread = (fast[n - 1] - slow[n - 1]) / ref, slope = n >= 6 ? (fast[n - 1] - fast[n - 6]) / ref : 0;
  if (spread > 0.0025 && slope > 0.00015) return 'BULL';
  if (spread < -0.0025 && slope < -0.00015) return 'BEAR';
  return 'RANGE';
}

const tsMs = t => (t instanceof Date ? t.getTime() : +t);

/**
 * barData: { SYM: { closes: number[], timestamps: (Date|ms)[] } }. opts: { pairs, factorProxies, window, step, years }.
 * Returns the corr_history.json object without the COT block (server.js adds that).
 */
export function computeCorrHistory(barData, { pairs, factorProxies, window, step, years, now = Date.now() }) {
  const availPairs = pairs.filter(p => barData[p]);
  if (!availPairs.length) return null;
  const refPair = availPairs.find(p => ['EURUSD', 'GBPUSD', 'USDJPY'].includes(p)) || availPairs[0];
  const refTs = barData[refPair].timestamps.map(tsMs);
  const n = refTs.length - 1;

  const retSeries = {};
  for (const sym of availPairs) {
    const { closes, timestamps } = barData[sym];
    const rmap = new Map();
    const rets = logRets(closes);
    for (let i = 0; i < rets.length; i++) rmap.set(tsMs(timestamps[i + 1]), rets[i]);
    retSeries[sym] = refTs.slice(1).map(ts => rmap.get(ts) ?? null);
  }
  const factorRets = {};
  for (const [fname, { sym, sign }] of Object.entries(factorProxies))
    if (retSeries[sym]) factorRets[fname] = retSeries[sym].map(v => (v !== null ? v * sign : null));

  const refCloses = barData[refPair].closes;
  const records = [];
  for (let end = window; end <= n; end += step) {
    const s = end - window;
    const ts = new Date(refTs[end]);
    const regime = trendRegime(refCloses.slice(Math.max(0, end - 59), end + 1));
    const corr = {}, beta = {};
    for (let i = 0; i < availPairs.length; i++) {
      const pa = availPairs[i];
      beta[pa] = {};
      for (const [fname, frets] of Object.entries(factorRets)) {
        const yr = [], fr = [];
        for (let k = s; k < end; k++) if (retSeries[pa][k] !== null && frets[k] !== null) { yr.push(retSeries[pa][k]); fr.push(frets[k]); }
        if (yr.length >= 10) { const [b] = ols(yr, fr); beta[pa][fname] = b; }
      }
      for (let j = i + 1; j < availPairs.length; j++) {
        const pb = availPairs[j], xa = [], xb = [];
        for (let k = s; k < end; k++) if (retSeries[pa][k] !== null && retSeries[pb][k] !== null) { xa.push(retSeries[pa][k]); xb.push(retSeries[pb][k]); }
        if (xa.length >= 10) { const c = pearson(xa, xb); if (c !== null) corr[`${pa}_${pb}`] = +c.toFixed(4); }
      }
    }
    records.push({ ts: ts.getTime(), ts_str: ts.toISOString().slice(0, 16).replace('T', ' '), regime, corr, beta });
  }

  const avgSums = {}, avgCnts = {}, rgCorrData = {}, rgStatData = {};
  for (const rec of records) {
    const rg = rec.regime;
    if (!rgCorrData[rg]) rgCorrData[rg] = {};
    if (!rgStatData[rg]) rgStatData[rg] = {};
    for (const [k, v] of Object.entries(rec.corr)) {
      avgSums[k] = (avgSums[k] || 0) + v; avgCnts[k] = (avgCnts[k] || 0) + 1;
      if (!rgCorrData[rg][k]) rgCorrData[rg][k] = [];
      rgCorrData[rg][k].push(v);
    }
    for (const [pair, betas] of Object.entries(rec.beta)) {
      if (!rgStatData[rg][pair]) rgStatData[rg][pair] = { dxy: [], rates: [], vix: [] };
      for (const f of ['dxy', 'rates', 'vix']) if (betas[f] !== undefined) rgStatData[rg][pair][f].push(betas[f]);
    }
  }
  const avgCorr = {};
  for (const k of Object.keys(avgSums)) avgCorr[k] = +(avgSums[k] / avgCnts[k]).toFixed(4);
  const regimeCorr = {};
  for (const [rg, corrs] of Object.entries(rgCorrData)) {
    regimeCorr[rg] = {};
    for (const [k, vals] of Object.entries(corrs)) regimeCorr[rg][k] = +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(4);
  }
  const regimeStats = {};
  const mean = a => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(4) : null);
  for (const [rg, pairData] of Object.entries(rgStatData)) {
    for (const [pair, vals] of Object.entries(pairData)) {
      if (!regimeStats[pair]) regimeStats[pair] = {};
      regimeStats[pair][rg] = { dxy_mean: mean(vals.dxy), rates_mean: mean(vals.rates), vix_mean: mean(vals.vix), n: vals.vix.length };
    }
  }
  return {
    generated: new Date(now).toISOString(), years, window_bars: window, step_bars: step, pairs: availPairs,
    records, regime_stats: regimeStats, avg_corr: avgCorr, regime_corr: regimeCorr,
  };
}

/** The compact hedge_alerts_cache summary (avg, std and last of every pair correlation; the last betas). */
export function alertsSummary(output) {
  const records = output.records || [];
  const s1 = {}, s2 = {}, cnt = {}, lastCorr = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r.corr || {})) {
      if (!s1[k]) { s1[k] = 0; s2[k] = 0; cnt[k] = 0; }
      s1[k] += v; s2[k] += v * v; cnt[k]++;
      lastCorr[k] = v;
    }
  }
  const corrStd = {};
  for (const k of Object.keys(s1)) { const n = cnt[k], mu = s1[k] / n; corrStd[k] = n > 1 ? +(Math.sqrt(Math.max(0, s2[k] / n - mu * mu))).toFixed(5) : 0; }
  // `.beta`, not `.betas`: the record field is singular (the plural once wrote an empty object silently)
  const lastBetas = records.length ? (records[records.length - 1].beta ?? {}) : {};
  return {
    generated: output.generated, pairs: output.pairs, avg_corr: output.avg_corr, corr_std: corrStd, last_corr: lastCorr, last_betas: lastBetas,
    last_cot_corr: output.cot_corr ?? {}, cot_corr_generated: output.cot_corr_generated ?? null,
  };
}

/** New York trading date of an H4 bar that STARTS at `ms`: bars from 17:00 NY belong to the next day (UTC +3h works for
 *  both EST and EDT: 21:00/22:00 UTC opens roll over, 17:00/18:00 UTC opens do not). */
export const nyDay = (ms, shiftH = 3) => new Date(ms + shiftH * 3600_000).toISOString().slice(0, 10);

/** H4 bars -> Map(date -> last close of that NY day). Saturdays never occur; a Sunday-evening open counts for Monday. */
export function dailyCloses({ closes, timestamps }, shiftH = 3) {
  const m = new Map();
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i]; if (!(c > 0)) continue;
    m.set(nyDay(tsMs(timestamps[i]), shiftH), c);
  }
  return m;
}

const sig6 = v => (v == null ? null : +v.toPrecision(6));

/**
 * The terminal's payload: the last `days` NY trading days on which the reference pair traded, every instrument's
 * close on each (null where it did not trade), and the EUR/USD trend regime per day from `records` (the regime of the
 * day's last snapshot). opts: { syms, days = 780, ref = 'EURUSD', records = [], now }.
 */
export function buildPanel(barData, { syms, days = 780, ref = 'EURUSD', records = [], now = Date.now() } = {}) {
  const have = (syms ?? Object.keys(barData)).filter(s => barData[s]?.closes?.length);
  if (!have.length) return null;
  const refSym = have.includes(ref) ? ref : have[0];
  const daily = Object.fromEntries(have.map(s => [s, dailyCloses(barData[s])]));
  const dates = [...daily[refSym].keys()].sort().filter(d => { const wd = new Date(d + 'T12:00:00Z').getUTCDay(); return wd !== 0 && wd !== 6; }).slice(-days);
  const closes = Object.fromEntries(have.map(s => [s, dates.map(d => sig6(daily[s].get(d) ?? null))]));
  const rgByDay = new Map();
  for (const r of records) if (r?.ts != null && r.regime) rgByDay.set(nyDay(r.ts, 3), r.regime);
  const trend = dates.map(d => rgByDay.get(d) ?? null);
  return { generated: new Date(now).toISOString(), from: dates[0] ?? null, to: dates.at(-1) ?? null, syms: have, dates, closes, trend, trendOf: refSym };
}
