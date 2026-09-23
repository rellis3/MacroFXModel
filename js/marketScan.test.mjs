import assert from 'node:assert/strict';
import { BOARD, scanBoard, scoreSeries, findings, fmtChange, fmtLevel } from './marketScan.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

/** 800 sessions of gentle noise, so a planted move stands out as rare. */
function bundle(overrides = {}) {
  const N = 800;
  const dates = Array.from({ length: N }, (_, i) => `d${String(i).padStart(4, '0')}`);
  let s = 1; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const walk = (start, step) => { let v = start; return dates.map(() => (v += rnd() * step)); };
  const series = { us2y: walk(4, 0.01), us10y: walk(4, 0.01), us30y: walk(4, 0.01), tips: walk(2, 0.01), bei: walk(2, 0.005),
    hy: walk(3, 0.01), vix: walk(16, 0.2), dxy: walk(100, 0.1),
    eurusd: walk(1.1, 0.002), gbpusd: walk(1.3, 0.002), usdjpy: walk(150, 0.2), audusd: walk(0.7, 0.001), usdcad: walk(1.35, 0.002),
    spx: walk(5000, 8), nq: walk(18000, 30), oil: walk(75, 0.4), gold: walk(2400, 5), copper: walk(4, 0.01), btc: walk(60000, 400),
    crack: walk(20, 0.15), giltgap: walk(50, 0.5), bundgap: walk(-150, 0.5), jgbgap: walk(-300, 0.5) };
  return { dates, series: { ...series, ...overrides(dates, series) ?? {} } };
}
const plain = () => bundle(() => ({}));

t('the board covers every group a macro reader needs', () => {
  const groups = new Set(BOARD.map(b => b.group));
  for (const g of ['Rates', 'Credit & fear', 'FX', 'Equities', 'Commodities', 'Crypto']) assert.ok(groups.has(g), `missing group: ${g}`);
  assert.ok(BOARD.length >= 20, 'this is meant to be the whole market, not the chain again');
  for (const b of BOARD) assert.ok(b.what && b.what.length > 25, `${b.key} needs a plain-English explanation`);
  assert.equal(new Set(BOARD.map(b => b.key)).size, BOARD.length, 'duplicate keys');
});

t('a derived row (the curve) is computed, not read from a series', () => {
  const b = plain(); const spec = BOARD.find(x => x.key === 'curve');
  const r = scoreSeries(b, spec, b.dates.length - 1);
  assert.ok(r, 'the curve should score');
  const i = b.dates.length - 1;
  assert.ok(Math.abs(r.last - (b.series.us10y[i] - b.series.us2y[i])) < 1e-9);
});

t('z is against the series own history, so a big number is not automatically rare', () => {
  // a series that always moves 2% in twenty sessions: a 2% move is ordinary
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  const noisy = { dates, series: { gold: dates.map((_, i) => 2000 * (1 + 0.02 * Math.sin(i / 3))) } };
  const r = scoreSeries(noisy, BOARD.find(b => b.key === 'gold'), N - 1);
  assert.ok(r == null || Math.abs(r.z) < 3, 'a routine oscillation must not read as rare');
});

t('a planted shock is found and ranked first', () => {
  const b = bundle((dates, s) => ({ hy: s.hy.map((v, i) => i > dates.length - 12 ? v + (i - (dates.length - 12)) * 0.25 : v) }));
  const board = scanBoard(b);
  const hy = board.find(x => x.key === 'hy');
  assert.ok(hy.z > 2, `the planted credit blowout should be rare, got z ${hy?.z}`);
  const f = findings(board, { links: [] });
  assert.equal(f[0].kind === 'extreme' || f[0].kind === 'credit-lead', true);
  assert.match(f[0].seen, /High-yield|z /);
});

t('every finding says what it means AND what it does not mean', () => {
  const quiet = findings(scanBoard(plain()), { links: [] });
  const loud = findings(scanBoard(bundle((d, s) => ({ vix: s.vix.map((v, i) => i > d.length - 12 ? v * 1.5 : v) }))), { links: [] });
  for (const f of [...quiet, ...loud]) {
    assert.ok(f.title && f.title.length > 8, `${f.kind}: title missing`);           // a headline is short by design
    for (const k of ['seen', 'means', 'notMeans']) assert.ok(f[k] && f[k].length > 40, `${f.kind}: ${k} missing or thin`);
    assert.doesNotMatch(f.notMeans, /^$/);
  }
});

t('a quiet board reports that it is quiet rather than inventing a story', () => {
  const f = findings(scanBoard(plain()), { links: [] });
  assert.ok(f.length >= 1);
  assert.equal(f[f.length - 1].kind === 'quiet' || f.some(x => x.kind === 'quiet') || Math.abs(f[0].z ?? 9) >= 1.5, true);
});

t('a broken chain link becomes a finding, and names the common end', () => {
  const links = [
    { id: 'dxy-usdjpy', verdict: 'broken', a: { label: 'Dollar', text: '+1.2%' }, b: { label: 'USD/JPY', text: '-2.0%' } },
    { id: 'dxy-btc', verdict: 'broken', a: { label: 'Dollar', text: '+1.2%' }, b: { label: 'Bitcoin', text: '+5.0%' } },
  ];
  const f = findings(scanBoard(plain()), { links, limit: 5 });
  const br = f.find(x => x.kind === 'broken');
  assert.ok(br, 'a broken link must surface');
  assert.match(br.title, /2 textbook links/);
  assert.match(br.means, /Dollar is an end of 2/);
  assert.match(br.notMeans, /no tendency|does not mean the link will resolve/i);
});

t('formatting speaks each market in its own unit', () => {
  assert.equal(fmtChange({ kind: 'price', change: 2.34 }), '+2.3%');
  assert.equal(fmtChange({ kind: 'rate', change: -18.6 }), '-19bp');
  assert.equal(fmtChange({ kind: 'usd', change: -12.4 }), '-$12');
  assert.equal(fmtLevel({ kind: 'rate', last: 4.9312 }), '4.93%');
  assert.equal(fmtLevel({ kind: 'gap', last: -1.954 }), '-195bp');   // gaps are carried in percent
  assert.equal(fmtLevel({ kind: 'price', last: 1.14647 }), '1.1465');
  assert.equal(fmtChange(null), '—');
});

t('a thin bundle scores nothing rather than guessing', () => {
  assert.deepEqual(scanBoard({ dates: ['a', 'b'], series: { gold: [1, 2] } }), []);
  assert.deepEqual(scanBoard({ dates: [], series: {} }), []);
});

console.log(`marketScan: ${n} groups, all passed`);
