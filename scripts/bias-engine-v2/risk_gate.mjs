// Bias Engine V2 risk gate G-F4 (plans/BIAS_ENGINE_V2_SPEC.md §4.4): is the one risk factor F well built? Construction
// checks only, NO price outcome is read. Uses the engine's own code (js/biasEngineV2.js riskFactorAt), data before
// 2026-08-21 (lockbox), discovery 2010-01-04 -> 2024-08-20 and confirm 2024-08-21 -> 2026-08-20.
//   (a) corr(F, PC1 of the same z's) >= 0.90 in both periods
//   (b) |mean F| <= 0.10 in both periods (drift-neutral)
//   (c) share of days F > 0 within [0.40, 0.60]
//   (d) F available on >= 95% of business days
// HY OAS is held only from 2023-10 (FRED serves ~3 years), so before then F is the labelled 3-input version.
//   node scripts/bias-engine-v2/risk_gate.mjs     -> js/biasEngineV2RiskGate.json (read by the server's V2 snapshot)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { riskFactorAt, C2 } from '../../js/biasEngineV2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCKBOX = '2026-08-21';
const PERIODS = { discovery: ['2010-01-04', '2024-08-20'], confirm: ['2024-08-21', '2026-08-20'] };
const csv = f => fs.readFileSync(path.join(ROOT, f), 'utf8').trim().split(/\r?\n/).map(l => l.split(','));
const mdy = s => { const [m, d, y] = s.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const keep = xs => xs.filter(p => p.date < LOCKBOX && Number.isFinite(p.value) && p.value > 0);
const cboe = f => keep(csv(f).slice(1).map(r => ({ date: mdy(r[0]), value: +r[4] })));
const iso = (f, col) => keep(csv(f).slice(1).map(r => ({ date: r[0].slice(0, 10), value: +r[col] })));
const hyA = iso('analysis/output/rangebook/macro/BAMLH0A0HYM2.csv', 1), hyB = iso('analysis/output/bias-engine-audit/data/BAMLH0A0HYM2.csv', 1);
const hy = [...new Map([...hyA, ...hyB].map(p => [p.date, p])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));
const series = { vix: cboe('analysis/surfaces/cboe/VIX.csv'), vix3m: cboe('analysis/surfaces/cboe/VIX3M.csv'), hy, spx: iso('analysis/output/edges-by-regime/data/GSPC.csv', 4) };

const bdays = (a, b) => { const out = []; for (let t = Date.parse(`${a}T12:00:00Z`); t <= Date.parse(`${b}T12:00:00Z`); t += 864e5) if (new Date(t).getUTCDay() % 6) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
/** PC1 of the standardised columns (correlation matrix, power iteration); returns the PC1 score per row and its share. */
function pc1(rows, keys) {
  const cols = keys.map(k => rows.map(r => r[k])), st = cols.map(c => { const m = mean(c), sd = Math.sqrt(mean(c.map(x => (x - m) ** 2))); return c.map(x => (x - m) / sd); });
  const p = keys.length, C = keys.map((_, i) => keys.map((_, j) => mean(st[i].map((x, t) => x * st[j][t]))));
  let v = Array(p).fill(1 / Math.sqrt(p));
  for (let it = 0; it < 500; it++) { const w = C.map(r => r.reduce((s, x, j) => s + x * v[j], 0)); const n = Math.hypot(...w); v = w.map(x => x / n); }
  const lam = C.map(r => r.reduce((s, x, j) => s + x * v[j], 0)).reduce((s, x, i) => s + x * v[i], 0);
  return { score: rows.map((_, t) => st.reduce((s, c, i) => s + c[t] * v[i], 0)), share: lam / p, loadings: Object.fromEntries(keys.map((k, i) => [k, +v[i].toFixed(3)])) };
}

const out = { gate: 'G-F4', spec: 'plans/BIAS_ENGINE_V2_SPEC.md §4.4', computedAt: new Date().toISOString(), lockbox: LOCKBOX, outcomesRead: false, thresholds: C2.riskGate, periods: {} };
let pass = true;
for (const [name, [a, b]] of Object.entries(PERIODS)) {
  const days = bdays(a, b), rows = [];
  for (const d of days) { const r = riskFactorAt(series, d); if (r.score != null) rows.push({ date: d, F: r.score, ...r.z, n: Object.keys(r.z).length }); }
  const Fs = rows.map(r => r.F);
  const full = rows.filter(r => ['vix', 'term', 'credit', 'equity'].every(k => Number.isFinite(r[k]))), three = rows.filter(r => ['vix', 'term', 'equity'].every(k => Number.isFinite(r[k])));
  const use = full.length >= 250 ? { rows: full, keys: ['vix', 'term', 'credit', 'equity'] } : { rows: three, keys: ['vix', 'term', 'equity'] };
  const pc = pc1(use.rows, use.keys), c = Math.abs(corr(use.rows.map(r => r.F), pc.score));
  const checks = {
    a_corrPC1: { value: +c.toFixed(4), pass: c >= C2.riskGate.corrPC1, on: `${use.rows.length} days with ${use.keys.join(', ')}`, pc1Share: +pc.share.toFixed(3), loadings: pc.loadings },
    b_meanF: { value: +mean(Fs).toFixed(4), pass: Math.abs(mean(Fs)) <= C2.riskGate.meanAbs },
    c_posShare: { value: +(Fs.filter(x => x > 0).length / Fs.length).toFixed(4), pass: (() => { const s = Fs.filter(x => x > 0).length / Fs.length; return s >= C2.riskGate.posShare[0] && s <= C2.riskGate.posShare[1]; })() },
    d_coverage: { value: +(rows.length / days.length).toFixed(4), pass: rows.length / days.length >= C2.riskGate.coverage },
  };
  const inputs = { fourInputDays: full.length, threeInputDays: rows.length - full.length };
  out.periods[name] = { from: a, to: b, businessDays: days.length, Fdays: rows.length, inputs, checks, pass: Object.values(checks).every(x => x.pass) };
  pass = pass && out.periods[name].pass;
}
out.pass = pass;
out.note = pass ? 'F passes its construction checks: F4 may be on in v2.' : 'F fails at least one construction check: F4 stays off in every variant until a revised factor passes (a new version).';
const file = path.join(ROOT, 'js/biasEngineV2RiskGate.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.periods, null, 1));
console.log(`G-F4 ${pass ? 'PASS' : 'FAIL'} -> ${path.relative(ROOT, file)}`);
