import { S } from './state.js';
import { kvGet, kvSet } from './utils.js';
import { wallStrengthTier, oiSkew, oiConcentration, clusterStrikes, wallFreshness, volumePCRatio } from './oiConfluence.js';
import { gammaFlip } from './gammaFlow.js';
import { charmVannaExposure, gexFlipPrice } from './gammaGreeks.js';
import { fullBookGex } from './fullBookGex.js';
import { expectedMove, expectedMoveFromStraddle, ivTermStructure, ivDynamics, riskReversal, vannaState } from './ivMetrics.js';

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

// Drop the heavy/optional fields so a big store still fits localStorage's ~5MB
// cap. Raw pastes and the full per-strike GEX profile are the bulk; both are
// rebuildable/optional and the full copy always lives in KV.
function _trimStoreForLocal(store, { rawText = false, profile = false } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(store)) {
    const c = { ...v };
    if (rawText) { delete c.rawOI; delete c.rawChg; delete c.rawVol; delete c.rawIV; delete c.rawIVTerm; }
    if (profile) { delete c.gexProfile; delete c.ivSmile; }
    if (c.expiries) {
      const ex = {};
      for (const [el, ev] of Object.entries(c.expiries)) {
        const e2 = { ...ev }; if (rawText) { delete e2.rawOI; delete e2.rawChg; delete e2.rawVol; } ex[el] = e2;
      }
      c.expiries = ex;
    }
    out[k] = c;
  }
  return out;
}

// Write the localStorage CACHE best-effort, shedding heavy fields to fit the ~5MB
// cap. NEVER throws (a throw left the modal stuck open). KV holds the full copy
// and the modal backfills any dropped raw from KV.
function _saveLocalCache(store) {
  const builds = [
    () => store,
    () => _trimStoreForLocal(store, { profile: true }),                 // drop GEX profiles first (rebuildable, not user-facing)
    () => _trimStoreForLocal(store, { profile: true, rawText: true }),  // last resort: also drop raw pastes (KV keeps them; modal backfills from KV)
  ];
  for (const build of builds) {
    try { localStorage.setItem('oi_store', JSON.stringify(build())); return; }
    catch (e) {
      if (e?.name !== 'QuotaExceededError' && !/quota/i.test(e?.message || '')) {
        console.warn('[OI] localStorage cache write failed:', e?.message); return;
      }
    }
  }
  console.warn('[OI] localStorage full even after trimming — data kept in KV only');
}

export async function oiSaveStore(store) {
  // KV is the source of truth. The incoming `store` is rebuilt from the localStorage
  // CACHE, which may have been quota-trimmed (raw pastes / GEX profile dropped for
  // OTHER pairs). Writing it verbatim would leak that trim into KV and lose those
  // pairs' raw for good. So UNION-MERGE onto the current KV store: the just-saved
  // pair wins, but any field an incoming (trimmed) pair is missing falls back to KV,
  // and pairs only in KV (e.g. saved on another device) are preserved. Deletion goes
  // through removeOIInstrument, never by omission here.
  try {
    let kvStore = {};
    try { const o = await kvGet('oi_store'); kvStore = o?.data || {}; } catch {}
    const merged = { ...kvStore };
    for (const [k, v] of Object.entries(store)) merged[k] = { ...(kvStore[k] || {}), ...v };
    await kvSet('oi_store', merged);
  } catch (e) { console.warn('[OI] KV save failed:', e?.message); }
  _saveLocalCache(store);
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

// Recover the raw pastes for one pair from KV when localStorage lost them to a
// quota trim. KV is the source of truth (oiSaveStore writes the FULL store there
// first); this pulls just the open pair's raw fields — always small enough to fit.
async function _backfillRawFromKV(sym) {
  const blank = id => { const el = document.getElementById(id); return el && !el.value; };
  if (!blank('oiRawData') && !blank('oiChangeData') && !blank('oiVolumeData')) return;
  try {
    const kvObj = await kvGet('oi_store');
    const e = kvObj?.data?.[sym];
    if (!e || S.currentPair?.symbol !== sym) return;   // pair switched while fetching → bail
    const fill = (id, v) => { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; };
    fill('oiRawData', e.rawOI);
    fill('oiChangeData', e.rawChg);
    fill('oiVolumeData', e.rawVol);
    fill('oiIVData', e.rawIV);
    fill('oiIVTermData', e.rawIVTerm);
    const fe = document.getElementById('oiFuturesPrice');
    if (fe && !fe.value && e.futures) fe.value = e.futures;
    updateOIBasis();
  } catch { /* offline / KV blip — boxes stay as-is */ }
}

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
  const volEl = document.getElementById('oiVolumeData');
  if (volEl) volEl.value = existing ? (existing.rawVol || '') : '';
  const ivEl = document.getElementById('oiIVData');
  if (ivEl) ivEl.value = existing ? (existing.rawIV || '') : '';
  const ivtEl = document.getElementById('oiIVTermData');
  if (ivtEl) ivtEl.value = existing ? (existing.rawIVTerm || '') : '';
  // The call/put swap only means anything on 6J/6C/6S, so hide it elsewhere rather
  // than offer a toggle that would silently corrupt a normally-quoted pair. Restores
  // whatever the last save used, so reopening shows the interpretation in force.
  {
    const inv = futuresIsInverted(sym);
    const w = document.getElementById('oiSwapCPWrap'), h = document.getElementById('oiSwapCPHint');
    const b = document.getElementById('oiSwapCP');
    if (w) w.style.display = inv ? 'flex' : 'none';
    if (h) h.style.display = inv ? '' : 'none';
    if (b) b.checked = inv && !!existing?.cpSwapped;
  }
  updateSmileHint();   // reopening with pastes already in place → show the hint straight away
  updateOIBasis();
  // localStorage may have been trimmed to fit its ~5MB quota (raw pastes dropped
  // locally to survive a big multi-pair store) — in that case the boxes above are
  // blank even though KV still holds the full paste. Backfill from KV so the modal
  // never looks empty after a big save. Async; fills only still-blank boxes.
  _backfillRawFromKV(sym);
  document.getElementById('oiModalOverlay').classList.add('open');
}

export function closeOIModal() {
  document.getElementById('oiModalOverlay').classList.remove('open');
  const sel = document.getElementById('oiPairSelect');
  if (sel) sel.disabled = false;
}

// Fetch BOTH legs of the basis in one call, at the moment Analyse is pressed.
//
// The course is explicit that futures and spot must be captured together (L229) —
// hours apart gives a wrong basis, and a stale basis puts levels 10-20 pips out (L267).
// The old flow only auto-filled the FUTURES field, and only at modal-open, then paired
// it with a spot field populated at some other time. Nothing recorded the gap, and the
// dashboard reported the result as "you typed it" because the field simply had a value
// in it. Returns null on failure so the caller falls back to whatever is on screen.
// `baseUrl` is '' in the browser (relative URL resolves against the page) and an
// origin under Node, where a relative /api/… has nothing to resolve against.
// Both legs — futures price AND paired spot — come back in this ONE response, so
// the basis is taken at a single instant rather than assembled from two moments.
async function fetchPairedQuote(pair, baseUrl = '') {
  try {
    const r = await fetch(`${baseUrl}/api/futures-quote?pair=${encodeURIComponent(pair)}`, { cache: 'no-store' });
    const d = await r.json();
    if (!d?.ok || !(d.price > 0)) return null;
    return d;
  } catch { return null; }
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

// Live smile-expiry hint. Fires as soon as the OI box and a Settlements table are
// both present, so the expiry code appears WHILE you paste rather than after a
// full Analyse-save-Analyse round trip whose only purpose was to look it up.
// Read-only: parses, never saves, never closes the modal.
export function updateSmileHint() {
  const el = document.getElementById('oiSmileHint');
  if (!el) return;
  const val = id => document.getElementById(id)?.value || '';
  const smile = val('oiIVData');
  const hint = resolveSmileExpiry(val('oiRawData'), val('oiIVTermData'), {
    dte: parseFloat(document.getElementById('oiDTE')?.value),
    rawIV: smile,
    now: Date.now(),
  });
  if (!hint || (!hint.code && !Number.isFinite(hint.dte))) {
    el.style.display = 'none'; el.innerHTML = ''; return;
  }

  // What's ALREADY in the smile box? Reopening the modal repopulates it from storage,
  // so "box is non-empty" says nothing about whether it holds the RIGHT expiry. The
  // first version suppressed the hint whenever the box had a chain in it, which meant
  // pasting a fresh OI/Settlements table showed nothing at all — the reported bug.
  // Compare expiry CODES instead and say which of the three states you're in.
  const parsedSmile = smile.trim() ? parseIVSettlement(smile) : null;
  const smileCode = parsedSmile?.expiryCode || null;
  const haveChain = (parsedSmile?.strikes?.length || 0) >= 2;

  // The Settlements table always lags by design (it's the last published settlement),
  // so a 1-3 day age is NORMAL — Friday's settle is what you get all Monday. Only flag
  // it once it's older than a long weekend could explain.
  const stale = (Number.isFinite(hint.tableStaleDays) && hint.tableStaleDays > 4)
    ? `<br><span style="color:#f59e0b">⚠ Settlements table is from ${hint.tableAsOf} (${hint.tableStaleDays} days ago) — re-copy it.</span>`
    : '';

  let body;
  if (haveChain && smileCode && hint.code && smileCode === hint.code) {
    body = `✅ Smile box holds <b>${smileCode}</b> — matches the expiry your walls came from. Nothing else needed.`;
  } else if (haveChain && smileCode && hint.code && smileCode !== hint.code) {
    body = `⚠ Smile box holds <b>${smileCode}</b>, but the walls are on <b>${hint.code}</b>${hint.date ? ` (${hint.date})` : ''}. Charm/vanna/skew would describe a different expiry — re-paste ${hint.code}'s per-strike chain.`;
  } else if (haveChain && !smileCode) {
    body = `👉 Smile box holds a chain but no title line, so its expiry can't be confirmed — the walls are on <b>${hint.code || `~${hint.dte} DTE`}</b>. Re-paste including the title line if unsure.`;
  } else if (hint.code && hint.codeConfirmed) {
    body = `👉 Smile box (optional): paste expiry <b>${hint.code}</b>${hint.date ? ` (${hint.date}, ${hint.matchedDte ?? hint.dte} DTE)` : ''} — its per-strike chain. Include the title line so the LIVE futures price and DTE are read automatically.`;
  } else if (hint.code) {
    // NOT confirmed. This code was inferred by DTE proximity from the Settlements table,
    // which MIXES weekly and monthly products. Stating it as fact sends the user hunting for
    // a code that may not exist under the PRODUCT tab they have open — reported on gold: the
    // hint asked for G4TQ6 while the PRODUCT (OG) tabs offered only OG5N6/OGU6/OGV6/…
    // So lead with the EXPIRY DATE (unambiguous, and it maps to whichever tab holds it) and
    // label the code as the closest row rather than the answer.
    const wk = hint.matchedIsMonthly === false;
    const dteTxt = (hint.matchedDte ?? hint.dte);
    body = `👉 Smile box (optional): paste the chain for the expiry dated <b>${hint.date || `~${hint.dte} DTE`}</b>`
      + `${hint.date && dteTxt != null ? ` (${dteTxt} DTE)` : ''}.`
      + ` Closest Settlements row is <b>${hint.code}</b>${wk ? ' — a <b>weekly</b>' : ''}, but your OI heatmap carried no expiry code, so this could not be confirmed against the walls.`
      + `${wk && hint.monthlyRoot ? ` If the OI you pasted was the monthly (<b>${hint.monthlyRoot}…</b>), pick that product's expiry on the matching date instead — weeklies and monthlies sit under separate PRODUCT tabs.` : ''}`
      + ` Include the title line so the LIVE futures price and DTE are read automatically.`;
  } else {
    body = `👉 Smile box (optional): paste the ~<b>${hint.dte} DTE</b> expiry's per-strike chain (add the Settlements table above to get its exact code).`;
  }
  el.style.display = '';
  el.innerHTML = body + stale;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('oiModalOverlay');
    if (overlay) overlay.addEventListener('click', function(e) {
      if (e.target === this) closeOIModal();
    });
    // Recompute on any input that can change the answer. `paste` is deferred a tick
    // because the value isn't in the field yet when the event fires.
    for (const id of ['oiRawData', 'oiIVTermData', 'oiIVData', 'oiDTE']) {
      const box = document.getElementById(id);
      if (!box) continue;
      box.addEventListener('input', updateSmileHint);
      box.addEventListener('paste', () => setTimeout(updateSmileHint, 0));
    }
  });
}

// CME FX futures quotes the foreign currency in USD for EUR/USD, GBP/USD, AUD/USD
// but quotes the USD in foreign-currency terms for USD/JPY (6J), USD/CAD (6C), USD/CHF (6S).
// For those three, the raw CME price must be inverted (1/price) to get the spot-equivalent.
function futuresIsInverted(pair) {
  return pair === 'USD/JPY' || pair === 'USD/CAD' || pair === 'USD/CHF' || pair.includes('JPY');
}

