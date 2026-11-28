#!/usr/bin/env node
// reopened-audit-rerun 3C (forge/REOPENED_AUDIT_RERUN_PREREG.md): surprise-size, the test S7 never ran.
// WITHIN release sessions, per family x pair: does a bigger |z| surprise mean a wider release session (day0) or
// next session (r1)? OLS slope on |z| (capped at 4), i.i.d. session bootstrap, Holm across every cell.
// Same API history, families, pair map, OANDA NY-close D1 (fetchD1) and ATR14 outcomes as
// analysis/market_sense_studies.mjs S7. Fixes: NY-close session dating (NY date of t + 7h), lockbox cut 2026-08-21.
//   railway run node scripts/reopened-audit-rerun/surprise_size_within.mjs     (needs OANDA_KEY; read-only fetches)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1 } from '../../js/volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'analysis', 'output', 'reopened-audit-rerun'); fs.mkdirSync(OUT, { recursive: true });
const SEED = 20261128, B = 2000, MIN_N = 40, LOCKBOX = '2026-08-21', ZCAP = 4;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
const normSf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? p : 1 - p; };

const SYMS = ['EUR_USD', 'USD_JPY', 'GBP_USD', 'AUD_USD', 'USD_CAD'];
const T = {};
for (const sym of SYMS) {
  const b = (await fetchD1(sym, 5000)).sort((a, c) => a.date < c.date ? -1 : 1);
  const rows = b.map((x, i) => ({ i, date: x.date, h: x.high, l: x.low, c: x.close }));
  for (let i = 1; i < rows.length; i++) rows[i].tr = Math.max(rows[i].h - rows[i].l, Math.abs(rows[i].h - rows[i - 1].c), Math.abs(rows[i].l - rows[i - 1].c));
  for (let i = 14; i < rows.length; i++) rows[i].atr = rows.slice(i - 13, i + 1).reduce((s, r) => s + r.tr, 0) / 14;
  for (let i = 15; i < rows.length; i++) {
    const r = rows[i]; r.day0 = (r.h - r.l) / rows[i - 1].atr;                       // as S7: the session's range on the prior ATR
    if (rows[i + 1]) r.r1 = (rows[i + 1].h - rows[i + 1].l) / r.atr;               // as S7: next session on ATR at the setup
    r.ok = r.date <= LOCKBOX && Number.isFinite(r.day0);
  }
  T[sym] = new Map(rows.map(r => [r.date, r]));
  console.log(`${sym} ${rows.length} bars ${rows[0].date} -> ${rows.at(-1).date}`);
}

