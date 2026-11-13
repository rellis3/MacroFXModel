/**
 * The central-bank statement board for the Desk Terminal's Macro tab (/api/cb-board, js/terminal/cbBoardCore.js).
 * Pure HTML-string builder, no fetch, in the terminal's own classes (.sec .card .ch .score .bar .chip .muted .grid).
 *
 * One tile per bank, nine with the Beige Book: tone of the last statement and its change against the meeting before,
 * the vote, the dimension bars, what changed, the next meeting and a link to the full read. Under the tiles, the banks
 * ranked hawkish to dovish with the tone change and, where the terminal already loads it, what the short-rate futures
 * price. Colour follows the page's rule: gold = hawkish, purple = dovish (green/red stay for direction elsewhere).
 *
 * DESCRIPTION ONLY. The statement's tone is priced inside 30 minutes and does not predict the next-day dollar
 * (Evidence Book entry cb-tone-direction, NULL, N=82 meetings), so nothing here is a lean.
 */
import { ownerLink } from './links.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && v !== '' && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-28' → '28 Oct' (the date as written, never through a timezone). */
export const dshort = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? '')); return m ? `${+m[3]} ${MON[+m[2] - 1] ?? ''}` : '–'; };

const REGIME = r => (/HAWK/i.test(r ?? '') ? 'gold' : /DOV/i.test(r ?? '') ? 'pur' : '');
const regimeWord = r => String(r ?? '').toLowerCase();

/** Tone on its own scale: -1 dovish to +1 hawkish, a diverging bar from the centre line (gold right, purple left). */
export function toneBar(score) {
  if (!fin(score)) return '';
  const w = Math.min(100, Math.abs(+score) * 50), hawk = +score >= 0;
  return `<div class="bar dv" role="img" aria-label="tone ${esc(sg(score))} on a scale from -1 dovish to +1 hawkish"><i style="position:absolute;top:0;${hawk ? 'left:50%' : 'right:50%'};width:${w.toFixed(1)}%;background:${hawk ? 'var(--gold)' : 'var(--pur)'}"></i></div>`;
}

/** The tone over the last meetings as a small line. */
export function spark(hist, w = 96, h = 24) {
  const v = (hist ?? []).map(x => +x.score).filter(Number.isFinite);
  if (v.length < 2) return '';
  const lo = Math.min(...v, -0.0001), hi = Math.max(...v, 0.0001), sp = hi - lo || 1;
  const X = i => ((i / (v.length - 1)) * w).toFixed(1), Y = a => (h - 2 - ((a - lo) / sp) * (h - 4)).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="tone at the last ${v.length} meetings"><line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line2)" stroke-width="1" stroke-dasharray="2 3"/><path d="${v.map((a, i) => `${i ? 'L' : 'M'}${X(i)},${Y(a)}`).join('')}" fill="none" stroke="var(--gold)" stroke-width="1.5"/><circle cx="${X(v.length - 1)}" cy="${Y(v.at(-1))}" r="2.4" fill="var(--gold)"/></svg>`;
}

/** The change against the previous read: an arrow and the points, or 'unchanged'. */
export function changeHtml(change) {
  if (!change || !fin(change.delta)) return '';
  const d = +change.delta, from = dshort(change.from);
  if (Math.abs(d) < 0.05) return `<span class="muted">unchanged vs ${esc(from)} (${esc(sg(change.fromScore))})</span>`;
  return `<span class="${d > 0 ? 'gold' : 'pur'}" style="color:var(${d > 0 ? '--gold' : '--pur2'})" title="tone ${esc(sg(change.fromScore))} at ${esc(from)}, ${esc(sg(change.fromScore + d))} now">${d > 0 ? '▲' : '▼'} ${esc(sg(d))} <span class="muted">vs ${esc(from)}</span></span>`;
}

/** The small bars: how much each statement dwells on a theme (0 none .. 1 dominant). Magnitude, not direction. */
export function dimsHtml(dims) {
  if (!dims?.length) return '';
  return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:3px 8px;align-items:center;margin-top:10px">${dims.map(x => `<span class="muted" style="font-size:11.5px">${esc(x.label)}</span><div class="bar"><i style="width:${Math.min(100, Math.max(0, x.v * 100)).toFixed(0)}%;background:var(--pur2)"></i></div><span class="mono muted" style="font-size:11px">${esc(x.v.toFixed(2))}</span>`).join('')}</div>`;
}

