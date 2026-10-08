// STEP 3b builder (forge/META_LABEL_PREREG.md, Amendment 2): every first p50 touch of the persistence-adjusted
// walk-forward lines, as a primary decision (OH p50 -> long, OL p50 -> short), with its triple-barrier outcome
// (p75 first / back to the open first / the 22:00 close), cost, and the state known at the touch.
//   node scripts/forecast_history/meta_label_3b_build.mjs [fileKey SYM ...]
// Reads analysis/output/forecast_fix/live_variant/lines_B.csv; writes analysis/output/meta_label/decisions_3b/<SYM>.csv
import fs from 'fs';
import path from 'path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';

const OUT = 'analysis/output/meta_label/decisions_3b';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => [k, k.toUpperCase()]), ['gold', 'GOLD'], ['nq', 'NQ'], ['spx500', 'SPX500'], ['us30', 'DOW'],
  ['us2000', 'US2000'], ['de30', 'DE30'], ['uk100', 'UK100']];
const args = process.argv.slice(2);
const JOBS = args.length ? Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]) : DEFAULT;
const r5 = x => (x == null || !Number.isFinite(x)) ? '' : Math.round(x * 1e5) / 1e5;

// walk-forward lines per instrument/date
const lines = new Map();
{
  const [head, ...rows] = fs.readFileSync('analysis/output/forecast_fix/live_variant/lines_B.csv', 'utf8').trim().split('\n');
  const H = head.split(',');
  const ix = n => H.indexOf(n);
  for (const r of rows) {
    const c = r.split(',');
    const key = `${c[ix('inst')]}|${c[ix('date')]}`;
    lines.set(key, { fold: +c[ix('fold')], sig: +c[ix('sigB')], oh50: +c[ix('B_oh_p50')], oh75: +c[ix('B_oh_p75')],
                     ol50: +c[ix('B_ol_p50')], ol75: +c[ix('B_ol_p75')], hl50: +c[ix('B_hl_p50')] });
  }
}

const _lonFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, hour: '2-digit' });
function londonMidnight(date) {
  const noonUtc = Date.parse(date + 'T12:00:00Z') / 1000;
  return Date.parse(date + 'T00:00:00Z') / 1000 - ((+_lonFmt.format(new Date(noonUtc * 1000)) % 24) - 12) * 3600;
}

fs.mkdirSync(OUT, { recursive: true });
const HEAD = ['inst', 'date', 'fold', 'side', 'touch_min', 'entry', 'a_sig', 'b_sig', 'same_bar', 'label', 'R', 'cost_R', 'rw',
  'res_min', 'used', 'pace', 'jump_sofar', 'other_first'];

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  let packed;
  try { packed = await loadM1ForPair(key); } catch (e) { console.log(`${SYM}: load failed ${e.message}`); continue; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const costPct = costForPair(key, assetClassFor(key));
  const rows = [HEAD.join(',')];
  let nDec = 0, nSame = 0;
  for (const [date, all] of sessions) {
    const L = lines.get(`${SYM}|${date}`);
    if (!L) continue;
    const mid = londonMidnight(date), end = mid + 22 * 3600;
    const bars = all.filter(b => b.time < end);
    if (bars.length < 60) continue;
    const open = bars[0].open, unit = L.sig / 100 * open;
    if (!(unit > 0)) continue;
    const lv = { up50: open * (1 + L.oh50 / 100), up75: open * (1 + L.oh75 / 100),
                 dn50: open * (1 - L.ol50 / 100), dn75: open * (1 - L.ol75 / 100) };
    const firstK = side => bars.findIndex(b => side > 0 ? b.high >= lv.up50 : b.low <= lv.dn50);
    const kUp = firstK(1), kDn = firstK(-1);
    for (const side of [1, -1]) {
      const k = side > 0 ? kUp : kDn;
      if (k < 0) continue;
      const b = bars[k], entry = b.close;
      const target = side > 0 ? lv.up75 : lv.dn75;
      const tHit = x => side > 0 ? x.high >= target : x.low <= target;
      const sHit = x => side > 0 ? x.low <= open : x.high >= open;
      const a = (target - entry) * side, bb = (entry - open) * side;
      const same = tHit(b) || sHit(b) || !(a > 0) || !(bb > 0);
      // state through the touch bar
      let hi = open, lo = open, jump = 0;
      for (let j = 0; j <= k; j++) {
        if (bars[j].high > hi) hi = bars[j].high;
        if (bars[j].low < lo) lo = bars[j].low;
        if (j >= 5) jump = Math.max(jump, Math.abs(bars[j].close - bars[j - 5].close));
      }
      const ref = k >= 60 ? bars[k - 60].close : open;
      const kOther = side > 0 ? kDn : kUp;
      const row = { touch_min: Math.round((b.time - mid) / 60) + 1, used: (hi - lo) / open * 100 / L.hl50,
                    pace: (entry - ref) * side / unit, jump_sofar: jump / unit, other_first: kOther >= 0 && kOther < k ? 1 : 0 };
      let label = '', R = '', resMin = '';
      if (same) nSame++;
      else {
        label = 0;
        for (let j = k + 1; j < bars.length; j++) {
          const t = tHit(bars[j]), s = sHit(bars[j]);
          if (s) { label = -1; R = -1; resMin = Math.round((bars[j].time - mid) / 60) + 1; break; }
          if (t) { label = 1; R = a / bb; resMin = Math.round((bars[j].time - mid) / 60) + 1; break; }
        }
        if (label === 0) { R = (bars.at(-1).close - entry) * side / bb; resMin = Math.round((bars.at(-1).time - mid) / 60) + 1; }
        nDec++;
      }
      rows.push([SYM, date, L.fold, side, row.touch_min, r5(entry), r5(a / unit), r5(bb / unit), same ? 1 : 0, label, r5(R),
        r5(costPct / 100 * entry / bb), r5(bb / (a + bb)), resMin, r5(row.used), r5(row.pace), r5(row.jump_sofar), row.other_first].join(','));
    }
  }
  fs.writeFileSync(path.join(OUT, `${SYM}.csv`), rows.join('\n') + '\n');
  console.log(`${SYM}: ${nDec} decisions, ${nSame} same-bar, cost ${costPct}%, ${Math.round((Date.now() - t0) / 1000)} s`);
}
