import assert from 'node:assert/strict';
import { BOARD, LINKS, WINDOWS, scanBoard, scanLinks, scoreSeries, scoreLink, glance, findings, fmtChange, fmtLevel } from './marketScan.js';

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
    crack: walk(20, 0.15), giltgap: walk(0.5, 0.005), bundgap: walk(-1.5, 0.005), jgbgap: walk(-3, 0.005), dspx: walk(30, 0.2) };
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

t('a crowded market surfaces as a dispersion finding, marked untested', () => {
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  let q = 3; const rnd = () => { q = (q * 1103515245 + 12345) % 2147483648; return q / 2147483648 - 0.5; };
  const walk = (st, sp) => { let v = st; return dates.map(() => (v += rnd() * sp)); };
  const b = { dates, series: { vix: walk(15, 0.15), dspx: dates.map((_, i) => 20 + i * 0.02), us2y: walk(4, 0.01), us10y: walk(4, 0.01) } };
  const f = findings(scanBoard(b), { links: [], limit: 5 });
  const d = f.find(x => x.kind === 'dispersion');
  assert.ok(d, 'a dispersion extreme should surface');
  assert.match(d.means, /single-name options cost/);
  assert.match(d.notMeans, /tested here|D1/i, 'the finding must carry the verdict, not claim it is untested');
  assert.match(d.notMeans, /NOT a crash signal/);
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


// ── the link layer (2026-09-23): relationships, not a leaderboard ─────────────

/** A bundle where B tracks A exactly, until the last day when B refuses to follow. */
function linked({ breakAt = true, sign = 1 } = {}) {
  const N = 800;
  const dates = Array.from({ length: N }, (_, i) => `d${String(i).padStart(4, '0')}`);
  let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const tips = []; let t = 2;
  for (let i = 0; i < N; i++) { t += rnd() * 0.02; tips.push(t); }
  // gold moves -40x the real-yield move, i.e. tightly coupled with the textbook sign
  const gold = tips.map(v => 2400 - sign * (v - 2) * 40 * 20);
  if (breakAt) for (let i = N - 20; i < N; i++) gold[i] += (i - (N - 20)) * 14;   // gold walks away
  return { dates, series: { tips, gold } };
}

t('a link is scored against how the two markets actually relate, not a textbook constant', () => {
  const b = linked({ breakAt: false });
  const r = scoreLink(b, LINKS.find(l => l.id === 'tips-gold'));
  assert.ok(r, 'tips-gold should score');
  assert.ok(Math.abs(r.corr) > 0.9, `a near-deterministic link should read as tight, got ${r.corr}`);
  assert.equal(r.weak, false);
  assert.equal(r.agrees, true, 'gold falling as real yields rise is the textbook sign');
  assert.ok(Math.abs(r.z) < 2, `an intact link must not read as dislocated, got z ${r.z}`);
});

t('a planted dislocation is caught, and the fit does not absorb it', () => {
  const r = scoreLink(linked({ breakAt: true }), LINKS.find(l => l.id === 'tips-gold'));
  assert.ok(Math.abs(r.z) >= 2, `gold walking away from real yields should read as far apart, got z ${r.z}`);
  assert.ok(r.pct >= 0.9, `and should sit in the top decile of past gaps, got ${r.pct}`);
});

t('today never sets its own baseline', () => {
  // If today were included in the fit, a big enough final-day shock would drag the
  // mean and sd toward itself and SHRINK its own z. Doubling the shock must raise it.
  const one = linked({ breakAt: true });
  const two = { dates: one.dates, series: { tips: one.series.tips, gold: one.series.gold.slice() } };
  two.series.gold[two.series.gold.length - 1] += 200;
  const zA = Math.abs(scoreLink(one, LINKS.find(l => l.id === 'tips-gold')).z);
  const zB = Math.abs(scoreLink(two, LINKS.find(l => l.id === 'tips-gold')).z);
  assert.ok(zB > zA, `a bigger break must score higher, got ${zA} then ${zB}`);
});

t('a link whose sign is backwards from the textbook is flagged, not silently scored', () => {
  const r = scoreLink(linked({ breakAt: false, sign: -1 }), LINKS.find(l => l.id === 'tips-gold'));
  assert.equal(r.agrees, false, 'gold RISING with real yields contradicts the stated mechanism');
  assert.ok(r.corr > 0, 'and the measured correlation should carry the wrong sign');
});

t('two unrelated markets are marked weak so they cannot produce a false dislocation', () => {
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  let s = 11, q = 29;
  const r1 = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const r2 = () => { q = (q * 16807) % 2147483647; return q / 2147483647 - 0.5; };
  const walk = (st, sp, r) => { let v = st; return dates.map(() => (v += r() * sp)); };
  const b = { dates, series: { tips: walk(2, 0.02, r1), gold: walk(2400, 20, r2) } };
  const r = scoreLink(b, LINKS.find(l => l.id === 'tips-gold'));
  assert.equal(r.weak, true, `independent series must be weak, got corr ${r.corr}`);
  const f = findings(scanBoard(b), { links: [], scored: [r], limit: 3 });
  assert.equal(f.some(x => x.kind === 'dislocation'), false, 'a weak link must never headline');
});

t('a dislocation outranks a big single number', () => {
  const b = linked({ breakAt: true });
  const scored = scanLinks(b);
  const f = findings(scanBoard(b), { links: [], scored, limit: 3 });
  assert.equal(f[0].kind, 'dislocation', `expected a relationship to lead, got ${f[0].kind}`);
  assert.match(f[0].title, /have come apart/);
  assert.match(f[0].seen, /normally move/, 'the finding must say what normal looks like');
  assert.match(f[0].seen, /further apart than on \d+%/, 'and give the plain percentage, not just a z');
  assert.match(f[0].notMeans, /overlap/i, 'and admit that overlapping windows inflate the z');
});

t('every link points at real board keys and carries its mechanism in words', () => {
  const keys = new Set(BOARD.map(b => b.key));
  for (const l of LINKS) {
    assert.ok(keys.has(l.a), `${l.id}: unknown key ${l.a}`);
    assert.ok(keys.has(l.b), `${l.id}: unknown key ${l.b}`);
    assert.ok(l.expect === 1 || l.expect === -1, `${l.id}: expect must be +1 or -1`);
    assert.ok(l.normally && l.normally.length > 60, `${l.id}: needs the mechanism in plain English`);
    assert.ok(l.apart && l.apart.length > 60, `${l.id}: needs what it means when it comes apart`);
    assert.doesNotMatch(l.apart, /will (rise|fall|revert|close)\b/, `${l.id}: 'apart' must not predict`);
  }
  assert.equal(new Set(LINKS.map(l => l.id)).size, LINKS.length, 'duplicate link ids');
  assert.ok(LINKS.length >= 15, 'a market view needs more than a handful of relationships');
});

t('the board is wide enough to be a market view rather than the chain again', () => {
  const g = {}; for (const b of BOARD) g[b.group] = (g[b.group] ?? 0) + 1;
  assert.ok(BOARD.length >= 45, `got ${BOARD.length} tiles`);
  assert.ok(g.Equities >= 6, `equities was the thinnest group and must not be two tiles again, got ${g.Equities}`);
  assert.ok(g['Credit & fear'] >= 8, `credit needs the stack and the vol surface, got ${g['Credit & fear']}`);
});

t('the breadth row is a difference of two percentage moves, not of two index levels', () => {
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  // the Russell flat, the Nasdaq +10% over the final twenty sessions
  const r2k = dates.map(() => 2000);
  const nq = dates.map((_, i) => i < N - 20 ? 18000 : 18000 * (1 + 0.10 * (i - (N - 21)) / 20));
  const r = scoreSeries({ dates, series: { r2k, nq } }, BOARD.find(b => b.key === 'breadth'), N - 1);
  assert.ok(r, 'breadth should score');
  assert.ok(Math.abs(r.change - -10) < 0.6, `expected about -10 points of breadth, got ${r.change}`);
});

t('the rate-kind split names growth vs inflation from the two legs', () => {
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  let s = 3; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const jitter = (base, sp) => { let v = base; return dates.map(() => (v += rnd() * sp)); };
  // 10y +30bp over the window, ALL of it real: breakevens flat
  const bump = (arr, by) => arr.map((v, i) => i < N - 20 ? v : v + by * (i - (N - 21)) / 20);
  const b = { dates, series: { us10y: bump(jitter(4, 0.01), 0.30), tips: bump(jitter(2, 0.01), 0.30), bei: jitter(2, 0.004) } };
  const f = findings(scanBoard(b), { links: [], scored: [], limit: 4 });
  const rk = f.find(x => x.kind === 'ratekind');
  assert.ok(rk, 'a 30bp all-real move should produce the split');
  assert.match(rk.title, /real-yield move/);
  assert.match(rk.seen, /REAL yield/);
  assert.match(rk.notMeans, /not a forecast/i);
});

t('scanLinks survives a bundle that carries none of the series', () => {
  assert.deepEqual(scanLinks({ dates: [], series: {} }), []);
  assert.equal(scoreLink({ dates: ['a'], series: {} }, LINKS[0]), null);
});

t('the board can be read over a day, a week or a month, each against its own history', () => {
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  // gold flat for years, then one violent SINGLE session at the end
  const gold = dates.map((_, i) => i < N - 1 ? 2400 + Math.sin(i / 7) * 3 : 2600);
  const b = { dates, series: { gold } };
  const spec = BOARD.find(x => x.key === 'gold');
  const d1 = scoreSeries(b, spec, N - 1, 1);
  const d20 = scoreSeries(b, spec, N - 1, 20);
  assert.ok(d1.z > 5, `a one-day shock must be extreme on the one-day view, got ${d1.z}`);
  assert.ok(Math.abs(d1.change - 8.3) < 0.5, `+8.3% in a session, got ${d1.change}`);
  assert.ok(d20.z > 0, 'and still visible over a month');
  assert.ok(d1.z > d20.z, 'but the shorter window should register it harder');
  assert.equal(scanBoard(b, N - 1, 5)[0].window, 5, 'a row must carry the window it was scored on');
});

t('WINDOWS offers a day, a week and a month, and nothing longer than the history allows', () => {
  assert.deepEqual(WINDOWS.map(w => w.n), [1, 5, 20]);
  for (const w of WINDOWS) assert.ok(w.label && !/^\d+$/.test(w.label), `${w.n} needs a human label`);
});

t('the glance counts agree with the findings rather than telling a second story', () => {
  const N = 800; const dates = Array.from({ length: N }, (_, i) => `d${i}`);
  let s = 5; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const walk = (st, sp) => { let v = st; return dates.map(() => (v += rnd() * sp)); };
  const b = { dates, series: { gold: walk(2400, 5), tips: walk(2, 0.01), vix: walk(16, 0.2), hy: walk(3, 0.01) } };
  const board = scanBoard(b), links = scanLinks(b);
  const g = glance(board, links);
  assert.equal(g.rare + g.unusual + g.inside, g.total, 'every row must land in exactly one bucket');
  assert.equal(g.apart + g.holding + g.tooLoose, links.length, 'and every link too');
  // the apart count uses the same 1.8 threshold the headline finding does
  const apartFindings = findings(board, { links: [], scored: links, limit: 9 }).filter(f => f.kind === 'dislocation').length;
  assert.ok(g.apart >= apartFindings, `glance says ${g.apart} apart but ${apartFindings} dislocations were emitted`);
});

console.log(`marketScan: ${n} groups, all passed`);
