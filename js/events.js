// Economic Event Risk + Macro Surprise Index (Finnhub)
// S.eventRisk   — upcoming high-impact events, size multiplier, per-currency risk
// S.surpriseIndex — per-currency surprise score from actual vs forecast

import { S } from './state.js';
import { CACHE_DURATION } from './config.js';
import { loadCached, fetchAPI } from './utils.js';

// Which country codes matter for each pair (base, quote)
const PAIR_COUNTRIES = {
  'EUR/USD': ['US', 'EU', 'DE', 'FR'],
  'GBP/USD': ['US', 'GB'],
  'USD/JPY': ['US', 'JP'],
  'AUD/USD': ['US', 'AU'],
  'XAU/USD': ['US'],             // gold driven by USD + US macro
};

// Country → currency mapping for surprise index
const COUNTRY_TO_CCY = {
  US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR',
  GB: 'GBP', JP: 'JPY', AU: 'AUD', CA: 'CAD',
  NZ: 'NZD', CH: 'CHF',
};

// ── Load events ──────────────────────────────────────────────────────────────

export async function loadEventData(hasFinnhub) {
  if (!hasFinnhub) {
    S.eventRisk    = { level: 'none', sizeMult: 1.0, events: [], currencyRisk: {}, unavailable: true };
    S.surpriseIndex = {};
    return;
  }

  try {
    const [events, surprise] = await Promise.all([
      loadCached('events_today', () => fetchAPI('/api/events'), CACHE_DURATION.EVENTS),
      loadCached('surprise_index', () => fetchAPI('/api/surprise'), CACHE_DURATION.SURPRISE),
    ]);

    S.surpriseIndex = computeSurpriseIndex(surprise || []);
    S.eventRisk     = computeEventRisk(events || []);
  } catch(e) {
    console.warn('Event data load failed:', e.message);
    S.eventRisk    = { level: 'none', sizeMult: 1.0, events: [], currencyRisk: {} };
    S.surpriseIndex = {};
  }
}

// ── Surprise index ───────────────────────────────────────────────────────────
// Score > 0 = positive surprise (economic beat → bullish for that currency)
// Scaled roughly ±3 based on z-score of normalised actual−estimate

function scoreObsWindow(observations) {
  const scores = {}, counts = {};
  observations.forEach(o => {
    if (o.actual == null || o.estimate == null || o.estimate === '') return;
    const actual = parseFloat(o.actual), estimate = parseFloat(o.estimate);
    if (isNaN(actual) || isNaN(estimate)) return;
    const prev  = o.prev != null ? parseFloat(o.prev) : null;
    const scale = prev != null && prev !== 0 ? Math.abs(prev) : Math.abs(estimate) || 1;
    const norm  = (actual - estimate) / scale;
    const ccy   = COUNTRY_TO_CCY[o.country];
    if (!ccy) return;
    scores[ccy] = (scores[ccy] || 0) + norm;
    counts[ccy] = (counts[ccy] || 0) + 1;
  });
  const result = {};
  Object.keys(scores).forEach(ccy => {
    result[ccy] = Math.max(-3, Math.min(3, (scores[ccy] / counts[ccy]) * 10));
  });
  return result;
}

function computeSurpriseIndex(observations) {
  // Split into recent 14d vs prior 14d to detect whether momentum is improving/deteriorating.
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  const recent = observations.filter(o => o.time && new Date(o.time).getTime() >= cutoff);
  const prior  = observations.filter(o => o.time && new Date(o.time).getTime() <  cutoff);

  const recentScores = scoreObsWindow(recent.length >= 3 ? recent : observations);
  const priorScores  = scoreObsWindow(prior);

  const trend = {};
  Object.keys(recentScores).forEach(ccy => {
    trend[ccy] = recentScores[ccy] - (priorScores[ccy] ?? 0);
  });

  // _trend stored as hidden key; callers filter it out via !k.startsWith('_')
  return { ...recentScores, _trend: trend };
}

