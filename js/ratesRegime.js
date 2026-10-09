// js/ratesRegime.js — "Are rates driving Nasdaq right now?" and "how much of this move is rates?"
//
// Built from the rate-differential research (plans/RATES_NASDAQ_WORKLOG.md, analysis/output/rate_diff_nq/): the ONLY
// relationship that held was the SAME-BAR one, US 2y yield vs Nasdaq, whose strength and SIGN change by regime (it
// flipped in March 2026; daily +0.31 in 1997-2011, +0.09 since). No lead in either direction survived, so nothing here
// forecasts: it says which regime the market is in and attributes a move after it happened.
//
// Input: OANDA M15 bars for the US 2y bond CFD (USB02Y_USD) and NAS100_USD, {time (epoch s), close}.
// Pure: no fetch, no DOM. Tested by js/ratesRegime.test.mjs.

export const RR = { duration: 1.9, windowDays: 20, minBarsPerDay: 20, strong: 0.30, moderate: 0.15, shockSigma: 2.0, flipLookbackDays: 10 };

/** 15-min changes on bars present in BOTH series and exactly 15 min after the previous bar. */
export function pairedChanges(bond, nq, duration = RR.duration) {
  const nqBy = new Map(nq.map(b => [b.time, b.close]));
  const rows = [];
  let prev = null;
  for (const b of bond) {
    const q = nqBy.get(b.time);
    if (q == null || !(b.close > 0) || !(q > 0)) { prev = null; continue; }
    if (prev && b.time - prev.time === 900) {
      rows.push({ time: b.time, date: new Date(b.time * 1000).toISOString().slice(0, 10),
                  dy: -Math.log(b.close / prev.bond) / duration * 1e4,      // bp, + = higher yield
                  dq: Math.log(q / prev.nq) * 100 });                       // %
    }
    prev = { time: b.time, bond: b.close, nq: q };
  }
  return rows;
}

function stats(rows) {
  const n = rows.length;
  if (n < 50) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const r of rows) { sx += r.dy; sy += r.dq; sxx += r.dy * r.dy; syy += r.dq * r.dq; sxy += r.dy * r.dq; }
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2, cxy = sxy / n - (sx / n) * (sy / n);
  if (!(vx > 0) || !(vy > 0)) return null;
  return { corr: cxy / Math.sqrt(vx * vy), beta: cxy / vx, sdY: Math.sqrt(vx), n };   // beta: Nasdaq % per 1 bp
}

/** Trading days with enough joint bars, ascending. */
function goodDays(rows) {
  const by = new Map();
  for (const r of rows) by.set(r.date, (by.get(r.date) ?? 0) + 1);
  return [...by.entries()].filter(([, c]) => c >= RR.minBarsPerDay).map(([d]) => d).sort();
}

export function band(corr) {
  if (corr == null) return { key: 'unknown', strength: 'unknown', direction: null };
  const a = Math.abs(corr);
  const strength = a >= RR.strong ? 'strong' : a >= RR.moderate ? 'moderate' : 'weak';
  const direction = strength === 'weak' ? null : corr < 0 ? 'opposite' : 'together';
  return { key: strength === 'weak' ? 'weak' : `${strength}-${direction}`, strength, direction };
}

/** Rolling same-bar read at each of the last `k` day-ends (for the history strip and flip detection). */
export function dayEndHistory(rows, k = 30) {
  const days = goodDays(rows);
  const out = [];
  for (let i = Math.max(RR.windowDays - 1, days.length - k); i < days.length; i++) {
    const win = new Set(days.slice(i - RR.windowDays + 1, i + 1));
    const s = stats(rows.filter(r => win.has(r.date)));
    if (s) out.push({ date: days[i], corr: +s.corr.toFixed(3), beta: +s.beta.toFixed(4), n: s.n });
  }
  return out;
}

