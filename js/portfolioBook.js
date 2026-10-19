/**
 * Portfolio Book — the book maths for forge/PORTFOLIO_BOOK_PREREG.md, shared by the
 * scored run (scripts/portfolio-book/run.mjs) and the page (portfolio-book.html), so the
 * number the page shows for a weight set is the number the run would score for it.
 *
 * Inputs are the sleeve streams the run writes (analysis/output/portfolio-book/book.json):
 * per sleeve, per leg, the leg's daily net return contribution to its sleeve BEFORE the
 * sleeve's own vol scaling. Everything downstream is fixed by the prereg:
 *   sleeve scale  10% annual vol from the 60-day EWMA of the sleeve's own past stream,
 *                 lagged one day, capped at 3x (the harness's rule, one level up)
 *   book          weighted mean of the sleeves live that day, renormalised over live
 *                 sleeves, then the same lagged-EWMA scale to a 10% book
 *   scoring       the harness's stats (js/harness/stats.mjs): date-block bootstrap of the
 *                 daily mean (block 5, B 1,000, fixed seed), deflated Sharpe with N trials
 *
 * Pure functions, no I/O. Browser and Node.
 */
import { sharpeAnn, skewKurt, clusteredBlockBootstrap, deflatedSharpe, mean, stdev } from './harness/stats.mjs';

export const BOOK = Object.freeze({ volTarget: 0.10, span: 60, minObs: 20, cap: 3, seed: 0x9e3779b9, nBoot: 1000, block: 5, isEnd: '2018-01-01', halfSplit: '2017-05-01', registeredTrials: 11 });
export const UNIT = 1e8;   // book.json stores contributions as integers in units of 1e-8

/** Lagged EWMA vol scale: scale[t] uses the stream up to t-1 only. */
export function laggedScale(stream, live = null, { volTarget = BOOK.volTarget, span = BOOK.span, minObs = BOOK.minObs, cap = BOOK.cap } = {}) {
  const a = 2 / (span + 1), n = stream.length, scale = new Array(n).fill(0);
  let v = NaN, k = 0;
  for (let t = 0; t < n; t++) {
    if (k >= minObs && v > 0) scale[t] = Math.min(cap, volTarget / (Math.sqrt(v) * Math.sqrt(252)));
    if (live && !live[t]) continue;              // a sleeve that is not live yet does not warm its vol
    const r = stream[t];
    if (!Number.isFinite(r)) continue;
    v = Number.isFinite(v) ? a * r * r + (1 - a) * v : r * r;
    k++;
  }
  return scale;
}

/** Sleeve raw stream (sum of leg contributions) → scaled stream + scale path. */
export function sleeveStream(sleeve, nDays) {
  const raw = new Array(nDays).fill(0);
  for (const leg of sleeve.legs) for (let t = 0; t < nDays; t++) raw[t] += leg.c[t] / UNIT;
  const live = new Array(nDays).fill(false);
  for (let t = sleeve.startIdx ?? 0; t < nDays; t++) live[t] = true;
  const scale = laggedScale(raw, live);
  return { raw, scale, live, scaled: raw.map((r, t) => (live[t] ? r * scale[t] : 0)) };
}

/** The book for a weight map {sleeveId: w}. Returns daily returns and every path the trade export needs. */
export function buildBook(data, weights) {
  const nDays = data.dates.length;
  const sl = data.sleeves.map(s => ({ s, w: Math.max(0, Number(weights[s.id]) || 0), ...sleeveStream(s, nDays) }));
  const raw = new Array(nDays).fill(0), wNorm = sl.map(() => new Array(nDays).fill(0));
  for (let t = 0; t < nDays; t++) {
    let W = 0;
    for (const x of sl) if (x.live[t] && x.w > 0 && x.scale[t] > 0) W += x.w;
    if (!(W > 0)) continue;
    sl.forEach((x, i) => { if (x.live[t] && x.w > 0 && x.scale[t] > 0) { wNorm[i][t] = x.w / W; raw[t] += wNorm[i][t] * x.scaled[t]; } });
  }
  const anyLive = raw.map((_, t) => sl.some((x, i) => wNorm[i][t] > 0));
  const bookScale = laggedScale(raw, anyLive);
  const rets = raw.map((r, t) => r * bookScale[t]);
  return { rets, raw, bookScale, sleeves: sl.map((x, i) => ({ id: x.s.id, scale: x.scale, wNorm: wNorm[i], scaled: x.scaled })) };
}