// ── Event risk for current pair ───────────────────────────────────────────────

function computeEventRisk(events) {
  const nowMs       = Date.now();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  const todayEnd    = new Date(); todayEnd.setHours(23, 59, 59, 999);

  // Flatten to relevant events with parsed time
  const parsed = events
    .map(e => ({
      ...e,
      timeMs: e.time ? new Date(e.time).getTime() : null,
    }))
    .filter(e => e.timeMs != null && e.timeMs >= nowMs && e.timeMs <= todayEnd.getTime());

  // Per-pair currency risk (base + quote)
  const pairCountries = PAIR_COUNTRIES[S.currentPair?.symbol] || ['US'];
  const relevant      = parsed.filter(e => pairCountries.includes(e.country));
  const inNext4h      = relevant.filter(e => e.timeMs - nowMs <= fourHoursMs);

  // Highest impact
  const hasHighNext4h = inNext4h.some(e => (e.impact || '').toLowerCase() === 'high');
  const hasMedNext4h  = inNext4h.some(e => (e.impact || '').toLowerCase() === 'medium');
  const hasHighToday  = relevant.some(e => (e.impact || '').toLowerCase() === 'high');

  let level, sizeMult;
  if (hasHighNext4h) {
    level = 'high';   sizeMult = 0.50;
  } else if (hasMedNext4h || hasHighToday) {
    level = 'medium'; sizeMult = 0.75;
  } else {
    level = 'none';   sizeMult = 1.00;
  }

  // Per-currency risk summary
  const currencyRisk = {};
  pairCountries.forEach(c => {
    const ccy   = COUNTRY_TO_CCY[c] || c;
    const hi    = relevant.filter(e => e.country === c && (e.impact || '').toLowerCase() === 'high').length;
    const med   = relevant.filter(e => e.country === c && (e.impact || '').toLowerCase() === 'medium').length;
    if (hi || med) currencyRisk[ccy] = { high: hi, medium: med };
  });

  return { level, sizeMult, events: relevant.slice(0, 8), inNext4h: inNext4h.slice(0, 5), currencyRisk };
}

// ── Surprise score for current pair ─────────────────────────────────────────
// Returns net surprise for the pair: positive = bullish for pair's base currency

export function getPairSurpriseScore() {
  const sym  = S.currentPair?.symbol;
  const si   = S.surpriseIndex;
  if (!sym || !si) return null;

  const [base, quote] = sym.includes('/') ? sym.split('/') : [sym, 'USD'];
  const baseCcy  = base === 'XAU' ? null : base;
  const quoteCcy = quote;

  const baseScore  = baseCcy  ? (si[baseCcy]  ?? null) : null;
  const quoteScore = si[quoteCcy] ?? null;

  if (baseScore == null && quoteScore == null) return null;
  const net = (baseScore ?? 0) - (quoteScore ?? 0);
  return { net, baseScore, quoteScore, baseCcy, quoteCcy };
}

// ── Render helpers ────────────────────────────────────────────────────────────

