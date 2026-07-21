// Unit tests for volLevelAlertCore — pure, synthetic data, no network.
// Run: node js/volLevelAlertCore.test.mjs
import assert from 'node:assert';
import {
  approachSpeed, momentumZ, divergenceLabel, scanNearLevels,
  formatAlert, evaluatePair, pairIcon, LEVEL_LABELS, ALERT_LEVEL_KEYS,
  dispersionContext, formatDispersionLines,
} from './volLevelAlertCore.js';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const pipSize = 0.0001;

// Build synthetic M5 bars: a straight ramp up (blast) vs a choppy sideways drift.
function ramp(n, start, stepPips) {
  const bars = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + stepPips * pipSize;
    bars.push({ open: o, high: Math.max(o, c) + 0.5 * pipSize, low: Math.min(o, c) - 0.5 * pipSize, close: c });
  }
  return bars;
}
function chop(n, mid, ampPips) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const o = mid + (i % 2 ? ampPips : -ampPips) * pipSize;
    const c = mid + (i % 2 ? -ampPips : ampPips) * pipSize;
    bars.push({ open: o, high: Math.max(o, c) + ampPips * pipSize, low: Math.min(o, c) - ampPips * pipSize, close: c });
  }
  return bars;
}

t('approachSpeed labels a straight ramp as blasting/moving with correct direction', () => {
  const s = approachSpeed(ramp(30, 1.1000, 3), { pipSize, lookback: 6 });
  assert.ok(s, 'expected a result');
  assert.strictEqual(s.direction, 1);
  assert.ok(s.pips > 0);
  assert.ok(['blasting', 'moving'].includes(s.label), `got ${s.label}`);
  assert.ok(s.efficiency > 0.5, `efficiency ${s.efficiency}`);
});

t('approachSpeed labels choppy sideways as drifting/flat', () => {
  const s = approachSpeed(chop(30, 1.1000, 2), { pipSize, lookback: 6 });
  assert.ok(s);
  assert.ok(['drifting', 'flat'].includes(s.label), `got ${s.label}`);
  assert.ok(s.efficiency < 0.5, `efficiency ${s.efficiency}`);
});

t('approachSpeed returns null on too few bars / bad pip', () => {
  assert.strictEqual(approachSpeed(ramp(4, 1.1, 3), { pipSize }), null);
  assert.strictEqual(approachSpeed(ramp(30, 1.1, 3), { pipSize: 0 }), null);
});

t('momentumZ returns a finite wt + z on a ramp', () => {
  const m = momentumZ(ramp(120, 1.1000, 2), { zWindow: 60 });
  assert.ok(m, 'expected result');
  assert.ok(Number.isFinite(m.wt) && Number.isFinite(m.z));
});

t('divergenceLabel returns a known token', () => {
  const d = divergenceLabel(ramp(80, 1.1000, 2));
  assert.ok(['DIVERGENCE_BULL', 'DIVERGENCE_BEAR', 'HIDDEN_BULL', 'HIDDEN_BEAR', 'NONE'].includes(d), d);
});

t('scanNearLevels finds only levels within threshold, nearest first', () => {
  const levels = {
    oh_med: { price: 1.1010, pct: 0.10 },
    oh_75:  { price: 1.1030, pct: 0.30 },
    ol_med: { price: 1.0990, pct: 0.10 },
    ol_75:  { price: 1.0970, pct: 0.30 },
    hl_med: { pct: 0.20 },
    hl_75:  { pct: 0.40 },
  };
  const near = scanNearLevels({ levels, price: 1.1005, pipSize, sessionOpen: 1.1000, thresholdPips: 8 });
  // oh_med is 5 pips away (within 8); oh_75 is 25 away (out). hl_med_hi = 1.10022 → ~1.7 pips.
  const keys = near.map(n => n.key);
  assert.ok(keys.includes('oh_med'), `keys ${keys}`);
  assert.ok(!keys.includes('oh_75'), 'oh_75 should be out of range');
  // nearest-first ordering
  for (let i = 1; i < near.length; i++) assert.ok(near[i].distPips >= near[i - 1].distPips);
  // side computed relative to price
  const oh = near.find(n => n.key === 'oh_med');
  assert.strictEqual(oh.side, 'above');
});

t('scanNearLevels respects the enabled whitelist', () => {
  const levels = { oh_med: { price: 1.1005, pct: 0.05 }, ol_med: { price: 1.0995, pct: 0.05 } };
  const near = scanNearLevels({ levels, price: 1.1000, pipSize, sessionOpen: 1.1000, thresholdPips: 20, enabled: ['ol_med'] });
  assert.deepStrictEqual(near.map(n => n.key), ['ol_med']);
});

t('formatAlert includes flag icon, level, narrative, both prices, speed, momentum, divergence', () => {
  const txt = formatAlert({
    pair: 'EUR/USD', price: 1.10052, dp: 5,
    near: { key: 'oh_med', label: LEVEL_LABELS.oh_med, levelPrice: 1.10100, distPips: 4.8, side: 'above' },
    speed: { label: 'blasting', direction: 1, pips: 6.2, pipsPerMin: 1.03, atrMult: 1.8, efficiency: 0.7 },
    mom: { wt: 42.1, z: 1.9 },
    divergence: 'HIDDEN_BEAR',
  });
  assert.ok(txt.includes('EUR/USD'));
  assert.ok(txt.includes('🇪🇺🇺🇸'), 'should show both country flags');
  assert.ok(txt.includes('O-H Median'));
  assert.ok(txt.includes('median expected high'), 'should include the level narrative');
  assert.ok(txt.includes('1.10052') && txt.includes('1.10100'), 'both current and level price shown');
  assert.ok(/toward/.test(txt), 'blast up toward an above level should say toward');
  assert.ok(txt.includes('Hidden bearish'));
  assert.ok(txt.includes('Informational'));
});

