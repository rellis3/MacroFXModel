/**
 * The autocorrelation board (/api/autocorrelation, js/autocorr.js) drawn for the Desk Terminal: a table for the Assets
 * tab and a card for the Pair tab. Pure HTML-string builders, no fetch. Every view says it is description, not a signal.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const WCLS = { trends: 'up', reverts: 'pur', unstable: 'gold', 'no memory': '', 'no data': '' };
export const wordChip = w => `<span class="chip ${WCLS[w] ?? ''}">${esc(w ?? '–')}</span>`;
export const rowOf = (d, inst) => (d?.rows ?? []).find(r => r.id === String(inst ?? '').toUpperCase()) ?? null;

/**
 * Bars for lags 1..10. kind 'ret': each bar against its own robust band (bar ± band shown as a tick), a bar clearing it
 * in gold. kind 'vol': |return| autocorrelation against the board's iid band (dashed line).
 */
export function lagBars(p, kind = 'ret', w = 220, h = 64) {
  const L = kind === 'ret' ? p?.ret : p?.vol; if (!L?.length) return '';
  const mx = kind === 'ret' ? Math.max(0.1, ...L.map(v => Math.abs(v.r ?? 0) + (v.se ?? 0) * (p.bandRetZ ?? 2.8))) : Math.max(0.1, ...L.map(v => Math.abs(v.r ?? 0)), p.bandAbs ?? 0);
  const bw = w / L.length, mid = kind === 'ret' ? h / 2 : h - 12, sc = kind === 'ret' ? (h / 2 - 12) / mx : (h - 16) / mx;
  const bars = L.map((v, i) => {
    const x = i * bw + bw * 0.2, bwi = bw * 0.6, y = v.r >= 0 ? mid - v.r * sc : mid, hh = Math.abs(v.r ?? 0) * sc;
    const hot = kind === 'ret' ? v.sig : (v.r ?? 0) > (p.bandAbs ?? 1);
    const band = kind === 'ret' && fin(v.se) ? (v.se * (p.bandRetZ ?? 2.8)) * sc : 0;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bwi.toFixed(1)}" height="${Math.max(0.5, hh).toFixed(1)}" rx="1.5" fill="${hot ? 'var(--gold)' : 'var(--pur2)'}" opacity="${hot ? 1 : 0.7}"><title>lag ${v.lag}: ${sg(v.r, 3)}${kind === 'ret' && fin(v.se) ? ` (band ±${(v.se * (p.bandRetZ ?? 2.8)).toFixed(3)})` : ''}</title></rect>`
      + (band ? `<line x1="${x.toFixed(1)}" x2="${(x + bwi).toFixed(1)}" y1="${(mid - band).toFixed(1)}" y2="${(mid - band).toFixed(1)}" stroke="var(--tx3)" stroke-width="1"/><line x1="${x.toFixed(1)}" x2="${(x + bwi).toFixed(1)}" y1="${(mid + band).toFixed(1)}" y2="${(mid + band).toFixed(1)}" stroke="var(--tx3)" stroke-width="1"/>` : '')
      + `<text x="${(x + bwi / 2).toFixed(1)}" y="${h - 1}" font-size="8" text-anchor="middle" fill="var(--tx3)">${v.lag}</text>`;
  }).join('');
  const base = `<line x1="0" x2="${w}" y1="${mid}" y2="${mid}" stroke="var(--line2)" stroke-width="1"/>`;
  const vband = kind === 'vol' && fin(p.bandAbs) ? `<line x1="0" x2="${w}" y1="${(mid - p.bandAbs * sc).toFixed(1)}" y2="${(mid - p.bandAbs * sc).toFixed(1)}" stroke="var(--tx3)" stroke-dasharray="3 3" stroke-width="1"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${kind === 'ret' ? 'return' : 'volatility'} autocorrelation, lags 1 to 10 days">${base}${vband}${bars}</svg>`;
}

const vrCell = v => (v ? `<td class="n mono${v.vr > 1 ? ' up' : ''}"${v.vr < 1 ? ' style="color:var(--pur2)"' : ''} title="z ${sg(v.z)} · p ${v.p ?? '–'}">${(+v.vr).toFixed(2)}</td>` : '<td class="n mono">–</td>');

