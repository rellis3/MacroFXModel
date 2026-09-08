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
  rrp:   { label: 'Reverse repo (RRP)',  bps: false, kind: 'flow', unit: 'bn', dp: 2 },
};

const _round = (x, dp = 0) => { const m = 10 ** dp; return Math.round(x * m) / m; };

// ── Formatting a $bn flow ────────────────────────────────────────────────────
// RRP ran in the HUNDREDS of billions for years, so whole-billion precision was
// right. The facility has since drained to well under $1bn — at which point 0 dp
// turns a live reading into a flat "$0bn / 1d 0 / 5d 0", which is indistinguishable
// from a dead feed. Precision now follows magnitude, and a non-zero value is never
// allowed to render as exactly zero.
export function flowDp(v) {
  const a = Math.abs(Number(v));
  if (!Number.isFinite(a)) return 2;
  return a >= 100 ? 0 : a >= 10 ? 1 : 2;
}

/** Format a $bn flow. Returns a STRING; '<0.01' rather than '0' for a live trickle. */
export function formatFlowBn(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '–';
  const dp = flowDp(n);
  const r = Number(n.toFixed(dp));
  if (r === 0 && n !== 0) return n > 0 ? '<0.01' : '>-0.01';
  return r.toFixed(dp);
}


// Latest value + change over each window, measured in CALENDAR DAYS BACK, not in
// observation count.
//
// It used to index back N observations and label the result "1d / 5d / 20d". On a
// daily series that is roughly right (weekends/holidays are skipped, so 1/5/20 obs
// ≈ 1d/1wk/1mo). On a MONTHLY series it is silently catastrophic: `us10y` was fed
// FRED's GS10 monthly average, so the "1d" row was a one-month move and the "20d"
// row was a twenty-month move — displayed in the same strip, in the same style, as
// genuinely-daily VIX and HY rows. The series are now DGS*, but a count-based
// window would re-break the moment any monthly series is added, so the window is
// now what the label says it is.
//
// Semantics: for window N, take the newest observation dated at least N days before
// the latest one, and accept it only if it is not much older than N.
//
// The tolerance is N + max(4, 0.6N) days. The flat 4 covers market holidays and long
// weekends on a daily series (a "1d" ask over Easter legitimately reaches 4 days
// back); the proportional part lets a coarse series answer a wide window (a monthly
// series answering "20d" with a 31-day gap is a fair approximation) while still
// refusing to answer a narrow one (that same 31-day gap cannot be called "1d", which
// is exactly what GS10 was doing on this strip). Deliberately NOT scaled by the
// series' own cadence: doing that makes a slow series tolerant of everything, which
// re-admits the bug.
//
// `refDate`/`refGapDays`/`cadenceDays` let a caller show what a row actually spans
// rather than trusting the label. Undated series keep the old positional behaviour,
// so any caller passing bare {value} arrays is unaffected.
const _DAY_MS = 864e5;
const _ts = p => { const t = Date.parse(p?.date ?? ''); return Number.isFinite(t) ? t : NaN; };

/** Median calendar-day spacing of a dated series; null when it can't be measured. */
export function seriesCadenceDays(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    const a = _ts(pts[i - 1]), b = _ts(pts[i]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) gaps.push((b - a) / _DAY_MS);
  }
  if (gaps.length < 2) return null;
  gaps.sort((x, y) => x - y);
  const mid = gaps.length >> 1;
  const med = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.round(med * 10) / 10;
}

export function seriesDeltas(pts, windows = [1, 5, 20]) {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const last = pts[pts.length - 1];
  if (last?.value == null || !Number.isFinite(last.value)) return null;
  const lastT = _ts(last);
  const dated = Number.isFinite(lastT);
  const cadenceDays = dated ? seriesCadenceDays(pts) : null;
  const d = {}, refDate = {}, refGapDays = {};
  for (const n of windows) {
    d[n] = null; refDate[n] = null; refGapDays[n] = null;
    if (!dated) {
      // Legacy positional path — only for series with no usable dates at all.
      const ref = pts[pts.length - 1 - n];
      if (pts.length >= n + 1 && ref?.value != null && Number.isFinite(ref.value)) d[n] = last.value - ref.value;
      continue;
    }
    const cutoff = lastT - n * _DAY_MS;
    let ref = null;
    for (let i = pts.length - 2; i >= 0; i--) {
      const t = _ts(pts[i]);
      if (Number.isFinite(t) && t <= cutoff) { ref = pts[i]; break; }
    }
    if (!ref || ref.value == null || !Number.isFinite(ref.value)) continue;
    const gap = Math.round((lastT - _ts(ref)) / _DAY_MS);
    // The nearest available print is much older than the window asked for: this
    // series' cadence cannot answer this question, so report nothing rather than a
    // number whose real horizon differs from its label.
    if (!Number.isFinite(gap) || gap > n + Math.max(4, 0.6 * n)) continue;
    refDate[n] = ref.date ?? null; refGapDays[n] = gap;
    d[n] = last.value - ref.value;
  }
  return { last: last.value, lastDate: last.date, d, refDate, refGapDays, cadenceDays };
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
      // What each window ACTUALLY spans, and the series' own print cadence — so a
      // consumer can show "1d" honestly, or say why a window is blank, instead of
      // assuming every row on the strip is measured over the same horizon.
      refGapDays: s.refGapDays, cadenceDays: s.cadenceDays,
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
      // A derived row is only as well-dated as its slower leg.
      refGapDays: Object.fromEntries(windows.map(n => [n,
        Math.max(byKey.us10y.refGapDays?.[n] ?? 0, byKey.us2y.refGapDays?.[n] ?? 0) || null])),
      cadenceDays: Math.max(byKey.us10y.cadenceDays ?? 0, byKey.us2y.cadenceDays ?? 0) || null,
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
    const parts = windows.map(n => {
      if (r.deltas[n] == null) return `${lbl[n] ?? n + 'd'} n/a`;
      // Say so when the nearest print is materially older than the window asked
      // for (holiday weeks, a slower series) rather than letting the label imply
      // a horizon the data doesn't have.
      const gap = r.refGapDays?.[n];
      const span = (gap != null && gap > n + 1) ? ` (over ${gap}d)` : '';
      return `${lbl[n] ?? n + 'd'} ${_sign(r.deltas[n])}${r.unit}${span}`;
    });
    return `${r.label} ${_fmtLast(r)} · ${parts.join(' · ')} ${r.dir}${r.note ? ' ' + r.note : ''}`;
  }).join('\n');
}
