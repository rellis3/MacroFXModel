import { S } from './state.js';
import { AI_CACHE_PREFIX, AI_CACHE_TTL } from './config.js';
import { kvGet, kvSet, getPipSize, getDigits } from './utils.js';
import { calculateTierScores } from './macro.js';
import { calculateVolRegime, calcPositionSize, calculateRiskSentiment, getForeignCurves, calculatePivots } from './vol.js';
import { computeARMAForecast, computeRegimeTransition } from './arma.js';
import { filterConfluences, enhanceConfluences } from './confluences.js';
import { runSignalEngine, runEntryScanner } from './signal.js';
import { oiFmtStrike, oiFmtOI, oiFmtChg } from './oi.js';

export async function aiLoadCache(sym) {
  const key = AI_CACHE_PREFIX + sym.replace('/', '');
  try {
    const raw = localStorage.getItem('ai_analysis_' + sym.replace('/', ''));
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && obj.ts && Date.now() - obj.ts <= AI_CACHE_TTL) return obj;
    }
  } catch(e) {}
  const kvObj = await kvGet(key);
  if (kvObj && kvObj.data && kvObj.timestamp) {
    if (Date.now() - kvObj.timestamp <= AI_CACHE_TTL) {
      try { localStorage.setItem('ai_analysis_' + sym.replace('/', ''), JSON.stringify({ ts: kvObj.timestamp, ...kvObj.data })); } catch(e) {}
      return { ts: kvObj.timestamp, ...kvObj.data };
    }
  }
  return null;
}

export function aiSaveCache(sym, analysis, generatedAt) {
  const payload = { ts: Date.now(), generatedAt, analysis, pair: sym };
  try { localStorage.setItem('ai_analysis_' + sym.replace('/', ''), JSON.stringify(payload)); } catch(e) {}
  kvSet(AI_CACHE_PREFIX + sym.replace('/', ''), payload);
}

