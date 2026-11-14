// node js/terminal/paperBoardsView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../paperBoardsCore.js';
import * as V from './paperBoardsView.js';
import { zonedEpoch } from '../yieldLegs.js';

const lcg = seed => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = r => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const day = i => new Date(Date.UTC(2020, 10, 16) + i * 864e5).toISOString().slice(0, 10);
const r = lcg(11);
const walk = (n, start, vol, kind = 'ret') => { let v = start; return Array.from({ length: n }, (_, i) => { v = kind === 'diff' ? v + gauss(r) * vol : v * Math.exp(gauss(r) * vol); return { date: day(i), value: v }; }); };

// ── fixtures through the real cores ──
const S = { eurusd: walk(900, 1.1, 0.005), usdjpy: walk(900, 140, 0.006), audusd: walk(900, 0.66, 0.006), usdcad: walk(900, 1.3, 0.004), nzdusd: walk(900, 0.6, 0.006), gold: walk(900, 1900, 0.009), oil: walk(900, 70, 0.02), copper: walk(900, 4, 0.012), spx: walk(900, 4000, 0.01), us10y: walk(900, 4, 0.05, 'diff'), vix: walk(900, 18, 0.04), hy: walk(900, 3.5, 0.06, 'diff'), btc: walk(900, 30000, 0.03), skew: walk(900, 140, 0.01), bei5y5y: walk(900, 2.2, 0.002), corePce: Array.from({ length: 80 }, (_, i) => ({ date: day(i * 30), value: 100 * Math.pow(1.03, i / 12) })) };
const connected = C.connectedness({ EURUSD: { kind: 'ret', pts: S.eurusd }, USDJPY: { kind: 'ret', pts: S.usdjpy }, AUDUSD: { kind: 'ret', pts: S.audusd }, USDCAD: { kind: 'ret', pts: S.usdcad }, GOLD: { kind: 'ret', pts: S.gold }, OIL: { kind: 'ret', pts: S.oil }, COPPER: { kind: 'ret', pts: S.copper }, SPX: { kind: 'ret', pts: S.spx }, US10Y: { kind: 'diff', pts: S.us10y }, VIX: { kind: 'ret', pts: S.vix }, HY: { kind: 'diff', pts: S.hy }, BTC: { kind: 'ret', pts: S.btc } });
const coupling = C.couplingRing([{ ccy: 'AUD', fx: S.audusd, com: S.copper, comLabel: 'copper', sign: 1 }, { ccy: 'CAD', fx: S.usdcad, com: S.oil, comLabel: 'oil', sign: -1 }]);
const bars = Array.from({ length: 300 }, (_, i) => ({ date: day(i), open: 100, high: 101.2, low: 99.4, close: 100.3 }));
const deps = { volSigmaSeries: b => b.map(() => 0.008), computeBands: (o, s) => ({ hl50: o * s * 1.4, hl75: o * s * 2.1 }) };
const hits = { EURUSD: C.dailyHits(bars, 'fx', deps), GOLD: C.dailyHits(bars, 'commodity', deps) };
const st = C.stressDates(S.vix, 0.8), coverage = { ...C.coverageByState(hits, st.set), stressRule: `VIX at or above ${st.threshold}`, asOf: day(299) };
const unc = C.policyUncertainty([{ id: 'USEPUINDXD', label: 'US economic policy uncertainty (daily news index)', freq: 'daily', pts: walk(1500, 120, 0.02).map(p => ({ ...p })) }, { id: 'EPUTRADE', label: 'Trade-policy uncertainty (EPU category, monthly)', freq: 'monthly', pts: walk(80, 400, 0.05).map((p, i) => ({ date: day(i * 30), value: p.value })) }]);
const MX = { ok: true, connected, coupling, coverage, uncertainty: unc, stress: { overall: 'watch' }, gpr: { level: 184.7, z: 0.56, trend: 'rising', asOf: '2026-11-02' }, skew: C.skewHistory(S.skew.map((p, i) => ({ date: day(i + 700), value: p.value }))), trend: C.trendBasket({ params: {}, last: day(899), splitDate: day(600), oos: { sharpe: 0.08, cagr: 1.4, maxDD: -34.8, days: 1868 }, all: { sharpe: 0.1, days: 6226 }, benchmark: { sharpe: -0.11, days: 6226 }, current: [{ ccy: 'AUD', trend: 1 }, { ccy: 'EUR', trend: -1 }], ccys: ['AUD', 'EUR'], equity: Array.from({ length: 900 }, (_, i) => ({ t: day(i), v: 1 + i / 900 })) }),
  walls: C.oiWallDistance({ 'EUR/USD': { futures: 1.1037, spot: 1.1022, expectedMove: { daily: 0.0028 }, callWalls: [{ strike: 1.111 }], putWalls: [{ strike: 1.096 }], callWall: 1.111, putWall: 1.096, gammaFlip: 1.1158, oiAsOf: '2026-11-13' }, NAS100_USD: { futures: 26000, expectedMove: { daily: 260 }, callWalls: [{ strike: 26500 }], putWalls: [{ strike: 25400 }], callWall: 26500, putWall: 25400 } }), errors: {} };