// A genuine futures→spot basis is small: FX carry is a fraction of a %, gold
// carry ~<1%, index fair-value ~1-2%. A basis larger than this is NOT a real
// basis — it's a bad ATM estimate (e.g. estimateSpotFromOI's put/call centroid
// drifts far from ATM when the WHOLE strike ladder is pasted rather than ~25
// strikes around price). When that happens we must NOT shift the strikes: for
// gold/indices futures≈spot so the correct fallback is no shift at all.
export const MAX_BASIS_FRAC = 0.05;   // 5% of spot — clips garbage (gold saw ~46%), keeps every real basis
export function basisImplausible(basis, spot) {
  return Number.isFinite(basis) && Number.isFinite(spot) && spot > 0 &&
    Math.abs(basis) > spot * MAX_BASIS_FRAC;
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
  // The put/call-balance estimate drifts far from ATM on a FULL strike table
  // (S&P landed ~6164 vs a real ~7524). If a live/auto-filled spot is present and
  // the estimate diverges wildly from it, the estimate is the unreliable one —
  // keep the real price rather than clobbering it. (The estimate is only meant as
  // a last resort when there's no live spot at all.)
  const cur = parseFloat(document.getElementById('oiSpotPrice')?.value)
    || window._latestQuote?.price || window._latestQuote?.mid;
  if (Number.isFinite(cur) && cur > 0 && basisImplausible(est - cur, cur)) {
    oiToast(`OI estimate ${est.toFixed(digits)} is far from the live spot ${(+cur).toFixed(digits)} — full-table estimates are unreliable. Keeping the live price.`, true);
    return;
  }
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
    // Never overwrite the user's entry OR a live-fetched futures price. The live
    // quote (Yahoo future / OANDA CFD) is the real anchor per the course — the OI
    // put/call centroid is only a last resort and must not clobber a real price.
    if (!futEl || futEl.dataset.manual === '1' || futEl.dataset.liveSymbol) return;
    const pair = S.currentPair?.symbol ?? 'EUR/USD';
    const inverted = futuresIsInverted(pair);
    const digits = inverted ? 6 : pair.includes('XAU') ? 2 : isIndexFutures(pair) ? 2 : 5;
    // Don't inject an OI-centroid estimate that implies an implausible basis vs
    // live spot — that's the full-strike-table skew. Leave the field blank so the
    // save falls back to no shift (futures≈spot) instead of showing a wrong price.
    const spotRaw = parseFloat(document.getElementById('oiSpotPrice')?.value);
    const estSpot = inverted ? 1 / est : est;
    if (Number.isFinite(spotRaw) && basisImplausible(estSpot - spotRaw, spotRaw)) {
      updateOIBasis();   // shows the ⚠ explanation
      return;
    }
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
  const _lk = futEl?.dataset.liveKind;
  const _srcLabel = _lk === 'index' ? 'index' : _lk === 'cfd' ? 'CFD' : 'CME';
  const src = _liveSym ? ` (${_srcLabel} ${_liveSym})` : futEl?.dataset.estimated === '1' ? ' (OI estimate)' : '';
  // Implausible basis (usually an OI-centroid estimate off a full strike table) —
  // refuse to shift, and say why. Saving in this state applies NO shift.
  if (basisImplausible(basis, spotRaw)) {
    const pct = (Math.abs(basis) / spotRaw * 100).toFixed(0);
    el.textContent = `⚠ Basis ${basisSign}${basis.toFixed(digits)} is ${pct}% of price — not a real futures basis, so strikes will NOT be shifted. `
      + (futEl?.dataset.estimated === '1'
          ? 'The futures price was auto-estimated from OI and is off (pasting the full strike table skews it). Enter the CME futures price, or leave it blank — for gold/indices futures ≈ spot.'
          : 'Check the CME futures price you entered.');
    el.style.color = 'var(--amber, #f59e0b)';
    return;
  }
  el.textContent = `Basis: ${basisSign}${basis.toFixed(digits)}${src} · strikes shifted by ${(basis >= 0 ? '−' : '+') + Math.abs(basis).toFixed(digits)} → spot-equivalent levels`;
  el.style.color = 'var(--blue)';
}

// ── Parser ───────────────────────────────────────────────────────────────────

// Paste-size ceilings. These are RUNAWAY GUARDS, not business rules — they must sit
// far above any real chain, because when one bites it silently deletes price levels.
//
// The old 500-row cap did exactly that on gold: the GC paste carries 924 strikes from
// 500 to 24,000, so row 500 landed at strike 4010 — BELOW spot at 4078. Every strike
// above that was discarded, taking 21,641 calls with it. The surviving data still
// looked perfectly well-formed: max pain 4000, call wall 4000, P/C 8.29, and a skew of
// exactly −1 because no call OI above spot remained. Nothing errored. (Index chains
// are big too — SPX500 pastes 391 rows — so this was always going to bite eventually.)
//
// A truncation is now reported (`truncated`) instead of being invisible.
const MAX_STRIKE_ROWS = 4000;   // gold: 924 · SPX500: 391 — 4× headroom over the worst seen
const MAX_PASTE_LINES = 8000;   // line budget before the strike-row budget applies

// ── CME multi-expiry heatmap matrix ──────────────────────────────────────────
// Some feeds export a STRIKE × EXPIRY grid: `Strike | C P (exp1) | C P (exp2) | …`,
// tab-separated with empty cells. Pasting it whole broke the simple parser (it
// collapsed the empty cells and grabbed mismatched columns → garbled OI, max pain
// nowhere near price). We read the NEAR-DATED expiry (the first C/P pair after the
// strike): it matches the course (near-dated = strongest gamma/pin) AND the huge
// deep-OTM tail-hedge OI lives in later-dated columns, so those strikes are empty
// here and don't drag max pain down. The header block also carries the futures
// price (auto-fills the basis anchor).
function _matrixHeaderIdx(lines) {
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].split('\t').map(s => s.trim()).filter(Boolean);
    if (c.length >= 4 && c.every(x => x === 'C' || x === 'P')) return i;
  }
  return -1;
}
// Read the whole matrix ONCE into per-strike × per-expiry cells, so every view
// (near-dated for the bot, all-expiry aggregate for volume, per-expiry term
// structure for the brief) derives from the same parse instead of throwing 21/22
// of the columns away. `rows[i] = { strike, cp: [[call,put] per expiry] }`; `dtes`
// is the ordered DTE per expiry column (from the header's "N DTE" labels).
function _matrixRows(raw) {
  if (!raw) return null;
  const lines = raw.split('\n');
  const hdr = _matrixHeaderIdx(lines);
  if (hdr < 0) return null;
  let futures = null;
  const dtes = [];
  const codes = [], underlyings = [];
  let inColumnHeader = false;
  for (let i = 0; i < hdr; i++) {
    if (futures == null)
      for (const tok of lines[i].split('\t')) {
        // The header block mixes the futures price with contract codes ("6EU6"),
        // column labels ("Strike") and DTE labels ("74 DTE"). Only a CLEAN number
        // qualifies. This must be strict, not a magnitude guard:
        //   • the old `n > 50` floor excluded every FX rate (6E ≈ 1.14, 6J ≈ 0.006),
        //     so on FX it skipped the real price and scavenged 74 out of "74 DTE"
        //     — which then poisoned the near-money anchor in pickPrimaryExpiry.
        //   • parseFloat('6EU6') === 6 (truncated exponent), so contract codes must
        //     be rejected by SHAPE, not by size.
        const t = tok.replace(/,/g, '').trim();
        if (!/^-?\d+(\.\d+)?$/.test(t)) continue;          // rejects '6EU6', '74 DTE', 'Strike'
        const n = parseFloat(t);
        if (Number.isFinite(n) && n > 0 && n < 1e7) { futures = n; break; }
      }
    const m = lines[i].match(/(-?\d+)\s*DTE/g);   // "0 DTE", "1 DTE", … in column order
    if (m) for (const t of m) dtes.push(parseInt(t, 10));
    // …and the QuikStrike EXPIRY CODES alongside them ("TU4N6", "EUUQ6", "OGQ6"), in
    // the same column order. Matching the smile-box hint by CODE rather than by DTE
    // matters: DTE is relative to the paste's own date, so if the OI heatmap and the
    // Settlements table are copied on different days, a DTE match silently resolves to
    // the wrong expiry (11 DTE is a different contract each day). The code is absolute.
    //
    // POSITION, not shape, decides what's an expiry code. The header block also lists
    // the UNDERLYING futures contracts next to their prices, and a shape rule cannot
    // separate them: `OGQ6` (option) and `GCQ6` (future) look identical. On FX the
    // underlyings start with a digit (6E, 6J, 6B) so they drop out here, but on gold
    // and the indices they do not (GCQ6, NQU6, YMU6, RTYU6). Collect every candidate
    // now and disambiguate by position after the loop.
    // A code sharing its row with a PRICE in column 0 is an underlying — that is how
    // the header lists them (`27960.75 | NQU6`, `4050 | GCV6`). Expiry codes sit on the
    // column-header rows, whose first cell is a DTE label, "Strike", or empty.
    const c0 = (lines[i].split('\t')[0] || '').trim();
    // Empty col0 counts as part of the price block too: the header is transposed, so
    // its first row carries a contract with no price beside it yet (`| GCQ6`). The
    // column-header rows always have a LABEL there — "Strike" or "N DTE".
    const rowIsPrice = c0 === '' || /^-?\d+(\.\d+)?$/.test(c0);
    for (const tok of lines[i].split('\t')) {
      const t = tok.trim();
      if (!/^[A-Z]{2,3}[A-Z0-9]{1,2}[A-Z]?\d$/.test(t) || /^\d/.test(t)) continue;
      (rowIsPrice ? underlyings : codes).push(t);
    }
  }
  // ONLY trust the codes when there is exactly one per expiry column.
  //
  // Two earlier attempts guessed at this and both broke a different instrument. A
  // literal "Strike" anchor fixed gold and left USD/JPY with nothing; taking the
  // trailing nExp then handed NQ and SPX their UNDERLYING (NQU6, ESU6) as the expiry.
  // The real situation is that some pastes carry an INCOMPLETE header — NQ shows 4
  // option codes against 13 columns, USD/JPY 14 against 18 — and no positional rule
  // can align a partial list. When the count does not match, report no code and let
  // the DTE-based smile hint take over. A missing label beats a confidently wrong one.
  const nExp = Math.floor((lines[hdr] || '').split('\t').filter(Boolean).length / 2);
  const expiryCodes = (nExp > 0 && codes.length === nExp) ? codes : [];

  const rows = [];
  let truncated = false;
  for (let i = hdr + 1; i < lines.length; i++) {
    if (rows.length >= MAX_STRIKE_ROWS) { truncated = true; break; }
    const cells = lines[i].split('\t');            // split on TAB — keep empty cells for alignment
    const strike = parseFloat((cells[0] || '').replace(/,/g, ''));
    if (!Number.isFinite(strike) || strike <= 0 || strike > 1e7) continue;
    const cp = [];
    for (let j = 1; j < cells.length; j += 2) {     // (call,put) pair per expiry column
      const c = parseFloat((cells[j] || '').replace(/,/g, ''));
      const p = parseFloat((cells[j + 1] || '').replace(/,/g, ''));
      cp.push([Number.isFinite(c) ? c : 0, Number.isFinite(p) ? p : 0]);
    }
    rows.push({ strike, cp });
  }
  return rows.length ? { futures, dtes, codes: expiryCodes, rows, truncated } : null;
}

// Pick the PRIMARY expiry column from the parsed matrix — the education's
// "nearest expiration with significant liquidity" (Lesson 5: near-dated gamma
// dominates, but the front weekly/0-DTE is often thin and the OI really lives in
// the monthly). We DELIBERATELY do NOT pick the biggest-total-OI column: a
// far-dated expiry stuffed with deep-OTM tail hedges would win that, which is the
// exact distortion Lesson 6 pitfall 4 warns against. Instead liquidity is scored
// as NEAR-THE-MONEY OI (within bandFrac of the anchor price) so tail hedges don't
// count. The expiry with the greatest near-money OI wins; ties break to the
// nearest DTE. If every column is all-far (no anchor / no near strikes) we fall
// back to total OI. rows: [{strike, cp:[[c,p]…per expiry]}], dtes aligned to the
// expiry columns, anchor = futures price (pre-basis, same space as the strikes).
export function pickPrimaryExpiry(rows, dtes = [], anchor = null, { bandFrac = 0.03, codes = [] } = {}) {
  if (!Array.isArray(rows) || !rows.length) return { index: 0, dte: dtes?.[0] ?? null, nearOI: 0, totalOI: 0 };
  const nExp = Math.max(0, ...rows.map(r => (Array.isArray(r.cp) ? r.cp.length : 0)));
  if (nExp <= 1) return { index: 0, dte: dtes?.[0] ?? null, code: codes?.[0] ?? null, nearOI: 0, totalOI: 0 };
  // Sanity-check the anchor against the strike ladder BEFORE scoring. A futures
  // price that sits nowhere near the strikes is not an anchor — it's a parse
  // failure upstream. Previously such an anchor put the near-money band in empty
  // space, every column scored 0, and the `nearOI → totOI` fallback below quietly
  // switched to biggest-total-OI: the deep-OTM tail-hedge distortion this function
  // exists to prevent. It degraded silently and returned a confident wrong answer.
  // Now: fall back to the median strike (a real ATM proxy) and REPORT the problem
  // via `anchorValid` so the caller can warn instead of trusting it blindly.
  const ss = rows.map(r => r.strike).filter(Number.isFinite).sort((a, b) => a - b);
  const lo = ss[0], hi = ss[ss.length - 1];
  let anc = Number.isFinite(anchor) ? anchor : null;
  const anchorValid = anc == null ? null : (anc >= lo * 0.5 && anc <= hi * 1.5);
  if (anc == null || anchorValid === false)
    anc = ss.length ? ss[Math.floor(ss.length / 2)] : null;   // median strike as ATM proxy
  const band = anc != null ? Math.abs(anc) * bandFrac : Infinity;
  const nearOI = new Array(nExp).fill(0), totOI = new Array(nExp).fill(0);
  for (const r of rows) {
    const near = anc == null || Math.abs(r.strike - anc) <= band;
    for (let e = 0; e < nExp; e++) {
      const oi = Math.abs(r.cp[e]?.[0] ?? 0) + Math.abs(r.cp[e]?.[1] ?? 0);
      totOI[e] += oi;
      if (near) nearOI[e] += oi;
    }
  }
  const scoredOnTotal = !nearOI.some(v => v > 0);            // genuinely nothing near money
  const score = scoredOnTotal ? totOI : nearOI;
  let best = 0;
  for (let e = 1; e < nExp; e++) {
    if (score[e] > score[best]) best = e;
    else if (score[e] === score[best] && Number.isFinite(dtes?.[e]) && Number.isFinite(dtes?.[best]) && dtes[e] < dtes[best]) best = e;
  }
  return { index: best, dte: dtes?.[best] ?? null, code: codes?.[best] ?? null, nearOI: Math.round(nearOI[best]), totalOI: Math.round(totOI[best]),
    anchorValid,                                             // false ⇒ the supplied anchor was unusable (caller should warn)
    scoredOn: scoredOnTotal ? 'totalOI' : 'nearMoneyOI' };   // which rule actually decided — never silent again
}

