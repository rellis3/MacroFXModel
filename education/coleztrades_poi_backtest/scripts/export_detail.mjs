import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runPoiReaction } from '/home/user/MacroFXModel/js/poiReactionV1Engine.js';
import { extractBars, resampleTo } from '/home/user/MacroFXModel/js/barUtils.js';
import fs from 'fs';

const pair = process.argv[2] || 'gbpusd';
const out = process.argv[3];
const packed = await loadM1ForPair(pair);
const { trades } = runPoiReaction(packed, { instrument: pair });

// D1 bars over a focused, recent window (~6 months) that contains several trades.
const DAY = 86400;
const { n, times, opens, highs, lows, closes } = packed;
// Build daily
const daily = [];
let ck=-1, cur=null;
for (let i=0;i<n;i++){ const k=times[i]-(times[i]%DAY); if(k!==ck){ if(cur) daily.push(cur); cur={time:k,open:opens[i],high:highs[i],low:lows[i],close:closes[i]}; ck=k;} else { if(highs[i]>cur.high)cur.high=highs[i]; if(lows[i]<cur.low)cur.low=lows[i]; cur.close=closes[i]; } }
if(cur) daily.push(cur);

// Choose window: a 130-trading-day slice near the OOS region with a mix of wins/losses.
const winEnd = daily.length - 40;
const winStart = winEnd - 130;
const wStartT = daily[winStart].time, wEndT = daily[winEnd].time;
const winDaily = daily.slice(winStart, winEnd).map(d=>({ t: d.time, o:+d.open.toFixed(6), h:+d.high.toFixed(6), l:+d.low.toFixed(6), c:+d.close.toFixed(6) }));
const winTrades = trades.filter(t=>{ const ts = Math.floor(new Date(t.date+'T00:00:00Z').getTime()/1000); return ts>=wStartT && ts<=wEndT; });

// Pick one representative WIN trade in the window to zoom into on M15.
const zoom = winTrades.find(t=>t.outcome==='win') || winTrades[0];
let zoomBars = [], zoomInfo = null;
if (zoom) {
  const zStart = Math.floor(new Date(zoom.date+'T00:00:00Z').getTime()/1000);
  const m1 = extractBars(packed, zStart, zStart+DAY);
  zoomBars = resampleTo(m1, 15).map(b=>({ t:b.time, o:+b.open.toFixed(6), h:+b.high.toFixed(6), l:+b.low.toFixed(6), c:+b.close.toFixed(6) }));
  zoomInfo = zoom;
}

fs.writeFileSync(out, JSON.stringify({ pair, window:[wStartT,wEndT], daily: winDaily, trades: winTrades, zoom: { info: zoomInfo, bars: zoomBars } }));
process.stderr.write(`${pair}: window ${daily[winStart].time} trades=${winTrades.length} wins=${winTrades.filter(t=>t.outcome==='win').length} zoom=${zoom?zoom.date:'none'}\n`);
