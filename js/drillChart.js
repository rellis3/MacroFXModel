/**
 * The twenty sessions a drill question measures, drawn — shared by BOTH places the drill
 * appears.
 *
 * WHY THIS IS ITS OWN FILE. The chart, the boundary line and the mechanism panel were
 * built on the practice page (theory-lab/market-reading.html) and today.html's daily
 * question kept only the mechanism panel. Same question, same engine, two different
 * answers on screen — which is exactly the drift a shared brick exists to stop, and the
 * owner caught it before I did.
 *
 * The two pages get their data differently and that is the whole reason this takes a
 * prepared window rather than a bundle:
 *
 *   PRACTICE PAGE — holds the slim bundle already, so it slices the window client-side.
 *   TODAY.HTML    — builds its question on the server and never downloads a bundle, so
 *                   /api/drill-question attaches the window to the question. A few
 *                   hundred bytes, against 42KB for the bundle it would otherwise need.
 *
 * Both hand the same shape to `chartHtml`, so neither page owns the drawing.
 *
 * HONESTY ABOUT SCALE, carried over from where this was first written: every line is its
 * CHANGE from the start of the window, so everything begins at zero and the divergence is
 * the story. Where the series share a unit they share a real axis and the heights mean
 * something; where they do not, each is scaled to its own range and the caption says so
 * rather than letting the picture imply a comparison it cannot support.
 *
 * Pure: no fetch, no DOM, no clock. Tested in js/drillChart.test.mjs.
 */

/** Line colours, as CSS custom properties so each page keeps its own palette. */
export const CHART_COLOURS = ['var(--accent-line-1)', 'var(--accent-line-2)', 'var(--accent-line-3)', 'var(--accent-line-4)'];

const finite = v => Number.isFinite(v);

/**
 * Turn raw values into the change-from-start series a chart is drawn from.
 *
 * `series`: [{ key, label, unit, values: [...] }] — values oldest first, nulls allowed.
 * Returns null when nothing can be drawn honestly.
 */
export function prepare(series = []) {
  const out = [];
  for (const d of series ?? []) {
    const raw = (d?.values ?? []).map(v => finite(v) ? v : null);
    // a window that starts on a hole has no baseline, and one that is mostly holes
    // cannot be drawn without inventing the missing days
    if (raw.length < 5 || raw[0] == null || raw.filter(v => v != null).length < 5) continue;
    const base = raw[0];
    const chg = raw.map(v => v == null ? null : (d.unit === 'bp' ? (v - base) * 100 : (base ? (v / base - 1) * 100 : 0)));
    out.push({ key: d.key, label: d.label, unit: d.unit, chg, end: chg.at(-1) ?? 0 });
  }
  return out.length ? out : null;
}

export const fmtChg = (v, unit) => unit === 'bp'
  ? `${v >= 0 ? '+' : ''}${Math.round(v)}bp`
  : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

/**
 * The chart, as an HTML string.
 *
 * `prepared` comes from `prepare`. `cls` lets each page keep its own class prefix so the
 * two stylesheets stay independent — the drawing is shared, the styling is not.
 */
export function chartHtml(prepared, { date = '', compact = false, cls = 'dc', esc = String } = {}) {
  if (!prepared?.length) return '';
  const units = new Set(prepared.map(s => s.unit));
  const shared = units.size === 1;                    // one unit => one real axis
  const W = 300, H = compact ? 64 : 86, PAD = 3;
  const n = Math.max(...prepared.map(s => s.chg.length)) - 1 || 1;

  let scale;
  if (shared) {
    const all = prepared.flatMap(s => s.chg).filter(finite).concat([0]);
    const lo = Math.min(...all), hi = Math.max(...all), span = (hi - lo) || 1;
    scale = v => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  } else {
    scale = (v, s) => {
      const own = s.chg.filter(finite).concat([0]);
      const lo = Math.min(...own), hi = Math.max(...own), span = (hi - lo) || 1;
      return H - PAD - ((v - lo) / span) * (H - 2 * PAD);
    };
  }

  const lines = prepared.map((s, k) => {
    // nulls BREAK the line rather than being bridged — a straight segment across missing
    // days is a drawing of data that does not exist
    const segs = []; let cur = [];
    s.chg.forEach((v, i) => {
      if (v == null) { if (cur.length > 1) segs.push(cur); cur = []; return; }
      cur.push(`${(i / n * W).toFixed(1)},${scale(v, s).toFixed(1)}`);
    });
    if (cur.length > 1) segs.push(cur);
    const col = CHART_COLOURS[k % CHART_COLOURS.length];
    const last = segs.at(-1)?.at(-1);
    return segs.map(p => `<polyline points="${p.join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`).join('')
      + (last ? `<circle cx="${last.split(',')[0]}" cy="${last.split(',')[1]}" r="2.2" fill="${col}" vector-effect="non-scaling-stroke"/>` : '');
  }).join('');

  const zeroY = shared ? scale(0) : null;
  const legend = prepared.map((s, k) =>
    `<span class="${cls}-li"><span class="${cls}-ld" style="background:${CHART_COLOURS[k % CHART_COLOURS.length]}"></span>${esc(s.label)} <span class="${cls}-lv">${fmtChg(s.end, s.unit)}</span></span>`).join('');

  return `<div class="${cls}-chart">
    <div class="${cls}-l">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
         aria-label="${esc(prepared.map(s => `${s.label} ${fmtChg(s.end, s.unit)}`).join(', '))} over the twenty sessions${date ? ` to ${date}` : ''}">
      ${zeroY != null ? `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ''}
      ${lines}
    </svg>
    <div class="${cls}-c">Each line is its change from the start of the twenty sessions${date ? ` ending ${esc(date)}` : ''}${
      shared ? `, on a shared ${prepared[0].unit === 'bp' ? 'basis-point' : 'percent'} axis — so the heights are directly comparable.`
             : `. The units differ, so each line is scaled to its own range: read the shapes and the timing, not the heights against each other.`}</div>
  </div>`;
}
