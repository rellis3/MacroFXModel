/**
 * The real-yield layer (owner, 2026-11-28, desk layers): real yields and breakevens BESIDE the nominal curve, never in place of it.
 * Nothing here changes a nominal number; every nominal figure is the same FRED print the rates boards already show.
 *
 *   US   TIPS real yield 5y / 10y (FRED DFII5, DFII10), breakevens 5y / 10y (T5YIE, T10YIE), the nominal 5y / 10y (DGS5, DGS10)
 *        and the split of the nominal move: nominal change = real change + breakeven change (to a basis point or two: the
 *        breakeven is FRED's own series, not our subtraction, so a small residual is shown as it is).
 *   AU   the 10y indexed bond (RBA F2 FCMYGBAGID, js/macroCapture.js g10_yields AU_10Y_REAL) beside the nominal 10y (AU_10Y);
 *        the AU "breakeven" is DERIVED (nominal minus indexed) and labelled so: no traded AU breakeven series is captured.
 *   UK   index-linked gilt yields are not captured (the BoE publishes them in its yield-curve files, not the IADB series the
 *        capture reads): shown as not available, never filled in.
 *
 * Description only. What the Evidence Book says about reading these: broken-link-resolution (context: when real yields and
 * the dollar or gold disagree, history does not say which leg gives way), which-gold (context: real yields drive gold in only
 * part of the windows), cog-spread-direction (null: no daily rate spread, real yields and breakevens included, gives
 * direction at the lines), yield-ladder-nq (underpowered: no shown lead from real yields or breakevens to Nasdaq).
 *
 * Pure: series in, payload out; `now` is passed. Tested in js/realYields.test.mjs.
 */
export const RY_EVIDENCE = ['broken-link-resolution', 'which-gold', 'cog-spread-direction', 'yield-ladder-nq'];
export const RY_NOTE = 'Real yields and breakevens beside the nominal curve, which is unchanged. A description: no daily real-yield or breakeven move has been shown to give direction or a lead (Evidence Book cog-spread-direction, yield-ladder-nq), and when real yields and the dollar or gold disagree history does not say which gives way (broken-link-resolution).';
const STALE_DAYS = 5, KEEP = 60;

const fin = v => typeof v === 'number' && Number.isFinite(v);
/** [{date, value}] or [[date, value, ...]] -> [{date, value}] ascending, finite only, one per date (the last wins). */
export function toRows(s) {
  if (!Array.isArray(s)) return [];
  const m = new Map();
  for (const p of s) {
    const d = Array.isArray(p) ? p[0] : p?.date, v = Array.isArray(p) ? p[1] : p?.value;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) && fin(+v) && v !== null && v !== '') m.set(d.slice(0, 10), +v);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}
const bp = x => (fin(x) ? Math.round(x * 1000) / 10 + 0 : null);   // + 0: never a -0
const r2 = x => (fin(x) ? Math.round(x * 100) / 100 : null);
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const todayOf = now => new Date(now).toISOString().slice(0, 10);

/** One series' row: last value, change over 1 / 5 / 20 prints (bp), its 1-year percentile, a 60-print spark, staleness. */
export function seriesRow(rows, meta, now = Date.now()) {
  const r = toRows(rows), last = r.at(-1);
  if (!last) return { ...meta, value: null, date: null, missing: true };
  const back = k => (r.length > k ? last.value - r[r.length - 1 - k].value : null);
  const yr = r.slice(-252).map(x => x.value), pct = yr.length >= 60 ? Math.round(yr.filter(v => v < last.value).length / yr.length * 100) : null;
  const age = days(last.date, todayOf(now));
  return { ...meta, value: r2(last.value), date: last.date, chg1dBp: bp(back(1)), chg5dBp: bp(back(5)), chg20dBp: bp(back(20)), pct1y: pct, ageDays: age, stale: age > STALE_DAYS, spark: r.slice(-KEEP).map(x => r2(x.value)), missing: false };
}

/** a - b on the dates both printed (a derived series, e.g. AU nominal minus indexed). */
export function diffSeries(a, b) {
  const mb = new Map(toRows(b).map(x => [x.date, x.value]));
  return toRows(a).filter(x => mb.has(x.date)).map(x => ({ date: x.date, value: x.value - mb.get(x.date) }));
}

/**
 * The split of a nominal move over `k` prints on the dates all three printed: { nominalBp, realBp, breakevenBp, residualBp, lead }.
 * lead = which leg carried more of the move ('real' | 'breakeven' | 'both' when within 2bp of each other | null when the nominal barely moved).
 */
