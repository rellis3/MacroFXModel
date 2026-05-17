import { S } from './state.js';
import { COMPASS_CONFIG, FIB_LEVELS } from './config.js';
import { getPipSize, getDigits, londonSessionDay } from './utils.js';
import { compassFairValue, zScore } from './compass.js';
import { getCaps } from './caps.js';
import { oiFmtStrike, computeGravityRegime } from './oi.js';
import { getPairSurpriseScore } from './events.js';
import { detectCrossConflict, calculateTierScores, computeBayesianScore } from './macro.js';
import { hmmSignalScore } from '../hmm.js';
import { computeARMAForecast, computeRegimeTransition } from './arma.js';
import { computeRangeBias, openRangeBiasModal, closeRangeBiasModal, saveRangeBiasModal } from './range-bias.js';
import { gradeEntry } from './trade-grade.js';
import { computeRegimeConfidence } from './regime-confidence.js';
import { computeArimaContext } from './arima-price.js';

export { openRangeBiasModal, closeRangeBiasModal, saveRangeBiasModal };

// ── FV gap → pips ────────────────────────────────────────────────────────────
// 1 z-unit ≈ 0.5 ATR (conservative — spread z-score is smoother than price)
export function fvGapToPips(fvGap, atr, pipSize) {
  if (fvGap == null || !atr || !pipSize) return null;
  return (fvGap * atr * 0.5) / pipSize;
}

// ── Equity signal engine (NAS100) ────────────────────────────────────────────
// Uses macro risk appetite indicators instead of yield spread data.
// VIX level (0-3) + HY spread (0-2) + TIPS real yield (0-2, -1) + NFCI (0-2) + DXY (0-1) = max 10

function runEquitySignalEngine() {
  const vix  = S.fredData?.vix?.value  ?? null;
  const hy   = S.fredData?.hy?.value   ?? null;
  const tips = S.fredData?.tips?.value ?? null;
  const nfci = S.fredData?.nfci?.value ?? null;
  const dxy  = S.fredData?.dxy?.value  ?? null;

  let score = 0;
  const reasons = [];

  // VIX level — lower VIX = risk-on = equity bullish
  if (vix != null) {
    if (vix < 15)      { score += 3; reasons.push({ icon: '🟢', label: 'VIX', val: `${vix.toFixed(1)} — complacent, strong risk-on`, pts: 3 }); }
    else if (vix < 20) { score += 2; reasons.push({ icon: '🟢', label: 'VIX', val: `${vix.toFixed(1)} — low, risk appetite firm`, pts: 2 }); }
    else if (vix < 25) { score += 1; reasons.push({ icon: '🟡', label: 'VIX', val: `${vix.toFixed(1)} — elevated, caution warranted`, pts: 1 }); }
    else if (vix < 35) { score += 0; reasons.push({ icon: '🔴', label: 'VIX', val: `${vix.toFixed(1)} — high, risk-off environment`, pts: 0 }); }
    else               { score += 0; reasons.push({ icon: '🔴', label: 'VIX', val: `${vix.toFixed(1)} — extreme fear`, pts: 0 }); }
  } else {
    reasons.push({ icon: '⚪', label: 'VIX', val: 'No data', pts: 0 });
  }

  // HY credit spread — tighter spreads = risk appetite = equity bullish
  if (hy != null) {
    if (hy < 300)      { score += 2; reasons.push({ icon: '🟢', label: 'HY Spread', val: `${hy.toFixed(0)}bps — tight, credit supportive`, pts: 2 }); }
    else if (hy < 400) { score += 1; reasons.push({ icon: '🟡', label: 'HY Spread', val: `${hy.toFixed(0)}bps — moderate, some stress forming`, pts: 1 }); }
    else               { score += 0; reasons.push({ icon: '🔴', label: 'HY Spread', val: `${hy.toFixed(0)}bps — wide, credit deteriorating`, pts: 0 }); }
  } else {
    reasons.push({ icon: '⚪', label: 'HY Spread', val: 'No data', pts: 0 });
  }

  // Real yield (TIPS) — negative real yield = equity friendly; high real yield = headwind
  if (tips != null) {
    if (tips < 0)        { score += 2; reasons.push({ icon: '🟢', label: 'Real Yield (TIPS)', val: `${tips.toFixed(2)}% — negative, equity-friendly`, pts: 2 }); }
    else if (tips < 1.5) { score += 1; reasons.push({ icon: '🟡', label: 'Real Yield (TIPS)', val: `${tips.toFixed(2)}% — modest, neutral`, pts: 1 }); }
    else if (tips < 2.5) { score += 0; reasons.push({ icon: '🟡', label: 'Real Yield (TIPS)', val: `${tips.toFixed(2)}% — elevated, competing with equity returns`, pts: 0 }); }
    else                 { score = Math.max(0, score - 1); reasons.push({ icon: '🔴', label: 'Real Yield (TIPS)', val: `${tips.toFixed(2)}% — high, equity headwind`, pts: -1 }); }
  } else {
    reasons.push({ icon: '⚪', label: 'Real Yield (TIPS)', val: 'No data', pts: 0 });
  }

  // NFCI — below 0 = accommodative financial conditions = equity bullish
  if (nfci != null) {
    if (nfci < -0.5)  { score += 2; reasons.push({ icon: '🟢', label: 'NFCI', val: `${nfci.toFixed(2)} — very accommodative`, pts: 2 }); }
    else if (nfci < 0) { score += 1; reasons.push({ icon: '🟡', label: 'NFCI', val: `${nfci.toFixed(2)} — accommodative`, pts: 1 }); }
    else               { score += 0; reasons.push({ icon: '🔴', label: 'NFCI', val: `${nfci.toFixed(2)} — restrictive financial conditions`, pts: 0 }); }
  } else {
    reasons.push({ icon: '⚪', label: 'NFCI', val: 'No data', pts: 0 });
  }

  // DXY — weaker USD generally supportive for US equities priced globally
  if (dxy != null) {
    if (dxy < 100)      { score += 1; reasons.push({ icon: '🟢', label: 'DXY', val: `${dxy.toFixed(1)} — weak USD, equity supportive`, pts: 1 }); }
    else if (dxy < 105) { score += 0; reasons.push({ icon: '🟡', label: 'DXY', val: `${dxy.toFixed(1)} — neutral USD`, pts: 0 }); }
    else                { score += 0; reasons.push({ icon: '🔴', label: 'DXY', val: `${dxy.toFixed(1)} — strong USD, equity headwind`, pts: 0 }); }
  } else {
    reasons.push({ icon: '⚪', label: 'DXY', val: 'No data', pts: 0 });
  }

  const maxScore = 10;
  let bias, type;
  if      (score >= 7) { bias = 'LONG';    type = 'trend'; }
  else if (score >= 5) { bias = 'LONG';    type = 'reversion'; }
  else if (score <= 3) { bias = 'SHORT';   type = 'trend'; }
  else                 { bias = 'NEUTRAL'; type = 'neutral'; }

  return {
    bias, type, score, maxScore, reasons,
    fvPips: null, fvGap: null, fvBull: null,
    mom10Bull: null, mom2Bull: null, sp10Bull: null, lagDetected: false,
    surpriseMod: null, crossConflict: null, armaMod: null, realYieldMod: null,
    isEquity: true,
  };
}

// ── Signal engine ────────────────────────────────────────────────────────────

