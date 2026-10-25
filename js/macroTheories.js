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
  { id: 'growth-scare', name: 'A growth scare', covers: ['real-nq', 'real-spx', 'hy-nq', 'hy-spx', 'vix-hy', 'copper-audusd'],
    plain: 'Investors are lowering their expectations for the economy. They buy bonds because growth looks weaker, which pulls real yields down, and lenders to riskier companies ask for more interest.',
    alsoFits: 'A change in what investors expect the Fed to do, or heavy demand for long bonds from pension funds and insurers, also pulls real yields down without any worry about growth.',
    separate: 'Weak growth data or a falling copper price would back it. A strong growth estimate, or credit spreads narrowing again, would count against it.',
    blurb: 'Investors mark down the outlook for growth, which pulls real yields lower and widens credit spreads even as money gets cheaper.',
    limit: 'Lower real yields with wider credit fit a growth downgrade, but they also fit a shift in expected Fed policy or heavy demand for long bonds, so prices alone cannot say why investors want the bonds.',
    checks: [['Real yields fell', m => m.real && m.real.moved && m.real.dir === 'down', m => !!m.real],
             ['Expected inflation did not move', m => m.bei && !m.bei.moved, m => !!m.bei],
             ['Credit spreads widened', m => m.hy && m.hy.moved && m.hy.dir === 'up', m => !!m.hy],
             ['Stocks fell', m => (m.nq?.moved && m.nq.dir === 'down') || (m.spx?.moved && m.spx.dir === 'down'), m => !!(m.nq || m.spx)]] },
  { id: 'flight-to-safety', name: 'Flight to safety', covers: ['real-dxy', 'dxy-gold', 'vix-usdjpy', 'dxy-usdjpy', 'real-gold'],
    plain: 'Investors sell risky assets and buy the ones seen as safe, above all the dollar. Share prices fall and fear gauges rise.',
    alsoFits: 'A growth scare produces the same falling shares and rising fear. A stronger dollar can also come from US yields rising against other countries, which is not fear at all.',
    separate: 'The yen and the Swiss franc strengthening, and the dollar rising on the daily currency pairs, not only on a slow index. Gold is often bought in a rush to safety; here it fell.',
    blurb: 'Money leaves risk for the dollar and shelter.',
    limit: 'A stronger dollar and falling stocks fit a search for shelter, but they fit a plain growth downgrade equally well. The checks here do not include the yen, the franc or gold flows, which would help tell the two apart.',
    checks: [['The dollar rose', m => m.dxy && (m.dxy.moved ? m.dxy.dir === 'up' : false), m => !!m.dxy],
             ['Stocks fell', m => (m.nq?.moved && m.nq.dir === 'down') || (m.spx?.moved && m.spx.dir === 'down'), m => !!(m.nq || m.spx)],
             ['The VIX rose', m => m.vix && m.vix.moved && m.vix.dir === 'up', m => !!m.vix]] },
  { id: 'forced-selling', name: 'Forced selling', covers: ['real-gold', 'funding-dxy', 'funding-vix', 'dxy-gold'],
    plain: 'Some investors have to sell whatever they can, including things that normally hold up, because they need cash to cover losses. Assets that usually move apart then fall together.',
    alsoFits: 'Profit-taking after a long rally, a stronger dollar or a change in central-bank gold buying can push gold down on its own.',
    separate: 'Signs of leveraged positions closing: sharp moves in funding markets, in cross-asset volatility or in positioning data. Prices alone cannot show who is selling.',
    blurb: 'Assets that normally move apart fall together because someone has to raise cash.',
    limit: 'Gold falling alongside lower real yields is unusual, but profit-taking after a long rally, a stronger dollar or a change in central-bank buying can do the same. Forced selling is a claim about who is selling and why, which price data alone cannot show.',
    checks: [['Gold fell while real yields fell, the opposite of the usual link', m => m.gold && m.real && m.gold.moved && m.gold.dir === 'down' && m.real.moved && m.real.dir === 'down', m => !!(m.gold && m.real)],
             ['Stocks fell', m => (m.nq?.moved && m.nq.dir === 'down') || (m.spx?.moved && m.spx.dir === 'down'), m => !!(m.nq || m.spx)],
             ['Credit spreads widened', m => m.hy && m.hy.moved && m.hy.dir === 'up', m => !!m.hy],
             ['The dollar rose', m => m.dxy && m.dxy.moved && m.dxy.dir === 'up', m => !!m.dxy]] },
  { id: 'isolated-tech', name: 'An isolated technology repricing', covers: ['smh-nq', 'real-nq'],
    plain: 'The damage is concentrated in chip and growth shares. The wider market and credit markets are not worried.',
    alsoFits: 'The early stage of a wider repricing, since chip shares often lead.',
    separate: 'Credit spreads staying calm while only chips fall would back it. Credit widening further, or the S&P 500 following the Nasdaq down, would count against it.',
    blurb: 'Chip and growth stocks are being marked down while the wider market and credit stay calm.',
    limit: 'This story needs credit and the wider market to stay calm. When credit also widens, as in a broad repricing, it fits less well; and chips falling harder than the Nasdaq can be an early sign of something wider.',
    checks: [['Semiconductors fell', m => m.smh && m.smh.moved && m.smh.dir === 'down', m => !!m.smh],
             ['They fell by more than the Nasdaq', m => m.smh && m.nq && m.smh.delta < m.nq.delta, m => !!(m.smh && m.nq)],
             ['Credit spreads stayed calm', m => m.hy && !m.hy.moved, m => !!m.hy],
             ['The VIX did not rise', m => m.vix && !(m.vix.moved && m.vix.dir === 'up'), m => !!m.vix]] },
];
const LABEL_TEXT = { supported: 'All measurable checks agree', mixed: 'Some checks agree', against: 'Few checks agree', untested: 'Not yet tested' };

