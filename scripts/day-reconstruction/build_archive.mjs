// Day reconstruction, milestone 2: the daily and touch-transition archives (analysis/output/day-reconstruction/VALIDATION.md §3, §5).
//
// Levels come only from the existing calculation: v4Days (day enumeration, London-midnight open, NY-17:00 bars closed
// before the open) and buildLadder / ladderLevels (js/forecastLadder.js). Point-in-time parameters: the walk-forward
// fold in force on the date (forge/out_vol_lon/vol_report.json), passed through buildLadder's existing `ladderParams`
// argument with that fold's own estimator; production params before the first fold (in-sample era). Event tags:
// repaired ForexFactory history through 2025-04-07, unknown (x1.0, flagged) after. Proj H/L at bar k trail the running
// extremes through bar k-1 (linesAtBar's rule). Session window: London 00:00-22:00 (the window the widths were fitted
// and scored on). No price outcome after 2026-08-20 is read (lockbox).
//
// Outputs (analysis/output/day-reconstruction/archive/, JSON lines, converted to parquet by finalize_archive.py):
//   <NAME>_days.jsonl     one row per instrument-day
//   <NAME>_touches.jsonl  one row per first touch of each level
//   <NAME>_sessions.json  per-day bar count / first / last time / close checksum, to align the path file
//
//   node scripts/day-reconstruction/build_archive.mjs [NAME ...]
//   node scripts/day-reconstruction/build_archive.mjs --selftest     # truncation + future-scramble tests
import fs from 'fs';

delete process.env.R2_ACCESS_KEY; delete process.env.R2_SECRET_KEY;   // local cache only
const { loadM1ForPair } = await import('../../js/volBacktestM1Engine.js');
const { v4Days, nyCloseDailyBars } = await import('../../js/voteAtlasV4Lines.js');
const { forecastSigma } = await import('../../js/forecastSigma.js');
const { buildLadder, ladderLevels } = await import('../../js/forecastLadder.js');

const OUT = 'analysis/output/day-reconstruction/archive';
const LAST = '2026-08-20';
const SESSION_END_LONDON_HOUR = 22;
export const INST = { GOLD: ['gold', 'commodity', 'gold'], NQ: ['nq', 'index', 'nq'], EURUSD: ['eurusd', 'fx', 'eurusd'] };
const RUNGS = ['p50', 'p75', 'p90'];

// The 24 levels. kind 'static' = fixed off the open (ladderLevels key); 'proj' = trails the opposite running extreme.
export const LEVELS = [];
for (const r of RUNGS) {
  LEVELS.push({ name: `OH_${r}`, fam: 'OH', rung: r, side: 1, kind: 'static', key: `oh_${r}` });
  LEVELS.push({ name: `OL_${r}`, fam: 'OL', rung: r, side: -1, kind: 'static', key: `ol_${r}` });
  LEVELS.push({ name: `CloseUp_${r}`, fam: 'CloseUp', rung: r, side: 1, kind: 'static', key: `oc_up_${r}` });
  LEVELS.push({ name: `CloseDn_${r}`, fam: 'CloseDn', rung: r, side: -1, kind: 'static', key: `oc_dn_${r}` });
  LEVELS.push({ name: `ProjH_${r}`, fam: 'ProjH', rung: r, side: 1, kind: 'proj', q: 'hl' });
  LEVELS.push({ name: `ProjL_${r}`, fam: 'ProjL', rung: r, side: -1, kind: 'proj', q: 'hl' });
}

const londonHour = (() => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false });
  const cache = new Map();
  return t => { const k = Math.floor(t / 3600); let h = cache.get(k); if (h === undefined) { h = +f.format(new Date(k * 3600_000)) % 24; cache.set(k, h); } return h; };
})();

// ── point-in-time parameters ────────────────────────────────────────────────
const report = JSON.parse(fs.readFileSync('forge/out_vol_lon/vol_report.json', 'utf8'));
function foldSpecs(key) {
  const r = report[key];
  return r.specs.map((s, k) => {
    const w = s.width_mult;
    return {
      fold: k, from: String(s.trained_through).slice(0, 10), to: String(r.folds[k].test_end).slice(0, 10),
      spec: { estimator: s.estimator, event: s.event_mult,
        width: { hl: [w.BM_P50, w.BM_P75, w.BM_P90], oc: [w.HN_P50, w.HN_P75, w.HN_P90],
                 oh: [w.OH_P50, w.OH_P75, w.OH_P90], ol: [w.OL_P50, w.OL_P75, w.OL_P90] } },
    };
  });
}
// the latest fold trained strictly before the date whose test window still contains it
function foldFor(folds, date) {
  let best = null;
  for (const f of folds) if (date > f.from && date <= f.to) best = f;
  return best;
}