export function runSignalEngine(compassData, volRegime) {
  const sym    = S.currentPair.symbol;

  if (sym === 'NAS100_USD') return runEquitySignalEngine();

  const data   = compassData[sym];
  const cfg    = COMPASS_CONFIG[sym] || null;
  const atr    = volRegime?.atr || 0;
  const pipSz  = getPipSize(sym);

  if (!data || !cfg) {
    return { bias: 'NEUTRAL', type: 'neutral', score: 0, maxScore: 9, reasons: [], fvPips: null, noData: true };
  }

  const fvGap  = compassFairValue(data);
  const fvPips = fvGapToPips(fvGap, atr, pipSz);
  const mom10  = data.momentum10y;
  const mom2   = data.momentum2y;
  const sp10   = data.latest10y;
  const sp2    = data.latest2y;

  const z10arr  = data.spread10y.length > 20 ? zScore(data.spread10y) : null;
  const z2arr   = data.spread2y.length  > 20 ? zScore(data.spread2y)  : null;
  const z10last = z10arr ? z10arr[z10arr.length-1]?.value : null;
  const z2last  = z2arr  ? z2arr[z2arr.length-1]?.value   : null;

  const sign = cfg.fxSign;

  const sp10Bull = sp10 != null ? (sign > 0 ? sp10 > 0 : sp10 < 0) : null;
  const sp2Bull  = sp2  != null ? (sign > 0 ? sp2  > 0 : sp2  < 0) : null;

  const mom10Bull = mom10 != null ? (sign > 0 ? mom10 > 0 : mom10 < 0) : null;
  const mom2Bull  = mom2  != null ? (sign > 0 ? mom2  > 0 : mom2  < 0) : null;

  const fvBull = fvGap != null ? fvGap > 0 : null;

  const lagDetected = fvGap != null && mom10 != null && mom2 != null &&
    Math.abs(fvGap) > 0.8 &&
    (fvBull === mom10Bull) &&
    (fvBull === mom2Bull);

  let score = 0;
  const reasons = [];

  if (fvGap != null) {
    const fvAbs = Math.abs(fvGap);
    if (fvAbs > 1.5)      { score += 3; reasons.push({ icon: fvBull?'🟢':'🔴', label: 'Fair value gap', val: (fvBull?'UNDER':'OVER') + 'VALUED', pts: 3 }); }
    else if (fvAbs > 0.8) { score += 2; reasons.push({ icon: fvBull?'🟢':'🔴', label: 'Fair value gap', val: (fvBull?'Under':'Over') + 'valued', pts: 2 }); }
    else if (fvAbs > 0.3) { score += 1; reasons.push({ icon: '🟡', label: 'Fair value gap', val: 'Mild ' + (fvBull?'under':'over') + 'value', pts: 1 }); }
    else                  {             reasons.push({ icon: '⚪', label: 'Fair value gap', val: 'At fair value', pts: 0 }); }
  } else {
    reasons.push({ icon: '⚪', label: 'Fair value gap', val: 'Insufficient data', pts: 0 });
  }

  if (mom10 != null) {
    const momAbs = Math.abs(mom10);
    if (momAbs > 0.1) {
      score += 2;
      reasons.push({ icon: mom10Bull?'🟢':'🔴', label: '10Y spread momentum', val: (mom10 > 0 ? '▲ +' : '▼ ') + mom10.toFixed(2) + '%', pts: 2 });
    } else {
      score += 1;
      reasons.push({ icon: '🟡', label: '10Y spread momentum', val: 'Flat ' + mom10.toFixed(3) + '%', pts: 1 });
    }
  } else {
    reasons.push({ icon: '⚪', label: '10Y spread momentum', val: 'No data', pts: 0 });
  }

  if (mom2 != null) {
    const m2abs = Math.abs(mom2);
    if (m2abs > 0.05) {
      score += 1;
      reasons.push({ icon: mom2Bull?'🟢':'🔴', label: '2Y spread momentum', val: (mom2 > 0 ? '▲ +' : '▼ ') + mom2.toFixed(2) + '%', pts: 1 });
    } else {
      reasons.push({ icon: '🟡', label: '2Y spread momentum', val: 'Flat', pts: 0 });
    }
  }

  if (sp10Bull != null) {
    score += 1;
    reasons.push({ icon: sp10Bull?'🟢':'🔴', label: '10Y spread level', val: sp10 != null ? (sp10.toFixed(2) + '% ' + (sp10Bull?'bullish':'bearish')) : '—', pts: 1 });
  }

  if (lagDetected) {
    score += 2;
    reasons.push({ icon: '⚡', label: 'Lag detected', val: 'Spread moved, price lagging — catch-up likely', pts: 2 });
  }

  const bullCount = [fvBull, mom10Bull, mom2Bull, sp10Bull].filter(x => x === true).length;
  const bearCount = [fvBull, mom10Bull, mom2Bull, sp10Bull].filter(x => x === false).length;

  let bias, type;
  if (bullCount >= 3) {
    bias = 'LONG';
    type = lagDetected ? 'catchup' : (mom10Bull ? 'trend' : 'reversion');
  } else if (bearCount >= 3) {
    bias = 'SHORT';
    type = lagDetected ? 'catchup' : (mom10Bull === false ? 'trend' : 'reversion');
  } else if (Math.abs(fvGap || 0) > 0.8) {
    bias = fvBull ? 'LONG' : 'SHORT';
    type = 'reversion';
  } else {
    bias = 'NEUTRAL';
    type = 'neutral';
  }

  // ── Macro Surprise Index modifier (Gap 1 fix) ───────────────────────────────
  // Uses actual-vs-forecast Finnhub data. Positive net = base ccy beat = bullish pair.
  let surpriseMod = null;
  try {
    const ps = getPairSurpriseScore();
    if (ps != null && Math.abs(ps.net) > 0.8 && bias !== 'NEUTRAL') {
      const surpriseBull = ps.net > 0;
      const signalBull   = bias === 'LONG';
      const confirms     = surpriseBull === signalBull;
      const magnitude    = Math.abs(ps.net) > 1.5 ? 2 : 1;
      // Confirming surprise adds points; conflicting surprise DEDUCTS points
      const pts          = confirms ? magnitude : -magnitude;
      score             += pts;
      surpriseMod        = { net: ps.net, confirms, pts };
      reasons.push({
        icon:  confirms ? '\u{1F7E2}' : '\u{1F534}',
        label: 'Macro Surprise',
        val:   `${ps.net >= 0 ? '+' : ''}${ps.net.toFixed(2)} net ${confirms ? '✓ confirms' : '✗ conflicts'}`,
        pts,
      });
    }
  } catch(e) {}

  // ── Cross-Pair USD Strength conflict detection ───────────────────────────────
  const crossConflict = detectCrossConflict(S.usdStrength, bias, S.currentPair);
  if (crossConflict) {
    const pts = crossConflict.type === 'confirmed' ? (crossConflict.severity === 'strong' ? 2 : 1) : 0;
    score    += pts;
    reasons.push({
      icon:  crossConflict.type === 'confirmed' ? '🟢' : '🔴',
      label: 'Cross-Pair USD',
      val:   crossConflict.message,
      pts,
    });
  }

  // ── ARMA spread forecast modifier ────────────────────────────────────────────
  // +1 when ARMA(1,1) forecast direction (HIGH/MEDIUM confidence, skill≥5%) confirms bias.
  let armaMod = null;
  try {
    const arma = computeARMAForecast(data);
    if (arma && arma.confidence !== 'LOW' && arma.avgSkill >= 5 && arma.direction !== 'MIXED') {
      const armaBull = arma.direction === 'BULLISH';
      const confirms = bias !== 'NEUTRAL' && armaBull === (bias === 'LONG');
      // Confirming: +1. Conflicting with HIGH confidence: -1. Conflicting MEDIUM: 0.
      const pts = confirms
        ? 1
        : (bias !== 'NEUTRAL' && arma.confidence === 'HIGH') ? -1 : 0;
      score += pts;
      armaMod = { direction: arma.direction, confidence: arma.confidence, skill: arma.avgSkill, confirms, pts };
      reasons.push({
        icon:  confirms ? '\u{1F7E2}' : pts < 0 ? '\u{1F534}' : '⚪',
        label: 'ARMA spread forecast',
        val:   `${arma.direction} · ${arma.confidence} · ${arma.avgSkill >= 0 ? '+' : ''}${arma.avgSkill}% vs RW ${!confirms && bias !== 'NEUTRAL' ? '✗ conflicts' : confirms ? '✓ confirms' : ''}`,
        pts,
      });
    }
  } catch(e) {}

  // ── Real Yield (TIPS) modifier ───────────────────────────────────────────────
  // High real yield is a headwind for risk/carry pairs (AUD, NZD) and reinforces
  // USD carry advantage for USD-base pairs (JPY, CHF, CAD). Max impact: ±1 point.
  // Skipped for XAU/USD (handled in T1) and EUR/USD, GBP/USD (relative real yield
  // is already embedded in the T1 rate differential for those pairs).
  let realYieldMod = null;
  try {
    const tipsVal = S.fredData?.tips?.value ?? null;
    const _rySkip = ['XAU/USD', 'EUR/USD', 'GBP/USD'].includes(sym);
    if (tipsVal != null && !_rySkip) {
      const riskPairs    = ['AUD/USD', 'NZD/USD'];
      const usdBasePairs = ['USD/JPY', 'USD/CHF', 'USD/CAD'];
      const highReal = tipsVal > 2.0;
      const lowReal  = tipsVal < 0.5;

      if (riskPairs.includes(sym)) {
        if (highReal) {
          score = Math.max(0, score - 1);
          realYieldMod = { val: tipsVal, dir: 'headwind', pts: -1 };
          reasons.push({ icon: '🔴', label: 'Real Yield (TIPS)', val: `${tipsVal.toFixed(2)}% — headwind for ${sym.split('/')[0]} carry`, pts: -1 });
        } else if (lowReal) {
          score = Math.min(12, score + 1);
          realYieldMod = { val: tipsVal, dir: 'tailwind', pts: 1 };
          reasons.push({ icon: '🟢', label: 'Real Yield (TIPS)', val: `${tipsVal.toFixed(2)}% — carry environment supportive`, pts: 1 });
        }
      } else if (usdBasePairs.includes(sym) && highReal) {
        score = Math.min(12, score + 1);
        realYieldMod = { val: tipsVal, dir: 'usd-tailwind', pts: 1 };
        reasons.push({ icon: '🟢', label: 'Real Yield (TIPS)', val: `${tipsVal.toFixed(2)}% — reinforces USD carry advantage`, pts: 1 });
      }
    }
  } catch(e) {}

  // ── Vol impulse modifier ─────────────────────────────────────────────────────
  // Penalise reversion/catchup signals during expanding vol (breakout conditions).
  // Reward them during contracting vol (mean-reversion conditions improve).
  let volBiasMod = null;
  try {
    const vb = volRegime?.volBias;
    if (vb === 'expanding' && (type === 'reversion' || type === 'catchup')) {
      score = Math.max(0, score - 1);
      volBiasMod = { bias: 'expanding', pts: -1 };
      reasons.push({
        icon:  '\u{1F7E1}',
        label: 'Vol Expanding',
        val:   `+${volRegime.volImpulsePct?.toFixed(0) ?? '?'}% impulse — reversion risk elevated`,
        pts:   -1,
      });
    } else if (vb === 'contracting' && (type === 'reversion' || type === 'catchup')) {
      score = Math.min(12, score + 1);
      volBiasMod = { bias: 'contracting', pts: 1 };
      reasons.push({
        icon:  '\u{1F7E2}',
        label: 'Vol Contracting',
        val:   `${volRegime.volImpulsePct?.toFixed(0) ?? '?'}% impulse — mean-reversion conditions improving`,
        pts:   1,
      });
    }
  } catch(e) {}

  return { bias, type, score, maxScore: 12, reasons, fvPips, fvGap, fvBull,
           mom10Bull, mom2Bull, sp10Bull, lagDetected, surpriseMod, crossConflict, armaMod, realYieldMod, volBiasMod };
}

// ── Render signal card ────────────────────────────────────────────────────────

export function renderSignalCard(signal, volRegime, otcForecast) {
  if (signal.noData) {
    return `<div class="sig-no-data">📡 Yield spread data loading…<br><span style="font-size:10px">Macro Compass must load first</span></div>`;
  }

  const stars     = Math.round((signal.score / signal.maxScore) * 5);
  const starStr   = '⭐'.repeat(Math.max(0, stars)) + '☆'.repeat(Math.max(0, 5 - stars));
  const typeLabel = signal.type === 'trend'     ? 'Trend Follow' :
                    signal.type === 'reversion' ? 'Mean Reversion' :
                    signal.type === 'catchup'   ? 'Catch-up / Lag' : 'No Signal';
  const strength  = signal.score >= 7 ? 'STRONG' : signal.score >= 5 ? 'MEDIUM' : signal.score >= 3 ? 'WEAK' : 'NO SIGNAL';
  const cls       = signal.bias === 'LONG' ? 'long' : signal.bias === 'SHORT' ? 'short' :
                    signal.type === 'reversion' ? 'fade' : 'neutral';

  const fvPipStr = signal.fvPips != null
    ? `${signal.fvPips > 0 ? '+' : ''}${signal.fvPips.toFixed(0)} pips (${signal.fvBull ? 'undervalued' : 'overvalued'})`
    : '—';

  const rowsHtml = signal.reasons.map(r => `
    <div class="sig-row">
      <span class="sig-row-icon">${r.icon}</span>
      <span class="sig-row-label">${r.label}</span>
      <span class="sig-row-val">${r.val}</span>
      <span class="sig-row-pts ${r.pts > 0 ? 'pos' : r.pts < 0 ? 'neg' : 'zero'}">${r.pts > 0 ? '+' : ''}${r.pts}</span>
    </div>`).join('');

  const fvRow = signal.isEquity
    ? `<div class="sig-fv-pip">
        <span class="sfv-lbl">Model</span>
        <span class="sfv-val" style="color:var(--text2)">Equity Risk Appetite (VIX · HY · TIPS · NFCI · DXY)</span>
      </div>`
    : `<div class="sig-fv-pip">
        <span class="sfv-lbl">FV Gap (pips)</span>
        <span class="sfv-val" style="color:${signal.fvBull ? 'var(--green)' : signal.fvBull === false ? 'var(--red)' : 'var(--text3)'}">${fvPipStr}</span>
        <span class="sfv-sub">ATR-scaled estimate</span>
      </div>`;

  const disclaimer = signal.isEquity
    ? `⚠ Equity signal uses macro risk-appetite data (1-day FRED lag). Use as probabilistic bias — confirm with price action at key levels.`
    : `⚠ Signal engine uses rate spread data (1-day FRED lag). Use as probabilistic bias — not a mechanical entry trigger. Confirm with price action at key levels below.`;

  const crossWarn = (signal.crossConflict?.type === 'conflict' && signal.crossConflict?.sizeMult <= 0.75)
    ? `<div style="font-size:11px;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:7px 10px;margin-bottom:8px;line-height:1.5">
        ⚠ <strong>Cross-pair USD conflict</strong> — USD composite strength contradicts this signal direction.
        Position size reduced to ${Math.round((signal.crossConflict.sizeMult ?? 1) * 100)}%. Treat with caution or stand aside.
       </div>`
    : (signal.crossConflict?.type === 'confirmed' && signal.crossConflict?.severity === 'strong')
    ? `<div style="font-size:11px;color:var(--green);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:6px;padding:7px 10px;margin-bottom:8px;line-height:1.5">
        ✔ <strong>Cross-pair USD confirmed</strong> — USD composite strength aligns with signal direction.
       </div>`
    : '';

  return `
    <div class="signal-card ${cls}">
      ${crossWarn}
      <div class="sig-hd">
        <div>
          <div class="sig-bias">${signal.bias === 'NEUTRAL' ? '— NEUTRAL' : (signal.bias === 'LONG' ? '↑ LONG' : '↓ SHORT')}</div>
          <div style="margin-top:4px"><span class="sig-type ${signal.type}">${typeLabel}</span></div>
        </div>
        <div class="sig-score-wrap">
          <div class="sig-stars">${starStr}</div>
          <div class="sig-score-lbl">${signal.score}/${signal.maxScore} · ${strength}</div>
        </div>
      </div>

      ${fvRow}

      <div class="sig-rows">${rowsHtml}</div>

      ${otcForecast ? (() => {
        const otcIcon  = otcForecast.sessionChar === 'TRENDING' ? '🟢' :
                         otcForecast.sessionChar === 'CHOPPY'   ? '🔴' : '🟡';
        const otcLabel = `O-to-C character`;
        const otcVal   = `${otcForecast.sessionChar} · ${Math.round(otcForecast.bullFrac * 100)}% bull sessions · median ${otcForecast.medianPips.toFixed(0)}p`;
        const otcPts   = otcForecast.sessionChar === 'TRENDING' ? 0 : 0;
        return `<div class="sig-row">
          <span class="sig-row-icon">${otcIcon}</span>
          <span class="sig-row-label">${otcLabel}</span>
          <span class="sig-row-val">${otcVal}</span>
          <span class="sig-row-pts zero">—</span>
        </div>`;
      })() : ''}

      <div style="font-size:9.5px;color:var(--text3);line-height:1.5;padding-top:6px;border-top:1px solid var(--border)">
        ${disclaimer}
      </div>
    </div>`;
}

