import { S } from './state.js';
import { COMPASS_CONFIG } from './config.js';
import { getPipSize, getDigits } from './utils.js';
import { compassFairValue, zScore } from './compass.js';
import { getCaps } from './caps.js';
import { oiFmtStrike } from './oi.js';
import { getPairSurpriseScore } from './events.js';
import { detectCrossConflict } from './macro.js';
import { computeARMAForecast } from './arma.js';

// ── FV gap → pips ────────────────────────────────────────────────────────────
// 1 z-unit ≈ 0.5 ATR (conservative — spread z-score is smoother than price)
export function fvGapToPips(fvGap, atr, pipSize) {
  if (fvGap == null || !atr || !pipSize) return null;
  return (fvGap * atr * 0.5) / pipSize;
}

// ── Signal engine ────────────────────────────────────────────────────────────

export function runSignalEngine(compassData, volRegime) {
  const sym    = S.currentPair.symbol;
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
      const surpriseBull  = ps.net > 0;
      const signalBull    = bias === 'LONG';
      const confirms      = surpriseBull === signalBull;
      const pts           = Math.abs(ps.net) > 1.5 ? 2 : 1;
      score              += pts;  // confirms adds pts; conflicting surprises could be modelled later
      surpriseMod         = { net: ps.net, confirms, pts };
      reasons.push({
        icon:  confirms ? '🟢' : '🔴',
        label: 'Macro Surprise',
        val:   `${ps.net >= 0 ? '+' : ''}${ps.net.toFixed(2)} net ${confirms ? '✓ confirms' : '✗ conflicts'}`,
        pts:   confirms ? pts : 0,
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
      const pts      = confirms ? 1 : 0;
      score         += pts;
      armaMod        = { direction: arma.direction, confidence: arma.confidence, skill: arma.avgSkill, confirms, pts };
      reasons.push({
        icon:  confirms ? '🟢' : bias === 'NEUTRAL' ? '⚪' : '🔴',
        label: 'ARMA spread forecast',
        val:   `${arma.direction} · ${arma.confidence} · ${arma.avgSkill >= 0 ? '+' : ''}${arma.avgSkill}% vs RW`,
        pts,
      });
    }
  } catch(e) {}

  return { bias, type, score, maxScore: 12, reasons, fvPips, fvGap, fvBull,
           mom10Bull, mom2Bull, sp10Bull, lagDetected, surpriseMod, crossConflict, armaMod };
}

// ── Render signal card ────────────────────────────────────────────────────────