// Derive a strike/call/put list from the matrix.
//   mode 'primary'   (DEFAULT) = the education's "nearest expiry with significant
//                    liquidity" — auto-selected by pickPrimaryExpiry (near-money OI),
//                    NOT the literal first column (which is often an empty 0-DTE weekly).
//   mode 'near'      = the literal first (near-dated) column — kept for back-compat/tests.
//   mode 'aggregate' = summed across ALL expiries (used for volume, where today's
//                      activity is spread across expiries and there's no tail-hedge distortion).
export function parseOIMatrix(raw, { signed = false, mode = 'primary' } = {}) {
  const parsed = _matrixRows(raw);
  if (!parsed) return null;
  let primary = null, exprIdx = 0;
  if (mode === 'primary') { primary = pickPrimaryExpiry(parsed.rows, parsed.dtes, parsed.futures, { codes: parsed.codes }); exprIdx = primary.index; }
  const strikes = [], calls = [], puts = [];
  for (const r of parsed.rows) {
    let c, p;
    if (mode === 'aggregate') { c = r.cp.reduce((a, x) => a + x[0], 0); p = r.cp.reduce((a, x) => a + x[1], 0); }
    else if (mode === 'primary') { c = r.cp[exprIdx]?.[0] ?? 0; p = r.cp[exprIdx]?.[1] ?? 0; }
    else { c = r.cp[0]?.[0] ?? 0; p = r.cp[0]?.[1] ?? 0; }   // 'near' = literal first column
    if (!signed && c === 0 && p === 0) continue;
    strikes.push(r.strike);
    calls.push(signed ? c : Math.abs(c));
    puts.push(signed ? p : Math.abs(p));
  }
  return strikes.length >= 2
    ? { strikes, calls, puts, futures: parsed.futures,
        truncated: !!parsed.truncated,
        primaryExpiry: primary ? { dte: primary.dte, code: primary.code, index: primary.index, nearOI: primary.nearOI, totalOI: primary.totalOI,
          anchorValid: primary.anchorValid, scoredOn: primary.scoredOn } : null }
    : null;
}

// Wall persistence: how many expiries carry a real position (call+put ≥ minOI) at
// each strike. A wall present across MANY expiries is a durable structural level,
// not a one-day pin — a cheap strength signal on top of the 3× rule. Map strike→count.
export function oiMatrixPersistence(raw, minOI = 1) {
  const parsed = _matrixRows(raw);
  if (!parsed) return null;
  const out = new Map();
  for (const r of parsed.rows)
    out.set(r.strike, r.cp.reduce((n, [c, p]) => n + (Math.abs(c) + Math.abs(p) >= minOI ? 1 : 0), 0));
  return out;
}

// Per-expiry TERM STRUCTURE for the daily brief / analysis (not the bot): each
// expiry's DTE, max pain, dominant call/put wall and total OI — so you can see
// where each horizon pins, not just the near-dated one.
export function oiMatrixTermStructure(raw, minOI = 1) {
  const parsed = _matrixRows(raw);
  if (!parsed) return null;
  const nExp = Math.max(...parsed.rows.map(r => r.cp.length), 0);
  const out = [];
  for (let e = 0; e < nExp; e++) {
    const strikes = [], calls = [], puts = [];
    for (const r of parsed.rows) {
      const c = Math.abs(r.cp[e]?.[0] ?? 0), p = Math.abs(r.cp[e]?.[1] ?? 0);
      strikes.push(r.strike); calls.push(c); puts.push(p);
    }
    const total = calls.reduce((a, x) => a + x, 0) + puts.reduce((a, x) => a + x, 0);
    if (total <= 0) continue;                       // empty expiry column
    const cw = strikes.map((s, i) => ({ s, oi: calls[i] })).filter(x => x.oi >= minOI).sort((a, b) => b.oi - a.oi)[0];
    const pw = strikes.map((s, i) => ({ s, oi: puts[i] })).filter(x => x.oi >= minOI).sort((a, b) => b.oi - a.oi)[0];
    out.push({ dte: parsed.dtes[e] ?? null, maxPain: oiCalcMaxPain(strikes, calls, puts),
      callWall: cw?.s ?? null, putWall: pw?.s ?? null, totalOI: total });
  }
  return out;
}

// Per-expiry legs from the full matrix, basis-shifted to spot-equivalent prices, for the
// FULL-BOOK GEX (aggregate every expiry, not just the selected one). Reuses _matrixRows
// (one parse) and mirrors the basis/inversion the single-expiry parse applies. Drops
// strikes below minOI per expiry and expiries with < 2 real strikes. Returns
// [{ dte, strikes, calls, puts }] or null for the simple (non-matrix) format.
export function oiMatrixExpiryLegs(raw, { basis = 0, inverted = false, minOI = 1 } = {}) {
  const parsed = _matrixRows(raw);
  if (!parsed) return null;
  const shift = s => basis !== 0 ? (inverted ? 1 / s - basis : s - basis) : s;
  const nExp = Math.max(0, ...parsed.rows.map(r => (Array.isArray(r.cp) ? r.cp.length : 0)));
  const legs = [];
  for (let e = 0; e < nExp; e++) {
    const strikes = [], calls = [], puts = [];
    for (const r of parsed.rows) {
      const c = Math.abs(r.cp[e]?.[0] ?? 0), p = Math.abs(r.cp[e]?.[1] ?? 0);
      if (c + p < minOI) continue;
      strikes.push(shift(r.strike)); calls.push(c); puts.push(p);
    }
    if (strikes.length >= 2) legs.push({ dte: parsed.dtes[e] ?? null, strikes, calls, puts });
  }
  return legs.length ? legs : null;
}

