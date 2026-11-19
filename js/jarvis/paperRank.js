// js/jarvis/paperRank.js: pure helpers for the Jarvis PAPERS panel. A small BM25 index over the paper library (term frequencies only, no full texts kept)
// and a keyword matcher over the Evidence Book. DESCRIPTION ONLY: it names papers and our own recorded verdicts; it never forecasts.
const STOP = new Set(('a an and are as at be but by for from has have in into is it its of on or that the their this to was were which with we our not no than then these those can may also ' +
  'using use used based study paper evidence results result analysis market markets').split(' '));

/** Light stemmer: plural/-ing/-ed/-ly endings only, never below 3 characters. */
export function stem(w) {
  for (const [suf, rep] of [['ies', 'y'], ['ing', ''], ['ed', ''], ['ly', ''], ['es', ''], ['s', '']]) {
    if (w.length - suf.length >= 3 && w.endsWith(suf) && !(suf === 's' && w.endsWith('ss'))) return w.slice(0, -suf.length) + rep;
  }
  return w;
}
export function tokenize(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w)).map(stem);
}
const textOfPaper = p => [p.title, p.title, p.abstract, p.summary, ...(Array.isArray(p.tags) ? p.tags.map(t => t?.key ?? t) : []), p.lens,
  p.notes && typeof p.notes === 'object' ? Object.values(p.notes).filter(v => typeof v === 'string').join(' ') : p.notes].filter(Boolean).join(' ');

/** Build the index. Per document only term counts + a light card; capped at maxDocs and maxTermsPerDoc to bound memory. */
export function buildIndex(papers, { maxDocs = 3000, maxTermsPerDoc = 120 } = {}) {
  const docs = [], df = new Map();
  for (const p of (papers ?? []).slice(0, maxDocs)) {
    if (!p?.id || !p.title) continue;
    const tf = new Map(); for (const t of tokenize(textOfPaper(p))) tf.set(t, (tf.get(t) ?? 0) + 1);
    const kept = [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTermsPerDoc);
    const len = kept.reduce((s, [, c]) => s + c, 0) || 1;
    for (const [t] of kept) df.set(t, (df.get(t) ?? 0) + 1);
    const tags = (Array.isArray(p.tags) ? p.tags.map(t => String(t?.key ?? t)) : []).slice(0, 6);
    docs.push({ id: String(p.id), title: String(p.title).slice(0, 200), year: p.year ?? null, venue: p.venue ? String(p.venue).slice(0, 80) : null, url: p.url ?? null, tags, lens: p.lens ? String(p.lens).slice(0, 40) : null, tf: new Map(kept), len });
  }
  const avg = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1) || 1;
  return { docs, df, avg, n: docs.length };
}

/** BM25 search. Returns [{...card, score, why:[matched query terms]}] best first; zero-score papers are never returned. */
export function search(index, query, limit = 8, { k1 = 1.4, b = 0.75 } = {}) {
  const q = [...new Set(tokenize(query))]; if (!q.length || !index?.n) return [];
  const out = [];
  for (const d of index.docs) {
    let score = 0; const why = [];
    for (const t of q) {
      const f = d.tf.get(t); if (!f) continue;
      const n = index.df.get(t) ?? 0, idf = Math.log(1 + (index.n - n + 0.5) / (n + 0.5));
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avg)); why.push(t);
    }
    if (score > 0) out.push({ id: d.id, title: d.title, year: d.year, venue: d.venue, url: d.url, score: Math.round(score * 100) / 100, why, tags: d.tags, lens: d.lens });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, limit | 0 || 8)));
}

/** Evidence Book entries whose id/claim/domain/instruments overlap the query. Verdict words are copied verbatim, never upgraded. */
export function matchEvidence(list, query, limit = 6) {
  const q = new Set(tokenize(query)); if (!q.size) return [];
  const out = [];
  for (const e of list ?? []) {
    if (!e?.claim) continue;
    const terms = new Set(tokenize([e.id, e.claim, e.domain, ...(e.instruments ?? []), ...(e.tags ?? [])].join(' ')));
    const hit = [...q].filter(t => terms.has(t)); if (!hit.length) continue;
    out.push({ id: e.id, claim: String(e.claim).slice(0, 300), verdict: e.verdict, source: e.doc ?? null, n: hit.length, hit });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, limit).map(({ n, hit, ...r }) => ({ ...r, matched: hit }));
}
