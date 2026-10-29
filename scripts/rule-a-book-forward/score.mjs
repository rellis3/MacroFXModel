// rule-a-book-forward (forge/RULE_A_BOOK_FORWARD_PREREG.md): score the forward record of rule A on the chosen v3 lines
// beside the CFD portfolio book, as one combined book. Read-only; refits nothing.
//
//   node scripts/rule-a-book-forward/score.mjs            # interim read (descriptive, no verdict)
//   FINAL=1 node scripts/rule-a-book-forward/score.mjs    # the judgement run (after 2027-10-29 and >= 200 common weekdays)
//
// Rule A: GET /api/paper-record (KV paper_record_v1), arm `chosen`, 0.2σ/5R (2× spread already in R).
// Book: scripts/portfolio-book/build.mjs buildPortfolio() rebuilt to today from the feature store (refresh it first),
// sleeves S1g S2 S3g S4, days after 2026-08-21. Outputs analysis/output/rule-a-book-forward/{results.json, interim.json}.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPortfolio } from '../portfolio-book/build.mjs';
import { UNIT } from '../../js/portfolioBook.js';
import { costForPair } from '../../js/perLineStrategy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'analysis', 'output', 'rule-a-book-forward');
const API = process.env.PAPER_API ?? 'https://macrofxmodel-production.up.railway.app/api/paper-record';
const SEED = 20261027, B = 2000, BLOCK = 20, BOOK_FROM = '2026-08-22', JUDGE = '2027-10-29', MIN_DAYS = 200;
const SD_A = 3.9432092127359453, SD_B = 0.001552971959820474;               // backtest daily SDs, frozen in the prereg
const CL_W = { AUDUSD: 1.375, GBPUSD: 1.375, GOLD: 1.375, US2000: 1.375, USDCAD: 1.375, USDJPY: 1.375,
               EURUSD: 0.6875, USDCHF: 0.6875, NQ: 0.4583, SPX500: 0.4583, US30: 0.4583 };
const SYM = { eurusd: 'EURUSD', gbpusd: 'GBPUSD', audusd: 'AUDUSD', usdcad: 'USDCAD', usdchf: 'USDCHF', usdjpy: 'USDJPY',
              gold: 'GOLD', nq: 'NQ', spx: 'SPX500', dow: 'US30', us2000: 'US2000' };
