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
 * input list or no test is dropped. citations (optional): ids of papers in the literature desk's library
 * (js/literature.js) the proposal draws on; with `paperIds`, ids not in the library are dropped.
 */
export function validateProposals(obj, lens, { paperIds = null } = {}) {
  const known = paperIds ? (paperIds instanceof Set ? paperIds : new Set(paperIds)) : null;
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
      citations: arr(p?.citations, 8, c => { const id = str(c, 160); return id && (!known || known.has(id)) ? id : null; }),
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
  L.push('## Standard outputs (required before the validation desk reads it)', `Trades in the standard schema written under the register id \`${id}\` with scripts/systems/writeSystemOutputs.mjs or forge/system_exports.py, giving analysis/output/systems/${id}/:`,
    '- trades.json (entry and exit times, direction, R, MAE and MFE in R, risk %)', '- tearsheet.json (the quant battery: per-trade and daily-portfolio statistics, bootstrap and Monte Carlo, by instrument, year and direction, cost stress)',
    '- toolkit_pct.csv, toolkit_r.csv, toolkit_cash.csv (Prop Firm Toolkit formats)', '- data_terminal.csv (Data Terminal import template)', `The system then shows on system-backtest.html?id=${id}.`, '');
  return L.join('\n');
}

// ── Closing the loop (§9ac): the lifecycle of each proposal, results fed back, a thread per proposal, a scorecard ──

/** Stages a proposal moves through. paper, live and retired are set by the owner; the rest are read from the repo. */
export const STAGES = ['proposed', 'shortlisted', 'chosen', 'carded', 'preregistered', 'tested', 'forward-tested', 'passed', 'failed', 'paper', 'live', 'retired', 'parked', 'rejected'];
const OPEN_ROW = new Set(['CLAIMED', 'REGISTERED', 'RUNNING', 'RE-RUN', 'PREREG', 'DRAFT', 'BLOCKED']);

/** The register id a proposal is tracked under: set by the owner, else the card's name, else the proposal's title. */
export const registerIdOf = (p, fb = {}, card = null) => fb[p.id]?.registerId || (card?.card?.name ? slug(card.card.name) : null) || slug(p.title);

/**
 * Where a proposal is now, read from what exists: the owner's mark, the card, the register row, the harness output
 * (analysis/output/harness/<id>.json via its gate checklist), the system outputs (analysis/output/systems/<id>/) and
 * the Evidence Book entry. ctx: { fb, cards, rows, checklists: { id: harnessChecklist }, systems: { id: tearsheet
 * summary }, evidence: [{ id, verdict, use }] }.
 */
