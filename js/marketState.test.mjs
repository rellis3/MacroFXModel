import assert from 'node:assert/strict';
import { SECTORS, sectorBoard, breadth, marketState, impactRows } from './marketState.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const N = 400;
const dates = Array.from({ length: N }, (_, i) => `d${String(i).padStart(4, '0')}`);
/** A series flat until the last 20 sessions, then moving `pct` per cent. */
const ramp = (base, pct) => dates.map((_, i) => i < N - 21 ? base : base * (1 + (pct / 100) * (i - (N - 21)) / 20));
const flat = base => dates.map(() => base);

const bundle = (over = {}) => ({ dates, series: {
  xlk: flat(200), xlc: flat(100), xly: flat(180), xlf: flat(40), xli: flat(120), xle: flat(90),
  xlb: flat(85), xlv: flat(140), xlp: flat(75), xlu: flat(70), xlre: flat(45), smh: flat(250),
  rsp: flat(160), spy: flat(500), ...over } });

const brd = (rows = []) => rows;
const row = (key, z, change, extra = {}) => ({ key, z, change, ...extra });

t('the sector board covers all eleven plus the semis bellwether, each explained', () => {
  assert.equal(SECTORS.length, 12);
  for (const s of SECTORS) assert.ok(s.what && s.what.length > 30, `${s.key} needs a plain-English line`);
  for (const k of ['xlf', 'xlk', 'xlu', 'xlre', 'smh']) assert.ok(SECTORS.some(s => s.key === k), `missing ${k}`);
});

t('sectors are ranked by their own twenty-session move, leaders first', () => {
  const b = bundle({ xle: ramp(90, 12), xlu: ramp(70, -6) });
  const s = sectorBoard(b);
  assert.equal(s[0].key, 'xle', 'the biggest riser must lead');
  assert.equal(s.at(-1).key, 'xlu', 'and the biggest faller must sit last');
  assert.ok(Math.abs(s[0].change - 12) < 0.6, `expected ~+12%, got ${s[0].change}`);
});

t('concentration is equal-weight MINUS cap-weight, so a mega-cap rally reads negative', () => {
  // the index up 6%, the average share up only 1% -> carried by its largest members
  const b = breadth(bundle({ spy: ramp(500, 6), rsp: ramp(160, 1) }));
  assert.ok(b.concentration < -4, `expected about -5, got ${b.concentration}`);
  const even = breadth(bundle({ spy: ramp(500, 6), rsp: ramp(160, 6) }));
  assert.ok(Math.abs(even.concentration) < 0.6, 'a broad rally must read near zero');
});

t('breadth counts participating sectors and the best-to-worst spread', () => {
  const b = breadth(bundle({ xle: ramp(90, 10), xlk: ramp(200, 8), xlu: ramp(70, -9) }));
  assert.equal(b.sectorsTotal, 11, 'the semis are a bellwether, not one of the eleven');
  assert.equal(b.sectorsUp, 2);
  assert.ok(b.spread >= 18, `best-to-worst should be about 19 points, got ${b.spread}`);
});

t('a narrow market is named narrow, and the equal-weight gap is the evidence', () => {
  const b = bundle({ spy: ramp(500, 7), rsp: ramp(160, 0.5), smh: ramp(250, 14), xlk: ramp(200, 9), xlu: ramp(70, -4), xlp: ramp(75, -3), xlf: ramp(40, -2) });
  const s = marketState(b, brd([row('dspx', 1.0, 2, { pct: 0.9 }), row('spx', 0.4, 7), row('vix', 0.1, 0), row('hy', 0, 0)]));
  assert.equal(s.state, 'Narrow and concentrated', `got ${s.state}`);
  assert.ok(s.evidence.some(e => /average share is lagging/.test(e)), 'the equal-weight gap must be cited');
  assert.ok(s.confidence.met >= 2 && s.confidence.total === 4);
  assert.ok(s.teach.length > 60, 'a state must teach, not just label');
});

t('a rates-led day outranks the others when the front end is the mover', () => {
  const b = bundle({ xlf: ramp(40, -7), xlu: ramp(70, 5) });
  const s = marketState(b, brd([row('us2y', 2.4, 52), row('us10y', 1.2, 26), row('curve', -2.4, -26), row('spx', 0.1, 1), row('vix', 0, 0), row('hy', 0, 0)]));
  assert.equal(s.state, 'Rates are driving');
  assert.ok(s.evidence.length >= 3);
  assert.match(s.teach, /downstream/, 'and must say what to read first');
});

