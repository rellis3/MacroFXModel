/**
 * book-currency-concentration — does a 12-slot pair book quietly become ONE currency bet?
 *
 * The question falls out of `driftCrossSection`'s identity, `pair = base - quote`,
 * applied to open positions instead of returns. It needs no forecasting power at
 * all, which is why it survives `drift-direction-test.mjs`'s null: this is
 * accounting, not prediction.
 *
 * THE WORRY, CONCRETELY. volatility_bot_v2 runs `max_open: 12` across a 21-pair FX
 * universe with `max_open_risk_pct: 0` — no portfolio-level cap. Long EURJPY, short
 * AUDJPY, long GBPJPY, short CADJPY is four independent-looking signals and one
 * large short-JPY bet. Nothing in a per-pair view can see that.
 *
 * WHAT IS MEASURED. The bot fires on a ladder-rung touch and every policy entry in
 * the shipped plan snapshot is `fade`, so the mapping is unambiguous:
 *   high touches the O-H p75 rung -> SHORT the pair
 *   low  touches the O-L p75 rung -> LONG  the pair
 * Each day's signals are collected across the universe, capped at 12, and the book
 * is decomposed to net currency exposure (+1 base / -1 quote per long, reversed for
 * a short).
 *
 * THE NULL, which is the part that makes this a measurement. Twelve positions drawn
 * from 21 pairs over 8 currencies will share currencies by construction — that is
 * arithmetic, not a finding. So each day's real book is compared against 400
 * permutations that keep the SAME pairs and the SAME number of positions and
 * randomise only the long/short direction. That destroys directional alignment while
 * preserving every other structural feature. Concentration above the null is the
 * signal-driven part; concentration at the null is just the universe's shape.
 *
 * HONEST LIMITS, stated rather than buried:
 *   - This reconstructs the SIGNAL SET from price and the fitted ladder. It is not a
 *     replay of actual fills: no spread, no margin rejection, no concurrency-per-pair
 *     cap, no exits. It answers "does this signal family concentrate", not "what did
 *     the bot hold on 14 March".
 *   - The 12-slot cap takes signals in universe order. A different tie-break changes
 *     which 12, not whether the 12 align.
 *   - Positions are counted at equal weight, not risk-weighted.
 *
 * Run: node scripts/book-currency-concentration.mjs
 */
import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { yangZhangVolSeries } from '../js/volForecast.js';
import { buildLadder } from '../js/forecastLadder.js';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
// The FX legs of the shipped plan snapshot's live universe.
const UNIVERSE = ['audcad','audchf','audjpy','audnzd','audusd','cadjpy','chfjpy',
  'euraud','eurcad','eurchf','eurgbp','eurjpy','eurusd','gbpchf','gbpjpy','gbpusd',
  'nzdjpy','nzdusd','usdcad','usdchf','usdjpy'];
const MAX_OPEN = 12, WARMUP = 40, DRAWS = 400, SEED = 20260914;

async function daily(file) {
  const ab = fs.readFileSync(file);
  const buf = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const f = { byteLength: buf.byteLength, slice: (s, e) => Promise.resolve(buf.slice(s, e)) };
  const meta = await parquetMetadataAsync(f);
  let rows; await parquetRead({ file: f, metadata: meta,
    columns: ['open','high','low','close','datetime'], rowFormat: 'object', onComplete: d => rows = d });
  const days = new Map();
  for (const r of rows) {
    const t = r.datetime instanceof Date ? r.datetime : new Date(r.datetime);
    const k = t.toISOString().slice(0, 10);
    let d = days.get(k);
    if (!d) { d = { open: r.open, high: r.high, low: r.low, close: r.close }; days.set(k, d); }
    else { if (r.high > d.high) d.high = r.high; if (r.low < d.low) d.low = r.low; d.close = r.close; }
  }
  return [...days.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, d]) => ({ date, ...d }));
}

let _s = SEED;
const rnd = () => (_s = (_s * 1103515245 + 12345) % 2147483648) / 2147483648;
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

console.log('loading M1 caches...');
const D = {}, S = {};
for (const p of UNIVERSE) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) { console.error('missing', p); continue; }
  const d1 = await daily(file); if (d1.length < 200) continue;
  D[p] = d1; S[p] = yangZhangVolSeries(d1);
}
const live = UNIVERSE.filter(p => D[p]);
const common = live.map(p => new Set(D[p].map(b => b.date))).reduce((a, b) => new Set([...a].filter(x => b.has(x))));
const DATES = [...common].sort();
const IDX = {}; for (const p of live) IDX[p] = new Map(D[p].map((b, i) => [b.date, i]));
const CCYS = [...new Set(live.flatMap(p => [p.slice(0,3).toUpperCase(), p.slice(3,6).toUpperCase()]))].sort();
console.log(`${live.length} pairs, ${CCYS.length} currencies, ${DATES.length} sessions ${DATES[0]} -> ${DATES.at(-1)}\n`);

/** Net currency exposure of a book, and its worst single-currency net. */
function netOf(book) {
  const net = {};
  for (const { base, quote, dir } of book) {
    net[base] = (net[base] ?? 0) + dir;
    net[quote] = (net[quote] ?? 0) - dir;
  }
  const vals = CCYS.map(c => Math.abs(net[c] ?? 0));
  return { net, max: Math.max(...vals) };
}

