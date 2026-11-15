// js/terminal/ccyMacroStrip.js: "Macro picture" on the Currency modal, and a one-line factor bar on the Currency card.
// For each of the eight macro engines (labour, inflation, PPI, growth, PMI/ISM, retail, trade, confidence): the last print against what was expected (or the
// prior), a plain-words direction chip (stronger / weaker / in line, in economic-strength terms: a rise in unemployment reads weaker; never a market direction),
// the next release date, and a glowing 12-month ribbon of the prints. Under it, the stacked bar of the six scorecard factors, so the composite is auditable and
// a missing factor is visible. The numbers are the macro-engines board's own (/api/macro-engines-board, js/terminal/macroEnginesCore.js): nothing is refetched.
// Description only: macro-as-signal is a banked null; the strip says what printed, not what a currency will do. Tokens only (macro-strip.css).
import { FAMILIES } from './macroEnginesCore.js';
import { stackHtml, scorecardHtml } from './scorecardView.js';

const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = v => Number.isFinite(v);
const sg = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}` : '–');
const dayFmt = ms => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(new Date(ms));
const ageText = d => (!fin(d) ? '' : d < 1 ? 'today' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`);

/** The 12-month ribbon: the prints oldest to newest, an area under a glowing line, the last print marked. Needs two points; '' otherwise. */
export function ribbonSvg(history, w = 150, h = 34) {
  const v = (history ?? []).map(x => x?.v).filter(fin);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((a, i) => [(i / (v.length - 1)) * (w - 8) + 4, h - 5 - ((a - lo) / span) * (h - 10)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts.at(-1);
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const area = `${d} L${lx.toFixed(1)},${h - 2} L${pts[0][0].toFixed(1)},${h - 2} Z`;
  return `<svg class="cms-ribbon" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${E(`last ${v.length} prints, ${v[0]} to ${v.at(-1)}`)}" style="--len:${Math.ceil(len) + 4}"><line class="base" x1="4" x2="${w - 4}" y1="${h - 2}" y2="${h - 2}"/><path class="area" d="${area}"/><path class="line" d="${d}"/><circle class="dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6"/></svg>`;
}

/** One family's row cells, in plain words. Returns the parts so the test can read them. */
export function rowParts(ccy, fam, c) {
  const none = { fam, print: '', sub: '', dirWord: 'No read', dirCls: 'flat', arrow: '', basis: '', next: '', ribbon: '' };
  if (!c || c.status === 'none') return { ...none, sub: c?.engine?.discontinued ? `series ended ${c.engine.discontinued.since ?? ''}` : 'no feed for this currency' };
  const next = c.next ? `${c.next.event} · ${dayFmt(c.next.ms)}` : '';
  if (c.status === 'engine') {
    const s = c.engine?.score;
    return { ...none, print: `engine ${sg(s)}`, sub: `latest level against its own history${c.engine?.asOf ? ` · ${c.engine.asOf}` : ''}`, dirWord: s > 0.05 ? 'Above its norm' : s < -0.05 ? 'Below its norm' : 'Near its norm', dirCls: s > 0.05 ? 'up' : s < -0.05 ? 'dn' : 'flat', arrow: s > 0.05 ? '▲' : s < -0.05 ? '▼' : '=', next };
  }
  const st = c.strength, basis = c.basis === 'consensus' ? 'vs expected' : c.basis === 'prior' ? 'vs prior' : 'no comparison';
  const word = st > 0 ? 'Stronger' : st < 0 ? 'Weaker' : st === 0 ? 'In line' : 'Printed';
  const sub = [c.estimate != null ? `expected ${c.estimate}` : '', c.prev != null ? `prior ${c.prev}` : '', ageText(c.ageDays)].filter(Boolean).join(' · ');
  return { fam, print: String(c.actual), sub, dirWord: word, dirCls: st > 0 ? 'up' : st < 0 ? 'dn' : 'flat', arrow: st > 0 ? '▲' : st < 0 ? '▼' : st === 0 ? '=' : '', basis, next, stale: !!c.stale, event: c.event, z: c.z, ribbon: ribbonSvg(c.history) };
}

/** The Currency modal's section. board = /api/macro-engines-board, sc = /api/macro-scorecard. Returns '' when neither has this currency. */
export function stripHtml(ccy, board, sc) {
  const cells = board?.cells?.[ccy];
  const row = (sc?.ranked ?? []).find(r => r.ccy === ccy);
  if (!cells && !row) return '';
  const rows = cells ? FAMILIES.map(f => {
    const p = rowParts(ccy, f, cells[f.key]);
    const click = cells[f.key]?.status && cells[f.key].status !== 'none' ? ` onclick="ttMacroOpen('${ccy}','${f.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ttMacroOpen('${ccy}','${f.key}')}" tabindex="0" role="button" title="${E(`${ccy} ${f.label}: open the read`)}"` : '';
    return `<div class="cms-row"${click}>
<div class="cms-fam"><b>${E(f.label)}</b><div class="cms-sub">${E(p.event ?? '')}</div></div>
<div><div class="cms-print">${E(p.print || '–')}${p.stale ? ' <span class="chip gold" title="older than this release\'s cadence">older</span>' : ''}</div><div class="cms-sub">${E(p.sub)}</div></div>
<div><span class="cms-dir ${p.dirCls}"><span aria-hidden="true">${p.arrow}</span>${E(p.dirWord)}</span><div class="cms-sub">${E(p.basis)}${fin(p.z) ? ` · z ${sg(p.z, 1)}` : ''}</div></div>
<div class="cms-sub">${p.next ? `next · ${E(p.next)}` : 'no release in the next 9 days'}</div>
<div>${p.ribbon || '<span class="cms-sub">no 12-month history</span>'}</div></div>`;
  }).join('') : '';
  const grid = rows ? `<div class="cms-grid"><div class="cms-hd">Indicator</div><div class="cms-hd">Last print</div><div class="cms-hd">Against</div><div class="cms-hd">Next</div><div class="cms-hd">Last 12 months</div>${rows}</div>` : '<div class="muted" style="font-size:12px">The macro engines board is not loaded yet.</div>';
  const stack = row ? stackHtml(row, sc) : '';
  return `<div class="sfc" data-surface="panel.ccy.macrostrip"><div class="sec" style="margin-top:14px"><h2>Macro picture</h2><span class="lbl">what printed against what was expected, the next release and the last year · click a row for the read</span></div>${grid}${stack}<p class="muted" style="font-size:11.5px;margin-top:8px">Stronger / weaker is in economic-strength terms (a rise in unemployment reads weaker). It describes the prints; it is not a forecast for the currency.</p></div>`;
}

/** One line for the Currency card: the factor bar and "n of 6". */
export function miniHtml(ccy, sc) {
  const row = (sc?.ranked ?? []).find(r => r.ccy === ccy);
  return row ? `<div class="sfc" data-surface="panel.ccy.macrostrip" title="the macro scorecard's six factors, as shares of the composite">${stackHtml(row, sc, { compact: true })}</div>` : '';
}

/** Clicking a row: close the modal, pick the cell on the Macro board and jump to it. */
export function open(ccy, famKey) {
  try { globalThis.ttMacroPick?.(ccy, famKey); } catch { /* the board may not be drawn yet */ }
  const m = globalThis.document?.getElementById?.('modal'); if (m) { m.hidden = true; m.innerHTML = ''; }
  globalThis.openMacroBoard?.('panel.macro.engines');
}

globalThis.ccyMacro = { stripHtml, miniHtml, rowParts, ribbonSvg, scorecardHtml };
globalThis.ttMacroOpen = open;
