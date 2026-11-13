/**
 * Desk Terminal, Macro tab: "The curve through time" (HTML). Numbers from js/curveBoardCore.js (/api/curve-board); drawings from boardViz.js.
 * Tokens only. A rising yield carries no colour (neither good nor bad); inverted weeks are red because that is the one state the market names.
 */
import { describeCurve } from '../curveBoardCore.js';
import { ridgeCurves, pctRails, glowLine, stateStrip, esc, fin } from './boardViz.js';
import { chipFor } from './corrEvidence.js';
import { ownerLink, ownerOnly } from './links.js';

const sg = (v, d = 0) => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(+v).toFixed(d)}`);

function ridgeCard(cb) {
  const svg = ridgeCurves({ curves: cb.curves, tenors: cb.tenors, w: 560, h: 350 });
  const n = cb.curves.length;
  return `<div class="card"><div class="ch"><span class="lbl">The curve through time</span><span class="r muted">${n - 1} month-ends back to ${esc(cb.curves[0]?.date ?? '')}, today in front</span></div>
${svg || '<p class="muted">Not enough history to draw the curve through time.</p>'}
<p class="muted bv-note">Each ridge is the Treasury curve (fed funds, 2y, 5y, 10y, 30y) on one month-end, the oldest at the back; today's is in front and glowing. Older curves are lifted up and back by their age so they stack like a mountain range: read the shape and the slope of each ridge, and take levels from the left axis against today's curve in front. It is a memory of the shape, not a path price will follow.</p></div>`;
}

function slopesCard(cb) {
  const rows = cb.slopes.filter(s => ['2s10s', '2s30s', '10s30s', '5s30s', '2s5s', 'ff2y'].includes(s.k)).map(s => ({ label: `${s.label}${s.inverted ? ' (inv.)' : ''}`, value: `${sg(s.bp)}bp`, pct: s.pct3y, pct2: s.pct5y }));
  const table = cb.slopes.map(s => `<tr><td><b>${esc(s.label)}</b></td><td class="n mono">${sg(s.bp)}bp</td><td class="n mono">${sg(s.chg1d)}</td><td class="n mono">${sg(s.chg5d)}</td><td class="n mono">${sg(s.chg20d)}</td><td class="n mono muted">${fin(s.lo3y) ? `${sg(s.lo3y)}…${sg(s.hi3y)}` : '–'}</td></tr>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Where each slope sits in its own history</span><span class="r muted">${esc(cb.asOf)}</span></div>
