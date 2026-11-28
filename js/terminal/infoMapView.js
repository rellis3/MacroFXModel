/**
 * The Desk Terminal's Info map tab: every information family the repo holds (js/infoMap.js), where it lives, and how the
 * terminal uses it, with the columns the repo can derive (js/infoMapDerived.js, built by scripts/build_info_map.mjs).
 * Status chips say how much of a family the terminal draws; the stale list at the top says what not to trust yet; each
 * row opens to the page, the route, the analyst-pack membership, what the tests say and a terminal visual idea.
 *
 * Pure HTML-string builders (no fetch, no clock) plus one mount(). Tested in js/terminal/infoMapView.test.mjs.
 * The name-match lines are a string match in the terminal / Today / Atlas / newsletter code, never a trace. Context, never a signal.
 */
import { FAMILIES, GROUPS, STATUSES, USES, FLAG_KINDS, TAB_LABELS, INFO_MAP_REVIEWED, NEW_SINCE } from '../infoMap.js';
import { DERIVED } from '../infoMapDerived.js';
import { ownerLink } from './links.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STATUS_ORDER = ['DRAWN', 'SUMMARY', 'PACK', 'STANDALONE'];
const STATUS_CLS = { DRAWN: 'hold', SUMMARY: '', PACK: 'broke', STANDALONE: '' };
const VERDICT_CLS = { validated: 'pur', null: '', underpowered: '', context: '' };

/** is this family new since the review date (js/infoMap.js NEW_SINCE)? Hand-kept `added` date on the family. */
export const isRecent = f => Boolean(f.added && f.added >= NEW_SINCE);

/** count families by status, by use and the flagged ones */
export function counts(fams = FAMILIES) {
  const by = k => fams.reduce((a, f) => ((a[f[k]] = (a[f[k]] ?? 0) + 1), a), {});
  return { total: fams.length, status: by('status'), use: by('use'), flagged: fams.filter(f => f.flag).length, recent: fams.filter(isRecent).length };
}

