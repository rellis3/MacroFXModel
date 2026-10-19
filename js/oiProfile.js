/**
 * OI PROFILE — everything the "OI Profile" TradingView indicator draws for ONE instrument, built from the stored OI record:
 *
 *   • the STRONGEST-DTE book: the DTE bucket (0–1, 2–7, 8–45, 46+ days) carrying the most gamma near spot — its call/put walls, gamma peak, per-strike gamma and vanna are
 *     what the profile shows (the ripple, js/rippleBook.js: near expiry is a tall spike, far expiry a plateau, so "which expiry matters today" is a real question)
 *   • reaction levels: call/put walls, gamma peak, zero gamma (the hedging map's, js/hedgingScenario.js), GEX flip, max pain, vanna/charm flips, volume magnets,
 *     implied-move edges — each with strength, calibrated P(touch)/ETA when supplied, and the expectation word the existing export uses (js/levelExpectation.js)
 *   • binned per-strike gamma / vanna / volume bars, the IV smile (REAL strikes only — nothing is invented to fill the wings), and the hedging-map curves ("helix")
 *
 * EVIDENCE STATUS (printed in the header of the export): the GEX sign as a RANGE read is real on NQ; walls/flips as reaction levels reacted like any neighbouring
 * strike in our placebo tests (oi_research_book/RIPPLE_BOOK_RESULTS.md). This is a picture of the book, not a signal.
 *
 * Pure. `buildOiProfile` returns a plain object; `buildProfileText` serialises it as pipe-delimited lines the Pine indicator parses.
 */
import { oiBookLegs } from './oi.js';
import { gexLadder } from './gexLadder.js';
import { levelExpectation } from './levelExpectation.js';
import { RIPPLE_BUCKETS } from './rippleBook.js';

const LABEL = { call_wall: 'CALL WALL', put_wall: 'PUT WALL', gamma_peak: 'GAMMA PEAK', zero_gamma: 'ZERO GAMMA', gex_flip: 'GEX FLIP', max_pain: 'MAX PAIN',
  vanna_flip: 'VANNA FLIP', charm_flip: 'CHARM FLIP', oi_volume: 'VOLUME', exp_hi: 'EXP MOVE ↑', exp_lo: 'EXP MOVE ↓' };
const EXPECT_TYPE = { call_wall: 'call_wall', put_wall: 'put_wall', zero_gamma: 'gex_flip', gex_flip: 'gex_flip', max_pain: 'max_pain', vanna_flip: 'vanna_flip',
  charm_flip: 'charm_flip', oi_volume: 'oi_volume' };
const bucketOf = dte => (Number.isFinite(dte) ? RIPPLE_BUCKETS.find(b => dte <= b.max) : null) || RIPPLE_BUCKETS[RIPPLE_BUCKETS.length - 1];
const r4 = v => (Number.isFinite(v) ? +(+v).toPrecision(8) : null);
const sum = a => a.reduce((x, y) => x + y, 0);

/**
 * opts: { sym, legs?, mult?, flat?  (override oiBookLegs — tests / callers that already have the book),
 *         hedge?  (hedgingScenario(...) result: zero gamma, curves, regime),
 *         reach?  (price => { p: 0..1, eta: minutes|null } | null),
 *         bins?   (target number of price bins across ±windowRm, default 70), windowRm? (default 3.2) }
 */
