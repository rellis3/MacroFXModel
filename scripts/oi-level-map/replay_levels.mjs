// oi-level-map step 2: replay every archived nightly QuikStrike capture through the SAME code the indicator uses (buildOIEntry -> buildOiProfile), so the levels
// scored later are exactly the levels the chart would have shown that morning. Spot = the M1 mid at the capture time (build_prices.py -> spots.json), which is what the
// live pipeline's quote was. Offline: skipLiveQuote, no network. Chains priorEntry per instrument so day-over-day OI change works as it did live.
//   node scripts/oi-level-map/replay_levels.mjs
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { buildOIEntry, oiBookLegs } from '../../js/oi.js';
import { buildOiProfile } from '../../js/oiProfile.js';
import { gexLadder } from '../../js/gexLadder.js';
import { RIPPLE_BUCKETS } from '../../js/rippleBook.js';
import { cmeBookContracts } from '../../js/hedgingBooks.js';
import { hedgingScenario } from '../../js/hedgingScenario.js';
import { hedgeFlow } from '../../js/greekLayers.js';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ');
const OUT = join(ROOT, 'analysis/output/oi-level-map');
const spots = JSON.parse(readFileSync(join(OUT, 'spots.json'), 'utf8'));
const SYMS = { EUR_USD: 'EUR/USD', GBP_USD: 'GBP/USD', USD_JPY: 'USD/JPY', AUD_USD: 'AUD/USD', USD_CAD: 'USD/CAD', USD_CHF: 'USD/CHF', XAU_USD: 'XAU/USD',
  NAS100_USD: 'NAS100_USD', SPX500_USD: 'SPX500_USD', US30_USD: 'US30_USD', US2000_USD: 'US2000_USD' };
const LAST = '2026-10-17';
const bucketOf = dte => (Number.isFinite(dte) ? RIPPLE_BUCKETS.find(b => dte <= b.max) : null) || RIPPLE_BUCKETS[RIPPLE_BUCKETS.length - 1];
const r = (v, d = 6) => (Number.isFinite(v) ? +(+v).toPrecision(d) : null);

