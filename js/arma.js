import { S } from './state.js';
import { COMPASS_CONFIG } from './config.js';
import { getPipSize, filterTradingDays } from './utils.js';

// ── OLS helper: y = a + b·x ──────────────────────────────────────────────────
function ols(x, y) {
  const n  = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0;
  for (let i = 0; i < n; i++) {
    num  += (x[i] - mx) * (y[i] - my);
    denX += (x[i] - mx) ** 2;
  }
  const b     = denX > 0 ? num / denX : 0;
  const a     = my - b * mx;
  const ssTot = y.reduce((s, v)    => s + (v - my) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - (a + b * x[i])) ** 2, 0);
  const r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { a, b, r2 };
}

// ── VECM(1): ARMA enhanced with cointegration error-correction ────────────────
// Model: Δspread_t = μ + φ·Δspread_{t-1} + γ·ECT_{t-1} + θ·ε_{t-1} + ε_t
// ECT_t = spread_t − (a + b·ln(price_t))  — deviation from long-run equilibrium
// γ < 0: when spread too high vs price, it mean-reverts downward (and vice versa).
// Falls back to ARMA when price data unavailable or cointegration R² < 0.05.
export function fitVECM(arr, priceBarsChron) {
  if (!arr || arr.length < 20) return null;
  if (!priceBarsChron || priceBarsChron.length < 30) return fitARMA(arr);

  const vals = arr.map(p => p.value);
  const N    = Math.min(vals.length, priceBarsChron.length);

  const spread = vals.slice(-N);
  const logPx  = priceBarsChron.slice(-N).map(b => {
    const c = parseFloat(b.close ?? b.c ?? b.mid?.c ?? 0);
    return c > 0 ? Math.log(c) : NaN;
  });

  const valid = spread.map((s, i) => ({ s, p: logPx[i] })).filter(v => !isNaN(v.p));
  if (valid.length < 25) return fitARMA(arr);

  const sp = valid.map(v => v.s);
  const px = valid.map(v => v.p);

  // Step 1: OLS cointegrating regression — spread_t = a + b·ln(price_t)
  const coint = ols(px, sp);
  if (coint.r2 < 0.05) return fitARMA(arr);   // weak cointegration — fall back

  // ECT: deviation of spread from long-run equilibrium implied by current price
  const ect = sp.map((s, i) => s - (coint.a + coint.b * px[i]));

  // Step 2: first differences of spread
  const diff = [];
  for (let i = 1; i < sp.length; i++) diff.push(sp[i] - sp[i - 1]);
  if (diff.length < 15) return fitARMA(arr);

  const mu       = diff.reduce((a, b) => a + b, 0) / diff.length;
  const demeaned = diff.map(d => d - mu);

  // Step 3: AR(1) coefficient on demeaned diff
  let num = 0, den = 0;
  for (let i = 1; i < demeaned.length; i++) {
    num += demeaned[i] * demeaned[i - 1];
    den += demeaned[i - 1] ** 2;
  }
  const phi = den > 0 ? Math.max(-0.95, Math.min(0.95, num / den)) : 0;

  // Lagged ECT aligned to diff: diff[i] = sp[i+1]−sp[i], paired with ect[i]
  const ectLag = ect.slice(0, diff.length);

  // Step 4: ECT coefficient γ via OLS of AR residuals on lagged ECT
  const arResid = [demeaned[0]];
  for (let i = 1; i < demeaned.length; i++) {
    arResid.push(demeaned[i] - phi * demeaned[i - 1]);
  }
  let gNum = 0, gDen = 0;
  for (let i = 1; i < arResid.length; i++) {
    gNum += arResid[i] * ectLag[i - 1];
    gDen += ectLag[i - 1] ** 2;
  }
  // Constrain γ ∈ [−1, 0]: must be mean-reverting (negative) or zero
  const gamma = gDen > 0 ? Math.max(-1.0, Math.min(0.0, gNum / gDen)) : 0;

  // Step 5: MA(1) theta on updated residuals (including ECT term)
  const residuals = [demeaned[0]];
  for (let i = 1; i < demeaned.length; i++) {
    residuals.push(demeaned[i] - phi * demeaned[i - 1] - gamma * ectLag[i - 1]);
  }
  let rNum = 0, rDen = 0;
  for (let i = 1; i < residuals.length; i++) {
    rNum += residuals[i] * residuals[i - 1];
    rDen += residuals[i - 1] ** 2;
  }
  const theta = rDen > 0 ? Math.max(-0.95, Math.min(0.95, rNum / rDen)) : 0;

  const resVar   = residuals.reduce((a, r) => a + r * r, 0) / residuals.length;
  const resSigma = Math.sqrt(resVar);

  const lastECT   = ect[ect.length - 1];
  const lastDiff  = demeaned[demeaned.length - 1];
  const lastResid = residuals[residuals.length - 1];

  // Step 6: 5-step forecast (ECT decays geometrically at rate (1+γ) per step)
  const forecasts   = [];
  let forecastLevel = vals[vals.length - 1];
  let prevDiff      = lastDiff;
  let prevResid     = lastResid;
  let prevECT       = lastECT;

  for (let h = 1; h <= 5; h++) {
    const ectTerm      = gamma * prevECT;
    const forecastDiff = mu + phi * prevDiff + (h === 1 ? theta * prevResid : 0) + ectTerm;
    forecastLevel += forecastDiff;
    const ci68 = resSigma * Math.sqrt(h);
    forecasts.push({ h, level: forecastLevel, change: forecastDiff,
                     ci68Up: forecastLevel + ci68, ci68Dn: forecastLevel - ci68 });
    prevDiff  = forecastDiff;
    prevResid = 0;
    prevECT   = prevECT * (1 + gamma);
  }

  // Step 7: skill vs naive
  let vecmErr = 0, naiveErr = 0;
  for (let i = 1; i < diff.length; i++) {
    const pred = mu + phi * demeaned[i - 1] + gamma * ectLag[i - 1];
    vecmErr  += Math.abs(diff[i] - pred);
    naiveErr += Math.abs(diff[i] - mu);
  }
  const n_     = diff.length - 1;
  const skill  = naiveErr > 0 ? 1 - vecmErr / naiveErr : 0;

  return {
    phi:           phi.toFixed(3),
    theta:         theta.toFixed(3),
    mu:            mu.toFixed(4),
    gamma:         gamma.toFixed(3),
    cointR2:       coint.r2.toFixed(3),
    resSigma,
    forecasts,
    skillPct:      Math.round(skill * 100),
    currentLevel:  vals[vals.length - 1],
    currentChange: diff[diff.length - 1],
    ectNow:        lastECT.toFixed(4),
    isVECM:        true,
  };
}

