// Paper Library: pure view-model helpers (no DOM, no network).   node js/library/model.test.mjs

/** Badge for a paper card: read by the desk / PDF only / abstract only. */
export function statusOf(p) {
  if (p && p.notes && (p.notes.claim || p.notes.mechanism || p.notes.method)) return { key: 'desk', label: 'read by desk' };
  if (p && (p.hasPdf || p.hasText)) return { key: 'pdf', label: 'PDF only' };
  return { key: 'abstract', label: 'abstract only' };
}

/** SVG ring geometry for a read-% ring. */
export function ringGeom(pct, r = 11) {
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(100, pct)) / 100;
  return { r, c, dash: +(c * f).toFixed(2), gap: +(c * (1 - f)).toFixed(2) };
}

export function authorsLine(p, max = 3) {
  const a = Array.isArray(p.authors) ? p.authors : (p.authors ? String(p.authors).split(/\s*[;,]\s*/) : []);
  if (!a.length) return '';
  return a.length > max ? a.slice(0, max).join(', ') + ' et al.' : a.join(', ');
}

export function toggleTag(sel, key) {
  return sel.includes(key) ? sel.filter(k => k !== key) : sel.concat(key);
}

/** Papers matching any selected tag (none selected = all); hitIds narrows to search hits. */
export function filterPapers(papers, selected, hitIds) {
  return papers.filter(p => {
    if (hitIds && !hitIds.has(p.id)) return false;
    if (!selected.length) return true;
    const keys = new Set((p.tags || []).map(t => t.key));
    return selected.some(k => keys.has(k));
  });
}

export function orderPapers(papers, hits) {
  if (hits) {
    const rank = new Map(hits.map((h, i) => [h.id, i]));
    return papers.slice().sort((a, b) => rank.get(a.id) - rank.get(b.id));
  }
  return papers.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title)));
}

/** Chip counts follow the papers currently in scope (search hits), so a chip never promises papers that are not there. */
export function chipCounts(topics, papers) {
  const n = new Map();
  for (const p of papers) for (const t of p.tags || []) n.set(t.key, (n.get(t.key) || 0) + 1);
  return topics.map(t => ({ key: t.key, label: t.label, count: n.get(t.key) || 0 }));
}

export function readNextPapers(papers, rn) {
  if (!rn || !Array.isArray(rn.ids)) return [];
  const byId = new Map(papers.map(p => [p.id, p]));
  return rn.ids.map(id => byId.get(id) && { paper: byId.get(id), why: (rn.why || {})[id] || '' }).filter(Boolean);
}

export function formatSecs(s) {
  s = Math.max(0, Math.round(s || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function debounce(fn, ms, timers = { set: (f, m) => setTimeout(f, m), clear: id => clearTimeout(id) }) {
  let t = null;
  const d = (...a) => { if (t != null) timers.clear(t); t = timers.set(() => { t = null; fn(...a); }, ms); };
  d.cancel = () => { if (t != null) { timers.clear(t); t = null; } };
  return d;
}

export const NOTE_FIELDS = [
  ['claim', 'Claim'], ['mechanism', 'Mechanism'], ['method', 'Method'], ['effect', 'Effect'],
  ['outOfSample', 'Out of sample'], ['caveats', 'Caveats'], ['testHere', 'Test here'],
];
export function noteRows(notes) {
  if (!notes) return [];
  return NOTE_FIELDS.filter(([k]) => notes[k] && String(notes[k]).trim()).map(([k, label]) => ({ key: k, label, text: String(notes[k]).trim() }));
}

/** Theory Lab lesson links by topic (plan examples; the server owns the test that these files exist). */
export const LESSONS_BY_TAG = {
  brownian: ['ito-lemma', 'fractional-brownian-motion', 'girsanov-risk-neutral'],
  jump: ['institutional-jump-detection-tests', 'institutional-bates-model'],
  volatility: ['garch-volatility', 'institutional-har-rv', 'heston-model'],
};
export function lessonLinks(tags, map = LESSONS_BY_TAG) {
  const out = [], seen = new Set();
  for (const t of tags || []) {
    const hay = (t.key + ' ' + (t.label || '')).toLowerCase();
    for (const k of Object.keys(map)) {
      if (!hay.includes(k)) continue;
      for (const slug of map[k]) if (!seen.has(slug)) { seen.add(slug); out.push({ slug, href: '/theory-lab/lessons/' + slug + '.html', label: slug.replace(/^institutional-/, '').replace(/-/g, ' ') }); }
    }
  }
  return out;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