const yr = d => d.slice(0, 4);

/** The standard backtest: every number the prereg names, for one daily return stream. */
export function scoreStream(dates, rets, { nTrials = BOOK.registeredTrials, varTrialSr, startIdx = null } = {}) {
  let s0 = startIdx ?? rets.findIndex(r => r !== 0);
  if (s0 < 0) s0 = 0;
  const D = dates.slice(s0), R = rets.slice(s0);
  const sh = sharpeAnn(R), mom = skewKurt(R);
  let eq = 1, peak = 1, mdd = 0, ddStart = 0, worstDdDays = 0, under = 0;
  const equity = [];
  for (const r of R) { eq *= 1 + r; equity.push(eq); if (eq > peak) { peak = eq; under = 0; } else { under++; worstDdDays = Math.max(worstDdDays, under); } mdd = Math.max(mdd, 1 - eq / peak); }
  const years = R.length / 252;
  const cagr = Math.pow(eq, 1 / years) - 1;
  const downside = Math.sqrt(mean(R.map(r => Math.min(0, r) ** 2))) * Math.sqrt(252);
  const perYear = {};
  D.forEach((d, i) => { perYear[yr(d)] = (perYear[yr(d)] ?? 1) * (1 + R[i]); });
  for (const k in perYear) perYear[k] = +((perYear[k] - 1) * 100).toFixed(2);
  const months = {};
  D.forEach((d, i) => { const m = d.slice(0, 7); months[m] = (months[m] ?? 1) * (1 + R[i]); });
  const mVals = Object.values(months).map(v => v - 1);
  const part = pred => sharpeAnn(R.filter((_, i) => pred(D[i]))).sr;
  const boot = clusteredBlockBootstrap(R.map(v => [v]), rows => mean(rows), { meanBlock: BOOK.block, nBoot: BOOK.nBoot, seed: BOOK.seed, minClusters: 60 });
  const dsr = deflatedSharpe({ srPeriod: sh.srPeriod, n: R.length, skew: mom.skew, kurt: mom.kurt, nTrials, varTrialSr });
  const halves = [part(d => d < BOOK.halfSplit), part(d => d >= BOOK.halfSplit)];
  const tStat = sh.srPeriod * Math.sqrt(R.length);
  const r3 = v => (Number.isFinite(v) ? +v.toFixed(3) : null);
  return {
    from: D[0], to: D[D.length - 1], nDays: R.length, years: +years.toFixed(2),
    cagrPct: +(cagr * 100).toFixed(2), volPct: +(sh.sd * Math.sqrt(252) * 100).toFixed(2),
    sharpe: r3(sh.sr), sortino: r3(downside > 0 ? (sh.mean * 252) / downside : NaN), tStat: r3(tStat),
    maxDdPct: +(mdd * 100).toFixed(2), calmar: r3(mdd > 0 ? cagr / mdd : NaN), longestDdDays: worstDdDays,
    sharpeIs: r3(part(d => d < BOOK.isEnd)), sharpeOos: r3(part(d => d >= BOOK.isEnd)),
    sharpeHalves: halves.map(r3),
    hitDays: +(R.filter(r => r > 0).length / R.filter(r => r !== 0).length).toFixed(3),
    worstDayPct: +(Math.min(...R) * 100).toFixed(2), worstMonthPct: +(Math.min(...mVals) * 100).toFixed(2), bestMonthPct: +(Math.max(...mVals) * 100).toFixed(2),
    monthsPositive: +(mVals.filter(v => v > 0).length / mVals.length).toFixed(3),
    skew: r3(mom.skew), kurt: r3(mom.kurt),
    meanDailyCi95: boot.ok ? boot.ci95 : null, pValue: boot.ok ? boot.pValue : null,
    dsr: dsr.dsr, dsrTrials: dsr.nTrials,
    perYearPct: perYear, yearsPositive: `${Object.values(perYear).filter(v => v > 0).length}/${Object.keys(perYear).length}`,
    equity, eqDates: D, srPeriod: sh.srPeriod,
  };
}

