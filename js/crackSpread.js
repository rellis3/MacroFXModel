/**
 * The 3-2-1 crack spread: a refiner's margin per barrel. Three barrels of crude
 * in, two of gasoline and one of diesel (heating oil) out. Gasoline and heating
 * oil are quoted in $/gallon; a barrel is 42 gallons.
 *
 *   crack = ((2 * gasoline + 1 * heatingOil) * 42 - 3 * wti) / 3     $/bbl
 *
 * Pure; the server and the study both call it. Series are ascending
 * [{date, value}] (FRED DCOILWTICO, DGASNYH, DHOILNYH). Tested in
 * MD files/CRACK_SPREAD.md (C1-C3).
 */
export function crack321(wti, gasoline, heatingOil) {
  if (![wti, gasoline, heatingOil].every(v => Number.isFinite(v))) return null;
  return ((2 * gasoline + heatingOil) * 42 - 3 * wti) / 3;
}

/** Common-date history: [{date, wti, gasoline, heatingOil, crack}] ascending. */
export function crackHistory({ wti = [], gasoline = [], heatingOil = [] }) {
  const g = new Map(gasoline.map(o => [o.date, o.value])), h = new Map(heatingOil.map(o => [o.date, o.value]));
  const out = [];
  for (const o of wti) {
    if (!g.has(o.date) || !h.has(o.date)) continue;
    const c = crack321(o.value, g.get(o.date), h.get(o.date));
    if (c != null) out.push({ date: o.date, wti: o.value, gasoline: g.get(o.date), heatingOil: h.get(o.date), crack: c });
  }
  return out;
}

/** Where today's crack sits against its own history since `from`: quartiles and a word. */
export function crackContext(hist, from = '2010-01-01') {
  const x = hist.filter(r => r.date >= from).map(r => r.crack).sort((a, b) => a - b);
  if (x.length < 100) return null;
  const q = p => x[Math.floor(p * (x.length - 1))];
  const last = hist[hist.length - 1];
  const pct = x.filter(v => v <= last.crack).length / x.length;
  const word = pct >= 0.95 ? 'a blow-out: refiners are earning several times their usual margin' : pct >= 0.75 ? 'wide: products are tight relative to crude' : pct <= 0.1 ? 'thin: refiners are barely paid to run' : 'ordinary';
  return { last: last.crack, date: last.date, p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), percentile: pct, word };
}
