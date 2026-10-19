/**
 * forge/CREDIT_LEADS_EQUITIES_PREREG.md — does credit move before equities?
 *
 *   node analysis/harness/credit_leads_equities.mjs
 *
 * Direction cells run through runStudy (IC of −z against forward log return, date-clustered
 * bootstrap, pooled NAS100 + SPX500). Vol cells use the same signal rows and the same bootstrap
 * brick against forward-minus-trailing realised vol, computed here from the store's closes
 * (the harness scores returns; a vol target is not yet one of its fixed targets, so it is built
 * from the same bricks beside it rather than bolted on unregistered). BH-FDR 10% across the 12
 * scored cells; the 60-session-lagged placebo per cell; HY OAS cells reported, not scored.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openStore } from '../../js/harness/features.mjs';
import { runStudy, OUTPUT_DIR } from '../../js/harness/runStudy.mjs';
import { clusteredBlockBootstrap, clusterBy, bhFdr, spearman, stdev } from '../../js/harness/stats.mjs';

const store = await openStore();
const UNIVERSE = ['nas100', 'spx500'];
const SPREADS = {
  'baa-aaa': { legs: ['credit_baa10y', 'credit_aaa10y'], scored: true, sample: { from: '2004-01-01', to: '2026-10-16', isEnd: '2016-01-01' } },
  'baa10y':  { legs: ['credit_baa10y'],                  scored: true, sample: { from: '2004-01-01', to: '2026-10-16', isEnd: '2016-01-01' } },
  'hy-oas':  { legs: ['credit_hy_oas'],                  scored: false, sample: { from: '2023-12-01', to: '2026-10-16', isEnd: '2024-01-01' } },
};
const HORIZONS = [1, 5, 20];
const PLACEBO_LAG = 60;

// ── spread series (latest value knowable at each close) and the z of its 20-session change ──
async function spreadSeries(legs) {
  const a = await store.series(legs[0]);
  const m = new Map(a.map(r => [String(r.date), Number(r.value)]));
  if (legs[1]) { const b = new Map((await store.series(legs[1])).map(r => [String(r.date), Number(r.value)])); for (const [d, v] of m) m.set(d, b.has(d) ? v - b.get(d) : NaN); }
  const dates = [...m.keys()].sort(), vals = dates.map(d => m.get(d));
  const z = new Array(dates.length).fill(NaN);
  for (let i = 270; i < dates.length; i++) {
    const ch = vals[i] - vals[i - 20];
    const hist = []; for (let k = i - 250; k < i; k++) if (Number.isFinite(vals[k]) && Number.isFinite(vals[k - 20])) hist.push(vals[k] - vals[k - 20]);
    const sd = hist.length >= 100 ? stdev(hist, 1) : NaN;
    z[i] = sd > 0 && Number.isFinite(ch) ? ch / sd : NaN;
  }
  // knowable at D 22:00Z: the row dated D (close+1h). Signal lookup by date; placebo = z from 60 rows earlier.
  const byDate = new Map(), byDateLag = new Map();
  dates.forEach((d, i) => { byDate.set(d, z[i]); byDateLag.set(d, i >= PLACEBO_LAG ? z[i - PLACEBO_LAG] : NaN); });
  return { byDate, byDateLag, dates };
}
// latest z knowable at date d (credit prints the same day; a missing day forward-fills from the last print)
function lookup(map, dates, d) { let lo = 0, hi = dates.length - 1, best = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= d) { best = mid; lo = mid + 1; } else hi = mid - 1; } return best < 0 ? NaN : map.get(dates[best]); }

// ── realised-vol target from closes ──
const PX = {};
for (const inst of UNIVERSE) { const rows = await store.series(`px_d1_${inst}`); PX[inst] = { dates: rows.map(r => String(r.date)), closes: rows.map(r => Number(r.value)) }; }
function volTargetRows(inst, h) {
  const { dates, closes } = PX[inst];
  const lr = closes.map((c, i) => (i ? Math.log(c / closes[i - 1]) : NaN));
  const rv = (a, b) => { const x = lr.slice(a, b).filter(Number.isFinite); return x.length >= Math.max(1, Math.ceil((b - a) * 0.8)) ? Math.log(Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length) + 1e-12) : NaN; };
  const out = new Map();
  for (let i = 21; i + h < dates.length; i++) { const fwd = rv(i + 1, i + h + 1), trail = rv(i - 19, i + 1); if (Number.isFinite(fwd) && Number.isFinite(trail)) out.set(dates[i], fwd - trail); }
  return out;
}

const cells = [];
for (const [sk, sp] of Object.entries(SPREADS)) {
  const S = await spreadSeries(sp.legs);
  for (const h of HORIZONS) {
    for (const placebo of [false, true]) {
      const src = placebo ? S.byDateLag : S.byDate;
      const key = `${sk}-h${h}${placebo ? '-placebo' : ''}`;
      const res = await runStudy({
        id: `credit-leads-equities-${key}`, doc: 'forge/CREDIT_LEADS_EQUITIES_PREREG.md', domain: 'macro',
        universe: UNIVERSE, horizonDays: h, rebalanceDays: 1, sample: sp.sample, primary: 'ic',
        signal: (f, t, inst) => { const z = lookup(src, S.dates, t.slice(0, 10)); return Number.isFinite(z) ? { score: -z, pos: Math.max(-1, Math.min(1, -z / 2)) } : null; },
      }, { store, write: false });
      const c = res.cells[0];
      // vol target on the same decision dates: rows {date, inst, x: z, y: fwdVol − trailVol}
      const volRows = [];
      for (const inst of UNIVERSE) { const vt = volTargetRows(inst, h); for (const [d, y] of vt) { if (d < sp.sample.from || d > sp.sample.to) continue; const z = lookup(src, S.dates, d); if (Number.isFinite(z)) volRows.push({ date: d, inst, x: z, y, oos: d >= sp.sample.isEnd }); } }
      const oos = volRows.filter(r => r.oos).sort((a, b) => a.date.localeCompare(b.date));
      const stat = rows => spearman(rows.map(r => r.x), rows.map(r => r.y));
      const vb = clusteredBlockBootstrap(clusterBy(oos, r => r.date), stat, { meanBlock: 5 * Math.ceil(h / 5), nBoot: 1000 });
      const mid = [...new Set(oos.map(r => r.date))].sort(); const m = mid[Math.floor(mid.length / 2)];
      const half = rows => (rows.length >= 30 ? +stat(rows).toFixed(4) : null);
      cells.push(
        { key: `${key}-dir`, spread: sk, h, placebo, target: 'dir', scored: sp.scored && !placebo, expectSign: +1,   // score is −z: widening → lower return ⇒ IC(−z, r) > 0
          ic: c.ic.oos.ok ? c.ic.oos.obs : null, ci95: c.ic.oos.ci95 ?? null, p: c.ic.oos.pValue ?? null, halves: [c.ic.oosHalves.firstHalf, c.ic.oosHalves.secondHalf], n: c.ic.nRowsOos, nDates: c.ic.nDatesOos, pnlSharpeOos: c.pnl.sharpeOos, dependence: res.dependence?.pc1Share },
        { key: `${key}-vol`, spread: sk, h, placebo, target: 'vol', scored: sp.scored && !placebo, expectSign: +1,
          ic: vb.ok ? vb.obs : null, ci95: vb.ci95 ?? null, p: vb.pValue ?? null, halves: [half(oos.filter(r => r.date < m)), half(oos.filter(r => r.date >= m))], n: oos.length, nDates: mid.length },
      );
      process.stderr.write(`${key}: dir IC ${c.ic.oos.obs} p ${c.ic.oos.pValue} | vol IC ${vb.obs} p ${vb.pValue}\n`);
    }
  }
}

// ── bars ──
const scored = cells.filter(c => c.scored);
const fdr = bhFdr(scored.map(c => c.p), 0.10);
scored.forEach((c, i) => { c.passesFdr = fdr.pass[i]; });
const placeboOf = c => cells.find(x => x.spread === c.spread && x.h === c.h && x.target === c.target && x.placebo);
for (const c of scored) {
  const pl = placeboOf(c);
  const placeboPasses = pl && pl.p != null && pl.p < 0.05 && Math.sign(pl.ic) === c.expectSign;
  c.placeboPasses = !!placeboPasses;
  c.pass = c.p != null && c.p < 0.05 && c.passesFdr && Math.sign(c.ic) === c.expectSign && c.halves.every(v => v != null && Math.sign(v) === c.expectSign) && !placeboPasses;
}
const dirPass = scored.filter(c => c.pass && c.target === 'dir' && c.h >= 5), volPass = scored.filter(c => c.pass && c.target === 'vol' && c.h >= 5);
const verdict = dirPass.length && volPass.length ? 'validated' : volPass.length ? 'context' : 'null';
const out = { id: 'credit-leads-equities', ranAt: new Date().toISOString(), verdict, fdr: { q: fdr.q, m: fdr.m, rejected: fdr.k, threshold: fdr.threshold }, cells };
await writeFile(path.join(OUTPUT_DIR, 'credit-leads-equities.json'), JSON.stringify(out, null, 1));
const f = v => (v == null ? '—' : typeof v === 'number' ? v.toFixed(v === Math.round(v) ? 0 : 4) : String(v));
console.log(`verdict: ${verdict} · BH 10% across ${fdr.m}: ${fdr.k} rejected (threshold ${fdr.threshold})`);
console.log('cell'.padEnd(26), 'IC'.padStart(8), 'CI95'.padStart(20), 'p'.padStart(7), 'halves'.padStart(18), 'n'.padStart(6), 'FDR', 'placebo?', 'PASS');
for (const c of cells) console.log(c.key.padEnd(26), f(c.ic).padStart(8), (c.ci95 ? `[${c.ci95.join(', ')}]` : '—').padStart(20), f(c.p).padStart(7), `${f(c.halves?.[0])} / ${f(c.halves?.[1])}`.padStart(18), String(c.n).padStart(6), c.scored ? (c.passesFdr ? 'pass' : 'fail') : '   ', c.scored ? (c.placeboPasses ? 'YES' : 'no') : (c.placebo ? '(placebo)' : '(descr.)'), c.scored ? (c.pass ? 'PASS' : '') : '');
