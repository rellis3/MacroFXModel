import { S } from './state.js';
import { getDigits, getPipSize, getConfluenceThreshold, fred, fmt, filterTradingDays } from './utils.js';
import { calculateTierScores, computeDollarRegime, computeUSDStrength } from './macro.js';
import { calculateVolRegime, calcPositionSize, calculateRiskSentiment, getForeignCurves, calculatePivots, calculateDivergence } from './vol.js';
import { computeRegimeTransition, renderARMAAndTransition } from './arma.js';
import { filterConfluences, enhanceConfluences } from './confluences.js';
import { renderOISidebar } from './oi.js';
import { loadAndRenderCompass } from './compass.js';
import { renderSignalAndEntries } from './signal.js';
import { aiRenderCardOnUpdate } from './ai.js';
import { renderCOTCard, renderCOTCrossPair } from './cot.js';
import { sessionBadgeHTML } from './session.js';
import { eventRiskBadgeHTML, surpriseIndexHTML, getPairSurpriseScore } from './events.js';

export function renderAll() {
  try {
    return renderAllInner();
  } catch (err) {
    console.error('Render error:', err);
    document.getElementById('mainContent').innerHTML = `
      <div class="card" style="border-color:var(--red);background:var(--red-bg)">
        <div style="color:var(--red);font-weight:600;font-size:14px;margin-bottom:8px">⚠️ Render error</div>
        <div style="color:var(--text2);font-size:12px;font-family:'DM Mono',monospace;line-height:1.6">${err.message}</div>
        <div style="color:var(--text3);font-size:11px;margin-top:10px">Try clearing localStorage and reloading: open dev tools (F12) → Application → Local Storage → Clear All</div>
        <details style="margin-top:10px;font-size:10px;color:var(--text3)">
          <summary style="cursor:pointer">Stack trace</summary>
          <pre style="font-size:10px;margin-top:8px;white-space:pre-wrap;font-family:'DM Mono',monospace">${err.stack || err.message}</pre>
        </details>
      </div>
    `;
  }
}

function getYesterdayLevels() {
  const bars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  if (!bars || bars.length < 2) return { high: null, low: null };
  return {
    high:  parseFloat(bars[1].high),
    low:   parseFloat(bars[1].low),
    open:  parseFloat(bars[1].open),
  };
}

function getPrevWeekLevels() {
  const bars = S.ohlc30m[S.currentPair.symbol]?.values;
  if (!bars?.length) return { high: null, low: null };

  function weekKey(bar) {
    const d = new Date(bar.datetime.replace(' ', 'T') + 'Z');
    const day = d.getUTCDay() || 7;
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (day - 1));
    return mon.toISOString().split('T')[0];
  }

  const weeks = {};
  bars.forEach(bar => {
    const wk = weekKey(bar);
    if (!weeks[wk]) weeks[wk] = { high: -Infinity, low: Infinity };
    const h = parseFloat(bar.high), l = parseFloat(bar.low);
    if (h > weeks[wk].high) weeks[wk].high = h;
    if (l < weeks[wk].low)  weeks[wk].low  = l;
  });

  const sorted = Object.keys(weeks).sort().reverse();
  if (sorted.length < 2) return { high: null, low: null };
  const prevWeek = weeks[sorted[1]];
  return {
    high: prevWeek.high,
    low:  prevWeek.low,
    weekDate: sorted[1],
  };
}

function getRoundNumberLevels(price, symbol) {
  if (!price) return [];
  const pipSize = getPipSize(symbol);
  const isGold  = symbol.includes('XAU');
  const isJPY   = symbol.includes('JPY');
  const spacing = isGold ? 5.0 : isJPY ? 0.5 : 0.005;
  const base = Math.floor(price / spacing) * spacing;
  const levels = [];
  for (let i = -3; i <= 3; i++) {
    const lvl = parseFloat((base + i * spacing).toFixed(isGold ? 0 : isJPY ? 2 : 4));
    if (Math.abs(lvl - price) > 0.0001) levels.push(lvl);
  }
  return levels;
}

function getCalendarContext() {
  const now   = new Date();
  const day   = now.getDate();
  const month = now.getMonth();
  const dow   = now.getDay();
  const year  = now.getFullYear();

  const warnings = [];
  let level = 'none';

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day >= daysInMonth - 3 && day <= daysInMonth) {
    warnings.push('📅 Month-end: pension/fund rebalancing flows dominant — reduce confluence conviction');
    level = 'caution';
  }

  let friCount = 0, thirdFriday = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === 5) {
      friCount++;
      if (friCount === 3) { thirdFriday = d; break; }
    }
  }
  if (thirdFriday) {
    const opexFriDate   = new Date(year, month, thirdFriday);
    const opexMonDate   = new Date(opexFriDate); opexMonDate.setDate(thirdFriday - 4);
    const todayMidnight = new Date(year, month, day);
    if (todayMidnight >= opexMonDate && todayMidnight <= opexFriDate) {
      warnings.push('⚙️ OpEx week: gamma hedging flows may override technical setups — wait for clean breaks');
      level = level === 'none' ? 'caution' : 'warning';
    }
  }

  if ([2, 5, 8, 11].includes(month) && day >= daysInMonth - 7) {
    warnings.push('📊 Quarter-end: institutional rebalancing and window-dressing — expect erratic flows');
    level = 'warning';
  }

  return { warnings, level };
}

