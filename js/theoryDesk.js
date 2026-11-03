/**
 * Phases 9 and 12: the theory desk and research ops (plans/DESK_ANALYST_PIPELINE.md §9t). Private: the Desk Office
 * "Research" tab.
 *
 * Phase 12, research ops (no model call): reads the research register (plans/RESEARCH_REGISTER.md) and the study
 * files in the deployed repo and lists what needs a hand: stale rows, pre-registrations with no verdict, results
 * written but not banked, banked rows with no ledger entry. For a row ready to bank it drafts the Evidence Book entry
 * skeleton (js/deskEvidence.js shape) with the verdict left for the owner.
 *
 * Phase 9, the theory desk (one model call a week): proposes testable theories about the system's own output in the
 * research-director's form (construct a variable, condition on it, sweep the horizons, read the outcome against a
 * benchmark and a placebo). Its sources: the Evidence Book, the register (dead hypotheses included), the QuantConnect
 * notes, the 151-strategies screen, the SSRN reading list and the desk's scored record. Each proposal is screened here
 * against the register and the Evidence Book by word overlap, so near-repeats are flagged. It proposes and designs;
 * it never declares a result.
 *
 * Pure. Tested in js/theoryDesk.test.mjs.
 */

const COLS = ['id', 'question', 'status', 'branch', 'updated', 'prereg', 'results', 'ledger', 'next'];
const cell = s => s.trim().replace(/^`|`$/g, '').replace(/^—$|^-$/, '').trim();

/** Register rows from the markdown: the first table under "## Active" and under "## Done". */
export function parseRegister(text) {
  const rows = [];
  let section = '', inTable = false;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)/);
    if (h) { section = h[1].trim(); inTable = false; continue; }
    if (!/^(Active|Done)/i.test(section) || !line.startsWith('|')) { if (inTable && !line.startsWith('|')) inTable = false; continue; }
    const parts = line.split('|').slice(1, -1).map(cell);
    if (parts[0] === 'ID' || /^-+$/.test(parts[0])) { inTable = true; continue; }
    if (!inTable || parts.length < COLS.length) continue;
    const r = Object.fromEntries(COLS.map((c, i) => [c, parts[i] ?? '']));
    r.section = /^Done/i.test(section) ? 'Done' : 'Active';
    r.status = r.status.toUpperCase();
    rows.push(r);
  }
  return rows;
}

