// Tests for js/newsletterExplain.js.   node js/newsletterExplain.test.mjs
import { evaluateChain, CHAIN_NODES, CHAIN_LINKS } from './macroChain.js';
import { buildTheories, uncoveredBreaks } from './macroTheories.js';
import { storyIntro, yieldGuide, chainCounts, chainGuide, relationNote, stressRead, auditGuide, sectorNote, commodityNote, fearNote, currencyNote } from './newsletterExplain.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const f = k => CHAIN_NODES[k].floor, mv = (k, m, asOf = '2026-10-23') => ({ delta: f(k) * m, last: 1, asOf });
const links = evaluateChain({ dxy: mv('dxy', 3, '2026-10-16'), nq: mv('nq', -3), spx: mv('spx', -3), vix: mv('vix', 3), hy: mv('hy', 3), gold: mv('gold', -3), real: mv('real', -3), us10y: mv('us10y', -3), bei: mv('bei', 1), audusd: mv('audusd', 1.2) });
const ys = { dNom: -32, dReal: -28, dBei: -4 };
const dollarCheck = { id: 'dollar', facts: { asOf: '2026-10-16', days: 7, stronger: 1, n: 7, avg: -0.87 } };

console.log('the opening');
{ const iv = storyIntro({ ys, links, checks: [dollarCheck], gdpnow: 3.5 });
  ok('what happened states the yield move and the real share from the figure', /fell 32bp/.test(iv.fact[0]) && /About 88%/.test(iv.fact[0]));
  ok('the contradiction is stated only when the data shows it: real yields fell yet the Nasdaq and gold fell', /This time the Nasdaq fell [\d.]+% and gold fell [\d.]+%/.test(iv.fact.join(' ')));
  ok('the interpretation is one reading of four, not a conclusion', /growth scare/.test(iv.why.join(' ')) && /one of four explanations/.test(iv.why.join(' ')) && /cannot yet choose between them/.test(iv.why.join(' ')));
  ok('the dollar is reported as the daily pairs show it, and the stale index is named, before any conclusion about safety', /On daily prices the dollar fell 0\.9% on average against 7 majors/.test(iv.unsure[0]) && /only 1 of 7/.test(iv.unsure[0]) && /16 Oct/.test(iv.unsure[0]) && /not supported by the daily prices/.test(iv.unsure[0]));
  ok('a strong growth nowcast is named as the fact that does not fit a growth scare', iv.unsure.some(t => /3\.5%/.test(t) && /does not fit/.test(t)));
  const none = storyIntro({ ys, links: [], checks: [], gdpnow: null });
  ok('with no contradiction in the data the opening does not invent one', !/This time/.test(none.fact.join(' '))); }

console.log('the yield guide');
{ const g = yieldGuide({ ...ys, later: null }, links);
  ok('it explains the metric, why real yields matter, and which part dominates', /real yield/.test(g.looking) && /gold and growth shares/.test(g.matters) && /88% of the fall is the real yield/.test(g.tells));
  const inf = yieldGuide({ dNom: 20, dReal: 2, dBei: 18 }, links);
  ok('when expected inflation leads it says the market is changing its view of prices', /expected inflation/.test(inf.tells) && !/growth or interest-rate/.test(inf.tells)); }

console.log('the chain counts');
{ const c = chainCounts(links, ['dxy']);
  ok('defined splits into measurable plus unmeasured, and measurable into quiet plus judged', c.defined === CHAIN_LINKS.length && c.measurable + c.unmeasured === c.defined && c.quiet + c.judged === c.measurable && c.holding + c.broken === c.judged);
  ok('links that use a series that stops early are counted and the broken ones named', c.timing >= 1 && c.timingBroken.every(l => l.a.key === 'dxy' || l.b.key === 'dxy'));
  const g = chainGuide(links, ['dxy']);
  ok('the guide reconciles the numbers in words and flags the timing issue as uncertainty', new RegExp(`${c.defined} links are defined`).test(g.counts) && /different windows/.test(g.unsure)); }

console.log('a broken relationship');
{ const l = links.find(x => x.id === 'real-dxy'), def = CHAIN_LINKS.find(x => x.id === 'real-dxy');
  const clean = relationNote(l, def, []), timing = relationNote(l, def, [{ key: 'dxy', label: 'Dollar (broad index)', asOf: '2026-10-16', days: 7 }]);
  ok('a clean break says what is normal, what was observed and has no caveat', clean.status === 'diverging' && /should move/.test(clean.normal) && /-?\d/.test(clean.observed) && clean.caveat === '');
  ok('a break on a lagging series is marked timing and says the two lines cover different windows', timing.status === 'timing' && /different windows/.test(timing.caveat) && /7 days/.test(timing.caveat)); }

