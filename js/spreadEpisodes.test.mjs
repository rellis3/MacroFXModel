// node js/spreadEpisodes.test.mjs — the live engine must reproduce the registered Python run
// (scripts/spread-episodes/run.py exports chart_case1.json / chart_case2.json: the scored series and every primary-spec event).
import { readFileSync, existsSync } from 'fs';
import assert from 'assert/strict';
import { zigzag, finishCase1, finishCase2, analyse, alertText } from './spreadEpisodes.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('  ok ', name); };

ok('zig-zag: turn at the extreme, confirm when the retrace reaches the threshold', () => {
  const x = [0, 1, 2, 3, 2.5, 1.9, 2.2, 3.5, 4, 2.9];
  const z = zigzag(x, x.map(() => 1));
  assert.deepEqual(z.co, [1, 5, 7, 9]);       // up confirmed at 1 (from 0), down at 5 (from 3 at idx 3), up at 7 (from 1.9), down at 9 (from 4)
  assert.deepEqual(z.tu, [0, 3, 5, 8]);
  assert.deepEqual(z.di, [1, -1, 1, -1]);
});

ok('alert text names the sequence and says context only', () => {
  const t = alertText('X', { dir: 1, e: -1, spreadTurn: 1, spreadConf: 2, delayBars: 3, C1: true, C2: true, coupTile: 3, full: true }, { pFollow: 0.3, pRevert: 0.3, mean: 0.01, n: 100, label: 'l' }, 'bp');
  assert.match(t, /FULL SEQUENCE/); assert.match(t, /Context only/);
});

function parity(file, build) {
  const D = JSON.parse(readFileSync(file, 'utf8'));
  const F = build(D.series), A = analyse(F, { k: 0.75 });
  const tIdx = new Map(F.T.map((t, i) => [t, i]));
  const py = new Map(D.events.map(e => [e.conf, e])), js = new Map(A.events.map(e => [e.confT, e]));
  let both = 0, dirSame = 0, eSame = 0, tagSame = 0, ySame = 0, yN = 0;
  for (const [t, p] of py) {
    const j = js.get(t); if (!j) continue; both++;
    // a turn time may differ only where two bars share the extreme price (the export rounds the 1e-12 float noise of the raw spread)
    if (j.dir === p.dir && (j.turnT === p.turn || Math.abs(F.x[tIdx.get(j.turnT)] - F.x[tIdx.get(p.turn)]) < 1e-6)) dirSame++;
    if (j.e === p.e) eSame++;
    const jt = [...j.tags.filter(x => x !== 'up' && x !== 'down'), ...(j.C1 ? ['C1'] : []), ...(j.C2 ? ['C2'] : [])].sort().join(),
          pt = p.tags.filter(x => x !== 'up' && x !== 'down').sort().join();
    if (jt === pt) tagSame++;
    for (const h of Object.keys(p.y)) if (p.y[h] != null && j.y[h] != null) { yN++; if (Math.abs(p.y[h] - j.y[h]) < 0.02) ySame++; }
  }
  return { py: py.size, js: js.size, both, dirSame, eSame, tagSame, ySame, yN };
}

for (const [c, file, build] of [
  ['case2', 'analysis/output/spread-episodes/chart_case2.json', s => finishCase2({ dates: s.t.map(t => new Date(t * 1000).toISOString().slice(0, 10)), x: s.x, p: s.p.map(Math.log) })],
  ['case1', 'analysis/output/spread-episodes/chart_case1.json', s => finishCase1({ T: s.t, x: s.x, p: s.p.map(Math.log), sess: s.t.map(t => new Date((t - 1) * 1000).toISOString().slice(0, 10)), slot: s.t.map(t => Math.floor(((t - 1) % 86400) / 900)) })],
]) {
  if (!existsSync(file)) { console.log(`  skip ${c} parity (${file} not built)`); continue; }
  ok(`${c}: same confirmed turns, directions, tags and outcomes as the Python run`, () => {
    const r = parity(file, build);
    console.log('     ', JSON.stringify(r));
    assert.ok(r.both / r.py > 0.995 && r.js === r.py, 'turn sets differ');
    assert.ok(r.dirSame / r.both > 0.995, 'turn times differ');
    assert.ok(r.eSame / r.both > 0.98, 'expected directions differ');        // tiny price rounding in the export can flip a near-zero link sign
    assert.ok(r.tagSame / r.both > 0.96, 'tags differ');       // tags read x[turn], so a tied extreme can change with_trend / toward_mean
    assert.ok(r.ySame / r.yN > 0.97, 'outcomes differ');
  });
}
console.log(`spreadEpisodes: ${pass} tests passed`);