// ── one day: every level, every first touch, the state before it, and everything after it ──
// `bars` are the day's session bars (London 00:00-22:00). Pure: depends only on its arguments, so the self-test can
// rebuild a day from truncated or scrambled bars and compare.
export function buildDay(ctx, bars) {
  const { open, ladder, scale } = ctx;
  const n = bars.length;
  const H = bars.map(b => b.high), L = bars.map(b => b.low), C = bars.map(b => b.close);
  const T = bars.map(b => b.time);
  // running extremes through bar k-1 (bar 0 uses the open) -- linesAtBar's rule
  const hiPrev = new Float64Array(n), loPrev = new Float64Array(n);
  { let hi = open, lo = open; for (let k = 0; k < n; k++) { hiPrev[k] = hi; loPrev[k] = lo; if (H[k] > hi) hi = H[k]; if (L[k] < lo) lo = L[k]; } }
  const stat = ladderLevels(ladder, open);
  // level price at bar k (static: constant)
  const lvAt = LEVELS.map(lv => {
    if (lv.kind === 'static') { const p = stat[lv.key]; return Number.isFinite(p) ? () => p : null; }
    const pct = ladder.hl?.[lv.rung];
    if (!Number.isFinite(pct)) return null;
    return lv.side > 0 ? k => loPrev[k] * (1 + pct / 100) : k => hiPrev[k] * (1 - pct / 100);
  });
  const hit = (li, k) => { const f = lvAt[li]; if (!f) return false; const p = f(k); return LEVELS[li].side > 0 ? H[k] >= p : L[k] <= p; };
  // last M1 bar of each clock hour = that hour's H1 close (the live tracker's rule)
  const h1Close = new Uint8Array(n);
  for (let k = 0; k < n; k++) h1Close[k] = (k === n - 1 || Math.floor(T[k + 1] / 3600) !== Math.floor(T[k] / 3600)) ? 1 : 0;

  // first touch bar of every level
  const first = LEVELS.map((_, li) => { if (!lvAt[li]) return -1; for (let k = 0; k < n; k++) if (hit(li, k)) return k; return -1; });
  const mins = k => Math.round((T[k] - T[0]) / 60);
  const touches = [];
  for (let li = 0; li < LEVELS.length; li++) {
    const k = first[li];
    if (k < 0) continue;
    const lv = LEVELS[li], d = lv.side, P = lvAt[li](k);
    // ── state before the touch (bars 0..k-1 only) ──
    const hiB = hiPrev[k], loB = loPrev[k];
    const hlB = (hiB - loB) / open * 100;
    const before = LEVELS.filter((_, lj) => first[lj] >= 0 && first[lj] < k).map(x => x.name);
    const sameBar = LEVELS.filter((_, lj) => lj !== li && first[lj] === k).map(x => x.name);
    // ambiguous: the touch bar also first-touched a level on the OTHER side -- one minute cannot order them
    const ambiguous = LEVELS.some((x, lj) => first[lj] === k && x.side !== d);
    // ── after the touch ──
    // continuation extreme includes bar k (its high/low is at or after the touch); the move back toward the open
    // starts at k+1 (bar k's other extreme may have printed before the touch).
    let contExt = d > 0 ? H[k] : L[k], contK = k, revExt = P, revK = -1;
    for (let j = k + 1; j < n; j++) {
      if (d > 0 ? H[j] > contExt : L[j] < contExt) { contExt = d > 0 ? H[j] : L[j]; contK = j; }
      if (d > 0 ? L[j] < revExt : H[j] > revExt) { revExt = d > 0 ? L[j] : H[j]; revK = j; }
    }
    // first return to the open side (M1 close back through the level) and the first re-touch after it
    let retK = -1, revisitK = -1;
    for (let j = k + 1; j < n; j++) {
      const p = lvAt[li](j);
      if (retK < 0) { if (d > 0 ? C[j] < p : C[j] > p) retK = j; }
      else if (d > 0 ? H[j] >= p : L[j] <= p) { revisitK = j; break; }
    }
    // the live tracker's confirmation: first H1 close beyond the level (at or after the touch)
    let h1K = -1;
    for (let j = k; j < n; j++) if (h1Close[j] && (d > 0 ? C[j] >= lvAt[li](j) : C[j] <= lvAt[li](j))) { h1K = j; break; }
    // time to reach every other level AFTER the touch: first bar j > k that trades through it from the side the
    // touch bar closed on (so a level already passed is a real return, not a trivial re-print). Ties between targets on
    // opposite sides in the same minute are ambiguous by construction (equal minutes).
    const next = {};
    const targets = [...LEVELS.map((x, lj) => [x.name, lj]), ['Open', -1]];
    for (const [nm, lj] of targets) {
      if (lj === li) continue;
      const lvlAt = lj < 0 ? () => open : lvAt[lj];
      if (!lvlAt) { next[nm] = null; continue; }
      const below = C[k] < lvlAt(Math.min(k + 1, n - 1));
      let t = null;
      for (let j = k + 1; j < n; j++) { const p = lvlAt(j); if (below ? H[j] >= p : L[j] <= p) { t = mins(j) - mins(k); break; } }
      next[nm] = t;
    }
    touches.push({
      level: lv.name, family: lv.fam, rung: lv.rung, side: d > 0 ? 'up' : 'dn', kind: lv.kind,
      level_price: P, k, t: T[k], min_since_open: mins(k), min_to_end: mins(n - 1) - mins(k),
      // before
      run_hi_before: hiB, run_lo_before: loB, hl_before_pct: hlB,
      consumed_hl_p50: hlB / ladder.hl.p50, consumed_hl_p75: hlB / ladder.hl.p75, consumed_hl_p90: hlB / ladder.hl.p90,
      up_travel_before_pct: (hiB - open) / open * 100, dn_travel_before_pct: (open - loB) / open * 100,
      levels_before: before.join(';'), same_bar_levels: sameBar.join(';'), ambiguous_order: ambiguous,
      // at the touch
      hl_at_touch_pct: (Math.max(hiB, H[k]) - Math.min(loB, L[k])) / open * 100,
      // after (price units and in units of the day's sigma scale = open x sigma_used)
      cont_max: (contExt - P) * d, cont_max_sig: (contExt - P) * d / scale, cont_max_min: mins(contK) - mins(k),
      rev_max: (P - revExt) * d, rev_max_sig: (P - revExt) * d / scale, rev_max_min: revK < 0 ? null : mins(revK) - mins(k),
      close: C[n - 1], close_vs_level_sig: (C[n - 1] - P) * d / scale, close_vs_open_sig: (C[n - 1] - open) * d / scale,
      return_min: retK < 0 ? null : mins(retK) - mins(k), revisit_min: revisitK < 0 ? null : mins(revisitK) - mins(k),
      h1_close_min: h1K < 0 ? null : mins(h1K) - mins(k),
      next_min: next,
    });
  }
  // day-level summary
  let hiK = 0, loK = 0;
  for (let k = 1; k < n; k++) { if (H[k] > H[hiK]) hiK = k; if (L[k] < L[loK]) loK = k; }
  const order = LEVELS.map((x, li) => [x.name, first[li]]).filter(([, k]) => k >= 0).sort((a, b) => a[1] - b[1]);
  const orderStr = order.map(([nm, k], i) => (i && order[i - 1][1] === k ? '=' : (i ? '>' : '')) + nm).join('');
  const levelPrices = {};
  for (const lv of LEVELS) if (lv.kind === 'static' && Number.isFinite(stat[lv.key])) levelPrices[lv.name] = stat[lv.key];
  const day = {
    n_bars: n, t_open: T[0], t_last: T[n - 1],
    high: H[hiK], low: L[loK], close: C[n - 1], t_high_min: mins(hiK), t_low_min: mins(loK),
    hl_pct: (H[hiK] - L[loK]) / open * 100, oc_pct: (C[n - 1] - open) / open * 100,
    oh_pct: (H[hiK] - open) / open * 100, ol_pct: (open - L[loK]) / open * 100,
    consumed_hl_p50: (H[hiK] - L[loK]) / open * 100 / ladder.hl.p50,
    first_touch_min: Object.fromEntries(LEVELS.map((x, li) => [x.name, first[li] >= 0 ? mins(first[li]) : null])),
    reach_order: orderStr, levels: levelPrices,
  };
  return { day, touches };
}

