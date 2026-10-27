/**
 * Live forward record of the three daily VIX/Nasdaq signals frozen on 2026-10-23 (forge/VIX_SIGNALS_FORWARD_PREREG.md), computed in the
 * browser from the site's daily market bundle so research-log.html is current without anyone re-running the scorer.
 *   1 vvix-ratio-range       R_a or R_b (20-session VVIX- or VIX-vs-Nasdaq realised-vol ratio) >= 90th pct of its last 252 -> VIX over 20 sessions (expect down)
 *   2 vix-beta-change        C.OG's dR/dt (5-session change of the 20-session VIX-on-Nasdaq slope) <= 10th pct            -> Nasdaq over 5 sessions (expect up)
 *   3 vix-second-derivative  5-session change of ln(VVIX/VXN) >= 90th pct                                                   -> Nasdaq over 20 sessions (expect up)
 * Rows: sessions where VIX, VVIX, VXN and the Nasdaq all have a close (the study panel's rule). Outcomes from the next close, as in every study.
 * A run of consecutive flag days is one event, dated by its first day. The page's Nasdaq is the NQ future in the bundle; the studies used the
 * Nasdaq-100 index, so a reading near a 10%/90% edge can differ. The canonical record is scripts/vix-signals-forward/score.py (same rules).
 * Pure: no fetch, no DOM, no clock. Parity with the study's pandas flags: js/vixForward.test.mjs against js/fixtures/vixForward.parity.json.
 */
import { WINDOW, LOOKBACK, BETA_STEP, BETA_MIN_KNOWN, vixBetaSeries, impliedRatioSeries } from './fearVsNasdaq.js';

export const FORWARD_START = '2026-10-26';
const fin = v => v != null && Number.isFinite(v);

/** pandas rolling(252, min_periods=200).rank(pct=True), ties averaged. */
export function pctSeries(x) {
  return x.map((v, t) => {
    if (!fin(v)) return null;
    const win = x.slice(Math.max(0, t - LOOKBACK + 1), t + 1).filter(fin); if (win.length < BETA_MIN_KNOWN) return null;
    let lt = 0, eq = 0; for (const w of win) { if (w < v) lt++; else if (w === v) eq++; }
    return (lt + (eq + 1) / 2) / win.length;
  });
}

/** 20-session realised-vol ratio sd(dln a) / sd(dln nq), sample SD (ddof 1, as pandas). */
export function volRatioSeries(a, nq) {
  const out = new Array(a.length).fill(null);
  for (let t = WINDOW; t < a.length; t++) {
    const da = [], dn = [];
    for (let k = t - WINDOW + 1; k <= t; k++) { da.push(Math.log(a[k] / a[k - 1])); dn.push(Math.log(nq[k] / nq[k - 1])); }
    const sd = v => { const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
    const d = sd(dn); out[t] = d > 0 ? sd(da) / d : null;
  }
  return out;
}

/** The three flags over the common rows. s = { dates, vix, vvix, vxn, nq } (same length, oldest first, nulls allowed). */
export function forwardFlags(s) {
  const n = Math.min(s?.dates?.length ?? 0, s?.vix?.length ?? 0, s?.vvix?.length ?? 0, s?.vxn?.length ?? 0, s?.nq?.length ?? 0), rows = [];
  for (let i = 0; i < n; i++) if ([s.vix[i], s.vvix[i], s.vxn[i], s.nq[i]].every(v => fin(v) && v > 0)) rows.push(i);
  const pick = k => rows.map(i => s[k][i]), vix = pick('vix'), vvix = pick('vvix'), vxn = pick('vxn'), nq = pick('nq'), dates = rows.map(i => s.dates[i]);
  const pa = pctSeries(volRatioSeries(vvix, nq)), pb = pctSeries(volRatioSeries(vix, nq));
  const pdr = vixBetaSeries(vix, nq).pct, pim = impliedRatioSeries(vvix, vxn).pct;     // both align trivially: every row is complete
  return { dates, vix, nq, pa, pb, pdr, pim,
    ratio: pa.map((a, t) => (fin(a) || fin(pb[t])) ? ((a ?? 0) >= 0.9 || (pb[t] ?? 0) >= 0.9) : null),
    drdt: pdr.map(p => fin(p) ? p <= 0.1 : null), implied: pim.map(p => fin(p) ? p >= 0.9 : null) };
}

const SIGNALS = [
  { id: 'vvix-ratio-range', key: 'ratio', label: 'Fear ran ahead of the Nasdaq (VIX/VVIX ratio top 10%)', on: 'vix', h: 20, expect: -1, backtest: 'VIX about −2.3% raw (−7% allowing for the VIX level) vs −0.2% normally' },
  { id: 'vix-beta-change', key: 'drdt', label: "C.OG's dR/dt bottom 10%", on: 'nq', h: 5, expect: +1, backtest: 'Nasdaq +0.76% vs +0.33% normally' },
  { id: 'vix-second-derivative', key: 'implied', label: 'VVIX/VXN jumped (top 10% of its 5-session change)', on: 'nq', h: 20, expect: +1, backtest: 'Nasdaq +2.5% vs +1.3% normally' },
];

/** Events from `start` with their outcomes so far. */
export function forwardRecord(s, start = FORWARD_START) {
  const F = forwardFlags(s); if (!F.dates.length) return null;
  const T = F.dates.length - 1;
  const signals = SIGNALS.map(sig => {
    const flag = F[sig.key], px = F[sig.on], events = [];
    let busy = -1;
    for (let t = 0; t <= T; t++) {
      if (!flag[t] || (t > 0 && flag[t - 1]) || F.dates[t] < start) continue;
      const a = t + 1, b = t + 1 + sig.h, done = b <= T, upto = Math.min(b, T);
      const move = a <= T ? Math.round((px[upto] / px[a] - 1) * 10000) / 100 : null;
      const counted = t >= busy; if (counted) busy = b;
      events.push({ date: F.dates[t], movePct: move, complete: done, sessionsLeft: done ? 0 : b - Math.max(T, a - 1), counted });
    }
    const scored = events.filter(e => e.complete && e.counted).map(e => e.movePct);
    return { ...sig, events, nScored: scored.length, meanPct: scored.length ? Math.round(scored.reduce((x, y) => x + y, 0) / scored.length * 100) / 100 : null,
      todayOn: !!flag[T], todayPct: sig.key === 'ratio' ? Math.max(F.pa[T] ?? 0, F.pb[T] ?? 0) : sig.key === 'drdt' ? F.pdr[T] : F.pim[T] };
  });
  return { lastClose: F.dates[T], start, signals };
}
