/**
 * The research lab's quick test in the Desk Office (desk-office.html, Research tab): the free-form form, the result
 * card and the list, plus `mount`, which wires them to /api/research-pod/quick-test. The HTML builders are pure (tested
 * in js/quickTestView.test.mjs); `mount` and `openFor` touch the DOM.
 *
 * Every result is labelled EXPLORATORY: a quick test never writes to the Evidence Book. Banking stays a human step
 * (register row, prereg on fresh data, the research-protocol skill).
 */
import { suggestSpec } from './quickTest.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const VCLS = { VALIDATED: 'ok', NULL: 'bad', UNDERPOWERED: 'warn', CONTEXT: '' };
const SRC = { oanda: 'Prices (OANDA daily)', fred: 'FRED series', yield: 'Government yields (issuers)' };

export const verdictChip = v => `<span class="chip ${VCLS[v] ?? ''}">${esc(v ?? '–')} · exploratory</span>`;
const labelOf = (cat, id) => cat.find(c => c.id === id)?.label ?? id ?? '–';

function options(cat, sel) {
  const groups = {}; for (const c of cat) (groups[c.id.split(':')[0]] ??= []).push(c);
  return Object.entries(groups).map(([g, cs]) => `<optgroup label="${esc(SRC[g] ?? g)}">${cs.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</optgroup>`).join('');
}

