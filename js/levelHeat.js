/**
 * LEVEL HEAT — a "hot / cold" tag per OI level, from the gamma-weighted exposure sitting
 * at that price. HOT = a lot of dealer gamma concentrated there (strong hedging → strong
 * pin or strong reaction); COLD = little gamma (far from spot / thin), so the level is
 * mostly paper that price passes through.
 *
 * This is the price-proximity + DTE weighting the walls list lacks: `gexProfile` is
 * already gamma-weighted (each strike's callGex/putGex use its real DTE + IV after the
 * v2/DTE fixes), and gamma peaks at spot and decays with distance — so a level's total
 * gamma exposure IS its "how much does price get defended here, right now" score. A big
 * wall far from spot comes out COLD precisely because its gamma is small today.
 *
 * DISTINCT from probability-of-touch (`oiReachability`): heat = how hard the level is
 * defended if reached; P(touch) = whether price gets there at all. A far level can be
 * COLD (low gamma now) yet still high-P(touch) over a long horizon, and vice-versa. Use
 * both — heat colours the level, P(touch) labels its reachability.
 *
 * Pure, offline-testable. Reuses the stored `gexProfile` (no recompute, no copy).
 */

// gexProfile: [{ strike, callGex, putGex, ... }] (from oi_store `inst.gexProfile`).
// levels: [{ price, type, ... }]. opts: hotFrac / warmFrac thresholds on the 0..1 heat.
// Returns the levels annotated with { heat (0..1 of the peak), heatBucket 'hot'|'warm'|
// 'cold', gammaExposure (the raw call+put gamma $ at the nearest strike) }.
export function levelHeat(gexProfile, levels, { hotFrac = 0.6, warmFrac = 0.25 } = {}) {
  const ls = Array.isArray(levels) ? levels : [];
  const gp = (Array.isArray(gexProfile) ? gexProfile : []).filter(g => Number.isFinite(g?.strike));
  const blank = l => ({ ...l, heat: null, heatBucket: null, gammaExposure: null });
  if (!gp.length) return ls.map(blank);

  const totalAt = g => Math.abs(g.callGex || 0) + Math.abs(g.putGex || 0);   // dealer gamma $ magnitude at a strike
  const maxTot = Math.max(...gp.map(totalAt), 0);
  if (!(maxTot > 0)) return ls.map(blank);

  // Gamma exposure at an arbitrary price: linear-interpolate between the two bracketing
  // strikes (levels like flips sit between strikes), else the nearest.
  const sorted = gp.slice().sort((a, b) => a.strike - b.strike);
  const expoAt = (price) => {
    if (price <= sorted[0].strike) return totalAt(sorted[0]);
    if (price >= sorted[sorted.length - 1].strike) return totalAt(sorted[sorted.length - 1]);
    for (let i = 1; i < sorted.length; i++) {
      if (price <= sorted[i].strike) {
        const a = sorted[i - 1], b = sorted[i], span = b.strike - a.strike;
        const t = span > 0 ? (price - a.strike) / span : 0;
        return totalAt(a) + (totalAt(b) - totalAt(a)) * t;
      }
    }
    return totalAt(sorted[sorted.length - 1]);
  };

  return ls.map(l => {
    if (!Number.isFinite(l?.price)) return blank(l);
    const ge = expoAt(l.price);
    const heat = +(ge / maxTot).toFixed(4);
    return { ...l, heat, heatBucket: heat >= hotFrac ? 'hot' : heat >= warmFrac ? 'warm' : 'cold', gammaExposure: Math.round(ge) };
  });
}

// Contiguous HOT price ZONES (not just per-level tags): scan the gamma-exposure profile
// and merge adjacent strikes at/above `hotFrac` of the peak into bands [lo, hi]. This is
// the "hot zone" shading — the price regions where a reaction is most likely, independent
// of any particular level. Returns [{ lo, hi, peakStrike, peakHeat }] sorted by peakHeat.
export function hotZones(gexProfile, { hotFrac = 0.6 } = {}) {
  const gp = (Array.isArray(gexProfile) ? gexProfile : []).filter(g => Number.isFinite(g?.strike))
    .slice().sort((a, b) => a.strike - b.strike);
  if (!gp.length) return [];
  const totalAt = g => Math.abs(g.callGex || 0) + Math.abs(g.putGex || 0);
  const maxTot = Math.max(...gp.map(totalAt), 0);
  if (!(maxTot > 0)) return [];
  const zones = [];
  let cur = null;
  for (const g of gp) {
    const h = totalAt(g) / maxTot;
    if (h >= hotFrac) {
      if (!cur) cur = { lo: g.strike, hi: g.strike, peakStrike: g.strike, peakHeat: h };
      else { cur.hi = g.strike; if (h > cur.peakHeat) { cur.peakHeat = h; cur.peakStrike = g.strike; } }
    } else if (cur) { zones.push(cur); cur = null; }
  }
  if (cur) zones.push(cur);
  return zones.map(z => ({ lo: +z.lo, hi: +z.hi, peakStrike: +z.peakStrike, peakHeat: +z.peakHeat.toFixed(4) }))
    .sort((a, b) => b.peakHeat - a.peakHeat);
}
