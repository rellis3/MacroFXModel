import { S } from './state.js';
import { fred } from './utils.js';

/**
 * Builds a plain-English analyst narrative panel from all computed signal data.
 * Returns an HTML string ready to inject into the DOM.
 */
export function buildMarketNarrative({
  tierData, volRegime, transitionRisk, sentiment, macroBias,
  session, positionSize, divergence, macroQuadrant,
  pair, calendarCtx, dollarRegime, otcForecast, armaForecast,
}) {
  const sym   = pair?.symbol ?? '—';
  const name  = pair?.isEquity ? (pair.name ?? sym) : sym;
  const score = tierData?.totalScore ?? 0;
  const agree = tierData?.agreeCount ?? 0;

  // ── Headline stance ──────────────────────────────────────────────────────────
  let stanceWord, stanceColor, stanceEmoji;
  if      (score >=  9) { stanceWord = 'strongly bullish';    stanceColor = 'var(--green)'; stanceEmoji = '📈'; }
  else if (score >=  5) { stanceWord = 'moderately bullish';  stanceColor = 'var(--green)'; stanceEmoji = '📈'; }
  else if (score >=  2) { stanceWord = 'mildly bullish';      stanceColor = 'var(--green)'; stanceEmoji = '↗'; }
  else if (score <= -9) { stanceWord = 'strongly bearish';    stanceColor = 'var(--red)';   stanceEmoji = '📉'; }
  else if (score <= -5) { stanceWord = 'moderately bearish';  stanceColor = 'var(--red)';   stanceEmoji = '📉'; }
  else if (score <= -2) { stanceWord = 'mildly bearish';      stanceColor = 'var(--red)';   stanceEmoji = '↘'; }
  else                  { stanceWord = 'neutral — no edge';   stanceColor = 'var(--amber)'; stanceEmoji = '↔'; }

  const isNeutral = Math.abs(score) < 2;
  const isBull    = score >= 2;

  // ── Primary driver sentence ──────────────────────────────────────────────────
  const strongestTier = tierData?.tiers
    ? [...tierData.tiers].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0]
    : null;

  let driverSentence = '';
  if (strongestTier && Math.abs(strongestTier.score) >= 2) {
    const driverDir = strongestTier.score > 0 ? 'supporting the bullish case' : 'pulling the pair lower';
    driverSentence = `The biggest driver is <strong>${strongestTier.name}</strong> (${strongestTier.reading}), ${driverDir}.`;
  }

  // Tier agreement flavour
  let agreeFlavour = '';
  if (agree >= 6) agreeFlavour = `All ${agree} macro tiers are pointing the same way — this is unusually strong alignment.`;
  else if (agree >= 5) agreeFlavour = `${agree} out of 7 macro factors agree, giving the signal solid backing.`;
  else if (agree >= 3) agreeFlavour = `${agree} of 7 factors lean this way — broad enough to take seriously, but not a slam dunk.`;
  else if (!isNeutral) agreeFlavour = `Only ${agree} of 7 macro factors agree — conviction is low, approach with caution.`;
  else agreeFlavour = 'Macro factors are mixed or flat — there\'s no clear edge here right now.';

  // ── Macro regime colour ──────────────────────────────────────────────────────
  let macroRegimeLine = '';
  if (macroQuadrant?.regime) {
    const mq = macroQuadrant;
    const regimeDescriptions = {
      GOLDILOCKS:  'The macro backdrop is <strong>Goldilocks</strong> — growth is positive without runaway inflation. This favours trend-following and risk-on positioning.',
      REFLATION:   'We\'re in a <strong>Reflation</strong> regime — growth is picking up and inflation is rising. Commodity currencies (AUD, CAD) tend to outperform; bonds struggle.',
      STAGFLATION: '<strong>Stagflation</strong> signals are present — growth is weak while inflation persists. Safe havens like JPY, CHF and gold typically outperform.',
      DEFLATION:   'A <strong>Deflationary</strong> backdrop is forming — growth and inflation both falling. USD and JPY strength is common here; risk assets underperform.',
    };
    macroRegimeLine = regimeDescriptions[mq.regime] ?? '';
  }

  // ── Vol context ──────────────────────────────────────────────────────────────
  let volSentence = '';
  const atrPips = Math.round(volRegime?.atrPips ?? 0);
  const vr = volRegime?.regime ?? 'NORMAL';
  const vi = volRegime?.volImpulse;

  if (vr === 'HIGH') {
    volSentence = `Vol is <strong>elevated</strong> (${volRegime.percentile}th percentile, ATR ${atrPips}p) — expect wide swings and widen your stops accordingly.`;
  } else if (vr === 'LOW') {
    volSentence = `Vol is <strong>compressed</strong> (${volRegime.percentile}th percentile, ATR ${atrPips}p) — ranges are tight and breakouts are less reliable right now.`;
  } else {
    volSentence = `Vol is <strong>normal</strong> for this pair (${volRegime.percentile}th percentile, ATR ${atrPips}p).`;
  }

  if (vi?.bias === 'expanding') {
    volSentence += ` Volatility is <em>accelerating</em> (+${vi.pct.toFixed(0)}% vs recent average) — the market is waking up.`;
  } else if (vi?.bias === 'contracting') {
    volSentence += ` Volatility is <em>contracting</em> (${vi.pct.toFixed(0)}% vs recent average) — the move may be losing steam.`;
  }

  // ── Range utilisation (intraday expectation) ─────────────────────────────────
  let rangeSentence = '';
  const usedPct      = volRegime?.usedPct       ?? 0;
  const remainPips   = Math.round(volRegime?.remainingPips ?? 0);
  const dailyCapPips = Math.round(volRegime?.dailyCapPips  ?? 0);

  if (usedPct > 80) {
    rangeSentence = `Today's range is <strong>nearly exhausted</strong> — ${usedPct.toFixed(0)}% used with only ~${remainPips}p remaining. New breakouts are unlikely; mean-reversion is the higher-probability play now.`;
  } else if (usedPct > 55) {
    rangeSentence = `We're <strong>mid-range</strong> for the day — ${usedPct.toFixed(0)}% consumed, roughly ${remainPips}p left. Extension is still possible but fading setups are increasingly worth watching.`;
  } else if (usedPct > 15) {
    rangeSentence = `The day is <strong>early</strong> with only ${usedPct.toFixed(0)}% of the expected range used (~${remainPips}p remaining). There's room to run — breakout continuation is favoured over fading.`;
  } else if (dailyCapPips > 0) {
    rangeSentence = `The daily range is barely started (~${dailyCapPips}p expected). The full move is still ahead of us — directional setups aligned with the macro bias have good risk/reward.`;
  }

  // ── Transition / regime risk ─────────────────────────────────────────────────
  let transitionLine = '';
  if (transitionRisk) {
    const tr  = transitionRisk;
    const days = tr.consecutiveDays;
    if (tr.transitionRisk === 'HIGH') {
      transitionLine = `⚠️ <strong>Regime risk is high.</strong> ${days} consecutive days of ${tr.currentRegime.toLowerCase()} vol is well above average — these regimes end suddenly and violently. Consider reducing size and widening stops pre-emptively.`;
    } else if (tr.transitionRisk === 'ELEVATED') {
      transitionLine = `⚠️ <strong>Regime transition watch:</strong> ${days} days of ${tr.currentRegime.toLowerCase()} vol. ${tr.riskDetail}`;
    } else if (tr.compressing && tr.currentRegime === 'NORMAL') {
      transitionLine = `Vol is quietly compressing. A transition to a low-vol regime may be forming — mean-reversion setups tend to become more reliable in that environment.`;
    } else if (tr.expanding && tr.currentRegime === 'NORMAL') {
      transitionLine = `Vol is creeping higher. Watch for a move into the high-vol regime — trend moves become larger and more sustained.`;
    }
  }

  // ── Risk sentiment ───────────────────────────────────────────────────────────
  let sentimentLine = '';
  if (sentiment?.composite === 'off') {
    sentimentLine = `Risk sentiment is <strong>off</strong> — credit spreads are widening and AUD/JPY is falling. This is a risk-off environment; USD, JPY and CHF tend to outperform.`;
  } else if (sentiment?.composite === 'on') {
    sentimentLine = `Risk sentiment is <strong>on</strong> — credit is tightening and carry is in demand. This supports risk currencies (AUD, NZD) and equity-linked assets.`;
  }

  // ── Dollar regime ────────────────────────────────────────────────────────────
  let dollarLine = '';
  if (dollarRegime?.label && !pair?.isEquity) {
    const drTrend = dollarRegime.trend;
    if (drTrend === 'strengthening') {
      dollarLine = `The dollar is <strong>strengthening</strong> across the board — this is a headwind for EUR/USD-type pairs and a tailwind for USD/XXX pairs.`;
    } else if (drTrend === 'weakening') {
      dollarLine = `The dollar is <strong>weakening</strong> broadly — supportive for EUR, GBP, AUD and a drag on USD/JPY.`;
    }
  }

  // ── ARMA forward view ────────────────────────────────────────────────────────
  let armaLine = '';
  if (armaForecast && armaForecast.direction !== 'MIXED' && armaForecast.confidence !== 'LOW') {
    const arDir = armaForecast.direction === 'BULLISH' ? 'continue higher' : 'continue lower';
    const conf  = armaForecast.confidence === 'HIGH' ? 'confidently' : 'tentatively';
    armaLine = `The yield spread model is ${conf} forecasting the pair to <strong>${arDir}</strong> over the next 5 days (ARMA model skill: ${armaForecast.avgSkill}%).`;
  }

  // ── Session context ──────────────────────────────────────────────────────────
  let sessionLine = '';
  if (session) {
    const sessionDescriptions = {
      asia:      'We\'re in <strong>Asia session</strong> — liquidity is thin and ranges are typically tight. Directional moves are harder to trust here; wait for London to confirm.',
      prelondon: '<strong>Pre-London</strong> is underway — the market is positioning ahead of the main session. Direction is often set in the first hour of London. Wait before committing.',
      london:    'We\'re in <strong>London session</strong> — peak liquidity. Breakouts and trend moves are most reliable here.',
      overlap:   'The <strong>London/NY overlap</strong> is running — this is the highest-volume window of the day. Large directional moves are common and tend to stick.',
      nyclose:   '<strong>NY close</strong> is approaching — position unwinding is common. Fades and reversions are more likely than fresh breakouts here.',
      closed:    'Markets are in <strong>off-hours</strong> — very low liquidity. Avoid new entries; hold tight stops only.',
    };
    sessionLine = sessionDescriptions[session.key] ?? '';
  }

  // ── Calendar warning ─────────────────────────────────────────────────────────
  let calendarLine = '';
  if (calendarCtx?.warnings?.length) {
    // Strip emoji prefix and capitalise
    const raw = calendarCtx.warnings[0].replace(/^[^\w]+/, '');
    calendarLine = `📅 <strong>Calendar note:</strong> ${raw}`;
  }

  // ── Divergence flag ──────────────────────────────────────────────────────────
  let divergenceLine = '';
  if (divergence) {
    divergenceLine = `⚡ <strong>${divergence.title}:</strong> ${divergence.text}`;
  }

  // ── Overall expectation — the "so what" ─────────────────────────────────────
  let expectation = '';
  if (isNeutral) {
    expectation = 'There\'s no clear macro edge right now. Staying on the sidelines, reducing size, or waiting for a cleaner signal is the smart play.';
  } else if (agree >= 5 && usedPct < 55 && (session?.key === 'london' || session?.key === 'overlap')) {
    const dir = isBull ? 'higher' : 'lower';
    expectation = `Strong macro alignment, room in the day\'s range, and peak session liquidity — the path of least resistance is <strong>${dir}</strong>. Setups toward the macro bias offer the best risk/reward.`;
  } else if (agree >= 5 && usedPct > 70) {
    const dir = isBull ? 'higher' : 'lower';
    expectation = `Despite strong macro alignment pointing <strong>${dir}</strong>, today\'s range is largely consumed. Better to wait for a pullback to a confluence level rather than chasing the move.`;
  } else if (agree >= 3 && usedPct < 55) {
    const dir = isBull ? 'bullish' : 'bearish';
    expectation = `Moderate ${dir} edge with room in the range. Look for entries at key confluence levels; the signal isn\'t strong enough to justify ignoring levels.`;
  } else if (positionSize <= 20) {
    expectation = 'The model is recommending minimum size — conditions are unfavourable for a full position. Treat any trade as exploratory only.';
  } else {
    const dir = isBull ? 'bullish' : 'bearish';
    expectation = `${dir.charAt(0).toUpperCase() + dir.slice(1)} lean with mixed conviction. Be selective — only the highest-quality confluence setups are worth trading.`;
  }

  // ── Assemble sections ─────────────────────────────────────────────────────────
  // Filter out empty lines
  const bodyLines = [
    driverSentence,
    agreeFlavour,
    macroRegimeLine,
    dollarLine,
    sentimentLine,
  ].filter(Boolean);

  const conditionLines = [
    volSentence,
    rangeSentence,
    armaLine,
  ].filter(Boolean);

  const warningLines = [
    transitionLine,
    divergenceLine,
    calendarLine,
    sessionLine,
  ].filter(Boolean);

  const convictionBadge = (() => {
    const absScore = Math.abs(score);
    if (absScore >= 9)  return { label: 'HIGH CONVICTION',     col: 'var(--green)', bg: 'var(--green-bg)',  bd: 'var(--green-bd)' };
    if (absScore >= 5)  return { label: 'MED CONVICTION',      col: 'var(--blue)',  bg: 'var(--blue-bg)',   bd: 'var(--blue-bd)'  };
    if (absScore >= 2)  return { label: 'LOW CONVICTION',      col: 'var(--amber)', bg: 'var(--amber-bg)',  bd: 'var(--amber-bd)' };
    return               { label: 'NO CLEAR EDGE',             col: 'var(--text3)', bg: 'var(--s2)',        bd: 'var(--border)'   };
  })();

  const sizeBadge = (() => {
    if (positionSize >= 75) return { label: `${positionSize}% SIZE`, col: 'var(--green)' };
    if (positionSize >= 50) return { label: `${positionSize}% SIZE`, col: 'var(--blue)'  };
    if (positionSize >= 25) return { label: `${positionSize}% SIZE`, col: 'var(--amber)' };
    return                   { label: `${positionSize}% SIZE`,       col: 'var(--red)'   };
  })();

  return `
<div class="narrative-panel">
  <div class="np-header">
    <span class="np-icon">🗣</span>
    <span class="np-title">Market Analyst</span>
    <span class="np-pair-chip">${name}</span>
    <div class="np-badges">
      <span class="np-badge" style="background:${convictionBadge.bg};color:${convictionBadge.col};border-color:${convictionBadge.bd}">${convictionBadge.label}</span>
      <span class="np-badge" style="color:${sizeBadge.col}">${sizeBadge.label}</span>
    </div>
  </div>

  <div class="np-headline">
    ${stanceEmoji} <span class="np-sym">${name}</span> is
    <span class="np-stance" style="color:${stanceColor}">${stanceWord}</span>
    right now.
  </div>

  ${bodyLines.length ? `
  <div class="np-section">
    ${bodyLines.map(l => `<div class="np-line">${l}</div>`).join('')}
  </div>` : ''}

  ${conditionLines.length ? `
  <div class="np-section np-conditions">
    <div class="np-section-label">CONDITIONS</div>
    ${conditionLines.map(l => `<div class="np-line">${l}</div>`).join('')}
  </div>` : ''}

  ${warningLines.length ? `
  <div class="np-section np-warnings">
    <div class="np-section-label">WATCH FOR</div>
    ${warningLines.map(l => `<div class="np-line">${l}</div>`).join('')}
  </div>` : ''}

  <div class="np-expectation">
    <div class="np-section-label">BOTTOM LINE</div>
    <div class="np-expectation-text">${expectation}</div>
  </div>
</div>`;
}