export function aiCollectSnapshot() {
  const s = {};
  const quote = window._latestQuote;
  const sym = S.currentPair?.symbol;
  const pipSize = sym ? getPipSize(sym) : 0.0001;
  const digits = sym ? getDigits(sym) : 5;

  if (S.fredData && sym) {
    const tierData = calculateTierScores();
    s.macroScore    = tierData.totalScore;
    s.macroBias     = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
    s.agreeCount    = tierData.agreeCount;
    s.coherenceBonus= tierData.coherenceBonus;
    s.tiers = tierData.tiers.map(t => ({
      name: t.name, score: t.score, val: t.val, reading: t.reading
    }));
    const vol = calculateVolRegime();
    s.volRegime     = vol.regime;
    s.atrPct        = vol.percentile;
    s.atr           = vol.atr ? (vol.atr / pipSize).toFixed(1) + ' pips' : 'N/A';
    s.positionSize  = calcPositionSize(tierData.totalScore, vol);
  }

  if (quote) s.price = quote.price.toFixed(digits);

  const asia = S.asiaRangeData[sym];
  if (asia?.today) {
    s.asiaHigh      = asia.today.high.toFixed(digits);
    s.asiaLow       = asia.today.low.toFixed(digits);
    s.asiaRangePips = (asia.today.range / pipSize).toFixed(0);
    if (quote) {
      const p = quote.price;
      const pct = ((p - asia.today.low) / asia.today.range * 100).toFixed(1);
      s.priceVsAsia  = p > asia.today.high ? `ABOVE range (+${((p - asia.today.high)/pipSize).toFixed(1)}p)` :
                       p < asia.today.low  ? `BELOW range (${((p - asia.today.low)/pipSize).toFixed(1)}p)` :
                       `Inside range at ${pct}%`;
    }
  }
  if (asia?.yesterday) {
    s.asiaYestHigh = asia.yesterday.high.toFixed(digits);
    s.asiaYestLow  = asia.yesterday.low.toFixed(digits);
  }

  const monday = S.mondayRangeData[sym];
  if (monday?.current) {
    s.mondayHigh      = monday.current.high.toFixed(digits);
    s.mondayLow       = monday.current.low.toFixed(digits);
    s.mondayRangePips = (monday.current.range / pipSize).toFixed(0);
    if (quote) {
      const p = quote.price;
      const pct = ((p - monday.current.low) / monday.current.range * 100).toFixed(1);
      s.priceVsMonday = p > monday.current.high ? `ABOVE Monday range (+${((p - monday.current.high)/pipSize).toFixed(1)}p)` :
                        p < monday.current.low  ? `BELOW Monday range (${((p - monday.current.low)/pipSize).toFixed(1)}p)` :
                        `Inside Monday range at ${pct}%`;
    }
  }

  const piv = calculatePivots();
  s.pp = piv.pp?.toFixed(digits); s.r1 = piv.r1?.toFixed(digits); s.r2 = piv.r2?.toFixed(digits); s.r3 = piv.r3?.toFixed(digits);
  s.s1 = piv.s1?.toFixed(digits); s.s2 = piv.s2?.toFixed(digits); s.s3 = piv.s3?.toFixed(digits);

  if (quote && S.asiaRangeData[sym] && S.fredData) {
    const tierData = calculateTierScores();
    const vol = calculateVolRegime();
    const bias = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
    const all = [
      ...(asia?.confluences||[]).map(c=>({...c,source:'asia'})),
      ...(monday?.confluences||[]).map(c=>({...c,source:'monday'}))
    ];
    const enhanced = enhanceConfluences(all, quote.price, bias, piv, vol, tierData.totalScore);
    s.confluenceCount = enhanced.length;
    s.confluences = enhanced.slice(0, 10).map(c => ({
      price:     c.price.toFixed(digits),
      stars:     c.stars,
      tight:     c.isTight,
      distPips:  c.distance.toFixed(1),
      sources:   `${c.source === 'asia' ? 'Asia' : 'Monday'} SD${c.todayFib}/${c.yesterdayFib}`,
      direction: c.direction,
      aligned:   c.aligned,
      pivotMatch:c.pivotMatch
    }));
  }

  try {
    const store = JSON.parse(localStorage.getItem('oi_store') || '{}');
    const inst = store[sym] || null;
    if (inst) {
      let gammaFlip = null;
      if (inst.gexProfile && inst.gexProfile.length > 1) {
        for (let i = 1; i < inst.gexProfile.length; i++) {
          if (Math.sign(inst.gexProfile[i].netGex) !== Math.sign(inst.gexProfile[i-1].netGex)) {
            gammaFlip = inst.gexProfile[i].strike;
            break;
          }
        }
      }
      const gex = inst.exposures?.gex ?? 0;
      s.oi = {
        maxPain:     oiFmtStrike(inst.maxPain, sym),
        callWall:    oiFmtStrike(inst.callWall, sym),
        callWallOI:  oiFmtOI(inst.callWallOI),
        putWall:     oiFmtStrike(inst.putWall, sym),
        putWallOI:   oiFmtOI(inst.putWallOI),
        pcRatio:     inst.pcRatio?.toFixed(2),
        pcBias:      inst.pcRatio > 1.3 ? 'BEARISH (put-heavy — market hedged down)' : inst.pcRatio < 0.77 ? 'BULLISH (call-heavy — market positioned up)' : 'NEUTRAL',
        totalCallOI: oiFmtOI(inst.totalCallOI),
        totalPutOI:  oiFmtOI(inst.totalPutOI),
        totalCallChg:oiFmtChg(inst.totalCallChg),
        totalPutChg: oiFmtChg(inst.totalPutChg),
        gex:         (gex/1e9).toFixed(2) + 'Bn',
        dex:         inst.exposures?.dex ? inst.exposures.dex.toFixed(0) : 'N/A',
        gexRead:     gex > 0 ? 'Positive GEX — dealers long gamma, dampening moves, mean-reversion bias' : 'Negative GEX — dealers short gamma, amplifying moves, breakout risk',
        gammaFlip:   gammaFlip ? oiFmtStrike(gammaFlip, sym) : 'None detected',
        topLevels:   (inst.topLevels||[]).slice(0, 6).map(l => ({
          strike:  oiFmtStrike(l.strike, sym),
          callOI:  oiFmtOI(l.callOI),
          putOI:   oiFmtOI(l.putOI)
        }))
      };
      if (quote) s.oi.price = quote.price.toFixed(digits);
    }
  } catch(e) {}

  if (S.fredData) {
    s.vix     = S.fredData.vix?.value?.toFixed(1);
    s.vixPrev = S.fredData.vix?.prev?.toFixed(1);
    s.dxy     = S.fredData.dxy?.value?.toFixed(2);
    s.dxyPrev = S.fredData.dxy?.prev?.toFixed(2);
    s.nfci    = S.fredData.nfci?.value?.toFixed(2);
    s.tips    = S.fredData.tips?.value?.toFixed(2);
    s.bei     = S.fredData.bei?.value?.toFixed(2);
    const hyRaw = S.fredData.hy?.value;
    const hyPrevRaw = S.fredData.hy?.prev;
    s.hy      = hyRaw ? (hyRaw * 100).toFixed(0) : null;
    s.hyPrev  = hyPrevRaw ? (hyPrevRaw * 100).toFixed(0) : null;
    const us2y  = S.fredData.us2y?.value;
    const us10y = S.fredData.us10y?.value;
    if (us2y && us10y) {
      s.us2s10s   = ((us10y - us2y) * 100).toFixed(1);
      s.curveShape = parseFloat(s.us2s10s) < 0 ? 'INVERTED — recession signal, rate cut expectations dominant' :
                     parseFloat(s.us2s10s) < 50 ? 'FLAT — transition, weak growth expectations' :
                     'NORMAL (steep) — growth expectations, carry trades favoured';
    }
    const aud = S.fredData.aud_usd?.value, audP = S.fredData.aud_usd?.prev;
    const jpy = S.fredData.usd_jpy?.value, jpyP = S.fredData.usd_jpy?.prev;
    if (aud && jpy) s.audjpy = (aud * jpy).toFixed(2);
    if (audP && jpyP) s.audjpyPrev = (audP * jpyP).toFixed(2);

    const curves = getForeignCurves();
    s.foreignCurves = curves.map(c => `${c.name} ${c.spread >= 0 ? '+' : ''}${c.spread.toFixed(0)}bp (${c.status})`).join(' | ');
  }

  if (S.fredData) {
    const sent = calculateRiskSentiment();
    s.riskSentiment = `${sent.status} — AUD/JPY ${sent.audjpy.text}, HY ${sent.hy.text}, composite: ${sent.composite.toUpperCase()}`;
  }

  try {
    const vol = calculateVolRegime();
    if (vol.garch) {
      s.garch = {
        forecast:   vol.garch.pips.toFixed(0) + ' pips',
        ci68:       vol.garch.ci68Pips.toFixed(0) + ' pips',
        ci95:       vol.garch.ci95Pips.toFixed(0) + ' pips',
        cluster:    vol.garch.cluster,
        clusterMsg: vol.garch.clusterMsg,
        sigmaAnn:   vol.garch.sigmaAnnual.toFixed(1) + '%',
        usedToday:  vol.usedRangePips.toFixed(0) + ' pips (' + vol.usedPct + '% of 68% CI)',
        remaining:  vol.remainingPips.toFixed(0) + ' pips remaining today',
      };
    }
    const bars = S.ohlcData[sym]?.values;
    if (bars && bars.length >= 30) {
      const barsChron = [...bars].reverse();
      const trs = [];
      for (let i = 1; i < barsChron.length; i++) {
        const h = parseFloat(barsChron[i].high), l = parseFloat(barsChron[i].low), pc = parseFloat(barsChron[i-1].close);
        trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
      }
      const rt = computeRegimeTransition(trs.reverse());
      if (rt) {
        s.regimeTransition = {
          risk:             rt.transitionRisk,
          score:            rt.riskScore,
          consecutiveDays:  rt.consecutiveDays,
          regime:           rt.currentRegime,
          compressing:      rt.compressing,
          expanding:        rt.expanding,
          summary:          rt.riskText,
          detail:           rt.riskDetail,
        };
      }
    }
  } catch(e) {}

  try {
    const cData = S.compassData[sym];
    if (cData) {
      const arma = computeARMAForecast(cData);
      if (arma) {
        s.armaForecast = {
          direction:   arma.direction,
          confidence:  arma.confidence,
          skill:       arma.avgSkill + '% vs random walk',
          f1d:         arma.f10_1d != null ? (arma.f10_1d >= 0 ? '+' : '') + (arma.f10_1d * 100).toFixed(1) + 'bp (1-day)' : null,
          f5d:         arma.f10_5d != null ? (arma.f10_5d >= 0 ? '+' : '') + (arma.f10_5d * 100).toFixed(1) + 'bp (5-day)' : null,
          pairBias:    arma.direction === 'MIXED' ? 'Conflicting — no directional edge from spread forecast' :
                       arma.direction === 'BULLISH' ? `Spread forecast bullish for ${sym.split('/')[0]} over 5 days` :
                       `Spread forecast bearish for ${sym.split('/')[0]} over 5 days`,
          phi:         arma.arma10?.phi,
          theta:       arma.arma10?.theta,
        };
      }
    }
  } catch(e) {}

  try {
    if (quote && S.fredData) {
      const tierData = calculateTierScores();
      const vol = calculateVolRegime();
      const piv = calculatePivots();
      const as  = S.asiaRangeData[sym] || { today:null, yesterday:null, confluences:[] };
      const mo  = S.mondayRangeData[sym] || { current:null, previous:null, confluences:[] };
      const bias = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
      const all  = [...(as.confluences||[]).map(c=>({...c,source:'asia'})), ...(mo.confluences||[]).map(c=>({...c,source:'monday'}))];
      const filt = filterConfluences(all);
      const enh  = enhanceConfluences(filt, quote.price, bias, piv, vol, tierData.totalScore);
      const signal = runSignalEngine(S.compassData, vol);
      const entries = runEntryScanner(signal, enh, piv, as, mo, quote, vol);
      s.topEntries = entries.slice(0, 3).map(e => ({
        price:     e.price.toFixed(digits),
        direction: e.direction,
        stars:     e.totalStars,
        tags:      e.tags.map(t => t.label).join(', '),
        sl:        e.sl?.toFixed(digits),
        tp:        e.tp?.toFixed(digits),
        slPips:    e.slPips?.toFixed(0),
        tpPips:    e.tpPips?.toFixed(0),
        rr:        e.rrRatio,
        size:      e.size,
        tpNote:    e.tpNote,
        tpCapped:  e.tpCapped,
      }));
      s.spreadSignal = {
        bias:        signal.bias,
        type:        signal.type,
        score:       signal.score + '/' + signal.maxScore,
        fvPips:      signal.fvPips?.toFixed(0),
        fvBull:      signal.fvBull,
        lagDetected: signal.lagDetected,
      };
    }
  } catch(e) {}

  return s;
}

