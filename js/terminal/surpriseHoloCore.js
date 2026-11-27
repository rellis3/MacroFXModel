// js/terminal/surpriseHoloCore.js: the PURE half of Jarvis's DATA SURPRISES hologram (jarvisViewSurprise.js draws it). No DOM, no fetch, no three.js.
//
// An 8 x 8 holographic city block: rows = the eight currencies, columns = the eight indicator families of the Macro tab's engines board (labour, inflation, PPI, growth, PMI, retail, trade,
// confidence). Each cell is a row of thin glowing slices, one per recent print (oldest left, newest right and brightest). A slice stands UP from the cell's mid-plane when the print beat consensus
// (stronger economy than expected) and hangs DOWN when it missed; its length is LINEAR in |z| (the surprise measured in that release's own usual surprise size) up to 3, above which it stays at full
// length and is flagged capped. Row-end plates carry each currency's engine composite as a signed bar. A TIME replay rolls month-by-month average surprises across the block.
//
// Data: /api/macro-engines-board (js/terminal/macroEnginesCore.js buildMacroBoard: cells[ccy][family].prints = the last six prints with a polarity-adjusted z, engine score, next release;
// composite[ccy].composite) and, for the replay, /api/econ-surprise?history=1&since=... (series 'COUNTRY|event' -> every print with its z; byCcy[ccy].assumedPolarity).
// Polarity caveat: z is signed so + = stronger economy than expected; releases not in econSurprise's inverted list are read "higher = stronger" by assumption (inflation above consensus counts as a
// beat). The card and the readout say so. DESCRIPTION ONLY: a record of releases against expectations; nothing here is a forecast or a signal.
import { familyOf, CCYS, FAMILIES } from './macroEnginesCore.js';
import { polarityFor, parseCalNumber, COUNTRY_TO_CCY } from '../econSurprise.js';

export const CAP = 3;            // |z| at which a slice is capped
export const H_MAX = 0.5;        // slice length at the cap (world units)
export const H_MIN = 0.02;       // a sliver, so an in-line print is still visible
export const PL_CAP = 1;         // |engine composite| at which a plate bar is capped
export const SLICES = 6;
const DAY = 864e5;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const SHORT = { labour: 'LABOUR', cpi: 'CPI', ppi: 'PPI', gdp: 'GDP', pmi: 'PMI', retail: 'RETAIL', trade: 'TRADE', confidence: 'CONF' };
export const FAMS = FAMILIES.map(f => ({ key: f.key, label: f.label, short: SHORT[f.key] ?? f.key.toUpperCase() }));
export const CCY_SPOKEN = { USD: 'the US', EUR: 'the euro area', GBP: 'the UK', JPY: 'Japan', AUD: 'Australia', NZD: 'New Zealand', CAD: 'Canada', CHF: 'Switzerland' };
export const CCY_ADJ = { USD: 'US', EUR: 'euro-area', GBP: 'UK', JPY: 'Japanese', AUD: 'Australian', NZD: 'New Zealand', CAD: 'Canadian', CHF: 'Swiss' };
export const FAM_SPOKEN = { labour: 'jobs', cpi: 'inflation', ppi: 'producer prices', gdp: 'growth', pmi: 'business survey', retail: 'retail sales', trade: 'trade', confidence: 'confidence' };

/** Slice length for a z: H_MIN + (H_MAX - H_MIN) * min(|z|, CAP) / CAP. Continuous, monotonic in |z|; null/NaN gives H_MIN. */
export const sliceH = z => { const x = num(z); return x == null ? H_MIN : H_MIN + (H_MAX - H_MIN) * Math.min(Math.abs(x), CAP) / CAP; };
/** A slice: { h, dir (+1 beat / -1 miss / 0 none), capped }. */
export function sliceSpec(z) {
  const x = num(z);
  if (x == null) return { z: null, h: H_MIN, dir: 0, capped: false };
  return { z: x, h: sliceH(x), dir: x > 0 ? 1 : x < 0 ? -1 : 0, capped: Math.abs(x) > CAP };
}
/** Plate bar length as a fraction 0..1 of its half-width: linear in |score| up to PL_CAP. */
export function plateSpec(score) {
  const s = num(score);
  if (s == null) return { score: null, f: 0, dir: 0, capped: false };
  return { score: s, f: Math.min(Math.abs(s), PL_CAP) / PL_CAP, dir: s > 0 ? 1 : s < 0 ? -1 : 0, capped: Math.abs(s) > PL_CAP };
}

/** Is this release's sign inferred (higher read as stronger by assumption) rather than known? */
export const assumedPolarity = event => !!event && !polarityFor(event).matched && !/claimant count/i.test(String(event));