console.log('the stress read');
{ const rf = { active: 0, total: 6, flags: [{ label: 'VIX elevated', on: false, value: 19, detail: 'VIX 19.0 (flag ≥25)' }, { label: 'VIX curve backwardated', on: false, value: 0.946, detail: 'VIX/VIX3M 0.95 (flag ≥1.00 — near-term fear)' }, { label: 'FX implied vol stressed', on: null, value: null, detail: 'no percentile wired' }] };
  const w = [{ label: 'Chain link broken: a' }, { label: 'Chain link broken: b' }, { label: 'Setup watch · x' }, { label: 'Cross-border dollar credit growing fast (BIS)' }];
  const s = stressRead(rf, w, links);
  ok('no broad warning with several watched conditions reads as isolated signs, not a stress event', s.verdict === 'Isolated warning signs, no broad stress event' && s.watched === 4);
  ok('the watched conditions are split into broken relationships, setup watches and background', /two are broken market relationships/.test(s.split) && /one is a setup watch/.test(s.split) && /one is background context/.test(s.split));
  ok('the one closest to its trigger is named with how close it is', /VIX curve backwardated/.test(s.closest) && /95%/.test(s.closest));
  ok('a warning that cannot be measured is counted out of the dial and said so', s.measured === 2 && /Cannot|cannot/.test(s.na) && /^One of the 3|^One of/.test(s.na));
  const on = stressRead({ ...rf, active: 2 }, w, links);
  ok('two broad warnings on is not called isolated', /Broad stress is building/.test(on.verdict)); }

console.log('the explanations');
{ const th = buildTheories(links);
  ok('every explanation carries plain terms, what else looks the same, and what would separate it', th.length === 4 && th.every(t => t.plain && t.alsoFits && t.separate && Array.isArray(t.covers)));
  const un = uncoveredBreaks(links, th);
  ok('a broken link none of the stories speaks to is reported as unexplained', un.some(l => l.id === 'dxy-audusd') && !un.some(l => l.id === 'real-nq')); }

console.log('the audit and the desk notes');
{ const a = auditGuide({ score: { median: 0.88, pastShare: 43, rows: new Array(14).fill({}) } });
  ok('a median under 0.9 reads as ranges a little too wide, and the sample is called too small', /a little too wide/.test(a.tells) && /too few/.test(a.unsure) && /coin flip/.test(a.direction));
  const b = auditGuide({ score: { median: 1.3, pastShare: 70, rows: [] } });
  ok('a median over 1.1 reads as too narrow', /a little too narrow/.test(b.tells));
  const sn = sectorNote([{ label: 'Energy', d20: 10 }, { label: 'Utilities', d20: 5 }, { label: 'Technology', d20: -8 }, { label: 'Semiconductors', d20: -16 }], [{ label: 'A', d20: -5 }, { label: 'B', d20: -3 }, { label: 'C', d20: 2 }], { nq: { delta: -5.9 }, spx: { delta: -1.2 } });
  ok('sectors: leaders and laggards named, the growth-scare fit stated without claiming it separates the stories, the Nasdaq gap quoted', /Energy \+10\.0%/.test(sn.look) && /Semiconductors −16\.0%/.test(sn.look) && /does not separate them/.test(sn.tells) && /−5\.9%/.test(sn.tells) && /Two of the three/.test(sn.tells));
  const cn = commodityNote([{ name: 'WTI oil', d20: 12.5 }, { name: 'Copper', d20: -9 }, { name: 'Gold', d20: -3.5 }]);
  ok('oil up while copper falls is flagged as something a growth scare does not explain', cn.split === true && /does not explain/.test(cn.tells));
  const fn = fearNote([{ label: 'VIX 9-day', v: 18.7 }, { label: 'VIX 3-month', v: 20.5 }, { label: 'VIX 6-month', v: 22 }], [{ label: 'Investment-grade', d20: 4 }, { label: 'High-yield', d20: 30 }, { label: 'CCC', d20: 138 }], { active: 0 });
  ok('a rising VIX curve is the calm shape and credit widening most at the riskiest end is named', /calm shape/.test(fn.look) && /riskiest/.test(fn.look) && /not a panic/.test(fn.tells));
  const cu = currencyNote([{ ccy: 'NZD', score: 0.3 }, { ccy: 'AUD', score: 0.2 }, { ccy: 'USD', score: 0.05 }, { ccy: 'CAD', score: 0 }, { ccy: 'EUR', score: -0.1 }, { ccy: 'CHF', score: -0.5 }], [{ regime: 'Hawkish' }, { regime: 'Hawkish' }, { regime: 'Neutral' }]);
  ok('the dollar mid-table is read as not a rush into dollars, and central-bank language is set against falling yields', /does not look like a rush into dollars/.test(cu.tells) && /Two of three central-bank statements read hawkish/.test(cu.tells)); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
