// mve/index.js — Phase 4 orchestrator. Composes the whole Market Valuation Engine
// end-to-end: emitters → ensemble (or Kalman SSM) consensus → mispricing →
// OU convergence → confidence → the per-trade valuation object. This is the ONE
// function a live adapter or a page calls. Pure: pass in prepared series, get the
// valuation back. Nothing here touches the network, the DOM, or any live route.
//
//   import { runMVE, valuationCard, valuationText } from './js/mve/index.js';

import { bucket } from './contract.js';
import { regressionEmitter, ar1Emitter, volWeightEmitter, positioningWeightEmitter } from './emitters.js';
import { combine } from './ensemble.js';
import { fuseOnce } from './ssm.js';
import { standardizedMispricing } from './mispricing.js';
import { ouFit, ouConvergence, empiricalSnapback } from './ou.js';
import { confidenceEngine, agreementScore, calibrationScore, scaleAgreementByIndependence, baseRateReality } from './confidence.js';

// ── Build the standard emitter bag from a prepared context ──────────────────
// ctx = {
//   instrument, price (number[] newest-last), factors:[{name,series}],
//   returns (number[]), crowdPct, window, horizon, regime,
//   corr (optional k×k member-error correlation), residualHistory (optional z[]),
//   priors (optional { ssmState }), quality (optional { calibration, regimeStable, corrStable })
// }
export function buildEmitters(ctx) {
  const out = [];
  const macro = regressionEmitter({ name: 'macro_fv', price: ctx.price, factors: ctx.factors, window: ctx.window });
  if (macro) out.push(macro);
  const stat = ar1Emitter({ name: 'stat_fv', price: ctx.price, window: ctx.window });
  if (stat) out.push(stat);
  if (ctx.returns) { const v = volWeightEmitter({ returns: ctx.returns }); if (v) out.push(v); }
  if (ctx.crowdPct != null) { const p = positioningWeightEmitter({ crowdPct: ctx.crowdPct }); if (p) out.push(p); }
  // Callers may append pre-built anchors (yield_fv, structure) via ctx.extraEmitters.
  if (ctx.extraEmitters) out.push(...ctx.extraEmitters.filter(Boolean));
  return out;
}

