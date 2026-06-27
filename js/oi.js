import { S } from './state.js';
import { kvGet, kvSet } from './utils.js';

// ── Storage ──────────────────────────────────────────────────────────────────

export function oiLoadStore() {
  try { return JSON.parse(localStorage.getItem('oi_store') || '{}'); } catch(e) { return {}; }
}

export async function oiLoadStoreFromKV() {
  try {
    const kvObj = await kvGet('oi_store');
    if (!kvObj || !kvObj.data) return;
    const kvStore = kvObj.data;
    const localStore = oiLoadStore();
    let changed = false;
    for (const [sym, data] of Object.entries(kvStore)) {
      if (!localStore[sym]) { localStore[sym] = data; changed = true; }
    }
    if (changed) localStorage.setItem('oi_store', JSON.stringify(localStore));
  } catch(e) {}
}

export function oiSaveStore(store) {
  localStorage.setItem('oi_store', JSON.stringify(store));
  kvSet('oi_store', store);
}

// ── Modal ────────────────────────────────────────────────────────────────────

const OI_FRIENDLY = {
  'NAS100_USD': 'NAS100 / NQ Futures',
  'SPX500_USD': 'SPX500 / ES Futures',
  'DE30_USD':   'DAX / FDAX Futures',
  'UK100_GBP':  'FTSE100 Futures',
  'US30_USD':   'DOW30 / YM Futures',
  'US2000_USD': 'RUS2000 / RTY Futures',
};

// Instruments that actually have a CME (or equivalent listed) options market.
// Crosses (EUR/GBP, GBP/JPY, …) have no CME chain — OI analysis is meaningless for them,
// so the modal warns when one is opened on a non-listed pair.
const OI_CME_PAIRS = new Set([
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'USD/CAD', 'USD/CHF',
  'NAS100_USD', 'SPX500_USD', 'DE30_USD', 'UK100_GBP', 'US30_USD', 'US2000_USD',
]);

export function openOIModal() {
  const sym = S.currentPair ? S.currentPair.symbol : 'EUR/USD';
  const sel = document.getElementById('oiPairSelect');
  if (sel) { sel.value = sym; sel.disabled = true; }
  const lbl = document.getElementById('oiModalPairLbl');
  if (lbl) lbl.textContent = OI_FRIENDLY[sym] || sym;
  const warnEl = document.getElementById('oiCmeWarn');
  if (warnEl) {
    if (!OI_CME_PAIRS.has(sym)) {
      warnEl.style.display = 'block';
      warnEl.textContent = `⚠ ${sym} has no CME options market — OI analysis is only valid for CME-listed instruments. Anything pasted here is stored but won't reflect a real options chain.`;
    } else {
      warnEl.style.display = 'none';
      warnEl.textContent = '';
    }
  }
  const store = oiLoadStore();
  const existing = store[sym];
  // Auto-fill spot: prefer live OANDA quote (always fresh), fall back to saved value
  const livePrice = window._latestQuote?.price ?? window._latestQuote?.mid ?? null;
  const pair = sym;
  const digits = pair.includes('JPY') ? 3 : pair.includes('XAU') ? 2 : isIndexFutures(pair) ? 2 : 5;
  document.getElementById('oiSpotPrice').value = livePrice
    ? livePrice.toFixed(digits)
    : (existing?.spot ?? '');
  const futEl = document.getElementById('oiFuturesPrice');
  futEl.value = existing?.futures ?? '';
  futEl.style.opacity = '';
  futEl.dataset.manual = '0';
  futEl.dataset.estimated = '0';
  futEl.dataset.liveSymbol = '';
  futEl.dataset.liveKind = '';
  // Auto-fetch live CME futures price in background; won't overwrite if user has manually typed
  autoFetchFuturesPrice(sym, futEl);
  document.getElementById('oiNumLevels').value  = existing ? (existing.numLevels || 8)  : 8;
  document.getElementById('oiMinOI').value      = existing ? (existing.minOI     || 20) : 20;
  document.getElementById('oiRawData').value    = existing ? (existing.rawOI  || '') : '';
  document.getElementById('oiChangeData').value = existing ? (existing.rawChg || '') : '';
  updateOIBasis();
  document.getElementById('oiModalOverlay').classList.add('open');
}

export function closeOIModal() {
  document.getElementById('oiModalOverlay').classList.remove('open');
  const sel = document.getElementById('oiPairSelect');
  if (sel) sel.disabled = false;
}

async function autoFetchFuturesPrice(pair, futEl) {
  try {
    const r = await fetch(`/api/futures-quote?pair=${encodeURIComponent(pair)}`);
    const d = await r.json();
    if (!d.ok || !d.price) return;
    if (futEl.dataset.manual === '1') return; // user already typed something — don't overwrite
    futEl.value = d.price;
    futEl.dataset.estimated = '1';
    futEl.dataset.liveSymbol = d.symbol;
    futEl.dataset.liveKind = d.kind || 'future';
    futEl.style.opacity = '0.65';
    updateOIBasis();
  } catch { /* silently ignore — field stays blank or at saved value */ }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('oiModalOverlay');
  if (overlay) overlay.addEventListener('click', function(e) {
    if (e.target === this) closeOIModal();
  });
});

// CME FX futures quotes the foreign currency in USD for EUR/USD, GBP/USD, AUD/USD
// but quotes the USD in foreign-currency terms for USD/JPY (6J), USD/CAD (6C), USD/CHF (6S).
// For those three, the raw CME price must be inverted (1/price) to get the spot-equivalent.
function futuresIsInverted(pair) {
  return pair === 'USD/JPY' || pair === 'USD/CAD' || pair === 'USD/CHF' || pair.includes('JPY');
}

// ── Spot / futures price estimation from OI data ─────────────────────────────
// For CME FX options the strikes are in futures price terms, not spot.
// We estimate the current futures price from the OI distribution by finding
// the strike where cumulative put OI from below ≈ cumulative call OI from above.
// At that crossing point, equal premium has been sold on each side — that's ATM.