export function buildOiProfile(inst, opts = {}) {
  const book = opts.legs ? { legs: opts.legs, spot: inst?.spot, mult: opts.mult ?? 1, flat: opts.flat ?? 0.2 } : oiBookLegs(inst);
  if (!book || !(book.spot > 0) || !book.legs?.length) return null;
  const { legs, spot, mult, flat } = book;
  // ONE DAY's move: the forecast σ in price units (the caller passes opts.dayMove). inst.refMove is the implied move to the PRIMARY expiry — for gold that is ±5% to a
  // 41-day expiry, 4× a day — so it is only a fallback. The window is ±windowRm × this: ~1.5× the p90 one-sided range, so a big day is still on the page.
  const rm = (opts.dayMove > 0 ? opts.dayMove : null) ?? (inst?.refMove?.move > 0 ? inst.refMove.move : null) ?? spot * 0.01;
  const windowRm = opts.windowRm ?? 2.5, nBins = opts.bins ?? 60;
  const winFrac = Math.min(0.15, windowRm * rm / spot);

  // ── 1. which DTE bucket carries the gamma near spot? ──────────────────────────────────────────────────────────────
  const byBucket = {};
  for (const l of legs) (byBucket[bucketOf(l.dte).id] ||= []).push(l);
  const bucketStat = [];
  for (const b of RIPPLE_BUCKETS) {
    const ls = byBucket[b.id]; if (!ls?.length) continue;
    const lad = gexLadder(ls, spot, { mult, flatSigma: flat, windowFrac: winFrac, maxSeries: 99 });
    if (!lad) continue;
    const near = lad.strikes.map((k, i) => (Math.abs(k - spot) <= 2 * rm ? i : -1)).filter(i => i >= 0);
    const abs = sum(near.map(i => sum(lad.series.map(s => Math.abs(s.call[i]) + Math.abs(s.put[i])))));
    bucketStat.push({ id: b.id, label: b.label, abs, lad, legs: ls });
  }
  if (!bucketStat.length) return null;
  const total = sum(bucketStat.map(b => b.abs)) || 1;
  const strong = bucketStat.reduce((m, b) => (b.abs > m.abs ? b : m), bucketStat[0]);
  const lad = strong.lad, n = lad.strikes.length;
  const call = new Array(n).fill(0), put = new Array(n).fill(0), van = new Array(n).fill(0);
  for (const s of lad.series) for (let i = 0; i < n; i++) { call[i] += s.call[i]; put[i] += s.put[i]; van[i] += s.vanna[i]; }
  const net = call.map((c, i) => c - put[i]);

  // ── 2. reaction levels ───────────────────────────────────────────────────────────────────────────────────────────
  const levels = [];
  const add = (type, price, strength = 0.5, extra = {}) => { if (Number.isFinite(price) && Math.abs(price - spot) <= windowRm * rm) levels.push({ type, price, strength, ...extra }); };
  const topSide = (arr, above) => lad.strikes.map((k, i) => ({ k, v: arr[i], i })).filter(x => (above ? x.k > spot : x.k < spot) && x.v > 0).sort((a, b) => b.v - a.v);
  const distinct = (list, k = 2) => { const out = []; for (const x of list) if (out.every(o => Math.abs(o.k - x.k) > 0.12 * rm)) out.push(x); return out.slice(0, k); };
  const cmax = Math.max(...call, 1e-12), pmax = Math.max(...put, 1e-12);
  distinct(topSide(call, true), 2).forEach((x, i) => add('call_wall', x.k, x.v / cmax, { rank: i + 1 }));
  distinct(topSide(put, false), 2).forEach((x, i) => add('put_wall', x.k, x.v / pmax, { rank: i + 1 }));
  const peak = lad.strikes.map((k, i) => ({ k, v: Math.abs(net[i]) })).sort((a, b) => b.v - a.v)[0];
  const nmax = Math.max(...net.map(Math.abs), 1e-12);
  if (peak) add('gamma_peak', peak.k, peak.v / nmax);
  const zg = (opts.hedge?.zeroGamma || []).slice().sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot))[0];
  if (zg) add('zero_gamma', zg.price, 0.9);
  else if (Number.isFinite(inst?.gexFlip)) add('gex_flip', inst.gexFlip, 0.8);
  if (zg && Number.isFinite(inst?.gexFlip) && Math.abs(inst.gexFlip - zg.price) > 0.1 * rm) add('gex_flip', inst.gexFlip, 0.5);
  add('max_pain', inst?.maxPain, 0.6);
  const gk = inst?.greeksFlow || {};
  add('vanna_flip', gk.vannaFlip, 0.45); add('charm_flip', gk.charmFlip, 0.4);
  const vmags = (inst?.volumeMagnets || []).slice(0, 6).filter(v => Number.isFinite(v.strike)); const vmx = Math.max(...vmags.map(v => v.volume || 0), 1);
  vmags.slice(0, 2).forEach(v => add('oi_volume', v.strike, (v.volume || 0) / vmx));
  const emRaw = inst?.expectedMove, em = emRaw;
  const emDay = (emRaw && Number.isFinite(emRaw.dte) && emRaw.dte <= 2) ? { upper: emRaw.upper, lower: emRaw.lower } : (opts.dayMove > 0 ? { upper: spot + opts.dayMove, lower: spot - opts.dayMove } : null);
  if (emDay) { add('exp_hi', emDay.upper, 0.3); add('exp_lo', emDay.lower, 0.3); }
  for (const l of levels) {
    l.label = LABEL[l.type] + (l.rank ? ` ${l.rank}` : '');
    const ex = EXPECT_TYPE[l.type] ? levelExpectation({ type: EXPECT_TYPE[l.type], price: l.price }, { spot, gexFlips: inst?.gexFlips, gammaFlip: inst?.gammaFlip, refMove: rm }) : null;
    l.expect = ex?.short || ({ gamma_peak: 'Biggest gamma', vanna_flip: 'IV-driven', charm_flip: 'Time pull', exp_hi: 'Range edge', exp_lo: 'Range edge' }[l.type] ?? '');
    const r = opts.reach ? opts.reach(l.price) : null;
    l.touchPct = r && Number.isFinite(r.p) ? Math.round(r.p * 100) : null; l.etaMin = r && Number.isFinite(r.eta) ? Math.round(r.eta) : null;
  }
  levels.sort((a, b) => b.price - a.price);

  // ── 3. binned bars ───────────────────────────────────────────────────────────────────────────────────────────────
  const lo = spot - windowRm * rm, hi = spot + windowRm * rm, bw = (hi - lo) / nBins;
  const binOf = p => Math.floor((p - lo) / bw);
  const mk = () => new Array(nBins).fill(0);
  const gC = mk(), gP = mk(), gV = mk(), vol = mk();
  lad.strikes.forEach((k, i) => { const b = binOf(k); if (b >= 0 && b < nBins) { gC[b] += call[i]; gP[b] += put[i]; gV[b] += van[i]; } });
  for (const r of inst?.volCP || []) { const b = binOf(r[0]); if (b >= 0 && b < nBins) vol[b] += (r[1] || 0) + (r[2] || 0); }
  const rows = (fn) => Array.from({ length: nBins }, (_, b) => fn(b)).filter(Boolean);
  const mid = b => lo + (b + 0.5) * bw;
  const gex = rows(b => ((gC[b] || gP[b]) ? { price: mid(b), net: gC[b] - gP[b], call: gC[b], put: gP[b] } : null));
  const vanna = rows(b => (gV[b] ? { price: mid(b), v: gV[b] } : null));
  const volume = rows(b => (vol[b] ? { price: mid(b), v: vol[b] } : null));

  // ── 4. IV smile: real points only (best-covered smile on the record) ─────────────────────────────────────────────
  const smiles = [inst?.ivSmile, ...(Array.isArray(inst?.ivSmiles) ? inst.ivSmiles.map(s => s?.smile ?? s) : [])].filter(s => s?.strikes?.length && s?.iv?.length);
  const sm = smiles.sort((a, b) => b.strikes.length - a.strikes.length)[0];
  const smile = sm ? sm.strikes.map((k, i) => ({ price: k, iv: sm.iv[i] * (sm.iv[i] < 2 ? 100 : 1) })).filter(p => Number.isFinite(p.iv) && Math.abs(p.price - spot) <= windowRm * rm) : [];

  // ── 5. helix: the hedging map's curves, downsampled ──────────────────────────────────────────────────────────────
  let helix = null;
  if (opts.hedge?.grid?.length) {
    const g = opts.hedge.grid, step = Math.max(1, Math.round(g.length / 27));
    const cv = dv => opts.hedge.curves.find(c => c.dv === dv)?.gamma;
    const hed = opts.hedge.curves.find(c => c.dv === 0)?.hedge;
    helix = []; for (let i = 0; i < g.length; i += step) helix.push({ price: g[i], g: [-2, 0, 2, 4].map(dv => cv(dv)?.[i] ?? 0), hedge: hed?.[i] ?? 0 });
  }

  const netSum = sum(net);
  const regime = opts.hedge?.atSpot?.regime ? (opts.hedge.atSpot.regime === 'short' ? 'BREAKOUT' : 'PIN') : (netSum < 0 ? 'BREAKOUT' : 'PIN');
  return {
    sym: opts.sym ?? inst?.pair ?? null, spot, refMove: rm, regime, netGex: netSum,
    book: { id: strong.id, label: strong.label, share: Math.round(strong.abs / total * 100), buckets: bucketStat.map(b => ({ id: b.id, label: b.label, share: Math.round(b.abs / total * 100) })) },
    zeroGamma: zg?.price ?? null, flip: inst?.gexFlip ?? null,
    em: (em && Number.isFinite(em.dte) && em.dte <= 2) ? { hi: em.upper, lo: em.lower, pct: em.pct, dte: em.dte, source: 'options' }
      : (opts.dayMove > 0 ? { hi: spot + opts.dayMove, lo: spot - opts.dayMove, pct: +(opts.dayMove / spot * 100).toFixed(3), dte: 1, source: 'forecast' } : null),
    iv: { atm: inst?.ivDynamics?.atmIV ?? null, rr: inst?.riskReversal?.rr ?? null, tilt: inst?.riskReversal?.tilt ?? null },
    levels, gex, vanna, volume, smile, helix, binWidth: bw,
    hedgeRead: opts.hedge?.atSpot ? { up1: opts.hedge.atSpot.hedgeUp1pct, dn1: opts.hedge.atSpot.hedgeDown1pct } : null,
  };
}