t('pairIcon maps FX crosses, gold and indices', () => {
  assert.strictEqual(pairIcon('EUR/USD'), '🇪🇺🇺🇸');
  assert.strictEqual(pairIcon('GBP/JPY'), '🇬🇧🇯🇵');
  assert.strictEqual(pairIcon('XAU/USD'), '🥇');
  assert.strictEqual(pairIcon('NAS100/USD'), '💻');
  assert.strictEqual(pairIcon('NAS100_USD'), '💻');
  assert.strictEqual(pairIcon('SPX500_USD'), '📈');
  assert.strictEqual(pairIcon('DE30_EUR'), '🇩🇪');
});

t('evaluatePair returns one event per near level with text', () => {
  const levels = { oh_med: { price: 1.1005, pct: 0.05 }, hl_med: { pct: 0.05 }, hl_75: { pct: 0.10 } };
  const out = evaluatePair({
    pair: 'EUR/USD', price: 1.1000, dp: 5, pipSize, sessionOpen: 1.1000,
    levels, thresholdPips: 12, bars: ramp(120, 1.0995, 1),
  });
  assert.ok(out.length >= 1);
  for (const e of out) { assert.ok(e.text.length > 0); assert.ok(e.near.distPips <= 12); }
});

t('ALERT_LEVEL_KEYS covers all label keys', () => {
  assert.deepStrictEqual(ALERT_LEVEL_KEYS.sort(), Object.keys(LEVEL_LABELS).sort());
});

// ── Daily dispersion ───────────────────────────────────────────────────────────
t('dispersionContext computes range-used % vs the forecast median day and buckets it', () => {
  // median day range = 1.1000 * 0.50/100 = 0.0055; session H-L = 0.0033 → 60%.
  const c = dispersionContext({ sessionHigh: 1.1033, sessionLow: 1.1000, sessionOpen: 1.1000, hlMedPct: 0.50 });
  assert.strictEqual(c.rangeUsedPct, 60);
  assert.strictEqual(c.state, 'active');
  // a wide-range day: H-L already exceeds the median range
  const e = dispersionContext({ sessionHigh: 1.1060, sessionLow: 1.1000, sessionOpen: 1.1000, hlMedPct: 0.50 });
  assert.ok(e.rangeUsedPct >= 90 && e.state === 'wide', `got ${e.rangeUsedPct}/${e.state}`);
});

t('dispersionContext: missing inputs → nulls, no throw', () => {
  const c = dispersionContext({});
  assert.strictEqual(c.rangeUsedPct, null);
  assert.strictEqual(c.lean, null);
});

t('dispersionContext expansion regime fires on prior-exceed OR σ-acceleration only', () => {
  assert.strictEqual(dispersionContext({ priorExceed: true,  sigAccel: 1.0 }).lean, 'expansion');
  assert.strictEqual(dispersionContext({ priorExceed: false, sigAccel: 1.5 }).lean, 'expansion');
  assert.strictEqual(dispersionContext({ priorExceed: false, sigAccel: 1.0 }).lean, 'contained');
  // a flag must be present to make a call at all
  assert.strictEqual(dispersionContext({ sessionHigh: 1.1, sessionLow: 1.09, sessionOpen: 1.1, hlMedPct: 0.5 }).lean, null);
});

t('formatDispersionLines renders range-used + regime, empty when nothing known', () => {
  assert.deepStrictEqual(formatDispersionLines(dispersionContext({})), []);
  const exp = formatDispersionLines(dispersionContext({ sessionHigh: 1.1055, sessionLow: 1.1000, sessionOpen: 1.1000, hlMedPct: 0.50, priorExceed: true, sigAccel: 1.0 }));
  const txt = exp.join('\n');
  assert.ok(txt.includes('Range used'), 'shows range-used');
  assert.ok(txt.includes('Expansion regime') && txt.includes('BREAK'), 'shows expansion break warning');
  const con = formatDispersionLines(dispersionContext({ priorExceed: false, sigAccel: 1.0 }));
  assert.ok(con.join('\n').includes('Contained regime'), 'shows contained');
});

t('formatAlert embeds the dispersion block and keeps the no-direction disclaimer', () => {
  const txt = formatAlert({
    pair: 'EUR/USD', price: 1.10052, dp: 5,
    near: { key: 'oh_med', label: LEVEL_LABELS.oh_med, levelPrice: 1.10100, distPips: 4.8, side: 'above' },
    dispersion: dispersionContext({ sessionHigh: 1.1050, sessionLow: 1.1000, sessionOpen: 1.1000, hlMedPct: 0.50, priorExceed: false, sigAccel: 1.3 }),
  });
  assert.ok(txt.includes('Daily dispersion'));
  assert.ok(txt.includes('Expansion regime'));
  assert.ok(txt.includes('not direction'), 'disclaimer clarifies regime ≠ direction');
});

console.log(`\nvolLevelAlertCore: ${passed} tests passed`);