export function estimateSpotFromOI(strikes, calls, puts) {
  if (!strikes || strikes.length < 3) return null;

  const items = strikes
    .map((s, i) => ({ s, c: calls[i] || 0, p: puts[i] || 0 }))
    .sort((a, b) => a.s - b.s);

  // Method 1: balance point — find strike where cumPutsBelow ≈ cumCallsAbove
  const totalCalls = items.reduce((a, x) => a + x.c, 0);
  let cumPutBelow = 0, cumCallAbove = totalCalls;
  let minGap = Infinity, balanceStrike = items[Math.floor(items.length / 2)].s;

  for (const item of items) {
    cumCallAbove -= item.c;
    const gap = Math.abs(cumPutBelow - cumCallAbove);
    if (gap < minGap) { minGap = gap; balanceStrike = item.s; }
    cumPutBelow += item.p;
  }

  // Method 2: OI-weighted midpoint (skewed toward high-OI strikes, usually near ATM)
  const totalOI = items.reduce((a, x) => a + x.c + x.p, 0);
  const weightedMid = totalOI > 0
    ? items.reduce((a, x) => a + x.s * (x.c + x.p), 0) / totalOI
    : balanceStrike;

  // Average the two methods — they should converge near the true ATM
  return (balanceStrike + weightedMid) / 2;
}

// Called from modal "Calc from OI" button — parses current textarea and fills spot field
export function calcOISpot() {
  const raw = document.getElementById('oiRawData').value;
  if (!raw.trim()) { oiToast('Paste OI data first, then click Calc', true); return; }
  const parsed = oiParseTable(raw);
  if (!parsed || parsed.strikes.length < 3) { oiToast('Could not parse OI data', true); return; }
  let est = estimateSpotFromOI(parsed.strikes, parsed.calls, parsed.puts);
  if (est == null) { oiToast('Could not estimate spot from OI data', true); return; }

  const pair = S.currentPair?.symbol ?? 'EUR/USD';
  // estimateSpotFromOI returns the ATM in CME strike space (futures terms).
  // For inverted pairs (6J/6C/6S) strikes are foreign-ccy/USD — invert to get the
  // spot-equivalent the Spot field expects (e.g. 0.0068 → 147.x for USD/JPY).
  if (futuresIsInverted(pair)) est = 1 / est;
  const digits = pair.includes('JPY') ? 3 : pair.includes('XAU') ? 2 : isIndexFutures(pair) ? 2 : 5;
  document.getElementById('oiSpotPrice').value = est.toFixed(digits);
  oiToast(`Spot estimated from OI balance: ${est.toFixed(digits)}`);
}

// Debounced auto-estimate — fires when user pastes into the OI textarea
let _autoEstTimer = null;
export function autoEstimateBasis() {
  clearTimeout(_autoEstTimer);
  _autoEstTimer = setTimeout(() => {
    const raw = document.getElementById('oiRawData')?.value;
    if (!raw?.trim()) return;
    const parsed = oiParseTable(raw);
    if (!parsed || parsed.strikes.length < 3) return;
    const est = estimateSpotFromOI(parsed.strikes, parsed.calls, parsed.puts);
    if (est == null) return;
    const futEl = document.getElementById('oiFuturesPrice');
    if (!futEl || futEl.dataset.manual === '1') return; // don't overwrite user's entry
    const pair = S.currentPair?.symbol ?? 'EUR/USD';
    const inverted = futuresIsInverted(pair);
    const digits = inverted ? 6 : pair.includes('XAU') ? 2 : isIndexFutures(pair) ? 2 : 5;
    futEl.value = est.toFixed(digits);
    futEl.dataset.estimated = '1';
    futEl.dataset.liveSymbol = '';
    futEl.dataset.liveKind = '';
    futEl.style.opacity = '0.65';
    updateOIBasis();
  }, 350);
}

