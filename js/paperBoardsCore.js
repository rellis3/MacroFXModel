/**
 * Desk Terminal boards drawn from the paper-ideas pass (2026-11-14): pure shaping, no fetch, no DOM, no clock (callers pass `now`).
 * Every builder says what it measures and where the data stops. None of them forecasts direction; where the Evidence Book has a verdict on the
 * underlying idea the view words it (js/terminal/paperBoardsView.js), this file only computes.
 *
 *   parseMofCurve / jgbShock          JGB 2/10/20/30/40y from the MoF file, and the three-light shock card
 *   fomcEventTimes                    statement 14:00 ET and press conference 14:30 ET per meeting, in UTC and London
 *   policyUncertainty                 EPU / TPU level against its own five years
 *   auctionResults                    Treasury auction results with the change against the previous auction of the same term
 *   connectedness                     Diebold-Yilmaz spillover (VAR(1), generalised FEVD, horizon H) on daily moves, with a rolling history
 *   couplingRing                      rolling correlation of a commodity currency with its commodity, now against its own history
 *   coverageByState                   how often the forecast range lines held, overall and after a stress day
 *   oiWallDistance                    distance to the nearest option wall in expected daily moves
 *   pathDifferential                  priced policy-path gap per currency pair from the futures-implied path
 *   inflationBoard / skewHistory      5y5y + core PCE; the SKEW index with the 2022 daily-expiry break marked
 */

