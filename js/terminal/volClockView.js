/**
 * Desk Terminal, Assets tab: "Implied vol against the forecast" (HTML). Numbers from js/volClockCore.js (/api/vol-clock). Tokens only.
 *
 * A vol-clock dial per market: the arc is how much of the forecast day's median range the session has used (the p50, p75 and p90 lines are the
 * marks on it), the ring around it is the London day with the hours gone lit, the centre is the options-implied sigma over the forecast sigma.
 * Below, every market the vol intelligence covers, ranked and sortable, and the Daily Read's forward record with its interval.
 *
 * SIZE, NEVER DIRECTION. Implied vol has forecast the coming range better than realised-vol models (iv-forecast, VALIDATED) and indices have run wider
 * after implied sat far above realised (iv-over-rv-wider, VALIDATED); neither says which way. The Daily Read's tags are worded as "lines likely too
 * tight / about right / too wide", never as a trade, and its forward record is small, so it is shown with its interval and the design share.
 */
import { esc, fin } from './boardViz.js';
import { chipFor } from './corrEvidence.js';
import { describeVolClock, TAGS, DIAL_MAX, DESIGN_P75 } from '../volClockCore.js';

const pct = v => (fin(v) ? `${Math.round(v * 100)}%` : '–');
const TAG_CHIP = { continue: 'gold', fair: '', exhaust: 'pur' };
const TAG_VAR = { continue: 'var(--gold)', fair: 'var(--tx2)', exhaust: 'var(--pur2)' };
let uid = 0;

// ── the dial ──
const CX = 80, CY = 86, R = 50, RC = 68, A0 = 135, SWEEP = 270;
const rad = a => (a * Math.PI) / 180;
const pt = (a, r) => [CX + r * Math.cos(rad(a)), CY + r * Math.sin(rad(a))];
const ang = v => A0 + (SWEEP * Math.min(DIAL_MAX, Math.max(0, v))) / DIAL_MAX;
const arc = (a1, a2, r) => { const [x1, y1] = pt(a1, r), [x2, y2] = pt(a2, r); return `M${x1.toFixed(1)},${y1.toFixed(1)}A${r},${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`; };