// ── The full pipeline ────────────────────────────────────────────────────────
export function runMVE(ctx) {
  const price = ctx.price;
  const marketPrice = ctx.marketPrice ?? (price ? price[price.length - 1] : null);
  const horizon = ctx.horizon ?? 10;
  const regime = ctx.regime ?? 'NEUTRAL';

  const estimates = ctx.estimates || buildEmitters(ctx);
  const { anchors, weights } = bucket(estimates);
  if (!anchors.length || marketPrice == null) {
    return { instrument: ctx.instrument, ok: false, reason: 'no anchors / no price', estimates };
  }

  // Consensus: static min-variance ensemble, plus a Kalman fusion as a cross-check.
  const ens = combine(anchors, { regime, corr: ctx.corr });
  const ssm = fuseOnce(anchors, ctx.priors?.ssmState);
  const useSSM = ctx.useSSM === true;
  const fairValue = useSSM ? ssm.fairValue : ens.fairValue;
  const sigma = useSSM ? ssm.sigma : ens.sigma;

  // Mispricing (prediction-σ standardized). Consensus σ already carries member
  // + parameter uncertainty; use it as the denominator.
  const mis = standardizedMispricing(marketPrice, fairValue, sigma);

  // Convergence: fit OU to the deviation history if provided, else synthesise a
  // deviation series from price − rolling-mean as a fallback.
  let convergence = null, snapback = null, ou = null;
  const devSeries = ctx.residualHistory || deviationFromMean(price, ctx.window ?? 120);
  if (devSeries && devSeries.length > 20 && mis) {
    // Work entirely in z units so the OU params, the current gap and the band all
    // share one scale (a price-unit OU vs a z-scored gap is a silent unit bug).
    const devSd = stdOf(devSeries) || sigma || 1;
    const zSeries = devSeries.map(d => d / devSd);
    ou = ouFit(zSeries);
    if (ou && ou.ok) {
      const z0 = mis.gap / devSd;
      convergence = ouConvergence(z0, ou, horizon);   // band defaults to stationary σ (≈1 in z units)
      snapback = empiricalSnapback(zSeries, { entry: 1.5, band: 0.5, horizon });
    }
  }

  // Actionable-signal gate: below ~1σ there is no meaningful mispricing, so don't
  // dress a fairly-priced instrument up with a splashy convergence probability.
  const ACTIONABLE_Z = ctx.actionableZ ?? 1.0;
  const signal = mis && Math.abs(mis.z) >= ACTIONABLE_Z ? mis.label : 'none';   // 'cheap' | 'rich' | 'none'

  // Confidence engine. Average r² only over members that actually report a fit
  // (an emitter with no r², e.g. AR1, shouldn't be counted as 0% fit).
  const r2s = anchors.map(a => a.meta?.r2).filter(Number.isFinite);
  const meanR2 = r2s.length ? r2s.reduce((s, x) => s + x, 0) / r2s.length : null;
  const volConf = weights.find(w => w.meta?.kind === 'vol')?.confidence ?? null;
  const posConf = weights.find(w => w.meta?.kind === 'positioning')?.confidence ?? null;
  const conf = confidenceEngine({
    baseRateReality: baseRateReality(convergence?.pRevert, snapback),   // model P vs measured base rate
    agreement:    scaleAgreementByIndependence(agreementScore(ens.dispersion, sigma), ens.effN ?? anchors.length),
    fit:          meanR2 || null,
    calibration:  ctx.quality?.calibration ? calibrationScore(ctx.quality.calibration) : null,
    regimeStable: ctx.quality?.regimeStable ?? null,
    corrStable:   ctx.quality?.corrStable ?? null,
    reversion:    ou?.ok ? Math.max(0, Math.min(1, 1 - Math.exp(-ou.kappa * horizon))) : null,
    volWeight:    volConf,
    posWeight:    posConf,
  });

  return {
    instrument: ctx.instrument,
    ok: true,
    asOf: ctx.asOf ?? null,
    marketPrice,
    fairValue,
    sigma,
    consensusMethod: useSSM ? 'kalman-ssm' : 'min-variance-ensemble',
    signal,                          // 'cheap' | 'rich' | 'none' (actionable only if |z|≥ACTIONABLE_Z)
    mispricing: mis,                 // { gap, z, rich, tailProb, label }
    convergence,                     // { pRevert, expectedMagnitude, halfLife, ci68, ci95, ... }
    snapbackBaseRate: snapback,      // empirical benchmark for pRevert
    confidence: conf.confidence,
    confidenceBreakdown: conf.contributions,
    ensemble: ens,                   // weights, dispersion, effN, members
    ssm,                             // kalman cross-check
    ou,
    estimates,
  };
}

// ── Small pure helpers ───────────────────────────────────────────────────────
function stdOf(a) {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1));
}
function deviationFromMean(price, window) {
  if (!price || price.length < 21) return null;
  const out = [];
  for (let i = 0; i < price.length; i++) {
    const s = Math.max(0, i - window + 1);
    const win = price.slice(s, i + 1);
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    out.push(price[i] - m);
  }
  return out;
}

// ── Presentation: the per-trade valuation card + AI-style narrative ─────────
// Pure string builders — no DOM. Feed runMVE()'s output.
export function valuationText(v) {
  if (!v || !v.ok) return 'MVE: insufficient data for a valuation.';
  const zAbs = Math.abs(v.mispricing.z).toFixed(1);
  const pct = x => (x * 100).toFixed(0) + '%';

  // No actionable mispricing → say so plainly instead of touting a convergence %.
  if (v.signal === 'none') {
    return `${v.instrument} is fairly priced — only ${zAbs}σ from consensus fair value `
         + `(${fmt(v.marketPrice)} vs ${fmt(v.fairValue)}). No actionable mispricing. Confidence ${pct(v.confidence)}.`;
  }

  const dir = v.mispricing.rich ? 'above' : 'below';
  const nAgree = v.ensemble.members.length;
  const conv = v.convergence;
  let s = `${v.instrument} is trading ${zAbs}σ ${dir} consensus fair value `
        + `(${fmt(v.marketPrice)} vs ${fmt(v.fairValue)}). ${nAgree} models combined`;
  if (v.ensemble.effN) s += ` (~${v.ensemble.effN.toFixed(1)} independent)`;
  s += `. `;
  if (conv) {
    s += `Model implies ~${pct(conv.pRevert)} probability of reverting within `
       + `${conv.horizon} bars (half-life ≈ ${isFinite(conv.halfLife) ? conv.halfLife.toFixed(1) : '∞'} bars), `
       + `expected move ${conv.expectedMagnitude >= 0 ? '+' : ''}${conv.expectedMagnitude.toFixed(2)}σ. `;
    const br = v.snapbackBaseRate;
    if (br?.baseRate != null) {
      s += `BUT the empirical snap-back base rate is ${pct(br.baseRate)} (${br.events} events)`;
      if (Math.abs(conv.pRevert - br.baseRate) > 0.4)
        s += ` — the model and history disagree sharply, so treat the convergence number with suspicion`;
      s += `. `;
    }
  }
  s += `Confidence ${pct(v.confidence)}.`;
  return s;
}

