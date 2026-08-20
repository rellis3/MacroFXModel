// js/cbLexicon.js — deterministic hawkish/dovish lexicon scorer for central-bank
// text. Scorer A (CONFIRMATORY) of `MD files/CB_SENTIMENT_PRICE_TEST.md` Stage 2.
//
// Why a word-count scorer when an LLM engine already exists: an LLM scoring a
// 2019 statement knows what happened in 2020 — hindsight contamination that no
// prompt can fully remove. This scorer is hindsight-free by construction: the
// term lists below are FROZEN (v1, 2026-08-17, committed before any historical
// document was scored — the build sandbox could not reach federalreserve.gov,
// so no score existed to tune against). Changing a list after historical scores
// exist voids Stage 3 and requires re-registration under a new version tag.
//
// Method: Apel & Blix Grimaldi-style term counting. score = (H − D) / (H + D)
// over total hawkish/dovish term hits, in [−1, +1]; 0 when no term matches.
// Deliberately minimal-DOF: no negation handling, no tf-idf, no weighting —
// each of those is a tunable knob and this scorer's whole value is having none.
// Known limitation (accepted): "cut" in "cut its policy rate" and "decided to
// maintain" both count the same wherever they appear, including in the recap
// of PREVIOUS decisions that statements sometimes contain.
//
// Term lists target FOMC/CB statement register specifically — phrases (not
// bare adjectives) wherever a single word would false-positive on ordinary
// prose ("weaker dollar", "strong demand for housing").

export const LEXICON_VERSION = 'cb-lexicon-v1';

// Each entry is matched case-insensitively as a whole-word regex; simple
// inflection groups are written explicitly rather than stemmed.
export const HAWKISH_TERMS = [
  'rais(?:e|ed|ing) (?:the )?(?:target )?(?:range|rate|rates)',
  'rate (?:hike|hikes|increase|increases)',
  'hike[ds]?',
  'tighten(?:ed|ing|s)?',
  'tighter (?:policy|stance|financial conditions)',
  'restrictive',
  'additional firming',
  'further (?:increases?|firming|tightening)',
  'inflation (?:pressures?|remains? elevated|is elevated)',
  'elevated inflation',
  'upside risks? to inflation',
  'inflation (?:has|have)? ?(?:moved|run|running) above',
  'above (?:the committee.s|its|the) (?:2 percent |longer.run )?(?:objective|goal|target)',
  'persistent(?:ly)? (?:high )?inflation',
  'overheat(?:ed|ing)?',
  'strong(?:er)? (?:labor market|job gains|payroll)',
  'robust (?:job gains|labor market|growth)',
  'solid (?:pace|rate|gains|growth)',
  'economic activity (?:has been )?(?:expanding|rose|strengthened) at a (?:strong|solid|robust)',
  'remov(?:e|al|ing) (?:of )?(?:policy )?accommodation',
  'normaliz(?:e|ation|ing) (?:of )?(?:the )?(?:policy|balance sheet)',
  'reduc(?:e|ing|tion in) (?:the size of )?(?:the federal reserve.s|its) (?:securities holdings|balance sheet)',
  'vigilant',
  'attentive to inflation risks',
  'price stability (?:risks?|concerns?)',
];

export const DOVISH_TERMS = [
  'lower(?:ed|ing)? (?:the )?(?:target )?(?:range|rate|rates)',
  'rate (?:cut|cuts|reduction|reductions)',
  'cut(?:s|ting)? (?:the )?(?:target )?(?:range|rate|rates)',
  'eas(?:e|ed|ing) (?:of )?(?:policy|the stance|monetary policy)',
  'accommodat(?:ive|ion)',
  'stimulus',
  'patient(?:ly)?',
  'gradual(?:ly)?',
  'downside risks?',
  'risks? (?:are|remain) (?:weighted|tilted) to the downside',
  'below (?:the committee.s|its|the) (?:2 percent |longer.run )?(?:objective|goal|target)',
  'inflation (?:has|have)? ?(?:declined|moderated|eased|come down|moved (?:down|lower))',
  'subdued (?:inflation|price pressures?)',
  'muted (?:inflation|price pressures?)',
  'shortfalls? (?:of|from) (?:its|the) maximum.level',
  'weak(?:er|ened|ness)? (?:economic )?(?:activity|growth|demand|data)',
  'slow(?:ed|ing|down)? (?:in )?(?:economic activity|growth|the pace)',
  'soften(?:ed|ing)?',
  'moderat(?:ed|ing|ion) (?:in|of) (?:economic activity|growth|job gains)',
  'deteriorat(?:e|ed|ing|ion)',
  'recession',
  'asset purchases?',
  'quantitative easing',
  'increas(?:e|ing) (?:its )?holdings of (?:treasury|agency)',
  'support(?:ive of|ing) (?:the )?(?:economic recovery|economy|flow of credit)',
  'headwinds?',
  'uncertaint(?:y|ies) (?:remains? )?(?:elevated|high|heightened)',
];

const compile = terms => new RegExp(`\\b(?:${terms.join('|')})\\b`, 'gi');
const HAWK_RE = compile(HAWKISH_TERMS);
const DOVE_RE = compile(DOVISH_TERMS);

// score(text) → { score, hawk, dove, nWords, hits }
//   score:  (hawk − dove) / (hawk + dove) in [−1, 1]; 0 if no term matched
//   hawk/dove: total term hits per side
//   nWords: crude token count (for per-length context, not used in score)
//   hits:   matched substrings (lower-cased, deduped) — the audit trail that
//           lets a reader verify every count against the document
export function score(text) {
  if (!text || typeof text !== 'string') return { score: 0, hawk: 0, dove: 0, nWords: 0, hits: { hawk: [], dove: [] } };
  const hawkHits = text.match(HAWK_RE) ?? [];
  const doveHits = text.match(DOVE_RE) ?? [];
  const h = hawkHits.length, d = doveHits.length;
  return {
    score: h + d === 0 ? 0 : (h - d) / (h + d),
    hawk: h,
    dove: d,
    nWords: (text.match(/\S+/g) ?? []).length,
    hits: {
      hawk: [...new Set(hawkHits.map(s => s.toLowerCase()))],
      dove: [...new Set(doveHits.map(s => s.toLowerCase()))],
    },
  };
}