/** The whole read. `now` (epoch s) only matters for staleness. */
export function ratesRegimeRead({ bond, nq, now = Math.floor(Date.now() / 1000) }) {
  const rows = pairedChanges(bond, nq);
  const days = goodDays(rows);
  if (days.length < RR.windowDays) return { ok: false, reason: `only ${days.length} full trading days of joint data (need ${RR.windowDays})` };
  const win = new Set(days.slice(-RR.windowDays));
  const s = stats(rows.filter(r => win.has(r.date)));
  if (!s) return { ok: false, reason: 'not enough joint bars in the window' };
  const hist = dayEndHistory(rows, 30);
  const b = band(s.corr);
  // flip: the sign now differs from flipLookbackDays ago, both beyond 'moderate', and the last 3 day-ends agree with now
  const then = hist.length > RR.flipLookbackDays ? hist[hist.length - 1 - RR.flipLookbackDays] : null;
  const last3 = hist.slice(-3);
  const flipped = !!then && Math.abs(then.corr) >= RR.moderate && Math.abs(s.corr) >= RR.moderate &&
    Math.sign(then.corr) !== Math.sign(s.corr) && last3.length === 3 && last3.every(h => Math.sign(h.corr) === Math.sign(s.corr));
  // attribution: today (UTC) and the last hour, using the window's beta
  const lastRow = rows.at(-1);
  const today = rows.filter(r => r.date === lastRow.date);
  const lastHour = rows.filter(r => r.time > lastRow.time - 3600);
  const attrib = (rs) => {
    const dy = rs.reduce((a, r) => a + r.dy, 0), dq = rs.reduce((a, r) => a + r.dq, 0);
    const expected = s.beta * dy;
    return { yieldBp: +dy.toFixed(2), nasdaqPct: +dq.toFixed(3), explainedPct: +expected.toFixed(3),
             explainedShare: Math.abs(dq) > 0.05 ? +(expected / dq).toFixed(2) : null, bars: rs.length };
  };
  const shockZ = lastRow.dy / s.sdY;
  return {
    ok: true, asOf: new Date(lastRow.time * 1000).toISOString(), stale: now - lastRow.time > 45 * 60,
    window: { days: RR.windowDays, from: days.at(-RR.windowDays), to: days.at(-1), bars: s.n },
    corr: +s.corr.toFixed(3), betaPctPerBp: +s.beta.toFixed(4), yieldSd15mBp: +s.sdY.toFixed(3),
    band: b, flipped, flippedFrom: flipped ? { date: then.date, corr: then.corr } : null,
    history: hist,
    today: attrib(today), lastHour: attrib(lastHour),
    lastBar: { time: new Date(lastRow.time * 1000).toISOString(), yieldBp: +lastRow.dy.toFixed(2), nasdaqPct: +lastRow.dq.toFixed(3), z: +shockZ.toFixed(2),
               shock: Math.abs(shockZ) >= RR.shockSigma },
    read: describe(s, b, flipped),
  };
}

export function describe(s, b, flipped) {
  const c = s.corr.toFixed(2), per = Math.abs(s.beta * 5).toFixed(2);
  if (b.strength === 'weak') return `Rates not driving Nasdaq: the 20-day link is ${c}, near zero. Nasdaq is moving on its own story; a rate move on data matters little for it right now.`;
  const lead = flipped ? 'Regime change. ' : '';
  if (b.direction === 'opposite') return `${lead}Rates ${b.strength === 'strong' ? 'in charge' : 'matter'}: Nasdaq is trading OPPOSITE to US 2-year yields (${c} over 20 days). A 5 bp rise in yields has gone with about −${per}% on Nasdaq in the same 15 minutes; good economic news is bad news for stocks.`;
  return `${lead}Rates and Nasdaq moving TOGETHER (${c} over 20 days): yields rising with stocks, growth-driven. A 5 bp rise in yields has gone with about +${per}% on Nasdaq in the same 15 minutes.`;
}

/** One line attributing a move: how much of Nasdaq's move the rate move accounts for, at the window's beta. */
export function attributionLine(a, label = 'Today') {
  if (!a || a.bars < 2) return `${label}: not enough bars yet.`;
  const sg = v => (v > 0 ? '+' : '') + v;
  const base = `${label}: US 2y ${sg(a.yieldBp.toFixed(1))} bp, Nasdaq ${sg(a.nasdaqPct.toFixed(2))}%; at the current link rates account for about ${sg(a.explainedPct.toFixed(2))}%.`;
  if (a.explainedShare == null) return `${base} Nasdaq has barely moved.`;
  if (a.explainedShare < 0) return `${base} Nasdaq moved AGAINST what rates implied: the move is equity-driven, not rates.`;
  if (a.explainedShare >= 0.7) return `${base} Most of the move is rates.`;
  if (a.explainedShare >= 0.3) return `${base} Rates explain part of it; the rest is equity-specific.`;
  return `${base} Little of the move is rates.`;
}

/** Telegram text for a transition; null when nothing worth sending. */
export function alertText(prev, cur) {
  if (!cur?.ok) return null;
  const lines = [];
  if (cur.flipped && !prev?.flipped) lines.push(`🔄 <b>Rates vs Nasdaq: regime change</b>\nThe 20-day link went from ${cur.flippedFrom.corr.toFixed(2)} (${cur.flippedFrom.date}) to ${cur.corr.toFixed(2)}.`);
  else if (prev?.band?.key && prev.band.key !== cur.band.key) lines.push(`${cur.band.strength === 'strong' ? '🔴' : cur.band.strength === 'weak' ? '⚪' : '🟠'} <b>Rates vs Nasdaq: ${cur.band.key.replace('-', ', ')}</b> (was ${prev.band.key.replace('-', ', ')})`);
  if (cur.lastBar.shock && cur.lastBar.time !== prev?.lastBar?.time && cur.band.strength !== 'weak') {
    lines.push(`⚡ <b>Rate shock</b>: US 2y ${cur.lastBar.yieldBp > 0 ? '+' : ''}${cur.lastBar.yieldBp.toFixed(1)} bp in 15 min (${cur.lastBar.z.toFixed(1)}σ).\n${attributionLine(cur.lastHour, 'Last hour')}\n${attributionLine(cur.today, 'Today')}`);
  }
  if (!lines.length) return null;
  return `${lines.join('\n\n')}\n\n${cur.read}\n<i>Context, not a signal: no lead of rates over Nasdaq was found in testing.</i>`;
}
