/**
 * Desk Terminal, Macro tab: "Where the market is" (HTML), the regime stack. Numbers from js/regimeBoardCore.js (/api/regime-board); drawings from
 * boardViz.js and the quadrant below. Tokens only.
 *
 * Words kept on the board on purpose (Evidence Book): the quiet state is quiet, not directionless; the active state says moves have been big, not
 * which way; the theory's expected asset reactions are NOT shown (tested only as a descriptor), and the correlation regime is a sizing fact.
 */
import { describeRegime } from '../regimeBoardCore.js';
import { arcGauge, stateStrip, esc, fin, uid } from './boardViz.js';
import { chipFor } from './corrEvidence.js';
import { ownerLink, ownerOnly } from './links.js';

const sg = (v, d = 2) => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(+v).toFixed(d)}`);

/** The growth x inflation quadrant: four cells, the live one glowing and ringed. */
export function quadrantSvg(q) {
  if (!q?.cell) return '';
  const CELLS = [['goldilocks', 'Goldilocks', 'growth ↑  inflation ↓', 0, 0], ['reflation', 'Reflation', 'growth ↑  inflation ↑', 1, 0], ['deflation', 'Slowdown', 'growth ↓  inflation ↓', 0, 1], ['stagflation', 'Stagflation', 'growth ↓  inflation ↑', 1, 1]];
  const W = 250, H = 190, L = 22, T = 8, cw = (W - L - 6) / 2, ch = (H - T - 22) / 2, id = uid('bvq');
  const cell = ([k, name, sub, cx, cy]) => {
    const on = k === q.cell, x = L + cx * (cw + 4), y = T + cy * (ch + 4);
    return `<g><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="9" fill="${on ? 'var(--pur)' : 'var(--bg3)'}" fill-opacity="${on ? 0.28 : 0.55}" stroke="${on ? 'var(--gold)' : 'var(--line2)'}" stroke-width="${on ? 2 : 1}"${on ? ` filter="url(#${id})" class="bv-fade"` : ''}/>
<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="9" fill="none" stroke="${on ? 'var(--gold)' : 'transparent'}" stroke-width="${on ? 2 : 0}"/>
<text x="${x + cw / 2}" y="${y + ch / 2 - 2}" text-anchor="middle" font-size="${on ? 14 : 12}" font-weight="${on ? 700 : 500}" fill="${on ? 'var(--tx)' : 'var(--tx3)'}">${esc(name)}</text>
<text x="${x + cw / 2}" y="${y + ch / 2 + 14}" text-anchor="middle" font-size="9" fill="${on ? 'var(--tx2)' : 'var(--tx3)'}">${esc(sub)}</text></g>`;
  };
  return `<svg class="bv-svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:290px" role="img" aria-label="Growth and inflation quadrant: ${esc(q.name)}"><defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>
${CELLS.map(cell).join('')}
<text x="${L - 8}" y="${T + ch + 2}" text-anchor="middle" font-size="9" fill="var(--tx3)" transform="rotate(-90 ${L - 8} ${T + ch + 2})">growth ↑ · ↓</text>
<text x="${L + cw + 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--tx3)">inflation ↓ · ↑</text></svg>`;
}

function lights(risk) {
  if (!risk?.flags?.length) return '';
  return `<div class="bv-lights">${risk.flags.map(f => `<span class="bv-light ${f.on ? 'on' : f.on === null ? 'na' : ''}" title="${esc(f.detail)}"><i></i>${esc(f.label)}${f.value != null ? ` <b class="mono">${esc(String(f.value))}</b>` : ''}</span>`).join('')}</div>`;
}

const LVL = { CALM: 'up', CAUTION: 'gold', RISK_OFF: 'dn' };
function topTiles(rb) {
  const q = rb.quadrant, c = rb.corr, r = rb.risk;
  const corrG = c && fin(c.z) ? arcGauge({ value: Math.max(-3, Math.min(3, c.z)), min: -3, max: 3, label: 'Correlation regime', sub: `mean |ρ| ${c.mean.toFixed(2)} · ${Math.round(c.highShare * 100)}% of pairs above 0.7`, w: 260,
    zones: [{ from: -3, to: -1, tone: 'gold' }, { from: -1, to: 1, tone: 'flat' }, { from: 1, to: 3, tone: 'dn' }], ticks: [{ v: -2, label: 'low' }, { v: 0, label: '0' }, { v: 2, label: 'high' }] }) : '';
  return `<div class="bv-g3">
