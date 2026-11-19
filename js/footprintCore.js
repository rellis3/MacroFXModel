// Footprint maths shared by footprint.html and its test (js/footprintCore.test.mjs). Pure functions, no DOM.
//
// Day file (scripts/footprint/footprint_capture.py -> POST /api/footprint/push; finished days are in R2 footprint/days/<SYM>/<day>.json.gz):
//   { v:1, sym, day, rule:'quote'|'tick', tick, base (minutes per stored bar), built, counts, last_trade,
//     bars: [[minuteOfDayUTC, o, h, l, c, [[offTicksFromLow, sell, buy], ...]], ...] }
// sell = volume traded at the bid (aggressive sellers), buy = volume traded at the ask (aggressive buyers).
// Descriptive order flow only. The orderflow-lead study found bar imbalance does not predict the next 5/15 minutes.

// 9 decimals: 6J ticks are 0.0000005, so a coarser round merges neighbouring prices.
export const r9 = x => Math.round(x * 1e9) / 1e9;
export const decimals = tick => { const t = String(Number(tick).toFixed(9)).replace(/0+$/, ''); return Math.max(0, t.length - t.indexOf('.') - 1); };

export function decode(file) {
  const tick = file.tick || 0.25;
  return (file.bars || []).map(([m, o, h, l, c, rows]) => {
    const cells = new Map();
    for (const [off, s, b] of rows) cells.set(r9(l + off * tick), { s, b });
    return { m, o, h, l, c, cells };
  });
}

// Merge stored bars into `minutes`-wide bars (aligned to UTC midnight) and price rows `rowTicks` ticks tall.
export function aggregate(bars, { minutes = 5, rowTicks = 1, tick = 0.25 } = {}) {
  const step = tick * rowTicks, out = new Map();
  for (const b of bars) {
    const k = Math.floor(b.m / minutes) * minutes;
    let a = out.get(k);
    if (!a) out.set(k, a = { m: k, o: b.o, h: b.h, l: b.l, c: b.c, cells: new Map() });
    a.h = Math.max(a.h, b.h); a.l = Math.min(a.l, b.l); a.c = b.c;
    for (const [p, v] of b.cells) {
      const q = r9(Math.floor(r9(p / step)) * step);
      const x = a.cells.get(q) || { s: 0, b: 0 };
      x.s += v.s; x.b += v.b; a.cells.set(q, x);
    }
  }
  return [...out.values()].sort((x, y) => x.m - y.m).map(a => ({ ...a, ...stats(a.cells) }));
}

export function stats(cells) {
  let vol = 0, delta = 0, poc = null, pv = -1, maxCell = 0, buy = 0, sell = 0;
  for (const [p, v] of cells) {
    const t = v.s + v.b; vol += t; buy += v.b; sell += v.s; delta += v.b - v.s;
    if (t > pv || (t === pv && p > poc)) { pv = t; poc = p; }
    maxCell = Math.max(maxCell, v.s, v.b);
  }
  return { vol, delta, buy, sell, poc, maxCell };
}

// Diagonal imbalances, the usual footprint reading: buyers at price p against sellers one row below, and sellers at p
// against buyers one row above. A side with zero on the other diagonal counts once it reaches minVol.
// Returns Map price -> 'buy' | 'sell' | 'both', plus runs of `stack` or more same-side rows in a row.
export function imbalances(cells, { ratio = 3, minVol = 10, rowStep = 0.25, stack = 3 } = {}) {
  const prices = [...cells.keys()].sort((a, b) => a - b), mark = new Map();
  const get = p => cells.get(r9(p)) || { s: 0, b: 0 };
  for (const p of prices) {
    const v = cells.get(p);
    const below = get(p - rowStep).s, above = get(p + rowStep).b;
    const isB = v.b >= minVol && v.b >= ratio * below;
    const isS = v.s >= minVol && v.s >= ratio * above;
    if (isB || isS) mark.set(p, isB && isS ? 'both' : isB ? 'buy' : 'sell');
  }
  const stacks = [];
  for (const side of ['buy', 'sell']) {
    let run = [];
    const flush = () => { if (run.length >= stack) stacks.push({ side, lo: run[0], hi: run.at(-1), n: run.length }); run = []; };
    for (const p of prices) {
      const k = mark.get(p);
      if (k === side || k === 'both') {
        if (run.length && r9(p - run.at(-1)) !== r9(rowStep)) flush();
        run.push(p);
      } else flush();
    }
    flush();
  }
  return { mark, stacks };
}