/**
 * Shape /api/macro-engines-board into the block. Returns { ok, reason?, asOf, ccys, fams, cells: { 'CCY|fam': cell }, plates: { CCY: plateSpec + factors } }.
 * cell = { key, ccy, fam, row, col, status, event, stale, ageDays, engine, next, assumed, slices: [{ ms, actual, estimate, prev, ...sliceSpec }] oldest -> newest (<= 6) }.
 */
export function shapeBoard(board, { now } = {}) {
  const asOf = num(Date.parse(board?.generatedAt)) ?? num(now) ?? Date.now();
  if (!board || board.ok === false || !board.cells || typeof board.cells !== 'object') return { ok: false, reason: board?.error ? `The surprise board did not load (${board.error}).` : 'The surprise board did not load.', asOf, ccys: CCYS, fams: FAMS, cells: {}, plates: {} };
  const ccys = CCYS, cells = {}, plates = {};
  ccys.forEach((ccy, row) => {
    FAMS.forEach((f, col) => {
      const c = board.cells?.[ccy]?.[f.key] ?? {}, prints = Array.isArray(c.prints) ? c.prints.filter(p => p && num(p.ms) != null) : [];
      const slices = prints.slice(0, SLICES).reverse().map(p => ({ ms: p.ms, actual: p.actual ?? null, estimate: p.estimate ?? null, prev: p.prev ?? null, ...sliceSpec(p.z) }));
      cells[`${ccy}|${f.key}`] = {
        key: `${ccy}|${f.key}`, ccy, fam: f.key, row, col, status: c.status ?? 'none', event: c.event ?? null, stale: !!c.stale, ageDays: num(c.ageDays),
        engine: c.engine ?? null, next: c.next ?? null, assumed: assumedPolarity(c.event), slices,
      };
    });
    const comp = board.composite?.[ccy] ?? {};
    plates[ccy] = { ...plateSpec(comp.composite), factorsScored: num(comp.factorsScored), factorsTotal: num(comp.factorsTotal) };
  });
  const nSlices = Object.values(cells).reduce((a, c) => a + c.slices.length, 0);
  if (!nSlices) return { ok: false, reason: 'The surprise store has no printed releases for these currencies yet.', asOf, ccys, fams: FAMS, cells, plates };
  return { ok: true, asOf, ccys, fams: FAMS, cells, plates };
}

/** Every scored slice with its cell, newest first. */
const scoredSlices = (B, since = -Infinity) => Object.values(B?.cells ?? {}).flatMap(c => c.slices.map((s, i) => ({ cell: c, s, i }))).filter(x => x.s.z != null && x.s.ms >= since).sort((a, b) => b.s.ms - a.s.ms);

/** The biggest beat and the biggest miss over the last `days` (widening to 30, then 90 days when the window is empty). Returns { beat, miss, days } (each { key, i, z, ms, event } or null). */
export function extremes(B, { days = 14, now } = {}) {
  const t = num(now) ?? B?.asOf ?? Date.now();
  for (const d of [days, 30, 90]) {
    const xs = scoredSlices(B, t - d * DAY); if (!xs.length) continue;
    let beat = null, miss = null;
    for (const x of xs) { if (x.s.z > 0 && (!beat || x.s.z > beat.s.z)) beat = x; if (x.s.z < 0 && (!miss || x.s.z < miss.s.z)) miss = x; }
    const pack = x => (x ? { key: x.cell.key, ccy: x.cell.ccy, fam: x.cell.fam, i: x.i, z: x.s.z, ms: x.s.ms, event: x.cell.event, capped: x.s.capped, actual: x.s.actual, estimate: x.s.estimate } : null);
    if (beat || miss) return { beat: pack(beat), miss: pack(miss), days: d };
  }
  return { beat: null, miss: null, days };
}

/** Per currency, the mean z of its scored prints over the last `days`: { CCY: { mean, n } }; mean null under 2 prints. */
export function tilts(B, { days = 30, now } = {}) {
  const t = num(now) ?? B?.asOf ?? Date.now(), xs = scoredSlices(B, t - days * DAY), out = {};
  for (const ccy of B?.ccys ?? CCYS) { const zs = xs.filter(x => x.cell.ccy === ccy).map(x => x.s.z); out[ccy] = { n: zs.length, mean: zs.length >= 2 ? Math.round(zs.reduce((a, b) => a + b, 0) / zs.length * 100) / 100 : null }; }
  return out;
}
/**
 * Side by side with leaders (Helix review wave 1.8): "k of n beat" instead of "mostly beaten". Per currency over the last `days`: n scored prints, beat (z > 0), miss (z < 0) and the median of
 * the z values winsorised at +-CAP. A currency is a beater only with n >= minN, a median >= thr and more beats than misses (a misser the mirror). { up: [{ ccy, k, n, med }], dn: [...] }.
 */
