/**
 * The agent registry (owner request 2026-11-08): every agent the platform runs, in plain words, and how they hand work to each other.
 * Data only (no I/O, no clock), so the Agents tab on Bot Config, GET /api/agents and the tests all read the same thing.
 *
 *   AGENTS    one entry per agent: id, name, group ('Research' | 'Data' | 'Library' | 'Desk' | 'News' | 'Tests'), purpose, trigger, reads[], writes[],
 *             modelTask (an id in js/modelRouter.js TASK_CLASS, or null when it makes no model call), toggles[] (ids in js/agentSettings.js),
 *             cap ({ key, cap, label } for a hard cap kept in KV, else null), spends (true when running it can cost model money), links[]
 *             ({ label, href }), roles[] (desk/roles/<id>.md files it runs), job (an id in server.js _AI_JOBS when a schedule runs it),
 *             planned (true = not built; drawn dashed), kind ('service' = a processing service: plain code, no model call; null = the usual agent).
 *   POINTS    the non-agent boxes in the flow charts: the owner, stores and outputs.
 *   EDGES     { from, to, label, kind: 'data' | 'control', optional? }. One entry per (from, to) pair.
 *   FLOWS     named flows: { id, name, blurb, nodes: [{ id, col, row }], edges: ['from>to'] } with a grid layout hint.
 *   UNMAPPED_ROLES  desk role files no agent runs (none today; a role must be here or in some agent's roles[]).
 *
 * Nothing here is invented: an agent that is not built is marked planned:true (and says where the plan lives).
 * Tested in js/agentRegistry.test.mjs (model tasks exist, edge ends exist, cap keys are registered KV keys, every desk role is shown).
 */
import { MATH_CAP } from './libraryMath.js';
import { FIGS_CAP } from './libraryFigs.js';
import { LIBRARIAN_CAP } from './libraryLibrarian.js';

export const GROUPS = ['Research', 'Data', 'Library', 'Desk', 'News', 'Tests'];
export const UNMAPPED_ROLES = [];

const A = (id, name, group, o) => ({
  id, name, group, purpose: '', trigger: '', reads: [], writes: [], modelTask: null, toggles: [], cap: null, spends: false, links: [], roles: [], job: null, planned: false, kind: null, ...o,
});
const L = (label, href) => ({ label, href });
const ROE = L('Plan: Research Opportunity Engine', 'plans/RESEARCH_OPPORTUNITY_ENGINE.md');
const CAP = { math: { key: 'library_math_v1', cap: MATH_CAP, label: 'equation calls' }, figs: { key: 'library_figs_v1', cap: FIGS_CAP, label: 'figure and table calls' }, lib: { key: 'library_librarian_v1', cap: LIBRARIAN_CAP, label: 'librarian calls' } };

