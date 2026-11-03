/**
 * Swing Map Monte Carlo: every path the next N sessions could take, with and without the option-expiry pull.
 *
 * Owner's idea (2026-11-01): the book of each expiry leans up or down (js/expiryTracker.js pull). If the 5-day expiry
 * leans down and the 10-day leans up, price might be drawn down first and up after, the near expiry handing over to
 * the next as it rolls off. This file turns that idea into a path model so it can be SEEN, and keeps the model's
 * status honest:
 *
 *   log P(t+1) = log P(t) + drift(t) + sigma * z,   z ~ N(0, 1)   (seeded, reproducible)
 *   drift(t)   = k * SUM_e a_e(t) * ln(target_e / P(t)) / (s_e - t)    over expiries e still alive at t
 *   a_e(t)     = OI_e / sqrt(s_e - t), normalised to sum to 1           (the nearer expiry dominates as it approaches)
 *
 * target_e is the expiry's OI-weighted centre in spot terms; s_e its sessions ahead. k = 0 is a plain random walk at the
 * same sigma. Nothing measured gives k: no test here shows a book's lean moves price (walls behave like ordinary
 * levels, max pain does not pin). So the page always draws the k = 0 run beside the pull run, and labels k as chosen,
 * not fitted. sigma is the live forecast's reverting monthly sigma per session when given (validated), else realised.
 *
 * The most-touched path: for each session ahead, the price bin that the most paths sit in (the density peak), lightly
 * smoothed. Under a random walk that is ~flat at the start price; any shape it takes comes from the pull.
 * Pure and browser-safe: no imports.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd) {
  let u = 0;
  while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/**
 * opts: { close, sigma (per session, fraction), sessions, expiries: [{ s (sessions ahead), target, oi }], k, n, seed,
 *         keep (sample paths to return), binSigma (bin width in sigma) }
 * Returns { quantiles: [{t, p10, p25, p50, p75, p90}], modal: [{t, px}], sample: [[px...]], drift: [{t, d}], touch }
 */
export function simulatePaths(opts) {
  const { close, sigma, sessions = 20, expiries = [], k = 0.5, n = 2000, seed = 20261101, keep = 120, binSigma = 0.25 } = opts || {};
  if (!(close > 0) || !(sigma > 0) || !(sessions >= 1)) return null;
  const rnd = mulberry32(seed);
  const ex = (expiries || []).filter(e => e && e.s >= 1 && e.target > 0 && e.oi > 0);
  const paths = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = new Float64Array(sessions + 1);
    p[0] = close;
    let lp = Math.log(close);
    for (let t = 0; t < sessions; t++) {
      let d = 0;
      if (k !== 0 && ex.length) {
        let wsum = 0, acc = 0;
        for (const e of ex) {
          const left = e.s - t;
          if (left <= 0) continue;
          const w = e.oi / Math.sqrt(left);
          wsum += w;
          acc += w * (Math.log(e.target) - lp) / left;
        }
        if (wsum > 0) d = k * acc / wsum;
      }
      lp += d + sigma * gauss(rnd);
      p[t + 1] = Math.exp(lp);
    }
    paths[i] = p;
  }
  const col = t => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = paths[i][t]; a.sort(); return a; };
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))];
  const quantiles = [], modalRaw = [];
  for (let t = 0; t <= sessions; t++) {
    const a = col(t);
    quantiles.push({ t, p10: q(a, 0.1), p25: q(a, 0.25), p50: q(a, 0.5), p75: q(a, 0.75), p90: q(a, 0.9) });
    if (t === 0) { modalRaw.push(close); continue; }
    // density peak on a log grid of binSigma * sigma * sqrt(t) wide bins (bins widen with time like the spread)
    const w = binSigma * sigma * Math.sqrt(t);
    const counts = new Map();
    for (const v of a) { const b = Math.floor(Math.log(v / close) / w); counts.set(b, (counts.get(b) || 0) + 1); }
    let best = 0, bestN = -1;
    for (const [b, c] of counts) if (c > bestN || (c === bestN && Math.abs(b) < Math.abs(best))) { best = b; bestN = c; }
    modalRaw.push(close * Math.exp((best + 0.5) * w));
  }
  const modal = modalRaw.map((v, t) => {
    if (t === 0) return { t, px: v };
    const win = modalRaw.slice(Math.max(1, t - 1), Math.min(modalRaw.length, t + 2));
    return { t, px: Math.exp(win.reduce((s, x) => s + Math.log(x), 0) / win.length) };
  });
  // the pull acting on the MEDIAN path, per session (what the expiries ask for, in % per session)
  const drift = [];
  for (let t = 0; t < sessions; t++) {
    let wsum = 0, acc = 0;
    const lp = Math.log(quantiles[t].p50);
    for (const e of ex) { const left = e.s - t; if (left <= 0) continue; const w = e.oi / Math.sqrt(left); wsum += w; acc += w * (Math.log(e.target) - lp) / left; }
    drift.push({ t, d: wsum > 0 ? k * acc / wsum * 100 : 0 });
  }
  const step = Math.max(1, Math.floor(n / keep));
  const sample = [];
  for (let i = 0; i < n && sample.length < keep; i += step) sample.push(Array.from(paths[i]));
  return { n, k, sigma, sessions, quantiles, modal, sample, drift, seed };
}

