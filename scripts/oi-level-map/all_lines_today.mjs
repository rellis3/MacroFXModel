// One-off "every line" export for one capture day: rebuilds each market's OI record from the nightly QuikStrike files (same buildOIEntry the live pipeline uses),
// then lists EVERY line from EVERY expiry bucket, not just the strongest one the OI Profile draws, next to the lines the OI WALLS & MAX PAIN export draws.
// Each line says which book it came from, how strong it is (inside its own bucket, and against the biggest gamma in the whole market), and whether the Profile draws it.
//   node scripts/oi-level-map/all_lines_today.mjs 2026-10-30
// Spot and the one-day move are what the live indicator printed that morning (M| spot / refmove), passed in SPOTS below, because there is no local price file for today.
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildOIEntry, oiBookLegs } from '../../js/oi.js';
import { buildOiProfile } from '../../js/oiProfile.js';
import { oiStoreToLevels } from '../../js/oiConfluence.js';
import { gexLadder } from '../../js/gexLadder.js';
import { RIPPLE_BUCKETS } from '../../js/rippleBook.js';
import { cmeBookContracts } from '../../js/hedgingBooks.js';
import { hedgingScenario } from '../../js/hedgingScenario.js';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ');
const DATE = process.argv[2] || '2026-10-30';
const OUT = join(ROOT, 'analysis/output/oi-level-map');
// stem, store key, display name, spot and one-day move as the indicator printed them (2026-10-30 06:47 UTC export)
const SPOTS = {
  '2026-10-30': {
    XAU_USD: ['XAU/USD', 'GOLD', 3989.3, 35.9], NAS100_USD: ['NAS100_USD', 'NQ', 28779.4, 443.2], EUR_USD: ['EUR/USD', 'EURUSD', 1.11976, 0.00392],
    GBP_USD: ['GBP/USD', 'GBPUSD', 1.3415, 0.00429], USD_JPY: ['USD/JPY', 'USDJPY', 157.21, 0.613], AUD_USD: ['AUD/USD', 'AUDUSD', 0.70246, 0.00267],
    USD_CAD: ['USD/CAD', 'USDCAD', 1.39621, 0.00377], USD_CHF: ['USD/CHF', 'USDCHF', 0.82054, 0.00295],
    SPX500_USD: ['SPX500_USD', 'SPX500', 7648.6, 52.8], US30_USD: ['US30_USD', 'US30', 52362.8, 408.4], US2000_USD: ['US2000_USD', 'US2000', 2848.0, 26.2],
  },
}[DATE];
if (!SPOTS) throw new Error('no spots for ' + DATE);
// gamma peak of the strongest book as the live OI Profile printed it (2026-10-30 06:47 export): the anchor for the basis
const LIVE_PEAK = { GOLD: 3990.4, NQ: 28871.2, EURUSD: 1.11808, GBPUSD: 1.34252, USDJPY: 156.772, AUDUSD: 0.70562, USDCAD: 1.39737, USDCHF: 0.82376, SPX500: 7672.6, US30: 51564.1, US2000: 2866.8 };
const dir = join(ROOT, 'oi_recon/out', DATE, 'quikstrike');
const bucketOf = dte => (Number.isFinite(dte) ? RIPPLE_BUCKETS.find(b => dte <= b.max) : null) || RIPPLE_BUCKETS[RIPPLE_BUCKETS.length - 1];
const r = (v, d = 8) => (Number.isFinite(v) ? +(+v).toPrecision(d) : null);
const sum = a => a.reduce((x, y) => x + y, 0);
const WINDOW = 3.5;
const out = { date: DATE, generated: new Date().toISOString(), note: 'spot and one-day move as the live OI Profile printed them; levels rebuilt from the nightly capture', markets: [] };
const text = [`──── EVERY OI LINE · ${DATE} ────`, 'Each line: price · distance in one-day moves from spot · type · expiry book · strength in its own book (g) and against the biggest gamma in the market (G) · contracts at the strike · drawn by the OI Profile or not', ''];

