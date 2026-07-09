// ── volLevelAlertCore ─────────────────────────────────────────────────────────
// Pure decision + message logic for the vol-forecast level-proximity Telegram
// alerts (vol-forecast-v2.html). This is a *selector/formatter* brick: it owns
// NO math of its own — speed uses `indicatorCore.atrWilder`, the momentum z-score
// uses `vumanchuCore.waveTrendSeries` + `statsCore.rollingZAt`, and divergence
// uses the `vumanchu.detectDivergence` brick. It only composes them into an
// informational alert. Everything here is pure (bars/levels/price in → object or
// string out) so it unit-tests on synthetic data with no network.
//
// Contract consumers: server.js `checkVolLevelAlertsNow` loop. Registered in
// LEGO_MODULES.md.

import { atrWilder }        from './indicatorCore.js';
import { waveTrendSeries }  from './vumanchuCore.js';
import { rollingZAt }       from './statsCore.js';
import { detectDivergence } from './vumanchu.js';

// Human labels for each forecast level key. HL (full high-low range) has no
// single price, so it is projected into two extremes around the session open.
export const LEVEL_LABELS = {
  oh_med: 'O-H Median (upside)',
  oh_75:  'O-H 75th (upside)',
  ol_med: 'O-L Median (downside)',
  ol_75:  'O-L 75th (downside)',
  hl_med_hi: 'Proj High (H-L Median)',
  hl_med_lo: 'Proj Low (H-L Median)',
  hl_75_hi:  'Proj High (H-L 75th)',
  hl_75_lo:  'Proj Low (H-L 75th)',
};

// The full set of alertable keys (used by the config UI + defaults).
export const ALERT_LEVEL_KEYS = Object.keys(LEVEL_LABELS);

// ── Approach speed ────────────────────────────────────────────────────────────
// "Is price blasting toward the level or drifting?" Net displacement over the
// last `lookback` bars, expressed in pips/min, as a multiple of the typical bar
// (ATR), and as path-efficiency (straight-line vs chop). Bars: {high,low,close}
// oldest→newest, all numeric.
export function approachSpeed(bars, { pipSize, barMinutes = 5, lookback = 6, atrPeriod = 14 } = {}) {
  if (!Array.isArray(bars) || bars.length < lookback + 2 || !(pipSize > 0)) return null;
  const n     = bars.length;
  const last  = bars[n - 1].close;
  const first = bars[n - 1 - lookback].close;
  const disp  = last - first;                         // signed price move
  const dispPips = disp / pipSize;

  let path = 0;                                        // total distance traversed
  for (let i = n - lookback; i < n; i++) path += Math.abs(bars[i].high - bars[i].low);
  const pathPips   = path / pipSize;
  const efficiency = pathPips > 0 ? Math.abs(dispPips) / pathPips : 0;

  // Net move over the window measured in "typical bars" (ATR). A clean trend
  // covers many ATRs of net ground; chop covers ~0 however wide each bar is.
  const atrArr = atrWilder(bars, atrPeriod);
  const barATR = atrArr[atrArr.length - 1] || 0;
  const atrMult = barATR > 0 ? Math.abs(disp) / barATR : 0;

  const pipsPerMin = Math.abs(dispPips) / (lookback * barMinutes);
  const direction  = disp > 0 ? 1 : disp < 0 ? -1 : 0;

  let label;
  if (Math.abs(dispPips) < 1)                                    label = 'flat';
  else if (atrMult >= lookback * 0.5 && efficiency >= 0.6)       label = 'blasting';
  else if (atrMult >= lookback * 0.25)                           label = 'moving';
  else                                                           label = 'drifting';

  return {
    label, direction,
    pips:       +dispPips.toFixed(1),
    pipsPerMin: +pipsPerMin.toFixed(2),
    atrMult:    +atrMult.toFixed(2),
    efficiency: +efficiency.toFixed(2),
  };
}

// ── Momentum oscillator z-score ───────────────────────────────────────────────
// Latest WaveTrend (WT1) reading + its rolling z-score. Positive z = momentum
// stretched to the upside, negative = downside. Returns null if too few bars.
export function momentumZ(bars, { zWindow = 100, ...wtOpts } = {}) {
  if (!Array.isArray(bars) || bars.length < 30) return null;
  const wt = waveTrendSeries(bars, wtOpts);
  if (!wt.length) return null;
  const idx = wt.length - 1;
  const z = rollingZAt(wt, idx, zWindow);
  return { wt: +wt[idx].toFixed(2), z: +z.toFixed(2) };
}

// ── Divergence ────────────────────────────────────────────────────────────────
// Regular / hidden divergence between price and the WaveTrend oscillator, via the
// shared `detectDivergence` brick. Returns 'DIVERGENCE_BULL'|'DIVERGENCE_BEAR'|
// 'HIDDEN_BULL'|'HIDDEN_BEAR'|'NONE'.
export function divergenceLabel(bars, opts = {}) {
  if (!Array.isArray(bars) || bars.length < 30) return 'NONE';
  const closes = bars.map(b => b.close);
  const wt     = waveTrendSeries(bars, opts);
  if (wt.length !== closes.length) return 'NONE';
  return detectDivergence(closes, wt, opts);
}

