#!/usr/bin/env node
/**
 * §6 of `MD files/EVENT_RESPONSE_BOOK.md` — the single registered confirmatory
 * cell, run verbatim from the frozen design:
 *
 *   R1_basket ~ b0 + b1*surprise_z + b2*d2y5_z + b3*(surprise_z x d2y5_z)
 *
 * on the dollar basket (the equal-weight USD series validated in
 * CB_SENTIMENT_PRICE_TEST.md Stage 1: eurusd/gbpusd/audusd/nzdusd sign-flipped,
 * usdjpy/usdcad/usdchf as-is), pooling the US high-impact families.
 *
 * PASS iff |t(b3)| >= 2, N >= 150 events, and b3 keeps its sign across the
 * 2016-2020 / 2021-2026 halves. b1 alone re-tests known territory and carries
 * no pass/fail weight.
 *
 *   node analysis/event_response/confirm_cell.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'backfill', 'event_response_events.json'), 'utf8'));

// USD is the QUOTE leg in these, so a stronger dollar shows as a lower price.
const FLIP = new Set(['eurusd', 'gbpusd', 'audusd', 'nzdusd']);
const KEEP = new Set(['usdjpy', 'usdcad', 'usdchf']);

// Pool the US families this book carries that clear the join proof.
const usFamilies = Object.entries(data.families).filter(([, f]) => f.ccy === 'USD');

const rows = [];
for (const [fk, fam] of usFamilies) {
  const byMs = new Map();
  for (const [inst, evs] of Object.entries(fam.instruments)) {
    if (!Array.isArray(evs) || (!FLIP.has(inst) && !KEEP.has(inst))) continue;
    for (const e of evs) {
      if (!Number.isFinite(e.r1) || !e.state || !Number.isFinite(e.state.d2y5)) continue;
      const usd = FLIP.has(inst) ? -e.r1 : e.r1;
      const slot = byMs.get(e.ms) ?? { legs: [], z: e.z, d2y: e.state.d2y5 };
      slot.legs.push(usd);
      byMs.set(e.ms, slot);
    }
  }
  for (const [ms, s] of byMs) {
    // The basket is only the basket when enough legs are present.
    if (s.legs.length < 5 || !Number.isFinite(s.z)) continue;
    rows.push({ fk, ms, r1: s.legs.reduce((a, b) => a + b, 0) / s.legs.length, z: s.z, d2y: s.d2y });
  }
}
rows.sort((a, b) => a.ms - b.ms);

const std = v => { const m = v.reduce((a, b) => a + b, 0) / v.length; const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)) || 1; return v.map(x => (x - m) / s); };

/** OLS with an intercept; returns coefficients and their t-stats. */
function ols(y, X) {
  const n = y.length, k = X[0].length + 1;
  const A = X.map(r => [1, ...r]);
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => A.reduce((s, r, t) => s + r[i] * y[t], 0));
  // Gauss-Jordan on [XtX | I]
  const M = XtX.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; if (!d) return null;
    for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) { if (r === c) continue; const f = M[r][c]; for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
  }
  const inv = M.map(r => r.slice(k));
  const b = inv.map((r, i) => r.reduce((s, v, j) => s + v * Xty[j], 0));
  const resid = y.map((v, t) => v - A[t].reduce((s, x, i) => s + x * b[i], 0));
  const s2 = resid.reduce((s, r) => s + r * r, 0) / (n - k);
  return b.map((coef, i) => ({ coef, t: coef / Math.sqrt(s2 * inv[i][i]) }));
}

function fit(sub, label) {
  if (sub.length < 10) { console.log(`  ${label}: n=${sub.length} — too few`); return null; }
  const z = std(sub.map(r => r.z)), d = std(sub.map(r => r.d2y));
  const res = ols(sub.map(r => r.r1), sub.map((_, i) => [z[i], d[i], z[i] * d[i]]));
  if (!res) { console.log(`  ${label}: singular`); return null; }
  const [b0, b1, b2, b3] = res;
  console.log(`  ${label.padEnd(22)} n=${String(sub.length).padStart(4)}  b1(surprise) ${b1.coef.toFixed(2)} t=${b1.t.toFixed(2)}`
    + `   b2(lead) ${b2.coef.toFixed(2)} t=${b2.t.toFixed(2)}   b3(INTERACTION) ${b3.coef.toFixed(2)} t=${b3.t.toFixed(2)}`);
  return b3;
}

console.log(`\n═══ §6 CONFIRMATORY CELL — R1_basket ~ surprise_z x lead-up_z, US families pooled`);
console.log(`Basket = equal-weight USD across ${[...FLIP, ...KEEP].join(', ')} (Stage-1 definition)\n`);
const all = fit(rows, 'ALL');
const mid = Date.parse('2021-01-01T00:00:00Z');
const early = fit(rows.filter(r => r.ms < mid), '2016-2020');
const late = fit(rows.filter(r => r.ms >= mid), '2021-2026');

const cells = {
  '|t(b3)| >= 2': all ? Math.abs(all.t) >= 2 : false,
  'N >= 150': rows.length >= 150,
  'b3 sign stable across halves': !!(early && late && Math.sign(early.coef) === Math.sign(late.coef)),
};
console.log('\n  Frozen pass conditions:');
for (const [k, v] of Object.entries(cells)) console.log(`   ${v ? 'PASS' : 'FAIL'}  ${k}`);
console.log(`\n  VERDICT: ${Object.values(cells).every(Boolean) ? 'PASS' : 'FAIL'}`);
console.log(`  Families pooled: ${[...new Set(rows.map(r => r.fk))].length}\n`);