for (const [stem, [sym, name, spot, dayMove]] of Object.entries(SPOTS)) {
  const rd = b => { try { return readFileSync(join(dir, `${stem}_${b}.tsv`), 'utf8'); } catch { return ''; } };
  const rawOI = rd('rawOI'); if (!rawOI.trim()) { console.log(name, 'no rawOI'); continue; }
  const build = async sp => buildOIEntry({ pair: sym, rawOI, rawChg: rd('rawChg'), rawVol: rd('rawVol'), rawIV: rd('rawIV'), rawIVTerm: rd('rawIVTerm'), skipLiveQuote: true, spotRaw: sp, baseUrl: '', priorEntry: null });
  // The live record's basis is (capture futures − spot AT CAPTURE); the printed spot is the 06:47 re-quote, a few ticks later. Anchor on the live gamma peak the indicator printed
  // and pick the spot-for-basis that reproduces it, so every strike-derived line sits where the live chart drew it.
  let res = await build(spot);
  if (res.error) { console.log(name, res.error); continue; }
  const peak0 = buildOiProfile({ ...res.inst, spot }, { dayMove, windowRm: 3 })?.levels.find(l => l.type === 'gamma_peak')?.price;
  const delta = LIVE_PEAK[name] != null && Number.isFinite(peak0) ? peak0 - LIVE_PEAK[name] : 0;
  if (delta) { res = await build(spot - delta); if (res.error) { console.log(name, res.error); continue; } }
  const inst = res.inst; inst.pair = inst.pair || sym; inst.spot = spot;
  console.log(name, 'basis shift vs printed spot', r(delta, 5));
  const rm = dayMove, S = inst.spot;
  let hedge = null;
  try {
    const bk = cmeBookContracts(sym, inst, { maxDte: 3 });
    if (bk) { const half = Math.min(0.08, Math.max(0.008, (WINDOW + 0.1) * rm / S)); hedge = hedgingScenario(bk.contracts, { spot: bk.spot, lo: bk.spot * (1 - half), hi: bk.spot * (1 + half), n: 81, shifts: [-2, 0, 2, 4], optMult: 1, futMult: 1 }); }
  } catch { hedge = null; }
  const prof = buildOiProfile(inst, { sym, hedge, dayMove: rm, windowRm: 3 });
  if (!prof) { console.log(name, 'no profile'); continue; }
  const drawn = (type, price) => prof.levels.some(l => l.type === type && Math.abs(l.price - price) <= 0.05 * rm);

  // ── every bucket's own ladder → its own walls / peak / nodes ──────────────────────────────────────────────
  const book = oiBookLegs(inst), byB = {};
  for (const l of book.legs) (byB[bucketOf(l.dte).id] ||= []).push(l);
  const bk = [];
  for (const b of RIPPLE_BUCKETS) {
    const ls = byB[b.id]; if (!ls?.length) continue;
    const lad = gexLadder(ls, book.spot, { mult: book.mult, flatSigma: book.flat, windowFrac: Math.min(0.15, WINDOW * rm / book.spot), maxSeries: 99 });
    if (!lad) continue;
    const n = lad.strikes.length, call = new Array(n).fill(0), put = new Array(n).fill(0);
    for (const s of lad.series) for (let i = 0; i < n; i++) { call[i] += s.call[i]; put[i] += s.put[i]; }
    const oiAt = (k, key) => ls.reduce((a, l) => { const i = l.strikes.findIndex(x => Math.abs(x - k) <= 1e-7 * Math.abs(k)); return a + (i >= 0 ? (l[key][i] || 0) : 0); }, 0);
    const near = lad.strikes.map((k, i) => (Math.abs(k - book.spot) <= 2 * rm ? i : -1)).filter(i => i >= 0);
    const abs = sum(near.map(i => sum(lad.series.map(s => Math.abs(s.call[i]) + Math.abs(s.put[i])))));
    bk.push({ id: b.id, label: b.label, dtes: ls.map(l => l.dte), lad, call, put, net: call.map((c, i) => c - put[i]), abs, oiAt });
  }
  const total = sum(bk.map(b => b.abs)) || 1;
  const gMax = Math.max(1e-12, ...bk.map(b => Math.max(...b.call, ...b.put)));
  const lines = [];
  for (const b of bk) {
    const { lad, call, put, net } = b, n = lad.strikes.length;
    const cmax = Math.max(...call, 1e-12), pmax = Math.max(...put, 1e-12), nmax = Math.max(...net.map(Math.abs), 1e-12);
    const topSide = (arr, above) => lad.strikes.map((k, i) => ({ k, v: arr[i], i })).filter(x => (above ? x.k > book.spot : x.k < book.spot) && x.v > 0).sort((a, c) => c.v - a.v);
    const distinct = (list, k = 2) => { const o = []; for (const x of list) if (o.every(y => Math.abs(y.k - x.k) > 0.12 * rm)) o.push(x); return o.slice(0, k); };
    const push = (type, k, i, own, gv, rank) => {
      if (Math.abs(k - book.spot) > WINDOW * rm) return;
      lines.push({ src: 'bucket', bucket: b.id, bucketLabel: b.label, type, rank: rank ?? null, price: r(k), sig: r((k - book.spot) / rm, 4), g: r(own, 3), G: r(gv / gMax, 3),
        oiC: Math.round(b.oiAt(lad.strikes[i], 'calls')), oiP: Math.round(b.oiAt(lad.strikes[i], 'puts')), drawn: b.id === prof.book.id && drawn(type, k) });
    };
    distinct(topSide(call, true)).forEach((x, j) => push('call_wall', x.k, x.i, x.v / cmax, x.v, j + 1));
    distinct(topSide(put, false)).forEach((x, j) => push('put_wall', x.k, x.i, x.v / pmax, x.v, j + 1));
    const pk = lad.strikes.map((k, i) => ({ k, i, v: Math.abs(net[i]) })).sort((a, c) => c.v - a.v)[0];
    if (pk) push('gamma_peak', pk.k, pk.i, pk.v / nmax, pk.v);
    let nodes = 0;
    for (const x of lad.strikes.map((k, i) => ({ k, i, v: Math.abs(net[i]) })).sort((a, c) => c.v - a.v)) {
      if (nodes >= 2 || x.v < 0.25 * nmax) break;
      if (pk && Math.abs(pk.k - x.k) <= 0.12 * rm) continue;
      if (lines.some(l => l.bucket === b.id && (l.type === 'call_wall' || l.type === 'put_wall') && Math.abs(l.price - x.k) <= 0.12 * rm)) continue;
      push(net[x.i] < 0 ? 'short_gamma_node' : 'long_gamma_node', x.k, x.i, x.v / nmax, x.v); nodes++;
    }
  }
  // ── lines that belong to the whole market, drawn once by the Profile ──────────────────────────────────────
  for (const l of prof.levels) if (['zero_gamma', 'gex_flip', 'max_pain', 'vanna_flip', 'charm_flip', 'oi_volume', 'exp_hi', 'exp_lo'].includes(l.type))
    lines.push({ src: 'market', bucket: null, bucketLabel: 'whole book', type: l.type, rank: null, price: r(l.price), sig: r((l.price - S) / rm, 4), g: null, G: r(l.strength, 3), oiC: null, oiP: null, drawn: true });
  for (const f of (hedge?.zeroGamma || [])) if (!lines.some(l => l.type === 'zero_gamma' && Math.abs(l.price - f.price) <= 0.05 * rm) && Math.abs(f.price - S) <= WINDOW * rm)
    lines.push({ src: 'market', bucket: null, bucketLabel: 'near book (≤3 days)', type: 'zero_gamma', rank: null, price: r(f.price), sig: r((f.price - S) / rm, 4), g: null, G: null, oiC: null, oiP: null, drawn: false, note: 'another zero-gamma crossing' });
  // ── what the OI WALLS & MAX PAIN export draws (primary + day books) ──────────────────────────────────────
  const WANT = new Set(['call_wall', 'put_wall', 'max_pain', 'gamma_flip', 'gex_flip', 'oi_volume']);
  for (const l of oiStoreToLevels(inst, { topWalls: null, minTier: 'moderate', maxWalls: 3 }).filter(x => WANT.has(x.type)))
    lines.push({ src: 'analysis', bucket: null, bucketLabel: Number.isFinite(l.dte) ? `${l.dte}DTE (analysis export)` : 'analysis export', type: l.type, rank: null, price: r(l.price), sig: r((l.price - S) / rm, 4), g: null, G: null, tier: l.tier ?? null, dte: l.dte ?? null, oiC: null, oiP: null, drawn: false });
  // per-expiry max pain / walls, the first 8 expiries (the export's own breakdown)
  for (const e of (inst.perExpiry || []).slice().sort((a, c) => a.dte - c.dte).slice(0, 8))
    for (const [t, v] of [['max_pain', e.maxPain], ['call_wall', e.callWall], ['put_wall', e.putWall]])
      if (Number.isFinite(v) && Math.abs(v - S) <= WINDOW * rm) lines.push({ src: 'expiry', bucket: null, bucketLabel: `${e.dte}DTE expiry`, type: t, rank: null, price: r(v), sig: r((v - S) / rm, 4), g: null, G: null, dte: e.dte, oiC: null, oiP: null, drawn: false });
  lines.sort((a, c) => c.price - a.price);

  const dayG = inst.dayExpiry?.exposures?.gex, farG = inst.exposures?.gex;
  const m = {
    name, sym, spot: r(S), oneDay: r(rm), strongBook: prof.book.label, profileRegime: prof.regime, profileNetGex: r(prof.netGex, 5),
    hedgeRegime: hedge?.atSpot?.regime ?? null, dayRegime: Number.isFinite(dayG) && dayG !== 0 ? (dayG > 0 ? 'PIN' : 'BREAKOUT') : null, dayDte: inst.dayExpiry?.dte ?? null,
    primaryRegime: Number.isFinite(farG) && farG !== 0 ? (farG > 0 ? 'PIN' : 'BREAKOUT') : null, primaryDte: inst.dte ?? null,
    gexFlips: (inst.gexFlips || []).map(f => r(f.price)), expectedMoveToExpiry: inst.expectedMove ? { hi: r(inst.expectedMove.upper), lo: r(inst.expectedMove.lower), dte: inst.expectedMove.dte ?? null } : null,
    buckets: bk.map(b => ({ id: b.id, label: b.label, share: Math.round(b.abs / total * 100), netSign: sum(b.net) < 0 ? 'short gamma' : 'long gamma', dtes: b.dtes })), lines,
  };
  out.markets.push(m);
  text.push(name, `· spot ${m.spot} · one-day move ${m.oneDay} · Profile draws the ${m.strongBook} book (${prof.book.share}%) · Profile regime ${m.profileRegime} · hedge-map regime ${m.hedgeRegime ?? '-'} · day-book regime ${m.dayRegime ?? '-'} (${m.dayDte ?? '-'}DTE) · primary ${m.primaryRegime ?? '-'} (${m.primaryDte ?? '-'}DTE)`,
    `· books: ${m.buckets.map(b => `${b.label} ${b.share}% ${b.netSign}`).join(' · ')}`);
  for (const l of lines) {
    const nm = ({ call_wall: 'CALL WALL', put_wall: 'PUT WALL', gamma_peak: 'GAMMA PEAK', zero_gamma: 'ZERO GAMMA', gex_flip: 'GEX FLIP', gamma_flip: 'GAMMA FLIP', max_pain: 'MAX PAIN', vanna_flip: 'VANNA FLIP', charm_flip: 'CHARM FLIP', oi_volume: 'VOLUME', exp_hi: 'EXP MOVE ↑', exp_lo: 'EXP MOVE ↓', short_gamma_node: 'SHORT-GAMMA NODE', long_gamma_node: 'LONG-GAMMA NODE' })[l.type] || l.type;
    text.push(`  ${String(l.price).padEnd(10)} ${(l.sig >= 0 ? '+' : '') + l.sig.toFixed(2)}σ  ${(nm + (l.rank ? ' ' + l.rank : '')).padEnd(18)} ${String(l.bucketLabel).padEnd(24)} ${l.g != null ? 'g ' + l.g.toFixed(2) : '      '} ${l.G != null ? 'G ' + l.G.toFixed(2) : '      '}  ${l.oiC != null ? `OI ${l.oiC}C/${l.oiP}P` : ''}  ${l.drawn ? 'DRAWN' : l.src === 'bucket' ? 'hidden by Profile' : ''}`.trimEnd());
  }
  text.push('');
  console.log(name, 'lines', lines.length, 'drawn profile levels', prof.levels.length, 'strong book', prof.book.label, 'regime', prof.regime);
}
writeFileSync(join(OUT, `all_lines_${DATE.replace(/-/g, '')}.json`), JSON.stringify(out));
writeFileSync(join(OUT, `all_lines_${DATE.replace(/-/g, '')}.txt`), text.join('\n'));
console.log('written');
