// oi-profile-gold-history, stage 2: each session record (prep.py) -> QuikStrike-shaped pastes -> the UNCHANGED live OI Profile path
// (buildOIEntry -> cmeBookContracts maxDte 3 -> hedgingScenario -> buildOiProfile, strongest book, ±3σ window), exactly as
// scripts/oi-profile-lines/replay.mjs. Output rows use replay.mjs's profiles.jsonl format so events.py can read them unchanged.
//   node scripts/oi-profile-gold-history/build.mjs <sessions.jsonl> <profiles.jsonl> [--check 20]
// --check N: also writes <profiles>.check.json, the prereg §3.5 build check on N random sessions (mechanics only, no outcomes).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { buildOIEntry, oiMatrixExpiryLegs } = await imp('js/oi.js');
const { buildOiProfile } = await imp('js/oiProfile.js');
const { cmeBookContracts } = await imp('js/hedgingBooks.js');
const { hedgingScenario } = await imp('js/hedgingScenario.js');

const [inFile, outFile] = process.argv.slice(2);
const nCheck = process.argv.includes('--check') ? +process.argv[process.argv.indexOf('--check') + 1] : 0;
const SK = 'XAU/USD', windowSig = 3;
const SCORED = new Set(['call_wall', 'put_wall', 'gamma_peak', 'max_pain']);
const quiet = fn => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; return Promise.resolve(fn()).finally(() => { console.warn = w; console.log = l; }); };
const ddmmyyyy = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const fmt = x => (Number.isFinite(x) ? String(+x.toFixed(4)) : '');

