/**
 * Phase 23-25: the research pod (plans/DESK_ANALYST_PIPELINE.md §9ab). Three researchers who propose NEW systems,
 * each from one lens, and work with the owner on what to build next; a system architect who turns a chosen proposal
 * into a full system card and prereg draft; a validation desk that reviews a card or a finished harness study.
 *
 *   quant   the quantitative researcher: statistical, factor, volatility and systematic ideas (momentum, carry, mean
 *           reversion, stat-arb, vol premia, regime switching, ML only where the Evidence Book allows)
 *   macro   the fundamental and institutional researcher: fair value, rate paths, curves, central banks, flows,
 *           terms of trade, cross-asset leads, event-driven macro
 *   flow    the retail and positioning researcher: what retail traders do and where they are trapped, COT, options
 *           walls and dealer gamma, liquidity and stop pools, session habits, crowding
 *
 * Their sources: the system catalogue (js/systemCatalogue.js, what exists and what is missing), the data inventory
 * (js/dataFeeds.js), the bot fleet and its ideas (js/botRegistry.js, js/rulesKeeper.js), the Evidence Book and the
 * register (so dead ideas are not proposed again), the reading lists, and a fresh read of the web each run: arXiv
 * quantitative finance, Quantocracy, Alpha Architect, Robot Wealth, QuantInsti, the BIS working papers, the New York
 * Fed's Liberty Street Economics, and the week's top r/algotrading threads (retail stories, read as stories).
 *
 * The owner works with them: each proposal can be marked shortlist / build / park / reject with a note; the next run
 * reads that, and a question can be put to the pod at any time. Proposals only: nothing is run or banked here.
 *
 * Pure. Tested in js/researchPod.test.mjs.
 */

export const RESEARCHERS = {
  quant: { role: 'researcher_quant', label: 'Quant researcher', lens: 'statistical, factor, volatility and systematic' },
  macro: { role: 'researcher_macro', label: 'Macro researcher', lens: 'fundamental and institutional' },
  flow: { role: 'researcher_flow', label: 'Flow researcher', lens: 'retail behaviour and positioning' },
};

/** Keyless web sources, read each run. lens: which researchers see it first ('all' = every one). */
export const WEB_SOURCES = [
  { id: 'arxiv', label: 'arXiv quantitative finance (newest)', lens: 'all', kind: 'atom',
    url: 'https://export.arxiv.org/api/query?search_query=cat:q-fin.TR+OR+cat:q-fin.PM+OR+cat:q-fin.ST+OR+cat:q-fin.CP&sortBy=submittedDate&sortOrder=descending&max_results=40' },
  { id: 'quantocracy', label: 'Quantocracy (quant blog aggregator)', lens: 'quant', kind: 'rss', url: 'https://quantocracy.com/feed/' },
  { id: 'alphaarchitect', label: 'Alpha Architect (factor and institutional research)', lens: 'quant', kind: 'rss', url: 'https://alphaarchitect.com/feed/' },
  { id: 'robotwealth', label: 'Robot Wealth (systematic trading for individuals)', lens: 'flow', kind: 'rss', url: 'https://robotwealth.com/feed/' },
  { id: 'quantinsti', label: 'QuantInsti blog (retail quant)', lens: 'flow', kind: 'rss', url: 'https://blog.quantinsti.com/rss/' },
  { id: 'bis', label: 'BIS working papers', lens: 'macro', kind: 'rss', url: 'https://www.bis.org/doclist/wppubls.rss' },
  { id: 'libertystreet', label: 'NY Fed Liberty Street Economics', lens: 'macro', kind: 'rss', url: 'https://libertystreeteconomics.newyorkfed.org/feed/' },
  { id: 'reddit_algotrading', label: 'r/algotrading top of the week (retail stories)', lens: 'flow', kind: 'atom', url: 'https://www.reddit.com/r/algotrading/top/.rss?t=week' },
];
export const WEB_HOSTS = [...new Set(WEB_SOURCES.map(s => new URL(s.url).hostname))];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', '#038': '&' };
const clean = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&([#a-z0-9]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? (e[0] === '#' ? String.fromCharCode(parseInt(e.slice(1), 10) || 32) : m)).replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

/** RSS <item> or Atom <entry> → [{ title, link, date, summary }]. Defensive: a malformed feed returns []. */
export function parseFeed(xml, { max = 15, summaryChars = 320 } = {}) {
  const s = String(xml ?? ''), out = [];
  const blocks = s.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? s.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks.slice(0, max)) {
    const title = clean(tag(b, 'title'));
    if (!title) continue;
    const link = clean(tag(b, 'link')) || (b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) ?? b.match(/<link[^>]*href="([^"]+)"/i) ?? [])[1] || clean(tag(b, 'id'));
    const date = clean(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')).slice(0, 40);
    const summary = clean(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, summaryChars);
    out.push({ title: title.slice(0, 200), link, date, summary });
  }
  return out;
}

/** The web digest for one researcher: its lens's sources first, then the shared ones, as prompt text. */
export function webDigest(reads, lens, { perSource = 10 } = {}) {
  const order = [...WEB_SOURCES.filter(s => s.lens === lens), ...WEB_SOURCES.filter(s => s.lens === 'all'), ...WEB_SOURCES.filter(s => s.lens !== lens && s.lens !== 'all')];
  return order.map(s => { const r = reads?.[s.id]; if (!r?.items?.length) return `## ${s.label}\n(${r?.error ?? 'not read'})`;
    const n = s.lens === lens || s.lens === 'all' ? perSource : Math.ceil(perSource / 3);
    return `## ${s.label}\n${r.items.slice(0, n).map(i => `- ${i.title}${i.date ? ` (${i.date.slice(0, 16)})` : ''} <${i.link}>${i.summary ? `: ${i.summary}` : ''}`).join('\n')}`; }).join('\n\n');
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const arr = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f).filter(Boolean) : []);
const one = (v, ok, d) => (ok.includes(v) ? v : d);
export const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const RESULT_WORDS = /\b(has an edge|is profitable|proven|guarantee[sd]?|always works|risk[- ]free)\b/i;