// ── Signal quality score ──────────────────────────────────────────────────────
// Composite 0–100% score across 5 factors:
//   HMM regime alignment  20% — is market ranging (ideal for fades) or trending?
//   Bayesian bounce prob  30% — macro tier evidence for bounce direction
//   Regime tier alignment 25% — T1-T8 tiers supporting the trade direction
//   Range bias conviction 15% — 15 range features confirming the fade
//   Structural quality    10% — level density, tight fib, cross-session, pivots
export function computeSignalScore(entry, tierData, hmmData = null) {
  if (!entry?.direction || !tierData?.tiers) return null;
  const isLong = entry.direction === 'long';
  const tiers  = tierData.tiers;

  // 1. HMM regime alignment (20%)
  // RANGE regime = ideal for fades. TREND opposing direction = risky.
  const hmmScore = hmmSignalScore(entry.direction, hmmData);

  // 2. Bayesian bounce probability (30%)
  // prob measures continuation in bayes.dir — flip when direction conflicts.
  const bayes = computeBayesianScore(tiers);
  let bayesScore = 0.5;
  if (bayes && bayes.dir !== 'neutral') {
    bayesScore = bayes.dir === entry.direction ? bayes.prob : 1 - bayes.prob;
  }

  // 3. Macro regime tier alignment (25%)
  const activeTiers = tiers.filter(t => !t.na);
  const agreeTiers  = activeTiers.filter(t => isLong ? t.score > 0 : t.score < 0).length;
  const regimeScore = activeTiers.length > 0 ? agreeTiers / activeTiers.length : 0.5;

  // 4. Range bias conviction (15%)
  // conviction is totalPts/maxPts — map [-1,1] → [0,1].
  const conviction = entry.rangeBias?.conviction ?? 0;
  const rangeScore = Math.max(0, Math.min(1, (conviction + 1) / 2));

  // 5. Structural level quality (10%)
  const density     = Math.min(entry.density ?? 1, 3);
  const structScore = Math.min(1,
    (density / 3) * 0.60 +
    (entry.isTight           ? 0.15 : 0) +
    (entry.crossSessionMatch ? 0.15 : 0) +
    (entry.pivotMatch        ? 0.07 : 0) +
    (entry.oiMatch           ? 0.03 : 0),
  );

  return Math.round((
    hmmScore    * 0.20 +
    bayesScore  * 0.30 +
    regimeScore * 0.25 +
    rangeScore  * 0.15 +
    structScore * 0.10
  ) * 100);
}

export function signalScoreTier(score) {
  if (score == null) return 'unknown';
  if (score >= 65)   return 'strong';
  if (score >= 50)   return 'moderate';
  return 'weak';
}

// ── Entry scanner ─────────────────────────────────────────────────────────────