async function buildInstrument(NAME) {
  const [key, cls, repKey] = INST[NAME];
  const ff = JSON.parse(fs.readFileSync('analysis/output/day-reconstruction/ff_tags.json', 'utf8'));
  const cover = ff.coverage, tags = ff.tags[NAME];
  const tagFor = d => (d < cover[0] || d > cover[1]) ? null : (tags[d] ?? 'none');
  const folds = foldSpecs(repKey);
  const packed = await loadM1ForPair(key);
  const ny = nyCloseDailyBars(packed).filter(b => b.n >= 60);
  const days = v4Days(packed, { instrument: NAME, assetClass: cls, eventTagFor: tagFor }).filter(d => d.date <= LAST);
  const fd = fs.openSync(`${OUT}/${NAME}_days.jsonl`, 'w'), ft = fs.openSync(`${OUT}/${NAME}_touches.jsonl`, 'w');
  const sessions = {};
  const excluded = { no_session_bars: 0, no_pit_sigma: 0 };
  let prev = null, nT = 0;
  const sigHist = [];
  for (const d of days) {
    const bars = d.bars.filter(b => londonHour(b.time) < SESSION_END_LONDON_HOUR);
    if (!bars.length) { excluded.no_session_bars++; continue; }
    // point-in-time params: the fold in force, with ITS estimator, through buildLadder's ladderParams seam
    const f = foldFor(folds, d.date);
    let ladder = d.ladder, era = 'insample_prod_params', fold = null, estimator = ladder.estimator;
    if (f) {
      const sig = forecastSigma(ny.slice(0, d.nyBarsUsed), f.spec.estimator);
      if (!(sig > 0)) { excluded.no_pit_sigma++; continue; }
      ladder = buildLadder(sig, { instrument: NAME, assetClass: cls, horizon: 'daily', eventTag: d.eventTag ?? 'unknown',
        ladderParams: { pairs: { [NAME]: f.spec } } });
      era = 'oos_pit'; fold = f.fold; estimator = f.spec.estimator;
    }
    const scale = d.open * ladder.sigma_used_pct / 100;
    const { day, touches } = buildDay({ open: d.open, ladder, scale }, bars);
    // opening conditions known before the first bar (prior session + sigma history)
    const sigRank = sigHist.length >= 60 ? sigHist.slice(-250).filter(s => s < ladder.sigma_daily_pct).length / Math.min(250, sigHist.length) : null;
    const row = {
      instrument: NAME, date: d.date, weekday: new Date(d.date + 'T12:00:00Z').getUTCDay(), open: d.open,
      era, fold, estimator, sigma_daily_pct: ladder.sigma_daily_pct, sigma_used_pct: ladder.sigma_used_pct,
      event_tag: d.eventTag, tag_status: d.eventTag == null ? 'unknown' : 'ff', event_mult: ladder.event_mult,
      vol_annual: ladder.vol_annual, scale,
      hl_p50: ladder.hl.p50, hl_p75: ladder.hl.p75, hl_p90: ladder.hl.p90,
      oc_p50: ladder.oc.p50, oc_p75: ladder.oc.p75, oc_p90: ladder.oc.p90,
      oh_p50_pct: ladder.oh.p50, oh_p75_pct: ladder.oh.p75, oh_p90_pct: ladder.oh.p90,
      ol_p50_pct: ladder.ol.p50, ol_p75_pct: ladder.ol.p75, ol_p90_pct: ladder.ol.p90,
      sigma_rank_250: sigRank,
      prev_date: prev?.date ?? null, prev_close: prev?.close ?? null,
      gap_pct: prev ? (d.open - prev.close) / prev.close * 100 : null,
      prev_hl_pct: prev?.hl_pct ?? null, prev_consumed_hl_p50: prev?.consumed_hl_p50 ?? null,
      ...day,
    };
    fs.writeSync(fd, JSON.stringify(row) + '\n');
    for (const t of touches) {
      fs.writeSync(ft, JSON.stringify({ instrument: NAME, date: d.date, era, tag_status: row.tag_status, weekday: row.weekday,
        sigma_used_pct: row.sigma_used_pct, scale, open: d.open, ...t }) + '\n');
      nT++;
    }
    let cs = 0; for (const b of bars) cs += b.close;
    sessions[d.date] = { n: bars.length, t0: bars[0].time, tN: bars.at(-1).time, closeSum: cs };
    sigHist.push(ladder.sigma_daily_pct);
    prev = { date: d.date, close: day.close, hl_pct: day.hl_pct, consumed_hl_p50: day.consumed_hl_p50 };
  }
  fs.closeSync(fd); fs.closeSync(ft);
  fs.writeFileSync(`${OUT}/${NAME}_sessions.json`, JSON.stringify(sessions));
  const meta = { instrument: NAME, m1_key: key, days: Object.keys(sessions).length, touches: nT, excluded,
    first: days[0]?.date, last: Object.keys(sessions).at(-1), folds: folds.map(f => ({ fold: f.fold, from: f.from, to: f.to, estimator: f.spec.estimator })) };
  console.log(JSON.stringify(meta));
  return meta;
}