const DIV_TEXT = {
  DIVERGENCE_BULL: '🟢 Regular bullish divergence',
  DIVERGENCE_BEAR: '🔴 Regular bearish divergence',
  HIDDEN_BULL:     '🟢 Hidden bullish divergence',
  HIDDEN_BEAR:     '🔴 Hidden bearish divergence',
  NONE:            null,
};

// ── Level scan ────────────────────────────────────────────────────────────────
// From a pair's forecast `levels` object (getSessionStatus shape) + live price,
// return every alertable level within `thresholdPips`, nearest first. `enabled`
// restricts which keys are considered. HL keys are projected from sessionOpen.
export function scanNearLevels({ levels, price, pipSize, sessionOpen, thresholdPips, enabled }) {
  if (!levels || !(price > 0) || !(pipSize > 0) || !(thresholdPips > 0)) return [];
  const on = key => !enabled || enabled.includes(key);
  const points = [];

  for (const key of ['oh_med', 'oh_75', 'ol_med', 'ol_75']) {
    const lp = levels[key]?.price;
    if (lp != null && on(key)) points.push({ key, levelPrice: lp });
  }
  // Project HL range widths into upper/lower extremes around the session open.
  if (sessionOpen > 0) {
    for (const [src, hi, lo] of [['hl_med', 'hl_med_hi', 'hl_med_lo'], ['hl_75', 'hl_75_hi', 'hl_75_lo']]) {
      const pct = levels[src]?.pct;
      if (pct == null) continue;
      if (on(hi)) points.push({ key: hi, levelPrice: sessionOpen * (1 + pct / 100) });
      if (on(lo)) points.push({ key: lo, levelPrice: sessionOpen * (1 - pct / 100) });
    }
  }

  return points
    .map(p => {
      const distPips = Math.abs(price - p.levelPrice) / pipSize;
      return {
        key:        p.key,
        label:      LEVEL_LABELS[p.key] ?? p.key,
        levelPrice: p.levelPrice,
        distPips:   +distPips.toFixed(1),
        side:       p.levelPrice >= price ? 'above' : 'below',   // where the level sits vs price
      };
    })
    .filter(p => p.distPips <= thresholdPips)
    .sort((a, b) => a.distPips - b.distPips);
}

// ── Message formatting ────────────────────────────────────────────────────────
// Build the informational Telegram text for one near-level event. All fields are
// optional; missing enrichment is simply omitted (e.g. no candles → no speed).
export function formatAlert({ pair, price, dp = 5, near, speed, mom, divergence }) {
  const px = v => (v == null ? '—' : Number(v).toFixed(dp));
  const lines = [];
  lines.push(`📍 <b>${pair}</b> approaching <b>${near.label}</b>`);
  lines.push(`Price ${px(price)} · Level ${px(near.levelPrice)} · ${near.distPips} pips ${near.side === 'above' ? 'below' : 'above'} level`);

  if (speed) {
    const toward = speed.direction !== 0 &&
      ((near.side === 'above' && speed.direction > 0) || (near.side === 'below' && speed.direction < 0));
    const verb = { blasting: 'Blasting', moving: 'Moving', drifting: 'Drifting', flat: 'Flat' }[speed.label] ?? speed.label;
    lines.push(`⚡ ${verb} ${toward ? 'toward' : 'away from'} level · ${speed.pipsPerMin} pips/min · ${speed.atrMult}× typical bar`);
  }
  if (mom) {
    const tag = mom.z >= 1.5 ? 'stretched up' : mom.z <= -1.5 ? 'stretched down' : 'neutral';
    lines.push(`📊 Momentum WT ${mom.wt} · z ${mom.z >= 0 ? '+' : ''}${mom.z} (${tag})`);
  }
  const dt = DIV_TEXT[divergence];
  if (dt) lines.push(dt);

  lines.push('<i>Informational — no trade signal.</i>');
  return lines.join('\n');
}

// Compose the full per-pair evaluation. Returns an array of {near, text, key}
// ready to send (already filtered by threshold). `bars` may be null (no
// enrichment). Cooldown is applied by the caller.
export function evaluatePair({ pair, price, dp, pipSize, sessionOpen, levels, thresholdPips, enabled, bars, speedOpts, momOpts, divOpts }) {
  const nears = scanNearLevels({ levels, price, pipSize, sessionOpen, thresholdPips, enabled });
  if (!nears.length) return [];
  const speed = bars ? approachSpeed(bars, { pipSize, ...speedOpts }) : null;
  const mom   = bars ? momentumZ(bars, momOpts) : null;
  const div   = bars ? divergenceLabel(bars, divOpts) : 'NONE';
  return nears.map(near => ({
    key:  near.key,
    near,
    text: formatAlert({ pair, price, dp, near, speed, mom, divergence: div }),
  }));
}
