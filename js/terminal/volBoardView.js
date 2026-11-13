/**
 * Desk Terminal, Macro tab: "The fear complex" (HTML). Numbers from js/volBoardCore.js (/api/vol-board); drawings from boardViz.js. Tokens only.
 *
 * Reading rules kept visible: a stressed curve means a WIDER week (vix-inversion, vol-curve-front: range, not direction); fear that has run ahead of
 * the index has tended to give back about 7% of VIX over a month (vvix-ratio-range: a vol read, not an index call); skew-fade is NULL. Dear vol is
 * not a sell signal and cheap vol is not a buy: the board shows where each reading sits in its own history.
 */
import { describeVol } from '../volBoardCore.js';
import { radar, arcGauge, glowLine, stateStrip, esc, fin } from './boardViz.js';
import { chipFor } from './corrEvidence.js';
import { ownerLink, ownerOnly } from './links.js';
import { zBar } from './creditLiquidityView.js';

const sg = (v, d = 1) => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(+v).toFixed(d)}`);

function radarCard(vb) {
  const axes = vb.gauges.filter(g => g.pct5y != null).map(g => ({ label: g.label, pct: g.pct5y }));
  const rows = vb.gauges.map(g => `<tr title="${esc(g.what)}"><td><b>${esc(g.label)}</b></td><td class="n mono">${g.last}</td><td class="n mono ${g.pct5y >= 90 ? 'gold' : ''}">${g.pct5y ?? '–'}</td><td class="n mono">${sg(g.chg20Pct, 0)}%</td></tr>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Where each reading sits in its own history</span><span class="r muted">radius = five-year percentile</span></div>
<div class="bv-two" style="grid-template-columns:minmax(240px,320px) minmax(0,1fr);align-items:start"><div>${radar({ axes })}</div>
<div class="scroll"><table><thead><tr><th>Reading</th><th class="n">Now</th><th class="n" title="percentile of five years">Pct</th><th class="n">20d</th></tr></thead><tbody>${rows}</tbody></table></div></div>
<p class="muted bv-note">The dashed ring is the middle of each reading's own five-year range (the 50th percentile); a gold vertex is past the 90th. Dear is not a sell and cheap is not a buy: this says how much protection costs against its own past, nothing about what happens next.</p></div>`;
}

function termCard(vb) {
  const t = vb.term; if (!t) return '';
  const gauge = arcGauge({ value: Math.max(0.7, Math.min(1.3, t.ratio)), min: 0.7, max: 1.3, label: 'VIX over VIX3M', sub: `as of ${t.asOf}`, w: 260,
    zones: [{ from: 0.7, to: 0.9, tone: 'up' }, { from: 0.9, to: 1, tone: 'flat' }, { from: 1, to: 1.3, tone: 'dn' }], ticks: [{ v: 0.8, label: '0.8' }, { v: 1, label: '1.0' }, { v: 1.2, label: '1.2' }] });
  const vix = vb.gauges.find(g => g.id === 'VIX');
  return `<div class="card"><div class="ch"><span class="lbl">The VIX curve</span><span class="r"><span class="chip ${t.inverted ? 'dn' : 'up'}">${t.inverted ? 'inverted' : 'not inverted'}</span></span></div>
<div class="bv-two"><div>${gauge}</div><div>${glowLine(t.spark, { w: 300, h: 70, tone: 'var(--gold)', label: 'VIX over VIX3M over one year' })}<div class="bv-cap">VIX over VIX3M · one year${vix ? '' : ''}</div>${vix ? glowLine(vix.spark, { w: 300, h: 56, tone: 'var(--pur2)', label: 'VIX over one year' }) : ''}<div class="bv-cap">VIX · one year</div></div></div>
<p class="muted bv-note">Above 1.0 the front is dearer than the three-month: near-term fear above medium-term. After a first day of inversion the next week has run wider (range, not direction). A rising ratio below 1 is the curve flattening toward that line.</p></div>`;
}