/** Share of paths that touch a level (high or low reaching it) at any point within the horizon. */
export function touchShare(sim, level) {
  if (!sim?.sample?.length) return null;
  const up = level >= sim.quantiles[0].p50;
  const hit = sim.sample.filter(p => p.some(v => (up ? v >= level : v <= level))).length;
  return hit / sim.sample.length;
}

/**
 * The pull's direction day by day, merged into runs: [{ from, to, dir }] (sessions 1-based) plus a sentence such as
 * "down days 1-3, up days 4-20". Runs shorter than minLen are folded into the run before them so a one-day wobble
 * does not read as a turn.
 */
export function driftSegments(drift, { minLen = 2 } = {}) {
  const runs = [];
  (drift || []).forEach((d, i) => {
    const dir = d.d > 0 ? 'up' : d.d < 0 ? 'down' : 'flat';
    const last = runs.at(-1);
    if (last && last.dir === dir) last.to = i + 1; else runs.push({ from: i + 1, to: i + 1, dir });
  });
  const merged = [];
  for (const r of runs) {
    const last = merged.at(-1);
    if (last && (r.to - r.from + 1 < minLen || last.dir === r.dir)) last.to = r.to;
    else merged.push({ ...r });
  }
  const text = merged.map(r => `${r.dir} ${r.from === r.to ? `day ${r.from}` : `days ${r.from}-${r.to}`}`).join(', ');
  return { runs: merged, text };
}

/**
 * The zone walk: start at the last close and step to each readable expiry's anchor in date order, so the line can go
 * north to one expiry's strongest strike and back south to the next. anchor = 'strike' (that expiry's biggest strike),
 * 'maxPain' or 'centre' (its OI-weighted centre). Thin books (under `thin` of all live OI) are skipped unless includeThin, then kept and flagged thin.
 * Returns { points:[{expiry,dte,px,from,dir,movePct,strength,oi,building}], runs:[{dir,from,to,px,expiry}], text }.
 * A drawing of the hypothesis that price visits each expiry's zone by its date. Untested.
 *
 * Reach limit (owner, 2026-11-02: "a 4k drop in a day would be an insane day"): when `sigma` (daily, fraction) and `date`
 * (the last close's date) are given, a step may only go to a strike price could plausibly reach by that expiry, i.e.
 * within zcap * sigma * sqrt(sessions) of BOTH the previous point (sessions since it) and today's close (sessions
 * from today). zcap 1.645 = the two-sided 90% range of a random walk at that sigma. For the strike anchor, the step goes
 * to the biggest strike INSIDE that range; an expiry with none in range (or whose max pain / centre is out of range) is
 * left out of the walk and listed in `skipped` with how far its zone was and what the range allowed.
 */