const api = await fetch('https://macrofxmodel-production.up.railway.app/api/econ-surprise?history=1').then(r => r.json());
const FAMILY = [['cpi', /\bcpi\b|consumer price|inflation rate/i], ['employment', /non-farm|nonfarm|payroll|unemployment|jobless|claims|employment change/i], ['gdp', /\bgdp\b/i], ['rate decision', /rate decision|cash rate|official bank rate|federal funds|interest rate|policy rate|refinancing/i], ['retail sales', /retail sales/i], ['pmi', /\bpmi\b|ism /i]];
const PAIR = { US: ['EUR_USD', 'USD_JPY'], GB: ['GBP_USD'], EU: ['EUR_USD'], JP: ['USD_JPY'], AU: ['AUD_USD'], CA: ['USD_CAD'] };
const nyDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms + 7 * 3600e3));
const oldDate = ms => { const t = new Date(ms); if (t.getUTCHours() >= 21) t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const rel = []; let moved = 0, total = 0;
for (const [key, list] of Object.entries(api?.series ?? {})) {
  const [ccy, name] = key.split('|'); const fam = FAMILY.find(([, re]) => re.test(name))?.[0]; if (!fam || !PAIR[ccy]) continue;
  for (const x of list) if (Number.isFinite(x.z) && x.ms) {
    const d = nyDate(x.ms); total++; if (d !== oldDate(x.ms)) moved++;
    if (d > LOCKBOX) continue;
    for (const sym of PAIR[ccy]) rel.push({ family: fam, sym, date: d, z: Math.min(ZCAP, Math.abs(x.z)) });
  }
}
console.log(`releases ${total}; session date changed by the NY-close fix: ${moved}; pair-releases to the lockbox ${rel.length}`);

function slopeOf(xs, ys) { const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return sxx > 0 ? sxy / sxx : NaN; }
const cells = [];
for (const [fam] of FAMILY) for (const sym of SYMS) {
  const by = new Map();                                   // one row per session: max |z| in this family that session
  for (const r of rel) if (r.family === fam && r.sym === sym) by.set(r.date, Math.max(by.get(r.date) ?? 0, r.z));
  for (const outcome of ['day0', 'r1']) {
    const pts = [...by].map(([d, z]) => ({ z, y: T[sym].get(d)?.ok ? T[sym].get(d)[outcome] : null })).filter(p => Number.isFinite(p.y));
    if (pts.length < MIN_N) continue;
    const xs = pts.map(p => p.z), ys = pts.map(p => p.y), b = slopeOf(xs, ys);
    const bs = []; for (let k = 0; k < B; k++) { const ix = pts.map(() => Math.floor(rnd() * pts.length)); const v = slopeOf(ix.map(i => xs[i]), ix.map(i => ys[i])); if (Number.isFinite(v)) bs.push(v); }
    const sd = Math.sqrt(bs.reduce((s, v) => s + (v - mean(bs)) ** 2, 0) / (bs.length - 1)); bs.sort((a, c) => a - c);
    const zs = [...xs].sort((a, c) => a - c), t1 = zs[Math.floor(zs.length / 3)], t2 = zs[Math.floor(2 * zs.length / 3)];
    const top = pts.filter(p => p.z >= t2).map(p => p.y), bot = pts.filter(p => p.z < t1).map(p => p.y);
    cells.push({ family: fam, sym, outcome, n: pts.length, slope: b, se: sd, t: b / sd, p: 2 * normSf(Math.abs(b / sd)), lo: bs[Math.floor(B * 0.025)], hi: bs[Math.floor(B * 0.975)],
      top_minus_bottom: top.length && bot.length ? mean(top) - mean(bot) : null, n_top: top.length, n_bottom: bot.length, mean_y: mean(ys) });
  }
}
// Holm across every scored cell
const order = cells.map((c, i) => [c.p, i]).sort((a, b) => a[0] - b[0]); let stop = false;
order.forEach(([p, i], k) => { const pass = !stop && p <= 0.05 / (cells.length - k); if (!pass) stop = true; cells[i].holm = pass; });
const passing = cells.filter(c => c.holm && c.slope > 0);
const verdict = passing.length ? 'validated' : cells.some(c => c.lo < 0 && c.hi > 0 && (c.hi > 0.05 || c.lo < -0.05)) ? 'underpowered' : 'null';
const f = v => v == null || !Number.isFinite(v) ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(3);
for (const c of cells) console.log(`${c.family.padEnd(13)} ${c.sym} ${c.outcome.padEnd(4)} n=${String(c.n).padStart(3)} slope ${f(c.slope)} [${f(c.lo)}, ${f(c.hi)}] t ${f(c.t)} top-bottom ${f(c.top_minus_bottom)}${c.holm ? '  HOLM' : ''}`);
console.log(`cells ${cells.length}; Holm passes with positive slope ${passing.length}; verdict ${verdict}`);
fs.writeFileSync(path.join(OUT, 'surprise_size.json'), JSON.stringify({ id: 'reopened-audit-rerun', part: '3C', seed: SEED, B, zcap: ZCAP, lockbox: LOCKBOX, releases: total, redated: moved, cells, verdict }, null, 1));
