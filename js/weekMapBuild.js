/**
 * Builds the week map from fetched series -- shared by the study script and the
 * server route so the page and the test see the same numbers.
 *   buildWeekMap(raw, { now })  raw: { [panelId]: [{date, value}] } for every
 *   PANEL entry with a `fred` or `oanda` source.
 */
import { PANEL, TARGETS, HORIZONS, MIN_YEARS_FOR_STATE, fridays, weekly, changes, zSeries, zWord, histogram, analogues, forward, median } from './weekMap.js';

export function buildWeekMap(raw, { now = Date.now(), sparkWeeks = 26 } = {}) {
  const fris = fridays(Date.parse('1990-01-05'), now);
  const vals = {};
  for (const p of PANEL) if (raw[p.id]) vals[p.id] = weekly(raw[p.id], fris).map(v => v == null ? null : v * (p.scale ?? 1));
  for (const p of PANEL) {
    if (p.derive) { const [a, b] = p.derive; if (vals[a] && vals[b]) vals[p.id] = vals[a].map((x, i) => x != null && vals[b][i] != null ? x - vals[b][i] : null); }
    if (p.derive3) { const [a, b, c] = p.derive3; if (vals[a] && vals[b] && vals[c]) vals[p.id] = vals[a].map((x, i) => x != null && vals[b][i] != null && vals[c][i] != null ? x - vals[b][i] - vals[c][i] : null); }
    if (p.ratio) { const [a, b] = p.ratio; if (vals[a] && vals[b]) vals[p.id] = vals[a].map((x, i) => x != null && vals[b][i] ? x / vals[b][i] : null); }
  }
  const series = {};
  for (const p of PANEL) {
    if (!vals[p.id]) continue;
    const ch = changes(vals[p.id], p.kind); const z = zSeries(ch);
    const firstIdx = vals[p.id].findIndex(v => v != null); const years = firstIdx >= 0 ? (fris.length - firstIdx) / 52 : 0;
    series[p.id] = { id: p.id, label: p.label, kind: p.kind, hidden: !!p.hidden, short: !!p.short, years: +years.toFixed(1), stateEligible: years >= MIN_YEARS_FOR_STATE && !p.short && !p.hidden, values: vals[p.id], changes: ch, z, latest: { date: fris[fris.length - 1], value: vals[p.id].at(-1), change: ch.at(-1), z: z.at(-1), word: zWord(z.at(-1)) }, spark: vals[p.id].slice(-sparkWeeks), hist: histogram(ch) };
  }
  // the state and the analogues for the latest week
  const stateIds = PANEL.filter(p => series[p.id]?.stateEligible).map(p => p.id);
  const states = fris.map((_, t) => stateIds.map(id => series[id].z[t]));
  const T = fris.length - 1;
  const an = analogues(states, T, { k: 10, crowd: 8, maxIdx: T });
  const outcomes = {};
  for (const tg of TARGETS) {
    if (!series[tg]) continue;
    outcomes[tg] = {};
    for (const h of HORIZONS) {
      const fw = an.map(a => ({ week: fris[a.i], d: +a.d.toFixed(2), v: forward(series[tg].values, series[tg].kind, a.i, h) })).filter(x => x.v != null);
      const all = []; for (let i = 0; i + h < T; i++) { const v = forward(series[tg].values, series[tg].kind, i, h); if (v != null) all.push(v); }
      const sorted = [...all].sort((a, b) => a - b); const q = p => sorted[Math.floor(sorted.length * p)];
      outcomes[tg][h] = { analogues: fw, median: fw.length ? +median(fw.map(x => x.v)).toFixed(2) : null, unconditional: sorted.length ? { median: +median(all).toFixed(2), p10: +q(0.1).toFixed(2), p90: +q(0.9).toFixed(2), n: all.length } : null };
    }
  }
  return { asOf: fris[fris.length - 1], weeks: fris.length, series: Object.fromEntries(Object.entries(series).map(([k, s]) => [k, { ...s, values: undefined, changes: undefined, z: undefined }])), stateIds, analogues: an.map(a => ({ week: fris[a.i], distance: +a.d.toFixed(2), z: Object.fromEntries(stateIds.map((id, j) => [id, states[a.i][j] != null ? +states[a.i][j].toFixed(2) : null])) })), outcomes, _internal: { fris, series, states } };
}
