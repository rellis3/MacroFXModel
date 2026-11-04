/**
 * The lead-lag grid (/api/lead-lag, js/leadLag.js) drawn for the Desk Terminal: a heat grid and lists for the Assets
 * tab, a card for the Pair tab. Pure HTML-string builders, no fetch. Every view says it is description, not a signal.
 */
import { pairLine } from '../leadLag.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const sg = (v, dp = 3) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const cellBg = (r, m = 0.08) => (!fin(r) ? 'transparent' : r > 0 ? `rgba(47,211,154,${Math.min(0.9, Math.abs(r) / m * 0.9).toFixed(2)})` : `rgba(255,93,120,${Math.min(0.9, Math.abs(r) / m * 0.9).toFixed(2)})`);
const chip = x => (x.isLead ? '<span class="chip up">lead</span>' : x.survivedBH ? '<span class="chip gold">halves disagree</span>' : '<span class="chip">near miss</span>');

function row(x, labels) {
  return `<tr class="tt-click" data-pair="${esc(x.follow)}" title="${esc(pairLine(x, labels))}"><td class="mono"><b>${esc(x.lead)}</b> → <b>${esc(x.follow)}</b></td><td class="n mono">${x.k}d</td><td class="n mono ${x.r > 0 ? 'up' : 'dn'}">${sg(x.r)}</td><td class="n mono muted">${sg(x.sameDay, 2)}</td><td class="n mono muted">${sg(x.halves?.[0], 3)} / ${sg(x.halves?.[1], 3)}</td><td class="n mono">${x.p ?? '–'}</td><td>${chip(x)}</td></tr>`;
}
const HEAD = '<thead><tr><th>Leader → follower</th><th class="n">Lag</th><th class="n">r</th><th class="n" title="same-day correlation: moving together is not leading">Same day</th><th class="n">Halves</th><th class="n" title="best lag, Bonferroni over the five lags; the lead also has to survive BH 10% across every pair">p</th><th></th></tr></thead>';

/** The heat grid: rows lead, columns follow, cell = corr(row today, column tomorrow). */
export function heatGrid(d) {
  const ids = d?.ids ?? []; if (!ids.length) return '';
  const leads = new Set(d.leadKeys ?? []);
  const th = id => `<th class="mono" style="font-size:9px;padding:1px;writing-mode:vertical-rl;transform:rotate(180deg);height:46px">${esc(id)}</th>`;
  return `<div class="scroll"><table style="border-collapse:collapse;min-width:${ids.length * 14 + 70}px"><thead><tr><th style="font-size:9px;text-align:left">leads ↓ / follows →</th>${ids.map(th).join('')}</tr></thead><tbody>${ids.map(A => `<tr><td class="mono" style="font-size:9px;padding:0 4px;white-space:nowrap">${esc(A)}</td>${ids.map(B => {
    if (A === B) return '<td style="background:var(--bg3);width:12px;height:12px;padding:0"></td>';
    const r = d.matrix?.[A]?.[B], lead = leads.has(`${A}>${B}`);
    return `<td title="${esc(A)} today → ${esc(B)} tomorrow: r ${sg(r)}${lead ? ' (a lead)' : ''}" style="width:12px;height:12px;padding:0;background:${cellBg(r)};${lead ? 'outline:2px solid var(--gold);outline-offset:-2px' : ''}"></td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** The Assets-tab section. */
export function gridHtml(d) {
  if (!d) return '';
  const head = '<div class="sec"><h2>Who leads whom</h2><span class="lbl">lead-lag: does one market\'s move today show up in another 1-5 days later? · daily · description, not a signal</span></div>';
  if (!d.ok) return `${head}<div class="card muted">${esc(d.error ?? 'Not available yet.')}</div>`;
  const leads = d.leads ?? [], near = (d.near ?? []).slice(0, 12);
  return `${head}<div class="card"><p style="margin:0 0 8px"><b>${d.tested}</b> leader → follower pairs across ${d.ids.length} markets, lags 1-${d.lags} days, ${esc(d.from)} to ${esc(d.to)}: <b class="${leads.length ? 'gold' : ''}">${leads.length} lead${leads.length === 1 ? '' : 's'}</b> survive the correction and hold in both halves.</p>
${leads.length ? `<div class="scroll"><table style="min-width:560px">${HEAD}<tbody>${leads.map(x => row(x, d.labels)).join('')}</tbody></table></div>` : '<p class="muted" style="margin:4px 0">No market reliably leads another at the daily horizon: what you would expect in liquid markets that all price off the same news.</p>'}
<details style="margin-top:8px"><summary class="muted">The ${near.length} strongest that did not pass</summary><div class="scroll"><table style="min-width:560px">${HEAD}<tbody>${near.map(x => row(x, d.labels)).join('')}</tbody></table></div></details>
<details style="margin-top:8px"><summary class="muted">The full grid (one day ahead)</summary>${heatGrid(d)}<p class="muted" style="font-size:12px">Each cell: the correlation of the row market's move today with the column market's move tomorrow. Green = the follower tends to move the same way, red = the opposite way; a gold outline is a lead that passed. Most cells are near zero.</p></details>
<p class="muted" style="font-size:12px">How to read it. <b>r</b> is the correlation at the best lag; even a real lead of 0.05 explains a quarter of a percent of the follower's next move. <b>Same day</b> is how much the two move together on the day itself: pairs sharing a currency (EURUSD and GBPUSD) score high here, and that is not a lead. A market that trades thinly or closes late can look like it is led, because its stale price catches up the next day. ${esc(d.label)}${Object.keys(d.errors ?? {}).length ? ` Not loaded: ${Object.keys(d.errors).map(esc).join(', ')}.` : ''}</p></div>`;
}

/** The Pair-tab card: who leads this market, and what it leads. */
export function pairCard(d, inst) {
  const id = String(inst ?? '').toUpperCase(), m = d?.byMarket?.[id], hd = '<div class="ch"><span class="lbl">Who leads this market · lead-lag</span></div>';
  if (!d) return '';
  if (!d.ok || !m) return `${hd}<div class="muted">${esc(d?.ok ? 'This market is not on the lead-lag grid.' : d?.error ?? 'Not available yet.')}</div>`;
  const li = x => `<div class="tt-row">${chip(x)}<span style="flex:1;min-width:0;font-size:13px">${esc(pairLine(x, d.labels))}</span></div>`;
  return `${hd}<div class="lbl" style="margin-top:4px">Markets that move before ${esc(id)}</div>${m.ledBy.slice(0, 3).map(li).join('') || '<div class="muted">–</div>'}
<div class="lbl" style="margin-top:8px">Markets ${esc(id)} moves before</div>${m.leads.slice(0, 3).map(li).join('') || '<div class="muted">–</div>'}
<p class="tt-note">The three strongest each way out of ${d.tested} pairs tested. Description, not a signal: a lead found here is a question for the quick test and the research protocol.</p>`;
}
