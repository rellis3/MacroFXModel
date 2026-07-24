/**
 * Gamma-flow context bricks — the "connecting info" AROUND the gamma flip that a
 * dealer-positioning desk reads on top of the flip level itself (the fade/follow
 * switch). Pure, offline-testable; built on the per-strike GEX profile + per-expiry
 * term structure the OI analyser already produces. No network / DOM / clock.
 *
 *   gammaFlip(gexProfile)                       → the zero-GEX crossing price
 *   distanceToFlip(spot, flip, {atr})           → how far / which side / how deep (the vol read)
 *   flipDrift(series)                           → is the flip migrating TOWARD spot (regime change loading)
 *   rolloffSummary(termStructure, {rollDTE})    → near-expiry OpEx roll-off read
 *
 * NB these are POSITIONING CONTEXT, not validated signals — folklore-tier edge,
 * partial on FX. They describe where dealer hedging pressure sits; they don't assert
 * it pays. Charm/vanna (the vol-conditional siblings) need a real implied-vol surface
 * and are deliberately NOT here — this module is the no-new-data layer.
 */

// Zero-gamma crossing: the first strike where net GEX flips sign — the regime
// boundary (above = long-gamma/dampening, below = short-gamma/amplifying). Picks the
// side of the crossing whose |netGex| is nearer zero. Pure fn of the profile.
export function gammaFlip(gexProfile) {
  const gp = Array.isArray(gexProfile) ? gexProfile : [];
  for (let i = 1; i < gp.length; i++) {
    const a = gp[i - 1]?.netGex, b = gp[i]?.netGex;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.sign(a) !== 0 && Math.sign(b) !== Math.sign(a)) {
      return Math.abs(b) < Math.abs(a) ? gp[i].strike : gp[i - 1].strike;
    }
  }
  return null;
}

// Distance from spot to the flip: absolute, % of spot, and (if an ATR is supplied)
// in ATRs — the "how deep into +/− gamma" vol read. `side` = which regime spot sits
// in (positive = above the flip, long gamma/dampening; negative = below, short
// gamma/amplifying). `near` flags "one push from flipping".
export function distanceToFlip(spot, flip, { atr = null } = {}) {
  if (!(spot > 0) || !Number.isFinite(flip)) return null;
  const abs = spot - flip;
  const pct = (abs / spot) * 100;
  const inAtr = (atr > 0) ? abs / atr : null;
  const side = abs > 0 ? 'positive' : abs < 0 ? 'negative' : 'at';
  const near = inAtr != null ? Math.abs(inAtr) < 0.5 : Math.abs(pct) < 0.25;
  const zone = near ? 'near-flip' : (side === 'positive' ? 'deep-positive' : 'deep-negative');
  return { abs: +abs.toFixed(6), pct: +pct.toFixed(3),
    atr: inAtr != null ? +inAtr.toFixed(2) : null, side, zone, near };
}

// Flip drift: given chronological [{date, flip, spot}] (oldest → newest), is the
// flip migrating TOWARD spot (the gap closing = regime change loading) or away?
// Compares the last two dated points.
export function flipDrift(series) {
  const s = (Array.isArray(series) ? series : []).filter(x => Number.isFinite(x?.flip) && x?.spot > 0);
  if (s.length < 2) return null;
  const cur = s[s.length - 1], prev = s[s.length - 2];
  const gapNow = Math.abs(cur.spot - cur.flip), gapPrev = Math.abs(prev.spot - prev.flip);
  const closing = gapNow < gapPrev;
  return { deltaFlip: +(cur.flip - prev.flip).toFixed(6), gapNow: +gapNow.toFixed(6),
    gapPrev: +gapPrev.toFixed(6), closing, toward: closing,
    fromDate: prev.date ?? null, toDate: cur.date ?? null };
}

// OpEx roll-off: the near expiry's share of OI, whether it's about to roll off, and
// where the NEXT expiry pins (so the post-expiry pin migration is visible). Input is
// termStructure = [{dte, maxPain, callWall, putWall, totalOI}] (any order).
export function rolloffSummary(termStructure, { rollDTE = 2 } = {}) {
  const ts = (Array.isArray(termStructure) ? termStructure : []).filter(e => Number.isFinite(e?.dte));
  if (!ts.length) return null;
  const sorted = ts.slice().sort((a, b) => a.dte - b.dte);
  const near = sorted[0], next = sorted[1] || null;
  const totalOI = sorted.reduce((s, e) => s + (e.totalOI || 0), 0) || 1;
  const pinShift = next && Number.isFinite(near.maxPain) && Number.isFinite(next.maxPain)
    ? +(next.maxPain - near.maxPain).toFixed(6) : null;
  return { nearDTE: near.dte, nearMaxPain: near.maxPain ?? null,
    nearShare: +((near.totalOI || 0) / totalOI).toFixed(3),
    nextDTE: next?.dte ?? null, nextMaxPain: next?.maxPain ?? null,
    pinShift, rollingSoon: near.dte <= rollDTE, nExpiries: sorted.length };
}
