/**
 * Desk Terminal, Macro tab: "Releases and who is positioned" (HTML). Numbers from js/releasesBoardCore.js (/api/releases-board); drawings from
 * boardViz.js. Tokens only.
 *
 * Wording is fixed by the Evidence Book: say who is positioned and which side would have to act on a surprise against it; do not say which way
 * price goes. The one registered finding (price drifted a little against a crowded book on release days, 2018-2025) is stated with its size and
 * its status (a hypothesis awaiting held-out years), next to the null that a crowded book does not make the day wider.
 */
import { describeReleases, londonTime, ord, CROWD_HI, CROWD_LO } from '../releasesBoardCore.js';
import { pctRails, esc, fin } from './boardViz.js';
import { chipFor } from './corrEvidence.js';
import { ownerLink, ownerOnly } from './links.js';

const sg = (v, d = 0) => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(+v).toFixed(d)}`);
const FLAG = { US: 'US', EU: 'EU', DE: 'DE', GB: 'UK', JP: 'JP', AU: 'AU', NZ: 'NZ', CA: 'CA', CH: 'CH', CN: 'CN' };
const LAB = { 'in line': '', 'priced in': 'pur', underreaction: 'gold', overreaction: 'gold', opposite: 'dn' };

function positionCard(rb) {
  if (!rb.positions?.length) return '';
  const rows = rb.positions.map(p => ({ label: p.ccy, value: p.side ? `crowded ${p.side}` : 'mid-range', pct: p.pct }));
  return `<div class="card"><div class="ch"><span class="lbl">Who is positioned · leveraged funds, long the currency</span><span class="r muted">COT ${esc(String(rb.cotDate ?? '').slice(0, 10))}</span></div>
${pctRails(rows, { w: 560, marks: [CROWD_LO, 50, CROWD_HI], rightW: 150 })}
<p class="muted bv-note">Each marker is the currency's net position as a share of open interest, ranked against its own history (100 = the most long it has been). A currency counts as crowded past the ${CROWD_LO}th or ${CROWD_HI}th percentile with the position on that side; the tick marks are those two lines and the middle. "Long" always means long the currency (the yen, Canadian dollar and Swiss franc futures are quoted the other way round).</p></div>`;
}

function relRow(r) {
  const p = r.pos;
  const prints = r.prints.slice(0, 3).map(x => `${esc(x.event)}${x.actual != null ? ` <b class="mono">${esc(x.actual)}</b>` : ''} <span class="muted mono" style="font-size:11px">${x.estimate != null ? `est ${esc(x.estimate)}` : ''}${x.prev != null ? ` prev ${esc(x.prev)}` : ''}</span>`).join('<br>');
  const crowd = p?.crowded ? `<span class="chip gold" title="a crowded book: the side that has to act on a surprise against it">${esc(r.ccy)} crowded ${esc(p.side)} · ${ord(p.pct)}</span>` : p ? `<span class="chip" title="not crowded">${esc(r.ccy)} ${ord(p.pct)} pct</span>` : '<span class="muted" style="font-size:11px">no position feed</span>';
  const t = r.typical?.spike ? `<span class="mono">${r.typical.spike.toFixed(1)}×</span> <span class="muted" style="font-size:11px">a normal half-hour${r.typical.events ? `, ${r.typical.events} events` : ''}</span>` : '<span class="muted" style="font-size:11px">no book line</span>';
  return `<tr class="${r.done ? 'bv-done' : ''}"><td class="mono">${esc(londonTime(r.ms))}${r.done ? ' <span class="chip">out</span>' : ''}</td><td><b>${esc(FLAG[r.country] ?? r.country)}</b></td><td>${prints}</td><td>${crowd}</td><td>${t}</td></tr>`;
}
function releasesCard(rb) {
  const rows = rb.releases.map(relRow).join('');
  return `<div class="card"><div class="ch"><span class="lbl">High-impact releases · this week, with who is positioned and the usual size</span><span class="r muted">times London</span></div>
${rows ? `<div class="scroll"><table><thead><tr><th>When</th><th></th><th>Release</th><th>Positioning</th><th>Typical 30-minute move</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No high-impact release in the window. The calendar for next week fills in over the weekend.</p>'}
<p class="muted bv-note">"Typical 30-minute move" is the Event Book's median for that release, in multiples of an ordinary half-hour at the same clock (size is what the desk has shown is learnable). A crowded currency is the side that would have to act if the print surprises against it: this says who is exposed, not which way price will go. On 2018-2025 release days price drifted slightly against a crowded book (about 6% of a day's range, before costs); that is a hypothesis awaiting held-out years, and the day was not wider.</p></div>`;
}

function mk(m) {
  return `<span class="chip ${LAB[m.label30] ?? ''}" title="${esc(m.label)} 30 minutes after: ${sg(m.m30, 2)}${esc(m.unit)}${m.label240 ? `; 4 hours: ${sg(m.m240, 2)}${esc(m.unit)} (${esc(m.label240)})` : ''}">${esc(m.label)} ${sg(m.m30, 2)}${esc(m.unit)}${m.label30 ? ` · ${esc(m.label30)}` : ''}</span>`;
}
function recentCard(rb) {
  if (!rb.recent?.length) return '';
  const rows = rb.recent.map(x => `<tr><td class="mono" style="white-space:nowrap">${esc(londonTime(x.ms))}</td><td><b>${esc(FLAG[x.country] ?? x.country)}</b></td><td>${esc(x.event)}<br><span class="muted mono" style="font-size:11px">${x.actual != null ? `${esc(x.actual)} vs ${esc(x.estimate ?? '?')}` : ''}</span></td><td class="mono ${x.direction === 'above' ? 'gold' : x.direction === 'below' ? 'pur' : ''}" style="white-space:nowrap">${esc(x.direction ?? '–')}${x.z != null ? ` <span class="muted">z ${sg(x.z, 1)}</span>` : ''}</td><td><div class="bv-chips">${x.markets.map(mk).join('')}</div></td></tr>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">What the last releases did</span><span class="r muted">30 minutes after the print</span></div>
