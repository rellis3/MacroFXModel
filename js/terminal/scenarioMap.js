/**
 * The scenario map (Desk Terminal, Analytics tab): rows = the standard scenarios and the historical replays of
 * js/scenarioEngine.js, columns = today's live cards, cell = that card's P&L in card-σ, last column = the book.
 *
 * The numbers are exactly what GET /api/scenarios returns (runScenario / replay, the same functions as the Factor risk
 * and scenarios panel); ?full=1 asks for every card in every row instead of the worst and best few. Without it a cell
 * the endpoint did not list is shown as "·" (not listed), never as zero. Hypothetical: today's sensitivities, not a
 * forecast; replays apply past realised moves to today's book.
 *
 * A row is flagged when one shock hits three or more cards of the same concentration group (the same side of one
 * currency leg, js/terminal/bookView.js concentration) the same way, and at least half of that group, i.e. where the
 * cards that look like one bet lose together. Pure. Tested in js/terminal/bookView.test.mjs.
 */
import { esc, liveCards, concentration } from './bookView.js';
import { groupOf } from '../deskPack.js';

const GORDER = ['fx_majors', 'fx_crosses', 'indices', 'metals', 'energy', 'ags', 'crypto'];

/** The matrix. scen: the /api/scenarios body. cards: today's book. groups: concentration(cards, risk) (optional). */
export function scenarioMatrix(scen, cards, { groups = null } = {}) {
  const live = liveCards(cards), cols = live.map(([n]) => n).sort((a, b) => GORDER.indexOf(groupOf(a)) - GORDER.indexOf(groupOf(b)) || a.localeCompare(b));
  const full = scen?.full === true, gs = groups ?? concentration(cards);
  const row = (kind, key, label, listed, missing, total, totalPct, extra = {}) => {
    const by = Object.fromEntries((listed ?? []).map(c => [c.name, c.pnl])), miss = new Set(missing ?? []);
    const cells = Object.fromEntries(cols.map(n => [n, n in by ? by[n] : miss.has(n) || !full ? null : 0]));
    const hits = [];
    for (const g of gs) for (const sgn of [-1, 1]) {
      const xs = g.cards.filter(n => Number.isFinite(cells[n]) && Math.sign(cells[n]) === sgn);
      if (xs.length >= 3 && xs.length * 2 >= g.cards.length) hits.push({ ccy: g.ccy, side: g.side, sign: sgn, cards: xs });
    }
    const vals = Object.values(cells).filter(Number.isFinite);
    return { kind, key, label, cells, total, totalPct, hits, losers: vals.filter(v => v < 0).length, winners: vals.filter(v => v > 0).length, listed: vals.length, ...extra };
  };
  const rows = [];
  for (const s of scen?.scenarios ?? []) {
    if (s.ok === false) { rows.push({ kind: 'scenario', key: s.key, label: s.label, ok: false, errors: s.errors ?? [], cells: {}, hits: [], total: null }); continue; }
    rows.push(row('scenario', s.key, s.label, [...(s.book?.worst ?? []), ...(s.book?.best ?? [])], s.book?.missing, s.book?.pnl ?? null, s.book?.pnlPct ?? null, { basis: s.basis ?? s.note ?? null }));
  }
  for (const r of scen?.replays ?? []) {
    if (r.covered === false) { rows.push({ kind: 'replay', key: r.key, label: r.label, from: r.from, to: r.to, ok: false, errors: ['before the price history'], cells: {}, hits: [], total: null }); continue; }
    rows.push(row('replay', r.key, r.label, r.worst, r.missing, r.pnl ?? null, r.pnlPct ?? null, { from: r.from, to: r.to }));
  }
  return { cols, rows, full };
}

/** The largest book loss over the rows (for the Overview strip). null when no row loses. */
export function worstRow(m) {
  const xs = (m?.rows ?? []).filter(r => Number.isFinite(r.total) && r.total < 0).sort((a, b) => a.total - b.total);
  return xs[0] ?? null;
}