export function lifecycle(p, { fb = {}, cards = {}, rows = [], checklists = {}, systems = {}, evidence = [], shadows = {} } = {}) {
  const f = fb[p.id] ?? {}, card = cards[p.id] ?? null, rid = registerIdOf(p, fb, card);
  const row = rows.find(r => r.id === rid) ?? null, chk = checklists[rid] ?? null, sys = systems[rid] ?? null, ev = evidence.find(e => e.id === rid) ?? null;
  const steps = [
    { stage: 'shortlisted', done: ['shortlist', 'build'].includes(f.status) || !!card, detail: f.status ? `marked ${f.status}` : '' },
    { stage: 'chosen', done: f.status === 'build' || !!card, detail: f.note ?? '' },
    { stage: 'carded', done: !!card, detail: card ? `review: ${card.review?.verdict ?? 'none'}` : '' },
    { stage: 'preregistered', done: !!row, detail: row ? `${row.id} [${row.status}]` : `no register row ${rid}` },
    { stage: 'tested', done: !!(chk || sys || ev || (row && !OPEN_ROW.has(row.status))), detail: [chk ? 'harness output' : '', sys ? `${sys.trades} trades in system outputs` : '', ev ? `Evidence Book: ${ev.verdict}` : ''].filter(Boolean).join(' · ') },
  ];
  // a forward shadow on a live bot (js/shadowTracker.js): the out-of-sample test of a filter
  const sh = shadows[p.id] ?? null;
  if (sh) steps.push({ stage: 'forward-tested', done: sh.verdict !== 'collecting', detail: `${sh.bot}: ${sh.rule} · ${sh.verdict}${sh.placeboPercentile != null ? ` (${Math.round(sh.placeboPercentile * 100)}th percentile of random filters)` : ` · ${sh.need ?? ''}`}` });
  let outcome = null;
  if (chk || ev) {
    const failed = chk?.verdict === 'fail' || (ev && ['null', 'underpowered'].includes(ev.verdict));
    outcome = { result: failed ? 'failed' : chk?.verdict === 'pass' || ev?.verdict === 'validated' ? 'passed' : null, failedGates: chk?.failed ?? [], verdict: ev?.verdict ?? null, use: ev?.use ?? null,
      headline: sys ? { trades: sys.trades, sharpe: sys.sharpe ?? null, maxDD: sys.maxDD ?? null } : null };
  } else if (sys) outcome = { result: null, failedGates: [], verdict: null, use: null, headline: { trades: sys.trades, sharpe: sys.sharpe ?? null, maxDD: sys.maxDD ?? null } };
  if (sh) outcome = { ...(outcome ?? { result: null, failedGates: [], verdict: null, use: null, headline: null }), forward: { bot: sh.bot, verdict: sh.verdict, kept: sh.kept, filteredMeanR: sh.filtered?.meanR ?? null, asTradedMeanR: sh.asTraded?.meanR ?? null } };
  let stage = 'proposed';
  for (const s of steps) if (s.done) stage = s.stage;
  if (outcome?.result) stage = outcome.result;
  if (sh && !outcome?.result && sh.verdict !== 'collecting') stage = sh.verdict === 'helping' ? 'passed' : sh.verdict === 'hurting' ? 'failed' : 'forward-tested';
  if (['paper', 'live', 'retired'].includes(f.stage)) stage = f.stage;
  if (f.status === 'reject') stage = 'rejected'; else if (f.status === 'park' && !card) stage = 'parked';
  return { id: p.id, lens: p.lens, stage, registerId: rid, steps, outcome };
}

/** Owner links and stage overrides: { registerId?, stage?: paper|live|retired|'' } on top of the mark. */
export function setLink(fb, id, { registerId, stage } = {}) {
  const cur = { ...(fb?.[id] ?? { status: 'build', note: '', at: new Date().toISOString() }) };
  if (registerId !== undefined) { if (registerId && !/^[a-z0-9][a-z0-9-]{1,80}$/.test(registerId)) throw new Error('registerId must be a register row id'); cur.registerId = registerId || undefined; }
  if (stage !== undefined) { if (stage && !['paper', 'live', 'retired'].includes(stage)) throw new Error('stage must be paper, live or retired'); cur.stage = stage || undefined; }
  return { ...(fb ?? {}), [id]: cur };
}

/** What happened to a researcher's earlier proposals, for its next session's prompt. */
export function outcomesBrief(lib, cycles, lens) {
  const L = (lib ?? []).filter(p => p.lens === lens).map(p => ({ p, c: cycles[p.id] })).filter(x => x.c && x.c.stage !== 'proposed');
  if (!L.length) return '(none of your proposals has moved yet)';
  return L.map(({ p, c }) => { const o = c.outcome;
    return `- ${p.title} [${c.stage}]${o?.forward ? `: forward on ${o.forward.bot} ${o.forward.verdict} (${o.forward.kept} kept, ${o.forward.filteredMeanR}R vs ${o.forward.asTradedMeanR}R as traded)` : ''}${o?.failedGates?.length ? `: failed ${o.failedGates.join(', ')}` : ''}${o?.verdict ? `; Evidence Book ${o.verdict}${o.use ? ` ("${o.use.slice(0, 160)}")` : ''}` : ''}${o?.headline ? `; ${o.headline.trades} trades, Sharpe ${o.headline.sharpe ?? '?'}` : ''}`; }).join('\n');
}

