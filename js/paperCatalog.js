/**
 * Paper catalog: the pure layer of the Paper Library page (plans/PAPER_LIBRARY.md).
 *
 * Plain data in, plain data out. No I/O, no model calls, no network: tagging, search, desk links, theory links,
 * "read next" and "case from a paper" are all rule-based, so the library costs nothing to run. The server loads the
 * records from KV and R2 and calls these functions; nothing here reads a paper from disk.
 *
 *   joinCatalog      read papers + uploaded-but-unread queue items -> Paper[] (the API contract)
 *   TOPICS, autoTags, applyOverrides, topicCounts      rule-based topic tags (15 families)
 *   buildIndex, addDoc, removeDoc, search              in-memory BM25 full-text index with snippets
 *   deskLinks        Evidence Book entries related to a paper (never invents a verdict)
 *   theoryLinks      topics -> Theory Lab lesson slugs
 *   parseTodoList    education/papers/SSRN_DOWNLOAD_LIST.md -> to-get items
 *   readNext         unread papers ranked against the open research cases
 *   caseFromPaper    a research case from a paper (free: no model call)
 */

import { DESK_EVIDENCE } from './deskEvidence.js';
import { firstTitleLine } from './literature.js';
import { newCase } from './researchCase.js';

// ── tokens and stems ───────────────────────────────────────────────────────────────────────────────────────────

const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours et al fig figure table eq equation however thus therefore may might must shall within without upon per via vs').split(/\s+/));