const fmt = v => (v == null ? '·' : v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v) >= 10 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(2)}`);
/** A cell's background: red or green, stronger with |pnl| against the row's largest card. */
export function cellBg(v, rowMax) {
  if (!Number.isFinite(v) || !v || !(rowMax > 0)) return 'transparent';
  const a = Math.min(1, Math.abs(v) / rowMax);
  return v > 0 ? `rgba(47,211,154,${(0.08 + 0.5 * a).toFixed(2)})` : `rgba(255,93,120,${(0.08 + 0.5 * a).toFixed(2)})`;
}
const sideWord = h => `${h.side > 0 ? 'long' : 'short'} ${h.ccy}`;

/** The matrix as an HTML table (scrolls sideways inside its own box; the first column and the book column stay put). */
export function matrixHtml(m) {
  if (!m?.cols?.length) return '<p class="muted">No live card in today\'s book.</p>';
  const head = `<tr><th class="sm-first">Scenario</th>${m.cols.map(n => `<th class="sm-c" data-inst="${esc(n)}" tabindex="0" title="${esc(n)}: open the card">${esc(n)}</th>`).join('')}<th class="sm-book">Book</th></tr>`;
  const body = m.rows.map(r => {
    if (r.ok === false) return `<tr class="sm-off"><th class="sm-first">${esc(r.label)}${r.from ? `<small>${esc(r.from)} → ${esc(r.to)}</small>` : ''}</th><td colspan="${m.cols.length}" class="muted">${esc((r.errors ?? []).join('; ') || 'not available')}</td><td class="sm-book">–</td></tr>`;
    const vals = Object.values(r.cells).filter(Number.isFinite), mx = Math.max(0, ...vals.map(Math.abs));
    const loseHits = r.hits.filter(h => h.sign < 0), hl = loseHits.length > 0;
    const inHit = new Set(loseHits.flatMap(h => h.cards));
    const why = loseHits.map(h => `${h.cards.length} ${sideWord(h)} cards lose together (${h.cards.join(', ')})`).join('; ');
    return `<tr class="${hl ? 'sm-hit' : ''}"><th class="sm-first" ${why ? `title="${esc(why)}"` : ''}>${hl ? '<span class="sm-flag" aria-label="clustered loss">◆</span> ' : ''}${esc(r.label)}${r.kind === 'replay' ? `<small>replay ${esc(r.from)} → ${esc(r.to)}</small>` : ''}${hl ? `<small class="gold">${esc(loseHits.map(h => `${h.cards.length} ${sideWord(h)} lose`).join(' · '))}</small>` : ''}</th>${m.cols.map(n => { const v = r.cells[n];
      return `<td class="sm-v${inHit.has(n) ? ' sm-in' : ''}" style="background:${cellBg(v, mx)}" title="${esc(`${n} · ${r.label}: ${v == null ? 'not listed' : `${v} card-σ`}`)}">${fmt(v)}</td>`; }).join('')}<td class="sm-book ${r.total > 0 ? 'up' : r.total < 0 ? 'dn' : ''}">${fmt(r.total)}${r.totalPct != null ? `<small>${r.totalPct > 0 ? '+' : ''}${r.totalPct}%</small>` : ''}</td></tr>`;
  }).join('');
  const flagged = m.rows.filter(r => r.hits?.some(h => h.sign < 0));
  const notes = flagged.length ? `<ul class="sm-notes">${flagged.map(r => `<li><b>${esc(r.label)}</b>: ${esc(r.hits.filter(h => h.sign < 0).map(h => `${h.cards.length} ${sideWord(h)} cards lose together (${h.cards.join(', ')})`).join('; '))}</li>`).join('')}</ul>` : '';
  return `<div class="sm-wrap" role="region" aria-label="scenario map: scroll sideways for every card" tabindex="0"><table class="sm"><thead>${head}</thead><tbody>${body}</tbody></table></div>${notes}`;
}
