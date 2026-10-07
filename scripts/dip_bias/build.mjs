// Dip-with-bias (forge/DIP_WITH_BIAS_PREREG.md): limit at open -/+ 0.8 sigma, target 0.4 sigma back toward the open,
// stop 0.6 sigma, out at 22:00 London; both sides every session, tagged with/against/no yield-spread bias. M1 fills.
//   node scripts/dip_bias/build.mjs     -> analysis/output/dip_bias/trades.csv
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { costForPair } from '../../js/perLineStrategy.js';

const OUT = 'analysis/output/dip_bias';
fs.mkdirSync(OUT, { recursive: true });
const PAIRS = [['eurusd', 'EURUSD'], ['gbpusd', 'GBPUSD'], ['usdjpy', 'USDJPY'], ['audusd', 'AUDUSD'], ['usdcad', 'USDCAD'], ['usdchf', 'USDCHF']];
const ENTRY = 0.8, TARGET = 0.4, STOP = 0.6;
const WINDOWS = { all: [0, 21], his: [13, 16] };

const T = JSON.parse(fs.readFileSync('analysis/output/meta_label_ys/ys_run.json', 'utf8')).combined.trades;
function biasOn(label, date) {                          // a yield trade open over London session `date`
  const t = T.find(x => x.pair === label && x.date < date && x.exitDate >= date);
  return t ? (t.dir === 'LONG' ? 1 : -1) : 0;
}
function sigmaMap(label) {
  const [head, ...rows] = fs.readFileSync(`analysis/output/forecast_history/${label}.csv`, 'utf8').trim().split('\n');
  const H = head.split(','), iD = H.indexOf('date'), iS = H.indexOf('pit_sig_used');
  return new Map(rows.map(r => r.split(',')).map(c => [c[iD], +c[iS]]));
}
const _fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit' });
const lonHour = t => { const [h, m] = _fmt.format(new Date(t * 1000)).split(':').map(Number); return (h % 24) + m / 60; };

const rows = ['pair,date,window,side,bias,fill_hour,outcome,R'];
for (const [key, label] of PAIRS) {
  const packed = await loadM1ForPair(key);
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const sig = sigmaMap(label), cost = costForPair(key, 'fx') / 100;
  let n = 0;
  for (const [date, all] of sessions) {
    if (date < '2016-10-04') continue;
    const s = sig.get(date);
    if (!(s > 0)) continue;
    const bars = all.filter(b => lonHour(b.time) < 22);
    if (bars.length < 600) continue;
    const open = bars[0].open, unit = s / 100 * open;
    const bias = biasOn(label, date);
    for (const side of [1, -1]) {                      // +1 = buy the dip, -1 = sell the rip
      const E = open - side * ENTRY * unit, stop = E - side * STOP * unit, tgt = E + side * TARGET * unit;
      for (const [w, [h0, h1]] of Object.entries(WINDOWS)) {
        let k = -1;
        for (let i = 0; i < bars.length; i++) {
          const h = lonHour(bars[i].time);
          if (h < h0) continue;
          if (h >= h1) break;
          if (side > 0 ? bars[i].low <= E : bars[i].high >= E) { k = i; break; }
        }
        if (k < 0) continue;
        // Amendment 1: an order placed at the window's start with price ALREADY through the level fills at the market
        // (that bar's open), and is skipped when price is already through the stop. Only possible after 00:00 (W-his).
        let Ef = E;
        const firstInWindow = bars.findIndex(b => lonHour(b.time) >= h0);
        if (k === firstInWindow && h0 > 0) {
          const o = bars[k].open;
          if (side > 0 ? o <= stop : o >= stop) continue;
          if (side > 0 ? o < E : o > E) Ef = o;
        }
        let outcome = 'close', exit = bars.at(-1).close;
        const fb = bars[k];
        if (side > 0 ? fb.low <= stop : fb.high >= stop) { outcome = 'stop'; exit = stop; }
        else {
          for (let j = k + 1; j < bars.length; j++) {
            const b = bars[j];
            if (side > 0 ? b.low <= stop : b.high >= stop) { outcome = 'stop'; exit = stop; break; }
            if (side > 0 ? b.high >= tgt : b.low <= tgt) { outcome = 'target'; exit = tgt; break; }
          }
        }
        const R = (side * (exit - Ef) - cost * Ef) / (STOP * unit);
        rows.push([label, date, w, side, bias === 0 ? 'none' : bias === side ? 'with' : 'against', lonHour(fb.time).toFixed(2), outcome, R.toFixed(5)].join(','));
        n++;
      }
    }
  }
  console.log(`${label}: ${n} fills`);
}
fs.writeFileSync(`${OUT}/trades.csv`, rows.join('\n') + '\n');