// ARMA(1,1) on first differences of yield spread.
// Model: Δspread_t = μ + φ·Δspread_{t-1} + θ·ε_{t-1} + ε_t
// Parameters estimated via Yule-Walker / method of moments.

export function fitARMA(arr) {
  if (!arr || arr.length < 20) return null;

  const vals = arr.map(p => p.value);

  const diff = [];
  for (let i = 1; i < vals.length; i++) diff.push(vals[i] - vals[i-1]);
  if (diff.length < 15) return null;

  const mu = diff.reduce((a,b) => a+b, 0) / diff.length;
  const demeaned = diff.map(d => d - mu);

  let num = 0, den = 0;
  for (let i = 1; i < demeaned.length; i++) {
    num += demeaned[i] * demeaned[i-1];
    den += demeaned[i-1] ** 2;
  }
  const phi = den > 0 ? Math.max(-0.95, Math.min(0.95, num / den)) : 0;

  const residuals = [demeaned[0]];
  for (let i = 1; i < demeaned.length; i++) {
    residuals.push(demeaned[i] - phi * demeaned[i-1]);
  }

  let rNum = 0, rDen = 0;
  for (let i = 1; i < residuals.length; i++) {
    rNum += residuals[i] * residuals[i-1];
    rDen += residuals[i-1] ** 2;
  }
  const theta = rDen > 0 ? Math.max(-0.95, Math.min(0.95, rNum / rDen)) : 0;

  const resSq = residuals.map(r => r**2);
  const resVar = resSq.reduce((a,b) => a+b, 0) / residuals.length;
  const resSigma = Math.sqrt(resVar);

  const lastDiff  = demeaned[demeaned.length-1];
  const lastResid = residuals[residuals.length-1];

  const forecasts   = [];
  let forecastLevel = vals[vals.length-1];
  let prevDiff      = lastDiff;
  let prevResid     = lastResid;

  for (let h = 1; h <= 5; h++) {
    const forecastDiff = mu + phi * prevDiff + (h === 1 ? theta * prevResid : 0);
    forecastLevel += forecastDiff;
    const ci68 = resSigma * Math.sqrt(h);
    forecasts.push({
      h,
      level:    forecastLevel,
      change:   forecastDiff,
      ci68Up:   forecastLevel + ci68,
      ci68Dn:   forecastLevel - ci68,
    });
    prevDiff  = forecastDiff;
    prevResid = 0;
  }

  let armaErr = 0, naiveErr = 0;
  for (let i = 1; i < diff.length; i++) {
    const armaPred = mu + phi * demeaned[i-1]; // already includes mu — do not add again
    armaErr  += Math.abs(diff[i] - armaPred);
    naiveErr += Math.abs(diff[i] - mu);
  }
  const mae      = armaErr  / (diff.length - 1);
  const naiveMae = naiveErr / (diff.length - 1);
  const skill    = naiveMae > 0 ? 1 - (mae / naiveMae) : 0;

  return {
    phi:       phi.toFixed(3),
    theta:     theta.toFixed(3),
    mu:        mu.toFixed(4),
    resSigma,
    forecasts,
    skillPct:      Math.round(skill * 100),
    currentLevel:  vals[vals.length-1],
    currentChange: diff[diff.length-1],
  };
}

