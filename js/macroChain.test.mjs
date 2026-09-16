// Synthetic tests for js/macroChain.js. No network, no clock.
//   node js/macroChain.test.mjs
import { CHAIN_NODES, CHAIN_LINKS, nodeDelta, evaluateChain, summariseChain, chainForPrompt, CHAIN_WINDOW_DAYS } from './macroChain.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// A daily series: 30 calendar days ending 2026-09-10, linear from `from` to `to`.
const series = (from, to, days = 30, end = '2026-09-10') => {
  const endT = Date.parse(end);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(endT - (days - 1 - i) * 864e5).toISOString().slice(0, 10),
    value: from + (to - from) * i / (days - 1),
  }));
};

console.log('[spec integrity]');
{
  ok('every link points at two known nodes', CHAIN_LINKS.every(l => CHAIN_NODES[l.from] && CHAIN_NODES[l.to]));
  ok('every link has a holds sentence and both broken directions', CHAIN_LINKS.every(l => l.holds && l.broken?.up && l.broken?.down));
  ok('every link sign is ±1', CHAIN_LINKS.every(l => l.sign === 1 || l.sign === -1));
  ok('link ids unique', new Set(CHAIN_LINKS.map(l => l.id)).size === CHAIN_LINKS.length);
  ok('every link has a short name and three punch lines', CHAIN_LINKS.every(l => l.short && l.punch?.holds && l.punch?.up && l.punch?.down));
  ok('punch lines are one line (under 110 chars)', CHAIN_LINKS.every(l => [l.punch.holds, l.punch.up, l.punch.down].every(t => t.length <= 110)));
  ok('every node has a floor, unit and teaching text', Object.values(CHAIN_NODES).every(n => n.floor > 0 && ['pct', 'bp', 'pt'].includes(n.unit) && n.what));
}

console.log('[nodeDelta — the 20d change in the node\'s own unit]');
{
  const oil = nodeDelta(series(80, 88), CHAIN_NODES.oil);
  ok('pct unit: percent change of price', oil && Math.abs(oil.delta - (88 / (88 - 8 * 20 / 29) - 1) * 100) < 0.5, JSON.stringify(oil));
  const bei = nodeDelta(series(2.20, 2.32), CHAIN_NODES.bei);
  ok('bp unit: ×100 of the raw change', bei && Math.abs(bei.delta - 12 * 20 / 29) < 0.5, String(bei?.delta));
  const vix = nodeDelta(series(15, 21), CHAIN_NODES.vix);
  ok('pt unit: raw change', vix && Math.abs(vix.delta - 6 * 20 / 29) < 0.2, String(vix?.delta));
  ok('carries asOf and the reference date', oil.asOf === '2026-09-10' && oil.refDate && oil.refGapDays >= CHAIN_WINDOW_DAYS);
  ok('too-short series -> null', nodeDelta(series(1, 2, 5), CHAIN_NODES.oil) === null);
  ok('missing -> null', nodeDelta(null, CHAIN_NODES.oil) === null && nodeDelta([], CHAIN_NODES.oil) === null);
  ok('monthly-only series cannot answer 20d -> null', nodeDelta([{ date: '2026-06-01', value: 1 }, { date: '2026-09-01', value: 2 }], CHAIN_NODES.oil) === null);
}

