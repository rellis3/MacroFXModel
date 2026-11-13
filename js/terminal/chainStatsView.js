/**
 * The Chain tab's transmission statistics (/api/chain-stats, js/chainStats.js), drawn in the terminal's style:
 *   linkStatsHtml   the block under a tapped link: rolling correlation now against its 2-year average, the trend word,
 *                   lead/lag as eleven bars with the corrected band, and the divergence z per window with its line
 *   breakingHtml    "Links breaking down": the links whose 60-day correlation is weakening or breaking down, and the
 *                   links diverging today (|z| >= 2)
 * Context, not a signal: every block says so. Pure string builders, tested in js/terminal/terminal.test.mjs.
 */
const escD = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = Number.isFinite;
const sg = (v, dp = 2) => (fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(dp)}` : '–');
const UNIT = { pct: '%', bp: 'bp', pt: ' pt', usd: '$' };
const mv = (v, u) => (fin(v) ? `${sg(v, u === 'bp' ? 0 : u === 'pct' ? 2 : 1)}${UNIT[u] ?? ''}` : '–');
export const TREND_CLS = { 'breaking down': 'dn', weakening: 'gold', strengthening: 'up', steady: '', unknown: '' };

/** Eleven bars of cross-correlation (lag -5..+5) with the corrected band drawn as dashed lines. */
export function lagBars(lags = [], band = null, { w = 176, h = 44 } = {}) {
  if (!lags.length) return '';
  const max = Math.max(0.3, ...lags.map(l => Math.abs(l.r ?? 0)), band ?? 0), bw = w / lags.length, mid = h / 2, y = v => mid - (v / max) * (mid - 3);
  const bars = lags.map((l, i) => { const r = l.r ?? 0, top = Math.min(y(r), mid), ht = Math.abs(y(r) - mid), out = band != null && Math.abs(r) >= band && l.lag !== 0;
    return `<rect x="${(i * bw + 2).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${Math.max(0.5, ht).toFixed(1)}" fill="${out ? 'var(--gold)' : l.lag === 0 ? 'var(--pur2)' : 'var(--tx2)'}"><title>lag ${l.lag > 0 ? '+' : ''}${l.lag}: r ${sg(l.r)} (n ${l.n})</title></rect>`; }).join('');
  const bl = band != null ? [band, -band].map(b => `<line x1="0" x2="${w}" y1="${y(b).toFixed(1)}" y2="${y(b).toFixed(1)}" stroke="var(--gold)" stroke-dasharray="3 3" stroke-width="1" opacity=".7"/>`).join('') : '';
  return `<svg viewBox="0 0 ${w} ${h + 12}" width="${w}" height="${h + 12}" role="img" aria-label="cross-correlation at lags -5 to +5"><line x1="0" x2="${w}" y1="${mid}" y2="${mid}" stroke="currentColor" opacity=".25"/>${bl}${bars}<text x="2" y="${h + 10}" font-size="9" fill="currentColor" opacity=".6">−5</text><text x="${w / 2}" y="${h + 10}" font-size="9" fill="currentColor" opacity=".6" text-anchor="middle">0</text><text x="${w - 2}" y="${h + 10}" font-size="9" fill="currentColor" opacity=".6" text-anchor="end">+5</text></svg>`;
}

/** The block under a tapped link. s = /api/chain-stats links[id]. */
export function linkStatsHtml(s, esc = escD) {
  if (!s) return '';
  if (!s.ok) return `<div class="cs-box" style="margin-top:8px"><b>Transmission statistics</b> <span class="muted">${esc(s.why ?? 'not available')}</span></div>`;
  const c = s.corr ?? {}, row = w => `<tr><td>${w}-day</td><td class="n mono">${sg(c[w]?.now)}</td><td class="n mono muted">${sg(c[w]?.then)}</td><td class="n mono muted">${sg(c[w]?.avg2y)}</td></tr>`;
  const div = [1, 5, 20].map(w => s.divergence?.[w]).filter(Boolean);
  return `<div class="cs-box" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><b>Transmission statistics</b><span class="chip ${TREND_CLS[s.trend] ?? ''}">${esc(s.trend)}${fin(s.trendDelta) ? ` · ${sg(s.trendDelta)} in 20d` : ''}</span><span class="chip">context, not a signal</span>${s.textbookSign ? `<span class="muted" style="font-size:11px">textbook sign ${esc(s.textbookSign)} (120-day, 2 years)</span>` : ''}</div>
