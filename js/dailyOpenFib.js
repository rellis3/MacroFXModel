/**
 * Daily-open fib setup: the rule engine for the live tracker (daily-open-fib.html).
 *
 * A line-for-line port of scripts/daily-open-fib-retest/engine.py, the engine the
 * backtest ran on (forge/DAILY_OPEN_FIB_RETEST_PREREG.md, amendment A1: bid/ask
 * fills), so the page tracks exactly the rule that was tested. Verdict on gold
 * 2016-2026: NULL, -0.72R per trade on bid/ask fills
 * (analysis/output/daily-open-fib-retest/RESULTS.md). The page is a forward
 * record, not a signal.
 *
 * The setup (sell side; buy mirrors), minutes counted from the session's first bar
 * (the first M1 bar at/after 17:00 New York):
 *   H, L     running high / low of the BID since the open (the chart the fib is drawn on)
 *   armed    L was set after H, the impulse A - L >= minImp x ADR, minute <= entryCut
 *   the 1    anchor 'high': H, the opening wick (primary); anchor 'do': the open price
 *   entry    sell limit at the 1, filled when the bid high reaches it
 *            (a buy fills when the ASK low reaches the bid-drawn 1)
 *   stop     the 1.2 = A + 0.2 x (A - L)            1R = 0.2 x (A - L)
 *   target   the 0 = the impulse extreme (= 5R); 3R / 2R variants
 *   BE       once +1R is reached, stop to entry from the next bar
 *   exit     stop / target / BE / the open of the first bar at or after exitMin;
 *            a sell closes on the ASK, a buy on the BID
 * Same conservative intrabar rules as the backtest: on the fill bar only the stop can
 * trigger; stop beats target in one bar; the time exit (a bar's open) beats both.
 */

export const DOF_DEFAULTS = { minImp: 0.10, entryCut: 360, exitMin: 540, stopExt: 0.2 };
export const DOF_ANCHORS = ['high', 'do', 'swing'];
export const DOF_TARGETS = ['zero', 3, 2];

/** First index >= start where pred(i) holds, or n. */
function first(n, start, pred) {
  for (let i = Math.max(0, start); i < n; i++) if (pred(i)) return i;
  return n;
}

/** Running extremes and the bar each was last set on (ties count as a new set). */
function running(h, l) {
  const n = h.length, H = new Array(n), L = new Array(n), tH = new Array(n), tL = new Array(n);
  for (let i = 0; i < n; i++) {
    H[i] = i ? Math.max(H[i - 1], h[i]) : h[i];
    L[i] = i ? Math.min(L[i - 1], l[i]) : l[i];
    tH[i] = h[i] >= H[i] ? i : tH[i - 1];
    tL[i] = l[i] <= L[i] ? i : tL[i - 1];
  }
  return { H, L, tH, tL };
}

/**
 * The fill for one session, or null. `chart` = {o,h,l} the fib is drawn on (bid);
 * `buy` = {o,l} the side a buy limit fills on (ask). Port of engine.find_fill.
 */
export function findFill(chart, mins, adr, anchor = 'high', minImp = 0.10, entryCut = 360, buy = null) {
  const { o, h, l } = chart, bl = buy?.l ?? l, bo = buy?.o ?? o, n = h.length;
  if (n < 3) return null;
  const { H, L, tH, tL } = running(h, l), dop = o[0], thr = minImp * adr;
  for (let k = 0; k < n - 1; k++) {
    const j = k + 1, Hp = H[k], Lp = L[k];
    if (mins[j] > entryCut) break;
    const As = anchor === 'high' ? Hp : dop, Ab = anchor === 'high' ? Lp : dop;
    let sArm = tL[k] > tH[k] && As - Lp >= thr, bArm = tH[k] > tL[k] && Hp - Ab >= thr;
    if (anchor === 'do') { sArm = sArm && Lp < dop; bArm = bArm && Hp > dop; }
    // the sell is checked first, as in the backtest (ks <= kb wins a tie)
    if (sArm && h[j] >= As)
      return { side: -1, j, A: As, L0: Lp, entry: Math.max(As, o[j]), imp: (As - Lp) / adr, tExt: tL[k], tAnchor: tH[k] };
    if (bArm && bl[j] <= Ab)
      return { side: 1, j, A: Ab, L0: Hp, entry: Math.min(Ab, bo[j]), imp: (Hp - Ab) / adr, tExt: tH[k], tAnchor: tL[k] };
  }
  return null;
}

