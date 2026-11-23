// The owner-only Bias Engine V2 panel (js/terminal/biasEngineV2View.js).   node --test js/terminal/biasEngineV2View.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from './biasEngineV2View.js';
import { surfaceById } from './tabRegistry.js';
import { timeline } from '../biasIntraday.js';

const P = { ok: true, date: '2026-11-20', phase: 'trial', spec: '1.1', configHash: 'abcdef1234567890', dataIdentity: { labelAgreement: 1 }, riskGate: { pass: false, note: 'gate failed' },
  riskFactor: { score: 0.42, usedInScore: false }, record: { note: 'technical trial: no official record yet' },
  markets: [
    { market: 'EURUSD', v1: { dir: 'BEARISH', score: -0.7, strength: 4 }, v1r: { dir: 'BEARISH', score: -0.7, strength: 4 }, v2: { dir: 'NEUTRAL', score: -0.2, strength: 1, dataQuality: 0.84, agreement: 0.6, support: { for: ['monetary'], against: ['price'], families: 5 } },
      attribution: { F1: { alone: -0.7, without: -0.2 }, F2: { alone: -0.5, without: -0.3 }, F3: { alone: -0.6, without: -0.2 }, F4: { alone: -0.7, without: -0.2 }, F5: { alone: -0.4, without: -0.5 } },
      drivers: [{ key: 'carry', family: 'monetary', d: -1.5, contrib: -0.3, f: 1, reading: 'EUR 2.50% vs USD 4.00%' }, { key: 'repricing', family: 'monetary', d: 0.2, contrib: 0.05, f: 1, components: { level: -0.02, change: 0.07 } },
        { key: 'trend', leg: 'EUR', family: 'price', d: 1, contrib: 0.05, f: 1 }],
      missing: [{ key: 'data', leg: 'EUR', why: 'stale' }], pairFeatures: { carryGapPp: -1.5, expectedGapBp: -12, expectedChgBp: 6, y2GapPp: -1.7 } },
    { market: 'GOLD', v1: { dir: 'BEARISH', score: -0.8, strength: 4 }, v1r: { dir: 'BEARISH', score: -0.8, strength: 4 }, v2: { dir: 'BEARISH', score: -0.9, strength: 5, dataQuality: 0.9, agreement: 0.8, support: { for: ['monetary', 'cross-market'], against: [], families: 4 } }, drivers: [] },
  ] };

test('the panel is an owner-only internal surface and states that it is a shadow, uncalibrated', () => {
  assert.equal(surfaceById('panel.macro.bev2')?.hidden, 'internal');
  const h = V.headHtml(P);
  assert.match(h, /technical trial/); assert.match(h, /risk gate failed \(F4 off\)/); assert.match(h, /V1 replay agrees 100%/); assert.match(h, /uncalibrated/);
  assert.match(V.headHtml({ empty: true, note: 'no V2 record yet' }), /no V2 record yet/);
});

test('rows show V1, the replay and V2 side by side; a differing direction is marked; the filter keeps only those', () => {
  const t = V.tableHtml(P);
  assert.match(t, /EURUSD <span class="chip gold"[^>]*>differs/); assert.doesNotMatch(t, /GOLD <span class="chip gold"/);
  const d = V.tableHtml(P, { only: 'differ' });
  assert.match(d, /EURUSD/); assert.doesNotMatch(d, /data-m="GOLD"/);
  assert.match(t, /chip up">monetary/); assert.match(t, /chip dn">price/);
});

test('an opened row lists every driver contribution with its family, the repricing components, the pair features and the switch attribution', () => {
  const t = V.tableHtml(P, { open: 'EURUSD' }), x = V.driversHtml(P.markets[0]);
  assert.match(t, /bev2-open/);
  assert.match(x, /carry<\/th><td class="muted">monetary/); assert.match(x, /level −0\.020, change \+0\.070/); assert.match(x, /carry gap −1\.50pp/); assert.match(x, /2y gap −1\.70pp \(context\)/);
  assert.match(x, /F5 expected repricing \(6 m\)/); assert.match(x, /Missing: EUR data \(stale\)/);
  assert.doesNotMatch(V.CSS, /#[0-9a-fA-F]{3,6}\b|rgb\(\d/, 'theme tokens only');
});

test('intradayHtml: loading, empty day, and the shift marked with its slot time', () => {
  assert.match(V.intradayHtml(null), /Loading the day/);
  assert.match(V.intradayHtml({ ok: true, date: '2026-11-24', points: [], markets: [] }), /Nothing stored for 2026-11-24/);
  const day = { issue: { v2: { EURUSD: ['NEUTRAL', -0.4, 0], GBPUSD: ['BULLISH', 0.7, 4] }, v1r: {} },
    slots: { '09:00': { v2: { EURUSD: ['BEARISH', -0.55, 3], GBPUSD: ['BULLISH', 0.7, 4] }, v1r: {} } } };
  const T = { ok: true, date: '2026-11-24', issueAt: '2026-11-24T05:41:00Z', slotTimes: { '09:00': '2026-11-24T09:03:00Z' }, ...timeline(day), schedule: null };
  const h = V.intradayHtml(T, { engine: 'v2' });
  assert.match(h, /1 of 2 markets changed direction/); assert.match(h, /<b>09:00<\/b> Neutral → Bearish/); assert.match(h, /held all day/); assert.match(h, /bevi-shift/);
  const only = V.intradayHtml(T, { engine: 'v2', only: 'shifted' });
  assert.ok(only.includes('EURUSD') && !only.includes('GBPUSD'));
});
