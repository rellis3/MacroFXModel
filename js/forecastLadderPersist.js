/**
 * Forecast · persistence-adjusted — a SHADOW daily ladder beside the production export.
 *
 * Lesson 03 §02 (volatility persists and reverts): the export over-reacts to regime. After calm spells its HL p75
 * is passed ~30% of the time, after busy spells ~19% (forge/FORECAST_RECORD_PREREG.md). This nudges the export's
 * own σ each morning:
 *
 *   σ_new = σ_used × exp(β_class · (x − mean_instrument)),   rung % = width × σ_new %
 *
 *   x = regime  log(σ_daily ÷ median σ_daily over the previous 250 sessions)
 *       res1    log(yesterday's NY-close high−low % ÷ the σ_daily that applied to it)
 *       res5    mean of res1 over the last 5 bars
 *       wd1..4  Tuesday … Friday (Monday = base)
 *
 * Evidence: forge/FORECAST_FIX_PREREG.md variant 1 — these exact live-computable inputs, walk-forward 2020-2026:
 * pinball 0.980 [0.974, 0.985] of the refit control, better in every class, calm-vs-busy miss 6.8 -> 2.4 pp.
 *
 * THE CHOSEN FORECAST (forge/FORECAST_PICK_PREREG.md, head-to-head of all five daily forecasts): where implied vol
 * exists (6 USD majors, gold, 6 indices) x also carries iv_sig = log(implied vol % / annualised sigma_daily %), with its
 * own beta/means/widths (the `iv` block): 0.964 of plain on the live IV sources (QuikStrike ATM-30 / GVZ / VIX / VXN).
 * No usable IV that morning -> the persistence form (no guess).
 * Params js/forecastLadderPersistParams.js. σ_used (event multiplier included) comes from the production ladder,
 * so the event conditioning is unchanged. Side by side only: nothing live reads this.
 */
import { forecastSigma, SIGMA_ESTIMATORS } from './forecastSigma.js';
import { paramsFor } from './forecastLadder.js';
import { PERSIST_PARAMS } from './forecastLadderPersistParams.js';
import { barsBefore } from './forecastLadderIvAdj.js';
import { buildLadderExportText } from './ladderExport.js';

const RUNGS = ['p50', 'p75', 'p90'];
const _r2 = x => Math.round(x * 100) / 100;
const _r4 = x => Math.round(x * 1e4) / 1e4;
const SQRT252 = Math.sqrt(252);

/** σ_daily % (2 dp, as buildLadder carries it) from bars[0..k), the live estimator. */
function sigmaPct(bars, k, est) {
  const s = forecastSigma(bars.slice(0, k), est);
  return s > 0 ? _r2(s * 100) : null;
}

/** The feature vector from NY-close daily bars that closed before the session. Null when history is short. */
export function persistFeatures(bars, { instrument, assetClass = 'fx', sessionDate, params = PERSIST_PARAMS }) {
  if (!Array.isArray(bars) || bars.length < 300 || !sessionDate) return null;
  const est = paramsFor(instrument, assetClass).estimator ?? 'yz_30';
  const n = bars.length;
  const win = params.regime_window;                         // 250
  // σ % from bars[0..k). The contemporaneous estimators (YZ / EWMA / naive) are causal, so one pass over all bars gives
  // exactly forecastSigma(bars.slice(0, k)) at every k (= series[k-1]); recomputing 256 prefixes took ~1.5 s per request.
  const fn = est !== 'har_rv_log' ? SIGMA_ESTIMATORS[est] : null;
  const series = fn ? fn(bars) : null;
  const sig = new Map();
  const S = k => {
    if (!sig.has(k)) {
      const v = series ? series[k - 1] : NaN;
      sig.set(k, series ? (Number.isFinite(v) && v > 0 ? _r2(v / SQRT252) : null) : sigmaPct(bars, k, est));
    }
    return sig.get(k);
  };
  const today = S(n);
  const prior = [];
  for (let k = n - win; k < n; k++) { const v = S(k); if (v > 0) prior.push(v); }
  if (!(today > 0) || prior.length < 120) return null;
  prior.sort((a, b) => a - b);
  const m = prior.length, med = m % 2 ? prior[(m - 1) / 2] : (prior[m / 2 - 1] + prior[m / 2]) / 2;
  const res = [];
  for (let j = n - params.res_window; j < n; j++) {         // bar j's range ÷ the σ that applied to it (bars before j)
    const b = bars[j], s = S(j);
    if (!(s > 0) || !(b?.open > 0)) return null;
    res.push(Math.log(Math.max((b.high - b.low) / b.open * 100, 1e-6) / s));
  }
  const wd = new Date(sessionDate + 'T12:00:00Z').getUTCDay();          // 1 = Monday … 5 = Friday
  return {
    regime: Math.log(today / med), res1: res.at(-1), res5: res.reduce((a, x) => a + x, 0) / res.length,
    wd1: wd === 2 ? 1 : 0, wd2: wd === 3 ? 1 : 0, wd3: wd === 4 ? 1 : 0, wd4: wd === 5 ? 1 : 0,
    sigma_daily_pct: today,
  };
}

