// Paper Library listening: pure text -> speech sentences. No network, no model call, no I/O.
//
//   speechSentences(blocks, { mode:'full' })   the listen text for the browser voice
//   briefingScript(paper, blocks, conclusion)  a NON-verbatim briefing assembled from what the desk already holds
//   estimateSecs(sentences, rate=1)            seconds of speech at 150 words per minute
//   chunkForTts(sentences, { maxChars })       request-sized groups for a TTS service, never splitting a sentence
//
// Blocks are { i, type:'h1'|'h2'|'p'|'eq'|'table'|'fig'|'refs', text, page, bbox } (plans/PAPER_LIBRARY.md).
// Every function is total: odd input returns less, never throws.

// Browser-voice utterances are short (Theory Lab caps at 110, see theory-lab/assets/tts.js): long ones stall on iOS/Android.
export const MAX_SENTENCE = 110;
const WPM = 150;

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : '');
const arr = (v) => (Array.isArray(v) ? v : []);

// ---------- number words ----------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const TENS_PLURAL = ['hundreds', 'tens', 'twenties', 'thirties', 'forties', 'fifties', 'sixties', 'seventies', 'eighties', 'nineties'];
function below100(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function yearWords(n) {
  if (n >= 2000 && n <= 2009) return n === 2000 ? 'two thousand' : 'two thousand ' + ONES[n - 2000];
  const head = n < 2000 ? 'nineteen' : 'twenty';
  const p = n % 100;
  if (p === 0) return head + ' hundred';
  if (p < 10) return head + ' oh ' + ONES[p];
  return head + ' ' + below100(p);
}

// ---------- tables ----------
const GREEK = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ϑ: 'theta',
  ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', ο: 'omicron', π: 'pi', ρ: 'rho', σ: 'sigma', ς: 'sigma',
  τ: 'tau', υ: 'upsilon', φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'capital gamma', Δ: 'delta', Θ: 'capital theta', Λ: 'capital lambda', Ξ: 'capital xi', Π: 'capital pi',
  Σ: 'capital sigma', Φ: 'capital phi', Ψ: 'capital psi', Ω: 'capital omega',
};
const SYMBOLS = {
  '≈': ' about ', '≃': ' about ', '∼': ' about ', '~': ' about ', '≠': ' is not equal to ', '≤': ' less than or equal to ',
  '≥': ' greater than or equal to ', '⩽': ' less than or equal to ', '⩾': ' greater than or equal to ',
  '≪': ' much less than ', '≫': ' much greater than ', '±': ' plus or minus ', '×': ' times ', '·': ' times ', '÷': ' divided by ',
  '∞': ' infinity ', '→': ' to ', '←': ' from ', '⇒': ' implies ', '↔': ' and ', '∑': ' the sum of ', '∏': ' the product of ',
  '∫': ' the integral of ', '√': ' square root of ', '∂': ' partial ', '∇': ' nabla ', '∈': ' in ', '∉': ' not in ',
  '∝': ' proportional to ', '∼': ' about ', '∧': ' and ', '∨': ' or ', '¬': ' not ', '°': ' degrees ', '′': ' prime ',
  '€': ' euros ', '£': ' pounds ', '¥': ' yen ', '‰': ' per mille ', '§': ' section ', '∆': ' delta ', '…': ', ',
  '=': ' equals ', '+': ' plus ', '&': ' and ', '#': ' number ', '|': ', ',
};
const LIGATURES = { 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl', '­': '', ' ': ' ', ' ': ' ', ' ': ' ',
  ' ': ' ', '​': '', '﻿': '', '“': '"', '”': '"', '‘': "'", '’': "'", '‐': '-', '‑': '-' };

// Acronyms said letter by letter, or as a word with a spoken form.
const SPELLED = new Set(('FOMC ECB BOE BOJ BOC RBA RBNZ SNB FED GDP CPI PCE PPI PMI ISM NFP USD EUR GBP JPY CHF AUD CAD NZD SEK NOK MXN ' +
  'SPX NDX NQ ES ETF ETN OLS GLS GMM IV RV HAR PCA HMM VAR VECM ARMA ARIMA CFTC COT SEC IMF BIS OECD FX CDS OIS DXY MSCI GEX CTA ' +
  'LSTM CNN RNN GPU API NBER CRSP WRDS TIPS VWAP TWAP OHLC ATR EMA SMA RSI MACD AUC ROC IID MLE MCMC PDE SDE ODE VIX VVIX VXN SKEW ' +
  'IRR NPV ROE ROA EPS PE USA UK EU US').split(' '));