function renderAllInner() {
  const quote = window._latestQuote;
  if (!quote) throw new Error('Quote not loaded');
  if (!S.fredData) throw new Error('FRED data not loaded');

  const tierData = calculateTierScores();
  const volRegime = calculateVolRegime();
  const pivots = calculatePivots();
  const asia = S.asiaRangeData[S.currentPair.symbol] || { today: null, yesterday: null, confluences: [] };
  const monday = S.mondayRangeData[S.currentPair.symbol] || { current: null, previous: null, confluences: [] };
  const sentiment = calculateRiskSentiment();
  const curves = getForeignCurves();

  let transitionRisk = null;
  const _trBars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  if (_trBars && _trBars.length >= 30) {
    const _trChron = [..._trBars].reverse();
    const _trTRs = [];
    for (let i = 1; i < _trChron.length; i++) {
      const h = parseFloat(_trChron[i].high), l = parseFloat(_trChron[i].low), pc = parseFloat(_trChron[i-1].close);
      _trTRs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    transitionRisk = computeRegimeTransition(_trTRs.reverse());
  }

  const divergence = calculateDivergence(tierData.totalScore, volRegime);

  const yesterdayLvls  = getYesterdayLevels();
  const prevWeekLvls   = getPrevWeekLevels();
  const roundNums      = getRoundNumberLevels(quote.price, S.currentPair.symbol);
  const calendarCtx    = getCalendarContext();

  const macroBias = tierData.totalScore > 4 ? 'LONG' : tierData.totalScore < -4 ? 'SHORT' : 'NEUTRAL';
  const _rawSize      = calcPositionSize(tierData.totalScore, volRegime, transitionRisk);
  const _sessionConf  = S.sessionData?.confidence ?? 1.0;
  const _eventMult    = S.eventRisk?.sizeMult ?? 1.0;
  const positionSize  = Math.max(10, Math.round(_rawSize * _sessionConf * _eventMult));

  const allConfluences = [
    ...(asia.confluences || []).map(c => ({...c, source: 'asia'})),
    ...(monday.confluences || []).map(c => ({...c, source: 'monday'}))
  ];
  const filtered = filterConfluences(allConfluences);
  const enhanced = enhanceConfluences(filtered, quote.price, macroBias, pivots, volRegime, tierData.totalScore);
  enhanced.sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    return a.distance - b.distance;
  });

  const biasClass = macroBias === 'LONG' ? 'b-bull' : macroBias === 'SHORT' ? 'b-bear' : 'b-neu';
  const biasText = macroBias === 'LONG' ? '↑ ' : macroBias === 'SHORT' ? '↓ ' : '— ';
  const digits = getDigits(S.currentPair.symbol);
  const pipSize = getPipSize(S.currentPair.symbol);

  // New feature data
  const usdStrength   = S.usdStrength  || computeUSDStrength();
  const dollarRegime  = S.dollarRegime || computeDollarRegime();
  const pairSurprise  = getPairSurpriseScore();
  const sessionBadge  = sessionBadgeHTML(S.sessionData, quote.price);
  const eventBadge    = eventRiskBadgeHTML(S.eventRisk);
  const surpriseBadge = (S.surpriseIndex && Object.keys(S.surpriseIndex).length > 0)
    ? surpriseIndexHTML(S.surpriseIndex, pairSurprise) : '';

  // Vol impulse pill for display in header
  const volImpulsePill = (() => {
    const vi = volRegime.volImpulse;
    if (!vi) return '';
    const col = vi.bias === 'expanding' ? 'var(--red)' : vi.bias === 'contracting' ? 'var(--blue)' : 'var(--text3)';
    const icon = vi.bias === 'expanding' ? '↑' : vi.bias === 'contracting' ? '↓' : '→';
    return ` · Vol Impulse ${icon} ${vi.bias} (${vi.pct >= 0 ? '+' : ''}${vi.pct.toFixed(0)}%)`;
  })();

  // Dollar regime pill
  const dregPill = dollarRegime
    ? ` · DXY ${dollarRegime.label}`
    : '';

  const html = `
<!-- SESSION BADGE -->
${sessionBadge}

<!-- RISK SENTIMENT TRAFFIC LIGHT -->
<div class="risk-bar">
  <div class="risk-card ${sentiment.audjpy.status}">
    <div class="rc-light">${sentiment.audjpy.status === 'on' ? '🟢' : sentiment.audjpy.status === 'off' ? '🔴' : '🟡'}</div>
    <div class="rc-body">
      <div class="rc-title">AUD/JPY Carry</div>
      <div class="rc-status ${sentiment.audjpy.status}">${sentiment.audjpy.text}</div>
      <div class="rc-detail">${sentiment.audjpy.trend >= 0 ? '+' : ''}${sentiment.audjpy.trend.toFixed(2)}% — risk-on/off proxy</div>
    </div>
  </div>
  <div class="risk-card ${sentiment.hy.status}">
    <div class="rc-light">${sentiment.hy.status === 'on' ? '🟢' : sentiment.hy.status === 'off' ? '🔴' : '🟡'}</div>
    <div class="rc-body">
      <div class="rc-title">HY Credit Spreads</div>
      <div class="rc-status ${sentiment.hy.status}">${sentiment.hy.text}</div>
      <div class="rc-detail">${sentiment.hy.change >= 0 ? '+' : ''}${sentiment.hy.change.toFixed(0)}bp — credit leads equities</div>
    </div>
  </div>
  <div class="risk-card ${sentiment.composite}">
    <div class="rc-light">${sentiment.composite === 'on' ? '🟢' : sentiment.composite === 'off' ? '🔴' : '🟡'}</div>
    <div class="rc-body">
      <div class="rc-title">Composite Risk</div>
      <div class="rc-status ${sentiment.composite}">${sentiment.status}</div>
      <div class="rc-detail">${sentiment.text}</div>
    </div>
  </div>
</div>

<!-- DIVERGENCE FLAG -->
${divergence ? `
<div class="div-flag show">
  <div class="df-icon">⚠️</div>
  <div>
    <div class="df-title">${divergence.title}</div>
    <div class="df-text">${divergence.text}</div>
  </div>