export const fin = v => v != null && v !== '' && Number.isFinite(+v);
const num = v => (fin(v) ? +v : null);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
/** Share of `arr` at or below v, 0-100. */
export const pctRank = (arr, v) => { const a = arr.filter(fin); if (!a.length || !fin(v)) return null; return +(100 * a.filter(x => x <= v).length / a.length).toFixed(1); };
const quantile = (arr, q) => { const a = arr.filter(fin).map(Number).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const r1 = v => (fin(v) ? Math.round(v * 10) / 10 : null), r2 = v => (fin(v) ? Math.round(v * 100) / 100 : null);

// ── JGB ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** MoF CSV: a title row, then "Date,1Y,2Y,...,40Y", rows "2026/9/17,1.581,...". Returns [{date,'2Y':..,...}] oldest first; null where the cell is "-". */
export function parseMofCurve(text, tenors = ['2Y', '10Y', '20Y', '30Y', '40Y']) {
  const lines = String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  const hi = lines.findIndex(l => l.startsWith('Date,')); if (hi < 0) return [];
  const head = lines[hi].split(',').map(s => s.trim());
  const cols = tenors.map(t => [t, head.indexOf(t)]).filter(([, i]) => i >= 0);
  const out = new Map();
  for (const l of lines.slice(hi + 1)) {
    const c = l.split(','), m = String(c[0]).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if (!m) continue;
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, row = { date };
    for (const [t, i] of cols) row[t] = num(c[i]);
    out.set(date, row);
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** Which tenors the file actually carries (so the board can say if 40Y is missing). */
export const mofTenors = text => { const l = String(text ?? '').split('\n').map(s => s.trim()).find(s => s.startsWith('Date,')); return l ? l.split(',').slice(1).map(s => s.trim()).filter(Boolean) : []; };

/**
 * The JGB shock card: three lights, conditions only. rows = parseMofCurve output.
 *  short  : the 2y moved by more than 2 standard deviations of its own 5-day changes (last five years) AND by at least 3bp in the last five sessions
 *  vol    : 20-day realised volatility of 10y daily changes at or above the 80th percentile of its own five years
 *  type   : where the move sits on the curve over five sessions (front end / long end / parallel / quiet), from the 2y and 30y changes
 * The paper behind this reads a short-end JGB shock in a high-vol state as the case that spills into yen crosses; whether that holds for the
 * ranges here has not been tested (the card says "conditions", never a direction).
 */
export function jgbShock(rows, { win = 5 } = {}) {
  const r = (rows ?? []).filter(x => fin(x['2Y']) && fin(x['10Y']));
  if (r.length < 300) return null;
  const last = r.at(-1), prev = r.at(-1 - win);
  const d = (k, a, b) => (fin(a?.[k]) && fin(b?.[k]) ? (a[k] - b[k]) * 100 : null);   // bp
  const ch = { '2Y': d('2Y', last, prev), '10Y': d('10Y', last, prev), '30Y': d('30Y', last, prev) };
  const hist2 = []; for (let i = win; i < r.length; i++) { const v = d('2Y', r[i], r[i - win]); if (v != null) hist2.push(v); }
  const h5 = hist2.slice(-1250), s2 = sd(h5), z2 = s2 > 0 && ch['2Y'] != null ? ch['2Y'] / s2 : null;
  const dv = []; for (let i = 1; i < r.length; i++) { const v = d('10Y', r[i], r[i - 1]); dv.push(v ?? 0); }
  const rv = []; for (let i = 20; i <= dv.length; i++) rv.push(sd(dv.slice(i - 20, i)));
  const rv5 = rv.slice(-1250), volNow = rv.at(-1), volPct = pctRank(rv5, volNow);
  const a2 = Math.abs(ch['2Y'] ?? 0), a30 = Math.abs(ch['30Y'] ?? ch['10Y'] ?? 0);
  let type = 'quiet'; if (Math.max(a2, a30) >= 3) type = a2 >= a30 ? 'front end' : a30 >= 1.5 * a2 ? 'long end' : 'parallel';
  if (type === 'front end' && a30 > 0 && a2 < 1.5 * a30 && a2 < a30 * 1.0) type = 'parallel';
  const slope = fin(last['30Y']) ? (last['30Y'] - last['2Y']) * 100 : (last['10Y'] - last['2Y']) * 100, sl = [];
  for (let i = 0; i < r.length; i++) { const s = fin(r[i]['30Y']) ? (r[i]['30Y'] - r[i]['2Y']) * 100 : (r[i]['10Y'] - r[i]['2Y']) * 100; sl.push(s); }
  return {
    asOf: last.date, window: win, changesBp: Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, r1(v)])),
    lights: {
      short: { on: z2 != null && Math.abs(z2) >= 2 && Math.abs(ch['2Y']) >= 3, z: r2(z2), bp: r1(ch['2Y']), note: `2y ${ch['2Y'] > 0 ? '+' : ''}${r1(ch['2Y'])}bp in ${win} sessions` },
      vol: { on: volPct != null && volPct >= 80, pct: volPct == null ? null : Math.round(volPct), realisedBp: r2(volNow) },
      type: { value: type, a2: r1(a2), a30: r1(a30) },
    },
    levels: Object.fromEntries(['2Y', '10Y', '20Y', '30Y', '40Y'].filter(k => fin(last[k])).map(k => [k, last[k]])),
    slope2s30s: { bp: r1(slope), pct5y: pctRank(sl.slice(-1250), slope) },
    spark10y: r.slice(-250).map(x => x['10Y']),
    n: r.length,
  };
}

// ── FOMC event times ─────────────────────────────────────────────────────────────────────────────────────────────
/** UTC epoch ms of a wall-clock time in a zone on a date. zoned = zonedEpoch(date, h, m, tz) in epoch SECONDS (js/yieldLegs.js). */
export function fomcEventTimes(meetings, now, zoned, { past = 4, future = 4 } = {}) {
  const rows = (meetings ?? []).map(m => {
    const st = zoned(m.date, 14, 0, 'America/New_York') * 1000, pc = zoned(m.date, 14, 30, 'America/New_York') * 1000;
    return { date: m.date, sep: !!m.sep, statementMs: st, pressMs: pc, statementLondon: lon(st), pressLondon: lon(pc), statementET: '14:00', pressET: '14:30', done: pc + 90 * 60e3 < now, source: 'standard schedule (statement 14:00 ET, press conference 14:30 ET)' };
  }).sort((a, b) => a.statementMs - b.statementMs);
  const i = rows.findIndex(r => !r.done), k = i < 0 ? rows.length : i;
  return { next: rows[k] ?? null, rows: rows.slice(Math.max(0, k - past), k + future) };
}
const lon = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

