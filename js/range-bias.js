import { S } from './state.js';
import { getPipSize, calcRSI, ema } from './utils.js';
import { getCOTForPair } from './cot.js';

// ── Config ────────────────────────────────────────────────────────────────────

const FEATURE_DEFS = {
  rangePosition: {
    label: 'Range Position',
    desc:  'Long at bottom 20%, short at top 20% of the Asia/Monday range',
    weight: 1,
  },
  chochBos: {
    label: 'CHoCH / BOS',
    desc:  'Change of character or break of structure detected on 30m swing pivots',
    weight: 2,
  },
  cotBias: {
    label: 'COT Positioning',
    desc:  'Fade overcrowded speculative positioning or align with smart money at range boundary',
    weight: 1,
  },
  wickRejection: {
    label: 'Wick Rejection',
    desc:  'Three or more wick rejections at the range edge on recent 5m bars',
    weight: 1,
  },
  rsiDivergence: {
    label: 'RSI Divergence',
    desc:  'Price/RSI divergence at range high or low (bullish at support, bearish at resistance)',
    weight: 1,
  },
  orderBlock: {
    label: 'Order Block',
    desc:  'Last opposing candle before an impulse move, coinciding with the range boundary',
    weight: 1,
  },
  htfEma: {
    label: 'H1 EMA Alignment',
    desc:  'Price above/below H1 EMA21 & EMA50 confirms or conflicts with entry direction',
    weight: 1,
  },
};

export function loadRangeBiasCfg() {
  const defaults = Object.fromEntries(
    Object.entries(FEATURE_DEFS).map(([k, v]) => [k, { enabled: true, weight: v.weight, label: v.label, desc: v.desc }])
  );
  try {
    const raw = localStorage.getItem('range_bias_cfg');
    if (raw) {
      const saved = JSON.parse(raw);
      return Object.fromEntries(
        Object.entries(defaults).map(([k, def]) => [k, { ...def, ...(saved[k] ?? {}) }])
      );
    }
  } catch(e) {}
  return defaults;
}

export function saveRangeBiasCfg(cfg) {
  const slim = Object.fromEntries(
    Object.entries(cfg).map(([k, v]) => [k, { enabled: v.enabled, weight: v.weight }])
  );
  try { localStorage.setItem('range_bias_cfg', JSON.stringify(slim)); } catch(e) {}
}

export function getFeatureDefs() { return FEATURE_DEFS; }

// ── Bar field accessors (Oanda mid or OHLC) ───────────────────────────────────

function bO(b) { return parseFloat(b.open  ?? b.mid?.o ?? b.o); }
function bC(b) { return parseFloat(b.close ?? b.mid?.c ?? b.c); }
function bH(b) { return parseFloat(b.high  ?? b.mid?.h ?? b.h); }
function bL(b) { return parseFloat(b.low   ?? b.mid?.l ?? b.l); }

// Oanda bars arrive newest-first; reverse for indicator math
function toOldestFirst(bars) { return [...bars].reverse(); }

// ── Feature 1: Range Position ─────────────────────────────────────────────────
// Signals long when price is in the bottom 20% of the range, short at top 20%.

function featureRangePosition(price, asia, monday, atr) {
  const sources = [];
  if (asia?.today?.range   > 0) sources.push({ src: 'Asia',   ...asia.today });
  if (monday?.current?.range > 0) sources.push({ src: 'Monday', ...monday.current });
  if (!sources.length) return { signal: null, val: 'No range data' };

  let best = null, bestDist = Infinity;
  for (const r of sources) {
    const dist = Math.min(Math.abs(price - r.low), Math.abs(price - r.high));
    if (dist < bestDist) { bestDist = dist; best = r; }
  }

  if (bestDist > atr * 0.22) return { signal: null, val: 'Not at range boundary' };

  const pos = (price - best.low) / best.range;
  const pct = (pos * 100).toFixed(0);
  if (pos <= 0.20) return { signal: 'long',  val: `${best.src} bottom ${pct}% — long zone` };
  if (pos >= 0.80) return { signal: 'short', val: `${best.src} top ${pct}% — short zone` };
  return { signal: null, val: `${best.src} mid ${pct}% — no edge` };
}