const _weekdays = (a, b) => { let t = Date.parse(`${a}T00:00:00Z`), e = Date.parse(`${b}T00:00:00Z`), k = 0; while (t < e) { t += 864e5; const w = new Date(t).getUTCDay(); if (w && w !== 6) k++; } return k; };

export function zoneWalk(expiries, { close, anchor = 'strike', maxDte = 100, thin = 0.10, includeThin = false, flatPct = 0.1, sigma = null, date = null, zcap = 1.645 } = {}) {
  if (!(close > 0)) return { points: [], runs: [], text: '' };
  const all = (expiries || []).reduce((a, e) => a + (e.totalOI || 0), 0);
  const isThin = e => !!e.thin || (all > 0 && (e.totalOI || 0) / all < thin);
  const live = (expiries || []).filter(e => e.dte >= 0 && e.dte <= maxDte && (includeThin || !isThin(e)))
    .slice().sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
  const points = [], skipped = [];
  const capped = sigma > 0 && date;
  let prev = close, prevDate = date;
  for (const e of live) {
    const byOI = (e.zones || []).slice().sort((a, b) => (b.oi || 0) - (a.oi || 0));
    const capFrom = (from, fromDate) => zcap * sigma * Math.sqrt(Math.max(1, _weekdays(fromDate, e.expiry)));
    const ok = px => !capped || (Math.abs(Math.log(px / prev)) <= capFrom(prev, prevDate) && Math.abs(Math.log(px / close)) <= capFrom(close, date));
    let top = byOI[0];
    if (anchor === 'strike' && capped) top = byOI.find(z => z.px > 0 && ok(z.px));
    const px = anchor === 'maxPain' ? e.maxPain : anchor === 'centre' ? e.centrePx : top?.px;
    if (!(px > 0) || !ok(px)) {
      const far = anchor === 'maxPain' ? e.maxPain : anchor === 'centre' ? e.centrePx : byOI[0]?.px;
      if (far > 0) skipped.push({ expiry: e.expiry, dte: e.dte, px: far, movePct: (far / prev - 1) * 100,
        capPct: capped ? (Math.exp(capFrom(prev, prevDate)) - 1) * 100 : null, thin: isThin(e) });
      continue;
    }
    const movePct = (px / prev - 1) * 100;
    const dir = Math.abs(movePct) < flatPct ? 'flat' : movePct > 0 ? 'up' : 'down';
    points.push({ expiry: e.expiry, dte: e.dte, px, from: prev, dir, movePct, thin: isThin(e),
      strength: all > 0 && top ? (top.oi || 0) / all : null, oi: top?.oi ?? null,
      building: !!top && ((top.buildStreak ?? 0) >= 2 || (top.chgSinceFirst ?? 0) > 0),
      notBiggest: anchor === 'strike' && !!byOI[0] && top !== byOI[0], capPct: capped ? (Math.exp(capFrom(prev, prevDate)) - 1) * 100 : null });
    prev = px; prevDate = e.expiry;
  }
  // consecutive steps the same way merge into one run; a flat step joins the run it sits in
  const runs = [];
  for (const p of points) {
    const last = runs.at(-1);
    if (last && (p.dir === last.dir || p.dir === 'flat')) { last.to = p.dte; last.px = p.px; last.expiry = p.expiry; }
    else runs.push({ dir: p.dir, from: p.dte, to: p.dte, px: p.px, expiry: p.expiry });
  }
  const text = runs.map(r => `${r.dir} to ${r.px} by ${r.expiry} (${r.to}d)`).join(', then ');
  return { points, runs, text, skipped, capped: !!capped, zcap };
}
