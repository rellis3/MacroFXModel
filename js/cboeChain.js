/**
 * CBOE INDEX OPTIONS CHAIN — SPX / NDX / RUT / DJX from Cboe's free delayed-quotes feed
 * (cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json), shaped into the same
 * per-expiry strike ladder the OI dashboard draws from CME data (see gexLadder.js).
 *
 * WHY A SECOND SOURCE: the CME pipeline reads E-mini FUTURES options (ES/NQ/RTY/YM). The
 * index-options book — SPX/SPXW above all, with its huge 0-2 DTE weeklies — is many
 * times larger and is what most published GEX charts (COG's included) are built on. On
 * 2026-10-09 the 0-DTE SPXW book alone read $38.7B net GEX per 1% move against a few
 * million in our ES units. ADDITIVE: nothing here replaces or writes the CME data.
 *
 * THE FEED: ~15-min delayed quotes; open interest is the exchange's prior-day figure
 * (updates once each morning). Each contract carries Cboe's own IV, delta and gamma at
 * the quoted spot, so per-strike gamma uses the real smile per strike and expiry rather
 * than one ATM vol per expiry. Unofficial (it is the endpoint Cboe's own site uses) —
 * the server caches it and keeps serving the last good copy if it fails.
 *
 * UNITS: GEX in DOLLARS PER 1% MOVE (gamma · OI · 100 · S² · 0.01) — the convention COG
 * and SpotGamma publish, so these numbers compare to theirs directly. Delta/charm/vanna
 * in index units, same sign convention as gexLadder (calls +, puts −; dealers long calls,
 * short puts). Strikes and spot are returned in CFD terms (index × scale: DJX is quoted at
 * 1/100 of the Dow, so ×100 for US30).
 *
 * Pure: no fetch, no I/O. The server fetches and calls these.
 */

import { bsGamma, bsCharm, bsVanna } from './gammaGreeks.js';
import { wallStrengthTier } from './oiConfluence.js';

// OANDA index CFD → Cboe underlying. `fut` is the CME future the CFD basis is quoted
// against, for showing Cboe levels in futures terms.
export const CBOE_PAIRS = {
  'SPX500_USD': { sym: '_SPX', label: 'SPX', scale: 1,   fut: 'ES'  },
  'NAS100_USD': { sym: '_NDX', label: 'NDX', scale: 1,   fut: 'NQ'  },
  'US2000_USD': { sym: '_RUT', label: 'RUT', scale: 1,   fut: 'RTY' },
  'US30_USD':   { sym: '_DJX', label: 'DJX', scale: 100, fut: 'YM'  },
};

export const cboeUrl = sym => `https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`;

const MULT = 100;                    // index option multiplier ($ per index point)
const DAY_MS = 864e5, YEAR_MS = 365 * DAY_MS;
// Weekly/PM roots settle at the 16:00 ET close; the plain roots' standard monthlies are
// AM-settled at the 09:30 open. UTC hours below assume US daylight time (EDT); in winter
// they run an hour early, which only matters for the last hour of a 0-DTE contract.
const PM_ROOTS = new Set(['SPXW', 'NDXP', 'RUTW', 'DJXW', 'XSP']);
const r5 = v => (Number.isFinite(v) ? +v.toPrecision(5) : 0);

