/**
 * Signal Journal — pure logic (forge/SIGNAL_JOURNAL_PREREG.md). No I/O.
 *
 * Line touches: the first touch today of each chosen-forecast rung (OH/OL p50, p75, p90 off the London open), with the
 * historical odds that go with it (js/signalJournalOdds.js) and fixed guidance:
 *   final-odds >= 50%  -> "late extreme, usually the last: take profit, don't add"
 *   reach-odds >= 45%  -> "more often goes on than not"
 *   otherwise          -> "no lean"
 * Never an entry call: no fade/continue edge exists at the lines (Evidence Book). Direction comes only from the
 * yield-spread book (entry |z| >= 2.0, exit |z| <= 1.5 or 20 trading days).
 *
 * Scoring at the close: did the touch reach the next rung by 22:00 London; was the touch's extreme the day's last.
 */
import { JOURNAL_ODDS } from './signalJournalOdds.js';
import { howMuchClass } from './howMuch.js';
import { londonParts } from './intradayRange.js';

export const RUNGS = ['p50', 'p75', 'p90'];
const NEXT = { p50: 'p75', p75: 'p90' };
export const MAIN = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
export const YS_ENTRY = 2.0, YS_EXIT = 1.5, YS_MAX_HOLD = 20;

export function hourBucket(londonHour) {
  const k = Math.floor(londonHour) + 1;                 // end-of-hour index, as the odds table
  return k <= 8 ? '00-07' : k <= 13 ? '08-12' : k <= 17 ? '13-16' : k <= 21 ? '17-20' : '21-22';
}

/** Historical odds for a touch of `rung` at `londonHour`. */
export function touchOdds(instrument, rung, londonHour, odds = JOURNAL_ODDS) {
  const cls = howMuchClass(instrument);
  const next = NEXT[rung];
  const r = next ? odds.reach?.[cls]?.[`${rung}_${next}`]?.[hourBucket(londonHour)] : null;
  const f = odds.final?.[cls]?.[String(Math.floor(londonHour))] ?? null;
  return { cls, next: next ?? null, reach: r?.p ?? null, reachN: r?.n ?? 0, final: f?.p ?? null, finalN: f?.n ?? 0 };
}

export function guidance(o) {
  if (o.final != null && o.final >= 0.5) return 'late extreme, usually the last: a place to take profit, not to add';
  if (o.reach != null && o.reach >= 0.45) return 'more often goes on than not';
  return 'no lean';
}

/**
 * First touches today. `bars` = 5-min bars of today's London session (ascending, {t, open, high, low, close}),
 * `open` = the session open, `ladder` = the chosen-forecast ladder ({oh, ol} rungs in % of the open).
 */