<div class="card"><div class="ch"><span class="lbl">Growth × inflation</span><span class="r"><span class="chip gold">${esc(q?.name ?? '–')}</span></span></div>${quadrantSvg(q)}<p class="muted bv-note">${esc(q?.why ?? '')}. A description of the macro backdrop; the theory's expected asset moves are not shown (tested only as a descriptor).</p></div>
<div class="card"><div class="ch"><span class="lbl">Correlation regime</span><span class="r">${c ? `<span class="chip ${c.state === 'HIGH' ? 'dn' : c.state === 'LOW' ? 'gold' : ''}">${esc(c.state.toLowerCase())}</span>` : ''}</span></div>${corrG || '<p class="muted">The pair correlations are not built yet.</p>'}
<p class="muted bv-note">Mean absolute correlation across ${c?.n ?? '–'} tracked pair combinations against each one's own five-year normal. High means several setups are really one bet and hedges hedge less; it is a sizing fact, not a direction.</p></div>
<div class="card"><div class="ch"><span class="lbl">Risk state</span><span class="r">${r ? `<span class="chip ${LVL[r.level] ?? ''}">${esc(String(r.level).replace('_', ' ').toLowerCase())}</span>` : ''}</span></div>${lights(r)}
${r?.move ? `<div class="bv-stats" style="margin-top:8px"><div><span class="lbl">Bond vol (MOVE)</span><div class="mono bv-kv">${r.move.level}</div></div><div><span class="lbl">1y percentile</span><div class="mono bv-kv">${r.move.pct1y ?? '–'}th</div></div><div><span class="lbl">20 days</span><div class="mono bv-kv">${sg(r.move.chg20, 1)}</div></div></div>` : ''}
<p class="muted bv-note">${esc(r?.note ?? '')} Lit flags are the conditions that are on today.</p></div></div>`;
}

function lensesCard(rb) {
  const rows = rb.frames.map(f => `<tr><td><b>${esc(f.name)}</b></td><td><span class="chip">${esc(f.state)}</span></td><td class="bv-why" title="${esc(f.why ?? '')}">${esc(String(f.why ?? '').length > 120 ? `${String(f.why).slice(0, 118)}…` : (f.why ?? ''))}</td><td class="n mono muted">${f.conformity && f.conformity.judged ? `${f.conformity.met} of ${f.conformity.judged}` : '–'}</td></tr>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Seven lenses on where the market is</span><span class="r muted">${esc(String(rb.asOf ?? '').slice(0, 10))}</span></div>
<div class="scroll"><table><thead><tr><th>Lens</th><th>Reading</th><th>Why</th><th class="n" title="of the judgeable moves the textbook regime expects, how many the market made">Met</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted bv-note">${esc(rb.regimeLine ?? '')} "Textbook met" counts how many of the moves the regime's theory expects the market actually made; the expected moves themselves are not shown because they are theory, not a tested lean.</p></div>`;
}