export function runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime) {
  if (!quote) return [];
  const sym    = S.currentPair.symbol;
  const pipSz  = getPipSize(sym);
  const digits = getDigits(sym);
  const atr    = volRegime?.atr || 0;
  const price  = quote.price;

  const caps       = getCaps(sym);
  const unit       = sym === 'NAS100_USD' ? 'pts' : 'p';
  const isGoldScan = pipSz >= 0.1 && sym.includes('XAU');
  const _pipMult   = isGoldScan ? 1.0 : pipSz;
  const oiProx     = Math.min(atr * caps.oiAtrFrac,  caps.oiPipCap  * _pipMult);
  const pivProx    = Math.min(atr * caps.pivAtrFrac,  caps.pivPipCap * _pipMult);
  const rangeProx  = Math.min(atr * caps.rngAtrFrac,  caps.rngPipCap * _pipMult);
  const gexProx    = Math.min(atr * caps.gexAtrFrac,  caps.gexPipCap * _pipMult);

  const oiStore = (() => { try { return JSON.parse(localStorage.getItem('oi_store') || '{}'); } catch(e) { return {}; } })();
  const oi = oiStore[sym] || null;

  // OI Gravity + PIN/BREAKOUT session regime
  const gravityRegime = oi ? computeGravityRegime(oi, atr, pipSz) : null;

  // Composite size multiplier: event risk × session confidence × cross-pair conflict
  const eventMult    = S.eventRisk?.sizeMult         ?? 1.0;
  const sessionConf  = S.sessionData?.confidence      ?? 1.0;
  const crossMult    = signal.crossConflict?.sizeMult ?? 1.0;
  const sizeMult     = Math.max(0.10, eventMult * sessionConf * crossMult);

  const candidates = enhanced.map(c => {
    let layerScore = c.stars;
    const layers   = [];
    const tags     = [];

    tags.push({ cls: 'fib', label: c.isTight ? 'Tight Fib' : 'Fib', key: 'fib' });

    // Divergence tags from enhanceConfluences (already factored into c.stars)
    if (c.divTags?.length) {
      for (const dt of c.divTags) {
        tags.push({ cls: 'div', label: dt.label, key: 'div' });
        layers.push(dt.label);
      }
    }

    const signalAligned = signal.bias !== 'NEUTRAL' && c.direction != null &&
      ((signal.bias === 'LONG' && c.direction === 'long') ||
       (signal.bias === 'SHORT' && c.direction === 'short'));
    if (signalAligned) {
      layerScore += 1;
      tags.push({ cls: 'signal', label: `Signal ${signal.bias}`, key: 'signal' });
      layers.push('Signal aligned');
    }

    let oiTag = null;
    if (oi) {
      if (Math.abs(c.price - oi.callWall) <= oiProx) {
        const above = c.direction === 'short';
        layerScore += above ? 1.5 : 0.5;
        const cwDist = Math.round(Math.abs(c.price - oi.callWall) / pipSz);
        oiTag = { cls: 'oi', label: `Call Wall ${oiFmtStrike(oi.callWall, sym)} (${cwDist}${unit})`, key: 'callwall' };
        layers.push('Near call wall');
      }
      if (Math.abs(c.price - oi.putWall) <= oiProx) {
        const below = c.direction === 'long';
        layerScore += below ? 1.5 : 0.5;
        const pwDist = Math.round(Math.abs(c.price - oi.putWall) / pipSz);
        oiTag = { cls: 'oi', label: `Put Wall ${oiFmtStrike(oi.putWall, sym)} (${pwDist}${unit})`, key: 'putwall' };
        layers.push('Near put wall');
      }
      if (Math.abs(c.price - oi.maxPain) <= oiProx) {
        layerScore += 0.5;
        const mpDist = Math.round(Math.abs(c.price - oi.maxPain) / pipSz);
        oiTag = oiTag || { cls: 'oi', label: `Max Pain ${oiFmtStrike(oi.maxPain, sym)} (${mpDist}${unit})`, key: 'maxpain' };
        layers.push('Near max pain');
      }
      if (oiTag) tags.push(oiTag);

      if (oi.gexProfile && oi.gexProfile.length > 1) {
        let flipStrike = null;
        for (let i = 1; i < oi.gexProfile.length; i++) {
          if (Math.sign(oi.gexProfile[i].netGex) !== Math.sign(oi.gexProfile[i-1].netGex)) {
            flipStrike = oi.gexProfile[i].strike; break;
          }
        }
        if (flipStrike && Math.abs(c.price - flipStrike) <= gexProx) {
          layerScore += 1;
          const gfDist = Math.round(Math.abs(c.price - flipStrike) / pipSz);
          tags.push({ cls: 'gex', label: `Gamma Flip ${oiFmtStrike(flipStrike, sym)} (${gfDist}${unit})`, key: 'gammaflip' });
          layers.push('Near gamma flip');
        }
      }
    }

    if (c.pivotMatch) {
      const _pivVal = c.pivotMatch && pivots[c.pivotMatch.toLowerCase()]
        ? pivots[c.pivotMatch.toLowerCase()] : null;
      const _pivRawDist = _pivVal != null ? Math.abs(c.price - _pivVal) : null;
      const _isGoldTag = pipSz >= 0.1 && sym.includes('XAU');
      const pivDist = _pivRawDist != null
        ? (_isGoldTag ? _pivRawDist.toFixed(2) + '$' : Math.round(_pivRawDist / pipSz) + unit)
        : null;
      tags.push({ cls: 'pivot', label: c.pivotMatch + (pivDist != null ? ` (${pivDist})` : ''), key: 'pivot' });
      layers.push('Pivot ' + c.pivotMatch);
    }

    if (asia?.today) {
      if (Math.abs(c.price - asia.today.high) <= rangeProx) {
        layerScore += 0.5;
        const _asiahd = Math.round(Math.abs(c.price - asia.today.high) / pipSz);
        tags.push({ cls: 'range', label: `Asia High (${_asiahd}${unit})`, key: 'asiah' });
        layers.push('Asia range high');
      }
      if (Math.abs(c.price - asia.today.low) <= rangeProx) {
        layerScore += 0.5;
        const _asiald = Math.round(Math.abs(c.price - asia.today.low) / pipSz);
        tags.push({ cls: 'range', label: `Asia Low (${_asiald}${unit})`, key: 'asial' });
        layers.push('Asia range low');
      }
    }
    if (monday?.current) {
      if (Math.abs(c.price - monday.current.high) <= rangeProx) {
        layerScore += 0.5;
        const _monhd = Math.round(Math.abs(c.price - monday.current.high) / pipSz);
        tags.push({ cls: 'range', label: `Mon High (${_monhd}${unit})`, key: 'monh' });
        layers.push('Monday range high');
      }
      if (Math.abs(c.price - monday.current.low) <= rangeProx) {
        layerScore += 0.5;
        const _monld = Math.round(Math.abs(c.price - monday.current.low) / pipSz);
        tags.push({ cls: 'range', label: `Mon Low (${_monld}${unit})`, key: 'monl' });
        layers.push('Monday range low');
      }
    }

    // OI Gravity: tag when nearest OI strike is within 1 ATR of this confluence level.
    // In PIN regime: levels near the gravity strike are high-quality reversal setups.
    // In BREAKOUT regime: flag that OI gravity is low — market may run through the level.
    if (gravityRegime && gravityRegime.nearestStrike != null) {
      const gravDist = Math.abs(c.price - gravityRegime.nearestStrike);
      if (gravDist <= atr) {
        if (gravityRegime.regime === 'PIN') {
          layerScore += 0.5;
          const gStr = gravityRegime.gravityScore.toFixed(1);
          tags.push({ cls: 'oi', label: `⚓ Gravity ${gStr} (PIN)`, key: 'gravity' });
          layers.push('OI gravity — pin regime');
        } else if (gravityRegime.regime === 'BREAKOUT') {
          tags.push({ cls: 'warn', label: `⚡ Gravity ${gravityRegime.gravityScore.toFixed(1)} (BREAK)`, key: 'gravity' });
          layers.push('OI gravity — breakout regime');
        }
      }
    }

    // Gamma flip proximity: rate this separately from the existing gexProx check above
    // (already handled in the oi.gexProfile block); just add gravity regime context to flip tag.
    if (gravityRegime?.flipStrike != null && Math.abs(c.price - gravityRegime.flipStrike) <= gexProx) {
      // Already tagged as 'Gamma Flip' above — no double-tag, gravity context is in the regime badge
    }

    // Cross-session cluster: Asia and Monday fibs agree on this price
    if (c.crossSessionMatch) {
      layerScore += 1;
      const gapStr = c.crossSessionGap != null ? ` ${c.crossSessionGap.toFixed(1)}${unit} apart` : '';
      tags.push({ cls: 'pivot', label: `📐 Asia × Mon${gapStr}`, key: 'xsession' });
      layers.push('Cross-session cluster');
    }

    for (const dop of (S.sessionData?.dailyOpens || [])) {
      const _doDist = Math.abs(c.price - dop.price);
      if (_doDist <= rangeProx) {
        layerScore += 0.5;
        tags.push({ cls: 'range', label: `DO ${dop.label} (${Math.round(_doDist / pipSz)}${unit})`, key: 'dayopen' });
        layers.push(`Daily open ${dop.label}`);
        break; // tag the most recent matching day only
      }
    }
    if (S.sessionData?.londonOpenPrice) {
      const _lopDist = Math.abs(c.price - S.sessionData.londonOpenPrice);
      if (_lopDist <= rangeProx) {
        layerScore += 0.5;
        tags.push({ cls: 'range', label: `London Open (${Math.round(_lopDist / pipSz)}${unit})`, key: 'lopen' });
        layers.push('London open level');
      }
    }
    if (S.sessionData?.nyOpenPrice) {
      const _nyopDist = Math.abs(c.price - S.sessionData.nyOpenPrice);
      if (_nyopDist <= rangeProx) {
        layerScore += 0.5;
        tags.push({ cls: 'range', label: `NY Open (${Math.round(_nyopDist / pipSz)}${unit})`, key: 'nyopen' });
        layers.push('NY open level');
      }
    }

    const remaining  = volRegime.remainingRange || 0;
    const tpCap      = remaining * 0.85;

    let tp = c.tp, tpNote = 'Vol cap';
    if (c.tpCapped) tpNote = 'Vol capped (' + volRegime.usedPct + '% used)';

    if (oi && c.direction === 'long' && oi.callWall > c.price) {
      const wallDist = oi.callWall - c.price;
      if (wallDist <= tpCap) { tp = oi.callWall; tpNote = 'Call wall'; }
      else                   { tpNote = (c.tpCapped ? 'Vol cap' : 'ATR') + ' (call wall OOR)'; }
    } else if (oi && c.direction === 'short' && oi.putWall < c.price) {
      const wallDist = c.price - oi.putWall;
      if (wallDist <= tpCap) { tp = oi.putWall; tpNote = 'Put wall'; }
      else                   { tpNote = (c.tpCapped ? 'Vol cap' : 'ATR') + ' (put wall OOR)'; }
    } else if (oi && c.direction === 'long' && oi.maxPain > c.price) {
      const mpDist = oi.maxPain - c.price;
      if (mpDist <= tpCap) { tp = oi.maxPain; tpNote = 'Max pain'; }
    } else if (oi && c.direction === 'short' && oi.maxPain < c.price) {
      const mpDist = c.price - oi.maxPain;
      if (mpDist <= tpCap) { tp = oi.maxPain; tpNote = 'Max pain'; }
    }

    // PIN regime: cap TP at nearest OI gravity wall if not already capped by OI walls above.
    // BREAKOUT regime: allow TP to extend to next OI wall beyond the current target.
    if (gravityRegime && c.direction != null) {
      if (gravityRegime.regime === 'PIN' && tpNote === 'ATR' && oi) {
        // In pin regime, clamp TP to maxPain as the gravitational attractor if closer
        if (c.direction === 'long' && oi.maxPain > c.price && oi.maxPain < (tp ?? Infinity)) {
          const mpd = oi.maxPain - c.price;
          if (mpd <= tpCap) { tp = oi.maxPain; tpNote = 'Max pain (PIN)'; }
        } else if (c.direction === 'short' && oi.maxPain < c.price && oi.maxPain > (tp ?? -Infinity)) {
          const mpd = c.price - oi.maxPain;
          if (mpd <= tpCap) { tp = oi.maxPain; tpNote = 'Max pain (PIN)'; }
        }
      } else if (gravityRegime.regime === 'BREAKOUT' && oi && tpNote !== 'Call wall' && tpNote !== 'Put wall') {
        // In breakout regime, extend TP toward next OI wall beyond current TP
        if (c.direction === 'long' && oi.callWall > (tp ?? c.price)) {
          const wallDist = oi.callWall - c.price;
          if (wallDist <= tpCap * 1.25) { tp = oi.callWall; tpNote = 'Call wall (BREAK)'; }
        } else if (c.direction === 'short' && oi.putWall < (tp ?? c.price)) {
          const wallDist = c.price - oi.putWall;
          if (wallDist <= tpCap * 1.25) { tp = oi.putWall; tpNote = 'Put wall (BREAK)'; }
        }
      }
    }

    const tpPips  = tp != null ? Math.abs(tp - c.price) / pipSz : null;
    const slPips  = c.sl != null ? Math.abs(c.sl - c.price) / pipSz : null;
    const rrRatio = (tpPips && slPips && slPips > 0) ? (tpPips / slPips).toFixed(1) : null;

    // Apply session confidence + event risk to recommended size
    const adjSize = Math.max(10, Math.round((c.size || 50) * sizeMult));

    // Add session tag if confidence is meaningfully reduced
    if (sessionConf < 0.85 && S.sessionData) {
      tags.push({ cls: 'range', label: `${S.sessionData.name} (${Math.round(sessionConf*100)}%)`, key: 'session' });
    }
    // Add event risk warning tag
    if (S.eventRisk?.level === 'high') {
      tags.push({ cls: 'warn', label: 'Event ⚠ -50%', key: 'event' });
    } else if (S.eventRisk?.level === 'medium') {
      tags.push({ cls: 'warn', label: 'Event ⚡ -25%', key: 'event' });
    }
    // Cross-pair USD conflict / confirmation tag
    if (signal.crossConflict?.type === 'conflict' && signal.crossConflict.severity === 'strong') {
      tags.push({ cls: 'warn', label: 'USD conflict ⚠', key: 'cross' });
    } else if (signal.crossConflict?.type === 'confirmed' && signal.crossConflict.severity === 'strong') {
      tags.push({ cls: 'gex', label: 'USD confirmed ✓', key: 'cross' });
    }

    // Fix 3: EMA21 alignment on 5m bars
    const _bars5m  = S.ohlc5m?.[sym]?.values || null;
    const _emaRes  = get5mEMAAlignment(_bars5m, c.direction);
    let emaAligned = null, emaValue = null;
    if (_emaRes) {
      emaAligned = _emaRes.aligned;
      emaValue   = _emaRes.ema;
      if (emaAligned) {
        layerScore += 0.5;
        tags.push({ cls: 'signal', label: 'EMA21 ✓', key: 'ema' });
      } else {
        layerScore -= 0.5;
        tags.push({ cls: 'warn', label: 'EMA21 ✗', key: 'ema' });
      }
    }

    // Fix 4: 5m candle directional confirmation
    const _candleRes = get5mCandleConfirmation(_bars5m, c.direction);
    const candleConfirmed = _candleRes?.confirmed ?? null;
    const candleReason    = _candleRes?.reason    ?? null;

    // Fix 20: Regime shock risk tag
    let regimeShockRisk = null;
    try {
      const _trs = (S.ohlc5m?.[sym]?.values || []).map(b => {
        const h = b.high ?? b.mid?.h ?? b.h ?? 0;
        const l = b.low  ?? b.mid?.l ?? b.l ?? 0;
        return h - l;
      }).filter(v => v > 0);
      if (_trs.length >= 30) {
        const rt = computeRegimeTransition(_trs.slice().reverse());
        if (rt && rt.riskScore > 70) {
          regimeShockRisk = rt;
          tags.push({ cls: 'warn', label: `Vol shock ⚡ ${rt.riskScore}`, key: 'regshock' });
        }
      }
    } catch(e) {}

    // Range bias composite — 7 configurable features
    let rangeBias = null;
    if (c.direction != null) {
      try {
        rangeBias = computeRangeBias(sym, c.direction, c.price, asia, monday, volRegime);
        // Boost entry star score: +0.5 if ≥3 features confirm, +1 if ≥5 confirm
        if (rangeBias.confirmCount >= 5) layerScore += 1;
        else if (rangeBias.confirmCount >= 3) layerScore += 0.5;
        // Penalty: -0.5 if more features conflict than confirm
        if (rangeBias.conflictCount > rangeBias.confirmCount) layerScore -= 0.5;
      } catch(e) {}
    }

    return {
      ...c,
      size: adjSize,
      totalStars: Math.min(9, Math.round(layerScore)),
      layers,
      tags,
      tp,
      tpNote,
      tpPips,
      slPips,
      rrRatio,
      signalAligned,
      emaAligned,
      emaValue,
      candleConfirmed,
      candleReason,
      regimeShockRisk,
      rangeBias,
      gravityRegime,
    };
  });

  return candidates
    .filter(c => c.totalStars >= 2 && c.direction != null)
    // Suppress entries with R:R below 0.8 — unless the TP was vol-capped (RR is artificially low in that case).
    .filter(c => c.tpCapped || !c.rrRatio || parseFloat(c.rrRatio) >= 0.8)
    .map(c => {
      // Hard-cap size to 25% for sub-1.0R trades even if they pass the 0.8 floor.
      if (c.rrRatio && parseFloat(c.rrRatio) < 1.0) {
        return { ...c, size: Math.min(c.size, 25), poorRR: true };
      }
      return c;
    })
    .sort((a, b) => {
      if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
      return a.distance - b.distance;
    });
}

// ── Render entry scanner ──────────────────────────────────────────────────────

// Fix 3: 21-period EMA on the last N 5m bars. Returns { ema, last, aligned } or null.
function get5mEMAAlignment(bars5m, direction) {
  if (!bars5m || bars5m.length < 22) return null;
  const closes = bars5m.map(b => b.close ?? b.mid?.c ?? b.c).filter(v => v != null);
  if (closes.length < 22) return null;
  const k = 2 / 22;
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  const last = closes[closes.length - 1];
  return { ema, last, aligned: direction === 'long' ? last > ema : last < ema };
}

// Fix 4: Check last 2 closed 5m candles — bullish/bearish body OR pin bar rejection.
// bars5m is newest-first: [0]=forming, [1]=last closed, [2]=second closed.
function get5mCandleConfirmation(bars5m, direction) {
  if (!bars5m || bars5m.length < 3) return null;
  const b1 = bars5m[1]; // most recent closed
  const b2 = bars5m[2]; // second most recent closed
  if (!b1 || !b2) return null;

  function score(bar, dir) {
    const o = parseFloat(bar.open  ?? bar.mid?.o ?? bar.o);
    const c = parseFloat(bar.close ?? bar.mid?.c ?? bar.c);
    const h = parseFloat(bar.high  ?? bar.mid?.h ?? bar.h);
    const l = parseFloat(bar.low   ?? bar.mid?.l ?? bar.l);
    if (isNaN(o) || isNaN(c) || isNaN(h) || isNaN(l)) return 0;
    const range = h - l;
    if (range === 0) return 0;
    if (dir === 'long') {
      const lowerWick = Math.min(o, c) - l;
      return (c > o || lowerWick / range >= 0.30) ? 1 : 0;
    } else {
      const upperWick = h - Math.max(o, c);
      return (c < o || upperWick / range >= 0.30) ? 1 : 0;
    }
  }

  const s1 = score(b1, direction);
  const s2 = score(b2, direction);
  const confirmed  = s1 === 1;
  const supporting = s2 === 1;
  const reason = confirmed
    ? (supporting ? 'Both recent 5m bars confirm' : 'Most recent 5m bar confirms')
    : (supporting ? '5m: prior bar confirms but latest does not — wait' : 'No 5m confirmation — wait for close');
  return { confirmed, supporting, reason };
}

