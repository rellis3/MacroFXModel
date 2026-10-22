// OI walls at the vol lines (forge/CONFLUENCE_LEVELS_PREREG.md, amendment). The walls come from
// OI dated two business days before the London day (oi_walls.json), so they use no price data;
// the pass level uses bars before the pass bar (checked by future-scramble).
//   node scripts/rangebook/oi_levels_build.mjs [pair]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { buildContext, scrambleFrom, passesOf } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase();
const OPTS = { sym: SYM, assetClass: assetClassFor(PAIR), tagFor: loadCalendarProxy()(SYM) };
const TOL = 0.05, FAR = 5, TY = 'oiWall';
const r3 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1000) / 1000;
function hashU(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1e6) / 1e6; }
const WALLS = JSON.parse(fs.readFileSync('analysis/output/rangebook/oi_walls.json', 'utf8'))[PAIR];

function dist(pts, line, sg, unit, shift) {
  let near = Infinity, ahead = Infinity;
  for (const x0 of pts) { const s = (x0 + shift - line) * sg / unit; near = Math.min(near, Math.abs(s)); if (s > TOL && s < ahead) ahead = s; }
  const c = v => v > FAR ? null : r3(v);
  return [c(near), c(ahead)];
}
function dayRows(ctx, di, want) {
  const d = ctx.days[di], unit = d.sigmaFrac * d.open, w = WALLS[d.date], out = [];
  if (!w || !(unit > 0)) return out;
  const shift = (hashU(d.date + '|' + TY) < 0.5 ? -1 : 1) * (0.15 + 0.35 * hashU(TY + '|' + d.date + '|m')) * unit;
  for (const p of passesOf(d)) {
    const key = `${d.date}|${p.line}|${p.pass}`; if (!want.has(key)) continue;
    const sg = LINE_SIDE[p.line] === 'up' ? 1 : -1;
    out.push({ key, f: [...dist(w, p.level, sg, unit, 0), ...dist(w, p.level, sg, unit, shift)] });
  }
  return out;
}

const S = await loadM1ForPair(PAIR);
const ctx = buildContext(S, OPTS);
const seq = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_sequence.json`, 'utf8')).passes.filter(p => !p.sameBar && WALLS[p.date]);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`));
const byKey = new Map();
ctx.days.forEach((d, di) => { if (WALLS[d.date]) for (const r of dayRows(ctx, di, want)) byKey.set(r.key, r.f); });
const rows = seq.map(p => [p.date, p.line, p.pass, ...(byKey.get(`${p.date}|${p.line}|${p.pass}`) ?? [])]).filter(r => r.length === 7);
if (rows.length < 0.95 * seq.length) { console.error(`only ${rows.length}/${seq.length} passes matched`); process.exit(3); }
{
  const idx = new Map(Array.from(S.times, (t, i) => [t, i]));
  const picks = seq.filter((_, i) => i % Math.floor(seq.length / 5) === 3).slice(0, 5);
  for (const p of picks) {
    const c2 = buildContext(scrambleFrom(S, idx.get(p.time) + 1, 71), OPTS), key = `${p.date}|${p.line}|${p.pass}`;
    const got = dayRows(c2, c2.dayIdx.get(p.date), new Set([key]))[0];
    if (!got || JSON.stringify(got.f) !== JSON.stringify(byKey.get(key))) { console.error(`LOOK-AHEAD ${key}`); process.exit(2); }
  }
  console.log(`self-check: ${picks.length} passes' wall distances identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_oiwalls.json`, JSON.stringify({ pair: SYM, cols: ['date', 'line', 'pass', TY, TY + 'A', TY + '_p', TY + 'A_p'], rows }));
const at = rows.filter(r => r[3] != null && r[3] <= TOL).length, atP = rows.filter(r => r[5] != null && r[5] <= TOL).length;
console.log(`${SYM}: ${rows.length} passes with walls; at the line ${(at / rows.length * 100).toFixed(1)}% (placebo ${(atP / rows.length * 100).toFixed(1)}%)`);
