// Layer 2 of the library's equations: the exact LaTeX of a paper that is on arXiv, taken from arXiv's own HTML rendering
// (https://arxiv.org/html/<id>, else https://ar5iv.labs.arxiv.org/html/<id>), where every equation is a <math alttext="LaTeX">.
//
//   arxivIdOf(record)                    -> '2007.14874' | 'hep-th/9901001' | null     (record.arxiv, doi, url, upload file name)
//   parseArxivMath(html)                 -> [{ tag:'2.1'|null, tags:[...], latex, display:true, group:boolean, rows:[{ tag, latex }] }]
//   matchToBlocks(arxivEqs, pdfEqBlocks) -> Map(blockIndex -> latex)   (.info: Map(blockIndex -> { tag, sim, via:'label'|'order', source:'arxiv', conf:0.95 }))
//   fetchArxivMath(id, { fetch })        -> { ok, eqs, from, status }   polite: one request per paper, >= 3 s apart, generic User-Agent
//
// Matching only accepts what is confident: the same equation number with a similar set of symbols, or the same place in the
// document order with nearly the same symbols. Everything else stays with the rule-based or the model layer. No model, no secrets.

// ── the paper's arXiv id ────────────────────────────────────────────────────────────────────────────────────────
const NEW_ID = /(\d{4}\.\d{4,5})(?:v\d+)?/, OLD_ID = /([a-z]+(?:-[a-z]+)?(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/;
/** The arXiv id of a paper record: { arxiv?, doi?, url?, upload?:{ name }, uploadName?, ssrn? }. Version suffixes are dropped. */
export function arxivIdOf(rec) {
  try {
    const r = rec ?? {};
    const direct = String(r.arxiv ?? '').trim().replace(/^arxiv:/i, '');
    if (NEW_ID.test(direct) && direct.length <= 20) return direct.match(NEW_ID)[1];
    if (OLD_ID.test(direct)) return direct.match(OLD_ID)[1];
    const doi = String(r.doi ?? '');
    const dm = doi.match(/arxiv[.:/ ]+(?:abs\/)?(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})/i); if (dm) return dm[1];
    for (const u of [r.url, r.pdfUrl, ...(Array.isArray(r.urls) ? r.urls : [])]) {
      const m = String(u ?? '').match(/arxiv\.org\/(?:abs|pdf|html)\/([^?#\s]+?)(?:\.pdf)?(?:v\d+)?(?:[?#].*)?$/i);
      if (m) { const id = m[1].replace(/v\d+$/, ''); if (/^\d{4}\.\d{4,5}$/.test(id) || /^[a-z-]+(?:\.[A-Z]{2})?\/\d{7}$/.test(id)) return id; }
    }
    const name = String(r.uploadName ?? r.upload?.name ?? '').replace(/\.[a-z0-9]{2,4}$/i, '');
    if (name) {
      const a = name.match(/(?:^|[^\d.])(\d{4}\.\d{4,5})(?:v\d+)?(?:$|[^\d])/); if (a) return a[1];
      const o = name.match(/(?:^|[^a-z])([a-z]+(?:-[a-z]+)?)[_\-/ ](\d{7})(?:v\d+)?(?:$|[^\d])/i); if (o) return `${o[1]}/${o[2]}`;
    }
  } catch { /* none */ }
  return null;
}

// ── HTML -> equations ───────────────────────────────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch { return ''; } }
  return ENT[e.toLowerCase()] ?? m;
});
const stripTags = s => decode(String(s).replace(/<[^>]*>/g, ''));
/** LaTeXML alttext -> KaTeX-friendly LaTeX: style noise, labels and numbering switches removed. */
export function cleanLatex(s) {
  let t = decode(s).replace(/ /g, ' ');
  t = t.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b\s*/g, '').replace(/\\label\{[^}]*\}/g, '').replace(/\\(?:nonumber|notag)\b/g, '')
    .replace(/\\begin\{array\}\[[a-z]?\]/g, '\\begin{array}').replace(/\\(?:mbox|hbox)\b/g, '\\text').replace(/\\boldmath\b/g, '').replace(/\\bm\{/g, '\\boldsymbol{')
    .replace(/\\mathbbm\b/g, '\\mathbb').replace(/\\text\{\s*\}/g, '').replace(/\\@\w+/g, '').replace(/\\(?:hfill|hfil)\b/g, '')
    .replace(/\\\\\s*$/, '').replace(/&\s*$/, '');
  return t.replace(/\s+/g, ' ').trim();
}
const normTag = t => String(t ?? '').replace(/[()\s ]/g, '').replace(/^\.|\.$/g, '') || null;

function matchingTableEnd(html, from) {   // index just after the </table> that closes the table opened at `from`
  const re = /<(\/?)table\b/gi; re.lastIndex = from; let depth = 0, m;
  while ((m = re.exec(html))) { if (m[1]) { depth--; if (depth === 0) return html.indexOf('>', m.index) + 1; } else depth++; }
  return -1;
}
function rowsOf(table) {
  const out = [];
  for (const rm of table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    let row = rm[0];
    const tags = [];
    row = row.replace(/<span\b[^>]*\bltx_tag_equation\b[^>]*>([\s\S]*?)<\/span>\s*(?=<\/td>|$)/gi, (_m, inner) => { tags.push(stripTags(inner)); return ''; });
    if (!tags.length) row = row.replace(/<span\b[^>]*\bltx_tag_equation\b[^>]*>([\s\S]*?)<\/span>/gi, (_m, inner) => { tags.push(stripTags(inner)); return ''; });
    const cells = [];
    for (const cell of row.matchAll(/<td\b[\s\S]*?<\/td>/gi)) {
      const ms = [...cell[0].matchAll(/<math\b[^>]*?\balttext\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)];
      const latex = ms.map(m => cleanLatex(m[1] ?? m[2] ?? '')).filter(Boolean).join(' ');
      if (latex) cells.push(latex);
    }
    if (!cells.length) { const ms = [...row.matchAll(/<math\b[^>]*?\balttext\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]; for (const m of ms) { const l = cleanLatex(m[1] ?? m[2] ?? ''); if (l) cells.push(l); } }
    if (cells.length) out.push({ tag: normTag(tags[0]), cells });
  }
  return out;
}
/** Display equations of an arXiv / ar5iv HTML page, in document order. Never throws. */
export function parseArxivMath(html) {
  const eqs = [];
  try {
    const h = String(html ?? '');
    const re = /<table\b[^>]*\bclass\s*=\s*"[^"]*\bltx_(?:equation|equationgroup)\b[^"]*"[^>]*>/gi;
    let m;
    while ((m = re.exec(h))) {
      const end = matchingTableEnd(h, m.index); if (end < 0) break;
      const table = h.slice(m.index, end); re.lastIndex = end;
      const group = /\bltx_equationgroup\b/.test(m[0]);
      const rows = rowsOf(table); if (!rows.length) continue;
      const rowLatex = r => (r.cells.length === 1 ? r.cells[0] : (group || rows.length > 1 ? r.cells.join(' & ') : r.cells.join(' ')));
      const tags = rows.map(r => r.tag).filter(Boolean);
      if (rows.length === 1) {
        const l = rowLatex(rows[0]), tag = rows[0].tag;
        eqs.push({ tag, tags: tag ? [tag] : [], latex: tag ? `${l}\\tag{${tag}}` : l, display: true, group: false, rows: [{ tag, latex: l }] });
      } else {
        const inner = rows.map(rowLatex).join(' \\\\ ');
        const single = tags.length === 1 ? tags[0] : null;
        const needAlign = rows.some(r => r.cells.length > 1) || true;
        eqs.push({ tag: single ?? (tags[0] ?? null), tags, latex: `${needAlign ? `\\begin{aligned}${inner}\\end{aligned}` : inner}${single ? `\\tag{${single}}` : ''}`, display: true, group: true, rows: rows.map(r => ({ tag: r.tag, latex: rowLatex(r) })) });
      }
    }
  } catch { /* partial result */ }
  return eqs;
}

// ── matching ────────────────────────────────────────────────────────────────────────────────────────────────────
const GREEK = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ϑ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', µ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ϖ: 'pi', ρ: 'rho', ϱ: 'rho', σ: 'sigma', ς: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'gamma', Δ: 'delta', Θ: 'theta', Λ: 'lambda', Ξ: 'xi', Π: 'pi', Σ: 'sigma', Φ: 'phi', Ψ: 'psi', Ω: 'omega', '∑': 'sum', '∏': 'prod', '∫': 'int', '∂': 'partial', '∞': 'infty', '√': 'sqrt', '∇': 'nabla' };
const GREEK_CMD = { alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon', varepsilon: 'epsilon', zeta: 'zeta', eta: 'eta', theta: 'theta', vartheta: 'theta', iota: 'iota', kappa: 'kappa', lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi', pi: 'pi', varpi: 'pi', rho: 'rho', varrho: 'rho', sigma: 'sigma', varsigma: 'sigma', tau: 'tau', upsilon: 'upsilon', phi: 'phi', varphi: 'phi', chi: 'chi', psi: 'psi', omega: 'omega', Gamma: 'gamma', Delta: 'delta', Theta: 'theta', Lambda: 'lambda', Xi: 'xi', Pi: 'pi', Sigma: 'sigma', Phi: 'phi', Psi: 'psi', Omega: 'omega', sum: 'sum', prod: 'prod', int: 'int', partial: 'partial', infty: 'infty', sqrt: 'sqrt', nabla: 'nabla', exp: 'exp', log: 'log', ln: 'ln', sin: 'sin', cos: 'cos', max: 'max', min: 'min', lim: 'lim', sup: 'sup', inf: 'inf' };
/** A bag of letters, digits and named symbols: order-free, so stacked fractions and flattened scripts compare fairly. */
export function symbolBag(s, { latex = false } = {}) {
  let t = String(s ?? '');
  if (latex) t = t.replace(/\\tag\{[^}]*\}/g, ' ').replace(/\\([A-Za-z]+)/g, (m, c) => (GREEK_CMD[c] ? ` ${GREEK_CMD[c]} ` : ' ')).replace(/\\[^A-Za-z]/g, ' ');
  const names = [];
  t = Array.from(t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')).map(ch => (GREEK[ch] ? ` ${GREEK[ch]} ` : ch)).join('');
  t = t.replace(/\b(exp|log|ln|sin|cos|max|min|lim|sup|inf)\b/g, ' $1 ');
  const bag = new Map(), put = k => bag.set(k, (bag.get(k) ?? 0) + 1);
  for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue;
    if (GREEK_CMD[w] || ['sum', 'prod', 'int', 'partial', 'infty', 'sqrt', 'nabla'].includes(w)) { put(GREEK_CMD[w] ?? w); continue; }
    for (const ch of w) put(ch);   // letters and digits one by one: "dX(t)" and "d X ( t )" are the same
  }
  void names;
  return bag;
}
export function bagSim(a, b) {
  let na = 0, nb = 0, inter = 0;
  for (const v of a.values()) na += v; for (const v of b.values()) nb += v;
  if (!na || !nb) return 0;
  for (const [k, v] of a) inter += Math.min(v, b.get(k) ?? 0);
  return (2 * inter) / (na + nb);
}
const labelOf = l => normTag(l);

/**
 * Pairs arXiv equations with the PDF's equation blocks. Blocks: [{ i, label?, text, latex? }] in document order. Accepted:
 *   - the same equation number AND a similar symbol bag (>= 0.45), or
 *   - the same place in the document order (monotone alignment) AND nearly the same symbols (>= 0.82).
 * Returns Map(blockIndex -> latex); `.info` has { tag, sim, via, source:'arxiv', conf:0.95 } per block.
 */
export function matchToBlocks(arxivEqs, pdfEqBlocks, opts = {}) {
  const out = new Map(); out.info = new Map();
  try {
    const A = Array.isArray(arxivEqs) ? arxivEqs : [], B = Array.isArray(pdfEqBlocks) ? pdfEqBlocks : [];
    if (!A.length || !B.length) return out;
    const minLabel = opts.minLabelSim ?? 0.45, minOrder = opts.minOrderSim ?? 0.82;
    const aBag = A.map(e => symbolBag(e.latex, { latex: true }));
    const bBag = B.map(b => symbolBag(String(b.text ?? '').replace(/\(\s*[A-Za-z]?\.?\d{1,3}(?:\.\d{1,3})?[a-z]?\s*\)\s*$/, ''), {}));
    const sim = (i, j) => bagSim(aBag[i], bBag[j]);
    const tagHit = (e, b) => { const l = labelOf(b.label); return !!l && (e.tags ?? [e.tag]).some(t => t && t.toLowerCase() === l.toLowerCase()); };
    const score = (i, j) => { i = ai[i]; j = bj[j]; const s = sim(i, j), hit = tagHit(A[i], B[j]); if (hit && s >= minLabel) return 1 + s; if (s >= minOrder && !(labelOf(B[j].label) && (A[i].tags ?? []).length && !hit)) return s; return -1; };
    // 1. the same equation number, once on each side, with similar symbols: accepted wherever it stands in the order
    const tagCount = new Map(); for (const e of A) for (const t of new Set((e.tags ?? [e.tag]).filter(Boolean).map(x => x.toLowerCase()))) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    const labCount = new Map(); for (const b of B) { const l = labelOf(b.label)?.toLowerCase(); if (l) labCount.set(l, (labCount.get(l) ?? 0) + 1); }
    const doneA = new Set(), doneB = new Set();
    B.forEach((b, j) => {
      const l = labelOf(b.label)?.toLowerCase(); if (!l || labCount.get(l) !== 1 || tagCount.get(l) !== 1) return;
      const i = A.findIndex(e => (e.tags ?? [e.tag]).some(t => t && t.toLowerCase() === l)); if (i < 0) return;
      const s = sim(i, j); if (s < minLabel) return;
      out.set(b.i, A[i].latex); out.info.set(b.i, { tag: A[i].tag, sim: Math.round(s * 100) / 100, via: 'label', source: 'arxiv', conf: 0.95 }); doneA.add(i); doneB.add(j);
    });
    // 2. the rest keep their relative order (monotone alignment): similar symbols and a compatible number
    const ai = A.map((_, i) => i).filter(i => !doneA.has(i)), bj = B.map((_, j) => j).filter(j => !doneB.has(j));
    const n = ai.length, m = bj.length, best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1)), from = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      let v = best[i - 1][j], f = 1;
      if (best[i][j - 1] > v) { v = best[i][j - 1]; f = 2; }
      const sc = score(i - 1, j - 1); if (sc >= 0 && best[i - 1][j - 1] + sc > v) { v = best[i - 1][j - 1] + sc; f = 3; }
      best[i][j] = v; from[i][j] = f;
    }
    const usedA = new Set(doneA);
    for (let i = n, j = m; i > 0 && j > 0;) {
      const f = from[i][j];
      if (f === 3) { const I = ai[i - 1], J = bj[j - 1], hit = tagHit(A[I], B[J]); out.set(B[J].i, A[I].latex); out.info.set(B[J].i, { tag: A[I].tag, sim: Math.round(sim(I, J) * 100) / 100, via: hit ? 'label' : 'order', source: 'arxiv', conf: 0.95 }); usedA.add(I); i--; j--; }
      else if (f === 1) i--; else j--;
    }
    // a numbered row of an align group that the PDF set as its own block
    for (let j = 0; j < m; j++) {
      const b = B[j]; if (out.has(b.i) || !labelOf(b.label)) continue;
      for (let i = 0; i < n; i++) {
        if (!A[i].group || usedA.has(i)) continue;
        const row = A[i].rows.find(r => r.tag && r.tag.toLowerCase() === labelOf(b.label).toLowerCase()); if (!row) continue;
        const s = bagSim(symbolBag(row.latex, { latex: true }), bBag[j]);
        if (s >= minLabel) { out.set(b.i, `${row.latex}\\tag{${row.tag}}`); out.info.set(b.i, { tag: row.tag, sim: Math.round(s * 100) / 100, via: 'label', source: 'arxiv', conf: 0.95 }); break; }
      }
    }
  } catch { /* what matched so far */ }
  return out;
}