/**
 * Anchor 'swing' (owner, 2026-10-29, from the presenter's live charts): the 1 is the swing
 * the impulse LEG started from, which may sit before the open. Walking back from the
 * impulse extreme, keep the highest high seen; stop at the first bar whose low is at
 * least `thr` below it (the swing low before the leg). The 1 = that highest high.
 * Mirrored for an up leg. `pre` = {o,h,l} bars before the open (oldest first, may be empty).
 * Fill, stop, target, BE and exit are the primary rule's; only the 1 moves.
 * Returns the fill (session indices, like findFill) or null; `pendingSwing` gives the
 * live order when nothing has filled.
 */
function legOrigin(H, L, k, side, thr) {
  // H/L = combined (pre + session) high/low arrays, k = index of the impulse extreme
  let best = side < 0 ? H[k] : L[k], at = k;
  for (let i = k - 1; i >= 0; i--) {
    if (side < 0) { if (H[i] > best) { best = H[i]; at = i; } else if (L[i] <= best - thr) break; }
    else { if (L[i] < best) { best = L[i]; at = i; } else if (H[i] >= best + thr) break; }
  }
  return { A: best, at };
}
function swingState(pre, chart, k, adr, minImp) {
  // State as of session bar k. Two candidate legs: down (the 1 = the swing high the move into the session low started
  // from) and up (mirrored from the session high). Either 1 may sit before the open. When both are armed, a leg whose
  // extreme lies inside the other leg is that leg's retrace, not an impulse (price coming back up toward a pre-open 1
  // makes new session highs, but it is still the retrace); otherwise the more recent extreme wins, as in findFill.
  const p = pre.h.length, Hc = pre.h.concat(chart.h), Lc = pre.l.concat(chart.l);
  const { H, L, tH, tL } = running(chart.h.slice(0, k + 1), chart.l.slice(0, k + 1));
  const thr = minImp * adr;
  const dn = legOrigin(Hc, Lc, p + tL[k], -1, thr), up = legOrigin(Hc, Lc, p + tH[k], 1, thr);
  const sOk = dn.A - L[k] >= thr, bOk = H[k] - up.A >= thr;
  let down;
  if (sOk && bOk) down = H[k] < dn.A ? true : L[k] > up.A ? false : tL[k] > tH[k];
  else if (sOk || bOk) down = sOk;
  else down = tL[k] > tH[k];
  const o = down ? dn : up, ext = down ? L[k] : H[k];
  return { down, A: o.A, at: o.at - p, ext, tExt: down ? tL[k] : tH[k], imp: Math.abs(o.A - ext) / adr, ok: down ? sOk : bOk };
}
export function findFillSwing(pre, chart, mins, adr, minImp = 0.10, entryCut = 360, buy = null) {
  const { o, h, l } = chart, bl = buy?.l ?? l, bo = buy?.o ?? o, n = h.length;
  if (n < 3) return null;
  const P = pre ?? { o: [], h: [], l: [] };
  for (let k = 0; k < n - 1; k++) {
    const j = k + 1;
    if (mins[j] > entryCut) break;
    const s = swingState(P, chart, k, adr, minImp);
    if (!s.ok) continue;
    if (s.down && h[j] >= s.A) return { side: -1, j, A: s.A, L0: s.ext, entry: Math.max(s.A, o[j]), imp: s.imp, tExt: s.tExt, tAnchor: s.at };
    if (!s.down && bl[j] <= s.A) return { side: 1, j, A: s.A, L0: s.ext, entry: Math.min(s.A, bo[j]), imp: s.imp, tExt: s.tExt, tAnchor: s.at };
  }
  return null;
}
export function pendingSwing(pre, chart, mins, adr, minImp = 0.10, entryCut = 360) {
  const n = chart.h.length;
  if (!n) return { phase: 'waiting', imp: 0 };
  const k = n - 1;
  if (mins[k] + 1 > entryCut) return { phase: 'no_setup' };
  const s = swingState(pre ?? { o: [], h: [], l: [] }, chart, k, adr, minImp);
  return { phase: s.ok ? 'armed' : 'waiting', side: s.down ? -1 : 1, A: s.A, L0: s.ext, imp: s.imp, need: minImp, tExt: s.tExt, tAnchor: s.at, ...levels(s.down ? -1 : 1, s.A, s.ext) };
}

