// The Feed — pure maths for feed.html (routes: js/feedRoutes.js). No fetch, no DOM, no clock.
//
// The shape is C.OG's "options, rates, commodities and liquidity, in one feed" (education/cog-snippets.md §4).
// Three panels are built here; rates and options reuse Surface Lab and the OI dashboard.
//   liquidity:   the Fed balance sheet weekly: level, week / month / year change, and how unusual the week's change is
//   crossAsset:  rolling correlations of daily changes between S&P 500, UST 10y yield, the broad dollar, WTI and gold
//   commodities: sixteen markets placed in their own two-year (104-week) range, ranked
//
// Everything here is a READ: where things are. None of it is a tested signal. The liquidity read in particular was
// tested as a direction signal (G1 net-liquidity tide) and came back null; the page says so next to the table.
//
// Tested in js/feedCore.test.mjs.

const fin = Number.isFinite;
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const r = (v, d = 2) => fin(v) ? +v.toFixed(d) : null;

// Friday of the ISO week a date falls in, so every series lines up on one weekly spine whatever day it prints
// (the H.4.1 is Wednesday, OANDA closes on Friday, FRED dailies skip US holidays).
export const weekKey = d => { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + ((5 - dt.getUTCDay() + 7) % 7)); return dt.toISOString().slice(0, 10); };

// Last observation in each week. Input: Map(date -> value) or [[date, value]].
export function weekly(m) {
  const out = new Map();
  for (const [d, v] of [...m].sort((a, b) => a[0] < b[0] ? -1 : 1)) if (fin(v)) out.set(weekKey(d), v);
  return out;
}

// Position of x inside [lo, hi] of the window, 0..100. The commodities "standing".
export function rangePos(win, x) {
  const a = win.filter(fin); if (!a.length || !fin(x)) return null;
  const lo = Math.min(...a), hi = Math.max(...a);
  return hi > lo ? (x - lo) / (hi - lo) * 100 : 50;
}

// ── Liquidity ────────────────────────────────────────────────────────────────
// rows: [{ key, label, unit, source, map }] with map in the unit shown. Net liquidity is derived:
// balance sheet − TGA − reverse repo. Changes are in the row's unit; zWeek is the latest weekly change scored
// against the last `zWeeks` weekly changes (mean / sd), so a +$40bn week reads differently in 2022 and 2026.
export function liquidity({ walcl, tga, rrp, reserves, sofr, iorb }, { keepWeeks = 156, zWeeks = 156 } = {}) {
  const W = { walcl: weekly(walcl), tga: weekly(tga), rrp: weekly(rrp), reserves: weekly(reserves) };
  // net liquidity on the weeks where all three legs exist
  const net = new Map();
  for (const [w, b] of W.walcl) { const t = W.tga.get(w), p = W.rrp.get(w); if (fin(t) && fin(p)) net.set(w, b - t - p); }
  // the funding-stress spread: SOFR less the rate on reserves, in bp. Weekly mean of the daily spread.
  const spread = new Map();
  if (sofr && iorb) {
    const iorbM = new Map(iorb); const acc = new Map();
    for (const [d, s] of sofr) { const i = iorbM.get(d); if (fin(s) && fin(i)) { const k = weekKey(d); (acc.get(k) ?? acc.set(k, []).get(k)).push((s - i) * 100); } }
    for (const [k, a] of acc) spread.set(k, mean(a));
  }
  const defs = [
    ['walcl', 'Fed balance sheet', '$bn', 'FRED WALCL', W.walcl],
    ['tga', 'Treasury General Account', '$bn', 'FRED WDTGAL', W.tga],
    ['rrp', 'Reverse repo (RRP)', '$bn', 'FRED RRPONTSYD', W.rrp],
    ['reserves', 'Bank reserves', '$bn', 'FRED WRESBAL', W.reserves],
    ['net', 'Net liquidity', '$bn', 'WALCL − TGA − RRP', net],
    ['spread', 'SOFR less IORB', 'bp', 'FRED SOFR, IORB', spread],
  ];
  const rows = [];
  for (const [key, label, unit, source, m] of defs) {
    const ws = [...m.keys()].sort(); if (ws.length < 6) continue;
    const vals = ws.map(w => m.get(w)); const n = vals.length, last = vals[n - 1];
    const chg = k => n > k ? last - vals[n - 1 - k] : null;
    const diffs = []; for (let i = Math.max(1, n - zWeeks); i < n - 1; i++) diffs.push(vals[i] - vals[i - 1]);
    const s = diffs.length > 10 ? sd(diffs) : null;
    const zWeek = s > 0 ? (chg(1) - mean(diffs)) / s : null;
    const tail = ws.slice(-keepWeeks);
    rows.push({ key, label, unit, source, asOf: ws[n - 1], latest: r(last, 1),
      week: r(chg(1), 1), zWeek: r(zWeek, 2), month: r(chg(4), 1), year: r(chg(52), 1),
      pctl: r(rangePos(vals.slice(-keepWeeks), last), 0),
      series: tail.map(w => [w, r(m.get(w), 1)]) });
  }
  return { rows, read: liquidityRead(rows) };
}