/** The labelled theories, best supported first. `overrides` replaces a market's move, for example the dollar measured on the daily pairs instead of a lagging index. Each check is { text, ok: true | false | null }. */
export function buildTheories(links, overrides = {}) {
  const m = { ...nodeMoves(links), ...overrides };
  if (!Object.keys(m).length) return [];
  const rank = { supported: 0, mixed: 1, against: 2, untested: 3 };
  return THEORIES.map(t => {
    const checks = t.checks.map(([text, test, can]) => ({ text, ok: can(m) ? !!test(m) : null }));
    const known = checks.filter(c => c.ok !== null), yes = known.filter(c => c.ok).length;
    const label = known.length < 2 ? 'untested' : yes === known.length ? 'supported' : yes >= known.length / 2 ? 'mixed' : 'against';
    return { id: t.id, name: t.name, blurb: t.blurb, plain: t.plain, alsoFits: t.alsoFits, separate: t.separate, covers: t.covers, limit: t.limit, label, labelText: LABEL_TEXT[label], checks, agree: yes, measurable: known.length, total: checks.length };
  }).sort((a, b) => rank[a.label] - rank[b.label]);
}

/** The chain's own sentences cite the study that backs them, with a file path. A reader should see the finding, not the path. */
export const plainText = s => String(s ?? '').replace(/\s*\((?:analysis|MD files|forge|js)\/[^)]*\)/g, '').replace(/\s*\b[\w./-]+\.(?:mjs|md|js)\b/g, '').replace(/\s{2,}/g, ' ').trim();

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
    mechanism: plainText(`${def.textbook}. ${def.holds}`),
    today: `${l.a.label} ${l.a.text} and ${l.b.label} ${l.b.text} over the last 20 days${broken ? ', so the link did not hold' : ', so the link held'}.`,
    alternatives: broken ? plainText(def.broken?.[ad] ?? '') : '',
  };
}

/** Broken links that none of the stories speaks to: what the four explanations leave unexplained today. */
export function uncoveredBreaks(links, theories) {
  const seen = new Set((theories ?? []).flatMap(t => t.covers ?? []));
  return (links ?? []).filter(l => l.verdict === 'broken' && !seen.has(l.id));
}
