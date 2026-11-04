/**
 * Phase 4: scoring the desk's morning book against the day (forge/DESK_ANALYST_PIPELINE_PREREG.md).
 *
 * Every rule here is the prereg's, §3:
 *  - eligible day: a full run with a Head book that finished before 08:00 London on its own date;
 *  - live card: LONG/STRONG_LONG (+1) or SHORT/STRONG_SHORT (-1) with levels (open, up.p50, down.p50);
 *  - unit u: the mean of the up and down p50 distances from the open (the day's own forecast scale);
 *  - entry: open of the first M1 bar at or after 08:00 London; exit: close of the last M1 bar before 21:00 London;
 *  - card score R = direction x (exit - entry) / u, clipped to [-3, 3]; a card without bars is counted as missing;
 *  - day score S = size-weighted mean of R over live cards with size > 0;
 *  - controls: a within-day shuffle of the live cards' directions (counts and sizes kept), the single-prompt
 *    control's cards (unweighted), and drift (long every live-card instrument, equal weight);
 *  - race: whichever of entry + u / entry - u is touched first, lean side or not.
 *
 * Pure: the bars are passed in, the clock is the run's own dates, and the randomness is a seeded generator.
 * Tested in js/deskScore.test.mjs.
 */

export const SCORE_VERSION = 1;
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
export const cardDir = rating => DIR[rating] ?? 0;
const STRONG = new Set(['STRONG_LONG', 'STRONG_SHORT']);

/** The UTC ms of a London wall-clock time on a London date (handles GMT and BST). */
export function londonMs(date, hh, mm = 0) {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const h = +parts.find(p => p.type === 'hour').value, m = +parts.find(p => p.type === 'minute').value;
  return guess - ((h - hh) * 60 + (m - mm)) * 60_000;   // London is UTC or UTC+1
}
export const windowFor = date => ({ entryMs: londonMs(date, 8), exitMs: londonMs(date, 21) });

/** Eligibility, prereg §3. */
export function eligible(run) {
  if (!run?.head?.ok || run.mode !== 'full' || !run.date || !run.finishedAt) return { ok: false, why: !run?.head?.ok ? 'no Head book' : run?.mode !== 'full' ? 'not a full run' : 'no date' };
  const fin = Date.parse(run.finishedAt), { entryMs } = windowFor(run.date), dayStart = londonMs(run.date, 0);
  if (!(fin >= dayStart)) return { ok: false, why: 'finished before its own London date' };
  if (!(fin < entryMs)) return { ok: false, why: 'finished after 08:00 London (has seen part of the window)' };
  return { ok: true, why: null };
}

export const unitOf = L => {
  if (!L || !Number.isFinite(L.open) || !Number.isFinite(L.up?.p50) || !Number.isFinite(L.down?.p50)) return null;
  const u = ((L.up.p50 - L.open) + (L.open - L.down.p50)) / 2;
  return u > 0 ? u : null;
};

/**
 * One card against its M1 bars ({time: sec, open, high, low, close}, ascending). Returns null for a card that is not
 * live; { missing: reason } when it is live but cannot be scored.
 */