/** The prereg gate, applied to a score. */
export function gate(sc) {
  const checks = [
    { key: 'p', label: 'Mean daily net return p < 0.05 (date-block bootstrap)', pass: sc.pValue != null && sc.pValue < 0.05, value: sc.pValue },
    { key: 'dsr', label: `Deflated Sharpe ≥ 0.95 at N = ${sc.dsrTrials}`, pass: sc.dsr >= 0.95, value: sc.dsr },
    { key: 'halves', label: 'Sharpe > 0 in both halves (split 2017-05-01)', pass: sc.sharpeHalves.every(v => v > 0), value: sc.sharpeHalves.join(' / ') },
  ];
  return { checks, pass: checks.every(c => c.pass), live: sc.tStat >= 3 };
}

/** Pairwise correlation of the scaled sleeve streams over days where both are live. */
export function sleeveCorrelation(book) {
  const ids = book.sleeves.map(s => s.id), out = {};
  for (const a of book.sleeves) for (const b of book.sleeves) {
    const x = [], y = [];
    for (let t = 0; t < a.scaled.length; t++) if (a.scale[t] > 0 && b.scale[t] > 0) { x.push(a.scaled[t]); y.push(b.scaled[t]); }
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    (out[a.id] ??= {})[b.id] = sxx > 0 && syy > 0 ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null;
  }
  return { ids, matrix: out };
}

/**
 * Trades in the owner's import template (Date, Time, Exit Date, Exit Time, Instrument,
 * Direction, Model, Risk %, Return %, MAE %, MFE %, Tags, Notes). Return % is the trade's
 * contribution to the BOOK (close to close); Risk % is the leg's 1-day 1σ contribution at
 * entry; MAE/MFE are the worst/best running contribution on closes. Times are UTC fills at
 * the 22:00 decision close.
 */
export const TEMPLATE_HEADER = ['Date', 'Time', 'Exit Date', 'Exit Time', 'Instrument', 'Direction', 'Model', 'Risk %', 'Return %', 'MAE %', 'MFE %', 'Tags', 'Notes'];
export function bookTrades(data, book) {
  const out = [];
  data.sleeves.forEach((s, si) => {
    const B = book.sleeves[si];
    for (const tr of s.trades) {
      const leg = s.legs[tr.leg];
      const f = t => B.scale[t] * B.wNorm[t] * book.bookScale[t];
      if (!(f(Math.min(tr.e + 1, data.dates.length - 1)) > 0) && !(f(tr.e) > 0)) continue;   // sleeve carries no weight here
      let cum = 0, mae = 0, mfe = 0;
      for (let t = tr.s ?? tr.e + 1; t <= tr.x; t++) { cum += (leg.c[t] / UNIT) * f(t); mae = Math.min(mae, cum); mfe = Math.max(mfe, cum); }
      const t1 = Math.min(tr.e + 1, data.dates.length - 1);
      const risk = (tr.r ?? 0) * f(t1);
      out.push({
        sleeve: s.id, Date: data.dates[tr.e], Time: '22:00', 'Exit Date': data.dates[tr.x], 'Exit Time': '22:00',   // an open trade is marked at the window end and tagged
        Instrument: leg.label, Direction: tr.dir > 0 ? 'Long' : 'Short', Model: s.name,
        'Risk %': +(risk * 100).toFixed(4), 'Return %': +(cum * 100).toFixed(4), 'MAE %': +(Math.abs(mae) * 100).toFixed(4), 'MFE %': +(mfe * 100).toFixed(4),
        Tags: [s.id, tr.open ? 'open-at-window-end' : null].filter(Boolean).join(' '),
        Notes: 'portfolio-book; % of book; close-to-close MAE/MFE; times UTC',
      });
    }
  });
  return out.sort((a, b) => a.Date.localeCompare(b.Date) || a.Model.localeCompare(b.Model));
}

export function toCsv(rows) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [TEMPLATE_HEADER.join(','), ...rows.map(r => TEMPLATE_HEADER.map(h => esc(r[h])).join(','))].join('\n') + '\n';
}

export const P1_WEIGHTS = Object.freeze({ S1g: 1, S2: 1, S3g: 1, S4: 1, S5g: 1 });
export const P2_WEIGHTS = Object.freeze({ S1g: 0.40, S2: 0.25, S5g: 0.20, S3g: 0.05, S4: 0.05 });
export { mean, stdev };