export function computeARMAForecast(data) {
  if (!data) return null;
  const cfg = COMPASS_CONFIG[data.sym];
  if (!cfg) return null;

  const isGoldARMA = data.sym === 'XAU/USD';

  // Fetch price bars for VECM cointegration (oldest→newest after reverse)
  const _rawBars    = filterTradingDays(S.ohlcData[data.sym]?.values);
  const priceChron  = _rawBars ? [..._rawBars].reverse() : null;

  const arma10 = data.spread10y.length >= 20 ? fitVECM(data.spread10y, priceChron) : null;
  const arma2  = isGoldARMA
    ? (data.spreadDxy && data.spreadDxy.length >= 20 ? fitARMA(data.spreadDxy) : null)
    : (data.spread2y.length >= 20 ? fitARMA(data.spread2y) : null);

  if (!arma10 && !arma2) return null;

  const f10_5d = arma10 ? arma10.forecasts[4].level - arma10.currentLevel : null;
  const f10_1d = arma10 ? arma10.forecasts[0].level - arma10.currentLevel : null;
  const f2_5d  = arma2  ? arma2.forecasts[4].level  - arma2.currentLevel  : null;

  const bull10 = f10_5d != null ? (cfg.fxSign > 0 ? f10_5d > 0 : f10_5d < 0) : null;
  const bull2  = f2_5d  != null ? (cfg.fxSign > 0 ? f2_5d  > 0 : f2_5d  < 0) : null;

  const agree = bull10 != null && bull2 != null ? bull10 === bull2 : null;

  let direction, confidence;
  const bullCount = [bull10, bull2].filter(x => x === true).length;
  const bearCount = [bull10, bull2].filter(x => x === false).length;

  if (bullCount === 2 || (bullCount === 1 && bearCount === 0)) {
    direction = 'BULLISH'; confidence = bullCount === 2 ? 'HIGH' : 'MEDIUM';
  } else if (bearCount === 2 || (bearCount === 1 && bullCount === 0)) {
    direction = 'BEARISH'; confidence = bearCount === 2 ? 'HIGH' : 'MEDIUM';
  } else {
    direction = 'MIXED'; confidence = 'LOW';
  }

  const avgSkill = [arma10?.skillPct, arma2?.skillPct].filter(x => x != null)
    .reduce((a,b,_,arr) => a + b/arr.length, 0);
  if (avgSkill < 5) {
    confidence = 'LOW';
    direction  = 'MIXED';
  }

  return {
    direction,
    confidence,
    agree,
    arma10,
    arma2,
    f10_1d,
    f10_5d,
    f2_5d,
    bull10,
    bull2,
    avgSkill: Math.round(avgSkill),
  };
}

