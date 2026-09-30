// EURUSD combination test (forge/COMBO_EURUSD_PREREG.md): approach model × day-size model
// × forecast-range target. Reads the walk-forward predictions exported by model.py
// (eurusd_pred_q75.json) and approach_score.py (eurusd_pred_pass.json).
//   node scripts/rangebook/combo_test.mjs > analysis/output/rangebook/eurusd_COMBO_RESULTS.md
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, passesOf, targets, race } from './common.mjs';

const HL75_OVER_50 = 1.8877 / 1.4417;                       // EURUSD fitted hl widths
const q75 = JSON.parse(fs.readFileSync('analysis/output/rangebook/eurusd_pred_q75.json', 'utf8'));
const pp = JSON.parse(fs.readFileSync('analysis/output/rangebook/eurusd_pred_pass.json', 'utf8'));
const COST = costForPair('eurusd', 'fx');
const ctx = buildContext(await loadM1ForPair('eurusd'), { sym: 'EURUSD', assetClass: 'fx', tagFor: loadCalendarProxy()('EURUSD') });

function followR(rc, dc, df, unit, costSig) {
  const lm = rc.lastMove / unit;
  const g = rc.outcome === 'cont' ? dc / df : (rc.outcome === 'fade' || rc.outcome === 'both') ? -1 : Math.max(-1, Math.min(dc / df, lm / df));
  return g - costSig / df;
}

const rows = [];
for (const d of ctx.days) {
  const q = q75[d.date];
  if (q == null) continue;
  const unit = d.sigmaFrac * d.open, bars = d.bars, costSig = COST / 100 * d.open / unit;
  const fRange = Math.exp(q) * d.ladder.hl.p50 / 100 * d.open;          // forecast day range in price
  for (const p of passesOf(d)) {
    const pr = pp[`${d.date}|${p.line}|${p.pass}`];
    if (!pr) continue;                                                   // not a scored (non-same-bar) pass
    const up = LINE_SIDE[p.line] === 'up';
    const tg = targets(d, p.line, p.level, p.hiB, p.loB);
    if (!tg) continue;
    const dc = Math.abs(tg.cont - p.level) / unit, df = Math.abs(p.level - tg.fade) / unit;
    const fT = up ? p.loB + fRange : p.hiB - fRange;                     // Proj-style forecast target
    const dcF = up ? (fT - p.level) / unit : (p.level - fT) / unit;
    const rNext = followR(race(bars, p.k, up, p.level, tg), dc, df, unit, costSig);
    const rFore = dcF > 0 ? followR(race(bars, p.k, up, p.level, { cont: fT, fade: tg.fade }), dcF, df, unit, costSig) : null;
    rows.push({ year: +d.date.slice(0, 4), go: pr[0] - pr[1] >= 0.05, big: q > Math.log(HL75_OVER_50), rNext, rFore, dcF, df });
  }
}

const st = xs => { const n = xs.length; if (n < 2) return { m: NaN, t: NaN, n }; const m = xs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { m, t: m / sd * Math.sqrt(n), n }; };
const f = x => (x >= 0 ? '+' : '') + x.toFixed(3);
const RULES = [
  ['A', 'all passes', 'next line', r => true, 'rNext'],
  ['B', 'approach says go', 'next line', r => r.go, 'rNext'],
  ['C', 'big day', 'forecast range', r => r.big, 'rFore'],
  ['D', 'approach says go AND big day', 'forecast range', r => r.go && r.big, 'rFore'],
  ['E', 'approach says go AND big day', 'next line', r => r.go && r.big, 'rNext'],
];
console.log('# EURUSD combination test — results\n');
console.log(`Rule: forge/COMBO_EURUSD_PREREG.md. Walk-forward predictions, test years 2023–2026 (to 2026-08-20). ${rows.length} passes; `
  + `approach says go on ${rows.filter(r => r.go).length}, big day on ${rows.filter(r => r.big).length}, both on ${rows.filter(r => r.go && r.big).length}. `
  + 'Follow trades, stop at the line behind, net of spread, R = stop distance.\n');
console.log('| rule | condition | target | trades | win % | net R | t | 2023 | 2024 | 2025 | 2026 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
let verdict = null;
for (const [id, cond, tgt, sel, key] of RULES) {
  const xs = rows.filter(sel).map(r => r[key]).filter(x => x != null);
  const s = st(xs), yrs = [2023, 2024, 2025, 2026].map(y => st(rows.filter(r => r.year === y && sel(r)).map(r => r[key]).filter(x => x != null)));
  console.log(`| ${id === 'D' ? '**D**' : id} | ${cond} | ${tgt} | ${s.n} | ${(100 * xs.filter(x => x > 0).length / (s.n || 1)).toFixed(0)}% | ${f(s.m)} | ${s.t.toFixed(1)} | ${yrs.map(y => y.n ? `${f(y.m)} (${y.n})` : '–').join(' | ')} |`);
  if (id === 'D') verdict = s.m > 0 && s.t >= 2 && yrs.filter(y => y.m > 0).length >= 3;
}
const dd = rows.filter(r => r.go && r.big && r.dcF > 0);
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`\nRule D geometry: median distance to the forecast target ${med(dd.map(r => r.dcF)).toFixed(2)}σ, median stop ${med(dd.map(r => r.df)).toFixed(2)}σ.`);
console.log(`\n**Verdict (rule D): ${verdict ? 'PASS' : 'FAIL'}**`);