// Live basis display — called oninput from either price field
export function updateOIBasis() {
  const pair = S.currentPair?.symbol ?? 'EUR/USD';
  const isJpy = pair === 'USD/JPY' || pair.includes('JPY');
  const futEl  = document.getElementById('oiFuturesPrice');
  const futuresRaw = parseFloat(futEl?.value);
  const spotRaw    = parseFloat(document.getElementById('oiSpotPrice')?.value);
  const el = document.getElementById('oiBasisDisplay');
  if (!el) return;
  // Mark as manually edited (stops auto-fetch / auto-estimate from overwriting)
  if (futEl && futEl === document.activeElement && futEl.dataset.estimated === '1') {
    futEl.dataset.estimated = '0';
    futEl.dataset.liveSymbol = '';
    futEl.dataset.liveKind = '';
    futEl.dataset.manual = '1';
    futEl.style.opacity = '';
  }
  if (isNaN(futuresRaw) || isNaN(spotRaw)) {
    el.textContent = 'Paste OI data — basis is auto-estimated from put/call balance (or enter CME futures price to override)';
    el.style.color = '';
    return;
  }
  let futuresSpot = futuresRaw;
  if (futuresIsInverted(pair)) futuresSpot = 1 / futuresRaw;
  const basis = futuresSpot - spotRaw;
  const digits = isJpy ? 2 : pair.includes('XAU') ? 2 : isIndexFutures(pair) ? 2 : 5;
  const basisSign = basis >= 0 ? '+' : '';
  const _liveSym  = futEl?.dataset.liveSymbol;
  const _srcLabel = futEl?.dataset.liveKind === 'index' ? 'index' : 'CME';
  const src = _liveSym ? ` (${_srcLabel} ${_liveSym})` : futEl?.dataset.estimated === '1' ? ' (OI estimate)' : '';
  el.textContent = `Basis: ${basisSign}${basis.toFixed(digits)}${src} · strikes shifted by ${(basis >= 0 ? '−' : '+') + Math.abs(basis).toFixed(digits)} → spot-equivalent levels`;
  el.style.color = 'var(--blue)';
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function oiParseTable(raw) {
  if (!raw || !raw.trim()) return null;
  const strikes=[], calls=[], puts=[], callChg=[], putChg=[];
  const rows = raw.split('\n');
  for (let i = 0; i < Math.min(200, rows.length); i++) {
    if (strikes.length >= 100) break;
    let row = rows[i].trim();
    if (!row || row.length < 3) continue;
    if (/^\d/.test(row) === false && /[A-Za-z]/.test(row)) continue;
    row = row.replace(/\t/g,' ').replace(/ {2,}/g,' ').trim();
    const cells = row.split(' ');
    const nums = [];
    for (let j = 0; j < Math.min(50, cells.length); j++) {
      const n = parseFloat(cells[j].replace(/,/g,''));
      if (!isNaN(n)) nums.push(n);
    }
    if (nums.length < 3) continue;
    const strike = nums[0], callOI = nums[1], putOI = nums[2];
    if (strike < 0.001 || strike > 1000000) continue;
    if (Math.abs(callOI) > 5000000 || Math.abs(putOI) > 5000000) continue;
    strikes.push(strike);
    calls.push(Math.abs(callOI));
    puts.push(Math.abs(putOI));
    if (nums.length >= 5 && Math.abs(nums[3]) < 10000 && Math.abs(nums[4]) < 10000) {
      callChg.push(nums[3]); putChg.push(nums[4]);
    } else { callChg.push(0); putChg.push(0); }
  }
  return strikes.length >= 2 ? { strikes, calls, puts, callChg, putChg } : null;
}

export function oiParseChangeTable(raw, expectedLen) {
  if (!raw || !raw.trim()) return null;
  const cc=[], pc=[];
  const rows = raw.split('\n');
  for (let i = 0; i < Math.min(200, rows.length); i++) {
    if (cc.length >= 100) break;
    let row = rows[i].trim();
    if (!row || /[A-Za-z]/.test(row) && !/^\d/.test(row)) continue;
    row = row.replace(/\t/g,' ').replace(/ {2,}/g,' ').trim();
    const nums = row.split(' ').map(c => parseFloat(c.replace(/,/g,''))).filter(n => !isNaN(n));
    if (nums.length >= 3 && Math.abs(nums[1]) < 5000000 && Math.abs(nums[2]) < 5000000) {
      cc.push(nums[1]); pc.push(nums[2]);
    }
  }
  return cc.length === expectedLen ? { callChg: cc, putChg: pc } : null;
}

// ── Calculations ─────────────────────────────────────────────────────────────

export function oiCalcMaxPain(strikes, calls, puts) {
  let mp = strikes[0], minPain = Infinity;
  for (let i = 0; i < strikes.length; i++) {
    let pain = 0;
    for (let j = 0; j < strikes.length; j++) {
      if (strikes[j] < strikes[i]) pain += calls[j] * (strikes[i] - strikes[j]);
      else if (strikes[j] > strikes[i]) pain += puts[j] * (strikes[j] - strikes[i]);
    }
    if (pain < minPain) { minPain = pain; mp = strikes[i]; }
  }
  return mp;
}

export function oiErf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1, t = 1/(1+p*Math.abs(x));
  return sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));
}

function isNQ(pair) { return pair === 'NQ' || pair === 'NAS100_USD'; }
function isES(pair) { return pair === 'ES' || pair === 'SPX500_USD'; }
function isYM(pair) { return pair === 'YM' || pair === 'US30_USD'; }
function isRTY(pair) { return pair === 'RTY' || pair === 'US2000_USD'; }
function isFDAX(pair) { return pair === 'FDAX' || pair === 'DE30_USD'; }
function isFTSE(pair) { return pair === 'FTSE' || pair === 'UK100_GBP'; }
function isIndexFutures(pair) { return isNQ(pair) || isES(pair) || isYM(pair) || isRTY(pair) || isFDAX(pair) || isFTSE(pair); }

export function oiGreeks(strike, spot, pair) {
  const sigma = isIndexFutures(pair) ? 0.20 : pair.includes('XAU') ? 0.18 : 0.12;
  const T = 14/365;
  const d1 = (Math.log(spot/strike) + 0.5*sigma*sigma*T) / (sigma*Math.sqrt(T));
  const nd1 = Math.exp(-0.5*d1*d1) / Math.sqrt(2*Math.PI);
  const gamma = nd1 / (spot*sigma*Math.sqrt(T));
  const callDelta = 0.5*(1+oiErf(d1/Math.SQRT2));
  return { gamma, callDelta, putDelta: callDelta-1 };
}

export function oiCalcExposures(strikes, calls, puts, spot, pair) {
  if (!spot || spot <= 0) return { gex: 0, dex: 0 };
  const cs = isNQ(pair) ? 20 : isES(pair) ? 50 : isYM(pair) ? 5 : isRTY(pair) ? 50
           : isFDAX(pair) ? 25 : isFTSE(pair) ? 10 : pair.includes('XAU') ? 100 : 125000;
  let gex=0, dex=0;
  for (let i=0; i<strikes.length; i++) {
    const {gamma, callDelta, putDelta} = oiGreeks(strikes[i], spot, pair);
    gex += (calls[i]-puts[i]) * gamma * cs * spot;
    dex += (calls[i]*callDelta + puts[i]*putDelta) * cs;
  }
  return { gex, dex };
}

// ── Gravity + PIN/BREAKOUT regime ────────────────────────────────────────────
//
// gravityScore = totalOI at nearest strike / (ATR in pips)
//   High gravity (>2) → market is pinned — price attracted to the heavy OI strike.
//   Low gravity (<0.5) → thin OI, price free to run — breakout conditions.
//
// Session regime:
//   PIN      → positive net GEX (dealers long gamma → pin) OR high gravity + H<0.45
//   BREAKOUT → negative net GEX (dealers short gamma → amplify moves) AND gravity<1
//   NEUTRAL  → otherwise
//
// Returns: { regime, gravityScore, nearestStrike, nearestOI, flipStrike,
//            gexSign, totalNetGex, confidence }

