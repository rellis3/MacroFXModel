/**
 * OI SHADOW EXECUTOR — paper-trades an OI bot zone plan on 1-minute bars, so two plans
 * (the live CME `oi_bot_zones` and the Cboe-built `oi_bot_zones_cboe`) can be scored by
 * the SAME simulator, side by side, every day. Nothing here places an order.
 *
 * WHY A PORT: the live executor is Python (oi_bot/engine.py + oi_bot.py) on the trading
 * PC. The shadow runs on the server so it needs no second process there and cannot touch
 * the live account. The trigger rules below are a line-for-line port of engine.py —
 * zone_id, already_entered, should_fire, maxpain_stop, make_spec (TP cap + fire-time
 * minRR), priming — plus the executor gates that decide WHICH fired zone becomes a
 * position: opposite guard, stack guard, correlated-group cap, per-mode max hold.
 * If engine.py changes, change this with it (oiShadowExec.test.mjs pins the shared cases).
 *
 * WHAT IT DOES NOT MODEL (so a shadow result reads as a level comparison, not a P&L
 * forecast): spread and slippage, event blackouts, the risk guard / DD lockout, per-pair
 * cooldown, approach-velocity size trims, scale-out runners (one ticket per zone, TP1),
 * plan/OI age gates. Both plans run under the same omissions, so the CME-vs-Cboe
 * DIFFERENCE is fair even though neither number is the live account's.
 *
 * BAR FILLS (1-minute OANDA mid candles):
 *   fade / react — armed above: fires when the bar's high reaches entry − tol; fills at the
 *                  entry (or the open, if the bar gapped through it). Armed below: mirror.
 *   break        — the bar CLOSE must satisfy the trigger on `breakHoldBars` consecutive
 *                  bars (the engine's dwell filter); fills at that close.
 *   maxpain      — evaluated at the bar close (fires on the next live tick in the bot);
 *                  stop re-anchored to that close exactly as make_spec does.
 * EXITS: stop first when a bar spans both stop and target (conservative). On the entry
 * bar only the stop is checked (a touch-entry that runs on through the stop did hit it;
 * whether the target came first inside that minute is unknowable).
 *
 * Pure: no network, no clock, no KV. State is a plain JSON object the server persists.
 */

export const SHADOW_DEFAULTS = {
  touchTolPips: 2,          // oi_bot DEFAULT_CFG touch_tol_pips
  breakHoldBars: 2,         // break_hold_ticks (ticks → 1-minute bars here)
  stackGuardPips: 10,       // stack_guard_pips
  oppositeGuard: true,
  groupCap: 2,              // max_group_positions.index — same-direction index positions
  maxHoldHours: { fade: 48, break: 24, maxpain: 24, react: 24 },
};

const SAME_LEVEL_FRAC = 0.0005;

// Python's f"{x:g}" (6 significant digits, trailing zeros dropped) — the zone_id must
// match the live bot's so a shadow trade and a live trade on one zone share an id.
function fmtG(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e < -4 || e >= 6) {
    const s = x.toExponential(5).replace(/\.?0+e/, 'e');
    return s.replace(/e([+-])(\d)$/, 'e$10$2');
  }
  return String(+x.toPrecision(6));
}

export function zoneId(z) {
  const lvl = z?.level;
  return `${z?.mode}_${z?.side}_${typeof lvl === 'number' ? fmtG(lvl) : String(lvl)}`;
}

function parseZid(zid) {
  const parts = String(zid).split('_');
  if (parts.length < 3) return null;
  const lvl = Number(parts.slice(2).join('_'));
  return Number.isFinite(lvl) ? [parts[0], parts[1], lvl] : null;
}

export function alreadyEntered(z, entered) {
  if (entered.includes(zoneId(z))) return true;
  const lvl = Number(z?.level);
  if (!Number.isFinite(lvl)) return false;
  for (const zid of entered) {
    const p = parseZid(zid);
    if (!p || p[0] !== z.mode || p[1] !== z.side) continue;
    if (z.mode === 'maxpain' || Math.abs(p[2] - lvl) <= SAME_LEVEL_FRAC * Math.abs(lvl)) return true;
  }
  return false;
}

const armAbove = (z, planSpot) => Number(z.entry || 0) >= Number(planSpot || 0);

export function shouldFire(z, px, planSpot, tol = 0) {
  if (z.mode === 'maxpain') {
    const md = Number(z.minDist);
    if (md > 0) {
      const lvl = Number(z.level || 0);
      if (z.side === 'sell') return px - lvl >= md;
      if (z.side === 'buy') return lvl - px >= md;
    }
    return true;
  }
  const entry = Number(z.entry || 0);
  return armAbove(z, planSpot) ? px >= entry - tol : px <= entry + tol;
}