const SPOKEN = { GARCH: 'garch', EGARCH: 'E garch', GJR: 'G J R', VIX: 'vicks', NASDAQ: 'Nasdaq', OPEC: 'Opec', LIBOR: 'Libor',
  SOFR: 'Sofr', SABR: 'Sabr', CAPM: 'cap M', NAFTA: 'Nafta', FRED: 'Fred', AIC: 'A I C', BIC: 'B I C' };
// VIX is said "vicks" by most people but engines spell it; the map above chooses the word. Remove from SPELLED to keep one rule.
SPELLED.delete('VIX');

const ABBREV_NOSPLIT = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'inc', 'ltd', 'co', 'corp', 'st', 'jr', 'sr', 'vs', 'no', 'nos', 'u.s',
  'u.k', 'e.g', 'i.e', 'cf', 'approx', 'resp', 'ca', 'vol', 'pp', 'ed', 'eds', 'fig', 'figs', 'eq', 'eqs', 'sec', 'al']);

// ---------- cleaning for speech ----------
export function normalizeForSpeech(input) {
  try {
    let t = str(input);
    if (!t) return '';
    t = t.replace(/[ﬁﬂﬀﬃﬄ­    ​﻿“”‘’‐‑]/g, (c) => LIGATURES[c] ?? c);
    t = t.replace(/[\r\n\t]+/g, ' ');
    // URLs, DOIs, emails
    t = t.replace(/\bhttps?:\/\/[^\s]*[^\s.,;:)\]]/gi, ' ');
    t = t.replace(/\bwww\.[^\s]*[^\s.,;:)\]]/gi, ' ');
    t = t.replace(/\b(?:[a-z0-9-]+\.)+(?:com|org|edu|net|gov|io)\/[^\s]*[^\s.,;:)\]]/gi, ' ');
    t = t.replace(/\bdoi:?\s*10\.\d{4,9}\/[^\s]*[^\s.,;:)\]]/gi, ' ');
    t = t.replace(/\b10\.\d{4,9}\/[^\s]*[^\s.,;:)\]]/g, ' ');
    t = t.replace(/\b\S+@\S+\.[a-z]{2,}\b/gi, ' ');
    // numeric citations [12] [1,2] [1-3] [12, 14]
    t = t.replace(/\s*\[\s*\d{1,3}(?:\s*[,;–-]\s*\d{1,3})*\s*\]/g, '');
    // author-year citations (Smith, 2019) (Smith and Jones, 2019; Lee et al., 2020a) (see Smith 2019, p. 4)
    t = t.replace(/\s*\((?:see |e\.g\.,? |cf\. )?[A-Z][^()]{0,140}?\b(?:19|20)\d\d[a-z]?\b[^()]{0,60}\)/g, (m) =>
      /\b(?:19|20)\d\d[a-z]?\b/.test(m) && !/\d{3}\.\d|%|=|<|>/.test(m) ? '' : m);
    // narrative citation: Smith (2019) -> Smith ; Smith and Jones (2019) -> Smith and Jones
    t = t.replace(/\b([A-Z][A-Za-z'’-]+(?: et al\.?| and [A-Z][A-Za-z'’-]+)?),? \(\s*(?:19|20)\d\d[a-z]?\s*\)/g, '$1');
    // footnote markers
    t = t.replace(/[¹⁴⁵⁶⁷⁸⁹⁰†‡¶]+/g, '');
    t = t.replace(/([A-Za-z]{2,})\*+(?=[\s.,;:)]|$)/g, '$1');
    t = t.replace(/(\S)([²³])/g, (m, p, s) => (/^[A-Za-zα-ωΑ-Ω)\]]$/.test(p) && !/[A-Za-z]{2}[²³]/.test(m) ? p + (s === '²' ? ' squared' : ' cubed') : p));
    t = t.replace(/[²³]/g, '');
    // abbreviations
    t = t.replace(/\be\.\s?g\.?,?/gi, 'for example,').replace(/\bi\.\s?e\.?,?/gi, 'that is,');
    t = t.replace(/\bet al\.?/gi, 'and others').replace(/\bvs\.?(?=\s)/gi, 'versus').replace(/\bcf\.(?=\s)/gi, 'compare');
    t = t.replace(/\betc\.(?=\s+[a-z])/g, 'and so on').replace(/\betc\./g, 'and so on.');
    t = t.replace(/\bFigs?\.?\s*(\d+[a-z]?)/g, 'Figure $1').replace(/\bTabs?\.\s*(\d+)/g, 'Table $1').replace(/\bSec\.\s*(\d)/g, 'Section $1');
    t = t.replace(/\bEqs?(?:uations?)?\.?\s*\(\s*(\d+[a-z]?)\s*\)(?:\s*(?:and|,|–|-)\s*\(\s*(\d+[a-z]?)\s*\))?/g,
      (m, a, b) => 'Equation ' + a + (b ? ' and ' + b : ''));
    t = t.replace(/\bapprox\.\s?/gi, 'approximately ').replace(/\bNo\.\s?(?=\d)/g, 'number ');
    t = t.replace(/\bS&P\b/g, 'S and P').replace(/\bR&D\b/g, 'R and D').replace(/\band\/or\b/gi, 'and or');
    // LaTeX-ish leftovers in running text
    t = t.replace(/[{}]/g, '').replace(/\\(?:mathrm|text|mathbf|mathcal|left|right)\b/g, '').replace(/\\([a-zA-Z]+)/g, '$1');
    t = t.replace(/_/g, ' ').replace(/\^/g, ' to the power ');
    // ranges and minus signs
    t = t.replace(/(\d)\s*[–—-]\s*(?=\d)/g, '$1 to ');
    t = t.replace(/(^|[\s(=<>])[−–-](?=\d)/g, '$1minus ').replace(/−/g, ' minus ');
    // decades and years
    t = t.replace(/\b(19|20)(\d)0s\b/g, (m, c, d) => (c === '19' ? 'nineteen ' : 'twenty ') + TENS_PLURAL[+d]);
    t = t.replace(/(?<![\d,.])\b(19\d\d|20\d\d)\b(?!\d|,\d{3}|\.\d)/g, (m) => yearWords(+m));
    // thousands separators, then currency, percent, basis points, decimals
    t = t.replace(/\b\d{1,3}(?:,\d{3})+(?=\b)/g, (m) => m.replace(/,/g, ''));
    t = t.replace(/\$\s?(\d[\d.]*)(\s*(?:million|billion|trillion|thousand|bn|mn|m|k)\b)?/gi, (m, n, unit) => {
      const u = unit ? ' ' + ({ bn: 'billion', mn: 'million', m: 'million', k: 'thousand' }[unit.trim().toLowerCase()] || unit.trim()) : '';
      return n + u + ' dollars';
    });
    t = t.replace(/(\d)\s*%/g, '$1 percent').replace(/%/g, ' percent ');
    t = t.replace(/(\d)\s*bps?\b/gi, '$1 basis points');
    t = t.replace(/(\d)\.(\d+)/g, (m, a, b) => a + ' point ' + b.split('').join(' '));
    // symbols and Greek
    t = t.replace(/\s<\s/g, ' less than ').replace(/\s>\s/g, ' greater than ').replace(/<=/g, ' less than or equal to ').replace(/>=/g, ' greater than or equal to ');
    t = t.replace(/[<>]/g, (c) => (c === '<' ? ' less than ' : ' greater than '));
    t = t.replace(/[α-ωϑϕϵΑ-Ωϑ]/g, (c) => ' ' + (GREEK[c] || '') + ' ');
    t = t.replace(/[≈≃∼~≠≤≥⩽⩾≪≫±×·÷∞→←⇒↔∑∏∫√∂∇∈∉∝∧∨¬°′€£¥‰§∆…=+&#|]/g, (c) => SYMBOLS[c] ?? ' ');
    t = t.replace(/\s\/\s/g, ' ').replace(/(\w)\/(?=\w)/g, '$1 slash ');
    // acronyms
    t = t.replace(/\b[A-Z]{2,7}(?:s)?\b/g, (m) => {
      const plural = m.endsWith('s') && m.length > 2 && /^[A-Z]+s$/.test(m);
      const base = plural ? m.slice(0, -1) : m;
      if (SPOKEN[base]) return SPOKEN[base] + (plural ? 's' : '');
      if (SPELLED.has(base) || !/[AEIOUY]/.test(base)) return base.split('').join(' ') + (plural ? 's' : '');
      return m;
    });
    t = t.replace(/,?\s*\bsee\s*(?=[.;]|$)/gi, '');
    t = t.replace(/\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)/g, ' $1 $2 ');   // model orders: GARCH(1,1)
    // tidy
    t = t.replace(/[()\[\]]/g, (c) => (c === '(' || c === ')' ? ', ' : ' '));
    t = t.replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(\s*[,;:])+/g, '$1').replace(/,\s*\./g, '.').replace(/\.\s*,/g, '.');
    t = t.replace(/(^|[.!?]\s+),\s*/g, '$1').replace(/^\s*[,;:]\s*/, '');
    t = t.replace(/\s{2,}/g, ' ').trim();
    return t;
  } catch {
    return '';
  }
}

