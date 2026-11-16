/**
 * Event replay, one frame as one HTML string (SVG chart + the small facts under it). Pure; every colour is a theme token. x is the minutes from the release (-30 to +240), y is the
 * market's move since the release minute in units of its typical 30-minute reaction to this kind of release. The bright line is the release being replayed (nothing after the current
 * minute is drawn), the faint lines are the last five of the same kind drawn to the same minute, the band is their middle 80% and the dashed line their median.
 * It shows size and timing. It does not say which way the next release will go.
 */
import { esc, fin, smoothPath } from './boardViz.js';
import { OFFS, yBound, fmtU, fmtPct, sizeAt, marketLabel, familyLabel } from '../eventReplayCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
let uidN = 0;

export function eventStage(frames, i, extra, { w = 680, reduced = false } = {}) {
  const f = frames?.[i]?.data; if (!f || !extra) return '<p class="muted">Nothing to draw for this step.</p>';
  const L = 46, R = w - 12, T = 14, H = 250, Y = yBound(frames), id = `evr${++uidN}`;
  const x = m => L + ((m - OFFS[0]) / (OFFS[1] - OFFS[0])) * (R - L), y = u => T + (1 - (u + Y) / (2 * Y)) * H, cy = u => Math.max(T, Math.min(T + H, y(u)));
  const upto = frames.slice(0, i + 1);
  let grid = ''; for (const g of [-Y, -Y / 2, 0, Y / 2, Y]) grid += `<line x1="${L}" x2="${R}" y1="${f1(y(g))}" y2="${f1(y(g))}" stroke="var(--line2)" stroke-opacity="${g === 0 ? 0.7 : 0.3}"/><text x="${L - 5}" y="${f1(y(g) + 3.5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${fmtU(g).replace('+', '')}</text>`;
  const ticks = [-30, 0, 30, 60, 120, 180, 240].map(m => `<text x="${f1(x(m))}" y="${T + H + 14}" text-anchor="middle" font-size="9.5" fill="${m === 0 ? 'var(--tx)' : 'var(--tx3)'}" font-family="var(--mono)">${m === 0 ? 'release' : `${m > 0 ? '+' : '−'}${Math.abs(m)}m`}</text>`).join('');
  // the ghosts, one faint line each, to the current minute only
  let ghosts = '';
  extra.ghostIds.forEach((gid, gi) => {
    const pts = upto.map(fr => [x(fr.t), fr.data.ghosts[gi]]).filter(p => fin(p[1])).map(p => [p[0], cy(p[1])]);
    if (pts.length > 2) ghosts += `<path d="${smoothPath(pts, 0.4)}" fill="none" stroke="var(--tx2)" stroke-opacity=".38" stroke-width="1.1"/>`;
  });
  // the middle 80% band and the median of the ghosts, to the current minute
  const band = upto.filter(fr => fin(fr.data.lo) && fin(fr.data.hi));
  const bandPath = band.length > 2 ? `<path d="M${band.map(fr => `${f1(x(fr.t))},${f1(cy(fr.data.hi))}`).join('L')}L${[...band].reverse().map(fr => `${f1(x(fr.t))},${f1(cy(fr.data.lo))}`).join('L')}Z" fill="var(--pur2)" fill-opacity=".14" stroke="none"/>` : '';
  const medPts = band.filter(fr => fin(fr.data.med)).map(fr => `${f1(x(fr.t))},${f1(cy(fr.data.med))}`);
  const medLine = medPts.length > 2 ? `<path d="M${medPts.join('L')}" fill="none" stroke="var(--pur2)" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="4 3"/>` : '';
  // the release being replayed
  const fp = upto.filter(fr => fin(fr.data.y)).map(fr => [x(fr.t), cy(fr.data.y)]);
  const path = fp.length > 2 ? `<path d="${smoothPath(fp, 0.5)}" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round"${reduced ? '' : ` filter="url(#${id})"`}/>` : '';
  const last = fp.at(-1), head = last ? `${reduced ? '' : `<circle cx="${f1(last[0])}" cy="${f1(last[1])}" r="9" fill="var(--gold)" fill-opacity=".3" filter="url(#${id})"/>`}<circle cx="${f1(last[0])}" cy="${f1(last[1])}" r="4.5" fill="var(--gold)" stroke="var(--bg1)" stroke-width="1.5"/>` : '';
  const svg = `<svg class="rpv-svg evr-svg" viewBox="0 0 ${w} ${T + H + 30}" width="100%" role="img" aria-label="${esc(marketLabel(extra.mkt))} around the ${esc(extra.focusLabel)} release, minute ${f.min}">
<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="${id}c"><rect x="${L}" y="${T}" width="${R - L}" height="${H}"/></clipPath></defs>
<rect x="${L}" y="${T}" width="${R - L}" height="${H}" rx="4" fill="var(--bg2)" fill-opacity=".5" stroke="var(--line2)" stroke-opacity=".5"/>${grid}
<line x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${T}" y2="${T + H}" stroke="var(--tx)" stroke-opacity=".55" stroke-dasharray="2 3"/>
<g clip-path="url(#${id}c)">${bandPath}${ghosts}${medLine}${path}</g>${head}${ticks}
<text x="${L}" y="${T + H + 28}" font-size="9.5" fill="var(--tx3)">${esc('gold = this release · faint lines = the last releases of the same kind · band = their middle 80% · 1 unit = a typical 30-minute reaction')}</text></svg>`;
  const s = sizeAt(frames, f.min), sizeRow = s && f.min > 0
    ? `<tr><td>This release</td><td class="n">${fmtU(f.y)}</td><td class="n">${fmtPct(f.y * extra.unit)}</td></tr>${f.med != null ? `<tr><td>Last ${f.n} releases of this kind: middle 80%</td><td class="n">${fmtU(f.lo)} to ${fmtU(f.hi)}</td><td class="n">${fmtPct(f.lo * extra.unit)} to ${fmtPct(f.hi * extra.unit)}</td></tr>` : ''}` : '';
  const table = sizeRow ? `<div class="oit-tblw"><table class="oit-tbl"><thead><tr><th>At ${f.min >= 0 ? '+' : '−'}${Math.abs(f.min)} minutes</th><th class="n">Units</th><th class="n">% of price</th></tr></thead><tbody>${sizeRow}</tbody></table></div>` : '';
  const chips = [`<span class="chip">${esc(familyLabel(extra.family))}: ${esc(extra.mktLabel)}</span>`, ...(extra.evidence ?? []).map(e => `<span class="chip" title="Evidence Book: ${esc(e.id)}">${esc(e.what)}: ${esc(e.verdict)}</span>`), ...(extra.thin ? ['<span class="chip" title="the stored path has gaps">thin data</span>'] : [])];
  return `${svg}${table}<p class="gw-touch muted">${esc(extra.facts.join(' · '))}</p><div class="gw-meta">${chips.join('')}</div>
<div class="gw-ex" data-noexport><button type="button" class="btn" data-evr-ex="csv" title="Save this replay as a CSV file (made in this browser)">CSV</button><button type="button" class="btn" data-evr-ex="png" title="Save the chart as a PNG image (made in this browser)">PNG</button></div>`;
}