/** One persistence-adjusted ladder (buildLadder's shape). `sigmaUsedPct` = the production ladder's σ_used. */
export function buildPersistLadder(bars, { instrument, assetClass = 'fx', sessionDate, sigmaUsedPct, eventTag = null,
                                          eventMult = 1, ivAnnualPct = null, params = PERSIST_PARAMS } = {}) {
  const p = params.pairs?.[String(instrument).toUpperCase()];
  if (!p?.width || !params.classes?.[p.class]?.beta || !(sigmaUsedPct > 0)) return null;
  const x = persistFeatures(bars, { instrument, assetClass, sessionDate, params });
  if (!x) return null;
  const useIv = Boolean(p.iv?.width && params.classes_iv?.[p.class]?.beta && ivAnnualPct > 0);
  if (useIv) x.iv_sig = Math.log(ivAnnualPct / (x.sigma_daily_pct * Math.sqrt(252)));
  const feats = useIv ? params.features_iv : params.features;
  const beta = useIv ? params.classes_iv[p.class].beta : params.classes[p.class].beta;
  const mean = useIv ? p.iv.mean : p.mean, width = useIv ? p.iv.width : p.width;
  const z = feats.reduce((a, k) => a + beta[k] * (x[k] - mean[k]), 0);
  const adj = Math.exp(z);
  const sPct = sigmaUsedPct * adj;
  const out = {
    sigma_daily_pct: x.sigma_daily_pct, sigma_used_pct: _r2(sPct), sigma_export_pct: _r2(sigmaUsedPct),
    // annualised chosen σ before the event multiplier, as the production ladder reports it. The export text SKIPS any
    // instrument without vol_annual — missing it dropped every adjusted instrument from the paste (fixed 2026-10-07).
    vol_annual: _r2(sPct / (eventMult > 0 ? eventMult : 1) * SQRT252), event_mult: Math.round((eventMult > 0 ? eventMult : 1) * 1000) / 1000,
    persist_adjust: Math.round(adj * 1000) / 1000, form: useIv ? 'persist+iv' : 'persist',
    ...(useIv ? { iv_annual: _r2(ivAnnualPct), iv_source: p.iv.source } : {}),
    features: Object.fromEntries(feats.map(k => [k, _r4(x[k])])),
    event_tag: eventTag, horizon: 'daily', params_source: 'fitted-persist', width_source: 'fitted-persist',
  };
  for (const q of ['hl', 'oc', 'oh', 'ol']) {
    const w = width[q];
    if (!Array.isArray(w)) continue;
    out[q] = {};
    RUNGS.forEach((r, i) => { if (Number.isFinite(w[i])) out[q][r] = _r2(w[i] * sPct); });
  }
  return out;
}

/** Every instrument in the production forecast: persistence-adjusted where params + bars allow, else unchanged. */
export function buildPersistInstruments(latest, ohlcCache, registry, params = PERSIST_PARAMS, ivByName = {}) {
  const src = latest?.instruments ?? {};
  const byName = Object.fromEntries((registry ?? []).map(c => [c.name, c]));
  const sessionDate = latest?.session_date ?? null;
  const instruments = {}, adjusted = [], skipped = [];
  for (const [name, fc] of Object.entries(src)) {
    instruments[name] = fc;
    const L = fc?.ladder;
    if (!params.pairs?.[name]) { skipped.push({ name, reason: 'no persistence params (plain ladder)' }); continue; }
    if (!(L?.sigma_used_pct > 0)) { skipped.push({ name, reason: 'no production σ' }); continue; }
    const bars = barsBefore(ohlcCache?.[name], sessionDate);
    const lad = buildPersistLadder(bars, { instrument: name, assetClass: byName[name]?.assetClass ?? 'fx', sessionDate,
                                           sigmaUsedPct: L.sigma_used_pct, eventTag: L.event_tag ?? null, eventMult: L.event_mult ?? 1,
                                           ivAnnualPct: ivByName?.[name] ?? null, params });
    if (!lad) {
      const n = Array.isArray(bars) ? bars.length : 0, last = Array.isArray(bars) ? (bars.at(-1)?.date ?? '?') : '-';
      skipped.push({ name, reason: n < 300 ? `only ${n} daily bars (needs 300, last ${last})` : `σ history incomplete (${n} bars, last ${last})` });
      continue;
    }
    instruments[name] = { ...fc, ladder: lad };
    adjusted.push({ name, adj: lad.persist_adjust, form: lad.form });
  }
  return { instruments, adjusted, skipped };
}

/** Export text in the production daily format (same Pine parsing), its own title, a footer with no ticker or row token. */
export function buildPersistExportText(latest, ohlcCache, registry, ivByName = {}) {
  const { instruments, adjusted, skipped } = buildPersistInstruments(latest, ohlcCache, registry, PERSIST_PARAMS, ivByName);
  const lines = buildLadderExportText({ session_label: latest?.session_label, instruments }, 'daily').split('\n');
  lines[0] = '**VOL & RANGE FORECAST — CHOSEN (PERSISTENCE + IV)**';
  const withIv = adjusted.filter(a => a.form === 'persist+iv').length;
  lines.push('', `[Chosen forecast: σ nudged for regime, recent misses and weekday on ${adjusted.length} instruments `
    + `(${withIv} also blended toward implied vol), ${skipped.length} on the plain ladder. Picked head-to-head over all `
    + `five daily forecasts, walk-forward 2020-2026]`);
  return { text: lines.join('\n'), adjusted, skipped };
}
