// Layer 4 — PATH MAP builder (forge/PATH_MAP_SPEC.md). One row per first touch of a HAR-800 line per session.
// Read-only research: OANDA M1 cache, the production-path HAR sigma (scripts/rangebook/har800_sigma.mjs output) and
// the HAR shadow widths. Writes analysis/output/path_map/<SYM>.csv.
//   node scripts/pathmap/path_map_build.mjs [fileKey:SYM ...]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { HAR800_PARAMS } from '../../js/forecastLadderParamsHar800.js';

const OUT = 'analysis/output/path_map', SIG = 'analysis/output/ladder_candidates/d1';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => `${k}:${k.toUpperCase()}`), 'gold:GOLD', 'nq:NQ', 'spx500:SPX500', 'us30:US30', 'us2000:US2000', 'de30:DE30', 'uk100:UK100'];
const JOBS = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT).map(a => a.split(':'));
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
const RUNGS = ['p50', 'p75', 'p90'], HELD = 0.25;
const calendar = loadCalendarProxy();
const r5 = x => Math.round(x * 1e5) / 1e5;
const londonHour = sec => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(new Date(sec * 1000)) % 24;
fs.mkdirSync(OUT, { recursive: true });
// Deterministic per instrument-session RNG (FNV-1a seed → LCG), so the placebo ladders are reproducible.
function seeded(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => ((h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

function harSeries(sym) {
  const rows = fs.readFileSync(`${SIG}/${sym}_har800.csv`, 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
  return rows.map(([d, s]) => [d, +s]).filter(([, s]) => s > 0);       // [NY session end date, annual %]
}

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  const p = HAR800_PARAMS.pairs[SYM];
  if (!p) { console.log(`${SYM}: no HAR params`); continue; }
  const har = harSeries(SYM);
  const packed = await loadM1ForPair(key);
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const tag = calendar(SYM === 'US30' ? 'DOW' : SYM);
  const cls = INDICES.has(SYM) ? 'index' : SYM === 'GOLD' ? 'gold' : MAJORS.has(SYM) ? 'major' : 'cross';
  const out = ['inst,cls,date,kind,factor,side,rung,hour,event,sig,sigRel,used,other,approach,prevlvl,a,b,a2,b2,race,next,back,held,mins'];
  let j = 0, prevHi = null, prevLo = null; const hist = [];
  for (const date of [...sessions.keys()].sort()) {
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const bars = sessions.get(date);
    if (!bars || bars.length < 600) continue;
    while (j < har.length && har[j][0] < date) { hist.push(har[j][1]); j++; }
    let dayHi = -Infinity, dayLo = Infinity;
    for (const b of bars) { if (b.high > dayHi) dayHi = b.high; if (b.low < dayLo) dayLo = b.low; }
    const pHi = prevHi, pLo = prevLo; prevHi = dayHi; prevLo = dayLo;
    if (!hist.length) continue;
    const sigAnn = hist[hist.length - 1], sig = sigAnn / Math.sqrt(252);          // daily σ, %
    const prior = hist.slice(-251, -1);
    let sigRel = null;
    if (prior.length >= 120) { const s = [...prior].sort((x, y) => x - y); sigRel = sigAnn / s[s.length >> 1]; }
    const ev = tag(date);
    const event = ev == null ? 'unknown' : ['FOMC', 'NFP', 'CPI'].includes(ev) ? 'tier1' : ev === 'high' ? 'high' : 'none';
    const o = bars[0].open, unit = sig / 100 * o, hl50 = p.width.hl[0] * sig / 100 * o;
    // Real ladder (factor 1) plus two placebo ladders (Amendment 2): every width × f, f ~ U([0.70,0.90] ∪ [1.10,1.30]).
    const rnd = seeded(`${SYM}|${date}`);
    const ladders = [['real', 1], ...[0, 1].map(() => { const u = rnd(); return ['placebo', u < 0.5 ? 0.70 + 0.4 * u : 1.10 + 0.4 * (u - 0.5)]; })];
    for (const [kind, f] of ladders) {
      const pct = (q, i) => p.width[q][i] * sig * f;
      const lvl = { up: RUNGS.map((_, i) => o * (1 + pct('oh', i) / 100)), dn: RUNGS.map((_, i) => o * (1 - pct('ol', i) / 100)) };
      for (const side of ['up', 'dn']) {
        const L = lvl[side], opp = lvl[side === 'up' ? 'dn' : 'up'][0], up = side === 'up';
        for (let i = 0; i < 3; i++) {
          const line = L[i];
          const next = i < 2 ? L[i + 1] : L[2] + (L[2] - L[1]);
          const back = i === 0 ? o : L[i - 1];
          let k = -1, hi = o, lo = o, other = 0;
          for (let x = 0; x < bars.length; x++) {
            const b = bars[x];
            if (up ? b.high >= line : b.low <= line) { k = x; break; }
            if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low;
            if (up ? b.low <= opp : b.high >= opp) other = 1;
          }
          if (k < 0) continue;
          const used = (Math.max(hi, bars[k].high) - Math.min(lo, bars[k].low)) / hl50;
          let race = 'none', mins = '', gotNext = 0, gotBack = 0;
          for (let x = k + 1; x < bars.length; x++) {
            const b = bars[x];
            const n = up ? b.high >= next : b.low <= next, bk = up ? b.low <= back : b.high >= back;
            if (n) gotNext = 1; if (bk) gotBack = 1;
            if (race === 'none' && (n || bk)) { race = n && bk ? 'both' : n ? 'cont' : 'fade'; mins = Math.round((b.time - bars[k].time) / 60); }
            if (gotNext && gotBack) break;
          }
          const c = bars[k].close;                 // where the race actually starts (Amendment 1)
          const ext = up ? dayHi : dayLo;
          const held = (up ? ext - line : line - ext) <= HELD * unit ? 1 : 0;
          const approach = Math.abs(c - bars[Math.max(0, k - 30)].close) / unit;
          const ref = up ? pHi : pLo;
          const prevlvl = ref == null ? '' : Math.abs(line - ref) <= 0.15 * unit ? 1 : 0;
          out.push([SYM, cls, date, kind, Math.round(f * 1000) / 1000, side, RUNGS[i], londonHour(bars[k].time), event, r5(sig),
            sigRel == null ? '' : r5(sigRel), r5(used), other, r5(approach), prevlvl,
            r5(Math.abs(next - line) / unit), r5(Math.abs(line - back) / unit),
            r5(Math.max(1e-4, (up ? next - c : c - next) / unit)), r5(Math.max(1e-4, (up ? c - back : back - c) / unit)),
            race, gotNext, gotBack, held, mins].join(','));
        }
      }
    }
  }
  fs.writeFileSync(`${OUT}/${SYM}.csv`, out.join('\n') + '\n');
  console.log(`${SYM}: ${out.length - 1} touches (real + placebo), ${Math.round((Date.now() - t0) / 1000)} s`);
}