// ── self-test: truncation and future-scramble on sampled touches ────────────
async function selftest() {
  const NAME = 'EURUSD', [key, cls] = INST[NAME];
  const packed = await loadM1ForPair(key);
  const days = v4Days(packed, { instrument: NAME, assetClass: cls }).filter(d => d.date <= LAST);
  const PRE = ['level_price', 'k', 't', 'min_since_open', 'run_hi_before', 'run_lo_before', 'hl_before_pct', 'consumed_hl_p50',
    'up_travel_before_pct', 'dn_travel_before_pct', 'levels_before', 'same_bar_levels', 'ambiguous_order', 'hl_at_touch_pct'];
  let checked = 0, bad = 0, ctrl = 0, ctrlN = 0, s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < days.length; i += 37) {
    const d = days[i];
    const bars = d.bars.filter(b => londonHour(b.time) < SESSION_END_LONDON_HOUR);
    if (bars.length < 100) continue;
    const ctx = { open: d.open, ladder: d.ladder, scale: d.open * d.ladder.sigma_used_pct / 100 };
    const full = buildDay(ctx, bars).touches;
    for (const t of full) {
      // (a) truncation: delete every bar after the touch bar
      const tr = buildDay(ctx, bars.slice(0, t.k + 1)).touches.find(x => x.level === t.level);
      // (b) future scramble: replace every bar after the touch bar with a different random walk
      let px = bars[t.k].close;
      const sc = bars.map((b, j) => {
        if (j <= t.k) return b;
        const o = px; px *= 1 + (rnd() - 0.5) * 0.004;
        return { ...b, open: o, close: px, high: Math.max(o, px) * 1.0005, low: Math.min(o, px) * 0.9995 };
      });
      const sx = buildDay(ctx, sc).touches.find(x => x.level === t.level);
      ctrlN++; if (sx && sx.cont_max !== t.cont_max) ctrl++;   // negative control: a post-touch field MUST move
      for (const alt of [tr, sx]) {
        checked++;
        if (!alt || PRE.some(f => JSON.stringify(alt[f]) !== JSON.stringify(t[f]))) bad++;
      }
    }
  }
  const out = { test: 'pre-touch fields identical under truncation and future-scramble', comparisons: checked, failures: bad,
    negative_control: { field: 'cont_max (post-touch)', changed_under_scramble: ctrl, of: ctrlN } };
  console.log(JSON.stringify(out));
  fs.writeFileSync(`${OUT}/selftest.json`, JSON.stringify(out, null, 1));
  if (bad || ctrl < ctrlN * 0.9) process.exitCode = 1;
}

fs.mkdirSync(OUT, { recursive: true });
if (process.argv.includes('--selftest')) await selftest();
else {
  const names = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const metas = [];
  for (const NAME of (names.length ? names : Object.keys(INST))) metas.push(await buildInstrument(NAME));
  fs.writeFileSync(`${OUT}/build_meta_${(names.length ? names : Object.keys(INST)).join('_')}.json`, JSON.stringify(metas, null, 1));
}