export function computeRegimeTransition(volHistory) {
  if (!volHistory || volHistory.length < 30) return null;

  const pipSz = getPipSize(S.currentPair.symbol);

  const n = Math.min(volHistory.length, 100);
  const hist = volHistory.slice(0, n);
  const sorted = [...hist].sort((a,b) => a-b);

  const currentATR  = hist[0];
  const currentRank = sorted.findIndex(v => v >= currentATR);
  const currentPct  = Math.round((Math.max(0, currentRank) / sorted.length) * 100);
  const currentRegime = currentPct <= 25 ? 'LOW' : currentPct >= 75 ? 'HIGH' : 'NORMAL';

  let consecutiveDays = 0;
  for (let i = 0; i < Math.min(volHistory.length, 60); i++) {
    const atr  = volHistory[i];
    const rank = sorted.findIndex(v => v >= atr);
    const pct  = Math.round((Math.max(0, rank) / sorted.length) * 100);
    const reg  = pct <= 25 ? 'LOW' : pct >= 75 ? 'HIGH' : 'NORMAL';
    if (reg === currentRegime) consecutiveDays++;
    else break;
  }

  const recent10  = volHistory.slice(0, 10).reduce((a,b) => a+b, 0) / 10;
  const prev10    = volHistory.slice(10, 20).reduce((a,b) => a+b, 0) / Math.min(10, volHistory.slice(10,20).length);
  const compressing = recent10 < prev10 * 0.92;
  const expanding   = recent10 > prev10 * 1.08;

  let transitionRisk, riskScore, riskText, riskDetail;

  if (currentRegime === 'LOW') {
    if (consecutiveDays >= 20) {
      transitionRisk = 'HIGH';
      riskScore = Math.min(100, 60 + consecutiveDays);
      riskText  = `${consecutiveDays} days of compressed vol — shock risk elevated`;
      riskDetail= 'Extended Low vol regimes end suddenly. Positions sized for quiet markets get hit hard. Consider reducing size and widening stops pre-emptively.';
    } else if (consecutiveDays >= 10) {
      transitionRisk = 'ELEVATED';
      riskScore = Math.min(100, 30 + consecutiveDays * 2);
      riskText  = `${consecutiveDays} days in Low vol — watch for shock`;
      riskDetail= 'Vol compression building. Low→High transitions are sudden. Be alert to gap risk and news events.';
    } else {
      transitionRisk = 'LOW';
      riskScore = consecutiveDays * 3;
      riskText  = `${consecutiveDays} days in Low vol — normal compression`;
      riskDetail= 'Low vol regime is recent. No elevated transition risk yet.';
    }
    if (compressing) {
      riskScore = Math.min(100, riskScore + 15);
      riskText += ' · ATR still falling';
    }
  } else if (currentRegime === 'HIGH') {
    if (consecutiveDays >= 10) {
      transitionRisk = 'ELEVATED';
      riskScore = 40;
      riskText  = `${consecutiveDays} days of High vol — gradual normalisation expected`;
      riskDetail= 'High vol regimes fade slowly. Expect decreasing ranges but remain cautious with size. Avoid mean-reversion trades against the trend until regime confirms.';
    } else {
      transitionRisk = 'LOW';
      riskScore = 20;
      riskText  = `${consecutiveDays} days in High vol — still active`;
      riskDetail= 'Recent vol spike. Widen stops, reduce size. Watch for vol contraction over next 5 days.';
    }
    if (expanding) {
      riskScore = Math.min(100, riskScore + 20);
      riskText += ' · ATR still expanding';
    }
  } else {
    transitionRisk = 'LOW';
    riskScore = 10;
    riskText  = `${consecutiveDays} days in Normal vol`;
    riskDetail = compressing
      ? 'Vol quietly contracting — watch for transition to Low vol regime. Mean-reversion setups may become more reliable.'
      : expanding
      ? 'Vol quietly expanding — watch for transition to High vol regime.'
      : 'Vol regime stable. Standard approach appropriate.';
  }

  return {
    currentRegime,
    currentPct,
    consecutiveDays,
    compressing,
    expanding,
    transitionRisk,
    riskScore,
    riskText,
    riskDetail,
    recentATRPips:  Math.round(recent10 / pipSz),
    prevATRPips:    Math.round(prev10   / pipSz),
    // Convenience flag consumed by regime-confidence.js sizing engine
    lowVolPersistenceFlag: currentRegime === 'LOW' && consecutiveDays >= 20,
  };
}

