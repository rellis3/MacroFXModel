// watchlist.js — Phase 2 live scoring and rendering for the daily watchlist

import { S } from './state.js';
import { getPipSize } from './utils.js';
import { TYPICAL_SPREADS } from './config.js';

// ── Phase 2 live scoring (0–60 pts) ──────────────────────────────────────────

export function computeApproachScore(entry, pair, quote, spreadData, sessionData, eventRisk) {
  const cfg = window._watchlistCfg ?? {};
  let score = 0;

  // ── Spread quality (max 15 pts) ───────────────────────────────────────────
  const pip        = getPipSize(pair);
  const spread     = spreadData?.spreadPips ?? null;
  const typSpread  = TYPICAL_SPREADS[pair] ?? 2;
  if (spread != null) {
    const ratio = spread / typSpread;
    if      (ratio <= (cfg.spreadTight ?? 1.0))  score += 15;
    else if (ratio <= (cfg.spreadOk    ?? 1.5))  score += 10;
    else if (ratio <= (cfg.spreadWide  ?? 2.5))  score += 5;
  } else {
    score += 8; // no data — partial credit
  }

  // ── Session quality (max 10 pts) ──────────────────────────────────────────
  const session = sessionData?.name ?? '';
  if      (session === 'London' || session === 'NY')         score += 10;
  else if (session === 'London/NY overlap' || session === 'NY/London overlap') score += 10;
  else if (session === 'Asia')                               score += 4;
  else                                                       score += 2;

  // ── Approach proximity (max 15 pts) — how close price is to level ─────────
  const price = quote?.mid ?? quote?.close ?? null;
  if (price != null && entry.price != null) {
    const distPips = Math.abs(price - entry.price) / pip;
    const proxMax  = cfg.approachPips ?? 20;
    if      (distPips <= 2)        score += 15;
    else if (distPips <= 5)        score += 12;
    else if (distPips <= 10)       score += 8;
    else if (distPips <= proxMax)  score += 4;
  }

  // ── Approach momentum (max 10 pts) — price moving toward level ───────────
  if (quote?.change != null && entry.price != null && price != null) {
    const movingToward = (entry.direction === 'long'  && quote.change < 0)
                      || (entry.direction === 'short' && quote.change > 0);
    if (movingToward) score += 10;
    else              score += 2;
  }

  // ── Event risk (max 10 pts) — lower risk = higher score ──────────────────
  const evtLevel = eventRisk?.level ?? 'low';
  if      (evtLevel === 'low')    score += 10;
  else if (evtLevel === 'medium') score += 5;
  else                            score += 0; // high event risk

  return Math.min(score, 60);
}

// ── Grade from total score (0–100) ────────────────────────────────────────────

function grade(total) {
  const cfg = window._watchlistCfg ?? {};
  if (total >= (cfg.gradePrime  ?? 85)) return { label: 'PRIME',   color: '#22c55e' };
  if (total >= (cfg.gradeActive ?? 70)) return { label: 'ACTIVE',  color: '#3b82f6' };
  if (total >= (cfg.gradeWatch  ?? 50)) return { label: 'WATCH',   color: '#f59e0b' };
  return                                       { label: 'STANDBY', color: '#6b7280' };
}

// ── Render a watchlist card for one entry ─────────────────────────────────────

export function renderWatchlistCard(entry, pair, quote, spreadData, sessionData, eventRisk) {
  const p2     = computeApproachScore(entry, pair, quote, spreadData, sessionData, eventRisk);
  const total  = (entry.phase1Score ?? 0) + p2;
  const g      = grade(total);

  const dirIcon  = entry.direction === 'long' ? '▲' : '▼';
  const dirColor = entry.direction === 'long' ? '#22c55e' : '#ef4444';
  const stars    = '★'.repeat(entry.totalStars ?? 0) + '☆'.repeat(Math.max(0, 5 - (entry.totalStars ?? 0)));
  const tags     = (entry.tags ?? []).slice(0, 3).join(' · ');

  const pip      = getPipSize(pair);
  const price    = quote?.mid ?? quote?.close ?? null;
  const distPips = price != null ? Math.abs(price - entry.price) / pip : null;
  const distStr  = distPips != null ? `${distPips.toFixed(1)}p away` : '';

  return `<div style="background:#1a1a2e;border:1px solid ${g.color}44;border-radius:6px;padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="window._selectEntry && window._selectEntry(${JSON.stringify(entry.price)})">
  <div style="min-width:36px;text-align:center;">
    <div style="background:${g.color};color:#000;font-size:9px;font-weight:700;border-radius:3px;padding:1px 4px;">${g.label}</div>
    <div style="font-size:13px;font-weight:700;color:${g.color};margin-top:2px;">${total}</div>
  </div>
  <div style="flex:1;min-width:0;">
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="color:${dirColor};font-size:11px;">${dirIcon}</span>
      <span style="color:#e2e8f0;font-size:12px;font-weight:600;">${entry.price.toFixed(pair.includes('JPY') ? 3 : 5)}</span>
      <span style="color:#94a3b8;font-size:10px;">${distStr}</span>
    </div>
    <div style="color:#fbbf24;font-size:10px;margin-top:1px;">${stars}</div>
    ${tags ? `<div style="color:#64748b;font-size:9px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tags}</div>` : ''}
  </div>
  <div style="text-align:right;font-size:9px;color:#64748b;">
    <div>P1: <span style="color:#a78bfa;">${entry.phase1Score ?? 0}</span></div>
    <div>P2: <span style="color:#38bdf8;">${p2}</span></div>
  </div>
</div>`;
}

// ── Render the full watchlist panel for the current pair ──────────────────────

export function renderWatchlistPanel(pair, quote, spreadData, sessionData, eventRisk) {
  const levels = S.dailyWatchlist[pair];
  if (!levels?.length) return '';

  const cfg        = window._watchlistCfg ?? {};
  const dateStr    = S.watchlistDate ?? '—';
  const cards      = levels.map(e => renderWatchlistCard(e, pair, quote, spreadData, sessionData, eventRisk)).join('');
  const proxMax    = cfg.approachPips ?? 20;
  const pip        = getPipSize(pair);
  const price      = quote?.mid ?? quote?.close ?? null;
  const activeCount = price != null
    ? levels.filter(e => Math.abs(price - e.price) / pip <= proxMax).length
    : 0;

  return `<div style="margin-bottom:12px;">
  <div class="sec-lbl">Daily Watchlist
    <span class="sec-badge purple">Phase 1 · ${dateStr}</span>
    ${activeCount ? `<span class="sec-badge" style="background:#22c55e22;color:#22c55e;border-color:#22c55e44;">${activeCount} in range</span>` : ''}
  </div>
  ${cards}
  <div style="font-size:9px;color:#475569;text-align:right;margin-top:2px;">Score = P1 structural + P2 live · <button onclick="window._manualWatchlist && window._manualWatchlist()" style="background:none;border:none;color:#6366f1;cursor:pointer;font-size:9px;padding:0;">↺ recompute</button></div>
</div>`;
}