export function computeGravityRegime(oi, atr, pipSize) {
  if (!oi || !atr || !pipSize || atr <= 0) return null;

  const spot = oi.spot;
  if (!spot || spot <= 0) return null;

  // Find gamma flip point from gexProfile (sorted by strike)
  let flipStrike = null;
  const gp = oi.gexProfile || [];
  for (let i = 1; i < gp.length; i++) {
    if (Math.sign(gp[i].netGex) !== Math.sign(gp[i-1].netGex)) {
      flipStrike = Math.abs(gp[i].netGex) < Math.abs(gp[i-1].netGex)
        ? gp[i].strike : gp[i-1].strike;
      break;
    }
  }

  // Find nearest strike in topLevels to current spot
  const topLevels = oi.topLevels || [];
  let nearestStrike = null, nearestOI = 0, nearestDist = Infinity;
  for (const lv of topLevels) {
    const d = Math.abs(lv.strike - spot);
    if (d < nearestDist) {
      nearestDist = d;
      nearestStrike = lv.strike;
      nearestOI = lv.totalOI ?? 0;
    }
  }

  const atrPips = atr / pipSize;
  const gravityScore = atrPips > 0 ? nearestOI / atrPips : 0;

  const totalNetGex = oi.exposures?.gex ?? 0;
  const gexSign = totalNetGex > 0 ? 'positive' : totalNetGex < 0 ? 'negative' : 'zero';

  // PIN: positive GEX (dealers long gamma, dampening moves) AND gravity moderate-to-high
  // BREAKOUT: negative GEX (dealers short gamma, amplifying moves) AND gravity low
  let regime, confidence;
  if (totalNetGex > 0 && gravityScore > 1.0) {
    regime = 'PIN';
    confidence = gravityScore > 3 ? 'HIGH' : 'MEDIUM';
  } else if (totalNetGex < 0 && gravityScore < 1.5) {
    regime = 'BREAKOUT';
    confidence = gravityScore < 0.5 ? 'HIGH' : 'MEDIUM';
  } else if (totalNetGex > 0) {
    regime = 'PIN';
    confidence = 'LOW';
  } else if (totalNetGex < 0) {
    regime = 'BREAKOUT';
    confidence = 'LOW';
  } else {
    regime = 'NEUTRAL';
    confidence = 'LOW';
  }

  return {
    regime,
    confidence,
    gravityScore: parseFloat(gravityScore.toFixed(2)),
    nearestStrike,
    nearestOI,
    flipStrike,
    gexSign,
    totalNetGex,
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function oiFmtStrike(val, pair) {
  if (pair.includes('JPY')) return val.toFixed(3);
  if (pair.includes('XAU') || isIndexFutures(pair) || pair === 'NQ' || pair === 'ES') return val.toFixed(2);
  return val.toFixed(5);
}

export function oiFmtOI(n) {
  if (n>=1e6) return (n/1e6).toFixed(1)+'M';
  if (n>=1000) return (n/1000).toFixed(1)+'K';
  return Math.round(n).toString();
}

export function oiFmtChg(n) {
  if (!n||n===0) return '—';
  return (n>0?'+':'')+oiFmtOI(n);
}

// ── Process & save ───────────────────────────────────────────────────────────

export function processOIData() {
  const pair = S.currentPair ? S.currentPair.symbol : document.getElementById('oiPairSelect').value;
  const rawOI = document.getElementById('oiRawData').value;
  const rawChg = document.getElementById('oiChangeData').value;
  const spotRaw    = parseFloat(document.getElementById('oiSpotPrice').value);
  const futuresRaw = parseFloat(document.getElementById('oiFuturesPrice')?.value);
  const numLevels = parseInt(document.getElementById('oiNumLevels').value) || 8;
  const minOI = parseInt(document.getElementById('oiMinOI').value) || 20;

  if (!rawOI.trim()) { oiToast('Paste CME OI data first', true); return; }

  const parsed = oiParseTable(rawOI);
  if (!parsed || parsed.strikes.length < 2) { oiToast('Could not parse — check data format', true); return; }

  if (rawChg.trim()) {
    const chg = oiParseChangeTable(rawChg, parsed.strikes.length);
    if (chg) { parsed.callChg = chg.callChg; parsed.putChg = chg.putChg; }
  }

  // Resolve OANDA spot (reference for Greeks and basis calculation)
  let spot = isNaN(spotRaw) ? null : spotRaw;
  if (!spot && window._latestQuote && S.currentPair && S.currentPair.symbol === pair)
    spot = window._latestQuote.price ?? window._latestQuote.mid;

  // ── Basis conversion: Spot Level = CME Strike − Basis  (Basis = Futures − Spot) ──
  // CME strikes are in futures price terms. We shift them to spot-equivalent levels.
  // If the user entered (or auto-fetched) a CME futures price, use it. Otherwise auto-estimate
  // ATM from the OI put/call balance distribution (same method as estimateSpotFromOI).
  // Inverted pairs (6J/6C/6S): CME prices are foreign-ccy/USD, must invert to get spot-equiv.
  let basis = 0;
  let futuresUsed = null;
  const isJpy = pair === 'USD/JPY' || (pair.includes('JPY') && !pair.startsWith('JPY'));

  if (!isNaN(futuresRaw) && spot) {
    // Manual or auto-fetched: CME raw price → convert to spot-equivalent for basis calc
    const futuresSpot = futuresIsInverted(pair) ? 1 / futuresRaw : futuresRaw;
    basis = futuresSpot - spot;
    futuresUsed = futuresRaw;
  } else if (spot && parsed.strikes.length >= 3) {
    // Auto: estimate ATM from OI put/call balance, derive basis from that
    const oiAtm = estimateSpotFromOI(parsed.strikes, parsed.calls, parsed.puts);
    if (oiAtm != null) {
      const atmSpot = futuresIsInverted(pair) ? 1 / oiAtm : oiAtm;
      basis = atmSpot - spot;
    }
  }

  // Apply basis shift to all strikes (converts futures strikes → spot-equivalent prices).
  // Inverted pairs (6J/6C/6S): CME strikes are in foreign-currency-per-USD space, so invert first.
  if (basis !== 0) {
    parsed.strikes = futuresIsInverted(pair)
      ? parsed.strikes.map(s => (1 / s) - basis)
      : parsed.strikes.map(s => s - basis);
  }

  // Fallback spot for Greeks if OANDA price unavailable
  if (!spot) spot = parsed.strikes[Math.floor(parsed.strikes.length / 2)];

  const maxPain = oiCalcMaxPain(parsed.strikes, parsed.calls, parsed.puts);
  const exposures = oiCalcExposures(parsed.strikes, parsed.calls, parsed.puts, spot, pair);

  const cs = isNQ(pair) ? 20 : isES(pair) ? 50 : isYM(pair) ? 5 : isRTY(pair) ? 50
           : isFDAX(pair) ? 25 : isFTSE(pair) ? 10 : pair.includes('XAU') ? 100 : 125000;

  const withOI = parsed.strikes.map((s,i) => {
    const {gamma, callDelta, putDelta} = oiGreeks(s, spot, pair);
    const callGex = parsed.calls[i] * gamma * cs * spot;
    const putGex  = parsed.puts[i]  * gamma * cs * spot;
    const netGex  = callGex - putGex;
    return {
      strike:s, callOI:parsed.calls[i], putOI:parsed.puts[i],
      totalOI:parsed.calls[i]+parsed.puts[i],
      callChg:parsed.callChg[i]||0, putChg:parsed.putChg[i]||0,
      callGex, putGex, netGex, gamma
    };
  }).filter(x=>x.totalOI>=minOI);
  withOI.sort((a,b)=>b.totalOI-a.totalOI);
  const topLevels = withOI.slice(0, numLevels);

  const gexProfile = parsed.strikes.map((s,i) => {
    const {gamma} = oiGreeks(s, spot, pair);
    const callGex = parsed.calls[i] * gamma * cs * spot;
    const putGex  = parsed.puts[i]  * gamma * cs * spot;
    return { strike:s, callGex, putGex, netGex: callGex - putGex };
  }).sort((a,b) => a.strike - b.strike);

  // Ranked call walls (highest call OI first) and put walls (highest put OI first)
  const callWalls = parsed.strikes
    .map((s, i) => ({ strike: s, oi: parsed.calls[i], chg: parsed.callChg[i] || 0 }))
    .filter(x => x.oi >= minOI)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, numLevels);
  const putWalls = parsed.strikes
    .map((s, i) => ({ strike: s, oi: parsed.puts[i], chg: parsed.putChg[i] || 0 }))
    .filter(x => x.oi >= minOI)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, numLevels);

  const totalCallOI = parsed.calls.reduce((a,b)=>a+b,0);
  const totalPutOI  = parsed.puts.reduce((a,b)=>a+b,0);
  const pcRatio = totalPutOI / Math.max(totalCallOI, 0.01);
  const totalCallChg = parsed.callChg.reduce((a,b)=>a+b,0);
  const totalPutChg  = parsed.putChg.reduce((a,b)=>a+b,0);

  // Directional OI flow relative to spot — where positioning is being built/closed.
  // Calls building ABOVE spot reinforce resistance (cap); puts building BELOW spot
  // reinforce support (floor). Strikes are already in spot-equivalent terms here.
  let callChgAbove = 0, callChgBelow = 0, putChgAbove = 0, putChgBelow = 0;
  for (let i = 0; i < parsed.strikes.length; i++) {
    if (parsed.strikes[i] >= spot) {
      callChgAbove += parsed.callChg[i] || 0; putChgAbove += parsed.putChg[i] || 0;
    } else {
      callChgBelow += parsed.callChg[i] || 0; putChgBelow += parsed.putChg[i] || 0;
    }
  }

  const inst = {
    pair, spot, futures: futuresUsed, basis: basis || null,
    maxPain, exposures, topLevels, gexProfile,
    callWall: callWalls[0]?.strike ?? 0, putWall: putWalls[0]?.strike ?? 0,
    callWallOI: callWalls[0]?.oi ?? 0,  putWallOI: putWalls[0]?.oi ?? 0,
    callWalls, putWalls,
    totalCallOI, totalPutOI, pcRatio, totalCallChg, totalPutChg,
    callChgAbove, callChgBelow, putChgAbove, putChgBelow,
    numRows: parsed.strikes.length, numLevels, minOI,
    savedAt: new Date().toLocaleString(),
    savedAtMs: Date.now(),
    rawOI: rawOI.trim(),
    rawChg: rawChg.trim()
  };

  const store = oiLoadStore();
  store[pair] = inst;
  oiSaveStore(store);

  document.getElementById('oiRawData').value='';
  document.getElementById('oiChangeData').value='';
  document.getElementById('oiSpotPrice').value='';
  const futEl = document.getElementById('oiFuturesPrice');
  if (futEl) futEl.value='';
  const basisEl = document.getElementById('oiBasisDisplay');
  if (basisEl) { basisEl.textContent = 'Enter CME futures price above — basis will be auto-calculated and applied to all strikes on save'; basisEl.style.color=''; }

  closeOIModal();
  window.renderAll();
  const basisNote = basis ? ` · basis ${basis >= 0 ? '+' : ''}${basis.toFixed(pair.includes('JPY') ? 2 : isIndexFutures(pair) ? 2 : 5)}` : '';
  const pairLabel = OI_FRIENDLY[pair] || pair;
  oiToast(`${pairLabel} OI saved · ${parsed.strikes.length} strikes · max pain ${oiFmtStrike(maxPain,pair)}${basisNote}`);

  // Push updated entry data to Railway bot immediately so OI levels are reflected
  window._forceKVSync?.().catch(() => {});
}