// Cboe's timestamp ("2026-10-09 17:12:52") is UTC (checked against the fetch clock:
// it reads ~15 min behind UTC, the stated delay).
function parseTs(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

// DTE in TRADING days (weekdays), the way COG and the exchanges label weeklies: Friday's
// view of Monday's expiry is 1 DTE, not 3. Holidays are not excluded. T (the gamma clock)
// stays in exact calendar time.
function tradingDaysBetween(fromDay, toDay) {
  let n = 0;
  for (let d = fromDay + 1; d <= toDay; d++) { const wd = new Date(d * DAY_MS).getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}

/**
 * Raw Cboe JSON → { spot, asOfMs, contracts:[{root, exp:'YYYY-MM-DD', expMs, dte, T, cp,
 * K, oi, vol, iv, gamma, delta}] }. Contracts with neither OI nor volume are dropped,
 * as are expired ones. `scale` is NOT applied here (raw index terms).
 */
export function parseCboeChain(json) {
  const d = json && json.data;
  if (!d || !Array.isArray(d.options)) return null;
  const spot = +d.current_price;
  const asOfMs = parseTs(json.timestamp);
  if (!(spot > 0) || !Number.isFinite(asOfMs)) return null;
  const asOfDay = Math.floor(asOfMs / DAY_MS);
  const contracts = [];
  for (const o of d.options) {
    const m = String(o.option || '').match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
    if (!m) continue;
    const oi = +o.open_interest || 0, vol = +o.volume || 0;
    if (oi <= 0 && vol <= 0) continue;
    const root = m[1], y = 2000 + +m[2], mo = +m[3], da = +m[4];
    const pm = PM_ROOTS.has(root);
    const expMs = Date.UTC(y, mo - 1, da, pm ? 20 : 13, pm ? 0 : 30);
    if (expMs <= asOfMs) continue;
    contracts.push({
      root, exp: `${y}-${m[3]}-${m[4]}`, expMs,
      dte: tradingDaysBetween(asOfDay, Math.floor(Date.UTC(y, mo - 1, da) / DAY_MS)),
      T: Math.max(expMs - asOfMs, 30 * 60e3) / YEAR_MS,   // floor 30 min: the gamma singularity
      cp: m[5], K: +m[6] / 1000, oi, vol,
      iv: +o.iv || 0, gamma: +o.gamma || 0, delta: +o.delta || 0,
    });
  }
  return contracts.length ? { spot, asOfMs, contracts } : null;
}

// Gamma for one contract at price S: Cboe's own figure at the quoted spot, otherwise
// Black-Scholes from the contract's own IV (used for the flip scan and zero-gamma quotes).
function gammaAt(c, S, quotedSpot) {
  if (S === quotedSpot && c.gamma > 0) return c.gamma;
  return c.iv > 0 ? (bsGamma(S, c.K, c.T, c.iv) || 0) : 0;
}

/**
 * The strike ladder + levels, in CFD terms. Output `ladder` matches gexLadder's shape
 * ({strikes, series, vol, nExpiries}) so the dashboard draws it unchanged, plus `units`.
 * opts: scale, windowFrac (strikes kept within ±frac of spot), maxSeries (nearest expiries
 * kept individually; the rest fold into "later"), wallExpiries (how many nearest expiries
 * the gamma walls read — 3 = COG's 0/1/2 DTE), flipSpan/flipSteps for the GEX-flip scan.
 */
export function cboeLadder(parsed, { scale = 1, windowFrac = 0.06, maxSeries = 4, wallExpiries = 3,
  flipSpan = 0.05, flipSteps = 200, flipMaxDte = 60 } = {}) {
  if (!parsed || !(parsed.spot > 0) || !parsed.contracts?.length) return null;
  const S = parsed.spot, lo = S * (1 - windowFrac), hi = S * (1 + windowFrac);
  const dollar = S * S * 0.01 * MULT;        // γ → $ per 1% move, per contract

  // Expiries nearest first; one series each for the first `maxSeries`, the rest pooled.
  const byExp = new Map();
  for (const c of parsed.contracts) { if (!byExp.has(c.exp)) byExp.set(c.exp, []); byExp.get(c.exp).push(c); }
  const exps = [...byExp.keys()].sort();
  const strikes = [...new Set(parsed.contracts.filter(c => c.K >= lo && c.K <= hi).map(c => c.K))].sort((a, b) => a - b);
  if (strikes.length < 2) return null;
  const idx = new Map(strikes.map((k, i) => [k, i]));
  const Z = () => new Array(strikes.length).fill(0);
  const blank = () => ({ call: Z(), put: Z(), dex: Z(), charm: Z(), vanna: Z(), oiC: Z(), oiP: Z(), vC: Z(), vP: Z() });
  const fill = (acc, list) => {
    for (const c of list) {
      const j = idx.get(c.K); if (j == null) continue;
      const sgn = c.cp === 'C' ? 1 : -1, g = gammaAt(c, S, S);
      if (c.cp === 'C') { acc.call[j] += c.oi * g * dollar; acc.oiC[j] += c.oi; acc.vC[j] += c.vol * g * dollar; }
      else              { acc.put[j]  += c.oi * g * dollar; acc.oiP[j] += c.oi; acc.vP[j] += c.vol * g * dollar; }
      acc.dex[j] += c.delta * c.oi * MULT;
      if (c.iv > 0) {
        acc.charm[j] += sgn * c.oi * MULT * bsCharm(S, c.K, c.T, c.iv) / 365;
        acc.vanna[j] += sgn * c.oi * MULT * bsVanna(S, c.K, c.T, c.iv) * 0.01;
      }
    }
  };
  const sum = a => a.reduce((x, y) => x + y, 0);
  const finish = (a, meta) => {
    const net = a.call.map((v, i) => v - a.put[i]);
    return { ...meta, call: a.call.map(r5), put: a.put.map(r5), net: net.map(r5), total: r5(sum(net)),
      dex: a.dex.map(r5), charm: a.charm.map(r5), vanna: a.vanna.map(r5),
      totals: { dex: r5(sum(a.dex)), charm: r5(sum(a.charm)), vanna: r5(sum(a.vanna)) } };
  };

  const series = [], volAcc = blank(), allAcc = blank(), accs = [];
  exps.forEach((ex, n) => {
    const list = byExp.get(ex);
    fill(allAcc, list);
    if (n < maxSeries) {
      const a = blank(); fill(a, list); accs.push(a);
      const dte = list[0].dte;
      series.push(finish(a, { label: `${dte} DTE`, dte, code: ex }));
    }
  });
  if (exps.length > maxSeries) {
    const a = blank(); exps.slice(maxSeries).forEach(ex => fill(a, byExp.get(ex)));
    series.push(finish(a, { label: `later (${exps.length - maxSeries})`, dte: byExp.get(exps[maxSeries])[0].dte, code: null, rest: true }));
  }
  // Volume: every expiry (today's activity), each contract at its own gamma.
  const vol = { split: true, call: allAcc.vC.map(r5), put: allAcc.vP.map(r5),
    net: allAcc.vC.map((v, i) => r5(v - allAcc.vP[i])), gross: allAcc.vC.map((v, i) => r5(v + allAcc.vP[i])),
    volume: Z() };
  for (const c of parsed.contracts) { const j = idx.get(c.K); if (j != null) vol.volume[j] += c.vol; }

  // Levels. Gamma walls read the nearest `wallExpiries` expiries (where the hedging is);
  // OI walls read every expiry (where the contracts are) — the two questions the page
  // keeps apart for CME too.
  const near = Z().map(() => ({ c: 0, p: 0, oc: 0, op: 0 }));
  accs.slice(0, wallExpiries).forEach(a => a.call.forEach((v, i) => { near[i].c += v; near[i].p += a.put[i]; near[i].oc += a.oiC[i]; near[i].op += a.oiP[i]; }));
  const argmax = f => { let b = -1, bv = 0; strikes.forEach((k, i) => { const v = f(i); if (v > bv) { bv = v; b = i; } }); return b < 0 ? null : strikes[b]; };
  const callWallGamma = argmax(i => near[i].c), putWallGamma = argmax(i => near[i].p);
  const callWallOI = argmax(i => allAcc.oiC[i]), putWallOI = argmax(i => allAcc.oiP[i]);
  const netGex = sum(allAcc.call) - sum(allAcc.put);

  // Max pain of the nearest expiry, over its WHOLE chain (not just the window).
  const nearList = byExp.get(exps[0]) || [];
  const ks = [...new Set(nearList.map(c => c.K))].sort((a, b) => a - b);
  let maxPain = null, best = Infinity;
  for (const k of ks) {
    let pain = 0;
    for (const c of nearList) pain += c.oi * (c.cp === 'C' ? Math.max(0, k - c.K) : Math.max(0, c.K - k));
    if (pain < best) { best = pain; maxPain = k; }
  }

  // GEX flip: total net gamma re-evaluated at candidate prices (gamma depends on where
  // spot is), each contract at its own IV and time to expiry. Every crossing is kept with
  // its direction so the page can shade PIN/BREAKOUT bands the same way it does for CME.
  const flipBook = parsed.contracts.filter(c => c.iv > 0 && c.dte <= flipMaxDte && Math.abs(c.K / S - 1) < 0.25);
  const total = P => { let g = 0; for (const c of flipBook) g += (c.cp === 'C' ? 1 : -1) * c.oi * (bsGamma(P, c.K, c.T, c.iv) || 0); return g * P * P * 0.01 * MULT; };
  const flips = [];
  { const a = S * (1 - flipSpan), step = 2 * S * flipSpan / flipSteps;
    let pS = a, pv = total(a);
    for (let s = 1; s <= flipSteps; s++) {
      const P = a + s * step, v = total(P);
      if (pv !== 0 && Math.sign(v) !== Math.sign(pv)) {
        const t = Math.abs(pv) / (Math.abs(pv) + Math.abs(v));
        flips.push({ price: pS + t * (P - pS), dir: pv > 0 ? 'long->short' : 'short->long' });
      }
      pS = P; pv = v;
    } }
  const gexFlip = flips.length ? flips.slice().sort((x, y) => Math.abs(x.price - S) - Math.abs(y.price - S))[0].price : null;

  // Per-expiry smiles (the curved lines on COG's chart): OTM side of each strike —
  // calls at/above spot, puts below — for the nearest expiries.
  const smiles = exps.slice(0, Math.min(3, maxSeries)).map((ex, j) => {
    const pts = byExp.get(ex).filter(c => c.iv > 0 && c.K >= lo && c.K <= hi && ((c.cp === 'C') === (c.K >= S)))
      .sort((a, b) => a.K - b.K);
    return { label: series[j]?.label, code: ex, strikes: pts.map(c => c.K * scale), iv: pts.map(c => +c.iv.toFixed(4)) };
  }).filter(s => s.strikes.length >= 3);

  const sc = v => (v == null ? null : +(v * scale).toFixed(4));
  return {
    units: 'usd1pct',
    spot: +(S * scale).toFixed(4), indexSpot: S, asOfMs: parsed.asOfMs,
    ladder: { units: 'usd1pct', strikes: strikes.map(k => +(k * scale).toFixed(4)), series, vol, nExpiries: exps.length },
    oiProfile: strikes.map((k, i) => ({ strike: +(k * scale).toFixed(4), callOI: allAcc.oiC[i], putOI: allAcc.oiP[i] })),
    // Near-dated (wall expiries) call/put GEX + contracts per strike — what the gamma
    // walls are ranked on, kept so the export can build a wall list from the same book.
    near: strikes.map((k, i) => ({ strike: +(k * scale).toFixed(4), callGex: r5(near[i].c), putGex: r5(near[i].p), callOI: near[i].oc, putOI: near[i].op })),
    smiles,
    levels: {
      callWallGamma: sc(callWallGamma), putWallGamma: sc(putWallGamma),
      callWallOI: sc(callWallOI), putWallOI: sc(putWallOI),
      maxPain: sc(maxPain), maxPainExpiry: exps[0] || null,
      gexFlip: sc(gexFlip), flips: flips.map(f => ({ price: sc(f.price), dir: f.dir })),
      netGex: r5(netGex), regime: netGex > 0 ? 'PIN' : netGex < 0 ? 'BREAKOUT' : 'NEUTRAL',
      wallExpiries: exps.slice(0, wallExpiries),
    },
  };
}

// Compact daily row for the tracking archive: what Cboe said vs what CME said, same day.
export function cboeSnapshotRow(built, cme) {
  if (!built) return null;
  const top = built.ladder.strikes.map((k, i) => ({ k, net: built.ladder.series.reduce((a, s) => a + (s.net[i] || 0), 0) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 10).map(r => [r.k, r5(r.net)]);
  return {
    asOf: new Date(built.asOfMs).toISOString(), spot: built.spot, levels: built.levels,
    series: built.ladder.series.map(s => ({ label: s.label, code: s.code, total: s.total })),
    topStrikes: top,
    cme: cme ? { spot: cme.spot ?? null, basis: cme.basis ?? null, callWall: cme.callWall ?? null, putWall: cme.putWall ?? null,
      gexFlip: cme.gexFlip ?? null, maxPain: cme.maxPain ?? null, gex: cme.exposures?.gex ?? null,
      expiry: cme.primaryExpiry?.code ?? null, savedAtMs: cme.savedAtMs ?? null } : null,
  };
}

/**
 * The CME oi_store entry with its LEVEL fields replaced by Cboe's, so the existing export
 * (buildOILevelText) runs on it unchanged — the "Cboe" tick on the export. Cboe supplies
 * the walls (gamma-ranked over the near expiries, tiered by the same 3x-neighbours rule),
 * max pain (nearest expiry), the GEX flip(s), net GEX / regime and the per-strike gamma
 * profile that drives the heat and hold scores. Everything Cboe has no equivalent for is
 * KEPT from CME: spot, basis (so futures terms still add the ES/NQ/RTY/YM basis), the
 * reference / expected move, charm-vanna, risk reversal, volume magnets. CME's other-
 * expiry walls, term structure, clusters and day set are dropped rather than mixed in, so
 * every wall on a Cboe block comes from one book. Pure; returns a new object.
 */
export function cboeOverlayInst(cme, built, { label = 'Cboe', stale = false } = {}) {
  if (!cme || !built || !built.levels || !Array.isArray(built.near)) return cme;
  const L = built.levels, near = built.near;
  const walls = side => {
    const gk = side === 'call' ? 'callGex' : 'putGex', ok = side === 'call' ? 'callOI' : 'putOI';
    const rows = near.filter(r => r[gk] > 0);
    const ref = rows.reduce((m, r) => Math.max(m, r[gk]), 0);
    return rows.map(r => {
      const i = near.indexOf(r);
      const neigh = [i - 2, i - 1, i + 1, i + 2].filter(j => near[j]).map(j => near[j][gk]);
      const t = wallStrengthTier(r[gk], neigh, { ref });
      return { strike: r.strike, oi: r[ok], gex: r[gk], mult: t.multiple, tier: t.tier, chg: 0, persistence: 0 };
    }).sort((a, b) => b.gex - a.gex).slice(0, 12);
  };
  const cw = walls('call'), pw = walls('put');
  // The headline wall must carry a tier or the export's size floor drops it; the
  // gamma-ranked #1 is by definition the strongest near-dated wall.
  for (const w of [cw[0], pw[0]]) if (w && !w.tier) w.tier = 'strong';
  const ser = built.ladder.series.filter(s => !s.rest);
  const gexProfile = built.ladder.strikes.map((k, i) => {
    const callGex = built.ladder.series.reduce((a, s) => a + (s.call[i] || 0), 0);
    const putGex = built.ladder.series.reduce((a, s) => a + (s.put[i] || 0), 0);
    const o = built.oiProfile[i] || {};
    return { strike: k, callOI: o.callOI || 0, putOI: o.putOI || 0, callGex, putGex, netGex: callGex - putGex, gamma: callGex + putGex };
  });
  return {
    ...cme,
    oiSource: `${label} index options${stale ? ' (stale copy)' : ''} · as of ${new Date(built.asOfMs).toISOString().slice(11, 16)} UTC, 15-min delayed`,
    callWall: L.callWallGamma, putWall: L.putWallGamma, callWalls: cw, putWalls: pw,
    callWallOI: cw[0]?.oi ?? null, putWallOI: pw[0]?.oi ?? null,
    maxPain: L.maxPain, gammaFlip: L.gexFlip, gexFlip: L.gexFlip, gexFlips: L.flips || [],
    exposures: { ...(cme.exposures || {}), gex: L.netGex },
    fullBook: { gex: L.netGex, flip: L.gexFlip, regime: L.regime, nExpiries: built.ladder.nExpiries, volSource: 'cboe' },
    gexProfile, dte: ser[0]?.dte ?? cme.dte,
    dayExpiry: null, dayExpiryReason: 'ok', perExpiry: [], termStructure: [], clusters: [],
  };
}