// ── Policy uncertainty ───────────────────────────────────────────────────────────────────────────────────────────
/** series = [{id,label,freq,pts:[{date,value}]}]. Level now, the 5-year percentile and z, and the change over the last month / three months. */
export function policyUncertainty(series) {
  return (series ?? []).map(s => {
    const p = (s.pts ?? []).filter(x => fin(x.value)).map(x => ({ date: x.date, value: +x.value })).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (p.length < 12) return { id: s.id, label: s.label, freq: s.freq, ok: false };
    const last = p.at(-1), lookback = p.slice(s.freq === 'daily' ? -1300 : -60), vals = lookback.map(x => x.value), m = mean(vals), sg = sd(vals);
    const back = n => p.at(-1 - n)?.value;
    const n1 = s.freq === 'daily' ? 21 : 1, n3 = s.freq === 'daily' ? 63 : 3;
    return { id: s.id, label: s.label, freq: s.freq, ok: true, asOf: last.date, value: r1(last.value), pct5y: pctRank(vals, last.value), z5y: sg > 0 ? r2((last.value - m) / sg) : null, chg1: fin(back(n1)) ? r1(last.value - back(n1)) : null, chg3: fin(back(n3)) ? r1(last.value - back(n3)) : null, median5y: r1(quantile(vals, 0.5)), spark: p.slice(-(s.freq === 'daily' ? 250 : 60)).map(x => x.value), n: p.length };
  });
}

// ── Treasury auctions ────────────────────────────────────────────────────────────────────────────────────────────
/** results = TreasuryDirect "auctioned" rows (strings). Newest first, each with the change against the previous auction of the same security term. */
export function auctionResults(results, { limit = 14 } = {}) {
  const rows = (results ?? []).map(x => {
    const comp = num(x.subtotalCompetitiveParAwardedInsideOfOfferingAmount), ind = num(x.indirectBiddersCompetitiveParAwarded), dir = num(x.directBiddersCompetitiveParAwarded);
    const pct = v => (v != null && comp > 0 ? r1(100 * v / comp) : null), ip = pct(ind), dp = pct(dir);
    return { date: String(x.auctionDate ?? x.competitiveAuctionCloseDate ?? x.date ?? '').slice(0, 10), type: x.securityType, term: String(x.securityTerm ?? x.term ?? '').trim(),
      highYield: num(x.highYield), bidToCover: num(x.bidToCoverRatio), offeringB: num(x.offeringAmount) != null ? r1(num(x.offeringAmount) / 1e9) : null,
      indirectPct: ip, directPct: dp, dealerPct: ip != null && dp != null ? r1(100 - ip - dp) : null };
  }).filter(x => x.date && x.type !== 'Bill' && (x.highYield != null || x.bidToCover != null)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const out = rows.map((x, i) => { const prev = rows.slice(i + 1).find(y => y.term === x.term); return { ...x, dYieldBp: prev && x.highYield != null && prev.highYield != null ? r1((x.highYield - prev.highYield) * 100) : null, dBidToCover: prev && x.bidToCover != null && prev.bidToCover != null ? r2(x.bidToCover - prev.bidToCover) : null, prevDate: prev?.date ?? null }; });
  return out.slice(0, limit);
}

// ── Diebold-Yilmaz connectedness ─────────────────────────────────────────────────────────────────────────────────
const zeros = (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0));
const mmul = (A, B) => { const n = A.length, k = B.length, m = B[0].length, C = zeros(n, m); for (let i = 0; i < n; i++) for (let l = 0; l < k; l++) { const a = A[i][l]; if (a) for (let j = 0; j < m; j++) C[i][j] += a * B[l][j]; } return C; };
const tr = A => A[0].map((_, j) => A.map(r => r[j]));
function inv(A) {                                                                       // Gauss-Jordan with partial pivoting
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(r => r.slice(n));
}
/** One window: R = T x N matrix of (standardised) daily moves. Returns { total, from[], to[], net[], theta } or null. */
export function spilloverOnce(R, H = 10) {
  const T = R.length, N = R[0].length; if (T < N * 6) return null;
  const Y = R.slice(1), X = R.slice(0, -1), Xt = tr(X);
  const XtX = mmul(Xt, X); for (let i = 0; i < N; i++) XtX[i][i] += 1e-6 * T;       // a whisper of ridge keeps the inverse stable
  const Xi = inv(XtX); if (!Xi) return null;
  const B = mmul(Xi, mmul(Xt, Y)), Phi = tr(B);                                      // y_t = Phi y_{t-1} + e_t
  const Fit = mmul(X, B), E = Y.map((r, t) => r.map((v, j) => v - Fit[t][j])), dof = Math.max(1, E.length - N);
  const Sig = mmul(tr(E), E).map(r => r.map(v => v / dof));
  const Ph = [Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)))]; for (let h = 1; h < H; h++) Ph.push(mmul(Ph[h - 1], Phi));
  const PS = Ph.map(P => mmul(P, Sig)), num_ = zeros(N), den = new Array(N).fill(0);
  for (let h = 0; h < H; h++) for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) num_[i][j] += PS[h][i][j] ** 2 / (Sig[j][j] || 1);
    let q = 0; for (let k = 0; k < N; k++) q += PS[h][i][k] * Ph[h][i][k]; den[i] += q;                    // (P Sigma P')_ii
  }
  const th = num_.map((row, i) => { const t = row.map(v => v / (den[i] || 1)), s = t.reduce((a, b) => a + b, 0) || 1; return t.map(v => v / s); });
  const from = th.map((row, i) => 100 * row.reduce((s, v, j) => s + (j === i ? 0 : v), 0));
  const to = Array.from({ length: N }, (_, j) => 100 * th.reduce((s, row, i) => s + (i === j ? 0 : row[j]), 0));
  return { total: from.reduce((a, b) => a + b, 0) / N, from, to, net: to.map((v, i) => v - from[i]), theta: th };
}
/**
 * Spillover across markets. series = { NAME: [{date, value, kind:'ret'|'diff'}] } (kind says whether a move is a log return or a level difference).
 * Aligns on the dates all series share, standardises each column, estimates the last `win` days and a rolling history (every `step` days).
 */
