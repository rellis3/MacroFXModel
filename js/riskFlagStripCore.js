/**
 * Risk-flag history strip, the pure part (Desk Terminal, preview). The saved CORE snapshots (js/deskSnapshot.js, section `risk`) keep the six market-stress lights as they stood at each
 * capture: { flags: { vix_level: [on 0/1, value], vix_term, hy_speed, jpy_bid, evz_stress, stock_bond_corr } }. This turns those points into one ribbon per light over the days we hold,
 * with how often it was on, how many separate episodes there were, and when it last changed.
 *
 * It DESCRIBES the lights. Only a flag with a VALIDATED range finding in the Evidence Book is presented as one that says something (the next days run wider, never which way); the others
 * are lights. A gap (the flag could not be read) is drawn as a gap, never as "off". Every point is as it was published then. No model call.
 */
export const FLAGS = [
  { key: 'vix_level', label: 'VIX level' }, { key: 'vix_term', label: 'VIX term structure' }, { key: 'hy_speed', label: 'High-yield spread speed' },
  { key: 'jpy_bid', label: 'Yen bid' }, { key: 'evz_stress', label: 'Euro vol stress' }, { key: 'stock_bond_corr', label: 'Stock-bond correlation' },
];
export const flagLabel = k => FLAGS.find(f => f.key === k)?.label ?? k;
const fin = v => typeof v === 'number' && Number.isFinite(v);

/** One series per light from snapshot points (any order): [{ ts, on: 1 | 0 | null, value }], ascending. null = the flag could not be read at that capture. */
export function seriesOf(points) {
  const pts = (points ?? []).filter(p => p && fin(p.ts) && p.d?.risk?.flags).sort((a, b) => a.ts - b.ts), out = {};
  for (const f of FLAGS) out[f.key] = [];
  for (const p of pts) for (const f of FLAGS) {
    const x = p.d.risk.flags[f.key];
    if (!Array.isArray(x)) { out[f.key].push({ ts: p.ts, on: null, value: null }); continue; }
    out[f.key].push({ ts: p.ts, on: fin(x[1]) || x[0] === 1 ? (x[0] ? 1 : 0) : null, value: fin(x[1]) ? x[1] : null });
  }
  return out;
}

/** Counts for one series: samples read, samples on, share on, episodes (separate runs of "on"), the last change and the current state. */
export function summarise(series) {
  const read = series.filter(s => s.on !== null), on = read.filter(s => s.on === 1).length;
  let episodes = 0, prev = 0, lastChange = null, last = null;
  for (const s of read) { if (s.on === 1 && prev === 0) episodes++; if (last && s.on !== last.on) lastChange = s.ts; prev = s.on; last = s; }
  return { n: series.length, read: read.length, gaps: series.length - read.length, on, share: read.length ? on / read.length : null, episodes, lastChange, now: last ? last.on : null, lastValue: last?.value ?? null };
}

/** Which Evidence Book entries speak to which flag, and what the board may say about them: 'range' (validated range finding), 'nearest' (a related test) or 'light'. */
export function evidenceKind(key, flagEvidence, evidence) {
  const map = flagEvidence?.[key]; if (!map) return { kind: 'light', words: 'a light, not a finding' };
  const ev = (map.ids ?? []).map(id => (evidence ?? []).find(e => e.id === id)).filter(Boolean);
  const range = ev.some(e => e.verdict === 'validated' && /range|wider/i.test(`${e.claim ?? ''} ${e.use ?? ''}`));
  if (range && !map.nearest) return { kind: 'range', words: 'validated range finding: runs wider, never which way', ids: ev.map(e => e.id) };
  if (range) return { kind: 'nearest', words: 'nearest test is validated for range, not the same measure', ids: ev.map(e => e.id) };
  return { kind: 'light', words: ev.length ? `tested: ${ev.map(e => e.verdict).join(', ')}` : 'a light, not a finding', ids: ev.map(e => e.id) };
}

