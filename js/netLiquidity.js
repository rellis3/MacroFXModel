// Net Fed liquidity, one definition (Tier-1 brick).
//
// UNITS, as FRED ships them. Verified 2026-10-17 from fredgraph CSV magnitudes:
//   WALCL      Fed total assets       $ MILLIONS   (2026-10-14: 6,755,639)
//   WTREGEN    Treasury General Acct  $ MILLIONS   (2026-10-14:   883,373)
//   RRPONTSYD  Overnight reverse repo $ BILLIONS   (2026-10-16:       0.1; peak ~2,550 in 2022)
//
// Earlier copies assumed WTREGEN was in billions. The 2026-07-02 "WALCL unit fix"
// therefore divided WALCL by 1000 and subtracted TGA still in millions, so the
// result was roughly minus the TGA. Copies that predate that fix subtracted RRP in
// billions from millions, which deletes RRP. Both are wrong; this module is right.
//
// Pure, no I/O. Tests: node js/netLiquidity.test.mjs

export const NET_LIQ_FRED_UNITS = Object.freeze({ WALCL: 'millions', WTREGEN: 'millions', RRPONTSYD: 'billions' });

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Net liquidity in $ billions from raw FRED values (WALCL $M, WTREGEN $M, RRPONTSYD $B). NaN if any input is missing. */
export function netLiquidityBn(walclM, tgaM, rrpB) {
  if (!fin(walclM) || !fin(tgaM) || !fin(rrpB)) return NaN;
  return walclM / 1000 - tgaM / 1000 - rrpB;
}

/** Element-wise over aligned arrays. */
export function netLiquiditySeriesBn(walclM, tgaM, rrpB) {
  return walclM.map((w, i) => netLiquidityBn(w, tgaM[i], rrpB[i]));
}

function median(a) {
  const v = a.filter(fin).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
}

/**
 * Unit sentinel. Returns a list of warnings (empty when the magnitudes look like
 * FRED's units). Ranges: WALCL $M ≥ ~800,000 since 2002; TGA $M ≥ ~3,000 since 2002
 * while TGA in $B never exceeds ~1,900; RRP in $B never exceeds ~2,600.
 */
export function netLiqUnitWarnings({ walcl = [], tga = [], rrp = [] } = {}) {
  const w = [];
  const mw = median(walcl), mt = median(tga);
  const maxR = Math.max(...rrp.filter(fin), -Infinity);
  if (fin(mw) && mw < 100_000) w.push(`WALCL median ${mw} does not look like $ millions`);
  if (fin(mt) && mt < 3_000) w.push(`WTREGEN median ${mt} does not look like $ millions (it looks like $ billions)`);
  if (maxR > 10_000) w.push(`RRPONTSYD max ${maxR} does not look like $ billions (it looks like $ millions)`);
  return w;
}