/** state = { status: '' | key, group: '' | id, flag: bool, recent: bool, q: string }. Every word of q must appear in the family's text. */
export function filterFamilies(fams, { status = '', group = '', flag = false, recent = false, q = '' } = {}) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return fams.filter(f => {
    if (status && f.status !== status) return false;
    if (group && f.group !== group) return false;
    if (flag && !f.flag) return false;
    if (recent && !isRecent(f)) return false;
    if (!words.length) return true;
    const hay = [f.name, f.family, f.pages.join(' '), f.routes.join(' '), f.store, f.visual, f.evidence.join(' '), f.status, STATUSES[f.status]?.label].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

export function filtersHtml(st = {}, fams = FAMILIES) {
  const c = counts(fams);
  const sb = (k, label) => `<button type="button" data-im-status="${esc(k)}" aria-pressed="${(st.status ?? '') === k}" title="${esc(STATUSES[k]?.blurb ?? 'every family')}">${esc(label)}${k ? ` ${c.status[k] ?? 0}` : ` ${c.total}`}</button>`;
  const gb = g => `<button type="button" data-im-group="${esc(g.id)}" aria-pressed="${st.group === g.id}" title="${esc(g.blurb)}">${esc(g.label)}</button>`;
  return `<div class="filters nt-f"><span class="lbl">Terminal</span>${sb('', 'All')}${STATUS_ORDER.map(k => sb(k, STATUSES[k].label)).join('')}</div>
<div class="filters nt-f"><span class="lbl">Group</span><button type="button" data-im-group="" aria-pressed="${!st.group}">All</button>${GROUPS.map(gb).join('')}</div>
<div class="nt-f2"><label class="nt-book"><input type="checkbox" data-im-flag${st.flag ? ' checked' : ''}> Only stale, blocked or doubtful (${c.flagged})</label><label class="nt-book"><input type="checkbox" data-im-recent${st.recent ? ' checked' : ''}> Added since ${esc(NEW_SINCE)} (${c.recent})</label><input type="search" data-im-q placeholder="Search families, pages, routes" value="${esc(st.q ?? '')}" aria-label="Search the info map"></div>`;
}

/**
 * Script and plan paths (run_cb_expectations.bat, plans/LAPTOP_TASKS.md) are the owner's detail: a desk login reads the sentence without them
 * (review 2026-11-27). owner = globalThis.deskIsViewer is absent or false.
 */
const PATH_RX = /\b[\w./-]+\.(?:bat|md|py|mjs|js|ps1|sh)\b/;
export const isOwner = () => !(globalThis.deskIsViewer?.() ?? false);
export function ownerText(t, owner = isOwner()) {
  const s = String(t ?? '');
  if (owner) return s;
  return s.replace(/\s*\((?:[^()]*\b[\w./-]+\.(?:bat|md|py|mjs|js|ps1|sh)\b[^()]*)\)/g, '').replace(new RegExp(PATH_RX.source, 'g'), 'a desk script');
}
/** the gold box: what not to trust yet */
export function staleHtml(fams = FAMILIES, owner = isOwner()) {
  const fl = fams.filter(f => f.flag);
  if (!fl.length) return '';
  return `<div class="nt-top" id="im-stale"><div class="lbl">Stale, blocked or doubtful: check before building on these</div>${fl.map(f => `<div class="nt-topi"><span class="chip gold">${esc(FLAG_KINDS[f.flag.kind] ?? f.flag.kind)}</span> <b>${esc(f.name)}</b> <span class="muted">${esc(ownerText(f.flag.text, owner))}</span></div>`).join('')}</div>`;
}

const link = (href, text) => ownerLink(href, esc(text), { target: '_blank' });

/** one family as a row that opens to its detail. d = DERIVED.families[id] */
export function rowHtml(f, d = DERIVED.families?.[f.id]) {
  const tabLink = f.tab && TAB_LABELS[f.tab] ? `<a href="#" data-im-tab="${esc(f.tab)}" title="Open the ${esc(TAB_LABELS[f.tab])} tab">${esc(TAB_LABELS[f.tab])} tab</a>` : '';
  const pages = (d?.pages ?? f.pages.map(file => ({ file, exists: true }))).map(p => p.exists ? link(p.file, p.file) : `<span class="im-gone" title="This page no longer exists">${esc(p.file)}</span>`).join(' · ');
  const ev = (d?.evidence ?? []).map(e => `<span class="chip ${VERDICT_CLS[e.verdict] ?? ''}" title="Evidence Book: ${esc(e.id)}">${esc(e.id)}: ${esc(e.verdict ?? 'unknown id')}</span>`).join(' ');
  const pack = d?.packSkills?.length ? `analyst pack: ${d.packSkills.map(esc).join(', ')}` : 'not in the analyst pack';
  const m = d?.names ?? {};
  const seen = ['terminal', 'today', 'atlas', 'newsletter'].map(k => `${k} ${(m[k] ?? []).length ? 'yes' : 'no'}`).join(' · ');
  const drift = d?.drift?.length ? `<div class="im-drift">${d.drift.map(esc).join(' ')}</div>` : '';
  return `<details class="im-row" id="im-${esc(f.id)}">
<summary><span class="im-n">${esc(f.name)}</span><span class="vchip ${STATUS_CLS[f.status] ?? ''}" title="${esc(STATUSES[f.status]?.blurb)}">${esc(STATUSES[f.status]?.label ?? f.status)}</span>${f.flag ? `<span class="chip gold" title="${esc(ownerText(f.flag.text))}">${esc(FLAG_KINDS[f.flag.kind] ?? f.flag.kind)}</span>` : ''}<span class="im-u muted">${esc(USES[f.use] ?? f.use)}</span></summary>
<div class="im-b">
<div class="im-line">${[tabLink, pages].filter(Boolean).join(' · ') || '<span class="muted">No page of its own</span>'}</div>
<div class="muted im-line">${esc(ownerText(f.family))}</div>
${f.visual ? `<div class="im-vis"><span class="lbl">Terminal visual idea</span> ${esc(f.visual)}</div>` : ''}
<div class="tt-kv im-kv"><span class="lbl">Source</span><span>${esc(ownerText(f.store) || 'not recorded')}${f.cadence ? ` · ${esc(f.cadence)}` : ''}</span>
<span class="lbl">Routes</span><span class="mono">${(d?.routes ?? f.routes.map(route => ({ route, exists: true }))).map(r => `${esc(r.route)}${r.exists ? '' : ' (not found)'}`).join(' ') || 'none'}${(d?.modules ?? []).map(x => ` ${esc(x.file)}`).join('')}</span>
<span class="lbl">Seen in</span><span>${esc(pack)} · name match, not a trace: ${esc(seen)}</span>
<span class="lbl">Traced</span><span>${esc(ownerText(f.traced))}</span>
${f.pageNote ? `<span class="lbl">Page shows</span><span>${esc(ownerText(f.pageNote))}</span>` : ''}
<span class="lbl">Tested</span><span>${ev || '<span class="muted">no Evidence Book entry</span>'} ${f.evidenceNote ? `<span class="muted">${esc(f.evidenceNote)}</span>` : ''}</span></div>
${drift}
</div></details>`;
}

export function listHtml(fams, state = {}) {
  if (!fams.length) return '<p class="muted" style="margin:8px 0">No family matches. Clear a filter or widen the search.</p>';
  const out = [];
  for (const g of GROUPS) {
    const rows = fams.filter(f => f.group === g.id);
    if (!rows.length) continue;
    out.push(`<div class="sec tt-sec"><h2>${esc(g.label)}</h2><span class="lbl">${esc(g.blurb)} · ${rows.length}</span></div>${rows.map(f => rowHtml(f)).join('')}`);
  }
  return out.join('');
}

export function headerHtml(fams = FAMILIES, derived = DERIVED) {
  const c = counts(fams);
  return `<div class="tt-head"><span class="lbl">Info map</span><h2 style="flex-basis:100%">What the repo holds, and what the terminal draws</h2><span class="r"><span class="chip">${c.total} families</span><span class="chip" title="Derived from the repo by scripts/build_info_map.mjs">derived ${esc(derived?.generatedAt ?? 'never')}</span><span class="chip" title="Last time every family was re-traced against the code (js/infoMap.js INFO_MAP_REVIEWED)">reviewed ${esc(INFO_MAP_REVIEWED)}</span></span></div>
<div class="tt-counts">${STATUS_ORDER.map(k => `<span class="vchip ${STATUS_CLS[k]}" title="${esc(STATUSES[k].blurb)}">${esc(STATUSES[k].label)} ${c.status[k] ?? 0}</span>`).join('')}${c.flagged ? `<span class="chip gold">${c.flagged} stale or doubtful</span>` : ''}</div>`;
}

const NOTE = 'Status was traced by reading the code, not by matching names; the name-match line shows a feed is mentioned in code, not that its numbers change a score or a sentence. Backtests, bots, systems and the per-asset jump layer are left out. Evidence: ranges and timing validate, direction claims do not, so a null or underpowered entry means context only. For the live feed catalogue with last-updated times, open the Data Map in the Command Hub (js/dataMap.js); this tab is about information families and what the terminal draws. Rebuild the derived columns with node scripts/build_info_map.mjs.';

/** mount into the tab's section; state lives on the element's dataset-free closure */
export function mount(root, { openTab = id => document.querySelector(`#tabs [data-t="${id}"]`)?.click() } = {}) {
  if (!root) return;
  const st = { status: '', group: '', flag: false, recent: false, q: '' };
  // the map first; the ~40 preview switches, the build version and CI sit below it, folded (review 2026-11-27: the map was ~4,000px down)
  root.innerHTML = `<div class="card glow">${headerHtml()}${staleHtml()}<div id="im-f"></div><div id="im-n" class="muted" style="margin-bottom:4px"></div><div id="im-list"></div><p class="tt-note">${esc(NOTE)}</p></div>
<details class="card" style="margin-top:14px"><summary class="lbl" style="cursor:pointer">Preview switches, build version and CI</summary><div id="im-ver" class="muted" style="font-size:12px;margin:8px 2px"></div><div id="im-ci" class="muted" style="font-size:12px;margin:2px 2px 8px"></div><div id="im-sw"></div></details>`;
  import('./previewSwitches.js').then(m => m.mountSwitches(root.querySelector('#im-sw'))).catch(() => { /* a convenience: the Info map works without it */ });
  import('./buildVersion.js').then(m => m.mountVersion(root.querySelector('#im-ver'))).catch(() => { /* a convenience */ });
  import('./ciStatus.js').then(m => m.mountCiStatus(root.querySelector('#im-ci'))).catch(() => { /* owner-only convenience: a desk login gets a 403 and sees nothing */ });
  const f = root.querySelector('#im-f'), list = root.querySelector('#im-list'), n = root.querySelector('#im-n');
  const draw = (filters = false) => {
    if (filters) f.innerHTML = filtersHtml(st);
    const xs = filterFamilies(FAMILIES, st);
    list.innerHTML = listHtml(xs, st);
    n.textContent = `${xs.length} of ${FAMILIES.length} families`;
  };
  f.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.imStatus !== undefined) st.status = st.status === b.dataset.imStatus ? '' : b.dataset.imStatus;
    else if (b.dataset.imGroup !== undefined) st.group = st.group === b.dataset.imGroup ? '' : b.dataset.imGroup;
    else return;
    draw(true);
  });
  f.addEventListener('change', e => { if (e.target.matches('[data-im-flag]')) { st.flag = e.target.checked; draw(); } else if (e.target.matches('[data-im-recent]')) { st.recent = e.target.checked; draw(); } });
  f.addEventListener('input', e => { if (e.target.matches('[data-im-q]')) { st.q = e.target.value; draw(); } });
  list.addEventListener('click', e => { const a = e.target.closest('[data-im-tab]'); if (!a) return; e.preventDefault(); openTab(a.dataset.imTab); window.scrollTo?.({ top: 0 }); });
  draw(true);
}