t('what CONTRADICTS the label is returned, not just what supports it', () => {
  const b = bundle({ spy: ramp(500, 7), rsp: ramp(160, 0.5), smh: ramp(250, 14) });
  const s = marketState(b, brd([row('spx', 0.4, 7), row('vix', 0, 0), row('hy', 0, 0), row('dspx', 0, 0, { pct: 0.1 })]));
  assert.ok(Array.isArray(s.against), 'the failed conditions must come back');
  assert.ok(s.against.length >= 1, 'a state that met every condition on this data would be suspicious');
  assert.equal(s.confidence.met + s.confidence.total - s.confidence.met, s.confidence.total);
});

t('a quiet board is called quiet rather than forced into a label', () => {
  const s = marketState(bundle(), brd([row('spx', 0.1, 0.2), row('vix', 0, 0), row('hy', 0, 0), row('us2y', 0.2, 2)]));
  assert.equal(s.quiet, true);
  assert.equal(s.confidence, null, 'there is no confidence to report when nothing was matched');
  assert.match(s.teach, /invent stories/);
});

t('runners-up are reported so the page can say what it nearly called it', () => {
  const b = bundle({ spy: ramp(500, 7), rsp: ramp(160, 0.4), smh: ramp(250, 15), xlk: ramp(200, 10), xlu: ramp(70, -6), xlp: ramp(75, -5), xlf: ramp(40, -4), xle: ramp(90, -5) });
  const s = marketState(b, brd([row('dspx', 1.5, 3, { pct: 0.95 }), row('spx', 0.4, 7), row('vix', 0, 0), row('hy', 0, 0)]));
  assert.ok(Array.isArray(s.alternatives));
  for (const a of s.alternatives) assert.ok(a.met >= 2 && a.name !== s.state);
});

t('a missing series fails its condition instead of throwing', () => {
  const s = marketState({ dates, series: {} }, brd([row('us2y', 2.5, 60), row('us10y', 1.5, 30), row('curve', -2, -30)]));
  assert.ok(s.state, 'a bundle with no equities must still produce a state');
  assert.equal(s.breadth.concentration, null);
  assert.equal(s.breadth.sectorsUp, null);
  assert.doesNotThrow(() => marketState(null, []));
  assert.doesNotThrow(() => marketState({ dates: [], series: {} }, null ?? []));
});

t('every finding kind the scan can emit has an impact row with a real next check', () => {
  const kinds = ['dislocation', 'inverted', 'ratekind', 'extreme', 'vixterm', 'creditstack',
                 'broken', 'dispersion', 'crack', 'book-outside', 'book-flow', 'book-stale', 'quiet'];
  const rows = impactRows(kinds.map(k => ({ kind: k, title: `t-${k}`, means: 'First sentence here. Second one.', key: 'x' })));
  assert.equal(rows.length, kinds.length);
  for (const r of rows) {
    assert.equal(r.mechanism, 'First sentence here.', 'the mechanism is the first sentence of means');
    assert.ok(r.affects.length > 6, `${r.kind}: affects missing`);
    assert.ok(r.check.length > 30, `${r.kind}: the next check must be specific enough to do`);
    assert.doesNotMatch(r.check, /\b(buy|sell|short|long)\b/i, `${r.kind}: a next check is an instruction to LOOK, never to trade`);
  }
});

t('a feed that did not print on the final session still scores', () => {
  // the real failure: the bundle spine ends on an FX-only session, so every equity
  // series is null at the last index and the whole sector board came back empty
  const gap = arr => arr.map((v, i) => i >= N - 2 ? null : v);
  const b = bundle({ xle: gap(ramp(90, 12)), spy: gap(ramp(500, 4)), rsp: gap(ramp(160, 4)) });
  const s = sectorBoard(b);
  assert.ok(s.some(x => x.key === 'xle'), 'a sector must not vanish because its feed lagged a day');
  assert.ok(Math.abs(s.find(x => x.key === 'xle').change - 12) < 1.5, 'and its move must still be right');
  assert.ok(breadth(b).concentration != null, 'breadth must survive the same gap');
  // but a series genuinely absent for a week is still null, not silently carried
  const dead = arr => arr.map((v, i) => i >= N - 9 ? null : v);
  assert.equal(sectorBoard(bundle({ xle: dead(ramp(90, 12)) })).some(x => x.key === 'xle'), false);
});

console.log(`marketState: ${n} groups, all passed`);