/** The form. meta: GET /api/research-pod/quick-test; pre: { x, y, horizons, xTransform, condition, proposalId, proposalTitle }. */
export function formHtml(meta, pre = {}) {
  const cat = meta?.catalogue ?? [], hz = new Set(pre.horizons ?? [1, 5, 20]), inp = 'background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:5px;padding:5px;font:13px inherit;max-width:100%';
  return `<div class="qt-form" style="display:grid;gap:8px">
${pre.proposalId ? `<p style="margin:0">For proposal <b>${esc(pre.proposalTitle ?? pre.proposalId)}</b> <span class="muted">(suggested from its universe and signal: check both)</span><input type="hidden" id="qt-prop" value="${esc(pre.proposalId)}"></p>` : '<input type="hidden" id="qt-prop" value="">'}
<label>X (the leader) <select id="qt-x" style="${inp}"><option value="">choose…</option>${options(cat, pre.x)}</select></label>
<label>as <select id="qt-xt" style="${inp}">${Object.entries(meta?.transforms ?? {}).map(([k, l]) => `<option value="${k}"${k === (pre.xTransform ?? 'chg5') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
<label>Y (the follower: its change from the day after) <select id="qt-y" style="${inp}"><option value="">choose…</option><option value="__own__"${pre.y && pre.y === pre.x ? ' selected' : ''}>X's own later move (own past: momentum or mean reversion)</option>${options(cat, pre.y && pre.y === pre.x ? null : pre.y)}</select></label>
<div>Horizons (days, up to four) ${(meta?.horizons ?? []).map(h => `<label style="margin-right:8px"><input type="checkbox" class="qt-h" value="${h}"${hz.has(h) ? ' checked' : ''}> ${h}</label>`).join('')}</div>
<details${pre.condition ? ' open' : ''}><summary class="muted">Only when a condition holds (optional)</summary><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
<select id="qt-c" style="${inp}"><option value="">no condition</option>${options(cat, pre.condition?.series)}</select>
<select id="qt-cop" style="${inp}"><option value="above"${pre.condition?.op !== 'below' ? ' selected' : ''}>above</option><option value="below"${pre.condition?.op === 'below' ? ' selected' : ''}>below</option></select>
<label>its own <input id="qt-cpct" type="number" min="5" max="95" step="5" value="${esc(pre.condition?.pct ?? 50)}" style="${inp};width:64px">th percentile (walk-forward)</label></div></details>
<div><button class="btn" id="qt-run"${meta?.running ? ' disabled' : ''}>${meta?.running ? 'A test is running…' : 'Run the quick test'}</button> <span class="muted" id="qt-msg">${esc(meta?.label ?? '')}</span></div></div>`;
}

/** Read the form back into a request body (DOM). */
export function readForm(root) {
  const v = id => root.querySelector(`#${id}`)?.value ?? '';
  const body = { x: v('qt-x'), y: v('qt-y') === '__own__' ? v('qt-x') : v('qt-y'), xTransform: v('qt-xt'), horizons: [...root.querySelectorAll('.qt-h:checked')].map(b => Number(b.value)) };
  if (v('qt-c')) body.condition = { series: v('qt-c'), op: v('qt-cop'), pct: Number(v('qt-cpct')) };
  if (v('qt-prop')) body.proposalId = v('qt-prop');
  return body;
}

/** Lead/lag as a row of bars from −10 to +10 (positive k = X leads). */
export function leadLagSvg(ll, w = 320, h = 70) {
  const L = ll?.lags ?? []; if (!L.length) return '';
  const m = Math.max(0.05, ...L.map(l => Math.abs(l.r ?? 0)), ll.band ?? 0), bw = w / L.length, mid = h / 2, y = v => (v / m) * (h / 2 - 4);
  const bars = L.map((l, i) => { const v = l.r ?? 0, hh = Math.abs(y(v)); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(v >= 0 ? mid - hh : mid).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${hh.toFixed(1)}" fill="${l.k > 0 ? 'var(--acc, #5b9dff)' : 'var(--tx3, #888)'}"><title>k ${l.k}: r ${l.r}</title></rect>`; }).join('');
  const band = fin(ll.band) ? `<line x1="0" x2="${w}" y1="${(mid - y(ll.band)).toFixed(1)}" y2="${(mid - y(ll.band)).toFixed(1)}" stroke="var(--line2, #555)" stroke-dasharray="3 3"/><line x1="0" x2="${w}" y1="${(mid + y(ll.band)).toFixed(1)}" y2="${(mid + y(ll.band)).toFixed(1)}" stroke="var(--line2, #555)" stroke-dasharray="3 3"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="lead-lag correlations">${band}<line x1="0" x2="${w}" y1="${mid}" y2="${mid}" stroke="var(--line2, #555)"/>${bars}</svg>`;
}

/** One result in full. */
export function resultHtml(t, cat = []) {
  if (!t) return '';
  if (t.ok === false) return `<p class="muted">${esc(t.error ?? 'failed')}</p>`;
  const s = t.spec ?? {}, q = t.quality ?? {};
  const qrow = (k, x) => `<tr><td>${k}</td><td>${esc(labelOf(cat, k === 'X' ? s.x : s.y))}</td><td class="n">${x?.n ?? '–'}</td><td>${esc(x?.from ?? '')} → ${esc(x?.to ?? '')}</td><td class="n">${fin(x?.coverage) ? Math.round(x.coverage * 100) + '%' : '–'}</td><td class="n">${x?.maxGapDays ?? '–'}d</td><td class="n">${x?.staleRuns ?? '–'}</td><td class="n">${x?.live?.daysSinceLast ?? '–'}d</td></tr>`;
  const rows = (t.horizons ?? []).map(c => `<tr><td class="n">${c.h}d</td><td class="n">${c.is?.n ?? '–'}</td><td class="n">${sg(c.is?.d)}</td><td class="n">${c.oos?.n ?? '–'}</td><td class="n"><b>${sg(c.oos?.d)}</b> <span class="muted">[${sg(c.oos?.lo)}, ${sg(c.oos?.hi)}]</span></td><td class="n">${c.oos?.mde ?? '–'}</td><td class="n">${sg(c.oos?.top?.mean, 3)} / ${sg(c.oos?.bottom?.mean, 3)} / ${sg(c.oos?.all?.mean, 3)}</td><td class="n">${c.holmP ?? '–'}</td><td>${verdictChip(c.verdict).replace(' · exploratory', '')}${c.oos?.error ? ` <span class="muted">${esc(c.oos.error)}</span>` : ''}</td></tr>`).join('');
  return `<div class="qt-result" style="border-left:3px solid var(--line2);padding:6px 10px;margin:8px 0">
<p style="margin:0 0 4px"><b>${esc(labelOf(cat, s.x))}</b> (${esc(s.xTransform)}) → ${s.x === s.y ? '<b>its own later move</b> <span class="muted">(own past)</span>' : `<b>${esc(labelOf(cat, s.y))}</b>`}${s.condition ? ` · only when ${esc(labelOf(cat, s.condition.series))} is ${esc(s.condition.op)} its ${s.condition.pct}th percentile` : ''} ${verdictChip(t.verdict)}</p>
<p style="margin:2px 0">${esc(t.why)}</p>
<p class="muted" style="margin:2px 0">${esc(t.label)} Data to ${esc(t.lockboxEnd)} only (${(t.lockboxDropped?.x ?? 0) + (t.lockboxDropped?.y ?? 0)} later prints held back as the lockbox). Run ${esc(String(t.ranAt ?? '').slice(0, 16).replace('T', ' '))}, seed ${t.seed}, B ${t.nBoot}.</p>
<details><summary class="muted">Data quality, lead/lag and every horizon</summary>
<table><thead><tr><th></th><th>Series</th><th class="n">Days</th><th>Span</th><th class="n">Coverage</th><th class="n">Longest gap</th><th class="n">Stale runs</th><th class="n">Since last print</th></tr></thead><tbody>${qrow('X', q.x)}${qrow('Y', q.y)}</tbody></table>
<p class="muted">Overlap ${q.overlapDays ?? '–'} days.</p>
${t.leadLag ? `<div>${leadLagSvg(t.leadLag)}<div class="muted" style="font-size:11px">correlation of X with Y's daily change k days later, k = −10 … +10 (blue: X first); dashed = ±${t.leadLag.band}; peak k ${t.leadLag.peak?.k} (r ${t.leadLag.peak?.r}); same day r ${t.leadLag.sameDay?.r}${t.ownPast ? ' (own past: k ≤ 0 is the series against itself, read k ≥ 1 only)' : ''}</div></div>` : ''}
${rows ? `<div class="scroll"><table><thead><tr><th class="n">h</th><th class="n">IS n</th><th class="n">IS d</th><th class="n">OOS n</th><th class="n">OOS d [95%]</th><th class="n">MDE</th><th class="n">top / bottom / all</th><th class="n">Holm p</th><th>Cell</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted" style="font-size:12px">d = (Y's mean change after X's top quintile − after its bottom quintile) ÷ the SD of Y's change, quintiles from each day's past only; the first 60% of days found it (IS), the last 40% tested it (OOS). A cell passes at Holm p &lt; 0.05, |d| ≥ 0.20 and the same sign in both. MDE = the smallest d this data could have found.</p>` : ''}</details></div>`;
}

/** The stored tests, newest first. */
export function listHtml(tests, cat = []) {
  if (!tests?.length) return '<p class="muted">No quick tests yet.</p>';
  return `<table><thead><tr><th>When</th><th>X → Y</th><th>Horizons</th><th>Verdict</th><th>Proposal</th><th></th></tr></thead><tbody>${tests.map(t => `<tr><td class="muted">${esc(String(t.at ?? '').slice(0, 10))}</td><td>${esc(labelOf(cat, t.x))} → ${esc(labelOf(cat, t.y))}${t.condition ? ' <span class="muted">(conditional)</span>' : ''}</td><td>${esc((t.horizons ?? []).join(', '))}</td><td>${verdictChip(t.verdict)}</td><td class="muted">${esc((t.proposalIds ?? []).join(', '))}</td><td><a href="#" data-qtopen="${esc(t.id)}">open</a></td></tr>`).join('')}</tbody></table>`;
}

/** The chips under a proposal card: its linked quick tests. */
export const linkedChips = (tests, proposalId) => (tests ?? []).filter(t => (t.proposalIds ?? []).includes(proposalId)).map(t => `<a href="#" data-qtopen="${esc(t.id)}" style="text-decoration:none">${verdictChip(t.verdict)}</a>`).join(' ');

// ── DOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const S = { el: null, meta: null, getJson: null };
async function refresh(pre) {
  S.meta = await S.getJson('/api/research-pod/quick-test');
  if (!S.el) return;
  if (!S.meta?.ok) { S.el.innerHTML = `<h2>Quick test</h2><p class="muted">${esc(S.meta?.error ?? 'not available')}</p>`; return; }
  S.el.innerHTML = `<h2>Quick test <i>does X lead Y? a standard first look, exploratory, never banked</i></h2>${formHtml(S.meta, pre)}<div id="qt-out"></div><h3 style="font-size:14px;margin:14px 0 6px">Tests run</h3><div id="qt-list">${listHtml(S.meta.tests, S.meta.catalogue)}</div>`;
  wire();
}
async function show(id) {
  const out = S.el?.querySelector('#qt-out'); if (!out) return;
  out.innerHTML = '<p class="muted">Loading…</p>';
  const r = await S.getJson(`/api/research-pod/quick-test?id=${encodeURIComponent(id)}`);
  out.innerHTML = r?.ok ? resultHtml(r.test, S.meta?.catalogue) : `<p class="muted">${esc(r?.error ?? 'not found')}</p>`;
  out.querySelector('details')?.setAttribute('open', '');
}
function wire() {
  const run = S.el.querySelector('#qt-run');
  if (run) run.onclick = async () => {
    const body = readForm(S.el), msg = S.el.querySelector('#qt-msg');
    if (!body.x || !body.y) { msg.textContent = 'Choose X and Y.'; return; }
    run.disabled = true; run.textContent = 'Running (loads the series, ~5-20 s)…';
    const r = await S.getJson('/api/research-pod/quick-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    run.disabled = false; run.textContent = 'Run the quick test';
    const out = S.el.querySelector('#qt-out');
    if (!r?.ok) { out.innerHTML = `<p class="muted">${esc(r?.error ?? 'failed')}</p>`; return; }
    out.innerHTML = (r.cached ? '<p class="muted">Already run with these settings: the stored result (linked to this proposal).</p>' : '') + resultHtml(r.test, S.meta?.catalogue);
    const m = await S.getJson('/api/research-pod/quick-test'); if (m?.ok) { S.meta = m; S.el.querySelector('#qt-list').innerHTML = listHtml(m.tests, m.catalogue); wireOpen(S.el); }
    S.onChange?.();
  };
  wireOpen(S.el);
}
/** Make every [data-qtopen] link inside `root` open that test in the panel. */
export function wireOpen(root) { root?.querySelectorAll?.('[data-qtopen]').forEach(a => (a.onclick = e => { e.preventDefault(); S.el?.scrollIntoView?.({ behavior: 'smooth' }); show(a.dataset.qtopen); })); }
/** Mount the panel into `el`. */
export async function mount(el, { getJson, onChange } = {}) { S.el = el; S.getJson = getJson; S.onChange = onChange; await refresh(); return S.meta; }
/** Open the form prefilled for a research-pod proposal (or a research case's plan: its `quickTest`, when given, is used as it is). */
export async function openFor(p) {
  const g = { ...suggestSpec(p), ...(p.quickTest?.x && p.quickTest?.y ? p.quickTest : {}) }; await refresh({ ...g, proposalId: p.id, proposalTitle: p.title }); S.el?.scrollIntoView?.({ behavior: 'smooth' });
}
/** The stored tests (after mount). */
export const tests = () => S.meta?.tests ?? [];
