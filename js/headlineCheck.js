/**
 * Checks what a headline, a standfirst or a sentence of the desk's written reading claims against the day's own figures, so nothing is printed that the data contradicts.
 *
 * The brief that supplies the wording is written by a language model, and it can state a move the figures do not show. Each recognised claim is marked
 *   verified       the figures show it, past the series' own noise floor
 *   contradicted   the figures show the opposite
 *   unverifiable   the move is inside its noise floor, or the data to judge it is missing
 * The dollar is judged on the seven daily dollar pairs, because the broad dollar index is a weekly-lag series and can end days before the rest.
 * A headline with a claim that is not verified is replaced by one built from verified figures only. Nothing here forecasts anything.
 *
 * Pure. Tested in js/headlineCheck.test.mjs.
 */
import { nodeMoves } from './macroTheories.js';
import { CHAIN_NODES } from './macroChain.js';
import { dollarBasket } from './dataChecks.js';

const UP = '(?:rose|rises|rise|rising|bought|bid|stronger|strengthen\\w*|strength|firmer|higher|rall\\w+|climb\\w*|gain\\w*|surg\\w*)';
const DOWN = '(?:fell|falls|fall|falling|drop\\w*|lower|declin\\w+|weaker|weaken\\w*|softer|slid\\w*|slump\\w*|sold off|sell-off)';
const RULES = [
  { id: 'dollar-up', re: new RegExp(`\\bdollar\\b[^.;:]*\\b${UP}\\b|\\b(?:bought|bid)\\b[^.;:]*\\bdollar\\b`, 'i'), dir: 'up', what: 'the dollar rose' },
  { id: 'dollar-down', re: new RegExp(`\\bdollar\\b[^.;:]*\\b${DOWN}\\b`, 'i'), dir: 'down', what: 'the dollar fell' },
  { id: 'yields-down', re: new RegExp(`\\b(?:bond )?yields?\\b[^.;:]*\\b${DOWN}\\b`, 'i'), dir: 'down', what: 'yields fell' },
  { id: 'credit-wider', re: /\bcredit\b[^.;:]*\b(?:widen\w*|wider)\b|\bspreads?\b[^.;:]*\b(?:widen\w*|wider)\b/i, dir: 'up', what: 'credit spreads widened' },
  { id: 'stocks-down', re: new RegExp(`\\b(?:nasdaq|stocks|shares|equities|tech)\\b[^.;:]*\\b${DOWN}\\b`, 'i'), dir: 'down', what: 'stocks fell' },
  { id: 'gold-down', re: new RegExp(`\\bgold\\b[^.;:]*\\b${DOWN}\\b`, 'i'), dir: 'down', what: 'gold fell' },
];

/** The measured move behind each claim: { dir, moved, text }, or null when it cannot be measured. */
export function evidenceFor({ links, ys, assets }) {
  const m = nodeMoves(links ?? []), b = dollarBasket(assets);
  const node = k => (m[k] ? { dir: m[k].dir, moved: m[k].moved, text: `${m[k].label} ${m[k].text}` } : null);
  const stock = [node('nq'), node('spx')].filter(Boolean).find(x => x.moved) ?? node('nq') ?? node('spx');
  return {
    'dollar-up': b.n >= 4 ? { dir: b.avg > 0 ? 'up' : 'down', moved: Math.abs(b.avg) >= CHAIN_NODES.dxy.floor, mixed: b.stronger * 2 === b.n, text: `on daily prices the dollar moved ${b.avg > 0 ? '+' : b.avg < 0 ? '−' : ''}${Math.abs(b.avg).toFixed(1)}% on average against ${b.n} majors, stronger against ${b.stronger} of ${b.n}`, basket: b } : null,
    'yields-down': Number.isFinite(ys?.dNom) ? { dir: ys.dNom < 0 ? 'down' : 'up', moved: Math.abs(ys.dNom) >= 8, text: `the 10-year moved ${ys.dNom > 0 ? '+' : '−'}${Math.abs(Math.round(ys.dNom))}bp` } : node('us10y'),
    'credit-wider': node('hy'), 'stocks-down': stock, 'gold-down': node('gold'),
  };
}

/** Every recognised claim in a piece of text, each with its verdict and the figure behind it. */
export function checkClaims(text, ev) {
  const out = [];
  for (const sentence of String(text ?? '').split(/(?<=[.!?])\s+/)) for (const r of RULES) {
    if (!r.re.test(sentence)) continue;
    const key = r.id === 'dollar-down' ? 'dollar-up' : r.id, e = ev[key];
    let status = 'unverifiable';
    if (e && e.moved && !e.mixed) status = (r.id === 'dollar-down' ? e.dir === 'down' : e.dir === r.dir) ? 'verified' : 'contradicted';
    out.push({ id: r.id, what: r.what, sentence, status, evidence: e?.text ?? 'no measurement available' });
  }
  return out;
}

/** Keep only the sentences the figures do not contradict. Returns the cleaned text and what was left out. */
export function scrubText(text, ev) {
  const keep = [], removed = [];
  for (const s of String(text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z“"'‘(])/).filter(Boolean)) {
    const bad = checkClaims(s, ev).find(c => c.status === 'contradicted');
    if (bad) removed.push({ sentence: s, what: bad.what, evidence: bad.evidence }); else keep.push(s);
  }
  return { text: keep.join(' '), removed };
}

/** A headline and standfirst from verified figures only. */
export function dataHeadline({ ys, links, assets }) {
  const m = nodeMoves(links ?? []), b = dollarBasket(assets), fell = k => m[k]?.moved && m[k].dir === 'down', up = k => m[k]?.moved && m[k].dir === 'up';
  const abs = v => Math.abs(Math.round(v)), list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const fallen = [fell('nq') && 'the Nasdaq', fell('gold') && 'gold'].filter(Boolean);
  let headline;
  if (Number.isFinite(ys?.dNom) && ys.dNom < 0 && fallen.length) headline = `Yields fell ${abs(ys.dNom)}bp, but ${list(fallen)} fell too`;
  else if (Number.isFinite(ys?.dNom) && ys.dNom !== 0) headline = `The 10-year yield ${ys.dNom < 0 ? 'fell' : 'rose'} ${abs(ys.dNom)}bp over 20 days`;
  else headline = 'What moved over the last 20 days, and what did not';
  const parts = [];
  if (Number.isFinite(ys?.dNom) && Number.isFinite(ys?.dReal) && ys.dNom && Math.round(100 * ys.dReal / ys.dNom) >= 50) parts.push(`real yields account for ${Math.round(100 * ys.dReal / ys.dNom)}% of the move in the 10-year`);
  if (up('hy')) parts.push(`credit spreads widened ${abs(m.hy.delta)}bp`);
  if (b.n >= 4) parts.push(`on daily prices the dollar ${b.avg > 0 ? 'rose' : b.avg < 0 ? 'fell' : 'was flat'} ${Math.abs(b.avg).toFixed(1)}% on average against ${b.n} majors`);
  const standfirst = parts.length ? `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}.` : '';
  return { headline, standfirst };
}
