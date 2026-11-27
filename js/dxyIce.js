// js/dxyIce.js: the ICE US Dollar Index (DXY), rebuilt from its six published weights.
//
// Why: the desk's "US dollar index" leg is the Fed's broad trade-weighted dollar (FRED DTWEXBGS).
// That index is good, but it is published weekly, so the newest value is often 5 to 7 days old.
// DXY is a fixed formula on six spot rates, so it can be recomputed from OANDA prices at any moment.
// It is kept beside the Fed index, not instead of it. They are different baskets: DXY is about
// 58% euro and has no yuan or peso.
//
// ICE formula: 50.14348112 x EURUSD^-0.576 x USDJPY^0.136 x GBPUSD^-0.119 x USDCAD^0.091 x USDSEK^0.042 x USDCHF^0.036

export const DXY_CONST = 50.14348112;
export const DXY_WEIGHTS = { eurusd: -0.576, usdjpy: 0.136, gbpusd: -0.119, usdcad: 0.091, usdsek: 0.042, usdchf: 0.036 };

/** DXY from one set of six rates ({eurusd, usdjpy, ...}). Returns null if any leg is missing or not positive. */
export function dxyFrom(px) {
  let v = DXY_CONST;
  for (const [k, w] of Object.entries(DXY_WEIGHTS)) {
    const p = px?.[k];
    if (!(Number.isFinite(p) && p > 0)) return null;
    v *= p ** w;
  }
  return v;
}

/** A daily DXY series on a shared date spine: series = { eurusd: [..], usdjpy: [..], ... }, one entry per date.
 *  A day prints only when all six legs printed that day. Nothing is carried forward, because a stale leg would fake a move. */
export function dxySeries(series, n) {
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const px = {};
    for (const k of Object.keys(DXY_WEIGHTS)) px[k] = series?.[k]?.[i];
    const v = dxyFrom(px);
    out[i] = v == null ? null : +v.toFixed(4);
  }
  return out;
}
