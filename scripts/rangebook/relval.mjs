// Relative-value helpers shared by Study 3 (residual_build.mjs) and the theory-feature
// book (theory_build.mjs): a weighted partner/basket log price on 5-minute buckets,
// per-day target buckets, and the causal 20-day beta + residual sd.
export const B = 300;
export const USD_BASKET = [['eurusd', 0.576, -1], ['usdjpy', 0.136, 1], ['gbpusd', 0.119, -1], ['usdcad', 0.091, 1], ['usdchf', 0.036, 1]];

// series: [{ w, s, p }] (p = packed M1). Returns Map(bucketTime -> Σ (w/Σw)·s·log(close)).
export function partnerLog(series, bucket = B) {
  const wsum = series.reduce((a, { w }) => a + w, 0);
  const maps = series.map(({ p }) => { const m = new Map(); for (let i = 0; i < p.n; i++) m.set(Math.floor(p.times[i] / bucket) * bucket, p.closes[i]); return m; });
  const out = new Map();
  for (const t of maps[0].keys()) {
    let v = 0, ok = true;
    series.forEach(({ w, s }, i) => { const c = maps[i].get(t); if (c == null) ok = false; else v += (w / wsum) * s * Math.log(c); });
    if (ok) out.set(t, v);
  }
  return out;
}

// One London day's 5-minute target buckets that also exist in the partner map.
export function dayBuckets(d, plog) {
  const m = new Map();
  for (const b of d.bars) {
    const t = Math.floor(b.time / B) * B;
    const x = m.get(t); if (x) x.close = b.close; else m.set(t, { t, open: b.open, close: b.close });
  }
  return [...m.values()].filter(x => plog.has(x.t)).map(x => ({ ...x, p: plog.get(x.t) }));
}

const rets = bk => { const r = []; for (let i = 1; i < bk.length; i++) r.push([Math.log(bk[i].close / bk[i - 1].close), bk[i].p - bk[i - 1].p]); return r; };

// Causal day model from the previous days' buckets: OLS beta and residual sd.
export function dayModel(prevBks) {
  const rr = prevBks.flatMap(rets);
  if (rr.length < 500) return null;
  const n = rr.length, mx = rr.reduce((a, [, x]) => a + x, 0) / n, my = rr.reduce((a, [y]) => a + y, 0) / n;
  let sxy = 0, sxx = 0; for (const [y, x] of rr) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const res = rr.map(([y, x]) => y - beta * x), mr = res.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(res.reduce((a, b) => a + (b - mr) ** 2, 0) / (n - 1));
  return sd > 0 ? { beta, sd } : null;
}
