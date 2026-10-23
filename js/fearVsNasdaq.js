/**
 * "Fear versus the Nasdaq": has the VIX (or the VVIX, the volatility of the VIX) been moving far more than the Nasdaq?
 *
 * This is C.OG's idea (Discord, 2026-10-23: "the ratio between how VVIX and Nasdaq are pricing in information ... when that ratio is at an extreme, what then
 * happens"), pre-registered and run the same day (forge/VVIX_NASDAQ_RATIO_PREREG.md, ledger `vvix-ratio-range` VALIDATED, `vvix-ratio-direction`
 * UNDERPOWERED). The finding: when the 20-session ratio of VIX (or VVIX) moves to Nasdaq moves is in the top decile of its own last year, the VIX has
 * tended to fall about 7% over the next month, beyond what the VIX's own state predicts (t -3.1, all three periods, placebo, leave-one-year-out). It is a
 * volatility read. The Nasdaq's own direction after it came out underpowered, so nothing here says which way stocks go.
 *
 * Construction, as pre-registered (so a reading here is the study's reading):
 *   ratio R = sd(daily change in ln VIX) / sd(daily change in ln Nasdaq) over the last 20 sessions   (R_b; the same with VVIX is R_a)
 *   extreme = the ratio's percentile among its own last 252 sessions, today included; top decile is 90% or more
 * The page's Nasdaq is the NQ future from the market bundle, the study used the Nasdaq-100 index from FRED, so the two can differ at the edges.
 *
 * It is a CALMING signal: the opposite kind from the range-pressure gauge (js/rangePressure.js), so it sits beside that gauge and never subtracts from it.
 *
 * Pure: no fetch, no DOM, no clock. Tested in js/fearVsNasdaq.test.mjs.
 */
const fin = v => v != null && Number.isFinite(v);
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
export const WINDOW = 20, LOOKBACK = 252, TOP = 0.9;

/** s = { vix, vvix, nq }: daily closes, oldest first, same dates, nulls allowed. Returns null when there is not enough aligned history. */
export function fearVsNasdaq(s) {
  const n = Math.min(s?.vix?.length ?? 0, s?.vvix?.length ?? 0, s?.nq?.length ?? 0), rows = [];
  for (let i = 0; i < n; i++) if (fin(s.vix[i]) && fin(s.vvix[i]) && fin(s.nq[i]) && s.vix[i] > 0 && s.vvix[i] > 0 && s.nq[i] > 0) rows.push([Math.log(s.vix[i]), Math.log(s.vvix[i]), Math.log(s.nq[i])]);
  const d = k => rows.slice(1).map((r, i) => r[k] - rows[i][k]);
  const dv = d(0), dw = d(1), dn = d(2);
  if (dn.length < LOOKBACK + WINDOW - 1) return null;
  const ratioAt = (dx, t) => { const den = sd(dn.slice(t - WINDOW + 1, t + 1)); return den > 0 ? sd(dx.slice(t - WINDOW + 1, t + 1)) / den : null; };
  const T = dn.length - 1, build = dx => {
    const hist = []; for (let t = T - LOOKBACK + 1; t <= T; t++) hist.push(ratioAt(dx, t));
    const now = hist.at(-1); if (!fin(now)) return null;
    const known = hist.filter(fin), pct = known.filter(x => x <= now).length / known.length;
    return { ratio: Math.round(now * 100) / 100, pct: Math.round(pct * 100), on: pct >= TOP };
  };
  const b = build(dv), a = build(dw); if (!a && !b) return null;
  const on = !!(a?.on || b?.on), top = Math.max(a?.pct ?? 0, b?.pct ?? 0);
  return { a, b, on, top, evidence: 'vvix-ratio-range' };
}

/** Plain words for the reading. */
export function fearWords(f) {
  if (!f) return '';
  if (f.on) return `Fear has run ahead of the Nasdaq. Over the last 20 sessions the VIX${f.a?.on ? ' and the VVIX (the volatility of the VIX)' : ''} ${f.a?.on && f.b?.on ? 'have' : 'has'} moved far more than the Nasdaq, in the top tenth of the past year. After that, the VIX has tended to give back about 7% over the following month. It is a read on volatility. It does not say which way stocks will go.`;
  return `Fear versus the Nasdaq is at the ${f.top}th percentile of its past year, below the top-tenth level (90th) that has gone with the VIX giving back about 7% over the next month. It is a read on volatility only. It does not say which way stocks will go.`;
}

