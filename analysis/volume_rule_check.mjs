#!/usr/bin/env node
/**
 * Is the textbook volume rule real here, and is "volume" even independent of range?
 *
 *   python scratchpad/runstudy.py analysis/volume_rule_check.mjs
 *
 * DIAGNOSTIC, not a pre-registered study. It answers two questions before anyone
 * spends effort on a third:
 *
 *   1. In spot FX, OANDA's "volume" is a count of price UPDATES, not contracts. If
 *      that count is near-perfectly correlated with the day's range, then "a big
 *      up-candle on high volume" and "a big up-candle" are the same sentence, and
 *      the rule carries no information of its own. This measures that correlation.
 *
 *   2. The rule itself: after an up day, does volume separate what happens next?
 *      Reported as next-day return AND next-day range, because range is the only
 *      thing that has ever survived on this desk.
 */
// fetchD1Aligned projects volume away, and the M1 fetcher that keeps it is not
// exported -- so the candles are pulled directly here. Tick volume is the whole
// point of this diagnostic, so losing it silently would make the answer meaningless.
const BASE = (process.env.OANDA_BASE_URL || 'https://api-fxtrade.oanda.com').replace(/\/$/, '');
async function fetchD1(instrument, count = 2000) {
  const url = `${BASE}/v3/instruments/${encodeURIComponent(instrument)}/candles`
            + `?granularity=D&price=M&count=${Math.min(count, 5000)}`
            + `&dailyAlignment=0&alignmentTimezone=${encodeURIComponent('Europe/London')}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
                               signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return ((await r.json()).candles ?? [])
    .filter(c => c.complete !== false && c.mid)
    .map(c => ({ date: c.time.slice(0, 10), open: +c.mid.o, high: +c.mid.h,
                 low: +c.mid.l, close: +c.mid.c, volume: Number(c.volume ?? 0) }))
    .filter(c => c.close > 0);
}

const SYMS = [['EUR/USD','EUR_USD'],['GBP/USD','GBP_USD'],['USD/JPY','USD_JPY'],
              ['AUD/USD','AUD_USD'],['Gold','XAU_USD'],['NAS100','NAS100_USD']];
const mean = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v=>(v-m)**2))); };
const corr = (a,b) => { const ma=mean(a), mb=mean(b); let n=0,da=0,db=0;
  for (let i=0;i<a.length;i++){ n+=(a[i]-ma)*(b[i]-mb); da+=(a[i]-ma)**2; db+=(b[i]-mb)**2; }
  return n/Math.sqrt(da*db); };
const pctl = (a,p) => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length*p)]; };

for (const [name, sym] of SYMS) {
  let bars = [];
  try { bars = await fetchD1(sym, 2000); }
  catch (e) { console.log(`${name}: ${e.message}`); continue; }
  const rows = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const b = bars[i], p = bars[i-1], n = bars[i+1];
    if (!b.volume || !b.close || !p.close) continue;
    rows.push({
      vol: b.volume,
      ret: (b.close / p.close - 1) * 100,
      rng: ((b.high - b.low) / b.close) * 100,
      nextRet: (n.close / b.close - 1) * 100,
      nextRng: ((n.high - n.low) / n.close) * 100,
      // close position within the bar: 1 = closed on the high
      eff: (b.high - b.low) > 0 ? (b.close - b.low) / (b.high - b.low) : 0.5,
    });
  }
  if (rows.length < 400) { console.log(`${name}: only ${rows.length} bars`); continue; }

  const cRange = corr(rows.map(r=>r.vol), rows.map(r=>r.rng));
  const cAbsRet = corr(rows.map(r=>r.vol), rows.map(r=>Math.abs(r.ret)));
  const hi = pctl(rows.map(r=>r.vol), 0.70), lo = pctl(rows.map(r=>r.vol), 0.30);

  // the textbook rule: an UP day, split by volume
  const upHi = rows.filter(r => r.ret > 0 && r.vol >= hi);
  const upLo = rows.filter(r => r.ret > 0 && r.vol <= lo);
  const share = a => a.length ? a.filter(r => r.nextRet > 0).length / a.length : null;
  const medRng = a => a.length ? pctl(a.map(r=>r.nextRng), 0.5) : null;
  const base = rows.filter(r => r.nextRet > 0).length / rows.length;

  const f = v => v == null ? '—' : v.toFixed(2);
  console.log(`${name.padEnd(8)} n=${rows.length}`);
  console.log(`   volume vs same-day RANGE   corr ${cRange.toFixed(2)}   vs |return| ${cAbsRet.toFixed(2)}`);
  console.log(`   up-day HIGH vol (n=${String(upHi.length).padStart(3)}): next up ${(share(upHi)*100).toFixed(0)}%  next range ${f(medRng(upHi))}%`);
  console.log(`   up-day LOW  vol (n=${String(upLo.length).padStart(3)}): next up ${(share(upLo)*100).toFixed(0)}%  next range ${f(medRng(upLo))}%`);
  console.log(`   base rate next up ${(base*100).toFixed(0)}%   median range all days ${pctl(rows.map(r=>r.nextRng),0.5).toFixed(2)}%\n`);
}
