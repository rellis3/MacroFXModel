/**
 * The Path replay: one frame as one HTML string. Pure; every colour is a theme token. Left of the "now" line is the past (the price so far, drawn from the 15-minute bars, and each
 * expired expiry's final level as a faded line with a ring where price came closest); right of it is the future (each live expiry's level at its days to expiry, with the previous
 * nights' versions as fading dots and the one and two expected-move funnel). It shows where price is against the levels, not where it will go.
 */
import { esc, fin, smoothPath } from './boardViz.js';
import { stateAt, units, PAST_DAYS, DTE_MAX, STEP, DAYMS, stamp } from '../pathReplayCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
const px = (v, dp) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');
const s1 = v => (fin(v) ? v.toFixed(1) : '–');
let uidN = 0;

export function pathStage(frames, k, extra, { w = 720, reduced = false } = {}) {
  const f = frames?.[k]; if (!f || !extra?.records?.length) return '<p class="muted">Nothing to draw for this step.</p>';
  const ts = f.t, st = stateAt(extra.records, extra.bars, extra.anchor, ts); if (!st) return '<p class="muted">No nightly record is in force yet.</p>';
  const dp = extra.dp ?? 2, id = `pth${++uidN}`, L = 62, R1 = w - 10, T = 14, ph = 260, nowX = L + (R1 - L) * 0.46, { lo, hi } = extra.range;
  const y = p => T + (1 - (p - lo) / (hi - lo)) * ph, cy = p => Math.max(T, Math.min(T + ph, y(p)));
  const xp = ms => L + ((ms - (ts - PAST_DAYS * DAYMS)) / (PAST_DAYS * DAYMS)) * (nowX - L), xf = d => nowX + (Math.sqrt(Math.min(d, DTE_MAX)) / Math.sqrt(DTE_MAX)) * (R1 - nowX);
  const bars = extra.bars, seen = bars.filter(b => b[0] + STEP <= ts && b[0] + STEP >= ts - PAST_DAYS * DAYMS), last = seen.at(-1), now = last ? last[4] : st.rec.close;
  let grid = ''; for (let g = 0; g <= 4; g++) { const p = lo + (hi - lo) * g / 4; grid += `<line x1="${L}" x2="${R1}" y1="${f1(y(p))}" y2="${f1(y(p))}" stroke="var(--line2)" stroke-opacity=".3"/><text x="${L - 6}" y="${f1(y(p) + 3.5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${px(p, dp > 3 ? 4 : 0)}</text>`; }
  // the expected-move funnel (1 and 2 expected moves out to each expiry)
  const s = st.rec.close * st.rec.vol; let fun = '';
  if (fin(s) && s > 0) for (const m of [2, 1]) {
    const up = [], dn = []; for (let d = 0; d <= DTE_MAX; d += 1.5) { const em = s * Math.sqrt(Math.max(0.2, d * 5 / 7)) * m; up.push(`${f1(xf(d))},${f1(cy(now + em))}`); dn.push(`${f1(xf(d))},${f1(cy(now - em))}`); }
    fun += `<path d="M${up.join('L')}L${dn.reverse().join('L')}Z" fill="var(--pur2)" fill-opacity="${m === 1 ? 0.13 : 0.07}" stroke="none"/>`;
  }
  // past: expired expiries' final levels, faded, with a ring at the closest approach
  let past = '';
  for (const p of st.past) {
    const x0 = Math.max(L, xp(Date.parse(`${p.expiry}T23:59:59Z`)));
    past += `<line x1="${f1(x0)}" x2="${f1(nowX)}" y1="${f1(cy(p.px))}" y2="${f1(cy(p.px))}" stroke="var(--tx2)" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="5 4"/><text x="${f1(x0 + 3)}" y="${f1(cy(p.px) - 4)}" font-size="9.5" fill="var(--tx2)" font-family="var(--mono)">−${p.ago}d</text>`;
    if (p.closest) { const cx = Math.max(L, Math.min(nowX, xp(p.closest.at))); past += `<circle cx="${f1(cx)}" cy="${f1(cy(p.px))}" r="${p.closest.touched ? 6 : 4.5}" fill="${p.closest.touched ? 'var(--bg1)' : 'none'}" stroke="var(--tx)" stroke-width="1.4" stroke-opacity=".85"/>`; }
  }
  // future: each live expiry at its days left, ghosts of its earlier levels, and the walk line through them
  let fut = '', walk = [];
  for (const l of st.live) {
    if (l.dte > DTE_MAX) continue; const x = xf(l.dte);
    fut += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${T}" y2="${T + ph}" stroke="var(--gold)" stroke-opacity=".22" stroke-dasharray="3 4"/>`;
    l.ghosts.forEach((g, j) => { fut += `<circle cx="${f1(x)}" cy="${f1(cy(g))}" r="3" fill="var(--pur2)" fill-opacity="${(0.4 - j * 0.07).toFixed(2)}"/>`; });
    fut += `<circle cx="${f1(x)}" cy="${f1(cy(l.px))}" r="5" fill="var(--gold)" stroke="var(--bg1)" stroke-width="1.4"/><text x="${f1(x)}" y="${f1(cy(l.px) - 9)}" text-anchor="${x > R1 - 26 ? 'end' : 'middle'}" font-size="9.5" fill="var(--tx)" font-family="var(--mono)">${l.dte}d</text>`;
    walk.push([x, cy(l.px)]);
  }
  const walkLine = walk.length ? `<path d="M${f1(nowX)},${f1(cy(now))}L${walk.map(p => `${f1(p[0])},${f1(p[1])}`).join('L')}" fill="none" stroke="var(--pur2)" stroke-width="1.1" stroke-opacity=".55" stroke-dasharray="2 3"/>` : '';
  // the real price so far, smooth
  const pts = seen.map(b => [xp(b[0] + STEP), cy(b[4])]), path = pts.length > 2 ? `<path d="${smoothPath(pts, 0.5)}" fill="none" stroke="var(--pur2)" stroke-width="2.2" stroke-linecap="round"${reduced ? '' : ` filter="url(#${id})"`}/>` : '';
  const head = `${reduced ? '' : `<circle cx="${f1(nowX)}" cy="${f1(cy(now))}" r="9" fill="var(--pur2)" fill-opacity=".35" filter="url(#${id})"/>`}<circle cx="${f1(nowX)}" cy="${f1(cy(now))}" r="4.5" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1.5"/>`;
  const svg = `<svg class="rpv-svg oit-svg" viewBox="0 0 ${w} ${T + ph + 34}" width="100%" role="img" aria-label="${esc(extra.label)} price against the ${esc(extra.anchorLabel)} of each option expiry at ${esc(stamp(ts))}: ${st.live.length} live expiries to the right, ${st.past.length} recently expired to the left">
<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="${id}c"><rect x="${L}" y="${T}" width="${R1 - L}" height="${ph}"/></clipPath></defs>
<rect x="${L}" y="${T}" width="${R1 - L}" height="${ph}" rx="4" fill="var(--bg2)" fill-opacity=".5" stroke="var(--line2)" stroke-opacity=".5"/>${grid}
<g clip-path="url(#${id}c)">${fun}${past}${fut}${walkLine}${path}</g>${head}
<line x1="${f1(nowX)}" x2="${f1(nowX)}" y1="${T}" y2="${T + ph}" stroke="var(--tx3)" stroke-opacity=".5" stroke-dasharray="2 3"/>
<text x="${f1(nowX)}" y="${T + ph + 14}" text-anchor="middle" font-size="9.5" fill="var(--tx2)">now</text><text x="${L}" y="${T + ph + 14}" font-size="9.5" fill="var(--tx3)">past ${PAST_DAYS} days</text><text x="${R1}" y="${T + ph + 14}" text-anchor="end" font-size="9.5" fill="var(--tx3)">days to expiry (compressed) ▸</text>
<text x="${L}" y="${T + ph + 28}" font-size="9.5" fill="var(--tx3)">${esc('gold dot = level now · purple dots = the same expiry on earlier nights · ring = closest approach · shading = 1 and 2 expected moves')}</text></svg>`;
  const row = (e, kind) => `<tr><td>${esc(e.expiry)}</td><td>${kind === 'live' ? `${e.dte}d left` : `ended ${e.ago}d ago`}</td><td class="n">${px(e.px, dp)}</td><td class="n">${kind === 'live' ? s1(e.away) : ''}</td><td class="n">${e.closest ? (e.closest.touched ? 'touched' : `${s1(e.sigma)} σ · ${s1(e.em)} em`) : '–'}</td>${kind === 'past' ? `<td class="n">${e.mirror ? (e.mirror.touched ? 'touched' : 'not touched') : '–'}</td>` : '<td></td>'}</tr>`;
  const rows = [...st.live.filter(l => l.dte <= DTE_MAX).slice(0, 6).map(l => row(l, 'live')), ...st.past.map(p => row(p, 'past'))].join('');
  const table = `<div class="oit-tblw"><table class="oit-tbl"><thead><tr><th>Expiry</th><th></th><th class="n">Level</th><th class="n">From price (σ)</th><th class="n">Closest so far</th><th class="n">Mirror</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return `${svg}${table}<p class="gw-touch muted">${esc(extra.tallyText)}</p><div class="gw-meta">${[`<span class="chip">${esc(extra.anchorLabel)}: ${esc(extra.verdict)} (Evidence Book)</span>`, ...(extra.evChips ?? [])].join('')}</div>`;
}