export function removeOIInstrument(pair) {
  const store = oiLoadStore();
  delete store[pair];
  oiSaveStore(store);
  window.renderAll();
}

// ── Render ───────────────────────────────────────────────────────────────────

export function renderOISidebar() {
  const sym = S.currentPair ? S.currentPair.symbol : null;
  const store = oiLoadStore();
  const inst = sym ? store[sym] : null;

  if (!inst) {
    return `
      <div class="oi-empty">No OI data for <strong>${sym || '—'}</strong>.<br>Click <strong style="color:var(--blue)">📊 OI</strong> above to paste CME data for this pair.</div>
      <button class="oi-add-btn" onclick="openOIModal()">+ Paste OI data for ${sym || 'this pair'}</button>`;
  }
  return renderOICard(inst) + `<button class="oi-add-btn" onclick="openOIModal()">↻ Update ${sym} OI data</button>`;
}

export function renderGammaChart(gexProfile, spot, pair, maxPain) {
  if (!gexProfile || gexProfile.length === 0) return '';

  const maxAbs = Math.max(...gexProfile.map(r => Math.max(Math.abs(r.callGex), Math.abs(r.putGex))), 1);

  let flipStrike = null;
  for (let i = 1; i < gexProfile.length; i++) {
    if (gexProfile[i-1].netGex > 0 && gexProfile[i].netGex <= 0 ||
        gexProfile[i-1].netGex < 0 && gexProfile[i].netGex >= 0) {
      flipStrike = Math.abs(gexProfile[i].netGex) < Math.abs(gexProfile[i-1].netGex)
        ? gexProfile[i].strike : gexProfile[i-1].strike;
      break;
    }
  }

  const rows = gexProfile.map(r => {
    const isATM = spot > 0 && Math.abs(r.strike - spot) / spot < 0.003;
    const isFlip = flipStrike && Math.abs(r.strike - flipStrike) < 0.00001;
    const callPct = Math.min(50, (Math.abs(r.callGex) / maxAbs) * 50);
    const putPct  = Math.min(50, (Math.abs(r.putGex)  / maxAbs) * 50);
    const isMagnet = r.netGex < 0;
    const typeLabel = Math.abs(r.netGex) < maxAbs * 0.05 ? 'BAL'
                    : isMagnet ? 'MAG' : 'REP';
    const typeCol = typeLabel === 'BAL' ? 'color:var(--text3)'
                  : isMagnet ? 'color:var(--green)' : 'color:var(--red)';

    return `<div class="oi-gamma-row" style="${isFlip ? 'background:var(--amber-bg);border-radius:3px;margin:0 -4px;padding:0 4px' : ''}">
      <span class="oi-gamma-label ${isATM ? 'atm' : ''}">${oiFmtStrike(r.strike, pair)}${isATM ? ' ◀' : ''}</span>
      <div class="oi-gamma-centre">
        <div class="oi-gamma-zero"></div>
        <div class="oi-gamma-bar-call" style="width:${callPct}%"></div>
        <div class="oi-gamma-bar-put"  style="width:${putPct}%"></div>
      </div>
      <span class="oi-gamma-type" style="${typeCol}">${typeLabel}</span>
    </div>`;
  }).join('');

  const flipNote = flipStrike
    ? `<div class="oi-gamma-flip">⚡ Gamma flip at ${oiFmtStrike(flipStrike, pair)} — regime shifts from ${gexProfile.find(r=>r.strike===flipStrike)?.netGex > 0 ? 'repel → magnet' : 'magnet → repel'} above this level</div>`
    : '';

  return `
  <div class="oi-gamma-section">
    <div class="oi-gamma-hd">
      Gamma Flow Per Strike
      <div class="oi-gamma-hd-right">
        <div class="oi-gamma-legend"><div class="oi-gamma-legend-dot" style="background:var(--red)"></div>Call GEX (repel)</div>
        <div class="oi-gamma-legend"><div class="oi-gamma-legend-dot" style="background:var(--green)"></div>Put GEX (magnet)</div>
      </div>
    </div>
    <div style="font-size:9px;color:var(--text3);margin-bottom:8px;line-height:1.5">
      MAG = put-dominant · price slows &amp; reverts &nbsp;|&nbsp; REP = call-dominant · price repels &amp; accelerates once broken &nbsp;|&nbsp; BAL = balanced
    </div>
    ${rows}
    ${flipNote}
  </div>`;
}

