/**
 * Competing explanations for the day, and one lesson built from the day's own divergence. Both are read from the evaluated chain (js/macroChain.js), so they use only
 * moves the desk has already measured against each market's noise floor, and nothing here is a forecast or a trade signal.
 *
 * THE THEORIES. Each is a fixed, named story with a short list of CHECKS. A check is a plain statement about two or three markets ("the dollar rose", "gold fell while
 * real yields fell") that is true, false or unmeasurable today. The label counts the checks and nothing else:
 *   supported       every measurable check agrees
 *   mixed           at least half of the measurable checks agree
 *   not supported   fewer than half agree
 *   not yet tested  fewer than two checks could be measured, so no label is earned
 * It is NOT a probability and not a score: the desk has not validated any weighting, so it does not offer one. The theories are illustrative hypotheses.
 *
 * THE INSIGHT. For the day's story link it states the textbook mechanism, the divergence in numbers, and the alternative forces the chain already lists for a broken link.
 *
 * Pure. Tested in js/macroTheories.test.mjs.
 */
import { CHAIN_NODES, CHAIN_LINKS } from './macroChain.js';

/** Every market that appears at either end of an evaluated link, as { delta, moved, dir, text, label }. */
export function nodeMoves(links) {
  const out = {};
  for (const l of links ?? []) for (const e of [l.a, l.b]) if (e?.key && out[e.key] == null && Number.isFinite(e.delta)) out[e.key] = { delta: e.delta, moved: !!e.moved, dir: e.dir, text: e.text, label: e.label };
  return out;
}

const THEORIES = [
  { id: 'flight-to-safety', name: 'Flight to safety', blurb: 'Money leaves risk for the dollar and shelter.',
    checks: [['The dollar rose', m => m.dxy && (m.dxy.moved ? m.dxy.dir === 'up' : false), m => !!m.dxy],
             ['Stocks fell', m => (m.nq?.moved && m.nq.dir === 'down') || (m.spx?.moved && m.spx.dir === 'down'), m => !!(m.nq || m.spx)],
             ['The VIX rose', m => m.vix && m.vix.moved && m.vix.dir === 'up', m => !!m.vix]] },
  { id: 'forced-selling', name: 'Forced selling', blurb: 'Assets that normally move apart fall together because someone has to raise cash.',
    checks: [['Gold fell while real yields fell, the opposite of the usual link', m => m.gold && m.real && m.gold.moved && m.gold.dir === 'down' && m.real.moved && m.real.dir === 'down', m => !!(m.gold && m.real)],
             ['Stocks fell', m => (m.nq?.moved && m.nq.dir === 'down') || (m.spx?.moved && m.spx.dir === 'down'), m => !!(m.nq || m.spx)],
             ['Credit spreads widened', m => m.hy && m.hy.moved && m.hy.dir === 'up', m => !!m.hy],
             ['The dollar rose', m => m.dxy && m.dxy.moved && m.dxy.dir === 'up', m => !!m.dxy]] },
  { id: 'isolated-tech', name: 'An isolated technology repricing', blurb: 'Chip and growth stocks are being marked down while the wider market and credit stay calm.',
    checks: [['Semiconductors fell', m => m.smh && m.smh.moved && m.smh.dir === 'down', m => !!m.smh],
             ['They fell by more than the Nasdaq', m => m.smh && m.nq && m.smh.delta < m.nq.delta, m => !!(m.smh && m.nq)],
             ['Credit spreads stayed calm', m => m.hy && !m.hy.moved, m => !!m.hy],
             ['The VIX did not rise', m => m.vix && !(m.vix.moved && m.vix.dir === 'up'), m => !!m.vix]] },
];

/** The labelled theories, best supported first. Each check is { text, ok: true | false | null }. */
export function buildTheories(links) {
  const m = nodeMoves(links);
  if (!Object.keys(m).length) return [];
  const rank = { supported: 0, mixed: 1, against: 2, untested: 3 };
  return THEORIES.map(t => {
    const checks = t.checks.map(([text, test, can]) => ({ text, ok: can(m) ? !!test(m) : null }));
    const known = checks.filter(c => c.ok !== null), yes = known.filter(c => c.ok).length;
    const label = known.length < 2 ? 'untested' : yes === known.length ? 'supported' : yes >= known.length / 2 ? 'mixed' : 'against';
    return { id: t.id, name: t.name, blurb: t.blurb, label, checks, agree: yes, measurable: known.length, total: checks.length };
  }).sort((a, b) => rank[a.label] - rank[b.label]);
}

/** The chain's own sentences cite the study that backs them, with a file path. A reader should see the finding, not the path. */
const plain = s => String(s ?? '').replace(/\s*\((?:analysis|MD files|forge|js)\/[^)]*\)/g, '').replace(/\s*\b[\w./-]+\.(?:mjs|md|js)\b/g, '').replace(/\s{2,}/g, ' ').trim();

/** One lesson from the day's story link: the mechanism, the divergence, the forces that could overwhelm it. null when there is no judged link. */
export function buildInsight(links, storyId) {
  const l = (links ?? []).find(x => x.id === storyId && (x.verdict === 'holding' || x.verdict === 'broken'));
  if (!l) return null;
  const def = CHAIN_LINKS.find(x => x.id === l.id);
  if (!def) return null;
  const broken = l.verdict === 'broken', ad = l.a.dir, bd = l.b.dir;
  return {
    id: l.id, broken,
    title: broken ? `Why can ${l.b.label} go ${bd} when ${l.a.label} goes ${ad}?` : `Why does ${l.b.label} usually move with ${l.a.label}?`,
    mechanism: plain(`${def.textbook}. ${def.holds}`),
    today: `${l.a.label} ${l.a.text} and ${l.b.label} ${l.b.text} over the last 20 days${broken ? ', so the link did not hold' : ', so the link held'}.`,
    alternatives: broken ? plain(def.broken?.[ad] ?? '') : '',
  };
}