<div class="scroll"><table><thead><tr><th>When</th><th></th><th>Release</th><th>Against consensus</th><th>Markets, 30 min after</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted bv-note">Each reaction is judged only against earlier releases of its own kind for a surprise of that sign and size ("in line", "priced in", "overreaction", "underreaction", "opposite"); a label describes that one move, it is not a forecast.</p></div>`;
}

const SEG = ['in line', 'priced in', 'underreaction', 'overreaction', 'opposite'];
const SEGC = { 'in line': 'var(--line3)', 'priced in': 'var(--pur2)', underreaction: 'var(--gold2)', overreaction: 'var(--gold)', opposite: 'var(--dn)' };
function regimeCard(rb) {
  if (!rb.regimes?.length) return '';
  const rows = rb.regimes.map(r => {
    const L = r.m30.labels, tot = SEG.reduce((s, k) => s + (L[k] ?? 0), 0) || 1;
    return `<div class="bv-reg"><span class="bv-zl"><b>${esc(r.regime)}</b> <span class="muted">${r.n} releases</span></span><div class="bv-stack" title="${esc(SEG.map(k => `${k} ${L[k] ?? 0}`).join(' · '))}">${SEG.map(k => `<i style="width:${((L[k] ?? 0) / tot * 100).toFixed(1)}%;background:${SEGC[k]}"></i>`).join('')}</div><span class="mono muted bv-zv">${tot}</span></div>`;
  }).join('');
  return `<div class="card"><div class="ch"><span class="lbl">How releases ran, by volatility regime</span><span class="r muted">30 minutes after · ${rb.studyN ?? ''} study releases</span></div>${rows}
<div class="bv-legend">${SEG.map(k => `<span><i class="bv-dot" style="background:${SEGC[k]}"></i>${esc(k)}</span>`).join('')}</div>
<p class="muted bv-note">The VIX close before the release sets the regime (calm under 16, stressed from 24). Most reactions are "in line" with what a surprise of that size usually does. History with its count, not a forecast.</p></div>`;
}

function legsCard(rb) {
  const f = rb.frontEnds; if (!f?.rows?.length) return '';
  return `<div class="card"><div class="ch"><span class="lbl">Front-end rate legs · event-day context</span><span class="r muted">${esc(String(f.asOf ?? '').slice(0, 16).replace('T', ' '))}${f.stale ? ' <span class="chip gold">stale</span>' : ''}</span></div>
<div class="scroll"><table><thead><tr><th>Leg</th><th>Area</th><th class="n">1 day</th><th class="n">5 days</th></tr></thead><tbody>${f.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="muted">${esc(r.area)}</td><td class="n mono">${sg(r.d1, 1)}${esc(r.unit ?? '')}</td><td class="n mono">${sg(r.d5, 1)}${esc(r.unit ?? '')}</td></tr>`).join('')}</tbody></table></div>
<p class="muted bv-note">Where the short-end rate futures sit against one and five days ago: the rate backdrop going into the next data. Context for the releases, not a lean.</p></div>`;
}

/** The whole board. rb = /api/releases-board. */
export function boardHtml(rb) {
  const head = `<div class="sec"><h2>Releases and who is positioned</h2><span class="lbl">the week's high-impact data against the crowd in each currency, the usual size of the move and what the last releases did · context, not a signal</span></div>`;
  if (!rb?.ok) return `<div class="sfc" data-surface="panel.macro.releases">${head}<div class="card"><p class="muted">${esc(rb?.error ?? 'not loaded yet')}.</p></div></div>`;
  const say = describeReleases(rb);
  const ev = [
    chipFor('positioning-into-release-direction', 'Price drifted slightly against a crowded book on release days: passed as registered, awaiting held-out years.'),
    chipFor('positioning-into-release-range', 'A crowded book does not make a release day wider.'),
    chipFor('event-impact-map', 'The size of the 30-minute move per release.'),
    chipFor('surprise-size', 'A bigger surprise gives a bigger move.'),
  ].filter(Boolean).join('');
  const stamp = `<div class="bv-stamp"><span class="lbl">Evidence Book</span>${ev}<span class="muted">Size is validated and direction is not: the board shows who is exposed and how big the move usually is, never which way.</span></div>`;
  const links = ownerOnly(` ${ownerLink('event-response.html', 'Event Response page')} · ${ownerLink('release-reaction.html', 'Release Reaction page')} · ${ownerLink('cot-extremes.html', 'COT page')}.`);
  return `<div class="sfc" data-surface="panel.macro.releases">${head}
${say ? `<div class="card bv-say"><p>${esc(say)}</p></div>` : ''}
<div class="grid g2" style="margin-top:14px">${positionCard(rb)}${releasesCard(rb)}</div>
<div class="grid g2" style="margin-top:14px">${recentCard(rb)}<div class="grid" style="align-content:start;gap:14px">${regimeCard(rb)}${legsCard(rb)}</div></div>
<p class="muted bv-note" style="margin-top:8px">${links}</p>${stamp}</div>`;
}