// ── Feature 2: CHoCH / BOS ────────────────────────────────────────────────────
// Detects 30m swing structure: HH+HL=bullish BOS, LH+LL=bearish BOS,
// LH+HL=bullish CHoCH reversal, HH+LL=bearish CHoCH.

function featureChochBos(symbol) {
  const bars = S.ohlc30m?.[symbol]?.values;
  if (!bars || bars.length < 25) return { signal: null, val: 'Need 25+ 30m bars' };

  const sorted = toOldestFirst(bars).slice(-80);
  const N = 4;
  const SH = [], SL = [];

  for (let i = N; i < sorted.length - N; i++) {
    const h = bH(sorted[i]), l = bL(sorted[i]);
    let isH = true, isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j === i) continue;
      if (bH(sorted[j]) >= h) isH = false;
      if (bL(sorted[j]) <= l) isL = false;
    }
    if (isH) SH.push({ price: h, i });
    if (isL) SL.push({ price: l, i });
  }

  if (SH.length < 2 || SL.length < 2) return { signal: null, val: 'Not enough pivots' };

  const [sh0, sh1] = SH.slice(-2);
  const [sl0, sl1] = SL.slice(-2);
  const hiUp = sh1.price > sh0.price, hiDn = sh1.price < sh0.price;
  const loUp = sl1.price > sl0.price, loDn = sl1.price < sl0.price;

  if (hiUp && loUp) return { signal: 'long',  type: 'BOS',   val: `Bullish BOS — HH + HL` };
  if (hiDn && loDn) return { signal: 'short', type: 'BOS',   val: `Bearish BOS — LH + LL` };
  if (hiDn && loUp) return { signal: 'long',  type: 'CHoCH', val: `Bullish CHoCH — LH + HL` };
  if (hiUp && loDn) return { signal: 'short', type: 'CHoCH', val: `Bearish CHoCH — HH + LL` };

  return { signal: null, val: 'Mixed structure' };
}

// ── Feature 3: COT Positioning at Range ───────────────────────────────────────
// Crowded short specs at support → contrarian squeeze → long.
// Crowded long specs at resistance → unwind risk → short.

function featureCotBias(symbol, entryDir) {
  const d = getCOTForPair(symbol);
  if (!d) return { signal: null, val: 'COT not loaded' };

  const levPct = d.levPct ?? 0;
  const amNet  = d.amNet  ?? 0;
  const sign   = levPct >= 0 ? '+' : '';

  if (entryDir === 'long') {
    if (levPct < -15) return { signal: 'long',  val: `Specs ${sign}${levPct.toFixed(0)}% net short — crowded, squeeze risk` };
    if (levPct >  15) return { signal: 'long',  val: `Specs ${sign}${levPct.toFixed(0)}% net long — confirms long` };
    if (amNet > 0 && levPct < 0) return { signal: 'long', val: `Smart money long vs specs short — divergence` };
    return { signal: null, val: `Specs ${sign}${levPct.toFixed(0)}% — neutral` };
  } else {
    if (levPct >  15) return { signal: 'short', val: `Specs ${sign}${levPct.toFixed(0)}% net long — crowded, unwind risk` };
    if (levPct < -15) return { signal: 'short', val: `Specs ${sign}${levPct.toFixed(0)}% net short — confirms short` };
    if (amNet < 0 && levPct > 0) return { signal: 'short', val: `Smart money short vs specs long — divergence` };
    return { signal: null, val: `Specs ${sign}${levPct.toFixed(0)}% — neutral` };
  }
}

// ── Feature 4: Wick Rejection ─────────────────────────────────────────────────
// Count 5m bars with significant wicks (≥40% of range) that probed the boundary
// and closed away from it. 2+ = signal, 3+ = strong.