/**
 * A researcher's reply: { headline, proposals[], questionsForOwner[] }. Each proposal is a new system, not a test of
 * an old one. Returns { ok, value, notes } with notes for result wording; a proposal with no mechanism, no source, no
 * input list or no test is dropped.
 */
export function validateProposals(obj, lens) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const proposals = arr(obj.proposals, 6, p => {
    const t = {
      title: str(p?.title, 140), family: str(p?.family, 120), thesis: str(p?.thesis, 900), mechanism: str(p?.mechanism, 700),
      counterparty: str(p?.counterparty, 300),
      sources: arr(p?.sources, 6, s => (typeof s === 'string' ? { title: s.slice(0, 200), ref: null } : str(s?.title, 200) ? { title: str(s.title, 200), ref: str(s?.ref ?? s?.url, 300) } : null)),
      inputs: arr(p?.inputs, 10, i => (str(i?.what, 200) ? { what: str(i.what, 200), status: one(i?.status, ['have', 'partial', 'missing'], 'missing'), how: str(i?.how, 300) ?? '' } : null)),
      rules: { universe: str(p?.rules?.universe, 200) ?? '', signal: str(p?.rules?.signal, 500) ?? '', entry: str(p?.rules?.entry, 300) ?? '', exit: str(p?.rules?.exit, 300) ?? '', horizon: str(p?.rules?.horizon, 120) ?? '', sizing: str(p?.rules?.sizing, 200) ?? '' },
      test: { variable: str(p?.test?.variable, 400) ?? '', benchmark: str(p?.test?.benchmark, 300) ?? '', placebo: str(p?.test?.placebo, 300) ?? '', horizons: str(p?.test?.horizons, 200) ?? '', power: str(p?.test?.power, 300) ?? '' },
      killIf: str(p?.killIf, 300) ?? '', fleetOverlap: str(p?.fleetOverlap, 300) ?? '',
      buildSteps: arr(p?.buildSteps, 8, s => str(s, 240)), effort: one(p?.effort, ['S', 'M', 'L'], 'M'), priority: one(p?.priority, ['high', 'medium', 'low'], 'medium'),
    };
    if (!t.title || !t.mechanism || !t.sources.length || !t.inputs.length || !t.test.benchmark) return null;
    return { id: `${lens}-${slug(t.title)}`, lens, ...t };
  });
  if (!proposals.length) return { ok: false, errors: ['no proposal with a mechanism, a source, its inputs and a benchmark'] };
  const notes = proposals.filter(p => RESULT_WORDS.test(`${p.thesis} ${p.mechanism}`)).map(p => `${p.id}: result wording; a proposal must not claim a result`);
  return { ok: true, notes, value: { headline: str(obj.headline, 300) ?? '', proposals, questionsForOwner: arr(obj.questionsForOwner, 5, q => str(q, 300)) } };
}