// ---------- sentence splitting ----------
function lastToken(s, end) {
  let j = end;
  while (j > 0 && !/\s/.test(s[j - 1])) j--;
  return s.slice(j, end).replace(/^[("'\[]+/, '');
}
function notEnd(tok) {
  const low = tok.toLowerCase().replace(/\.$/, '');
  if (ABBREV_NOSPLIT.has(low)) return true;
  if (/^[A-Z]$/.test(tok)) return true;             // initial: "J. Smith"
  if (/^(?:[A-Za-z]\.){1,}[A-Za-z]$/.test(tok)) return true; // U.S, e.g
  return false;
}

export function splitSentences(text) {
  const t = str(text).trim();
  if (!t) return [];
  const out = [];
  const re = /[.!?]+["')\]]*(?=\s+["'(\[]?[A-Z0-9])/g;
  let start = 0;
  let m;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    const tok = lastToken(t, m.index + 1).replace(/\.+$/, '');
    if (m[0][0] === '.' && notEnd(tok)) continue;
    out.push(t.slice(start, end).trim());
    start = end;
  }
  const rest = t.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

function splitLong(s, max = MAX_SENTENCE) {
  const out = [];
  let rest = s.trim();
  let guard = 0;
  while (rest.length > max && guard++ < 2000) {
    const win = rest.slice(0, max + 1);
    let cut = -1;
    const tries = [[/[;:]\s/g, 1], [/,\s/g, 1], [/\s(?:and|but|which|while|whereas|because|although|or)\s/g, 0]];
    for (const [re, add] of tries) {
      let mm; let best = -1;
      while ((mm = re.exec(win))) {
        const at = mm.index + add;
        if (at >= max * 0.35 && at <= max) best = at;
      }
      if (best > 0) { cut = best; break; }
    }
    if (cut < 0) cut = win.lastIndexOf(' ', max);
    if (cut < 20) cut = max;
    const head = rest.slice(0, cut).trim();
    out.push(head);
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

const hasWord = (s) => /[A-Za-z0-9]/.test(s);

/** Text -> speakable sentences, each at most MAX_SENTENCE characters. */
export function toSentences(text, max = MAX_SENTENCE) {
  const out = [];
  for (const s of splitSentences(normalizeForSpeech(text))) {
    for (const piece of s.length > max ? splitLong(s, max) : [s]) if (hasWord(piece)) out.push(piece);
  }
  return out;
}

// ---------- full listen text ----------
const PAGE_NUM = /^\s*(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?\s*$/i;
const BOILER = /electronic copy available|downloaded from|all rights reserved|ssrn\.com\/abstract|^\s*preprint\b|submitted to\b/i;
const REF_HEAD = /^\s*(?:\d+\.?\s*)?(?:references?|bibliography|works cited|literature cited)\s*$/i;

function runningHeaders(blocks) {
  const seen = new Map();
  for (const b of blocks) {
    if (!b || b.type !== 'p') continue;
    const t = str(b.text).trim();
    if (!t || t.length > 110 || /[.!?]["')]*$/.test(t)) continue;   // headers have no sentence end
    const key = t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
    const pages = seen.get(key) || new Set();
    pages.add(b.page ?? b.i);
    seen.set(key, pages);
  }
  const out = new Set();
  for (const [k, pages] of seen) if (pages.size >= 3) out.add(k);
  return out;
}

function headingSentence(text, max = MAX_SENTENCE) {
  const t = normalizeForSpeech(str(text).replace(/^\s*(?:\d+(?:\.\d+)*\.?|[IVX]+\.)\s+(?=\D)/, '')).replace(/[.:;,\s]+$/, '');
  if (!hasWord(t)) return [];
  const parts = t.length + 1 > max ? splitLong(t + '.', max) : [t + '.'];
  return parts.filter(hasWord);
}

/** Listen text for the browser voice: a flat array of { text, block } where `block` is the `i` of the source block (its array
 *  index when a block has no numeric i), so the reader can highlight the paragraph and resume from a block.
 *  Every text is at most opts.maxChars (default 110): cut at sentence ends first, then clause and word boundaries. */
export function speechSentences(blocks, opts = {}) {
  try {
    const max = Number.isFinite(+opts?.maxChars) && +opts.maxChars >= 40 ? Math.floor(+opts.maxChars) : MAX_SENTENCE;
    const list = arr(blocks);
    const headers = runningHeaders(list.filter((b) => b && typeof b === 'object'));
    const out = [];
    let inRefs = false;
    list.forEach((b, idx) => {
      if (!b || typeof b !== 'object') return;
      const block = b.i != null && Number.isFinite(+b.i) ? +b.i : idx;
      const add = (texts) => { for (const text of texts) out.push({ text, block }); };
      const type = str(b.type);
      const raw = str(b.text);
      if (type === 'h1' || type === 'h2') {
        inRefs = REF_HEAD.test(raw);
        if (!inRefs) add(headingSentence(raw, max));
        return;
      }
      if (type === 'eq') return add(['An equation appears here.']);
      if (type === 'table') return add(['A table appears here.']);
      if (type === 'fig' || type === 'refs') return;
      if (type !== 'p' && type !== '') return;
      if (inRefs) return;
      const t = raw.trim();
      if (!t || PAGE_NUM.test(t) || BOILER.test(t)) return;
      const key = t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
      if (t.length <= 110 && !/[.!?]["')]*$/.test(t) && headers.has(key)) return;
      add(toSentences(t, max));
    });
    return out;
  } catch {
    return [];
  }
}

// ---------- timing and chunking ----------
export function countWords(sentences) {
  let n = 0;
  for (const s of arr(sentences)) { const m = str(s).trim().match(/\S+/g); if (m) n += m.length; }
  return n;
}

export function estimateSecs(sentences, rate = 1) {
  const r = Number.isFinite(+rate) && +rate > 0 ? Math.min(3, Math.max(0.5, +rate)) : 1;
  return Math.round((countWords(sentences) / (WPM * r)) * 60);
}

/** Group sentences into chunks of at most maxChars, never splitting a sentence (a lone sentence longer than
 *  maxChars is cut at a space as a last resort, which speechSentences output never needs). */
export function chunkForTts(sentences, { maxChars = 2500 } = {}) {
  const max = Number.isFinite(+maxChars) && +maxChars >= 50 ? Math.floor(+maxChars) : 2500;
  const chunks = [];
  let cur = '';
  const push = () => { if (cur) chunks.push(cur); cur = ''; };
  for (const raw of arr(sentences)) {
    const s = str(raw).trim();
    if (!s) continue;
    const pieces = s.length > max ? splitLong(s, max) : [s];
    for (const p of pieces) {
      if (cur && cur.length + 1 + p.length > max) push();
      cur = cur ? cur + ' ' + p : p;
    }
  }
  push();
  return chunks;
}

// ---------- briefing ----------
const NOTE_ORDER = [
  ['claim', "The paper's claim is "],
  ['mechanism', 'The mechanism it proposes is '],
  ['data', 'It uses '],
  ['method', 'The method is '],
  ['effect', 'The size of the effect is '],
  ['outOfSample', 'Out of sample, '],
  ['costs', 'Costs: '],
  ['caveats', 'Be careful about: '],
  ['relevance', 'For our desk: '],
  ['testHere', 'To test it here: '],
];
const MIN_BRIEFING_WORDS = 0;
const MAX_BRIEFING_WORDS = 750;   // five minutes at 150 wpm

function trimToSentences(text, maxChars) {
  const sents = splitSentences(normalizeForSpeech(text));
  const out = [];
  let n = 0;
  for (const s of sents) {
    if (out.length && n + s.length > maxChars) break;
    out.push(s); n += s.length + 1;
  }
  return out;
}

function lowerFirst(s) {
  return /^[A-Z](?:[a-z]|\s+[a-z])/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

function findAbstract(blocks) {
  const list = arr(blocks).filter((b) => b && typeof b === 'object');
  const at = list.findIndex((b) => (b.type === 'h1' || b.type === 'h2') && /^\s*abstract\s*$/i.test(str(b.text)));
  if (at >= 0) {
    const paras = [];
    for (let k = at + 1; k < list.length && paras.length < 3; k++) {
      if (list[k].type === 'h1' || list[k].type === 'h2') break;
      if (list[k].type === 'p') paras.push(str(list[k].text));
    }
    if (paras.length) return paras.join(' ');
  }
  const p = list.find((b) => b.type === 'p' && str(b.text).length > 400 && (b.page == null || b.page <= 1));
  return p ? str(p.text) : '';
}

function stanceLine(paper) {
  const st = str(paper?.notes?.stance || paper?.stance).trim();
  if (!st) return '';
  const clean = normalizeForSpeech(st).replace(/[.\s]+$/, '');
  return clean ? `The stance on file for this paper is: ${clean}.` : '';
}

/** paper: { title, year, abstract?, notes:{claim,...,stance}|null, stance? }; blocks: Block[]|null;
 *  conclusion: string[] (the desk's conclusion(blocks)) or { conclusion:[...] }. */
export function briefingScript(paper, blocks, conclusion) {
  try {
    const p = paper && typeof paper === 'object' ? paper : {};
    const notes = p.notes && typeof p.notes === 'object' ? p.notes : {};
    let concl = Array.isArray(conclusion) ? conclusion : Array.isArray(conclusion?.conclusion) ? conclusion.conclusion
      : Array.isArray(p.conclusion) ? p.conclusion : [];
    concl = concl.map((c) => str(c).trim()).filter(Boolean);
    const title = normalizeForSpeech(str(p.title)).replace(/[.\s]+$/, '') || 'Untitled paper';
    const abstractText = str(p.abstract) || findAbstract(blocks);

    let level = 0;
    let sentences = [];
    let src = { abstract: false, notes: false, conclusion: false };
    const caps = [{ abs: 900, note: 450, concl: 600, both: true }, { abs: 700, note: 320, concl: 450, both: true },
      { abs: 500, note: 220, concl: 350, both: false }, { abs: 350, note: 150, concl: 250, both: false }];
    for (; level < caps.length; level++) {
      const c = caps[level];
      sentences = [];
      src = { abstract: false, notes: false, conclusion: false };
      sentences.push(...toSentences(`Briefing: ${title}.`));
      const yr = +p.year;
      if (Number.isFinite(yr) && yr > 1800 && yr < 2200) sentences.push(...toSentences(`It was published in ${yr}.`));
      sentences.push('This is a short briefing from the desk, not a reading of the paper.');
      const abs = trimToSentences(abstractText, c.abs);
      if (abs.length) { sentences.push('The abstract says:', ...abs.flatMap((s) => (s.length > MAX_SENTENCE ? splitLong(s) : [s]))); src.abstract = true; }
      for (const [key, glue] of NOTE_ORDER) {
        const txt = str(notes[key]).trim();
        if (!txt) continue;
        const body = trimToSentences(txt, c.note);
        if (!body.length) continue;
        const first = glue + (glue.endsWith(': ') ? body[0] : lowerFirst(body[0]));
        const merged = [first, ...body.slice(1)].map((s, k) => (k === body.length - 1 || /[.!?]$/.test(s) ? s : s + '.'));
        sentences.push(...merged.flatMap((s) => (s.length > MAX_SENTENCE ? splitLong(s) : [s])));
        src.notes = true;
      }
      if (concl.length) {
        const firstP = trimToSentences(concl[0], c.concl);
        const lastP = concl.length > 1 && c.both ? trimToSentences(concl[concl.length - 1], c.concl) : [];
        if (firstP.length) { sentences.push('From the conclusion:', ...firstP); src.conclusion = true; }
        if (lastP.length) sentences.push('And the paper ends with:', ...lastP);
      }
      const st = stanceLine(p);
      if (st) sentences.push(...toSentences(st));
      sentences.push('That is the briefing.', 'The original paper is in the library if you want the detail.');
      sentences = sentences.flatMap((s) => (s.length > MAX_SENTENCE ? splitLong(s) : [s])).filter(hasWord);
      if (countWords(sentences) <= MAX_BRIEFING_WORDS) break;
    }
    return { title, sentences, secs: estimateSecs(sentences), source: src };
  } catch {
    return { title: '', sentences: [], secs: 0, source: { abstract: false, notes: false, conclusion: false } };
  }
}

export { MIN_BRIEFING_WORDS, MAX_BRIEFING_WORDS };