// One plain sentence, built only from the numbers: which way net liquidity went and which legs did it.
export function liquidityRead(rows) {
  const g = k => rows.find(x => x.key === k);
  const net = g('net'); if (!net || !fin(net.week)) return null;
  const legs = [];
  const tga = g('tga'), rrp = g('rrp'), bs = g('walcl');
  if (tga && fin(tga.week) && Math.abs(tga.week) >= 5) legs.push(tga.week < 0 ? 'the TGA draining' : 'the TGA rebuilding');
  if (rrp && fin(rrp.week) && Math.abs(rrp.week) >= 5) legs.push(rrp.week < 0 ? 'the RRP falling' : 'the RRP rising');
  if (bs && fin(bs.week) && Math.abs(bs.week) >= 5) legs.push(bs.week < 0 ? 'the balance sheet shrinking' : 'the balance sheet growing');
  const dir = Math.abs(net.week) < 5 ? 'was flat on the week' : (net.week > 0 ? 'rose' : 'fell') + ` $${Math.abs(net.week).toFixed(0)}bn on the week`;
  const z = fin(net.zWeek) && Math.abs(net.zWeek) >= 2 ? `, an unusual week (${net.zWeek > 0 ? '+' : ''}${net.zWeek.toFixed(1)} z)` : '';
  return `Net liquidity ${dir}${legs.length ? ' with ' + (legs.length > 1 ? legs.slice(0, -1).join(', ') + ' and ' + legs.at(-1) : legs[0]) : ''}${z}; it sits ${net.pctl}% of the way up its three-year range.`;
}

// ── Cross-asset rolling correlations ─────────────────────────────────────────
// legs: [{ key, label, map, kind }] kind 'price' -> log return, 'yield' -> change in level (a yield's % change is
// meaningless near zero). Correlation of those daily changes over `window` trading days, sampled weekly.
export const CROSS_LEGS = [['spx', 'S&P 500'], ['ust10', 'UST 10Y yield'], ['dollar', 'Broad dollar index'], ['wti', 'WTI crude'], ['gold', 'Gold']];
export function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
export function crossAsset(legs, { window = 63, keepWeeks = 156 } = {}) {
  const have = legs.filter(l => l.map?.size > window + 5);
  // the date spine is the intersection: a correlation needs both legs to have moved on the same day
  let dates = [...have[0]?.map.keys() ?? []].sort();
  for (const l of have.slice(1)) dates = dates.filter(d => l.map.has(d));
  const chg = {};
  for (const l of have) {
    const v = dates.map(d => l.map.get(d));
    chg[l.key] = v.map((x, i) => i === 0 ? null : l.kind === 'yield' ? x - v[i - 1] : (x > 0 && v[i - 1] > 0 ? Math.log(x / v[i - 1]) : null));
  }
  const pairs = [];
  for (let a = 0; a < have.length; a++) for (let b = a + 1; b < have.length; b++) {
    const A = have[a], B = have[b], byWeek = new Map();
    for (let i = window; i < dates.length; i++) {
      const x = [], y = [];
      for (let j = i - window + 1; j <= i; j++) { const p = chg[A.key][j], q = chg[B.key][j]; if (fin(p) && fin(q)) { x.push(p); y.push(q); } }
      if (x.length >= window * 0.8) byWeek.set(weekKey(dates[i]), pearson(x, y));
    }
    const ws = [...byWeek.keys()].sort(); if (!ws.length) continue;
    const all = ws.map(w => byWeek.get(w)).filter(fin), last = all[all.length - 1];
    const tail = ws.slice(-keepWeeks);
    pairs.push({ a: A.key, b: B.key, label: `${A.label} × ${B.label}`, last: r(last, 2),
      chg13: all.length > 13 ? r(last - all[all.length - 14], 2) : null,
      avg: r(mean(all), 2), pctl: r(all.filter(v => v <= last).length / all.length * 100, 0),
      series: tail.map(w => [w, r(byWeek.get(w), 3)]) });
  }
  // biggest move in the last quarter first: what changed is the news, not what is high
  pairs.sort((p, q) => Math.abs(q.chg13 ?? 0) - Math.abs(p.chg13 ?? 0));
  return { window, legs: have.map(l => ({ key: l.key, label: l.label })), missing: legs.filter(l => !have.includes(l)).map(l => l.key), asOf: dates[dates.length - 1] ?? null, pairs };
}

