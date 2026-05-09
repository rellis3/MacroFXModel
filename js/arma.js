import { S } from './state.js';
import { COMPASS_CONFIG } from './config.js';
import { getPipSize, filterTradingDays } from './utils.js';

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
    const armaPred  = mu + phi * demeaned[i-1];
    armaErr  += Math.abs(diff[i] - (armaPred + mu));
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

  const arma10 = data.spread10y.length >= 20 ? fitARMA(data.spread10y) : null;
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
      if (arma.direction === 'BULLISH') return 'Yield curve forecast to steepen -- growth expectations rising, bullish for NAS100';
      if (arma.direction === 'BEARISH') return 'Yield curve forecast to flatten/invert -- growth concern building, bearish for NAS100';
      return 'Curve direction unclear -- mixed growth signals, reduce directional conviction';
    }
    if (arma.direction === 'BULLISH') return `Spread forecast to ${cfg.fxSign > 0 ? 'rise - bullish' : 'fall - bullish'} for ${data.sym.split('/')[0]} over 5 days`;
    if (arma.direction === 'BEARISH') return `Spread forecast to ${cfg.fxSign > 0 ? 'fall - bearish' : 'rise - bearish'} for ${data.sym.split('/')[0]} over 5 days`;
    return '10Y and 2Y spread forecasts disagree - directional edge unclear';
  })();

  const agreeNote = isEquity ? '' :
    arma.agree === false ? (isGold ? ' - DXY/yield diverging' : ' - 2Y/10Y diverging') :
    arma.agree === true  ? (isGold ? ' - DXY confirms yield'  : ' - 2Y confirms')      : '';

  return `<div class="arma-card">
    <div class="arma-hd">
      <span class="arma-title">📐 ARMA(1,1) ${isEquity ? 'Curve' : 'Spread'} Forecast</span>
      <span class="arma-badge" style="background:var(--blue-bg);color:var(--blue);border-color:var(--blue-bd)">${badgeLabel}</span>
      <span class="arma-badge" style="background:${confCol}22;color:${confCol};border-color:${confCol}44">${arma.confidence}</span>
    </div>

    <div class="arma-signal ${sigCls}" style="margin-bottom:10px">
      <span class="arma-signal-icon">${sigIcon}</span>
      <div>
        <div class="arma-signal-dir">${dirLabel}</div>
        <div class="arma-signal-text">${signalText}${agreeNote}</div>
      </div>
    </div>

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
        <div class="arma-stat-lbl">Skill vs RW</div>
        <div class="arma-stat-val" style="color:${skillCol}">${arma.avgSkill > 0 ? '+' : ''}${arma.avgSkill}%</div>
        <div class="arma-stat-sub">beats naive</div>
      </div>
    </div>

    <div style="font-size:9.5px;color:var(--text3);line-height:1.5;padding:6px 8px;background:var(--s1);border-radius:5px;border:1px solid var(--border)">
      ${f5dLabel}: <strong>${f5dStr}</strong> ·
      Model: Δspread_t = ${arma.arma10?.mu > 0 ? '+' : ''}${((arma.arma10?.mu || 0)*100).toFixed(2)}bp + ${phi10}·Δs_{t-1} + ${theta10}·ε_{t-1}
      ${arma.avgSkill < 5 ? ' · ⚠ Low skill — treat directional signal as weak' : ''}
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