export function detectTouches(instrument, bars, open, ladder) {
  const out = [];
  if (!Array.isArray(bars) || !bars.length || !(open > 0) || !ladder?.oh || !ladder?.ol) return out;
  for (const [side, q, sg] of [['up', 'oh', 1], ['dn', 'ol', -1]]) {
    for (const rung of RUNGS) {
      const pct = ladder[q]?.[rung];
      if (!Number.isFinite(pct)) continue;
      const level = open * (1 + sg * pct / 100);
      const k = bars.findIndex(b => sg > 0 ? b.high >= level : b.low <= level);
      if (k < 0) continue;
      const lh = londonParts(bars[k].t).hour;
      const o = touchOdds(instrument, rung, lh);
      const nextPct = o.next ? ladder[q]?.[o.next] : null;
      out.push({ instrument, side, rung, level, t: bars[k].t, londonHour: Math.round(lh * 100) / 100,
                 nextLevel: Number.isFinite(nextPct) ? open * (1 + sg * nextPct / 100) : null,
                 odds: o, guidance: guidance(o) });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Score a touch against the full session's bars: reached the next rung by 22:00, and was its extreme the day's last. */
export function scoreTouch(touch, bars) {
  const up = touch.side === 'up';
  const dayExt = up ? Math.max(...bars.map(b => b.high)) : Math.min(...bars.map(b => b.low));
  const hourEnd = Math.floor(touch.londonHour) + 1;
  const through = bars.filter(b => b.t <= touch.t || londonParts(b.t).hour < hourEnd);
  const extAtHour = up ? Math.max(...through.map(b => b.high)) : Math.min(...through.map(b => b.low));
  return {
    reached: touch.nextLevel == null ? null : (up ? dayExt >= touch.nextLevel : dayExt <= touch.nextLevel),
    final: up ? dayExt <= extAtHour + 1e-12 : dayExt >= extAtHour - 1e-12,
  };
}

/**
 * Yield-spread events from today's plan. `signals` = { pairKey: { z, label } }, `positions` = { LABEL: {...} },
 * `prices` = { LABEL: last price }, `tradingDaysHeld(pos)` -> number.
 */
export function yieldEvents(signals, positions, prices, tradingDaysHeld, directionOf) {
  const ev = [];
  for (const s of Object.values(signals ?? {})) {
    const label = s.label, z = s.z, px = prices?.[label];
    if (!Number.isFinite(z) || !(px > 0)) continue;
    const pos = positions?.[label];
    if (pos) {
      const held = tradingDaysHeld(pos);
      if (Math.abs(z) <= YS_EXIT || held >= YS_MAX_HOLD) ev.push({ kind: 'exit', label, z, price: px, reason: Math.abs(z) <= YS_EXIT ? 'z reverted' : `${YS_MAX_HOLD} days held`, pos });
    } else if (Math.abs(z) >= YS_ENTRY) {
      ev.push({ kind: 'entry', label, z, price: px, dir: directionOf(s) });
    }
  }
  return ev;
}

const pc = v => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function formatDigest(touches, fmtPrice = (n, v) => String(v)) {
  if (!touches.length) return null;
  const lines = ['📏 <b>Line touches (chosen forecast)</b> — odds from 2020-26 history, not entry calls'];
  for (const x of touches) {
    const arrow = x.side === 'up' ? '↑' : '↓';
    const reach = x.odds.next ? `${pc(x.odds.reach)} reach ${x.odds.next}` : 'top rung';
    lines.push(`• <b>${x.instrument}</b> ${arrow}${x.rung} ${fmtPrice(x.instrument, x.level)} at ${String(Math.floor(x.londonHour)).padStart(2, '0')}:${String(Math.round((x.londonHour % 1) * 60)).padStart(2, '0')} · ${reach} · ${pc(x.odds.final)} stay the day's extreme → <i>${x.guidance}</i>`);
  }
  return lines.join('\n');
}

export function formatYield(e, fmtPrice = (n, v) => String(v), stop = null) {
  if (e.kind === 'entry') {
    return `🧭 <b>Yield-spread ENTRY — ${e.label} ${e.dir}</b>\nSpread z ${e.z.toFixed(2)} (entry ≥ ${YS_ENTRY}) · price ${fmtPrice(e.label, e.price)}`
      + (stop ? `\nStop ${fmtPrice(e.label, stop.price)} (${stop.sigma}σ min, how-much rules) · size on the Daily Plan` : '')
      + `\nBook history: +0.24%/trade, 55% wins (1976–2014, untouched) · exit at |z| ≤ ${YS_EXIT} or ${YS_MAX_HOLD} days`;
  }
  const r = e.pos ? (e.pos.dir === 'LONG' ? 1 : -1) * (e.price - e.pos.entry) / e.pos.entry * 100 : null;
  return `✅ <b>Yield-spread EXIT — ${e.label}</b> (${e.reason})\nz ${e.z.toFixed(2)} · price ${fmtPrice(e.label, e.price)}` + (r != null ? ` · trade ${r >= 0 ? '+' : ''}${r.toFixed(2)}% before costs` : '');
}