export function scoreCard(card, bars, { entryMs, exitMs }) {
  const dir = cardDir(card?.rating); if (!dir) return null;
  const u = unitOf(card.levels); if (!u) return { dir, missing: 'no forecast levels' };
  // Amendment A1: entry in [08:00, 09:00) London, exit in [16:00, 21:00) London (grain and soft CFDs close early).
  const inWin = (bars ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs);
  if (!inWin.length) return { dir, u, missing: 'no M1 bars in the window' };
  const first = inWin[0], last = inWin.at(-1);
  if (first.time * 1000 - entryMs >= 60 * 60_000) return { dir, u, missing: 'no bar between 08:00 and 09:00 London' };
  if (exitMs - last.time * 1000 > 5 * 3600_000) return { dir, u, missing: 'no bar between 16:00 and 21:00 London' };
  const entry = first.open, exit = last.close;
  const R = Math.max(-3, Math.min(3, dir * (exit - entry) / u));
  // race: which of entry +/- u is touched first; a bar touching both is unresolved
  let race = 0;
  for (const b of inWin) {
    const up = b.high >= entry + u, dn = b.low <= entry - u;
    if (up && dn) { race = 0; break; }
    if (up || dn) { race = (up ? 1 : -1) === dir ? 1 : -1; break; }
  }
  return { dir, u, entry, exit, R: +R.toFixed(4), race, size: Number.isFinite(card.size) ? card.size : null, strong: STRONG.has(card.rating) };
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const wmean = (xs, ws) => { const W = ws.reduce((s, w) => s + w, 0); return W > 0 ? xs.reduce((s, x, i) => s + x * ws[i], 0) / W : null; };

/** A seeded generator (mulberry32), so every shuffle and bootstrap is reproducible from the prereg's seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Within-day shuffle placebo for the size-weighted day score: directions permuted across the live sized cards. */
export function shufflePlacebo(scored, { B = 2000, seed = 20261103 } = {}) {
  const live = scored.filter(c => c && !c.missing && c.size > 0);
  if (live.length < 2) return null;
  const moves = live.map(c => c.R * c.dir), dirs = live.map(c => c.dir), w = live.map(c => c.size), r = rng(seed), out = new Array(B);
  for (let b = 0; b < B; b++) {
    const d = dirs.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    out[b] = wmean(moves.map((m, i) => Math.max(-3, Math.min(3, m * d[i]))), w);
  }
  return out;
}

/**
 * A whole day. barsByInst: { EURUSD: [M1 bars], ... }. The control's cards are scored the same way (unweighted).
 * Returns the row saved to KV, small enough to keep every day.
 */
export function scoreDay(run, barsByInst, { B = 2000, seed = 20261103 } = {}) {
  const el = eligible(run), win = windowFor(run.date);
  const cards = run.head?.book?.instruments ?? {};
  const rows = {};
  for (const [n, c] of Object.entries(cards)) { const s = scoreCard(c, barsByInst[n], win); if (s) rows[n] = s; }
  const ok = Object.values(rows).filter(s => !s.missing), sized = ok.filter(s => s.size > 0);
  const S = sized.length ? wmean(sized.map(s => s.R), sized.map(s => s.size)) : null;
  const unweighted = ok.length ? mean(ok.map(s => s.R)) : null;
  // drift: long every live-card instrument (equal weight) = mean of the raw move in u
  const drift = ok.length ? mean(ok.map(s => Math.max(-3, Math.min(3, (s.exit - s.entry) / s.u)))) : null;
  const strong = ok.filter(s => s.strong), plain = ok.filter(s => !s.strong);
  const resolved = ok.filter(s => s.race !== 0);
  const plc = shufflePlacebo(Object.values(rows), { B, seed: seed + dayNum(run.date) });
  // the single-prompt control (H2), unweighted, on the same bars
  let control = null;
  const cc = run.control?.ok ? run.control.book?.instruments ?? {} : null;
  if (cc) {
    const cr = Object.entries(cc).map(([n, c]) => scoreCard(c, barsByInst[n], win)).filter(s => s && !s.missing);
    control = { n: cr.length, unweighted: cr.length ? +mean(cr.map(s => s.R)).toFixed(4) : null };
  }
  return {
    version: SCORE_VERSION, date: run.date, runFinishedAt: run.finishedAt, rolesHash: run.rolesHash ?? null,
    eligible: el.ok, why: el.why, window: { entry: new Date(win.entryMs).toISOString(), exit: new Date(win.exitMs).toISOString() },
    live: Object.keys(rows).length, scored: ok.length, missing: Object.entries(rows).filter(([, s]) => s.missing).map(([n, s]) => ({ inst: n, why: s.missing })),
    S: S == null ? null : +S.toFixed(4), unweighted: unweighted == null ? null : +unweighted.toFixed(4), drift: drift == null ? null : +drift.toFixed(4),
    strong: { n: strong.length, mean: strong.length ? +mean(strong.map(s => s.R)).toFixed(4) : null }, plain: { n: plain.length, mean: plain.length ? +mean(plain.map(s => s.R)).toFixed(4) : null },
    race: { resolved: resolved.length, leanFirst: resolved.filter(s => s.race > 0).length },
    placebo: plc ? { mean: +mean(plc).toFixed(4), sd: +Math.sqrt(mean(plc.map(x => (x - mean(plc)) ** 2))).toFixed(4), p95: +quantile(plc, 0.95).toFixed(4) } : null,
    control,
    cards: Object.fromEntries(Object.entries(rows).map(([n, s]) => [n, s.missing ? { dir: s.dir, missing: s.missing } : { dir: s.dir, R: s.R, race: s.race, size: s.size, strong: s.strong, entry: s.entry, exit: s.exit, u: s.u }])),
  };
}
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / 864e5);
export function quantile(a, q) { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }

/** Circular block bootstrap of a statistic over days (prereg: block 21, B 2000). */
export function blockBootstrap(values, stat = mean, { B = 2000, block = 21, seed = 20261103 } = {}) {
  const n = values.length; if (n < 2) return null;
  const r = rng(seed), L = Math.min(block, n), out = new Array(B);
  for (let b = 0; b < B; b++) {
    const s = [];
    while (s.length < n) { const st = Math.floor(r() * n); for (let k = 0; k < L && s.length < n; k++) s.push(values[(st + k) % n]); }
    out[b] = stat(s);
  }
  return { lo: quantile(out, 0.025), hi: quantile(out, 0.975) };
}

/**
 * The running record over saved day rows. Interim and descriptive until the judgement date (prereg §5, §7): it
 * reports the numbers the gate will use, never a verdict.
 */
export function record(days, { seed = 20261103, B = 2000 } = {}) {
  const el = days.filter(d => d.eligible && d.S != null).sort((a, b) => a.date.localeCompare(b.date));
  const S = el.map(d => d.S);
  const ci = blockBootstrap(S, mean, { B, seed });
  const half = Math.floor(el.length / 2);
  const paired = (f) => el.filter(d => f(d) != null).map(f);
  const ctrl = paired(d => (d.control?.unweighted != null && d.unweighted != null ? d.unweighted - d.control.unweighted : null));
  const drift = paired(d => (d.drift != null && d.unweighted != null ? d.unweighted - d.drift : null));
  const conv = paired(d => (d.strong?.mean != null && d.plain?.mean != null ? d.strong.mean - d.plain.mean : null));
  const race = el.reduce((a, d) => ({ r: a.r + (d.race?.resolved ?? 0), l: a.l + (d.race?.leanFirst ?? 0) }), { r: 0, l: 0 });
  const placeboMean = el.length ? mean(el.map(d => d.placebo?.mean ?? 0)) : null;
  return {
    label: 'interim, not judged (forge/DESK_ANALYST_PIPELINE_PREREG.md)',
    eligibleDays: el.length, allDays: days.length,
    S: { mean: S.length ? +mean(S).toFixed(4) : null, ci: ci ? { lo: +ci.lo.toFixed(4), hi: +ci.hi.toFixed(4) } : null,
      firstHalf: half ? +mean(S.slice(0, half)).toFixed(4) : null, secondHalf: half ? +mean(S.slice(half)).toFixed(4) : null, hitDays: S.filter(x => x > 0).length },
    placebo: { meanOfDayMeans: placeboMean == null ? null : +placeboMean.toFixed(4), daySdMean: el.length ? +mean(el.map(d => d.placebo?.sd ?? 0)).toFixed(4) : null },
    vsControl: ctrl.length ? { days: ctrl.length, mean: +mean(ctrl).toFixed(4) } : null,
    vsDrift: drift.length ? { days: drift.length, mean: +mean(drift).toFixed(4) } : null,
    conviction: conv.length ? { days: conv.length, mean: +mean(conv).toFixed(4) } : null,
    race: { resolved: race.r, leanFirstShare: race.r ? +(race.l / race.r).toFixed(3) : null },
  };
}
