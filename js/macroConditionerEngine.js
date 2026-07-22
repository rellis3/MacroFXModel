/**
 * Macro-Conditioner Engine — does the macro RISK regime add anything to the day's
 * character forecast BEYOND what σ already knows?
 *
 * The honest question (not "fade here"). The vol-exhaustion study killed direction
 * at exhaustion six ways; what survived is MAGNITUDE / dispersion state. Risk-off is
 * *also* high-VIX is *also* high-σ — which the forecast band already prices. So the
 * only thing worth visualising is the σ-CONTROLLED conditional: holding forecast σ
 * fixed (tercile bucket), does the macro regime still move the day's character?
 *   • flat within each σ bucket  → macro is REDUNDANT with σ (the expected null)
 *   • separates within a bucket   → a real INCREMENTAL state signal
 *
 * This is the same distance-controlled logic as volatilityExhaustion/conditioners.py
 * (VWAP-stretch vs raw distance), lifted to the macro/day-character axis.
 *
 * Labels per day (daily-bar only, no intraday needed, all reused definitions):
 *   • expand   = realized H-L in σ-units > forecast 75th line (BM_P75·hl_75_corr) —
 *                the exact expansion label daytype_classifier validated (magnitude).
 *   • dayEff   = |close−open| / (high−low)  — realized single-day efficiency, the
 *                trend-vs-range CHARACTER (dayTypeCore OUTCOME_LABELERS.dayEfficiency).
 *
 * Macro regime is macroCore.macroRegime (VIX + HY credit), joined by London date via
 * the caller's macroContextByDate map — publication-lag-honest, frozen thresholds.
 * The engine never fetches; regime is passed in. Pure + unit-tested on synthetic data
 * (js/macroConditionerEngine.test.mjs). No lookahead: σ is the causal forecast σ,
 * regime is as-of the prior business day.
 *
 * Design note — why σ-rank not raw σ for bucketing: pooling across instruments must be
 * apples-to-apples, so each row carries its σ PERCENTILE within its own instrument;
 * buckets are terciles of that rank. A single high-vol pair can't dominate a bucket.
 */
import { BM_P75, ASSET_PARAMS } from './volBacktestEngine.js';

export const REGIMES = ['RISK_OFF', 'NEUTRAL', 'RISK_ON'];
export const SIGMA_BUCKETS = ['lo', 'mid', 'hi'];

const _canonRegime = r => (REGIMES.includes(r) ? r : 'NEUTRAL');
const _mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ── Per-day rows from one pair's London-daily series ─────────────────────────
// series = { date:[YYYY-MM-DD], open:[], high:[], low:[], close:[], sigma:[] }
//   sigma[i] = causal forecast daily σ (fraction of price) for day i; NaN/0 → skip.
// regimeByDate = { 'YYYY-MM-DD': 'RISK_OFF'|'NEUTRAL'|'RISK_ON' } (from macroContextByDate).
// assetClass selects the 75th-line correction (fx/index/commodity). isFrac = IS share.
// Returns { rows, episodes, timeline, nDays, splitDate } — rows feed summarizeRows.
export function buildRows(series, regimeByDate, { assetClass = 'fx', isFrac = 0.5 } = {}) {
  const { date, open, high, low, close, sigma } = series;
  const n = Math.min(date.length, open.length, sigma.length);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const hl75 = BM_P75 * p.hl_75_corr;                 // 75th H-L line, σ-units

  // causal σ percentile within this instrument (rank ÷ N over the finite σ's)
  const finite = [];
  for (let i = 0; i < n; i++) if (sigma[i] > 0 && isFinite(sigma[i])) finite.push(sigma[i]);
  const sorted = [...finite].sort((a, b) => a - b);
  const rankOf = s => {                                 // fraction of σ's ≤ s
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= s) lo = m + 1; else hi = m; }
    return sorted.length ? lo / sorted.length : 0.5;
  };

  const usable = [];
  for (let i = 0; i < n; i++) {
    const s = sigma[i], O = open[i];
    if (!(s > 0) || !(O > 0) || !isFinite(high[i]) || !isFinite(low[i]) || !isFinite(close[i])) continue;
    usable.push(i);
  }
  const splitAt = Math.floor(usable.length * isFrac);
  const splitDate = usable.length ? date[usable[Math.min(splitAt, usable.length - 1)]] : null;

  const rows = [];
  const timeline = [];
  usable.forEach((i, k) => {
    const s = sigma[i], O = open[i];
    const rlz = (high[i] - low[i]) / O / s;             // realized range, σ-units
    const rng = high[i] - low[i];
    const eff = rng > 0 ? Math.abs(close[i] - O) / rng : 0;
    const regime = _canonRegime(regimeByDate[date[i]]);
    rows.push({
      date: date[i], sigmaRank: rankOf(s), regime,
      expand: rlz > hl75 ? 1 : 0, dayEff: eff,
      seg: k < splitAt ? 0 : 1,                          // 0 = IS, 1 = OOS
    });
    timeline.push({ date: date[i], regime });
  });

  // risk-off EPISODES: contiguous RISK_OFF runs (≤ gapDays non-off between = same
  // episode) — exposes that "risk-off days" are a handful of clustered events.
  const episodes = _episodes(rows, 5);
  return { rows, episodes, timeline, nDays: rows.length, splitDate };
}

