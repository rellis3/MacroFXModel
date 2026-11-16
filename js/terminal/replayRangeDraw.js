/**
 * Replay of the range used through a London session (the vol clock, played back): one SVG string for one 15-minute step. Pure; every colour is a theme
 * token. Top: the price path since the London open (only what had finished by this step: the rest of the day is not drawn) with the open and the forecast
 * median and 75th-percentile lines either side. Bottom: two gauges, how far the market has travelled up from the open and down from it as a share of the
 * forecast median, on ONE scale for the whole replay, with the median and p75 marks. It is the size of the move, not a call on its direction.
 */
import { esc, fin } from './boardViz.js';
import { rangeScale } from '../replayVizCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
let n = 0;

export function rangeStage(frames, i, extra, { w = 560, reduced = false } = {}) {
  const f = frames?.[i]; if (!f || !extra?.open) return '<p class="muted">Nothing to draw for this step.</p>';
  const d = f.data, fc = extra.fc, open = extra.open.price, win = extra.win, id = `rrr${++n}`;
  const L = 52, R = 12, T = 14, ph = 170, pw = w - L - R, med = fc?.hl_median, p75 = fin(fc?.hl_75) ? fc.hl_75 : null;
  const useFc = !!(fc && d.known && med > 0);
  const seen = extra.path.filter(p => p[0] <= f.t);
  let half = Math.max(d.up, d.dn, 0.05); for (const fr of frames) half = Math.max(half, fr.data.up, fr.data.dn);
  if (useFc) half = Math.max(half, (p75 ?? med) * 1.12);
  const lo = open * (1 - half / 100 * 1.08), hi = open * (1 + half / 100 * 1.08);
  const x = t => L + ((t - win.start) / (win.end - win.start)) * pw, y = p => T + (1 - (p - lo) / (hi - lo)) * ph;
  const line = (price, col, dash, label) => `<line x1="${L}" x2="${L + pw}" y1="${f1(y(price))}" y2="${f1(y(price))}" stroke="${col}" stroke-width="1.1" stroke-dasharray="${dash}" stroke-opacity=".8"/><text x="${L - 5}" y="${f1(y(price) + 3.5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${esc(label)}</text>`;
  let lines = line(open, 'var(--tx2)', '2 3', 'open');
  if (useFc) {
    lines += line(open * (1 + med / 100), 'var(--gold)', '5 4', 'p50 up') + line(open * (1 - med / 100), 'var(--gold)', '5 4', 'p50 dn');
    if (p75) lines += line(open * (1 + p75 / 100), 'var(--pur2)', '5 4', 'p75 up') + line(open * (1 - p75 / 100), 'var(--pur2)', '5 4', 'p75 dn');
  }
  const pts = seen.map(p => `${f1(x(p[0]))},${f1(y(p[1]))}`), path = pts.length ? `M${pts.join('L')}` : '';
  const hx = x(Math.max(f.t - 60e3, extra.open.t)), hy = y(d.price);
  const hours = [0, 6, 12, 18, 24].map(h => `<text x="${f1(L + (h / 24) * pw)}" y="${T + ph + 14}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${String(h % 24).padStart(2, '0')}:00</text>`).join('');
  const sc = rangeScale(frames, fc), gy = T + ph + 32, gh = 14, gx = u => L + (Math.min(u, sc.max) / sc.max) * pw;
  const gauge = (label, pct, row) => {
    const y0 = gy + row * 30, u = useFc ? pct / med : null, col = u != null && u >= 1 ? 'var(--gold)' : 'var(--pur2)';
    const fill = u != null
      ? `<rect x="${L}" y="${y0}" width="${f1(Math.max(2, gx(u) - L))}" height="${gh}" rx="4" fill="${col}" fill-opacity=".85"${!reduced && u >= 1 ? ` filter="url(#${id})"` : ''}/>
<line x1="${f1(gx(1))}" x2="${f1(gx(1))}" y1="${y0 - 3}" y2="${y0 + gh + 3}" stroke="var(--gold)" stroke-width="1.4"/>${sc.p75 ? `<line x1="${f1(gx(sc.p75))}" x2="${f1(gx(sc.p75))}" y1="${y0 - 3}" y2="${y0 + gh + 3}" stroke="var(--pur2)" stroke-width="1.4" stroke-dasharray="3 2"/>` : ''}`
      : `<text x="${L + 8}" y="${y0 + 11}" font-size="10" fill="var(--tx3)">${fc ? 'forecast not computed yet' : 'no forecast archived'}</text>`;
    return `<text x="${L - 5}" y="${y0 + 11}" text-anchor="end" font-size="10" fill="var(--tx2)">${label}</text><rect x="${L}" y="${y0}" width="${pw}" height="${gh}" rx="4" fill="var(--bg3)"/>${fill}
<text x="${w - R}" y="${y0 + 11}" text-anchor="end" font-size="10.5" fill="var(--tx)" font-family="var(--mono)">${pct.toFixed(2)}%${u != null ? ` · ${Math.round(u * 100)}% of p50` : ''}</text>`;
  };
  const H = gy + 66;
  return `<svg class="rpv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="${esc(extra.label)} through the London session: ${d.up.toFixed(2)} percent above the open and ${d.dn.toFixed(2)} percent below it at this step"><defs><filter id="${id}"><feGaussianBlur stdDeviation="3"/></filter></defs>
<rect x="${L}" y="${T}" width="${pw}" height="${ph}" rx="4" fill="none" stroke="var(--line2)" stroke-opacity=".5"/>${lines}${hours}
<path d="${path}" fill="none" stroke="var(--pur2)" stroke-width="2" stroke-linejoin="round"/>
${reduced ? '' : `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="9" fill="var(--pur2)" fill-opacity=".4" filter="url(#${id})"/>`}<circle cx="${f1(hx)}" cy="${f1(hy)}" r="4.5" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1.5"/>
${gauge('up from open', d.up, 0)}${gauge('down from open', d.dn, 1)}
<text x="${L}" y="${H - 4}" font-size="9.5" fill="var(--tx3)">gold mark = the forecast median, dashed = 75th percentile · London time · size of the move, not its direction</text></svg>`;
}
