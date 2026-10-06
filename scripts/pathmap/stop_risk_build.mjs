// Layer 7 — STOP RISK MAP builder (forge/STOP_RISK_PREREG.md). Read-only research on the OANDA M1 cache.
// 4 random entries per London session, long AND short, stops at d × HAR σ; held to the stop or 1,440 M1 bars (24 h of
// trading time, so Friday entries cross the weekend). A stop bar that
// OPENS beyond the stop fills at its open (gap-through), otherwise at the stop. Writes analysis/output/stop_risk/<SYM>.csv.
//   node scripts/pathmap/stop_risk_build.mjs [fileKey:SYM ...]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';

const OUT = 'analysis/output/stop_risk', SIG = 'analysis/output/ladder_candidates/d1';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => `${k}:${k.toUpperCase()}`), 'gold:GOLD', 'nq:NQ', 'spx500:SPX500', 'us30:US30', 'us2000:US2000', 'de30:DE30', 'uk100:UK100'];
const JOBS = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT).map(a => a.split(':'));
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
const DS = [0.25, 0.5, 1.0, 1.5, 2.0], ENTRIES = 4, HOLD_BARS = 1440, WKND_GAP = 6 * 3600;   // 24 h of TRADING time (Amendment 1)
const calendar = loadCalendarProxy();
const r4 = x => Math.round(x * 1e4) / 1e4;
fs.mkdirSync(OUT, { recursive: true });
function seeded(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => ((h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const londonDateOf = sec => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(sec * 1000));

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  const har = fs.readFileSync(`${SIG}/${SYM}_har800.csv`, 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).map(([d, s]) => [d, +s]).filter(([, s]) => s > 0);
  const P = await loadM1ForPair(key);
  const { times: T, opens: O, highs: H, lows: L, closes: C, n } = P;
  const sessions = bucketM1IntoSessions(P, 'Europe/London');
  const tag = calendar(SYM === 'US30' ? 'DOW' : SYM);
  const cls = INDICES.has(SYM) ? 'index' : SYM === 'GOLD' ? 'gold' : MAJORS.has(SYM) ? 'major' : 'cross';
  const out = ['inst,cls,date,event,d,side,hit,lossR,gap,wknd,xsess,hitMin'];
  const idxOf = t => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m + 1; else hi = m; } return lo; };
  let j = 0; let sig = null;
  for (const date of [...sessions.keys()].sort()) {
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const bars = sessions.get(date);
    if (!bars || bars.length < 600) continue;
    while (j < har.length && har[j][0] < date) { sig = har[j][1] / Math.sqrt(252) / 100; j++; }
    if (!(sig > 0)) continue;
    const ev = tag(date);
    const event = ev == null ? 'unknown' : ['FOMC', 'NFP', 'CPI'].includes(ev) ? 'tier1' : ev === 'high' ? 'high' : 'none';
    const rnd = seeded(`${SYM}|${date}|stop`);
    for (let e = 0; e < ENTRIES; e++) {
      const b = bars[Math.floor(rnd() * (bars.length - 1))];
      const i = idxOf(b.time), E = C[i], endK = Math.min(n - 1, i + HOLD_BARS);
      // per side × d: [hit, fill, gap, hitIndex]
      const st = { long: DS.map(d => ({ stop: E * (1 - d * sig), d: d * sig * E, hit: false })),
                   short: DS.map(d => ({ stop: E * (1 + d * sig), d: d * sig * E, hit: false })) };
      let wknd = false, open = DS.length * 2;
      for (let k = i + 1; k <= endK && open > 0; k++) {
        if (T[k] - T[k - 1] > WKND_GAP) wknd = true;
        for (const s of st.long) if (!s.hit && L[k] <= s.stop) { s.hit = true; s.gap = O[k] < s.stop; s.fill = s.gap ? O[k] : s.stop; s.k = k; s.wk = wknd; open--; }
        for (const s of st.short) if (!s.hit && H[k] >= s.stop) { s.hit = true; s.gap = O[k] > s.stop; s.fill = s.gap ? O[k] : s.stop; s.k = k; s.wk = wknd; open--; }
      }
      for (const side of ['long', 'short']) st[side].forEach((s, di) => {
        if (!s.hit) { out.push([SYM, cls, date, event, DS[di], side, 0, '', '', wknd ? 1 : 0, '', ''].join(',')); return; }
        const loss = side === 'long' ? (E - s.fill) / s.d : (s.fill - E) / s.d;
        out.push([SYM, cls, date, event, DS[di], side, 1, r4(loss), s.gap ? 1 : 0, s.wk ? 1 : 0,
          londonDateOf(T[s.k]) > date ? 1 : 0, new Date(T[s.k] * 1000).getUTCMinutes()].join(','));
      });
    }
  }
  fs.writeFileSync(`${OUT}/${SYM}.csv`, out.join('\n') + '\n');
  console.log(`${SYM}: ${out.length - 1} stop records, ${Math.round((Date.now() - t0) / 1000)} s`);
}