// ── fetching, politely ──────────────────────────────────────────────────────────────────────────────────────────
export const ARXIV_GAP_MS = 3000;
const UA = 'Mozilla/5.0 (compatible; PaperReader/1.0)';
let nextSlot = 0;
/** Waits until at least ARXIV_GAP_MS after the previous arXiv request of this process (all callers share one clock). */
export async function arxivPolite({ now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), gap = ARXIV_GAP_MS } = {}) {
  const t = now(); const at = Math.max(t, nextSlot); nextSlot = at + gap;
  if (at > t) await sleep(at - t);
}
export const _resetPolite = () => { nextSlot = 0; };

/**
 * One request per paper (arxiv.org/html/<id>); ar5iv only when arXiv has no HTML for it (404). The result is parsed, never stored raw.
 * deps.fetch(url, { headers, signal }) -> { ok, status, text() }; deps.polite() waits for the shared clock.
 */
export async function fetchArxivMath(id, deps = {}) {
  const f = deps.fetch ?? globalThis.fetch, polite = deps.polite ?? arxivPolite;
  if (!id || typeof f !== 'function') return { ok: false, status: 'no-id', eqs: [] };
  const urls = [['arxiv', `https://arxiv.org/html/${id}`], ['ar5iv', `https://ar5iv.labs.arxiv.org/html/${id}`]];
  let last = 'unreachable';
  for (const [from, url] of urls) {
    await polite();
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null; const t = ctl ? setTimeout(() => ctl.abort(), deps.timeoutMs ?? 30_000) : null;
      let r; try { r = await f(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', ...(ctl ? { signal: ctl.signal } : {}) }); } finally { if (t) clearTimeout(t); }
      if (r.status === 404) { last = 'not-found'; continue; }
      if (!r.ok) { last = `http-${r.status}`; if (r.status === 429 || r.status >= 500) break; continue; }
      const html = await r.text();
      if (html.length > 15_000_000) { last = 'too-large'; break; }
      const eqs = parseArxivMath(html);
      if (!eqs.length) { last = 'no-equations'; continue; }
      return { ok: true, eqs, from, status: 'ok' };
    } catch (e) { last = String(e?.name === 'AbortError' ? 'timeout' : e?.message ?? e).slice(0, 80); break; }
  }
  return { ok: false, status: last, eqs: [] };
}
