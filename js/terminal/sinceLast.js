/**
 * "Since you last looked" (Desk Terminal, preview): a card at the top of the Changed tab that compares the terminal's saved snapshots at the owner's last visit (kept in this browser) or
 * one hour, four hours or a day ago with the latest, and lists what moved as ranked plain sentences (js/sinceLastCore.js), with the releases that printed in between and the move in the
 * 30 minutes after them. It describes changes; it never says what they mean for direction. Mounted by terminalFeel.js only when the registry says the session may see
 * `panel.changed.since` (the owner always; a desk login only when switched on). SINCE [1h|4h|24h|last] on the command line opens it.
 */
import { FIELDS, pickPoint, ranges, compare, rank, printedBetween, spanText, quietText } from '../sinceLastCore.js';

const KEY = 'deskLastLook:v1';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const J = async u => { const r = await fetch(u, { credentials: 'same-origin' }); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const KIND = { release: 'release', stress: 'stress', risk: 'risk flag', strength: 'strength', fed: 'Fed path', regime: 'regime', cb: 'central bank', curve: 'curve', vol: 'vol', termprem: 'term prem.', market: 'market', feed: 'data' };

export const readLastLook = (store = globalThis.localStorage) => { try { const v = Number(store?.getItem(KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } };
export const writeLastLook = (ms, store = globalThis.localStorage) => { try { store?.setItem(KEY, String(ms)); } catch { /* none */ } };

const q = (from, to, step, fields = FIELDS) => `/api/desk-snapshots?fields=${fields.join(',')}&step=${step}&max=24&from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`;

/** The snapshot point in force at `ts` ({ point, early, n }), or the latest one when `latest`. null when no snapshot is held. */
export async function pointAt(ts, { latest = false, fetchJson = J } = {}) {
  if (latest) { const j = await fetchJson(q(ts - 40 * 60e3, ts + 5 * 60e3, 5)); const p = (j.points ?? []).filter(x => x.d).sort((a, b) => a.ts - b.ts); return p.length ? { point: p.at(-1), early: false, n: p.length } : null; }
  let j = await fetchJson(q(ts - 90 * 60e3, ts + 5 * 60e3, 5)), pk = pickPoint(j.points, ts);
  if (!pk || pk.early) { j = await fetchJson(q(ts, ts + 12 * 3600e3, 30)); pk = pickPoint(j.points, ts) ?? pk; }
  return pk ? { ...pk, n: (j.points ?? []).length } : null;
}

/** Everything the card needs for one range: the two points, the ranked items and the honest sentences. `rows` are Release Reaction rows (or []). */
export async function build(range, now, { fetchJson = J, rows = [] } = {}) {
  const [A, B] = await Promise.all([pointAt(range.from, { fetchJson }), pointAt(now, { latest: true, fetchJson })]);
  if (!A || !B) return { ok: false, why: 'No saved snapshots were found for that span. The record only begins on 14 Nov 2026.' };
  if (A.point.ts >= B.point.ts) return { ok: false, why: 'The saved record has no earlier point than the latest, so there is nothing to compare yet.' };
  const printed = printedBetween(rows, A.point.ts, B.point.ts), items = rank(compare(A.point, B.point, { printed, rows }));
  let span = null;
  try { const j = await fetchJson(q(A.point.ts, B.point.ts, Math.max(5, Math.round((B.point.ts - A.point.ts) / 60e3 / 40)), ['stress'])); span = (j.points ?? []).length; } catch { /* the count is optional */ }
  return { ok: true, a: A.point, b: B.point, early: A.early, items, span: spanText(A.point, B.point, A.early, span ?? 2), quiet: items.length ? '' : quietText(A.point, B.point) };
}

export function cardHtml(state) {
  const pills = (state.ranges ?? []).map(r => `<button type="button" class="btn" data-sl-r="${esc(r.id)}" aria-pressed="${r.id === state.range}">${esc(r.label)}</button>`).join('');
  const list = x => `<li class="${x.kind === 'release' ? 'sl-rel' : ''}"><span class="sl-k">${esc(KIND[x.kind] ?? x.kind)}</span><span class="sl-t"><b>${esc(x.title)}</b>${x.detail ? `<br><span class="sl-d">${esc(x.detail)}</span>` : ''}</span></li>`;
  const body = state.loading ? '<p class="muted">Comparing the saved snapshots…</p>' : state.error ? `<p class="muted">${esc(state.error)}</p>`
    : !state.res ? '' : !state.res.ok ? `<p class="muted">${esc(state.res.why)}</p>`
      : `${state.res.items.length ? `<ul class="sl-list">${state.res.items.map(list).join('')}</ul>` : `<p class="muted">${esc(state.res.quiet)}</p>`}<p class="sl-span">${esc(state.res.span)}</p>`;
  return `<div class="card glow sl-card" data-sl-card data-noexport data-surface="panel.changed.since"><div class="tt-head"><span class="lbl">Since you last looked</span><h2 style="flex-basis:100%">What moved in the terminal, ranked</h2></div>
<div class="sl-pills" role="group" aria-label="Compare with">${pills}</div>${body}<p class="tt-note">Description of changes between saved snapshots of the terminal, not a signal: none of these changes has a validated meaning for direction. Releases show the size of the move in the 30 minutes after them, against the typical size for that kind.</p></div>`;
}

export function mountSinceLast({ doc = document, win = window, fetchJson = J, now = () => Date.now(), store = win.localStorage } = {}) {
  if (!doc.body || doc.body.dataset?.slMounted) return null;
  if (doc.body.dataset) doc.body.dataset.slMounted = '1';
  // the morning range starts at the book's own publication time (the page sets deskBookAt once the desk run has loaded)
  const bookAt = () => { const v = Date.parse(win.deskBookAt?.() ?? ''); return Number.isFinite(v) ? v : null; };
  const lastLook = readLastLook(store), st = { ranges: ranges(now(), lastLook, bookAt()), range: null, res: null, loading: false, error: null }; st.range = st.ranges[0].id;
  const stamp = () => writeLastLook(now(), store);
  win.addEventListener?.('pagehide', stamp); doc.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'hidden') stamp(); });
  let rows = null;
  const paint = () => { const h = doc.querySelector('[data-sl-card]'); if (h) h.outerHTML = cardHtml(st); };
  async function run(id) {
    st.range = id; st.loading = true; st.error = null; paint();
    try {
      if (!rows) rows = (await fetchJson('/api/release-layer1').catch(() => ({ rows: [] }))).rows ?? [];
      st.res = await build(st.ranges.find(r => r.id === id) ?? st.ranges[0], now(), { fetchJson, rows });
    } catch (e) { st.error = `The comparison could not be made: ${e.message}`; }
    st.loading = false; paint();
  }
  function decorate() {
    const root = doc.getElementById('changed'); if (!root || root.hidden || root.querySelector('[data-sl-card]')) return;
    if (!st.res) { const r = ranges(now(), lastLook, bookAt()); if (r.some(x => x.id === st.range)) st.ranges = r; }
    root.insertAdjacentHTML('afterbegin', cardHtml({ ...st, loading: !st.res && !st.error }));
    if (!st.res && !st.error && !st.loading) run(st.range);
  }
  let sched = false; const schedule = () => { if (!sched) { sched = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(() => { sched = false; decorate(); }); } };
  const root0 = doc.getElementById('changed'), obs = win.MutationObserver ? new win.MutationObserver(schedule) : null; obs?.observe?.(root0 ?? doc.body, { childList: true, attributes: !!root0, attributeFilter: ['hidden'] });
  const onClick = e => { const b = e.target.closest?.('[data-sl-r]'); if (b) run(b.dataset.slR); };
  doc.addEventListener('click', onClick);
  decorate();
  win.deskSince = { open: (range = null) => { const id = range && st.ranges.some(r => r.id === range) ? range : st.range; doc.querySelector('button[data-t="changed"]')?.click?.(); win.setTimeout?.(() => run(id), 500); return true; }, ranges: () => st.ranges.map(r => r.id) };
  return { decorate, run, destroy() { obs?.disconnect?.(); doc.removeEventListener('click', onClick); doc.querySelectorAll('[data-sl-card]').forEach(c => c.remove()); delete win.deskSince; delete doc.body.dataset?.slMounted; } };
}