const jgbRows = Array.from({ length: 400 }, (_, i) => ({ date: day(i), '2Y': 1 + i * 0.001 + 0.01 * gauss(r), '10Y': 2 + i * 0.001, '20Y': 3, '30Y': 3.3, '40Y': 3.4 }));
const RX = { ok: true, jgb: { shock: C.jgbShock(jgbRows), fileTenors: ['1Y', '2Y', '10Y', '20Y', '30Y', '40Y'], asOf: day(399) }, inflation: C.inflationBoard({ bei5y5y: S.bei5y5y, corePce: S.corePce }),
  fiscal: [{ id: 'gb-budget-2025-11-26', country: 'GB', kind: 'budget', title: 'Budget 2025', date: '2025-11-26', status: 'read', headline: 'A budget that borrows more up front', rows: [{ label: 'Headroom', value: '£22bn', change: '+£12bn vs March' }] }],
  upcoming: [{ date: '2026-11-18', type: 'Note', term: '10-Year', amountB: 42, reopening: false }],
  auctionResults: C.auctionResults([{ auctionDate: '2026-11-10T00:00:00', securityType: 'Note', securityTerm: '10-Year', highYield: '5.020', bidToCoverRatio: '2.46', offeringAmount: '42000000000', subtotalCompetitiveParAwardedInsideOfOfferingAmount: '41757418700', indirectBiddersCompetitiveParAwarded: '25566955000', directBiddersCompetitiveParAwarded: '12109950200' }]), errors: {} };
const PX = { ok: true, fomc: { ok: true, ...C.fomcEventTimes([{ date: '2026-12-09', sep: true }, { date: '2027-01-27', sep: false }], Date.UTC(2026, 10, 14), zonedEpoch), rangeShare: { available: false }, note: 'A schedule.' }, pathDiff: C.pathDifferential({ asOf: '2026-11-04', ageH: 250, banks: { USD: { m3: { bp: 14, weekBp: 0 }, m6: { bp: 30, weekBp: 1 }, m12: { bp: 43, weekBp: -2 } }, EUR: { m3: { bp: 16, weekBp: 0 }, m6: { bp: 30, weekBp: -3 }, m12: { bp: 50, weekBp: -11 } }, JPY: { m3: { bp: 22, weekBp: 0 }, m6: { bp: 40, weekBp: 0 }, m12: { bp: 70, weekBp: 0 } } } }), errors: {} };
const E = { 'policy-extra': PX, 'rates-extra': RX, 'markets-extra': MX };
const ALL = Object.values(V.BOARD_FEED).flatMap(b => Object.keys(b));