export function connectedness(series, { win = 200, H = 10, step = 10, hist = 500 } = {}) {
  const names = Object.keys(series).filter(k => (series[k]?.pts ?? []).length > 100);
  if (names.length < 5) return null;
  const maps = names.map(k => new Map(series[k].pts.filter(p => fin(p.value) && (series[k].kind === 'diff' || +p.value > 0)).map(p => [p.date, +p.value])));
  const dates = [...maps[0].keys()].filter(d => maps.every(m => m.has(d))).sort();
  const M = []; for (let i = 1; i < dates.length; i++) M.push(names.map((k, j) => { const a = maps[j].get(dates[i]), b = maps[j].get(dates[i - 1]); return series[k].kind === 'diff' ? a - b : Math.log(a / b); }));
  const D = dates.slice(1);
  if (M.length < win + 20) return null;
  const std = W => { const cs = W[0].map((_, j) => { const c = W.map(r => r[j]), m = mean(c), s = sd(c) || 1; return [m, s]; }); return W.map(r => r.map((v, j) => (v - cs[j][0]) / cs[j][1])); };
  const at = end => spilloverOnce(std(M.slice(end - win, end)), H);
  const now = at(M.length); if (!now) return null;
  const hs = []; for (let e = M.length - Math.min(hist, M.length - win); e <= M.length; e += step) { const r = at(e); if (r) hs.push({ date: D[e - 1], total: r2(r.total) }); }
  if (hs.at(-1)?.date !== D.at(-1)) hs.push({ date: D.at(-1), total: r2(now.total) });
  const tot = hs.map(h => h.total);
  return {
    names, window: win, horizon: H, asOf: D.at(-1), nDays: M.length, total: r1(now.total), pct: pctRank(tot, now.total), history: hs,
    nodes: names.map((n, i) => ({ name: n, from: r1(now.from[i]), to: r1(now.to[i]), net: r1(now.net[i]) })),
    links: names.flatMap((a, i) => names.map((b, j) => (i === j ? null : { to: a, from: b, w: r1(now.theta[i][j] * 100) }))).filter(Boolean).sort((x, y) => y.w - x.w),
    method: `Diebold-Yilmaz spillover: VAR(1) on ${win} daily moves, generalised variance decomposition at ${H} days, rows normalised`,
  };
}