export function leadersKN(B, { days = 30, now, minN = 4, thr = 0.3 } = {}) {
  const t = num(now) ?? B?.asOf ?? Date.now(), xs = scoredSlices(B, t - days * DAY), up = [], dn = [];
  for (const ccy of B?.ccys ?? CCYS) {
    const zs = xs.filter(x => x.cell.ccy === ccy).map(x => Math.max(-CAP, Math.min(CAP, x.s.z))).sort((a, b) => a - b), n = zs.length; if (n < minN) continue;
    const med = n % 2 ? zs[(n - 1) / 2] : (zs[n / 2 - 1] + zs[n / 2]) / 2, beat = zs.filter(z => z > 0).length, miss = zs.filter(z => z < 0).length;
    if (med >= thr && beat > miss) up.push({ ccy, k: beat, n, med }); else if (med <= -thr && miss > beat) dn.push({ ccy, k: miss, n, med });
  }
  return { up: up.sort((a, b) => b.med - a.med), dn: dn.sort((a, b) => a.med - b.med), minN };
}
/** Which currencies have been mostly beating / missing (|mean z| >= thr). Sorted strongest first. */
export function leaders(T, thr = 0.3) {
  const e = Object.entries(T ?? {}).filter(([, v]) => v.mean != null);
  return { up: e.filter(([, v]) => v.mean >= thr).sort((a, b) => b[1].mean - a[1].mean).map(([k]) => k), dn: e.filter(([, v]) => v.mean <= -thr).sort((a, b) => a[1].mean - b[1].mean).map(([k]) => k) };
}

const monthKey = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
/**
 * The replay: /api/econ-surprise?history=1 series -> month by month, per cell, the mean z of that family's prints (every release in the family, not only the headline).
 * The z there is polarity-adjusted (claimant count flipped here as on the board), and a z whose sign contradicts actual-vs-consensus is dropped, as the board does.
 * Returns { months: ['YYYY-MM' ...] oldest -> newest (<= months), grid: [{ 'CCY|fam': { z, n, ...sliceSpec } }], ccyMean: [{ CCY: mean | null }], assumed: { CCY: share | null } } or null.
 */
export function monthGrid(hist, { now, months = 12 } = {}) {
  const series = hist?.series; if (!series || typeof series !== 'object') return null;
  const t = num(now) ?? num(Date.parse(hist?.generatedAt)) ?? Date.now(), end = new Date(t), keys = [];
  for (let k = months - 1; k >= 0; k--) keys.push(monthKey(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - k, 15)));
  const idx = new Map(keys.map((k, i) => [k, i])), acc = keys.map(() => new Map());
  let used = 0;
  for (const [sk, list] of Object.entries(series)) {
    const bar = sk.indexOf('|'); if (bar < 0 || !Array.isArray(list)) continue;
    const country = sk.slice(0, bar).toUpperCase(), event = sk.slice(bar + 1), ccy = COUNTRY_TO_CCY[country] ?? null, fam = familyOf(event)?.family;
    if (!ccy || !CCYS.includes(ccy) || !fam) continue;
    const flip = /claimant count/i.test(event) ? -1 : 1, pol = polarityFor(event).sign * flip;
    for (const p of list) {
      let z = num(p?.z); const ms = num(p?.ms); if (z == null || ms == null) continue;
      const i = idx.get(monthKey(ms)); if (i == null) continue;
      z *= flip;
      const a = parseCalNumber(p.actual), e = parseCalNumber(p.estimate);
      if (a != null && e != null) { const d = Math.sign((a - e) * pol); if (d === 0 || d !== Math.sign(z)) continue; }
      const ck = `${ccy}|${fam}`, m = acc[i]; const v = m.get(ck) ?? { s: 0, n: 0 }; v.s += z; v.n++; m.set(ck, v); used++;
    }
  }
  if (!used) return null;
  const grid = acc.map(m => Object.fromEntries([...m].map(([k, v]) => { const z = Math.round(v.s / v.n * 100) / 100; return [k, { n: v.n, ...sliceSpec(z) }]; })));
  const ccyMean = grid.map(g => Object.fromEntries(CCYS.map(c => { const xs = Object.entries(g).filter(([k]) => k.startsWith(c + '|')); const n = xs.reduce((a, [, v]) => a + v.n, 0); return [c, n ? Math.round(xs.reduce((a, [, v]) => a + v.z * v.n, 0) / n * 100) / 100 : null]; })));
  const assumed = Object.fromEntries(CCYS.map(c => [c, num(hist?.byCcy?.[c]?.assumedPolarity)]));
  return { months: keys, grid, ccyMean, assumed };
}
/** Slice spec for a cell at a fractional month position (linear blend between neighbouring months, so the replay rolls smoothly). Empty months count as 0 (no slab). */
export function gridAt(G, key, m) {
  if (!G?.grid?.length) return { z: null, h: 0, dir: 0, capped: false, n: 0 };
  const L = G.grid.length, x = Math.max(0, Math.min(L - 1, num(m) ?? L - 1)), i = Math.floor(x), f = x - i;
  const a = G.grid[i]?.[key], b = G.grid[Math.min(L - 1, i + 1)]?.[key], za = a?.z ?? 0, zb = b?.z ?? 0;
  const z = za + (zb - za) * f, s = sliceSpec(z), n = (f < 0.5 ? a : b)?.n ?? 0;
  return { ...s, h: (a || b) ? s.h : 0, n };
}
export const monthLabel = k => { const [y, m] = String(k ?? '').split('-').map(Number); return y && m ? new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—'; };

/** Number text: +1.4 / −0.7 (true minus), '>3' with sign when capped. */
export const zText = (z, capped) => { const x = num(z); if (x == null) return '—'; const s = x > 0 ? '+' : x < 0 ? '−' : ''; return capped ? `${s}>${CAP}` : `${s}${Math.abs(x).toFixed(1)}`; };
export const fmtDate = ms => (num(ms) == null ? '—' : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }));