test('every board draws from its fixture, names itself, and never throws', () => {
  for (const id of ALL) { const h = V.boardById(id, E); assert.ok(h.length > 400, `${id} drew almost nothing`); assert.match(h, /<h2>/); }
  assert.equal(ALL.length, 12);
});
test('a board draws nothing until its feed has landed (never a spinner) and tells the truth when a feed is empty', () => {
  for (const id of ALL) assert.equal(V.boardById(id, {}), '');
  assert.match(V.boardById('panel.macro.jgb', { 'rates-extra': { errors: { jgb: 'jgb-curve unavailable' } } }), /jgb-curve unavailable/);
  assert.match(V.boardById('panel.macro.rangecoverage', { 'markets-extra': { errors: { coverage: 'OANDA_KEY not configured' } } }), /OANDA_KEY not configured/);
});
test('every board is in exactly one feed, and the surface ids are the ones the registry and sections know', async () => {
  const { MACRO_SUBS } = await import('./macroSubtabs.js'), blocks = MACRO_SUBS.flatMap(s => s.blocks);
  for (const id of ALL) assert.ok(blocks.includes(id), `${id} is not in a Macro section`);
  assert.equal(new Set(ALL).size, ALL.length);
  assert.equal(V.feedOf('panel.macro.walls'), 'markets-extra'); assert.equal(V.feedOf('panel.macro.nope'), null);
});
test('wording: the Evidence Book verdicts sit beside the boards that touch them, and no board turns a description into a direction', () => {
  assert.match(V.boardById('panel.macro.trendbasket', E), /NULL/);                       // trend following on FX: null
  assert.match(V.boardById('panel.macro.skewhist', E), /NULL/);                          // skew-fade: null
  assert.match(V.boardById('panel.macro.walls', E), /NULL/);                             // wall-placebo: null
  assert.match(V.boardById('panel.macro.pathdiff', E), /NULL|UNDERPOWERED/);
  assert.match(V.boardById('panel.macro.connected', E), /UNTESTED/); assert.match(V.boardById('panel.macro.jgb', E), /UNTESTED/);
  const text = ALL.map(id => V.boardById(id, E)).join(' ').replace(/<[^>]+>/g, ' ');
  for (const bad of [/\bbuy\b/i, /\bsell\b(?! signal)/i, /go long/i, /go short/i, /\bstop\b.*\btarget\b/i, /entry\b/i, /will (rise|fall|rally|drop)/i]) assert.ok(!bad.test(text.replace(/dear is not a sell[^.]*\./gi, '')), `a board uses trade wording: ${bad}`);
});
test('the FOMC board shows no range-share number until a verdict flag is set', () => {
  assert.doesNotMatch(V.boardById('panel.macro.fomcstrip', E), /Share of the day's range in each window: statement/);
  const on = structuredClone(E); on['policy-extra'].fomc.rangeShare = { available: true, statement: 31, press: 22, verdict: 'underpowered' };
  assert.match(V.boardById('panel.macro.fomcstrip', on), /statement 31%, press conference 22%/);
});
test('the auction board says why there is no tail, and a stale laptop pull is flagged', () => {
  assert.match(V.boardById('panel.macro.fiscalauct', E), /when-issued/); assert.match(V.boardById('panel.macro.pathdiff', E), /days old/);
});
test('tokens only: no hard-coded colour in the view (the theme guard covers the rest)', () => {
  const src = fs.readFileSync(new URL('./paperBoardsView.js', import.meta.url), 'utf8');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(src.replace(/&#\d+;|&#x[0-9a-f]+;/gi, '')), 'hex colour in paperBoardsView.js');
  assert.ok(!/\brgba?\(/.test(src), 'rgb() colour in paperBoardsView.js');
});
test('escaping: a hostile string in a feed cannot inject markup', () => {
  const bad = structuredClone(E); bad['rates-extra'].fiscal[0].title = '<img src=x onerror=alert(1)>'; bad['rates-extra'].fiscal[0].headline = '<script>x</script>';
  const h = V.boardById('panel.macro.fiscalauct', bad); assert.ok(!h.includes('<img') && !h.includes('<script'));
});