/** Re-express every PRICE in the profile through `fn` (e.g. spot CFD terms → futures terms for an NQ1!/GC1! chart). Distances (refMove, binWidth) and the gamma/vanna/volume
 *  magnitudes are untouched; P(touch) was computed on the spot-terms levels first, so it is not recomputed. */
export function shiftProfilePrices(p, fn, label = 'futures') {
  if (!p) return p;
  const f = v => (Number.isFinite(v) ? fn(v) : v);
  const mapRows = rows => (rows || []).map(r => ({ ...r, price: f(r.price) }));
  return { ...p, terms: label, spot: f(p.spot), zeroGamma: f(p.zeroGamma), flip: f(p.flip), em: p.em ? { ...p.em, hi: f(p.em.hi), lo: f(p.em.lo) } : null,
    levels: mapRows(p.levels), gex: mapRows(p.gex), vanna: mapRows(p.vanna), volume: mapRows(p.volume), smile: mapRows(p.smile), helix: p.helix ? mapRows(p.helix) : null };
}

/** Pipe-delimited block for the Pine indicator. One instrument per block; first line after the title names it.
 *  Pine strings cannot exceed 4,096 characters (a longer paste raises "String is too long"), so the block is COMPACT: bar series are integers scaled to ±1000,
 *  rows under 2% of the peak are dropped, gamma carries only the net, and the helix is downsampled. Pine's str.tonumber may not read exponent notation and may
 *  drop empty fields, so: plain numbers only, '-' for a missing value. Use chunkText() to split a result into <=4,000-character parts, one per Pine input box. */
