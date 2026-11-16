// Tests for js/deskDataQuality.js.   node js/deskDataQuality.test.mjs
import assert from 'node:assert/strict';
import { assess, afterRun } from './deskDataQuality.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const S = (ok, stale = 0, bad = 0) => ({ ok, stale, empty: bad, error: 0, timeout: 0, oversize: 0, total: ok + stale + bad });
const health = (gaps, bySkill, usable = 95, total = 100) => ({ total, usable, bySkill, gaps });

t('all in: run', () => {
  const a = assess(health([], { global_market: S(10), vol_iv: S(8) }, 100, 100));
  assert.equal(a.decision, 'run'); assert.deepEqual(a.reasons, []);
});

t('a known gap gets its cause and fix; stale counts as usable', () => {
  const a = assess(health([{ id: 'trade-decision/state:EURUSD', skill: 'levels_structure', status: 'empty' }, { id: 'fed-path', skill: 'rates_cb', status: 'stale', ageH: 100 }], { levels_structure: S(10, 0, 1), rates_cb: S(14, 1) }, 96, 100));
  const td = a.gaps.find(g => g.id.startsWith('trade-decision')), fp = a.gaps.find(g => g.id === 'fed-path');
  assert.match(td.cause, /server memory/); assert.match(td.fix, /trade-decision\/refresh/);
  assert.equal(fp.usable, true); assert.equal(fp.critical, true);
  assert.equal(a.decision, 'run', 'a stale critical feed is still usable');
});

t('a missing critical feed: run with gaps, named', () => {
  const a = assess(health([{ id: 'credit-stress', skill: 'credit_funding', status: 'timeout' }], { credit_funding: S(5, 0, 1) }, 99, 100));
  assert.equal(a.decision, 'run-with-gaps'); assert.match(a.reasons[0], /credit-stress/);
  assert.match(a.gaps[0].cause, /longer than the pack allows/);
});

t('hold: no forecast lines, three critical feeds out, or an analyst nearly blind', () => {
  assert.equal(assess(health([{ id: 'vol-forecast/session', skill: 'vol_iv', status: 'error' }], { vol_iv: S(9, 0, 1) })).decision, 'hold');
  const three = ['rates', 'fomc/latest', 'yield-curve'].map(id => ({ id, skill: 'rates_cb', status: 'empty' }));
  assert.match(assess(health(three, { rates_cb: S(12, 0, 3) })).reasons.join(), /3 critical feeds missing/);
  const blind = assess(health([], { levels_structure: S(3, 0, 10) }));
  assert.equal(blind.decision, 'hold'); assert.match(blind.reasons[0], /levels_structure can see under 40%/);
  assert.equal(blind.byAnalyst[0].skill, 'levels_structure', 'the worst-served analyst first');
});

t('after the run: a gap matters when its analyst or the Head named it', () => {
  const a = assess(health([{ id: 'rbnz/latest', skill: 'rates_cb', status: 'empty' }, { id: 'weekmap', skill: 'levels_structure', status: 'timeout' }], { rates_cb: S(14, 0, 1), levels_structure: S(12, 0, 1) }));
  const run = { analysts: { rates_cb: { report: { gaps: ['No RBNZ read this week'] } }, levels_structure: { report: { gaps: [] } } }, head: { book: { gaps: [] } } };
  const r = afterRun(a, run);
  assert.equal(r.gaps.find(g => g.id === 'rbnz/latest').mattered, true);
  assert.equal(r.gaps.find(g => g.id === 'weekmap').mattered, false);
  assert.equal(r.matteredCount, 1);
});

console.log(`deskDataQuality: ${n} tests passed`);

// who updates it, in the gap's own words (owner 2026-11-16: "why is so much out of date?")
{
  const { assess } = await import('./deskDataQuality.js');
  const a = assess({ total: 3, usable: 3, gaps: [
    { id: 'options-skew', skill: 'vol_iv', status: 'stale', ageH: 276.7 },
    { id: 'eod-review', skill: 'evidence_memory', status: 'stale', ageH: 393.6 },
    { id: 'term-premium', skill: 'yields_curve', status: 'stale', ageH: 246.8 },
  ], bySkill: {} });
  const by = id => a.gaps.find(g => g.id === id);
  if (!/laptop/.test(by('options-skew').cause) || !/12 days/.test(by('options-skew').cause)) throw new Error('laptop feed names the laptop and the age');
  if (!/button/.test(by('eod-review').cause) || /daily job/.test(by('eod-review').cause)) throw new Error('eod-review is click-only, not a daily job');
  if (!/week late/.test(by('term-premium').cause)) throw new Error('term premium is the source lag');
  console.log('deskDataQuality: cause wording ok');
}