// The OI heatmap paste, shaped like a live gold capture: an underlying/price block, then "STRIKE | code0", "N DTE | code1", ..., "N DTE",
// then the C/P row and one row per strike (strike, then a call/put pair per expiry column).
export function rawMatrix(rec) {
  const ex = rec.expiries;
  const L = ['\tGC', `${fmt(rec.frontF)}\tGC`, `STRIKE\t${ex[0].code}`];
  for (let i = 0; i < ex.length; i++) L.push(`${ex[i].dte} DTE` + (i + 1 < ex.length ? `\t${ex[i + 1].code}` : ''));
  L.push('\t\t' + ex.map(() => 'C\tP').join('\t'));
  const ks = [...new Set(ex.flatMap(e => e.strikes))].sort((a, b) => a - b);
  const maps = ex.map(e => new Map(e.strikes.map((k, i) => [k, [e.c[i], e.p[i]]])));
  for (const k of ks) L.push([fmt(k), ...maps.flatMap(m => { const v = m.get(k); return v ? [v[0] ? String(v[0]) : '', v[1] ? String(v[1]) : ''] : ['', '']; })].join('\t'));
  return L.join('\n');
}
// The "Settlements" term-structure paste: one row per live expiry, 17 columns, IV in percent in col 10.
export function rawTerm(rec) {
  const L = ['SYMBOL\tDTE\tEXPIRATION', 'DATE', 'DATE\tFUTURE PRICE\tSTRADDLE PRICE\tVOLATILITY\tOPEN INTEREST'];
  for (const e of rec.ivAll) {
    if (!(e.iv > 0) || !Number.isFinite(e.atmK)) continue;
    L.push([e.code, e.dte, ddmmyyyy(e.exp_date), fmt(e.atmK), fmt(e.F), '', '', fmt(e.straddle), '', '', (100 * e.iv).toFixed(2), '', '', '0', '0', '0', '0'].join('\t'));
  }
  return L.join('\n');
}
export function rawVolume(rec) {
  const v = new Map();
  for (const e of rec.expiries) for (const [k, x] of Object.entries(e.vol || {})) v.set(+k, (v.get(+k) || 0) + x);
  return [...v].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${fmt(k)}\t${Math.round(x)}`).join('\n');
}

async function buildOne(rec) {
  const rawOI = rawMatrix(rec), rawIVTerm = rawTerm(rec), rawVol = rawVolume(rec);
  const futures = rec.spot07 + rec.basis;  // basis measured at D's settle, applied to the 07:00 S spot
  const entry = await quiet(() => buildOIEntry({ pair: SK, rawOI, rawChg: '', rawVol, rawIV: '', rawIVTerm, dteRaw: NaN, spotRaw: rec.spot07, futuresRaw: futures,
    manualFutures: true, skipLiveQuote: true }));
  if (!entry || entry.error || !entry.inst?.spot) return { err: entry?.error || 'no inst' };
  const inst = entry.inst; inst.pair = inst.pair || SK;
  const dayMove = rec.sigma, rm = dayMove;
  let hedge = null;
  try {
    const bk = cmeBookContracts(SK, inst, { maxDte: 3 });
    if (bk) { const half = Math.min(0.08, Math.max(0.008, (windowSig + 0.1) * rm / inst.spot)); hedge = hedgingScenario(bk.contracts, { spot: bk.spot, lo: bk.spot * (1 - half), hi: bk.spot * (1 + half), n: 81, shifts: [-2, 0, 2, 4], optMult: 1, futMult: 1 }); }
  } catch { hedge = null; }
  const prof = buildOiProfile(inst, { sym: SK, hedge, dayMove, windowRm: windowSig });
  if (!prof) return { err: 'no profile' };
  return { inst, prof, hedge, rawOI };
}

const rl = readline.createInterface({ input: fs.createReadStream(inFile), crlfDelay: Infinity });
const recs = [];
for await (const line of rl) if (line.trim()) recs.push(JSON.parse(line));
const out = fs.createWriteStream(outFile);
const log = { sessions: recs.length, rows: 0, errors: {}, hedgeOn: 0, basisAbsMed: null };
const at = (rows, px, binW, f) => { if (!rows?.length) return null; let b = null; for (const r of rows) if (!b || Math.abs(r.price - px) < Math.abs(b.price - px)) b = r; return Math.abs(b.price - px) <= binW ? f(b) : 0; };
const bases = [];
for (const rec of recs) {
  let r;
  try { r = await buildOne(rec); } catch (e) { r = { err: 'throw: ' + e.message.slice(0, 60) }; }
  if (r.err) { log.errors[r.err] = (log.errors[r.err] || 0) + 1; continue; }
  const { prof, hedge, inst } = r;
  if (hedge) log.hedgeOn++;
  bases.push(Math.abs(rec.basis));
  const gMax = Math.max(1e-12, ...prof.gex.map(x => Math.abs(x.net))), vMax = Math.max(1e-12, ...prof.volume.map(x => x.v));
  out.write(JSON.stringify({
    date: rec.S, oiDate: rec.D, lag: rec.lag, sk: SK, fk: 'GOLD', savedAtMs: rec.t0ms, fcAt: null, spot: prof.spot, futures: rec.spot07 + rec.basis, basis: rec.basis,
    sigmaPct: rec.sigmaPct, dayMove: rec.sigma, rm: prof.refMove, regime: prof.regime, netGex: prof.netGex, hedgeRegime: hedge?.atSpot?.regime ?? null,
    book: prof.book, zeroGamma: prof.zeroGamma, em: prof.em, iv: prof.iv, primaryCode: inst.primaryExpiry?.code ?? null,
    // prereg §4: only call_wall, put_wall, gamma_peak and max_pain are scored (the types the monthly history rebuilds); the rest are kept for reference
    otherTypes: prof.levels.filter(l => !SCORED.has(l.type)).map(l => [l.type, l.price]),
    levels: prof.levels.filter(l => SCORED.has(l.type)).map(l => ({ type: l.type, price: l.price, strength: l.strength ?? null, rank: l.rank ?? null, tags: l.tags ?? null, hidden: !!l.hidden,
      label: l.label, expect: l.expect, chgPct: l.chgPct ?? null,
      gAt: at(prof.gex, l.price, prof.binWidth, x => Math.abs(x.net) / gMax), vAt: at(prof.volume, l.price, prof.binWidth, x => x.v / vMax) })),
  }) + '\n');
  log.rows++;
}
out.end();
bases.sort((a, b) => a - b); log.basisAbsMed = bases[bases.length >> 1] ?? null;

// ── §3.5 build check (mechanics): N sessions drawn with the study seed
if (nCheck > 0) {
  let s = 20261126 >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = new Set(); while (pick.size < Math.min(nCheck, recs.length)) pick.add(Math.floor(rnd() * recs.length));
  const checks = [];
  for (const i of pick) {
    const rec = recs[i]; const r = await buildOne(rec);
    const c = { S: rec.S, D: rec.D };
    // (a) the matrix the parser reads sums to the Databento OI per expiry, exactly
    const legs = oiMatrixExpiryLegs(rawMatrix(rec), { basis: 0, minOI: 0 }) || [];
    c.sumsExact = legs.length === rec.expiries.length && rec.expiries.every((e, j) => {
      const want = e.c.reduce((a, b) => a + b, 0) + e.p.reduce((a, b) => a + b, 0);
      const got = legs[j].calls.reduce((a, b) => a + b, 0) + legs[j].puts.reduce((a, b) => a + b, 0);
      return Math.abs(want - got) < 1e-6;
    });
    // (b) parity F from the two closest-to-ATM strikes agree within 0.3%
    c.parityAgree = Number.isFinite(rec.frontF2) && Math.abs(rec.frontF - rec.frontF2) / rec.frontF <= 0.003;
    c.frontF = rec.frontF; c.frontF2 = rec.frontF2;
    // (c) the profile's call/put walls sit on real strikes of the strongest book that carry OI on the right side of spot (spot terms = strike − basis)
    if (r.err) { c.err = r.err; c.wallsOnBookStrikes = false; }
    else {
      const bl = r.prof.book?.label; c.book = bl;
      const ks = new Set(rec.expiries.flatMap(e => e.strikes.map(k => +(k - rec.basis).toFixed(4))));
      const walls = r.prof.levels.filter(l => l.type === 'call_wall' || l.type === 'put_wall');
      c.walls = walls.map(l => [l.type, +l.price.toFixed(2)]);
      c.wallsOnBookStrikes = walls.length > 0 && walls.every(l => ks.has(+l.price.toFixed(4)) && (l.type === 'call_wall' ? l.price > r.prof.spot : l.price < r.prof.spot));
    }
    c.pass = c.sumsExact && c.parityAgree && c.wallsOnBookStrikes;
    checks.push(c);
  }
  const res = { n: checks.length, passed: checks.filter(c => c.pass).length, checks };
  fs.writeFileSync(outFile.replace(/\.jsonl$/, '') + '.check.json', JSON.stringify(res, null, 1));
  log.check = { n: res.n, passed: res.passed };
}
console.log(JSON.stringify(log, null, 1));