function featureWickRejection(symbol, price, asia, monday, atr) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 10) return { signal: null, val: 'Need 10+ 5m bars' };

  const pip = getPipSize(symbol);
  const zone = Math.max(atr * 0.12, pip * 3);

  // Find nearest range boundary
  const boundaries = [
    { lvl: asia?.today?.high,     side: 'resistance', src: 'Asia H' },
    { lvl: asia?.today?.low,      side: 'support',    src: 'Asia L' },
    { lvl: monday?.current?.high, side: 'resistance', src: 'Mon H' },
    { lvl: monday?.current?.low,  side: 'support',    src: 'Mon L' },
  ].filter(s => s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22);

  if (!boundaries.length) return { signal: null, val: 'Not near range boundary' };
  const { lvl, side, src } = boundaries[0];

  // Check last 20 closed 5m bars (skip bars[0] = forming)
  const recent = bars.slice(1, 21);
  let wickCount = 0;
  for (const b of recent) {
    const h = bH(b), l = bL(b), o = bO(b), c = bC(b);
    if (isNaN(h) || isNaN(l) || h - l < pip) continue;
    const range = h - l;
    const nearBoundary = Math.abs(h - lvl) <= zone || Math.abs(l - lvl) <= zone;
    if (!nearBoundary) continue;
    if (side === 'resistance' && (h - Math.max(o, c)) / range >= 0.40) wickCount++;
    if (side === 'support'    && (Math.min(o, c) - l) / range >= 0.40) wickCount++;
  }

  const signal = wickCount >= 2 ? (side === 'support' ? 'long' : 'short') : null;
  const strength = wickCount >= 3 ? 'strong' : wickCount >= 2 ? 'moderate' : 'weak';
  return { signal, wickCount, val: `${wickCount} wick${wickCount !== 1 ? 's' : ''} at ${src} — ${strength}` };
}

// ── Feature 5: RSI Divergence ─────────────────────────────────────────────────
// Bearish divergence (price HH, RSI LH) at resistance → short.
// Bullish divergence (price LL, RSI HL) at support → long.
// Splits last 40 closed bars into two halves and compares extremes.

function featureRsiDivergence(symbol, price, asia, monday, atr) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 50) return { signal: null, val: 'Need 50+ 5m bars' };

  // Determine side
  let side = null;
  for (const s of [
    { lvl: asia?.today?.high,     side: 'high' },
    { lvl: asia?.today?.low,      side: 'low'  },
    { lvl: monday?.current?.high, side: 'high' },
    { lvl: monday?.current?.low,  side: 'low'  },
  ]) {
    if (s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22) { side = s.side; break; }
  }
  if (!side) return { signal: null, val: 'Not near range extreme' };

  const closed = toOldestFirst(bars.slice(1, 70));
  const closes = closed.map(b => bC(b)).filter(v => !isNaN(v));
  if (closes.length < 30) return { signal: null, val: 'Insufficient closes' };

  const rsi  = calcRSI(closes, 14);
  const half = Math.floor(closes.length / 2);
  const p1c  = closes.slice(0, half), p2c = closes.slice(half);
  const p1r  = rsi.slice(0, half),    p2r = rsi.slice(half);

  if (side === 'high') {
    const maxPriceIdx1 = p1c.indexOf(Math.max(...p1c));
    const maxPriceIdx2 = p2c.indexOf(Math.max(...p2c));
    const priceHH = p2c[maxPriceIdx2] > p1c[maxPriceIdx1];
    const rsiLH   = p2r[maxPriceIdx2] < p1r[maxPriceIdx1];
    if (priceHH && rsiLH) return { signal: 'short', val: 'Bearish RSI div — price HH, RSI LH at resistance' };
    return { signal: null, val: 'No bearish RSI divergence' };
  } else {
    const minPriceIdx1 = p1c.indexOf(Math.min(...p1c));
    const minPriceIdx2 = p2c.indexOf(Math.min(...p2c));
    const priceLL = p2c[minPriceIdx2] < p1c[minPriceIdx1];
    const rsiHL   = p2r[minPriceIdx2] > p1r[minPriceIdx1];
    if (priceLL && rsiHL) return { signal: 'long', val: 'Bullish RSI div — price LL, RSI HL at support' };
    return { signal: null, val: 'No bullish RSI divergence' };
  }
}

// ── Feature 6: Order Block ────────────────────────────────────────────────────
// Bullish OB: last bearish candle before 2+ bullish candles, near range boundary.
// Bearish OB: last bullish candle before 2+ bearish candles, near range boundary.

