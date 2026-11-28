// js/terminal/ccyCardCore.js: the Currencies tab card's wording and fit rules, pure (no DOM), so the card and the modal say one thing.
//
// plainRuling(text): the Currency Manager's ruling is written by a model from the Desk Pack, and it cites its feeds by id in brackets
//   ("(fed-path 2026-11-24)", "(boc/latest, world-rates)") and quotes field names ("hawkishScore 0.55", "econ-trend -1"). The card is read by
//   a trader, so the bracketed source lists are dropped and the ids that are part of a sentence become words. The Fed's broad trade-weighted
//   dollar (DTWEXBGS, ~120) is labelled "DXY" by the pack's older feeds; a "DXY" above 110 is that index and is named so (the ICE DXY is ~100).
// pairFit(pair, rating, biasOf): whether a card fits the book's currency biases, judged on the PAIR (base bias minus quote bias), so a cross reads
//   the same under both of its currencies. GBPJPY short with GBP −1 and JPY −1 has no bias gap: it neither fits nor fights the biases.
// engineSplit(bias, m): the Currency Manager's bias (−2..+2) and the bias engine's read on different sides, for the card's "engine disagrees".

import { DESK_FEEDS } from '../deskPack.js';

const fin = v => v != null && v !== '' && Number.isFinite(Number(v));

// feed ids the pack uses, as words. Longest first so "econ-surprise" is not read as "econ".
const IDS = [
  ['rbnz/latest empty', 'no RBNZ statement read'], ['rbnz/latest', 'RBNZ statement'], ['boc/latest', 'BoC statement'], ['boe/latest', 'BoE statement'],
  ['ecb/latest', 'ECB statement'], ['boj/latest', 'BoJ statement'], ['snb/latest', 'SNB statement'], ['rba/latest', 'RBA statement'], ['fed/latest', 'Fed statement'],
  ['hawkishScore', 'hawkish score'], ['econ-surprise', 'economic surprise'], ['econ-trend', 'economic trend'], ['global-read', 'global read'],
  ['fed-path', 'Fed path'], ['policy-rates', 'policy rates'], ['rate-diff', 'rate gap'], ['real-yield', 'real yield'], ['cot-state', 'COT positioning'],
  ['macro-scorecard', 'macro scorecard'], ['speech-drift', 'speech tone'], ['world-rates', 'world rates'], ['global-yields', 'global yields'],
  ['intl-yields', 'international yields'], ['oanda-book', 'retail positioning'], ['trade-balance', 'trade balance'], ['yield-curve', 'yield curve'],
  ['yield-spread', 'yield spread'], ['yield-coupling', 'yield coupling'], ['gap-FX corr(?:elation)?', 'yield-gap to FX correlation'],
];
// the pack's feed ids (js/deskPack.js) and the analysts' ids: a bracket whose every part is one of these (with a date, a pair or "empty"
// after it) is a source list. Anything else in brackets ("(z -2.56)", "(a weaken tell)", "(risk-off)") is the text and stays.
const KNOWN = new Set([...DESK_FEEDS.flatMap(f => [f.id, f.id.split('/')[0]]), 'oanda-book', 'yield-spread', 'rates_cb', 'macro_economy', 'cot_positioning',
  'yields_curve', 'credit_funding', 'events_news', 'options_oi', 'levels_structure', 'vol_iv', 'global_market', 'evidence_memory']);
const isIdPart = p => {
  if (/^currency ruling$/i.test(p)) return true;
  const [head, ...rest] = p.split(/\s+/);
  return KNOWN.has(head) && rest.every(w => /^(\d{4}-\d{2}-\d{2}|[A-Z]{3,6}|empty|latest)$/.test(w));
};

/** The ruling text for a reader: bracketed source lists dropped, ids in sentences as words, the broad dollar index named. */
export function plainRuling(text) {
  let s = String(text ?? '');
  if (!s) return s;
  // "(currency ruling, fed-path, policy-rates)" / "(fed-path 2026-11-24)" / "(boc/latest, world-rates)": every part is a feed id -> dropped
  s = s.replace(/\s*\(([^()]{2,160})\)/g, (all, inner) => (inner.split(/\s*[,;]\s*/).every(p => isIdPart(p.trim())) ? '' : all));
  s = s.replace(/\bDXY (1[1-9]\d(?:\.\d+)?)/g, 'the broad dollar index (Fed) $1');
  for (const [id, word] of IDS) s = s.replace(new RegExp(`(?<![\\w-])${id.replace(/[/.]/g, m => `\\${m}`)}(?![\\w-])`, 'gi'), word);
  return s.replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** { state: 'fits' | 'against' | 'even' | 'none', gap } for a card on `pair` (6 letters) rated `dir` (+1 long / −1 short), with biasOf(ccy). */
export function pairFit(pair, dir, biasOf) {
  const b = biasOf(pair.slice(0, 3)), q = biasOf(pair.slice(3, 6));
  if (!fin(b) || !fin(q) || !dir) return { state: 'none', gap: null };
  const gap = Number(b) - Number(q);
  return { state: gap === 0 ? 'even' : Math.sign(gap) === Math.sign(dir) ? 'fits' : 'against', gap };
}

/** True when the bias engine reads the other side from the book's bias (neutral counts as a side); false when either has no read. */
export function engineSplit(bias, m) {
  if (!fin(bias) || !m?.dir) return false;
  const e = m.dir === 'BULLISH' ? 1 : m.dir === 'BEARISH' ? -1 : 0;
  return e !== Math.sign(Number(bias));
}