// ── Commodity-currency coupling ──────────────────────────────────────────────────────────────────────────────────
const logRets = pts => { const o = []; for (let i = 1; i < pts.length; i++) if (pts[i].value > 0 && pts[i - 1].value > 0) o.push({ date: pts[i].date, v: Math.log(pts[i].value / pts[i - 1].value) }); return o; };
function corr(a, b) { const n = a.length; if (n < 10) return null; const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null; }
/** pairs = [{ccy, fx:[{date,value}], com:[{date,value}], comLabel, sign:+1|-1}] (sign -1 where the pair is quoted commodity-currency-second, e.g. USDCAD). */
export function couplingRing(pairs, { win = 60 } = {}) {
  return (pairs ?? []).map(p => {
    const fx = logRets(p.fx ?? []), cm = new Map(logRets(p.com ?? []).map(x => [x.date, x.v]));
    const al = fx.filter(x => cm.has(x.date)).map(x => ({ date: x.date, a: x.v * (p.sign ?? 1), b: cm.get(x.date) }));
    if (al.length < win + 30) return { ccy: p.ccy, comLabel: p.comLabel, ok: false };
    const roll = []; for (let i = win; i <= al.length; i++) { const w = al.slice(i - win, i), c = corr(w.map(x => x.a), w.map(x => x.b)); if (c != null) roll.push({ date: al[i - 1].date, c }); }
    const now = roll.at(-1), vals = roll.map(x => x.c);
    return { ccy: p.ccy, comLabel: p.comLabel, ok: true, asOf: now.date, corr: r2(now.c), median: r2(quantile(vals, 0.5)), pct: pctRank(vals, now.c), lo: r2(quantile(vals, 0.1)), hi: r2(quantile(vals, 0.9)), window: win, nDays: al.length, spark: roll.slice(-250).map(x => r2(x.c)) };
  });
}

// ── Range-line coverage by state ─────────────────────────────────────────────────────────────────────────────────
/**
 * bars = D1 [{date,open,high,low,close}] oldest first. deps = { computeBands, volSigmaSeries } (js/forecastCore.js, the forecaster's own maths).
 * Per session after the warm-up: did the day's range stay inside the 50th / 75th percentile line (the lines promise ~50% / ~75%)? Returns the
 * per-day hits so callers can split them by state. `stressDates` = Set of dates whose PREVIOUS trading day was a stress day.
 */