function featureOrderBlock(symbol, price, asia, monday, atr) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 15) return { signal: null, val: 'Need 15+ 5m bars' };

  const boundaries = [
    { lvl: asia?.today?.high,     obSig: 'short', src: 'Asia H' },
    { lvl: asia?.today?.low,      obSig: 'long',  src: 'Asia L' },
    { lvl: monday?.current?.high, obSig: 'short', src: 'Mon H' },
    { lvl: monday?.current?.low,  obSig: 'long',  src: 'Mon L' },
  ].filter(s => s.lvl != null && Math.abs(price - s.lvl) <= atr * 0.22);

  if (!boundaries.length) return { signal: null, val: 'Not near range boundary' };
  const { lvl, obSig } = boundaries[0];

  const ordered = toOldestFirst(bars.slice(1, 32));
  const zoneRadius = atr * 0.25;
  const pip = getPipSize(symbol);

  for (let i = 0; i < ordered.length - 2; i++) {
    const b = ordered[i];
    const o = bO(b), c = bC(b), h = bH(b), l = bL(b);
    if (isNaN(o) || isNaN(c) || h - l < pip) continue;
    const nearBoundary = Math.abs(h - lvl) <= zoneRadius || Math.abs(l - lvl) <= zoneRadius;
    if (!nearBoundary) continue;

    const next2 = ordered.slice(i + 1, i + 3);
    if (next2.length < 2) continue;

    if (obSig === 'long' && c < o) {
      // Bearish candle (OB) before bullish impulse
      if (next2.every(nb => bC(nb) > bO(nb))) {
        return { signal: 'long', val: `Bullish OB at ${lvl.toFixed(5)} — bearish candle before up-impulse` };
      }
    }
    if (obSig === 'short' && c > o) {
      // Bullish candle (OB) before bearish impulse
      if (next2.every(nb => bC(nb) < bO(nb))) {
        return { signal: 'short', val: `Bearish OB at ${lvl.toFixed(5)} — bullish candle before down-impulse` };
      }
    }
  }

  return { signal: null, val: 'No order block near boundary' };
}

// ── Feature 7: H1 EMA Alignment ──────────────────────────────────────────────
// Aggregates 5m bars into H1 candles (12 bars each) then computes EMA21 & EMA50.
// Price above both EMAs = bullish HTF, below both = bearish HTF.

function featureHtfEma(symbol) {
  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 60) return { signal: null, val: 'Need 60+ 5m bars' };

  const sorted = toOldestFirst(bars.slice(1)); // skip forming bar, oldest-first
  const h1Closes = [];
  for (let i = 0; i + 11 < sorted.length; i += 12) {
    const c = bC(sorted[i + 11]);
    if (!isNaN(c)) h1Closes.push(c);
  }

  if (h1Closes.length < 22) return { signal: null, val: 'Not enough H1 bars' };

  const ema21arr = ema(h1Closes, 21);
  const ema50arr = h1Closes.length >= 51 ? ema(h1Closes, 50) : null;
  const lastPx   = h1Closes[h1Closes.length - 1];
  const e21      = ema21arr[ema21arr.length - 1];
  const e50      = ema50arr ? ema50arr[ema50arr.length - 1] : null;

  const abv21 = lastPx > e21;
  const abv50 = e50 != null ? lastPx > e50 : null;

  let signal = null;
  if (abv21 && (abv50 === null || abv50))  signal = 'long';
  if (!abv21 && (abv50 === null || !abv50)) signal = 'short';

  const e50str = e50 != null ? ` · EMA50 ${abv50 ? 'above' : 'below'}` : '';
  return { signal, val: `H1 EMA21 ${abv21 ? 'above' : 'below'}${e50str}`, ema21: e21, ema50: e50 };
}

// ── Main computation ──────────────────────────────────────────────────────────