function _episodes(rows, gapDays) {
  const off = rows.filter(r => r.regime === 'RISK_OFF');
  const eps = [];
  let cur = null, lastMs = null;
  for (const r of off) {
    const ms = Date.parse(r.date + 'T00:00:00Z');
    if (cur && lastMs != null && (ms - lastMs) <= gapDays * 864e5) {
      cur.days.push(r);
    } else {
      if (cur) eps.push(cur);
      cur = { start: r.date, days: [r] };
    }
    cur.end = r.date; lastMs = ms;
  }
  if (cur) eps.push(cur);
  return eps.map(e => ({
    start: e.start, end: e.end, n: e.days.length,
    expandRate: _round(_mean(e.days.map(d => d.expand))),
    dayEff: _round(_mean(e.days.map(d => d.dayEff))),
  }));
}

// ── The σ-controlled conditional table over a set of rows (one pair OR pooled) ─
const _bucket = rank => (rank < 1 / 3 ? 'lo' : rank < 2 / 3 ? 'mid' : 'hi');
const _round = (x, d = 4) => (x == null || !isFinite(x) ? null : +x.toFixed(d));

function _cell(rows) {
  return {
    n: rows.length,
    expand: _round(_mean(rows.map(r => r.expand))),
    dayEff: _round(_mean(rows.map(r => r.dayEff))),
  };
}

// rows → { cells, sigmaOnly (ablation), regimeSpread, minCellN }.
//   cells[seg][bucket][regime] = { n, expand, dayEff }
//   sigmaOnly[seg][bucket]     = { n, expand, dayEff }  (regime-blind: what σ alone gives)
//   regimeSpread[seg][bucket]  = expand(RISK_OFF) − expand(RISK_ON)  (incremental to σ)
export function summarizeRows(rows) {
  const out = { cells: {}, sigmaOnly: {}, regimeSpread: {}, n: rows.length };
  for (const seg of ['IS', 'OOS']) {
    const sv = seg === 'IS' ? 0 : 1;
    const segRows = rows.filter(r => r.seg === sv);
    out.cells[seg] = {}; out.sigmaOnly[seg] = {}; out.regimeSpread[seg] = {};
    for (const b of SIGMA_BUCKETS) {
      const br = segRows.filter(r => _bucket(r.sigmaRank) === b);
      out.sigmaOnly[seg][b] = _cell(br);
      out.cells[seg][b] = {};
      for (const rg of REGIMES) out.cells[seg][b][rg] = _cell(br.filter(r => r.regime === rg));
      const eOff = out.cells[seg][b].RISK_OFF.expand, eOn = out.cells[seg][b].RISK_ON.expand;
      out.regimeSpread[seg][b] = (eOff == null || eOn == null) ? null : _round(eOff - eOn);
    }
  }
  return out;
}

// ── Pre-registered verdict: is regime INCREMENTAL to σ, IS/OOS-consistent? ────
// Pass = in ≥2 of 3 σ buckets, regimeSpread(RISK_OFF−RISK_ON) has the SAME sign IS &
// OOS and |OOS| ≥ minSpread, AND each contributing cell has ≥ minN days. Else the
// honest verdict is REDUNDANT (σ already carries it) or NULL (no separation).
export function verdict(summary, { minSpread = 0.05, minN = 30 } = {}) {
  let agree = 0; const perBucket = {};
  for (const b of SIGMA_BUCKETS) {
    const sIs = summary.regimeSpread.IS[b], sOos = summary.regimeSpread.OOS[b];
    const nOffOos = summary.cells.OOS[b].RISK_OFF.n, nOnOos = summary.cells.OOS[b].RISK_ON.n;
    const ok = sIs != null && sOos != null &&
      (sIs > 0) === (sOos > 0) && Math.abs(sOos) >= minSpread &&
      nOffOos >= minN && nOnOos >= minN;
    perBucket[b] = { is: sIs, oos: sOos, nOffOos, nOnOos, passes: ok };
    if (ok) agree++;
  }
  const label = agree >= 2 ? 'INCREMENTAL' : 'REDUNDANT_OR_NULL';
  return { label, bucketsAgreeing: agree, perBucket, minSpread, minN };
}

// ── Full per-pair analysis (build + summarize + verdict), reused by the route ─
export function analyzePair(series, regimeByDate, opts = {}) {
  const { rows, episodes, timeline, nDays, splitDate } = buildRows(series, regimeByDate, opts);
  if (nDays < 100) return { insufficient: true, nDays };
  const summary = summarizeRows(rows);
  return {
    nDays, splitDate,
    summary,
    verdict: verdict(summary, opts),
    episodes,
    // downsample the timeline for the ribbon (≤ 800 points keeps the payload small)
    timeline: _downsampleTimeline(timeline, 800),
    _rows: rows,           // kept for pooling; the route strips it from the wire payload
  };
}

function _downsampleTimeline(tl, maxPts) {
  if (tl.length <= maxPts) return tl;
  const step = Math.ceil(tl.length / maxPts);
  return tl.filter((_, i) => i % step === 0);
}