/**
 * Outcome of one fill. `ex` = {o,h,l} on the EXIT side (ask for a sell, bid for a buy).
 * `final` false means the session is still running: an unresolved trade is 'open'
 * (with its mark-to-market R) rather than closed at the last bar. Port of engine.trade.
 */
export function trade(ex, mins, f, { stopExt = 0.2, target = 'zero', be = true, exitMin = 540, fillSpread = 0, final = true } = {}) {
  const sgn = f.side > 0 ? -1 : 1;            // a buy is a sell on negated prices (high <-> low)
  const O = ex.o.map(v => sgn * v), Hh = (f.side > 0 ? ex.l : ex.h).map(v => sgn * v), Ll = (f.side > 0 ? ex.h : ex.l).map(v => sgn * v);
  const A = sgn * f.A, L0 = sgn * f.L0, entry = sgn * f.entry;
  const leg = A - L0, risk = stopExt * leg, stop = A + risk;
  const tp = target === 'zero' ? L0 : A - Number(target) * risk;
  const j = f.j, n = Hh.length;
  const tExit = first(n, j + 1, i => mins[i] >= exitMin);
  const tStop = first(n, j, i => Hh[i] >= stop);
  const tTp = first(n, j + 1, i => Ll[i] <= tp);
  const tBe = be ? first(n, j + 1, i => Ll[i] <= A - risk) : n;
  const tBeStop = be && tBe < n ? first(n, tBe + 1, i => Hh[i] >= A) : n;
  const ev = [[tExit, 0, 'time'], [tStop, 1, 'stop'], [tBeStop, 2, 'be'], [tTp, 3, 'target']]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let [t, , how] = ev[0], px;
  const toPx = v => sgn * v;
  if (t >= n) {
    if (!final) return { open: true, how: 'open', R: null, beOn: be && tBe < n, risk, leg, stop: toPx(stop), tp: toPx(tp), bars: n - 1 - j };
    how = 'eod'; t = n - 1; px = O[t];
  } else if (how === 'stop') px = t > j ? Math.max(stop, O[t]) : Math.max(stop, entry + fillSpread);
  else if (how === 'be') px = Math.max(A, O[t]);
  else if (how === 'target') px = tp;
  else px = O[t];
  return { open: false, how, R: (entry - px) / risk, t, px: toPx(px), risk, leg, stop: toPx(stop), tp: toPx(tp), bars: t - j };
}

/**
 * Where the setup stands after the last bar when nothing has filled yet: the order
 * that would rest on the NEXT bar, or how far the impulse has got.
 */
export function pending(chart, mins, adr, anchor = 'high', minImp = 0.10, entryCut = 360) {
  const { o, h, l } = chart, n = h.length;
  if (!n) return { phase: 'waiting', imp: 0 };
  const { H, L, tH, tL } = running(h, l), k = n - 1, dop = o[0], thr = minImp * adr;
  const nextMin = mins[k] + 1;
  if (nextMin > entryCut) return { phase: 'no_setup', H: H[k], L: L[k] };
  const down = tL[k] > tH[k];
  const A = anchor === 'high' ? (down ? H[k] : L[k]) : dop;
  const Lx = down ? L[k] : H[k];
  let imp = Math.abs(A - Lx) / adr, ok = imp >= thr / adr;
  if (anchor === 'do') ok = ok && (down ? L[k] < dop : H[k] > dop);
  const lv = levels(down ? -1 : 1, A, Lx);
  return { phase: ok ? 'armed' : 'waiting', side: down ? -1 : 1, A, L0: Lx, imp, need: minImp, H: H[k], L: L[k], tExt: down ? tL[k] : tH[k], tAnchor: down ? tH[k] : tL[k], ...lv };
}

