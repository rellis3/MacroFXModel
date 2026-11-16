/**
 * Ghost walk, one frame as one HTML string (SVG chart + the small facts under it). Pure; every colour is a theme token. The chart: x is the London clock for the whole
 * day (00 to 24), y is units of the day's own forecast median range from its open. The earlier days are faint ghosts with their middle-80% band and median; the
 * option levels are lines that start when their capture was saved; the bright line is the day so far (nothing after the current step is drawn).
 * It shows where price was against the levels. It does not say where price will go.
 */
import { esc, fin } from './boardViz.js';
import { toUnits, hmOf, fmtU, STEP_MS } from '../ghostWalkCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
const TYPE_COL = { call: 'var(--up)', put: 'var(--dn)', maxpain: 'var(--gold)', gammaflip: 'var(--tx)', gexflip: 'var(--tx2)' };
const TYPE_DASH = { call: '', put: '', maxpain: '6 4', gammaflip: '2 3', gexflip: '2 3' };
const TYPE_TAG = { call: 'call wall', put: 'put wall', maxpain: 'max pain', gammaflip: 'gamma flip', gexflip: 'GEX flip' };
let uidN = 0;

/** The y range (units) one fixed scale for the whole replay: the focus day, the ghost band and the nearby levels. */
export function yBound(frames, extra) {
  let m = 1.25;
  for (const f of frames ?? []) { m = Math.max(m, Math.abs(f.data.hi), Math.abs(f.data.lo), Math.abs(f.data.y)); }
  for (const b of extra?.bandSeries ?? []) if (b.p90 != null) m = Math.max(m, Math.abs(b.p90), Math.abs(b.p10));
  for (const l of extra?.lines ?? []) if (Math.abs(l.y) <= 2) m = Math.max(m, Math.abs(l.y));
  return Math.min(3, Math.ceil(m * 4) / 4 + 0.1);
}

/** The labels at the right edge, one per level and the +1/-1 median marks, pushed apart so clustered levels stay readable (a label never moves off its line by more than a few px). */
function tagSvg(tags, { L = 52, pw = 514, gap = 10.5, top = 12, bottom = 262 } = {}) {
  const t = tags.map(x => ({ ...x })).sort((a, b) => a.y - b.y);
  for (let i = 0; i < t.length; i++) { t[i].ly = Math.max(top + 4, i ? Math.max(t[i].y, t[i - 1].ly + gap) : t[i].y); }
  for (let i = t.length - 1; i >= 0; i--) if (t[i].ly > bottom) t[i].ly = i < t.length - 1 ? Math.min(bottom, t[i + 1].ly - gap) : bottom;
  return t.map(x => `<text x="${L + pw + 4}" y="${f1(x.ly + 3.5)}" font-size="9" fill="${x.col}" font-family="var(--mono)">${esc(x.text)}</text>`).join('');
}