const undouble = w => (w.length > 3 && w.at(-1) === w.at(-2) && !'lsz'.includes(w.at(-1)) ? w.slice(0, -1) : w);
function stemWord(w) {
  if (w.length < 4 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (/(?:x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ied')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith('ing')) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith('ed')) w = undouble(w.slice(0, -2));
  else if (w.length > 5 && w.endsWith('ly')) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}
const stemCache = new Map();
/** A light stemmer (plurals, -ing, -ed, -ly, a trailing e): "hedging", "hedged", "hedges" and "hedge" share a stem. */
export function stem(w) {
  let s = stemCache.get(w);
  if (s === undefined) { s = stemWord(w); if (stemCache.size < 300_000) stemCache.set(w, s); }
  return s;
}

const WORD = /[a-z0-9]+/g;
const ASCII = /^[\x00-\x7f]*$/;
const fold = s => { s = String(s ?? '').toLowerCase(); return ASCII.test(s) ? s : s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[–—‑−]/g, '-'); };
/** Lowercase word tokens (accents folded, hyphens split), stop words and one-letter tokens dropped. */
export function tokens(s) { const out = []; for (const m of fold(s).matchAll(WORD)) if (m[0].length > 1 && !STOP.has(m[0])) out.push(m[0]); return out; }

// ── topics ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The 15 families. A term is a word or phrase (up to three words, stemmed like the text) with a weight; "=word" matches the
 * exact word (no stemming). Weights are tuned so that ONE mention of a main word in an abstract is not enough for a tag, two
 * are, and a title word always is.
 */
export const TOPICS = [
  { key: 'volatility', label: 'Volatility', terms: [['volatility', 1.5], ['volatile', 0.5], ['realized volatility', 2], ['realized variance', 3], ['implied volatility', 1.5], ['stochastic volatility', 2], ['garch', 3], ['arch', 1], ['har', 1.5], ['har rv', 3], ['vix', 2.5], ['variance risk', 2.5], ['variance swap', 2], ['variance', 0.5], ['volatility forecast', 2], ['volatility clustering', 2.5], ['volatility index', 2], ['heston', 2], ['bipower', 1.5], ['parkinson', 1.5], ['garman klass', 2], ['range based', 1], ['volatility target', 1.5], ['volatility risk', 2], ['vol of vol', 2]] },
  { key: 'jump', label: 'Jump / diffusion', terms: [['jump', 1.8], ['jump diffusion', 3], ['jump test', 3], ['jump risk', 2], ['cojump', 3], ['poisson', 1], ['bipower variation', 2.5], ['bates', 2], ['merton', 1], ['levy', 1.5], ['lee mykland', 3], ['discontinuity', 1], ['flash crash', 1]] },
  { key: 'brownian', label: 'Brownian motion & stochastic processes', terms: [['brownian', 3], ['wiener', 2.5], ['ito', 2.5], ['stochastic calculus', 3], ['stochastic process', 2.5], ['stochastic differential', 3], ['sde', 2.5], ['martingale', 1.5], ['girsanov', 3], ['fokker planck', 3], ['ornstein uhlenbeck', 1.5], ['random walk', 1.5], ['diffusion', 0.5], ['levy process', 1.5], ['hurst', 1], ['fractional brownian', 3], ['quadratic variation', 2], ['markov process', 1.5], ['stochastic', 0.4]] },
  { key: 'options', label: 'Options & dealer gamma', terms: [['option', 1.5], ['gamma', 2], ['dealer', 2], ['gamma exposure', 3], ['gex', 3], ['delta hedge', 2.5], ['open interest', 1], ['black scholes', 2], ['market maker', 1], ['call option', 1.5], ['put option', 1.5], ['skew', 1], ['strike', 1.5], ['option pricing', 2], ['greek', 1.5], ['straddle', 2], ['0dte', 3], ['expiration', 1], ['vanna', 3], ['charm', 1], ['implied volatility', 1], ['volatility smile', 2], ['volatility surface', 2], ['derivative', 1], ['hedging pressure', 1.5]] },
  { key: 'cot', label: 'COT & positioning', terms: [['cot', 3], ['commitment trader', 3], ['commitments of traders', 3], ['speculative position', 3], ['net position', 2], ['=positioning', 2], ['hedger', 2], ['speculator', 2], ['large trader', 2], ['crowded', 1.5], ['investor sentiment', 1], ['fund flow', 1], ['trader report', 2], ['commercial hedger', 2], ['managed money', 2], ['position extreme', 2]] },
  { key: 'fx', label: 'FX & carry', terms: [['carry', 2], ['carry trade', 3], ['currency', 2], ['exchange rate', 2], ['fx', 2.5], ['forex', 3], ['foreign exchange', 3], ['covered interest', 2.5], ['uncovered interest', 2.5], ['interest rate parity', 2.5], ['forward premium', 2.5], ['dollar', 1], ['yen', 1.5], ['euro', 1], ['purchasing power', 2], ['ppp', 1.5], ['devaluation', 1], ['currency crash', 3], ['carry crash', 3], ['carry crash risk', 1], ['peg', 1], ['eurusd', 3], ['usdjpy', 3]] },
  { key: 'trend', label: 'Trend & momentum', terms: [['momentum', 2], ['trend follow', 3], ['trend', 1], ['moving average', 2], ['breakout', 1.5], ['crossover', 1], ['cta', 2], ['managed future', 3], ['tsmom', 3], ['time series momentum', 2], ['cross sectional momentum', 2], ['trend filter', 2], ['trend signal', 2], ['donchian', 2], ['momentum crash', 2]] },
  { key: 'meanrev', label: 'Mean reversion & pairs', terms: [['mean reversion', 3], ['mean revert', 3], ['pair trade', 3], ['pair', 0.7], ['cointegration', 2.5], ['cointegrat', 2.5], ['statistical arbitrage', 3], ['ornstein uhlenbeck', 2], ['half life', 1.5], ['overreaction', 1.5], ['reversal', 1.5], ['contrarian', 1.5], ['stationarity', 1], ['spread trade', 1.5], ['fade', 0.7]] },
  { key: 'rates', label: 'Rates & FOMC', terms: [['fomc', 3], ['federal reserve', 2], ['monetary policy', 2], ['yield curve', 2], ['treasury', 1.5], ['interest rate', 1], ['bond', 1], ['term structure', 1.5], ['central bank', 1.5], ['announcement', 0.7], ['fed', 1.5], ['taylor rule', 2], ['inflation', 1], ['quantitative easing', 2], ['term premium', 2], ['swap', 0.7], ['ois', 1.5], ['treasury yield', 2], ['forward guidance', 2], ['payroll', 1], ['cpi', 1], ['macro announcement', 2], ['short rate', 1.5], ['rate hike', 1.5], ['policy rate', 1.5]] },
  { key: 'commodities', label: 'Gold & commodities', terms: [['gold', 3], ['commodity', 2.5], ['oil', 1.5], ['crude', 2], ['roll yield', 2.5], ['contango', 2], ['backwardation', 2], ['metal', 1.5], ['precious metal', 2], ['safe haven', 1.5], ['copper', 2], ['wti', 2], ['convenience yield', 2.5], ['agricultural', 1.5], ['energy', 0.7], ['silver', 1.5], ['bullion', 2], ['commodity future', 2]] },
  { key: 'risk', label: 'Risk & portfolio', terms: [['portfolio', 1.5], ['risk parity', 3], ['diversification', 1.5], ['markowitz', 2], ['mean variance', 2], ['black litterman', 3], ['expected shortfall', 2.5], ['drawdown', 2], ['tail risk', 2], ['kelly', 2], ['position siz', 2.5], ['risk management', 1.5], ['hierarchical risk', 2.5], ['covariance', 1.5], ['shrinkage', 1], ['asset allocation', 2], ['cvar', 3], ['value at risk', 2.5], ['beta', 1], ['risk budget', 2], ['equal risk contribution', 3], ['leverage', 0.7], ['portfolio construction', 2], ['sharpe ratio', 0.7]] },
  { key: 'backtest', label: 'Backtest & method', terms: [['backtest', 3], ['overfit', 3], ['data snoop', 3], ['multiple testing', 3], ['deflated sharpe', 3], ['walk forward', 2.5], ['out of sample', 1.5], ['in sample', 1], ['cross validation', 2], ['lookahead', 2], ['look ahead', 2], ['survivorship', 2], ['bootstrap', 1.5], ['p hack', 2.5], ['reality check', 2.5], ['false discovery', 2.5], ['multiple comparison', 2.5], ['replication', 1.5], ['pre register', 2], ['statistical significance', 1], ['selection bias', 2], ['data mining', 2], ['multiple hypothesis', 2.5]] },
  { key: 'microstructure', label: 'Microstructure & order flow', terms: [['order flow', 3], ['order book', 3], ['limit order', 3], ['bid ask', 2], ['spread', 0.5], ['liquidity', 1.5], ['market impact', 2.5], ['price impact', 2.5], ['microstructure', 3], ['high frequency', 2], ['tick', 1], ['trade imbalance', 2.5], ['order imbalance', 3], ['adverse selection', 2], ['informed trad', 2], ['vpin', 3], ['kyle', 1.5], ['latency', 1.5], ['quote', 1], ['market maker', 1], ['order flow imbalance', 1]] },
  { key: 'ml', label: 'Machine learning', terms: [['machine learning', 3], ['neural network', 3], ['neural', 1.5], ['deep learning', 3], ['random forest', 3], ['gradient boosting', 3], ['lstm', 3], ['transformer', 2], ['reinforcement learning', 3], ['classifier', 1.5], ['feature engineering', 2.5], ['lasso', 2], ['xgboost', 3], ['support vector', 2], ['artificial intelligence', 2], ['hyperparameter', 2], ['supervised', 1.5], ['deep neural', 2], ['train set', 1], ['regularization', 1], ['ensemble', 1]] },
  { key: 'regimes', label: 'Regimes & HMM', terms: [['hidden markov', 3], ['hmm', 3], ['regime', 2], ['regime switching', 3], ['markov switching', 3], ['change point', 2.5], ['structural break', 2], ['state space', 1.5], ['viterbi', 2], ['baum welch', 3], ['bull bear', 1], ['market state', 1.5], ['hamilton', 1], ['latent state', 2], ['threshold autoregressive', 2], ['regime shift', 2.5], ['regime change', 2.5]] },
];
const TOPIC_BY_KEY = Object.fromEntries(TOPICS.map(t => [t.key, t]));
export const TOPIC_KEYS = TOPICS.map(t => t.key);

// compile: stemmed n-gram strings (1 to 3 words), or "=word" for exact words
const normTerm = term => (term[0] === '=' ? term : tokens(term).map(stem).join(' '));
const COMPILED = TOPICS.map(t => ({ ...t, terms: t.terms.map(([term, w]) => [normTerm(term), w]) }));
const WANT = new Set(COMPILED.flatMap(t => t.terms.map(([k]) => k)));
const WANT_N = Math.max(...[...WANT].map(k => (k[0] === '=' ? 1 : k.split(' ').length)));

/** term -> count for every compiled term found in `str` (stemmed n-grams up to 3 words; "=word" for exact words). */
function countTerms(str) {
  const counts = new Map();
  const raw = tokens(str), st = raw.map(stem), bump = k => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (let i = 0; i < raw.length; i++) {
    if (WANT.has(`=${raw[i]}`)) bump(`=${raw[i]}`);
    let key = '';
    for (let n = 0; n < WANT_N && i + n < st.length; n++) { key = n ? `${key} ${st[i + n]}` : st[i]; if (WANT.has(key)) bump(key); }
  }
  return counts;
}

const noteStr = v => (v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map(noteStr).join(' ') : typeof v === 'object' ? Object.values(v).map(noteStr).join(' ') : String(v));
/** The note fields that say what a paper is about (caveats, costs and cross references mention other topics in passing, so they are left out). */
export const notesText = n => (n && typeof n === 'object' ? ['claim', 'mechanism', 'data', 'method', 'effect', 'relevance', 'testHere'].map(k => noteStr(n[k])).filter(Boolean).join('\n') : noteStr(n));

export const TAG_RULES = { title: 5, mid: 1, text: 0.05, textCap: 3, midMaxCount: 3, textMaxCount: 20, min: 4.5, relative: 0.15, maxTags: 6, maxTextChars: 300_000 };

/**
 * Score every topic for a paper: title (heavy, once per term), abstract + notes (medium, up to 3 mentions per term),
 * full text (light, 20 mentions per term at most, 3 points per topic at most). Returns [{ key, label, score }] sorted by score.
 */
export function scoreTopics({ title = '', abstract = '', notes = null, text = '' } = {}) {
  const R = TAG_RULES, T = countTerms(title), M = countTerms(`${abstract ?? ''}\n${notesText(notes)}`), X = text ? countTerms(String(text).slice(0, R.maxTextChars)) : new Map();
  return COMPILED.map(t => {
    let s = 0, x = 0;
    for (const [k, w] of t.terms) {
      if (T.has(k)) s += R.title * w;
      const m = M.get(k); if (m) s += Math.min(m, R.midMaxCount) * R.mid * w;
      const c = X.get(k); if (c) x += Math.min(c, R.textMaxCount) * R.text * w;
    }
    return { key: t.key, label: t.label, score: Math.round((s + Math.min(x, R.textCap)) * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
}

/** The auto tags: [{ key, label, source:'auto' }], at most six, strongest first. Deterministic. */
export function autoTags(paper = {}) {
  const sc = scoreTopics(paper), top = sc[0]?.score ?? 0, R = TAG_RULES;
  return sc.filter(x => x.score >= R.min && x.score >= R.relative * top).slice(0, R.maxTags).map(x => ({ key: x.key, label: x.label, source: 'auto' }));
}

/** Manual overrides: `remove` keys drop a tag, `add` keys add one (or take over an auto tag) with source 'manual'. Unknown keys are ignored. */
export function applyOverrides(tags, { add = [], remove = [] } = {}) {
  const rm = new Set((remove ?? []).filter(k => TOPIC_BY_KEY[k])), out = (tags ?? []).filter(t => !rm.has(t.key)).map(t => ({ ...t }));
  for (const k of add ?? []) {
    if (!TOPIC_BY_KEY[k] || rm.has(k)) continue;
    const have = out.find(t => t.key === k);
    if (have) have.source = 'manual'; else out.push({ key: k, label: TOPIC_BY_KEY[k].label, source: 'manual' });
  }
  return out;
}

/** [{ key, label, count }] for all 15 topics, in topic order (zero counts included). */
export function topicCounts(papers) {
  return TOPICS.map(t => ({ key: t.key, label: t.label, count: (papers ?? []).filter(p => (p.tags ?? []).some(x => x.key === t.key)).length }));
}

// ── source of a paper (rule-based, from fields we already hold) ──────────────────────────────────────────────

export const SOURCES = [
  { key: 'ssrn', label: 'SSRN' }, { key: 'arxiv', label: 'arXiv' }, { key: 'nber', label: 'NBER' },
  { key: 'fed', label: 'Federal Reserve / NY Fed' }, { key: 'ecb', label: 'ECB' }, { key: 'boe', label: 'Bank of England' },
  { key: 'bis', label: 'BIS' }, { key: 'imf', label: 'IMF' },
  { key: 'k151', label: '151 Trading Strategies (Kakushadze & Serur)' }, { key: 'quantconnect', label: 'QuantConnect strategy library' },
  { key: 'reading', label: 'Reading list' }, { key: 'upload', label: 'Other upload' }, { key: 'other', label: 'Other' },
];
const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map(s => [s.key, s]));
const src = key => ({ key, label: SOURCE_BY_KEY[key].label });
const HOSTS = [ // host suffix -> key
  ['arxiv.org', 'arxiv'], ['ssrn.com', 'ssrn'], ['nber.org', 'nber'], ['federalreserve.gov', 'fed'], ['newyorkfed.org', 'fed'], ['frbsf.org', 'fed'],
  ['stlouisfed.org', 'fed'], ['chicagofed.org', 'fed'], ['philadelphiafed.org', 'fed'], ['bostonfed.org', 'fed'], ['clevelandfed.org', 'fed'], ['kansascityfed.org', 'fed'],
  ['dallasfed.org', 'fed'], ['richmondfed.org', 'fed'], ['minneapolisfed.org', 'fed'], ['atlantafed.org', 'fed'], ['ecb.europa.eu', 'ecb'],
  ['bankofengland.co.uk', 'boe'], ['bis.org', 'bis'], ['imf.org', 'imf'], ['quantconnect.com', 'quantconnect'],
];
const VENUES = [ // venue text -> key
  [/\bssrn\b/i, 'ssrn'], [/\barxiv\b/i, 'arxiv'], [/\bnber\b|national bureau of economic research/i, 'nber'],
  [/federal reserve|\bfrb[a-z]*\b|\bfed(?:eral)? (?:board|funds)\b|\bfeds\b|new york fed|finance and economics discussion|staff report/i, 'fed'],
  [/european central bank|\becb\b/i, 'ecb'], [/bank of england|\bboe\b/i, 'boe'], [/bank for international settlements|\bbis\b/i, 'bis'], [/international monetary fund|\bimf\b/i, 'imf'],
];
const hostKey = url => {
  let h; try { h = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
  const hit = HOSTS.find(([d]) => h === d || h.endsWith('.' + d));
  return hit ? hit[1] : null;
};
const doiKey = doi => { const d = String(doi ?? '').toLowerCase(); return /10\.2139\/ssrn/.test(d) ? 'ssrn' : /10\.48550\/arxiv/.test(d) ? 'arxiv' : /10\.3386\//.test(d) ? 'nber' : null; };
const nameKey = name => { // SSRN-style or arXiv-style upload file names
  const n = String(name ?? '');
  if (/ssrn[-_ ]?(?:id)?[-_ ]?\d{4,8}/i.test(n)) return 'ssrn';
  if (/arxiv|^\s*(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?[_-]?\d{7})(?:v\d+)?(?:\D|$)/i.test(n)) return 'arxiv';
  return null;
};

/**
 * The source of a paper as { key, label }, from data we already hold. No model, no network. First rule that fires wins:
 *   1. a curated collection named by the queue item's `source` ('151 Trading Strategies ...', 'QuantConnect ...')
 *   2. the identifiers: ssrn id, arxiv id, then the DOI prefix (10.2139/ssrn, 10.48550/arxiv, 10.3386 = NBER)
 *   3. the paper url host (arxiv.org, nber.org, federalreserve.gov, newyorkfed.org, ecb.europa.eu, bankofengland.co.uk, bis.org, ...)
 *   4. the venue text (NBER Working Paper, Federal Reserve Bank ..., ECB Working Paper Series, ...)
 *   5. the rest of the queue `source`: 'SSRN manifest' -> SSRN; 'reading list' -> Reading list
 *   6. an upload: the file name (SSRN-style or arXiv-style) else 'Other upload' (queue source 'upload' or an upload name present)
 *   7. otherwise 'Other'
 * record: { source?, queueSource?, ssrn?, arxiv?, doi?, url?, venue?, uploadName?, readFrom? }
 */
export function sourceOf(record = {}) {
  const r = record ?? {}, q = String(r.queueSource ?? (typeof r.source === 'string' ? r.source : '') ?? '').toLowerCase();
  if (/151 trading|kakushadze/.test(q)) return src('k151');
  if (/quantconnect/.test(q)) return src('quantconnect');
  if (r.ssrn) return src('ssrn');
  if (r.arxiv) return src('arxiv');
  const d = doiKey(r.doi); if (d) return src(d);
  const h = hostKey(r.url); if (h) return src(h);
  const v = VENUES.find(([re]) => re.test(String(r.venue ?? ''))); if (v) return src(v[1]);
  if (/ssrn/.test(q)) return src('ssrn');
  if (/reading/.test(q)) return src('reading');
  const isUpload = /^upload/.test(q) || !!r.uploadName || /^upload/.test(String(r.readFrom ?? ''));
  if (isUpload) {
    const m = r.manifest ? sourceOfManifest(r.manifest) : null;   // a free-paper manifest entry matched by file name or title
    return m ?? src(nameKey(r.uploadName) ?? 'upload');
  }
  return src('other');
}

/** Normalised match key: lowercase, no extension, no trailing "(year)", letters and digits only. */
export const normTitle = s => String(s ?? '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/\(\s*(?:19|20)\d\d\s*\)\s*$/, '').replace(/[^a-z0-9]+/g, '');
/** Map of normalised title -> manifest entry ({ title, year, source, url, doi }) from education/papers/free_sources.json. */
export function freeLookup(entries) {
  const m = new Map();
  for (const e of Array.isArray(entries) ? entries : []) { const k = e?.title ? normTitle(e.title) : ''; if (k.length >= 8 && !m.has(k)) m.set(k, e); }
  return m;
}
const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/**
 * Source of a manifest entry, by the same rules (url host, doi prefix, ids). Author / university pages with an SSRN doi are SSRN;
 * other author pages are 'Author / university page'; anything else is labelled with the manifest's own source text.
 */
export function sourceOfManifest(e) {
  if (!e) return null;
  const s = sourceOf({ url: e.url, doi: e.doi, arxiv: /^arxiv:/i.test(String(e.doi ?? '')) ? 'x' : null });
  if (s.key !== 'other') return s;
  const text = String(e.source ?? '').trim();
  if (/^author\b|university|repository/i.test(text)) return { key: 'author', label: 'Author / university page' };
  return text && slug(text) ? { key: slug(text), label: text } : src('other');
}

/** [{ key, label, count }] of the sources present, in SOURCES order then any manifest-only ones (zero counts left out). */
export function sourceCounts(papers) {
  const n = new Map();
  for (const p of papers ?? []) { const k = p?.source?.key; if (k) n.set(k, (n.get(k) ?? 0) + 1); }
  const known = SOURCES.filter(s => n.has(s.key)).map(s => ({ ...s, count: n.get(s.key) }));
  const extra = [...n.keys()].filter(k => !SOURCE_BY_KEY[k]).map(k => ({ key: k, label: (papers.find(p => p.source?.key === k).source.label), count: n.get(k) }));
  return known.concat(extra.sort((a, b) => a.label.localeCompare(b.label)));
}

// ── release year (rule-based, never invented) ───────────────────────────────────────────────────────────────

const MIN_YEAR = 1980;
const thisYear = now => new Date(now ?? Date.now()).getUTCFullYear();
const okYear = (y, now) => Number.isInteger(y) && y >= MIN_YEAR && y <= thisYear(now);
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
// a year that follows these is a period or a citation, not the paper's date: "since 1987", "from 1990 to 2010", "in 1998", "(Fama, 1993)"
const PERIOD_BEFORE = /(?:\b(?:since|from|between|during|until|till|through|thru|to|and|or|in|of|over|after|before|by|at|around|circa|c\.|ca\.|late|early|mid|the year|year|fiscal|fy)|[-–—/])[ \t]*(?:the[ \t]+)?$/i;
const CITE_BEFORE = /(?:[A-Z][A-Za-z'’-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-z'’-]+)?(?:\s+et\s+al\.?)?,?[ \t]*\(?|\bet\s+al\.?,?[ \t]*\(?|\[|\()$/;
const RANGE_AFTER = /^\s*(?:[-–—]|to\s)\s*(?:19|20)?\d{2}/i;

/** arXiv id -> year: yymm.nnnnn (2007+) or archive/yymmnnn (old style, 91-99 -> 19yy, 00-06 -> 20yy); month must be 01-12. */
export function arxivYear(id) {
  const s = String(id ?? '').trim().replace(/^arxiv:/i, '');
  let m = s.match(/^(\d{2})(\d{2})\.\d{4,5}(?:v\d+)?$/), yy, mm, modern = true;
  if (!m) { m = s.match(/^[a-z-]+(?:\.[a-z]{2})?\/(\d{2})(\d{2})\d{3}(?:v\d+)?$/i); modern = false; }
  if (!m) return null;
  yy = +m[1]; mm = +m[2]; if (mm < 1 || mm > 12) return null;
  const y = modern ? (yy >= 7 ? 2000 + yy : null) : (yy >= 91 ? 1900 + yy : 2000 + yy);
  return y;
}
const arxivFromName = name => { // an arXiv id in an upload file name: 2001.00001, 2001.00001v2, hep-th_9901001, hep-th-9901001
  const n = String(name ?? '').replace(/\.[a-z0-9]{2,4}$/i, '');
  const a = n.match(/(?:^|[^\d.])(\d{4}\.\d{4,5})(?:v\d+)?(?:$|[^\d])/); if (a) return a[1];
  const o = n.match(/(?:^|[^a-z])([a-z]+(?:-[a-z]+)?)[_\-/ ](\d{7})(?:v\d+)?(?:$|[^\d])/i); return o ? `${o[1]}/${o[2]}` : null;
};
const nameYear = name => { const m = String(name ?? '').replace(/\.[a-z0-9]{2,4}$/i, '').match(/\(\s*((?:19|20)\d\d)\s*\)\s*$/); return m ? +m[1] : null; };

/** Candidate years in the head of a paper, by tier. Returns the year or null. head = the first ~3000 characters. */
function textYear(text, now) {
  let head = String(text ?? '').slice(0, 3000);
  const ref = head.search(/\n\s*(?:references|bibliography)\s*\n/i); if (ref >= 0) head = head.slice(0, ref);
  const first = (re, { guard = true } = {}) => {
    for (const m of head.matchAll(re)) {
      const y = +m[m.length - 1].slice(-4), at = m.index, whole = m[0];
      if (!okYear(y, now)) continue;
      if (guard) { const before = head.slice(Math.max(0, at - 40), at), after = head.slice(at + whole.length, at + whole.length + 12);
        if (PERIOD_BEFORE.test(before) || RANGE_AFTER.test(after)) continue; }
      return y;
    }
    return null;
  };
  const Y = '((?:19|20)\\d\\d)(?!\\d)';
  return first(new RegExp(`(?:copyright|©|\\(c\\))\\s*(?:\\(c\\)\\s*)?(?:by\\s+)?${Y}`, 'ig'), { guard: false })
    ?? first(new RegExp(`(?:working paper|discussion paper|technical report|preprint|manuscript|draft|this version|first version|revised|submitted|published|accepted|received|updated)[^\\n.]{0,60}?(?:\\b|^)${Y}`, 'ig'))
    ?? first(new RegExp(`\\b(?:${MONTHS})\\.?,?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?${Y}`, 'ig'))
    ?? first(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?,?\\s+${Y}`, 'ig'))
    ?? firstBare(head, now);
}
function firstBare(head, now) {   // last resort: a bare year that is not a period, a range end or a citation
  for (const m of head.matchAll(/(?<![\d.$,])((?:19|20)\d\d)(?![\d%]|,\d{3}|\.\d)/g)) {
    const y = +m[1], at = m.index; if (!okYear(y, now)) continue;
    const before = head.slice(Math.max(0, at - 40), at), after = head.slice(at + 4, at + 14);
    if (PERIOD_BEFORE.test(before) || CITE_BEFORE.test(before) || RANGE_AFTER.test(after) || /^[a-z]/.test(after.trimStart()) && !/^\s*[,.;)\n]/.test(after)) continue;
    if (/^\s*[a-z]\b|^\)/.test(after)) continue;   // 1993a / (Fama 1993)
    return y;
  }
  return null;
}

/**
 * The release year of a paper as { year, from } where from is 'given' | 'arxiv' | 'filename' | 'text' | null. Never invented: no
 * evidence -> { year: null, from: null }. First rule that fires wins:
 *   1. given     an explicit year on the record (read papers, free-source manifest)
 *   2. arxiv     the arXiv id (record.arxiv, else one in the upload file name): yymm -> 20yy (old style archive/yymmnnn too)
 *   3. filename  a trailing "(YYYY)" in the upload file name
 *   4. text      the first plausible year 1980..now in the head of the text (3000 chars): "Copyright 2019" / "(c)" first, then
 *                "Working Paper ... 2019" style lines, then month-name dates, then a bare year; years that look like periods
 *                ("since 1987", "1990-2010", "in 1998"), citations ("Fama (1993)") or sit after a References heading are skipped.
 * record: { year?, arxiv?, uploadName?, text?, manifestYear? }, opts: { now }
 */
export function yearOf(record = {}, { now } = {}) {
  const r = record ?? {};
  const g = Number(r.year); if (Number.isInteger(g) && g >= 1800 && g <= thisYear(now) + 1) return { year: g, from: 'given' };
  const mg = Number(r.manifestYear); if (okYear(mg, now)) return { year: mg, from: 'given' };
  const ax = arxivYear(r.arxiv) ?? arxivYear(arxivFromName(r.uploadName)); if (okYear(ax, now)) return { year: ax, from: 'arxiv' };
  const fn = nameYear(r.uploadName); if (okYear(fn, now)) return { year: fn, from: 'filename' };
  const tx = textYear(r.text, now); if (tx != null) return { year: tx, from: 'text' };
  return { year: null, from: null };
}

// ── year buckets ─────────────────────────────────────────────────────────────────────────────────────────────

export const RECENT_YEARS = 5;
/** Bucket key of a year: '2025' (one of the last 5 years), 'd2010' (a decade, the 1990s at the oldest), 'earlier' (before 1990), 'unknown'. */
export function yearKey(year, now) {
  const y = Number(year); if (!Number.isInteger(y) || y < 1000) return 'unknown';
  const cur = thisYear(now);
  if (y > cur - RECENT_YEARS) return String(y);   // also catches a year next to "now" (a forthcoming paper)
  return y < 1990 ? 'earlier' : `d${Math.floor(y / 10) * 10}`;
}
function yearLabel(key, now) {
  if (key === 'unknown') return 'Unknown year';
  if (key === 'earlier') return 'Earlier';
  if (/^\d{4}$/.test(key)) return key;
  const d = +key.slice(1), top = thisYear(now) - RECENT_YEARS;   // the newest decade may stop short of the individual years
  return top >= d && top < d + 9 ? `${d}–${String(top).slice(2)}` : `${d}s`;
}
/** [{ key, label, count }] newest first, then decades, 'Earlier', 'Unknown year' last. Empty buckets are left out. */
export function yearCounts(papers, now) {
  const n = new Map();
  for (const p of papers ?? []) { const k = p?.yearKey ?? yearKey(p?.year, now); n.set(k, (n.get(k) ?? 0) + 1); }
  const rank = k => (k === 'unknown' ? 1e9 : k === 'earlier' ? 1e8 : /^\d{4}$/.test(k) ? -k : 5000 - +k.slice(1));   // years desc, then decades desc
  return [...n.keys()].sort((a, b) => rank(a) - rank(b)).map(key => ({ key, label: yearLabel(key, now), count: n.get(key) }));
}

// ── joining read papers, uploads and queue items ───────────────────────────────────────────────────────────────

const FULL_TEXT = new Set(['pdf', 'arxiv-html', 'html', 'upload', 'full']);
const readKind = readFrom => String(readFrom ?? '').split(/[\s(]/)[0];
const asMap = x => (x instanceof Map ? Object.fromEntries(x) : Array.isArray(x) ? Object.fromEntries(x.filter(u => u?.id).map(u => [u.id, u])) : x && typeof x === 'object' ? x : {});
const ssrnFromName = name => (String(name ?? '').match(/ssrn[-_ ]?(?:id)?[-_ ]?(\d{4,8})/i) ?? [])[1] ?? null;
const baseName = name => String(name ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
const NO_AUDIO = () => ({ briefing: { status: 'none', secs: null, error: null } });
const pickNotes = n => (n && typeof n === 'object' ? Object.fromEntries(['claim', 'mechanism', 'data', 'method', 'effect', 'outOfSample', 'costs', 'relevance', 'stance', 'caveats', 'testHere'].map(k => [k, n[k] ?? null])) : null);

/**
 * The Paper[] of the API contract.
 *   papers      the stored read papers (KV research_pod_papers)
 *   queueItems  the reading queue's items; those with `upload` and no paper yet become unread papers
 *   uploads     what R2 holds, by id (object or array of { id, sha?, chars, pages, hasPdf, text? }); `text` or `firstText`
 *               gives an unread upload its title and tags
 *   tagOverrides  { [id]: { add:[key], remove:[key] } }       progress { [id]: { pct, pos, at, done } }
 *   audio       { [id]: { briefing:{ status, secs, error } } }      evidence  the Evidence Book (default DESK_EVIDENCE)
 * An `upload:<hash>` queue item whose sha matches a held paper's upload (or another item's) is the same paper and is dropped.
 */
export function joinCatalog({ papers = [], queueItems = [], uploads = {}, tagOverrides = {}, progress = {}, audio = {}, evidence = DESK_EVIDENCE, freeSources = null, now } = {}) {
  const free = freeSources instanceof Map ? freeSources : freeLookup(freeSources);
  const manifestFor = (...names) => { for (const n of names) { const e = n && free.get(normTitle(n)); if (e) return e; } return null; };
  const up = asMap(uploads), prog = asMap(progress), aud = asMap(audio), ov = asMap(tagOverrides);
  const out = [], seen = new Set(), shaSeen = new Set(), queueById = new Map();
  for (const it of queueItems ?? []) if (it?.id) queueById.set(it.id, it);

  const finish = base => {
    const o = ov[base.id] ?? {}, tags = applyOverrides(base._auto, o);
    const { _auto, _tagInput, _src, _yr, ...p } = base;
    const y = yearOf(_yr, { now });
    const paper = { ...p, year: y.year, yearFrom: y.from, yearKey: yearKey(y.year, now), source: sourceOf(_src), tags, progress: prog[p.id] ? { pct: prog[p.id].pct ?? 0, pos: prog[p.id].pos ?? 0, at: prog[p.id].at ?? null, done: !!prog[p.id].done } : null,
      audio: { ...NO_AUDIO(), ...(aud[p.id] ?? {}), briefing: { ...NO_AUDIO().briefing, ...(aud[p.id]?.briefing ?? {}) } } };
    paper.desk = deskLinks({ ...paper, abstract: p.abstract }, evidence);
    out.push(paper);
  };

  for (const r of papers ?? []) {
    if (!r?.id || seen.has(r.id)) continue; seen.add(r.id);
    const q = queueById.get(r.id), u = up[r.id] ?? {}, upl = r.uploaded ?? q?.upload ?? null;
    const sha = r.uploaded?.sha ?? q?.upload?.sha ?? u.sha; if (sha) shaSeen.add(sha);
    const text = u.text ?? '', chars = upl?.chars ?? u.chars ?? null, kind = readKind(r.readFrom);
    const hasText = FULL_TEXT.has(kind) || (chars ?? 0) > 0 || text.length > 0;
    finish({
      id: r.id, title: r.title ?? r.id, authors: r.authors ?? [], year: r.year ?? null, venue: r.venue ?? null, url: r.url ?? null, ssrn: r.ssrn ?? null, arxiv: r.arxiv ?? null, doi: r.doi ?? null,
      kind: r.kind ?? 'paper', readFrom: r.readFrom ?? null, hasText, hasPdf: !!(u.hasPdf ?? (upl && upl.stored)), chars: chars ?? (text.length || null), pages: u.pages ?? null,
      uploadedAt: upl?.at ?? null, abstract: String(r.abstract ?? '').slice(0, 2500), notes: pickNotes(r.notes),
      _src: { queueSource: q?.source ?? r.source, ssrn: r.ssrn, arxiv: r.arxiv, doi: r.doi, url: r.url, venue: r.venue, uploadName: upl?.name, readFrom: r.readFrom, manifest: upl ? manifestFor(upl.name, r.title) : null },
      _auto: autoTags({ title: r.title, abstract: r.abstract, notes: r.notes, text }),
      _yr: { year: r.year, arxiv: r.arxiv, uploadName: upl?.name, text: text || u.firstText || '', manifestYear: upl ? manifestFor(upl.name, r.title)?.year : null },
    });
  }
  for (const it of queueItems ?? []) {
    if (!it?.id || !it.upload || seen.has(it.id)) continue;
    const sha = it.upload.sha ?? up[it.id]?.sha;
    if (sha && shaSeen.has(sha)) continue;
    seen.add(it.id); if (sha) shaSeen.add(sha);
    const u = up[it.id] ?? {}, text = u.text ?? u.firstText ?? '';
    const title = firstTitleLine(text) ?? (it.title && it.title !== it.upload.name ? it.title : null) ?? (baseName(it.upload.name) || it.id);
    const chars = it.upload.chars ?? u.chars ?? null;
    finish({
      id: it.id, title, authors: [], year: null, venue: null, url: null, ssrn: ssrnFromName(it.upload.name), arxiv: null, doi: null, kind: it.kind ?? 'paper', readFrom: 'upload (unread)',
      hasText: (chars ?? 0) > 0 || text.length > 0, hasPdf: !!(u.hasPdf ?? it.upload.stored), chars, pages: u.pages ?? null, uploadedAt: it.upload.at ?? null, abstract: '', notes: null,
      _src: { queueSource: it.source, ssrn: ssrnFromName(it.upload.name), uploadName: it.upload.name, readFrom: 'upload', manifest: manifestFor(it.upload.name, it.title, title) },
      _auto: autoTags({ title, text }),
      _yr: { uploadName: it.upload.name, text, manifestYear: manifestFor(it.upload.name, it.title, title)?.year },
    });
  }
  return out.sort((a, b) => String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? '')) || String(a.title).localeCompare(String(b.title)));
}

// ── full-text search (BM25) ────────────────────────────────────────────────────────────────────────────────────

export const SEARCH = { k1: 1.2, b: 0.75, titleBoost: 5, headBoost: 2, headChars: 2500, snippetChars: 200, maxSnippets: 3, phraseBonus: 4, phraseTitleBonus: 4, phraseCandidates: 60 };

/** An empty (or prefilled) index. Docs are { id, title, text, abstract?, tags?: [key] }. */
export function buildIndex(docs = []) {
  const ix = { docs: new Map(), byId: new Map(), post: new Map(), next: 0, totalLen: 0 };
  for (const d of docs) addDoc(ix, d);
  return ix;
}
export const indexSize = ix => ix.byId.size;

/** Add (or replace) one document. Postings hold the weighted term frequency: title x5, abstract / first 2,500 characters x2, body x1. */
export function addDoc(ix, doc) {
  if (!doc?.id) return ix;
  if (ix.byId.has(doc.id)) removeDoc(ix, doc.id);
  const text = String(doc.text ?? ''), title = String(doc.title ?? ''), head = doc.abstract ? String(doc.abstract) : text.slice(0, SEARCH.headChars);
  const tf = new Map(), add = (k, w) => tf.set(k, (tf.get(k) ?? 0) + w);
  let len = 0;
  for (const t of tokens(title)) add(stem(t), SEARCH.titleBoost);
  for (const t of tokens(head)) add(stem(t), SEARCH.headBoost);
  for (const m of fold(doc.abstract ? text : text.slice(SEARCH.headChars)).matchAll(WORD)) { const w = m[0]; if (w.length > 1 && !STOP.has(w)) { add(stem(w), 1); len++; } }
  const idx = ix.next++;
  for (const [term, f] of tf) { let p = ix.post.get(term); if (!p) ix.post.set(term, p = { d: [], f: [] }); p.d.push(idx); p.f.push(f); }
  const tags = new Set((doc.tags ?? []).map(t => (typeof t === 'string' ? t : t?.key)).filter(Boolean));
  ix.docs.set(idx, { id: doc.id, title, text, len: Math.max(len, 1), terms: [...tf.keys()], tags });
  ix.byId.set(doc.id, idx); ix.totalLen += Math.max(len, 1);
  return ix;
}
/** Remove a document (so the server can replace a paper's text after an upload). Returns true when it was there. */
export function removeDoc(ix, id) {
  const idx = ix.byId.get(id); if (idx === undefined) return false;
  const d = ix.docs.get(idx);
  for (const term of d.terms) { const p = ix.post.get(term); if (!p) continue; const i = p.d.indexOf(idx); if (i >= 0) { p.d.splice(i, 1); p.f.splice(i, 1); } if (!p.d.length) ix.post.delete(term); }
  ix.totalLen -= d.len; ix.docs.delete(idx); ix.byId.delete(id);
  return true;
}
/** Replace a document's tags (keys) without re-indexing it. */
export function setDocTags(ix, id, tags) { const d = ix.docs.get(ix.byId.get(id)); if (d) d.tags = new Set((tags ?? []).map(t => (typeof t === 'string' ? t : t?.key)).filter(Boolean)); }

/** Parse a query: "quoted phrases" and loose words -> { terms: [stems], phrases: [[words]] }. */
export function parseQuery(q) {
  const phrases = [], rest = String(q ?? '').replace(/["“”]([^"“”]+)["“”]/g, (_, p) => { const w = fold(p).match(WORD) ?? []; if (w.length) phrases.push(w); return ' '; });
  const words = tokens(rest), all = [...words, ...phrases.flat().filter(w => w.length > 1 && !STOP.has(w))];
  return { terms: [...new Set(all.map(stem))], phrases };
}

const phraseRe = words => new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-]+'), 'i');

/** The best ~200 character windows around the matches, starting at a sentence start where there is one. */
function snippetsFor(text, qset, phrases, { n = SEARCH.maxSnippets, size = SEARCH.snippetChars } = {}) {
  if (!text) return [];
  const folded = fold(text), body = folded.length === text.length ? folded : text.toLowerCase();
  const hits = []; // [start, end, stem]
  for (const m of body.matchAll(WORD)) { if (hits.length >= 800) break; if (m[0].length > 1 && !STOP.has(m[0])) { const s = stem(m[0]); if (qset.has(s)) hits.push([m.index, m.index + m[0].length, s]); } }
  if (!hits.length) return [];
  const wins = [];
  for (let i = 0; i < hits.length; i++) {
    let a = Math.max(0, hits[i][0] - 70);
    const back = text.slice(Math.max(0, hits[i][0] - 130), hits[i][0]), sb = [...back.matchAll(/[.!?]\s+(?=[A-Z0-9(])|\n\s*\n/g)].pop();
    if (sb) a = Math.max(0, hits[i][0] - 130) + sb.index + sb[0].length;
    else { const sp = text.indexOf(' ', a); if (a > 0 && sp >= 0 && sp < hits[i][0]) a = sp + 1; }
    let b = Math.min(text.length, a + size); const sp2 = text.indexOf(' ', b); if (b < text.length && sp2 >= 0 && sp2 - b < 20) b = sp2;
    let lo = 0, hi = i; while (lo < hi) { const mid = (lo + hi) >> 1; if (hits[mid][0] < a) lo = mid + 1; else hi = mid; }
    const inside = []; for (let j = lo; j < hits.length && hits[j][0] < b; j++) if (hits[j][1] <= b) inside.push(hits[j]);
    const distinct = new Set(inside.map(h => h[2])).size;
    let score = distinct * 10 + inside.length;
    if (phrases.length) { const w = text.slice(a, b); if (phrases.some(p => phraseRe(p).test(w))) score += 15; }
    wins.push({ a, b, score });
  }
  wins.sort((x, y) => y.score - x.score || x.a - y.a);
  const chosen = [];
  for (const w of wins) { if (chosen.length >= n) break; if (chosen.every(c => w.a >= c.b || w.b <= c.a)) chosen.push(w); }
  return chosen.sort((x, y) => x.a - y.a).map(w => {
    const t = text.slice(w.a, w.b).replace(/\s+/g, ' ').trim(), marks = [];
    for (const m of fold(t).matchAll(WORD)) if (qset.has(stem(m[0]))) marks.push([m.index, m.index + m[0].length]);
    return { text: t, marks };
  });
}

/**
 * Ranked full-text search. All the words must match (AND); when nothing matches them all, any word will do (OR, mode 'or').
 * "quoted phrases" earn a bonus where they appear exactly. Options: { tags: [key] (the paper must carry all), limit, snippets }.
 * Returns { hits:[{ id, score, title, snippets:[{ text, marks:[[from,to]] }] }], total, mode }. The caller highlights `marks`.
 */
export function search(ix, query, { tags = [], limit = 40, snippets = true } = {}) {
  const { terms, phrases } = parseQuery(query), N = ix.byId.size;
  if (!terms.length || !N) return { hits: [], total: 0, mode: 'and' };
  const avg = ix.totalLen / N, { k1, b } = SEARCH, need = (tags ?? []).filter(Boolean);
  const acc = new Map(); // idx -> [score, matched terms]
  for (const term of terms) {
    const p = ix.post.get(term); if (!p) continue;
    const idf = Math.log(1 + (N - p.d.length + 0.5) / (p.d.length + 0.5));
    for (let i = 0; i < p.d.length; i++) {
      const d = ix.docs.get(p.d[i]), f = p.f[i], s = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avg));
      const a = acc.get(p.d[i]); if (a) { a[0] += s; a[1]++; } else acc.set(p.d[i], [s, 1]);
    }
  }
  let mode = 'and', cand = [...acc].filter(([idx, [, c]]) => c === terms.length && (!need.length || need.every(t => ix.docs.get(idx).tags.has(t))));
  if (!cand.length) { mode = 'or'; cand = [...acc].filter(([idx]) => !need.length || need.every(t => ix.docs.get(idx).tags.has(t))); }
  cand.sort((x, y) => y[1][0] - x[1][0]);
  if (phrases.length) {
    const res = phrases.map(phraseRe);
    for (const c of cand.slice(0, SEARCH.phraseCandidates)) {
      const d = ix.docs.get(c[0]);
      for (const re of res) { if (re.test(d.title)) c[1][0] += SEARCH.phraseTitleBonus; if (re.test(d.text)) c[1][0] += SEARCH.phraseBonus; }
    }
    cand.sort((x, y) => y[1][0] - x[1][0]);
  }
  const qset = new Set(terms), total = cand.length;
  return { total, mode, hits: cand.slice(0, limit).map(([idx, [score]]) => { const d = ix.docs.get(idx); return { id: d.id, score: Math.round(score * 1000) / 1000, title: d.title, snippets: snippets ? snippetsFor(d.text, qset, phrases) : [] }; }) };
}

// ── desk links (Evidence Book) ─────────────────────────────────────────────────────────────────────────────────

const GENERIC = new Set(('probability chance drift predict return test result market price model paper effect strategy trading trade data risk rate year day week month study use using used based show shows find finds found large small high low new first second time period sample evidence signal level change base case value one two three four five six seven eight nine ten per cent percent average mean median pass fail null validate context range move size band daily weekly monthly session open close high low expect forecast predict prediction direction horizon cost net gross run build tested measured measure analysis approach method').split(/\s+/).map(w => stem(w)));
const ALIAS = { gex: ['gamma', 'exposure'], cot: ['commitment', 'trader', 'positioning'], har: ['realized', 'volatility'], hmm: ['hidden', 'markov', 'regime'], vix: ['volatility', 'implied'], fomc: ['fed', 'announcement'], oi: ['open', 'interest'], tsmom: ['momentum', 'trend'], cta: ['trend', 'momentum'], fx: ['currency'], ppp: ['purchasing', 'power'], dvol: ['volatility'] };

function specifics(str) {
  const out = new Set();
  for (const w of tokens(str)) { const s = stem(w); if (s.length >= 3 && !GENERIC.has(s) && !/^\d+$/.test(s)) { out.add(s); for (const a of ALIAS[w] ?? []) out.add(stem(a)); } }
  return out;
}
const TOPIC_UNI = new Set(COMPILED.flatMap(t => t.terms.flatMap(([k, w]) => (k[0] !== '=' && w >= 1.5 ? k.split(' ') : []))));
const profileCache = new WeakMap();
function evidenceProfiles(evidence) {
  let p = profileCache.get(evidence); if (p) return p;
  const rows = evidence.filter(e => e?.id && e.claim && e.verdict).map(e => {
    const idWords = String(e.id).replace(/[-_]+/g, ' '), idT = specifics(idWords), claimT = specifics(e.claim);
    const tags = scoreTopics({ title: idWords, abstract: e.claim, text: `${e.result ?? ''} ${e.use ?? ''}` }).filter(x => x.score >= TAG_RULES.min).map(x => x.key);
    return { e, idT, claimT, tags: new Set(tags) };
  });
  const df = new Map(); for (const r of rows) for (const t of new Set([...r.idT, ...r.claimT])) df.set(t, (df.get(t) ?? 0) + 1);
  p = { rows, df, N: rows.length }; profileCache.set(evidence, p); return p;
}

/**
 * The Evidence Book entries related to a paper: [{ id, verdict, claim }], at most 5, strongest first. Rule-based: an entry is
 * linked when it shares a specific term with the paper (rare terms count more) and, for the strongest links, a topic family
 * as well. `verdict` and `claim` are copied from the entry, never composed here.
 */
export function deskLinks(paper, evidence = DESK_EVIDENCE, { max = 5, min = 4, relative = 0.45, explain = false } = {}) {
  if (!paper) return [];
  const { rows, df, N } = evidenceProfiles(evidence ?? []);
  const notes = paper.notes && typeof paper.notes === 'object' ? paper.notes : null;
  const titleT = specifics(paper.title ?? ''), bodyT = specifics(`${paper.abstract ?? ''} ${notes?.claim ?? ''} ${notes?.mechanism ?? ''}`);
  for (const t of titleT) bodyT.delete(t);
  const pTags = new Set((paper.tags ?? autoTags({ title: paper.title, abstract: paper.abstract, notes })).map(t => t.key));
  const scored = [];
  for (const r of rows) {
    let terms = 0, shared = 0;
    for (const [set, pw] of [[titleT, 3], [bodyT, 0.6]]) for (const t of set) {
      const ew = r.idT.has(t) ? 2 : r.claimT.has(t) ? 1 : 0; if (!ew) continue;
      const idf = Math.log(1 + N / (df.get(t) ?? 1)); if (idf < 1.2) continue;
      terms += idf * idf * pw * ew * 0.2 * (TOPIC_UNI.has(t) ? 2 : 0.7); shared++;
    }
    if (!shared) continue;
    let topic = 0; for (const k of pTags) if (r.tags.has(k)) topic += 1;
    const score = (terms + Math.min(topic, 2) * 1.5) * (topic > 0 ? 1.5 : 1);
    if (score >= min && (topic > 0 || terms >= min * 1.5)) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score || String(b.r.e.date).localeCompare(String(a.r.e.date)));
  const top = scored[0]?.score ?? 0;
  return scored.filter(x => x.score >= relative * top).slice(0, max).map(({ r, score }) => ({ id: r.e.id, verdict: r.e.verdict, claim: r.e.claim, ...(explain ? { score: Math.round(score * 100) / 100 } : {}) }));
}

// ── Theory Lab links ───────────────────────────────────────────────────────────────────────────────────────────

/** Topic -> lesson slugs in theory-lab/lessons/ (best first). A test checks every one exists. */
export const THEORY_BY_TOPIC = {
  volatility: ['garch-volatility', 'institutional-har-rv', 'heston-model', 'variance-risk-premium', 'vix-uncertainty-not-fear', 'institutional-garman-klass-yang-zhang'],
  jump: ['institutional-jump-detection-tests', 'merton-jump-diffusion', 'institutional-bates-model', 'institutional-bipower-variation'],
  brownian: ['ito-lemma', 'fractional-brownian-motion', 'girsanov-risk-neutral', 'sde-numerical-schemes', 'fokker-planck-equation'],
  options: ['gamma-exposure-dealer-hedging', 'delta-hedging-gamma-scalping', 'black-scholes', 'implied-vol-smile-skew', 'open-interest-walls-max-pain'],
  cot: ['investor-mood-forced-selling', 'herding-narratives-bubbles', 'action-base-rates'],
  fx: ['interest-rate-parity', 'purchasing-power-parity', 'fx-options-quoting-rr-bf', 'fx-fixings-wm-reuters', 'four-markets-four-questions'],
  trend: ['trend-cycle-filters', 'hurst-variance-ratio', 'wavelets-time-frequency', 'kalman-filter'],
  meanrev: ['ou-mean-reversion', 'cointegration', 'institutional-vecm', 'hurst-variance-ratio'],
  rates: ['central-bank-policy', 'taylor-rule', 'yield-curve-growth-expectations', 'yield-curve-construction', 'event-trading-playbook', 'qe-qt-balance-sheet', 'short-rate-models-vasicek-cir-hull-white'],
  commodities: ['hedging-with-options', 'tail-risk-hedging-convexity', 'alpha-beta-separation'],
  risk: ['risk-parity-erc', 'markowitz-black-litterman', 'kelly-criterion', 'drawdowns-risk-of-ruin', 'coherent-risk-measures', 'hierarchical-risk-parity', 'extreme-value-theory'],
  backtest: ['sharpe-family-deflated', 'multiple-testing', 'institutional-reality-check-spa', 'walk-forward-purged-cv', 'research-pipeline-hypothesis-to-backtest', 'bootstrapping-monte-carlo'],
  microstructure: ['institutional-order-flow-imbalance', 'limit-order-books', 'vpin-order-flow-toxicity', 'market-impact-almgren-chriss', 'institutional-kyle-obizhaeva-invariance', 'institutional-glosten-milgrom'],
  ml: ['gradient-boosting', 'decision-trees-random-forests', 'recurrent-networks-lstm-gru', 'regularized-regression-lasso-ridge', 'feature-engineering-leakage-reproducibility', 'attention-transformers-time-series'],
  regimes: ['hidden-markov-models', 'regime-switching-state-space', 'change-point-detection'],
};
const slugOf = f => String(f).replace(/^.*\//, '').replace(/\.html?$/i, '');

/**
 * Lesson slugs for a paper's tags (tag objects or keys), at most `max` (4). The first tag's best lesson comes first, then the
 * second tag's best, and so on, round after round. `lessonFiles` (file names or slugs from theory-lab/lessons/) limits the
 * answer to lessons that exist; "-micro" decks are never returned.
 */
export function theoryLinks(tags, lessonFiles = null, { max = 4 } = {}) {
  const have = lessonFiles ? new Set(lessonFiles.map(slugOf)) : null, keys = (tags ?? []).map(t => (typeof t === 'string' ? t : t?.key)).filter(k => THEORY_BY_TOPIC[k]);
  const lists = keys.map(k => THEORY_BY_TOPIC[k].filter(s => !have || have.has(s))), out = [];
  for (let round = 0; out.length < max && lists.some(l => round < l.length); round++) for (const l of lists) { const s = l[round]; if (s && !out.includes(s) && out.length < max) out.push(s); }
  return out;
}

// ── the to-get list ────────────────────────────────────────────────────────────────────────────────────────────

/** SSRN numbers of the papers already held, from paper records and queue items (ids, ssrn field, DOI, upload file names). */
export function heldSsrnIds(papers = [], queueItems = []) {
  const out = new Set(), eat = s => { const m = String(s ?? '').match(/ssrn[-_. :]*(?:id)?[-_ ]?(\d{4,8})/i); if (m) out.add(m[1]); };
  for (const p of papers ?? []) { if (p?.ssrn) out.add(String(p.ssrn)); eat(p?.id); eat(p?.doi); eat(p?.uploaded?.name); }
  for (const q of queueItems ?? []) { eat(q?.id); eat(q?.upload?.name); }
  return out;
}

/**
 * The to-get items of SSRN_DOWNLOAD_LIST.md: [{ id (SSRN number), title, year, part, section, url (the download link), held }], in file
 * order, de-duplicated by id. `part` counts the "## Part N" headings (the table before the first one is part 1).
 * `heldIds` may hold SSRN numbers, "ssrn:<n>" or "doi:10.2139/ssrn.<n>" ids.
 */
export function parseTodoList(markdown, heldIds = []) {
  const held = new Set([...(heldIds instanceof Set ? heldIds : heldIds ?? [])].map(x => (String(x).match(/(\d{4,8})\s*$/) ?? [])[1] ?? String(x)));
  const items = [], seen = new Set(); let part = 1, section = null;
  for (const line of String(markdown ?? '').split('\n')) {
    const h = line.match(/^##\s+Part\s+(\d+)/i); if (h) { part = +h[1]; section = null; continue; }
    const s = line.match(/^###\s+(.+?)\s*$/); if (s) { section = s[1]; continue; }
    if (!line.startsWith('|')) continue;
    const link = line.match(/\[download\]\((https?:[^)\s]*abstractid=(\d+)[^)\s]*)\)/i); if (!link) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    const ti = cells.findIndex(c => /abstractid=/.test(c)); if (ti < 1) continue;
    const idx = cells.findIndex((c, i) => i < ti && /^\d{4}$/.test(c)), year = idx >= 0 ? +cells[idx] : null;
    const first = cells.findIndex(c => !/^\d+$/.test(c)), cell = cells[first] ?? '';
    const cut = cell.lastIndexOf(' · '), title = (cut > 0 ? cell.slice(0, cut) : cell).replace(/^★\s*/, '').trim();
    const id = link[2]; if (seen.has(id)) continue; seen.add(id);
    items.push({ id, title, year, part, section, url: link[1], held: held.has(id) });
  }
  return items;
}

// ── read next ──────────────────────────────────────────────────────────────────────────────────────────────────

const casesOf = cases => (Array.isArray(cases) ? cases : Array.isArray(cases?.cases) ? cases.cases : []);
const short = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/**
 * The unread papers to read next: { ids, why:{ id: text } }. A paper scores by overlap between each OPEN case's question and the
 * paper's tags and title terms (the best case wins and is named in `why`); with no match, the most recent uploads fill in.
 * `progress` is { [id]: { pct, done } } (paper.progress is used when it is not given). Options: { n } (default 5).
 */
export function readNext({ papers = [], cases = [], progress = null } = {}, { n = 5 } = {}) {
  const prog = progress ? asMap(progress) : {};
  const isRead = p => { const g = prog[p.id] ?? p.progress; return !!g && (g.done || (g.pct ?? 0) > 0 || (g.pos ?? 0) > 0); };
  const unread = (papers ?? []).filter(p => !isRead(p));
  const open = casesOf(cases).filter(c => c?.status === 'open' && (c.question || c.title)).map(c => {
    const q = `${c.question ?? ''} ${c.title ?? ''}`;
    return { title: c.title || c.question, tags: new Set(autoTags({ title: q }).map(t => t.key)), terms: specifics(q) };
  });
  const scored = [];
  for (const p of unread) {
    const pt = new Set((p.tags ?? []).map(t => t.key)), tt = specifics(p.title);
    let best = null;
    for (const c of open) {
      let tagHits = 0; for (const k of pt) if (c.tags.has(k)) tagHits++;
      let termHits = 0; for (const t of tt) if (c.terms.has(t)) termHits++;
      const score = 3 * tagHits + Math.min(termHits, 4);
      if (score > 0 && (!best || score > best.score)) best = { score, title: c.title };
    }
    if (best) scored.push({ p, score: best.score + (p.hasText ? 0.5 : 0), why: `matches open case "${short(best.title)}"` });
  }
  scored.sort((a, b) => b.score - a.score || String(b.p.uploadedAt ?? '').localeCompare(String(a.p.uploadedAt ?? '')) || a.p.id.localeCompare(b.p.id));
  const ids = [], why = {};
  for (const s of scored.slice(0, n)) { ids.push(s.p.id); why[s.p.id] = s.why; }
  if (ids.length < n) {
    const rest = unread.filter(p => !why[p.id]).sort((a, b) => String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? '')) || a.id.localeCompare(b.id));
    for (const p of rest) { if (ids.length >= n) break; ids.push(p.id); why[p.id] = p.uploadedAt ? 'most recent upload' : 'not read yet'; }
  }
  return { ids, why };
}

// ── a case from a paper ────────────────────────────────────────────────────────────────────────────────────────

/** The case id for a paper (deterministic, so opening a paper twice opens the same case). */
export const paperCaseId = paperId => `case-paper-${String(paperId ?? '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 120)}`;
/** The case already opened for this paper, or null. */
export const caseForPaper = (cases, paperId) => casesOf(cases).find(c => c.paperId === paperId) ?? null;

const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null; };
const firstSentence = s => (String(s ?? '').replace(/\s+/g, ' ').trim().match(/^.{20,}?[.!?](?=\s|$)/) ?? [String(s ?? '').slice(0, 240)])[0];

/**
 * A new research case from a paper: the question is the title and the claim, the paper's notes ride along as `case.paper` so the
 * researchers and the Head of Research read them (js/researchCase.js: paperText). No round, no model call: nothing is spent
 * until the owner writes. `paper` is a catalog Paper (or a stored record).
 */
export function caseFromPaper(paper, { now = new Date().toISOString(), date } = {}) {
  if (!paper?.id) throw new Error('a paper with an id is required');
  const n = paper.notes ?? null, claim = cut(n?.claim, 400) ?? cut(firstSentence(paper.abstract), 300);
  const question = claim ? `${paper.title}: ${claim}` : String(paper.title ?? paper.id);
  const block = {
    id: paper.id, title: cut(paper.title, 300) ?? paper.id, authors: (paper.authors ?? []).slice(0, 6), year: paper.year ?? null, venue: paper.venue ?? null, url: paper.url ?? null,
    tags: (paper.tags ?? []).map(t => t.label ?? t.key),
    abstract: n ? null : cut(paper.abstract, 1200),
    notes: n ? Object.fromEntries(['claim', 'mechanism', 'data', 'method', 'effect', 'outOfSample', 'costs', 'caveats', 'testHere', 'stance'].map(k => [k, cut(noteStr(n[k]), 900)]).filter(([, v]) => v)) : null,
  };
  return { ...newCase({ id: paperCaseId(paper.id), question, date: date ?? String(now).slice(0, 10), at: now, origin: 'paper' }), paperId: paper.id, paper: block };
}