export function renderARMACard(arma, data) {
  if (!arma) {
    return `<div class="arma-card">
      <div class="arma-hd"><span class="arma-title">ARMA Spread Forecast</span></div>
      <div style="font-size:11px;color:var(--text3)">Insufficient history — need 20+ spread observations</div>
    </div>`;
  }

  const cfg       = COMPASS_CONFIG[data.sym];
  const isEquity  = data.sym === 'NAS100_USD';
  const isGold    = data.sym === 'XAU/USD';
  const sigCls    = arma.direction === 'BULLISH' ? 'bull' : arma.direction === 'BEARISH' ? 'bear' : 'flat';
  const sigIcon   = arma.direction === 'BULLISH' ? '📈' : arma.direction === 'BEARISH' ? '📉' : '↔';
  const confCol   = arma.confidence === 'HIGH' ? 'var(--green)' : arma.confidence === 'MEDIUM' ? 'var(--amber)' : 'var(--text3)';
  const skillCol  = arma.avgSkill > 10 ? 'var(--green)' : arma.avgSkill > 0 ? 'var(--amber)' : 'var(--red)';

  const f10 = arma.arma10?.forecasts ?? [];
  const forecastBars = f10.map((f, i) => {
    const chg = f.change;
    const cls = Math.abs(chg) < 0.001 ? 'flat' : chg > 0 ? (cfg.fxSign > 0 ? 'up' : 'dn') : (cfg.fxSign > 0 ? 'dn' : 'up');
    const val = (chg >= 0 ? '+' : '') + (chg * 100).toFixed(1) + 'bp';
    const days = ['T+1','T+2','T+3','T+4','T+5'];
    return `<div class="arma-day ${cls}">
      <span class="arma-day-lbl">${days[i]}</span>
      <span class="arma-day-val">${val}</span>
    </div>`;
  }).join('');

  const phi10   = arma.arma10?.phi   ?? '—';
  const theta10 = arma.arma10?.theta ?? '—';
  const f5dStr  = arma.f10_5d != null ? (arma.f10_5d >= 0 ? '+' : '') + (arma.f10_5d).toFixed(3) + '% (5d)' : '—';

  const badgeLabel  = isGold ? '10Y Yield + DXY' : isEquity ? '10Y − 2Y Curve' : '10Y ' + cfg.label;
  const dirLabel    = isGold ? arma.direction + ' DRIVERS (5d)' : isEquity ? arma.direction + ' CURVE (5d)' : arma.direction + ' SPREAD (5d)';
  const rowLabel    = isGold ? '10Y Yield daily change forecast' : isEquity ? 'Yield curve daily change forecast' : '10Y Spread daily change forecast';
  const f5dLabel    = isGold ? '5d 10Y yield' : isEquity ? '5d curve Δ' : '5d 10Y spread';

  const signalText = (() => {
    if (isGold) {
      if (arma.direction === 'BULLISH') return 'Yield + DXY both forecast to fall -- dual bullish signal for Gold';
      if (arma.direction === 'BEARISH') return 'Yield or DXY forecast to rise -- bearish pressure building on Gold';
      return 'Yield and DXY signals disagree -- Gold driver divergence, lower edge';
    }
    if (isEquity) {
      if (arma.direction === 'BULLISH') return 'Yield curve (secondary) forecast to steepen — growth expectations rising, constructive for NAS100';
      if (arma.direction === 'BEARISH') return 'Yield curve (secondary) forecast to flatten/invert — growth concern building, weight net liquidity T1 for confirmation';
      return 'Curve direction unclear — mixed growth signals, weight net liquidity T1 more heavily';
    }
    if (arma.direction === 'BULLISH') return `Spread forecast to ${cfg.fxSign > 0 ? 'rise - bullish' : 'fall - bullish'} for ${data.sym.split('/')[0]} over 5 days`;
    if (arma.direction === 'BEARISH') return `Spread forecast to ${cfg.fxSign > 0 ? 'fall - bearish' : 'rise - bearish'} for ${data.sym.split('/')[0]} over 5 days`;
    return '10Y and 2Y spread forecasts disagree - directional edge unclear';
  })();

  const agreeNote = isEquity ? '' :
    arma.agree === false ? (isGold ? ' - DXY/yield diverging' : ' - 2Y/10Y diverging') :
    arma.agree === true  ? (isGold ? ' - DXY confirms yield'  : ' - 2Y confirms')      : '';

  // SVG spread forecast chart — history + 5d forecast with 68% CI band
  const spreadChart = (() => {
    const series = data?.spread10y;
    const fc10   = arma.arma10?.forecasts;
    if (!series?.length || !fc10?.length) return '';

    const history = [...series].reverse().slice(-20);
    const allVals = [
      ...history.map(d => d.value),
      ...fc10.flatMap(f => [f.level, f.ci68Up, f.ci68Dn]),
    ];
    const yMin = Math.min(...allVals);
    const yMax = Math.max(...allVals);
    const yRng = yMax - yMin || 0.01;

    const W = 400, H = 72, pt = 8, pr = 8, pb = 18, pl = 34;
    const cw = W - pl - pr, ch = H - pt - pb;
    const nPts = history.length + fc10.length;
    const sx = i => pl + (i / (nPts - 1)) * cw;
    const sy = v => pt + (1 - (v - yMin) / yRng) * ch;

    const lastX = sx(history.length - 1);
    const lastY = sy(history[history.length - 1].value);

    const histLine = history.map((d, i) => `${sx(i).toFixed(1)},${sy(d.value).toFixed(1)}`).join(' ');
    const fcLine   = `${lastX.toFixed(1)},${lastY.toFixed(1)} ` +
      fc10.map((f, i) => `${sx(history.length + i).toFixed(1)},${sy(f.level).toFixed(1)}`).join(' ');
    const ciPoly   = `${lastX.toFixed(1)},${lastY.toFixed(1)} ` +
      fc10.map((f, i) => `${sx(history.length + i).toFixed(1)},${sy(f.ci68Up).toFixed(1)}`).join(' ') + ' ' +
      [...fc10].reverse().map((f, i) => `${sx(history.length + fc10.length - 1 - i).toFixed(1)},${sy(f.ci68Dn).toFixed(1)}`).join(' ');

    const yTicks = [yMin, (yMin + yMax) / 2, yMax].map(v => ({
      y: sy(v).toFixed(1),
      lbl: (v * 100).toFixed(0) + 'bp',
    }));

    const fcCol = arma.direction === 'BULLISH' ? 'var(--green)' : arma.direction === 'BEARISH' ? 'var(--red)' : 'var(--amber)';

    return `<div style="margin-bottom:10px">
      <div style="font-size:9px;color:var(--text3);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Spread — recent history + 5d forecast (68% CI)</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;overflow:visible">
        ${yTicks.map(t => `
          <line x1="${pl}" y1="${t.y}" x2="${W - pr}" y2="${t.y}" style="stroke:var(--border);stroke-width:0.5;stroke-dasharray:3,3"/>
          <text x="${pl - 3}" y="${parseFloat(t.y) + 3.5}" style="font-size:7px;fill:var(--text3);font-family:DM Mono,monospace" text-anchor="end">${t.lbl}</text>
        `).join('')}
        <line x1="${lastX.toFixed(1)}" y1="${pt}" x2="${lastX.toFixed(1)}" y2="${pt + ch}" style="stroke:var(--border2);stroke-width:1;stroke-dasharray:4,2"/>
        <polygon points="${ciPoly}" style="fill:${fcCol};opacity:0.13"/>
        <polyline points="${histLine}" style="fill:none;stroke:var(--text2);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round"/>
        <polyline points="${fcLine}"  style="fill:none;stroke:${fcCol};stroke-width:1.5;stroke-dasharray:4,2;stroke-linejoin:round;stroke-linecap:round"/>
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" style="fill:var(--text);stroke:var(--s1);stroke-width:1.5"/>
      </svg>
    </div>`;
  })();

  return `<div class="arma-card">
    <div class="arma-hd">
      <span class="arma-title">📐 ${arma.arma10?.isVECM ? 'VECM(1)' : 'ARMA(1,1)'} ${isEquity ? 'Curve' : 'Spread'} Forecast</span>
      <span class="arma-badge" style="background:var(--blue-bg);color:var(--blue);border-color:var(--blue-bd)">${badgeLabel}</span>
      <span class="arma-badge" style="background:${confCol}22;color:${confCol};border-color:${confCol}44">${arma.confidence}</span>
      <span class="arma-badge" style="background:${skillCol}22;color:${skillCol};border-color:${skillCol}44" title="Model accuracy vs random walk">${arma.avgSkill > 0 ? '+' : ''}${arma.avgSkill}% accuracy</span>
    </div>

    <div class="arma-signal ${sigCls}" style="margin-bottom:10px">
      <span class="arma-signal-icon">${sigIcon}</span>
      <div style="flex:1">
        <div class="arma-signal-dir">${dirLabel}</div>
        <div class="arma-signal-text">${signalText}${agreeNote}</div>
        ${arma.avgSkill < 5 ? `<div style="font-size:9.5px;color:var(--amber);font-weight:600;margin-top:3px">⚠ Low model skill — treat as weak signal</div>` : ''}
      </div>
    </div>

    ${spreadChart}

    <div style="font-size:9px;color:var(--text3);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">${rowLabel}</div>
    <div class="arma-forecast-row">${forecastBars || '<div style="padding:8px;color:var(--text3);font-size:11px">No 10Y data</div>'}</div>

    <div class="arma-stats" style="margin-top:8px">
      <div class="arma-stat">
        <div class="arma-stat-lbl">AR(φ)</div>
        <div class="arma-stat-val">${phi10}</div>
        <div class="arma-stat-sub">persistence</div>
      </div>
      <div class="arma-stat">
        <div class="arma-stat-lbl">MA(θ)</div>
        <div class="arma-stat-val">${theta10}</div>
        <div class="arma-stat-sub">shock absorption</div>
      </div>
      <div class="arma-stat">
        <div class="arma-stat-lbl">5d ${isGold ? 'Yield Δ' : 'Spread Δ'}</div>
        <div class="arma-stat-val" style="font-size:11px">${f5dStr}</div>
        <div class="arma-stat-sub">${isGold ? '10Y yield' : '10Y spread'}</div>
      </div>
    </div>

    <div style="font-size:9.5px;color:var(--text3);line-height:1.5;padding:6px 8px;background:var(--s1);border-radius:5px;border:1px solid var(--border)">
      ${arma.arma10?.isVECM
        ? `VECM: Δs_t = ${((arma.arma10?.mu||0)*100).toFixed(2)}bp + ${phi10}·Δs_{t-1} + ${arma.arma10.gamma}·ECT_{t-1} + ${theta10}·ε_{t-1} | R²=${arma.arma10.cointR2} ECT=${arma.arma10.ectNow}`
        : `ARMA: Δspread_t = ${arma.arma10?.mu > 0 ? '+' : ''}${((arma.arma10?.mu || 0)*100).toFixed(2)}bp + ${phi10}·Δs_{t-1} + ${theta10}·ε_{t-1}`}
    </div>
  </div>`;
}

