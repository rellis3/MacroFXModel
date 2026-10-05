/**
 * IV-adjusted daily ladder — the production daily ladder with σ blended toward the
 * option market's implied vol, by a fitted amount:
 *
 *   σ_adj = σ_t · exp( k · (ln(IV / σ_t) − μ) )        rung = width · σ_adj
 *
 * k (≈0.6–0.8) and the per-instrument centre μ are fitted, so this is a BLEND of
 * realized and implied, not the pure-IV swap of the "Forecast (IV)" export.
 *
 * Evidence (all 2026-10-05):
 *  - forge/COMBINED_RANGE_PREREG.md — pre-registered, PASS on indices and FX + gold;
 *    implied ÷ realized carried most of the gain.
 *  - forge/CROSS_IV_PREREG.md — pre-registered, PASS on 15/15 crosses, with the cross's
 *    IV built from its two USD legs.
 *  - analysis/output/iv_adjusted/CALIBRATION.md — the same model re-fitted and re-checked
 *    out of sample on the inputs THIS module receives live (OANDA D1 σ, VIX/VXN close,
 *    CME constant-maturity 30d ATM IV, GVZ). 28/28 instruments better; every rung calibrated.
 *
 * IV per instrument (params `iv_source`): indices VIX (NQ: VXN); FX majors the QuikStrike
 * capture's 30d ATM; GOLD GVZ; crosses from the two USD legs and their 60-bar D1 return
 * correlation. NZD pairs have no implied vol and keep the production ladder, labelled.
 *
 * Pure: no network, no clock (`now` is passed in).
 */
import { forecastSigma } from './forecastSigma.js';
import { eventMultiplier, paramsFor, RUNGS } from './forecastLadder.js';
import { constantMaturityIV } from './ivMetrics.js';
import { buildLadderExportText } from './ladderExport.js';
import { IV_MAX_AGE_H } from './ivLadderExport.js';
import { IVADJ_PARAMS } from './forecastLadderIvAdjParams.js';

const SQRT252 = Math.sqrt(252);
const _r2 = x => Math.round(x * 100) / 100;
const _norm = x => String(x).toLowerCase().replace(/[/_]/g, '');
export const CBOE_MAX_AGE_D = 4;      // VIX / VXN / GVZ: a weekend plus one missed print
// The live forecaster's names for two indices differ from the fitted-params keys
// (the plain ladder has the same mismatch and falls to the class default).
export const IVADJ_ALIAS = { SPX500: 'SPX', US30: 'DOW' };
const _pkey = n => IVADJ_ALIAS[String(n).toUpperCase()] ?? String(n).toUpperCase();

/** Annualised implied vol (%) of a cross from its two USD legs. s = +1 for XXXUSD, −1 for USDXXX. */
export function crossImpliedVol(ivA, ivB, sA, sB, rho) {
  if (!(ivA > 0) || !(ivB > 0) || !Number.isFinite(rho)) return null;
  const v = ivA * ivA + ivB * ivB - 2 * sA * sB * rho * ivA * ivB;
  return v > 0 ? Math.sqrt(v) : null;
}

const _key = b => String(b.time ?? b.date ?? '').slice(0, 10);

