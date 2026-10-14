// js/cogLine.js: C.OG's rate-spread line as data. Slice by days, plot values, and the text block the pasted-data TradingView indicator reads.
//
// Series file (analysis/output/cog_line/cog_line_15m.json, built by scripts/rates_line/build_cog_line.py): {t0 (epoch s), step (900), bp: [SOFR minus Euribor in bp | null, ...],
// legs, asOf}. bp[i] belongs to the 15-minute bar that OPENS at t0 + i*step (the value of that bar's close, known 15 minutes later).
// C.OG's units: units = bp * 0.1 + 1.445 (identified in analysis/output/cog_video_0918/RECONSTRUCTION.md).
// Pure: no fs, no fetch. Tested by js/cogLine.test.mjs.

export const COG = { scale: 0.1, offset: 1.445, stepSec: 900 };
export const toUnits = (bp, scale = COG.scale, offset = COG.offset) => (bp == null ? null : bp * scale + offset);

/** The last `days` calendar days ending at the last valid bar. Returns {t0, step, bp, asOf, from, to, nValid}. */
export function sliceDays(series, days) {
  const { t0, step, bp } = series;
  let last = bp.length - 1; while (last >= 0 && bp[last] == null) last--;
  if (last < 0) return { t0, step, bp: [], nValid: 0, from: null, to: null, asOf: series.asOf };
  const n = Math.max(1, Math.round((days * 86400) / step));
  const first = Math.max(0, last - n + 1), out = bp.slice(first, last + 1);
  let lead = 0; while (lead < out.length && out[lead] == null) lead++;           // trim leading empties so t0 is a real bar
  const sl = out.slice(lead), nt0 = t0 + (first + lead) * step;
  return { t0: nt0, step, bp: sl, nValid: sl.filter(v => v != null).length, from: nt0, to: nt0 + (sl.length - 1) * step, asOf: series.asOf };
}

/** Bars as {t, bp, units} (empty bars left out). */
export function toBars(sl, scale = COG.scale, offset = COG.offset) {
  const rows = [];
  sl.bp.forEach((v, i) => { if (v != null) rows.push({ t: sl.t0 + i * sl.step, bp: v, units: toUnits(v, scale, offset) }); });
  return rows;
}

/** Label of the leg pair in force at epoch second `t` (segments carry `frm` as a UTC date; a later segment only applies once its date has arrived). */
export function legsAt(series, t) {
  const segs = series.legs || [], day = t != null ? new Date(t * 1000).toISOString().slice(0, 10) : '9999-12-31';
  const seg = [...segs].reverse().find(x => x.frm <= day) || segs[0];
  return seg ? seg.label : 'SOFR minus Euribor';
}

/** The block pasted into pine/cog_line_pasted.pine: header lines plus one comma list of integer tenths of a bp ('' = no value, e.g. a weekend bar). */
export function exportText(series, days) {
  const sl = sliceDays(series, days);
  const iso = s => new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  return ['COGLINE v1',
    `legs=${legsAt(series, sl.to)}`,
    `from=${sl.from != null ? iso(sl.from) : '-'}`, `to=${sl.to != null ? iso(sl.to) : '-'}`, `asof=${series.asOf}`,
    `t0=${sl.t0}`, `step=${sl.step}`, 'unit=tenth-bp (value/10 = SOFR rate minus Euribor rate, in bp)',
    `d=${sl.bp.map(v => (v == null ? '' : String(Math.round(v * 10)))).join(',')}`].join('\n');
}

/** Parse an export block back (what the Pine script does): {t0, step, bp}. Used by the tests as the round-trip check. */
export function parseExport(text) {
  const m = k => { const r = text.match(new RegExp('^' + k + '=(.*)$', 'm')); return r ? r[1].trim() : null; };
  const d = m('d'); if (d == null) return null;
  return { t0: Number(m('t0')), step: Number(m('step')), bp: d.split(',').map(s => (s === '' ? null : Number(s) / 10)) };
}
