// js/spreadEpisodes.js — live read of spread-turn episodes (forge/SPREAD_EPISODES_PREREG.md, scripts/spread-episodes/).
//
// A JavaScript copy of the research pipeline, so the live monitor and the page use exactly the rules that were
// tested: a causal adaptive zig-zag (threshold k x trailing RMS of h-bar changes, shifted one session), turn time
// (the extreme) and confirmation time (first bar the retrace reaches the threshold), the adaptive expected direction
// (sign of the trailing same-bar link), the C1/C2 confirmations, the episode tags, and outcomes in sigma units.
//   Case 1: SOFR Sep26 (SR3U6) - Euribor Mar27 (IH7) rate spread in bp vs NAS100, 15-minute bars stamped at bar END.
//   Case 2: (US 2Y + US 10Y) / 2 vs EURUSD, daily; entry the day after confirmation.
// js/spreadEpisodes.test.mjs checks it against the Python run's exported events. Pure: no fetch, no DOM.

export const CASE1 = { H: { '1h': 4, '4h': 16, '8h': 32, '24h': 96 }, off: 0, Lp: 92, Lx: 460, primH: '4h', refH: 16, lookback: 20 };
export const CASE2 = { H: { '1d': 1, '3d': 3, '5d': 5, '10d': 10, '20d': 20 }, off: 1, Lp: 20, Lx: 60, primH: '5d', refH: 5, lookback: 250 };
export const PRIMARY_K = 0.75;
export const TYPES = ['up', 'down', 'toward_mean', 'away_mean', 'with_trend', 'against_trend', 'prior_aligned', 'prior_diverged'];

const fin = v => typeof v === 'number' && Number.isFinite(v);
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

// ── causal zig-zag (identical state machine to scripts/spread-episodes/common.py:zigzag) ──
export function zigzag(x, th) {
  const tu = [], co = [], di = [];
  let trend = 0, hi = NaN, lo = NaN, ext = NaN, hiI = -1, loI = -1, extI = -1;
  for (let t = 0; t < x.length; t++) {
    const v = x[t], k = th[t];
    if (!(fin(v) && fin(k) && k > 0)) continue;
    if (trend === 0) {
      if (!fin(hi)) { hi = lo = v; hiI = loI = t; }
      if (v > hi) { hi = v; hiI = t; }
      if (v < lo) { lo = v; loI = t; }
      if (v - lo >= k) { trend = 1; tu.push(loI); co.push(t); di.push(1); ext = v; extI = t; }
      else if (hi - v >= k) { trend = -1; tu.push(hiI); co.push(t); di.push(-1); ext = v; extI = t; }
    } else if (trend === 1) {
      if (v > ext) { ext = v; extI = t; }
      else if (ext - v >= k) { trend = -1; tu.push(extI); co.push(t); di.push(-1); ext = v; extI = t; }
    } else {
      if (v < ext) { ext = v; extI = t; }
      else if (v - ext >= k) { trend = 1; tu.push(extI); co.push(t); di.push(1); ext = v; extI = t; }
    }
  }
  return { tu, co, di, state: { trend, ext, extI } };
}