/*
 * C.OG's dR/dt (Discord 2026-10-23, education/cog-snippets.md §3b): R = the signed % change of the VIX per % change of the Nasdaq, and how fast it is changing.
 * Pre-registered and run the same day (forge/VIX_NASDAQ_BETA_PREREG.md, ledger `vix-beta-change` VALIDATED research-only, `vix-beta-level` UNDERPOWERED).
 *   R over a window = slope of daily change in ln VIX on daily change in ln Nasdaq over the last 20 sessions (normally about -5)
 *   dR/dt          = R today minus R five sessions ago
 *   extreme        = dR/dt's percentile among its own last 252 sessions (at least 200 known), today included; bottom tenth is 10% or less
 * The finding: in the bottom tenth (the VIX has just started reacting much harder against the Nasdaq) the Nasdaq's next 5 sessions, from the next close,
 * averaged +0.76% (up 67% of days) against +0.33% (60%) on all days, 2009-09 to 2026-08-21. All-controls t 2.91 is under the |t| 3 bar, so it is a
 * research reading, not a trade signal. Parity with the study's pandas code: js/fearVsNasdaq.test.mjs against js/fixtures/vixBeta.parity.json.
 */
export const BETA_STEP = 5, BETA_MIN_KNOWN = 200, BOTTOM = 0.1;

/** Full series over the rows where both closes exist. vix, nq: daily closes oldest first, same dates. Returns { idx, beta, change, pct } (pct 0..1). */
export function vixBetaSeries(vix, nq) {
  const idx = [], lv = [], ln = [], n = Math.min(vix?.length ?? 0, nq?.length ?? 0);
  for (let i = 0; i < n; i++) if (fin(vix[i]) && fin(nq[i]) && vix[i] > 0 && nq[i] > 0) { idx.push(i); lv.push(Math.log(vix[i])); ln.push(Math.log(nq[i])); }
  const m = idx.length, beta = new Array(m).fill(null), change = new Array(m).fill(null), pct = new Array(m).fill(null);
  for (let t = WINDOW; t < m; t++) {
    let sx = 0, sy = 0; for (let k = t - WINDOW + 1; k <= t; k++) { sx += ln[k] - ln[k - 1]; sy += lv[k] - lv[k - 1]; }
    const mx = sx / WINDOW, my = sy / WINDOW; let cxy = 0, cxx = 0;
    for (let k = t - WINDOW + 1; k <= t; k++) { const x = ln[k] - ln[k - 1] - mx; cxy += x * (lv[k] - lv[k - 1] - my); cxx += x * x; }
    beta[t] = cxx > 0 ? cxy / cxx : null;
    if (t >= BETA_STEP && fin(beta[t]) && fin(beta[t - BETA_STEP])) change[t] = beta[t] - beta[t - BETA_STEP];
  }
  for (let t = 0; t < m; t++) {
    if (!fin(change[t])) continue;
    const win = change.slice(Math.max(0, t - LOOKBACK + 1), t + 1).filter(fin); if (win.length < BETA_MIN_KNOWN) continue;
    const x = change[t]; let lt = 0, eq = 0; for (const v of win) { if (v < x) lt++; else if (v === x) eq++; }
    pct[t] = (lt + (eq + 1) / 2) / win.length;                                    // pandas rank(pct=True), ties averaged
  }
  return { idx, beta, change, pct };
}

/** Today's reading plus the flag days in the last year with what the Nasdaq did over the 5 sessions after the next close. s = { vix, nq, dates? }. */
export function vixBeta(s) {
  const S = vixBetaSeries(s?.vix, s?.nq), T = S.idx.length - 1;
  if (T < 0 || !fin(S.pct[T])) return null;
  const nq = s.nq, flags = [];
  for (let t = Math.max(0, T - LOOKBACK + 1); t <= T; t++) {
    if (!(S.pct[t] <= BOTTOM) || (t > 0 && S.pct[t - 1] <= BOTTOM)) continue;      // first day of each run only
    const a = S.idx[t + 1], b = S.idx[t + 1 + BETA_STEP];
    flags.push({ date: s.dates?.[S.idx[t]] ?? null, nq5: a != null && b != null ? Math.round((nq[b] / nq[a] - 1) * 10000) / 100 : null });
  }
  return { beta: Math.round(S.beta[T] * 100) / 100, change: Math.round(S.change[T] * 100) / 100, pct: Math.round(S.pct[T] * 100), on: S.pct[T] <= BOTTOM, flags, evidence: 'vix-beta-change' };
}

/** Plain words. It is a research reading and says so in both states. */
export function vixBetaWords(v) {
  if (!v) return '';
  const tail = 'Research only: it needs a costed rule and a forward record before it can be traded.';
  if (v.on) return `C.OG's dR/dt is in its bottom tenth (${v.pct}th percentile of the past year): over the last week the VIX has started reacting much harder against the Nasdaq. In the 2009-2026 test, the Nasdaq's next 5 sessions after this averaged +0.76% (higher on 67% of occasions) against +0.33% (60%) on all days. ${tail}`;
  return `C.OG's dR/dt, how fast the VIX's reaction to the Nasdaq is changing, is at the ${v.pct}th percentile of its past year. The research reading is the bottom tenth (10th or below), after which the Nasdaq's next 5 sessions averaged +0.76% against +0.33% on all days. ${tail}`;
}

