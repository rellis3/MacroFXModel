// node js/swingWalkTrack.test.mjs
import { scoreWalkRecords } from './swingWalkTrack.js';

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok ' : 'FAIL '} ${name}${extra ? ` (${extra})` : ''}`); if (!cond) fails++; };

console.log('[swing walk forward score]');
{
  // weekdays 2026-11-02 .. 2026-11-13, price 100 rising 1 a day
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  const bars = days.map((date, i) => ({ date, close: 100 + i }));
  // a record on 11-02 (close 100): the dot for 11-06 (4 closes later) at 104 = exactly where price went
  const rec = { closeDate: '2026-11-02', close: 100, vol: 0.01, walks: { strike: [['2026-11-06', 4, 104, null]], maxPain: [['2026-11-06', 4, 96, null]], centre: [['2026-11-20', 18, 101, null]] } };
  const r = scoreWalkRecords([rec], bars);
  const s = r.anchors.strike.all, m = r.anchors.maxPain.all;
  ok('h counts closes after the record up to the expiry', r.anchors.strike.paths['2026-11-06'][0][1] === 4);
  ok('a dot where price went: beta 1, no miss', Math.abs(s.beta - 1) < 1e-9 && s.rmsMiss < 1e-9, `${s.beta}`);
  ok('a dot the other way: beta about -1, worse than no move', m.beta < -0.9 && m.rmsMiss > m.rmsNoMove, String(m.beta));
  ok('a still-live expiry is a path, not a score', r.anchors.centre.all.n === 0 && r.anchors.centre.paths['2026-11-20'].length === 1);
  ok('live h = closes so far + weekdays to the expiry', r.anchors.centre.paths['2026-11-20'][0][1] === 9 + 5, String(r.anchors.centre.paths['2026-11-20'][0][1]));
  ok('bucket filled', r.anchors.strike.buckets['3-5']?.n === 1);
  // the owner's case: the same expiry, the dot stuck 4% away while time runs out -> the gap in expected moves climbs
  const recs = days.slice(0, 4).map((date, i) => ({ closeDate: date, close: 100, vol: 0.01, walks: { strike: [['2026-11-13', 9 - i, 104, null]] } }));
  const flat = days.map(date => ({ date, close: 100 }));
  const p = scoreWalkRecords(recs, flat).anchors.strike.paths['2026-11-13'];
  ok('a stuck dot: its gap in expected moves grows as the date nears', p.every((x, i) => i === 0 || x[2] > p[i - 1][2]), p.map(x => x[2]).join(' '));
  ok('bad records are skipped', scoreWalkRecords([{ closeDate: '2026-11-02' }, null], bars).records === 2);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
if (fails) process.exit(1);