export function maxpainStop(z, px) {
  if (!Number.isFinite(px)) return null;
  const level = Number(z.level), floor = Number(z.slFloor || 0), frac = Number(z.slFrac || 0);
  if (!Number.isFinite(level)) return null;
  let walls = Array.isArray(z.slGuardWalls) && z.slGuardWalls.length ? z.slGuardWalls
    : (z.slGuardWall != null ? [z.slGuardWall] : []);
  walls = walls.map(Number).filter(Number.isFinite);
  const up = z.side === 'buy';
  const cands = [];
  const prot = walls.filter(w => (up ? w < px : w > px));
  if (prot.length) {
    const wall = prot.reduce((b, w) => (Math.abs(px - w) < Math.abs(px - b) ? w : b));
    cands.push(Math.abs(px - wall) + floor);
  }
  if (frac > 0) cands.push(frac * Math.abs(level - px));
  if (!cands.length) {
    const sd = Number(z.slDist);
    if (!Number.isFinite(sd)) return null;
    cands.push(sd);
  }
  const dist = Math.max(floor, Math.min(...cands));
  if (!(dist > 0)) return null;
  return +(up ? px - dist : px + dist).toFixed(6);
}

export function makeSpec(instrument, z, px = null) {
  let entry = Number(z.entry || 0);
  let sl = z.sl != null ? Number(z.sl) : null;
  let anchor = 'plan';
  if (z.mode === 'maxpain' && px != null) {
    const live = maxpainStop(z, px);
    if (live != null) { entry = Number(px); sl = live; anchor = 'live'; }
  }
  let tp = z.tp1 != null ? Number(z.tp1) : z.tp2 != null ? Number(z.tp2) : 0;
  let tpCapped = false;
  const cap = Number(z.tpCapDist);
  if (cap) {
    const d = z.side === 'buy' ? 1 : -1;
    const t2 = tp && (tp - entry) * d > cap ? +(entry + d * cap).toFixed(6) : tp;
    tpCapped = t2 !== tp; tp = t2;
  }
  let rrSkip = null;
  const minRR = Number(z.minRR || 0);
  if (minRR > 0 && tp && sl != null && Math.abs(entry - sl) > 0) {
    const rr = Math.abs(tp - entry) / Math.abs(entry - sl);
    if (rr < minRR) rrSkip = +rr.toFixed(3);
  }
  return { instrument, zoneId: zoneId(z), mode: z.mode, side: z.side, dirUp: z.side === 'buy',
    entry, level: z.level, sl, slAnchor: anchor, tp, tpCapped, rrSkip, regime: z.regime ?? null,
    rationale: z.rationale || '' };
}

// ── State ────────────────────────────────────────────────────────────────────
// book = { sessions: { instr: { spot, chain, zones, primed:{zid:1}, entered:[], streak:{} } },
//          open: [pos], closed: [trade], lastT: { instr: barOpenMs } }
export function emptyBook() { return { sessions: {}, open: [], closed: [], lastT: {} }; }

/**
 * Adopt the current plan slice for one instrument (the bot's _sync_sessions): keep one-shot
 * state while the OI chain is unchanged, reset it on a new chain, then PRIME every fade/
 * break zone price has already gone through (strictly past, tol 0) so nothing retro-enters.
 */
export function syncPlan(book, instr, slice, chain, px) {
  const s = book.sessions[instr] || (book.sessions[instr] = { spot: 0, chain: null, zones: [], primed: {}, entered: [], streak: {} });
  if (slice?.spot) s.spot = Number(slice.spot);
  s.zones = Array.isArray(slice?.zones) ? slice.zones : [];
  if (chain !== s.chain) {
    if (s.chain != null) { s.entered = []; s.primed = {}; s.streak = {}; }
    s.chain = chain;
  }
  if (Number.isFinite(px)) {
    for (const z of s.zones) {
      const zid = zoneId(z);
      if (s.primed[zid] || alreadyEntered(z, s.entered) || z.mode === 'maxpain') continue;
      if (shouldFire(z, px, s.spot, 0) && px !== Number(z.entry || 0)) s.primed[zid] = 1;
    }
  }
  return s;
}

const pnl = (p, px) => (p.dirUp ? px - p.entry : p.entry - px);

function closePos(book, p, px, t, reason) {
  book.open = book.open.filter(x => x !== p);
  const risk = Math.abs(p.entry - p.sl);
  const pts = pnl(p, px);
  book.closed.push({ ...p, exit: +px.toFixed(6), closeT: t, reason, pts: +pts.toFixed(6), r: risk > 0 ? +(pts / risk).toFixed(3) : null });
}