/*
 * dR/dt of the IMPLIED ratio (vix-calculus part C2, forge/VIX_CALCULUS_PREREG.md, ledger `vix-second-derivative`, research only).
 * Jordan's card puts the priced-in "VIX % per 1% Nasdaq" at R = VVIX / VXN. Its 5-session change in logs, ln(VVIX/VXN) today minus five sessions ago,
 * in the top tenth of its own last 252 sessions (>= 200 known, today included) means the option market has just started pricing the VIX's own swings
 * far more richly than the Nasdaq's. The finding: the Nasdaq's next 20 sessions from the next close averaged +2.5% (higher 76% of the time) against
 * +1.3% (66%) on all days, 2009-2026; beyond the VIX state t 3.04, all periods, placebo; with every control t 2.42, so research only.
 * Parity with the study's pandas code: js/fearVsNasdaq.test.mjs against js/fixtures/impliedRatio.parity.json.
 */
export const IMP_STEP = 5, IMP_TOP = 0.9, IMP_HOLD = 20;

/** Full series over rows where VVIX and VXN both exist: { idx, change, pct } (pct 0..1). */
export function impliedRatioSeries(vvix, vxn) {
  const idx = [], lr = [], n = Math.min(vvix?.length ?? 0, vxn?.length ?? 0);
  for (let i = 0; i < n; i++) if (fin(vvix[i]) && fin(vxn[i]) && vvix[i] > 0 && vxn[i] > 0) { idx.push(i); lr.push(Math.log(vvix[i] / vxn[i])); }
  const m = idx.length, change = new Array(m).fill(null), pct = new Array(m).fill(null);
  for (let t = IMP_STEP; t < m; t++) change[t] = lr[t] - lr[t - IMP_STEP];
  for (let t = 0; t < m; t++) {
    if (!fin(change[t])) continue;
    const win = change.slice(Math.max(0, t - LOOKBACK + 1), t + 1).filter(fin); if (win.length < BETA_MIN_KNOWN) continue;
    const x = change[t]; let lt = 0, eq = 0; for (const v of win) { if (v < x) lt++; else if (v === x) eq++; }
    pct[t] = (lt + (eq + 1) / 2) / win.length;
  }
  return { idx, change, pct };
}

/** Today's reading plus the past year's flag runs with the Nasdaq's next 20 sessions after the next close. s = { vvix, vxn, nq, dates? }. */
export function impliedRatioChange(s) {
  const S = impliedRatioSeries(s?.vvix, s?.vxn), T = S.idx.length - 1;
  if (T < 0 || !fin(S.pct[T])) return null;
  const nq = s.nq ?? [], flags = [], ok = i => i != null && fin(nq[i]) && nq[i] > 0;
  for (let t = Math.max(0, T - LOOKBACK + 1); t <= T; t++) {
    if (!(S.pct[t] >= IMP_TOP) || (t > 0 && S.pct[t - 1] >= IMP_TOP)) continue;
    const a = S.idx[t + 1], b = S.idx[t + 1 + IMP_HOLD];
    flags.push({ date: s.dates?.[S.idx[t]] ?? null, nq20: ok(a) && ok(b) ? Math.round((nq[b] / nq[a] - 1) * 10000) / 100 : null });
  }
  const i = S.idx[T];
  return { ratio: Math.round(s.vvix[i] / s.vxn[i] * 100) / 100, change5: Math.round((Math.exp(S.change[T]) - 1) * 1000) / 10, pct: Math.round(S.pct[T] * 100), on: S.pct[T] >= IMP_TOP, flags, evidence: 'vix-second-derivative' };
}

/** Plain words; research only in both states. */
export function impliedRatioWords(v) {
  if (!v) return '';
  const tail = 'Research only: it needs a costed rule and a forward record before it can be traded.';
  if (v.on) return `The priced-in ratio VVIX/VXN (${v.ratio}) has risen ${v.change5 > 0 ? '+' : ''}${v.change5}% in 5 sessions, in the top tenth of its past year (${v.pct}th percentile): options have just started pricing the VIX's own swings far more richly than the Nasdaq's. In the 2009-2026 test the Nasdaq's next 20 sessions after this averaged +2.5% (higher on 76% of occasions) against +1.3% (66%) on all days. ${tail}`;
  return `The priced-in ratio VVIX/VXN is ${v.ratio}; its 5-session change (${v.change5 > 0 ? '+' : ''}${v.change5}%) is at the ${v.pct}th percentile of its past year. The research reading is the top tenth (90th or above), after which the Nasdaq's next 20 sessions averaged +2.5% against +1.3% on all days. ${tail}`;
}