${pctRails(rows, { w: 520 })}
<div class="scroll" style="margin-top:8px"><table><thead><tr><th>Slope</th><th class="n">Now</th><th class="n">1D</th><th class="n">5D</th><th class="n">20D</th><th class="n">3y range</th></tr></thead><tbody>${table}</tbody></table></div>
<p class="muted bv-note">The marker is the 3-year percentile; the dashed tick is the 5-year one. Changes are basis points over 1, 7 and 28 calendar days (the chain's 1D, 5D and 20D). The fed funds–2y gap is the market's priced policy path in one number.</p></div>`;
}

function memoryCard(cb) {
  const m = cb.memory; if (!m?.weeks?.length) return '';
  const TONE = { inverted: 'dn', flat: 'gold', upward: 'up' };
  const strip = stateStrip(m.weeks.map((w, i) => ({ tone: TONE[w], title: `week ${i + 1} of ${m.weeks.length}: 2s10s ${w}` })), { cell: 4, gap: 1 });
  const lines = ['2s10s', '2s30s', '10s30s'].map(k => cb.slopes.find(s => s.k === k)).filter(Boolean)
    .map(s => `<div><div class="bv-cap">${esc(s.label)} · three years, weekly</div>${glowLine(s.weeks, { w: 300, h: 56, zeroLine: true, tone: s.k === '2s10s' ? 'var(--gold)' : 'var(--pur2)', label: `${s.label} over three years` })}</div>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">The curve's memory</span><span class="r muted">three years, one cell a week</span></div>
${strip}<div class="bv-legend"><span><i class="bv-dot" style="background:var(--dn)"></i>inverted ${m.tally[0].n}</span><span><i class="bv-dot" style="background:var(--gold)"></i>flat, under 50bp ${m.tally[1].n}</span><span><i class="bv-dot" style="background:var(--up)"></i>upward ${m.tally[2].n}</span></div>
<div class="bv-g3" style="margin-top:8px">${lines}</div></div>`;
}

const STATE_CLS = { coupled: 'gold', decoupled: '', divergent: 'pur' };
function couplingCard(cb) {
  const c = cb.coupling, e = cb.episodes; if (!c && !e) return '';
  const row = (l, x) => (x ? `<tr><td><b>${esc(l)}</b><br><span class="muted" style="font-size:11px">${esc(x.label ?? '')}</span></td><td class="n mono">${fin(x.coincident) ? sg(x.coincident, 2) : '–'}</td><td class="n mono">${fin(x.regimeCorr) ? sg(x.regimeCorr, 2) : '–'}</td><td><span class="chip ${STATE_CLS[x.state] ?? ''}">${esc(x.state ?? '–')}</span></td></tr>` : '');
  const t = e?.tally4;
  return `<div class="card"><div class="ch"><span class="lbl">Do yields and prices move together right now?</span><span class="r muted">${esc(c?.asOf ? String(c.asOf).slice(0, 10) : '')}</span></div>
${c ? `<div class="scroll"><table><thead><tr><th>${esc(c.fx)} against</th><th class="n">5-day corr</th><th class="n">60-bar corr</th><th>State</th></tr></thead><tbody>${row('10Y spread', c.ten)}${row('2Y yield', c.two)}</tbody></table></div>
<p class="muted bv-note">How closely the yield line has tracked the pair over the last week of 5-minute bars (z-scored), and over the last 60 bars. "Decoupled" means the yield is not moving price right now; "divergent" that price is running against it. It is a description of the last hour, not a prediction.</p>` : ''}
${e ? `<div class="bv-cap">The SOFR − Euribor spread turn log</div><div class="bv-stats"><div><span class="lbl">Spread</span><div class="mono bv-kv">${e.spread != null ? `${e.spread}bp` : '–'}</div></div><div><span class="lbl">20-bar link to Nasdaq</span><div class="mono bv-kv">${e.link20 != null ? sg(e.link20, 2) : '–'}</div></div><div><span class="lbl">Turns logged</span><div class="mono bv-kv">${e.n}</div></div><div><span class="lbl">4h later: reverted / followed</span><div class="mono bv-kv">${t.revert} / ${t.follow}</div></div></div>
<p class="muted bv-note">${e.stale ? 'The laptop feed is stale: ' : ''}SOFR Sep26 minus Euribor Mar27 in basis points, with every confirmed turn logged forward. The forward record is small (${e.n} turns): read the tally as a count, not an edge.</p>` : ''}</div>`;
}

/** The whole board. cb = /api/curve-board. */
export function boardHtml(cb) {
  const head = `<div class="sec"><h2>The curve through time</h2><span class="lbl">five slopes against their own history · the shape's memory · yield-to-price coupling · context, not a signal</span></div>`;
  if (!cb?.ok) return `<div class="sfc" data-surface="panel.macro.curve">${head}<div class="card"><p class="muted">${esc(cb?.error ?? 'not loaded yet')}. The Rates &amp; policy board above stands on its own.</p></div></div>`;
  const say = describeCurve(cb);
  const ev = [
    chipFor('curve-inversion', 'An inverted 2s10s and what stocks did next: ten episodes in fifty years, no separation from a matched control.'),
    chipFor('rate-curve-structure', 'The structure of the rate curve as a predictor: tested, null.'),
    chipFor('spread-episodes-eurusd', 'A confirmed turn in the US yield line and EURUSD following: tested daily, null.'),
    chipFor('spread-episodes-nq', 'A confirmed SOFR-Euribor spread turn and Nasdaq following: tested, null; the forward record continues.'),
  ].filter(Boolean).join('');
  const stamp = `<div class="bv-stamp"><span class="lbl">Evidence Book</span>${ev}<span class="muted">Context, not a signal: the shape of the curve and the coupling are described as they are; none of the tests found that either predicts what comes next.</span></div>`;
  const links = ownerOnly(` ${ownerLink('yield-curve.html', 'Yield curve page')} · ${ownerLink('yield-coupling.html', 'Yield coupling page')} · ${ownerLink('spread-episodes.html', 'Spread episodes page')}.`);
  return `<div class="sfc" data-surface="panel.macro.curve">${head}
${say ? `<div class="card bv-say"><p>${esc(say)}</p></div>` : ''}
<div class="grid g2" style="margin-top:14px">${ridgeCard(cb)}${slopesCard(cb)}</div>
<div class="grid g2" style="margin-top:14px">${memoryCard(cb)}${couplingCard(cb)}</div>
<p class="muted bv-note" style="margin-top:8px">${links}</p>${stamp}</div>`;
}