const dirs = Object.keys(spots).filter(d => d <= LAST && Object.keys(spots[d].spot).length === 11).sort();
const prior = {}, lastHash = {}, out = [];
for (const d of dirs) {
  const dir = join(ROOT, 'oi_recon/out', d, 'quikstrike');
  let asOf = {}; try { asOf = JSON.parse(readFileSync(join(dir, 'asof.json'), 'utf8')).asOf || {}; } catch { /* early dirs: no asof */ }
  for (const [stem, sym] of Object.entries(SYMS)) {
    const rd = b => { try { return readFileSync(join(dir, `${stem}_${b}.tsv`), 'utf8'); } catch { return ''; } };
    const rawOI = rd('rawOI'); if (!rawOI.trim()) continue;
    const spot = spots[d].spot[stem];
    const hash = createHash('md5').update(rawOI).digest('hex');
    const sameAsPrev = lastHash[sym] === hash; lastHash[sym] = hash;
    let res;
    try {
      res = await buildOIEntry({ pair: sym, rawOI, rawChg: rd('rawChg'), rawVol: rd('rawVol'), rawIV: rd('rawIV'), rawIVTerm: rd('rawIVTerm'),
        skipLiveQuote: true, spotRaw: spot, baseUrl: '', priorEntry: prior[sym] || null });
    } catch (e) { console.log(d, sym, 'threw', e.message); continue; }
    if (res.error) { console.log(d, sym, res.error); continue; }
    const inst = res.inst; inst.pair = inst.pair || sym; prior[sym] = inst;
    // IV-implied one-day move: the options' own sigma, the ruler the indicator's expected-move edges use when no forecast is wired
    const p0 = buildOiProfile(inst, {});
    const pts = (inst.ivTermStructure?.points || []).filter(q => q && q.iv > 0 && q.dte >= 2).sort((x, y) => Math.abs(x.dte - 7) - Math.abs(y.dte - 7));
    const ivSmile = p0?.iv?.atm ?? inst.ivDynamics?.atmIV ?? null;
    const iv0 = ivSmile ?? pts[0]?.iv ?? null;   // early captures have settlements only (no smile): the term point nearest 7 DTE
    const dayMove = iv0 > 0 ? inst.spot * iv0 / 100 / Math.sqrt(252) : null;
    let hedge = null;
    try {
      const bk = cmeBookContracts(sym, inst, { maxDte: 3 }); const rm = dayMove ?? inst.refMove?.move ?? inst.spot * 0.01;
      if (bk) { const half = Math.min(0.08, Math.max(0.008, (3.1) * rm / inst.spot)); hedge = hedgingScenario(bk.contracts, { spot: bk.spot, lo: bk.spot * (1 - half), hi: bk.spot * (1 + half), n: 81, shifts: [-2, 0, 2, 4], optMult: 1, futMult: 1 }); }
    } catch { hedge = null; }
    const prof = buildOiProfile(inst, { sym, hedge, dayMove, windowRm: 3.5 });
    if (!prof) { console.log(d, sym, 'no profile'); continue; }
    const rm = prof.refMove;
    // per-DTE-bucket gamma ladders (same gexLadder call the profile makes), windowed
    const book = oiBookLegs(inst); const byB = {};
    for (const l of book.legs) (byB[bucketOf(l.dte).id] ||= []).push(l);
    const buckets = {};
    for (const b of RIPPLE_BUCKETS) {
      const ls = byB[b.id]; if (!ls?.length) continue;
      const lad = gexLadder(ls, book.spot, { mult: book.mult, flatSigma: book.flat, windowFrac: Math.min(0.15, 3.5 * rm / book.spot), maxSeries: 99 });
      if (!lad) continue;
      const n = lad.strikes.length, call = new Array(n).fill(0), put = new Array(n).fill(0), van = new Array(n).fill(0);
      for (const s of lad.series) for (let i = 0; i < n; i++) { call[i] += s.call[i]; put[i] += s.put[i]; van[i] += s.vanna[i]; }
      // raw OI per strike in this bucket (contracts), for the "raw contracts" comparison
      const oiC = lad.strikes.map(k => ls.reduce((a, l) => { const i = l.strikes.findIndex(x => Math.abs(x - k) < 1e-9); return a + (i >= 0 ? (l.calls[i] || 0) : 0); }, 0));
      const oiP = lad.strikes.map(k => ls.reduce((a, l) => { const i = l.strikes.findIndex(x => Math.abs(x - k) < 1e-9); return a + (i >= 0 ? (l.puts[i] || 0) : 0); }, 0));
      buckets[b.id] = { label: b.label, dtes: ls.map(l => l.dte), strikes: lad.strikes.map(x => r(x, 8)), call: call.map(x => r(x, 5)), put: put.map(x => r(x, 5)), van: van.map(x => r(x, 5)), oiC, oiP };
    }
    // dealer hedge-flow schedule, strongest-DTE book (what the card 05e draws)
    let hf = null;
    try {
      const strongLegs = byB[prof.book.id] || book.legs;
      const h = hedgeFlow(strongLegs, book.spot, { mult: book.mult, lo: book.spot - 2.2 * rm, hi: book.spot + 2.2 * rm, n: 111, flatSigma: book.flat });
      if (h) hf = { slope: r(h.spotSlope), up1: r(h.at(book.spot + rm).flow), dn1: r(h.at(book.spot - rm).flow), turns: h.turns.map(x => r(x, 8)) };
    } catch { hf = null; }
    const pe = (inst.perExpiry || []).map(x => ({ dte: x.dte, code: x.code ?? x.expiry ?? null, maxPain: r(x.maxPain, 8), callOI: x.totalCallOI ?? null, putOI: x.totalPutOI ?? null }));
    out.push({
      date: d, sym, captureUtc: spots[d].captureUtc, asOf: asOf[sym] || asOf[stem] || null, sameAsPrev,
      spot: r(prof.spot, 8), basis: r(inst.basis, 8), futures: r(inst.futures, 8), dte: inst.dte ?? null, cpSwapped: !!inst.cpSwapped,
      ivAtm: r(iv0, 5), ivSource: ivSmile ? 'smile' : (iv0 ? 'term' : null), dayMove: r(dayMove, 6), rm: r(rm, 6), regime: prof.regime, netGex: r(prof.netGex, 5),
      book: prof.book, zeroGamma: r(prof.zeroGamma, 8), flip: r(prof.flip, 8), maxPain: r(inst.maxPain, 8), em: prof.em, iv: prof.iv, hf,
      ivTerm: (inst.ivTermStructure?.points || []).map(p => ({ dte: p.dte, iv: r(p.iv, 5) })), rr: inst.riskReversal ? { rr: inst.riskReversal.rr, tilt: inst.riskReversal.tilt } : null,
      pcRatio: r(inst.pcRatio, 4), totalCallOI: inst.totalCallOI ?? null, totalPutOI: inst.totalPutOI ?? null, perExpiry: pe,
      levels: prof.levels.map(l => ({ type: l.type, price: r(l.price, 8), strength: r(l.strength, 4), rank: l.rank ?? null, chg: l.chg ?? null, chgPct: l.chgPct ?? null })),
      volume: prof.volume.map(x => [r(x.price, 8), x.v]), oiChg: prof.oiChg.map(x => [r(x.price, 8), x.v]), buckets,
    });
  }
  console.log(d, 'done', out.filter(o => o.date === d).length);
}
writeFileSync(join(OUT, 'levels.json'), JSON.stringify(out));
console.log('records', out.length);
