// cog-replication/engine/oiSignalCheck.js
//
// STEP 1 — the gate on everything else. Before building COG's Gate 2 or Gate 3
// we check whether the OI archive carries the information those gates assume.
//
// Two independent questions, both answerable on the ~60-day `oi_history`:
//
//   G2 HYPOTHESIS — "GEX is an expected-range estimate."
//     Dealers short gamma (negative GEX) amplify moves; long gamma dampens them.
//     If true, |GEX| should relate to the day's REALISED range. COG's Gate 2
//     emits a stop distance and a risk tier, and this is the only mechanism we
//     have that produces a per-day range number from positioning.
//     If GEX does not relate to realised range, Gate 2 is built on sand and we
//     find that out before writing it — the reversal clause in DECISIONS.md.
//
//   G3 HYPOTHESIS — "price is pulled toward the dominant wall."
//     If the nearest heavy wall acts as a magnet, the sign of (wall − spot)
//     should predict the sign of the session move. This is the owner's
//     observation (his OI read matched COG's direction 2/2) stated as something
//     measurable.
//
// CAUSALITY. The archive is written from the morning paste, so a day's snapshot
// exists before that day's 13:00 UTC session. We therefore use day d's snapshot
// to predict day d's 13:00→20:00 session only. `spot` in the snapshot is the
// morning spot, NOT the entry price — the entry price comes from the bar.
//
// SMALL-N HONESTY. ~60 calendar days is ~40 trading days per pair. That cannot
// validate anything; it can only tell us whether the relationship is
// plausibly there before we spend weeks forward-testing it. Every output
// carries n, and a correlation on n<25 is reported but must not be acted on.

// Pearson r plus a t-stat, so a small-n result cannot masquerade as a finding.
function corr(xs, ys) {
  const n = xs.length;
  if (n < 4) return { n, r: null, t: null };
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  if (sxx <= 0 || syy <= 0) return { n, r: null, t: null };
  const r = sxy / Math.sqrt(sxx * syy);
  const t = Math.abs(r) < 1 ? r * Math.sqrt((n - 2) / (1 - r * r)) : null;
  return { n, r: +r.toFixed(3), t: t == null ? null : +t.toFixed(2) };
}

// histPair : { 'YYYY-MM-DD': {gex, spot, callWall, putWall, callWallOI, putWallOI, maxPain, ...} }
// barsByDate: { 'YYYY-MM-DD': [{t,o,h,l,c}] }  H1 bars, UTC
export function checkOISignals(histPair, barsByDate, opts = {}) {
  const { entryHour = 13, eodHour = 20 } = opts;
  const hh = n => String(n).padStart(2, '0');
  const rows = [];

  for (const date of Object.keys(histPair).sort()) {
    const snap = histPair[date];
    const day = barsByDate[date];
    if (!snap || !day || !day.length) continue;

    // Session window only — the hours the system would actually be exposed.
    const sess = day.filter(b => {
      const h = parseInt(b.t.substring(11, 13));
      return h >= entryHour && h <= eodHour;
    }).sort((a, b) => a.t.localeCompare(b.t));
    if (sess.length < 4) continue;

    const entry = sess[0].o, close = sess[sess.length - 1].c;
    const hi = Math.max(...sess.map(b => b.h)), lo = Math.min(...sess.map(b => b.l));
    const rangePct = entry > 0 ? (hi - lo) / entry * 100 : null;
    const retPct = entry > 0 ? (close - entry) / entry * 100 : null;
    if (rangePct == null || retPct == null) continue;

    // Dominant wall = the heavier of call/put wall by OI. Its side relative to
    // the morning spot is the magnet direction.
    let magnetDir = null, magnetDistPct = null;
    const cw = snap.callWall, pw = snap.putWall;
    const cOI = snap.callWallOI ?? 0, pOI = snap.putWallOI ?? 0;
    const spot = snap.spot;
    if (Number.isFinite(spot) && spot > 0) {
      const dom = (cOI >= pOI && Number.isFinite(cw)) ? cw
                : (Number.isFinite(pw) ? pw : (Number.isFinite(cw) ? cw : null));
      if (Number.isFinite(dom) && dom !== spot) {
        magnetDir = dom > spot ? 1 : -1;
        magnetDistPct = Math.abs(dom - spot) / spot * 100;
      }
    }
    // Max pain is the classic pin magnet — tested separately, it is a different claim.
    let mpDir = null;
    if (Number.isFinite(snap.maxPain) && Number.isFinite(spot) && spot > 0 && snap.maxPain !== spot) {
      mpDir = snap.maxPain > spot ? 1 : -1;
    }

    rows.push({
      date, gex: Number.isFinite(snap.gex) ? snap.gex : null,
      absGexBn: Number.isFinite(snap.gex) ? Math.abs(snap.gex) / 1e9 : null,
      rangePct: +rangePct.toFixed(3), retPct: +retPct.toFixed(3),
      magnetDir, magnetDistPct: magnetDistPct == null ? null : +magnetDistPct.toFixed(3),
      mpDir, pcRatio: snap.pcRatio ?? null,
    });
  }

  const withGex = rows.filter(r => r.absGexBn != null);
  const withMag = rows.filter(r => r.magnetDir != null);
  const withMp  = rows.filter(r => r.mpDir != null);

  // G2: does |GEX| relate to realised range? Sign convention: dealers SHORT
  // gamma (gex < 0) should give BIGGER ranges, so signed gex vs range should be
  // NEGATIVE if the mechanism holds.
  const g2 = {
    absGexVsRange: corr(withGex.map(r => r.absGexBn), withGex.map(r => r.rangePct)),
    signedGexVsRange: corr(withGex.map(r => r.gex / 1e9), withGex.map(r => r.rangePct)),
    meanRangeNegGex: null, meanRangePosGex: null,
  };
  const neg = withGex.filter(r => r.gex < 0), pos = withGex.filter(r => r.gex >= 0);
  const mean = a => a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3) : null;
  g2.meanRangeNegGex = { n: neg.length, meanRangePct: mean(neg.map(r => r.rangePct)) };
  g2.meanRangePosGex = { n: pos.length, meanRangePct: mean(pos.map(r => r.rangePct)) };

  // G3: does the magnet direction predict the session's direction?
  const hit = withMag.filter(r => Math.sign(r.retPct) === r.magnetDir).length;
  const mpHit = withMp.filter(r => Math.sign(r.retPct) === r.mpDir).length;
  const g3 = {
    dominantWall: { n: withMag.length, hits: hit,
      hitRatePct: withMag.length ? +(100 * hit / withMag.length).toFixed(1) : null,
      meanSignedRetPct: withMag.length
        ? +(withMag.reduce((s, r) => s + r.magnetDir * r.retPct, 0) / withMag.length).toFixed(4) : null },
    maxPain: { n: withMp.length, hits: mpHit,
      hitRatePct: withMp.length ? +(100 * mpHit / withMp.length).toFixed(1) : null,
      meanSignedRetPct: withMp.length
        ? +(withMp.reduce((s, r) => s + r.mpDir * r.retPct, 0) / withMp.length).toFixed(4) : null },
  };

  return {
    days: rows.length,
    // Stated on every response so a thin sample can never be read as a result.
    sampleWarning: rows.length < 25
      ? `n=${rows.length} — TOO SMALL to conclude anything. Directional hint only; do not act on it.`
      : `n=${rows.length} — enough to see whether a relationship is plausibly present, NOT to validate it.`,
    g2GexVsRange: g2,
    g3MagnetVsDirection: g3,
    rows,
  };
}