export function renderSignalCard(signal, volRegime) {
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
      <span class="sig-row-pts ${r.pts > 0 ? 'pos' : 'zero'}">+${r.pts}</span>
    </div>`).join('');

  return `
    <div class="signal-card ${cls}">
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

      <div class="sig-fv-pip">
        <span class="sfv-lbl">FV Gap (pips)</span>
        <span class="sfv-val" style="color:${signal.fvBull ? 'var(--green)' : signal.fvBull === false ? 'var(--red)' : 'var(--text3)'}">${fvPipStr}</span>
        <span class="sfv-sub">ATR-scaled estimate</span>
      </div>

      <div class="sig-rows">${rowsHtml}</div>

      <div style="font-size:9.5px;color:var(--text3);line-height:1.5;padding-top:6px;border-top:1px solid var(--border)">
        ⚠ Signal engine uses rate spread data (1-day FRED lag). Use as probabilistic bias — not a mechanical entry trigger. Confirm with price action at key levels below.
      </div>
    </div>`;
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
  const isGoldScan = pipSz >= 0.1 && sym.includes('XAU');
  const _pipMult   = isGoldScan ? 1.0 : pipSz;
  const oiProx     = Math.min(atr * caps.oiAtrFrac,  caps.oiPipCap  * _pipMult);
  const pivProx    = Math.min(atr * caps.pivAtrFrac,  caps.pivPipCap * _pipMult);
  const rangeProx  = Math.min(atr * caps.rngAtrFrac,  caps.rngPipCap * _pipMult);
  const gexProx    = Math.min(atr * caps.gexAtrFrac,  caps.gexPipCap * _pipMult);

  const oiStore = (() => { try { return JSON.parse(localStorage.getItem('oi_store') || '{}'); } catch(e) { return {}; } })();
  const oi = oiStore[sym] || null;

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
        oiTag = { cls: 'oi', label: `Call Wall ${oiFmtStrike(oi.callWall, sym)} (${cwDist}p)`, key: 'callwall' };
        layers.push('Near call wall');
      }
      if (Math.abs(c.price - oi.putWall) <= oiProx) {
        const below = c.direction === 'long';
        layerScore += below ? 1.5 : 0.5;
        const pwDist = Math.round(Math.abs(c.price - oi.putWall) / pipSz);
        oiTag = { cls: 'oi', label: `Put Wall ${oiFmtStrike(oi.putWall, sym)} (${pwDist}p)`, key: 'putwall' };
        layers.push('Near put wall');
      }
      if (Math.abs(c.price - oi.maxPain) <= oiProx) {
        layerScore += 0.5;
        const mpDist = Math.round(Math.abs(c.price - oi.maxPain) / pipSz);
        oiTag = oiTag || { cls: 'oi', label: `Max Pain ${oiFmtStrike(oi.maxPain, sym)} (${mpDist}p)`, key: 'maxpain' };
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
          tags.push({ cls: 'gex', label: `Gamma Flip ${oiFmtStrike(flipStrike, sym)} (${gfDist}p)`, key: 'gammaflip' });
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
        ? (_isGoldTag ? _pivRawDist.toFixed(2) + '$' : Math.round(_pivRawDist / pipSz) + 'p')
        : null;
      tags.push({ cls: 'pivot', label: c.pivotMatch + (pivDist != null ? ` (${pivDist})` : ''), key: 'pivot' });
      layers.push('Pivot ' + c.pivotMatch);
    }

    if (asia?.today) {
      if (Math.abs(c.price - asia.today.high) <= rangeProx) {
        layerScore += 0.5;
        const _asiahd = Math.round(Math.abs(c.price - asia.today.high) / pipSz);
        tags.push({ cls: 'range', label: `Asia High (${_asiahd}p)`, key: 'asiah' });
        layers.push('Asia range high');
      }
      if (Math.abs(c.price - asia.today.low) <= rangeProx) {
        layerScore += 0.5;
        const _asiald = Math.round(Math.abs(c.price - asia.today.low) / pipSz);
        tags.push({ cls: 'range', label: `Asia Low (${_asiald}p)`, key: 'asial' });
        layers.push('Asia range low');
      }
    }
    if (monday?.current) {
      if (Math.abs(c.price - monday.current.high) <= rangeProx) {
        layerScore += 0.5;
        const _monhd = Math.round(Math.abs(c.price - monday.current.high) / pipSz);
        tags.push({ cls: 'range', label: `Mon High (${_monhd}p)`, key: 'monh' });
        layers.push('Monday range high');
      }
      if (Math.abs(c.price - monday.current.low) <= rangeProx) {
        layerScore += 0.5;
        const _monld = Math.round(Math.abs(c.price - monday.current.low) / pipSz);
        tags.push({ cls: 'range', label: `Mon Low (${_monld}p)`, key: 'monl' });
        layers.push('Monday range low');
      }
    }

    if (S.sessionData?.londonOpenPrice) {
      const _lopDist = Math.abs(c.price - S.sessionData.londonOpenPrice);
      if (_lopDist <= rangeProx) {
        layerScore += 0.5;
        tags.push({ cls: 'range', label: `London Open (${Math.round(_lopDist / pipSz)}p)`, key: 'lopen' });
        layers.push('London open level');
      }
    }
    if (S.sessionData?.nyOpenPrice) {
      const _nyopDist = Math.abs(c.price - S.sessionData.nyOpenPrice);
      if (_nyopDist <= rangeProx) {
        layerScore += 0.5;
        tags.push({ cls: 'range', label: `NY Open (${Math.round(_nyopDist / pipSz)}p)`, key: 'nyopen' });
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

    return {
      ...c,
      size: adjSize,
      totalStars: Math.min(7, Math.round(layerScore)),
      layers,
      tags,
      tp,
      tpNote,
      tpPips,
      slPips,
      rrRatio,
      signalAligned,
    };
  });

  return candidates
    .filter(c => c.totalStars >= 2 && c.direction != null)
    .sort((a, b) => {
      if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
      return a.distance - b.distance;
    });
}

// ── Render entry scanner ──────────────────────────────────────────────────────

export function renderEntryScanner(entries, quote, signal, volRegime) {
  const digits = getDigits(S.currentPair.symbol);
  const pipSz  = getPipSize(S.currentPair.symbol);

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
        <span style="margin-left:auto;font-size:10px;font-family:'DM Mono',monospace;color:var(--text2)">${usedPips}p / <strong>${capPips}p</strong> cap</span>
      </div>
      ${g ? `
      <div style="position:relative;height:16px;border-radius:4px;overflow:hidden;margin-bottom:4px;background:rgba(139,92,246,0.1);border:1px solid var(--purple-bd)">
        <div style="position:absolute;top:0;bottom:0;left:${Math.max(0,(1-(g.ci68Pips/g.ci95Pips))*50).toFixed(1)}%;right:${Math.max(0,(1-(g.ci68Pips/g.ci95Pips))*50).toFixed(1)}%;background:rgba(139,92,246,0.25)"></div>
        <div style="position:absolute;top:0;bottom:0;left:0;width:${Math.min(100,(usedPct*(g.ci68Pips/(g.ci95Pips||1)))).toFixed(1)}%;background:${barCol};opacity:0.75;border-radius:4px"></div>
        <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--purple);opacity:0.5"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-family:'DM Mono',monospace;margin-bottom:5px">
        <span style="color:var(--purple)">95%: ${g.ci95Pips.toFixed(0)}p</span>
        <span style="color:var(--purple);font-weight:600">GARCH ${g.pips.toFixed(0)}p · 68%CI ${g.ci68Pips.toFixed(0)}p</span>
        <span style="color:var(--text3)">EMA ${atrPips}p</span>
      </div>` : `
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${usedPct}%;background:${barCol};border-radius:3px"></div>
      </div>`}
      <div style="display:flex;justify-content:space-between;font-size:10px;font-family:'DM Mono',monospace">
        <span style="color:var(--text3)">${usedPct}% of 68% CI used</span>
        <span style="color:${usedPct > 80 ? 'var(--red)' : 'var(--text2)'}">~<strong>${remPips}p</strong> remaining</span>
      </div>
      ${usedPct > 80 ? '<div style="font-size:10px;color:var(--red);margin-top:5px">⚠ 68% CI consumed — fade only, GARCH says breakout unlikely today</div>' :
        usedPct > 55 ? '<div style="font-size:10px;color:var(--amber);margin-top:5px">⚡ Past halfway through expected range — size down, favour mean-reversion</div>' : ''}
    </div>`;
  })() : '';

  if (!entries || entries.length === 0) {
    return `<div class="ec-no-entries">
      🎯 No high-confluence entries found<br>
      <span style="font-size:10px">Requires Fib confluence + at least one of: OI wall, pivot, range boundary, signal alignment</span>
    </div>`;
  }

  return volCtx + `<div class="entry-scanner">${entries.slice(0, 6).map(e => {
    const above   = quote.price < e.price;
    const starStr = '⭐'.repeat(e.totalStars) + '☆'.repeat(Math.max(0, 7 - e.totalStars));
    const cls     = e.totalStars >= 5 ? 'ec-5plus' : e.totalStars >= 4 ? 'ec-4' : e.totalStars >= 3 ? 'ec-3' : 'ec-low';

    const tagsHtml = e.tags.map(t => `<span class="ec-tag ${t.cls}">${t.label}</span>`).join('');

    const rrCol = e.rrRatio && parseFloat(e.rrRatio) >= 1.5 ? 'var(--green)' :
                  e.rrRatio && parseFloat(e.rrRatio) >= 1.0 ? 'var(--amber)' : 'var(--red)';
    const tpCapNote = e.tpCapped ? `<span style="color:var(--amber);font-size:9px" title="TP capped to today's remaining daily range (${volRegime.remainingPips?.toFixed(0)}p remaining)">⚡ vol-capped</span>` : '';

    const tradeHtml = e.sl != null ? `
      <span><strong>Entry</strong> ${e.price.toFixed(digits)}</span>
      <span><strong>SL</strong> ${e.sl.toFixed(digits)} (${e.slPips?.toFixed(0)}p)</span>
      <span><strong>TP</strong> ${e.tp != null ? e.tp.toFixed(digits) : '—'} (${e.tpNote}${e.tpPips ? ' · ' + e.tpPips.toFixed(0) + 'p' : ''}) ${tpCapNote}</span>
      ${e.rrRatio ? `<span><strong style="color:${rrCol}">R:R 1:${e.rrRatio}</strong></span>` : ''}
      <span><strong>Size</strong> ${e.size}%</span>
    ` : `<span style="opacity:.6"><em>Price at level — wait for directional close</em></span>`;

    return `
    <div class="entry-card ${cls}">
      <div class="ec-top">
        <span class="ec-stars">${starStr}</span>
        <span class="ec-price">${e.price.toFixed(digits)}</span>
        <span class="ec-dir ${e.direction}">${e.direction === 'long' ? '↑ BUY' : '↓ SELL'}</span>
        <span class="ec-dist">${above ? '↑' : '↓'} ${e.distance.toFixed(0)}p</span>
      </div>
      <div class="ec-layers">${tagsHtml}</div>
      <div class="ec-trade">${tradeHtml}</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Combined render ───────────────────────────────────────────────────────────

export function renderSignalAndEntries(enhanced, pivots, asia, monday, quote, volRegime) {
  const sigEl   = document.getElementById('signalEngineCard');
  const entrEl  = document.getElementById('entryScannerCard');
  const cntEl   = document.getElementById('entryScannerCount');
  if (!sigEl || !entrEl) return;

  const signal  = runSignalEngine(S.compassData, volRegime);
  const entries = runEntryScanner(signal, enhanced, pivots, asia, monday, quote, volRegime);

  sigEl.innerHTML  = renderSignalCard(signal, volRegime);
  entrEl.innerHTML = renderEntryScanner(entries, quote, signal, volRegime);

  if (cntEl) {
    cntEl.textContent = entries.length;
    cntEl.style.display = entries.length ? 'inline-block' : 'none';
  }
}