const nextLine = n => (n ? `Next ${n.days === 0 ? 'today' : `${esc(dshort(n.date))} (${n.days === 1 ? 'tomorrow' : `in ${n.days} days`})`}` : 'Next meeting not on the calendar');
const rateLine = r => (r && fin(r.rate) ? `policy rate <b class="mono">${(+r.rate).toFixed(2)}%</b>${r.asOf ? ` <span class="muted">(${esc(r.asOf)})</span>` : ''}` : '');
const link = b => ownerLink(b.page, `Read the ${esc(b.doc)}`, { target: '_blank', suffix: ' →', hide: true });   // the sentiment pages are owner-only: a viewer gets no link

/** One tile. */
export function tileHtml(b) {
  const head = (chips = '') => `<div class="ch"><h3>${esc(b.bank)}</h3><span class="muted">${esc(b.ccy)}${b.id === 'beige' ? ' · twelve districts' : ''}</span><span class="r">${chips}</span></div>`;
  const foot = `<div class="muted" style="margin-top:10px;font-size:12px;display:flex;gap:6px 14px;flex-wrap:wrap;justify-content:space-between"><span>${nextLine(b.next)}${rateLine(b.rate) ? ` · ${rateLine(b.rate)}` : ''}</span>${link(b)}</div>`;
  if (b.status === 'headline_only') {
    const d = b.decision ?? {};
    return `<div class="card" data-cb="${esc(b.id)}">${head(`<span class="chip">headline only</span>`)}
<p style="margin:0 0 6px"><b>${esc(d.title ?? 'Decision')}</b> <span class="muted">${esc(dshort(d.date))} · from the bank's news feed</span></p>
<p class="muted" style="margin:0">${b.blocked ? `The statement and the record of the meeting are blocked by the ${esc(b.bank)}'s firewall (403), so there is no tone score for this meeting. Nothing is estimated in its place.` : 'The statement and record of the meeting have not been captured, so there is no tone score for this meeting.'}</p>${foot}</div>`;
  }
  if (b.status === 'no_read' || !b.read) {
    const old = b.read ? `<p class="muted" style="margin:6px 0 0">Last read: ${esc(dshort(b.read.date))}, tone <b class="mono">${esc(sg(b.read.score))}</b> ${b.read.regime ? `(${esc(regimeWord(b.read.regime))})` : ''} · <b>older than the latest meeting</b>, not ranked.</p>` : '';
    return `<div class="card" data-cb="${esc(b.id)}">${head(`<span class="chip">no read</span>`)}
<p style="margin:0">${b.unreadMeeting ? `No read yet for the ${esc(dshort(b.unreadMeeting))} ${b.id === 'beige' ? 'release' : 'meeting'}.` : 'No statement has been read yet.'}</p>${old}${foot}</div>`;
  }
  const r = b.read;
  const stale = r.ageDays != null && r.ageDays > 120;
  return `<div class="card" data-cb="${esc(b.id)}">${head(`${r.regime ? `<span class="chip ${REGIME(r.regime)}">${esc(regimeWord(r.regime))}</span>` : ''}<span class="chip" title="the meeting this read is from">${esc(dshort(r.date))}</span>${stale ? '<span class="chip gold" title="over four months old">old</span>' : ''}`)}
<div class="score"><b>${esc(sg(r.score))}</b><small>tone, ${b.id === 'beige' ? 'Beige Book' : 'last statement'} · ${changeHtml(b.change) || 'no earlier read to compare'}</small></div>
<div style="display:flex;gap:12px;align-items:center;margin:6px 0 2px"><div style="flex:1;min-width:0">${toneBar(r.score)}</div>${spark(b.history)}</div>
${r.headline ? `<p style="margin:8px 0 0;font-size:13px">${esc(r.headline)}</p>` : ''}
${r.vote ? `<p style="margin:6px 0 0"><span class="lbl">vote</span> <b class="mono">${esc(r.vote)}</b>${r.voteNote ? ` <span class="muted">· ${esc(r.voteNote)}</span>` : ''}</p>` : (b.id === 'beige' ? '' : `<p class="muted" style="margin:6px 0 0;font-size:12px">No vote published for this bank.</p>`)}
${dimsHtml(r.dims)}
${r.whatChanged ? `<p class="muted" style="margin:10px 0 0;font-size:12px"><b>What changed:</b> ${esc(r.whatChanged)}</p>` : ''}${foot}</div>`;
}