const OPEN = new Set(['CLAIMED', 'REGISTERED', 'RUNNING', 'RE-RUN', 'PREREG', 'DRAFT', 'BLOCKED']);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const paths = s => [...String(s ?? '').matchAll(/`([^`]+)`|((?:forge|analysis|MD files|plans|research)\/[^\s,;|()]+)/g)].map(m => (m[1] ?? m[2]).trim());

/**
 * Phase 12: the ops report. files: the repo's study files (paths). exists(path) → bool. today: 'YYYY-MM-DD'.
 */
export function opsReport(rows, { files = [], exists = () => false, today, staleDays = 14 } = {}) {
  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  const stale = rows.filter(r => r.section === 'Active' && OPEN.has(r.status) && r.updated && daysBetween(r.updated, today) > staleDays)
    .map(r => ({ id: r.id, status: r.status, updated: r.updated, days: daysBetween(r.updated, today), next: r.next.slice(0, 220) })).sort((a, b) => b.days - a.days);
  const readyToBank = rows.filter(r => r.status === 'RESULTS' || (OPEN.has(r.status) && paths(r.results).some(exists)))
    .map(r => ({ id: r.id, status: r.status, results: paths(r.results).find(exists) ?? paths(r.results)[0] ?? null, next: r.next.slice(0, 220), draft: bankingDraft(r, today) }));
  const noLedger = rows.filter(r => r.status === 'BANKED' && !r.ledger).map(r => ({ id: r.id, results: r.results }));
  const mentioned = new Set(rows.flatMap(r => paths(`${r.prereg} ${r.results}`)));
  const preregs = files.filter(f => /PREREG/i.test(f) && !/TEMPLATE/i.test(f));
  const orphanPreregs = preregs.filter(f => !mentioned.has(f)).sort();
  const resultsFor = f => f.replace(/PREREG/i, 'RESULTS');
  const preregNoVerdict = rows.filter(r => r.status !== 'BANKED' && paths(r.prereg).some(p => preregs.includes(p))).map(r => ({ id: r.id, status: r.status, prereg: paths(r.prereg)[0], results: paths(r.results).find(exists) ?? (exists(resultsFor(paths(r.prereg)[0])) ? resultsFor(paths(r.prereg)[0]) : null) }));
  const exploratory = rows.filter(r => r.status === 'EXPLORATORY' && /candidate|next if|needs owner/i.test(r.next)).map(r => ({ id: r.id, next: r.next.slice(0, 260) }));
  return { rows: rows.length, active: rows.filter(r => r.section === 'Active').length, counts, stale, readyToBank, noLedger, preregNoVerdict, orphanPreregs: orphanPreregs.slice(0, 40), orphanCount: orphanPreregs.length, exploratory };
}

/** An Evidence Book entry skeleton for a row ready to bank; the verdict and the use are the owner's to write. */
export function bankingDraft(r, today) {
  return `  {
    id: '${r.id}', domain: 'TODO', verdict: 'TODO: validated | null | underpowered | context', date: '${today}', doc: '${paths(r.results)[0] ?? ''}',
    claim: ${JSON.stringify(r.question.slice(0, 300))},
    result: 'TODO: the headline numbers with intervals and counts, from the results file',
    use: 'TODO: what the desk may and may not do with it',
    instruments: [],
  },`;
}

// ── Phase 9 sources ──────────────────────────────────────────────────────────────────────────────────────────────

/** Markdown headings (## and ###) of a long note, as a short outline. */
export const outline = (md, { max = 80 } = {}) => String(md ?? '').split(/\r?\n/).filter(l => /^#{2,3}\s/.test(l)).map(l => l.replace(/^#+\s*/, '- ')).slice(0, max).join('\n');

/** A section of a markdown file by heading prefix, trimmed. */
export function section(md, heading, maxChars = 5000) {
  const lines = String(md ?? '').split(/\r?\n/), i = lines.findIndex(l => /^#{1,3}\s/.test(l) && l.replace(/^#+\s*/, '').startsWith(heading));
  if (i < 0) return '';
  const level = lines[i].match(/^#+/)[0].length, out = [];
  for (let k = i; k < lines.length; k++) { if (k > i && /^#+\s/.test(lines[k]) && lines[k].match(/^#+/)[0].length <= level) break; out.push(lines[k]); }
  return out.join('\n').slice(0, maxChars);
}

/** The SSRN/arXiv reading list (CSV) as "topic: title (year)" lines. */
export function readingList(csv, { max = 120 } = {}) {
  const rows = String(csv ?? '').split(/\r?\n/).slice(1).filter(Boolean).map(l => { const c = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) ?? []; return { topic: c[0], title: c[1], year: c[3] }; });
  return rows.filter(r => r.title).slice(0, max).map(r => `- ${r.topic}: ${r.title} (${r.year})`).join('\n');
}

/** The register as one line per row for the prompt (dead hypotheses included, so they are not proposed again). */
export const registerText = rows => rows.map(r => `- ${r.id} [${r.status}] ${r.question.slice(0, 180)}${r.next ? ` → ${r.next.slice(0, 160)}` : ''}`).join('\n');

const STOP = new Set('the a an of to in on and or for with by is are be at as from vs does do it its this that than when after before into over per same day days session'.split(' '));
const words = s => new Set(String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let k = 0; for (const w of a) if (b.has(w)) k++; return k / Math.min(a.size, b.size); };

/** Flag each theory that looks like a register row or an Evidence Book entry (word overlap ≥ 0.5 of the smaller). */
export function screen(theories, rows, evidence, { min = 0.5 } = {}) {
  const pool = [...rows.map(r => ({ kind: 'register', id: r.id, status: r.status, w: words(`${r.id.replace(/-/g, ' ')} ${r.question}`) })),
    ...(evidence ?? []).map(e => ({ kind: 'evidence', id: e.id, status: e.verdict, w: words(`${e.id.replace(/-/g, ' ')} ${e.claim}`) }))];
  return theories.map(t => {
    const w = words(`${t.title} ${t.variable} ${t.condition}`);
    const near = pool.map(p => ({ kind: p.kind, id: p.id, status: p.status, score: +overlap(w, p.w).toFixed(2) })).filter(p => p.score >= min).sort((a, b) => b.score - a.score).slice(0, 3);
    return { ...t, near };
  });
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
/** The theory desk's reply: { headline, theories[{title, variable, condition, horizons, outcome, benchmark, placebo, data, power, source, whyNew, priority}] }. */
export function validateTheories(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 300);
  if (!headline) return { ok: false, errors: ['headline missing'] };
  const theories = (Array.isArray(obj.theories) ? obj.theories : []).slice(0, 8).map(t => ({
    title: str(t?.title, 160), variable: str(t?.variable, 500), condition: str(t?.condition, 400), horizons: str(t?.horizons, 200), outcome: str(t?.outcome, 300),
    benchmark: str(t?.benchmark, 300), placebo: str(t?.placebo, 300), data: str(t?.data, 400), power: str(t?.power, 300), source: str(t?.source, 300), whyNew: str(t?.whyNew, 400),
    priority: ['high', 'medium', 'low'].includes(t?.priority) ? t.priority : 'medium',
  })).filter(t => t.title && t.variable && t.benchmark && t.placebo);
  if (!theories.length) return { ok: false, errors: ['no theory with a variable, a benchmark and a placebo'] };
  const claims = /\b(has an edge|works|proven|profitable|guarantee)/i.test(JSON.stringify(theories)) ? ['result wording found: a proposal must not claim a result'] : [];
  return { ok: true, notes: claims, value: { headline, theories } };
}