function hmmCard(rb) {
  const h = rb.hist, m = rb.hmm; if (!h && !m) return '';
  const rows = h ? h.rows.slice(0, 40).map(r => `<div class="bv-hrow"><span class="bv-hl">${esc(r.sym)}</span>${stateStrip([...r.s].map((ch, i) => ({ tone: ch === 'a' ? 'gold' : ch === 'q' ? 'pur' : null, title: `${r.sym} ${h.days[i] ?? ''}: ${ch === 'a' ? 'active' : ch === 'q' ? 'quiet' : 'not recorded'}` })), { cell: 7, gap: 1 })}<span class="mono muted bv-hn">${r.active}a</span></div>`).join('') : '';
  return `<div class="card"><div class="ch"><span class="lbl">Quiet or active · the last ${h?.days?.length ?? 30} days</span><span class="r">${m ? `<span class="chip pur">${m.quiet} quiet</span> <span class="chip gold">${m.active} active</span>` : ''}</span></div>
<div class="bv-hhead"><span><i class="bv-dot" style="background:var(--pur2)"></i>quiet (RANGE)</span><span><i class="bv-dot" style="background:var(--gold)"></i>active (TREND)</span><span class="muted">oldest left · today right · gaps are weekends</span></div>
${rows}<p class="muted bv-note">The daily two-state model's read of each market. <b>Quiet means moves have been small and mean-reverting, not that price has no direction; active means moves have been big, and says nothing about which way.</b> Most active first.</p></div>`;
}

function edgesCard(rb) {
  if (!rb.edges?.length) return '';
  const GR = { ROBUST: 'up', PLAUSIBLE: 'gold', FRAGILE: '' };
  const rows = rb.edges.map(e => `<tr><td>${esc(e.label)}</td><td><span class="chip ${GR[e.grade] ?? ''}">${esc(String(e.grade ?? '').toLowerCase())}</span></td><td>${e.active === true ? '<span class="chip gold">on today</span>' : e.active === false ? '<span class="chip">off today</span>' : '<span class="chip">not scored</span>'}</td><td class="bv-why">${esc(e.why ?? '')}</td></tr>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Registered range edges</span><span class="r muted">conditions that have been shown to change the size of the day</span></div>
<div class="scroll"><table><thead><tr><th>Condition</th><th>Grade</th><th>Today</th><th>Reading</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted bv-note">These are range effects (how wide the day tends to run), never direction. "On today" means the condition is met now.</p></div>`;
}

/** The whole board. rb = /api/regime-board. */
export function boardHtml(rb) {
  const head = `<div class="sec"><h2>Where the market is</h2><span class="lbl">the regime stack: seven lenses, the correlation regime, risk state and which markets are quiet or active · descriptions, not directions</span></div>`;
  if (!rb?.ok) return `<div class="sfc" data-surface="panel.macro.regime">${head}<div class="card"><p class="muted">${esc(rb?.error ?? 'not loaded yet')}.</p></div></div>`;
  const say = describeRegime(rb);
  const ev = [
    chipFor('gr-hmm-trend-direction', 'The two-state label as a next-day call: tested, null; it describes the last fortnight.'),
    chipFor('vix-inversion', 'VIX above VIX3M and the next week: wider, not directional.'),
    chipFor('forecast-miss-shock-fx', 'Stacked stress conditions and FX ranges: wider than forecast, not directional.'),
    chipFor('regime-divergence-fx', 'A regime divergence as an FX direction: tested, null.'),
  ].filter(Boolean).join('');
  const stamp = `<div class="bv-stamp"><span class="lbl">Evidence Book</span>${ev}<span class="muted">Regimes here describe size and backdrop. Where a regime has been tested it changed how wide the day runs; none has been shown to call direction.</span></div>`;
  const links = ownerOnly(` ${ownerLink('regime.html', 'Regime page')} · ${ownerLink('state.html', 'Market State page')}.`);
  return `<div class="sfc" data-surface="panel.macro.regime">${head}
${say ? `<div class="card bv-say"><p>${esc(say)}</p></div>` : ''}
<div style="margin-top:14px">${topTiles(rb)}</div>
<div class="grid g2" style="margin-top:14px">${lensesCard(rb)}${hmmCard(rb)}</div>
<div style="margin-top:14px">${edgesCard(rb)}</div>
<p class="muted bv-note" style="margin-top:8px">${links}</p>${stamp}</div>`;
}