export function buildProfileText(p, { name, generated = '', digits = 2, savedAtMs = null } = {}) {
  if (!p) return '';
  const f = v => (Number.isFinite(v) ? (+v).toFixed(digits) : '-');
  const plain = (v, d = 2) => (Number.isFinite(v) ? (+v).toFixed(d) : '-');
  const mxAbs = arr => Math.max(1e-300, ...arr.map(v => Math.abs(v)));
  const sc = (v, m) => (m > 0 && Number.isFinite(v) ? String(Math.round(v / m * 1000)) : '0');
  const keep = (rows, val, m) => rows.filter(r => Math.abs(val(r)) / m >= 0.02);
  const out = ['──── OI PROFILE ' + '─'.repeat(30), `Generated: ${generated}`, '', name || p.sym];
  out.push(`M|spot|${f(p.spot)}|regime|${p.regime}|netgex|${Number.isFinite(p.netGex) ? Math.round(p.netGex / 1000) : '-'}|book|${p.book.label.replace(/\s+/g, '')}|bookpct|${p.book.share}|zg|${f(p.zeroGamma)}|flip|${f(p.flip)}`
    + `|em_hi|${f(p.em?.hi)}|em_lo|${f(p.em?.lo)}|empct|${plain(p.em?.pct, 2)}|iv|${plain(p.iv.atm, 1)}|rr|${plain(p.iv.rr, 1)}|refmove|${f(p.refMove)}|binw|${plain(p.binWidth, 2)}|terms|${p.terms || 'spot'}` + (Number.isFinite(savedAtMs) ? `|saved|${new Date(savedAtMs).toISOString().slice(0, 16).replace('T', ' ')}` : ''));
  if (p.hedgeRead) out.push(`H0|up1|${Math.round(p.hedgeRead.up1)}|dn1|${Math.round(p.hedgeRead.dn1)}`);
  for (const l of p.levels) out.push(`L|${l.type}|${f(l.price)}|${l.label}|${(+l.strength).toFixed(1)}|${l.touchPct ?? '-'}|${l.etaMin ?? '-'}|${l.expect || '-'}`);
  const gm = mxAbs(p.gex.map(r => r.net)); for (const r of keep(p.gex, r => r.net, gm)) out.push(`G|${f(r.price)}|${sc(r.net, gm)}`);
  const vm = mxAbs(p.vanna.map(r => r.v)); for (const r of keep(p.vanna, r => r.v, vm)) out.push(`V|${f(r.price)}|${sc(r.v, vm)}`);
  const om = mxAbs(p.volume.map(r => r.v)); for (const r of keep(p.volume, r => r.v, om)) out.push(`O|${f(r.price)}|${sc(r.v, om)}`);
  const sm = p.smile.length > 24 ? p.smile.filter((_, i) => i % Math.ceil(p.smile.length / 24) === 0 || i === p.smile.length - 1) : p.smile;   // ≤24 points: a smooth curve needs no more
  for (const r of sm) out.push(`S|${f(r.price)}|${(+r.iv).toFixed(1)}`);
  if (p.helix) {
    const xm = mxAbs(p.helix.flatMap(r => r.g)), hm = mxAbs(p.helix.map(r => r.hedge));
    for (const r of p.helix) out.push(`X|${f(r.price)}|${r.g.map(v => sc(v, xm)).join('|')}|${sc(r.hedge, hm)}`);
  }
  out.push('');
  return out.join(String.fromCharCode(10));
}

/** Split a paste into parts of at most `max` characters, on line boundaries (Pine's per-input string limit is 4,096). Returns the parts, in order. */
export function chunkText(text, max = 4000) {
  const NL = String.fromCharCode(10), parts = []; let cur = '';
  for (const line of String(text || '').split(NL)) {
    if (cur && cur.length + line.length + 1 > max) { parts.push(cur); cur = ''; }
    cur += (cur ? NL : '') + line;
  }
  if (cur) parts.push(cur);
  return parts;
}
