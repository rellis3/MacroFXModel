/**
 * The Calendar tab's "Expectations vs reality" panel (/api/release-reactions, js/releaseReaction.js), under "Live
 * surprises": the latest releases with how each market actually moved at +30 min and +4 h against what history expects
 * for a surprise of that size, and the summary by release family (moved as expected, priced in, by VIX regime).
 * History with its count, not a forecast. Pure string builder, tested in js/terminal/terminal.test.mjs.
 */
const escD = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = Number.isFinite;
const sg = (v, dp = 2) => (fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(dp)}` : '–');
const pct = x => (fin(x) ? `${Math.round(x * 100)}%` : '–');
export const LABEL_CLS = { 'priced in': 'pur', opposite: 'dn', underreaction: 'gold', 'in line': 'up', overreaction: 'gold', mixed: '' };
const when = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function reactionsHtml(p, esc = escD) {
  if (!p?.ok) return '';
  const recent = (p.recent ?? []).slice(0, 10), fam = (p.summary ?? []).filter(r => r.regime === 'all').slice(0, 9), reg = (p.summary ?? []).filter(r => r.family === 'ALL' && r.regime !== 'all');
  const lab = l => (l ? `<span class="chip ${LABEL_CLS[l] ?? ''}">${esc(l)}</span>` : '<span class="muted">–</span>');
  const mk = (r, h) => (r.markets ?? []).filter(m => fin(m[`m${h}`])).slice(0, 3).map(m => `${esc(m.label)} <b class="mono">${sg(m[`m${h}`])}${esc(m.unit ?? '%')}</b>${m[`sizeOnly${h}`] ? (fin(m[`usual${h}`]) ? ` <span class="muted mono">vs ±${m[`usual${h}`].toFixed(2)}</span>` : '') : fin(m[`exp${h}`]) ? ` <span class="muted mono">vs ${sg(m[`exp${h}`])}</span>` : ''}`).join(' · ');
  const rows = recent.map(r => `<tr><td class="mono">${esc(when(r.ms))}</td><td>${r.source === 'live' ? '<span class="chip up" title="measured live on OANDA M1">live</span>' : '<span class="chip" title="the release study\'s history, scored point-in-time">study</span>'}</td><td><b>${esc(r.country ?? '')}</b> ${esc(r.event ?? r.family ?? '')}</td><td class="n mono">${esc(r.surprise?.diffText ?? (fin(r.surprise?.diff) ? sg(r.surprise.diff, Math.abs(r.surprise.diff) >= 100 ? 0 : 2) : '–'))}${fin(r.surprise?.z) ? ` <span class="muted">z ${sg(r.surprise.z, 1)}</span>` : ''}</td><td>${lab(r.label30)}<div style="font-size:11px">${mk(r, 30) || '<span class="muted">not measured yet</span>'}</div></td><td>${lab(r.label240)}<div style="font-size:11px">${mk(r, 240) || '<span class="muted">not measured yet</span>'}</div></td><td class="muted">${esc(r.regime?.tone ?? '')}${r.regime?.stress ? ` · ${esc(r.regime.stress)}` : ''}</td></tr>`).join('');
  const famRows = fam.map(r => `<tr><td><b>${esc(r.family === 'ALL' ? 'All families' : r.family)}</b></td><td class="n mono">${r.n}${r.live ? ` <span class="muted">(${r.live} live)</span>` : ''}</td><td class="n mono">${pct(r.m30?.expected)} <span class="muted">of ${r.m30?.nDirectional ?? 0}</span></td><td class="n mono">${pct(r.m30?.pricedIn)} <span class="muted">of ${r.m30?.nClear ?? 0}</span></td><td class="n mono">${pct(r.m240?.expected)}</td><td class="n mono">${pct(r.m240?.pricedIn)}</td><td style="font-size:11px">${Object.entries(r.m30?.labels ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</td></tr>`).join('');
  return `<div class="sec"><h2>Expectations vs reality</h2><span class="lbl">how markets actually moved after each print, against what a surprise of that size usually does${p.muted ? ' · telegram muted' : ''}</span></div>
<div class="card scroll"><table><thead><tr><th>Time</th><th></th><th>Release</th><th class="n">Surprise</th><th>+30 min</th><th>+4 h</th><th>Regime</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">No releases measured yet.</td></tr>'}</tbody></table></div>
${famRows ? `<div class="card scroll" style="margin-top:10px"><span class="lbl">By release family · ${p.studyN ?? 0} study releases plus the live record</span><table><thead><tr><th>Family</th><th class="n">n</th><th class="n">As expected 30m</th><th class="n">Priced in 30m</th><th class="n">As expected 4h</th><th class="n">Priced in 4h</th><th>30-minute labels</th></tr></thead><tbody>${famRows}</tbody></table>
${reg.length ? `<p style="font-size:12px;margin:6px 0 0">By VIX regime (30 min, all families): ${reg.map(r => `<b>${esc(r.regime)}</b> ${r.n} releases, as expected ${pct(r.m30?.expected)}, priced in ${pct(r.m30?.pricedIn)}`).join(' · ')}.</p>` : ''}</div>` : ''}
<p class="muted" style="font-size:12px">${esc(p.note ?? '')}</p>`;
}
