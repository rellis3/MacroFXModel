/**
 * "This exact price action is what broke the market in June."
 *
 * That sentence is the most persuasive thing a desk commentator says, and it is almost
 * always unsupported — one remembered episode, chosen because it fits. The claim is
 * worth making, but only with every comparable episode in front of you rather than the
 * one that makes the point.
 *
 * So: take today's configuration, find every past day that looked like it, and report
 * what actually followed each time. Not the best case, not the remembered case — all
 * of them, as a spread.
 *
 * HOW SIMILARITY IS MEASURED. A configuration is a handful of standardised readings
 * (how stretched each market is against its own history). Two days are similar when
 * those readings are close, measured as ordinary Euclidean distance over the z-vector.
 * Standardising first is what makes a bond move and a gold move comparable at all.
 *
 * THE RULES THAT KEEP IT HONEST, and they matter more than the method:
 *
 *  - Episodes are DE-CLUSTERED. Adjacent days look almost identical, so without this
 *    "twenty past matches" is really two episodes counted ten times each, and the
 *    spread of outcomes collapses to nothing. Minimum 20 sessions apart.
 *  - The recent window is EXCLUDED. The most similar day to today is yesterday, and it
 *    has no outcome yet. Anything inside the outcome horizon is dropped.
 *  - Outcomes are reported as a SPREAD, never a mean. "Eight of twelve were higher" and
 *    a range is the honest summary; an average of twelve episodes is a number that
 *    describes none of them.
 *  - Direction is reported because a reader will compute it anyway, but the count is
 *    shown as a count, so a 7-of-12 reads as the coin flip it is.
 *
 * WHAT THIS IS NOT. It is not a forecast and it is not a tested edge. Nothing here has
 * been through this desk's pre-registration pipeline, and the sample sizes are small by
 * construction. It is history, arranged so the "this happened before" claim can be
 * checked instead of believed. Turning any of it into a trigger needs a pre-registered
 * study first.
 *
 * Pure: no fetch, no DOM. Tested in js/analogue.test.mjs.
 */
import { BOARD } from './marketScan.js';

const WINDOW = 20;        // the move length that defines a configuration
const HIST = 750;         // standardise against ~3 years, as the rest of the board does
const APART = 20;         // minimum sessions between episodes, so they are not the same one
const MIN_HIST = 120;

const at = (b, k, i) => b?.series?.[k]?.[i] ?? null;
const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
const BACK = 6;

/** The units the board carries each series in, so the change is computed correctly. */
const KIND = Object.fromEntries(BOARD.map(b => [b.key, b.kind]));

/**
 * The last real print at or before `i`.
 *
 * The bundle's spine is the union of every source's calendar and FRED settles a session
 * behind OANDA, so `tips`, `us2y`, `vix` and `hy` are all null on the newest date. Read
 * the final index directly and the whole engine returns null every day the FX feed
 * printed and the rates feed had not yet — which is what it did on its first live run.
 */
function lastAt(b, k, i) {
  for (let j = i; j >= 0 && j > i - BACK; j--) { const v = at(b, k, j); if (v != null) return { v, j }; }
  return null;
}

/**
 * The 20-session change of one series at i.
 *
 * The unit comes from the board rather than from a guess about the number's size. The
 * first version inferred it ("if the ratio looks sane, treat it as a price") and that
 * silently mis-handled anything that could cross zero — a yield gap at -0.02 would read
 * as a 5,000% move on its way to +0.03.
 */
function chg(b, k, i, w = WINDOW) {
  const now = lastAt(b, k, i);
  if (!now) return null;
  const then = lastAt(b, k, now.j - w);
  if (!then) return null;
  const kind = KIND[k] ?? 'price';
  if (kind === 'price') return Math.abs(then.v) > 1e-9 ? (now.v / then.v - 1) * 100 : null;
  if (kind === 'rate' || kind === 'gap') return (now.v - then.v) * 100;      // percent -> bp
  return now.v - then.v;                                                     // level, usd
}

/**
 * Standardise each dimension's change against its own trailing history, giving a
 * comparable vector per day. Returns `{ z: number[][], ok: boolean[] }` aligned to dates.
 */
function zVectors(bundle, keys) {
  const N = bundle?.dates?.length ?? 0;
  const raw = keys.map(k => { const s = []; for (let i = 0; i < N; i++) s.push(chg(bundle, k, i)); return s; });
  const z = [], ok = [];
  for (let i = 0; i < N; i++) {
    const v = [];
    let good = true;
    for (let d = 0; d < keys.length; d++) {
      const hist = [];
      for (let j = Math.max(WINDOW, i - HIST); j <= i; j++) { const c = raw[d][j]; if (c != null) hist.push(c); }
      if (hist.length < MIN_HIST || raw[d][i] == null) { v.push(0); good = false; continue; }
      const m = mean(hist);
      const sd = Math.sqrt(mean(hist.map(x => (x - m) ** 2)));
      v.push(sd > 0 ? (raw[d][i] - m) / sd : 0);
      if (!(sd > 0)) good = false;
    }
    z.push(v); ok.push(good);
  }
  return { z, ok };
}