/** The Assets-tab board. */
export function boardHtml(d) {
  if (!d) return '';
  const head = '<div class="sec"><h2>Memory in prices</h2><span class="lbl">autocorrelation: does today\'s move say anything about the next days? · daily, in-sample to the lockbox · description, not a signal</span></div>';
  if (!d.ok) return `${head}<div class="card muted">${esc(d.error ?? 'Not available yet.')}</div>`;
  const s = d.summary ?? {};
  return `${head}<div class="card scroll"><p style="margin:0 0 8px"><b>${s.markets ?? 0}</b> markets · <span class="up">${s.trends ?? 0} trend</span> · <span style="color:var(--pur2)">${s.reverts ?? 0} revert</span> · <span class="gold">${s.unstable ?? 0} unstable</span> · ${s.noMemory ?? 0} with no reliable memory in direction</p>
<table style="min-width:720px"><thead><tr><th>Market</th><th>Reading</th><th class="n" title="correlation of one day's move with the next">Lag 1</th><th class="n" title="variance ratio: above 1 = moves continue, below 1 = they reverse">VR 5d</th><th class="n">VR 20d</th><th class="n" title="lag 1 in the first and second half of the history">Halves</th><th class="n" title="lag 1 over the last 60 days: noisy (±0.13), context only">Last 60d</th><th>Direction, lags 1-10</th><th>Volatility, lags 1-10</th></tr></thead><tbody>${d.rows.filter(r => r.ok).map(r => `<tr class="tt-click" data-pair="${esc(r.id)}" title="${esc(r.reading.line)}"><td class="mono"><b>${esc(r.id)}</b></td><td>${wordChip(r.reading.word)}</td><td class="n mono">${sg(r.ret?.[0]?.r, 3)}</td>${vrCell(r.vr?.[5])}${vrCell(r.vr?.[20])}<td class="n mono muted">${sg(r.halves?.[0]?.acf1)} / ${sg(r.halves?.[1]?.acf1)}</td><td class="n mono muted">${sg(r.recent?.acf1)}</td><td>${lagBars(r, 'ret', 130, 36)}</td><td>${lagBars(r, 'vol', 130, 36)}</td></tr>`).join('')}</tbody></table>
<p class="muted" style="font-size:12px">How to read it. <b>Direction</b>: a bar above the line = a move tended to be followed by a move the same way that many days later; below = the opposite way. Gold bars clear their band (robust to volatility clustering, corrected for the ten lags). <b>VR</b> (variance ratio) sums it up: 1.00 = a random walk, above 1 = moves have continued (trend), below 1 = they have reversed (mean reversion). <b>Volatility</b>: the same for the size of moves, ignoring direction; bars above the dashed line = a big day tends to follow a big day (why range forecasts work). A market only reads "trends" or "reverts" if it survives the correction for testing all ${s.markets ?? ''} markets at once and holds in both halves of the history. ${esc(d.label)}${Object.keys(d.errors ?? {}).length ? ` Not loaded: ${Object.keys(d.errors).map(esc).join(', ')}.` : ''}</p></div>`;
}

/** The Pair-tab card. */
export function pairCard(d, inst) {
  const r = rowOf(d, inst), hd = '<div class="ch"><span class="lbl">Memory in prices · autocorrelation</span></div>';
  if (!d) return '';
  if (!d.ok || !r) return `${hd}<div class="muted">${esc(d.ok ? 'This market is not on the autocorrelation board.' : d.error ?? 'Not available yet.')}</div>`;
  if (!r.ok) return `${hd}<div class="muted">${esc(r.reading.line)}</div>`;
  return `${hd}<p style="margin:4px 0 8px">${wordChip(r.reading.word)} ${esc(r.reading.line)}</p>
<div style="display:flex;flex-wrap:wrap;gap:14px"><div><span class="lbl">Direction, lags 1-10 days</span><div>${lagBars(r, 'ret', 240, 70)}</div></div><div><span class="lbl">Volatility, lags 1-10 days</span><div>${lagBars(r, 'vol', 240, 70)}</div></div></div>
<div class="mono" style="font-size:12px;margin-top:6px">lag 1 ${sg(r.ret?.[0]?.r, 3)} · VR 5d ${r.vr?.[5] ? (+r.vr[5].vr).toFixed(2) : '–'} (z ${sg(r.vr?.[5]?.z)}) · VR 20d ${r.vr?.[20] ? (+r.vr[20].vr).toFixed(2) : '–'} (z ${sg(r.vr?.[20]?.z)}) · halves ${sg(r.halves?.[0]?.acf1)} / ${sg(r.halves?.[1]?.acf1)} · last 60d ${sg(r.recent?.acf1)}</div>
<p class="tt-note">${r.n} daily moves, ${esc(r.from)} to ${esc(r.to)}. Description, not a signal: to test an idea from it, use the quick test on the Research tab, then the research protocol.</p>`;
}