console.log('[evaluateChain — verdicts]');
{
  const v = (delta) => ({ delta, last: 1, asOf: '2026-09-10' });
  const vals = {
    oil: v(8), bei: v(12),             // holding (+,+ with sign +1)
    us10y: v(20), real: v(15),         // holding
    dxy: v(-1.5),                      // real up, dxy down -> real-dxy BROKEN
    gold: v(6),                        // real up, gold up -> real-gold BROKEN; dxy down, gold up -> holding
    audusd: v(2), copper: v(4),        // dxy down, aud up -> holding; copper up, aud up -> holding
    usdcad: v(-2),                     // oil up, usdcad down -> holding
    vix: v(1), usdjpy: v(-3), hy: v(2),// vix quiet -> vix links quiet
    btc: v(9),                         // dxy down, btc up -> holding
  };
  const out = evaluateChain(vals);
  const by = Object.fromEntries(out.map(l => [l.id, l]));
  ok('returns every link in chain order', out.length === CHAIN_LINKS.length && out[0].id === CHAIN_LINKS[0].id);
  ok('oil→bei holding', by['oil-bei'].verdict === 'holding' && by['oil-bei'].read === CHAIN_LINKS[0].holds);
  ok('real→dxy broken, mechanism for the FROM direction (up)', by['real-dxy'].verdict === 'broken' && /risk-premium/.test(by['real-dxy'].read));
  ok('real→gold broken with the credibility sentence', by['real-gold'].verdict === 'broken' && /no counterparty/.test(by['real-gold'].read));
  ok('dxy→gold holding (opposite signs, sign −1)', by['dxy-gold'].verdict === 'holding');
  ok('vix links quiet when VIX is inside its floor', by['vix-usdjpy'].verdict === 'quiet' && by['vix-hy'].verdict === 'quiet' && /Fear gauge/.test(by['vix-usdjpy'].read));
  ok('quiet read names the still end', /has not moved/.test(by['vix-usdjpy'].read));
  ok('ends carry formatted text and asOf', by['oil-bei'].a.text === '+8.0%' && by['oil-bei'].b.text === '+12bp' && by['oil-bei'].a.asOf === '2026-09-10');
  ok('floor text is ± the floor', by['oil-bei'].a.floorText === '±3.0%');
  ok('expected direction of the TO end follows the sign', by['oil-bei'].expected === 'up' && by['real-gold'].expected === 'down' && by['dxy-gold'].expected === 'up');
  ok('punch line matches the verdict and direction', by['real-dxy'].punch === CHAIN_LINKS.find(l => l.id === 'real-dxy').punch.up && by['oil-bei'].punch === CHAIN_LINKS[0].punch.holds);
  ok('quiet punch names the still end and its floor', /Fear gauge \(VIX\) inside its floor \(±3\.0\)/.test(by['vix-hy'].punch), by['vix-hy'].punch);

  const partial = evaluateChain({ oil: v(8) });
  ok('missing series -> unmeasured, never a verdict', partial.every(l => l.verdict === 'unmeasured') && partial[0].b.delta === null);

  const downCase = evaluateChain({ ...vals, oil: v(-6), bei: v(9) });
  ok('broken uses the FROM node\'s direction to pick the sentence', downCase[0].verdict === 'broken' && downCase[0].read === CHAIN_LINKS[0].broken.down);

  const gap = evaluateChain({ ...vals, dxy: { delta: -1.5, last: 1, asOf: '2026-09-04' } });
  ok('date gap between the ends is measured', gap.find(l => l.id === 'real-dxy').dateGapDays === 6 && gap.find(l => l.id === 'oil-bei').dateGapDays === 0);
  ok('no asOf -> gap null', evaluateChain({ oil: { delta: 8 }, bei: { delta: 12 } })[0].dateGapDays === null);
  const curve = evaluateChain({ ...vals, us2y: v(32), us30y: v(10) });
  ok('front end and long end both up -> holding', curve.find(l => l.id === 'us2y-us30y').verdict === 'holding');
  const flat = evaluateChain({ ...vals, us2y: v(32), us30y: v(-12) });
  ok('2y up, 30y down -> broken, the policy-mistake sentence', flat.find(l => l.id === 'us2y-us30y').verdict === 'broken' && /policy mistake/.test(flat.find(l => l.id === 'us2y-us30y').read));
  const steep = evaluateChain({ ...vals, us2y: v(-20), us30y: v(15) });
  ok('2y down, 30y up -> broken, the credibility sentence', steep.find(l => l.id === 'us2y-us30y').verdict === 'broken' && /rates-crisis/.test(steep.find(l => l.id === 'us2y-us30y').read) && /credibility/.test(steep.find(l => l.id === 'us2y-us30y').punch));
  ok('long end inside its floor -> quiet', evaluateChain({ ...vals, us2y: v(32), us30y: v(3) }).find(l => l.id === 'us2y-us30y').verdict === 'quiet');
  const exact = evaluateChain({ ...vals, vix: v(3), hy: v(20) });
  ok('a move exactly at the floor counts as moved', exact.find(l => l.id === 'vix-hy').verdict !== 'quiet');
}

console.log('[summariseChain]');
{
  const v = (delta) => ({ delta, last: 1 });
  const all = evaluateChain({ oil: v(8), bei: v(12), us10y: v(20), real: v(15), dxy: v(-1.5), gold: v(6), audusd: v(2), copper: v(4), usdcad: v(-2), vix: v(1), usdjpy: v(-3), hy: v(2), btc: v(9) });
  const s = summariseChain(all);
  ok('counts add up to the link count', s.holding + s.broken + s.quiet + s.unmeasured === CHAIN_LINKS.length);
  ok('broken ids listed', s.brokenIds.includes('real-dxy') && s.brokenIds.includes('real-gold'));
  ok('headline leads with the broken count and names the links', /^2 of \d+ testable links broken: real yields → dollar, real yields → gold./.test(s.headline), s.headline);
  const none = summariseChain(evaluateChain({}));
  ok('nothing measured -> says so', none.judged === 0 && /Nothing measured/.test(none.headline));
  const quiet = summariseChain(evaluateChain(Object.fromEntries(Object.keys(CHAIN_NODES).map(k => [k, v(0)]))));
  ok('all quiet -> textbook not being tested', quiet.judged === 0 && /not being tested/.test(quiet.headline));
  const clean = summariseChain(evaluateChain({ oil: v(8), bei: v(12) }));
  ok('one holding, nothing broken -> textbook working', clean.holding === 1 && clean.broken === 0 && /holding/.test(clean.headline));
}

console.log('[chainForPrompt]');
{
  const v = (delta) => ({ delta, last: 1 });
  const txt = chainForPrompt(evaluateChain({ oil: v(8), bei: v(12), us10y: v(20), real: v(15), dxy: v(-1.5), vix: v(1), hy: v(2) }));
  ok('one line per measured link, unmeasured omitted', txt.split('\n').length === 5, txt);
  ok('broken lines carry the mechanism', /BROKEN \(.*\) — .*risk-premium/.test(txt));
  const gapTxt = chainForPrompt(evaluateChain({ real: { delta: 15, asOf: '2026-09-10' }, dxy: { delta: -1.5, asOf: '2026-09-04' } }));
  ok('a wide date gap between the ends is stated in the prompt line', /ends printed 6 days apart: 2026-09-10 vs 2026-09-04/.test(gapTxt), gapTxt);
  ok('quiet lines are labelled and carry both ends', /QUIET \(Fear gauge \(VIX\) \+1\.0 → Credit spreads \(HY\) \+2bp\)/.test(txt));
  ok('empty chain -> empty string', chainForPrompt(evaluateChain({})) === '');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