export function renderOICard(inst) {
  const pair        = inst.pair        || '—';
  const spot        = inst.spot        || 0;
  const maxPain     = inst.maxPain     || 0;
  const exposures   = inst.exposures   || { gex: 0, dex: 0 };
  const topLevels   = inst.topLevels   || [];
  const callWall    = inst.callWall    || 0;
  const putWall     = inst.putWall     || 0;
  const callWallOI  = inst.callWallOI  || 0;
  const putWallOI   = inst.putWallOI   || 0;
  // Full ranked wall lists — fall back to single-wall for legacy saved data
  const callWalls   = inst.callWalls?.length ? inst.callWalls : (callWall ? [{ strike: callWall, oi: callWallOI, chg: 0 }] : []);
  const putWalls    = inst.putWalls?.length  ? inst.putWalls  : (putWall  ? [{ strike: putWall,  oi: putWallOI,  chg: 0 }] : []);
  const totalCallOI = inst.totalCallOI || 0;
  const totalPutOI  = inst.totalPutOI  || 0;
  const pcRatio     = inst.pcRatio     || 1;
  const totalCallChg= inst.totalCallChg|| 0;
  const totalPutChg = inst.totalPutChg || 0;
  const numRows     = inst.numRows     || 0;
  const savedAt     = inst.savedAt     || null;
  const savedAtMs   = inst.savedAtMs   || null;
  const callChgAbove= inst.callChgAbove|| 0;
  const callChgBelow= inst.callChgBelow|| 0;
  const putChgAbove = inst.putChgAbove || 0;
  const putChgBelow = inst.putChgBelow || 0;
  const gexProfile  = inst.gexProfile  || [];
  const gex = (exposures && typeof exposures.gex === 'number') ? exposures.gex : 0;

  const maxOI = topLevels.length ? topLevels[0].totalOI : 1;
  const pcBias = pcRatio > 1.3 ? 'BEARISH' : pcRatio < 0.77 ? 'BULLISH' : 'NEUTRAL';
  const pcClass = pcRatio > 1.3 ? 'oi-badge-red' : pcRatio < 0.77 ? 'oi-badge-green' : 'oi-badge-amber';
  const mpDist = spot > 0 ? Math.abs(((maxPain-spot)/spot)*100).toFixed(2) : '—';
  const mpDir  = maxPain > spot ? '↑' : maxPain < spot ? '↓' : '—';
  const absGex = Math.abs(gex);
  const gexFmt = absGex >= 1e9 ? `${(gex/1e9).toFixed(2)}Bn` : absGex >= 1e6 ? `${(gex/1e6).toFixed(0)}M` : absGex >= 1e3 ? `${(gex/1e3).toFixed(0)}K` : gex.toFixed(0);
  const gexSign = gex>0?'+':'';
  const gexClass = gex>0?'up':'dn';
  const skewPct = Math.min(100, Math.max(0, (pcRatio/3)*100)).toFixed(0);

  // Staleness — OI goes stale fast, especially near expiry
  let staleBadge = '';
  if (savedAtMs) {
    const ageH = (Date.now() - savedAtMs) / 3.6e6;
    if (ageH >= 48)      staleBadge = `<span class="oi-badge oi-badge-red"   style="margin-left:6px;font-size:8px">STALE ${Math.round(ageH/24)}d</span>`;
    else if (ageH >= 24) staleBadge = `<span class="oi-badge oi-badge-amber" style="margin-left:6px;font-size:8px">${Math.round(ageH/24)}d old</span>`;
  }

  // Directional OI flow vs spot — calls building above = resistance, puts building below = support
  const flowAboveNet = callChgAbove - putChgAbove; // >0: calls dominating above (resistance building)
  const flowBelowNet = putChgBelow - callChgBelow; // >0: puts dominating below (support building)
  const hasFlow = (callChgAbove||callChgBelow||putChgAbove||putChgBelow) !== 0;
  let flowBias = 'BALANCED', flowCol = 'var(--text3)', flowNote = 'No net directional positioning';
  if (hasFlow) {
    if (flowAboveNet > 0 && flowBelowNet > 0) { flowBias = 'COMPRESSING'; flowCol = 'var(--amber)'; flowNote = 'Resistance above + support below building — range tightening'; }
    else if (flowAboveNet > 0 && flowBelowNet <= 0) { flowBias = 'CAPPED'; flowCol = 'var(--red)'; flowNote = 'Calls building above spot — resistance reinforcing'; }
    else if (flowAboveNet <= 0 && flowBelowNet > 0) { flowBias = 'SUPPORTED'; flowCol = 'var(--green)'; flowNote = 'Puts building below spot — support reinforcing'; }
    else { flowBias = 'UNWINDING'; flowCol = 'var(--text3)'; flowNote = 'Positioning closing on both sides'; }
  }

  // Side-by-side wall lists
  const maxCallOI = callWalls.length ? callWalls[0].oi : 1;
  const maxPutOI  = putWalls.length  ? putWalls[0].oi  : 1;
  const callWallRows = callWalls.map((w, i) => {
    const bw   = Math.round((w.oi / maxCallOI) * 100);
    const chgStr = oiFmtChg(w.chg || 0);
    const chgCol = (w.chg||0) > 0 ? 'color:var(--green)' : (w.chg||0) < 0 ? 'color:var(--red)' : 'color:var(--text3)';
    return `<div class="oi-wall-row">
      <span class="oi-wall-rank">${i+1}</span>
      <div class="oi-bar-wrap"><div class="oi-bar oi-bar-red" style="width:${bw}%"></div></div>
      <span class="oi-wall-strike">${oiFmtStrike(w.strike, pair)}</span>
      <span class="oi-wall-oi">${oiFmtOI(w.oi)}</span>
      <span class="oi-wall-chg" style="${chgCol}">${chgStr}</span>
    </div>`;
  }).join('') || '<div class="oi-wall-empty">—</div>';
  const putWallRows = putWalls.map((w, i) => {
    const bw   = Math.round((w.oi / maxPutOI) * 100);
    const chgStr = oiFmtChg(w.chg || 0);
    const chgCol = (w.chg||0) > 0 ? 'color:var(--green)' : (w.chg||0) < 0 ? 'color:var(--red)' : 'color:var(--text3)';
    return `<div class="oi-wall-row">
      <span class="oi-wall-rank">${i+1}</span>
      <div class="oi-bar-wrap"><div class="oi-bar oi-bar-green" style="width:${bw}%"></div></div>
      <span class="oi-wall-strike">${oiFmtStrike(w.strike, pair)}</span>
      <span class="oi-wall-oi">${oiFmtOI(w.oi)}</span>
      <span class="oi-wall-chg" style="${chgCol}">${chgStr}</span>
    </div>`;
  }).join('') || '<div class="oi-wall-empty">—</div>';

  const levelRows = topLevels.map((lvl,i)=>{
    const isAbove = lvl.strike > spot;
    const isMp = Math.abs(lvl.strike-maxPain) < 0.000001;
    const barCol = isMp ? 'oi-bar-amber' : isAbove ? 'oi-bar-red' : 'oi-bar-green';
    const bw = Math.round((lvl.totalOI/maxOI)*100);
    const chgTotal = lvl.callChg+lvl.putChg;
    const chgStr = oiFmtChg(chgTotal);
    const chgCol = chgTotal>0?'color:var(--green)':chgTotal<0?'color:var(--red)':'color:var(--text3)';
    const tag = isMp ? `<span class="oi-badge oi-badge-amber" style="font-size:8px">MAX</span>` :
                isAbove ? `<span class="oi-badge oi-badge-red" style="font-size:8px">R</span>` :
                          `<span class="oi-badge oi-badge-green" style="font-size:8px">S</span>`;
    return `<div class="oi-lvl-row">
      <span class="oi-lvl-rank">${i+1}</span>
      <div class="oi-bar-wrap"><div class="oi-bar ${barCol}" style="width:${bw}%"></div></div>
      <span class="oi-lvl-strike">${oiFmtStrike(lvl.strike,pair)}</span>
      <span class="oi-lvl-oi">${oiFmtOI(lvl.totalOI)}</span>
      ${tag}
      <span class="oi-lvl-chg" style="${chgCol}">${chgStr}</span>
    </div>`;
  }).join('');

  return `
<div class="oi-card">
  <div class="oi-card-hd">
    <span class="oi-card-pair">${pair}</span>
    <span class="oi-badge ${pcClass}" style="margin-left:6px">${pcBias}</span>
    <span class="oi-badge oi-badge-blue" style="margin-left:4px">P/C ${pcRatio.toFixed(2)}</span>
    <span class="oi-card-price">${oiFmtStrike(spot,pair)}</span>
    <button class="oi-remove" onclick="removeOIInstrument('${pair}')" title="Clear ${pair} OI data">×</button>
  </div>
  ${savedAt ? `<div style="font-size:9px;color:var(--text3);padding:4px 13px;background:var(--s2);border-bottom:1px solid var(--border)">Saved: ${savedAt}${staleBadge}</div>` : ''}

  <div class="oi-stats">
    <div class="oi-stat">
      <div class="oi-stat-lbl">Max Pain</div>
      <div class="oi-stat-val amb">${oiFmtStrike(maxPain,pair)}</div>
      <div class="oi-stat-sub">${mpDir} ${mpDist}% from spot</div>
    </div>
    <div class="oi-stat" title="Aggregate gamma exposure (dealer convention): positive = dealers long gamma, hedging dampens moves (pin); negative = short gamma, hedging amplifies moves (breakout). Magnitude is indicative only — flat-sigma / 14-DTE assumption; read relative bar widths in the gamma chart, not absolute $. The per-strike MAG/REP labels below are a separate lens (put- vs call-dominant), not the same as this aggregate sign.">
      <div class="oi-stat-lbl">GEX ⓘ</div>
      <div class="oi-stat-val ${gexClass}">${gexSign}$${gexFmt}</div>
      <div class="oi-stat-sub">${gex>0?'Dampening':'Amplifying'}</div>
    </div>
    <div class="oi-stat">
      <div class="oi-stat-lbl">Call Wall</div>
      <div class="oi-stat-val dn">${oiFmtStrike(callWall,pair)}</div>
      <div class="oi-stat-sub">${oiFmtOI(callWallOI)} OI</div>
    </div>
    <div class="oi-stat">
      <div class="oi-stat-lbl">Put Wall</div>
      <div class="oi-stat-val up">${oiFmtStrike(putWall,pair)}</div>
      <div class="oi-stat-sub">${oiFmtOI(putWallOI)} OI</div>
    </div>
  </div>

  <div class="oi-walls-grid">
    <div class="oi-walls-col">
      <div class="oi-walls-hd oi-walls-hd-call">Call Walls — Resistance</div>
      ${callWallRows}
    </div>
    <div class="oi-walls-col">
      <div class="oi-walls-hd oi-walls-hd-put">Put Walls — Support</div>
      ${putWallRows}
    </div>
  </div>

  <div class="oi-levels">
    <div class="oi-level-hd">Top ${topLevels.length} by combined OI &nbsp;·&nbsp; ${numRows} total strikes</div>
    ${levelRows}
  </div>

  ${renderGammaChart(gexProfile, spot, pair, maxPain)}

  <div class="oi-skew">
    <div class="oi-skew-hd">
      <span class="oi-skew-lbl">Put / Call skew</span>
      <span class="oi-skew-val" style="color:${pcRatio>1.3?'var(--red)':pcRatio<0.77?'var(--green)':'var(--amber)'}">${pcBias}</span>
    </div>
    <div class="oi-skew-track"><div class="oi-skew-dot" style="left:${skewPct}%"></div></div>
    <div class="oi-skew-sub"><span>◀ Calls</span><span>Puts ▶</span></div>
  </div>

  <div class="oi-gex-row">
    <div class="oi-gex-cell">
      <div class="oi-gex-lbl">Call OI flow</div>
      <div class="oi-gex-val" style="color:${totalCallChg>0?'var(--green)':totalCallChg<0?'var(--red)':'var(--text3)'}">${oiFmtChg(totalCallChg)}</div>
      <div class="oi-gex-sub">${totalCallChg>0?'Building':'Closing'} calls</div>
    </div>
    <div class="oi-gex-cell">
      <div class="oi-gex-lbl">Put OI flow</div>
      <div class="oi-gex-val" style="color:${totalPutChg>0?'var(--green)':totalPutChg<0?'var(--red)':'var(--text3)'}">${oiFmtChg(totalPutChg)}</div>
      <div class="oi-gex-sub">${totalPutChg>0?'Building':'Closing'} puts</div>
    </div>
  </div>

  ${hasFlow ? `<div class="oi-gex-row" style="margin-top:6px">
    <div class="oi-gex-cell">
      <div class="oi-gex-lbl">Above spot (calls − puts Δ)</div>
      <div class="oi-gex-val" style="color:${flowAboveNet>0?'var(--red)':flowAboveNet<0?'var(--green)':'var(--text3)'}">${oiFmtChg(flowAboveNet)}</div>
      <div class="oi-gex-sub">${flowAboveNet>0?'Resistance building':flowAboveNet<0?'Resistance fading':'Flat'}</div>
    </div>
    <div class="oi-gex-cell">
      <div class="oi-gex-lbl">Below spot (puts − calls Δ)</div>
      <div class="oi-gex-val" style="color:${flowBelowNet>0?'var(--green)':flowBelowNet<0?'var(--red)':'var(--text3)'}">${oiFmtChg(flowBelowNet)}</div>
      <div class="oi-gex-sub">${flowBelowNet>0?'Support building':flowBelowNet<0?'Support fading':'Flat'}</div>
    </div>
  </div>
  <div style="font-size:9px;padding:4px 13px 2px;color:${flowCol}"><strong>${flowBias}</strong> · ${flowNote}</div>` : ''}
</div>`;
}

let oiToastTimer;
export function oiToast(msg, isErr=false) {
  let el = document.getElementById('oiToastEl');
  if (!el) {
    el = document.createElement('div');
    el.id = 'oiToastEl';
    el.style.cssText='position:fixed;bottom:20px;right:20px;background:var(--s1);border:1.5px solid var(--border2);border-radius:10px;padding:10px 16px;font-size:12px;color:var(--text);z-index:999;opacity:0;transform:translateY(8px);transition:all .25s;pointer-events:none;max-width:320px';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.borderColor = isErr ? 'var(--red-bd)' : 'var(--green-bd)';
  el.style.opacity='1'; el.style.transform='translateY(0)';
  clearTimeout(oiToastTimer);
  oiToastTimer = setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 3500);
}