/** Correlation of two bar series' daily log returns over the last `window` common dates. */
export function legCorrelation(barsA, barsB, window = IVADJ_PARAMS.corr_window) {
  const ret = bars => {
    const m = new Map();
    for (let i = 1; i < (bars?.length ?? 0); i++) {
      const a = bars[i - 1].close, b = bars[i].close;
      if (a > 0 && b > 0) m.set(_key(bars[i]), Math.log(b / a));
    }
    return m;
  };
  const ra = ret(barsA), rb = ret(barsB);
  const keys = [...ra.keys()].filter(k => rb.has(k)).sort().slice(-window);
  if (keys.length < window) return null;
  const x = keys.map(k => ra.get(k)), y = keys.map(k => rb.get(k));
  const mx = x.reduce((a, v) => a + v, 0) / x.length, my = y.reduce((a, v) => a + v, 0) / y.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** One IV-adjusted daily ladder (same object shape as buildLadder). Null if no params or no σ. */
export function buildIvAdjLadder(bars, { instrument, ivAnnualPct, assetClass = 'fx', eventTag = null,
                                         params = IVADJ_PARAMS } = {}) {
  const p = params.pairs?.[_pkey(instrument)];
  if (!p?.width || !(ivAnnualPct > 0)) return null;
  const sigmaT = forecastSigma(bars, p.estimator);
  if (!(sigmaT > 0)) return null;
  const x = Math.log((ivAnnualPct / 100) / (sigmaT * SQRT252));
  const adj = Math.exp(p.k * (x - p.mu));
  const evMult = eventMultiplier(paramsFor(instrument, assetClass), eventTag);
  const sPct = sigmaT * adj * evMult * 100;
  const out = {
    sigma_daily_pct: _r2(sigmaT * 100), sigma_used_pct: _r2(sPct),
    vol_annual: _r2(sigmaT * SQRT252 * 100), iv_annual: _r2(ivAnnualPct),
    iv_adjust: Math.round(adj * 1000) / 1000,
    event_tag: eventTag ?? null, event_mult: Math.round(evMult * 1000) / 1000,
    horizon: 'daily', params_source: 'fitted-ivadj', width_source: 'fitted-ivadj', estimator: p.estimator,
    iv_source: p.iv_source,
  };
  for (const q of ['hl', 'oc', 'oh', 'ol']) {
    const w = p.width[q];
    if (!Array.isArray(w)) continue;
    out[q] = {};
    RUNGS.forEach((rung, i) => { if (Number.isFinite(w[i])) out[q][rung] = _r2(w[i] * sPct); });
  }
  return out;
}

/**
 * Resolve every instrument's IV from the live inputs and build its ladder.
 * @param latest    forecastState.latest
 * @param ohlcCache forecastState.ohlcCache (name -> D1 bars) — σ and the crosses' leg correlation
 * @param oiStore   parsed oi_store data (QuikStrike capture)
 * @param registry  VOL_INSTRUMENTS
 * @param now       ms epoch
 * @param cboe      { VIX: {date, value}, VXN: {...}, GVZ: {...} } latest closes
 */
export function buildIvAdjInstruments(latest, ohlcCache, oiStore, registry, now, cboe = {}, params = IVADJ_PARAMS) {
  const src = latest?.instruments ?? {};
  const byName = Object.fromEntries((registry ?? []).map(c => [c.name, c]));
  const keys = Object.keys(oiStore ?? {});
  const fxIv = name => {                                   // QuikStrike 30d ATM, % annual, or a reason
    const cfg = byName[name];
    const k = cfg && keys.find(x => _norm(x) === _norm(cfg.oandaInstrument));
    const inst = k ? oiStore[k] : null;
    const pts = inst?.ivTermStructure?.points;
    const at = inst?.ivSavedAtMs ?? inst?.savedAtMs ?? null;
    if (!Array.isArray(pts) || !pts.length) return { why: `no IV capture for ${name}` };
    if (!Number.isFinite(at) || now - at > IV_MAX_AGE_H * 3600_000) return { why: `IV capture stale for ${name}` };
    const iv = constantMaturityIV(pts);
    return iv > 0 ? { iv: iv * 100 } : { why: `no expiry >= 5 DTE for ${name}` };
  };
  const cboeIv = sym => {
    const c = cboe?.[sym];
    const at = c?.date ? Date.parse(`${c.date}T21:15:00Z`) : NaN;
    if (!(c?.value > 0) || !Number.isFinite(at)) return { why: `no ${sym}` };
    if (now - at > CBOE_MAX_AGE_D * 86400_000) return { why: `${sym} stale` };
    return { iv: c.value };
  };

  const instruments = {}, adjusted = [], skipped = [];
  for (const [name, fc] of Object.entries(src)) {
    instruments[name] = fc;                                // default: production ladder, unchanged
    const p = params.pairs?.[_pkey(name)];
    if (!p?.width) { skipped.push({ name, reason: 'no implied vol source (plain ladder)' }); continue; }
    let r;
    if (p.iv_source === 'VIX' || p.iv_source === 'VXN' || p.iv_source === 'GVZ') r = cboeIv(p.iv_source);
    else if (p.iv_source === 'CME_ATM30') r = fxIv(name);
    else if (p.iv_source === 'LEGS') {
      const [a, b] = [name.slice(0, 3), name.slice(3)].map(c => params.legs?.[c]);
      const ia = a && fxIv(a[0]), ib = b && fxIv(b[0]);
      const rho = a && b ? legCorrelation(ohlcCache?.[a[0]], ohlcCache?.[b[0]]) : null;
      r = !a || !b ? { why: 'unknown leg' } : ia.why ? ia : ib.why ? ib : rho == null ? { why: 'leg bars missing' }
        : { iv: crossImpliedVol(ia.iv, ib.iv, a[1], b[1], rho), rho };
      if (r.iv == null && !r.why) r = { why: 'cross variance not positive' };
    }
    if (!r || r.why) { skipped.push({ name, reason: r?.why ?? 'no IV' }); continue; }
    const lad = buildIvAdjLadder(ohlcCache?.[name], {
      instrument: name, ivAnnualPct: r.iv, assetClass: byName[name]?.assetClass ?? 'fx',
      eventTag: fc?.ladder ? fc.ladder.event_tag : null, params,
    });
    if (!lad) { skipped.push({ name, reason: 'σ unavailable (bars not cached)' }); continue; }
    instruments[name] = { ...fc, ladder: lad };
    adjusted.push({ name, iv: _r2(r.iv), adj: lad.iv_adjust, source: p.iv_source, ...(r.rho != null ? { rho: _r2(r.rho) } : {}) });
  }
  return { instruments, adjusted, skipped };
}

/** Export text: the production daily format (same Pine parsing), its own title, and a footer
 *  that names NO ticker and none of the row tokens (the parser switches blocks on tickers). */
export function buildIvAdjExportText(latest, ohlcCache, oiStore, registry, now, cboe = {}) {
  const { instruments, adjusted, skipped } = buildIvAdjInstruments(latest, ohlcCache, oiStore, registry, now, cboe);
  const lines = buildLadderExportText({ session_label: latest?.session_label, instruments }, 'daily').split('\n');
  lines[0] = '**VOL & RANGE FORECAST — IV-ADJUSTED**';
  lines.push('', `[IV-adjusted: σ blended toward implied vol on ${adjusted.length} instruments, `
    + `${skipped.length} on the plain ladder. Fitted blend, not a pure swap. `
    // No file names here: one of them contains a row keyword the Pine parser greps for.
    + `Evidence: the two 2026-10-05 pre-registrations and the live-input calibration report]`);
  return { text: lines.join('\n'), adjusted, skipped };
}