/** The fib lines for a setup with the 1 at A and the 0 at L0. */
export function levels(side, A, L0, stopExt = 0.2) {
  const leg = A - L0, at = r => +(L0 + r * leg).toFixed(6);
  const risk = Math.abs(stopExt * leg);
  return {
    leg: Math.abs(leg), risk,
    fib: { '1.2': at(1.2), '1.1': at(1.1), '1': at(1), '0.786': at(0.786), '0.618': at(0.618), '0.5': at(0.5), '0.382': at(0.382), '0': at(0) },
    stop: at(1.2), tp: at(0), be: at(0.8), r2: at(0.6), r3: at(0.4),   // 1R = 0.2 of the leg: 1R at 0.8, 2R at 0.6, 3R at 0.4
  };
}

/**
 * One session, one anchor: the full picture for the page and the record.
 * S = { t:[ms], mins:[], bid:{o,h,l,c}, ask:{o,h,l,c} } (complete bars only);
 * final = the session has reached exitMin (or ended).
 */
export function night(S, adr, anchor = 'high', opts = {}) {
  const P = { ...DOF_DEFAULTS, ...opts };
  const chart = S.bid, buy = { o: S.ask.o, l: S.ask.l };
  const pre = S.pre ?? { t: [], o: [], h: [], l: [] };
  // a session index; negative = a bar before the open (the swing anchor's 1 can sit there)
  const tAt = i => i == null ? null : i >= 0 ? S.t[i] : pre.t[pre.t.length + i] ?? null;
  const f = anchor === 'swing' ? findFillSwing(pre, chart, S.mins, adr, P.minImp, P.entryCut, buy)
    : findFill(chart, S.mins, adr, anchor, P.minImp, P.entryCut, buy);
  const base = { anchor, adr, do: S.bid.o[0], openT: S.t[0] };
  if (!f) {
    const p = anchor === 'swing' ? pendingSwing(pre, chart, S.mins, adr, P.minImp, P.entryCut) : pending(chart, S.mins, adr, anchor, P.minImp, P.entryCut);
    const phase = P.final || p.phase === 'no_setup' ? 'no_setup' : p.phase;
    return { ...base, ...p, phase, tExt: tAt(p.tExt), tAnchor: tAt(p.tAnchor) };
  }
  const ex = f.side < 0 ? S.ask : S.bid;
  const fillSpread = S.ask.o[f.j] - S.bid.o[f.j];
  const run = (target, be) => trade(ex, S.mins, f, { stopExt: P.stopExt, target, be, exitMin: P.exitMin, fillSpread, final: !!P.final });
  const main = run('zero', true);
  const lv = levels(f.side, f.A, f.L0, P.stopExt);
  const out = {
    ...base, ...lv, side: f.side, A: f.A, L0: f.L0, imp: f.imp,
    tExt: tAt(f.tExt), tAnchor: tAt(f.tAnchor),
    fill: { t: S.t[f.j], px: f.entry, spread: fillSpread, spreadR: fillSpread / lv.risk },
    phase: main.open ? 'filled' : 'closed',
  };
  if (main.open) {
    const k = ex.c.length - 1;
    out.markR = f.side < 0 ? (f.entry - ex.c[k]) / lv.risk : (ex.c[k] - f.entry) / lv.risk;
    out.beOn = main.beOn;
  } else {
    out.exit = { t: S.t[main.t], px: main.px, how: main.how };
    out.R = main.R;
  }
  const v = {};
  for (const [k, tg, be] of [['tp3', 3, true], ['tp2', 2, true], ['noBE', 'zero', false]]) { const r = run(tg, be); v[k] = r.open ? null : r.R; }
  out.Rv = v;
  return out;
}