/**
 * One 1-minute bar for one instrument: run exits on its open positions, then entries.
 * `opts.pip` (price units) scales the touch tolerance and the stack guard; `opts.isIndex`
 * puts the instrument under the correlated-group cap; `opts.indexSet` names the others.
 */
export function stepBar(book, instr, bar, opts = {}) {
  const cfg = { ...SHADOW_DEFAULTS, ...(opts.cfg || {}) };
  const pip = Number(opts.pip) || 0;
  const s = book.sessions[instr];
  const { t, o, h, l, c } = bar;

  // Exits (positions opened on earlier bars).
  for (const p of book.open.filter(x => x.instrument === instr && x.openT < t)) {
    const hitS = p.dirUp ? l <= p.sl : h >= p.sl;
    const hitT = p.tp ? (p.dirUp ? h >= p.tp : l <= p.tp) : false;
    if (hitS) { closePos(book, p, p.dirUp ? Math.min(p.sl, o) : Math.max(p.sl, o), t, 'sl'); continue; }
    if (hitT) { closePos(book, p, p.dirUp ? Math.max(p.tp, o) : Math.min(p.tp, o), t, 'tp'); continue; }
    const capH = Number(cfg.maxHoldHours?.[p.mode] || 0);
    if (capH > 0 && (t + 60e3 - p.openT) / 3.6e6 > capH) closePos(book, p, c, t + 60e3, 'time');
  }
  if (!s || !s.zones.length) return [];

  const tol = Number(cfg.touchTolPips || 0) * pip;
  const opened = [];
  for (const z of s.zones) {
    const zid = zoneId(z);
    if (s.primed[zid] || alreadyEntered(z, s.entered)) continue;
    let px = null;                                   // the price the zone fires at, this bar
    if (z.mode === 'maxpain') {
      if (shouldFire(z, c, s.spot, tol)) px = c;
    } else if (z.mode === 'break') {
      const firing = shouldFire(z, c, s.spot, tol);
      s.streak[zid] = firing ? (s.streak[zid] || 0) + 1 : 0;
      if (firing && s.streak[zid] >= Math.max(1, cfg.breakHoldBars | 0)) px = c;
    } else {
      const above = armAbove(z, s.spot), e = Number(z.entry || 0);
      // Gapped through the trigger at the open → the first tick (the open); else the entry.
      if (above && h >= e - tol) px = o >= e - tol ? o : Math.min(e, h);
      else if (!above && l <= e + tol) px = o <= e + tol ? o : Math.max(e, l);
    }
    if (px == null) continue;
    const spec = makeSpec(instr, z, px);
    if (spec.sl == null || spec.rrSkip != null) continue;          // stays armed (engine/executor)
    const fill = z.mode === 'maxpain' ? spec.entry : px;          // maxpain: spec re-anchored to px already
    const want = spec.dirUp;
    const mine = book.open.filter(p => p.instrument === instr);
    if (cfg.oppositeGuard && mine.some(p => p.dirUp !== want)) continue;            // never both ways
    const stackD = Number(cfg.stackGuardPips || 0) * pip;
    if (stackD >= 0 && mine.some(p => p.dirUp === want && Math.abs(p.entry - fill) <= stackD)) continue;
    if (opts.isIndex && cfg.groupCap != null) {
      const same = book.open.filter(p => (opts.indexSet || []).includes(p.instrument) && p.dirUp === want).length;
      if (same >= cfg.groupCap) continue;
    }
    const pos = { ...spec, entry: +fill.toFixed(6), openT: t, chain: s.chain };
    book.open.push(pos);
    s.entered.push(zid);
    opened.push(pos);
    // A touch-entry that ran on through its stop inside the same minute did hit it.
    if (z.mode !== 'maxpain' && z.mode !== 'break') {
      if (pos.dirUp ? l <= pos.sl : h >= pos.sl) closePos(book, pos, pos.sl, t, 'sl');
    }
  }
  return opened;
}

/** Per-day roll-up of closed trades: n, wins, losses, sum R, sum points. */
export function summarize(closed, dayOf = t => new Date(t).toISOString().slice(0, 10)) {
  const by = {};
  for (const tr of closed || []) {
    const d = dayOf(tr.openT);
    const r = by[d] || (by[d] = { n: 0, wins: 0, losses: 0, r: 0, byInstr: {} });
    r.n++; if ((tr.r ?? 0) > 0) r.wins++; else if ((tr.r ?? 0) < 0) r.losses++;
    r.r = +(r.r + (tr.r || 0)).toFixed(3);
    const bi = r.byInstr[tr.instrument] || (r.byInstr[tr.instrument] = { n: 0, r: 0, pts: 0 });
    bi.n++; bi.r = +(bi.r + (tr.r || 0)).toFixed(3); bi.pts = +(bi.pts + (tr.pts || 0)).toFixed(4);
  }
  return by;
}
