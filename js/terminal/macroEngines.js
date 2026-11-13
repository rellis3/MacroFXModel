/**
 * Macro engines board, drawn: the Desk Terminal Macro tab's currency x indicator heatmap, under the Macro scorecard.
 * Data and shaping: js/terminal/macroEnginesCore.js (served by /api/macro-engines-board). Style: the same chips, heat
 * cells (green / red only for the sign of a surprise), mono numerals and drawer-under-the-table the other Macro boards use.
 * The colour is the size of the surprise against that release's own history, in economic-strength terms (unemployment,
 * claims and deficits inverted); it is never a market direction. Pure string builders, tested in macroEngines.test.mjs.
 */
import { FAMILIES, FAMILY_BY_KEY, CCYS } from './macroEnginesCore.js';
import { ownerLink, ownerOnly } from './links.js';

const escD = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = Number.isFinite;
const sg = (v, dp = 2) => (fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(dp)}` : '–');
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭' };
const when = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });

/** Heat: green for a stronger-than-expected print, red for weaker; alpha by |z| (capped), a faint tint when there is no z to size it. */
export function heat(c) {
  if (!c || c.strength == null || c.strength === 0) return 'transparent';
  const a = fin(c.z) ? Math.min(0.5, 0.08 + (Math.abs(c.z) / 3) * 0.42) : 0.1;
  return c.strength > 0 ? `rgba(var(--uprgb),${a.toFixed(2)})` : `rgba(var(--dnrgb),${a.toFixed(2)})`;
}
const ageText = d => (!fin(d) ? '' : d < 1 ? 'today' : d < 60 ? `${d}d` : `${Math.round(d / 30)}mo`);

let _p = null, _sel = null, _esc = escD;

/** The cell face: the print, an arrow for beat/miss against consensus (or the prior when no consensus), z, age. */
export function cellHtml(ccy, f, c, esc = escD) {
  const sel = _sel && _sel.ccy === ccy && _sel.fam === f.key ? ' me-sel' : '';
  const open = `onclick="ttMacroPick('${ccy}','${f.key}')"`;
  if (!c || c.status === 'none') return `<td class="mecell me-none" title="${esc(`${ccy} ${f.label}: no feed. No release of this family is in the surprise store and no engine scores it.`)}"><span class="muted">–</span></td>`;
  const arrow = c.strength > 0 ? '▲' : c.strength < 0 ? '▼' : c.strength === 0 ? '=' : '';
  if (c.status === 'engine') {
    return `<td class="mecell me-eng${sel}" ${open} title="${esc(`${ccy} ${f.label}: no release with a consensus in the store; the engine reads ${sg(c.engine.score)} (latest level against its own history).`)}"><span class="muted mono" style="font-size:11px">engine ${sg(c.engine.score)}</span></td>`;
  }
  const dim = c.stale ? ' me-stale' : '';
  const faceCls = c.basis === 'consensus' ? '' : ' muted';
  const bg = c.basis === 'consensus' ? heat(c) : 'transparent';
  const bits = [c.basis === 'consensus' && fin(c.z) ? `z ${sg(c.z, 1)}` : c.basis === 'prior' ? 'vs prior' : c.basis === 'consensus' ? '' : 'no consensus', ageText(c.ageDays)].filter(Boolean).join(' · ');
  const tip = `${ccy} ${f.label}: ${c.event} printed ${c.actual}${c.estimate != null ? ` against ${c.estimate} expected` : ''}${c.prev != null ? ` (prior ${c.prev})` : ''}, ${when(c.ms)}.${c.stale ? ' OLDER THAN ITS CADENCE: dimmed.' : ''}`;
  return `<td class="mecell${sel}${dim}" ${open} style="background:${bg}" title="${esc(tip)}"><div class="mono${faceCls}" style="font-weight:600">${esc(c.actual)}</div><div class="mono" style="font-size:11px;color:var(--tx2)">${arrow ? `<b>${arrow}</b> ` : ''}${esc(bits)}</div></td>`;
}

/** The sparkline of the last six prints' values (an inline svg; a plain line, last point marked). */
export function sparkSvg(prints, w = 150, h = 34) {
  const v = [...(prints ?? [])].reverse().map(p => p.value).filter(fin);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((a, i) => [(i / (v.length - 1)) * (w - 8) + 4, h - 5 - ((a - lo) / span) * (h - 10)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts.at(-1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--gold)" stroke-width="1.5"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="var(--gold)"/></svg>`;
}