<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:6px"><div style="max-width:100%;overflow-x:auto"><table style="width:auto"><thead><tr><th>Correlation of daily changes</th><th class="n">now</th><th class="n">20d ago</th><th class="n">2y avg</th></tr></thead><tbody>${[20, 60, 120].map(row).join('')}</tbody></table></div>
<div><span class="lbl">Lead / lag · n ${s.leadLag?.n ?? '–'}${s.leadLag?.band != null ? ` · band ±${s.leadLag.band}` : ''}</span><br>${lagBars(s.leadLag?.lags ?? [], s.leadLag?.band)}<div class="muted" style="font-size:10px">left of 0: the downstream end leads · right: the upstream end leads</div></div></div>
<div style="font-size:12px;margin-top:4px">${esc(s.leadLag?.text ?? '')}.</div>
${div.length ? `<div style="max-width:100%;overflow-x:auto;margin-top:6px"><table style="width:auto"><thead><tr><th>Divergence</th><th class="n">z</th><th class="n">upstream</th><th class="n">downstream</th><th class="n">usual link implies</th></tr></thead><tbody>${div.map(d => `<tr><td>${d.win}-day</td><td class="n mono ${Math.abs(d.z) >= 2 ? 'gold' : ''}">${sg(d.z, 1)}σ</td><td class="n mono">${mv(d.fromMove, s.fromUnit)}</td><td class="n mono">${mv(d.toMove, s.toUnit)}</td><td class="n mono muted">${mv(d.implied, s.toUnit)}</td></tr>`).join('')}</tbody></table></div>` : ''}
${s.line ? `<div style="margin-top:6px"><b>${esc(s.line)}</b></div>` : ''}
<div class="muted" style="font-size:11px;margin-top:4px">Describes how the link is behaving now; it is not a forecast (yields → FX forward coupling is a banked null here). Beta from the 120 days before each window; z assumes independent daily residuals. As of ${esc(s.asOf ?? '?')}, ${s.n ?? '?'} common days.</div></div>`;
}

/** "Links breaking down" and today's divergences. p = /api/chain-stats. */
export function breakingHtml(p, esc = escD) {
  if (!p?.ok) return p?.error ? `<div class="tt-note">Transmission statistics: ${esc(p.error)}</div>` : '';
  const br = p.breaking ?? [], dv = p.divergences ?? [];
  const item = (id, html) => `<div class="tt-link"><span class="ends" style="grid-column:1/-1"><a href="#" data-act="link" data-id="${esc(id)}" style="color:var(--tx);text-decoration:none">${html}</a></span></div>`;
  return `<div style="margin-top:14px"><div class="ch" style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span class="lbl">Links breaking down</span><span class="chip">context, not a signal</span><span class="muted" style="font-size:11px">60-day correlation of daily changes against 20 days ago and its 2-year average · built ${esc(p.day ?? '')}</span></div>
${br.length ? br.map(b => item(b.id, `<span class="chip ${TREND_CLS[b.trend] ?? ''}">${esc(b.trend)}</span> <b>${esc(b.short)}</b> <span class="mono">${sg(b.then60)} → ${sg(b.corr60)}</span> <span class="muted">(2y avg ${sg(b.avg60)})</span>`)).join('') : '<div class="muted">No link is weakening or breaking down on the 60-day correlation.</div>'}
${dv.length ? `<div class="lbl" style="margin-top:8px">Diverging today (|z| ≥ 2)</div>${dv.map(d => item(d.id, `<span class="chip ${d.alert ? 'gold' : ''}">${sg(d.z, 1)}σ · ${d.win}d</span> ${esc(d.line ?? d.short)}`)).join('')}` : ''}
<div class="tt-note" style="margin-top:4px">${esc(p.note ?? '')}</div></div>`;
}