/** Per researcher: how many proposals reached each point, and the pass rate of those tested. */
export function scorecard(lib, cycles) {
  const out = {};
  for (const lens of Object.keys(RESEARCHERS)) {
    const c = (lib ?? []).filter(p => p.lens === lens).map(p => cycles[p.id]).filter(Boolean);
    const at = s => c.filter(x => x.steps.find(y => y.stage === s)?.done).length;
    const passed = c.filter(x => x.outcome?.result === 'passed').length, failed = c.filter(x => x.outcome?.result === 'failed').length;
    out[lens] = { proposed: c.length, accepted: at('shortlisted'), carded: at('carded'), preregistered: at('preregistered'), tested: at('tested'), passed, failed,
      paperOrLive: c.filter(x => ['paper', 'live'].includes(x.stage)).length, rejected: c.filter(x => x.stage === 'rejected').length,
      passRate: passed + failed ? +(passed / (passed + failed)).toFixed(2) : null };
  }
  return out;
}

/** A researcher's reply in a proposal's thread: { reply, revise?, questions[] }. revise holds only changed fields. */
export function validateReply(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const reply = str(obj.reply, 2500); if (!reply) return { ok: false, errors: ['reply missing'] };
  const r = obj.revise && typeof obj.revise === 'object' ? obj.revise : null, revise = {};
  if (r) {
    for (const k of ['title', 'thesis', 'mechanism', 'counterparty', 'killIf', 'fleetOverlap']) if (str(r[k], 900)) revise[k] = str(r[k], 900);
    if (r.rules && typeof r.rules === 'object') revise.rules = Object.fromEntries(['universe', 'signal', 'entry', 'exit', 'horizon', 'sizing'].filter(k => str(r.rules[k], 500)).map(k => [k, str(r.rules[k], 500)]));
    if (r.test && typeof r.test === 'object') revise.test = Object.fromEntries(['variable', 'benchmark', 'placebo', 'horizons', 'power'].filter(k => str(r.test[k], 400)).map(k => [k, str(r.test[k], 400)]));
    if (Array.isArray(r.inputs)) revise.inputs = arr(r.inputs, 10, i => (str(i?.what, 200) ? { what: str(i.what, 200), status: one(i?.status, ['have', 'partial', 'missing'], 'missing'), how: str(i?.how, 300) ?? '' } : null));
    if (Array.isArray(r.buildSteps)) revise.buildSteps = arr(r.buildSteps, 8, s => str(s, 240));
  }
  return { ok: true, value: { reply, revise: Object.keys(revise).length ? revise : null, questions: arr(obj.questions, 3, q => str(q, 300)) } };
}

/** Apply a revision to a proposal: changed fields merged, version bumped, the previous text kept (last 5). */
export function applyRevision(p, revise, at = new Date().toISOString()) {
  if (!revise) return p;
  const prev = { version: p.version ?? 1, at: p.revisedAt ?? p.lastSeen ?? null, thesis: p.thesis, rules: p.rules, test: p.test };
  return { ...p, ...revise, rules: { ...p.rules, ...(revise.rules ?? {}) }, test: { ...p.test, ...(revise.test ?? {}) }, version: (p.version ?? 1) + 1, revisedAt: at, history: [prev, ...(p.history ?? [])].slice(0, 5) };
}

/** A thread as prompt text, oldest first. */
export const threadText = (msgs, lens) => (msgs ?? []).map(m => `${m.who === 'owner' ? 'Owner' : RESEARCHERS[m.who]?.label ?? m.who} (${String(m.at).slice(0, 16)}): ${m.text}`).join('\n') || '(no messages yet)';