export function oiParseTable(raw) {
  if (!raw || !raw.trim()) return null;
  const m = parseOIMatrix(raw);
  if (m) return { strikes: m.strikes, calls: m.calls, puts: m.puts,
    callChg: m.strikes.map(() => 0), putChg: m.strikes.map(() => 0), futures: m.futures,
    truncated: m.truncated, primaryExpiry: m.primaryExpiry };
  const strikes=[], calls=[], puts=[], callChg=[], putChg=[];
  const rows = raw.split('\n');
  for (let i = 0; i < Math.min(MAX_PASTE_LINES, rows.length); i++) {
    if (strikes.length >= MAX_STRIKE_ROWS) break;   // runaway guard only — see MAX_STRIKE_ROWS
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

export function oiParseChangeTable(raw, expectedLen, strikes = null) {
  if (!raw || !raw.trim()) return null;
  const m = parseOIMatrix(raw, { signed: true });   // near-dated change (signed)
  if (m) {
    if (strikes) {   // align to the OI strikes by strike value (matrix rows may differ)
      const map = new Map(m.strikes.map((s, i) => [s, [m.calls[i], m.puts[i]]]));
      return { callChg: strikes.map(s => map.get(s)?.[0] ?? 0),
               putChg: strikes.map(s => map.get(s)?.[1] ?? 0) };
    }
    return { callChg: m.calls, putChg: m.puts };
  }
  const cc=[], pc=[];
  const rows = raw.split('\n');
  for (let i = 0; i < Math.min(MAX_PASTE_LINES, rows.length); i++) {
    if (cc.length >= MAX_STRIKE_ROWS) break;   // must match oiParseTable's budget (row counts have to line up)
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

// Parse a "strike  volume" table → [{strike, volume}] sorted by volume desc.
// Volume = TODAY's traded activity (distinct from resting OI — Lesson 1).
export function oiParseVolume(raw) {
  if (!raw || !raw.trim()) return [];
  // Volume magnets = today's activity, which is spread ACROSS expiries (and, unlike
  // OI, has no deep-OTM tail-hedge distortion) — so aggregate all expiry columns.
  const m = parseOIMatrix(raw, { mode: 'aggregate' });
  if (m) return m.strikes.map((s, i) => ({ strike: s, volume: m.calls[i] + m.puts[i] }))
    .filter(v => v.volume > 0).sort((a, b) => b.volume - a.volume);
  const out = [];
  for (const line of raw.split('\n').slice(0, 200)) {
    const row = line.trim().replace(/\t/g, ' ').replace(/ {2,}/g, ' ');
    if (!row || (/[A-Za-z]/.test(row) && !/^\d/.test(row))) continue;
    const nums = row.split(' ').map(c => parseFloat(c.replace(/,/g, ''))).filter(n => !isNaN(n));
    if (nums.length >= 2 && nums[1] > 0) out.push({ strike: nums[0], volume: nums[1] });
  }
  return out.sort((a, b) => b.volume - a.volume);
}

// Parse the CME QuikStrike "Option Settlement Tool" table (the per-strike IMPLIED VOL
// source charm/vanna need). Tab-separated, two header rows, 14 data columns:
//   CallChg CallPrior CallSettle | Strike | PutSettle PutPrior PutChg |
//   VolSettle VolPrior VolChg | OI-Call OI-CallChg OI-Put OI-PutChg
// → { strikes, iv (decimal), calls, puts } for one expiry. Header/blank rows fail the
// numeric-strike test and are skipped. IV is quoted in percent (39.49) → /100; a `>1`
// guard also accepts an already-decimal source. Rows with no settle vol are dropped.
export function parseIVSettlement(raw) {
  if (!raw || !raw.trim()) return null;
  // callPx/putPx = settle option PRICES (for the ATM straddle → expected move);
  // ivPrior = yesterday's IV (for the per-strike IV change / skew dynamics).
  const out = { strikes: [], iv: [], ivPrior: [], calls: [], puts: [], callPx: [], putPx: [], dte: null,
                futures: null, expiryCode: null };
  // Auto-read DTE from the QuikStrike title line "… OG4N6 (0.11 DTE) vs 4057.3 …"
  // (fractional allowed) so the expiry's time-to-expiry needs no manual entry.
  const dm = raw.match(/(-?\d*\.?\d+)\s*DTE/i);
  if (dm) { const d = parseFloat(dm[1]); if (Number.isFinite(d)) out.dte = d; }
  // …and the LIVE futures price from the same line's "vs <price> (<chg>)" clause.
  // This matters: the course's basis formula needs the CURRENT futures price
  // (education/open-interest-course-notes.md L212, L229 "capture both at the same
  // moment"), but the OI heatmap header only carries the SETTLEMENT price. On
  // 2026-07-24 that gap was 32 pips — pairing a Friday settle with a Monday live
  // spot puts every converted level ~15-30 pips out. QuikStrike prints the live
  // price only on this view's title, so it is the one trustworthy source we get.
  const fm = raw.match(/\bvs\s+([\d,]+\.?\d*)/i);
  if (fm) { const f = parseFloat(fm[1].replace(/,/g, '')); if (Number.isFinite(f) && f > 0) out.futures = f; }
  // Expiry code from the title, e.g. "Gold (OG|GC) G4TQ6 (26.40 DTE) vs …".
  // `[A-Z]{2}\w{3}` demanded exactly five characters starting with TWO letters,
  // which silently failed on two real shapes and left those products unable to
  // CONFIRM which expiry sits in the smile box (they fell back to DTE matching,
  // which is date-sensitive — see resolveSmileExpiry):
  //     G4TQ6  — digit in position 2 (gold weeklies)
  //     EWN6   — only four characters (ES/NQ weeklies)
  // Verified against every code shape in the live book: EUUQ6 YM3Q6 G4TQ6 EWN6
  // NEN6 RTMN6 JPUU6 CHUU6 CAUU6 ADUQ6 GBUQ6 OG5N6 BP5N6 E5DN6 E1AQ6 EW1Q6.
  // Still anchored between the "(EUU|6E)" group and the " (26.40 DTE)" clause,
  // so it cannot wander onto the product or underlying codes.
  const em = raw.match(/\(([A-Z0-9|]+)\)\s*([A-Z][A-Z0-9]{2,4}\d)\s*\(/);
  if (em) out.expiryCode = em[2];
  for (const line of raw.split('\n')) {
    const c = line.replace(/\r$/, '').split('\t');
    if (c.length < 8) continue;                                  // needs at least through VolSettle
    const num = j => parseFloat(String(c[j] ?? '').replace(/,/g, ''));
    const strike = num(3), ivRaw = num(7);
    if (!Number.isFinite(strike) || strike <= 0) continue;       // skips the two header rows
    if (!Number.isFinite(ivRaw) || ivRaw <= 0) continue;         // no settle vol at this strike
    const ivpRaw = num(8);
    out.strikes.push(strike);
    out.iv.push(ivRaw > 1 ? ivRaw / 100 : ivRaw);                // 39.49% → 0.3949 (decimal source passes through)
    out.ivPrior.push(Number.isFinite(ivpRaw) && ivpRaw > 0 ? (ivpRaw > 1 ? ivpRaw / 100 : ivpRaw) : null);
    out.callPx.push(Number.isFinite(num(2)) ? num(2) : null);    // call settle price
    out.putPx.push(Number.isFinite(num(4)) ? num(4) : null);     // put settle price
    out.calls.push(Number.isFinite(num(10)) ? num(10) : 0);
    out.puts.push(Number.isFinite(num(12)) ? num(12) : 0);
  }
  return out.strikes.length >= 2 ? out : null;
}

// Parse the CME "Settlements" table — the per-EXPIRY ATM summary (one row per expiry,
// NOT a per-strike chain). 17 tab columns:
//   Symbol | DTE | ExpirationDate | Strike | Future(Settle Prior Chg) |
//   Straddle(Settle Prior Chg) | Volatility(Settle Prior Chg) | OI(Call CallChg Put PutChg)
// → [{symbol, dte, expiry, strike, future, straddle, straddleChg, iv%, ivPrior%, ivChg%,
//    oiCall, oiPut}]. A data row is identified by a dd/mm/yyyy date in col 2 — that same
// test is the discriminator vs `parseIVSettlement` (a per-strike chain has a number
// there, so this returns null on it and the caller falls back to the per-strike parser).
export function parseSettlementTermStructure(raw) {
  if (!raw || !raw.trim()) return null;
  const rows = [];
  for (const line of raw.split('\n')) {
    const c = line.replace(/\r$/, '').split('\t');
    if (c.length < 14) continue;                                 // needs OI columns
    const dateTok = String(c[2] ?? '').trim();
    if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateTok)) continue;   // data row ⇔ date in col 2
    const num = j => parseFloat(String(c[j] ?? '').replace(/,/g, ''));
    const dte = num(1), strike = num(3);
    if (!Number.isFinite(dte) || !Number.isFinite(strike)) continue;
    const iv = num(10), straddle = num(7);
    rows.push({
      symbol: String(c[0] ?? '').trim(), dte, expiry: dateTok, strike,
      future: Number.isFinite(num(4)) ? num(4) : null,
      straddle: Number.isFinite(straddle) && straddle > 0 ? straddle : null,
      straddleChg: Number.isFinite(num(9)) ? num(9) : null,
      iv: Number.isFinite(iv) && iv > 0 ? iv : null,             // percent (18.80)
      ivPrior: Number.isFinite(num(11)) && num(11) > 0 ? num(11) : null,
      ivChg: Number.isFinite(num(12)) ? num(12) : null,
      oiCall: Number.isFinite(num(13)) ? num(13) : 0,
      oiPut: Number.isFinite(num(15)) ? num(15) : 0,
    });
  }
  return rows.length ? rows : null;
}

// ── Calculations ─────────────────────────────────────────────────────────────

// Which expiry to grab for the per-strike SMILE box, resolved from the pastes alone.
//
// Pure, DOM-free, and deliberately CHEAP — it re-parses only what it needs so it can
// run on every keystroke/paste. Two inputs are required and neither alone is enough:
//   • rawOI      → which expiry the WALLS came from (`pickPrimaryExpiry` → a DTE)
//   • rawIVTerm  → maps that DTE to the QuikStrike CODE (11 → "EUUQ6") + date
// Falls back to the typed DTE (single-expiry FX pastes), and with a table but no DTE
// at all suggests the front liquid expiry. Returns null only when there is neither.
//
// Extracted 2026-07-27 so the hint can fire ON PASTE instead of requiring a full
// Analyse-save-Analyse round trip just to learn an expiry code.
// dd/mm/yyyy → UTC Date (the Settlements table's expiry format). Null on anything else.
function _parseDMY(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// The CME Settlements table MIXES option products: for EUR/USD it lists weekday weeklies
// (MO4N6 Monday, TU4N6 Tuesday, WE5N6 Wednesday...) alongside the monthlies (EUUQ6, EUUU6,
// EUUV6...); gold lists G4TQ6-style weeklies beside the OG monthlies. They are SEPARATE
// products in QuikStrike, each under its own PRODUCT tab.
//
// This matters because the smile hint used to name whichever row was nearest by DTE, which
// can be a weekly while the walls were computed from a MONTHLY heatmap column. The user is
// then told to paste an expiry that does not appear in the product list they are looking at
// (reported on gold: hint asked for G4TQ6 while the PRODUCT (OG) tabs offered only
// OG5N6/OGU6/OGV6/...). Unactionable.
//
// The monthly root is inferred from the data rather than hard-coded per instrument: it is
// the symbol prefix that recurs across the MOST DISTINCT month-year suffixes. Monthlies
// span many months under one root (EUU -> Q6,U6,V6,X6,Z6); a weekly root is tied to one or
// two (MO4 -> N6). No CME product table to maintain.
function _monthlyRoot(rows) {
  const byPrefix = new Map();
  for (const r of rows || []) {
    const sym = String(r?.symbol || '');
    if (sym.length < 4) continue;
    const prefix = sym.slice(0, -2), suffix = sym.slice(-2);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set());
    byPrefix.get(prefix).add(suffix);
  }
  let best = null, bestN = 1;                      // needs >=2 distinct months to be "monthly"
  for (const [prefix, months] of byPrefix) {
    if (months.size > bestN) { bestN = months.size; best = prefix; }
  }
  return best;
}

export function resolveSmileExpiry(rawOI, rawIVTerm, { dte = null, haveSmile = false, rawIV = '', now = null } = {}) {
  let primaryDte = null, primaryCode = null;
  if (rawOI && rawOI.trim()) {
    try {
      const pe = parseOIMatrix(rawOI)?.primaryExpiry;
      primaryDte = pe?.dte ?? null; primaryCode = pe?.code ?? null;
    } catch { /* partial paste */ }
  }
  const hintDte = Number.isFinite(primaryDte) ? primaryDte : (Number.isFinite(dte) ? dte : null);

  // The term-structure table may sit in EITHER box: its own (`rawIVTerm`) or box 1,
  // which auto-detects the shape. Try both or the hint silently vanishes for anyone
  // who pastes the Settlements table into the smile box.
  let rows = null;
  for (const src of [rawIVTerm, rawIV]) {
    if (rows || !src || !src.trim()) continue;
    try { rows = parseSettlementTermStructure(src); } catch { /* partial paste */ }
  }
  if (!Number.isFinite(hintDte) && !(Array.isArray(rows) && rows.length)) return null;

  const out = { dte: Number.isFinite(hintDte) ? hintDte : null, code: primaryCode, date: null,
                matchedDte: null, matchedOn: primaryCode ? 'code' : null,
                tableAsOf: null, tableStaleDays: null,
                // `codeConfirmed` = the code came from the HEATMAP the walls were computed
                // from, so it is the right product by construction. False means it was
                // inferred from the Settlements table by DTE proximity and may name a
                // different product (weekly vs monthly) — the UI must not state it as fact.
                codeConfirmed: !!primaryCode, monthlyRoot: null, matchedIsMonthly: null,
                haveSmile: !!haveSmile };
  if (Array.isArray(rows) && rows.length) {
    const liquid = rows.filter(r => r.straddle > 0 && r.iv > 0);
    const pool = liquid.length ? liquid : rows;
    // Prefer an exact CODE match — absolute, and immune to the two pastes being
    // copied on different days. Fall back to nearest DTE only when the heatmap
    // carried no codes (older/simpler paste shapes).
    let m = primaryCode ? pool.find(r => r.symbol === primaryCode) : null;
    if (m) out.matchedOn = 'code';
    else {
      m = Number.isFinite(hintDte)
        ? pool.slice().sort((a, b) => Math.abs(a.dte - hintDte) - Math.abs(b.dte - hintDte))[0]
        : pool.slice().sort((a, b) => a.dte - b.dte)[0];   // no DTE known → front liquid expiry
      if (m) out.matchedOn = Number.isFinite(hintDte) ? 'dte' : 'front';
    }
    out.monthlyRoot = _monthlyRoot(pool);
    if (m) {
      out.code = m.symbol || out.code; out.date = m.expiry || null; out.matchedDte = m.dte ?? null;
      out.codeConfirmed = out.matchedOn === 'code';
      const sym = String(m.symbol || '');
      out.matchedIsMonthly = out.monthlyRoot ? sym.startsWith(out.monthlyRoot) : null;
      if (out.dte == null) out.dte = m.dte ?? null;
      // How old is this Settlements table REALLY?
      //
      // Do NOT compare its DTE against the heatmap's. The two count from different
      // reference points by design: the Settlements table is published per SETTLEMENT
      // and its DTE counts from that settle date, while the heatmap counts from today.
      // Midweek they differ by 1, over a weekend by 3 — a raw DTE comparison reads that
      // structural offset as staleness and fires every Monday (it did, on real data).
      //
      // The expiry DATE is absolute, so recover the table's own as-of date from it:
      //   asOf = expiryDate − DTE.
      // Only then is "is this old?" answerable, and only against a supplied clock.
      const exp = _parseDMY(m.expiry);
      if (exp && Number.isFinite(out.matchedDte)) {
        const asOf = new Date(exp.getTime() - out.matchedDte * 86400000);
        out.tableAsOf = asOf.toISOString().slice(0, 10);
        if (now != null) {
          const t = new Date(now);
          const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
          out.tableStaleDays = Math.round((today - asOf.getTime()) / 86400000);
        }
      }
    }
  }
  return out;
}

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

// Flat-vol assumption shared by every Greek here, exported so the GEX-flip root-find
// uses the SAME sigma/T as the profile it's meant to describe (two different vols
// would put the flip somewhere the chart's own bars don't support).
export function oiFlatVol(pair) {
  return isIndexFutures(pair) ? 0.20 : pair.includes('XAU') ? 0.18 : 0.12;
}
export const OI_GREEK_T = 14 / 365;   // documented limitation: fixed 14-DTE assumption

// REFERENCE MOVE — the distance scale everything else measures against.
//
// "How far can price plausibly travel?" is what decides whether a strike is a level
// worth drawing or abandoned paper. A fixed percentage cannot answer it: EUR/USD moves
// ~0.9% to expiry where gold moves ~2.5%, and both change with DTE and vol regime.
//
// Prefer the option-implied move (the ATM straddle — the market's own answer). Fall
// back to flat vol so this NEVER depends on a paste being present or correct: the
// index smile boxes held the wrong table and produced a 100%-of-spot "expected move",
// and anything keyed off that number inherited the nonsense. A derived scale that is
// always sane beats a measured one that is sometimes absurd.
export function oiRefMove(inst, pair) {
  const spot = inst?.spot;
  if (!(spot > 0)) return null;
  const em = inst?.expectedMove?.move;
  // On 6J/6C/6S the straddle is quoted in the INVERTED contract's units while spot is in
  // pair terms, so the two are not comparable: USD/JPY produced 0.0018% of spot and
  // USD/CHF 19%. Converting a straddle across the inversion correctly is its own piece of
  // work, so for these pairs use flat vol — which is `spot × sigma × √T` and therefore
  // always in pair units by construction.
  const inverted = futuresIsInverted(pair || inst?.pair || '');
  // ivMetrics already rejects impossible straddles; re-check here so a record saved by
  // an older build (or hand-edited) can't reintroduce one.
  if (!inverted && Number.isFinite(em) && em > 0
      && em > spot * 0.0005 && em < spot * 0.25) return { move: em, source: 'implied' };
  const dte = Number.isFinite(inst?.dte) && inst.dte > 0 ? inst.dte : 14;
  const sig = oiFlatVol(pair || inst?.pair || '');
  return { move: spot * sig * Math.sqrt(dte / 365), source: 'flat-vol' };
}

export function oiGreeks(strike, spot, pair, T = OI_GREEK_T, sigma) {
  if (!(sigma > 0)) sigma = oiFlatVol(pair);   // per-strike IV (v2 smile) when given, else flat vol (v1)
  const d1 = (Math.log(spot/strike) + 0.5*sigma*sigma*T) / (sigma*Math.sqrt(T));
  const nd1 = Math.exp(-0.5*d1*d1) / Math.sqrt(2*Math.PI);
  const gamma = nd1 / (spot*sigma*Math.sqrt(T));
  const callDelta = 0.5*(1+oiErf(d1/Math.SQRT2));
  return { gamma, callDelta, putDelta: callDelta-1 };
}

export function oiCalcExposures(strikes, calls, puts, spot, pair, T = OI_GREEK_T, sigmaFn = null) {
  if (!spot || spot <= 0) return { gex: 0, dex: 0 };
  const cs = isNQ(pair) ? 20 : isES(pair) ? 50 : isYM(pair) ? 5 : isRTY(pair) ? 50
           : isFDAX(pair) ? 25 : isFTSE(pair) ? 10 : pair.includes('XAU') ? 100 : 125000;
  let gex=0, dex=0;
  for (let i=0; i<strikes.length; i++) {
    const {gamma, callDelta, putDelta} = oiGreeks(strikes[i], spot, pair, T, sigmaFn ? sigmaFn(strikes[i]) : undefined);
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

// ── Derivation core ──────────────────────────────────────────────────────────
// Everything the modal computes, with NO DOM: paste text in, a complete store
// entry out. Split out of processOIData so the browser and a headless ingest run
// the SAME code — the alternative was a second implementation in the scraper,
// which is the drift failure TRADABILITY_REVIEW.md documents and the reason the
// vendor-oracle test (js/oiPasteContract.test.mjs) exists.
//
// The six things the modal used to read off the DOM are now parameters:
//   manualFutures  #oiFuturesPrice[data-manual]  — did the user type a price?
//   swapCP         #oiSwapCP                     — inverted-pair call/put flip
//   greekVol       #oiGreekVol                   — 'flat' | 'smile'
//   dashboardQuote window._latestQuote           — last-resort spot
//   priorEntry     oiLoadStore()[pair]           — for the per-expiry history fold
//   baseUrl        (new)                         — '' in a browser; an origin in Node,
//                                                  where a relative /api/… cannot resolve
//
// Returns { inst, … } — inst is COMPLETE and ready to store. It never half-builds:
// a partial entry does not error, it just makes oiStoreToLevels return nothing and
// the bots see a pair with no OI levels.
export async function buildOIEntry({
  pair, rawOI, rawChg = '', rawVol = '', rawIV = '', rawIVTerm = '',
  expiryLabel = '', dteRaw = NaN, spotRaw = NaN, futuresRaw = NaN,
  numLevels = 8, minOI = 20,
  manualFutures = false, swapCP = false, greekVol = 'smile',
  dashboardQuote = null, priorEntry = null, baseUrl = '',
} = {}) {
  if (!rawOI || !rawOI.trim()) return { error: 'no OI data' };
  const parsed = oiParseTable(rawOI);
  if (!parsed || parsed.strikes.length < 2) return { error: 'could not parse' };

  // Which expiry column the walls/max-pain were actually computed from. For a full
  // multi-expiry matrix paste this is auto-selected (nearest expiry with significant
  // near-money OI — the education's rule), NOT the literal front column. Surfaced so
  // the read is transparent, and used to auto-tag the DTE field when left blank.
  const primaryExpiry = parsed.primaryExpiry || null;
  let dteEff = dteRaw;
  if (!Number.isFinite(dteEff) && Number.isFinite(primaryExpiry?.dte)) dteEff = primaryExpiry.dte;

  // The CME matrix header carries the futures price — auto-fill the basis anchor
  // if the field is blank (so the basis is measured, not estimated).
  // ── Futures anchor, in priority order (course L212: the basis needs the CURRENT
  // futures price, and L229: captured at the same moment as spot) ──────────────
  //   1. what you typed          — always wins, you saw both prices together
  //   2. the IV paste title      — QuikStrike's "vs 1.1426 (+0.0032)" = the LIVE price
  //   3. the OI heatmap header   — SETTLEMENT price only; 32 pips stale on 2026-07-24
  // The heatmap header is the weakest source but it's the only one on most pastes,
  // so it stays as the fallback — flagged via `futuresSource` so the card can say
  // which one it used instead of presenting a stale basis as a fresh one.
  const _ivTitle = rawIV.trim() ? parseIVSettlement(rawIV) : null;
  // LIVE, PAIRED, AT ANALYSE TIME — the top priority source. Only a value the user
  // actually typed (dataset.manual==='1') outranks it; an auto-filled field does not,
  // which is what made every record read "manual" before.
  // `futEl` is declared in openOIModal, NOT here — referencing it in this scope threw
  // ReferenceError on every Analyse click (optional chaining does not guard an
  // undeclared identifier, only a null one), and the .catch on the window binding
  // turned that into a silent no-op. Look the element up locally.
  // (was: the #oiFuturesPrice data-manual marker; now a caller-supplied flag)
  const _typed = !!manualFutures;
  const _live = await fetchPairedQuote(pair, baseUrl);
  let futuresEff = null, futuresSource = null, futuresSymbol = null, quoteAt = null, livePairedSpot = null;
  if (_typed && Number.isFinite(futuresRaw)) {
    futuresEff = futuresRaw; futuresSource = 'manual';
  } else if (_live) {
    futuresEff = _live.price; futuresSymbol = _live.symbol; quoteAt = _live.at ?? Date.now();
    futuresSource = _live.kind === 'cfd' ? 'live-cfd-proxy' : `live-${_live.source}`;
    livePairedSpot = Number.isFinite(_live.spot) ? _live.spot : null;
  } else if (Number.isFinite(futuresRaw)) {
    futuresEff = futuresRaw; futuresSource = 'field';
  }
  if (!Number.isFinite(futuresEff) && Number.isFinite(_ivTitle?.futures)) {
    futuresEff = _ivTitle.futures; futuresSource = 'iv-title-live';
  }
  if (!Number.isFinite(futuresEff) && Number.isFinite(parsed.futures)) {
    futuresEff = parsed.futures; futuresSource = 'heatmap-header-settle';
  }
  // The resolved futures price is returned to the caller, which decides
  // whether to reflect it in any UI field.
  // How stale the fallback is, when we can measure it (live title vs settle header).
  const futuresStale = (Number.isFinite(_ivTitle?.futures) && Number.isFinite(parsed.futures))
    ? _ivTitle.futures - parsed.futures : null;

  if (rawChg.trim()) {
    const chg = oiParseChangeTable(rawChg, parsed.strikes.length, parsed.strikes);
    if (chg) { parsed.callChg = chg.callChg; parsed.putChg = chg.putChg; }
  }

  // Resolve OANDA spot (reference for Greeks and basis calculation)
  // Spot: prefer the leg that came back WITH the futures price in the same request —
  // that pairing is the whole point (course L229). The on-screen field was filled when
  // the modal opened, which can be minutes earlier, and pairing those two is exactly
  // how a basis silently absorbs whatever the market did in between.
  let spot = null, spotSource = null;
  if (Number.isFinite(livePairedSpot) && livePairedSpot > 0) { spot = livePairedSpot; spotSource = 'live-paired'; }
  if (!spot && !isNaN(spotRaw)) { spot = spotRaw; spotSource = 'field'; }
  if (!spot && Number.isFinite(dashboardQuote) && dashboardQuote > 0) {
    spot = dashboardQuote; spotSource = 'dashboard-quote';
  }

  // ── Basis conversion: Spot Level = CME Strike − Basis  (Basis = Futures − Spot) ──
  // CME strikes are in futures price terms. We shift them to spot-equivalent levels.
  // If the user entered (or auto-fetched) a CME futures price, use it. Otherwise auto-estimate
  // ATM from the OI put/call balance distribution (same method as estimateSpotFromOI).
  // Inverted pairs (6J/6C/6S): CME prices are foreign-ccy/USD, must invert to get spot-equiv.
  let basis = 0;
  let futuresUsed = null;
  const isJpy = pair === 'USD/JPY' || (pair.includes('JPY') && !pair.startsWith('JPY'));

  if (Number.isFinite(futuresEff) && spot) {
    // Manual / auto-fetched / matrix-header: CME raw price → spot-equivalent for basis
    const futuresSpot = futuresIsInverted(pair) ? 1 / futuresEff : futuresEff;
    basis = futuresSpot - spot;
    futuresUsed = futuresEff;
  } else if (spot && parsed.strikes.length >= 3) {
    // Auto: estimate ATM from OI put/call balance, derive basis from that
    const oiAtm = estimateSpotFromOI(parsed.strikes, parsed.calls, parsed.puts);
    if (oiAtm != null) {
      const atmSpot = futuresIsInverted(pair) ? 1 / oiAtm : oiAtm;
      basis = atmSpot - spot;
    }
  }

  // Guardrail: a basis larger than a few % of spot is not a real futures basis —
  // it's a bad estimate (the OI put/call centroid drifts off ATM when the WHOLE
  // strike ladder is pasted). Applying it would shift every strike by that bogus
  // amount and wreck the levels (gold saw ~$1863 / ~46%). For gold/indices
  // futures≈spot, so the safe fallback is NO shift.
  let basisClamped = false;
  if (basisImplausible(basis, spot)) {
    console.warn(`[OI ${pair}] implausible basis ${basis.toFixed(2)} (${(Math.abs(basis) / spot * 100).toFixed(0)}% of spot ${spot}) — not shifting strikes`);
    basis = 0;
    futuresUsed = null;
    basisClamped = true;
  }

  // Re-parseable copy of the paste for the "reopen → re-analyse" flow.
  //
  // A MULTI-EXPIRY MATRIX IS STORED WHOLE. It used to be collapsed to the single
  // selected expiry's `strike/call/put`, which threw away 17 of 18 columns on every
  // EUR/USD capture — silently defeating the whole point of pasting the full table
  // (a daily OI history is the prerequisite for the wall-decay research in the
  // course notes, and CME publishes no history, so a discarded column is gone for
  // good). It also made the stored artefact look like a flat aggregate paste, which
  // is precisely what misdirected the 2026-07 diagnosis.
  //
  // Only the SIMPLE format still gets compacted — there's nothing extra to keep.
  // `_saveLocalCache` already sheds raw text if localStorage overflows, and KV (the
  // source of truth) has no such cap, so size is handled where it belongs.
  const _isMatrix = !!parsed.primaryExpiry;   // set only by the matrix parser
  const _compactOI = _isMatrix ? rawOI : parsed.strikes
    .map((s, i) => `${s}\t${parsed.calls[i]}\t${parsed.puts[i]}`).join('\n');
  const _hasChg = (parsed.callChg || []).some(v => v) || (parsed.putChg || []).some(v => v);
  const _compactChg = _isMatrix && rawChg.trim() ? rawChg
    : _hasChg ? parsed.strikes.map((s, i) => `${s}\t${parsed.callChg[i] || 0}\t${parsed.putChg[i] || 0}`).join('\n')
    : '';

  // Wall persistence (across-expiry durability) + per-expiry term structure — from
  // the FULL matrix, keyed by ORIGINAL (pre-shift) strikes. persArr aligns to the
  // parsed (near-dated) strikes so it can be attached to each wall by index.
  const _persMap = oiMatrixPersistence(rawOI, minOI);
  const _persArr = parsed.strikes.map(s => _persMap?.get(s) ?? 0);
  const termStructure = oiMatrixTermStructure(rawOI, minOI);   // null for the simple format

  // Apply basis shift to all strikes (converts futures strikes → spot-equivalent prices).
  // Inverted pairs (6J/6C/6S): CME strikes are in foreign-currency-per-USD space, so invert first.
  if (basis !== 0) {
    parsed.strikes = futuresIsInverted(pair)
      ? parsed.strikes.map(s => (1 / s) - basis)
      : parsed.strikes.map(s => s - basis);
  }

  // ── INVERTED-PAIR CALL/PUT SWAP (opt-in, default OFF) ──────────────────────
  //
  // On 6J/6C/6S the CME quotes the FOREIGN currency in USD, so inverting the strike
  // also inverts what the option means. 6J is USD-per-JPY: a 6J CALL pays off when 6J
  // rises — JPY strengthening — which is USD/JPY FALLING. Heavy 6J call OI therefore
  // creates resistance in 6J terms and, once flipped into USD/JPY terms, a FLOOR.
  // On that reading a 6J call wall is a USD/JPY PUT wall, and the labels — plus the
  // direction the bot trades them — are currently backwards for three pairs.
  //
  // That argument is from contract mechanics, not from a reference number, and the
  // live data neither confirms nor refutes it (USD/JPY's put walls also sit below
  // spot; USD/CAD's call wall sits above). So this is a SWITCH, not a correction:
  // default OFF preserves today's behaviour exactly, and flipping it per pair lets
  // paper trading settle the question instead of a guess. Swapping here — before max
  // pain, the walls, the GEX profile and everything downstream — means one flag
  // reaches the export, both bots and the dashboard with no second copy to drift.
  const cpSwapped = futuresIsInverted(pair) && !!swapCP;
  if (cpSwapped) {
    [parsed.calls, parsed.puts] = [parsed.puts, parsed.calls];
    [parsed.callChg, parsed.putChg] = [parsed.putChg, parsed.callChg];
  }

  // Fallback spot for Greeks if OANDA price unavailable
  if (!spot) spot = parsed.strikes[Math.floor(parsed.strikes.length / 2)];

  const maxPain = oiCalcMaxPain(parsed.strikes, parsed.calls, parsed.puts);
  // Greeks time-to-expiry: use the ACTUAL selected-expiry DTE (from pickPrimaryExpiry /
  // the DTE tag) rather than the old fixed 14-DTE assumption. Gamma ∝ 1/√T, so this
  // sharpens GEX magnitude and the gamma/GEX-flip levels to the expiry actually being
  // analysed. Floored at 1 day (avoids the 0-DTE gamma singularity) and capped at 1y.
  // IMPACT: shifts exposures.gex — hence the OI bot's PIN/BREAKOUT regime — and the
  // flip nodes; wall / max-pain LEVELS are raw OI and unaffected. OI_GREEK_T stays the
  // fallback when no DTE is known (the greek fns still default to it).
  const greekT = Math.min(365, Math.max(1, Number.isFinite(dteEff) && dteEff > 0 ? dteEff : 14)) / 365;

  const cs = isNQ(pair) ? 20 : isES(pair) ? 50 : isYM(pair) ? 5 : isRTY(pair) ? 50
           : isFDAX(pair) ? 25 : isFTSE(pair) ? 10 : pair.includes('XAU') ? 100 : 125000;

  // Charm/vanna exposure from a pasted implied-vol surface (CME QuikStrike settlement
  // table). Optional — only when the IV box is filled. Self-consistent: uses the IV
  // paste's OWN strike/OI (one expiry) + the DTE field for T + the real per-strike
  // smile. Absent IV → no greeksFlow (charm/vanna simply not shown).
  let greeksFlow = null, expMove = null, ivDyn = null, ivRR = null, ivSmile = null, ivTerm = null, tsRows = null;
  if (rawIV && rawIV.trim()) {
    // Two accepted shapes. FIRST try the per-EXPIRY "Settlements" table (one ATM row per
    // expiry): it gives the straddle → expected move + an ATM IV term structure directly,
    // but NOT a per-strike smile (so no charm/vanna/skew from it). If it's not that shape,
    // fall back to the per-STRIKE option-settlement chain (the full smile → charm/vanna).
    const ts = parseSettlementTermStructure(rawIV);
    if (ts) {
      tsRows = ts;
      const target = primaryExpiry?.dte ?? (Number.isFinite(dteEff) ? dteEff : (Number.isFinite(dteRaw) ? dteRaw : null));
      const liquid = ts.filter(r => r.straddle > 0 && r.iv > 0);
      const pick = liquid.length
        ? (Number.isFinite(target)
            ? liquid.slice().sort((a, b) => Math.abs(a.dte - target) - Math.abs(b.dte - target))[0]
            : liquid.slice().sort((a, b) => a.dte - b.dte)[0])   // nearest expiry when no target DTE
        : null;
      if (pick) expMove = expectedMoveFromStraddle(spot, pick.straddle, { dte: pick.dte, atmStrike: pick.strike });
      ivTerm = ivTermStructure(ts.map(r => ({ dte: r.dte, iv: r.iv, ivChg: r.ivChg })));
    } else {
    const ivp = parseIVSettlement(rawIV);
    // DTE is auto-read: the IV paste's own header (its exact expiry) wins, then the OI
    // heatmap's known primary-expiry DTE, then the manual field as a last-resort override.
    const dteDays = (ivp && Number.isFinite(ivp.dte)) ? ivp.dte
      : (primaryExpiry?.dte ?? (Number.isFinite(dteEff) ? dteEff : (Number.isFinite(dteRaw) ? dteRaw : null)));
    const dteYrs = dteDays > 0 ? dteDays / 365 : null;
    if (ivp) {
      // Expected move (ATM straddle) + IV dynamics + risk reversal — off the SAME paste.
      expMove = expectedMove(ivp.strikes, ivp.callPx, ivp.putPx, spot, { dte: dteDays });
      ivDyn = ivDynamics(ivp.strikes, ivp.iv, ivp.ivPrior, spot);
      ivRR = riskReversal(ivp.strikes, ivp.iv, spot);
      ivSmile = { strikes: ivp.strikes, iv: ivp.iv, ivPrior: ivp.ivPrior };   // for the smile-curve viz

      if (dteYrs > 0) {
        const ivBy = new Map(ivp.strikes.map((s, i) => [s, ivp.iv[i]]));
        const ex = charmVannaExposure(ivp.strikes, ivp.calls, ivp.puts, spot, { sigmaFn: k => ivBy.get(k), T: dteYrs, mult: cs });
        if (ex) greeksFlow = { cex: ex.cex, vex: ex.vex, charmFlip: ex.charmFlip, vannaFlip: ex.vannaFlip,
          source: 'iv', ivStrikes: ivp.strikes.length, dteDays,
          vanna: vannaState(ex.vex, ivDyn?.atmChg != null ? ivDyn.atmChg / 100 : null) };
      }
    }
    }
  }
  // Optional SECOND paste: the full-product "Settlements" term-structure table, in its
  // own box, so it can sit ALONGSIDE a per-strike chain (box 1 = the smile/charm-vanna
  // for one expiry; box 2 = the IV term structure across all expiries). Box 1's ATM
  // straddle is the more precise expected move, so box 2 only FILLS what box 1 lacks.
  if (rawIVTerm && rawIVTerm.trim()) {
    const ts2 = parseSettlementTermStructure(rawIVTerm);
    if (ts2) {
      if (!tsRows) tsRows = ts2;
      if (!ivTerm) ivTerm = ivTermStructure(ts2.map(r => ({ dte: r.dte, iv: r.iv, ivChg: r.ivChg })));
      if (!expMove) {
        const target = primaryExpiry?.dte ?? (Number.isFinite(dteEff) ? dteEff : (Number.isFinite(dteRaw) ? dteRaw : null));
        const liquid = ts2.filter(r => r.straddle > 0 && r.iv > 0);
        const pick = liquid.length
          ? (Number.isFinite(target)
              ? liquid.slice().sort((a, b) => Math.abs(a.dte - target) - Math.abs(b.dte - target))[0]
              : liquid.slice().sort((a, b) => a.dte - b.dte)[0])
          : null;
        if (pick) expMove = expectedMoveFromStraddle(spot, pick.straddle, { dte: pick.dte, atmStrike: pick.strike });
      }
    }
  }
  // Which expiry to grab for the per-strike SMILE box: the one holding the walls. Prefer
  // the auto-selected primary-expiry DTE (multi-expiry matrix), then the effective/typed
  // DTE field (single-expiry FX or a matrix with no DTE header still has this). If a
  // "Settlements" table is present, match that DTE to its nearest row → the exact
  // QuikStrike CODE + date; with a table but no DTE at all, suggest the front liquid
  // expiry. Only skip the hint entirely when we have neither a DTE nor a table.
  // Same resolution the live on-paste hint uses — ONE function, so the hint you see
  // while pasting can never disagree with the expiry Analyse actually reports.
  const ivPasteHint = resolveSmileExpiry(rawOI, rawIVTerm, {
    dte: Number.isFinite(dteEff) ? dteEff : dteRaw,
    haveSmile: !!greeksFlow,
    rawIV,
  });

  // ── Greek vol source — v1 (flat) vs v2 (pasted IV smile) ────────────────────
  // v1 'flat' = the fixed per-class vol (oiFlatVol). v2 'smile' = the per-strike IV you
  // paste (the SAME surface charm/vanna use), nearest-strike matched; strikes outside the
  // smile fall back to the picked expiry's ATM IV, and flat vol is the last resort. Gamma
  // ∝ 1/σ, so using the real ~7% FX IV instead of the 12% guess materially changes GEX and
  // the flip. Default v1 (behaviour unchanged); flip to v2 to use the paste. Only differs
  // when IV was actually pasted. Shifts exposures.gex → the bot's PIN/BREAKOUT regime.
  // Default v2 (real IV): use the pasted smile / ATM IV when available, flat only as the
  // fallback — so the bot and the vol-forecast export (which read the stored greeks) get
  // the real-vol GEX/flip automatically. Force 'flat' on the select for a v1 A/B.
  const greekVolMode = greekVol === 'flat' ? 'flat' : 'smile';
  const flatSig = oiFlatVol(pair);
  let _smK = null, _smIV = null, _atmRealVol = null;
  if (ivSmile && Array.isArray(ivSmile.strikes) && ivSmile.strikes.length) {
    _smK = ivSmile.strikes; _smIV = ivSmile.iv;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < _smK.length; i++) { const d = Math.abs(_smK[i] - spot); if (d < bd) { bd = d; bi = i; } }
    if (_smIV[bi] > 0) _atmRealVol = _smIV[bi];              // ATM of the smile (decimal)
  }
  if (_atmRealVol == null && Array.isArray(tsRows) && tsRows.length) {
    const tgt = primaryExpiry?.dte ?? (Number.isFinite(dteEff) ? dteEff : null);
    const liq = tsRows.filter(r => r.iv > 0);
    const pick = liq.length
      ? (Number.isFinite(tgt) ? liq.slice().sort((a, b) => Math.abs(a.dte - tgt) - Math.abs(b.dte - tgt))[0]
                              : liq.slice().sort((a, b) => a.dte - b.dte)[0])
      : null;
    if (pick && pick.iv > 0) _atmRealVol = pick.iv / 100;    // term-structure iv is in percent
  }
  const _nearestSmileIV = (k) => {
    if (!_smK) return null;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < _smK.length; i++) { const d = Math.abs(_smK[i] - k); if (d < bd) { bd = d; bi = i; } }
    return (bi >= 0 && _smIV[bi] > 0) ? _smIV[bi] : null;
  };
  const _useSmile = greekVolMode === 'smile' && (!!_smK || _atmRealVol != null);
  const _sigCache = new Map();
  const sigmaFor = (k) => {
    if (_sigCache.has(k)) return _sigCache.get(k);
    let v = flatSig;
    if (_useSmile) { const s = _nearestSmileIV(k); v = (s > 0) ? s : (_atmRealVol > 0 ? _atmRealVol : flatSig); }
    _sigCache.set(k, v); return v;
  };
  const greekVolSource = _useSmile ? (_smK ? 'smile' : 'atm-iv') : 'flat';
  const exposures = oiCalcExposures(parsed.strikes, parsed.calls, parsed.puts, spot, pair, greekT, sigmaFor);

  // ── Full-book GEX (v3) — aggregate gamma across EVERY expiry, each weighted by its own
  // gamma via that expiry's DTE + ATM IV. The SpotGamma/SqueezeMetrics whole-book view.
  // ANALYSIS-ONLY: computed alongside the single-expiry exposures above, NOT wired to the
  // bot — the traded PIN/BREAKOUT regime stays on the validated single-expiry number until
  // this is proven to read the tape better (most likely to matter on indices, not FX).
  let fullBook = null;
  {
    const legs = oiMatrixExpiryLegs(rawOI, { basis, inverted: futuresIsInverted(pair), minOI });
    if (legs && legs.length >= 2) {
      // Each expiry's ATM IV from the settlements term structure (percent→decimal), matched
      // by DTE; flat vol when absent. Per-strike skew per expiry is deferred — gamma is
      // ATM-led, so the ATM level is the first-order correction.
      const atmFor = (dte) => {
        if (Array.isArray(tsRows) && tsRows.length && Number.isFinite(dte)) {
          const liq = tsRows.filter(r => r.iv > 0);
          const pick = liq.length ? liq.slice().sort((a, b) => Math.abs(a.dte - dte) - Math.abs(b.dte - dte))[0] : null;
          if (pick && pick.iv > 0) return pick.iv / 100;
        }
        return flatSig;
      };
      for (const l of legs) l.sigma = atmFor(l.dte);
      fullBook = fullBookGex(legs, spot, { mult: cs, flatSigma: flatSig });
      if (fullBook) fullBook.volSource = (Array.isArray(tsRows) && tsRows.length) ? 'atm-iv' : 'flat';
    }
  }

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
    const {gamma} = oiGreeks(s, spot, pair, greekT, sigmaFor(s));
    const callGex = parsed.calls[i] * gamma * cs * spot;
    const putGex  = parsed.puts[i]  * gamma * cs * spot;
    // Raw OI rides along with the gamma-weighted numbers. This is the only CONTIGUOUS
    // per-strike record stored (topLevels is a top-N ranking, not a ladder), so an
    // OI-by-strike chart has nowhere else to read from — the dashboard's version came
    // out blank because it looked for callOI/putOI here and they didn't exist.
    return { strike:s, callOI: parsed.calls[i], putOI: parsed.puts[i],
             callGex, putGex, netGex: callGex - putGex };
  }).sort((a,b) => a.strike - b.strike);

  // Ranked call walls (highest call OI first) and put walls (highest put OI first)
  const callWalls = parsed.strikes
    .map((s, i) => ({ strike: s, oi: parsed.calls[i], chg: parsed.callChg[i] || 0, persistence: _persArr[i] || 0 }))
    .filter(x => x.oi >= minOI)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, numLevels);
  const putWalls = parsed.strikes
    .map((s, i) => ({ strike: s, oi: parsed.puts[i], chg: parsed.putChg[i] || 0, persistence: _persArr[i] || 0 }))
    .filter(x => x.oi >= minOI)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, numLevels);

  // 3× rule (Lesson 4): tag each wall's strength as its OI vs the surrounding
  // strikes (2 either side), not its raw size — weak/moderate/strong.
  const byStrike = parsed.strikes.map((s, i) => ({ s, c: parsed.calls[i], p: parsed.puts[i] })).sort((a, b) => a.s - b.s);
  const sIdx = new Map(byStrike.map((o, i) => [o.s, i]));
  const neigh = (strike, key) => {
    const i = sIdx.get(strike); if (i == null) return [];
    return [i - 2, i - 1, i + 1, i + 2].filter(j => byStrike[j]).map(j => byStrike[j][key]);
  };
  for (const w of callWalls) { const t = wallStrengthTier(w.oi, neigh(w.strike, 'c')); w.mult = t.multiple; w.tier = t.tier; }
  for (const w of putWalls)  { const t = wallStrengthTier(w.oi, neigh(w.strike, 'p')); w.mult = t.multiple; w.tier = t.tier; }
  const skew = oiSkew(parsed.strikes, parsed.calls, parsed.puts, spot);

  // Concentration — top strikes as a % of total OI (concentrated → sharper
  // reactions). Clusters — merge nearby high-OI strikes into institutional zones
  // (walls are zones, not lines). Cluster width ≈ 20 bps of spot.
  const strikeTotals = parsed.strikes.map((s, i) => (parsed.calls[i] || 0) + (parsed.puts[i] || 0));
  const concentration = oiConcentration(strikeTotals);   // sums strikeTotals internally
  const clusterTol = spot ? spot * 0.002 : 0;
  const clusters = clusterStrikes(
    [...callWalls.map(w => ({ ...w, kind: 'call' })), ...putWalls.map(w => ({ ...w, kind: 'put' }))],
    clusterTol).slice(0, 6);

  // Volume magnets — top strikes by TODAY's volume (Lesson 1: activity vs OI's
  // commitment). Basis-shifted to spot-equivalent like the OI strikes.
  const volShift = (st) => basis !== 0 ? (futuresIsInverted(pair) ? 1 / st - basis : st - basis) : st;
  const _volParsed = oiParseVolume(rawVol);   // ORIGINAL strikes (pre-shift)
  // Compact, re-parseable copy so the volume box survives save + repopulates on
  // reopen (same reason as rawOI/rawChg — the raw text was never stored, so volume
  // vanished and had to be re-pasted).
  const _compactVol = _volParsed.map(v => `${v.strike}\t${v.volume}`).join('\n');
  // Volume magnets must land ON the option ladder. Gold's paste has `6.3 | 3570.8` in
  // its first two columns — the volume report's layout differs from the OI report's, so
  // `oiParseVolume` read 6.3 as a strike, the basis shift turned it into −2.49, and the
  // dashboard duly drew a magnet at minus two dollars, 48,464 pips from spot. Same class
  // of miss as everywhere else: a number that cannot possibly be a strike, stored anyway.
  // Keep only magnets inside the parsed strike range (±10%); if none survive, the paste
  // was the wrong table and an empty list is the honest answer.
  // Bounds computed locally: `_loK`/`_hiK` are declared further down, so reaching for
  // them here would be a temporal-dead-zone ReferenceError — the same trap that made
  // Analyse silently do nothing when `futEl` was referenced out of scope.
  const _volLo = (parsed.strikes.length ? Math.min(...parsed.strikes) : 0) * 0.9;
  const _volHi = (parsed.strikes.length ? Math.max(...parsed.strikes) : 0) * 1.1;
  const _volOK = _volParsed.filter(v => {
    const s = volShift(v.strike);
    return Number.isFinite(s) && s >= _volLo && s <= _volHi;
  });
  const volumeMagnets = _volOK.slice(0, 8).map(v => ({ strike: +volShift(v.strike).toFixed(6), volume: v.volume }));
  const volumeRejected = _volParsed.length > 0 && _volOK.length === 0;
  // Volume-flow reads: per-strike volume (basis-shifted) for the wall "fresh vs stale"
  // tag, + volume put/call ratio (today's directional flow) from the call/put split.
  const _volPost = _volParsed.map(v => ({ strike: volShift(v.strike), volume: v.volume }));
  const _volAt = (strike) => { let best = null, bd = Infinity; for (const v of _volPost) { const d = Math.abs(v.strike - strike); if (d < bd) { bd = d; best = v; } } return (best && bd <= Math.abs(strike) * 0.005) ? best.volume : 0; };
  const _volSplit = parseOIMatrix(rawVol, { mode: 'aggregate' });   // call/put volume split (today's flow)
  const _totCallVol = _volSplit ? _volSplit.calls.reduce((a, b) => a + Math.abs(b), 0) : 0;
  const _totPutVol  = _volSplit ? _volSplit.puts.reduce((a, b) => a + Math.abs(b), 0) : 0;
  const volPcRatio = volumePCRatio(_totCallVol, _totPutVol);   // today's flow (vs the resting OI P/C)
  // Tag each wall fresh/active/stale by today's volume at that strike vs its resting OI.
  for (const w of callWalls) w.fresh = wallFreshness(w.oi, _volAt(w.strike));
  for (const w of putWalls)  w.fresh = wallFreshness(w.oi, _volAt(w.strike));

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

  // Headline wall = nearest spot-relative wall (call above spot, put below spot)
  const _cwHead = callWalls.filter(w => w.strike >= spot).sort((a,b) => a.strike - b.strike)[0] ?? callWalls[0] ?? null;
  const _pwHead = putWalls.filter(w => w.strike <= spot).sort((a,b) => b.strike - a.strike)[0] ?? putWalls[0] ?? null;

  // Spot must sit INSIDE the parsed ladder. A truncated paste can leave spot above the
  // top strike, which is the tell that levels were lost — checked below via _hiK.
  // Mis-scale / stale guard: if spot sits well OUTSIDE the option strike range, the
  // paste is at the wrong price level (futures price not detected → basis not
  // subtracted, wrong expiry, or stale). Same check the bot producer uses — surfaced
  // here so the card/brief flag it instead of silently analysing broken data.
  const _loK = parsed.strikes.length ? Math.min(...parsed.strikes) : 0;
  const _hiK = parsed.strikes.length ? Math.max(...parsed.strikes) : 0;
  // The old guard was a single ORDER-OF-MAGNITUDE range check, and that is exactly
  // why the 2026-07 failure was invisible: a wrong-expiry paste with a 15-pip basis
  // error sits comfortably inside the strike range, so nothing fired and the card
  // looked green. These extra checks are SEMANTIC — they test whether the numbers
  // mean what they claim, not just whether they're the right size.
  const _warnings = [];
  if (volumeRejected) {
    // Name the actual numbers. The first version of this said the strikes "fall outside
    // the option ladder", which is jargon for "column 1 isn't a strike" and told the
    // reader nothing they could act on. Gold's paste has 6.3 in that column on every
    // row against strikes of 2000-10000, so the fix is a different copy, not a setting.
    const _vBad = _volParsed[0]?.strike;
    _warnings.push(`volume ignored: its first column reads ${_vBad} on this paste, which is not a strike for ${pair} `
      + `(strikes here run ${oiFmtStrike(_volLo / 0.9, pair)}–${oiFmtStrike(_volHi / 1.1, pair)}). `
      + `Copy the Volume view whose FIRST column is the strike price — otherwise there is no strike to attach each volume to.`);
  }
  // Truncation FIRST — it silently deletes strikes, and every level below is computed
  // on whatever survived. Gold lost every strike above 4010 (spot was 4078) this way.
  if (parsed.truncated)
    _warnings.push(`paste exceeded ${MAX_STRIKE_ROWS} strike rows and was TRUNCATED — levels above ${oiFmtStrike(_hiK, pair)} are missing; re-paste a narrower strike range`);
  if (spot > 0 && parsed.strikes.length >= 3 && (spot < _loK * 0.9 || spot > _hiK * 1.1))
    _warnings.push(`spot ${oiFmtStrike(spot, pair)} is outside the option strike range ${oiFmtStrike(_loK, pair)}–${oiFmtStrike(_hiK, pair)} — likely stale or mis-scaled (check the futures price / expiry and re-paste)`);
  if (primaryExpiry?.anchorValid === false)
    _warnings.push(`the futures anchor did not match the strike ladder — expiry was chosen from a median-strike fallback, so double-check the level`);
  if (primaryExpiry?.scoredOn === 'totalOI')
    _warnings.push(`no near-the-money OI in any expiry — expiry picked on TOTAL OI, which favours far-dated tail hedges (course pitfall 2)`);
  if (futuresSource === 'heatmap-header-settle' && Number.isFinite(futuresStale) && Math.abs(futuresStale) > 0)
    _warnings.push(`basis used the SETTLEMENT futures price; the live price was ${Math.abs(futuresStale / (pair.includes('JPY') ? 0.01 : 0.0001)).toFixed(0)} pips away — enter the current futures price for an accurate basis (course L229)`);
  if (!Number.isFinite(dteEff))
    _warnings.push(`no DTE resolved — wall strength and gamma are expiry-dependent (course pitfall 2); paste the QuikStrike title line or fill the DTE field`);
  const dataWarning = _warnings.length ? _warnings.join(' · ') : null;

  const inst = {
    pair, spot, futures: futuresUsed, basis: basis || null,
    cpSwapped,       // inverted pairs only: were call/put labels flipped into pair terms?
    futuresSource,   // 'manual' | 'live-yahoo' | 'live-cfd-proxy' | 'iv-title-live' | 'heatmap-header-settle' | 'field'
    futuresSymbol,   // e.g. GC=F / 6E=F — WHICH contract the price came from
    spotSource,      // 'live-paired' when both legs came from one request (the honest basis)
    quoteAt,         // when that paired quote was taken, so a stale basis is provable
    futuresStale,    // live-title minus heatmap-settle, when both are available (how wrong the fallback would be)
    basisAt: Date.now(),   // the basis is only valid for the moment both legs were read (course L229)
    maxPain, exposures, topLevels, gexProfile,
    gammaFlip: gammaFlip(gexProfile, spot),   // nearest-spot interpolated crossing of the per-strike profile
    // The rigorous flip: total net GEX re-evaluated at candidate prices, root-found.
    // Gamma depends on where spot IS, so scanning the ladder once at today's spot
    // (gammaFlip above) answers a different question and can land hundreds of points
    // away — gold: 3,655 vs ~4,100. Same flat sigma/T as the profile, so the two are
    // describing one book. Kept ALONGSIDE gammaFlip rather than replacing it, because
    // the bot and export already consume that field.
    gexFlip: gexFlipPrice(parsed.strikes, parsed.calls, parsed.puts, {
      sigmaFn: sigmaFor, sigma: flatSig, T: greekT, mult: cs, spot }),
    greekVolMode, greekVolSource,   // v1 'flat' vs v2 'smile'/'atm-iv' — which vol the gamma/GEX/flip used
    fullBook,   // v3 full-book GEX across ALL expiries (analysis-only; bot uses single-expiry exposures)
    dataWarning,   // ⚠ set when spot is far outside the strike range (stale/mis-scaled paste) — flag, don't silently analyse
    greeksFlow,   // charm/vanna exposure from a pasted IV surface (null unless the IV box is filled)
    expectedMove: expMove,   // ATM straddle → option-implied ± range to expiry
    // One distance scale, computed once, shared by wall relevance / reachability /
    // anything else that needs "how far can price plausibly go". Implied when the
    // straddle is trustworthy, flat-vol otherwise — never absent, never absurd.
    refMove: oiRefMove({ spot, dte: dteEff, expectedMove: expMove }, pair),
    ivDynamics: ivDyn,       // ATM IV change + skew steepening (tail-hedge demand)
    riskReversal: ivRR,      // OTM put−call IV skew (directional sentiment tilt)
    ivSmile,                 // per-strike IV (+ prior) for the smile-curve viz — render-only
    ivTermStructure: ivTerm, // ATM IV across expiries (from the "Settlements" per-expiry paste)
    ivPasteHint,             // which expiry (code+date) to grab for the per-strike SMILE box
    callWall: _cwHead?.strike ?? 0, putWall: _pwHead?.strike ?? 0,
    callWallOI: _cwHead?.oi ?? 0,   putWallOI: _pwHead?.oi ?? 0,
    callWalls, putWalls, skew, volumeMagnets, concentration, clusters,
    volFlow: (volPcRatio != null) ? { volPcRatio, oiPcRatio: +pcRatio.toFixed(2),   // today's flow vs resting positioning
      divergence: Math.abs(Math.log((volPcRatio || 1) / Math.max(pcRatio, 0.01))) > 0.4 } : null,
    termStructure,   // per-expiry max pain / walls / DTE — for the daily brief & analysis (not the bot)
    primaryExpiry,   // the expiry the walls/max-pain were auto-selected from (DTE + near-money OI)
    dte: Number.isFinite(dteEff) ? dteEff : (primaryExpiry?.dte ?? null),
    totalCallOI, totalPutOI, pcRatio, totalCallChg, totalPutChg,
    callChgAbove, callChgBelow, putChgAbove, putChgBelow,
    numRows: parsed.strikes.length, numLevels, minOI,
    savedAt: new Date().toLocaleString(),
    savedAtMs: Date.now(),
    rawOI: _compactOI,
    rawChg: _compactChg,
    rawVol: _compactVol,
    rawIV: rawIV && rawIV.trim() ? rawIV : null,   // QuikStrike IV settlement paste (for charm/vanna re-parse on reopen)
    rawIVTerm: rawIVTerm && rawIVTerm.trim() ? rawIVTerm : null   // "Settlements" term-structure paste (re-parse on reopen)
  };

  // Per-expiry: preserve prior expiry entries and record THIS paste under its label
  // (near-dated = strongest gamma/pin — Lesson 5). The top-level inst stays the
  // primary/combined view; `expiries` builds up a DTE-keyed sub-view over saves.
  const priorExpiries = priorEntry?.expiries || {};
  if (expiryLabel && Number.isFinite(dteEff)) {
    priorExpiries[expiryLabel] = { dte: dteEff, savedAtMs: Date.now(),
      maxPain, callWall: inst.callWall, putWall: inst.putWall,
      callWalls: callWalls.slice(0, 8), putWalls: putWalls.slice(0, 8), pcRatio };
  }
  if (Object.keys(priorExpiries).length) inst.expiries = priorExpiries;
  return { inst, parsed, maxPain, basis, basisClamped, primaryExpiry, ivPasteHint,
           futuresEff, dteEff };
}

