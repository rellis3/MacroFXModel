// js/drawdownShadowCore.js — the drawdown shadow band (forge/DRAWDOWN_FORECAST_ERROR_PREREG.md, amendment A1).
//
// WHY: drawdown-forecast-error (validated 2026-10-22) found the shipped range lines run too narrow after a 20-day
// S&P 500 fall: FX +6.7%, indices +2.8% in the worst fifth (S&P 20d <= about -2%). This module builds the SHADOW
// lines (live ladder x factor on trigger sessions) and scores them beside live. It never changes the live ladder
// (side-by-side rule): pure functions, no I/O.

export const RULE = Object.freeze({
  thresholdPct: -2.0,                         // S&P 20-day log return (%) at or below this = trigger
  factor: Object.freeze({ fx: 1.067, idx: 1.028 }),
  start: '2026-10-23',                        // forward record start (A1)
  judgeAt: 40,                                // trigger sessions before judging
});
export const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
const QS = ['hl', 'oh', 'ol', 'oc'], RS = ['p50', 'p75', 'p90'];

export function classOf(sym) {
  if (INDICES.has(sym)) return 'idx';
  if (/^[A-Z]{6}$/.test(sym) && sym !== 'BTCUSD') return 'fx';
  return null;
}

/** S&P 20-day log return (%) known before a London session: candles = [{t (close time, sec), c}] ascending, complete only. */
export function spx20AsOf(candles, sessionMidnightSec) {
  const known = candles.filter(k => k.t <= sessionMidnightSec);
  if (known.length < 21) return null;
  const a = known[known.length - 1].c, b = known[known.length - 21].c;
  return +(100 * Math.log(a / b)).toFixed(3);
}

export function isTrigger(spx20) { return Number.isFinite(spx20) && spx20 <= RULE.thresholdPct; }

/** The shadow flat ladder: live x factor on trigger sessions, live otherwise. */
export function shadowLadder(sym, liveFlat, spx20) {
  const cls = classOf(sym);
  if (!liveFlat || !cls) return null;
  const f = isTrigger(spx20) ? RULE.factor[cls] : 1;
  const out = {};
  for (const [k, v] of Object.entries(liveFlat)) out[k] = Number.isFinite(v) ? +(v * f).toPrecision(8) : v;
  return { factor: f, flat: out };
}

/** Score one instrument-session: did realised pass each rung, live vs shadow. sess = vol_session instruments[sym]. */
export function scoreRow(sym, liveFlat, sess, spx20) {
  const sh = shadowLadder(sym, liveFlat, spx20);
  if (!sh || !sess || sess.error || !Number.isFinite(sess.hl)) return null;
  const real = { hl: sess.hl, oh: sess.oh, ol: sess.ol, oc: Number.isFinite(sess.oc) ? Math.abs(sess.oc) : null };
  const hit = flat => {
    const o = {};
    for (const q of QS) for (const p of RS) {
      const v = flat[`${q}_${p}`];
      if (Number.isFinite(v) && Number.isFinite(real[q])) o[`${q}_${p}`] = real[q] > v ? 1 : 0;
    }
    return o;
  };
  return { sym, cls: classOf(sym), trigger: isTrigger(spx20), factor: sh.factor, live: hit(liveFlat), shadow: hit(sh.flat) };
}

/** Scorecard over scored rows [{date, rows:[scoreRow]}]: HL p75/p90 exceedance live vs shadow on trigger sessions, per class. */
export function scorecard(days) {
  const out = {};
  for (const cls of ['fx', 'idx']) {
    const rows = days.filter(d => d.trigger).flatMap(d => d.rows.filter(r => r && r.cls === cls).map(r => ({ ...r, date: d.date })));
    const rate = (arm, k) => { const v = rows.map(r => r[arm][k]).filter(x => x === 0 || x === 1); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4) : null; };
    out[cls] = {
      triggerSessions: new Set(rows.map(r => r.date)).size, rows: rows.length,
      hl_p75: { live: rate('live', 'hl_p75'), shadow: rate('shadow', 'hl_p75'), target: 0.25 },
      hl_p90: { live: rate('live', 'hl_p90'), shadow: rate('shadow', 'hl_p90'), target: 0.10 },
      hl_p50: { live: rate('live', 'hl_p50'), shadow: rate('shadow', 'hl_p50'), target: 0.50 },
    };
  }
  const trig = days.filter(d => d.trigger).length;
  return { sessions: days.length, triggerSessions: trig, judgeAt: RULE.judgeAt, ready: trig >= RULE.judgeAt, byClass: out };
}