export const AGENTS = [
  // ── Research: the pod that answers the owner's questions ────────────────────────────────────────────────────
  A('researcher-quant', 'Quant researcher', 'Research', {
    purpose: 'Looks at a question through statistics, factors, volatility and systematic rules, and proposes tests. Proposals and reviews, not results.',
    trigger: 'Owner presses Run or Reply on a research case; also the Sunday weekly run.', job: 'researchPod',
    reads: ['the question and earlier rounds', 'an Evidence Book slice', 'web research feeds', 'library context (only if the library switch is on)'], writes: ['research_cases (the round)', 'research_pod_library (proposals)'],
    modelTask: 'research-pod', spends: true, roles: ['researcher_quant'], links: [L('Research pod', 'desk-office.html')],
  }),
  A('researcher-macro', 'Macro researcher', 'Research', {
    purpose: 'Looks at a question through fundamentals and institutions (central banks, flows, policy) and proposes tests.',
    trigger: 'Owner presses Run or Reply on a research case; also the Sunday weekly run.', job: 'researchPod',
    reads: ['the question and earlier rounds', 'an Evidence Book slice', 'web research feeds', 'library context (only if the library switch is on)'], writes: ['research_cases (the round)', 'research_pod_library (proposals)'],
    modelTask: 'research-pod', spends: true, roles: ['researcher_macro'], links: [L('Research pod', 'desk-office.html')],
  }),
  A('researcher-flow', 'Flow researcher', 'Research', {
    purpose: 'Looks at a question through retail behaviour and positioning (COT, crowding, order flow) and proposes tests.',
    trigger: 'Owner presses Run or Reply on a research case; also the Sunday weekly run.', job: 'researchPod',
    reads: ['the question and earlier rounds', 'an Evidence Book slice', 'web research feeds', 'library context (only if the library switch is on)'], writes: ['research_cases (the round)', 'research_pod_library (proposals)'],
    modelTask: 'research-pod', spends: true, roles: ['researcher_flow'], links: [L('Research pod', 'desk-office.html')],
  }),
  A('head-of-research', 'Head of Research', 'Research', {
    purpose: 'Reads all three researchers against the whole Evidence Book, says where they agree and disagree, and picks the next step for each plan (quick test, architect, park, drop).',
    trigger: 'Owner presses Head review on a case. Never automatic.',
    reads: ['the three researchers\' answers', 'the full Evidence Book', 'library context (only if the library switch is on)'], writes: ['research_cases (the review)'],
    modelTask: 'research-head', spends: true, roles: ['head_of_research'], links: [L('Research pod', 'desk-office.html')],
  }),
  A('research-vision', 'Picture reader', 'Research', {
    purpose: 'Reads a picture the owner attached to a question once, into plain text that the researchers (who cannot see images) then read.',
    trigger: 'Owner attaches a picture to a question.', reads: ['the picture (R2 research/images)'], writes: ['research_images (the reading)'],
    modelTask: 'research-vision', spends: true, links: [L('Research pod', 'desk-office.html')],
  }),
  A('literature-librarian', 'Literature librarian', 'Research', {
    purpose: 'Turns an idea into precise search queries and names the known literature on it. It finds what has been written; it does not judge. (Not the same as the Library librarian, which searches papers we already hold.)',
    trigger: 'Owner presses Research an idea (Literature desk).', reads: ['the hypothesis', 'attached picture readings'], writes: ['the dossier (queries, known names)'],
    modelTask: 'research-reader', spends: true, roles: ['librarian'], links: [L('Literature desk', 'desk-office.html')],
  }),
  A('research-synthesist', 'Research synthesist', 'Research', {
    purpose: 'Writes the dossier on an idea from the papers that were found and read: what is known, what is disputed, what could be tested here.',
    trigger: 'Runs at the end of Research an idea.', reads: ['the paper notes', 'the Evidence Book'], writes: ['research_pod_dossiers'],
    modelTask: 'desk-head', spends: true, roles: ['research_synthesist'], links: [L('Literature desk', 'desk-office.html')],
  }),
  A('theory-desk', 'Theory desk', 'Research', {
    purpose: 'Proposes testable theories about the desk\'s own output in the research-director\'s form. It proposes and designs; it never declares a result.',
    trigger: 'Saturdays from 09:00 London, or the owner\'s run button.', job: 'deskTheory',
    reads: ['the Evidence Book', 'the research register', 'Theory Lab lessons', 'the desk\'s scored history'], writes: ['desk theory ideas (KV)'],
    modelTask: 'desk-head', spends: true, roles: ['theory_desk'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('system-architect', 'System architect', 'Research', {
    purpose: 'Turns the chosen proposal into a system card and a draft pre-registration, with the data and rules it must respect.',
    trigger: 'Owner presses Architect on a proposal.', reads: ['the proposal', 'the data inventory and bot fleet', 'the Evidence Book', 'the research register', 'the data rules'], writes: ['the system card and prereg draft (research_pod_cards)'],
    modelTask: 'desk-head', spends: true, roles: ['system_architect'], links: [L('Research pod', 'desk-office.html')],
  }),

  // ── Data: the Research Opportunity Engine (ROE), PLANNED, plans/RESEARCH_OPPORTUNITY_ENGINE.md. Nothing here is built. ──────────────────────
  A('opportunity-scanner', 'Opportunity scanner', 'Data', {
    purpose: 'Planned: after the daily run, freezes the day\'s inputs as an immutable snapshot with a run ID and freshness flags, then runs fixed statistics over everything the owner holds (percentiles, z-scores, extremes, divergences, lead-lag screens, regime shifts, breakdowns). It tags each flag with a discovery episode ID and a hypothesis family ID and logs how many items it scanned. Plain Python on the owner\'s laptop; no model call.',
    trigger: 'Built (phases P1 and P2) as the laptop Python package roe/: scanner and triggers, writes roe_out/ locally, and with --push sends the run to the server. It runs only when you start it, see How to start it below. Planned: once a day on the laptop after the daily run; it pushes the snapshot reference and the questions to the server, and a repeated push of the same run ID changes nothing.', planned: true, kind: 'service',
    howTo: [
      'Open a terminal on the laptop in the MacroFXModel folder (needs Python 3.12 or newer).',
      'Try it with no network first: python -m roe --fixtures --asof 2026-11-06',
      'Real run, read only, from the live site: python -m roe',
      'Better: point it at your fresher local files (COT, Cboe csv, T10Y3M). Copy roe/sources.default.json to roe_sources.laptop.json, edit the paths, then python -m roe --sources roe_sources.laptop.json',
      'To send the run to the server add --push (once: set the same long password, 24+ characters, as the Railway variable ROE_PUSH_TOKEN and as the laptop environment variable ROE_PUSH_TOKEN). A repeat of the same run changes nothing. If a push failed: python -m roe --push-only roe_out/<run id>',
      'Read the result in roe_out/<run id>/summary.md. Exit code 0 is ok, 2 is degraded (some inputs stale), 3 is failed.',
      'To run it daily after the daily run: Windows schtasks line or the cron line in roe/README.md under Schedule it after the daily run.',
    ],
    reads: ['local IBKR files, skew, cross-currency basis, feature store and M1 cache', 'GET /api/state (the Market State document)'], writes: ['the day\'s immutable snapshot, run ID, scan count and flags with episode and family IDs (pushed to the server)'], links: [ROE],
  }),
  A('question-writer', 'Question writer', 'Data', {
    purpose: 'Planned: turns each scanner flag into a written question from fixed templates: why it arose, the observation, the hypothesis, the data needed and the pre-registered test. Rules, no model call; an optional capped DeepSeek tidy of the wording may come later. It is never shown earlier results.',
    trigger: 'Not built. Planned: straight after the scanner, on the laptop.', planned: true, kind: 'service',
    reads: ['the scanner\'s flags', 'the question templates in plans/DATA_AGENT.md'], writes: ['questions pushed to the questions queue (no daily cap)'], links: [ROE],
  }),
  A('historical-evaluator', 'Historical evaluator', 'Data', {
    purpose: 'Planned: runs Stage 1 (discovery) and, for a frozen hypothesis, Stage 2 (confirmation, one look) on the permitted data windows only, with pre-specified horizons, the relevant baseline, costs, uncertainty and power. It must show incremental value over the baseline, not just significance. It is the quick-test and backtest machinery; no model call.',
    trigger: 'Not built. Planned: when new questions arrive in the queue.', planned: true, kind: 'service',
    reads: ['the questions queue', 'price and feature history up to the lockbox cut-off date', 'the Opportunity Registry (trial and family counts, same-spec check only)'], writes: ['Stage 1 and Stage 2 results (Evaluation Store)', 'the spec, window and test hash (Opportunity Registry)'], links: [ROE],
  }),
  A('forward-tracker', 'Forward tracker', 'Data', {
    purpose: 'Planned: Stage 3. From the date a hypothesis was frozen, records what happens on data that arrived afterwards against the frozen spec; the hypothesis is never rewritten. This is the real test; the discovery result is only a screen. Plain code, no model call.',
    trigger: 'Not built. Planned: daily, as each horizon closes.', planned: true, kind: 'service',
    reads: ['the frozen specs (with their freeze dates)', 'new daily data after the freeze date'], writes: ['forward outcomes (Forward Ledger)'], links: [ROE],
  }),

  // ── Tests: checks that decide whether an idea survives ──────────────────────────────────────────────────────
  A('quick-test', 'Quick test', 'Tests', {
    purpose: 'An exploratory "does X lead Y" check on the desk\'s own price data, linked to a proposal. Plain arithmetic: no model call. Never banked in the Evidence Book.',
    trigger: 'Owner presses Quick test on a plan.', reads: ['M1 and daily price data', 'the proposal\'s spec'], writes: ['research_pod_quicktests'],
    links: [L('Research pod', 'desk-office.html')],
  }),
  A('validation-desk', 'Validation desk', 'Tests', {
    purpose: 'Reviews a system card before anything runs: look-ahead, multiple testing, costs, what the test could not show.',
    trigger: 'Runs straight after the architect.', reads: ['the system card', 'the data inventory', 'the Evidence Book'], writes: ['research_pod_cards (the review)'],
    modelTask: 'desk-head', spends: true, roles: ['validation_desk'], links: [L('Research pod', 'desk-office.html')],
  }),
  A('control-single', 'Control (one prompt)', 'Tests', {
    purpose: 'One analyst given the whole Desk Pack in a single prompt. The desk\'s many-agent book is scored against this to show whether the extra structure is worth its cost.',
    trigger: 'End of each full morning desk run. It never sees the book.', reads: ['the Desk Pack, every area in one slice'], writes: ['the control book (in the day\'s desk run)'],
    modelTask: 'desk-head', spends: true, roles: ['control_single'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('claims-checker', 'Claims checker', 'Tests', {
    purpose: 'Checks what the desk published against the data and the Evidence Book and flags claims that do not hold.',
    trigger: 'Owner\'s run button on the claims page.', reads: ['published text', 'the data', 'the Evidence Book'], writes: ['desk claims (KV)'],
    modelTask: 'desk-head', spends: true, roles: ['claims_checker'], links: [L('Claim watch', 'claim-watch.html')],
  }),

  A('research-qa', 'Research QA', 'Tests', {
    purpose: 'Planned: says whether a test result can be interpreted at all, not whether the hypothesis is true. It checks the data, timestamp alignment, effective sample size (autocorrelation and overlap), the minimum detectable effect, controls and baseline, the test used and replication. It runs on every ROE result and before the Head accepts any null. Plain code, no model call.',
    trigger: 'Not built. Planned: automatically on each ROE evaluation result, and before a Head review that leans on a null.', planned: true, kind: 'service',
    reads: ['the Evaluation Store results', 'the researchers\' tests and datasets', 'quick-test results'], writes: ['an outcome per result: Pass, Underpowered, Misaligned, Missing control, Wrong test or Not replicated (several may apply), with the numbers'], links: [ROE],
  }),
  A('acceptance-check', 'Acceptance check', 'Tests', {
    purpose: 'Planned: checks a finished study against the acceptance criteria that were fixed in the system card and sets Validation approved when every required condition passes. It is the only thing that can set it, so a model never marks its own work validated. Plain code, no model call.',
    trigger: 'Not built. Planned: after the Validation desk review and the study run.', planned: true, kind: 'service',
    reads: ['the system card\'s acceptance criteria', 'the Validation desk review', 'the study results'], writes: ['the Validation approved status'], links: [ROE],
  }),

  // ── Library: the paper library and its helpers ──────────────────────────────────────────────────────────────
  A('paper-ingest', 'Paper intake', 'Library', {
    purpose: 'Takes an uploaded PDF (or a downloaded SSRN paper), stores it and pulls out its text with positions. Plain code: no model call.',
    trigger: 'Owner upload, or the laptop upload script.', reads: ['the PDF'], writes: ['R2 research/papers/<id>.pdf and .txt', 'research_pod_queue'],
    links: [L('Library', 'library.html')],
  }),
  A('paper-reader', 'Paper reader', 'Library', {
    purpose: 'Reads one paper (or up to eight abstracts) and writes structured notes: claim, mechanism, data, method, effect size, out-of-sample result, costs, caveats, what to test here.',
    trigger: 'Owner presses Read on the reading backlog (at most 12 calls a press), or Research an idea.', reads: ['the paper text', 'the Evidence Book', 'papers already read'], writes: ['research_pod_papers (notes)'],
    modelTask: 'research-reader', spends: true, roles: ['paper_reader'], links: [L('Library', 'library.html'), L('Literature desk', 'desk-office.html')],
  }),
  A('library-index', 'Library index', 'Library', {
    purpose: 'Builds one short row per paper (about 60-90 tokens) and a keyword search over them, so the right papers can be found without reading every note. Plain code: no model call.',
    trigger: 'Rebuilt whenever the paper catalogue changes.', reads: ['the paper catalogue', 'paper notes', 'figure and table notes'], writes: ['R2 research/papers/_index.json'],
    links: [L('Library index', 'library.html')],
  }),
  A('library-librarian', 'Library librarian', 'Library', {
    purpose: 'Finds the held papers that matter for a question: scans the index with a few keyword searches, asks one small model call to pick, then fetches full digests only for the picks. If it cannot run, the free rule-based top 6 is used instead.',
    trigger: 'A research round or Head review, but only when the library switch is on. Also the owner\'s preview button.',
    reads: ['the library index', 'paper digests'], writes: ['the LIBRARY section in the researchers\' prompts', 'the paper ids a round cites'],
    modelTask: 'library-librarian', toggles: ['libraryContext', 'libraryLibrarian'], cap: CAP.lib, spends: true, links: [L('Library', 'library.html')],
  }),
  A('library-math-rules', 'Equations: rules', 'Library', {
    purpose: 'Rebuilds an equation as LaTeX from the positioned characters and drawn rules on the PDF page, with a confidence. Free; the reader shows it when the confidence is high.',
    trigger: 'Opening a paper in the Library reader.', reads: ['equation blocks with positions'], writes: ['R2 research/papers/<id>.math.json'], links: [L('Library', 'library.html')],
  }),
  A('library-math-arxiv', 'Equations: arXiv', 'Library', {
    purpose: 'For a paper with an arXiv id, takes the exact LaTeX from the arXiv HTML page and matches it to the equations on the page. Free; one request per paper.',
    trigger: 'Opening a paper that has an arXiv id.', reads: ['arxiv.org/html/<id>'], writes: ['R2 research/papers/<id>.math.json'], links: [L('Library', 'library.html')],
  }),
  A('library-equations', 'Equations: tidy', 'Library', {
    purpose: 'Sends equations the two free layers could not settle (about 25 per call) to DeepSeek for LaTeX, checks every answer with KaTeX, and stops at the cap.',
    trigger: 'Owner presses the equations button on the Library page (at most 12 calls a press).', reads: ['unresolved equations and the sentence around them'], writes: ['R2 research/papers/<id>.math.json', 'library_math_v1 (calls used)'],
    modelTask: 'library-math', cap: CAP.math, spends: true, links: [L('Library', 'library.html')],
  }),
  A('library-figures', 'Figure & table notes', 'Library', {
    purpose: 'Writes a short "what this shows" note for each figure and table from the paper\'s text alone (it does not look at the picture).',
    trigger: 'Owner presses the figures button on the Library page (at most 12 calls a press).', reads: ['figure and table captions and the text around them'], writes: ['R2 figure notes', 'library_figs_v1 (calls used)'],
    modelTask: 'library-figs', cap: CAP.figs, spends: true, links: [L('Library', 'library.html')],
  }),
  A('library-briefing', 'MP3 briefing', 'Library', {
    purpose: 'Makes an audio briefing of a paper (abstract, the desk\'s notes, the conclusion; not the paper read aloud) with a free voice. No model call, no paid voice.',
    trigger: 'Owner presses Make MP3 in the reader.', reads: ['the paper\'s briefing script'], writes: ['R2 briefing MP3'], links: [L('Library', 'library.html')],
  }),
  A('library-ask-paper', 'Ask this paper', 'Library', {
    purpose: 'Planned: ask a question of one paper and get an answer with page references. Needs paid model calls, so it was left out of the first build.',
    trigger: 'Not built.', planned: true, spends: true, links: [L('Plan', 'plans/PAPER_LIBRARY.md')],
  }),
  A('library-auto-tagger', 'Model tagger', 'Library', {
    purpose: 'Planned: let a model suggest topic tags. Tags are rule-based today; the owner can add or remove them by hand.',
    trigger: 'Not built.', planned: true, spends: true, links: [L('Plan', 'plans/PAPER_LIBRARY.md')],
  }),

  // ── Desk: the morning run, top-down: global, currency, asset, risk, then the Head of Desk ───────────────────
  A('analysts-global', 'Global analysts', 'Desk', {
    purpose: 'Read the world: cross-asset risk tone and liquidity, credit and funding stress.',
    trigger: 'Morning desk run (weekdays from 06:55 London) or the Run button.', job: 'deskRun', reads: ['their slice of the Desk Pack', 'an Evidence Book slice'], writes: ['analyst reports (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['global_market', 'credit_funding'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('analysts-currency', 'Currency analysts', 'Desk', {
    purpose: 'Read each of the eight currencies: macro prints, central banks and rates, yield curves, positioning (COT).',
    trigger: 'Morning desk run.', job: 'deskRun', reads: ['their slices of the Desk Pack', 'an Evidence Book slice'], writes: ['analyst reports (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['macro_economy', 'rates_cb', 'yields_curve', 'cot_positioning'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('analysts-asset', 'Asset analysts', 'Desk', {
    purpose: 'Read each instrument: volatility and implied vol, options open interest, price levels and structure.',
    trigger: 'Morning desk run.', job: 'deskRun', reads: ['their slices of the Desk Pack', 'an Evidence Book slice'], writes: ['analyst reports (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['vol_iv', 'options_oi', 'levels_structure'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('evidence-clerk', 'Evidence clerk', 'Desk', {
    purpose: 'Hands the desk the validated findings and recent verdicts so nobody argues from something already tested and found empty.',
    trigger: 'Morning desk run.', job: 'deskRun', reads: ['the Evidence Book', 'direction ledger', 'yesterday\'s brief and review'], writes: ['analyst report (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['evidence_memory'], links: [L('Evidence', 'evidence.html')],
  }),
  A('global-desk', 'Global desk', 'Desk', {
    purpose: 'A risk-on case and a risk-off case argue over the global analysts\' reports, and the global manager rules.',
    trigger: 'Morning desk run, after the analysts.', job: 'deskRun', reads: ['global analyst reports'], writes: ['global ruling (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['risk_on', 'risk_off', 'global_manager'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('currency-desk', 'Currency desk', 'Desk', {
    purpose: 'For each currency a strengthen case and a weaken case argue, and the currency manager ranks the eight.',
    trigger: 'Morning desk run, after the global ruling.', job: 'deskRun', reads: ['the global ruling', 'currency analyst reports'], writes: ['currency ruling (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['ccy_strengthen', 'ccy_weaken', 'currency_manager'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('asset-desks', 'Asset desks', 'Desk', {
    purpose: 'One desk per group of instruments turns the currency views and the asset analysts\' reports into a draft rating for every instrument.',
    trigger: 'Morning desk run, after the currency ruling.', job: 'deskRun', reads: ['the global and currency rulings', 'asset analyst reports'], writes: ['draft cards (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['asset_desk'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('risk-desk', 'Risk desk', 'Desk', {
    purpose: 'Three voices (aggressive, neutral, conservative) size up the whole draft book, with its factor exposure and standard scenarios.',
    trigger: 'Morning desk run, after the asset desks.', job: 'deskRun', reads: ['the draft book', 'book factor risk (arithmetic)'], writes: ['risk voices (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['risk_aggressive', 'risk_neutral', 'risk_conservative'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('red-team', 'Red team', 'Desk', {
    purpose: 'Attacks the draft book before it is published: crowded bets, stories that contradict each other, leaning on tested nulls, events inside the window. The Head must answer each challenge.',
    trigger: 'Morning desk run, just before the Head of Desk.', job: 'deskRun', reads: ['the rulings', 'the draft book', 'the risk voices', 'events today'], writes: ['challenges (desk run)'],
    modelTask: 'desk-head', spends: true, roles: ['red_team'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('head-of-desk', 'Head of Desk', 'Desk', {
    purpose: 'Writes one card per instrument on the five-step scale, with size and plan, from everything above. Never turns a tested "no" into a "yes".',
    trigger: 'Morning desk run (the last of the debate).', job: 'deskRun', reads: ['all rulings', 'the risk desk', 'red team challenges', 'the analyst scorecard (if on)'], writes: ['the book (desk run), then the per-currency exposure cap'],
    modelTask: 'desk-head', spends: true, roles: ['head_of_desk'], links: [L('Desk run', 'desk-run.html'), L('Desk Office', 'desk-office.html')],
  }),
  A('economist', 'Economist', 'Desk', {
    purpose: 'Writes a short brief on each high-impact release in the next day and a half, from the desk\'s own history of how that release moves each market. Never gives a direction for the surprise.',
    trigger: 'Morning desk run, after the book.', job: 'deskRun', reads: ['releases ahead', 'the release history', 'the book'], writes: ['economist briefs (desk run)'],
    modelTask: 'desk-head', spends: true, roles: ['economist'], links: [L('Desk run', 'desk-run.html')],
  }),
  A('newsletter-writer', 'Newsletter writer', 'Desk', {
    purpose: 'Writes the desk edition of the newsletter from the book and the debate.',
    trigger: 'Morning desk run, after the book.', job: 'deskRun', reads: ['the book', 'the debate', 'analyst reports'], writes: ['the newsletter issue'],
    modelTask: 'desk-head', spends: true, roles: ['newsletter_writer'], links: [L('Newsletter', 'atlas.html')],
  }),
  A('session-update', 'Session update', 'Desk', {
    purpose: 'At the London and New York opens, updates only the cards that changed since the morning book, saying why. Logged against the morning book, never scored as a new one.',
    trigger: 'Weekdays, intraday slots (about 08:00 and 14:30 London).', job: 'deskUpdate', reads: ['prices against the lines', 'new releases', 'risk flags', 'the morning book'], writes: ['desk updates'],
    modelTask: 'desk-head', spends: true, roles: ['session_update'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('day-forecaster', 'Day forecaster', 'Desk', {
    purpose: 'Writes the forecast of the day: the expected range and path for each market.',
    trigger: 'Owner\'s run button, or after the morning book.', reads: ['the forecast lines', 'the book'], writes: ['the day forecast (KV)'],
    modelTask: 'desk-analyst', spends: true, roles: ['day_forecaster'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('reflection', 'Reflection', 'Desk', {
    purpose: 'After the day is scored, writes what the desk learned: what it got right and wrong, kept as memory for the next morning.',
    trigger: 'Weekdays after 21:10 London.', job: 'deskScore', reads: ['the score of the morning book', 'the book'], writes: ['desk memory'],
    modelTask: 'desk-analyst', spends: true, roles: ['reflection'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('evening-writer', 'Evening writer', 'Desk', {
    purpose: 'Writes the evening edition of the newsletter, including yesterday reviewed against what happened.',
    trigger: 'Weekdays after the day is scored.', job: 'deskScore', reads: ['the score', 'reflection', 'the morning book'], writes: ['the evening issue'],
    modelTask: 'desk-head', spends: true, roles: ['evening_writer'], links: [L('Newsletter', 'atlas.html')],
  }),
  A('weekly-strategist', 'Weekly strategist', 'Desk', {
    purpose: 'Sunday\'s view of the week ahead and Monday\'s starting point.',
    trigger: 'Sundays from 16:00 London.', job: 'deskWeekly', reads: ['the week\'s books and scores', 'the calendar'], writes: ['the weekly view'],
    modelTask: 'desk-head', spends: true, roles: ['weekly_strategist'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('allocation-committee', 'Allocation committee', 'Desk', {
    purpose: 'Reviews each live bot weekly and advises keep, cut, pause or raise. Advice only: the owner decides.',
    trigger: 'Sundays from 17:00 London.', job: 'allocationCommittee', reads: ['bot records', 'the Evidence Book'], writes: ['allocation_latest'],
    modelTask: 'desk-head', spends: true, roles: ['allocation_committee'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('trade-watcher', 'Trade watcher', 'Desk', {
    purpose: 'Alerts when a card reaches its entry zone, first target or invalidation. Plain code: no model call. Context, not an order.',
    trigger: 'Every few minutes while the market is open.', reads: ['the book\'s cards', 'live prices'], writes: ['Telegram alerts'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('chief-of-staff', 'Chief of staff', 'Desk', {
    purpose: 'Sends one short Telegram note in the morning (after the book) and one in the evening (after the score) summing up the Desk Office. No model call.',
    trigger: 'Once after the book, once after the score.', reads: ['the book', 'the score'], writes: ['Telegram notes'], links: [L('Desk Office', 'desk-office.html')],
  }),
  A('rules-keeper', 'Rules keeper', 'Desk', {
    purpose: 'Compares each live bot\'s settings with what the research found and raises a flag where they disagree (tested against, no basis, mode mismatch, silent). No model call.',
    trigger: 'Whenever the Desk Office opens.', reads: ['bot status', 'the Evidence Book', 'the research register'], writes: ['flags on the Desk Office'], links: [L('Desk Office', 'desk-office.html')],
  }),

  // ── News ────────────────────────────────────────────────────────────────────────────────────────────────────
  A('news-wire', 'News analyst', 'News', {
    purpose: 'Reads new tier-1 and tier-2 headlines (up to 20 at a time), tags them by currency and importance, and says which book cards each supports or goes against. Context, not a signal.',
    trigger: 'Every 2 minutes, when new headlines have arrived.', job: 'newsWire', reads: ['the headline feeds', 'today\'s live cards'], writes: ['the news wire (KV)', 'a Telegram note for a breaking tier-1 headline'],
    modelTask: 'desk-news', spends: true, roles: ['news_analyst'], links: [L('Desk Terminal', 'desk-terminal.html')],
  }),
  A('events-analyst', 'Events analyst', 'News', {
    purpose: 'Reports on the economic calendar for the morning run: what is due, what is priced, what could move the day.',
    trigger: 'Morning desk run (one of the analysts).', job: 'deskRun', reads: ['the calendar and event-window feeds'], writes: ['analyst report (desk run)'],
    modelTask: 'desk-analyst', spends: true, roles: ['events_news'], links: [L('Desk run', 'desk-run.html')],
  }),
];

// ── Boxes in the flow charts that are not agents ───────────────────────────────────────────────────────────────
export const POINTS = {
  owner: { name: 'Owner', kind: 'owner', note: 'You: a question, an upload, a button.' },
  'evidence-book': { name: 'Evidence Book', kind: 'store', note: 'js/deskEvidence.js: what has been tested and the verdict.' },
  'case-store': { name: 'Case registry', kind: 'store', note: 'The Research Case Registry. Exists today as KV research_cases (the question, the rounds, the reviews; origin owner or dossier). Planned fields: route (owner, ROE or literature), the Head\'s recommendation, and the three approval statuses with who set them.' },
  plan: { name: 'Plan', kind: 'output', note: 'The next step for each proposal: quick test, architect, preregister, park, drop.' },
  'prereg-card': { name: 'System card + prereg', kind: 'output', note: 'research_pod_cards.' },
  'paper-store': { name: 'Paper store', kind: 'store', note: 'R2 research/papers: PDF, text, blocks, maths.' },
  'paper-notes': { name: 'Paper notes', kind: 'store', note: 'KV research_pod_papers.' },
  'library-page': { name: 'Library page', kind: 'output', note: 'library.html: search, read, listen.' },
  'paper-source': { name: 'Upload / SSRN', kind: 'source', note: 'The owner\'s uploads and the downloaded SSRN list.' },
  arxiv: { name: 'arXiv HTML', kind: 'source', note: 'arxiv.org/html/<id>.' },
  'math-store': { name: 'Equation LaTeX', kind: 'store', note: 'R2 <id>.math.json.' },
  'fig-notes': { name: 'Figure notes', kind: 'store', note: 'R2 figure and table notes.' },
  'desk-pack': { name: 'Desk Pack', kind: 'store', note: 'One data pack per day that every desk skill reads.' },
  book: { name: 'The book', kind: 'output', note: 'One card per instrument.' },
  score: { name: 'Score', kind: 'store', note: 'The morning book scored against what happened.' },
  newsletter: { name: 'Newsletter', kind: 'output', note: 'Morning and evening editions.' },
  'headline-feed': { name: 'Headline feeds', kind: 'source', note: 'News wire sources.' },
  telegram: { name: 'Telegram', kind: 'output', note: 'Alerts and notes.' },
  'web-feeds': { name: 'Web research feeds', kind: 'source', note: 'arXiv, blogs and others read each run.' },
  hypothesis: { name: 'Idea', kind: 'source', note: 'A hypothesis typed by the owner.' },
  dossier: { name: 'Dossier', kind: 'store', note: 'KV research_pod_dossiers.' },
  'search-engines': { name: 'Scholar search', kind: 'source', note: 'arXiv, OpenAlex, Semantic Scholar, Crossref.' },
  question: { name: 'Question', kind: 'source', note: 'A free-text question.' },
  'input-snapshot': { name: 'Daily snapshot', kind: 'store', planned: true, note: 'Planned (ROE): the day\'s inputs frozen once and never overwritten, with a snapshot id, a run ID, content hashes and freshness flags (missing, stale, odd timestamps, incomplete session, revised macro data).' },
  'lockbox-boundary': { name: 'Lockbox boundary', kind: 'boundary', note: 'Existing rule, forge/LOCKBOX_PROTOCOL.md (unchanged): sessions after 2026-08-21 are H-A. Stage 1 and Stage 2 never read them; the scanner may read today\'s data only to observe state. Stage 3 uses only data that arrived after the hypothesis was frozen. See the plan, section 8.' },
  'stage-discovery': { name: 'Stage 1 Discovery', kind: 'stage', planned: true, note: 'Planned: finds promising questions on the discovery window. Never proof of an edge; walk-forward inside it is stability evidence, not independent confirmation.' },
  'stage-confirmation': { name: 'Stage 2 Confirmation', kind: 'stage', planned: true, note: 'Planned: a frozen hypothesis, specification and procedure on a dataset the question never touched, looked at once.' },
  'stage-forward': { name: 'Stage 3 Forward', kind: 'stage', planned: true, note: 'Planned: data that arrived after the hypothesis was frozen. The hypothesis cannot be rewritten.' },
  'evaluation-store': { name: 'Evaluation Store', kind: 'store', planned: true, note: 'Planned (ROE): every historical test result (Stage 1 and Stage 2), its data snapshot, feature version, code commit, test hash, seed and Research QA outcome. Read by the ranked board.' },
  'forward-ledger': { name: 'Forward Ledger', kind: 'store', planned: true, note: 'Planned (ROE): prospective outcomes (Stage 3), written once and resolved later, never back-issued (the js/directionLedger.js pattern). Not shown or used in any decision until the one lockbox evaluation has run.' },
  'owner-research-decision': { name: 'Owner: research', kind: 'owner', planned: true, note: 'Planned: the owner authorises Research approved, on the Head of Research\'s recommendation. No model sets it.' },
  'owner-design-decision': { name: 'Owner: design', kind: 'owner', planned: true, note: 'Planned: the owner authorises Design approved, on the System architect\'s recommendation. No model sets it.' },
  'daily-data': { name: 'Daily data', kind: 'source', note: 'Planned (ROE): what the owner holds. On the laptop: IBKR files, skew, cross-currency basis, the feature store and the M1 cache. On the server: GET /api/state.' },
  'question-queue': { name: 'Questions queue', kind: 'store', planned: true, note: 'Planned (ROE): a server KV key (name to be proposed, not created yet). Every written question, no daily cap.' },
  'opportunity-registry': { name: 'Opportunity registry', kind: 'store', planned: true, note: 'Planned (ROE): every observation, discovery episode, hypothesis family, question, spec and trial, with provenance. Used only to drop identical specs and to count trials for the multiple-testing correction. It never labels a question rejected or dead, never hides one, and is never shown to the question writer.' },
  'ranked-board': { name: 'Ranked board', kind: 'output', planned: true, note: 'Planned (ROE): questions ranked inside comparable families (no single league table), each with adjusted significance, effect size and interval, power, the gain over its baseline, the number of related tests, and a neutral history line. "Could not tell" is kept apart from "no effect found with adequate power". The owner presses Open case; nothing opens by itself.' },
  'research-approved': { name: 'Research approved', kind: 'output', planned: true, note: 'Planned status: the evidence supports proceeding. The Head of Research recommends it after adjudication; the owner authorises it. It is not a build instruction.' },
  'design-approved': { name: 'Design approved', kind: 'output', planned: true, note: 'Planned status: the architecture and implementation are specified. The System architect recommends it; the owner authorises it.' },
  'validation-approved': { name: 'Validation approved', kind: 'output', planned: true, note: 'Planned status: the tests and acceptance criteria passed. The Validation desk reviews; the deterministic acceptance check sets it when every required condition passes. A model never marks its own work validated.' },
  digests: { name: 'Paper digests', kind: 'output', note: 'The picked papers\' notes, cut to fit a prompt.' },
};

const E = (from, to, label, kind = 'data', o = {}) => ({ from, to, label, kind, ...o });
export const EDGES = [
  // research case
  E('owner', 'case-store', 'question', 'control'),
  E('case-store', 'library-librarian', 'the question', 'data', { optional: true }),
  E('library-librarian', 'researcher-quant', 'LIBRARY papers', 'data', { optional: true }),
  E('library-librarian', 'researcher-macro', 'LIBRARY papers', 'data', { optional: true }),
  E('library-librarian', 'researcher-flow', 'LIBRARY papers', 'data', { optional: true }),
  E('case-store', 'researcher-quant', 'question + rounds'),
  E('case-store', 'researcher-macro', 'question + rounds'),
  E('case-store', 'researcher-flow', 'question + rounds'),
  E('evidence-book', 'researcher-quant', 'slice'),
  E('evidence-book', 'researcher-macro', 'slice'),
  E('evidence-book', 'researcher-flow', 'slice'),
  E('researcher-quant', 'head-of-research', 'answer'),
  E('researcher-macro', 'head-of-research', 'answer'),
  E('researcher-flow', 'head-of-research', 'answer'),
  E('library-librarian', 'head-of-research', 'LIBRARY papers', 'data', { optional: true }),
  E('owner', 'head-of-research', 'Head review', 'control'),
  E('evidence-book', 'head-of-research', 'whole book'),
  E('head-of-research', 'plan', 'review + next step'),
  E('plan', 'quick-test', 'quick-test', 'control'),
  E('plan', 'system-architect', 'architect', 'control'),
  E('system-architect', 'validation-desk', 'system card'),
  E('validation-desk', 'prereg-card', 'review'),
  E('quick-test', 'evidence-book', 'verdict (owner banks it)', 'control', { optional: true }),
  E('prereg-card', 'evidence-book', 'tested, banked', 'control', { optional: true }),
  E('owner', 'research-vision', 'picture', 'control'),
  E('research-vision', 'case-store', 'reading'),
  // paper pipeline
  E('paper-source', 'paper-ingest', 'PDF'),
  E('paper-ingest', 'paper-store', 'text + positions'),
  E('paper-store', 'paper-reader', 'paper text'),
  E('owner', 'paper-reader', 'Read', 'control'),
  E('paper-reader', 'paper-notes', 'notes'),
  E('paper-notes', 'library-index', 'notes'),
  E('paper-store', 'library-index', 'catalogue'),
  E('library-index', 'library-librarian', 'index rows'),
  E('library-index', 'library-page', 'search + Index tab'),
  E('paper-store', 'library-page', 'PDF + text'),
  E('paper-notes', 'library-page', 'notes'),
  // library enrichment
  E('paper-store', 'library-math-rules', 'equation blocks'),
  E('library-math-rules', 'math-store', 'LaTeX (rules)'),
  E('arxiv', 'library-math-arxiv', 'exact LaTeX'),
  E('library-math-arxiv', 'math-store', 'LaTeX (exact)'),
  E('library-math-rules', 'library-math-arxiv', 'blocks to match'),
  E('library-math-arxiv', 'library-equations', 'still unresolved'),
  E('library-equations', 'math-store', 'best layer wins'),
  E('owner', 'library-equations', 'button', 'control'),
  E('paper-store', 'library-figures', 'captions + text'),
  E('owner', 'library-figures', 'button', 'control'),
  E('library-figures', 'fig-notes', 'what it shows'),
  E('fig-notes', 'library-index', 'digests'),
  E('math-store', 'library-page', 'maths'),
  E('fig-notes', 'library-page', 'figure notes'),
  E('paper-notes', 'library-briefing', 'notes + conclusion'),
  E('owner', 'library-briefing', 'Make MP3', 'control'),
  E('library-briefing', 'library-page', 'audio'),
  E('library-page', 'library-ask-paper', 'paper + question', 'control', { optional: true }),
  E('library-ask-paper', 'library-page', 'answer', 'data', { optional: true }),
  E('library-index', 'library-auto-tagger', 'rows', 'data', { optional: true }),
  E('library-auto-tagger', 'library-index', 'tags', 'data', { optional: true }),
  // librarian on its own
  E('question', 'library-librarian', 'question'),
  E('library-librarian', 'digests', 'picks + digests'),
  // investigate an idea
  E('hypothesis', 'literature-librarian', 'idea'),
  E('literature-librarian', 'search-engines', 'queries'),
  E('search-engines', 'paper-reader', 'papers found'),
  E('paper-reader', 'research-synthesist', 'notes'),
  E('research-synthesist', 'dossier', 'dossier'),
  E('dossier', 'case-store', 'open as a case', 'control'),
  E('web-feeds', 'researcher-quant', 'this week\'s feeds', 'data', { optional: true }),
  // daily desk
  E('desk-pack', 'analysts-global', 'slice'),
  E('desk-pack', 'analysts-currency', 'slice'),
  E('desk-pack', 'analysts-asset', 'slice'),
  E('desk-pack', 'events-analyst', 'calendar'),
  E('desk-pack', 'evidence-clerk', 'ledger'),
  E('evidence-book', 'evidence-clerk', 'validated + nulls'),
  E('analysts-global', 'global-desk', 'reports'),
  E('events-analyst', 'global-desk', 'events'),
  E('global-desk', 'currency-desk', 'global ruling'),
  E('analysts-currency', 'currency-desk', 'reports'),
  E('currency-desk', 'asset-desks', 'currency ruling'),
  E('analysts-asset', 'asset-desks', 'reports'),
  E('asset-desks', 'risk-desk', 'draft book'),
  E('asset-desks', 'red-team', 'draft book'),
  E('risk-desk', 'red-team', 'risk voices'),
  E('red-team', 'head-of-desk', 'challenges'),
  E('risk-desk', 'head-of-desk', 'sizing'),
  E('global-desk', 'head-of-desk', 'ruling'),
  E('currency-desk', 'head-of-desk', 'ruling'),
  E('evidence-clerk', 'head-of-desk', 'what is tested'),
  E('head-of-desk', 'book', 'cards'),
  E('book', 'economist', 'cards at risk'),
  E('book', 'newsletter-writer', 'the book'),
  E('economist', 'newsletter-writer', 'releases ahead'),
  E('newsletter-writer', 'newsletter', 'issue'),
  E('desk-pack', 'control-single', 'whole pack'),
  E('control-single', 'score', 'control book', 'data', { optional: true }),
  E('book', 'score', 'scored at close'),
  E('score', 'reflection', 'what happened'),
  E('reflection', 'evening-writer', 'lessons'),
  E('evening-writer', 'newsletter', 'evening issue'),
  E('book', 'session-update', 'morning book'),
  E('news-wire', 'session-update', 'headlines', 'data', { optional: true }),
  E('book', 'trade-watcher', 'cards'),
  E('trade-watcher', 'telegram', 'zone alerts'),
  E('book', 'chief-of-staff', 'the book'),
  E('score', 'chief-of-staff', 'the score'),
  E('chief-of-staff', 'telegram', 'morning + evening note'),
  E('headline-feed', 'news-wire', 'headlines'),
  E('news-wire', 'book', 'supports / against', 'data', { optional: true }),
  E('news-wire', 'telegram', 'breaking tier 1', 'data', { optional: true }),
  E('book', 'rules-keeper', 'bot settings vs research', 'data', { optional: true }),
  E('book', 'day-forecaster', 'the book'),
  E('book', 'claims-checker', 'published text', 'data', { optional: true }),
  E('book', 'weekly-strategist', 'the week\'s books', 'data', { optional: true }),
  E('book', 'allocation-committee', 'bot records', 'data', { optional: true }),
  E('evidence-book', 'theory-desk', 'verdicts', 'data', { optional: true }),
  // research QA gate and the three approval statuses (planned)
  E('researcher-quant', 'research-qa', 'null claims'),
  E('researcher-macro', 'research-qa', 'null claims'),
  E('researcher-flow', 'research-qa', 'null claims'),
  E('quick-test', 'research-qa', 'null result', 'data', { optional: true }),
  E('research-qa', 'head-of-research', 'power verdict'),
  E('head-of-research', 'owner-research-decision', 'recommends'),
  E('owner-research-decision', 'research-approved', 'authorises', 'control'),
  E('system-architect', 'owner-design-decision', 'recommends'),
  E('owner-design-decision', 'design-approved', 'authorises', 'control'),
  E('validation-desk', 'acceptance-check', 'review + results'),
  E('acceptance-check', 'validation-approved', 'all conditions pass', 'control'),
  E('case-store', 'head-of-research', 'rounds + answers', 'data', { optional: true }),
  // research discovery (Research Opportunity Engine, planned)
  E('daily-data', 'input-snapshot', 'frozen once'),
  E('input-snapshot', 'opportunity-scanner', 'snapshot + run ID'),
  E('opportunity-scanner', 'question-writer', 'flags + episode IDs'),
  E('question-writer', 'question-queue', 'questions pushed'),
  E('question-queue', 'opportunity-registry', 'observations kept'),
  E('question-queue', 'historical-evaluator', 'questions to test'),
  E('opportunity-registry', 'historical-evaluator', 'trial + family count'),
  E('historical-evaluator', 'opportunity-registry', 'spec, window, hash'),
  E('historical-evaluator', 'stage-discovery', 'Stage 1'),
  E('stage-discovery', 'stage-confirmation', 'frozen hypothesis', 'control'),
  E('lockbox-boundary', 'stage-discovery', 'protected data out', 'control'),
  E('lockbox-boundary', 'stage-confirmation', 'protected data out', 'control'),
  E('lockbox-boundary', 'stage-forward', 'only after freeze', 'control'),
  E('stage-discovery', 'evaluation-store', 'Stage 1 result'),
  E('stage-confirmation', 'evaluation-store', 'Stage 2 result'),
  E('evaluation-store', 'research-qa', 'results to check'),
  E('research-qa', 'ranked-board', 'can it be read?'),
  E('evaluation-store', 'ranked-board', 'results + pack'),
  E('owner', 'ranked-board', 'presses Open case', 'control'),
  E('ranked-board', 'case-store', 'Open case (button)', 'control'),
  E('stage-discovery', 'forward-tracker', 'frozen spec'),
  E('forward-tracker', 'stage-forward', 'Stage 3'),
  E('stage-forward', 'forward-ledger', 'forward outcomes'),
  E('forward-ledger', 'ranked-board', 'counts (held)', 'data', { optional: true }),
];

const G = (id, name, blurb, nodes, edges) => ({ id, name, blurb, nodes: nodes.map(([n, col, row]) => ({ id: n, col, row })), edges });
export const FLOWS = [
  G('research-case', 'Research case',
    'Three routes lead into one Case registry, with the same standard of evidence: you ask a question, the ROE board opens a case when you press the button, or an idea goes through the literature desk and its dossier is opened as a case. The three researchers each answer through their own lens (optionally with library papers), the Head of Research reviews them and recommends a next step. Planned, dashed: Research QA says whether a null can be interpreted before the Head accepts it, the owner authorises Research approved and Design approved on recommendations, and the deterministic Acceptance check sets Validation approved.',
    [['ranked-board', 0, 0], ['owner', 0, 1], ['hypothesis', 0, 3], ['literature-librarian', 1, 3], ['search-engines', 1, 4], ['paper-reader', 2, 4], ['research-synthesist', 2, 3], ['dossier', 2, 2],
      ['case-store', 3, 1], ['library-librarian', 3, 0], ['evidence-book', 3, 2], ['researcher-quant', 4, 0], ['researcher-macro', 4, 1], ['researcher-flow', 4, 2], ['research-qa', 5, 3], ['head-of-research', 6, 1],
      ['owner-research-decision', 7, 2], ['research-approved', 8, 3], ['plan', 7, 1], ['quick-test', 8, 1], ['system-architect', 8, 2], ['owner-design-decision', 9, 4], ['design-approved', 10, 4], ['validation-desk', 9, 2], ['acceptance-check', 10, 2], ['prereg-card', 10, 1], ['validation-approved', 11, 2]],
    ['owner>case-store', 'ranked-board>case-store', 'hypothesis>literature-librarian', 'literature-librarian>search-engines', 'search-engines>paper-reader', 'paper-reader>research-synthesist', 'research-synthesist>dossier', 'dossier>case-store',
      'case-store>library-librarian', 'library-librarian>researcher-quant', 'library-librarian>researcher-macro', 'library-librarian>researcher-flow', 'library-librarian>head-of-research',
      'case-store>researcher-quant', 'case-store>researcher-macro', 'case-store>researcher-flow', 'evidence-book>researcher-quant', 'evidence-book>researcher-macro', 'evidence-book>researcher-flow',
      'researcher-quant>head-of-research', 'researcher-macro>head-of-research', 'researcher-flow>head-of-research', 'researcher-quant>research-qa', 'researcher-macro>research-qa', 'researcher-flow>research-qa', 'quick-test>research-qa', 'research-qa>head-of-research',
      'head-of-research>owner-research-decision', 'owner-research-decision>research-approved', 'head-of-research>plan', 'plan>quick-test', 'plan>system-architect', 'system-architect>owner-design-decision', 'owner-design-decision>design-approved',
      'system-architect>validation-desk', 'validation-desk>prereg-card', 'validation-desk>acceptance-check', 'acceptance-check>validation-approved']),
  G('research-discovery', 'Research discovery',
    'Planned, nothing built (plans/RESEARCH_OPPORTUNITY_ENGINE.md, v2). The laptop freezes each day\'s inputs as an immutable snapshot with a run ID, the scanner flags extremes and divergences (each tagged with a discovery episode and a hypothesis family), a rules-based writer turns them into questions, and the registry keeps every observation. Stage 1 (Discovery) screens a question on the permitted history; a frozen hypothesis goes to Stage 2 (Confirmation, one look); Stage 3 (Forward) uses only data that arrived after the freeze. The lockbox boundary excludes protected data from Stages 1 and 2. Research QA says whether each result can be interpreted; the board ranks within comparable families and you press Open case. No case opens by itself, the registry never labels a question dead, and the writer never sees results. The Head recommends; you authorise Research approved.',
    [['daily-data', 0, 1], ['input-snapshot', 1, 1], ['opportunity-scanner', 2, 1], ['question-writer', 3, 1], ['question-queue', 4, 1], ['opportunity-registry', 4, 0], ['historical-evaluator', 5, 1], ['lockbox-boundary', 6, 0], ['stage-discovery', 6, 1], ['stage-confirmation', 7, 1],
      ['evaluation-store', 7, 0], ['research-qa', 8, 1], ['ranked-board', 9, 0], ['owner', 9, 1], ['forward-tracker', 6, 2], ['stage-forward', 7, 2], ['forward-ledger', 8, 2], ['case-store', 10, 0], ['head-of-research', 11, 0],
      ['owner-research-decision', 11, 1], ['research-approved', 11, 2]],
    ['daily-data>input-snapshot', 'input-snapshot>opportunity-scanner', 'opportunity-scanner>question-writer', 'question-writer>question-queue', 'question-queue>opportunity-registry', 'question-queue>historical-evaluator',
      'opportunity-registry>historical-evaluator', 'historical-evaluator>opportunity-registry', 'historical-evaluator>stage-discovery', 'stage-discovery>stage-confirmation', 'lockbox-boundary>stage-discovery', 'lockbox-boundary>stage-confirmation', 'lockbox-boundary>stage-forward',
      'stage-discovery>evaluation-store', 'stage-confirmation>evaluation-store', 'evaluation-store>research-qa', 'research-qa>ranked-board', 'evaluation-store>ranked-board', 'owner>ranked-board', 'ranked-board>case-store', 'stage-discovery>forward-tracker',
      'forward-tracker>stage-forward', 'stage-forward>forward-ledger', 'forward-ledger>ranked-board', 'case-store>head-of-research', 'head-of-research>owner-research-decision', 'owner-research-decision>research-approved']),
  G('paper-pipeline', 'Paper pipeline',
    'A paper is uploaded or downloaded, stored with its text and positions, read by the paper reader into notes, indexed, and then found by the librarian and the Library page.',
    [['paper-source', 0, 1], ['paper-ingest', 1, 1], ['paper-store', 2, 1], ['owner', 2, 0], ['paper-reader', 3, 0], ['paper-notes', 4, 0], ['library-index', 4, 1], ['library-librarian', 5, 1], ['library-page', 5, 0]],
    ['paper-source>paper-ingest', 'paper-ingest>paper-store', 'paper-store>paper-reader', 'owner>paper-reader', 'paper-reader>paper-notes', 'paper-notes>library-index', 'paper-store>library-index', 'library-index>library-librarian', 'library-index>library-page', 'paper-notes>library-page']),
  G('library-enrichment', 'Library enrichment',
    'After a paper is stored. Equations: free rules first, then the exact arXiv LaTeX where there is an arXiv id, then a capped DeepSeek tidy for what is still unresolved; the best layer wins. Figures and tables get a short note from the text. An MP3 briefing can be made from the notes. Planned extras are dashed.',
    [['paper-store', 0, 0], ['library-math-rules', 1, 0], ['library-math-arxiv', 2, 0], ['arxiv', 2, 1], ['library-equations', 3, 0], ['math-store', 4, 0],
      ['library-figures', 1, 2], ['fig-notes', 2, 2], ['library-index', 3, 2], ['library-auto-tagger', 4, 2],
      ['paper-notes', 0, 3], ['library-briefing', 1, 3], ['library-page', 2, 3], ['library-ask-paper', 3, 3]],
    ['paper-store>library-math-rules', 'library-math-rules>library-math-arxiv', 'arxiv>library-math-arxiv', 'library-math-arxiv>library-equations', 'library-equations>math-store',
      'paper-store>library-figures', 'library-figures>fig-notes', 'fig-notes>library-index', 'library-index>library-auto-tagger',
      'paper-notes>library-briefing', 'library-briefing>library-page', 'library-page>library-ask-paper']),
  G('daily-desk', 'Daily desk',
    'Top-down, every weekday morning: the analysts read the Desk Pack, the global then currency then asset desks argue and rule, the risk desk and red team test the draft book, and the Head of Desk writes the cards (reading every ruling above). After the close the book is scored and the evening edition written. The news wire runs all day.',
    [['desk-pack', 0, 2], ['analysts-global', 1, 0], ['events-analyst', 1, 1], ['analysts-currency', 1, 2], ['analysts-asset', 1, 3], ['global-desk', 2, 0], ['currency-desk', 2, 1], ['asset-desks', 3, 2],
      ['red-team', 4, 1], ['risk-desk', 4, 3], ['evidence-book', 3, 4], ['evidence-clerk', 4, 4], ['head-of-desk', 5, 2], ['book', 6, 2], ['headline-feed', 6, 0], ['news-wire', 7, 0], ['session-update', 8, 0],
      ['economist', 7, 1], ['newsletter-writer', 8, 2], ['newsletter', 9, 2], ['trade-watcher', 7, 3], ['telegram', 8, 3], ['control-single', 6, 4], ['score', 7, 4], ['reflection', 8, 4], ['evening-writer', 9, 4]],
    ['desk-pack>analysts-global', 'desk-pack>analysts-currency', 'desk-pack>analysts-asset', 'desk-pack>events-analyst', 'analysts-global>global-desk', 'events-analyst>global-desk', 'global-desk>currency-desk', 'analysts-currency>currency-desk',
      'currency-desk>asset-desks', 'analysts-asset>asset-desks', 'asset-desks>risk-desk', 'asset-desks>red-team', 'risk-desk>red-team', 'red-team>head-of-desk', 'risk-desk>head-of-desk', 'evidence-book>evidence-clerk', 'evidence-clerk>head-of-desk',
      'head-of-desk>book', 'book>economist', 'book>newsletter-writer', 'economist>newsletter-writer', 'newsletter-writer>newsletter', 'control-single>score', 'book>score', 'score>reflection', 'reflection>evening-writer', 'evening-writer>newsletter',
      'book>trade-watcher', 'trade-watcher>telegram', 'headline-feed>news-wire', 'news-wire>session-update']),
  G('librarian-alone', 'Librarian on its own',
    'A question goes in. The librarian scans the index with a few keyword searches, asks one small model call to pick the best papers, and fetches the full digest only for the picks. If it cannot run, the rule-based top 6 is used. This is the step shown (optional) inside the Research case.',
    [['question', 0, 0], ['library-index', 1, 1], ['library-librarian', 2, 0], ['digests', 3, 0]],
    ['question>library-librarian', 'library-index>library-librarian', 'library-librarian>digests']),
  G('investigate-idea', 'Research an idea',
    'The literature desk, the third route into research (the others are your own question and the ROE board): an idea becomes search queries, papers are found and read, and a dossier is written that can be opened as a case in the Case registry. Planned: the dossier keeps published_evidence (what papers claim) apart from internal_replication_evidence (what this repo has tested); a paper\'s finding is never validated evidence here by itself.',
    [['hypothesis', 0, 0], ['literature-librarian', 1, 0], ['search-engines', 2, 0], ['paper-reader', 3, 0], ['research-synthesist', 4, 0], ['dossier', 5, 0], ['case-store', 6, 0]],
    ['hypothesis>literature-librarian', 'literature-librarian>search-engines', 'search-engines>paper-reader', 'paper-reader>research-synthesist', 'research-synthesist>dossier', 'dossier>case-store']),
];

export const edgeKey = e => `${e.from}>${e.to}`;
export const agentById = id => AGENTS.find(a => a.id === id) ?? null;
export const nodeInfo = id => agentById(id) ?? (POINTS[id] ? { id, ...POINTS[id], point: true } : null);
export const nodeIds = () => new Set([...AGENTS.map(a => a.id), ...Object.keys(POINTS)]);

/** A flow resolved to its node objects and edge objects (what the chart draws). Throws on an unknown id, so a typo fails loudly. */
export function resolveFlow(flow) {
  const f = typeof flow === 'string' ? FLOWS.find(x => x.id === flow) : flow;
  if (!f) throw new Error(`no such flow: ${flow}`);
  const byKey = new Map(EDGES.map(e => [edgeKey(e), e]));
  const nodes = f.nodes.map(n => { const info = nodeInfo(n.id); if (!info) throw new Error(`flow ${f.id}: unknown node ${n.id}`); return { ...n, name: info.name, kind: info.point ? info.kind : 'agent', planned: !!info.planned, group: info.group ?? null }; });
  const ids = new Set(nodes.map(n => n.id));
  const edges = f.edges.map(k => { const e = byKey.get(k); if (!e) throw new Error(`flow ${f.id}: unknown edge ${k}`); if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`flow ${f.id}: edge ${k} leaves the flow`); return { ...e, planned: !!(nodeInfo(e.from)?.planned || nodeInfo(e.to)?.planned) }; });
  return { id: f.id, name: f.name, blurb: f.blurb, nodes, edges };
}