export async function triggerAIAnalysis() {
  const sym = S.currentPair?.symbol ?? 'Unknown';
  const btn = document.getElementById('aiAnalysisBtn');
  if (btn) { btn.classList.add('loading'); btn.querySelector('span:last-child').textContent = 'Analysing…'; }

  aiRenderCard('loading');

  try {
    const snapshot = aiCollectSnapshot();
    const res = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair: sym, snapshot })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(()=>'Unknown error');
      aiRenderCard('error', errTxt.slice(0, 300));
      return;
    }

    const data = await res.json();
    if (!data.ok || !data.analysis) {
      aiRenderCard('error', data.error || 'Empty response from Claude');
      return;
    }

    aiSaveCache(sym, data.analysis, data.generatedAt);
    aiRenderCard('data', data.analysis, data.generatedAt);
    const card = document.getElementById('aiAnalysisCard');
    if (card && !card.classList.contains('open')) card.classList.add('open');

  } catch(e) {
    aiRenderCard('error', e.message);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.querySelector('span:last-child').textContent = 'Analyse'; }
  }
}

export async function aiRenderCard(state, payload, generatedAt) {
  const el = document.getElementById('aiAnalysisSection');
  if (!el) return;

  if (state === undefined) {
    const cached = S.currentPair ? await aiLoadCache(S.currentPair.symbol) : null;
    if (cached) { state = 'data'; payload = cached.analysis; generatedAt = cached.generatedAt; }
    else { state = 'empty'; }
  }

  const stampStr = generatedAt
    ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  let bodyHtml = '';

  if (state === 'loading') {
    bodyHtml = `<div class="ai-loading"><div class="ai-spinner"></div>Sending all dashboard data to Claude…</div>`;
  }
  else if (state === 'error') {
    bodyHtml = `<div class="ai-error">⚠ Analysis failed: ${payload || 'Unknown error'}<br><br>
      Ensure <strong>ANT_KEY</strong> is set in Cloudflare Pages → Settings → Environment Variables (both Production &amp; Preview scopes).</div>`;
  }
  else if (state === 'empty') {
    bodyHtml = `<div class="ai-empty">
      Click <strong style="color:var(--purple)">🧠 Analyse</strong> in the toolbar to run a full AI analysis.<br><br>
      Reads: macro score, all 7 tiers, ranges, Fib confluences, OI/GEX, pivots, yield curve, vol regime, VIX, HY spreads, DXY, carry &amp; sentiment.
    </div>`;
  }
  else if (state === 'data' && payload) {
    const a = payload;
    const biasClass = a.overallBias === 'LONG' ? 'long' : a.overallBias === 'SHORT' ? 'short' : 'neutral';
    const convClass = (a.conviction || 'MEDIUM').toUpperCase();
    const regimeKey = 'regime-' + (a.regime?.label || 'CHOPPY').replace(/[\s/]+/g, '-').toUpperCase();

    const levelsHtml = (a.keyLevels || []).map(l => {
      const typeKey = 'ltype-' + (l.type || '').replace(/[\s/]+/g, '-').toUpperCase().slice(0, 15);
      return `<tr>
        <td>${l.price}</td>
        <td><span class="ai-level-type ${typeKey}">${l.type}</span></td>
        <td>${l.significance}</td>
      </tr>`;
    }).join('');

    const doList  = (a.goodToDoNow || []).map(x => `<li>${x}</li>`).join('');
    const badList = (a.avoidNow    || []).map(x => `<li>${x}</li>`).join('');
    const warnList= (a.riskWarnings|| []).map(x => `<li>${x}</li>`).join('');

    bodyHtml = `
      <div class="ai-verdict ${biasClass}">
        <div class="ai-verdict-bias">${a.overallBias || '—'}</div>
        <div class="ai-verdict-score"><span>${a.convictionScore ?? '—'}</span>/10</div>
        <div class="ai-verdict-headline">${a.headline || ''}</div>
        <div class="ai-conviction ${convClass}">${convClass}</div>
      </div>

      <div class="ai-sections">
        <div class="ai-section">
          <div class="ai-section-label">Regime</div>
          <div class="ai-regime-pill ${regimeKey}">${a.regime?.label || '—'}</div>
          <div class="ai-section-text">${a.regime?.detail || ''}</div>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">Macro Read</div>
          <div class="ai-section-text">${a.macroRead || ''}</div>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">Yield Curve</div>
          <div class="ai-section-text">${a.yieldCurveRead || ''}</div>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">OI / GEX / Positioning</div>
          <div class="ai-section-text">${a.oiRead || ''}</div>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">Sentiment &amp; Positioning</div>
          <div class="ai-section-text">${a.sentimentPositioning || ''}</div>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">Reflexivity</div>
          <div class="ai-section-text">${a.reflexivity || ''}</div>
        </div>
        ${a.garchRead ? `<div class="ai-section">
          <div class="ai-section-label">⚡ GARCH Vol Read</div>
          <div class="ai-section-text">${a.garchRead}</div>
        </div>` : ''}
        ${a.armaRead ? `<div class="ai-section">
          <div class="ai-section-label">📐 ARMA Spread Read</div>
          <div class="ai-section-text">${a.armaRead}</div>
        </div>` : ''}
        ${a.spreadSignalRead ? `<div class="ai-section">
          <div class="ai-section-label">📡 Spread Signal</div>
          <div class="ai-section-text">${a.spreadSignalRead}</div>
        </div>` : ''}
      </div>

      <div class="ai-section full" style="margin-bottom:8px">
        <div class="ai-section-label">Trading Framework</div>
        <div class="ai-section-text">${a.tradingFramework || ''}</div>
      </div>

      ${levelsHtml ? `
      <div class="ai-section full" style="margin-bottom:8px">
        <div class="ai-section-label">Key Levels</div>
        <table class="ai-levels-table">
          <thead><tr><th>Price</th><th>Type</th><th>Why it matters</th></tr></thead>
          <tbody>${levelsHtml}</tbody>
        </table>
      </div>` : ''}

      <div class="ai-sections">
        <div class="ai-section">
          <div class="ai-section-label">Breakout trigger</div>
          <div class="ai-section-text">${a.breakoutTrigger || ''}</div>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">Reversion trigger</div>
          <div class="ai-section-text">${a.reversionTrigger || ''}</div>
        </div>
      </div>

      <div class="ai-section full" style="margin-bottom:8px">
        <div class="ai-break-row">
          <span class="ai-break-label">Clean break potential</span>
          <span class="ai-break-pill bp-${(a.cleanBreakPotential||'MEDIUM').toUpperCase()}">${a.cleanBreakPotential || '—'}</span>
        </div>
        <div class="ai-section-text">${a.cleanBreakRationale || ''}</div>
      </div>

      <div class="ai-sections">
        <div class="ai-section">
          <div class="ai-section-label">✓ Good to do now</div>
          <ul class="ai-list good">${doList}</ul>
        </div>
        <div class="ai-section">
          <div class="ai-section-label">✕ Avoid now</div>
          <ul class="ai-list bad">${badList}</ul>
        </div>
      </div>

      ${warnList ? `
      <div class="ai-section full" style="margin-top:6px">
        <div class="ai-section-label">⚠ Risk warnings / invalidation</div>
        <ul class="ai-list warn">${warnList}</ul>
      </div>` : ''}

      <div style="text-align:right;margin-top:8px">
        <span style="font-size:10px;color:var(--text3)">Cached 1h · </span>
        <a href="#" onclick="window.triggerAIAnalysis();return false;" style="font-size:10px;color:var(--purple);text-decoration:none">↻ Refresh analysis</a>
      </div>
    `;
  }

  const isOpen = state === 'data' || state === 'loading';
  el.innerHTML = `
    <div class="ai-card ${isOpen ? 'open' : ''} ${state === 'data' ? 'has-data' : ''}" id="aiAnalysisCard">
      <div class="ai-card-header" onclick="document.getElementById('aiAnalysisCard').classList.toggle('open')">
        <span class="ai-card-title">🧠 AI Market Intelligence</span>
        ${stampStr ? `<span class="ai-card-stamp">${stampStr}</span>` : ''}
        <span class="ai-card-chevron">▼</span>
      </div>
      <div class="ai-card-body">${bodyHtml}</div>
    </div>
  `;
}

export function aiRenderCardOnUpdate() {
  const existing = document.getElementById('aiAnalysisCard');
  if (existing && existing.classList.contains('has-data')) return;
  aiRenderCard();
}
