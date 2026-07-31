/**
 * Macro Change Core — Tier-1 brick: day-over-day / 1w / 1m change on the macro
 * series the dashboard already tracks (yields, DXY, TIPS real yield, breakevens,
 * VIX, HY credit), so the daily brief can SAY what moved ("10Y +6bps today,
 * +12bps on the week → yields grinding higher, dollar-supportive") instead of
 * only quoting today's level.
 *
 * Input is the `fredhistory_series_<key>` shape already cached server-side:
 * an ascending array [{date, value}] per key (~90 obs). Pure — no fetch, no KV.
 * The server passes the histories in; the browser can pass the same client-side
 * `fredHist` in, so one brick feeds the prompt injection AND the on-page strip.
 *
 * Units: rate/spread series (yields, TIPS, breakevens, HY OAS) are in percent, so
 * their change is reported in BASIS POINTS (×100); level/index series (VIX, the
 * broad-dollar index) report change in POINTS. A derived 2s10s row comes from the
 * 2Y/10Y deltas (steepening/flattening).
 *
 * Tested on synthetic series in js/macroChange.test.mjs (no network).
 */

// Which tracked series get a change row, how to label/scale them, and the plain
// consequence hint the brief can lean on. `bps:true` = percent series → Δ in bps.
export const MACRO_CHANGE_SPEC = {
  us2y:  { label: 'US 2Y',            bps: true,  kind: 'rate' },
  us10y: { label: 'US 10Y',           bps: true,  kind: 'rate' },
  tips:  { label: 'Real 10Y (TIPS)',  bps: true,  kind: 'rate' },
  bei:   { label: '10Y breakeven',    bps: true,  kind: 'rate' },
  hy:    { label: 'HY credit spread', bps: true,  kind: 'spread', up: 'widening', down: 'tightening' },
  vix:   { label: 'VIX',              bps: false, kind: 'level', dp: 2 },
  dxy:   { label: 'DXY (broad $)',    bps: false, kind: 'level', dp: 2 },
  // Money-market plumbing: SOFR = the overnight REPO rate (% → bps); RRP = the
  // Fed's reverse-repo facility usage ($bn level → change shows liquidity
  // draining/building). Both daily.
  sofr:  { label: 'SOFR (repo rate)',    bps: true,  kind: 'rate' },
  rrp:   { label: 'Reverse repo (RRP)',  bps: false, kind: 'flow', unit: 'bn', dp: 0 },
};

const _round = (x, dp = 0) => { const m = 10 ** dp; return Math.round(x * m) / m; };

// Latest value + change over each window (in OBSERVATIONS: FRED daily series skip
// weekends/holidays, so 1/5/20 obs ≈ 1d/1wk/1mo). Returns null if too few points.
export function seriesDeltas(pts, windows = [1, 5, 20]) {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const last = pts[pts.length - 1];
  if (last?.value == null || !Number.isFinite(last.value)) return null;
  const d = {};
  for (const n of windows) {
    const ref = pts[pts.length - 1 - n];
    d[n] = (pts.length >= n + 1 && ref?.value != null && Number.isFinite(ref.value))
      ? last.value - ref.value : null;
  }
  return { last: last.value, lastDate: last.date, d };
}

const _dirOf = v => (v == null ? '' : v > 0 ? '↑' : v < 0 ? '↓' : '→');

// Build per-series change rows + a preformatted text block for the AI prompt.
// histByKey: { <specKey>: [{date,value}]… }.  Returns { rows, windows, text }.
export function buildMacroChanges(histByKey = {}, spec = MACRO_CHANGE_SPEC, opts = {}) {
  const windows = opts.windows ?? [1, 5, 20];
  const byKey = {};
  const rows = [];
  for (const [key, meta] of Object.entries(spec)) {
    const s = seriesDeltas(histByKey[key], windows);
    if (!s) continue;
    const scale = meta.bps ? 100 : 1;
    const dp = meta.bps ? 0 : (meta.dp ?? 2);
    const deltas = {};
    for (const n of windows) deltas[n] = s.d[n] == null ? null : _round(s.d[n] * scale, dp);
    // Arrow + widening/tightening note reflect the 1d (today's) move — the point
    // of the feature — with 5d/20d shown alongside as context.
    const lead = deltas[windows[0]];
    const row = {
      key, label: meta.label, unit: meta.unit ?? (meta.bps ? 'bps' : 'pt'), kind: meta.kind,
      last: s.last, lastDate: s.lastDate, deltas,
      dir: _dirOf(lead),
      note: meta.up ? (lead > 0 ? meta.up : lead < 0 ? meta.down : '') : '',
    };
    rows.push(row);
    byKey[key] = row;
  }

  // Derived 2s10s (10Y − 2Y), in bps — steepening/flattening.
  if (byKey.us2y && byKey.us10y) {
    const deltas = {};
    for (const n of windows) {
      const a = byKey.us10y.deltas[n], b = byKey.us2y.deltas[n];
      deltas[n] = (a == null || b == null) ? null : _round(a - b, 0);
    }
    const trend = deltas[windows[0]];
    rows.splice(rows.findIndex(r => r.key === 'us10y') + 1, 0, {
      key: 'us2s10s', label: '2s10s curve', unit: 'bps', kind: 'curve',
      last: _round((byKey.us10y.last - byKey.us2y.last) * 100, 0), lastDate: byKey.us10y.lastDate,
      deltas, dir: _dirOf(trend),
      note: trend > 0 ? 'steepening' : trend < 0 ? 'flattening' : '',
    });
  }

  return { rows, windows, text: formatMacroChanges(rows, windows) };
}

// Human/AI-readable value: rates as "4.47%", spreads as "2.69% (269bps)", levels raw.
function _fmtLast(row) {
  if (row.kind === 'rate') return `${_round(row.last, 2)}%`;
  if (row.kind === 'spread') return `${_round(row.last, 2)}% (${_round(row.last * 100, 0)}bps)`;
  if (row.kind === 'curve') return `${_round(row.last, 0)}bps`;   // last already in bps
  if (row.kind === 'flow')  return `$${_round(row.last, 0)}bn`;   // RRP facility usage
  return `${_round(row.last, 2)}`;
}
const _sign = v => (v == null ? 'n/a' : (v > 0 ? '+' : '') + v);

// Preformatted block for the prompt, one line per series:
//   US 10Y 4.47% · 1d +6bps · 5d +12bps · 20d +3bps ↑
export function formatMacroChanges(rows, windows = [1, 5, 20]) {
  if (!rows?.length) return '';
  const lbl = { 1: '1d', 5: '5d', 20: '20d' };
  return rows.map(r => {
    const parts = windows.map(n => `${lbl[n] ?? n + 'obs'} ${_sign(r.deltas[n])}${r.deltas[n] != null ? r.unit : ''}`);
    return `${r.label} ${_fmtLast(r)} · ${parts.join(' · ')} ${r.dir}${r.note ? ' ' + r.note : ''}`;
  }).join('\n');
}