/** One market's vol-clock dial (SVG). */
export function dialSvg(t) {
  const id = `vc${++uid}`, c = t.clock ?? { mode: 'none' }, L = t.lines;
  const used = fin(c.used) ? +c.used : null, hot = used != null && L && used >= L.k75;
  const marks = L ? [[1, 'p50'], [L.k75, 'p75'], [L.k90, 'p90']] : [[1, 'p50']];
  const hours = c.mode === 'live' && fin(c.hours) ? Math.min(24, Math.max(0, c.hours)) : c.mode === 'last' ? 24 : 0;
  const ring = Array.from({ length: 24 }, (_, i) => { const [x, y] = pt(-90 + (i + 0.5) * 15, RC), lit = i < hours; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${lit ? 1.7 : 1.2}" class="${lit ? (c.mode === 'last' ? 'vc-hr vc-hr-done' : 'vc-hr vc-hr-on') : 'vc-hr'}"/>`; }).join('');
  const tick = marks.map(([v, l]) => { const a = ang(v), [x1, y1] = pt(a, R - 7), [x2, y2] = pt(a, R + 7), [tx, ty] = pt(a, R + 16); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="vc-tk"/><text x="${tx.toFixed(1)}" y="${(ty + 2.5).toFixed(1)}" text-anchor="middle" class="vc-tl">${l}</text>`; }).join('');
  const expected = c.mode === 'live' && fin(c.hours) && c.hours >= 2 ? Math.sqrt(c.hours / 24) : null;
  const pace = expected != null ? (() => { const a = ang(expected), [x, y] = pt(a, R + 6); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" class="vc-pace"><title>where a typical day's range would be by this hour</title></circle>`; })() : '';
  const fill = used != null && used > 0.005 ? `<path d="${arc(A0, ang(used), R)}" fill="none" stroke="url(#${id}g)" stroke-width="12" stroke-linecap="round" opacity="0.35" filter="url(#${id}f)"/><path class="vc-fill" pathLength="1" d="${arc(A0, ang(used), R)}" fill="none" stroke="url(#${id}g)" stroke-width="6" stroke-linecap="round"/>` : '';
  const aria = `${t.sym}: options price ${t.ratio.toFixed(2)} times the forecast sigma (${TAGS[t.tag]?.short ?? 'no tag'}). ${used != null ? `Range ${c.mode === 'last' ? 'in the last session' : 'so far'}: ${pct(used)} of the forecast median.` : 'No range reading yet.'} Size, not direction.`;
  return `<svg class="vc-dial" viewBox="0 0 160 168" role="img" aria-label="${esc(aria)}">
<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${CX - R}" y1="0" x2="${CX + R}" y2="0"><stop offset="0" stop-color="var(--pur2)"/><stop offset="1" stop-color="${hot ? 'var(--gold)' : 'var(--pur2)'}"/></linearGradient><filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>
${ring}<path d="${arc(A0, A0 + SWEEP, R)}" fill="none" class="vc-track" stroke-width="6" stroke-linecap="round"/>${fill}${tick}${pace}
<text x="${CX}" y="${CY + 2}" text-anchor="middle" class="vc-ratio" fill="${TAG_VAR[t.tag] ?? 'var(--tx)'}">${t.ratio.toFixed(2)}×</text>
<text x="${CX}" y="${CY + 16}" text-anchor="middle" class="vc-sub">IV ÷ σ</text>
</svg>`;
}

const clockCaption = t => {
  const c = t.clock ?? {};
  if (c.mode === 'live') return c.used == null ? `Too early in the London day to judge the range used` : `Range so far ${pct(c.used)} of the forecast median, ${Math.round(c.hours ?? 0)}h into the London day${c.state && c.state !== 'early' ? ` · ${esc(c.state)}` : ''}`;
  if (c.mode === 'last') return `Last session (${esc(c.date)}): range ${pct(c.used)} of the forecast median`;
  return 'No range reading yet';
};

/** One tile. */
export function tileHtml(t) {
  const tag = TAGS[t.tag];
  return `<div class="vc-tile" data-tag="${esc(t.tag ?? '')}" data-lk-inst="${esc(t.sym)}"><div class="vc-h"><b class="mono">${esc(t.sym)}</b>${tag ? `<span class="chip ${TAG_CHIP[t.tag] ?? ''}" title="${esc(tag.plain)}">${esc(tag.label)}</span>` : ''}</div>${dialSvg(t)}
<div class="vc-meta mono"><span title="options-implied annual vol, ${esc(t.ivSource ?? '')}">IV ${t.iv}%</span><span title="the forecaster's own sigma for the day, % of price">σ ${t.sigma}%</span>${t.eventMult != null && Math.abs(t.eventMult - 1) >= 0.03 ? `<span title="the event multiplier in today's lines (${esc(t.event ?? '')})">event ×${t.eventMult.toFixed(2)}</span>` : ''}</div>
<div class="vc-cap">${tag ? `<b>${esc(tag.short)}</b>` : ''}${t.provisional ? ` <span class="chip" title="${esc(t.provisional)}">provisional</span>` : ''}</div><div class="vc-cap muted">${clockCaption(t)}</div></div>`;
}

// ── the ranking ──
const RAIL = { lo: 0.6, hi: 1.4, w: 110, h: 14 };
function ratioRail(r) {
  if (!fin(r.ratio)) return '<span class="muted" title="no options-implied number is held for this market">–</span>';
  const x = v => ((Math.min(RAIL.hi, Math.max(RAIL.lo, v)) - RAIL.lo) / (RAIL.hi - RAIL.lo)) * RAIL.w;
  const e = r.edges;
  return `<svg viewBox="0 0 ${RAIL.w} ${RAIL.h}" width="${RAIL.w}" height="${RAIL.h}" class="vc-rail" role="img" aria-label="IV over sigma ${r.ratio.toFixed(2)}"><rect x="0" y="5" width="${RAIL.w}" height="4" rx="2" class="vc-rl"/>${e ? `<rect x="${x(e[0]).toFixed(1)}" y="3" width="${(x(e[1]) - x(e[0])).toFixed(1)}" height="8" rx="2" class="vc-rb"/>` : ''}<circle cx="${x(r.ratio).toFixed(1)}" cy="7" r="3.4" fill="${TAG_VAR[r.tag] ?? 'var(--tx2)'}" class="vc-rd"/></svg> <span class="mono">${r.ratio.toFixed(2)}</span>`;
}
const volBar = p => (!fin(p) ? '<span class="muted">–</span>' : `<div class="vc-vb${p >= 90 ? ' hot' : ''}" title="realised vol at the ${p}th percentile of its own history"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div> <span class="mono">${p}</span>`);
const SHAPE = { upward: 'rising', downward: 'falling', flat: 'flat' };

export function rankHtml(vc) {
  const rows = [...(vc.rank ?? [])].sort((a, b) => (fin(b.ratio) ? b.ratio : -1) - (fin(a.ratio) ? a.ratio : -1) || (b.volPct ?? -1) - (a.volPct ?? -1));
  const th = (k, label, tip) => `<th class="n"><button type="button" class="vc-sort" data-k="${k}" title="${esc(tip)}">${esc(label)}</button></th>`;
  return `<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Every market the vol intelligence covers</span><span class="r muted">${vc.counts.tagged} of ${vc.counts.total} have an options-implied number · click a heading to sort</span></div>
<div class="scroll"><table class="vc-rank"><thead><tr><th>Market</th><th>Class</th>${th('ratio', 'IV ÷ σ', 'options-implied sigma over the forecast sigma: the dark band is the "lines about right" zone')}${th('volPct', 'Realised vol, percentile', 'realised volatility against the market\'s own history')}<th>Vol of vol</th><th>IV curve</th>${th('vrp', 'IV − realised', 'implied vol over realised vol, in % of realised')}</tr></thead>
<tbody>${rows.map(r => `<tr data-ratio="${fin(r.ratio) ? r.ratio : ''}" data-volpct="${r.volPct ?? ''}" data-vrp="${fin(r.vrpPct) ? r.vrpPct : ''}" data-lk-inst="${esc(r.name)}"><td><b class="mono">${esc(r.name)}</b></td><td class="muted">${esc(r.cls ?? '')}</td><td>${ratioRail(r)}</td><td>${volBar(r.volPct)}</td><td class="muted">${esc(r.vov ?? '–')}</td><td class="muted">${esc(SHAPE[r.ivShape] ?? r.ivShape ?? '–')}${fin(r.ivFront) ? ` <span class="mono">${r.ivFront}</span>` : ''}</td><td class="n mono">${fin(r.vrpPct) ? `${r.vrpPct > 0 ? '+' : r.vrpPct < 0 ? '−' : ''}${Math.abs(r.vrpPct).toFixed(1)}%` : '–'}</td></tr>`).join('')}</tbody></table></div>
<p class="muted vc-note">IV ÷ σ exists for the ${vc.counts.tagged} markets where a settlement or index IV is held; the other ${vc.noIv} are ranked on realised vol alone. A hot market's day lines run wide and a quiet one's narrow: size, not direction.</p></div>`;
}

// ── the Daily Read's forward record ──
function recordCard(vc) {
  const rec = vc.record; if (!rec?.rows?.length) return '';
  const W = 330, X0 = 92, X1 = W - 14, MAX = 0.6, x = v => X0 + (Math.min(MAX, Math.max(0, v)) / MAX) * (X1 - X0), H = 22 + rec.rows.length * 30;
  const body = rec.rows.map((r, i) => { const y = 26 + i * 30;
    return `<text x="0" y="${y + 4}" class="vc-rt">${esc(TAGS[r.tag].short)}</text><text x="0" y="${y + 15}" class="vc-rd2">n=${r.n}</text>
<line x1="${x(r.lo).toFixed(1)}" x2="${x(r.hi).toFixed(1)}" y1="${y}" y2="${y}" stroke="${TAG_VAR[r.tag]}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
<circle cx="${x(r.p75Rate).toFixed(1)}" cy="${y}" r="4.5" fill="${TAG_VAR[r.tag]}"><title>${esc(TAGS[r.tag].short)}: ${pct(r.p75Rate)} of days ended past the 75th-percentile line (${r.p75} of ${r.n}); 95% interval ${pct(r.lo)} to ${pct(r.hi)}</title></circle>
${fin(r.expect) ? `<path d="M${x(r.expect).toFixed(1)},${y - 7}l4,7l-4,7l-4,-7z" class="vc-ex"><title>share the fitted lines implied for this tag: ${pct(r.expect)}</title></path>` : ''}`; }).join('');
  const dx = x(rec.design);
  return `<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">The Daily Read's forward record: days ended past the 75th-percentile line</span><span class="r muted">${rec.since ? `since ${esc(rec.since)} · ` : ''}small sample</span></div>
<svg viewBox="0 0 ${W} ${H}" class="vc-rec" role="img" aria-label="Share of days past the 75th-percentile line by tag, with 95% intervals, against 25% by design"><line x1="${dx.toFixed(1)}" x2="${dx.toFixed(1)}" y1="8" y2="${H - 12}" class="vc-design"/><text x="${dx.toFixed(1)}" y="${H - 1}" text-anchor="middle" class="vc-rd2">25% design</text>${body}</svg>
<p class="muted vc-note">Dot = the share so far, bar = its 95% interval, diamond = the share the fitted lines implied. Where the bars overlap the record cannot yet separate the tags. A record of how big the day ran, not a rule to trade.</p></div>`;
}

/** The whole board. vc = /api/vol-clock. */
export function boardHtml(vc) {
  const head = `<div class="sec"><h2>Implied vol against the forecast</h2><span class="lbl">what the options price for the day against what the forecast lines assume, and how much of the day's range the session has used · size, never direction</span></div>`;
  if (vc == null) return `<div class="sfc" data-surface="panel.asset.volclock">${head}<div class="card muted">Reading the vol surface…</div></div>`;
  if (!vc.ok) return `<div class="sfc" data-surface="panel.asset.volclock">${head}<div class="card muted">${esc(vc.error ?? 'Not available.')}</div></div>`;
  const say = describeVolClock(vc);
  const stateChip = vc.closed ? `<span class="chip" title="the FX week is shut: each dial shows the last completed session's range against that day's forecast median">last session</span>` : `<span class="chip gold" title="range used so far against the share of the London day gone">live</span>`;
  const ev = [
    chipFor('iv-forecast', 'Options-implied vol forecasts the coming range better than realised-vol models: validated, range not direction.'),
    chipFor('iv-ladder', 'A forecast ladder built on implied vol beat the realised-vol ladder on 5 of 7 markets.'),
    chipFor('iv-over-rv-wider', 'Implied far above realised was followed by wider index ranges, not calmer ones.'),
    chipFor('vol-curve-front', 'The front of the S&P vol curve tells whether the index range lines are too tight or too wide: range passes, trades fail.'),
  ].filter(Boolean).join('');
  return `<div class="sfc" data-surface="panel.asset.volclock">${head}
${say ? `<div class="card vc-say"><p>${esc(say)}</p></div>` : ''}
<div class="vc-bar"><span class="lbl">Vol clock</span>${stateChip}<span class="muted">arc = range used against the forecast median (marks: median, p75, p90) · ring = hours of the London day gone · centre = IV ÷ σ</span></div>
<div class="vc-grid">${vc.tiles.map(tileHtml).join('')}</div>
${rankHtml(vc)}${recordCard(vc)}
<div class="bv-stamp vc-stamp"><span class="lbl">Evidence Book</span>${ev}<span class="muted">Implied vol has told us how big a move to expect; none of it has been shown to say which way, so a high or low reading is not a signal to buy or sell.</span></div></div>`;
}

/** Click a heading to sort the ranking (event delegation on the Assets slot; idempotent). */
export function mount(root) {
  if (!root || root.dataset.vcSort) return;
  root.dataset.vcSort = '1';
  root.addEventListener('click', e => {
    const b = e.target.closest?.('.vc-sort'); if (!b) return;
    const tbody = b.closest('table')?.querySelector('tbody'); if (!tbody) return;
    const k = b.dataset.k, desc = b.dataset.dir !== 'desc';
    b.closest('thead').querySelectorAll('.vc-sort').forEach(x => { delete x.dataset.dir; x.removeAttribute('aria-sort'); });
    b.dataset.dir = desc ? 'desc' : 'asc'; b.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
    const v = tr => { const n = parseFloat(tr.dataset[k === 'volPct' ? 'volpct' : k]); return Number.isFinite(n) ? n : null; };
    [...tbody.rows].sort((a, c) => { const x = v(a), y = v(c); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return desc ? y - x : x - y; }).forEach(r => tbody.appendChild(r));
  });
}