/**
 * Find past days whose configuration resembled today's, and say what followed.
 *
 * `keys` are the dimensions that DEFINE the configuration — pass the handful the
 * current finding is actually about, not everything on the board, or the distance is
 * dominated by markets nobody is talking about.
 */
export function analogues(bundle, keys, {
  i = (bundle?.dates?.length ?? 1) - 1,
  horizon = 20,
  outcomes = ['spx', 'vix'],
  limit = 8,
} = {}) {
  const N = bundle?.dates?.length ?? 0;
  const use = (keys ?? []).filter(k => Array.isArray(bundle?.series?.[k]));
  if (N < HIST || use.length < 2) return null;
  const { z, ok } = zVectors(bundle, use);
  if (!ok[i]) return null;
  const today = z[i];

  const cand = [];
  // stop `horizon` before i so every episode has a complete outcome, and never look
  // inside the last window, where "similar" just means "recent"
  for (let j = MIN_HIST + WINDOW; j <= i - horizon - APART; j++) {
    if (!ok[j]) continue;
    let d2 = 0;
    for (let k = 0; k < today.length; k++) d2 += (z[j][k] - today[k]) ** 2;
    cand.push({ j, dist: Math.sqrt(d2) });
  }
  if (cand.length < 20) return null;
  cand.sort((a, b) => a.dist - b.dist);

  // de-cluster: adjacent days are the same episode wearing different dates
  const picked = [];
  for (const c of cand) {
    if (picked.some(p => Math.abs(p.j - c.j) < APART)) continue;
    picked.push(c);
    if (picked.length >= limit) break;
  }
  if (picked.length < 4) return null;

  const outs = {};
  for (const okey of outcomes) {
    if (!Array.isArray(bundle.series[okey])) continue;
    const vals = [];
    for (const p of picked) {
      const a = lastAt(bundle, okey, p.j), b = lastAt(bundle, okey, p.j + horizon);
      if (!a || !b || Math.abs(a.v) < 1e-9) continue;
      vals.push({ date: bundle.dates[p.j], pct: (b.v / a.v - 1) * 100 });
    }
    if (vals.length < 4) continue;
    const s = vals.map(v => v.pct).sort((x, y) => x - y);
    outs[okey] = {
      n: vals.length,
      up: vals.filter(v => v.pct > 0).length,
      lo: +s[0].toFixed(1), hi: +s[s.length - 1].toFixed(1),
      median: +s[Math.floor(s.length / 2)].toFixed(1),
      each: vals.sort((a, b) => a.date < b.date ? -1 : 1),
    };
  }
  if (!Object.keys(outs).length) return null;

  // ── are these eight episodes, or one episode with eight dates? ────────────
  // Live on the first real run: "US 2-year is rare" returned 8 matches and every one
  // fell between 2021-07 and 2022-08 -- the whole hiking cycle and nothing else. Eight
  // draws from a single regime is one observation, not eight, and a page that prints
  // "up 4 of 8" without saying so is overstating its own sample by a factor of eight.
  const idxs = picked.map(p => p.j).sort((a, b) => a - b);
  const spanFrac = (idxs[idxs.length - 1] - idxs[0]) / Math.max(1, i);
  const eps = picked.map(p => ({ date: bundle.dates[p.j], dist: +p.dist.toFixed(2) }))
    .sort((a, b) => a.date < b.date ? -1 : 1);

  return {
    horizon, keys: use,
    // true when every match is bunched into a small slice of the available history
    oneRegime: spanFrac < 0.35,
    span: { from: eps[0].date, to: eps[eps.length - 1].date, frac: +spanFrac.toFixed(2) },
    episodes: eps,
    closest: bundle.dates[picked[0].j],
    outcomes: outs,
    // how alike they actually are, so a page can refuse to show weak matches
    tightness: +mean(picked.map(p => p.dist)).toFixed(2),
  };
}

/**
 * The finding-kind → which dimensions define "a day like this".
 * Deliberately small sets: three or four markets that the finding is genuinely about.
 */
export const ANALOGUE_KEYS = {
  ratekind:    ['tips', 'bei', 'us2y', 'gold'],
  dispersion:  ['dspx', 'vix', 'spx', 'nq'],
  creditstack: ['hy', 'ig', 'vix', 'spx'],
  vixterm:     ['vix', 'vix3m', 'spx'],
  dislocation: null,                       // filled from the link's own two legs
  extreme:     null,                       // filled from the series and its neighbours
};

/** Sensible dimensions for a finding, including the ones derived from its own key. */
export function keysFor(finding) {
  if (!finding) return null;
  const fixed = ANALOGUE_KEYS[finding.kind];
  if (fixed) return fixed;
  if (finding.kind === 'dislocation' && typeof finding.key === 'string' && finding.key.includes('-')) {
    const [a, b] = finding.key.split('-');
    return [a, b, 'vix'];
  }
  if (finding.kind === 'extreme' && finding.key) return [finding.key, 'vix', 'spx'];
  return null;
}