export function renderRegimeTransitionCard(rt) {
  if (!rt) return '';

  const riskCls = rt.transitionRisk;
  const barCol  = riskCls === 'HIGH' ? 'var(--red)' : riskCls === 'ELEVATED' ? 'var(--amber)' : 'var(--green)';
  const trendStr = rt.compressing ? '📉 ATR compressing' : rt.expanding ? '📈 ATR expanding' : '→ ATR stable';
  const consStr  = rt.currentRegime === 'LOW' && rt.consecutiveDays >= 10
    ? `⚠ ${rt.consecutiveDays}d compression` : `${rt.consecutiveDays}d in ${rt.currentRegime}`;

  return `<div class="rtrans-card">
    <div class="rtrans-hd">
      <span class="rtrans-title">⚡ Regime Transition Risk</span>
      <span class="rtrans-risk ${riskCls}">${riskCls}</span>
    </div>
    <div class="rtrans-body">
      <strong>${rt.riskText}</strong> · ${trendStr}<br>
      <span style="font-size:10px">${rt.riskDetail}</span>
    </div>
    <div class="rtrans-meter">
      <span class="rtrans-meter-lbl">Shock risk</span>
      <div class="rtrans-meter-bar">
        <div class="rtrans-meter-fill" style="width:${rt.riskScore}%;background:${barCol}"></div>
      </div>
      <span class="rtrans-meter-val" style="color:${barCol}">${rt.riskScore}%</span>
    </div>
    <div style="display:flex;gap:12px;margin-top:8px;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3)">
      <span>ATR now: <strong style="color:var(--text)">${rt.recentATRPips}p</strong></span>
      <span>ATR -10d: <strong style="color:var(--text)">${rt.prevATRPips}p</strong></span>
      <span>${rt.currentPct}th pct</span>
      <span>${consStr}</span>
    </div>
  </div>`;
}

export function renderARMAAndTransition(data) {
  const armaEl = document.getElementById('compassARMA');
  const rtEl   = document.getElementById('compassTransition');
  if (!armaEl || !rtEl) return;

  const arma = data ? computeARMAForecast(data) : null;
  armaEl.innerHTML = renderARMACard(arma, data || { sym: S.currentPair.symbol });

  const bars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  let rt = null;
  if (bars && bars.length >= 30) {
    const barsChron = [...bars].reverse();
    const trueRanges = [];
    for (let i = 1; i < barsChron.length; i++) {
      const h  = parseFloat(barsChron[i].high);
      const l  = parseFloat(barsChron[i].low);
      const pc = parseFloat(barsChron[i-1].close);
      trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    rt = computeRegimeTransition(trueRanges.reverse());
  }
  rtEl.innerHTML = renderRegimeTransitionCard(rt);
}
