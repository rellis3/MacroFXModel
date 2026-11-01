// Expiry tracker: capture days re-cut into one series per expiry.
//   node js/expiryTracker.test.mjs
import { expirySnapshotsFromRaw, mergeExpirySnapshot, foldCaptureDays, expiryView, matchExpiryKey, toSpot, addDays, seriesIndexEntry } from './expiryTracker.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

// A QuikStrike-shaped matrix: price block, DTE labels, C/P header, then strike rows with (call, put) per expiry.
function matrix(futures, dtes, rows) {
  const lines = [`${futures}\tGCZ6`, ['Strike', ...dtes.flatMap(d => [`${d} DTE`, ''])].join('\t'), dtes.flatMap(() => ['C', 'P']).join('\t')];
  for (const [k, ...cp] of rows) lines.push([k, ...cp.flat()].join('\t'));
  return lines.join('\n');
}
const raw = (futures, dtes, rows, extra = {}) => ({ rawOI: matrix(futures, dtes, rows), futures, spot: futures - 10, basis: 10, ...extra });

console.log('[one capture day -> one snapshot per expiry column]');
{
  const r = raw(4000, [23, 53], [[3900, [10, 500], [5, 50]], [4000, [300, 300], [40, 40]], [4200, [900, 10], [0, 0]], [4300, [0, 0], [20, 20]]]);
  const s = expirySnapshotsFromRaw(r, { date: '2026-11-01' });
  ok('two expiries', s.length === 2, s.map(x => x.expiry).join(','));
  ok('expiry = capture date + DTE', s[0].expiry === '2026-11-24' && s[1].expiry === '2026-12-24');
  ok('zero rows dropped from the far ladder', s[1].snap.ladder.length === 3 && !s[1].snap.ladder.some(x => x[0] === 4200));
  ok('ladder kept in futures terms with basis stored', s[0].snap.ladder[0][0] === 3900 && s[0].snap.basis === 10);
  ok('bad date -> nothing', expirySnapshotsFromRaw(r, { date: 'x' }).length === 0);
}

console.log('[merge: idempotent, ordered, stale days marked]');
{
  const meta = { pair: 'GOLD', expiry: '2026-11-24' };
  const a = { date: '2026-11-01', dte: 23, futures: 4000, ladder: [[3900, 10, 500], [4000, 300, 300]] };
  const b = { date: '2026-11-02', dte: 22, futures: 4010, ladder: [[3900, 10, 600], [4000, 300, 300]] };
  let { series } = mergeExpirySnapshot(null, meta, b);
  ({ series } = mergeExpirySnapshot(series, meta, a));
  ok('days sorted by date', series.days.map(d => d.date).join() === '2026-11-01,2026-11-02');
  const again = mergeExpirySnapshot(series, meta, a);
  ok('replaying a day is a no-op', !again.changed && again.series.n === 2);
  const c = { ...b, date: '2026-11-03', dte: 21 };
  ({ series } = mergeExpirySnapshot(series, meta, c));
  ok('identical ladder to the previous day -> stale', series.days[2].stale === true && !series.days[1].stale);
}

console.log('[fold: a contract keeps one series as its DTE counts down; +-1 day wobble is absorbed]');
{
  const m = new Map();
  const d1 = { date: '2026-11-02', pairs: { GOLD: raw(4000, [22, 80], [[3900, [10, 500], [0, 0]], [4100, [800, 10], [0, 0]], [4000, [0, 0], [5, 5]]]) } };   // -> 2026-11-24
  const d2 = { date: '2026-11-03', pairs: { GOLD: raw(4020, [22, 80], [[3900, [10, 520], [0, 0]], [4100, [900, 10], [0, 0]], [4000, [0, 0], [5, 5]]]) } };   // DTE did not tick -> 2026-11-25
  const d3 = { date: '2026-11-04', pairs: { GOLD: raw(4030, [20, 78], [[3900, [10, 520], [0, 0]], [4100, [1100, 10], [0, 0]], [4000, [0, 0], [5, 5]]]) } };
  foldCaptureDays(m, [d3, d1, d2]);
  ok('one series for the contract, not one per capture day (thin far column dropped)', m.size === 1, [...m.keys()].join(' '));
  const s = m.get('GOLD|2026-11-24');
  ok('three capture days in it', s.n === 3 && s.first === '2026-11-02' && s.last === '2026-11-04');
  const v = expiryView(s, { awayFrac: 0.01 });
  const z = v.days[2].zones.find(z => z.k === 4100);
  ok('building streak counts consecutive increases', z.buildStreak === 2, String(z.buildStreak));
  ok('change since first', z.chgSinceFirst === 300);
  ok('spot terms use that day\'s basis', z.px === 4090);
  ok('away-from-spot building separated from near-spot', v.days[2].chgAwayFromSpot === 200 && v.days[2].chgNearSpot === 0,
    `${v.days[2].chgNearSpot} / ${v.days[2].chgAwayFromSpot}`);
  ok('first day has no change figures', v.days[0].chgNearSpot === null && v.days[0].zones[0].chg1d === null);
  ok('centre is OI-weighted', Math.abs(v.days[0].centre - (3900 * 510 + 4100 * 810) / 1320) < 1e-6);
  const idx = seriesIndexEntry(s);
  ok('index entry', idx.n === 3 && idx.dteNow === 20 && idx.totalOI === 1640);
}