/** Owner feedback: { id: { status: shortlist|build|park|reject, note, at } }. */
export const FEEDBACK = ['shortlist', 'build', 'park', 'reject'];
export function applyFeedback(fb, id, status, note, at = new Date().toISOString()) {
  if (!FEEDBACK.includes(status)) throw new Error(`status must be one of ${FEEDBACK.join(', ')}`);
  return { ...(fb ?? {}), [id]: { status, note: String(note ?? '').slice(0, 600), at } };
}

/** What the owner said last time, for the next run's prompt. */
export function feedbackBrief(fb, past) {
  const byId = Object.fromEntries((past ?? []).map(p => [p.id, p]));
  const rows = Object.entries(fb ?? {}).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 30);
  return rows.length ? rows.map(([id, f]) => `- ${byId[id]?.title ?? id} [${f.status}]${f.note ? `: ${f.note}` : ''}`).join('\n') : '(no feedback yet)';
}

/**
 * The build list: every input the proposals need that we do not have, ranked by how many live proposals need it and
 * their priority. Rejected and parked proposals do not count; "build" counts double.
 */
export function buildList(proposals, fb = {}) {
  const W = { high: 3, medium: 2, low: 1 }, m = new Map();
  for (const p of proposals ?? []) {
    const st = fb[p.id]?.status; if (st === 'reject' || st === 'park') continue;
    for (const i of p.inputs ?? []) {
      if (i.status === 'have') continue;
      const k = slug(i.what); if (!k) continue;
      const e = m.get(k) ?? { what: i.what, how: i.how, status: i.status, score: 0, needs: [] };
      e.score += (W[p.priority] ?? 1) * (st === 'build' ? 2 : 1); e.needs.push(p.id); if (!e.how && i.how) e.how = i.how; if (i.status === 'missing') e.status = 'missing';
      m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.score - a.score || b.needs.length - a.needs.length);
}

/** Merge new proposals into the pod's library (latest wins per id, keeps first-seen date). */
export function mergeLibrary(lib, proposals, date) {
  const out = Object.fromEntries((lib ?? []).map(p => [p.id, p]));
  for (const p of proposals) out[p.id] = { ...p, firstSeen: out[p.id]?.firstSeen ?? date, lastSeen: date };
  return Object.values(out).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 120);
}

// ── Phase 24: the system card ───────────────────────────────────────────────────────────────────────────────────

/**
 * The system architect's reply for one proposal: a complete spec that research-protocol can pre-register and the
 * harness (js/harness/runStudy.mjs) can run. Required: hypothesis, universe, signal, entry, exit, sizing, the test
 * (primary metric, benchmark, placebo, sample with an untouched holdout), kill criteria and the build plan.
 */