function tilesCard(vb) {
  const tiles = vb.gauges.map(g => `<div class="bv-tile"><div class="bv-th"><b>${esc(g.label)}</b><span class="mono ${g.pct5y >= 90 ? 'gold' : ''}">${g.last}</span></div>${glowLine(g.spark, { w: 220, h: 46, tone: g.pct5y >= 90 ? 'var(--gold)' : 'var(--pur2)', label: `${g.label} over one year` })}<div class="muted bv-tn">${g.pct5y ?? '–'}th of 5y · ${fin(g.high?.value) ? `high ${Math.round(g.high.value * 10) / 10} (${esc(String(g.high.date ?? '').slice(0, 4))})` : ''}</div></div>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">The year in each reading</span><span class="r muted">closes, about every third day</span></div><div class="bv-tiles">${tiles}</div></div>`;
}

function realisedCard(vb) {
  const r = vb.realised; if (!r?.n) return '';
  const cells = stateStrip(r.rows.map(x => ({ tone: x.pct >= 90 ? 'gold' : x.pct >= 60 ? 'pur' : x.pct <= 10 ? 'flat' : null, title: `${x.sym}: realised vol at the ${x.pct}th percentile of its own history (${x.ann}% a year)` })), { cell: 10, gap: 2 });
  const top = r.rows.slice(0, 6).map(x => `${esc(x.sym)} ${x.pct}`).join(' · '), bot = r.rows.slice(-6).reverse().map(x => `${esc(x.sym)} ${x.pct}`).join(' · ');
  return `<div class="card"><div class="ch"><span class="lbl">Realised volatility, ${r.n} markets, against their own history</span><span class="r muted">hottest left</span></div>${cells}
<div class="bv-legend"><span><i class="bv-dot" style="background:var(--gold)"></i>above the 90th</span><span><i class="bv-dot" style="background:var(--pur2)"></i>60th to 90th</span><span><i class="bv-dot" style="background:var(--line2)"></i>below the 10th</span></div>
<p class="muted bv-note"><b>Hottest:</b> ${top}.<br><b>Quietest:</b> ${bot}. Hover a cell for the market. A hot market's day lines run wide, a quiet one's narrow; it is size, not direction.</p></div>`;
}

function skewCard(vb) {
  const s = vb.skew; if (!s?.rows?.length) return '';
  const stale = fin(s.ageH) && s.ageH > 48;
  const rows = s.rows.map(r => zBar(r.pair, r.rr, { max: 4, hot: 'up', cool: 'dn', title: r.lean ?? '' })).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Options skew · 25-delta risk reversal, 1 month</span><span class="r muted">${fin(s.ageH) ? `${Math.round(s.ageH)}h old` : ''}${stale ? ' <span class="chip gold">laptop pull is old</span>' : ''}</span></div>${rows}
<p class="muted bv-note">Positive = calls on the pair cost more than puts (protection against a rise dearer); negative = puts dearer. From the laptop's IBKR futures-options pull: when the laptop is off this is the last copy, and the age is shown. Skew has not been shown to call the next move (skew-fade is null).</p></div>`;
}

/** The whole board. vb = /api/vol-board. */
export function boardHtml(vb) {
  const head = `<div class="sec"><h2>The fear complex</h2><span class="lbl">implied vol, tail pricing and the VIX curve against their own history, realised vol by market and FX skew · size, never direction</span></div>`;
  if (!vb?.ok) return `<div class="sfc" data-surface="panel.macro.vol">${head}<div class="card"><p class="muted">${esc(vb?.error ?? 'not loaded yet')}.</p></div></div>`;
  const say = describeVol(vb);
  const ev = [
    chipFor('vix-inversion', 'VIX above VIX3M and the next week: wider, not directional.'),
    chipFor('vol-curve-front', 'The front of the S&P vol curve and whether the production range lines are too tight or too wide: range passes, trades fail.'),
    chipFor('vvix-ratio-range', 'Fear that has run ahead of the index and VIX over the next month: a vol read, not an index call.'),
    chipFor('iv-forecast', 'Implied vol against realised: the implied number carries information.'),
    chipFor('skew-fade', 'Fading a skew extreme: tested, null.'),
  ].filter(Boolean).join('');
  const stamp = `<div class="bv-stamp"><span class="lbl">Evidence Book</span>${ev}<span class="muted">Where vol has been tested it changed how wide the move runs; none of it has been shown to call direction, so dear or cheap vol is never turned into a lean.</span></div>`;
  const links = ownerOnly(` ${ownerLink('surface-lab.html', 'Surface Lab (3D vol surfaces)')} · ${ownerLink('vix-calculus.html', 'VIX calculus page')}.`);
  return `<div class="sfc" data-surface="panel.macro.vol">${head}
${say ? `<div class="card bv-say"><p>${esc(say)}</p></div>` : ''}
<div class="grid g2" style="margin-top:14px">${radarCard(vb)}${termCard(vb)}</div>
<div style="margin-top:14px">${tilesCard(vb)}</div>
<div class="grid g2" style="margin-top:14px">${realisedCard(vb)}${skewCard(vb)}</div>
<p class="muted bv-note" style="margin-top:8px">${links}</p>${stamp}</div>`;
}