/** The drawer under the table: last six prints, consensus, the engine's reading, the next release, the engine page. */
export function drawerHtml(p, ccy, famKey, esc = escD) {
  const f = FAMILY_BY_KEY[famKey], c = p?.cells?.[ccy]?.[famKey];
  if (!f || !c || c.status === 'none') return `<div class="muted" style="font-size:12px">${f ? `${esc(ccy)} ${esc(f.label)}: no feed.` : 'Pick a cell.'}</div>`;
  const e = c.engine;
  const engine = e ? `<div style="margin-top:8px"><span class="lbl">Engine reading</span> <span class="mono ${e.score > 0 ? 'up' : e.score < 0 ? 'dn' : ''}">${e.score == null ? '–' : sg(e.score)}</span> <span class="muted" style="font-size:12px">${e.discontinued ? `source discontinued (${esc(e.discontinued)})` : `the latest level against its own history, −1 to +1${e.asOf ? ` · as of ${esc(String(e.asOf).slice(0, 10))}` : ''}${fin(e.ageDays) ? ` · ${e.ageDays}d old` : ''}${e.stale ? ' · stale, left out of the composite' : ''}`}</span></div>` : '<div class="muted" style="margin-top:8px;font-size:12px">No engine scores this family for this currency.</div>';
  const rows = (c.prints ?? []).map(x => `<tr><td class="mono">${esc(day(x.ms))}</td><td class="n mono">${esc(x.actual)}</td><td class="n mono muted">${esc(x.estimate ?? '–')}</td><td class="n mono muted">${esc(x.prev ?? '–')}</td><td class="n mono ${x.z > 0 ? 'up' : x.z < 0 ? 'dn' : ''}">${fin(x.z) ? sg(x.z, 1) : '–'}</td></tr>`).join('');
  const also = (c.also ?? []).length ? `<div class="muted" style="font-size:12px;margin-top:6px">Also in this family: ${c.also.map(a => `${esc(a.event)} ${esc(a.actual)}${a.estimate != null ? ` vs ${esc(a.estimate)}` : ''} (${esc(day(a.ms))})`).join(' · ')}</div>` : '';
  const next = c.next ? `<span class="chip pur">next · ${esc(c.next.event)} · ${esc(when(c.next.ms))}</span>` : '<span class="muted" style="font-size:12px">no release of this family in the next 9 days</span>';
  return `<div class="ch" style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><b>${FLAG[ccy] ?? ''} ${esc(ccy)} · ${esc(f.label)}</b><span class="muted">${esc(c.event ?? '')}</span>${c.stale ? '<span class="chip gold">older than its cadence</span>' : ''}${next}</div>
<div class="grid g2" style="margin-top:8px"><div class="scroll">${rows ? `<table><thead><tr><th>Release</th><th class="n">Actual</th><th class="n">Expected</th><th class="n">Prior</th><th class="n">z</th></tr></thead><tbody>${rows}</tbody></table>` : ''}${also}</div>
<div>${sparkSvg(c.prints)}<div class="muted" style="font-size:11px">last ${(c.prints ?? []).length} prints, oldest to newest</div>${engine}${ownerOnly(`<div style="margin-top:8px">${ownerLink(f.page, `the ${esc(f.label.toLowerCase())} engine page`, { target: '_blank' })}</div>`)}</div></div>`;
}

