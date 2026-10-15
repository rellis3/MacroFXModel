// js/cogLineRead.js: the live read for the C.OG line card. Where is the line's trend, where is Nasdaq's, do they agree, and how much of the last hour's
// Nasdaq move does the line account for at the two-year link? Context only: forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md found the line's turns coincide with
// Nasdaq's but nothing follows in price, and the link explains about 3% of an hour's variance.
//
// Trend state = the causal adaptive zig-zag of forge/COG_TREND_STATE_PREREG.md: it flips only when price retraces theta from its running extreme, with
// theta = k * RMS of the series' 4 h changes over the previous 20 calendar days (at least 10 with data), k = 0.75. A flip is confirmed at that bar, never earlier.
// Inputs share a clock: the line's bars and OANDA M15 bars are both keyed by BAR OPEN time (epoch s). Pure: no fs, no fetch. Tested by js/cogLineRead.test.mjs.

export const CLR = { k: 0.75, rmsDays: 20, minDays: 10, bars4h: 16, step: 900 };

/** theta base per bar: RMS of 4 h changes over the previous 20 calendar days that have data (NaN until 10 of them do). */
export function thetaBase(x, times) {
  const n = x.length, dayOf = i => Math.floor(times[i] / 86400), sums = new Map();
  for (let i = CLR.bars4h; i < n; i++) {
    const a = x[i], b = x[i - CLR.bars4h]; if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = dayOf(i), s = sums.get(d) || { sq: 0, n: 0 }; s.sq += (a - b) ** 2; s.n++; sums.set(d, s);
  }
  // Window = the previous `rmsDays` CALENDAR days (weekends are empty slots) needing at least `minDays` of them with data: exactly what the research code
  // (cog_trend_state.py / cog_pinned_history.py: rolling(20, min_periods=10) over day rows, shifted one day) measured, so the page shows what the study tested.
  const out = new Array(n).fill(NaN), cache = new Map();
  for (let i = 0; i < n; i++) {
    const d = dayOf(i); if (!cache.has(d)) {
      let acc = 0, cnt = 0; for (let v = d - CLR.rmsDays; v < d; v++) { const s = sums.get(v); if (s) { acc += s.sq / s.n; cnt++; } }
      cache.set(d, cnt >= CLR.minDays ? Math.sqrt(acc / cnt) : NaN);
    }
    out[i] = cache.get(d);
  }
  return out;
}

/** Causal zig-zag. Returns {state: +1/-1/NaN per bar, events: [{confirm, extreme, dir}]}. */
export function zigzag(x, base, k = CLR.k) {
  const n = x.length, state = new Array(n).fill(NaN), events = []; let trend = 0, hi = NaN, lo = NaN, hiI = -1, loI = -1, ext = NaN, extI = -1;
  for (let t = 0; t < n; t++) {
    const v = x[t], th = k * base[t]; if (!Number.isFinite(v) || !Number.isFinite(th) || th <= 0) continue;
    if (trend === 0) {
      if (!Number.isFinite(hi)) { hi = lo = v; hiI = loI = t; }
      if (v > hi) { hi = v; hiI = t; } if (v < lo) { lo = v; loI = t; }
      if (v - lo >= th) { trend = 1; events.push({ confirm: t, extreme: loI, dir: 1 }); ext = v; extI = t; }
      else if (hi - v >= th) { trend = -1; events.push({ confirm: t, extreme: hiI, dir: -1 }); ext = v; extI = t; }
    } else if (trend === 1) {
      if (v > ext) { ext = v; extI = t; } else if (ext - v >= th) { trend = -1; events.push({ confirm: t, extreme: extI, dir: -1 }); ext = v; extI = t; }
    } else {
      if (v < ext) { ext = v; extI = t; } else if (v - ext >= th) { trend = 1; events.push({ confirm: t, extreme: extI, dir: 1 }); ext = v; extI = t; }
    }
    if (trend !== 0) state[t] = trend;
  }
  return { state, events };
}

const word = d => (d > 0 ? 'up' : 'down');
const hhmm = s => new Date(s * 1000).toISOString().slice(5, 16).replace('T', ' ') + 'Z';
const ago = h => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);