// Volume profile over a set of bars: POC and the value area (70% by default), grown from the POC one row at a time
// toward the heavier neighbour.
export function profile(bars, { share = 0.7 } = {}) {
  const tot = new Map();
  for (const b of bars) for (const [p, v] of b.cells) {
    const x = tot.get(p) || { s: 0, b: 0 }; x.s += v.s; x.b += v.b; tot.set(p, x);
  }
  const prices = [...tot.keys()].sort((a, b) => a - b);
  if (!prices.length) return { rows: [], poc: null, vah: null, val: null, vol: 0 };
  const vol = prices.reduce((a, p) => a + tot.get(p).s + tot.get(p).b, 0);
  const t = i => tot.get(prices[i]).s + tot.get(prices[i]).b;
  let pi = 0; for (let i = 1; i < prices.length; i++) if (t(i) > t(pi)) pi = i;
  let lo = pi, hi = pi, acc = t(pi);
  while (acc < share * vol && (lo > 0 || hi < prices.length - 1)) {
    const up = hi < prices.length - 1 ? t(hi + 1) : -1, dn = lo > 0 ? t(lo - 1) : -1;
    if (up >= dn) acc += t(++hi); else acc += t(--lo);
  }
  return { rows: prices.map(p => ({ p, ...tot.get(p) })), poc: prices[pi], vah: prices[hi], val: prices[lo], vol };
}

// TPO (Market Profile, Steidlmayer): every `period`-minute slice of the session from `start` gets a letter (A, B, ... Z,
// then a ... z), and each price row the slice traded at (every row from a stored bar's low to its high) gets that letter.
// Counted in time, not volume. POC = the row with most letters (tie -> nearer the middle of the day's range); value area =
// 70% of all letters grown from the POC toward the heavier neighbour, as for volume. Initial balance = the first `ib`
// minutes (A and B on 30-minute letters); `partial` = no trades in A (recording started late), so it is not a real IB.
// Singles = rows only one letter touched.
export const tpoLetter = i => i < 26 ? String.fromCharCode(65 + i) : i < 52 ? String.fromCharCode(71 + i) : '·';
export function tpo(bars, { start = 0, period = 30, step = 0.25, ib = 60, share = 0.7 } = {}) {
  const rows = new Map(), periods = [];
  let ibHi = -Infinity, ibLo = Infinity, open = null, close = null;
  for (const b of bars) {
    if (b.m < start) continue;
    const i = Math.floor((b.m - start) / period);
    const per = periods[i] || (periods[i] = { i, m: start + i * period, hi: -Infinity, lo: Infinity });
    per.hi = Math.max(per.hi, b.h); per.lo = Math.min(per.lo, b.l);
    if (open == null) open = b.o;
    close = b.c;
    if (b.m < start + ib) { ibHi = Math.max(ibHi, b.h); ibLo = Math.min(ibLo, b.l); }
    for (let k = Math.floor(r9(b.l / step)), top = Math.floor(r9(b.h / step)); k <= top; k++) {
      const p = r9(k * step);
      let s = rows.get(p); if (!s) rows.set(p, s = new Set());
      s.add(i);
    }
  }
  const prices = [...rows.keys()].sort((a, b) => a - b);
  const empty = { rows: [], periods: [], poc: null, vah: null, val: null, n: 0, ib: null, open, close, singles: 0 };
  if (!prices.length) return empty;
  const n = i => rows.get(prices[i]).size, total = prices.reduce((a, p) => a + rows.get(p).size, 0);
  const mid = (prices[0] + prices.at(-1)) / 2;
  let pi = 0;
  for (let i = 1; i < prices.length; i++) if (n(i) > n(pi) || (n(i) === n(pi) && Math.abs(prices[i] - mid) < Math.abs(prices[pi] - mid))) pi = i;
  let lo = pi, hi = pi, acc = n(pi);
  while (acc < share * total && (lo > 0 || hi < prices.length - 1)) {
    const up = hi < prices.length - 1 ? n(hi + 1) : -1, dn = lo > 0 ? n(lo - 1) : -1;
    if (up >= dn) acc += n(++hi); else acc += n(--lo);
  }
  const out = prices.map(p => ({ p, letters: [...rows.get(p)].sort((a, b) => a - b) }));
  const dayHi = Math.max(...periods.filter(Boolean).map(x => x.hi)), dayLo = Math.min(...periods.filter(Boolean).map(x => x.lo));
  const ibInfo = isFinite(ibHi) ? { hi: ibHi, lo: ibLo, complete: periods.length * period >= ib, partial: !periods[0], up: dayHi > ibHi, down: dayLo < ibLo } : null;
  return { rows: out, periods: periods.filter(Boolean), poc: prices[pi], vah: prices[hi], val: prices[lo], n: total, ib: ibInfo,
           open, close, singles: out.filter(r => r.letters.length === 1).length, maxN: Math.max(...out.map(r => r.letters.length)) };
}

export function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