// ── Commodities: sixteen markets in their own two-year range ─────────────────
// markets: [{ key, label, group, map }] daily closes. Weekly last; a basket row is the equal-weight index of the
// members' weekly log returns. Each cell is that week's position in the trailing 104-week range (0 = low, 100 = high),
// and z is the level's z-score inside the same window. Rows ranked by z, highest first, like the source.
export function commodities(markets, { window = 104, keepWeeks = 104 } = {}) {
  const W = markets.map(m => ({ ...m, w: weekly(m.map) })).filter(m => m.w.size > window / 2);
  // basket: equal-weight chain of weekly log returns across whatever members printed that week
  const weeks = [...new Set(W.flatMap(m => [...m.w.keys()]))].sort();
  const basket = new Map(); let lvl = 100;
  for (let i = 0; i < weeks.length; i++) {
    if (i > 0) {
      const rets = W.map(m => { const a = m.w.get(weeks[i - 1]), b = m.w.get(weeks[i]); return a > 0 && b > 0 ? Math.log(b / a) : null; }).filter(fin);
      if (rets.length) lvl *= Math.exp(mean(rets));
    }
    basket.set(weeks[i], lvl);
  }
  const rows = [...W, { key: 'basket', label: 'Basket (equal wt)', group: 'basket', w: basket }];
  const out = [];
  for (const m of rows) {
    const ws = [...m.w.keys()].sort(), v = ws.map(w => m.w.get(w)), n = v.length;
    const cells = [];
    for (let i = Math.max(0, n - keepWeeks); i < n; i++) {
      const win = v.slice(Math.max(0, i - window + 1), i + 1);
      cells.push([ws[i], r(rangePos(win, v[i]), 0)]);
    }
    const win = v.slice(-window), last = v[n - 1], s = sd(win);
    const lo = Math.min(...win), hi = Math.max(...win);
    out.push({ key: m.key, label: m.label, group: m.group, asOf: ws[n - 1], last: r(last, 4),
      week: n > 1 ? r((last / v[n - 2] - 1) * 100, 2) : null,
      z: s > 0 ? r((last - mean(win)) / s, 2) : null, pos: r(rangePos(win, last), 0),
      posWeek: n > 1 ? r(rangePos(win, last) - rangePos(v.slice(-window - 1, -1), v[n - 2]), 0) : null,
      lo: r(lo, 4), hi: r(hi, 4), median: r([...win].sort((a, b) => a - b)[Math.floor(win.length / 2)], 4),
      // how much of the window it spent above its median: a market can be high now and have lived low
      above: r(win.filter(x => x > [...win].sort((a, b) => a - b)[Math.floor(win.length / 2)]).length / win.length * 100, 0),
      cells, prices: ws.slice(-keepWeeks).map(w => [w, r(m.w.get(w), 4)]) });
  }
  out.sort((a, b) => (b.z ?? -9) - (a.z ?? -9));
  return { window, rows: out, missing: markets.filter(m => !W.find(x => x.key === m.key)).map(m => m.key) };
}