export function dailyHits(bars, assetClass, deps, { warmup = 60 } = {}) {
  const sig = deps.volSigmaSeries(bars, assetClass), out = [];
  for (let i = warmup; i < bars.length; i++) {
    const b = bars[i], s = sig[i]; if (!s || s < 1e-8 || !(b?.open > 0)) continue;
    const f = deps.computeBands(b.open, s, assetClass), range = (b.high - b.low) / b.open;
    out.push({ date: b.date, hl50: range <= f.hl50, hl75: range <= f.hl75 });
  }
  return out;
}
export function coverageByState(hitsByInst, stressByDate, { last = 60, longN = 250 } = {}) {
  const stat = (arr, k, nominal) => { const n = arr.length, h = arr.filter(x => x[k]).length; if (!n) return { n: 0 }; const cov = h / n, se = Math.sqrt(nominal * (1 - nominal) / n); return { n, hits: h, cov: r2(100 * cov), z: r2((cov - nominal) / se) }; };
  const per = Object.entries(hitsByInst).map(([name, h]) => {
    const recent = h.slice(-last), long = h.slice(-longN), st = long.filter(x => stressByDate.has(x.date)), calm = long.filter(x => !stressByDate.has(x.date));
    return { name, last: { hl50: stat(recent, 'hl50', 0.5), hl75: stat(recent, 'hl75', 0.75) }, stressed: { hl75: stat(st, 'hl75', 0.75) }, calm: { hl75: stat(calm, 'hl75', 0.75) } };
  });
  const pool = sel => { const all = Object.values(hitsByInst).flatMap(sel); return all; };
  const poolStats = {
    last: { hl50: stat(pool(h => h.slice(-last)), 'hl50', 0.5), hl75: stat(pool(h => h.slice(-last)), 'hl75', 0.75) },
    stressed: { hl75: stat(pool(h => h.slice(-longN).filter(x => stressByDate.has(x.date))), 'hl75', 0.75) },
    calm: { hl75: stat(pool(h => h.slice(-longN).filter(x => !stressByDate.has(x.date))), 'hl75', 0.75) },
  };
  return { sessions: last, longSessions: longN, pooled: poolStats, per };
}
/** Dates (YYYY-MM-DD) whose previous available trading day closed with the VIX at or above its own `q` quantile; threshold returned too. */
export function stressDates(vix, q = 0.8) {
  const p = (vix ?? []).filter(x => fin(x.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (p.length < 250) return { set: new Set(), threshold: null };
  const thr = quantile(p.map(x => +x.value), q), set = new Set();
  for (let i = 0; i < p.length - 1; i++) if (+p[i].value >= thr) set.add(p[i + 1].date);
  return { set, threshold: r1(thr) };
}

// ── OI walls in expected moves ───────────────────────────────────────────────────────────────────────────────────
/** data = /api/oi-store .data. Distance from the reference price to the nearest call wall above and put wall below, in expected daily moves. */
export function oiWallDistance(data) {
  const out = [];
  for (const [name, e] of Object.entries(data ?? {})) {
    const dm = e?.expectedMove?.daily, ref = fin(e?.futures) ? +e.futures : fin(e?.spot) ? +e.spot : null;
    if (!(dm > 0) || ref == null) continue;
    const calls = (e.callWalls ?? []).map(w => +(w?.strike ?? w)).filter(fin), puts = (e.putWalls ?? []).map(w => +(w?.strike ?? w)).filter(fin);
    const up = [...calls, ...puts].filter(v => v > ref).sort((a, b) => a - b)[0], dn = [...calls, ...puts].filter(v => v < ref).sort((a, b) => b - a)[0];
    const cw = fin(e.callWall) ? +e.callWall : null, pw = fin(e.putWall) ? +e.putWall : null, gf = fin(e.gammaFlip) ? +e.gammaFlip : null, mp = fin(e.maxPain) ? +e.maxPain : null;
    const u = v => (v == null ? null : r1((v - ref) / dm));
    out.push({ name, ref, refSource: fin(e.futures) ? 'futures' : 'spot', dailyMove: dm, callWall: cw, putWall: pw, callWallD: u(cw), putWallD: u(pw), flipD: u(gf), maxPainD: u(mp), nearestUpD: u(up), nearestDownD: u(dn), oiAsOf: e.oiAsOf ?? null, cpSwapped: !!e.cpSwapped, regime: e.dayExpiry?.regime ?? e.fullBook?.regime ?? null });
  }
  return out;
}

// ── Path differential ────────────────────────────────────────────────────────────────────────────────────────────
const PAIRS = [['EUR', 'USD'], ['GBP', 'USD'], ['USD', 'JPY'], ['AUD', 'USD'], ['USD', 'CAD'], ['USD', 'CHF'], ['NZD', 'USD'], ['EUR', 'GBP'], ['EUR', 'JPY'], ['GBP', 'JPY'], ['AUD', 'NZD'], ['EUR', 'CHF']];
/** cb = /api/cb-expectations. Per pair: base minus quote of the priced move (bp) at 3 / 6 / 12 months, and the week's change. Positive = the base's priced path sits higher. */
export function pathDifferential(cb, pairs = PAIRS) {
  const B = cb?.banks ?? {}, get = (c, k) => (fin(B[c]?.[k]?.bp) ? +B[c][k].bp : null), wk = (c, k) => (fin(B[c]?.[k]?.weekBp) ? +B[c][k].weekBp : null);
  const rows = pairs.map(([a, b]) => {
    const d = k => (get(a, k) != null && get(b, k) != null ? get(a, k) - get(b, k) : null), w = k => (wk(a, k) != null && wk(b, k) != null ? wk(a, k) - wk(b, k) : null);
    return { pair: a + b, base: a, quote: b, m3: d('m3'), m6: d('m6'), m12: d('m12'), w3: w('m3'), w6: w('m6'), w12: w('m12') };
  }).filter(r => r.m3 != null || r.m6 != null || r.m12 != null);
  const own = Object.fromEntries(Object.keys(B).map(c => [c, { m3: get(c, 'm3'), m6: get(c, 'm6'), m12: get(c, 'm12'), source: B[c].source, kind: B[c].kind }]));
  return { asOf: cb?.asOf ?? null, ageH: cb?.ageH ?? null, rows, own };
}

// ── Inflation: 5y5y + core PCE ───────────────────────────────────────────────────────────────────────────────────
/** series = /api/chapters .series ({bei5y5y:[{date,value}], corePce:[{date,value}] index level, bei5, bei10}). */
export function inflationBoard(series) {
  const s = k => (series?.[k] ?? []).filter(x => fin(x.value)).map(x => ({ date: x.date, value: +x.value }));
  const f = s('bei5y5y'), pce = s('corePce'), b5 = s('bei5'), b10 = s('bei10');
  const lvl = a => { if (a.length < 30) return null; const v = a.map(x => x.value), last = a.at(-1), back = n => a.at(-1 - n)?.value; return { value: r2(last.value), asOf: last.date, pct5y: pctRank(v.slice(-1300), last.value), chg20: fin(back(20)) ? r2(last.value - back(20)) : null, chg60: fin(back(60)) ? r2(last.value - back(60)) : null, spark: a.slice(-260).map(x => x.value) }; };
  let pceOut = null;
  if (pce.length >= 14) {
    const yoy = i => (pce[i].value / pce[i - 12].value - 1) * 100, ann3 = i => (Math.pow(pce[i].value / pce[i - 3].value, 4) - 1) * 100, last = pce.length - 1;
    const yo = []; for (let i = 12; i <= last; i++) yo.push(yoy(i));
    pceOut = { asOf: pce[last].date, yoy: r2(yoy(last)), ann3m: r2(ann3(last)), yoyPrev: r2(yoy(last - 1)), yoy12ago: last >= 24 ? r2(yoy(last - 12)) : null, spark: yo.slice(-48).map(r2) };
  }
  return { fwd5y5y: lvl(f), bei5: lvl(b5), bei10: lvl(b10), corePce: pceOut };
}

// ── SKEW history with the 2022 break ─────────────────────────────────────────────────────────────────────────────
export const ODTE_BREAK = { date: '2022-05-11', label: 'May 2022: SPX options expire every weekday' };
export function skewHistory(series, brk = ODTE_BREAK) {
  const p = (series ?? []).filter(x => fin(x.value)).map(x => ({ date: x.date, value: +x.value })).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (p.length < 300) return null;
  const pre = p.filter(x => x.date < brk.date).map(x => x.value), post = p.filter(x => x.date >= brk.date).map(x => x.value);
  const last = p.at(-1), step = Math.max(1, Math.floor(p.length / 400));
  return { asOf: last.date, value: r1(last.value), brk, preMean: pre.length ? r1(mean(pre)) : null, postMean: post.length ? r1(mean(post)) : null, preN: pre.length, postN: post.length, pctPost: pctRank(post, last.value), series: p.filter((_, i) => i % step === 0 || i === p.length - 1).map(x => [x.date, r1(x.value)]), firstDate: p[0].date };
}

// ── Trend basket ─────────────────────────────────────────────────────────────────────────────────────────────────
export function trendBasket(tb) {
  if (!tb?.equity?.length) return null;
  const eq = tb.equity, step = Math.max(1, Math.floor(eq.length / 300));
  return { params: tb.params, asOf: tb.last, split: tb.splitDate, oos: tb.oos, all: tb.all, benchmark: tb.benchmark, current: tb.current ?? [], equity: eq.filter((_, i) => i % step === 0 || i === eq.length - 1).map(x => [x.t, x.v]), ccys: tb.ccys };
}