function fmt(x) { return Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(2) : x.toFixed(5)) : '—'; }

// Minimal HTML card (self-contained inline styles; safe to inject into any page).
export function valuationCard(v) {
  if (!v || !v.ok) return `<div class="mve-card">MVE: insufficient data</div>`;
  const m = v.mispricing, c = v.convergence;
  const none = v.signal === 'none';
  const col = none ? '#8891a0' : (!m.rich ? '#22c55e' : '#ef4444');
  const badge = none ? `FAIRLY PRICED ${Math.abs(m.z).toFixed(1)}σ` : `${m.label.toUpperCase()} ${Math.abs(m.z).toFixed(1)}σ`;
  const pct = x => x == null ? '—' : (x * 100).toFixed(0) + '%';
  const row = (k, val, muted) => `<div style="display:flex;justify-content:space-between;padding:3px 0${muted ? ';opacity:.5' : ''}"><span style="color:#9aa">${k}</span><span style="font-family:monospace">${val}</span></div>`;
  // Flag when the model's convergence prob and the measured base rate disagree.
  const br = v.snapbackBaseRate;
  const disagree = c && br?.baseRate != null && Math.abs(c.pRevert - br.baseRate) > 0.4;
  return `
  <div class="mve-card" style="background:#12151c;border:1px solid #2a2f3a;border-radius:10px;padding:14px;color:#e6e8ec;max-width:440px;font:13px system-ui">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>${v.instrument} — Valuation</strong>
      <span style="font-size:11px;padding:2px 8px;border-radius:8px;background:${col}22;color:${col};border:1px solid ${col}55">${badge}</span>
    </div>
    ${row('Market price', fmt(v.marketPrice))}
    ${row('Consensus fair value', fmt(v.fairValue) + ` <span style="color:#667">±${fmt(v.sigma)}</span>`)}
    ${row('Mispricing', `${m.gap >= 0 ? '+' : ''}${fmt(m.gap)} (${none ? 'fairly priced' : m.rich ? 'rich' : 'cheap'})`)}
    ${c ? row('P(convergence) — model', pct(c.pRevert) + ` in ${c.horizon} bars`, none) : ''}
    ${br?.baseRate != null ? row('Empirical base rate', `${pct(br.baseRate)} (${br.events} events)` + (disagree ? '  ⚠' : ''), none) : ''}
    ${c ? row('Expected move', `${c.expectedMagnitude >= 0 ? '+' : ''}${c.expectedMagnitude.toFixed(2)}σ`, none) : ''}
    ${c ? row('Expected hold', (isFinite(c.halfLife) ? c.halfLife.toFixed(1) : '∞') + ' bars (½-life)', none) : ''}
    ${row('Models', `${v.ensemble.members.length} (~${v.ensemble.effN?.toFixed(1) ?? '?'} independent)`)}
    ${row('Confidence', pct(v.confidence))}
    ${disagree ? `<div style="margin-top:6px;font-size:10.5px;color:#f59e0b;background:#f59e0b18;border:1px solid #f59e0b44;border-radius:6px;padding:6px 8px">⚠ Model P(convergence) and the measured base rate disagree sharply — the convergence number is not trustworthy here (this is the validation gate working).</div>` : ''}
    <div style="margin-top:8px;font-size:11px;color:#8891a0;border-top:1px solid #2a2f3a;padding-top:8px">
      ${valuationText(v)}
    </div>
    <div style="margin-top:6px;font-size:10px;color:#5b6270">Values right of Mispricing are model, ex-ante — size from OOS-calibrated confidence, ½-Kelly max. Run OOS validation before trusting.</div>
  </div>`;
}