const realMax = [], nullMax = [], sizes = [], exceed = [];
const worstDays = [];
const ccyTally = {};

for (let di = WARMUP; di < DATES.length; di++) {
  const date = DATES[di];
  const sig = [];
  for (const p of live) {
    const i = IDX[p].get(date); if (i == null || i < 40) continue;
    const sigma = S[p][i - 1];                       // causal: yesterday's close
    if (!(sigma > 0)) continue;
    let lad; try { lad = buildLadder(sigma, { instrument: p.toUpperCase(), assetClass: 'fx', horizon: 'daily' }); }
    catch { continue; }
    const oh = lad?.oh?.p75, ol = lad?.ol?.p75;
    if (!(oh > 0) || !(ol > 0)) continue;
    const b = D[p][i], up = b.open * (1 + oh / 100), dn = b.open * (1 - ol / 100);
    const base = p.slice(0, 3).toUpperCase(), quote = p.slice(3, 6).toUpperCase();
    // Every shipped policy entry is `fade`.
    if (b.high >= up) sig.push({ pair: p, base, quote, dir: -1 });   // fade the upper rung -> short
    else if (b.low <= dn) sig.push({ pair: p, base, quote, dir: +1 }); // fade the lower rung -> long
  }
  if (sig.length < 2) continue;

  const book = sig.slice(0, MAX_OPEN);
  sizes.push(book.length);
  const r = netOf(book);
  realMax.push(r.max);

  // permutation null: same pairs, same count, direction randomised
  const draws = [];
  for (let k = 0; k < DRAWS; k++)
    draws.push(netOf(book.map(o => ({ ...o, dir: rnd() < 0.5 ? 1 : -1 }))).max);
  const nm = mean(draws);
  nullMax.push(nm);
  exceed.push(r.max - nm);

  // which currency, and how often is the book a lopsided single-currency bet
  const worst = CCYS.reduce((a, c) => Math.abs(r.net[c] ?? 0) > Math.abs(r.net[a] ?? 0) ? c : a, CCYS[0]);
  ccyTally[worst] = (ccyTally[worst] ?? 0) + 1;
  if (r.max >= 6) worstDays.push({ date, max: r.max, n: book.length, ccy: worst, net: r.net });
}

const pctNull = realMax.filter((v, i) => v > nullMax[i]).length / realMax.length * 100;
console.log(`days with >=2 signals: ${realMax.length}   median book size: ${quant(sizes, .5)}   full 12 slots on ${(sizes.filter(s => s === MAX_OPEN).length / sizes.length * 100).toFixed(1)}% of them`);
console.log('\nWORST SINGLE-CURRENCY NET EXPOSURE  (positions, out of the book)');
console.log('                         real     null (same pairs, random direction)');
for (const q of [.5, .75, .9, .99]) {
  console.log(`  p${String(q * 100).padStart(2)}                    ${quant(realMax, q).toFixed(2).padStart(5)}    ${quant(nullMax, q).toFixed(2).padStart(5)}`);
}
console.log(`  mean                   ${mean(realMax).toFixed(2).padStart(5)}    ${mean(nullMax).toFixed(2).padStart(5)}`);
console.log(`\n  real exceeds its own null on ${pctNull.toFixed(1)}% of days; mean excess ${mean(exceed) >= 0 ? '+' : ''}${mean(exceed).toFixed(2)} positions`);

console.log(`\ndays where one currency nets >=6 of the book: ${worstDays.length} (${(worstDays.length / realMax.length * 100).toFixed(1)}%)`);
const tal = Object.entries(ccyTally).sort((a, b) => b[1] - a[1]);
console.log('most-often-concentrated currency: ' + tal.map(([c, n]) => `${c} ${(n / realMax.length * 100).toFixed(0)}%`).join('  '));

if (worstDays.length) {
  // Sort by severity, then sample EVENLY across the timeline. A plain sort puts
  // every tie at the top in date order, so the examples all came from the first
  // year and read as a 2016 phenomenon rather than a standing property.
  console.log('\nWORST DAYS (most severe, sampled across the history)');
  const sev = worstDays.filter(d => d.max >= quant(worstDays.map(x => x.max), .9))
    .sort((a, b) => a.date < b.date ? -1 : 1);
  const picks = [0, 1, 2, 3, 4].map(k => sev[Math.floor(k * (sev.length - 1) / 4)]).filter(Boolean);
  for (const d of picks) {
    const legs = CCYS.map(c => `${c}${(d.net[c] ?? 0) >= 0 ? '+' : ''}${d.net[c] ?? 0}`).filter(x => !/[A-Z]{3}\+?0$/.test(x)).join(' ');
    console.log(`  ${d.date}  ${d.n} positions -> ${d.ccy} net ${d.net[d.ccy] > 0 ? '+' : ''}${d.net[d.ccy]}   [${legs}]`);
  }
}

const verdict = mean(exceed) > 0.5 && pctNull > 60;
console.log('\n' + (verdict
  ? '>> CONCENTRATION IS SIGNAL-DRIVEN. The book aligns on currency more than the same\n'
    + '   pairs with random directions would, so the 12 slots are not 12 independent bets.\n'
    + '   A portfolio-level currency cap would bind on real days, not hypothetical ones.'
  : '>> NOT signal-driven. Whatever currency overlap exists is what any 12 positions drawn\n'
    + '   from this universe would show; the entry directions are not aligning them.'));
