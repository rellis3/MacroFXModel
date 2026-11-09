/** Research Opportunities board (roe.html): the run header and the questions grouped by hypothesis family. Display only.
 *  No league table, no score, no result label: ROE section 11. Pure render functions (tested), plus a small DOM init. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function headerHtml(st) {
  if (!st) return '';
  const cls = st.state === 'completed' ? 'ok' : st.state === 'completed with flags' ? 'warn' : 'bad';
  const r = st.run;
  const counts = r ? `<div class="rb-counts">${r.itemsMeasured ?? '?'} of ${r.itemsListed ?? '?'} items scanned, ${r.observations ?? 0} observations, ${r.episodes ?? 0} episodes${r.questions != null ? `, ${r.questions} questions` : ''}${r.flaggedInputs ? `, ${r.flaggedInputs} input flag(s)` : ''}</div>` : '';
  return `<div class="rb-head ${cls}"><b>${esc(st.message)}</b>${r ? ` <span class="rb-run">watch ${esc(r.watchVersion ?? '')}</span>` : ''}${counts}</div>`;
}

export function rowHtml(r) {
  const horizons = (r.horizons ?? []).join(', ');
  const rows = [
    ['Why it arose', r.why], ['The observation', r.observation], ['The hypothesis', r.hypothesis], ['Data needed', r.dataNeeded],
    ['Horizons', `${horizons} ${r.horizonUnit ?? ''}`], ['Baseline', r.baseline], ['Smallest effect of interest', r.smallestEffect],
    ['Minimum events', r.minN], ['Mirror test', r.mirror], ['Placebo', r.placebo], ['Data boundary', r.dataBoundary],
  ].map(([k, v]) => `<div class="rb-kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
  const flags = (r.inputFlags ?? []).length ? `<span class="rb-chip warn">input flagged: ${esc(r.inputFlags.join(', '))}</span>` : '';
  return `<details class="rb-row"><summary><span class="rb-title">${esc(r.title)}</span>`
    + `<span class="rb-meta">${flags}<span class="rb-chip">raised ${esc(r.timesRaised)} time${r.timesRaised === 1 ? '' : 's'}</span><span class="rb-chip">last ${esc(r.lastDate)}</span></span></summary>`
    + `<div class="rb-body">${rows}<div class="rb-foot">first raised ${esc(r.firstDate)}, question spec ${esc(r.specHash)}, templates ${esc(r.qtVersion)}. Not tested yet: the historical evaluator is a later phase. Opening a research case from here is a later phase.</div></div></details>`;
}

export function groupsHtml(groups) {
  if (!groups?.length) return '<p class="rb-empty">No questions recorded yet. Run <code>python -m roe --push</code> on the laptop.</p>';
  return groups.map(g => `<section class="rb-group"><h2>${esc(g.mechanism.charAt(0).toUpperCase() + g.mechanism.slice(1))} <span class="rb-n">${g.rows.length}</span></h2>${g.rows.map(rowHtml).join('')}</section>`).join('');
}

export function init(doc = document, fetchFn = (...a) => fetch(...a)) {
  const root = doc.getElementById('roeRoot');
  if (!root) return;
  root.innerHTML = '<p class="rb-empty">Loading</p>';
  fetchFn('/api/roe/questions', { credentials: 'same-origin' }).then(async r => {
    if (r.status === 401) { root.innerHTML = '<p class="rb-empty">Log in to see this page.</p>'; return; }
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'failed');
    root.innerHTML = headerHtml(d.status) + groupsHtml(d.groups);
  }).catch(e => { root.innerHTML = `<p class="rb-empty">Could not load: ${esc(e.message)}</p>`; });
}
if (typeof document !== 'undefined' && document.getElementById && document.getElementById('roeRoot')) init();