/** The whole panel. p = /api/macro-engines-board. Selecting a cell redraws only the drawer. */
export function boardHtml(p, esc = escD, evidence = null) {
  if (!p?.ok) return p?.error ? `<div class="sec"><h2>Macro engines</h2></div><div class="card muted">${esc(p.error)}</div>` : '';
  _p = p; _esc = esc;
  if (!_sel) _sel = defaultPick(p);
  const head = `<tr><th></th>${FAMILIES.map(f => `<th title="${esc(`engine: ${f.dim}`)}">${esc(f.label)}</th>`).join('')}<th class="n" title="the composite on the Macro scorecard above">Composite</th></tr>`;
  const body = CCYS.map(ccy => {
    const cm = p.composite?.[ccy] ?? {};
    return `<tr><td class="n"><b>${FLAG[ccy] ?? ''} ${esc(ccy)}</b></td>${FAMILIES.map(f => cellHtml(ccy, f, p.cells?.[ccy]?.[f.key], esc)).join('')}<td class="n mono ${cm.composite > 0 ? 'up' : cm.composite < 0 ? 'dn' : ''}" title="${esc(cm.factorsTotal ? `${cm.factorsScored} of ${cm.factorsTotal} factors scored` : 'no composite')}">${fin(cm.composite) ? sg(cm.composite) : '–'}</td></tr>`;
  }).join('');
  const cov = CCYS.map(ccy => { const c = p.coverage?.[ccy]; return c ? `<b>${esc(ccy)}</b> ${c.surprise} with consensus${c.prior ? `, ${c.prior} vs prior` : ''}${c.engineOnly ? `, ${c.engineOnly} engine only` : ''}${c.none ? `, no feed: ${esc(c.missing.join(', '))}` : ''}` : ''; }).filter(Boolean).join(' · ');
  const tag = evidence?.tag ? `<span class="chip pur" title="${esc(evidence.result ?? '')}">${esc(evidence.tag)}; size, not direction</span>` : '';
  return `<div class="sec"><h2>Macro engines</h2><span class="lbl">each currency's latest headline release against consensus · colour = the size of the surprise against that release's own history, in economic-strength terms · ${esc(p.scoredReleases ?? 0)} scored releases</span></div>
<div class="card"><div class="ch"><span class="lbl">Currency × indicator</span><span class="r"><span class="chip">context, not a signal</span> ${tag}</span></div>
<div class="scroll"><table class="metab" style="min-width:860px"><thead>${head}</thead><tbody>${body}</tbody></table></div>
<div class="legend" style="margin-top:8px"><span><i style="background:rgba(var(--uprgb),.45)"></i>stronger than expected</span><span><i style="background:rgba(var(--dnrgb),.45)"></i>weaker than expected</span><span>▲ ▼ = beat or miss · z = surprises of this release's usual size · dimmed = older than the release's cadence · "vs prior" = no consensus published · "engine" = only the engine scores it · – = no feed</span></div>
<div id="me-drawer" class="card" style="margin-top:10px;background:var(--bg2)">${_sel ? drawerHtml(p, _sel.ccy, _sel.fam, esc) : '<span class="muted">Click a cell for the last six prints, the engine reading and the next release.</span>'}</div>
<p class="muted" style="font-size:12px;margin:8px 0 0">Coverage: ${cov}. Colour is the sign of the surprise (unemployment, claims and trade deficits are inverted, so green always means a stronger economy than expected); it says nothing about which way a market moves. Surprise size widens the release session's range; the desk has never found a direction in it.</p></div>
<style>.metab td.mecell{cursor:pointer;min-width:84px;vertical-align:top;border:1px solid var(--line)}.metab td.me-none{cursor:default;text-align:center;opacity:.55}.metab td.me-stale{opacity:.5}.metab td.me-sel{outline:2px solid var(--pur);outline-offset:-2px}.metab td.me-eng{background:var(--purbg)}.metab th{white-space:nowrap}</style>`;
}

/** The biggest recent surprise, so the drawer is open at rest. */
export function defaultPick(p) {
  let best = null;
  for (const ccy of CCYS) for (const f of FAMILIES) {
    const c = p?.cells?.[ccy]?.[f.key];
    if (!c || c.status !== 'surprise' || c.stale) continue;
    const score = (fin(c.z) ? Math.abs(c.z) : 0) - (c.ageDays ?? 0) / 30;
    if (!best || score > best.score) best = { ccy, fam: f.key, score };
  }
  return best ? { ccy: best.ccy, fam: best.fam } : null;
}

/** Click handler (registered on globalThis by terminalTabs.js): select a cell, redraw the drawer and the outline only. */
export function pick(ccy, fam, doc = globalThis.document) {
  _sel = { ccy, fam };
  if (!doc) return _sel;
  const d = doc.getElementById('me-drawer'); if (d && _p) d.innerHTML = drawerHtml(_p, ccy, fam, _esc);
  doc.querySelectorAll('.metab td.mecell.me-sel').forEach(el => el.classList.remove('me-sel'));
  doc.querySelectorAll('.metab td.mecell').forEach(el => { if (el.getAttribute('onclick') === `ttMacroPick('${ccy}','${fam}')`) el.classList.add('me-sel'); });
  return _sel;
}