// ── Fix 24: Candle pattern detection ─────────────────────────────────────────
// Reads last 5 closed 5m bars (bars5m newest-first: [0]=forming, [1..5]=closed).
// Returns { pattern, bias, bars } where bars[] are 0-based indices into the
// 5-closed slice (0 = most recent closed), or null if no pattern found.
export function detectCandlePatterns(symbol) {
  const raw5m = S.ohlc5m?.[symbol]?.values;
  if (!raw5m || raw5m.length < 6) return null;

  const candles = raw5m.slice(1, 6).map(b => ({
    o: parseFloat(b.open  ?? b.mid?.o ?? b.o),
    c: parseFloat(b.close ?? b.mid?.c ?? b.c),
    h: parseFloat(b.high  ?? b.mid?.h ?? b.h),
    l: parseFloat(b.low   ?? b.mid?.l ?? b.l),
  })).filter(b => !isNaN(b.o) && !isNaN(b.c) && !isNaN(b.h) && !isNaN(b.l));

  if (candles.length < 2) return null;
  const b0 = candles[0], b1 = candles[1], b2 = candles[2];

  const range0 = b0.h - b0.l; const body0 = Math.abs(b0.c - b0.o);
  const bull0 = b0.c > b0.o;  const bear0 = b0.c < b0.o;
  const range1 = b1 ? b1.h - b1.l : 0;
  const bull1  = b1 && b1.c > b1.o; const bear1 = b1 && b1.c < b1.o;

  // Doji — body < 10% of range
  if (range0 > 0 && body0 / range0 < 0.10)
    return { pattern: 'Doji', bias: 'neutral', bars: [0] };

  // Hammer / Shooting Star
  if (range0 > 0) {
    const lw = Math.min(b0.o, b0.c) - b0.l;
    const uw = b0.h - Math.max(b0.o, b0.c);
    if (lw >= 0.6 * range0 && body0 <= 0.3 * range0 && uw <= 0.1 * range0)
      return { pattern: 'Hammer', bias: 'long', bars: [0] };
    if (uw >= 0.6 * range0 && body0 <= 0.3 * range0 && lw <= 0.1 * range0)
      return { pattern: 'Shooting Star', bias: 'short', bars: [0] };
  }

  if (!b1) return null;

  // Engulfing
  if (bear1 && bull0 && b0.o <= b1.c && b0.c >= b1.o)
    return { pattern: 'Bullish Engulfing', bias: 'long', bars: [1, 0] };
  if (bull1 && bear0 && b0.o >= b1.c && b0.c <= b1.o)
    return { pattern: 'Bearish Engulfing', bias: 'short', bars: [1, 0] };

  // Inside Bar
  if (b0.h <= b1.h && b0.l >= b1.l)
    return { pattern: 'Inside Bar', bias: 'neutral', bars: [1, 0] };

  // Tweezer
  const denom = Math.max(range0, range1, 0.0001);
  if (Math.abs(b0.h - b1.h) / denom < 0.05 && bear0)
    return { pattern: 'Tweezer Top', bias: 'short', bars: [1, 0] };
  if (Math.abs(b0.l - b1.l) / denom < 0.05 && bull0)
    return { pattern: 'Tweezer Bottom', bias: 'long', bars: [1, 0] };

  if (!b2) return null;
  const bull2 = b2.c > b2.o; const bear2 = b2.c < b2.o;
  const body2 = Math.abs(b2.c - b2.o);

  // Morning / Evening Star
  if (bear2 && Math.abs(b1.c - b1.o) < 0.3 * (b2.h - b2.l) && bull0 && b0.c > (b2.o + b2.c) / 2)
    return { pattern: 'Morning Star', bias: 'long', bars: [2, 1, 0] };
  if (bull2 && Math.abs(b1.c - b1.o) < 0.3 * (b2.h - b2.l) && bear0 && b0.c < (b2.o + b2.c) / 2)
    return { pattern: 'Evening Star', bias: 'short', bars: [2, 1, 0] };

  // Three White Soldiers / Three Black Crows
  const [c0, c1, c2] = candles;
  if ([c0, c1, c2].every(c => c.c > c.o && (c.h - c.c) < 0.2 * (c.h - c.l)) && c0.c > c1.c && c1.c > c2.c)
    return { pattern: 'Three White Soldiers', bias: 'long', bars: [2, 1, 0] };
  if ([c0, c1, c2].every(c => c.c < c.o && (c.c - c.l) < 0.2 * (c.h - c.l)) && c0.c < c1.c && c1.c < c2.c)
    return { pattern: 'Three Black Crows', bias: 'short', bars: [2, 1, 0] };

  return null;
}