/** What the futures price over about six months, per bank, as the strip's last column (cbx = /api/cb-expectations .banks). */
const pricedOf = (cbx, ccy) => { const h = cbx?.[ccy]?.m6; return h && fin(h.bp) ? +h.bp : null; };

/** The ranking strip: hawkish to dovish, tone change, priced path. */
export function rankHtml(d, cbx) {
  const rk = d?.ranking ?? [];
  if (!rk.length) return '';
  return `<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Hawkish to dovish</span><span class="r muted">banks with a read for their latest meeting · tone -1 dovish to +1 hawkish</span></div>
<div class="scroll"><table><thead><tr><th>Bank</th><th class="n">Tone</th><th class="n">Change</th><th>Latest statement</th>${cbx ? '<th class="n">Priced, ~6 months</th>' : ''}</tr></thead><tbody>${rk.map(x => { const p = pricedOf(cbx, x.ccy);
    return `<tr><td><b>${esc(x.bank)}</b> <span class="muted">${esc(x.ccy)}</span></td><td class="n"><span class="${REGIME(x.regime)}" style="color:var(${/DOV/i.test(x.regime ?? '') ? '--pur2' : /HAWK/i.test(x.regime ?? '') ? '--gold' : '--tx2'})">${esc(sg(x.score))}</span></td><td class="n">${fin(x.delta) ? `<span style="color:var(${x.delta > 0.049 ? '--gold' : x.delta < -0.049 ? '--pur2' : '--tx3'})">${Math.abs(x.delta) < 0.05 ? '·' : x.delta > 0 ? '▲' : '▼'} ${esc(sg(x.delta))}</span>` : '<span class="muted">–</span>'}</td><td class="muted">${esc(dshort(x.date))}</td>${cbx ? `<td class="n ${p == null ? 'muted' : p > 0 ? 'up' : p < 0 ? 'dn' : ''}">${p == null ? '–' : `${p > 0 ? '+' : ''}${Math.round(p)}bp`}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
<p class="muted" style="font-size:12px">Tone and the futures-priced path are different questions: one is how hawkish the last statement read, the other is what the market expects the bank to do next. ${cbx ? 'Green = hikes priced, red = cuts.' : ''}</p></div>`;
}

/** The whole board: a section header with the evidence stamp, the nine tiles, the ranking, the footnote. */
export function boardHtml(d, { cbx = null } = {}) {
  const head = `<div class="sec"><h2>Central-bank statements</h2><span class="lbl">what each bank's latest statement said, how its tone moved, how the committee voted · <span class="chip gold" title="Tested, N=82 FOMC meetings: the statement's tone and the first 30-minute reaction do not predict the next-day dollar. It is priced inside half an hour.">description only · tone is priced in 30 min</span></span></div>`;
  if (d == null) return `${head}<div class="card muted">Reading the statements…</div>`;
  if (!d?.ok) return `${head}<div class="card muted">${esc(d?.error ?? 'Not available.')}</div>`;
  const banks = d.banks ?? [];
  const c = d.counts ?? {};
  const miss = banks.filter(b => b.status !== 'read').map(b => b.bank);
  return `${head}<div class="grid g3">${banks.map(tileHtml).join('')}</div>${rankHtml(d, cbx)}
<p class="muted" style="font-size:12px">${esc(String(c.read ?? 0))} of ${esc(String(c.total ?? banks.length))} have a read for their latest meeting${miss.length ? ` (no current read: ${miss.map(esc).join(', ')})` : ''}. Scores come from an AI read of each statement against the previous meeting's wording; they describe tone and are not a forecast (${ownerLink('evidence.html#ev-cb-tone-direction', 'tested here: no next-day lean', { target: '_blank' })}). Read as of ${esc(String(d.asOf ?? '').slice(0, 16).replace('T', ' '))} UTC.</p>`;
}