export function splitMove(nom, real, bei, k = 20) {
  const mr = new Map(toRows(real).map(x => [x.date, x.value])), mb = new Map(toRows(bei).map(x => [x.date, x.value]));
  const joint = toRows(nom).filter(x => mr.has(x.date) && mb.has(x.date));
  if (joint.length <= k) return null;
  const a = joint[joint.length - 1 - k], z = joint.at(-1);
  const n = bp(z.value - a.value), rr = bp(mr.get(z.date) - mr.get(a.date)), b = bp(mb.get(z.date) - mb.get(a.date));
  const lead = Math.abs(n) < 3 ? null : Math.abs(Math.abs(rr) - Math.abs(b)) <= 2 ? 'both' : Math.abs(rr) > Math.abs(b) ? 'real' : 'breakeven';
  return { from: a.date, to: z.date, prints: k, nominalBp: n, realBp: rr, breakevenBp: b, residualBp: bp((z.value - a.value) - (mr.get(z.date) - mr.get(a.date)) - (mb.get(z.date) - mb.get(a.date))), lead,
    nominalNow: r2(z.value), realNow: r2(mr.get(z.date)), breakevenNow: r2(mb.get(z.date)) };
}

/** A plain sentence for a split, description only. */
export function splitText(country, tenor, s) {
  if (!s) return null;
  const sg = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}bp`;
  const head = `${country} ${tenor}: nominal ${sg(s.nominalBp)} over ${s.prints} prints = real ${sg(s.realBp)} + breakeven ${sg(s.breakevenBp)}`;
  const tail = s.lead === 'real' ? 'most of the move was in the real yield' : s.lead === 'breakeven' ? 'most of the move was in inflation compensation' : s.lead === 'both' ? 'the two legs moved about equally' : 'the nominal yield barely moved';
  return `${head}; ${tail}.`;
}

/**
 * Assemble the layer. us = { real5, real10, bei5, bei10, nom5, nom10 } (the /api/chapters series: real5 real10 bei5 bei10 y5 y10),
 * au = { real10, nom10 } (R2 archive g10_yields points). -> { ok, asOf, rows, splits, uk, missing, evidence, note }.
 */
export function buildRealYields({ us = {}, au = {} } = {}, { now = Date.now() } = {}) {
  const rows = [
    seriesRow(us.real5, { id: 'US_REAL_5Y', country: 'US', tenor: '5y', kind: 'real', label: 'US 5y TIPS real yield', source: 'FRED DFII5' }, now),
    seriesRow(us.real10, { id: 'US_REAL_10Y', country: 'US', tenor: '10y', kind: 'real', label: 'US 10y TIPS real yield', source: 'FRED DFII10' }, now),
    seriesRow(us.bei5, { id: 'US_BEI_5Y', country: 'US', tenor: '5y', kind: 'breakeven', label: 'US 5y breakeven', source: 'FRED T5YIE' }, now),
    seriesRow(us.bei10, { id: 'US_BEI_10Y', country: 'US', tenor: '10y', kind: 'breakeven', label: 'US 10y breakeven', source: 'FRED T10YIE' }, now),
    seriesRow(au.real10, { id: 'AU_REAL_10Y', country: 'AU', tenor: '10y', kind: 'real', label: 'Australia 10y indexed (real)', source: 'RBA F2 FCMYGBAGID (R2 archive g10_yields)' }, now),
    seriesRow(diffSeries(au.nom10, au.real10), { id: 'AU_BEI_10Y', country: 'AU', tenor: '10y', kind: 'breakeven', derived: true, label: 'Australia 10y breakeven (derived)', source: 'nominal 10y minus the 10y indexed bond, same day: derived here, not a traded series' }, now),
  ];
  const splits = [
    { country: 'US', tenor: '5y', ...(splitMove(us.nom5, us.real5, us.bei5) ?? { missing: true }) },
    { country: 'US', tenor: '10y', ...(splitMove(us.nom10, us.real10, us.bei10) ?? { missing: true }) },
  ].map(s => ({ ...s, text: s.missing ? null : splitText(s.country, s.tenor, s) }));
  const have = rows.filter(r => !r.missing), asOf = have.map(r => r.date).sort().at(-1) ?? null;
  return { ok: have.length > 0, asOf, rows, splits, missing: rows.filter(r => r.missing).map(r => r.id),
    uk: { available: false, note: 'UK index-linked gilt real yields are not captured: the Bank of England publishes them in its yield-curve files, not in the database series the capture reads. Shown as not available, never filled in.' },
    evidence: RY_EVIDENCE, note: RY_NOTE };
}

/** The Helix Yields view's real-yield panel: short lines, description only. [{ text, tone: 'tx' | 'tx2' }] (no colour for direction). */
export function realLayerLines(ry) {
  if (!ry?.ok) return [];
  const sg = v => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}bp`);
  const out = [{ text: `REAL-YIELD LAYER · as of ${ry.asOf}`, tone: 'tx2' }];
  for (const r of ry.rows ?? []) out.push(r.missing
    ? { text: `${r.label}: not loaded`, tone: 'tx2' }
    : { text: `${r.label} ${r.value.toFixed(2)}% · 20 prints ${sg(r.chg20dBp)}${r.pct1y == null ? '' : ` · 1y pct ${r.pct1y}`}${r.stale ? ` · ${r.ageDays}d old` : ''}`, tone: r.stale ? 'tx2' : 'tx' });
  for (const s of ry.splits ?? []) if (s.text) out.push({ text: s.text, tone: 'tx2' });
  out.push({ text: 'UK linkers: not captured · the nominal curve is unchanged · context, not a signal', tone: 'tx2' });
  return out;
}