const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
const niceDay = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ago = ms => { const m = Math.round(ms / 60e3); return m < 90 ? `${m} minutes` : m < 36 * 60 ? `${Math.round(m / 60)} hours` : `${Math.round(m / 1440)} days`; };

/** One plain sentence per light. `now` is the time of the latest point. */
export function sentence(key, sum, now) {
  const L = flagLabel(key);
  if (!sum.read) return `${L}: it could not be read at any of the ${sum.n} captures.`;
  const state = sum.now === 1 ? 'on now' : sum.now === 0 ? 'off now' : 'not readable now';
  if (!sum.on) return `${L}: off at every one of ${sum.read} readings (${state}).`;
  return `${L}: on for ${Math.round(sum.share * 100)}% of ${sum.read} readings in ${sum.episodes} episode${sum.episodes === 1 ? '' : 's'}; ${state}${sum.lastChange ? `, last changed ${ago(now - sum.lastChange)} ago` : ''}.`;
}

/** Depth line: from the first to the last capture and how many were used. */
export function depthText(points) {
  const p = (points ?? []).filter(x => fin(x?.ts)).sort((a, b) => a.ts - b.ts); if (!p.length) return 'No saved snapshots were found, so there is no history to show yet.';
  return `${p.length} saved captures from ${niceDay(p[0].ts)} to ${niceDay(p.at(-1).ts)} (the record begins 14 Nov 2026). A gap in a ribbon means the flag could not be read, not that it was off.`;
}

/** Day boundaries for the ribbon axis: [{ ts, label }] at each UTC midnight inside the span. */
export function dayTicks(points) {
  const p = (points ?? []).filter(x => fin(x?.ts)).sort((a, b) => a.ts - b.ts); if (p.length < 2) return [];
  const out = []; let d = Date.parse(`${dayOf(p[0].ts)}T00:00:00Z`) + 86400e3;
  while (d < p.at(-1).ts) { out.push({ ts: d, label: niceDay(d) }); d += 86400e3; }
  return out;
}

/** The whole model for the board: rows (series, summary, evidence, sentence) in the six lights' order. */
export function model(points, { flagEvidence = {}, evidence = [] } = {}) {
  const sr = seriesOf(points), p = (points ?? []).filter(x => fin(x?.ts)).sort((a, b) => a.ts - b.ts), now = p.at(-1)?.ts ?? null;
  if (p.length < 2 || !Object.values(sr).some(s => s.length)) return { ok: false, why: p.length ? 'Only one saved capture so far, so there is no history yet.' : 'No saved snapshots were found, so there is no history to show yet.', depth: depthText(points) };
  const rows = FLAGS.map(f => { const sum = summarise(sr[f.key]); return { key: f.key, label: f.label, series: sr[f.key], sum, evidence: evidenceKind(f.key, flagEvidence, evidence), text: sentence(f.key, sum, now) }; });
  const anyOn = rows.filter(r => r.sum.now === 1).length;
  return { ok: true, rows, t0: p[0].ts, t1: now, ticks: dayTicks(points), depth: depthText(points), nowOn: anyOn, headline: `${anyOn} of ${rows.filter(r => r.sum.now !== null).length} readable flags are on now; ${rows.filter(r => r.sum.on > 0).length} of the six have been on at some point since ${niceDay(p[0].ts)}.` };
}

/** CSV: one row per capture, one column per flag (1 on, 0 off, empty = could not be read). */
export function csv(m) {
  if (!m?.ok) return '';
  const ts = [...new Set(m.rows.flatMap(r => r.series.map(s => s.ts)))].sort((a, b) => a - b);
  const get = (r, t) => { const s = r.series.find(x => x.ts === t); return s && s.on !== null ? s.on : ''; };
  return [['time_utc', ...m.rows.map(r => r.key)], ...ts.map(t => [new Date(t).toISOString(), ...m.rows.map(r => get(r, t))])].map(r => r.join(',')).join('\n');
}