export function validateCard(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const c = {
    name: str(obj.name, 120), hypothesis: str(obj.hypothesis, 800), mechanism: str(obj.mechanism, 700),
    universe: arr(obj.universe, 45, u => str(u, 20)), horizon: str(obj.horizon, 120),
    signal: str(obj.signal, 900), entry: str(obj.entry, 500), exit: str(obj.exit, 500), sizing: str(obj.sizing, 400), costs: str(obj.costs, 300) ?? 'harness costs (measured spread profile)',
    data: arr(obj.data, 12, d => (str(d?.feed, 120) ? { feed: str(d.feed, 120), status: one(d?.status, ['have', 'partial', 'missing'], 'missing'), span: str(d?.span, 80) ?? '', how: str(d?.how, 300) ?? '' } : null)),
    test: { primary: str(obj.test?.primary, 200), benchmark: str(obj.test?.benchmark, 300), placebo: str(obj.test?.placebo, 300), sample: str(obj.test?.sample, 200), holdout: str(obj.test?.holdout, 200),
      cells: arr(obj.test?.cells, 12, x => str(x, 80)), tuned: !!obj.test?.tuned, power: str(obj.test?.power, 300) ?? '' },
    kill: arr(obj.kill, 6, k => str(k, 240)), risks: arr(obj.risks, 8, k => str(k, 240)),
    build: arr(obj.build, 12, b => (str(b?.step, 240) ? { step: str(b.step, 240), files: arr(b?.files, 6, f => str(f, 120)), effort: one(b?.effort, ['S', 'M', 'L'], 'M') } : null)),
    fleet: str(obj.fleet, 400) ?? '',
  };
  const miss = ['name', 'hypothesis', 'signal', 'entry', 'exit', 'sizing', 'horizon'].filter(k => !c[k]);
  if (!c.universe.length) miss.push('universe');
  for (const k of ['primary', 'benchmark', 'placebo', 'sample', 'holdout']) if (!c.test[k]) miss.push(`test.${k}`);
  if (!c.kill.length) miss.push('kill');
  if (!c.build.length) miss.push('build');
  if (miss.length) return { ok: false, errors: [`missing: ${miss.join(', ')}`] };
  const notes = RESULT_WORDS.test(`${c.hypothesis} ${c.mechanism}`) ? ['result wording found: a card must not claim a result'] : [];
  return { ok: true, notes, value: c };
}

/** The card as a prereg draft in the research-protocol shape (forge/<ID>_PREREG.md), for the owner to edit and commit. */
export function cardPrereg(card, { id, date, proposal } = {}) {
  const c = card, L = [];
  L.push(`# ${c.name}: pre-registration (DRAFT from the system architect, ${date})`, '');
  L.push(`Register id: \`${id}\` (claim it in plans/RESEARCH_REGISTER.md before anything runs). Status: DRAFT, not committed, nothing run.`, '');
  if (proposal) L.push(`Proposed by the ${RESEARCHERS[proposal.lens]?.label ?? proposal.lens}: ${proposal.thesis ?? ''}`, '', `Sources: ${(proposal.sources ?? []).map(s => s.ref ? `${s.title} <${s.ref}>` : s.title).join('; ')}`, '');
  L.push('## Hypothesis', c.hypothesis, '', '## Mechanism (who is on the other side)', c.mechanism ?? '', '');
  L.push('## Specification', `- Universe: ${c.universe.join(', ')}`, `- Horizon: ${c.horizon}`, `- Signal: ${c.signal}`, `- Entry: ${c.entry}`, `- Exit: ${c.exit}`, `- Sizing: ${c.sizing}`, `- Costs: ${c.costs}`, '');
  L.push('## Data', ...c.data.map(d => `- ${d.feed} [${d.status}]${d.span ? `, ${d.span}` : ''}${d.how ? `: ${d.how}` : ''}`), '');
  L.push('## Test (fixed before any result is seen)', `- Primary metric: ${c.test.primary}`, `- Benchmark: ${c.test.benchmark}`, `- Placebo: ${c.test.placebo}`, `- Sample: ${c.test.sample}`, `- Holdout (untouched until the end): ${c.test.holdout}`,
    `- Cells reported: ${c.test.cells.join(', ') || 'one'}${c.test.tuned ? ' (tuned: PBO by CSCV applies)' : ''}`, `- Power: ${c.test.power}`, '- Scoring: the harness (js/harness/runStudy.mjs): vol targeting, measured costs, date-cluster bootstrap, BH-FDR, deflated Sharpe; then the validation desk (js/validationDesk.js).', '');
  L.push('## Kill criteria', ...c.kill.map(k => `- ${k}`), '', '## Known risks', ...c.risks.map(k => `- ${k}`), '');
  L.push('## Fit with the fleet', c.fleet || '(not stated)', '', '## Build plan', ...c.build.map((b, i) => `${i + 1}. ${b.step} [${b.effort}]${b.files.length ? ` (${b.files.join(', ')})` : ''}`), '');
  return L.join('\n');
}