// ── rolling helpers with pandas semantics (min_periods counts finite values) ──
function rollMean(a, w, minP) {
  const out = new Array(a.length).fill(NaN);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) if (fin(a[j])) { s += a[j]; n++; }
    if (n >= minP) out[i] = s / n;
  }
  return out;
}
function rollSum(a, w, minP) {
  const out = new Array(a.length).fill(NaN);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) if (fin(a[j])) { s += a[j]; n++; }
    if (n >= minP) out[i] = s;
  }
  return out;
}
function rollCorr(a, b, w, minP) {
  const out = new Array(a.length).fill(NaN);
  for (let i = 0; i < a.length; i++) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) if (fin(a[j]) && fin(b[j])) { n++; sa += a[j]; sb += b[j]; saa += a[j] * a[j]; sbb += b[j] * b[j]; sab += a[j] * b[j]; }
    if (n >= minP) { const c = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n; out[i] = va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : NaN; }
  }
  return out;
}
function rollRankPct(a, w, minP) {          // pandas rolling(w).rank(pct=True): average rank of the last value / count
  const out = new Array(a.length).fill(NaN);
  for (let i = 0; i < a.length; i++) {
    if (!fin(a[i])) continue;
    let n = 0, less = 0, eq = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) if (fin(a[j])) { n++; if (a[j] < a[i]) less++; else if (a[j] === a[i]) eq++; }
    if (n >= minP) out[i] = (less + (eq + 1) / 2) / n;
  }
  return out;
}
function expandingMedianShift1(a, minP) {
  const out = new Array(a.length).fill(NaN), seen = [];
  for (let i = 0; i < a.length; i++) {
    if (seen.length >= minP) { const s = [...seen].sort((p, q) => p - q), m = s.length >> 1; out[i] = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
    if (fin(a[i])) seen.push(a[i]);
  }
  return out;
}
const shift1 = a => [NaN, ...a.slice(0, -1)];

// Per-session aggregate -> rolling over sessions -> shifted one session -> mapped back to bars.
function sessionIds(sess) { const ids = []; let last = null; for (const s of sess) { if (s !== last) { ids.push(s); last = s; } } return ids; }
function perSession(sess, vals, agg) {
  const ids = sessionIds(sess), pos = new Map(ids.map((s, i) => [s, i])), acc = ids.map(() => []);
  sess.forEach((s, i) => { if (fin(vals[i])) acc[pos.get(s)].push(vals[i]); });
  return { ids, pos, v: acc.map(a => (a.length ? agg(a) : NaN)) };
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

export function rmsScaleBySession(x, sess, h, lookback = 20) {
  const d = x.map((v, i) => (i >= h ? v - x[i - h] : NaN));
  const S = perSession(sess, d.map(v => v * v), mean);
  const sc = shift1(rollMean(S.v, lookback, Math.max(5, Math.floor(lookback / 2)))).map(Math.sqrt);
  return sess.map(s => sc[S.pos.get(s)]);
}
export function rmsScaleRows(x, h, lookback = 250) {
  const d2 = x.map((v, i) => (i >= h ? (v - x[i - h]) ** 2 : NaN));
  return shift1(rollMean(d2, lookback, Math.floor(lookback / 2))).map(Math.sqrt);
}

// ── Case 1 bars: legs (15-min, bar OPEN time t, close c) + NAS100 15-min candles (open time) -> flat series ──
export function buildCase1({ sofr, eur, nas }) {
  const end = b => b.t + 900;
  const S = new Map(sofr.map(b => [end(b), b.c])), E = new Map(eur.map(b => [end(b), b.c]));
  const dayOf = te => new Date((te - 1) * 1000).toISOString().slice(0, 10);
  // quality screen: >= 3 distinct 15-min prices on each leg in the UTC day
  const distinct = m => { const g = new Map(); for (const [t, c] of m) { const d = dayOf(t); if (!g.has(d)) g.set(d, new Set()); g.get(d).add(c); } return g; };
  const dS = distinct(S), dE = distinct(E);
  const T = [], x = [], p = [], sess = [], slot = [];
  for (const b of nas) {
    const te = end(b), d = dayOf(te), wd = new Date((te - 1) * 1000).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const s = S.get(te), e = E.get(te);
    if (!fin(s) || !fin(e) || !fin(b.c ?? b.close)) continue;
    if ((dS.get(d)?.size ?? 0) < 3 || (dE.get(d)?.size ?? 0) < 3) continue;
    T.push(te); x.push(((100 - s) - (100 - e)) * 100); p.push(Math.log(b.c ?? b.close)); sess.push(d);
    slot.push(Math.floor(((te - 1) % 86400) / 900));
  }
  return finishCase1({ T, x, p, sess, slot });
}

export function finishCase1({ T, x, p, sess, slot }) {
  const C = CASE1, n = x.length;
  const F = { kind: 'case1', cfg: C, T, x, p, sess, n, hour: slot.map(s => Math.floor(s / 4)) };
  F.B = rmsScaleBySession(x, sess, 16, C.lookback);
  F.sig = {}; for (const v of new Set([...Object.values(C.H), 16])) F.sig[v] = rmsScaleBySession(p, sess, v, C.lookback);
  const dx = x.map((v, i) => (i && sess[i] === sess[i - 1] ? v - x[i - 1] : NaN)), dp = p.map((v, i) => (i && sess[i] === sess[i - 1] ? v - p[i - 1] : NaN));
  F.dx = dx; F.dp = dp;
  const ok = i => fin(dx[i]) && fin(dp[i]);
  const ids = sessionIds(sess), pos = new Map(ids.map((s, i) => [s, i])), xy = ids.map(() => NaN), xx = ids.map(() => NaN), yy = ids.map(() => NaN);
  for (let i = 0; i < n; i++) if (ok(i)) { const k = pos.get(sess[i]); xy[k] = (fin(xy[k]) ? xy[k] : 0) + dx[i] * dp[i]; xx[k] = (fin(xx[k]) ? xx[k] : 0) + dx[i] * dx[i]; yy[k] = (fin(yy[k]) ? yy[k] : 0) + dp[i] * dp[i]; }
  const rc = w => { const mp = Math.max(3, Math.floor(w / 2)), a = rollSum(xy, w, mp), b = rollSum(xx, w, mp), c = rollSum(yy, w, mp); return shift1(a.map((v, i) => v / Math.sqrt(b[i] * c[i]))); };
  const sc = rc(20), cp = rc(5);
  const thr = expandingMedianShift1(sc.map(Math.abs), 10);
  const cpa = cp.map((v, i) => v * sign(sc[i]));
  const ctile = rollRankPct(cpa, 120, 40).map(v => (fin(v) ? Math.ceil(v * 3) : NaN));
  const dm = perSession(sess, x, mean).v, tm = shift1(rollMean(dm, 20, 10));
  const s16 = perSession(sess, F.sig[16], a => a[0]).v, vtile = rollRankPct(s16, 120, 40).map(v => (fin(v) ? Math.ceil(v * 3) : NaN));
  const at = arr => sess.map(s => arr[pos.get(s)]);
  F.scorr = at(sc); F.coup = at(cp); F.strongThr = at(thr); F.coupTile = at(ctile); F.tmean = at(tm); F.volTile = at(vtile);
  // today's realised same-bar link (the session in progress)
  return F;
}

// ── Case 2 rows: FRED yields [{date, value}] x2 + EURUSD daily [{date, close}] ──
export function buildCase2({ y2, y10, fx }) {
  const A = new Map(y2.map(o => [o.date, o.value])), B = new Map(y10.map(o => [o.date, o.value]));
  const dates = [], x = [], p = [];
  for (const f of [...fx].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const a = A.get(f.date), b = B.get(f.date);
    if (!fin(a) || !fin(b) || !fin(f.close)) continue;
    dates.push(f.date); x.push((a + b) / 2); p.push(Math.log(f.close));
  }
  return finishCase2({ dates, x, p });
}

export function finishCase2({ dates, x, p }) {
  const C = CASE2, n = x.length;
  const F = { kind: 'case2', cfg: C, dates, x, p, n, T: dates.map(d => Date.parse(d + 'T00:00:00Z') / 1000) };
  F.B = rmsScaleRows(x, 5, 250);
  F.sig = {}; for (const v of new Set([...Object.values(C.H), 5])) F.sig[v] = rmsScaleRows(p, v, 250);
  F.dx = x.map((v, i) => (i ? v - x[i - 1] : NaN)); F.dp = p.map((v, i) => (i ? v - p[i - 1] : NaN));
  const sc = shift1(rollCorr(F.dx, F.dp, 250, 120)), cp = shift1(rollCorr(F.dx, F.dp, 60, 30));
  F.scorr = sc; F.coup = cp;
  F.strongThr = expandingMedianShift1(sc.map(Math.abs), 60);
  F.coupTile = rollRankPct(cp.map((v, i) => v * sign(sc[i])), 120, 40).map(v => (fin(v) ? Math.ceil(v * 3) : NaN));
  F.tmean = shift1(rollMean(x, 60, 30));
  F.volTile = rollRankPct(F.sig[5], 120, 40).map(v => (fin(v) ? Math.ceil(v * 3) : NaN));
  return F;
}

// ── events, tags, outcomes, current state ──
export function analyse(F, { k = PRIMARY_K } = {}) {
  const C = F.cfg, { x, p, n } = F;
  const th = F.B.map(b => k * b);
  const Z = zigzag(x, th);
  const events = Z.co.map((c, j) => {
    const tu = Z.tu[j], di = Z.di[j], s = sign(F.scorr[c]), e = s * di;
    const y = {};
    for (const [h, v] of Object.entries(C.H)) {
      const a = c + C.off, b = c + C.off + v, sg = F.sig[v][c];
      y[h] = b < n && e !== 0 && fin(sg) ? +(e * (p[b] - p[a]) / sg).toFixed(3) : null;
    }
    const tm = F.tmean[c], lb = tu - C.Lx, xt = lb >= 0 ? x[lb] : NaN, prevTu = j ? Z.tu[j - 1] : -1;
    const pm = prevTu >= 0 ? sign(p[tu] - p[prevTu]) : NaN;
    const tags = [];
    if (di > 0) tags.push('up'); else tags.push('down');
    if (fin(tm)) tags.push(di === sign(tm - x[tu]) ? 'toward_mean' : 'away_mean');
    if (fin(xt) && x[tu] !== xt) tags.push(di === sign(x[tu] - xt) ? 'with_trend' : 'against_trend');
    if (prevTu >= 0 && fin(pm)) tags.push(pm * s === -di ? 'prior_aligned' : 'prior_diverged');
    const c1 = e * (p[c] - p[tu]) > 0, c2 = Math.abs(F.scorr[c]) >= F.strongThr[c];
    const lp = Math.max(0, c - C.Lp), ptr = sign(p[c] - p[lp]);
    return {
      turnT: F.T[tu], confT: F.T[c], turnIdx: tu, confIdx: c, dir: di, e, linkSign: s,
      spreadTurn: +x[tu].toFixed(3), spreadConf: +x[c].toFixed(3), priceConf: +Math.exp(p[c]).toFixed(F.kind === 'case2' ? 5 : 1),
      delayBars: c - tu, C1: c1, C2: c2, coupTile: fin(F.coupTile[c]) ? F.coupTile[c] : null, volTile: fin(F.volTile[c]) ? F.volTile[c] : null,
      priceTrend: e && ptr ? (e === ptr ? 'with' : 'against') : null, hour: F.hour ? F.hour[c] : null,
      full: c1 && c2 && F.coupTile[c] === 3, tags, y,
      outcome: Object.fromEntries(Object.entries(y).map(([h, v]) => [h, v == null ? null : v >= 0.5 ? 'follow' : v <= -0.5 ? 'revert' : 'nothing'])),
    };
  });
  // current leg and the level that would confirm the next turn
  const last = n - 1, st = Z.state, thNow = th[last];
  const pending = st.trend !== 0 && fin(thNow) ? { legDir: st.trend, extreme: +st.ext.toFixed(3), extremeT: F.T[st.extI], confirmAt: +(st.ext - st.trend * thNow).toFixed(3), threshold: +thNow.toFixed(3),
    retraced: +(st.trend * (st.ext - x[last]) / thNow).toFixed(2) } : null;
  // the same-bar link right now
  let today = null;
  if (F.kind === 'case1') {
    const s0 = F.sess[last], idx = []; for (let i = last; i >= 0 && F.sess[i] === s0; i--) if (fin(F.dx[i]) && fin(F.dp[i])) idx.push(i);
    today = { session: s0, bars: idx.length, corr: idx.length >= 8 ? +corr(idx.map(i => F.dx[i]), idx.map(i => F.dp[i])).toFixed(3) : null };
  } else {
    const idx = []; for (let i = Math.max(1, last - 59); i <= last; i++) if (fin(F.dx[i]) && fin(F.dp[i])) idx.push(i);
    today = { window: '60 rows', corr: idx.length >= 20 ? +corr(idx.map(i => F.dx[i]), idx.map(i => F.dp[i])).toFixed(3) : null };
  }
  return {
    kind: F.kind, k, asOfT: F.T[last], n,
    now: { spread: +x[last].toFixed(3), price: +Math.exp(p[last]).toFixed(F.kind === 'case2' ? 5 : 1), linkSign: sign(F.scorr[last]), link20: fin(F.scorr[last]) ? +F.scorr[last].toFixed(3) : null,
           strong: Math.abs(F.scorr[last]) >= F.strongThr[last], coupTile: fin(F.coupTile[last]) ? F.coupTile[last] : null, today, pending },
    events,
  };
}

function corr(a, b) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : NaN;
}

// Alert text for a newly confirmed turn. `hist` = { pFollow, pRevert, mean, n, label } from the research table for the
// primary horizon (results_case*.json type_table / conditions), so the message carries the measured base rate.
export function alertText(caseLabel, ev, hist, unitLabel) {
  const arrow = ev.dir > 0 ? 'UP' : 'DOWN';
  const exp = ev.e > 0 ? 'price UP' : ev.e < 0 ? 'price DOWN' : 'no expected direction (link sign 0)';
  const seq = [ev.C1 ? 'price already started' : 'price not yet moving', ev.C2 ? 'link strong' : 'link weak', ev.coupTile ? `coupling tercile ${ev.coupTile}/3` : 'coupling n/a'].join(' · ');
  const h = hist ? `History (${hist.label}): follow ${(100 * hist.pFollow).toFixed(0)}%, revert ${(100 * hist.pRevert).toFixed(0)}%, mean ${hist.mean >= 0 ? '+' : ''}${hist.mean.toFixed(2)}σ, n ${hist.n}.` : '';
  return `🔀 ${caseLabel}: spread turn ${arrow} confirmed (${unitLabel} ${ev.spreadTurn} → ${ev.spreadConf}, ${ev.delayBars} bars after the turn). Expected if the link holds: ${exp}.\n${seq}${ev.full ? ' — FULL SEQUENCE' : ''}\n${h}\nContext only: no forward edge passed the registered test (forge/SPREAD_EPISODES_PREREG.md).`;
}