export function ghostStage(frames, i, extra, { w = 640, reduced = false } = {}) {
  const f = frames?.[i]; if (!f || !extra?.focus) return '<p class="muted">Nothing to draw for this step.</p>';
  const d = f.data, focus = extra.focus, id = `gw${++uidN}`, dp = extra.dp ?? 2;
  const L = 52, R = 74, T = 12, ph = 250, pw = w - L - R, day = 24 * 3600e3, B = yBound(frames, extra);
  const x = ms => L + (ms / day) * pw, y = u => T + (1 - (u + B) / (2 * B)) * ph, cy = u => Math.max(T, Math.min(T + ph, y(u)));
  // grid in units
  let grid = '';
  for (let u = -Math.floor(B * 2) / 2; u <= B + 1e-9; u += 0.5) {
    const k = Math.round(u * 2) / 2, major = Math.abs(k % 1) < 1e-9;
    grid += `<line x1="${L}" x2="${L + pw}" y1="${f1(y(k))}" y2="${f1(y(k))}" stroke="var(--line2)" stroke-opacity="${major ? '.55' : '.25'}" stroke-width="1"${k === 0 ? ' stroke-dasharray="2 3"' : ''}/>`
      + `<text x="${L - 6}" y="${f1(y(k) + 3.5)}" text-anchor="end" font-size="9.5" fill="${k === 0 ? 'var(--tx2)' : 'var(--tx3)'}" font-family="var(--mono)">${k === 0 ? 'open' : (k > 0 ? '+' : '−') + Math.abs(k).toFixed(1)}</text>`;
  }
  const hours = [0, 6, 12, 18, 24].map(h => `<text x="${f1(L + (h / 24) * pw)}" y="${T + ph + 14}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${String(h % 24).padStart(2, '0')}:00</text>`).join('');
  const med = [1, -1].map(s => `<line x1="${L}" x2="${L + pw}" y1="${f1(y(s))}" y2="${f1(y(s))}" stroke="var(--gold)" stroke-opacity=".55" stroke-width="1" stroke-dasharray="5 4"/>`).join('')
;
  // the earlier days (ghosts), their band and median
  let ghosts = '', band = '';
  if (extra.ghostsOn) {
    for (const g of extra.ghosts) {
      const pts = g.path.map(p => { const u = toUnits(p[1], g.open, g.unitPct); return fin(u) ? `${f1(x(p[0]))},${f1(cy(u))}` : null; }).filter(Boolean);
      if (pts.length > 4) ghosts += `<path d="M${pts.join('L')}" fill="none" stroke="var(--pur2)" stroke-opacity=".10" stroke-width="1" stroke-linejoin="round"/>`;
    }
    const bs = (extra.bandSeries ?? []).filter(b => b.p90 != null);
    if (bs.length > 2) {
      const up = bs.map(b => `${f1(x(b.x))},${f1(cy(b.p90))}`), dn = bs.slice().reverse().map(b => `${f1(x(b.x))},${f1(cy(b.p10))}`);
      band = `<path d="M${up.join('L')}L${dn.join('L')}Z" fill="var(--pur2)" fill-opacity=".10" stroke="none"/><path d="M${bs.map(b => `${f1(x(b.x))},${f1(cy(b.med))}`).join('L')}" fill="none" stroke="var(--tx2)" stroke-opacity=".8" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    }
  }
  // the day's option levels: lines from the time their capture was saved; touched ones are heavier, a fresh touch pulses
  let lines = '', off = 0; const tags = [{ y: y(1), text: '+1 median', col: 'var(--gold)' }, { y: y(-1), text: '−1 median', col: 'var(--gold)' }];
  for (const l of extra.lines) {
    if (Math.abs(l.y) > B) { off++; continue; }
    const col = TYPE_COL[l.type] ?? 'var(--tx2)', on = d.touched.includes(l.id), at = extra.touchAt[l.id], fresh = on && at != null && d.x - at <= 2 * STEP_MS && !reduced, x0 = Math.max(0, l.x);
    lines += `<line x1="${f1(x(x0))}" x2="${L + pw}" y1="${f1(y(l.y))}" y2="${f1(y(l.y))}" stroke="${col}" stroke-width="${on ? 2 : 1.2}" stroke-opacity="${on ? '.95' : '.6'}"${TYPE_DASH[l.type] ? ` stroke-dasharray="${TYPE_DASH[l.type]}"` : ''}/>`
      ;
    tags.push({ y: y(l.y), text: TYPE_TAG[l.type] ?? l.type, col });
    if (on && at != null) lines += `<circle class="${fresh ? 'gw-ring' : ''}" cx="${f1(x(at - STEP_MS / 2))}" cy="${f1(y(l.y))}" r="${fresh ? 7 : 4}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  }
  // the day so far
  const seen = focus.path.filter(p => p[0] <= d.x), pts = seen.map(p => { const u = toUnits(p[1], focus.open, focus.unitPct); return fin(u) ? `${f1(x(p[0]))},${f1(cy(u))}` : null; }).filter(Boolean);
  const path = pts.length > 1 ? `<path d="M${pts.join('L')}" fill="none" stroke="var(--pur2)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"${reduced ? '' : ` filter="url(#${id})"`}/>` : '';
  const hx = x(d.x), hy = cy(d.y);
  const head = `${reduced ? '' : `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="9" fill="var(--pur2)" fill-opacity=".35" filter="url(#${id})"/>`}<circle cx="${f1(hx)}" cy="${f1(hy)}" r="4.5" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1.5"/>`;
  const tag = `<text x="${f1(Math.min(hx + 8, L + pw - 4))}" y="${f1(Math.max(T + 10, hy - 8))}" text-anchor="${hx > L + pw - 90 ? 'end' : 'start'}" font-size="10.5" fill="var(--tx)" font-family="var(--mono)">${fmtU(d.y)}</text>`;
  const sub = `1 unit = ${extra.unitPct.toFixed(2)}% of the open${fin(extra.unitPts) ? ` (about ${extra.unitPts.toLocaleString('en-GB', { maximumFractionDigits: dp > 3 ? 4 : 1 })})` : ''}, the day's forecast median range · London time`;
  const svg = `<svg class="rpv-svg gw-svg" viewBox="0 0 ${w} ${T + ph + 34}" width="100%" role="img" aria-label="${esc(extra.label)} on ${esc(focus.date)} in units of its forecast median range from the open: ${fmtU(d.y)} at ${hmOf(d.x)} London${extra.ghostsOn ? `, drawn over ${extra.ghosts.length} earlier days` : ''}">
<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="${id}c"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs>
<rect x="${L}" y="${T}" width="${pw}" height="${ph}" rx="4" fill="var(--bg2)" fill-opacity=".5" stroke="var(--line2)" stroke-opacity=".5"/>${grid}${med}
<g clip-path="url(#${id}c)">${band}${ghosts}${lines}${path}</g>${head}${tag}${hours}${tagSvg(tags)}
<line x1="${f1(hx)}" x2="${f1(hx)}" y1="${T}" y2="${T + ph}" stroke="var(--tx3)" stroke-opacity=".35" stroke-dasharray="2 3"/>
<text x="${L}" y="${T + ph + 28}" font-size="9.5" fill="var(--tx3)">${esc(sub)}</text></svg>`;
  const meta = [
    extra.ghostsOn ? `<span class="chip">${extra.ghosts.length} ${esc(extra.filterLabel)}</span>` : `<span class="chip" title="${esc(extra.noGhostsWhy)}">no ghosts: ${esc(extra.noGhostsWhy)}</span>`,
    extra.oiLine ? `<span class="chip">${esc(extra.oiLine)}</span>` : '<span class="chip">no option-OI capture in force</span>',
    off ? `<span class="chip">${off} level${off === 1 ? '' : 's'} off the chart</span>` : '',
    ...(extra.evChips ?? []),
  ].filter(Boolean).join('');
  return `${svg}<div class="gw-meta">${meta}</div>
<p class="gw-touch muted">${esc(extra.touchText)}</p>
<div class="gw-ex" data-noexport><button type="button" class="btn" data-gw-ex="csv" title="Save this day's path and levels as a CSV file (made in this browser)">CSV</button><button type="button" class="btn" data-gw-ex="png" title="Save the chart as a PNG image (made in this browser)">PNG</button></div>`;
}