export async function processOIData() {
  const pair = S.currentPair ? S.currentPair.symbol : document.getElementById('oiPairSelect').value;
  const rawOI = document.getElementById('oiRawData').value;
  const rawChg = document.getElementById('oiChangeData').value;
  const rawVol = document.getElementById('oiVolumeData')?.value || '';
  const rawIV = document.getElementById('oiIVData')?.value || '';   // optional QuikStrike settlement paste (implied vol → charm/vanna)
  const rawIVTerm = document.getElementById('oiIVTermData')?.value || '';   // optional 2nd paste: "Settlements" per-expiry table → IV term structure
  const expiryLabel = (document.getElementById('oiExpiryLabel')?.value || '').trim();
  const dteRaw = parseFloat(document.getElementById('oiDTE')?.value);
  const spotRaw    = parseFloat(document.getElementById('oiSpotPrice').value);
  const futuresRaw = parseFloat(document.getElementById('oiFuturesPrice')?.value);
  const numLevels = parseInt(document.getElementById('oiNumLevels').value) || 8;
  const minOI = parseInt(document.getElementById('oiMinOI').value) || 20;


  if (!rawOI.trim()) { oiToast('Paste CME OI data first', true); return; }

  const store = oiLoadStore();
  const res = await buildOIEntry({
    pair, rawOI, rawChg, rawVol, rawIV, rawIVTerm, expiryLabel, dteRaw,
    spotRaw, futuresRaw, numLevels, minOI,
    manualFutures: document.getElementById('oiFuturesPrice')?.dataset?.manual === '1',
    swapCP: !!document.getElementById('oiSwapCP')?.checked,
    greekVol: document.getElementById('oiGreekVol')?.value,
    dashboardQuote: (window._latestQuote && S.currentPair && S.currentPair.symbol === pair)
      ? (window._latestQuote.price ?? window._latestQuote.mid) : null,
    priorEntry: store[pair],
  });
  if (res.error) { oiToast(res.error === 'could not parse'
    ? 'Could not parse — check data format' : 'Paste CME OI data first', true); return; }
  const { inst, parsed, maxPain, basis, basisClamped, primaryExpiry, ivPasteHint, futuresEff } = res;
  // Reflect the resolved futures price back into the field (UI only).
  {
    const fe = document.getElementById('oiFuturesPrice');
    if (fe && !fe.value && Number.isFinite(futuresEff)) fe.value = String(futuresEff);
  }
  store[pair] = inst;
  const _saved = oiSaveStore(store);   // async KV union-merge + local cache

  // Analyse is now the LAST step, always. The smile expiry is surfaced live by
  // `updateSmileHint` the moment the OI + Settlements tables are pasted, so by the
  // time you press Analyse you have already decided whether to add the smile (it is
  // optional — walls, max pain, term structure and expected move don't need it).
  // The old two-stage keep-open flow existed only because the expiry code couldn't be
  // known before a full Analyse; with the hint firing on paste it just nags.
  document.getElementById('oiRawData').value='';
  document.getElementById('oiChangeData').value='';
  document.getElementById('oiSpotPrice').value='';
  ['oiVolumeData', 'oiExpiryLabel', 'oiDTE'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const futEl = document.getElementById('oiFuturesPrice');
  if (futEl) futEl.value='';
  const basisEl = document.getElementById('oiBasisDisplay');
  if (basisEl) { basisEl.textContent = 'Enter CME futures price above — basis will be auto-calculated and applied to all strikes on save'; basisEl.style.color=''; }
  const hintEl = document.getElementById('oiSmileHint');
  if (hintEl) { hintEl.style.display = 'none'; hintEl.innerHTML = ''; }
  closeOIModal();
  window.renderAll();
  const basisNote = basisClamped ? ' · basis ignored (implausible — no shift applied)'
    : basis ? ` · basis ${basis >= 0 ? '+' : ''}${basis.toFixed(pair.includes('JPY') ? 2 : isIndexFutures(pair) ? 2 : 5)}` : '';
  const pairLabel = OI_FRIENDLY[pair] || pair;
  // Show which expiry drove the walls when it was auto-selected from a multi-expiry
  // matrix (so a full-table paste never silently reads the wrong/empty column).
  const expiryNote = Number.isFinite(primaryExpiry?.dte)
    ? ` · walls from ${primaryExpiry.dte} DTE expiry (${primaryExpiry.nearOI.toLocaleString()} near-money OI)` : '';
  // Point the user at the exact expiry to grab for the SMILE box (charm/vanna/skew) —
  // only when it isn't already pasted. Code+date if a Settlements table let us decode it.
  const smileHint = (ivPasteHint && !ivPasteHint.haveSmile)
    ? (ivPasteHint.code
        ? ` · 💡 smile box → paste expiry ${ivPasteHint.code}${ivPasteHint.date ? ` (${ivPasteHint.date})` : ''}`
        : ` · 💡 smile box → paste the ~${ivPasteHint.dte} DTE expiry's per-strike chain`)
    : '';
  oiToast(`${pairLabel} OI saved · ${parsed.strikes.length} strikes · max pain ${oiFmtStrike(maxPain,pair)}${expiryNote}${basisNote}${smileHint}`, basisClamped);


  // Push updated entry data to Railway bot AFTER the KV merge lands so the sync
  // reads the freshly-merged store (not a half-written one).
  Promise.resolve(_saved).then(() => window._forceKVSync?.()).catch(() => {});
}

export async function removeOIInstrument(pair) {
  const store = oiLoadStore();
  delete store[pair];
  // Explicit KV removal — oiSaveStore union-merges and would NOT drop the pair.
  try {
    let kvStore = {};
    try { const o = await kvGet('oi_store'); kvStore = o?.data || {}; } catch {}
    delete kvStore[pair];
    await kvSet('oi_store', kvStore);
  } catch (e) { console.warn('[OI] KV delete failed:', e?.message); }
  _saveLocalCache(store);
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

// IV-smile curve: per-strike implied vol (today vs prior) as a compact SVG line
// chart — the shape shows the SKEW (asymmetry), the gap between curves shows which
// strikes' IV moved (steepening). ATM + flip references drawn. render-only.
export function renderSmileChart(smile, spot, pair) {
  const S = smile?.strikes, IV = smile?.iv, IVp = smile?.ivPrior;
  if (!Array.isArray(S) || S.length < 3) return '';
  const order = S.map((s, i) => i).sort((a, b) => S[a] - S[b]);
  const xs = order.map(i => S[i]);
  const today = order.map(i => IV[i]);
  const prior = order.map(i => (Number.isFinite(IVp?.[i]) ? IVp[i] : null));
  const allV = today.concat(prior.filter(Number.isFinite));
  const vmin = Math.min(...allV), vmax = Math.max(...allV);
  const W = 320, H = 120, pad = 6;
  const xmin = xs[0], xmax = xs[xs.length - 1];
  const px = s => pad + (xmax === xmin ? 0 : (s - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const py = v => (H - pad) - (vmax === vmin ? 0 : (v - vmin) / (vmax - vmin)) * (H - 2 * pad);
  const path = (vals) => vals.map((v, k) => v == null ? null : `${px(xs[k]).toFixed(1)},${py(v).toFixed(1)}`)
    .filter(Boolean).join(' ');
  const atmX = spot > 0 ? px(Math.max(xmin, Math.min(xmax, spot))) : null;
  const fmtV = v => (v * 100).toFixed(1);
  return `
  <div class="oi-gamma-section">
    <div class="oi-gamma-hd">IV Smile (implied vol per strike)
      <div class="oi-gamma-hd-right">
        <div class="oi-gamma-legend"><div class="oi-gamma-legend-dot" style="background:var(--teal)"></div>today</div>
        <div class="oi-gamma-legend"><div class="oi-gamma-legend-dot" style="background:var(--text3)"></div>prior</div>
      </div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:var(--s2);border-radius:6px">
      ${atmX != null ? `<line x1="${atmX.toFixed(1)}" y1="${pad}" x2="${atmX.toFixed(1)}" y2="${H - pad}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3 3"/>` : ''}
      ${prior.some(Number.isFinite) ? `<polyline points="${path(prior)}" fill="none" stroke="var(--text3)" stroke-width="1.2" stroke-dasharray="3 2"/>` : ''}
      <polyline points="${path(today)}" fill="none" stroke="var(--teal)" stroke-width="1.6"/>
    </svg>
    <div style="font-size:9px;color:var(--text3);margin-top:4px">IV ${fmtV(vmin)}%–${fmtV(vmax)}% · strikes ${oiFmtStrike(xmin, pair)}–${oiFmtStrike(xmax, pair)} · gold line = spot. Curve asymmetry = skew; gap to the prior curve = which strikes' IV moved (steepening).</div>
  </div>`;
}

// Compact IV-surface reads for the analyser card: expected move + IV term structure
// (both real), charm/vanna + RR (context), and the smile-box paste hint. Returns '' if
// nothing IV-related is available.
function _oiIVReads(inst, pair) {
  const rows = [];
  const em = inst.expectedMove;
  if (em && em.move != null) rows.push(`<b>Expected move</b> ±${(+em.move).toLocaleString()} (${em.pct}%)${em.dte != null ? ` to ${em.dte}DTE` : ''} · range ${(+em.lower).toLocaleString()}–${(+em.upper).toLocaleString()}`);
  const its = inst.ivTermStructure;
  if (its) rows.push(`<b>IV term</b> ${its.front.dte}D ${its.front.iv}% → ${its.back.dte}D ${its.back.iv}% (${its.shape === 'inverted' ? 'inverted — near-term stress priced' : its.shape === 'upward' ? 'upward — normal' : 'flat'})`);
  const g = inst.greeksFlow;
  if (g) rows.push(`<b>Charm/vanna</b> CEX ${g.cex >= 0 ? '+' : ''}${g.cex} · VEX ${g.vex >= 0 ? '+' : ''}${g.vex}${g.vanna ? ` · vanna ${g.vanna.state}${g.vanna.firing ? ' firing' : ''}` : ''} <span style="color:var(--text3)">(context, indices only)</span>`);
  const rr = inst.riskReversal;
  if (rr) rows.push(`<b>Risk reversal</b> ${rr.rr >= 0 ? '+' : ''}${rr.rr} (${rr.tilt}) <span style="color:var(--text3)">(context)</span>`);
  // Smile-box paste hint — only when the per-strike smile isn't loaded yet.
  const h = inst.ivPasteHint;
  const hint = (h && !h.haveSmile)
    ? `<div style="font-size:10px;color:var(--gold);margin-top:3px">💡 For charm/vanna/skew, paste the <b>smile box</b> with expiry ${h.code ? `<b>${h.code}</b>${h.date ? ` (${h.date})` : ''}` : `~${h.dte} DTE`} — where your walls sit.</div>` : '';
  if (!rows.length && !hint) return '';
  return `<div class="oi-iv-reads" style="font-size:11px;padding:6px 13px;border-top:1px solid var(--border);line-height:1.6">
    ${rows.map(r => `<div>${r}</div>`).join('')}${hint}
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

  // Suggested OI targets relative to spot — nearest opposing wall is the natural barrier
  const _upWall = callWalls.filter(w => w.strike > spot).sort((a,b) => a.strike - b.strike)[0] || null;
  const _dnWall = putWalls.filter(w => w.strike < spot).sort((a,b) => b.strike - a.strike)[0] || null;
  const _mpDir  = maxPain > spot ? 'above — pulls up' : maxPain < spot ? 'below — pulls down' : 'at spot';

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

  // Side-by-side wall lists — calls above spot only, puts below spot only
  const callWallsAbove = callWalls.filter(w => w.strike >= spot);
  const putWallsBelow  = putWalls.filter(w => w.strike <= spot);
  const maxCallOI = callWallsAbove.length ? callWallsAbove[0].oi : 1;
  const maxPutOI  = putWallsBelow.length  ? putWallsBelow[0].oi  : 1;
  const callWallRows = callWallsAbove.map((w, i) => {
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
  }).join('') || '<div class="oi-wall-empty">none above spot</div>';
  const putWallRows = putWallsBelow.map((w, i) => {
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
  }).join('') || '<div class="oi-wall-empty">none below spot</div>';

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

  <div class="oi-walls-grid" style="margin-top:0">
    <div class="oi-walls-col">
      <div class="oi-walls-hd oi-walls-hd-call">Upside target (call wall)</div>
      <div style="padding:4px 8px;font-size:11px">${_upWall ? `<strong style="color:var(--red)">${oiFmtStrike(_upWall.strike,pair)}</strong> <span style="color:var(--text3)">${oiFmtOI(_upWall.oi)} OI</span>` : '<span style="color:var(--text3)">none above spot</span>'}</div>
    </div>
    <div class="oi-walls-col">
      <div class="oi-walls-hd oi-walls-hd-put">Downside target (put wall)</div>
      <div style="padding:4px 8px;font-size:11px">${_dnWall ? `<strong style="color:var(--green)">${oiFmtStrike(_dnWall.strike,pair)}</strong> <span style="color:var(--text3)">${oiFmtOI(_dnWall.oi)} OI</span>` : '<span style="color:var(--text3)">none below spot</span>'}</div>
    </div>
  </div>
  <div style="font-size:9px;color:var(--text3);padding:2px 13px 6px">Magnet: max pain ${oiFmtStrike(maxPain,pair)} (${_mpDir}) · walls are barriers, max pain is the expiry pull</div>

  <div class="oi-levels">
    <div class="oi-level-hd">Top ${topLevels.length} by combined OI &nbsp;·&nbsp; ${numRows} total strikes</div>
    ${levelRows}
  </div>

  ${renderGammaChart(gexProfile, spot, pair, maxPain)}
  ${inst.ivSmile ? renderSmileChart(inst.ivSmile, spot, pair) : ''}
  ${_oiIVReads(inst, pair)}

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
