/**
 * stateLayers — payload fixtures shaped like the server's own (see the endpoint reference in
 * plans/MARKET_STATE_ENGINE_PLAN.md), no network.
 * Run: node --test js/stateLayers.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summariseGlobal, summariseEconomies, summariseLayers, activeEdges, EDGE_RULES, ECONOMIES } from './stateLayers.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
import { EVIDENCE_AUDIT } from './evidenceAudit.js';

const GR = { ok: true, envLabel: 'dollar-led · normal volatility', headline: 'h', conviction: { range: 34, direction: 0 },
  axes: { usd: { score: 0.46, agree: '2/2', inputs: [{ text: 'broad dollar +1.3% over 20d' }] } }, meta: { asOf: '2026-10-31T09:15:02Z' } };
const RF = { ok: true, level: 'CAUTION', active: 2, available: 5, computed_at: '2026-10-31T09:00:00Z',
  flags: [{ key: 'vix_term', label: 'VIX curve backwardated', on: true, value: 1.02, detail: 'd' }], move: { level: 95.8, pct1y: 41, chg20: 6.4, asOf: '2026-10-30' } };
const REG = { ok: true, now: { key: 'realUp|creditTighter|curveNormal', describe: 'real yields rising', date: '2026-10-30' },
  policy: { policyRate: 4.33, twoYear: 3.92, gapBp: -41, movesPriced: -1.6, direction: 'cuts', twoYearAsOf: '2026-10-30' } };
const STRESS = { sessionDate: '2026-11-02', inputs: { spx5: -0.8, vixTerm: 1.03 }, conditions: { fxCount: 4, idxCount: 2, missing: [] }, monthEnd: true, factor: { fx: 1.15, idx: 1.06 } };

test('global banner keeps every axis with its date, and nulls what is missing', () => {
  const g = summariseGlobal({ globalRead: GR, riskFlags: RF, regime: REG, funding: { ok: false }, creditQuality: { ok: true, quality: 0.84, latestDate: '2026-10-30' } });
  assert.equal(g.envLabel, GR.envLabel);
  assert.equal(g.axes.usd.score, 0.46);
  assert.equal(g.regime.key, REG.now.key);
  assert.equal(g.policy.direction, 'cuts');
  assert.equal(g.risk.level, 'CAUTION');
  assert.equal(g.funding, null);
  assert.equal(g.creditQuality.z, 0.84);
  assert.equal(summariseGlobal({}).risk, null);
});

test('economies: one row per currency; USD carries nowcast and the Fed path', () => {
  const e = summariseEconomies({
    surprise: { generatedAt: 'x', byCcy: { USD: { score: 0.42, nRecent: 14, top: [{ event: 'NFP', z: 1.8, actual: '254K', estimate: '140K' }] }, EUR: { score: null } } },
    nowcast: { ok: true, at: 1761894000000, cleveland: { month: '2026-10', asOf: '2026-10-30', cpi: 0.312, core: 0.284 }, gdpnow: { quarter: '2026-10-01', value: 2.31 } },
    fedPath: { ok: true, asOf: '2026-10-30', ageDays: 1, currentRange: '4.25-4.50', windows: [{ ref: '2026-12-17', cut: 61.2, hike: 3.1, mean: 4.12 }], zq: { meetings: [{ meeting: '2026-12-09', moveBp: -16, direction: 'cut' }] } },
    fredHist: { us10y: [{ date: '2026-09-30', value: 4.0 }, { date: '2026-10-30', value: 4.2 }] },
    intlYields: { de10y: [{ date: '2026-09-29', value: 2.5 }, { date: '2026-10-30', value: 2.6 }] },
    cot: { reportDate: '2026-10-27', instruments: { USDJPY: { label: 'Crowded, trend still running', zone: 'with', state: 'A', pct: 7 } } },
  });
  assert.equal(e.rows.length, ECONOMIES.length);
  const usd = e.rows[0], eur = e.rows[1], jpy = e.rows.find(r => r.ccy === 'JPY');
  assert.equal(usd.surprise.score, 0.42);
  assert.equal(usd.nowcast.gdpNow, 2.31);
  assert.equal(usd.policyPath.nextWindow.cutPct, 61.2);
  assert.equal(usd.yield10.changeBp, 20);
  assert.equal(eur.surprise.score, null);
  assert.equal(eur.yield10.changeBp, 10);
  assert.equal(jpy.cot.state, 'A');
  assert.match(e.note, /not a lean/);
});

test('layers: vol sorted by vol percentile; COT by how stretched; OI regimes kept', () => {
  const l = summariseLayers({
    volForecast: { session_date: '2026-11-02', computed_at: 'c', instruments: { EURUSD: { vol_annual: 7, vol_pct: 34, ladder_flat: { hl_p50: 0.45, hl_p75: 0.58 } }, GOLD: { vol_annual: 18, vol_pct: 81, hl_median: 1.1, hl_75: 1.4 } } },
    cot: { reportDate: '2026-10-27', instruments: { EURUSD: { pct: 55 }, USDJPY: { pct: 7 } } },
    oi: { at: 'a', pairs: [{ pair: 'EUR/USD', spot: 1.08, regime: 'PIN', callWall: 1.09, putWall: 1.075 }] },
  });
  assert.deepEqual(l.vol.rows.map(r => r.sym), ['GOLD', 'EURUSD']);
  assert.equal(l.vol.rows[0].hlP75, 1.4);
  assert.deepEqual(l.positioning.rows.map(r => r.sym), ['USDJPY', 'EURUSD']);
  assert.equal(l.options.rows[0].regime, 'PIN');
});

test('edges: every rule cites a real Evidence Book entry that the audit graded', () => {
  for (const r of EDGE_RULES) {
    assert.ok(DESK_EVIDENCE.find(e => e.id === r.id), `${r.id} not in the Evidence Book`);
    assert.ok(EVIDENCE_AUDIT[r.id], `${r.id} not audited`);
  }
});

test('edges: evaluated from the stress shadow; fragile ones are research only; missing inputs say so', () => {
  const e = Object.fromEntries(activeEdges({ stress: STRESS, nq5: -1.6, oi: { pairs: [{ pair: 'NAS100', regime: 'BREAKOUT' }] } }).map(x => [x.id, x]));
  assert.equal(e['forecast-miss-shock-fx'].active, true);
  assert.equal(e['forecast-miss-shock-fx'].standing, 'edge');
  assert.equal(e['forecast-miss-month-end-fx'].active, true);
  assert.equal(e['vix-inversion'].active, true);
  assert.equal(e['nq-down-week'].active, true);
  assert.equal(e['nq-down-week'].standing, 'research only');      // FRAGILE in the audit
  assert.equal(e['gex-range-es'].active, true);
  const none = Object.fromEntries(activeEdges({}).map(x => [x.id, x]));
  assert.equal(none['forecast-miss-shock-fx'].active, null);
  assert.equal(none['forecast-miss-shock-fx'].why, 'input not loaded');
});