// 80×40 inline SVG of the last 5 closed bars. highlightBars = indices into the
// 5-closed slice (0=most recent), matching detectCandlePatterns output.
function renderCandleSVG(symbol, highlightBars) {
  const raw5m = S.ohlc5m?.[symbol]?.values;
  if (!raw5m || raw5m.length < 6) return '';
  const candles = raw5m.slice(1, 6).map(b => ({
    o: parseFloat(b.open  ?? b.mid?.o ?? b.o),
    c: parseFloat(b.close ?? b.mid?.c ?? b.c),
    h: parseFloat(b.high  ?? b.mid?.h ?? b.h),
    l: parseFloat(b.low   ?? b.mid?.l ?? b.l),
  })).filter(b => !isNaN(b.o));
  if (candles.length < 2) return '';

  // Render oldest→newest (left→right); candles[0] is most recent, so reverse
  const ordered = [...candles].reverse();
  const n = ordered.length;
  const W = 80, H = 40, pad = 3;
  const allH = Math.max(...ordered.map(c => c.h));
  const allL = Math.min(...ordered.map(c => c.l));
  const span = allH - allL || 0.0001;
  const cw = (W - 2 * pad) / n;
  const toY = p => pad + (1 - (p - allL) / span) * (H - 2 * pad);
  // Map highlight indices (0=most recent) to ordered array positions
  const hlSet = new Set((highlightBars || []).map(i => n - 1 - i));

  const els = ordered.map((c, i) => {
    const bull = c.c >= c.o;
    const mx   = pad + i * cw + cw / 2;
    const bTop = toY(Math.max(c.o, c.c));
    const bBot = toY(Math.min(c.o, c.c));
    const bH   = Math.max(1, bBot - bTop);
    const col  = bull ? 'var(--green)' : 'var(--red)';
    const op   = hlSet.has(i) ? '1' : '0.35';
    return `<line x1="${mx.toFixed(1)}" y1="${toY(c.h).toFixed(1)}" x2="${mx.toFixed(1)}" y2="${toY(c.l).toFixed(1)}" stroke="${col}" stroke-width="1" opacity="${op}"/><rect x="${(pad + i * cw + 1).toFixed(1)}" y="${bTop.toFixed(1)}" width="${Math.max(1, cw - 2).toFixed(1)}" height="${bH.toFixed(1)}" fill="${col}" opacity="${op}" rx="0.5"/>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="vertical-align:middle;flex-shrink:0" xmlns="http://www.w3.org/2000/svg">${els}</svg>`;
}

// Returns { sd, nearest, close } where sd is raw fib position and nearest is
// the nearest FIB_LEVEL. close = within 8% of range from that level.
function rangeSDLevel(price, rangeLow, rangeSize) {
  if (!rangeSize || rangeSize === 0) return null;
  const sd      = (price - rangeLow) / rangeSize;
  const nearest = FIB_LEVELS.reduce((a, b) => Math.abs(b - sd) < Math.abs(a - sd) ? b : a);
  const close   = Math.abs(sd - nearest) < 0.08;
  return { sd, nearest, close };
}

function fmtSD(sd) {
  if (sd == null) return null;
  const n     = sd.close ? sd.nearest : sd.sd;
  const label = Number.isInteger(n) ? n.toFixed(0) : parseFloat(n.toFixed(2)).toString();
  return label;
}

export function renderEntryScanner(entries, quote, signal, volRegime, asia, monday, otcForecast, tierData, approachArrow, hmmData = null) {
  const sym    = S.currentPair.symbol;
  const digits = getDigits(sym);
  const pipSz  = getPipSize(sym);
  const unit   = sym === 'NAS100_USD' ? 'pts' : 'p';

  // Compute gravity regime for the badge (independent of per-entry computation in runEntryScanner)
  const _oiStoreRender = (() => { try { return JSON.parse(localStorage.getItem('oi_store') || '{}'); } catch(e) { return {}; } })();
  const _oiRender      = _oiStoreRender[sym] || null;
  const _atrRender     = volRegime?.atr || 0;
  const _gravityBadge  = (_oiRender && _atrRender > 0) ? computeGravityRegime(_oiRender, _atrRender, pipSz) : null;

  // Regime Confidence — computed once per render for the current pair
  let _rcResult = null;
  try {
    const _rc5mBars = S.ohlc5m?.[sym]?.values || [];
    const _rcTrs = _rc5mBars.map(b => {
      const h = b.high ?? b.mid?.h ?? b.h ?? 0;
      const l = b.low  ?? b.mid?.l ?? b.l ?? 0;
      return h - l;
    }).filter(v => v > 0);
    const _rcArma  = _rcTrs.length >= 30 ? computeRegimeTransition(_rcTrs.slice().reverse()) : null;
    const _rcArima = computeArimaContext(S.ohlcData?.[sym]?.values, sym);
    _rcResult = computeRegimeConfidence(hmmData, volRegime?.garch ?? null, _rcArma, null, _rcArima?.residualStability ?? null);
  } catch(_e) {}

  function gravityBadgeHtml(gr) {
    if (!gr) return '';
    const col = gr.regime === 'PIN' ? 'var(--blue)' : gr.regime === 'BREAKOUT' ? 'var(--amber)' : 'var(--text3)';
    const bg  = gr.regime === 'PIN' ? 'var(--blue-bg)' : gr.regime === 'BREAKOUT' ? 'rgba(245,158,11,0.1)' : 'var(--s2)';
    const bd  = gr.regime === 'PIN' ? 'var(--blue-bd)' : gr.regime === 'BREAKOUT' ? 'rgba(245,158,11,0.3)' : 'var(--border)';
    const icon = gr.regime === 'PIN' ? '⚓' : gr.regime === 'BREAKOUT' ? '⚡' : '〰';
    return `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:${bg};color:${col};border:1px solid ${bd}" title="GEX: ${gr.gexSign} · gravity ${gr.gravityScore} · flip at ${gr.flipStrike ?? '—'} · ${gr.confidence} confidence">${icon} ${gr.regime} · g=${gr.gravityScore}</span>`;
  }

  const volCtx = volRegime && volRegime.dailyCapPips > 0 ? (() => {
    const usedPct  = Math.min(100, volRegime.usedPct);
    const remPips  = volRegime.remainingPips?.toFixed(0) ?? '—';
    const usedPips = volRegime.usedRangePips?.toFixed(0) ?? '—';
    const atrPips  = volRegime.atrPips?.toFixed(0) ?? '—';
    const capPips  = volRegime.dailyCapPips?.toFixed(0) ?? atrPips;
    const g        = volRegime.garch;
    const barCol   = usedPct > 80 ? 'var(--red)' : usedPct > 55 ? 'var(--amber)' : 'var(--green)';
    const regCol   = volRegime.regime === 'HIGH' ? 'var(--red)' : volRegime.regime === 'LOW' ? 'var(--blue)' : 'var(--green)';
    return `
    <div style="background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:10px 12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;flex-wrap:wrap">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text3)">Daily Vol Budget</span>
        <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${regCol}22;color:${regCol};border:1px solid ${regCol}44">${volRegime.regime} · ${volRegime.percentile}th pct</span>
        ${g ? `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple-bd);font-weight:600">GARCH ${g.cluster}</span>` : ''}
        ${gravityBadgeHtml(_gravityBadge)}
        <span style="margin-left:auto;font-size:10px;font-family:'DM Mono',monospace;color:var(--text2)">${usedPips}${unit} / <strong>${capPips}${unit}</strong> cap</span>
      </div>
      ${g ? `
      <div style="position:relative;height:16px;border-radius:4px;overflow:hidden;margin-bottom:4px;background:rgba(139,92,246,0.1);border:1px solid var(--purple-bd)">
        <div style="position:absolute;top:0;bottom:0;left:${Math.max(0,(1-(g.ci68Pips/g.ci95Pips))*50).toFixed(1)}%;right:${Math.max(0,(1-(g.ci68Pips/g.ci95Pips))*50).toFixed(1)}%;background:rgba(139,92,246,0.25)"></div>
        <div style="position:absolute;top:0;bottom:0;left:0;width:${Math.min(100,(usedPct*(g.ci68Pips/(g.ci95Pips||1)))).toFixed(1)}%;background:${barCol};opacity:0.75;border-radius:4px"></div>
        <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--purple);opacity:0.5"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-family:'DM Mono',monospace;margin-bottom:5px">
        <span style="color:var(--purple)">95%: ${g.ci95Pips.toFixed(0)}${unit}</span>
        <span style="color:var(--purple);font-weight:600">GARCH ${g.pips.toFixed(0)}${unit} · 68%CI ${g.ci68Pips.toFixed(0)}${unit}</span>
        <span style="color:var(--text3)">EMA ${atrPips}${unit}</span>
      </div>` : `
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${usedPct}%;background:${barCol};border-radius:3px"></div>
      </div>`}
      <div style="display:flex;justify-content:space-between;font-size:10px;font-family:'DM Mono',monospace">
        <span style="color:var(--text3)">${usedPct}% of 68% CI used</span>
        <span style="color:${usedPct > 80 ? 'var(--red)' : 'var(--text2)'}">~<strong>${remPips}${unit}</strong> remaining</span>
      </div>
      ${usedPct > 80 ? `<div style="font-size:10px;color:var(--red);margin-top:5px">⚠ 68% CI consumed — fade only, GARCH says breakout unlikely today</div>` :
        usedPct > 55 ? `<div style="font-size:10px;color:var(--amber);margin-top:5px">⚡ Past halfway through expected range — size down, favour mean-reversion</div>` : ''}
      ${_gravityBadge ? (() => {
        const gr = _gravityBadge;
        if (gr.regime === 'PIN' && gr.confidence !== 'LOW')
          return `<div style="font-size:10px;color:var(--blue);margin-top:5px">⚓ <strong>PIN regime</strong> — positive GEX dampens moves; price likely attracted to ${gr.nearestStrike != null ? gr.nearestStrike.toFixed(pipSz < 0.01 ? 5 : 2) : '—'}. TP at OI walls; fade extremes.</div>`;
        if (gr.regime === 'BREAKOUT' && gr.confidence !== 'LOW')
          return `<div style="font-size:10px;color:var(--amber);margin-top:5px">⚡ <strong>BREAKOUT regime</strong> — negative GEX amplifies moves; dealers chase price. Extend TP to OI walls; avoid tight fades.</div>`;
        return '';
      })() : ''}
    </div>`;
  })() : '';

  // Range bias settings button
  const rbSettingsBtn = `<div style="display:flex;justify-content:flex-end;margin-bottom:6px">
    <button onclick="openRangeBiasModal()" style="font-size:10px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:var(--s2);color:var(--text3);cursor:pointer;display:flex;align-items:center;gap:4px">
      ⚙ Range Bias Settings
    </button>
  </div>`;

  if (!entries || entries.length === 0) {
    return rbSettingsBtn + `<div class="ec-no-entries">
      🎯 No high-confluence entries found<br>
      <span style="font-size:10px">Requires Fib confluence + at least one of: OI wall, pivot, range boundary, signal alignment</span>
    </div>`;
  }

  // Fix 24: 5m candle pattern block above entry cards
  const _cp = detectCandlePatterns(sym);
  const candleBlock = _cp ? (() => {
    const biasCol = _cp.bias === 'long' ? 'var(--green)' : _cp.bias === 'short' ? 'var(--red)' : 'var(--text2)';
    return `<div style="display:flex;align-items:center;gap:10px;background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;margin-bottom:8px">
      ${renderCandleSVG(sym, _cp.bars)}
      <div>
        <div style="font-size:10.5px;font-weight:700;color:${biasCol}">${_cp.pattern}</div>
        <div style="font-size:9px;color:var(--text3)">5m pattern · last 5 closed bars · bias: ${_cp.bias}</div>
      </div>
    </div>`;
  })() : '';

  // O-to-C Forecast card — rendered below GARCH CI section
  const otcCard = (() => {
    if (!otcForecast) return '';
    const f = otcForecast;
    const charCol  = f.sessionChar === 'TRENDING' ? 'var(--green)'  : f.sessionChar === 'CHOPPY' ? 'var(--red)'  : 'var(--blue)';
    const charBg   = f.sessionChar === 'TRENDING' ? 'var(--green-bg)' : f.sessionChar === 'CHOPPY' ? 'var(--red-bg)' : 'var(--blue-bg)';
    const charBd   = f.sessionChar === 'TRENDING' ? 'var(--green-bd)' : f.sessionChar === 'CHOPPY' ? 'var(--red-bd)' : 'var(--blue-bd)';
    const cohCol   = f.coherence === 'CONFIRMING' ? 'var(--green)'  : f.coherence === 'DIVERGING' ? 'var(--red)' : 'var(--text3)';
    const cohBg    = f.coherence === 'CONFIRMING' ? 'var(--green-bg)' : f.coherence === 'DIVERGING' ? 'var(--red-bg)' : 'var(--s2)';
    const cohBd    = f.coherence === 'CONFIRMING' ? 'var(--green-bd)' : f.coherence === 'DIVERGING' ? 'var(--red-bd)' : 'var(--border)';

    const sign = v => v >= 0 ? `+${v.toFixed(0)}` : `${v.toFixed(0)}`;
    // Bar: p10→p90 is full width; p25→p75 is the IQR band; median is centre tick
    const p10v = f.p10, p90v = f.p90, span = Math.max(0.0001, p90v - p10v);
    const iqrLeft  = ((f.p25 - p10v) / span * 100).toFixed(1);
    const iqrRight = ((p90v - f.p75) / span * 100).toFixed(1);
    const medPct   = ((f.median - p10v) / span * 100).toFixed(1);

    const cohText = f.coherence === 'CONFIRMING'
      ? 'Historical session distribution aligns with macro bias — signal coherent'
      : f.coherence === 'DIVERGING'
      ? 'Session history diverges from macro bias — treat direction signal with caution'
      : 'Macro bias neutral — session direction distribution guides';

    return `
    <div style="background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:10px 12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text3)">O-to-C Forecast</span>
        <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:var(--purple-bg);color:var(--purple);border:1px solid var(--purple-bd)">REGIME-CONDITIONAL</span>
        <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${charBg};color:${charCol};border:1px solid ${charBd}">${f.sessionChar}</span>
        <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${cohBg};color:${cohCol};border:1px solid ${cohBd}">${f.coherence}</span>
      </div>

      <!-- Distribution bar -->
      <div style="position:relative;height:18px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:4px">
        <div style="position:absolute;top:0;bottom:0;left:${iqrLeft}%;right:${iqrRight}%;background:var(--amber);opacity:0.35"></div>
        <div style="position:absolute;top:0;bottom:0;left:${medPct}%;width:2px;background:var(--amber);opacity:0.9"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-family:'DM Mono',monospace;color:var(--text3);margin-bottom:8px">
        <span>${sign(f.p10)}${unit}</span>
        <span style="color:var(--amber);font-weight:600">median ${f.median >= 0 ? '+' : ''}${f.medianPips.toFixed(0)}${unit}</span>
        <span>${sign(f.p90)}${unit}</span>
      </div>

      <!-- Stat tiles -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
        <div style="background:var(--s1);border:1px solid var(--border);border-radius:5px;padding:5px 8px;text-align:center">
          <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;color:var(--amber)">${f.median >= 0 ? '+' : ''}${f.medianPips.toFixed(0)}${unit}</div>
          <div style="font-size:8.5px;color:var(--text3)">Median O→C</div>
          <div style="font-size:8px;color:var(--text3)">directional</div>
        </div>
        <div style="background:var(--s1);border:1px solid var(--border);border-radius:5px;padding:5px 8px;text-align:center">
          <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;color:var(--text2)">${f.meanAbsPips.toFixed(0)}${unit}</div>
          <div style="font-size:8.5px;color:var(--text3)">Mean Abs</div>
          <div style="font-size:8px;color:var(--text3)">magnitude</div>
        </div>
        <div style="background:var(--s1);border:1px solid var(--border);border-radius:5px;padding:5px 8px;text-align:center">
          <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;color:${f.bullFrac > 0.55 ? 'var(--green)' : f.bullFrac < 0.45 ? 'var(--red)' : 'var(--text2)'}">${Math.round(f.bullFrac * 100)}%</div>
          <div style="font-size:8.5px;color:var(--text3)">Bull sessions</div>
          <div style="font-size:8px;color:var(--text3)">of matched days</div>
        </div>
      </div>

      <!-- Coherence line -->
      <div style="font-size:10px;color:${cohCol};font-style:italic;margin-bottom:4px">${cohText}</div>
      <div style="font-size:9px;color:var(--text3)">${f.regimeMatched ? `Based on ${f.sampleSize} regime-matched sessions` : `${f.sampleSize} sessions (full history — regime sample too small)`}</div>
    </div>`;
  })();

  // Fix 5: Session confidence warning banner
  const sessionConf2 = S.sessionData?.confidence ?? 1.0;
  const sessionWarn  = sessionConf2 < 0.80
    ? `<div style="font-size:11px;color:var(--amber);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:7px 10px;margin-bottom:8px;line-height:1.5">
        ⚡ <strong>Session confidence ${Math.round(sessionConf2 * 100)}%</strong> — ${S.sessionData?.name ?? 'Current session'} overlap reduced. Position sizing already reduced proportionally.
       </div>`
    : '';

  // Day-of-week seasonality context (London session day)
  const _dow = new Date(londonSessionDay() + 'T12:00:00Z').getUTCDay();
  const dowCtx = _dow === 1
    ? `<div style="font-size:10px;color:var(--amber);background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:5px;padding:5px 10px;margin-bottom:6px">📅 Monday — Asia continuation likely; thin NY open; range setups improve mid-session</div>`
    : _dow === 5
    ? `<div style="font-size:10px;color:var(--blue);background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:5px;padding:5px 10px;margin-bottom:6px">📅 Friday — position-squaring session; fade extremes historically reliable; avoid holding into NY close</div>`
    : (_dow === 2 || _dow === 3)
    ? `<div style="font-size:10px;color:var(--green);background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:5px;padding:5px 10px;margin-bottom:6px">📅 ${_dow === 2 ? 'Tuesday' : 'Wednesday'} — highest-vol day of week; full ATR participation likely; optimal for range fades</div>`
    : '';

  // Gravity regime banner when no volCtx but OI data exists
  const gravityBanner = (!volCtx && _gravityBadge && _gravityBadge.regime !== 'NEUTRAL' && _gravityBadge.confidence !== 'LOW')
    ? (() => {
        const gr = _gravityBadge;
        const col = gr.regime === 'PIN' ? 'var(--blue)' : 'var(--amber)';
        const bg  = gr.regime === 'PIN' ? 'rgba(59,130,246,0.06)' : 'rgba(245,158,11,0.06)';
        const bd  = gr.regime === 'PIN' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)';
        const msg = gr.regime === 'PIN'
          ? `⚓ <strong>PIN regime</strong> (GEX ${gr.gexSign}, g=${gr.gravityScore}) — dampened vol; TP to OI walls; fade range extremes`
          : `⚡ <strong>BREAKOUT regime</strong> (GEX ${gr.gexSign}, g=${gr.gravityScore}) — amplified moves; extend TP; avoid tight fades`;
        return `<div style="font-size:10px;color:${col};background:${bg};border:1px solid ${bd};border-radius:6px;padding:6px 10px;margin-bottom:6px">${msg}</div>`;
      })()
    : '';

  // Option B: Pair-level HMM regime banner
  const hmmBanner = (() => {
    if (!hmmData) return '';
    const r = hmmData;
    if (r.regime === 'RANGE') {
      const pct = Math.round(r.rangeProb * 100);
      const sep = r.sigmaRatio != null ? ` · σ ratio ${r.sigmaRatio.toFixed(2)}` : '';
      return `<div style="font-size:10px;color:var(--blue);background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.22);border-radius:6px;padding:5px 10px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
        <span>🔄</span>
        <span style="font-weight:700">${sym} · RANGE regime</span>
        <span style="color:var(--border2)">·</span>
        <span>${pct}% prob${sep}</span>
        <span style="color:var(--border2)">·</span>
        <span style="color:rgba(59,130,246,0.6)">supports fades</span>
      </div>`;
    }
    const icon   = r.trendDir === 'BULL' ? '📈' : '📉';
    const col    = r.trendDir === 'BULL' ? 'var(--green)' : 'var(--red)';
    const bg     = r.trendDir === 'BULL' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
    const bd     = r.trendDir === 'BULL' ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)';
    const tPct   = Math.round(r.trendProb * 100);
    return `<div style="font-size:10px;color:${col};background:${bg};border:1px solid ${bd};border-radius:6px;padding:5px 10px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <span>${icon}</span>
      <span style="font-weight:700">${sym} · TREND ${r.trendDir}</span>
      <span style="color:var(--border2)">·</span>
      <span>${tPct}% prob</span>
      <span style="color:var(--border2)">·</span>
      <span style="color:${col};opacity:.7">fade trades carry higher risk</span>
    </div>`;
  })();

  // Per-pair average signal quality banner
  const pairScoreBanner = (() => {
    const scored = entries.filter(e => e.signalScore != null);
    if (!scored.length) return '';
    const avg  = Math.round(scored.reduce((s, e) => s + e.signalScore, 0) / scored.length);
    const tier = signalScoreTier(avg);
    const col  = tier === 'strong' ? 'var(--green)' : tier === 'moderate' ? 'var(--amber)' : 'var(--text3)';
    const bg   = tier === 'strong' ? 'rgba(34,197,94,0.06)' : tier === 'moderate' ? 'rgba(245,158,11,0.06)' : 'var(--s2)';
    const bd   = tier === 'strong' ? 'rgba(34,197,94,0.20)' : tier === 'moderate' ? 'rgba(245,158,11,0.20)' : 'var(--border)';
    const best = scored.reduce((a, e) => e.signalScore > a.signalScore ? e : a, scored[0]);
    return `<div style="font-size:10px;color:${col};background:${bg};border:1px solid ${bd};border-radius:6px;padding:5px 10px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <span style="font-weight:700">${avg}% avg</span>
      <span style="color:var(--border2)">·</span>
      <span>${scored.length} level${scored.length !== 1 ? 's' : ''} · ${tier}</span>
      <span style="color:var(--border2)">·</span>
      <span>best ${best.price.toFixed(getDigits(sym))} ${best.direction === 'long' ? '↑' : '↓'} @ ${best.signalScore}%</span>
    </div>`;
  })();

  // Regime Confidence panel — ARIMA stability + sizing multiplier
  const regimeConfPanel = (() => {
    if (!_rcResult) return '';
    const rc  = _rcResult;
    const col = rc.label === 'HIGH_CONFIDENCE' ? 'var(--green)'
              : rc.label === 'DEFENSIVE'       ? 'var(--red)'
              : rc.label === 'MODERATE'        ? 'var(--amber)'
              : 'var(--text3)';
    const bg  = rc.label === 'HIGH_CONFIDENCE' ? 'rgba(34,197,94,0.05)'
              : rc.label === 'DEFENSIVE'       ? 'rgba(239,68,68,0.05)'
              : rc.label === 'MODERATE'        ? 'rgba(245,158,11,0.05)'
              : 'var(--s2)';
    const bd  = rc.label === 'HIGH_CONFIDENCE' ? 'rgba(34,197,94,0.18)'
              : rc.label === 'DEFENSIVE'       ? 'rgba(239,68,68,0.18)'
              : rc.label === 'MODERATE'        ? 'rgba(245,158,11,0.18)'
              : 'var(--border)';
    const arimaVal = rc.components.arimaFactor;
    const arimaCol = arimaVal >= 0.80 ? 'var(--green)' : arimaVal >= 0.65 ? 'var(--amber)' : 'var(--red)';
    const arimaLbl = arimaVal >= 0.80 ? 'stable' : arimaVal >= 0.65 ? 'elevated' : 'erratic';
    const multTxt  = `×${rc.sizingMult.toFixed(2)}`;
    const defWarn  = rc.defensiveMode ? `<span style="font-size:9px;font-weight:700;color:var(--red)"> ⚠ DEFENSIVE</span>` : '';
    const narr     = rc.narrative && rc.narrative !== 'Regime stable — full confidence'
      ? `<div style="font-size:9px;color:var(--text3);margin-top:4px;line-height:1.4">${rc.narrative}</div>`
      : '';
    return `<div style="background:${bg};border:1px solid ${bd};border-radius:7px;padding:8px 10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text3)">Regime Confidence</span>
        <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${col}22;color:${col};border:1px solid ${col}44">${rc.label.replace(/_/g, ' ')}</span>
        <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${col}22;color:${col};border:1px solid ${col}44">Size ${multTxt}</span>
        ${defWarn}
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:9.5px;font-family:'DM Mono',monospace">
        <span title="ARIMA price residual stability — erratic residuals signal regime breakdown">ARIMA <strong style="color:${arimaCol}">${(arimaVal * 100).toFixed(0)}%</strong> <span style="color:var(--text3)">(${arimaLbl})</span></span>
        <span style="color:var(--text3)">HMM <strong>${Math.round(rc.components.hmmCertainty * 100)}%</strong></span>
        <span style="color:var(--text3)">Conf <strong>${(rc.regimeConfidence * 100).toFixed(0)}%</strong></span>
        <span style="color:${rc.transitionRisk > 0.55 ? 'var(--red)' : rc.transitionRisk > 0.30 ? 'var(--amber)' : 'var(--text3)'}">Risk <strong>${(rc.transitionRisk * 100).toFixed(0)}%</strong></span>
      </div>
      ${narr}
    </div>`;
  })();

  return volCtx + gravityBanner + candleBlock + otcCard + sessionWarn + dowCtx + rbSettingsBtn + regimeConfPanel + hmmBanner + pairScoreBanner + `<div class="entry-scanner">${entries.slice(0, 6).map(e => {
    const above   = quote.price < e.price;
    const starStr = '⭐'.repeat(e.totalStars) + '☆'.repeat(Math.max(0, 9 - e.totalStars));
    const cls     = e.totalStars >= 5 ? 'ec-5plus' : e.totalStars >= 4 ? 'ec-4' : e.totalStars >= 3 ? 'ec-3' : 'ec-low';

    const tagsHtml = e.tags.map(t => `<span class="ec-tag ${t.cls}">${t.label}</span>`).join('');

    const rrCol = e.rrRatio && parseFloat(e.rrRatio) >= 1.5 ? 'var(--green)' :
                  e.rrRatio && parseFloat(e.rrRatio) >= 1.0 ? 'var(--amber)' : 'var(--red)';
    const tpCapNote = e.tpCapped ? `<span style="color:var(--amber);font-size:9px" title="TP capped to today's remaining daily range (${volRegime.remainingPips?.toFixed(0)}${unit} remaining)">⚡ vol-capped</span>` : '';

    const asiaSD   = asia?.today    ? rangeSDLevel(e.price, asia.today.low,    asia.today.range)    : null;
    const mondaySD = monday?.current ? rangeSDLevel(e.price, monday.current.low, monday.current.range) : null;

    const sdLines = (() => {
      const parts = [];
      if (asiaSD)   parts.push(`Asia SD <strong>${fmtSD(asiaSD)}</strong>${asiaSD.close   ? '' : ' <em style="font-weight:400">(~approx)</em>'}`);
      if (mondaySD) parts.push(`Mon SD <strong>${fmtSD(mondaySD)}</strong>${mondaySD.close ? '' : ' <em style="font-weight:400">(~approx)</em>'}`);
      if (!parts.length) return '';
      return `<div style="display:flex;gap:16px;margin-top:5px;padding-top:5px;border-top:1px dashed var(--border)">
        ${parts.map(p => `<span style="font-size:9.5px;color:var(--text3);font-family:'DM Mono',monospace">${p}</span>`).join('')}
      </div>`;
    })();

    const otcLine = (() => {
      if (!otcForecast) return '';
      const f = otcForecast;
      if (f.sessionChar === 'TRENDING' && f.coherence === 'CONFIRMING') {
        const side = e.direction === 'long' ? '+' : '−';
        return `<div style="font-size:9.5px;color:var(--green);margin-top:4px;font-family:'DM Mono',monospace">O-C forecast: median ${side}${f.medianPips.toFixed(0)}${unit} | IQR ${f.p25Pips.toFixed(0)}–${f.p75Pips.toFixed(0)}${unit} — supports TP reach</div>`;
      }
      if (f.sessionChar === 'CHOPPY') {
        return `<div style="font-size:9.5px;color:var(--amber);margin-top:4px;font-family:'DM Mono',monospace">O-C forecast: choppy session — TP beyond ${f.meanAbsPips.toFixed(0)}${unit} historically rarely filled</div>`;
      }
      return `<div style="font-size:9.5px;color:var(--text3);margin-top:4px;font-family:'DM Mono',monospace">O-C forecast: mixed session · median ${f.medianPips.toFixed(0)}${unit} directional</div>`;
    })();

    const slAtrLine = e.slAtr != null
      ? `<span style="color:var(--text3)"><strong style="color:var(--text2)">SL(ATR)</strong> ${e.slAtr.toFixed(digits)} <span style="font-size:10px">(${e.slAtrPips?.toFixed(0)}${unit})</span></span>`
      : '';

    // Size waterfall: show RC multiplier effect when it meaningfully reduces size
    const _sizeLine = (() => {
      if (!_rcResult || _rcResult.sizingMult >= 0.99) {
        return `<span><strong>Size</strong> ${e.size}%</span>`;
      }
      const finalSz = Math.max(10, Math.round(e.size * _rcResult.sizingMult));
      const szCol   = _rcResult.defensiveMode ? 'var(--red)' : 'var(--amber)';
      return `<span style="display:inline-flex;flex-direction:column;gap:0;line-height:1.3">
        <span style="font-size:8.5px;color:var(--text3)"><strong>Size</strong> <span style="text-decoration:line-through">${e.size}%</span></span>
        <span><strong style="color:${szCol}">${finalSz}%</strong> <span style="font-size:8.5px;color:${szCol}">RC ×${_rcResult.sizingMult.toFixed(2)}</span></span>
      </span>`;
    })();

    const tradeHtml = e.sl != null ? `
      <span><strong>Entry</strong> ${e.price.toFixed(digits)}</span>
      <span><strong>SL</strong> ${e.sl.toFixed(digits)} (${e.slPips?.toFixed(0)}${unit})</span>
      ${slAtrLine}
      <span><strong>TP</strong> ${e.tp != null ? e.tp.toFixed(digits) : '—'} (${e.tpNote}${e.tpPips ? ' · ' + e.tpPips.toFixed(0) + unit : ''}) ${tpCapNote}</span>
      ${e.rrRatio ? `<span><strong style="color:${rrCol}">R:R 1:${e.rrRatio}</strong></span>` : ''}
      ${_sizeLine}
      ${sdLines}
      ${otcLine}
    ` : `<span style="opacity:.6"><em>Price at level — wait for directional close</em></span>${sdLines}${otcLine}`;

    // Fix 8: structural vs confirmation star split
    // structuralStars = level quality from enhanceConfluences; delta = layers added by runEntryScanner
    const _structStars = e.structuralStars ?? Math.round(e.stars ?? 0);
    const _confStars   = Math.max(0, e.totalStars - _structStars);
    const starSplit    = (_structStars > 0 || _confStars > 0)
      ? `<span style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;margin-left:4px">${_structStars}S+${_confStars}C</span>`
      : '';

    // Fix 4: candle confirmation banner
    const confirmBanner = e.candleConfirmed != null
      ? `<div style="font-size:10px;padding:4px 8px;border-radius:5px;margin-bottom:4px;${
          e.candleConfirmed
            ? 'background:rgba(34,197,94,0.08);color:var(--green);border:1px solid rgba(34,197,94,0.25)'
            : 'background:rgba(245,158,11,0.07);color:var(--amber);border:1px solid rgba(245,158,11,0.25)'
        }">
          ${e.candleConfirmed ? '✔' : '⚡'} <strong>5m:</strong> ${e.candleReason}
        </div>`
      : '';

    // Range bias panel
    const rbHtml = (() => {
      const rb = e.rangeBias;
      if (!rb || rb.maxPts === 0) return '';
      const enabledRows = rb.results.filter(r => r.enabled);
      if (!enabledRows.length) return '';

      const pct    = Math.round(rb.conviction * 100);
      const barCol = rb.conviction > 0.4 ? 'var(--green)' : rb.conviction < -0.2 ? 'var(--red)' : 'var(--amber)';
      const label  = rb.confirmCount >= 5 ? 'Strong confirm' :
                     rb.confirmCount >= 3 ? 'Confirms'       :
                     rb.conflictCount > rb.confirmCount ? 'Conflicts' : 'Weak / neutral';
      const hdrCol = rb.confirmCount >= 3 ? 'var(--green)' :
                     rb.conflictCount > rb.confirmCount ? 'var(--red)' : 'var(--text3)';

      const rows = enabledRows.map(r => `
        <div style="display:flex;align-items:baseline;gap:6px;padding:2px 0">
          <span style="font-size:11px;flex-shrink:0">${r.icon}</span>
          <span style="font-size:10px;font-weight:600;color:var(--text2);min-width:110px;flex-shrink:0">${r.label}${r.type ? ` <em style="font-weight:400;font-size:9px">${r.type}</em>` : ''}</span>
          <span style="font-size:9.5px;color:var(--text3);line-height:1.3">${r.val}</span>
          <span style="margin-left:auto;font-size:9px;font-family:'DM Mono',monospace;font-weight:600;color:${r.pts > 0 ? 'var(--green)' : r.pts < 0 ? 'var(--red)' : 'var(--text3)'};flex-shrink:0">${r.pts > 0 ? '+' : ''}${r.pts}</span>
        </div>`).join('');

      return `
      <details class="rb-panel" ${rb.confirmCount >= 3 || rb.conflictCount > 2 ? 'open' : ''}>
        <summary style="display:flex;align-items:center;gap:6px;cursor:pointer;list-style:none;padding:5px 0;border-top:1px solid var(--border)">
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)">Range Bias</span>
          <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:0 4px">
            <div style="height:100%;width:${Math.abs(pct)}%;background:${barCol};border-radius:2px;${pct < 0 ? 'margin-left:auto' : ''}"></div>
          </div>
          <span style="font-size:10px;font-weight:600;color:${hdrCol}">${rb.confirmCount}✓ ${rb.conflictCount}✗ · ${label}</span>
          <span style="font-size:9px;color:var(--text3);margin-left:2px">▾</span>
        </summary>
        <div style="padding:4px 0 2px 0">${rows}</div>
      </details>`;
    })();

    // Tier regime agreement for this entry direction
    const ecRegimeRow = (() => {
      if (!tierData) return '';
      const isLong   = e.direction === 'long';
      const agree    = tierData.tiers.filter(t => !t.na && (isLong ? t.score > 0 : t.score < 0)).length;
      const disagree = tierData.tiers.filter(t => !t.na && (isLong ? t.score < 0 : t.score > 0)).length;
      const na       = tierData.tiers.filter(t =>  t.na || t.score === 0).length;

      // Option A: HMM regime chip inline with tier agreement row
      const hmmChip = (() => {
        if (!hmmData) return '';
        const r = hmmData;
        if (r.regime === 'RANGE') {
          const pct = Math.round(r.rangeProb * 100);
          return `<span style="font-size:9px;padding:1px 6px;border-radius:5px;background:rgba(59,130,246,0.10);color:var(--blue);border:1px solid rgba(59,130,246,0.28);font-weight:600;white-space:nowrap">🔄 RANGE ${pct}%</span>`;
        }
        const isLongEntry  = e.direction === 'long';
        const isBull       = r.trendDir === 'BULL';
        const withTrend    = (isLongEntry && isBull) || (!isLongEntry && !isBull);
        const icon         = isBull ? '📈' : '📉';
        const col          = withTrend ? 'var(--green)' : 'var(--red)';
        const bg           = withTrend ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)';
        const bd           = withTrend ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)';
        const note         = withTrend ? '✓' : '✗';
        return `<span style="font-size:9px;padding:1px 6px;border-radius:5px;background:${bg};color:${col};border:1px solid ${bd};font-weight:600;white-space:nowrap" title="HMM: TREND ${r.trendDir} — trade is ${withTrend ? 'with' : 'against'} trend">${icon} TREND ${r.trendDir} ${note}</span>`;
      })();

      return `<div class="ec-regime-row" style="flex-wrap:wrap;gap:4px">
        <span class="ec-regime-agree">${agree} agree</span>
        <span style="color:var(--border2)">·</span>
        <span class="ec-regime-disagree">${disagree} don't</span>
        <span style="color:var(--border2)">·</span>
        <span class="ec-regime-na">${na} N/A</span>
        ${hmmChip ? `<span style="color:var(--border2)">·</span>${hmmChip}` : ''}
      </div>`;
    })();

    const _scoreBadge = (() => {
      const s = e.signalScore;
      if (s == null) return '';
      const tier = signalScoreTier(s);
      const col = tier === 'strong' ? 'var(--green)' : tier === 'moderate' ? 'var(--amber)' : 'var(--text3)';
      const bg  = tier === 'strong' ? 'rgba(34,197,94,0.10)' : tier === 'moderate' ? 'rgba(245,158,11,0.10)' : 'var(--s2)';
      const bd  = tier === 'strong' ? 'rgba(34,197,94,0.30)' : tier === 'moderate' ? 'rgba(245,158,11,0.30)' : 'var(--border)';
      return `<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:8px;background:${bg};color:${col};border:1px solid ${bd};margin-left:4px" title="Signal quality: HMM regime 20% · Bayesian 30% · Macro tiers 25% · Range bias 15% · Structure 10%">${s}%</span>`;
    })();

    const _gradeBanner = (() => {
      if (e.signalScore == null) return '';
      const g = gradeEntry(e, hmmData, hmmData?.intraday30m ?? null);
      const vi = g.verdict === 'TAKE' ? '✅' : g.verdict === 'WATCH' ? '👁' : g.verdict === 'CAUTION' ? '⚠️' : '🚫';
      const reasonStr  = g.reasons.slice(0, 2).join(' · ');
      const warningStr = g.warnings.slice(0, 1)[0] ?? '';
      return `<div style="display:flex;align-items:center;gap:6px;padding:3px 6px 3px 0;border-bottom:1px solid var(--border);margin-bottom:2px">
        <span style="font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:8px;background:${g.color}20;color:${g.color};border:1px solid ${g.color}44;letter-spacing:.05em;flex-shrink:0">${g.grade}</span>
        <span style="font-size:9.5px;font-weight:700;color:${g.color};flex-shrink:0">${vi} ${g.verdict}</span>
        ${reasonStr ? `<span style="font-size:9px;color:var(--text3);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${g.reasons.join(' · ')}">${reasonStr}</span>` : ''}
        ${warningStr ? `<span style="font-size:9px;color:#f59e0b;flex-shrink:0" title="${g.warnings.join(' · ')}">⚠ ${warningStr}</span>` : ''}
      </div>`;
    })();

    return `
    <div class="entry-card ${cls}">
      <div class="ec-top">
        <span class="ec-stars">${starStr}${starSplit}${_scoreBadge}</span>
        <span class="ec-price">${e.price.toFixed(digits)}</span>
        ${approachArrow ? `<span class="ec-approach" title="Recent 5m price direction">${approachArrow}</span>` : ''}
        <span class="ec-dir ${e.direction}">${e.direction === 'long' ? '↑ BUY' : '↓ SELL'}</span>
        <span class="ec-dist">${above ? '↑' : '↓'} ${e.distance.toFixed(0)}${unit}</span>
      </div>
      ${_gradeBanner}
      ${confirmBanner}
      ${ecRegimeRow}
      <div class="ec-layers">${tagsHtml}</div>
      <div class="ec-trade">${tradeHtml}</div>
      ${rbHtml}
    </div>`;
  }).join('')}</div>`;
}

// ── Combined render ───────────────────────────────────────────────────────────

export function renderSignalAndEntries(enhanced, pivots, asia, monday, quote, volRegime, otcForecast) {
  const sigEl   = document.getElementById('signalEngineCard');
  const entrEl  = document.getElementById('entryScannerCard');
  const cntEl   = document.getElementById('entryScannerCount');
  if (!sigEl || !entrEl) return;

  const signal   = runSignalEngine(S.compassData, volRegime);
  const tierData = (() => { try { return calculateTierScores(); } catch(e) { return null; } })();
  const hmmData  = S.hmmRegimes?.[S.currentPair?.symbol] ?? null;
  const entries  = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime)
    .map(e => ({ ...e, signalScore: tierData ? computeSignalScore(e, tierData, hmmData) : null }))
    .sort((a, b) => {
      // Primary: signalScore descending (nulls sort last)
      const sa = a.signalScore ?? -1;
      const sb = b.signalScore ?? -1;
      if (sb !== sa) return sb - sa;
      // Secondary: totalStars descending
      if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
      // Tertiary: distance ascending
      return a.distance - b.distance;
    });

  // Recent 5m approach direction (newest-first; index 0 = forming bar)
  const approachArrow = (() => {
    const bars = S.ohlc5m?.[S.currentPair.symbol]?.values;
    if (!bars || bars.length < 6) return null;
    const gc = b => parseFloat(b.close ?? b.mid?.c ?? b.c);
    const r = gc(bars[1]), o = gc(bars[Math.min(5, bars.length - 1)]);
    if (isNaN(r) || isNaN(o)) return null;
    return r > o ? '↗' : r < o ? '↘' : '→';
  })();

  window._lastEntries = entries;
  sigEl.innerHTML  = renderSignalCard(signal, volRegime, otcForecast);
  entrEl.innerHTML = renderEntryScanner(entries, quote, signal, volRegime, asia, monday, otcForecast, tierData, approachArrow, hmmData);

  if (cntEl) {
    cntEl.textContent = entries.length;
    cntEl.style.display = entries.length ? 'inline-block' : 'none';
  }
}