/** Greedy screen-space label placement (same contract as reactorCore.placeLabels): items [{ id, x, y, w, h, pri }] -> placed [{ id, x, y, w, h }]; labels that cannot fit are left out. */
export function placeLabels(items, { W = 1280, H = 720, pad = 3, obstacles = [], step = 8, tries = 8, top = 0, bottom = 0 } = {}) {
  const placed = obstacles.map(o => ({ ...o })), out = [];
  const hits = r => placed.some(o => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y);
  for (const it of [...(items ?? [])].sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0))) {
    let ok = null;
    for (const dx of [0, it.w * 0.6 + 8, -(it.w * 0.6 + 8)]) for (let k = 0; k <= tries * 2 && !ok; k++) {
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step, r = { id: it.id, x: Math.max(4, Math.min(W - it.w - 4, it.x + dx)), y: it.y + dy, w: it.w, h: it.h };
      if (r.y < top || r.y + r.h > H - bottom) continue;
      if (!hits(r)) ok = r;
    }
    if (ok) { placed.push(ok); out.push(ok); }
  }
  return out;
}

/** The SHOW line: which economies have been surprising up / down lately and the biggest recent beat and miss, plain words. null when there is nothing to say. */
export function surpriseScript(B, { now } = {}) {
  if (!B?.ok) return null;
  const X = extremes(B, { now }), L = leadersKN(B, { now });
  if (!X.beat && !X.miss) return null;
  const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const t = ['Data surprises across the eight economies.'];
  // counts, not "mostly" (Helix review wave 1.8): k of n prints, at least four of them, the median winsorised
  const kn = (a, w) => a.slice(0, 2).map(c => `${CCY_SPOKEN[c.ccy]} ${w} in ${c.k} of ${c.n} prints`);
  const up = kn(L.up, 'beat expectations'), dn = kn(L.dn, 'missed');
  if (up.length && dn.length) t.push(`Over the past month ${list(up)}, while ${list(dn)}.`);
  else if (up.length) t.push(`Over the past month ${list(up)}, and no economy has been missing much.`);
  else if (dn.length) t.push(`Over the past month ${list(dn)}, and none has been beating much.`);
  else t.push(`Over the past month no economy has had ${L.minN} or more prints leaning one way.`);
  const name = x => `${CCY_ADJ[x.ccy]} ${FAM_SPOKEN[x.fam]}${x.fam === 'cpi' || x.fam === 'ppi' ? `, ${x.z > 0 ? 'hotter' : 'cooler'} than expected` : ''}`, size = x => (x.capped ? `more than ${CAP} times` : `about ${Math.abs(x.z).toFixed(1)} times`);
  const win = X.days <= 14 ? 'in the last two weeks' : X.days <= 30 ? 'in the last month' : 'in the last three months';
  if (X.beat && X.miss) t.push(`The biggest beat ${win} was ${name(X.beat)}, ${size(X.beat)} its usual surprise; the biggest miss was ${name(X.miss)}, ${size(X.miss)} its usual.`);
  else { const x = X.beat ?? X.miss; t.push(`The biggest ${X.beat ? 'beat' : 'miss'} ${win} was ${name(x)}, ${size(x)} its usual surprise.`); }
  t.push('A record of releases, not a forecast.');
  return t.join(' ');
}
/** The broadcast figure: the biggest |z| of the recent window. */
export function surpriseFigure(B, { now } = {}) {
  const X = extremes(B, { now }), x = [X.beat, X.miss].filter(Boolean).sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
  return x ? { value: `${zText(x.z, x.capped)}×`, label: `${x.ccy} ${FAMS.find(f => f.key === x.fam)?.label.toLowerCase() ?? x.fam} vs usual surprise` } : null;
}