</div>` : ''}

<!-- CALENDAR CONTEXT BANNER -->
${calendarCtx.warnings.length > 0 ? `
<div style="background:var(--amber-bg);border:1.5px solid var(--amber-bd);border-radius:var(--r);padding:9px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px">
  <div style="font-size:18px;line-height:1;flex-shrink:0">🗓️</div>
  <div style="flex:1">
    ${calendarCtx.warnings.map(w => `<div style="font-size:11.5px;color:var(--amber);font-weight:500;line-height:1.5">${w}</div>`).join('')}
  </div>
</div>` : ''}

<div class="main-grid">

  <!-- LEFT COLUMN -->
  <div>
    <!-- HEADER CARD -->
    <div class="card card-lg">
      <div class="hd-top">
        <div>
          <div class="pair-title">${S.currentPair.symbol.split('/')[0]}<span class="q">/</span>${S.currentPair.symbol.split('/')[1] || ''}</div>
          <div class="pair-meta">Vol: ${volRegime.regime} (${volRegime.percentile}th pct) · ATR ${volRegime.atrPips.toFixed(0)}p${volRegime.garch ? ' · GARCH ' + volRegime.garch.pips.toFixed(0) + 'p [68%: ' + volRegime.ci68Pips.toFixed(0) + 'p]' : ''}${volImpulsePill}${dregPill} · ${tierData.agreeCount}/7 tiers agree</div>
          <div class="bias-badge ${biasClass}">${biasText}${macroBias} · ${Math.abs(tierData.totalScore) >= 9 ? 'HIGH' : Math.abs(tierData.totalScore) >= 5 ? 'MED' : 'LOW'} CONVICTION</div>
        </div>
        <div class="hd-right">
          <div class="score-num" style="color:${tierData.totalScore > 0 ? 'var(--green)' : tierData.totalScore < 0 ? 'var(--red)' : 'var(--amber)'}">
            ${tierData.totalScore > 0 ? '+' : ''}${tierData.totalScore}
          </div>
          <div class="score-sub">out of ±${tierData.maxScore}</div>
          <div class="live-lbl">Live Price</div>
          <div class="price-num">${quote.price.toFixed(digits)}</div>
        </div>
      </div>

      <!-- POSITION SIZE BAR -->
      <div class="size-section">
        <div class="size-row">
          <span class="size-lbl">Recommended Size</span>
          <span class="size-pct" style="color:${positionSize >= 75 ? 'var(--green)' : positionSize >= 50 ? 'var(--blue)' : positionSize >= 25 ? 'var(--amber)' : 'var(--red)'}">${positionSize}%</span>
        </div>
        <div class="size-track">
          <div class="size-fill" style="width:${positionSize}%;background:${positionSize >= 75 ? 'var(--green)' : positionSize >= 50 ? 'var(--blue)' : positionSize >= 25 ? 'var(--amber)' : 'var(--red)'}"></div>
        </div>
        <div class="size-desc">
          ${tierData.totalScore >= 13 ? 'Maximum conviction — full size justified' :
            tierData.totalScore >= 9 ? 'High conviction — strong setup' :
            tierData.totalScore >= 5 ? 'Medium conviction — moderate size' :
            tierData.totalScore >= -4 && tierData.totalScore <= 4 ? 'Low conviction — minimum exposure or skip' :
            tierData.totalScore <= -13 ? 'Maximum conviction (short) — full size justified' :
            tierData.totalScore <= -9 ? 'High conviction (short) — strong setup' :
            'Medium conviction (short) — moderate size'}
          ${volRegime.regime === 'HIGH' ? ' · Vol HIGH → reduced 40%' : volRegime.regime === 'LOW' ? ' · Vol LOW' : ' · Vol normal'}
          ${_sessionConf < 0.85 ? ` · ${S.sessionData?.name ?? 'Session'} → ${Math.round(_sessionConf*100)}% conf` : ''}
          ${_eventMult < 1.0 ? ` · Event risk → ${Math.round(_eventMult*100)}%` : ''}
        </div>
      </div>

      <!-- COHERENCE DOTS -->
      <div class="coh-row">
        <span class="coh-lbl">Tier coherence</span>
        <div class="coh-dots">
          ${tierData.tiers.map(t => `<div class="cdot ${t.score > 0 ? 'bull' : t.score < 0 ? 'bear' : 'neu'}" title="${t.name}: ${t.score >= 0 ? '+' : ''}${t.score}">${t.tier.replace('T','')}</div>`).join('')}
        </div>
        <div class="coh-note">${tierData.agreeCount}/7 ${tierData.coherenceBonus !== 0 ? '(+1 bonus)' : ''}</div>
      </div>
    </div>

    <!-- 7-TIER BREAKDOWN -->
    <div class="sec-lbl">
      Macro Score Breakdown
      <span class="sec-badge">7 TIERS</span>
    </div>
    <div class="tier-grid">
      ${tierData.tiers.map(t => `
        <div class="tc ${t.score > 0 ? 'bull' : t.score < 0 ? 'bear' : 'neu'}">
          <div class="tc-head">
            <div>
              <div class="tc-tier">${t.tier} · max ±${t.max}</div>
              <div class="tc-name">${t.name}</div>
            </div>
            <div class="tc-badge ${t.score > 0 ? 'bull' : t.score < 0 ? 'bear' : 'neu'}">${t.score >= 0 ? '+' : ''}${t.score}</div>
          </div>
          <div class="tc-val ${t.score > 0 ? 'up' : t.score < 0 ? 'dn' : t.na ? 'na' : 'neu'}">${t.val}</div>
          <div class="tc-read">${t.reading}</div>
          ${t.momentumBonus && t.momentumBonus !== 0 ? `<div style="font-size:9px;color:${t.momentumBonus > 0 ? 'var(--green)' : 'var(--amber)'};margin-top:2px;font-weight:600">Compass mom ${t.momentumBonus > 0 ? '+1 confirms' : '−1 conflicts'}</div>` : ''}
          <div class="tc-src">${t.source}${t.isMonthly ? '<span class="tc-monthly">MONTHLY</span>' : ''}</div>
        </div>
      `).join('')}
    </div>

    <!-- DOLLAR REGIME + EVENT RISK + SURPRISE INDEX -->
    ${dollarRegime || S.eventRisk || surpriseBadge ? `
    <div class="sec-lbl">
      Market Context
      <span class="sec-badge">INTELLIGENCE</span>
    </div>
    ${usdStrength || dollarRegime ? (() => {
      const usd  = usdStrength;
      const dr   = dollarRegime;
      const col  = (usd?.trend || dr?.trend) === 'strengthening' ? 'var(--red)'
                 : (usd?.trend || dr?.trend) === 'weakening'     ? 'var(--green)'
                 : 'var(--text2)';
      const lbl  = usd?.label || dr?.label || '—';
      const bars = usd?.contributions || [];
      return `
    <div style="padding:9px 12px;background:var(--s2);border:1px solid var(--border);border-radius:7px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${bars.length ? 6 : 0}px">
        <span style="font-size:15px">💵</span>
        <span style="font-size:11px;font-weight:700;color:${col};flex:1">${lbl}</span>
        ${dr?.dxy ? `<span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">DXY ${dr.dxy} ${dr.change >= 0 ? '+' : ''}${dr.change}%</span>` : ''}
        ${usd?.fredConflict ? `<span style="font-size:9px;color:var(--amber);font-weight:700;padding:1px 5px;background:var(--amber-bg);border:1px solid var(--amber-bd);border-radius:4px">FRED diverges</span>` : ''}
      </div>
      ${bars.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
        ${bars.map(c => {
          const cCol = c.z > 0.3 ? 'var(--red)' : c.z < -0.3 ? 'var(--green)' : 'var(--text3)';
          const pair = c.sym.split('/').join('');
          return `<span style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 6px;background:${cCol}18;border:1px solid ${cCol}44;border-radius:4px;color:${cCol}">${pair} z:${c.z >= 0 ? '+' : ''}${c.z.toFixed(2)}</span>`;
        }).join('')}
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">
        ${S.currentPair?.isGold ? 'Gold: USD strength = headwind for gold' :
          S.currentPair?.isUsdBase ? 'USD-base pair: USD strength = bullish' :
          'USD-quote pair: USD strength = bearish'}
        ${usd?.pairsUsed < 4 ? ` · Load more pairs for full ${usd?.pairsUsed}/4 composite` : ''}
      </div>` : '<div style="font-size:10px;color:var(--text3)">Load daily bars for 2+ USD pairs to compute composite</div>'}
    </div>`;
    })() : ''}
    ${eventBadge}
    ${surpriseBadge}
    ` : ''}

    <!-- MACRO COMPASS -->
    <div class="sec-lbl">
      Macro Compass
      <span class="sec-badge purple">YIELD SPREAD vs FX</span>
    </div>
    <div class="compass-card">
      <div id="compassCard"><div class="compass-loading">⏳ Loading…</div></div>
    </div>

    <!-- SIGNAL ENGINE -->
    <div class="sec-lbl">
      Macro Signal
      <span class="sec-badge purple">SPREAD ENGINE</span>
    </div>
    <div id="signalEngineCard"></div>

    <!-- ENTRY SCANNER -->
    <div class="sec-lbl">
      High Confluence Entries
      <span class="sec-badge green">MULTI-LAYER</span>
      <span id="entryScannerCount" class="count-badge" style="display:none"></span>
    </div>
    <div class="hint" style="margin-bottom:8px">
      <strong>How entry stars work:</strong> ⭐ Fib confluence · +⭐ tight · +⭐ macro bias · +⭐ pivot · +⭐ OI wall · +⭐ signal aligned · +⭐ gamma flip / range boundary. Max 7⭐. More sources = higher probability.
    </div>
    <div id="entryScannerCard"></div>

    <!-- CONFLUENCES -->
    <div class="sec-lbl">
      Fib Confluences
      <span class="sec-badge purple">TIER 2</span>
      <span class="count-badge">${enhanced.length}</span>
    </div>

    <div class="hint">
      <strong>How stars work:</strong> ⭐ = Confluence detected · ⭐⭐ = Tight (within 0.2 pips) · ⭐⭐⭐ = Direction matches macro bias · ⭐⭐⭐⭐ = Also near a daily pivot. Trade ⭐⭐⭐+ setups for highest probability. Position size auto-adjusts: ${positionSize}% base, ×0.5 if not aligned.
    </div>

    <div class="legend">
      <div class="lg-item"><div class="lg-bar green"></div>Tight (<${(getConfluenceThreshold(S.currentPair.symbol) * 0.1).toFixed(1)} pips)</div>
      <div class="lg-item"><div class="lg-bar orange"></div>Normal (<${getConfluenceThreshold(S.currentPair.symbol)} pips)</div>
      <div class="lg-item">📍 Asia · 🗓️ Monday</div>
    </div>

    <div class="card">
      ${enhanced.length > 0 ? renderConfluences(enhanced, quote.price, pipSize, digits) :
        `<div class="empty-state">
          <div class="em-icon">🎯</div>
          <div>No ${S.currentMode === 'strongest' ? 'tight' : ''} confluences detected.</div>
          <div style="font-size:11px;margin-top:5px">Try switching to <strong>Strong</strong> or <strong>All Levels</strong> mode.</div>
        </div>`}
    </div>
  </div>

  <!-- RIGHT SIDEBAR -->
  <div>
    <!-- ASIA RANGE -->
    <div class="sec-lbl">
      Asia Session
      <span class="sec-badge">00:00-06:00 UK</span>
    </div>
    <div class="card" style="margin-bottom:8px">
      <div class="range-box">
        <div class="rb-item">
          <div class="rb-lbl">High (body)</div>
          <div class="rb-val" style="color:var(--red)">${asia.today ? asia.today.high.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Low (body)</div>
          <div class="rb-val" style="color:var(--green)">${asia.today ? asia.today.low.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Range</div>
          <div class="rb-val">${asia.today ? (asia.today.range / pipSize).toFixed(0) + 'p' : '—'}</div>
        </div>
      </div>
      ${asia.today ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;padding:0 4px">${asia.today.date} · ${asia.today.barCount} bars</div>` : ''}
    </div>
    <div class="card" style="margin-bottom:16px;background:var(--card-dim)">
      <div class="range-box">
        <div class="rb-item">
          <div class="rb-lbl">Prev High</div>
          <div class="rb-val" style="color:var(--text2)">${asia.yesterday ? asia.yesterday.high.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Prev Low</div>
          <div class="rb-val" style="color:var(--text2)">${asia.yesterday ? asia.yesterday.low.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Prev Range</div>
          <div class="rb-val" style="color:var(--text2)">${asia.yesterday ? (asia.yesterday.range / pipSize).toFixed(0) + 'p' : '—'}</div>
        </div>
      </div>
      ${asia.yesterday ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;padding:0 4px">${asia.yesterday.date} · ${asia.yesterday.barCount} bars</div>` : ''}
    </div>

    <!-- MONDAY RANGE -->
    <div class="sec-lbl">
      Monday Range
      <span class="sec-badge purple">WEEKLY</span>
    </div>
    <div class="card" style="margin-bottom:8px">
      <div class="range-box">
        <div class="rb-item">
          <div class="rb-lbl">High (body)</div>
          <div class="rb-val" style="color:var(--red)">${monday.current ? monday.current.high.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Low (body)</div>
          <div class="rb-val" style="color:var(--green)">${monday.current ? monday.current.low.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Range</div>
          <div class="rb-val">${monday.current ? (monday.current.range / pipSize).toFixed(0) + 'p' : '—'}</div>
        </div>
      </div>
      ${monday.current ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;padding:0 4px">${monday.current.date} · ${monday.current.barCount} bars</div>` : ''}
    </div>
    <div class="card" style="margin-bottom:16px;background:var(--card-dim)">
      <div class="range-box">
        <div class="rb-item">
          <div class="rb-lbl">Prev High</div>
          <div class="rb-val" style="color:var(--text2)">${monday.previous ? monday.previous.high.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Prev Low</div>
          <div class="rb-val" style="color:var(--text2)">${monday.previous ? monday.previous.low.toFixed(digits) : '—'}</div>
        </div>
        <div class="rb-item">
          <div class="rb-lbl">Prev Range</div>
          <div class="rb-val" style="color:var(--text2)">${monday.previous ? (monday.previous.range / pipSize).toFixed(0) + 'p' : '—'}</div>
        </div>
      </div>
      ${monday.previous ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;padding:0 4px">${monday.previous.date} · ${monday.previous.barCount} bars</div>` : ''}
    </div>

    <!-- CME OPEN INTEREST -->
    <div class="sec-lbl">CME Open Interest <span class="sec-badge purple">OI</span></div>
    <div style="margin-bottom:16px">${(()=>{ try { return renderOISidebar(); } catch(e) { console.error('OI render error:',e); return '<div class="oi-empty">OI display error — try re-pasting data.</div>'; } })()}</div>

    <!-- DAILY PIVOTS -->
    <div class="sec-lbl">Daily Pivots <span class="sec-badge amber">CONFLUENCE</span></div>
    <div class="card" style="margin-bottom:8px">
      <div class="piv-list">${renderPivots(pivots, quote.price, pipSize, digits)}</div>
    </div>

    <!-- STRUCTURAL LEVELS -->
    <div class="sec-lbl">Structural Levels <span class="sec-badge green">KEY</span></div>
    <div class="card" style="margin-bottom:8px">
      ${(() => {
        const rows = [];
        if (yesterdayLvls.high != null) {
          const dH = Math.abs(quote.price - yesterdayLvls.high) / pipSize;
          const dL = Math.abs(quote.price - yesterdayLvls.low)  / pipSize;
          rows.push(`<div class="piv-row r"><span class="piv-lbl" style="width:80px">Yest H</span><span class="piv-val">${yesterdayLvls.high.toFixed(digits)}</span><span class="piv-dist">${quote.price < yesterdayLvls.high ? '↑' : '↓'}${dH.toFixed(0)}p</span></div>`);
          rows.push(`<div class="piv-row s"><span class="piv-lbl" style="width:80px">Yest L</span><span class="piv-val">${yesterdayLvls.low.toFixed(digits)}</span><span class="piv-dist">${quote.price < yesterdayLvls.low ? '↑' : '↓'}${dL.toFixed(0)}p</span></div>`);
        }
        if (prevWeekLvls.high != null) {
          const dH = Math.abs(quote.price - prevWeekLvls.high) / pipSize;
          const dL = Math.abs(quote.price - prevWeekLvls.low)  / pipSize;
          rows.push(`<div class="piv-row r"><span class="piv-lbl" style="width:80px">PW High</span><span class="piv-val">${prevWeekLvls.high.toFixed(digits)}</span><span class="piv-dist">${quote.price < prevWeekLvls.high ? '↑' : '↓'}${dH.toFixed(0)}p</span></div>`);
          rows.push(`<div class="piv-row s"><span class="piv-lbl" style="width:80px">PW Low</span><span class="piv-val">${prevWeekLvls.low.toFixed(digits)}</span><span class="piv-dist">${quote.price < prevWeekLvls.low ? '↑' : '↓'}${dL.toFixed(0)}p</span></div>`);
        }
        if (roundNums.length) {
          const above = roundNums.filter(r => r > quote.price).slice(0, 2);
          const below = roundNums.filter(r => r < quote.price).slice(-2).reverse();
          [...above, ...below].forEach(r => {
            const d = Math.abs(quote.price - r) / pipSize;
            if (d < 3) return;
            const isAbove = r > quote.price;
            rows.push(`<div class="piv-row" style="color:var(--text2)"><span class="piv-lbl" style="width:80px;font-size:10px">Round</span><span class="piv-val">${r.toFixed(digits)}</span><span class="piv-dist">${isAbove ? '↑' : '↓'}${d.toFixed(0)}p</span></div>`);
          });
        }
        return rows.length
          ? `<div class="piv-list">${rows.join('')}</div>`
          : `<div style="font-size:11px;color:var(--text3);padding:6px 0">No structural level data available</div>`;
      })()}
    </div>

    <!-- YIELD CURVES -->
    <div class="sec-lbl">Yield Curves <span class="sec-badge">2s10s</span></div>
    <div class="card" style="margin-bottom:8px">
      ${curves.map(c => `
        <div class="curve-row">
          <div class="curve-lbl">
            <div class="curve-flag">${c.flag}</div>
            ${c.name} ${c.monthly ? '<span class="tc-monthly">MO</span>' : ''}
          </div>
          <div class="curve-spread" style="color:${c.spread < 0 ? 'var(--red)' : c.spread < 50 ? 'var(--amber)' : 'var(--green)'}">${c.spread >= 0 ? '+' : ''}${c.spread.toFixed(0)}bp</div>
          <div class="curve-status ${c.statusClass}">${c.status}</div>
        </div>
      `).join('')}
    </div>

    <!-- MACRO SNAPSHOT -->
    <div class="sec-lbl">Macro Snapshot</div>
    <div class="card">
      ${(() => {
        const vix = fred('vix');
        const dxy = fred('dxy');
        const hy = fred('hy');
        const nfci = fred('nfci');
        const tips = fred('tips');
        const bei = fred('bei');
        const us2y = fred('us2y');
        const us10y = fred('us10y');
        const hyBp = hy != null ? hy * 100 : null;
        return `
          <div class="mrow"><span class="mrow-n">VIX</span><span class="mrow-v ${vix == null ? '' : vix > 25 ? 'vd' : vix < 15 ? 'vu' : 'vn'}">${fmt(vix, 1)}</span></div>
          <div class="mrow"><span class="mrow-n">US 10Y</span><span class="mrow-v vp">${fmt(us10y, 2, '%')}</span></div>
          <div class="mrow"><span class="mrow-n">US 2Y</span><span class="mrow-v vp">${fmt(us2y, 2, '%')}</span></div>
          <div class="mrow"><span class="mrow-n">DXY</span><span class="mrow-v vp">${fmt(dxy, 2)}</span></div>
          <div class="mrow"><span class="mrow-n">HY OAS</span><span class="mrow-v ${hyBp == null ? '' : hyBp > 500 ? 'vd' : 'vu'}">${fmt(hyBp, 0, 'bp')}</span></div>
          <div class="mrow"><span class="mrow-n">NFCI</span><span class="mrow-v ${nfci == null ? '' : nfci > 0 ? 'vd' : 'vu'}">${fmt(nfci, 2)}</span></div>
          <div class="mrow"><span class="mrow-n">10Y TIPS</span><span class="mrow-v vp">${fmt(tips, 2, '%')}</span></div>
          <div class="mrow"><span class="mrow-n">Breakeven</span><span class="mrow-v vp">${fmt(bei, 2, '%')}</span></div>
        `;
      })()}
    </div>

    <!-- COT POSITIONING -->
    <div class="sec-lbl">COT Positioning <span class="sec-badge purple">CFTC</span></div>
    <div class="card" style="margin-bottom:8px">${renderCOTCard(S.currentPair.symbol)}</div>
    <div class="sec-lbl">Cross-Pair COT <span class="sec-badge">SPECS</span></div>
    <div class="card" style="margin-bottom:16px">${renderCOTCrossPair()}</div>

    <!-- AI ANALYSIS -->
    <div class="sec-lbl">AI Analysis <span class="sec-badge purple">CLAUDE</span></div>
    <div id="aiAnalysisSection" style="margin-bottom:8px"></div>

  </div>
</div>
  `;

  document.getElementById('mainContent').innerHTML = html;
  document.getElementById('upd').textContent = new Date().toLocaleTimeString();
  aiRenderCardOnUpdate();
  loadAndRenderCompass();
  renderARMAAndTransition(S.compassData[S.currentPair.symbol] || null);
  renderSignalAndEntries(enhanced, pivots, asia, monday, quote, volRegime);
}

export function renderConfluences(confluences, currentPrice, pipSize, digits) {
  return `<div class="conf-list">${confluences.slice(0, 12).map(c => {
    const above = currentPrice < c.price;
    const isClose = c.distance < 30;
    const dirIcon = c.direction === 'long'  ? '↓ BUY @' :
                    c.direction === 'short' ? '↑ SELL @' :
                                              '◎ AT';
    const dirText = c.direction === 'long'  ? 'BUY' :
                    c.direction === 'short' ? 'SELL' :
                                              'AT';
    const dirClass = c.direction || 'neutral';
    const stars = '⭐'.repeat(c.stars);

    return `
<div class="conf-item ${c.isTight ? 'tight' : 'normal'}">
  <div class="ci-row">
    <div class="ci-quality">
      <div class="ci-q-icon">${c.isTight ? '🟢' : '🟠'}</div>
      <div class="ci-stars">${stars}</div>
      <div class="ci-q-text">${c.stars}/5</div>
    </div>
    <div class="ci-price-block">
      <div class="ci-price">${c.price.toFixed(digits)}</div>
      <div class="ci-meta">${c.pipDiff.toFixed(2)}p apart · SD ${c.todayFib} / ${c.yesterdayFib}${(c.density||1) >= 2 ? ` · <span class="ci-density">${c.density}× cluster</span>` : ''}</div>
    </div>
    <div class="ci-dir ${dirClass}">${dirIcon} ${dirText}</div>
    <div class="ci-source ${c.source}">${c.source === 'asia' ? '📍 Asia' : '🗓️ Monday'}</div>
    <div class="ci-distance ${isClose ? 'close' : ''}">${above ? '↑' : '↓'} ${c.distance.toFixed(0)}p</div>
    ${c.aligned ? '<div class="ci-aligned">✓ Aligned</div>' : ''}
    ${c.pivotMatch ? `<div class="ci-pivot">📍 ${c.pivotMatch}</div>` : ''}
    <div class="ci-size">${c.size}%</div>
  </div>
  ${c.direction ? `<div class="ci-trade-row">
    <span><strong>Entry:</strong> ${c.price.toFixed(digits)}</span>
    <span><strong>SL:</strong> ${c.sl.toFixed(digits)} (${c.stopPips.toFixed(0)}p)</span>
    <span><strong>TP:</strong> ${c.tp.toFixed(digits)} (${c.tpPips.toFixed(0)}p${c.tpSource ? ' · ' + c.tpSource : ''})</span>
    <span><strong>R:R:</strong> 1:${c.rrRaw || '—'}${c.poorRR ? ' ⚠' : ''}</span>
  </div>` : `<div class="ci-trade-row" style="opacity:.6">
    <span><em>Price sitting on level — wait for break above (BUY zone) or below (SELL zone)</em></span>
  </div>`}
</div>`;
  }).join('')}</div>`;
}

export function renderPivots(pivots, currentPrice, pipSize, digits) {
  const order = [
    { key: 'r3', label: 'R3', cls: 'r' },
    { key: 'r2', label: 'R2', cls: 'r' },
    { key: 'r1', label: 'R1', cls: 'r' },
    { key: 'pp', label: 'PIVOT', cls: 'p' },
    { key: 's1', label: 'S1', cls: 's' },
    { key: 's2', label: 'S2', cls: 's' },
    { key: 's3', label: 'S3', cls: 's' }
  ];
  return order.map(({key, label, cls}) => {
    const val = pivots[key];
    const dist = Math.abs(currentPrice - val) / pipSize;
    const above = currentPrice < val;
    return `<div class="piv-row ${cls}"><span class="piv-lbl">${label}</span><span class="piv-val">${val.toFixed(digits)}</span><span class="piv-dist">${above ? '↑' : '↓'}${dist.toFixed(0)}p</span></div>`;
  }).join('');
}