/** Median of the previous `n` session ranges (the backtest's ADR: Days.adr20). */
export function adrFrom(ranges, n = 20) {
  const r = ranges.slice(-n).filter(Number.isFinite);
  if (r.length < 10) return null;
  const s = [...r].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The session anchor: the most recent 17:00 America/New_York at or before `ms`
 * (DST-safe). Returns epoch ms.
 */
export function sessionAnchor(ms) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  let y = +parts.year, mo = +parts.month, d = +parts.day;
  if (+parts.hour < 17) { const prev = new Date(Date.UTC(y, mo - 1, d) - 86400e3); y = prev.getUTCFullYear(); mo = prev.getUTCMonth() + 1; d = prev.getUTCDate(); }
  return nyWallToUtc(y, mo, d, 17);
}

/** UTC ms of a New York wall-clock time. */
export function nyWallToUtc(y, mo, d, hh) {
  let guess = Date.UTC(y, mo - 1, d, hh + 5);   // EST guess, then correct by the real offset
  for (let i = 0; i < 2; i++) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });
    const h = +fmt.format(new Date(guess));
    guess += (hh - h) * 3600e3;
  }
  return guess;
}

/** Session key = the New York date of the 17:00 anchor, YYYY-MM-DD. */
export function sessionKey(anchorMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(anchorMs));
}

/** Bars (OANDA BA candles, complete only) → the session arrays the engine reads. */
export function sessionFromCandles(candles, anchorMs, maxMin = 1440) {
  const c = candles.filter(x => x.complete !== false && x.bid && x.ask).map(x => ({ t: Date.parse(x.time), b: x.bid, a: x.ask }))
    .filter(x => x.t >= anchorMs && x.t < anchorMs + 86400e3).sort((a, b) => a.t - b.t);
  if (!c.length) return null;
  const t0 = c[0].t, S = { t: [], mins: [], bid: { o: [], h: [], l: [], c: [] }, ask: { o: [], h: [], l: [], c: [] } };
  for (const x of c) {
    const m = Math.round((x.t - t0) / 60e3); if (m > maxMin) break;
    S.t.push(x.t); S.mins.push(m);
    for (const [side, src] of [['bid', x.b], ['ask', x.a]]) { S[side].o.push(+src.o); S[side].h.push(+src.h); S[side].l.push(+src.l); S[side].c.push(+src.c); }
  }
  return S;
}

/** Bid bars in the `hours` before the open (for the swing anchor and the chart), oldest first. */
export function preFromCandles(candles, anchorMs, hours = 6) {
  const c = candles.filter(x => x.complete !== false && x.bid).map(x => ({ t: Date.parse(x.time), b: x.bid }))
    .filter(x => x.t < anchorMs && x.t >= anchorMs - hours * 3600e3).sort((a, b) => a.t - b.t);
  return { t: c.map(x => x.t), o: c.map(x => +x.b.o), h: c.map(x => +x.b.h), l: c.map(x => +x.b.l), c: c.map(x => +x.b.c) };
}

/** Summary of closed trades for one list of night records. */
export function summarise(rows) {
  const tr = rows.filter(r => r.phase === 'closed' && Number.isFinite(r.R));
  const sum = tr.reduce((a, r) => a + r.R, 0);
  const by = h => tr.filter(r => r.exit?.how === h).length;
  let eq = 0, peak = 0, dd = 0;
  for (const r of tr) { eq += r.R; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
  return { nights: rows.length, setups: rows.filter(r => r.phase !== 'no_setup' && r.phase !== 'waiting').length, trades: tr.length,
           targets: by('target'), stops: by('stop'), be: by('be'), time: by('time') + by('eod'),
           totalR: sum, meanR: tr.length ? sum / tr.length : null, maxDD: dd,
           tp3: tr.reduce((a, r) => a + (r.Rv?.tp3 ?? 0), 0), tp2: tr.reduce((a, r) => a + (r.Rv?.tp2 ?? 0), 0), noBE: tr.reduce((a, r) => a + (r.Rv?.noBE ?? 0), 0) };
}
