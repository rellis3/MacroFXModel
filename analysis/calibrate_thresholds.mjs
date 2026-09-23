#!/usr/bin/env node
/**
 * How high does a threshold have to be before a "finding" is actually rare?
 *
 * The board carries 50 tiles and 20 links. Testing 50 things a day against a fixed
 * |z| >= 1.5 means SOMETHING clears it essentially every session -- measured: the
 * `extreme` finding fired on 96% of days. That is a multiple-comparisons problem,
 * not a market observation.
 *
 * So: take the historical distribution of the board's own MAXIMUM |z| and read the
 * threshold off it at a chosen base rate. "Rare" then means rare for a board of
 * this width, which is the only definition that survives adding more tiles.
 */
import { scanBoard, scanLinks } from '../js/marketScan.js';
const B = await (await fetch('https://macrofxmodel-production.up.railway.app/api/drill-series')).json();
const N = B.dates.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };

for (const WIN of [1, 5, 20]) {
  const maxZ = [], maxL = [];
  for (let i = 800; i < N - 1; i += 2) {
    const bd = scanBoard(B, i, WIN);
    if (bd.length < 20) continue;
    maxZ.push(Math.max(...bd.map(r => Math.abs(r.z))));
    const lk = scanLinks(B, i, WIN).filter(l => !l.weak);
    if (lk.length) maxL.push(Math.max(...lk.map(l => Math.abs(l.z))));
  }
  const line = (name, a) => `  ${name}  n=${a.length}  median ${q(a,.5).toFixed(2)}  p75 ${q(a,.75).toFixed(2)}  p85 ${q(a,.85).toFixed(2)}  p90 ${q(a,.90).toFixed(2)}  p95 ${q(a,.95).toFixed(2)}`;
  console.log(`\n── window ${WIN} ──`);
  console.log(line('board max|z|', maxZ));
  console.log(line('link  max|z|', maxL));
  console.log(`  share of days the CURRENT thresholds fire: board |z|>=1.5 ${(maxZ.filter(v=>v>=1.5).length/maxZ.length*100).toFixed(0)}% · link |z|>=1.8 ${(maxL.filter(v=>v>=1.8).length/maxL.length*100).toFixed(0)}%`);
}