export function computeRangeBias(symbol, entryDir, price, asia, monday, volRegime) {
  const atr = volRegime?.atr || 0;
  const cfg = loadRangeBiasCfg();

  const FEATURES = [
    { key: 'rangePosition', fn: () => featureRangePosition(price, asia, monday, atr) },
    { key: 'chochBos',      fn: () => featureChochBos(symbol) },
    { key: 'cotBias',       fn: () => featureCotBias(symbol, entryDir) },
    { key: 'wickRejection', fn: () => featureWickRejection(symbol, price, asia, monday, atr) },
    { key: 'rsiDivergence', fn: () => featureRsiDivergence(symbol, price, asia, monday, atr) },
    { key: 'orderBlock',    fn: () => featureOrderBlock(symbol, price, asia, monday, atr) },
    { key: 'htfEma',        fn: () => featureHtfEma(symbol) },
  ];

  let confirmCount = 0, conflictCount = 0, neutralCount = 0;
  const results = [];

  for (const { key, fn } of FEATURES) {
    const feat = cfg[key];
    if (!feat.enabled) {
      results.push({ key, label: feat.label, enabled: false, signal: null, pts: 0, val: 'Disabled', icon: '⚫' });
      continue;
    }

    let out;
    try { out = fn(); } catch(e) { out = { signal: null, val: 'Error' }; }

    const confirms = out.signal === entryDir;
    const conflicts = out.signal != null && out.signal !== entryDir;
    const pts = confirms ? feat.weight : conflicts ? -feat.weight : 0;

    if (confirms) confirmCount++;
    else if (conflicts) conflictCount++;
    else neutralCount++;

    results.push({
      key,
      label:   feat.label,
      enabled: true,
      signal:  out.signal,
      type:    out.type ?? null,
      pts,
      val:     out.val,
      icon:    confirms ? '🟢' : conflicts ? '🔴' : '⚪',
    });
  }

  const enabledResults = results.filter(r => r.enabled);
  const totalPts = enabledResults.reduce((s, r) => s + r.pts, 0);
  const maxPts   = enabledResults.reduce((s, r) => s + (cfg[r.key]?.weight ?? 1), 0);
  const conviction = maxPts > 0 ? totalPts / maxPts : 0;

  return { results, confirmCount, conflictCount, neutralCount, totalPts, maxPts, conviction, entryDir };
}

// ── Settings modal ────────────────────────────────────────────────────────────

export function openRangeBiasModal() {
  const overlay = document.getElementById('rangeBiasModalOverlay');
  if (!overlay) return;
  renderRangeBiasModal();
  overlay.classList.add('open');
}

export function closeRangeBiasModal() {
  document.getElementById('rangeBiasModalOverlay')?.classList.remove('open');
}

export function saveRangeBiasModal() {
  const cfg = loadRangeBiasCfg();
  for (const key of Object.keys(FEATURE_DEFS)) {
    const enEl = document.getElementById(`rb_en_${key}`);
    const wtEl = document.getElementById(`rb_wt_${key}`);
    if (enEl) cfg[key].enabled = enEl.checked;
    if (wtEl) cfg[key].weight  = Math.max(1, Math.min(3, parseInt(wtEl.value, 10) || 1));
  }
  saveRangeBiasCfg(cfg);
  closeRangeBiasModal();
  window.renderAll?.();
}

function renderRangeBiasModal() {
  const body = document.getElementById('rangeBiasModalBody');
  if (!body) return;
  const cfg = loadRangeBiasCfg();

  const dataLabels = {
    rangePosition: '5m bars + range data',
    chochBos:      '30m OHLC bars',
    cotBias:       'CFTC COT report',
    wickRejection: '5m OHLC bars',
    rsiDivergence: '5m closes → RSI-14',
    orderBlock:    '5m OHLC bars',
    htfEma:        '5m bars → H1 EMA21/50',
  };

  body.innerHTML = Object.entries(FEATURE_DEFS).map(([key, def]) => {
    const c = cfg[key];
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <label class="rb-toggle">
        <input type="checkbox" id="rb_en_${key}" ${c.enabled ? 'checked' : ''} onchange="window._rbToggle('${key}')">
        <span class="rb-slider"></span>
      </label>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--text1)">${def.label}</span>
          <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--s2);color:var(--text3);border:1px solid var(--border)">${dataLabels[key]}</span>
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-top:2px;line-height:1.4">${def.desc}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <span style="font-size:10px;color:var(--text3)">Weight</span>
        <select id="rb_wt_${key}" class="rb-wt-sel" ${!c.enabled ? 'disabled' : ''}>
          <option value="1" ${c.weight===1?'selected':''}>×1</option>
          <option value="2" ${c.weight===2?'selected':''}>×2</option>
          <option value="3" ${c.weight===3?'selected':''}>×3</option>
        </select>
      </div>
    </div>`;
  }).join('');
}

// Toggle helper called from modal checkboxes
window._rbToggle = function(key) {
  const enEl = document.getElementById(`rb_en_${key}`);
  const wtEl = document.getElementById(`rb_wt_${key}`);
  if (wtEl) wtEl.disabled = !enEl?.checked;
};
