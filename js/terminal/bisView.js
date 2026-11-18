/**
 * BIS heat strip (Desk Terminal, preview): the Insight tab's "Bank credit" board. Five series of cross-border bank-claim growth drawn as heat strips from 1999 to the latest quarter, and a country
 * table of the 14 borrowers (a year ago, last quarter, the latest), coloured against the two regime bands the bank-credit study fixed. Context only: the Evidence Book found the dollar link
 * underpowered and the Nasdaq link rests on the 2000-02 and 2008-09 busts. Pure parts: js/bisStripCore.js. Mounted by insightView.js (a pill on the Insight tab, preview surface panel.insight.bis).
 */
import { model, yearTicks, evidenceWords, csv } from '../bisStripCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { esc } from './boardViz.js';
import { saveBlob } from './exportView.js';

const COL = { fast: 'var(--gold)', slow: 'var(--pur2)' };
let uid = 0;

export function stripSvg(row, m, { w = 680, h = 64 } = {}) {
  const cw = w / m.n, id = `bis${++uid}`, gs = row.cells.map(c => c.g).filter(g => g !== null), hi = m.bands.high, lo = m.bands.low;
  const top = Math.max(hi + 2, ...gs), bot = Math.min(lo - 2, ...gs), y = g => (3 + (1 - (g - bot) / (top - bot)) * (h - 6)).toFixed(1);
  const bust = m.busts.map(b => `<rect x="${(b.a * cw).toFixed(1)}" y="0" width="${((b.b - b.a + 1) * cw).toFixed(1)}" height="${h}" fill="var(--tx3)" fill-opacity=".14"/>`).join('');
  const gap = row.cells.map((c, k) => (c.g === null ? `<rect x="${(k * cw).toFixed(1)}" y="0" width="${(cw + 0.35).toFixed(1)}" height="${h}" fill="url(#${id}-gap)"/>` : '')).join('');
  let d = '', pen = false;
  row.cells.forEach((c, k) => { if (c.g === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${((k + 0.5) * cw).toFixed(1)} ${y(c.g)}`; pen = true; });
  const li = row.cells.reduce((a, c, k) => (c.g === null ? a : k), -1), last = li < 0 ? '' : `<circle cx="${((li + 0.5) * cw).toFixed(1)}" cy="${y(row.cells[li].g)}" r="3.5" fill="var(--gold)" vector-effect="non-scaling-stroke"/>`;
  return `<svg class="bis-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" role="img" aria-label="${esc(row.text)}"><defs><pattern id="${id}-gap" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="var(--bg2)"/><line x1="0" y1="0" x2="0" y2="4" stroke="var(--tx3)" stroke-width="1"/></pattern></defs><rect width="${w}" height="${h}" fill="var(--bg2)" fill-opacity=".5"/>${bust}<rect x="0" y="0" width="${w}" height="${y(hi)}" fill="var(--gold)" fill-opacity=".10"/><rect x="0" y="${y(lo)}" width="${w}" height="${(h - y(lo)).toFixed(1)}" fill="var(--pur2)" fill-opacity=".14"/><line x1="0" x2="${w}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line2)" stroke-dasharray="4 4"/><line x1="0" x2="${w}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line2)" stroke-dasharray="4 4"/>${gap}<path d="${d}" fill="none" stroke="var(--tx)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${last}</svg>`;
}

const cell = c => `<td class="n bis-c" style="${c.g === null ? '' : c.band === 'normal' ? '' : `background: color-mix(in srgb, ${COL[c.band]} ${Math.round(c.strength * 55)}%, transparent)`}" title="${esc(c.label ?? '')}${c.band ? `: ${c.band}` : ''}">${c.g === null ? '–' : `${c.g >= 0 ? '+' : '−'}${Math.abs(c.g).toFixed(1)}%`}</td>`;

export function boardHtml(m, book = DESK_EVIDENCE, j = null) {
  if (!m.ok) return `<div class="in-empty">${esc(m.why)}.</div>`;
  const what = `<p class="bis-what"><b>What this is.</b> The Bank for International Settlements counts how much banks lend across borders. Each line below is how fast that lending is growing, compared with a year earlier. <b>Up in the gold zone</b> = credit is flowing freely (money is easy). <b>Down in the purple zone</b> = banks are pulling back (money is tightening). The gold dot is the latest quarter. It is background context for the day, not a buy or sell signal.</p>`;
  const ticks = yearTicks(m).map(t => `<span style="left:${((t.i / m.n) * 100).toFixed(1)}%">${esc(t.label)}</span>`).join('');
  const bustLabels = m.busts.map(b => `<span class="bis-bust" style="left:${(((b.a + b.b + 1) / 2 / m.n) * 100).toFixed(1)}%">${esc(b.label)}</span>`).join('');
  const rows = m.rows.map(r => `<div class="bis-row"><div class="bis-h"><b>${esc(r.label)}</b></div>${stripSvg(r, m)}<p class="bis-s">${esc(r.text)}</p></div>`).join('');
  const tbl = `<div class="oit-tblw"><table class="oit-tbl"><thead><tr><th>Borrower</th><th class="n">Claims ($bn)</th>${m.countries[0]?.pts.map(p => `<th class="n">${esc(p.label)}</th>`).join('') ?? ''}</tr></thead><tbody>${m.countries.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${Math.round(c.stockBn).toLocaleString('en-GB')}</td>${c.pts.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
  const ev = evidenceWords(j, book).map(e => `<span class="chip" title="Evidence Book: ${esc(e.id)}">${esc(e.what)}: ${esc(e.verdict)}</span>`).join('');
  return `<div class="card bis-card" data-surface="panel.insight.bis"><div class="ch"><span class="lbl">Bank credit, by quarter</span><span class="r"><button type="button" class="btn" data-bis-csv data-noexport title="Save the strips as a CSV file (made in this browser)">CSV</button></span></div>
${what}${m.line ? `<p class="bis-line"><b>${esc(m.line)}</b></p>` : ''}${rows}<div class="bis-axis" aria-hidden="true">${ticks}${bustLabels}</div>
<p class="bis-key muted">Line = year-on-year growth in that lending. <i class="bis-sw fast"></i> gold zone: fast (above ${m.bands.high}%). <i class="bis-sw slow"></i> purple zone: slow (below ${m.bands.low}%). Between the dashed lines is ordinary. Hatched = no data yet. Grey columns: ${m.busts.map(b => b.label).join(' and ')}, the two bust periods the Nasdaq link rests on.</p>
<h3 class="in-h">The borrowers</h3><p class="bis-cap muted">BIS country history is not stored here: three points per borrower, a year ago, last quarter and the latest.</p>${tbl}
<div class="gw-meta">${ev}</div><p class="bis-depth muted">${esc(m.depth)}</p><p class="tt-note">Credit growth against the study's own bands, not a signal. The dollar link is underpowered and the Nasdaq link rests on the 2000-02 and 2008-09 busts, so none of this says where a market goes next.</p></div>`;
}

export function mountBis(host, ctx) {
  let alive = true;
  host.innerHTML = '<div class="in-empty">Reading the BIS bank-credit record…</div>';
  ctx.fetchJson('/api/bank-credit').then(j => {
    if (!alive) return; const m = model(j); host.innerHTML = boardHtml(m, DESK_EVIDENCE, j);
    host.querySelector('[data-bis-csv]')?.addEventListener('click', () => saveBlob(new Blob([csv(m)], { type: 'text/csv;charset=utf-8' }), 'bis-bank-credit.csv', document, window));
  }).catch(e => { if (alive) host.innerHTML = `<div class="in-empty">Could not load the bank-credit record (${esc(e?.message ?? e)}).</div>`; });
  return { destroy() { alive = false; } };
}