console.log('[pull: the book above vs below price, in spot direction]');
{
  const m = new Map();
  const mk = (date, fut, a, b) => ({ date, pairs: { GOLD: raw(fut, [22, 80], [[3900, [10, a], [0, 0]], [4100, [b, 10], [0, 0]], [4000, [0, 0], [5, 5]]]) } });
  foldCaptureDays(m, [mk('2026-11-02', 4000, 500, 800), mk('2026-11-03', 4000, 500, 1000)]);
  const v = expiryView(m.get('GOLD|2026-11-24'), { sigmaAnnual: 0.2 });
  const d = v.days[1];
  ok('share above price', Math.abs(d.shareAbove - 1010 / 1520) < 1e-4, String(d.shareAbove));
  ok('pull = centre vs price, + when the book sits above', d.pullPct > 0 && Math.abs(d.pullPct - ((3900 * 510 + 4100 * 1010) / 1520 / 4000 - 1) * 100) < 1e-3);
  ok('last night built above, not below', d.buildAbove === 200 && d.buildBelow === 0);
  ok('first day carries no build figures', v.days[0].buildAbove === null);
  ok('gamma regime on the last day only', d.gamma && ['PIN', 'BREAKOUT', 'NEUTRAL'].includes(d.gamma.regime) && !v.days[0].gamma, JSON.stringify(d.gamma));
  const mi = new Map();   // the same book on an inverted pair: a higher CME strike is a LOWER spot price
  foldCaptureDays(mi, [{ date: '2026-11-02', pairs: { 'USD/JPY': raw(0.0067, [22, 80], [[0.0066, [10, 500], [0, 0]], [0.0068, [800, 10], [0, 0]], [0.0067, [0, 0], [5, 5]]], { basis: 0, spot: 149.25 }) } }], { invertedPairs: new Set(['USD/JPY']) });
  const vi = expiryView([...mi.values()][0]);
  ok('inverted pair: the big 0.0068 strike counts as BELOW spot', vi.days[0].shareAbove < 0.5 && vi.days[0].pullPct < 0, `${vi.days[0].shareAbove} ${vi.days[0].pullPct}`);
}

console.log('[tail hedges ignored in the view]');
{
  const m = new Map();
  foldCaptureDays(m, [{ date: '2026-11-02', pairs: { NQ: raw(20000, [30, 60], [[5000, [0, 90000], [0, 0]], [20000, [500, 500], [0, 0]], [20500, [800, 0], [0, 0]], [20100, [0, 0], [1, 1]]]) } }]);
  const v = expiryView(m.get('NQ|2026-12-02'));
  ok('a strike 75% away is not a zone', !v.days[0].zones.some(z => z.k === 5000) && v.days[0].totalOI === 1800);
}

console.log('[helpers]');
{
  ok('inverted pair converts to spot', Math.abs(toSpot(0.0068, { basis: 0, inverted: true }) - 147.0588) < 1e-3);
  ok('addDays', addDays('2026-12-30', 3) === '2027-01-02');
  ok('match by code before date', matchExpiryKey(['2026-11-24', '2026-12-24'], { expiry: '2026-12-26', code: 'OGZ6' }, k => (k === '2026-11-24' ? 'OGZ6' : null)) === '2026-11-24');
  ok('two days apart is a different expiry', matchExpiryKey(['2026-11-24'], { expiry: '2026-11-26' }) === '2026-11-26');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
