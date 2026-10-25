/** T1 diagnosis: where do the cut-vs-full mismatches come from? One cut, mismatches tabulated by sleeve × instrument,
 *  split into "position differs" vs "same position, different net" (cost/carry). */
import { buildPortfolio, SAMPLE } from '../portfolio-book/build.mjs';
const cut = process.argv[2] ?? '2012-06-29';
const ids = ['S1', 'S1g', 'S2', 'S3', 'S3g', 'S5', 'S5g'];
const full = await buildPortfolio({ sleeveIds: ids, fold: false });
const part = await buildPortfolio({ sample: { ...SAMPLE, to: cut, isEnd: '2010-01-01' }, sleeveIds: ids, fold: false, store: full.store });
const tab = {};
for (const sid of ['S1', 'S1g', 'S2', 'S3', 'S3g']) {
  const F = full.runs[sid].paths[sid], P = part.runs[sid].paths[sid];
  for (const inst of Object.keys(P)) {
    const f = F[inst], p = P[inst], fi = new Map(f.dates.map((d, i) => [d, i]));
    let n = 0, posDiff = 0, netDiff = 0, volDiff = 0, firstPos = null;
    p.dates.forEach((d, i) => { if (d < SAMPLE.from || d >= cut) return; const j = fi.get(d); n++;
      if (p.pos[i] !== f.pos[j]) { posDiff++; firstPos ??= d; }
      else if (p.net[i] !== f.net[j]) netDiff++;
      if (p.vol[i] !== f.vol[j]) volDiff++; });
    if (posDiff || netDiff || volDiff) tab[`${sid}/${inst}`] = { n, posDiff, netDiff, volDiff, firstPos };
  }
}
for (const sid of ['S5', 'S5g']) { const a = full.sleeves[sid].legs[0].c, b = part.sleeves[sid].legs[0].c; const fi = new Map(full.dates.map((d, i) => [d, i])); let m = 0; part.dates.forEach((d, k) => { if (d < cut && b[k] !== a[fi.get(d)]) m++; }); tab[sid] = { mismatched: m }; }
console.log(JSON.stringify(tab, null, 1));
console.log('cost model:', JSON.stringify(full.runs.S1.costs.worstFx), 'vs cut', JSON.stringify(part.runs.S1.costs.worstFx));