const CELL = '0.2σ/5R', FX_CLASS = k => (['nq', 'spx', 'dow', 'us2000'].includes(k) ? 'index' : k === 'gold' ? 'metal' : 'fx');

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const sharpe = a => (a.length > 2 && sd(a) > 0 ? mean(a) / sd(a) * Math.sqrt(252) : null);
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function blockBoot(n, f, seed) {                                    // f(idx) -> statistic; moving blocks of BLOCK days
  const r = rng(seed), out = [];
  for (let b = 0; b < B; b++) { const idx = []; while (idx.length < n) { const s = Math.floor(r() * Math.max(1, n - BLOCK + 1)); for (let k = 0; k < BLOCK && idx.length < n; k++) idx.push(s + k); } out.push(f(idx)); }
  out.sort((x, y) => x - y); return [out[Math.floor(0.025 * B)], out[Math.floor(0.975 * B)]];
}
const weekdays = (from, to) => { const o = []; const d = new Date(from + 'T12:00:00Z'); while (d.toISOString().slice(0, 10) <= to) { if (![0, 6].includes(d.getUTCDay())) o.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return o; };

// ── rule A streams from the live record ──
const rec = await (await fetch(API)).json();
const days = Object.entries(rec.days ?? {}).filter(([, d]) => d.chosen && d.final).sort(([a], [b]) => a.localeCompare(b));
if (!days.length) { console.log('no finished day with the chosen arm yet'); process.exit(0); }
const start = days[0][0], end = days.at(-1)[0];
const A = {}, ACL = {}, V4 = {}, trades = [], v4trades = [], late = [];
for (const [date, d] of days) {
  for (const t of d.chosen.trades ?? []) {
    const v = t.variants?.[CELL]; if (!t.done || v?.R == null) continue;
    trades.push({ date, inst: SYM[t.inst], R: v.R });
    A[date] = (A[date] ?? 0) + v.R; ACL[date] = (ACL[date] ?? 0) + v.R * (CL_W[SYM[t.inst]] ?? 1);
  }
  for (const [k, L] of Object.entries(d.chosen.ladders ?? {})) if (L.capturedAt && L.capturedAt.slice(0, 10) >= date && new Date(L.capturedAt) > new Date(date + 'T00:05:00Z')) late.push(`${date} ${k}`);
  for (const t of d.trades ?? []) {                                   // MIRROR: the v4 arm, costs raised to 2×
    const v = t.variants?.[CELL]; if (!t.done || v?.R == null) continue;
    const risk = Math.abs(t.entry - v.stop), extra = risk > 0 ? costForPair(t.inst, FX_CLASS(t.inst)) / 100 * t.entry / risk : 0;
    v4trades.push({ date, R: v.R - extra }); V4[date] = (V4[date] ?? 0) + v.R - extra;
  }
}

// ── book stream, rebuilt to the last finished day ──
const { dates, sleeves } = await buildPortfolio({ sample: { from: '2008-01-02', to: end, isEnd: '2018-01-01' }, sleeveIds: ['S1g', 'S2', 'S3g', 'S4'] });
const Bk = {};
dates.forEach((dt, i) => { if (dt < BOOK_FROM) return; let s = 0; for (const id of ['S1g', 'S2', 'S3g', 'S4']) s += sleeves[id].legs.reduce((a, l) => a + l.c[i], 0) / UNIT; Bk[dt] = s / 4; });

const cal = weekdays(start, end).filter(d => d in Bk);
const a = cal.map(d => A[d] ?? 0), acl = cal.map(d => ACL[d] ?? 0), b = cal.map(d => Bk[d]);
const K = cal.map((d, i) => 0.5 * a[i] / SD_A + 0.5 * b[i] / SD_B);
const n = cal.length, Rs = trades.map(t => t.R);
const cnt = cal.map(d => trades.filter(t => t.date === d).length);
const out = {
  prereg: 'forge/RULE_A_BOOK_FORWARD_PREREG.md', seed: SEED, scoredAt: new Date().toISOString(), window: [start, end], commonWeekdays: n,
  ruleA: { trades: Rs.length, netR: Rs.length ? mean(Rs) : null, ci95: Rs.length > 20 ? blockBoot(n, idx => { const s = idx.reduce((x, i) => x + a[i], 0); const c = idx.reduce((x, i) => x + cnt[i], 0); return c ? s / c : 0; }, SEED) : null,
           byInstrument: Object.fromEntries(Object.values(SYM).map(s => { const r = trades.filter(t => t.inst === s).map(t => t.R); return [s, r.length ? [r.length, +mean(r).toFixed(3)] : [0, null]]; })) },
  mirrorV4: { trades: v4trades.length, netR_2x: v4trades.length ? mean(v4trades.map(t => t.R)) : null },
  F1: n > 20 ? { corr: corr(a, b), ci95: blockBoot(n, idx => corr(idx.map(i => a[i]), idx.map(i => b[i])), SEED + 1) } : null,
  sharpe: { ruleA: sharpe(a), ruleA_clustersOnly: sharpe(acl), book: sharpe(b), combined: sharpe(K) },
  bookDaysSinceCutoff: Object.keys(Bk).length, lateLadderCaptures: late,
};
const ready = end >= JUDGE && n >= MIN_DAYS;
if (process.env.FINAL === '1') {
  if (!ready) { console.log(`not judgeable yet: ${n} common weekdays to ${end} (needs ${MIN_DAYS} and ${JUDGE})`); process.exit(1); }
  out.verdicts = {
    'rule-a-book-forward-corr': out.F1.ci95[1] < 0.20 ? 'VALIDATED' : 'NULL',
    'rule-a-book-forward-ruleA': out.ruleA.ci95[0] > 0 ? 'VALIDATED' : out.ruleA.netR > 0 ? 'UNDERPOWERED' : (out.ruleA.ci95[1] < 0.162 ? 'NULL' : 'UNDERPOWERED'),
  };
}
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, process.env.FINAL === '1' ? 'results.json' : 'interim.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