export function eventRiskBadgeHTML(eventRisk) {
  if (!eventRisk || eventRisk.unavailable) {
    return `<div style="font-size:10px;color:var(--text3);padding:6px 10px;background:var(--s2);border:1px solid var(--border);border-radius:6px;margin-bottom:8px">
      📅 Economic events: Finnhub key not configured
    </div>`;
  }

  if (eventRisk.level === 'none' && eventRisk.events.length === 0) {
    return `<div style="font-size:10px;color:var(--green);padding:6px 10px;background:var(--s2);border:1px solid var(--border);border-radius:6px;margin-bottom:8px">
      📅 No high-impact events today for this pair
    </div>`;
  }

  const col   = eventRisk.level === 'high' ? 'var(--red)' : eventRisk.level === 'medium' ? 'var(--amber)' : 'var(--green)';
  const icon  = eventRisk.level === 'high' ? '⚠' : eventRisk.level === 'medium' ? '⚡' : '📅';
  const title = eventRisk.level === 'high'   ? 'HIGH-IMPACT EVENT — size reduced 50%'
              : eventRisk.level === 'medium' ? 'Medium-impact event — size reduced 25%'
              : 'Events today';

  const evRows = eventRisk.inNext4h.length > 0 ? eventRisk.inNext4h : eventRisk.events.slice(0, 3);
  const rowsHtml = evRows.map(e => {
    const t = e.time ? new Date(e.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';
    const impCol = (e.impact || '').toLowerCase() === 'high' ? 'var(--red)' : 'var(--amber)';
    return `<div style="font-size:10px;color:var(--text2);display:flex;gap:6px;align-items:center;margin-top:2px">
      <span style="font-family:'DM Mono',monospace;color:var(--text3);min-width:38px">${t}</span>
      <span style="font-weight:600;color:${impCol};min-width:24px">${(e.impact||'').toUpperCase().slice(0,3)}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.event || e.description || '—'}</span>
      <span style="color:var(--text3);flex-shrink:0">${e.country}</span>
    </div>`;
  }).join('');

  return `
<div style="padding:9px 12px;background:${col}12;border:1.5px solid ${col}44;border-radius:7px;margin-bottom:8px">
  <div style="font-size:11px;font-weight:700;color:${col};margin-bottom:4px">${icon} ${title}</div>
  ${rowsHtml}
</div>`;
}

export function surpriseIndexHTML(si, pairScore) {
  if (!si || Object.keys(si).length === 0) return '';

  const trend   = si._trend || {};
  const entries = Object.entries(si)
    .filter(([k]) => !k.startsWith('_'))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);

  const rows = entries.map(([ccy, score]) => {
    const col      = score > 0.5 ? 'var(--green)' : score < -0.5 ? 'var(--red)' : 'var(--text3)';
    const bar      = Math.abs(score) / 3 * 100;
    const side     = score >= 0 ? 'right' : 'left';
    const trendVal = trend[ccy];
    const trendArrow = trendVal == null ? '' :
      trendVal >  0.3 ? `<span style="color:var(--green);font-size:9px" title="14d improving">↑</span>` :
      trendVal < -0.3 ? `<span style="color:var(--red);font-size:9px"   title="14d deteriorating">↓</span>` :
                        `<span style="color:var(--text3);font-size:9px"  title="14d stable">→</span>`;
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <span style="font-size:10px;font-weight:600;color:var(--text1);min-width:32px">${ccy}</span>
      <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;position:relative">
        <div style="position:absolute;top:0;bottom:0;${side}:50%;width:${bar/2}%;background:${col};border-radius:3px"></div>
      </div>
      <span style="font-size:10px;font-family:'DM Mono',monospace;color:${col};min-width:36px;text-align:right">${score >= 0 ? '+' : ''}${score.toFixed(1)}</span>
      ${trendArrow}
    </div>`;
  }).join('');

  const pairHtml = pairScore != null ? `
    <div style="font-size:10px;color:var(--text3);margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
      Pair net: <span style="font-weight:700;color:${pairScore.net > 0.3 ? 'var(--green)' : pairScore.net < -0.3 ? 'var(--red)' : 'var(--text2)'}">
        ${pairScore.net >= 0 ? '+' : ''}${pairScore.net.toFixed(2)}
      </span>
      ${pairScore.baseCcy ? `(${pairScore.baseCcy} ${pairScore.baseScore != null ? (pairScore.baseScore >= 0 ? '+' : '') + pairScore.baseScore.toFixed(1) : '—'} vs ${pairScore.quoteCcy} ${pairScore.quoteScore != null ? (pairScore.quoteScore >= 0 ? '+' : '') + pairScore.quoteScore.toFixed(1) : '—'})` : ''}
    </div>` : '';

  return `
<div style="background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:10px 12px;margin-bottom:10px">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);margin-bottom:7px">
    📊 Macro Surprise Index (30 days)
  </div>
  ${rows}
  ${pairHtml}
</div>`;
}