/** line: {t0, step, bp[] (null allowed), asOf}; nq: [{time (open, s), close}]; history: {constants {corr1h, betaPctPerBp, r2}, days: [{c, b}]}; now: epoch s. */
export function cogLineRead({ line, nq, history, now = Math.floor(Date.now() / 1000) }) {
  if (!line?.bp?.length || !nq?.length) return { ok: false, reason: 'no line or no Nasdaq bars' };
  const step = CLR.step, tStart = Math.min(line.t0, Math.floor(nq[0].time / step) * step), tEnd = Math.max(line.t0 + (line.bp.length - 1) * step, nq[nq.length - 1].time);
  const n = Math.floor((tEnd - tStart) / step) + 1, times = Array.from({ length: n }, (_, i) => tStart + i * step), L = new Array(n).fill(NaN), N = new Array(n).fill(NaN);
  line.bp.forEach((v, i) => { const j = (line.t0 - tStart) / step + i; if (v != null && j >= 0 && j < n) L[j] = v; });
  for (const b of nq) { const j = Math.round((b.time - tStart) / step); if (j >= 0 && j < n && b.close > 0) N[j] = Math.log(b.close); }
  const zl = zigzag(L, thetaBase(L, times)), zn = zigzag(N, thetaBase(N, times));
  const lastIdx = a => { for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return i; return -1; };
  const iL = lastIdx(L), iN = lastIdx(N); if (iL < 0 || iN < 0) return { ok: false, reason: 'no data' };
  const stL = zl.state[iL], stN = zn.state[iN];
  if (!Number.isFinite(stL) || !Number.isFinite(stN)) return { ok: false, reason: 'not enough history to establish a trend yet (needs about two weeks of data)' };
  const evL = zl.events.at(-1), evN = zn.events.at(-1), lineAgeH = (now - (times[iL] + step)) / 3600;
  const asOfLine = times[iL] + step;
  // last-hour attribution: both moves measured over the same four bars ending at the latest bar with both present
  let jb = -1; for (let i = Math.min(iL, iN); i >= 4; i--) if (Number.isFinite(L[i]) && Number.isFinite(N[i]) && Number.isFinite(L[i - 4]) && Number.isFinite(N[i - 4])) { jb = i; break; }
  const c = history?.constants ?? {}, beta = c.betaPctPerBp ?? null;
  const hour = jb >= 0 ? { to: times[jb] + step, lineBp: +(L[jb] - L[jb - 4]).toFixed(1), nqPct: +((N[jb] - N[jb - 4]) * 100).toFixed(3), impliedPct: beta == null ? null : +(beta * (L[jb] - L[jb - 4])).toFixed(3) } : null;
  const recentTurn = evL && now - (times[evL.confirm] + step) < 4 * 3600 ? { dir: evL.dir, at: times[evL.confirm] + step, nqStillOpposite: stN !== evL.dir } : null;
  const roll = history?.days?.length ? history.days[history.days.length - 1] : null;
  const cs = (history?.days ?? []).map(d => d.c).filter(v => v != null).sort((a, b) => a - b), med = cs.length ? cs[Math.floor(cs.length / 2)] : 0, below = cs.length ? cs.filter(v => v < 0).length / cs.length : 0;
  const agree = stL === stN;
  const lines = [
    `Line trend: ${word(stL)} since ${hhmm(times[evL.confirm] + step)} (${ago((now - (times[evL.confirm] + step)) / 3600)}), now ${L[iL].toFixed(1)} bp. Nasdaq trend: ${word(stN)} since ${hhmm(times[evN.confirm] + step)}. They ${agree ? 'agree' : 'disagree'}.`,
    hour ? `Last hour: the line moved ${hour.lineBp >= 0 ? '+' : ''}${hour.lineBp} bp and Nasdaq ${hour.nqPct >= 0 ? '+' : ''}${hour.nqPct}%; at the two-year link (${beta >= 0 ? '+' : ''}${beta}% per bp) the line accounts for about ${hour.impliedPct >= 0 ? '+' : ''}${hour.impliedPct}%, and it explains only about ${((c.r2 ?? 0) * 100).toFixed(0)}% of any hour.` : null,
    recentTurn ? `The line turned ${word(recentTurn.dir)} ${ago((now - recentTurn.at) / 3600)} ago while Nasdaq's trend is ${recentTurn.nqStillOpposite ? 'still ' + word(stN) : 'already ' + word(stN)}. Over two years Nasdaq's trend flips the same way within hours more often after such a turn, but its price has not moved abnormally afterwards.` : null,
    roll?.c != null ? `Rolling 20-day same-hour link: ${roll.c >= 0 ? '+' : ''}${roll.c.toFixed(2)} (over the history it has a median of ${med >= 0 ? '+' : ''}${med.toFixed(2)} and has been below zero on ${(below * 100).toFixed(0)}% of days).` : null,
  ].filter(Boolean);
  return { ok: true, asOf: new Date(asOfLine * 1000).toISOString(), lineAgeHours: +lineAgeH.toFixed(1), stale: lineAgeH > 72,
           line: { state: stL, dir: word(stL), since: times[evL.confirm] + step, bp: L[iL] }, nasdaq: { state: stN, dir: word(stN), since: times[evN.confirm] + step }, agree, lastHour: hour, recentTurn,
           link: { corr20: roll?.c ?? null, beta20: roll?.b ?? null, corr1h: c.corr1h ?? null, betaPctPerBp: beta, r2: c.r2 ?? null }, lines };
}
